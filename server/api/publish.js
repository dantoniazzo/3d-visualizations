import express, { Router } from "express";

import { publishOptions } from "../../shared/publishOptions.js";
import { bakeAvailability, bakeStatus, startBake } from "../publish/bake.js";
import { addRuntime, latestManifest, listVersions, publishSnapshot, versionManifest } from "../publish/store.js";

/**
 * Publishing a space's public view: POST the snapshot the editor builds —
 * with the options it was made with in X-Publish-Options — and get back the
 * manifest of the new version. A publish that asks for baked lighting
 * starts the bake too, when this server may run one (publish/bake.js).
 *
 * Every version is kept; they can be listed, opened by version, and baked
 * after the fact.
 */
export const publishRouter = Router();

const handle = (route) => async (req, res, next) => {
    try {
        await route(req, res);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        next(error);
    }
};

publishRouter.post(
    "/:id/publish",
    express.raw({ type: "model/gltf-binary", limit: "400mb" }),
    handle(async (req, res) => {
        if (!Buffer.isBuffer(req.body) || !req.body.length) {
            return res.status(400).json({ error: "Send the snapshot as model/gltf-binary." });
        }
        let requested = {};
        try {
            requested = JSON.parse(req.get("X-Publish-Options") || "{}");
        } catch {
            return res.status(400).json({ error: "X-Publish-Options isn't valid JSON." });
        }
        const options = publishOptions(requested);
        const manifest = await publishSnapshot(req.params.id, req.body, { ...options, bake: "off" });

        // The version is published unbaked either way; a bake, if asked
        // for and allowed, adds its lighting when it is done.
        let bake = null;
        if (options.bake !== "off") {
            const availability = bakeAvailability(req);
            bake = availability.available
                ? startBake(req.params.id, manifest.version, options.bake)
                : { state: "unavailable", error: availability.reason };
        }
        res.json({ ...manifest, bake });
    })
);

publishRouter.get(
    "/:id/published",
    handle(async (req, res) => {
        const manifest = req.query.version
            ? await versionManifest(req.params.id, String(req.query.version))
            : await latestManifest(req.params.id);
        if (!manifest) return res.status(404).json({ error: "Not published yet." });
        res.json(manifest);
    })
);

/**
 * A version's runtime file — collision, materials, glass — which the editor
 * sends straight after the snapshot (Publish/Runtime.js).
 */
publishRouter.put(
    "/:id/versions/:version/runtime",
    express.raw({ type: "model/gltf-binary", limit: "200mb" }),
    handle(async (req, res) => {
        if (!Buffer.isBuffer(req.body) || !req.body.length) {
            return res.status(400).json({ error: "Send the runtime file as model/gltf-binary." });
        }
        res.json(await addRuntime(req.params.id, req.params.version, req.body));
    })
);

/** Every version, newest first, and whether this server can bake. */
publishRouter.get(
    "/:id/versions",
    handle(async (req, res) => {
        const [versions, latest] = await Promise.all([listVersions(req.params.id), latestManifest(req.params.id)]);
        res.json({
            latest: latest?.version ?? null,
            versions,
            bake: { ...bakeAvailability(req), job: bakeStatus(req.params.id) },
        });
    })
);

/** Bake, or re-bake, a version already published. Body: { quality: "draft" | "final" }. */
publishRouter.post(
    "/:id/versions/:version/bake",
    handle(async (req, res) => {
        const manifest = await versionManifest(req.params.id, req.params.version);
        if (!manifest) return res.status(404).json({ error: "No such version." });
        const availability = bakeAvailability(req);
        if (!availability.available) return res.status(403).json({ error: availability.reason });
        res.json(startBake(req.params.id, manifest.version, req.body?.quality === "draft" ? "draft" : "final"));
    })
);

/** How the bake running, or last run, for a space is getting on. */
publishRouter.get(
    "/:id/bake",
    handle(async (req, res) => {
        res.json({ ...bakeAvailability(req), job: bakeStatus(req.params.id) });
    })
);

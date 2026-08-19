import { Router } from "express";

import { generateScene } from "../ai/generator.js";
import { readScene, writeScene } from "../store/sceneStore.js";
import { MAX_CONCURRENT_GENERATIONS } from "../config.js";
import { hasCredentials, NO_CREDENTIALS_MESSAGE } from "../ai/credentials.js";

export const generateRouter = Router();

let inFlight = 0;

/**
 * POST /api/generate
 *   { brief: "a furnished 2-bed apartment ..." }              -> new scene
 *   { id: "riverside-flat", instruction: "make it darker" }   -> revision
 *
 * Saves the result and returns the stored record.
 */
generateRouter.post("/", async (req, res) => {
    const { brief, id, instruction, save = true } = req.body || {};

    if (!brief && !instruction) {
        return res
            .status(400)
            .json({ error: "Provide either a `brief` for a new scene or an `instruction` to revise one." });
    }

    if (instruction && !id) {
        return res.status(400).json({ error: "Revising needs the `id` of the scene to change." });
    }

    if (!hasCredentials()) {
        return res.status(503).json({ error: NO_CREDENTIALS_MESSAGE });
    }

    if (inFlight >= MAX_CONCURRENT_GENERATIONS) {
        return res
            .status(429)
            .json({ error: "Another scene is being generated right now. Try again in a moment." });
    }

    inFlight++;
    try {
        let previous;
        if (instruction) {
            const record = await readScene(id);
            if (!record) return res.status(404).json({ error: "Scene not found." });
            previous = record.scene;
        }

        const { scene, notes, usage } = await generateScene({ brief, previous, instruction });

        if (!save) {
            return res.json({ scene, notes, usage, saved: false });
        }

        const record = await writeScene({
            // Revisions overwrite in place; new briefs get a fresh id.
            id: instruction ? id : undefined,
            scene,
            brief: brief || previous?.brief,
            notes,
        });

        res.json({ ...record, usage, saved: true });
    } catch (error) {
        console.error("[generate]", error);
        const { status, message } = describeError(error);
        res.status(status).json({ error: message });
    } finally {
        inFlight--;
    }
});

/**
 * Turn an SDK error into something worth showing a user.
 *
 * The raw messages are JSON blobs from the API; the two that actually
 * happen in practice — no credits, and bad credentials — both have a
 * concrete fix worth naming.
 */
function describeError(error) {
    const raw = String(error?.message ?? "");

    if (/credit balance is too low/i.test(raw)) {
        return {
            status: 402,
            message:
                "Your Anthropic account has no API credits. A Claude subscription covers Claude Code and claude.ai, but generation here bills the API separately — add credits at console.anthropic.com, or set an ANTHROPIC_API_KEY for an account that has them.",
        };
    }

    if (error?.status === 401 || /authentication/i.test(raw)) {
        return {
            status: 502,
            message:
                "Anthropic rejected the credentials. Run `ant auth login` again, or set ANTHROPIC_API_KEY in .env.",
        };
    }

    if (error?.status === 403 || /permission/i.test(raw)) {
        return {
            status: 502,
            message: "These credentials do not have access to the API for this workspace.",
        };
    }

    if (error?.status === 429 || /rate limit/i.test(raw)) {
        return { status: 429, message: "Anthropic rate limit hit. Try again shortly." };
    }

    return { status: 500, message: raw || "Generation failed." };
}

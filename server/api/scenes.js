import { Router } from "express";

import { listScenes, readScene, writeScene, deleteScene } from "../store/sceneStore.js";
import { validateScene } from "../scene/validate.js";

export const scenesRouter = Router();

scenesRouter.get("/", async (_req, res, next) => {
    try {
        res.json({ scenes: await listScenes() });
    } catch (error) {
        next(error);
    }
});

scenesRouter.get("/:id", async (req, res, next) => {
    try {
        const record = await readScene(req.params.id);
        if (!record) return res.status(404).json({ error: "Scene not found." });
        // Normalise on the way out too, so a spec saved by an older build
        // reaches the editor already migrated.
        res.json({ ...record, scene: validateScene(record.scene).scene });
    } catch (error) {
        next(error);
    }
});

/** Save a hand-authored or hand-edited scene. */
scenesRouter.put("/:id", async (req, res, next) => {
    try {
        const { scene, notes } = validateScene(req.body?.scene);
        const record = await writeScene({
            id: req.params.id,
            scene,
            brief: req.body?.brief,
            notes,
        });
        res.json(record);
    } catch (error) {
        if (error.message?.startsWith("Invalid scene id")) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
});

scenesRouter.delete("/:id", async (req, res, next) => {
    try {
        const removed = await deleteScene(req.params.id);
        if (!removed) return res.status(404).json({ error: "Scene not found." });
        res.status(204).end();
    } catch (error) {
        next(error);
    }
});

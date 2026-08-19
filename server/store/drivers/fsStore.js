/**
 * Scene storage on the local filesystem — the default, and what `npm run seed`
 * writes to. Deployments on a read-only or ephemeral filesystem use the
 * S3-compatible driver instead; see ../sceneStore.js.
 */
import fs from "fs/promises";
import path from "path";

import { slugify, assertSlug } from "../ids.js";

const SCENES_DIR = process.env.SCENES_DIR || path.join(process.cwd(), "scenes");

/** Reject anything that could escape the scenes directory. */
function resolveFile(id) {
    assertSlug(id);
    return path.join(SCENES_DIR, `${id}.json`);
}

async function ensureDir() {
    await fs.mkdir(SCENES_DIR, { recursive: true });
}

export async function listScenes() {
    await ensureDir();
    const files = await fs.readdir(SCENES_DIR);
    const scenes = [];

    for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
            const raw = JSON.parse(await fs.readFile(path.join(SCENES_DIR, file), "utf8"));
            scenes.push({
                id: file.replace(/\.json$/, ""),
                name: raw.name || file,
                summary: raw.summary || "",
                brief: raw.brief || "",
                updated_at: raw.updated_at || null,
                rooms: raw.scene?.rooms?.length ?? 0,
                objects: raw.scene?.objects?.length ?? 0,
            });
        } catch {
            // A malformed file shouldn't take down the whole listing.
        }
    }

    scenes.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return scenes;
}

export async function readScene(id) {
    try {
        return JSON.parse(await fs.readFile(resolveFile(id), "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

/** Write a scene, generating a unique id from its name when none is given. */
export async function writeScene({ id, scene, brief, notes }) {
    await ensureDir();

    let sceneId = id;
    if (!sceneId) {
        const base = slugify(scene.name);
        sceneId = base;
        let n = 2;
        while (await readScene(sceneId)) {
            sceneId = `${base}-${n++}`;
        }
    }

    const record = {
        id: sceneId,
        name: scene.name,
        summary: scene.summary,
        brief: brief || "",
        notes: notes || [],
        updated_at: new Date().toISOString(),
        scene,
    };

    await fs.writeFile(resolveFile(sceneId), JSON.stringify(record, null, 2), "utf8");
    return record;
}

export async function deleteScene(id) {
    try {
        await fs.unlink(resolveFile(id));
        return true;
    } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
    }
}

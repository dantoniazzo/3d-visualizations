/**
 * Published public views, kept on this machine's disk.
 *
 * Publishing (frontend/Experience/Publish/) sends the snapshot of a space —
 * its visible triangles, merged — with the spec it was made from inside it,
 * and the options it was made with (shared/publishOptions.js). Each publish
 * is a new, fixed version:
 *
 *   published/<scene>/manifest.json            the latest version, read by /view/<scene>
 *   published/<scene>/<version>/manifest.json  that version, read by /view/<scene>?version=<version>
 *   published/<scene>/<version>/snapshot.glb   as sent: the bake's input
 *   published/<scene>/<version>/spec.json      the space as it was published
 *   published/<scene>/<version>/view.glb       what the public view downloads
 *   published/<scene>/<version>/runtime.glb    and what it collides with, its materials and glass
 *   published/<scene>/<version>/bake-<id>/     its baked lighting, once baked
 *
 * The two manifests of the latest version are the same record; paths in
 * them are relative to the scene's folder.
 *
 * Local only for now: a deployment keeps its files on the container's own
 * disk, which a restart loses.
 */
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { publishOptions, versionDate } from "../../shared/publishOptions.js";
import { assertSlug } from "../store/ids.js";
import { compressRuntime, compressView } from "./compress.js";

export const PUBLISH_DIR = path.resolve(process.env.PUBLISH_DIR || path.join(process.cwd(), "published"));

const VERSION = /^\d{8}T\d{6}Z$/;

export function assertVersion(version) {
    if (!VERSION.test(version)) throw Object.assign(new Error(`Invalid version: ${version}`), { status: 400 });
    return version;
}

/**
 * @param {string} sceneId
 * @param {Buffer} glb  the snapshot as built in the browser
 * @param {object} [options]  what it was made with (shared/publishOptions.js)
 * @returns {Promise<object>} the new manifest
 */
export async function publishSnapshot(sceneId, glb, options = {}) {
    assertSlug(sceneId);
    const extras = readSceneExtras(glb);
    if (!extras?.spec) throw Object.assign(new Error("Not a public-view snapshot."), { status: 400 });
    options = publishOptions(options);

    const version = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const dir = path.join(PUBLISH_DIR, sceneId, version);
    await mkdir(dir, { recursive: true });

    const view = await compressView(glb, { draco: options.compress });
    await Promise.all([
        writeFile(path.join(dir, "snapshot.glb"), glb),
        writeFile(path.join(dir, "spec.json"), JSON.stringify(extras.spec)),
        writeFile(path.join(dir, "view.glb"), view),
    ]);

    const manifest = {
        id: sceneId,
        version,
        publishedAt: new Date().toISOString(),
        options,
        spec: `${version}/spec.json`,
        view: `${version}/view.glb`,
        snapshot: `${version}/snapshot.glb`,
        levels: extras.levels,
        birdView: extras.birdView,
        stats: extras.stats,
        sizes: { snapshot: glb.length, view: view.length },
    };
    await writeJson(path.join(dir, "manifest.json"), manifest);
    await writeJson(path.join(PUBLISH_DIR, sceneId, "manifest.json"), manifest);
    return manifest;
}

/**
 * Add a version's runtime file (frontend/Experience/Publish/Runtime.js),
 * sent after its snapshot: with it, the public view builds nothing of the
 * house itself.
 *
 * @returns {Promise<object>} the updated manifest
 */
export async function addRuntime(sceneId, version, glb) {
    const manifest = await versionManifest(sceneId, version);
    if (!manifest) throw Object.assign(new Error("No such version."), { status: 404 });
    const { glb: runtime, collision } = await compressRuntime(glb, { draco: manifest.options?.compress !== false });
    await writeFile(path.join(PUBLISH_DIR, sceneId, version, "runtime.glb"), runtime);
    return updateVersion(sceneId, version, {
        runtime: `${version}/runtime.glb`,
        collision,
        sizes: { ...manifest.sizes, runtime: runtime.length },
    });
}

/** The latest published version of a space, or null. */
export async function latestManifest(sceneId) {
    assertSlug(sceneId);
    return readJson(path.join(PUBLISH_DIR, sceneId, "manifest.json"));
}

/** One published version of a space, or null. */
export async function versionManifest(sceneId, version) {
    assertSlug(sceneId);
    assertVersion(version);
    const file = path.join(PUBLISH_DIR, sceneId, version, "manifest.json");
    const manifest = await readJson(file);
    if (manifest) return manifest;
    // Published before versions kept a manifest of their own: work out
    // what it was from its files, and keep that.
    const rebuilt = await rebuildManifest(sceneId, version);
    if (rebuilt) await writeJson(file, rebuilt);
    return rebuilt;
}

/** Every published version of a space, newest first. */
export async function listVersions(sceneId) {
    assertSlug(sceneId);
    const entries = await readdir(path.join(PUBLISH_DIR, sceneId)).catch(() => []);
    const versions = entries.filter((entry) => VERSION.test(entry)).sort().reverse();
    const manifests = await Promise.all(versions.map((version) => versionManifest(sceneId, version)));
    return manifests.filter(Boolean);
}

/**
 * Change a version's record — a bake adds its lighting — in its own
 * manifest, and in the scene's if it is still the latest.
 *
 * @returns {Promise<object>} the updated manifest
 */
export async function updateVersion(sceneId, version, changes) {
    const manifest = { ...(await versionManifest(sceneId, version)), ...changes };
    await writeJson(path.join(PUBLISH_DIR, sceneId, version, "manifest.json"), manifest);
    const latest = await latestManifest(sceneId);
    if (latest?.version === version) await writeJson(path.join(PUBLISH_DIR, sceneId, "manifest.json"), manifest);
    return manifest;
}

/**
 * The record of a version published before each kept its own: the scene's
 * manifest if it is still the latest; otherwise pieced together from its
 * snapshot, which carries its stats, and its newest finished bake.
 */
async function rebuildManifest(sceneId, version) {
    const latest = await latestManifest(sceneId);
    if (latest?.version === version) {
        const bake = latest.lighting ? (latest.lighting.samples >= 256 ? "final" : "draft") : "off";
        return { ...latest, options: publishOptions({ ...latest.options, bake }) };
    }

    const dir = path.join(PUBLISH_DIR, sceneId, version);
    const snapshot = await readFile(path.join(dir, "snapshot.glb")).catch(() => null);
    if (!snapshot) return null;
    const extras = readSceneExtras(snapshot) ?? {};
    const size = async (file) => (await stat(path.join(dir, file)).catch(() => null))?.size ?? null;
    const manifest = {
        id: sceneId,
        version,
        publishedAt: versionDate(version).toISOString(),
        options: publishOptions({ bake: "off" }),
        spec: `${version}/spec.json`,
        view: `${version}/view.glb`,
        snapshot: `${version}/snapshot.glb`,
        levels: extras.levels,
        birdView: extras.birdView,
        stats: extras.stats,
        sizes: { snapshot: snapshot.length, view: await size("view.glb") },
    };
    const runtime = await size("runtime.glb");
    if (runtime) {
        manifest.runtime = `${version}/runtime.glb`;
        manifest.sizes.runtime = runtime;
    }

    const bakes = [];
    for (const entry of await readdir(dir)) {
        if (!entry.startsWith("bake")) continue;
        const bake = await readJson(path.join(dir, entry, "bake.json"));
        const baked = await stat(path.join(dir, entry, "view.glb")).catch(() => null);
        if (bake && baked) bakes.push({ entry, bake, bakedAt: baked.mtime });
    }
    const newest = bakes.sort((a, b) => b.bakedAt - a.bakedAt)[0];
    if (newest) {
        const { entry, bake, bakedAt } = newest;
        manifest.view = `${version}/${entry}/view.glb`;
        manifest.options.bake = bake.samples >= 256 ? "final" : "draft";
        manifest.lighting = {
            bakedAt: bakedAt.toISOString(),
            samples: bake.samples,
            size: bake.size,
            texel: bake.texel,
            meshes: bake.meshes,
            triangles: bake.triangles,
            variants: Object.fromEntries(
                Object.entries(bake.variants).map(([name, variant]) => [
                    name,
                    {
                        lightmap: `${version}/${entry}/${variant.lightmap}`,
                        ...(variant.lightmapPhone && { lightmapPhone: `${version}/${entry}/${variant.lightmapPhone}` }),
                        scale: variant.scale,
                        attribute: variant.attribute,
                        doors: variant.doors,
                    },
                ])
            ),
        };
        manifest.sizes.view = await size(`${entry}/view.glb`);
        manifest.sizes.lightmaps = Object.fromEntries(
            await Promise.all(
                Object.entries(bake.variants).map(async ([name, variant]) => [name, await size(`${entry}/${variant.lightmap}`)])
            )
        );
    }
    return manifest;
}

async function readJson(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch {
        return null;
    }
}

/** Written whole or not at all: the public view may be reading it. */
async function writeJson(file, value) {
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, file);
}

/** The extras on a GLB's scene, read straight from its JSON chunk. */
function readSceneExtras(glb) {
    if (glb.length < 20 || glb.readUInt32LE(0) !== 0x46546c67) return null;
    const length = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + length).toString("utf8"));
    return json.scenes?.[json.scene ?? 0]?.extras ?? null;
}

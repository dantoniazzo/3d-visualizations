/**
 * Bake the lighting of a space's published public view.
 *
 *   npm run bake -- <scene-id>                 the latest version, day and night, ~12 minutes
 *   npm run bake -- <scene-id> --samples 128   a quicker, noisier draft
 *   npm run bake -- <scene-id> --size 2048     a coarser lightmap, quicker
 *   npm run bake -- <scene-id> --version <v>   an earlier version
 *   npm run bake -- <scene-id> --debug         also keep the raw and denoised lightmaps (EXR)
 *
 * The editor's Publish panel runs this too, when a publish asks for its
 * lighting to be baked (server/publish/bake.js).
 *
 * Publishing stores a snapshot of what a visitor can see. This runs
 * Blender on it (blender/bake_public.py) to bake the light — sun, sky, the
 * room lights and every bounce between them — for day and for night, then
 * updates the published version in place: its view gains lightmap UVs and
 * baked vertex light, and the lightmaps sit beside it. The public view then
 * draws the house unlit, from what was baked, rather than lighting it live.
 *
 * One bake at a time: Blender takes the whole GPU.
 *
 * Needs Blender (BLENDER=/path/to/blender if it is not found).
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ENVIRONMENT_PRESETS, FINISHES } from "../shared/catalog.js";
import { rectCorners } from "../frontend/Experience/Utils/geometry.js";
import { compressView } from "../server/publish/compress.js";
import { PUBLISH_DIR, latestManifest, updateVersion, versionManifest } from "../server/publish/store.js";
import { findBlender } from "./lib/blender.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const VALUED = ["--samples", "--size", "--version"];
const sceneId = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
const option = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
};

if (!sceneId) {
    console.error("Usage: npm run bake -- <scene-id> [--samples 128] [--size 2048] [--version <v>] [--debug]");
    process.exit(1);
}

const blender = findBlender();
if (!blender) {
    console.error("Blender not found. Install it, or set BLENDER=/path/to/blender.");
    process.exit(1);
}

const version = option("version", null) ?? (await latestManifest(sceneId))?.version;
const manifest = version && (await versionManifest(sceneId, version));
if (!manifest) {
    console.error(`${sceneId} has not been published${version ? ` as ${version}` : ""}. Publish it from the editor first.`);
    process.exit(1);
}

// One bake at a time, whether started here or from the Publish panel.
const LOCK = join(PUBLISH_DIR, ".bake-lock");
try {
    const held = JSON.parse(readFileSync(LOCK, "utf8"));
    process.kill(held.pid, 0);
    console.error(`A bake is already running (${held.sceneId} ${held.version}, process ${held.pid}). Wait for it to finish.`);
    process.exit(1);
} catch {
    // No lock, or its bake has gone.
}
writeFileSync(LOCK, JSON.stringify({ pid: process.pid, sceneId, version, startedAt: new Date().toISOString() }));
process.on("exit", () => rmSync(LOCK, { force: true }));

// Each bake gets a folder of its own: published files are served as never
// changing, so a new bake must not reuse an old one's names.
const sceneDir = join(PUBLISH_DIR, sceneId);
const versionDir = join(sceneDir, version);
const bakeName = `bake-${Date.now().toString(36)}`;
const bakeDir = join(versionDir, bakeName);
await mkdir(bakeDir, { recursive: true });
const spec = JSON.parse(await readFile(join(sceneDir, manifest.spec), "utf8"));
const preset = ENVIRONMENT_PRESETS[spec.environment?.preset] || ENVIRONMENT_PRESETS.interior_day;

const outdoor = (room) => FINISHES[room.floor_finish]?.kind === "ground";
const area = (polygon) => {
    let sum = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        sum += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    }
    return Math.abs(sum / 2);
};

// A light in the middle of every room's ceiling, as the app hangs one.
const rooms = spec.rooms
    .filter((room) => !outdoor(room))
    .map((room) => {
        const n = room.polygon.length;
        const x = room.polygon.reduce((s, p) => s + p[0], 0) / n;
        const z = room.polygon.reduce((s, p) => s + p[1], 0) / n;
        return { id: room.id, area: area(room.polygon), light: [x, room.elevation + room.height - 0.08, z] };
    });

// A probe each side of every door, a hand's width off the leaf at about
// handle height: the leaves move, so they are tinted with the light there.
const probes = [];
for (const wall of spec.walls || []) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (!length) continue;
    const dx = (x2 - x1) / length;
    const dz = (z2 - z1) / length;
    const d = wall.thickness / 2 + 0.25;
    for (const opening of wall.openings || []) {
        if (opening.type !== "door") continue;
        const x = x1 + dx * opening.offset;
        const z = z1 + dz * opening.offset;
        const y = wall.base_height + Math.min(1.1, opening.height / 2);
        probes.push({
            id: opening.id,
            positions: [[x - dz * d, y, z + dx * d], [x + dz * d, y, z - dx * d]],
            normals: [[-dz, 0, dx], [dz, 0, -dx]],
        });
    }
}

// A portal over every opening in an outside wall — windows, doors and
// doorways — facing in: it tells Cycles where the sky comes into the house
// from, so it sends its samples through the openings rather than hoping to
// find them, which is most of the noise in a room lit through its windows.
const insidePolygon = (x, z, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
};
const indoorAt = (x, y, z) =>
    spec.rooms.some(
        (room) => !outdoor(room) && y >= room.elevation - 0.05 && y < room.elevation + room.height && insidePolygon(x, z, room.polygon)
    );
const portals = [];
for (const wall of spec.walls || []) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (!length) continue;
    const dx = (x2 - x1) / length;
    const dz = (z2 - z1) / length;
    const side = wall.thickness / 2 + 0.3;
    for (const opening of wall.openings || []) {
        const x = x1 + dx * opening.offset;
        const z = z1 + dz * opening.offset;
        const bottom = wall.base_height + (opening.type === "window" ? opening.sill ?? 0 : 0);
        const y = bottom + opening.height / 2;
        const left = indoorAt(x - dz * side, y, z + dx * side);
        const right = indoorAt(x + dz * side, y, z - dx * side);
        if (left === right) continue;
        // Into the room, and on the wall's outside face.
        const [nx, nz] = left ? [-dz, dx] : [dz, -dx];
        const out = wall.thickness / 2;
        portals.push({ id: opening.id, position: [x - nx * out, y, z - nz * out], normal: [nx, 0, nz], width: opening.width, height: opening.height });
    }
}

// The house's own solid parts, where nothing is seen (bake_hidden): every
// wall panel, as StructureBuilder.buildWall lays them round the openings,
// and the slab between each floor's ceilings and the floor above, which an
// outside wall runs on up through. A millimetre inside each, so their own
// faces are not in them.
const INSIDE = 0.001;
const solidWalls = [];
for (const wall of spec.walls || []) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (!length) continue;
    const direction = [(x2 - x1) / length, (z2 - z1) / length];
    const panel = (from, to, bottom, top) => {
        if (to - from <= 0.001 || top - bottom <= 0.001) return;
        solidWalls.push({
            start: wall.start,
            direction,
            from: from + INSIDE,
            to: to - INSIDE,
            half: wall.thickness / 2 - INSIDE,
            // Past the foot of a wall that stands on the floor: whatever runs
            // on under it.
            bottom: wall.base_height + (bottom > 0.001 ? bottom + INSIDE : -0.01),
            top: wall.base_height + top - INSIDE,
        });
    };
    let cursor = 0;
    for (const opening of [...(wall.openings || [])].sort((a, b) => a.offset - b.offset)) {
        const start = opening.offset - opening.width / 2;
        const end = opening.offset + opening.width / 2;
        const sill = opening.sill ?? 0;
        panel(cursor, start, 0, wall.height);
        if (sill > 0.001) panel(start, end, 0, sill);
        if (opening.type !== "arch") panel(start, end, sill + opening.height, wall.height);
        cursor = end;
    }
    panel(cursor, length, 0, wall.height);
}
const indoor = spec.rooms.filter((room) => !outdoor(room));
// As SceneBuilder cuts them through the floor and the ceiling below.
const openingCorners = (hole) =>
    rectCorners(hole.position[0], hole.position[1], hole.width, hole.depth, ((hole.yaw || 0) * Math.PI) / 180);
const slabs = [];
for (const room of indoor) {
    const bottom = room.elevation + room.height;
    const walls = (spec.walls || []).filter((wall) => Math.abs(wall.base_height - room.elevation) < 0.01);
    const above = indoor.filter((other) => other.elevation > bottom - 0.01).map((other) => other.elevation);
    const top = Math.min(Math.max(bottom, ...walls.map((wall) => wall.base_height + wall.height)), ...above);
    if (top - bottom < 0.02) continue;
    slabs.push({
        polygon: room.polygon,
        bottom: bottom + INSIDE,
        top: top - INSIDE,
        holes: (spec.floor_openings || [])
            .filter((hole) => hole.elevation > bottom - 0.01 && hole.elevation < top + 0.01)
            .map(openingCorners),
    });
}

const settings = {
    preset,
    rooms,
    probes,
    portals,
    solids: { walls: solidWalls, slabs },
    groundMaterials: Object.keys(FINISHES).filter((id) => FINISHES[id].kind === "ground"),
    // Sun and sky in W/m², matched to the app's own lights; room lights in
    // W per m² of floor — lit but not blazing by day, the only light at night.
    day: { sun: preset.sun.intensity, sky: 1.0, lights: 2.5 },
    night: { sky: 0.05, moon: 0.08, lights: 9 },
};
const settingsPath = join(bakeDir, "settings.json");
await writeFile(settingsPath, JSON.stringify(settings, null, 2));

console.log(`Baking ${sceneId} (${version}) with ${blender.version}`);
const started = Date.now();
execFileSync(
    blender.path,
    [
        "--background",
        "--python",
        join(ROOT, "blender", "bake_public.py"),
        "--",
        "--snapshot", join(versionDir, "snapshot.glb"),
        "--out", bakeDir,
        "--settings", settingsPath,
        "--samples", option("samples", "512"),
        "--size", option("size", "4096"),
        ...(args.includes("--debug") ? ["--debug"] : []),
    ],
    { stdio: "inherit", cwd: join(ROOT, "blender") }
);

console.log("[bake] compressing the view");
const bake = JSON.parse(await readFile(join(bakeDir, "bake.json"), "utf8"));
const view = await compressView(await readFile(join(bakeDir, "lit.glb")), { draco: manifest.options?.compress !== false });
await writeFile(join(bakeDir, "view.glb"), view);

const size = async (file) => (await stat(file)).size;
const lightmaps = Object.fromEntries(
    await Promise.all(Object.entries(bake.variants).map(async ([name, variant]) => [name, await size(join(bakeDir, variant.lightmap))]))
);
await updateVersion(sceneId, version, {
    view: `${version}/${bakeName}/view.glb`,
    options: { ...manifest.options, bake: bake.samples >= 256 ? "final" : "draft" },
    lighting: {
        bakedAt: new Date().toISOString(),
        samples: bake.samples,
        size: bake.size,
        texel: bake.texel,
        meshes: bake.meshes,
        triangles: bake.triangles,
        variants: Object.fromEntries(
            Object.entries(bake.variants).map(([name, variant]) => [
                name,
                {
                    lightmap: `${version}/${bakeName}/${variant.lightmap}`,
                    // Half the size or less, for phones.
                    ...(variant.lightmapPhone && { lightmapPhone: `${version}/${bakeName}/${variant.lightmapPhone}` }),
                    scale: variant.scale,
                    attribute: variant.attribute,
                    doors: variant.doors,
                },
            ])
        ),
    },
    sizes: { ...manifest.sizes, view: view.length, lightmaps },
});

// Earlier bakes of this version are no longer referenced.
for (const entry of await readdir(versionDir)) {
    if (entry.startsWith("bake") && entry !== bakeName) await rm(join(versionDir, entry), { recursive: true, force: true });
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(
    `\nBaked in ${Math.round((Date.now() - started) / 1000)} s — view ${mb(view.length)}, ` +
        Object.entries(lightmaps).map(([name, bytes]) => `${name} lightmap ${mb(bytes)}`).join(", ") +
        `.\n/view/${sceneId}?version=${version} now draws the baked light.`
);

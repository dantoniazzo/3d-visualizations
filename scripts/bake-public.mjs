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
 * draws the house from what was baked: on a phone all of its light, unlit;
 * elsewhere all but the sun's and the lamps' straight light, which it draws
 * live, with shadows that follow the doors, the people and the car
 * (frontend/Experience/Utils/device.js's lightingMode). Each room door is
 * baked shut too, the rooms either side of it, for the view to dim them as
 * it closes (doors.webp).
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

import { ENVIRONMENT_PRESETS, FINISHES, TRIM_MATERIALS } from "../shared/catalog.js";
import { planBushes, planFence, planHillTrees, planTrees } from "../shared/vegetation.js";
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
        return {
            id: room.id,
            area: area(room.polygon),
            light: [x, room.elevation + room.height - 0.08, z],
            // Which room each surface is seen from: the bake's lighting zones.
            polygon: room.polygon,
            elevation: room.elevation,
            height: room.height,
        };
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

// The light fittings (the published spec's lights, Fittings.js), switch by
// switch — each switch's light is baked on its own, into the rooms it
// reaches: its own, and every room a door, doorway or stairwell opens into
// from it. What it throws further is too little to see.
const roomAt = (x, y, z) =>
    indoor.find((room) => y >= room.elevation - 0.05 && y < room.elevation + room.height + 0.3 && insidePolygon(x, z, room.polygon)) ?? null;
const neighbours = new Map(indoor.map((room) => [room.id, new Set()]));
// What joins each two rooms: the doors with leaves by their ids, and
// anything always open — a doorway, a stairwell — as null.
const links = new Map();
const linkKey = (a, b) => [a, b].sort().join("|");
const connect = (a, b, door = null) => {
    if (!a || !b || a === b) return;
    neighbours.get(a.id)?.add(b.id);
    neighbours.get(b.id)?.add(a.id);
    const key = linkKey(a.id, b.id);
    if (!links.has(key)) links.set(key, []);
    links.get(key).push(door);
};
for (const wall of spec.walls || []) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (!length) continue;
    const dx = (x2 - x1) / length;
    const dz = (z2 - z1) / length;
    const side = wall.thickness / 2 + 0.3;
    for (const opening of wall.openings || []) {
        if (opening.type !== "door" && opening.type !== "doorway") continue;
        const x = x1 + dx * opening.offset;
        const z = z1 + dz * opening.offset;
        const y = wall.base_height + 1.0;
        connect(roomAt(x - dz * side, y, z + dx * side), roomAt(x + dz * side, y, z - dx * side), opening.type === "door" ? opening.id : null);
    }
}
for (const hole of spec.floor_openings || []) {
    const [x, z] = hole.position;
    connect(roomAt(x, hole.elevation + 0.1, z), roomAt(x, hole.elevation - 0.6, z));
}
const switches = new Map();
for (const light of spec.lights || []) {
    if (!light.room || !neighbours.has(light.room)) continue;
    if (!switches.has(light.switch)) {
        // The rooms next door it reaches through doors alone, and which:
        // the view lets less of its light into each as they close.
        const through = {};
        for (const zone of neighbours.get(light.room)) {
            const joins = links.get(linkKey(light.room, zone)) ?? [];
            if (joins.length && joins.every(Boolean)) through[zone] = joins;
        }
        switches.set(light.switch, {
            id: light.switch,
            label: light.label,
            zones: [light.room, ...neighbours.get(light.room)],
            through,
            lights: [],
        });
    }
    switches.get(light.switch).lights.push({
        kind: light.kind,
        position: light.position,
        power: light.power,
        color: light.color,
        // Its glass or bulb, kept out of the light's way, and the light's own size.
        ...(light.glow && { glow: light.glow, radius: light.radius }),
        ...(light.size && { size: light.size }),
    });
}

// Every room door's leaf, shut, and the rooms either side of it: those
// rooms are baked again with it shut (blender/bake_public.py's
// bake_door_states), for the view to dim them as it closes — the light
// from the sky and everything bounced; the sun's and the lamps' straight
// light the view shades itself. A leaf as World/Door.js hangs it: the
// doorway's width and height less a few millimetres, LEAF_T thick, square
// in the wall. Outside, a front door makes no difference worth baking.
const LEAF_T = 0.04;
const doors = [];
for (const wall of spec.walls || []) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (!length) continue;
    const dx = (x2 - x1) / length;
    const dz = (z2 - z1) / length;
    const side = wall.thickness / 2 + 0.3;
    for (const opening of wall.openings || []) {
        if (opening.type !== "door") continue;
        const x = x1 + dx * opening.offset;
        const z = z1 + dz * opening.offset;
        const y = wall.base_height + 1.0;
        const zones = [roomAt(x - dz * side, y, z + dx * side), roomAt(x + dz * side, y, z - dx * side)]
            .filter(Boolean)
            .map((room) => room.id);
        if (!zones.length || zones[0] === zones[1]) continue;
        doors.push({
            id: opening.id,
            zones,
            centre: [x, wall.base_height + opening.height / 2, z],
            size: [opening.width - 0.01, opening.height - 0.02, LEAF_T],
            direction: [dx, dz],
            color: TRIM_MATERIALS[opening.door?.leaf]?.color ?? TRIM_MATERIALS.trim_white.color,
        });
    }
}

const settings = {
    preset,
    rooms,
    probes,
    doors,
    portals,
    switches: [...switches.values()],
    // The garden's trees and bushes, and the hills', as the view grows them
    // (shared/vegetation.js): not baked themselves, but casting their shade.
    trees: [...planTrees(spec), ...planHillTrees(spec)],
    bushes: planBushes(spec, planFence(spec), planTrees(spec)),
    // Surfaces with coarser texels than the house's own, by how much: the
    // fence (FenceBuilder), a couple of hundred metres of it round the plot;
    // and the hills behind it (HillBuilder), seen only from a distance.
    coarseMaterials: { fence_timber: 3, fence_paint: 3, hill_grass: 16 },
    solids: { walls: solidWalls, slabs },
    groundMaterials: Object.keys(FINISHES).filter((id) => FINISHES[id].kind === "ground"),
    // Sun and sky in W/m², matched to the app's own lights. Light fittings
    // are baked apart from them, switch by switch (switches), so the day
    // and night are the sun, the sky and the moon alone.
    day: { sun: preset.sun.intensity, sky: 1.0 },
    night: { sky: 0.05, moon: 0.08 },
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
// A lightmap's brightness and, beside it, its colour.
const lightmaps = Object.fromEntries(
    await Promise.all(
        Object.entries(bake.variants).map(async ([name, variant]) => [
            name,
            (await size(join(bakeDir, variant.lightmap))) + (variant.chroma ? await size(join(bakeDir, variant.chroma)) : 0),
        ])
    )
);
// What the bake describes, with every file it names as it is served:
// beside the rest of this bake.
const served = (value) => {
    if (typeof value === "string") return /\.(webp|bin)$/.test(value) ? `${version}/${bakeName}/${value}` : value;
    if (Array.isArray(value)) return value.map(served);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, served(inner)]));
};
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
        // How the light is drawn: Blender's Filmic, at the bake's exposure.
        ...(bake.view && { view: bake.view }),
        // Each room's square of the lightmap.
        ...(bake.zones && { zones: bake.zones }),
        // The light probes, for a view lit live to light what moves with.
        ...(bake.probes && { probes: served(bake.probes) }),
        // Each switch's light, room by room — all of it, and what its lamps
        // bounce (`indirect`) — and its lamps as they were baked.
        ...(bake.switches?.length && { switches: served(bake.switches) }),
        // How much of each room's light stays as each of its doors shuts.
        ...(bake.doorStates && { doorStates: served(bake.doorStates) }),
        // Day and night: each one's lightmap (its brightness, its colour
        // beside it, and half-size copies for phones), how its 8 bits hold
        // the light, the light on the thin faces and the doors; its sun, and
        // all of its light but the sun's straight light (`indirect`), for a
        // view that draws the sun live.
        variants: served(bake.variants),
    },
    sizes: {
        ...manifest.sizes,
        view: view.length,
        lightmaps,
        ...(bake.probes && { probes: await size(join(bakeDir, bake.probes.file)) }),
        ...(bake.doorStates && { doorStates: await size(join(bakeDir, bake.doorStates.file)) }),
    },
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

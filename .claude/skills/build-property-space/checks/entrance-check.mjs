#!/usr/bin/env node
/**
 * entrance-check.mjs — audits the garden step flights that climb from the
 * street parking through the dry-stone retaining wall to each plot of
 * kosinozici-villas (scripts/spaces/ladonia/index.js: STEPS, stepFlights,
 * retainingWalls, frontHedges, the *-path / *-recess paving, terrain holes).
 *
 *   node entrance-check.mjs [scene.json] [--simulate-fix [--width=2.58]] [--verbose]
 *
 * For each flight (stairs whose id starts "steps-") it prints:
 *   1. the flight's geometry: each step's site x-band, tread top, block bottom,
 *      and the invisible collision ramp's height (StructureBuilder.buildStairs);
 *   2. every spec element whose plan footprint overlaps the flight, or its
 *      walking corridor (1 m of parking before the foot, 2 m of garden past
 *      the head, the flight's width + 0.35 m capsule radius each side), with
 *      its height relative to the ramp the capsule walks on, and a verdict:
 *        BLOCKS  collidable, between 0.15 m and 1.9 m above the walking surface
 *        NARROWS same, but only at the flight's edges (capsule still fits)
 *        BELOW   under the walking surface (harmless)
 *        VISUAL  not collidable (hedges, grass), drawn over the flight
 *   3. a capsule path search (radius 0.35, 1.9 m tall, max step 0.15) from
 *      the parking to the path: PASS / FAIL, and how far up it gets;
 *   4. holes in the walking surface past the head (no slab, no tread, terrain
 *      holed);
 *   5. near-coplanar horizontal faces (< 15 mm apart, overlapping) — z-fighting.
 *
 * `--simulate-fix` applies, in memory, the generator changes proposed in the
 * audit (path slabs end at the flight's head, terrain holes trimmed to the
 * flight, retaining-wall ends buried in the cheeks) so the "after" numbers can
 * be compared; once those changes are in index.js and the scene re-seeded,
 * running without the flag must print the same PASS lines.
 *
 * Read-only: touches nothing in the repo.
 *
 * Paths: the repo is found from this file's location (four directories up:
 * checks -> build-property-space -> skills -> .claude -> repo); set REPO=<dir>
 * to check another checkout.
 */
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const { terrainHeight } = await import(`${REPO}/shared/landscape.js`);

const args = process.argv.slice(2);
const SIM = args.includes("--simulate-fix");
const VERBOSE = args.includes("--verbose");
const WIDTH = Number(args.find((a) => a.startsWith("--width="))?.slice(8)) || null;
const scenePath = args.find((a) => a.endsWith(".json")) ?? `${REPO}/scenes/kosinozici-villas.json`;
const raw = JSON.parse(fs.readFileSync(scenePath, "utf8"));
const spec = raw.scene ?? raw;
const catalog = (() => {
    try {
        return new Map(JSON.parse(fs.readFileSync(`${REPO}/public/models/furniture/catalog.json`, "utf8")).items.map((i) => [i.id, i]));
    } catch {
        return new Map();
    }
})();

// Constants mirrored from the app.
const CAPSULE_R = 0.35;
const CAPSULE_H = 1.9;
const STEP_UP = 0.15; // what the capsule rides over without a ramp
const LEAD = 0.6; // StructureBuilder.STAIR_LEAD_IN
const ZFIGHT = 0.015;

const r3 = (n) => Math.round(n * 1000) / 1000;
const f2 = (n) => (n == null || !Number.isFinite(n) ? "  —  " : (n >= 0 ? " " : "") + n.toFixed(3));

// ---------------------------------------------------------------------
// The proposed fixes, applied in memory (mirrors the index.js diff).
// ---------------------------------------------------------------------
if (SIM) {
    const flights = spec.stairs.filter((s) => s.id.startsWith("steps-"));
    // (e, optional) `--width=2.58`: the flights widened to 1 cm short of the cheeks' faces.
    if (WIDTH) for (const st of flights) st.width = WIDTH;
    for (const st of flights) {
        const headX = r3(st.start[0] - st.run); // flights run west
        const z = st.start[1];
        // (a)/(b) a-path, b-path, c-path: end at the flight's head, not over it.
        for (const room of spec.rooms) {
            if (!/-path$/.test(room.id)) continue;
            const zs = room.polygon.map((p) => p[1]);
            if (Math.min(...zs) > z + st.width / 2 || Math.max(...zs) < z - st.width / 2) continue;
            room.polygon = room.polygon.map(([x, pz]) => [Math.min(x, headX), pz]);
        }
        // (c) the terrain hole: from the head (not 0.14 m past it) to the cheeks' faces.
        const holes = spec.landscape.terrain.holes;
        for (let i = 0; i < holes.length; i++) {
            const xs = holes[i].map((p) => p[0]);
            const zs = holes[i].map((p) => p[1]);
            const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
            if (Math.abs(cz - z) > 0.05 || Math.max(...xs) < 20) continue;
            holes[i] = [
                [headX, r3(z - 1.3)],
                [Math.max(...xs), r3(z - 1.3)],
                [Math.max(...xs), r3(z + 1.3)],
                [headX, r3(z + 1.3)],
            ];
        }
        // (d) the retaining wall's runs: end 1.55 m either side of the steps,
        //     so with the prism's thickness/2 run-on they stop inside the cheeks.
        for (const wall of spec.landscape.walls) {
            if (!/^rw-\d+$/.test(wall.id)) continue;
            wall.path = wall.path.map(([x, pz]) => {
                if (Math.abs(pz - (z - 1.3)) < 0.01) return [x, r3(z - 1.55)];
                if (Math.abs(pz - (z + 1.3)) < 0.01) return [x, r3(z + 1.55)];
                return [x, pz];
            });
        }
    }
}

// ---------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------
function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}
function area(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const [x0, z0] = poly[i];
        const [x1, z1] = poly[(i + 1) % poly.length];
        a += x0 * z1 - x1 * z0;
    }
    return Math.abs(a) / 2;
}
/** Sutherland–Hodgman: clip `poly` to an axis-aligned rect [x0,z0,x1,z1]. */
function clipRect(poly, [x0, z0, x1, z1]) {
    const edges = [
        (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= z0, (p) => p[1] <= z1,
    ];
    const cut = [
        (a, b) => lerpAt(a, b, 0, x0), (a, b) => lerpAt(a, b, 0, x1), (a, b) => lerpAt(a, b, 1, z0), (a, b) => lerpAt(a, b, 1, z1),
    ];
    let out = poly;
    for (let e = 0; e < 4 && out.length; e++) {
        const input = out;
        out = [];
        for (let i = 0; i < input.length; i++) {
            const cur = input[i];
            const prev = input[(i + input.length - 1) % input.length];
            if (edges[e](cur)) {
                if (!edges[e](prev)) out.push(cut[e](prev, cur));
                out.push(cur);
            } else if (edges[e](prev)) out.push(cut[e](prev, cur));
        }
    }
    return out;
}
function lerpAt(a, b, axis, v) {
    const t = (v - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/** A segment's footprint, `thickness` wide, run on `extend` past each end (LandscapeBuilder prism). */
function segmentRect([ax, az], [bx, bz], thickness, extend = 0) {
    const len = Math.hypot(bx - ax, bz - az) || 1e-9;
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const nx = -uz * (thickness / 2);
    const nz = ux * (thickness / 2);
    const [sx, sz, ex, ez] = [ax - ux * extend, az - uz * extend, bx + ux * extend, bz + uz * extend];
    return [[sx + nx, sz + nz], [ex + nx, ez + nz], [ex - nx, ez - nz], [sx - nx, sz - nz]];
}
function rotRect(cx, cz, w, d, yawDeg) {
    const t = (yawDeg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}
const bbox = (poly) => [Math.min(...poly.map((p) => p[0])), Math.min(...poly.map((p) => p[1])), Math.max(...poly.map((p) => p[0])), Math.max(...poly.map((p) => p[1]))];

// ---------------------------------------------------------------------
// Everything that stands on the site, as plan footprints with a y range.
//   kind: solid (collides, y0..y1) | sheet (collides, zero-thickness at y) | visual
// ---------------------------------------------------------------------
const L = spec.landscape ?? {};
const allElements = [];
let elements = allElements;
for (const room of spec.rooms) {
    allElements.push({ id: room.id, type: "room floor", kind: "sheet", poly: room.polygon, y0: room.elevation, y1: room.elevation, finish: room.floor_finish });
    if (room.ceiling_finish && room.ceiling_finish !== "none") allElements.push({ id: `${room.id}:ceiling`, type: "room ceiling", kind: "sheet", poly: room.polygon, y0: room.elevation + room.height, y1: room.elevation + room.height, finish: room.ceiling_finish });
}
for (const wall of L.walls ?? []) {
    const [t0, t1] = wall.slope ?? [wall.top, wall.top];
    for (let i = 0; i < wall.path.length - 1; i++) {
        allElements.push({ id: wall.path.length > 2 ? `${wall.id}#${i}` : wall.id, type: `landscape wall (${wall.finish})`, kind: "solid", poly: segmentRect(wall.path[i], wall.path[i + 1], wall.thickness, wall.thickness / 2), y0: wall.base, y1: Math.max(t0, t1, wall.top), finish: wall.finish, topFinish: wall.coping === false ? wall.finish : "concrete_steps" });
    }
}
for (const [k, kerb] of (L.kerbs ?? []).entries()) {
    for (let i = 0; i < kerb.path.length - 1; i++) allElements.push({ id: `kerb-${k}`, type: "kerb", kind: "solid", poly: segmentRect(kerb.path[i], kerb.path[i + 1], kerb.width, 0), y0: kerb.base - 0.1, y1: kerb.base + kerb.height, finish: "concrete_steps" });
}
for (const p of L.planters ?? []) {
    for (let i = 0; i < p.path.length - 1; i++) allElements.push({ id: p.id, type: "planter", kind: "solid", poly: segmentRect(p.path[i], p.path[i + 1], p.width, p.width / 2), y0: p.base, y1: p.base + p.height, finish: "corten" });
}
for (const pg of L.pergolas ?? []) {
    const [x0, z0, x1, z1] = pg.box;
    allElements.push({ id: pg.id, type: "pergola (frame/louvres)", kind: "solid", poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0: pg.base + pg.height - 0.22, y1: pg.base + pg.height, finish: pg.frame });
}
for (const r of L.railings ?? []) {
    for (let i = 0; i < r.points.length - 1; i++) {
        const [ax, az, ay] = r.points[i];
        const [bx, bz, by] = r.points[i + 1];
        allElements.push({ id: r.id, type: "glass railing", kind: "solid", poly: segmentRect([ax, az], [bx, bz], 0.05, 0), y0: Math.min(ay, by), y1: Math.max(ay, by) + r.height, finish: "glass" });
    }
}
for (const pool of L.pools ?? []) {
    const [x0, z0, x1, z1] = pool.box;
    allElements.push({ id: pool.id, type: "pool (water)", kind: "visual", poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0: pool.level, y1: pool.level });
}
for (const h of L.hedges ?? []) {
    for (let i = 0; i < h.path.length - 1; i++) {
        const [a, b] = [h.path[i], h.path[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.05) continue;
        // hedges.js: core (len + w - 0.16) x (w - 0.16); sprays to len/2 + 0.3w (+0.08 jitter, +0.13 half card) along, w/2 (+0.08 +0.13) across.
        const along = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const yaw = (Math.atan2(along[0], along[1]) * 180) / Math.PI;
        const core = rotRect(mid[0], mid[1], h.width - 0.16, len + h.width - 0.16, yaw);
        const spray = rotRect(mid[0], mid[1], h.width + 2 * 0.21, len + 0.6 * h.width + 2 * 0.21, yaw);
        allElements.push({ id: h.id, type: "hedge core (no collision)", kind: "visual", poly: core, y0: h.base, y1: h.base + h.height - 0.12 });
        allElements.push({ id: h.id, type: "hedge leaf sprays (no collision)", kind: "visual", poly: spray, y0: h.base, y1: h.base + h.height + 0.13 });
    }
}
for (const lawn of L.lawns ?? []) allElements.push({ id: "lawn", type: "lawn grass (no collision)", kind: "visual", poly: lawn.polygon, y0: 0, y1: 0.1 });
for (const bed of L.grassBeds ?? []) allElements.push({ id: "bed", type: "grass bed (no collision)", kind: "visual", poly: bed.polygon, y0: 0, y1: 0.8 });
for (const tree of L.trees ?? []) {
    if (Math.hypot(tree.position[0], tree.position[1]) > 70 || tree.species.startsWith("bush")) continue;
    const rr = (tree.species.startsWith("olive") ? 0.16 : 0.22) * tree.scale;
    const y = (tree.elevation ?? 0) - 0.1;
    allElements.push({ id: `${tree.species}@${tree.position}`, type: "tree trunk", kind: "solid", poly: rotRect(tree.position[0], tree.position[1], rr * 2, rr * 2, 0), y0: y, y1: y + 2.4 });
}
for (const wall of spec.walls ?? []) {
    allElements.push({ id: wall.id, type: "building wall", kind: "solid", poly: segmentRect(wall.start, wall.end, wall.thickness, 0), y0: wall.base_height, y1: wall.base_height + wall.height, finish: wall.finish });
}
for (const f of spec.furniture ?? []) {
    const item = catalog.get(f.catalog_id);
    if (!item?.size) continue;
    const [w, h, d] = item.size.map((v) => v * (f.scale ?? 1));
    allElements.push({ id: f.id, type: `furniture ${f.catalog_id}`, kind: h < 0.035 ? "visual" : "solid", poly: rotRect(f.position[0], f.position[2], w, d, f.rotation ?? 0), y0: f.position[1], y1: f.position[1] + h });
}
for (const v of spec.vehicles ?? []) {
    // A parked car, about 4.9 x 2.0 (its length along its heading).
    allElements.push({ id: v.id, type: `car ${v.model}`, kind: "solid", poly: rotRect(v.position[0], v.position[1], 2.0, 4.9, v.yaw ?? 0), y0: v.elevation ?? 0, y1: (v.elevation ?? 0) + 1.6 });
}
const flightsAll = spec.stairs ?? [];

// Terrain: a holed sheet.
const terrain = L.terrain;
const terrainHoles = [...(terrain?.holes ?? []), ...(L.pools ?? []).map((p) => [[p.box[0] - 0.005, p.box[1] - 0.005], [p.box[2] + 0.005, p.box[1] - 0.005], [p.box[2] + 0.005, p.box[3] + 0.005], [p.box[0] - 0.005, p.box[3] + 0.005]])];
const terrainCache = new Map();
const terrainAt = (x, z) => {
    if (!terrain || terrainHoles.some((h) => pointInPoly(x, z, h))) return null;
    const key = `${Math.round(x * 200)},${Math.round(z * 200)}`;
    if (!terrainCache.has(key)) terrainCache.set(key, terrainHeight(terrain, x, z));
    return terrainCache.get(key);
};

// ---------------------------------------------------------------------
// A flight, in its own frame: s up the run from its foot, u across (left +).
// ---------------------------------------------------------------------
function frame(st) {
    const th = ((st.yaw ?? 0) * Math.PI) / 180;
    const dir = [Math.sin(th), Math.cos(th)];
    const across = [Math.cos(th), -Math.sin(th)];
    const rise = st.top_height - st.base_height;
    const going = st.run / st.steps;
    const stepRise = rise / st.steps;
    const pitch = Math.atan2(rise, st.run);
    const toWorld = (s, u) => [st.start[0] + dir[0] * s + across[0] * u, st.start[1] + dir[1] * s + across[1] * u];
    const toLocal = ([x, z]) => {
        const dx = x - st.start[0];
        const dz = z - st.start[1];
        return [dx * dir[0] + dz * dir[1], dx * across[0] + dz * across[1]];
    };
    const ramp = (s) => st.base_height + (s * rise) / st.run + stepRise / 2;
    const rampFrom = -LEAD * Math.cos(pitch);
    const steps = [];
    for (let i = 0; i < st.steps; i++) {
        const top = st.base_height + (i + 1) * stepRise;
        const rel = (i + 1) * stepRise;
        const depth = st.style === "slab" ? Math.min(rel, stepRise + 0.17) : rel;
        steps.push({ i, s0: i * going, s1: (i + 1) * going, top, bottom: top - depth });
    }
    const tread = (s) => steps.find((k) => s >= k.s0 - 1e-9 && s <= k.s1 + 1e-9)?.top ?? null;
    return { st, dir, across, rise, going, stepRise, pitch, toWorld, toLocal, ramp, rampFrom, steps, tread, half: st.width / 2 };
}

/** The surface the capsule stands on at local (s, u): the ramp on the flight, else the highest floor/terrain not above `ref` + step. */
function walkSurface(F, s, u, ref) {
    if (s >= F.rampFrom && s <= F.st.run && Math.abs(u) <= F.half) return Math.max(F.ramp(s), F.st.base_height);
    const [x, z] = F.toWorld(s, u);
    let best = null;
    for (const e of elements) {
        if (e.kind !== "sheet" || e.type !== "room floor") continue;
        if (e.y0 > ref + STEP_UP) continue;
        if (pointInPoly(x, z, e.poly) && (best == null || e.y0 > best)) best = e.y0;
    }
    const t = terrainAt(x, z);
    if (t != null && t <= ref + STEP_UP && (best == null || t > best)) best = t;
    // Other flights' ramps are not near; landscape solids' tops count as floors.
    for (const e of elements) {
        if (e.kind !== "solid" || e.y1 > ref + STEP_UP) continue;
        if (e.y1 > (best ?? -Infinity) && pointInPoly(x, z, e.poly)) best = e.y1;
    }
    return best;
}
/** The height the capsule is expected to be at, s along the corridor. */
const refHeight = (F, s) => (s < F.rampFrom ? F.st.base_height : s > F.st.run ? F.st.top_height + F.stepRise / 2 : Math.max(F.st.base_height, F.ramp(s)));

/** Collidable things at world (x, z) that obstruct a capsule standing at height H. */
function obstaclesAt(x, z, H) {
    const hits = [];
    for (const e of elements) {
        if (e.kind === "visual") continue;
        if (!pointInPoly(x, z, e.poly)) continue;
        if (e.y1 > H + STEP_UP && e.y0 < H + CAPSULE_H) hits.push(e);
    }
    const t = terrainAt(x, z);
    if (t != null && t > H + STEP_UP && t < H + CAPSULE_H) hits.push({ id: "terrain", type: "terrain sheet", kind: "sheet", y0: t, y1: t });
    return hits;
}

// ---------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------
const flights = flightsAll.filter((s) => s.id.startsWith("steps-"));
// Not a pass when there is nothing to check: the street flights must be named steps-<n>.
if (!flights.length) {
    console.log(`entrance-check  scene=${scenePath}\nno street flights found (stair ids starting "steps-"): nothing checked`);
    process.exit(1);
}
const names = { "steps-0": "A", "steps-1": "B", "steps-2": "C" };
let failures = 0;
console.log(`entrance-check  scene=${scenePath}${SIM ? "  [--simulate-fix: proposed index.js changes applied in memory]" : ""}`);

for (const st of flights) {
    const F = frame(st);
    const tag = names[st.id] ?? st.id;
    // Only what stands within reach of this flight's corridor.
    {
        const c = [[-1.6, -F.half - 1.2], [st.run + 2.6, -F.half - 1.2], [st.run + 2.6, F.half + 1.2], [-1.6, F.half + 1.2]].map(([s, u]) => F.toWorld(s, u));
        const [cx0, cz0, cx1, cz1] = bbox(c);
        elements = allElements.filter((e) => {
            const [x0, z0, x1, z1] = bbox(e.poly);
            return x1 >= cx0 && x0 <= cx1 && z1 >= cz0 && z0 <= cz1;
        });
    }
    const head = F.toWorld(st.run, 0);
    console.log(`\n=== Flight ${st.id} (building ${tag}) foot x=${st.start[0]} z=${st.start[1]}  head x=${r3(head[0])}  width ${st.width} (z ${r3(st.start[1] - F.half)}..${r3(st.start[1] + F.half)})  rise ${r3(F.rise)} in ${st.steps} x ${r3(F.stepRise)} / going ${r3(F.going)}`);
    console.log("  step   site x band          tread top  block bottom  ramp(at mid)");
    for (const k of F.steps) {
        const xa = F.toWorld(k.s0, 0)[0];
        const xb = F.toWorld(k.s1, 0)[0];
        console.log(`  ${k.i + 1}      x ${xa.toFixed(2)} .. ${xb.toFixed(2)}     ${f2(k.top)}     ${f2(k.bottom)}      ${f2(F.ramp((k.s0 + k.s1) / 2))}`);
    }
    console.log(`  collision ramp: from s=${r3(F.rampFrom)} (x=${r3(F.toWorld(F.rampFrom, 0)[0])}, y=${r3(F.ramp(F.rampFrom))}) to the head (x=${r3(head[0])}, y=${r3(F.ramp(st.run))})`);

    // --- 2. overlaps -----------------------------------------------------
    const flightRect = [0, -F.half, st.run, F.half];
    const corridorRect = [-1.0, -F.half - CAPSULE_R, st.run + 2.0, F.half + CAPSULE_R];
    const rows = [];
    for (const e of elements) {
        const local = e.poly.map(F.toLocal);
        const inCorr = clipRect(local, corridorRect);
        if (inCorr.length < 3 || area(inCorr) < 1e-4) continue;
        const onFlight = clipRect(local, flightRect);
        const flightArea = onFlight.length >= 3 ? area(onFlight) : 0;
        const [s0, u0, s1, u1] = bbox(inCorr);
        // Relative height: element top/bottom vs the walking surface under it (worst case over its overlap).
        let worst = null;
        let verdict = "BELOW";
        for (let s = s0; s <= s1 + 1e-9; s += 0.05) {
            const H = refHeight(F, Math.min(Math.max(s, -1), st.run + 2));
            const top = e.y1 - H;
            const bottom = e.y0 - H;
            const obstructs = top > STEP_UP && bottom < CAPSULE_H;
            if (worst == null || (obstructs && !worst.obstructs) || (obstructs === worst.obstructs && top > worst.top)) worst = { s, H, top, bottom, obstructs };
        }
        if (e.kind === "visual") verdict = "VISUAL";
        else if (worst.obstructs) {
            // In the walking line, or only along an edge?
            const inner = clipRect(local, [corridorRect[0], -F.half + CAPSULE_R * 2, corridorRect[2], F.half - CAPSULE_R * 2]);
            verdict = inner.length >= 3 && area(inner) > 1e-4 ? "BLOCKS" : "NARROWS";
        } else if (worst.top > -STEP_UP && worst.top <= STEP_UP && e.kind !== "visual") verdict = "FLOOR";
        if (verdict === "BELOW" && !VERBOSE) continue;
        if ((verdict === "FLOOR") && !VERBOSE && flightArea < 1e-4) continue;
        const wa = F.toWorld(s0, u0);
        const wb = F.toWorld(s1, u1);
        const over = F.steps.filter((k) => k.s1 > s0 + 1e-6 && k.s0 < s1 - 1e-6 && u1 > -F.half && u0 < F.half);
        const overTxt = over.length ? `over steps ${over[0].i + 1}..${over.at(-1).i + 1} (treads ${f2(over[0].top)}..${f2(over.at(-1).top)}), ${e.kind === "sheet" ? "its plane" : "its top"} ${r3((e.kind === "sheet" ? e.y0 : e.y1) - over[0].top)} m above tread ${over[0].i + 1}` : "";
        rows.push({ verdict, e, flightArea, overTxt, x: [Math.min(wa[0], wb[0]), Math.max(wa[0], wb[0])], z: [Math.min(wa[1], wb[1]), Math.max(wa[1], wb[1])], worst, s0, s1, u0, u1 });
    }
    const order = { BLOCKS: 0, NARROWS: 1, FLOOR: 2, VISUAL: 3, BELOW: 4 };
    rows.sort((a, b) => order[a.verdict] - order[b.verdict] || b.flightArea - a.flightArea);
    console.log("\n  elements in the flight / its corridor (corridor = 1 m before foot .. 2 m past head, width + 0.35 m each side):");
    console.log("  verdict  id                     type                               site x            site z            on-flight m²  y-range          top above walk  bottom above walk  (at x)");
    for (const r of rows) {
        const at = F.toWorld(r.worst.s, 0)[0];
        console.log(
            `  ${r.verdict.padEnd(8)} ${String(r.e.id).padEnd(22).slice(0, 22)} ${r.e.type.padEnd(34).slice(0, 34)} ${r.x[0].toFixed(2)}..${r.x[1].toFixed(2)}    ${r.z[0].toFixed(2)}..${r.z[1].toFixed(2)}    ${r.flightArea.toFixed(3).padStart(6)}      ${f2(r.e.y0)}..${f2(r.e.y1)}   ${f2(r.worst.top)}         ${f2(r.worst.bottom)}          ${at.toFixed(2)}`
        );
        if (r.overTxt && r.e.kind !== "visual") console.log(`           ↳ ${r.overTxt}`);
    }

    // --- 3. can the capsule climb it? -----------------------------------
    const ds = 0.05;
    const du = 0.05;
    const sMin = -1.0;
    const sMax = st.run + 2.0;
    const uMin = -F.half - 0.6;
    const uMax = F.half + 0.6;
    const NS = Math.round((sMax - sMin) / ds) + 1;
    const NU = Math.round((uMax - uMin) / du) + 1;
    const disc = [[0, 0]];
    for (let k = 0; k < 8; k++) disc.push([0.175 * Math.cos((k * Math.PI) / 4), 0.175 * Math.sin((k * Math.PI) / 4)]);
    for (let k = 0; k < 16; k++) disc.push([CAPSULE_R * Math.cos((k * Math.PI) / 8), CAPSULE_R * Math.sin((k * Math.PI) / 8)]);
    const free = new Uint8Array(NS * NU);
    const blockers = new Map();
    for (let i = 0; i < NS; i++) {
        const s = sMin + i * ds;
        const H = refHeight(F, s);
        for (let j = 0; j < NU; j++) {
            const u = uMin + j * du;
            // Standing somewhere?
            const ground = walkSurface(F, s, u, H);
            if (ground == null || ground < H - 0.6) continue;
            let ok = true;
            for (const [a, b] of disc) {
                const [x, z] = F.toWorld(s + a, u + b);
                const hits = obstaclesAt(x, z, ground);
                if (hits.length) {
                    ok = false;
                    for (const h of hits) blockers.set(h.id, h);
                    break;
                }
            }
            if (ok) free[i * NU + j] = 1;
        }
    }
    // Flood from the parking end.
    const seen = new Uint8Array(NS * NU);
    const queue = [];
    for (let j = 0; j < NU; j++) if (free[j]) (seen[j] = 1), queue.push(j);
    let maxI = 0;
    while (queue.length) {
        const c = queue.pop();
        const i = Math.floor(c / NU);
        const j = c % NU;
        if (i > maxI) maxI = i;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || ni >= NS || nj < 0 || nj >= NU) continue;
            const n = ni * NU + nj;
            if (!free[n] || seen[n]) continue;
            seen[n] = 1;
            queue.push(n);
        }
    }
    const reached = sMin + maxI * ds;
    const pass = reached >= st.run + 1.5;
    // The narrowest free width for the capsule's centre on the flight.
    let narrow = { w: Infinity, s: 0 };
    for (let i = 0; i < NS; i++) {
        const s = sMin + i * ds;
        if (s < 0 || s > st.run) continue;
        let n = 0;
        for (let j = 0; j < NU; j++) n += free[i * NU + j];
        const w = Math.max(0, (n - 1) * du);
        if (w < narrow.w) narrow = { w, s };
    }
    if (!pass) failures++;
    const reachedX = F.toWorld(reached, 0)[0];
    console.log(`\n  capsule (r ${CAPSULE_R}, ${CAPSULE_H} m, step ${STEP_UP}): ${pass ? "PASS" : "FAIL"} — gets from the parking to s=${reached.toFixed(2)} (x=${reachedX.toFixed(2)}, walking at y=${f2(refHeight(F, reached))})${pass ? "" : `, stopped ${(st.run - reached).toFixed(2)} m short of the head`}`);
    console.log(`  narrowest free band for the capsule's centre on the flight: ${narrow.w.toFixed(2)} m at x=${F.toWorld(narrow.s, 0)[0].toFixed(2)} (needs > 0)`);
    if (!pass) {
        // What stands just ahead of where it stopped?
        const ahead = new Map();
        for (let j = 0; j < NU; j++) {
            const u = uMin + j * du;
            if (Math.abs(u) > F.half - CAPSULE_R) continue;
            const s = reached + CAPSULE_R + 0.05;
            const H = refHeight(F, reached);
            const [x, z] = F.toWorld(s, u);
            for (const h of obstaclesAt(x, z, H)) ahead.set(h.id, `${h.type} at y=${r3(h.y0)}..${r3(h.y1)} (${r3(h.y0 - H)} m above the walk)`);
        }
        for (const [id, what] of ahead) console.log(`    blocked (across the walking line, ${CAPSULE_R} m ahead of the capsule's centre) by ${id}: ${what}`);
    }

    // --- 4. holes in the walking surface past the head -----------------
    const gaps = [];
    for (let s = st.run + 0.01; s <= st.run + 1.0; s += 0.02) {
        for (let u = -F.half + 0.01; u <= F.half - 0.01; u += 0.02) {
            const [x, z] = F.toWorld(s, u);
            const H = refHeight(F, s);
            if (walkSurface(F, s, u, H) == null) gaps.push([x, z]);
        }
    }
    if (gaps.length) {
        // Group the samples into runs along z.
        const zs = [...new Set(gaps.map((g) => r3(g[1])))].sort((a, b) => a - b);
        const runs = [];
        for (const z of zs) {
            if (runs.length && z - runs.at(-1)[1] <= 0.021) runs.at(-1)[1] = z;
            else runs.push([z, z]);
        }
        for (const [za, zb] of runs) {
            const xs = gaps.filter((g) => g[1] >= za - 1e-6 && g[1] <= zb + 1e-6).map((g) => g[0]);
            console.log(`  GAP past the head (no slab, no tread, terrain holed): x ${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}, z ${za.toFixed(2)}..${zb.toFixed(2)} (±1 cm)`);
        }
    } else console.log("  no gap in the walking surface past the head");
    // Strips between the flight's sides and the cheeks: open to the void under the flight?
    for (const side of [-1, 1]) {
        let open = 0;
        let ledge = 0;
        for (let s = 0.05; s < st.run; s += 0.05) {
            for (let u = F.half + 0.005; u < F.half + 0.1; u += 0.01) {
                const [x, z] = F.toWorld(s, side * u);
                const solid = elements.some((e) => e.kind === "solid" && pointInPoly(x, z, e.poly));
                const t = terrainAt(x, z);
                if (solid) break;
                if (t == null) open++;
                else if (t > F.ramp(s)) ledge++;
            }
        }
        if (open || ledge) console.log(`  side ${side > 0 ? "+u (south)" : "-u (north)"}: between the flight's edge and the next wall: ${open} samples open to the void under the flight, ${ledge} samples of terrain sheet hanging above the treads`);
    }

    // --- 5. near-coplanar horizontal faces over the flight ---------------
    const tops = [];
    for (const k of F.steps) tops.push({ id: `${st.id} tread ${k.i + 1}`, y: k.top, finish: st.finish, poly: [F.toWorld(k.s0, -F.half), F.toWorld(k.s1, -F.half), F.toWorld(k.s1, F.half), F.toWorld(k.s0, F.half)] });
    for (const e of elements) {
        if (e.kind === "visual") continue;
        const local = e.poly.map(F.toLocal);
        if (clipRect(local, corridorRect).length < 3) continue;
        tops.push({ id: e.id, y: e.y1, finish: e.topFinish ?? e.finish ?? e.type, poly: e.poly });
    }
    const zf = [];
    for (let a = 0; a < tops.length; a++) {
        for (let b = a + 1; b < tops.length; b++) {
            const A = tops[a];
            const B = tops[b];
            if (A.id === B.id || Math.abs(A.y - B.y) > ZFIGHT) continue;
            const ov = clipRect(A.poly, bbox(B.poly));
            const ov2 = ov.length >= 3 ? clipRect(B.poly, bbox(ov)) : [];
            if (ov2.length < 3 || area(ov2) < 1e-4) continue;
            const [x0, z0, x1, z1] = bbox(ov2);
            zf.push(`${A.id} (y ${r3(A.y)}, ${A.finish}) vs ${B.id} (y ${r3(B.y)}, ${B.finish}): ${r3(Math.abs(A.y - B.y) * 1000)} mm apart over x ${x0.toFixed(2)}..${x1.toFixed(2)} z ${z0.toFixed(2)}..${z1.toFixed(2)}${A.finish === B.finish ? " — same finish, world-projected UVs: benign" : ""}`);
        }
    }
    if (zf.length) for (const line of zf) console.log(`  Z-FIGHT ${line}`);
    else console.log("  no near-coplanar horizontal faces over the flight");
}

console.log(`\n${failures ? `${failures} flight(s) FAIL` : "all flights PASS"}${SIM ? " (with the proposed fixes)" : ""}`);
process.exitCode = failures ? 1 : 0;

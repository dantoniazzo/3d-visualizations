#!/usr/bin/env node
/**
 * Building C (Ladonia Residence, space "kosinozici-villas") audit: furniture,
 * doors, stairs, reachability, spacing and daylight, in C's own frame
 * (building-local: site minus [2.5, -21]).
 *
 *   node furniture-check-c.mjs            # the seeded scenes/kosinozici-villas.json
 *   node furniture-check-c.mjs --live     # scripts/spaces/ladonia/index.js run through validateScene (no reseed needed)
 *   node furniture-check-c.mjs --map      # also print ASCII maps of each level (0.1 m a character)
 *   node furniture-check-c.mjs --all      # also print the per-room inventory
 *   node furniture-check-c.mjs --src DIR  # check a copy of scripts/spaces/ladonia instead (implies --live)
 *   node furniture-check-c.mjs --budget N # as if SceneBuilder.MESH_COLLISION_BUDGET were N (default 12000, as the app)
 *   node furniture-check-c.mjs --probe L,x0,z0,x1,z1  # print the walk raster's cells along a segment on level L
 *
 * Read-only: it imports the generator modules but writes nothing.
 *
 * Furniture is measured from its real meshes (the GLBs' triangles rasterised
 * at 2 cm, each cell keeping its lowest and highest y), so an L-shaped sofa,
 * a bed's frame vs its wider headboard, or a floating nightstand under it are
 * judged as drawn, not by their bounding boxes. The walk raster uses each
 * piece as the game collides with it (mesh, or its box when it has opening
 * doors/drawers or more triangles than MESH_COLLISION_BUDGET, 12000).
 *
 * Each furniture line carries the furnish.js call that made it (stack traces
 * of an instrumented re-run of buildingC), e.g. "furnishC:447" or
 * "furnishC:410>endFlat:377 [mirrored]".
 *
 * Paths: the repo is found from this file's location (four directories up:
 * checks -> build-property-space -> skills -> .claude -> repo); set REPO=<dir>
 * to check another checkout.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const ARGV = process.argv.slice(2);
const ARGS = new Set(ARGV);
/** `--src DIR`: a copy of scripts/spaces/ladonia to check instead (implies --live). */
const SRC = ARGV.includes("--src") ? resolve(ARGV[ARGV.indexOf("--src") + 1]) : null;
const LAD = SRC ?? `${ROOT}/scripts/spaces/ladonia`;
if (SRC) ARGS.add("--live");
const TAG = "c-";
const OFF = [2.5, -21];
// C's floors: its ground floor's elevation (C1's living room), a storey (3.2) and two up. Derived, so a lowered C still checks.
let LEVELS = [0, 3.2, 6.4];
const LEVEL_NAME = ["ground", "first", "roof"];
const R = 0.35; // capsule radius
const HEAD = 1.9; // capsule top above the feet
const STEP = 0.3; // what the capsule rides over (its sphere's lower half)
const CELL = 0.05; // walk raster
const OCC = 0.02; // furniture occupancy raster
const SLAB = 0.25; // floor slab under each upper floor
const RAIL_H = 0.95;

const round = (n, k = 2) => (Number.isFinite(n) ? Number(n.toFixed(k)) : n);
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));
const pt = (p) => `(${f2(p[0])}, ${f2(p[1])})`;
const loc = ([x, z]) => [x - OFF[0], z - OFF[1]];

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
let scene;
const deriveLevels = () => {
    const g = scene.rooms.find((r) => r.id === "c-g-c1-living")?.elevation ?? 0;
    const f = scene.rooms.find((r) => r.id === "c-f-c4-living")?.elevation ?? g + 3.2;
    const t = scene.rooms.find((r) => r.id === "c-r-c4")?.elevation ?? f + 3.2;
    LEVELS = [g, f, t];
};
if (ARGS.has("--live")) {
    const { ladonia } = await import(`${LAD}/index.js`);
    const { validateScene } = await import(`${ROOT}/server/scene/validate.js`);
    scene = validateScene(JSON.parse(JSON.stringify(ladonia))).scene;
} else {
    scene = JSON.parse(readFileSync(`${ROOT}/scenes/kosinozici-villas.json`, "utf8")).scene;
}
deriveLevels();
const CATALOG = JSON.parse(readFileSync(`${ROOT}/public/models/furniture/catalog.json`, "utf8"));
const CAT = Object.fromEntries(CATALOG.items.map((i) => [i.id, i]));
const SOUTHWARD = new Set(["wc", "washing-machine", "fridge", "kitchen-run", "nightstand", "wardrobe", "microwave"]);

// --- where each piece came from in furnish.js -------------------------------
const ORIGIN = new Map();
{
    const src = readFileSync(`${LAD}/furnish.js`, "utf8").split("\n");
    const starts = [];
    src.forEach((l, i) => {
        const m = l.match(/^(?:export )?function (\w+)\(/);
        if (m) starts.push([i + 1, m[1]]);
    });
    const fnAt = (line) => {
        if (line >= 103 && line <= 118 && /mirrored/.test(src[102] ?? "")) return "mirrored";
        let name = "?";
        for (const [l, n] of starts) if (l <= line) name = n;
        return name;
    };
    const { Building } = await import(`${LAD}/kit.js`);
    const { buildingC } = await import(`${LAD}/c.js`);
    const { furnishC } = await import(`${LAD}/furnish.js`);
    const orig = Building.prototype.put;
    Building.prototype.put = function (...a) {
        orig.apply(this, a);
        const id = this.out.furniture.at(-1).id;
        const frames = new Error().stack
            .split("\n")
            .map((l) => l.match(/furnish\.js:(\d+)/))
            .filter(Boolean)
            .map((m) => +m[1])
            .reverse(); // outermost first
        const helpers = new Set(["put", "against", "kitchen", "hang", "dining", "roundSet", "size", "mirrored"]);
        const named = frames.map((l) => [fnAt(l), l]);
        const keep = named.filter(([n]) => !helpers.has(n));
        const mirroredCall = named.some(([n]) => n === "mirrored");
        const via = named.filter(([n]) => helpers.has(n) && n !== "mirrored" && n !== "size").map(([n]) => n)[0];
        ORIGIN.set(id, `${keep.map(([n, l]) => `${n}:${l}`).join(">")}${via ? ` via ${via}()` : ""}${mirroredCall ? " [mirrored]" : ""}`);
    };
    try {
        buildingC("c", OFF, { furnish: furnishC });
    } finally {
        Building.prototype.put = orig;
    }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
function polyArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const [x1, z1] = p[i];
        const [x2, z2] = p[(i + 1) % p.length];
        a += x1 * z2 - x2 * z1;
    }
    return a / 2;
}
function inPoly([x, z], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}
function segDist(p, a, b) {
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    const q = add(a, mul(ab, t));
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
}
function polyDist(p, poly) {
    if (inPoly(p, poly)) return 0;
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
    return d;
}
function clipConvex(subject, clip) {
    const sgn = Math.sign(polyArea(clip)) || 1;
    let out = subject;
    for (let i = 0; i < clip.length && out.length; i++) {
        const A = clip[i];
        const B = clip[(i + 1) % clip.length];
        const side = (P) => sgn * ((B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]));
        const inp = out;
        out = [];
        for (let j = 0; j < inp.length; j++) {
            const P = inp[j];
            const Q = inp[(j + 1) % inp.length];
            const sp = side(P);
            const sq = side(Q);
            if (sp >= -1e-12) out.push(P);
            if ((sp >= -1e-12) !== (sq >= -1e-12)) {
                const t = sp / (sp - sq);
                out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
            }
        }
    }
    return out;
}
const overlapArea = (a, b) => (a.length && b.length ? Math.abs(polyArea(clipConvex(a, b))) : 0);
function bbox(poly) {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const [x, z] of poly) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
    }
    return [x0, z0, x1, z1];
}
const bbHit = (a, b, pad = 0) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];
/** The rectangle o + u·s + n·l, s ∈ [s0, s1], l ∈ [l0, l1], n = u turned to the left in plan (side A). */
function rectAlong(o, u, s0, s1, l0, l1) {
    const n = [-u[1], u[0]];
    return [
        add(o, add(mul(u, s0), mul(n, l0))),
        add(o, add(mul(u, s1), mul(n, l0))),
        add(o, add(mul(u, s1), mul(n, l1))),
        add(o, add(mul(u, s0), mul(n, l1))),
    ];
}
const rot = (lx, lz, th) => [lx * Math.cos(th) + lz * Math.sin(th), -lx * Math.sin(th) + lz * Math.cos(th)];
function obb(cx, cz, w, d, th) {
    return [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
    ].map(([a, b]) => add([cx, cz], rot(a, b, th)));
}
const vOverlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// ---------------------------------------------------------------------------
// Building C's parts, in its own frame
// ---------------------------------------------------------------------------
const levelOf = (y) => {
    let k = 0;
    for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i] <= y + 0.02) k = i;
    return k;
};

const rooms = scene.rooms
    .filter((r) => r.id.startsWith(TAG))
    .map((r) => ({ id: r.id, name: r.name, poly: r.polygon.map(loc), elev: r.elevation, h: r.height, open: r.ceiling_finish === "none", level: levelOf(r.elevation) }));

const walls = scene.walls
    .filter((w) => w.id.startsWith(TAG))
    .map((w) => {
        const a = loc(w.start);
        const b = loc(w.end);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const n = [-u[1], u[0]];
        const base = w.base_height;
        const top = base + w.height;
        return {
            id: w.id,
            a,
            b,
            u,
            n,
            len,
            t: w.thickness,
            base,
            top,
            poly: rectAlong(a, u, 0, len, -w.thickness / 2, w.thickness / 2),
            openings: w.openings.map((o) => ({
                ...o,
                wall: w.id,
                s0: o.offset - o.width / 2,
                s1: o.offset + o.width / 2,
                y0: base + (o.sill ?? 0),
                y1: base + (o.sill ?? 0) + o.height,
            })),
        };
    });
walls.forEach((w) => (w.bb = bbox(w.poly)));
const passable = (o) => o.type === "door" || o.type === "doorway";
/** The wall's solid parts in the height band [y0, y1], openings that span the whole band (and `keep`) cut out. */
function wallSolids(w, y0, y1, keep = () => true) {
    if (w.top <= y0 + 1e-6 || w.base >= y1 - 1e-6) return [];
    const lo = Math.max(y0, w.base);
    const hi = Math.min(y1, w.top);
    let segs = [[0, w.len]];
    for (const o of w.openings) {
        if (!keep(o)) continue;
        if (!(o.y0 <= lo + 1e-6 && o.y1 >= hi - 1e-6)) continue;
        segs = segs.flatMap(([p, q]) => {
            const r = [];
            if (o.s0 > p) r.push([p, Math.min(q, o.s0)]);
            if (o.s1 < q) r.push([Math.max(p, o.s1), q]);
            return r.filter(([m, k]) => k - m > 1e-6);
        });
    }
    return segs.map(([p, q]) => rectAlong(w.a, w.u, p, q, -w.t / 2, w.t / 2));
}

const holes = scene.floor_openings
    .filter((h) => h.id.startsWith(TAG))
    .map((h) => {
        const c = loc(h.position);
        const poly = obb(c[0], c[1], h.width, h.depth, ((h.yaw || 0) * Math.PI) / 180);
        return { ...h, c, poly, level: levelOf(h.elevation) };
    });

// Things that block like walls: rails, planters, pergola posts and screens, hedges, garden walls.
const blockers = [];
for (const h of holes) {
    const hw = h.width / 2 + (h.rail_offset_x ?? 0.05);
    const hd = h.depth / 2 + 0.05;
    const ends = { "x-": [[-hw, -hd], [-hw, hd]], "x+": [[hw, -hd], [hw, hd]], "z-": [[-hw, -hd], [hw, -hd]], "z+": [[-hw, hd], [hw, hd]] };
    for (const side of h.rails ?? []) {
        const [p, q] = ends[side].map(([x, z]) => add(h.c, rot(x, z, ((h.yaw || 0) * Math.PI) / 180)));
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const u = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
        blockers.push({ id: `${h.id}:rail ${side}`, kind: "rail", poly: rectAlong(p, u, 0, len, -0.03, 0.03), base: h.elevation, top: h.elevation + RAIL_H, a: p, b: q });
    }
}
const L = scene.landscape ?? {};
for (const p of L.planters ?? []) {
    if (!p.id.startsWith(TAG)) continue;
    for (let i = 0; i < p.path.length - 1; i++) {
        const a = loc(p.path[i]);
        const b = loc(p.path[i + 1]);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        blockers.push({ id: p.id, kind: "planter", poly: rectAlong(a, u, -p.width / 2, len + p.width / 2, -p.width / 2, p.width / 2), base: p.base, top: p.base + p.height });
    }
}
for (const g of L.pergolas ?? []) {
    if (!g.id.startsWith(TAG)) continue;
    const [X0, Z0, X1, Z1] = g.box;
    const [x0, z0] = loc([X0, Z0]);
    const [x1, z1] = loc([X1, Z1]);
    const post = 0.12;
    const against = g.posts === "all" ? [] : [].concat(g.against ?? "z0");
    const posts = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        const fixed = (x === x0 && against.includes("x0")) || (x === x1 && against.includes("x1")) || (z === z0 && against.includes("z0")) || (z === z1 && against.includes("z1"));
        if (!fixed) posts.push([x === x0 ? x0 + post / 2 : x1 - post / 2, z === z0 ? z0 + post / 2 : z1 - post / 2]);
    }
    for (const [side, length, at] of [
        ["z1", x1 - x0, (t) => [x0 + t * (x1 - x0), z1 - post / 2]],
        ["z0", x1 - x0, (t) => [x0 + t * (x1 - x0), z0 + post / 2]],
        ["x1", z1 - z0, (t) => [x1 - post / 2, z0 + t * (z1 - z0)]],
        ["x0", z1 - z0, (t) => [x0 + post / 2, z0 + t * (z1 - z0)]],
    ]) {
        if (against.includes(side) || g.posts === "corners") continue;
        const spans = Math.ceil(length / (g.span ?? 4.2));
        for (let k = 1; k < spans; k++) posts.push(at(k / spans));
    }
    for (const [x, z] of posts) blockers.push({ id: `${g.id}:post`, kind: "pergola post", poly: obb(x, z, post, post, 0), base: g.base, top: g.base + g.height });
    for (const side of g.screens ?? []) {
        const at = side === "x-" ? x0 + 0.06 : side === "x+" ? x1 - 0.06 : side === "z-" ? z0 + 0.06 : z1 - 0.06;
        const poly = side.startsWith("x") ? obb(at, (z0 + z1) / 2, 0.035, z1 - z0 - 2 * post, 0) : obb((x0 + x1) / 2, at, x1 - x0 - 2 * post, 0.035, 0);
        blockers.push({ id: `${g.id}:screen ${side}`, kind: "pergola screen", poly, base: g.base + 0.05, top: g.base + g.height - 0.22 });
    }
}
const inSite = ([x, z]) => x > -7 && x < 19 && z > -6 && z < 20;
for (const h of L.hedges ?? []) {
    for (let i = 0; i < h.path.length - 1; i++) {
        const a = loc(h.path[i]);
        const b = loc(h.path[i + 1]);
        if (!inSite(a) && !inSite(b)) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-6) continue;
        const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        blockers.push({ id: h.id, kind: "hedge", poly: rectAlong(a, u, 0, len, -h.width / 2, h.width / 2), base: h.base ?? 0, top: (h.base ?? 0) + h.height });
    }
}
for (const w of L.walls ?? []) {
    for (let i = 0; i < w.path.length - 1; i++) {
        const a = loc(w.path[i]);
        const b = loc(w.path[i + 1]);
        if (!inSite(a) && !inSite(b)) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        blockers.push({ id: w.id, kind: "garden wall", poly: rectAlong(a, u, 0, len, -w.thickness / 2, w.thickness / 2), base: w.base, top: w.top });
    }
}
blockers.forEach((b) => (b.bb = bbox(b.poly)));

// Stairs.
const stairs = scene.stairs
    .filter((s) => s.id.startsWith(TAG))
    .map((s) => {
        const foot = loc(s.start);
        const yr = ((s.yaw ?? 0) * Math.PI) / 180;
        const d = [Math.sin(yr), Math.cos(yr)];
        const across = [Math.cos(yr), -Math.sin(yr)];
        const rise = s.top_height - s.base_height;
        const stepRise = rise / s.steps;
        const going = s.run / s.steps;
        const pitch = Math.atan2(rise, s.run);
        const at = (sa, lat = 0) => add(foot, add(mul(d, sa), mul(across, lat)));
        const nosing = (sa) => s.base_height + stepRise / 2 + (rise * sa) / s.run;
        const treadTop = (sa) => s.base_height + Math.min(s.steps, Math.floor(Math.max(0, sa) / going) + 1) * stepRise;
        const slab = s.style === "slab";
        // Visual solid at sa: a slab flight's block under each tread; otherwise solid to the floor.
        const solid = (sa) => {
            const t = treadTop(sa);
            return [slab ? t - Math.min(t - s.base_height, stepRise + 0.17) : s.base_height, t];
        };
        const rampBottom = (sa) => nosing(sa) - 0.3 / Math.cos(pitch);
        const sFoot = Math.max(0.05, ((STEP - stepRise / 2) * s.run) / rise);
        const sHead = Math.min(s.run - 0.05, ((rise - STEP - stepRise / 2) * s.run) / rise);
        const sClear = Math.min(s.run, ((HEAD + 0.3 / Math.cos(pitch) - stepRise / 2) * s.run) / rise);
        const poly = rectAlong(foot, d, 0, s.run, -s.width / 2, s.width / 2).map((p) => p); // n = d turned left
        return { ...s, foot, d, across, rise, stepRise, going, pitch, at, nosing, treadTop, solid, rampBottom, sFoot, sHead, sClear, poly, bb: bbox(poly), base: s.base_height, top: s.top_height, baseLevel: levelOf(s.base_height), topLevel: levelOf(s.top_height) };
    });

// ---------------------------------------------------------------------------
// Furniture, as drawn: each model's triangles rasterised to 2 cm columns
// ---------------------------------------------------------------------------
const MODEL = new Map();
function model(id) {
    if (MODEL.has(id)) return MODEL.get(id);
    const item = CAT[id];
    const buf = readFileSync(`${ROOT}/public${item.url}`);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
    const binOff = 20 + jsonLen + 8;
    const view = new DataView(buf.buffer, buf.byteOffset + binOff, buf.readUInt32LE(20 + jsonLen));
    const read = (ai) => {
        const a = gltf.accessors[ai];
        const bv = gltf.bufferViews[a.bufferView];
        const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
        const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType];
        const stride = bv.byteStride || comps * size;
        const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
        const out = new Float64Array(a.count * comps);
        for (let i = 0; i < a.count; i++)
            for (let c = 0; c < comps; c++) {
                const o = base + i * stride + c * size;
                out[i * comps + c] = a.componentType === 5126 ? view.getFloat32(o, true) : a.componentType === 5125 ? view.getUint32(o, true) : a.componentType === 5123 ? view.getUint16(o, true) : view.getUint8(o);
            }
        return out;
    };
    const matOf = (n) => {
        if (n.matrix) return n.matrix;
        const [tx, ty, tz] = n.translation ?? [0, 0, 0];
        const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
        const [sx, sy, sz] = n.scale ?? [1, 1, 1];
        const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
        return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
    };
    const mm = (a, b) => {
        const o = new Array(16).fill(0);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
        return o;
    };
    const tris = [];
    let opens = false;
    const visit = (ni, P) => {
        const n = gltf.nodes[ni];
        if (n.extras?.opens) opens = true;
        const M = mm(P, matOf(n));
        if (n.mesh != null)
            for (const prim of gltf.meshes[n.mesh].primitives) {
                if ((prim.mode ?? 4) !== 4) continue;
                const pos = read(prim.attributes.POSITION);
                const idx = prim.indices != null ? read(prim.indices) : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
                const v = (i) => {
                    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
                    return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
                };
                for (let i = 0; i + 2 < idx.length; i += 3) tris.push([v(idx[i]), v(idx[i + 1]), v(idx[i + 2])]);
            }
        for (const c of n.children ?? []) visit(c, M);
    };
    for (const ni of gltf.scenes[gltf.scene ?? 0].nodes) visit(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const yaw = ((item.yaw ?? 0) * Math.PI) / 180;
    const sc = item.scale ?? 1;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of tris)
        for (const p of t) {
            const [x, z] = rot(p[0] * sc, p[2] * sc, yaw);
            p[0] = x;
            p[1] *= sc;
            p[2] = z;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
        }
    const nx = Math.max(1, Math.round((x1 - x0) / OCC));
    const nz = Math.max(1, Math.round((z1 - z0) / OCC));
    const cx = (x1 - x0) / nx;
    const cz = (z1 - z0) / nz;
    const lo = new Float32Array(nx * nz).fill(Infinity);
    const hi = new Float32Array(nx * nz).fill(-Infinity);
    // Conservative triangle-vs-cell overlap in plan (SAT), each cell keeping the y range it is covered over.
    for (const [A, B, C] of tris) {
        const tx0 = Math.min(A[0], B[0], C[0]), tx1 = Math.max(A[0], B[0], C[0]);
        const tz0 = Math.min(A[2], B[2], C[2]), tz1 = Math.max(A[2], B[2], C[2]);
        const ty0 = Math.min(A[1], B[1], C[1]), ty1 = Math.max(A[1], B[1], C[1]);
        const i0 = Math.max(0, Math.floor((tx0 - x0) / cx)), i1 = Math.min(nx - 1, Math.floor((tx1 - x0) / cx));
        const j0 = Math.max(0, Math.floor((tz0 - z0) / cz)), j1 = Math.min(nz - 1, Math.floor((tz1 - z0) / cz));
        const P = [[A[0], A[2]], [B[0], B[2]], [C[0], C[2]]];
        const axes = [];
        for (let e = 0; e < 3; e++) {
            const [p, q] = [P[e], P[(e + 1) % 3]];
            const ax = [-(q[1] - p[1]), q[0] - p[0]];
            if (Math.hypot(...ax) > 1e-9) axes.push(ax);
        }
        for (let i = i0; i <= i1; i++)
            for (let j = j0; j <= j1; j++) {
                const cx0 = x0 + i * cx, cz0 = z0 + j * cz;
                const corners = [[cx0, cz0], [cx0 + cx, cz0], [cx0, cz0 + cz], [cx0 + cx, cz0 + cz]];
                let sep = false;
                for (const ax of axes) {
                    const tp = P.map((p) => dot(p, ax));
                    const cp = corners.map((p) => dot(p, ax));
                    if (Math.max(...tp) < Math.min(...cp) - 1e-9 || Math.max(...cp) < Math.min(...tp) - 1e-9) {
                        sep = true;
                        break;
                    }
                }
                if (sep) continue;
                const k = j * nx + i;
                if (ty0 < lo[k]) lo[k] = ty0;
                if (ty1 > hi[k]) hi[k] = ty1;
            }
    }
    const cells = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (hi[j * nx + i] >= lo[j * nx + i]) cells.push([x0 + (i + 0.5) * cx, z0 + (j + 0.5) * cz, lo[j * nx + i], hi[j * nx + i]]);
    const info = { tris: tris.length, opens, x0, x1, z0, z1, y0, y1, nx, nz, lo, hi, cells };
    MODEL.set(id, info);
    return info;
}

function kindOf(id) {
    const item = CAT[id];
    if (item.size[1] < 0.035) return "rug";
    if (item.anchor === "ceiling") return "pendant";
    if (item.anchor === "wall") return "walllight";
    if (/curtain|sheer/.test(id)) return "curtain";
    if (id === "tv") return "tv";
    if (/nightstand/.test(id)) return "nightstand";
    if (/bed-single/.test(id)) return "bed1";
    if (/(^|-)bed($|-)/.test(id)) return "bed2";
    if (/wardrobe/.test(id)) return "wardrobe";
    if (/^ld-(kitchen|counter|peninsula)/.test(id)) return "kitchen";
    if (id === "wc") return "wc";
    if (id === "shower") return "shower";
    if (id === "vanity") return "vanity";
    if (id === "washing-machine") return "washer";
    if (/sofa/.test(id)) return "sofa";
    if (id === "armchair" || /lounge/.test(id)) return "armchair";
    if (/chair/.test(id)) return "chair";
    if (/dining|table/.test(id)) return "table";
    if (/stump|coffee|out-side/.test(id)) return "small";
    if (/sideboard|media/.test(id)) return "storage";
    return "other";
}

const furn = scene.furniture
    .filter((f) => f.id.startsWith(TAG))
    .map((f) => {
        const item = CAT[f.catalog_id];
        const s = f.scale ?? 1;
        const [w, h, d] = item.size.map((v) => v * s);
        const [x, z] = loc([f.position[0], f.position[2]]);
        const y = f.position[1];
        const th = (f.rotation * Math.PI) / 180;
        const south = SOUTHWARD.has(f.catalog_id);
        const front = south ? [Math.sin(th), Math.cos(th)] : [-Math.sin(th), -Math.cos(th)];
        const m = model(f.catalog_id);
        // World columns of the drawn mesh.
        const cells = m.cells.map(([lx, lz, y0, y1]) => {
            const [wx, wz] = rot(lx * s, lz * s, th);
            return [x + wx, z + wz, y + y0 * s, y + y1 * s];
        });
        const level = levelOf(y);
        const kind = kindOf(f.catalog_id);
        const poly = obb(x, z, w, d, th);
        // SceneBuilder.MESH_COLLISION_BUDGET (12000): heavier pieces, and any with opening doors, collide as their box.
        // `--budget N` checks as if it were N.
        const budget = ARGV.includes("--budget") ? Number(ARGV[ARGV.indexOf("--budget") + 1]) : 12000;
        const mode = item.collision === "box" || item.collision === "mesh" ? item.collision : m.opens || m.tris > budget ? "box" : "mesh";
        return { id: f.id, cat: f.catalog_id, x, z, y, th, rot: f.rotation, w, h, d, front, level, kind, poly, bb: bbox(poly), cells, mode, origin: ORIGIN.get(f.id) ?? "?", item };
    });
const byId = Object.fromEntries(furn.map((p) => [p.id, p]));
const roomAt = (p, level) => rooms.find((r) => r.level === level && inPoly(p, r.poly));
const label = (p) => `${p.id} ${p.cat} @${pt([p.x, p.z])} y${f2(p.y)} rot${p.rot} [${p.origin}]`;

// Stacked decor: a piece standing on another's top.
for (const p of furn) {
    if (p.y - LEVELS[p.level] < 0.3 || ["pendant", "walllight", "nightstand"].includes(p.kind)) continue;
    const sup = furn.find((q) => q !== p && Math.abs(q.y + q.h - p.y) < 0.06 && overlapArea(p.poly, q.poly) > 0.5 * Math.abs(polyArea(p.poly)));
    if (sup) p.on = sup.id;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const issues = [];
let section = "";
function issue(code, text) {
    issues.push({ section, code, text });
    console.log(`  [${code}] ${text}`);
}
function head(title) {
    section = title;
    console.log(`\n=== ${title} ===`);
}

console.log(`Building C audit — ${ARGS.has("--live") ? `live generator ${LAD} (validated)` : "seeded scenes/kosinozici-villas.json"}; building-local coordinates (site − [${OFF}]).`);
console.log(`${rooms.length} rooms, ${walls.length} walls, ${stairs.length} stairs, ${holes.length} floor openings, ${furn.length} pieces.`);

// --- 0. pieces in rooms ------------------------------------------------------
head("0. Which room each piece stands in");
const ROOM_RULE = {
    bed1: /bedroom/,
    bed2: /bedroom/,
    nightstand: /bedroom/,
    wardrobe: /bedroom|hall/,
    wc: /bathroom|WC/,
    shower: /bathroom/,
    vanity: /bathroom|WC/,
    washer: /bathroom|laundry|kitchen/,
    kitchen: /kitchen/,
    sofa: /living|terrace/,
    storage: /living/,
    tv: /living/,
};
for (const p of furn) {
    const r = roomAt([p.x, p.z], p.level);
    p.room = r;
    const corners = p.kind === "rug" || p.kind === "pendant" ? [] : p.poly;
    const out = corners.filter((c) => {
        const inner = add(c, mul(sub([p.x, p.z], c), 0.03 / Math.max(0.03, Math.hypot(p.x - c[0], p.z - c[1]))));
        return !rooms.some((q) => q.level === p.level && inPoly(inner, q.poly));
    });
    if (!r) {
        if (p.level > 0 || !/^ld-out/.test(p.cat)) issue("ROOM-NONE", `${label(p)} stands in no room at the ${LEVEL_NAME[p.level]} floor.`);
        continue;
    }
    const rule = ROOM_RULE[p.kind];
    if (rule && !rule.test(r.name)) issue("ROOM-WRONG", `${label(p)} is a ${p.kind} in "${r.name}".`);
    const spill = corners.map((c) => roomAt(c, p.level)).filter((q) => q && q !== r);
    if (spill.length) issue("ROOM-SPAN", `${label(p)} spans "${r.name}" and "${[...new Set(spill.map((q) => q.name))].join('", "')}".`);
    else if (out.length && !["pendant", "walllight", "curtain", "rug"].includes(p.kind)) issue("ROOM-EDGE", `${label(p)} has ${out.length} corner(s) outside every room at its floor (beyond "${r.name}"'s outline): ${out.map(pt).join(" ")}.`);
}

// --- 1. furniture vs furniture ----------------------------------------------
head("1. Furniture overlapping furniture (as drawn: 2 cm mesh columns; rugs on rugs only)");
function cellOverlap(p, q, minV = 0.03) {
    // q's columns, hashed at 2 cm.
    const grid = new Map();
    for (const c of q.cells) grid.set(`${Math.round(c[0] / OCC)},${Math.round(c[1] / OCC)}`, c);
    let n = 0;
    let vmax = 0;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of p.cells) {
        const o = grid.get(`${Math.round(c[0] / OCC)},${Math.round(c[1] / OCC)}`);
        if (!o) continue;
        const v = vOverlap(c[2], c[3], o[2], o[3]);
        if (v <= minV) continue;
        n++;
        vmax = Math.max(vmax, v);
        x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); z0 = Math.min(z0, c[1]); z1 = Math.max(z1, c[1]);
    }
    return { area: n * OCC * OCC, vmax, box: n ? [x0 - OCC / 2, z0 - OCC / 2, x1 + OCC / 2, z1 + OCC / 2] : null };
}
for (let i = 0; i < furn.length; i++)
    for (let j = i + 1; j < furn.length; j++) {
        const p = furn[i];
        const q = furn[j];
        if (!bbHit(p.bb, q.bb)) continue;
        if (vOverlap(p.y, p.y + p.h, q.y, q.y + q.h) <= 0.01) continue;
        const rugs = (p.kind === "rug") + (q.kind === "rug");
        if (rugs === 1) continue;
        if (p.on === q.id || q.on === p.id) continue;
        const o = cellOverlap(p, q);
        if (o.area < 0.0024) continue;
        // A chair tucked under its own table touches it: not worth a line.
        if (o.area < 0.01 && [p.kind, q.kind].sort().join() === "chair,table") continue;
        const [bx0, bz0, bx1, bz1] = o.box;
        issue(rugs === 2 ? "ZF-RUG" : "OVL", `${label(p)}  ×  ${label(q)}: ${round(o.area, 3)} m² of mesh overlap, region x ${f2(bx0)}..${f2(bx1)} z ${f2(bz0)}..${f2(bz1)} (${f2(bx1 - bx0)} × ${f2(bz1 - bz0)} m), ${f2(o.vmax)} m deep in y.`);
    }

// --- 2. furniture vs walls, rails, stairs, holes, planters -------------------
head("2. Furniture into walls, rails, planters, stairs and floor openings (mesh columns)");
for (const p of furn) {
    if (p.kind === "rug") continue;
    for (const w of walls) {
        if (!bbHit(p.bb, w.bb, 0.01)) continue;
        if (vOverlap(p.y, p.y + p.h, w.base, w.top) <= 0.005) continue;
        const side = Math.sign(dot(sub([p.x, p.z], w.a), w.n)) || 1;
        let pen = 0;
        let inOpen = null;
        let s0 = Infinity, s1 = -Infinity;
        for (const c of p.cells) {
            const rel = sub([c[0], c[1]], w.a);
            const s = dot(rel, w.u);
            const l = dot(rel, w.n);
            if (s < -0.001 || s > w.len + 0.001 || Math.abs(l) >= w.t / 2 - 0.006) continue;
            if (vOverlap(c[2], c[3], w.base, w.top) <= 0.004) continue;
            const o = w.openings.find((o) => s >= o.s0 && s <= o.s1 && c[2] >= o.y0 - 0.001 && c[3] <= o.y1 + 0.001);
            if (o) {
                inOpen = o;
                continue;
            }
            pen = Math.max(pen, w.t / 2 - side * l);
            s0 = Math.min(s0, s);
            s1 = Math.max(s1, s);
        }
        if (pen > 0.015) issue("WALL", `${label(p)} is ${f2(pen)} m into wall ${w.id} (t ${w.t}, ${f2(w.base)}–${f2(w.top)} m) along ${f2(s0)}..${f2(s1)} m of it.`);
        if (inOpen) issue("WALL-OPEN", `${label(p)} reaches into ${inOpen.type} ${inOpen.id} of ${w.id} (width ${inOpen.width}, sill ${f2(inOpen.y0 - w.base)}).`);
    }
    for (const b of blockers) {
        if (!bbHit(p.bb, b.bb) || vOverlap(p.y, p.y + p.h, b.base, b.top) <= 0.005) continue;
        const n = p.cells.filter((c) => inPoly([c[0], c[1]], b.poly) && vOverlap(c[2], c[3], b.base, b.top) > 0.004).length;
        if (n * OCC * OCC > 0.001) issue("BLOCKER", `${label(p)} overlaps ${b.kind} ${b.id} by ${round(n * OCC * OCC, 3)} m².`);
    }
    for (const s of stairs) {
        if (!bbHit(p.bb, s.bb)) continue;
        let n = 0;
        let worst = 0;
        for (const c of p.cells) {
            const rel = sub([c[0], c[1]], s.foot);
            const sa = dot(rel, s.d);
            const lat = dot(rel, s.across);
            if (sa < 0 || sa > s.run || Math.abs(lat) > s.width / 2) continue;
            const [b0, b1] = s.solid(sa);
            const v = Math.max(vOverlap(c[2], c[3], b0, b1), vOverlap(c[2], c[3], s.rampBottom(sa), s.nosing(sa)));
            if (v > 0.01) {
                n++;
                worst = Math.max(worst, v);
            }
        }
        if (n * OCC * OCC > 0.001) issue("STAIR-CLASH", `${label(p)} is inside flight ${s.id} (its steps or ramp) over ${round(n * OCC * OCC, 3)} m², up to ${f2(worst)} m in y.`);
    }
    for (const h of holes) {
        if (p.level !== h.level) continue;
        if (!["pendant"].includes(p.kind) && inPoly([p.x, p.z], h.poly)) issue("HOLE", `${label(p)} stands over floor opening ${h.id}.`);
    }
}

// --- walk raster ---------------------------------------------------------------
const GX0 = -6;
const GZ0 = -5;
const NX = Math.round((18.5 - GX0) / CELL);
const NZ = Math.round((19 - GZ0) / CELL);
const cellOf = ([x, z]) => {
    const i = Math.floor((x - GX0) / CELL);
    const j = Math.floor((z - GZ0) / CELL);
    return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i;
};
const centre = (k) => [GX0 + ((k % NX) + 0.5) * CELL, GZ0 + (Math.floor(k / NX) + 0.5) * CELL];
function fillPoly(mask, poly, value = 1) {
    const [x0, z0, x1, z1] = bbox(poly);
    const i0 = Math.max(0, Math.floor((x0 - GX0) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - GX0) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - GZ0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((z1 - GZ0) / CELL));
    for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
            const c = [GX0 + (i + 0.5) * CELL, GZ0 + (j + 0.5) * CELL];
            if (inPoly(c, poly)) mask[j * NX + i] = value;
        }
}
function edt(obst) {
    // Squared Euclidean distance (in cells) to the nearest obstacle cell (Felzenszwalb).
    const INF = 1e12;
    const f = new Float64Array(Math.max(NX, NZ));
    const dt1 = (src, n) => {
        const v = new Int32Array(n);
        const zz = new Float64Array(n + 1);
        const out = new Float64Array(n);
        let k = 0;
        v[0] = 0;
        zz[0] = -INF;
        zz[1] = INF;
        for (let q = 1; q < n; q++) {
            let s;
            while (true) {
                s = (src[q] + q * q - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
                if (s <= zz[k] && k > 0) k--;
                else break;
            }
            if (s <= zz[k]) {
                // k === 0
                v[0] = q;
                zz[0] = -INF;
                zz[1] = INF;
                continue;
            }
            k++;
            v[k] = q;
            zz[k] = s;
            zz[k + 1] = INF;
        }
        k = 0;
        for (let q = 0; q < n; q++) {
            while (zz[k + 1] < q) k++;
            out[q] = (q - v[k]) * (q - v[k]) + src[v[k]];
        }
        return out;
    };
    const d = new Float64Array(NX * NZ);
    for (let k = 0; k < NX * NZ; k++) d[k] = obst[k] ? 0 : INF;
    for (let i = 0; i < NX; i++) {
        for (let j = 0; j < NZ; j++) f[j] = d[j * NX + i];
        const o = dt1(f.subarray(0, NZ), NZ);
        for (let j = 0; j < NZ; j++) d[j * NX + i] = o[j];
    }
    for (let j = 0; j < NZ; j++) {
        const o = dt1(d.subarray(j * NX, j * NX + NX).slice(), NX);
        for (let i = 0; i < NX; i++) d[j * NX + i] = o[i];
    }
    return d;
}

function buildLevel(li, radius = R) {
    const Lv = LEVELS[li];
    let floor = new Uint8Array(NX * NZ);
    const obst = new Uint8Array(NX * NZ);
    const src = new Int32Array(NX * NZ).fill(-1);
    const SRC_NAMES = [];
    const mark = (name) => {
        SRC_NAMES.push(name);
        return SRC_NAMES.length - 1;
    };
    if (li === 0) floor.fill(1);
    else {
        for (const r of rooms) if (r.level === li) fillPoly(floor, r.poly);
        // Door thresholds (StructureBuilder.addThreshold), and slots under 0.3 m between slabs: the capsule walks over them.
        for (const w of walls) for (const o of w.openings) if (passable(o) && Math.abs(o.y0 - Lv) < 0.05) fillPoly(floor, rectAlong(w.a, w.u, o.s0, o.s1, -w.t / 2 - 0.03, w.t / 2 + 0.03));
        const gap = Math.round(0.15 / CELL) ** 2;
        const out = new Uint8Array(NX * NZ);
        for (let k = 0; k < NX * NZ; k++) out[k] = floor[k];
        const dIn = edt(out);
        const grown = new Uint8Array(NX * NZ);
        for (let k = 0; k < NX * NZ; k++) grown[k] = dIn[k] <= gap ? 0 : 1; // 1 = still outside after growing
        const dOut = edt(grown);
        const closed = new Uint8Array(NX * NZ);
        for (let k = 0; k < NX * NZ; k++) closed[k] = floor[k] || dOut[k] > gap ? 1 : 0;
        floor = closed;
    }
    for (const h of holes) if (h.level === li) fillPoly(floor, h.poly, 0);
    for (const s of stairs) if (s.topLevel === li) fillPoly(floor, rectAlong(s.foot, s.d, s.sHead, s.run + 0.02, -s.width / 2, s.width / 2));
    const band = [Lv + STEP, Lv + HEAD];
    for (const w of walls) {
        const id = mark(`wall ${w.id}`);
        for (const poly of wallSolids(w, band[0], band[1], passable)) fillPolySrc(obst, src, poly, id);
    }
    for (const b of blockers) if (vOverlap(b.base, b.top, ...band) > 0) fillPolySrc(obst, src, b.poly, mark(`${b.kind} ${b.id}`));
    for (const p of furn) {
        if (p.kind === "rug") continue;
        if (vOverlap(p.y, p.y + p.h, ...band) <= 0) continue;
        const id = mark(`${p.id} ${p.cat}`);
        if (p.mode === "box") fillPolySrc(obst, src, p.poly, id);
        else
            for (const c of p.cells) {
                if (vOverlap(c[2], c[3], ...band) <= 0) continue;
                const k = cellOf([c[0], c[1]]);
                if (k >= 0) {
                    obst[k] = 1;
                    src[k] = id;
                }
            }
    }
    // Stairs at their base: the ramp where it stands between STEP and HEAD, dilated sideways and onward only.
    const stairBlock = new Uint8Array(NX * NZ);
    for (const s of stairs) {
        if (s.baseLevel !== li) continue;
        fillPoly(stairBlock, rectAlong(s.foot, s.d, s.sFoot, Math.min(s.run, s.sClear) + radius, -s.width / 2 - radius, s.width / 2 + radius));
    }
    // Stairs passing above other levels (none in C) are ignored.
    const d2 = edt(obst);
    const lim = (radius / CELL) ** 2;
    const free = new Uint8Array(NX * NZ);
    for (let k = 0; k < NX * NZ; k++) free[k] = floor[k] && !stairBlock[k] && d2[k] >= lim - 1e-9 ? 1 : 0;
    return { li, floor, obst, free, d2, stairBlock, src, SRC_NAMES };
}
function fillPolySrc(mask, src, poly, id) {
    const [x0, z0, x1, z1] = bbox(poly);
    const i0 = Math.max(0, Math.floor((x0 - GX0) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - GX0) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - GZ0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((z1 - GZ0) / CELL));
    for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
            const c = [GX0 + (i + 0.5) * CELL, GZ0 + (j + 0.5) * CELL];
            if (inPoly(c, poly)) {
                mask[j * NX + i] = 1;
                src[j * NX + i] = id;
            }
        }
}
/** What stands within `r` of a point on a level's raster. */
function culprits(lvl, p, r = R + 0.02) {
    const k0 = cellOf(p);
    const i0 = k0 % NX;
    const j0 = Math.floor(k0 / NX);
    const n = Math.ceil(r / CELL);
    const found = new Map();
    for (let j = j0 - n; j <= j0 + n; j++)
        for (let i = i0 - n; i <= i0 + n; i++) {
            if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
            const d = Math.hypot(i - i0, j - j0) * CELL;
            if (d > r) continue;
            const k = j * NX + i;
            if (!lvl.obst[k] || lvl.src[k] < 0) continue;
            const name = lvl.SRC_NAMES[lvl.src[k]];
            found.set(name, Math.min(found.get(name) ?? Infinity, d));
        }
    return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([nm, d]) => `${nm} (${f2(d)})`);
}

function solve(radius = R) {
    const lv = LEVELS.map((_, li) => buildLevel(li, radius));
    // Stair corridors.
    const portals = [];
    for (const s of stairs) {
        const res = corridor(s, radius);
        const baseCells = [];
        const topCells = [];
        for (let sa = 0.05; sa <= s.sFoot + 1e-6; sa += CELL / 2)
            for (let lat = -s.width / 2; lat <= s.width / 2 + 1e-6; lat += CELL / 2) {
                const k = cellOf(s.at(sa, lat));
                if (k >= 0 && lv[s.baseLevel].free[k]) baseCells.push(k);
            }
        for (let sa = s.sHead; sa <= s.run + 1e-6; sa += CELL / 2)
            for (let lat = -s.width / 2; lat <= s.width / 2 + 1e-6; lat += CELL / 2) {
                const k = cellOf(s.at(sa, lat));
                if (k >= 0 && lv[s.topLevel].free[k]) topCells.push(k);
            }
        portals.push({ s, ...res, baseCells: [...new Set(baseCells)], topCells: [...new Set(topCells)] });
    }
    // Multi-level BFS from the street entrance.
    const reached = LEVELS.map(() => new Uint8Array(NX * NZ));
    const q = [];
    const seed = (li, k) => {
        if (k < 0 || !lv[li].free[k] || reached[li][k]) return;
        reached[li][k] = 1;
        q.push(li, k);
    };
    const sp = (scene.spawns ?? []).find((x) => x.label === "Building C — entrance");
    const start = sp ? loc([sp.position[0], sp.position[2]]) : loc([17.5, -21 + 5.4]);
    seed(sp ? levelOf(sp.position[1]) : 0, cellOf(start));
    const linked = new Set();
    const portalAt = LEVELS.map(() => new Map());
    for (const P of portals) {
        if (!P.ok) continue;
        for (const k of P.baseCells) portalAt[P.s.baseLevel].set(k, P);
        for (const k of P.topCells) portalAt[P.s.topLevel].set(k, P);
    }
    for (let h = 0; h < q.length; h += 2) {
        const li = q[h];
        const k = q[h + 1];
        const P = portalAt[li].get(k);
        if (P && !linked.has(P.s.id)) {
            linked.add(P.s.id);
            for (const c of P.baseCells) seed(P.s.baseLevel, c);
            for (const c of P.topCells) seed(P.s.topLevel, c);
        }
        const i = k % NX;
        if (i > 0) seed(li, k - 1);
        if (i < NX - 1) seed(li, k + 1);
        if (k >= NX) seed(li, k - NX);
        if (k < NX * (NZ - 1)) seed(li, k + NX);
    }
    return { lv, reached, portals, start };
}

/** Whether the capsule can climb the flight: a BFS along it, each point clear of walls, furniture, rails and slabs overhead. */
function corridor(s, radius = R) {
    const ds = CELL;
    const dl = CELL / 2;
    const ns = Math.floor((s.run - 0.05) / ds) + 1;
    const nl = Math.floor(s.width / dl) + 1;
    const ok = new Uint8Array(ns * nl);
    const why = new Map();
    const disc = [[0, 0]];
    for (let a = 0; a < 16; a++) for (const r of [radius * 0.5, radius * 0.97]) disc.push([r * Math.cos((a * Math.PI) / 8), r * Math.sin((a * Math.PI) / 8)]);
    for (let a = 0; a < ns; a++) {
        const sa = 0.05 + a * ds;
        const t = s.nosing(sa) - s.stepRise / 2;
        const band = [t + STEP, t + HEAD];
        for (let b = 0; b < nl; b++) {
            const lat = -s.width / 2 + b * dl;
            const P = s.at(sa, lat);
            const hits = [];
            for (const w of walls) {
                if (!bbHit(w.bb, [P[0], P[1], P[0], P[1]], radius)) continue;
                // The capsule's rounded top: at d from its axis it reaches only HEAD − r + √(r² − d²).
                const d0 = polyDist(P, w.poly);
                if (d0 >= radius) continue;
                const hh = Math.sqrt(radius * radius - d0 * d0);
                const lo = t + Math.max(STEP, radius - hh);
                const hi = t + HEAD - radius + hh;
                if (wallSolids(w, lo, hi, passable).some((poly) => polyDist(P, poly) < radius)) hits.push(`wall ${w.id} (${f2(w.base)}–${f2(w.top)} m)`);
            }
            for (const bl of blockers) {
                if (vOverlap(bl.base, bl.top, ...band) > 0 && bbHit(bl.bb, [P[0], P[1], P[0], P[1]], radius) && polyDist(P, bl.poly) < radius) hits.push(`${bl.kind} ${bl.id}`);
            }
            for (const p of furn) {
                if (p.kind === "rug" || !bbHit(p.bb, [P[0], P[1], P[0], P[1]], radius) || vOverlap(p.y, p.y + p.h, ...band) <= 0) continue;
                if (p.cells.some((c) => vOverlap(c[2], c[3], ...band) > 0 && Math.hypot(c[0] - P[0], c[1] - P[1]) < radius)) hits.push(`piece ${p.id} ${p.cat}`);
            }
            let hit = hits.length ? hits.join(" + ") : null;
            if (!hit)
                for (const r of rooms) {
                    if (r.elev <= t + STEP || r.elev - SLAB >= t + HEAD) continue;
                    const under = disc.find((o) => {
                        const Q = add(P, o);
                        return inPoly(Q, r.poly) && !holes.some((h) => Math.abs(h.elevation - r.elev) < 0.05 && inPoly(Q, h.poly));
                    });
                    if (under) {
                        hit = `slab of ${r.id} at ${r.elev} (headroom ${f2(r.elev - SLAB - t)} m)`;
                        break;
                    }
                }
            if (hit) why.set(a * nl + b, hit);
            else ok[a * nl + b] = 1;
        }
    }
    // BFS from the foot rows (sa ≤ sFoot) to the head rows (sa ≥ sHead).
    const seen = new Uint8Array(ns * nl);
    const q = [];
    for (let a = 0; a < ns; a++) {
        if (0.05 + a * ds > s.sFoot + 1e-6) break;
        for (let b = 0; b < nl; b++) if (ok[a * nl + b]) {
            seen[a * nl + b] = 1;
            q.push(a * nl + b);
        }
    }
    let far = -1;
    for (let h = 0; h < q.length; h++) {
        const k = q[h];
        const a = Math.floor(k / nl);
        const b = k % nl;
        far = Math.max(far, a);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const A = a + da;
            const B = b + db;
            if (A < 0 || B < 0 || A >= ns || B >= nl) continue;
            const kk = A * nl + B;
            if (ok[kk] && !seen[kk]) {
                seen[kk] = 1;
                q.push(kk);
            }
        }
    }
    const reachedS = 0.05 + far * ds;
    const pass = far >= 0 && reachedS >= s.sHead - 1e-6;
    // What stops it: the commonest reason in the first row it cannot cross.
    let blockedAt = null;
    if (!pass) {
        const a = Math.max(0, far + 1);
        const reasons = new Map();
        for (let b = 0; b < nl; b++) {
            const r = why.get(a * nl + b);
            if (r) for (const one of r.split(" + ")) reasons.set(one, (reasons.get(one) ?? 0) + 1);
        }
        blockedAt = { sa: 0.05 + a * ds, at: s.at(0.05 + a * ds), tread: s.nosing(0.05 + a * ds) - s.stepRise / 2, reasons: [...reasons.entries()].sort((m, n) => n[1] - m[1]).map(([r]) => r) };
    }
    // Narrowest free row.
    let minFree = Infinity;
    for (let a = 0; a < ns; a++) {
        let n = 0;
        for (let b = 0; b < nl; b++) n += ok[a * nl + b];
        minFree = Math.min(minFree, n);
    }
    return { ok: pass, reachedS, blockedAt, minFreeLat: minFree * dl };
}

const sol = solve(R);
const P0reached = (P) => P.baseCells.some((k) => sol.reached[P.s.baseLevel][k]);
const solThin = solve(0.25);
const isReached = (li, p, slack = 0.1, S = sol) => {
    const k0 = cellOf(p);
    if (k0 < 0) return false;
    if (S.reached[li][k0]) return true;
    const n = Math.round(slack / CELL);
    const i0 = k0 % NX;
    const j0 = Math.floor(k0 / NX);
    for (let j = j0 - n; j <= j0 + n; j++)
        for (let i = i0 - n; i <= i0 + n; i++) {
            if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
            if (Math.hypot(i - i0, j - j0) * CELL > slack + 1e-9) continue;
            if (S.reached[li][j * NX + i]) return true;
        }
    return false;
};

// --- 3. doors -------------------------------------------------------------------
head("3. Doors: 0.9 m clear each side, leaf swing, reachable both sides");
const BAND = (Lv) => [Lv + 0.05, Lv + 1.9];
/** The first thing inside a polygon at a level: wall, blocker, piece, stair, hole, or no floor. */
function intrusion(poly, li, { band = BAND(LEVELS[li]), ignore = new Set(), ignoreKinds = new Set(["rug", "walllight", "curtain"]), wallIgnore = null, needFloor = true } = {}) {
    const bb = bbox(poly);
    for (const w of walls) {
        if (w.id === wallIgnore || !bbHit(w.bb, bb)) continue;
        for (const s of wallSolids(w, ...band, passable)) if (overlapArea(s, poly) > 1e-5) return `wall ${w.id}`;
    }
    for (const b of blockers) if (bbHit(b.bb, bb) && vOverlap(b.base, b.top, ...band) > 0 && overlapArea(b.poly, poly) > 1e-5) return `${b.kind} ${b.id}`;
    for (const p of furn) {
        if (ignore.has(p.id) || ignoreKinds.has(p.kind) || !bbHit(p.bb, bb) || vOverlap(p.y, p.y + p.h, ...band) <= 0) continue;
        if (p.cells.some((c) => vOverlap(c[2], c[3], ...band) > 0 && inPoly([c[0], c[1]], poly))) return `piece ${p.id} ${p.cat}`;
    }
    for (const s of stairs) {
        if (!bbHit(s.bb, bb)) continue;
        if (s.baseLevel === li && overlapArea(rectAlong(s.foot, s.d, 0, s.run, -s.width / 2, s.width / 2), poly) > 1e-5) return `flight ${s.id} (its steps)`;
    }
    if (needFloor) {
        for (const h of holes) if (h.level === li && overlapArea(h.poly, poly) > 1e-5) return `floor opening ${h.id}`;
        if (li > 0) {
            const c = poly.reduce((a, p) => add(a, mul(p, 1 / poly.length)), [0, 0]);
            const probes = [c, ...poly.map((p) => add(p, mul(sub(c, p), 0.05)))];
            if (probes.some((q) => !rooms.some((r) => r.level === li && inPoly(q, r.poly)))) return "no floor";
        }
    }
    return null;
}
/** How far a strip runs clear from a base line: s ∈ [s0, s1] along u from o, out along n (unit). */
function clearDepth(o, u, n, s0, s1, max, li, opts = {}) {
    const st = 0.025;
    for (let k = 0; k < max - 1e-9; k += st) {
        const a = add(o, mul(n, k));
        const poly = [add(a, mul(u, s0)), add(a, mul(u, s1)), add(add(a, mul(u, s1)), mul(n, Math.min(st, max - k))), add(add(a, mul(u, s0)), mul(n, Math.min(st, max - k)))];
        const hit = intrusion(poly, li, opts);
        if (hit) return { depth: k, hit };
    }
    return { depth: max, hit: null };
}
const doors = [];
for (const w of walls)
    for (const o of w.openings) {
        if (!passable(o)) continue;
        const li = levelOf(o.y0);
        if (Math.abs(o.y0 - LEVELS[li]) > 0.08) continue;
        doors.push({ w, o, li });
    }
for (const { w, o, li } of doors) {
    const mid = add(w.a, mul(w.u, o.offset));
    const res = [];
    for (const side of [1, -1]) {
        const n = mul(w.n, side);
        // From 6 cm off the face: the threshold strip (and a party wall's top) covers the slot between wall and slab.
        const face = add(mid, mul(n, w.t / 2 + 0.06));
        const c0 = clearDepth(face, w.u, n, -o.width / 2 + 0.03, o.width / 2 - 0.03, 0.845, li, { wallIgnore: w.id });
        const c = { depth: c0.depth + 0.055, hit: c0.hit };
        const probe = add(mid, mul(n, w.t / 2 + 0.4));
        const room = roomAt(probe, li);
        const outside = !room && li === 0;
        const onFlight = sol.portals.find((P) => P.ok && P.s.baseLevel === li && inPoly(probe, P.s.poly));
        const reach = isReached(li, probe) || Boolean(onFlight && P0reached(onFlight));
        const reachThin = isReached(li, probe, 0.1, solThin);
        res.push({ side: side > 0 ? "A" : "B", c, probe, room, outside, reach, reachThin });
    }
    const where = res.map((r) => (r.room ? r.room.name : r.outside ? "outside" : "nothing")).join(" | ");
    const hinged = o.door?.type === "hinged";
    console.log(`  ${o.id} ${o.type}${hinged ? ` (${o.door.swing})` : o.door?.type ? ` (${o.door.type})` : ""} w${o.width} in ${w.id} @${pt(add(w.a, mul(w.u, o.offset)))} ${LEVEL_NAME[li]}: ${where}; clear ${res.map((r) => `${r.side} ${f2(r.c.depth)}`).join(", ")}${res.map((r) => (r.reach ? "" : ` [side ${r.side} UNREACHABLE${r.reachThin ? " (reachable with r 0.25: a pinch < 0.70 m)" : ""}]`)).join("")}`);
    if (o.width < 0.75) issue("DOOR-NARROW", `${o.id} in ${w.id} is ${o.width} m wide (< 0.75).`);
    for (const r of res) {
        if (!r.room && !r.outside) {
            issue("DOOR-NOWHERE", `${o.id} in ${w.id}: side ${r.side} opens onto no room at the ${LEVEL_NAME[li]} floor (probe ${pt(r.probe)}).`);
            continue;
        }
        if (r.c.depth < 0.9 - 1e-6) issue("DOOR-CLEAR", `${o.id} in ${w.id} (${r.room?.name ?? "outside"} side ${r.side}): only ${f2(r.c.depth)} m clear before ${r.c.hit}.`);
        if (!r.reach) issue("DOOR-UNREACH", `${o.id} in ${w.id}: side ${r.side} (${r.room?.name ?? "outside"}) cannot be reached from the street entrance${r.reachThin ? " — it can with a 0.25 m radius, so a pinch < 0.70 m is in the way" : ""}.`);
    }
    if (hinged) {
        // The leaf's sweep: a quarter disc about the hinge, on the side it opens to.
        const hingeSide = o.swing?.endsWith?.("left") || o.door.swing.endsWith("left") ? -1 : 1;
        const side = o.door.swing.startsWith("outward") ? 1 : -1; // outward: side A
        const hinge = add(w.a, mul(w.u, o.offset + (hingeSide * o.width) / 2));
        const n = mul(w.n, side);
        const arc = [hinge];
        for (let a = 0; a <= 8; a++) {
            const ang = (a / 8) * (Math.PI / 2);
            arc.push(add(add(hinge, mul(w.u, -hingeSide * o.width * Math.cos(ang))), mul(n, w.t / 2 + o.width * Math.sin(ang))));
        }
        const leafPoly = arc.map((p) => add(p, mul(n, 0)));
        const hit = intrusion(leafPoly, li, { band: [LEVELS[li] + 0.02, LEVELS[li] + 2.0], wallIgnore: w.id, needFloor: false });
        if (hit) issue("DOOR-SWING", `${o.id} in ${w.id}: its ${o.width} m leaf, opening ${side > 0 ? "to side A" : "to side B"} (${o.door.swing}), sweeps into ${hit}.`);
    }
}

// --- 4. stairs -----------------------------------------------------------------
head("4. Stairs: footprint, 1.0 m landings, the climb itself");
for (const P of sol.portals) {
    const s = P.s;
    const head = s.at(s.run);
    console.log(`  ${s.id}: foot ${pt(s.foot)} → head ${pt(head)} (${s.direction}), w ${s.width}, ${s.base}→${s.top} m in ${s.steps} × ${f2(s.stepRise * 1000 / 10)} cm risers on ${f2(s.going * 100)} cm goings (pitch ${f2((s.pitch * 180) / Math.PI)}°), ${s.style ?? "solid"}.`);
    // Landings: ahead of the head, behind the foot.
    const footC = clearDepth(s.foot, s.across, mul(s.d, -1), -s.width / 2 + 0.04, s.width / 2 - 0.04, 1.0, s.baseLevel, { needFloor: true });
    const headC = clearDepth(add(head, mul(s.d, 0.005)), s.across, s.d, -s.width / 2 + 0.04, s.width / 2 - 0.04, 1.0, s.topLevel, {});
    // Side approaches: beside the first and last metre.
    const side = (from, to, li, sign) => clearDepth(add(s.at(0, (sign * s.width) / 2), mul(s.across, sign * 0.005)), s.d, mul(s.across, sign), from, to, 1.0, li, {});
    const footL = side(0, Math.min(1.0, s.sFoot + 0.3), s.baseLevel, 1);
    const footR = side(0, Math.min(1.0, s.sFoot + 0.3), s.baseLevel, -1);
    console.log(`    landing behind the foot: ${f2(footC.depth)} m${footC.hit ? ` (then ${footC.hit})` : ""}; beside the foot: +across ${f2(footL.depth)}${footL.hit ? ` (${footL.hit})` : ""}, −across ${f2(footR.depth)}${footR.hit ? ` (${footR.hit})` : ""}`);
    const headSide = (sign) => clearDepth(add(s.at(s.run - 1.0, (sign * s.width) / 2), mul(s.across, sign * 0.005)), s.d, mul(s.across, sign), 0, 1.0, 1.0, s.topLevel, {});
    const headL = headSide(1);
    const headR = headSide(-1);
    console.log(`    landing past the head: ${f2(headC.depth)} m${headC.hit ? ` (then ${headC.hit})` : ""}; beside the last metre: +across ${f2(headL.depth)}${headL.hit ? ` (${headL.hit})` : ""}, −across ${f2(headR.depth)}${headR.hit ? ` (${headR.hit})` : ""}`);
    console.log(`    climb: ${P.ok ? "passable" : `BLOCKED at ${f2(P.blockedAt.sa)} m up the run, ${pt(P.blockedAt.at)}, tread ${f2(P.blockedAt.tread)} m: ${P.blockedAt.reasons.join("; ")}`}; narrowest clear row ${f2(P.minFreeLat)} m of the ${s.width} m width for the capsule's centre.`);
    console.log(`    portals: ${P.baseCells.length} free cells at the foot, ${P.topCells.length} at the head; foot reached: ${P.baseCells.some((k) => sol.reached[s.baseLevel][k])}, head reached: ${P.topCells.some((k) => sol.reached[s.topLevel][k])}.`);
    const footApproach = footC.depth >= 0.75 || footL.depth >= 0.75 || footR.depth >= 0.75;
    if (footC.depth < 1.0 - 1e-6) issue(footApproach ? "STAIR-FOOT-SIDE" : "STAIR-FOOT", `${s.id}: only ${f2(footC.depth)} m behind its foot ${pt(s.foot)} before ${footC.hit}${footApproach ? ` (approachable from the side: ${f2(Math.max(footL.depth, footR.depth))} m)` : " — and no side approach ≥ 0.75 m either"}.`);
    if (headC.depth < 1.0 - 1e-6) issue(headC.depth >= 0.75 || P.topCells.length ? "STAIR-HEAD-TIGHT" : "STAIR-HEAD", `${s.id}: only ${f2(headC.depth)} m past its head ${pt(head)} before ${headC.hit}${P.topCells.length ? " (the capsule can still step off it: see the standing room below)" : ""}.`);
    if (!P.ok) issue("STAIR-BLOCKED", `${s.id}: the climb is blocked at ${pt(P.blockedAt.at)} (${f2(P.blockedAt.sa)} m up the run, tread ${f2(P.blockedAt.tread)} m) by ${P.blockedAt.reasons.join("; ")}.`);
    if (!P.topCells.length) issue("STAIR-TOP", `${s.id}: no cell at its head where the capsule can stand clear (rails/walls within 0.35 m of every point of the top ${f2(s.run - s.sHead)} m).`);
    // Can the capsule leave the head onto the floor? (top-level component of the head vs the rest of that floor)
    if (P.topCells.length) {
        const li = s.topLevel;
        const comp = component(li, P.topCells[0], sol);
        const area = comp.size * CELL * CELL;
        console.log(`    standing room joined to the head at ${LEVEL_NAME[li]} level: ${f2(area)} m² (${comp.rooms.join(", ") || "no room"})`);
        if (area < 3) issue("STAIR-TRAPPED", `${s.id}: off its head the capsule can reach only ${f2(area)} m² of the ${LEVEL_NAME[li]} floor (${comp.rooms.join(", ") || "none"}) — the head is boxed in.`);
    }
}
function component(li, k0, S) {
    const seen = new Uint8Array(NX * NZ);
    const q = [k0];
    seen[k0] = 1;
    const names = new Set();
    for (let h = 0; h < q.length; h++) {
        const k = q[h];
        if (h % 50 === 0) {
            const r = roomAt(centre(k), li);
            if (r) names.add(r.name);
        }
        const i = k % NX;
        for (const kk of [i > 0 ? k - 1 : -1, i < NX - 1 ? k + 1 : -1, k - NX, k + NX]) {
            if (kk < 0 || kk >= NX * NZ || seen[kk] || !S.lv[li].free[kk]) continue;
            seen[kk] = 1;
            q.push(kk);
        }
    }
    return { size: q.length, rooms: [...names] };
}

// --- 5. reachability ---------------------------------------------------------
head("5. Reachability (capsule r 0.35, 5 cm raster) from the street entrance");
const targets = [];
for (const { w, o, li } of doors)
    for (const side of [1, -1]) {
        const probe = add(add(w.a, mul(w.u, o.offset)), mul(w.n, side * (w.t / 2 + 0.4)));
        const r = roomAt(probe, li);
        if (r || li === 0) targets.push({ what: `door ${o.id} side ${side > 0 ? "A" : "B"}`, li, p: probe, room: r });
    }
for (const P of sol.portals) {
    targets.push({ what: `${P.s.id} foot`, li: P.s.baseLevel, p: P.s.at(Math.min(0.1, P.s.sFoot)), room: roomAt(P.s.foot, P.s.baseLevel), stair: P, end: "foot" });
    targets.push({ what: `${P.s.id} head`, li: P.s.topLevel, p: P.s.at(P.s.run - 0.05), room: roomAt(P.s.at(P.s.run + 0.3), P.s.topLevel), stair: P, end: "head" });
}
const ACCESS = {
    // Which sides a piece is used from (any one will do for chairs, beds and seats).
    default: ["front"],
    chair: ["back", "left", "right"],
    bed2: ["left", "right", "foot"],
    bed1: ["left", "right", "foot"],
    sofa: ["front", "front-left", "front-right"],
    armchair: ["front", "front-left", "front-right"],
};
for (const p of furn) {
    if (["rug", "pendant", "walllight", "curtain", "tv", "small", "table", "nightstand"].includes(p.kind) || p.on) continue;
    const dirs = ACCESS[p.kind] ?? ACCESS.default;
    const f = p.front;
    const right = [-f[1], f[0]];
    const pts = dirs.map((d) => {
        if (d === "front-left" || d === "front-right") return { d, p: add(add([p.x, p.z], mul(f, p.d / 2 - 0.2)), mul(right, (d === "front-left" ? -1 : 1) * (p.w / 2 + 0.4))) };
        const v = d === "front" || d === "foot" ? f : d === "back" ? mul(f, -1) : d === "left" ? mul(right, -1) : right;
        const half = d === "front" || d === "back" || d === "foot" ? p.d / 2 : p.kind.startsWith("bed") ? Math.min(p.w / 2, p.kind === "bed2" ? 0.86 : 0.5) : p.w / 2;
        return { d, p: add([p.x, p.z], mul(v, half + 0.4)) };
    });
    const any = ["chair", "bed1", "bed2", "sofa", "armchair"].includes(p.kind);
    targets.push({ what: `${p.cat} ${p.id}`, li: p.level, piece: p, pts, any, room: p.room });
}
const flatOf = (r) => (r ? (r.name.match(/^(C\d)/)?.[1] ?? r.name) : "outside");
const summary = new Map();
for (const t of targets) {
    const flat = flatOf(t.room);
    const s = summary.get(flat) ?? { n: 0, bad: [] };
    s.n++;
    let ok;
    let detail = "";
    if (t.pts) {
        const r = t.pts.map((q) => ({ ...q, ok: isReached(t.li, q.p) }));
        ok = t.any ? r.some((q) => q.ok) : r.every((q) => q.ok);
        detail = r.filter((q) => !q.ok).map((q) => `${q.d} ${pt(q.p)}`).join(", ");
        if (!ok) {
            const thin = t.pts.some((q) => isReached(t.li, q.p, 0.1, solThin));
            issue("ACCESS", `${label(t.piece)}: its ${t.any ? "every side" : "access side(s)"} ${detail} not reachable${thin ? " (reachable with r 0.25: a pinch < 0.70 m)" : ""}.`);
        }
    } else {
        ok = isReached(t.li, t.p);
        if (!ok && !t.what.startsWith("door")) issue("UNREACH", `${t.what} ${pt(t.p)} (${t.room?.name ?? LEVEL_NAME[t.li]}) is not reachable from the street.`);
    }
    if (!ok) s.bad.push(t.what);
    summary.set(flat, s);
}
for (const [flat, s] of [...summary.entries()].sort()) console.log(`  ${flat}: ${s.n - s.bad.length}/${s.n} targets reached${s.bad.length ? ` — not: ${s.bad.slice(0, 12).join(", ")}${s.bad.length > 12 ? ", …" : ""}` : ""}`);
// Spawns.
for (const sp of scene.spawns ?? []) {
    const p = loc([sp.position[0], sp.position[2]]);
    if (!inSite(p) || !/^C|Building C/.test(sp.label)) continue;
    const li = levelOf(sp.position[1]);
    const k = cellOf(p);
    const free = k >= 0 && sol.lv[li].free[k];
    console.log(`  spawn "${sp.label}" ${pt(p)} ${LEVEL_NAME[li]}: ${free ? "clear" : "INSIDE SOMETHING / NO FLOOR"}${free && !sol.reached[li][k] ? ", not reachable from the street" : ""}`);
    if (!free) {
        // The nearest reached cell, as a ready replacement.
        let best = null;
        for (let k = 0; k < NX * NZ; k++) {
            if (!sol.reached[li][k] || Math.sqrt(sol.lv[li].d2[k]) * CELL < R + 0.15) continue;
            const c = centre(k);
            const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
            if (!best || d < best.d) best = { c, d };
        }
        issue("SPAWN", `spawn "${sp.label}" at ${pt(p)} (${LEVEL_NAME[li]}) is not a clear standing spot (${culprits(sol.lv[li], p).slice(0, 2).join(", ") || "no floor"})${best ? `; nearest roomy reached spot ${pt(best.c)} = site [${f2(best.c[0] + OFF[0])}, ${f2(best.c[1] + OFF[1])}]` : ""}.`);
    }
}
// Narrow passages: ridge cells of the clearance field, reached, under 0.75 m (the building and its terraces only).
const nearC = ([x, z]) => x > -3.6 && x < 13 && z > -1.6 && z < 15.1;
for (let li = 0; li < LEVELS.length; li++) {
    const { d2, free } = sol.lv[li];
    const spots = [];
    for (let k = 0; k < NX * NZ; k++) {
        if (!sol.reached[li][k] || !free[k] || !nearC(centre(k))) continue;
        const d = Math.sqrt(d2[k]) * CELL;
        if (d >= 0.375) continue;
        const i = k % NX;
        if (i === 0 || i === NX - 1 || k < NX || k >= NX * (NZ - 1)) continue;
        const ridge = (a, b) => d2[k] >= d2[a] && d2[k] >= d2[b] && (d2[k] > d2[a] || d2[k] > d2[b]) && Math.min(d2[a], d2[b]) < d2[k];
        const ridgeX = ridge(k - 1, k + 1) && d2[k - 1] < d2[k] && d2[k + 1] <= d2[k];
        const ridgeZ = ridge(k - NX, k + NX) && d2[k - NX] < d2[k] && d2[k + NX] <= d2[k];
        if (ridgeX || ridgeZ) spots.push([k, d]);
    }
    // Cluster within 0.4 m.
    const clusters = [];
    for (const [k, d] of spots) {
        const c = centre(k);
        const near = clusters.find((cl) => Math.hypot(cl.c[0] - c[0], cl.c[1] - c[1]) < 0.4);
        if (near) {
            near.n++;
            near.d = Math.min(near.d, d);
        } else clusters.push({ c, d, n: 1 });
    }
    for (const cl of clusters.filter((cl) => cl.n >= 3)) {
        const r = roomAt(cl.c, li);
        issue("NARROW", `${LEVEL_NAME[li]} floor: a passage about ${f2(2 * cl.d)} m wide (< 0.75) at ${pt(cl.c)} in ${r?.name ?? "outside"}, between ${culprits(sol.lv[li], cl.c, 0.42).slice(0, 3).join(", ")}.`);
    }
    // Cut-off pockets: each stretch of free floor the walker cannot reach,
    // and what pinches it off — found by walking a 0.25 m walker from the
    // reached floor into it and taking the tightest point on the way.
    const lvl = sol.lv[li];
    const comp = new Int32Array(NX * NZ).fill(-1);
    const comps = [];
    for (let k = 0; k < NX * NZ; k++) {
        if (!lvl.free[k] || comp[k] >= 0 || sol.reached[li][k]) continue;
        const id = comps.length;
        const q = [k];
        comp[k] = id;
        const names = new Map();
        for (let h = 0; h < q.length; h++) {
            const c = q[h];
            const r = roomAt(centre(c), li);
            if (r) names.set(r.name, (names.get(r.name) ?? 0) + 1);
            const i = c % NX;
            for (const n of [i > 0 ? c - 1 : -1, i < NX - 1 ? c + 1 : -1, c - NX, c + NX]) {
                if (n < 0 || n >= NX * NZ || comp[n] >= 0 || !lvl.free[n]) continue;
                comp[n] = id;
                q.push(n);
            }
        }
        const any = centre(q[Math.floor(q.length / 2)]);
        comps.push({ id, size: q.length, at: any, rooms: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n), near: nearC(any) });
    }
    const big = comps.filter((c) => c.size * CELL * CELL >= 0.3 && c.near);
    if (!big.length) continue;
    const thin = solThin.lv[li].free;
    const parent = new Int32Array(NX * NZ).fill(-2);
    const q = [];
    for (let k = 0; k < NX * NZ; k++)
        if (sol.reached[li][k]) {
            parent[k] = -1;
            q.push(k);
        }
    const explained = new Map();
    for (let h = 0; h < q.length && explained.size < big.length; h++) {
        const c = q[h];
        const i = c % NX;
        for (const n of [i > 0 ? c - 1 : -1, i < NX - 1 ? c + 1 : -1, c - NX, c + NX]) {
            if (n < 0 || n >= NX * NZ || parent[n] !== -2 || !(thin[n] || lvl.free[n])) continue;
            parent[n] = c;
            q.push(n);
            const cid = comp[n];
            if (cid >= 0 && !explained.has(cid) && big.some((b) => b.id === cid)) {
                // Back along the path: its tightest cell.
                let best = n;
                for (let x = n; x >= 0; x = parent[x]) if (lvl.d2[x] < lvl.d2[best]) best = x;
                explained.set(cid, best);
            }
        }
    }
    for (const c of big) {
        const where = `${f2(c.size * CELL * CELL)} m² of ${LEVEL_NAME[li]} floor around ${pt(c.at)} (${c.rooms.slice(0, 3).join(", ") || "outside"})`;
        const k = explained.get(c.id);
        if (k == null) {
            issue("CUT-OFF", `${where} cannot be reached at all${sol.reached[li].some((v) => v) ? " — not even by a 0.25 m walker: sealed by furniture/walls" : " — nothing on this floor is reached (its stair is blocked)"}.`);
            continue;
        }
        const pc = centre(k);
        const width = 2 * Math.sqrt(lvl.d2[k]) * CELL;
        issue("PINCH", `${where} is cut off by a ${f2(width)} m gap at ${pt(pc)}: ${culprits(lvl, pc, Math.sqrt(lvl.d2[k]) * CELL + 0.06).slice(0, 4).join(", ")}.`);
    }
}

// --- 6. spacing and order ---------------------------------------------------------
head("6. Spacing and order");
const need = {
    wardrobe: 0.8,
    kitchen: 1.0,
    wc: 0.6,
    shower: 0.7,
    vanity: 0.7,
    washer: 0.6,
    sofa: 0.45,
    storage: 0.6,
    armchair: 0.45,
};
for (const p of furn) {
    if (p.on) continue;
    const f = p.front;
    const right = [-f[1], f[0]];
    const ignore = new Set([p.id]);
    for (const q of furn) if (q.on === p.id) ignore.add(q.id);
    const li = p.level;
    if (need[p.kind] != null) {
        // Sofas and armchairs: the low table in front of them is fine.
        if (p.kind === "sofa" || p.kind === "armchair") for (const q of furn) if (q.kind === "small" || q.kind === "rug") ignore.add(q.id);
        // A kitchen's front: its own peninsula is fine, the dining chairs are not.
        const half = p.d / 2;
        const o = add([p.x, p.z], mul(f, half + 0.005));
        const c = clearDepth(o, right, f, -p.w / 2 + 0.02, p.w / 2 - 0.02, need[p.kind], li, { ignore, band: [LEVELS[li] + 0.05, LEVELS[li] + (p.kind === "sofa" || p.kind === "armchair" ? 1.2 : 1.6)] });
        if (c.depth < need[p.kind] - 1e-6) issue(`SPACE-${p.kind.toUpperCase()}`, `${label(p)}: ${f2(c.depth)} m clear in front (needs ${need[p.kind]}) before ${c.hit}.`);
    }
    if (p.kind === "wc") {
        // 0.2 m each side of its 0.6 bowl: centre ≥ 0.4 from anything sideways.
        for (const sgn of [1, -1]) {
            const o = add([p.x, p.z], mul(right, (sgn * p.w) / 2 + sgn * 0.005));
            const c = clearDepth(o, f, mul(right, sgn), -p.d / 2, p.d / 2, 0.15, li, { ignore });
            if (c.depth < 0.15 - 1e-6) issue("SPACE-WC-SIDE", `${label(p)}: only ${f2(c.depth)} m beside it (${sgn > 0 ? "right" : "left"}) before ${c.hit}.`);
        }
    }
    if (p.kind === "bed2" || p.kind === "bed1") {
        const halfW = p.kind === "bed2" ? 0.86 : 0.505;
        const sides = [];
        for (const q of furn) if (q.kind === "nightstand" || q.kind === "walllight") ignore.add(q.id);
        for (const sgn of [1, -1]) {
            const o = add([p.x, p.z], mul(right, sgn * (halfW + 0.005)));
            // From the foot (front) to 0.5 short of the head: the nightstand's place.
            // Along the middle of the side: past the nightstand at the head, short of the foot's corner.
            const c = clearDepth(o, f, mul(right, sgn), -p.d / 2 + 0.5, p.d / 2 - 0.3, 0.6, li, { ignore, band: [LEVELS[li] + 0.05, LEVELS[li] + 1.6] });
            sides.push(c);
        }
        const footC = clearDepth(add([p.x, p.z], mul(f, p.d / 2 + 0.005)), right, f, -halfW, halfW, 0.6, li, { ignore, band: [LEVELS[li] + 0.05, LEVELS[li] + 1.6] });
        const good = sides.filter((c) => c.depth >= 0.6 - 1e-6).length;
        const worst = Math.min(...sides.map((c) => c.depth));
        const txt = `sides ${sides.map((c) => `${f2(c.depth)}${c.hit ? ` (${c.hit})` : ""}`).join(" / ")}, foot ${f2(footC.depth)}${footC.hit ? ` (${footC.hit})` : ""}`;
        // Hard: no usable side, or a double bed with a side under 0.45. Tight: a double's second side 0.45–0.6.
        if (good < 1 || (p.kind === "bed2" && worst < 0.45)) issue("SPACE-BED", `${label(p)}: ${p.kind === "bed2" ? "double" : "single"} bed with ${txt} — ${p.kind === "bed2" ? "both long sides want 0.6 m (≥ 0.45 at worst)" : "one long side needs 0.6 m"}.`);
        else if (p.kind === "bed2" && good < 2) issue("SPACE-BED-TIGHT", `${label(p)}: double bed with ${txt} — one side under 0.6 m.`);
        if (footC.depth < 0.4 - 1e-6) issue("SPACE-BED-FOOT", `${label(p)}: ${txt} — under 0.4 m at the foot.`);
    }
    if (p.kind === "chair" && !/out-chair/.test(p.cat) ? true : p.kind === "chair") {
        // Behind a dining chair: 0.75 m.
        for (const q of furn) if (q.kind === "chair" || q.kind === "rug" || q.kind === "table") ignore.add(q.id);
        const o = add([p.x, p.z], mul(f, -p.d / 2 - 0.005));
        const c = clearDepth(o, right, mul(f, -1), -p.w / 2, p.w / 2, 0.75, li, { ignore, band: [LEVELS[li] + 0.05, LEVELS[li] + 1.2] });
        if (c.depth < 0.6 - 1e-6) issue("SPACE-CHAIR", `${label(p)}: ${f2(c.depth)} m behind it (needs 0.75, 0.6 to pull it out) before ${c.hit}.`);
        else if (c.depth < 0.75 - 1e-6) issue("SPACE-CHAIR-TIGHT", `${label(p)}: ${f2(c.depth)} m behind it (0.75 wanted) before ${c.hit}.`);
    }
}
// Sofa faces a TV (or media wall) in the same room.
for (const sofa of furn.filter((p) => p.kind === "sofa" && p.room && !/out-/.test(p.cat))) {
    const tvs = furn.filter((q) => (q.kind === "tv" || /media/.test(q.cat)) && q.room === sofa.room);
    if (!tvs.length) {
        issue("ORDER-TV", `${label(sofa)}: no TV or media unit in "${sofa.room.name}".`);
        continue;
    }
    const best = tvs
        .map((tv) => {
            const v = sub([tv.x, tv.z], [sofa.x, sofa.z]);
            const dist = Math.hypot(...v);
            const ang = (Math.acos(Math.max(-1, Math.min(1, dot(v, sofa.front) / dist))) * 180) / Math.PI;
            const facing = dot(tv.front, sofa.front);
            return { tv, dist, ang, facing };
        })
        .sort((a, b) => a.ang - b.ang)[0];
    const ok = best.ang < 35 && best.facing < -0.7 && best.dist > 1.5 && best.dist < 5;
    console.log(`  ${sofa.id} ${sofa.cat} in ${sofa.room.name}: TV ${best.tv.id} ${best.tv.cat} ${f2(best.dist)} m away, ${f2(best.ang)}° off its axis, facing ${best.facing < -0.7 ? "back at it" : "away/sideways"}.`);
    if (!ok) issue("ORDER-TV", `${label(sofa)} does not face ${best.tv.id} ${best.tv.cat} (${f2(best.dist)} m, ${f2(best.ang)}° off-axis, facing dot ${f2(best.facing)}).`);
}
// Dining table near the kitchen (same room).
for (const t of furn.filter((p) => p.kind === "table" && p.room && /living/.test(p.room.name))) {
    const k = furn.filter((q) => q.kind === "kitchen" && q.room === t.room);
    if (!k.length) issue("ORDER-KITCHEN", `${label(t)}: no kitchen in "${t.room.name}".`);
}

// --- 7. windows blocked, daylight ----------------------------------------------
head("7. Windows blocked by tall pieces, and daylight per room");
const glazed = (o) => o.type === "window" || (o.type === "door" && (o.door?.glazed || o.door?.type === "sliding"));
for (const w of walls)
    for (const o of w.openings) {
        if (!glazed(o)) continue;
        const li = levelOf(o.y0);
        for (const side of [1, -1]) {
            const n = mul(w.n, side);
            const strip = rectAlong(add(w.a, mul(n, w.t / 2 + 0.005)), w.u, o.s0, o.s1, side > 0 ? 0 : -0.25, side > 0 ? 0.25 : 0);
            const s = strip.map((p) => p);
            // tall: reaching 0.15 above the sill
            const cover = new Set();
            for (const p of furn) {
                if (["rug", "pendant", "walllight"].includes(p.kind) || p.level !== li || !bbHit(p.bb, bbox(s))) continue;
                if (p.y + p.h - LEVELS[li] < 1.5) continue;
                for (const c of p.cells) {
                    if (c[3] < Math.max(o.y0 + 0.15, LEVELS[li] + 1.5) || c[2] > o.y1) continue;
                    if (!inPoly([c[0], c[1]], s)) continue;
                    cover.add(Math.round(dot(sub([c[0], c[1]], w.a), w.u) / 0.05));
                    if (!p.__w) p.__w = new Set();
                    p.__w.add(`${o.id}`);
                }
            }
            const frac = (cover.size * 0.05) / o.width;
            if (frac > 0.15) {
                const who = furn.filter((p) => p.__w?.has(o.id) && p.level === li).map((p) => `${p.id} ${p.cat}`);
                issue("WINDOW", `${o.type} ${o.id} in ${w.id} (w ${o.width}, sill ${f2(o.y0 - LEVELS[li])}): ${Math.round(frac * 100)}% of its width is behind ${who.join(", ")}.`);
            }
            for (const p of furn) p.__w?.delete(o.id);
        }
    }
for (const r of rooms) {
    if (r.open) continue;
    const area = Math.abs(polyArea(r.poly));
    let glass = 0;
    const list = [];
    for (const w of walls)
        for (const o of w.openings) {
            if (!glazed(o)) continue;
            const mid = add(w.a, mul(w.u, o.offset));
            const touches = [1, -1].some((sg) => inPoly(add(mid, mul(w.n, sg * (w.t / 2 + 0.08))), r.poly));
            if (!touches) continue;
            const v = vOverlap(o.y0, o.y1, r.elev, r.elev + r.h + 0.3);
            if (v <= 0.05) continue;
            glass += o.width * v;
            list.push(`${o.id} ${o.width}×${f2(v)}`);
        }
    const ratio = glass / area;
    const habitable = /living|bedroom/.test(r.name);
    const tag = ratio < (habitable ? 0.12 : 0.04) ? (habitable ? " LOW" : " dark") : "";
    console.log(`  ${r.id.padEnd(14)} ${r.name.padEnd(34)} ${f2(area).padStart(6)} m², glass ${f2(glass)} m² (${Math.round(ratio * 100)}%)${tag}${list.length ? `: ${list.join(", ")}` : ""}`);
    if (habitable && ratio < 0.12) issue("DAYLIGHT", `${r.name} (${r.id}): ${f2(glass)} m² of glass for ${f2(area)} m² (${Math.round(ratio * 100)}% < 12%).`);
    if (!habitable && glass === 0) issue("DAYLIGHT-NONE", `${r.name} (${r.id}): no glazing at all (lit only through doors).`);
}

// --- 8. z-fighting candidates -------------------------------------------------------
head("8. Z-fighting / coplanar overlaps");
for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        if (Math.abs(a.elev - b.elev) > 0.015) continue;
        // concave polygons: approximate with a 5 cm sample of a's bbox
        const [x0, z0, x1, z1] = bbox(a.poly);
        const [X0, Z0, X1, Z1] = bbox(b.poly);
        if (!(x0 < X1 && X0 < x1 && z0 < Z1 && Z0 < z1)) continue;
        let n = 0;
        for (let x = Math.max(x0, X0) + 0.025; x < Math.min(x1, X1); x += 0.05) for (let z = Math.max(z0, Z0) + 0.025; z < Math.min(z1, Z1); z += 0.05) if (inPoly([x, z], a.poly) && inPoly([x, z], b.poly)) n++;
        if (n * 0.0025 > 0.004) issue("ZF-FLOOR", `rooms ${a.id} (${a.elev}) and ${b.id} (${b.elev}) overlap by ~${round(n * 0.0025, 3)} m² at ${Math.abs(a.elev - b.elev) < 0.002 ? "the same level" : `${f2(Math.abs(a.elev - b.elev) * 100)} cm apart`}.`);
    }
for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
        const a = walls[i];
        const b = walls[j];
        if (!bbHit(a.bb, b.bb)) continue;
        const v = vOverlap(a.base, a.top, b.base, b.top);
        if (v <= 0.01) continue;
        if (Math.abs(Math.abs(dot(a.u, b.u)) - 1) > 1e-3) continue; // parallel only
        const area = overlapArea(a.poly, b.poly);
        if (area < 0.003) continue;
        const off = dot(sub(b.a, a.a), a.n);
        const faces = [a.t / 2, -a.t / 2].flatMap((fa) => [off + b.t / 2, off - b.t / 2].map((fb) => Math.abs(fa - fb)));
        const coplanar = Math.min(...faces) < 0.003;
        issue("ZF-WALL", `walls ${a.id} and ${b.id} share ${round(area, 3)} m² of plan over ${f2(v)} m of height${coplanar ? ", with a coplanar face (z-fighting)" : " (one inside the other)"}.`);
    }
for (const b of blockers) {
    if (b.kind === "hedge" || b.kind === "garden wall") continue;
    for (const w of walls) {
        if (!bbHit(b.bb, w.bb) || vOverlap(b.base, b.top, w.base, w.top) <= 0.01) continue;
        const a = overlapArea(b.poly, w.poly);
        if (a > 0.002) issue("ZF-INWALL", `${b.kind} ${b.id} runs ${round(a, 3)} m² into wall ${w.id}.`);
    }
}
for (let i = 0; i < blockers.length; i++)
    for (let j = i + 1; j < blockers.length; j++) {
        const a = blockers[i];
        const b = blockers[j];
        if (a.kind === "hedge" || b.kind === "hedge" || a.kind === "garden wall" || b.kind === "garden wall" || a.id === b.id || !bbHit(a.bb, b.bb) || vOverlap(a.base, a.top, b.base, b.top) <= 0.01) continue;
        if (a.kind !== "planter" && b.kind !== "planter") continue;
        const ar = overlapArea(a.poly, b.poly);
        if (ar > 0.002) issue(a.kind === "planter" && b.kind === "planter" ? "ZF-PLANTER" : "CLIP", `${a.kind} ${a.id} and ${b.kind} ${b.id} overlap by ${round(ar, 3)} m²${a.kind === b.kind ? " (coplanar soil and corten at the same height)" : ""}.`);
    }
for (const h of holes)
    for (const w of walls) {
        if (!bbHit(bbox(h.poly), w.bb) || w.base > h.elevation + 0.01 || w.top < h.elevation - SLAB) continue;
        const a = overlapArea(h.poly, w.poly);
        if (a > 0.002) issue("HOLE-WALL", `floor opening ${h.id} (at ${h.elevation}) cuts ${round(a, 3)} m² of wall ${w.id}'s footprint.`);
    }

// --- 9. door jambs and floor gaps -----------------------------------------------------
head("9. Partitions running into door openings; slots in the floors (see-through gaps)");
for (const w of walls)
    for (const o of w.openings) {
        if (!passable(o)) continue;
        const prism = rectAlong(w.a, w.u, o.s0, o.s1, -w.t / 2 - 0.03, w.t / 2 + 0.03);
        for (const v of walls) {
            if (v === w || !bbHit(v.bb, bbox(prism)) || vOverlap(v.base, v.top, o.y0, o.y1) < 0.3) continue;
            if (Math.abs(Math.abs(dot(v.u, w.u)) - 1) < 1e-3) continue; // parallel: a stacked/abutting wall, not a jamb
            const clip = clipConvex(v.poly, prism);
            if (Math.abs(polyArea(clip)) < 1e-4) continue;
            const ss = clip.map((q) => dot(sub(q, w.a), w.u));
            issue("DOOR-JAMB", `${o.type} ${o.id} (${f2(o.width)} m) in ${w.id}: wall ${v.id} runs into it over ${f2(Math.max(...ss) - Math.min(...ss))} m of its width (opening ${f2(o.s0)}..${f2(o.s1)} along the wall).`);
        }
    }
{
    const G = 0.025;
    const [X0, Z0, X1, Z1] = [0.02, 0.02, 12.38, 13.48];
    const nx = Math.round((X1 - X0) / G);
    const nz = Math.round((Z1 - Z0) / G);
    for (let li = 0; li < LEVELS.length; li++) {
        const Lv = LEVELS[li];
        const cover = (c) => {
            if (rooms.some((r) => Math.abs(r.elev - Lv) < 0.05 && inPoly(c, r.poly))) return true;
            if (walls.some((w) => w.base <= Lv + 0.05 && w.top >= Lv + 0.05 && inPoly(c, w.poly))) return true;
            if (walls.some((w) => Math.abs(w.top - Lv) < 0.03 && inPoly(c, w.poly))) return true; // a wall's top flush with the floor
            for (const w of walls) for (const o of w.openings) if (passable(o) && Math.abs(o.y0 - Lv) < 0.05 && inPoly(c, rectAlong(w.a, w.u, o.s0, o.s1, -w.t / 2 - 0.03, w.t / 2 + 0.03))) return true;
            if (stairs.some((st) => st.base <= Lv + 0.01 && st.top >= Lv - 0.01 && inPoly(c, rectAlong(st.foot, st.d, -0.05, st.run + 0.05, -st.width / 2 - 0.06, st.width / 2 + 0.06)))) return true;
            if (holes.some((h) => Math.abs(h.elevation - Lv) < 0.05 && inPoly(c, h.poly))) return true;
            return false;
        };
        // Recesses are open through every floor above the ground.
        const voidByDesign = ([x, z]) => li > 0 && (x < 2.3 || x > 10.65) && z > 4.075 && z < 9.425;
        const gap = new Uint8Array(nx * nz);
        for (let j = 0; j < nz; j++)
            for (let i = 0; i < nx; i++) {
                const c = [X0 + (i + 0.5) * G, Z0 + (j + 0.5) * G];
                if (!voidByDesign(c) && !cover(c)) gap[j * nx + i] = 1;
            }
        const seen = new Uint8Array(nx * nz);
        for (let k = 0; k < nx * nz; k++) {
            if (!gap[k] || seen[k]) continue;
            const q = [k];
            seen[k] = 1;
            let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            for (let h = 0; h < q.length; h++) {
                const c = q[h];
                const i = c % nx;
                const j = Math.floor(c / nx);
                x0 = Math.min(x0, i); x1 = Math.max(x1, i); z0 = Math.min(z0, j); z1 = Math.max(z1, j);
                for (const n of [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, c - nx, c + nx]) if (n >= 0 && n < nx * nz && gap[n] && !seen[n]) {
                    seen[n] = 1;
                    q.push(n);
                }
            }
            const area = q.length * G * G;
            if (area < 0.01) continue;
            const bx = [X0 + x0 * G, Z0 + z0 * G, X0 + (x1 + 1) * G, Z0 + (z1 + 1) * G];
            issue("FLOOR-GAP", `${LEVEL_NAME[li]} floor (${f2(Lv)}): no slab over x ${f2(bx[0])}..${f2(bx[2])}, z ${f2(bx[1])}..${f2(bx[3])} (${round(area, 3)} m²) — between ${[...new Set([[bx[0] - 0.05, (bx[1] + bx[3]) / 2], [bx[2] + 0.05, (bx[1] + bx[3]) / 2], [(bx[0] + bx[2]) / 2, bx[1] - 0.05], [(bx[0] + bx[2]) / 2, bx[3] + 0.05]].map((c) => roomAt(c, li)?.id ?? walls.find((w) => inPoly(c, w.poly) && w.base <= Lv + 0.05 && w.top > Lv)?.id ?? "-"))].join(", ")}.`);
        }
    }
}

// --- inventory and maps ------------------------------------------------------------
if (ARGS.has("--all")) {
    head("Inventory by room");
    for (const r of rooms) {
        const list = furn.filter((p) => p.room === r);
        if (!list.length) continue;
        console.log(`  ${r.name} (${r.id}, ${LEVEL_NAME[r.level]}):`);
        for (const p of list) console.log(`    ${label(p)} ${p.kind} ${f2(p.w)}×${f2(p.d)}×${f2(p.h)} faces (${f2(p.front[0])}, ${f2(p.front[1])})${p.on ? ` on ${p.on}` : ""}`);
    }
}
if (ARGS.has("--map")) {
    for (let li = 0; li < LEVELS.length; li++) {
        console.log(`\n--- ${LEVEL_NAME[li]} (x −1..13.5 →, z −1..14.5 ↓; 0.1 m a char): # obstacle  . reached  , free unreached  o hole  s stair  ~ no floor  space too close`);
        const { floor, obst, free } = sol.lv[li];
        for (let z = -1; z < 14.5; z += 0.1) {
            let line = "";
            for (let x = -1; x < 13.5; x += 0.1) {
                const k = cellOf([x + 0.025, z + 0.025]);
                const inStair = stairs.some((s) => inPoly([x, z], s.poly) && (s.baseLevel === li || s.topLevel === li));
                const inHole = holes.some((h) => h.level === li && inPoly([x, z], h.poly));
                line += obst[k] ? "#" : sol.reached[li][k] ? "." : free[k] ? "," : inHole ? "o" : inStair ? "s" : !floor[k] ? "~" : " ";
            }
            console.log(`${z.toFixed(1).padStart(5)} ${line}`);
        }
    }
}

// --- probe: `--probe li,x0,z0,x1,z1` prints each 5 cm cell's state along the segment ----
if (ARGV.includes("--probe")) {
    const [li, x0, z0, x1, z1] = ARGV[ARGV.indexOf("--probe") + 1].split(",").map(Number);
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / CELL));
    for (let i = 0; i <= n; i++) {
        const p = [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n];
        const k = cellOf(p);
        const L = sol.lv[li];
        console.log(`probe ${pt(p)} floor ${L.floor[k]} obst ${L.obst[k]}${L.src[k] >= 0 ? `(${L.SRC_NAMES[L.src[k]]})` : ""} d ${f2(Math.sqrt(L.d2[k]) * CELL)} free ${L.free[k]} reached ${sol.reached[li][k]} near: ${culprits(L, p, 0.36).slice(0, 3).join(", ")}`);
    }
}

// --- summary --------------------------------------------------------------------------
console.log("\n=== Summary ===");
const counts = {};
for (const i of issues) counts[i.code] = (counts[i.code] ?? 0) + 1;
console.log(Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ") || "no issues");

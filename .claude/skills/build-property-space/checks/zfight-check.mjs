#!/usr/bin/env node
/**
 * zfight-check.mjs — every source of z-fighting the seeded Ladonia scene can
 * produce: coplanar (or near-coplanar, < TOL apart) overlapping surfaces,
 * rebuilt from the scene spec exactly as the builders lay them down:
 *
 *   StructureBuilder.buildRoom   floors and ceilings: zero-thickness, DOUBLE-SIDED planes
 *                                (floor at elevation, ceiling at elevation + height)
 *   StructureBuilder.buildWall   one box per panel round the openings; threshold boxes
 *                                (top 1 mm under the wall base); slim window frames,
 *                                glass and blind boxes; Door.js linings (t + 0.01 deep)
 *   StructureBuilder.buildRoof   flat slab box, footprint + overhang, base..base+thickness
 *   StructureBuilder.buildStairs slab-style step boxes / moulded steps + treads
 *   LandscapeBuilder             dry-stone walls (+ copings), kerbs, pergolas, planters,
 *                                railing channels, pool basin/coping/deck/steps, road paint
 *                                (planes at base + 0.006, polygonOffset -2/-2), terrain mesh
 *   Flora/hedges.js              hedge cores
 *   furniture                    catalogue bounding boxes (size at rotation)
 *
 * Usage:  node zfight-check.mjs [scene.json] [--source] [--json out.json] [--tol 0.0101] [--all]
 *         --source                the generator as it is now (scripts/spaces/ladonia/index.js through
 *                                 server/scene/validate.js), not the seeded JSON
 *         --all                   list hidden and polygonOffset-resolved coincidences too
 *         --floors-front          as before: floor/ground finishes layered FRONT
 *         --lining-plain          as before: door linings drawn as their plain trim
 *         --outer-pad-lines       proposed: LandscapeBuilder's coarse terrain grid gets the pads' lines
 *         --json out.json         also write the findings as JSON to that path
 *
 * Prints, per class, each coincidence with: ids, building, site and building-local
 * coordinates of the overlap, plane separation, area, the materials that fight,
 * whether it can be seen, and the distance at which a separation starts to fight
 * with the camera's near plane (Camera.js near = 0.05, 24-bit depth).
 *
 * Paths: the repo is found from this file's location (four directories up:
 * checks -> build-property-space -> skills -> .claude -> repo); set REPO=<dir>
 * to check another checkout.
 */
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NOSING_DEPTH, poolSteps } from "../../../../shared/landscape.js";

const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const scenePath = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? `${REPO}/scenes/kosinozici-villas.json`;
const TOL = Number(flag("--tol", 0.0101));
const SHOW_ALL = args.includes("--all");
const JSON_OUT = flag("--json", null);
const MIN_AREA = 2e-4; // m², smaller overlaps are ignored

const { terrainHeight } = await import(`${REPO}/shared/landscape.js`);
const { FINISHES, TRIM_MATERIALS, DEFAULT_FINISH } = await import(`${REPO}/shared/catalog.js`);
// --source: build the scene from the generator as it is now (scripts/spaces/ladonia), through
// the server's validateScene as the seed script does, instead of the seeded JSON.
const FROM_SOURCE = args.includes("--source");
const S = await (async () => {
    if (FROM_SOURCE) {
        const { ladonia } = await import(`${REPO}/scripts/spaces/ladonia/index.js`);
        const { validateScene } = await import(`${REPO}/server/scene/validate.js`);
        return validateScene(ladonia).scene;
    }
    const raw = JSON.parse(fs.readFileSync(scenePath, "utf8"));
    return raw.scene ?? raw;
})();

// ---------------------------------------------------------------------------
// polygonOffset layering as MaterialLibrary / LandscapeBuilder set it now:
//   getSurface: none (floors and grounds included)
//   getTrim:    frame_* / glass* → FRONT; any other trim as it stands (none)
//   getTrimFront (door linings) → FRONT; getTrimBehind (a wall's ends, top and
//   reveals and its thresholds, stairs' risers, roofs' soffits) → BEHIND [1,2]
//   terrain [2,4]; road paint [-2,-2]; furniture, soil, hedges none
// Material tags: "S:<finish>:<kind>" surface, "T:<trim>" trim, "M:<made>", "F:<catalog id>".
// ---------------------------------------------------------------------------
const FRONT = [-1, -2];
const BEHIND = [1, 2];
const NONE = [0, 0];
// To see how it looked before these rules, the old ones can be put back:
//   --floors-front   floor/ground finishes FRONT (as MaterialLibrary once had them)
//   --lining-plain   door linings as their plain trim
const FLOORS_FRONT = args.includes("--floors-front");
const LINING_PLAIN = args.includes("--lining-plain");
function offsetOf(tag) {
    const [k, id, kind] = tag.split(":");
    if (k === "S") {
        if (!FLOORS_FRONT) return NONE;
        const resolved = FINISHES[id] ? id : DEFAULT_FINISH[kind] || "paint_white";
        const fk = FINISHES[resolved]?.kind;
        return fk === "floor" || fk === "ground" ? FRONT : NONE;
    }
    if (k === "T") {
        if (kind === "lining" && !LINING_PLAIN) return FRONT;
        if (kind === "behind") return BEHIND;
        const key = TRIM_MATERIALS[id] ? id : "trim_white";
        return /^(frame_|glass)/.test(key) ? FRONT : NONE;
    }
    if (tag === "M:terrain") return [2, 4];
    if (tag === "M:paint") return [-2, -2];
    return NONE;
}
const offVal = (o) => o[0] * 10 + o[1];
const matName = (tag) => tag.split(":").slice(1, 2).join("");
/** Untextured flat colour (a trim, soil, hedge core): two coplanar faces of the same one cannot be told apart. */
const flatColour = (tag) => tag.startsWith("T:") || tag.startsWith("M:");
const sameMat = (a, b) => a.split(":").slice(0, 2).join(":") === b.split(":").slice(0, 2).join(":");
const CATALOG = JSON.parse(fs.readFileSync(`${REPO}/public/models/furniture/catalog.json`, "utf8"));
const SIZE = Object.fromEntries(CATALOG.items.map((i) => [i.id, i.size]));

// Building offsets, read from the generator so local coordinates stay right if they move.
const OFFSETS = (() => {
    const out = { a: [0, 0], b: [0, 24.2], c: [2.5, -21] };
    try {
        const src = fs.readFileSync(`${REPO}/scripts/spaces/ladonia/index.js`, "utf8");
        for (const [k, name] of [["a", "A_AT"], ["b", "B_AT"], ["c", "C_AT"]]) {
            const m = src.match(new RegExp(`const ${name} = \\[\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*\\]`));
            if (m) out[k] = [Number(m[1]), Number(m[2])];
        }
    } catch {}
    return out;
})();

// ---------------------------------------------------------------------------
// depth precision: Camera.js near 0.05, far 800, 24-bit depth, no log depth
// ---------------------------------------------------------------------------
const NEAR = 0.05;
const fightAt = (sep, near = NEAR) => (sep <= 0 ? 0 : Math.sqrt(sep * near * 2 ** 24));

// ---------------------------------------------------------------------------
// 2D geometry
// ---------------------------------------------------------------------------
const r3 = (n) => Math.round(n * 1000) / 1000;
const area = (p) => {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
        const [x1, y1] = p[i];
        const [x2, y2] = p[(i + 1) % p.length];
        s += x1 * y2 - x2 * y1;
    }
    return s / 2;
};
const ccw = (p) => (area(p) < 0 ? p.slice().reverse() : p.slice());
const cross3 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function clipHalf(poly, a, b, keepLeft = true) {
    const f = (p) => (keepLeft ? 1 : -1) * cross3(a, b, p);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const fp = f(p);
        const fq = f(q);
        if (fp >= -1e-12) out.push(p);
        if ((fp >= -1e-12) !== (fq >= -1e-12)) {
            const t = fp / (fp - fq);
            out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
    }
    return out;
}
function clipConvex(subject, clip) {
    let out = subject;
    for (let i = 0; i < clip.length && out.length >= 3; i++) out = clipHalf(out, clip[i], clip[(i + 1) % clip.length]);
    return out.length >= 3 ? out : [];
}
function subtractConvex(piece, hole) {
    const out = [];
    let rest = piece;
    for (let i = 0; i < hole.length && rest.length >= 3; i++) {
        const a = hole[i];
        const b = hole[(i + 1) % hole.length];
        const outside = clipHalf(rest, a, b, false);
        if (outside.length >= 3 && Math.abs(area(outside)) > 1e-9) out.push(outside);
        rest = clipHalf(rest, a, b, true);
    }
    return out;
}
function isConvex(p) {
    let sign = 0;
    for (let i = 0; i < p.length; i++) {
        const c = cross3(p[i], p[(i + 1) % p.length], p[(i + 2) % p.length]);
        if (Math.abs(c) < 1e-12) continue;
        if (sign === 0) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) return false;
    }
    return true;
}
function pointInTri(p, a, b, c) {
    const d1 = cross3(a, b, p);
    const d2 = cross3(b, c, p);
    const d3 = cross3(c, a, p);
    return d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12;
}
function clean(poly) {
    let p = poly.filter((v, i) => {
        const q = poly[(i + 1) % poly.length];
        return Math.hypot(v[0] - q[0], v[1] - q[1]) > 1e-9;
    });
    let changed = true;
    while (changed && p.length > 3) {
        changed = false;
        for (let i = 0; i < p.length; i++) {
            if (Math.abs(cross3(p[(i + p.length - 1) % p.length], p[i], p[(i + 1) % p.length])) < 1e-10) {
                p.splice(i, 1);
                changed = true;
                break;
            }
        }
    }
    return p;
}
function triangulate(poly) {
    const p = ccw(clean(poly));
    if (p.length < 3) return [];
    if (isConvex(p)) return [p];
    const idx = p.map((_, i) => i);
    const tris = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < 2000) {
        let found = false;
        for (let i = 0; i < idx.length; i++) {
            const a = p[idx[(i + idx.length - 1) % idx.length]];
            const b = p[idx[i]];
            const c = p[idx[(i + 1) % idx.length]];
            if (cross3(a, b, c) <= 1e-12) continue;
            if (idx.some((j) => p[j] !== a && p[j] !== b && p[j] !== c && pointInTri(p[j], a, b, c))) continue;
            tris.push([a, b, c]);
            idx.splice(i, 1);
            found = true;
            break;
        }
        if (!found) break;
    }
    if (idx.length === 3) tris.push(idx.map((i) => p[i]));
    return tris;
}
const parts = (poly) => triangulate(poly);
function intersect(partsA, partsB) {
    const out = [];
    for (const a of partsA) for (const b of partsB) {
        const piece = clipConvex(a, b);
        if (piece.length >= 3 && area(piece) > 1e-9) out.push(piece);
    }
    return out;
}
function minusHoles(pieces, holes) {
    let out = pieces;
    for (const hole of holes) out = out.flatMap((piece) => subtractConvex(piece, ccw(hole)));
    return out;
}
const sumArea = (pieces) => pieces.reduce((s, p) => s + Math.abs(area(p)), 0);
function bbox(pieces) {
    const pts = pieces.flat();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function centroid(pieces) {
    let ax = 0;
    let ay = 0;
    let A = 0;
    for (const p of pieces) {
        const a = Math.abs(area(p));
        const cx = p.reduce((s, v) => s + v[0], 0) / p.length;
        const cy = p.reduce((s, v) => s + v[1], 0) / p.length;
        ax += cx * a;
        ay += cy * a;
        A += a;
    }
    return A > 0 ? [ax / A, ay / A] : pieces[0][0];
}
function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// ---------------------------------------------------------------------------
// Solids: oriented boxes (yaw only). X = (ux, uz) in plan, Z = (-uz, ux), Y up.
// ---------------------------------------------------------------------------
const solids = [];
const mat6 = (m) => ({ px: m, nx: m, py: m, ny: m, pz: m, nz: m });
/**
 * @param o {c:[x,y,z], ux, uz, hx, hy, hz, id, owner, cls, mat:{px,nx,py,ny,pz,nz}, uv:"local"|"world", skipFaces:Set}
 */
function addSolid(o) {
    if (!(o.hx > 1e-5 && o.hy > 1e-5 && o.hz > 1e-5)) return null;
    o.index = solids.length;
    o.uv ??= "local";
    o.skipFaces ??= new Set();
    solids.push(o);
    return o;
}
function insideSolid(p, except = new Set(), margin = 0) {
    for (const s of solids) {
        if (except.has(s.index) || s.noOcclude) continue;
        const dx = p[0] - s.c[0];
        const dy = p[1] - s.c[1];
        const dz = p[2] - s.c[2];
        const lx = dx * s.ux + dz * s.uz;
        const lz = dx * -s.uz + dz * s.ux;
        if (Math.abs(lx) < s.hx - margin && Math.abs(dy) < s.hy - margin && Math.abs(lz) < s.hz - margin) return s;
    }
    return null;
}

/** World point of a wall/stair local point (origin o, X=(ux,uz)). */
const toWorld = (o, ux, uz, lx, ly, lz) => [o[0] + lx * ux - lz * uz, o[1] + ly, o[2] + lx * uz + lz * ux];

// ---------------------------------------------------------------------------
// Walls (StructureBuilder.buildWall), doors (Door.js), windows, blinds
// ---------------------------------------------------------------------------
const bldg = (id) => (/^[abc]-/.test(id) ? id[0] : null);
let doorLinings = 0;
let thresholds = [];
for (const wall of S.walls) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-6) continue;
    const ux = (x2 - x1) / L;
    const uz = (z2 - z1) / L;
    const origin = [(x1 + x2) / 2, wall.base_height, (z1 + z2) / 2];
    const half = L / 2;
    const t = wall.thickness;
    const h = wall.height;
    const A = wall.finish;
    const B = wall.finish_back || wall.finish;
    const R = wall.reveal || "trim_white";
    const owner = wall.id;
    const panel = (from, to, bottom, top, part) => {
        const w = to - from;
        const hh = top - bottom;
        if (w <= 0.001 || hh <= 0.001) return;
        addSolid({
            c: toWorld(origin, ux, uz, from + w / 2 - half, bottom + hh / 2, 0),
            ux, uz, hx: w / 2, hy: hh / 2, hz: t / 2,
            id: `${wall.id}:${part}`, owner, cls: "wall",
            mat: { px: `T:${R}:behind`, nx: `T:${R}:behind`, py: `T:${R}:behind`, ny: `T:${R}:behind`, pz: `S:${A}:wall`, nz: `S:${B}:wall` },
            wall, local: { from, to, bottom, top },
        });
    };
    const openings = [...(wall.openings || [])].sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    for (const o of openings) {
        const start = o.offset - o.width / 2;
        const end = o.offset + o.width / 2;
        const top = o.sill + o.height;
        panel(cursor, start, 0, h, `p${r3(cursor)}`);
        if (o.sill > 0.001) panel(start, end, 0, o.sill, `sill-${o.id}`);
        if (top < h - 0.001) panel(start, end, top, h, `head-${o.id}`);
        const x = o.offset - half;
        if (o.sill <= 0.001) {
            // addThreshold: width × 0.06 × (t + 0.06), centre y -0.031 → top at base - 0.001
            const s = addSolid({ c: toWorld(origin, ux, uz, x, -0.031, 0), ux, uz, hx: o.width / 2, hy: 0.03, hz: t / 2 + 0.03, id: `${o.id}:threshold`, owner, cls: "threshold", mat: mat6(`T:${R}:behind`) });
            if (s) thresholds.push({ solid: s, wall, opening: o });
        }
        if (o.type === "door") {
            if (o.door?.lining !== "none") {
                // Door.build: jambs (0.06 wide, height + 0.06, depth t + 0.01), head
                const jamb = 0.06;
                const depth = t + 0.01;
                const frame = `T:${o.door?.frame || "trim_white"}:lining`;
                for (const side of [-1, 1]) {
                    addSolid({ c: toWorld(origin, ux, uz, x + side * ((o.width + jamb) / 2 - 0.001), o.height / 2, 0), ux, uz, hx: jamb / 2, hy: (o.height + jamb) / 2, hz: depth / 2, id: `${o.id}:jamb${side}`, owner, cls: "lining", mat: { px: frame, nx: frame, py: frame, ny: frame, pz: frame, nz: frame } });
                }
                addSolid({ c: toWorld(origin, ux, uz, x, o.height + jamb / 2 - 0.001, 0), ux, uz, hx: o.width / 2 + jamb, hy: jamb / 2, hz: depth / 2, id: `${o.id}:head`, owner, cls: "lining", mat: { px: frame, nx: frame, py: frame, ny: frame, pz: frame, nz: frame } });
                doorLinings += 1;
            }
            if (o.blind != null) addBlind(o, origin, ux, uz, half, t, owner, `T:${o.door?.frame || "frame_anthracite"}`);
        } else if (o.type === "window") {
            const frame = `T:${o.frame || "trim_white"}`;
            if (o.style === "slim") {
                const s = 0.055;
                const depth = 0.07;
                const z = t / 2 - depth / 2 - 0.05;
                const y = o.sill + o.height / 2;
                const W = o.width;
                const H = o.height;
                const m = { px: frame, nx: frame, py: frame, ny: frame, pz: frame, nz: frame };
                addSolid({ c: toWorld(origin, ux, uz, x, y + H / 2 - s / 2, z), ux, uz, hx: W / 2, hy: s / 2, hz: depth / 2, id: `${o.id}:frame-top`, owner, cls: "frame", mat: m });
                addSolid({ c: toWorld(origin, ux, uz, x, y - H / 2 + s / 2, z), ux, uz, hx: W / 2, hy: s / 2, hz: depth / 2, id: `${o.id}:frame-bottom`, owner, cls: "frame", mat: m });
                addSolid({ c: toWorld(origin, ux, uz, x - W / 2 + s / 2, y, z), ux, uz, hx: s / 2, hy: H / 2 - s, hz: depth / 2, id: `${o.id}:frame-l`, owner, cls: "frame", mat: m });
                addSolid({ c: toWorld(origin, ux, uz, x + W / 2 - s / 2, y, z), ux, uz, hx: s / 2, hy: H / 2 - s, hz: depth / 2, id: `${o.id}:frame-r`, owner, cls: "frame", mat: m });
                addSolid({ c: toWorld(origin, ux, uz, x, y, z), ux, uz, hx: (W - 0.08) / 2, hy: (H - 0.08) / 2, hz: 0.0075, id: `${o.id}:glass`, owner, cls: "glass", mat: mat6("T:glass_solar"), noOcclude: true });
                if (o.blind != null) addBlind(o, origin, ux, uz, half, t, owner, frame);
            }
        }
        cursor = end;
    }
    panel(cursor, L, 0, h, `p${r3(cursor)}`);
}
function addBlind(o, origin, ux, uz, half, t, owner, frame) {
    const x = o.offset - half;
    const top = o.sill + o.height;
    const out = t / 2;
    addSolid({ c: toWorld(origin, ux, uz, x, top - 0.08, out - 0.07), ux, uz, hx: o.width / 2, hy: 0.08, hz: 0.07, id: `${o.id}:blind-box`, owner, cls: "blind", mat: { px: frame, nx: frame, py: frame, ny: frame, pz: frame, nz: frame } });
}

// ---------------------------------------------------------------------------
// Roofs (flat)
// ---------------------------------------------------------------------------
for (const roof of S.roofs || []) {
    if (roof.type !== "flat") continue;
    const xs = roof.footprint.map((p) => p[0]);
    const zs = roof.footprint.map((p) => p[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const o = roof.overhang ?? 0.4;
    const th = roof.thickness ?? 0.18;
    const so = `T:${roof.soffit || "trim_white"}:behind`;
    addSolid({ c: [(x0 + x1) / 2, roof.base_height + th / 2, (z0 + z1) / 2], ux: 1, uz: 0, hx: (x1 - x0) / 2 + o, hy: th / 2, hz: (z1 - z0) / 2 + o, id: roof.id, owner: roof.id, cls: "roof", mat: { px: so, nx: so, py: `S:${roof.finish}:roof`, ny: so, pz: so, nz: so } });
}

// ---------------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------------
const stairSteps = [];
for (const st of S.stairs) {
    const yaw = ((st.yaw ?? 0) * Math.PI) / 180;
    const ux = Math.cos(yaw);
    const uz = -Math.sin(yaw);
    const origin = [st.start[0], st.base_height, st.start[1]];
    const rise = st.top_height - st.base_height;
    const going = st.run / st.steps;
    const stepRise = rise / st.steps;
    const slab = st.style === "slab";
    for (let i = 0; i < st.steps; i++) {
        const top = (i + 1) * stepRise;
        let depth;
        let solidTop = top;
        if (slab) depth = Math.min(top, stepRise + 0.17);
        else {
            depth = top - 0.032; // moulded: steps to the tread's underside, the kit tread over it
            solidTop = top - 0.032;
        }
        const s = addSolid({ c: toWorld(origin, ux, uz, 0, solidTop - depth / 2, i * going + going / 2), ux, uz, hx: st.width / 2, hy: depth / 2, hz: going / 2, id: `${st.id}:step${i}`, owner: st.id, cls: "step", mat: { ...mat6(`T:${st.riser || "trim_white"}:behind`), py: slab ? `S:${st.finish}:floor` : `T:${st.riser || "trim_white"}:behind` } });
        if (!slab) addSolid({ c: toWorld(origin, ux, uz, 0, top - 0.02, i * going + (going - 0.025) / 2), ux, uz, hx: st.width / 2, hy: 0.02, hz: (going + 0.025) / 2, id: `${st.id}:tread${i}`, owner: st.id, cls: "tread", mat: mat6(`S:${st.finish}:floor`) });
        const corners = [[-st.width / 2, i * going], [st.width / 2, i * going], [st.width / 2, (i + 1) * going], [-st.width / 2, (i + 1) * going]].map(([lx, lz]) => {
            const p = toWorld(origin, ux, uz, lx, 0, lz);
            return [p[0], p[2]];
        });
        stairSteps.push({ stair: st, i, top: st.base_height + top, poly: corners, solid: s });
    }
}

// ---------------------------------------------------------------------------
// Landscape (LandscapeBuilder)
// ---------------------------------------------------------------------------
const LS = S.landscape || {};
const W = "world"; // boxUVs: world-projected
function segSolid([ax, az], [bx, bz], base, top, thickness, extend, props) {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-6) return null;
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    return addSolid({ c: [(ax + bx) / 2, (base + top) / 2, (az + bz) / 2], ux, uz, hx: length / 2 + extend, hy: (top - base) / 2, hz: thickness / 2, uv: W, ...props });
}
for (const wall of LS.walls || []) {
    const [top0, top1] = wall.slope ?? [wall.top, wall.top];
    const pts = wall.path;
    for (let i = 0; i < pts.length - 1; i++) {
        const t0 = i === 0 ? top0 : wall.top;
        const t1 = i === pts.length - 2 ? top1 : wall.top;
        const sloped = Math.abs(t0 - t1) > 1e-6;
        const s = segSolid(pts[i], pts[i + 1], wall.base, Math.max(t0, t1), wall.thickness, wall.thickness / 2, { id: `${wall.id}:${i}`, owner: wall.id, cls: "lwall", mat: mat6(`S:${wall.finish ?? "dry_stone"}:wall`) });
        if (s && sloped) s.skipFaces.add("py");
        if (wall.coping !== false && !sloped) segSolid(pts[i], pts[i + 1], t0, t0 + 0.06, wall.thickness + 0.06, wall.thickness / 2 + 0.03, { id: `${wall.id}:coping${i}`, owner: wall.id, cls: "coping", mat: mat6("S:concrete_steps:wall") });
    }
}
for (const [k, kerb] of (LS.kerbs || []).entries()) {
    for (let i = 0; i < kerb.path.length - 1; i++) segSolid(kerb.path[i], kerb.path[i + 1], kerb.base - 0.1, kerb.base + kerb.height, kerb.width, 0, { id: `kerb${k}:${i}`, owner: `kerb${k}`, cls: "kerb", mat: mat6("S:concrete_steps:wall") });
}
for (const pg of LS.pergolas || []) {
    const [x0, z0, x1, z1] = pg.box;
    const top = pg.base + pg.height;
    const post = 0.12;
    const beam = 0.22;
    const fr = `T:${pg.frame || "frame_anthracite"}`;
    const box = (w, hh, d, x, y, z, id) => addSolid({ c: [x, y, z], ux: 1, uz: 0, hx: w / 2, hy: hh / 2, hz: d / 2, id: `${pg.id}:${id}`, owner: pg.id, cls: "pergola", mat: mat6(fr), uv: "local" });
    box(x1 - x0, beam, post, (x0 + x1) / 2, top - beam / 2, z0 + post / 2, "beam-z0");
    box(x1 - x0, beam, post, (x0 + x1) / 2, top - beam / 2, z1 - post / 2, "beam-z1");
    box(post, beam, z1 - z0 - post * 2, x0 + post / 2, top - beam / 2, (z0 + z1) / 2, "beam-x0");
    box(post, beam, z1 - z0 - post * 2, x1 - post / 2, top - beam / 2, (z0 + z1) / 2, "beam-x1");
    const against = pg.posts === "all" ? [] : [].concat(pg.against ?? "z0");
    const fixed = (x, z) => (x === x0 && against.includes("x0")) || (x === x1 && against.includes("x1")) || (z === z0 && against.includes("z0")) || (z === z1 && against.includes("z1"));
    let n = 0;
    const postAt = (px, pz) => box(post, pg.height - beam, post, px, pg.base + (pg.height - beam) / 2, pz, `post${n++}`);
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (!fixed(x, z)) postAt(x === x0 ? x0 + post / 2 : x1 - post / 2, z === z0 ? z0 + post / 2 : z1 - post / 2);
    const free = [["z1", x1 - x0, (t) => [x0 + t * (x1 - x0), z1 - post / 2]], ["z0", x1 - x0, (t) => [x0 + t * (x1 - x0), z0 + post / 2]], ["x1", z1 - z0, (t) => [x1 - post / 2, z0 + t * (z1 - z0)]], ["x0", z1 - z0, (t) => [x0 + post / 2, z0 + t * (z1 - z0)]]];
    for (const [side, length, at] of free) {
        if (against.includes(side) || pg.posts === "corners") continue;
        const spans = Math.ceil(length / (pg.span ?? 4.2));
        for (let k = 1; k < spans; k++) postAt(...at(k / spans));
    }
}
for (const pl of LS.planters || []) {
    const t = 0.012;
    for (let i = 0; i < pl.path.length - 1; i++) {
        const [a, b] = [pl.path[i], pl.path[i + 1]];
        const w = pl.width;
        const extend = w / 2;
        const top = pl.base + pl.height;
        const len0 = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const length = len0 + extend * 2;
        const ux = (b[0] - a[0]) / len0;
        const uz = (b[1] - a[1]) / len0;
        const nx = -uz;
        const nz = ux;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        for (const side of [-1, 1]) {
            const off = side * (w / 2 - t / 2);
            segSolid([a[0] + nx * off, a[1] + nz * off], [b[0] + nx * off, b[1] + nz * off], pl.base, top, t, extend, { id: `${pl.id}:side${side}`, owner: pl.id, cls: "planter", mat: mat6("S:corten:wall") });
            const e = side * (length / 2 - t / 2);
            segSolid([mid[0] + ux * e - nx * (w / 2), mid[1] + uz * e - nz * (w / 2)], [mid[0] + ux * e + nx * (w / 2), mid[1] + uz * e + nz * (w / 2)], pl.base, top, t, 0, { id: `${pl.id}:end${side}`, owner: pl.id, cls: "planter", mat: mat6("S:corten:wall") });
        }
        segSolid(a, b, top - 0.12, top - 0.07, w - t * 2, extend - t, { id: `${pl.id}:soil`, owner: pl.id, cls: "soil", mat: mat6("M:soil") });
    }
}
for (const [k, rl] of (LS.railings || []).entries()) {
    for (let i = 0; i < rl.points.length - 1; i++) {
        const [ax, az, ay] = rl.points[i];
        const [bx, bz, by] = rl.points[i + 1];
        if (Math.abs(ay - by) > 1e-6) continue; // raked: not coplanar with anything level
        segSolid([ax, az], [bx, bz], ay, ay + 0.07, 0.05, 0, { id: `${rl.id ?? `rail${k}`}:channel${i}`, owner: rl.id ?? `rail${k}`, cls: "railing", mat: mat6("T:frame_bronze") });
        segSolid([ax, az], [bx, bz], ay + 0.06, ay + rl.height, 0.016, 0, { id: `${rl.id ?? `rail${k}`}:glass${i}`, owner: rl.id ?? `rail${k}`, cls: "glass", mat: mat6("T:glass_balustrade"), noOcclude: true });
    }
}
for (const pool of LS.pools || []) {
    const [x0, z0, x1, z1] = pool.box;
    const rim = 0.02;
    const floor = pool.level - pool.depth;
    const t = 0.25;
    const b = (w, hh, d, x, y, z, id, m, cls = "pool") => addSolid({ c: [x, y, z], ux: 1, uz: 0, hx: w / 2, hy: hh / 2, hz: d / 2, id: `${pool.id}:${id}`, owner: pool.id, cls, mat: mat6(m), uv: W });
    b(x1 - x0 + t * 2, t, z1 - z0 + t * 2, (x0 + x1) / 2, floor - t / 2, (z0 + z1) / 2, "basin", "S:pool_mosaic:wall");
    b(x1 - x0 + t * 2, rim - floor, t, (x0 + x1) / 2, (rim + floor) / 2, z0 - t / 2, "wall-z0", "S:pool_mosaic:wall");
    b(x1 - x0 + t * 2, rim - floor, t, (x0 + x1) / 2, (rim + floor) / 2, z1 + t / 2, "wall-z1", "S:pool_mosaic:wall");
    b(t, rim - floor, z1 - z0, x0 - t / 2, (rim + floor) / 2, (z0 + z1) / 2, "wall-x0", "S:pool_mosaic:wall");
    b(t, rim - floor, z1 - z0, x1 + t / 2, (rim + floor) / 2, (z0 + z1) / 2, "wall-x1", "S:pool_mosaic:wall");
    const c = 0.32;
    const y = rim + 0.025;
    b(x1 - x0 + c * 2 - 0.06, 0.05, c, (x0 + x1) / 2, y, z0 - c / 2 + 0.03, "coping-z0", "S:stone_paving_floor:wall");
    b(x1 - x0 + c * 2 - 0.06, 0.05, c, (x0 + x1) / 2, y, z1 + c / 2 - 0.03, "coping-z1", "S:stone_paving_floor:wall");
    b(c, 0.05, z1 - z0 - 0.06, x0 - c / 2 + 0.03, y, (z0 + z1) / 2, "coping-x0", "S:stone_paving_floor:wall");
    b(c, 0.05, z1 - z0 - 0.06, x1 + c / 2 - 0.03, y, (z0 + z1) / 2, "coping-x1", "S:stone_paving_floor:wall");
    if (pool.deck) {
        const [d0, e0, d1, e1] = pool.deck;
        const [i0, j0, i1, j1] = [x0 - c + 0.03, z0 - c + 0.03, x1 + c - 0.03, z1 + c - 0.03];
        let n = 0;
        const deck = (a, bb, c2, d) => {
            if (c2 - a > 0.01 && d - bb > 0.01) b(c2 - a, 0.04, d - bb, (a + c2) / 2, 0.02, (bb + d) / 2, `deck${n++}`, "S:hardwood_deck:wall", "deck");
        };
        deck(d0, e0, d1, j0);
        deck(d0, j1, d1, e1);
        deck(d0, j0, i0, j1);
        deck(i1, j0, d1, j1);
    }
    // Its steps, as LandscapeBuilder's addPoolSteps lays them from shared/landscape.js's poolSteps: each tread a
    // block of mosaic from a centimetre under the floor behind its nosing, into the sides (and the top one into the
    // wall behind), a block under the nosing, and the nosing's stone flush on that. (The ramp is never drawn.)
    const steps = poolSteps(pool);
    if (steps) {
        const sink = 0.01;
        const [ox, oz] = steps.out;
        const grown = ([a, bb, c2, d], aside, back = 0, ahead = 0) => {
            const [lo, hi] = ox + oz > 0 ? [ahead, back] : [back, ahead];
            return ox ? [a - lo, bb - aside, c2 + hi, d + aside] : [a - aside, bb - lo, c2 + aside, d + hi];
        };
        const block = ([a, bb, c2, d], bottom, top, id, m) => b(c2 - a, top - bottom, d - bb, (a + c2) / 2, (top + bottom) / 2, (bb + d) / 2, id, m, "pool-steps");
        for (const [k, tread] of steps.treads.entries()) {
            const under = tread.top - NOSING_DEPTH;
            block(grown(tread.rest, sink, k === steps.count - 1 ? sink : 0), steps.floor - sink, tread.top, `tread${k}`, "S:pool_mosaic:wall");
            block(grown(tread.nosing, sink), steps.floor - sink, under, `tread${k}-front`, "S:pool_mosaic:wall");
            block(grown(tread.nosing, sink), under, tread.top, `nosing${k}`, "S:stone_paving_floor:wall");
        }
    }
}
for (const hedge of LS.hedges || []) {
    const w = hedge.width;
    for (let i = 0; i < hedge.path.length - 1; i++) {
        const [a, b] = [hedge.path[i], hedge.path[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // hedges.js core: length + w - 0.16 long, w - 0.16 wide, from base to base + h - 0.12
        segSolid(a, b, hedge.base ?? 0, (hedge.base ?? 0) + hedge.height - 0.12, w - 0.16, (w - 0.16) / 2, { id: `${hedge.id}:core${i}`, owner: hedge.id, cls: "hedge", mat: mat6("M:hedge"), uv: W });
        void len;
    }
}

// ---------------------------------------------------------------------------
// Furniture (catalogue boxes)
// ---------------------------------------------------------------------------
const furnitureBoxes = [];
for (const f of S.furniture) {
    const size = SIZE[f.catalog_id];
    if (!size) continue;
    const sc = f.scale ?? 1;
    const [w, hh, d] = size.map((v) => v * sc);
    const th = ((f.rotation ?? 0) * Math.PI) / 180;
    const ux = Math.cos(th);
    const uz = -Math.sin(th);
    const s = addSolid({ c: [f.position[0], f.position[1] + hh / 2, f.position[2]], ux, uz, hx: w / 2, hy: hh / 2, hz: d / 2, id: f.id, owner: f.id, cls: /rug/.test(f.catalog_id) ? "rug" : "furniture", mat: mat6(`F:${f.catalog_id}`), noOcclude: true, furniture: f });
    if (s) furnitureBoxes.push(s);
}

// ---------------------------------------------------------------------------
// Faces of the solids
// ---------------------------------------------------------------------------
function solidFaces(s) {
    const X = [s.ux, 0, s.uz];
    const Z = [-s.uz, 0, s.ux];
    const Y = [0, 1, 0];
    const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k, p[2] + v[2] * k];
    const faces = [];
    const quad = (n, hn, a, ha, b, hb, key) => {
        if (s.skipFaces.has(key)) return;
        const centre = add(s.c, n, hn);
        const pts = [add(add(centre, a, -ha), b, -hb), add(add(centre, a, ha), b, -hb), add(add(centre, a, ha), b, hb), add(add(centre, a, -ha), b, hb)];
        faces.push({ solid: s, key, n, pts, mat: s.mat[key] });
    };
    quad(X, s.hx, Z, s.hz, Y, s.hy, "px");
    quad(X.map((v) => -v), s.hx, Z, s.hz, Y, s.hy, "nx");
    quad(Y, s.hy, X, s.hx, Z, s.hz, "py");
    quad(Y.map((v) => -v), s.hy, X, s.hx, Z, s.hz, "ny");
    quad(Z, s.hz, X, s.hx, Y, s.hy, "pz");
    quad(Z.map((v) => -v), s.hz, X, s.hx, Y, s.hy, "nz");
    return faces;
}
const allFaces = solids.flatMap(solidFaces);

// Plane basis and keys
function planeOf(n, p) {
    if (Math.abs(n[1]) > 0.999) return { dir: n[1] > 0 ? "U" : "D", d: n[1] * p[1], to2: (q) => [q[0], q[2]] };
    const len = Math.hypot(n[0], n[2]);
    const nx = n[0] / len;
    const nz = n[2] / len;
    const ang = Math.atan2(nz, nx);
    return { dir: "V", ang, d: nx * p[0] + nz * p[2], to2: (q) => [-nz * q[0] + nx * q[2], q[1]], nx, nz };
}
for (const f of allFaces) {
    const pl = planeOf(f.n, f.pts[0]);
    f.plane = pl;
    f.poly2 = ccw(f.pts.map(pl.to2));
}

// ---------------------------------------------------------------------------
// Planes: floors, ceilings (double-sided), road paint
// ---------------------------------------------------------------------------
const SLAB_DEPTH = 0.6;
const openingCorners = (hole) => {
    const yaw = ((hole.yaw || 0) * Math.PI) / 180;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const hw = hole.width / 2;
    const hd = hole.depth / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [hole.position[0] + x * c + z * s, hole.position[1] - x * s + z * c]);
};
const planes = [];
for (const room of S.rooms) {
    const top = room.elevation + room.height;
    const floorHoles = [];
    const ceilingHoles = [];
    for (const hole of S.floor_openings || []) {
        if (Math.abs(hole.elevation - room.elevation) < 0.02) floorHoles.push(openingCorners(hole));
        if (top <= hole.elevation + 0.02 && top > hole.elevation - SLAB_DEPTH) ceilingHoles.push(openingCorners(hole));
    }
    for (const v of room.voids || []) {
        floorHoles.push(v);
        ceilingHoles.push(v);
    }
    const pieces = parts(room.polygon);
    const floorKind = FINISHES[room.floor_finish]?.kind === "ground" ? "ground" : "floor";
    planes.push({ id: `floor:${room.id}`, room, kind: "floor", y: room.elevation, pieces, holes: floorHoles, mat: `S:${room.floor_finish}:${floorKind}`, outdoor: room.ceiling_finish === "none" });
    if (room.ceiling_finish !== "none") planes.push({ id: `ceiling:${room.id}`, room, kind: "ceiling", y: top, pieces, holes: ceilingHoles, mat: `S:${room.ceiling_finish}:ceiling` });
}
// Flat roofs' undersides and tops, for the "is there room to stand there" tests only.
const coverPlanes = [...planes];
for (const roof of S.roofs || []) {
    if (roof.type !== "flat") continue;
    const xs = roof.footprint.map((p) => p[0]);
    const zs = roof.footprint.map((p) => p[1]);
    const o = roof.overhang ?? 0.4;
    const poly = rect(Math.min(...xs) - o, Math.min(...zs) - o, Math.max(...xs) + o, Math.max(...zs) + o);
    coverPlanes.push({ id: `roof:${roof.id}`, kind: "roof", y: roof.base_height, pieces: [poly], holes: [] });
    coverPlanes.push({ id: `roof-top:${roof.id}`, kind: "roof", y: roof.base_height + (roof.thickness ?? 0.18), pieces: [poly], holes: [] });
}
const covers = (pl, x, z) => pl.pieces.some((piece) => pointInPoly(x, z, piece)) && !pl.holes.some((h) => pointInPoly(x, z, h));
const planeAt = (x, z, yLo, yHi, except = null) => planes.find((p) => p !== except && p.y >= yLo && p.y <= yHi && p.pieces.some((piece) => pointInPoly(x, z, piece)) && !p.holes.some((h) => pointInPoly(x, z, h)));

// ---------------------------------------------------------------------------
// Terrain mesh (LandscapeBuilder.buildTerrain): exact vertex heights, linear in its triangles
// ---------------------------------------------------------------------------
const T = LS.terrain;
let terrainMesh = null;
if (T) {
    const lines = (from, to, step, extra = []) => {
        const out = [];
        for (let v = from; v <= to + 1e-6; v += step) out.push(v);
        for (const v of extra) if (v > from && v < to) out.push(v);
        out.sort((a, b) => a - b);
        return out.filter((v, i) => i === 0 || v - out[i - 1] > 0.005);
    };
    const detail = T.detail || { centre: [0, 0], half: 80, step: 1, outer: 6 };
    const [cx, cz] = detail.centre;
    const half = detail.half;
    const holes = [...(T.holes || []), ...(LS.pools || []).map((p) => rect(p.box[0] - 0.005, p.box[1] - 0.005, p.box[2] + 0.005, p.box[3] + 0.005))];
    const extraX = [];
    const extraZ = [];
    for (const pad of T.pads || []) {
        if ((pad.margin ?? 0) > 0) continue;
        for (const [x, z] of pad.polygon) {
            extraX.push(x, x - 0.01, x + 0.01);
            extraZ.push(z, z - 0.01, z + 0.01);
        }
    }
    for (const pad of T.pads || []) for (const [, z] of pad.polygon) if ((pad.margin ?? 0) > 0) extraZ.push(z);
    for (const hole of holes) for (const [x, z] of hole) {
        extraX.push(x);
        extraZ.push(z);
    }
    const size = T.size ?? 400;
    const [tx, tz] = T.centre ?? [0, 0];
    const inner = { xs: lines(cx - half, cx + half, detail.step ?? 1, extraX), zs: lines(cz - half, cz + half, detail.step ?? 1, extraZ), skip: (x, z) => holes.some((h) => pointInPoly(x, z, h)) };
    // --outer-pad-lines: emulate the proposed fix, the coarse grid also given every hard pad's
    // and hole's edges (LandscapeBuilder.buildTerrain's `outer` lines() with extraX/extraZ).
    const OUTER_FIX = args.includes("--outer-pad-lines");
    const outer = { xs: lines(tx - size / 2, tx + size / 2, detail.outer ?? 6, [cx - half, cx + half, ...(OUTER_FIX ? extraX : [])]), zs: lines(tz - size / 2, tz + size / 2, detail.outer ?? 6, [cz - half, cz + half, ...(OUTER_FIX ? extraZ : [])]), skip: () => false };
    const cache = new Map();
    const hv = (x, z) => {
        const k = `${x},${z}`;
        if (!cache.has(k)) cache.set(k, terrainHeight(T, x, z));
        return cache.get(k);
    };
    const find = (arr, v) => {
        let lo = 0;
        let hi = arr.length - 1;
        if (v < arr[0] || v > arr[hi]) return -1;
        while (hi - lo > 1) {
            const m = (lo + hi) >> 1;
            if (arr[m] <= v) lo = m;
            else hi = m;
        }
        return lo;
    };
    const inInner = (x, z) => x > cx - half && x < cx + half && z > cz - half && z < cz + half;
    terrainMesh = {
        inner, outer, half, cx, cz,
        /** The mesh's height at (x, z), or null where there is none (a hole). */
        at(x, z) {
            const g = inInner(x, z) ? inner : outer;
            const i = find(g.xs, x);
            const j = find(g.zs, z);
            if (i < 0 || j < 0) return null;
            const [x0, x1, z0, z1] = [g.xs[i], g.xs[i + 1], g.zs[j], g.zs[j + 1]];
            if (g === inner && inner.skip((x0 + x1) / 2, (z0 + z1) / 2)) return null;
            const fx = (x - x0) / (x1 - x0);
            const fz = (z - z0) / (z1 - z0);
            const ha = hv(x0, z0);
            const hb = hv(x1, z0);
            const hc = hv(x0, z1);
            const hd = hv(x1, z1);
            // indices.push(a, c, b, b, c, d): diagonal b–c
            if (fx + fz <= 1) return ha + fx * (hb - ha) + fz * (hc - ha);
            return hd + (1 - fx) * (hc - hd) + (1 - fz) * (hb - hd);
        },
        /** Grid vertices inside a polygon's bounding box. */
        vertices([x0, z0, x1, z1]) {
            const out = [];
            for (const g of [inner, outer]) {
                for (const x of g.xs) if (x >= x0 && x <= x1) for (const z of g.zs) if (z >= z0 && z <= z1) {
                    if ((g === inner) !== inInner(x, z) && !(g === inner)) continue;
                    out.push([x, z]);
                }
            }
            return out;
        },
    };
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------
function terrainAt(x, z) {
    return terrainMesh?.at(x, z) ?? null;
}
/** Between a ceiling and the slab over it (the void no eye gets into)? */
function inVoid(q) {
    const below = planes.find((pl) => pl.kind === "ceiling" && pl.y <= q[1] + 0.001 && pl.y > q[1] - SLAB_DEPTH && covers(pl, q[0], q[2]));
    if (!below) return false;
    return coverPlanes.some((pl) => pl.kind !== "ceiling" && pl.y >= q[1] - 0.001 && pl.y < below.y + SLAB_DEPTH && covers(pl, q[0], q[2]));
}
/**
 * Can an eye stand on the side a surface point faces? `p` lies on the FRONT one of the two
 * surfaces (the one further along `n`); `except` the solids the two belong to; `skipY` a
 * height whose planes are the pair itself, not something in the way.
 */
function visibleFrom(p, n, except, skipY = null) {
    const q = [p[0] + n[0] * 0.004, p[1] + n[1] * 0.004, p[2] + n[2] * 0.004];
    if (insideSolid(q, except)) return false;
    const g = terrainAt(q[0], q[2]);
    if (g != null && q[1] < g - 0.002 && !planeAt(q[0], q[2], q[1] - 3, q[1] + 0.001)) return false; // under the ground
    if (Math.abs(n[1]) > 0.5) {
        const up = n[1] > 0;
        let gap = Infinity;
        for (const pl of coverPlanes) {
            if (skipY != null && Math.abs(pl.y - skipY) <= TOL) continue;
            const d = up ? pl.y - q[1] : q[1] - pl.y;
            if (d < 0 || d >= gap) continue;
            if (covers(pl, q[0], q[2])) gap = d;
        }
        if (!up) {
            if (g != null) gap = Math.min(gap, q[1] - g);
            // Nothing to stand on below it at all (under the street's slabs): hidden.
            if (!Number.isFinite(gap)) return false;
        }
        // No eye fits in a gap under 30 cm (a slab's void, a kitchen's top under the ceiling).
        if (gap < 0.3) return false;
        // Something solid just beyond it (a wall standing on the slab over it, a box on it).
        for (const d of [0.05, 0.15, 0.29]) if (insideSolid([q[0], q[1] + n[1] * d, q[2]], except)) return false;
        return true;
    }
    return !inVoid(q);
}
/**
 * How a pair of parallel surfaces resolves, given their separation and polygonOffset layers.
 * `front`/`back` are the material tags of the geometrically front and back surface.
 */
function resolution(sep, frontTag, backTag) {
    const fo = offsetOf(frontTag);
    const bo = offsetOf(backTag);
    if (sameMat(frontTag, backTag) && flatColour(frontTag) && offVal(fo) === offVal(bo)) return { status: "same-colour", note: "same untextured material: no visible flicker (baked lightmaps aside)" };
    if (sep < 1e-4) {
        if (offVal(fo) !== offVal(bo)) return { status: "layered", note: `polygonOffset [${fo}] vs [${bo}] picks one (live view only)` };
        return { status: "FIGHT", note: "coplanar, same polygonOffset: flickers at any distance" };
    }
    if (offVal(fo) < offVal(bo)) return { status: "layered", note: `front one also layered in front ([${fo}] vs [${bo}])` };
    if (offVal(fo) === offVal(bo)) return { status: "FIGHT", from: fightAt(sep), note: `${r3(sep * 1000)} mm apart, same layer: flickers beyond ~${Math.round(fightAt(sep))} m (near ${NEAR}), ~${Math.round(fightAt(sep, 0.01))} m with near 0.01` };
    const df = Math.max(1, Math.abs(fo[0] - bo[0]));
    return { status: "INVERTED", from: sep / (0.0014 * df), note: `the surface ${r3(sep * 1000)} mm in front is layered BEHIND ([${fo}] vs [${bo}]): the one behind shows through at grazing views from ~${r3(sep / (0.0014 * df))} m` };
}
function samplePoints(pieces) {
    const pts = [centroid(pieces)];
    for (const piece of pieces) {
        const c = piece.reduce((s, v) => [s[0] + v[0] / piece.length, s[1] + v[1] / piece.length], [0, 0]);
        pts.push(c);
        for (const v of piece) pts.push([v[0] * 0.8 + c[0] * 0.2, v[1] * 0.8 + c[1] * 0.2]);
    }
    return pts;
}
/** Back from plane 2D coordinates to a 3D point. */
function from2(plane, [a, b]) {
    if (plane.dir !== "V") return [a, plane.d * (plane.dir === "U" ? 1 : -1), b];
    return [plane.nx * plane.d - plane.nz * a, b, plane.nz * plane.d + plane.nx * a];
}

// ---------------------------------------------------------------------------
// Coincidences
// ---------------------------------------------------------------------------
const findings = [];
const push = (f) => findings.push(f);
const localOf = (b, x, z) => (b && OFFSETS[b] ? [r3(x - OFFSETS[b][0]), r3(z - OFFSETS[b][1])] : null);
const fmtBox = ([a, b, c, d]) => `[${r3(a)}, ${r3(b)}]..[${r3(c)}, ${r3(d)}]`;

// 1. solid face vs solid face (same facing, planes < TOL apart)
{
    const groups = new Map();
    for (const f of allFaces) {
        const k = f.plane.dir === "V" ? `V${Math.round(((f.plane.ang * 180) / Math.PI) * 5)}` : f.plane.dir;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(f);
    }
    const keys = [...groups.keys()];
    const seen = new Set();
    for (const k of keys) {
        let cand = groups.get(k);
        if (k.startsWith("V")) {
            const a = Number(k.slice(1));
            cand = [...cand, ...(groups.get(`V${a + 1}`) || []), ...(groups.get(`V${a - 1}`) || [])];
            // wrap at ±180°
            if (Math.abs(a) >= 899) cand = [...cand, ...(groups.get(`V${-a}`) || []), ...(groups.get(`V${-a + Math.sign(a)}`) || [])];
        }
        const own = groups.get(k);
        cand = [...new Set(cand)].sort((p, q) => p.plane.d - q.plane.d);
        own.sort((p, q) => p.plane.d - q.plane.d);
        let start = 0;
        for (const f of own) {
            while (start < cand.length && cand[start].plane.d < f.plane.d - TOL) start++;
            for (let j = start; j < cand.length && cand[j].plane.d <= f.plane.d + TOL; j++) {
                const g = cand[j];
                if (g === f || g.solid === f.solid) continue;
                const pair = f.solid.index < g.solid.index ? `${f.solid.index}|${f.key}|${g.solid.index}|${g.key}` : `${g.solid.index}|${g.key}|${f.solid.index}|${f.key}`;
                if (seen.has(pair)) continue;
                seen.add(pair);
                // bring g into f's 2D basis
                const g2 = ccw(g.pts.map(f.plane.to2));
                const piece = clipConvex(f.poly2, g2);
                if (piece.length < 3) continue;
                const A = Math.abs(area(piece));
                if (A < MIN_AREA) continue;
                const sep = Math.abs(g.plane.d - f.plane.d);
                // The front one: further along the shared normal.
                const [front, back] = g.plane.d > f.plane.d + 1e-6 ? [g, f] : [f, g];
                const pts3 = samplePoints([piece]).map((q) => from2(front.plane, q));
                const except = new Set([f.solid.index, g.solid.index]);
                const visible = pts3.some((p) => visibleFrom(p, front.n, except));
                const corners = piece.map((q) => from2(f.plane, q));
                const bb = corners.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.min(b[2], p[2]), Math.max(b[3], p[0]), Math.max(b[4], p[1]), Math.max(b[5], p[2])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
                // Same textured material on both, its UVs from world position (boxUVs): the two draw the same texel.
                const sameLook = front.mat === back.mat && front.solid.uv === "world" && back.solid.uv === "world";
                const res = sameLook ? { status: "same-colour", note: "same material, world-projected UVs: identical texels" } : resolution(sep, front.mat, back.mat);
                push({ type: "solid-solid", a: front, b: back, area: A, sep, visible, bb, ...res });
            }
        }
    }
}

// 2. planes (floors/ceilings, double-sided) vs horizontal solid faces, and vs each other
{
    const hFaces = allFaces.filter((f) => f.plane.dir !== "V");
    for (const pl of planes) {
        for (const f of hFaces) {
            const y = f.pts[0][1];
            const sep = Math.abs(y - pl.y);
            if (sep > TOL) continue;
            const fp = ccw(f.pts.map((p) => [p[0], p[2]]));
            let pieces = intersect(pl.pieces, [fp]);
            if (!pieces.length) continue;
            pieces = minusHoles(pieces, pl.holes);
            const A = sumArea(pieces);
            if (A < MIN_AREA) continue;
            const pts = samplePoints(pieces);
            const except = new Set([f.solid.index]);
            // The plane is double-sided: the pair is seen from the side the face looks to.
            // Front: the higher of the two for an up-facing face, the lower for a down-facing one.
            const planeFront = f.n[1] > 0 ? pl.y > y + 1e-6 : pl.y < y - 1e-6;
            const fy = planeFront ? pl.y : y;
            const visible = pts.some(([x, z]) => visibleFrom([x, fy, z], f.n, except, pl.y));
            const res = planeFront ? resolution(sep, pl.mat, f.mat) : resolution(sep, f.mat, pl.mat);
            push({ type: "plane-solid", plane: pl, f, area: A, sep, visible, bb: bbox(pieces), y, planeFront, ...res });
        }
    }
    // plane vs plane
    for (let i = 0; i < planes.length; i++) {
        for (let j = i + 1; j < planes.length; j++) {
            const p = planes[i];
            const q = planes[j];
            const sep = Math.abs(p.y - q.y);
            if (sep > TOL) continue;
            let pieces = intersect(p.pieces, q.pieces);
            if (!pieces.length) continue;
            pieces = minusHoles(minusHoles(pieces, p.holes), q.holes);
            const A = sumArea(pieces);
            if (A < MIN_AREA) continue;
            const pts = samplePoints(pieces);
            const hi = p.y >= q.y ? p : q;
            const lo = hi === p ? q : p;
            const visible = pts.some(([x, z]) => visibleFrom([x, hi.y, z], [0, 1, 0], new Set(), hi.y) || visibleFrom([x, lo.y, z], [0, -1, 0], new Set(), lo.y));
            push({ type: "plane-plane", p: hi, q: lo, area: A, sep, visible, bb: bbox(pieces), y: hi.y, ...resolution(sep, hi.mat, lo.mat) });
        }
    }
}

// 3. road paint vs road paint
const paint = [];
for (const [k, line] of (LS.markings || []).entries()) {
    const [ax, az] = line.from;
    const [bx, bz] = line.to;
    const length = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    const [on, off] = line.dash ?? [length, 0];
    for (let s = 0; s < length; s += on + off) {
        const e = Math.min(length, s + on);
        const hw = line.width / 2;
        const p0 = [ax + ux * s, az + uz * s];
        const p1 = [ax + ux * e, az + uz * e];
        const n = [-uz * hw, ux * hw];
        paint.push({ line: k, y: line.base + 0.006, poly: ccw([[p0[0] + n[0], p0[1] + n[1]], [p1[0] + n[0], p1[1] + n[1]], [p1[0] - n[0], p1[1] - n[1]], [p0[0] - n[0], p0[1] - n[1]]]) });
    }
}
const paintOverlaps = [];
for (let i = 0; i < paint.length; i++) for (let j = i + 1; j < paint.length; j++) {
    const p = paint[i];
    const q = paint[j];
    if (p.line === q.line || Math.abs(p.y - q.y) > TOL) continue;
    const piece = clipConvex(p.poly, q.poly);
    if (piece.length >= 3 && Math.abs(area(piece)) > MIN_AREA) paintOverlaps.push({ a: p.line, b: q.line, area: Math.abs(area(piece)), bb: bbox([piece]) });
}

// ---------------------------------------------------------------------------
// 4. terrain vs ground-level slabs; 5. lawns/beds vs slabs; 6. paint vs its slab
// ---------------------------------------------------------------------------
const terrainIssues = [];
if (terrainMesh) {
    for (const room of S.rooms) {
        if (room.elevation > 0.6) continue;
        const xs = room.polygon.map((p) => p[0]);
        const zs = room.polygon.map((p) => p[1]);
        const box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
        const pts = terrainMesh.vertices(box).filter(([x, z]) => pointInPoly(x, z, room.polygon));
        // polygon edges, every 5 cm, pulled 1 mm inside
        const cxm = xs.reduce((a, b) => a + b, 0) / xs.length;
        const czm = zs.reduce((a, b) => a + b, 0) / zs.length;
        for (let i = 0; i < room.polygon.length; i++) {
            const [ax, az] = room.polygon[i];
            const [bx, bz] = room.polygon[(i + 1) % room.polygon.length];
            const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05));
            for (let k = 0; k <= n; k++) {
                const x = ax + ((bx - ax) * k) / n;
                const z = az + ((bz - az) * k) / n;
                const dx = cxm - x;
                const dz = czm - z;
                const dl = Math.hypot(dx, dz) || 1;
                const q = [x + (dx / dl) * 0.001, z + (dz / dl) * 0.001];
                if (pointInPoly(q[0], q[1], room.polygon)) pts.push(q);
            }
        }
        let worst = null;
        let poke = 0;
        let total = 0;
        const ext = [Infinity, Infinity, -Infinity, -Infinity];
        for (const [x, z] of pts) {
            const g = terrainMesh.at(x, z);
            if (g == null) continue;
            total += 1;
            const clear = room.elevation - g;
            if (clear < TOL) {
                poke += 1;
                ext[0] = Math.min(ext[0], x);
                ext[1] = Math.min(ext[1], z);
                ext[2] = Math.max(ext[2], x);
                ext[3] = Math.max(ext[3], z);
            }
            if (!worst || clear < worst.clear) worst = { clear, x, z, g };
        }
        if (worst && worst.clear < 0.03) terrainIssues.push({ room, worst, poke, total, ext });
    }
}
const lawnIssues = [];
{
    const groundRooms = S.rooms.filter((r) => r.elevation < 0.6 && r.elevation > -1.6);
    const roomParts = new Map(groundRooms.map((r) => [r.id, parts(r.polygon)]));
    const check = (kind, list) => {
        for (const [k, item] of list.entries()) {
            const lp = parts(item.polygon);
            for (const r of groundRooms) {
                const pieces = intersect(lp, roomParts.get(r.id));
                const A = sumArea(pieces);
                if (A > 0.01) lawnIssues.push({ kind, k, room: r, area: A, bb: bbox(pieces) });
            }
            for (const pool of LS.pools || []) {
                const pb = pool.deck ? [Math.min(pool.deck[0], pool.box[0] - 0.29), Math.min(pool.deck[1], pool.box[1] - 0.29), Math.max(pool.deck[2], pool.box[2] + 0.29), Math.max(pool.deck[3], pool.box[3] + 0.29)] : pool.box;
                const pieces = intersect(lp, [rect(...pb)]);
                const A = sumArea(pieces);
                if (A > 0.01) lawnIssues.push({ kind, k, room: { id: `${pool.id} (deck/coping/water)` }, area: A, bb: bbox(pieces) });
            }
        }
    };
    check("lawn", LS.lawns || []);
    check("grassBed", LS.grassBeds || []);
}
const paintIssues = [];
{
    const slabsAt = (y) => S.rooms.filter((r) => Math.abs(r.elevation - y) < 0.02);
    for (const [k, line] of (LS.markings || []).entries()) {
        const rooms = slabsAt(line.base);
        const [ax, az] = line.from;
        const [bx, bz] = line.to;
        const length = Math.hypot(bx - ax, bz - az);
        const n = Math.ceil(length / 0.5);
        let off = 0;
        let under = 0;
        let first = null;
        for (let i = 0; i <= n; i++) {
            const x = ax + ((bx - ax) * i) / n;
            const z = az + ((bz - az) * i) / n;
            if (!rooms.some((r) => pointInPoly(x, z, r.polygon))) {
                off += 1;
                first ??= [x, z];
            }
            const g = terrainAt(x, z);
            if (g != null && g > line.base + 0.006 - 0.002) {
                under += 1;
                first ??= [x, z];
            }
        }
        if (off || under) paintIssues.push({ k, line, off, under, n: n + 1, first });
    }
}

// ---------------------------------------------------------------------------
// 7. slabs and walls over stair flights (blocks the climb; the user's entrance-steps complaint)
// ---------------------------------------------------------------------------
const stairBlocks = [];
for (const step of stairSteps) {
    const sp = [ccw(step.poly)];
    for (const pl of planes) {
        if (pl.kind !== "floor") continue;
        const clear = pl.y - step.top;
        if (clear <= -0.005 || clear >= 2.05) continue;
        const pieces = minusHoles(intersect(pl.pieces, sp), pl.holes);
        const A = sumArea(pieces);
        if (A < 0.002) continue;
        stairBlocks.push({ step, what: pl.id, clear, area: A, bb: bbox(pieces) });
    }
    for (const s of solids) {
        if (!["lwall", "coping", "wall", "hedge", "kerb", "planter"].includes(s.cls)) continue;
        const top = s.c[1] + s.hy;
        const bottom = s.c[1] - s.hy;
        if (top <= step.top + 0.005 || bottom >= step.top + 2.0) continue;
        const fp = ccw([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [s.c[0] + a * s.hx * s.ux - b * s.hz * s.uz, s.c[2] + a * s.hx * s.uz + b * s.hz * s.ux]));
        const piece = clipConvex(sp[0], fp);
        if (piece.length < 3 || Math.abs(area(piece)) < 0.002) continue;
        stairBlocks.push({ step, what: s.id, clear: bottom - step.top, height: top - step.top, area: Math.abs(area(piece)), bb: bbox([piece]) });
    }
}

// ---------------------------------------------------------------------------
// 8. landscape clashes (not coplanar, but what the eye reads as the same fault)
// ---------------------------------------------------------------------------
const clashes = [];
{
    const fp = (s) => ccw([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [s.c[0] + a * s.hx * s.ux - b * s.hz * s.uz, s.c[2] + a * s.hx * s.uz + b * s.hz * s.ux]));
    const yr = (s) => [s.c[1] - s.hy, s.c[1] + s.hy];
    const soils = solids.filter((s) => s.cls === "soil");
    const planterSides = solids.filter((s) => s.cls === "planter");
    const posts = solids.filter((s) => s.cls === "pergola");
    const walls = solids.filter((s) => s.cls === "wall");
    for (const soil of soils) {
        for (const other of [...planterSides.filter((p) => p.owner !== soil.owner), ...posts, ...walls]) {
            const [a0, a1] = yr(soil);
            const [b0, b1] = yr(other);
            if (b1 <= a0 || b0 >= a1 + 0.07) continue;
            const piece = clipConvex(fp(soil), fp(other));
            if (piece.length >= 3 && Math.abs(area(piece)) > 0.001) clashes.push({ a: soil.id, b: other.id, area: Math.abs(area(piece)), bb: bbox([piece]) });
        }
    }
}

// ---------------------------------------------------------------------------
// Classification and fixes
// ---------------------------------------------------------------------------
const owner = (f) => f.solid.owner;
const cls = (f) => f.solid.cls;
const describeFace = (f) => `${f.solid.id}.${f.key}(${f.solid.cls}, ${f.mat})`;
function classify(x) {
    if (x.type === "solid-solid") {
        const c = [cls(x.a), cls(x.b)].sort().join("+");
        const sameOwner = owner(x.a) === owner(x.b);
        if (c.includes("glass")) return null;
        if (c === "lining+wall" && sameOwner) return "door-lining-own-wall";
        if (c === "threshold+threshold" || c.includes("threshold")) return "threshold";
        if (c === "frame+wall" || c === "blind+wall" || c === "blind+frame" || c === "frame+lining") return sameOwner ? "opening-own-wall" : "opening-vs-other-wall";
        if (c === "hedge+hedge") return "hedge-core";
        if (c === "planter+planter" || c === "planter+soil" || c === "soil+soil") return sameOwner ? "planter-own-corner" : "planter-vs-planter";
        if (c === "wall+wall") return "wall-wall";
        if (c.includes("furniture") || c.includes("rug")) return "furniture";
        if (c === "lwall+lwall" || c === "coping+lwall" || c === "coping+coping") return "landscape-wall";
        if (c.includes("step") || c.includes("tread")) return "stairs";
        return `other:${c}`;
    }
    if (x.type === "plane-solid") {
        const c = cls(x.f);
        if (c === "threshold") return "threshold";
        if (c === "wall") return x.f.key === "py" ? "wall-top-vs-floor" : "wall-bottom-vs-floor";
        if (c === "rug" || c === "furniture") return "furniture-vs-floor";
        if (c === "step" || c === "tread") return "stairs-vs-floor";
        return `plane-vs-${c}`;
    }
    if (x.type === "plane-plane") return "floor-floor";
    return "other";
}
for (const x of findings) x.cat = classify(x);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const out = [];
const log = (...a) => out.push(a.join(" "));
const byCat = new Map();
for (const x of findings) {
    if (!x.cat) continue;
    if (!byCat.has(x.cat)) byCat.set(x.cat, []);
    byCat.get(x.cat).push(x);
}
const where = (bb3) => {
    const [x0, y0, z0, x1, y1, z1] = bb3;
    return `x ${r3(x0)}..${r3(x1)}, y ${r3(y0)}..${r3(y1)}, z ${r3(z0)}..${r3(z1)}`;
};
const localWhere = (b, bb3) => {
    if (!b || !OFFSETS[b]) return "";
    const [ox, oz] = OFFSETS[b];
    return ` | ${b.toUpperCase()}-local x ${r3(bb3[0] - ox)}..${r3(bb3[3] - ox)}, z ${r3(bb3[2] - oz)}..${r3(bb3[5] - oz)}`;
};

log(`zfight-check — ${FROM_SOURCE ? "generator source (scripts/spaces/ladonia, validated)" : scenePath}`);
log(`tolerance ${TOL} m, min area ${MIN_AREA} m²; offsets A ${OFFSETS.a} B ${OFFSETS.b} C ${OFFSETS.c}`);
log(`solids ${solids.length} (faces ${allFaces.length}), planes ${planes.length}, paint quads ${paint.length}`);
log(`depth precision: near ${NEAR} → a gap of 1 mm fights from ${r3(fightAt(0.001))} m, 5 mm from ${r3(fightAt(0.005))} m, 1 cm from ${r3(fightAt(0.01))} m, 4 cm from ${r3(fightAt(0.04))} m (near 0.01: ${r3(fightAt(0.001, 0.01))} / ${r3(fightAt(0.005, 0.01))} / ${r3(fightAt(0.01, 0.01))} / ${r3(fightAt(0.04, 0.01))} m)`);
log("status: FIGHT = same polygonOffset layer, flickers (coplanar: always; apart: beyond the distance given);");
log("        INVERTED = the surface in front is layered behind the other, which shows through at grazing views;");
log("        layered = resolved in the live view by MaterialLibrary/LandscapeBuilder polygonOffset (NOT in a published runtime glTF);");
log("        same-colour = both the same untextured material, nothing to see.");
log("");
const summary = {};
const STATUSES = ["FIGHT", "INVERTED", "layered", "same-colour"];
for (const [cat, list] of [...byCat.entries()].sort()) {
    const vis = list.filter((x) => x.visible);
    summary[cat] = Object.fromEntries(STATUSES.map((st) => [st, vis.filter((x) => x.status === st).length]));
    summary[cat].hidden = list.length - vis.length;
    summary[cat].fightArea = r3(vis.filter((x) => x.status === "FIGHT" || x.status === "INVERTED").reduce((a, x) => a + x.area, 0));
}
log("SUMMARY of visible coincidences by status (hidden ones counted apart)");
log(`  ${"category".padEnd(26)} ${STATUSES.map((st) => st.padStart(12)).join("")}  hidden  fight/inverted m²`);
for (const [cat, sm] of Object.entries(summary)) log(`  ${cat.padEnd(26)} ${STATUSES.map((st) => String(sm[st]).padStart(12)).join("")}  ${String(sm.hidden).padStart(6)}  ${sm.fightArea}`);
log(`  ${"road-paint-overlaps".padEnd(26)} ${paintOverlaps.length}`);
log(`  ${"paint-off-slab/under-ground".padEnd(26)} ${paintIssues.length}`);
log(`  ${"terrain-vs-slab".padEnd(26)} ${terrainIssues.filter((t) => t.worst.clear < TOL).length} (marginal < 3 cm: ${terrainIssues.length})`);
log(`  ${"grass-through-slabs".padEnd(26)} ${lawnIssues.length}`);
log(`  ${"blocks-over-stairs".padEnd(26)} ${new Set(stairBlocks.map((b) => `${b.step.stair.id}|${b.what}`)).size} (flight × obstacle)`);
log(`  ${"planter-soil-clashes".padEnd(26)} ${clashes.length}`);
{
    const byFrame = {};
    for (const x of byCat.get("door-lining-own-wall") || []) {
        if (!x.visible) continue;
        const lining = x.a.solid.cls === "lining" ? x.a : x.b;
        const k = `${matName(lining.mat)}:${x.status}`;
        byFrame[k] = (byFrame[k] || 0) + 1;
    }
    log(`  door linings (${doorLinings} doors; jambs 1 mm inside the reveal, 5 mm proud of both faces): ${JSON.stringify(byFrame)}`);
}
log("");

const tagOf = (x) => `${x.status}${x.from ? `>${Math.round(x.from)}m` : ""}`;
function solidSolidLine(x) {
    const b = bldg(x.a.solid.id) || bldg(x.b.solid.id);
    return `${x.visible ? "" : "(hidden) "}[${tagOf(x)}] ${describeFace(x.a)}  ×  ${describeFace(x.b)}  sep ${r3(x.sep)} area ${r3(x.area)}  @ ${where(x.bb)}${localWhere(b, x.bb)}`;
}
function planeSolidLine(x) {
    const b = bldg(x.plane.room.id) || bldg(x.f.solid.id);
    const bb3 = [x.bb[0], x.y, x.bb[1], x.bb[2], x.y, x.bb[3]];
    return `${x.visible ? "" : "(hidden) "}[${tagOf(x)}] ${x.plane.id}(${x.plane.mat}) y ${x.plane.y}  ×  ${describeFace(x.f)} y ${r3(x.y)}  sep ${r3(x.sep)} area ${r3(x.area)}  @ ${where(bb3)}${localWhere(b, bb3)}`;
}
function planePlaneLine(x) {
    const b = bldg(x.p.room.id) || bldg(x.q.room.id);
    const bb3 = [x.bb[0], x.y, x.bb[1], x.bb[2], x.y, x.bb[3]];
    return `${x.visible ? "" : "(hidden) "}[${tagOf(x)}] ${x.p.id}(${x.p.mat}) y ${x.p.y}  ×  ${x.q.id}(${x.q.mat}) y ${x.q.y}  area ${r3(x.area)}  @ ${where(bb3)}${localWhere(b, bb3)}`;
}
const LIMIT = SHOW_ALL ? Infinity : 40;
const SHOW_STATUS = new Set(SHOW_ALL ? STATUSES : ["FIGHT", "INVERTED"]);
for (const [cat, list] of [...byCat.entries()].sort()) {
    const shown = list.filter((x) => (SHOW_ALL || x.visible) && SHOW_STATUS.has(x.status)).sort((p, q) => q.area - p.area);
    if (!shown.length) continue;
    log(`== ${cat}: ${shown.length}${shown.length > LIMIT ? ` (largest ${LIMIT})` : ""}`);
    for (const x of shown.slice(0, LIMIT)) log("  " + (x.type === "solid-solid" ? solidSolidLine(x) : x.type === "plane-solid" ? planeSolidLine(x) : planePlaneLine(x)));
    log("");
}
if (paintOverlaps.length) {
    log(`== road-paint-overlaps: ${paintOverlaps.length}`);
    for (const p of paintOverlaps.slice(0, 30)) log(`  markings[${p.a}] × markings[${p.b}] area ${r3(p.area)} @ ${fmtBox(p.bb)}`);
    log("");
}
if (paintIssues.length) {
    log(`== paint-off-slab/under-ground: ${paintIssues.length}`);
    for (const p of paintIssues) log(`  markings[${p.k}] ${JSON.stringify(p.line.from)}→${JSON.stringify(p.line.to)} base ${p.line.base}: ${p.off}/${p.n} samples off any slab at its base, ${p.under}/${p.n} under the terrain; first at ${p.first.map(r3)}`);
    log("");
}
if (terrainIssues.length) {
    log(`== terrain-vs-slab (clearance = slab − terrain mesh; < ${TOL} fights or pokes through): ${terrainIssues.length}`);
    for (const t of terrainIssues.sort((a, b) => a.worst.clear - b.worst.clear)) {
        const b = bldg(t.room.id);
        log(`  ${t.worst.clear < TOL ? "FIGHT  " : "margin "} ${t.room.id} elev ${t.room.elevation}: min clearance ${r3(t.worst.clear)} (terrain ${r3(t.worst.g)}) at site [${r3(t.worst.x)}, ${r3(t.worst.z)}]${b ? ` ${b.toUpperCase()}-local ${localOf(b, t.worst.x, t.worst.z)}` : ""}; ${t.poke}/${t.total} samples < ${TOL}${t.poke ? ` over ${fmtBox(t.ext)}` : ""}`);
    }
    log("");
}
if (lawnIssues.length) {
    log(`== grass-through-slabs (lawn/bed polygons over slabs; blades grow through them): ${lawnIssues.length}`);
    for (const l of lawnIssues) log(`  ${l.kind}[${l.k}] × ${l.room.id}${l.room.elevation != null ? ` (elev ${l.room.elevation})` : ""} area ${r3(l.area)} @ ${fmtBox(l.bb)}`);
    log("");
}
if (stairBlocks.length) {
    log(`== blocks-over-stairs (a slab or wall over a flight, under 2 m above its treads): ${stairBlocks.length}`);
    const grouped = new Map();
    for (const s of stairBlocks) {
        const k = `${s.step.stair.id}|${s.what}`;
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(s);
    }
    for (const [k, list] of grouped) {
        const [stair, what] = k.split("|");
        const bb = list.reduce((b, s) => [Math.min(b[0], s.bb[0]), Math.min(b[1], s.bb[1]), Math.max(b[2], s.bb[2]), Math.max(b[3], s.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
        const minClear = Math.min(...list.map((s) => s.clear));
        log(`  ${stair} steps ${list.map((s) => s.step.i).join(",")} under ${what}: clearance ${r3(minClear)}..${r3(Math.max(...list.map((s) => s.clear)))} m${list[0].height != null ? `, it stands ${r3(Math.max(...list.map((s) => s.height)))} m above the tread` : ""}, area ${r3(list.reduce((a, s) => a + s.area, 0))} @ ${fmtBox(bb)}`);
    }
    log("");
}
if (clashes.length) {
    log(`== planter-soil-clashes (another planter's side, a pergola post or a wall through a planter's soil): ${clashes.length}`);
    for (const c of clashes) log(`  ${c.a} × ${c.b} area ${r3(c.area)} @ ${fmtBox(c.bb)}`);
    log("");
}
console.log(out.join("\n"));
if (JSON_OUT) {
    const strip = (x) => ({
        cat: x.cat, type: x.type, visible: x.visible, area: r3(x.area), sep: r3(x.sep),
        status: x.status, from: x.from ? r3(x.from) : undefined,
        a: x.a ? describeFace(x.a) : x.plane ? x.plane.id : x.p?.id,
        b: x.b ? describeFace(x.b) : x.f ? describeFace(x.f) : x.q?.id,
        bb: x.bb.map(r3),
    });
    fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, findings: findings.filter((x) => x.cat).map(strip), paintOverlaps, paintIssues, terrainIssues: terrainIssues.map((t) => ({ room: t.room.id, ...t.worst, poke: t.poke, total: t.total })), lawnIssues: lawnIssues.map((l) => ({ ...l, room: l.room.id })), stairBlocks: stairBlocks.map((s) => ({ stair: s.step.stair.id, step: s.step.i, what: s.what, clear: r3(s.clear), area: r3(s.area), bb: s.bb.map(r3) })), clashes }, null, 1));
}

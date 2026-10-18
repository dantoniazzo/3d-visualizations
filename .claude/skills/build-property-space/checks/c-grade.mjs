#!/usr/bin/env node
/**
 * Building C at grade — checker. Read-only.
 *
 *   node c-grade.mjs                 the seeded scene (scenes/kosinozici-villas.json)
 *   node c-grade.mjs --code          built live from scripts/spaces/ladonia/index.js
 *   node c-grade.mjs --code=<path>   built from another index.js (a patched copy of scripts/spaces/ladonia/index.js)
 *   add --validate                   pass it through server/scene/validate.js first, as the seed does
 *   add --views=<path>               another ladonia-views.js (default: app-testing-and-performance's)
 *
 * Prints, with numbers:
 *  1. C's vertical offset per kind of element (rooms, walls, roofs, stairs,
 *     floor openings, furniture: scene value minus c.js/furnish.js's local
 *     value, matched by id; garden items: minus their local value) — all
 *     should be the same, -1.0 once C is at the street's level.
 *  2. The street on C's stretch: step flights, retaining walls / cheeks,
 *     terrain holes, front hedges.
 *  3. The ground: terrain over C's plot and A's near the boundary, the step
 *     between them and the wall that hides it, C's west and north edges,
 *     paving floating over / buried under the terrain, lawns / beds / hedges
 *     crossing the boundary wall.
 *  4. Landscape walls with coplanar overlapping faces (z-fighting).
 *  5. Outdoor slabs lying over the street steps (blocking the climb).
 *  6. Spawns: floor under them, furniture in the way.
 *  7. ladonia-views.js poses 12/13/14 and C's plan cuts against C's level.
 *
 * Paths: the repo is found from this file's location (four directories up:
 * checks -> build-property-space -> skills -> .claude -> repo); set REPO=<dir>
 * to check another checkout.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const { terrainHeight } = await import(`${REPO}/shared/landscape.js`);

const arg = process.argv.find((a) => a.startsWith("--code"));
let scene;
let source;
if (arg) {
    const path = arg.includes("=") ? arg.split("=")[1] : `${REPO}/scripts/spaces/ladonia/index.js`;
    const abs = path.startsWith("/") ? path : new URL(path, `file://${process.cwd()}/`).pathname;
    scene = (await import(abs)).ladonia;
    source = `code: ${abs}`;
    if (process.argv.includes("--validate")) {
        // As seed-scenes.js writes it.
        scene = (await import(`${REPO}/server/scene/validate.js`)).validateScene(scene).scene;
        source += " (validated)";
    }
} else {
    scene = JSON.parse(readFileSync(`${REPO}/scenes/kosinozici-villas.json`, "utf8")).scene;
    source = "seeded: scenes/kosinozici-villas.json";
}
const viewsPath = process.argv.find((a) => a.startsWith("--views="))?.split("=")[1] ?? `${REPO}/.claude/skills/app-testing-and-performance/ladonia-views.js`;

const L = scene.landscape;
const T = L.terrain;
const STREET = -1.0;
const WALL_X = 20.2;
const PLOT_Z = [-25.5, 44.7];
const C_AT = [2.5, -21];
const TARGET = STREET; // C's ground floor should be here
const r3 = (n) => Math.round(n * 1000) / 1000;
const f2 = (n) => (n == null || Number.isNaN(n) ? "—" : (Math.round(n * 100) / 100).toFixed(2));
const ground = (x, z) => terrainHeight(T, x, z);
const CATALOG = JSON.parse(readFileSync(`${REPO}/public/models/furniture/catalog.json`, "utf8"));
const SIZE = Object.fromEntries(CATALOG.items.map((i) => [i.id, i.size]));

function inPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}
const bbox = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const overlap1 = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

let problems = 0;
const bad = (msg) => {
    problems += 1;
    console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);
const info = (msg) => console.log(`    ${msg}`);

console.log(`Building C at grade — ${source}`);

// The A/C boundary: a landscape wall running east–west across the plots between them.
const acWall = (L.walls || []).find((w) => w.path.length >= 2 && w.path.every((p) => Math.abs(p[1] - w.path[0][1]) < 1e-6) && w.path[0][1] > -9 && w.path[0][1] < -2 && Math.min(...w.path.map((p) => p[0])) < -8 && Math.max(...w.path.map((p) => p[0])) > 19);
const AC_Z = acWall ? acWall.path[0][1] : -4.2;
console.log(`A/C boundary z = ${AC_Z}${acWall ? ` (wall ${acWall.id})` : " (no wall yet — the plan's proposed line)"}`);
const inC = (x, z) => z >= PLOT_Z[0] && z <= AC_Z && x <= WALL_X + 0.01 && x >= -8.6;

// ---------------------------------------------------------------------
// 1. C's vertical offset
// ---------------------------------------------------------------------
console.log("\n1. C's vertical offset (scene − local), each kind; all should be " + TARGET.toFixed(2));
const { buildingC } = await import(`${REPO}/scripts/spaces/ladonia/c.js`);
const { furnishC } = await import(`${REPO}/scripts/spaces/ladonia/furnish.js`);
const local = buildingC("c", C_AT, { furnish: furnishC }).out;
const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
const offsets = {};
const note = (kind, d) => {
    (offsets[kind] ??= new Map()).set(r3(d), ((offsets[kind] ?? new Map()).get(r3(d)) ?? 0) + 1);
};
let stale = 0;
const compare = (kind, list, sceneList, fields) => {
    const m = byId(sceneList);
    for (const item of list) {
        const s = m.get(item.id);
        if (!s) {
            stale += 1;
            continue;
        }
        for (const [name, get] of fields) {
            const a = get(s);
            const b = get(item);
            if (a == null || b == null) continue;
            note(`${kind}.${name}`, a - b);
        }
        if (kind === "furniture" && (s.catalog_id !== item.catalog_id || Math.abs(s.position[0] - item.position[0]) > 1e-3 || Math.abs(s.position[2] - item.position[2]) > 1e-3)) stale += 1;
    }
};
compare("rooms", local.rooms, scene.rooms, [["elevation", (r) => r.elevation]]);
compare("walls", local.walls, scene.walls, [["base_height", (w) => w.base_height]]);
compare("roofs", local.roofs, scene.roofs, [["base_height", (r) => r.base_height], ["ridge_height", (r) => r.ridge_height]]);
compare("stairs", local.stairs, scene.stairs, [["base_height", (s) => s.base_height], ["top_height", (s) => s.top_height]]);
compare("floor_openings", local.floor_openings, scene.floor_openings, [["elevation", (o) => o.elevation]]);
compare("furniture", local.furniture, scene.furniture, [["y", (f) => f.position[1]]]);
// Garden items, by their local values in index.js gardensC.
for (const p of L.pergolas || []) if (p.id.startsWith("c-")) note("garden.pergola.base(−6.4)", p.base - 6.4);
for (const p of L.planters || []) if (p.id.startsWith("c-")) note("garden.planter.base(−6.4)", p.base - 6.4);
for (const r of scene.rooms) if (/^c-(t-|path)/.test(r.id)) note("garden.paving.elevation(−0.01)", r.elevation - 0.01);
for (const h of L.hedges || []) if (h.id.startsWith("c-")) note("garden.hedge.base", h.base);
for (const h of L.hedges || []) if (h.id.startsWith("fh-") && h.path.some(([x, z]) => z < AC_Z - 0.5)) note("street.front-hedge(C stretch).base", h.base);
for (const l of L.lights || []) if (l.type === "uplight" && inC(l.position[0], l.position[2])) {
    note("garden.uplight.y(−0.05)", l.position[1] - 0.05);
    note("garden.uplight.target(−2.2)", l.target[1] - 2.2);
}
for (const t of L.trees || []) if (t.species?.startsWith("olive") && inC(...t.position)) note("garden.olive.ground(+0.03)", ground(...t.position) + 0.03);
const SPAWN_LOCAL = { "Building C — entrance": 0, "C1 — living room": 0, "C4 — living room": 3.2, "C — roof terrace": 6.4 };
for (const s of scene.spawns) if (s.label in SPAWN_LOCAL) note(`spawn "${s.label}"`, s.position[1] - SPAWN_LOCAL[s.label]);
for (const v of scene.vehicles || []) if (inC(v.position[0] - 5, v.position[1])) note(`vehicle ${v.id}.elevation`, v.elevation);
if (stale) bad(`${stale} C element(s) missing or moved in the scene relative to c.js/furnish.js — reseed (node scripts/seed-scenes.js kosinozici-villas)`);
for (const [kind, m] of Object.entries(offsets)) {
    const vals = [...m.entries()].map(([d, n]) => `${f2(d)}×${n}`).join(", ");
    const good = [...m.keys()].every((d) => Math.abs(d - TARGET) < 0.006);
    (good ? ok : bad)(`${kind.padEnd(42)} ${vals}`);
}

// ---------------------------------------------------------------------
// 2. The street on C's stretch
// ---------------------------------------------------------------------
console.log(`\n2. The street on C's stretch (z ${PLOT_Z[0]} .. ${AC_Z})`);
const flights = (scene.stairs || []).filter((s) => s.id.startsWith("steps-"));
const cFlights = flights.filter((s) => s.start[1] > PLOT_Z[0] && s.start[1] < AC_Z);
if (cFlights.length) for (const s of cFlights) bad(`step flight ${s.id} at z ${s.start[1]}: ${s.base_height} → ${s.top_height}`);
else ok("no step flight up from the parking on C's stretch");
for (const w of L.walls || []) {
    const zs = w.path.map((p) => p[1]);
    const xs = w.path.map((p) => p[0]);
    const alongFront = xs.every((x) => Math.abs(x - (WALL_X - 0.22)) < 0.05);
    const cheek = xs.some((x) => Math.abs(x - WALL_X) < 0.05) && xs.some((x) => x < WALL_X - 1) && zs.every((z) => Math.abs(z - zs[0]) < 1e-6) && zs[0] > PLOT_Z[0] + 0.1;
    const onC = overlap1(Math.min(...zs), Math.max(...zs), PLOT_Z[0], AC_Z - 0.3) > 0.05;
    if ((alongFront || cheek) && onC) bad(`${w.id} ${alongFront ? "retaining wall" : "cheek"} on C's stretch: z ${f2(Math.min(...zs))}..${f2(Math.max(...zs))}, base ${w.base} top ${w.top}`);
}
const holes = (T.holes || []).filter((h) => {
    const [x0, z0, x1, z1] = bbox(h);
    return z1 > PLOT_Z[0] && z0 < AC_Z && x1 > WALL_X - 3 && x0 < WALL_X + 1;
});
if (holes.length) for (const h of holes) bad(`terrain hole for steps on C's stretch: ${JSON.stringify(bbox(h).map(r3))}`);
else ok("no terrain hole for steps on C's stretch");
for (const h of L.hedges || []) if (h.id.startsWith("fh-") && h.path.some(([, z]) => z < AC_Z - 0.5)) info(`front hedge ${h.id}: z ${f2(h.path[0][1])}..${f2(h.path.at(-1)[1])}, base ${h.base}`);
const endWall = (L.walls || []).find((w) => w.path.every((p) => Math.abs(p[1] - PLOT_Z[0]) < 1e-6));
if (endWall) {
    const tops = endWall.slope ?? [endWall.top, endWall.top];
    const above = Math.max(...tops) - (TARGET - 0.03);
    (above > 0.6 ? bad : ok)(`${endWall.id} (C's north end by the lane): base ${endWall.base}, top ${tops.join("→")} — ${f2(above)} m above C's grade`);
}
const parkingC = scene.rooms.find((r) => r.id === "parking-c");
if (parkingC) info(`parking-c slab at ${parkingC.elevation} (STREET ${STREET})`);

// ---------------------------------------------------------------------
// 3. The ground
// ---------------------------------------------------------------------
console.log("\n3. The ground");
const sample = (x0, z0, x1, z1, step = 0.5) => {
    let lo = Infinity;
    let hi = -Infinity;
    let at = null;
    for (let x = x0; x <= x1 + 1e-9; x += step)
        for (let z = z0; z <= z1 + 1e-9; z += step) {
            const h = ground(x, z);
            if (h < lo) lo = h;
            if (h > hi) [hi, at] = [h, [r3(x), r3(z)]];
        }
    return { lo, hi, at };
};
const cPlot = sample(-8.5, PLOT_Z[0] + 0.1, WALL_X - 0.05, AC_Z - 0.3);
(Math.abs(cPlot.lo - (TARGET - 0.03)) < 0.02 && Math.abs(cPlot.hi - (TARGET - 0.03)) < 0.02 ? ok : bad)(`terrain over C's plot: ${f2(cPlot.lo)} .. ${f2(cPlot.hi)} (want ${f2(TARGET - 0.03)}); highest at ${JSON.stringify(cPlot.at)}`);
const cNorth = sample(-8.5, PLOT_Z[0] + 0.1, WALL_X - 0.05, PLOT_Z[0] + 5);
info(`  of which its north 5 m (by the lane): ${f2(cNorth.lo)} .. ${f2(cNorth.hi)}`);
const aPlot = sample(-8.5, AC_Z + 0.3, WALL_X - 0.05, AC_Z + 8);
(Math.abs(aPlot.lo + 0.03) < 0.02 && Math.abs(aPlot.hi + 0.03) < 0.02 ? ok : bad)(`terrain over A's plot, 8 m south of the boundary: ${f2(aPlot.lo)} .. ${f2(aPlot.hi)} (want -0.03)`);
// Boundary step and the wall over it.
let worst = 0;
for (let x = -8.4; x <= WALL_X; x += 0.5) worst = Math.max(worst, Math.abs(ground(x, AC_Z + 0.24) - ground(x, AC_Z - 0.24)));
info(`step in the ground across z=${AC_Z} (±0.24): up to ${f2(worst)} m`);
if (worst > 0.1) {
    if (!acWall) bad(`no wall along z=${AC_Z} to hide a ${f2(worst)} m step in the ground`);
    else {
        const lo = Math.min(...[-8.4, 0, 10, WALL_X - 0.1].map((x) => ground(x, AC_Z - 0.3)));
        const hi = Math.max(...[-8.4, 0, 10, WALL_X - 0.1].map((x) => ground(x, AC_Z + 0.3)));
        const tops = acWall.slope ?? [acWall.top, acWall.top];
        (acWall.base <= lo + 0.001 && Math.min(...tops) >= hi ? ok : bad)(`${acWall.id}: base ${acWall.base} (ground north ${f2(lo)}), top ${tops.join("→")} (ground south ${f2(hi)}), thickness ${acWall.thickness}`);
    }
}
// A wall's top at a point along it (linear in its path, slope at the ends).
const topAt = (w, x, z) => {
    for (let i = 0; i < w.path.length - 1; i++) {
        const [a, b] = [w.path[i], w.path[i + 1]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const t = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (len * len);
        const ext = w.thickness / 2;
        if (t * len < -ext || t * len > len + ext) continue;
        const d = Math.abs((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / len;
        if (d > w.thickness / 2 + 0.05) continue;
        const t0 = i === 0 && w.slope ? w.slope[0] : w.top;
        const t1 = i === w.path.length - 2 && w.slope ? w.slope[1] : w.top;
        return { top: t0 + (t1 - t0) * Math.max(0, Math.min(1, t)), base: w.base, id: w.id };
    }
    return null;
};
// Every wall standing at (x, z): the highest top, the lowest base.
const wallAt = (x, z) => {
    const hits = (L.walls || []).map((w) => topAt(w, x, z)).filter(Boolean);
    if (!hits.length) return null;
    const top = hits.reduce((m, h) => (h.top > m.top ? h : m));
    return { top: top.top, id: top.id, base: Math.min(...hits.map((h) => h.base)) };
};
// West edge (x = -8.7 hard edge, the back wall at -8.5) and north edge (z = -25.5) of C's plot.
const edge = (label, pts, outside, insideP) => {
    let exposed = 0;
    let floating = 0;
    let where = null;
    for (const [x, z] of pts) {
        const out = ground(...outside(x, z));
        const ins = ground(...insideP(x, z));
        const w = wallAt(x, z);
        if (!w) continue;
        const e = Math.max(out, ins) - w.top;
        if (e > exposed) [exposed, where] = [e, [r3(x), r3(z), w.id, f2(out), f2(ins), f2(w.top)]];
        floating = Math.max(floating, w.base - Math.min(out, ins));
    }
    (exposed < 0.02 && floating < 0.02 ? ok : bad)(`${label}: ground above the wall's top by up to ${f2(exposed)}${where ? ` at ${JSON.stringify(where)} [x,z,wall,out,in,top]` : ""}; wall base above the ground by up to ${f2(floating)}`);
};
const west = [];
for (let z = PLOT_Z[0] + 0.3; z <= AC_Z - 0.3; z += 0.25) west.push([-8.5, z]);
edge("C's west edge (back wall at x -8.5)", west, (x, z) => [-8.76, z], (x, z) => [-8.24, z]);
const north = [];
for (let x = -8.3; x <= WALL_X; x += 0.5) north.push([x, PLOT_Z[0]]);
edge("C's north edge (wall at z -25.5)", north, (x, z) => [x, z - 0.26], (x, z) => [x, z + 0.26]);
// Paving on the ground.
for (const r of scene.rooms) {
    if (!/^c-(t-|path)/.test(r.id)) continue;
    const [x0, z0, x1, z1] = bbox(r.polygon);
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = x0 + 0.05; x <= x1; x += 0.5) for (let z = z0 + 0.05; z <= z1; z += 0.5) if (inPoly(x, z, r.polygon)) {
        const gap = r.elevation - ground(x, z);
        lo = Math.min(lo, gap);
        hi = Math.max(hi, gap);
    }
    (lo >= 0 && hi <= 0.08 ? ok : bad)(`${r.id.padEnd(8)} at ${r.elevation}: ${f2(lo)} .. ${f2(hi)} above the ground (want 0 .. 0.08)`);
}
// Lawns, beds and hedges crossing the boundary wall's footprint.
if (acWall) {
    const half = acWall.thickness / 2;
    const band = [AC_Z - half, AC_Z + half];
    for (const lawn of L.lawns || []) {
        const [, z0, , z1] = bbox(lawn.polygon);
        if (overlap1(z0, z1, ...band) > 0.001 && z0 < AC_Z) bad(`lawn ${JSON.stringify(lawn.polygon[0])}.. reaches z ${f2(z1)} into the boundary wall (${f2(band[0])}..${f2(band[1])})`);
    }
    for (const bed of L.grassBeds || []) {
        const [, z0, , z1] = bbox(bed.polygon);
        if (overlap1(z0, z1, ...band) > 0.001 && z0 < AC_Z) bad(`bed ${JSON.stringify(bed.polygon[0])}.. reaches z ${f2(z1)} into the boundary wall`);
    }
    for (const h of L.hedges || []) {
        const zs = h.path.map((p) => p[1]);
        const ext = h.width * 0.3;
        const lo = Math.min(...zs) - (zs.every((z) => z === zs[0]) ? h.width / 2 : ext);
        const hi = Math.max(...zs) + (zs.every((z) => z === zs[0]) ? h.width / 2 : ext);
        if (overlap1(lo, hi, ...band) > 0.001 && h.base < AC_Z && h.base < -0.5) bad(`hedge ${h.id} (base ${h.base}) spans z ${f2(lo)}..${f2(hi)} into the boundary wall`);
        if (h.base < -0.5 && hi > band[1]) bad(`hedge ${h.id} at C's level (base ${h.base}) runs on past the wall onto A's plot (to z ${f2(hi)})`);
        if (h.base > -0.5 && lo < band[0] - 0.01 && Math.min(...zs) < AC_Z && h.path.some(([x]) => x > -8.6)) bad(`hedge ${h.id} at A's level (base ${h.base}) runs north past the wall over C's plot (from z ${f2(lo)})`);
    }
}

// ---------------------------------------------------------------------
// 4. Landscape walls: coplanar overlapping faces (z-fighting)
// ---------------------------------------------------------------------
console.log("\n4. Landscape walls — coplanar overlapping faces (z-fighting)");
// Axis-aligned walls only (all of Ladonia's are): each segment's box and, unless laid dry, its coping.
const solids = [];
for (const w of L.walls || []) {
    for (let i = 0; i < w.path.length - 1; i++) {
        const [a, b] = [w.path[i], w.path[i + 1]];
        const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
        const t0 = i === 0 && w.slope ? w.slope[0] : w.top;
        const t1 = i === w.path.length - 2 && w.slope ? w.slope[1] : w.top;
        const mk = (half, ext, base, top0, top1, tag) => {
            // LandscapeBuilder.addWall: run on `ext` past the end; past the start only at the path's start, else stop `ext` short.
            const e0 = i === 0 ? ext : -ext;
            const ax = a[0] - Math.sign(b[0] - a[0]) * e0, az = a[1] - Math.sign(b[1] - a[1]) * e0;
            const bx = b[0] + Math.sign(b[0] - a[0]) * ext, bz = b[1] + Math.sign(b[1] - a[1]) * ext;
            const x0 = Math.min(ax, bx) - (alongX ? 0 : half);
            const x1 = Math.max(ax, bx) + (alongX ? 0 : half);
            const z0 = Math.min(az, bz) - (alongX ? half : 0);
            const z1 = Math.max(az, bz) + (alongX ? half : 0);
            solids.push({ id: `${w.id}${w.path.length > 2 ? `#${i}` : ""}${tag}`, x0, x1, z0, z1, base, top: Math.max(top0, top1), flat: Math.abs(top0 - top1) < 1e-6 });
        };
        mk(w.thickness / 2, w.thickness / 2, w.base, t0, t1, "");
        if (w.coping !== false) mk(w.thickness / 2 + 0.03, w.thickness / 2 + 0.03, Math.min(t0, t1), t0 + 0.06, t1 + 0.06, " coping");
    }
}
for (const k of L.kerbs || []) for (let i = 0; i < k.path.length - 1; i++) {
    const [a, b] = [k.path[i], k.path[i + 1]];
    solids.push({ id: "kerb", x0: Math.min(a[0], b[0]) - k.width / 2, x1: Math.max(a[0], b[0]) + k.width / 2, z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), base: k.base - 0.1, top: k.base + k.height, flat: true });
}
const E = 0.002;
const fights = [];
const enclosed = (box, ...not) => solids.some((S) => !not.includes(S) && S.x0 <= box.x0 + E && S.x1 >= box.x1 - E && S.z0 <= box.z0 + E && S.z1 >= box.z1 - E && S.base <= box.y0 + E && S.top >= box.y1 - E);
for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
        const A = solids[i];
        const B = solids[j];
        const ox = overlap1(A.x0, A.x1, B.x0, B.x1);
        const oz = overlap1(A.z0, A.z1, B.z0, B.z1);
        const oy = overlap1(A.base, A.top, B.base, B.top);
        // Tops level with each other over a shared patch.
        const patch = { x0: Math.max(A.x0, B.x0), x1: Math.min(A.x1, B.x1), z0: Math.max(A.z0, B.z0), z1: Math.min(A.z1, B.z1) };
        if (A.flat && B.flat && Math.abs(A.top - B.top) < E && ox > 0.01 && oz > 0.01 && !enclosed({ ...patch, y0: A.top, y1: A.top }, A, B)) fights.push(`${A.id} / ${B.id}: tops both at ${f2(A.top)} over ${f2(ox)}×${f2(oz)} m`);
        // Side faces in one plane over a shared patch.
        for (const [pa, pb, axis] of [[A.x0, B.x0, "x"], [A.x0, B.x1, "x"], [A.x1, B.x0, "x"], [A.x1, B.x1, "x"], [A.z0, B.z0, "z"], [A.z0, B.z1, "z"], [A.z1, B.z0, "z"], [A.z1, B.z1, "z"]]) {
            if (Math.abs(pa - pb) > E) continue;
            const other = axis === "x" ? oz : ox;
            const face = axis === "x" ? { x0: pa, x1: pa, z0: patch.z0, z1: patch.z1 } : { x0: patch.x0, x1: patch.x1, z0: pa, z1: pa };
            if (other > 0.01 && oy > 0.01 && !enclosed({ ...face, y0: Math.max(A.base, B.base), y1: Math.min(A.top, B.top) }, A, B)) fights.push(`${A.id} / ${B.id}: faces both at ${axis}=${f2(pa)} over ${f2(other)}×${f2(oy)} m`);
        }
    }
if (fights.length) for (const f of fights) bad(f);
else ok("none");

// ---------------------------------------------------------------------
// 5. Outdoor slabs over the street steps
// ---------------------------------------------------------------------
console.log("\n5. Slabs lying over the street steps (the climb blocked)");
const dir = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] };
let anySlab = false;
for (const s of flights) {
    const [dx, dz] = dir[s.direction];
    const [sx, sz] = s.start;
    const ex = sx + dx * s.run;
    const ez = sz + dz * s.run;
    const half = s.width / 2;
    const fx0 = Math.min(sx, ex) - (dx ? 0 : half);
    const fx1 = Math.max(sx, ex) + (dx ? 0 : half);
    const fz0 = Math.min(sz, ez) - (dz ? 0 : half);
    const fz1 = Math.max(sz, ez) + (dz ? 0 : half);
    for (const r of scene.rooms) {
        if (r.ceiling_finish !== "none") continue;
        const [x0, z0, x1, z1] = bbox(r.polygon);
        const ox = overlap1(x0, x1, fx0, fx1);
        const oz = overlap1(z0, z1, fz0, fz1);
        if (ox <= 0.01 || oz <= 0.01) continue;
        if (r.elevation <= s.base_height + 0.05 || r.elevation > s.top_height + 0.05) continue;
        // How far above the flight's nosing line the slab is at its edge nearest the foot.
        const edgeAlong = dx ? (dx < 0 ? sx - x1 : x0 - sx) : dz < 0 ? sz - z1 : z0 - sz;
        const along = Math.max(0, edgeAlong);
        const line = s.base_height + ((s.top_height - s.base_height) * along) / s.run;
        anySlab = true;
        bad(`${r.id} (elevation ${r.elevation}) lies over ${s.id} for ${f2(dx ? ox : oz)} m of its ${s.run} m run (×${f2(dx ? oz : ox)} m across): ${f2(r.elevation - line)} m over the steps at its edge, ${f2(along)} m up from the foot — the 1.9 m capsule cannot pass under`);
    }
}
if (!anySlab) ok("none");

// ---------------------------------------------------------------------
// 6. Spawns
// ---------------------------------------------------------------------
console.log("\n6. Spawns: floor under them, furniture within the capsule's 0.35 m");
const footprint = (f) => {
    const s = SIZE[f.catalog_id];
    if (!s) return null;
    const th = ((f.rotation ?? 0) * Math.PI) / 180;
    const [w, d] = [s[0] * (f.scale ?? 1), s[2] * (f.scale ?? 1)];
    const c = Math.cos(th);
    const sn = Math.sin(th);
    return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [f.position[0] + x * c + z * sn, f.position[2] - x * sn + z * c]);
};
const distToPoly = (x, z, poly) => {
    if (inPoly(x, z, poly)) return 0;
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i];
        const [bx, bz] = poly[(i + 1) % poly.length];
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
        best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
    }
    return best;
};
for (const sp of scene.spawns) {
    const [x, y, z] = sp.position;
    const floor = scene.rooms.find((r) => Math.abs(r.elevation - y) < 0.06 && inPoly(x, z, r.polygon));
    const g = ground(x, z);
    const onGround = !floor && Math.abs(g - y) < 0.1;
    const hits = scene.furniture
        .filter((f) => Math.abs(f.position[1] - y) < 1.8 && !/rug|pendant|track|wall-light|art|curtain|sheer/.test(f.catalog_id))
        .map((f) => [f, footprint(f)])
        .filter(([, p]) => p && distToPoly(x, z, p) < 0.35)
        .map(([f, p]) => `${f.id} ${f.catalog_id} (${f2(distToPoly(x, z, p))} m)`);
    const where = floor ? `on ${floor.id}` : onGround ? `on the ground (${f2(g)})` : `NO floor at y ${y} (ground ${f2(g)})`;
    if ((floor || onGround) && !hits.length) {
        ok(`"${sp.label}" ${where}`);
        continue;
    }
    bad(`"${sp.label}" [${sp.position}] ${where}${hits.length ? `; in the way: ${hits.join(", ")}` : ""}`);
    if (floor) {
        const free = freeSpot(x, y, z, floor);
        if (free) info(`  nearest clear spot on ${floor.id}: [${free.map(r3)}] (${f2(Math.hypot(free[0] - x, free[1] - z))} m away; building-local x ${f2(free[0] - (sp.label.startsWith("C") || sp.label.includes("Building C") ? C_AT[0] : sp.label.startsWith("Building B") ? 0 : 0))}, z ${f2(free[1] - (sp.label.startsWith("C") || sp.label.includes("Building C") ? C_AT[1] : sp.label.startsWith("Building B") ? 24.2 : 0))})`);
    }
}

/** The nearest point within 3 m, on the same floor, 0.45 m clear of furniture, walls, planters, holes and the floor's edge. */
function freeSpot(x, y, z, floor) {
    const pieces = scene.furniture.filter((f) => Math.abs(f.position[1] - y) < 1.8 && !/rug|pendant|track|wall-light|art|curtain|sheer/.test(f.catalog_id)).map(footprint).filter(Boolean);
    const walls = scene.walls.filter((w) => w.base_height <= y + 0.3 && w.base_height + w.height >= y + 0.5);
    const planters = (L.planters || []).filter((p) => Math.abs(p.base - y) < 0.3);
    const holes = (scene.floor_openings || []).filter((o) => Math.abs(o.elevation - y) < 0.05);
    const segDist = (px, pz, [ax, az], [bx, bz]) => {
        const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
        return Math.hypot(px - ax - t * (bx - ax), pz - az - t * (bz - az));
    };
    let best = null;
    for (let dx = -3; dx <= 3.001; dx += 0.1)
        for (let dz = -3; dz <= 3.001; dz += 0.1) {
            const px = x + dx;
            const pz = z + dz;
            const d = Math.hypot(dx, dz);
            if (best && d >= best[2]) continue;
            if (!inPoly(px, pz, floor.polygon)) continue;
            let edge = Infinity;
            for (let i = 0; i < floor.polygon.length; i++) edge = Math.min(edge, segDist(px, pz, floor.polygon[i], floor.polygon[(i + 1) % floor.polygon.length]));
            if (edge < 0.45) continue;
            if (pieces.some((p) => distToPoly(px, pz, p) < 0.45)) continue;
            if (walls.some((w) => segDist(px, pz, w.start, w.end) < w.thickness / 2 + 0.4)) continue;
            if (planters.some((p) => p.path.slice(1).some((b, i) => segDist(px, pz, p.path[i], b) < p.width / 2 + 0.4))) continue;
            if (holes.some((o) => Math.abs(px - o.position[0]) < o.width / 2 + 0.4 && Math.abs(pz - o.position[1]) < o.depth / 2 + 0.4)) continue;
            best = [px, pz, d];
        }
    return best;
}

// ---------------------------------------------------------------------
// 7. Camera poses and plan cuts
// ---------------------------------------------------------------------
console.log("\n7. ladonia-views.js — C's poses and plan cuts against C's level");
const views = readFileSync(viewsPath, "utf8");
const cGround = scene.rooms.find((r) => r.id === "c-g-c1-living")?.elevation ?? 0;
const floorUnder = (x, y, z) => {
    let best = ground(x, z);
    let what = "terrain";
    for (const r of scene.rooms) if (r.elevation <= y && r.elevation > best && inPoly(x, z, r.polygon)) [best, what] = [r.elevation, r.id];
    return [best, what];
};
for (const k of ["12", "13", "14"]) {
    const m = views.match(new RegExp(`"${k}": \\[\\[([^\\]]+)\\], \\[([^\\]]+)\\], (\\d+)\\]`));
    if (!m) continue;
    const cam = m[1].split(",").map(Number);
    const tgt = m[2].split(",").map(Number);
    const [g, what] = floorUnder(...cam);
    const plot = inC(cam[0], cam[2]) ? "C's plot" : cam[2] > AC_Z && cam[0] < WALL_X ? "A's plot" : "street/lane/outside";
    const eye = cam[1] - g;
    (eye > 0.3 ? ok : bad)(`pose ${k}: camera [${cam}] over ${what} at ${f2(g)} (${plot}) → ${f2(eye)} m up; target y ${tgt[1]} = C ground ${f2(cGround)} + ${f2(tgt[1] - cGround)}`);
}
const plans = views.match(/C0: \[([^\]]+)\], C1: \[([^\]]+)\], C2: \[([^\]]+)\]/);
if (plans) {
    const ys = plans.slice(1).map((s) => Number(s.split(",")[2]));
    const want = [cGround, cGround + 3.2, cGround + 6.4];
    (ys.every((y, i) => Math.abs(y - want[i]) < 0.01) ? ok : bad)(`plan cuts C0/C1/C2 at floor y ${ys.join(", ")} (C's floors at ${want.map(f2).join(", ")})`);
}

console.log(`\n${problems} problem(s).`);

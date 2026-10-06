#!/usr/bin/env node
/**
 * Sweeps every hinged leaf from shut to fully open, as Door.js turns it, and
 * reports what it runs into: furniture (as its catalogue box, and with
 * --mesh as its GLB's triangles) and other doors' leaves standing open.
 * For each contact: the depth, the angle it starts at, the deepest point of
 * the sweep and the depth with the door fully open (where the app parks it).
 *
 *   node door-swing.mjs                      # the seeded scene (default scenes/kosinozici-villas.json)
 *   node door-swing.mjs --mesh               # also the real triangles of every piece a box touches
 *   node door-swing.mjs c-g- a-f-w12         # only doors whose wall or opening id contains these
 *   node door-swing.mjs --scene scenes/<id>.json --gen scripts/spaces/<project>
 *   node door-swing.mjs --live [--gen <copy>/scripts/spaces/<project>]
 *   node door-swing.mjs --step 0.5 --min 0.002 --fail 0.005 --rugs --all --json
 *
 * The leaves are the app's: each door is built with Door.js in its wall's
 * frame and posed through Door.update (see _doors.mjs), so the hinge, the
 * pivot offset of a hung leaf, the leaf's size (width less 1 cm, height less
 * 2 cm, 40 mm thick, a glazed frame 48 mm) and the full opening angle
 * (0.52π, 93.6°, a few degrees past square, so a wide-open leaf leans back
 * over whatever stands against the wall beside its hinge) all come from
 * Door.js. Handles and glass doors' pull bars (up to ~6 cm proud of the leaf
 * near its free edge) are not swept.
 *
 * Depth: how far the leaf would have to move to clear the piece, along its
 * own thickness, back from its free edge, or up/down — the least of those.
 * A leaf grazing a WC's rim gives a few mm; one passing into a piece gives
 * its full thickness ("through"). A piece's box is its catalogue size at
 * its scale, standing on its position and turned by its rotation (the GLBs
 * are centred on their footprint, so the box holds the mesh); a mesh contact
 * is the triangles clipped to the leaf. Flat pieces under SceneBuilder's
 * FLAT_HEIGHT (rugs) are skipped unless --rugs.
 *
 * Exit 1 when a contact (mesh depth with --mesh, else box depth) or a
 * leaf-against-leaf contact is deeper than --fail (default 0.005 m).
 * Building frames and the repo: as doors-dump.mjs (_doors.mjs).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, loadSpace, swingingDoors, frameOf, roomAt, compass, pt, r3, THREE, REPO } from "./_doors.mjs";

const { opts, positional } = parseArgs(process.argv.slice(2), ["scene", "gen", "export", "frame", "step", "min", "fail"]);
const STEP = Number(opts.step ?? 1); // degrees between samples
const MIN = Number(opts.min ?? 0.001); // list contacts deeper than this
const FAIL = Number(opts.fail ?? 0.005); // exit 1 above this
const MESH = !!opts.mesh;
const EPS = 1e-5;

const { spec, source, notes, frames, frameSource } = await loadSpace(opts);
const all = swingingDoors(spec);
const want = (d) => !positional.length || positional.some((s) => d.id.includes(s) || d.wall?.id?.includes(s));
const swept = all.filter(want);

const CATALOG = JSON.parse(readFileSync(join(REPO, "public/models/furniture/catalog.json"), "utf8"));
const ITEM = Object.fromEntries(CATALOG.items.map((i) => [i.id, i]));
const FLAT = Number(readFileSync(join(REPO, "frontend/Experience/World/SceneBuilder.js"), "utf8").match(/FLAT_HEIGHT = ([\d.]+)/)?.[1] ?? 0.035);

// ---------------------------------------------------------------------------
// Boxes and clipping (plain arrays; matrices as THREE.Matrix4 elements)
// ---------------------------------------------------------------------------

const apply = (e, x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
const corners = (lo, hi) => {
    const out = [];
    for (let k = 0; k < 8; k++) out.push([k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]]);
    return out;
};
// A box's six faces as corner indices (bit 0 = x, 1 = y, 2 = z), each a loop.
const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

/** Sutherland–Hodgman: the part of a convex polygon inside the box lo..hi. */
function clip(poly, lo, hi) {
    let p = poly;
    for (let k = 0; k < 3 && p.length; k++) {
        for (const [bound, keep] of [[lo[k], (v) => v[k] >= lo[k]], [hi[k], (v) => v[k] <= hi[k]]]) {
            const out = [];
            for (let i = 0; i < p.length; i++) {
                const a = p[i];
                const b = p[(i + 1) % p.length];
                const ina = keep(a);
                const inb = keep(b);
                if (ina) out.push(a);
                if (ina !== inb) {
                    const t = (bound - a[k]) / (b[k] - a[k]);
                    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
                }
            }
            p = out;
            if (!p.length) break;
        }
    }
    return p;
}
const newExt = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], n: 0 });
const grow = (ext, pts) => {
    for (const v of pts) {
        for (let k = 0; k < 3; k++) {
            if (v[k] < ext.min[k]) ext.min[k] = v[k];
            if (v[k] > ext.max[k]) ext.max[k] = v[k];
        }
        ext.n++;
    }
};
/**
 * How far the leaf must move to clear what lies inside it (ext, in its own
 * frame): along its thickness either way, back from its free edge, or up or
 * down — the least. Capped by the leaf's own size, so "through" reads as its
 * thickness.
 */
function depthOf(ext, L) {
    if (!ext.n) return 0;
    const { lo, hi } = L;
    const tip = L.hingeSide > 0 ? ext.max[0] - lo[0] : hi[0] - ext.min[0];
    const across = Math.min(hi[2] - ext.min[2], ext.max[2] - lo[2]);
    const vertical = Math.min(hi[1] - ext.min[1], ext.max[1] - lo[1]);
    const d = Math.min(tip, across, vertical);
    return d > EPS ? d : 0;
}

/** A box (lo..hi in its own frame, `m` its frame in the world) against a leaf posed at `inv` (world -> leaf). */
function boxDepth(L, inv, leafM, box) {
    const toLeaf = new THREE.Matrix4().multiplyMatrices(inv, box.m).elements;
    const c = corners(box.lo, box.hi).map((v) => apply(toLeaf, ...v));
    // Quick reject on the box's extent in the leaf's frame.
    for (let k = 0; k < 3; k++) {
        if (Math.max(...c.map((v) => v[k])) < L.lo[k] || Math.min(...c.map((v) => v[k])) > L.hi[k]) return { depth: 0 };
    }
    const ext = newExt();
    for (const f of FACES) grow(ext, clip(f.map((i) => c[i]), L.lo, L.hi));
    // The leaf's own corners inside the box (the leaf wholly within it).
    const toBox = new THREE.Matrix4().multiplyMatrices(box.inv, leafM).elements;
    for (const v of corners(L.lo, L.hi)) {
        const b = apply(toBox, ...v);
        if (b.every((x, k) => x >= box.lo[k] - 1e-9 && x <= box.hi[k] + 1e-9)) grow(ext, [v]);
    }
    return { depth: depthOf(ext, L), ext };
}

/** World-space triangles against a leaf posed at `inv`. */
function meshDepth(L, inv, tris) {
    const e = inv.elements;
    const ext = newExt();
    for (let i = 0; i < tris.length; i += 9) {
        const a = apply(e, tris[i], tris[i + 1], tris[i + 2]);
        const b = apply(e, tris[i + 3], tris[i + 4], tris[i + 5]);
        const c = apply(e, tris[i + 6], tris[i + 7], tris[i + 8]);
        let out = false;
        for (let k = 0; k < 3 && !out; k++) out = Math.max(a[k], b[k], c[k]) < L.lo[k] || Math.min(a[k], b[k], c[k]) > L.hi[k];
        if (out) continue;
        grow(ext, clip([a, b, c], L.lo, L.hi));
    }
    return { depth: depthOf(ext, L), ext };
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

const furniture = [];
for (const f of spec.furniture ?? []) {
    const item = ITEM[f.catalog_id];
    if (!item?.size) continue;
    const s = (f.scale ?? 1) * (item.scale ?? 1);
    const [w, h, d] = item.size;
    if (h * s < FLAT && !opts.rugs) continue;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (((f.rotation ?? 0) + (item.yaw ?? 0)) * Math.PI) / 180);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...f.position), q, new THREE.Vector3(s, s, s));
    furniture.push({ f, item, s, m, inv: m.clone().invert(), lo: [-w / 2, 0, -d / 2], hi: [w / 2, h, d / 2], y0: f.position[1], y1: f.position[1] + h * s });
}

// GLB triangles in the model's own frame (node transforms applied), cached per catalogue id.
const GLB = new Map();
function modelTriangles(item) {
    if (GLB.has(item.id)) return GLB.get(item.id);
    const path = join(REPO, "public", item.url);
    if (!existsSync(path)) {
        GLB.set(item.id, null);
        return null;
    }
    const buf = readFileSync(path);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
    const bin = new DataView(buf.buffer, buf.byteOffset + 20 + jsonLen + 8, buf.readUInt32LE(20 + jsonLen));
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
                out[i * comps + c] = a.componentType === 5126 ? bin.getFloat32(o, true) : a.componentType === 5125 ? bin.getUint32(o, true) : a.componentType === 5123 ? bin.getUint16(o, true) : bin.getUint8(o);
            }
        return out;
    };
    const tris = [];
    const visit = (ni, parent) => {
        const n = gltf.nodes[ni];
        const local = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
        const m = new THREE.Matrix4().multiplyMatrices(parent, local);
        const e = m.elements;
        if (n.mesh != null)
            for (const prim of gltf.meshes[n.mesh].primitives) {
                if ((prim.mode ?? 4) !== 4) continue;
                const pos = read(prim.attributes.POSITION);
                const idx = prim.indices != null ? read(prim.indices) : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
                for (const i of idx) tris.push(...apply(e, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
            }
        for (const c of n.children ?? []) visit(c, m);
    };
    for (const ni of gltf.scenes[gltf.scene ?? 0].nodes) visit(ni, new THREE.Matrix4());
    const out = Float64Array.from(tris);
    GLB.set(item.id, out);
    return out;
}
/** A placed piece's triangles in the world, only those within `r` of plan point c and between heights y0..y1. */
function placedTriangles(P, c, r, y0, y1) {
    const model = modelTriangles(P.item);
    if (!model) return null;
    // The model turns by the catalogue's yaw inside the placed group (FurnitureLibrary).
    const yaw = new THREE.Matrix4().makeRotationY(((P.item.yaw ?? 0) * Math.PI) / 180);
    const place = new THREE.Matrix4().compose(new THREE.Vector3(...P.f.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((P.f.rotation ?? 0) * Math.PI) / 180), new THREE.Vector3(P.s, P.s, P.s));
    const e = place.multiply(yaw).elements;
    const out = [];
    for (let i = 0; i < model.length; i += 9) {
        const v = [0, 3, 6].map((o) => apply(e, model[i + o], model[i + o + 1], model[i + o + 2]));
        if (Math.max(...v.map((p) => p[1])) < y0 || Math.min(...v.map((p) => p[1])) > y1) continue;
        if (Math.max(...v.map((p) => p[0])) < c[0] - r || Math.min(...v.map((p) => p[0])) > c[0] + r) continue;
        if (Math.max(...v.map((p) => p[2])) < c[1] - r || Math.min(...v.map((p) => p[2])) > c[1] + r) continue;
        for (const p of v) out.push(...p);
    }
    return Float64Array.from(out);
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/** Plan distance from point p to a box's footprint. */
function planDistance(p, box) {
    const b = apply(box.inv.elements, p[0], 0, p[1]);
    const s = box.m.elements[0] ** 2 + box.m.elements[2] ** 2; // scale squared
    const dx = Math.max(box.lo[0] - b[0], 0, b[0] - box.hi[0]);
    const dz = Math.max(box.lo[2] - b[2], 0, b[2] - box.hi[2]);
    return Math.hypot(dx, dz) * Math.sqrt(s);
}

// Per leaf: its height range, hinge, reach, and its pose at full open (for the leaf-against-leaf test).
const leafInfo = new Map();
for (const d of all) {
    d.pose(1);
    for (const L of d.leaves) {
        const m = L.leaf.matrixWorld;
        const y0 = apply(m.elements, 0, L.lo[1], 0)[1];
        const y1 = apply(m.elements, 0, L.hi[1], 0)[1];
        const pivot = new THREE.Vector3();
        L.hinge.getWorldPosition(pivot);
        const reach = Math.max(...corners(L.lo, L.hi).map((v) => {
            const w = apply(m.elements, ...v);
            return Math.hypot(w[0] - pivot.x, w[2] - pivot.z);
        })) + 0.05;
        leafInfo.set(L, { y0, y1, hinge: [pivot.x, pivot.z], reach, open: { m: m.clone(), inv: m.clone().invert(), lo: L.lo, hi: L.hi } });
    }
    d.pose(0);
}

const fullDeg = all.length ? (all[0].fullAngle * 180) / Math.PI : 0;
const deg = (d, a) => (a * d.fullAngle * 180) / Math.PI;

/**
 * Sweep door d from shut to fully open. Each test is { leaf, depth(L, inv,
 * leafM) -> { depth, ext } }; returns per test { first, max, maxAt, full, ext }
 * with angles as fractions of the full opening (first refined by bisection
 * to 1/64 of a step; null when nothing touches), `full` the depth fully open.
 */
function sweep(d, tests) {
    const n = Math.max(1, Math.ceil((d.fullAngle * 180) / Math.PI / STEP));
    const results = tests.map(() => ({ first: null, max: 0, maxAt: null, full: 0, ext: null, lastClear: 0 }));
    for (let k = 0; k <= n; k++) {
        const a = k / n;
        d.pose(a);
        tests.forEach((t, i) => {
            const L = t.leaf;
            const m = L.leaf.matrixWorld;
            const inv = m.clone().invert();
            const { depth, ext } = t.depth(L, inv, m);
            const r = results[i];
            if (depth > 0) {
                if (r.first == null) r.first = { lo: r.lastClear, hi: a };
                if (depth > r.max) Object.assign(r, { max: depth, maxAt: a, ext });
            } else if (r.first == null) r.lastClear = a;
            if (k === n) r.full = depth;
        });
    }
    // The first contact, between the last clear sample and the first touching one.
    tests.forEach((t, i) => {
        const r = results[i];
        if (r.first == null) return;
        let { lo, hi } = r.first;
        if (hi === 0) {
            r.first = 0;
            return;
        }
        for (let it = 0; it < 6; it++) {
            const mid = (lo + hi) / 2;
            d.pose(mid);
            const m = t.leaf.leaf.matrixWorld;
            if (t.depth(t.leaf, m.clone().invert(), m).depth > 0) hi = mid;
            else lo = mid;
        }
        r.first = hi;
    });
    d.pose(0);
    return results;
}

const contacts = [];
const leafLeaf = [];
let boxOnly = 0;
for (const d of swept) {
    for (const L of d.leaves) {
        const I = leafInfo.get(L);
        // Furniture within reach of this leaf and overlapping its height.
        const near = furniture.filter((P) => P.y1 > I.y0 + EPS && P.y0 < I.y1 - EPS && planDistance(I.hinge, P) < I.reach);
        const boxTests = near.map((P) => ({ leaf: L, P, depth: (L2, inv, m) => boxDepth(L2, inv, m, P) }));
        const boxRes = sweep(d, boxTests);
        boxRes.forEach((br, i) => {
            if (br.max <= 0) return;
            const P = near[i];
            const row = { door: d, leaf: L, P, box: br, mesh: null };
            if (MESH) {
                const tris = placedTriangles(P, I.hinge, I.reach, I.y0, I.y1);
                if (tris?.length) {
                    const [mr] = sweep(d, [{ leaf: L, depth: (L2, inv) => meshDepth(L2, inv, tris) }]);
                    row.mesh = mr;
                } else row.mesh = { max: 0, first: null, full: 0 };
                if (row.mesh.max <= 0) boxOnly++;
            }
            contacts.push(row);
        });

        // Other doors' leaves standing fully open.
        const others = [];
        for (const e of all) {
            if (e === d) continue;
            for (const M of e.leaves) {
                const J = leafInfo.get(M);
                if (J.y1 <= I.y0 + EPS || J.y0 >= I.y1 - EPS) continue;
                if (Math.hypot(J.hinge[0] - I.hinge[0], J.hinge[1] - I.hinge[1]) > I.reach + J.reach) continue;
                others.push({ e, M, J });
            }
        }
        const llRes = sweep(d, others.map(({ J }) => ({ leaf: L, depth: (L2, inv, m) => boxDepth(L2, inv, m, J.open) })));
        llRes.forEach((r, i) => {
            if (r.max > 0) leafLeaf.push({ door: d, leaf: L, other: others[i].e, otherLeaf: others[i].M, res: r });
        });
    }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const fine = (c) => (MESH ? (c.mesh?.max ?? 0) : c.box.max);
const mm = (m) => `${(m * 1000).toFixed(1)} mm`;
const through = (r, L) => r.max >= L.hi[2] - L.lo[2] - 0.0005;
const leafWord = (d, L) => (d.leaves.length > 1 ? ` leaf ${d.leaves.indexOf(L)}` : "");
const describe = (d, L, r) => {
    if (!r || r.max <= 0) return "clear";
    const along = r.ext ? (() => {
        // Where along the leaf, from its hinge edge, the deepest contact lies.
        const h = L.hingeSide > 0 ? L.hi[0] : L.lo[0];
        const a = Math.abs(r.ext.min[0] - h);
        const b = Math.abs(r.ext.max[0] - h);
        return `, ${Math.min(a, b).toFixed(2)}–${Math.max(a, b).toFixed(2)} m from the hinge`;
    })() : "";
    return `${through(r, L) ? "through" : mm(r.max)} from ${deg(d, r.first).toFixed(1)}° (deepest at ${deg(d, r.maxAt).toFixed(1)}°${along}; fully open ${r.full > 0 ? mm(r.full) : "clear"})`;
};

const listed = contacts.filter((c) => opts.all || fine(c) > MIN).sort((a, b) => fine(b) - fine(a));
const llListed = leafLeaf.filter((c) => opts.all || c.res.max > MIN).sort((a, b) => b.res.max - a.res.max);
const failing = contacts.filter((c) => fine(c) > FAIL).length + leafLeaf.filter((c) => c.res.max > FAIL).length;
const leafCount = swept.reduce((n, d) => n + d.leaves.length, 0);

if (opts.json) {
    const r4 = (n) => Math.round(n * 1e4) / 1e4;
    const fr = (d, r) => (r && r.max > 0 ? { depth: r4(r.max), first: r3(deg(d, r.first)), deepestAt: r3(deg(d, r.maxAt)), open: r4(r.full) } : null);
    console.log(JSON.stringify({
        source,
        fullAngleDeg: r3(fullDeg),
        leaves: leafCount,
        furniture: listed.map((c) => ({ door: c.door.id, leaf: c.door.leaves.indexOf(c.leaf), piece: c.P.f.id, catalog: c.P.f.catalog_id, position: c.P.f.position, box: fr(c.door, c.box), mesh: MESH ? fr(c.door, c.mesh) : undefined })),
        leafLeaf: llListed.map((c) => ({ door: c.door.id, leaf: c.door.leaves.indexOf(c.leaf), against: c.other.id, againstLeaf: c.other.leaves.indexOf(c.otherLeaf), ...fr(c.door, c.res) })),
        summary: { contacts: contacts.length, overMin: listed.length, overFail: failing, boxOnly: MESH ? boxOnly : undefined, leafLeaf: leafLeaf.length },
    }, null, 2));
    process.exit(failing ? 1 : 0);
}

console.log(`door-swing: ${source}${notes.length ? ` (validate notes: ${notes.length})` : ""}`);
console.log(`frames: ${frameSource}${frames.size ? ` — ${[...frames].map(([t, f]) => `${t} [${f.ox}, ${f.oz}, ${f.oy}]`).join(", ")}` : ""}`);
console.log(`${leafCount} leaves in ${swept.length} swinging door(s)${positional.length ? ` matching ${positional.join(", ")}` : ""}, swept 0–${fullDeg.toFixed(1)}° (Door.js) every ${STEP}°; ${furniture.length} pieces as catalogue boxes${MESH ? " and, where a box is touched, GLB triangles" : ""}${opts.rugs ? "" : `, pieces under ${FLAT} m tall skipped`}; listing contacts over ${mm(MIN)}${opts.all ? " (--all: every contact)" : ""}`);

let last = null;
for (const c of [...listed].sort((a, b) => (a.door.id < b.door.id ? -1 : a.door.id > b.door.id ? 1 : fine(b) - fine(a)))) {
    if (c.door !== last) {
        const I = leafInfo.get(c.leaf);
        const frame = frameOf(frames, c.door.wall?.id ?? c.door.id);
        c.door.pose(Math.PI / 2 / c.door.fullAngle);
        const tip = c.leaf.leaf.localToWorld(new THREE.Vector3(c.leaf.hingeSide > 0 ? c.leaf.lo[0] : c.leaf.hi[0], 0, 0));
        c.door.pose(0);
        const dir = [tip.x - I.hinge[0], tip.z - I.hinge[1]];
        const room = roomAt(spec, [I.hinge[0] + dir[0] / 2, I.hinge[1] + dir[1] / 2], c.door.base);
        console.log(`\n${c.door.id} ${c.door.door.swing}, hinge ${pt(I.hinge, frame)}, opens ${compass(dir)} into ${room ? room.id : "no room"}`);
        last = c.door;
    }
    const frame = frameOf(frames, c.P.f.id);
    const where = pt([c.P.f.position[0], c.P.f.position[2]], frame);
    console.log(`   ${c.P.f.id} ${c.P.f.catalog_id} at ${where}${leafWord(c.door, c.leaf)}`);
    console.log(`      box:  ${describe(c.door, c.leaf, c.box)}`);
    if (MESH) console.log(`      mesh: ${describe(c.door, c.leaf, c.mesh)}`);
}

console.log(`\nLeaf against leaf (the other door fully open):${llListed.length ? "" : " none"}`);
for (const c of llListed) console.log(`   ${c.door.id}${leafWord(c.door, c.leaf)} swinging into ${c.other.id}${leafWord(c.other, c.otherLeaf)}: ${describe(c.door, c.leaf, c.res)}`);

const over = (k) => contacts.filter((c) => (k === "mesh" ? (c.mesh?.max ?? 0) : c.box.max) > FAIL).length;
console.log(`\nSUMMARY: ${leafCount} leaves swept; furniture contacts: ${contacts.length} box (${over("box")} over ${mm(FAIL)})${MESH ? `, ${contacts.length - boxOnly} mesh (${over("mesh")} over ${mm(FAIL)}; ${boxOnly} box-only)` : ""}; leaf against leaf: ${leafLeaf.length} (${leafLeaf.filter((c) => c.res.max > FAIL).length} over ${mm(FAIL)})`);
process.exit(failing ? 1 : 0);

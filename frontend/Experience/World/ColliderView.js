import * as THREE from "three";

import { isTransient, uniqueTriangles } from "./Collision.js";

/**
 * The colliders drawn as wireframes over the view (Experience/Colliders.js
 * shows and hides it): every triangle the visitor's capsule is pushed out
 * of, by what it is — the building and the ground, the invisible blockers
 * and the edge of the world, the flights' ramps and guards, each piece of
 * furniture as its own mesh or as its box, the people, the trees' trunks —
 * and what collides without being in any tree: the doors' leaves, red while
 * they block and faint once open far enough to walk through; the cars'
 * capsules, bright for the one being driven and faint for those parked
 * (which nothing walks into); and the visitor's own capsule (not in first
 * person, where it is the camera, nor at the wheel).
 *
 * Lines on a faint tint of each kind's colour, the lines drawn a pixel or so
 * wide at any distance. A triangle with a right angle is one half of a
 * rectangle — a wall's face, a box's side, a cell of the terrain — and its
 * long edge is left out, so those read as the rectangles they are. Hidden
 * lines are taken out against the colliders' own depth, drawn first: the
 * frame's own cannot be used, since under the post-processing what is on
 * the screen has none (PostProcessing.js), and colliders lie on the very
 * surfaces they stand for, where they would flicker in and out of them.
 * Seen through everything (x-ray), nothing is hidden and all of it is
 * fainter.
 *
 * It draws in a scene of its own, which is never put in the app's: so it
 * is in no merge, no stand-in, no bake, no publish, no ray's index, no
 * room drawn live and no bird's-eye view's list of loose meshes — and it
 * reads the colliders, never changes them.
 *
 * What it draws, where:
 *   - **The editor**: round where the visitor stands (in edit mode, the
 *     point the view turns round), REGION metres each way, from a metre
 *     under that floor to BAND_ABOVE over it — Ladonia's furniture alone is
 *     961 thousand triangles. Drawn again when that point has moved
 *     MOVE_ON metres, the floor has changed, or a tree has (Collision's
 *     `revision`: a keeper mends its tree in place). From each keeper's own
 *     list of what it holds, a source at a time — each wall, flight and
 *     piece whole, and nothing twice — but while a tree is being built a
 *     slice a frame and the visitor walks against the old one as it was
 *     (`job.stale`), from that tree: what is drawn is what is walked.
 *     In edit mode the furniture's tree is brought up to date a moment
 *     after each edit (EDITED_AFTER), not during a move, so a piece moved
 *     shows where it now collides; and whatever is selected has the
 *     collider it would have drawn as it is moved — its box or its mesh,
 *     as SceneBuilder.collisionOf would have it — over the one it has.
 *     A floor or a room in focus (Page Up, Page Down, `/`) is the floor it
 *     is drawn round, cut a little over it as the editor takes the focus's
 *     ceilings away, and a room's walls cut it as they cut the view. Drawn
 *     straight to the screen, as the editor draws, the colliders are hidden
 *     behind the scene too (`draw`).
 *   - **A public view** (with `?debug`): the whole of its trees, made once
 *     (Ladonia's runtime file: 92,799 triangles) — again only as the
 *     people's and the garden's are made again. Its file says what each
 *     triangle is part of, not whether a piece collides as its box: a
 *     piece's triangles are taken for boxes where they are boxes, twelve
 *     triangles to each eight corners. From above (BirdView) it is cut a
 *     little over the floor on show, as the house is, or the roofs and the
 *     floors above would hide it.
 */

/** Half the width of the region drawn in the editor, in metres. */
const REGION = 15;
/** How far the region's middle may move before it is drawn again, in metres. */
const MOVE_ON = 5;
/** The region's height: from this far under the floor stood on to BAND_ABOVE over it. */
const BAND_BELOW = 1;
const BAND_ABOVE = 3;
/** How long after an edit in edit mode the furniture's tree is brought up to date, in ms. */
const EDITED_AFTER = 300;
/** Doors further than this from the camera are not drawn, in metres. */
const DOORS_WITHIN = 40;
/** From above, how far over the floor on show it is cut, at most (BirdView): a storey's walls without its ceilings. */
const CUT_ABOVE = 2;
/** A door's leaf no longer blocks once open this far (Door.js's BLOCKING_THRESHOLD). */
const DOOR_BLOCKS_BELOW = 0.3;
/** A triangle whose corner is this close to square (the cosine of its angle) is half a rectangle: its long edge is left out. */
const SQUARE = 0.02;
/** Twelve triangles and eight corners a box: a label of no more than this many triangles is looked at for boxes (a public view's). */
const BOXES_MOST = 100;

/**
 * What is drawn, in this order: its id, its colour, how strongly its lines
 * and its tint are drawn, and what `?stats` calls it.
 */
export const KINDS = [
    { id: "static", colour: 0x4aa3ff, line: 0.85, fill: 0.07, label: "building" },
    { id: "blocker", colour: 0xff3df0, line: 0.95, fill: 0.14, label: "blockers" },
    { id: "stairs", colour: 0xffcc00, line: 0.95, fill: 0.12, label: "stairs" },
    { id: "mesh", colour: 0x2fdc72, line: 0.8, fill: 0.07, label: "furniture" },
    { id: "box", colour: 0xff8a1a, line: 0.95, fill: 0.1, label: "boxed" },
    { id: "people", colour: 0xa98bff, line: 0.95, fill: 0.12, label: "people" },
    { id: "trunk", colour: 0xb4f03a, line: 0.95, fill: 0.12, label: "trunks" },
    { id: "door", colour: 0xff2a2a, line: 1, fill: 0.2, label: "doors" },
    { id: "door-open", colour: 0xff2a2a, line: 0.45, fill: 0.04, label: "doors open" },
    { id: "car", colour: 0x1ff0ff, line: 1, fill: 0.16, label: "car driven" },
    { id: "car-parked", colour: 0x1ff0ff, line: 0.6, fill: 0.06, label: "cars parked" },
    { id: "player", colour: 0xffffff, line: 1, fill: 0.16, label: "you" },
    { id: "chosen-mesh", colour: 0x2fdc72, line: 1, fill: 0.24, label: "selected" },
    { id: "chosen-box", colour: 0xff8a1a, line: 1, fill: 0.24, label: "selected" },
    { id: "chosen-stairs", colour: 0xffcc00, line: 1, fill: 0.24, label: "selected" },
    { id: "other", colour: 0xfff36a, line: 1, fill: 0.14, label: "other" },
];
const KIND = Object.fromEntries(KINDS.map((kind, index) => [kind.id, index]));

/** The labels a public view's file gives what blocks unseen (Builders/StructureBuilder.js's blockers — a window that opens, its pane in its frame's outer half — the world's edge). */
const BLOCKER_LABELS = new Set(["Stair rail", "Window", "Edge of the world"]);
/** ...and a flight's guards and its cupboard's walls, in the furniture's tree as the flight is. */
const STAIR_LABELS = new Set(["Balustrade", "Cupboard"]);
/** The names of what blocks unseen inside a wall or a flight, in the editor (StructureBuilder.blocker, addCloset; buildWorldEdge). */
const BLOCKER_NAMES = new Set(["blocker", "closet", "world-edge"]);
/**
 * What is walked up and down as a flight's ramp is, though it is the ground's: a pool's steps (Builders/
 * LandscapeBuilder.js's addPoolSteps, an unseen ramp under its treads) — by its name in the editor, by its label in
 * a public view's file.
 */
const STEP_NAMES = new Set(["pool-steps-ramp"]);
const STEP_LABELS = new Set(["Pool steps"]);

const VERTEX = /* glsl */ `
    attribute float kind;
    uniform vec4 uKinds[${KINDS.length}];
    uniform float uFills[${KINDS.length}];
    varying vec3 vBary;
    flat varying vec4 vLine;
    flat varying float vFill;
    #include <clipping_planes_pars_vertex>
    void main() {
        int code = int(kind + 0.5);
        int corner = gl_VertexID % 3;
        vBary = vec3(corner == 0 ? 1.0 : 0.0, corner == 1 ? 1.0 : 0.0, corner == 2 ? 1.0 : 0.0);
        // The edge left out (half a rectangle's long one): its far corner's share held at one across the triangle.
        int hide = code >> 5;
        if (hide == 1) vBary.x = 1.0;
        if (hide == 2) vBary.y = 1.0;
        if (hide == 3) vBary.z = 1.0;
        int index = code & 31;
        vLine = uKinds[index];
        vFill = uFills[index];
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
    }
`;

const FRAGMENT = /* glsl */ `
    uniform float uWidth;
    uniform float uOpacity;
    uniform float uFillScale;
    varying vec3 vBary;
    flat varying vec4 vLine;
    flat varying float vFill;
    #include <clipping_planes_pars_fragment>
    void main() {
        #include <clipping_planes_fragment>
        vec3 d = fwidth(vBary);
        vec3 a = smoothstep(vec3(0.0), d * uWidth, vBary);
        float edge = 1.0 - min(min(a.x, a.y), a.z);
        // A triangle a few pixels across is all edge, and a dense mesh far off a shimmer of lines: drawn instead as a
        // surface of half the lines' strength, which says as plainly where it is.
        float tiny = clamp((max(max(d.x, d.y), d.z) - 0.2) * 2.5, 0.0, 1.0);
        float alpha = mix(mix(vFill * uFillScale, vLine.a, edge), vLine.a * 0.45, tiny) * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(vLine.rgb, alpha);
    }
`;

const DEPTH_FRAGMENT = /* glsl */ `
    #include <clipping_planes_pars_fragment>
    void main() {
        #include <clipping_planes_fragment>
        gl_FragColor = vec4(0.0);
    }
`;

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _half = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();
const _centre = new THREE.Vector3();

/** A box's twelve triangles, by its eight corners (x, y, z each low or high: x * 4 + y * 2 + z), two to each side. */
const BOX_FACES = [
    [0, 1, 3], [0, 3, 2], [4, 6, 7], [4, 7, 5], // −x, +x
    [0, 4, 5], [0, 5, 1], [2, 3, 7], [2, 7, 6], // −y, +y
    [0, 2, 6], [0, 6, 4], [1, 5, 7], [1, 7, 3], // −z, +z
];
/** A capsule's rings round its axis, and from each end to its middle. */
const CAPSULE_SIDES = 12;
const CAPSULE_RINGS = 4;
const CAPSULE_COS = Array.from({ length: CAPSULE_SIDES }, (_, i) => Math.cos((i / CAPSULE_SIDES) * Math.PI * 2));
const CAPSULE_SIN = Array.from({ length: CAPSULE_SIDES }, (_, i) => Math.sin((i / CAPSULE_SIDES) * Math.PI * 2));

/**
 * Triangles to draw, each with its kind: as many as it has room for,
 * which grows as it needs to (by a quarter more, so a region a little
 * larger than the last does not make it again).
 */
export class TriangleSink {
    constructor() {
        this.positions = new Float32Array(0);
        this.kinds = new Uint8Array(0);
        this.capacity = 0;
        this.count = 0;
        this.counts = new Array(KINDS.length).fill(0);
        /** Made larger since it was last drawn: the geometry is to be made again. */
        this.grown = true;
    }

    /** Emptied, with room for `more` triangles. */
    begin(more = 0) {
        this.count = 0;
        this.counts.fill(0);
        this.reserve(more);
    }

    reserve(more) {
        const need = this.count + more;
        if (need <= this.capacity) return;
        const capacity = Math.max(64, Math.ceil(need * 1.25));
        const positions = new Float32Array(capacity * 9);
        const kinds = new Uint8Array(capacity * 3);
        positions.set(this.positions.subarray(0, this.count * 9));
        kinds.set(this.kinds.subarray(0, this.count * 3));
        this.positions = positions;
        this.kinds = kinds;
        this.capacity = capacity;
        this.grown = true;
    }

    /** A collision tree's triangle. */
    triangle(t, kind) {
        const { a, b, c } = t;
        this.put(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, kind, -1);
    }

    /**
     * A triangle by its corners, of `kind`. `hide` is which corner's far
     * edge is left out (0, 1 or 2), none (3) — or, -1, the long edge if it
     * is half a rectangle.
     */
    put(ax, ay, az, bx, by, bz, cx, cy, cz, kind, hide) {
        if (this.count >= this.capacity) this.reserve(1);
        if (hide < 0) hide = squareCorner(ax, ay, az, bx, by, bz, cx, cy, cz);
        const p = this.positions;
        let o = this.count * 9;
        p[o++] = ax; p[o++] = ay; p[o++] = az;
        p[o++] = bx; p[o++] = by; p[o++] = bz;
        p[o++] = cx; p[o++] = cy; p[o] = cz;
        const code = kind | (hide < 3 ? (hide + 1) << 5 : 0);
        const k = this.count * 3;
        this.kinds[k] = code;
        this.kinds[k + 1] = code;
        this.kinds[k + 2] = code;
        this.count++;
        this.counts[kind]++;
    }

    /** A box: its middle, how it is turned, and half its size each way. */
    box(centre, quaternion, half, kind) {
        for (let i = 0; i < 8; i++) {
            _corners[i]
                .set(i & 4 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 1 ? half.z : -half.z)
                .applyQuaternion(quaternion)
                .add(centre);
        }
        this.reserve(12);
        for (const [i, j, k] of BOX_FACES) {
            const a = _corners[i];
            const b = _corners[j];
            const c = _corners[k];
            // (Each side's two are square: their diagonal left out, as any half rectangle's.)
            this.put(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, kind, -1);
        }
    }

    /** A capsule — what three's Capsule is: the segment from `start` to `end`, and a radius round it. */
    capsule(start, end, radius, kind) {
        _u.subVectors(end, start);
        const length = _u.length();
        if (length < 1e-6) _u.copy(_up);
        else _u.divideScalar(length);
        _v.set(1, 0, 0);
        if (Math.abs(_u.dot(_v)) > 0.9) _v.set(0, 0, 1);
        _w.crossVectors(_u, _v).normalize();
        _v.crossVectors(_w, _u);
        // Rings from the far end of the start's cap to the far end of the end's: each its middle along the axis, and its radius.
        const rings = [];
        for (let i = 0; i <= CAPSULE_RINGS; i++) {
            const angle = (-1 + i / CAPSULE_RINGS) * (Math.PI / 2);
            rings.push([start, Math.sin(angle) * radius, Math.cos(angle) * radius]);
        }
        for (let i = 0; i <= CAPSULE_RINGS; i++) {
            const angle = (i / CAPSULE_RINGS) * (Math.PI / 2);
            rings.push([end, Math.sin(angle) * radius, Math.cos(angle) * radius]);
        }
        this.reserve((rings.length - 1) * CAPSULE_SIDES * 2);
        const point = (ring, side, out) => {
            const [base, along, round] = ring;
            return out
                .copy(base)
                .addScaledVector(_u, along)
                .addScaledVector(_v, CAPSULE_COS[side] * round)
                .addScaledVector(_w, CAPSULE_SIN[side] * round);
        };
        const a = _corners[0];
        const b = _corners[1];
        const c = _corners[2];
        const d = _corners[3];
        for (let r = 0; r < rings.length - 1; r++) {
            for (let s = 0; s < CAPSULE_SIDES; s++) {
                const t = (s + 1) % CAPSULE_SIDES;
                point(rings[r], s, a);
                point(rings[r], t, b);
                point(rings[r + 1], t, c);
                point(rings[r + 1], s, d);
                // A quad of two, its diagonal (a to c) left out — but at a cap's tip, where two of its corners are one.
                if (r > 0) this.put(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, kind, 1);
                if (r < rings.length - 2) this.put(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, kind, 2);
            }
        }
    }
}

/**
 * Which corner of a triangle is square, if one is: the one whose far edge
 * is the long one, left out (`put`'s `hide`) — 3 for none.
 */
function squareCorner(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const ab = abx * abx + aby * aby + abz * abz;
    const ac = acx * acx + acy * acy + acz * acz;
    const bc = bcx * bcx + bcy * bcy + bcz * bcz;
    // The corner facing the longest edge, and the cosine of its angle.
    if (bc >= ab && bc >= ac) {
        const dot = abx * acx + aby * acy + abz * acz;
        return dot * dot < SQUARE * SQUARE * ab * ac ? 0 : 3;
    }
    if (ac >= ab) {
        const dot = -(abx * bcx + aby * bcy + abz * bcz);
        return dot * dot < SQUARE * SQUARE * ab * bc ? 1 : 3;
    }
    const dot = acx * bcx + acy * bcy + acz * bcz;
    return dot * dot < SQUARE * SQUARE * ac * bc ? 2 : 3;
}

// ---------------------------------------------------------------------
// What each triangle is
// ---------------------------------------------------------------------

/**
 * How a keeper's entry is drawn: one kind, or — a wall or a room with an
 * invisible blocker in it (a stairwell's rail) — a kind for each run of
 * its triangles, mesh by mesh as the keeper made them (`runs`: where each
 * ends, and its kind). Remembered for as long as the entry lives: an entry
 * is made again whenever its source changes.
 */
const ENTRY_KINDS = new WeakMap();

export function entryKind(entry, tree, builder) {
    let known = ENTRY_KINDS.get(entry);
    if (known) return known;
    if (tree === "dynamic") {
        if (entry.stamp) known = { kind: KIND.box };
        else if (isFlight(entry.key, builder)) known = { kind: KIND.stairs };
        else known = { kind: KIND.mesh };
    } else if (entry.key && (entry.key === builder?.worldEdge || entry.key === builder?.staticColliders)) {
        known = { kind: KIND.blocker };
    } else {
        // Its meshes in the order the keeper made their triangles (TreeKeeper.make): each mesh's index or vertex count, a third of it triangles.
        const meshes = entry.meshes ?? [];
        const runs = [];
        let end = 0;
        for (let i = 0; i < meshes.length; i++) {
            end += (entry.state ? entry.state[i * 20 + 18] : 0) / 3;
            const kind = BLOCKER_NAMES.has(meshes[i].name) ? KIND.blocker : STEP_NAMES.has(meshes[i].name) ? KIND.stairs : KIND.static;
            if (runs.length && runs[runs.length - 1][1] === kind) runs[runs.length - 1][0] = end;
            else runs.push([end, kind]);
        }
        known = runs.length > 1 ? { kind: KIND.static, runs } : { kind: runs[0]?.[1] ?? KIND.static };
    }
    ENTRY_KINDS.set(entry, known);
    return known;
}

/** A flight's own collider group (SceneBuilder's `colliders`: its ramp, its guards, its cupboard). */
function isFlight(key, builder) {
    return Boolean(key && ((builder && key.parent === builder.colliders) || key.name?.startsWith("stairs-collider:")));
}

/** The kind of a triangle of an entry, by where it lies among the entry's own. */
function kindAt(known, at) {
    const runs = known.runs;
    if (!runs) return known.kind;
    for (let i = 0; i < runs.length; i++) if (at < runs[i][0]) return runs[i][1];
    return runs[runs.length - 1][1];
}

/**
 * A public view's triangle, which knows only what it is part of (its
 * runtime file's label): the blockers, a flight's own and a pool's steps by
 * their labels;
 * a piece of furniture as its box where its triangles are boxes (`boxed`).
 */
export function labelKind(label, tree, boxed) {
    if (tree === "static") return BLOCKER_LABELS.has(label) ? KIND.blocker : STEP_LABELS.has(label) ? KIND.stairs : KIND.static;
    if (label && (STAIR_LABELS.has(label) || label.startsWith("Stair"))) return KIND.stairs;
    return label !== undefined && boxed?.has(label) ? KIND.box : KIND.mesh;
}

/**
 * Of a public view's furniture, the labels whose triangles are all boxes —
 * twelve to each eight corners, none shared — which a piece that collides
 * as its box is (SceneBuilder.collisionOf). The file is welded and
 * compressed (server/publish/compress.js), so neither the triangles' order
 * nor a mesh of their own says it.
 */
export function boxedLabels(triangles) {
    const byLabel = new Map();
    for (const triangle of triangles) {
        if (triangle.source || triangle.label === undefined) continue;
        let list = byLabel.get(triangle.label);
        if (!list) byLabel.set(triangle.label, (list = []));
        list.push(triangle);
    }
    const boxed = new Set();
    for (const [label, list] of byLabel) {
        if (list.length % 12 !== 0 || list.length > BOXES_MOST * 12) continue;
        const corners = new Set();
        for (const { a, b, c } of list) for (const p of [a, b, c]) corners.add(`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`);
        if (corners.size === (list.length / 12) * 8) boxed.add(label);
    }
    return boxed;
}

// ---------------------------------------------------------------------
// Gathering
// ---------------------------------------------------------------------

/** Whether a triangle's box meets a region's (`{ x0, x1, y0, y1, z0, z1 }`). */
function within(t, r) {
    const a = t.a, b = t.b, c = t.c;
    if (a.x < r.x0 && b.x < r.x0 && c.x < r.x0) return false;
    if (a.x > r.x1 && b.x > r.x1 && c.x > r.x1) return false;
    if (a.z < r.z0 && b.z < r.z0 && c.z < r.z0) return false;
    if (a.z > r.z1 && b.z > r.z1 && c.z > r.z1) return false;
    if (a.y < r.y0 && b.y < r.y0 && c.y < r.y0) return false;
    return !(a.y > r.y1 && b.y > r.y1 && c.y > r.y1);
}

/**
 * A keeper's triangles in a region (or all of them, without one), into
 * `sink`: source by source, as the keeper keeps them — each triangle once,
 * since each is one source's — and each source whose box misses the
 * region passed over whole.
 */
export function gatherEntries(keeper, tree, region, sink, builder = null) {
    let upper = 0;
    const met = [];
    for (const entry of keeper.entries.values()) {
        if (!entry.triangles.length) continue;
        if (region) {
            const { min, max } = entry;
            if (max[0] < region.x0 || min[0] > region.x1 || max[1] < region.y0 || min[1] > region.y1 || max[2] < region.z0 || min[2] > region.z1) continue;
        }
        met.push(entry);
        upper += entry.triangles.length;
    }
    sink.reserve(upper);
    for (const entry of met) {
        const known = entryKind(entry, tree, builder);
        const triangles = entry.triangles;
        for (let i = 0; i < triangles.length; i++) {
            const triangle = triangles[i];
            if (region && !within(triangle, region)) continue;
            sink.triangle(triangle, known.runs ? kindAt(known, i) : known.kind);
        }
    }
}

/**
 * A tree's triangles in a region (or all of them), each once, into `sink`:
 * by its keeper's entries where a keeper made it, by their labels where
 * the tree is a published view's (`boxed`: boxedLabels), or all `kind`.
 */
export function gatherTree(octree, tree, region, sink, { builder = null, kind = null } = {}) {
    const box = region ? _box.set(_centre.set(region.x0, region.y0, region.z0), _corner.set(region.x1, region.y1, region.z1)) : null;
    const triangles = uniqueTriangles(octree, box);
    sink.reserve(triangles.length);
    const boxed = kind === null && tree === "dynamic" ? boxedLabels(triangles) : null;
    const labels = new Map();
    for (let i = 0; i < triangles.length; i++) {
        const triangle = triangles[i];
        if (region && !within(triangle, region)) continue;
        let k = kind;
        if (k === null) {
            const entry = triangle.source;
            if (entry) {
                k = kindAt(entryKind(entry, tree, builder), triangle.at);
            } else {
                k = labels.get(triangle.label);
                if (k === undefined) labels.set(triangle.label, (k = labelKind(triangle.label, tree, boxed)));
            }
        }
        sink.triangle(triangle, k);
    }
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------

/** One set of triangles drawn: its depth first, then its lines and tint. */
class Layer {
    constructor(scene, materials, usage = THREE.StaticDrawUsage) {
        this.sink = new TriangleSink();
        this.usage = usage;
        this.geometry = null;
        this.empty = new THREE.BufferGeometry();
        this.depth = this.mesh(materials.depth, 0);
        this.colour = this.mesh(materials.colour, 1);
        this.depth.visible = this.colour.visible = false;
        scene.add(this.depth, this.colour);
    }

    mesh(material, order) {
        const mesh = new THREE.Mesh(this.empty, material);
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = order;
        // (Whatever layers the camera drawn with looks at.)
        mesh.layers.enableAll();
        return mesh;
    }

    /** What the sink now holds, sent to the GPU: the part of it used. */
    commit() {
        const sink = this.sink;
        if (sink.grown || !this.geometry) {
            this.geometry?.dispose();
            const geometry = (this.geometry = new THREE.BufferGeometry());
            geometry.setAttribute("position", new THREE.BufferAttribute(sink.positions, 3).setUsage(this.usage));
            geometry.setAttribute("kind", new THREE.BufferAttribute(sink.kinds, 1).setUsage(this.usage));
            this.depth.geometry = geometry;
            this.colour.geometry = geometry;
            sink.grown = false;
        } else {
            for (const name of ["position", "kind"]) {
                const attribute = this.geometry.attributes[name];
                attribute.clearUpdateRanges();
                attribute.addUpdateRange(0, sink.count * attribute.itemSize * 3);
                attribute.needsUpdate = true;
            }
        }
        this.geometry.setDrawRange(0, sink.count * 3);
        this.depth.visible = this.colour.visible = sink.count > 0;
    }

    /** Its triangles let go of, on the GPU and off. */
    release() {
        this.geometry?.dispose();
        this.geometry = null;
        this.depth.geometry = this.colour.geometry = this.empty;
        this.sink = new TriangleSink();
        this.depth.visible = this.colour.visible = false;
    }

    dispose() {
        this.release();
        this.empty.dispose();
    }
}

export default class ColliderView {
    /**
     * @param {Experience} experience
     * @param {Colliders} colliders  what shows and hides it (Experience/Colliders.js): its other providers
     */
    constructor(experience, colliders) {
        this.experience = experience;
        this.colliders = colliders;
        this.world = experience.world;
        this.scene = new THREE.Scene();
        this.scene.matrixWorldAutoUpdate = false;

        const uniforms = {
            // (As the colours are written: drawn straight onto the finished frame, nothing turns them from the working space.)
            uKinds: { value: KINDS.map(({ colour, line }) => new THREE.Vector4(((colour >> 16) & 255) / 255, ((colour >> 8) & 255) / 255, (colour & 255) / 255, line)) },
            uFills: { value: KINDS.map(({ fill }) => fill) },
            uWidth: { value: 1.2 },
            uOpacity: { value: 1 },
            uFillScale: { value: 1 },
        };
        this.uniforms = uniforms;
        const colour = new THREE.ShaderMaterial({
            name: "colliders",
            uniforms,
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            depthFunc: THREE.LessEqualDepth,
            side: THREE.DoubleSide,
            clipping: true,
        });
        const depth = new THREE.ShaderMaterial({
            name: "colliders-depth",
            uniforms,
            vertexShader: VERTEX,
            fragmentShader: DEPTH_FRAGMENT,
            colorWrite: false,
            side: THREE.DoubleSide,
            // (Its depth a hair behind the colliders' own, so the lines drawn after it at the same depth always pass.)
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            clipping: true,
        });
        this.materials = { colour, depth };
        /** The trees' triangles (`fixed`: the building's and the furniture's; `loose`: the people's and the trunks'), and what moves (`movers`), drawn afresh each frame. */
        this.fixed = new Layer(this.scene, this.materials);
        this.loose = new Layer(this.scene, this.materials);
        this.movers = new Layer(this.scene, this.materials, THREE.DynamicDrawUsage);

        /** What each layer was last made of: the trees' revisions, and the region. */
        this.made = { fixed: null, loose: null };
        this.region = null;
        this.cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
        this.planes = [];
        this.chosen = { key: null, stamp: new Float64Array(17), sink: new TriangleSink() };
        /** How many doors' leaves block, as last drawn. */
        this.shut = 0;
        this.last = { ms: 0, at: 0, how: "" };
        this.shown = false;
        this.xray = false;

        this.onEdited = () => this.edited();
        this.adder = {
            box: (centre, quaternion, half, kind = "other") => this.movers.sink.box(centre, quaternion, half, KIND[kind] ?? KIND.other),
            capsule: (start, end, radius, kind = "other") => this.movers.sink.capsule(start, end, radius, KIND[kind] ?? KIND.other),
        };
    }

    /**
     * Shown or not, and seen through everything or not (Colliders.show).
     * Hidden, the editor's region is let go of — ten megabytes or so, and
     * out of date by the time it is shown again; a public view's whole tree,
     * a few, is kept, and is made again only if a tree has changed since.
     */
    setShown(shown, xray) {
        this.xray = xray;
        this.uniforms.uOpacity.value = xray ? 0.62 : 1;
        this.uniforms.uFillScale.value = xray ? 0.4 : 1;
        this.materials.colour.depthTest = !xray;
        if (shown === this.shown) return;
        this.shown = shown;
        if (shown) {
            this.world.on("scene-edited", this.onEdited);
        } else {
            this.world.off("scene-edited", this.onEdited);
            clearTimeout(this.editTimer);
            this.editTimer = 0;
            this.chosen.key = null;
            this.chosen.sink = new TriangleSink();
            if (this.experience.publicView) return;
            for (const layer of [this.fixed, this.loose, this.movers]) layer.release();
            this.made = { fixed: null, loose: null };
            this.region = null;
        }
    }

    /**
     * An edit in edit mode: the furniture's tree brought up to date a moment
     * after (the same call a walking key makes there, Editor.walkKey) — not
     * during a move, which shows the piece's would-be collider instead.
     */
    edited() {
        clearTimeout(this.editTimer);
        this.editTimer = setTimeout(() => {
            this.editTimer = 0;
            const editor = this.world.editor;
            if (!this.shown || !editor?.active) return;
            if (editor.session) return this.edited();
            this.world.sceneBuilder?.refreshCollision({ wait: false });
            this.experience.wake("colliders");
        }, EDITED_AFTER);
    }

    /**
     * Over the frame just drawn (Colliders.draw). `depth`: the screen's
     * depth is the scene's (drawn straight to it, not through the
     * post-processing). In the editor, whose colliders are only those round
     * the visitor, they are then hidden behind the scene as well as behind
     * each other — pulled a hair towards the camera, so those on the very
     * surfaces they stand for show — or a roof over the region would have
     * the floor's colliders drawn on top of it. Otherwise, and in a public
     * view, which has all of them and draws the same whether or not its
     * step has the post-processing, behind each other alone.
     */
    draw(renderer, camera, depth = false) {
        const builder = this.world.sceneBuilder;
        if (!builder || !this.world.collision) return;
        this.uniforms.uWidth.value = THREE.MathUtils.clamp(renderer.getPixelRatio(), 1, 2) * 1.1;
        this.refresh(builder);
        this.moving(builder, camera);

        const planes = renderer.clippingPlanes;
        const cut = this.cutNow();
        const autoClear = renderer.autoClear;
        const scene = depth && !this.experience.publicView;
        // (The depth drawn first a hair behind the colliders' own — or, against the scene's, a hair in front of it — and their
        // lines a hair in front of that, so that the nearest always passes.)
        const { colour, depth: first } = this.materials;
        first.polygonOffsetFactor = scene ? -1 : 1;
        first.polygonOffsetUnits = scene ? -4 : 1;
        colour.polygonOffset = scene;
        colour.polygonOffsetFactor = -1;
        colour.polygonOffsetUnits = -5;
        renderer.autoClear = false;
        if (!scene) renderer.clearDepth();
        if (cut) {
            this.planes.length = 0;
            this.planes.push(...planes, cut);
            renderer.clippingPlanes = this.planes;
        }
        this.fixed.depth.visible = this.fixed.colour.visible && !this.xray;
        this.loose.depth.visible = this.loose.colour.visible && !this.xray;
        this.movers.depth.visible = this.movers.colour.visible && !this.xray;
        renderer.render(this.scene, camera);
        renderer.clippingPlanes = planes;
        renderer.autoClear = autoClear;
    }

    /**
     * The region drawn, in the editor: round the visitor's feet, or the
     * point edit mode's view turns round; from a metre under the floor
     * stood on — in edit mode, under the floor or the room in focus, if one
     * is (Page Up, Page Down, `/`), or the floor that point is on. Null in a
     * public view, which draws everything.
     */
    regionNow() {
        if (this.experience.publicView) return null;
        const editor = this.world.editor;
        const player = this.world.player;
        const builder = this.world.sceneBuilder;
        // (The building's floors, which nothing in the editor changes.)
        this.levels ??= builder.levels?.() ?? [];
        let x = 0;
        let y = 0;
        let z = 0;
        let floor = null;
        if (editor?.active) {
            ({ x, y, z } = editor.view.target);
            const focus = editor.focus;
            if (focus?.type === "level") floor = this.levels[focus.level] ?? null;
            else if (focus?.type === "room") floor = builder.spec.rooms.find((room) => room.id === focus.room)?.elevation ?? null;
        } else if (player) {
            const collider = player.player.collider;
            x = collider.start.x;
            z = collider.start.z;
            y = collider.start.y - collider.radius;
        }
        floor ??= floorUnder(this.levels, y);
        const region = this.region;
        if (region && region.floor === floor && Math.hypot(region.x - x, region.z - z) <= MOVE_ON) return region;
        return (this.region = {
            x,
            z,
            floor,
            x0: x - REGION,
            x1: x + REGION,
            z0: z - REGION,
            z1: z + REGION,
            y0: floor - BAND_BELOW,
            y1: floor + BAND_ABOVE,
        });
    }

    /** The trees' triangles made again, where a tree or the region has changed since they were last made. */
    refresh(builder) {
        const collision = this.world.collision;
        const revision = collision.revision;
        const region = this.regionNow();
        const made = this.made;
        let built = false;
        const started = performance.now();
        if (!made.fixed || made.fixed.static !== revision.static || made.fixed.dynamic !== revision.dynamic || made.fixed.region !== region) {
            const sink = this.fixed.sink;
            sink.begin();
            for (const tree of ["static", "dynamic"]) {
                const keeper = tree === "static" ? builder.staticKeeper : builder.dynamicKeeper;
                // (What is walked: a keeper's list, but for a tree left as it was while another is built.)
                if (keeper && !keeper.job?.stale && keeper.tree === collision[tree]) gatherEntries(keeper, tree, region, sink, builder);
                else gatherTree(collision[tree], tree, region, sink, { builder });
            }
            this.fixed.commit();
            made.fixed = { static: revision.static, dynamic: revision.dynamic, region };
            built = true;
        }
        if (!made.loose || made.loose.people !== revision.people || made.loose.outdoor !== revision.outdoor || made.loose.region !== region) {
            const sink = this.loose.sink;
            sink.begin();
            gatherTree(collision.people, "people", region, sink, { kind: KIND.people });
            gatherTree(collision.outdoor, "outdoor", region, sink, { kind: KIND.trunk });
            this.loose.commit();
            made.loose = { people: revision.people, outdoor: revision.outdoor, region };
            built = true;
        }
        if (built) {
            this.last = { ms: performance.now() - started, at: performance.now(), how: region ? "region" : "all" };
        }
    }

    /** What collides and moves, as it stands this frame: the doors' leaves, the cars, the visitor, what is selected, and anything registered. */
    moving(builder, camera) {
        const sink = this.movers.sink;
        sink.begin(256);
        const world = this.world;
        const player = world.player;
        let shut = 0;
        for (const door of builder.doors ?? []) {
            const group = door.group;
            if (!group?.parent) continue;
            group.getWorldPosition(_p);
            if (_p.distanceToSquared(camera.position) > DOORS_WITHIN * DOORS_WITHIN) continue;
            if (door.open < DOOR_BLOCKS_BELOW) {
                // What the visitor is pushed out of (Door.resolveCapsule).
                for (const blocker of door.getBlockers()) sink.box(blocker.centre, blocker.quaternion, blocker.half, KIND.door);
                shut++;
            } else {
                for (const { leaf } of door.leaves ?? []) {
                    if (!leaf.userData.size) continue;
                    leaf.matrixWorld.decompose(_p, _q, _s);
                    sink.box(_p, _q, _half.copy(leaf.userData.size).multiplyScalar(0.5), KIND["door-open"]);
                }
            }
        }
        for (const car of builder.cars ?? []) {
            const capsule = car.collider();
            const driven = player?.inVehicle && player.currentCar === car;
            sink.capsule(capsule.start, capsule.end, capsule.radius, driven ? KIND.car : KIND["car-parked"]);
        }
        if (player && this.seesVisitor(player)) {
            const collider = player.player.collider;
            sink.capsule(collider.start, collider.end, collider.radius, KIND.player);
        }
        this.drawChosen(builder, sink);
        for (const provider of this.colliders?.providers ?? []) {
            try {
                provider(this.adder);
            } catch (error) {
                console.warn("A collider could not be drawn.", error);
            }
        }
        this.movers.commit();
        this.shut = shut;
    }

    /** Whether the visitor's own capsule is drawn: not where it is the camera (first person, walking), nor at the wheel. */
    seesVisitor(player) {
        if (player.inVehicle) return false;
        const editor = this.world.editor;
        if (editor?.active || this.world.birdView?.active) return true;
        return this.experience.camera.mode !== "first";
    }

    /**
     * What is selected in the editor — a piece of furniture or a flight —
     * drawn as the collider it would have where it stands now, made again
     * whenever it moves: its box or its mesh (SceneBuilder.collisionOf), or
     * the flight's ramp and guards.
     */
    drawChosen(builder, sink) {
        const selection = this.world.editor?.selection;
        const chosen = this.chosen;
        const group = selection?.type === "furniture" ? selection.entry?.group : selection?.type === "stair" ? selection.entry?.collider : null;
        if (!group) {
            chosen.key = null;
            return;
        }
        group.updateWorldMatrix(true, false);
        const elements = group.matrixWorld.elements;
        // Where it stands, and what it is made of (a model come in for its stand-in, a flight built again): the same, or made again.
        const parts = partsOf(group);
        let same = chosen.key === group && chosen.stamp[16] === parts;
        for (let i = 0; i < 16 && same; i++) same = chosen.stamp[i] === elements[i];
        if (!same) {
            chosen.key = group;
            chosen.stamp.set(elements);
            chosen.stamp[16] = parts;
            const met = selection.type === "furniture" ? builder.collisionOf(selection.entry.placement, group) : { mode: "stairs" };
            const into = chosen.sink;
            into.begin();
            if (met?.mode === "box") {
                // As SceneBuilder's boxProxy stands it: the box's middle where the piece puts it, turned and scaled as the piece is.
                met.box.getCenter(_centre).applyMatrix4(group.matrixWorld);
                met.box.getSize(_half).multiply(group.scale).multiplyScalar(0.5);
                into.box(_centre, group.quaternion, _half, KIND["chosen-box"]);
            } else if (met) {
                // (As the furniture's tree takes them: SceneBuilder's skipDynamic, which its keeper was made with.)
                group.updateWorldMatrix(false, true);
                meshTriangles(group, builder.dynamicKeeper?.skip ?? isTransient, into, met.mode === "stairs" ? KIND["chosen-stairs"] : KIND["chosen-mesh"]);
                // ...and its doors and drawers each as the box it is met as, shut, open or not (Openables.js's shutProxy).
                for (const { matrix, box } of met.parts ?? []) {
                    matrix.decompose(_p, _q, _s);
                    box.getCenter(_centre).applyMatrix4(matrix);
                    box.getSize(_half).multiply(_s).multiplyScalar(0.5);
                    into.box(_centre, _q, _half, KIND["chosen-box"]);
                }
            }
        }
        const from = chosen.sink;
        sink.reserve(from.count);
        sink.positions.set(from.positions.subarray(0, from.count * 9), sink.count * 9);
        sink.kinds.set(from.kinds.subarray(0, from.count * 3), sink.count * 3);
        sink.count += from.count;
        for (let i = 0; i < from.counts.length; i++) sink.counts[i] += from.counts[i];
    }

    /** Triangles by what they are (`kinds`: [label, how many], of those there are), as last drawn: for `?stats`, or a test. */
    get counts() {
        const by = new Map();
        let total = 0;
        for (const layer of [this.fixed, this.loose, this.movers]) {
            const counts = layer.sink.counts;
            for (let i = 0; i < counts.length; i++) {
                if (!counts[i]) continue;
                by.set(KINDS[i].label, (by.get(KINDS[i].label) ?? 0) + counts[i]);
                total += counts[i];
            }
        }
        return { total, kinds: [...by], doorsShut: this.shut, built: this.last, region: this.region ? REGION * 2 : null, xray: this.xray };
    }

    /**
     * Where the colliders are cut, looking down into a floor, as the view
     * itself takes away the floors above and the floor's own ceilings — or
     * a ceiling's colliders would hide everything under them: from above
     * (BirdView), a plane a little over the floor on show — its highest
     * level and CUT_ABOVE over it, or just under the floor above, whichever
     * is lower; in edit mode with a floor or a room in focus (Collections'
     * focus hides its ceilings), CUT_ABOVE over that floor. Null otherwise.
     */
    cutNow() {
        const editor = this.world.editor;
        if (editor?.active && (editor.focus?.type === "level" || editor.focus?.type === "room") && this.region) {
            this.cut.constant = this.region.floor + CUT_ABOVE;
            return this.cut;
        }
        const bird = this.world.birdView;
        if (!bird?.active) return null;
        const storeys = bird.storeys?.list ?? [];
        const storey = storeys[bird.level];
        if (!storey) return null;
        let top = -Infinity;
        for (const level of storey.levels) top = Math.max(top, bird.levels[level] ?? storey.elevation);
        if (!Number.isFinite(top)) top = storey.elevation;
        top += CUT_ABOVE;
        const above = storeys[bird.level + 1];
        if (above) for (const level of above.levels) top = Math.min(top, (bird.levels[level] ?? above.elevation) - 0.05);
        this.cut.constant = top;
        return this.cut;
    }

    dispose() {
        this.setShown(false, false);
        this.made = { fixed: null, loose: null };
        for (const layer of [this.fixed, this.loose, this.movers]) layer.dispose();
        this.materials.colour.dispose();
        this.materials.depth.dispose();
    }
}

/**
 * The floor a height is on, in the editor: the height of the highest of
 * the building's floor levels it has reached (SceneBuilder.levels, read as
 * the editor's Collections.levelOf reads it).
 */
function floorUnder(levels, y) {
    let floor = levels[0] ?? 0;
    for (const level of levels) if (level <= y + 0.35) floor = level;
    return floor;
}

/** A number that changes when the meshes under `root` do: another geometry, its vertices changed, one more or fewer. */
function partsOf(root) {
    let sum = 0;
    let n = 0;
    root.traverse((node) => {
        const geometry = node.isMesh ? node.geometry : null;
        if (!geometry) return;
        n++;
        sum += n * (geometry.id * 7919 + (geometry.attributes.position?.version ?? 0));
    });
    return sum + n * 1e-3;
}

/** The world-space triangles of the meshes under `root`, but what `skip` leaves out (as a tree would take them: buildOctree). */
function meshTriangles(root, skip, sink, kind) {
    const visit = (object) => {
        if (skip(object)) return;
        const geometry = object.isMesh ? object.geometry : null;
        const position = geometry?.attributes.position;
        if (position) {
            const index = geometry.index;
            const count = (index ? index.count : position.count) / 3;
            const matrix = object.matrixWorld;
            sink.reserve(count);
            for (let t = 0; t < count; t++) {
                const i = t * 3;
                const a = _corners[0].fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
                const b = _corners[1].fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix);
                const c = _corners[2].fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix);
                sink.put(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, kind, -1);
            }
        }
        for (const child of object.children) visit(child);
    };
    visit(root);
}

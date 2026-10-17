import * as THREE from "three";
import { Octree } from "three/examples/jsm/math/Octree.js";
import { Capsule } from "three/examples/jsm/math/Capsule.js";

/**
 * What the player and the car collide against, split in two.
 *
 * `static` is the building: walls, slabs, roofs — everything the editor
 * cannot move. It is the expensive tree (an imported house can run to
 * hundreds of thousands of triangles) and is built once, then again only if
 * a wall is rebuilt because a door slid along it.
 *
 * `dynamic` is everything the editor can move: furniture, stair ramps. It
 * is brought up to date whenever the visitor returns to the walkthrough
 * after an edit.
 *
 * `people` are the people standing and sitting round the property
 * (World/People.js), a box each, kept by them; `outdoor` the garden's trees.
 * Neither stops a ray: a camera's boom or a pointed finger passes them.
 *
 * Both answer the same two questions three's Octree does, so this object
 * stands in for one anywhere an octree was passed before.
 *
 * A tree is the same tree however it is made: `buildOctree` makes one from
 * scratch, a `TreeKeeper` keeps one in step with what its triangles come
 * from — a wall, a piece of furniture — and after an edit mends only the
 * cells the edit touched. Cell for cell and triangle for triangle, in the
 * same order, what it holds is what building it again from scratch would
 * give: the order is what a capsule is pushed out by, so the walk is the
 * same walk.
 */

const _capsule = new Capsule();
const _shift = new THREE.Vector3();
const _plane = new THREE.Plane();

/**
 * The capsule being resolved: where its middle was before this frame's
 * move (Collision.capsuleIntersect's `from`), while it is resolved — what
 * SceneOctree.triangleCapsuleIntersect asks to tell a face that faces up
 * met from under it. `from` false otherwise.
 */
const _coming = { from: false, middle: new THREE.Vector3() };
const _middle = new THREE.Vector3();
const _up = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
const _lowered = new Capsule();
/** The box round a capsule looked at for room (Collision.meets), and the triangles in it. */
const _met = new THREE.Box3();
const _metList = [];
/** Each capsule's box, as meetsAny asks: six numbers a capsule. */
let _bounds = new Float64Array(6 * 64);

/**
 * How far inside a cell a triangle must lie to be put in it, and in no
 * other, without the full test, in metres: a million times what rounding
 * can do to that test in a house, a thousandth of anything built.
 */
const WELL_INSIDE = 1e-6;
/** A keeper mends its tree while what changed is under this share of it; over it, building again is quicker. */
const MEND_SHARE = 0.3;
/** A tree of more triangles than this, to be built again from scratch after an edit, may be built a slice a frame (TreeKeeper.update's `slice`): under it, at once. */
const SLICE_OVER = 150000;
/**
 * And where a slice a frame is allowed, such a tree is built again rather
 * than mended once more triangles than this have changed: mending them at
 * once is some 40 ms of a big house for this many, and grows with them.
 * The same number is how much may have changed for the tree walked against
 * while another is built to be put right meanwhile (TreeKeeper.meanwhile).
 */
const MEND_AT_ONCE = 60000;

/** A triangle of a collision tree: what it is part of (for the crosshair), and where it came from (for a keeper). */
class CollisionTriangle extends THREE.Triangle {
    constructor(a, b, c) {
        super(a, b, c);
        /** What it is part of, where its mesh said (`userData.label`). */
        this.label = undefined;
        /** A keeper's entry: the wall or the piece it is of. */
        this.source = null;
        /** Its place among that entry's triangles. */
        this.at = 0;
    }
}

/**
 * three's Octree, with a subdivision that knows when to stop.
 *
 * The stock split keeps dividing any cell with more than eight triangles,
 * down to sixteen levels. Large triangles lying close together — a lawn, a
 * drive, a patio and a ground-floor slab a few centimetres apart — land in
 * every child of every cell they cross, so the split never thins them out
 * and the tree multiplies along their plane: an imported house of 25,000
 * triangles came out at 4.6 million cells and 2.6 GB. Here a cell stops
 * splitting once splitting no longer separates anything, or once it is
 * smaller than a hand's width.
 *
 * And a split that does not ask three's Box3 about every triangle and every
 * cell: Box3.intersectsTriangle makes three arrays a call, and Ladonia's
 * furniture is 961 thousand triangles, each asked about eight cells at each
 * of six levels — 2.3 s. `touched` gives the same answers (below).
 *
 * And a capsule that has come at a triangle from behind is not pushed out
 * through it (triangleCapsuleIntersect).
 */
class SceneOctree extends Octree {
    static MIN_CELL = 0.25;

    constructor(box) {
        super(box);
        /** How many triangles its cell holds, in its own list or shared out among its children. */
        this.count = 0;
        /** Which of its parent's eight cells it is: x * 4 + y * 2 + z. */
        this.octant = 0;
    }

    /**
     * three's test of a capsule against one triangle, but for a capsule that
     * came at it from behind, as the visitor's does while it is resolved
     * (Collision.capsuleIntersect's `from`).
     *
     * three takes a triangle to face one way, its front, and a capsule whose
     * middle line has gone through its plane is pushed out in front, as far
     * as it takes for the end behind to come out a radius clear. That is
     * the floor caught under a body falling fast onto it. But a room's
     * ceiling here is such a triangle facing up (the floor above's
     * underside, one-sided, is drawn from the room's side): a visitor
     * jumping from a bed, a sofa or a window's sill pokes the top of the
     * capsule's line through it — a head can already be a radius into the
     * slab before it is met at all — and was then lifted up through the
     * slab onto the floor above, or over the window's head and out (a jump
     * at an upstairs window threw the visitor out in 24 of Ladonia's 32).
     * The head is brought down under the face over it before the resolve
     * (Collision.headroom); this is for a line the resolve itself takes up
     * through one — a push off a sill's edge, a shelf's. When the middle
     * line goes through the triangle, which faces up, and the capsule's
     * middle was under its plane before this frame's move, it is pushed
     * back down, its top end a radius under the face, as a head meets a
     * ceiling.
     *
     * Anything else meets the triangle as three has it: a body walking,
     * falling (onto a floor from over it, however fast), on a ramp or
     * against a wall is never under a face it goes through; a face that
     * faces down is fallen through from inside whatever it is the
     * underside of as it always was; and no capsule but the visitor's (a
     * car's, a seat's test) is given where it came from.
     */
    triangleCapsuleIntersect(capsule, triangle) {
        const hit = super.triangleCapsuleIntersect(capsule, triangle);
        if (!hit || !_coming.from) return hit;
        triangle.getPlane(_plane);
        const start = _plane.distanceToPoint(capsule.start);
        const end = _plane.distanceToPoint(capsule.end);
        // Its line through a face that faces up — three's push along the face's normal, not off an edge — from under it.
        if (start < 0 === end < 0 || _plane.normal.y <= 0 || !hit.normal.equals(_plane.normal)) return hit;
        if (_plane.distanceToPoint(_coming.middle) >= 0) return hit;
        hit.normal.negate();
        hit.depth = capsule.radius + Math.max(start, end);
        return hit;
    }

    split(level) {
        if (!this.box) return this;
        const pending = [this, level];
        while (pending.length) {
            const at = pending.pop();
            divide(pending.pop(), at, pending);
        }
        return this;
    }
}

// The cell being divided: along each axis where it starts, its half, and
// its two halves as three's Box3 gives a box to the test — a centre and a
// half-extent — computed as three computes them, so that every comparison
// below is the comparison three made.
let _x0 = 0, _x1 = 0, _x2 = 0, _hx = 0, _cx0 = 0, _ex0 = 0, _cx1 = 0, _ex1 = 0;
let _y0 = 0, _y1 = 0, _y2 = 0, _hy = 0, _cy0 = 0, _ey0 = 0, _cy1 = 0, _ey1 = 0;
let _z0 = 0, _z1 = 0, _z2 = 0, _hz = 0, _cz0 = 0, _ez0 = 0, _cz1 = 0, _ez1 = 0;

function frame(box) {
    const min = box.min;
    const max = box.max;
    _hx = (max.x - min.x) * 0.5;
    _x0 = min.x + 0;
    _x1 = min.x + _hx;
    _x2 = _x1 + _hx;
    _cx0 = (_x0 + _x1) * 0.5;
    _ex0 = _x1 - _cx0;
    _cx1 = (_x1 + _x2) * 0.5;
    _ex1 = _x2 - _cx1;
    _hy = (max.y - min.y) * 0.5;
    _y0 = min.y + 0;
    _y1 = min.y + _hy;
    _y2 = _y1 + _hy;
    _cy0 = (_y0 + _y1) * 0.5;
    _ey0 = _y1 - _cy0;
    _cy1 = (_y1 + _y2) * 0.5;
    _ey1 = _y2 - _cy1;
    _hz = (max.z - min.z) * 0.5;
    _z0 = min.z + 0;
    _z1 = min.z + _hz;
    _z2 = _z1 + _hz;
    _cz0 = (_z0 + _z1) * 0.5;
    _ez0 = _z1 - _cz0;
    _cz1 = (_z1 + _z2) * 0.5;
    _ez1 = _z2 - _cz1;
}

/** One of the framed cell's eight, as a tree of its own. */
function cell(octant) {
    const x = octant & 4;
    const y = octant & 2;
    const z = octant & 1;
    const box = new THREE.Box3(
        new THREE.Vector3(x ? _x1 : _x0, y ? _y1 : _y0, z ? _z1 : _z0),
        new THREE.Vector3(x ? _x2 : _x1, y ? _y2 : _y1, z ? _z2 : _z1)
    );
    const tree = new SceneOctree(box);
    tree.octant = octant;
    return tree;
}

/**
 * Which of the framed cell's eight a triangle touches, a bit each: what
 * `box.intersectsTriangle(triangle)` says of each of them, to the last
 * digit, without three's thirteen axes for each.
 *
 * Three of those axes are the box's own, and on them the test is whether
 * the triangle's extent overlaps the box's — the same subtractions and
 * comparisons as three's, made here once an axis for both halves. A
 * triangle they leave in one cell alone, and well inside it, is in that
 * cell and no other, whatever the other ten axes would say (nine in ten of
 * a house's triangles: they are small beside a cell); the rest are put to
 * those ten, written out as three computes them (`otherAxes`).
 */
function touched(triangle) {
    const a = triangle.a;
    const b = triangle.b;
    const c = triangle.c;

    let lx = a.x < b.x ? a.x : b.x;
    if (c.x < lx) lx = c.x;
    let hx = a.x > b.x ? a.x : b.x;
    if (c.x > hx) hx = c.x;
    let mx = 0;
    if (!(hx - _cx0 < -_ex0 || lx - _cx0 > _ex0)) mx = 1;
    if (!(hx - _cx1 < -_ex1 || lx - _cx1 > _ex1)) mx |= 2;
    if (mx === 0) return 0;

    let ly = a.y < b.y ? a.y : b.y;
    if (c.y < ly) ly = c.y;
    let hy = a.y > b.y ? a.y : b.y;
    if (c.y > hy) hy = c.y;
    let my = 0;
    if (!(hy - _cy0 < -_ey0 || ly - _cy0 > _ey0)) my = 1;
    if (!(hy - _cy1 < -_ey1 || ly - _cy1 > _ey1)) my |= 2;
    if (my === 0) return 0;

    let lz = a.z < b.z ? a.z : b.z;
    if (c.z < lz) lz = c.z;
    let hz = a.z > b.z ? a.z : b.z;
    if (c.z > hz) hz = c.z;
    let mz = 0;
    if (!(hz - _cz0 < -_ez0 || lz - _cz0 > _ez0)) mz = 1;
    if (!(hz - _cz1 < -_ez1 || lz - _cz1 > _ez1)) mz |= 2;
    if (mz === 0) return 0;

    if (mx !== 3 && my !== 3 && mz !== 3) {
        const x = mx === 2;
        const y = my === 2;
        const z = mz === 2;
        if (
            lx > (x ? _x1 : _x0) + WELL_INSIDE && hx < (x ? _x2 : _x1) - WELL_INSIDE &&
            ly > (y ? _y1 : _y0) + WELL_INSIDE && hy < (y ? _y2 : _y1) - WELL_INSIDE &&
            lz > (z ? _z1 : _z0) + WELL_INSIDE && hz < (z ? _z2 : _z1) - WELL_INSIDE
        ) {
            return 1 << ((x ? 4 : 0) + (y ? 2 : 0) + (z ? 1 : 0));
        }
    }

    let mask = 0;
    for (let x = 0; x < 2; x++) {
        if (!(mx & (1 << x))) continue;
        for (let y = 0; y < 2; y++) {
            if (!(my & (1 << y))) continue;
            for (let z = 0; z < 2; z++) {
                if (!(mz & (1 << z))) continue;
                if (otherAxes(a, b, c, x ? _cx1 : _cx0, y ? _cy1 : _cy0, z ? _cz1 : _cz0, x ? _ex1 : _ex0, y ? _ey1 : _ey0, z ? _ez1 : _ez0)) {
                    mask |= 1 << (x * 4 + y * 2 + z);
                }
            }
        }
    }
    return mask;
}

/**
 * Box3.intersectsTriangle's other ten axes — each edge of the triangle
 * crossed with each axis of the box, and the triangle's normal — for a box
 * of centre (cx, cy, cz) and half-extent (ex, ey, ez): false once one of
 * them separates the two. The sums are three's own, term for term in its
 * order, less the terms it multiplies by a zero of the axis.
 */
function otherAxes(a, b, c, cx, cy, cz, ex, ey, ez) {
    const v0x = a.x - cx, v0y = a.y - cy, v0z = a.z - cz;
    const v1x = b.x - cx, v1y = b.y - cy, v1z = b.z - cz;
    const v2x = c.x - cx, v2y = c.y - cy, v2z = c.z - cz;
    const f0x = v1x - v0x, f0y = v1y - v0y, f0z = v1z - v0z;
    const f1x = v2x - v1x, f1y = v2y - v1y, f1z = v2z - v1z;
    const f2x = v0x - v2x, f2y = v0y - v2y, f2z = v0z - v2z;
    let p0, p1, p2;

    // (0, -f.z, f.y) for each edge f
    p0 = v0z * f0y - v0y * f0z; p1 = v1z * f0y - v1y * f0z; p2 = v2z * f0y - v2y * f0z;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ey * Math.abs(f0z) + ez * Math.abs(f0y)) return false;
    p0 = v0z * f1y - v0y * f1z; p1 = v1z * f1y - v1y * f1z; p2 = v2z * f1y - v2y * f1z;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ey * Math.abs(f1z) + ez * Math.abs(f1y)) return false;
    p0 = v0z * f2y - v0y * f2z; p1 = v1z * f2y - v1y * f2z; p2 = v2z * f2y - v2y * f2z;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ey * Math.abs(f2z) + ez * Math.abs(f2y)) return false;

    // (f.z, 0, -f.x)
    p0 = v0x * f0z - v0z * f0x; p1 = v1x * f0z - v1z * f0x; p2 = v2x * f0z - v2z * f0x;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(f0z) + ez * Math.abs(f0x)) return false;
    p0 = v0x * f1z - v0z * f1x; p1 = v1x * f1z - v1z * f1x; p2 = v2x * f1z - v2z * f1x;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(f1z) + ez * Math.abs(f1x)) return false;
    p0 = v0x * f2z - v0z * f2x; p1 = v1x * f2z - v1z * f2x; p2 = v2x * f2z - v2z * f2x;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(f2z) + ez * Math.abs(f2x)) return false;

    // (-f.y, f.x, 0)
    p0 = v0y * f0x - v0x * f0y; p1 = v1y * f0x - v1x * f0y; p2 = v2y * f0x - v2x * f0y;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(f0y) + ey * Math.abs(f0x)) return false;
    p0 = v0y * f1x - v0x * f1y; p1 = v1y * f1x - v1x * f1y; p2 = v2y * f1x - v2x * f1y;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(f1y) + ey * Math.abs(f1x)) return false;
    p0 = v0y * f2x - v0x * f2y; p1 = v1y * f2x - v1x * f2y; p2 = v2y * f2x - v2x * f2y;
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(f2y) + ey * Math.abs(f2x)) return false;

    // The triangle's normal.
    const nx = f0y * f1z - f0z * f1y;
    const ny = f0z * f1x - f0x * f1z;
    const nz = f0x * f1y - f0y * f1x;
    p0 = v0x * nx + v0y * ny + v0z * nz;
    p1 = v1x * nx + v1y * ny + v1z * nz;
    p2 = v2x * nx + v2y * ny + v2z * nz;
    return !(Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > ex * Math.abs(nx) + ey * Math.abs(ny) + ez * Math.abs(nz));
}

/**
 * One cell's triangles shared out among its eight, as three's split does
 * it: taken from the end of its list, each into every cell it touches, so
 * that a cell's list runs the other way from its parent's. Cells left to
 * divide in their turn go on `pending`, with their level.
 */
function divide(node, level, pending) {
    const list = node.triangles;
    const total = list.length;
    node.count = total;
    frame(node.box);
    const lists = [null, null, null, null, null, null, null, null];
    for (let i = total - 1; i >= 0; i--) {
        const triangle = list[i];
        let mask = touched(triangle);
        for (let octant = 0; mask !== 0; octant++, mask >>= 1) {
            if (mask & 1) (lists[octant] ??= []).push(triangle);
        }
    }
    node.triangles = [];

    const small = Math.min(_hx, _hy, _hz) < SceneOctree.MIN_CELL;
    for (let octant = 0; octant < 8; octant++) {
        const mine = lists[octant];
        if (!mine) continue;
        const child = cell(octant);
        child.triangles = mine;
        child.count = mine.length;
        if (mine.length > 8 && level < 16 && !small && mine.length < total) pending.push(child, level + 1);
        node.subTrees.push(child);
    }
}

/**
 * A tree of these triangles, in this order: the list is the tree's from
 * here on. With `pending`, only its root, boxed — the cells still to
 * divide go on that list, for `divide` to be called on a few at a time.
 * `low` and `high` are the corners of the box round all of them, if known.
 */
function plant(triangles, pending = null, low = null, high = null) {
    const tree = new SceneOctree();
    // An empty tree would split a box of infinities; leave it bare instead.
    if (!triangles.length) return tree;
    const { min, max } = tree.bounds;
    if (low) {
        // (The box round them all, where the caller has it already: a keeper, from its sources' own.)
        min.fromArray(low);
        max.fromArray(high);
    } else {
        for (let i = 0; i < triangles.length; i++) {
            const { a, b, c } = triangles[i];
            min.x = Math.min(min.x, a.x, b.x, c.x);
            min.y = Math.min(min.y, a.y, b.y, c.y);
            min.z = Math.min(min.z, a.z, b.z, c.z);
            max.x = Math.max(max.x, a.x, b.x, c.x);
            max.y = Math.max(max.y, a.y, b.y, c.y);
            max.z = Math.max(max.z, a.z, b.z, c.z);
        }
    }
    tree.triangles = triangles;
    if (pending) {
        // (three's build(): the box, and the root divided whatever it holds.)
        tree.calcBox();
        pending.push(tree, 0);
    } else {
        tree.build();
    }
    return tree;
}

export default class Collision {
    constructor() {
        this.static = new SceneOctree();
        this.dynamic = new SceneOctree();
        // The garden's trees (Vegetation), which neither the building nor
        // what moves in it knows of.
        this.outdoor = new SceneOctree();
        // The people round the property (World/People.js).
        this.people = new SceneOctree();
        /**
         * How many times each tree has been set: what a reader that keeps a
         * copy of the triangles (World/ColliderView.js) looks at to know
         * that its copy is out of date. A keeper mends its tree in place
         * (TreeKeeper), so the tree being the same object says nothing; but
         * every mend, build and finished slice is handed out through these
         * setters.
         */
        this.revision = { static: 0, dynamic: 0, people: 0, outdoor: 0 };
    }

    setStatic(octree) {
        this.static = octree;
        this.revision.static++;
    }

    setDynamic(octree) {
        this.dynamic = octree;
        this.revision.dynamic++;
    }

    setOutdoor(octree) {
        this.outdoor = octree;
        this.revision.outdoor++;
    }

    setPeople(octree) {
        this.people = octree ?? new SceneOctree();
        this.revision.people++;
    }

    /**
     * Resolve against the building first, then against whatever the
     * building's push left the capsule touching — what moves, the people,
     * then the garden's trees — and report the sum.
     *
     * `from`, where the capsule's middle was before this frame's move (the
     * visitor's: Player.updateColliderMovement, Player/Swim.js): a face that
     * faces up met from under it — a room's ceiling, which is one — holds
     * the capsule down rather than letting it up through onto the floor
     * above: first the head (headroom), then any face that faces up the
     * resolve itself takes its line through (SceneOctree.
     * triangleCapsuleIntersect). Without it, three's resolve as it always
     * was.
     *
     * @param {Capsule} capsule
     * @param {{ from?: THREE.Vector3|null }} [options]
     */
    capsuleIntersect(capsule, { from = null } = {}) {
        if (!from) return this.resolve(capsule);
        const lowered = this.headroom(capsule, from);
        _coming.from = true;
        _coming.middle.copy(from);
        let result;
        try {
            result = this.resolve(lowered ? _lowered : capsule);
        } finally {
            _coming.from = false;
        }
        if (!lowered) return result;
        // The head's push and the resolve's, as one.
        const total = new THREE.Vector3(0, -lowered, 0);
        if (result) total.addScaledVector(result.normal, result.depth);
        const depth = total.length();
        return depth > 1e-9 ? { normal: total.divideScalar(depth), depth } : { normal: total.set(0, 1, 0), depth: 0 };
    }

    /**
     * A head through a ceiling: the nearest face over the capsule's middle,
     * no further up than its top end — if that faces up, and the middle was
     * under it before this frame's move — and how far down the capsule goes
     * for that end to be a radius under it, the capsule so lowered in
     * `_lowered`; else 0. Met here, before the resolve, the head comes down
     * through the one face over it: in the resolve, a line through a
     * ceiling made of many triangles was shoved sideways off the edges
     * between them, one after another, before the one it went through was
     * met (out through the wall over an upstairs window, from its sill).
     * Under anything else — a flight's underside, a table — the middle,
     * a metre up, has nothing over it within the capsule's top. Only asked
     * of a capsule this frame's move took up: a head goes up into a ceiling
     * only so (a jump), and pressed to the floor, walking, a capsule never
     * moves up — so walking costs no ray.
     */
    headroom(capsule, from) {
        const middle = capsule.getCenter(_middle);
        const reach = capsule.end.y - middle.y;
        if (!(middle.y > from.y) || !(reach > 0)) return 0;
        _up.origin.copy(middle);
        const hit = this.rayIntersect(_up, { twoSided: true, far: reach });
        if (!hit || hit.distance > reach) return 0;
        hit.triangle.getPlane(_plane);
        if (_plane.normal.y <= 0 || _plane.distanceToPoint(from) >= 0) return 0;
        // Its end a radius under the face where the line meets it.
        const down = capsule.end.y - (middle.y + hit.distance) + capsule.radius;
        _lowered.copy(capsule);
        _lowered.translate(_shift.set(0, -down, 0));
        return down;
    }

    /** capsuleIntersect's work. */
    resolve(capsule) {
        _capsule.copy(capsule);
        let first = null;
        let total = null;
        let last = null;
        for (const tree of [this.static, this.dynamic, this.people, this.outdoor]) {
            const hit = tree.capsuleIntersect(_capsule);
            if (!hit) continue;
            _capsule.translate(_shift.copy(hit.normal).multiplyScalar(hit.depth));
            if (!first) {
                first = hit;
                continue;
            }
            total ??= new THREE.Vector3().addScaledVector(first.normal, first.depth);
            total.addScaledVector(hit.normal, hit.depth);
            last = hit;
        }
        if (!first) return false;
        if (!total) return first;

        const depth = total.length();
        if (depth < 1e-9) return { normal: last.normal, depth: 0 };
        return { normal: total.divideScalar(depth), depth };
    }

    /**
     * Whether a capsule meets anything — the building, what moves, the
     * people, the garden's trees — by more than `depth`, leaving out the
     * triangles `except` says to: each triangle it touches tested on its
     * own, nothing resolved. What Player.js looks for room by, to sit down
     * and get up by the clip, the seat's own piece left out (World/
     * Seats.js's roomFor).
     *
     * @param {Capsule} capsule
     * @param {{ except?: (triangle: THREE.Triangle) => boolean, depth?: number }} [options]
     */
    meets(capsule, { except = null, depth = 0.01 } = {}) {
        _met.min.x = Math.min(capsule.start.x, capsule.end.x) - capsule.radius;
        _met.min.y = Math.min(capsule.start.y, capsule.end.y) - capsule.radius;
        _met.min.z = Math.min(capsule.start.z, capsule.end.z) - capsule.radius;
        _met.max.x = Math.max(capsule.start.x, capsule.end.x) + capsule.radius;
        _met.max.y = Math.max(capsule.start.y, capsule.end.y) + capsule.radius;
        _met.max.z = Math.max(capsule.start.z, capsule.end.z) + capsule.radius;
        for (const tree of [this.static, this.dynamic, this.people, this.outdoor]) {
            if (!tree) continue;
            _metList.length = 0;
            for (const triangle of collectTriangles(tree, _met, _metList)) {
                if (except?.(triangle)) continue;
                const hit = tree.triangleCapsuleIntersect(capsule, triangle);
                if (hit && hit.depth > depth) return true;
            }
        }
        return false;
    }

    /**
     * Whether any of `capsules` meets anything by more than `depth` — as
     * meets asks of one — the triangles they might meet gathered once, those
     * in `box` (which must hold all of them), and each tried against only the
     * capsules whose own boxes it touches: a figure's body limb by limb at
     * many moments of a clip (World/Seats.js's wayClear, turnClear), where
     * asking the trees again for each limb was most of 30-60 ms a seat.
     *
     * @param {Capsule[]} capsules  the first `count` of them
     * @param {THREE.Box3} box
     * @param {{ except?: (triangle: THREE.Triangle) => boolean, depth?: number, count?: number }} [options]
     */
    meetsAny(capsules, box, { except = null, depth = 0.01, count = capsules.length } = {}) {
        if (_bounds.length < count * 6) _bounds = new Float64Array(count * 6);
        for (let i = 0; i < count; i++) {
            const { start, end, radius } = capsules[i];
            _bounds[i * 6] = Math.min(start.x, end.x) - radius;
            _bounds[i * 6 + 1] = Math.min(start.y, end.y) - radius;
            _bounds[i * 6 + 2] = Math.min(start.z, end.z) - radius;
            _bounds[i * 6 + 3] = Math.max(start.x, end.x) + radius;
            _bounds[i * 6 + 4] = Math.max(start.y, end.y) + radius;
            _bounds[i * 6 + 5] = Math.max(start.z, end.z) + radius;
        }
        for (const tree of [this.static, this.dynamic, this.people, this.outdoor]) {
            if (!tree) continue;
            _metList.length = 0;
            for (const triangle of collectTriangles(tree, box, _metList)) {
                const { a, b, c } = triangle;
                const x0 = Math.min(a.x, b.x, c.x);
                const x1 = Math.max(a.x, b.x, c.x);
                const y0 = Math.min(a.y, b.y, c.y);
                const y1 = Math.max(a.y, b.y, c.y);
                const z0 = Math.min(a.z, b.z, c.z);
                const z1 = Math.max(a.z, b.z, c.z);
                if (x1 < box.min.x || x0 > box.max.x || y1 < box.min.y || y0 > box.max.y || z1 < box.min.z || z0 > box.max.z) continue;
                let left = null;
                for (let i = 0; i < count; i++) {
                    const k = i * 6;
                    if (x1 < _bounds[k] || x0 > _bounds[k + 3] || y1 < _bounds[k + 1] || y0 > _bounds[k + 4] || z1 < _bounds[k + 2] || z0 > _bounds[k + 5]) continue;
                    // (Whether it is to be left out asked once, and only of a triangle some capsule's box touches.)
                    left ??= Boolean(except?.(triangle));
                    if (left) break;
                    const hit = tree.triangleCapsuleIntersect(capsules[i], triangle);
                    if (hit && hit.depth > depth) return true;
                }
            }
        }
        return false;
    }

    /**
     * Whether any triangle — of the building, what moves, the people, the
     * garden's trees — lies even partly in `box` (the box round its corners
     * meets it), leaving out those `except` says to: whether anything is
     * near enough to a figure's way across a floor for its body to be looked
     * over limb by limb (World/Seats.js's wayClear), where a capsule round it
     * all could not take in its feet out to the side near the floor.
     *
     * @param {THREE.Box3} box
     * @param {{ except?: (triangle: THREE.Triangle) => boolean }} [options]
     */
    anyIn(box, { except = null } = {}) {
        for (const tree of [this.static, this.dynamic, this.people, this.outdoor]) {
            if (!tree) continue;
            _metList.length = 0;
            for (const triangle of collectTriangles(tree, box, _metList)) {
                const { a, b, c } = triangle;
                if (Math.max(a.x, b.x, c.x) < box.min.x || Math.min(a.x, b.x, c.x) > box.max.x) continue;
                if (Math.max(a.y, b.y, c.y) < box.min.y || Math.min(a.y, b.y, c.y) > box.max.y) continue;
                if (Math.max(a.z, b.z, c.z) < box.min.z || Math.min(a.z, b.z, c.z) > box.max.z) continue;
                if (!except?.(triangle)) return true;
            }
        }
        return false;
    }

    /**
     * The first triangle a ray meets — facing it, or with `twoSided` either
     * way — as three's Octree.rayIntersect reports it: `{ distance,
     * triangle, position }`, or null.
     *
     * `far` is how far the caller cares: with one, only the cells the ray
     * crosses within that distance are looked in, and whatever is met
     * within it is the same hit as without (three's own walk goes through
     * every cell on the ray's whole line, to the far side of the property,
     * and looks each triangle up in its list so far before adding it: the
     * camera's boom in Ladonia's published house, 17 to 36 µs a frame for
     * that; under 3 with its reach given). A hit past `far` may be
     * reported or not: test its distance, as callers always have.
     */
    rayIntersect(ray, { twoSided = false, far = Infinity } = {}) {
        let nearest = null;
        for (const tree of [this.static, this.dynamic, this.outdoor]) {
            if (!tree) continue;
            const hit = rayHit(tree, ray, twoSided, far);
            if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
        }
        return nearest;
    }
}

const _rayPoint = new THREE.Vector3();
const _rayList = [];
const _raySeen = new Set();

/**
 * A tree's triangles in the cells a ray crosses within `far` of its
 * origin, each once, in the order three's Octree.getRayTriangles lists
 * them. A cell is passed by three's own test (Ray.intersectBox, written
 * out) and then by where the ray enters it.
 */
function rayTriangles(tree, ray, reach, out) {
    const subTrees = tree.subTrees;
    const origin = ray.origin;
    const ix = 1 / ray.direction.x;
    const iy = 1 / ray.direction.y;
    const iz = 1 / ray.direction.z;
    for (let i = 0; i < subTrees.length; i++) {
        const sub = subTrees[i];
        const { min, max } = sub.box;
        let tmin, tmax, tymin, tymax, tzmin, tzmax;
        if (ix >= 0) {
            tmin = (min.x - origin.x) * ix;
            tmax = (max.x - origin.x) * ix;
        } else {
            tmin = (max.x - origin.x) * ix;
            tmax = (min.x - origin.x) * ix;
        }
        if (iy >= 0) {
            tymin = (min.y - origin.y) * iy;
            tymax = (max.y - origin.y) * iy;
        } else {
            tymin = (max.y - origin.y) * iy;
            tymax = (min.y - origin.y) * iy;
        }
        if (tmin > tymax || tymin > tmax) continue;
        if (tymin > tmin || isNaN(tmin)) tmin = tymin;
        if (tymax < tmax || isNaN(tmax)) tmax = tymax;
        if (iz >= 0) {
            tzmin = (min.z - origin.z) * iz;
            tzmax = (max.z - origin.z) * iz;
        } else {
            tzmin = (max.z - origin.z) * iz;
            tzmax = (min.z - origin.z) * iz;
        }
        if (tmin > tzmax || tzmin > tmax) continue;
        if (tzmin > tmin || tmin !== tmin) tmin = tzmin;
        if (tzmax < tmax || tmax !== tmax) tmax = tzmax;
        if (tmax < 0) continue;
        // (Here three goes in. Entered past the reach, nothing in it is met within it.)
        if (tmin > reach) continue;

        const triangles = sub.triangles;
        if (triangles.length > 0) {
            for (let j = 0; j < triangles.length; j++) {
                const triangle = triangles[j];
                if (_raySeen.has(triangle)) continue;
                _raySeen.add(triangle);
                out.push(triangle);
            }
        } else {
            rayTriangles(sub, ray, reach, out);
        }
    }
}

/**
 * The first triangle of a tree a ray crosses: those facing it, as three's
 * Octree.rayIntersect meets them — or whichever way it faces: a published
 * house's collision (its runtime file) has a floor's top and no ceiling
 * under it, and seen from the room below a ray goes up through it.
 */
function rayHit(tree, ray, twoSided, far) {
    if (ray.direction.lengthSq() === 0) return false;
    _rayList.length = 0;
    _raySeen.clear();
    // A little past it: where a ray enters a cell and where it meets a triangle on the cell's face are two sums.
    rayTriangles(tree, ray, far + 1e-3 + far * 1e-6, _rayList);
    _raySeen.clear();
    let nearest = false;
    if (twoSided) {
        for (let i = 0; i < _rayList.length; i++) {
            const triangle = _rayList[i];
            const point = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, _rayPoint);
            if (!point) continue;
            const distance = point.distanceTo(ray.origin);
            if (!nearest || distance < nearest.distance) nearest = { distance, triangle, position: point.clone() };
        }
    } else {
        let distance = 1e100;
        let triangle = null;
        let position = null;
        for (let i = 0; i < _rayList.length; i++) {
            const result = ray.intersectTriangle(_rayList[i].a, _rayList[i].b, _rayList[i].c, true, _rayPoint);
            if (!result) continue;
            const length = result.sub(ray.origin).length();
            if (distance > length) {
                position = result.clone().add(ray.origin);
                distance = length;
                triangle = _rayList[i];
            }
        }
        if (distance < 1e100) nearest = { distance, triangle, position };
    }
    _rayList.length = 0;
    return nearest;
}

/**
 * An octree over part of the scene graph.
 *
 * Unlike Octree.fromGraphNode this can leave subtrees out — door leaves,
 * which swing, and the editor's helpers, which are not really there.
 *
 * @param {THREE.Object3D[]} roots
 * @param {(object: THREE.Object3D) => boolean} [skip] true to leave an
 *   object and everything under it out.
 */
export function buildOctree(roots, skip = () => false) {
    const triangles = [];
    const visit = (object) => {
        if (skip(object)) return;
        if (object.isMesh && object.geometry?.attributes.position) addMeshTriangles(triangles, object, null);
        for (const child of object.children) visit(child);
    };

    for (const root of roots) {
        if (!root) continue;
        root.updateWorldMatrix(true, true);
        visit(root);
    }
    return plant(triangles);
}

/**
 * A mesh's triangles, in world space. A mesh that says what it is
 * (`userData.label`, as a published runtime file's do) passes that on to
 * each, for a ray to report what it hit.
 */
function addMeshTriangles(out, mesh, source) {
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const matrix = mesh.matrixWorld;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const label = mesh.userData?.label;

    for (let t = 0; t < triangleCount; t++) {
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const i = t * 3;
        a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
        b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix);
        c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix);
        const triangle = new CollisionTriangle(a, b, c);
        if (label) triangle.label = label;
        triangle.source = source;
        triangle.at = out.length;
        out.push(triangle);
    }
    return triangleCount;
}

/**
 * Every triangle in an octree whose cell touches `box`. A triangle that
 * straddles cells can appear more than once; callers only ask "does any of
 * these hit", so duplicates cost time, not correctness.
 */
export function collectTriangles(octree, box, out = []) {
    if (octree.triangles?.length && (!octree.box || octree.box.intersectsBox(box))) {
        for (const triangle of octree.triangles) out.push(triangle);
    }
    for (const sub of octree.subTrees || []) {
        if (sub.box.intersectsBox(box)) collectTriangles(sub, box, out);
    }
    return out;
}

/**
 * Every triangle in an octree whose cell touches `box` — the whole tree
 * without one — each exactly once, in the order its cells are first met.
 * A triangle that straddles cells is listed in each of them; this is for
 * whoever needs the set itself (World/ColliderView.js, which draws it)
 * rather than "does any of these hit". Any tree three's walks go through
 * will do: one `buildOctree` made, a keeper's after any number of mends,
 * and the union a keeper hands out while it builds another (whose root
 * has no box of its own).
 */
export function uniqueTriangles(octree, box = null, out = []) {
    const seen = new Set();
    const visit = (node) => {
        if (box && node.box && !node.box.intersectsBox(box)) return;
        const triangles = node.triangles;
        for (let i = 0; i < triangles.length; i++) {
            const triangle = triangles[i];
            if (seen.has(triangle)) continue;
            seen.add(triangle);
            out.push(triangle);
        }
        const subTrees = node.subTrees;
        for (let i = 0; i < subTrees.length; i++) visit(subTrees[i]);
    };
    if (octree) visit(octree);
    return out;
}

/**
 * The skip rule every scene octree shares: door leaves, which swing; the
 * editor's helpers, which are not really there; and decorative joinery —
 * skirting, casings, spindles — which is drawn but walked past.
 */
export function isTransient(object) {
    return Boolean(
        object.userData?.kind === "door" ||
            object.userData?.doorLeaf ||
            object.userData?.helper ||
            object.userData?.decor ||
            // A piece of furniture's doors and drawers (Openables.js).
            object.userData?.opens !== undefined
    );
}

// ---------------------------------------------------------------------
// A tree kept in step with what it is made from
// ---------------------------------------------------------------------

const NO_TRIANGLES = [];

/**
 * A collision tree and what each of its triangles came from, so that an
 * edit costs what it changed and not the whole house: leaving edit mode
 * after moving one chair built Ladonia's 961 thousand furniture triangles
 * into a tree again, 2.3 s with the page frozen.
 *
 * `update(sources)` is given everything the tree is to hold now, in the
 * order `buildOctree` would visit it — a source for each wall, slab, ramp
 * or piece — and looks at each: the meshes it has, the geometry each
 * wears, where each stands. One that is as it was keeps its triangles.
 * The others' are made again, and the tree is mended (`mend`) in the cells
 * they left and the cells they came to: nothing else is touched.
 *
 * The tree is always the tree `buildOctree` would make of the same
 * sources — the same cells, each with the same triangles in the same
 * order (three's tree hands a capsule its triangles in the order its cells
 * list them, and pushes it out of each in turn: another order is another
 * walk, a hair's breadth apart). For that:
 *   - each cell remembers how many triangles it holds (`count`), which is
 *     what decided whether it was divided;
 *   - each triangle knows its source and its place in it, the sources
 *     their order (`rank`): a cell's list is in that order, turned round
 *     at every level down, as three's split leaves it;
 *   - and the tree is built again from scratch whenever the edit changed
 *     the box its cells are cut from, changed the order of sources that
 *     stayed, or changed a third of it.
 *
 * That box is the box round all the sources, to the digit, as
 * `buildOctree` takes it: every cell is cut from it, so the outermost
 * piece nudged, or a chair carried out beyond all the others, leaves every
 * cell to be cut again. (A box with room round it would spare that, and
 * was tried, 2026-10-14: but a cell is divided only while dividing it
 * separates something — `divide` — and furniture in the middle of a box
 * three times its size is halved once and then lies whole in one corner of
 * each half: a tree two levels deep, leaves of eighteen thousand
 * triangles.)
 *
 * Building a big tree again is a quarter of a second, so a caller that
 * need not wait (`slice`) has it built a slice a frame (`step`) and is
 * handed, until it is done, the tree as it was with what has changed put
 * right in it (`meanwhile`): the triangles that went taken out of its
 * cells, those that came in a small tree of their own beside it. That is
 * every piece where it now stands, in other cells than building from
 * scratch gives — walked against for the half second the build takes.
 * Where so much changed that even this would be a long frame
 * (`MEND_AT_ONCE`), the tree is left as it was and the job says so
 * (`job.stale`): nobody may walk against that one, and whoever moves the
 * visitor finishes the build first (World.update).
 */
export class TreeKeeper {
    /** @param {(object: THREE.Object3D) => boolean} [skip]  as buildOctree's */
    constructor(skip = () => false) {
        this.skip = skip;
        /** The box round every source, as two corners: what the tree's cells are cut from (`plant`). */
        this.low = null;
        this.high = null;
        /** The tree to walk against now. */
        this.tree = new SceneOctree();
        /** key → entry: what a source's triangles were made from, and they. */
        this.entries = new Map();
        this.total = 0;
        this.round = 0;
        /**
         * A tree being built a slice at a time (`update` with `slice`,
         * `step`): `tree` is the one before it until it is done — `old`,
         * with what has gone since taken out of it, beside a small tree of
         * what has come (`aside`: those entries); or, `stale`, as it was.
         */
        this.job = null;
        /** What the last update did, for measuring: "same", "mended", "built" or "building" (a slice at a time), how long, and how much changed. */
        this.last = { how: "none", ms: 0, sources: 0, changed: 0, triangles: 0, total: 0, why: "" };
    }

    /**
     * @param {object[]} sources  in order, each `{ key, root }` — an object
     *   and everything under it — or `{ key, stamp, mesh }`: a mesh made
     *   for the asking (`mesh()`, its matrixWorld set; its geometry is
     *   disposed of here) for as long as the numbers in `stamp` stay as
     *   they are.
     * @param {object} [options]
     * @param {boolean} [options.slice]  a big tree that has to be built
     *   again from scratch is not built here but a slice at a time by
     *   `step`, and until it is done the tree returned is the one before
     *   the edit. Without it the tree returned is always the new one.
     * @returns {SceneOctree}  the tree to walk against now
     */
    update(sources, { slice = false } = {}) {
        const started = performance.now();
        const round = ++this.round;
        const entries = this.entries;
        const order = [];
        const come = [];
        const gone = [];
        let ordered = true;
        let before = -1;

        for (const source of sources) {
            const old = entries.get(source.key);
            let entry = old;
            if (!old || !this.same(old, source)) {
                entry = this.make(source);
                entries.set(source.key, entry);
                come.push(entry);
                if (old) {
                    old.dead = true;
                    gone.push(old);
                }
            } else {
                // Among those that stay, the order they were in.
                if (entry.rank < before) ordered = false;
                before = entry.rank;
            }
            entry.round = round;
            order.push(entry);
        }
        for (const [key, entry] of entries) {
            if (entry.round === round) continue;
            entry.dead = true;
            gone.push(entry);
            entries.delete(key);
        }

        const last = (this.last = { how: "same", ms: 0, sources: order.length, changed: come.length + gone.length, triangles: 0, total: this.total, why: "" });
        // (Sources that only changed places are a change too: a cell lists its triangles in their order.)
        if (come.length || gone.length || !ordered) {
            let leaving = 0;
            let coming = 0;
            for (const entry of gone) leaving += entry.triangles.length;
            for (const entry of come) coming += entry.triangles.length;
            const total = this.total - leaving + coming;
            last.triangles = leaving + coming;
            last.total = total;

            const min = [Infinity, Infinity, Infinity];
            const max = [-Infinity, -Infinity, -Infinity];
            for (const entry of order) {
                if (!entry.triangles.length) continue;
                for (let i = 0; i < 3; i++) {
                    if (entry.min[i] < min[i]) min[i] = entry.min[i];
                    if (entry.max[i] > max[i]) max[i] = entry.max[i];
                }
            }
            const boxed = this.total > 0 && total > 0 && this.holds(min, max);
            const few = leaving + coming <= Math.max(this.total, total) * MEND_SHARE;
            // (Many pieces moved since the last time, and no need to wait: not one long mend, but the whole a slice a frame.)
            const long = slice && leaving + coming > MEND_AT_ONCE && total > SLICE_OVER;

            for (let i = 0; i < order.length; i++) order[i].rank = i;
            // (A tree half built is of the sources as they were a moment ago: begun again.)
            const before = this.job;
            const begun = before !== null;
            this.job = null;
            if (boxed && ordered && few && !begun && !long) {
                const out = [];
                const into = [];
                for (const entry of gone) for (const triangle of entry.triangles) out.push(triangle);
                for (const entry of come) for (const triangle of entry.triangles) into.push(triangle);
                this.tree.count = total;
                mend(this.tree, 0, out, into);
                last.how = "mended";
            } else {
                const all = [];
                for (const entry of order) for (const triangle of entry.triangles) all.push(triangle);
                last.why = begun ? "begun" : !this.total || !total ? "empty" : !boxed ? "bounds" : !ordered ? "order" : !few ? "share" : "long";
                if (slice && all.length > SLICE_OVER) {
                    const job = (this.job = before ?? { tree: null, pending: null, old: this.total > 0 ? this.tree : null, aside: new Set(), stale: false });
                    // (Walked against until it is done: the tree as it was, put right — unless that would be the long frame this is to spare.)
                    if (!job.stale && leaving + coming <= MEND_AT_ONCE) this.meanwhile(job, gone, come);
                    else job.stale = true;
                    job.pending = [];
                    job.tree = plant(all, job.pending, min, max);
                    last.how = "building";
                } else {
                    this.tree = plant(all, null, min, max);
                    last.how = "built";
                }
                this.low = min;
                this.high = max;
            }
            this.total = total;
        } else if (this.job && !slice) {
            this.step();
            last.how = "built";
            last.why = "finished";
        } else if (this.job) {
            last.how = "building";
        }
        last.ms = performance.now() - started;
        return this.tree;
    }

    /**
     * Whether the box the tree's cells were cut from does for sources that
     * now lie between `min` and `max`: only while it is their own box to
     * the digit — the tree is then cut exactly as buildOctree cuts it.
     */
    holds(min, max) {
        const { low, high } = this;
        if (!low) return false;
        for (let i = 0; i < 3; i++) if (min[i] !== low[i] || max[i] !== high[i]) return false;
        return true;
    }

    /**
     * The tree to walk against while another is built a slice a frame: the
     * one before (`job.old`, cut from the box before) without the triangles
     * of the sources that have gone since — taken out of its cells as any
     * mend takes them — and, beside it, a small tree of the sources that
     * have come (`job.aside`), built whole: a piece moved is in the second
     * wherever it stands, inside the old box or far outside it. Both under
     * one root, which three's walks and ours go through like any cell's
     * eight.
     */
    meanwhile(job, gone, come) {
        const { old, aside } = job;
        const out = [];
        for (const entry of gone) {
            if (aside.delete(entry)) continue;
            for (const triangle of entry.triangles) out.push(triangle);
        }
        if (old && out.length) {
            old.count -= out.length;
            mend(old, 0, out, NO_TRIANGLES);
        }
        for (const entry of come) aside.add(entry);
        const loose = [];
        for (const entry of aside) for (const triangle of entry.triangles) loose.push(triangle);
        const side = loose.length ? plant(loose) : null;
        if (old && side) {
            const both = new SceneOctree();
            both.subTrees = [old, side];
            both.count = old.count + side.count;
            this.tree = both;
        } else {
            this.tree = old ?? side ?? new SceneOctree();
        }
    }

    /**
     * A tree being built a slice at a time, carried on for about `ms`
     * (all of it without one).
     *
     * @returns {boolean}  whether `tree` is now the new one
     */
    step(ms = Infinity) {
        const job = this.job;
        if (!job) return true;
        const until = performance.now() + ms;
        const pending = job.pending;
        while (pending.length) {
            const level = pending.pop();
            divide(pending.pop(), level, pending);
            if (ms !== Infinity && performance.now() >= until) break;
        }
        if (pending.length) return false;
        this.tree = job.tree;
        this.job = null;
        return true;
    }

    /** Whether a source is as it was when its entry's triangles were made. */
    same(entry, source) {
        if (source.root) {
            if (entry.stamp) return false;
            const meshes = entry.meshes;
            const state = entry.state;
            const skip = this.skip;
            let i = 0;
            const visit = (object) => {
                if (skip(object)) return true;
                if (object.isMesh && object.geometry?.attributes.position) {
                    if (i >= meshes.length || meshes[i] !== object) return false;
                    const geometry = object.geometry;
                    const at = i * 20;
                    if (
                        entry.geometries[i] !== geometry ||
                        state[at + 16] !== geometry.attributes.position.version ||
                        state[at + 17] !== (geometry.index ? geometry.index.version : -1) ||
                        state[at + 18] !== (geometry.index ? geometry.index.count : geometry.attributes.position.count)
                    ) {
                        return false;
                    }
                    const e = object.matrixWorld.elements;
                    for (let k = 0; k < 16; k++) if (state[at + k] !== e[k]) return false;
                    i++;
                }
                const children = object.children;
                for (let k = 0; k < children.length; k++) if (!visit(children[k])) return false;
                return true;
            };
            return visit(source.root) && i === meshes.length;
        }
        const stamp = entry.stamp;
        if (!stamp || stamp.length !== source.stamp.length || entry.label !== source.label) return false;
        for (let i = 0; i < stamp.length; i++) if (stamp[i] !== source.stamp[i]) return false;
        return true;
    }

    /** A source's triangles, and what they were made from. */
    make(source) {
        const entry = { key: source.key, triangles: [], meshes: null, geometries: null, state: null, stamp: null, label: undefined, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], rank: 0, round: 0, dead: false };
        if (source.root) {
            const meshes = (entry.meshes = []);
            const skip = this.skip;
            const visit = (object) => {
                if (skip(object)) return;
                if (object.isMesh && object.geometry?.attributes.position) {
                    meshes.push(object);
                    addMeshTriangles(entry.triangles, object, entry);
                }
                for (const child of object.children) visit(child);
            };
            visit(source.root);
            entry.geometries = meshes.map((mesh) => mesh.geometry);
            const state = (entry.state = new Float64Array(meshes.length * 20));
            meshes.forEach((mesh, i) => {
                const geometry = mesh.geometry;
                state.set(mesh.matrixWorld.elements, i * 20);
                state[i * 20 + 16] = geometry.attributes.position.version;
                state[i * 20 + 17] = geometry.index ? geometry.index.version : -1;
                state[i * 20 + 18] = geometry.index ? geometry.index.count : geometry.attributes.position.count;
            });
        } else {
            entry.stamp = Float64Array.from(source.stamp);
            entry.label = source.label;
            const mesh = source.mesh();
            addMeshTriangles(entry.triangles, mesh, entry);
            mesh.geometry.dispose();
        }
        const { min, max } = entry;
        for (const { a, b, c } of entry.triangles) {
            min[0] = Math.min(min[0], a.x, b.x, c.x);
            min[1] = Math.min(min[1], a.y, b.y, c.y);
            min[2] = Math.min(min[2], a.z, b.z, c.z);
            max[0] = Math.max(max[0], a.x, b.x, c.x);
            max[1] = Math.max(max[1], a.y, b.y, c.y);
            max[2] = Math.max(max[2], a.z, b.z, c.z);
        }
        return entry;
    }

    /** Everything forgotten: the next update builds from scratch. */
    clear() {
        this.entries.clear();
        this.tree = new SceneOctree();
        this.low = null;
        this.high = null;
        this.total = 0;
        this.job = null;
    }
}

/** In the order a tree built from scratch has its triangles in: by source, then by place in it. */
function byPlace(a, b) {
    return a.source.rank - b.source.rank || a.at - b.at;
}

/** Triangles in the order a cell at `depth` lists them: the tree's own order, turned round at each level down. */
function inOrder(triangles, depth) {
    triangles.sort(byPlace);
    if (depth & 1) triangles.reverse();
    return triangles;
}

/** A cell's list without what has gone and with what has come, in its order still. */
function relist(list, come, depth) {
    const kept = [];
    for (let i = 0; i < list.length; i++) if (!list[i].source.dead) kept.push(list[i]);
    if (!come || !come.length) return kept;
    inOrder(come, depth);
    const sign = depth & 1 ? -1 : 1;
    const out = [];
    let i = 0;
    let j = 0;
    while (i < kept.length && j < come.length) {
        if (byPlace(kept[i], come[j]) * sign <= 0) out.push(kept[i++]);
        else out.push(come[j++]);
    }
    while (i < kept.length) out.push(kept[i++]);
    while (j < come.length) out.push(come[j++]);
    return out;
}

/** Every triangle under a divided cell that has not gone, each once: what its own list would be, had it not been divided. */
function gather(node, depth) {
    const seen = new Set();
    const visit = (tree) => {
        for (const triangle of tree.triangles) if (!triangle.source.dead) seen.add(triangle);
        for (const sub of tree.subTrees) visit(sub);
    };
    visit(node);
    return inOrder([...seen], depth);
}

/** Triangles by which of the framed cell's eight each touches. */
function spread(triangles) {
    const by = [null, null, null, null, null, null, null, null];
    for (let i = 0; i < triangles.length; i++) {
        let mask = touched(triangles[i]);
        for (let octant = 0; mask !== 0; octant++, mask >>= 1) {
            if (mask & 1) (by[octant] ??= []).push(triangles[i]);
        }
    }
    return by;
}

/**
 * A divided cell after an edit: `gone` are the triangles that were in it
 * and are in the tree no more (their sources are marked dead), `come` those
 * new to it; its `count` is already what it holds now. Each of its eight
 * is left alone, mended in its turn, made, emptied, divided or gathered
 * back into one list — whichever building the tree from scratch would have
 * come to, by the rule that divides a cell (`divide`): more than eight
 * triangles, fewer than its parent, and room to halve.
 */
function mend(node, level, gone, come) {
    frame(node.box);
    const total = node.count;
    const small = Math.min(_hx, _hy, _hz) < SceneOctree.MIN_CELL;
    const out = spread(gone);
    const into = spread(come);
    const old = [null, null, null, null, null, null, null, null];
    for (const sub of node.subTrees) old[sub.octant] = sub;

    const next = [];
    // (Dividing or mending a child frames another cell: after this one's are all seen to.)
    const later = [];
    for (let octant = 0; octant < 8; octant++) {
        let child = old[octant];
        const leaving = out[octant];
        const coming = into[octant];
        if (!child && !coming) continue;
        const count = (child ? child.count : 0) - (leaving ? leaving.length : 0) + (coming ? coming.length : 0);
        if (count === 0) continue;
        const divided = child ? child.triangles.length === 0 : false;
        const divides = count > 8 && level < 16 && !small && count < total;

        if (!leaving && !coming) {
            // Nothing of it changed — but its parent's count is what it was divided by.
            if (divides && !divided) later.push(child, null, null);
            else if (!divides && divided) {
                child.triangles = gather(child, level + 1);
                child.subTrees = [];
            }
        } else if (!child) {
            child = cell(octant);
            child.triangles = inOrder(coming, level + 1);
            child.count = count;
            if (divides) later.push(child, null, null);
        } else if (!divided) {
            child.triangles = relist(child.triangles, coming, level + 1);
            child.count = count;
            if (divides) later.push(child, null, null);
        } else if (divides) {
            child.count = count;
            later.push(child, leaving ?? NO_TRIANGLES, coming ?? NO_TRIANGLES);
        } else {
            child.triangles = relist(gather(child, level + 1), coming, level + 1);
            child.subTrees = [];
            child.count = count;
        }
        next.push(child);
    }
    node.subTrees = next;

    for (let i = 0; i < later.length; i += 3) {
        const child = later[i];
        if (later[i + 1]) mend(child, level + 1, later[i + 1], later[i + 2]);
        else child.split(level + 1);
    }
}

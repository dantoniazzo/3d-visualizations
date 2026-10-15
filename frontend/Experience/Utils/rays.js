import * as THREE from "three";

/**
 * Rays through the scene, answered as three's Raycaster answers them — the
 * same hits, in the same order, each with the same numbers — without
 * asking every mesh and every triangle each time.
 *
 * `raycaster.intersectObjects(roots, true)` goes to every object under its
 * roots, and in each mesh whose sphere the ray touches to every triangle.
 * In a big house that is the crosshair's 5 to 7 ms of every walking frame
 * (four fifths of it the terrain's fifty thousand triangles, whose sphere
 * holds the visitor wherever they stand), 2 to 5 for the camera's boom, and
 * 60 to 130 for each step of a dragged piece, which looks down five rays at
 * a time for what it stands on.
 *
 * `rays.cast(raycaster, roots)` gives the same answer from two indexes:
 *
 *   - **the scene's**: each child of a root — a wall, a room, a flight, a
 *     piece of furniture, a car — is a *unit* with a box round it in the
 *     world, and only the units whose box the ray passes within its reach
 *     are gone into. They are gone into as three goes into them — the same
 *     walk down the same children, the same test of layers, each object's
 *     own `raycast` — and in three's order, so the hits are found in the
 *     order three finds them and sort the same;
 *   - **a mesh's**: a mesh of many triangles is asked through a tree of its
 *     geometry's triangles (one a geometry, made the first time a ray
 *     reaches it): three's own test of the mesh's sphere and box, to the
 *     letter, and then three's own test of each triangle
 *     (`Mesh._computeIntersections`, by way of the geometry's draw range)
 *     for the runs of triangles the tree finds along the ray, in the
 *     geometry's order. Nothing of three's triangle arithmetic is copied
 *     here, so a hit's point, distance, face, uv and normal are three's.
 *
 * **Kept in step by looking, not by being told.** Before a ray is cast the
 * roots are looked over: a root's children are the ones it had, each
 * unit's children too, each unit stands where it stood (`matrixWorld`, as
 * three's own test reads it), and what moves by itself inside one — a
 * door's leaf, a cupboard's door, a car's wheels — likewise. A unit that
 * differs has its box taken again. That is a few tens of microseconds for
 * Ladonia's eleven hundred units, and nothing an edit does by any path can
 * go unseen by it but a change deep inside a unit that moves nothing and
 * swaps no child of its root: for those, `rays.touch()` has every unit
 * looked through again before the next ray (World and the Editor call it
 * whenever the scene is edited, a finish changes, or furniture arrives).
 *
 * Anything that is not a plain Mesh — a line, a sprite, an instanced or
 * skinned mesh, an object with a `raycast` of its own — is left to its own
 * `raycast`, and a unit holding one is always gone into.
 */

/** A mesh of this many triangles or more is asked through its tree; fewer, three asks them all as quickly. */
const MANY = 96;
/** How many triangles a leaf of a mesh's tree holds at most. */
const LEAF = 12;
/** Slack round a unit's box and a ray's reach, as a share of their size and in metres: rounding is a billion times less. */
const SLACK = 1e-6;

const MESH_RAYCAST = THREE.Mesh.prototype.raycast;
const NO_RAYCAST = THREE.Object3D.prototype.raycast;
/** three's own test of a mesh's triangles, given the ray in the mesh's space: there in r163. Without it, three's whole `raycast` is used. */
const CAN_RANGE = typeof THREE.Mesh.prototype._computeIntersections === "function";

const EMPTY = 0;
const BOXED = 1;
const OPEN = 2;

const _sphere = new THREE.Sphere();
const _ray = new THREE.Ray();
const _sphereHitAt = new THREE.Vector3();
const _inverse = new THREE.Matrix4();
const _box = new THREE.Box3();
let _found = new Uint32Array(1024);
const _stack = new Int32Array(128);

function ascending(a, b) {
    return a.distance - b.distance;
}

// ---------------------------------------------------------------------
// A geometry's triangles, in a tree
// ---------------------------------------------------------------------

/** geometry → its tree, or false where it cannot have one */
const trees = new WeakMap();
/** geometry → the box round its positions, where it has none of its own */
const boxes = new WeakMap();

function versionOf(attribute) {
    return attribute.isInterleavedBufferAttribute ? attribute.data.version : attribute.version;
}

/**
 * A geometry's triangles in a tree of boxes, in the geometry's own space:
 * `order` lists the triangles leaf by leaf, `links` a node's two children
 * or, for a leaf, where its triangles start in `order` and how many.
 */
class TriangleTree {
    constructor(geometry) {
        const position = geometry.attributes.position;
        const index = geometry.index;
        this.position = position;
        this.index = index;
        this.positionVersion = versionOf(position);
        this.indexVersion = index ? index.version : -1;
        this.total = index ? index.count : position.count;
        const count = (this.count = Math.floor(this.total / 3));

        const lo = new Float64Array(count * 3);
        const hi = new Float64Array(count * 3);
        for (let t = 0; t < count; t++) {
            let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
            for (let k = 0; k < 3; k++) {
                const v = index ? index.getX(t * 3 + k) : t * 3 + k;
                const x = position.getX(v);
                const y = position.getY(v);
                const z = position.getZ(v);
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
                if (z < z0) z0 = z;
                if (z > z1) z1 = z;
            }
            lo[t * 3] = x0;
            lo[t * 3 + 1] = y0;
            lo[t * 3 + 2] = z0;
            hi[t * 3] = x1;
            hi[t * 3 + 1] = y1;
            hi[t * 3 + 2] = z1;
        }

        const order = (this.order = new Uint32Array(count));
        for (let t = 0; t < count; t++) order[t] = t;
        const nodeBoxes = [];
        const links = [];
        /** How deep it goes: `along` walks it on a stack of its own. */
        this.depth = 0;
        const grow = (start, end, depth = 1) => {
            const node = links.length / 2;
            links.push(0, 0);
            if (depth > this.depth) this.depth = depth;
            let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
            let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
            for (let i = start; i < end; i++) {
                const t = order[i] * 3;
                if (lo[t] < x0) x0 = lo[t];
                if (hi[t] > x1) x1 = hi[t];
                if (lo[t + 1] < y0) y0 = lo[t + 1];
                if (hi[t + 1] > y1) y1 = hi[t + 1];
                if (lo[t + 2] < z0) z0 = lo[t + 2];
                if (hi[t + 2] > z1) z1 = hi[t + 2];
                const cx = lo[t] + hi[t];
                const cy = lo[t + 1] + hi[t + 1];
                const cz = lo[t + 2] + hi[t + 2];
                if (cx < cx0) cx0 = cx;
                if (cx > cx1) cx1 = cx;
                if (cy < cy0) cy0 = cy;
                if (cy > cy1) cy1 = cy;
                if (cz < cz0) cz0 = cz;
                if (cz > cz1) cz1 = cz;
            }
            // A little wider than its triangles: the boxes are kept as 32-bit floats, and a ray along a face is still in.
            const pad =
                1e-5 * Math.max(x1 - x0, y1 - y0, z1 - z0) +
                SLACK * Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1), Math.abs(z0), Math.abs(z1)) +
                1e-7;
            nodeBoxes.push(x0 - pad, y0 - pad, z0 - pad, x1 + pad, y1 + pad, z1 + pad);

            if (end - start <= LEAF) {
                links[node * 2] = -(start + 1);
                links[node * 2 + 1] = end - start;
                return node;
            }
            // Halved across the longest way its triangles' middles are spread.
            const dx = cx1 - cx0;
            const dy = cy1 - cy0;
            const dz = cz1 - cz0;
            const axis = dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2;
            const middle = axis === 0 ? cx0 + cx1 : axis === 1 ? cy0 + cy1 : cz0 + cz1;
            let i = start;
            let j = end - 1;
            while (i <= j) {
                const t = order[i] * 3 + axis;
                if ((lo[t] + hi[t]) * 2 < middle) i++;
                else {
                    const swap = order[i];
                    order[i] = order[j];
                    order[j] = swap;
                    j--;
                }
            }
            // All in one place: halved as they come.
            const cut = i === start || i === end ? (start + end) >> 1 : i;
            const left = grow(start, cut, depth + 1);
            const right = grow(cut, end, depth + 1);
            links[node * 2] = left;
            links[node * 2 + 1] = right;
            return node;
        };
        if (count > 0) grow(0, count);
        this.boxes = new Float32Array(nodeBoxes);
        this.links = new Int32Array(links);
    }

    /** Whether the geometry is still the one this was made of. */
    current(geometry) {
        const position = geometry.attributes.position;
        const index = geometry.index;
        return (
            position === this.position &&
            index === this.index &&
            versionOf(position) === this.positionVersion &&
            (index ? index.version : -1) === this.indexVersion &&
            (index ? index.count : position.count) === this.total
        );
    }

    /**
     * The triangles in the leaves a ray crosses between `t0` and `t1` along
     * it, into `_found`, lowest first; returns how many.
     */
    along(ray, t0, t1) {
        const boxes = this.boxes;
        const links = this.links;
        const order = this.order;
        if (!links.length) return 0;
        const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
        const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
        const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
        let found = 0;
        let top = 0;
        _stack[top++] = 0;
        while (top > 0) {
            const node = _stack[--top];
            const b = node * 6;
            let near = t0;
            let far = t1;
            if (dx !== 0) {
                let a = (boxes[b] - ox) * ix;
                let z = (boxes[b + 3] - ox) * ix;
                if (a > z) { const s = a; a = z; z = s; }
                if (a > near) near = a;
                if (z < far) far = z;
                if (near > far) continue;
            } else if (ox < boxes[b] || ox > boxes[b + 3]) continue;
            if (dy !== 0) {
                let a = (boxes[b + 1] - oy) * iy;
                let z = (boxes[b + 4] - oy) * iy;
                if (a > z) { const s = a; a = z; z = s; }
                if (a > near) near = a;
                if (z < far) far = z;
                if (near > far) continue;
            } else if (oy < boxes[b + 1] || oy > boxes[b + 4]) continue;
            if (dz !== 0) {
                let a = (boxes[b + 2] - oz) * iz;
                let z = (boxes[b + 5] - oz) * iz;
                if (a > z) { const s = a; a = z; z = s; }
                if (a > near) near = a;
                if (z < far) far = z;
                if (near > far) continue;
            } else if (oz < boxes[b + 2] || oz > boxes[b + 5]) continue;

            const left = links[node * 2];
            if (left < 0) {
                const start = -left - 1;
                const n = links[node * 2 + 1];
                if (found + n > _found.length) {
                    const wider = new Uint32Array(Math.max(_found.length * 2, found + n));
                    wider.set(_found);
                    _found = wider;
                }
                for (let i = 0; i < n; i++) _found[found++] = order[start + i];
            } else {
                _stack[top++] = left;
                _stack[top++] = links[node * 2 + 1];
            }
        }
        if (found > 1) _found.subarray(0, found).sort();
        return found;
    }
}

/** A geometry's tree, made when first asked for and again when the geometry has changed; null where it has no triangles to index. */
function treeOf(geometry) {
    let tree = trees.get(geometry);
    if (tree && tree.current(geometry)) return tree;
    tree = new TriangleTree(geometry);
    trees.set(geometry, tree);
    rays.stats.trees++;
    return tree;
}

/** Whether a mesh's material groups run through its triangles in order, whole triangles each: then triangles in order are three's order. */
function groupsInOrder(groups, total) {
    let end = 0;
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (group.start % 3 !== 0 || group.count % 3 !== 0 || group.start < end) return false;
        end = group.start + group.count;
    }
    return end <= total || groups.length === 0;
}

/**
 * One plain mesh against a ray, as `mesh.raycast(raycaster, intersects)`:
 * three's own for a mesh of few triangles; for one of many, three's test of
 * its sphere and box, to the letter, and then three's test of the
 * triangles its tree finds along the ray, in the geometry's order.
 */
function meshRay(mesh, raycaster, intersects) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    if (!CAN_RANGE || position === undefined) return mesh.raycast(raycaster, intersects);
    const index = geometry.index;
    const total = index !== null ? index.count : position.count;
    const range = geometry.drawRange;
    if (
        total < MANY * 3 ||
        total % 3 !== 0 ||
        range.start !== 0 ||
        range.count < total ||
        geometry.morphAttributes.position ||
        (Array.isArray(mesh.material) && !groupsInOrder(geometry.groups, total))
    ) {
        return mesh.raycast(raycaster, intersects);
    }

    // As Mesh.raycast, from here to the triangles.
    const matrixWorld = mesh.matrixWorld;
    if (mesh.material === undefined) return;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere.copy(geometry.boundingSphere);
    _sphere.applyMatrix4(matrixWorld);
    _ray.copy(raycaster.ray).recast(raycaster.near);
    if (_sphere.containsPoint(_ray.origin) === false) {
        if (_ray.intersectSphere(_sphere, _sphereHitAt) === null) return;
        if (_ray.origin.distanceToSquared(_sphereHitAt) > (raycaster.far - raycaster.near) ** 2) return;
    }
    _inverse.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverse);
    if (geometry.boundingBox !== null) {
        if (_ray.intersectsBox(geometry.boundingBox) === false) return;
    }

    // How far along the ray in the mesh's space the raycaster's reach is: a step of one there is `stretch` in the world.
    const d = _ray.direction;
    const e = matrixWorld.elements;
    const stretch = Math.hypot(e[0] * d.x + e[4] * d.y + e[8] * d.z, e[1] * d.x + e[5] * d.y + e[9] * d.z, e[2] * d.x + e[6] * d.y + e[10] * d.z);
    if (!(stretch > 0) || !Number.isFinite(stretch)) return mesh._computeIntersections(raycaster, intersects, _ray);
    const tree = treeOf(geometry);
    // (Triangles piled so unevenly that the tree is deeper than the stack it is walked on: all of them, as three would.)
    if (tree.depth > _stack.length - 2) return mesh._computeIntersections(raycaster, intersects, _ray);
    const t0 = (raycaster.near / stretch) * (1 - SLACK) - SLACK;
    const t1 = (raycaster.far / stretch) * (1 + SLACK) + SLACK;
    const found = tree.along(_ray, t0, t1);
    if (found === 0) return;
    rays.stats.triangles += found;

    // Each run of triangles that follow one another, three's own loop over that stretch of the geometry.
    const start = range.start;
    const count = range.count;
    try {
        let first = _found[0];
        let last = first;
        for (let i = 1; i <= found; i++) {
            const t = i < found ? _found[i] : -1;
            if (t === last + 1) {
                last = t;
                continue;
            }
            range.start = first * 3;
            range.count = (last - first + 1) * 3;
            mesh._computeIntersections(raycaster, intersects, _ray);
            first = last = t;
        }
    } finally {
        range.start = start;
        range.count = count;
    }
}

/** One object against a ray, as three's own walk does it: its `raycast`, if the ray looks at its layers. */
function strike(object, raycaster, intersects) {
    if (!object.layers.test(raycaster.layers)) return;
    const raycast = object.raycast;
    if (raycast === NO_RAYCAST) return;
    if (raycast === MESH_RAYCAST) meshRay(object, raycaster, intersects);
    else object.raycast(raycaster, intersects);
}

/** An object and everything under it, in three's order. */
function visit(object, raycaster, intersects) {
    strike(object, raycaster, intersects);
    const children = object.children;
    for (let i = 0, l = children.length; i < l; i++) visit(children[i], raycaster, intersects);
}

// ---------------------------------------------------------------------
// The scene's units
// ---------------------------------------------------------------------

/** What moves by itself inside a unit, so that where it stands is looked at with the unit's own place: a door's hinge and leaf, a piece's door or drawer. */
function movesAlone(object) {
    const data = object.userData;
    return data.doorLeaf === true || data.hingeSide !== undefined || data.opens !== undefined;
}

/** A root handed to `cast`: its children are the units. */
class Target {
    constructor(object) {
        this.object = object;
        this.units = [];
        /** Each unit's children, as they were. */
        this.kids = [];
        /** Each unit's movers, and where each stood (16 numbers a mover). */
        this.movers = [];
        this.moved = [];
        this.matrices = new Float64Array(0);
        this.boxes = new Float64Array(0);
        this.states = new Uint8Array(0);
        this.epoch = 0;
    }
}

class SceneRays {
    constructor() {
        this.targets = new WeakMap();
        this.epoch = 1;
        /** What it has done since the page opened, for measuring. */
        this.stats = { casts: 0, looks: 0, lists: 0, scans: 0, units: 0, entered: 0, trees: 0, triangles: 0 };
    }

    /** Every unit to be looked through again before the next ray: something changed that a unit's root may not show. */
    touch() {
        this.epoch++;
    }

    /**
     * As `raycaster.intersectObjects(roots, true, intersects)`.
     *
     * @param {THREE.Raycaster} raycaster
     * @param {THREE.Object3D[]} roots
     * @param {object[]} [intersects]
     * @returns {object[]}  the hits, nearest first
     */
    cast(raycaster, roots, intersects = []) {
        return this.through(raycaster, this.hold(roots), intersects);
    }

    /**
     * The roots looked over once, for several rays cast one after the
     * other with nothing moved between them (`through`).
     */
    hold(roots) {
        const held = [];
        for (let i = 0; i < roots.length; i++) {
            const object = roots[i];
            let target = this.targets.get(object);
            if (!target) {
                target = new Target(object);
                this.targets.set(object, target);
            }
            this.look(target);
            held.push(target);
        }
        return held;
    }

    /** A ray through roots already looked over (`hold`). */
    through(raycaster, held, intersects = []) {
        this.stats.casts++;
        const ray = raycaster.ray;
        const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
        const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
        const length = Math.hypot(dx, dy, dz);
        // (A ray with no direction, or numbers that are none: every unit, as three would.)
        const all = !(length > 0) || !Number.isFinite(length) || !Number.isFinite(ox + oy + oz);
        const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
        const t0 = (raycaster.near / length) * (1 - SLACK) - SLACK;
        const t1 = (raycaster.far / length) * (1 + SLACK) + SLACK;

        for (let h = 0; h < held.length; h++) {
            const target = held[h];
            strike(target.object, raycaster, intersects);
            const units = target.units;
            const states = target.states;
            const boxes = target.boxes;
            for (let i = 0; i < units.length; i++) {
                const state = states[i];
                if (state === EMPTY) continue;
                if (state === BOXED && !all) {
                    const b = i * 6;
                    let near = t0;
                    let far = t1;
                    if (dx !== 0) {
                        let a = (boxes[b] - ox) * ix;
                        let z = (boxes[b + 3] - ox) * ix;
                        if (a > z) { const s = a; a = z; z = s; }
                        if (a > near) near = a;
                        if (z < far) far = z;
                        if (near > far) continue;
                    } else if (ox < boxes[b] || ox > boxes[b + 3]) continue;
                    if (dy !== 0) {
                        let a = (boxes[b + 1] - oy) * iy;
                        let z = (boxes[b + 4] - oy) * iy;
                        if (a > z) { const s = a; a = z; z = s; }
                        if (a > near) near = a;
                        if (z < far) far = z;
                        if (near > far) continue;
                    } else if (oy < boxes[b + 1] || oy > boxes[b + 4]) continue;
                    if (dz !== 0) {
                        let a = (boxes[b + 2] - oz) * iz;
                        let z = (boxes[b + 5] - oz) * iz;
                        if (a > z) { const s = a; a = z; z = s; }
                        if (a > near) near = a;
                        if (z < far) far = z;
                        if (near > far) continue;
                    } else if (oz < boxes[b + 2] || oz > boxes[b + 5]) continue;
                }
                this.stats.entered++;
                visit(units[i], raycaster, intersects);
            }
        }
        intersects.sort(ascending);
        return intersects;
    }

    /**
     * As `raycaster.intersectObject(object, true, intersects)`, for one
     * object that is no root of units — a single piece: three's walk, with
     * a big mesh asked through its tree.
     */
    into(raycaster, object, intersects = []) {
        visit(object, raycaster, intersects);
        intersects.sort(ascending);
        return intersects;
    }

    /** A root as it is now: its units the children it has, each with a box that holds it where it stands. */
    look(target) {
        this.stats.looks++;
        const children = target.object.children;
        const units = target.units;
        let same = children.length === units.length;
        for (let i = 0; same && i < units.length; i++) same = units[i] === children[i];
        if (!same) {
            this.stats.lists++;
            const n = children.length;
            target.units = children.slice();
            target.kids = new Array(n).fill(null);
            target.movers = new Array(n).fill(null);
            target.moved = new Array(n).fill(null);
            target.matrices = new Float64Array(n * 16);
            target.boxes = new Float64Array(n * 6);
            target.states = new Uint8Array(n);
            target.epoch = 0;
        }
        const all = target.epoch !== this.epoch;
        target.epoch = this.epoch;
        const list = target.units;
        const matrices = target.matrices;
        for (let i = 0; i < list.length; i++) {
            if (all) {
                this.scan(target, i);
                continue;
            }
            const unit = list[i];
            const e = unit.matrixWorld.elements;
            const m = i * 16;
            if (
                e[12] !== matrices[m + 12] || e[13] !== matrices[m + 13] || e[14] !== matrices[m + 14] ||
                e[0] !== matrices[m] || e[1] !== matrices[m + 1] || e[2] !== matrices[m + 2] ||
                e[4] !== matrices[m + 4] || e[5] !== matrices[m + 5] || e[6] !== matrices[m + 6] ||
                e[8] !== matrices[m + 8] || e[9] !== matrices[m + 9] || e[10] !== matrices[m + 10] ||
                e[3] !== matrices[m + 3] || e[7] !== matrices[m + 7] || e[11] !== matrices[m + 11] || e[15] !== matrices[m + 15]
            ) {
                this.scan(target, i);
                continue;
            }
            const kids = target.kids[i];
            const now = unit.children;
            let fresh = kids.length === now.length;
            for (let k = 0; fresh && k < kids.length; k++) fresh = kids[k] === now[k];
            const movers = target.movers[i];
            if (fresh && movers) {
                const moved = target.moved[i];
                for (let j = 0; fresh && j < movers.length; j++) {
                    const at = movers[j].matrixWorld.elements;
                    const o = j * 16;
                    for (let k = 0; k < 16; k++) {
                        if (at[k] !== moved[o + k]) {
                            fresh = false;
                            break;
                        }
                    }
                }
            }
            if (!fresh) this.scan(target, i);
        }
    }

    /** One unit looked through: the box round its meshes where they stand, what moves by itself in it, and whether a ray must always go into it. */
    scan(target, i) {
        this.stats.scans++;
        const unit = target.units[i];
        target.matrices.set(unit.matrixWorld.elements, i * 16);
        target.kids[i] = unit.children.slice();

        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        let state = EMPTY;
        const movers = [];
        // A car is looked at part by part: its wheels turn, its doors open, and nothing says which parts those are.
        const loose = unit.userData.kind === "car";
        const walk = (object) => {
            if (object !== unit && (loose || movesAlone(object))) movers.push(object);
            const raycast = object.raycast;
            if (raycast === MESH_RAYCAST && !object.geometry.morphAttributes?.position) {
                const geometry = object.geometry;
                let box = geometry.boundingBox;
                if (box === null) {
                    // three asks such a mesh by its sphere alone; the box is for this index only, and is not given to the geometry.
                    const position = geometry.attributes.position;
                    const kept = boxes.get(geometry);
                    if (kept && kept.position === position && kept.version === (position ? versionOf(position) : -1)) box = kept.box;
                    else {
                        box = position ? new THREE.Box3().setFromBufferAttribute(position) : new THREE.Box3();
                        boxes.set(geometry, { box, position, version: position ? versionOf(position) : -1 });
                    }
                }
                if (!box.isEmpty()) {
                    _box.copy(box).applyMatrix4(object.matrixWorld);
                    if (_box.min.x < x0) x0 = _box.min.x;
                    if (_box.min.y < y0) y0 = _box.min.y;
                    if (_box.min.z < z0) z0 = _box.min.z;
                    if (_box.max.x > x1) x1 = _box.max.x;
                    if (_box.max.y > y1) y1 = _box.max.y;
                    if (_box.max.z > z1) z1 = _box.max.z;
                    if (state === EMPTY) state = BOXED;
                }
            } else if (raycast !== NO_RAYCAST) {
                state = OPEN;
            }
            const children = object.children;
            for (let k = 0; k < children.length; k++) walk(children[k]);
        };
        walk(unit);

        // (A box with a number that is none holds nothing a comparison can find: always gone into.)
        if (state === BOXED && !Number.isFinite(x0 + y0 + z0 + x1 + y1 + z1)) state = OPEN;
        const pad = state === BOXED ? SLACK * Math.max(Math.abs(x0), Math.abs(y0), Math.abs(z0), Math.abs(x1), Math.abs(y1), Math.abs(z1), 1) : 0;
        const b = i * 6;
        const out = target.boxes;
        out[b] = x0 - pad;
        out[b + 1] = y0 - pad;
        out[b + 2] = z0 - pad;
        out[b + 3] = x1 + pad;
        out[b + 4] = y1 + pad;
        out[b + 5] = z1 + pad;
        target.states[i] = state;
        if (movers.length) {
            const moved = new Float64Array(movers.length * 16);
            for (let j = 0; j < movers.length; j++) moved.set(movers[j].matrixWorld.elements, j * 16);
            target.movers[i] = movers;
            target.moved[i] = moved;
        } else {
            target.movers[i] = null;
            target.moved[i] = null;
        }
    }
}

/** The one index every ray of the app is answered from: the same roots are asked by the crosshair, the camera, a click and a dragged piece. */
export const rays = new SceneRays();
export default rays;

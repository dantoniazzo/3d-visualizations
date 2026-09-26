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
 * is small and is rebuilt whenever the visitor returns to the walkthrough
 * after an edit.
 *
 * Both answer the same two questions three's Octree does, so this object
 * stands in for one anywhere an octree was passed before.
 */

const _capsule = new Capsule();
const _shift = new THREE.Vector3();
const _half = new THREE.Vector3();
const _corner = new THREE.Vector3();

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
 */
class SceneOctree extends Octree {
    static MIN_CELL = 0.25;

    split(level) {
        if (!this.box) return this;

        const parentCount = this.triangles.length;
        _half.copy(this.box.max).sub(this.box.min).multiplyScalar(0.5);
        const subTrees = [];

        for (let x = 0; x < 2; x++) {
            for (let y = 0; y < 2; y++) {
                for (let z = 0; z < 2; z++) {
                    const box = new THREE.Box3();
                    _corner.set(x, y, z).multiply(_half);
                    box.min.copy(this.box.min).add(_corner);
                    box.max.copy(box.min).add(_half);
                    subTrees.push(new SceneOctree(box));
                }
            }
        }

        let triangle;
        while ((triangle = this.triangles.pop())) {
            for (const sub of subTrees) {
                if (sub.box.intersectsTriangle(triangle)) sub.triangles.push(triangle);
            }
        }

        const small = Math.min(_half.x, _half.y, _half.z) < SceneOctree.MIN_CELL;
        for (const sub of subTrees) {
            const count = sub.triangles.length;
            if (count > 8 && level < 16 && !small && count < parentCount) sub.split(level + 1);
            if (count !== 0) this.subTrees.push(sub);
        }
        return this;
    }
}

export default class Collision {
    constructor() {
        this.static = new SceneOctree();
        this.dynamic = new SceneOctree();
    }

    setStatic(octree) {
        this.static = octree;
    }

    setDynamic(octree) {
        this.dynamic = octree;
    }

    /**
     * Resolve against the building first, then against whatever the
     * building's push left the capsule touching, and report the sum.
     */
    capsuleIntersect(capsule) {
        const a = this.static.capsuleIntersect(capsule);

        _capsule.copy(capsule);
        if (a) _capsule.translate(_shift.copy(a.normal).multiplyScalar(a.depth));

        const b = this.dynamic.capsuleIntersect(_capsule);
        if (!a && !b) return false;
        if (!b) return a;

        const total = new THREE.Vector3();
        if (a) total.addScaledVector(a.normal, a.depth);
        total.addScaledVector(b.normal, b.depth);

        const depth = total.length();
        if (depth < 1e-9) return { normal: b.normal, depth: 0 };
        return { normal: total.divideScalar(depth), depth };
    }

    rayIntersect(ray) {
        const a = this.static.rayIntersect(ray);
        const b = this.dynamic.rayIntersect(ray);
        if (!a) return b;
        if (!b) return a;
        return a.distance <= b.distance ? a : b;
    }
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
    const octree = new SceneOctree();
    let count = 0;

    const visit = (object) => {
        if (skip(object)) return;

        if (object.isMesh && object.geometry?.attributes.position) {
            count += addMeshTriangles(octree, object);
        }
        for (const child of object.children) visit(child);
    };

    for (const root of roots) {
        if (!root) continue;
        root.updateWorldMatrix(true, true);
        visit(root);
    }

    // An empty tree would split a box of infinities; leave it bare instead.
    if (count > 0) octree.build();
    return octree;
}

/**
 * A mesh's triangles, in world space. A mesh that says what it is
 * (`userData.label`, as a published runtime file's do) passes that on to
 * each, for a ray to report what it hit.
 */
function addMeshTriangles(octree, mesh) {
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
        const triangle = new THREE.Triangle(a, b, c);
        if (label) triangle.label = label;
        octree.addTriangle(triangle);
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
 * The skip rule every scene octree shares: door leaves, which swing; the
 * editor's helpers, which are not really there; and decorative joinery —
 * skirting, casings, spindles — which is drawn but walked past.
 */
export function isTransient(object) {
    return Boolean(
        object.userData?.kind === "door" ||
            object.userData?.doorLeaf ||
            object.userData?.helper ||
            object.userData?.decor
    );
}

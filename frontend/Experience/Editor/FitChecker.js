import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";

import { buildOctree, collectTriangles, isTransient } from "../World/Collision.js";

/**
 * Does a piece fit where the editor wants to put it?
 *
 * A piece is described by one or more oriented boxes ("hulls"): a sofa is
 * one, a flight of stairs is one per tread, a floor opening is the column
 * of air above it that has to stay clear. Each hull is tested against:
 *
 *   - the building. Walls, roofs and window frames of a generated shell are
 *     boxes and are tested box-against-box; slabs, gables and ground are
 *     tested triangle by triangle. An imported building goes through an
 *     octree of its own triangles.
 *   - every other piece, triangle by triangle, so a stool can go under a
 *     table's overhang and a microwave can stand on a worktop.
 *
 * Hulls are shrunk by a centimetre and a half before testing, so pieces
 * standing on a floor or pushed flush against a wall — the positions
 * snapping produces — count as fitting rather than as touching.
 *
 * `against` narrows what a hull is tested with: "all" (default), "noslab"
 * (skip floors and ceilings — the clear column above a floor opening), or
 * "static" (the building only — a stair's headroom). `slabsBelow` keeps
 * only the slabs under a height: a flight must stand on its floor, but
 * the slabs it rises through are its opening's business.
 */

export const EPSILON = 0.015;

const _matrix = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _box = new THREE.Box3();
const _triangle = new THREE.Triangle();
const _normal = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _obb = new OBB();
const _meshBox = new THREE.Box3();
const _hullBox = new THREE.Box3();
const _body = new OBB();

const SLAB_KINDS = new Set(["floor", "ceiling", "ground"]);

export default class FitChecker {
    constructor(editor) {
        this.editor = editor;
        this.builder = editor.builder;
        this.staticEntries = null;
        this.modelOctree = null;
        this.scratch = new Float32Array(0);
    }

    /** The building changed (a wall was rebuilt, a slab re-cut). */
    invalidate() {
        this.staticEntries = null;
    }

    // ------------------------------------------------------------------
    // Hulls
    // ------------------------------------------------------------------

    /** Precompute what every test needs from a hull. */
    prepare(hull) {
        const half = hull.half.clone().subScalar(EPSILON).max(new THREE.Vector3(0.002, 0.002, 0.002));
        const matrix = new THREE.Matrix4().compose(hull.center, hull.quat, new THREE.Vector3(1, 1, 1));
        const inverse = matrix.clone().invert();
        const obb = new OBB(hull.center.clone(), half.clone(), new THREE.Matrix3().setFromMatrix4(matrix));

        const box = new THREE.Box3();
        for (const sx of [-1, 1]) {
            for (const sy of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    box.expandByPoint(_corner.set(sx * half.x, sy * half.y, sz * half.z).applyMatrix4(matrix));
                }
            }
        }
        return { ...hull, half, matrix, inverse, obb, box, against: hull.against || "all" };
    }

    // ------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------

    /**
     * @param {object[]} hulls
     * @param {{ exclude?: Set, ignore?: Set }} options  editables to leave
     *   out, and obstacle keys to disregard.
     * @returns {{ ok: boolean, blocker?: { key, label } }}
     */
    test(hulls, { exclude = new Set(), ignore = new Set() } = {}) {
        for (const hull of hulls.map((h) => this.prepare(h))) {
            const hit =
                this.hitStatic(hull, ignore) ||
                (hull.against !== "static" && this.hitEditables(hull, exclude, ignore));
            if (hit) return { ok: false, blocker: hull.reason ? { ...hit, reason: hull.reason } : hit };
        }
        return { ok: true };
    }

    /**
     * Whether a set of hulls would take the space the visitor is standing
     * in: a piece put down on top of them would trap them when the collision
     * is rebuilt. They are there in edit mode as much as in the walkthrough —
     * they can walk in either. The capsule is taken as the box round it.
     */
    hitsVisitor(hulls) {
        const player = this.editor.world.player;
        const collider = player && !player.inVehicle && player.player.collider;
        if (!collider) return false;
        const r = collider.radius;
        _body.center.copy(collider.start).add(collider.end).multiplyScalar(0.5);
        _body.halfSize.set(r, (collider.end.y - collider.start.y) / 2 + r, r);
        _body.rotation.identity();
        return hulls.some((hull) => this.prepare(hull).obb.intersectsOBB(_body));
    }

    /**
     * The other pieces a set of hulls already overlaps. A Blender-made
     * kitchen has its hob sunk into the island and its oven built into the
     * tall unit, on purpose; those overlaps are carried through a move
     * rather than counted against it. The building gets no such allowance.
     */
    touching(hulls, exclude = new Set()) {
        const keys = new Set();
        for (const hull of hulls.map((h) => this.prepare(h))) {
            if (hull.against === "static") continue;
            let hit;
            const skip = new Set(keys);
            while ((hit = this.hitEditables(hull, exclude, skip))) {
                keys.add(hit.key);
                skip.add(hit.key);
            }
        }
        return keys;
    }

    // ------------------------------------------------------------------
    // The building
    // ------------------------------------------------------------------

    getStaticEntries() {
        if (this.staticEntries) return this.staticEntries;

        const entries = [];
        const roots = [this.builder.shell, this.builder.groundPlane, this.builder.doorAnchors];

        // Door linings stay in — only the leaves, which swing, are left out,
        // and the skirting and casings a piece goes flush against.
        const visit = (object) => {
            if (!object || object.userData?.doorLeaf || object.userData?.helper || object.userData?.decor) return;
            if (object.isMesh && object.geometry?.attributes.position) {
                entries.push(this.describeStatic(object));
            }
            for (const child of object.children) visit(child);
        };
        for (const root of roots) {
            if (!root) continue;
            root.updateWorldMatrix(true, true);
            visit(root);
        }

        this.staticEntries = entries;
        return entries;
    }

    describeStatic(mesh) {
        const geometry = mesh.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const box = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        const kind = mesh.userData?.surfaceKind;
        const entry = {
            key: mesh.uuid,
            mesh,
            box,
            slab: SLAB_KINDS.has(kind) && geometry.type !== "BoxGeometry",
            label: labelFor(mesh),
        };

        if (geometry.type === "BoxGeometry") {
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            mesh.matrixWorld.decompose(position, quaternion, scale);
            const p = geometry.parameters;
            entry.obb = new OBB(
                position,
                new THREE.Vector3(p.width / 2, p.height / 2, p.depth / 2).multiply(scale),
                new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
            );
        }
        return entry;
    }

    /**
     * An imported building is tested through the walkthrough's own static
     * octree, plus a small one of the nodes that octree leaves out (stair
     * treads, walked on via ramps but still solid to furniture).
     */
    getModelOctrees() {
        if (!this.builder.isModelScene) return [];
        if (!this.excludedOctree) {
            const exclude = this.builder.spec.model.collision_exclude || [];
            const nodes = this.builder.model.children.filter((c) => exclude.some((p) => c.name.startsWith(p)));
            this.excludedOctree = buildOctree(nodes, isTransient);
        }
        return [this.builder.collision.static, this.excludedOctree];
    }

    hitStatic(hull, ignore) {
        for (const entry of this.getStaticEntries()) {
            if (hull.against === "noslab" && entry.slab) continue;
            if (hull.slabsBelow !== undefined && entry.slab && entry.box.min.y > hull.slabsBelow) continue;
            if (ignore.has(entry.key)) continue;
            if (!entry.box.intersectsBox(hull.box)) continue;

            const hit = entry.obb
                ? hull.obb.intersectsOBB(entry.obb)
                : this.meshHits(entry.mesh, hull);
            if (hit) return { key: entry.key, label: entry.label };
        }

        for (const octree of this.getModelOctrees()) {
            for (const triangle of collectTriangles(octree, hull.box)) {
                if (ignore.has(triangle)) continue;
                if (hull.against === "noslab" || hull.slabsBelow !== undefined) {
                    triangle.getNormal(_normal);
                    const flat = Math.abs(_normal.y) > 0.9;
                    if (flat && hull.against === "noslab") continue;
                    if (flat && Math.min(triangle.a.y, triangle.b.y, triangle.c.y) > hull.slabsBelow) continue;
                }
                _a.copy(triangle.a).applyMatrix4(hull.inverse);
                _b.copy(triangle.b).applyMatrix4(hull.inverse);
                _c.copy(triangle.c).applyMatrix4(hull.inverse);
                if (triangleHitsBox(_a, _b, _c, hull.half)) return { key: triangle, label: "Building" };
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Other pieces
    // ------------------------------------------------------------------

    hitEditables(hull, exclude, ignore) {
        for (const editable of this.editor.editables.values()) {
            if (exclude.has(editable) || ignore.has(editable.key)) continue;
            if (!editable.isObstacle()) continue;
            if (!editable.worldBox().intersectsBox(hull.box)) continue;

            let hit = false;
            for (const mesh of editable.collisionMeshes()) {
                if (mesh.geometry.type === "BoxGeometry") {
                    this.meshObb(mesh, _obb);
                    hit = hull.obb.intersectsOBB(_obb);
                } else {
                    hit = this.meshHits(mesh, hull);
                }
                if (hit) break;
            }
            if (hit) return { key: editable.key, label: editable.label };
        }
        return null;
    }

    meshObb(mesh, target) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        mesh.matrixWorld.decompose(position, quaternion, scale);
        const p = mesh.geometry.parameters;
        target.center.copy(position);
        target.halfSize.set(p.width / 2, p.height / 2, p.depth / 2).multiply(scale);
        target.rotation.setFromMatrix4(_matrix.makeRotationFromQuaternion(quaternion));
        return target;
    }

    /**
     * Triangle-by-triangle test of one mesh against a hull. Every vertex is
     * taken into the hull's frame once, then each triangle is rejected on
     * its bounds before the full separating-axis test.
     */
    meshHits(mesh, hull) {
        const geometry = mesh.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        _meshBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        if (!_meshBox.intersectsBox(hull.box)) return false;

        const position = geometry.attributes.position;
        const index = geometry.index;
        const count = position.count;
        if (this.scratch.length < count * 3) this.scratch = new Float32Array(count * 3);
        const v = this.scratch;

        _matrix.multiplyMatrices(hull.inverse, mesh.matrixWorld);
        const e = _matrix.elements;
        for (let i = 0; i < count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            v[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
            v[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
            v[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }

        const { x: hx, y: hy, z: hz } = hull.half;
        const triangles = index ? index.count / 3 : count / 3;
        for (let t = 0; t < triangles; t++) {
            const ia = (index ? index.getX(t * 3) : t * 3) * 3;
            const ib = (index ? index.getX(t * 3 + 1) : t * 3 + 1) * 3;
            const ic = (index ? index.getX(t * 3 + 2) : t * 3 + 2) * 3;

            if (v[ia] > hx && v[ib] > hx && v[ic] > hx) continue;
            if (v[ia] < -hx && v[ib] < -hx && v[ic] < -hx) continue;
            if (v[ia + 1] > hy && v[ib + 1] > hy && v[ic + 1] > hy) continue;
            if (v[ia + 1] < -hy && v[ib + 1] < -hy && v[ic + 1] < -hy) continue;
            if (v[ia + 2] > hz && v[ib + 2] > hz && v[ic + 2] > hz) continue;
            if (v[ia + 2] < -hz && v[ib + 2] < -hz && v[ic + 2] < -hz) continue;

            _a.set(v[ia], v[ia + 1], v[ia + 2]);
            _b.set(v[ib], v[ib + 1], v[ib + 2]);
            _c.set(v[ic], v[ic + 1], v[ic + 2]);
            if (triangleHitsBox(_a, _b, _c, hull.half)) return true;
        }
        return false;
    }

    /** World-space bounds of a set of hulls, for callers that need one box. */
    static bounds(hulls) {
        _hullBox.makeEmpty();
        for (const hull of hulls) {
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        _hullBox.expandByPoint(
                            _corner
                                .set(sx * hull.half.x, sy * hull.half.y, sz * hull.half.z)
                                .applyQuaternion(hull.quat)
                                .add(hull.center)
                        );
                    }
                }
            }
        }
        return _hullBox.clone();
    }

    dispose() {
        this.staticEntries = null;
        this.excludedOctree = null;
    }
}

/** Does a triangle, already in a box's frame, touch the box? */
function triangleHitsBox(a, b, c, half) {
    _box.min.set(-half.x, -half.y, -half.z);
    _box.max.copy(half);
    _triangle.set(a, b, c);
    return _box.intersectsTriangle(_triangle);
}

function labelFor(mesh) {
    // A collision panel says what it stands in for: "Stair rail".
    if (mesh.userData?.label && !mesh.userData.surfaceKind) return mesh.userData.label;
    for (let node = mesh; node; node = node.parent) {
        const data = node.userData || {};
        if (data.kind === "door") return "Door frame";
        if (data.kind === "opening") return "Window or door frame";
        if (data.surfaceKind === "wall") return data.label || "Wall";
        if (data.surfaceKind === "floor") return "Floor";
        if (data.surfaceKind === "ceiling") return "Ceiling";
        if (data.surfaceKind === "ground") return "Ground";
        if (data.surfaceKind === "roof") return "Roof";
        if (data.kind === "roof") return "Roof";
        if (data.kind === "wall") return "Wall";
    }
    return "Building";
}

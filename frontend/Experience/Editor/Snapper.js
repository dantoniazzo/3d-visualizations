import * as THREE from "three";

import { FINISHES } from "../../../shared/catalog.js";
import { signedArea } from "../Utils/geometry.js";

/**
 * The editor's snapping, all of which Shift turns off while held:
 *
 *   - increments: a move is rounded to the grid step, a turn to 15°.
 *   - faces: a piece that comes within a hand's width of a wall, or of the
 *     side of another piece, is pulled flush against it — so a kitchen
 *     unit drops into the gap between two others, and a wardrobe backs
 *     onto a wall, without anyone having to aim to the millimetre.
 *   - surfaces: a piece that was standing on something keeps standing on
 *     whatever is under it as it moves: the floor, a rug, a worktop.
 *
 * Faces only snap when the piece is square to them (to within a degree
 * and a half); anything at an angle moves freely.
 */

const FACE_REACH = 0.2;
const ALIGN_REACH = 0.08;
const SQUARE = Math.cos(THREE.MathUtils.degToRad(1.5));
export const STEP_UP = 0.25;

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();
const _normal = new THREE.Vector3();

export default class Snapper {
    constructor(editor) {
        this.editor = editor;
        this.builder = editor.builder;
        this.buildingFaces = null;
    }

    // ------------------------------------------------------------------
    // Faces
    // ------------------------------------------------------------------

    /**
     * Vertical faces of the building, in plan: a line with an outward
     * normal, an extent along it, and a height range. Generated shells give
     * both faces of every wall; imported ones give the edges of their room
     * polygons, which by convention trace the walls' inner faces.
     */
    getBuildingFaces() {
        if (this.buildingFaces) return this.buildingFaces;
        const faces = [];

        if (!this.builder.isModelScene) {
            for (const wall of this.builder.spec.walls) {
                const [x1, z1] = wall.start;
                const [x2, z2] = wall.end;
                const length = Math.hypot(x2 - x1, z2 - z1);
                if (length < 0.05) continue;
                const t = [(x2 - x1) / length, (z2 - z1) / length];
                const n = [-t[1], t[0]];
                const h = wall.thickness / 2;
                for (const sign of [1, -1]) {
                    faces.push({
                        p0: [x1 + n[0] * h * sign, z1 + n[1] * h * sign],
                        t,
                        n: [n[0] * sign, n[1] * sign],
                        s0: 0,
                        s1: length,
                        y0: wall.base_height,
                        y1: wall.base_height + wall.height,
                        kind: "wall",
                    });
                }
            }
        } else {
            for (const room of this.builder.spec.rooms) {
                if (FINISHES[room.floor_finish]?.kind === "ground") continue;
                const polygon = room.polygon;
                const inward = signedArea(polygon) > 0 ? 1 : -1;
                for (let i = 0; i < polygon.length; i++) {
                    const [x1, z1] = polygon[i];
                    const [x2, z2] = polygon[(i + 1) % polygon.length];
                    const length = Math.hypot(x2 - x1, z2 - z1);
                    if (length < 0.05) continue;
                    const t = [(x2 - x1) / length, (z2 - z1) / length];
                    faces.push({
                        p0: [x1, z1],
                        t,
                        n: [-t[1] * inward, t[0] * inward],
                        s0: 0,
                        s1: length,
                        y0: room.elevation,
                        y1: room.elevation + room.height,
                        kind: "wall",
                    });
                }
            }
        }

        this.buildingFaces = faces;
        return faces;
    }

    /** The four sides of another piece's footprint. */
    pieceFaces(footprint) {
        const faces = [];
        for (const [axis, other] of [
            ["u", "v"],
            ["v", "u"],
        ]) {
            const dir = footprint[axis];
            const along = footprint[other];
            const half = footprint[axis === "u" ? "hu" : "hv"];
            const span = footprint[axis === "u" ? "hv" : "hu"];
            for (const sign of [1, -1]) {
                const n = [dir[0] * sign, dir[1] * sign];
                faces.push({
                    p0: [
                        footprint.cx + n[0] * half - along[0] * span,
                        footprint.cz + n[1] * half - along[1] * span,
                    ],
                    t: along,
                    n,
                    s0: 0,
                    s1: span * 2,
                    y0: footprint.y0,
                    y1: footprint.y1,
                    kind: "piece",
                });
            }
        }
        return faces;
    }

    /**
     * How far to slide a footprint to sit flush against what is nearby.
     *
     * Returns up to two corrections, one along each of the piece's own
     * axes, so the caller can try both, either, or neither against the fit
     * test. `allowed` is a unit vector the move is constrained to, or null.
     *
     * @returns {{ u: THREE.Vector3|null, v: THREE.Vector3|null }}
     */
    flush(footprint, exclude, allowed = null) {
        const targets = [...this.getBuildingFaces()];
        for (const editable of this.editor.editables.values()) {
            if (exclude.has(editable) || !editable.isObstacle()) continue;
            const other = editable.footprint();
            if (!other) continue;
            // Only pieces within reach are worth the comparison.
            const reach = Math.hypot(other.hu + footprint.hu, other.hv + footprint.hv) + FACE_REACH + 1;
            if (Math.hypot(other.cx - footprint.cx, other.cz - footprint.cz) > reach) continue;
            targets.push(...this.pieceFaces(other));
        }

        const best = { u: null, v: null };
        const score = { u: Infinity, v: Infinity };

        for (const [axis, other] of [
            ["u", "v"],
            ["v", "u"],
        ]) {
            const dir = footprint[axis];
            const half = footprint[axis === "u" ? "hu" : "hv"];
            const span = footprint[axis === "u" ? "hv" : "hu"];
            const tangent = footprint[other];

            for (const sign of [1, -1]) {
                const m = [dir[0] * sign, dir[1] * sign];
                const pm = [footprint.cx + m[0] * half, footprint.cz + m[1] * half];

                for (const face of targets) {
                    const dot = m[0] * face.n[0] + m[1] * face.n[1];
                    const contact = dot < -SQUARE;
                    const align = dot > SQUARE && face.kind === "piece";
                    if (!contact && !align) continue;

                    const d = (pm[0] - face.p0[0]) * face.n[0] + (pm[1] - face.p0[1]) * face.n[1];
                    if (Math.abs(d) > (contact ? FACE_REACH : ALIGN_REACH)) continue;

                    // Must actually face each other: overlap along the face
                    // and in height.
                    const c = (pm[0] - face.p0[0]) * face.t[0] + (pm[1] - face.p0[1]) * face.t[1];
                    const extent = Math.abs(tangent[0] * face.t[0] + tangent[1] * face.t[1]) * span;
                    const lateral = Math.min(c + extent, face.s1) - Math.max(c - extent, face.s0);
                    if (contact && lateral < 0.04) continue;
                    if (align && lateral < -1) continue;
                    if (Math.min(footprint.y1, face.y1) - Math.max(footprint.y0, face.y0) < 0.03) continue;

                    const delta = new THREE.Vector3(-d * face.n[0], 0, -d * face.n[1]);
                    if (allowed) {
                        const along = delta.dot(allowed);
                        if (Math.abs(Math.abs(along) - delta.length()) > 1e-4) continue;
                    }

                    const s = Math.abs(d) * (contact ? 1 : 1.6);
                    if (s < score[axis]) {
                        score[axis] = s;
                        best[axis] = delta;
                    }
                }
            }
        }
        return best;
    }

    // ------------------------------------------------------------------
    // Surfaces
    // ------------------------------------------------------------------

    /**
     * Height of the highest thing a footprint could stand on, looking down
     * from STEP_UP above `bottom` — so a chair steps onto a rug but not
     * onto a sofa. Sampled at the centre and near each corner.
     */
    supportUnder(footprint, bottom, exclude) {
        const targets = this.supportTargets();
        let best = null;

        const samples = [[0, 0]];
        for (const su of [-0.8, 0.8]) for (const sv of [-0.8, 0.8]) samples.push([su, sv]);

        for (const [su, sv] of samples) {
            _origin.set(
                footprint.cx + footprint.u[0] * footprint.hu * su + footprint.v[0] * footprint.hv * sv,
                bottom + STEP_UP,
                footprint.cz + footprint.u[1] * footprint.hu * su + footprint.v[1] * footprint.hv * sv
            );
            _ray.set(_origin, _down);
            _ray.far = STEP_UP + 40;

            for (const hit of _ray.intersectObjects(targets, true)) {
                if (!hit.face || hit.object.userData?.helper || hit.object.userData?.doorLeaf) continue;
                if (exclude.size && this.editor.isInside(hit.object, exclude)) continue;
                _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
                // Double-sided slabs report their top face from above.
                if (Math.abs(_normal.y) < 0.5) continue;
                if (best === null || hit.point.y > best) best = hit.point.y;
                break;
            }
        }
        return best;
    }

    supportTargets() {
        const b = this.builder;
        return [b.shell, b.groundPlane, b.fittings, b.furnitureGroup, b.model].filter(Boolean);
    }

    // ------------------------------------------------------------------
    // Increments
    // ------------------------------------------------------------------

    static step(value, increment) {
        return Math.round(value / increment) * increment;
    }
}

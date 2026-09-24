import * as THREE from "three";

import FitChecker from "./FitChecker.js";
import { AXES, DEG, round, toBlender, yawQuaternion } from "./axes.js";
import SceneBuilder, { localBox } from "../World/SceneBuilder.js";
import { DOOR_TYPES, DOOR_SWINGS } from "../../../shared/catalog.js";

/**
 * Everything the editor can select, behind one interface.
 *
 * A pose is `{ position, yaw, scale }` in world space, where `position` is
 * the piece's pivot (a furniture base, the foot of a flight, the centre of
 * an opening) and `scale` is the object's own scale. `applyPose` writes the
 * pose straight into both the scene and the spec — the spec is the save
 * file, and undo works on snapshots of it.
 *
 * `hulls(pose)` is what the fit test sees; `footprint(pose)` is what
 * snapping sees; `caps` says which tools apply.
 */

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

class Editable {
    constructor(editor, key) {
        this.editor = editor;
        this.builder = editor.builder;
        this.key = key;
        this._box = null;
        this._worldBox = null;
        this._meshes = null;
    }

    get label() {
        return "Object";
    }

    get subtitle() {
        return "";
    }

    getPose() {
        const o = this.object3d;
        return { position: o.position.clone(), yaw: o.rotation.y, scale: o.scale.clone() };
    }

    /** Model loaded, geometry rebuilt: forget cached bounds. */
    invalidate() {
        this._box = null;
        this._worldBox = null;
        this._meshes = null;
    }

    moved() {
        this._worldBox = null;
    }

    localBox() {
        if (!this._box || this._box.isEmpty()) this._box = localBox(this.object3d);
        return this._box;
    }

    /**
     * One oriented box around the whole piece. A rug only has to clear the
     * building — furniture stands on it, not beside it.
     */
    hulls(pose = this.getPose()) {
        const box = this.localBox();
        if (box.isEmpty()) return [];
        const centre = box.getCenter(new THREE.Vector3()).multiply(pose.scale);
        const half = box.getSize(new THREE.Vector3()).multiply(pose.scale).multiplyScalar(0.5);
        const quat = yawQuaternion(pose.yaw);
        const hull = { center: centre.applyQuaternion(quat).add(pose.position), half, quat };
        if (half.y * 2 < SceneBuilder.FLAT_HEIGHT) hull.against = "static";
        return [hull];
    }

    footprint(pose = this.getPose()) {
        const hull = this.hulls(pose)[0];
        if (!hull) return null;
        const cos = Math.cos(pose.yaw);
        const sin = Math.sin(pose.yaw);
        return {
            cx: hull.center.x,
            cz: hull.center.z,
            u: [cos, -sin],
            v: [sin, cos],
            hu: hull.half.x,
            hv: hull.half.z,
            y0: hull.center.y - hull.half.y,
            y1: hull.center.y + hull.half.y,
        };
    }

    bottom(pose = this.getPose()) {
        return pose.position.y + this.localBox().min.y * pose.scale.y;
    }

    worldBox() {
        if (!this._worldBox || this._worldBox.isEmpty()) this._worldBox = FitChecker.bounds(this.hulls());
        return this._worldBox;
    }

    isFlat() {
        const box = this.localBox();
        return box.isEmpty() || (box.max.y - box.min.y) * this.object3d.scale.y < SceneBuilder.FLAT_HEIGHT;
    }

    /** Whether other pieces should bump into this one. */
    isObstacle() {
        return !this.isFlat();
    }

    collisionMeshes() {
        if (!this._meshes) {
            this._meshes = [];
            this.object3d.traverse((child) => {
                if (child.isMesh && child.geometry?.attributes.position && !child.userData?.helper) {
                    this._meshes.push(child);
                }
            });
        }
        return this._meshes;
    }

    outlineObjects() {
        return [this.object3d];
    }

    setHidden(hidden) {
        this.object3d.visible = !hidden;
    }

    clampScale() {}

    /** Location/rotation fields every movable piece shares, in Blender's axes. */
    transformFields({ vertical = true, rotation = true } = {}) {
        const pose = this.getPose();
        const [x, y, z] = toBlender(pose.position);
        const fields = [
            { key: "x", label: "X", value: x, unit: "m", step: 0.01 },
            { key: "y", label: "Y", value: y, unit: "m", step: 0.01 },
        ];
        if (vertical) fields.push({ key: "z", label: "Z", value: z, unit: "m", step: 0.01 });
        if (rotation) {
            fields.push({ key: "rotation", label: "Rotation Z", value: normaliseDegrees(pose.yaw / DEG), unit: "°", step: 1 });
        }
        return fields;
    }

    /** A pose with one transform field changed, or null if the key is not one. */
    poseWith(key, value) {
        const pose = this.getPose();
        if (key === "x") pose.position.x = value;
        else if (key === "y") pose.position.z = -value;
        else if (key === "z") pose.position.y = value;
        else if (key === "rotation") pose.yaw = value * DEG;
        else if (key === "scale") pose.scale.setScalar(value * this.baseScale());
        else return null;
        return pose;
    }

    baseScale() {
        return 1;
    }

    gizmoSpec(tool, orientation) {
        const pose = this.getPose();
        const frame = orientation === "local" ? yawQuaternion(pose.yaw) : new THREE.Quaternion();
        const spec = { tool, pivot: pose.position.clone(), frame };
        if (tool === "move") {
            if (this.caps.move === "free") Object.assign(spec, { axes: ["x", "y", "z"], planes: ["x", "y", "z"], free: true });
            else if (this.caps.move === "horizontal") Object.assign(spec, { axes: ["x", "y"], planes: ["z"], free: true });
            else return null;
        } else if (tool === "rotate") {
            if (!this.caps.rotate) return null;
            spec.ring = true;
            spec.frame = new THREE.Quaternion();
        } else if (tool === "scale") {
            if (!this.caps.scale) return null;
            if (this.caps.scale === "uniform") spec.uniform = true;
            else Object.assign(spec, { scaleAxes: ["x", "y"], uniform: true });
        } else {
            return null;
        }
        return spec;
    }
}

// ---------------------------------------------------------------------
// Furniture, catalogue or model-part
// ---------------------------------------------------------------------

export class FurnitureEditable extends Editable {
    constructor(editor, entry) {
        super(editor, `furniture:${entry.placement.id}`);
        this.entry = entry;
        this.object3d = entry.group;
        this.type = "furniture";
        this.icon = "furniture";
        this.caps = {
            move: "free",
            rotate: true,
            scale: "uniform",
            // Pictures and mirrors hang where they are put.
            gravity: this.item?.anchor !== "wall",
            carry: true,
            fit: true,
            duplicate: true,
            remove: true,
        };
    }

    get id() {
        return this.entry.placement.id;
    }

    get item() {
        return this.builder.furnitureLibrary.getItem(this.entry.placement.catalog_id);
    }

    get label() {
        return this.item?.name || this.entry.placement.catalog_id;
    }

    get subtitle() {
        return this.item?.local ? "From the model" : this.item?.category || "";
    }

    baseScale() {
        return this.item?.scale ?? 1;
    }

    applyPose(pose) {
        this.builder.updateFurniture(this.id, {
            position: pose.position.toArray().map((n) => round(n)),
            rotation: round(normaliseDegrees(pose.yaw / DEG), 3),
            scale: round(pose.scale.x / this.baseScale(), 4),
        });
        this.moved();
    }

    clampScale(scale) {
        const base = this.baseScale();
        scale.setScalar(THREE.MathUtils.clamp(scale.x / base, 0.1, 10) * base);
    }

    duplicateSpec(id) {
        return { ...structuredClone(this.entry.placement), id };
    }

    properties() {
        const pose = this.getPose();
        const size = this.localBox().getSize(new THREE.Vector3()).multiply(pose.scale);
        return [
            { title: "Transform", fields: [...this.transformFields(), { key: "scale", label: "Scale", value: pose.scale.x / this.baseScale(), step: 0.05 }] },
            {
                title: "Dimensions",
                fields: [
                    { label: "Width", value: size.x, unit: "m", readonly: true },
                    { label: "Depth", value: size.z, unit: "m", readonly: true },
                    { label: "Height", value: size.y, unit: "m", readonly: true },
                ],
            },
            {
                title: "Source",
                text: this.item?.local
                    ? `Part of the imported model (${this.entry.placement.catalog_id.slice(6)})`
                    : `Catalogue item “${this.entry.placement.catalog_id}”`,
            },
        ];
    }
}

// ---------------------------------------------------------------------
// Stairs
// ---------------------------------------------------------------------

export class StairEditable extends Editable {
    constructor(editor, entry) {
        super(editor, `stair:${entry.spec.id}`);
        this.entry = entry;
        this.object3d = entry.group;
        this.type = "stair";
        this.icon = "stairs";
        this.caps = {
            move: "free",
            rotate: true,
            scale: false,
            gravity: true,
            carry: false,
            fit: true,
            duplicate: true,
            remove: true,
        };
    }

    get spec() {
        return this.entry.spec;
    }

    get id() {
        return this.spec.id;
    }

    get label() {
        return "Staircase";
    }

    get subtitle() {
        return `${this.spec.steps} steps`;
    }

    get rise() {
        return this.spec.top_height - this.spec.base_height;
    }

    linkedOpenings() {
        return this.builder.spec.floor_openings.filter((h) => h.stair_id === this.id);
    }

    getPose() {
        return {
            position: new THREE.Vector3(this.spec.start[0], this.spec.base_height, this.spec.start[1]),
            yaw: this.spec.yaw * DEG,
            scale: new THREE.Vector3(1, 1, 1),
        };
    }

    /** A linked opening's place if the flight moved from its pose to `pose`. */
    carryOpening(hole, pose) {
        const from = this.getPose();
        const turn = pose.yaw - from.yaw;
        const offset = _v
            .set(hole.position[0] - from.position.x, 0, hole.position[1] - from.position.z)
            .applyAxisAngle(AXES.z, turn);
        return {
            ...hole,
            position: [pose.position.x + offset.x, pose.position.z + offset.z],
            yaw: normaliseDegrees(hole.yaw + turn / DEG),
            elevation: hole.elevation + (pose.position.y - from.position.y),
        };
    }

    hulls(pose = this.getPose()) {
        const { width, run, steps } = this.spec;
        const rise = this.rise;
        const going = run / steps;
        const quat = yawQuaternion(pose.yaw);
        const hulls = [];

        // One box per tread, each solid down to the flight's foot. They
        // must clear walls, furniture and the floor they stand on; the
        // slabs they rise through are handled by the opening, below.
        const slabsBelow = pose.position.y + 0.3;
        for (let i = 0; i < steps; i++) {
            const top = ((i + 1) * rise) / steps;
            hulls.push({
                ...localHull(pose, quat, [0, top / 2, i * going + going / 2], [width / 2, top / 2, going / 2]),
                slabsBelow,
            });
        }

        const linked = this.linkedOpenings();
        if (linked.length) {
            // The opening travels with the flight, so what has to fit is the
            // clear column above it on the upper floor.
            for (const hole of linked) hulls.push(...FloorOpeningEditable.clearance(this.carryOpening(hole, pose)));
        } else {
            // No opening of its own: whatever is overhead must already be open.
            // From the ceiling below the upper floor to just over it.
            hulls.push({
                ...localHull(pose, quat, [0, rise - 0.3, run / 2], [Math.max(0.05, width / 2 - 0.08), 0.35, Math.max(0.05, run / 2 - 0.08)]),
                against: "static",
                reason: "needs a floor opening above",
            });
        }
        return hulls;
    }

    footprint(pose = this.getPose()) {
        const { width, run } = this.spec;
        const cos = Math.cos(pose.yaw);
        const sin = Math.sin(pose.yaw);
        return {
            cx: pose.position.x + sin * (run / 2),
            cz: pose.position.z + cos * (run / 2),
            u: [cos, -sin],
            v: [sin, cos],
            hu: width / 2,
            hv: run / 2,
            y0: pose.position.y,
            y1: pose.position.y + this.rise,
        };
    }

    bottom(pose = this.getPose()) {
        return pose.position.y;
    }

    worldBox() {
        if (!this._worldBox) {
            const steps = this.hulls().filter((h) => h.slabsBelow !== undefined);
            this._worldBox = FitChecker.bounds(steps);
        }
        return this._worldBox;
    }

    isFlat() {
        return false;
    }

    collisionMeshes() {
        return this.entry.group.children.filter((c) => c.isMesh);
    }

    applyPose(pose) {
        const linked = this.linkedOpenings();
        const moved = linked.map((hole) => this.carryOpening(hole, pose));
        const elevations = new Set(linked.map((h) => h.elevation));

        const rise = this.rise;
        this.spec.start = [round(pose.position.x), round(pose.position.z)];
        this.spec.base_height = round(pose.position.y);
        this.spec.top_height = round(pose.position.y + rise);
        this.spec.yaw = round(normaliseDegrees(pose.yaw / DEG), 3);
        this.builder.placeStair(this.id);

        linked.forEach((hole, i) => {
            const next = moved[i];
            const changed =
                Math.abs(next.position[0] - hole.position[0]) > 1e-4 ||
                Math.abs(next.position[1] - hole.position[1]) > 1e-4 ||
                Math.abs(next.yaw - hole.yaw) > 1e-3 ||
                Math.abs(next.elevation - hole.elevation) > 1e-4;
            if (!changed) return;
            hole.position = next.position.map((n) => round(n));
            hole.yaw = round(next.yaw, 3);
            hole.elevation = round(next.elevation);
            elevations.add(hole.elevation);
        });

        if (linked.length) this.editor.openingsChanged([...elevations]);
        this.moved();
    }

    duplicateSpec(id) {
        return { ...structuredClone(this.spec), id };
    }

    /**
     * Change the flight's dimensions. Its linked openings are refitted to
     * the new footprint; nothing is kept if the result does not fit.
     */
    setParam(key, value) {
        const spec = this.spec;
        const before = structuredClone(spec);
        const holesBefore = structuredClone(this.linkedOpenings());

        if (key === "width") spec.width = THREE.MathUtils.clamp(value, 0.6, 4);
        else if (key === "run") spec.run = THREE.MathUtils.clamp(value, 0.8, 12);
        else if (key === "rise") spec.top_height = spec.base_height + THREE.MathUtils.clamp(value, 0.3, 8);
        else if (key === "steps") spec.steps = Math.round(THREE.MathUtils.clamp(value, 2, 60));
        else return { ok: false };

        this.fitOpenings();
        const result = this.editor.fit.test(this.hulls(), { exclude: new Set([this]) });
        if (!result.ok) {
            Object.assign(spec, before);
            this.linkedOpenings().forEach((hole, i) => Object.assign(hole, holesBefore[i]));
            return { ok: false, message: `Doesn't fit — it would hit the ${result.blocker.label.toLowerCase()}` };
        }

        const elevations = [...holesBefore.map((h) => h.elevation), ...this.linkedOpenings().map((h) => h.elevation)];
        this.entry = this.builder.rebuildStair(this.id);
        this.object3d = this.entry.group;
        this.invalidate();
        if (elevations.length) this.editor.openingsChanged(elevations);
        return { ok: true };
    }

    /** Set every linked opening to the flight's footprint at its head. */
    fitOpenings() {
        const f = this.footprint();
        for (const hole of this.linkedOpenings()) {
            hole.position = [round(f.cx), round(f.cz)];
            hole.width = round(this.spec.width);
            hole.depth = round(this.spec.run);
            hole.yaw = this.spec.yaw;
            hole.elevation = this.spec.top_height;
        }
    }

    properties() {
        const spec = this.spec;
        const linked = this.linkedOpenings();
        return [
            { title: "Transform", fields: this.transformFields() },
            {
                title: "Flight",
                fields: [
                    { key: "width", label: "Width", value: spec.width, unit: "m", step: 0.05 },
                    { key: "run", label: "Length", value: spec.run, unit: "m", step: 0.05 },
                    { key: "rise", label: "Rise", value: this.rise, unit: "m", step: 0.05 },
                    { key: "steps", label: "Steps", value: spec.steps, step: 1, integer: true },
                ],
            },
            {
                title: "Floor opening",
                text: linked.length
                    ? "The opening above moves with the flight."
                    : "No opening of its own — the floor above must already be open here.",
                actions: linked.length ? [] : [{ id: "cut-opening", label: "Cut opening above" }],
            },
        ];
    }
}

// ---------------------------------------------------------------------
// Floor openings
// ---------------------------------------------------------------------

export class FloorOpeningEditable extends Editable {
    constructor(editor, hole, helper) {
        super(editor, `hole:${hole.id}`);
        this.hole = hole;
        this.object3d = helper;
        this.type = "hole";
        this.icon = "hole";
        this.caps = {
            move: "horizontal",
            rotate: true,
            scale: "xy",
            gravity: false,
            carry: false,
            fit: true,
            duplicate: true,
            remove: true,
        };
    }

    get id() {
        return this.hole.id;
    }

    get label() {
        return "Floor opening";
    }

    get subtitle() {
        return `${this.hole.width.toFixed(2)} × ${this.hole.depth.toFixed(2)} m`;
    }

    getPose() {
        return {
            position: new THREE.Vector3(this.hole.position[0], this.hole.elevation, this.hole.position[1]),
            yaw: (this.hole.yaw || 0) * DEG,
            scale: new THREE.Vector3(this.hole.width, 1, this.hole.depth),
        };
    }

    /** The column of air above an opening that has to stay clear. */
    static clearance(hole) {
        const quat = yawQuaternion((hole.yaw || 0) * DEG);
        return [
            {
                center: new THREE.Vector3(hole.position[0], hole.elevation + 1.0, hole.position[1]),
                half: new THREE.Vector3(Math.max(0.05, hole.width / 2 - 0.08), 0.93, Math.max(0.05, hole.depth / 2 - 0.08)),
                quat,
                against: "noslab",
            },
        ];
    }

    static fromPose(hole, pose) {
        return {
            ...hole,
            position: [pose.position.x, pose.position.z],
            yaw: pose.yaw / DEG,
            width: pose.scale.x,
            depth: pose.scale.z,
        };
    }

    hulls(pose = this.getPose()) {
        return FloorOpeningEditable.clearance(FloorOpeningEditable.fromPose(this.hole, pose));
    }

    footprint(pose = this.getPose()) {
        const cos = Math.cos(pose.yaw);
        const sin = Math.sin(pose.yaw);
        return {
            cx: pose.position.x,
            cz: pose.position.z,
            u: [cos, -sin],
            v: [sin, cos],
            hu: pose.scale.x / 2,
            hv: pose.scale.z / 2,
            y0: pose.position.y,
            y1: pose.position.y + 0.01,
        };
    }

    bottom(pose = this.getPose()) {
        return pose.position.y;
    }

    isObstacle() {
        return false;
    }

    isFlat() {
        return true;
    }

    collisionMeshes() {
        return [];
    }

    clampScale(scale) {
        scale.x = THREE.MathUtils.clamp(scale.x, 0.3, 20);
        scale.z = THREE.MathUtils.clamp(scale.z, 0.3, 20);
        scale.y = 1;
    }

    applyPose(pose) {
        const before = this.hole.elevation;
        const next = FloorOpeningEditable.fromPose(this.hole, pose);
        this.hole.position = next.position.map((n) => round(n));
        this.hole.yaw = round(normaliseDegrees(next.yaw), 3);
        this.hole.width = round(next.width);
        this.hole.depth = round(next.depth);
        this.hole.elevation = round(pose.position.y);
        this.editor.openingsChanged([before, this.hole.elevation]);
        this.moved();
    }

    poseWith(key, value) {
        const pose = this.getPose();
        if (key === "width") pose.scale.x = value;
        else if (key === "depth") pose.scale.z = value;
        else if (key === "level") pose.position.y = value;
        else return super.poseWith(key, value);
        this.clampScale(pose.scale);
        return pose;
    }

    duplicateSpec(id) {
        const copy = { ...structuredClone(this.hole), id };
        delete copy.stair_id;
        return copy;
    }

    properties() {
        const levels = this.editor.slabLevels();
        const stair = this.hole.stair_id;
        return [
            { title: "Transform", fields: this.transformFields({ vertical: false }) },
            {
                title: "Opening",
                fields: [
                    { key: "width", label: "Width", value: this.hole.width, unit: "m", step: 0.05 },
                    { key: "depth", label: "Depth", value: this.hole.depth, unit: "m", step: 0.05 },
                    {
                        key: "level",
                        label: "Level",
                        type: "select",
                        value: String(levels.find((l) => Math.abs(l.value - this.hole.elevation) < 0.02)?.value ?? this.hole.elevation),
                        options: levels.map((l) => ({ value: String(l.value), label: l.label })),
                        numeric: true,
                    },
                ],
            },
            {
                title: "Serves",
                text: stair ? `Moves with staircase “${stair}”.` : "Not tied to a staircase.",
            },
        ];
    }
}

// ---------------------------------------------------------------------
// Doors, windows and doorways: slide along their wall
// ---------------------------------------------------------------------

const OPENING_LABELS = { door: "Door", window: "Window", doorway: "Doorway", arch: "Archway" };

export class WallOpeningEditable extends Editable {
    constructor(editor, wall, opening) {
        super(editor, `opening:${wall.id}/${opening.id}`);
        this.wall = wall;
        this.opening = opening;
        this.type = "opening";
        this.icon = opening.type === "window" ? "window" : "door";
        this.caps = {
            move: "wall",
            vertical: opening.type === "window",
            rotate: false,
            scale: false,
            gravity: false,
            carry: false,
            fit: false,
            duplicate: false,
            remove: false,
        };
    }

    get label() {
        return OPENING_LABELS[this.opening.type] || "Opening";
    }

    get subtitle() {
        return `${this.opening.width.toFixed(2)} m wide`;
    }

    get wallLength() {
        const [x1, z1] = this.wall.start;
        const [x2, z2] = this.wall.end;
        return Math.hypot(x2 - x1, z2 - z1);
    }

    get wallGroup() {
        return this.builder.wallGroups.get(this.wall.id)?.group;
    }

    getPose() {
        const group = this.wallGroup;
        group.updateWorldMatrix(true, false);
        const position = new THREE.Vector3(this.opening.offset - this.wallLength / 2, this.opening.sill, 0).applyMatrix4(
            group.matrixWorld
        );
        return {
            position,
            yaw: group.rotation.y,
            scale: new THREE.Vector3(this.opening.width, this.opening.height, 1),
            offset: this.opening.offset,
            sill: this.opening.sill,
        };
    }

    applyPose(pose) {
        this.setPlacement(pose.offset, pose.sill);
    }

    hulls() {
        return [];
    }

    footprint() {
        return null;
    }

    worldBox() {
        return new THREE.Box3();
    }

    isObstacle() {
        return false;
    }

    collisionMeshes() {
        return [];
    }

    setHidden() {}

    outlineObjects() {
        const entry = this.builder.wallGroups.get(this.wall.id);
        if (!entry) return [];
        const out = entry.doors.filter((d) => d.spec.id === this.opening.id).map((d) => d.group);
        entry.group.traverse((o) => {
            if (o.isMesh && o.userData.openingId === this.opening.id) out.push(o);
        });
        return out;
    }

    /**
     * How far along the wall this opening can slide from where it is now,
     * without running into its neighbours, a wall that meets this one, or
     * the wall's ends. It may not jump over anything.
     */
    allowedRange(current = this.opening.offset, width = this.opening.width) {
        const length = this.wallLength;
        const margin = 0.05;
        const blocked = [];

        for (const other of this.wall.openings) {
            if (other === this.opening) continue;
            blocked.push({ a: other.offset - other.width / 2 - margin, b: other.offset + other.width / 2 + margin, label: `the ${OPENING_LABELS[other.type]?.toLowerCase() || "opening"}` });
        }

        // Walls that butt into this one, so a door never opens onto the end
        // of a partition.
        const [x1, z1] = this.wall.start;
        const t = [(this.wall.end[0] - x1) / length, (this.wall.end[1] - z1) / length];
        for (const other of this.builder.spec.walls) {
            if (other === this.wall || Math.abs(other.base_height - this.wall.base_height) > 0.1) continue;
            for (const point of [other.start, other.end]) {
                const dx = point[0] - x1;
                const dz = point[1] - z1;
                const s = dx * t[0] + dz * t[1];
                const perpendicular = Math.abs(dx * -t[1] + dz * t[0]);
                if (perpendicular > this.wall.thickness / 2 + other.thickness + 0.02) continue;
                if (s < -0.5 || s > length + 0.5) continue;
                blocked.push({ a: s - other.thickness / 2 - margin, b: s + other.thickness / 2 + margin, label: "a wall" });
            }
        }

        let lo = width / 2 + margin;
        let hi = length - width / 2 - margin;
        let loLabel = "the end of the wall";
        let hiLabel = "the end of the wall";

        for (const { a, b, label } of blocked) {
            if (b <= current && b + width / 2 > lo) {
                lo = b + width / 2;
                loLabel = label;
            } else if (a >= current && a - width / 2 < hi) {
                hi = a - width / 2;
                hiLabel = label;
            }
        }

        // Never force a jump: an opening already closer than the rules
        // allow may stay where it is.
        const range = [Math.min(lo, current), Math.max(hi, current)];
        range.loLabel = loLabel;
        range.hiLabel = hiLabel;
        return range;
    }

    sillRange() {
        if (!this.caps.vertical) return [0, 0];
        return [0.1, Math.max(0.1, this.wall.height - this.opening.height - 0.05)];
    }

    /** Move the opening, keeping doors on the floor, and rebuild its wall. */
    setPlacement(offset, sill) {
        const nextOffset = round(offset);
        const nextSill = this.caps.vertical ? round(sill) : 0;
        if (Math.abs(nextOffset - this.opening.offset) < 1e-4 && Math.abs(nextSill - this.opening.sill) < 1e-4) return;

        this.opening.offset = nextOffset;
        this.opening.sill = nextSill;
        this.editor.wallChanged(this.wall.id);
    }

    poseWith() {
        return null;
    }

    setParam(key, value) {
        const o = this.opening;
        if (key === "offset") {
            const [lo, hi] = this.allowedRange();
            const clamped = THREE.MathUtils.clamp(value, lo, hi);
            this.setPlacement(clamped, o.sill);
            return Math.abs(clamped - value) > 0.005 ? { ok: true, message: "Stopped where it meets the next opening or wall" } : { ok: true };
        }
        if (key === "sill") {
            const [lo, hi] = this.sillRange();
            this.setPlacement(o.offset, THREE.MathUtils.clamp(value, lo, hi));
            return { ok: true };
        }
        if (key === "width") {
            const width = THREE.MathUtils.clamp(value, 0.4, this.wallLength - 0.1);
            const [lo, hi] = this.allowedRange(o.offset, width);
            if (hi < lo) return { ok: false, message: "Too wide for the space on this wall" };
            o.width = round(width);
            o.offset = round(THREE.MathUtils.clamp(o.offset, lo, hi));
        } else if (key === "height") {
            o.height = round(THREE.MathUtils.clamp(value, 0.4, this.wall.height - o.sill - 0.02));
        } else if (key === "doorType" && o.door) {
            o.door.type = value;
        } else if (key === "swing" && o.door) {
            o.door.swing = value;
        } else {
            return { ok: false };
        }
        this.editor.wallChanged(this.wall.id);
        return { ok: true };
    }

    properties() {
        const o = this.opening;
        const fields = [
            { key: "offset", label: "Along wall", value: o.offset, unit: "m", step: 0.05 },
            { key: "width", label: "Width", value: o.width, unit: "m", step: 0.05 },
            { key: "height", label: "Height", value: o.height, unit: "m", step: 0.05 },
        ];
        if (this.caps.vertical) fields.push({ key: "sill", label: "Sill", value: o.sill, unit: "m", step: 0.05 });

        const sections = [
            { title: this.label, fields },
            {
                title: "Placement",
                text: this.caps.vertical
                    ? "Slides along its wall and up or down it."
                    : "Slides along its wall and always stands on the floor.",
            },
        ];
        if (o.door) {
            sections.push({
                title: "Door",
                fields: [
                    {
                        key: "doorType",
                        label: "Type",
                        type: "select",
                        value: o.door.type,
                        options: Object.entries(DOOR_TYPES).map(([value, d]) => ({ value, label: d.label })),
                    },
                    {
                        key: "swing",
                        label: "Swing",
                        type: "select",
                        value: o.door.swing,
                        options: DOOR_SWINGS.map((value) => ({ value, label: value.replace("_", " ") })),
                    },
                ],
            });
        }
        return sections;
    }

    gizmoSpec(tool) {
        if (tool !== "move") return null;
        const pose = this.getPose();
        return {
            tool,
            pivot: pose.position.clone().add(_v.set(0, 0.05, 0)),
            frame: yawQuaternion(pose.yaw, _q.clone()),
            axes: this.caps.vertical ? ["x", "z"] : ["x"],
            planes: this.caps.vertical ? ["y"] : [],
        };
    }
}

// ---------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------

export class VehicleEditable extends Editable {
    constructor(editor, car) {
        super(editor, `car:${car.spec.id}`);
        this.car = car;
        this.object3d = car.group;
        this.type = "car";
        this.icon = "car";
        this.rideHeight = car.group.position.y - car.spec.elevation;
        this.caps = {
            move: "horizontal",
            rotate: true,
            scale: false,
            gravity: true,
            carry: false,
            fit: true,
            duplicate: false,
            remove: false,
        };
    }

    get label() {
        return "Car";
    }

    getPose() {
        return { position: this.object3d.position.clone(), yaw: this.car.heading, scale: new THREE.Vector3(1, 1, 1) };
    }

    applyPose(pose) {
        const car = this.car;
        car.group.position.copy(pose.position);
        car.group.rotation.set(0, pose.yaw, 0);
        car.heading = pose.yaw;
        car.speed = 0;
        car.verticalVelocity = 0;
        car.group.updateMatrixWorld(true);

        car.spec.position = [round(pose.position.x), round(pose.position.z)];
        car.spec.elevation = round(pose.position.y - this.rideHeight);
        car.spec.yaw = round(normaliseDegrees(pose.yaw / DEG), 3);
        this.moved();
    }

    properties() {
        return [
            { title: "Transform", fields: this.transformFields({ vertical: false }) },
            { title: "Driving", text: "Press F beside it in the walkthrough to drive." },
        ];
    }
}

// ---------------------------------------------------------------------

function localHull(pose, quat, centre, half) {
    return {
        center: new THREE.Vector3(...centre).applyQuaternion(quat).add(pose.position),
        half: new THREE.Vector3(...half),
        quat,
    };
}

export function normaliseDegrees(degrees) {
    let d = ((degrees % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
}

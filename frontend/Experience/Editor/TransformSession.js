import * as THREE from "three";

import { AXES, DEG, PLANE_AXES, yawQuaternion } from "./axes.js";
import Snapper, { STEP_UP } from "./Snapper.js";

/**
 * One move, turn or scale, from the moment it starts to the moment it is
 * confirmed or cancelled — whether it began with G/R/S, a gizmo handle, or
 * a drag on the object itself.
 *
 * Every pointer update goes through the same pipeline:
 *
 *   pointer -> raw pose (constraint, typed value)
 *           -> snapped pose (increment, surface, flush)   unless Shift
 *           -> fit test (the piece and anything riding on it)
 *
 * A pose that fits is applied. One that does not is shown as a red ghost
 * while the piece itself waits at the last place it did fit; confirming
 * leaves it there. So nothing can be put somewhere it does not fit, and
 * moving a piece through a wall into the next room still works — the
 * ghost goes through, and the piece catches up once the ghost is clear.
 *
 * Constraints follow Blender: X/Y/Z lock to an axis (again for the
 * object's own axis, a third time to release), Shift+X/Y/Z lock to the
 * plane without that axis, and typing a number sets the value exactly.
 *
 * Where the pointer started is fixed when the session starts — its ray,
 * its angle round the pivot, its distance from it — rather than re-read
 * from the camera on every update. From the walkthrough the camera is what
 * moves while the cursor stays put, so re-reading them would cancel every
 * move out. There, too, R and S follow the head instead: the crosshair is
 * usually on the pivot, where an angle or a distance round it means little.
 */

/** From the walkthrough: degrees of rotation per degree the head turns. */
const FIELD_TURN = 2;
/** From the walkthrough: scale doubles for about 25 degrees looked up. */
const FIELD_SCALE = 1.6;

const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane();
const _point = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

export default class TransformSession {
    /**
     * @param {Editor} editor
     * @param {Editable} editable
     * @param {"move"|"rotate"|"scale"} kind
     * @param {object} options
     *   pointer  {x, y} client position the drag starts from
     *   source   "modal" (key), "gizmo" (handle) or "drag" (the object)
     *   handle   gizmo handle, for gizmo drags
     *   isNew    a piece just added or duplicated: cancelling removes it
     */
    constructor(editor, editable, kind, options = {}) {
        this.editor = editor;
        this.editable = editable;
        this.kind = kind;
        this.source = options.source || "modal";
        this.isNew = Boolean(options.isNew);
        this.orientation = editor.orientation;
        /** Driven by the crosshair, from the walkthrough. */
        this.field = !editor.active;

        this.startPointer = { ...options.pointer };
        this.pointer = { ...options.pointer };
        this.shift = false;
        this.numeric = "";

        this.startPose = clonePose(editable.getPose());
        // A drag passes the ray from when the button went down, before the
        // view turned; anything else starts from now.
        this.startRay = options.startRay ? options.startRay.clone() : this.rayFor(this.startPointer);
        this.startLook = this.field ? { ...editor.cameraRig.angles } : null;
        const screen = editor.toScreen(this.startPose.position);
        this.startSpread = Math.hypot(this.startPointer.x - screen.x, this.startPointer.y - screen.y);
        this.lastValid = this.isNew ? null : clonePose(this.startPose);
        this.status = { ok: true };

        this.constraint = { axis: null, plane: null, local: false };
        const handle = options.handle;
        if (handle?.type === "axis") this.constraint.axis = handle.axis;
        if (handle?.type === "plane") this.constraint.plane = handle.axis;
        if (handle?.type === "ring") this.constraint.axis = "z";
        if (editable.caps.move === "wall" && !this.constraint.axis && !this.constraint.plane) {
            if (editable.caps.vertical) this.constraint.plane = "y";
            else this.constraint.axis = "x";
        }
        if (handle) this.constraint.local = editor.orientation === "local";
        this.handle = handle || null;

        this.exclude = new Set([editable]);
        this.riders = [];
        if (editable.caps.carry && !this.isNew) {
            this.riders = editor.ridersOf(editable).map((rider) => ({
                editable: rider,
                start: clonePose(rider.getPose()),
            }));
            for (const { editable: rider } of this.riders) this.exclude.add(rider);
        }

        // Overlaps with other pieces that were there before the move are
        // carried through it. Walls excuse nothing: a piece that starts a few
        // centimetres into one is pushed flush by the face snapping on its
        // first move — whatever axis it is locked to — or stays put until
        // it is clear.
        this.ignore = new Set();
        this.startBlocked = false;
        // The visitor standing against a piece already — beside a table,
        // under its overhang — is carried through the move the same way.
        this.visitorAtStart = !this.isNew && editor.fit.hitsVisitor(editable.hulls(this.startPose));
        if (editable.caps.fit && !this.isNew) {
            this.ignore = editor.fit.touching(editable.hulls(this.startPose), this.exclude);
            for (const rider of this.riders) {
                for (const key of editor.fit.touching(rider.editable.hulls(rider.start), this.exclude)) this.ignore.add(key);
            }
            this.startBlocked = !this.check(this.startPose).ok;
        }

        // Standing on something at the start means staying on something.
        this.gravity = false;
        if (editable.caps.gravity) {
            if (this.isNew) {
                this.gravity = true;
            } else {
                const bottom = editable.bottom(this.startPose);
                const support = editor.snapper.supportUnder(editable.footprint(this.startPose), bottom, this.exclude);
                this.gravity = support !== null && Math.abs(support - bottom) < 0.03;
            }
        }

        this.accumulatedAngle = 0;
        this.previousAngle = kind === "rotate" ? this.pointerAngle(this.startPointer, this.startRay) : null;

        // A new piece has nowhere to be yet, so it is placed straight away;
        // an existing one stays put until the pointer actually moves.
        if (this.isNew) {
            editable.setHidden(true);
            this.update(this.pointer, false);
        }
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------

    /** X / Y / Z: global, then local, then none — as Blender cycles them. */
    toggleAxis(axis) {
        const c = this.constraint;
        if (this.editable.caps.move === "wall") {
            // Along the wall, or (windows) up and down it; again to free.
            if (axis === "y" || (axis === "z" && !this.editable.caps.vertical)) return;
            const vertical = this.editable.caps.vertical;
            if (c.axis === axis && vertical) Object.assign(c, { axis: null, plane: "y" });
            else Object.assign(c, { axis, plane: null });
            this.update(this.pointer, this.shift);
            return;
        }
        if (c.axis === axis && !c.plane) {
            if (!c.local) c.local = true;
            else Object.assign(c, { axis: null, local: false });
        } else {
            Object.assign(c, { axis, plane: null, local: this.orientation === "local" });
        }
        this.update(this.pointer, this.shift);
    }

    togglePlane(axis) {
        if (this.editable.caps.move === "wall") return;
        const c = this.constraint;
        if (c.plane === axis) {
            if (!c.local) c.local = true;
            else Object.assign(c, { plane: null, local: false });
        } else {
            Object.assign(c, { axis: null, plane: axis, local: this.orientation === "local" });
        }
        this.update(this.pointer, this.shift);
    }

    type(key) {
        if (key === "Backspace") this.numeric = this.numeric.slice(0, -1);
        else if (key === "-") this.numeric = this.numeric.startsWith("-") ? this.numeric.slice(1) : `-${this.numeric}`;
        else if (/^[0-9.]$/.test(key)) this.numeric += key;
        this.update(this.pointer, this.shift);
    }

    get typedValue() {
        const value = parseFloat(this.numeric);
        return Number.isFinite(value) ? value : null;
    }

    setShift(shift) {
        if (shift === this.shift) return;
        this.update(this.pointer, shift);
    }

    // ------------------------------------------------------------------
    // Pipeline
    // ------------------------------------------------------------------

    update(pointer, shift) {
        this.pointer = { ...pointer };
        this.shift = shift;
        const snap = this.editor.snapEnabled && !shift;

        if (this.editable.caps.move === "wall" && this.kind === "move") {
            this.updateWallOpening(snap);
            return;
        }

        let candidate;
        if (this.kind === "move") candidate = this.proposeMove(snap);
        else if (this.kind === "rotate") candidate = this.proposeRotate(snap);
        else candidate = this.proposeScale(snap);
        if (!candidate) return;

        this.resolve(candidate, snap);
    }

    /** The frame constraint axes are read in: world, or the piece's own. */
    frame() {
        if (this.constraint.local || this.editable.caps.move === "wall") {
            return yawQuaternion(this.startPose.yaw);
        }
        return new THREE.Quaternion();
    }

    rayFor(pointer) {
        _ray.setFromCamera(this.editor.toNdc(pointer), this.editor.camera);
        return _ray.ray.clone();
    }

    /** Where a pointer ray meets the constraint, relative to the pivot. */
    projectRay(ray, frame) {
        const pivot = this.startPose.position;
        const { axis, plane } = this.constraint;

        if (axis) {
            const dir = _v.copy(AXES[axis]).applyQuaternion(frame).normalize();
            // Closest point on the axis line to the ray.
            const w0 = _w.copy(pivot).sub(ray.origin);
            const b = dir.dot(ray.direction);
            const d = dir.dot(w0);
            const e = ray.direction.dot(w0);
            const denominator = 1 - b * b;
            if (denominator < 1e-5) return null;
            const s = (b * e - d) / denominator;
            return dir.clone().multiplyScalar(s);
        }

        const normal = plane
            ? _v.copy(AXES[plane]).applyQuaternion(frame).normalize()
            : _v.set(0, 1, 0);
        _plane.setFromNormalAndCoplanarPoint(normal, pivot);
        if (Math.abs(ray.direction.dot(normal)) < 0.015) return null;
        if (!ray.intersectPlane(_plane, _point)) return null;
        return _point.clone().sub(pivot);
    }

    proposeMove(snap) {
        const frame = this.frame();
        const start = this.projectRay(this.startRay, frame);
        const now = this.projectRay(this.rayFor(this.pointer), frame);
        const { axis, plane } = this.constraint;
        const step = this.editor.increment;

        let delta;
        const typed = this.typedValue;
        if (typed !== null) {
            delta = _v.copy(AXES[axis || "x"]).applyQuaternion(frame).multiplyScalar(typed).clone();
        } else {
            if (!start || !now) return null;
            delta = now.sub(start);

            if (snap) {
                // Round in the constraint's own axes.
                const inverse = frame.clone().invert();
                const local = delta.clone().applyQuaternion(inverse);
                const b = { x: local.x, y: -local.z, z: local.y };
                const free = axis ? [axis] : plane ? PLANE_AXES[plane] : ["x", "y"];
                for (const key of ["x", "y", "z"]) {
                    b[key] = free.includes(key) ? Snapper.step(b[key], step) : 0;
                }
                delta = new THREE.Vector3(b.x, b.z, -b.y).applyQuaternion(frame);
            }
        }

        if (this.editable.caps.move === "horizontal") delta.y = 0;

        const pose = clonePose(this.startPose);
        pose.position.add(delta);
        pose.moveFrame = frame;
        return pose;
    }

    proposeRotate(snap) {
        if (!this.editable.caps.rotate) return null;
        const pose = clonePose(this.startPose);
        const typed = this.typedValue;

        if (typed !== null) {
            pose.yaw = this.startPose.yaw + typed * DEG;
        } else if (this.field && this.handle?.type !== "ring") {
            // Look left and it turns left, twice as far as the head.
            const turned = this.editor.cameraRig.angles.horizontal - this.startLook.horizontal;
            pose.yaw = this.startPose.yaw + turned * FIELD_TURN;
            if (snap) pose.yaw = Snapper.step(pose.yaw, this.editor.angleIncrement * DEG);
        } else {
            const angle = this.pointerAngle(this.pointer);
            if (angle === null) return null;
            if (this.previousAngle === null) this.previousAngle = angle;
            let step = angle - this.previousAngle;
            if (step > Math.PI) step -= Math.PI * 2;
            if (step < -Math.PI) step += Math.PI * 2;
            this.accumulatedAngle += step;
            this.previousAngle = angle;
            pose.yaw = this.startPose.yaw + this.accumulatedAngle;
            if (snap) pose.yaw = Snapper.step(pose.yaw, this.editor.angleIncrement * DEG);
        }
        return pose;
    }

    /**
     * Angle of the pointer around the pivot. On the ring it is measured in
     * the floor plane, so the handle turns with the cursor; otherwise
     * around the pivot on screen, as Blender's R does.
     */
    pointerAngle(pointer, ray = null) {
        const pivot = this.startPose.position;
        if (this.handle?.type === "ring") {
            ray = ray || this.rayFor(pointer);
            _plane.setFromNormalAndCoplanarPoint(_v.set(0, 1, 0), pivot);
            if (!ray.intersectPlane(_plane, _point)) return null;
            return Math.atan2(-(_point.z - pivot.z), _point.x - pivot.x);
        }
        const screen = this.editor.toScreen(pivot);
        const angle = Math.atan2(-(pointer.y - screen.y), pointer.x - screen.x);
        // Seen from below, turning the cursor anticlockwise turns the piece
        // the other way.
        const camera = this.editor.camera;
        return camera.position.y < pivot.y ? -angle : angle;
    }

    proposeScale(snap) {
        const caps = this.editable.caps;
        if (!caps.scale) return null;
        const pose = clonePose(this.startPose);

        let factor = this.typedValue;
        if (factor === null && this.field && !this.handle) {
            // Look up to grow it, down to shrink it. The camera's vertical
            // angle rises as the view tilts down.
            const raised = this.startLook.vertical - this.editor.cameraRig.angles.vertical;
            factor = Math.exp(raised * FIELD_SCALE);
            if (snap) factor = Math.max(0.1, Snapper.step(factor, 0.1));
        } else if (factor === null) {
            const screen = this.editor.toScreen(this.startPose.position);
            const d0 = this.startSpread;
            const d1 = Math.hypot(this.pointer.x - screen.x, this.pointer.y - screen.y);
            if (d0 < 4) return null;
            factor = d1 / d0;
            if (snap) factor = Math.max(0.1, Snapper.step(factor, 0.1));
        }

        if (caps.scale === "uniform") {
            pose.scale.copy(this.startPose.scale).multiplyScalar(factor);
        } else {
            // Width and depth independently: X is width, Y (Blender) depth.
            const axis = this.constraint.axis;
            if (!axis || axis === "x") pose.scale.x = this.startPose.scale.x * factor;
            if (!axis || axis === "y") pose.scale.z = this.startPose.scale.z * factor;
            if (snap && this.typedValue === null) {
                const step = Math.min(this.editor.increment, 0.1);
                pose.scale.x = Math.max(step, Snapper.step(pose.scale.x, step));
                pose.scale.z = Math.max(step, Snapper.step(pose.scale.z, step));
            }
        }
        this.editable.clampScale(pose.scale);
        return pose;
    }

    // ------------------------------------------------------------------
    // Snapping and the fit test
    // ------------------------------------------------------------------

    resolve(candidate, snap) {
        const editable = this.editable;
        const vertical = this.constraint.axis === "z" || ["x", "y"].includes(this.constraint.plane);

        if (this.kind === "move" && snap && this.typedValue === null) {
            if (this.gravity && !vertical) {
                this.rest(candidate);
            } else if (vertical && editable.caps.gravity) {
                // Lifting: settle onto a surface within reach.
                const bottom = editable.bottom(candidate);
                const support = this.editor.snapper.supportUnder(editable.footprint(candidate), bottom - 0.1, this.exclude);
                if (support !== null && Math.abs(support - bottom) < 0.1) {
                    candidate.position.y += support - bottom;
                }
            }
        }

        const options = this.flushOptions(candidate, snap, vertical);
        for (const option of options) {
            const result = this.check(option);
            if (result.ok) {
                this.accept(option);
                return;
            }
            if (option === options[options.length - 1]) this.reject(option, result);
        }
    }

    /** Drop onto the highest surface under the piece. */
    rest(pose) {
        const bottom = this.editable.bottom(pose);
        const support = this.editor.snapper.supportUnder(this.editable.footprint(pose), bottom, this.exclude);
        if (support !== null) pose.position.y += support - bottom;
    }

    /**
     * The candidate pulled flush against nearby faces along both of its
     * axes, then either one, then neither — the first that fits wins.
     */
    flushOptions(candidate, snap, vertical) {
        // A typed value is exact — except that a piece which started inside
        // a wall may still be pushed out of it, across the typed axis.
        const typed = this.typedValue !== null && !this.startBlocked;
        if (!(this.kind === "move" && snap && !typed && this.editable.caps.fit)) {
            return [candidate];
        }
        if (vertical) return [candidate];

        const { axis, plane } = this.constraint;
        let allowed = null;
        if (axis && !this.startBlocked) allowed = AXES[axis].clone().applyQuaternion(candidate.moveFrame || _q.identity()).normalize();
        if (plane && plane !== "z") return [candidate];

        const correction = this.editor.snapper.flush(this.editable.footprint(candidate), this.exclude, allowed);
        const options = [];
        const withDelta = (...deltas) => {
            const pose = clonePose(candidate);
            for (const d of deltas) if (d) pose.position.add(d);
            if (this.gravity) this.rest(pose);
            return pose;
        };
        if (correction.u && correction.v) options.push(withDelta(correction.u, correction.v));
        if (correction.u) options.push(withDelta(correction.u));
        if (correction.v) options.push(withDelta(correction.v));
        options.push(candidate);
        return options;
    }

    check(pose) {
        if (!this.editable.caps.fit) return { ok: true };
        const fit = this.editor.fit;
        const hulls = this.editable.hulls(pose);
        const own = fit.test(hulls, { exclude: this.exclude, ignore: this.ignore });
        if (!own.ok) return own;
        if (!this.visitorAtStart && fit.hitsVisitor(hulls)) {
            return { ok: false, blocker: { key: "visitor", label: "You", reason: "would be where you're standing" } };
        }

        for (const rider of this.riders) {
            const result = fit.test(rider.editable.hulls(this.riderPose(rider, pose)), {
                exclude: this.exclude,
                ignore: this.ignore,
            });
            if (!result.ok) return result;
        }
        return { ok: true };
    }

    /** Where a rider goes when the piece under it moves to `pose`. */
    riderPose(rider, pose) {
        const turn = pose.yaw - this.startPose.yaw;
        const out = clonePose(rider.start);
        out.position
            .sub(this.startPose.position)
            .applyAxisAngle(AXES.z, turn)
            .add(pose.position);
        out.yaw += turn;
        return out;
    }

    accept(pose) {
        this.editable.applyPose(pose);
        for (const rider of this.riders) rider.editable.applyPose(this.riderPose(rider, pose));
        this.current = clonePose(pose);
        // A half-typed number ("4" on the way to "45") is shown but is not
        // somewhere to fall back to.
        if (this.typedValue === null) this.lastValid = clonePose(pose);
        this.status = { ok: true };
        if (this.isNew) this.editable.setHidden(false);
        this.editor.ghost.hide();
        this.editor.onSessionUpdate(this);
    }

    reject(pose, result) {
        this.status = { ok: false, blocker: result.blocker };
        if (!this.lastValid) this.editable.setHidden(true);
        this.editor.ghost.show(this.editable, pose);
        this.editor.onSessionUpdate(this);
    }

    // ------------------------------------------------------------------
    // Doors and windows: slide along the wall
    // ------------------------------------------------------------------

    updateWallOpening(snap) {
        const editable = this.editable;
        const frame = this.frame();
        const typed = this.typedValue;
        const start = this.projectRay(this.startRay, frame);
        const now = this.projectRay(this.rayFor(this.pointer), frame);
        if (typed === null && (!start || !now)) return;

        const along = _v.copy(AXES.x).applyQuaternion(frame);
        const delta = typed !== null ? null : now.clone().sub(start);

        let offset = this.startPose.offset;
        let sill = this.startPose.sill;
        const constrained = this.constraint.axis;

        if (typed !== null) {
            if (constrained === "z") sill += typed;
            else offset += typed;
        } else {
            if (constrained !== "z") offset += delta.dot(along);
            if (editable.caps.vertical && constrained !== "x") sill += delta.y;
            if (snap) {
                offset = this.startPose.offset + Snapper.step(offset - this.startPose.offset, this.editor.increment);
                sill = this.startPose.sill + Snapper.step(sill - this.startPose.sill, this.editor.increment);
                // Centre of the wall is worth a pull of its own.
                const centre = editable.wallLength / 2;
                if (Math.abs(offset - centre) < 0.12) offset = centre;
            }
        }

        const range = editable.allowedRange(this.startPose.offset);
        const clamped = THREE.MathUtils.clamp(offset, range[0], range[1]);
        const sillRange = editable.sillRange();
        const clampedSill = editable.caps.vertical ? THREE.MathUtils.clamp(sill, sillRange[0], sillRange[1]) : 0;

        this.status =
            Math.abs(clamped - offset) > 0.005
                ? { ok: false, blocker: { label: range.blockedBy || "the end of the wall" }, soft: true }
                : { ok: true };

        editable.setPlacement(clamped, clampedSill);
        this.lastValid = editable.getPose();
        this.current = this.lastValid;
        this.editor.onSessionUpdate(this);
    }

    // ------------------------------------------------------------------

    /** @returns {"changed"|"unchanged"|"removed"} */
    confirm() {
        this.editor.ghost.hide();
        const final = this.status.ok || this.status.soft ? this.current || this.lastValid : this.lastValid;
        if (!final) return "removed";
        // The ghost is where the cursor is; the piece stays where it fit.
        if (final !== this.current) this.applyFinal(final);
        this.editable.setHidden(false);
        return posesEqual(final, this.startPose) && !this.isNew ? "unchanged" : "changed";
    }

    applyFinal(pose) {
        this.editable.applyPose(pose);
        for (const rider of this.riders) rider.editable.applyPose(this.riderPose(rider, pose));
    }

    cancel() {
        this.cancelled = true;
        this.editor.ghost.hide();
        if (this.isNew) return "removed";
        this.editable.applyPose(this.startPose);
        for (const rider of this.riders) rider.editable.applyPose(rider.start);
        this.editable.setHidden(false);
        return "unchanged";
    }

    /** One line for the viewport header, as Blender prints it. */
    describe() {
        const c = this.constraint;
        const where = this.editable.caps.move === "wall"
            ? c.axis === "z" ? " up the wall" : c.axis ? " along the wall" : " in the wall"
            : c.axis
            ? ` along ${c.local ? "local" : "global"} ${c.axis.toUpperCase()}`
            : c.plane
              ? ` locking ${c.local ? "local" : "global"} ${c.plane.toUpperCase()}`
              : "";
        const typed = this.numeric ? `  [${this.numeric}|]` : "";

        let value = "";
        const pose = this.current || this.lastValid || this.startPose;
        if (this.kind === "move") {
            if (this.editable.caps.move === "wall") {
                value = `Offset ${(pose.offset - this.startPose.offset).toFixed(2)} m`;
            } else {
                const d = pose.position.clone().sub(this.startPose.position);
                value = `D ${d.x.toFixed(2)}  ${(-d.z).toFixed(2)}  ${d.y.toFixed(2)} m`;
            }
        } else if (this.kind === "rotate") {
            value = `Rot ${((pose.yaw - this.startPose.yaw) / DEG).toFixed(1)}°`;
        } else {
            value = `Scale ${(pose.scale.x / this.startPose.scale.x).toFixed(2)}`;
        }
        const name = { move: "Move", rotate: "Rotate", scale: "Scale" }[this.kind];
        return `${name}  ${value}${where}${typed}`;
    }
}

export function clonePose(pose) {
    return {
        ...pose,
        position: pose.position.clone(),
        scale: pose.scale.clone(),
    };
}

export function posesEqual(a, b) {
    return (
        a.position.distanceTo(b.position) < 1e-4 &&
        Math.abs(a.yaw - b.yaw) < 1e-5 &&
        a.scale.distanceTo(b.scale) < 1e-5 &&
        (a.offset === undefined || Math.abs(a.offset - b.offset) < 1e-4) &&
        (a.sill === undefined || Math.abs(a.sill - b.sill) < 1e-4)
    );
}

export { STEP_UP };

import * as THREE from "three";

import { DOOR_TYPES } from "../../../shared/catalog.js";
import { mergeParts, mirror } from "./Builders/KitLibrary.js";

/**
 * An openable door sitting in a wall opening.
 *
 * Built in the wall's local frame — X along the wall, Y up, Z through the
 * thickness — so the parent wall group's transform puts it in the world.
 *
 * Collision is deliberately *not* handled by the scene octree. That octree
 * is built once and is static, so a leaf that swings would either block a
 * doorway forever or never block it at all. Instead a closed door exposes an
 * oriented box that the player resolves against each frame, and an open one
 * exposes nothing.
 */

const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _push = new THREE.Vector3();

/** Below this openness a leaf still blocks the way. */
const BLOCKING_THRESHOLD = 0.3;

/** A leaf's thickness. */
const LEAF_T = 0.04;
/** Hinge knuckles' centres, out from the middle of the leaf. */
const KNUCKLE = LEAF_T / 2 + 0.002;
/** Handle height above the floor, on the leaf's lock rail. */
const HANDLE_Y = 1.05;
/** Handle spindle, in from the leaf's free edge. */
const BACKSET = 0.065;

export default class Door {
    /**
     * @param {object} opening  validated opening spec (type === "door")
     * @param {object} wall     the wall it sits in
     * @param {number} offsetFromCentre  opening centre in wall-local X
     * @param {MaterialLibrary} materials
     * @param {KitLibrary} [kit]  the Blender kit of parts; boxes without it
     */
    constructor(opening, wall, offsetFromCentre, materials, kit = null) {
        this.spec = opening;
        this.wall = wall;
        this.materials = materials;
        this.kit = kit;

        this.config = DOOR_TYPES[opening.door?.type] || DOOR_TYPES.hinged;
        this.motion = this.config.motion;
        this.swing = opening.door?.swing || "inward_right";

        this.width = opening.width;
        this.height = opening.height;
        this.thickness = wall.thickness;

        // 0 = shut, 1 = fully open. Eased toward `target` each frame.
        this.open = 0;
        this.target = 0;
        this.speed = 2.6;

        this.group = new THREE.Group();
        this.group.name = `door:${opening.id}`;
        this.group.position.set(offsetFromCentre, 0, 0);

        this.leaves = [];
        this.build();

        this.group.userData = {
            kind: "door",
            id: opening.id,
            wallId: wall.id,
            label: this.label(),
            door: this,
        };
    }

    label() {
        const name = this.config.label.toLowerCase();
        return `${name === "hinged" ? "Door" : `${this.config.label} door`}`;
    }

    // ------------------------------------------------------------------
    // Geometry
    // ------------------------------------------------------------------

    build() {
        const kit = this.kit;
        const lining = this.materials.getTrim(this.spec.door?.frame || "trim_white");
        const leafMaterial = this.materials.getTrim(this.spec.door?.leaf || "trim_white");
        const handleMaterial = this.materials.getTrim(
            this.spec.door?.handle || "metal_brass",
            "metal_brass"
        );

        const jamb = 0.06;
        const depth = this.thickness + 0.01;
        const swings = this.motion !== "slide";
        // The face a hinged leaf opens towards: inward swings to -Z.
        const opensTo = this.swing.startsWith("outward") ? 1 : -1;

        const addMesh = (geometry, material, parent = this.group) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            parent.add(mesh);
            return mesh;
        };
        const addBox = (w, h, d, x, y, z, material) => {
            const mesh = addMesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            return mesh;
        };

        // A scene built from an imported model already carries its casings in
        // the mesh, so a standalone door supplies only the moving parts.
        if (this.spec.door?.lining !== "none") {
            // Lining: two jambs and a head, framing the hole. Each stands a
            // millimetre into it, so the lining is what shows there rather
            // than the wall's own reveal, and the two never share a face.
            for (const side of [-1, 1]) {
                addBox(jamb, this.height + jamb, depth, side * ((this.width + jamb) / 2 - 0.001), this.height / 2, 0, lining);
            }
            addBox(this.width + jamb * 2, jamb, depth, 0, this.height + jamb / 2 - 0.001, 0, lining);

            if (swings && kit?.has("door_stop")) this.addStops(lining, opensTo, depth);
        }

        // Leaves.
        const count = this.config.leaves;
        const leafWidth = this.width / count;
        const hinges = swings && kit?.has("door_hinge");
        const handleName = swings ? "door_handle" : "door_pull";

        for (let i = 0; i < count; i++) {
            const hinge = new THREE.Group();

            // Double doors hinge from opposite edges; a single leaf hinges
            // from whichever side the spec asks for.
            const hingeSide =
                count === 2 ? (i === 0 ? -1 : 1) : this.swing.endsWith("left") ? -1 : 1;

            // A hung leaf turns on its hinges' knuckles, which stand just
            // proud of the face it opens towards; the leaf itself is set back
            // by as much, so shut it sits square in the lining.
            const pivot = hinges ? opensTo * KNUCKLE : 0;
            hinge.position.set((hingeSide * this.width) / 2, 0, pivot);
            hinge.userData.hingeSide = hingeSide;

            const size = new THREE.Vector3(leafWidth - 0.01, this.height - 0.02, LEAF_T);
            const leaf = addMesh(
                kit ? kit.fit("door_leaf", size.x, size.y, size.z) : new THREE.BoxGeometry(size.x, size.y, size.z),
                leafMaterial,
                hinge
            );
            // Offset so the leaf spans from the hinge inward.
            leaf.position.set((-hingeSide * leafWidth) / 2, this.height / 2, -pivot);
            leaf.userData.size = size;
            // Leaves swing, so nothing static — the editor's fit test
            // included — may treat them as a fixed obstacle.
            leaf.userData.doorLeaf = true;

            // Handle on both faces, on the lock rail near the free edge, as
            // one mesh. It hangs off the leaf, so a sliding leaf takes it along.
            const handleX = -hingeSide * (leafWidth / 2 - 0.005 - BACKSET);
            const handles = [];
            for (const face of [1, -1]) {
                if (kit?.has(handleName)) {
                    const geometry = kit.part(handleName);
                    // A lever points back towards the hinge, on both faces.
                    if (swings && hingeSide * face > 0) mirror(geometry, "x");
                    if (face < 0) geometry.rotateY(Math.PI);
                    handles.push(geometry.translate(handleX, HANDLE_Y - this.height / 2, (face * LEAF_T) / 2));
                } else {
                    handles.push(
                        new THREE.BoxGeometry(0.11, 0.025, 0.025).translate(
                            -hingeSide * (leafWidth / 2 - 0.14),
                            HANDLE_Y - this.height / 2,
                            face * 0.03
                        )
                    );
                }
            }
            addMesh(this.merged(handles), handleMaterial, leaf).userData.doorLeaf = true;

            // Three butt hinges' knuckles on the pivot line, as one mesh: 15 cm
            // down from the top, 22.5 cm up from the bottom, and one halfway.
            if (hinges) {
                const knuckle = kit.size("door_hinge").y;
                const low = 0.225 + knuckle / 2;
                const high = this.height - 0.15 - knuckle / 2;
                const knuckles = [low, (low + high) / 2, high].map((y) =>
                    kit.part("door_hinge").translate(-hingeSide * 0.003, y, 0)
                );
                addMesh(this.merged(knuckles), handleMaterial, hinge).userData.doorLeaf = true;
            }

            this.group.add(hinge);
            this.leaves.push({ hinge, leaf, hingeSide, leafWidth });
        }
    }

    /** Several geometries as one, the originals freed. */
    merged(geometries) {
        const geometry = mergeParts(geometries);
        for (const part of geometries) part.dispose();
        return geometry;
    }

    /**
     * Stop beads planted round the lining for a hung leaf to close
     * against, on the far side from the way it opens. A thin wall's lining
     * has room for a narrower bead only, or none.
     */
    addStops(material, opensTo, depth) {
        const kit = this.kit;
        const width = Math.min(0.03, depth / 2 - LEAF_T / 2 - 0.003);
        if (width < 0.01) return;

        const z = -opensTo * (LEAF_T / 2 + 0.0005 + width / 2);
        const face = this.width / 2 - 0.001;
        const stand = kit.size("door_stop").x;
        const parts = [];
        for (const side of [-1, 1]) {
            const bead = kit.fit("door_stop", null, this.height, width);
            // Modelled on the left jamb, standing out towards +X.
            if (side > 0) mirror(bead, "x");
            parts.push(bead.translate(side * (face - stand / 2), this.height / 2, z));
        }
        parts.push(
            kit
                .fit("door_stop", null, this.width, width)
                .rotateZ(-Math.PI / 2)
                .translate(0, this.height - 0.001 - stand / 2, z)
        );

        const stops = new THREE.Mesh(this.merged(parts), material);
        stops.name = "door-stops";
        stops.castShadow = true;
        stops.receiveShadow = true;
        // Too small to matter to anything placed near a door.
        stops.userData.decor = true;
        this.group.add(stops);
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    toggle() {
        this.target = this.target > 0.5 ? 0 : 1;
        return this.target > 0.5;
    }

    setOpen(open) {
        this.target = open ? 1 : 0;
    }

    get isOpen() {
        return this.open > 0.5;
    }

    /** Open, or on its way: what toggling it would undo. */
    get isOpening() {
        return this.target > 0.5;
    }

    get isMoving() {
        return Math.abs(this.open - this.target) > 0.001;
    }

    update(delta) {
        if (!this.isMoving) return;

        const step = this.speed * delta;
        const diff = this.target - this.open;
        this.open += Math.sign(diff) * Math.min(Math.abs(diff), step);

        // Ease-out so it settles rather than stopping dead.
        const eased = 1 - Math.pow(1 - this.open, 2);

        for (const { hinge, leaf, hingeSide, leafWidth } of this.leaves) {
            if (this.motion === "slide") {
                // Slide the leaf back along the wall, into the reveal.
                leaf.position.x =
                    (-hingeSide * leafWidth) / 2 + hingeSide * eased * (leafWidth - 0.04);
                leaf.position.z = eased * 0.06;
            } else {
                const outward = this.swing.startsWith("outward") ? -1 : 1;
                hinge.rotation.y = -hingeSide * outward * eased * (Math.PI * 0.52);
            }
        }
    }

    // ------------------------------------------------------------------
    // Collision
    // ------------------------------------------------------------------

    /**
     * Oriented box for each leaf that should still block movement, in world
     * space. Empty once the door is open enough to walk through.
     */
    getBlockers() {
        if (this.open >= BLOCKING_THRESHOLD) return [];

        const blockers = [];
        for (const { leaf } of this.leaves) {
            leaf.getWorldPosition(_worldPos);
            leaf.getWorldQuaternion(_worldQuat);

            blockers.push({
                centre: _worldPos.clone(),
                quaternion: _worldQuat.clone(),
                half: leaf.userData.size.clone().multiplyScalar(0.5),
            });
        }
        return blockers;
    }

    /**
     * Push a vertical capsule out of a closed leaf.
     *
     * Treated as a cylinder-versus-box problem in the box's local frame:
     * the capsule is always upright, so only the horizontal plane matters
     * once the heights are known to overlap.
     *
     * @returns {boolean} whether the capsule was moved
     */
    static resolveCapsule(capsule, blocker) {
        _invQuat.copy(blocker.quaternion).invert();

        // Capsule midpoint in the box's local frame.
        _local
            .copy(capsule.start)
            .add(capsule.end)
            .multiplyScalar(0.5)
            .sub(blocker.centre)
            .applyQuaternion(_invQuat);

        const halfHeight = (capsule.end.y - capsule.start.y) / 2 + capsule.radius;
        if (Math.abs(_local.y) > blocker.half.y + halfHeight) return false;

        // Closest point on the box footprint, in local XZ.
        const cx = THREE.MathUtils.clamp(_local.x, -blocker.half.x, blocker.half.x);
        const cz = THREE.MathUtils.clamp(_local.z, -blocker.half.z, blocker.half.z);

        const dx = _local.x - cx;
        const dz = _local.z - cz;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq >= capsule.radius * capsule.radius) return false;

        if (distanceSq > 1e-8) {
            // Outside the footprint but within the radius: push straight out.
            const distance = Math.sqrt(distanceSq);
            _push.set((dx / distance) * (capsule.radius - distance), 0, (dz / distance) * (capsule.radius - distance));
        } else {
            // Centre is inside the box: escape along the shallowest axis.
            const penX = blocker.half.x + capsule.radius - Math.abs(_local.x);
            const penZ = blocker.half.z + capsule.radius - Math.abs(_local.z);
            if (penZ <= penX) {
                _push.set(0, 0, Math.sign(_local.z || 1) * penZ);
            } else {
                _push.set(Math.sign(_local.x || 1) * penX, 0, 0);
            }
        }

        _push.applyQuaternion(blocker.quaternion);
        capsule.translate(_push);
        return true;
    }

    dispose() {
        this.group.traverse((child) => {
            if (child.isMesh) child.geometry.dispose();
        });
    }
}

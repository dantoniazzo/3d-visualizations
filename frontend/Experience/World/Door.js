import * as THREE from "three";

import { DOOR_TYPES } from "../../../shared/catalog.js";

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

export default class Door {
    /**
     * @param {object} opening  validated opening spec (type === "door")
     * @param {object} wall     the wall it sits in
     * @param {number} offsetFromCentre  opening centre in wall-local X
     * @param {MaterialLibrary} materials
     */
    constructor(opening, wall, offsetFromCentre, materials) {
        this.spec = opening;
        this.wall = wall;
        this.materials = materials;

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
        const lining = this.materials.getTrim(this.spec.door?.frame || "trim_white");
        const leafMaterial = this.materials.getTrim(this.spec.door?.leaf || "trim_white");
        const handleMaterial = this.materials.getTrim(
            this.spec.door?.handle || "metal_brass",
            "metal_brass"
        );

        const jamb = 0.06;
        const depth = this.thickness + 0.01;

        // Lining: two jambs and a head, framing the hole.
        const addBox = (w, h, d, x, y, z, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
            return mesh;
        };

        // A scene built from an imported model already carries its casings in
        // the mesh, so a standalone door supplies only the moving parts.
        if (this.spec.door?.lining !== "none") {
            for (const side of [-1, 1]) {
                addBox(jamb, this.height + jamb, depth, (side * (this.width + jamb)) / 2, this.height / 2, 0, lining);
            }
            addBox(this.width + jamb * 2, jamb, depth, 0, this.height + jamb / 2, 0, lining);
        }

        // Leaves.
        const count = this.config.leaves;
        const leafWidth = this.width / count;

        for (let i = 0; i < count; i++) {
            const hinge = new THREE.Group();

            // Double doors hinge from opposite edges; a single leaf hinges
            // from whichever side the spec asks for.
            const hingeSide =
                count === 2 ? (i === 0 ? -1 : 1) : this.swing.endsWith("left") ? -1 : 1;

            hinge.position.set((hingeSide * this.width) / 2, 0, 0);
            hinge.userData.hingeSide = hingeSide;

            const leaf = new THREE.Mesh(
                new THREE.BoxGeometry(leafWidth - 0.01, this.height - 0.02, 0.04),
                leafMaterial
            );
            // Offset so the leaf spans from the hinge inward.
            leaf.position.set((-hingeSide * leafWidth) / 2, this.height / 2, 0);
            leaf.castShadow = true;
            leaf.receiveShadow = true;
            hinge.add(leaf);

            // Handle on both faces, near the free edge.
            for (const z of [0.03, -0.03]) {
                const handle = new THREE.Mesh(
                    new THREE.BoxGeometry(0.11, 0.025, 0.025),
                    handleMaterial
                );
                handle.position.set(
                    -hingeSide * (leafWidth - 0.14),
                    1.05,
                    z
                );
                hinge.add(handle);
            }

            this.group.add(hinge);
            this.leaves.push({ hinge, leaf, hingeSide, leafWidth });
        }
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
                half: new THREE.Vector3(
                    (leaf.geometry.parameters.width / 2),
                    (leaf.geometry.parameters.height / 2),
                    (leaf.geometry.parameters.depth / 2)
                ),
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

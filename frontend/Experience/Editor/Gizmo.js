import * as THREE from "three";

import { AXES, AXIS_COLORS, PLANE_AXES } from "./axes.js";

/**
 * The transform gizmo, drawn over the scene in its own overlay pass.
 *
 * Same vocabulary as Blender's: arrows move along an axis, the small
 * squares move in the plane they sit in (coloured by that plane's normal),
 * the white ring in the middle moves freely, the ring around the object
 * turns it, and the cubes scale.
 *
 * The gizmo knows nothing about what it is attached to beyond a pivot, a
 * frame and which handles to show; dragging a handle is the Editor's
 * business. Each handle has a visible mesh and a fatter invisible picker,
 * so thin arrows are still easy to grab.
 */

const SIZE_PX = 105;
const HOVER = new THREE.Color(0xffffff);

function material(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        fog: false,
    });
}

const pickerMaterial = new THREE.MeshBasicMaterial({ visible: false });

/** Rotation taking +Y onto `direction`. */
const along = (direction) =>
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

export default class Gizmo {
    constructor(overlay) {
        this.root = new THREE.Group();
        this.root.name = "gizmo";
        this.root.visible = false;
        overlay.add(this.root);

        this.handles = new Map();
        this.pickers = [];
        this.hovered = null;
        this.activeHandle = null;

        this.build();
    }

    addHandle(name, info, visuals, picker) {
        const group = new THREE.Group();
        group.name = `handle:${name}`;
        for (const mesh of visuals) {
            mesh.renderOrder = 1000;
            group.add(mesh);
        }
        picker.material = pickerMaterial;
        picker.userData.handle = name;
        group.add(picker);
        this.root.add(group);
        this.pickers.push(picker);

        const colors = visuals.map((m) => m.material.color.clone());
        this.handles.set(name, { ...info, name, group, visuals, colors });
    }

    build() {
        for (const axis of ["x", "y", "z"]) {
            const dir = AXES[axis];
            const color = AXIS_COLORS[axis];
            const q = along(dir);

            // Move arrow.
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.72, 8), material(color));
            shaft.position.copy(dir).multiplyScalar(0.12 + 0.36);
            shaft.quaternion.copy(q);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 16), material(color));
            cone.position.copy(dir).multiplyScalar(0.92);
            cone.quaternion.copy(q);
            const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 6));
            pick.position.copy(dir).multiplyScalar(0.55);
            pick.quaternion.copy(q);
            this.addHandle(`move-${axis}`, { tool: "move", type: "axis", axis }, [shaft, cone], pick);

            // Plane square, sitting in the plane `axis` is normal to.
            const [a, b] = PLANE_AXES[axis];
            const square = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), material(color, 0.75));
            square.position.copy(AXES[a]).add(AXES[b]).multiplyScalar(0.3);
            square.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
            const squarePick = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22));
            squarePick.position.copy(square.position);
            squarePick.quaternion.copy(square.quaternion);
            this.addHandle(`plane-${axis}`, { tool: "move", type: "plane", axis }, [square], squarePick);

            // Scale cube on a shaft.
            const sShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.7, 8), material(color));
            sShaft.position.copy(dir).multiplyScalar(0.12 + 0.35);
            sShaft.quaternion.copy(q);
            const cube = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.085), material(color));
            cube.position.copy(dir).multiplyScalar(0.86);
            cube.quaternion.copy(q);
            const sPick = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.9, 6));
            sPick.position.copy(dir).multiplyScalar(0.55);
            sPick.quaternion.copy(q);
            this.addHandle(`scale-${axis}`, { tool: "scale", type: "axis", axis }, [sShaft, cube], sPick);
        }

        // Free move: a white ring that always faces the viewer.
        const centre = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 32), material(0xffffff, 0.9));
        const centrePick = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16));
        this.addHandle("move-free", { tool: "move", type: "free", billboard: true }, [centre], centrePick);

        // Uniform scale: a larger white ring.
        const uniform = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.19, 48), material(0xffffff, 0.8));
        const uniformPick = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.24, 24));
        this.addHandle("scale-uniform", { tool: "scale", type: "uniform", billboard: true }, [uniform], uniformPick);

        // Turn about the vertical.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.012, 8, 96), material(AXIS_COLORS.z));
        ring.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
        const ringPick = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 48));
        ringPick.quaternion.copy(ring.quaternion);
        this.addHandle("rotate-z", { tool: "rotate", type: "ring", axis: "z" }, [ring], ringPick);
    }

    /**
     * Show the handles for a tool.
     * @param {object|null} spec { tool, pivot: Vector3, frame: Quaternion,
     *   axes: string[], planes: string[], free, ring, scaleAxes: string[], uniform }
     */
    configure(spec) {
        this.spec = spec;
        this.root.visible = Boolean(spec);
        if (!spec) return;

        for (const handle of this.handles.values()) {
            let show = false;
            if (handle.tool === spec.tool) {
                if (handle.type === "axis" && handle.tool === "move") show = spec.axes?.includes(handle.axis);
                if (handle.type === "plane") show = spec.planes?.includes(handle.axis);
                if (handle.type === "free") show = Boolean(spec.free);
                if (handle.type === "ring") show = Boolean(spec.ring);
                if (handle.type === "axis" && handle.tool === "scale") show = spec.scaleAxes?.includes(handle.axis);
                if (handle.type === "uniform") show = Boolean(spec.uniform);
            }
            handle.group.visible = show;
        }
        this.root.position.copy(spec.pivot);
        this.root.quaternion.copy(spec.frame);
    }

    /** Keep a constant size on screen, and billboards facing the camera. */
    update(camera, worldPerPixel) {
        if (!this.root.visible) return;
        this.root.scale.setScalar(worldPerPixel * SIZE_PX);
        this.root.updateMatrixWorld(true);

        const inverse = this.root.quaternion.clone().invert();
        for (const handle of this.handles.values()) {
            if (!handle.billboard || !handle.group.visible) continue;
            handle.group.quaternion.copy(inverse).multiply(camera.quaternion);
        }
    }

    /** The handle under a ray, if any. */
    pick(raycaster) {
        if (!this.root.visible) return null;
        const visible = this.pickers.filter((p) => p.parent.visible);
        const hit = raycaster.intersectObjects(visible, false)[0];
        return hit ? this.handles.get(hit.object.userData.handle) : null;
    }

    setHover(handle) {
        if (this.hovered === handle) return;
        this.hovered = handle;
        this.paint();
    }

    setActive(handle) {
        this.activeHandle = handle;
        this.paint();
    }

    paint() {
        for (const handle of this.handles.values()) {
            const lit = handle === this.hovered || handle === this.activeHandle;
            handle.visuals.forEach((mesh, i) => {
                mesh.material.color.copy(handle.colors[i]);
                if (lit) mesh.material.color.lerp(HOVER, 0.45);
            });
            // While dragging, the other handles step back.
            const dim = this.activeHandle && handle !== this.activeHandle;
            for (const mesh of handle.visuals) mesh.visible = !dim;
        }
    }

    dispose() {
        this.root.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material !== pickerMaterial) child.material.dispose();
            }
        });
        this.root.removeFromParent();
    }
}

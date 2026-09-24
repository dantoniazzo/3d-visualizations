import * as THREE from "three";

/**
 * The edit-mode viewport: a turntable camera around a pivot, the way
 * Blender's 3D view navigates.
 *
 *   Middle drag / Alt+left drag        orbit
 *   Shift+middle / Alt+Shift+left      pan
 *   Ctrl+middle, wheel, pinch          zoom
 *   Numpad 1 / 3 / 7 (Ctrl: opposite)  front / right / top
 *   Numpad 5                           perspective <-> orthographic
 *
 * Angles are Blender's: `theta` is the heading around the vertical, `phi`
 * the angle down from straight overhead. Axis views switch to orthographic
 * the way Blender's Auto Perspective does, and orbiting away switches back.
 *
 * It borrows the walkthrough's perspective camera while active and hands it
 * back — near plane and field of view restored — when the walkthrough
 * resumes.
 */
const _offset = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

export const VIEWS = {
    front: { theta: 0, phi: Math.PI / 2, label: "Front" },
    back: { theta: Math.PI, phi: Math.PI / 2, label: "Back" },
    right: { theta: Math.PI / 2, phi: Math.PI / 2, label: "Right" },
    left: { theta: -Math.PI / 2, phi: Math.PI / 2, label: "Left" },
    top: { theta: 0, phi: 0, label: "Top" },
    bottom: { theta: 0, phi: Math.PI, label: "Bottom" },
};

export default class EditorCamera {
    constructor(cameraRig, sizes) {
        this.rig = cameraRig;
        this.sizes = sizes;
        this.persp = cameraRig.perspectiveCamera;
        this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);

        this.active = false;
        this.isOrtho = false;
        this.autoOrtho = false;
        this.viewName = null;

        this.target = new THREE.Vector3();
        this.radius = 12;
        this.theta = 0.6;
        this.phi = 1.0;

        this.FOV = 50;
    }

    get camera() {
        return this.isOrtho ? this.ortho : this.persp;
    }

    /** Take over the camera, starting from wherever it is looking now. */
    activate(initial) {
        this.saved = { fov: this.persp.fov, near: this.persp.near, far: this.persp.far };
        this.persp.fov = this.FOV;
        this.persp.near = 0.05;
        this.persp.far = 3000;
        this.persp.updateProjectionMatrix();

        if (!this.initialised && initial) {
            this.initialised = true;
            this.lookFrom(initial.position, initial.target);
        }
        this.active = true;
        this.update();
    }

    deactivate() {
        this.active = false;
        if (this.saved) {
            Object.assign(this.persp, this.saved);
            this.persp.updateProjectionMatrix();
        }
    }

    /** Point the turntable from `position` at `target`. */
    lookFrom(position, target) {
        this.target.copy(target);
        _offset.copy(position).sub(target);
        this.radius = Math.max(0.5, _offset.length());
        this.theta = Math.atan2(_offset.x, _offset.z);
        this.phi = Math.acos(THREE.MathUtils.clamp(_offset.y / this.radius, -1, 1));
    }

    // ------------------------------------------------------------------
    // Navigation
    // ------------------------------------------------------------------

    /** Drag in pixels. Grabs the world, as Blender does. */
    orbit(dx, dy) {
        this.theta -= dx * 0.0065;
        this.phi = THREE.MathUtils.clamp(this.phi - dy * 0.0065, 0, Math.PI);
        this.leaveAxisView();
    }

    pan(dx, dy) {
        const perPixel = this.worldPerPixel();
        _right.setFromMatrixColumn(this.camera.matrixWorld, 0);
        _up.setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.target.addScaledVector(_right, -dx * perPixel);
        this.target.addScaledVector(_up, dy * perPixel);
    }

    /** factor > 1 moves away. */
    zoom(factor) {
        this.radius = THREE.MathUtils.clamp(this.radius * factor, 0.3, 800);
    }

    orbitStep(dTheta, dPhi) {
        this.theta += dTheta;
        this.phi = THREE.MathUtils.clamp(this.phi + dPhi, 0, Math.PI);
        this.leaveAxisView();
    }

    setView(name) {
        const view = VIEWS[name];
        if (!view) return;
        this.theta = view.theta;
        this.phi = view.phi;
        this.viewName = name;
        if (!this.isOrtho) {
            this.isOrtho = true;
            this.autoOrtho = true;
        }
    }

    leaveAxisView() {
        if (!this.viewName) return;
        this.viewName = null;
        if (this.autoOrtho) {
            this.isOrtho = false;
            this.autoOrtho = false;
        }
    }

    toggleOrtho() {
        this.isOrtho = !this.isOrtho;
        this.autoOrtho = false;
    }

    /** Fit a box in view, keeping the current angle. */
    frame(box, padding = 1.25) {
        if (!box || box.isEmpty()) return;
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        this.target.copy(sphere.center);
        const half = THREE.MathUtils.degToRad(this.FOV / 2);
        this.radius = THREE.MathUtils.clamp(
            (Math.max(sphere.radius, 0.3) * padding) / Math.sin(half),
            0.5,
            800
        );
    }

    /** Metres per screen pixel at the pivot's depth. */
    worldPerPixel(distance = this.radius) {
        const height = this.sizes.height || 1;
        if (this.isOrtho) return (this.ortho.top - this.ortho.bottom) / height;
        return (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2))) / height;
    }

    /** The label Blender prints in the viewport's corner. */
    get label() {
        const projection = this.isOrtho ? "Orthographic" : "Perspective";
        return this.viewName ? `${VIEWS[this.viewName].label} ${projection}` : `User ${projection}`;
    }

    // ------------------------------------------------------------------

    onResize() {
        this.persp.aspect = this.sizes.aspect;
        this.persp.updateProjectionMatrix();
    }

    update() {
        if (!this.active) return;

        const sinPhi = Math.sin(this.phi);
        _offset.set(
            sinPhi * Math.sin(this.theta),
            Math.cos(this.phi),
            sinPhi * Math.cos(this.theta)
        );
        _euler.set(this.phi - Math.PI / 2, this.theta, 0, "YXZ");

        for (const camera of [this.persp, this.ortho]) {
            camera.position.copy(this.target).addScaledVector(_offset, this.radius);
            camera.quaternion.setFromEuler(_euler);
            camera.updateMatrixWorld(true);
        }

        const halfHeight = this.radius * Math.tan(THREE.MathUtils.degToRad(this.FOV / 2));
        const aspect = this.sizes.aspect || 1;
        this.ortho.left = -halfHeight * aspect;
        this.ortho.right = halfHeight * aspect;
        this.ortho.top = halfHeight;
        this.ortho.bottom = -halfHeight;
        this.ortho.updateProjectionMatrix();
    }
}

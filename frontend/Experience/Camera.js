import * as THREE from "three";
import { EventEmitter } from "events";

import Experience from "./Experience.js";
import { OrbitControls } from "./Utils/CustomOrbitControls.js";

/**
 * Two input schemes, picked from the device:
 *
 *   pointerLock (desktop) — the camera owns its own spherical look angles and
 *                           is driven by raw mouse deltas. You look by moving
 *                           the mouse, not by dragging.
 *   orbit       (touch)   — CustomOrbitControls, as before.
 *
 * Orthogonal to that is `mode`: third-person (camera orbits behind the head)
 * or first-person (camera sits at the head and looks along the aim vector).
 * Both schemes support both modes.
 *
 * Driving, the camera orbits the car instead (updateVehicleCamera): the mouse,
 * or a drag on touch, turns it round the car the way it turns round the
 * player, while the keys steer the car along its own heading, whichever way
 * the camera faces — as in GTA. A moment after the last look, once the car
 * is moving, the camera swings back in behind it.
 *
 * Emits: "lockchange" (boolean) whenever pointer lock is gained or lost, so
 * the UI can show its click-to-look prompt and crosshair.
 *
 * In edit mode none of that runs: the editor registers its own viewport
 * controller as `editorView`, which then owns the perspective camera (and
 * an orthographic one) until the walkthrough resumes. A public view's
 * bird's-eye view of a floor (World/BirdView.js) takes it over the same way,
 * as `birdView`.
 */

const _offset = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _pivot = new THREE.Vector3();

/** The camera round a car. Lengths are for a 4.9 m car; a longer one pulls it back. */
const VEHICLE_CAMERA = {
    height: 1.0,           // m: the point it orbits, above the car's origin (itself 0.45 m up)
    distance: 7.0,         // m: from that point
    pitch: 0.22,           // rad: how far above it, looking down, it settles
    minPitch: -0.08,
    maxPitch: 1.2,
    follow: 5.0,           // /s: how briskly it turns after the car
    recenterAfter: 1.4,    // s: without looking, before it swings back behind the car
    recenterSpeed: 1.0,    // m/s: the car must be moving at least this fast for it to
    recenter: 2.2,         // /s: how briskly it swings back
    boom: 3.0,             // /s: how briskly it reaches its distance, getting in
    dragSensitivity: 0.006, // rad per px, dragging on touch
};

/** An angle's difference folded into -π..π. */
function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
}

export default class Camera extends EventEmitter {
    constructor() {
        super();

        this.experience = new Experience();
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        this.params = {
            fov: 70,
            aspect: this.sizes.aspect,
            near: 0.01,
            far: 800,
        };

        this.mode = "third";
        this.controls = null;

        // Shared by both schemes, so they must not live in either setup path.
        this.THIRD_DISTANCE = 2.8;
        this.MOUSE_SENSITIVITY = 0.0022;

        // Interiors need far more pitch range than an outdoor game: you want
        // to look up at a ceiling detail and down at flooring.
        this.THIRD_MIN_VERTICAL = -0.45;
        this.THIRD_MAX_VERTICAL = 1.25;
        this.FIRST_MIN_VERTICAL = -1.45;
        this.FIRST_MAX_VERTICAL = 1.45;

        this.isTouch =
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            ) || ("ontouchstart" in window && navigator.maxTouchPoints > 0);

        this.scheme = this.isTouch ? "orbit" : "pointerLock";

        this.setPerspectiveCamera();

        if (this.scheme === "orbit") {
            this.setOrbitControls();
        } else {
            this.setPointerLock();
        }
    }

    setPerspectiveCamera() {
        this.perspectiveCamera = new THREE.PerspectiveCamera(
            this.params.fov,
            this.params.aspect,
            this.params.near,
            this.params.far
        );

        this.perspectiveCamera.position.set(0, 12, 0);
        this.scene.add(this.perspectiveCamera);
    }

    // ------------------------------------------------------------------
    // Touch: orbit controls
    // ------------------------------------------------------------------

    setOrbitControls() {
        // Driving on touch, a drag on the view turns the camera round the
        // car (the orbit controls are the walker's, and off while driving).
        this.dragMovement = { x: 0, y: 0 };
        this.drag = null;
        this.onDragDown = (event) => {
            if (!this.vehicleMode || this.drag) return;
            this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        };
        this.onDragMove = (event) => {
            if (!this.drag || event.pointerId !== this.drag.id) return;
            this.dragMovement.x += event.clientX - this.drag.x;
            this.dragMovement.y += event.clientY - this.drag.y;
            this.drag.x = event.clientX;
            this.drag.y = event.clientY;
        };
        this.onDragUp = (event) => {
            if (this.drag && event.pointerId === this.drag.id) this.drag = null;
        };
        this.canvas.addEventListener("pointerdown", this.onDragDown);
        window.addEventListener("pointermove", this.onDragMove);
        window.addEventListener("pointerup", this.onDragUp);
        window.addEventListener("pointercancel", this.onDragUp);

        this.controls = new OrbitControls(this.perspectiveCamera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.enablePan = false;
        this.controls.minDistance = 0.05;
        this.controls.maxDistance = this.THIRD_DISTANCE;
        this.controls.maxPolarAngle = Math.PI * 0.92;
    }

    enableOrbitControls() {
        if (this.controls) this.controls.enabled = true;
    }

    disableOrbitControls() {
        if (this.controls) this.controls.enabled = false;
    }

    // ------------------------------------------------------------------
    // Desktop: pointer lock
    // ------------------------------------------------------------------

    setPointerLock() {
        // Spherical look angles. horizontal is the yaw the player also turns
        // to face; vertical is pitch, positive meaning the camera rises and
        // the view tilts down.
        this.angles = { horizontal: 0, vertical: 0.18 };
        this.target = new THREE.Vector3();

        this.pointerLockEnabled = false;
        this.locked = false;

        // Accumulated since the last frame. Consumed and zeroed in update(),
        // so a paused rAF can never leave a stale delta spinning the view.
        this.mouseMovement = { x: 0, y: 0 };

        // Geometry the third-person camera must not pass through.
        this.collisionObjects = [];
        this.cameraRay = new THREE.Raycaster();

        this.onCanvasClick = () => this.requestLock();
        this.onMouseMove = (event) => {
            if (document.pointerLockElement !== this.canvas) return;
            this.mouseMovement.x += event.movementX;
            this.mouseMovement.y += event.movementY;
        };
        this.onLockChange = () => {
            const locked = document.pointerLockElement === this.canvas;
            if (locked === this.locked) return;

            this.locked = locked;
            // Drop anything accumulated during the transition, otherwise the
            // view snaps on the frame after locking.
            this.mouseMovement.x = 0;
            this.mouseMovement.y = 0;
            this.emit("lockchange", locked);
        };

        this.canvas.addEventListener("click", this.onCanvasClick);
        document.addEventListener("mousemove", this.onMouseMove);
        document.addEventListener("pointerlockchange", this.onLockChange);
    }

    /** Ask for pointer lock. No-op until the walkthrough has actually begun. */
    requestLock() {
        if (this.scheme !== "pointerLock") return;
        if (!this.pointerLockEnabled || this.locked) return;
        if (this.editorView?.active || this.birdView?.active) return;

        // Browsers reject a lock request made too soon after an Escape exit,
        // and reject it as a rejected promise rather than an exception.
        const result = this.canvas.requestPointerLock();
        if (result?.catch) result.catch(() => {});
    }

    releaseLock() {
        if (document.pointerLockElement === this.canvas) {
            document.exitPointerLock();
        }
    }

    /** Meshes the third-person camera should be pulled in front of. */
    setCollisionObjects(objects) {
        this.collisionObjects = objects;
    }

    /** Or a collision tree (World/Collision.js), which answers faster. */
    setCollisionTree(tree) {
        this.collisionTree = tree;
    }

    // ------------------------------------------------------------------
    // Modes
    // ------------------------------------------------------------------

    setThirdPerson() {
        this.mode = "third";
        if (this.controls) {
            this.controls.minDistance = 0.05;
            this.controls.maxDistance = this.THIRD_DISTANCE;
            this.controls.maxPolarAngle = Math.PI * 0.92;
        }
        if (this.angles) {
            this.angles.vertical = THREE.MathUtils.clamp(
                this.angles.vertical,
                this.THIRD_MIN_VERTICAL,
                this.THIRD_MAX_VERTICAL
            );
        }
    }

    setFirstPerson() {
        this.mode = "first";
        if (this.controls) {
            // Collapsing the orbit distance puts the touch camera at the eye.
            this.controls.minDistance = 0.001;
            this.controls.maxDistance = 0.001;
            this.controls.maxPolarAngle = Math.PI;
        }
    }

    // ------------------------------------------------------------------
    // Vehicle camera
    // ------------------------------------------------------------------

    /**
     * Hand the camera to a car: it orbits the car from here on, starting
     * where it is now — so getting in eases out to the car rather than
     * cutting to it. The pointer stays captured: the mouse looks round the
     * car as it looked round the player.
     */
    enterVehicleMode(car) {
        this.vehicleMode = true;
        this.vehicle = car;
        if (this.controls) this.controls.enabled = false;

        const pivot = this.vehiclePivot(car, _pivot);
        _offset.copy(this.perspectiveCamera.position).sub(pivot);
        const distance = Math.max(0.5, _offset.length());
        _offset.divideScalar(distance);
        this.vehicleLook = {
            // the camera's bearing and height round the car, 0 being dead behind it
            yaw: wrapAngle(Math.atan2(_offset.x, _offset.z) - (car.heading + Math.PI)),
            pitch: THREE.MathUtils.clamp(Math.asin(_offset.y), VEHICLE_CAMERA.minPitch, VEHICLE_CAMERA.maxPitch),
            heading: car.heading,        // the car's, as the camera follows it: a little behind
            distance,
            lastLook: -Infinity,
        };
        if (this.mouseMovement) this.mouseMovement.x = this.mouseMovement.y = 0;
        if (this.dragMovement) this.dragMovement.x = this.dragMovement.y = 0;
    }

    exitVehicleMode() {
        // On foot again, looking the way the car's camera looked.
        if (this.angles && this.vehicleLook) {
            this.angles.horizontal = this.vehicleLook.heading + Math.PI + this.vehicleLook.yaw;
            this.angles.vertical = THREE.MathUtils.clamp(this.vehicleLook.pitch, this.THIRD_MIN_VERTICAL, this.THIRD_MAX_VERTICAL);
        }
        this.vehicleMode = false;
        this.vehicle = null;
        this.vehicleLook = null;
        this.drag = null;
        if (this.controls) this.controls.enabled = true;
    }

    /** The point the camera orbits: above the car's middle. */
    vehiclePivot(car, out) {
        return out.copy(car.group.position).setY(car.group.position.y + VEHICLE_CAMERA.height * this.vehicleScale(car));
    }

    /** How much further out to sit for a car longer than 4.9 m. */
    vehicleScale(car) {
        return Math.max(1, (car.size?.length || 4.9) / 4.9);
    }

    toggleView() {
        if (this.mode === "third") this.setFirstPerson();
        else this.setThirdPerson();
        return this.mode;
    }

    /**
     * Yaw the body should face. Read from the look angles directly under
     * pointer lock — deriving it from the camera position breaks in first
     * person, where the camera sits on top of the avatar.
     */
    getYaw() {
        if (this.scheme === "pointerLock") return this.angles.horizontal;

        this.perspectiveCamera.getWorldDirection(_forward);
        return Math.atan2(-_forward.x, -_forward.z);
    }

    /** The camera the frame is rendered with — orthographic in some editor views. */
    get activeCamera() {
        return this.editorView?.active ? this.editorView.camera : this.perspectiveCamera;
    }

    onResize() {
        this.perspectiveCamera.aspect = this.sizes.aspect;
        this.perspectiveCamera.updateProjectionMatrix();
        this.editorView?.onResize();
        this.birdView?.onResize();
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    update() {
        if (this.editorView?.active) {
            this.editorView.update();
            return;
        }
        if (this.birdView?.active) {
            this.birdView.update();
            return;
        }

        // Driving overrides both schemes: on touch the orbit branch returns
        // early, so checking this second would freeze the camera in the car.
        if (this.vehicleMode && this.vehicle) {
            this.updateVehicleCamera();
            return;
        }

        if (this.scheme === "orbit") {
            if (this.controls?.enabled) this.controls.update();
            return;
        }

        this.updatePointerLockCamera();
    }

    updatePointerLockCamera() {
        const first = this.mode === "first";

        if (this.mouseMovement.x !== 0 || this.mouseMovement.y !== 0) {
            const min = first ? this.FIRST_MIN_VERTICAL : this.THIRD_MIN_VERTICAL;
            const max = first ? this.FIRST_MAX_VERTICAL : this.THIRD_MAX_VERTICAL;

            this.angles.horizontal -= this.mouseMovement.x * this.MOUSE_SENSITIVITY;
            this.angles.vertical = THREE.MathUtils.clamp(
                this.angles.vertical + this.mouseMovement.y * this.MOUSE_SENSITIVITY,
                min,
                max
            );

            this.mouseMovement.x = 0;
            this.mouseMovement.y = 0;
        }

        const theta = this.angles.horizontal;
        const phi = this.angles.vertical;
        const cosPhi = Math.cos(phi);

        // Unit vector from the pivot toward where the camera wants to sit.
        _offset.set(
            Math.sin(theta) * cosPhi,
            Math.sin(phi),
            Math.cos(theta) * cosPhi
        );

        if (first) {
            this.perspectiveCamera.position.copy(this.target);
            this.perspectiveCamera.lookAt(
                _lookAt.copy(this.target).addScaledVector(_offset, -4)
            );
            return;
        }

        const distance = this.resolveDistance(_offset, this.THIRD_DISTANCE);

        this.perspectiveCamera.position
            .copy(this.target)
            .addScaledVector(_offset, distance);
        this.perspectiveCamera.lookAt(this.target);
    }

    /**
     * The camera round the car. The mouse (or a drag) turns it and tilts it;
     * it follows the car's heading a little behind; and a moment after the
     * last look, with the car moving, it swings back in behind the car. It
     * steers nothing: the car goes where its keys send it.
     */
    updateVehicleCamera() {
        const car = this.vehicle;
        const look = this.vehicleLook;
        const c = VEHICLE_CAMERA;
        const dt = Math.min(this.experience.time.delta || 0.016, 0.1);
        const now = performance.now() / 1000;

        let dx = 0;
        let dy = 0;
        if (this.mouseMovement) {
            dx += this.mouseMovement.x * this.MOUSE_SENSITIVITY;
            dy += this.mouseMovement.y * this.MOUSE_SENSITIVITY;
            this.mouseMovement.x = this.mouseMovement.y = 0;
        }
        if (this.dragMovement) {
            dx += this.dragMovement.x * c.dragSensitivity;
            dy += this.dragMovement.y * c.dragSensitivity;
            this.dragMovement.x = this.dragMovement.y = 0;
        }
        if (dx || dy) {
            look.yaw = wrapAngle(look.yaw - dx);
            look.pitch = THREE.MathUtils.clamp(look.pitch + dy, c.minPitch, c.maxPitch);
            look.lastLook = now;
        }

        look.heading += wrapAngle(car.heading - look.heading) * (1 - Math.exp(-c.follow * dt));
        if (now - look.lastLook > c.recenterAfter && Math.abs(car.speed) > c.recenterSpeed) {
            const k = 1 - Math.exp(-c.recenter * dt);
            look.yaw -= look.yaw * k;
            look.pitch += (c.pitch - look.pitch) * k;
        }

        const scale = this.vehicleScale(car);
        look.distance += (c.distance * scale - look.distance) * (1 - Math.exp(-c.boom * dt));

        const theta = look.heading + Math.PI + look.yaw;
        const cosPhi = Math.cos(look.pitch);
        _offset.set(Math.sin(theta) * cosPhi, Math.sin(look.pitch), Math.cos(theta) * cosPhi);
        const pivot = this.vehiclePivot(car, _pivot);
        const distance = this.resolveDistance(_offset, look.distance, pivot);
        this.perspectiveCamera.position.copy(pivot).addScaledVector(_offset, distance);
        this.perspectiveCamera.lookAt(pivot);
    }

    /**
     * Shorten the boom so the camera stops in front of a wall instead of
     * passing through it. Indoors this is the difference between a usable
     * third-person view and staring at the back of the plasterboard.
     */
    resolveDistance(direction, desired, origin = this.target) {
        this.cameraRay ??= new THREE.Raycaster();
        if (this.collisionTree) {
            this.cameraRay.set(origin, direction);
            const hit = this.collisionTree.rayIntersect(this.cameraRay.ray);
            if (!hit || hit.distance >= desired) return desired;
            return Math.max(0.12, hit.distance - 0.16);
        }
        if (!this.collisionObjects?.length) return desired;

        this.cameraRay.set(origin, direction);
        this.cameraRay.far = desired;

        const hits = this.cameraRay.intersectObjects(this.collisionObjects, true);
        if (hits.length === 0) return desired;

        // Keep a small gap so the near plane doesn't clip into the surface.
        return Math.max(0.12, hits[0].distance - 0.16);
    }

    dispose() {
        if (this.scheme === "pointerLock") {
            this.canvas.removeEventListener("click", this.onCanvasClick);
            document.removeEventListener("mousemove", this.onMouseMove);
            document.removeEventListener("pointerlockchange", this.onLockChange);
            this.releaseLock();
        }
        if (this.onDragDown) {
            this.canvas.removeEventListener("pointerdown", this.onDragDown);
            window.removeEventListener("pointermove", this.onDragMove);
            window.removeEventListener("pointerup", this.onDragUp);
            window.removeEventListener("pointercancel", this.onDragUp);
        }
        this.controls?.dispose?.();
    }
}

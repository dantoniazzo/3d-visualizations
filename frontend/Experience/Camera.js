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
 * Emits: "lockchange" (boolean) whenever pointer lock is gained or lost, so
 * the UI can show its click-to-look prompt and crosshair.
 */

const _offset = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _forward = new THREE.Vector3();

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
     * Hand the camera to a car. Ported from the sibling `game` project: the
     * car computes its own chase position and look-at each frame and this
     * just copies them, so the smoothing lives with the thing being followed.
     */
    enterVehicleMode(car) {
        this.vehicleMode = true;
        this.vehicle = car;
        // Free the mouse while driving — steering is on the keyboard, and a
        // captured pointer with no look control is just a trapped cursor.
        if (document.pointerLockElement) document.exitPointerLock();
        if (this.controls) this.controls.enabled = false;
    }

    exitVehicleMode() {
        this.vehicleMode = false;
        this.vehicle = null;
        if (this.controls) this.controls.enabled = true;
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

    onResize() {
        this.perspectiveCamera.aspect = this.sizes.aspect;
        this.perspectiveCamera.updateProjectionMatrix();
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    update() {
        // Driving overrides both schemes: on touch the orbit branch returns
        // early, so checking this second would freeze the camera in the car.
        if (this.vehicleMode && this.vehicle) {
            this.perspectiveCamera.position.copy(this.vehicle.cameraPosition);
            this.perspectiveCamera.lookAt(this.vehicle.cameraLookAt);
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
     * Shorten the boom so the camera stops in front of a wall instead of
     * passing through it. Indoors this is the difference between a usable
     * third-person view and staring at the back of the plasterboard.
     */
    resolveDistance(direction, desired) {
        if (this.collisionObjects.length === 0) return desired;

        this.cameraRay.set(this.target, direction);
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
        this.controls?.dispose?.();
    }
}

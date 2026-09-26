import * as THREE from "three";

import Experience from "../Experience.js";

/**
 * The bird's-eye view of a public view: one floor at a time, seen from
 * above with everything over it taken away — the floors above, the floor's
 * own ceilings and the roof — like the top of a doll's house lifted off.
 *
 * The camera turns round a point on the floor: drag to turn it and tilt
 * it, scroll or pinch to go nearer or further. It follows the visitor, who
 * goes on walking (WASD or the stick, the way the view faces) and chatting,
 * and shows whichever floor they are on, so walking up the stairs takes the
 * view up a floor. Another floor can be looked at from the floor picker or
 * with Page Up and Page Down; walking again brings the view back.
 *
 * A published view has had every face nobody could see taken out
 * (Publish/Snapshot.js), with this view's reach among what was looked from:
 * so it keeps to that reach — the distances and angles in the version's
 * manifest, and a frame no wider than the one sampled — and nothing thrown
 * away can come into sight.
 */

/** What the bird's-eye views sampled at publish covered (Publish/viewpoints.js). */
const DEFAULT_LIMITS = { fov: 55, minDistance: 6, maxDistance: 24, minPitch: 30 };
/** The sampled frame: `fov` + 8° high, at 4:3 (Publish/Snapshot.js). */
const SAMPLED_ASPECT = 4 / 3;
const SAMPLED_MARGIN = 8;
/** Off straight down, which would leave the heading undefined. */
const MAX_PITCH = 89;
/** How high over the floor the camera turns round, as sampled. */
const TARGET_HEIGHT = 1;
/** How far off the floor's rooms the point turned round can follow the visitor. */
const REACH = 1.5;

const _offset = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _box = new THREE.Box3();

export default class BirdView {
    /**
     * @param {object} world  the World, with its scene builder built
     * @param {object} [limits]  the published version's `birdView`
     * @param {number[]} [levels]  floor heights, lowest first, as the view's meshes were levelled
     */
    constructor(world, limits = null, levels = null) {
        this.experience = new Experience();
        this.world = world;
        this.rig = this.experience.camera;
        this.sizes = this.experience.sizes;
        this.canvas = this.experience.canvas;
        this.builder = world.sceneBuilder;
        this.limits = { ...DEFAULT_LIMITS, ...(limits || {}) };

        const options = this.builder.staticOptions();
        this.levels = levels?.length ? levels : options.levels;
        this.options = options;
        this.floors = this.levels.map((elevation, level) => ({ level, elevation, box: this.floorBox(elevation) }));

        this.active = false;
        this.level = 0;
        this.follow = true;
        this.target = new THREE.Vector3();
        this.goal = new THREE.Vector3();
        this.theta = 0;
        this.phi = THREE.MathUtils.degToRad(35);
        this.radius = 14;

        this.pointers = new Map();
        this.pinch = 0;
        /** Meshes drawn live rather than merged, with the floor each is on. */
        this.loose = null;
    }

    // ------------------------------------------------------------------
    // Floors
    // ------------------------------------------------------------------

    /** Which floor a height is on: the highest whose level it has reached. */
    levelAt(y) {
        let level = 0;
        for (let i = 0; i < this.levels.length; i++) if (y >= this.levels[i] - 0.3) level = i;
        return level;
    }

    /** The plan extent of a floor's rooms, indoors and out, a little beyond. */
    floorBox(elevation) {
        const box = new THREE.Box3();
        for (const room of this.builder.spec.rooms) {
            if (Math.abs(room.elevation - elevation) > 0.3) continue;
            for (const [x, z] of room.polygon) box.expandByPoint(_offset.set(x, elevation, z));
        }
        if (box.isEmpty()) box.set(new THREE.Vector3(-5, elevation, -5), new THREE.Vector3(5, elevation, 5));
        return box;
    }

    /** "Ground floor", "First floor", … */
    static floorName(level) {
        const names = ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor"];
        return names[level] ?? `Floor ${level}`;
    }

    /** Whether something on `level`, of `kind`, shows in the view of floor `shown`. */
    static shows(level, kind, shown) {
        if (level > shown) return false;
        if (kind === "roof") return false;
        return !(kind === "ceiling" && level === shown);
    }

    // ------------------------------------------------------------------
    // On and off
    // ------------------------------------------------------------------

    activate() {
        if (this.active) return;
        const player = this.world.player;
        const camera = this.rig.perspectiveCamera;
        this.saved = { fov: camera.fov, near: camera.near, far: camera.far };
        camera.near = 0.1;
        camera.far = 400;

        // Facing the way the visitor was, from behind and above.
        this.theta = this.rig.getYaw();
        this.level = this.levelAt(this.feet().y);
        this.follow = true;
        this.aim(true);

        this.active = true;
        this.rig.releaseLock();
        this.rig.disableOrbitControls();
        player?.setRemote(() => this.theta);
        this.bind();
        document.body.classList.add("bird-view");
        this.onResize();
        this.showFloor(this.level);
        this.update(0);
        this.world.emit("bird", { active: true, level: this.level });
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.unbind();
        document.body.classList.remove("bird-view");
        this.showFloor(null);

        const camera = this.rig.perspectiveCamera;
        Object.assign(camera, this.saved);
        camera.updateProjectionMatrix();

        const player = this.world.player;
        player?.setRemote(null);
        // Walking on the way the view was facing.
        if (player) {
            const head = player.player.collider.end;
            if (this.rig.scheme === "pointerLock") {
                this.rig.angles.horizontal = this.theta;
                this.rig.target.copy(head);
            } else {
                this.rig.controls.target.copy(head);
                camera.position.copy(head).add(_offset.set(Math.sin(this.theta) * 2.2, 0.7, Math.cos(this.theta) * 2.2));
                this.rig.enableOrbitControls();
                this.rig.controls.update();
            }
        } else {
            this.rig.enableOrbitControls();
        }
        this.rig.requestLock();
        this.world.emit("bird", { active: false, level: null });
    }

    toggle() {
        if (this.active) this.deactivate();
        else this.activate();
        return this.active;
    }

    /**
     * Look at a floor. Asked for, it holds that floor until the visitor walks
     * again; `follow` goes back to theirs.
     */
    setLevel(level, { follow = false } = {}) {
        level = THREE.MathUtils.clamp(level, 0, this.levels.length - 1);
        this.follow = follow;
        if (level !== this.level) {
            this.level = level;
            this.showFloor(level);
            this.world.emit("bird", { active: this.active, level });
        }
        this.aim();
    }

    step(direction) {
        this.setLevel(this.level + direction);
    }

    // ------------------------------------------------------------------
    // What shows
    // ------------------------------------------------------------------

    /**
     * Show a floor with everything over it taken away, or with `null`
     * everything again. The merged meshes say which floor they are on and
     * whether they are a ceiling or the roof; the few drawn live — glass,
     * doors, the car — are placed once, the same way.
     */
    showFloor(shown) {
        const all = shown === null || shown === undefined;
        for (const mesh of this.builder.batches?.children || []) {
            mesh.visible = all || BirdView.shows(mesh.userData.level ?? 0, mesh.userData.kind ?? null, shown);
        }
        for (const entry of this.looseMeshes()) {
            entry.mesh.visible = all ? entry.visible : entry.visible && BirdView.shows(entry.level, entry.kind, shown);
        }
        if (all) this.showPeople(null);
    }

    /** Everything drawn live under the property, with its floor, found once. */
    looseMeshes() {
        if (this.loose) return this.loose;
        this.loose = [];
        const { levelOf, kindOf } = this.options;
        const visit = (object) => {
            if (object.userData?.helper) return;
            if (object.isMesh && !object.userData.batchedMaterial && !object.userData.batch) {
                _box.setFromObject(object);
                const level = object.userData.level ?? (_box.isEmpty() ? 0 : levelOf(object, _box));
                const kind = object.userData.kind === "ceiling" || object.userData.kind === "roof" ? object.userData.kind : kindOf(object);
                this.loose.push({ mesh: object, level, kind, visible: object.visible });
            }
            for (const child of object.children) visit(child);
        };
        visit(this.builder.root);
        return this.loose;
    }

    /** People on a floor above the one shown are out of sight too. */
    showPeople(shown) {
        const player = this.world.player;
        if (!player) return;
        const all = shown === null;
        if (player.avatar) {
            const own = player.avatar.avatar;
            own.visible = all ? this.rig.mode !== "first" : this.levelAt(this.feet().y) <= shown;
        }
        for (const id in player.otherPlayers) {
            const model = player.otherPlayers[id].model;
            const visible = all || this.levelAt(model.avatar.position.y) <= shown;
            model.avatar.visible = visible;
            model.nametag.visible = visible;
        }
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------

    /** Where the visitor's feet are. */
    feet() {
        const collider = this.world.player?.player.collider;
        if (!collider) return _offset.set(0, 0, 0);
        return _offset.set(collider.start.x, collider.start.y - collider.radius, collider.start.z);
    }

    /** Where to turn round: over the visitor, or the middle of the floor looked at. */
    aim(now = false) {
        const floor = this.floors[this.level];
        if (this.follow) {
            const feet = this.feet();
            const box = floor.box;
            this.goal.set(
                THREE.MathUtils.clamp(feet.x, box.min.x - REACH, box.max.x + REACH),
                floor.elevation + TARGET_HEIGHT,
                THREE.MathUtils.clamp(feet.z, box.min.z - REACH, box.max.z + REACH)
            );
        } else {
            floor.box.getCenter(this.goal);
            this.goal.y = floor.elevation + TARGET_HEIGHT;
        }
        if (now) this.target.copy(this.goal);
    }

    orbit(dx, dy) {
        this.theta -= dx * 0.006;
        const minPhi = THREE.MathUtils.degToRad(90 - MAX_PITCH);
        const maxPhi = THREE.MathUtils.degToRad(90 - this.limits.minPitch);
        this.phi = THREE.MathUtils.clamp(this.phi - dy * 0.006, minPhi, maxPhi);
    }

    /** factor > 1 goes further away. */
    zoom(factor) {
        this.radius = THREE.MathUtils.clamp(this.radius * factor, this.limits.minDistance, this.limits.maxDistance);
    }

    onResize() {
        if (!this.active) return;
        // No wider than the frame sampled, nor taller: a wide window
        // narrows the view's height to keep its width.
        const sampled = THREE.MathUtils.degToRad(this.limits.fov + SAMPLED_MARGIN) / 2;
        const widest = 2 * Math.atan((Math.tan(sampled) * SAMPLED_ASPECT) / (this.sizes.aspect || 1));
        const camera = this.rig.perspectiveCamera;
        camera.fov = Math.min(this.limits.fov, THREE.MathUtils.radToDeg(widest));
        camera.aspect = this.sizes.aspect;
        camera.updateProjectionMatrix();
    }

    update(delta = this.experience.time.delta) {
        if (!this.active) return;
        const player = this.world.player;

        // Walking brings the view back to the visitor and their floor.
        if (player?.isMoving() && !this.follow) this.follow = true;
        if (this.follow) {
            const level = this.levelAt(this.feet().y);
            if (level !== this.level) {
                this.level = level;
                this.showFloor(level);
                this.world.emit("bird", { active: true, level });
            }
        }
        this.aim();
        this.target.lerp(this.goal, 1 - Math.exp(-8 * delta));
        this.showPeople(this.level);

        const camera = this.rig.perspectiveCamera;
        const sinPhi = Math.sin(this.phi);
        _offset.set(sinPhi * Math.sin(this.theta), Math.cos(this.phi), sinPhi * Math.cos(this.theta));
        camera.position.copy(this.target).addScaledVector(_offset, this.radius);
        _euler.set(this.phi - Math.PI / 2, this.theta, 0, "YXZ");
        camera.quaternion.setFromEuler(_euler);
        camera.updateMatrixWorld(true);
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------

    bind() {
        this.canvas.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointercancel", this.onPointerUp);
        this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
        this.canvas.addEventListener("contextmenu", this.onContextMenu);
    }

    unbind() {
        this.canvas.removeEventListener("pointerdown", this.onPointerDown);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.removeEventListener("pointercancel", this.onPointerUp);
        this.canvas.removeEventListener("wheel", this.onWheel);
        this.canvas.removeEventListener("contextmenu", this.onContextMenu);
        this.pointers.clear();
    }

    onPointerDown = (event) => {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2) this.pinch = this.spread();
    };

    onPointerMove = (event) => {
        const last = this.pointers.get(event.pointerId);
        if (!last) return;
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        last.x = event.clientX;
        last.y = event.clientY;
        if (this.pointers.size === 1) {
            this.orbit(dx, dy);
        } else if (this.pointers.size === 2) {
            const spread = this.spread();
            if (this.pinch > 0 && spread > 0) this.zoom(this.pinch / spread);
            this.pinch = spread;
        }
    };

    onPointerUp = (event) => {
        this.pointers.delete(event.pointerId);
        this.pinch = this.pointers.size === 2 ? this.spread() : 0;
    };

    onWheel = (event) => {
        event.preventDefault();
        this.zoom(Math.exp(event.deltaY * 0.0012));
    };

    onContextMenu = (event) => event.preventDefault();

    /** How far apart two fingers are. */
    spread() {
        const [a, b] = [...this.pointers.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }

    dispose() {
        this.deactivate();
    }
}

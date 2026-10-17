import * as THREE from "three";

import Experience from "../Experience.js";
import { VEHICLE_CAMERA, wrapAngle } from "../Camera.js";
import { driveBounds } from "../../../shared/drive.js";
import { planStoreys, storeyName } from "../../../shared/storeys.js";

/**
 * The bird's-eye view of a public view: one floor at a time, seen from
 * above with everything over it taken away — the floors above, the floor's
 * own ceilings and the roof — like the top of a doll's house lifted off.
 *
 * A floor is a storey as a visitor counts them (shared/storeys.js): every
 * building's ground floor together, with the terraces and the street round
 * them, then their first floors, then their roof terraces — whatever
 * heights the buildings stand at, and however many floor levels the
 * version's meshes are levelled by.
 *
 * It is always drawn from the bake, with nothing live (World.lightFromAbove):
 * no live sun or lamps on the house, no shadow map drawn again while it is
 * open — whatever the walkthrough it is opened from is lit by, which comes
 * back as the view is left. A version that was not baked has no bake to
 * draw from: it is drawn flat, its sun unshadowed and none of its lamps lit.
 *
 * The camera turns round a point on the floor: drag to turn it and tilt
 * it, scroll or pinch to go nearer or further. It follows the visitor, who
 * goes on walking (WASD or the stick, the way the view faces) and chatting,
 * and shows whichever floor they are on, so walking up the stairs takes the
 * view up a floor. Another floor can be looked at from the floor picker or
 * with Page Up and Page Down; walking again brings the view back.
 *
 * At the wheel it stays. A car got into from up here — walked up to and F,
 * or clicked — is driven from up here, on the car's own keys (W ahead, A and
 * D to steer, S to brake and back, Space to brake: Player.js) or the stick;
 * the view follows a little ahead of it, and a moment after it was last
 * turned by hand, once the car is moving, it swings round as the camera
 * behind a car does (Camera.js) until the car heads up the screen — so the
 * car's keys are the screen's. Getting out leaves the visitor beside the
 * driver's door, still seen from above. B goes between this and the camera
 * behind the car, either way, mid-drive. A car goes further than a visitor
 * walks — off the road and over the open ground, to its edge — and the view
 * goes with it (shared/drive.js), showing the ground floor out there, and
 * goes on following the visitor on foot after, until they are back among
 * the rooms.
 *
 * A click that does not drag — a tap, on a touch screen — turns the light
 * under it on or off, or the light whose wall switch it is (a public view
 * with light switches, World/Switches.js), gets into the car under it,
 * sits the visitor on the seat under it (World/Seats.js), or switches the
 * television under it on or off (World/Screens.js), wherever on the floor
 * they stand — the view staying up here; with a mouse, what is under the
 * pointer is named as it passes.
 *
 * A published view has had every face nobody could see taken out
 * (Publish/Snapshot.js), with this view's reach among what was looked from:
 * so it keeps to that reach — the distances and angles in the version's
 * manifest, a frame no wider than the one sampled, and the floor's rooms
 * (REACH), or a car's ground — and nothing thrown away can come into sight.
 * (The ground a car takes the view over is looked from at publish too:
 * Publish/viewpoints.js's driveViewpoints. A version published before them,
 * looked at from out there, shows nothing of its houses missing that it
 * does not from among them; what else is out there — the terrain, the
 * landscape, the neighbourhood — is kept whole.)
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
/** How far off the floor's rooms the point turned round can follow the visitor — on foot. */
const REACH = 1.5;

/** How far a press may move, in pixels, and still be a click rather than a drag. */
const CLICK_SLOP = 6;

/**
 * Driving, how far ahead of the car the point turned round goes: this many
 * metres for each metre a second it goes, from 2 m behind it (backing) to
 * 4 m ahead — more of the road it is going to than of where it has been —
 * but never more than `share` of how far the frame reaches over the ground
 * from its middle (radius × tan(fov / 2)), which goes with the zoom: 6 m
 * off, looking straight down, the frame shows 3 m of road either side of
 * the middle, and a 4 m lead put the back of a 4.9 m car off the bottom.
 */
const LEAD = { perSpeed: 0.35, behind: -2, ahead: 4, share: 0.5 };
/**
 * Driving, how far in from the edges of the frame the car's body is kept
 * (keepInFrame), as a share of the frame's half-width and half-height.
 */
const FRAME_MARGIN = 0.1;

const _offset = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _box = new THREE.Box3();
const _inverse = new THREE.Matrix4();
const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _look = new THREE.Quaternion();
const _corners = new Float64Array(16);

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
        /** The floor levels' heights, lowest first: what each mesh's `level` counts in. */
        this.levels = levels?.length ? levels : options.levels;
        this.options = options;
        /** The storeys those levels make up — the floors shown, and listed. */
        this.storeys = planStoreys(this.builder.spec.rooms, this.levels);
        this.floors = this.storeys.list.map((storey) => this.floorOf(storey));
        /** Where a car can take the view, past the floors' rooms: its ground (shared/drive.js), or null. */
        this.ground = driveBounds(this.builder.spec);
        /** Following over that ground: at the wheel, and on foot after until back by the rooms (roam). */
        this.roaming = false;
        // (Got into a car in the view or behind it: wherever it is left, it may be out there. Got out of it by the
        // rooms, it is not — whether the view is open or not.)
        this.onVehicle = ({ driving }) => {
            if (driving && this.ground) this.roaming = true;
            else if (!driving) this.roam();
        };
        world.on("vehicle", this.onVehicle);
        // ...and walked back to them with the view shut: it opens on the rooms, as it would have from the start.
        this.onTick = () => {
            if (this.roaming && !this.active) this.roam();
        };
        world.on("tick", this.onTick);

        this.active = false;
        this.level = 0;
        this.follow = true;
        this.target = new THREE.Vector3();
        this.goal = new THREE.Vector3();
        this.theta = 0;
        this.phi = THREE.MathUtils.degToRad(35);
        this.radius = 14;
        /** How far off the point the camera is drawn: `radius`, but driving, as far as keeps the car in the frame (keepInFrame). */
        this.distance = this.radius;

        this.pointers = new Map();
        this.pinch = 0;
        /** Seconds since the view was last turned by hand: driving, it turns behind the car only a moment after. */
        this.sinceDrag = Infinity;
        /** Meshes drawn live rather than merged, with the floor each is on. */
        this.loose = null;
    }

    // ------------------------------------------------------------------
    // Floors
    // ------------------------------------------------------------------

    /** Which of the floor levels a height is on: the highest it has reached. */
    reached(y) {
        let level = 0;
        for (let i = 0; i < this.levels.length; i++) if (y >= this.levels[i] - 0.3) level = i;
        return level;
    }

    /** Which floor a height is on: the storey of the level it has reached. */
    levelAt(y) {
        return this.storeys.ofLevel[this.reached(y)] ?? 0;
    }

    /**
     * Which floor something standing at a point is on, to be shown with:
     * the storey of the level its height has reached — but out past the
     * ground floor's rooms, on a car's ground (shared/drive.js), the ground
     * floor, however high the ground is there: a hillside the height of a
     * first floor is not one, and someone, or a car, out on it is drawn and
     * picked with the ground floor, which is what the view shows out there
     * (followed).
     */
    floorAt(x, y, z) {
        return this.ground && this.outside(x, z) ? 0 : this.levelAt(y);
    }

    /**
     * A storey as a floor to show: the plan extent of its rooms, indoors
     * and out, which the view follows the visitor over; the point turned
     * round when it is picked from the list — the middle of its houses,
     * not of the street that runs on past them; and its rooms indoors, each
     * with its area, which the floor is exposed by (Realism.js).
     */
    floorOf(storey) {
        const box = new THREE.Box3();
        const houses = new THREE.Box3();
        const indoors = [];
        for (const room of storey.rooms) {
            const indoor = room.ceiling_finish !== "none";
            for (const [x, z] of room.polygon) {
                box.expandByPoint(_offset.set(x, storey.elevation, z));
                // Above the ground, everything stands on a house.
                if (indoor || storey.index > 0) houses.expandByPoint(_offset);
            }
            if (indoor) indoors.push({ room, area: areaOf(room.polygon) });
        }
        if (box.isEmpty()) box.set(new THREE.Vector3(-5, storey.elevation, -5), new THREE.Vector3(5, storey.elevation, 5));
        if (houses.isEmpty()) houses.copy(box);
        return { level: storey.index, elevation: storey.elevation, levels: storey.levels, box, middle: houses.getCenter(new THREE.Vector3()), indoors };
    }

    /** "Ground floor", "First floor", "Roof terrace"… (shared/storeys.js). */
    floorName(level) {
        return storeyName(this.storeys, level);
    }

    /** Whether something on floor level `level` (of `levels`), of `kind`, shows in the view of floor `shown`. */
    shows(level, kind, shown) {
        const floor = this.storeys.ofLevel[level] ?? 0;
        if (floor > shown) return false;
        if (kind === "roof") return false;
        return !(kind === "ceiling" && floor === shown);
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

        // Facing the way the visitor was, from behind and above — at the
        // wheel, the way the camera round the car was (under pointer lock
        // the look angle is still the walk's, from before they got in).
        const look = player?.inVehicle ? this.rig.vehicleLook : null;
        this.theta = look ? look.heading + Math.PI + look.yaw : this.rig.getYaw();
        this.sinceDrag = Infinity;
        this.roam();
        this.level = this.followed();
        this.follow = true;
        this.aim(true);

        this.active = true;
        this.rig.releaseLock();
        this.rig.disableOrbitControls();
        player?.setRemote(() => this.theta);
        this.bind();
        document.body.classList.add("bird-view");
        this.onResize();
        // Drawn from the bake, nothing live, for as long as it is open.
        this.world.lightFromAbove(true);
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
        // Lit as the walkthrough was, again.
        this.world.lightFromAbove(false);

        const camera = this.rig.perspectiveCamera;
        Object.assign(camera, this.saved);
        camera.updateProjectionMatrix();

        const player = this.world.player;
        player?.setRemote(null);
        if (player?.inVehicle) {
            // Behind the car again, from up here: the camera round it eases
            // down to it from where this one was (Camera.enterVehicleMode),
            // and the orbit controls stay off, as they are while driving.
            this.rig.enterVehicleMode(player.currentCar);
        } else if (player) {
            // Walking on the way the view was facing.
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
        level = THREE.MathUtils.clamp(level, 0, this.floors.length - 1);
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
     * everything again. The merged meshes say which floor level they are
     * on and whether they are a ceiling or the roof; the few drawn live —
     * glass, doors, the car — are placed once, the same way. What is taken
     * away is not drawn at all — nothing of it is kept for its shadow: the
     * view is drawn from the bake, and no shadow map is drawn for it
     * (World.lightFromAbove). The garden goes by the floor it grows on, as
     * the house does: a roof terrace's planters with the roof.
     */
    showFloor(shown) {
        const all = shown === null || shown === undefined;
        for (const mesh of this.builder.batches?.children || []) {
            mesh.visible = all || this.shows(mesh.userData.level ?? 0, mesh.userData.kind ?? null, shown);
        }
        for (const entry of this.looseMeshes()) {
            entry.mesh.visible = all ? entry.visible : entry.visible && this.shows(entry.level, entry.kind, shown);
        }
        // The shut doors and drawers, a mesh a material of every floor (World/ShutBatcher.js): the floors shown, in each's index.
        this.builder.shutBatcher?.showFloors(all ? null : (level) => this.shows(level, null, shown));
        this.showResidents(all ? null : shown);
        this.world.vegetation?.showUpTo?.(all ? null : (y) => this.levelAt(y) <= shown);
        // A television's picture goes with its set: by the floor its piece stands on (World/Screens.js, outside the root).
        this.world.screens?.showFloor(all ? null : (y, x, z) => this.floorAt(x, y, z) <= shown);
        if (all) this.showPeople(null);
    }

    /**
     * The people round the property (World/People.js) on the floors shown,
     * by the floor under them — someone on the roof deck over the floor
     * looked at goes with the roof — or, with `null`, all of them. Only as
     * the floor changes: each change boxes them for collision again.
     */
    showResidents(shown) {
        const people = this.world.people;
        if (!people || shown === this.residentsShown) return;
        this.residentsShown = shown;
        // A rig's root is on the floor standing or sitting, on the lounger
        // lying (well within the 0.3 m a floor allows); until it is built, its spot.
        const floorOf = (entry) => people.get(entry.id)?.group.position.y ?? entry.position?.[1] ?? 0;
        people.setFilter(shown === null ? null : (entry) => this.levelAt(floorOf(entry)) <= shown);
    }

    /** Everything drawn live under the property, with its floor, found once. */
    looseMeshes() {
        if (this.loose) return this.loose;
        this.loose = [];
        const { levelOf, kindOf } = this.options;
        const visit = (object) => {
            if (object.userData?.helper) return;
            // Not the cars: what of them is shown is their own and their
            // lamps' (CarLights.js) — kept here as first seen, parked and
            // unlit, a floor's change would put out the lamps of a car being
            // driven. They stand on the ground floor, in every floor's view.
            if (object === this.builder.vehicleGroup) return;
            if (object.isMesh && !object.userData.batchedMaterial && !object.userData.batch && !object.userData.floors) {
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
            const { x, y, z } = this.feet();
            // (Never at the wheel: it is in the car — and would be drawn standing where it got in.)
            own.visible = !player.inVehicle && (all ? this.rig.mode !== "first" : this.floorAt(x, y, z) <= shown);
        }
        for (const id in player.otherPlayers) {
            const model = player.otherPlayers[id].model;
            const { x, y, z } = model.avatar.position;
            const visible = all || this.floorAt(x, y, z) <= shown;
            model.avatar.visible = visible;
            model.nametag.visible = visible;
        }
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------

    /** The car the visitor is driving, or null. */
    car() {
        const player = this.world.player;
        return player?.inVehicle ? player.currentCar : null;
    }

    /** Where the visitor's feet are — at the wheel, under the car, which they go with (Player.update). */
    feet() {
        const collider = this.world.player?.player.collider;
        if (!collider) return _offset.set(0, 0, 0);
        return _offset.set(collider.start.x, collider.start.y - collider.radius, collider.start.z);
    }

    /**
     * Where to turn round: over the visitor — at the height of the floor
     * level they stand on, which on a floor of several buildings is not
     * every building's; driving, a little ahead of the car — or the middle
     * of the floor looked at. Never further off the floor's rooms than
     * REACH: no further than the view was sampled from at publish — but for
     * where a car has taken them (roam): over its ground, as far as it goes,
     * at the ground's own height out there (withinReach).
     */
    aim(now = false) {
        const floor = this.floors[this.level];
        if (this.follow) {
            const { x: fx, y: fy, z: fz } = this.feet();
            const level = this.reached(fy);
            const out = this.out(fx, fz);
            const height = out ? fy : this.storeys.ofLevel[level] === this.level ? this.levels[level] : floor.elevation;
            let x = fx;
            let z = fz;
            const car = this.car();
            if (car) {
                // (No further than the frame, as close in as the view is, leaves room for: LEAD.)
                const room = this.radius * Math.tan(THREE.MathUtils.degToRad(this.rig.perspectiveCamera.fov) / 2) * LEAD.share;
                const lead = THREE.MathUtils.clamp(car.speed * LEAD.perSpeed, Math.max(LEAD.behind, -room), Math.min(LEAD.ahead, room));
                x += Math.sin(car.heading) * lead;
                z += Math.cos(car.heading) * lead;
            }
            this.goal.set(x, height + TARGET_HEIGHT, z);
            this.withinReach(this.goal);
        } else {
            this.goal.copy(floor.middle);
            this.goal.y = floor.elevation + TARGET_HEIGHT;
        }
        if (now) this.target.copy(this.goal);
    }

    /**
     * A point to turn round, kept within what the view was sampled from at
     * publish: the floor's rooms ± REACH — and while roaming, the ground a
     * car goes over too.
     */
    withinReach(point) {
        const box = this.floors[this.level].box;
        const ground = this.roaming ? this.ground : null;
        point.x = THREE.MathUtils.clamp(point.x, Math.min(box.min.x - REACH, ground?.minX ?? Infinity), Math.max(box.max.x + REACH, ground?.maxX ?? -Infinity));
        point.z = THREE.MathUtils.clamp(point.z, Math.min(box.min.z - REACH, ground?.minZ ?? Infinity), Math.max(box.max.z + REACH, ground?.maxZ ?? -Infinity));
        return point;
    }

    /**
     * Driving, the point turned round moved as little as keeps the whole of
     * the car — its body's box, down to the ground — FRAME_MARGIN inside the
     * frame, however near the view is and however steeply it looks: the lead
     * (LEAD) runs ahead of the car and the point's own ease lags behind it
     * (by speed / 8, about 2 m at 16 m/s), and close in either was enough to
     * put half the car off the screen. Where the car does not fit in the
     * frame at all — a long car across it, close in, looking straight down —
     * the camera is drawn back from the point (`distance`) as far as it then
     * does, no further than the view was sampled from at publish; the zoom
     * the visitor chose (`radius`) is kept, and comes back as the car turns.
     */
    keepInFrame(car) {
        const meta = car.model?.meta;
        if (!meta) return;
        let distance = this.radius;
        let fit = this.frameAt(car, distance);
        if (fit && !fit.fits) {
            // As near as it fits, found by halving between here and the furthest the view goes.
            let near = distance;
            let far = this.limits.maxDistance;
            for (let i = 0; i < 8 && far > near; i++) {
                const middle = (near + far) / 2;
                if (this.frameAt(car, middle)?.fits) far = middle;
                else near = middle;
            }
            distance = far;
            fit = this.frameAt(car, distance);
        }
        this.distance = distance;
        if (!fit || (!fit.up && !fit.across)) return;
        // Up the screen over the ground, and across it to the right.
        this.target.x += -Math.sin(this.theta) * fit.up + Math.cos(this.theta) * fit.across;
        this.target.z += -Math.cos(this.theta) * fit.up - Math.sin(this.theta) * fit.across;
        this.withinReach(this.target);
    }

    /**
     * How far the point turned round must move for a car's body to be
     * FRAME_MARGIN inside the frame drawn from `distance` off it: `up` the
     * screen over the ground and `across` it to the right, in metres, both 0
     * if it is in the frame already — and whether it can be (`fits`), or the
     * move that comes nearest (the middle of what each edge asks). Null for a
     * corner behind the camera. Worked out for the frame the camera will draw
     * from where the point is now: moving the point (and the camera with it)
     * a distance t over the ground, up the screen, moves each corner down it
     * as y(t) = (y − t·sin p) / ((d − t·cos p)·tan(fov / 2)) — p the view's
     * pitch, d the corner's depth — which gives each corner the least and the
     * most t it is in the frame for; then across, at the depths that leaves.
     */
    frameAt(car, distance) {
        const meta = car.model.meta;
        const camera = this.rig.perspectiveCamera;
        const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const wide = tan * (camera.aspect || 1);
        const pitch = Math.PI / 2 - this.phi;
        const sin = Math.sin(pitch);
        const cos = Math.cos(pitch);
        const edge = 1 - FRAME_MARGIN;
        // Where the camera is drawn from (update), and the way it turns.
        const sinPhi = Math.sin(this.phi);
        _offset.set(sinPhi * Math.sin(this.theta), Math.cos(this.phi), sinPhi * Math.cos(this.theta));
        const from = _hit.copy(this.target).addScaledVector(_offset, distance);
        _euler.set(this.phi - Math.PI / 2, this.theta, 0, "YXZ");
        _look.setFromEuler(_euler).invert();
        car.group.updateWorldMatrix(true, false);
        const ride = meta.rideHeight ?? 0.45;
        const corners = _corners;
        let low = -Infinity;
        let high = Infinity;
        for (let i = 0; i < 8; i++) {
            _corner.set(i & 1 ? meta.body.max[0] : meta.body.min[0], i & 2 ? meta.body.max[1] : Math.min(meta.body.min[1], -ride), i & 4 ? meta.body.max[2] : meta.body.min[2]);
            // In the camera's own frame: x right, y up the screen, depth −z.
            _corner.applyMatrix4(car.group.matrixWorld).sub(from).applyQuaternion(_look);
            if (-_corner.z <= 0.01) return null;
            corners[2 * i] = _corner.x;
            corners[2 * i + 1] = _corner.z;
            // Off the top of the frame unless moved at least so far (nothing over the horizon is); off its foot if moved any further.
            const over = sin - edge * tan * cos;
            if (over > 1e-3) low = Math.max(low, (_corner.y + edge * tan * _corner.z) / over);
            high = Math.min(high, (_corner.y - edge * tan * _corner.z) / (sin + edge * tan * cos));
        }
        const fitsUp = low <= high;
        const up = fitsUp ? THREE.MathUtils.clamp(0, low, high) : (low + high) / 2;
        let left = -Infinity;
        let right = Infinity;
        for (let i = 0; i < 16; i += 2) {
            const depth = -(corners[i + 1] + up * cos);
            left = Math.max(left, corners[i] - edge * wide * depth);
            right = Math.min(right, corners[i] + edge * wide * depth);
        }
        const fitsAcross = left <= right;
        const across = fitsAcross ? THREE.MathUtils.clamp(0, left, right) : (left + right) / 2;
        return { up, across, fits: fitsUp && fitsAcross };
    }

    /**
     * Whether the view follows the visitor over a car's ground (shared/
     * drive.js) — at the wheel, and on foot where a car has left them, until
     * they are back by the ground floor's rooms (within REACH of them),
     * where it keeps to the rooms again, as it always has on foot.
     */
    roam() {
        if (!this.ground || this.car()) {
            this.roaming = Boolean(this.ground);
            return;
        }
        const { x, z } = this.feet();
        if (this.roaming && !this.outside(x, z)) this.roaming = false;
    }

    /** Whether a point on the plan is out on a car's ground, followed there: further off the ground floor's rooms than REACH. */
    out(x, z) {
        return this.roaming && this.outside(x, z);
    }

    outside(x, z) {
        const box = this.floors[0].box;
        return x < box.min.x - REACH || x > box.max.x + REACH || z < box.min.z - REACH || z > box.max.z + REACH;
    }

    /**
     * The floor the visitor is on, to show: the level they have reached —
     * out on a car's ground, the ground floor, however high the ground is
     * (a hillside the height of a first floor is not one).
     */
    followed() {
        const { x, y, z } = this.feet();
        return this.out(x, z) ? 0 : this.levelAt(y);
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
        const car = this.car();
        this.sinceDrag += delta;

        // Walking brings the view back to the visitor and their floor — and
        // driving: the pedals pressed, as walking is its keys held.
        const driving = car && (car.controls.forward || car.controls.backward);
        if ((player?.isMoving() || driving) && !this.follow) this.follow = true;
        this.roam();
        if (this.follow) {
            const level = this.followed();
            if (level !== this.level) {
                this.level = level;
                this.showFloor(level);
                this.world.emit("bird", { active: true, level });
            }
        }
        this.aim();
        this.target.lerp(this.goal, 1 - Math.exp(-8 * delta));
        this.distance = this.radius;
        if (car && this.follow) {
            this.turnBehind(car, delta);
            this.keepInFrame(car);
        }
        this.showPeople(this.level);

        const camera = this.rig.perspectiveCamera;
        const sinPhi = Math.sin(this.phi);
        _offset.set(sinPhi * Math.sin(this.theta), Math.cos(this.phi), sinPhi * Math.cos(this.theta));
        camera.position.copy(this.target).addScaledVector(_offset, this.distance);
        _euler.set(this.phi - Math.PI / 2, this.theta, 0, "YXZ");
        camera.quaternion.setFromEuler(_euler);
        camera.updateMatrixWorld(true);
    }

    /**
     * Driving, the view turns round as the camera behind the car does
     * (Camera.js's VEHICLE_CAMERA): a moment after it was last turned by
     * hand, once the car is moving, it swings round until the car heads up
     * the screen, and keeps it there, a little behind it through a bend.
     * Only round: how steep it looks, and from how far, are the visitor's.
     */
    turnBehind(car, delta) {
        const c = VEHICLE_CAMERA;
        if (this.sinceDrag <= c.recenterAfter || Math.abs(car.speed) <= c.recenterSpeed) return;
        this.theta += wrapAngle(car.heading + Math.PI - this.theta) * (1 - Math.exp(-c.recenter * delta));
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
        this.press = null;
        this.hover(null);
    }

    onPointerDown = (event) => {
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 2) this.pinch = this.spread();
        // A click, until it moves or a second finger comes down.
        this.press = this.pointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    };

    onPointerMove = (event) => {
        const last = this.pointers.get(event.pointerId);
        if (!last) {
            // A mouse passing over: name the light or the car under it.
            if (event.pointerType === "mouse" && event.target === this.canvas) this.hover(this.thingAt(event.clientX, event.clientY), event);
            else this.hover(null);
            return;
        }
        if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > CLICK_SLOP) this.press = null;
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        last.x = event.clientX;
        last.y = event.clientY;
        if (this.pointers.size === 1) {
            this.orbit(dx, dy);
            this.sinceDrag = 0;
        } else if (this.pointers.size === 2) {
            const spread = this.spread();
            if (this.pinch > 0 && spread > 0) this.zoom(this.pinch / spread);
            this.pinch = spread;
        }
    };

    onPointerUp = (event) => {
        this.pointers.delete(event.pointerId);
        this.pinch = this.pointers.size === 2 ? this.spread() : 0;
        const press = this.press;
        this.press = null;
        if (press?.id !== event.pointerId || event.type === "pointercancel") return;
        const thing = this.thingAt(event.clientX, event.clientY);
        if (thing?.kind === "car") {
            this.board(thing.car);
            return;
        }
        if (thing?.kind === "seat") {
            this.sitOn(thing.seat);
            return;
        }
        if (thing?.kind === "tv") {
            this.switchScreen(thing.screen);
            if (event.pointerType === "mouse") this.hover(this.thingAt(event.clientX, event.clientY), event);
            return;
        }
        if (!thing) return;
        this.world.switches.toggle(thing.id);
        if (event.pointerType === "mouse") this.hover(thing, event);
    };

    /** The ray from the camera through a point on the screen. */
    rayAt(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        _ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
        _raycaster.setFromCamera(_ndc, this.rig.perspectiveCamera);
        return _raycaster.ray;
    }

    /**
     * What a click at a point on the screen would act on: the nearest of the
     * light, the car, the seat and the television under it, as `{ kind, id,
     * label, action }` with the `light`, the `car`, the `seat` or the
     * `screen` itself — `action` what a click does, said by the label beside
     * the pointer (index.js), and a television's `on`; or null.
     */
    thingAt(x, y) {
        const light = this.lightAt(x, y);
        const car = this.carAt(x, y);
        const seat = this.seatAt(x, y);
        const screen = this.screenAt(x, y);
        const found = [light, car, seat, screen].filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
        if (!found) return null;
        if (found === car) return { kind: "car", id: car.car.spec.id, label: car.car.model.meta.name || "Car", action: "click to drive", car: car.car };
        if (found === seat) return { kind: "seat", id: seat.seat.id, label: seat.seat.label, action: "click to sit", seat: seat.seat };
        if (found === screen) {
            const on = screen.screen.on;
            return { kind: "tv", id: screen.screen.id, label: "TV", action: on ? "click to turn off" : "click to turn on", on, screen: screen.screen };
        }
        return { kind: "light", id: light.id, label: light.label, light };
    }

    /**
     * The seat under a point on the screen (World/Seats.js), free, on the
     * floor shown, as `{ seat, distance }` along the ray — or null; none
     * while driving. Met as the crosshair meets one, by its point: from up
     * here, that is a click on its cushion.
     */
    seatAt(x, y) {
        const seats = this.world.seats;
        const player = this.world.player;
        if (!seats || !player || player.inVehicle) return null;
        const found = seats.fromAbove(this.rayAt(x, y), (seat) => this.floorAt(seat.at.x, seat.floor, seat.at.z) === this.level);
        // (Its sitting clip fitted to the figure as a seat is pointed at, and its sitting down and getting up with what they are
        // looked over for room by — Player.prepareSitting: there, most likely, by the click.)
        if (found) {
            seats.dress(player.avatar);
            player.prepareSitting?.();
        }
        return found;
    }

    /**
     * The television under a point on the screen (World/Screens.js), on the
     * floor shown, as `{ screen, distance }` along the ray — or null; none
     * while driving. Met by its glass, a little round it: from up here a set
     * on a wall is a few centimetres deep.
     */
    screenAt(x, y) {
        const screens = this.world.screens;
        if (!screens?.list.length || this.world.player?.inVehicle) return null;
        return screens.fromAbove(this.rayAt(x, y), (screen) => this.floorAt(screen.centre.x, screen.floor, screen.centre.z) === this.level);
    }

    /**
     * The light under a point on the screen, on the floor shown — floors
     * above are taken away, and those below are under it — or null.
     */
    lightAt(x, y) {
        if (!this.world.switches) return null;
        return this.builder.pickLight(this.rayAt(x, y), { accept: ({ elevation }) => this.levelAt(elevation + 0.05) === this.level });
    }

    /**
     * The car under a point on the screen — one on the floor shown, as the
     * lights are, to be got into — and how far along the ray: `{ car,
     * distance }`, or null. None while one is being driven. Met by its
     * body's box, down to the ground, in the car's own frame: from above,
     * that is the car, and costs no ray through its model.
     */
    carAt(x, y) {
        const cars = this.builder.cars;
        if (!cars?.length || this.world.player?.inVehicle || this.builder.vehicleGroup?.visible === false) return null;
        const ray = this.rayAt(x, y);
        let best = null;
        for (const car of cars) {
            const meta = car.model?.meta;
            if (!meta || !car.group.visible) continue;
            const ride = meta.rideHeight ?? 0.45;
            const { x, y, z } = car.group.position;
            if (this.floorAt(x, y - ride + 0.05, z) !== this.level) continue;
            _box.min.set(meta.body.min[0], Math.min(meta.body.min[1], -ride), meta.body.min[2]);
            _box.max.fromArray(meta.body.max);
            // (Where it is now, not where it was last drawn: it may have been driven since.)
            car.group.updateWorldMatrix(true, false);
            _inverse.copy(car.group.matrixWorld).invert();
            if (!_ray.copy(ray).applyMatrix4(_inverse).intersectBox(_box, _hit)) continue;
            const distance = _hit.applyMatrix4(car.group.matrixWorld).distanceTo(ray.origin);
            if (!best || distance < best.distance) best = { car, distance };
        }
        return best;
    }

    /**
     * Into a car clicked or tapped, from wherever on the floor the visitor
     * stands — the figure is in it at once (Player.enterVehicle) — the view
     * staying up here and going after it.
     */
    board(car) {
        const player = this.world.player;
        const target = this.world.interactables?.of("car", car);
        if (!player || !target) return;
        player.act(target);
        this.follow = true;
        this.hover(null);
    }

    /**
     * On a seat clicked or tapped, from wherever on the floor the visitor
     * stands (Player.sit: they get up beside it, not back there) — the view
     * staying up here.
     */
    sitOn(seat) {
        const player = this.world.player;
        const target = this.world.interactables?.of("seat", seat);
        if (!player || !target) return;
        player.act(target);
        this.follow = true;
        this.hover(null);
    }

    /**
     * A television clicked or tapped, switched on or off — the view staying
     * up here, as it always does: never to the set from the seat.
     */
    switchScreen(screen) {
        const player = this.world.player;
        const target = this.world.interactables?.of("tv", screen);
        if (!player || !target) return;
        player.act(target);
    }

    /**
     * Say what the pointer is over — for the HUD: a light, a car to get
     * into, a seat to sit on or a television to switch (`{ kind, id, label,
     * action }`, a car's label its model's name, a seat's its kind; a
     * television's `on`) — and show that it can be clicked.
     */
    hover(thing, event = null) {
        this.canvas.style.cursor = thing ? "pointer" : "";
        if (!thing && !this.hovered) return;
        this.hovered = thing ? `${thing.kind}:${thing.id}` : null;
        this.world.emit("bird-hover", thing && { kind: thing.kind, id: thing.id, label: thing.label, action: thing.action ?? null, on: thing.on ?? null, x: event.clientX, y: event.clientY });
    }

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
        this.world.off("vehicle", this.onVehicle);
        this.world.off("tick", this.onTick);
    }
}

/** The area of a polygon of [x, z] points. */
function areaOf(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    return Math.abs(area) / 2;
}

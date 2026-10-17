import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";

import { applyReflections, plainGlass } from "../../Utils/reflections.js";
import CarLights from "./CarLights.js";

/**
 * A drivable car.
 *
 * The enter/exit flow and the control scheme are carried over from the
 * sibling `game` project; the keys steer the car along its own heading,
 * whichever way the camera — which orbits it, free (Camera.js) — is
 * looking. Its physics are not carried over: that car is a
 * Rapier raycast vehicle and its whole world is built from Rapier colliders,
 * whereas this app collides everything — player included — against a three.js
 * Octree. Rather than run a second physics world alongside the octree (plus
 * two megabytes of wasm) for a car that lives in a garage and on a drive, the
 * same octree drives an arcade model here: a ray per wheel to sit the car on
 * the ground and take its pitch and roll, and a swept capsule for walls.
 */

const _v = new THREE.Vector3();
const _ray = new THREE.Vector3();      // ground probes only, never shared
const _down = new THREE.Vector3(0, -1, 0);
const _worldUp = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _at = new THREE.Vector3();

/**
 * Every car's model is in the same frame (blender/import_cars.py): +Z
 * forward — the convention the heading maths uses — +X to its left, Y up,
 * the origin midway between the axles on the centreline, RIDE_HEIGHT above
 * the ground. Where each car's wheels are, how big, and how big its body,
 * come with its model (World/Vehicle/CarModels.js); the car takes them from
 * whichever model it wears.
 */
const RIDE_HEIGHT = 0.45;

// Body capsule: lifted so its underside clears the road — its bottom this far
// above the origin, less its radius — and no wider than a metre each side,
// which leaves room in a single garage.
const CAPSULE_CLEARANCE = 0.28;
const CAPSULE_MAX_RADIUS = 1.0;

/**
 * At the edge of the ground (Car.alongEdge): how far either side of the
 * way it was going a car looks for ground to go on along the edge, and how
 * fast, per second, its speed falls towards what of it still goes along it
 * (its wheels scrubbing against the edge).
 */
const EDGE_TURNS = [15, 30, 45, 60, 75].map((deg) => THREE.MathUtils.degToRad(deg));
const EDGE_SCRUB = 3;

const PARAMS = {
    accel: 14.0,          // m/s² under power
    reverse: 7.0,
    brake: 22.0,
    drag: 0.55,           // proportional to speed, stands in for air + rolling
    maxSpeed: 16.0,       // ~58 km/h, plenty for a driveway
    maxReverse: 6.0,
    maxSteer: 0.62,       // radians at the front wheels
    steerRate: 2.8,       // how fast the wheels turn toward the target angle
    steerEase: 0.55,      // steering authority falls off with speed
    rideHeight: RIDE_HEIGHT,
    suspension: 8.0,      // how briskly the body settles onto the ground
    gravity: 22.0,
};

export default class Car {
    /**
     * @param {object} spec   validated vehicle spec from the scene
     * @param {object|null} model the car it is — `{ meta, body, wheels }`
     *   from CarModels — or null until it has loaded (setModel)
     * @param {Octree} octree the same collision tree the player uses
     */
    constructor(spec, model, octree) {
        this.spec = spec;
        this.octree = octree;

        this.controls = { forward: false, backward: false, left: false, right: false, brake: false };

        this.speed = 0;
        this.steer = 0;
        this.heading = THREE.MathUtils.degToRad(spec.yaw || 0);
        this.verticalVelocity = 0;
        this.onGround = false;

        this.group = new THREE.Group();
        this.group.name = `car:${spec.id}`;
        this.group.position.set(spec.position[0], spec.elevation + PARAMS.rideHeight, spec.position[1]);
        this.group.rotation.y = this.heading;

        this.model = null;
        this.parts = [];
        this.wheels = [];
        // Its headlamps, tail, brake and reversing lamps (CarLights.js).
        this.lights = new CarLights(this);
        this.setModel(model);

        this.group.userData = { kind: "car", id: spec.id, label: "Car", car: this };
    }

    /**
     * Wear a car's model: its body, and its wheels where it has them. The car
     * stays where it is; only what it looks like, how its wheels sit and how
     * big it is change.
     */
    setModel(model) {
        for (const part of this.parts) part.removeFromParent();
        this.parts = [];
        this.wheels = [];
        this.model = model || null;
        if (!model) return;

        const { meta } = model;
        const [x0, , z0] = meta.body.min;
        const [x1, , z1] = meta.body.max;
        this.size = { width: x1 - x0, length: z1 - z0, middle: (z0 + z1) / 2 };
        this.wheelBase = meta.wheels.front.z - meta.wheels.rear.z;

        const body = model.body.clone(true);
        body.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });
        this.group.add(body);
        this.parts.push(body);

        // Each wheel: a pivot that steers, and in it the wheel, which turns,
        // and what does not turn with it (its brake caliper). The model has a
        // wheel per axle, each built for the left-hand side.
        for (const end of ["front", "rear"]) {
            const w = meta.wheels[end];
            for (const side of [1, -1]) {
                const cfg = {
                    at: new THREE.Vector3(side * w.x, w.radius - RIDE_HEIGHT, w.z),
                    steers: end === "front",
                    radius: w.radius,
                };
                const pivot = new THREE.Group();
                pivot.position.copy(cfg.at);
                const spinner = new THREE.Group();
                pivot.add(spinner);
                const source = model.wheels.getObjectByName(`wheel_${end}`);
                if (source) {
                    const wheel = source.clone(true);
                    const still = wheel.getObjectByName(`static_${end}`);
                    if (still) {
                        still.removeFromParent();
                        // Mirrored across the car for the right — in a group
                        // of its own, since its own transform is how its
                        // packed vertices are unpacked.
                        const mirror = new THREE.Group();
                        mirror.scale.set(side, 1, 1);
                        mirror.add(still);
                        pivot.add(mirror);
                    }
                    // The wheel's axle runs along X, so the far side is a
                    // half turn about Y.
                    if (side < 0) wheel.rotation.y = Math.PI;
                    spinner.add(wheel);
                }
                pivot.traverse((o) => {
                    if (o.isMesh) o.castShadow = o.receiveShadow = true;
                });
                this.group.add(pivot);
                this.parts.push(pivot);
                this.wheels.push({ pivot, spinner, cfg, spin: 0 });
            }
        }

        // The models were made for a viewer's image-based lighting: their
        // chrome, lamp reflectors and rims need something to reflect.
        applyReflections(this.group, { imageLit: true });
        plainGlass(this.group);
        // Its lamps where this model has them.
        this.lights.attach(model);
    }

    // ------------------------------------------------------------------
    // Driving
    // ------------------------------------------------------------------

    /**
     * Height and slope of the ground under a world point, or null if there is
     * none. Octree.rayIntersect reports `{ distance, triangle, position }` and
     * no normal, so the slope comes from the triangle it hit.
     */
    groundAt(point, reach = 3.0) {
        const hit = this.octree.rayIntersect(new THREE.Ray(
            _ray.copy(point).setY(point.y + 1.2),
            _down
        ), { far: reach + 1.2 });
        if (!hit || hit.distance > reach + 1.2) return null;

        const normal = new THREE.Vector3(0, 1, 0);
        hit.triangle?.getNormal?.(normal);
        // Triangle winding is not guaranteed, so make it point upward.
        if (normal.y < 0) normal.negate();
        return { y: hit.position.y, normal };
    }

    update(delta) {
        const dt = Math.min(delta, 1 / 30);   // a long frame must not tunnel
        const p = PARAMS;

        // --- longitudinal ------------------------------------------------
        let accel = 0;
        if (this.controls.forward) accel += p.accel;
        if (this.controls.backward) accel -= this.speed > 0.5 ? p.brake : p.reverse;
        if (this.controls.brake) accel -= Math.sign(this.speed) * p.brake;

        this.speed += accel * dt;
        this.speed -= this.speed * p.drag * dt;
        if (!this.controls.forward && !this.controls.backward && Math.abs(this.speed) < 0.2) {
            this.speed = 0;
        }
        this.speed = THREE.MathUtils.clamp(this.speed, -p.maxReverse, p.maxSpeed);

        // --- steering ----------------------------------------------------
        let target = 0;
        if (this.controls.left) target += p.maxSteer;
        if (this.controls.right) target -= p.maxSteer;
        // Less lock at speed, so it does not spin on the spot at 50 km/h.
        target *= 1 / (1 + Math.abs(this.speed) * p.steerEase * 0.1);
        this.steer += (target - this.steer) * Math.min(1, p.steerRate * dt);

        // Bicycle model: heading turns in proportion to distance travelled,
        // so the car pivots about its rear axle and stands still when parked.
        if (Math.abs(this.speed) > 0.01) {
            this.heading += (this.speed * dt / (this.wheelBase || 2.9)) * Math.tan(this.steer);
        }

        // --- proposed movement -------------------------------------------
        _forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        const step = _v.copy(_forward).multiplyScalar(this.speed * dt);

        const before = this.group.position.clone();
        this.group.position.add(step);

        // --- ground ------------------------------------------------------
        let ground = this.groundAt(this.group.position);
        if (!ground && this.onGround) {
            // Off the edge of the ground — a site's terrain has no wall round
            // it, as the neighbourhood's world has — it is held at the edge as
            // at a wall, rather than driving off it and falling for ever.
            ground = this.alongEdge(before, step, dt);
        }
        if (ground) {
            const rest = ground.y + p.rideHeight;
            this.group.position.y += (rest - this.group.position.y) *
                Math.min(1, p.suspension * dt);
            this.verticalVelocity = 0;
            this.onGround = true;
            _normal.copy(ground.normal);
            // For the body's capsule to lie along it (collider).
            (this.slope ??= new THREE.Vector3()).copy(ground.normal);
        } else {
            this.verticalVelocity -= p.gravity * dt;
            this.group.position.y += this.verticalVelocity * dt;
            this.onGround = false;
            _normal.set(0, 1, 0);
        }

        // --- walls -------------------------------------------------------
        // One capsule spanning the body, resolved against the same octree the
        // player uses. A head-on hit kills the speed so the car stops rather
        // than grinding along the wall at full throttle.
        const hit = this.octree.capsuleIntersect(this.collider());
        if (hit) {
            this.group.position.addScaledVector(hit.normal, hit.depth);
            const head = hit.normal.dot(_forward);
            if (Math.sign(head) !== Math.sign(this.speed)) {
                this.speed *= Math.max(0, 1 - Math.abs(head)) * 0.4;
            }
        }

        // --- orientation --------------------------------------------------
        // Yaw from the heading, then tilt the body onto the ground normal so
        // it leans on a slope instead of floating level through it.
        _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
        if (this.onGround) {
            const tilt = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0), _normal
            );
            _q.premultiply(tilt);
        }
        this.group.quaternion.slerp(_q, Math.min(1, 10 * dt));

        // --- wheels -------------------------------------------------------
        // Rolling forward (+Z) turns the top of the wheel forward: a positive
        // turn about X, which carries +Y toward +Z.
        const travelled = this.group.position.distanceTo(before) * Math.sign(this.speed || 1);
        for (const wheel of this.wheels) {
            wheel.spin += travelled / wheel.cfg.radius;
            wheel.pivot.rotation.set(0, wheel.cfg.steers ? this.steer : 0, 0);
            wheel.spinner.rotation.set(wheel.spin, 0, 0);
        }

        // --- lamps -------------------------------------------------------
        this.lights.update(this.controls, this.speed);

    }

    /**
     * A step that would take the car off the edge of the ground (update):
     * only what of it goes over the edge is stopped, as a wall stops what
     * of a car's way goes into it. The car goes on along the edge — the
     * longest of the step's ways round with ground under it: across a
     * square terrain's edge or the ground plane's, the step's own share
     * along it, else turned up to 75° either way — and its wheels scrub
     * against the edge: its speed falls towards what of it goes that way, at
     * EDGE_SCRUB a second. So it slides on along the edge met at a slant,
     * the slower the more squarely it meets it; met head on it stands, its
     * wheels turning slower and slower — pressed on, at about 4.5 m/s, so
     * that steered away it turns away and drives off (its heading turns with
     * its speed: Car.update's bicycle). With ground nowhere round it (a
     * corner met head on), it stays where it was and stops.
     *
     * @param {THREE.Vector3} before  where it was, on the ground
     * @param {THREE.Vector3} step    where this frame's speed would take it
     * @param {number} dt
     * @returns {{ y: number, normal: THREE.Vector3 }|null}  the ground where it is now
     */
    alongEdge(before, step, dt) {
        const length = step.length();
        let best = null;
        let ground = null;
        if (length > 1e-6) {
            for (const way of edgeWays(step)) {
                // How much of the step goes this way, and whether it is still on the ground there.
                const share = way.dot(step) / length;
                if (share <= 1e-3 || (best && share <= best.share)) continue;
                const there = this.groundAt(_at.copy(before).addScaledVector(way, share * length));
                if (there) {
                    best = { way, share };
                    ground = there;
                }
            }
        }
        if (!best) {
            this.group.position.copy(before);
            this.speed = 0;
            return this.groundAt(this.group.position);
        }
        this.group.position.copy(before).addScaledVector(best.way, best.share * length);
        this.speed *= best.share + (1 - best.share) * Math.exp(-EDGE_SCRUB * dt);
        return ground;
    }

    /**
     * The body, as the capsule the octree understands.
     *
     * It sits well clear of the road surface: the wheels already handle the
     * ground by raycast, and a capsule wide enough to span the car has a
     * lower hemisphere that would otherwise plough through the floor slab and
     * brake the car to a standstill on flat tarmac.
     */
    collider() {
        const size = this.size || { width: 2, length: 4.9, middle: 0 };
        const radius = Math.min(CAPSULE_MAX_RADIUS, size.width * 0.46);
        const half = Math.max(0, size.length / 2 - radius);
        // Along the ground it stands on, and lifted off it square to it: on
        // a hill, level, its nose would be in the road going up.
        const up = this.onGround && this.slope ? this.slope : _worldUp;
        const axis = _v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        axis.addScaledVector(up, -axis.dot(up)).normalize();
        const middle = this.group.position.clone().addScaledVector(axis, size.middle);
        const a = middle.clone().addScaledVector(axis, -half).addScaledVector(up, radius - CAPSULE_CLEARANCE);
        const b = middle.clone().addScaledVector(axis, half).addScaledVector(up, radius - CAPSULE_CLEARANCE);
        return new Capsule(a, b, radius);
    }

    /** Where a driver stands when they get out — beside the door, not inside it. */
    exitPoint() {
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion);
        const spot = this.group.position.clone().addScaledVector(side, (this.size?.width || 2.2) / 2 + 0.8);
        const ground = this.groundAt(spot, 4.0);
        spot.y = ground ? ground.y : this.spec.elevation;
        return spot;
    }

    dispose() {
        this.group.traverse((child) => {
            if (child.isMesh && child.geometry) child.geometry.dispose();
        });
    }
}

/**
 * The ways a car met by the edge of the ground may go on along it (Car's
 * alongEdge), as unit vectors on the ground: the step's own share across
 * each of the plan's axes — a terrain's square and the ground plane's edges
 * run along them — and the step's way turned EDGE_TURNS either side, for an
 * edge that runs otherwise (a drop deeper than the ground is felt for).
 */
function edgeWays(step) {
    const ways = [new THREE.Vector3(Math.sign(step.x), 0, 0), new THREE.Vector3(0, 0, Math.sign(step.z))];
    const heading = Math.atan2(step.x, step.z);
    for (const turn of EDGE_TURNS) {
        for (const side of [1, -1]) ways.push(new THREE.Vector3(Math.sin(heading + side * turn), 0, Math.cos(heading + side * turn)));
    }
    return ways;
}

import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";

/**
 * A drivable car.
 *
 * The enter/exit flow, the chase camera and the control scheme are carried
 * over from the sibling `game` project. Its physics are not: that car is a
 * Rapier raycast vehicle and its whole world is built from Rapier colliders,
 * whereas this app collides everything — player included — against a three.js
 * Octree. Rather than run a second physics world alongside the octree (plus
 * two megabytes of wasm) for a car that lives in a garage and on a drive, the
 * same octree drives an arcade model here: a ray per wheel to sit the car on
 * the ground and take its pitch and roll, and a swept capsule for walls.
 */

const _v = new THREE.Vector3();
const _ray = new THREE.Vector3();      // ground probes only, never shared
const _idealOffset = new THREE.Vector3();
const _idealLookAt = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _forward = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Wheel positions in the chassis's own frame.
 *
 * Measured from the model rather than copied: this chassis is 2.18 wide on X
 * and 4.72 long on Z, so Z is the longitudinal axis and +Z is forward — the
 * same convention the heading maths uses. The sibling project's car is built
 * the other way round, and reusing its offsets put the wheels 0.21 outside a
 * body only 1.09 half-wide.
 *
 * Y is the axle height: the wheel is 0.66 across, so its centre sits one
 * radius above the ground, i.e. RIDE_HEIGHT below the chassis origin.
 */
const WHEEL_RADIUS = 0.33;
const RIDE_HEIGHT = 0.45;
const AXLE_Y = WHEEL_RADIUS - RIDE_HEIGHT;
const TRACK = 0.86;        // half the distance between left and right wheels
const WHEELS = [
    { at: new THREE.Vector3(TRACK, AXLE_Y, 1.55), steers: true },   // front right
    { at: new THREE.Vector3(-TRACK, AXLE_Y, 1.55), steers: true },  // front left
    { at: new THREE.Vector3(TRACK, AXLE_Y, -1.35), steers: false }, // rear right
    { at: new THREE.Vector3(-TRACK, AXLE_Y, -1.35), steers: false },// rear left
];

// Body capsule: lifted so its underside clears the road, and narrow enough
// to leave room either side in a single garage.
const CAPSULE_RADIUS = 0.90;   // body is 2.18 wide
const CAPSULE_LIFT = 0.62;

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
    wheelBase: 2.90,      // front axle to rear axle, from the offsets above
    wheelRadius: WHEEL_RADIUS,
    rideHeight: RIDE_HEIGHT,
    suspension: 8.0,      // how briskly the body settles onto the ground
    gravity: 22.0,
};

export default class Car {
    /**
     * @param {object} spec   validated vehicle spec from the scene
     * @param {object} models { chassis, wheel } loaded GLTF scenes
     * @param {Octree} octree the same collision tree the player uses
     */
    constructor(spec, models, octree) {
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

        this.cameraPosition = new THREE.Vector3();
        this.cameraLookAt = new THREE.Vector3();
        this.cameraSeeded = false;

        this.build(models);

        this.group.userData = { kind: "car", id: spec.id, label: "Car", car: this };
    }

    build(models) {
        if (models.chassis) {
            const body = models.chassis.clone(true);
            body.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                }
            });
            this.group.add(body);
        }

        this.wheels = WHEELS.map((cfg) => {
            const pivot = new THREE.Group();
            pivot.position.copy(cfg.at);
            if (models.wheel) {
                const mesh = models.wheel.clone(true);
                // The wheel disc's axle runs along X, so the far side is a
                // half turn about Y.
                if (cfg.at.x < 0) mesh.rotation.y = Math.PI;
                mesh.traverse((o) => {
                    if (o.isMesh) o.castShadow = true;
                });
                pivot.add(mesh);
            }
            this.group.add(pivot);
            return { pivot, cfg, spin: 0 };
        });
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
        ));
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
            this.heading += (this.speed * dt / p.wheelBase) * Math.tan(this.steer);
        }

        // --- proposed movement -------------------------------------------
        _forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        const step = _v.copy(_forward).multiplyScalar(this.speed * dt);

        const before = this.group.position.clone();
        this.group.position.add(step);

        // --- ground ------------------------------------------------------
        const ground = this.groundAt(this.group.position);
        if (ground) {
            const rest = ground.y + p.rideHeight;
            this.group.position.y += (rest - this.group.position.y) *
                Math.min(1, p.suspension * dt);
            this.verticalVelocity = 0;
            this.onGround = true;
            _normal.copy(ground.normal);
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
        const travelled = this.group.position.distanceTo(before) * Math.sign(this.speed || 1);
        for (const wheel of this.wheels) {
            wheel.spin -= travelled / PARAMS.wheelRadius;
            wheel.pivot.rotation.set(0, wheel.cfg.steers ? this.steer : 0, 0);
            wheel.pivot.rotateX(wheel.spin);
        }

        this.updateCamera(dt);
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
        const half = 1.45;         // body is 4.72 long, less the cap radius
        const axis = _v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        const a = this.group.position.clone().addScaledVector(axis, -half);
        const b = this.group.position.clone().addScaledVector(axis, half);
        a.y += CAPSULE_LIFT;
        b.y += CAPSULE_LIFT;
        return new Capsule(a, b, CAPSULE_RADIUS);
    }

    updateCamera(dt) {
        // Ideal chase position, behind and above, in the car's own frame.
        _idealOffset.set(0, 3.2, -8.5).applyQuaternion(this.group.quaternion);
        _idealOffset.add(this.group.position);
        if (_idealOffset.y < this.group.position.y + 1.0) {
            _idealOffset.y = this.group.position.y + 1.0;
        }

        _idealLookAt.set(0, 0.8, 3.0).applyQuaternion(this.group.quaternion);
        _idealLookAt.add(this.group.position);

        if (!this.cameraSeeded) {
            this.cameraPosition.copy(_idealOffset);
            this.cameraLookAt.copy(_idealLookAt);
            this.cameraSeeded = true;
            return;
        }

        const smoothing = 1 - Math.pow(0.0015, dt);
        this.cameraPosition.lerp(_idealOffset, smoothing);
        this.cameraLookAt.lerp(_idealLookAt, smoothing);
    }

    /** Where a driver stands when they get out — beside the door, not inside it. */
    exitPoint() {
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion);
        const spot = this.group.position.clone().addScaledVector(side, 1.9);
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

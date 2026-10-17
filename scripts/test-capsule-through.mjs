/**
 * The visitor's capsule against a face that faces up, met from under it
 * (frontend/Experience/World/Collision.js: capsuleIntersect's `from`,
 * headroom, SceneOctree.triangleCapsuleIntersect): `node
 * scripts/test-capsule-through.mjs`. Exits 1 if any of these does not hold:
 *
 *   1. A room's ceiling — one-sided, facing up, as the app's rooms have it —
 *      with a head jumped up through it (from a bed, a sill) holds the
 *      capsule under it: its top end a radius below, never lifted onto the
 *      floor above, as three's resolve alone lifts it (which is checked
 *      too, so the case is the case).
 *   2. A ceiling of many triangles, the head through it beside the edges
 *      between them, is not shoved sideways off them: the head comes down
 *      where it went up.
 *   3. A body falling onto a floor, however fast — its middle past the
 *      floor's face in one frame — is caught on it, as it always was.
 *   4. Walking, standing, landing and walking into a wall and a ramp, the
 *      capsule given where it came from is pushed exactly as without it,
 *      to the last bit, frame after frame.
 *   5. Under a flight (a ramp's underside, facing down), a head is met as
 *      it always was, from below; and a face that faces down is fallen
 *      through from above as it always was.
 *   6. A capsule given no `from` (a car's, a seat's test) meets every face
 *      as three has it.
 */
import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";
import Collision, { buildOctree } from "../frontend/Experience/World/Collision.js";

const results = [];
let failed = 0;
const say = (name, problem, note = "") => {
    results.push({ name, problem, note });
    if (problem) failed++;
};
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A world of these meshes, static. */
function world(meshes) {
    const collision = new Collision();
    const root = new THREE.Group();
    for (const mesh of meshes) root.add(mesh);
    root.updateMatrixWorld(true);
    collision.setStatic(buildOctree([root]));
    return collision;
}
/** A flat face at height y over [x0, z0, x1, z1], facing up (or down), cut into `n` × `n` squares of two triangles. */
function plane(y, [x0, z0, x1, z1], { up = true, n = 1 } = {}) {
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, n, n).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    return new THREE.Mesh(geometry);
}
function box(w, h, d, x, y, z) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}
/** The capsule the visitor walks in: radius 0.35, its line 1.2 m, its feet at (x, feet, z). */
function body(x, feet, z) {
    return new Capsule(new THREE.Vector3(x, feet + 0.35, z), new THREE.Vector3(x, feet + 1.55, z), 0.35);
}
/** One frame as Player has it: moved by `move`, then pushed by the trees (with `from` its middle before the move, or none). */
function frame(collision, capsule, move, { from = true } = {}) {
    const before = capsule.getCenter(new THREE.Vector3());
    capsule.translate(move);
    const result = collision.capsuleIntersect(capsule, from ? { from: before } : {});
    if (result) capsule.translate(result.normal.clone().multiplyScalar(result.depth));
    return result;
}

// A room 2.75 m high as Ladonia's are: its floor a slab's top at 0, its ceiling a plane facing up at 2.75 (the floor
// above's underside, drawn from the room), the floor above a plane facing up at 3.0 — nothing between that faces down.
const room = () => [box(10, 0.3, 10, 0, -0.15, 0), plane(2.75, [-5, -5, 5, 5]), plane(3.0, [-5, -5, 5, 5])];

// 1. A head jumped up through the ceiling, from a sill: feet 1.0 up, rising 0.3 m this frame (off the diagonal
// between the plane's two triangles, which three's test meets edge-on).
{
    const collision = world(room());
    const held = body(0.3, 1.0, 0.2);
    frame(collision, held, new THREE.Vector3(0, 0.3, 0));
    const lifted = body(0.3, 1.0, 0.2);
    frame(collision, lifted, new THREE.Vector3(0, 0.3, 0), { from: false });
    say("a head up through a ceiling is held under it", Math.abs(held.end.y - (2.75 - 0.35)) < 1e-6 ? null : `its end at ${r3(held.end.y)}, not ${2.75 - 0.35}`, `end ${r3(held.end.y)} (three alone: feet ${r3(lifted.start.y - 0.35)})`);
    say("...where three's resolve alone lifts it onto the floor above", lifted.start.y - 0.35 > 2.7 ? null : `three left its feet at ${r3(lifted.start.y - 0.35)}: not the case under test`);
    // And it stays held, frame after frame, as it goes on rising.
    let worst = -Infinity;
    for (let i = 0; i < 20; i++) {
        frame(collision, held, new THREE.Vector3(0, 0.1, 0));
        worst = Math.max(worst, held.end.y);
    }
    say("...frame after frame", worst <= 2.75 + 1e-6 ? null : `its end reached ${r3(worst)}`);
}

// 2. A ceiling of many triangles, the head through it beside the edges between them.
{
    const collision = world([box(10, 0.3, 10, 0, -0.15, 0), plane(2.75, [-5, -5, 5, 5], { n: 40 }), plane(3.0, [-5, -5, 5, 5], { n: 40 })]);
    let worst = 0;
    let three = 0;
    for (const [x, z] of [[0.01, 0.01], [0.125, 0.0], [0.24, 0.26], [-0.37, 0.12], [1.0, 1.0]]) {
        const capsule = body(x, 1.0, z);
        frame(collision, capsule, new THREE.Vector3(0, 0.3, 0));
        worst = Math.max(worst, Math.hypot(capsule.end.x - x, capsule.end.z - z));
        if (capsule.end.y > 2.75) worst = Infinity;
        const alone = body(x, 1.0, z);
        frame(collision, alone, new THREE.Vector3(0, 0.3, 0), { from: false });
        three = Math.max(three, Math.hypot(alone.end.x - x, alone.end.z - z));
    }
    say("a ceiling of 3,200 triangles: no shove off their edges", worst < 1e-6 ? null : `moved ${r3(worst)} m across`, `largest sideways move ${worst.toExponential(1)} m (three alone: ${r3(three)} m)`);
}

// 3. Falling fast onto the ground (solid, 2 m deep): its middle past the ground's face in one frame.
{
    const collision = world([box(10, 2, 10, 0, -1, 0)]);
    const fast = body(0.3, 0.2, 0.2);
    frame(collision, fast, new THREE.Vector3(0, -1.2, 0));
    const three = body(0.3, 0.2, 0.2);
    frame(collision, three, new THREE.Vector3(0, -1.2, 0), { from: false });
    say("a body falling 1.2 m a frame onto the ground is caught on it", Math.abs(fast.start.y - 0.35) < 1e-6 && fast.start.y === three.start.y ? null : `feet at ${r3(fast.start.y - 0.35)} (three: ${r3(three.start.y - 0.35)})`);
}

// 4. Walking about the room: a wall, a ramp, a landing, standing — the same to the last bit with `from` and without.
{
    const meshes = [...room(), box(0.3, 3, 10, 4.5, 1.5, 0), box(2, 0.3, 4, -2, 0.4, 0).rotateZ(0.35)];
    const a = world(meshes);
    const b = world(meshes.map((m) => m.clone()));
    const one = body(-4, 0.5, -3);
    const two = body(-4, 0.5, -3);
    let same = true;
    let frames = 0;
    let velocity = new THREE.Vector3();
    for (let i = 0; i < 1200 && same; i++) {
        const t = i / 60;
        // Walk round, run at the wall, up the ramp, jump now and then (not to the ceiling), stand.
        const target = new THREE.Vector3(Math.sin(t * 0.7) * 4.6, 0, Math.cos(t * 0.5) * 3.5);
        velocity.x += (target.x - one.start.x) * 0.02;
        velocity.z += (target.z - one.start.z) * 0.02;
        velocity.y = i % 180 === 0 ? 5 : velocity.y - 30 / 60;
        velocity.multiplyScalar(0.98);
        const move = velocity.clone().multiplyScalar(1 / 60);
        const ra = frame(a, one, move);
        frame(b, two, move, { from: false });
        if (ra && ra.normal.y > 0) velocity.y = Math.max(0, velocity.y);
        same = one.start.equals(two.start) && one.end.equals(two.end);
        frames = i + 1;
    }
    say("walking, running at a wall, up a ramp, landing: bit for bit as without `from`", same ? null : `apart after ${frames} frames`, `${frames} frames`);
}

// 5. Under a flight, and a face that faces down from above.
{
    // A ramp's slab: a box, tilted, its underside facing down; a head jumped up into it from under it.
    const collision = world([box(10, 0.3, 10, 0, -0.15, 0), box(1, 0.3, 4, 0, 2.1, 0)]);
    const under = body(0.1, 0.2, 0.3);
    frame(collision, under, new THREE.Vector3(0, 0.3, 0));
    const three = body(0.1, 0.2, 0.3);
    frame(collision, three, new THREE.Vector3(0, 0.3, 0), { from: false });
    say("under a flight's slab, a head is met as it always was", under.start.equals(three.start) ? null : `feet ${r3(under.start.y - 0.35)}, three ${r3(three.start.y - 0.35)}`);
    // A plane facing down, fallen onto from above.
    const down = world([plane(1.0, [-5, -5, 5, 5], { up: false })]);
    const falling = body(0.3, 1.1, 0.2);
    frame(down, falling, new THREE.Vector3(0, -0.4, 0));
    const fell = body(0.3, 1.1, 0.2);
    frame(down, fell, new THREE.Vector3(0, -0.4, 0), { from: false });
    say("a face that faces down is fallen through from above as it always was", falling.start.equals(fell.start) ? null : `feet ${r3(falling.start.y - 0.35)}, three ${r3(fell.start.y - 0.35)}`);
}

// 6. No `from`: three's resolve, the same object for object.
{
    const collision = world(room());
    const capsule = body(0.3, 1.0, 0.2);
    capsule.translate(new THREE.Vector3(0, 0.3, 0));
    const a = collision.capsuleIntersect(capsule.clone());
    const b = collision.resolve(capsule.clone());
    say("without `from`, three's resolve", a && b && a.depth === b.depth && a.normal.equals(b.normal) ? null : "a different push");
}

for (const { name, problem, note } of results) {
    console.log(`${problem ? "FAIL" : "ok  "} ${name}${note ? `\n       ${note}` : ""}`);
    if (problem) console.log(`       NOT EXPECTED: ${problem}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

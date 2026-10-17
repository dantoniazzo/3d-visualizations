/**
 * Where the visitor sits (frontend/Experience/World/Seats.js), and how the
 * people's sitting clip is fitted to their figure (frontend/Experience/
 * Utils/fitClip.js), in node: `node scripts/test-seats.mjs`. Prints each case
 * and exits 1 if any is not what is expected of it.
 *
 * The fitting: a clip whose hips are keyed in its skeleton's own frame, y
 * up, in metres (the people's clips.glb), played on a figure whose skeleton
 * hangs from an "Armature" turned +90° about x and scaled 0.01 (avatar_male.
 * glb, an FBX's), must put the hips where it puts them on a figure whose
 * skeleton stands unturned (avatar_female.glb, the people) — turned as the
 * clip turns them, at the clip's height scaled to the figure's hips — and
 * without the correction lays him on his back.
 *
 * The seats: Ladonia's (scenes/kosinozici-villas.json, public/models/
 * furniture/seats.json; skipped with a note where either is missing) — how
 * many, which are left out, which are held by the people placed on them;
 * which one a ray aims at; and where a figure sits on each (poseFor): facing
 * the seat's way, its knees past the front edge, no further forward than
 * shared/people.js's planner would put one but on a chaise's deep end, which
 * is sat on at its front.
 *
 * Which of the collision's triangles are a seat's own (own): those called as
 * its piece is, within the piece's footprint — not the next chair's, nor the
 * table's — and, for the way on foot, only its own place on a sofa.
 *
 * The knees opened, for a seat lower than a clip is made for (openKnees,
 * kneeFor, legsAt): a shin hanging before the seat turns out until its
 * foot is as far up as asked, the knee where it was and the foot as level
 * as it was; one tucked back under the seat turns further under instead;
 * the rest of the clip is untouched; and on a figure whose skeleton hangs
 * from a turned, scaled armature (avatar_male.glb's) it comes out the same.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { canonical, fitClip, kneeFor, legsAt, openKnees, rigOf } from "../frontend/Experience/Utils/fitClip.js";
import Seats, { SITTING } from "../frontend/Experience/World/Seats.js";
import { FORWARD_MOST, GIVE, HEEL_CLEAR, LEG_CLEAR, SEAT_DEPTH, SEAT_HEIGHT, SIT_BACK, facingOf } from "../shared/people.js";

const results = [];
let failed = 0;

function check(name, what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    results.push({ name, what, got, want, ok });
}

const round = (value, places = 4) => Math.round(value * 10 ** places) / 10 ** places;
const near = (a, b, within = 1e-4) => Math.abs(a - b) <= within;

// ---- fitting a clip to a figure ---------------------------------------------------------------------------------

/** A skeleton of hips and a spine under `armature` (turned and scaled as given), its hips at rest as given, in a root. */
function skeleton({ prefix = "", turn = 0, scale = 1, hips = [0, 1, 0], rest = 0 } = {}) {
    const root = new THREE.Group();
    const armature = new THREE.Object3D();
    armature.name = "Armature";
    armature.rotation.x = turn;
    armature.scale.setScalar(scale);
    const hipsBone = new THREE.Bone();
    hipsBone.name = `${prefix}Hips`;
    hipsBone.position.fromArray(hips);
    hipsBone.rotation.x = rest;
    const spine = new THREE.Bone();
    spine.name = `${prefix}Spine`;
    spine.position.set(0, 10 * (scale === 1 ? 0.01 : 1), 0);
    hipsBone.add(spine);
    armature.add(hipsBone);
    root.add(armature);
    root.updateMatrixWorld(true);
    return { root, hips: hipsBone, spine };
}

/** The people's skeleton's sort of clip: hips moved and turned in its own frame, y up, metres; the spine bent. */
const turnedHips = [new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.17, 0.35, 0.05)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.3, 0.02))];
const clip = new THREE.AnimationClip("Sitting Idle", 1, [
    new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, 1], [-0.001, 0.542, -0.006, 0.01, 0.55, 0.0]),
    new THREE.QuaternionKeyframeTrack("mixamorigHips.quaternion", [0, 1], [...turnedHips[0].toArray(), ...turnedHips[1].toArray()]),
    new THREE.QuaternionKeyframeTrack("mixamorigSpine.quaternion", [0, 1], [...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.13).toArray(), 0, 0, 0, 1]),
]);
const CLIPS_HIPS = 0.962;

// The clips' own skeleton: what the clip does to the hips there, at their own height, is what is wanted of every figure.
const source = skeleton({ prefix: "mixamorig", hips: [0, 0.959, 0] });

/** Where the hips stand in the root, `time` seconds into `fitted` played on `figure`: [position, quaternion]. */
function posed(figure, fitted, time) {
    const mixer = new THREE.AnimationMixer(figure.root);
    mixer.clipAction(fitted).play();
    mixer.setTime(time);
    figure.root.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    figure.hips.matrixWorld.decompose(position, quaternion, new THREE.Vector3());
    return [position, quaternion];
}

// The visitor's male figure: an FBX's armature, its hips 1.0135 m up, turned −90° about x at rest to stand up in it.
const male = skeleton({ prefix: "mixamorig", turn: Math.PI / 2, scale: 0.01, hips: [0.145, 2.018, -101.351], rest: -Math.PI / 2 });
// The female: bare names, y up, metres.
const female = skeleton({ hips: [0, 0.992, 0] });

const maleRig = rigOf(male.root);
const femaleRig = rigOf(female.root);
check("canonical names", "mixamorig:Hips, mixamorigHips, mixamorig12:Hips and Hips are all Hips", ["mixamorig:Hips", "mixamorigHips", "mixamorig12:Hips", "Hips"].map(canonical), ["Hips", "Hips", "Hips", "Hips"]);
check("the male's rig", "its hips 1.0135 m over its root; what they hang from turned 90° about x and scaled 0.01", [round(maleRig.hips, 3), Boolean(maleRig.parent), round(new THREE.Vector3(0, 1, 0).applyQuaternion(maleRig.parent.quaternion).z, 3), round(maleRig.parent.matrix.getMaxScaleOnAxis(), 4)], [1.014, true, 1, 0.01]);
check("the female's rig", "her hips 0.992 m up, hanging from her root's own frame (no correction)", [round(femaleRig.hips, 3), femaleRig.parent], [0.992, null]);

for (const [name, figure, rig] of [
    ["male", male, maleRig],
    ["female", female, femaleRig],
]) {
    const ratio = rig.hips / CLIPS_HIPS;
    const { fitted } = fitClip(clip, rig, null, ratio, { into: rig.parent });
    const tracks = fitted.tracks.map((track) => track.name).sort();
    check(`fitted to the ${name}`, "the clip's tracks named for its bones", tracks, [`${rig.boneNames.get("Hips")}.position`, `${rig.boneNames.get("Hips")}.quaternion`, `${rig.boneNames.get("Spine")}.quaternion`].sort());
    for (const time of [0, 0.5]) {
        const [position, quaternion] = posed(figure, fitted, time);
        const [wantAt, wantTurn] = posed(source, clip, time);
        wantAt.multiplyScalar(ratio);
        const turned = quaternion.angleTo(wantTurn);
        check(
            `the ${name}'s hips, ${time} s in`,
            "where the clip puts them, scaled to the figure's hips, turned as it turns them (within 0.1 mm and 0.01°)",
            [near(position.x, wantAt.x), near(position.y, wantAt.y), near(position.z, wantAt.z), turned < 2e-4],
            [true, true, true, true]
        );
    }
}
{
    // Without the correction, as World/People.js fitted the people's clips before (and still does, their armatures unturned).
    const { fitted } = fitClip(clip, maleRig, null, maleRig.hips / CLIPS_HIPS);
    const [position, quaternion] = posed(male, fitted, 0);
    check("the male, uncorrected", "lies on his back: his hips turned about 90° off the clip's and 0.5 m under where they should be", [round(THREE.MathUtils.radToDeg(quaternion.angleTo(turnedHips[0])), 0) > 80, position.y < 0.1], [true, true]);
}
check("the clip itself", "left as it was (each track copied, not changed in place)", round(clip.tracks[0].values[1], 3), 0.542);

// ---- the knees opened, for a lower seat --------------------------------------------------------------------------

{
    /** Hips, and a leg each side — a thigh 0.45 m, a shin 0.42 m, a foot and its toes — every bone along its own +y, as Mixamo's. */
    const legged = ({ turn = 0, scale = 1, hips = [0, 1, 0] } = {}) => {
        const root = new THREE.Group();
        const armature = new THREE.Object3D();
        armature.rotation.x = turn;
        armature.scale.setScalar(scale);
        const unit = scale === 1 ? 1 : 1 / scale;
        const bone = (name, at, parent) => {
            const node = new THREE.Bone();
            node.name = `mixamorig${name}`;
            node.position.set(...at.map((n) => n * unit));
            parent.add(node);
            return node;
        };
        const hipsBone = bone("Hips", [0, 0, 0], armature);
        hipsBone.position.set(...hips);
        for (const [side, x] of [["Left", 0.1], ["Right", -0.1]]) {
            const thigh = bone(`${side}UpLeg`, [x, 0, 0], hipsBone);
            const shin = bone(`${side}Leg`, [0, 0.45, 0], thigh);
            const foot = bone(`${side}Foot`, [0, 0.42, 0], shin);
            bone(`${side}ToeBase`, [0, 0.12, 0], foot);
        }
        root.add(armature);
        return root;
    };
    // Sitting: the thighs out level (+z) — each twisted 40° about itself, so that its own frame is not the world's turned
    // about the knee's axis — the right shin hanging straight down, the left 30° tucked back; the feet level.
    const up = (to) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to);
    const thighTurn = up(new THREE.Vector3(0, 0, 1)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7));
    const hang = thighTurn.clone().invert().multiply(up(new THREE.Vector3(0, -1, 0)));
    const tuck = thighTurn.clone().invert().multiply(up(new THREE.Vector3(0, -Math.cos(0.52), -Math.sin(0.52))));
    const level = (shin) => thighTurn.clone().multiply(shin).invert().multiply(up(new THREE.Vector3(0, 0, 1)));
    const keyed = (name, q) => new THREE.QuaternionKeyframeTrack(`mixamorig${name}.quaternion`, [0, 1], [...q.toArray(), ...q.toArray()]);
    const sitting = new THREE.AnimationClip("Sitting Idle", 1, [
        new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 0.5, 0, 0, 0.5, 0]),
        // (Keyed upright in the root's frame: carried into a turned armature's, it stands as on the unturned figure.)
        keyed("Hips", new THREE.Quaternion()),
        keyed("LeftUpLeg", thighTurn),
        keyed("RightUpLeg", thighTurn),
        keyed("LeftLeg", tuck),
        keyed("RightLeg", hang),
        keyed("LeftFoot", level(tuck)),
        keyed("RightFoot", level(hang)),
    ]);
    const where = (root, clip) => {
        const copy = root.clone();
        const mixer = new THREE.AnimationMixer(copy);
        mixer.clipAction(clip).play();
        mixer.update(0);
        copy.updateMatrixWorld(true);
        const at = (name) => copy.getObjectByName(`mixamorig${name}`);
        return {
            knee: at("RightLeg").getWorldPosition(new THREE.Vector3()),
            ankle: at("RightFoot").getWorldPosition(new THREE.Vector3()),
            foot: at("RightFoot").getWorldQuaternion(new THREE.Quaternion()),
            leftAnkle: at("LeftFoot").getWorldPosition(new THREE.Vector3()),
            leftFoot: at("LeftFoot").getWorldQuaternion(new THREE.Quaternion()),
        };
    };
    for (const [skin, figure] of [["unturned", legged({ hips: [0, 0.5, 0] })], ["turned and scaled, as avatar_male's", legged({ turn: Math.PI / 2, scale: 0.01, hips: [0, 0, -50] })]]) {
        const rig = rigOf(figure);
        const fitted = fitClip(sitting, rig, null, 1, { into: rig.parent }).fitted;
        const legs = legsAt(figure, fitted, rig);
        const need = 0.04;
        const angles = { left: kneeFor(legs.left, need, THREE.MathUtils.degToRad(50)), right: kneeFor(legs.right, need, THREE.MathUtils.degToRad(50)) };
        const opened = fitClip(openKnees(sitting, legs, angles), rig, null, 1, { into: rig.parent }).fitted;
        const before = where(figure, fitted);
        const after = where(figure, opened);
        const rise = after.ankle.y - before.ankle.y;
        const leftRise = after.leftAnkle.y - before.leftAnkle.y;
        const levelKept = after.foot.angleTo(before.foot) < 1e-6 && after.leftFoot.angleTo(before.leftFoot) < 1e-6;
        check(
            `knees opened, ${skin}`,
            "a hanging shin turns out (+), a tucked one further under (−), each foot up 4 cm, the knee where it was, the feet as level",
            [angles.right > 0, angles.left < 0, near(rise, need, 1e-5), near(leftRise, need, 1e-5), after.knee.distanceTo(before.knee) < 1e-9, levelKept],
            [true, true, true, true, true, true]
        );
        const untouched = opened.tracks.filter((track) => !/(Left|Right)(Leg|Foot)\.quaternion$/.test(track.name)).every((track) => {
            const old = fitted.tracks.find((other) => other.name === track.name);
            return old && old.values.every((value, i) => value === track.values[i]);
        });
        check(`the rest of the clip as it was, ${skin}`, "every track but the shins' and the feet's the same, value for value", untouched, true);
    }
    // A shin out along the thigh's line: no turn of its knee lifts its foot further than one way, the way kneeFor turns it.
    {
        const straight = { knee: new THREE.Vector3(0, 0.5, 0.45), ankle: new THREE.Vector3(0, 0.5, 0.87), low: 0.5, axis: new THREE.Vector3(1, 0, 0), local: new THREE.Vector3(1, 0, 0) };
        const most = THREE.MathUtils.degToRad(50);
        const angle = kneeFor(straight, 1, most);
        const shin = new THREE.Vector3(0, 0, 0.42);
        const lift = (a) => shin.clone().applyAxisAngle(straight.axis, a).y;
        check("a knee no turn helps enough", "asked for a metre: turned as far as lifts its foot most (50°, the way up)", [near(Math.abs(angle), most, 1e-9), lift(angle) >= lift(-angle)], [true, true]);
    }
}

// ---- Ladonia's seats --------------------------------------------------------------------------------------------

const read = (path) => {
    try {
        return JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"));
    } catch {
        return null;
    }
};
const scene = read("../scenes/kosinozici-villas.json");
const spec = scene?.scene ?? scene?.spec ?? null;
const seatsJson = read("../public/models/furniture/seats.json");

if (!spec || !seatsJson) {
    console.log("(Ladonia's scene or seats.json not found: its seats are not checked.)\n");
} else {
    // A world as Seats asks it: the spec, the people placed on their seats and drawn, nobody else.
    const world = {
        spec,
        sceneBuilder: { spec, furniture: new Map() },
        people: { seats: () => Promise.resolve(seatsJson), root: { visible: true }, get: () => ({ group: { visible: true } }) },
        player: null,
        interactables: null,
        collision: null,
    };
    const seats = new Seats(world);
    await seats.ready;
    const list = seats.list;
    const placements = new Map(spec.furniture.map((item) => [item.id, item]));
    const byKind = {};
    for (const seat of list) byKind[seat.kind] = (byKind[seat.kind] ?? 0) + 1;
    check("Ladonia's seats", "219: 4 dozen and more on sofas, the rest on chairs and poufs; no lounger among them", [list.length, Object.keys(byKind).sort(), list.some((seat) => /lounger/.test(placements.get(seat.furniture)?.catalog_id))], [219, ["chair", "sofa", "stool"], false]);
    check("their heights", `all within ${SEAT_HEIGHT[0]}–${SEAT_HEIGHT[1]} m`, list.every((seat) => seat.height >= SEAT_HEIGHT[0] && seat.height <= SEAT_HEIGHT[1]), true);
    check("the chaises' deep ends", `11, deeper than ${SEAT_DEPTH[1]} m`, list.filter((seat) => seat.deep).length, 11);
    const held = list.filter((seat) => seats.taken(seat)).map((seat) => seat.id).sort();
    const placed = (spec.people ?? []).filter((person) => person.pose === "sit").map((person) => `${person.seat.furniture}#${person.seat.index}`).sort();
    check("held by the people", "the seats the people placed sitting are on, and none else", held, placed);
    check("the provider's words", "Sit, and seated Stand up, each with the seat's touch icon", [seats.provider().prompt({ seated: false }), seats.provider().prompt({ seated: true })], [
        { label: "Sit", key: "E", touch: { label: "Sit", icon: "seat" } },
        { label: "Stand up", key: "E", touch: { label: "Stand", icon: "seat" } },
    ]);

    // Aimed at: a ray from a standing head 1.2 m in front of A1's sofa's middle seat, at its point.
    const middle = list.find((seat) => seat.id === "a-f003#1");
    const head = new THREE.Vector3(middle.at.x + middle.face[0] * 1.2, middle.floor + 1.55, middle.at.z + middle.face[1] * 1.2);
    const point = middle.at.clone().setY(middle.at.y + 0.12);
    const at = (point) => new THREE.Ray(head.clone(), point.clone().sub(head).normalize());
    const aimed = seats.pick(at(point));
    check("aimed at", "A1's sofa's middle seat, from a head 1.2 m before it: that seat, as far along the ray as its point is from the head", [aimed?.seat.id, round(aimed?.distance ?? 0, 3)], ["a-f003#1", round(head.distanceTo(point), 3)]);
    const beside = (by) => seats.pick(at(middle.at.clone().add(new THREE.Vector3(middle.face[1] * by, 0.12, -middle.face[0] * by))))?.seat.id ?? null;
    check("aimed beside it", "0.45 m to either side, between it and the next (0.76 and 0.83 m apart): the next, not nothing", [beside(0.45), beside(-0.45)].sort(), ["a-f003#0", "a-f003#2"]);
    check("aimed a little off it", "0.25 m to either side: still the middle seat", [beside(0.25), beside(-0.25)], ["a-f003#1", "a-f003#1"]);
    const far = seats.pick(new THREE.Ray(head.clone().addScaledVector(new THREE.Vector3(middle.face[0], 0, middle.face[1]), 1.5), new THREE.Vector3(-middle.face[0], -0.35, -middle.face[1]).normalize()));
    check("too far", "from 3 m off: beyond a seat's reach (2 m)", far, null);
    const feet = new THREE.Vector3(middle.at.x + middle.face[0] * 0.9, middle.floor, middle.at.z + middle.face[1] * 0.9);
    check("the nearest", "from 0.9 m in front of it, within 1.2 m: that seat", seats.nearest(feet, 1.2)?.id, "a-f003#1");
    {
        // ...but none through a wall (what the collision trees meet across the floor first), nor through a door's leaf
        // still shut (in no tree: Door.getBlockers) — and the seat again once the door is open.
        world.collision = { rayIntersect: () => ({ distance: 0.4 }) };
        const walled = seats.nearest(feet, 1.2)?.id ?? null;
        world.collision = null;
        const leaf = { centre: feet.clone().lerp(middle.at, 0.5).setY(middle.floor + 1), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3), half: new THREE.Vector3(0.45, 1, 0.02) };
        const door = { shut: true, getBlockers: () => (door.shut ? [leaf] : []) };
        world.sceneBuilder.doors = [door];
        const doored = seats.nearest(feet, 1.2)?.id ?? null;
        door.shut = false;
        const opened = seats.nearest(feet, 1.2)?.id ?? null;
        world.sceneBuilder.doors = [];
        check("the nearest, out of sight", "a wall 0.4 m off, or a shut door between: none; the door opened: the seat", [walled, doored, opened], [null, null, "a-f003#1"]);
    }

    // Sitting on each: a figure measured as the male avatar sits in Sitting Idle (Avatar's `sitting`).
    const figure = {
        sitting: (name) =>
            name === SITTING ? { seat: new THREE.Vector3(-0.001, 0.414, -0.006), soles: -0.032, knee: 0.415, tuck: 0.415, far: 0.431, head: new THREE.Vector3(0.011, 1.144, 0.065), eye: new THREE.Vector3(0.011, 1.224, 0.175) } : null,
    };
    const how = figure.sitting(SITTING);
    let facing = 0;
    let forward = 0;
    let front = 0;
    let level = 0;
    let gives = 0;
    for (const seat of list) {
        const pose = seats.poseFor(seat, figure);
        const [fx, fz] = facingOf(seat.facing);
        const way = new THREE.Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
        if (near(way.x, fx, 1e-6) && near(way.z, fz, 1e-6)) facing++;
        const ahead = (pose.point.x - seat.at.x) * fx + (pose.point.z - seat.at.z) * fz;
        const edge = seat.depth - Math.min(SIT_BACK, seat.depth / 2);
        const legs = Math.max(edge + LEG_CLEAR - how.knee, seat.base !== "open" ? edge + HEEL_CLEAR - how.tuck : 0);
        if (seat.deep ? near(ahead, legs, 1e-6) : ahead >= -1e-9 && ahead <= FORWARD_MOST + 1e-9 && near(ahead, Math.min(Math.max(0, legs), FORWARD_MOST), 1e-6)) forward++;
        if (ahead <= edge) front++;
        // Its seat on the cushion, let down into it by what the cushion gives (a sofa's), or lifted a little for its feet.
        const down = seat.at.y - pose.point.y;
        if (down >= -0.015 - 1e-9 && down <= (seat.soft ? GIVE : 0) + 1e-9 && near(pose.position.y + how.seat.y, pose.point.y, 1e-6)) level++;
        if (down > 1e-9) gives++;
    }
    check("facing", "every seat sat on facing its own way", facing, list.length);
    check("forward", `as far forward as puts the knees ${LEG_CLEAR} m past the front edge (and the heels ${HEEL_CLEAR} m, before a solid base): ${FORWARD_MOST} m at most, but on a chaise's deep end all of it`, forward, list.length);
    check("on the seat", "the point sat on never past the seat's front edge", front, list.length);
    check("on the cushion", `its seat on the cushion: let down into a soft one ${GIVE * 100} cm at most, lifted 1.5 cm at most`, level, list.length);
    check("given", "some seats give under the figure (sofas a little higher than its legs are long), not all", gives > 0 && gives < list.length, true);

    // Another visitor's way of sitting, told by its name (Player.sit sends wayOf's): made here for their figure by that
    // name. Clips stood in for, and a figure that fits whatever it is given and sits as Sitting Idle does.
    {
        const upright = new THREE.AnimationClip("Sitting Idle", 1, []);
        const back = new THREE.AnimationClip("Sitting Reclined Male", 1, []);
        seats.clipPromise = Promise.resolve((seats.source = { clip: upright, hips: 1, reclined: back }));
        const visitor = () => {
            const clips = new Map();
            return {
                clips,
                has: (name) => clips.has(name),
                fit: (name, clip) => (clips.set(name, clip), clip),
                addClips: (named) => Object.entries(named).forEach(([name, clip]) => clips.set(name, clip)),
                sitting: (name) => (clips.has(name) ? how : null),
            };
        };
        const a = visitor();
        const b = visitor();
        const c = visitor();
        const told = [await seats.dress(a, "sitting reclined"), await seats.dress(b, SITTING), await seats.dress(c, "sitting on the roof")];
        check(
            "another visitor's way of sitting",
            "'sitting reclined' fits the clip sat back in under that name; 'sitting' Sitting Idle; a name that is no way of sitting nothing more",
            [told, a.clips.get("sitting reclined")?.name, b.clips.get(SITTING)?.name, c.has("sitting on the roof")],
            [[true, true, false], "Sitting Reclined Male", "Sitting Idle", false]
        );
    }
    // The seat's own piece (own: what is left out looking for room to sit on it and for the way to it): what it is
    // called, within its own footprint as placed — the same in the editor and in a public view, which has nothing else
    // to go by — and only its own place on a sofa, for the way on foot; nothing but what is underfoot before the
    // catalogue is here.
    {
        const catalogue = read("../public/models/furniture/catalog.json");
        const items = new Map((catalogue?.items ?? []).map((item) => [item.id, item]));
        const chair = list.find((seat) => seat.id === "a-f010#0");
        const sofa = list.find((seat) => seat.id === "a-f003#1");
        const nextTo = list.find((seat) => seat.id === "a-f003#0");
        const named = (seat) => items.get(seat.piece.catalog_id)?.name;
        const triangle = (label, [x, y, z], size = 0.05) => Object.assign(new THREE.Triangle(new THREE.Vector3(x - size, y, z), new THREE.Vector3(x + size, y, z), new THREE.Vector3(x, y, z + size)), { label });
        const at = (seat, up = 0.3) => [seat.at.x, seat.floor + up, seat.at.z];
        const neighbour = placements.get("a-f011");
        const table = placements.get("a-f009");
        const before = [seats.own(chair)(triangle(named(chair), at(chair))), seats.own(chair)(triangle("Floor", at(chair, 0.01)))];
        world.sceneBuilder.furnitureLibrary = { getItem: (id) => items.get(id) ?? null };
        const own = seats.own(chair);
        check(
            "a chair's own piece",
            "its label within its footprint, yes; the next chair's (same label), the table it is drawn up to, no; the floor, yes; before the catalogue only the floor",
            [own(triangle(named(chair), at(chair))), own(triangle(named(chair), [neighbour.position[0], chair.floor + 0.3, neighbour.position[2]])), own(triangle(items.get(table.catalog_id)?.name, at(chair, 0.7))), own(triangle("Floor", at(chair, 0.01))), before],
            [true, false, false, true, [false, true]]
        );
        const whole = seats.own(sofa);
        const place = seats.own(sofa, { near: true });
        check(
            "a sofa's own place",
            "the sofa's next place: its piece's, but not this place's (the way on foot to this one is not over it)",
            [whole(triangle(named(sofa), at(nextTo))), place(triangle(named(sofa), at(nextTo))), place(triangle(named(sofa), at(sofa)))],
            [true, false, true]
        );

        // Sat on turned to a side (poseFor's `side`): which seats may be, how, and what of the chair is then its own.
        const armchair = list.find((seat) => /arm/i.test(named(seat) ?? "") && seat.alone);
        const lounge = list.find((seat) => seat.reclines);
        const pouf = list.find((seat) => seat.kind === "stool");
        check(
            "which seats turn",
            "a dining chair and a pouf, alone on their pieces, yes; a sofa's place, an armchair (its arm), a lounge chair sat back in, no",
            [chair, pouf, sofa, armchair, lounge].map((seat) => (seat ? seats.turns(seat) : null)),
            [true, true, false, false, false]
        );
        const sitter = { sitting: figure.sitting, fit: (name, clip) => clip, addClips: () => {} };
        const half = seats.widthOf(chair) / 2;
        const turned = [1, -1].map((side) => {
            const pose = seats.poseFor(chair, sitter, side);
            const [fx, fz] = facingOf(chair.facing + 90 * side);
            const way = new THREE.Vector3(0, 0, 1).applyQuaternion(pose.quaternion);
            const ahead = (pose.point.x - chair.at.x) * fx + (pose.point.z - chair.at.z) * fz;
            const along = (pose.point.x - chair.at.x) * chair.face[0] + (pose.point.z - chair.at.z) * chair.face[1];
            const back = seats.poseFor(chair, sitter, side, { back: 0.06 });
            const backed = (back.point.x - chair.at.x) * chair.face[0] + (back.point.z - chair.at.z) * chair.face[1];
            return [near(way.x, fx, 1e-6) && near(way.z, fz, 1e-6), near(pose.face[0], fx, 1e-9) && near(pose.face[1], fz, 1e-9), round(ahead, 4), round(along, 4), round(pose.edge, 4), round(backed, 4)];
        });
        const ahead = round(THREE.MathUtils.clamp(half + LEG_CLEAR - how.knee, -0.4 * half, FORWARD_MOST), 4);
        check(
            "turned to a side",
            "facing a quarter to the seat's left and its right; on the seat's point, back from the side edge it faces as far as keeps the knees 4 cm past it (0.4 of half the width at most); `back` that much towards the chair's back",
            turned,
            [1, -1].map(() => [true, true, ahead, 0, round(half, 4), -0.06])
        );
        check("a sofa's place turned", "none: its next place is beside it", seats.poseFor(sofa, sitter, 1), null);
        const sideways = seats.own(chair, { side: 1 });
        const walking = seats.own(chair, { side: 1, near: true });
        const [fx, fz] = chair.face;
        const off = (along, up, across = 0) => [chair.at.x + fx * along - fz * across, chair.floor + up, chair.at.z + fz * along + fx * across];
        check(
            "a chair's own piece, turned to a side",
            "the seat and under it, yes; its back, no (the figure turned so is not to go into it), nor for a way on foot; an arm, over the seat in front of the back, no",
            [sideways(triangle(named(chair), off(0, chair.height - 0.02))), sideways(triangle(named(chair), off(-0.25, chair.height + 0.3))), walking(triangle(named(chair), off(-0.25, chair.height + 0.3))), sideways(triangle(named(chair), off(0.05, chair.height + 0.15, 0.2), 0.02))],
            [true, false, false, false]
        );
    }
    seats.dispose();
}

// ---- the report -------------------------------------------------------------

for (const { name, what, got, want, ok } of results) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    console.log(`       ${what}`);
    if (!ok) console.log(`       NOT EXPECTED: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

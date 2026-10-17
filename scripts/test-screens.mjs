/**
 * The televisions (frontend/Experience/World/Screens.js), in node: `node
 * scripts/test-screens.mjs`. Prints each case and exits 1 if any is not
 * what is expected of it.
 *
 * Over Ladonia (scenes/kosinozici-villas.json, public/models/furniture/
 * screens.json and seats.json; skipped with a note where any is missing):
 * how many sets there are and of what; that each is where a set hangs — its
 * picture's middle over its room's floor at a seated eye's height, facing
 * into the room; which one a ray from in front aims at, at what distance,
 * and that from behind, off its edge, past its reach or through a wall none
 * is; the sets a click from above meets; for someone seated on each seat, the
 * set in front of them (every set has a sofa before it, and nothing behind
 * the seat or on another floor is), and that something solid in between
 * hides it; how bright a picture is drawn whatever the view's exposure; and
 * what the prompt says. With the furniture's models there (git-ignored),
 * `npm run screens -- --check` too: that the file is what they measure.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import Screens, { IN_FRONT, LEVEL } from "../frontend/Experience/World/Screens.js";
import Seats, { SITTING } from "../frontend/Experience/World/Seats.js";
import { REACH } from "../shared/interact.js";

const results = [];
let failed = 0;

function check(name, what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    results.push({ name, what, got, want, ok });
}

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const read = (relative) => {
    try {
        return JSON.parse(readFileSync(path(relative), "utf8"));
    } catch {
        return null;
    }
};

const scene = read("../scenes/kosinozici-villas.json");
const spec = scene?.scene ?? scene?.spec ?? null;
const screensJson = read("../public/models/furniture/screens.json");
const seatsJson = read("../public/models/furniture/seats.json");

/** Whether a point on the plan is in a polygon of [x, z] corners. */
function inside(x, z, polygon) {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
}

/** The room a point stands in: the nearest floor at or below it (SceneBuilder.roomAt, without its voids). */
function roomAt(x, y, z) {
    let best = null;
    for (const room of spec.rooms) {
        const drop = y - room.elevation;
        if (drop < -0.6 || drop > room.height + 0.4 || !inside(x, z, room.polygon)) continue;
        if (!best || Math.abs(drop) < Math.abs(y - best.elevation)) best = room;
    }
    return best;
}

if (!spec || !screensJson || !seatsJson) {
    console.log("(Ladonia's scene, screens.json or seats.json not found: nothing to check.)\n");
} else {
    // A world as Screens and Seats ask it: the spec, nobody on a seat, no collision until a case gives one.
    const world = {
        spec,
        sceneBuilder: { spec, furniture: new Map() },
        people: { seats: () => Promise.resolve(seatsJson), root: { visible: false } },
        player: null,
        interactables: null,
        collision: null,
    };
    const screens = new Screens(world);
    await screens.ready;
    screens.data = screensJson;
    screens.refresh();
    const list = screens.list;
    const placements = new Map(spec.furniture.map((item) => [item.id, item]));
    const kinds = {};
    for (const screen of list) {
        const id = placements.get(screen.furniture).catalog_id;
        kinds[id] = (kinds[id] ?? 0) + 1;
    }
    check("Ladonia's sets", "12: 8 wall-hung, 2 in the 3 m TV walls, one in each of the two others", [list.length, Object.fromEntries(Object.entries(kinds).sort())], [12, { "ld-media-oak": 1, "ld-media-ochre": 1, "ld-tv-volume-30": 2, "ld-tv-wall": 8 }]);

    // Where each hangs: its middle at a seated eye's height over its room's floor, facing into the room.
    const placed = list.map((screen) => {
        const room = roomAt(screen.centre.x, screen.floor + 0.1, screen.centre.z);
        const ahead = screen.centre.clone().addScaledVector(screen.normal, 1);
        return { id: screen.id, over: room ? round(screen.centre.y - room.elevation, 2) : null, into: roomAt(ahead.x, screen.floor + 0.1, ahead.z)?.id === room?.id, flat: round(Math.abs(screen.normal.y), 6) };
    });
    check("where they hang", "each in a room, its middle 1.1–1.45 m over the floor", placed.filter((p) => p.over === null || p.over < 1.1 || p.over > 1.45).map((p) => `${p.id} ${p.over}`), []);
    check("which way", "each upright, and facing into its own room (1 m in front of it is that room)", placed.filter((p) => !p.into || p.flat > 1e-6).map((p) => p.id), []);

    // Aimed at: from a head 2.5 m in front of each, at its middle.
    const ray = (from, to) => new THREE.Ray(from.clone(), to.clone().sub(from).normalize());
    const before = (screen, out, up = 0.2) => screen.centre.clone().addScaledVector(screen.normal, out).add(new THREE.Vector3(0, up, 0));
    const aimed = list.filter((screen) => {
        const head = before(screen, 2.5);
        const found = screens.pick(ray(head, screen.centre));
        return found?.screen === screen && Math.abs(found.distance - head.distanceTo(screen.centre)) < 1e-6;
    }).length;
    check("aimed at", "each from 2.5 m in front, at its middle: that set, as far along the ray as its middle is", aimed, list.length);
    const offEdge = list.filter((screen) => {
        const head = before(screen, 2.5);
        const past = screen.centre.clone().addScaledVector(screen.right, screen.half[0] + 0.1);
        return screens.pick(ray(head, past))?.screen === screen;
    }).length;
    check("off its edge", "10 cm past its side: not that set", offEdge, 0);
    const behind = list.filter((screen) => {
        const head = screen.centre.clone().addScaledVector(screen.normal, -2);
        return screens.pick(ray(head, screen.centre)) !== null;
    }).length;
    check("from behind", "from 2 m behind it (through the wall it hangs on): none", behind, 0);
    const far = list.filter((screen) => screens.pick(ray(before(screen, REACH.tv + 0.3, 0), screen.centre)) !== null).length;
    check("too far", `from ${REACH.tv + 0.3} m off: beyond a television's reach (${REACH.tv} m)`, far, 0);

    // Beyond what the crosshair sees (4 m), what stands between is asked of the collision: a wall half way hides it.
    const screen0 = list.find((screen) => screen.id === "a-f002#0");
    const head45 = before(screen0, 4.5);
    world.collision = { rayIntersect: (r, { far: reach }) => ({ distance: Math.min(reach, 2) }) };
    const blocked = screens.pick(ray(head45, screen0.centre), { far: 4 });
    world.collision = { rayIntersect: (r, { far: reach }) => ({ distance: reach - screen0.recess - 0.01 }) };
    const ownPiece = screens.pick(ray(head45, screen0.centre), { far: 4 })?.screen.id ?? null;
    world.collision = null;
    check("past the look ray", "A1's set from 4.5 m: hidden by a wall 2 m off; not by its own piece just in front of its glass", [blocked, ownPiece], [null, "a-f002#0"]);

    // From above: a click straight down onto each (60° down, from 8 m off), and one onto the floor in front of it.
    const above = list.filter((screen) => {
        const from = screen.centre.clone().addScaledVector(screen.normal, 4).add(new THREE.Vector3(0, 7, 0));
        return screens.fromAbove(ray(from, screen.centre))?.screen === screen;
    }).length;
    const floorHit = list.filter((screen) => {
        const from = screen.centre.clone().addScaledVector(screen.normal, 4).add(new THREE.Vector3(0, 7, 0));
        const floor = screen.centre.clone().addScaledVector(screen.normal, 1.2).setY(screen.floor);
        return screens.fromAbove(ray(from, floor)) !== null;
    }).length;
    const down = (screen) => ray(screen.centre.clone().add(new THREE.Vector3(0, 10, 0)), screen.centre.clone().add(new THREE.Vector3(0, screen.half[1], 0)));
    const straight = list.filter((screen) => screens.fromAbove(down(screen))?.screen === screen).length;
    const refused = list.filter((screen) => screens.fromAbove(down(screen), (s) => s !== screen)?.screen === screen).length;
    check("from above", "each set clicked from above and in front: that set; looking straight down onto its top edge: that set; the floor 1.2 m before it: none; a set the floor shown does not take: never", [above, straight, floorHit, refused], [list.length, list.length, 0, 0]);

    // Seated: for each seat, where the figure's eyes are (the male avatar in Sitting Idle, as test-seats.mjs has him).
    const seats = new Seats({ ...world, people: { seats: () => Promise.resolve(seatsJson), root: { visible: false } } });
    await seats.ready;
    const figure = {
        sitting: (name) =>
            name === SITTING ? { seat: new THREE.Vector3(-0.001, 0.414, -0.006), soles: -0.032, knee: 0.415, tuck: 0.415, far: 0.431, head: new THREE.Vector3(0.011, 1.144, 0.065), eye: new THREE.Vector3(0.011, 1.224, 0.175) } : null,
    };
    const viewing = {};
    let wrongWay = 0;
    let otherFloor = 0;
    for (const seat of seats.list) {
        const pose = seats.poseFor(seat, figure);
        screens.inFrontOf.clear();
        const screen = screens.inFront(seat, pose.eye);
        if (!screen) continue;
        (viewing[screen.id] ??= []).push(seat.id);
        const to = screen.centre.clone().sub(pose.eye);
        if ((to.x * seat.face[0] + to.z * seat.face[1]) / Math.hypot(to.x, to.z) < Math.cos(THREE.MathUtils.degToRad(IN_FRONT.across)) - 1e-9) wrongWay++;
        if (Math.abs(screen.floor - seat.floor) > 1.5) otherFloor++;
    }
    const counts = list.map((screen) => viewing[screen.id]?.length ?? 0);
    // (With no walls to stand between — this world has no collision — a few more than the page finds, 46.)
    check("watched from", "every set has 3 seats or more before it, the sofas facing each among them", Math.min(...counts) >= 3, true);
    check("A1's sofa", "its three places face A1's set (ld-media-ochre)", viewing["a-f002#0"]?.filter((id) => id.startsWith("a-f003#")).sort(), ["a-f003#0", "a-f003#1", "a-f003#2"]);
    check("in front, not behind", `none offered but within ${IN_FRONT.across}° of the way its seat faces, none on another floor`, [wrongWay, otherFloor], [0, 0]);
    const sofa = seats.list.find((seat) => seat.id === "a-f003#1");
    const eye = seats.poseFor(sofa, figure).eye;
    world.collision = { rayIntersect: (r, { far: reach }) => ({ distance: reach / 2 }) };
    screens.inFrontOf.clear();
    const hidden = screens.inFront(sofa, eye);
    world.collision = null;
    screens.inFrontOf.clear();
    check("something between", "on A1's sofa, with something solid half way to the set: no set in front", hidden, null);

    // How bright: its white at LEVEL once exposed, whatever the exposure — and so whatever the view is exposed for.
    const screen = list[0];
    screen.level = 1;
    screen.mesh = { material: new THREE.MeshBasicMaterial({ map: new THREE.Texture() }) };
    const drawn = (exposure, toneMapping = THREE.ACESFilmicToneMapping, lighting = "day") => {
        world.lighting = lighting;
        screens.brighten(screen, { toneMapping, toneMappingExposure: exposure });
        return round(screen.mesh.material.color.r * (toneMapping === THREE.NoToneMapping ? 1 : exposure), 6);
    };
    check("as bright whatever the exposure", `its white after the exposure LEVEL by day (${LEVEL.day}) at exposures 0.9, 1, 7.5 and 30 — and untone-mapped, LEVEL as it is`, [0.9, 1, 7.5, 30].map((e) => drawn(e)).concat(drawn(4, THREE.NoToneMapping)), [LEVEL.day, LEVEL.day, LEVEL.day, LEVEL.day, LEVEL.day]);
    check("by night", `LEVEL by night (${LEVEL.night}), at any exposure`, [drawn(1.25, undefined, "night"), drawn(8, undefined, "night")], [LEVEL.night, LEVEL.night]);
    screen.level = 0.5;
    check("fading", "half way up, eased: half of LEVEL", drawn(3), round(LEVEL.day * 0.5, 6));
    screen.mesh = null;
    screen.level = 0;
    world.lighting = undefined;

    // The prompt.
    const provider = screens.provider();
    check("the provider's words", "Turn on TV / Turn off TV with the tv icon; seated, Space to get up said beside it", [
        provider.prompt({ ref: { on: false }, seated: false }),
        provider.prompt({ ref: { on: true }, seated: false }),
        provider.prompt({ ref: { on: false }, seated: true }),
    ], [
        { label: "Turn on TV", key: "E", touch: { label: "On", icon: "tv" } },
        { label: "Turn off TV", key: "E", touch: { label: "Off", icon: "tv" } },
        { label: "Turn on TV", key: "E", touch: { label: "On", icon: "tv" }, also: { key: "Space", label: "Stand up" } },
    ]);
    check("busy", "nothing switched: nothing moving (Pace.js)", screens.busy(), null);
    seats.dispose();
    screens.dispose();
}

// The file against the models, where they are here (`npm run screens -- --check`).
if (existsSync(path("../public/models/furniture/ld-tv-wall.glb"))) {
    let said = "";
    let code = 0;
    try {
        said = execFileSync(process.execPath, [path("./measure-screens.mjs"), "--check"], { encoding: "utf8" });
    } catch (error) {
        said = String(error.stdout ?? "");
        code = error.status ?? 1;
    }
    check("screens.json", "every television's glass where the furniture's models have it (npm run screens -- --check)", [code, /every screen as in/.test(said)], [0, true]);
} else {
    console.log("(The furniture's models are not here: screens.json is not checked against them.)\n");
}

// ---- the report -------------------------------------------------------------

for (const { name, what, got, want, ok } of results) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    console.log(`       ${what}`);
    if (!ok) console.log(`       NOT EXPECTED: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

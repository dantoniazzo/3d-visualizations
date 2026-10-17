/**
 * What the walkthrough's crosshair picks and what its keys do
 * (shared/interact.js), run on made-up distances along the look ray:
 * `node scripts/test-interact.mjs`. Prints each case and exits 1 if any is
 * not what is expected of it.
 *
 * Besides the cases written out, the picker is run against the rules it
 * replaced — Player.js's own, as they stood before it (a door's leaf the ray
 * met first; else a cupboard's door or drawer within 2.5 m; a light's box met
 * within 5 cm of the first solid thing over either) — on a few thousand
 * made-up looks of the kinds the editor and a public view give it, and must
 * agree on every one but the looks it was meant to change: in a public view,
 * a door or a drawer the ray meets behind what the crosshair sees (a floor
 * above, seen from below, which the collision tree has only as its top) was
 * aimed at through it, and is no longer.
 *
 * And which room the visitor is in (frontend/Experience/World/
 * Whereabouts.js), over Ladonia's published plan where there is one: on its
 * flights of stairs, on a threshold, as they walk through a door and out of
 * every room — and, on a few thousand made-up points, as World/RoomLight.js
 * found its room before the rule was shared. And which door the key opens
 * with nothing aimed at (SceneBuilder.nearestDoor), from every room of that
 * plan and up its flights: the nearest across the floor on the visitor's own
 * floor (doorOnFloor), as before wherever the nearest was on it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DOOR_BELOW, ICONS, KEYS, PRIORITY, REACH, SCOPES, SLACK, TIE, doorOnFloor, keyOf, keysFor, pickTarget, roomLightPlan } from "../shared/interact.js";
import { pointInPolygon } from "../frontend/Experience/Utils/geometry.js";
import Whereabouts, { planBounds } from "../frontend/Experience/World/Whereabouts.js";

const results = [];
let failed = 0;

function check(name, what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    results.push({ name, what, got, want, ok });
}

/** The kind picked, or null. */
const kind = (candidates, sight) => pickTarget(candidates, sight)?.kind ?? null;
const door = (distance) => ({ kind: "door", distance });
const drawer = (distance) => ({ kind: "openable", distance });
const light = (distance) => ({ kind: "light", distance });

// ---- the cases --------------------------------------------------------------

check("a door aimed at", "its leaf 2 m off, nothing else", kind([door(2)], 2), "door");
check("a door at the crosshair's end", "4 m: as far as the crosshair sees", kind([door(4)], 4), "door");
check("nothing", "no candidates", kind([], Infinity), null);
check("a light in front of a door", "its box 1.5 m off, the leaf at 2", kind([door(2), light(1.5)], 2), "light");
check("a light's switch beside a door", "its box 3 cm behind the leaf (within the light's slack)", kind([door(2), light(2.03)], 2), "light");
check("a light's box 5 cm behind a door", "exactly the light's slack: still the light, as before", kind([door(2), light(2 + SLACK.light)], 2), "light");
check("a light's box 6 cm behind a door", "the door is nearer by more than 5 cm", kind([door(2), light(2.06)], 2), "door");
check("a light past the wall", "its box 1 m behind the first solid thing", kind([light(3)], 2), null);
check("a light seen through nothing", "nothing solid in 4 m", kind([light(3.9)], Infinity), "light");
check("a drawer in reach", "2.4 m off", kind([drawer(2.4)], 2.4), "openable");
check("a drawer out of reach", "2.6 m off: further than a cupboard is opened from", kind([drawer(2.6)], 2.6), null);
check("a drawer through its piece's box", "public view: the box's face 3 cm in front of it", kind([drawer(1.03)], 1), "openable");
check("a drawer behind its piece's box", "30 cm behind: through something else", kind([drawer(1.3)], 1), null);
check(
    "a light by a drawer, through the box",
    "public view: the box at 1 m, the drawer at 1.03, a light's box at 1.04 (within 5 cm of the box)",
    kind([drawer(1.03), light(1.04)], 1),
    "light"
);
check("a drawer before a light", "the light's box 6 cm behind the box's face", kind([drawer(1.03), light(1.06)], 1), "openable");
check("a seat and a door together", "within 5 cm of each other: the door", kind([{ kind: "seat", distance: 1.0 }, door(1.04)], Infinity), "door");
check("a seat before a door", "10 cm nearer: the seat", kind([{ kind: "seat", distance: 1.0 }, door(1.1)], Infinity), "seat");
check("two of a kind", "two seats 2 cm apart: the nearer", pickTarget([{ kind: "seat", distance: 1.02, id: "b" }, { kind: "seat", distance: 1.0, id: "a" }])?.id, "a");
check("a reach of its own", "a candidate that says how far it reaches", kind([{ kind: "tv", distance: 6, reach: 7 }], Infinity), "tv");
check("a slack of its own", "a seat 0.3 m behind the cushion's face the ray meets", kind([{ kind: "seat", distance: 1.3, slack: 0.3 }], 1), "seat");
check("a kind not listed", "reaches anywhere the crosshair does, and is least particular", kind([{ kind: "other", distance: 3 }, door(3.04)], 3), "door");
check("a door upstairs, from below", "public view: the floor above met at 1.2 m from its underside, a door's leaf on it at 2 m", kind([door(2)], 1.2), null);
check("a door just behind what is seen", "its leaf 4 cm behind the first solid thing: a rounding, still the door", kind([door(2.04)], 2), "door");
check("a drawer upstairs, from below", "the floor above at 1.2 m, a drawer on it at 1.6 m: further behind than its piece's box stands", kind([drawer(1.6)], 1.2), null);

// ---- against the rules it replaced -----------------------------------------

/**
 * Player.updateLookTarget's choice before shared/interact.js: by the first thing met, then a light over it — but, as
 * meant, not a door or a drawer met behind what the crosshair sees (`changed`: before, it was aimed at all the same).
 */
function before({ hit, light: lit, sight }, { changed = true } = {}) {
    let chosen = null;
    const behind = changed && hit && hit.distance > sight + (hit.kind === "openable" ? 0.25 : 0.05);
    if (!behind && hit?.kind === "door") chosen = "door";
    else if (!behind && hit?.kind === "openable" && hit.distance <= 2.5) chosen = "openable";
    if (lit && lit.distance <= sight + 0.05) chosen = "light";
    return chosen;
}

/** The same look through the picker: a candidate for what the ray met first, if it can be acted on, and the light. */
function now({ hit, light: lit, sight }) {
    const candidates = [];
    if (hit && hit.kind !== "other") candidates.push({ kind: hit.kind, distance: hit.distance });
    if (lit) candidates.push({ kind: "light", distance: lit.distance });
    return pickTarget(candidates, sight)?.kind ?? null;
}

/** Repeatable made-up numbers (mulberry32). */
function random(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const next = random(20261016);
const disagreements = [];
let looks = 0;
let changed = 0;
for (const view of ["editor", "public"]) {
    for (let i = 0; i < 4000; i++) {
        const kinds = ["door", "openable", "other", null];
        const k = kinds[Math.floor(next() * kinds.length)];
        // What the crosshair's ray meets, within its 4 m.
        const hit = k ? { kind: k, distance: next() * 4 } : null;
        let sight = hit ? hit.distance : Infinity;
        // A public view's piece with drawers collides as its shut box, a handle's depth or so in front of them.
        if (view === "public" && k === "openable" && next() < 0.7) sight = Math.max(0, hit.distance - next() * 0.24);
        // And a floor above, seen from below, is met by the collision tree's ray from its underside: in front of
        // whatever is on it — a door, a drawer, a sofa — by anything from a rounding to a couple of metres.
        else if (view === "public" && hit && next() < 0.2) sight = Math.max(0, hit.distance - next() * 2);
        // A light's box somewhere along the ray, or none; some of them just behind what was met.
        const roll = next();
        const lit = roll < 0.3 ? null : { distance: roll < 0.6 && hit ? Math.min(4, sight + (next() - 0.3) * 0.2) : next() * 4 };
        const look = { hit, light: lit, sight };
        looks++;
        if (before(look) !== now(look)) disagreements.push({ view, ...look, before: before(look), now: now(look) });
        if (before(look) !== before(look, { changed: false })) changed++;
    }
}
check(
    "agrees with the rules it replaced",
    `${looks} made-up looks of the editor's (sight at what was met) and a public view's (sight at a piece's box, up to 24 cm in front of its drawer; or at a floor above, from below)`,
    disagreements.slice(0, 3),
    []
);
check("and changes what it was meant to", "some of those looks are of a door or a drawer upstairs, aimed at through the ceiling before and not now", changed > 50, true);

// ---- a room's lights -------------------------------------------------------

const lit = new Set(["ceiling:a1-bed"]);
check("a room's lights, one of them on", "any on: all off", roomLightPlan([{ id: "ceiling:a1-bed" }, { id: "lamp:a1" }], (id) => lit.has(id)), { ids: ["ceiling:a1-bed", "lamp:a1"], on: false });
check("a room's lights, all off", "all on", roomLightPlan([{ id: "ceiling:a1-bath" }], () => false), { ids: ["ceiling:a1-bath"], on: true });
check("a room with no switch", "nothing to switch", roomLightPlan([], () => false).ids, []);

// ---- which room the visitor is in (frontend/Experience/World/Whereabouts.js) ----------------------------------

/**
 * Over Ladonia's plan as it was last published (PUBLISH_DIR, or published/), where there is one: a flight of stairs
 * half-way up, a threshold, the hold on leaving a room — and the rule World/RoomLight.js had before it shared it.
 * `roomAt` is SceneBuilder's, as it stands there (a room whose plan the point is over, from 0.6 m under its floor to
 * 0.4 m over its ceiling, the nearest in height).
 */
const publishDir = process.env.PUBLISH_DIR || fileURLToPath(new URL("../published", import.meta.url));
const ladonia = (() => {
    try {
        const manifest = JSON.parse(readFileSync(`${publishDir}/kosinozici-villas/manifest.json`, "utf8"));
        return JSON.parse(readFileSync(`${publishDir}/kosinozici-villas/${manifest.spec}`, "utf8"));
    } catch {
        return null;
    }
})();

if (ladonia) {
    const roomAt = (x, y, z) => {
        let best = null;
        let bestDrop = Infinity;
        for (const room of ladonia.rooms) {
            if (!pointInPolygon(x, z, room.polygon)) continue;
            if (room.voids?.some((hole) => pointInPolygon(x, z, hole))) continue;
            const drop = y - room.elevation;
            if (drop < -0.6 || drop > room.height + 0.4) continue;
            if (Math.abs(drop) < bestDrop) {
                bestDrop = Math.abs(drop);
                best = room;
            }
        }
        return best;
    };
    const builder = { spec: ladonia, roomAt };
    const where = new Whereabouts(builder);
    const named = (id) => ladonia.rooms.find((room) => room.id === id)?.name ?? "";
    /** A point a share of the way up a flight, its feet on the flight's slope. */
    const up = (stair, share) => {
        const yaw = ((stair.yaw ?? 0) * Math.PI) / 180;
        return [stair.start[0] + stair.run * share * Math.sin(yaw), stair.base_height + (stair.top_height - stair.base_height) * share, stair.start[1] + stair.run * share * Math.cos(yaw)];
    };

    // Half-way up the six flights inside the houses, the feet are over the bathroom the flight climbs over.
    const indoor = ladonia.stairs.filter((stair) => /^[abc]-stair-[ns]$/.test(stair.id));
    const under = indoor.map((stair) => roomAt(...up(stair, 0.65))?.id ?? null);
    check("the flights inside", "six, and roomAt, at the feet two thirds of the way up each, says a bathroom", [indoor.length, under.filter((id) => /bath/.test(named(id).toLowerCase()) || /-bath$/.test(id)).length], [6, 6]);
    const onFlights = indoor.flatMap((stair) =>
        [0.35, 0.5, 0.65, 0.8].map((share) => {
            const [x, y, z] = up(stair, share);
            const flight = where.flightAt(x, y, z);
            const { room, floor } = where.locate(x, y, z);
            return { stair: stair.id, share, room, end: Boolean(room) && (room === flight?.foot || room === flight?.head), floor, bath: /-bath$/.test(room ?? "") };
        })
    );
    check(
        "on a flight of stairs",
        "a third to four fifths of the way up each inside flight: in the room at one end of it, on no floor, never a bathroom",
        onFlights.filter((at) => !at.end || at.floor !== null || at.bath),
        []
    );
    const aStairN = indoor.find((stair) => stair.id === "a-stair-n");
    check(
        "the nearer end",
        "a-stair-n a third of the way up: the flat's living room it climbs from; two thirds: the stair to the roof it comes up to",
        [where.locate(...up(aStairN, 0.35)).room, where.locate(...up(aStairN, 0.65)).room],
        ["a-f-n-living", "a-r-box-n"]
    );

    // A2's bathroom door, in its 12 cm wall: the strip under it is no room's.
    const wall = ladonia.walls.find((candidate) => (candidate.openings || []).some((opening) => opening.id === "a-g-a2-bath-n-o0"));
    const opening = wall.openings.find((candidate) => candidate.id === "a-g-a2-bath-n-o0");
    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const [dx, dz] = [(wall.end[0] - wall.start[0]) / length, (wall.end[1] - wall.start[1]) / length];
    const door = [wall.start[0] + dx * opening.offset, (wall.base_height ?? 0) + 0.02, wall.start[1] + dz * opening.offset];
    const side = (s) => [door[0] - dz * s, door[1], door[2] + dx * s];
    const sides = [where.standsIn(...side(0.5)), where.standsIn(...side(-0.5))].sort();
    check("a threshold", "under A2's bathroom door: on no room's floor, a room either side of it", [where.standsIn(...door), sides], [null, ["a-g-a2-bath", "a-g-a2-living"]]);
    check(
        "a threshold, kept",
        "the room the visitor was in, of those within reach, is the one they are still in",
        sides.map((kept) => where.locate(...door, { keep: (id) => (id === kept ? id : null) }).room),
        sides
    );

    // Walked through: the living room, the doorway, the bathroom, the doorway again, then out of every room.
    const inside = where.standsIn(...side(0.5)) === "a-g-a2-living" ? 0.5 : -0.5;
    const [living, bath] = [side(inside), side(-inside)];
    const walk = new Whereabouts(builder);
    const steps = [
        [living, 0.1],
        [door, 0.1],
        [bath, 0.1],
        [door, 0.1],
        [[1000, 0, 1000], 0.1],
        [[1000, 0, 1000], 0.3],
        [[1000, 0, 1000], 0.25],
        [[1000, 0, 1000], 0.1],
    ].map(([point, delta]) => walk.follow(...point, delta));
    check(
        "followed",
        "living room, doorway, bathroom, doorway, then nowhere for 0, 0.3, 0.55 and 0.65 s: the room each side as it is entered, held for 0.6 s",
        steps,
        ["a-g-a2-living", "a-g-a2-living", "a-g-a2-bath", "a-g-a2-bath", "a-g-a2-bath", "a-g-a2-bath", "a-g-a2-bath", null]
    );

    // RoomLight's own rule before it was shared (World/RoomLight.js's where, standsIn and flightAt, as they were),
    // against locate given what RoomLight gives it: the rooms it draws as rooms, and the room drawn live.
    const AROUND = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
    const standsIn = (x, y, z) => {
        const room = roomAt(x, y, z);
        return room && Math.abs(y - room.elevation) <= 1.2 ? room.id : null;
    };
    const flightAt = (x, y, z) => {
        for (const stair of ladonia.stairs || []) {
            if (y <= stair.base_height + 0.3 || y >= stair.top_height - 0.3) continue;
            const yaw = ((stair.yaw ?? 0) * Math.PI) / 180;
            const sin = Math.sin(yaw);
            const cos = Math.cos(yaw);
            const along = (x - stair.start[0]) * sin + (z - stair.start[1]) * cos;
            const across = (x - stair.start[0]) * cos - (z - stair.start[1]) * sin;
            if (along < -0.1 || along > stair.run + 0.1 || Math.abs(across) > stair.width / 2 + 0.1) continue;
            const end = (distance, height) => standsIn(stair.start[0] + distance * sin, height, stair.start[1] + distance * cos);
            return { stair, foot: end(-0.4, stair.base_height), head: end(stair.run + 0.4, stair.top_height) };
        }
        return null;
    };
    const rooms = new Set(ladonia.rooms.filter((room) => room.ceiling_finish !== "none").map((room) => room.id));
    const roomLightBefore = (x, y, z, plan) => {
        const flight = flightAt(x, y, z);
        const room = flight ? null : standsIn(x, y, z);
        if (room) return { room, floor: room };
        if (flight) {
            const ends = [flight.foot, flight.head].filter((id) => id && rooms.has(id));
            if (ends.length < 2) return { room: ends[0] ?? null, floor: null };
            return { room: y - flight.stair.base_height < flight.stair.top_height - y ? flight.foot : flight.head, floor: null };
        }
        let near = null;
        for (const [ax, az] of AROUND) {
            const id = standsIn(x + ax * 0.3, y, z + az * 0.3);
            if (!id || !rooms.has(id)) continue;
            if (plan?.zones.includes(id)) return { room: plan.choice.room, floor: null };
            near ??= id;
        }
        return { room: near, floor: null };
    };
    const xs = ladonia.rooms.flatMap((room) => room.polygon.map((corner) => corner[0]));
    const zs = ladonia.rooms.flatMap((room) => room.polygon.map((corner) => corner[1]));
    const heights = [...new Set(ladonia.rooms.map((room) => room.elevation))];
    const ids = [...rooms];
    const pick = random(161026);
    const differ = [];
    const outside = [];
    let points = 0;
    for (let i = 0; i < 6000; i++) {
        // Half of them by a door or a flight, where the rules have something to decide.
        let x = Math.min(...xs) + pick() * (Math.max(...xs) - Math.min(...xs));
        let z = Math.min(...zs) + pick() * (Math.max(...zs) - Math.min(...zs));
        let y = heights[Math.floor(pick() * heights.length)] + (pick() - 0.3) * 0.4;
        if (i % 2) {
            const stair = ladonia.stairs[Math.floor(pick() * ladonia.stairs.length)];
            [x, y, z] = up(stair, pick() * 1.1 - 0.05);
            x += (pick() - 0.5) * stair.width;
            z += (pick() - 0.5) * stair.width;
        } else if (i % 4 === 0) {
            const doors = ladonia.walls.flatMap((w) => (w.openings || []).filter((o) => o.type !== "window").map((o) => ({ w, o })));
            const { w, o } = doors[Math.floor(pick() * doors.length)];
            const l = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) || 1;
            x = w.start[0] + ((w.end[0] - w.start[0]) / l) * o.offset + (pick() - 0.5) * 0.6;
            z = w.start[1] + ((w.end[1] - w.start[1]) / l) * o.offset + (pick() - 0.5) * 0.6;
            y = (w.base_height ?? 0) + pick() * 0.1;
        }
        // The room drawn live, or none: a made-up group of three.
        const zones = pick() < 0.5 ? null : [0, 1, 2].map(() => ids[Math.floor(pick() * ids.length)]);
        const plan = zones ? { zones, choice: { room: zones[0] } } : null;
        const now = where.locate(x, y, z, { accept: (id) => rooms.has(id), keep: (id) => (plan?.zones.includes(id) ? plan.choice.room : null) });
        const was = roomLightBefore(x, y, z, plan);
        points++;
        if (now.room !== was.room || now.floor !== was.floor) differ.push({ at: [x, y, z], now, was });
        // SceneBuilder.roomAt passes over a room whose plan's bounds the point is outside: never one it is in.
        for (const room of ladonia.rooms) {
            const [minX, minZ, maxX, maxZ] = planBounds(room.polygon);
            if ((x < minX || x > maxX || z < minZ || z > maxZ) && pointInPolygon(x, z, room.polygon)) outside.push({ room: room.id, at: [x, z] });
        }
    }
    check("the live room's rule", `${points} made-up points about Ladonia's floors, doors and stairs: as RoomLight found its room before it shared the rule`, differ.slice(0, 3), []);
    check("a plan's bounds", `at the same points, no room's outline holds a point outside its bounds (SceneBuilder.roomAt looks at those first)`, outside.slice(0, 3), []);
} else {
    console.log(`(No published Ladonia under ${publishDir}: which room the visitor is in, not checked.)\n`);
}

// ---- the keys --------------------------------------------------------------

/** Every combination of where the visitor can be. */
const wheres = [];
for (const state of ["walk", "bird", "drive"]) for (const editor of [true, false]) for (const debug of [true, false]) wheres.push({ state, editor, debug });
const clashes = [];
for (const where of wheres) {
    const seen = new Map();
    for (const entry of keysFor(where)) {
        for (const code of [entry.code].flat()) {
            if (seen.has(code)) clashes.push(`${code}: ${seen.get(code)} and ${entry.action} (${JSON.stringify(where)})`);
            seen.set(code, entry.action);
        }
    }
}
check("one action a key", "no physical key does two things in any one place (on foot, from above, at the wheel; editor or public; colliders or not)", clashes, []);
check(
    "scopes",
    "every key's scopes are of the six, and it works somewhere",
    KEYS.filter((entry) => !entry.scopes.length || entry.scopes.some((scope) => !SCOPES.includes(scope)) || !entry.scopes.some((scope) => ["walk", "bird", "drive"].includes(scope))).map((entry) => entry.action),
    []
);
check("C", "the colliders' key is offered only where they can be shown", [keysFor({ state: "walk", editor: false }).some((entry) => entry.action === "colliders"), keysFor({ state: "walk", editor: false, debug: true }).some((entry) => entry.action === "colliders")], [false, true]);
check("B", "the view from above is a public view's", [keysFor({ state: "walk", editor: true }).some((entry) => entry.action === "bird"), keysFor({ state: "walk", editor: false }).some((entry) => entry.action === "bird")], [false, true]);
check("keyOf", "an action's key", [keyOf("act")?.key, keyOf("room-lights")?.code, keyOf("nothing")], ["E", "KeyQ", null]);

const hud = readFileSync(fileURLToPath(new URL("../frontend/styles/components/hud.scss", import.meta.url)), "utf8");
check("touch icons", "every icon a key or a prompt may name is drawn in hud.scss", ICONS.filter((icon) => !hud.includes(`[data-icon="${icon}"]`)), []);
check("keys' touch icons", "each key's icon is one of them", KEYS.filter((entry) => entry.touch && !ICONS.includes(entry.touch)).map((entry) => entry.action), []);

// ---- the door the key opens with nothing aimed at (SceneBuilder.nearestDoor) ----------------------------------

const HEAD = 1.55;
check("a door on the floor", "its foot at the feet, a step down, a step up: yes", [0, -0.3, -0.85, 0.5, HEAD].map((foot) => doorOnFloor(HEAD, foot)), [true, true, true, true, true]);
check("a door off it", "upstairs (its foot 3 m up, or just over the head), downstairs (3 m down, or 1 m down — a split level's floor below)", [3, HEAD + 0.01, -3, -1].map((foot) => doorOnFloor(HEAD, foot)), [false, false, false, false]);
check("the band", "2.4 m under the head: 0.85 m under the feet", [DOOR_BELOW, doorOnFloor(HEAD, HEAD - DOOR_BELOW), doorOnFloor(HEAD, HEAD - DOOR_BELOW - 0.01)], [2.4, true, false]);

if (ladonia) {
    // Each door's foot as Door.js stands it: along its wall from the start by its offset, at the wall's base.
    const doors = ladonia.walls.flatMap((wall) =>
        (wall.openings || [])
            .filter((opening) => opening.type === "door")
            .map((opening) => {
                const [x1, z1] = wall.start;
                const [x2, z2] = wall.end;
                const length = Math.hypot(x2 - x1, z2 - z1) || 1;
                return { id: opening.id, x: x1 + ((x2 - x1) / length) * opening.offset, y: wall.base_height ?? 0, z: z1 + ((z2 - z1) / length) * opening.offset };
            })
    );
    /** SceneBuilder.nearestDoor at a head, with the floor's rule or, `any`, without it (as it was). */
    const nearest = (x, y, z, any = false) => {
        let best = null;
        let bestDistance = REACH.doorNear;
        for (const door of doors) {
            if (!any && !doorOnFloor(y, door.y)) continue;
            const distance = Math.hypot(door.x - x, door.z - z);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = door;
            }
        }
        return best;
    };
    // Every 25 cm of every room with a ceiling, stood on its floor; and up every flight.
    const spots = [];
    for (const room of ladonia.rooms) {
        if (room.ceiling_finish === "none") continue;
        const [minX, minZ, maxX, maxZ] = planBounds(room.polygon);
        for (let x = minX + 0.125; x < maxX; x += 0.25) {
            for (let z = minZ + 0.125; z < maxZ; z += 0.25) if (pointInPolygon(x, z, room.polygon)) spots.push({ x, y: room.elevation + HEAD, z, floor: room.elevation, room: room.id });
        }
    }
    for (const stair of ladonia.stairs) {
        const yaw = ((stair.yaw ?? 0) * Math.PI) / 180;
        for (let share = 0; share <= 1.001; share += 0.05) {
            const floor = stair.base_height + (stair.top_height - stair.base_height) * share;
            spots.push({ x: stair.start[0] + stair.run * share * Math.sin(yaw), y: floor + HEAD, z: stair.start[1] + stair.run * share * Math.cos(yaw), floor, room: stair.id });
        }
    }
    const offFloor = (door, spot) => door && (door.y > spot.y || spot.floor - door.y > DOOR_BELOW - HEAD);
    let before = 0;
    const now = [];
    const changed = [];
    for (const spot of spots) {
        const was = nearest(spot.x, spot.y, spot.z, true);
        const is = nearest(spot.x, spot.y, spot.z);
        if (offFloor(was, spot)) before++;
        if (offFloor(is, spot)) now.push(`${spot.room} → ${is.id}`);
        // Wherever the nearest was on the visitor's floor, it still is the one.
        else if (was && !offFloor(was, spot) && was !== is) changed.push(`${spot.room}: ${was.id} → ${is?.id ?? "none"}`);
    }
    check("off the floor, before", `of ${spots.length} spots in Ladonia's rooms and up its flights, the nearest door within ${REACH.doorNear} m was on another floor at ${before} (the bug)`, before > 0, true);
    check("off the floor, now", "and now at none", now.slice(0, 3), []);
    check("on the floor, as before", "where the nearest was on the visitor's floor, it is the same door", changed.slice(0, 3), []);
    // A1's ground-floor bedroom, under A1's and A2's bedrooms upstairs: the two upstairs doors it used to offer.
    const bedroom = spots.filter((spot) => spot.room === "a-g-a1-bed" || spot.room === "a-g-a2-bed");
    const upstairs = ["a-f-bed1-e-o0", "a-f-beds-s-o0"];
    check(
        "under the bedrooms upstairs",
        "from the ground-floor bedrooms of A1 and A2, a-f-bed1-e-o0 and a-f-beds-s-o0 overhead were offered at some spots; now at none",
        [bedroom.some((spot) => upstairs.includes(nearest(spot.x, spot.y, spot.z, true)?.id)), bedroom.some((spot) => upstairs.includes(nearest(spot.x, spot.y, spot.z)?.id))],
        [true, false]
    );
}

// ---- the report -------------------------------------------------------------

console.log(`Interaction: aimed within reach (door ${REACH.door} m, near ${REACH.doorNear} m; drawer ${REACH.openable} m; light ${REACH.light} m; car ${REACH.car} m), no more than its slack behind what the ray meets first (light ${SLACK.light} m, drawer through its box ${SLACK.openable} m); within ${TIE * 100} cm, by priority (${Object.entries(PRIORITY).filter(([name]) => name !== "default").map(([name, rank]) => `${name} ${rank}`).join(", ")}).\n`);
for (const { name, what, got, want, ok } of results) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    console.log(`       ${what}`);
    if (!ok) console.log(`       NOT EXPECTED: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

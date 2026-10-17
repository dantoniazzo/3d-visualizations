/**
 * The people round a property — standing in twos and threes on its
 * terraces and roof decks with a drink, sitting on its sofas, lounge
 * chairs and terrace chairs, lying on the loungers by its pool — planned
 * here, kept in the spec's `people`, and drawn by World/People.js. Planned
 * once when a space is given its people (scripts/place-people.mjs), again
 * when the editor rolls them afresh, one at a time when it adds one; from
 * then on they are the spec's, moved and turned like its furniture.
 *
 * Pure: node and the page alike. Seeded (shared/vegetation.js's
 * mulberry32), so a seed always gives the same plan.
 *
 * A person, as the spec keeps them:
 *
 *   id         "person-<n>"
 *   character  a character's id, from the people index
 *   pose       "stand" | "sit" | "lie"
 *   clip       a clip's name, or null for the pose's own
 *   position   [x, y, z]: standing, the feet; sitting, the seat's surface
 *              under the pelvis (less what a sofa's cushion gives under
 *              someone whose feet would otherwise hang, GIVE at most; and
 *              as far forward of the seat's own point as their legs need
 *              to hang before its front edge, FORWARD_MOST at most);
 *              lying, the lounger's under the pelvis
 *   rotation   degrees about the upright, turned as a piece of furniture
 *              is: the way they face — 0 north (−z), 90 west (−x), −90
 *              east, 180 south (facingOf) — and lying, the way their head
 *              points. A character modelled facing +z, as Mixamo's are,
 *              is turned by rotation + 180° to face it.
 *   seat       { furniture: <placement id>, index: <its seat in seats.json;
 *              lying, 0> } | null
 *   prop       what they hold ("wine-red", "flute", ...), wear
 *              ("sunglasses") or have laid by them ("towel") | null
 *   group      the people they are with, "group-<n>" | null
 *   seed       an integer: where in its clip they start
 *
 * The order of the spec's `people` is their priority: a device that draws
 * only some of them (Utils/device.js's `people.most`: four on the slowest
 * phones, eight on the next) draws the first whole groups that fit. So a
 * plan comes first with one standing group, then those lying by the pool,
 * then those sitting, then everyone else — the first four are already the
 * scene.
 *
 * Who plays what is chosen from what the people index measures of each
 * clip (scripts/optimize-people.mjs): a drink goes only to someone whose
 * clip has a hand that can hold it (`hand`, and how level it tips a glass,
 * `tilt`) — a bottle of beer, to someone whose clip drinks, for Mixamo's
 * drink from a bottle; a clip made for women or for men only to one
 * (`sex`); and someone sitting gets the clip made for a seat of their
 * seat's height (`seat` and `feet`, scaled to the character — or as the
 * index measured that clip on that very character, its `sits`), so that
 * their feet are on the floor, and whose legs hang clear of the seat —
 * its knees past the front edge, and on a seat with a solid base
 * (seats.json's `base`) its feet before it too (`knee`, `tuck`).
 * Sunglasses go only to a character whose eyes the index has (`eyes`).
 *
 * Where one can sit or lie is the catalogue's seats.json
 * (scripts/measure-seats.mjs), in each piece's own frame; `seatsOf` puts
 * a placed piece's seats where they are. What stands in a person's way —
 * walls, furniture, rails, planters, pergola posts, pools, stairs and
 * the holes they rise through — is `siteOf`'s, and `clearOf` asks it.
 */
import { FINISHES } from "./catalog.js";
import { terrainHeight } from "./landscape.js";
import { mulberry32, pointInPolygon } from "./vegetation.js";

export const POSES = ["stand", "sit", "lie"];
/** The drinks a person can hold; World/People.js draws any its index lacks. */
export const DRINKS = ["wine-red", "wine-white", "flute", "tumbler", "beer", "coffee"];
/**
 * What someone lying by the pool may have, when the people index has it,
 * and how often: a towel laid past their feet, sunglasses worn, a book
 * left open beside the towel (World/People.js's `lay`: none of them is
 * held, so a lying clip's hands don't matter) — or nothing.
 */
const LYING_PROPS = [
    ["towel", 5],
    ["sunglasses", 2],
    ["book-open", 1.5],
];
const NOTHING_LYING = 1.5;
/** Before the people index has any characters: the visitor's two avatars (World/People.js's STAND_IN). */
const STAND_IN_CHARACTERS = [
    { id: "male", sex: "m" },
    { id: "female", sex: "f" },
];
/** As many people as a spec keeps. */
export const MAX_PEOPLE = 200;

/** How far a person stands clear of walls, rails and furniture, and the edge of where they stand. */
const MARGIN = 0.4;
/** How tall a person is, for what is in their way. */
const BODY = 1.8;
/** A standing group's members, this far apart. */
const SPACING = [0.9, 1.3];
/** Two people this close, not of one group, are too close. */
const APART = 0.8;
/** A lounger this near a pool is by the pool; this near a hot tub, by that. */
const NEAR_POOL = 3.5;
const NEAR_TUB = 4.5;
/** Seats people sit on: sitting height, and not a chaise's deep end (someone sitting there would sit as on a sofa, legs in it). */
export const SEAT_HEIGHT = [0.3, 0.62];
export const SEAT_DEPTH = [0.2, 0.78];
/** A seat shallower than this has a cushion propped against its back: sat on only when there is nowhere better. */
const ROOMY = 0.4;
/**
 * A sitting clip is made for a seat of one height (its `seat` less its
 * `feet`, scaled to the character): on a higher one the feet hang, on a
 * lower one they are under the floor. Within FEET_NEAR of it, in metres,
 * no one can tell; within FEET_MOST it passes; a seat no character and
 * clip come that near is not sat on at all.
 */
const FEET_NEAR = 0.02;
const FEET_MOST = 0.04;
/**
 * Feet under the floor count for more than feet that hang: World/People.js
 * lifts someone off their seat until their soles are on the floor, but by
 * no more than its LIFT_MOST (1.5 cm), so a clip made for a seat UNDER_MOST
 * higher than this one is as far off as one whose feet hang FEET_MOST.
 */
const UNDER_MOST = 0.025;
/** Where a seat's point is, out from the foot of its back (scripts/measure-seats.mjs's SIT_BACK): the middle, on a shallower seat. */
export const SIT_BACK = 0.15;
/**
 * A sitter's legs hang before the seat's front edge: their knees
 * LEG_CLEAR past it, in metres — the calf behind the shin's bone then
 * only touches the cushion — and on a seat with a solid base their
 * ankles HEEL_CLEAR past it too, for the heel behind them. Someone whose
 * clip keeps them further back than that (the index's `knee` and
 * `tuck`, as long as their own thighs and shins make them: legsOf) sits
 * that much forward of the seat's point —
 * FORWARD_MOST at most, FORWARD_BACK for a clip that sits back (its back
 * is to rest on the seat's), and never so far that less than SEAT_UNDER
 * of the seat is left under them; a clip that needs more is not for that
 * seat.
 */
export const LEG_CLEAR = 0.04;
export const HEEL_CLEAR = 0.06;
export const FORWARD_MOST = 0.15;
const FORWARD_BACK = 0.08;
const SEAT_UNDER = 0.12;
/**
 * And their feet need floor to rest on: a sitter's foremost ankle (the
 * index's `far`), and FOOT more for the foot before it, come short of
 * whatever stands before the seat lower than their knees — a coffee
 * table, a planter, a wall, the pool (legSpace: looked for out to
 * LEG_SPACE from the seat's point, LEGS_APART either side, up to
 * KNEE_HIGH over the floor; a table one sits up to has its top over
 * that, and their legs under it).
 */
const FOOT = 0.2;
const LEG_SPACE = 1.2;
const LEGS_APART = 0.15;
const KNEE_HIGH = 0.62;
/** How far a sofa's or a lounge chair's cushion gives under someone, in metres: they sit that much lower, when their feet would otherwise hang. */
export const GIVE = 0.03;
/** A sitting clip whose head is this far behind its seat is one sat back in: for a seat out of doors, soft and at least RECLINE_DEPTH deep. */
const RECLINED = 0.2;
const RECLINE_DEPTH = 0.5;
/** A hand that tips a glass more than this off upright can't hold one (blender/import_people.py's TILT_MOST): the steadier a hand, the likelier it is given one. */
const TILT_MOST = 80;
/** How much less likely a lying clip propped up on its hands is on a lounger too narrow for them (the index's `reach`): they would rest on the air beside it. (Anyone else's arms World/People.js brings in.) */
const OFF_LOUNGER = 0.3;
/** A lying clip whose head is this far above its seat sits up of itself: not for a lounger whose back is raised more than RAISED degrees, which would sit it bolt upright. */
const SITS_UP = 0.45;
const RAISED = 5;
/** What someone whose clip drinks holds: Mixamo's drinking clips lift the hand over the mouth, as one drinks from a bottle. */
const BOTTLE = "beer";
/**
 * Clips no one is planned with (the editor can still give them): "Sitting
 * Reclining Female" leans on an arm that goes through the chair's rail or
 * the sofa's back cushion wherever it sits (9 of 9 placements audited).
 */
const LEFT_OUT = new Set(["Sitting Reclining Female"]);
/** How far round a pool no one stands: its raised coping. */
const COPING = 0.3;
/** How far a planter's grasses reach past its box, and above it. */
const GRASSES = { out: 0.25, up: 1.0 };
/** How often someone on a seat one sits back in does — hands behind the head, or leaning on an arm — though no two of them alike. */
const SITS_BACK = 0.3;
/** The first standing group stands within this of those lying by the pool, on their level, where there is room: with them it is one scene. */
const BY_THE_POOL = 12;
/** Clips by what they are doing, by name. */
const TALKING = /talk|chat|argu|explain|discuss/i;
const LISTENING = /laugh|agree|nod|listen|idle|drink/i;
const DRINKING = /drink|sip/i;
/** How far before a door or a doorway, either side, no one stands about (and MARGIN more). */
const DOORWAY = 0.6;
/** A piece flatter than this (a rug) is walked on, not round. */
const FLAT = 0.035;

/** Rooms people gather in out of doors, and those they only pass through, by name. */
const GATHERING = /terrace|deck|patio|roof|pool|garden|courtyard|veranda|balcon|yard|lawn|loggia/i;
const PASSING = /parking|road|lane|pavement|street|drive|path|walk|steps|stair|landing|entrance|recess|hall|corridor|passage|ramp|garage|kerb/i;
/** Ground one doesn't stand about on with a drink. */
const SOFT_GROUND = /gravel|asphalt|grass|lawn|soil|sand|bark|mulch|meadow|earth/i;
/** Indoor rooms one sits about in. */
const LIVING = /living|lounge|family|sitting|salon|den/i;
/** Pieces of furniture: what one lounges in, and what is a hot tub. */
const LOUNGE = /lounge|daybed|club/i;
const TUB = /jacuzzi|hot.?tub|spa\b/i;

const rad = (deg) => (deg * Math.PI) / 180;
/** An angle in (−180, 180], left as it is when it already is. */
const wrap = (deg) => {
    if (deg > -180 && deg <= 180) return deg;
    const d = deg - 360 * Math.floor((deg + 180) / 360);
    return d === -180 ? 180 : d;
};
const round = (n, places = 3) => Math.round(n * 10 ** places) / 10 ** places;

/** The way a rotation faces, as a unit [dx, dz]: 0 is north, −z. */
export function facingOf(rotation) {
    const r = rad(rotation ?? 0);
    return [-Math.sin(r), -Math.cos(r)];
}

/** The rotation that faces along [dx, dz]. */
export function rotationTowards(dx, dz) {
    return wrap((Math.atan2(-dx, -dz) * 180) / Math.PI);
}

/** The catalogue's items by id: from the catalogue file's `{ items }`, an array of them, or a Map. */
function itemsOf(catalog) {
    if (catalog instanceof Map) return catalog;
    const items = Array.isArray(catalog) ? catalog : catalog?.items || [];
    return new Map(items.map((item) => [item.id, item]));
}

/** A point in a placed piece's own frame (scale 1, facing north), where it is on the site. */
function placedPoint(placement, [x, z]) {
    const s = placement.scale ?? 1;
    const r = rad(placement.rotation ?? 0);
    const c = Math.cos(r);
    const n = Math.sin(r);
    const [px, , pz] = placement.position;
    return [px + (x * c + z * n) * s, pz + (-x * n + z * c) * s];
}

/**
 * A placed piece's seats and lying surface, where they are: each seat's
 * point under a seated person's pelvis `[x, y, z]`, the way they face
 * (`facing`, a rotation), its depth — and `room`, how far its front edge
 * is from its back proper, where a loose pillow lies between — its height
 * and its `base` ("solid", "open", or null where seats.json doesn't say);
 * the lounger's point under a lying person's pelvis, `rotation` the way
 * their head lies, and its cushion's `width` (null likewise).
 * Null for a piece no one sits or lies on.
 *
 * @param {object} placement  a spec furniture entry { id, catalog_id, position, rotation, scale }
 * @param {object} seats      seats.json
 */
export function seatsOf(placement, seats) {
    const entry = seats?.[placement?.catalog_id];
    if (!entry || typeof entry !== "object") return null;
    const s = placement.scale ?? 1;
    const y0 = placement.position[1];
    const out = {
        kind: entry.kind,
        seats: (entry.seats || []).map((seat, index) => {
            const [x, z] = placedPoint(placement, seat.at);
            return {
                furniture: placement.id,
                index,
                at: [x, y0 + seat.height * s, z],
                facing: wrap(seat.facing + (placement.rotation ?? 0)),
                depth: seat.depth * s,
                room: (seat.room ?? seat.depth) * s,
                height: seat.height * s,
                base: seat.base === "solid" || seat.base === "open" ? seat.base : null,
            };
        }),
        lie: null,
    };
    if (entry.lie) {
        const [x, z] = placedPoint(placement, entry.lie.at);
        const head = placedPoint(placement, entry.lie.head);
        out.lie = {
            furniture: placement.id,
            at: [x, y0 + entry.lie.height * s, z],
            head,
            rotation: rotationTowards(head[0] - x, head[1] - z),
            length: entry.lie.length * s,
            width: Number.isFinite(entry.lie.width) ? entry.lie.width * s : null,
            incline: entry.lie.incline ?? 0,
        };
    }
    return out;
}

// ---------------------------------------------------------------------
// The site: where one can stand, and what is in the way
// ---------------------------------------------------------------------

/** Whether a room is out of doors: a ground finish underfoot, or no ceiling over it. */
export function isOutdoor(room) {
    return !room || FINISHES[room.floor_finish]?.kind === "ground" || room.ceiling_finish === "none";
}

/** Whether a room is somewhere people gather out of doors: hard ground, and not a way through. */
function gathersOutdoors(room) {
    const finish = FINISHES[room.floor_finish];
    if (finish?.kind !== "ground") return false;
    if (SOFT_GROUND.test(`${room.floor_finish} ${finish.label || ""}`)) return false;
    return !PASSING.test(room.name || "");
}

function segmentDistance(x, z, [ax, az], [bx, bz]) {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

function edgeDistance(x, z, polygon) {
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) best = Math.min(best, segmentDistance(x, z, polygon[j], polygon[i]));
    return best;
}

function polygonArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
    return Math.abs(area / 2);
}

/** A rectangle `w` × `d` centred at `at`, turned `yaw` degrees as three turns things: its distance function and bounds. */
function turnedBox(at, w, d, yaw) {
    const r = rad(yaw);
    const c = Math.cos(r);
    const n = Math.sin(r);
    const hw = w / 2;
    const hd = d / 2;
    const ex = Math.abs(hw * c) + Math.abs(hd * n);
    const ez = Math.abs(hw * n) + Math.abs(hd * c);
    return {
        box: [at[0] - ex, at[1] - ez, at[0] + ex, at[1] + ez],
        distance(x, z) {
            const dx = x - at[0];
            const dz = z - at[1];
            // Into the box's own frame: the inverse of x' = x·c + z·n, z' = −x·n + z·c.
            const lx = dx * c - dz * n;
            const lz = dx * n + dz * c;
            return Math.hypot(Math.max(Math.abs(lx) - hw, 0), Math.max(Math.abs(lz) - hd, 0));
        },
    };
}

/** A line of points `half` metres either side (a wall, a hedge, a rail): its distance function and bounds. */
function thickLine(points, half) {
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    return {
        box: [Math.min(...xs) - half, Math.min(...zs) - half, Math.max(...xs) + half, Math.max(...zs) + half],
        distance(x, z) {
            let best = Infinity;
            for (let i = 0; i + 1 < points.length; i++) best = Math.min(best, segmentDistance(x, z, points[i], points[i + 1]));
            if (points.length === 1) best = Math.hypot(x - points[0][0], z - points[0][1]);
            return Math.max(0, best - half);
        },
    };
}

/** The corners of a flight's plan, as server/scene/validate.js's stairFootprint has them. */
function stairBox(stair) {
    const r = rad(stair.yaw ?? 0);
    const c = Math.cos(r);
    const n = Math.sin(r);
    // Its middle, half the run up from its foot.
    const at = [stair.start[0] + (stair.run / 2) * n, stair.start[1] + (stair.run / 2) * c];
    return turnedBox(at, stair.width, stair.run, stair.yaw ?? 0);
}

/**
 * What stands in a person's way on a site, each thing with the heights it
 * spans (`y0`–`y1`) and its distance from a point: the spec's walls,
 * furniture (but rugs and what hangs overhead), stairs and the holes they
 * rise through; its landscape's walls, planters, hedges, railings,
 * pergola posts and screens, trees and pools.
 */
function obstaclesOf(spec, catalog) {
    const items = itemsOf(catalog);
    const out = [];
    const add = (kind, id, y0, y1, shape) => out.push({ kind, id, y0, y1, ...shape });
    for (const wall of spec.walls || []) {
        const base = wall.base_height ?? 0;
        const half = (wall.thickness ?? 0.2) / 2;
        add("wall", wall.id, base, base + (wall.height ?? 2.7), thickLine([wall.start, wall.end], half));
        // The way through a door, a doorway or glazing down to the floor: kept clear for DOORWAY either side.
        const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]) || 1;
        const along = (t) => [wall.start[0] + ((wall.end[0] - wall.start[0]) * t) / length, wall.start[1] + ((wall.end[1] - wall.start[1]) * t) / length];
        for (const opening of wall.openings || []) {
            if (opening.type === "window" && (opening.sill ?? 0.9) > 0.1) continue;
            const ends = [along(opening.offset - opening.width / 2), along(opening.offset + opening.width / 2)];
            add("doorway", opening.id, base, base + (opening.sill ?? 0) + (opening.height ?? 2), thickLine(ends, half + DOORWAY));
        }
    }
    for (const placement of spec.furniture || []) {
        const item = items.get(placement.catalog_id);
        const [w, h, d] = item?.size ?? [0.6, 0.6, 0.6];
        const s = (placement.scale ?? 1) * (item?.scale ?? 1);
        if (h * s < FLAT) continue;
        const [x, y, z] = placement.position;
        add("furniture", placement.id, y, y + h * s, turnedBox([x, z], w * s, d * s, placement.rotation ?? 0));
    }
    for (const stair of spec.stairs || []) add("stair", stair.id, stair.base_height - 0.2, stair.top_height + 0.2, stairBox(stair));
    for (const hole of spec.floor_openings || []) {
        add("opening", hole.id, hole.elevation - 0.3, hole.elevation + 0.3, turnedBox(hole.position, hole.width, hole.depth, hole.yaw ?? 0));
    }
    const land = spec.landscape;
    if (land && typeof land === "object") {
        for (const wall of land.walls || []) add("wall", wall.id, wall.base ?? 0, wall.top ?? 1, thickLine(wall.path, (wall.thickness ?? 0.4) / 2));
        for (const planter of land.planters || []) add("planter", planter.id, planter.base ?? 0, (planter.base ?? 0) + (planter.height ?? 0.5) + GRASSES.up, thickLine(planter.path, (planter.width ?? 0.5) / 2 + GRASSES.out));
        for (const hedge of land.hedges || []) add("hedge", hedge.id, hedge.base ?? 0, (hedge.base ?? 0) + (hedge.height ?? 1), thickLine(hedge.path, (hedge.width ?? 0.6) / 2));
        for (const rail of land.railings || []) {
            const ys = rail.points.map((p) => p[2] ?? 0);
            add("railing", rail.id, Math.min(...ys), Math.max(...ys) + (rail.height ?? 1), thickLine(rail.points, 0.02));
        }
        for (const pergola of land.pergolas || []) {
            const top = pergola.base + pergola.height;
            for (const [px, pz] of pergolaPosts(pergola)) add("pergola", pergola.id, pergola.base, top, thickLine([[px, pz]], 0.06));
            const [x0, z0, x1, z1] = pergola.box;
            const sides = { "x-": [[x0, z0], [x0, z1]], "x+": [[x1, z0], [x1, z1]], "z-": [[x0, z0], [x1, z0]], "z+": [[x0, z1], [x1, z1]] };
            for (const side of pergola.screens || []) if (sides[side]) add("pergola", pergola.id, pergola.base, top, thickLine(sides[side], 0.08));
        }
        for (const tree of land.trees || []) {
            const [x, z] = tree.position;
            const ground = (land.terrain ? terrainHeight(land.terrain, x, z) : 0) + (tree.elevation ?? 0);
            add("tree", tree.species, ground, ground + 4, thickLine([[x, z]], 0.3 * (tree.scale ?? 1)));
        }
        // A pool: no one stands in it, at its level or a step above.
        for (const pool of land.pools || []) {
            const [x0, z0, x1, z1] = pool.box;
            add("pool", pool.id ?? "pool", (pool.level ?? 0) - (pool.depth ?? 1.4), (pool.level ?? 0) + 1, turnedBox([(x0 + x1) / 2, (z0 + z1) / 2], x1 - x0 + 2 * COPING, z1 - z0 + 2 * COPING, 0));
        }
    }
    return out;
}

/** A pergola's posts, as LandscapeBuilder.addPergola stands them: at its free corners, and along its long free sides. */
function pergolaPosts(pergola) {
    const [x0, z0, x1, z1] = pergola.box;
    const post = 0.12;
    const against = pergola.posts === "all" ? [] : [].concat(pergola.against ?? "z0");
    const fixed = (x, z) => (x === x0 && against.includes("x0")) || (x === x1 && against.includes("x1")) || (z === z0 && against.includes("z0")) || (z === z1 && against.includes("z1"));
    const posts = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        if (!fixed(x, z)) posts.push([x === x0 ? x0 + post / 2 : x1 - post / 2, z === z0 ? z0 + post / 2 : z1 - post / 2]);
    }
    const free = [
        ["z1", x1 - x0, (t) => [x0 + t * (x1 - x0), z1 - post / 2]],
        ["z0", x1 - x0, (t) => [x0 + t * (x1 - x0), z0 + post / 2]],
        ["x1", z1 - z0, (t) => [x1 - post / 2, z0 + t * (z1 - z0)]],
        ["x0", z1 - z0, (t) => [x0 + post / 2, z0 + t * (z1 - z0)]],
    ];
    for (const [side, length, at] of free) {
        if (against.includes(side) || pergola.posts === "corners") continue;
        const spans = Math.ceil(length / (pergola.span ?? 4.2));
        for (let k = 1; k < spans; k++) posts.push(at(k / spans));
    }
    return posts;
}

/**
 * A site to plan people on: its rooms, what is in the way, and the
 * questions the planner asks of them.
 *
 *   roomAt(x, y, z)       the room whose floor is at y (within 0.3 m) there, or null
 *   blockedBy([x, y, z], { margin, ignore })
 *                         what is within `margin` (0.4 m) of someone
 *                         standing there — "<kind> <id>" — or null;
 *                         `ignore`, ids not to count (the piece they sit on)
 *   clearOf([x, y, z], options)  whether nothing is
 */
export function siteOf(spec, catalog) {
    const obstacles = obstaclesOf(spec, catalog);
    const rooms = spec.rooms || [];
    const roomAt = (x, y, z) => {
        let best = null;
        for (const room of rooms) {
            if (Math.abs(room.elevation - y) > 0.3 || !pointInPolygon(x, z, room.polygon)) continue;
            if (!best || Math.abs(room.elevation - y) < Math.abs(best.elevation - y)) best = room;
        }
        return best;
    };
    const blockedBy = ([x, y, z], { margin = MARGIN, ignore = null } = {}) => {
        for (const o of obstacles) {
            if (o.y1 <= y + 0.08 || o.y0 >= y + BODY) continue;
            if (x < o.box[0] - margin || x > o.box[2] + margin || z < o.box[1] - margin || z > o.box[3] + margin) continue;
            if (ignore?.has(o.id)) continue;
            if (o.distance(x, z) < margin) return `${o.kind} ${o.id}`;
        }
        return null;
    };
    return { spec, rooms, obstacles, roomAt, blockedBy, clearOf: (point, options) => !blockedBy(point, options) };
}

/** Whether someone standing at [x, y, z] is clear of everything in their way by `margin` (0.4 m). */
export function clearOf(spec, catalog, point, options = {}) {
    return siteOf(spec, catalog).clearOf(point, options);
}

// ---------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------

/** Two lengths, [a, b], if that is what `value` is; else null. */
function pairOf(value) {
    return Array.isArray(value) && value.length === 2 && value.every((v) => Number.isFinite(v) && v > 0) ? value : null;
}

/** Pick one of `list` by `weight`, or null. */
function pickWeighted(random, list, weight) {
    let total = 0;
    for (const item of list) total += Math.max(0, weight(item));
    if (total <= 0) return null;
    let at = random() * total;
    for (const item of list) {
        at -= Math.max(0, weight(item));
        if (at <= 0) return item;
    }
    return list[list.length - 1];
}

function shuffled(random, list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * A clip as the planner weighs it, from the people index's entry (or an
 * older index's, or the app's own read of one, which say less):
 *
 *   hand      "right" | "left", the hand that can hold a glass all through
 *             it, or null (the index's `hand`; `true`, or nothing said,
 *             is the right)
 *   tilt      how far off upright that hand ever tips a glass, in degrees,
 *             or null when the index doesn't say
 *   sex       "f" | "m" for a clip made for women or for men (the index's
 *             `sex`, else its name's "Female" or "Male"), or null
 *   madeFor   sitting: the height of the seat it was made for on the
 *             clips' own skeleton — its `seat` above its `feet` (above the
 *             root, without them) — or null when the index has no seat
 *   reclined  sitting: sat back in, the head well behind the seat
 *   knee, tuck, far  sitting: how far forward of its seat's point its
 *             rearmost knee, its rearmost ankle and its foremost ankle
 *             ever are, on the clips' own skeleton, in metres, or null
 *             when the index doesn't say
 *   reach     lying: how far from the midline the hands lie, in metres,
 *             or null when the index doesn't say
 *   sitsUp    lying: propped up of itself, the head well above the seat
 *   still     one pose, which doesn't move
 *   drinks    a clip of drinking, which is never played empty-handed
 */
function readClip(clip) {
    const { name, pose } = clip;
    const hand = clip.hand === "left" ? "left" : clip.hand === false || clip.hand === null ? null : "right";
    const tilt = hand && Number.isFinite(clip.tilt?.[hand]) ? clip.tilt[hand] : null;
    const sex = clip.sex === "f" || clip.sex === "m" ? clip.sex : /\bfemale\b/i.test(name) ? "f" : /\bmale\b/i.test(name) ? "m" : null;
    const seat = Array.isArray(clip.seat) ? clip.seat : null;
    const head = Array.isArray(clip.head) ? clip.head : null;
    const sits = pose === "sit";
    return {
        name,
        pose,
        hand,
        tilt,
        sex,
        madeFor: sits && seat && Number.isFinite(seat[1]) ? seat[1] - (Number.isFinite(clip.feet?.[1]) ? clip.feet[1] : 0) : null,
        reclined: sits && ((seat && head ? seat[2] - head[2] > RECLINED : false) || /reclin/i.test(name)),
        knee: sits && Number.isFinite(clip.knee) ? clip.knee : null,
        tuck: sits && Number.isFinite(clip.tuck) ? clip.tuck : null,
        far: sits && Number.isFinite(clip.far) ? clip.far : null,
        reach: pose === "lie" && Number.isFinite(clip.reach) ? clip.reach : null,
        sitsUp: pose === "lie" && (seat && head ? head[1] - seat[1] > SITS_UP : /propp/i.test(name)),
        still: clip.still === true || (Number.isFinite(clip.duration) && clip.duration < 0.1),
        drinks: DRINKING.test(name),
    };
}

/**
 * The cast and its clips, and choosing among them — a character, a clip
 * and what they have with them, together, for someone standing
 * (`stander`), sitting on a seat (`sitter`) or lying (`lier`):
 *
 * - a character no one has yet, until all have been used once, then one
 *   used least; never two of one in a group (`mates`);
 * - a clip of the pose, not one made for the other sex, the less played
 *   the likelier, and not one a group-mate plays (`avoid`);
 * - a drink only in a hand that can hold one, and always with a clip of
 *   drinking — a bottle of beer, then (BOTTLE); lying, a towel, an open
 *   book, sunglasses if the index has the character's eyes, or nothing.
 *
 * `people` are those there already (the editor adding one more).
 */
function casting(random, { characters, clips, props, people = [] }) {
    const cast = (characters?.length ? characters : STAND_IN_CHARACTERS)
        .map((c) => (typeof c === "string" ? { id: c } : c))
        .filter((c) => c?.id)
        .map((c) => ({
            id: c.id,
            sex: c.sex === "f" || c.sex === "m" ? c.sex : null,
            hips: Number.isFinite(c.hips) ? c.hips : null,
            legs: pairOf(c.legs),
            sits: c.sits && typeof c.sits === "object" ? c.sits : null,
            eyes: Array.isArray(c.eyes) && c.eyes.length === 3,
        }));
    // A clip moves a character's hips, seat and feet scaled by the character's standing hips over the clips' skeleton's.
    const clipsHips = !Array.isArray(clips) && Number.isFinite(clips?.hips) ? clips.hips : null;
    const scaleOf = (character) => (character.hips && clipsHips ? character.hips / clipsHips : 1);
    /** How a sitting clip sits on a character, as the index measured it on that very body (its `sits`): [seat, knee, tuck, far], or null. */
    const sitsOf = (character, clip) => {
        const own = character.sits?.[clip.name];
        return Array.isArray(own) && own.length === 4 && own.every(Number.isFinite) ? own : null;
    };
    /** The height of the seat a sitting clip puts a character's soles on the floor from: the body's own, or the clip's scaled to it. Null when the index doesn't say. */
    const madeFor = (character, clip) => sitsOf(character, clip)?.[0] ?? (clip.madeFor === null ? null : clip.madeFor * scaleOf(character));
    /**
     * Where a sitting clip's legs come on a character, forward of its
     * seat: its rearmost knee, its rearmost ankle and its foremost ankle
     * (`knee`, `tuck`, `far`) — the body's own, where the index measured
     * them (`sits`). Without that, the clip's: a clip only turns the
     * bones, so its knees come as far as the character's thighs are long,
     * and its ankles from there as its shins are (the index's `legs`, the
     * character's over the clips' skeleton's) — or as its hips are high.
     */
    const clipsLegs = Array.isArray(clips) ? null : pairOf(clips?.legs);
    const legsOf = (character, clip) => {
        const own = sitsOf(character, clip);
        if (own) return { knee: own[1], tuck: own[2], far: own[3] };
        const [thigh, shin] = character.legs && clipsLegs ? [character.legs[0] / clipsLegs[0], character.legs[1] / clipsLegs[1]] : [scaleOf(character), scaleOf(character)];
        const knee = clip.knee * thigh;
        return { knee, tuck: clip.tuck === null ? null : knee + (clip.tuck - clip.knee) * shin, far: clip.far === null ? knee : knee + (clip.far - clip.knee) * shin };
    };
    const clipList = (Array.isArray(clips) ? clips : clips?.list || []).filter((c) => c?.name && POSES.includes(c.pose)).map(readClip);
    const propIds = new Set((Array.isArray(props) ? props : props?.list || []).map((p) => (typeof p === "string" ? p : p?.id)).filter(Boolean));

    const used = new Map(cast.map((c) => [c.id, 0]));
    const played = new Map();
    const note = (character, clip) => {
        used.set(character.id, (used.get(character.id) ?? 0) + 1);
        if (clip) played.set(clip.name, (played.get(clip.name) ?? 0) + 1);
    };
    for (const person of people) {
        if (used.has(person.character)) used.set(person.character, used.get(person.character) + 1);
        if (person.clip) played.set(person.clip, (played.get(person.clip) ?? 0) + 1);
    }

    /** Whoever has been used least, group-mates apart. */
    const pool = (mates = []) => {
        const taken = new Set(mates);
        const free = cast.filter((c) => !taken.has(c.id));
        const from = free.length ? free : cast;
        const least = Math.min(...from.map((c) => used.get(c.id)));
        return from.filter((c) => used.get(c.id) === least);
    };
    const anyOf = (list) => list[Math.floor(random() * list.length)];
    /** A pose's clips that a character may play. */
    const clipsFor = (pose, character) => clipList.filter((c) => c.pose === pose && (!c.sex || c.sex === character.sex));
    /** How much likelier a clip is for being little played. */
    const fresh = (clip) => 1 / (1 + (played.get(clip.name) ?? 0));
    /** Those of `list` no group-mate plays (`avoid`), if there are any. */
    const unplayed = (list, avoid) => {
        const others = avoid ? list.filter((c) => !avoid.has(c.name)) : list;
        return others.length ? others : list;
    };

    /** A drink: coffee or wine indoors, anything out; not one of the last two poured, so a group's differ. */
    const poured = [];
    const drink = (indoors) => {
        const list = indoors ? ["coffee", "wine-red", "wine-white", "tumbler"] : ["wine-red", "wine-white", "flute", "tumbler", "beer", "flute", "wine-white"];
        const unpoured = list.filter((id) => !poured.includes(id));
        const chosen = anyOf(unpoured.length ? unpoured : list);
        poured.unshift(chosen);
        poured.length = Math.min(poured.length, 2);
        return chosen;
    };
    /** What goes in the hand of someone playing `clip`: a bottle, if the clip drinks; else a drink. */
    const pour = (clip, indoors) => {
        if (!clip?.drinks) return drink(indoors);
        poured.unshift(BOTTLE);
        poured.length = Math.min(poured.length, 2);
        return BOTTLE;
    };

    /**
     * Someone standing, by their part in their group: "drink", a clip
     * whose hand holds a glass and a drink in it — a clip of drinking
     * most likely (`sure`: if there is one at all), else the
     * steadiest-handed that isn't talking; "talk", a talking clip;
     * "listen", one laughing, agreeing or standing by. A talker or a
     * listener has a drink too, more often than not, when their clip has
     * a hand for one.
     */
    const stander = ({ role = "drink", mates = [], avoid = null, indoors = false, sure = false } = {}) => {
        const character = anyOf(pool(mates));
        const all = clipsFor("stand", character);
        let clip = null;
        let holding = false;
        if (role === "drink") {
            const steady = (c) => (c.drinks ? 10 : 1 + Math.max(0, TILT_MOST - (c.tilt ?? TILT_MOST)) / 20);
            const holders = all.filter((c) => c.hand);
            const quiet = unplayed(holders.filter((c) => !TALKING.test(c.name)), avoid);
            const drinking = quiet.filter((c) => c.drinks);
            clip = pickWeighted(random, sure && drinking.length ? drinking : quiet, (c) => steady(c) * fresh(c)) ?? pickWeighted(random, unplayed(holders, avoid), fresh);
            // With no clips to say otherwise, the pose's own, a drink in its hand.
            holding = Boolean(clip) || !all.length;
        } else {
            // Listening, laughing or agreeing rather than only standing by.
            const lively = (c) => (role === "listen" && /laugh|agree|nod/i.test(c.name) ? 2 : 1);
            const doing = all.filter((c) => (role === "talk" ? TALKING : LISTENING).test(c.name));
            clip = pickWeighted(random, unplayed(doing, avoid), (c) => lively(c) * fresh(c));
            holding = Boolean(clip?.hand) && random() < 0.6;
        }
        if (!clip && all.length) {
            clip = pickWeighted(random, unplayed(all, avoid), fresh);
            holding = Boolean(clip.hand) && random() < 0.6;
        }
        if (clip?.drinks && clip.hand) holding = true;
        note(character, clip);
        return { character: character.id, clip: clip?.name ?? null, prop: holding ? pour(clip, indoors) : null };
    };

    /**
     * Someone lying, on a lounger `width` metres across (null: not known)
     * whose back is raised `incline` degrees: a lying clip theirs to play
     * — not one that sits up of itself, on a raised back; of the rest the
     * least played, so that those lying side by side don't all lie alike;
     * one propped on hands the lounger is too narrow for, seldom — and
     * perhaps a towel, a book, or sunglasses (on a character whose eyes
     * the index has).
     */
    const lier = ({ mates = [], width = null, incline = 0 } = {}) => {
        const character = anyOf(pool(mates));
        const all = clipsFor("lie", character);
        const lies = all.filter((c) => !(c.sitsUp && incline > RAISED));
        const from = lies.length ? lies : all;
        const least = Math.min(...from.map((c) => played.get(c.name) ?? 0));
        const onIt = (c) => (c.sitsUp && width !== null && c.reach !== null && c.reach > width / 2 ? OFF_LOUNGER : 1);
        const clip = pickWeighted(random, from.filter((c) => (played.get(c.name) ?? 0) === least), onIt);
        note(character, clip);
        const have = LYING_PROPS.filter(([id]) => propIds.has(id) && (id !== "sunglasses" || character.eyes));
        const prop = have.length ? pickWeighted(random, [...have, [null, NOTHING_LYING]], ([, weight]) => weight)[0] : null;
        return { character: character.id, clip: clip?.name ?? null, prop };
    };

    /**
     * How each character there is to choose from would sit on a seat with
     * each clip theirs to play: `off`, how far from the floor their feet
     * would be, in metres — hanging, after the seat has given `give` under
     * them (a soft seat, under feet that hang), or under it, which counts
     * for more (UNDER_MOST) — and `forward`, how far forward of the seat's
     * point they must sit for their legs to hang before its front edge:
     * their knees LEG_CLEAR past it, and their ankles HEEL_CLEAR past it
     * where its base is solid (or not known to be open). `legs` is
     * whether they can — within FORWARD_MOST (FORWARD_BACK sat back),
     * with SEAT_UNDER of the seat still under them — and whether their
     * feet then come short of what stands before the seat (its `space`);
     * `miss`, by how much they don't, for the least bad on a seat no one
     * fits. A clip sat back in only on a seat that `reclines`, and only
     * while no one else plays it: no two sit back alike. With no clip's
     * seat or legs known, nothing is off.
     */
    const sitOptions = (seat, mates) => {
        const out = [];
        // From the seat's point to its front edge.
        const edge = Number.isFinite(seat.depth) ? seat.depth - Math.min(SIT_BACK, seat.depth / 2) : null;
        for (const character of pool(mates)) {
            for (const clip of clipsFor("sit", character)) {
                if (LEFT_OUT.has(clip.name)) continue;
                if (clip.reclined && (!seat.reclines || played.has(clip.name))) continue;
                let off = 0;
                let give = 0;
                const height = madeFor(character, clip);
                if (height !== null && Number.isFinite(seat.height)) {
                    const over = seat.height - height;
                    give = seat.soft ? Math.min(GIVE, Math.max(0, over)) : 0;
                    off = over >= give ? over - give : (give - over) * (FEET_MOST / UNDER_MOST);
                }
                let forward = 0;
                // How far their legs are from clear, in metres: into the seat, sat as far forward as they may, and into what stands before it.
                let miss = 0;
                if (clip.knee !== null && edge !== null) {
                    const { knee, tuck, far } = legsOf(character, clip);
                    const most = Math.max(0, Math.min(clip.reclined ? FORWARD_BACK : FORWARD_MOST, edge - SEAT_UNDER));
                    forward = Math.max(0, edge + LEG_CLEAR - knee, seat.base !== "open" && tuck !== null ? edge + HEEL_CLEAR - tuck : 0);
                    miss = Math.max(0, forward - most);
                    forward = Math.min(forward, most);
                    // Their feet, on the floor before the seat: not in what stands there.
                    if (Number.isFinite(seat.space)) miss += Math.max(0, far + forward + FOOT - seat.space);
                }
                out.push({ character, clip, off, give, forward, legs: miss < 1e-9, miss });
            }
        }
        return out;
    };
    /** How far off the floor the feet of whoever sits best on a seat would be, their legs clear of it: 0 with no sitting clips to say, Infinity where no one's legs are. */
    const sitFit = (seat, mates = []) => {
        const options = sitOptions(seat, mates);
        return options.length ? Math.min(...options.map((o) => (o.legs ? o.off : Infinity))) : 0;
    };
    /**
     * Someone sitting on a seat: the character and clip whose feet come
     * nearest the floor there, their legs clear of it, among those within
     * a few millimetres of the best — counting against a clip that it is a
     * still pose, that a group-mate plays it, that it has been played
     * already, that it has them sit forward, and that it talks with no one
     * to talk to (`role` "talk": the first of two; any other, alone or
     * listening). `holding`, with a drink, if a clip whose hand holds one
     * sits them within FEET_MOST: a clip of drinking first. `back`, sat
     * back in the seat, if a clip that is sits them within FEET_MOST (and
     * the seat is one to sit back in). Also `give`, how far the seat gives
     * under them, and `forward`, how far forward of its point they sit.
     */
    const sitter = (seat, { mates = [], holding = false, back = false, role = null, avoid = null, indoors = false } = {}) => {
        const options = sitOptions(seat, mates);
        if (!options.length) {
            const character = anyOf(pool(mates));
            note(character, null);
            return { character: character.id, clip: null, prop: holding ? drink(indoors) : null, give: 0, forward: 0 };
        }
        // Those whose feet are within FEET_MOST of the floor and whose legs are clear of the seat, if anyone's are (the editor may ask for a seat no one fits).
        const near = options.filter((o) => o.legs && o.off <= FEET_MOST);
        const fitting = near.length ? near : options;
        const score = (o) =>
            o.off +
            (o.legs ? 0 : 0.5 + o.miss) +
            0.1 * o.forward +
            (o.clip.still ? 0.008 : 0) +
            (avoid?.has(o.clip.name) ? 0.02 : 0) +
            0.004 * Math.min(3, played.get(o.clip.name) ?? 0) +
            (TALKING.test(o.clip.name) === (role === "talk") ? 0 : 0.012);
        const best = (list, bonus = () => 0) => {
            if (!list.length) return null;
            const scored = list.map((o) => [o, score(o) - bonus(o)]);
            const least = Math.min(...scored.map(([, points]) => points));
            return anyOf(scored.filter(([, points]) => points <= least + 0.008))[0];
        };
        let chosen = back ? best(near.filter((o) => o.clip.reclined)) : null;
        let prop = null;
        if (!chosen && holding) {
            chosen = best(near.filter((o) => o.clip.hand), (o) => (o.clip.drinks ? 0.012 : 0));
            if (chosen) prop = pour(chosen.clip, indoors);
        }
        // Left to itself, a clip sat back in is as likely as its fit makes it — seldom the best.
        chosen ??= best(fitting.filter((o) => !o.clip.drinks)) ?? best(fitting);
        if (chosen.clip.drinks && chosen.clip.hand && !prop) prop = pour(chosen.clip, indoors);
        note(chosen.character, chosen.clip);
        return { character: chosen.character.id, clip: chosen.clip.name, prop, give: chosen.give, forward: chosen.forward };
    };
    return { stander, lier, sitter, sitFit };
}

/** The next free "person-<n>" id, "group-<n>" likewise. */
function nextNumber(ids, prefix) {
    let most = 0;
    for (const id of ids) {
        const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id || "");
        if (match) most = Math.max(most, Number(match[1]));
    }
    return most + 1;
}

/** Seats and loungers taken by `people` already: "<furniture>#<index>", "<furniture>#lie". */
function takenSeats(people) {
    const taken = new Set();
    for (const person of people || []) {
        if (person.seat?.furniture) taken.add(`${person.seat.furniture}#${person.pose === "lie" ? "lie" : person.seat.index}`);
    }
    return taken;
}

/**
 * Every seat and lounger of a spec's furniture, where it is, with what the
 * planner weighs: the room it is in, out of doors or not, its piece's
 * catalogue entry; whether it is a piece one lounges in (`lounge`),
 * whether its seat is `soft` (a sofa's or a lounge chair's cushion, which
 * gives under someone) and whether one sits back in it (`reclines`: soft,
 * out of doors, and its back RECLINE_DEPTH or more behind its front
 * edge) and how much floor there is before it for a sitter's legs
 * (`space`: legSpace); a lounger's `width` — its cushion's, or without
 * that its piece's.
 */
function seatingOf(site, spec, catalog, seats) {
    const items = itemsOf(catalog);
    const sitting = [];
    const lying = [];
    for (const placement of spec.furniture || []) {
        const placed = seatsOf(placement, seats);
        if (!placed) continue;
        const item = items.get(placement.catalog_id);
        const [px, py, pz] = placement.position;
        const room = site.roomAt(px, py, pz);
        const outdoor = isOutdoor(room);
        const lounge = LOUNGE.test(`${placement.catalog_id} ${item?.name || ""}`);
        const soft = placed.kind === "sofa" || lounge;
        const where = { placement, item, room, outdoor, kind: placed.kind, lounge, soft };
        for (const seat of placed.seats) sitting.push({ ...seat, ...where, reclines: soft && outdoor && seat.room >= RECLINE_DEPTH, space: legSpace(site, seat) });
        // A lounger's width: its cushion's, or the lesser of its piece's sides.
        const [w, , d] = item?.size ?? [];
        const width = Number.isFinite(w) && Number.isFinite(d) ? Math.min(w, d) * (placement.scale ?? 1) * (item.scale ?? 1) : null;
        if (placed.lie) lying.push({ ...placed.lie, ...where, width: placed.lie.width ?? width });
    }
    return { sitting, lying };
}

/**
 * How far before a seat's point the floor is clear for a sitter's legs,
 * in metres the way it faces: to the first thing that stands in their way
 * lower than their knees — another piece of furniture whose top is under
 * KNEE_HIGH (a coffee table, a pouf; a table one sits up to is over
 * their legs), or a wall, a planter, a rail, a post, a stair, a hole in
 * the floor or a pool. Infinity with nothing within LEG_SPACE.
 */
function legSpace(site, seat) {
    const [dx, dz] = facingOf(seat.facing);
    const floor = seat.at[1] - seat.height;
    const inTheWay = site.obstacles.filter((o) => {
        if (o.id === seat.furniture || o.kind === "doorway") return false;
        if (o.y1 <= floor + 0.08 || o.y0 >= floor + KNEE_HIGH) return false;
        return o.kind !== "furniture" || o.y1 < floor + KNEE_HIGH;
    });
    for (let d = 0.2; d <= LEG_SPACE; d += 0.04) {
        const x = seat.at[0] + dx * d;
        const z = seat.at[2] + dz * d;
        for (const o of inTheWay) {
            if (x < o.box[0] - LEGS_APART || x > o.box[2] + LEGS_APART || z < o.box[1] - LEGS_APART || z > o.box[3] + LEGS_APART) continue;
            if (o.distance(x, z) < LEGS_APART) return d;
        }
    }
    return Infinity;
}

/** Where someone sits on a seat: its point, less what it gives under them, as far forward — the way it faces — as their legs need (casting's sitter). */
export function seatedAt(seat, give = 0, forward = 0) {
    const [dx, dz] = facingOf(seat.facing);
    return [seat.at[0] + dx * forward, seat.at[1] - give, seat.at[2] + dz * forward];
}

/** How far a point is from a pool's water, and from the nearest hot tub, on its level. */
function waterDistance(spec, catalog, [x, y, z]) {
    const items = itemsOf(catalog);
    let pool = Infinity;
    for (const p of spec.landscape?.pools || []) {
        if (Math.abs((p.level ?? 0) - y) > 1.2) continue;
        const [x0, z0, x1, z1] = p.box;
        pool = Math.min(pool, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
    }
    let tub = Infinity;
    for (const f of spec.furniture || []) {
        const item = items.get(f.catalog_id);
        if (!TUB.test(`${f.catalog_id} ${item?.name || ""}`) || Math.abs(f.position[1] - y) > 1.2) continue;
        const half = Math.max(...(item?.size ?? [2, 1, 2])) / 2;
        tub = Math.min(tub, Math.max(0, Math.hypot(f.position[0] - x, f.position[2] - z) - half));
    }
    return { pool, tub };
}

/**
 * How many people a space has room for, planned without saying: four,
 * and one more for every 25 m² of terrace and deck out of doors and for
 * every lounger by its water, up to twelve.
 */
export function defaultCount(spec, catalog, seats) {
    const area = (spec.rooms || []).filter(gathersOutdoors).reduce((sum, room) => sum + polygonArea(room.polygon), 0);
    let loungers = 0;
    for (const placement of spec.furniture || []) {
        const lie = seatsOf(placement, seats)?.lie;
        if (!lie) continue;
        const { pool, tub } = waterDistance(spec, catalog, lie.at);
        if (pool <= NEAR_POOL || tub <= NEAR_TUB) loungers += 1;
    }
    return Math.min(12, Math.round(4 + area / 25 + loungers));
}

/**
 * People for a space: about `count` of them — a quarter
 * or so lying on the loungers by its pool (or its hot tubs, failing that),
 * a group of two or three for every six standing with a drink on its
 * terraces and roof decks, and the rest sitting: on its outdoor sofas and
 * lounge chairs first, now and then two together, then one or two on the
 * sofas indoors, then terrace chairs. No two on one seat; no character
 * twice until all have been used; clips varied by pose; the same plan for
 * the same seed. As many as the space has room for by default
 * (defaultCount): 12 for a site of Ladonia's size, fewer round a house
 * with one terrace.
 *
 * A standing group has one with a drink — drinking it, or standing by
 * with a steady hand — one talking, and a third laughing, agreeing or
 * listening; a talker or listener holds a drink only when their clip has
 * a hand that can; whoever's clip drinks, drinks from a bottle. Someone
 * sits only where a character and clip can put their feet within FEET_MOST
 * of the floor and their legs before the seat's front edge — their feet
 * too, not tucked back into a sofa's solid base (the cast's best-fitting
 * first: those sitting are cast before the others), sat back in only on
 * a deep soft seat out of doors, and holds a drink only with a clip that
 * both fits the seat and has a hand for it. A seat no one fits is left
 * empty, and whoever was to sit there stands in a group instead. Those
 * lying take the lying clips in turn, so that the loungers by the pool
 * are not all one pose, and none that sits up of itself on a lounger
 * whose back is raised.
 *
 * They come back in the order of their priority (the spec's order: see
 * the top of this file) — the standing group nearest those lying by the
 * pool (the first is placed by it, and has someone drinking), those lying
 * by the pool, those sitting (out of doors first), then the other standing
 * groups and those lying elsewhere — and are numbered in it, person-1
 * first.
 *
 * @param {object} spec      a validated scene spec
 * @param {object} catalog   the furniture catalogue ({ items }, an array, or a Map by id)
 * @param {object} seats     seats.json
 * @param {object} [options]
 * @param {number} [options.seed]   1 by default
 * @param {number} [options.count]  how many; defaultCount(spec) if not given
 * @param {object[]} [options.characters]  the people index's characters ({ id, hips, legs, sits, sex, eyes }), or the stand-in's two
 * @param {object|object[]} [options.clips]  the index's `clips` ({ hips, legs, list }) — or only its list, when
 *                                           every character is taken to be the clips' skeleton's size
 * @param {object[]} [options.props]       the index's props.list ({ id })
 * @returns {object[]} the people, as the spec keeps them
 */
export function planPeople(spec, catalog, seats, { seed = 1, count, characters, clips, props } = {}) {
    const random = mulberry32((seed >>> 0) ^ 0x5eed);
    const site = siteOf(spec, catalog);
    const { sitting, lying } = seatingOf(site, spec, catalog, seats);
    const cast = casting(random, { characters, clips, props });
    /** Everyone planned so far: a spot each — where, how, with whom — cast as they are placed (sitting) or after (the rest). */
    const planned = [];
    const taken = new Set();
    let groupNumber = 1;
    const total = Math.max(0, Math.min(MAX_PEOPLE, Math.round(count ?? defaultCount(spec, catalog, seats))));

    const put = (spot) => {
        planned.push({ group: null, seat: null, ...spot, seed: Math.floor(random() * 1e6) });
        return planned[planned.length - 1];
    };
    const tooClose = ([x, , z], y) => planned.some((p) => Math.abs(p.position[1] - y) < 1 && Math.hypot(p.position[0] - x, p.position[2] - z) < APART);

    // --- lying, by the water ---------------------------------------------
    const byWater = lying
        .map((l) => ({ ...l, water: waterDistance(spec, catalog, l.at) }))
        .map((l) => ({ ...l, tier: l.water.pool <= NEAR_POOL ? 0 : l.water.tub <= NEAR_TUB ? 1 : 2 }));
    const nearWater = byWater.filter((l) => l.tier < 2);
    let lyingCount = Math.min(nearWater.length || Math.min(2, byWater.length), Math.round(total / 4) + (random() < 0.5 ? 0 : 1), total);
    const loungers = [0, 1, 2].flatMap((tier) => shuffled(random, byWater.filter((l) => l.tier === tier)));
    for (const l of loungers) {
        if (lyingCount <= 0) break;
        const key = `${l.furniture}#lie`;
        if (taken.has(key)) continue;
        taken.add(key);
        lyingCount -= 1;
        put({ pose: "lie", position: l.at, rotation: l.rotation, seat: { furniture: l.furniture, index: 0 }, byPool: l.tier === 0, width: l.width, incline: l.incline });
    }

    // --- how many sit, how many stand --------------------------------------
    const left = total - planned.length;
    const usable = sitting.filter(
        (s) => s.kind !== "stool" && s.height >= SEAT_HEIGHT[0] && s.height <= SEAT_HEIGHT[1] && s.depth >= SEAT_DEPTH[0] && s.depth <= SEAT_DEPTH[1]
    );
    const groups = left >= 4 ? Math.max(1, Math.round(total / 6)) : left >= 2 ? 1 : 0;
    const sizes = Array.from({ length: groups }, () => (random() < 0.5 ? 2 : 3));
    const minSit = Math.min(left >= 6 ? 3 : 1, usable.length);
    while (sizes.reduce((a, b) => a + b, 0) > left - minSit && sizes.length) {
        const i = sizes.indexOf(Math.max(...sizes));
        if (sizes[i] > 2) sizes[i] -= 1;
        else sizes.splice(i, 1);
    }

    // --- standing, in groups ------------------------------------------------
    const places = (spec.rooms || []).filter((room) => gathersOutdoors(room) && polygonArea(room.polygon) >= 4);
    const outdoorPieces = (spec.furniture || []).filter((f) => isOutdoor(site.roomAt(f.position[0], f.position[1], f.position[2])));
    const centres = [];
    // Where those lying by the pool are, about: the middle of them.
    const lyingByPool = planned.filter((p) => p.byPool);
    const poolside = lyingByPool.length ? [0, 1, 2].map((i) => lyingByPool.reduce((sum, p) => sum + p.position[i], 0) / lyingByPool.length) : null;
    /** A group of each size in turn, where one fits, each weighed against those already there. */
    const standGroups = (groupSizes) => {
        for (const size of groupSizes) {
            const options = [];
            for (const room of places) {
                const xs = room.polygon.map((p) => p[0]);
                const zs = room.polygon.map((p) => p[1]);
                const y = room.elevation;
                let found = 0;
                for (let attempt = 0; attempt < 80 && found < 4; attempt++) {
                    const cx = Math.min(...xs) + random() * (Math.max(...xs) - Math.min(...xs));
                    const cz = Math.min(...zs) + random() * (Math.max(...zs) - Math.min(...zs));
                    if (!pointInPolygon(cx, cz, room.polygon)) continue;
                    const spacing = SPACING[0] + random() * (SPACING[1] - SPACING[0]);
                    const radius = size === 2 ? spacing / 2 : spacing / Math.sqrt(3);
                    const start = random() * Math.PI * 2;
                    const members = [];
                    for (let k = 0; k < size; k++) {
                        const a = start + (k * Math.PI * 2) / size;
                        members.push([cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius]);
                    }
                    const fits = members.every(
                        ([x, , z]) =>
                            pointInPolygon(x, z, room.polygon) && edgeDistance(x, z, room.polygon) >= MARGIN && site.clearOf([x, y, z]) && !tooClose([x, y, z], y)
                    );
                    if (!fits) continue;
                    found += 1;
                    // Where people gather: a named terrace or deck, near its furniture, away from the other groups.
                    let weight = GATHERING.test(room.name || "") ? 2 : 1;
                    const nearest = Math.min(
                        Infinity,
                        ...outdoorPieces.filter((f) => Math.abs(f.position[1] - y) < 0.5).map((f) => Math.hypot(f.position[0] - cx, f.position[2] - cz))
                    );
                    if (nearest >= 1.2 && nearest <= 4.5) weight *= 1.6;
                    for (const other of centres) {
                        const d = Math.hypot(other[0] - cx, other[2] - cz) + Math.abs(other[1] - y) * 3;
                        weight *= d < 6 ? 0.03 : d < 12 ? 0.3 : 1;
                    }
                    // One on the ground, the next up on a roof, if there is one.
                    if (centres.length && centres.every((other) => Math.abs(other[1] - y) > 1.5)) weight *= 2.5;
                    for (const p of planned) if (Math.hypot(p.position[0] - cx, p.position[2] - cz) < 3 && Math.abs(p.position[1] - y) < 1) weight *= 0.3;
                    const byPool = Boolean(poolside) && Math.abs(poolside[1] - y) < 1.5 && Math.hypot(poolside[0] - cx, poolside[2] - cz) <= BY_THE_POOL;
                    options.push({ centre: [cx, y, cz], members, weight, byPool });
                }
            }
            // The first group, by the pool with those lying there, if anyone is and there is room.
            const beside = centres.length ? [] : options.filter((o) => o.byPool);
            const chosen = pickWeighted(random, beside.length ? beside : options, (o) => o.weight);
            if (!chosen) return;
            const { centre, members } = chosen;
            centres.push(centre);
            const group = `group-${groupNumber++}`;
            // One with a drink, one talking; a third laughing, agreeing or listening.
            const roles = shuffled(random, ["drink", "talk", "listen"].slice(0, members.length));
            members.forEach((at, k) => {
                const turn = (random() - 0.5) * 24;
                put({ pose: "stand", position: at, rotation: rotationTowards(centre[0] - at[0], centre[2] - at[2]) + turn, group, role: roles[k], centre });
            });
        }
    };
    standGroups(sizes);

    // --- sitting --------------------------------------------------------------
    let sitCount = total - planned.length;
    const tierOf = (s) => {
        if (s.outdoor && (s.kind === "sofa" || s.lounge)) return "lounge";
        if (!s.outdoor && s.kind === "sofa") return "sofa";
        return s.outdoor ? "terrace" : "indoor";
    };
    const indoorTarget = sitCount >= 4 ? (random() < 0.5 ? 1 : 2) : sitCount >= 3 ? 1 : 0;
    const plan = [
        ["lounge", sitCount - indoorTarget],
        ["sofa", indoorTarget],
        ["terrace", Infinity],
        ["indoor", Infinity],
        ["lounge", Infinity],
        ["sofa", Infinity],
    ];
    const seatKey = (s) => `${s.furniture}#${s.index}`;
    const seated = [];
    /** Whether someone the cast still has would sit on a seat with their feet on the floor, and how likely that makes it. */
    const fitWeight = (s, mates) => {
        const off = cast.sitFit(s, mates);
        return off <= FEET_NEAR ? 1 : off <= FEET_MOST ? 0.35 : 0;
    };
    /** Someone on a seat, cast there and then: those sitting have first choice of the characters. */
    const sitOn = (s, { role = null, mates = [], avoid = null } = {}) => {
        taken.add(seatKey(s));
        const { give, forward, ...outfit } = cast.sitter(s, { mates, role, avoid, holding: random() < (s.outdoor ? 0.45 : 0.35), back: s.reclines && random() < SITS_BACK, indoors: !s.outdoor });
        seated.push(s);
        return put({ pose: "sit", ...outfit, position: seatedAt(s, give, forward), rotation: s.facing, seat: { furniture: s.furniture, index: s.index }, outdoor: s.outdoor });
    };
    for (const [tier, want] of plan) {
        let n = Math.min(want, sitCount);
        while (n > 0 && sitCount > 0) {
            const free = usable.filter((s) => tierOf(s) === tier && !taken.has(seatKey(s)) && !tooClose(s.at, s.at[1]));
            const seat = pickWeighted(random, free, (s) => {
                let w = (s.depth >= ROOMY ? 1 : 0.12) * fitWeight(s);
                if (w <= 0) return 0;
                if (tier === "sofa" && LIVING.test(s.room?.name || "")) w *= 2;
                // Spread out: not beside someone on the same piece, and fewer in a room already sat in.
                for (const other of seated) {
                    if (other.furniture === s.furniture && Math.abs(other.index - s.index) <= 1) w *= 0.02;
                    else if (other.room && other.room === s.room) w *= 0.25;
                }
                for (const g of centres) if (Math.hypot(g[0] - s.at[0], g[2] - s.at[2]) < 4 && Math.abs(g[1] - s.at[1]) < 1.5) w *= 0.3;
                return w;
            });
            if (!seat) break;
            // Now and then two together: on the same sofa, a seat apart, or the next chair along, facing alike or each other.
            const together = n >= 2 && random() < 0.45;
            const first = sitOn(seat, { role: together ? "talk" : null });
            n -= 1;
            sitCount -= 1;
            if (!together || sitCount <= 0) continue;
            const partners = usable.filter((o) => {
                if (taken.has(seatKey(o)) || o.outdoor !== seat.outdoor || Math.abs(o.at[1] - seat.at[1]) > 0.2 || fitWeight(o, [first.character]) <= 0) return false;
                const d = Math.hypot(o.at[0] - seat.at[0], o.at[2] - seat.at[2]);
                // On one sofa: a seat between them, unless it seats only two.
                if (o.furniture === seat.furniture) return Math.abs(o.index - seat.index) >= (seats[seat.placement.catalog_id].seats.length >= 3 ? 2 : 1) && d <= 1.8;
                const turn = Math.abs(wrap(o.facing - seat.facing));
                return d >= 0.6 && d <= 2.2 && (turn <= 30 || turn >= 120) && o.depth >= ROOMY && tierOf(o) !== "indoor";
            });
            if (!partners.length) continue;
            const partner = partners[Math.floor(random() * partners.length)];
            first.group = `group-${groupNumber++}`;
            const second = sitOn(partner, { role: "listen", mates: [first.character], avoid: new Set(first.clip ? [first.clip] : []) });
            second.group = first.group;
            n -= 1;
            sitCount -= 1;
        }
    }
    // Whoever found no seat stands instead, in twos and threes.
    let leftover = total - planned.length;
    const more = [];
    while (leftover >= 2) {
        const size = leftover === 2 || leftover === 4 ? 2 : 3;
        more.push(size);
        leftover -= size;
    }
    standGroups(more);

    // --- who they are: those lying, then each standing group ---------------
    for (const spot of planned) if (spot.pose === "lie") Object.assign(spot, cast.lier({ width: spot.width, incline: spot.incline }));
    const standing = new Map();
    for (const spot of planned) if (spot.pose === "stand") standing.set(spot.group, [...(standing.get(spot.group) || []), spot]);
    // The group that comes first: the one nearest those lying by the pool, so that the first few are one scene.
    let firstGroup = standing.keys().next().value ?? null;
    if (poolside && standing.size > 1) {
        const middle = (members, i) => members.reduce((sum, p) => sum + p.position[i], 0) / members.length;
        const away = (members) => Math.hypot(middle(members, 0) - poolside[0], middle(members, 2) - poolside[2]) + Math.abs(middle(members, 1) - poolside[1]) * 3;
        firstGroup = [...standing.entries()].sort(([, a], [, b]) => away(a) - away(b))[0][0];
    }
    // It has first choice of the standing clips, and in each group the one with the drink has: in the first they are
    // drinking it, in the others most likely.
    const parts = ["drink", "talk", "listen"];
    for (const [group, members] of [...standing.entries()].sort(([a], [b]) => (b === firstGroup) - (a === firstGroup))) {
        const mates = [];
        const avoid = new Set();
        for (const spot of [...members].sort((a, b) => parts.indexOf(a.role) - parts.indexOf(b.role))) {
            Object.assign(spot, cast.stander({ role: spot.role, mates, avoid, sure: group === firstGroup }));
            mates.push(spot.character);
            if (spot.clip) avoid.add(spot.clip);
        }
    }

    // --- in the order of their priority -----------------------------------
    const rank = (p) => (p.pose === "stand" ? (p.group === firstGroup ? 0 : 4) : p.pose === "lie" ? (p.byPool ? 1 : 5) : p.outdoor ? 2 : 3);
    const ordered = planned.map((p, i) => [p, i]).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j);
    const groupIds = new Map();
    return ordered.map(([p], i) => {
        if (p.group && !groupIds.has(p.group)) groupIds.set(p.group, `group-${groupIds.size + 1}`);
        return {
            id: `person-${i + 1}`,
            character: p.character,
            pose: p.pose,
            clip: p.clip ?? null,
            position: p.position.map((v) => round(v)),
            rotation: round(wrap(p.rotation), 1),
            seat: p.seat ?? null,
            prop: p.prop ?? null,
            group: p.group ? groupIds.get(p.group) : null,
            seed: p.seed,
        };
    });
}

/**
 * One more person, for the editor's Add: posed `pose`, as near `near` as
 * one can be — standing on the nearest clear floor, turned to the nearest
 * standing person within 2.5 m and joining their group if they have one
 * (else facing `facing`, or any way); sitting on the nearest free seat,
 * whatever its height (the character and clip that sit best on it);
 * lying on the nearest free lounger. Null when there is none within 12 m.
 * Cast as planPeople casts: a character used least among those there, a
 * drink only in a hand that can hold it. Its id is the next free
 * "person-<n>"; the spec's people are left as they are — adding it, last
 * in their order, is the caller's.
 *
 * @param {object} spec     the spec, its `people` the ones already there
 * @param {object} catalog
 * @param {object} seats    seats.json
 * @param {object} options  { pose, near: [x, y, z] or [x, z] (then the lowest floor there),
 *                            facing (a rotation), seed, characters, clips, props } — the last
 *                            three as planPeople's
 */
export function planOne(spec, catalog, seats, { pose = "stand", near = [0, 0, 0], facing = null, seed, characters, clips, props } = {}) {
    const existing = Array.isArray(spec.people) ? spec.people : [];
    const random = mulberry32(((seed ?? existing.length * 7919 + 17) >>> 0) ^ 0xadd);
    const site = siteOf(spec, catalog);
    const cast = casting(random, { characters, clips, props, people: existing });
    const taken = takenSeats(existing);
    const [nx, nz] = near.length >= 3 ? [near[0], near[2]] : near;
    const ny = near.length >= 3 ? near[1] : null;
    const id = `person-${nextNumber(existing.map((p) => p.id), "person")}`;
    const seedOfTheirs = Math.floor(random() * 1e6);
    const distance = ([x, y, z]) => Math.hypot(x - nx, z - nz) + (ny === null ? 0 : Math.abs(y - ny) * 2);
    /** As the spec keeps them, their fields in its order (sanitizePeople's). */
    const finish = (person) => ({
        id,
        character: person.character,
        pose: person.pose,
        clip: person.clip ?? null,
        position: person.position.map((v) => round(v)),
        rotation: round(wrap(person.rotation), 1),
        seat: person.seat ?? null,
        prop: person.prop ?? null,
        group: person.group ?? null,
        seed: seedOfTheirs,
    });

    if (pose === "sit" || pose === "lie") {
        const { sitting, lying } = seatingOf(site, spec, catalog, seats);
        const options =
            pose === "lie"
                ? lying.filter((l) => !taken.has(`${l.furniture}#lie`))
                : sitting.filter((s) => s.kind !== "stool" && s.height <= SEAT_HEIGHT[1] && s.depth <= SEAT_DEPTH[1] && !taken.has(`${s.furniture}#${s.index}`));
        const best = options.sort((a, b) => distance(a.at) - distance(b.at))[0];
        if (!best || distance(best.at) > 12) return null;
        if (pose === "lie") return finish({ ...cast.lier({ width: best.width, incline: best.incline }), pose, position: best.at, rotation: best.rotation, seat: { furniture: best.furniture, index: 0 } });
        // Whoever of the cast sits best on that seat, the seat giving under them as it does.
        const { give, forward, ...outfit } = cast.sitter(best, { holding: random() < 0.4, back: best.reclines && random() < SITS_BACK, indoors: !best.outdoor });
        return finish({ ...outfit, pose, position: seatedAt(best, give, forward), rotation: best.facing, seat: { furniture: best.furniture, index: best.index } });
    }

    // Standing: the nearest clear floor, ring by ring out from `near`.
    const floorsAt = (x, z) => {
        const rooms = site.rooms.filter((room) => pointInPolygon(x, z, room.polygon));
        if (ny !== null) return rooms.sort((a, b) => Math.abs(a.elevation - ny) - Math.abs(b.elevation - ny)).slice(0, 1).filter((room) => Math.abs(room.elevation - ny) < 1.5);
        return rooms.sort((a, b) => a.elevation - b.elevation).slice(0, 1);
    };
    const others = existing.filter((p) => p.position?.length === 3);
    for (let r = 0; r <= 12; r += 0.2) {
        const steps = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 0.2);
        const turn = random() * Math.PI * 2;
        for (let k = 0; k < steps; k++) {
            const a = turn + (k * 2 * Math.PI) / steps;
            const x = nx + Math.cos(a) * r;
            const z = nz + Math.sin(a) * r;
            for (const room of floorsAt(x, z)) {
                const y = room.elevation;
                if (edgeDistance(x, z, room.polygon) < 0.3 || !site.clearOf([x, y, z], { margin: 0.35 })) continue;
                if (others.some((p) => Math.abs(p.position[1] - y) < 1 && Math.hypot(p.position[0] - x, p.position[2] - z) < 0.7)) continue;
                // Facing the nearest standing person within 2.5 m, and one of their group.
                const mate = others
                    .filter((p) => p.pose === "stand" && Math.abs(p.position[1] - y) < 0.5 && Math.hypot(p.position[0] - x, p.position[2] - z) < 2.5)
                    .sort((p, q) => Math.hypot(p.position[0] - x, p.position[2] - z) - Math.hypot(q.position[0] - x, q.position[2] - z))[0];
                const group = mate?.group ?? null;
                const company = group ? existing.filter((p) => p.group === group) : mate ? [mate] : [];
                // Alone, with a drink; joining someone, talking to them or listening, as none of them already is.
                const role = mate ? (random() < 0.5 ? "talk" : "listen") : "drink";
                return finish({
                    ...cast.stander({ role, mates: company.map((p) => p.character), avoid: new Set(company.map((p) => p.clip).filter(Boolean)), indoors: !isOutdoor(room) }),
                    pose: "stand",
                    position: [x, y, z],
                    rotation: mate ? rotationTowards(mate.position[0] - x, mate.position[2] - z) : facing ?? random() * 360 - 180,
                    group,
                });
            }
        }
    }
    return null;
}

/**
 * The spec's people as the validator keeps them (server/scene/validate.js):
 * each one's fields of the right types — an id unique among them, a pose
 * of POSES ("stand" if not), its position three finite numbers (those
 * without are dropped), a character's id (likewise), a clip, prop and
 * group a string or null, its seat a piece's id and a seat's number, its
 * seed an integer. A seat on a piece the spec no longer has is let go.
 * Null when the spec has no `people` at all (not even an empty list).
 *
 * @param {*} raw  the spec's `people`
 * @param {string[]} notes  repairs are noted here
 * @param {Set<string>} [furnitureIds]  the spec's furniture, for the seats
 */
export function sanitizePeople(raw, notes = [], furnitureIds = null) {
    if (!Array.isArray(raw)) {
        if (raw !== undefined && raw !== null) notes.push("people: not a list, ignored.");
        return null;
    }
    if (raw.length > MAX_PEOPLE) notes.push(`people: ${raw.length} of them, kept the first ${MAX_PEOPLE}.`);
    const name = (value) => (typeof value === "string" && value.trim() && value.trim().length <= 80 ? value.trim() : null);
    const ids = new Set();
    const out = [];
    raw.slice(0, MAX_PEOPLE).forEach((p, i) => {
        const where = `people[${i}]`;
        if (!p || typeof p !== "object") {
            notes.push(`${where}: not an object, dropped.`);
            return;
        }
        const position = Array.isArray(p.position) && p.position.length === 3 && p.position.every((v) => typeof v === "number" && Number.isFinite(v)) ? p.position.map((v) => Math.min(1000, Math.max(-1000, v))) : null;
        if (!position) {
            notes.push(`${where}: position is not three numbers, dropped.`);
            return;
        }
        const character = name(p.character);
        if (!character) {
            notes.push(`${where}: no character, dropped.`);
            return;
        }
        let id = name(p.id)?.replace(/\s+/g, "-") || `person-${i + 1}`;
        if (ids.has(id)) {
            let n = 2;
            while (ids.has(`${id}-${n}`)) n++;
            notes.push(`${where}: id "${id}" was taken, now "${id}-${n}".`);
            id = `${id}-${n}`;
        }
        ids.add(id);
        let pose = p.pose;
        if (!POSES.includes(pose)) {
            notes.push(pose === undefined ? `${where}: no pose, standing.` : `${where}: pose "${pose}" is not one of ${POSES.join(", ")}, standing.`);
            pose = "stand";
        }
        let seat = null;
        if (p.seat && typeof p.seat === "object" && name(p.seat.furniture)) {
            const index = Number.isInteger(p.seat.index) && p.seat.index >= 0 ? p.seat.index : 0;
            if (!furnitureIds || furnitureIds.has(p.seat.furniture.trim())) seat = { furniture: p.seat.furniture.trim(), index };
            else notes.push(`${where}: seat on "${p.seat.furniture}", which is gone; left where it was.`);
        }
        const rotation = typeof p.rotation === "number" && Number.isFinite(p.rotation) ? wrap(p.rotation) : 0;
        const seed = typeof p.seed === "number" && Number.isFinite(p.seed) ? Math.abs(Math.trunc(p.seed)) % 2147483647 : i + 1;
        out.push({
            id,
            character,
            pose,
            clip: name(p.clip),
            position,
            rotation,
            seat,
            prop: name(p.prop),
            group: name(p.group),
            seed,
        });
    });
    return out;
}

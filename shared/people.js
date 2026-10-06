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
 *              under the pelvis; lying, the lounger's under the pelvis
 *   rotation   degrees about the upright, turned as a piece of furniture
 *              is: the way they face — 0 north (−z), 90 west (−x), −90
 *              east, 180 south (facingOf) — and lying, the way their head
 *              points. A character modelled facing +z, as Mixamo's are,
 *              is turned by rotation + 180° to face it.
 *   seat       { furniture: <placement id>, index: <its seat in seats.json;
 *              lying, 0> } | null
 *   prop       what they hold ("wine-red", "flute", ...) | null
 *   group      the people they are with, "group-<n>" | null
 *   seed       an integer: where in its clip they start
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
/** What someone lying by the pool may have, when the people index has it. */
const LYING_PROPS = ["towel", "book"];
/** Before the people index has any characters: the visitor's two avatars (World/People.js's STAND_IN). */
const STAND_IN_CHARACTERS = [{ id: "male" }, { id: "female" }];
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
const SEAT_HEIGHT = [0.3, 0.62];
const SEAT_DEPTH = [0.2, 0.78];
/** A seat shallower than this has a cushion propped against its back: sat on only when there is nowhere better. */
const ROOMY = 0.4;
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
 * (`facing`, a rotation), its depth and its kind's; the lounger's point
 * under a lying person's pelvis, and `rotation` the way their head lies.
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
                height: seat.height * s,
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
        for (const planter of land.planters || []) add("planter", planter.id, planter.base ?? 0, (planter.base ?? 0) + (planter.height ?? 0.5), thickLine(planter.path, (planter.width ?? 0.5) / 2));
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
            add("pool", pool.id ?? "pool", (pool.level ?? 0) - (pool.depth ?? 1.4), (pool.level ?? 0) + 1, turnedBox([(x0 + x1) / 2, (z0 + z1) / 2], x1 - x0, z1 - z0, 0));
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
 * The cast and its clips, and choosing among them: a character for each
 * person, spread so few wear the same and no group two of one; a clip by
 * pose, with a hand free for whoever holds something, varied within a
 * group; something to hold.
 */
function casting(random, { characters, clips, props, people = [] }) {
    const cast = (characters?.length ? characters : STAND_IN_CHARACTERS).map((c) => (typeof c === "string" ? { id: c } : c)).filter((c) => c?.id);
    const used = new Map(cast.map((c) => [c.id, 0]));
    for (const person of people) if (used.has(person.character)) used.set(person.character, used.get(person.character) + 1);
    const clipList = (Array.isArray(clips) ? clips : clips?.list || []).filter((c) => c?.name && POSES.includes(c.pose));
    const propIds = new Set((Array.isArray(props) ? props : props?.list || []).map((p) => (typeof p === "string" ? p : p?.id)).filter(Boolean));

    const character = (groupMates = []) => {
        const taken = new Set(groupMates);
        const free = cast.filter((c) => !taken.has(c.id));
        const pool = free.length ? free : cast;
        const least = Math.min(...pool.map((c) => used.get(c.id)));
        const fewest = pool.filter((c) => used.get(c.id) === least);
        const chosen = fewest[Math.floor(random() * fewest.length)];
        used.set(chosen.id, used.get(chosen.id) + 1);
        return chosen.id;
    };

    /** A clip of `pose`'s: one with a hand free if `holding`, preferring names `prefer` matches, not one of `avoid`. */
    const clip = (pose, { holding = false, prefer = null, avoid = new Set() } = {}) => {
        const posed = clipList.filter((c) => c.pose === pose);
        const able = holding ? posed.filter((c) => c.hand) : posed;
        const pool = able.length ? able : posed;
        if (!pool.length) return null;
        const liked = prefer ? pool.filter((c) => prefer.test(c.name)) : [];
        for (const list of [liked.filter((c) => !avoid.has(c.name)), pool.filter((c) => !avoid.has(c.name)), liked, pool]) {
            if (list.length) return list[Math.floor(random() * list.length)];
        }
        return null;
    };
    /** Whether a pose has a clip with a hand free to hold something (or no clips to say otherwise). */
    const canHold = (pose) => {
        const posed = clipList.filter((c) => c.pose === pose);
        return !posed.length || posed.some((c) => c.hand);
    };
    /** A drink: coffee or wine indoors, anything out; not one of the last two poured, so a group's differ. */
    const poured = [];
    const drink = (indoors) => {
        const list = indoors ? ["coffee", "wine-red", "wine-white", "tumbler"] : ["wine-red", "wine-white", "flute", "tumbler", "beer", "flute", "wine-white"];
        const fresh = list.filter((id) => !poured.includes(id));
        const pool = fresh.length ? fresh : list;
        const chosen = pool[Math.floor(random() * pool.length)];
        poured.unshift(chosen);
        poured.length = Math.min(poured.length, 2);
        return chosen;
    };
    const lyingProp = () => {
        const have = LYING_PROPS.filter((id) => propIds.has(id));
        return have.length && random() < 0.6 ? have[Math.floor(random() * have.length)] : null;
    };
    /**
     * A clip and something to hold, that go together: standing or sitting,
     * a drink if `holding` (and a clip with a hand free for it); lying, a
     * towel or a book, when the index has them. Nothing held in a hand the
     * clip doesn't free (a towel is lain on, not held); a drink for a clip
     * of drinking.
     */
    const outfit = (pose, { holding = false, indoors = false, prefer = null, avoid } = {}) => {
        let prop = pose === "lie" ? lyingProp() : holding && canHold(pose) ? drink(indoors) : null;
        const inHand = (id) => Boolean(id) && id !== "towel";
        const chosen = clip(pose, { holding: inHand(prop), prefer, avoid });
        if (chosen && !chosen.hand && inHand(prop)) prop = null;
        if (chosen?.hand && !prop && pose !== "lie" && /drink/i.test(chosen.name)) prop = drink(indoors);
        return { clip: chosen?.name ?? null, prop };
    };
    return { character, outfit };
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
 * catalogue entry.
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
        const where = { placement, item, room, outdoor: isOutdoor(room), kind: placed.kind };
        for (const seat of placed.seats) sitting.push({ ...seat, ...where });
        if (placed.lie) lying.push({ ...placed.lie, ...where });
    }
    return { sitting, lying };
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
 * sofas indoors, then terrace chairs. No two on one seat; characters
 * spread across them; clips varied by pose; the same plan for the same
 * seed. As many as the space has room for by default (defaultCount): 12
 * for a site of Ladonia's size, fewer round a house with one terrace.
 *
 * @param {object} spec      a validated scene spec
 * @param {object} catalog   the furniture catalogue ({ items }, an array, or a Map by id)
 * @param {object} seats     seats.json
 * @param {object} [options]
 * @param {number} [options.seed]   1 by default
 * @param {number} [options.count]  how many; defaultCount(spec) if not given
 * @param {object[]} [options.characters]  the people index's characters ({ id }), or the stand-in's two
 * @param {object[]} [options.clips]       the index's clips.list ({ name, pose, hand })
 * @param {object[]} [options.props]       the index's props.list ({ id })
 * @returns {object[]} the people, as the spec keeps them
 */
export function planPeople(spec, catalog, seats, { seed = 1, count, characters, clips, props } = {}) {
    const random = mulberry32((seed >>> 0) ^ 0x5eed);
    const site = siteOf(spec, catalog);
    const { sitting, lying } = seatingOf(site, spec, catalog, seats);
    const cast = casting(random, { characters, clips, props });
    const people = [];
    const taken = new Set();
    let groupNumber = 1;
    const total = Math.max(0, Math.min(MAX_PEOPLE, Math.round(count ?? defaultCount(spec, catalog, seats))));

    const add = (person) => {
        people.push({
            id: `person-${people.length + 1}`,
            character: person.character,
            pose: person.pose,
            clip: person.clip ?? null,
            position: person.position.map((v) => round(v)),
            rotation: round(wrap(person.rotation), 1),
            seat: person.seat ?? null,
            prop: person.prop ?? null,
            group: person.group ?? null,
            seed: Math.floor(random() * 1e6),
        });
    };
    const tooClose = ([x, , z], y, mates = []) =>
        people.some((p) => !mates.includes(p) && Math.abs(p.position[1] - y) < 1 && Math.hypot(p.position[0] - x, p.position[2] - z) < APART);

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
        add({
            character: cast.character(),
            pose: "lie",
            ...cast.outfit("lie"),
            position: l.at,
            rotation: l.rotation,
            seat: { furniture: l.furniture, index: 0 },
        });
    }

    // --- how many sit, how many stand --------------------------------------
    const left = total - people.length;
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
                    for (const p of people) if (Math.hypot(p.position[0] - cx, p.position[2] - cz) < 3 && Math.abs(p.position[1] - y) < 1) weight *= 0.3;
                    options.push({ centre: [cx, y, cz], members, weight });
                }
            }
            const chosen = pickWeighted(random, options, (o) => o.weight);
            if (!chosen) return;
            const { centre, members } = chosen;
            centres.push(centre);
            const group = `group-${groupNumber++}`;
            const mates = [];
            const clipsUsed = new Set();
            members.forEach((at, k) => {
                // A drink each; one of them talking, the others laughing, drinking or listening.
                const outfit = cast.outfit("stand", { holding: true, prefer: k === 0 ? /talk/i : /laugh|drink|idle|listen|talk/i, avoid: clipsUsed });
                if (outfit.clip) clipsUsed.add(outfit.clip);
                const turn = (random() - 0.5) * 24;
                const character = cast.character(mates);
                mates.push(character);
                add({
                    character,
                    pose: "stand",
                    ...outfit,
                    position: at,
                    rotation: rotationTowards(centre[0] - at[0], centre[2] - at[2]) + turn,
                    group,
                });
            });
        }
    };
    standGroups(sizes);

    // --- sitting --------------------------------------------------------------
    let sitCount = total - people.length;
    const tierOf = (s) => {
        const name = `${s.placement.catalog_id} ${s.item?.name || ""}`;
        if (s.outdoor && (s.kind === "sofa" || LOUNGE.test(name))) return "lounge";
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
    const seated = []; // [seat, person index]
    const sitOn = (s, { group = null, prefer = null, avoid = new Set() } = {}) => {
        taken.add(seatKey(s));
        const outfit = cast.outfit("sit", { holding: random() < (s.outdoor ? 0.45 : 0.35), indoors: !s.outdoor, prefer, avoid });
        const mates = group ? people.filter((p) => p.group === group).map((p) => p.character) : [];
        add({
            character: cast.character(mates),
            pose: "sit",
            ...outfit,
            position: s.at,
            rotation: s.facing,
            seat: { furniture: s.furniture, index: s.index },
            group,
        });
        seated.push(s);
        return outfit.clip;
    };
    for (const [tier, want] of plan) {
        let n = Math.min(want, sitCount);
        while (n > 0 && sitCount > 0) {
            const free = usable.filter((s) => tierOf(s) === tier && !taken.has(seatKey(s)) && !tooClose(s.at, s.at[1]));
            const seat = pickWeighted(random, free, (s) => {
                let w = s.depth >= ROOMY ? 1 : 0.12;
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
            const partners =
                n >= 2 && random() < 0.45
                    ? usable.filter((o) => {
                          if (taken.has(seatKey(o)) || seatKey(o) === seatKey(seat) || Math.abs(o.at[1] - seat.at[1]) > 0.2) return false;
                          const d = Math.hypot(o.at[0] - seat.at[0], o.at[2] - seat.at[2]);
                          // On one sofa: a seat between them, unless it seats only two.
                          if (o.furniture === seat.furniture) return Math.abs(o.index - seat.index) >= (seats[seat.placement.catalog_id].seats.length >= 3 ? 2 : 1) && d <= 1.8;
                          const turn = Math.abs(wrap(o.facing - seat.facing));
                          return d >= 0.6 && d <= 2.2 && (turn <= 30 || turn >= 120) && o.depth >= ROOMY && tierOf(o) !== "indoor";
                      })
                    : [];
            const partner = partners.length ? partners[Math.floor(random() * partners.length)] : null;
            const group = partner ? `group-${groupNumber++}` : null;
            const first = sitOn(seat, { group, prefer: partner ? /talk/i : /idle|drink|talk|laugh/i });
            n -= 1;
            sitCount -= 1;
            if (partner && sitCount > 0) {
                sitOn(partner, { group, prefer: /laugh|talk|drink/i, avoid: new Set(first ? [first] : []) });
                n -= 1;
                sitCount -= 1;
            }
        }
    }
    // Whoever found no seat stands instead, in twos and threes.
    let leftover = total - people.length;
    const more = [];
    while (leftover >= 2) {
        const size = leftover === 2 || leftover === 4 ? 2 : 3;
        more.push(size);
        leftover -= size;
    }
    standGroups(more);
    return people;
}

/**
 * One more person, for the editor's Add: posed `pose`, as near `near` as
 * one can be — standing on the nearest clear floor, turned to the nearest
 * standing person within 2.5 m and joining their group if they have one
 * (else facing `facing`, or any way); sitting on the nearest free seat;
 * lying on the nearest free lounger. Null when there is none within 12 m.
 * Its id is the next free "person-<n>"; the spec's people are left as
 * they are — adding it is the caller's.
 *
 * @param {object} spec     the spec, its `people` the ones already there
 * @param {object} catalog
 * @param {object} seats    seats.json
 * @param {object} options  { pose, near: [x, y, z] or [x, z] (then the lowest floor there),
 *                            facing (a rotation), seed, characters, clips, props }
 */
export function planOne(spec, catalog, seats, { pose = "stand", near = [0, 0, 0], facing = null, seed, characters, clips, props } = {}) {
    const existing = Array.isArray(spec.people) ? spec.people : [];
    const random = mulberry32(((seed ?? existing.length * 7919 + 17) >>> 0) ^ 0xadd);
    const site = siteOf(spec, catalog);
    const cast = casting(random, { characters, clips, props, people: existing });
    const taken = takenSeats(existing);
    const [nx, nz] = near.length >= 3 ? [near[0], near[2]] : near;
    const ny = near.length >= 3 ? near[1] : null;
    const base = {
        id: `person-${nextNumber(existing.map((p) => p.id), "person")}`,
        clip: null,
        seat: null,
        prop: null,
        group: null,
        seed: Math.floor(random() * 1e6),
    };
    const distance = ([x, y, z]) => Math.hypot(x - nx, z - nz) + (ny === null ? 0 : Math.abs(y - ny) * 2);
    const finish = (person) => ({ ...base, ...person, position: person.position.map((v) => round(v)), rotation: round(wrap(person.rotation), 1) });

    if (pose === "sit" || pose === "lie") {
        const { sitting, lying } = seatingOf(site, spec, catalog, seats);
        const options =
            pose === "lie"
                ? lying.filter((l) => !taken.has(`${l.furniture}#lie`))
                : sitting.filter((s) => s.kind !== "stool" && s.height <= SEAT_HEIGHT[1] && s.depth <= SEAT_DEPTH[1] && !taken.has(`${s.furniture}#${s.index}`));
        const best = options.sort((a, b) => distance(a.at) - distance(b.at))[0];
        if (!best || distance(best.at) > 12) return null;
        return finish({
            character: cast.character(),
            pose,
            ...cast.outfit(pose, { holding: random() < 0.4, indoors: !best.outdoor }),
            position: best.at,
            rotation: pose === "lie" ? best.rotation : best.facing,
            seat: { furniture: best.furniture, index: pose === "lie" ? 0 : best.index },
        });
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
                const mates = group ? existing.filter((p) => p.group === group).map((p) => p.character) : [];
                return finish({
                    character: cast.character(mates),
                    pose: "stand",
                    ...cast.outfit("stand", { holding: true, indoors: !isOutdoor(room), prefer: mate ? /talk|laugh|drink/i : null }),
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

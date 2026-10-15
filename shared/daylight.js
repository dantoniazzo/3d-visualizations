/**
 * Which rooms daylight never reaches — a bathroom, a lobby or a utility room
 * with no window — told from a scene's spec alone: its rooms, its walls and
 * what is cut into them. By day those rooms start with their ceiling light
 * on (a baked view's World/Switches.js, a live one's World/LiveSwitches.js):
 * with every light off, as a day used to start, they were black to walk
 * into and black patches from above.
 *
 * A room has daylight of its own where one of its walls has a window, a
 * glazed door or an open doorway with the outdoors on its other side — no
 * room there, or one out of doors (a terrace, a lawn). It borrows daylight
 * where it is one space with such a room — no wall between them
 * (shared/roomGraph.js's openPairs: a hall and the living room it runs into)
 * — or looks into one through an open doorway or through glass. A room with
 * neither is dark by day: its only light is its lamp's.
 *
 * Told from the spec, not from a bake's own figures, for three reasons. It
 * is there for every view — one drawn fully static has no light probes
 * loaded, an unbaked one and the editor have no bake. The bake measures its
 * probes with every door open, a handful to a small room: Ladonia's guest
 * WCs (three probes each) read as bright as its bedrooms with a window, and
 * are black the moment their door shuts. And where the two can be compared
 * they agree: every room this picks on Ladonia and on Wrenfield is among the
 * darkest the probes measured by day (0.0001–0.025 of the light; the garden
 * 0.26–0.40), the WCs and utility rooms at the top of that for the reason
 * above. What the probes call dark and this does not is rooms with a small
 * or shaded window (Ladonia's twin bedrooms), which have daylight and are
 * exposed for it.
 *
 * Pure: node and the page alike.
 */
import { FINISHES } from "./catalog.js";
import { openPairs, segmentDistance } from "./roomGraph.js";
import { pointInPolygon } from "./vegetation.js";

/** Whether a room is out of doors: on the ground, or under no ceiling. */
function outdoors(room) {
    return !room || FINISHES[room.floor_finish]?.kind === "ground" || room.ceiling_finish === "none";
}

/**
 * @param {object} spec  a scene's spec: `rooms`, `walls` (with their `openings`)
 * @param {object[][]} [pairs]  the indoor rooms that are one space, if the caller has them already (openPairs)
 * @returns {Set<string>} the ids of the indoor rooms daylight does not reach
 */
export function darkRooms(spec, pairs = null) {
    const rooms = spec.rooms || [];
    const walls = spec.walls || [];
    const indoor = rooms.filter((room) => !outdoors(room));
    const at = (x, y, z) => rooms.find((room) => y >= room.elevation - 0.05 && y < room.elevation + room.height + 0.3 && pointInPolygon(x, z, room.polygon)) ?? null;

    // The rooms that are one space: no wall between them.
    const group = new Map(indoor.map((room) => [room.id, room.id]));
    const find = (id) => {
        while (group.get(id) !== id) id = group.get(id);
        return id;
    };
    for (const [a, b] of pairs ?? openPairs(indoor, walls)) {
        if (group.has(a.id) && group.has(b.id)) group.set(find(a.id), find(b.id));
    }

    /** The spaces with daylight of their own, and which space looks into which. */
    const lit = new Set();
    const into = [];
    for (const wall of walls) {
        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (!length) continue;
        const dx = (x2 - x1) / length;
        const dz = (z2 - z1) / length;
        const side = (wall.thickness ?? 0.1) / 2 + 0.3;
        for (const opening of wall.openings || []) {
            // What light comes through: glass, or nothing at all. A door's solid leaf lets none by.
            const through = opening.type === "window" || opening.type === "doorway" || (opening.type === "door" && opening.door?.glazed);
            if (!through) continue;
            const x = x1 + dx * opening.offset;
            const z = z1 + dz * opening.offset;
            // Halfway up it: a high window's sill is over a doorway's head.
            const y = (wall.base_height ?? 0) + (opening.sill ?? 0) + Math.min(1, (opening.height ?? 2) / 2);
            const a = at(x - dz * side, y, z + dx * side);
            const b = at(x + dz * side, y, z - dx * side);
            const inA = a && group.has(a.id);
            const inB = b && group.has(b.id);
            if (inA && !inB) lit.add(find(a.id));
            else if (inB && !inA) lit.add(find(b.id));
            else if (inA && inB) into.push([find(a.id), find(b.id)]);
        }
    }
    // Borrowed through a doorway or through glass, from a space with daylight of its own — one room on, no further.
    const borrowed = new Set();
    for (const [a, b] of into) {
        if (lit.has(a)) borrowed.add(b);
        if (lit.has(b)) borrowed.add(a);
    }
    const dark = new Set();
    for (const room of indoor) {
        const space = find(room.id);
        if (!lit.has(space) && !borrowed.has(space)) dark.add(room.id);
    }
    return dark;
}

/**
 * The doors a room's lamplight gets out of doors by: for each indoor room,
 * the ids of the doors in its walls with the outdoors on their other side
 * — no room there, or one out of doors. A room daylight does not reach
 * (darkRooms) has no window and no doorway to the outdoors, so none of its
 * lamp's light is seen from the garden either — but through such a door,
 * while it stands open (World/LampPool.js).
 *
 * @param {object} spec  a scene's spec: `rooms`, `walls` (with their `openings`)
 * @returns {Map<string, string[]>} room id → its doors' ids; a room with none is not listed
 */
export function doorsOut(spec) {
    const rooms = spec.rooms || [];
    const at = (x, y, z) => rooms.find((room) => y >= room.elevation - 0.05 && y < room.elevation + room.height + 0.3 && pointInPolygon(x, z, room.polygon)) ?? null;
    const out = new Map();
    for (const wall of spec.walls || []) {
        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (!length) continue;
        const dx = (x2 - x1) / length;
        const dz = (z2 - z1) / length;
        const side = (wall.thickness ?? 0.1) / 2 + 0.3;
        for (const opening of wall.openings || []) {
            if (opening.type !== "door") continue;
            const x = x1 + dx * opening.offset;
            const z = z1 + dz * opening.offset;
            const y = (wall.base_height ?? 0) + 1;
            const a = at(x - dz * side, y, z + dx * side);
            const b = at(x + dz * side, y, z - dx * side);
            if (outdoors(a) === outdoors(b)) continue;
            const room = outdoors(a) ? b : a;
            if (!out.has(room.id)) out.set(room.id, []);
            out.get(room.id).push(opening.id);
        }
    }
    return out;
}

/** How much of a room's edge must stand open to the outdoors, in metres, for the room to be out in the air (airyRooms). */
const AIRY = 1;
/**
 * How far up from the room's floor a wall must reach to close its edge: higher than a parapet (a metre, a metre ten). A
 * knee wall under a roof's slope (1.4, 1.65) does — the roof comes down to it.
 */
const PARAPET = 1.2;

/**
 * Which rooms under a ceiling stand open to the air — a loggia, a porch, a
 * car port: at least AIRY of their edge with only a parapet on it
 * (PARAPET) and nothing of the house beyond, or with no wall at all and a
 * room out of doors beyond (a terrace, a path). To the eye they are out of
 * doors: at night a view drawn from its bake exposes them as it does the
 * terrace beside them (Realism), whatever lamp hangs from their ceiling —
 * what is seen from a loggia is the garden and the dusk, and metered as a
 * lamplit room it drew them twice as bright as a step further out.
 *
 * Told by what is there, not by what is missing: an edge with no wall and
 * no room beyond is a stairwell's, or a plan drawn short of its wall, as
 * often as it is the open air.
 *
 * @param {object} spec  a scene's spec: `rooms`, `walls`
 * @returns {Set<string>} their ids
 */
export function airyRooms(spec) {
    const rooms = spec.rooms || [];
    const walls = spec.walls || [];
    const at = (x, y, z) => rooms.find((room) => y >= room.elevation - 0.05 && y < room.elevation + room.height + 0.3 && pointInPolygon(x, z, room.polygon)) ?? null;
    const airy = new Set();
    for (const room of rooms) {
        if (outdoors(room)) continue;
        // The walls at its floor (a split level's stand a little over it): those that close an edge, and the parapets.
        const standing = walls.filter((wall) => (wall.base_height ?? 0) <= room.elevation + 1 && (wall.base_height ?? 0) + (wall.height ?? 0) > room.elevation + 0.3);
        const closes = (wall) => (wall.base_height ?? 0) + (wall.height ?? 0) >= room.elevation + Math.min(PARAPET, room.height - 0.1);
        const on = (list, x, z) => list.some((wall) => segmentDistance(x, z, wall.start, wall.end) < (wall.thickness ?? 0.1) / 2 + 0.05);
        const tall = standing.filter(closes);
        const low = standing.filter((wall) => !closes(wall));
        const polygon = room.polygon;
        let turn = 0;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) turn += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
        let open = 0;
        for (let i = 0, j = polygon.length - 1; i < polygon.length && open < AIRY; j = i++) {
            const [px, pz] = polygon[j];
            const [qx, qz] = polygon[i];
            const length = Math.hypot(qx - px, qz - pz);
            if (length < 1e-6) continue;
            const dx = (qx - px) / length;
            const dz = (qz - pz) / length;
            // The way out of the room across this edge, and how far out the edge's wall may stand (a room drawn short of its wall's face).
            const [ox, oz] = turn > 0 ? [dz, -dx] : [-dz, dx];
            const out = [0, 0.15, 0.3, 0.45];
            for (let t = 0.05; t < length && open < AIRY; t += 0.1) {
                const x = px + dx * t;
                const z = pz + dz * t;
                if (out.some((far) => on(tall, x + ox * far, z + oz * far))) continue;
                const bx = x + ox * 0.6;
                const bz = z + oz * 0.6;
                const beyond = at(bx, room.elevation + 1, bz);
                if (out.some((far) => on(low, x + ox * far, z + oz * far))) {
                    // A parapet: open over it, unless it looks into the house — a room beyond, or one of a floor below (a gallery's).
                    if (beyond && !outdoors(beyond)) continue;
                    if (rooms.some((other) => !outdoors(other) && other.elevation < room.elevation - 0.5 && pointInPolygon(bx, bz, other.polygon))) continue;
                    open += 0.1;
                } else if (beyond && outdoors(beyond)) {
                    open += 0.1;
                }
            }
        }
        if (open >= AIRY - 1e-6) airy.add(room.id);
    }
    return airy;
}

/**
 * Which rooms open into which — through a door, a doorway, a stairwell, or
 * where they meet with no wall between (an open-plan hall and living room)
 * — and what joins each two: what a room's light reaches besides the room
 * itself. The bake bakes each light switch into those rooms
 * (scripts/bake-public.mjs); the live view lends its few live lights to the
 * switches whose light reaches where the visitor is (World/LampPool.js).
 *
 * Pure: node and the page alike.
 */
import { pointInPolygon } from "./vegetation.js";

/**
 * @param {object} spec  a scene's spec: its walls (their doors and doorways) and floor openings
 * @param {object[]} rooms  the rooms to join — indoor ones, as each caller counts them
 * @returns {{ neighbours: Map<string, Set<string>>, links: Map<string, (string|null)[]>, linkKey: Function, roomAt: Function, joined: Map<string, Set<string>> }}
 *   `neighbours`: each room's id → the ids of the rooms it opens into;
 *   `links`: for each two (linkKey(a, b)), what joins them — a door's id,
 *   or null for something always open (a doorway, a stairwell);
 *   `roomAt(x, y, z)`: the room of `rooms` at a point, or null;
 *   `joined`: each room's id → the rooms ANY opening joins it to — those
 *   it opens into, and those it only shares light with: through an arch,
 *   a hatch, a window between two rooms. Not what a switch is baked into;
 *   what the bake takes for one part of a site when it shuts doors
 *   together (blender/lib/batches.py)
 */
export function roomLinks(spec, rooms) {
    const roomAt = (x, y, z) =>
        rooms.find((room) => y >= room.elevation - 0.05 && y < room.elevation + room.height + 0.3 && pointInPolygon(x, z, room.polygon)) ?? null;
    const neighbours = new Map(rooms.map((room) => [room.id, new Set()]));
    const joined = new Map(rooms.map((room) => [room.id, new Set()]));
    const links = new Map();
    const linkKey = (a, b) => [a, b].sort().join("|");
    const join = (a, b) => {
        if (!a || !b || a === b) return;
        joined.get(a.id)?.add(b.id);
        joined.get(b.id)?.add(a.id);
    };
    const connect = (a, b, door = null) => {
        if (!a || !b || a === b) return;
        neighbours.get(a.id)?.add(b.id);
        neighbours.get(b.id)?.add(a.id);
        join(a, b);
        const key = linkKey(a.id, b.id);
        if (!links.has(key)) links.set(key, []);
        links.get(key).push(door);
    };
    for (const wall of spec.walls || []) {
        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (!length) continue;
        const dx = (x2 - x1) / length;
        const dz = (z2 - z1) / length;
        const side = wall.thickness / 2 + 0.3;
        for (const opening of wall.openings || []) {
            const x = x1 + dx * opening.offset;
            const z = z1 + dz * opening.offset;
            if (opening.type !== "door" && opening.type !== "doorway") {
                // An arch, a hatch, a window: light passes, at the opening's own height.
                const y = wall.base_height + (opening.sill ?? 0) + (opening.height ?? 2) / 2;
                join(roomAt(x - dz * side, y, z + dx * side), roomAt(x + dz * side, y, z - dx * side));
                continue;
            }
            const y = wall.base_height + 1.0;
            connect(roomAt(x - dz * side, y, z + dx * side), roomAt(x + dz * side, y, z - dx * side), opening.type === "door" ? opening.id : null);
        }
    }
    for (const hole of spec.floor_openings || []) {
        const [x, z] = hole.position;
        connect(roomAt(x, hole.elevation + 0.1, z), roomAt(x, hole.elevation - 0.6, z));
    }
    for (const [a, b] of openPairs(rooms, spec.walls || [])) connect(a, b, null);
    return { neighbours, links, linkKey, roomAt, joined };
}

/** How much of two rooms' edge must stand open, in metres, for them to be one space. */
const OPEN = 0.3;

/**
 * The rooms on one floor that meet along at least OPEN of edge where no
 * wall stands — an open-plan hall and the living room it runs into, a
 * closet open to its bedroom: one space, as far as light goes.
 *
 * @param {object[]} rooms
 * @param {object[]} walls  the spec's
 * @returns {object[][]} pairs of rooms
 */
export function openPairs(rooms, walls) {
    const pairs = [];
    const boxes = rooms.map((room) => {
        const xs = room.polygon.map((p) => p[0]);
        const zs = room.polygon.map((p) => p[1]);
        return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    });
    for (let a = 0; a < rooms.length; a++) {
        // The walls standing round this room, at its floor.
        const [rx0, rz0, rx1, rz1] = boxes[a];
        const elevation = rooms[a].elevation;
        const near = walls.filter((wall) => {
            const bottom = wall.base_height ?? 0;
            if (bottom > elevation + 0.3 || bottom + (wall.height ?? 0) < elevation + 1) return false;
            const reach = (wall.thickness ?? 0.1) / 2 + 0.05;
            return (
                Math.min(wall.start[0], wall.end[0]) - reach <= rx1 &&
                Math.max(wall.start[0], wall.end[0]) + reach >= rx0 &&
                Math.min(wall.start[1], wall.end[1]) - reach <= rz1 &&
                Math.max(wall.start[1], wall.end[1]) + reach >= rz0
            );
        });
        const walled = (x, z) => near.some((wall) => segmentDistance(x, z, wall.start, wall.end) < (wall.thickness ?? 0.1) / 2 + 0.03);
        for (let b = a + 1; b < rooms.length; b++) {
            if (Math.abs(rooms[a].elevation - rooms[b].elevation) > 0.05) continue;
            const [bx0, bz0, bx1, bz1] = boxes[b];
            if (rx0 > bx1 + 0.03 || bx0 > rx1 + 0.03 || rz0 > bz1 + 0.03 || bz0 > rz1 + 0.03) continue;
            // Along a's edges, where b's edge runs too: how much of it no wall stands on.
            let open = 0;
            const polygon = rooms[a].polygon;
            for (let i = 0, j = polygon.length - 1; i < polygon.length && open < OPEN; j = i++) {
                const [px, pz] = polygon[j];
                const [qx, qz] = polygon[i];
                const length = Math.hypot(qx - px, qz - pz);
                for (let t = 0.05; t < length && open < OPEN; t += 0.1) {
                    const x = px + ((qx - px) * t) / length;
                    const z = pz + ((qz - pz) * t) / length;
                    if (edgeDistance(x, z, rooms[b].polygon) < 0.02 && !walled(x, z)) open += 0.1;
                }
            }
            if (open >= OPEN - 1e-6) pairs.push([rooms[a], rooms[b]]);
        }
    }
    return pairs;
}

/** The distance from (x, z) to the segment from `a` to `b`. */
export function segmentDistance(x, z, [ax, az], [bx, bz]) {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/** The distance from (x, z) to a polygon's nearest edge. */
export function edgeDistance(x, z, polygon) {
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) best = Math.min(best, segmentDistance(x, z, polygon[j], polygon[i]));
    return best;
}

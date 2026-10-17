/**
 * Which room the visitor is in: one answer for everything that asks — the
 * room's name on screen (the HUD's readout), the key that switches the
 * room's lights (Q, Player.toggleRoomLights) and, over a baked view, the
 * room drawn live (World/RoomLight.js) — so that what the screen says, what
 * Q switches and what is drawn live are always the same room.
 *
 * A point's room is not just the room whose plan it is over at its height
 * (SceneBuilder.roomAt), which goes wrong in two places:
 *
 *   - on a flight of stairs, between two storeys. A flight climbs over
 *     whatever lies under it, and half-way up its visitor's feet are over
 *     that — on Ladonia's six indoor flights, the bathroom under the stair
 *     to the roof — though they are in no room at all. They are taken to be
 *     in the room at the end of the flight they are nearer in height: the
 *     one they are on their way to, or have just left (flightAt);
 *   - on a threshold. The rooms' floors stop at their walls' faces, and the
 *     strip under a door is no room's; upstairs, roomAt finds the room a
 *     storey below through it. A visitor standing in a doorway is taken to
 *     be in a room within REACH of their feet — the one they were in, if it
 *     is one of them — and, in no room at all, still in the one they were
 *     in for BETWEEN seconds (follow): a threshold is crossed in less, so
 *     nothing on screen flickers as it is.
 *
 * It needs only the scene's plan (the builder's spec and roomAt), so it is
 * the same in the editor and in a public view, built or loaded from a
 * runtime file; it asks the spec each time, so an edit's rooms and stairs
 * are what it goes by from then on.
 */

/**
 * How far round a visitor who stands in no room a room is looked for, in metres: half a wall's thickness and the
 * visitor's own. On a threshold — the rooms' floors stop at their walls' faces, and the strip under the door is no
 * room's — the room is one of those either side, for as long as they stand there.
 */
export const REACH = 0.3;
/** How long, in seconds, a visitor in no room is still in the room they were in (follow): a threshold is crossed in less. */
export const BETWEEN = 0.6;
/**
 * How far over a room's floor, in metres, the visitor's feet are still in it: on a rug, a stair's first steps, a
 * bed. `roomAt` finds a room from as far over its floor as its ceiling — on a threshold upstairs, whose strip is no
 * room's, the room a storey below.
 */
export const ON_FLOOR = 1.2;
/** How far from either end of a flight of stairs, in metres of height, its visitor is on it rather than on a floor (flightAt). */
export const ON_FLIGHT = 0.3;
/** The eight ways round a point a room is looked for in, a threshold's width away (REACH). */
const AROUND = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);

const anyRoom = () => true;
const noneKept = () => null;

/** Each room's plan's bounds, by its polygon. */
const bounds = new WeakMap();

/**
 * A plan polygon's bounds, `[minX, minZ, maxX, maxZ]`, worked out once for
 * each polygon (a room given a new plan has a new polygon: nothing in the
 * app moves a corner of one in place): what is outside them is outside it,
 * found without tracing its outline (SceneBuilder.roomAt, nearRoom).
 */
export function planBounds(polygon) {
    let box = bounds.get(polygon);
    if (!box) {
        box = [Infinity, Infinity, -Infinity, -Infinity];
        for (const [x, z] of polygon) {
            box[0] = Math.min(box[0], x);
            box[1] = Math.min(box[1], z);
            box[2] = Math.max(box[2], x);
            box[3] = Math.max(box[3], z);
        }
        bounds.set(polygon, box);
    }
    return box;
}

export default class Whereabouts {
    /**
     * @param {{ spec: object, roomAt: (x: number, y: number, z: number) => object|null }} builder  the scene's (SceneBuilder)
     */
    constructor(builder) {
        this.builder = builder;
        /** The room the visitor followed is in (follow), by its id, or null. */
        this.room = null;
        /** Since when, on follow's clock, they have been in no room; null while they are in one. */
        this.outside = null;
        this.clock = 0;
    }

    /**
     * The room a point is in, by the rules above: `room`, the one it is
     * taken to be in, and `floor`, the room whose floor it stands on — null
     * on a flight of stairs or a threshold, where `room` may still be one.
     *
     * @param {number} x
     * @param {number} y  the feet's height: which storey is a question of what is stood on
     * @param {number} z
     * @param {object} [options]
     * @param {(id: string) => boolean} [options.accept]  which rooms may be taken for one the point is near — a
     *        flight's ends, a threshold's sides (RoomLight: only those it draws as rooms); the room whose floor it
     *        stands on is its room whatever this says
     * @param {(id: string) => string|null} [options.keep]  on a threshold, a room within reach that the point is
     *        still in: the room to say for it (follow: the room it was in; RoomLight: the room drawn live), else null
     * @returns {{ room: string|null, floor: string|null }}
     */
    locate(x, y, z, { accept = anyRoom, keep = noneKept } = {}) {
        // On a flight of stairs, between two storeys, the visitor is in no room (the one the flight climbs over lies
        // under them, and is not theirs): they are in the room at the end they are nearer in height.
        const flight = this.flightAt(x, y, z);
        const floor = flight ? null : this.standsIn(x, y, z);
        if (floor) return { room: floor, floor };
        if (flight) {
            const ends = [flight.foot, flight.head].filter((id) => id && accept(id));
            if (ends.length < 2) return { room: ends[0] ?? null, floor };
            return { room: y - flight.stair.base_height < flight.stair.top_height - y ? flight.foot : flight.head, floor };
        }
        // In no room — on a threshold, in a wall's thickness: a room within reach that the point is still in; else the
        // first within reach. (None near at all — out in the garden — and none is looked for.)
        if (!this.nearRoom(x, y, z)) return { room: null, floor };
        let near = null;
        for (const [dx, dz] of AROUND) {
            const id = this.standsIn(x + dx * REACH, y, z + dz * REACH);
            if (!id || !accept(id)) continue;
            const kept = keep(id);
            if (kept) return { room: kept, floor };
            near ??= id;
        }
        return { room: near, floor };
    }

    /**
     * Where the visitor is, as they go: the room locate gives for where they
     * are now — the one they were in, of those within reach on a threshold
     * — and, where that is none, still the one they were in until they have
     * been in no room for BETWEEN seconds.
     *
     * @param {number} x
     * @param {number} y  the feet's height
     * @param {number} z
     * @param {number} delta  seconds since the last call
     * @returns {string|null}  the room's id
     */
    follow(x, y, z, delta) {
        this.clock += delta;
        const { room } = this.locate(x, y, z, { keep: (id) => (id === this.room ? id : null) });
        if (room) {
            this.room = room;
            this.outside = null;
        } else if (this.room) {
            this.outside ??= this.clock;
            if (this.clock - this.outside >= BETWEEN) this.room = null;
        }
        return this.room;
    }

    /** Followed no more: in a car, say. The next follow starts afresh. */
    forget() {
        this.room = null;
        this.outside = null;
    }

    /**
     * Whether a room's floor may be within REACH of a point: one whose
     * plan's bounds it is within REACH of, at a height over its floor that
     * standsIn could take (roomAt's 0.6 m under it, to ON_FLOOR over it).
     * Out in the garden there is none, and the eight looks round the point —
     * each a look over every room's plan — are not taken in every frame.
     */
    nearRoom(x, y, z) {
        for (const room of this.builder.spec.rooms) {
            const drop = y - room.elevation;
            if (drop < -0.6 || drop > ON_FLOOR) continue;
            const [minX, minZ, maxX, maxZ] = planBounds(room.polygon);
            if (x >= minX - REACH && x <= maxX + REACH && z >= minZ - REACH && z <= maxZ + REACH) return true;
        }
        return false;
    }

    /** The room whose floor a point stands on (ON_FLOOR), by its id — or null: over no room, or over one from a storey above it. */
    standsIn(x, y, z) {
        const room = this.builder.roomAt(x, y, z);
        return room && Math.abs(y - room.elevation) <= ON_FLOOR ? room.id : null;
    }

    /**
     * The flight of stairs a point is on, between its foot and its head
     * (more than ON_FLIGHT from either: nearer, it is on that floor) — and
     * the rooms it joins: the one a step before its foot, on the floor it
     * climbs from, and the one a step past its head, on the floor it comes
     * up to (null where that is no room). Null off every flight. `within`:
     * how far beyond its ends and sides, and with its ends' floors too —
     * for whoever stands by it.
     *
     * @returns {{ stair: object, foot: string|null, head: string|null }|null}
     */
    flightAt(x, y, z, within = 0) {
        for (const stair of this.builder.spec.stairs || []) {
            if (within ? y < stair.base_height - 0.1 || y > stair.top_height + 0.1 : y <= stair.base_height + ON_FLIGHT || y >= stair.top_height - ON_FLIGHT) continue;
            const yaw = ((stair.yaw ?? 0) * Math.PI) / 180;
            const sin = Math.sin(yaw);
            const cos = Math.cos(yaw);
            // (Along its run from its foot, and across it: server/scene/validate.js's stairFootprint, the other way.)
            const along = (x - stair.start[0]) * sin + (z - stair.start[1]) * cos;
            const across = (x - stair.start[0]) * cos - (z - stair.start[1]) * sin;
            if (along < -0.1 - within || along > stair.run + 0.1 + within || Math.abs(across) > stair.width / 2 + 0.1 + within) continue;
            const end = (distance, height) => this.standsIn(stair.start[0] + distance * sin, height, stair.start[1] + distance * cos);
            return { stair, foot: end(-0.4, stair.base_height), head: end(stair.run + 0.4, stair.top_height) };
        }
        return null;
    }
}

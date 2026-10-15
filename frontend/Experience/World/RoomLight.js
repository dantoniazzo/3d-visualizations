import { EventEmitter } from "events";
import * as THREE from "three";

import Experience from "../Experience.js";
import { QUALITY_STEP, ROOM_LIGHT_STEP, onQualityChange, roomLightOn, roomLightWithheld } from "../Utils/device.js";
import { roomLinks } from "../../../shared/roomGraph.js";
import LiveRoom from "./LiveRoom.js";

/**
 * The rooms the visitor is in and sees into drawn live, over a view drawn
 * from its bake, when they ask for it — and only then: off at every visit,
 * never on by itself, and the bake's again once they are out of sight.
 *
 * While it is on, the room the visitor is in — with the rooms that always
 * stand open to it (shared/roomGraph.js's roomLinks: a hall and the living
 * room it runs into with no wall between, a bedroom through a doorway that
 * has no door: a group) — and every group of rooms they can see into from
 * there, through an opening that stands open or is seen through — a door
 * ajar or open, a door with glass in it, a stairwell — is drawn as a
 * version that was not baked draws it, the editor's realistic walkthrough:
 * its surfaces' own materials, the sun through its windows with its
 * shadows, the sky, its lamps with theirs, and none of the bake's light on
 * them (World/LiveRoom.js, which says how). Every other room, the garden
 * and the bird's-eye view stay exactly as baked.
 *
 * This is who asks for it and when: which rooms (choose, look), each made
 * ready a little a frame before it is shown (LiveRoom.prepare — "coming"
 * meanwhile, the bake's drawing still), shown and kept as the visitor walks
 * (follow), suspended from above (hold), and turned off for them by
 * whatever watches the frame rate (end). Nothing of it exists until it is
 * first asked for.
 *
 * Seen before it is entered, a room is live before it is entered: the room
 * behind a shut door is made ready as its visitor comes within reach of the
 * door (AHEAD), and shown in the frame the door starts to open; what is
 * seen through an opening is shown as soon as it is ready; and a room
 * stays live for as long as it is in sight — behind its visitor too, until
 * the door between is shut. So walking from one room into the next changes
 * nothing in view: both were live, and still are. Only the first press
 * changes the picture, once, with everything in sight made ready first. The
 * exposure is one throughout (Realism.updateBaked).
 *
 * Ceilings: so many groups of rooms at once (LIVE_MOST, by the slider's
 * step: the visitor's own, then the nearest in sight — beyond them a room
 * is the bake's until it is nearer, and then changes in a frame, as every
 * room did before); not offered below the Balanced step, on a touch device,
 * or where the view is drawn fully static (Utils/device.js's
 * roomLightAllowed).
 *
 * Emits "change" (its status, as `status()` gives it) whenever what the
 * interface says of it changes, "hint" the first time the visitor walks
 * into a room while it is off, and "ended" (why) when it is turned off for
 * them.
 */

/** How long, in seconds, a room stays live with its visitor in no room at all: a threshold is crossed in less. */
const BETWEEN = 0.6;
/**
 * How many groups of rooms are drawn live at once, at most, by the slider's step: the one their visitor is in, and
 * those seen from it through what stands open (look) — nearest first; beyond these a room is the bake's, as every
 * room but the visitor's was before. By measurement (`app-notes.md`, Live room light): what an M4 Pro draws at each
 * step with the frames of a walk through a flat staying about 25 ms.
 */
const LIVE_MOST = { 2: 8, 3: 8, 4: 8 };
/** How far from a shut door, in metres, the visitor is when the room behind it is made ready: the key opens the nearest within 2.2 m (SceneBuilder.nearestDoor), and a door is a third of a second in swinging. */
const AHEAD = 3.6;
/** How many rooms behind shut doors are made ready at once: the nearest, those the visitor faces first (a corridor has a door either side and one at its end). */
const AHEAD_MOST = 4;
/** How many openings deep the eye is followed: a hall, the bedroom off it, the bathroom off that. */
const DEPTH = 3;
/** How many times further a room in sight counts for lying behind the eye; and how many metres further for each opening it is seen through. */
const BEHIND = 1.35;
const DEEPER = 1;
/**
 * How far round a visitor who stands in no room a room is looked for, in metres: half a wall's thickness and the
 * visitor's own. On a threshold — the rooms' floors stop at their walls' faces, and the strip under the door is no
 * room's — the room stays live for as long as they stand there.
 */
const REACH = 0.3;
/**
 * How far over a room's floor, in metres, the visitor's feet are still in it: on a rug, a stair's first steps, a
 * bed. `roomAt` finds a room from as far over its floor as its ceiling — on a threshold upstairs, whose strip is no
 * room's, the room a storey below.
 */
const ON_FLOOR = 1.2;
/** How far from either end of a flight of stairs, in metres of height, its visitor is on it rather than on a floor (flightAt). */
const ON_FLIGHT = 0.3;
const AROUND = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);

const _here = new THREE.Vector3();
const _ahead = new THREE.Vector3();

/** What is seen from `eye` through the whole of an opening (`way`): the part of the plan between its two jambs — or all of it, from within the opening itself. */
function open(eye, way) {
    const ax = way.x - way.dx * way.half - eye.x;
    const az = way.z - way.dz * way.half - eye.z;
    const bx = way.x + way.dx * way.half - eye.x;
    const bz = way.z + way.dz * way.half - eye.z;
    const turn = ax * bz - az * bx;
    // (In the doorway, or in line with the wall: everything beyond.)
    if (Math.abs(turn) < 0.2 * way.half) return ALL;
    return turn > 0 ? { ax, az, bx, bz } : { ax: bx, az: bz, bx: ax, bz: az };
}

/** What of an opening is seen from `eye` through `wedge` — what the openings before it leave in sight (open) — as the wedge it leaves in turn; null, none of it. */
function clip(wedge, eye, way) {
    if (wedge === ALL || wedge === null) return wedge === ALL ? open(eye, way) : null;
    let px = way.x - way.dx * way.half - eye.x;
    let pz = way.z - way.dz * way.half - eye.z;
    let qx = way.x + way.dx * way.half - eye.x;
    let qz = way.z + way.dz * way.half - eye.z;
    // Each side of the wedge in turn: what of the opening lies inside it.
    for (const [sx, sz, sign] of [[wedge.ax, wedge.az, 1], [wedge.bx, wedge.bz, -1]]) {
        const p = (sx * pz - sz * px) * sign;
        const q = (sx * qz - sz * qx) * sign;
        if (p < 0 && q < 0) return null;
        if (p < 0 || q < 0) {
            const t = p / (p - q);
            const x = px + (qx - px) * t;
            const z = pz + (qz - pz) * t;
            if (p < 0) [px, pz] = [x, z];
            else [qx, qz] = [x, z];
        }
    }
    // (Before the eye, not behind it.)
    const mid = wedge.ax + wedge.bx;
    const midz = wedge.az + wedge.bz;
    if ((px + qx) * mid + (pz + qz) * midz <= 0) return null;
    const turn = px * qz - pz * qx;
    if (Math.abs(turn) < 1e-6) return null;
    return turn > 0 ? { ax: px, az: pz, bx: qx, bz: qz } : { ax: qx, az: qz, bx: px, bz: pz };
}

/** Everything, as a wedge: seen from within an opening. */
const ALL = Object.freeze({});

export default class RoomLight extends EventEmitter {
    /**
     * @param {World} world  drawing a public view from its bake
     * @param {object} published  the published version: its `lighting`, and its spec's lights and rooms
     */
    constructor(world, published) {
        super();
        this.experience = new Experience();
        this.world = world;
        this.builder = world.sceneBuilder;
        this.renderer = this.experience.renderer;
        /** Whether this view can draw a room live at all (SceneBuilder.roomLiveOK): else there is nothing to ask for. */
        this.supported = Boolean(this.builder.roomLiveOK);
        /** Why not, where the visitor could have it by their own settings ("step", "chosen") — for the menu to say. */
        this.withheld = this.supported ? null : roomLightWithheld(published.lighting);
        /** Asked for by the visitor. */
        this.wanted = false;
        /** Suspended: the view from above. */
        this.held = false;
        /** What is drawn live now: its rooms. */
        this.plan = null;
        /** The group of rooms being made ready now (prepare): `{ key }`. */
        this.next = null;
        /** Those made ready, by key -> what LiveRoom.prepare resolved to: shown, or waiting to be (follow). */
        this.made = new Map();
        /** Those that could not be made ready, by key -> when (tried again three seconds on); and those made ready again for lights that had changed, by key -> how often (again). */
        this.failed = new Map();
        this.redone = new Map();
        /** What the visitor sees from where they are, and may soon (look): `{ seen, ahead, beyond }`. */
        this.sight = null;
        /** A developer's own ceiling on how many groups are shown at once (most). */
        this.cap = null;
        this.state = "off";
        this.said = "";
        this.choice = null;
        this.hinted = false;
        this.clock = 0;
        /** Whether a shadow map or a probe of its is held (LiveRoom.release). */
        this.kept = false;
        /** Since when the visitor has been in no room (update). */
        this.outside = null;
        this.stats = { installs: 0, prepares: 0, handovers: 0 };
        this.live = null;
        if (!this.supported) return;

        this.live = new LiveRoom(world, published);
        const spec = this.builder.spec;
        const zones = published.lighting.zones ?? null;
        /** The rooms drawn as rooms: under a ceiling, with a part of the bake of their own. */
        this.rooms = new Map(spec.rooms.filter((room) => room.ceiling_finish !== "none" && (!zones || zones[room.id])).map((room) => [room.id, room]));
        // The rooms that always stand open to one another on a storey are drawn as one: with no wall between them, or
        // through a doorway that has no door — which nobody can shut, so the room beyond it is always in the picture,
        // and its light in this one's. (Not up or down a stairwell: another storey is another room.)
        const list = [...this.rooms.values()];
        const parent = list.map((_, i) => i);
        const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
        const place = new Map(list.map((room, i) => [room.id, i]));
        const graph = roomLinks(spec, list);
        for (const [key, ways] of graph.links) {
            const [a, b] = key.split("|").map((id) => place.get(id));
            if (!ways.includes(null) || a === undefined || b === undefined || Math.abs(list[a].elevation - list[b].elevation) > 0.5) continue;
            parent[find(a)] = find(b);
        }
        /** room id -> the ids of the rooms drawn with it, itself among them */
        this.groups = new Map(list.map((room, i) => [room.id, list.filter((_, j) => find(j) === find(i)).map((other) => other.id)]));
        /** A group's key (its rooms' ids joined) -> its rooms' ids. */
        this.zonesOf = new Map([...this.groups.values()].map((group) => [group.join(), group]));
        // What joins two groups, and where: each door between them (shut or open: passes), each doorway and stairwell
        // (always open) — what the eye passes from one into the other (look).
        /** Each `{ a, b, door, glazed, stair, x, y, z, dx, dz, half }`: the groups' keys, the door's id or null, the opening's middle, the wall's way and half the opening's width (`over`: a flight of stairs over `b`, seen from `a` — below). */
        this.ways = [];
        const keyOf = (room) => (room ? this.groups.get(room.id)?.join() ?? null : null);
        const join = (a, b, way) => {
            const from = keyOf(a);
            const to = keyOf(b);
            if (from && to && from !== to) this.ways.push({ a: from, b: to, ...way });
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
                if (opening.type !== "door" && opening.type !== "doorway") continue;
                const x = x1 + dx * opening.offset;
                const z = z1 + dz * opening.offset;
                const y = (wall.base_height ?? 0) + 1;
                const door = opening.type === "door" ? opening.id : null;
                join(graph.roomAt(x - dz * side, y, z + dx * side), graph.roomAt(x + dz * side, y, z - dx * side), { door, glazed: Boolean(door && opening.door?.glazed), stair: false, x, y, z, dx, dz, half: (opening.width ?? 0.9) / 2 });
            }
        }
        for (const hole of spec.floor_openings || []) {
            const [x, z] = hole.position;
            join(graph.roomAt(x, hole.elevation + 0.1, z), graph.roomAt(x, hole.elevation - 0.6, z), { door: null, glazed: false, stair: true, x, y: hole.elevation, z, dx: 1, dz: 0, half: 0.6 });
        }
        // A flight of stairs climbs over whatever lies under it, and the bake files each step with the room it is over:
        // the upper half of a flight that passes over a bathroom is the bathroom's — black steps in a stair hall drawn
        // live, until the bathroom's door was opened. So the room a flight starts in sees the others it passes over as
        // through a stairwell (`over`: from that room only — the bathroom does not see the hall through its floor).
        for (const stair of spec.stairs || []) {
            const yaw = ((stair.yaw ?? 0) * Math.PI) / 180;
            const sin = Math.sin(yaw);
            const cos = Math.cos(yaw);
            let first = null;
            for (let k = 0; k <= 8; k++) {
                const x = stair.start[0] + ((stair.run * k) / 8) * sin;
                const z = stair.start[1] + ((stair.run * k) / 8) * cos;
                const under = graph.roomAt(x, stair.base_height + 0.05, z);
                if (!under) continue;
                first ??= under;
                const [from, to] = [keyOf(first), keyOf(under)];
                if (this.ways.some((way) => way.over && way.a === from && way.b === to)) continue;
                join(first, under, { door: null, glazed: false, stair: true, over: true, x, y: stair.base_height + 1, z, dx: cos, dz: -sin, half: stair.width / 2 });
            }
        }
        /** A group's key -> what joins it to others. */
        this.waysOf = new Map();
        for (const way of this.ways) {
            for (const key of way.over ? [way.a] : [way.a, way.b]) {
                if (!this.waysOf.has(key)) this.waysOf.set(key, []);
                this.waysOf.get(key).push(way);
            }
        }

        this.stopQuality = onQualityChange(() => {
            // A step that draws other shadows, or other lamps, or none of it: looked at afresh (update: LiveRoom.fresh).
            this.choice = null;
            this.announce();
        });
        this.onRoom = () => this.hint();
        world.on("room", this.onRoom);
        this.onLost = () => this.lose();
        this.renderer.renderer.domElement.addEventListener("webglcontextlost", this.onLost);
        // A developer's own: on as the view opens (`?roomlight=on`).
        if (roomLightOn()) this.wanted = true;
    }

    /** Whether it can be drawn as the view is drawn now: at the Balanced step or above. */
    get allowed() {
        return this.supported && QUALITY_STEP >= ROOM_LIGHT_STEP;
    }

    /**
     * The rooms drawn live now, and how the picture is exposed for them
     * (LiveRoom's `drawn`: `{ zones, gain, adaptation }`) — or null, none
     * (Realism.updateBaked).
     */
    get drawn() {
        return this.live?.drawn ?? null;
    }

    /**
     * Turn it on or off — the visitor's own doing (the lights panel's
     * switch, the K key).
     *
     * @returns {boolean} whether it is on
     */
    set(on) {
        if (!this.supported) return false;
        this.wanted = Boolean(on) && this.allowed;
        this.hinted = true;
        this.choice = null;
        this.announce();
        return this.wanted;
    }

    toggle() {
        return this.set(!this.wanted);
    }

    /**
     * Turned off for the visitor — by whatever watches the frame rate — and
     * said so (the interface shows `why`). They can turn it on again.
     *
     * @param {string} [why]  a line for the visitor
     */
    end(why = "The live room was turned off to keep the view smooth. K turns it on again.") {
        if (!this.wanted) return;
        this.wanted = false;
        this.choice = null;
        this.drop();
        if (this.plan) this.uninstall();
        this.announce();
        this.emit("ended", why);
    }

    /** From above (World.lightFromAbove) nothing is drawn live: out at once, and back when the view is left. */
    hold(held) {
        this.held = Boolean(held);
        if (!this.supported) return;
        this.choice = null;
        if (this.held) this.drop();
        if (this.held && this.plan) this.uninstall();
        this.announce();
    }

    /** The graphics gave up: nothing of it is kept, and nothing built for it is built any more. */
    lose() {
        this.wanted = false;
        this.drop();
        if (this.plan) this.uninstall();
        this.live?.release();
        this.live?.forget();
        this.made.clear();
        this.kept = false;
        this.announce();
    }

    /**
     * What the interface says of it: whether it is offered (`supported`),
     * asked for (`on`), and where that has got to (`state`):
     *
     *   "off"       not asked for
     *   "withheld"  not offered as the view is set, though this device could have it (`withheld` says which setting)
     *   "step"      asked for, but the slider is under the Balanced step now
     *   "above"     asked for, suspended in the view from above
     *   "outdoors"  asked for; the visitor is in no room
     *   "coming"    being made ready: no room is drawn live yet
     *   "lit"       a room is drawn live (the one before, for the moment the next is made ready)
     */
    status() {
        const plan = this.plan;
        const rig = this.live?.rig;
        return {
            supported: this.supported,
            withheld: this.withheld,
            on: this.wanted,
            state: this.state,
            room: this.choice?.room ?? null,
            zones: plan ? [...plan.zones] : [],
            groups: plan ? plan.keys.length : 0,
            sight: this.sight && this.wanted ? { seen: this.sight.seen.length, ahead: this.sight.ahead.length, beyond: this.sight.beyond } : null,
            lamps: plan && rig ? rig.pool.slots.filter((slot) => slot.fitting).map((slot) => ({ switch: slot.fitting.switch, at: slot.fitting.position, power: slot.fitting.power, shadowed: slot.shadowed })) : [],
            share: plan ? 1 : 0,
            exposure: this.drawn ? { adaptation: this.drawn.adaptation, gain: this.drawn.gain } : null,
            stats: { ...this.stats, ...(this.live?.stats ?? {}) },
        };
    }

    /** The state as it is now, told if it has changed. */
    announce() {
        let state = "off";
        if (!this.supported) state = this.withheld ? "withheld" : "off";
        else if (this.wanted && !this.allowed) state = "step";
        else if (this.wanted && this.held) state = "above";
        else if (this.wanted) {
            const choice = this.choice ?? (this.choice = this.choose());
            if (choice.key === null) state = this.plan ? "lit" : choice.none;
            else state = this.plan ? "lit" : "coming";
        }
        const said = `${state}|${this.wanted}|${this.choice?.room ?? ""}`;
        if (said === this.said) return;
        this.state = state;
        this.said = said;
        this.emit("change", this.status());
    }

    /** A word the first time the visitor walks into a room where it would show while it is off, and once a visit. */
    hint() {
        if (this.hinted || this.wanted || !this.allowed || this.held) return;
        if (this.choose().key === null) return;
        this.hinted = true;
        this.emit("hint");
    }

    /** Where the visitor is: the room they stand in (or drive through). */
    where() {
        const player = this.world.player;
        if (player?.inVehicle && player.currentCar) _here.copy(player.currentCar.group.position);
        else if (player?.player?.collider) {
            // At the feet, as the room's name on screen is found (Player.js): which storey is a question of what is stood on.
            const body = player.player.collider;
            _here.set(body.end.x, body.start.y - body.radius, body.end.z);
        } else _here.copy(this.experience.camera.activeCamera.position);
        const { x, y, z } = _here;
        // On a flight of stairs, between two storeys, the visitor is in no room (the one the flight climbs over lies
        // under them, and is not theirs): what is drawn live is the room at the end they are nearer in height — made
        // ready from half-way, and taking over once they stand on its floor.
        const flight = this.flightAt(x, y, z);
        const room = flight ? null : this.standsIn(x, y, z);
        /** Where the visitor is, and the room there — as it is, a threshold or a flight of stairs being no room (look, update). */
        this.at = { x, y, z, room };
        if (room) return room;
        if (flight) {
            const ends = [flight.foot, flight.head].filter((id) => id && this.rooms.has(id));
            if (ends.length < 2) return ends[0] ?? null;
            return y - flight.stair.base_height < flight.stair.top_height - y ? flight.foot : flight.head;
        }
        // In no room — on a threshold, in a wall's thickness: the room drawn live now, if it is within reach; else a room indoors that is.
        let near = null;
        for (const [dx, dz] of AROUND) {
            const id = this.standsIn(x + dx * REACH, y, z + dz * REACH);
            if (!id || !this.rooms.has(id)) continue;
            if (this.plan?.zones.includes(id)) return this.plan.choice.room;
            near ??= id;
        }
        return near;
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

    /**
     * What to draw live now: the rooms drawn with the one the visitor is
     * in. `key` null, and `none` why, where there is nothing to: out of
     * doors.
     */
    choose() {
        const room = this.where();
        const zones = room ? this.groups.get(room) : null;
        if (!zones) return { key: null, none: "outdoors", room: null };
        return { key: zones.join(), zones, room };
    }

    /** Whether what joins two groups of rooms lets the eye through as it stands: a doorway or a stairwell, a door with glass in it, a door that is not shut (or is on its way open) — LampPool's rule for a lamp's light. */
    passes(way) {
        if (way.door === null || way.glazed) return true;
        const doors = this.builder.doors || [];
        if (this.doorsOf !== doors || this.doorsCount !== doors.length) {
            this.doorsOf = doors;
            this.doorsCount = doors.length;
            this.doorsById = new Map(doors.map((door) => [door.spec.id, door]));
        }
        const door = this.doorsById.get(way.door);
        return !door || door.open > 0.001 || door.target > 0.5;
    }

    /**
     * What is in sight of a visitor in the group of rooms `key`, and what
     * soon may be:
     *
     *   - `seen`: the groups to show beside their own. First those they
     *     can see into — through an opening of their own rooms that stands
     *     open or is seen through (any of them: a head turns faster than a
     *     room is made ready), and on through the openings of those, as far
     *     as the eye passes them in a straight line (each opening narrows
     *     what is seen through the next: `clip`), DEPTH openings deep —
     *     nearest first, those ahead of the eye before those behind it.
     *     Then those shown already that open doors still join to where the
     *     visitor is, in sight this moment or not: a room is given back
     *     when the door to it is shut — or its place is wanted — not each
     *     time its visitor turns their back or steps aside (each change is
     *     the probe taken again and the sun's map drawn again). No more of
     *     them than `most` allows with the visitor's own;
     *   - `ahead`: the groups behind the doors of all those that are shut
     *     and within AHEAD of the visitor, the ones they face first — made
     *     ready, not shown, so that a door that starts to open has a room
     *     behind it already.
     *
     * @returns {{ seen: string[], ahead: string[], beyond: number }} the groups' keys, and how many in sight are left to their bake
     */
    look(key) {
        const at = this.at ?? { x: 0, y: 0, z: 0 };
        const camera = this.experience.camera.activeCamera;
        const eye = camera.position;
        camera.getWorldDirection(_ahead);
        const flat = Math.hypot(_ahead.x, _ahead.z) || 1;
        const seen = new Map();
        const ahead = new Map();
        const joined = new Set();
        const visit = (from, wedge, depth, path) => {
            for (const way of this.waysOf.get(from) ?? []) {
                const to = way.a === from ? way.b : way.a;
                if (path.includes(to)) continue;
                const passes = this.passes(way);
                if (passes) joined.add(to);
                // (From the visitor's own rooms, every opening of theirs; further on, what the openings before it leave in sight.)
                const through = depth === 0 ? open(eye, way) : wedge === null ? null : way.stair ? wedge : clip(wedge, eye, way);
                const reach = Math.hypot(way.x - at.x, way.z - at.z) + Math.abs(way.y - (at.y + 1)) * 0.5;
                // How far it is from straight ahead of the eye: 1 before it, -1 behind.
                const span = Math.hypot(way.x - eye.x, way.z - eye.z) || 1;
                const facing = ((way.x - eye.x) * _ahead.x + (way.z - eye.z) * _ahead.z) / (span * flat);
                if (!passes) {
                    const score = reach * (1.6 - 0.6 * facing);
                    if (through !== null && reach < AHEAD && !(ahead.get(to) <= score)) ahead.set(to, score);
                    continue;
                }
                if (through !== null) {
                    const score = reach * (facing < 0 ? BEHIND : 1) + depth * DEEPER;
                    if (!(seen.get(to) <= score)) seen.set(to, score);
                }
                // (On through it: what is seen, by what it leaves in sight; what is joined, whichever way the eye looks.)
                if (depth + 1 < DEPTH) visit(to, through, depth + 1, [...path, to]);
            }
        };
        visit(key, null, 0, [key]);
        const most = Math.max(0, this.most - 1);
        const ranked = [...seen].sort((a, b) => a[1] - b[1]).map(([group]) => group);
        const kept = (this.plan?.keys ?? []).filter((group) => group !== key && joined.has(group) && !seen.has(group));
        const shown = [...ranked, ...kept].slice(0, most);
        const waiting = [...ahead].filter(([group]) => !seen.has(group)).sort((a, b) => a[1] - b[1]).map(([group]) => group);
        return { seen: shown, ahead: waiting.slice(0, AHEAD_MOST), beyond: Math.max(0, ranked.length - most) };
    }

    update(delta) {
        if (!this.supported) return;
        // Not asked for, nothing drawn live and nothing of it left to put away: nothing done.
        if (!this.wanted && !this.plan && !this.kept && !this.next) return;
        this.clock += delta;
        const wanted = this.wanted && !this.held && this.allowed;
        let choice = wanted ? this.choose() : { key: null, none: "off", room: null };
        // In no room — on a threshold, between two rooms' floors: the room just left stays live for a moment, until
        // the next room, or the garden, says otherwise.
        if (wanted && choice.none === "outdoors" && this.plan) {
            this.outside ??= this.clock;
            if (this.clock - this.outside < BETWEEN) choice = this.plan.choice;
        } else {
            this.outside = null;
        }
        this.choice = choice;
        const live = this.live;
        if (choice.key === null) {
            // Out of doors, from above, switched off: the bake's again.
            this.drop();
            this.sight = null;
            if (this.plan) this.uninstall();
        } else {
            // Lights its shaders were not built for — another time of day, another step of the slider: all of it made ready again first.
            if (this.plan && !live.fresh) {
                this.uninstall();
                this.made.clear();
            }
            // (The time of day on its way from one to the other — the house lit for the next, the sky still the last's: whatever was being made ready was for the last.)
            if (this.next && live.turning) this.drop();
            this.sight = this.look(choice.key);
            this.follow(choice, this.sight);
        }
        // Stepped into a room that is still the bake's for a moment (beyond what is shown at once): the baked rooms brought up for it from now.
        if (this.plan) live.aim(this.at?.room && !this.plan.zones.includes(this.at.room) && this.rooms.has(this.at.room) ? this.rooms.get(this.at.room) : null);
        if (this.wanted || this.plan) live.update(delta);
        // Turned off, and out: the shadow maps, the probe, the rooms staged and their textures given back.
        if (!this.wanted && !this.plan && this.kept) {
            live.release();
            this.made.clear();
            this.kept = false;
        }
        this.announce();
    }

    /**
     * What is shown and what is made ready brought in line with where the
     * visitor is and what they see (look): the groups to be shown —
     * theirs, and those in sight — and those behind the doors they are
     * near, each made ready in its turn, one at a time (LiveRoom.prepare);
     * and those of the first that are ready, shown (LiveRoom.show), which
     * leaves whatever was shown already exactly as it is.
     *
     * Where nothing is shown yet — the first press, a jump — the groups in
     * sight are made ready before the visitor's own, and that one with
     * them beside it (its probe and the sun's map are then drawn with all
     * of them): the view changes once, all of it together. Once something
     * is shown, the visitor's own comes first, then what is in sight, then
     * what may soon be.
     */
    follow(choice, sight) {
        const live = this.live;
        const good = (key) => {
            const set = this.made.get(key);
            if (!set) return null;
            if (live.staged.get(key) === set) return set;
            this.made.delete(key);
            return null;
        };
        // (With nothing shown, the visitor's own rooms are good to show only as they come from being made ready: their
        // probe and the sun's map are drawn then, and kept until the next is made ready — LiveRoom's `job`.)
        const ready = (key) => {
            const set = good(key);
            if (!set) return null;
            return this.plan || key !== choice.key || (live.job?.ready && live.job.set === set) ? set : null;
        };
        const waits = (key) => !ready(key) && !(this.failed.get(key) > this.clock - 3);
        const want = [choice.key, ...sight.seen];
        // What is being made ready is let go if nobody wants it any more — or if the visitor's own rooms wait behind it.
        if (this.next) {
            const wanted = want.includes(this.next.key) || sight.ahead.includes(this.next.key);
            if (!wanted || (this.plan && this.next.key !== choice.key && waits(choice.key))) this.drop();
        }
        // Made ready, but for lights that have changed since — a switch turned, the lamps come in: made ready again, twice
        // at most. Those waiting behind a shut door too, while they wait: found stale only in the frame its door started
        // to open, a room was shown a frame after it — a crack of the bake's room for that frame (by day, at seven doors
        // of a flat's twenty-one: a bathroom's lamp had come into the call's light since each was made ready).
        for (const key of [...want, ...sight.ahead]) {
            const set = good(key);
            if (set && !this.plan?.keys.includes(key) && live.stale(set) && this.again(key)) this.made.delete(key);
        }
        // (What was made ready and has been let go since — LiveRoom keeps only so many staged — is not kept here either.)
        for (const [key, set] of this.made) if (live.staged.get(key) !== set) this.made.delete(key);
        // Shown: the visitor's own once it is ready — everything in sight was made ready before it — and beside rooms shown already, whatever is.
        if (this.plan || ready(choice.key)) this.present(choice, want.map(ready).filter(Boolean));
        // Made ready next: the first that waits.
        if (this.next || live.turning) return;
        const order = this.plan ? [...want, ...sight.ahead] : [...sight.seen, choice.key, ...sight.ahead];
        const key = order.find(waits);
        if (key === undefined) return;
        const mine = key === choice.key;
        this.prepare(key, choice, this.plan ? {} : { first: mine, beside: mine ? sight.seen.map(good).filter(Boolean) : [] });
    }

    /** These groups shown, and no others (LiveRoom.show) — if they are not already; none of them, the bake's again. */
    present(choice, sets) {
        if (!sets.length) {
            if (this.plan) this.uninstall();
            return;
        }
        const mark = `${sets.map((set) => set.key).join(";")}|${choice.room}`;
        if (this.plan?.mark === mark) {
            this.plan.choice = choice;
            return;
        }
        if (!this.live.show(sets, this.rooms.get(choice.room))) {
            if (this.plan) this.uninstall();
            for (const set of sets) this.failed.set(set.key, this.clock);
            return;
        }
        if (this.plan && this.plan.key !== choice.key) this.stats.handovers++;
        if (!this.plan) this.stats.installs++;
        this.plan = { key: choice.key, keys: sets.map((set) => set.key), zones: sets.flatMap((set) => set.zones), mark, choice };
        this.kept = true;
        this.redone.clear();
    }

    /** Whether a group found stale as it was to be shown (LiveRoom.stale) is made ready once more: twice running at most — then it is shown, and what is missing built as it is. */
    again(key) {
        const count = (this.redone.get(key) ?? 0) + 1;
        this.redone.set(key, count);
        return count <= 2;
    }

    /** Whether rooms are being made ready now — frames that are no measure of the view (FrameGuard). */
    get busy() {
        return Boolean(this.next);
    }

    /** How many groups of rooms are drawn live at once, at most: the visitor's own and those in sight (LIVE_MOST, by the slider's step; set, a developer's own). */
    get most() {
        return this.cap ?? LIVE_MOST[QUALITY_STEP] ?? 1;
    }

    set most(count) {
        this.cap = count === null || count === undefined ? null : Math.max(1, Math.round(count));
    }

    /** A group of rooms made ready to be shown, a little a frame (LiveRoom.prepare): in `made` once it is. */
    prepare(key, choice, options = {}) {
        this.stats.prepares++;
        const next = (this.next = { key });
        // (What it makes — the rooms staged, a shadow map, a probe — is given back once it is switched off: update.)
        this.kept = true;
        const failed = () => {
            if (this.next !== next) return;
            this.next = null;
            this.failed.set(key, this.clock);
        };
        this.live.prepare(this.zonesOf.get(key), this.rooms.get(choice.room), options).then(
            (set) => {
                if (this.next !== next) return;
                if (!set) return failed();
                this.next = null;
                this.made.set(key, set);
            },
            (error) => {
                console.warn("The room could not be made ready to draw live", error);
                failed();
            }
        );
    }

    /** Whatever is being made ready let go. */
    drop() {
        if (!this.next) return;
        this.next = null;
        this.live.cancel();
    }

    /** The rooms back as their bake draws them. */
    uninstall() {
        if (!this.plan) return;
        this.plan = null;
        this.live.hide();
    }

    /** Before a frame is drawn (Renderer.render): what the room's own call needs drawn first (LiveRoom.draw). */
    draw() {
        if (this.plan) this.live.draw(this.experience.camera.activeCamera);
    }

    dispose() {
        if (!this.supported) return;
        this.drop();
        this.uninstall();
        this.live.dispose();
        this.stopQuality?.();
        this.world.off?.("room", this.onRoom);
        this.renderer.renderer.domElement.removeEventListener("webglcontextlost", this.onLost);
    }
}

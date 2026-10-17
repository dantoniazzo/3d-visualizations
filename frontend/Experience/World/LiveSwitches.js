import { EventEmitter } from "events";

import { FINISHES } from "../../../shared/catalog.js";
import { roomLinks } from "../../../shared/roomGraph.js";
import { darkRooms, doorsOut } from "../../../shared/daylight.js";
import { planStoreys, storeyName } from "../../../shared/storeys.js";
import { levelOf } from "./Switches.js";

/**
 * The light switches of a view lit live — the editor, its walkthrough, and
 * a version published without its light baked: a ceiling light's switch in
 * each room and one for each lamp of its own (Fittings.js's gatherLights,
 * or a published spec's `lights`), drawn live as they are turned on and
 * off (World/LampPool.js, World/RoomGlow.js) rather than from a bake.
 *
 * The same to the rest of the app as a baked view's switches (Switches.js):
 * `list`, `byId`, `floors`, `isOn`, `inRoom`, `set`, `setMany`, `toggle`,
 * `allOff`, a "change" event — so the lights panel, pointing at a light,
 * the room's key (Q) and the bird's-eye view work alike. Besides those,
 * `entries` (each switch's fittings and the rooms its light reaches),
 * `weights` (1 on, 0 off, by index), and what a lamp's light is seen
 * through (World/LampPool.js): what joins two rooms (`between`), the doors
 * with glass in them (`glazed`) and each room's doors to the outdoors
 * (`doorsOut`).
 *
 * Day and night each keep switches of their own, as a baked view's do: at
 * night every room's light starts on (its ceiling light, and the lamps on
 * the same switch), lamps with switches of their own off; by day
 * everything starts off — but for the rooms daylight does not reach
 * (shared/daylight.js: a bathroom, a lobby, a utility room without a
 * window), whose light starts on wherever the view is lit as a visitor sees
 * it (`daylight`: not under the editor's plain light, which lights every
 * room alike) — or every room's light on, for a space that has always been
 * drawn with its room lights on by day (`dayOn`). What starts on is how a
 * switch stands until it is turned by hand; from then on it is as it was
 * left. A visitor's switching is theirs alone: it is never part of the
 * scene, nor saved with it.
 *
 * Emits "change" whenever a switch, or the set shown, changes.
 */
export default class LiveSwitches extends EventEmitter {
    /**
     * @param {object} spec  the scene: its rooms, walls and floor openings
     * @param {object[]} lights  its light fittings, as gatherLights gives them
     * @param {object} [options]
     * @param {number[]} [options.levels]  the floors' elevations, lowest first
     * @param {boolean} [options.dayOn]  the rooms' lights on by day to start with
     * @param {boolean} [options.daylight]  by day, the lights of the rooms daylight does not reach on to start with (setDaylight)
     */
    constructor(spec, lights, { levels = null, dayOn = false, daylight = true } = {}) {
        super();
        this.dayOn = dayOn;
        this.daylight = daylight;
        /** variant -> switch id -> on or off, for each switch turned by hand: the others are as they start (startsOn). */
        this.states = new Map();
        this.variant = null;
        this.version = 0;
        this.weights = [];
        this.setLights(spec, lights, levels);
    }

    /**
     * The fittings again — after an edit in the editor moved a lamp, a door
     * or a wall — keeping every switch that is still there as it was.
     */
    setLights(spec, lights, levels = this.levels) {
        /** The fittings, as gatherLights gave them. */
        this.lights = lights || [];
        this.spec = spec;
        this.levels = levels?.length ? levels : [...new Set(spec.rooms.map((room) => room.elevation))].sort((a, b) => a - b);
        /** The storeys those levels make up (shared/storeys.js): the floors the switches are listed by. */
        this.storeys = planStoreys(spec.rooms, this.levels);
        const rooms = new Map(spec.rooms.map((room, order) => [room.id, { room, order }]));
        const indoor = spec.rooms.filter((room) => FINISHES[room.floor_finish]?.kind !== "ground");
        const { neighbours, links, linkKey } = roomLinks(spec, indoor);
        /** The rooms whose lights reach others through doors (what `zones` are made of). */
        this.indoor = new Set(indoor.map((room) => room.id));
        /** What joins each two of them that open into one another (between). */
        this.links = links;
        this.linkKey = linkKey;
        /** The rooms daylight does not reach, as the walls and windows stand now. */
        this.dark = darkRooms(spec);
        /** The doors with glass in them: light passes them shut. */
        this.glazed = new Set();
        for (const wall of spec.walls || []) {
            for (const opening of wall.openings || []) if (opening.type === "door" && opening.door?.glazed) this.glazed.add(opening.id);
        }
        /** Each room's doors with the outdoors behind them, by the room's id (shared/daylight.js). */
        this.doorsOut = doorsOut(spec);

        const bySwitch = new Map();
        for (const light of lights || []) {
            if (!bySwitch.has(light.switch)) bySwitch.set(light.switch, []);
            bySwitch.get(light.switch).push(light);
        }
        /** Each switch: its fittings, and the rooms its light reaches — its own and those it opens into. */
        this.entries = [...bySwitch.entries()].map(([id, fittings]) => {
            const first = fittings.find((light) => light.kind === "ceiling") ?? fittings[0];
            const room = first.room ?? null;
            return {
                id,
                kind: first.kind,
                label: first.label ?? id,
                room,
                lights: fittings,
                zones: room ? [room, ...(neighbours.get(room) ?? [])] : [],
            };
        });
        this.list = this.entries.map((entry, index) => {
            const { room, order = Infinity } = rooms.get(entry.room) ?? {};
            return {
                id: entry.id,
                index,
                kind: entry.kind,
                label: entry.label,
                room: room?.id ?? null,
                roomOrder: order,
                level: room ? this.storeys.ofLevel[levelOf(room.elevation, this.levels)] ?? 0 : 0,
            };
        });
        this.byId = new Map(this.list.map((item) => [item.id, item]));
        // A switch that is gone is forgotten; one that is new starts as its variant starts.
        for (const state of this.states.values()) {
            for (const id of [...state.keys()]) if (!this.byId.has(id)) state.delete(id);
        }
        this.apply();
    }

    /** The switches, floor by floor, each floor's room by room. */
    get floors() {
        const floors = new Map();
        for (const item of this.list) {
            if (!floors.has(item.level)) floors.set(item.level, []);
            floors.get(item.level).push(item);
        }
        const order = (a, b) => a.roomOrder - b.roomOrder || (a.kind === "ceiling" ? -1 : 0) - (b.kind === "ceiling" ? -1 : 0) || a.index - b.index;
        return [...floors.entries()].sort(([a], [b]) => a - b).map(([level, items]) => ({ level, switches: items.sort(order) }));
    }

    /**
     * A floor's name for the lights panel: "Ground floor", "First floor",
     * "Roof terrace"… — the storeys of all its buildings together, whatever
     * heights they stand at (shared/storeys.js).
     */
    floorName(level) {
        return storeyName(this.storeys, level);
    }

    /**
     * What joins two rooms that open into one another, way by way: a
     * door's id, or null for what always stands open — a doorway, a
     * stairwell, no wall at all (shared/roomGraph.js).
     *
     * @returns {(string|null)[]} none for two rooms that do not open into one another
     */
    between(a, b) {
        return this.links.get(this.linkKey(a, b)) ?? [];
    }

    /**
     * Whether a switch starts on: a room's light at night; by day where the
     * rooms were always lit, and — lit as a visitor sees it — in a room
     * daylight does not reach.
     */
    startsOn(variant, item) {
        if (item.kind !== "ceiling") return false;
        return variant === "night" || this.dayOn || (this.daylight && this.dark.has(item.room));
    }

    /**
     * Whether the view is lit as a visitor sees it, where a room without
     * daylight is dark by day — its light then starts on — or evenly, as
     * the editor's plain light draws every room: they start off. Only the
     * switches nobody has turned follow.
     */
    setDaylight(on) {
        on = Boolean(on);
        if (on === this.daylight) return;
        this.daylight = on;
        this.apply();
    }

    isOn(id) {
        const state = this.states.get(this.variant);
        const item = this.byId.get(id);
        if (!state || !item) return false;
        return state.get(id) ?? this.startsOn(this.variant, item);
    }

    /** A room's switches — its ceiling light's, and its lamps' of their own — by the room's id (none for null). */
    inRoom(roomId) {
        return roomId ? this.list.filter((item) => item.room === roomId) : [];
    }

    /** Get ready to show `variant`: its switches as they were left, or as it starts. */
    async prepare(variant) {
        if (!this.states.has(variant)) this.states.set(variant, new Map());
    }

    /** Show `variant`'s switches (after prepare). */
    useVariant(variant) {
        if (!this.states.has(variant)) this.prepare(variant);
        this.variant = variant;
        this.apply();
    }

    /** Turn a switch on or off. */
    async set(id, on) {
        const state = this.states.get(this.variant);
        if (!state || !this.byId.has(id)) return;
        state.set(id, Boolean(on));
        this.apply();
    }

    toggle(id) {
        return this.set(id, !this.isOn(id));
    }

    /** Turn several switches on or off at once — a room's (the Q key): one change, not one a switch. */
    async setMany(ids, on) {
        const state = this.states.get(this.variant);
        const known = ids.filter((id) => this.byId.has(id));
        if (!state || !known.length) return;
        for (const id of known) state.set(id, Boolean(on));
        this.apply();
    }

    /** Every switch off. */
    allOff() {
        const state = this.states.get(this.variant);
        if (!state) return;
        for (const item of this.list) state.set(item.id, false);
        this.apply();
    }

    /** Every switch on. */
    allOn() {
        const state = this.states.get(this.variant);
        if (!state) return;
        for (const item of this.list) state.set(item.id, true);
        this.apply();
    }

    apply() {
        this.weights = this.list.map((item) => (this.isOn(item.id) ? 1 : 0));
        this.version++;
        this.emit("change");
    }
}

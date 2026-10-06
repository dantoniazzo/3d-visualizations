import { EventEmitter } from "events";

import { FINISHES } from "../../../shared/catalog.js";
import { roomLinks } from "../../../shared/roomGraph.js";
import { floorName, levelOf } from "./Switches.js";

/**
 * The light switches of a view lit live — the editor, its walkthrough, and
 * a version published without its light baked: a ceiling light's switch in
 * each room and one for each lamp of its own (Fittings.js's gatherLights,
 * or a published spec's `lights`), drawn live as they are turned on and
 * off (World/LampPool.js, World/RoomGlow.js) rather than from a bake.
 *
 * The same to the rest of the app as a baked view's switches (Switches.js):
 * `list`, `byId`, `floors`, `isOn`, `set`, `toggle`, `allOff`, a "change"
 * event — so the lights panel, pointing at a light and the bird's-eye view
 * work alike. Besides those, `entries` (each switch's fittings and the
 * rooms its light reaches) and `weights` (1 on, 0 off, by index).
 *
 * Day and night each keep switches of their own, as a baked view's do: at
 * night every room's light starts on (its ceiling light, and the lamps on
 * the same switch), lamps with switches of their own off; by day
 * everything starts off — or the rooms' lights on, for a space that has
 * always been drawn with its room lights on by day (`dayOn`). A visitor's
 * switching is theirs alone: it is never part of the scene, nor saved with
 * it.
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
     */
    constructor(spec, lights, { levels = null, dayOn = false } = {}) {
        super();
        this.dayOn = dayOn;
        /** variant -> the ids of the switches on. */
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
        const rooms = new Map(spec.rooms.map((room, order) => [room.id, { room, order }]));
        const indoor = spec.rooms.filter((room) => FINISHES[room.floor_finish]?.kind !== "ground");
        const { neighbours } = roomLinks(spec, indoor);
        /** The rooms whose lights reach others through doors (what `zones` are made of). */
        this.indoor = new Set(indoor.map((room) => room.id));

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
                level: room ? levelOf(room.elevation, this.levels) : 0,
            };
        });
        this.byId = new Map(this.list.map((item) => [item.id, item]));
        // A switch that is gone is forgotten; one that is new starts as its variant starts.
        for (const [variant, state] of this.states) {
            const known = state.known;
            for (const id of [...state]) if (!this.byId.has(id)) state.delete(id);
            for (const item of this.list) if (!known.has(item.id) && this.startsOn(variant, item)) state.add(item.id);
            state.known = new Set(this.list.map((item) => item.id));
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
     * A floor's name for the lights panel: "Ground floor", "First floor"…
     * for one house; where buildings stand at different heights (a floor
     * of one is not the same floor of another), its height instead.
     */
    floorName(level) {
        return floorName(level, this.levels);
    }

    /** Whether a switch starts on: a room's light at night, or by day where the rooms were always lit. */
    startsOn(variant, item) {
        return item.kind === "ceiling" && (variant === "night" || this.dayOn);
    }

    isOn(id) {
        return Boolean(this.states.get(this.variant)?.has(id));
    }

    /** Get ready to show `variant`: its switches as they were left, or as it starts. */
    async prepare(variant) {
        if (!this.states.has(variant)) {
            const state = new Set(this.list.filter((item) => this.startsOn(variant, item)).map((item) => item.id));
            state.known = new Set(this.list.map((item) => item.id));
            this.states.set(variant, state);
        }
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
        if (on) state.add(id);
        else state.delete(id);
        this.apply();
    }

    toggle(id) {
        return this.set(id, !this.isOn(id));
    }

    /** Every switch off. */
    allOff() {
        this.states.get(this.variant)?.clear();
        this.apply();
    }

    /** Every switch on. */
    allOn() {
        const state = this.states.get(this.variant);
        if (!state) return;
        for (const item of this.list) state.add(item.id);
        this.apply();
    }

    apply() {
        const state = this.states.get(this.variant) ?? new Set();
        this.weights = this.list.map((item) => (state.has(item.id) ? 1 : 0));
        this.version++;
        this.emit("change");
    }
}

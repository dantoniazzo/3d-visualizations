import { EventEmitter } from "events";

import { chromaURL, lightmapURL, ownLayer } from "../Utils/device.js";
import { loadBakedTexture } from "../Utils/bakedTexture.js";
import { planStoreys, storeyName } from "../../../shared/storeys.js";
import { darkRooms } from "../../../shared/daylight.js";
import { roomLinks } from "../../../shared/roomGraph.js";
import { distinguish } from "./Fittings.js";

/** How many switches' layers are drawn at a time as they land after a view's first light (bringIn). */
const BATCH = 6;

/**
 * The light switches of a public view whose fittings were baked switch by
 * switch (blender/bake_public.py): a ceiling light's switch in each room,
 * and one for each lamp (Fittings.js).
 *
 * Each switch's light was baked on its own, room by room; turning it on
 * adds that light to the day's or the night's (SceneBuilder's
 * setSwitchLight). Its lightmap layers are only downloaded the first time
 * it is turned on — a few kilobytes a room.
 *
 * Day and night each keep switches of their own, so the two can be
 * compared as they were left: at night every room's ceiling light starts
 * on; by day every light starts off, but for the ceiling lights of the
 * rooms daylight does not reach (shared/daylight.js: a bathroom, a lobby, a
 * utility room without a window), which were black to walk into and black
 * patches from above. A visitor turns those off like any other.
 *
 * A view's first light waits only for the switches whose light is seen from
 * where its visitor starts (prepare's `from`); the others' layers — by day
 * those rooms', all over the house, a hundred small files — are asked for
 * once the first frame is drawn, the nearest rooms' first (bringIn).
 *
 * Emits "change" whenever a switch, or the set shown, changes.
 */
export default class Switches extends EventEmitter {
    /**
     * @param {SceneBuilder} sceneBuilder  drawing the published view, baked
     * @param {object} published  the published version: its `lighting`, as
     *        the bake left it, its spec's lights and rooms, and its floors
     */
    constructor(sceneBuilder, published) {
        super();
        this.sceneBuilder = sceneBuilder;
        const entries = published.lighting.switches;
        const spec = published.spec;
        this.spec = spec;
        const lights = new Map();
        for (const light of spec.lights || []) if (!lights.has(light.switch)) lights.set(light.switch, light);
        const rooms = new Map(spec.rooms.map((room, order) => [room.id, { room, order }]));
        const levels = published.levels?.length ? published.levels : [...new Set(spec.rooms.map((room) => room.elevation))].sort((a, b) => a - b);
        /** The storeys those levels make up (shared/storeys.js): the floors the switches are listed by. */
        this.storeys = planStoreys(spec.rooms, levels);

        /** Every switch, in the order the bake lists them. */
        this.list = entries.map((entry, index) => {
            const light = lights.get(entry.id);
            const kind = light?.kind ?? entry.id.split(":")[0];
            const { room, order = Infinity } = rooms.get(light?.room) ?? {};
            return {
                id: entry.id,
                index,
                kind,
                label: entry.label ?? light?.label ?? entry.id,
                room: room?.id ?? null,
                roomOrder: order,
                level: room ? this.storeys.ofLevel[levelOf(room.elevation, levels)] ?? 0 : 0,
            };
        });
        // Switches called alike told apart (a version baked before they were: Fittings.js).
        const named = distinguish(this.list.map((item) => ({ switch: item.id, kind: item.kind, room: item.room, label: item.label })));
        named.forEach((light, i) => (this.list[i].label = light.label));
        this.byId = new Map(this.list.map((item) => [item.id, item]));
        /** The rooms daylight does not reach: their ceiling lights start on by day too. */
        this.dark = darkRooms(spec);

        /** The rooms each switch's layers are drawn in, as the view laid them out. */
        this.zones = this.list.map(() => []);
        for (const [zone, layers] of sceneBuilder.switchLayers) {
            for (const { index } of layers) this.zones[index].push(zone);
        }
        this.entries = entries;

        /** variant -> the ids of the switches on. */
        this.states = new Map();
        this.variant = null;
        /** `${switch}|${zone}` -> { luma, chroma }, once loaded. */
        this.textures = new Map();
        /** switch index -> the promise of its layers loading. */
        this.loading = new Map();
        /** The switches on at a view's first light whose layers were not waited for (prepare): `{ variant, indices }`, the nearest first, until bringIn asks for them. */
        this.waiting = null;
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

    /** A floor's name for the lights panel, as the bird's-eye view's floor picker has it (shared/storeys.js). */
    floorName(level) {
        return storeyName(this.storeys, level);
    }

    isOn(id) {
        return Boolean(this.states.get(this.variant)?.has(id));
    }

    /** A room's switches — its ceiling light's, and its lamps' of their own — by the room's id (none for null). */
    inRoom(roomId) {
        return roomId ? this.list.filter((item) => item.room === roomId) : [];
    }

    /** Whether a switch starts on: a room's ceiling light at night, and by day in a room daylight does not reach. */
    startsOn(variant, item) {
        return item.kind === "ceiling" && (variant === "night" || this.dark.has(item.room));
    }

    /**
     * Get ready to show `variant`: its switches as they were left, or as
     * it starts, and the layers of those on, loaded — so the day's or the
     * night's light and its switches' change together (World.setLighting).
     *
     * `from`, for a view's first light: where its visitor stands. Only the
     * switches whose light is seen from there are then waited for (seen);
     * the others stay on, unlit, until bringIn has their layers — the
     * first frame is not kept back for rooms out of sight.
     *
     * @param {string} variant
     * @param {object} [options]
     * @param {{ room: string|null, point: number[] }} [options.from]  the room the visitor is in (null out of every room) and where, as [x, y, z]
     */
    async prepare(variant, { from = null } = {}) {
        if (!this.states.has(variant)) {
            const on = this.list.filter((item) => this.startsOn(variant, item)).map((item) => item.id);
            this.states.set(variant, new Set(on));
        }
        let on = [...this.states.get(variant)].map((id) => this.byId.get(id).index);
        if (from) {
            const near = this.lookedInto(from.room);
            const later = on.filter((index) => !this.loading.has(index) && !this.seen(index, near));
            on = on.filter((index) => !later.includes(index));
            const far = new Map(later.map((index) => [index, this.distance(index, from.point)]));
            later.sort((a, b) => far.get(a) - far.get(b));
            this.waiting = later.length ? { variant, indices: later } : null;
        }
        await Promise.all(on.map((index) => this.load(index)));
    }

    /**
     * The layers a view's first light did not wait for (prepare's `from`):
     * asked for now, the nearest rooms' first, and drawn as they land, a
     * few switches at a time — where the house's light is resolved into
     * one lightmap, its rooms nearest the visitor first again
     * (World/LightResolver.js).
     */
    async bringIn() {
        const waiting = this.waiting;
        this.waiting = null;
        if (!waiting) return;
        const loads = waiting.indices.map((index) => this.load(index));
        for (let k = 0; k < loads.length; k += BATCH) {
            await Promise.all(loads.slice(k, k + BATCH));
            // (Another time of day shown meanwhile has loaded its own; this one's are here when it is shown again.)
            if (this.variant === waiting.variant) this.apply();
        }
    }

    /**
     * Whether a switch's light is seen from where the visitor starts: it
     * reaches (reaches) a room they are in or look into (`near`), or one
     * that is seen from anywhere through its windows: any room but those
     * daylight does not reach, which have none (a loft open to the landing
     * below lights the landing's window from the street).
     */
    seen(index, near) {
        return this.zones[index].some((zone) => (near.has(zone) || !this.dark.has(zone)) && this.reaches(index, zone));
    }

    /**
     * Whether any of a switch's light reaches `zone` with the doors as
     * they stand: none does in a room it lights through doors alone (the
     * bake's `through`) while they are all shut — asked of the doors
     * themselves, since the view's own count of how open each is
     * (SceneBuilder.switchReach) starts with its first frame.
     */
    reaches(index, zone) {
        const ids = this.entries[index].through?.[zone];
        if (!ids?.length) return true;
        const doors = this.sceneBuilder.doors || [];
        return ids.some((id) => {
            const door = doors.find((candidate) => candidate.spec.id === id);
            return !door || door.open > 0 || door.target > 0.5;
        });
    }

    /**
     * The rooms seen from `room`: itself, every room an opening joins it
     * to — a door too, shut as it may be: the one room on costs little to
     * wait for — and on from those through whatever always stands open (a
     * doorway, a stairwell, no wall at all), as far as that goes. None from
     * out of every room.
     *
     * @param {string|null} room
     * @returns {Set<string>}
     */
    lookedInto(room) {
        const seen = new Set();
        if (!room) return seen;
        const { neighbours, joined, links, linkKey } = roomLinks(this.spec, this.spec.rooms);
        seen.add(room);
        const queue = [...(joined.get(room) ?? [])];
        for (const next of queue) {
            if (seen.has(next)) continue;
            seen.add(next);
            for (const further of neighbours.get(next) ?? []) {
                if (!seen.has(further) && links.get(linkKey(next, further))?.includes(null)) queue.push(further);
            }
        }
        return seen;
    }

    /** How far a switch's own room is from `point` ([x, y, z]), a storey counting for more than its height: for the nearest first. */
    distance(index, point) {
        const room = this.spec.rooms.find((candidate) => candidate.id === this.list[index].room);
        if (!room) return Infinity;
        const xs = room.polygon.map((corner) => corner[0]);
        const zs = room.polygon.map((corner) => corner[1]);
        const dx = (Math.min(...xs) + Math.max(...xs)) / 2 - point[0];
        const dz = (Math.min(...zs) + Math.max(...zs)) / 2 - point[2];
        return Math.hypot(dx, dz, ((room.elevation ?? 0) - point[1]) * 3);
    }

    /** Show `variant`'s switches (after prepare). */
    useVariant(variant) {
        this.variant = variant;
        this.apply();
    }

    /** Turn a switch on or off, once its light has loaded. */
    async set(id, on) {
        const state = this.states.get(this.variant);
        const item = this.byId.get(id);
        if (!state || !item) return;
        if (on) state.add(id);
        else state.delete(id);
        // Shown as it is asked for; lit as soon as its light is here.
        this.emit("change");
        if (on) await this.load(item.index);
        this.apply();
    }

    toggle(id) {
        return this.set(id, !this.isOn(id));
    }

    /**
     * Turn several switches on or off at once — a room's (the Q key): shown
     * as asked at once, as set's are, and lit together, once all of their
     * light is here — one change, not one a switch.
     *
     * @param {string[]} ids
     * @param {boolean} on
     */
    async setMany(ids, on) {
        const state = this.states.get(this.variant);
        const items = ids.map((id) => this.byId.get(id)).filter(Boolean);
        if (!state || !items.length) return;
        for (const { id } of items) {
            if (on) state.add(id);
            else state.delete(id);
        }
        this.emit("change");
        if (on) await Promise.all(items.map((item) => this.load(item.index)));
        this.apply();
    }

    /** Every switch off. */
    allOff() {
        this.states.get(this.variant)?.clear();
        this.apply();
        this.emit("change");
    }

    apply() {
        const state = this.states.get(this.variant) ?? new Set();
        const weights = this.list.map((item) => (state.has(item.id) && this.loaded(item.index) ? 1 : 0));
        this.sceneBuilder.setSwitchLight(weights, this.textures);
        this.emit("change");
    }

    loaded(index) {
        const indirect = this.sceneBuilder.liveLight ? this.entries[index].indirect?.layers : null;
        return this.zones[index].every(
            (zone) => this.textures.has(`${index}|${zone}`) && (!indirect?.[zone] || this.textures.has(`${index}|${zone}|indirect`))
        );
    }

    /**
     * A switch's layers, in every room the view draws them in — and, lit
     * live, what its lamps bounce there, for when they are lit live
     * (LiveLamps): all of its light is still needed for when they are not.
     */
    load(index) {
        if (!this.loading.has(index)) {
            const entry = this.entries[index];
            const live = this.sceneBuilder.liveLight && entry.indirect;
            const layer = async (files, key) => {
                const [luma, chroma] = await Promise.all([loadBakedTexture(lightmapURL(files)), loadBakedTexture(chromaURL(files))]);
                this.textures.set(key, { luma, chroma });
            };
            // (Where the house's light is resolved, a room's layer held its own way in place of the one at the switch's scale.)
            const own = (files) => (this.sceneBuilder.resolver && ownLayer(files)) || files;
            const promise = Promise.all(
                this.zones[index].flatMap((zone) => [
                    layer(own(entry.layers[zone]), `${index}|${zone}`),
                    ...(live && entry.indirect.layers?.[zone] ? [layer(entry.indirect.layers[zone], `${index}|${zone}|indirect`)] : []),
                ])
            ).catch((error) => {
                // Tried again the next time it is turned on.
                this.loading.delete(index);
                console.warn(`Light switch ${this.entries[index].id} did not load`, error);
            });
            this.loading.set(index, promise);
        }
        return this.loading.get(index);
    }
}

/** Which of the floor `levels` (their heights, lowest first) a room at `elevation` is on. */
export function levelOf(elevation, levels) {
    let level = 0;
    levels.forEach((height, i) => {
        if (elevation >= height - 0.05) level = i;
    });
    return level;
}

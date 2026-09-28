import { EventEmitter } from "events";
import * as THREE from "three";

import { chromaURL, lightmapURL } from "../Utils/device.js";

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
 * compared as they were left: by day every light starts off, and at night
 * every room's ceiling light starts on.
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
        const lights = new Map();
        for (const light of spec.lights || []) if (!lights.has(light.switch)) lights.set(light.switch, light);
        const rooms = new Map(spec.rooms.map((room, order) => [room.id, { room, order }]));
        const levels = published.levels?.length ? published.levels : [...new Set(spec.rooms.map((room) => room.elevation))].sort((a, b) => a - b);

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
                level: room ? levelOf(room.elevation, levels) : 0,
            };
        });
        this.byId = new Map(this.list.map((item) => [item.id, item]));

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
        this.loader = new THREE.TextureLoader();
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

    isOn(id) {
        return Boolean(this.states.get(this.variant)?.has(id));
    }

    /**
     * Get ready to show `variant`: its switches as they were left, or as
     * it starts, and the layers of those on, loaded — so the day's or the
     * night's light and its switches' change together (World.setLighting).
     */
    async prepare(variant) {
        if (!this.states.has(variant)) {
            const on = variant === "night" ? this.list.filter((item) => item.kind === "ceiling").map((item) => item.id) : [];
            this.states.set(variant, new Set(on));
        }
        await Promise.all([...this.states.get(variant)].map((id) => this.load(this.byId.get(id).index)));
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
        return this.zones[index].every((zone) => this.textures.has(`${index}|${zone}`));
    }

    /** A switch's layers, in every room the view draws them in. */
    load(index) {
        if (!this.loading.has(index)) {
            const layers = this.entries[index].layers;
            const promise = Promise.all(
                this.zones[index].map(async (zone) => {
                    const layer = layers[zone];
                    const [luma, chroma] = await Promise.all([
                        this.loader.loadAsync(lightmapURL(layer)),
                        this.loader.loadAsync(chromaURL(layer)),
                    ]);
                    this.textures.set(`${index}|${zone}`, { luma, chroma });
                })
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

/** Which floor a room at `elevation` is on, of floors at `levels`. */
function levelOf(elevation, levels) {
    let level = 0;
    levels.forEach((height, i) => {
        if (elevation >= height - 0.05) level = i;
    });
    return level;
}

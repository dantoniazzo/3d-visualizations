import { EventEmitter } from "events";
import * as THREE from "three";

import Experience from "../Experience.js";
import SceneBuilder from "./SceneBuilder.js";
import Environment from "./Environment.js";
import Collision from "./Collision.js";
import Player from "./Player/Player.js";
import BirdView from "./BirdView.js";
import Switches from "./Switches.js";
import LiveLamps from "./LiveLamps.js";
import LiveSwitches from "./LiveSwitches.js";
import LampPool from "./LampPool.js";
import RoomGlow from "./RoomGlow.js";
import LiveBulbs from "./LiveBulbs.js";
import { distinguish, gatherLights, markBulbs } from "./Fittings.js";
import ProbeLight from "./ProbeLight.js";
import Scenery from "./Scenery.js";
import People from "./People.js";
import Vegetation from "./Vegetation/Vegetation.js";
import Flora from "./Flora/Flora.js";
import Sky from "./Sky.js";
import { chromaURL, doorStatesURL, lightingMode, lightmapURL, movingShadowsOnly, sunMaskURL } from "../Utils/device.js";
import { groundGradient } from "../../../shared/vegetation.js";
import { hasLandscape } from "../../../shared/landscape.js";

export default class World extends EventEmitter {
    constructor() {
        super();

        this.experience = new Experience();
        this.resources = this.experience.resources;
        this.spec = this.experience.sceneSpec;

        // Stands in for an octree everywhere one was passed before: the
        // player and the car ask it the same questions.
        this.collision = new Collision();
        this.octree = this.collision;
        this.player = null;

        this.resources.on("ready", () => {
            if (this.player) return;

            // A published version's runtime file stands in for building the house.
            const runtime = this.experience.publicView ? this.resources.items.publishedRuntime : null;
            this.sceneBuilder = new SceneBuilder(this.spec, { runtime });
            this.environment = new Environment(this.spec);
            this.player = new Player();
            if (hasLandscape(this.spec)) {
                // A site of its own: its sky, lit live by day and at night,
                // and its trees, hedges and grasses (World/Flora).
                this.sky = new Sky(this, this.spec.landscape.sky || {});
                this.lighting = "day";
                this.vegetation = new Flora(this);
                this.sky.ready.then(() => this.emit("lighting", "day"));
            } else {
                // The garden: grass on the lawns, trees on the bigger ones.
                this.vegetation = new Vegetation(this);
            }

            if (this.experience.publicView) {
                // Nothing will move but the doors, the car and the people, so
                // everything else is drawn merged once the furniture is in —
                // from the published snapshot when there is one. (The people
                // are made after the merge, outside the builder's root, so
                // nothing merged or batched ever holds them.)
                this.sceneBuilder.furnitureReady.then(() => {
                    const published = this.experience.published;
                    const snapshot = this.resources.items.publishedView;
                    const lighting = published?.lighting;
                    if (!snapshot) {
                        // The light fittings, found and their glass marked
                        // before the rest is merged round them.
                        const lights = gatherLights(this.sceneBuilder);
                        markBulbs(this.sceneBuilder, lights);
                        this.sceneBuilder.optimizeForViewing();
                        // What was merged, lit as a room's surfaces are.
                        if (this.sky?.current) this.sky.applyIndoor();
                        this.startLiveLights(lights);
                    } else {
                        // All of its light from the bake, or the sun and the
                        // lamps live on top of the rest of it.
                        this.lightingMode = lighting ? lightingMode(lighting) : null;
                        const live = this.lightingMode === "live";
                        // Fully baked: nothing drawn live at all.
                        const still = this.lightingMode === "static";
                        // Drawn from the bake, as on a phone: what moves still
                        // shades the sun in the house, and the light probes
                        // light it, when the bake has them.
                        const shade = movingShadowsOnly(lighting);
                        const probes = Boolean(lighting?.probes) && !still;
                        const doors = !still;
                        // What is about to be copied, as it is without a room
                        // probe's light — a copy keeps the probe's map, which
                        // goes when the probe does — and, drawn from the bake,
                        // nothing else the live path took on (Realism.js).
                        this.sky?.useProbe(null);
                        // ...and without the rooms' night glow, which lit live they glow with one by one.
                        if (!lighting) this.sky?.glowIndoors(false);
                        if (lighting) this.experience.renderer.realism.releaseLive();
                        this.sceneBuilder.usePublishedView(snapshot, lighting, { ...published.options, live, shade, probes, doors });
                        // Lit live, the copies drawn take the sky's light as the
                        // originals did, and the light fittings are switched
                        // live, as in the editor.
                        if (!lighting && this.sky?.current) this.sky.applyIndoor();
                        if (!lighting) {
                            // A version published before its fittings were
                            // listed: found in what was built from its spec.
                            const listed = published?.spec?.lights;
                            // (Named apart, if it was published before they were.)
                            const lights = listed?.length ? distinguish(listed.map((light) => ({ ...light }))) : gatherLights(this.sceneBuilder);
                            if (!listed) markBulbs(this.sceneBuilder, lights);
                            this.startLiveLights(lights);
                        }
                        if (lighting) {
                            // The room lights are in the lightmaps now.
                            if (this.sceneBuilder.lights) this.sceneBuilder.lights.visible = false;
                            this.environment.useBaked(lighting.view, { live: this.sceneBuilder.liveLight, shade, probes, still });
                            // Its light switches, when its fittings were baked apart.
                            if (lighting.switches?.length && lighting.variants) {
                                this.switches = new Switches(this.sceneBuilder, published);
                                this.switches.on("change", () => this.emit("switches", this.switches));
                                // Each light, and its switch on the wall, to point at.
                                const lights = distinguish((published.spec.lights || []).map((light) => ({ ...light }))).filter((light) => this.switches.byId.has(light.switch));
                                this.sceneBuilder.buildLightTargets(lights);
                            }
                            // Lit live: the lamps that are on nearest the
                            // visitor, and when the shadows are drawn again.
                            // Drawn from the bake, only the sun's shadow of what moves.
                            if (this.sceneBuilder.liveLight) this.lamps = new LiveLamps(this);
                            else if (this.sceneBuilder.sunShade) this.lamps = new LiveLamps(this, { lamps: 0, sway: false });
                            // ...and the light probes that light the people and the car.
                            if (probes) this.loadProbes(lighting.probes, { sunFromProbes: !this.sceneBuilder.liveLight });
                            // How much of each room's light stays as its doors shut.
                            if (doors && lighting.doorStates) this.loadDoorStates(lighting.doorStates);
                            this.setLighting("day").then(() => {
                                if (this.switches) this.emit("switches-ready", this.switches);
                            });
                        }
                    }
                    // The people round the property, from the published spec's
                    // list (World/People.js): drawn live over the view, lit
                    // live or baked, never part of what was merged, published
                    // or baked — they move. Fewer on a phone (the quality
                    // step's `people`); none downloaded while this visitor
                    // keeps them hidden (the "people" scenery).
                    this.people = new People(this, { shown: !this.experience.hiddenScenery.has("people") });
                    // The scenery its visitor can hide, as they last left it.
                    this.scenery = new Scenery(this, this.experience.hiddenScenery);
                    this.emit("scenery-ready", this.scenery);
                    // From opening the page, for the ?stats readout.
                    this.readyIn = { ms: performance.now(), built: !runtime };
                    // Each floor from above, once its meshes say which floor they are.
                    this.birdView = new BirdView(this, published?.birdView, published?.levels);
                    this.experience.camera.birdView = this.birdView;
                    this.emit("bird-ready", this.birdView.floors.length);
                });
            } else {
                // The editor is a chunk of its own, so a public view never
                // downloads it.
                import("../Editor/Editor.js").then(({ default: Editor }) => {
                    if (!this.disposed) this.editor = new Editor();
                });
                // The people round the property, from the spec's own list
                // (World/People.js): the editor's to move, add and take away.
                this.people = new People(this);
                // Its light fittings switched live, once the furniture — its
                // lamps among it — is in; found again after every edit.
                this.on("furniture-ready", () => {
                    if (this.liveLights) return this.refreshLiveLights();
                    const lights = gatherLights(this.sceneBuilder);
                    markBulbs(this.sceneBuilder, lights);
                    this.startLiveLights(lights);
                });
                // Built again while a door or window is dragged along its
                // wall: their glass lit as its switch is, at every step.
                this.on("fittings-rebuilt", (group) => {
                    if (!this.liveLights) return;
                    markBulbs(this.sceneBuilder, []);
                    this.bulbs.collect(group);
                });
                this.on("scene-edited", () => {
                    // What was built again lit as its switch is at once
                    // (a ceiling light's glass, a lamp's shade); the
                    // fittings found again once the edits pause.
                    if (this.liveLights) {
                        markBulbs(this.sceneBuilder, this.switches.lights);
                        this.bulbs.collect(this.experience.scene);
                    }
                    clearTimeout(this.lightsTimer);
                    this.lightsTimer = setTimeout(() => this.refreshLiveLights(), 400);
                });
            }

            this.player.setInteractionObjects(this.sceneBuilder.getInteractiveObjects());

            // Enough to stop the third-person boom pushing through the
            // structure, without raycasting every teacup.
            this.experience.camera.setCollisionObjects(
                this.sceneBuilder.getCameraObstacles()
            );
            // Without the house built, the walls are only in the collision tree.
            if (runtime) this.experience.camera.setCollisionTree(this.collision);

            this.emit("ready", {
                rooms: this.spec.rooms,
                spawns: this.spec.spawns,
            });
        });
    }

    /** Teleport the visitor to a named spawn point. */
    goToSpawn(index) {
        if (!this.player) return;
        const spawn = this.spec.spawns[index];
        if (spawn) this.player.teleport(spawn);
    }

    /** Drop the visitor into the middle of a room by id. */
    goToRoom(roomId) {
        if (!this.player) return;
        const room = this.spec.rooms.find((r) => r.id === roomId);
        if (!room) return;

        const centre = room.polygon.reduce(
            (acc, [x, z]) => [acc[0] + x, acc[1] + z],
            [0, 0]
        );

        this.player.teleport({
            position: [
                centre[0] / room.polygon.length,
                room.elevation,
                centre[1] / room.polygon.length,
            ],
            yaw: 0,
        });
    }

    /**
     * Day or night, in a public view whose lighting has been baked. The
     * night lightmap is only downloaded the first time it is asked for;
     * so are the lights that come on with it (Switches), and the two
     * change together.
     *
     * @returns {Promise<boolean>} whether it changed
     */
    async setLighting(variant) {
        const info = this.experience.published?.lighting?.variants?.[variant];
        const baked = this.sceneBuilder?.baked;
        if (!baked && this.sky) return this.setSkyLighting(variant);
        if (!baked && this.liveLights) return this.setLiveLighting(variant);
        if (!info || !baked) return false;
        // Lit live, the house takes all of its light but the sun's straight
        // light from the bake: a lightmap of its own, its thin faces' light
        // and its doors' without it.
        const live = this.sceneBuilder.liveLight && info.indirect;
        this.lightmaps ??= new Map();
        if (!this.lightmaps.has(variant)) {
            // Its brightness, and its colour when that is apart from it.
            const load = (name, url) => {
                const preloaded = this.resources.items[name];
                if (preloaded) return Promise.resolve(preloaded);
                return url ? new THREE.TextureLoader().loadAsync(url) : Promise.resolve(null);
            };
            this.lightmaps.set(
                variant,
                Promise.all([
                    load(`lightmap:${variant}`, lightmapURL(info)),
                    load(`lightmap:${variant}:chroma`, chromaURL(info)),
                    live ? load(`lightmap:${variant}:indirect`, lightmapURL(info.indirect)) : null,
                    live ? load(`lightmap:${variant}:indirect:chroma`, chromaURL(info.indirect)) : null,
                ])
            );
        }
        // Under a site's own sky, its picture and light for the variant
        // too, so that the light, the sky and the sun change together.
        const sky = this.sky?.prepare(variant);
        const [[texture, chroma, softTexture, softChroma]] = await Promise.all([this.lightmaps.get(variant), this.switches?.prepare(variant), sky]);
        if (live) {
            this.sceneBuilder.setLightingVariant(softTexture, { ...info, ...info.indirect }, softChroma);
            // The grass still reads all of the ground's light, sun and all.
            this.sceneBuilder.prepareLightmaps(texture, info, chroma);
        } else {
            this.sceneBuilder.setLightingVariant(texture, info, chroma);
        }
        // Drawn from the bake, the sun's share of the light, for what moves to shade.
        const shade = this.sceneBuilder.sunShade && info.sun?.mask;
        if (shade) {
            this.sunMasks ??= new Map();
            if (!this.sunMasks.has(variant)) {
                // Without it, what moves shades nothing; the light is as baked.
                const mask = new THREE.TextureLoader().loadAsync(sunMaskURL(info.sun)).catch((error) => {
                    console.warn("The sun's mask did not load", error);
                    return null;
                });
                this.sunMasks.set(variant, mask);
            }
            const mask = await this.sunMasks.get(variant);
            if (mask) this.sceneBuilder.setSunShade(mask, info.sun);
        }
        this.switches?.useVariant(variant);
        // Under a site's own sky, the sky first — its picture, its haze, its
        // light on what is drawn live, the bloom — then the bake's light
        // over it (Environment.setVariant): whichever came last would
        // otherwise set the sun and the exposure.
        if (this.sky) {
            try {
                await this.sky.setVariant(variant);
            } catch (error) {
                // Without it, the bake's light and the preset's sky.
                console.warn("The sky did not load", error);
            }
        }
        this.environment.setVariant(variant, live || shade ? info.sun : null);
        // The grass lit by the lawn under it, the trees by the bake's sun and sky.
        this.vegetation?.useGroundLight(this.sceneBuilder, info, texture, chroma);
        this.vegetation?.setLight(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /**
     * Day or night under a site's own sky, lit live (World/Sky.js): the
     * sky and the sun, and with them the garden — its lights, the pool's
     * glow, the windows (World/Flora).
     */
    async setSkyLighting(variant) {
        await this.sky.setVariant(variant);
        if (this.liveLights) {
            await this.switches.prepare(variant);
            this.switches.useVariant(variant);
        }
        this.vegetation?.setLight?.(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /**
     * The light fittings of a view lit live — the editor, its walkthrough,
     * a version published without its light baked — switched on and off
     * live (World/LiveSwitches.js): the few nearest that are on as live
     * lights (LampPool), every lit room glowing (RoomGlow), the fittings'
     * glass and bulbs (LiveBulbs). The rooms' old always-on fill lights go;
     * a space that had them (one without a sky of its own) starts with its
     * lights on by day, so it is drawn as before. The switches' state is the
     * visitor's: never part of the scene, never saved.
     *
     * @param {object[]} lights  the fittings, as Fittings.js's gatherLights gives them
     */
    startLiveLights(lights) {
        if (this.liveLights || this.disposed) return;
        // A public view with nothing to switch keeps its rooms' fill lights.
        if (this.experience.publicView && !lights.length) return;
        const builder = this.sceneBuilder;
        if (builder.lights) builder.lights.visible = false;
        const published = this.experience.published;
        this.liveLights = true;
        this.switches = new LiveSwitches(builder.spec, lights, { levels: published?.levels, dayOn: !this.sky });
        this.switches.on("change", () => {
            // A room's light probe (Realism.js) is captured again once the
            // lights have faded to how they are now (update).
            this.probeStale = true;
            this.emit("switches", this.switches);
        });
        builder.buildLightTargets(lights);
        // Every room glowing at night, if night came before the switches did:
        // from now on only the rooms whose lights are on.
        this.sky?.glowIndoors(false);
        try {
            this.roomGlow = new RoomGlow(this, this.switches);
            this.lampPool = new LampPool(this, this.switches);
            this.bulbs = new LiveBulbs(this, this.switches);
        } catch (error) {
            // Rather the rooms' old fill lights than none at all.
            console.error("The light switches could not start; the rooms keep their fill lights.", error);
            this.lampPool?.dispose();
            this.roomGlow?.dispose();
            this.roomGlow = this.lampPool = this.bulbs = null;
            this.switches = null;
            this.liveLights = false;
            if (builder.lights) builder.lights.visible = true;
            return;
        }
        // Day or night as the view is now — a space without a sky of its
        // own had none until now, and starts by day.
        this.lighting ??= "day";
        this.switches.useVariant(this.lighting);
        if (!this.sky) this.emit("lighting", this.lighting);
        this.switchesKey = switchesKey(this.switches);
        this.emit("switches-ready", this.switches);
    }

    /**
     * The light fittings again, after an edit: a lamp moved, a door that
     * a switch stands by, a room — the switches keep their state.
     */
    refreshLiveLights() {
        if (!this.liveLights || this.disposed) return;
        const builder = this.sceneBuilder;
        const lights = gatherLights(builder);
        markBulbs(builder, lights);
        this.switches.setLights(builder.spec, lights);
        builder.buildLightTargets(lights);
        this.roomGlow.rebuild(builder.spec);
        this.roomGlow.applyTo(this.experience.scene);
        this.bulbs.collect(this.experience.scene);
        this.lampPool.redrawAll();
        // The lists drawn again only if the switches are not the ones they list.
        const key = switchesKey(this.switches);
        if (key === this.switchesKey) return;
        this.switchesKey = key;
        this.emit("switches-ready", this.switches);
    }

    /**
     * Day or night in a view lit live without a sky of its own: the
     * preset's day, or the night's sky and moon (Environment), each with its
     * switches as they were left.
     */
    async setLiveLighting(variant) {
        this.environment.setLiveVariant(variant);
        await this.switches.prepare(variant);
        this.switches.useVariant(variant);
        this.vegetation?.setLight?.(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /**
     * The light probes of a view lit live (World/ProbeLight.js), once
     * their file is here; until then what moves keeps the sky's light.
     */
    async loadProbes(description, options = {}) {
        try {
            const response = await fetch(description.file);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            if (!this.disposed) this.probes = new ProbeLight(this, description, buffer, options);
        } catch (error) {
            console.warn("The light probes did not load; the people and the car keep the sky's light.", error);
        }
    }

    /**
     * The doors' atlas (the bake's door states), once it is here: until then,
     * or without it, a shut door dims no room — its light is as baked, with
     * every door open.
     */
    async loadDoorStates(states) {
        try {
            const texture = await new THREE.TextureLoader().loadAsync(doorStatesURL(states));
            if (!this.disposed) this.sceneBuilder.setDoorAtlas(texture);
        } catch (error) {
            console.warn("The doors' light did not load; a shut door dims no room.", error);
        }
    }

    /** The bird's-eye view of a floor, on or off. */
    toggleBirdView() {
        if (!this.birdView || this.player?.inVehicle) return false;
        return this.birdView.toggle();
    }

    /**
     * The garden's settings have changed — the editor's Garden panel has put
     * them in the spec — in one of its groups (shared/garden.js): how the
     * view is drawn, where the ground's gradient lies, and the garden, at
     * once; the hills, and whatever else has to be grown again, once the
     * change has `settled`.
     */
    gardenChanged(group, settled = true) {
        if (!this.sceneBuilder) return;
        if (group === "colour") this.environment?.applyColour();
        if (group === "ground") this.sceneBuilder.materials.textures.setGradient(groundGradient(this.spec));
        if (settled && (group === "hills" || group === "neighbourhood")) {
            this.sceneBuilder.rebuildHills();
            this.environment?.fitShadows();
        }
        if (settled && group === "neighbourhood") {
            this.environment?.applyDome();
            // Its new haze, or none, is the walkthrough's: edit mode draws without one.
            this.editor?.keepFogOut(true);
        }
        this.vegetation?.settingsChanged(settled);
    }

    /** Swap a surface's finish and persist it to the spec. */
    setFinish(surfaceId, finishId) {
        const changed = this.sceneBuilder?.setFinish(surfaceId, finishId);
        if (changed) this.emit("finish-changed", { surfaceId, finishId });
        return changed;
    }

    update() {
        const delta = this.experience.time.delta;
        if (this.sceneBuilder) this.sceneBuilder.updateDoors(delta);
        if (this.player) this.player.update();
        if (this.vegetation) this.vegetation.update(delta);
        if (this.lamps) this.lamps.update(delta);
        if (this.roomGlow) this.roomGlow.update(delta);
        if (this.lampPool) this.lampPool.update(delta);
        // A switch turned, and its lights faded: the room probe (Realism.js) captured again, as they are now.
        if (this.probeStale && this.roomGlow?.settled && this.lampPool?.settled) {
            this.probeStale = false;
            if (this.sky) this.sky.lightVersion = (this.sky.lightVersion ?? 0) + 1;
        }
        if (this.sceneBuilder?.sunShade) this.sceneBuilder.updateSunShade(this.environment.sun);
        if (this.probes) this.probes.update(delta);
        if (this.people) this.people.tick(delta);
        if (this.editor) this.editor.update(delta);
        this.emit("tick", delta);
    }

    dispose() {
        this.disposed = true;
        this.birdView?.dispose();
        this.lamps?.dispose();
        clearTimeout(this.lightsTimer);
        this.lampPool?.dispose();
        this.roomGlow?.dispose();
        this.bulbs?.dispose();
        this.probes?.dispose();
        this.people?.dispose();
        this.editor?.dispose();
        this.vegetation?.dispose();
        this.sky?.dispose();
        this.experience.renderer?.realism?.dispose();
        this.sceneBuilder?.dispose();
        this.environment?.dispose();
        this.player?.dispose();
    }
}

/** What a list of the switches shows: each one's name and floor. */
function switchesKey(switches) {
    return switches.list.map((item) => `${item.id}|${item.label}|${item.level}`).join("\n");
}

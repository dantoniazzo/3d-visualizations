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
import ProbeLight from "./ProbeLight.js";
import Vegetation from "./Vegetation/Vegetation.js";
import { chromaURL, doorStatesURL, lightingMode, lightmapURL, movingShadowsOnly, sunMaskURL } from "../Utils/device.js";
import { groundGradient } from "../../../shared/vegetation.js";

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
            // The garden: grass on the lawns, trees on the bigger ones.
            this.vegetation = new Vegetation(this);

            if (this.experience.publicView) {
                // Nothing will move but the doors, the car and the people, so
                // everything else is drawn merged once the furniture is in —
                // from the published snapshot when there is one.
                this.sceneBuilder.furnitureReady.then(() => {
                    const published = this.experience.published;
                    const snapshot = this.resources.items.publishedView;
                    const lighting = published?.lighting;
                    if (!snapshot) {
                        this.sceneBuilder.optimizeForViewing();
                    } else {
                        // All of its light from the bake, or the sun and the
                        // lamps live on top of the rest of it.
                        const live = Boolean(lighting) && lightingMode(lighting) === "live";
                        // Drawn from the bake, as on a phone: what moves still
                        // shades the sun in the house, and the light probes
                        // light it, when the bake has them.
                        const shade = movingShadowsOnly(lighting);
                        const probes = Boolean(lighting?.probes);
                        this.sceneBuilder.usePublishedView(snapshot, lighting, { ...published.options, live, shade, probes });
                        if (lighting) {
                            // The room lights are in the lightmaps now.
                            if (this.sceneBuilder.lights) this.sceneBuilder.lights.visible = false;
                            this.environment.useBaked(lighting.view, { live: this.sceneBuilder.liveLight, shade, probes });
                            // Its light switches, when its fittings were baked apart.
                            if (lighting.switches?.length && lighting.variants) {
                                this.switches = new Switches(this.sceneBuilder, published);
                                this.switches.on("change", () => this.emit("switches", this.switches));
                                // Each light, and its switch on the wall, to point at.
                                const lights = (published.spec.lights || []).filter((light) => this.switches.byId.has(light.switch));
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
                            if (lighting.doorStates) this.loadDoorStates(lighting.doorStates);
                            this.setLighting("day").then(() => {
                                if (this.switches) this.emit("switches-ready", this.switches);
                            });
                        }
                    }
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
        if (!info || !this.sceneBuilder?.baked) return false;
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
        const [[texture, chroma, softTexture, softChroma]] = await Promise.all([this.lightmaps.get(variant), this.switches?.prepare(variant)]);
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
        this.environment.setVariant(variant, live || shade ? info.sun : null);
        // The grass lit by the lawn under it, the trees by the bake's sun and sky.
        this.vegetation?.useGroundLight(this.sceneBuilder, info, texture, chroma);
        this.vegetation?.setLight(variant);
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
        if (settled && group === "hills") {
            this.sceneBuilder.rebuildHills();
            this.environment?.fitShadows();
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
        if (this.sceneBuilder?.sunShade) this.sceneBuilder.updateSunShade(this.environment.sun);
        if (this.probes) this.probes.update(delta);
        if (this.editor) this.editor.update(delta);
        this.emit("tick", delta);
    }

    dispose() {
        this.disposed = true;
        this.birdView?.dispose();
        this.lamps?.dispose();
        this.probes?.dispose();
        this.editor?.dispose();
        this.vegetation?.dispose();
        this.sceneBuilder?.dispose();
        this.environment?.dispose();
        this.player?.dispose();
    }
}

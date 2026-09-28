import { EventEmitter } from "events";
import * as THREE from "three";

import Experience from "../Experience.js";
import SceneBuilder from "./SceneBuilder.js";
import Environment from "./Environment.js";
import Collision from "./Collision.js";
import Player from "./Player/Player.js";
import BirdView from "./BirdView.js";
import Switches from "./Switches.js";
import Vegetation from "./Vegetation/Vegetation.js";
import { chromaURL, lightmapURL } from "../Utils/device.js";

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
                        this.sceneBuilder.usePublishedView(snapshot, lighting, published.options);
                        if (lighting) {
                            // The room lights are in the lightmaps now.
                            if (this.sceneBuilder.lights) this.sceneBuilder.lights.visible = false;
                            this.environment.useBaked(lighting.view);
                            // Its light switches, when its fittings were baked apart.
                            if (lighting.switches?.length && lighting.variants) {
                                this.switches = new Switches(this.sceneBuilder, published);
                                this.switches.on("change", () => this.emit("switches", this.switches));
                                // Each light, and its switch on the wall, to point at.
                                const lights = (published.spec.lights || []).filter((light) => this.switches.byId.has(light.switch));
                                this.sceneBuilder.buildLightTargets(lights);
                            }
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
                Promise.all([load(`lightmap:${variant}`, lightmapURL(info)), load(`lightmap:${variant}:chroma`, chromaURL(info))])
            );
        }
        const [[texture, chroma]] = await Promise.all([this.lightmaps.get(variant), this.switches?.prepare(variant)]);
        this.sceneBuilder.setLightingVariant(texture, info, chroma);
        this.switches?.useVariant(variant);
        this.environment.setVariant(variant);
        // The grass lit by the lawn under it, the trees by the bake's sun and sky.
        this.vegetation?.useGroundLight(this.sceneBuilder, info, texture, chroma);
        this.vegetation?.setLight(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /** The bird's-eye view of a floor, on or off. */
    toggleBirdView() {
        if (!this.birdView || this.player?.inVehicle) return false;
        return this.birdView.toggle();
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
        if (this.editor) this.editor.update(delta);
        this.emit("tick", delta);
    }

    dispose() {
        this.disposed = true;
        this.birdView?.dispose();
        this.editor?.dispose();
        this.vegetation?.dispose();
        this.sceneBuilder?.dispose();
        this.environment?.dispose();
        this.player?.dispose();
    }
}

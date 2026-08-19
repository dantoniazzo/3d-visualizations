import { EventEmitter } from "events";
import { Octree } from "three/examples/jsm/math/Octree.js";

import Experience from "../Experience.js";
import SceneBuilder from "./SceneBuilder.js";
import Environment from "./Environment.js";
import Player from "./Player/Player.js";

export default class World extends EventEmitter {
    constructor() {
        super();

        this.experience = new Experience();
        this.resources = this.experience.resources;
        this.spec = this.experience.sceneSpec;

        this.octree = new Octree();
        this.player = null;

        this.resources.on("ready", () => {
            if (this.player) return;

            this.sceneBuilder = new SceneBuilder(this.spec);
            this.environment = new Environment(this.spec);
            this.player = new Player();

            this.player.setInteractionObjects(this.sceneBuilder.getInteractiveObjects());

            // Enough to stop the third-person boom pushing through the
            // structure, without raycasting every teacup.
            this.experience.camera.setCollisionObjects(
                this.sceneBuilder.getCameraObstacles()
            );

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

    /** Swap a surface's finish and persist it to the spec. */
    setFinish(surfaceId, finishId) {
        const changed = this.sceneBuilder?.setFinish(surfaceId, finishId);
        if (changed) this.emit("finish-changed", { surfaceId, finishId });
        return changed;
    }

    /** Place a catalogue item at a world point. */
    placeFurniture(catalogId, position, rotation = 0) {
        if (!this.sceneBuilder) return null;

        const placement = {
            id: `f-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
            catalog_id: catalogId,
            position: [position.x, position.y, position.z],
            rotation,
            scale: 1,
        };

        this.sceneBuilder.addFurniture(placement);
        this.emit("furniture-changed", this.sceneBuilder.spec.furniture);
        return placement;
    }

    removeFurniture(id) {
        const removed = this.sceneBuilder?.removeFurniture(id);
        if (removed) this.emit("furniture-changed", this.sceneBuilder.spec.furniture);
        return removed;
    }

    update() {
        const delta = this.experience.time.delta;
        if (this.sceneBuilder) this.sceneBuilder.updateDoors(delta);
        if (this.player) this.player.update();
    }

    dispose() {
        this.sceneBuilder?.dispose();
        this.environment?.dispose();
        this.player?.dispose();
    }
}

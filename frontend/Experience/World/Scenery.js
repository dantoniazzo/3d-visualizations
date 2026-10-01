import { EventEmitter } from "events";

import { SCENERY } from "../../../shared/scenery.js";
import { hideScenery } from "../Utils/viewerChoices.js";

/**
 * The scenery a visitor to a public view can hide (shared/scenery.js), to
 * draw less on a slow phone: as much of it as the version was published
 * with — the car, the trees and bushes, the hills, the grass. Hidden, each
 * is not drawn; the car is not downloaded until it is shown; the hills lie
 * flat, being the house's own ground (SceneBuilder.showHills). What is
 * hidden is kept on this device (Utils/viewerChoices.js), for every space.
 *
 * The bake still has the trees' shade on the lawn, hidden or not.
 *
 * Emits "change" whenever a piece is shown or hidden.
 */
export default class Scenery extends EventEmitter {
    /**
     * @param {World} world  its scene builder and vegetation made
     * @param {Set<string>} hidden  what this visitor hid before
     */
    constructor(world, hidden = new Set()) {
        super();
        this.world = world;
        this.hidden = new Set(hidden);
        this.apply();
    }

    /** The pieces this version has, each with whether it is shown. */
    get pieces() {
        return SCENERY.filter((piece) => this.has(piece.id)).map((piece) => ({ ...piece, shown: !this.hidden.has(piece.id) }));
    }

    has(id) {
        const builder = this.world.sceneBuilder;
        const vegetation = this.world.vegetation;
        if (id === "car") return Boolean(builder?.cars?.length);
        if (id === "trees") return Boolean(vegetation?.trees?.length || vegetation?.bushes?.length);
        if (id === "hills") return Boolean(vegetation?.hills);
        if (id === "grass") return Boolean(vegetation?.bladeChunks?.length || vegetation?.tuftChunks?.length || vegetation?.pieces?.length);
        return false;
    }

    set(id, shown) {
        if (shown === !this.hidden.has(id)) return;
        if (shown) this.hidden.delete(id);
        else this.hidden.add(id);
        hideScenery(this.hidden);
        this.apply();
        this.emit("change");
    }

    apply() {
        const shown = (id) => !this.hidden.has(id);
        this.world.sceneBuilder?.showCars(shown("car"));
        this.world.sceneBuilder?.showHills(shown("hills"));
        this.world.vegetation?.show({ trees: shown("trees"), hills: shown("hills"), grass: shown("grass") });
    }
}

import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";

import { GARDEN, gardenSettings, sanitizeGarden } from "../../../shared/garden.js";

/**
 * The garden's settings, by hand (shared/garden.js lists them): Fluffy
 * Tree's own controls — its lighting, its grass, its leaves' volumetric
 * gradient and wind — and the sketch's for its grass blades, with how
 * the view is drawn, where the ground's gradient lies, the hills, and how
 * thick the grass grows and how far off it is drawn. A lil-gui panel, as
 * Fluffy Tree's dat.gui one is.
 *
 * Whatever changes how the garden looks follows as a control moves; what
 * has to be grown again — the grass's density, the trees, the hills —
 * once it is let go. Either way it goes in the spec (`garden`, only what
 * differs from the defaults) and is saved with the rest of the space; a
 * version published from it is baked with it.
 */
export default class GardenPanel {
    /** @param {World} world */
    constructor(world) {
        this.world = world;
        this.values = gardenSettings(world.spec);

        this.gui = new GUI({ title: "Garden", width: 330 });
        this.gui.domElement.classList.add("garden-panel");
        for (const [group, settings] of Object.entries(GARDEN)) {
            const folder = this.gui.addFolder(settings.label);
            for (const [key, setting] of Object.entries(settings)) {
                if (key === "label") continue;
                const kind = typeof setting.value;
                const controller = setting.options
                    ? folder.add(this.values[group], key, setting.options)
                    : kind === "string"
                      ? folder.addColor(this.values[group], key)
                      : kind === "number"
                        ? folder.add(this.values[group], key, setting.min, setting.max, setting.step)
                        : folder.add(this.values[group], key);
                controller.name(setting.label);
                controller.onChange(() => this.changed(group, false));
                controller.onFinishChange(() => this.changed(group, true));
            }
            folder.close();
        }
        this.gui.add({ reset: () => this.reset() }, "reset").name("Reset all to defaults");
    }

    /**
     * A setting has changed: into the spec, and out to the view — all of it
     * once the control is let go (`settled`), and saved.
     */
    changed(group, settled) {
        const spec = this.world.spec;
        const garden = sanitizeGarden(this.values);
        if (garden) spec.garden = garden;
        else delete spec.garden;
        this.world.gardenChanged(group, settled);
        if (settled) this.world.emit("scene-edited");
    }

    /** Every setting back to its default — Fluffy Tree's and the sketch's own, and the house's. */
    reset() {
        const defaults = gardenSettings({});
        for (const group of Object.keys(this.values)) Object.assign(this.values[group], defaults[group]);
        for (const controller of this.gui.controllersRecursive()) controller.updateDisplay();
        delete this.world.spec.garden;
        for (const group of Object.keys(GARDEN)) this.world.gardenChanged(group, true);
        this.world.emit("scene-edited");
    }

    dispose() {
        this.gui.destroy();
    }
}

import * as THREE from "three";

import Experience from "../Experience.js";
import { SHADE } from "./Fittings.js";

/**
 * The glass and bulbs of the light fittings, lit as their switches are, in
 * a view lit live (World/LiveSwitches.js): a ceiling light's opal glass, a
 * lamp's shade or LED, glowing with the light's colour when it is on and
 * plain when it is off.
 *
 * Whatever is a fitting's glass or bulb says so — `userData.glow`, its
 * switch's id: the editor's fittings and lamps are marked as they are built
 * (Fittings.js's markBulbs), and a version published without its light
 * baked keeps them apart from the rest, still marked (Publish/Snapshot.js).
 * Each switch's are given a material of their own, once — the same shader,
 * so turning a switch builds nothing.
 */

/** How brightly a lit bulb glows: over 1, so the bloom catches it at night. */
const ON = 2.2;
/**
 * How brightly a woven shade glows round its lit bulb, its own colours
 * warmed: the light the bulb throws on it from within, which no live
 * light gives it (World/LampPool.js's shine down).
 */
const SHADE_ON = 0.45;

export default class LiveBulbs {
    /**
     * @param {World} world  drawing a view lit live
     * @param {LiveSwitches} switches  its switches
     */
    constructor(world, switches) {
        this.experience = new Experience();
        this.world = world;
        this.switches = switches;
        /** switch id -> its bulbs' materials */
        this.bySwitch = new Map();
        /** `${switch}|${material.uuid}` -> the switch's own copy */
        this.copies = new Map();
        this.colours = new Map();
        this.onChange = () => this.apply();
        switches.on("change", this.onChange);
        this.collect(this.experience.scene);
    }

    /** Every glass and bulb in `root` (again, after the editor rebuilt some), each given its switch's own material. */
    collect(root) {
        this.colours.clear();
        for (const entry of this.switches.entries) this.colours.set(entry.id, new THREE.Color(entry.lights[0]?.color ?? "#ffd6a3"));
        root.traverse((node) => {
            const tag = node.userData?.glow;
            if (!node.isMesh || typeof tag !== "string" || !tag) return;
            // A shade's (`shade:<switch>`, Fittings.markBulbs), or a bulb's.
            const shade = tag.startsWith(SHADE);
            const id = shade ? tag.slice(SHADE.length) : tag;
            const swap = (material) => {
                if (!material || material.userData.bulbOf === id) return material;
                const key = `${tag}|${material.uuid}`;
                if (!this.copies.has(key)) {
                    const copy = material.clone();
                    copy.userData = { ...material.userData, bulbOf: id, shade, bulbOwn: { emissive: material.emissive?.clone() ?? null, intensity: material.emissiveIntensity ?? 0 } };
                    copy.onBeforeCompile = material.onBeforeCompile;
                    copy.customProgramCacheKey = material.customProgramCacheKey;
                    // A shade glows in its own colours.
                    if (shade && copy.emissive) copy.emissiveMap = copy.map ?? null;
                    this.copies.set(key, copy);
                }
                const copy = this.copies.get(key);
                // The sky's light on it as on its source — again after an
                // edit, which may have lit the source afresh (Sky.applyIndoor).
                this.world.sky?.adopt(copy, material);
                return copy;
            };
            node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material?.emissive) continue;
                if (!this.bySwitch.has(id)) this.bySwitch.set(id, new Set());
                this.bySwitch.get(id).add(material);
            }
        });
        this.apply();
    }

    apply() {
        for (const [id, materials] of this.bySwitch) {
            const on = this.switches.isOn(id);
            const colour = this.colours.get(id) ?? new THREE.Color("#ffd6a3");
            for (const material of materials) {
                if (on) {
                    material.emissive.copy(colour);
                    material.emissiveIntensity = material.userData.shade ? SHADE_ON : ON;
                } else {
                    material.emissive.setRGB(0, 0, 0);
                    material.emissiveIntensity = 1;
                }
            }
        }
    }

    dispose() {
        this.switches.off("change", this.onChange);
    }
}

import * as THREE from "three";

import Experience from "../Experience.js";

/**
 * The editor's plain light: what its edit mode is always drawn under, and
 * its walkthrough too unless the realistic preview is on (World.setPreview).
 * One rig, the same by day and at night, so that everything can be seen and
 * worked on in both:
 *
 *   - an ambient light and a hemisphere light, so that nothing is black
 *     whichever way it faces;
 *   - one directional light without a shadow, shining from over the
 *     camera's shoulder wherever it looks, which gives each thing its shape;
 *   - one exposure (Renderer.setPlain), no haze, and the day's sky to
 *     reflect at one strength (Sky.setPlain), so metal and glass still read.
 *
 * Nothing else lights the scene meanwhile. Every other light — the sun, the
 * lamps' (LampPool), the garden's, the cars' beams, the ones inside the
 * furniture, the rooms' old fill lights — is taken out of three's light
 * state rather than dimmed: three builds every shader for the lights there
 * are, so a light at nothing costs each pixel what a lit one does, and a
 * sun that is there has its shadow map drawn and read. A light so kept out
 * stays where it is in the scene, with whatever its owner sets on it; it is
 * only on no layer, which three leaves out as it gathers a frame's lights,
 * and is put back on its own as the preview draws it again.
 *
 * Day and night are then told apart by the sky behind (and the lamps' glass,
 * LiveBulbs): the light on everything is the same.
 */

/**
 * The rig, in three's units: a white wall comes out bright, not blown, and
 * a dark sofa is still read; a ceiling, lit from below by the hemisphere's
 * ground, is a shade off the walls it meets.
 */
const RIG = {
    ambient: { color: "#ffffff", intensity: 0.35 },
    hemisphere: { sky: "#ffffff", ground: "#9d968a", intensity: 0.7 },
    key: { color: "#ffffff", intensity: 1.7 },
};
/** How far the key light stands to the side of and above the way the camera looks, to that way's 1: straight on, every face would be lit flat. */
const SHOULDER = { side: 0.35, up: 0.5 };
/** The view's exposure under it: one, whatever the time of day, the garden's setting or the eye would have. */
const EXPOSURE = 1;

const _at = new THREE.Vector3();
const _axis = new THREE.Vector3();

export default class PlainLight {
    /** @param {World} world  the editor's */
    constructor(world) {
        this.world = world;
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.on = false;
        /** The walkthrough's haze, kept while this is on (keepFogOut). */
        this.fog = null;

        this.group = new THREE.Group();
        this.group.name = "plain-light";
        this.group.visible = false;
        this.ambient = new THREE.AmbientLight(RIG.ambient.color, RIG.ambient.intensity);
        this.hemisphere = new THREE.HemisphereLight(RIG.hemisphere.sky, RIG.hemisphere.ground, RIG.hemisphere.intensity);
        this.key = new THREE.DirectionalLight(RIG.key.color, RIG.key.intensity);
        this.group.add(this.ambient, this.hemisphere, this.key, this.key.target);
        this.scene.add(this.group);
    }

    /**
     * On, or off: its own lights in place of everyone else's, its one
     * exposure, no haze — or theirs again, as they were left. What the time
     * of day then shows is the world's to draw (World.relight).
     */
    set(on) {
        if (on === this.on) return;
        this.on = on;
        this.group.visible = on;
        this.scene.traverse((node) => {
            if (!node.isLight || node.parent === this.group) return;
            if (on) node.layers.disableAll();
            else node.layers.set(0);
        });
        this.experience.renderer.setPlain(on ? EXPOSURE : null);
        if (on) {
            this.keepFogOut();
        } else if (this.fog) {
            this.scene.fog = this.fog;
            this.fog = null;
        }
    }

    /**
     * The lights in `root`, made while this is on — a car's beam as its
     * model arrives, a fridge's, the garden's, the lamps' again as the
     * slider moves — kept out of three's light state from the start: let in
     * for a frame, each would have every shader built again for one light
     * more.
     */
    keepOut(root) {
        if (!this.on) return;
        root.traverse((node) => {
            if (node.isLight) node.layers.disableAll();
        });
    }

    /**
     * The walkthrough's haze — a new one, if the garden's settings have just
     * made one — kept for when the preview is back; `always`, even none (the
     * neighbourhood switched off).
     */
    keepFogOut(always = false) {
        if (!this.on || (!this.scene.fog && !always)) return;
        this.fog = this.scene.fog;
        this.scene.fog = null;
    }

    /** Before a frame of `camera` (Renderer.render): the key light from over its shoulder, whichever way it looks. */
    update(camera) {
        if (!this.on) return;
        camera.updateMatrixWorld();
        const key = this.key;
        _at.setFromMatrixPosition(camera.matrixWorld);
        // Only the way it shines counts: from behind the camera, a little to one side and above.
        key.position.copy(_at).add(_axis.setFromMatrixColumn(camera.matrixWorld, 2));
        key.position.addScaledVector(_axis.setFromMatrixColumn(camera.matrixWorld, 0), SHOULDER.side);
        key.position.addScaledVector(_axis.setFromMatrixColumn(camera.matrixWorld, 1), SHOULDER.up);
        key.target.position.copy(_at);
    }

    dispose() {
        this.set(false);
        this.scene.remove(this.group);
        this.ambient.dispose();
        this.hemisphere.dispose();
        this.key.dispose();
    }
}

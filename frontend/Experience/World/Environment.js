import * as THREE from "three";

import Experience from "../Experience.js";
import { ENVIRONMENT_PRESETS } from "../../../shared/catalog.js";

/**
 * Ambient lighting, sky and fog, driven entirely by the scene spec's
 * environment preset. Fixture lights (lamps, pendants) come from
 * SceneBuilder; this is the base layer they sit on top of.
 */
export default class Environment {
    constructor(spec) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.renderer = this.experience.renderer;
        this.spec = spec;

        this.preset =
            ENVIRONMENT_PRESETS[spec.environment.preset] ||
            ENVIRONMENT_PRESETS.interior_day;

        this.setEnvironment();
    }

    setEnvironment() {
        const preset = this.preset;

        this.scene.background = new THREE.Color(preset.background);

        if (preset.fog) {
            this.scene.fog = new THREE.Fog(
                preset.fog.color,
                preset.fog.near,
                preset.fog.far
            );
        } else {
            this.scene.fog = null;
        }

        this.ambient = new THREE.AmbientLight(
            preset.ambient.color,
            preset.ambient.intensity
        );
        this.scene.add(this.ambient);

        // Hemisphere light does most of the work indoors: it gives floors and
        // ceilings different bounce colours without any GI.
        this.hemisphere = new THREE.HemisphereLight(
            preset.hemi.sky,
            preset.hemi.ground,
            preset.hemi.intensity
        );
        this.scene.add(this.hemisphere);

        this.sun = new THREE.DirectionalLight(preset.sun.color, preset.sun.intensity);
        this.sun.position.set(...preset.sun.position);
        this.sun.castShadow = true;

        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.near = 0.5;
        this.sun.shadow.camera.far = 120;
        this.sun.shadow.bias = -0.0006;
        this.sun.shadow.normalBias = 0.02;

        // Fit the shadow frustum to the footprint of the build so a large
        // outdoor scene doesn't get a blocky low-resolution shadow map.
        const extent = this.footprintExtent();
        const cam = this.sun.shadow.camera;
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
        cam.updateProjectionMatrix();

        this.scene.add(this.sun);
        this.scene.add(this.sun.target);

        this.renderer.setExposure(preset.exposure ?? 1);
    }

    /** Half-width of a square that contains every room and wall. */
    footprintExtent() {
        let max = 8;

        const consider = (x, z) => {
            max = Math.max(max, Math.abs(x) + 2, Math.abs(z) + 2);
        };

        for (const room of this.spec.rooms) {
            for (const [x, z] of room.polygon) consider(x, z);
        }
        for (const wall of this.spec.walls) {
            consider(wall.start[0], wall.start[1]);
            consider(wall.end[0], wall.end[1]);
        }

        return Math.min(max, 90);
    }

    dispose() {
        this.scene.remove(this.ambient, this.hemisphere, this.sun, this.sun.target);
        this.ambient.dispose();
        this.hemisphere.dispose();
        this.sun.dispose();
        this.scene.fog = null;
    }

    update() {}
}

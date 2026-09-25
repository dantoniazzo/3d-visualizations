import * as THREE from "three";

import Experience from "../Experience.js";
import { ENVIRONMENT_PRESETS } from "../../../shared/catalog.js";
import { applyReflections } from "../Utils/reflections.js";
import { SHADOW_MAP_SIZE } from "../Utils/device.js";

/**
 * Night, for a public view whose lighting has been baked: the house is lit
 * by its night lightmap; this is only the sky and the moonlight on what
 * moves — people, doors, the car.
 */
const NIGHT = {
    background: "#0d1018",
    hemi: { sky: "#2b3552", ground: "#0b0b0e", intensity: 0.45 },
    sun: { color: "#b8c8ff", intensity: 0.3, position: [-9, 16, -6] },
    fog: { color: "#0d1018" },
    exposure: 1.1,
    /** What metals and glass reflect is a lit studio; at night, far less of it. */
    reflections: 0.03,
};

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
        // What the scene builder made so far. Furniture, which it adds
        // later, is handled as the library registers or loads each piece.
        applyReflections(this.scene);
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

        this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
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

    /**
     * The house's light is baked into it; live lights are left only for
     * what moves, and without shadows, so no shadow map is drawn at all.
     */
    useBaked() {
        this.baked = true;
        this.ambient.intensity = 0;
        // Unshadowed, the sun would light people indoors as if outdoors.
        this.sunScale = 0.5;
        this.sun.castShadow = false;
        this.renderer.renderer.shadowMap.enabled = false;
    }

    /** Sky, fog and the light on what moves, for day or night. */
    setVariant(variant) {
        const preset = variant === "night" ? NIGHT : this.preset;
        this.scene.background = new THREE.Color(preset.background);
        if (this.scene.fog && this.preset.fog) this.scene.fog.color.set(preset.fog?.color ?? this.preset.fog.color);
        this.hemisphere.color.set(preset.hemi.sky);
        this.hemisphere.groundColor.set(preset.hemi.ground);
        this.hemisphere.intensity = preset.hemi.intensity;
        this.sun.color.set(preset.sun.color);
        this.sun.intensity = preset.sun.intensity * (this.sunScale ?? 1);
        this.sun.position.set(...preset.sun.position);
        this.renderer.setExposure(preset.exposure ?? 1);

        const reflections = preset.reflections ?? 1;
        this.scene.traverse((node) => {
            if (!node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material?.envMap) continue;
                if (material.userData.envMapIntensity === undefined) {
                    material.userData.envMapIntensity = material.envMapIntensity;
                }
                material.envMapIntensity = material.userData.envMapIntensity * reflections;
            }
        });
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

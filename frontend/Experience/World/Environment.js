import * as THREE from "three";

import Experience from "../Experience.js";
import { ENVIRONMENT_PRESETS } from "../../../shared/catalog.js";
import { gardenSettings } from "../../../shared/garden.js";
import { applyReflections } from "../Utils/reflections.js";
import { LOW_POWER, SHADOW_MAP_SIZE } from "../Utils/device.js";
import { hillOutline, planHills } from "../../../shared/vegetation.js";

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

        this.applyColour();
        this.setEnvironment();
        // What the scene builder made so far. Furniture, which it adds
        // later, is handled as the library registers or loads each piece.
        applyReflections(this.scene);
    }

    /**
     * How the view is drawn, as the garden's settings have it: its tone
     * mapping, and its exposure on top of the light's own.
     */
    applyColour() {
        const { toneMapping, exposure } = gardenSettings(this.spec).colour;
        this.renderer.setToneMapping(toneMapping, exposure);
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

        this.sun.shadow.camera.near = 0.5;
        this.sun.shadow.camera.far = 120;
        this.sun.shadow.bias = -0.0006;
        this.sun.shadow.normalBias = 0.02;
        this.fitShadows();

        this.scene.add(this.sun);
        this.scene.add(this.sun.target);

        this.renderer.setExposure(preset.exposure ?? 1);
    }

    /**
     * Fit the shadow frustum to the footprint of the build — and the hills
     * behind it, whose trees and grass shade them — so a large outdoor
     * scene doesn't get a blocky low-resolution shadow map; and one that
     * reaches as far as the hills, twice the map's resolution.
     *
     * Lit live, the sun draws the house's own shadows — its windows' patches
     * of sunlight on the floors, as the bake drew them — so the frustum is
     * fitted to the house and its garden instead, at twice the map's
     * resolution: the hills' trees, further off, shade nothing then.
     */
    fitShadows() {
        if (this.live || this.shade) {
            const extent = this.houseExtent();
            this.setShadowSize(this.live ? SHADOW_MAP_SIZE * 2 : SHADOW_MAP_SIZE);
            const cam = this.sun.shadow.camera;
            cam.left = -extent;
            cam.right = extent;
            cam.top = extent;
            cam.bottom = -extent;
            cam.far = 200;
            cam.updateProjectionMatrix();
            return;
        }
        const extent = this.footprintExtent();
        const size = extent > 50 && !LOW_POWER ? SHADOW_MAP_SIZE * 2 : SHADOW_MAP_SIZE;
        this.setShadowSize(size);
        const cam = this.sun.shadow.camera;
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
        cam.updateProjectionMatrix();
    }

    setShadowSize(size) {
        if (this.sun.shadow.mapSize.x === size) return;
        this.sun.shadow.mapSize.set(size, size);
        // Drawn again at its new size.
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
    }

    /** Half-width of a square that contains every room and wall, and the hills. */
    footprintExtent({ hills: withHills = true, most = 90 } = {}) {
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
        const hills = !withHills || (this.spec.model && this.spec.model.role !== "furnishings") ? null : planHills(this.spec);
        if (hills) for (const [x, z] of hillOutline(hills)) consider(x, z);

        return Math.min(max, most);
    }

    /** Half-width of a square round the house and its garden, without the hills. */
    houseExtent() {
        return this.footprintExtent({ hills: false, most: 40 });
    }

    /**
     * The house's light is baked into it — its shadows too, so it casts
     * none live; live lights are left only for what moves. The garden's
     * trees and grass still shade themselves and each other, as live
     * (World/Vegetation), in the sun's shadow map — but not on a phone,
     * where no shadow map is drawn at all. Its exposure is the bake's —
     * Blender's, in stops: at 0 the light is drawn as Blender shows it —
     * not a preset's.
     *
     * Lit live (`live`), the sun is the bake's own sun, drawn with the
     * house's shadows (fitShadows) at full strength (setVariant): what the
     * house takes from the lightmap then is all its light but the sun's.
     */
    useBaked(view = null, { live = false, shade = false, probes = false } = {}) {
        this.baked = true;
        this.live = live;
        // Drawn from the bake, the sun's shadow map is of what moves alone,
        // which shades the sun in the house (SceneBuilder's setSunShade).
        this.shade = !live && shade;
        this.bakedExposure = 2 ** (view?.exposure ?? 0);
        this.ambient.intensity = 0;
        // Unshadowed by the house, the sun would light people indoors as if
        // outdoors — unless the light probes say how much of it reaches them.
        this.sunScale = live || probes ? 1 : 0.5;
        this.sun.castShadow = live || this.shade || !LOW_POWER;
        this.renderer.renderer.shadowMap.enabled = live || this.shade || !LOW_POWER;
        if (live) {
            // Texels of a centimetre or so over the house: a small offset.
            this.sun.shadow.bias = -0.00015;
            this.sun.shadow.normalBias = 0.015;
        } else if (this.shade) {
            // Texels of a few centimetres: what moves, over the house.
            this.sun.shadow.bias = -0.0004;
            this.sun.shadow.normalBias = 0.04;
        }
        if (live || this.shade) this.fitShadows();
    }

    /**
     * Sky, fog and the light on what moves, for day or night — lit live,
     * with the sun (or the moon) the bake was lit by: `sun`, as
     * blender/bake_public.py describes it, its strength in W/m² as a
     * DirectionalLight takes it.
     */
    setVariant(variant, sun = null) {
        const preset = variant === "night" ? NIGHT : this.preset;
        this.scene.background = new THREE.Color(preset.background);
        if (this.scene.fog && this.preset.fog) this.scene.fog.color.set(preset.fog?.color ?? this.preset.fog.color);
        this.hemisphere.color.set(preset.hemi.sky);
        this.hemisphere.groundColor.set(preset.hemi.ground);
        this.hemisphere.intensity = preset.hemi.intensity;
        if ((this.live || this.shade) && sun) {
            this.sun.color.setRGB(...sun.color);
            this.sun.intensity = sun.strength * (this.sunScale ?? 1);
            // Far enough off that the whole house is in front of its shadow camera.
            this.sun.position.set(...sun.position).normalize().multiplyScalar(80);
            this.sun.shadow.needsUpdate = true;
        } else {
            this.sun.color.set(preset.sun.color);
            this.sun.intensity = preset.sun.intensity * (this.sunScale ?? 1);
            this.sun.position.set(...preset.sun.position);
        }
        this.renderer.setExposure(this.baked ? this.bakedExposure : preset.exposure ?? 1);

        const reflections = preset.reflections ?? 1;
        this.scene.traverse((node) => {
            if (!node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                // What the light probes light dims its own (World/ProbeLight.js).
                if (!material?.envMap || material.userData.probeLit) continue;
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

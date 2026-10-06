import * as THREE from "three";

import Experience from "../Experience.js";
import { ENVIRONMENT_PRESETS } from "../../../shared/catalog.js";
import { gardenSettings } from "../../../shared/garden.js";
import { applyReflections } from "../Utils/reflections.js";
import { LOW_POWER, SHADOW_MAP_SIZE } from "../Utils/device.js";
import { hillOutline, planHills } from "../../../shared/vegetation.js";
import { planNeighbourhood } from "../../../shared/neighbourhood.js";
import { SKY_VARIANTS } from "../../../shared/sky.js";

/**
 * The dark the neighbourhood's world fades into at its edge (applyDome), by
 * day and by night, and over how many metres it fades.
 */
const EDGE = { day: "#0d1016", night: "#030407" };
const FADE = 55;

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

/** The night sky's light on everything, lit live (setLiveVariant): faint, as it falls into the rooms too. */
const LIVE_NIGHT_SKY = 0.12;

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
        this.applyDome();
    }

    /**
     * The neighbourhood's world (shared/neighbourhood.js), when there is one:
     * everything fades into the dark over the last FADE metres of its radius,
     * by how far it is from the world's middle along the ground — wherever it
     * is seen from, the hill's top or the far end of the street (radialFog) —
     * and the sky darkens down to the horizon to meet it: a dome the world
     * sits in. Again whenever the garden's settings change.
     */
    applyDome() {
        const plan = planNeighbourhood(this.spec);
        if (!plan) {
            if (this.sky) this.sky.visible = false;
            // Switched off: the preset's own sky and haze again, not the dome's dark edge.
            if (this.dome) {
                const preset = this.variant === "night" ? NIGHT : this.preset;
                const fog = this.preset.fog;
                this.scene.background = new THREE.Color(preset.background);
                this.scene.fog = fog ? new THREE.Fog(preset.fog?.color ?? fog.color, fog.near, fog.far) : null;
            }
            this.dome = null;
            return;
        }
        radialFog(plan.centre);
        this.dome = plan;
        this.sky ??= skyDome();
        if (!this.sky.parent) this.scene.add(this.sky);
        this.sky.visible = true;
        this.scene.fog = new THREE.Fog(EDGE.day, plan.radius - FADE, plan.radius);
        this.colourDome(this.variant === "night" ? NIGHT : this.preset, this.variant === "night");
    }

    /** The dome's colours for a variant's sky: blue overhead, its haze at the horizon, dark below. */
    colourDome(preset, night) {
        if (!this.dome) return;
        const edge = night ? EDGE.night : EDGE.day;
        this.scene.fog?.color.set(edge);
        this.scene.background = new THREE.Color(edge);
        const { top, horizon, below } = this.sky.material.uniforms;
        top.value.set(preset.background);
        horizon.value.set(preset.fog?.color ?? preset.background).lerp(new THREE.Color(preset.background), night ? 0.6 : 0.25);
        below.value.set(edge);
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
    useBaked(view = null, { live = false, shade = false, probes = false, still = false } = {}) {
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
        // Fully baked (`still`), no shadow map is drawn at all.
        const shadows = !still && (live || this.shade || !LOW_POWER);
        this.sun.castShadow = shadows;
        this.renderer.renderer.shadowMap.enabled = shadows;
        this.bakedBias();
        if (live || this.shade) this.fitShadows();
    }

    /** The sun's shadow offsets for a baked view's shadow map, at its texels' size. */
    bakedBias() {
        if (this.live) {
            // Texels of a centimetre or so over the house: a small offset.
            this.sun.shadow.bias = -0.00015;
            this.sun.shadow.normalBias = 0.015;
        } else if (this.shade) {
            // Texels of a few centimetres: what moves, over the house.
            this.sun.shadow.bias = -0.0004;
            this.sun.shadow.normalBias = 0.04;
        }
    }

    /**
     * Sky, fog and the light on what moves, for day or night — lit live,
     * with the sun (or the moon) the bake was lit by: `sun`, as
     * blender/bake_public.py describes it, its strength in W/m² as a
     * DirectionalLight takes it.
     */
    setVariant(variant, sun = null) {
        const preset = variant === "night" ? NIGHT : this.preset;
        this.variant = variant;
        // Under a site's own sky (World/Sky.js), the sky has set its
        // picture, haze and light already, and the sun where it is — when
        // it has this variant's: one that did not load leaves the preset's.
        const world = this.experience.world;
        const sky = world?.sky?.current && world.sky.variant === variant ? world.sky : null;
        if (!sky) {
            this.scene.background = new THREE.Color(preset.background);
            if (this.scene.fog && this.preset.fog) this.scene.fog.color.set(preset.fog?.color ?? this.preset.fog.color);
            this.colourDome(preset, variant === "night");
            this.hemisphere.color.set(preset.hemi.sky);
            this.hemisphere.groundColor.set(preset.hemi.ground);
            this.hemisphere.intensity = preset.hemi.intensity;
        }
        if ((this.live || this.shade) && sun) {
            this.sun.color.setRGB(...sun.color);
            this.sun.intensity = sun.strength * (this.sunScale ?? 1);
            // Far enough off that the whole house is in front of its shadow camera.
            this.sun.position.set(...sun.position).normalize().multiplyScalar(80);
            this.sun.target.position.set(0, 0, 0);
            this.sun.visible = sun.strength > 0;
            // The sky's shadow settings (Sky.placeSun) are a live view's.
            if (sky) {
                this.bakedBias();
                this.fitShadows();
            }
            this.sun.shadow.needsUpdate = true;
        } else if (sky) {
            // The sky's sun, as unshadowed by the house as the preset's would be.
            this.sun.intensity = (SKY_VARIANTS[variant] ?? SKY_VARIANTS.day).sun * (this.sunScale ?? 1);
        } else {
            this.sun.color.set(preset.sun.color);
            this.sun.intensity = preset.sun.intensity * (this.sunScale ?? 1);
            this.sun.position.set(...preset.sun.position);
        }
        // The bake's exposure; under a site's own sky, on top of the sky's
        // own for the variant, as the live view is exposed.
        const exposure = this.baked ? this.bakedExposure * (sky ? sky.exposure(variant) : 1) : preset.exposure ?? 1;
        this.renderer.setExposure(exposure);
        // The sky's light on what is drawn live is the sky's (Sky.applyIndoor).
        if (sky) return;

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

    /**
     * Day or night lit live, for a space without a sky of its own
     * (World.setLiveLighting): the preset's day, or the night — its dark
     * sky and a little moonlight — with the rooms lit by their own lights
     * (World/LampPool.js, World/RoomGlow.js). The night's sky light reaches
     * into every room alike, walls or no walls, so it is kept faint.
     */
    setLiveVariant(variant) {
        const night = variant === "night";
        this.setVariant(variant);
        this.ambient.intensity = night ? 0 : this.preset.ambient.intensity;
        if (night) this.hemisphere.intensity = LIVE_NIGHT_SKY;
    }

    dispose() {
        if (this.sky) {
            this.scene.remove(this.sky);
            this.sky.geometry.dispose();
            this.sky.material.dispose();
        }
        this.scene.remove(this.ambient, this.hemisphere, this.sun, this.sun.target);
        this.ambient.dispose();
        this.hemisphere.dispose();
        this.sun.dispose();
        this.scene.fog = null;
    }

    update() {}
}

/**
 * Fog by how far a point is from the world's middle along the ground,
 * rather than from the camera — three's own fog chunks, rewritten once,
 * before anything is drawn, for every material that fogs: the world's
 * position from the view's (the view matrix turns and moves it; its
 * transpose turns it back), from the middle in x and z, handed on to each
 * pixel, which measures its own distance — the ground is a few triangles
 * a couple of hundred metres across, and a distance from each corner,
 * blended, would fog it all.
 */
let fogCentre = null;
function radialFog([x, z]) {
    const key = `${x},${z}`;
    if (fogCentre === key) return;
    const chunks = THREE.ShaderChunk;
    if (!fogCentre) {
        chunks.fog_pars_vertex = chunks.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth;\n\tvarying vec2 vFogWorld;");
        chunks.fog_pars_fragment = chunks.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth;\n\tvarying vec2 vFogWorld;");
        chunks.fog_fragment = chunks.fog_fragment.replace("smoothstep( fogNear, fogFar, vFogDepth )", "smoothstep( fogNear, fogFar, length( vFogWorld ) )");
        if (!chunks.fog_fragment.includes("vFogWorld")) console.warn("The world's edge not fogged by distance from its middle: three's fog chunk has changed");
    }
    fogCentre = key;
    chunks.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vec3 fogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
	vFogWorld = fogWorld.xz - vec2( ${x.toFixed(3)}, ${z.toFixed(3)} );
	vFogDepth = length( vFogWorld );
#endif
`;
}

/**
 * The sky the world sits under: a sphere round the camera, drawn behind
 * everything, blue overhead, its haze at the horizon and the dark below
 * it — where the ground fades into the same dark (Environment.applyDome).
 * Drawn as the flat background was: not tone mapped, not fogged.
 */
function skyDome() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            top: { value: new THREE.Color() },
            horizon: { value: new THREE.Color() },
            below: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
			varying vec3 vDirection;
			void main() {
				vDirection = position;
				gl_Position = ( projectionMatrix * modelViewMatrix * vec4( position, 1.0 ) ).xyww;
			}
		`,
        fragmentShader: /* glsl */ `
			uniform vec3 top;
			uniform vec3 horizon;
			uniform vec3 below;
			varying vec3 vDirection;
			void main() {
				float up = normalize( vDirection ).y;
				vec3 sky = mix( horizon, top, smoothstep( 0.0, 0.55, up ) );
				gl_FragColor = vec4( mix( below, sky, smoothstep( -0.04, 0.16, up ) ), 1.0 );
				#include <colorspace_fragment>
			}
		`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
    sky.name = "sky-dome";
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    sky.raycast = () => {};
    // Round whichever camera draws it.
    sky.onBeforeRender = (renderer, scene, camera) => {
        sky.position.copy(camera.position);
        sky.updateMatrixWorld();
    };
    return sky;
}

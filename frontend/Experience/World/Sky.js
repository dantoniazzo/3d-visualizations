import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import Experience from "../Experience.js";
import { DUSK_KEEP, DUSK_TINT, SKY_VARIANTS as VARIANTS, findSun, sunDirection } from "../../../shared/sky.js";

/**
 * A site's own sky (shared/landscape.js's `sky`): a photographed sky from
 * Poly Haven, by day and at dusk, as everything round it is lit and seen.
 *
 *   - Its HDR lights the scene, through three's PMREM (scene.environment):
 *     the sky's light from every way, and what glossy surfaces reflect.
 *     The sun in it is clipped out first, so the sun is not counted twice.
 *   - The sun is a directional light from where the sun is in the HDR —
 *     its brightest pixel — so its shadows fall the way the sky says.
 *   - The background is the sky's photograph, sharper than the HDR, on a
 *     dome round the camera; the far ground fades into its haze, the fog
 *     taking the colour of the sky at the horizon.
 *   - Interiors take a share of the sky's light: the HDR knows nothing of
 *     walls, so a room's own surfaces reflect and are lit by less of it,
 *     and a warmer, greyer version of it — the sky's light as a room gets
 *     it, bounced off its floor and walls on the way in.
 *
 * Night is the dusk sky, darkened — the light of the last of it — with
 * the windows, the garden lights and the pool lit (World/Flora).
 *
 * Its variants' light, and where its sun is, are shared/sky.js's: a baked
 * view's bake is lit by the same.
 */

/**
 * What a material had of its own before the sky's light was shared out —
 * its reflections, the glass's colour, its own glow — kept beside it
 * rather than in its userData: three's Material.clone copies userData
 * through JSON, which leaves a clone a plain object where the texture was
 * (a NaN in its shader) and a number where the colour was.
 */
const OWN_ENV = new WeakMap();
const GLASS_OWN = new WeakMap();
const OWN_EMISSIVE = new WeakMap();

/** Surfaces inside take this much of the sky's light: rooms lit by their windows, not dim (and the people indoors, World/People.js). */
export const INDOOR = 0.8;
/** How much of a room probe's light its room takes (Realism.js): all of it, as captured. */
const PROBE_GAIN = 1.0;

export default class Sky {
    constructor(world, sky) {
        this.world = world;
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.renderer = this.experience.renderer;
        this.names = sky;
        // The sky turned about the upright, light, picture and sun alike.
        this.turn = THREE.MathUtils.degToRad(sky.turn ?? 0);
        this.scene.environmentRotation.set(0, this.turn, 0);
        this.loaded = new Map();
        this.variant = "day";
        // Drawn through post-processing at the steps that ask for it
        // (Utils/device.js's QUALITY_STEPS): the renderer makes and drops
        // it as the slider moves, and keeps the bloom asked for here.
        this.renderer.usePost(true);
        this.renderer.setBloom(false, 0.7);
        // What takes the light of a room probe (useProbe, Realism.js).
        this.indoorMaterials = new Set();
        this.reflectiveMaterials = new Set();
        this.probe = null;
        this.version = 0;
        this.dome = skyDome();
        this.scene.add(this.dome);
        this.ready = this.setVariant("day");
        // The furniture's materials arrive after the sky's: share them out too.
        world.on?.("furniture-ready", () => {
            this.classifyFurniture();
            if (this.current) this.applyIndoor();
        });
    }

    /** A sky's HDR (clipped, as a PMREM) and its picture, loaded once. */
    load(key) {
        const name = this.names[key] || this.names.day;
        if (!this.loaded.has(name)) {
            const base = `/textures/sky/${name}`;
            const hdr = new RGBELoader().setDataType(THREE.FloatType).loadAsync(`${base}_1k.hdr`);
            const picture = new THREE.TextureLoader().loadAsync(`${base}.webp`);
            this.loaded.set(
                name,
                Promise.all([hdr, picture]).then(([texture, image]) => {
                    // The sun clipped out of it, and where it was (shared/sky.js).
                    const sun = findSun(texture.image).direction;
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    texture.needsUpdate = true;
                    const pmrem = new THREE.PMREMGenerator(this.renderer.renderer);
                    const environment = pmrem.fromEquirectangular(texture).texture;
                    const bounced = indoorLight(texture);
                    const indoor = pmrem.fromEquirectangular(bounced).texture;
                    // The dusk's light on the walls, as the developer's dusk
                    // render has it: cool blue-violet, the sunset's warmth
                    // left to the sky's picture and the windows.
                    let dusk = null;
                    if (key === "dusk") {
                        const cooled = indoorLight(texture, { keep: DUSK_KEEP, tint: DUSK_TINT });
                        dusk = pmrem.fromEquirectangular(cooled).texture;
                        cooled.dispose();
                    }
                    pmrem.dispose();
                    texture.dispose();
                    bounced.dispose();
                    image.colorSpace = THREE.SRGBColorSpace;
                    // No mipmaps: where the picture's two edges meet, round
                    // behind the camera, the texture coordinate jumps, and a
                    // mipmapped lookup would draw that seam as a line.
                    image.generateMipmaps = false;
                    image.minFilter = THREE.LinearFilter;
                    return { environment, indoor, dusk, image, sun, horizon: horizonColour(image) };
                })
                // Asked for again next time, rather than failing for ever.
                .catch((error) => {
                    this.loaded.delete(name);
                    throw error;
                })
            );
        }
        return this.loaded.get(name);
    }

    /** A variant's sky loaded, ahead of setVariant; never rejects (setVariant then says why). */
    prepare(variant) {
        return this.load((VARIANTS[variant] || VARIANTS.day).sky).catch(() => null);
    }

    /** The view's exposure under the sky, by day or at night. */
    exposure(variant = this.variant) {
        return (VARIANTS[variant] || VARIANTS.day).exposure;
    }

    /** Day, or night. Resolves once its sky is in. */
    async setVariant(variant) {
        const settings = VARIANTS[variant] || VARIANTS.day;
        const sky = await this.load(settings.sky);
        this.variant = variant;
        this.current = sky;
        const scene = this.scene;
        scene.environment = (variant === "night" && sky.dusk) || sky.environment;
        scene.background = null;
        this.dome.material.uniforms.map.value = sky.image;
        this.dome.material.uniforms.brightness.value = settings.background;
        this.dome.material.uniforms.turn.value = this.turn;
        this.dome.visible = true;

        const environment = this.world.environment;
        environment.ambient.intensity = 0;
        environment.hemisphere.intensity = 0;
        const sun = environment.sun;
        sun.color.set(settings.sunColour);
        sun.intensity = settings.sun;
        sun.visible = settings.sun > 0;
        this.placeSun();

        // Ambient occlusion always; bloom at night, for the lamps and windows.
        this.renderer.setBloom(variant === "night", 0.7);

        // The far ground into the sky's haze at the horizon.
        const haze = sky.horizon.clone().multiplyScalar(settings.haze * (variant === "night" ? 1 : 1.4));
        scene.fog = new THREE.Fog(haze, ...settings.fog);
        this.renderer.setExposure(settings.exposure);
        this.applyIndoor(settings.envIntensity);
        return true;
    }

    /**
     * The sky's light, at the variant's strength (the scene's environment
     * intensity — three r163 lights everything without a map of its own
     * by it); a surface inside takes INDOOR of it, given the sky as a map
     * of its own to weight. What has its own reflections — the cars'
     * studio — keeps them by day and all but loses them at night. Again
     * when materials come: the furniture, after the house.
     */
    applyIndoor(strength = VARIANTS[this.variant].envIntensity) {
        this.strength = strength;
        this.scene.environmentIntensity = strength * (VARIANTS[this.variant].outdoor ?? 1);
        const environment = this.current?.indoor ?? this.scene.environment;
        const night = this.variant === "night";
        this.indoorMaterials.clear();
        this.reflectiveMaterials.clear();
        this.scene.traverse((node) => {
            if (!node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material || !("envMapIntensity" in material) || material.userData.probeLit) continue;
                if (material.userData.bakedTint && !(material.metalness >= 0.5)) {
                    // Lit by the bake's light probes (SceneBuilder's
                    // tintDoors): theirs alone, none of the sky's — with no
                    // map of its own, three would light it by the scene's.
                    material.envMap ??= environment;
                    material.envMapIntensity = 0;
                    continue;
                }
                if (OWN_ENV.has(material) || (material.envMap && !material.userData.skyMap)) {
                    // Its own reflections (reflections.js's studio, the cars'),
                    // or the probe's in their place (useProbe).
                    if (!OWN_ENV.has(material)) OWN_ENV.set(material, material.envMap);
                    material.userData.ownEnvIntensity ??= material.envMapIntensity;
                    material.envMapIntensity = material.userData.ownEnvIntensity * (night ? 0.06 : 1);
                    this.reflectiveMaterials.add(material);
                    continue;
                }
                material.userData.skyShare ??= indoorShare(material);
                if (material.userData.skyShare >= 1) {
                    // The pool: the sky's, or what a probe outside sees.
                    if (isWater(material)) this.reflectiveMaterials.add(material);
                    continue;
                }
                material.envMap = environment;
                material.envMapRotation.copy(this.scene.environmentRotation);
                material.userData.skyMap = true;
                material.envMapIntensity = strength * material.userData.skyShare;
                this.indoorMaterials.add(material);
            }
        });
        this.version++;
        if (this.probe) this.useProbe(this.probe.texture, this.probe.indoor);
    }

    /**
     * Every finish of a piece of furniture, whatever it is called — a TV's
     * screen, a lamp's shade — lit as a room's furnishings are, once the
     * pieces are in and still known as pieces (before the public view merges
     * them): left to the bare sky, a TV indoors reflects the clouds. Its
     * metals and glass keep their own reflections (applyIndoor).
     */
    classifyFurniture() {
        const builder = this.world.sceneBuilder;
        const group = builder?.furnitureGroup;
        if (!group) return;
        const at = new THREE.Vector3();
        // The pieces in a room: a terrace's chairs are lit by the sky (and don't glow at night).
        const indoors = group.children.filter((piece) => {
            piece.getWorldPosition(at);
            const room = builder.roomAt(at.x, at.y + 0.05, at.z);
            return Boolean(room && room.ceiling_finish !== "none");
        });
        for (const piece of indoors) piece.traverse((node) => {
            if (!node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material || !("envMapIntensity" in material) || material.envMap || material.transparent) continue;
                if (material.userData.skyShare !== undefined) continue;
                material.userData.skyShare = indoorShare(material);
                if (material.userData.skyShare >= 1) {
                    material.userData.furnishing = true;
                    material.userData.skyShare = INDOOR;
                }
            }
        });
    }

    /**
     * A room probe's light (Realism.js), or none (null): in a room by
     * day, its surfaces and furniture lit by it in place of their share of
     * the sky — all of its light, since it is the room's own, the sky's
     * share and the sun's patches bounced — and, inside or out, the glass,
     * the metals and the pool reflecting it rather than a studio or the
     * bare sky. The probe is prefiltered at the sky's size, so swapping
     * one for the other needs no new shader.
     */
    useProbe(texture, indoor = false) {
        this.probe = texture ? { texture, indoor } : null;
        const environment = this.current?.indoor ?? this.scene.environment;
        const room = Boolean(texture && indoor);
        for (const material of this.indoorMaterials) {
            material.envMap = room ? texture : environment;
            material.envMapRotation.set(0, 0, 0);
            if (!room) material.envMapRotation.copy(this.scene.environmentRotation);
            material.envMapIntensity = room ? PROBE_GAIN : this.strength * material.userData.skyShare;
        }
        for (const material of this.reflectiveMaterials) {
            const own = OWN_ENV.get(material) ?? null;
            // Windows seen from outside by day reflect the sky, not a studio.
            const sky = this.glassDark && GLASS.test(material.name) ? this.current?.environment : null;
            material.envMap = texture ?? sky ?? own;
            if (texture) material.envMapRotation.set(0, 0, 0);
            else if (sky || !own) material.envMapRotation.copy(this.scene.environmentRotation);
            else material.envMapRotation.set(0, 0, 0);
        }
    }

    /**
     * The windows as a camera sees them: from outside by day, dark and
     * reflective — the rooms behind them far darker than the day, as an
     * exterior photograph shows them — and from inside, or at night, as
     * clear as they are, the garden or the lit rooms through them.
     */
    setGlassView(outside) {
        const dark = Boolean(outside) && this.variant === "day";
        if (dark === this.glassDark && this.glassVersion === this.version) return;
        this.glassDark = dark;
        this.glassVersion = this.version;
        for (const material of this.reflectiveMaterials) {
            if (!GLASS.test(material.name)) continue;
            if (!GLASS_OWN.has(material)) GLASS_OWN.set(material, { color: material.color.clone(), opacity: material.opacity });
            const own = GLASS_OWN.get(material);
            if (dark) {
                material.color.set(GLASS_OUTSIDE.color);
                material.opacity = Math.max(own.opacity, GLASS_OUTSIDE.opacity);
            } else {
                material.color.set(GLASS_INSIDE.color);
                material.opacity = Math.min(own.opacity, GLASS_INSIDE.opacity);
            }
        }
        this.useProbe(this.probe?.texture ?? null, this.probe?.indoor ?? false);
    }

    /** The sun where the sky has it, over the middle of the site (until Realism.js fits it to the view). */
    placeSun() {
        const sun = this.world.environment.sun;
        if (!this.current) return;
        const way = new THREE.Vector3(...sunDirection(this.current.sun, this.names, this.variant));
        sun.position.copy(way).multiplyScalar(160);
        sun.target.position.set(0, 0, 0);
        sun.shadow.camera.far = 400;
        sun.shadow.camera.updateProjectionMatrix();
        sun.shadow.bias = -0.0002;
        sun.shadow.normalBias = 0.03;
        sun.shadow.radius = 1;
        sun.shadow.needsUpdate = true;
    }

    /** A copy of one of its materials (World/LiveBulbs.js), lit as its source is from now on. */
    adopt(copy, source) {
        if (OWN_ENV.has(source)) OWN_ENV.set(copy, OWN_ENV.get(source));
        if (this.indoorMaterials.has(source)) this.indoorMaterials.add(copy);
        if (this.reflectiveMaterials.has(source)) this.reflectiveMaterials.add(copy);
    }

    /**
     * The rooms lit from within, at night: every surface inside glows warm,
     * a little, so the windows show lit rooms — without lights, which,
     * unshadowed, would light the walls' outsides through them.
     */
    glowIndoors(on) {
        // With the light switches drawn live, each lit room glows on its own
        // (World/RoomGlow.js): not every room at once — and a glow from before
        // they came is put back.
        if (on && this.world.roomGlow) return;
        if (!on && !this.glowing) return;
        this.glowing = on;
        // Lamplight at about 2700 K.
        const warm = new THREE.Color("#ffbb7a");
        this.scene.traverse((node) => {
            if (!node.isMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material?.emissive || material.userData.skyShare !== INDOOR) continue;
                // Lit by the bake's light probes: their light is the room's.
                if (material.userData.bakedTint || material.userData.probeLit) continue;
                if (!OWN_EMISSIVE.has(material)) {
                    OWN_EMISSIVE.set(material, { emissive: material.emissive.clone(), intensity: material.emissiveIntensity, map: material.emissiveMap ?? null });
                }
                const own = OWN_EMISSIVE.get(material);
                // A light of its own — a lamp's shade, an LED strip — glows as it does.
                if (own.intensity > 0 && own.emissive.r + own.emissive.g + own.emissive.b > 0) continue;
                if (!material.userData.furnishing) {
                    if (on) material.emissive.copy(warm);
                    else material.emissive.copy(own.emissive);
                    material.emissiveIntensity = on ? 0.42 : own.intensity;
                    continue;
                }
                // The furniture as the room's light shows it: its own
                // colours, warmed, rather than all one glow.
                if (on) {
                    material.emissive.copy(material.color).multiply(warm);
                    material.emissiveMap = material.map ?? null;
                    material.emissiveIntensity = 0.3;
                } else {
                    material.emissive.copy(own.emissive);
                    material.emissiveMap = own.map;
                    material.emissiveIntensity = own.intensity;
                }
                material.needsUpdate = true;
            }
        });
    }

    dispose() {
        this.renderer.usePost(false);
        this.renderer.setBloom(false);
        this.scene.remove(this.dome);
        this.dome.geometry.dispose();
        this.dome.material.dispose();
        for (const promise of this.loaded.values()) {
            promise.then(({ environment, indoor, dusk, image }) => {
                environment.dispose();
                indoor.dispose();
                dusk?.dispose();
                image.dispose();
            });
        }
        if (this.scene.environment) this.scene.environment = null;
    }
}

/** A room's own surfaces: its walls, floors, ceilings and trim. */
const ROOM = /^(paint_|limewash_|ceiling_|oak_(?!veneer)|walnut_|pale_|ceramic_|carpet|stone_paving_floor|herringbone|marble|slate_tile|trim_white|plaster|terrazzo$|bath_tile)/;
/** What furnishes it: the catalogue's upholstery, joinery and fittings. */
const FURNISHING = /^(oak_veneer|ceramic_white|ceramic_dark|lacquer_|linen_|felt_|curtain_|rug_|upholstery_|pleat_|stone_top|terrazzo_top|wood_stump|cab_|worktop|porcelain|fabric_|leather_|tile_)/;

/** The buildings' glass: windows and doors (balustrades stay clear). */
const GLASS = /^glass_solar/;
/** Seen from outside by day: dark, mostly reflection. */
const GLASS_OUTSIDE = { color: "#4b545a", opacity: 0.78 };
/** From inside, or lit rooms at night: near clear, the garden as bright as it is. */
const GLASS_INSIDE = { color: "#eef2f2", opacity: 0.12 };

/** The pool's water (Builders/LandscapeBuilder.js). */
function isWater(material) {
    return material.name === "pool_water";
}

/** How much of the sky's light a material takes: less for an interior finish. */
function indoorShare(material) {
    const name = material.name || "";
    if (FURNISHING.test(name)) {
        material.userData.furnishing = true;
        return INDOOR;
    }
    return ROOM.test(name) ? INDOOR : 1;
}

/**
 * The sky's light as a room gets it: bounced off the ground, the floor and
 * the walls on its way in, it is greyer and warmer than the sky's own —
 * half its colour, under a warm white. A copy of the (clipped) HDR's
 * pixels, for its own PMREM.
 */
function indoorLight(texture, { keep = 0.5, tint = [1.08, 0.98, 0.82] } = {}) {
    const { data, width, height } = texture.image;
    const out = new Float32Array(width * height * 4);
    const warm = tint;
    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
        out[i * 4] = (l + (r - l) * keep) * warm[0];
        out[i * 4 + 1] = (l + (g - l) * keep) * warm[1];
        out[i * 4 + 2] = (l + (b - l) * keep) * warm[2];
        out[i * 4 + 3] = 1;
    }
    const copy = new THREE.DataTexture(out, width, height, THREE.RGBAFormat, THREE.FloatType);
    copy.mapping = THREE.EquirectangularReflectionMapping;
    copy.needsUpdate = true;
    return copy;
}

/** The colour of a sky picture just above the horizon. */
function horizonColour(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image.image, 0, 0, 64, 64);
    // The picture runs from the zenith to a little under the horizon
    // (scripts/fetch-site-assets.mjs): the horizon is ~89% of the way down.
    const row = context.getImageData(0, 54, 64, 3).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < row.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += row[i + k];
    const n = row.length / 4;
    return new THREE.Color().setRGB(sum[0] / n / 255, sum[1] / n / 255, sum[2] / n / 255, THREE.SRGBColorSpace);
}

/**
 * The sky's picture on a dome round the camera, drawn behind everything,
 * mapped as three maps an equirectangular image — so it lines up with the
 * light — over the part of the sky the picture holds (from the zenith to
 * 0.56 of the way down, past the horizon); not fogged, not tone mapped.
 */
function skyDome() {
    const material = new THREE.ShaderMaterial({
        uniforms: { map: { value: null }, brightness: { value: 1 }, turn: { value: 0 } },
        vertexShader: /* glsl */ `
            varying vec3 vDirection;
            void main() {
                vDirection = position;
                gl_Position = ( projectionMatrix * modelViewMatrix * vec4( position, 1.0 ) ).xyww;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform sampler2D map;
            uniform float brightness;
            uniform float turn;
            varying vec3 vDirection;
            void main() {
                vec3 d = normalize( vDirection );
                // Back by the sky's turn, to where it is in the picture.
                float c = cos( -turn );
                float s = sin( -turn );
                d = vec3( d.x * c + d.z * s, d.y, -d.x * s + d.z * c );
                float u = atan( d.z, d.x ) * 0.15915494 + 0.5;
                // From the zenith down, 0 to 1 over the picture's 0.56 of the sky.
                float down = acos( clamp( d.y, -1.0, 1.0 ) ) / 3.14159265 / 0.56;
                vec3 colour = texture2D( map, vec2( u, 1.0 - min( down, 0.995 ) ) ).rgb;
                gl_FragColor = vec4( colour * brightness, 1.0 );
                #include <colorspace_fragment>
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), material);
    dome.name = "sky";
    dome.frustumCulled = false;
    dome.renderOrder = -2;
    dome.raycast = () => {};
    dome.visible = false;
    // Round whichever camera draws it — a room probe's too, whose cameras are a cube's children.
    dome.onBeforeRender = (renderer, scene, camera) => {
        dome.position.setFromMatrixPosition(camera.matrixWorld);
        dome.updateMatrixWorld();
    };
    return dome;
}


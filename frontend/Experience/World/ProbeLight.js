import * as THREE from "three";

/**
 * What moves — the visitors, the car, the furniture's doors and drawers —
 * lit as the house round it is, in a public view lit live
 * (Utils/device.js's lightingMode) — or drawn from the bake, as on a phone,
 * where the house casts no shadow: then with the sun on it as far as the
 * probes say it reaches (`sunFromProbes`), and the room doors' leaves too.
 *
 * The house takes its ambient light from the bake (SceneBuilder); what
 * moves has none baked, and a sky's worth of hemisphere light — the same
 * in the cellar as on the lawn — lit it as if it stood outdoors. Instead
 * the bake measures the light through the house at a grid of points
 * (blender/bake_public.py's probe_grid), each point from six ways: the
 * light on a surface facing up, down and each way round, there. Each thing
 * that moves takes the light of the points round it, blended by how near
 * each is, those in the room it is in first — so the living room's light
 * does not come through the wall from the hall — and lights each of its
 * surfaces by the way it faces. On top of that, as on the house, the live
 * sun and the live lamps, with their shadows.
 *
 * Like the house's lightmap, the probes hold all of the light but what is
 * drawn live: the sky's and everything bounced, and each switch that is on
 * — only what its lamps bounce when they are lit live (LiveLamps), all of
 * it when not.
 *
 * Its reflections (a car's paint, its chrome) are of a studio, the same
 * everywhere; they are dimmed as its light is, so a car in the garage or
 * out at night does not shine as it does in the sun.
 */

/** How fast what moves takes on the light where it now is, per second. */
const ADAPT = 8;
/** Reflections at least this share of their daylight strength. */
const LEAST_REFLECTION = 0.02;

const _position = new THREE.Vector3();
const _box = new THREE.Box3();
const LIT = ["isMeshStandardMaterial", "isMeshLambertMaterial", "isMeshPhongMaterial"];

export default class ProbeLight {
    /**
     * @param {World} world  drawing a public view
     * @param {object} description  the bake's `probes` (write_grid)
     * @param {ArrayBuffer} buffer  its file
     * @param {object} [options]
     * @param {boolean} [options.sunFromProbes]  drawn from the bake, where
     *        the house casts no shadow: the sun on what moves as much as the
     *        probes round it say reaches them
     */
    constructor(world, description, buffer, { sunFromProbes = false } = {}) {
        this.world = world;
        this.builder = world.sceneBuilder;
        const [nx, ny, nz] = description.size;
        this.size = description.size;
        this.origin = description.origin;
        this.step = description.step;
        this.count = nx * ny * nz;
        this.zoneIds = description.zoneIds;
        this.outside = description.zoneIds.indexOf("outside");

        const view = new DataView(buffer);
        this.zoneOf = new Uint8Array(buffer, description.zones, this.count);
        this.sunFromProbes = sunFromProbes;
        // Each variant's light, at every point: in a file of layout 2, kept
        // for the points that measure light alone, in order, with how much
        // of the sun reaches each.
        const measured = [];
        for (let index = 0; index < this.count; index++) if (this.zoneOf[index] !== 255) measured.push(index);
        this.variants = {};
        this.sunOf = {};
        for (const [name, entry] of Object.entries(description.variants)) {
            if (description.layout === 2) {
                const kept = halfs(view, entry.light, measured.length * 18);
                const light = new Float32Array(this.count * 18);
                measured.forEach((index, k) => light.set(kept.subarray(k * 18, k * 18 + 18), index * 18));
                this.variants[name] = light;
                const sun = new Float32Array(this.count).fill(1);
                if (entry.sun !== undefined) {
                    const bytes = new Uint8Array(buffer, entry.sun, measured.length);
                    measured.forEach((index, k) => (sun[index] = bytes[k] / 255));
                }
                this.sunOf[name] = sun;
            } else {
                this.variants[name] = halfs(view, entry, this.count * 18);
                this.sunOf[name] = new Float32Array(this.count).fill(1);
            }
        }
        this.switches = description.switches.map(
            (entry) =>
                entry && {
                    indices: uint16s(view, entry.indices, entry.count),
                    full: halfs(view, entry.full, entry.count * 18),
                    indirect: halfs(view, entry.indirect, entry.count * 18),
                }
        );
        this.light = new Float32Array(this.count * 18);
        this.key = null;
        // Daylight's reflections: as bright as the open garden by day.
        this.reference = reference(this.variants.day ?? Object.values(this.variants)[0], this.zoneOf, this.outside);
        /** root -> what lights it: its six ways' light, and its materials */
        this.tracked = new Map();
        /** mesh -> the material it was last given, and what it had before */
        this.dressed = new WeakMap();
        this.undressed = new Map();
    }

    update(delta) {
        this.compose();
        const roots = this.roots();
        for (const [root, entry] of this.tracked) if (!roots.has(root)) this.tracked.delete(root);
        const blend = Math.min(1, ADAPT * delta);
        for (const [root, lift] of roots) {
            let entry = this.tracked.get(root);
            if (!entry) {
                entry = { cube: Array.from({ length: 6 }, () => new THREE.Vector3()), sun: { value: 1 }, fresh: true, factor: 1 };
                this.tracked.set(root, entry);
            }
            this.dress(root, entry);
            root.getWorldPosition(_position);
            const room = this.builder.roomAt(_position.x, _position.y, _position.z);
            _position.y += lift;
            const target = this.sample(_position, room?.id ?? "outside");
            if (!target) continue;
            const k = entry.fresh ? 1 : blend;
            entry.fresh = false;
            if (this.sunFromProbes) entry.sun.value += (this.sunNow - entry.sun.value) * k;
            let total = 0;
            for (let f = 0; f < 6; f++) {
                const c = entry.cube[f];
                c.x += (target[f * 3] - c.x) * k;
                c.y += (target[f * 3 + 1] - c.y) * k;
                c.z += (target[f * 3 + 2] - c.z) * k;
                total += 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z;
            }
            entry.factor = THREE.MathUtils.clamp(total / 6 / this.reference, LEAST_REFLECTION, 1);
            for (const material of entry.materials) {
                if (material.envMap) material.envMapIntensity = material.userData.probeEnvMapIntensity * entry.factor;
            }
        }
    }

    /**
     * What moves, and how far above where it stands its light is taken: the
     * visitor's own avatar and everyone else's, the cars, and the
     * furniture's doors and drawers (Openables.js), which are not baked.
     */
    roots() {
        const roots = new Map();
        for (const part of this.builder.openables?.parts || []) roots.set(part.node, 0);
        // Drawn from the bake, the doors' leaves too, which lit live take
        // their light from probes of their own (SceneBuilder.tintDoors).
        if (this.sunFromProbes) for (const door of this.builder.doors || []) for (const { leaf } of door.leaves) roots.set(leaf, 0);
        const player = this.world.player;
        if (player?.avatar) roots.set(player.avatar.avatar, 1.0);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) roots.set(other.model.avatar, 1.0);
        for (const car of this.builder.cars || []) roots.set(car.group, 0.3);
        return roots;
    }

    /**
     * Light each of the lit surfaces under `root` from the probes: each
     * mesh given materials of its own, which take their ambient light from
     * the probes' — and nothing of the scene's own ambient light. Done again
     * for any mesh whose material has changed, as a car's does when it is
     * swapped for another.
     */
    dress(root, entry) {
        entry.materials ??= new Set();
        root.traverse((mesh) => {
            if (!mesh.isMesh || this.dressed.get(mesh) === mesh.material) return;
            const own = (material) => {
                if (!material || !LIT.some((flag) => material[flag])) return material;
                if (entry.materials.has(material)) return material;
                const clone = material.clone();
                clone.userData.probeLit = true;
                clone.userData.probeEnvMapIntensity = material.userData.envMapIntensity ?? material.envMapIntensity ?? 1;
                lightByProbes(clone, entry.cube, entry.sun);
                entry.materials.add(clone);
                return clone;
            };
            if (!this.undressed.has(mesh)) this.undressed.set(mesh, mesh.material);
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
            this.dressed.set(mesh, mesh.material);
        });
    }

    /** What moves back as it was, lit by the scene's own ambient light. */
    dispose() {
        for (const [mesh, material] of this.undressed) {
            if (this.dressed.get(mesh) === mesh.material) mesh.material = material;
        }
        for (const entry of this.tracked.values()) for (const material of entry.materials ?? []) material.dispose();
        this.undressed.clear();
        this.tracked.clear();
    }

    /**
     * The probes' light as it is now: the variant's, and each switch that
     * is on — what its lamps bounce when they are lit live, all of it when
     * not — added up once, as they change.
     */
    compose() {
        const variant = this.world.lighting;
        const weights = this.builder.switchWeights || [];
        const live = this.builder.switchLive || [];
        const key = `${variant}|${weights.join(",")}|${live.map(Number).join("")}|${this.builder.doorLightVersion ?? 0}`;
        if (key === this.key) return;
        this.key = key;
        const base = this.variants[variant];
        if (!base) return;
        this.light.set(base);
        this.sun = this.sunOf[variant];
        // A room keeps as much of its light as its doors, as they are, let
        // stay (SceneBuilder.zoneStays).
        const stays = this.zoneIds.map((zone) => this.builder.zoneStays?.(zone) ?? 1);
        if (stays.some((share) => share < 0.999)) {
            for (let index = 0; index < this.count; index++) {
                const share = stays[this.zoneOf[index]];
                if (share === undefined || share > 0.999) continue;
                for (let c = index * 18, end = c + 18; c < end; c++) this.light[c] *= share;
            }
        }
        this.switches.forEach((entry, index) => {
            const weight = weights[index] ?? 0;
            if (!entry || !weight) return;
            const values = live[index] ? entry.indirect : entry.full;
            // Next door through doors alone, as far as they are open.
            const reach = this.zoneIds.map((zone) => this.builder.switchReach?.(index, zone) ?? 1);
            const { indices } = entry;
            for (let j = 0; j < indices.length; j++) {
                const at = indices[j] * 18;
                const from = j * 18;
                const scaled = weight * (reach[this.zoneOf[indices[j]]] ?? 1);
                for (let c = 0; c < 18; c++) this.light[at + c] += values[from + c] * scaled;
            }
        });
    }

    /**
     * The light at a point, from the eight probes round it, blended by how
     * near each is: those in the room `zone` — the one the point stands in —
     * if any of them are, else any that measure light. Beyond the grid, its
     * edge's. Null if none of the eight measure anything.
     */
    sample(point, zone) {
        const [nx, ny, nz] = this.size;
        const cell = [0, 0, 0];
        const t = [0, 0, 0];
        const n = [nx, ny, nz];
        const p = [point.x, point.y, point.z];
        for (let a = 0; a < 3; a++) {
            const f = THREE.MathUtils.clamp((p[a] - this.origin[a]) / this.step[a], 0, n[a] - 1);
            cell[a] = Math.min(Math.floor(f), Math.max(0, n[a] - 2));
            t[a] = n[a] > 1 ? f - cell[a] : 0;
        }
        const own = this.zoneIds.indexOf(zone);
        const out = (this.out ??= new Float32Array(18));
        for (const sameRoom of [true, false]) {
            out.fill(0);
            let total = 0;
            let sun = 0;
            for (let corner = 0; corner < 8; corner++) {
                const dx = corner & 1;
                const dy = (corner >> 1) & 1;
                const dz = (corner >> 2) & 1;
                const ix = Math.min(cell[0] + dx, nx - 1);
                const iy = Math.min(cell[1] + dy, ny - 1);
                const iz = Math.min(cell[2] + dz, nz - 1);
                const index = ix + nx * (iy + ny * iz);
                const at = this.zoneOf[index];
                if (at === 255 || (sameRoom && at !== own)) continue;
                const weight = (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]);
                if (weight <= 0) continue;
                total += weight;
                const from = index * 18;
                for (let c = 0; c < 18; c++) out[c] += this.light[from + c] * weight;
                sun += (this.sun?.[index] ?? 1) * weight;
            }
            if (total > 1e-6) {
                for (let c = 0; c < 18; c++) out[c] /= total;
                this.sunNow = sun / total;
                return out;
            }
        }
        return null;
    }
}

/**
 * A lit material that takes its ambient light from the probes' six ways
 * (`cube`, updated as it moves): a surface facing up gets the light the
 * probes measured facing up, one facing sideways and up a blend of the
 * two — and none of the scene's ambient, hemisphere or probe light.
 */
function lightByProbes(material, cube, sun) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.probeCube = { value: cube };
        shader.uniforms.probeSun = sun;
        const begin = THREE.ShaderChunk.lights_fragment_begin;
        const without = [
            ["vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = probeIrradiance( geometryNormal );"],
            ["irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );", ""],
            ["irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", ""],
            // The sun, as much of it as reaches here (sunFromProbes).
            ["getDirectionalLightInfo( directionalLight, directLight );", "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= probeSun;"],
        ];
        if (without.some(([line]) => !begin.includes(line))) console.warn("Probe light not applied: three's shader has changed");
        const own = without.reduce((code, [line, instead]) => code.replace(line, instead), begin);
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>\n${PROBE_GLSL}`)
            .replace("#include <lights_fragment_begin>", own);
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|probe-light`;
    material.needsUpdate = true;
}

/**
 * The probes' light on a surface facing `normal` (in view space): the six
 * ways' light, each by the square of how much the surface faces that way
 * (an "ambient cube"), as irradiance — π times what a probe stores, which
 * is as a lightmap stores it.
 */
const PROBE_GLSL = /* glsl */ `
uniform vec3 probeCube[ 6 ];
uniform float probeSun;
vec3 probeIrradiance( const in vec3 normal ) {
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec3 s = n * n;
	return PI * (
		s.x * ( n.x >= 0.0 ? probeCube[ 0 ] : probeCube[ 1 ] ) +
		s.y * ( n.y >= 0.0 ? probeCube[ 2 ] : probeCube[ 3 ] ) +
		s.z * ( n.z >= 0.0 ? probeCube[ 4 ] : probeCube[ 5 ] ) );
}
`;

/** How bright daylight is in the open: the average light at the brightest tenth of the probes outside. */
function reference(light, zoneOf, outside) {
    const levels = [];
    for (let index = 0; index < zoneOf.length; index++) {
        if (zoneOf[index] !== outside) continue;
        let sum = 0;
        for (let f = 0; f < 6; f++) {
            const at = index * 18 + f * 3;
            sum += 0.2126 * light[at] + 0.7152 * light[at + 1] + 0.0722 * light[at + 2];
        }
        levels.push(sum / 6);
    }
    if (!levels.length) return 1;
    levels.sort((a, b) => a - b);
    return Math.max(levels[Math.floor(levels.length * 0.9)], 1e-4);
}

/** `count` little-endian 16-bit unsigned integers from `offset`. */
function uint16s(view, offset, count) {
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++) out[i] = view.getUint16(offset + i * 2, true);
    return out;
}

/** `count` little-endian half floats from `offset`, as floats. */
function halfs(view, offset, count) {
    const table = halfTable();
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = table[view.getUint16(offset + i * 2, true)];
    return out;
}

let table = null;
function halfTable() {
    if (table) return table;
    table = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
        const sign = h & 0x8000 ? -1 : 1;
        const exponent = (h >> 10) & 0x1f;
        const fraction = h & 0x3ff;
        if (exponent === 0) table[h] = sign * 2 ** -14 * (fraction / 1024);
        else if (exponent === 31) table[h] = fraction ? NaN : sign * Infinity;
        else table[h] = sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    }
    return table;
}

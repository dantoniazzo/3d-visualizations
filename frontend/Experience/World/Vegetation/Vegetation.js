import * as THREE from "three";

import Experience from "../../Experience.js";
import { buildOctree } from "../Collision.js";
import { LOW_POWER } from "../../Utils/device.js";
import { lawnRooms, planTrees } from "../../../../shared/vegetation.js";
import { buildTrees, scatterGrass, tuftGeometry } from "./build.js";
import { barkMaterial, canopyMaterial, grassMaterial, uniforms } from "./shaders.js";

/**
 * The garden: grass growing on every lawn, and trees on the bigger ones
 * (shared/vegetation.js says where), in the walkthrough, the editor and
 * the public view alike. Drawn live — the wind moves them — and so neither
 * published nor baked; the bake is told of the trees, and casts their
 * shade on the lawn and the house (blender/bake_public.py).
 *
 * The grass is drawn square by square (build.js's CHUNK), each square only
 * when it is on screen, and thinned the further off it is: past the
 * distance its blades are too small to tell, only the lawn is left.
 *
 * Its light is the view's:
 *   - live, the scene's sun and sky, and the sun's shadow;
 *   - in a baked view, which has neither, the grass takes the light baked
 *     into the lawn under each tuft, and the trees the sun and sky the
 *     bake was lit by, day or night (setLight).
 */

/** Tufts a square metre, and how far off a square is drawn whole, thinned, and not at all. */
const GRASS = LOW_POWER ? { density: 9, near: 9, far: 30, gone: 55 } : { density: 18, near: 16, far: 50, gone: 85 };
/** The least of a thinned square's tufts still drawn, short of `gone`. */
const THINNEST = 0.12;

/**
 * The sun and the sky as the bake has them (scripts/bake-public.mjs's
 * settings): by day the preset's sun, in W/m², and its sky; by night the
 * moon and a dark sky.
 */
const NIGHT = { sun: { color: "#b8c8ff", intensity: 0.08, position: [-9, 16, -6] }, sky: ["#1a2440", "#2a3350"], skyStrength: 0.05 };

const _camera = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _position = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export default class Vegetation {
    /**
     * @param {World} world  its scene builder and environment made
     */
    constructor(world) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.world = world;
        this.spec = world.spec;

        this.group = new THREE.Group();
        this.group.name = "vegetation";
        this.scene.add(this.group);

        const loader = new THREE.TextureLoader();
        // Both are shapes — their alpha — and nothing else.
        const texture = (url) => {
            const map = loader.load(url);
            map.colorSpace = THREE.NoColorSpace;
            map.anisotropy = 4;
            return map;
        };
        this.tuftTexture = texture("/textures/vegetation/grass-tuft.png");
        this.leafTexture = texture("/textures/vegetation/leaves.png");

        this.trees = planTrees(this.spec);
        this.buildTrees();
        this.buildGrass();
        this.setLight("day");
    }

    buildTrees() {
        if (!this.trees.length) return;
        const { wood, leaves, trunks } = buildTrees(this.trees);
        this.wood = new THREE.Mesh(wood, barkMaterial());
        this.leaves = new THREE.Mesh(leaves, canopyMaterial(this.leafTexture));
        for (const mesh of [this.wood, this.leaves]) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.group.add(mesh);
        }
        // Their trunks, to walk into.
        const collider = new THREE.Mesh(trunks);
        collider.updateMatrixWorld(true);
        this.world.collision.setOutdoor(buildOctree([collider]));
        trunks.dispose();
    }

    buildGrass() {
        const lawns = lawnRooms(this.spec);
        this.geometry = tuftGeometry();
        this.grassMaterial = grassMaterial(this.tuftTexture);
        this.chunks = scatterGrass(lawns, this.trees, GRASS.density).map(({ centre, tufts }) => {
            const mesh = new THREE.InstancedMesh(this.geometry, this.grassMaterial, tufts.length);
            const tints = new Float32Array(tufts.length);
            tufts.forEach((tuft, i) => {
                _quaternion.setFromAxisAngle(_up, tuft.turn);
                _scale.set(tuft.width, tuft.height, tuft.width);
                mesh.setMatrixAt(i, _matrix.compose(_position.set(tuft.x, tuft.y, tuft.z), _quaternion, _scale));
                tints[i] = tuft.tint;
            });
            mesh.instanceMatrix.needsUpdate = true;
            // Each tuft's own: its shade of green, and, once the view is
            // baked, where the lawn under it is in the lightmap.
            mesh.geometry = this.geometry.clone();
            mesh.geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
            mesh.computeBoundingSphere();
            mesh.receiveShadow = true;
            mesh.name = "grass";
            this.group.add(mesh);
            return { mesh, centre, tufts, total: tufts.length };
        });
    }

    /**
     * The sun's and the sky's light on the trees, and the sun's direction
     * for the grass and the leaves: as the bake has them, for day or night.
     */
    setLight(variant) {
        const preset = this.world.environment?.preset;
        if (!preset) return;
        const night = variant === "night";
        const sun = night ? NIGHT.sun : preset.sun;
        uniforms.uSunDirection.value.set(...sun.position).normalize();
        // Blender's sun is irradiance, W/m²: what a white surface facing
        // it gives back is that over π.
        uniforms.uSunLight.value.set(sun.color).multiplyScalar(sun.intensity / Math.PI);
        const [zenith, horizon] = night ? NIGHT.sky : [preset.hemi.sky, preset.background];
        uniforms.uSkyLight.value
            .set(zenith)
            .lerp(new THREE.Color(horizon), 0.5)
            .multiplyScalar(night ? NIGHT.skyStrength : 1);
    }

    /**
     * Light the grass as the lawn under it is lit: with the light baked
     * into the lawn's lightmap, at each tuft's root. The first time, finds
     * where that is — the lawn's triangle under each tuft, and its
     * lightmap UV there — and turns the grass to the baked material.
     *
     * @param {SceneBuilder} builder  drawing the baked view
     * @param {object} info  the variant's lighting (its scale, encoding, storage)
     * @param {THREE.Texture} luma  its lightmap, or its brightness alone
     * @param {THREE.Texture} [chroma]  its colour, when stored apart
     */
    useGroundLight(builder, info, luma, chroma = null) {
        if (!this.chunks?.length) return;
        if (!this.groundUvs) this.groundUvs = this.findGroundUvs(builder);
        if (!this.groundUvs) return;
        const storage = chroma && info.storage === "ycocg" ? "ycocg" : "colour";
        const key = `${info.encoding}|${storage}`;
        if (this.groundKey !== key) {
            this.groundKey = key;
            this.bakedGrass?.dispose();
            this.bakedGrass = grassMaterial(this.tuftTexture, { encoding: info.encoding, storage });
            for (const { mesh } of this.chunks) mesh.material = this.bakedGrass;
        }
        uniforms.uGroundLuma.value = luma;
        uniforms.uGroundChroma.value = chroma ?? luma;
        uniforms.uGroundScale.value = info.scale;
    }

    /**
     * Each tuft's lightmap UV: the lawn's baked meshes' upward triangles,
     * binned by where they are, each tuft's root found in one and the UV
     * there interpolated. Null if the view has no lawn in its lightmap.
     */
    findGroundUvs(builder) {
        const lawns = new Set(lawnRooms(this.spec).map((room) => room.floor_finish));
        const triangles = [];
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        for (const mesh of builder.batches?.children ?? []) {
            const geometry = mesh.geometry;
            const uv = geometry.getAttribute("uv1");
            if (!uv || mesh.userData.lighting !== "lightmap" || !lawns.has(mesh.material?.name)) continue;
            const position = geometry.getAttribute("position");
            const index = geometry.index;
            const count = index ? index.count : position.count;
            mesh.updateMatrixWorld(true);
            for (let i = 0; i < count; i += 3) {
                const [i0, i1, i2] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
                a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
                b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
                c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
                // The lawn's top, not its edges or its underside.
                const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
                if (Math.abs(ny) < 1e-9) continue;
                triangles.push({
                    p: [a.x, a.z, b.x, b.z, c.x, c.z],
                    uv: [uv.getX(i0), uv.getY(i0), uv.getX(i1), uv.getY(i1), uv.getX(i2), uv.getY(i2)],
                    y: (a.y + b.y + c.y) / 3,
                });
            }
        }
        if (!triangles.length) return null;

        const CELL = 2;
        const bins = new Map();
        const cell = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
        for (const triangle of triangles) {
            const [ax, az, bx, bz, cx, cz] = triangle.p;
            for (let x = Math.floor(Math.min(ax, bx, cx) / CELL); x <= Math.floor(Math.max(ax, bx, cx) / CELL); x++) {
                for (let z = Math.floor(Math.min(az, bz, cz) / CELL); z <= Math.floor(Math.max(az, bz, cz) / CELL); z++) {
                    const key = `${x},${z}`;
                    if (!bins.has(key)) bins.set(key, []);
                    bins.get(key).push(triangle);
                }
            }
        }

        let missed = 0;
        const none = new THREE.Matrix4().makeScale(0, 0, 0);
        for (const chunk of this.chunks) {
            const uvs = new Float32Array(chunk.tufts.length * 2);
            chunk.tufts.forEach((tuft, i) => {
                const found = groundUv(bins.get(cell(tuft.x, tuft.z)) ?? [], tuft);
                if (found) {
                    uvs[i * 2] = found[0];
                    uvs[i * 2 + 1] = found[1];
                    return;
                }
                // Over a hole in the baked lawn, it would have no light of its own.
                missed += 1;
                chunk.mesh.setMatrixAt(i, none);
                chunk.mesh.instanceMatrix.needsUpdate = true;
            });
            chunk.mesh.geometry.setAttribute("aGroundUv", new THREE.InstancedBufferAttribute(uvs, 2));
        }
        if (missed) console.info(`Grass: ${missed} tufts over no baked lawn`);
        return true;
    }

    /** The wind, and each square of grass as thick as its distance calls for. */
    update(delta) {
        uniforms.uTime.value += delta;
        if (!this.chunks) return;
        this.experience.camera.perspectiveCamera.getWorldPosition(_camera);
        for (const chunk of this.chunks) {
            const distance = _camera.distanceTo(chunk.centre);
            let share = 1;
            if (distance >= GRASS.gone) share = 0;
            else if (distance > GRASS.near) share = Math.max(THINNEST, 1 - (distance - GRASS.near) / (GRASS.far - GRASS.near));
            const count = Math.round(chunk.total * share);
            chunk.mesh.count = count;
            chunk.mesh.visible = count > 0;
        }
    }

    dispose() {
        this.scene.remove(this.group);
        for (const chunk of this.chunks ?? []) chunk.mesh.geometry.dispose();
        this.geometry?.dispose();
        this.wood?.geometry.dispose();
        this.leaves?.geometry.dispose();
        this.grassMaterial?.dispose();
        this.bakedGrass?.dispose();
        this.tuftTexture.dispose();
        this.leafTexture.dispose();
    }
}

/** The lightmap UV of the lawn under a tuft, from the triangles near it, or null. */
function groundUv(triangles, { x, y, z }) {
    for (const { p, uv, y: height } of triangles) {
        if (Math.abs(height - y) > 0.5) continue;
        const [ax, az, bx, bz, cx, cz] = p;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const w = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
        return [u * uv[0] + v * uv[2] + w * uv[4], u * uv[1] + v * uv[3] + w * uv[5]];
    }
    return null;
}


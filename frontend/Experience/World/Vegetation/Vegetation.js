import * as THREE from "three";

import Experience from "../../Experience.js";
import { buildOctree } from "../Collision.js";
import { LOW_POWER, movingShadowsOnly } from "../../Utils/device.js";
import { gardenSettings } from "../../../../shared/garden.js";
import { lawnRooms, planBushes, planFence, planHillTrees, planHills, planTrees } from "../../../../shared/vegetation.js";
import { bladeChunks, bladeMap, buildBushes, hillGrass, lawnPieces, tuftGeometry } from "./build.js";
import { applySettings, barkMaterial, bladeMaterial, canopyMaterial, lawnMaterial, tuftDepthMaterial, tuftMaterial, uniforms } from "./shaders.js";

/**
 * The garden: grass on every lawn and on the small hills behind the house,
 * Fluffy Tree's trees in the back garden and on the hills, and bushes
 * along the fence (shared/vegetation.js says where), in the walkthrough,
 * the editor and the public view alike. Drawn live — the wind moves them —
 * and so neither published nor baked; the bake is told of the trees and
 * the bushes, and casts their shade on the lawn and the house
 * (blender/bake_public.py). The ground under it all — Fluffy Tree's sand to
 * green — the fence and the hills themselves are the house's own
 * (SceneBuilder).
 *
 *   - The lawns' grass is the sketches' blades, one by one (shaders.js's
 *     bladeMaterial), over the lawns' shells if the garden has them.
 *   - The hills' grass is Fluffy Tree's cards, in patches.
 *   - The trees are Fluffy Tree's tree (public/models/fluffy-tree.glb),
 *     one instance each, sized and turned as the plan says.
 *
 * All of it grows as the garden's settings say (shared/garden.js), and
 * grows again when the editor's Garden panel changes them (settingsChanged):
 * only what those changes touch is grown again; the rest — colours, wind,
 * light, sizes, how far off each is drawn — follows at once.
 *
 * Each is cut into squares (build.js's CHUNK), each drawn only when on
 * screen and near enough, a far square of blades with fewer of them.
 *
 * Its light is Fluffy Tree's (shaders.js), its sun the view's:
 *   - live, the scene's sun, and its shadow;
 *   - in a baked view, which has no shadows, the grass takes the sun's
 *     shade — or at night, its light — from the lightmap of the ground it
 *     grows from, and the trees the sun or the moon the bake was lit by
 *     (setLight).
 */

/** Fluffy Tree's tree, stood at the origin. */
const TREE_MODEL = "/models/fluffy-tree.glb";
/** The shells: how many layers, how high the blades stand, and how far off they shorten to nothing. */
const LAWN = LOW_POWER ? { shells: 8, height: 0.04, fadeStart: 2, fadeEnd: 9 } : { shells: 16, height: 0.045, fadeStart: 3, fadeEnd: 16 };
/** On a phone, this much of the grass the settings ask for, and drawn this far of the way. */
const LOW = LOW_POWER ? { density: 0.4, distance: 0.6 } : { density: 1, distance: 1 };
/** A square of blades has them all up to this share of their draw distance, then fewer, down to the least share. */
const BLADES_NEAR = 0.3;
const THINNEST = 0.15;

/**
 * The sun and the sky as the bake has them (scripts/bake-public.mjs's
 * settings): by day the preset's sun, in W/m², and its sky; by night the
 * moon and a dark sky.
 */
const NIGHT = { sun: { color: "#b8c8ff", intensity: 0.08, position: [-9, 16, -6] }, sky: ["#1a2440", "#2a3350"], skyStrength: 0.05 };

const _camera = new THREE.Vector3();

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
        // Drawn from the bake on a phone, the trees' and bushes' shade is
        // baked, and the sun's shadow map is what moves alone.
        this.castsShadows = !movingShadowsOnly(this.experience.published?.lighting);
        this.scene.add(this.group);

        // The bushes' leaves: their shape, as Fluffy Tree's tree's are (an
        // alpha map of the same texture, read as its own is).
        this.leafTexture = new THREE.TextureLoader().load("/textures/vegetation/leaves.png");
        this.leafTexture.colorSpace = THREE.SRGBColorSpace;
        this.leafTexture.anisotropy = 4;

        this.settings = gardenSettings(this.spec);
        applySettings(this.settings);
        this.grow();
        this.setLight("day");
    }

    /**
     * The garden's settings have changed (the editor's Garden panel, into
     * the spec): what they change the look of follows now, and — once the
     * change has settled — whatever they change the shape of is grown again.
     */
    settingsChanged(settled = true) {
        this.settings = gardenSettings(this.spec);
        applySettings(this.settings);
        if (settled) this.grow();
        else this.fit();
    }

    /** Grow what has not been grown for these settings yet. */
    grow() {
        const { hills, trees, tufts, blades, shells } = this.settings;
        const keys = {
            plan: JSON.stringify([hills, trees]),
            tufts: JSON.stringify([hills, trees, tufts.density, tufts.coverage, tufts.patchSize]),
            blades: JSON.stringify([trees, blades.enabled, blades.density, blades.joints]),
            shells: JSON.stringify([shells.enabled]),
        };
        const stale = (name) => this.grown?.[name] !== keys[name];
        if (stale("plan")) {
            this.plan();
            this.buildBushes();
            this.buildTrees();
        }
        if (stale("tufts")) this.buildHillGrass();
        if (stale("blades")) this.buildBlades();
        if (stale("shells")) this.buildLawn();
        this.grown = keys;
        this.fit();
    }

    /** Where the trees, the bushes and the hills are. */
    plan() {
        const gardenTrees = planTrees(this.spec);
        this.hills = planHills(this.spec);
        this.trees = [...gardenTrees, ...planHillTrees(this.spec, this.hills)];
        this.bushes = planBushes(this.spec, planFence(this.spec), gardenTrees);
    }

    /**
     * The trees: Fluffy Tree's, once it has loaded — each of its parts one
     * instanced mesh, an instance a tree, stood where the plan has it, as
     * big as it says and turned — and a trunk for each to walk into, now.
     */
    buildTrees() {
        for (const mesh of this.treeMeshes ?? []) {
            this.group.remove(mesh);
            mesh.material.dispose();
            mesh.dispose();
        }
        this.treeMeshes = [];
        const trees = this.trees;
        const token = (this.treeToken = (this.treeToken ?? 0) + 1);

        const trunks = new THREE.Group();
        for (const tree of trees) {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(tree.trunk, tree.trunk, 2.4, 8));
            trunk.position.set(tree.x, tree.y + 1.2, tree.z);
            trunks.add(trunk);
        }
        this.world.collision.setOutdoor(buildOctree([trunks]));
        for (const trunk of trunks.children) trunk.geometry.dispose();
        if (!trees.length) return;

        this.treeModel ??= this.experience.resources.loaders.gltfLoader.loadAsync(TREE_MODEL);
        this.treeModel
            .then((gltf) => {
                if (!this.disposed && token === this.treeToken) this.placeTrees(gltf, trees);
            })
            .catch((error) => console.warn("Could not load the trees:", error.message));
    }

    placeTrees(gltf, trees) {
        const at = new THREE.Vector3();
        const turn = new THREE.Quaternion();
        const size = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const placed = trees.map((tree) => new THREE.Matrix4().compose(at.set(tree.x, tree.y, tree.z), turn.setFromAxisAngle(up, tree.turn), size.setScalar(tree.scale)));
        const matrix = new THREE.Matrix4();
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((part) => {
            if (!part.isMesh) return;
            // Its crown's clumps are textured, its trunk not.
            const crown = Boolean(part.material.map);
            let material;
            if (crown) {
                part.geometry.computeBoundingBox();
                material = canopyMaterial(part.material.map, part.geometry.boundingBox.getCenter(new THREE.Vector3()));
            } else {
                material = barkMaterial(part.material.color);
            }
            const mesh = new THREE.InstancedMesh(part.geometry, material, trees.length);
            placed.forEach((m, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(m, part.matrixWorld)));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.castShadow = this.castsShadows;
            mesh.receiveShadow = true;
            mesh.name = crown ? "tree-leaves" : "tree-trunks";
            this.group.add(mesh);
            this.treeMeshes.push(mesh);
        });
    }

    /** The bushes' leaves, one mesh for all of them. */
    buildBushes() {
        if (this.bushLeaves) {
            this.group.remove(this.bushLeaves);
            this.bushLeaves.geometry.dispose();
            this.bushLeaves = null;
        }
        if (!this.bushes.length) return;
        this.bushMaterial ??= canopyMaterial(this.leafTexture);
        this.bushLeaves = new THREE.Mesh(buildBushes(this.bushes), this.bushMaterial);
        this.bushLeaves.castShadow = this.castsShadows;
        this.bushLeaves.receiveShadow = true;
        this.bushLeaves.name = "bushes";
        this.group.add(this.bushLeaves);
    }

    /**
     * The lawns' blades, square by square: one blade, drawn once an
     * instance, its root and its random numbers each instance's own.
     */
    buildBlades() {
        for (const chunk of this.bladeChunks ?? []) {
            this.group.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
        }
        this.bladeChunks = null;
        const { enabled, density, joints } = this.settings.blades;
        const lawns = lawnRooms(this.spec);
        if (!enabled || !density || !lawns.length) return;
        if (!this.bladeAlpha) {
            this.bladeAlpha = new THREE.TextureLoader().load("/textures/vegetation/grass-blade.jpg");
            this.bladeAlpha.colorSpace = THREE.NoColorSpace;
        }
        this.bladeLive ??= bladeMaterial(this.bladeAlpha);
        const blade = new THREE.PlaneGeometry(1, 1, 1, joints).translate(0, 0.5, 0);
        this.bladeChunks = bladeChunks(lawns, this.trees, density * LOW.density).map(({ box, roots, randoms, count }) => {
            const geometry = new THREE.InstancedBufferGeometry();
            geometry.index = blade.index;
            for (const name of ["position", "normal", "uv"]) geometry.setAttribute(name, blade.getAttribute(name));
            geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(roots, 3));
            geometry.setAttribute("aRandom", new THREE.InstancedBufferAttribute(randoms, 4));
            geometry.instanceCount = count;
            const mesh = new THREE.Mesh(geometry, this.bladeBaked ?? this.bladeLive);
            mesh.receiveShadow = true;
            mesh.name = "grass-blades";
            mesh.visible = false;
            this.group.add(mesh);
            return { mesh, box, count };
        });
    }

    /**
     * The lawns' shells, piece by piece, when the garden has them: one
     * instance a layer. Of its layers a piece draws the lowest few its
     * distance allows (update), highest first, so what a higher layer
     * covers is not drawn again below it.
     */
    buildLawn() {
        for (const piece of this.pieces ?? []) {
            this.group.remove(piece.mesh);
            piece.mesh.geometry.dispose();
            piece.mesh.dispose();
        }
        this.pieces = null;
        const lawns = lawnRooms(this.spec);
        if (!this.settings.shells.enabled || !lawns.length) return;
        this.blades ??= bladeMap();
        const materials = this.world.sceneBuilder.materials;
        /** finish -> { turf, tile, live, baked } */
        this.finishes ??= new Map();
        for (const lawn of lawns) {
            const finish = lawn.floor_finish;
            if (this.finishes.has(finish)) continue;
            const turf = materials.getSurface(finish, "ground").map;
            const tile = materials.tileSize(finish);
            this.finishes.set(finish, { turf, tile, live: lawnMaterial(turf, tile, this.blades, LAWN), baked: null });
        }

        this.shells = Array.from({ length: LAWN.shells }, (_, k) => ((k + 1) / LAWN.shells) * 0.98);
        this.pieces = lawnPieces(lawns).map(({ lawn, box, positions, indices }) => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
            geometry.setIndex(indices);
            geometry.setAttribute("aShell", new THREE.InstancedBufferAttribute(new Float32Array(LAWN.shells), 1));
            geometry.computeBoundingSphere();
            geometry.boundingSphere.radius += LAWN.height;
            const entry = this.finishes.get(lawn.floor_finish);
            const mesh = new THREE.InstancedMesh(geometry, entry.baked ?? entry.live, LAWN.shells);
            mesh.receiveShadow = true;
            mesh.name = "lawn-shells";
            mesh.count = 0;
            mesh.visible = false;
            this.group.add(mesh);
            return { mesh, box, lawn, layers: 0 };
        });
    }

    /** The hills' grass, square by square: one card an instance. */
    buildHillGrass() {
        for (const chunk of this.tuftChunks ?? []) {
            this.group.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            chunk.mesh.dispose();
        }
        this.tuftChunks = null;
        if (!this.hills) return;
        if (!this.tuftTexture) {
            this.tuftTexture = new THREE.TextureLoader().load("/textures/vegetation/grass-tuft.png");
            this.tuftTexture.colorSpace = THREE.SRGBColorSpace;
            this.tuftTexture.anisotropy = 4;
        }
        this.tuftLive ??= tuftMaterial(this.tuftTexture);
        this.tuftDepth ??= tuftDepthMaterial();
        this.tuftCard ??= tuftGeometry();
        const matrix = new THREE.Matrix4();
        const turn = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const root = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const tufts = { ...this.settings.tufts, density: this.settings.tufts.density * LOW.density };
        this.tuftChunks = hillGrass(this.hills, this.trees, tufts).map(({ box, tufts }) => {
            // Each square's own, for where the ground under each card is in
            // the lightmap once the view is baked.
            const geometry = new THREE.BufferGeometry();
            geometry.setIndex(this.tuftCard.index);
            for (const name of ["position", "uv"]) geometry.setAttribute(name, this.tuftCard.getAttribute(name));
            const mesh = new THREE.InstancedMesh(geometry, this.tuftBaked ?? this.tuftLive, tufts.length);
            tufts.forEach((t, i) => {
                turn.setFromAxisAngle(up, t.turn);
                mesh.setMatrixAt(i, matrix.compose(root.set(t.x, t.y, t.z), turn, scale.setScalar(t.scale)));
            });
            mesh.instanceMatrix.needsUpdate = true;
            // Fluffy Tree's grass shades itself.
            mesh.castShadow = this.castsShadows;
            mesh.customDepthMaterial = this.tuftDepth;
            mesh.receiveShadow = true;
            mesh.name = "hill-grass";
            mesh.visible = false;
            this.group.add(mesh);
            return { mesh, box, tufts, total: tufts.length };
        });
    }

    /**
     * What is on screen and what is not, for the grass at the size the
     * settings have it now: each square's box reaching as high and as far
     * out as its tallest could; and the blades, wireframe or not.
     */
    fit() {
        const { tufts, blades } = this.settings;
        const reach = tufts.size * 1.12 + tufts.windStrength * 2;
        for (const chunk of this.tuftChunks ?? []) {
            chunk.mesh.boundingSphere = chunk.box.clone().expandByScalar(reach).getBoundingSphere(new THREE.Sphere());
        }
        const tallest = blades.height * 2.8;
        for (const chunk of this.bladeChunks ?? []) {
            const box = chunk.box.clone();
            box.max.y += tallest;
            box.expandByVector(new THREE.Vector3(tallest * 0.5 + blades.width, 0, tallest * 0.5 + blades.width));
            chunk.mesh.geometry.boundingBox = box;
            chunk.mesh.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        }
        for (const material of [this.bladeLive, this.bladeBaked]) if (material) material.wireframe = blades.wireframe;
    }

    /**
     * The sun's direction, and in a baked view the light it has, for day
     * or night: the bake's. By night the trees, which have no lightmap under
     * them, have as much of the demo's light as the night has of the day's.
     */
    setLight(variant) {
        const preset = this.world.environment?.preset;
        if (!preset) return;
        const night = variant === "night";
        const sun = night ? NIGHT.sun : preset.sun;
        uniforms.uSunDirection.value.set(...sun.position).normalize();
        const day = openLight(preset.sun, [preset.hemi.sky, preset.background], 1);
        const now = night ? openLight(NIGHT.sun, NIGHT.sky, NIGHT.skyStrength) : day;
        uniforms.uSunLuminance.value = now.sun;
        uniforms.uSkyLuminance.value = now.sky;
        uniforms.uDayLuminance.value = day.sun + day.sky;
        uniforms.uNight.value = night ? 1 : 0;
        uniforms.uLightScale.value = night ? (now.sun + now.sky) / (day.sun + day.sky) : 1;
    }

    /**
     * Light the grass as the ground it grows from is lit: from the light
     * baked into the ground's lightmap. The first time, finds where each
     * blade, card and piece of lawn is in the lightmap — the ground's
     * triangle under each, and the UV there — and turns them to their
     * baked materials.
     *
     * @param {SceneBuilder} builder  drawing the baked view
     * @param {object} info  the variant's lighting (its scale, encoding, storage)
     * @param {THREE.Texture} luma  its lightmap, or its brightness alone
     * @param {THREE.Texture} [chroma]  its colour, when stored apart
     */
    useGroundLight(builder, info, luma, chroma = null) {
        if (!this.pieces?.length && !this.bladeChunks?.length && !this.tuftChunks?.length) return;
        if (this.groundUvs === undefined) this.groundUvs = this.findGroundUvs(builder);
        if (!this.groundUvs) return;
        const storage = chroma && info.storage === "ycocg" ? "ycocg" : "colour";
        const ground = { encoding: info.encoding, storage };
        const key = `${info.encoding}|${storage}`;
        if (this.groundKey !== key) {
            this.groundKey = key;
            for (const entry of this.finishes?.values() ?? []) {
                entry.baked?.dispose();
                entry.baked = lawnMaterial(entry.turf, entry.tile, this.blades, { ...LAWN, ground });
            }
            for (const piece of this.pieces ?? []) piece.mesh.material = this.finishes.get(piece.lawn.floor_finish).baked;
            if (this.tuftChunks) {
                this.tuftBaked?.dispose();
                this.tuftBaked = tuftMaterial(this.tuftTexture, ground);
                for (const chunk of this.tuftChunks) chunk.mesh.material = this.tuftBaked;
            }
            if (this.bladeChunks) {
                this.bladeBaked?.dispose();
                this.bladeBaked = bladeMaterial(this.bladeAlpha, ground);
                this.bladeBaked.wireframe = this.settings.blades.wireframe;
                for (const chunk of this.bladeChunks) chunk.mesh.material = this.bladeBaked;
            }
        }
        uniforms.uGroundLuma.value = luma;
        uniforms.uGroundChroma.value = chroma ?? luma;
        uniforms.uGroundScale.value = info.scale;
    }

    /**
     * Each piece's corners', blade's and card's lightmap UVs: the ground's
     * baked meshes' triangles — the lawns' and the hills' — binned by where
     * they are, each point found in one and the UV there interpolated.
     * Whatever is over no baked ground is left out. False if the view has
     * no such ground in its lightmap.
     */
    findGroundUvs(builder) {
        // The lawns', and the hills' (SceneBuilder.buildHills's finish).
        const grounds = new Set(lawnRooms(this.spec).map((room) => room.floor_finish));
        if (this.hills) grounds.add(builder.hills?.material.name ?? "hill_grass");
        const triangles = [];
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        for (const mesh of builder.batches?.children ?? []) {
            const geometry = mesh.geometry;
            const uv = geometry.getAttribute("uv1");
            if (!uv || mesh.userData.lighting !== "lightmap" || !grounds.has(mesh.material?.name)) continue;
            const position = geometry.getAttribute("position");
            const index = geometry.index;
            const count = index ? index.count : position.count;
            mesh.updateMatrixWorld(true);
            for (let i = 0; i < count; i += 3) {
                const [i0, i1, i2] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
                a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
                b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
                c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
                // The ground's top, not its edges.
                if (Math.abs((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)) < 1e-9) continue;
                triangles.push({
                    p: [a.x, a.z, b.x, b.z, c.x, c.z],
                    uv: [uv.getX(i0), uv.getY(i0), uv.getX(i1), uv.getY(i1), uv.getX(i2), uv.getY(i2)],
                    y: [a.y, b.y, c.y],
                });
            }
        }
        if (!triangles.length) return false;

        const CELL = 2;
        const bins = new Map();
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
        const near = (point) => bins.get(`${Math.floor(point.x / CELL)},${Math.floor(point.z / CELL)}`) ?? [];

        let bare = 0;
        for (const piece of this.pieces ?? []) {
            const position = piece.mesh.geometry.getAttribute("position");
            const uvs = new Float32Array(position.count * 2);
            let whole = true;
            for (let i = 0; i < position.count; i++) {
                const point = { x: position.getX(i), y: position.getY(i), z: position.getZ(i) };
                // A corner on a cell's edge is looked for either side of it.
                const around = new Set();
                for (const dx of [-1e-3, 1e-3]) {
                    for (const dz of [-1e-3, 1e-3]) {
                        for (const t of near({ x: point.x + dx, z: point.z + dz })) around.add(t);
                    }
                }
                const found = groundUv([...around], point);
                if (!found) {
                    whole = false;
                    break;
                }
                uvs[i * 2] = found[0];
                uvs[i * 2 + 1] = found[1];
            }
            if (!whole) {
                bare += 1;
                piece.bare = true;
                piece.mesh.visible = false;
                continue;
            }
            piece.mesh.geometry.setAttribute("aGroundUv", new THREE.BufferAttribute(uvs, 2));
        }
        if (bare) console.info(`Lawn: ${bare} pieces over no baked lawn, left bare`);

        // Each blade's root, likewise; one over no baked lawn is buried.
        let buried = 0;
        for (const chunk of this.bladeChunks ?? []) {
            const offset = chunk.mesh.geometry.getAttribute("aOffset");
            const uvs = new Float32Array(chunk.count * 2);
            for (let i = 0; i < chunk.count; i++) {
                const point = { x: offset.getX(i), y: offset.getY(i), z: offset.getZ(i) };
                const found = groundUv(near(point), point);
                if (found) {
                    uvs[i * 2] = found[0];
                    uvs[i * 2 + 1] = found[1];
                } else {
                    offset.setY(i, point.y - 1000);
                    buried += 1;
                }
            }
            offset.needsUpdate = true;
            chunk.mesh.geometry.setAttribute("aGroundUv", new THREE.InstancedBufferAttribute(uvs, 2));
        }
        if (buried) console.info(`Blades: ${buried} over no baked lawn, left out`);

        // Each of the hills' cards, likewise; one over no baked ground is left out.
        let missed = 0;
        const none = new THREE.Matrix4().makeScale(0, 0, 0);
        for (const chunk of this.tuftChunks ?? []) {
            const uvs = new Float32Array(chunk.total * 2);
            chunk.tufts.forEach((tuft, i) => {
                const found = groundUv(near(tuft), tuft);
                if (found) {
                    uvs[i * 2] = found[0];
                    uvs[i * 2 + 1] = found[1];
                    return;
                }
                missed += 1;
                chunk.mesh.setMatrixAt(i, none);
                chunk.mesh.instanceMatrix.needsUpdate = true;
            });
            chunk.mesh.geometry.setAttribute("aGroundUv", new THREE.InstancedBufferAttribute(uvs, 2));
        }
        if (missed) console.info(`Hills' grass: ${missed} cards over no baked ground, left out`);
        return true;
    }

    /** The wind; and each square of grass drawn with as much of it as its distance calls for. */
    update(delta) {
        uniforms.uTime.value += delta;
        // The camera the view is drawn from: edit mode's, or the visitor's.
        this.experience.camera.activeCamera.getWorldPosition(_camera);
        for (const piece of this.pieces ?? []) {
            if (piece.bare) continue;
            // The blades' height at the piece's nearest: the shells above it would show nothing.
            const reach = 1 - THREE.MathUtils.smoothstep(piece.box.distanceToPoint(_camera), LAWN.fadeStart, LAWN.fadeEnd);
            const count = Math.ceil(LAWN.shells * reach);
            if (count !== piece.layers) {
                // Its lowest `count` layers, the highest of them first.
                const shell = piece.mesh.geometry.getAttribute("aShell");
                for (let k = 0; k < count; k++) shell.array[k] = this.shells[count - 1 - k];
                shell.needsUpdate = true;
                piece.layers = count;
            }
            piece.mesh.count = count;
            piece.mesh.visible = count > 0;
        }
        const tuftDistance = this.settings.tufts.distance * LOW.distance;
        for (const chunk of this.tuftChunks ?? []) {
            chunk.mesh.visible = chunk.box.distanceToPoint(_camera) < tuftDistance;
        }
        const bladeDistance = this.settings.blades.distance * LOW.distance;
        const near = bladeDistance * BLADES_NEAR;
        for (const chunk of this.bladeChunks ?? []) {
            const distance = chunk.box.distanceToPoint(_camera);
            let share = 1;
            if (distance >= bladeDistance) share = 0;
            else if (distance > near) share = Math.max(THINNEST, 1 - (distance - near) / (bladeDistance - near));
            const count = Math.round(chunk.count * share);
            chunk.mesh.geometry.instanceCount = count;
            chunk.mesh.visible = count > 0;
        }
    }

    dispose() {
        this.disposed = true;
        this.scene.remove(this.group);
        for (const piece of this.pieces ?? []) piece.mesh.geometry.dispose();
        for (const entry of this.finishes?.values() ?? []) {
            entry.live.dispose();
            entry.baked?.dispose();
        }
        this.blades?.dispose();
        for (const mesh of this.treeMeshes ?? []) {
            mesh.material.dispose();
            mesh.dispose();
        }
        this.bushLeaves?.geometry.dispose();
        this.bushMaterial?.dispose();
        for (const chunk of this.bladeChunks ?? []) chunk.mesh.geometry.dispose();
        this.bladeLive?.dispose();
        this.bladeBaked?.dispose();
        this.bladeAlpha?.dispose();
        for (const chunk of this.tuftChunks ?? []) chunk.mesh.geometry.dispose();
        this.tuftCard?.dispose();
        this.tuftLive?.dispose();
        this.tuftDepth?.dispose();
        this.tuftBaked?.dispose();
        this.tuftTexture?.dispose();
        this.leafTexture.dispose();
    }
}

/**
 * The sun's and the sky's light on open, level ground, as a lightmap has
 * it, in luminance: the sun's irradiance (W/m²) over π, by how high it is;
 * the sky's, halfway from its zenith to its horizon, at its strength.
 */
function openLight(sun, [zenith, horizon], strength) {
    const luminance = (colour) => 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
    const height = new THREE.Vector3(...sun.position).normalize().y;
    return {
        sun: (luminance(new THREE.Color(sun.color)) * sun.intensity * Math.max(height, 0)) / Math.PI,
        sky: luminance(new THREE.Color(zenith).lerp(new THREE.Color(horizon), 0.5)) * strength,
    };
}

/**
 * The lightmap UV of the ground under a point, from the triangles near it
 * — the one it is over, at its height (on a slope, the triangle's height
 * there) — or null.
 */
function groundUv(triangles, { x, y, z }) {
    for (const { p, uv, y: heights } of triangles) {
        const [ax, az, bx, bz, cx, cz] = p;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const w = 1 - u - v;
        if (u < -1e-3 || v < -1e-3 || w < -1e-3) continue;
        if (Math.abs(u * heights[0] + v * heights[1] + w * heights[2] - y) > 0.3) continue;
        return [u * uv[0] + v * uv[2] + w * uv[4], u * uv[1] + v * uv[3] + w * uv[5]];
    }
    return null;
}

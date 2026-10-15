import * as THREE from "three";

import { plantShader, shared } from "./shaders.js";
import { LOW_POWER, QUALITY } from "../../Utils/device.js";

/**
 * The site's trees and shrubs (public/models/vegetation/*.glb, grown with
 * ez-tree, scripts/trees/), each species drawn three ways by how far off
 * an instance is:
 *
 *   - near, whole: its bark and every one of its leaf cards;
 *   - further, light: its bark without the twigs (its smallest triangles)
 *     and a third of its leaf cards, each grown to fill in for the others;
 *   - far, an impostor: a card that turns to face the camera, showing the
 *     tree as it was drawn from the nearest of eight sides round it (an
 *     atlas rendered once it has loaded), faded into the next as the
 *     camera goes round.
 *
 * Each species' instances are in one instanced mesh per way it is drawn,
 * shared out between them as the camera moves (place). The leaves' normals
 * point out from the crown's middle, so a crown is lit as a mass; the
 * leaves sway, and the sun shines through them seen against it.
 */

/** Species: its model, its bark and leaves' tint, how stiff it is, how its leaves let light through. */
export const SPECIES = {
    oak_1: { leaves: "#9dba74", bark: "#cfc6b6", stiffness: 0.0025 },
    oak_2: { leaves: "#95b36c", bark: "#cfc6b6", stiffness: 0.0025 },
    oak_3: { leaves: "#99b670", bark: "#c6bdae", stiffness: 0.002 },
    oak_4: { leaves: "#a5bf7c", bark: "#cfc6b6", stiffness: 0.003 },
    ash_1: { leaves: "#a0bd72", bark: "#d6cfc2", stiffness: 0.003 },
    olive_1: { leaves: "#c3c9a8", bark: "#b8b0a2", stiffness: 0.004, olive: true },
    olive_2: { leaves: "#c0c7a4", bark: "#b8b0a2", stiffness: 0.004, olive: true },
    olive_3: { leaves: "#c6cba9", bark: "#b8b0a2", stiffness: 0.004, olive: true },
    bush_1: { leaves: "#7f9a58", bark: "#8f8678", stiffness: 0.006, shrub: true },
    bush_3: { leaves: "#6f8a4c", bark: "#8f8678", stiffness: 0.006, shrub: true },
};

/**
 * Within this far, whole; within far, light; past it, impostors — by the
 * slider's step (Utils/device.js's QUALITY.flora.reach), read as they are placed.
 */
const NEAR = 24;
const FAR = 48;
const reach = () => QUALITY?.flora?.reach ?? 1;
/** The impostors' sides, round the tree, and each one's size in the atlas. */
const SIDES = 8;
const CELL = LOW_POWER ? 128 : 256;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _colour = new THREE.Color();

export class Trees {
    /**
     * @param {THREE.Group} group   where they are drawn
     * @param {object[]} instances  `{ species, x, y, z, scale, yaw }`
     * @param {THREE.WebGLRenderer} renderer  for the impostors' atlases
     */
    constructor(group, instances, loader, renderer) {
        this.group = group;
        this.renderer = renderer;
        this.instances = instances;
        this.bySpecies = new Map();
        for (const instance of instances) {
            if (!SPECIES[instance.species]) continue;
            if (!this.bySpecies.has(instance.species)) this.bySpecies.set(instance.species, []);
            this.bySpecies.get(instance.species).push(instance);
        }
        this.materials = new Map();
        this.kinds = new Map();
        // The textures first: the impostors are drawn with them.
        this.ready = loadTextures()
            .then((textures) => {
                this.textures = textures;
                return Promise.all(
                    [...this.bySpecies.keys()].map((name) =>
                        loader
                            .loadAsync(`/models/vegetation/${name}.glb`)
                            .then((gltf) => this.addSpecies(name, gltf.scene))
                            .catch((error) => console.warn(`The ${name} trees did not load:`, error.message))
                    )
                );
            })
            .then(() => {
            this.placedAt = null;
            return this;
        });
    }

    /** A species, once its model is here: its three ways of being drawn, and its instances' colours. */
    addSpecies(name, scene) {
        const spec = SPECIES[name];
        let bark = null;
        let leaves = null;
        let leafType = "oak";
        scene.updateMatrixWorld(true);
        scene.traverse((node) => {
            if (!node.isMesh) return;
            // Packed, its positions are unpacked by its node's transform.
            if (node.name.startsWith("bark") || node.material?.name?.startsWith("bark")) bark = plain(node.geometry, node.matrixWorld);
            else {
                leaves = plain(node.geometry, node.matrixWorld);
                leafType = (node.material?.name || node.name).split(":")[1] || "oak";
            }
        });
        if (!bark || !leaves) return;
        crownNormals(leaves);
        const box = new THREE.Box3().setFromBufferAttribute(leaves.attributes.position).union(new THREE.Box3().setFromBufferAttribute(bark.attributes.position));
        const height = box.max.y;
        const barkMaterial = this.barkMaterial(name, spec, height);
        const leafMaterial = this.leafMaterial(name, spec, leafType, height);
        const list = this.bySpecies.get(name);
        const count = list.length;
        const make = (geometry, material, shadow) => {
            const mesh = new THREE.InstancedMesh(geometry, material, count);
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.castShadow = shadow;
            mesh.receiveShadow = true;
            mesh.name = `tree:${name}`;
            this.group.add(mesh);
            return mesh;
        };
        const kind = {
            name,
            height,
            box,
            list,
            whole: [make(bark, barkMaterial, true), make(leaves, leafMaterial, true)],
            // Further off, their shadows are the impostors' — none.
            light: [make(lightBark(bark), barkMaterial, false), make(lightCrown(leaves), leafMaterial, false)],
        };
        kind.whole[1].customDepthMaterial = depthMaterial(leafMaterial.map);
        kind.light[1].customDepthMaterial = kind.whole[1].customDepthMaterial;
        // Each instance's colour: the species', a little lighter or darker,
        // greener or yellower, so no two trees match.
        const colours = new Float32Array(count * 3);
        let seed = name.length * 977;
        const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < count; i++) {
            _colour.set(spec.leaves).offsetHSL((random() - 0.5) * 0.04, (random() - 0.5) * 0.12, (random() - 0.5) * 0.12);
            _colour.toArray(colours, i * 3);
        }
        kind.colours = colours;
        for (const mesh of [...kind.whole, ...kind.light]) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
        kind.impostor = this.impostor(kind, [bark, leaves], [barkMaterial, leafMaterial]);
        this.kinds.set(name, kind);
    }

    barkMaterial(name, spec, height) {
        const key = `bark:${spec.bark}:${spec.stiffness}`;
        if (this.materials.has(key)) return this.materials.get(key);
        const material = new THREE.MeshStandardMaterial({
            map: this.textures.barkColour,
            normalMap: this.textures.barkNormal,
            roughnessMap: this.textures.barkArm,
            aoMap: this.textures.barkArm,
            color: spec.bark,
            roughness: 1,
            metalness: 0,
        });
        material.name = "bark";
        plantShader(material, { height, strength: spec.stiffness * 0.25, key: `bark-${height.toFixed(1)}`, unflip: false });
        this.materials.set(key, material);
        return material;
    }

    leafMaterial(name, spec, leafType, height) {
        const key = `leaves:${leafType}:${name}`;
        const map = this.textures.leaves[leafType] ?? this.textures.leaves.oak;
        const material = new THREE.MeshStandardMaterial({
            map,
            alphaTest: 0.42,
            side: THREE.DoubleSide,
            roughness: spec.olive ? 0.62 : 0.78,
            metalness: 0,
            // Olive leaves are silvery underneath: a little sheen.
            color: "#ffffff",
        });
        material.name = `leaves:${leafType}`;
        plantShader(material, { height, strength: spec.stiffness, through: spec.olive ? 0.35 : 0.65, key: `leaves-${name}` });
        this.materials.set(key, material);
        return material;
    }

    /**
     * A species' impostor: the whole tree rendered from SIDES ways round
     * it, lit by a sky and a sun from over the camera's shoulder, into an
     * atlas a row of cells; a card the tree's size that turns to face the
     * camera and shows the nearest two, faded.
     */
    impostor(kind, geometries, materials) {
        const box = kind.box;
        const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.04;
        const height = box.max.y * 1.02;
        const target = new THREE.WebGLRenderTarget(CELL * SIDES, Math.round((CELL * height) / width), { colorSpace: THREE.SRGBColorSpace });
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight("#dfe9ff", "#4b4636", 1.4));
        const sun = new THREE.DirectionalLight("#fff3e2", 2.4);
        scene.add(sun, sun.target);
        const tree = new THREE.Group();
        geometries.forEach((geometry, k) => tree.add(new THREE.Mesh(geometry, materials[k])));
        // The instanced materials want an instance: a plain copy without them.
        tree.traverse((node) => {
            if (!node.isMesh) return;
            const material = node.material.clone();
            material.onBeforeCompile = () => {};
            material.customProgramCacheKey = () => `impostor-bake-${material.name}`;
            material.color.set(materials.indexOf(node.material) === 1 ? SPECIES[kind.name].leaves : SPECIES[kind.name].bark);
            node.material = material;
        });
        scene.add(tree);
        const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height, 0, 0.1, width * 4);
        const renderer = this.renderer;
        const previous = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), tone: renderer.toneMapping, shadows: renderer.shadowMap.enabled };
        renderer.setRenderTarget(target);
        renderer.setClearColor(SPECIES[kind.name].leaves, 0);
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.shadowMap.enabled = false;
        renderer.clear();
        for (let side = 0; side < SIDES; side++) {
            const angle = (side / SIDES) * Math.PI * 2;
            camera.position.set(Math.sin(angle) * width * 2, 0, Math.cos(angle) * width * 2);
            camera.lookAt(0, 0, 0);
            camera.position.y = 0;
            camera.updateMatrixWorld();
            sun.position.set(Math.sin(angle + 0.6) * 10, 12, Math.cos(angle + 0.6) * 10);
            const cellHeight = target.height;
            target.viewport.set(side * CELL, 0, CELL, cellHeight);
            target.scissor.set(side * CELL, 0, CELL, cellHeight);
            target.scissorTest = true;
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
        }
        target.scissorTest = false;
        renderer.setRenderTarget(previous.target);
        renderer.setClearColor(previous.colour, previous.alpha);
        renderer.toneMapping = previous.tone;
        renderer.shadowMap.enabled = previous.shadows;
        tree.traverse((node) => node.material?.dispose?.());

        const texture = target.texture;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        const card = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
        const material = impostorMaterial(texture);
        const mesh = new THREE.InstancedMesh(card, material, kind.list.length);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.name = `tree-far:${kind.name}`;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(kind.list.length * 3).fill(1), 3);
        this.group.add(mesh);
        return { mesh, target };
    }

    /**
     * Each instance to its way of being drawn, by how far it is from the
     * camera — again when the camera has moved a couple of metres.
     */
    place(camera, force = false) {
        const at = camera.position;
        if (!force && this.placedAt && this.placedAt.distanceToSquared(at) < 4) return;
        this.placedAt = (this.placedAt ?? new THREE.Vector3()).copy(at);
        const near = NEAR * reach();
        const far = FAR * reach();
        for (const kind of this.kinds.values()) {
            const counts = [0, 0, 0];
            const targets = [kind.whole, kind.light, [kind.impostor.mesh]];
            kind.list.forEach((tree, i) => {
                // Hidden by the visitor, or above the floor a view from above shows (Flora.showUpTo).
                if (tree.hidden || tree.above) return;
                const d = Math.hypot(tree.x - at.x, tree.z - at.z);
                const way = d < near ? 0 : d < far ? 1 : 2;
                _position.set(tree.x, tree.y, tree.z);
                _quaternion.setFromAxisAngle(_up, (tree.yaw * Math.PI) / 180);
                _scale.setScalar(tree.scale);
                _matrix.compose(_position, _quaternion, _scale);
                const slot = counts[way]++;
                for (const mesh of targets[way]) {
                    mesh.setMatrixAt(slot, _matrix);
                    mesh.instanceColor.setXYZ(slot, kind.colours[i * 3], kind.colours[i * 3 + 1], kind.colours[i * 3 + 2]);
                }
            });
            targets.forEach((meshes, way) => {
                for (const mesh of meshes) {
                    mesh.count = counts[way];
                    mesh.instanceMatrix.needsUpdate = true;
                    mesh.instanceColor.needsUpdate = true;
                }
            });
        }
    }

    /** How bright the impostors are drawn: the day's, or the evening's. */
    setLight(level) {
        for (const kind of this.kinds.values()) kind.impostor.mesh.material.uniforms.light.value = level;
    }

    dispose() {
        for (const kind of this.kinds.values()) {
            for (const mesh of [...kind.whole, ...kind.light, kind.impostor.mesh]) {
                mesh.geometry.dispose();
                this.group.remove(mesh);
            }
            kind.impostor.target.dispose();
            kind.impostor.mesh.material.dispose();
        }
        for (const material of this.materials.values()) material.dispose();
        if (this.textures) for (const texture of [this.textures.barkColour, this.textures.barkNormal, this.textures.barkArm, ...Object.values(this.textures.leaves)]) texture.dispose();
    }
}

async function loadTextures() {
    const loader = new THREE.TextureLoader();
    const load = async (url, colour = true, wrap = THREE.RepeatWrapping) => {
        const texture = await loader.loadAsync(url);
        texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = wrap;
        texture.anisotropy = 4;
        return texture;
    };
    const leaf = (name) => load(`/textures/trees/leaves-${name}.webp`, true, THREE.ClampToEdgeWrapping);
    const [barkColour, barkNormal, barkArm, oak, ash, aspen, pine] = await Promise.all([
        load("/textures/trees/bark-oak-color.webp"),
        load("/textures/trees/bark-oak-normal.webp", false),
        load("/textures/trees/bark-oak-arm.webp", false),
        leaf("oak"),
        leaf("ash"),
        leaf("aspen"),
        leaf("pine"),
    ]);
    return { barkColour, barkNormal, barkArm, leaves: { oak, ash, aspen, pine } };
}

/** A geometry with only what is drawn — position, normal, uv — as floats, laid by `matrix`. */
function plain(geometry, matrix) {
    const out = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
        const attribute = geometry.getAttribute(name);
        if (!attribute) continue;
        // Packed (meshopt quantised) attributes, unpacked to floats.
        const values = new Float32Array(attribute.count * attribute.itemSize);
        for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++) values[i * attribute.itemSize + k] = attribute.getComponent(i, k);
        out.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    if (geometry.index) out.setIndex(geometry.index.clone());
    if (!out.getAttribute("normal")) out.computeVertexNormals();
    if (matrix) out.applyMatrix4(matrix);
    out.computeBoundingSphere();
    return out;
}

/** Leaf cards' normals out from the crown's middle, for a crown lit as a mass. */
function crownNormals(geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const centre = box.getCenter(new THREE.Vector3());
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const n = new THREE.Vector3();
    const out = new THREE.Vector3();
    const squash = new THREE.Vector3(1 / Math.max(0.01, box.max.x - box.min.x), 1 / Math.max(0.01, box.max.y - box.min.y), 1 / Math.max(0.01, box.max.z - box.min.z));
    for (let i = 0; i < position.count; i++) {
        out.fromBufferAttribute(position, i).sub(centre).multiply(squash).normalize();
        n.fromBufferAttribute(normal, i);
        // Mostly outward, a little of the card's own, and a little up.
        n.multiplyScalar(0.25).addScaledVector(out, 0.85).add(_up.clone().multiplyScalar(0.15)).normalize();
        normal.setXYZ(i, n.x, n.y, n.z);
    }
    normal.needsUpdate = true;
}

/** The bark without its twigs: only triangles bigger than the smallest share. */
function lightBark(geometry) {
    const position = geometry.getAttribute("position");
    const index = geometry.index;
    if (!index) return geometry;
    const areas = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i));
        b.fromBufferAttribute(position, index.getX(i + 1));
        c.fromBufferAttribute(position, index.getX(i + 2));
        areas.push(b.sub(a).cross(c.sub(a)).length() / 2);
    }
    const sorted = [...areas].sort((x, y) => x - y);
    const least = sorted[Math.floor(sorted.length * 0.78)];
    const kept = [];
    for (let t = 0; t < areas.length; t++) if (areas[t] >= least) kept.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
    const out = geometry.clone();
    out.setIndex(kept);
    return out;
}

/** A crown with a quarter of its cards, each grown to fill in for the others. */
function lightCrown(geometry, keep = 4, grow = 1.75) {
    const index = geometry.index;
    const position = geometry.getAttribute("position");
    if (!index) return geometry;
    const out = geometry.clone();
    const p = out.getAttribute("position");
    const kept = [];
    // Each card is a quad: two triangles, six indices, four corners.
    const quads = index.count / 6;
    const centre = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let q = 0; q < quads; q++) {
        if (q % keep !== 0) continue;
        const corners = new Set();
        for (let k = 0; k < 6; k++) corners.add(index.getX(q * 6 + k));
        centre.set(0, 0, 0);
        for (const i of corners) centre.add(v.fromBufferAttribute(position, i));
        centre.divideScalar(corners.size);
        for (const i of corners) {
            v.fromBufferAttribute(position, i).sub(centre).multiplyScalar(grow).add(centre);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        for (let k = 0; k < 6; k++) kept.push(index.getX(q * 6 + k));
    }
    out.setIndex(kept);
    return out;
}

/** What casts a leaf card's shadow: its shape, not its square. */
function depthMaterial(map) {
    return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42, side: THREE.DoubleSide });
}

/**
 * An impostor's material: a card turned about its upright to face the
 * camera, showing the atlas's two cells nearest the way it is seen from,
 * faded; tinted by its instance, dimmed at night, fogged.
 */
function impostorMaterial(atlas) {
    const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { atlas: { value: null }, light: { value: 1 }, sides: { value: SIDES } }]),
        vertexShader: /* glsl */ `
            #include <common>
            #include <fog_pars_vertex>
            uniform float sides;
            varying vec2 vUv;
            varying vec3 vTint;
            varying vec2 vCells;
            varying float vBlend;
            void main() {
                vec3 root = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
                float size = length( instanceMatrix[ 0 ].xyz );
                // The way it faces, and the camera's way round it.
                float yaw = atan( instanceMatrix[ 2 ].x, instanceMatrix[ 2 ].z );
                vec2 toCamera = normalize( cameraPosition.xz - root.xz );
                float seen = atan( toCamera.x, toCamera.y ) - yaw;
                float cell = mod( seen / ( 2.0 * PI ) * sides + sides * 4.0, sides );
                vCells = vec2( floor( cell ), mod( floor( cell ) + 1.0, sides ) );
                vBlend = fract( cell );
                // Turned about its upright to face the camera.
                vec3 right = vec3( toCamera.y, 0.0, -toCamera.x );
                vec3 world = root + right * position.x * size + vec3( 0.0, position.y * size, 0.0 );
                vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
                gl_Position = projectionMatrix * mvPosition;
                vUv = uv;
                #ifdef USE_INSTANCING_COLOR
                    vTint = instanceColor;
                #else
                    vTint = vec3( 1.0 );
                #endif
                #include <fog_vertex>
            }
        `,
        fragmentShader: /* glsl */ `
            #include <common>
            #include <fog_pars_fragment>
            uniform sampler2D atlas;
            uniform float light;
            uniform float sides;
            varying vec2 vUv;
            varying vec3 vTint;
            varying vec2 vCells;
            varying float vBlend;
            void main() {
                vec4 a = texture2D( atlas, vec2( ( vCells.x + vUv.x ) / sides, vUv.y ) );
                vec4 b = texture2D( atlas, vec2( ( vCells.y + vUv.x ) / sides, vUv.y ) );
                vec4 colour = mix( a, b, vBlend );
                if ( colour.a < 0.5 ) discard;
                // The atlas was drawn in the species' own tint: this one's share of it.
                gl_FragColor = vec4( colour.rgb * light * mix( vec3( 1.0 ), vTint * 1.6, 0.35 ), 1.0 );
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                #include <fog_fragment>
            }
        `,
        fog: true,
    });
    material.uniforms.atlas.value = atlas;
    return material;
}

export { shared };

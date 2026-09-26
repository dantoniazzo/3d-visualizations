import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { collectStatic, listStatic, materialKeys } from "../World/StaticBatcher.js";
import { BIRD_VIEW, birdViewpoints, seeded, walkViewpoints } from "./viewpoints.js";

/**
 * The static scene as a visitor can see it, and nothing more: the input to
 * a public view.
 *
 * Every static triangle is given an id and the scene is rendered — ids as
 * colours, both faces drawn — from every place a visitor's camera can be
 * (viewpoints.js): walking every room, the stairs and the garden, and the
 * bird's-eye view of each floor with everything above it taken away. What
 * no sample ever shows is thrown away: the undersides of things standing
 * on the floor, faces pressed against walls, the insides of boxes that
 * overlap. Which face each surviving triangle was seen from decides how it
 * is kept:
 *
 *   - single-sided and seen from the front: as it is.
 *   - single-sided and seen only from behind: it was facing the wrong way,
 *     so it is turned round.
 *   - double-sided: a copy facing each way it was seen from — a ceiling,
 *     which faces up in the scene but is only ever seen from below, comes
 *     out as one downward face.
 *
 * so the result draws with back-face culling, which halves the fragment
 * work and is what a baked lightmap needs anyway.
 *
 * Sampling can miss a sliver seen only at a grazing angle, so two things
 * guard against holes: any triangle sharing an edge with a seen one is
 * kept, and a second, randomly placed set of samples checks the result —
 * whatever it sees that the first set had thrown away is put back, and
 * counted, so a publish says how close it came.
 *
 * The result is merged into one mesh per material, floor and kind (ceiling,
 * roof or neither) and returned as a GLB, carrying the spec it was made from.
 *
 * Both halves can be switched off, to see what each is worth
 * (shared/publishOptions.js): without `cull` nothing is rendered, every
 * triangle is kept as it is, and the public view draws each material
 * single- or double-sided as the live scene does; without `merge` each
 * object stays a mesh of its own.
 */

/** Pixels per side of each cube face rendered for a walking sample. */
const FACE = 256;
const BIRD_WIDTH = 512;
const BIRD_HEIGHT = 384;
/** A sample that sees more than this share of single-sided back faces is inside something. */
const INSIDE_RATIO = 0.35;
const KIND_FLAG = { ceiling: 1, roof: 2 };
/** Six 90° views that between them see in every direction. */
const CUBE_FACES = [
    [1, 0, 0, 0, -1, 0],
    [-1, 0, 0, 0, -1, 0],
    [0, 1, 0, 0, 0, 1],
    [0, -1, 0, 0, 0, -1],
    [0, 0, 1, 0, -1, 0],
    [0, 0, -1, 0, -1, 0],
];

const _color = new THREE.Color();

/**
 * @param {Experience} experience  a built scene, furniture loaded
 * @param {object} [options]
 * @param {(fraction: number, label: string) => void} [options.onProgress]
 * @param {boolean} [options.cull]  remove hidden faces (default true)
 * @param {boolean} [options.merge]  merge by material and floor (default true)
 * @returns {Promise<{ glb: ArrayBuffer, stats: object }>}
 */
export async function buildSnapshot(experience, { onProgress = () => {}, cull = true, merge = true } = {}) {
    const started = performance.now();
    const builder = experience.world.sceneBuilder;
    await builder.furnitureReady;

    onProgress(0, "Collecting the scene");
    await yieldToBrowser();
    const options = builder.staticOptions();
    const { parts } = collectStatic(builder.root, options);
    const keys = materialKeys(listStatic(builder.root, options).materials);
    const table = triangleTable(parts);

    const seen = new Uint8Array(table.count);
    let keep = new Uint8Array(table.count).fill(1);
    let restored = 0;
    const samples = { walk: 0, bird: 0, check: 0, inside: 0 };
    const timing = {};
    if (cull) {
        ({ keep, restored } = await findVisible(experience, parts, table, seen, samples, timing, onProgress));
    }

    onProgress(0.96, "Assembling");
    await yieldToBrowser();
    const { scene, stats } = assemble(parts, table, seen, keep, keys, { visibility: cull, merge });
    for (const part of parts) part.geometry.dispose();

    Object.assign(stats, {
        restored,
        samples,
        seconds: Math.round((performance.now() - started) / 100) / 10,
        timing,
    });
    scene.userData = {
        spec: JSON.parse(JSON.stringify(builder.spec)),
        levels: options.levels,
        birdView: BIRD_VIEW,
        stats,
    };

    onProgress(0.98, "Writing the file");
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    scene.traverse((node) => {
        if (node.isMesh) {
            node.geometry.dispose();
            node.material.dispose();
        }
    });
    onProgress(1, "Done");
    return { glb, stats };
}

/**
 * Render every static triangle's id from every viewpoint, recording in
 * `seen` which side of each was seen; then decide what stays.
 *
 * @returns {Promise<{ keep: Uint8Array, restored: number }>}
 */
async function findVisible(experience, parts, table, seen, samples, timing, onProgress) {
    const renderer = experience.renderer.renderer;
    const world = experience.world;
    const builder = world.sceneBuilder;
    const options = builder.staticOptions();
    const walk = walkViewpoints(builder.spec, world.collision);
    const birds = birdViewpoints(builder.spec, options.levels);
    const random = seeded(7);
    const checkWalk = walkViewpoints(builder.spec, world.collision, { jitter: random, density: 0.15 });
    const checkBirds = birdViewpoints(builder.spec, options.levels, { jitter: random }).filter((_, i) => i % 8 === 0);

    const pass = new IdPass(renderer, idGeometry(parts, table), table);
    const total = walk.length + birds.length + checkWalk.length + checkBirds.length;
    // The live scene would be drawn between batches for nobody; the GPU
    // has better things to do meanwhile.
    experience.suspended = true;
    let done = 0;
    let insideSamples = 0;

    const run = async (views, render, label, phase) => {
        const phaseStart = performance.now();
        let batchStart = phaseStart;
        pass.begin();
        for (const view of views) {
            if (!render(view)) insideSamples++;
            done++;
            // Hand the browser a frame now and then, so the page stays alive.
            if (performance.now() - batchStart > 40) {
                pass.end();
                onProgress((0.95 * done) / total, label);
                await yieldToBrowser();
                pass.begin();
                batchStart = performance.now();
            }
        }
        pass.end();
        timing[phase] = (timing[phase] ?? 0) + Math.round((performance.now() - phaseStart) / 100) / 10;
    };

    const check = new Uint8Array(table.count);
    try {
        await run(walk, (point) => pass.cube(point, seen), "Walking every room", "walk");
        await run(birds, (view) => pass.bird(view, seen), "Looking down on every floor", "bird");
        // A fresh, random set of samples: anything they see that was
        // thrown away goes back in.
        await run(checkWalk, (point) => pass.cube(point, check), "Checking for holes", "check");
        await run(checkBirds, (view) => pass.bird(view, check), "Checking for holes", "check");
    } finally {
        experience.suspended = false;
        pass.dispose();
    }
    const keep = dilate(seen, parts, table);
    let restored = 0;
    for (let t = 0; t < table.count; t++) {
        if (check[t] && !keep[t]) {
            keep[t] = 1;
            restored++;
        }
        seen[t] |= check[t];
    }
    Object.assign(samples, {
        walk: walk.length,
        bird: birds.length,
        check: checkWalk.length + checkBirds.length,
        inside: insideSamples,
    });
    return { keep, restored };
}

// ---------------------------------------------------------------------
// Triangle ids
// ---------------------------------------------------------------------

/** Where each part's triangles start in the one list of all of them. */
function triangleTable(parts) {
    const offsets = new Uint32Array(parts.length + 1);
    parts.forEach((part, p) => {
        offsets[p + 1] = offsets[p] + part.geometry.index.count / 3;
    });
    const count = offsets[parts.length];
    // Ids are written into a 24-bit colour, with 0 meaning "nothing".
    if (count >= 0xffffff) throw new Error(`Too many triangles to publish (${count}).`);

    const single = new Uint8Array(count);
    parts.forEach((part, p) => {
        single.fill(part.material.side === THREE.FrontSide ? 1 : 0, offsets[p], offsets[p + 1]);
    });
    return { offsets, count, single };
}

/** Every static triangle, unindexed, carrying its id, floor and kind. */
function idGeometry(parts, table) {
    const positions = new Float32Array(table.count * 9);
    const ids = new Uint8Array(table.count * 9);
    const levels = new Float32Array(table.count * 3);
    const kinds = new Float32Array(table.count * 3);

    let t = 0;
    for (const part of parts) {
        const position = part.geometry.attributes.position.array;
        const index = part.geometry.index.array;
        const kind = KIND_FLAG[part.kind] ?? 0;
        for (let i = 0; i < index.length; i += 3, t++) {
            const id = t + 1;
            for (let c = 0; c < 3; c++) {
                const v = index[i + c] * 3;
                const o = t * 3 + c;
                positions[o * 3] = position[v];
                positions[o * 3 + 1] = position[v + 1];
                positions[o * 3 + 2] = position[v + 2];
                ids[o * 3] = id & 255;
                ids[o * 3 + 1] = (id >> 8) & 255;
                ids[o * 3 + 2] = (id >> 16) & 255;
                levels[o] = part.level;
                kinds[o] = kind;
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("tid", new THREE.BufferAttribute(ids, 3, true));
    geometry.setAttribute("lvl", new THREE.BufferAttribute(levels, 1));
    geometry.setAttribute("kind", new THREE.BufferAttribute(kinds, 1));
    return geometry;
}

/**
 * Renders triangle ids and records which triangles a view saw, and from
 * which side: bit 1 the front, bit 2 the back.
 */
class IdPass {
    constructor(renderer, geometry, table) {
        this.renderer = renderer;
        this.single = table.single;

        // Compiled as GLSL 3 all the same under WebGL 2, which `flat` needs:
        // an id must not be blended across a triangle.
        this.material = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            uniforms: {
                maxLevel: { value: 1000 },
                bird: { value: 0 },
            },
            // In a bird's-eye view of a floor, everything above it goes,
            // and so do its own ceilings and the roof.
            vertexShader: /* glsl */ `
                attribute vec3 tid;
                attribute float lvl;
                attribute float kind;
                uniform float maxLevel;
                uniform float bird;
                flat varying vec3 vId;
                void main() {
                    vId = tid;
                    bool above = lvl > maxLevel + 0.5;
                    bool overhead = kind > 1.5 || (kind > 0.5 && abs(lvl - maxLevel) < 0.5);
                    bool hidden = bird > 0.5 && (above || overhead);
                    gl_Position = hidden
                        ? vec4(2.0, 2.0, 2.0, 1.0)
                        : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                flat varying vec3 vId;
                void main() {
                    gl_FragColor = vec4(vId, gl_FrontFacing ? 1.0 : 0.5);
                }
            `,
        });
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.mesh);

        const target = (width, height) =>
            new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                generateMipmaps: false,
                depthBuffer: true,
            });
        this.cubeTarget = target(FACE * 3, FACE * 2);
        this.cubePixels = new Uint8Array(FACE * 3 * FACE * 2 * 4);
        this.cubeWords = new Uint32Array(this.cubePixels.buffer);
        this.birdTarget = target(BIRD_WIDTH, BIRD_HEIGHT);
        this.birdPixels = new Uint8Array(BIRD_WIDTH * BIRD_HEIGHT * 4);
        this.birdWords = new Uint32Array(this.birdPixels.buffer);

        this.rig = new THREE.Object3D();
        this.cameras = CUBE_FACES.map(([x, y, z, ux, uy, uz]) => {
            const camera = new THREE.PerspectiveCamera(90, 1, 0.05, 400);
            camera.up.set(ux, uy, uz);
            camera.lookAt(x, y, z);
            this.rig.add(camera);
            return camera;
        });
        // A little wider than the view itself, for what a pan brings in.
        this.birdCamera = new THREE.PerspectiveCamera(BIRD_VIEW.fov + 8, BIRD_WIDTH / BIRD_HEIGHT, 0.1, 400);
        this.saved = { color: new THREE.Color(), alpha: 1, clipping: [] };
    }

    /** Take the renderer over; `end` gives it back. */
    begin() {
        const r = this.renderer;
        this.saved.target = r.getRenderTarget();
        r.getClearColor(this.saved.color);
        this.saved.alpha = r.getClearAlpha();
        this.saved.clipping = r.clippingPlanes;
        r.clippingPlanes = [];
        r.setClearColor(0x000000, 0);
    }

    end() {
        const r = this.renderer;
        r.setRenderTarget(this.saved.target);
        r.setClearColor(this.saved.color, this.saved.alpha);
        r.clippingPlanes = this.saved.clipping;
    }

    /** Six faces round a walking sample. False if it turned out to be inside something. */
    cube(position, seen) {
        const r = this.renderer;
        const target = this.cubeTarget;
        this.material.uniforms.bird.value = 0;
        this.rig.position.copy(position);
        this.rig.updateMatrixWorld(true);

        for (let f = 0; f < 6; f++) {
            const x = (f % 3) * FACE;
            const y = Math.floor(f / 3) * FACE;
            target.viewport.set(x, y, FACE, FACE);
            target.scissor.set(x, y, FACE, FACE);
            target.scissorTest = true;
            r.setRenderTarget(target);
            r.render(this.scene, this.cameras[f]);
        }
        r.readRenderTargetPixels(target, 0, 0, FACE * 3, FACE * 2, this.cubePixels);

        // Surrounded by the backs of single-sided faces: inside something.
        const words = this.cubeWords;
        let covered = 0;
        let backs = 0;
        for (let i = 0; i < words.length; i++) {
            const id = words[i] & 0xffffff;
            if (!id) continue;
            covered++;
            if (words[i] >>> 24 < 190 && this.single[id - 1]) backs++;
        }
        if (covered && backs / covered > INSIDE_RATIO) return false;

        mark(words, seen);
        return true;
    }

    /** One bird's-eye view of a floor. */
    bird(view, seen) {
        const r = this.renderer;
        const target = this.birdTarget;
        this.material.uniforms.bird.value = 1;
        this.material.uniforms.maxLevel.value = view.level;
        this.birdCamera.position.copy(view.position);
        this.birdCamera.lookAt(view.target);
        this.birdCamera.updateMatrixWorld(true);

        target.viewport.set(0, 0, BIRD_WIDTH, BIRD_HEIGHT);
        target.scissorTest = false;
        r.setRenderTarget(target);
        r.render(this.scene, this.birdCamera);
        r.readRenderTargetPixels(target, 0, 0, BIRD_WIDTH, BIRD_HEIGHT, this.birdPixels);
        mark(this.birdWords, seen);
        this.material.uniforms.maxLevel.value = 1000;
        return true;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.cubeTarget.dispose();
        this.birdTarget.dispose();
    }
}

/** Record every id in a readback, and which side of it faced the camera. */
function mark(words, seen) {
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const id = word & 0xffffff;
        if (id) seen[id - 1] |= word >>> 24 > 190 ? 1 : 2;
    }
}

// ---------------------------------------------------------------------
// Deciding what stays
// ---------------------------------------------------------------------

/**
 * Seen triangles, plus any that share an edge with one: a sliver next to a
 * seen face is far more likely to have been missed than to be hidden,
 * whereas a hidden face — a box's underside — shares no vertices with the
 * sides around it.
 *
 * @returns {Uint8Array} 1 seen, 2 kept for its neighbour, 0 thrown away
 */
function dilate(seen, parts, table) {
    const keep = new Uint8Array(table.count);
    parts.forEach((part, p) => {
        const index = part.geometry.index.array;
        const n = part.geometry.attributes.position.count;
        const base = table.offsets[p];
        const edge = (a, b) => (a < b ? a * n + b : b * n + a);
        const edges = new Set();
        for (let i = 0, t = base; i < index.length; i += 3, t++) {
            if (!seen[t]) continue;
            keep[t] = 1;
            edges.add(edge(index[i], index[i + 1]));
            edges.add(edge(index[i + 1], index[i + 2]));
            edges.add(edge(index[i + 2], index[i]));
        }
        if (!edges.size) return;
        for (let i = 0, t = base; i < index.length; i += 3, t++) {
            if (keep[t]) continue;
            if (
                edges.has(edge(index[i], index[i + 1])) ||
                edges.has(edge(index[i + 1], index[i + 2])) ||
                edges.has(edge(index[i + 2], index[i]))
            ) {
                keep[t] = 2;
            }
        }
    });
    return keep;
}

/**
 * The kept triangles, each facing the way it was seen from, merged into
 * one mesh per material, floor, kind and shadow setting — or, without
 * `merge`, one per object. Without `visibility` nothing is known of which
 * side was seen, and every triangle stays as it is.
 */
function assemble(parts, table, seen, keep, keys, { visibility = true, merge = true } = {}) {
    const buckets = new Map();
    const stats = { input: table.count, output: 0, removed: 0, flipped: 0, doubled: 0, neighbours: 0 };

    parts.forEach((part, p) => {
        const geometry = part.geometry;
        const index = geometry.index.array;
        const colors = part.names.includes("color");
        const side = part.material.side;
        const front = [];
        const back = [];

        for (let i = 0, t = table.offsets[p]; i < index.length; i += 3, t++) {
            if (!keep[t]) {
                stats.removed++;
                continue;
            }
            if (keep[t] === 2) stats.neighbours++;
            const s = seen[t];
            let showFront;
            let showBack;
            if (!visibility) {
                showFront = true;
                showBack = false;
            } else if (side === THREE.DoubleSide) {
                showFront = Boolean(s & 1) || !s;
                showBack = Boolean(s & 2);
                if (showFront && showBack) stats.doubled++;
            } else if (side === THREE.BackSide) {
                showFront = false;
                showBack = true;
            } else {
                showFront = Boolean(s & 1) || !(s & 2);
                showBack = !showFront;
                if (showBack) stats.flipped++;
            }
            if (showFront) front.push(index[i], index[i + 1], index[i + 2]);
            // Reversed, so its front is the side that was seen.
            if (showBack) back.push(index[i], index[i + 2], index[i + 1]);
        }
        if (!front.length && !back.length) return;

        const key = keys.get(part.material);
        const bucketKey = [key, part.level, part.kind ?? "", part.cast, part.receive, colors, merge ? "" : p].join("|");
        let bucket = buckets.get(bucketKey);
        if (!bucket) {
            bucket = {
                key,
                material: part.material,
                level: part.level,
                kind: part.kind,
                cast: part.cast,
                receive: part.receive,
                colors,
                position: [],
                normal: [],
                uv: [],
                color: [],
                index: [],
            };
            buckets.set(bucketKey, bucket);
        }
        append(bucket, geometry, front, 1);
        append(bucket, geometry, back, -1);
    });

    const scene = new THREE.Scene();
    for (const bucket of buckets.values()) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.position, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normal, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uv, 2));
        if (bucket.colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.color, 3));
        geometry.setIndex(bucket.index);
        stats.output += bucket.index.length / 3;

        const mesh = new THREE.Mesh(geometry, placeholder(bucket));
        mesh.name = `${bucket.key}:${bucket.level}${bucket.kind ? `:${bucket.kind}` : ""}${merge ? "" : `:${scene.children.length}`}`;
        mesh.userData = {
            material: bucket.key,
            level: bucket.level,
            kind: bucket.kind,
            cast: bucket.cast,
            receive: bucket.receive,
        };
        scene.add(mesh);
    }
    stats.meshes = scene.children.length;
    return { scene, stats };
}

/**
 * Append the vertices a list of triangles uses — only those — facing the
 * given way (1, or -1 for the reversed copies).
 */
function append(bucket, geometry, triangles, facing) {
    if (!triangles.length) return;
    const { position, normal, uv, color } = geometry.attributes;
    const remap = new Map();
    const base = bucket.position.length / 3;
    for (const vertex of triangles) {
        let mapped = remap.get(vertex);
        if (mapped === undefined) {
            mapped = base + remap.size;
            remap.set(vertex, mapped);
            bucket.position.push(position.array[vertex * 3], position.array[vertex * 3 + 1], position.array[vertex * 3 + 2]);
            bucket.normal.push(
                normal.array[vertex * 3] * facing,
                normal.array[vertex * 3 + 1] * facing,
                normal.array[vertex * 3 + 2] * facing
            );
            bucket.uv.push(uv.array[vertex * 2], uv.array[vertex * 2 + 1]);
            if (bucket.colors) {
                bucket.color.push(color.array[vertex * color.itemSize], color.array[vertex * color.itemSize + 1], color.array[vertex * color.itemSize + 2]);
            }
        }
        bucket.index.push(mapped);
    }
}

/**
 * What the file carries for a material: its name, to find the real one by,
 * and its colour — the texture's average folded in — for the bake to bounce
 * light with. The public view uses the live material; this is the fallback.
 */
function placeholder(bucket) {
    const source = bucket.material;
    const material = new THREE.MeshStandardMaterial({
        name: bucket.key,
        color: source.color ? source.color.clone() : 0xffffff,
        roughness: source.roughness ?? 0.8,
        metalness: source.metalness ?? 0,
        vertexColors: bucket.colors,
    });
    const average = averageColor(source.map);
    if (average) material.color.multiply(average);
    if (source.emissive) material.emissive.copy(source.emissive);
    return material;
}

/** A texture's average colour, from its image squeezed to one pixel. */
function averageColor(texture) {
    const image = texture?.image;
    if (!image || !(image.width > 0)) return null;
    try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return _color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace).clone();
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------

const channel = new MessageChannel();
const waiting = [];
channel.port1.onmessage = () => waiting.shift()?.();

/**
 * Let the browser breathe. A message rather than a timer or an animation
 * frame, neither of which runs in a tab that is not on screen.
 */
function yieldToBrowser() {
    return new Promise((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(0);
    });
}

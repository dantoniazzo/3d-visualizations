import * as THREE from "three";

import { hillHeight, mulberry32, pointInPolygon } from "../../../../shared/vegetation.js";

/**
 * The garden's geometry, from the plan (shared/vegetation.js): the lawns
 * cut into pieces for the grass to grow over, the grass's blades, the
 * hills' grass, and the bushes' leaves. The trees are Fluffy Tree's own
 * (Vegetation.buildTrees).
 */

/** The lawns are cut into squares this many metres a side, each piece's grass drawn — or not — on its own. */
export const CHUNK = 6;

/**
 * Each lawn cut into CHUNK squares: in each, the part of the lawn's outline
 * inside it, triangulated, at the lawn's level — the surface the grass's
 * shells are drawn over (Vegetation.buildLawn).
 *
 * @returns {{ lawn: object, box: THREE.Box3, positions: number[], indices: number[] }[]}
 */
export function lawnPieces(lawns) {
    const pieces = [];
    for (const lawn of lawns) {
        const xs = lawn.polygon.map(([x]) => x);
        const zs = lawn.polygon.map(([, z]) => z);
        const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
        for (let x0 = minX; x0 < maxX - 1e-6; x0 += CHUNK) {
            for (let z0 = minZ; z0 < maxZ - 1e-6; z0 += CHUNK) {
                const outline = clipToSquare(lawn.polygon, x0, z0, Math.min(x0 + CHUNK, maxX), Math.min(z0 + CHUNK, maxZ));
                if (outline.length < 3 || Math.abs(signedArea(outline)) < 1e-3) continue;
                const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
                const faces = THREE.ShapeUtils.triangulateShape(contour, []);
                if (!faces.length) continue;
                const y = lawn.elevation;
                const positions = outline.flatMap(([x, z]) => [x, y, z]);
                // Each triangle wound to face up, whichever way round the outline runs.
                const indices = faces.flatMap(([a, b, c]) => {
                    const [ax, az] = outline[a];
                    const [bx, bz] = outline[b];
                    const [cx, cz] = outline[c];
                    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
                    return up ? [a, b, c] : [a, c, b];
                });
                const box = new THREE.Box3().setFromArray(positions);
                pieces.push({ lawn, box, positions, indices });
            }
        }
    }
    return pieces;
}

/**
 * One card of the hills' grass (Fluffy Tree's): a square a metre wide,
 * rooted along its bottom edge at the origin and a metre up it. The
 * shader stands it at its size and leans it over (shaders.js's
 * tuftMaterial) — wound to face the side it leans away from, as its
 * normal there does.
 */
export function tuftGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    return geometry;
}

/**
 * The hills' grass, card by card, square by square of the band they fill,
 * in patches as Fluffy Tree's is, bare ground between them: `density`
 * cards a square metre in a patch's thick, patches of about `patchSize`
 * over `coverage` of the ground, their edges thinning out. Each card is
 * turned at random and sized a tenth either way, rooted in the hills'
 * ground — fewer towards the rim, none where it has sunk under the fields
 * round it, nor on a tree's trunk. A square's cards are in no order, so
 * the first of them, however many, are spread over all of it.
 *
 * @returns {{ box: THREE.Box3, tufts: object[] }[]}  each card `{ x, y, z, turn, scale }`,
 *          and the box round their roots
 */
export function hillGrass(hills, trees, { density, coverage, patchSize }) {
    const chunks = [];
    const random = mulberry32(0x3c6ef372);
    const at = (u, v) => [hills.across[0] * u + hills.dir[0] * v, hills.across[1] * u + hills.dir[1] * v];
    const patch = patchNoise(patchSize, 0x27d4eb2f);
    // Where the patches start: as much of the band's ground above it as they cover.
    const samples = Array.from({ length: 4096 }, () => {
        const [x, z] = at(hills.left + random() * (hills.right - hills.left), hills.far + random() * (hills.near - hills.far));
        return patch(x, z);
    }).sort((a, b) => a - b);
    const edge = samples[Math.min(samples.length - 1, Math.floor((1 - coverage) * samples.length))];
    const inPatch = (x, z) => (coverage >= 1 ? 1 : smoothstep(edge - 0.05, edge + 0.05, patch(x, z)));
    for (let u0 = hills.left; u0 < hills.right - 1e-6; u0 += CHUNK) {
        for (let v0 = hills.far; v0 < hills.near - 1e-6; v0 += CHUNK) {
            const w = Math.min(CHUNK, hills.right - u0);
            const d = Math.min(CHUNK, hills.near - v0);
            const tufts = [];
            const box = new THREE.Box3();
            const wanted = coverage > 0 ? Math.round(w * d * density) : 0;
            for (let i = 0; i < wanted; i++) {
                const [x, z] = at(u0 + random() * w, v0 + random() * d);
                const turn = random() * Math.PI * 2;
                const scale = 0.89 + random() * 0.22;
                if (random() > inPatch(x, z)) continue;
                const y = hillHeight(hills, x, z);
                // Thinning out towards the rim, where the hills sink into the fields.
                if (random() > smoothstep(-0.1, 0.6, y - hills.y)) continue;
                if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < tree.trunk + 0.12)) continue;
                tufts.push({ x, y, z, turn, scale });
                box.expandByPoint(new THREE.Vector3(x, y, z));
            }
            if (tufts.length) chunks.push({ box, tufts });
        }
    }
    return chunks;
}

/**
 * Smooth noise, 0..1, in blobs about `size` across, with smaller ones on
 * their edges — where the hills' grass grows thick and where it is bare.
 */
function patchNoise(size, seed) {
    const hash = (i, j) => {
        let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const value = (x, z) => {
        const i = Math.floor(x);
        const j = Math.floor(z);
        const fx = smoothstep(0, 1, x - i);
        const fz = smoothstep(0, 1, z - j);
        const top = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * fx;
        const bottom = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * fx;
        return top + (bottom - top) * fz;
    };
    return (x, z) => 0.7 * value(x / size, z / size) + 0.3 * value(x / (size * 0.4) + 17.3, z / (size * 0.4) - 5.1);
}

/**
 * The lawns' grass, blade by blade (shaders.js's bladeMaterial): each
 * blade's root on a lawn, and four random numbers that turn it, lean it,
 * stretch it and colour it — in CHUNK squares, each square's blades in no
 * order, so the first of them, however many, are spread over all of it:
 * which is how a square further off is thinned.
 *
 * @returns {{ box: THREE.Box3, roots: Float32Array, randoms: Float32Array, count: number }[]}
 *          and the box is round the square, at the lawn's level
 */
export function bladeChunks(lawns, trees, density) {
    const chunks = [];
    lawns.forEach((lawn, n) => {
        const random = mulberry32(0x2545f491 + n);
        const xs = lawn.polygon.map(([x]) => x);
        const zs = lawn.polygon.map(([, z]) => z);
        const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
        for (let x0 = minX; x0 < maxX - 1e-6; x0 += CHUNK) {
            for (let z0 = minZ; z0 < maxZ - 1e-6; z0 += CHUNK) {
                const w = Math.min(CHUNK, maxX - x0);
                const d = Math.min(CHUNK, maxZ - z0);
                const roots = [];
                const randoms = [];
                const wanted = Math.round(w * d * density);
                for (let i = 0; i < wanted; i++) {
                    const x = x0 + random() * w;
                    const z = z0 + random() * d;
                    const r = [random(), random(), random(), random()];
                    if (!pointInPolygon(x, z, lawn.polygon)) continue;
                    if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < tree.trunk + 0.05)) continue;
                    roots.push(x, lawn.elevation, z);
                    randoms.push(...r);
                }
                if (!roots.length) continue;
                const box = new THREE.Box3(new THREE.Vector3(x0, lawn.elevation, z0), new THREE.Vector3(x0 + w, lawn.elevation, z0 + d));
                chunks.push({ box, roots: new Float32Array(roots), randoms: new Float32Array(randoms), count: roots.length / 3 });
            }
        }
    });
    return chunks;
}

/**
 * The blades, as the grass's shells see them: a tiling map, a millimetre a
 * pixel, of blades packed a few millimetres apart — each a cone, tallest
 * at its middle (R, 0..1 of the lawn's height), most cut to much the same
 * height and a few left short — and each blade's shade (G). A shell at a
 * given height keeps where R reaches it: every blade, narrower the higher.
 */
export function bladeMap(size = 256, spacing = 4) {
    const random = mulberry32(0x9e3779b9);
    const data = new Uint8Array(size * size * 4);
    for (let gy = 0; gy < size; gy += spacing) {
        for (let gx = 0; gx < size; gx += spacing) {
            const cx = gx + random() * spacing;
            const cy = gy + random() * spacing;
            const radius = spacing * (0.5 + random() * 0.3);
            const height = random() < 0.12 ? 0.45 + random() * 0.3 : 0.8 + random() * 0.2;
            const shade = Math.floor(random() * 255);
            const reach = Math.ceil(radius);
            for (let dy = -reach; dy <= reach; dy++) {
                for (let dx = -reach; dx <= reach; dx++) {
                    const x = Math.floor(cx) + dx;
                    const y = Math.floor(cy) + dy;
                    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
                    if (d >= 1) continue;
                    const i = ((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4;
                    const value = Math.round(height * (1 - d) * 255);
                    if (value > data[i]) {
                        data[i] = value;
                        data[i + 1] = shade;
                    }
                }
            }
        }
    }
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
}

/** A polygon clipped to an axis-aligned square (Sutherland–Hodgman). */
function clipToSquare(polygon, x0, z0, x1, z1) {
    const edges = [
        [(p) => p[0] >= x0, (a, b) => at(a, b, (x0 - a[0]) / (b[0] - a[0]))],
        [(p) => p[0] <= x1, (a, b) => at(a, b, (x1 - a[0]) / (b[0] - a[0]))],
        [(p) => p[1] >= z0, (a, b) => at(a, b, (z0 - a[1]) / (b[1] - a[1]))],
        [(p) => p[1] <= z1, (a, b) => at(a, b, (z1 - a[1]) / (b[1] - a[1]))],
    ];
    let out = polygon;
    for (const [inside, cross] of edges) {
        const input = out;
        out = [];
        for (let i = 0; i < input.length; i++) {
            const a = input[(i + input.length - 1) % input.length];
            const b = input[i];
            if (inside(b)) {
                if (!inside(a)) out.push(cross(a, b));
                out.push(b);
            } else if (inside(a)) {
                out.push(cross(a, b));
            }
        }
        if (!out.length) break;
    }
    return out;
}

function at(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function signedArea(points) {
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        area += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1]);
    }
    return area / 2;
}

/**
 * Every bush's leaf cards, merged — one draw for all of them. A bush is a
 * crown on the ground: a clump, and a smaller one or two beside a bigger
 * one, its leaves small and close, and stirred less than a tree's by the
 * wind (taller than it is, as far as the sway goes).
 *
 * @returns {THREE.BufferGeometry}
 */
export function buildBushes(bushes) {
    const leaves = { position: [], uv: [], center: [], sway: [] };
    for (const bush of bushes) {
        const random = mulberry32(bush.seed);
        const centre = new THREE.Vector3(bush.x, bush.y + bush.height * 0.5, bush.z);
        const clumps = [{ at: centre, radius: bush.radius }];
        const extra = bush.radius > 0.45 ? 1 + Math.floor(random() * 2) : 0;
        for (let k = 0; k < extra; k++) {
            const angle = random() * Math.PI * 2;
            clumps.push({
                at: centre.clone().add(new THREE.Vector3(Math.cos(angle) * bush.radius * 0.55, (random() - 0.6) * bush.height * 0.3, Math.sin(angle) * bush.radius * 0.55)),
                radius: bush.radius * (0.6 + random() * 0.2),
            });
        }
        const sway = { y: bush.y, height: bush.height * 4 };
        for (const clump of clumps) leafCards(clump, sway, centre, random, leaves, { density: 75, least: 12 });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(leaves.position, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(leaves.uv, 2));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(leaves.position.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geometry.setAttribute("aCenter", new THREE.Float32BufferAttribute(leaves.center, 3));
    geometry.setAttribute("aSway", new THREE.Float32BufferAttribute(leaves.sway, 1));
    return geometry;
}

/**
 * A clump's leaves: cards of the leaf texture round the clump, each facing
 * roughly out of it, turned every which way — the fluffy look, once the
 * crown's shader colours them as one. `plant` is the bush's foot and
 * height, as far as the wind is concerned.
 */
function leafCards(clump, plant, centre, random, out, { density = 30, least = 0 } = {}) {
    const count = Math.max(least, Math.round(clump.radius * clump.radius * density));
    const normal = new THREE.Vector3();
    const across = new THREE.Vector3();
    const up = new THREE.Vector3();
    const axis = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
        const direction = randomDirection(random);
        const at = clump.at.clone().addScaledVector(direction, clump.radius * (0.45 + random() * 0.5));
        normal.copy(direction).add(randomDirection(random).multiplyScalar(0.5)).normalize();
        axis.set(random() - 0.5, random() - 0.5, random() - 0.5);
        across.crossVectors(normal, axis).normalize();
        up.crossVectors(normal, across);
        const half = (clump.radius * (0.7 + random() * 0.3)) / 2;
        const corners = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ];
        // A quarter turn of the texture, one way or another, for variety.
        const turn = Math.floor(random() * 4);
        const points = corners.map(([a, b]) => at.clone().addScaledVector(across, a * half).addScaledVector(up, b * half));
        const uvs = corners.map((_, k) => corners[(k + turn) % 4].map((c) => (c + 1) / 2));
        for (const k of [0, 1, 2, 0, 2, 3]) {
            out.position.push(points[k].x, points[k].y, points[k].z);
            out.uv.push(...uvs[k]);
            out.center.push(centre.x, centre.y, centre.z);
            out.sway.push(THREE.MathUtils.clamp((points[k].y - plant.y) / plant.height, 0, 1));
        }
    }
}

function randomDirection(random) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return new THREE.Vector3(r * Math.cos(angle), z, r * Math.sin(angle));
}

function smoothstep(from, to, value) {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

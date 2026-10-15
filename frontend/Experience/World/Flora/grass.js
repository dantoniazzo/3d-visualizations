import * as THREE from "three";

import { plantShader } from "./shaders.js";
import { fbm } from "../../../../shared/landscape.js";
import { mulberry32, pointInPolygon } from "../../../../shared/vegetation.js";
import { LOW_POWER, QUALITY } from "../../Utils/device.js";

/**
 * The site's grasses, blade by blade (World/Flora):
 *
 *   - the lawns, mown short and dense, thinning out with distance until
 *     the lawn's own ground photograph carries it;
 *   - the meadows, long and tufted, green going to straw, in drifts;
 *   - ornamental grasses in the roof terraces' corten planters, arching
 *     fountains of fine blades going to buff at their tips.
 *
 * Each is clumps of curved, tapering blades — a clump one instance —
 * in squares of ground (CHUNK), each square drawn only near enough, and
 * fewer of its clumps the further it is.
 */


/**
 * A clump of `blades` blades round its root within `spread`, each up to a
 * metre tall (an instance's scale sizes it), leaning out by `lean`, its
 * colour from `root` at its foot to `tip` at its end.
 */
export function clumpGeometry({ blades, spread, lean, width, root, tip, seed = 1, curl = 0.4, segments: SEGMENTS = 3 }) {
    const random = mulberry32(seed);
    const positions = [];
    const normals = [];
    const colours = [];
    const uvs = [];
    const indices = [];
    const rootColour = new THREE.Color(root);
    const tipColour = new THREE.Color(tip);
    const colour = new THREE.Color();
    for (let b = 0; b < blades; b++) {
        const angle = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * spread;
        const ox = Math.cos(angle) * r;
        const oz = Math.sin(angle) * r;
        // Out from the middle, the more so the further out it grows.
        const facing = angle + (random() - 0.5) * 1.2;
        const dx = Math.cos(facing);
        const dz = Math.sin(facing);
        const height = 0.55 + random() * 0.45;
        const out = lean * (0.4 + random() * 0.8) * (0.5 + r / Math.max(spread, 1e-3));
        const bladeWidth = width * (0.7 + random() * 0.6);
        // The blade's flat faces across its lean.
        const sideX = -dz;
        const sideZ = dx;
        const shade = 0.75 + random() * 0.4;
        const first = positions.length / 3;
        for (let s = 0; s <= SEGMENTS; s++) {
            const t = s / SEGMENTS;
            const bend = Math.pow(t, 1.8) * out;
            const y = height * (t - curl * bend * bend * 0.6);
            const half = (bladeWidth / 2) * (1 - t * 0.85);
            const cx = ox + dx * bend;
            const cz = oz + dz * bend;
            positions.push(cx - sideX * half, y, cz - sideZ * half, cx + sideX * half, y, cz + sideZ * half);
            // Lit mostly from above, as the ground under it is.
            const nx = dx * 0.25;
            const nz = dz * 0.25;
            normals.push(nx, 0.95, nz, nx, 0.95, nz);
            colour.copy(rootColour).lerp(tipColour, Math.pow(t, 0.8)).multiplyScalar(shade);
            colours.push(colour.r, colour.g, colour.b, colour.r, colour.g, colour.b);
            uvs.push(0, t, 1, t);
        }
        for (let s = 0; s < SEGMENTS; s++) {
            const a = first + s * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

function grassMaterial(name, strength, through = 0.5) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
    material.name = name;
    plantShader(material, { height: 1, strength, through, key: name });
    return material;
}

/**
 * Clumps scattered over polygons, in squares `chunk` metres across: each
 * square an instanced mesh of its clumps, nearest first so a far square
 * can draw only its first few.
 */
export class Sward {
    /**
     * @param {object} options
     * @param {object[]} options.polygons   where it grows
     * @param {number} options.density      clumps a square metre
     * @param {[number, number]} options.size  a clump's height, least and most
     * @param {(x, z) => number} options.height  the ground's height
     * @param {(x, z) => boolean} [options.keepOut]
     * @param {{ scale: number, cover: number }} [options.patches]  drifts: noise at `scale` metres, `cover` of the ground
     * @param {[number, number, number]} options.lod  all of it within the first, a share of it to the second, none past the third
     */
    constructor(name, geometry, material, options) {
        this.name = name;
        this.geometry = geometry;
        this.material = material;
        this.group = new THREE.Group();
        this.group.name = name;
        this.lod = options.lod;
        // Grown as for a phone: at half the density (lawnSward, meadowSward).
        this.grownLow = LOW_POWER;
        this.least = options.least ?? 0.25;
        this.chunks = [];
        const chunk = options.chunk ?? 8;
        const random = mulberry32(options.seed ?? 11);
        const cells = new Map();
        for (const polygon of options.polygons) {
            const xs = polygon.map((p) => p[0]);
            const zs = polygon.map((p) => p[1]);
            const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
            const count = Math.round(area * options.density);
            for (let k = 0; k < count; k++) {
                const x = Math.min(...xs) + random() * (Math.max(...xs) - Math.min(...xs));
                const z = Math.min(...zs) + random() * (Math.max(...zs) - Math.min(...zs));
                const keep = random();
                if (options.within && Math.hypot(x - options.within.centre[0], z - options.within.centre[1]) > options.within.radius) continue;
                if (!pointInPolygon(x, z, polygon)) continue;
                if (options.patches && fbm(x / options.patches.scale, z / options.patches.scale, 5) > options.patches.cover + 0.25 + keep * 0.15) continue;
                if (options.keepOut?.(x, z)) continue;
                const key = `${Math.floor(x / chunk)},${Math.floor(z / chunk)}`;
                if (!cells.has(key)) cells.set(key, []);
                cells.get(key).push({ x, z, y: options.height(x, z), size: options.size[0] + random() * (options.size[1] - options.size[0]), yaw: random() * Math.PI * 2, tint: 0.85 + random() * 0.3 });
            }
        }
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const colour = new THREE.Color();
        for (const [key, clumps] of cells) {
            const [cx, cz] = key.split(",").map(Number);
            // Shuffled, so its first few are spread over it.
            for (let i = clumps.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [clumps[i], clumps[j]] = [clumps[j], clumps[i]];
            }
            const mesh = new THREE.InstancedMesh(geometry, material, clumps.length);
            mesh.name = `${name}:${key}`;
            mesh.receiveShadow = true;
            mesh.castShadow = false;
            clumps.forEach((c, i) => {
                quaternion.setFromAxisAngle(up, c.yaw);
                matrix.compose(position.set(c.x, c.y, c.z), quaternion, scale.set(c.size * 0.9, c.size, c.size * 0.9));
                mesh.setMatrixAt(i, matrix);
                mesh.setColorAt(i, colour.setScalar(c.tint));
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.userData.middle = new THREE.Vector2((cx + 0.5) * chunk, (cz + 0.5) * chunk);
            mesh.userData.total = clumps.length;
            this.group.add(mesh);
            this.chunks.push(mesh);
        }
    }

    /**
     * Each square drawn as near as it is: all, a share, or none — the
     * distances and the share scaled by the slider's step (Utils/device.js's
     * QUALITY.flora: its `reach`, and its `density` of what was grown, which
     * on a phone was grown at half the density to start with).
     */
    place(camera) {
        const flora = QUALITY?.flora ?? { density: 1, reach: 1 };
        // A phone's grass already reaches as step 1 asks.
        const scale = flora.reach / (this.grownLow ? 0.7 : 1);
        const [all, some, none] = this.lod.map((d) => d * scale);
        const density = Math.min(1, flora.density / (this.grownLow ? 0.5 : 1));
        for (const mesh of this.chunks) {
            const d = mesh.userData.middle.distanceTo(new THREE.Vector2(camera.position.x, camera.position.z));
            if (d > none) {
                mesh.visible = false;
                continue;
            }
            mesh.visible = true;
            const share = d < all ? 1 : THREE.MathUtils.lerp(1, this.least, Math.min(1, (d - all) / (some - all)));
            mesh.count = Math.max(1, Math.round(mesh.userData.total * share * density));
        }
    }

    get count() {
        return this.chunks.reduce((sum, mesh) => sum + mesh.userData.total, 0);
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        for (const mesh of this.chunks) mesh.dispose?.();
    }
}

export function lawnSward(polygons, height, keepOut) {
    const geometry = clumpGeometry({ blades: 7, spread: 0.08, lean: 0.25, width: 0.012, root: "#22401a", tip: "#6a963f", seed: 3, curl: 0.2, segments: 2 });
    return new Sward("lawn", geometry, grassMaterial("lawn-grass", 0.03, 0.35), {
        polygons,
        density: LOW_POWER ? 60 : 120,
        size: [0.07, 0.13],
        height: (x, z) => height(x, z) + 0.005,
        keepOut,
        lod: LOW_POWER ? [5, 12, 16] : [8, 20, 26],
        least: 0.2,
        chunk: 4,
        seed: 21,
    });
}

export function meadowSward(polygons, height, keepOut, within) {
    const geometry = clumpGeometry({ blades: 14, spread: 0.16, lean: 0.5, width: 0.012, root: "#2d4d22", tip: "#88a352", seed: 5, curl: 0.5, segments: 3 });
    return new Sward("meadow", geometry, grassMaterial("meadow-grass", 0.06, 0.6), {
        polygons,
        density: LOW_POWER ? 2 : 4.5,
        size: [0.22, 0.55],
        height,
        keepOut,
        within,
        patches: { scale: 9, cover: 0.78 },
        lod: LOW_POWER ? [12, 30, 45] : [20, 50, 75],
        least: 0.12,
        chunk: 10,
        seed: 33,
    });
}

/** Ornamental grasses in the planters: a row of fountains along each, two abreast if it is wide. */
export function planterGrasses(planters) {
    const geometry = clumpGeometry({ blades: 40, spread: 0.09, lean: 0.8, width: 0.013, root: "#55693a", tip: "#d4cf9a", seed: 7, curl: 0.85, segments: 4 });
    const material = grassMaterial("ornamental-grass", 0.09, 0.8);
    const random = mulberry32(77);
    const clumps = [];
    for (const planter of planters) {
        const top = planter.base + planter.height - 0.07;
        for (let i = 0; i < planter.path.length - 1; i++) {
            const [a, b] = [planter.path[i], planter.path[i + 1]];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const ux = (b[0] - a[0]) / length;
            const uz = (b[1] - a[1]) / length;
            const rows = planter.width > 0.5 ? [-0.12, 0.12] : [0];
            for (const row of rows) {
                for (let s = 0.1; s <= length + 0.1; s += 0.3) {
                    const jitter = (random() - 0.5) * 0.08;
                    clumps.push({ x: a[0] + ux * (s + jitter) - uz * row, z: a[1] + uz * (s + jitter) + ux * row, y: top, size: 0.75 + random() * 0.4, yaw: random() * Math.PI * 2 });
                }
            }
        }
    }
    // Lowest first, so that those up to a height are the first so many (showUpTo).
    clumps.sort((a, b) => a.y - b.y);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, clumps.length));
    mesh.name = "planter-grasses";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    clumps.forEach((c, i) => {
        quaternion.setFromAxisAngle(up, c.yaw);
        mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(c.x, c.y, c.z), quaternion, new THREE.Vector3(c.size, c.size, c.size)));
    });
    mesh.count = clumps.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return {
        mesh,
        count: clumps.length,
        /**
         * Only the clumps on the floors a view from above shows
         * (Flora.showUpTo): `shows` says whether one growing at a height
         * is — floors going up with height, the first so many of them.
         */
        showUpTo: (shows) => {
            const shown = shows ? clumps.findIndex((c) => !shows(c.y)) : -1;
            mesh.count = shown < 0 ? clumps.length : shown;
        },
        dispose: () => [geometry, material].forEach((x) => x.dispose()),
    };
}

/**
 * Ornamental grasses in the gardens' beds (shared/landscape.js's
 * `grassBeds`): fountain grass, its blades green at the foot and its
 * plumes pale above them, in drifts across each bed.
 */
export function bedGrasses(beds, height) {
    const geometry = clumpGeometry({ blades: 44, spread: 0.12, lean: 0.75, width: 0.011, root: "#5d6e3c", tip: "#e8e0c4", seed: 13, curl: 0.8, segments: 4 });
    const material = grassMaterial("bed-grass", 0.08, 0.8);
    const random = mulberry32(131);
    const clumps = [];
    for (const { polygon } of beds) {
        const xs = polygon.map((p) => p[0]);
        const zs = polygon.map((p) => p[1]);
        for (let x = Math.min(...xs) + 0.3; x < Math.max(...xs); x += 0.55) {
            for (let z = Math.min(...zs) + 0.3; z < Math.max(...zs); z += 0.55) {
                const px = x + (random() - 0.5) * 0.35;
                const pz = z + (random() - 0.5) * 0.35;
                if (!pointInPolygon(px, pz, polygon) || random() < 0.12) continue;
                clumps.push({ x: px, z: pz, y: height(px, pz), size: 0.75 + random() * 0.45, yaw: random() * Math.PI * 2 });
            }
        }
    }
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, clumps.length));
    mesh.name = "bed-grasses";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    clumps.forEach((c, i) => {
        quaternion.setFromAxisAngle(up, c.yaw);
        mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(c.x, c.y, c.z), quaternion, new THREE.Vector3(c.size, c.size, c.size)));
    });
    mesh.count = clumps.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return { mesh, count: clumps.length, dispose: () => [geometry, material].forEach((x) => x.dispose()) };
}

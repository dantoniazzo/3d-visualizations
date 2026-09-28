import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { mulberry32, pointInPolygon } from "../../../../shared/vegetation.js";

/**
 * The garden's geometry, from the plan (shared/vegetation.js): grass tufts
 * scattered over the lawns, and each tree's trunk, branches and crown.
 */

/** The grass's lawn is cut into squares this many metres a side, each drawn — or not — on its own. */
export const CHUNK = 6;
/** The tuft texture's width to its height. */
const TUFT_ASPECT = 512 / 606;

/**
 * One tuft: two crossed cards, rooted at the origin, a metre high and a
 * metre wide before each tuft's own scale. Every normal points up, so a
 * tuft is lit as the lawn under it is, whichever way it is turned — and
 * seen from either side (shaders.js keeps a card's back from being lit
 * as if it faced down).
 */
export function tuftGeometry() {
    const positions = [];
    const uvs = [];
    const card = (angle) => {
        const x = Math.cos(angle) * 0.5;
        const z = Math.sin(angle) * 0.5;
        const quad = [
            [-x, 0, -z, 0, 0],
            [x, 0, z, 1, 0],
            [x, 1, z, 1, 1],
            [-x, 1, -z, 0, 1],
        ];
        for (const i of [0, 1, 2, 0, 2, 3]) {
            const [px, py, pz, u, v] = quad[i];
            positions.push(px, py, pz);
            uvs.push(u, v);
        }
    };
    card(0);
    card(Math.PI / 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    return geometry;
}

/**
 * Where each tuft of grass grows, square by square of each lawn: `density`
 * tufts a square metre, each turned and sized at random, none on a tree's
 * trunk. A square's tufts are in no order, so the first of them, however
 * many, are spread over all of it — which is how a square far away is
 * thinned (Vegetation.update).
 *
 * @returns {{ centre: THREE.Vector3, tufts: object[] }[]}  each tuft
 *          `{ x, y, z, turn, height, width, tint }`
 */
export function scatterGrass(lawns, trees, density) {
    const chunks = [];
    for (const lawn of lawns) {
        const random = mulberry32(hashString(lawn.id));
        const xs = lawn.polygon.map(([x]) => x);
        const zs = lawn.polygon.map(([, z]) => z);
        const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
        for (let x0 = minX; x0 < maxX; x0 += CHUNK) {
            for (let z0 = minZ; z0 < maxZ; z0 += CHUNK) {
                const w = Math.min(CHUNK, maxX - x0);
                const d = Math.min(CHUNK, maxZ - z0);
                const tufts = [];
                const count = Math.round(w * d * density);
                for (let i = 0; i < count; i++) {
                    const x = x0 + random() * w;
                    const z = z0 + random() * d;
                    const height = 0.11 + random() * 0.08;
                    const turn = random() * Math.PI;
                    const tint = 0.85 + random() * 0.25;
                    if (!pointInPolygon(x, z, lawn.polygon)) continue;
                    if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < tree.trunk + 0.12)) continue;
                    tufts.push({ x, y: lawn.elevation, z, turn, height, width: height * TUFT_ASPECT * 1.7, tint });
                }
                if (!tufts.length) continue;
                chunks.push({ centre: new THREE.Vector3(x0 + w / 2, lawn.elevation, z0 + d / 2), tufts });
            }
        }
    }
    return chunks;
}

/**
 * Every tree's trunk and branches, merged, and every crown's leaf cards,
 * merged — two draws for the whole garden — and a plain trunk for each to
 * walk into.
 *
 * @returns {{ wood: THREE.BufferGeometry, leaves: THREE.BufferGeometry, trunks: THREE.BufferGeometry }}
 */
export function buildTrees(trees) {
    const wood = [];
    const trunks = [];
    const leaves = { position: [], uv: [], center: [], sway: [] };
    for (const tree of trees) {
        const random = mulberry32(tree.seed);
        const foot = new THREE.Vector3(tree.x, tree.y, tree.z);
        const centre = new THREE.Vector3(tree.x, tree.y + tree.crownY, tree.z);
        const clumps = crownClumps(tree, centre, random);

        // The trunk, leaning a little, up into the crown.
        const lean = new THREE.Vector3((random() - 0.5) * 0.3, 1, (random() - 0.5) * 0.3).normalize();
        const top = foot.clone().addScaledVector(lean, tree.crownY - tree.crown * 0.35);
        wood.push(limb(foot, top, tree.trunk, tree.trunk * 0.62, 9));
        // A root flare, so it stands on the lawn rather than in it.
        wood.push(limb(foot.clone().setY(foot.y - 0.05), foot.clone().setY(foot.y + 0.35), tree.trunk * 1.35, tree.trunk, 9));
        // Branches from the top of the trunk into the lowest clumps.
        const low = [...clumps].sort((a, b) => a.at.y - b.at.y).slice(0, 3 + Math.floor(random() * 2));
        for (const clump of low) {
            const from = top.clone().lerp(foot, 0.1 + random() * 0.2);
            const to = from.clone().lerp(clump.at, 0.75);
            wood.push(limb(from, to, tree.trunk * 0.5, tree.trunk * 0.18, 6));
        }
        trunks.push(limb(foot, foot.clone().setY(foot.y + 2.4), tree.trunk * 1.1, tree.trunk * 1.1, 8));

        for (const clump of clumps) leafCards(clump, tree, centre, random, leaves);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(leaves.position, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(leaves.uv, 2));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(leaves.position.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geometry.setAttribute("aCenter", new THREE.Float32BufferAttribute(leaves.center, 3));
    geometry.setAttribute("aSway", new THREE.Float32BufferAttribute(leaves.sway, 1));
    return {
        wood: trees.length ? mergeGeometries(wood) : new THREE.BufferGeometry(),
        leaves: geometry,
        trunks: trees.length ? mergeGeometries(trunks) : new THREE.BufferGeometry(),
    };
}

/**
 * The clumps a crown is gathered in: a round one's scattered through a
 * squat ellipsoid with one on top, a column's stacked up its middle.
 */
function crownClumps(tree, centre, random) {
    const clumps = [];
    if (tree.shape === "column") {
        const count = 5 + Math.floor(random() * 2);
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const radius = tree.spread * (0.95 - t * 0.35) * (0.9 + random() * 0.2);
            const at = centre.clone().add(new THREE.Vector3((random() - 0.5) * 0.4, (t - 0.5) * tree.crown * 1.4, (random() - 0.5) * 0.4));
            clumps.push({ at, radius });
        }
        return clumps;
    }
    const count = 5 + Math.floor(random() * 3);
    const size = (tree.spread + tree.crown) / 2;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + random() * 0.6;
        const out = 0.45 + random() * 0.2;
        const at = centre
            .clone()
            .add(new THREE.Vector3(Math.cos(angle) * tree.spread * out, (random() - 0.6) * tree.crown * 0.5, Math.sin(angle) * tree.spread * out));
        clumps.push({ at, radius: size * (0.5 + random() * 0.15) });
    }
    clumps.push({ at: centre.clone().add(new THREE.Vector3(0, tree.crown * 0.45, 0)), radius: size * 0.6 });
    return clumps;
}

/**
 * A clump's leaves: cards of the leaf texture round the clump, each facing
 * roughly out of it, turned every which way — the fluffy look, once the
 * crown's shader colours them as one.
 */
function leafCards(clump, tree, centre, random, out) {
    const count = Math.round(clump.radius * clump.radius * 30);
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
            out.sway.push(THREE.MathUtils.clamp((points[k].y - tree.y) / tree.height, 0, 1));
        }
    }
}

/** A tapered cylinder from one point to another. */
function limb(from, to, radiusFrom, radiusTo, sides) {
    const direction = to.clone().sub(from);
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radiusTo, radiusFrom, length, sides, 1, true);
    geometry.translate(0, length / 2, 0);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate(from.x, from.y, from.z);
    return geometry;
}

function randomDirection(random) {
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return new THREE.Vector3(r * Math.cos(angle), z, r * Math.sin(angle));
}

function hashString(text) {
    let hash = 2166136261;
    for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
}

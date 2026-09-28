import { FINISHES } from "./catalog.js";

/**
 * A space's garden, worked out from its spec alone: which of its outdoor
 * surfaces are lawn, for grass to grow on, and where trees stand on them
 * and how big they grow. So the editor, the public view and the bake
 * (scripts/bake-public.mjs, which has the trees cast their shade on the
 * lawn and the house) all have the same trees in the same places, without
 * the spec having to list them.
 *
 * Trees line a garden rather than fill it: each lawn big enough gets one
 * for every TREE_AREA of it, towards the edge of the plot more often than
 * not, clear of the house by more than its crown, clear of paths, drives
 * and patios, and clear of one another.
 */

/** Square metres of lawn to a tree... */
const TREE_AREA = 90;
/** ...and a lawn smaller than this has none: the strip by the front path. */
const MIN_TREE_LAWN = 100;
/** How far apart two trunks stand, at the least. */
const TREE_SPACING = 6.5;
/** How far a crown's edge stays from the house. */
const HOUSE_CLEAR = 2.0;
/** How far a trunk stays from paving. */
const PAVING_CLEAR = 1.2;
/** How far a crown's middle stays from the plot's edge. */
const EDGE_CLEAR = 1.0;
/** The spacing of the places tried for a tree. */
const GRID = 2.0;
/** Headroom under the lowest branches. */
const CROWN_BOTTOM = 2.1;

/** Whether an outdoor surface is lawn — grass grows on it. */
export function isLawn(room) {
    const finish = FINISHES[room.floor_finish];
    return finish?.kind === "ground" && finish.generator === "grass";
}

/** A space's lawns. */
export function lawnRooms(spec) {
    return (spec.rooms || []).filter(isLawn);
}

/**
 * Where a space's trees stand, and their sizes, in metres:
 *
 *   x, z, y      the foot of the trunk (y, the lawn's level)
 *   height       to the top of the crown
 *   crownY       the crown's middle, over the foot
 *   crown        its half-height
 *   spread       its half-width
 *   trunk        the trunk's radius at the foot
 *   shape        "round", or "column" — taller than it is wide
 *   seed         for the rest of its shape, drawn where it grows
 *
 * @returns {object[]}
 */
export function planTrees(spec) {
    const rooms = spec.rooms || [];
    const ground = rooms.filter((room) => FINISHES[room.floor_finish]?.kind === "ground");
    const lawns = ground.filter(isLawn);
    if (!lawns.length) return [];
    const paving = ground.filter((room) => !isLawn(room));
    const house = rooms.filter((room) => FINISHES[room.floor_finish]?.kind !== "ground");
    const site = bounds(ground);
    const random = mulberry32(seedOf(rooms));
    const trees = [];

    for (const lawn of lawns) {
        const area = polygonArea(lawn.polygon);
        if (area < MIN_TREE_LAWN) continue;
        const wanted = Math.floor(area / TREE_AREA);
        const box = bounds([lawn]);
        const candidates = [];
        for (let x = box.minX + GRID / 2; x < box.maxX; x += GRID) {
            for (let z = box.minZ + GRID / 2; z < box.maxZ; z += GRID) {
                const px = x + (random() - 0.5) * GRID * 0.8;
                const pz = z + (random() - 0.5) * GRID * 0.8;
                const size = treeSize(random);
                if (!pointInPolygon(px, pz, lawn.polygon)) continue;
                if (distanceToRooms(px, pz, house) < size.spread + HOUSE_CLEAR) continue;
                if (distanceToRooms(px, pz, paving) < PAVING_CLEAR) continue;
                const edge = Math.min(px - site.minX, site.maxX - px, pz - site.minZ, site.maxZ - pz);
                if (edge < EDGE_CLEAR + size.spread * 0.5) continue;
                // Towards the edge of the plot, as a garden is planted.
                candidates.push({ x: px, z: pz, size, score: random() * 6 - edge * 0.5 });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        let placed = 0;
        for (const { x, z, size } of candidates) {
            if (placed >= wanted) break;
            const crowded = trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < Math.max(TREE_SPACING, (tree.spread + size.spread) * 1.1));
            if (crowded) continue;
            trees.push({ id: `tree-${trees.length}`, x: round(x), z: round(z), y: lawn.elevation, ...size, seed: Math.floor(random() * 2 ** 31) });
            placed += 1;
        }
    }
    return trees;
}

/** A tree's size and shape, drawn at random. */
function treeSize(random) {
    const shape = random() < 0.3 ? "column" : "round";
    const height = round(shape === "column" ? 6 + random() * 3 : 4.8 + random() * 3);
    const bottom = Math.max(CROWN_BOTTOM, height * 0.34);
    const crown = (height - bottom) / 2;
    const spread = shape === "column" ? crown * (0.55 + random() * 0.15) : crown * (1.0 + random() * 0.3);
    return {
        height,
        crownY: round(bottom + crown),
        crown: round(crown),
        spread: round(spread),
        trunk: round(0.09 + height * 0.013),
        shape,
    };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** A small, fast, seeded random number generator: the same numbers from the same seed. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A seed from the rooms, so the same plot always grows the same garden. */
function seedOf(rooms) {
    let hash = 2166136261;
    for (const room of rooms) {
        for (const char of room.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        for (const [x, z] of room.polygon) hash = Math.imul(hash ^ Math.round(x * 10 + z * 1000), 16777619);
    }
    return hash >>> 0;
}

function bounds(rooms) {
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const room of rooms) {
        for (const [x, z] of room.polygon) {
            box.minX = Math.min(box.minX, x);
            box.maxX = Math.max(box.maxX, x);
            box.minZ = Math.min(box.minZ, z);
            box.maxZ = Math.max(box.maxZ, z);
        }
    }
    return box;
}

/** How far a point is from the nearest of some rooms — 0 inside one. */
function distanceToRooms(x, z, rooms) {
    let best = Infinity;
    for (const room of rooms) {
        if (pointInPolygon(x, z, room.polygon)) return 0;
        const polygon = room.polygon;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            best = Math.min(best, distanceToSegment(x, z, polygon[j], polygon[i]));
        }
    }
    return best;
}

function distanceToSegment(x, z, [ax, az], [bx, bz]) {
    const dx = bx - ax;
    const dz = bz - az;
    const length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    return Math.hypot(ax + dx * t - x, az + dz * t - z);
}

export function pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

export function polygonArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
    }
    return Math.abs(area) / 2;
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

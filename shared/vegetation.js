import { FINISHES } from "./catalog.js";
import { gardenSettings } from "./garden.js";

/**
 * A space's garden, worked out from its spec alone: which of its outdoor
 * surfaces are lawn, for grass to grow on; the fence round the plot, and
 * the bushes along it; and, in the back garden, where trees stand and how
 * big they grow. So the editor, the public view and the bake
 * (scripts/bake-public.mjs, which has the trees and bushes cast their
 * shade on the lawn and the house) all have the same garden, without the
 * spec having to list it.
 *
 * The plot's front is the side the road is on. In front of the house the
 * fence is low white pickets, and the lawn is kept short; behind it the
 * fence is a tall timber one, and the back garden has longer grass
 * (Vegetation) and its trees, towards its edges more often than not,
 * clear of the house by more than their crowns, of paths and patios, and
 * of one another. Behind the back fence, small hills rise out of the
 * fields, grassed and with a few trees of their own (planHills).
 */

/** A lawn smaller than this has no tree. */
const MIN_TREE_LAWN = 60;
/** How far apart two trunks stand, at the least. */
const TREE_SPACING = 5;
/** How far a crown's edge stays from the house. */
const HOUSE_CLEAR = 2.0;
/** How far a trunk stays from paving. */
const PAVING_CLEAR = 1.2;
/** How far a crown's middle stays from the plot's edge. */
const EDGE_CLEAR = 1.0;
/** The spacing of the places tried for a tree. */
const GRID = 2.0;
/**
 * Fluffy Tree's tree (public/models/fluffy-tree.glb), at its own size, its
 * foot at the origin: how tall, where its crown starts and how far it
 * spreads, and its trunk's radius at the ground, in metres. Each tree is
 * it, scaled (the garden's `trees.scale`) and turned.
 */
export const FLUFFY_TREE = { height: 6.07, crownBottom: 1.29, spread: 3.2, trunk: 0.28 };

/** The fences: the front's pickets and the back's boards, their heights in metres. */
export const FENCES = {
    picket: { height: 1.0 },
    boards: { height: 1.8 },
};
/** Lengths a lawn's edge is tried in, for where the fence runs... */
const FENCE_PIECE = 0.25;
/** ...each tried this far out, into whatever is on the other side... */
const FENCE_REACH = 0.6;
/** ...and a run shorter than this — a corner of the house, between its walls — is none. */
const FENCE_SHORTEST = 1.0;

/**
 * How far below the plot the ground round it lies — the plane running off
 * to the horizon (StructureBuilder.buildGround), clear of the plot's own
 * slabs so as not to fight with them.
 */
export const GROUND_DROP = 0.15;

/**
 * The hills behind the plot: how far past its back fence they start, and
 * how far past its sides they run, in metres. How many there are, how
 * high and how deep a band, are the garden's settings.
 */
const HILLS = { gap: 3, margin: 16 };

/** Whether an outdoor surface is lawn — grass grows on it. */
export function isLawn(room) {
    const finish = FINISHES[room.floor_finish];
    return finish?.kind === "ground" && Boolean(finish.grass);
}

/** Whether an outdoor surface is the street past the plot, not part of it. */
export function isRoad(room) {
    return FINISHES[room.floor_finish]?.kind === "ground" && /road|street/i.test(`${room.id} ${room.name ?? ""}`);
}

/** A space's lawns. */
export function lawnRooms(spec) {
    return (spec.rooms || []).filter(isLawn);
}

/**
 * The lawns behind the house — from the road, beyond its back wall — the
 * back garden. Every lawn, for a plot with no road to face.
 */
export function backGardenLawns(spec) {
    const lawns = lawnRooms(spec);
    const facing = frontOf(spec);
    if (!facing) return lawns;
    return lawns.filter((lawn) => along(centroid(lawn.polygon), facing.dir) < facing.back - 0.5);
}

/**
 * The fence round the plot: every run of a lawn's edge with nothing of
 * the plot beyond it — the road, or off the plot altogether — and none
 * where a path or a drive meets the road, which are its gates. Pickets in
 * front of the house, boards beside and behind it.
 *
 * @returns {{ id, start: number[], end: number[], y, style, height, inward: number[] }[]}
 *          each run's ends (x, z), and which way the lawn it bounds is
 */
export function planFence(spec) {
    const rooms = spec.rooms || [];
    const plot = rooms.filter((room) => !isRoad(room));
    const facing = frontOf(spec);
    // The plot: its rooms, and its walls, whose thickness no room covers.
    const inPlot = (x, z) =>
        plot.some((room) => pointInPolygon(x, z, room.polygon)) ||
        (spec.walls || []).some((wall) => distanceToSegment(x, z, wall.start, wall.end) < wall.thickness / 2 + 0.1);
    const runs = [];
    for (const lawn of rooms.filter(isLawn)) {
        const polygon = lawn.polygon;
        for (let i = 0; i < polygon.length; i++) {
            const [ax, az] = polygon[i];
            const [bx, bz] = polygon[(i + 1) % polygon.length];
            const length = Math.hypot(bx - ax, bz - az);
            if (length < 1e-6) continue;
            const dx = (bx - ax) / length;
            const dz = (bz - az) / length;
            // Out of the lawn, across this edge.
            let [ox, oz] = [-dz, dx];
            if (pointInPolygon(ax + dx * length * 0.5 + ox * 0.05, az + dz * length * 0.5 + oz * 0.05, polygon)) [ox, oz] = [dz, -dx];
            const pieces = Math.max(1, Math.round(length / FENCE_PIECE));
            let from = null;
            const close = (to) => {
                if (from === null || to - from < FENCE_SHORTEST) {
                    from = null;
                    return;
                }
                const start = [ax + dx * from, az + dz * from];
                const end = [ax + dx * to, az + dz * to];
                runs.push(...splitAtFront({ start, end, y: lawn.elevation, inward: [-ox, -oz] }, facing));
                from = null;
            };
            for (let k = 0; k < pieces; k++) {
                const t = ((k + 0.5) / pieces) * length;
                const outside = !inPlot(ax + dx * t + ox * FENCE_REACH, az + dz * t + oz * FENCE_REACH);
                if (outside && from === null) from = (k / pieces) * length;
                if (!outside) close((k / pieces) * length);
            }
            close(length);
        }
    }
    return runs.map((run, i) => {
        const style = facing && along(midpoint(run), facing.dir) > facing.front + 0.5 ? "picket" : "boards";
        return {
            id: `fence-${i}`,
            start: run.start.map(round),
            end: run.end.map(round),
            y: run.y,
            style,
            height: FENCES[style].height,
            inward: run.inward.map(round),
        };
    });
}

/**
 * Bushes along the fence, here and there: in clumps of one to three,
 * each its own size — small along the front's pickets, bigger along the
 * back's boards — on the lawn just inside the fence, clear of the trees'
 * trunks.
 *
 * @returns {{ id, x, z, y, radius, height, seed }[]}
 */
export function planBushes(spec, fence = planFence(spec), trees = planTrees(spec)) {
    const lawns = lawnRooms(spec);
    const random = mulberry32(seedOf(spec.rooms || []) ^ 0x5bd1e995);
    const bushes = [];
    for (const run of fence) {
        const [sx, sz] = run.start;
        const [ex, ez] = run.end;
        const length = Math.hypot(ex - sx, ez - sz);
        const dx = (ex - sx) / length;
        const dz = (ez - sz) / length;
        const [ix, iz] = run.inward;
        const small = run.style === "picket";
        let t = 0.5 + random() * 3;
        while (t < length - 0.5) {
            if (random() < 0.6) {
                const count = 1 + Math.floor(random() * 3);
                for (let k = 0; k < count; k++) {
                    const radius = small ? 0.22 + random() * 0.3 : 0.3 + random() * 0.6;
                    const along = t + (k - (count - 1) / 2) * radius * 1.3 + (random() - 0.5) * 0.3;
                    const inside = radius + 0.12 + random() * 0.25;
                    const x = sx + dx * along + ix * inside;
                    const z = sz + dz * along + iz * inside;
                    if (!lawns.some((lawn) => pointInPolygon(x, z, lawn.polygon))) continue;
                    if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < tree.trunk + radius + 0.4)) continue;
                    bushes.push({
                        id: `bush-${bushes.length}`,
                        x: round(x),
                        z: round(z),
                        y: run.y,
                        radius: round(radius),
                        height: round(radius * (1.1 + random() * 0.6)),
                        seed: Math.floor(random() * 2 ** 31),
                    });
                }
            }
            t += 1.5 + random() * 4.5;
        }
    }
    return bushes;
}

/**
 * Where a space's trees stand — in the back garden — and their sizes, in
 * metres:
 *
 *   x, z, y      the foot of the trunk (y, the lawn's level)
 *   height       to the top of the crown
 *   crownY       the crown's middle, over the foot
 *   crown        its half-height
 *   spread       its half-width
 *   trunk        the trunk's radius at the foot
 *   scale, turn  Fluffy Tree's tree's, drawn at: its size, and its turn
 *   seed         for anything else about it
 *
 * @returns {object[]}
 */
export function planTrees(spec) {
    const rooms = spec.rooms || [];
    const ground = rooms.filter((room) => FINISHES[room.floor_finish]?.kind === "ground");
    const lawns = backGardenLawns(spec);
    if (!lawns.length) return [];
    const paving = ground.filter((room) => !isLawn(room));
    const house = rooms.filter((room) => FINISHES[room.floor_finish]?.kind !== "ground");
    const site = bounds(ground.filter((room) => !isRoad(room)));
    const settings = gardenSettings(spec).trees;
    const random = mulberry32(seedOf(rooms));
    const trees = [];

    for (const lawn of lawns) {
        const area = polygonArea(lawn.polygon);
        if (area < MIN_TREE_LAWN) continue;
        const wanted = Math.floor(area / settings.gardenArea);
        const box = bounds([lawn]);
        const candidates = [];
        for (let x = box.minX + GRID / 2; x < box.maxX; x += GRID) {
            for (let z = box.minZ + GRID / 2; z < box.maxZ; z += GRID) {
                const px = x + (random() - 0.5) * GRID * 0.8;
                const pz = z + (random() - 0.5) * GRID * 0.8;
                const size = treeSize(random, settings.scale);
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
            const crowded = trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < Math.max(TREE_SPACING, (tree.spread + size.spread) * 1.05));
            if (crowded) continue;
            trees.push({ id: `tree-${trees.length}`, x: round(x), z: round(z), y: lawn.elevation, ...size, seed: Math.floor(random() * 2 ** 31) });
            placed += 1;
        }
    }
    return trees;
}

/**
 * A tree's size: Fluffy Tree's, at `scale`, a tenth either way at random,
 * and which way it is turned.
 */
function treeSize(random, scale) {
    const s = scale * (0.9 + random() * 0.2);
    const tree = FLUFFY_TREE;
    return {
        height: round(tree.height * s),
        crownY: round(((tree.crownBottom + tree.height) / 2) * s),
        crown: round(((tree.height - tree.crownBottom) / 2) * s),
        spread: round(tree.spread * s),
        trunk: round(tree.trunk * s),
        scale: round(s),
        turn: round(random() * Math.PI * 2),
    };
}

/**
 * The small hills behind the house: a band of rolling ground past the
 * plot's back fence, a few hills rising from it, running on past the
 * plot's sides. Its ground (hillHeight) is the house's own — drawn,
 * published and baked (SceneBuilder.buildHills) — and its grass and trees
 * the garden's (Vegetation, planHillTrees). Null for a plot with no road,
 * and so no back, to put them behind.
 *
 * @returns {{ dir, across, near, far, left, right, y, bumps, waves }|null}
 *          measured along `dir`, from the house to the road, and `across`
 *          it: the band's near and far edges, and its left and right
 */
/**
 * Where the garden's ground gradient lies (TextureLibrary.setGradient): in
 * the middle of the plot — its outdoor ground, the road aside, or the
 * rooms' when it has none — moved as the garden's settings say, and as
 * wide as they say.
 *
 * @returns {{ x: number, z: number, size: number }}
 */
export function groundGradient(spec) {
    const { size, offsetX, offsetZ } = gardenSettings(spec).ground;
    const rooms = (spec.rooms || []).filter((room) => room.polygon?.length);
    const ground = rooms.filter((room) => FINISHES[room.floor_finish]?.kind === "ground" && !isRoad(room));
    const plot = bounds(ground.length ? ground : rooms);
    const middle = (from, to) => (Number.isFinite(from) ? (from + to) / 2 : 0);
    return {
        x: round(middle(plot.minX, plot.maxX) + offsetX),
        z: round(middle(plot.minZ, plot.maxZ) + offsetZ),
        size,
    };
}

export function planHills(spec) {
    const settings = gardenSettings(spec).hills;
    const facing = frontOf(spec);
    if (!facing || !settings.enabled || !settings.count) return null;
    const rooms = spec.rooms || [];
    const plot = rooms.filter((room) => !isRoad(room)).flatMap((room) => room.polygon);
    const ground = rooms.filter((room) => FINISHES[room.floor_finish]?.kind === "ground");
    const dir = facing.dir;
    const across = [-dir[1], dir[0]];
    const reach = plot.map((point) => along(point, across));
    const near = Math.min(...plot.map((point) => along(point, dir))) - HILLS.gap;
    const far = near - settings.depth;
    const left = Math.min(...reach) - HILLS.margin;
    const right = Math.max(...reach) + HILLS.margin;
    const random = mulberry32(seedOf(rooms) ^ 0x68e31da4);
    const reachBack = Math.max(0, settings.depth - 22);
    const bumps = Array.from({ length: settings.count }, (_, i) => ({
        across: left + ((i + 0.25 + random() * 0.5) / settings.count) * (right - left),
        along: near - Math.min(12, settings.depth / 2) - random() * reachBack,
        radius: 9 + random() * 8,
        height: settings.height * (0.45 + random() * 0.55),
    }));
    // A gentle roll under them all.
    const waves = Array.from({ length: 3 }, (_, i) => ({
        scale: [0.19, 0.43, 0.83][i] * (0.8 + random() * 0.4),
        phase: [random() * 6.28, random() * 6.28],
        height: [0.35, 0.18, 0.07][i],
    }));
    return { dir, across, near, far, left, right, y: ground.length ? Math.min(...ground.map((room) => room.elevation)) : 0, bumps, waves };
}

/**
 * The hills' ground at a point: rising out of the ground round them —
 * from its level at the band's edges, where it is cut away for them
 * (hillOutline), so the two meet edge to edge — to rolling ground and the
 * hills on it.
 */
export function hillHeight(hills, x, z) {
    const v = along([x, z], hills.dir);
    const u = along([x, z], hills.across);
    const rise = smoothstep(0, 8, hills.near - v) * smoothstep(0, 10, v - hills.far) * smoothstep(0, 12, u - hills.left) * smoothstep(0, 12, hills.right - u);
    let height = 0.4;
    for (const bump of hills.bumps) {
        const d = Math.hypot(u - bump.across, v - bump.along) / bump.radius;
        if (d < 1) height += bump.height * (1 - d * d) * (1 - d * d);
    }
    for (const wave of hills.waves) {
        height += wave.height * Math.sin(u * wave.scale + wave.phase[0]) * Math.sin(v * wave.scale * 0.9 + wave.phase[1]);
    }
    return hills.y - GROUND_DROP + rise * (height + GROUND_DROP);
}

/** The band the hills fill, as its four corners (x, z): the hole in the ground round them. */
export function hillOutline(hills) {
    const at = (u, v) => [hills.across[0] * u + hills.dir[0] * v, hills.across[1] * u + hills.dir[1] * v];
    return [at(hills.left, hills.far), at(hills.right, hills.far), at(hills.right, hills.near), at(hills.left, hills.near)];
}

/**
 * Trees on the hills: one near the top of each of the taller hills, as in
 * a field, and a few more on their slopes, well apart.
 *
 * @returns {object[]}  as planTrees's
 */
export function planHillTrees(spec, hills = planHills(spec)) {
    const settings = gardenSettings(spec).trees;
    if (!hills || !settings.hillTrees) return [];
    const random = mulberry32(seedOf(spec.rooms || []) ^ 0x1b873593);
    const at = (u, v) => [hills.across[0] * u + hills.dir[0] * v, hills.across[1] * u + hills.dir[1] * v];
    const places = [];
    for (const bump of [...hills.bumps].sort((a, b) => b.height - a.height).slice(0, Math.min(3, settings.hillTrees))) {
        places.push(at(bump.across + (random() - 0.5) * 3, bump.along + (random() - 0.5) * 3));
    }
    for (let k = 0; k < settings.hillTrees * 6 && places.length < settings.hillTrees + 3; k++) {
        const u = hills.left + 14 + random() * (hills.right - hills.left - 28);
        const v = hills.near - 8 - random() * (hills.near - hills.far - 18);
        places.push(at(u, v));
    }
    const trees = [];
    for (const [x, z] of places) {
        if (trees.length >= settings.hillTrees) break;
        if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 8)) continue;
        const size = treeSize(random, settings.scale);
        // Its foot a little into the slope, so no side of it floats.
        trees.push({ id: `hill-tree-${trees.length}`, x: round(x), z: round(z), y: round(hillHeight(hills, x, z) - 0.08), ...size, seed: Math.floor(random() * 2 ** 31) });
    }
    return trees;
}

function smoothstep(from, to, value) {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

/**
 * Which way the plot faces: from the middle of the house to the nearest
 * point of the road — and how far along that the house's front and back
 * walls are. Null with no road.
 */
function frontOf(spec) {
    const rooms = spec.rooms || [];
    const roads = rooms.filter(isRoad);
    const house = rooms.filter((room) => FINISHES[room.floor_finish]?.kind !== "ground");
    if (!roads.length || !house.length) return null;
    const [hx, hz] = centroid(house.flatMap((room) => room.polygon));
    let nearest = null;
    for (const room of roads) {
        const polygon = room.polygon;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const point = closestOnSegment(hx, hz, polygon[j], polygon[i]);
            if (!nearest || Math.hypot(point[0] - hx, point[1] - hz) < Math.hypot(nearest[0] - hx, nearest[1] - hz)) nearest = point;
        }
    }
    const [rx, rz] = nearest;
    const length = Math.hypot(rx - hx, rz - hz) || 1;
    const dir = [(rx - hx) / length, (rz - hz) / length];
    const reach = house.flatMap((room) => room.polygon).map((point) => along(point, dir));
    return { dir, front: Math.max(...reach), back: Math.min(...reach) };
}

/** A fence run cut in two where it crosses the front of the house, so each part is one style. */
function splitAtFront(run, facing) {
    if (!facing) return [run];
    const a = along(run.start, facing.dir) - (facing.front + 0.5);
    const b = along(run.end, facing.dir) - (facing.front + 0.5);
    if (a * b >= 0 || Math.abs(a - b) < 1e-9) return [run];
    const t = a / (a - b);
    // Not for a sliver: a run just crossing the line takes the style of most of it.
    const length = Math.hypot(run.end[0] - run.start[0], run.end[1] - run.start[1]);
    if (Math.min(t, 1 - t) * length < FENCE_SHORTEST) return [run];
    const cut = [run.start[0] + (run.end[0] - run.start[0]) * t, run.start[1] + (run.end[1] - run.start[1]) * t];
    return [
        { ...run, end: cut },
        { ...run, start: cut },
    ];
}

function along([x, z], [dx, dz]) {
    return x * dx + z * dz;
}

function midpoint({ start, end }) {
    return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

function centroid(points) {
    const n = points.length || 1;
    return [points.reduce((sum, [x]) => sum + x, 0) / n, points.reduce((sum, [, z]) => sum + z, 0) / n];
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

function distanceToSegment(x, z, a, b) {
    const [px, pz] = closestOnSegment(x, z, a, b);
    return Math.hypot(px - x, pz - z);
}

function closestOnSegment(x, z, [ax, az], [bx, bz]) {
    const dx = bx - ax;
    const dz = bz - az;
    const length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    return [ax + dx * t, az + dz * t];
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

/**
 * A site's landscape — everything round its buildings that is not a room,
 * a wall or a roof: the ground it stands on, shaped and painted; its
 * retaining walls, kerbs and road markings; its pergolas, planters, pool
 * and railings; its hedges, lawns, trees, woods, scrub and meadows; its
 * garden lights; and the sky it is lit by. A space has one when its spec
 * says so (`spec.landscape`); the Fluffy Tree garden, fence, hills and
 * neighbourhood (shared/vegetation.js, shared/neighbourhood.js) are then
 * left out — it is a site of its own.
 *
 * Built in two halves: what stands still is part of the house
 * (World/Builders/LandscapeBuilder.js) — walked on, collided with,
 * published — and what grows is drawn live (World/Flora).
 *
 *   sky        { day, dusk, turn, elevation }: Poly Haven skies under
 *              public/textures/sky/, turned `turn` degrees about the
 *              upright; `elevation` (degrees) sets the day's sun lower or
 *              higher than the picture has it
 *   terrain    { size, centre, base, slopes, hills, noise, pads, paint }
 *              the ground: `base` high, raised along each slope and over
 *              each hill, roughened by noise, and held flat at each pad's
 *              height inside it, eased back over its margin; painted
 *              lawn, meadow, gravel, forest floor or hillside where `paint`
 *              says, meadow elsewhere
 *   walls      [{ path, base, top, thickness, finish, slope? }]  dry stone
 *   kerbs      [{ path, base, height, width }]
 *   markings   [{ from, to, width, dash?, base }]  road paint
 *   pergolas   [{ box: [x0,z0,x1,z1], base, height, slats, posts, wall, screens? }]
 *   planters   [{ path, base, height, width }]  corten, full of grasses
 *   railings   [{ points: [[x,z,y],...], height }]  glass balustrades
 *   pools      [{ box, level, depth, deck?, steps? }]  `steps`: { side, count,
 *              going? } — straight steps the pool's full width down from its
 *              side "x0", "x1", "z0" or "z1" (its box's edges), `count`
 *              treads `going` deep (0.35 m) between the floor and the
 *              coping, rising evenly (poolSteps)
 *   hedges     [{ path, base, height, width, red }]  photinia; `red` 0 a green (laurel) hedge
 *   lawns      [{ polygon }]  mown grass, blade by blade near the eye
 *   trees      [{ species, position, scale, yaw, elevation? }]  `elevation`: above the ground (a planter)
 *   forest, shrubs  [{ polygon, spacing, species: { name: weight }, clearings }]
 *   meadow     [{ polygon, density }]  long grass
 *   lights     [{ type, position, target? }]  for the evening
 */
import { mulberry32, pointInPolygon } from "./vegetation.js";

export function hasLandscape(spec) {
    return Boolean(spec?.landscape && typeof spec.landscape === "object");
}

/**
 * What of a spec's `landscape` to keep: its shape as given — numbers that
 * are numbers, short strings, arrays and objects of them — within bounds
 * on how much there is and how deep. Null for none.
 */
export function sanitizeLandscape(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    let budget = 400000;
    const clean = (value, depth) => {
        if (budget-- <= 0 || depth > 8) return undefined;
        if (typeof value === "number") return Number.isFinite(value) ? Math.max(-1e5, Math.min(1e5, value)) : undefined;
        if (typeof value === "string") return value.length <= 200 ? value : undefined;
        if (typeof value === "boolean") return value;
        if (Array.isArray(value)) return value.slice(0, 5000).map((item) => clean(item, depth + 1)).filter((item) => item !== undefined);
        if (value && typeof value === "object") {
            const out = {};
            for (const [key, item] of Object.entries(value).slice(0, 64)) {
                if (!/^[A-Za-z_][\w-]{0,40}$/.test(key)) continue;
                const kept = clean(item, depth + 1);
                if (kept !== undefined) out[key] = kept;
            }
            return out;
        }
        return undefined;
    };
    const out = clean(raw, 0);
    return out && Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------
// A pool
// ---------------------------------------------------------------------

/**
 * A pool's rim and coping, which its builder (World/Builders/
 * LandscapeBuilder.js) lays and the steps climb to: the basin's walls stop
 * POOL_RIM over the ground, and its coping's top is POOL_COPING_TOP.
 */
export const POOL_RIM = 0.02;
export const POOL_COPING_TOP = POOL_RIM + 0.05;
/** How wide the strip along a pool step's front edge is (its nosing, of the coping's stone), and how deep. */
export const NOSING = 0.05;
export const NOSING_DEPTH = 0.04;
/** The sides a pool's steps may come down from, and which way each climbs out, across the floor. */
const STEP_SIDES = { x0: [-1, 0], x1: [1, 0], z0: [0, -1], z1: [0, 1] };

/**
 * A pool's steps (`pool.steps`) as they are built and walked: `count`
 * treads `going` deep, the pool's full width, from the floor up to its
 * coping in `count + 1` equal rises, the top tread against the side they
 * come down from — and the invisible ramp a visitor walks on them by, as a
 * flight's (World/Builders/StructureBuilder.js's buildStairs: the capsule
 * cannot step up a riser), through the middle of every tread, meeting the
 * coping's top a half going back from the pool's edge and running on
 * below the floor at the foot, so that it is met as a slope and not a lip.
 *
 * Null for a pool without steps.
 *
 * @returns {null|{
 *   side: string, count: number, going: number, rise: number, floor: number, top: number,
 *   out: [number, number],                    which way they climb, across the floor
 *   edge: [number, number],                   the middle of the pool's edge they climb to
 *   width: number,                            across them
 *   treads: { box, top, rest, nosing }[],    each tread's footprint [x0, z0, x1, z1], its top's height, and its
 *                                             footprint behind the strip along its front edge (`nosing`, NOSING wide)
 *   ramp: { from: number, to: number, high: number, low: number },  along `out` from `edge` (negative: into the pool), the ramp's top's height at each end
 *   box: [number, number, number, number],    the steps' footprint
 * }}
 */
export function poolSteps(pool) {
    const steps = pool?.steps;
    if (!steps || typeof steps !== "object" || !Array.isArray(pool.box) || pool.box.length !== 4) return null;
    const side = STEP_SIDES[steps.side] ? steps.side : "z1";
    const [x0, z0, x1, z1] = pool.box;
    const [ox, oz] = STEP_SIDES[side];
    const across = ox ? z1 - z0 : x1 - x0;
    const length = ox ? x1 - x0 : z1 - z0;
    const going = Math.min(0.6, Math.max(0.2, Number(steps.going) || 0.35));
    // No more treads than leave half the pool to swim in.
    const count = Math.max(1, Math.min(12, Math.round(Number(steps.count) || 0), Math.floor((length * 0.5) / going)));
    const floor = pool.level - pool.depth;
    const top = POOL_COPING_TOP;
    const rise = (top - floor) / (count + 1);
    const edge = ox ? [ox > 0 ? x1 : x0, (z0 + z1) / 2] : [(x0 + x1) / 2, oz > 0 ? z1 : z0];
    // A box from `a` to `b` metres in from the edge, across the whole pool.
    const band = (a, b) => {
        const [p, q] = [edge[0] - ox * a, edge[1] - oz * a];
        const [r, s] = [edge[0] - ox * b, edge[1] - oz * b];
        return ox ? [Math.min(p, r), z0, Math.max(p, r), z1] : [x0, Math.min(q, s), x1, Math.max(q, s)];
    };
    const treads = [];
    for (let k = 0; k < count; k++) {
        // The k-th from the foot: `count - 1 - k` goings in from the edge, its front further in.
        const back = (count - 1 - k) * going;
        const front = back + going;
        treads.push({ box: band(back, front), top: floor + (k + 1) * rise, rest: band(back, front - NOSING), nosing: band(front - NOSING, front) });
    }
    return {
        side,
        count,
        going,
        rise,
        floor,
        top,
        out: [ox, oz],
        edge,
        width: across,
        treads,
        ramp: { from: -(count + 1) * going, to: going / 2, low: floor - rise / 2, high: top },
        box: band(0, count * going),
    };
}

/**
 * The pool of a landscape's that (x, z) is over, if any — its water's
 * level, its floor, and its steps (poolSteps) — as the visitor's swimming
 * asks of it each frame (World/Player/Player.js).
 *
 * @returns {null|{ pool: object, level: number, floor: number, steps: object|null }}
 */
export function poolAt(landscape, x, z) {
    for (const pool of landscape?.pools || []) {
        const [x0, z0, x1, z1] = pool.box || [];
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        return { pool, level: pool.level, floor: pool.level - pool.depth, steps: poolSteps(pool) };
    }
    return null;
}

// ---------------------------------------------------------------------
// The ground
// ---------------------------------------------------------------------

/**
 * How high the ground is at (x, z): the terrain's base, raised along its
 * slopes and over its hills, roughened by its noise; then each pad in
 * turn holds it flat at its height inside, eased back to the rest over
 * its margin — so a later pad wins where two overlap.
 */
export function terrainHeight(terrain, x, z) {
    let h = terrain.base ?? 0;
    for (const slope of terrain.slopes || []) {
        const [ox, oz] = slope.origin;
        const [dx, dz] = slope.dir;
        const d = (x - ox) * dx + (z - oz) * dz;
        if (d <= 0) continue;
        // Easing in over its first `ease` metres, up to `max`.
        const ease = slope.ease ?? 0;
        const along = ease > 0 && d < ease ? (d * d) / (2 * ease) : d - ease / 2;
        const rise = along * slope.rise;
        const max = slope.max ?? Infinity;
        h += Math.sign(rise) * Math.min(Math.abs(rise), max);
    }
    for (const hill of terrain.hills || []) {
        const r2 = ((x - hill.at[0]) ** 2 + (z - hill.at[1]) ** 2) / hill.radius ** 2;
        if (r2 < 9) h += hill.height * Math.exp(-r2 * 1.4);
    }
    const noise = terrain.noise;
    if (noise?.amplitude) h += noise.amplitude * (fbm(x / noise.scale, z / noise.scale, noise.seed ?? 1) - 0.5) * 2;
    for (const pad of terrain.pads || []) {
        const d = distanceOutside(pad.polygon, x, z);
        if (d <= 0) {
            h = pad.height;
            continue;
        }
        const margin = pad.margin ?? 0;
        if (d >= margin) continue;
        const t = 1 - smoothstep(0, margin, d);
        h = h + (pad.height - h) * t;
    }
    return h;
}

/** The ground's paint: [lawn, meadow, gravel, forest, hillside] weights summing to 1. */
export const GROUNDS = ["lawn", "meadow", "gravel", "forest", "hillside"];
export function terrainPaint(terrain, x, z) {
    const weights = [0, 1, 0, 0, 0];
    for (const region of terrain.paint || []) {
        const index = GROUNDS.indexOf(region.ground);
        if (index < 0) continue;
        const d = distanceOutside(region.polygon, x, z);
        const margin = region.margin ?? 1;
        let w = (d <= 0 ? 1 : d >= margin ? 0 : 1 - smoothstep(0, margin, d)) * (region.strength ?? 1);
        if (w <= 0) continue;
        // A ragged edge: noise eats into it.
        if (region.noise) w *= smoothstep(0.15, 0.6, w + (fbm(x / 9, z / 9, 31 + index) - 0.5) * region.noise * 2);
        for (let k = 0; k < weights.length; k++) weights[k] *= 1 - w;
        weights[index] += w;
    }
    return weights;
}

/** How far (x, z) is outside a polygon: 0 inside. */
export function distanceOutside(polygon, x, z) {
    if (pointInPolygon(x, z, polygon)) return 0;
    let best = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const [ax, az] = polygon[i];
        const [bx, bz] = polygon[(i + 1) % polygon.length];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
    }
    return best;
}

export function smoothstep(from, to, value) {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

/** Value noise, 0..1, smooth, seeded. */
function hash(ix, iz, seed) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x, z, seed = 1) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz, seed);
    const b = hash(ix + 1, iz, seed);
    const c = hash(ix, iz + 1, seed);
    const d = hash(ix + 1, iz + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed = 1) {
    let sum = 0;
    let amplitude = 0.5;
    let total = 0;
    for (let octave = 0; octave < 4; octave++) {
        sum += valueNoise(x, z, seed + octave * 17) * amplitude;
        total += amplitude;
        x *= 2.03;
        z *= 2.03;
        amplitude *= 0.5;
    }
    return sum / total;
}

// ---------------------------------------------------------------------
// What grows where
// ---------------------------------------------------------------------

/**
 * Plants scattered over a region: one in each cell of a grid `spacing`
 * apart, jittered within it, none in the clearings (a share of the ground,
 * where low-frequency noise falls under it) or where `keepOut` says; each
 * a species picked by weight, a size and a heading. `[{ species, x, z,
 * scale, yaw }]`.
 */
export function scatter(region, seed, keepOut = () => false) {
    const random = mulberry32(seed);
    const xs = region.polygon.map((p) => p[0]);
    const zs = region.polygon.map((p) => p[1]);
    const species = Object.entries(region.species || {});
    const total = species.reduce((sum, [, weight]) => sum + weight, 0);
    const spacing = region.spacing ?? 8;
    const [low, high] = region.scale ?? [0.8, 1.2];
    const out = [];
    for (let x = Math.min(...xs) + spacing / 2; x < Math.max(...xs); x += spacing) {
        for (let z = Math.min(...zs) + spacing / 2; z < Math.max(...zs); z += spacing) {
            const px = x + (random() - 0.5) * spacing * 0.9;
            const pz = z + (random() - 0.5) * spacing * 0.9;
            const pick = random() * total;
            const size = low + random() * (high - low);
            const yaw = random() * 360;
            if (!pointInPolygon(px, pz, region.polygon)) continue;
            if (region.clearings && fbm(px / 40, pz / 40, seed) < region.clearings + 0.25) continue;
            if (keepOut(px, pz)) continue;
            let acc = 0;
            const [name] = species.find(([, weight]) => (acc += weight) >= pick) || species[0];
            out.push({ species: name, x: px, z: pz, scale: size, yaw });
        }
    }
    return out;
}

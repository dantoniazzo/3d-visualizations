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
 *   pools      [{ box, level, depth, deck? }]
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

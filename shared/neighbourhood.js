/**
 * The neighbourhood round a house (the garden's `neighbourhood` settings,
 * shared/garden.js), planned from its spec alone — so the editor, the
 * public view and the bake all see the same one:
 *
 *   - the street in front of the plot (its road rooms), carried on both
 *     ways to the edge of the world;
 *   - a cross street beside the plot, on the side of its drive, crossing it
 *     at the one junction: out to the front, and back past the plot, up
 *     and over a hill behind it (planHills puts the hill on its way, and
 *     cuts the ground to it);
 *   - asphalt with a dashed line down the middle, and gravel each side;
 *   - a few neighbours' houses round the junction and across the street,
 *     only their outsides (World/Builders/NeighbourhoodBuilder.js);
 *   - trees along the roads, the grass's tufts on the verges
 *     (World/Vegetation);
 *   - and all of it in a world `radius` metres round the plot's middle,
 *     past which it fades into the dark (World/Environment.js's dome).
 *
 * Coordinates as the rooms': x, and z towards the front of the plot for a
 * house that faces +z. Planned in the plot's own frame — `u` along the
 * street, `v` towards it (frontOf) — so any plot facing any way gets one.
 */
import { gardenSettings } from "./garden.js";
import {
    GROUND_DROP,
    along,
    closestOnSegment,
    frontOf,
    hillHeight,
    isRoad,
    mulberry32,
    planHills,
    pointInPolygon,
    round,
    seedOf,
    treeSize,
} from "./vegetation.js";

/**
 * A published version's spec as it was published: one from before there
 * was a neighbourhood has none — its snapshot has no streets for trees to
 * line — whatever the garden's settings would grow now (scripts/bake-public.mjs
 * and the public view read it so).
 */
export function publishedSpec(spec) {
    if (spec?.garden?.neighbourhood?.enabled !== undefined) return spec;
    return { ...spec, garden: { ...(spec?.garden || {}), neighbourhood: { ...(spec?.garden?.neighbourhood || {}), enabled: false } } };
}

/** A street: its asphalt this wide, gravel this wide each side, and the cross street's middle this far from the plot. */
export const STREET = { width: 5, gravel: 1.2, gap: 10 };
/** The hill road at its steepest, rise over run: a car takes it in its stride. */
const GRADE = 0.1;
/** A street's centreline, sampled this far apart. */
const STEP = 2;
/** The ground beside a road is graded to it this far past its gravel, then rises or falls to the hill's own. */
const CUT = { reach: 0.6, blend: 10 };

/**
 * The plot's frame: which way it faces (`dir`), along its street
 * (`across`), and the world point at (u, v) in it.
 */
export function frameOf(spec) {
    const facing = frontOf(spec);
    if (!facing) return null;
    const dir = facing.dir;
    const across = [-dir[1], dir[0]];
    return { dir, across, at: (u, v) => [across[0] * u + dir[0] * v, across[1] * u + dir[1] * v], uv: (p) => [along(p, across), along(p, dir)] };
}

/**
 * The streets, flat — where each runs, not how high: the front street's
 * three pieces (past one end of the plot's own road, between its other
 * end and the junction, and on past the junction), the cross street's
 * front arm, and its back arm (`climb`), which leaves straight past the
 * plot and winds over the hill behind it. With the world's middle and
 * radius, the junction, and where on the climb the hill's top is (`top`).
 * Null with the neighbourhood off, or a plot with no street.
 */
export function planStreets(spec) {
    const settings = gardenSettings(spec).neighbourhood;
    const frame = settings.enabled ? frameOf(spec) : null;
    if (!frame) return null;
    const rooms = spec.rooms || [];
    const roads = rooms.filter(isRoad);
    const plot = rooms.filter((room) => !isRoad(room)).flatMap((room) => room.polygon.map(frame.uv));
    const road = roads.flatMap((room) => room.polygon.map(frame.uv));
    if (!plot.length || !road.length) return null;
    const uMin = Math.min(...plot.map((p) => p[0]));
    const uMax = Math.max(...plot.map((p) => p[0]));
    const vBack = Math.min(...plot.map((p) => p[1]));
    const vFront = Math.max(...plot.map((p) => p[1]));
    const roadV = [Math.min(...road.map((p) => p[1])), Math.max(...road.map((p) => p[1]))];
    const roadU = [Math.min(...road.map((p) => p[0])), Math.max(...road.map((p) => p[0]))];
    const vStreet = (roadV[0] + roadV[1]) / 2;
    const width = Math.max(4, roadV[1] - roadV[0]);
    const half = width / 2;

    const centre = frame.at((uMin + uMax) / 2, (vBack + vFront) / 2);
    const radius = settings.radius;
    const reach = radius + 25;
    // Out from (u, v) along (du, dv) to past the world's edge.
    const toEdge = (u, v, du, dv) => {
        let t = 0;
        for (; t < 1000; t += STEP) {
            const [x, z] = frame.at(u + du * t, v + dv * t);
            if (Math.hypot(x - centre[0], z - centre[1]) > reach) break;
        }
        return [u + du * t, v + dv * t];
    };

    // The cross street on the side of the drive, so the way home is short.
    const drive = rooms.find((room) => /drive|garage/i.test(room.id));
    const driveU = drive ? drive.polygon.map(frame.uv).reduce((sum, p) => sum + p[0], 0) / drive.polygon.length : (uMin + uMax) / 2;
    const side = Math.abs(driveU - uMin) <= Math.abs(driveU - uMax) ? -1 : 1;
    const uCross = side < 0 ? uMin - STREET.gap : uMax + STREET.gap;
    const inward = -side;

    const pieces = [];
    const straight = (id, from, to) => pieces.push({ id, path: [from, to] });
    // The front street, past the end of the plot's road away from the junction...
    const far = side < 0 ? roadU[1] : roadU[0];
    straight("street-far", [far, vStreet], toEdge(far, vStreet, inward, 0));
    // ...from its near end to the junction, and on past it.
    const near = side < 0 ? roadU[0] : roadU[1];
    if ((near - (uCross - side * half)) * inward > 0.1) straight("street-near", [near, vStreet], [uCross - side * half, vStreet]);
    straight("street-beyond", [uCross + side * half, vStreet], toEdge(uCross + side * half, vStreet, side, 0));
    // The cross street's front arm.
    straight("cross-front", [uCross, vStreet + half], toEdge(uCross, vStreet + half, 0, 1));
    // Its back arm: straight past the plot, then over the hill behind it
    // and on, the way it was heading, to the edge.
    const start = [uCross, vStreet - half];
    const waypoints = [
        start,
        [uCross, (vStreet - half + vBack - 4) / 2],
        [uCross, vBack - 4],
        [uCross + inward * 6, vBack - 20],
        [uCross + inward * 22, vBack - 34],
        [uCross + inward * 44, vBack - 42],
        [uCross + inward * 70, vBack - 46],
    ];
    const [d, e] = waypoints.slice(-2);
    const heading = [e[0] - d[0], e[1] - d[1]];
    const length = Math.hypot(...heading);
    waypoints.push(toEdge(e[0], e[1], heading[0] / length, heading[1] / length));
    pieces.push({ id: "climb", path: spline(waypoints), climb: true });

    const world = (path) => path.map(([u, v]) => frame.at(u, v));
    return {
        frame,
        centre,
        radius,
        width,
        side,
        plot: { uMin, uMax, vBack, vFront, vStreet },
        junction: { centre: frame.at(uCross, vStreet), u: uCross, v: vStreet, size: width },
        // The plot's own road (its rooms), end to end down its middle.
        frontRoad: [frame.at(roadU[0], vStreet), frame.at(roadU[1], vStreet)],
        pieces: pieces.map((piece) => ({ ...piece, points: resample(world(piece.path)) })),
        // The hill's top: where the road is to cross it (planHills), far
        // enough along it for the road to climb all the way up.
        top: frame.at(e[0], e[1]),
        // How far along the climb the hill goes on: its far side.
        hillEnd: frame.at(e[0] + (heading[0] / length) * 30, e[1] + (heading[1] / length) * 30),
    };
}

/**
 * The climb's height all along it, from the hill as it stands (`ground`,
 * the bare hill's height at a point): its ground as it goes, smoothed,
 * and never steeper than GRADE — built up where the ground is too low to
 * climb in time, cut into the hill where it is too high — and level with
 * the junction for as long as the ground is level, before and after the
 * hill. Returns what planHills hangs on the hills for hillHeight to grade
 * the ground to (roadAt).
 */
export function roadProfile(points, ground) {
    const raw = points.map(([x, z]) => ground(x, z) + GROUND_DROP);
    // Smoothed over ten metres either way.
    const window = Math.round(10 / STEP);
    let ys = raw.map((_, i) => {
        let sum = 0;
        let n = 0;
        for (let k = Math.max(0, i - window); k <= Math.min(raw.length - 1, i + window); k++) {
            sum += raw[k];
            n++;
        }
        return sum / n;
    });
    // Level where the ground is, up to where it first rises and from where
    // it last falls: there is nothing there to grade it to.
    const rising = raw.findIndex((y) => y > 0.05);
    const falling = raw.length - 1 - [...raw].reverse().findIndex((y) => y > 0.05);
    const pinned = (i) => rising < 0 || i < rising || i > falling;
    const rise = GRADE * STEP;
    // Built up towards the top in time (fill), then never steeper than the
    // grade from the level ground either side (cut).
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < ys.length; i++) if (!pinned(i)) ys[i] = Math.max(ys[i], ys[i - 1] - rise);
        for (let i = ys.length - 2; i >= 0; i--) if (!pinned(i)) ys[i] = Math.max(ys[i], ys[i + 1] - rise);
    }
    ys = ys.map((y, i) => (pinned(i) ? 0 : y));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i], ys[i - 1] + rise);
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] + rise);
    ys = ys.map(round);
    const road = { points: points.map(([x, z], i) => [x, z, ys[i]]), reach: STREET.width / 2 + STREET.gravel + CUT.reach, blend: CUT.blend };
    road.cells = indexSegments(road.points, road.reach + road.blend);
    return road;
}

/**
 * The nearest point of a road (roadProfile's) to (x, z) within its reach
 * and blend: how far, and how high the road is there. Null farther off.
 */
export function roadAt(road, x, z) {
    const key = cellKey(x, z, road.cells.size);
    const segments = road.cells.map.get(key);
    if (!segments) return null;
    let best = null;
    for (const i of segments) {
        const a = road.points[i];
        const b = road.points[i + 1];
        const [px, pz] = closestOnSegment(x, z, a, b);
        const distance = Math.hypot(px - x, pz - z);
        if (best && distance >= best.distance) continue;
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const t = Math.hypot(px - a[0], pz - a[1]) / span;
        best = { distance, y: a[2] + (b[2] - a[2]) * t };
    }
    return best && best.distance <= road.reach + road.blend ? best : null;
}

/**
 * The whole neighbourhood: its streets with their heights — the climb's
 * from the hill (planHills's `road`), the rest level with the plot's own
 * road — the junction, and the neighbours' houses. Null with it off.
 */
export function planNeighbourhood(spec) {
    const streets = planStreets(spec);
    if (!streets) return null;
    const hills = planHills(spec);
    const pieces = streets.pieces.map((piece) => {
        if (!piece.climb || !hills?.road) return { ...piece, points: piece.points.map(([x, z]) => [x, z, 0]) };
        return { ...piece, points: hills.road.points };
    });
    return { ...streets, hills, pieces, houses: planHouses(spec, streets, hills) };
}

/**
 * The neighbours' houses, as many as the settings ask for of a few spots:
 * across the street from the plot, at the junction's far corner, beside the
 * cross street, and next door — each facing the street it is on, set back
 * behind a front garden, none on the hills. Each a box of two storeys
 * under a gable roof, of a colour and a roof of its own.
 */
function planHouses(spec, streets, hills) {
    const settings = gardenSettings(spec).neighbourhood;
    const { frame, plot, junction, side, width } = streets;
    const random = mulberry32(seedOf(spec.rooms || []) ^ 0x2c1b3c6d);
    const verge = width / 2 + STREET.gravel;
    const middle = (plot.uMin + plot.uMax) / 2;
    const other = side < 0 ? plot.uMax : plot.uMin;
    // Where its front garden meets its front wall, in the frame; which way
    // it faces; and how deep its front garden is, to the street's gravel.
    const spots = [
        { u: middle - 12, v: plot.vStreet + verge + 12, face: [0, -1], yard: 12 },
        { u: middle + 14, v: plot.vStreet + verge + 12, face: [0, -1], yard: 12 },
        { u: junction.u + side * (verge + 13), v: plot.vStreet + verge + 13, face: [0, -1], yard: 13 },
        { u: junction.u + side * (verge + 11), v: plot.vBack + 14, face: [-side, 0], yard: 11 },
        { u: other - side * 16, v: plot.vStreet - verge - 13, face: [0, 1], yard: 13 },
        { u: junction.u + side * (verge + 11), v: plot.vBack - 4, face: [-side, 0], yard: 11 },
    ];
    const walls = ["paint_warm_white", "paint_grey", "exposed_brick", "paint_sage", "plaster", "paint_white"];
    const roofs = ["roof_slate", "roof_terracotta", "roof_slate"];
    const houses = [];
    for (const spot of spots) {
        if (houses.length >= settings.houses) break;
        const w = 9.5 + random() * 3;
        const d = 8.5 + random() * 1.5;
        // Its middle, back from the street by its own half depth.
        const back = d / 2 + 1;
        const u = spot.u - spot.face[0] * back;
        const v = spot.v - spot.face[1] * back;
        const [x, z] = frame.at(u, v);
        if (hills && hillHeight(hills, x, z) > -GROUND_DROP + 0.05) continue;
        const facing = frame.at(spot.face[0], spot.face[1]);
        houses.push({
            id: `neighbour-${houses.length}`,
            x: round(x),
            z: round(z),
            // Its front, +z in its own frame, towards the street.
            yaw: round(Math.atan2(facing[0], facing[1])),
            width: round(w),
            depth: round(d),
            height: round(5.4 + random() * 0.6),
            pitch: round((32 + random() * 8) * (Math.PI / 180)),
            wall: walls[Math.floor(random() * walls.length)],
            roof: roofs[Math.floor(random() * roofs.length)],
            door: ["trim_charcoal", "trim_white", "trim_oak", "trim_walnut"][Math.floor(random() * 4)],
            chimney: random() < 0.7,
            // Its path, from its door down its front garden to the street's gravel.
            path: [
                frame.at(spot.u - spot.face[0] * (back - d / 2), spot.v - spot.face[1] * (back - d / 2)),
                frame.at(spot.u + spot.face[0] * spot.yard, spot.v + spot.face[1] * spot.yard),
            ].map((p) => p.map(round)),
            seed: Math.floor(random() * 2 ** 31),
        });
    }
    return houses;
}

/**
 * Trees along the roads, both sides, a tree to so many metres of road
 * (the settings' `roadTrees`), back from the gravel behind a strip of
 * grass — but none on the plot, at the junction, by a neighbour's house,
 * or past the world's edge. Each as planTrees's.
 */
export function planRoadTrees(spec, plan = planNeighbourhood(spec)) {
    const settings = gardenSettings(spec);
    if (!plan || !settings.trees.enabled || !settings.neighbourhood.roadTrees) return [];
    const random = mulberry32(seedOf(spec.rooms || []) ^ 0x7f4a7c15);
    const verge = plan.width / 2 + STREET.gravel;
    const plot = (spec.rooms || []).filter((room) => !isRoad(room));
    const trees = [];
    for (const piece of plan.pieces) {
        const points = piece.points;
        let travelled = random() * settings.neighbourhood.roadTrees;
        for (let i = 1; i < points.length; i++) {
            const [ax, az] = points[i - 1];
            const [bx, bz] = points[i];
            const step = Math.hypot(bx - ax, bz - az);
            travelled += step;
            if (travelled < settings.neighbourhood.roadTrees) continue;
            travelled -= settings.neighbourhood.roadTrees * (0.75 + random() * 0.5);
            const nx = -(bz - az) / step;
            const nz = (bx - ax) / step;
            for (const sideOf of [-1, 1]) {
                if (random() < 0.25) continue;
                const off = verge + 3 + random() * 4;
                const x = bx + nx * off * sideOf + (random() - 0.5) * 2;
                const z = bz + nz * off * sideOf + (random() - 0.5) * 2;
                if (Math.hypot(x - plan.centre[0], z - plan.centre[1]) > plan.radius - 10) continue;
                if (Math.hypot(x - plan.junction.centre[0], z - plan.junction.centre[1]) < 14) continue;
                if (plot.some((room) => nearPolygon(x, z, room.polygon, 4))) continue;
                if (plan.houses.some((house) => Math.hypot(x - house.x, z - house.z) < Math.max(house.width, house.depth) / 2 + 6)) continue;
                if (offRoads(plan, x, z) < verge + 2) continue;
                if (trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < 7)) continue;
                const size = treeSize(random, settings.trees.scale);
                const y = (plan.hills ? hillHeight(plan.hills, x, z) : -GROUND_DROP) - 0.08;
                trees.push({ id: `road-tree-${trees.length}`, x: round(x), z: round(z), y: round(y), ...size, seed: Math.floor(random() * 2 ** 31) });
            }
        }
    }
    return trees;
}

/** How far (x, z) is from the nearest street's middle. */
export function offRoads(plan, x, z) {
    let best = Infinity;
    for (const piece of plan.pieces) {
        const points = piece.points;
        for (let i = 1; i < points.length; i++) {
            const [px, pz] = closestOnSegment(x, z, points[i - 1], points[i]);
            best = Math.min(best, Math.hypot(px - x, pz - z));
        }
    }
    const [jx, jz] = plan.junction.centre;
    return Math.min(best, Math.max(Math.abs(x - jx), Math.abs(z - jz)) - plan.junction.size / 2);
}

/** Whether (x, z) is in a polygon or within `margin` of it. */
function nearPolygon(x, z, polygon, margin) {
    if (pointInPolygon(x, z, polygon)) return true;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [px, pz] = closestOnSegment(x, z, polygon[j], polygon[i]);
        if (Math.hypot(px - x, pz - z) < margin) return true;
    }
    return false;
}

/** A centripetal Catmull–Rom curve through the points, as a polyline a metre or so apart. */
function spline(points) {
    const out = [points[0]];
    const p = [points[0], ...points, points[points.length - 1]];
    for (let i = 1; i < p.length - 2; i++) {
        const [a, b, c, d] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
        const span = Math.hypot(c[0] - b[0], c[1] - b[1]);
        const n = Math.max(1, Math.ceil(span));
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            const t2 = t * t;
            const t3 = t2 * t;
            out.push([0, 1].map((axis) => 0.5 * (2 * b[axis] + (-a[axis] + c[axis]) * t + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3)));
        }
    }
    return out;
}

/** A polyline resampled STEP metres apart, its ends kept. */
function resample(points) {
    const out = [points[0]];
    let carried = 0;
    for (let i = 1; i < points.length; i++) {
        const [ax, az] = points[i - 1];
        const [bx, bz] = points[i];
        const span = Math.hypot(bx - ax, bz - az);
        let t = STEP - carried;
        while (t <= span) {
            out.push([ax + ((bx - ax) * t) / span, az + ((bz - az) * t) / span]);
            t += STEP;
        }
        carried = span - (t - STEP);
    }
    const last = points[points.length - 1];
    const tail = out[out.length - 1];
    if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 0.2) out.push(last);
    return out.map(([x, z]) => [round(x), round(z)]);
}

/** Each of a polyline's segments filed under every grid cell within `reach` of it, for roadAt. */
function indexSegments(points, reach) {
    const size = 10;
    const map = new Map();
    for (let i = 0; i < points.length - 1; i++) {
        const [ax, az] = points[i];
        const [bx, bz] = points[i + 1];
        const x0 = Math.floor((Math.min(ax, bx) - reach) / size);
        const x1 = Math.floor((Math.max(ax, bx) + reach) / size);
        const z0 = Math.floor((Math.min(az, bz) - reach) / size);
        const z1 = Math.floor((Math.max(az, bz) + reach) / size);
        for (let cx = x0; cx <= x1; cx++) {
            for (let cz = z0; cz <= z1; cz++) {
                const key = `${cx},${cz}`;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(i);
            }
        }
    }
    return { size, map };
}

function cellKey(x, z, size) {
    return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}

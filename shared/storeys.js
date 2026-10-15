/**
 * The storeys of a space as a visitor counts them — the ground floor, the
 * first floor, the roof terrace — whatever heights its buildings stand at.
 *
 * A space's floor levels are the heights its rooms stand at (a published
 * version's `levels`, by which its meshes say which floor they are on),
 * and a site whose buildings stand at different heights has many of them:
 * Ladonia's three villas give nine — the street at -1.1 m, one villa's
 * ground floor at -1.0 and its terraces a centimetre above, the other
 * two's at 0 and 0.01, first floors at 2.2 and 3.0, roofs at 5.4 and 6.0.
 * Listed as they are, a floor picker shows nine floors, some a centimetre
 * apart and some with nothing on them but a road.
 *
 * A storey is what stands on what. A room with no room indoors under it
 * is on the ground (a road that runs on under a house, a storey lower down
 * the slope, is not a floor of the house); a room over one a storey's
 * height below is on the storey above that room's. Each level is then of
 * the storey most of its rooms are on —
 * the rooms indoors, where it has any — and never of a lower storey than a
 * level under it. So every villa's ground floor, with the terraces and the
 * street round them, is one storey, their first floors the next, their
 * roof terraces the third. One house's floors are its storeys, as before.
 *
 * Worked out from the rooms and the levels alone, so a version published
 * before this is listed the same way without being published again.
 */

/** A room this far under another, or further, is a storey below it — not a step down in the same one. */
const STOREY_LEAST = 1.8;

/**
 * @param {object[]} rooms  the spec's rooms: `polygon`, `elevation`, `ceiling_finish`
 * @param {number[]} [levels]  the floor levels' heights, lowest first; the rooms' own, without them
 * @returns {{ list: { index: number, levels: number[], elevation: number, rooms: object[], open: boolean }[], ofLevel: number[] }}
 *          the storeys, lowest first — the indices of each one's levels,
 *          the height most of it stands at, its rooms, and whether it is
 *          mostly open to the sky (a roof terrace) — and each level's storey
 */
export function planStoreys(rooms = [], levels = null) {
    const heights = levels?.length ? levels : [...new Set(rooms.map((room) => room.elevation))].sort((a, b) => a - b);
    if (!heights.length) heights.push(0);

    // Each room's storey: one more than the highest of the rooms indoors it stands over.
    const shapes = rooms.map((room) => shapeOf(room)).sort((a, b) => a.room.elevation - b.room.elevation);
    for (const upper of shapes) {
        for (const lower of shapes) {
            if (lower.room.elevation > upper.room.elevation - STOREY_LEAST) break;
            if (!lower.open && lower.storey >= upper.storey && overlap(upper, lower)) upper.storey = lower.storey + 1;
        }
    }

    // Each level's: that of most of its rooms, by area — the indoor ones, where there are any.
    let ofLevel = heights.map((height) => {
        const here = shapes.filter((shape) => Math.abs(shape.room.elevation - height) < 1e-6);
        const indoors = here.filter((shape) => !shape.open);
        const areas = new Map();
        for (const shape of indoors.length ? indoors : here) areas.set(shape.storey, (areas.get(shape.storey) ?? 0) + shape.area);
        return [...areas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    });
    // Never lower than a level under it; and numbered without gaps.
    for (let i = 1; i < ofLevel.length; i++) ofLevel[i] = Math.max(ofLevel[i], ofLevel[i - 1]);
    const numbers = [...new Set(ofLevel)];
    ofLevel = ofLevel.map((storey) => numbers.indexOf(storey));

    const list = numbers.map((_, index) => {
        const own = ofLevel.flatMap((storey, level) => (storey === index ? [level] : []));
        const here = shapes.filter((shape) => own.some((level) => Math.abs(shape.room.elevation - heights[level]) < 1e-6));
        const indoors = here.filter((shape) => !shape.open);
        // The height most of it stands at: of its rooms indoors, if it has any.
        const areas = new Map();
        for (const shape of indoors.length ? indoors : here) areas.set(shape.room.elevation, (areas.get(shape.room.elevation) ?? 0) + shape.area);
        const elevation = [...areas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? heights[own[0]] ?? 0;
        const area = (list) => list.reduce((sum, shape) => sum + shape.area, 0);
        return { index, levels: own, elevation, rooms: here.map((shape) => shape.room), open: area(indoors) < area(here) / 2 };
    });
    return { list, ofLevel };
}

/**
 * A storey's name: "Ground floor", "First floor"… and "Roof terrace" for
 * one above the ground that is mostly open to the sky. Where the lowest is
 * not at the ground, or there are more than five, its height instead:
 * "Level +3.0 m".
 *
 * @param {{ list: object[] }} storeys  as planStoreys gives them
 * @param {number} index
 */
export function storeyName(storeys, index) {
    const list = storeys?.list ?? [];
    const storey = list[index];
    const plain = list.length <= 5 && Math.abs(list[0]?.elevation ?? 0) < 1.5;
    if (!plain || !storey) {
        const height = storey?.elevation ?? 0;
        return `Level ${height >= 0 ? "+" : "−"}${Math.abs(height).toFixed(1)} m`;
    }
    if (index > 0 && storey.open) return "Roof terrace";
    return ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor"][index] ?? `Floor ${index}`;
}

/** A room's outline, its area, whether it is open to the sky, and a few points inside it to try others with. */
function shapeOf(room) {
    const polygon = room.polygon ?? [];
    const xs = polygon.map((point) => point[0]);
    const zs = polygon.map((point) => point[1]);
    const box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    // A grid over its box, and its corners drawn in a little: those that are inside it.
    const points = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
        for (let k = 0; k < N; k++) points.push([box[0] + ((i + 0.5) / N) * (box[2] - box[0]), box[1] + ((k + 0.5) / N) * (box[3] - box[1])]);
    }
    const cx = (box[0] + box[2]) / 2;
    const cz = (box[1] + box[3]) / 2;
    for (const [x, z] of polygon) points.push([x + (cx - x) * 0.1, z + (cz - z) * 0.1]);
    return {
        room,
        box,
        area: Math.abs(area) / 2,
        open: room.ceiling_finish === "none",
        points: points.filter(([x, z]) => pointIn(x, z, polygon)),
        storey: 0,
    };
}

/** Whether two rooms lie over each other in plan: a point of either inside the other. */
function overlap(a, b) {
    if (a.box[0] >= b.box[2] || b.box[0] >= a.box[2] || a.box[1] >= b.box[3] || b.box[1] >= a.box[3]) return false;
    return a.points.some(([x, z]) => pointIn(x, z, b.room.polygon)) || b.points.some(([x, z]) => pointIn(x, z, a.room.polygon));
}

/** Whether (x, z) is inside a polygon of [x, z] points. */
function pointIn(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

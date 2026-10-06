/**
 * Kosinožići Villas — two modern villas on a wooded hillside above Poreč, in
 * the manner of the Istrian coast's new-build residences: each two cubic
 * wings in warm sand render on a stone-clad stair core, flat roofs with
 * terraces in corten planters of grasses and a timber lattice pergola,
 * louvred pergolas over the garden terraces, gardens behind dry-stone walls
 * and red photinia hedges, olives, a pool, and a row of parking on the road
 * in front, the oak woods rising behind.
 *
 * Each villa holds four flats — a ground-floor one with its garden and a
 * first-floor one with its roof terrace, in each wing — reached up an
 * outside stair in the recess between the wings to a landing, and from
 * the core's hall up a flight to a stone box on the roof, which opens onto
 * both roof terraces.
 *
 * Coordinates are metres, x along the road, z towards it (the road is at
 * +z), y up; the gardens and ground floors are at 0, the parking and the
 * pavement a metre below, behind the retaining wall. One villa's plan is
 * written once, about its own middle, and laid down twice.
 *
 * Everything outside the buildings — the terrain, walls, hedges,
 * pergolas, planters, pool, trees and the woods — is the spec's
 * `landscape` (shared/landscape.js, World/Builders/LandscapeBuilder.js,
 * World/Flora).
 */

// ---------------------------------------------------------------------
// Levels and sizes
// ---------------------------------------------------------------------

/** Floor to floor. */
const STOREY = 3.2;
/** Clear height of a room. */
const CLEAR = 2.8;
/** Top of the first floor's walls; the parapets stand on it. */
const EAVES = STOREY + CLEAR;
/** The roof terraces' and the roof box's floor. */
const ROOF = 6.33;
/** Top of the parapets round the roof terraces. */
const PARAPET = 6.88;
/** The roof box's walls' top, and its roof. */
const BOX_TOP = 9.2;
const EXT = 0.3;
const PART = 0.12;
/** Parking, pavement and the road, below the gardens. */
const STREET = -1.0;
const ROAD = -1.1;
/** Where the retaining wall's face stands, along the parking. */
const WALL_Z = 8.5;
const HEDGE_Z = 7.65;
const PARKING = [WALL_Z, 13.5];
const PAVEMENT = [13.5, 15.5];
const ROAD_Z = [15.6, 22.6];
/** The two villas' middles. */
const VILLAS = [-13, 13];
/** The plot, side to side. */
const PLOT_X = 26;

const round = (n) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------
// One villa, about its own middle: written in local x (along the road) and
// z, laid down at `bx` (mirrored when `mirror`).
// ---------------------------------------------------------------------

function villa(tag, bx, mirror = false) {
    const P = (x, z) => [round(bx + (mirror ? -x : x)), round(z)];
    const rect = (x0, z0, x1, z1) => [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)];
    const out = { rooms: [], walls: [], roofs: [], stairs: [], floor_openings: [], spawns: [] };
    const id = (name) => `${tag}-${name}`;

    /**
     * A wall from `a` to `b` (local), its side A — its `finish` — facing
     * `outside`; each opening at a local point on it.
     */
    const wall = (name, a, b, outside, opts = {}) => {
        let start = P(...a);
        let end = P(...b);
        const o = P(...outside);
        const dx = end[0] - start[0];
        const dz = end[1] - start[1];
        const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        if (-dz * (o[0] - mid[0]) + dx * (o[1] - mid[1]) < 0) [start, end] = [end, start];
        const openings = (opts.openings || []).map(({ at, ...opening }, k) => {
            const p = P(...at);
            return { id: id(`${name}-${k}`), ...opening, offset: round(Math.hypot(p[0] - start[0], p[1] - start[1])) };
        });
        out.walls.push({
            id: id(name),
            start,
            end,
            height: opts.height ?? STOREY,
            thickness: opts.thickness ?? EXT,
            finish: opts.finish ?? "render_sand",
            finish_back: opts.back ?? "paint_white",
            reveal: opts.reveal ?? "render_trim",
            base_height: opts.base ?? 0,
            openings,
        });
    };
    const room = (name, label, r, floor, opts = {}) => {
        out.rooms.push({
            id: id(name),
            name: label,
            polygon: rect(...r),
            voids: [],
            floor_finish: floor,
            ceiling_finish: opts.ceiling ?? "ceiling_white",
            height: opts.height ?? CLEAR,
            elevation: opts.elevation ?? 0,
        });
    };

    // Openings: slim anthracite joinery throughout.
    const win = (at, width, height, sill, opts = {}) => ({
        at,
        type: "window",
        width,
        height,
        sill,
        frame: "frame_anthracite",
        style: "slim",
        panes: opts.panes ?? [Math.max(1, Math.round(width / 1.3)), 1],
        ...(opts.blind != null ? { blind: opts.blind } : {}),
    });
    const glazedDoor = (at, width, opts = {}) => ({
        at,
        type: "door",
        width,
        height: opts.height ?? 2.4,
        sill: 0,
        style: "slim",
        ...(opts.blind != null ? { blind: opts.blind } : {}),
        door: { type: opts.type ?? "sliding", swing: opts.swing ?? "inward_left", leaf: "frame_anthracite", frame: "frame_anthracite", handle: "metal_black", glazed: true },
    });
    const solidDoor = (at, width = 1.0, opts = {}) => ({
        at,
        type: "door",
        width,
        height: opts.height ?? 2.25,
        sill: 0,
        door: { type: "hinged", swing: opts.swing ?? "inward_right", leaf: opts.leaf ?? "frame_anthracite", frame: "frame_anthracite", handle: "metal_chrome" },
    });
    const doorway = (at, width = 0.9) => ({ at, type: "doorway", width, height: 2.15, sill: 0 });
    // Partitions: up to the floor above on the ground floor, to the ceiling above the first.
    const inner = (name, a, b, outside, openings, base) =>
        wall(name, a, b, outside, { thickness: PART, finish: "paint_white", back: "paint_white", reveal: "trim_white", openings, base, height: base ? CLEAR : STOREY });

    // ---- the left wing: x -10.5..-1.5, z -11..-1 -------------------------
    const L = { x0: -10.5, x1: -1.5, z0: -11, z1: -1 };
    // ---- the core: x -1.5..2.5, z -11..-5 --------------------------------
    const C = { x0: -1.5, x1: 2.5, z0: -11, z1: -5 };
    // ---- the right wing: x 2.5..10.5, z -12.5..-2.5 ----------------------
    const R = { x0: 2.5, x1: 10.5, z0: -12.5, z1: -2.5 };

    for (const [floor, base] of [["g", 0], ["f", STOREY]]) {
        const ground = floor === "g";
        const height = ground ? STOREY : CLEAR;
        const blind = (k) => (ground ? undefined : [0.35, 0.7, 0.15][k % 3]);
        // The ground floor is stone where it opens onto its terrace.
        const front = ground ? "stone_cladding" : "render_sand";

        // -- left wing ---------------------------------------------------
        wall(`L${floor}-front`, [L.x0, L.z1], [L.x1, L.z1], [0, 0], {
            base, height, finish: front,
            openings: ground
                ? [glazedDoor([-8.0, L.z1], 2.6, { blind: 0 }), win([-4.6, L.z1], 2.6, 2.4, 0.02, { panes: [2, 1], blind: 0 })]
                : [win([-8.0, L.z1], 2.6, 1.5, 0.9, { blind: blind(0) }), win([-4.0, L.z1], 2.6, 1.5, 0.9, { blind: blind(1) })],
        });
        wall(`L${floor}-west`, [L.x0, L.z0], [L.x0, L.z1], [L.x0 - 1, -5], {
            base, height,
            openings: [win([L.x0, -3.5], 1.4, 1.5, 0.9, { blind: blind(2) }), win([L.x0, -8.5], 1.2, 1.4, 0.9, { blind: blind(1) })],
        });
        wall(`L${floor}-back`, [L.x0, L.z0], [L.x1, L.z0], [-5, L.z0 - 1], {
            base, height,
            openings: [win([-8.5, L.z0], 1.4, 1.4, 0.9, { blind: blind(0) }), win([-5.6, L.z0], 0.7, 0.6, 1.6), win([-3.1, L.z0], 1.4, 1.4, 0.9, { blind: blind(2) })],
        });
        // Its side onto the recess, and the side it shares with the core.
        wall(`L${floor}-recess`, [L.x1, C.z1], [L.x1, L.z1], [L.x1 + 1, -3], {
            base, height,
            openings: ground ? [solidDoor([L.x1, -3.4], 1.0, { swing: "inward_left" })] : [solidDoor([L.x1, -4.3], 1.0, { swing: "inward_right" })],
        });
        wall(`L${floor}-core`, [L.x1, L.z0], [L.x1, C.z1], [L.x1 + 1, -8], { base, height, finish: "paint_white" });
        // Inside: the living room across the front, two bedrooms and a
        // bathroom behind it.
        inner(`L${floor}-p1`, [L.x0, -6.05], [L.x1, -6.05], [-5, -3], [doorway([-8.4, -6.05]), doorway([-5.6, -6.05], 0.8), doorway([-3.0, -6.05])], base);
        inner(`L${floor}-p2`, [-6.6, L.z0], [-6.6, -6.05], [-5, -8], [], base);
        inner(`L${floor}-p3`, [-4.6, L.z0], [-4.6, -6.05], [-3, -8], [], base);

        // -- right wing --------------------------------------------------
        wall(`R${floor}-front`, [R.x0, R.z1], [R.x1, R.z1], [6, 0], {
            base, height, finish: front,
            openings: ground
                ? [glazedDoor([4.9, R.z1], 2.4, { blind: 0 }), win([8.2, R.z1], 2.2, 2.4, 0.02, { panes: [2, 1], blind: 0 })]
                : [win([4.6, R.z1], 2.2, 1.5, 0.9, { blind: blind(1) }), win([8.4, R.z1], 2.2, 1.5, 0.9, { blind: blind(2) })],
        });
        wall(`R${floor}-east`, [R.x1, R.z0], [R.x1, R.z1], [R.x1 + 1, -7], {
            base, height,
            openings: ground
                ? [solidDoor([R.x1, -4.2], 1.0, { swing: "inward_right" }), win([R.x1, -9.8], 1.2, 1.4, 0.9)]
                : [win([R.x1, -4.6], 1.6, 1.5, 0.9, { blind: blind(0) }), win([R.x1, -9.8], 1.2, 1.4, 0.9, { blind: blind(2) })],
        });
        wall(`R${floor}-back`, [R.x0, R.z0], [R.x1, R.z0], [6, R.z0 - 1], {
            base, height,
            openings: [win([4.2, R.z0], 1.4, 1.4, 0.9, { blind: blind(1) }), win([6.6, R.z0], 0.7, 0.6, 1.6), win([9.0, R.z0], 1.4, 1.4, 0.9, { blind: blind(0) })],
        });
        wall(`R${floor}-recess`, [R.x0, C.z1], [R.x0, R.z1], [R.x0 - 1, -3.5], {
            base, height,
            openings: ground ? [] : [solidDoor([R.x0, -4.3], 0.95, { swing: "inward_left" })],
        });
        wall(`R${floor}-core`, [R.x0, C.z0], [R.x0, C.z1], [R.x0 - 1, -8], { base, height, finish: "paint_white" });
        wall(`R${floor}-tail`, [R.x0, R.z0], [R.x0, C.z0], [R.x0 - 1, -12], { base, height });
        inner(`R${floor}-p1`, [R.x0, -7.55], [R.x1, -7.55], [6, -5], [doorway([4.0, -7.55]), doorway([6.6, -7.55], 0.8), doorway([9.0, -7.55])], base);
        inner(`R${floor}-p2`, [5.6, R.z0], [5.6, -7.55], [7, -10], [], base);
        inner(`R${floor}-p3`, [7.6, R.z0], [7.6, -7.55], [9, -10], [], base);

        // -- core --------------------------------------------------------
        wall(`C${floor}-front`, [C.x0, C.z1], [C.x1, C.z1], [0.5, 0], {
            base,
            height: ground ? STOREY : ROOF - STOREY,
            finish: "stone_cladding",
            openings: ground ? [solidDoor([-0.3, C.z1], 0.9)] : [solidDoor([1.1, C.z1], 1.0, { swing: "inward_left" })],
        });
        wall(`C${floor}-back`, [C.x0, C.z0], [C.x1, C.z0], [0.5, C.z0 - 1], {
            base,
            height: ground ? STOREY : ROOF - STOREY,
            finish: "stone_cladding",
            openings: ground ? [] : [win([0.5, C.z0], 0.9, 1.2, 1.0)],
        });

        // -- rooms -------------------------------------------------------
        const elevation = base;
        const unit = ground ? "Ground-floor" : "First-floor";
        const living = "stone_paving_floor";
        room(`L${floor}-living`, `${unit} flat (west) — living`, [-10.35, -5.99, -1.65, -1.15], living, { elevation });
        room(`L${floor}-bed1`, `${unit} flat (west) — bedroom`, [-10.35, -10.85, -6.66, -6.11], "oak_parquet", { elevation });
        room(`L${floor}-bath`, `${unit} flat (west) — bathroom`, [-6.54, -10.85, -4.66, -6.11], "ceramic_tile_white", { elevation });
        room(`L${floor}-bed2`, `${unit} flat (west) — bedroom 2`, [-4.54, -10.85, -1.65, -6.11], "oak_parquet", { elevation });
        room(`R${floor}-living`, `${unit} flat (east) — living`, [2.65, -7.49, 10.35, -2.65], living, { elevation });
        room(`R${floor}-bed1`, `${unit} flat (east) — bedroom`, [2.65, -12.35, 5.54, -7.61], "oak_parquet", { elevation });
        room(`R${floor}-bath`, `${unit} flat (east) — bathroom`, [5.66, -12.35, 7.54, -7.61], "ceramic_tile_white", { elevation });
        room(`R${floor}-bed2`, `${unit} flat (east) — bedroom 2`, [7.66, -12.35, 10.35, -7.61], "oak_parquet", { elevation });
        room(`C${floor}-hall`, ground ? "Store" : "Stair hall", [-1.35, -10.85, 2.35, -5.15], "concrete_steps", {
            elevation,
            // Up to the roof box's floor, which the flight comes up through.
            height: ground ? CLEAR : ROOF - STOREY,
        });
    }

    // -- the parapets round the roof terraces, and the roof box ----------
    const parapet = { base: EAVES, height: PARAPET - EAVES, back: "render_sand", reveal: "coping_grey" };
    wall("L-par-front", [L.x0, L.z1], [L.x1, L.z1], [0, 0], parapet);
    wall("L-par-west", [L.x0, L.z0], [L.x0, L.z1], [L.x0 - 1, -5], parapet);
    wall("L-par-back", [L.x0, L.z0], [L.x1, L.z0], [-5, L.z0 - 1], parapet);
    wall("L-par-recess", [L.x1, C.z1], [L.x1, L.z1], [L.x1 + 1, -3], parapet);
    wall("R-par-front", [R.x0, R.z1], [R.x1, R.z1], [6, 0], parapet);
    wall("R-par-east", [R.x1, R.z0], [R.x1, R.z1], [R.x1 + 1, -7], parapet);
    wall("R-par-back", [R.x0, R.z0], [R.x1, R.z0], [6, R.z0 - 1], parapet);
    wall("R-par-recess", [R.x0, C.z1], [R.x0, R.z1], [R.x0 - 1, -3.5], parapet);
    wall("R-par-tail", [R.x0, R.z0], [R.x0, C.z0], [R.x0 - 1, -12], parapet);
    // Under the box, the core's walls up to the roof terraces' floor.
    wall("L-par-core", [L.x1, L.z0], [L.x1, C.z1], [L.x1 + 1, -8], { base: EAVES, height: ROOF - EAVES, finish: "paint_white", back: "render_sand" });
    wall("R-par-core", [R.x0, C.z0], [R.x0, C.z1], [R.x0 - 1, -8], { base: EAVES, height: ROOF - EAVES, finish: "paint_white", back: "render_sand" });
    const box = { base: ROOF, height: BOX_TOP - ROOF, finish: "stone_cladding", back: "paint_white", reveal: "render_trim" };
    wall("box-front", [C.x0, C.z1], [C.x1, C.z1], [0.5, 0], { ...box, openings: [win([0.5, C.z1], 2.4, 1.4, 0.9, { panes: [2, 1] })] });
    wall("box-back", [C.x0, C.z0], [C.x1, C.z0], [0.5, C.z0 - 1], box);
    wall("box-west", [C.x0, C.z0], [C.x0, C.z1], [C.x0 - 1, -8], { ...box, openings: [glazedDoor([C.x0, -6.1], 1.0, { type: "hinged", swing: "outward_left", height: 2.25 })] });
    wall("box-east", [C.x1, C.z0], [C.x1, C.z1], [C.x1 + 1, -8], { ...box, openings: [glazedDoor([C.x1, -8.1], 1.0, { type: "hinged", swing: "outward_right", height: 2.25 })] });
    room("box", "Roof box", [-1.35, -10.85, 2.35, -5.15], "concrete_steps", { elevation: ROOF, height: BOX_TOP - ROOF - 0.25 });
    out.roofs.push({
        id: id("box-roof"),
        type: "flat",
        footprint: rect(C.x0 - 0.15, C.z0 - 0.15, C.x1 + 0.15, C.z1 + 0.15),
        base_height: BOX_TOP,
        ridge_height: BOX_TOP + 0.3,
        finish: "roof_membrane",
        gable_finish: "render_sand",
        overhang: 0.05,
        thickness: 0.22,
        soffit: "coping_grey",
    });

    // -- the roof terraces ------------------------------------------------
    room("L-roof", "Roof terrace (west)", [L.x0 + 0.15, L.z0 + 0.15, L.x1 - 0.15, L.z1 - 0.15], "roof_pavers", { elevation: ROOF, ceiling: "none", height: 0.05 });
    room("R-roof", "Roof terrace (east)", [R.x0 + 0.15, R.z0 + 0.15, R.x1 - 0.15, R.z1 - 0.15], "roof_pavers", { elevation: ROOF, ceiling: "none", height: 0.05 });

    // -- outside the front: the landing up the outside stair, the recess,
    //    the garden terraces and the path to the steps --------------------
    room("landing", "First-floor landing", [-1.35, -5.0, 2.35, -3.6], "stone_paving", { elevation: STOREY, ceiling: "none", height: 0.05 });
    room("recess", "Entrance", [-1.35, -5.0, 2.35, -1.0], "stone_paving", { ceiling: "none", height: 0.05, elevation: 0.01 });
    room("path", "Path", [-1.35, -1.0, 1.0, 7.25], "stone_paving", { ceiling: "none", height: 0.05, elevation: 0.01 });
    room("L-terrace", "Terrace (west)", [-10.4, -0.85, -1.5, 2.8], "stone_paving", { ceiling: "none", height: 0.05, elevation: 0.01 });
    room("R-terrace", "Terrace (east)", [2.5, -2.35, 10.4, 1.4], "stone_paving", { ceiling: "none", height: 0.05, elevation: 0.01 });

    // The outside stair: up the recess, against the east wing, to the landing.
    out.stairs.push({
        id: id("stair-out"),
        start: P(1.75, 0.45),
        direction: "south",
        yaw: 180,
        width: 1.15,
        base_height: 0,
        top_height: STOREY,
        run: 4.05,
        steps: 17,
        finish: "concrete_steps",
        riser: "render_trim",
    });
    // The core's flight, from the stair hall up to the roof box, against its west wall.
    out.stairs.push({
        id: id("stair-roof"),
        start: P(-0.8, -5.55),
        direction: "south",
        yaw: 180,
        width: 1.05,
        base_height: STOREY,
        top_height: ROOF,
        run: 4.65,
        steps: 17,
        finish: "concrete_steps",
        riser: "trim_white",
    });
    const well = rect(-1.33, -10.2, -0.27, -7.1);
    const xs = well.map((p) => p[0]);
    const zs = well.map((p) => p[1]);
    out.floor_openings.push({
        id: id("well-roof"),
        position: [round((Math.min(...xs) + Math.max(...xs)) / 2), round((Math.min(...zs) + Math.max(...zs)) / 2)],
        elevation: ROOF,
        width: round(Math.max(...xs) - Math.min(...xs)),
        depth: round(Math.max(...zs) - Math.min(...zs)),
        yaw: 0,
        stair_id: id("stair-roof"),
        // Round its open sides: towards the rest of the box, and over the flight's foot.
        rails: [mirror ? "x-" : "x+", "z+"],
    });

    return out;
}

// ---------------------------------------------------------------------
// The villas' own landscape parts, in their local frame, laid down the
// same way: pergolas, planters, the roof pergola, railings, garden lights.
// ---------------------------------------------------------------------

function villaGarden(tag, bx, mirror, { pool }) {
    const P = (x, z) => [round(bx + (mirror ? -x : x)), round(z)];
    const box = (x0, z0, x1, z1) => {
        const [a, b] = [P(x0, z0), P(x1, z1)];
        return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    };
    const path = (...points) => points.map((p) => P(...p));
    const out = { pergolas: [], planters: [], railings: [], hedges: [], trees: [], lawns: [], pools: [], lights: [], grasses: [] };

    // Louvred pergolas over the ground-floor terraces: anthracite frames,
    // timber slats.
    out.pergolas.push({ id: `${tag}-pergola-w`, box: box(-10.45, -1.15, -2.0, 2.75), base: 0, height: 2.85, slats: "x", posts: "front", wall: "back" });
    out.pergolas.push({ id: `${tag}-pergola-e`, box: box(3.0, -2.65, 10.45, 1.35), base: 0, height: 2.85, slats: "x", posts: "front", wall: "back" });
    // On the west roof terrace, a pergola with a lattice screen on two sides.
    out.pergolas.push({ id: `${tag}-pergola-roof`, box: box(-10.2, -10.7, -6.6, -7.3), base: ROOF, height: 2.5, slats: "z", posts: "all", screens: mirror ? ["x+", "z-"] : ["x-", "z-"] });

    // Corten planters of grasses along the roof terraces' edges.
    const planter = (name, points, width = 0.55) => out.planters.push({ id: `${tag}-${name}`, path: path(...points), base: ROOF, height: 0.55, width });
    planter("pl-wf", [[-10.05, -1.6], [-6.4, -1.6]]);
    planter("pl-ww", [[-9.95, -2.2], [-9.95, -6.8]]);
    planter("pl-wf2", [[-4.8, -1.6], [-2.1, -1.6]]);
    planter("pl-ef", [[3.0, -3.05], [9.9, -3.05]]);
    planter("pl-ee", [[9.95, -3.7], [9.95, -8.4]]);
    planter("pl-eb", [[6.0, -11.95], [9.4, -11.95]]);

    // Glass balustrades: the landing's open edge, and up the outside stair.
    out.railings.push({ id: `${tag}-rail-landing`, points: [[...P(-1.3, -3.62), STOREY], [...P(1.15, -3.62), STOREY]], height: 1.0 });
    out.railings.push({ id: `${tag}-rail-stair`, points: [[...P(1.15, 0.45), 0], [...P(1.15, -3.6), STOREY]], height: 1.0 });

    // Hedges: between the gardens and round the path.
    const hedge = (name, points, height = 1.05, width = 0.7) => out.hedges.push({ id: `${tag}-${name}`, path: path(...points), base: 0, height, width });
    hedge("h-path-w", [[-1.85, 3.2], [-1.85, 7.2]]);
    hedge("h-path-e", [[1.45, 1.8], [1.45, 7.2]]);
    // Between the east garden and the path between the villas.
    hedge("h-inner", [[11.05, 1.45], [11.05, 7.2]], 1.05, 0.6);

    // Olives in the gardens, and one by the terrace.
    out.trees.push({ species: "olive_1", position: P(pool ? -11.3 : -6.2, pool ? 6.0 : 5.6), scale: 1.0, yaw: 40 });
    out.trees.push({ species: "olive_3", position: P(6.6, 4.4), scale: 0.95, yaw: 200 });
    out.trees.push({ species: "olive_2", position: P(-11.6, -6.0), scale: 0.9, yaw: 120 });

    // Lawns: the west garden (less its pool) and the east one.
    if (pool) {
        out.pools.push({ id: `${tag}-pool`, box: box(-9.9, 3.45, -3.0, 6.55), level: -0.08, depth: 1.45, deck: box(-10.4, 2.8, -2.25, 7.15) });
        out.lawns.push({ polygon: [P(-12.3, 2.85), P(-10.45, 2.85), P(-10.45, 7.2), P(-12.3, 7.2)] });
    } else {
        out.lawns.push({ polygon: [P(-12.3, 2.85), P(-2.25, 2.85), P(-2.25, 7.2), P(-12.3, 7.2)] });
    }
    out.lawns.push({ polygon: [P(1.85, 1.45), P(10.7, 1.45), P(10.7, 7.2), P(1.85, 7.2)] });
    out.lawns.push({ polygon: [P(-12.2, -11.0), P(-10.65, -11.0), P(-10.65, 2.85), P(-12.2, 2.85)] });
    // Behind the villa.
    out.lawns.push({ polygon: [P(-12.2, -14.2), P(10.6, -14.2), P(10.6, -12.65), P(2.4, -12.65), P(2.4, -11.15), P(-12.2, -11.15)] });

    // Garden lights for the evening: uplights under the olives, step
    // lights up the outside stair, and the pergolas' downlights.
    for (const tree of out.trees) out.lights.push({ type: "uplight", position: [tree.position[0] + 0.5, 0.05, tree.position[1] + 0.5], target: [tree.position[0], 2.2, tree.position[1]] });
    const at = (x, y, z) => {
        const [px, pz] = P(x, z);
        return [px, y, pz];
    };
    out.lights.push({ type: "downlight", position: at(-6.2, 2.75, 0.8) });
    out.lights.push({ type: "downlight", position: at(6.8, 2.75, -0.6) });
    // Step lights up the outside stair, every third step.
    for (let k = 1; k < 17; k += 3) out.lights.push({ type: "step", position: at(2.3, (k * STOREY) / 17 + 0.25, 0.45 - (k * 4.05) / 17) });
    return out;
}

// ---------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------

const rect = (x0, z0, x1, z1) => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
];

function site() {
    const rooms = [];
    const slab = (id, name, polygon, finish, elevation) =>
        rooms.push({ id, name, polygon, voids: [], floor_finish: finish, ceiling_finish: "none", height: 0.05, elevation });
    slab("parking", "Parking", rect(-PLOT_X - 3, PARKING[0], PLOT_X + 3, PARKING[1]), "asphalt", STREET);
    slab("pavement", "Pavement", rect(-150, PAVEMENT[0], 150, PAVEMENT[1]), "concrete_pavers", STREET);
    slab("road", "Road", rect(-150, ROAD_Z[0], 150, ROAD_Z[1]), "asphalt", ROAD);
    // The path between the villas, from the steps up past their gardens to
    // the east wings' doors.
    slab("between", "Path between the villas", rect(-1.6, 1.45, 1.6, 7.25), "stone_paving", 0.01);
    slab("between-back", "Path beside the villas", rect(-2.35, -12.7, 2.35, 1.45), "stone_paving", 0.01);
    return rooms;
}

// ---------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------

const [west, east] = [villa("w", VILLAS[0]), villa("e", VILLAS[1], true)];
const gardens = [villaGarden("w", VILLAS[0], false, { pool: false }), villaGarden("e", VILLAS[1], true, { pool: true })];
const gather = (key) => gardens.flatMap((g) => g[key]);

/** Steps up from the parking to the gardens, cut into the retaining wall. */
const STEPS = [VILLAS[0] - 0.2, 0, VILLAS[1] + 0.2];
const stepFlights = STEPS.map((x, k) => ({
    id: `steps-${k}`,
    start: [round(x), WALL_Z + 0.02],
    direction: "south",
    yaw: 180,
    width: 1.5,
    base_height: STREET,
    top_height: 0,
    run: 1.8,
    steps: 6,
    finish: "concrete_steps",
    riser: "render_trim",
}));

/** The retaining wall along the parking, broken for each flight of steps. */
function retainingWalls() {
    const walls = [];
    let from = -PLOT_X;
    const gaps = [...STEPS.map((x) => [x - 0.78, x + 0.78])];
    for (const [a, b] of gaps) {
        walls.push({ id: `rw-${walls.length}`, path: [[from, WALL_Z - 0.22], [a, WALL_Z - 0.22]], base: STREET - 0.05, top: 0.18, thickness: 0.45, finish: "dry_stone" });
        from = b;
    }
    walls.push({ id: `rw-${walls.length}`, path: [[from, WALL_Z - 0.22], [PLOT_X, WALL_Z - 0.22]], base: STREET - 0.05, top: 0.18, thickness: 0.45, finish: "dry_stone" });
    // The flights' cheeks, back into the garden.
    for (const x of STEPS) {
        for (const side of [-1, 1]) {
            walls.push({ id: `rw-cheek-${walls.length}`, path: [[x + side * 0.98, WALL_Z], [x + side * 0.98, WALL_Z - 2.0]], base: STREET - 0.05, top: 0.18, thickness: 0.4, finish: "dry_stone", slope: [0.18, 0.18] });
        }
    }
    // The plot's ends, stepping down to the street.
    for (const side of [-1, 1]) {
        walls.push({ id: `rw-end-${side}`, path: [[side * (PLOT_X + 0.2), WALL_Z], [side * (PLOT_X + 0.2), -13]], base: STREET - 0.05, top: 0.3, thickness: 0.45, finish: "dry_stone", slope: [0.18, 0.4] });
    }
    return walls;
}

/** The hedge along the top of the retaining wall, with gaps for the steps. */
function frontHedges() {
    const hedges = [];
    let from = -PLOT_X + 0.4;
    for (const x of STEPS) {
        hedges.push({ id: `fh-${hedges.length}`, path: [[from, HEDGE_Z], [x - 1.4, HEDGE_Z]], base: 0, height: 1.05, width: 0.75 });
        from = x + 1.4;
    }
    hedges.push({ id: `fh-${hedges.length}`, path: [[from, HEDGE_Z], [PLOT_X - 0.4, HEDGE_Z]], base: 0, height: 1.05, width: 0.75 });
    for (const side of [-1, 1]) hedges.push({ id: `fh-end-${side}`, path: [[side * (PLOT_X - 0.4), HEDGE_Z], [side * (PLOT_X - 0.4), -12]], base: 0, height: 1.15, width: 0.75 });
    return hedges;
}

/** Road markings: the dashed centre line and the solid edges, and the parking bays. */
function markings() {
    const lines = [];
    const mid = (ROAD_Z[0] + ROAD_Z[1]) / 2;
    lines.push({ from: [-150, mid], to: [150, mid], width: 0.12, dash: [3, 6], base: ROAD });
    lines.push({ from: [-150, ROAD_Z[0] + 0.25], to: [150, ROAD_Z[0] + 0.25], width: 0.15, base: ROAD });
    lines.push({ from: [-150, ROAD_Z[1] - 0.25], to: [150, ROAD_Z[1] - 0.25], width: 0.15, base: ROAD });
    // Bays 2.6 m wide, from the wall to the pavement.
    for (let x = -PLOT_X; x <= PLOT_X + 0.01; x += 2.6) {
        lines.push({ from: [round(x), PARKING[0] + 0.3], to: [round(x), PARKING[1] - 0.15], width: 0.12, base: STREET });
    }
    return lines;
}

/** The kerb between the pavement and the road. */
const kerbs = [{ path: [[-150, ROAD_Z[0] - 0.05], [150, ROAD_Z[0] - 0.05]], base: ROAD, height: 0.12, width: 0.15 }];

const landscape = {
    // Turned so the afternoon sun comes over the road from the south-west,
    // lighting the villas' fronts, as in the developer's renders.
    sky: { day: "kloofendal_48d_partly_cloudy_puresky", dusk: "qwantani_dusk_2_puresky", turn: -99 },
    terrain: {
        size: 640,
        centre: [0, -60],
        base: -1.6,
        slopes: [
            // The hillside behind the villas, climbing into the woods.
            { origin: [0, -15], dir: [0, -1], rise: 0.17, max: 30, ease: 12 },
            // Falling gently away across the road.
            { origin: [0, 26], dir: [0, 1], rise: -0.05, max: 6, ease: 20 },
        ],
        hills: [
            { at: [-120, -190], radius: 85, height: 26 },
            { at: [90, -230], radius: 110, height: 34 },
            { at: [230, -90], radius: 90, height: 22 },
            { at: [-230, -60], radius: 80, height: 18 },
            { at: [160, 120], radius: 90, height: 14 },
            { at: [-150, 150], radius: 80, height: 10 },
        ],
        noise: { amplitude: 1.4, scale: 34, seed: 7 },
        // A metre a square round the villas, coarser out to the edges.
        detail: { centre: [0, -12], half: 90, step: 1, outer: 6 },
        // Where the steps go down through the retaining wall.
        holes: STEPS.map((x) => rect(round(x - 0.77), 6.72, round(x + 0.77), WALL_Z + 0.3)),
        pads: [
            // Either side of the plot, the ground eases down to the street.
            { polygon: rect(-300, 2, 300, 8.06), height: STREET - 0.05, margin: 14 },
            // The gardens and the villas, flat, easing into the hillside;
            // inside the retaining wall, the street a metre down from them.
            // (A few centimetres under the paving, so the two never fight for a pixel.)
            { polygon: rect(-PLOT_X - 0.4, -14.5, PLOT_X + 0.4, 8.05), height: -0.03, margin: 10 },
            // The street, flat, a metre below.
            { polygon: rect(-300, 8.06, 300, PAVEMENT[1] + 0.05), height: STREET - 0.05, margin: 0 },
            { polygon: rect(-300, ROAD_Z[0] - 0.1, 300, ROAD_Z[1] + 0.2), height: ROAD - 0.05, margin: 0 },
            // A shoulder each side of the street, easing into the fields.
            { polygon: rect(-300, ROAD_Z[1] + 0.2, 300, ROAD_Z[1] + 2.0), height: ROAD - 0.06, margin: 8 },
        ],
        paint: [
            // Gravel verges along the road.
            { ground: "gravel", polygon: rect(-300, ROAD_Z[1], 300, ROAD_Z[1] + 1.4), margin: 0.6 },
            // Lawns in the gardens.
            { ground: "lawn", polygon: rect(-PLOT_X, -14, PLOT_X, WALL_Z - 0.4), margin: 1.5 },
            // The woods' floor, behind and either side.
            { ground: "forest", polygon: [[-320, -34], [320, -34], [320, -400], [-320, -400]], margin: 16, noise: 0.8, strength: 0.65 },
            { ground: "forest", polygon: [[48, 8], [320, 8], [320, -34], [48, -34]], margin: 14, noise: 0.8, strength: 0.6 },
            { ground: "forest", polygon: [[-320, 8], [-48, 8], [-48, -34], [-320, -34]], margin: 14, noise: 0.8, strength: 0.6 },
            // The far hills, rockier.
            { ground: "hillside", polygon: [[-400, -150], [400, -150], [400, -500], [-400, -500]], margin: 60, noise: 0.6 },
        ],
    },
    walls: retainingWalls(),
    hedges: [...frontHedges(), ...gather("hedges")],
    pergolas: gather("pergolas"),
    planters: gather("planters"),
    railings: gather("railings"),
    pools: gather("pools"),
    lawns: gather("lawns"),
    kerbs,
    markings: markings(),
    trees: [
        ...gather("trees"),
        // A few trees along the street and in the meadow across it.
        { species: "oak_2", position: [-38, 30], scale: 1.05, yaw: 10 },
        { species: "oak_4", position: [-24, 34], scale: 1.1, yaw: 150 },
        { species: "ash_1", position: [12, 38], scale: 1.0, yaw: 80 },
        { species: "oak_1", position: [44, 33], scale: 0.95, yaw: 200 },
        { species: "oak_4", position: [33, 12], scale: 1.0, yaw: 300 },
        { species: "oak_2", position: [-33, 10], scale: 0.9, yaw: 45 },
    ],
    forest: [
        // The oak woods up the hillside behind, and either side of the plot.
        { polygon: [[-320, -21], [320, -21], [320, -420], [-320, -420]], spacing: 7.5, species: { oak_1: 4, oak_2: 4, oak_3: 2, ash_1: 3, oak_4: 2 }, clearings: 0.12 },
        { polygon: [[36, 6], [320, 6], [320, -21], [36, -21]], spacing: 7.5, species: { oak_1: 3, oak_2: 3, ash_1: 2, oak_4: 2 }, clearings: 0.18 },
        { polygon: [[-320, 6], [-36, 6], [-36, -21], [-320, -21]], spacing: 7.5, species: { oak_1: 3, oak_2: 3, ash_1: 2, oak_4: 2 }, clearings: 0.18 },
        // Copses across the road.
        { polygon: [[-320, 42], [-60, 42], [-60, 320], [-320, 320]], spacing: 9, species: { oak_1: 2, oak_2: 2, oak_4: 2, ash_1: 1 }, clearings: 0.35 },
        { polygon: [[70, 40], [320, 40], [320, 320], [70, 320]], spacing: 9, species: { oak_1: 2, oak_2: 2, oak_4: 2, ash_1: 1 }, clearings: 0.35 },
    ],
    shrubs: [
        // Scrub on the meadows: the slope's foot, either side, and across the road.
        { polygon: [[-36, -14], [36, -14], [36, -21], [-36, -21]], spacing: 3.5, species: { bush_1: 2, bush_3: 1 }, clearings: 0.4 },
        { polygon: [[-300, 25], [300, 25], [300, 120], [-300, 120]], spacing: 6, species: { bush_1: 2, bush_3: 2 }, clearings: 0.5 },
        { polygon: [[29, 8], [36, 8], [36, -14], [29, -14]], spacing: 3.2, species: { bush_1: 1, bush_3: 1 }, clearings: 0.3 },
        { polygon: [[-36, 8], [-29, 8], [-29, -14], [-36, -14]], spacing: 3.2, species: { bush_1: 1, bush_3: 1 }, clearings: 0.3 },
    ],
    meadow: [
        // Long grass on everything that is not garden, street or woods.
        { polygon: [[-300, 23.5], [300, 23.5], [300, 160], [-300, 160]], density: 1 },
        { polygon: [[-60, -12], [60, -12], [60, -60], [-60, -60]], density: 0.8 },
        { polygon: [[28.5, 8], [60, 8], [60, -12], [28.5, -12]], density: 1 },
        { polygon: [[-60, 8], [-28.5, 8], [-28.5, -12], [-60, -12]], density: 1 },
    ],
    lights: gather("lights"),
};

export const kosinozici = {
    name: "Kosinožići Villas",
    summary:
        "Two modern villas on a wooded hillside above Poreč, eight flats between them: each villa two cubic wings in warm sand render on a stone-clad stair core, a ground-floor flat with its garden and a first-floor flat with its roof terrace in each, reached up an outside stair to a landing and on up to a stone box on the roof. Louvred pergolas over the terraces, corten planters of grasses on the roofs, gardens with olives behind dry-stone walls and red photinia hedges, a pool, and parking on the road in front, the oak woods rising behind.",
    environment: { preset: "exterior_mediterranean", ground: "none", ground_size: 0 },
    garden: {
        hills: { enabled: false },
        tufts: { enabled: false },
        trees: { enabled: false },
        blades: { enabled: false },
        neighbourhood: { enabled: false },
    },
    landscape,
    rooms: [...west.rooms, ...east.rooms, ...site()],
    walls: [...west.walls, ...east.walls],
    roofs: [...west.roofs, ...east.roofs],
    stairs: [...west.stairs, ...east.stairs, ...stepFlights],
    floor_openings: [...west.floor_openings, ...east.floor_openings],
    doors: [],
    vehicles: [
        { id: "car", model: "bmw-x6-m", position: [-16.9, 11.2], elevation: STREET, yaw: 180 },
        { id: "car-2", model: "chery-jaecoo-j7", position: [3.9, 11.2], elevation: STREET, yaw: 180 },
    ],
    furniture: [],
    finishes: {},
    spawns: [
        { position: [-6.5, ROAD, 19.0], yaw: 200, label: "The road" },
        { position: [-13.2, 0, 5.0], yaw: 180, label: "West villa garden" },
        { position: [15.6, 0, 5.0], yaw: 90, label: "East villa pool" },
        { position: [-18.5, 0, -3.5], yaw: 0, label: "West villa, ground floor" },
        { position: [-12.7, 0, -2.0], yaw: 180, label: "West villa entrance" },
        { position: [-12.3, STOREY, -4.3], yaw: 180, label: "West villa landing" },
        { position: [-19.0, ROOF, -4.0], yaw: 0, label: "West villa roof terrace" },
        { position: [19.0, ROOF, -4.0], yaw: 0, label: "East villa roof terrace" },
    ],
};

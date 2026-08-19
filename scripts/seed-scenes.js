/**
 * Writes the bundled example properties.
 *
 * These exist so the app is walkable straight after `npm install`, with no
 * API key — and as worked examples of what a well-formed shell spec looks
 * like. Run with `npm run seed`.
 */
import { existsSync, readFileSync } from "node:fs";

import { validateScene } from "../server/ai/validate.js";
import { writeScene } from "../server/store/sceneStore.js";

// Doors, stairs and room metadata for Wrenfield House, emitted in app
// coordinates by blender/export_app.py alongside the GLB itself.
const wrenfieldMetaPath = new URL("./wrenfield-meta.json", import.meta.url);
const wrenfieldMeta = existsSync(wrenfieldMetaPath)
    ? JSON.parse(readFileSync(wrenfieldMetaPath))
    : { doors: [], stairs: [], rooms: [] };

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const wall = (id, start, end, opts = {}) => ({
    id,
    start,
    end,
    height: opts.height ?? 2.55,
    thickness: opts.thickness ?? 0.1,
    finish: opts.finish ?? "paint_warm_white",
    finish_back: opts.back ?? opts.finish ?? "paint_warm_white",
    reveal: opts.reveal ?? "trim_white",
    base_height: opts.base ?? 0,
    openings: opts.openings ?? [],
});

const room = (id, name, polygon, floor, ceiling = "ceiling_white", height = 2.55, opts = {}) => ({
    id,
    name,
    polygon,
    voids: opts.voids ?? [],
    floor_finish: floor,
    ceiling_finish: ceiling,
    height,
    elevation: opts.elevation ?? 0,
});

/** Axis-aligned rectangle, the shape almost every room in these plans is. */
const rect = (x0, z0, x1, z1) => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
];

/** An outdoor slab: yard, drive, path or road. No ceiling, no light. */
const site = (id, name, polygon, finish) =>
    room(id, name, polygon, finish, "none", 0.05);

const door = (id, offset, opts = {}) => ({
    id,
    type: "door",
    offset,
    width: opts.width ?? 0.85,
    height: opts.height ?? 2.04,
    sill: 0,
    door: {
        type: opts.type ?? "hinged",
        swing: opts.swing ?? "inward_right",
        leaf: opts.leaf ?? "trim_white",
        frame: "trim_white",
        handle: opts.handle ?? "metal_brass",
    },
});

const doorway = (id, offset, width = 1.1) => ({
    id,
    type: "doorway",
    offset,
    width,
    height: 2.1,
    sill: 0,
});

const window_ = (id, offset, width = 1.5, height = 1.35, sill = 0.9) => ({
    id,
    type: "window",
    offset,
    width,
    height,
    sill,
    frame: "trim_white",
});

const stair = (id, start, direction, base, top, opts = {}) => ({
    id,
    start,
    direction,
    width: opts.width ?? 1.15,
    base_height: base,
    top_height: top,
    run: opts.run ?? 4.2,
    steps: opts.steps ?? 14,
    finish: opts.finish ?? "oak_parquet",
    riser: opts.riser ?? "trim_white",
});

const roof = (id, footprint, base, ridge, opts = {}) => ({
    id,
    type: opts.type ?? "gable",
    footprint,
    base_height: base,
    ridge_height: ridge,
    ridge_axis: opts.axis ?? "z",
    finish: opts.finish ?? "roof_terracotta",
    gable_finish: opts.gable ?? "plaster",
    overhang: opts.overhang ?? 0.45,
});

// =====================================================================
// 1. Detached family house — three storeys, fully procedural.
//
// Envelope 9.0 x 12.0 m with 0.30 external walls, so the inner faces sit
// at x -4.85..3.85 and z -1.85..9.85. Internal partitions are 0.10 thick,
// which is why room polygons stop 0.05 short of each centreline. A garage
// is attached to the east, and the site around it — road, drive, path,
// yards and patio — is built as outdoor slabs.
//
// Storeys stack at 0 / 2.8 / 5.6, each 2.6 clear (the attic 2.1), with the
// external walls in three rings so every storey can carry its own windows.
// Eaves at 7.0, ridge at 9.7.
//
//   ATTIC  z 9.85 ┌──────────┬─┬────┐      GROUND z 9.85 ┌──────┬──┬──────┐
//                 │  Bed 6   │ │Stor│                    │      │  │ Bed 2│
//          z 5.4  ├──────────┴─┴────┤             z 6.45 │Kitch │  ├──────┤
//                 │    Landing      │                    │ -en  │H │ Guest│
//          z 3.45 ├──────────┬──────┤             z 4.55 ├──────┤a ├──────┤
//                 │  Shower  │ arm  │                    │      │l │Shower│
//          z 1.45 ├──────────┤ of   │             z 0.65 │Living│l ├──────┤
//                 │  Bed 5   │ land │                    │      │  │Utilty│
//         z -1.85 └──────────┴──────┘            z -1.85 └──────┴──┴──────┘
//                x -3.5    1.25   2.5                   x -4.85 -1.7 0.7 3.85
//
// Two straight flights run up the hall: ground->first against its west
// wall, first->attic against its east. Each needs the storey above open
// where it arrives, which is what the rooms' `voids` are for.
// =====================================================================

// Stairwell footprints, inset a hair from the hall walls so the holes stay
// strictly inside the polygons they are cut from.
const WELL_LOWER = rect(-1.58, 0.2, -0.45, 4.4);
const WELL_UPPER = rect(-0.55, 5.4, 0.58, 9.6);

// Offsets run along a wall from its start, so name each line's arithmetic
// once and let the openings read as plan coordinates.
const sOff = (x) => x + 5; //  south wall, west to east
const eOff = (z) => z + 2; //  east wall, south to north
const nOff = (x) => 4 - x; //  north wall, east to west
const wOff = (z) => 10 - z; //  west wall, north to south
const hOff = (z) => z + 2; //  either hall partition, south to north

const STOREY = { ground: 0, first: 2.8, attic: 5.6 };
const EXTERNAL = { thickness: 0.3, finish: "paint_warm_white", back: "plaster" };

const house = {
    name: "Ashgrove House",
    summary:
        "A detached three-storey family house of about 245 m², set back from the road behind a lawn and a paved path, with an attached garage off the drive. Living room, kitchen-diner, utility, shower room and two bedrooms on the ground floor; three bedrooms, a dressing room and the family bathroom on the first; two more bedrooms and a shower room in the attic. Terracotta pantile roof, lawns front, back and to both sides, and a paved patio off the kitchen.",
    environment: { preset: "exterior_day", ground: "grass", ground_size: 200 },
    spawns: [
        { position: [-0.5, 0, -6.0], yaw: 0, label: "Front path" },
        { position: [-0.5, 0, -1.0], yaw: 0, label: "Entrance hall" },
        { position: [-3.3, 0, 1.0], yaw: 0, label: "Living room" },
        { position: [-3.3, 0, 7.2], yaw: 180, label: "Kitchen & dining" },
        { position: [2.3, 0, 4.7], yaw: 90, label: "Guest bedroom" },
        { position: [6.0, 0, 0.7], yaw: 0, label: "Garage" },
        { position: [0.0, 2.8, 4.9], yaw: 0, label: "First-floor landing" },
        { position: [-3.3, 2.8, 7.0], yaw: 180, label: "Principal bedroom" },
        { position: [2.3, 2.8, 0.2], yaw: 90, label: "Family bathroom" },
        { position: [-1.5, 5.6, 4.4], yaw: 180, label: "Attic landing" },
        { position: [-1.2, 5.6, -0.3], yaw: 180, label: "Attic bedroom" },
        { position: [-0.5, 0, 11.5], yaw: 180, label: "Back garden" },
    ],
    rooms: [
        // --- Ground floor -------------------------------------------------
        room("g-hall", "Entrance Hall", rect(-1.6, -1.85, 0.6, 9.85), "oak_parquet", "ceiling_white", 2.6, {
            voids: [WELL_LOWER],
        }),
        room("g-living", "Living Room", rect(-4.85, -1.85, -1.7, 4.5), "oak_parquet", "ceiling_white", 2.6),
        room("g-kitchen", "Kitchen & Dining", rect(-4.85, 4.6, -1.7, 9.85), "ceramic_tile_white", "ceiling_white", 2.6),
        room("g-util", "Utility & Boot Room", rect(0.7, -1.85, 3.85, 0.6), "polished_concrete", "ceiling_white", 2.6),
        room("g-shower", "Shower Room", rect(0.7, 0.7, 3.85, 2.9), "slate_tile", "ceiling_white", 2.6),
        room("g-bed", "Guest Bedroom", rect(0.7, 3.0, 3.85, 6.4), "carpet_beige", "ceiling_white", 2.6),
        room("g-bed2", "Bedroom 2", rect(0.7, 6.5, 3.85, 9.85), "carpet_grey", "ceiling_white", 2.6),
        room("garage", "Garage", rect(4.15, -1.85, 7.85, 3.35), "polished_concrete", "ceiling_white", 2.6),

        // --- First floor --------------------------------------------------
        room("f-landing", "Landing", rect(-1.6, -1.85, 0.6, 9.85), "oak_parquet", "ceiling_white", 2.6, {
            elevation: STOREY.first,
            // The lower flight arrives through the floor here; the upper one
            // leaves through the ceiling.
            voids: [WELL_LOWER, WELL_UPPER],
        }),
        room("f-bed3", "Bedroom 3", rect(-4.85, -1.85, -1.7, 4.2), "carpet_grey", "ceiling_white", 2.6, {
            elevation: STOREY.first,
        }),
        room("f-bed1", "Principal Bedroom", rect(-4.85, 4.3, -1.7, 9.85), "carpet_beige", "ceiling_white", 2.6, {
            elevation: STOREY.first,
        }),
        room("f-bath", "Family Bathroom", rect(0.7, -1.85, 3.85, 2.3), "ceramic_tile_white", "ceiling_white", 2.6, {
            elevation: STOREY.first,
        }),
        room("f-bed4", "Bedroom 4", rect(0.7, 2.4, 3.85, 6.1), "carpet_navy", "ceiling_white", 2.6, {
            elevation: STOREY.first,
        }),
        room("f-dress", "Dressing Room", rect(0.7, 6.2, 3.85, 9.85), "carpet_beige", "ceiling_white", 2.6, {
            elevation: STOREY.first,
        }),

        // --- Attic ----------------------------------------------------------
        // Inset from the external walls so the roof slopes clear its ceiling:
        // at x = ±3.0 from the ridge the roof is at 7.90 and the ceiling 7.70.
        // The landing is an L — a bar across the head of the stair, and an arm
        // running south past the two rooms it serves.
        room(
            "a-landing",
            "Attic Landing",
            [
                [-3.5, 5.35],
                [-3.5, 3.5],
                [1.3, 3.5],
                [1.3, -1.85],
                [2.5, -1.85],
                [2.5, 5.35],
            ],
            "pale_ash_boards",
            "ceiling_white",
            2.1,
            { elevation: STOREY.attic }
        ),
        room("a-bed5", "Attic Bedroom 5", rect(-3.5, -1.85, 1.2, 1.4), "carpet_grey", "ceiling_white", 2.1, {
            elevation: STOREY.attic,
        }),
        room("a-shower", "Attic Shower Room", rect(-3.5, 1.5, 1.2, 3.4), "ceramic_tile_white", "ceiling_white", 2.1, {
            elevation: STOREY.attic,
        }),
        room("a-bed6", "Attic Bedroom 6", rect(-3.5, 5.45, -0.65, 9.85), "carpet_beige", "ceiling_white", 2.1, {
            elevation: STOREY.attic,
        }),
        room("a-store", "Attic Store", rect(0.68, 5.45, 2.5, 9.85), "pale_ash_boards", "ceiling_white", 2.1, {
            elevation: STOREY.attic,
        }),

        // --- The site -------------------------------------------------------
        // Outdoor slabs, laid edge to edge around the building's footprint.
        site("s-road", "Road", rect(-18, -18, 18, -13), "tarmac_surface"),
        site("s-drive", "Driveway", rect(4, -13, 8, -2), "tarmac_surface"),
        site("s-path", "Front Path", rect(-1.1, -13, 0.1, -2), "paving_slab"),
        site("s-front-w", "Front Garden", rect(-18, -13, -1.1, -2), "lawn"),
        site("s-front-m", "Front Garden", rect(0.1, -13, 4, -2), "lawn"),
        site("s-front-e", "Front Garden", rect(8, -13, 18, -2), "lawn"),
        site("s-side-w", "West Side", rect(-18, -2, -5, 13), "lawn"),
        site("s-side-e", "East Side", rect(8, -2, 18, 13), "lawn"),
        site("s-garage-side", "Beside the Garage", rect(4, 3.5, 8, 13), "lawn"),
        site("s-patio", "Patio", rect(-5, 10, 4, 13), "paving_slab"),
        site("s-back", "Back Garden", rect(-18, 13, 18, 22), "lawn"),
    ],
    walls: [
        // --- External envelope, ground storey -----------------------------
        // Each ring winds the same way, which puts side A on the inside.
        wall("ext-s-0", [-5, -2], [4, -2], {
            ...EXTERNAL,
            height: 2.8,
            openings: [
                window_("w-g-living-s", sOff(-3.275), 1.8, 1.4),
                door("d-front", sOff(-0.5), {
                    width: 1.0,
                    height: 2.05,
                    swing: "inward_right",
                    leaf: "trim_walnut",
                }),
                window_("w-g-util-s", sOff(2.275), 1.0, 1.0, 1.2),
            ],
        }),
        wall("ext-e-0", [4, -2], [4, 10], {
            ...EXTERNAL,
            height: 2.8,
            // Shared with the garage as far as z = 3.5, hence the door rather
            // than a window at the south end.
            openings: [
                door("d-garage-house", eOff(-0.6), { width: 0.85, swing: "inward_left" }),
                window_("w-g-bed-e", eOff(5.0), 1.4, 1.4),
                window_("w-g-bed2-e", eOff(8.0), 1.4, 1.4),
            ],
        }),
        wall("ext-n-0", [4, 10], [-5, 10], {
            ...EXTERNAL,
            height: 2.8,
            openings: [
                window_("w-g-bed2-n", nOff(2.275), 1.4, 1.4),
                door("d-back", nOff(-2.6), { width: 0.9, height: 2.05, swing: "inward_left" }),
                window_("w-g-kitchen-n", nOff(-4.2), 1.4, 1.4),
            ],
        }),
        wall("ext-w-0", [-5, 10], [-5, -2], {
            ...EXTERNAL,
            height: 2.8,
            openings: [
                window_("w-g-kitchen-w", wOff(7.2), 1.4, 1.4),
                window_("w-g-living-w", wOff(1.3), 1.8, 1.4),
            ],
        }),

        // --- External envelope, first storey ------------------------------
        wall("ext-s-1", [-5, -2], [4, -2], {
            ...EXTERNAL,
            base: STOREY.first,
            height: 2.8,
            openings: [
                window_("w-f-bed3-s", sOff(-3.275), 1.8, 1.4),
                window_("w-f-landing-s", sOff(-0.5), 1.0, 1.2, 1.0),
                window_("w-f-bath-s", sOff(2.275), 1.0, 1.0, 1.2),
            ],
        }),
        wall("ext-e-1", [4, -2], [4, 10], {
            ...EXTERNAL,
            base: STOREY.first,
            height: 2.8,
            // Nothing south of z = 3.5: the garage roof rises to 3.8 there.
            openings: [
                window_("w-f-bed4-e", eOff(4.8), 1.4, 1.4),
                window_("w-f-dress-e", eOff(8.0), 1.2, 1.4),
            ],
        }),
        wall("ext-n-1", [4, 10], [-5, 10], {
            ...EXTERNAL,
            base: STOREY.first,
            height: 2.8,
            openings: [
                window_("w-f-dress-n", nOff(2.275), 1.2, 1.4),
                window_("w-f-landing-n", nOff(-0.5), 1.0, 1.2, 1.0),
                window_("w-f-bed1-n", nOff(-3.275), 1.8, 1.4),
            ],
        }),
        wall("ext-w-1", [-5, 10], [-5, -2], {
            ...EXTERNAL,
            base: STOREY.first,
            height: 2.8,
            openings: [
                window_("w-f-bed1-w", wOff(7.1), 1.8, 1.4),
                window_("w-f-bed3-w", wOff(1.2), 1.8, 1.4),
            ],
        }),

        // --- External envelope, attic storey up to the eaves --------------
        // Only 1.4 tall, so the attic's windows sit low in the room. The east
        // and west runs enclose the eaves voids either side of the attic.
        wall("ext-s-2", [-5, -2], [4, -2], {
            ...EXTERNAL,
            base: STOREY.attic,
            height: 1.4,
            openings: [
                window_("w-a-bed5-s", sOff(-1.2), 1.4, 0.9, 0.4),
                window_("w-a-landing-s", sOff(1.9), 1.0, 0.9, 0.4),
            ],
        }),
        wall("ext-e-2", [4, -2], [4, 10], { ...EXTERNAL, base: STOREY.attic, height: 1.4 }),
        wall("ext-n-2", [4, 10], [-5, 10], {
            ...EXTERNAL,
            base: STOREY.attic,
            height: 1.4,
            openings: [
                window_("w-a-store-n", nOff(1.59), 0.8, 0.9, 0.4),
                window_("w-a-bed6-n", nOff(-2.075), 1.4, 0.9, 0.4),
            ],
        }),
        wall("ext-w-2", [-5, 10], [-5, -2], { ...EXTERNAL, base: STOREY.attic, height: 1.4 }),

        // --- Ground floor partitions --------------------------------------
        // Both hall partitions run +Z, so side A is their west face.
        wall("g-hall-west", [-1.65, -2], [-1.65, 10], {
            height: 2.8,
            openings: [
                // South of the stairwell — everything from z 0.2 to 4.4 is
                // taken up by the flight against this wall.
                door("d-g-living", hOff(-0.7), { swing: "inward_left" }),
                doorway("dw-g-kitchen", hOff(7.0), 1.1),
            ],
        }),
        wall("g-hall-east", [0.65, -2], [0.65, 10], {
            height: 2.8,
            openings: [
                door("d-g-util", hOff(-0.6), { width: 0.8 }),
                door("d-g-shower", hOff(1.8), { width: 0.76 }),
                door("d-g-bed", hOff(4.6)),
                door("d-g-bed2", hOff(8.1), { swing: "inward_left" }),
            ],
        }),
        wall("g-living-kitchen", [-5, 4.55], [-1.65, 4.55], {
            height: 2.8,
            openings: [doorway("dw-g-living-kitchen", 2.0, 1.2)],
        }),
        // Runs +X, so side A is its +Z face — the shower room in both cases.
        wall("g-util-shower", [0.65, 0.65], [4, 0.65], {
            height: 2.8,
            finish: "subway_tile",
            back: "paint_warm_white",
        }),
        wall("g-shower-bed", [0.65, 2.95], [4, 2.95], {
            height: 2.8,
            finish: "paint_warm_white",
            back: "subway_tile",
        }),
        wall("g-bed-bed2", [0.65, 6.45], [4, 6.45], { height: 2.8 }),

        // --- Garage ---------------------------------------------------------
        wall("gar-south", [4, -2], [8, -2], {
            ...EXTERNAL,
            height: 2.8,
            openings: [
                { id: "dw-garage", type: "doorway", offset: 2.0, width: 2.8, height: 2.2, sill: 0 },
            ],
        }),
        wall("gar-east", [8, -2], [8, 3.5], { ...EXTERNAL, height: 2.8 }),
        wall("gar-north", [8, 3.5], [4, 3.5], {
            ...EXTERNAL,
            height: 2.8,
            openings: [door("d-garage-back", 1.0, { width: 0.85, swing: "outward_right" })],
        }),

        // --- First floor partitions ---------------------------------------
        wall("f-hall-west", [-1.65, -2], [-1.65, 10], {
            base: STOREY.first,
            height: 2.8,
            openings: [
                door("d-f-bed3", hOff(-0.7), { swing: "inward_left" }),
                door("d-f-bed1", hOff(6.0), { swing: "inward_left" }),
            ],
        }),
        wall("f-hall-east", [0.65, -2], [0.65, 10], {
            base: STOREY.first,
            height: 2.8,
            // The upper flight stands against this wall from z 5.4 to 9.6, so
            // the dressing room is reached through bedroom 4 instead.
            openings: [
                door("d-f-bath", hOff(0.6), { width: 0.76 }),
                door("d-f-bed4", hOff(3.6)),
            ],
        }),
        wall("f-bed3-bed1", [-5, 4.25], [-1.65, 4.25], { base: STOREY.first, height: 2.8 }),
        wall("f-bath-bed4", [0.65, 2.35], [4, 2.35], {
            base: STOREY.first,
            height: 2.8,
            finish: "paint_warm_white",
            back: "wall_tile_grey",
        }),
        wall("f-bed4-dress", [0.65, 6.15], [4, 6.15], {
            base: STOREY.first,
            height: 2.8,
            openings: [door("d-f-dress", 1.55, { width: 0.8 })],
        }),
        // Balustrades round the open sides of the lower stairwell. The head
        // of the flight, at z 4.4, is deliberately left open to walk off.
        wall("f-well-east", [-0.4, 0.2], [-0.4, 4.4], { base: STOREY.first, height: 1.0 }),
        wall("f-well-south", [-1.65, 0.15], [-0.4, 0.15], { base: STOREY.first, height: 1.0 }),

        // --- Attic partitions -----------------------------------------------
        wall("a-west", [-3.55, -2], [-3.55, 10], { base: STOREY.attic, height: 2.1 }),
        wall("a-east", [2.55, -2], [2.55, 10], { base: STOREY.attic, height: 2.1 }),
        wall("a-arm-west", [1.25, -2], [1.25, 3.45], {
            base: STOREY.attic,
            height: 2.1,
            openings: [
                door("d-a-bed5", hOff(0.3), { width: 0.76 }),
                door("d-a-shower", hOff(2.5), { width: 0.7 }),
            ],
        }),
        wall("a-bed5-shower", [-3.55, 1.45], [1.25, 1.45], {
            base: STOREY.attic,
            height: 2.1,
            finish: "subway_tile",
            back: "paint_warm_white",
        }),
        wall("a-shower-landing", [-3.55, 3.45], [1.25, 3.45], {
            base: STOREY.attic,
            height: 2.1,
            finish: "paint_warm_white",
            back: "subway_tile",
        }),
        wall("a-bed6-south", [-3.55, 5.4], [-0.6, 5.4], {
            base: STOREY.attic,
            height: 2.1,
            openings: [door("d-a-bed6", 1.55, { width: 0.8 })],
        }),
        wall("a-store-south", [0.63, 5.4], [2.55, 5.4], {
            base: STOREY.attic,
            height: 2.1,
            openings: [door("d-a-store", 0.97, { width: 0.76 })],
        }),
        // These two double as the sides of the upper stairwell.
        wall("a-bed6-east", [-0.6, 5.4], [-0.6, 9.85], { base: STOREY.attic, height: 2.1 }),
        wall("a-store-west", [0.63, 5.4], [0.63, 9.85], { base: STOREY.attic, height: 2.1 }),
    ],
    stairs: [
        stair("stair-ground-first", [-1.025, 0.2], "north", STOREY.ground, STOREY.first),
        stair("stair-first-attic", [0.025, 9.6], "south", STOREY.first, STOREY.attic),
    ],
    roofs: [
        roof("roof-house", rect(-5, -2, 4, 10), 7.0, 9.7),
        roof("roof-garage", rect(4, -2, 8, 3.5), 2.8, 3.8, { overhang: 0.3 }),
    ],
    furniture: [],
    finishes: {},
};

// =====================================================================
// 2. Wrenfield House — imported GLB, built in Blender, fully furnished.
//
// The model was exported WITHOUT its door leaves: every doorway is a cased
// hole in the mesh, and the `doors` list below (from wrenfield-meta.json)
// hangs a working, openable Door in each one. The `stairs` entries likewise
// add only the invisible ramps that make the baked treads walkable.
// =====================================================================

const wrenfield = {
    name: "Wrenfield House",
    summary:
        "A detached three-storey family house of about 380 m², modelled and furnished in Blender: open-plan kitchen-diner, living room, study and snug on the ground floor, four bedrooms with two en-suites and the family bathroom on the first, and a loft room with its own shower room above. Every internal door works, and both stair flights are walkable.",
    environment: { preset: "exterior_day", ground: "grass", ground_size: 300 },
    model: {
        url: "/models/wrenfield_house.glb",
        scale: 1.0,
        offset: [0, 0, 0],
        rotation: 0,
        // Exported under the 500k budget precisely so the stairs and upper
        // floors keep exact mesh collision.
        collision: "mesh",
        // The model draws the flights; they are walked on via the ramps in
        // `stairs`, so their treads stay out of the octree.
        collision_exclude: ["stairtreads_"],
    },
    spawns: [
        { position: [8.4, 0, 8.0], yaw: 180, label: "Front path" },
        { position: [8.4, 0, -2.2], yaw: 180, label: "Entrance hall" },
        { position: [4.9, 0, -3.2], yaw: 270, label: "Living room" },
        { position: [7.0, 0, -8.3], yaw: 90, label: "Kitchen & dining" },
        { position: [3.0, 0, -8.5], yaw: 180, label: "Study" },
        { position: [13.5, 0, -3.4], yaw: 180, label: "Snug" },
        { position: [19.2, 0, -3.2], yaw: 180, label: "Garage" },
        { position: [7.85, 3.1, -9.8], yaw: 0, label: "First-floor landing" },
        { position: [3.1, 3.1, -9.6], yaw: 0, label: "Principal bedroom" },
        { position: [12.6, 3.1, -6.0], yaw: 0, label: "Family bathroom" },
        { position: [7.85, 6.05, -8.6], yaw: 0, label: "Loft" },
        { position: [8.0, 0, -13.0], yaw: 0, label: "Back garden" },
    ],
    rooms: wrenfieldMeta.rooms,
    walls: [],
    stairs: wrenfieldMeta.stairs,
    doors: wrenfieldMeta.doors,
    furniture: [],
    finishes: {},
};

// =====================================================================
// 3. Studio loft — imported GLB, untextured white model.
// =====================================================================

const studio = {
    name: "Studio Loft",
    summary:
        "A 40 m² double-height studio loft. Living area and record corner to the west, kitchen and pantry to the east, a straight stair up to a mezzanine holding the bed, wardrobe and bathroom.",
    environment: { preset: "interior_white_model", ground: "none", ground_size: 0 },
    model: {
        url: "/models/studio_apartment.glb",
        scale: 0.39,
        offset: [0, 0, 0],
        rotation: 0,
        // The export carries a single untextured white material. Toning the
        // albedo off pure white is what stops every surface clipping flat.
        material: { color: "#cfcac2", roughness: 0.85, metalness: 0 },
        // Pinned rather than left to "auto": the stairs and mezzanine deck
        // only work with exact mesh collision.
        collision: "mesh",
    },
    // The ported capsule physics has no step-up assist, so the stair blocks
    // a walking visitor — the mezzanine entries are the way upstairs.
    spawns: [
        { position: [-0.24, 0, 2.0], yaw: 250, label: "Living area" },
        { position: [-0.24, 0, -0.2], yaw: 90, label: "Kitchen" },
        { position: [-3.2, 0, 2.5], yaw: 135, label: "By the TV" },
        { position: [1.4, 2.62, 1.6], yaw: 180, label: "Mezzanine" },
        { position: [2.2, 2.62, 2.0], yaw: 100, label: "Upstairs bathroom" },
    ],
    rooms: [
        room("living", "Living Area", [[-4.19, -1.68], [-0.6, -1.68], [-0.6, 3.76], [-4.19, 3.76]], "oak_parquet", "none", 2.6),
        room("kitchen", "Kitchen", [[0.6, -1.68], [3.24, -1.68], [3.24, 1.6], [0.6, 1.6]], "oak_parquet", "none", 2.6),
        room("study", "Study Nook", [[1.8, 1.6], [3.24, 1.6], [3.24, 3.76], [1.8, 3.76]], "oak_parquet", "none", 2.6),
        room("stair", "Stair & Entry", [[-0.6, -1.68], [0.6, -1.68], [0.6, 3.76], [-0.6, 3.76]], "oak_parquet", "none", 4.96),
    ],
    walls: [],
    furniture: [],
    finishes: {},
};

// =====================================================================
// 3. Scanned apartment — imported GLB with baked textures.
// =====================================================================

const scanned = {
    name: "Scanned Apartment",
    summary:
        "A capture of a real 101 m² two-bedroom apartment, imported unmodified. Textures are baked from the original photography, and the model was clipped at 2 m so the ceiling is open.",
    environment: { preset: "studio", ground: "none", ground_size: 0 },
    model: {
        url: "/models/apartment_2.glb",
        scale: 1.0,
        offset: [42.5, 0, -41.4],
        rotation: 0,
    },
    spawns: [
        { position: [0.9, 0, -3.2], yaw: 80, label: "Living & dining" },
        { position: [-1.4, 0, -2.2], yaw: 280, label: "Kitchen" },
        { position: [0.1, 0, 1.0], yaw: 0, label: "Hall" },
        { position: [-1.4, 0, 4.6], yaw: 231, label: "Bedroom 1" },
        { position: [1.0, 0, 5.4], yaw: 148, label: "Bedroom 2" },
    ],
    rooms: [
        room("living", "Living Room", [[0.3, -6.6], [3.59, -6.6], [3.59, -0.6], [0.3, -0.6]], "pale_ash_boards", "none", 2.0),
        room("dining", "Dining Area", [[-3.56, -6.6], [0.3, -6.6], [0.3, -3.4], [-3.56, -3.4]], "pale_ash_boards", "none", 2.0),
        room("kitchen", "Kitchen", [[-3.56, -3.4], [0.3, -3.4], [0.3, -0.6], [-3.56, -0.6]], "ceramic_tile_white", "none", 2.0),
        // Runs the full depth: it is also the corridor between the bedrooms.
        room("hall", "Hall", [[-0.6, -0.6], [0.9, -0.6], [0.9, 7.03], [-0.6, 7.03]], "pale_ash_boards", "none", 2.0),
        room("bathroom", "Bathroom", [[0.9, -0.6], [3.59, -0.6], [3.59, 2.3], [0.9, 2.3]], "ceramic_tile_white", "none", 2.0),
        room("bed1", "Bedroom 1", [[-3.56, -0.6], [-0.6, -0.6], [-0.6, 7.03], [-3.56, 7.03]], "pale_ash_boards", "none", 2.0),
        room("bed2", "Bedroom 2", [[0.9, 2.3], [3.59, 2.3], [3.59, 7.03], [0.9, 7.03]], "pale_ash_boards", "none", 2.0),
    ],
    walls: [],
    furniture: [],
    finishes: {},
};

// =====================================================================

/**
 * A scene that points at a GLB needs that file present. Models are build
 * outputs or third-party imports rather than repository content, so a fresh
 * clone will not have them — skip those scenes with a note rather than
 * seeding a property that loads as an empty void.
 */
function modelPresent(raw) {
    if (!raw.model?.url) return true;
    return existsSync(new URL(`../public${raw.model.url}`, import.meta.url));
}

for (const [id, raw] of [
    ["ashgrove-house", house],
    ["wrenfield-house", wrenfield],
    ["studio-loft", studio],
    ["scanned-apartment", scanned],
]) {
    if (!modelPresent(raw)) {
        const how = id === "wrenfield-house"
            ? "run `npm run models` to build it"
            : `supply public${raw.model.url}`;
        console.log(`Skipped ${id}: ${raw.model.url} is missing — ${how}.`);
        continue;
    }
    const { scene, notes } = validateScene(raw);
    await writeScene({ id, scene, brief: "Bundled example", notes });

    const doors =
        scene.walls.reduce(
            (n, w) => n + w.openings.filter((o) => o.type === "door").length,
            0
        ) + (scene.doors?.length ?? 0);

    const parts = [
        `${scene.rooms.length} rooms`,
        `${scene.walls.length} walls`,
        `${doors} doors`,
    ];
    if (scene.stairs.length) parts.push(`${scene.stairs.length} flights`);
    if (scene.roofs.length) parts.push(`${scene.roofs.length} roofs`);

    console.log(
        `Wrote ${id}: ${parts.join(", ")}` +
            (notes.length ? `\n  notes: ${notes.join("\n  ")}` : "")
    );
}

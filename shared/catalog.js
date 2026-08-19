/**
 * The shared vocabulary between the AI generator, the builders and the UI.
 *
 * The app builds *shells*: rooms, walls, openings and doors. Everything a
 * visitor stands on or looks at is a named surface with a swappable finish,
 * and everything else in the room is an imported furniture model.
 *
 * Finishes are generated procedurally at runtime (see TextureLibrary) rather
 * than shipped as image files, so adding one is a data change here.
 */

// ---------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------

/**
 * Which part of the shell a finish can be applied to.
 *
 * `ground` is the outdoor counterpart of `floor`: yards, drives and roads are
 * built as floor slabs like any other room, and it is the finish's kind that
 * decides whether a slab is indoor or outdoor — so the picker offers lawn and
 * tarmac on a garden and parquet and tile inside, never the other way round.
 */
export const SURFACE_KINDS = ["floor", "wall", "ceiling", "roof", "ground"];

/**
 * Every selectable finish.
 *
 * `generator` + `params` drive the canvas texture; `tile` is how many metres
 * one repeat of the texture covers, so a finish looks the same size whether
 * it is on a 2 m cloakroom floor or a 9 m living room.
 */
export const FINISHES = {
    // --- Floors: wood ---------------------------------------------------
    oak_parquet: {
        label: "Oak parquet",
        kind: "floor",
        generator: "planks",
        tile: 2.4,
        params: { base: "#b98d5d", grain: "#8d6537", rows: 14, stagger: 0.37, gap: "#7d5a31" },
    },
    walnut_boards: {
        label: "Walnut boards",
        kind: "floor",
        generator: "planks",
        tile: 2.4,
        params: { base: "#6d4a2f", grain: "#4d3220", rows: 13, stagger: 0.5, gap: "#3d2718" },
    },
    pale_ash_boards: {
        label: "Pale ash boards",
        kind: "floor",
        generator: "planks",
        tile: 2.4,
        params: { base: "#d8c3a1", grain: "#bda57f", rows: 13, stagger: 0.5, gap: "#a98f6b" },
    },
    herringbone_oak: {
        label: "Herringbone oak",
        kind: "floor",
        generator: "herringbone",
        tile: 1.6,
        params: { base: "#b3854f", grain: "#8b6134", gap: "#6f4d28" },
    },

    // --- Floors: hard ---------------------------------------------------
    ceramic_tile_white: {
        label: "White ceramic tile",
        kind: "floor",
        generator: "tiles",
        tile: 1.2,
        params: { base: "#eceae5", grout: "#c2bdb4", cols: 3, rows: 3, variation: 0.04 },
    },
    slate_tile: {
        label: "Slate tile",
        kind: "floor",
        generator: "tiles",
        tile: 1.2,
        params: { base: "#4a4e52", grout: "#33363a", cols: 3, rows: 3, variation: 0.12 },
    },
    terracotta_tile: {
        label: "Terracotta tile",
        kind: "floor",
        generator: "tiles",
        tile: 1.2,
        params: { base: "#b46a4a", grout: "#8d5238", cols: 3, rows: 3, variation: 0.1 },
    },
    marble_tile: {
        label: "Marble tile",
        kind: "floor",
        generator: "marble",
        tile: 2.0,
        params: { base: "#eeece7", vein: "#b9b4aa", grout: "#d5d1c9", cols: 2, rows: 2 },
    },
    polished_concrete: {
        label: "Polished concrete",
        kind: "floor",
        generator: "concrete",
        tile: 3.0,
        params: { base: "#9d9a95", mottle: "#8b8883", roughness: 0.35 },
    },

    // --- Floors: soft ---------------------------------------------------
    carpet_grey: {
        label: "Grey carpet",
        kind: "floor",
        generator: "carpet",
        tile: 1.0,
        params: { base: "#807d78", fleck: "#6e6b66" },
    },
    carpet_beige: {
        label: "Beige carpet",
        kind: "floor",
        generator: "carpet",
        tile: 1.0,
        params: { base: "#c4b49b", fleck: "#ad9d85" },
    },
    carpet_navy: {
        label: "Navy carpet",
        kind: "floor",
        generator: "carpet",
        tile: 1.0,
        params: { base: "#3b4a63", fleck: "#313e53" },
    },

    // --- Walls: paint ---------------------------------------------------
    paint_white: {
        label: "White paint",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#f3f2ef" },
    },
    paint_warm_white: {
        label: "Warm white",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#f4eee2" },
    },
    paint_grey: {
        label: "Soft grey",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#bcbbb7" },
    },
    paint_sage: {
        label: "Sage green",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#a7b6a0" },
    },
    paint_clay: {
        label: "Clay",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#c08a70" },
    },
    paint_navy: {
        label: "Deep navy",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#33455c" },
    },
    paint_charcoal: {
        label: "Charcoal",
        kind: "wall",
        generator: "paint",
        tile: 4.0,
        params: { base: "#41443f" },
    },

    // --- Walls: material ------------------------------------------------
    plaster: {
        label: "Bare plaster",
        kind: "wall",
        generator: "plaster",
        tile: 3.0,
        params: { base: "#e5ded1", mottle: "#d2c9b8" },
    },
    exposed_brick: {
        label: "Exposed brick",
        kind: "wall",
        generator: "brick",
        tile: 2.0,
        params: { base: "#9c5a44", mortar: "#cfc7ba", rows: 8, variation: 0.12 },
    },
    subway_tile: {
        label: "Subway tile",
        kind: "wall",
        generator: "brick",
        tile: 1.0,
        params: { base: "#eef0f0", mortar: "#c6c8c8", rows: 6, variation: 0.03 },
    },
    wall_tile_grey: {
        label: "Grey wall tile",
        kind: "wall",
        generator: "tiles",
        tile: 1.0,
        params: { base: "#9aa0a3", grout: "#7d8386", cols: 3, rows: 3, variation: 0.05 },
    },
    timber_panel: {
        label: "Timber panelling",
        kind: "wall",
        generator: "planks",
        tile: 2.0,
        params: { base: "#a87c52", grain: "#845d38", rows: 12, stagger: 0, gap: "#6d4c2c" },
    },

    // --- Ceilings -------------------------------------------------------
    ceiling_white: {
        label: "White ceiling",
        kind: "ceiling",
        generator: "paint",
        tile: 4.0,
        params: { base: "#f6f5f2" },
    },
    ceiling_plaster: {
        label: "Plaster ceiling",
        kind: "ceiling",
        generator: "plaster",
        tile: 3.0,
        params: { base: "#eae5da", mottle: "#dbd4c6" },
    },
    ceiling_timber: {
        label: "Timber ceiling",
        kind: "ceiling",
        generator: "planks",
        tile: 2.2,
        params: { base: "#b08d62", grain: "#8c6b45", rows: 11, stagger: 0, gap: "#71553a" },
    },

    // --- Roofs (exterior) -----------------------------------------------
    roof_terracotta: {
        label: "Terracotta roof tile",
        kind: "roof",
        generator: "rooftiles",
        tile: 1.6,
        params: { base: "#a85b3c", shade: "#8a482e", rows: 5 },
    },
    roof_slate: {
        label: "Slate roof",
        kind: "roof",
        generator: "rooftiles",
        tile: 1.6,
        params: { base: "#4b4f55", shade: "#3a3d42", rows: 6 },
    },
    roof_metal: {
        label: "Standing seam metal",
        kind: "roof",
        generator: "planks",
        tile: 2.0,
        params: { base: "#7d8489", grain: "#6a7075", rows: 10, stagger: 0, gap: "#5b6165" },
    },

    // --- Ground (outdoor) -----------------------------------------------
    lawn: {
        label: "Lawn",
        kind: "ground",
        generator: "grass",
        tile: 2.2,
        params: { base: "#4f7a37", blade: "#6d9c4a", dark: "#3a5c28" },
    },
    rough_grass: {
        label: "Rough grass",
        kind: "ground",
        generator: "grass",
        tile: 3.4,
        params: { base: "#61784a", blade: "#7f9560", dark: "#48583a" },
    },
    paving_slab: {
        label: "Paving slabs",
        kind: "ground",
        generator: "tiles",
        tile: 1.8,
        params: { base: "#a8a49c", grout: "#8a867e", cols: 2, rows: 2, variation: 0.08 },
    },
    gravel_drive: {
        label: "Gravel",
        kind: "ground",
        generator: "gravel",
        tile: 1.4,
        params: { base: "#8e8981", light: "#b3ada2", dark: "#67625b" },
    },
    tarmac_surface: {
        label: "Tarmac",
        kind: "ground",
        generator: "gravel",
        tile: 2.6,
        params: { base: "#45464a", light: "#5b5c61", dark: "#313236" },
    },
    timber_decking: {
        label: "Timber decking",
        kind: "ground",
        generator: "planks",
        tile: 2.2,
        params: { base: "#9a7d5c", grain: "#7b6144", rows: 11, stagger: 0, gap: "#5e4a33" },
    },
};

export const FINISH_NAMES = Object.keys(FINISHES);

/** Finishes valid for a given surface kind — drives the picker UI. */
export function finishesFor(kind) {
    return Object.entries(FINISHES)
        .filter(([, f]) => f.kind === kind)
        .map(([id, f]) => ({ id, label: f.label }));
}

/** Sensible starting finish when a spec omits one. */
export const DEFAULT_FINISH = {
    floor: "oak_parquet",
    wall: "paint_warm_white",
    ceiling: "ceiling_white",
    roof: "roof_slate",
    ground: "lawn",
};

// ---------------------------------------------------------------------
// Trim materials — flat colours for skirtings, frames and door furniture
// ---------------------------------------------------------------------

export const TRIM_MATERIALS = {
    trim_white: { color: "#f2f0ec", roughness: 0.6, metalness: 0 },
    trim_oak: { color: "#b08154", roughness: 0.7, metalness: 0 },
    trim_walnut: { color: "#5d4030", roughness: 0.6, metalness: 0 },
    trim_charcoal: { color: "#3a3d40", roughness: 0.6, metalness: 0 },
    metal_brass: { color: "#b08d4d", roughness: 0.3, metalness: 0.95 },
    metal_chrome: { color: "#cfd3d6", roughness: 0.12, metalness: 1 },
    metal_black: { color: "#2a2b2e", roughness: 0.4, metalness: 0.85 },
    glass: { color: "#dfe5f5", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28 },
    frosted_glass: { color: "#e8ecf2", roughness: 0.5, metalness: 0, transparent: true, opacity: 0.55 },
};

export const TRIM_NAMES = Object.keys(TRIM_MATERIALS);

// ---------------------------------------------------------------------
// Openings and doors
// ---------------------------------------------------------------------

/** Hole kinds that can be cut into a wall. */
export const OPENING_TYPES = ["door", "doorway", "window", "arch", "pass_through"];

/**
 * How a door leaf behaves. Only `door` openings carry one; the rest are
 * simply holes.
 */
export const DOOR_TYPES = {
    hinged: { label: "Hinged", leaves: 1, motion: "swing" },
    double: { label: "Double", leaves: 2, motion: "swing" },
    sliding: { label: "Sliding", leaves: 1, motion: "slide" },
    pocket: { label: "Pocket", leaves: 1, motion: "slide" },
};

export const DOOR_TYPE_NAMES = Object.keys(DOOR_TYPES);

/** Which way a hinged leaf swings when opened. */
export const DOOR_SWINGS = ["inward_left", "inward_right", "outward_left", "outward_right"];

// ---------------------------------------------------------------------
// Roofs and stairs
// ---------------------------------------------------------------------

/**
 * Roof shapes. A roof is built over the bounding box of its footprint, so
 * these cover the cases a rectangular-plan house actually needs.
 */
export const ROOF_TYPES = {
    gable: { label: "Gable", slopes: 2, hasGableEnds: true },
    flat: { label: "Flat", slopes: 0, hasGableEnds: false },
};

export const ROOF_TYPE_NAMES = Object.keys(ROOF_TYPES);

/** Which way a flight climbs, as a compass direction on the plan. */
export const STAIR_DIRECTIONS = ["north", "south", "east", "west"];

// ---------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------

/**
 * Lighting rigs.
 *
 * Ambient is kept deliberately low in all of these. three.js's AmbientLight
 * adds the same value to every surface regardless of which way it faces, so
 * it cannot shade anything — past about 0.3 it stops reading as bounce light
 * and starts flattening the whole image. The earlier presets ran ambient and
 * hemisphere at 1.3 apiece, which put 2.6 units of unshadowed fill on every
 * interior and washed them out. The work is done by the sun (shape and
 * shadow) and the hemisphere (sky-vs-ground tint) instead.
 */
export const ENVIRONMENT_PRESETS = {
    interior_day: {
        background: "#cfd8e3",
        ambient: { color: "#ffffff", intensity: 0.18 },
        hemi: { sky: "#dce7f5", ground: "#b0a696", intensity: 0.55 },
        sun: { color: "#fff3e0", intensity: 2.4, position: [7, 11, 5] },
        fog: null,
        exposure: 0.95,
    },
    interior_evening: {
        background: "#1b1d24",
        ambient: { color: "#ffd9b0", intensity: 0.12 },
        hemi: { sky: "#3a3550", ground: "#20191a", intensity: 0.3 },
        sun: { color: "#ffcf9a", intensity: 0.6, position: [-5, 8, -4] },
        fog: null,
        exposure: 1.15,
    },
    interior_overcast: {
        background: "#d5d8dc",
        ambient: { color: "#eef1f5", intensity: 0.22 },
        hemi: { sky: "#e3e8ee", ground: "#a8a49c", intensity: 0.7 },
        sun: { color: "#eef2f7", intensity: 1.2, position: [4, 12, 6] },
        fog: null,
        exposure: 0.95,
    },
    exterior_day: {
        background: "#a9cbe8",
        ambient: { color: "#ffffff", intensity: 0.1 },
        hemi: { sky: "#bcdcff", ground: "#6b7a52", intensity: 0.4 },
        sun: { color: "#fff6e2", intensity: 3.4, position: [14, 20, 9] },
        fog: { color: "#c2d8ea", near: 45, far: 190 },
        exposure: 0.85,
    },
    /** For untextured / single-material imported models. */
    interior_white_model: {
        background: "#dfe4ea",
        ambient: { color: "#ffffff", intensity: 0.14 },
        hemi: { sky: "#e8eef7", ground: "#b5ada2", intensity: 0.45 },
        sun: { color: "#fff4e4", intensity: 1.6, position: [6, 10, 5] },
        fog: null,
        exposure: 0.95,
    },
    studio: {
        background: "#e9e9e6",
        ambient: { color: "#ffffff", intensity: 2.4 },
        hemi: { sky: "#ffffff", ground: "#cfcfcb", intensity: 1.1 },
        sun: { color: "#ffffff", intensity: 1.4, position: [6, 12, 8] },
        fog: null,
        exposure: 1.0,
    },
};

export const ENVIRONMENT_PRESET_NAMES = Object.keys(ENVIRONMENT_PRESETS);

/** Ground surrounding a building, for exterior views. */
export const GROUND_TYPES = {
    none: { label: "None" },
    grass: { color: "#5f8a45", roughness: 1 },
    gravel: { color: "#8b8781", roughness: 1 },
    paving: { color: "#a5a29c", roughness: 0.85 },
    sand: { color: "#d9c9a3", roughness: 1 },
    tarmac: { color: "#4a4a4c", roughness: 0.9 },
};

export const GROUND_NAMES = Object.keys(GROUND_TYPES);

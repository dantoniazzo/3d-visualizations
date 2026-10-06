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
 *
 * A finish can be an image instead (`image`, under public/): the grass's is
 * Fluffy Tree's ground, one gradient laid over the whole garden once
 * (`gradient`: TextureLibrary.setGradient places it, from the garden's
 * settings) rather than tiled. `grass` marks a ground that grass grows on.
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
    // A flat roof's membrane under pale gravel ballast.
    roof_membrane: {
        label: "Flat roof (gravel)",
        kind: "roof",
        generator: "gravel",
        tile: 1.4,
        params: { base: "#a9a59d", light: "#c7c2b8", dark: "#86827a" },
    },

    // --- Ground (outdoor) -----------------------------------------------
    // The garden's ground, under its grass (World/Vegetation): Fluffy Tree's,
    // sand where the gradient is centred to green at its edge — the lawns,
    // the field past the plot and the hills behind it, as one. Mapped in
    // metres; as rough as Fluffy Tree's ground.
    lawn: {
        label: "Lawn",
        kind: "ground",
        grass: true,
        image: "/textures/vegetation/ground-gradient.jpg",
        gradient: true,
        tile: 1,
        roughness: 0.9,
    },
    // The field past the plot.
    rough_grass: {
        label: "Field",
        kind: "ground",
        grass: true,
        image: "/textures/vegetation/ground-gradient.jpg",
        gradient: true,
        tile: 1,
        roughness: 0.9,
    },
    // The small hills behind the plot (shared/vegetation.js): the field's
    // ground, a finish apart so the bake can give them coarser texels.
    hill_grass: {
        label: "Hill grass",
        kind: "ground",
        grass: true,
        image: "/textures/vegetation/ground-gradient.jpg",
        gradient: true,
        tile: 1,
        roughness: 0.9,
    },
    // The back garden's fence (shared/vegetation.js): stained boards, stood
    // on end (FenceBuilder turns the planks upright).
    fence_timber: {
        label: "Fence boards",
        kind: "fence",
        generator: "planks",
        tile: 1.2,
        params: { base: "#7a5f45", grain: "#6a5139", gap: "#3f3022", rows: 8, stagger: 0 },
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
    // The neighbourhood's roads (shared/neighbourhood.js): finishes apart
    // from the plot's own, so the bake can give their miles of surface
    // coarser texels.
    street_tarmac: {
        label: "Street tarmac",
        kind: "ground",
        generator: "gravel",
        tile: 2.6,
        params: { base: "#3e3f43", light: "#55565b", dark: "#2c2d30" },
    },
    street_gravel: {
        label: "Roadside gravel",
        kind: "ground",
        generator: "gravel",
        tile: 1.2,
        params: { base: "#8a847a", light: "#aca596", dark: "#625d55" },
    },
    timber_decking: {
        label: "Timber decking",
        kind: "ground",
        generator: "planks",
        tile: 2.2,
        params: { base: "#9a7d5c", grain: "#7b6144", rows: 11, stagger: 0, gap: "#5e4a33" },
    },

    // --- Photographed (Poly Haven, CC0 — assets/THIRD_PARTY.md) ----------
    // Each its colour (`image`), its normal map and its ambient occlusion,
    // roughness and metalness packed in one (`arm`), as Poly Haven ships
    // them, fetched by `npm run site-assets`; `color` tints the colour.
    render_sand: {
        label: "Sand render",
        kind: "wall",
        ...pbr("beige_wall_001"),
        tile: 2.4,
        tint: [1.3, 1.36, 1.38],
    },
    stone_cladding: {
        label: "Stone cladding",
        kind: "wall",
        // Thin-coursed ledgestone: pale grey-cream limestone, deep joints.
        ...pbr("rustic_stone_wall_02"),
        tile: 2.6,
        tint: [2.3, 2.5, 3.3],
    },
    dry_stone: {
        label: "Dry stone",
        kind: "wall",
        ...pbr("castle_wall_slates"),
        tile: 1.6,
        tint: [1.65, 1.7, 1.85],
    },
    stone_paving: {
        label: "Limestone paving",
        kind: "ground",
        // Large pale slabs, their joints all but invisible.
        ...pbr("concrete_floor_01"),
        tile: 3.0,
        tint: [1.25, 1.22, 1.15],
    },
    stone_paving_floor: {
        label: "Stone tiles",
        kind: "floor",
        ...pbr("rectangular_paving"),
        tile: 2.4,
        color: "#f7f1e8",
    },
    asphalt: {
        label: "Asphalt",
        kind: "ground",
        ...pbr("asphalt_02"),
        tile: 4,
        color: "#c9c9c9",
    },
    concrete_pavers: {
        label: "Concrete pavement",
        kind: "ground",
        ...pbr("concrete_pavement"),
        tile: 2.4,
    },
    roof_pavers: {
        label: "Roof pavers",
        kind: "ground",
        ...pbr("concrete_pavement"),
        tile: 2.4,
        color: "#f4f1ec",
    },
    hardwood_deck: {
        label: "Hardwood deck",
        kind: "ground",
        ...pbr("wooden_planks"),
        tile: 1.6,
        tint: [1.3, 1.1, 0.88],
    },
    concrete_steps: {
        label: "Concrete",
        kind: "floor",
        ...pbr("concrete_floor_01"),
        tile: 2,
        color: "#ece7df",
    },
    pool_mosaic: {
        label: "Pool mosaic",
        kind: "pool",
        ...pbr("rounded_square_tiled_wall"),
        tile: 1.2,
        color: "#c3dcda",
    },
    corten: {
        label: "Corten steel",
        kind: "landscape",
        ...pbr("rust_coarse_01"),
        tile: 1.4,
        color: "#d98b5e",
    },
    // Ladonia Residence (scripts/spaces/ladonia): its living rooms' and
    // halls' terrazzo, its bathrooms' large stone-look tiles, the gravel on
    // its roofs, building C's corten bands, its khaki and ochre renders.
    terrazzo: {
        label: "Terrazzo",
        kind: "floor",
        generator: "terrazzo",
        tile: 1.6,
        roughness: 0.35,
        params: { base: "#efe5d4", chips: ["#e0d3be", "#f8f3ea", "#d6c8b2", "#cfc5b8", "#e8dcc8", "#c9b89e"], density: 0.4, coarse: 0.15 },
    },
    // Its walls: warm white limewash, a deeper sand one for accent walls,
    // light oak cladding on end; its ceilings warm white.
    limewash_warm: {
        label: "Warm limewash",
        kind: "wall",
        generator: "plaster",
        tile: 3.0,
        params: { base: "#eee3d1", mottle: "#e6d8c2", soft: true },
    },
    limewash_sand: {
        label: "Sand limewash",
        kind: "wall",
        generator: "plaster",
        tile: 3.0,
        params: { base: "#dcc6a6", mottle: "#d3bb97", soft: true },
    },
    oak_cladding: {
        label: "Oak cladding",
        kind: "wall",
        generator: "planks",
        tile: 2.4,
        roughness: 0.55,
        params: { base: "#b98450", grain: "#956335", rows: 150, stagger: 0.5, gap: "#a7743f", vertical: true },
    },
    oak_honey: {
        label: "Honey oak boards",
        kind: "floor",
        generator: "planks",
        tile: 3.6,
        roughness: 0.5,
        params: { base: "#b98452", grain: "#9a6a3d", rows: 22, stagger: 0.37, gap: "#87592f", cover: true },
    },
    // A loggia's or a porch's underside: the façade's render carried under.
    ceiling_soffit: {
        label: "Render soffit",
        kind: "ceiling",
        generator: "paint",
        tile: 4.0,
        params: { base: "#cdbfa9" },
    },
    ceiling_warm: {
        label: "Warm white ceiling",
        kind: "ceiling",
        generator: "paint",
        tile: 4.0,
        params: { base: "#f6f0e6" },
    },
    bath_tile: {
        label: "Stone-look tiles",
        kind: "floor",
        generator: "tiles",
        tile: 1.2,
        roughness: 0.3,
        params: { base: "#d9cfc0", grout: "#bcb2a4", cols: 2, rows: 1, variation: 0.05 },
    },
    roof_gravel: {
        label: "Roof gravel",
        kind: "ground",
        generator: "gravel",
        tile: 1.2,
        params: { base: "#dcd9d2", light: "#f1efea", dark: "#b8b4ab" },
    },
    corten_cladding: {
        label: "Corten cladding",
        kind: "wall",
        // Weathered-steel panels as the renders show them: a dusky cocoa
        // rust, mottled and streaked, darker than the render it bands.
        ...pbr("rust_coarse_01"),
        tile: 2.6,
        tint: [2.7, 4.3, 7.6],
        roughness: 0.95,
    },
    render_ochre: {
        label: "Ochre render",
        kind: "wall",
        ...pbr("beige_wall_001"),
        tile: 2.4,
        tint: [2.0, 1.84, 1.56],
    },
    // The ground the site's terrain is painted with (World/Builders/
    // LandscapeBuilder.js), blended by where it is.
    terrain_lawn: { label: "Lawn", kind: "terrain", ...pbr("acg_grass001"), tile: 2.5 },
    terrain_meadow: { label: "Meadow", kind: "terrain", ...pbr("acg_grass004"), tile: 4 },
    terrain_hillside: { label: "Hillside", kind: "terrain", ...pbr("aerial_grass_rock"), tile: 9 },
    terrain_forest: { label: "Forest floor", kind: "terrain", ...pbr("forest_leaves_02"), tile: 4 },
    terrain_gravel: { label: "Gravel", kind: "terrain", ...pbr("gravel_floor_02"), tile: 2 },
};

/** A photographed finish's three maps, under public/textures/pbr/<id>/. */
function pbr(id) {
    const base = `/textures/pbr/${id}`;
    return { image: `${base}/diff.webp`, normal: `${base}/nor.webp`, arm: `${base}/arm.webp` };
}

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
    // Ladonia's frameless balustrades: clear glass with a grey-green tint.
    glass_balustrade: { color: "#b4c2c0", roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, transmission: 0 },
    // Modern double glazing with a solar coating: grey-green, mirror-like
    // against the sky, the room seen dimly behind it.
    // No transmission: three redraws every opaque thing for it each frame,
    // and Sky.js sets the glass's look inside and out (setGlassView).
    glass_solar: { color: "#6a7f8a", roughness: 0.02, metalness: 0, transparent: true, opacity: 0.62, transmission: 0 },
    // The front garden's picket fence.
    fence_paint: { color: "#eeece6", roughness: 0.8, metalness: 0 },
    // The neighbours' windows (World/Builders/NeighbourhoodBuilder.js): dark
    // glass, seen from the street, nothing behind it.
    window_dark: { color: "#27313b", roughness: 0.18, metalness: 0.3 },
    // The roads' centre lines.
    road_paint: { color: "#e9e6dc", roughness: 0.7, metalness: 0 },
    // A ceiling light's glass (World/Fittings.js): lit from within, live.
    opal_glass: { color: "#f6f2ea", roughness: 0.35, metalness: 0, glow: "#ffe3bf" },
    // Modern joinery: powder-coated aluminium window and door frames,
    // external blinds and pergola frames, in anthracite.
    frame_anthracite: { color: "#34373a", roughness: 0.42, metalness: 0.55 },
    // Ladonia's pergolas: bronze-taupe powder-coated aluminium.
    alu_bronze: { color: "#6a5b48", roughness: 0.4, metalness: 0.55 },
    // A cast stair's edges and soffit: light grey concrete.
    concrete_grey: { color: "#a6a8a5", roughness: 0.85, metalness: 0 },
    // Its windows' and doors' slim frames: dark bronze.
    frame_bronze: { color: "#4a4234", roughness: 0.4, metalness: 0.5 },
    // Ladonia's pergolas: anthracite frames, taupe louvres.
    alu_anthracite: { color: "#55524e", roughness: 0.45, metalness: 0.4 },
    alu_taupe: { color: "#7f6f5a", roughness: 0.5, metalness: 0.3 },
    // Its render's own colour, for reveals and wall ends; a thin dark
    // flashing on its parapets.
    render_khaki: { color: "#b8a891", roughness: 0.9, metalness: 0 },
    coping_dark: { color: "#3a3a38", roughness: 0.6, metalness: 0.3 },
    // A rendered wall's own colour, untextured: slab edges and reveals.
    render_trim: { color: "#d9bf9b", roughness: 0.9, metalness: 0 },
    // A flat roof's coping and a parapet's cap.
    coping_grey: { color: "#6b6a66", roughness: 0.7, metalness: 0.2 },
    // The edges of building C's corten bands.
    corten_trim: { color: "#a07a62", roughness: 0.7, metalness: 0.3 },
    render_peach: { color: "#cdb293", roughness: 0.9, metalness: 0 },
    // A stone wall's ends and reveals: its stone's average.
    stone_trim: { color: "#a99d8b", roughness: 0.85, metalness: 0 },
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
    /**
     * A site under its own sky (shared/landscape.js): the sky's picture is
     * the background and its light the image-based light — these are what
     * is drawn until it has loaded, and its fog.
     */
    exterior_mediterranean: {
        background: "#9fc0e3",
        ambient: { color: "#ffffff", intensity: 0 },
        hemi: { sky: "#cfe2ff", ground: "#7a7258", intensity: 0.25 },
        sun: { color: "#fff1dc", intensity: 3.2, position: [-30, 42, 25] },
        fog: { color: "#c8d6e4", near: 90, far: 420 },
        exposure: 0.9,
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
    // Beyond the plot: a field, unmown.
    grass: { color: "#ffffff", roughness: 1, finish: "rough_grass" },
    gravel: { color: "#8b8781", roughness: 1 },
    paving: { color: "#a5a29c", roughness: 0.85 },
    sand: { color: "#d9c9a3", roughness: 1 },
    tarmac: { color: "#4a4a4c", roughness: 0.9 },
};

export const GROUND_NAMES = Object.keys(GROUND_TYPES);

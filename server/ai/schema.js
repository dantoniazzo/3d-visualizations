import {
    FINISH_NAMES,
    ENVIRONMENT_PRESET_NAMES,
    OPENING_TYPES,
    DOOR_TYPE_NAMES,
    DOOR_SWINGS,
    GROUND_NAMES,
    ROOF_TYPE_NAMES,
    STAIR_DIRECTIONS,
    finishesFor,
} from "../../shared/catalog.js";

/**
 * JSON Schema for a *shell* — rooms, walls, openings and doors.
 *
 * The model does not furnish anything: furniture is imported from the
 * catalogue and placed separately. Keeping generation to the building means
 * the output is small, fast, and about the one thing an LLM is genuinely
 * good at here — floor-plan layout.
 *
 * Structured outputs reject numeric bounds, length bounds and recursion, so
 * ranges live in the descriptions and are enforced in validate.js.
 */

const floorFinishes = finishesFor("floor").map((f) => f.id);
const wallFinishes = finishesFor("wall").map((f) => f.id);
const ceilingFinishes = finishesFor("ceiling").map((f) => f.id);
const roofFinishes = finishesFor("roof").map((f) => f.id);
const groundFinishes = finishesFor("ground").map((f) => f.id);

const vec2 = (description) => ({
    type: "array",
    description: `${description} Exactly two numbers: [x, z] in metres.`,
    items: { type: "number" },
});

const outline = (description) => ({
    type: "array",
    description,
    items: vec2("Corner."),
});

const vec3 = (description) => ({
    type: "array",
    description: `${description} Exactly three numbers: [x, y, z] in metres, y is up.`,
    items: { type: "number" },
});

const obj = (properties, required) => ({
    type: "object",
    properties,
    required,
    additionalProperties: false,
});

const door = obj(
    {
        type: {
            type: "string",
            enum: DOOR_TYPE_NAMES,
            description:
                "hinged = single swinging leaf (the usual choice); double = two leaves meeting in the middle, for wide openings onto living space; sliding / pocket = slides sideways, good where a swing would foul furniture.",
        },
        swing: {
            type: "string",
            enum: DOOR_SWINGS,
            description:
                "Which edge the leaf hinges on and which way it opens. Doors should swing INTO the smaller or more private room (a bathroom door opens into the bathroom) and must not foul anything against the wall behind them. Ignored for sliding and pocket doors.",
        },
    },
    ["type", "swing"]
);

const opening = obj(
    {
        id: { type: "string", description: "Unique short id, e.g. 'd-hall-bath'." },
        type: {
            type: "string",
            enum: OPENING_TYPES,
            description:
                "door = a hole with a working door leaf; doorway = an open cased hole with no leaf; window = a hole with glazing and a sill; arch = a rounded-top opening; pass_through = a wide low serving hatch.",
        },
        offset: {
            type: "number",
            description:
                "Distance in metres along the wall from its start point to the CENTRE of the opening.",
        },
        width: {
            type: "number",
            description:
                "Opening width in metres. Internal doors 0.76-0.9, front doors 0.9-1.0, double doors 1.5-1.8, windows 0.9-2.4.",
        },
        height: {
            type: "number",
            description:
                "Opening height in metres. Doors and doorways 2.0-2.1, windows 1.1-1.6.",
        },
        sill: {
            type: "number",
            description:
                "Height in metres from the floor to the bottom of the opening. 0 for doors, doorways and arches; 0.85-1.0 for a window; about 1.1 for a pass-through.",
        },
        door: door,
    },
    ["id", "type", "offset", "width", "height", "sill", "door"]
);

const wall = obj(
    {
        id: { type: "string", description: "Unique short id, e.g. 'w-hall-north'." },
        start: vec2("Wall start point on the floor plan."),
        end: vec2("Wall end point on the floor plan."),
        height: {
            type: "number",
            description: "Wall height in metres. Typically 2.4-2.7 in a flat, up to 3.0 in a period building.",
        },
        thickness: {
            type: "number",
            description:
                "Wall thickness in metres. 0.1 for a stud partition, 0.15 for a masonry internal wall, 0.3 for an external wall.",
        },
        finish: {
            type: "string",
            enum: wallFinishes,
            description: "Finish on side A — the LEFT of the start-to-end direction.",
        },
        finish_back: {
            type: "string",
            enum: wallFinishes,
            description:
                "Finish on side B, the other face. Set it differently when the two sides are different rooms — a tiled bathroom against a painted hallway.",
        },
        base_height: {
            type: "number",
            description: "Height in metres of the wall's base above y=0. 0 unless it sits on a raised floor.",
        },
        openings: { type: "array", items: opening },
    },
    ["id", "start", "end", "height", "thickness", "finish", "finish_back", "base_height", "openings"]
);

const room = obj(
    {
        id: { type: "string", description: "Unique short id, e.g. 'kitchen'." },
        name: { type: "string", description: "Human label shown in the UI, e.g. 'Kitchen'." },
        polygon: {
            type: "array",
            description:
                "Floor outline as an ordered list of [x, z] points in metres, not closed (do not repeat the first point). Must be simple and non-self-intersecting. It should sit against the INNER faces of the surrounding walls.",
            items: vec2("Polygon corner."),
        },
        voids: {
            type: "array",
            description:
                "Holes cut through this room's floor AND ceiling, each an ordered [x, z] outline. Use one for a stairwell: give it to the room the flight rises INTO so the floor is open, and to the room it rises FROM so the ceiling is open. Leave empty for an ordinary room.",
            items: outline("A hole in the slab."),
        },
        floor_finish: {
            type: "string",
            enum: [...floorFinishes, ...groundFinishes],
            description:
                "An indoor finish makes this a room. A ground finish (lawn, paving, tarmac, gravel, decking) makes it an outdoor slab instead — that is how yards, drives, paths and roads are built, and such a slab gets no ceiling and no light.",
        },
        ceiling_finish: {
            type: "string",
            enum: [...ceilingFinishes, "none"],
            description:
                "Use 'none' for a double-height or open-to-above space, and for anything outdoors.",
        },
        height: {
            type: "number",
            description: "Ceiling height in metres for this room. Near 0 for an outdoor slab.",
        },
        elevation: {
            type: "number",
            description:
                "Floor level in metres above y=0. 0 on the ground floor; on an upper storey it is the storey below's elevation plus its height plus about 0.2 for the floor structure.",
        },
    },
    ["id", "name", "polygon", "voids", "floor_finish", "ceiling_finish", "height", "elevation"]
);

const roof = obj(
    {
        id: { type: "string", description: "Unique short id, e.g. 'roof-main'." },
        type: {
            type: "string",
            enum: ROOF_TYPE_NAMES,
            description:
                "gable = two slopes meeting at a ridge, closed by triangular end walls (the usual pitched roof); flat = a single slab.",
        },
        footprint: outline(
            "The plan area covered, as [x, z] corners. The roof is built over this outline's bounding box, so give the building's external wall corners."
        ),
        base_height: {
            type: "number",
            description:
                "Height in metres of the eaves — where the roof meets the top of the external walls. Match it to the wall height.",
        },
        ridge_height: {
            type: "number",
            description:
                "Height in metres of the ridge. For a gable, 1.5-4 m above the eaves; a steeper roof is what makes an attic habitable. Ignored for a flat roof.",
        },
        ridge_axis: {
            type: "string",
            enum: ["x", "z"],
            description:
                "Which axis the ridge line runs along. It should follow the building's LONGER side, so the slopes fall down its shorter one.",
        },
        finish: { type: "string", enum: roofFinishes },
        gable_finish: {
            type: "string",
            enum: wallFinishes,
            description: "Finish on the triangular end walls of a gable roof.",
        },
        overhang: {
            type: "number",
            description: "How far in metres the eaves project past the walls. 0.3-0.6 is typical.",
        },
    },
    [
        "id",
        "type",
        "footprint",
        "base_height",
        "ridge_height",
        "ridge_axis",
        "finish",
        "gable_finish",
        "overhang",
    ]
);

const stair = obj(
    {
        id: { type: "string", description: "Unique short id, e.g. 'stair-ground-first'." },
        start: vec2(
            "Centre of the FOOT of the flight — the bottom step's leading edge — on the floor plan."
        ),
        direction: {
            type: "string",
            enum: STAIR_DIRECTIONS,
            description:
                "Which way the flight climbs on the plan. north = toward +z, south = -z, east = +x, west = -x.",
        },
        width: { type: "number", description: "Flight width in metres. 0.9-1.2 domestically." },
        base_height: { type: "number", description: "Floor level in metres at the foot." },
        top_height: {
            type: "number",
            description: "Floor level in metres at the head — the elevation of the storey above.",
        },
        run: {
            type: "number",
            description:
                "Horizontal distance in metres from foot to head. About 1.4-1.6 times the rise; too short and the flight becomes a ladder.",
        },
        steps: {
            type: "number",
            description: "Number of steps. Aim for a rise of about 0.19 m each.",
        },
        finish: { type: "string", enum: floorFinishes, description: "Tread finish." },
    },
    ["id", "start", "direction", "width", "base_height", "top_height", "run", "steps", "finish"]
);

const spawn = obj(
    {
        position: vec3("Where a visitor appears. y is the floor level at that spot."),
        yaw: {
            type: "number",
            description:
                "Facing direction in DEGREES. 0 looks toward +Z, 90 toward +X, 180 toward -Z, 270 toward -X.",
        },
        label: { type: "string", description: "e.g. 'Front door' or 'Kitchen'." },
    },
    ["position", "yaw", "label"]
);

export const SCENE_SCHEMA = obj(
    {
        name: { type: "string", description: "Short title, e.g. 'Two-Bed Garden Flat'." },
        summary: {
            type: "string",
            description:
                "Two or three sentences describing the property as an agent or architect would: size, layout, aspect, who it suits.",
        },
        environment: obj(
            {
                preset: { type: "string", enum: ENVIRONMENT_PRESET_NAMES },
                ground: {
                    type: "string",
                    enum: GROUND_NAMES,
                    description: "Ground around the building. 'none' for a flat inside a block.",
                },
                ground_size: {
                    type: "number",
                    description: "Side length in metres of the ground plane. 0 when ground is 'none'.",
                },
            },
            ["preset", "ground", "ground_size"]
        ),
        spawns: {
            type: "array",
            description:
                "Where a viewing can start. Give one per significant room, first being the entrance. Each must be on clear floor, at least 0.6 m from any wall.",
            items: spawn,
        },
        rooms: { type: "array", items: room },
        walls: { type: "array", items: wall },
        roofs: {
            type: "array",
            description:
                "Pitched or flat roofs. Give a house one over its envelope and one over any outbuilding such as a garage. Leave empty for a flat inside a block, where the roof is not part of the property.",
            items: roof,
        },
        stairs: {
            type: "array",
            description:
                "One flight per pair of storeys. Every storey above the ground needs a way up, and the storey it rises into needs a matching void in the room the head lands in.",
            items: stair,
        },
    },
    ["name", "summary", "environment", "spawns", "rooms", "walls", "roofs", "stairs"]
);

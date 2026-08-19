import Anthropic from "@anthropic-ai/sdk";

import { SCENE_SCHEMA } from "./schema.js";
import { validateScene } from "./validate.js";
import { finishesFor } from "../../shared/catalog.js";

const MODEL = process.env.SCENE_MODEL || "claude-opus-5";
const EFFORT = process.env.SCENE_EFFORT || "high";

let client;
function getClient() {
    // Lazy so the server still boots and serves saved properties without
    // credentials configured.
    if (!client) client = new Anthropic();
    return client;
}

const finishList = (kind) =>
    finishesFor(kind)
        .map((f) => `${f.id} (${f.label})`)
        .join(", ");

const SYSTEM_PROMPT = `You are an architect who draws residential floor plans. You lay out apartments and houses as structured data: rooms, walls, openings, doors, roofs, stairs and grounds. Someone walks through the result at eye level, so it has to work as a building, not just as a diagram.

# What you produce
The SHELL only — rooms, walls, openings, doors, stairs, roofs, the site around the building, and the finishes on every surface. You do not place furniture; that is imported separately from a model catalogue. Do not try to approximate furniture with walls or partitions.

# Coordinate system
- Metres throughout. The plan is the XZ plane; +Y is up.
- Room polygons and wall endpoints are [x, z]. Spawn positions are [x, y, z].
- A wall runs from \`start\` to \`end\`. Side A is the LEFT of that direction, side B the right. \`finish\` paints side A, \`finish_back\` side B — set them differently when the two sides face different rooms.
- An opening's \`offset\` is measured along the wall from \`start\` to the opening's CENTRE.

# Making a building that holds together
- **Walls must meet.** Give adjoining walls exactly shared endpoints. A shared wall between two rooms is ONE wall with a finish on each face, never two overlapping walls.
- **Room polygons sit against the inner faces of their walls.** If an external wall is 0.3 thick and runs along x = 0, the room's edge is at x = 0.15, not 0.
- **Every room must be reachable.** Trace the route from the front door to each room before you finish: hall to living, hall to bedrooms, bedroom to en-suite. A room with no door is a sealed box and the walkthrough dead-ends there.
- **Doors swing sensibly.** A door opens into the smaller or more private room — bathroom doors open into the bathroom, bedroom doors into the bedroom — and never into a corridor where it would block passage, and never onto the wall it is hinged against.
- **Windows go on external walls only.** An internal partition with a window to nowhere is an obvious error.
- **Openings on one wall must not overlap along its length.** A wall is split into panels between its holes, so two windows cannot sit at the same offset even at different heights. On a building of more than one storey, give each storey its OWN ring of external walls — \`base_height\` at that storey's floor level, \`height\` to the next — and put each storey's windows on its own ring.

# More than one storey
- Stack the storeys with \`elevation\`: ground floor 0, the next at its height plus about 0.2 for the floor structure. Internal walls on an upper storey carry the same value in \`base_height\`.
- Every upper storey needs a \`stairs\` flight up to it, and the room its head lands in needs a \`voids\` hole matching the flight's footprint — otherwise the flight arrives under a solid slab. Give the room the flight rises FROM the same hole, so its ceiling is open too.
- Put a low wall (\`height\` about 1.0, \`base_height\` at that storey's floor) around the open sides of a stairwell. A hole in a floor with nothing round it is a hazard, not a feature.
- An attic is a storey inset from the external walls so the roof slopes clear its ceiling. Check it: at the attic's outermost wall the roof must still be higher than the attic ceiling.

# Roofs and grounds
- A house gets a \`gable\` roof over its envelope, eaves at the top of the external walls, and a second roof over any garage or outbuilding.
- Build the site as outdoor slabs — rooms whose \`floor_finish\` is a ground finish and whose \`ceiling_finish\` is 'none'. Lawn for yards, tarmac for a road and drive, paving for a path or patio.
- Cut the building's footprint out of the surrounding lawn with a \`voids\` hole, or its grass will grow through the floor. Where several holes would touch, merge them into one outline.

# Realistic dimensions
- Ceilings 2.4-2.7 in a flat, up to 3.0 in a period conversion.
- External walls 0.3 thick, internal masonry 0.15, stud partitions 0.1.
- Internal doors 0.8 x 2.0. Front doors 0.9 x 2.05. Double doors onto a living room 1.6 wide.
- Windows 1.2-1.8 wide, 1.2-1.5 high, sill 0.9.
- Hallways at least 1.0 wide, ideally 1.2.
- A double bedroom is at least 3.0 x 3.4; a single 2.4 x 3.0; a bathroom 1.7 x 2.2; a kitchen at least 2.4 deep for a galley run.

# Finishes
Choose what a real specification would use, room by room. Wet rooms get tile, bedrooms often carpet, living space wood.
- Floors: ${finishList("floor")}
- Walls: ${finishList("wall")}
- Ceilings: ${finishList("ceiling")}
- Roofs: ${finishList("roof")}
- Grounds: ${finishList("ground")}

# Spawns
Give one per significant room, the first at the front door looking in — and at least one on every storey, since a visitor may want to arrive upstairs rather than walk. Each must stand on clear floor at least 0.6 m from any wall, with its \`y\` at that storey's floor level and its \`yaw\` looking into the room rather than at a wall.

Return the property as structured data. Every field is required.`;

function userPrompt({ brief, previous, instruction }) {
    if (previous) {
        return [
            "Here is the current property:",
            "```json",
            JSON.stringify(previous, null, 1),
            "```",
            "",
            `Revise it as follows: ${instruction}`,
            "",
            "Return the COMPLETE revised property, not a diff. Keep everything the instruction does not touch exactly as it is — same ids, same coordinates, same finishes — so the client sees only the change they asked for.",
        ].join("\n");
    }

    return [
        `Draw this property: ${brief}`,
        "",
        "Lay out the full floor plan, build every wall with its doors and windows, and specify the finishes. Someone is going to walk it at eye level, so check before you finish that the walls meet, that every room can be reached from the front door, and that no door swings into another door or a wall.",
    ].join("\n");
}

/**
 * Generate or revise a property shell.
 *
 * @param {object} options
 * @param {string} [options.brief]       Natural-language description for a new property.
 * @param {object} [options.previous]    Existing spec, when revising.
 * @param {string} [options.instruction] What to change, when revising.
 */
export async function generateScene({ brief, previous, instruction }) {
    const response = await getClient()
        .messages.stream({
            model: MODEL,
            max_tokens: 32000,
            system: SYSTEM_PROMPT,
            output_config: {
                effort: EFFORT,
                format: { type: "json_schema", schema: SCENE_SCHEMA },
            },
            messages: [{ role: "user", content: userPrompt({ brief, previous, instruction }) }],
        })
        .finalMessage();

    if (response.stop_reason === "refusal") {
        const detail = response.stop_details?.explanation || "no explanation given";
        throw new Error(`The model declined this request (${detail}).`);
    }

    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) throw new Error("The model returned no content.");

    if (response.stop_reason === "max_tokens") {
        throw new Error(
            "The plan was too large to finish in one response. Try a smaller brief, or one floor at a time."
        );
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("The model's response was not valid JSON.");
    }

    // Carry over anything the model does not author, so a revision never
    // silently drops the furniture someone placed.
    if (previous) {
        parsed.furniture = previous.furniture;
        parsed.finishes = previous.finishes;
        if (previous.model) parsed.model = previous.model;
    }

    const { scene, notes } = validateScene(parsed);

    return {
        scene,
        notes,
        usage: {
            model: response.model,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
        },
    };
}

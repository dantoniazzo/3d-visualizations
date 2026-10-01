/**
 * The pieces of scenery round a house that can be left out: of a published
 * version altogether, by whoever publishes it (shared/publishOptions.js's
 * `scenery`), or hidden by a visitor (World/Scenery.js), to draw less on a
 * slow phone. Each is drawn live — the car, the trees, the grass — but
 * the hills, which are the ground of the house, published and baked.
 */
export const SCENERY = [
    { id: "car", label: "Car" },
    { id: "trees", label: "Trees and bushes" },
    { id: "hills", label: "Hills" },
    { id: "grass", label: "Grass" },
];

export const SCENERY_IDS = SCENERY.map((piece) => piece.id);

/**
 * A space with the pieces of scenery not in `kept` left out, as a version
 * published without them is: its own copy, its garden's settings saying so
 * (shared/garden.js) — so the public view grows none of them, and the bake
 * casts no shade of theirs — and no car.
 *
 * @param {object} spec
 * @param {string[]} kept  the ids (SCENERY) to keep
 */
export function leaveOut(spec, kept = SCENERY_IDS) {
    const out = JSON.parse(JSON.stringify(spec));
    const off = (group, values) => {
        out.garden ??= {};
        out.garden[group] = { ...(out.garden[group] || {}), ...values };
    };
    if (!kept.includes("car")) out.vehicles = [];
    if (!kept.includes("trees")) off("trees", { enabled: false });
    if (!kept.includes("hills")) off("hills", { enabled: false });
    if (!kept.includes("grass")) {
        off("blades", { enabled: false });
        off("shells", { enabled: false });
        off("tufts", { enabled: false });
    }
    return out;
}

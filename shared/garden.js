/**
 * The garden's settings: every one the editor's Garden panel offers
 * (Editor/GardenPanel.js), with its default and its range. A space keeps
 * the ones changed from the default as `spec.garden` — the server keeps
 * only what is listed here (validateScene), the app reads them through
 * gardenSettings, and publishing and baking go by the published spec's.
 *
 * The hills, their tufts and the trees follow Fluffy Tree - Three.js
 * (github.com/leoawen/fluffytree-threejs) — its defaults are its demo's, as
 * it renders when first opened; the grass blades follow Isaac Mason's
 * sketches (nature/grass) — its controls, less the patch's size, which is
 * the lawns here.
 */

/** Each group of settings: `{ label, value, min?, max?, step?, options? }` a setting. */
export const GARDEN = {
    colour: {
        label: "Colour",
        // Fluffy Tree renders with three's ACES Filmic; the house was drawn
        // with Blender's Filmic until the garden came.
        toneMapping: { label: "Tone mapping", value: "aces", options: { "ACES Filmic": "aces", "Blender Filmic": "filmic" } },
        exposure: { label: "Exposure", value: 1, min: 0.3, max: 2.5, step: 0.01 },
    },
    ground: {
        label: "Ground",
        // Fluffy Tree's ground: one radial gradient, sand in the middle to
        // green at its edge — here centred on the plot, and moved from there.
        size: { label: "Gradient size (m)", value: 150, min: 10, max: 400, step: 1 },
        offsetX: { label: "Gradient centre X (m)", value: 0, min: -150, max: 150, step: 0.5 },
        offsetZ: { label: "Gradient centre Z (m)", value: 0, min: -150, max: 150, step: 0.5 },
    },
    lighting: {
        label: "Lighting (trees and tufts)",
        ambient: { label: "Ambient light", value: 1.5, min: 0, max: 5, step: 0.01 },
        directional: { label: "Directional light", value: 1.5, min: 0, max: 5, step: 0.05 },
        shadowDarkness: { label: "Shadow intensity", value: 0.2, min: 0, max: 1, step: 0.01 },
    },
    hills: {
        label: "Hills",
        enabled: { label: "Show the hills", value: true },
        count: { label: "How many", value: 5, min: 0, max: 12, step: 1 },
        height: { label: "Highest (m)", value: 5, min: 0.5, max: 15, step: 0.1 },
        depth: { label: "Depth (m)", value: 46, min: 15, max: 120, step: 1 },
    },
    tufts: {
        label: "Hills' grass",
        enabled: { label: "Show the hills' grass", value: true },
        // Fluffy Tree's grass grows in patches, sand between them: as thick
        // as this in a patch's middle, patches over this much of the ground.
        density: { label: "Tufts a m² (in a patch)", value: 36, min: 0, max: 100, step: 0.5 },
        coverage: { label: "Patches' share of the ground", value: 0.65, min: 0, max: 1, step: 0.01 },
        patchSize: { label: "Patch size (m)", value: 10, min: 2, max: 40, step: 0.5 },
        // Each card this long and wide, a tenth either way, its top leaning
        // over by this share of its length.
        size: { label: "Tuft size (m)", value: 0.9, min: 0.1, max: 3, step: 0.01 },
        lean: { label: "Lean", value: 0.33, min: 0, max: 0.9, step: 0.01 },
        distance: { label: "Draw distance (m)", value: 120, min: 10, max: 300, step: 1 },
        baseColor: { label: "Base colour", value: "#009b00" },
        tipColor: { label: "Tip colour", value: "#00ff4a" },
        shadowDarkness: { label: "Shadow intensity", value: 0.3, min: 0, max: 1, step: 0.01 },
        windStrength: { label: "Wind strength", value: 0.06, min: 0, max: 0.5, step: 0.01 },
        windSpeed: { label: "Wind speed", value: 1.2, min: 0, max: 5, step: 0.01 },
        windX: { label: "Wind direction X", value: 0.8, min: -1, max: 1, step: 0.01 },
        windZ: { label: "Wind direction Z", value: 0.6, min: -1, max: 1, step: 0.01 },
    },
    trees: {
        label: "Trees",
        enabled: { label: "Show the trees and bushes", value: true },
        scale: { label: "Size", value: 0.7, min: 0.3, max: 1.5, step: 0.01 },
        gardenArea: { label: "m² of back garden a tree", value: 55, min: 15, max: 400, step: 1 },
        hillTrees: { label: "Trees on the hills", value: 5, min: 0, max: 20, step: 1 },
    },
    leaves: {
        label: "Volumetric gradient (leaves)",
        gradientStart: { label: "Start", value: -1, min: -1, max: 5, step: 0.01 },
        gradientEnd: { label: "End", value: 2.7, min: -1, max: 5, step: 0.01 },
        shadowColor: { label: "Shadow colour", value: "#001d33" },
        litColor: { label: "Lit colour", value: "#21ff08" },
        highlightStart: { label: "Highlight start", value: 0.5, min: -1, max: 5, step: 0.01 },
        highlightEnd: { label: "Highlight end", value: 1.8, min: -1, max: 5, step: 0.01 },
        highlightColor: { label: "Highlight colour", value: "#8cff00" },
        shadowDarkness: { label: "Shadow intensity", value: 0.2, min: 0, max: 1, step: 0.01 },
        windStrength: { label: "Wind strength", value: 0.05, min: 0, max: 1, step: 0.01 },
        windFrequency: { label: "Wind frequency", value: 5, min: 0, max: 5, step: 0.01 },
        windSpeed: { label: "Wind speed", value: 0.4, min: 0, max: 5, step: 0.1 },
    },
    blades: {
        label: "Grass blades",
        enabled: { label: "Show the blades", value: true },
        density: { label: "Blades a m²", value: 150, min: 0, max: 800, step: 1 },
        // As the sketch's: a blade is this wide, and this tall before it is
        // stretched — up to 2.8 times, a third of them; the rest up to twice.
        width: { label: "Blade width (m)", value: 0.015, min: 0.002, max: 0.2, step: 0.001 },
        height: { label: "Blade height (m)", value: 0.12, min: 0.02, max: 2, step: 0.01 },
        joints: { label: "Blade joints", value: 3, min: 1, max: 8, step: 1 },
        distance: { label: "Draw distance (m)", value: 30, min: 5, max: 150, step: 1 },
        wireframe: { label: "Wireframe", value: false },
    },
    shells: {
        label: "Mown shells",
        enabled: { label: "Shells under the blades", value: false },
    },
};

/**
 * A space's garden settings: its own where it has them, the defaults
 * everywhere else — `{ group: { setting: value } }`.
 */
export function gardenSettings(spec) {
    const own = spec?.garden || {};
    const out = {};
    for (const [group, settings] of Object.entries(GARDEN)) {
        out[group] = {};
        for (const [key, setting] of Object.entries(settings)) {
            if (key === "label") continue;
            const value = own[group]?.[key];
            out[group][key] = accept(setting, value) ? value : setting.value;
        }
    }
    return out;
}

/**
 * What of a spec's `garden` to keep: settings that are listed, of the
 * right kind and in range, and differ from their defaults. Null for none.
 */
export function sanitizeGarden(raw) {
    if (!raw || typeof raw !== "object") return null;
    const out = {};
    for (const [group, settings] of Object.entries(GARDEN)) {
        const own = raw[group];
        if (!own || typeof own !== "object") continue;
        for (const [key, setting] of Object.entries(settings)) {
            if (key === "label" || !accept(setting, own[key]) || own[key] === setting.value) continue;
            (out[group] ??= {})[key] = own[key];
        }
    }
    return Object.keys(out).length ? out : null;
}

function accept(setting, value) {
    if (value === undefined || value === null) return false;
    const kind = typeof setting.value;
    if (typeof value !== kind) return false;
    if (setting.options) return Object.values(setting.options).includes(value);
    if (kind === "number") return Number.isFinite(value) && value >= setting.min && value <= setting.max;
    if (kind === "string") return /^#[0-9a-f]{6}$/i.test(value);
    return true;
}

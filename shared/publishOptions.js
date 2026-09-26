/**
 * What a publish of a public view does, option by option — so that each
 * optimisation can be switched off and the difference seen, by publishing
 * the same space twice and opening the two versions side by side.
 *
 * Each published version records the options it was made with; the public
 * view reads them back (`glass`, `quality`), as does the bake (`compress`).
 */

export const PUBLISH_OPTIONS = [
    {
        id: "cull",
        label: "Remove hidden faces",
        hint: "Drop every face no visitor can see, and turn round the ones facing the wrong way, so everything draws single-sided.",
        default: true,
    },
    {
        id: "merge",
        label: "Merge into one mesh per material and floor",
        hint: "Off keeps every object its own mesh: one draw call each.",
        default: true,
    },
    {
        id: "compress",
        label: "Compress geometry",
        hint: "Draco: a fraction of the download, decoded on the visitor's device.",
        default: true,
    },
    {
        id: "glass",
        label: "Plain glass",
        hint: "See-through glass instead of refractive, which draws the scene twice whenever a window is in view.",
        default: true,
    },
    {
        id: "bake",
        label: "Bake lighting",
        hint: "Day and night light baked in Blender, on this machine, right after publishing. The view then draws no live light at all.",
        choices: [
            { value: "off", label: "Off" },
            { value: "draft", label: "Draft", detail: "2048², 128 samples, ~3 min" },
            { value: "final", label: "Final", detail: "4096², 512 samples, ~15 min" },
        ],
        default: "final",
    },
    {
        id: "quality",
        label: "Phone quality",
        hint: "Pixel ratio and shadows. Auto draws phones and tablets lighter; ?quality= in a link still overrides it.",
        choices: [
            { value: "auto", label: "Auto" },
            { value: "low", label: "Always low" },
            { value: "high", label: "Always high" },
        ],
        default: "auto",
    },
];

/** What each bake setting bakes with: samples, and the lightmap's size. */
export const BAKE_QUALITY = {
    draft: { samples: 128, size: 2048 },
    final: { samples: 512, size: 4096 },
};

/** Every option at its default. */
export const DEFAULT_PUBLISH_OPTIONS = Object.fromEntries(PUBLISH_OPTIONS.map((option) => [option.id, option.default]));

/**
 * Options as sent or stored, made whole and valid: anything missing or
 * unknown takes its default. A version published before there were
 * options was made with every one of them on.
 */
export function publishOptions(input = {}) {
    const options = {};
    for (const option of PUBLISH_OPTIONS) {
        const value = input?.[option.id];
        if (option.choices) {
            options[option.id] = option.choices.some((choice) => choice.value === value) ? value : option.default;
        } else {
            options[option.id] = typeof value === "boolean" ? value : option.default;
        }
    }
    return options;
}

/** A short line naming what a version was made with. */
export function describeOptions(options) {
    const o = publishOptions(options);
    const parts = [
        o.cull ? "hidden faces removed" : "all faces",
        o.merge ? "merged" : "unmerged",
        o.compress ? "compressed" : "uncompressed",
        o.glass ? "plain glass" : "refractive glass",
    ];
    if (o.quality !== "auto") parts.push(`quality ${o.quality}`);
    return parts.join(" · ");
}

/** When a version was published: its name is the UTC time, 20260925T065314Z. */
export function versionDate(version) {
    return new Date(String(version).replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, "$1-$2-$3T$4:$5:$6Z"));
}

/** A version's name for people: when it was published, in local time. */
export function versionLabel(version) {
    const date = versionDate(version);
    if (Number.isNaN(date.getTime())) return String(version);
    return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

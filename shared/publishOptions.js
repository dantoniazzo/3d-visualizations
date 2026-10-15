/**
 * What a publish of a public view does, option by option — so that each
 * optimisation can be switched off and the difference seen, by publishing
 * the same space twice and opening the two versions side by side.
 *
 * Each published version records the options it was made with; the public
 * view reads them back (`glass`, `quality`, `lighting`), as does the bake
 * (`compress`). `scenery` is what of it the version has at all — and
 * `sceneryKnown`, kept beside it, the pieces there were to choose from
 * when the choice was made (see `publishOptions`).
 *
 * A choice marked `retired` is one a version may have been published with
 * and is still read as, but the panel no longer offers: `lighting`'s
 * "phones" (fully baked on a phone) is what "auto" gives, now that no
 * device is given the whole house lit live.
 */
import { SCENERY, SCENERY_IDS } from "./scenery.js";

/**
 * The scenery there was to leave out before options kept the pieces they
 * knew of (`sceneryKnown`). Options without that list are from then, and
 * say nothing of a piece added since — the people were the first.
 */
const SCENERY_AT_FIRST = ["car", "trees", "hills", "grass"];

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
        hint: "Off, it is lit live, as the editor's walkthrough is: the sun, the sky and the lights drawn live, and switched live. Draft or Final bakes day and night light in Blender, on this machine, right after publishing, and the view draws from that bake instead.",
        choices: [
            { value: "off", label: "Off", detail: "lit live, as in the editor; lights switch live" },
            { value: "draft", label: "Draft", detail: "2048², 128 samples, ~7 min for a house" },
            { value: "final", label: "Final", detail: "4096², 512 samples, ~28 min for a house" },
        ],
        default: "final",
    },
    {
        id: "quality",
        label: "Phone quality",
        hint: "Pixel ratio and shadows. Auto draws phones and tablets lighter; ?quality= in a link still overrides it. No device is drawn above the step it is rated for, whichever is asked.",
        choices: [
            { value: "auto", label: "Auto" },
            { value: "low", label: "Always low" },
            { value: "high", label: "Always high" },
        ],
        default: "auto",
    },
    {
        id: "lighting",
        label: "Lighting",
        hint: "Once baked, every device draws the bake's light. Baked: what moves — people, cars, doors — still shades the sun and is lit by the bake's light probes, and a shut door dims its rooms; phones, and any device at the two lowest quality steps, get it fully baked. Fully baked: the bake's light alone, nothing drawn live — the lightest there is — on every device; its bake then leaves out what only the other reads (the rooms with each door shut, the light probes), so it is a quarter quicker to bake and its house two fifths less to download, and the version cannot be drawn the other way without baking it again. The bird's-eye view is drawn from the bake either way. Visitors can pick Fully baked themselves in the menu, never anything heavier.",
        choices: [
            { value: "auto", label: "Baked", detail: "what moves shades the sun; phones fully baked" },
            // What "auto" now gives: kept for the versions and the browsers that have it, no longer offered.
            { value: "phones", label: "Baked", detail: "phones fully baked", retired: true },
            { value: "static", label: "Fully baked", detail: "everywhere" },
        ],
        default: "auto",
    },
    {
        id: "scenery",
        label: "Scenery",
        hint: "What of the garden and round it the version has. Left out, it is neither drawn nor baked; visitors can hide the rest themselves.",
        pieces: SCENERY.map(({ id, label }) => ({ value: id, label })),
        // Where the pieces there were to choose from are kept, beside the choice.
        known: "sceneryKnown",
        default: SCENERY_IDS,
    },
];

/** What each bake setting bakes with: samples, and the lightmap's size. */
export const BAKE_QUALITY = {
    draft: { samples: 128, size: 2048 },
    final: { samples: 512, size: 4096 },
};

/** Every option at its default: all the scenery there is, and all of it known. */
export const DEFAULT_PUBLISH_OPTIONS = publishOptions();

/**
 * Sets of options published in one click (the Publish panel): lit live, as
 * the editor's walkthrough draws it — every optimisation that leaves the
 * look alone (hidden faces, merging, compression, plain glass), nothing
 * baked, the phone quality left to the device, all the scenery.
 */
export const PUBLISH_PRESETS = [
    {
        id: "live",
        label: "Lit live — as in the editor",
        hint: "Hidden faces removed, merged, compressed, plain glass; not baked: the sun, the sky and the lights live, switched live; quality auto; all the scenery.",
        options: { ...DEFAULT_PUBLISH_OPTIONS, cull: true, merge: true, compress: true, glass: true, bake: "off", quality: "auto", scenery: [...SCENERY_IDS] },
    },
];

/**
 * Options as sent or stored, made whole and valid: anything missing or
 * unknown takes its default. A version published before there were
 * options was made with every one of them on.
 *
 * The scenery is the pieces chosen, with the pieces there were to choose
 * from beside them (`sceneryKnown`). A piece missing from the chosen was
 * left out only if it was there to tick; one added since — the people,
 * for options from when there were the car, the trees, the hills and the
 * grass — is kept. So options a browser remembered from before there were
 * people do not publish a space without them, unasked; and a version
 * published then, whose space had none, is not read as made without them.
 * What comes back knows every piece there is now, so one left out of it
 * stays out.
 */
export function publishOptions(input = {}) {
    const options = {};
    for (const option of PUBLISH_OPTIONS) {
        const value = input?.[option.id];
        if (option.pieces) {
            const pieces = option.pieces.map((piece) => piece.value);
            const known = Array.isArray(input?.[option.known]) ? input[option.known] : SCENERY_AT_FIRST;
            options[option.id] = Array.isArray(value)
                ? pieces.filter((piece) => value.includes(piece) || !known.includes(piece))
                : [...option.default];
            options[option.known] = pieces;
        } else if (option.choices) {
            options[option.id] = option.choices.some((choice) => choice.value === value) ? value : option.default;
        } else {
            options[option.id] = typeof value === "boolean" ? value : option.default;
        }
    }
    return options;
}

/**
 * A short line naming what a version was made with. Of the scenery it
 * names what was left out — not a piece there was none of yet when the
 * version was published (`publishOptions`): its space had none to leave.
 */
export function describeOptions(options) {
    const o = publishOptions(options);
    const parts = [
        o.cull ? "hidden faces removed" : "all faces",
        o.merge ? "merged" : "unmerged",
        o.compress ? "compressed" : "uncompressed",
        o.glass ? "plain glass" : "refractive glass",
    ];
    if (o.quality !== "auto") parts.push(`quality ${o.quality}`);
    if (o.lighting === "phones") parts.push("phones fully baked");
    if (o.lighting === "static") parts.push("fully baked");
    const left = SCENERY.filter((piece) => !o.scenery.includes(piece.id)).map((piece) => piece.label.toLowerCase());
    if (left.length) parts.push(`no ${left.join(", ")}`);
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

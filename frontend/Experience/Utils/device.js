/**
 * How much the device can be asked for.
 *
 * Phones and tablets — anything driven by touch — get a lighter frame:
 * fewer pixels, and a smaller, cheaper shadow map. A three-year-old Android
 * phone reports a pixel ratio near 3, so drawing at full resolution alone
 * costs four times the pixels of drawing at 1.5, on a GPU a fraction of a
 * laptop's.
 *
 * A published version can fix the tier for everyone who opens it
 * (setQuality, before the scene is built); `?quality=low` or
 * `?quality=high` in the link overrides both, to try either on any device.
 */
const requested = new URL(window.location.href).searchParams.get("quality");
const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;

export let LOW_POWER;
/** Highest pixel ratio drawn at. */
export let MAX_PIXEL_RATIO;
/** Sun shadow map resolution, per side. */
export let SHADOW_MAP_SIZE;

/** @param {"auto"|"low"|"high"} quality  what a published version asks for */
export function setQuality(quality = "auto") {
    const tier = requested || quality;
    LOW_POWER = tier === "low" || (tier !== "high" && touch);
    MAX_PIXEL_RATIO = LOW_POWER ? 1.5 : 2;
    SHADOW_MAP_SIZE = LOW_POWER ? 1024 : 2048;
}

setQuality();

/**
 * A baked lightmap at the size this device should get: the phone copy,
 * half the size or less, on a low-power device when there is one.
 */
export function lightmapURL(variant) {
    return (LOW_POWER && variant.lightmapPhone) || variant.lightmap;
}

/** The colour to go with that lightmap, when it is its brightness alone. */
export function chromaURL(variant) {
    return (LOW_POWER && variant.chromaPhone) || variant.chroma || null;
}

/** What a published version asks for (its `lighting` option), and what this visitor picked. */
let publishedLighting = "auto";
let chosenLighting = null;

/**
 * Before the scene is built: how a published version asks to be lit
 * (shared/publishOptions.js's `lighting`: "auto", "phones" or "static"),
 * and how its visitor has asked to see it, from the menu ("live", "baked",
 * "static", or null for as published).
 */
export function setLighting(published = "auto", chosen = null) {
    publishedLighting = published;
    chosenLighting = chosen;
}

/**
 * How a baked public view is lit:
 *
 *   - "live": the sun and the lamps are drawn live, with shadows that
 *     follow the doors, the people and the car, on top of the rest of the
 *     light — the sky's, and everything bounced — from the bake.
 *   - "baked": all of the light from the bake, the sun shaded by what moves
 *     where the bake says how much of it there is; what a phone can afford.
 *   - "static": all of the light from the bake and nothing drawn live — no
 *     shadow map, no light probes, the doors dimming no room — as the view
 *     was before any of it; the lightest there is, for the slowest phones.
 *
 * `?lighting=` in the link first, then the visitor's choice (setLighting),
 * then the version's: "static" fully baked everywhere, "phones" on a
 * low-power device; otherwise live where the bake has the light apart
 * (blender/bake_public.py's `indirect`) and the device is not low-power.
 *
 * @param {object} lighting  a published version's baked lighting
 * @returns {"live"|"baked"|"static"}
 */
export function lightingMode(lighting) {
    const apart = Boolean(lighting?.variants?.day?.indirect);
    const asked = new URL(window.location.href).searchParams.get("lighting") ?? chosenLighting;
    if (asked === "static" || asked === "baked" || (asked === "live" && apart)) return asked;
    if (publishedLighting === "static" || (publishedLighting === "phones" && LOW_POWER)) return "static";
    return apart && !LOW_POWER ? "live" : "baked";
}

/**
 * Whether a view drawn from the bake ("baked", above) still shows what moves
 * shading the sun: the bake says how much of the sun's light each texel has
 * (its `sun.mask`), which a shadow map of what moves alone — the people, the
 * car, the doors — takes away where it falls (SceneBuilder's
 * decodeLightmap). The house and the garden, their shade baked, cast none.
 *
 * @param {object} lighting  a published version's baked lighting
 */
export function movingShadowsOnly(lighting) {
    return Boolean(lighting?.variants?.day?.sun?.mask) && lightingMode(lighting) === "baked";
}

/** A variant's sun mask at the size this device should get. */
export function sunMaskURL(sun) {
    return (LOW_POWER && sun.maskPhone) || sun.mask;
}

/** The doors' atlas (the bake's door states) at the size this device should get. */
export function doorStatesURL(states) {
    return (LOW_POWER && states.filePhone) || states.file;
}

/**
 * How many lamps are lit live at once, each with a shadow of its own — six
 * renders of what is round it, whenever something there moves. The rest
 * of the lamps that are on are drawn from the bake, as a phone draws them.
 */
export const LIVE_LAMPS = 4;
/** A live lamp's shadow map, per side of its cube. */
export const LAMP_SHADOW_SIZE = 512;

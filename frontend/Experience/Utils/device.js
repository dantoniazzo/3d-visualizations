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

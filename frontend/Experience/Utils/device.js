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

/**
 * The Performance ↔ Quality slider's steps, fastest first. Each says how
 * the view is drawn:
 *
 *   - `pixelRatio`: the most pixels per CSS pixel drawn (never more than
 *     the screen has);
 *   - `post`: drawn through post-processing (PostProcessing.js) — ambient
 *     occlusion (`ao`), bloom at night, the grade — with the scene drawn
 *     multisampled (`msaa`); without it, straight to the screen;
 *   - `shadow`: the sun's shadow map, per side; `fit`ted to what the camera
 *     sees out to `reach` metres (Realism.js) rather than the whole site,
 *     drawn again `every` few frames (and whenever the fit moves);
 *     `soft`: three's soft filter; `pcss`: soft by how far the shade is
 *     from what casts it, as the sun's own disc draws it;
 *   - `anisotropy`: textures' filtering seen at a slant (floors, roads);
 *   - `flora`: how much of the grass is drawn (`density`), and how far
 *     off the trees and grass are drawn in full (`reach`, a scale);
 *   - `probe`: the light in the room the camera is in, captured from
 *     the room itself — the sun's patches bounced, the windows' light, the
 *     glossy floors' and the glass's reflections (Realism.js);
 *   - `grade`: the renders' warm, bright colour grade (PostProcessing.js).
 *   - `lamps`: in a view lit live, how many of the light fittings that are
 *     on are drawn as live lights, nearest first (World/LampPool.js) —
 *     `shadowed` downlights with shadows of their own (`size` their maps),
 *     `unshadowed` lights in the visitor's own room besides; every other
 *     room that is lit glows (World/RoomGlow.js).
 *   - `people`: the people round the property (World/People.js) — at most
 *     `most` of them (whole groups first, the same ones every time), each
 *     animated every `every` frames within `near` metres of the camera and
 *     every `farEvery` frames beyond, and held still beyond `still` metres
 *     or out of sight.
 *
 * `?quality=low` is step 1, as a phone was drawn; `?quality=high` step 3,
 * as a computer was; `?quality=0`…`4` or `max` any step.
 */
export const QUALITY_STEPS = [
    {
        step: 0,
        name: "Fastest",
        pixelRatio: 1,
        post: false,
        msaa: 0,
        ao: null,
        shadow: { size: 1024, filter: "pcf", fit: true, reach: 35 },
        anisotropy: 1,
        flora: { density: 0.35, reach: 0.6 },
        lamps: { shadowed: 0, unshadowed: 2, size: 512 },
        people: { most: 4, every: 2, near: 8, farEvery: 4, still: 30 },
        probe: false,
        grade: false,
    },
    {
        step: 1,
        name: "Fast",
        pixelRatio: 1.5,
        post: false,
        msaa: 0,
        ao: null,
        shadow: { size: 1024, filter: "pcf", fit: true, reach: 50 },
        anisotropy: 2,
        flora: { density: 0.5, reach: 0.7 },
        lamps: { shadowed: 1, unshadowed: 1, size: 512 },
        people: { most: 8, every: 1, near: 10, farEvery: 3, still: 45 },
        probe: false,
        grade: false,
    },
    {
        step: 2,
        name: "Balanced",
        pixelRatio: 1.5,
        post: true,
        msaa: 2,
        ao: { samples: 8, denoise: 4, halfRes: true },
        shadow: { size: 2048, filter: "soft", fit: true, reach: 60 },
        anisotropy: 4,
        flora: { density: 0.75, reach: 0.85 },
        lamps: { shadowed: 1, unshadowed: 2, size: 512 },
        people: { most: 16, every: 1, near: 12, farEvery: 3, still: 60 },
        probe: false,
        grade: true,
    },
    {
        step: 3,
        name: "High",
        pixelRatio: 2,
        post: true,
        msaa: 4,
        ao: { samples: 12, denoise: 6, halfRes: true },
        shadow: { size: 4096, filter: "soft", fit: true, reach: 90, every: 2 },
        anisotropy: 8,
        flora: { density: 1, reach: 1 },
        lamps: { shadowed: 2, unshadowed: 2, size: 512 },
        people: { most: 32, every: 1, near: 15, farEvery: 2, still: 90 },
        probe: true,
        grade: true,
    },
    {
        step: 4,
        name: "Maximum realism",
        pixelRatio: 2,
        post: true,
        msaa: 4,
        ao: { samples: 16, denoise: 8, halfRes: true },
        shadow: { size: 8192, filter: "pcss", fit: true, reach: 120, every: 3 },
        anisotropy: 16,
        flora: { density: 1, reach: 1.5 },
        lamps: { shadowed: 2, unshadowed: 4, size: 1024 },
        people: { most: Infinity, every: 1, near: 15, farEvery: 2, still: 120 },
        probe: true,
        grade: true,
    },
];

/** Where a visitor's own step is kept, on their device, for every space. */
const STORAGE_KEY = "render-quality";

export let LOW_POWER;
/** Highest pixel ratio drawn at. */
export let MAX_PIXEL_RATIO;
/** Sun shadow map resolution, per side, for a view without a fitted shadow (a published one's). */
export let SHADOW_MAP_SIZE;
/** The slider's step now (0…4), and its settings (QUALITY_STEPS). */
export let QUALITY_STEP;
export let QUALITY;
/** Whether the page was opened as a low-power device would be: what only a reload changes. */
export let LOADED_LOW_POWER;

let publishedQuality = "auto";
const listeners = new Set();

/** "low", "high", "max" or a step's number as a step, or null. */
function parseStep(value) {
    if (value === null || value === undefined || value === "" || value === "auto") return null;
    if (value === "low") return 1;
    if (value === "high") return 3;
    if (value === "max" || value === "ultra") return 4;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n < QUALITY_STEPS.length ? n : null;
}

let detected = null;
/**
 * The highest step this kind of device keeps up with: a phone or tablet
 * step 1; a computer by its graphics — Apple's Pro, Max and Ultra chips and
 * discrete cards the top step, other Apple silicon step 3, integrated
 * Intel and AMD graphics step 2, a software renderer step 0.
 */
export function deviceDefaultStep() {
    if (detected !== null) return detected;
    if (touch) return (detected = 1);
    let name = "";
    try {
        const gl = document.createElement("canvas").getContext("webgl2");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        name = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER) || "");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
        name = "";
    }
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) detected = 0;
    // The top step only where it is known to hold: Apple's Pro, Max and
    // Ultra chips and RTX cards; other discrete cards (laptop MX parts
    // among them) start a step lower and can be taken up by hand.
    else if (/apple m\d+ (pro|max|ultra)/i.test(name) || /\brtx\b/i.test(name)) detected = 4;
    else if (/nvidia|geforce|quadro|radeon (rx|pro)|radeon\(tm\) rx/i.test(name)) detected = 3;
    else if (/apple/i.test(name)) detected = 3;
    else if (/intel|uhd|iris|radeon\(tm\) graphics|vega/i.test(name)) detected = 2;
    else detected = 3;
    return detected;
}

/** The step a visitor has picked on this device, if any. */
export function storedStep() {
    try {
        return parseStep(localStorage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
}

/**
 * The step to draw at: `?quality=` in the link first, then what this
 * visitor picked on the slider, then what a published version fixes for
 * everyone (its `quality`, "low" or "high"), then the device's own.
 */
export function resolveStep() {
    return parseStep(requested) ?? storedStep() ?? parseStep(publishedQuality) ?? deviceDefaultStep();
}

/** The largest texture this device's WebGL draws to, once asked. */
let maxTexture = null;
function deviceMaxTexture() {
    if (maxTexture !== null) return maxTexture;
    try {
        const gl = document.createElement("canvas").getContext("webgl2");
        maxTexture = Math.min(gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? 4096, gl?.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 4096);
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
        maxTexture = 4096;
    }
    return maxTexture;
}

function apply(step) {
    QUALITY_STEP = step;
    const settings = QUALITY_STEPS[step];
    // The sun's shadow map no bigger than the device can make it.
    const size = Math.min(settings.shadow.size, deviceMaxTexture());
    QUALITY = size === settings.shadow.size ? settings : { ...settings, shadow: { ...settings.shadow, size } };
    LOW_POWER = step <= 1;
    MAX_PIXEL_RATIO = QUALITY.pixelRatio;
    SHADOW_MAP_SIZE = LOW_POWER ? 1024 : 2048;
}

/** @param {"auto"|"low"|"high"} quality  what a published version asks for */
export function setQuality(quality = "auto") {
    publishedQuality = quality;
    apply(resolveStep());
    LOADED_LOW_POWER = LOW_POWER;
}

/**
 * The slider moved: draw at `step` from now on — kept on this device
 * unless `persist` is false — and tell whatever draws (onQualityChange).
 */
export function setQualityStep(step, { persist = true } = {}) {
    const next = parseStep(String(step)) ?? QUALITY_STEP;
    if (persist) {
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // Kept for this visit only.
        }
    }
    if (next === QUALITY_STEP) return;
    const previous = QUALITY;
    apply(next);
    for (const listener of listeners) listener(QUALITY, previous);
}

/**
 * If the GPU gives up drawing at this step (its context lost), the next
 * visit starts a step lower — kept as the visitor's choice — so a step too
 * heavy for the device does not fail again on every reload.
 */
export function guardContextLoss(canvas) {
    canvas.addEventListener("webglcontextlost", () => {
        try {
            localStorage.setItem(STORAGE_KEY, String(Math.max(0, QUALITY_STEP - 1)));
        } catch {
            // Nothing kept; the device's own step next time.
        }
    });
}

/** Called with (settings, previous) whenever the step changes. @returns a function that stops it */
export function onQualityChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Whether going to `step` from how the page was opened needs a reload for
 * all of it to apply: across the low-power line, a published view's
 * lighting, its lightmaps' size and the garden's density were chosen as it
 * was built.
 */
export function needsReloadFor(step) {
    return (step <= 1) !== LOADED_LOW_POWER;
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

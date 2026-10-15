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
 * `?quality=high` in the link overrides both, to try either on any device
 * — but nothing takes a device over the step it is rated for
 * (stepCeiling): not a link, not the slider, not a version's own setting.
 */
import { chooseLighting, noteLostGraphics } from "./viewerChoices.js";

const params = new URL(window.location.href).searchParams;
const requested = params.get("quality");
const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
/**
 * A developer's own, in the link. `?uncapped` lifts the ceiling (not on a
 * touch device), to see a step on a device not rated for it. `?rated=0`…`4`
 * pretends a device rated that low — never higher than it is — to see what
 * such a device is given.
 */
const uncapped = params.has("uncapped");
const pretended = params.get("rated");

/**
 * The Performance ↔ Quality slider's steps, fastest first. Each says how
 * the view is drawn:
 *
 *   - `pixelRatio`: the most pixels per CSS pixel drawn (never more than
 *     the screen has);
 *   - `pixels`: the most pixels drawn in all, however big the window — a
 *     5K screen at a ratio of 2 is 14.7 million — by drawing at a lower
 *     ratio (Utils/Sizes.js);
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
 *   - `garden`: at night, how many of a site's garden lights shine at
 *     once, nearest the visitor first (World/Flora/lights.js) — so many
 *     `spots` (the uplights under the trees) and so many `points` (the
 *     pergolas' downlights, the pool's); the rest are their glowing
 *     fittings.
 *   - `people`: the people round the property (World/People.js) — at most
 *     `most` of them (the first of the spec's list, which is in the order
 *     of their priority, whole groups at a time; in the editor's edit mode
 *     all of them), each animated every `every` frames within `near`
 *     metres of the camera and every `farEvery` frames beyond, and held
 *     still beyond `still` metres or out of sight.
 *
 * `?quality=low` is step 1, as a phone was drawn; `?quality=high` step 3,
 * as a computer was; `?quality=0`…`4` or `max` any step.
 */
export const QUALITY_STEPS = [
    {
        step: 0,
        name: "Fastest",
        pixelRatio: 1,
        pixels: 2.1e6,
        post: false,
        msaa: 0,
        ao: null,
        shadow: { size: 1024, filter: "pcf", fit: true, reach: 35 },
        anisotropy: 1,
        flora: { density: 0.35, reach: 0.6 },
        lamps: { shadowed: 0, unshadowed: 2, size: 512 },
        garden: { spots: 0, points: 1 },
        people: { most: 4, every: 2, near: 8, farEvery: 4, still: 30 },
        probe: false,
        grade: false,
    },
    {
        step: 1,
        name: "Fast",
        pixelRatio: 1.5,
        pixels: 2.1e6,
        post: false,
        msaa: 0,
        ao: null,
        shadow: { size: 1024, filter: "pcf", fit: true, reach: 50 },
        anisotropy: 2,
        flora: { density: 0.5, reach: 0.7 },
        lamps: { shadowed: 1, unshadowed: 1, size: 512 },
        garden: { spots: 0, points: 1 },
        people: { most: 8, every: 1, near: 10, farEvery: 3, still: 45 },
        probe: false,
        grade: false,
    },
    {
        step: 2,
        name: "Balanced",
        pixelRatio: 1.5,
        pixels: 3.7e6,
        post: true,
        msaa: 2,
        ao: { samples: 8, denoise: 4, halfRes: true },
        shadow: { size: 2048, filter: "soft", fit: true, reach: 60 },
        anisotropy: 4,
        flora: { density: 0.75, reach: 0.85 },
        lamps: { shadowed: 1, unshadowed: 2, size: 512 },
        garden: { spots: 1, points: 1 },
        people: { most: 16, every: 1, near: 12, farEvery: 3, still: 60 },
        probe: false,
        grade: true,
    },
    {
        step: 3,
        name: "High",
        pixelRatio: 2,
        pixels: 5e6,
        post: true,
        msaa: 4,
        ao: { samples: 12, denoise: 6, halfRes: true },
        shadow: { size: 4096, filter: "soft", fit: true, reach: 90, every: 2 },
        anisotropy: 8,
        flora: { density: 1, reach: 1 },
        lamps: { shadowed: 2, unshadowed: 2, size: 512 },
        garden: { spots: 2, points: 2 },
        people: { most: 32, every: 1, near: 15, farEvery: 2, still: 90 },
        probe: true,
        grade: true,
    },
    {
        step: 4,
        name: "Maximum realism",
        pixelRatio: 2,
        pixels: 5e6,
        post: true,
        msaa: 4,
        ao: { samples: 16, denoise: 8, halfRes: true },
        shadow: { size: 8192, filter: "pcss", fit: true, reach: 120, every: 3 },
        anisotropy: 16,
        flora: { density: 1, reach: 1.5 },
        lamps: { shadowed: 2, unshadowed: 4, size: 1024 },
        garden: { spots: 3, points: 2 },
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
/** Most pixels drawn, whatever the window's size. */
export let MAX_PIXELS;
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
 * The highest step this kind of device keeps up with — what it is rated
 * for: a phone or tablet step 1; a computer by its graphics — Apple's Pro,
 * Max and Ultra chips and RTX cards the top step, other Apple silicon and
 * other discrete cards step 3, integrated Intel and AMD graphics step 2, a
 * software renderer step 0.
 */
export function deviceDefaultStep() {
    if (detected !== null) return detected;
    detected = touch ? 1 : ratedByGraphics();
    // Pretended lower (`?rated=`), never higher.
    const pretend = parseStep(pretended);
    if (pretend !== null) detected = Math.min(detected, pretend);
    return detected;
}

/** A computer's step, by the name of its graphics. */
function ratedByGraphics() {
    let name = "";
    try {
        const gl = document.createElement("canvas").getContext("webgl2");
        const info = gl?.getExtension("WEBGL_debug_renderer_info");
        name = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER) || "");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
        name = "";
    }
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) return 0;
    // The top step only where it is known to hold: Apple's Pro, Max and
    // Ultra chips and RTX cards; other discrete cards (laptop MX parts
    // among them) a step lower.
    if (/apple m\d+ (pro|max|ultra)/i.test(name) || /\brtx\b/i.test(name)) return 4;
    if (/nvidia|geforce|quadro|radeon (rx|pro)|radeon\(tm\) rx/i.test(name)) return 3;
    if (/apple/i.test(name)) return 3;
    if (/intel|uhd|iris|radeon\(tm\) graphics|vega/i.test(name)) return 2;
    return 3;
}

/**
 * The highest step this device may be drawn at, whoever asks: the step it
 * is rated for (deviceDefaultStep) — a touch device never above step 1.
 * Above it a frame takes more than the device is expected to keep up
 * with, and a visitor who went there by the slider, or by a link, would
 * stay there on every visit. `?uncapped` in the link lifts it, off a touch
 * device: a developer's tool.
 */
export function stepCeiling() {
    if (uncapped && !touch) return QUALITY_STEPS.length - 1;
    return deviceDefaultStep();
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
 * everyone (its `quality`, "low" or "high"), then the device's own — and
 * never above the device's ceiling (stepCeiling).
 */
export function resolveStep() {
    const step = parseStep(requested) ?? storedStep() ?? parseStep(publishedQuality) ?? deviceDefaultStep();
    return Math.min(step, stepCeiling());
}

/**
 * A step kept on this device from above its ceiling — from before there was
 * one, or from a link that lifted it — brought down to it. Not under a
 * pretended rating (`?rated=`), which is to leave nothing behind: what is
 * kept is capped as it is read, all the same.
 */
function lowerStored() {
    if (parseStep(pretended) !== null) return;
    const stored = storedStep();
    if (stored === null || stored <= stepCeiling()) return;
    try {
        localStorage.setItem(STORAGE_KEY, String(stepCeiling()));
    } catch {
        // Not kept: capped as it is read, all the same.
    }
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
    MAX_PIXELS = QUALITY.pixels;
    SHADOW_MAP_SIZE = LOW_POWER ? 1024 : 2048;
}

/** @param {"auto"|"low"|"high"} quality  what a published version asks for */
export function setQuality(quality = "auto") {
    publishedQuality = quality;
    lowerStored();
    apply(resolveStep());
    LOADED_LOW_POWER = LOW_POWER;
}

/**
 * The slider moved: draw at `step` from now on — or at the device's
 * ceiling, if that is lower (stepCeiling) — kept on this device unless
 * `persist` is false — and tell whatever draws (onQualityChange).
 */
export function setQualityStep(step, { persist = true } = {}) {
    const next = Math.min(parseStep(String(step)) ?? QUALITY_STEP, stepCeiling());
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

/** Where a public view keeps when it last loaded itself again after its graphics came back (guardContextLoss), for this tab. */
const RELOADED_KEY = "view-reloaded-at";

/**
 * If the GPU gives up drawing a public view its visitor is looking at (its
 * context lost), the next visit starts at the lowest step and fully baked
 * (lightingMode's "static") — both kept as the visitor's own choices,
 * theirs to raise again in the menu — and says so once
 * (Utils/viewerChoices.js's lostGraphics): a view too heavy for the device
 * does not fail again on every reload, nor a step lower each time until it
 * stops failing.
 *
 * Anywhere else the loss says less about the view: a browser drops the
 * context of a tab in the background, and of the oldest when too many are
 * open — an editor's tabs, on any machine. There (the editor, and a public
 * view not on show) the next visit starts one step lower, as it always
 * did, and nothing is said or changed of how a public view is lit: the
 * keys are the same browser's for both.
 *
 * And when the context comes back, a public view loads itself again: three
 * draws on with what it can upload again, which is not a view drawn from
 * its bake — its lightmaps' pictures were given back once the GPU had them
 * (Utils/bakedTexture.js), so the house would come back black, and the
 * light meter's reader (Realism.js) was the lost context's. Loaded again,
 * it opens as the keys above say. At most once a minute for a tab, so that
 * graphics that keep failing do not load it round and round.
 *
 * "One step lower" is one under the visitor's own step (`chosen`), not
 * under whatever the view's frame-rate guard (FrameGuard.js) has it drawn
 * at just then, which is not theirs and is never kept.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ publicView?: boolean, chosen?: () => number|undefined }} [options]  `chosen`: the visitor's own step, where something may be drawing the view under it
 */
export function guardContextLoss(canvas, { publicView = false, chosen = null } = {}) {
    canvas.addEventListener("webglcontextlost", () => {
        const tooHeavy = publicView && document.visibilityState === "visible";
        try {
            localStorage.setItem(STORAGE_KEY, String(tooHeavy ? 0 : Math.max(0, (chosen?.() ?? QUALITY_STEP) - 1)));
        } catch {
            // Nothing kept; the device's own step next time.
        }
        if (!tooHeavy) return;
        chooseLighting("static");
        noteLostGraphics();
    });
    if (!publicView) return;
    canvas.addEventListener("webglcontextrestored", () => {
        try {
            const last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
            if (Date.now() - last < 60000) return;
            sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
        } catch {
            // Nowhere to note it: not loaded again, rather than perhaps for ever.
            return;
        }
        window.location.reload();
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
 *
 * By how the page was opened (LOADED_LOW_POWER), not by the step it is
 * drawn at now — like everything else of a view's bake, which needsReloadFor
 * says waits for a reload. The step can go under the line and come back
 * with no reload (the slider; the frame-rate guard, FrameGuard.js, by
 * itself), and what was first fetched meanwhile is kept for the visit: a
 * night's lightmap or a switch's layers fetched at half size while the
 * guard held the view down stayed half size at the top step.
 */
export function lightmapURL(variant) {
    return (LOADED_LOW_POWER && variant.lightmapPhone) || variant.lightmap;
}

/** The colour to go with that lightmap, when it is its brightness alone. */
export function chromaURL(variant) {
    return (LOADED_LOW_POWER && variant.chromaPhone) || variant.chroma || null;
}

/**
 * A variant's lightmap with each room's part held its own way, when the
 * bake wrote one (`rooms`, blender/lib/lightzones.py): what a view that
 * resolves the house's light into one lightmap draws from
 * (World/LightResolver.js), in place of the one-scale lightmap — never
 * both. Null for a bake without one, or with one this build does not
 * know how to open out.
 */
export function roomLightmap(variant) {
    // (`?lightmap=one` in the link: the one-scale lightmap, resolved all the same — to compare the two.)
    if (params.get("lightmap") === "one") return null;
    const rooms = variant?.rooms;
    if (!rooms?.lightmap || !rooms.chroma || !rooms.zones || rooms.encoding !== "log") return null;
    return rooms;
}

/**
 * A switch's layer in a room held its own way, when the bake wrote one
 * beside the layer at the switch's one scale (`own`: blender/
 * bake_public.py's encode_own — a room the switch's light only spills
 * into): what a view that resolves the house's light draws from in its
 * place, never both. Null without one, or with one this build does not
 * know how to open out.
 */
export function ownLayer(layer) {
    if (params.get("lightmap") === "one") return null;
    const own = layer?.own;
    if (!own?.lightmap || !own.chroma || !own.curve || own.encoding !== "log") return null;
    return own;
}

/**
 * Before the scene is built: whether a baked view will most likely draw
 * from those (SceneBuilder.resolvesLight decides, once it has a renderer
 * to try): not lit live, not asked for each room's own materials. What
 * is fetched with the scene goes by it; a device that then cannot resolve
 * the light fetches the one-scale lightmap after all (World.drawLighting).
 */
export function roomLightmapsLikely(lighting) {
    if (!lighting?.zones || !Object.values(lighting.variants ?? {}).every((variant) => roomLightmap(variant))) return false;
    return lightingMode(lighting) !== "live" && !roomLightmaps();
}

/** What a published version asks for (its `lighting` option), and what this visitor picked. */
let publishedLighting = "auto";
let chosenLighting = null;

/**
 * Before the scene is built: how a published version asks to be lit
 * (shared/publishOptions.js's `lighting`: "auto", "phones" or "static"),
 * and how its visitor has asked to see it, from the menu ("static", or
 * null for as published).
 */
export function setLighting(published = "auto", chosen = null) {
    publishedLighting = published;
    chosenLighting = chosen;
}

/**
 * How a baked public view is lit:
 *
 *   - "baked": all of the light from the bake. What moves — the people,
 *     the cars, the doors — still shades the sun in it, where the bake
 *     says how much of the sun's light there is, and is lit by the bake's
 *     light probes; a shut door dims its rooms. What a computer is given.
 *   - "static": all of the light from the bake and nothing drawn live — no
 *     shadow map, no light probes, the doors dimming no room; the lightest
 *     there is. What a phone is given, and any device at the slider's two
 *     lowest steps.
 *   - "live": the sun and the lamps drawn live over the whole house, with
 *     shadows that follow the doors, the people and the car, on top of the
 *     rest of the light — the sky's, and everything bounced — from the
 *     bake. The heaviest by far — a shadow map of the whole house, four
 *     lamps' cube shadows — so never chosen for anyone, nor offered:
 *     `?lighting=live` in the link alone asks for it, to compare, and is
 *     refused on a touch or low-power device.
 *
 * `?lighting=` in the link first; then the visitor's own choice
 * (setLighting), which can only be lighter than they would be given; then
 * the version's: "static" fully baked everywhere — as on a low-power
 * device ("phones", and now "auto" too) — and otherwise "baked".
 *
 * A bake made for a fully static view alone (`only`: "static" —
 * scripts/bake-public.mjs, for a version published "Fully baked") has no
 * door states, light probes, sun masks or light apart: it is drawn static
 * whatever is asked.
 *
 * @param {object} lighting  a published version's baked lighting
 * @returns {"live"|"baked"|"static"}
 */
export function lightingMode(lighting) {
    const asked = params.get("lighting");
    if (lighting?.only === "static") return "static";
    if (asked === "static" || asked === "baked") return asked;
    // Only where the bake has the light apart (blender/bake_public.py's `indirect`).
    if (asked === "live" && lighting?.variants?.day?.indirect && !touch && !LOW_POWER) return "live";
    if (chosenLighting === "static") return "static";
    return givenLighting();
}

/** How a baked view is lit on this device with nobody asking: as its version is published. */
function givenLighting() {
    return publishedLighting === "static" || LOW_POWER ? "static" : "baked";
}

/**
 * What a visitor may pick in the menu besides "as published": only what
 * is lighter than they are given — "static", where that is "baked".
 * Nothing a visitor can pick makes the view heavier.
 *
 * @returns {("static")[]}
 */
export function lighterLighting() {
    return givenLighting() === "baked" ? ["static"] : [];
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

/**
 * Whether a view drawn from its bake keeps each room's own materials — its
 * switches' layers and its doors' light worked out fragment by fragment, as
 * before the house's light was resolved into one lightmap
 * (World/LightResolver.js) — rather than that: `?lightmap=rooms` in the
 * link, to compare the two side by side. A device that cannot draw the
 * resolved lightmap keeps them by itself.
 */
export function roomLightmaps() {
    return params.get("lightmap") === "rooms";
}

/**
 * How a view drawn from its bake makes one mesh of the rooms' meshes that
 * draw alike (World/HouseMerger.js) — or null, each room's kept its own:
 * `?merge=off` in the link, to compare the two side by side. A developer's
 * own besides, comma-separated: a number, the side of the squares of the
 * site they are merged by in metres (`?merge=32`; 0 for no squares); `own`,
 * every named material kept its own, not shared with those that look the
 * same; `tint`, every colour of untextured surface its own material too.
 *
 * @param {number} cell  the squares' side unless the link says another
 * @returns {{ cell: number, share: boolean, tint: boolean }|null}
 */
export function houseMerge(cell) {
    const asked = (params.get("merge") ?? "").split(",").filter(Boolean);
    if (asked.includes("off")) return null;
    const side = asked.map(Number).find((n) => Number.isFinite(n) && n >= 0);
    const share = !asked.includes("own");
    return { cell: side ?? cell, share, tint: share && !asked.includes("tint") };
}

/**
 * Whether a baked view may light the one room its visitor stands in live,
 * when they ask (World/RoomLight.js): a view drawn "baked" (lightingMode) —
 * not one its publisher or its visitor has made fully static, nor one opened
 * at the slider's two lowest steps — on a device rated for the Balanced
 * step or more (stepCeiling), and not one driven by touch. `?roomlight=off`
 * in the link, to compare, leaves it out.
 *
 * @param {object} lighting  a published version's baked lighting
 */
export function roomLightAllowed(lighting) {
    if (touch || stepCeiling() < ROOM_LIGHT_STEP) return false;
    if (roomLightOff()) return false;
    return lightingMode(lighting) === "baked";
}

/** The lowest step of the slider at which a room is lit live. */
export const ROOM_LIGHT_STEP = 2;

/**
 * Why a baked view that would otherwise light a room live does not, for
 * its menu to say — or null where it does, or where it is not to be
 * offered at all (a touch device, one rated under the Balanced step, a
 * version published fully static: nothing to say, nothing to show).
 *
 * @returns {"step"|"chosen"|null}
 */
export function roomLightWithheld(lighting) {
    if (touch || stepCeiling() < ROOM_LIGHT_STEP || publishedLighting === "static" || lighting?.only === "static" || roomLightOff()) return null;
    if (lightingMode(lighting) !== "static") return null;
    if (params.get("lighting") === "static") return null;
    // Their own choice of the menu's "Fastest" — or the slider, at one of its two lowest steps as the view opened.
    return chosenLighting === "static" ? "chosen" : "step";
}

/**
 * A developer's own, in the link, for the room drawn live (World/RoomLight.js):
 * `?roomlight=off` leaves it out of the view, to compare; `?roomlight=on`
 * asks for it as the view opens, which a visitor's never is.
 */
const roomLightAsked = (params.get("roomlight") ?? "").split(",");
const roomLightOff = () => roomLightAsked.includes("off");

/** Whether the link asks for the room drawn live as the view opens (`?roomlight=on`). */
export function roomLightOn() {
    return roomLightAsked.includes("on") && !roomLightOff();
}

/**
 * A developer's own, in the link, for a public view's frame-rate guard
 * (FrameGuard.js): `?guard=off` leaves it out — the view is drawn as its
 * step says however slowly, to time it or to compare —, `?guard=report` has
 * it say in the console what it does and, every few seconds, what it sees.
 *
 * @returns {{ off: boolean, report: boolean }}
 */
export function guardOptions() {
    const asked = (params.get("guard") ?? "").split(",").filter(Boolean);
    return { off: asked.includes("off"), report: asked.includes("report") };
}

/** A variant's sun mask at the size this device should get (as lightmapURL: by how the page was opened). */
export function sunMaskURL(sun) {
    return (LOADED_LOW_POWER && sun.maskPhone) || sun.mask;
}

/** The doors' atlas (the bake's door states) at the size this device should get (likewise). */
export function doorStatesURL(states) {
    return (LOADED_LOW_POWER && states.filePhone) || states.file;
}

/**
 * How many lamps are lit live at once (`?lighting=live`), each with a
 * shadow of its own — six renders of what is round it, whenever something
 * there moves. The rest of the lamps that are on are drawn from the bake.
 */
export const LIVE_LAMPS = 4;
/** A live lamp's shadow map, per side of its cube. */
export const LAMP_SHADOW_SIZE = 512;

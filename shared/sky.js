/**
 * A site's own sky (shared/landscape.js's `sky`) as a light: how strong its
 * sun and its sky are by day and at night, and where its sun is. One
 * description for the two that light with it — the live view
 * (frontend/Experience/World/Sky.js) and the bake (scripts/bake-public.mjs,
 * blender/bake_public.py) — so a baked view is lit as the live one is: the
 * same sun from the same way, the same sky round it.
 *
 * Pure: arrays rather than three's vectors, for node as well as the page.
 */

/**
 * Per variant, as the live view draws it:
 *
 *   sky           which of the space's skies (`day` or `dusk`)
 *   exposure      the view's exposure under it
 *   sun           the sun's strength (a DirectionalLight's intensity, W/m² to Cycles), and its colour
 *   envIntensity  the sky's light (its HDR, the sun clipped out)
 *   outdoor       the share of it outside, where the sun is most of the
 *                 picture — shaded faces 2.3–3.3 times darker than sunlit
 *                 ones, as the developer's renders have them; rooms keep
 *                 all of theirs
 *   background, fog, haze   the sky's picture, and the far ground into its haze
 */
export const SKY_VARIANTS = {
    day: { sky: "day", exposure: 1.3, sun: 3.2, sunColour: "#fff6ea", envIntensity: 1.0, outdoor: 0.3, background: 1, fog: [90, 620], haze: 0.35 },
    // Blue hour, as render 16 has it: the woods and lawns still readable.
    // The dusk's horizon glow lights walls far more than the ground: a
    // third of it outside keeps the façades the render's blue-grey.
    night: { sky: "dusk", exposure: 1.05, sun: 0.0, sunColour: "#9fb4ff", envIntensity: 0.36, outdoor: 0.33, background: 0.65, fog: [50, 420], haze: 0.4 },
};

/** The dusk's light on the walls: blue-violet (render 16's façades, about #393e57). */
export const DUSK_TINT = [0.62, 0.7, 1.15];
/** How much of its colour the dusk's light keeps on the walls (the rest grey). */
export const DUSK_KEEP = 0.25;

/** The sun's size in the sky, in degrees across: a little more than the real 0.53°, for the renders' softer edges. */
export const SUN_ANGLE = 1.1;

const luminance = (data, i) => data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722;

/**
 * The sun in an HDR (RGBA floats, rows from the top of the sky down, as
 * three's RGBELoader reads it): its brightest pixel, as a direction — u
 * round from the back, as three's equirectangular mapping has it — and
 * the brightness over which a pixel is the sun's rather than the sky's,
 * for every pixel brighter than it to be clipped to it, so that the sky's
 * light is the sky's alone and the sun's is the sun's.
 *
 * With `clip`, clips `data` in place too.
 *
 * And how much of the sky's light, so clipped, comes from above the
 * horizon (`above`, 0–1): all that reaches a wall in the bake, past the
 * ground and the houses, where the live view's light, which knows nothing
 * of either, comes from all round.
 *
 * @returns {{ direction: number[], ceiling: number, above: number }}
 */
export function findSun({ data, width, height }, { clip = true } = {}) {
    let best = 0;
    let at = 0;
    for (let i = 0; i < width * height; i++) {
        const l = luminance(data, i);
        if (l > best) {
            best = l;
            at = i;
        }
    }
    // The sky's own brightness: the 99th percentile, roughly, of the upper half.
    const samples = [];
    for (let i = 0; i < (width * height) / 2; i += 37) samples.push(luminance(data, i));
    samples.sort((a, b) => a - b);
    const ceiling = Math.max(samples[Math.floor(samples.length * 0.995)] * 1.5, 0.5);
    if (clip) {
        for (let i = 0; i < width * height; i++) {
            const l = luminance(data, i);
            if (l > ceiling) {
                const k = ceiling / l;
                data[i * 4] *= k;
                data[i * 4 + 1] *= k;
                data[i * 4 + 2] *= k;
            }
        }
    }
    // Each row's pixels by the solid angle they cover (cos of their latitude).
    let up = 0;
    let all = 0;
    for (let row = 0; row < height; row++) {
        const latitude = (0.5 - (row + 0.5) / height) * Math.PI;
        let sum = 0;
        for (let col = 0; col < width; col++) sum += Math.min(luminance(data, row * width + col), ceiling);
        sum *= Math.cos(latitude);
        all += sum;
        if (latitude > 0) up += sum;
    }
    const above = all > 0 ? up / all : 1;
    const u = ((at % width) + 0.5) / width;
    const v = 1 - (Math.floor(at / width) + 0.5) / height;
    const latitude = (v - 0.5) * Math.PI;
    const phi = (u - 0.5) * 2 * Math.PI;
    const direction = [Math.cos(phi) * Math.cos(latitude), Math.sin(latitude), Math.sin(phi) * Math.cos(latitude)];
    const length = Math.hypot(...direction);
    return { direction: direction.map((c) => c / length), ceiling, above };
}

/**
 * Where the sun shines from (a unit vector, y up), given where it is in
 * the HDR (findSun): turned with the sky `turn` degrees about the upright,
 * and by day set `elevation` degrees high when the space asks for it (an
 * afternoon's long light into the rooms, under the same sky).
 */
export function sunDirection(direction, { turn = 0, elevation = null } = {}, variant = "day") {
    const t = (turn * Math.PI) / 180;
    // About +Y, as three's applyAxisAngle turns it: +X towards -Z.
    const [x0, y0, z0] = direction;
    let way = [x0 * Math.cos(t) + z0 * Math.sin(t), y0, -x0 * Math.sin(t) + z0 * Math.cos(t)];
    if (Number.isFinite(elevation) && variant === "day") {
        const e = (elevation * Math.PI) / 180;
        const level = Math.hypot(way[0], way[2]) || 1;
        const across = Math.cos(e) / level;
        way = [way[0] * across, Math.sin(e), way[2] * across];
    }
    return way;
}

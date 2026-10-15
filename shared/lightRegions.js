/**
 * Each room's own part of a baked lightmap's atlas — the texels its faces
 * are drawn from and those beside them that they blend in — worked out
 * from the bake's `zones` (each room's rectangle of the atlas) alike by
 * whatever must agree on it, texel for texel:
 *
 *   - the public view, which draws the house's light room by room into one
 *     lightmap (frontend/Experience/World/LightResolver.js);
 *   - the bake, which writes each room's part with a scale of its own
 *     (blender/lib/lightzones.py's `regions`, this function over again in
 *     Python: scripts/test-light-regions.mjs holds the two against each
 *     other).
 *
 * A change here is a change to how every published bake is drawn, and to
 * what the next bake writes: change the Python with it.
 */

/** How far beyond its rectangle of the atlas a room's part may reach, in texels of the brightness — never further than halfway to the next room. */
export const REACH = 8;
/** The least share of a texel beside its rectangle that a room's face must blend in for the texel to count as the room's own. */
export const SLACK = 0.01;

/**
 * Each room's own part of the atlas, for a lightmap `size` texels square —
 * from the bake's `zones` (each room's rectangle, [u, v, width, height],
 * v up). A face at the edge of its room's rectangle blends in the texel
 * whose middle lies next beyond that edge, so that one is the room's own —
 * for which there must be two texels between two rooms' rectangles (the
 * bake leaves four at 4096 at the least, two in a phone's copy); and each
 * part reaches on from there, REACH texels at most, as far as halfway to
 * the next room: the texels between two rooms, which the coarser mipmaps
 * blend into both, are each the nearer room's.
 *
 * The brightness and the colour, at half the size, are laid out each in
 * its own texels: `luma` [x0, y0, x1, y1] in texels of the brightness,
 * `chroma` in texels of the colour — rows from the top, as the files have
 * them. Where only two texels of the brightness part two rooms, one texel
 * of the colour is blended in by both: it is the nearer room's. `outer`
 * takes both in, in texels of the brightness on whole texels of the colour.
 *
 * Null if two rooms' rectangles lie too close for each to have the texels
 * its own faces blend in.
 *
 * @returns {Map<string, { luma: number[], chroma: number[], outer: number[] }>|null}
 */
export function lightRegions(zones, size) {
    const rooms = Object.entries(zones || {}).map(([id, [u, v, w, h]]) => ({ id, box: [u * size, (1 - v - h) * size, (u + w) * size, (1 - v) * size] }));
    const clash = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    // One of the two, `k` texels to a texel of the brightness and `side` of them across.
    const lay = (k, side) => {
        const reach = REACH * k;
        const parts = rooms.map(({ box }) => {
            const edge = box.map((value) => value * k);
            const need = [
                Math.max(0, Math.floor(edge[0] - 0.5 + SLACK)),
                Math.max(0, Math.floor(edge[1] - 0.5 + SLACK)),
                Math.min(side, Math.floor(edge[2] + 0.5 - SLACK) + 1),
                Math.min(side, Math.floor(edge[3] + 0.5 - SLACK) + 1),
            ];
            return { edge, need, rect: [Math.max(0, need[0] - reach), Math.max(0, need[1] - reach), Math.min(side, need[2] + reach), Math.min(side, need[3] + reach)] };
        });
        // Two parts that meet are cut where the rooms are as far from each other — the nearest rooms first.
        const pairs = [];
        for (let i = 0; i < parts.length; i++) {
            for (let j = i + 1; j < parts.length; j++) {
                const a = parts[i].edge;
                const b = parts[j].edge;
                const apart = [Math.max(b[0] - a[2], a[0] - b[2]), Math.max(b[1] - a[3], a[1] - b[3])];
                const axis = apart[0] >= apart[1] ? 0 : 1;
                if (apart[axis] < 0) return null;
                if (clash(parts[i].rect, parts[j].rect)) pairs.push({ a: parts[i], b: parts[j], axis, apart: apart[axis] });
            }
        }
        pairs.sort((p, q) => p.apart - q.apart);
        for (const { a, b, axis } of pairs) {
            if (!clash(a.rect, b.rect)) continue;
            const [low, high] = a.edge[axis] <= b.edge[axis] ? [a, b] : [b, a];
            // The texels whose middles are on the lower room's side of halfway are its own.
            const cut = Math.floor((low.edge[axis + 2] + high.edge[axis]) / 2 - 0.5) + 1;
            low.rect[axis + 2] = Math.min(low.rect[axis + 2], cut);
            high.rect[axis] = Math.max(high.rect[axis], cut);
        }
        return parts;
    };
    const luma = lay(1, size);
    const chroma = lay(0.5, size / 2);
    if (!luma || !chroma) return null;
    // Every room the brightness its own faces blend in, and some of the colour.
    if (luma.some(({ need, rect }) => rect[0] > need[0] || rect[1] > need[1] || rect[2] < need[2] || rect[3] < need[3])) return null;
    if (chroma.some(({ rect }) => rect[0] >= rect[2] || rect[1] >= rect[3])) return null;
    return new Map(
        rooms.map(({ id }, i) => {
            const l = luma[i].rect;
            const c = chroma[i].rect;
            const outer = [Math.min(c[0], Math.floor(l[0] / 2)) * 2, Math.min(c[1], Math.floor(l[1] / 2)) * 2, Math.max(c[2], Math.ceil(l[2] / 2)) * 2, Math.max(c[3], Math.ceil(l[3] / 2)) * 2];
            return [id, { luma: l, chroma: c, outer }];
        })
    );
}

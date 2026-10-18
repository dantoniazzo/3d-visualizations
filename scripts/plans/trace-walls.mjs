/**
 * Walls off a floor-plan image: the thick dark bands an architectural plan
 * draws its walls as, traced into axis-aligned rectangles — and, joined
 * along their lines, into wall runs with the gaps in them (doors, windows).
 * A first draft of a building's walls, to check against the plan and
 * correct by hand (slanted walls, which it does not trace, among them):
 * see .claude/skills/build-property-space/research-and-plans.md (Measure the
 * plans).
 *
 *   node scripts/plans/trace-walls.mjs <plan.png> <px-per-metre> <out-prefix>
 *        [--dark 135] [--min 3] [--crop x0,y0,x1,y1]
 *
 * Writes <out-prefix>.json — rectangles and runs in plan pixels and in
 * metres (x right, y down, from the crop's corner) — and <out-prefix>.jpg,
 * the plan with what it found drawn over it: rectangles red, runs' gaps
 * green.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const sharp = createRequire(import.meta.url)("sharp");

const [input, pxArg, out, ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : fallback;
};
const PX = Number(pxArg);
const DARK = Number(option("dark", 135));
/** Thinner than this many pixels is a drawn line, not a wall. */
const MIN = Number(option("min", 3));
const crop = option("crop", null)?.split(",").map(Number);

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const [cx0, cy0, cx1, cy1] = crop ?? [0, 0, info.width, info.height];
const W = cx1 - cx0;
const H = cy1 - cy0;

// Dark enough to be wall: its border lines and its hatching.
let mask = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const k = ((y + cy0) * info.width + x + cx0) * info.channels;
        const l = (data[k] + data[k + 1] + data[k + 2]) / 3;
        mask[y * W + x] = l < DARK ? 1 : 0;
    }
}

/** Morphology with a square of radius r: dilate (max) or erode (min). */
function morph(src, r, dilate) {
    const tmp = new Uint8Array(W * H);
    const dst = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let v = dilate ? 0 : 1;
            for (let d = -r; d <= r; d++) {
                const xx = x + d;
                const s = xx < 0 || xx >= W ? 0 : src[y * W + xx];
                v = dilate ? Math.max(v, s) : Math.min(v, s);
            }
            tmp[y * W + x] = v;
        }
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let v = dilate ? 0 : 1;
            for (let d = -r; d <= r; d++) {
                const yy = y + d;
                const s = yy < 0 || yy >= H ? 0 : tmp[yy * W + x];
                v = dilate ? Math.max(v, s) : Math.min(v, s);
            }
            dst[y * W + x] = v;
        }
    }
    return dst;
}

// Close the hatching's gaps, then open away the thin lines.
mask = morph(morph(mask, 1, true), 1, false);
const r = Math.floor(MIN / 2);
mask = morph(morph(mask, r, false), r, true);

// Greedy rectangles: the widest run from each unclaimed pixel, grown down
// while every pixel under it is wall.
const used = new Uint8Array(W * H);
const rects = [];
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        if (!mask[y * W + x] || used[y * W + x]) continue;
        let x1 = x;
        while (x1 + 1 < W && mask[y * W + x1 + 1] && !used[y * W + x1 + 1]) x1++;
        let y1 = y;
        grow: while (y1 + 1 < H) {
            for (let xx = x; xx <= x1; xx++) if (!mask[(y1 + 1) * W + xx] || used[(y1 + 1) * W + xx]) break grow;
            y1++;
        }
        for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[yy * W + xx] = 1;
        const w = x1 - x + 1;
        const h = y1 - y + 1;
        if (Math.min(w, h) < MIN || Math.max(w, h) < MIN * 2) continue;
        rects.push({ x, y, w, h });
    }
}

// Runs: rectangles on one line — same orientation, same middle within a
// couple of pixels, same thickness within a few — joined end to end, the
// gaps between them kept as openings.
const lines = [];
for (const rect of rects) {
    const horizontal = rect.w >= rect.h;
    const mid = horizontal ? rect.y + rect.h / 2 : rect.x + rect.w / 2;
    const thick = horizontal ? rect.h : rect.w;
    const [a, b] = horizontal ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
    let line = lines.find((l) => l.horizontal === horizontal && Math.abs(l.mid - mid) <= 2.5 && Math.abs(l.thick - thick) <= 4);
    if (!line) lines.push((line = { horizontal, mid, thick, pieces: [] }));
    line.pieces.push([a, b]);
}
const runs = [];
for (const line of lines) {
    line.pieces.sort((p, q) => p[0] - q[0]);
    let current = null;
    for (const [a, b] of line.pieces) {
        // A gap wider than 3.6 m is two walls, not one wall with an opening.
        if (current && a - current.to <= 3.6 * PX) {
            if (a > current.to + 1) current.gaps.push([current.to, a]);
            current.to = Math.max(current.to, b);
        } else {
            if (current) runs.push(current);
            current = { horizontal: line.horizontal, mid: line.mid, thick: line.thick, from: a, to: b, gaps: [] };
        }
    }
    if (current) runs.push(current);
}
const metres = (v) => Math.round((v / PX) * 1000) / 1000;
const result = {
    source: input,
    pxPerMetre: PX,
    crop: [cx0, cy0, cx1, cy1],
    runs: runs
        .filter((run) => run.to - run.from >= MIN * 3)
        .map((run) => ({
            horizontal: run.horizontal,
            px: { mid: run.mid, from: run.from, to: run.to, thick: run.thick, gaps: run.gaps },
            m: { mid: metres(run.mid), from: metres(run.from), to: metres(run.to), thick: metres(run.thick), gaps: run.gaps.map(([a, b]) => [metres(a), metres(b)]) },
        })),
};
writeFileSync(`${out}.json`, JSON.stringify(result, null, 1));

// The overlay.
const k = 2;
let svg = `<svg width="${W * k}" height="${H * k}" xmlns="http://www.w3.org/2000/svg">`;
for (const rect of rects) svg += `<rect x="${rect.x * k}" y="${rect.y * k}" width="${rect.w * k}" height="${rect.h * k}" fill="rgba(255,0,0,0.35)" stroke="red" stroke-width="1"/>`;
result.runs.forEach((run, i) => {
    const { mid, from, to, gaps } = run.px;
    for (const [a, b] of gaps) {
        svg += run.horizontal
            ? `<line x1="${a * k}" y1="${mid * k}" x2="${b * k}" y2="${mid * k}" stroke="lime" stroke-width="4"/>`
            : `<line x1="${mid * k}" y1="${a * k}" x2="${mid * k}" y2="${b * k}" stroke="lime" stroke-width="4"/>`;
    }
    const [tx, ty] = run.horizontal ? [from * k, mid * k - 3] : [mid * k + 3, from * k + 10];
    svg += `<text x="${tx}" y="${ty}" font-size="11" fill="blue" font-family="sans-serif">${i}</text>`;
});
svg += "</svg>";
await sharp(input)
    .extract({ left: cx0, top: cy0, width: W, height: H })
    .resize(W * k, H * k)
    .flatten({ background: "#fff" })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toFile(`${out}.jpg`);
console.log(`${out}.json: ${rects.length} rectangles, ${result.runs.length} runs`);

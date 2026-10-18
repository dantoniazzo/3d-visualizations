// Side-by-side frames, one row per view, one column per source, each tile
// labelled with its mean luminance (0.2126 R + 0.7152 G + 0.0722 B, 0–255):
//
//   node .claude/skills/app-testing-and-performance/compare.mjs <out.jpg> <column> [<column> …] -- <key> [<key> …]
//
// A column is a path with {k} where the view's key goes, e.g.
//   node .claude/skills/app-testing-and-performance/compare.mjs <scratch>/frames/cmp.jpg \
//       "<scratch>/ladonia/gallery/{k}.jpg" "<scratch>/frames/lv-{k}.jpg" "<scratch>/frames/fin-{k}.jpg" \
//       -- 17 18 19 20 21
// for render | live | baked. Prints the luminance table as JSON too. Run from
// the repo (sharp from its node_modules). Tiles are 520 × 293, cropped to fill.
import sharp from "sharp";

const args = process.argv.slice(2);
const split = args.indexOf("--");
if (split < 2 || split === args.length - 1) {
    console.error("Usage: node compare.mjs <out.jpg> <column with {k}> [...] -- <key> [...]");
    process.exit(1);
}
const [out, ...columns] = args.slice(0, split);
const keys = args.slice(split + 1);
const W = 520;
const H = 293;

const luminance = async (file) => {
    const { data } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 3 * 7) {
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
    }
    return Math.round(sum / n);
};

const tiles = [];
const table = {};
for (const [row, key] of keys.entries()) {
    for (const [column, pattern] of columns.entries()) {
        const file = pattern.replaceAll("{k}", key);
        let tile;
        try {
            const lum = await luminance(file);
            (table[key] ??= []).push(lum);
            const name = file.split("/").pop();
            const label = Buffer.from(
                `<svg width="${W}" height="20"><rect width="100%" height="100%" fill="#000" opacity="0.55"/>` +
                    `<text x="6" y="14" font-size="12" fill="#fff" font-family="sans-serif">${name}  ${lum}</text></svg>`
            );
            tile = await sharp(file).resize(W, H, { fit: "cover" }).composite([{ input: label, top: 0, left: 0 }]).toBuffer();
        } catch {
            (table[key] ??= []).push(null);
            tile = await sharp({ create: { width: W, height: H, channels: 3, background: "#300" } }).jpeg().toBuffer();
        }
        tiles.push({ input: tile, left: column * W, top: row * H });
    }
}
await sharp({ create: { width: columns.length * W, height: keys.length * H, channels: 3, background: "#111" } })
    .composite(tiles)
    .jpeg({ quality: 82 })
    .toFile(out);
console.log(JSON.stringify(table));

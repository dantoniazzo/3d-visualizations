// Listing render above our frame, one image per reference, to compare a
// view by eye (not blind: prep_review.mjs makes the blind X/Y pairs for
// critics). Each half is cropped to fill 960 x 540 (16:9), the listing's on
// top; our frame keeps its 16 px label bar, so the pair says which frame it is.
//
//   node <skill>/models/pair.mjs <gallery-dir> <frames-dir> <prefix> <out-dir> <key> [key ...]
//        [--width 960]
//
// Reads <gallery-dir>/<key>.jpg (or .jpeg, .png, .webp) and
// <frames-dir>/<prefix><key>.jpg (the sink's frames from __renderSet), and
// writes <out-dir>/pair-<prefix><key>.jpg. A key missing on either side is
// skipped and named. Example (Ladonia): node <skill>/models/pair.mjs
// <scratch>/ladonia/gallery <scratch>/frames r5- <scratch>/pairs 17 18 19 20 21
// sharp comes from the repo (four folders up, or $REPO).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const sharp = createRequire(process.env.REPO ? `${process.env.REPO}/` : new URL("../../../../", import.meta.url))("sharp");
const args = process.argv.slice(2);
let W = 960;
const wi = args.indexOf("--width");
if (wi >= 0) {
    W = Number(args[wi + 1]);
    args.splice(wi, 2);
}
const [gallery, frames, prefix, out, ...keys] = args;
if (!gallery || !frames || prefix === undefined || !out || !keys.length) {
    console.error("usage: node pair.mjs <gallery-dir> <frames-dir> <prefix> <out-dir> <key> [key ...] [--width 960]");
    process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const H = Math.round((W * 9) / 16);
const find = (dir, name, exts) => exts.map((e) => path.join(dir, name + e)).find((f) => fs.existsSync(f));
let made = 0;
const missing = [];
for (const k of keys) {
    const ref = find(gallery, k, [".jpg", ".jpeg", ".png", ".webp"]);
    const ours = find(frames, `${prefix}${k}`, [".jpg", ".jpeg", ".png"]);
    if (!ref || !ours) {
        missing.push(`${k} (${ref ? "" : "listing "}${!ref && !ours ? "and " : ""}${ours ? "" : "frame"})`);
        continue;
    }
    const a = await sharp(ref).resize(W, H, { fit: "cover" }).toBuffer();
    const b = await sharp(ours).resize(W, H, { fit: "cover" }).toBuffer();
    const file = path.join(out, `pair-${prefix}${k}.jpg`);
    await sharp({ create: { width: W, height: H * 2 + 4, channels: 3, background: "#111" } })
        .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 0, top: H + 4 }])
        .jpeg({ quality: 82 }).toFile(file);
    console.log(`  ${file}`);
    made++;
}
if (missing.length) console.log(`  missing: ${missing.join(", ")}`);
console.log(`VERDICT ${missing.length ? "WARN" : "OK"}: ${made} pair(s) in ${out}${missing.length ? `, ${missing.length} skipped` : ""}`);

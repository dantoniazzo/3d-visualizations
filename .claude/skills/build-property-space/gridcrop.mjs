// node gridcrop.mjs <plan.png> <out.jpg> <pxPerM> <ox> <oy> <x0> <z0> <x1> <z1> [scale]
import { createRequire } from "node:module"; const sharp = createRequire(process.env.REPO ? `${process.env.REPO}/` : new URL("../../../", import.meta.url))("sharp"); // the repo: three folders up, or $REPO
const [src, out, ppm, ox, oy, x0, z0, x1, z1, sc = 4] = process.argv.slice(2).map((v, i) => (i < 2 ? v : +v));
const L = Math.round(ox + x0 * ppm), T = Math.round(oy + z0 * ppm);
const W = Math.round((x1 - x0) * ppm), H = Math.round((z1 - z0) * ppm);
const img = await sharp(src).flatten({ background: "#fff" }).extract({ left: L, top: T, width: W, height: H }).resize(W * sc, H * sc, { kernel: "lanczos3" }).toBuffer();
let svg = `<svg width="${W * sc}" height="${H * sc}" xmlns="http://www.w3.org/2000/svg">`;
for (let x = Math.ceil(x0 * 2) / 2; x <= x1; x += 0.5) { const px = ((x - x0) * ppm) * sc; const major = Math.abs(x - Math.round(x)) < 1e-6; svg += `<line x1="${px}" y1="0" x2="${px}" y2="${H * sc}" stroke="${major ? "red" : "#f99"}" stroke-width="${major ? 1.2 : 0.5}"/>`; if (major) svg += `<text x="${px + 2}" y="12" font-size="12" fill="red">${x}</text>`; }
for (let z = Math.ceil(z0 * 2) / 2; z <= z1; z += 0.5) { const py = ((z - z0) * ppm) * sc; const major = Math.abs(z - Math.round(z)) < 1e-6; svg += `<line x1="0" y1="${py}" x2="${W * sc}" y2="${py}" stroke="${major ? "blue" : "#99f"}" stroke-width="${major ? 1.2 : 0.5}"/>`; if (major) svg += `<text x="2" y="${py - 2}" font-size="12" fill="blue">${z}</text>`; }
svg += "</svg>";
await sharp(img).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88 }).toFile(out);
console.log(out, W * sc, H * sc);

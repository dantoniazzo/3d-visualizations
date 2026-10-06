// One review sheet per piece from views.py's renders: the views two to a row,
// each under a label bar "<id> — <view>", as <sheets-dir>/<id>.jpg.
//
//   node <skill>/models/sheet.mjs <views-dir> <sheets-dir> [id ...]
//
// <views-dir> is views.py's out-dir (<views-dir>/<id>/<view>.png). Without ids
// every piece there gets a sheet. Views are laid out front, side, left, top,
// plan, back — whichever exist. sharp comes from the repo (four folders up, or
// $REPO).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const sharp = createRequire(process.env.REPO ? `${process.env.REPO}/` : new URL("../../../../", import.meta.url))("sharp");
const [viewsDir, sheetsDir, ...only] = process.argv.slice(2);
if (!viewsDir || !sheetsDir) {
    console.error("usage: node sheet.mjs <views-dir> <sheets-dir> [id ...]");
    process.exit(2);
}
fs.mkdirSync(sheetsDir, { recursive: true });
const ORDER = ["front", "side", "left", "top", "plan", "back"];
const BAR = 24;
const ids = only.length ? only : fs.readdirSync(viewsDir).filter((d) => fs.statSync(path.join(viewsDir, d)).isDirectory());
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
let made = 0;
for (const id of ids) {
    const names = ORDER.filter((n) => fs.existsSync(path.join(viewsDir, id, `${n}.png`)));
    if (!names.length) {
        console.log(`  ${id}: no views`);
        continue;
    }
    const { width: W, height: H } = await sharp(path.join(viewsDir, id, `${names[0]}.png`)).metadata();
    const cols = names.length === 1 ? 1 : 2;
    const rows = Math.ceil(names.length / cols);
    const layers = [];
    names.forEach((n, i) => {
        const x = (i % cols) * W;
        const y = Math.floor(i / cols) * (H + BAR);
        const bar = `<svg width="${W}" height="${BAR}"><rect width="100%" height="100%" fill="#222"/>` +
            `<text x="6" y="17" font-family="Helvetica" font-size="15" fill="#fff">${esc(id)} — ${n}</text></svg>`;
        layers.push({ input: Buffer.from(bar), left: x, top: y });
        layers.push({ input: path.join(viewsDir, id, `${n}.png`), left: x, top: y + BAR });
    });
    const out = path.join(sheetsDir, `${id}.jpg`);
    await sharp({ create: { width: W * cols, height: (H + BAR) * rows, channels: 3, background: "#111" } })
        .composite(layers).jpeg({ quality: 85 }).toFile(out);
    console.log(`  ${out}  (${names.join(", ")})`);
    made++;
}
console.log(`VERDICT ${made ? "OK" : "WARN"}: ${made} sheet(s) in ${sheetsDir}`);

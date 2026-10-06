// node prep_review.mjs <round> : blind X/Y pairs per reference into review/<round>/
import { createRequire } from "node:module"; const sharp = createRequire(process.env.REPO ? `${process.env.REPO}/` : new URL("../../../", import.meta.url))("sharp"); // the repo: three folders up, or $REPO
import fs from "node:fs";
const round = process.argv[2];
const prefix = process.argv[3] || "r0-";
const out = `review/${round}`; fs.mkdirSync(out, { recursive: true });
const map = {};
for (const k of ["10","11","12","13","14","15","16","17","18","19","20","21","22"]) {
  const cand = `frames/${prefix}${k}.jpg`; if (!fs.existsSync(cand)) continue;
  const ref = await sharp(`ladonia/gallery/${k}.jpg`).resize(1600, 900, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  const m = await sharp(cand).metadata();
  const ours = await sharp(cand).extract({ left: 0, top: 16, width: m.width, height: m.height - 16 }).resize(1600, 900, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
  const flip = Math.random() < 0.5;
  fs.writeFileSync(`${out}/${k}-X.jpg`, flip ? ours : ref);
  fs.writeFileSync(`${out}/${k}-Y.jpg`, flip ? ref : ours);
  map[k] = flip ? "X=ours" : "Y=ours";
}
fs.writeFileSync(`review/${round}.key.json`, JSON.stringify(map, null, 1));
console.log(Object.keys(map).length, "pairs");

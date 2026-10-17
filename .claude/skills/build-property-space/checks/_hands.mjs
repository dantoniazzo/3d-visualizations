// _hands.mjs: each opening part of a GLB — its label, its box shut (the app's x, y, z in the piece's frame), the edge it
// hangs on and which way it swings, or where it slides — grouped by height and sorted along x, so a run's hands read left
// to right as the piece faces north (−z) at rotation 0, its own −X on the left (app-notes.md, Furniture: opening parts).
// Read-only.
//   node <skill>/checks/_hands.mjs <glb | catalog-id> ...
// A catalogue id is looked up in the repo's public/models/furniture/catalog.json (the repo four folders above this file,
// or REPO=<dir>).
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
let catalog = null;
const pathOf = (ref) => {
    if (existsSync(ref)) return ref;
    catalog ??= JSON.parse(readFileSync(join(ROOT, "public/models/furniture/catalog.json"), "utf8"));
    const item = catalog.items.find((i) => i.id === ref);
    if (!item) throw new Error(`${ref}: not a file, nor in the catalogue`);
    return join(ROOT, "public", item.url);
};
if (process.argv.length < 3) {
    console.error("usage: node _hands.mjs <glb | catalog-id> ...");
    process.exit(2);
}
for (const ref of process.argv.slice(2)) {
    const file = pathOf(ref);
    const buf = readFileSync(file);
    const g = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString());
    const rows = [];
    for (const n of g.nodes) {
        const o = n.extras?.opens;
        if (!o || n.mesh == null) continue;
        const [tx, ty, tz] = n.translation ?? [0, 0, 0];
        const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (const p of g.meshes[n.mesh].primitives) {
            const a = g.accessors[p.attributes.POSITION];
            for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); }
        }
        // Children (none expected) ignored. Box in the piece frame, shut:
        const box = { x0: tx + mn[0], x1: tx + mx[0], y0: ty + mn[1], y1: ty + mx[1], z0: tz + mn[2], z1: tz + mx[2] };
        let how;
        if (o.type === "slide") how = `slides ${o.distance} m ${JSON.stringify(o.direction)}`;
        else {
            // The leaf runs from its hinge to +x (hung on its -X edge) or to -x.
            const side = Math.abs(mx[0]) > Math.abs(mn[0]) ? "-X" : "+X";
            how = `hangs on its ${side} edge, swings ${o.angle > 0 ? "+" : "-"}${Math.round((Math.abs(o.angle) * 180) / Math.PI)} deg`;
        }
        rows.push({ name: n.name.replace(/^.*\./, ""), label: o.label ?? "-", box, how });
    }
    rows.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
    console.log(`\n${basename(file, ".glb")}: ${rows.length} parts`);
    for (const r of rows) {
        const b = r.box;
        console.log(`  ${r.name.padEnd(9)} ${r.label.padEnd(7)} x ${b.x0.toFixed(3)}..${b.x1.toFixed(3)}  y ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}  z ${b.z0.toFixed(2)}..${b.z1.toFixed(2)}  ${r.how}`);
    }
}

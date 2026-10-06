// Building C's plan as c.js lays it out, in C's own frame: walls (start, end, thickness,
// base+height, openings), rooms (elevation, name, polygon), stairs and floor openings.
//   node _plan.mjs [generator-dir]   default: the repo's scripts/spaces/ladonia
// The repo is four directories above this file (or REPO=<dir>).
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const dir = resolve(process.argv[2] ?? join(REPO, "scripts/spaces/ladonia"));
const { buildingC } = await import(`${dir}/c.js`);
const b = buildingC("c", [0, 0], {});
const r2 = (n) => Math.round(n * 100) / 100;
for (const w of b.out.walls) {
  if (w.base_height > 6.3 && !/box|void/.test(w.id)) continue;
  const op = w.openings.map(o => `${o.type}${o.door?.swing ? "/" + o.door.swing : ""}@${r2(o.offset - o.width/2)}..${r2(o.offset + o.width/2)}${o.sill ? ` sill${o.sill}` : ""}`).join(" ");
  console.log(w.id.padEnd(18), JSON.stringify(w.start), "→", JSON.stringify(w.end), `t${w.thickness} ${w.base_height}+${r2(w.height)}`, op);
}
for (const r of b.out.rooms) console.log(r.id.padEnd(16), r.elevation, r.name.padEnd(32), JSON.stringify(r.polygon));
for (const s of b.out.stairs) console.log(JSON.stringify(s));
for (const h of b.out.floor_openings) console.log(JSON.stringify(h));

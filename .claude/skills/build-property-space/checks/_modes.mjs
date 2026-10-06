// How the game collides with catalogue pieces: triangle count, opening parts, catalogue
// `collision`, and the resulting mode (box when it opens or has more triangles than SceneBuilder.MESH_COLLISION_BUDGET, 12000; else mesh).
//   node _modes.mjs <catalog-id> [<catalog-id> ...]
// The repo is four directories above this file (or REPO=<dir>).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const cat = JSON.parse(readFileSync(ROOT + "/public/models/furniture/catalog.json", "utf8"));
for (const id of process.argv.slice(2)) {
  const it = cat.items.find((i) => i.id === id);
  if (!it) { console.log(id.padEnd(24), "not in the catalogue"); continue; }
  const buf = readFileSync(ROOT + "/public" + it.url);
  const g = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString());
  let tris = 0; let opens = false;
  for (const n of g.nodes) { if (n.extras?.opens) opens = true; if (n.mesh != null) for (const p of g.meshes[n.mesh].primitives) tris += (p.indices != null ? g.accessors[p.indices].count : g.accessors[p.attributes.POSITION].count) / 3; }
  console.log(id.padEnd(24), "tris", tris, "opens", opens, "collision", it.collision ?? "-", "=>", it.collision ?? (opens || tris > 12000 ? "box" : "mesh"));
}

// How the game collides with catalogue pieces, by SceneBuilder.collisionOf's rule (since 2026-10-16): the triangles
// WITHOUT the parts that open (nodes with `opens` extras, and everything under them), catalogue `collision`, and the
// resulting mode — catalogue `collision`, else box over SceneBuilder.MESH_COLLISION_BUDGET (12000), else mesh. A mesh
// piece with opening parts is also met as one box per part where it stands shut ("+ N shut boxes"), except a way in
// (label "shower door": Openables.js's isWayIn), which bars the way itself while shut (Openable.getBlockers).
//   node _modes.mjs <catalog-id> [<catalog-id> ...]
// The repo is four directories above this file (or REPO=<dir>).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const cat = JSON.parse(readFileSync(ROOT + "/public/models/furniture/catalog.json", "utf8"));
const BUDGET = 12000;
const WAYS_IN = new Set(["shower door"]);
for (const id of process.argv.slice(2)) {
  const it = cat.items.find((i) => i.id === id);
  if (!it) { console.log(id.padEnd(24), "not in the catalogue"); continue; }
  const buf = readFileSync(ROOT + "/public" + it.url);
  const g = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString());
  const trisOf = (n) => (n.mesh == null ? 0 : g.meshes[n.mesh].primitives.reduce((sum, p) => sum + (p.indices != null ? g.accessors[p.indices].count : g.accessors[p.attributes.POSITION].count) / 3, 0));
  let tris = 0; let parts = 0; let waysIn = 0;
  const walk = (index, inPart) => {
    const n = g.nodes[index];
    const opens = n.extras?.opens;
    if (opens && !inPart) {
      if (WAYS_IN.has(String(opens.label ?? "").trim().toLowerCase())) waysIn++;
      else parts++;
    }
    if (!opens && !inPart) tris += trisOf(n);
    for (const child of n.children ?? []) walk(child, inPart || Boolean(opens));
  };
  for (const root of g.scenes[g.scene ?? 0].nodes) walk(root, false);
  const mode = it.collision ?? (tris > BUDGET ? "box" : "mesh");
  const extra = mode === "mesh" && (parts || waysIn) ? ` + ${parts} shut boxes${waysIn ? ` + ${waysIn} way(s) in` : ""}` : "";
  console.log(id.padEnd(24), "tris without parts", tris, "parts", parts + waysIn, "collision", it.collision ?? "-", "=>", mode + extra);
}

// Bounding box of each GLB's POSITION accessors (with node transforms ignored if none) for C's pieces.
//   node _glbbox.mjs     every catalogue item used by a "c-" piece in scenes/kosinozici-villas.json:
//                        catalogue size and yaw vs the GLB's real min/max (node transforms applied)
// The repo is four directories above this file (or REPO=<dir>).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const cat = JSON.parse(readFileSync(root + "/public/models/furniture/catalog.json", "utf8"));
const scene = JSON.parse(readFileSync(root + "/scenes/kosinozici-villas.json", "utf8")).scene;
const ids = new Set(scene.furniture.filter((f) => f.id.startsWith("c-")).map((f) => f.catalog_id));
function mat4mul(a, b) { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; }
function trs(n) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]; const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1]; const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
for (const it of cat.items) {
  if (!ids.has(it.id)) continue;
  const p = root + "/public" + it.url;
  if (!existsSync(p)) { console.log(it.id, "missing", p); continue; }
  const buf = readFileSync(p);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const visit = (ni, parent) => {
    const n = gltf.nodes[ni]; const m = mat4mul(parent, trs(n));
    if (n.mesh != null) for (const prim of gltf.meshes[n.mesh].primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION];
      if (!acc.min) continue;
      for (let c = 0; c < 8; c++) {
        const v = [c & 1 ? acc.max[0] : acc.min[0], c & 2 ? acc.max[1] : acc.min[1], c & 4 ? acc.max[2] : acc.min[2]];
        const w = [0, 1, 2].map((i) => m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i]);
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const ni of gltf.scenes[gltf.scene ?? 0].nodes) visit(ni, I);
  const f = (a) => a.map((v) => v.toFixed(3)).join(",");
  console.log(it.id.padEnd(24), "size", JSON.stringify(it.size), "min", f(min), "max", f(max), "yaw", it.yaw);
}

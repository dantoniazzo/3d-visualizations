/**
 * Inspect a GLB before importing it as a scene.
 *
 *   node scripts/inspect-glb.mjs public/models/wrenfield_furnishings.glb
 *
 * Reports what you need to fill in a scene's `model` block: the world-space
 * extents, a scale factor derived from objects of known real size, whether
 * the export carries textures, and where there is open floor to spawn on.
 *
 * Reads the glTF JSON chunk directly — no dependencies, and it never has to
 * decode the (potentially huge) binary payload.
 */
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------
// glTF parsing
// ---------------------------------------------------------------------

function readGltfJson(file) {
    const buf = fs.readFileSync(file);
    if (buf.toString("utf8", 0, 4) !== "glTF") {
        throw new Error(`${file} is not a binary glTF (.glb).`);
    }
    const jsonLength = buf.readUInt32LE(12);
    return { json: JSON.parse(buf.slice(20, 20 + jsonLength).toString("utf8")), bytes: buf.length };
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = sum;
        }
    }
    return out;
}

/** Node's local matrix, from either `matrix` or TRS. */
function localMatrix(node) {
    if (node.matrix) return node.matrix.slice();

    const [tx, ty, tz] = node.translation || [0, 0, 0];
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale || [1, 1, 1];

    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    return [
        (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
        (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
        (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

const transform = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/** World-space AABB per mesh-bearing node. */
function collectNodes(json) {
    const nodes = [];

    const walk = (index, parent) => {
        const node = json.nodes[index];
        const world = multiply(parent, localMatrix(node));

        if (node.mesh != null) {
            const min = [Infinity, Infinity, Infinity];
            const max = [-Infinity, -Infinity, -Infinity];

            for (const prim of json.meshes[node.mesh].primitives || []) {
                const acc = json.accessors[prim.attributes.POSITION];
                if (!acc?.min) continue;
                // Transform all 8 corners — a rotated node's AABB is not the
                // rotated AABB of its corners taken pairwise.
                for (let i = 0; i < 8; i++) {
                    const corner = [
                        i & 1 ? acc.max[0] : acc.min[0],
                        i & 2 ? acc.max[1] : acc.min[1],
                        i & 4 ? acc.max[2] : acc.min[2],
                    ];
                    const w = transform(world, corner);
                    for (let k = 0; k < 3; k++) {
                        min[k] = Math.min(min[k], w[k]);
                        max[k] = Math.max(max[k], w[k]);
                    }
                }
            }

            if (min[0] !== Infinity) {
                nodes.push({ name: node.name || "(unnamed)", min, max });
            }
        }

        for (const child of node.children || []) walk(child, world);
    };

    for (const root of json.scenes[json.scene || 0].nodes) walk(root, identity());
    return nodes;
}

// ---------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------

/**
 * Real-world heights of things that commonly appear in interior models.
 * The scale is derived from whichever of these the file happens to contain;
 * agreement across several is what makes the answer trustworthy.
 */
const REFERENCES = [
    [/bar ?stool|counter ?chair/i, "bar stool", 0.68],
    [/dining ?chair|^chair/i, "dining chair", 0.9],
    [/book ?shelf|bookcase/i, "bookshelf", 1.8],
    [/bean ?bag/i, "bean bag", 0.75],
    [/counter(?!.*chair)|worktop/i, "kitchen counter", 0.9],
    [/fridge|refriger/i, "fridge", 1.8],
    [/wardrobe|closet/i, "wardrobe", 2.1],
    [/^door|doorway/i, "door", 2.05],
    [/toilet|wc/i, "toilet", 0.78],
    [/^desk|work ?table/i, "desk", 0.75],
    [/^table(?!.*lamp)|dining ?table/i, "dining table", 0.75],
    [/^sofa|couch(?!.*leg)/i, "sofa", 0.85],
    [/^bath(?!.*tap)/i, "bathtub", 0.58],
    [/sink|basin/i, "basin", 0.85],
];

function deriveScale(nodes) {
    const found = [];

    for (const [pattern, label, real] of REFERENCES) {
        const match = nodes.find((n) => pattern.test(n.name));
        if (!match) continue;

        const height = match.max[1] - match.min[1];
        if (height <= 0) continue;

        found.push({ label, modelHeight: height, real, scale: real / height, node: match.name });
    }

    if (found.length === 0) return { found, scale: null };

    // Median is robust to a reference that matched the wrong node — a "stove"
    // that is only the hob surface, or a "bed" that includes its headboard.
    const sorted = found.map((f) => f.scale).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Keep only references that agree with the median within 25%.
    const agreeing = found.filter((f) => Math.abs(f.scale - median) / median < 0.25);
    const scale =
        agreeing.reduce((sum, f) => sum + f.scale, 0) / (agreeing.length || 1);

    return { found, median, agreeing, scale };
}

// ---------------------------------------------------------------------
// Open floor
// ---------------------------------------------------------------------

function findOpenFloor(nodes, scale) {
    const floor = nodes.find((n) => /^floor|ground|slab/i.test(n.name));
    if (!floor) return { floor: null, spots: [] };

    const fmin = floor.min.map((v) => v * scale);
    const fmax = floor.max.map((v) => v * scale);

    // Anything intersecting the band a standing person occupies.
    const blockers = nodes
        .map((n) => ({ name: n.name, min: n.min.map((v) => v * scale), max: n.max.map((v) => v * scale) }))
        .filter(
            (n) =>
                n !== floor &&
                n.max[1] > 0.15 &&
                n.min[1] < 1.7 &&
                !/roof|ceiling|hanging|pendant|poster|wall ?light|chandelier/i.test(n.name)
        );

    const pad = 0.45; // capsule radius plus a margin
    const step = 0.25;
    const spots = [];

    for (let x = fmin[0] + pad; x <= fmax[0] - pad; x += step) {
        for (let z = fmin[2] + pad; z <= fmax[2] - pad; z += step) {
            let nearest = Infinity;
            for (const b of blockers) {
                const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
                const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
                const d = Math.hypot(dx, dz);
                if (d < pad) { nearest = -1; break; }
                nearest = Math.min(nearest, d);
            }
            if (nearest > 0) {
                spots.push({ x: +x.toFixed(2), z: +z.toFixed(2), clearance: +nearest.toFixed(2) });
            }
        }
    }

    spots.sort((a, b) => b.clearance - a.clearance);
    return { floor: { min: fmin, max: fmax }, spots };
}

// ---------------------------------------------------------------------

const file = process.argv[2];
if (!file) {
    console.error("usage: node scripts/inspect-glb.mjs <file.glb>");
    process.exit(1);
}

const { json, bytes } = readGltfJson(file);
const nodes = collectNodes(json);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const n of nodes) {
    for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], n.min[k]);
        max[k] = Math.max(max[k], n.max[k]);
    }
}

const triangles = (json.meshes || []).reduce(
    (sum, m) =>
        sum +
        (m.primitives || []).reduce(
            (s, p) => s + (p.indices != null ? json.accessors[p.indices].count / 3 : 0),
            0
        ),
    0
);

const f = (n, d = 2) => n.toFixed(d);

console.log(`\n=== ${path.basename(file)} ===`);
console.log(`size           ${(bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`generator      ${json.asset?.generator || "unknown"}`);
console.log(`meshes         ${json.meshes?.length || 0}  |  nodes ${json.nodes?.length || 0}  |  triangles ${Math.round(triangles).toLocaleString()}`);
console.log(`materials      ${json.materials?.length || 0}  |  textures ${json.textures?.length || 0}  |  images ${json.images?.length || 0}`);
console.log(`extensions     ${(json.extensionsUsed || []).join(", ") || "(none)"}`);

if (!json.textures?.length) {
    console.log(`\n  ! No textures. Expect a flat white model — set model.material`);
    console.log(`    and use the interior_white_model environment preset.`);
}

console.log(`\nworld bounds   min ${min.map((v) => f(v)).join(", ")}`);
console.log(`               max ${max.map((v) => f(v)).join(", ")}`);
console.log(`raw extent     ${max.map((v, i) => f(v - min[i])).join(" x ")}`);

const { found, scale } = deriveScale(nodes);
console.log(`\n--- scale references ---`);
if (found.length === 0) {
    console.log("  none matched; set model.scale by hand");
} else {
    for (const r of found) {
        console.log(
            `  ${r.label.padEnd(16)} model ${f(r.modelHeight).padStart(7)}  assumed ${f(r.real)}m  -> ${f(r.scale, 4)}   [${r.node}]`
        );
    }
    console.log(`\n  suggested model.scale: ${f(scale, 4)}  (${found.length} references)`);
    console.log(
        `  => extent becomes ${max.map((v, i) => f((v - min[i]) * scale)).join(" x ")} m`
    );
}

if (scale) {
    const { floor, spots } = findOpenFloor(nodes, scale);
    console.log(`\n--- open floor ---`);
    if (!floor) {
        console.log("  no node matching /floor|ground|slab/; pick spawns by hand");
    } else {
        console.log(
            `  floor  x ${f(floor.min[0])} -> ${f(floor.max[0])}   z ${f(floor.min[2])} -> ${f(floor.max[2])}   (${f((floor.max[0] - floor.min[0]) * (floor.max[2] - floor.min[2]), 1)} m2)`
        );
        console.log(`  ${spots.length} clear standing positions; most open:`);
        for (const s of spots.slice(0, 6)) {
            console.log(`     x ${String(s.x).padStart(6)}  z ${String(s.z).padStart(6)}   clearance ${s.clearance}m`);
        }
    }
}

console.log("");

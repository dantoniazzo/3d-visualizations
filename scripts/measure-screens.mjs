/**
 * Where the picture goes on each television of the furniture catalogue:
 * measured from its model, so a television switched on in a walkthrough
 * (frontend/Experience/World/Screens.js) shows its picture on its own
 * glass — in the editor and in a public view alike, where no furniture
 * model is loaded and nothing is republished or baked again for it.
 *
 * A television is a piece with a screen: a primitive of the glass a
 * television's face is made of in blender/lib/materials.py — "tv_glass"
 * (Ladonia's wall-hung set and the sets in its TV walls) or "screen" (the
 * catalogue's own television). Each piece is read from its GLB, its nodes'
 * transforms applied, and turned and scaled as the app shows it (the
 * catalogue's `yaw` and `scale`), as scripts/measure-seats.mjs stands one:
 * facing north (−z), in the GLB's own frame — the exporter leaves every
 * piece centred on its footprint, its lowest point at y = 0, and the app
 * places it so (Builders/FurnitureLibrary.js), so the frame is not centred
 * again here: what is measured is where the app draws it.
 *
 * Its glass is then taken a block at a time (triangles that share corners:
 * two sets in one piece are two screens) and each block's box read:
 *
 *   - `at` [x, y, z]: the middle of its front face, the face looking the
 *     way the piece looks (−z): x and y the box's middle, z its front;
 *   - `size` [w, h]: the front face's width and height;
 *   - `recess`: how far the rest of the piece stands out in front of that
 *     face — a console under a set sunk into a TV wall (ld-media-ochre's
 *     0.45 m) — which is how far behind what a public view's collision
 *     meets first the screen may be and still be aimed at (its collision
 *     is the piece's, a box perhaps, whose face is that far forward).
 *
 * Only a screen that stands upright and faces the way the piece does
 * counts: a block thinner front to back than it is wide and high, whose
 * front face's triangles look north within 5° — not a laptop's, which
 * leans back (and is no television). Nor anything under 20 cm a side.
 *
 * Written to public/models/furniture/screens.json, in the piece's own frame
 * (metres at the placement's scale 1, before its rotation):
 *
 *   { "<catalog id>": { screens: [{ at: [x, y, z], size: [w, h], recess }] } }
 *
 *   npm run screens                  # every piece with a screen
 *   npm run screens -- ld-tv         # only ids starting so (merged in)
 *   npm run screens -- --check       # measure again and say what differs from the file; write nothing
 *
 * `--check` is how a re-export of the furniture (blender/export_furniture.py)
 * is shown to have left every television's glass where it was: it exits 1
 * if any screen moved or changed size by more than a millimetre, or came or
 * went — and only says so where a piece's front moved and its glass did not.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ROOT, "public", "models", "furniture", "catalog.json");
const OUT = join(ROOT, "public", "models", "furniture", "screens.json");

const COMMENT =
    "Written by scripts/measure-screens.mjs (`npm run screens`): each television's screen, in the piece's own frame facing north (-z) at scale 1 — `at` [x, y, z] the middle of the glass's front face, `size` [w, h] that face's, `recess` how far the rest of the piece stands in front of it.";
/** The materials a television's face is made of (blender/lib/materials.py). */
const SCREEN_MATERIALS = new Set(["tv_glass", "screen"]);
/** A screen is at least this wide and high, in metres. */
const LEAST = 0.2;
/** ...and its front face looks north within this, in degrees. */
const UPRIGHT = 5;
/** Corners this near each other are one corner (a block's triangles share theirs), in metres. */
const WELD = 1e-4;
/** What `--check` lets pass: a millimetre. */
const SAME = 0.001;

const args = process.argv.slice(2);
const checking = args.includes("--check");
const prefixes = args.filter((a) => !a.startsWith("--"));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "meshopt.decoder": MeshoptDecoder,
});

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const pieces = catalog.items.filter((item) => item.enabled !== false && item.url && (!prefixes.length || prefixes.some((p) => item.id.startsWith(p))));

/** Measure every piece asked for, and write the file — keeping the others when only some are — or, checking, compare. */
async function main() {
    const before = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
    const out = prefixes.length || checking ? { ...before } : {};
    const found = {};

    for (const item of pieces) {
        const file = join(ROOT, "public", item.url.replace(/^\//, ""));
        if (!existsSync(file)) continue;
        const { screens, notes } = await measure(file, item);
        for (const note of notes) console.log(`${item.id.padEnd(28)} ${note}`);
        if (!screens.length) {
            delete out[item.id];
            continue;
        }
        found[item.id] = { screens };
        out[item.id] = { screens };
        const said = screens.map((s) => `at (${s.at.join(", ")}) ${s.size.join(" × ")} m, recess ${s.recess}`).join("; ");
        console.log(`${item.id.padEnd(28)} ${said}`);
    }

    if (checking) {
        const { moved, notes } = compare(before, found);
        for (const line of notes) console.log(`note    ${line}`);
        for (const line of moved) console.log(`DIFFERS ${line}`);
        console.log(`\n${Object.keys(found).length} pieces with a screen; ${moved.length ? `${moved.length} differ from` : "every screen as in"} ${OUT.slice(ROOT.length + 1)}`);
        process.exit(moved.length ? 1 : 0);
    }

    // A piece a line, as the catalogue sorts them by id.
    const ids = Object.keys(out).filter((id) => !id.startsWith("$")).sort();
    const rows = [[`"$comment"`, JSON.stringify(COMMENT)], ...ids.map((id) => [JSON.stringify(id), JSON.stringify(out[id])])];
    writeFileSync(OUT, `{\n${rows.map(([key, value]) => `    ${key}: ${value}`).join(",\n")}\n}\n`);
    console.log(`\n${ids.length} pieces → ${OUT.slice(ROOT.length + 1)}`);
}

/**
 * A piece's screens, as the app shows it at scale 1 facing north: `{
 * screens, notes }`, `notes` saying what of its glass was not taken, and why.
 */
async function measure(file, item) {
    const document = await io.read(file);
    const yaw = ((item.yaw ?? 0) * Math.PI) / 180;
    const scale = item.scale ?? 1;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // As three turns a model by `rotation.y` and the group scales it.
    const place = (x, y, z) => [(x * cos + z * sin) * scale, y * scale, (-x * sin + z * cos) * scale];

    // The piece's front, all of it: how far forward of a screen it stands.
    let front = Infinity;
    const glass = [];
    for (const scene of document.getRoot().listScenes()) {
        scene.traverse((node) => {
            const mesh = node.getMesh();
            if (!mesh) return;
            const m = node.getWorldMatrix();
            for (const prim of mesh.listPrimitives()) {
                if (prim.getMode() !== 4) continue; // triangles only
                const position = prim.getAttribute("POSITION");
                if (!position) continue;
                const p = [0, 0, 0];
                const points = [];
                for (let i = 0; i < position.getCount(); i++) {
                    position.getElement(i, p);
                    const point = place(
                        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
                        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
                        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
                    );
                    front = Math.min(front, point[2]);
                    points.push(point);
                }
                if (!SCREEN_MATERIALS.has(prim.getMaterial()?.getName())) continue;
                const indices = prim.getIndices();
                const n = indices ? indices.getCount() : points.length;
                for (let i = 0; i + 2 < n; i += 3) {
                    glass.push([0, 1, 2].map((k) => points[indices ? indices.getScalar(i + k) : i + k]));
                }
            }
        });
    }

    const screens = [];
    const notes = [];
    for (const block of blocks(glass)) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const triangle of block) {
            for (const point of triangle) {
                for (let k = 0; k < 3; k++) {
                    min[k] = Math.min(min[k], point[k]);
                    max[k] = Math.max(max[k], point[k]);
                }
            }
        }
        const [w, h, d] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
        // (A kitchen's oven display, a lamp's dark glass: no screen, and not worth a word.)
        if (Math.max(w, h) < LEAST) continue;
        const lean = leanOf(block);
        if (lean > UPRIGHT) {
            notes.push(`glass ${round(w)} × ${round(h)} m leaning ${Math.round(lean)}° off upright: no television's, left out`);
            continue;
        }
        if (w < LEAST || h < LEAST || d >= Math.min(w, h)) {
            notes.push(`glass ${round(w)} × ${round(h)} × ${round(d)} m: no screen's shape, left out`);
            continue;
        }
        screens.push({
            at: [round((min[0] + max[0]) / 2), round((min[1] + max[1]) / 2), round(min[2])],
            size: [round(w), round(h)],
            recess: round(Math.max(0, min[2] - front)),
        });
    }
    // Left to right, as the piece faces: the same order whatever the file's.
    screens.sort((a, b) => b.at[0] - a.at[0] || a.at[1] - b.at[1]);
    return { screens, notes };
}

/** The glass's triangles in blocks: those that share a corner (within WELD), one block. */
function blocks(triangles) {
    const parent = triangles.map((_, i) => i);
    const find = (i) => {
        while (parent[i] !== i) i = parent[i] = parent[parent[i]];
        return i;
    };
    const owner = new Map();
    triangles.forEach((triangle, i) => {
        for (const [x, y, z] of triangle) {
            const key = `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;
            const seen = owner.get(key);
            if (seen === undefined) owner.set(key, i);
            else parent[find(i)] = find(seen);
        }
    });
    const groups = new Map();
    triangles.forEach((triangle, i) => {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(triangle);
    });
    return [...groups.values()];
}

/**
 * How far off upright a block's front face is, in degrees: its triangles
 * that look north (−z) more than any other way, their normals summed by
 * area, against straight north.
 */
function leanOf(block) {
    let [nx, ny, nz] = [0, 0, 0];
    for (const [a, b, c] of block) {
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        // Twice the triangle's area, along its normal (counter-clockwise faces out).
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (-n[2] <= Math.max(Math.abs(n[0]), Math.abs(n[1]))) continue;
        nx += n[0];
        ny += n[1];
        nz += n[2];
    }
    const length = Math.hypot(nx, ny, nz);
    if (!length) return 90;
    return (Math.acos(Math.min(1, -nz / length)) * 180) / Math.PI;
}

/**
 * What differs between the file's screens and those measured now, a line
 * each: `moved`, a screen moved, resized, come or gone; `notes`, a screen
 * where it was in a piece whose front has changed (its recess) — the glass
 * kept, which is what the check is for, the rest of the piece the
 * exporter's to change.
 */
function compare(before, now) {
    const lines = [];
    const notes = [];
    const ids = new Set([...Object.keys(before), ...Object.keys(now)].filter((id) => !id.startsWith("$") && (!prefixes.length || prefixes.some((p) => id.startsWith(p)))));
    for (const id of [...ids].sort()) {
        const a = before[id]?.screens ?? [];
        const b = now[id]?.screens ?? [];
        if (a.length !== b.length) {
            lines.push(`${id}: ${a.length} screen(s) in the file, ${b.length} now`);
            continue;
        }
        a.forEach((screen, i) => {
            const other = b[i];
            const moved = Math.max(...screen.at.map((v, k) => Math.abs(v - other.at[k])), ...screen.size.map((v, k) => Math.abs(v - other.size[k])));
            if (moved > SAME) lines.push(`${id} #${i}: at (${screen.at.join(", ")}) ${screen.size.join(" × ")} in the file, (${other.at.join(", ")}) ${other.size.join(" × ")} now`);
            else if (Math.abs(screen.recess - other.recess) > SAME) notes.push(`${id} #${i}: recess ${screen.recess} in the file, ${other.recess} now (the glass where it was)`);
        });
    }
    return { moved: lines, notes };
}

function round(n) {
    return Math.round(n * 1000) / 1000;
}

await main();

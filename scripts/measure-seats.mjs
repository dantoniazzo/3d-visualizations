/**
 * Where a person sits or lies on each piece of the furniture catalogue:
 * measured from its model, so the people placed on it (shared/people.js)
 * sit on its cushions, not in them or over them.
 *
 * Each piece one can sit or lie on — sofas with their chaise and corner
 * variants, armchairs, lounge and dining chairs, stools, benches, poufs,
 * sun loungers — is read from its GLB, its nodes' transforms applied, and
 * turned and scaled as the app shows it (the catalogue's `yaw` and
 * `scale`), so it stands facing north (−z) as the catalogue's `size`
 * describes it, centred on its footprint, its lowest point at y = 0.
 * Then it is looked at from above: a height field, 2 cm a cell, of the
 * highest surface over each point (each triangle's edges traced too, so a
 * chair's thin back rail is seen). From that, for each of the four ways a
 * seat can face, every line of cells is walked in from the piece's front
 * edge that way:
 *
 *   - over open floor to the seat's front edge, across the seat (and gaps
 *     of 12 cm at most: between slats, between a seat and its back rail)
 *     to its back — something within 0.12 m of the piece's top and 0.15 m
 *     over the seat, so an arm is not a back — and down the back's face
 *     to its foot, where it rises 0.1 m over the seat;
 *   - the seat's height on that line: what is within 0.25 m before the
 *     foot. A loose pillow lying on the seat against the back is not the
 *     seat: where what is before the back stands 0.1 m or more over the
 *     front of the line, the front is the seat and the pillow part of the
 *     back — one sits before it, leant a little into it (PILLOW_GIVE).
 *     The commonest of the lines' heights is the piece's seat (an arm's
 *     top, or a back cushion standing proud of a low back, is not);
 *     lines at another height are let go;
 *   - each seat cell then goes to the way whose back is nearest, so the
 *     arms of a corner sofa face out of its corner, and the corner itself,
 *     a line mostly another way's, is no one's;
 *   - lines side by side whose backs' feet line up make a run, cut where a
 *     chaise's deep end (over 0.78 m from the foot to the front edge)
 *     begins or ends; a run seats one per ~0.6 m of its width, a chaise
 *     one. A seat's `at` is where a seated person's buttocks rest, sitting
 *     back: 0.15 m out from the back's foot (the middle, on a shallow
 *     seat); `depth` from the foot to the front edge — a cushion propped
 *     against the back moves the seat it is on forward, and leaves it
 *     shallow; `facing` the way they face, in degrees as a placement's
 *     `rotation` turns (0 north, 90 west, −90 east); `height` the seat's.
 *     A piece with no back at all (a stool, a pouf, a bench) seats one
 *     per ~0.6 m of its length, facing 0;
 *   - under each seat's front edge, from below (a second field, of the
 *     lowest surface over each point): a sofa's box or plinth, down to the
 *     floor or near it, is a `solid` base, which feet can't be tucked back
 *     under; a chair's seat on its legs is `open`. And before its front
 *     edge: a seat with more of the piece there than floor — in the
 *     corner of a corner sofa, behind another's cushions — has no room
 *     for legs, and is no seat;
 *   - a lounger's lying surface, along its longer side, from the profile
 *     of its middle third: the flat at its commonest height, the head at
 *     the end that rises above it, where the rise begins and how steeply.
 *
 * Written to public/models/furniture/seats.json, in the piece's own frame
 * (metres at the placement's scale 1, before its rotation):
 *
 *   { "<catalog id>": {
 *       kind: "sofa" | "chair" | "stool" | "lounger" | "bench",
 *       seats: [{ at: [x, z], height, depth, facing, base: "solid" | "open", room? }],
 *       lie: { at: [x, z], height, head: [x, z], length, width, incline } | null } }
 *
 * A seat's `room`, only where a loose pillow lies on it, is how far its
 * front edge is from the back proper, behind the pillow: `depth` is what
 * is left to sit on before the pillow. `lie.at` is the point under a
 * lying person's pelvis: 0.1 m footwards of where the raised back begins
 * (or 0.9 m from the head end of a flat one); `head` the middle of the
 * head end; `length` the lying surface's, end to end; `width` its width
 * across, there under the pelvis — the cushion's, which the frame under
 * it may stand out past; `incline` the raised back's angle off the flat,
 * in degrees.
 *
 *   npm run seats                       # every piece one can sit on
 *   npm run seats -- ld-out ld-lounger  # only ids starting so (merged in)
 *   npm run seats -- --png <dir>        # also a top view of each, seats drawn
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ROOT, "public", "models", "furniture", "catalog.json");
const OUT = join(ROOT, "public", "models", "furniture", "seats.json");

const COMMENT =
    "Written by scripts/measure-seats.mjs (`npm run seats`): where a person sits or lies on each piece, in its own frame facing north (-z) at scale 1 — `at` [x, z] under the pelvis, `facing` in degrees as a placement's rotation (0 north, 90 west).";
/** What one can sit or lie on, by its id and name. */
const SEATABLE = /sofa|chair|lounger|stool|bench|pouf|ottoman|daybed|settee/i;
/** The height field's cell, metres. */
const CELL = 0.02;
/** A seat this deep, from the back's foot to its front edge, is a chaise's: one seat of its own. */
const CHAISE_DEPTH = 0.78;
/** The width one seated person takes. */
const PITCH = 0.6;
/** Where a seated person's buttocks rest, out from the foot of the back. */
const SIT_BACK = 0.15;
/** How far a loose pillow lying against the back gives under someone leant on it: they sit that much further back than its front. */
const PILLOW_GIVE = 0.06;
/** Under the first of a seat this far in from its front edge, something this near the floor (or half the seat's height, if that is less) is a base no foot goes under. */
const BASE_UNDER = 0.2;
const BASE_LOW = 0.2;
/** Before a seat's front edge, this far out: more than this share of it the piece itself, rather than floor, and there is no room for legs. */
const LEG_ROOM = 0.3;
const LEG_ROOM_TAKEN = 0.25;

const args = process.argv.slice(2);
const pngAt = args.includes("--png") ? args[args.indexOf("--png") + 1] : null;
const prefixes = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--png");

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "meshopt.decoder": MeshoptDecoder,
});

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const pieces = catalog.items.filter(
    (item) =>
        item.enabled !== false &&
        item.url &&
        SEATABLE.test(`${item.id} ${item.name}`) &&
        (!prefixes.length || prefixes.some((p) => item.id.startsWith(p)))
);

/** Measure every piece asked for and write the file, keeping the others when only some are. */
async function main() {
    const out = prefixes.length && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
    if (pngAt) mkdirSync(pngAt, { recursive: true });

    for (const item of pieces) {
        const file = join(ROOT, "public", item.url.replace(/^\//, ""));
        if (!existsSync(file)) {
            console.warn(`${item.id}: no model at ${item.url}, skipped`);
            continue;
        }
        const triangles = await readTriangles(file, item);
        const field = heightField(triangles);
        const entry = measure(item, field);
        if (!entry) {
            console.warn(`${item.id}: found nothing to sit or lie on, skipped`);
            delete out[item.id];
            continue;
        }
        out[item.id] = entry;
        const seats = entry.seats.map((s) => `${fmt(s.at)} h${s.height} d${s.depth}${s.room ? ` (back at ${s.room})` : ""} ${s.facing}° ${s.base}`).join("; ");
        const lie = entry.lie ? ` lie ${fmt(entry.lie.at)} h${entry.lie.height} head ${fmt(entry.lie.head)} ${entry.lie.length} × ${entry.lie.width} m ${entry.lie.incline}°` : "";
        console.log(`${item.id.padEnd(28)} ${entry.kind.padEnd(7)} ${seats}${lie}`);
        if (pngAt) await drawTopView(join(pngAt, `${item.id}.png`), field, entry);
    }

    // A piece a line, as the catalogue sorts them by id.
    const ids = Object.keys(out).filter((id) => !id.startsWith("$")).sort();
    const rows = [[`"$comment"`, JSON.stringify(COMMENT)], ...ids.map((id) => [JSON.stringify(id), JSON.stringify(out[id])])];
    writeFileSync(OUT, `{\n${rows.map(([key, value]) => `    ${key}: ${value}`).join(",\n")}\n}\n`);
    console.log(`\n${ids.length} pieces → ${OUT.slice(ROOT.length + 1)}`);
}

// ---------------------------------------------------------------------
// The model, as the app stands it
// ---------------------------------------------------------------------

/**
 * Every triangle of a piece as the app shows it at scale 1 facing north:
 * its nodes' transforms, then the catalogue's yaw (about y, as three's
 * `rotation.y`) and scale; centred on its footprint, its lowest point
 * on 0 — as the exporter already leaves it, made sure of.
 */
async function readTriangles(file, item) {
    const document = await io.read(file);
    const yaw = ((item.yaw ?? 0) * Math.PI) / 180;
    const scale = item.scale ?? 1;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const tris = [];
    for (const scene of document.getRoot().listScenes()) {
        scene.traverse((node) => {
            const mesh = node.getMesh();
            if (!mesh) return;
            const m = node.getWorldMatrix();
            for (const prim of mesh.listPrimitives()) {
                if (prim.getMode() !== 4) continue; // triangles only
                const position = prim.getAttribute("POSITION");
                if (!position) continue;
                const count = position.getCount();
                const points = new Float64Array(count * 3);
                const p = [0, 0, 0];
                for (let i = 0; i < count; i++) {
                    position.getElement(i, p);
                    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
                    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
                    const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
                    points[i * 3] = (x * cos + z * sin) * scale;
                    points[i * 3 + 1] = y * scale;
                    points[i * 3 + 2] = (-x * sin + z * cos) * scale;
                }
                const indices = prim.getIndices();
                const n = indices ? indices.getCount() : count;
                for (let i = 0; i + 2 < n; i += 3) {
                    const a = indices ? indices.getScalar(i) : i;
                    const b = indices ? indices.getScalar(i + 1) : i + 1;
                    const c = indices ? indices.getScalar(i + 2) : i + 2;
                    tris.push([a, b, c].map((k) => [points[k * 3], points[k * 3 + 1], points[k * 3 + 2]]));
                }
            }
        });
    }
    let [x0, y0, z0, x1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity];
    for (const t of tris) {
        for (const [x, y, z] of t) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            z0 = Math.min(z0, z);
            z1 = Math.max(z1, z);
        }
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    return tris.map((t) => t.map(([x, y, z]) => [x - cx, y - y0, z - cz]));
}

/**
 * The highest surface over each cell's middle, from above: `h[i + j * nx]`
 * at x = x0 + (i + ½)·CELL, z = z0 + (j + ½)·CELL; −Infinity over nothing.
 * And the lowest, from below: `low`, Infinity under nothing.
 */
function heightField(tris) {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const t of tris) {
        for (const [x, , z] of t) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            z0 = Math.min(z0, z);
            z1 = Math.max(z1, z);
        }
    }
    x0 -= CELL;
    z0 -= CELL;
    const nx = Math.ceil((x1 + CELL - x0) / CELL);
    const nz = Math.ceil((z1 + CELL - z0) / CELL);
    const h = new Float32Array(nx * nz).fill(-Infinity);
    const low = new Float32Array(nx * nz).fill(Infinity);
    const mark = (x, y, z) => {
        const i = Math.floor((x - x0) / CELL);
        const j = Math.floor((z - z0) / CELL);
        if (i < 0 || j < 0 || i >= nx || j >= nz) return;
        if (y > h[i + j * nx]) h[i + j * nx] = y;
        if (y < low[i + j * nx]) low[i + j * nx] = y;
    };
    for (const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] of tris) {
        // Its edges, point by point: a rail thinner than a cell is seen too.
        for (const [p, q] of [
            [[ax, ay, az], [bx, by, bz]],
            [[bx, by, bz], [cx, cy, cz]],
            [[cx, cy, cz], [ax, ay, az]],
        ]) {
            const n = Math.ceil(Math.hypot(q[0] - p[0], q[2] - p[2]) / (CELL / 2)) + 1;
            for (let k = 0; k <= n; k++) {
                const t = k / n;
                mark(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
            }
        }
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-12) continue; // edge-on from above
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / CELL - 0.5));
        const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / CELL - 0.5));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / CELL - 0.5));
        const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / CELL - 0.5));
        for (let j = j0; j <= j1; j++) {
            const z = z0 + (j + 0.5) * CELL;
            for (let i = i0; i <= i1; i++) {
                const x = x0 + (i + 0.5) * CELL;
                const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
                const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
                const w = 1 - u - v;
                if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
                const y = u * ay + v * by + w * cy;
                if (y > h[i + j * nx]) h[i + j * nx] = y;
                if (y < low[i + j * nx]) low[i + j * nx] = y;
            }
        }
    }
    return { h, low, nx, nz, x0, z0 };
}

// ---------------------------------------------------------------------
// Reading the field
// ---------------------------------------------------------------------

/**
 * The four ways a seat can face: a placement's rotation, and how a line
 * of cells is walked from the piece's front edge that way to its back —
 * `cell(line, step)` the cell `step` cells in from that edge on `line`,
 * `at(line, edge)` the point at fractional `line` and `edge` cells in.
 */
const FACINGS = [
    {
        deg: 0, // north, −z
        lines: ({ nx }) => nx,
        steps: ({ nz }) => nz,
        cell: ({ nx }, line, step) => line + step * nx,
        at: ({ x0, z0 }, line, edge) => [x0 + line * CELL, z0 + edge * CELL],
    },
    {
        deg: 90, // west, −x
        lines: ({ nz }) => nz,
        steps: ({ nx }) => nx,
        cell: ({ nx }, line, step) => step + line * nx,
        at: ({ x0, z0 }, line, edge) => [x0 + edge * CELL, z0 + line * CELL],
    },
    {
        deg: 180, // south, +z
        lines: ({ nx }) => nx,
        steps: ({ nz }) => nz,
        cell: ({ nx, nz }, line, step) => line + (nz - 1 - step) * nx,
        at: ({ x0, z0, nz }, line, edge) => [x0 + line * CELL, z0 + (nz - edge) * CELL],
    },
    {
        deg: -90, // east, +x
        lines: ({ nz }) => nz,
        steps: ({ nx }) => nx,
        cell: ({ nx }, line, step) => nx - 1 - step + line * nx,
        at: ({ x0, z0, nx }, line, edge) => [x0 + (nx - edge) * CELL, z0 + line * CELL],
    },
];

/** Anything lower is floor. */
const FLOOR = 0.2;
/** A gap a seat's line may cross on its way to the back (between slats; a chair's seat and its back rail). */
const GAP = 0.12;
/** The back begins where the seat rises this far. */
const FOOT = 0.1;

const median = (values) => [...values].sort((p, q) => p - q)[Math.floor(values.length / 2)];
const round = (n) => Math.round(n * 1000) / 1000;

function measure(item, field) {
    const { h } = field;
    const guess = commonHeight(h, /stool/i.test(item.id) ? 0.9 : 0.75);
    if (guess === null) return null;
    if (/lounger|daybed/i.test(`${item.id} ${item.name}`)) {
        const lie = measureLie(field, guess);
        return lie ? { kind: "lounger", seats: [], lie } : null;
    }
    let top = 0;
    for (const y of h) top = Math.max(top, y);
    // A back: as tall as the piece, near enough, and well over the seat — not an arm.
    const high = Math.max(top - 0.12, guess + 0.15);

    // Every line of every facing walked from the front: over floor to the
    // seat's front edge, across the seat (and gaps no wider than GAP) to
    // something `high` — the back — and back down its face to its foot.
    const lines = FACINGS.map(() => []);
    const best = new Float32Array(h.length).fill(Infinity);
    const owner = new Int8Array(h.length).fill(-1);
    FACINGS.forEach((f, index) => {
        const count = f.lines(field);
        const steps = f.steps(field);
        for (let line = 0; line < count; line++) {
            const y = (step) => h[f.cell(field, line, step)];
            let front = 0;
            while (front < steps && !(y(front) >= FLOOR)) front++;
            if (front >= steps || y(front) >= high) continue;
            let gap = 0;
            let back = -1;
            for (let k = front; k < steps; k++) {
                if (!(y(k) >= FLOOR)) {
                    if (++gap * CELL > GAP) break;
                    continue;
                }
                gap = 0;
                if (y(k) >= high) {
                    back = k;
                    break;
                }
            }
            if (back < 0) continue;
            const near = (to) => {
                const values = [];
                for (let k = Math.max(front, to - Math.round(0.25 / CELL)); k < to; k++) if (y(k) >= FLOOR && y(k) < high) values.push(y(k));
                return values.length ? median(values) : null;
            };
            let level = near(back);
            if (level === null) continue;
            let foot = back;
            while (foot - 1 > front && y(foot - 1) > level + FOOT) foot--;
            level = near(foot) ?? level;
            // Where the back proper begins, whatever lies before it.
            const wall = foot;
            // A loose pillow lying on the seat against the back: what is
            // before the back stands well over the front of the line. The
            // front is the seat, and its back's foot the pillow's front.
            const ahead = near(Math.min(foot, front + Math.round(0.25 / CELL)));
            if (ahead !== null && level - ahead > FOOT) {
                level = ahead;
                foot = back;
                while (foot - 1 > front && y(foot - 1) > level + FOOT) foot--;
                level = near(foot) ?? level;
                // Leant on, it gives.
                foot = Math.min(wall, foot + Math.round(PILLOW_GIVE / CELL));
            }
            if ((foot - front) * CELL < 0.2) continue;
            lines[index][line] = { front, foot, wall, level };
        }
    });

    // The seat's height: the commonest of the lines' (an arm's top, or a
    // back cushion lower than the back's frame, is not a seat), each cell
    // of it then going to the facing whose back is nearest.
    const seatLevel = commonHeight(lines.flatMap((ls) => Object.values(ls).map((l) => l.level)), 0.9);
    FACINGS.forEach((f, index) => {
        for (const [line, l] of Object.entries(lines[index])) {
            if (Math.abs(l.level - seatLevel) > 0.08) {
                delete lines[index][line];
                continue;
            }
            // By how near the back proper is: a pillow lying in a corner draws no cells its way.
            for (let k = l.front; k < l.foot; k++) {
                const cell = f.cell(field, Number(line), k);
                if (l.wall - k < best[cell]) {
                    best[cell] = l.wall - k;
                    owner[cell] = index;
                }
            }
        }
    });

    const seats = [];
    FACINGS.forEach((f, index) => seats.push(...seatsFacing(field, f, index, lines[index], owner)));
    if (!seats.length) {
        // No back: a stool, a pouf, a bench — sat on from any side, along its length.
        const box = cellsBox(field, (cell) => Math.abs(h[cell] - guess) <= 0.08);
        const alongX = box.x1 - box.x0 >= box.z1 - box.z0;
        const length = alongX ? box.x1 - box.x0 : box.z1 - box.z0;
        const n = Math.max(1, Math.floor(length / PITCH + 0.25));
        for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const x = alongX ? box.x0 + t * (box.x1 - box.x0) : (box.x0 + box.x1) / 2;
            const z = alongX ? (box.z0 + box.z1) / 2 : box.z0 + t * (box.z1 - box.z0);
            seats.push({ at: [round(x), round(z)], height: round(guess), depth: round(alongX ? box.z1 - box.z0 : box.x1 - box.x0), facing: 0, base: baseOf(field, box, guess) });
        }
        return { kind: n > 1 ? "bench" : "stool", seats, lie: null };
    }
    const kind = seats.length > 1 ? "sofa" : seats[0].height > 0.6 ? "stool" : "chair";
    return { kind, seats, lie: null };
}

/**
 * The seats facing one way: its lines, each now only the cells it kept
 * (a corner sofa's corner goes to whichever back is nearer); lines side
 * by side whose backs line up make a run, cut where a chaise's deep lines
 * begin or end; a run seats one per PITCH of its width, a chaise one.
 * A seat's back, front and height are its own lines' middling ones, so a
 * cushion propped against the back moves the one seat it is on forward.
 * Each seat with its `base` — what is under its front edge (baseUnder) —
 * and none at all where there is no room for legs before it (legRoom).
 */
function seatsFacing(field, f, index, lines, owner) {
    const kept = [];
    for (let line = 0; line < f.lines(field); line++) {
        const l = lines[line];
        if (!l) {
            kept.push(null);
            continue;
        }
        // From the back's foot forward, as far as the cells stay this facing's.
        let front = l.foot;
        for (let k = l.foot - 1, misses = 0; k >= l.front; k--) {
            if (owner[f.cell(field, line, k)] === index) {
                front = k;
                misses = 0;
            } else if (++misses * CELL > GAP) break;
        }
        // A line mostly another facing's (through a corner sofa's corner) is none of this one's.
        const depth = (l.foot - front) * CELL;
        kept.push(depth >= 0.12 && depth >= 0.6 * (l.foot - l.front) * CELL ? { ...l, line, front, depth, room: (l.wall - front) * CELL } : null);
    }
    // Runs: lines side by side, over gaps no wider than GAP (a slatted
    // seat's), whose backs' feet are within 0.15 m of each other — or
    // whose backs proper are: a pillow lying against one is part of its seat.
    const runs = [];
    let run = null;
    for (let line = 0; line < kept.length; line++) {
        const l = kept[line];
        if (!l) continue;
        const chaise = l.room > CHAISE_DEPTH;
        const last = run?.lines.at(-1);
        const joins = run && run.chaise === chaise && (line - run.to - 1) * CELL <= GAP && Math.min(Math.abs(l.foot - last.foot), Math.abs(l.wall - last.wall)) * CELL <= 0.15;
        if (joins) {
            run.lines.push(l);
            run.to = line;
            continue;
        }
        if (run) runs.push(run);
        run = { from: line, to: line, chaise, lines: [l] };
    }
    if (run) runs.push(run);

    const seats = [];
    for (const r of runs) {
        const count = r.to - r.from + 1;
        if (count * CELL < 0.3) continue; // a sliver beside an arm
        const n = r.chaise ? 1 : Math.max(1, Math.floor((count * CELL) / PITCH + 0.3));
        for (let k = 0; k < n; k++) {
            const span = [r.from + (k * count) / n, r.from + ((k + 1) * count) / n];
            const own = r.lines.filter((l) => l.line >= span[0] && l.line < span[1]);
            if (!own.length) continue;
            const foot = median(own.map((l) => l.foot));
            const front = median(own.map((l) => l.front));
            const depth = (foot - front) * CELL;
            if (!legRoom(field, f, own)) continue;
            const height = median(own.map((l) => l.level));
            const [x, z] = f.at(field, (span[0] + span[1]) / 2, foot - Math.min(SIT_BACK, depth / 2) / CELL);
            const seat = { at: [round(x), round(z)], height: round(height), depth: round(depth), facing: f.deg, base: baseUnder(field, f, own, height) };
            // A pillow lying on it: how far back the back proper is.
            const room = (median(own.map((l) => l.wall)) - front) * CELL;
            if (room > depth + 0.001) seat.room = round(room);
            seats.push(seat);
        }
    }
    return seats;
}

/**
 * Whether there is room for a sitter's legs before a seat: the first
 * LEG_ROOM of what is before its lines' front edges is floor, not the
 * piece itself (another's cushions, in the corner of a corner sofa) — all
 * but LEG_ROOM_TAKEN of it.
 */
function legRoom(field, f, lines) {
    let taken = 0;
    let all = 0;
    for (const l of lines) {
        for (let k = l.front - 1; k >= 0 && (l.front - k) * CELL <= LEG_ROOM; k--) {
            all++;
            if (field.h[f.cell(field, l.line, k)] >= FLOOR) taken++;
        }
    }
    return !all || taken / all <= LEG_ROOM_TAKEN;
}

/**
 * What is under a seat's front edge, from below: "solid", a base that
 * comes down to the floor or near it under the first BASE_UNDER of the
 * seat (a sofa's box, a plinth, short feet) — feet can't be tucked back
 * under it — or "open", a seat on legs with the floor clear under it.
 * By the middling of its lines' lowest there: a leg is one line or two.
 */
function baseUnder(field, f, lines, height) {
    const lowest = [];
    for (const l of lines) {
        let low = Infinity;
        for (let k = l.front; k < l.foot && (k - l.front) * CELL < BASE_UNDER; k++) low = Math.min(low, field.low[f.cell(field, l.line, k)]);
        if (low < Infinity) lowest.push(low);
    }
    if (!lowest.length) return "open";
    return median(lowest) < Math.min(BASE_LOW, height / 2) ? "solid" : "open";
}

/**
 * What is under a piece with no back (a stool, a pouf, a bench), whose
 * seat is `box`: "solid" where most of it comes down to the floor or near
 * it, "open" on legs (baseUnder's, for a seat sat on from any side).
 */
function baseOf({ low, nx, x0, z0 }, box, height) {
    const lowest = [];
    for (let z = box.z0 + CELL / 2; z < box.z1; z += CELL) {
        for (let x = box.x0 + CELL / 2; x < box.x1; x += CELL) {
            const value = low[Math.floor((x - x0) / CELL) + Math.floor((z - z0) / CELL) * nx];
            if (value < Infinity) lowest.push(value);
        }
    }
    if (!lowest.length) return "open";
    return median(lowest) < Math.min(BASE_LOW, height / 2) ? "solid" : "open";
}

/** The commonest height (1 cm bins) between 0.25 m and `max`, of what can be seen from above. */
function commonHeight(h, max) {
    const bins = new Map();
    for (const y of h) {
        if (!(y >= 0.25 && y <= max)) continue;
        const bin = Math.round(y * 100);
        bins.set(bin, (bins.get(bin) || 0) + 1);
    }
    // A cushion's crown is a little dome: count each bin with its neighbours.
    let best = null;
    let bestCount = 0;
    for (const bin of bins.keys()) {
        const count = (bins.get(bin - 1) || 0) + bins.get(bin) * 2 + (bins.get(bin + 1) || 0);
        if (count > bestCount) {
            best = bin;
            bestCount = count;
        }
    }
    return best === null ? null : best / 100;
}

/** The box round the cells that pass `test`, in metres. */
function cellsBox({ nx, nz, x0, z0 }, test) {
    let [i0, j0, i1, j1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            if (!test(i + j * nx)) continue;
            i0 = Math.min(i0, i);
            i1 = Math.max(i1, i);
            j0 = Math.min(j0, j);
            j1 = Math.max(j1, j);
        }
    }
    return { x0: x0 + i0 * CELL, x1: x0 + (i1 + 1) * CELL, z0: z0 + j0 * CELL, z1: z0 + (j1 + 1) * CELL };
}

/**
 * A lounger's lying surface: along its longer side, the profile of its
 * middle third; the flat at the commonest height, the head at the end
 * that rises above it, the back's start where it does.
 */
function measureLie(field, flat) {
    const { h, nx, nz, x0, z0 } = field;
    const alongZ = nz >= nx;
    const n = alongZ ? nz : nx;
    const m = alongZ ? nx : nz;
    const profile = [];
    for (let a = 0; a < n; a++) {
        const values = [];
        for (let b = Math.floor(m / 3); b < Math.ceil((2 * m) / 3); b++) {
            const y = alongZ ? h[b + a * nx] : h[a + b * nx];
            if (y > -Infinity) values.push(y);
        }
        values.sort((p, q) => p - q);
        profile.push(values.length ? values[Math.floor(values.length / 2)] : -Infinity);
    }
    // The surface: from the first to the last line over the flat's height less a drop.
    const on = (y) => y >= flat - 0.06;
    let first = profile.findIndex(on);
    let last = profile.length - 1 - [...profile].reverse().findIndex(on);
    if (first < 0) return null;
    // Which end is raised: the end standing higher over the flat.
    const lowEnd = profile[first + 2] ?? flat;
    const highEnd = profile[last - 2] ?? flat;
    const headAtEnd = highEnd >= lowEnd; // the head at the far (+) end
    const step = headAtEnd ? 1 : -1;
    const foot = headAtEnd ? first : last;
    const head = headAtEnd ? last : first;
    // Where the back starts rising: the first line from the foot over flat + 4 cm, held on to the head.
    let bend = head;
    for (let a = foot; a !== head; a += step) {
        if (profile[a] > flat + 0.04 && profile.slice(Math.min(a, head), Math.max(a, head) + 1).every((y) => y > flat + 0.02)) {
            bend = a;
            break;
        }
    }
    const raised = Math.abs(head - bend) * CELL;
    const rise = (profile[head - step * 2] ?? flat) - flat;
    const incline = raised > 0.1 ? (Math.atan2(Math.max(0, rise), raised) * 180) / Math.PI : 0;
    // The pelvis: just footwards of the bend, or 0.9 m from the head of a flat one.
    const pelvis = incline > 5 ? bend - step * Math.round(0.1 / CELL) : head - step * Math.round(0.9 / CELL);
    const mid = alongZ ? x0 + (nx * CELL) / 2 : z0 + (nz * CELL) / 2;
    const point = (a) => (alongZ ? [mid, z0 + (a + 0.5) * CELL] : [x0 + (a + 0.5) * CELL, mid]);
    const flatValues = profile.filter((y, a) => (a - foot) * step >= 0 && (bend - a) * step > 0 && Math.abs(y - flat) < 0.06);
    flatValues.sort((p, q) => p - q);
    const height = flatValues.length ? flatValues[Math.floor(flatValues.length / 2)] : flat;
    // How wide the lying surface is under the pelvis: the cells across it there at its height (the widest of five lines).
    let width = 0;
    for (let a = pelvis - 2; a <= pelvis + 2; a++) {
        if (a < 0 || a >= n) continue;
        let across = 0;
        for (let b = 0; b < m; b++) if (Math.abs((alongZ ? h[b + a * nx] : h[a + b * nx]) - height) < 0.04) across++;
        width = Math.max(width, across * CELL);
    }
    return {
        at: point(pelvis).map(round),
        height: round(height),
        head: point(head).map(round),
        length: round((Math.abs(head - foot) + 1) * CELL),
        width: round(width),
        incline: Math.round(incline),
    };
}

// ---------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------

/** The field from above, grey by height, the seats as dots with a tick their way, the lie in red. */
async function drawTopView(path, { h, nx, nz, x0, z0 }, entry) {
    const { default: sharp } = await import("sharp");
    const S = 4; // pixels a cell
    const W = nx * S;
    const H = nz * S;
    const px = Buffer.alloc(W * H * 3);
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            const y = h[i + j * nx];
            const g = y === -Infinity ? 255 : Math.max(0, Math.min(230, 30 + y * 220));
            for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) px.fill(g, ((j * S + b) * W + i * S + a) * 3, ((j * S + b) * W + i * S + a) * 3 + 3);
        }
    }
    const dot = (x, z, r, rgb) => {
        const cx = ((x - x0) / CELL) * S;
        const cz = ((z - z0) / CELL) * S;
        for (let b = -r; b <= r; b++) {
            for (let a = -r; a <= r; a++) {
                const u = Math.round(cx + a);
                const v = Math.round(cz + b);
                if (a * a + b * b > r * r || u < 0 || v < 0 || u >= W || v >= H) continue;
                px.set(rgb, (v * W + u) * 3);
            }
        }
    };
    for (const s of entry.seats) {
        const rad = (s.facing * Math.PI) / 180;
        for (let t = 0; t <= 0.25; t += 0.01) dot(s.at[0] - Math.sin(rad) * t, s.at[1] - Math.cos(rad) * t, 2, [40, 120, 255]);
        dot(s.at[0], s.at[1], 7, [20, 90, 230]);
    }
    if (entry.lie) {
        dot(entry.lie.at[0], entry.lie.at[1], 7, [230, 40, 40]);
        dot(entry.lie.head[0], entry.lie.head[1], 5, [255, 160, 0]);
    }
    await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path);
}

function fmt([x, z]) {
    return `(${x.toFixed(2)}, ${z.toFixed(2)})`;
}

await main();

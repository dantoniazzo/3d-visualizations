/**
 * Shared by doors-dump.mjs and door-swing.mjs: loads a seeded scene or a
 * generator's output, each building's frame, and every hinged door with its
 * leaves posed by the app's own Door.js (frontend/Experience/World/Door.js),
 * hung in its wall the way StructureBuilder.buildWall hangs it. Nothing about
 * a door's hand, pivot, leaf size or opening angle is re-derived here: change
 * Door.js and these tools follow.
 *
 * Options it reads (both tools):
 *   --scene <path>      a seeded scene (default scenes/kosinozici-villas.json, Ladonia's)
 *   --gen [dir]         the generator folder (default scripts/spaces/ladonia, Ladonia's); used for
 *                       the building frames, and with --live for the spec itself
 *   --live              run <gen>/index.js through validateScene, as seeding does, instead of a scene
 *   --export <name>     the generator's spec export (default: the first export with walls and furniture)
 *   --frame t=x,z[,y]   a building's frame by its id tag (repeatable; overrides what the generator
 *                       gives); --frame none prints site coordinates only
 *
 * The repo is four directories above this file (checks -> build-property-space
 * -> skills -> .claude -> repo), or REPO=<dir>.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const url = (p) => pathToFileURL(p).href;
export const rel = (p) => (p.startsWith(REPO + "/") ? relative(REPO, p) : p);

export const THREE = await import(url(join(REPO, "node_modules/three/build/three.module.js")));
const { default: Door } = await import(url(join(REPO, "frontend/Experience/World/Door.js")));
const { DOOR_TYPES } = await import(url(join(REPO, "shared/catalog.js")));

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * `--name value`, `--name=value` and bare `--name`; a value is taken from the
 * next argument only for the flags listed in `valued`, and for `--gen` only
 * when it names a folder (so `--gen c-g-` still reads c-g- as a filter).
 */
export function parseArgs(argv, valued = []) {
    const opts = { frame: [] };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) {
            positional.push(a);
            continue;
        }
        const eq = a.indexOf("=");
        const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
        let value = eq > 0 ? a.slice(eq + 1) : true;
        const next = argv[i + 1];
        if (value === true && valued.includes(name) && next != null && !next.startsWith("--")) {
            if (name !== "gen" || isDir(next)) value = argv[++i];
        }
        if (name === "frame") opts.frame.push(value);
        else opts[name] = value;
    }
    return { opts, positional };
}
const isDir = (p) => {
    try {
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------------------
// The scene and the building frames
// ---------------------------------------------------------------------------

function pickSpec(mod, name) {
    if (name) return mod[name];
    for (const v of [mod.default, ...Object.values(mod)]) if (v && typeof v === "object" && Array.isArray(v.walls) && Array.isArray(v.furniture)) return v;
    return null;
}

/**
 * The spec to check and the frames to print building-local coordinates in.
 * Frames come from the generator: its kit's `Building` is hooked while
 * index.js runs, recording each building's tag and offset ([ox, oz, oy]) the
 * first time it lays anything down. `--frame` overrides or adds to them.
 */
export async function loadSpace(opts) {
    const genDir = resolve(typeof opts.gen === "string" ? opts.gen : join(REPO, "scripts/spaces/ladonia"));
    const frames = new Map();
    let generated = null;
    let genError = null;
    const noFrames = opts.frame.includes("none");
    if (opts.live || !noFrames) {
        try {
            const kitPath = join(genDir, "kit.js");
            if (existsSync(kitPath)) {
                const kit = await import(url(kitPath));
                const proto = kit.Building?.prototype;
                for (const m of ["wall", "room", "put", "stair", "roof"]) {
                    const f = proto?.[m];
                    if (typeof f !== "function") continue;
                    proto[m] = function (...a) {
                        if (this.tag != null && !frames.has(this.tag)) frames.set(this.tag, { ox: this.ox ?? 0, oz: this.oz ?? 0, oy: this.oy ?? 0 });
                        return f.apply(this, a);
                    };
                }
            }
            const mod = await import(url(join(genDir, "index.js")));
            generated = pickSpec(mod, typeof opts.export === "string" ? opts.export : null);
            if (!generated) genError = `no export with walls and furniture${opts.export ? ` named ${opts.export}` : ""}`;
        } catch (e) {
            genError = e.message;
        }
    }
    let frameSource = frames.size ? `${rel(genDir)}/kit.js Building offsets` : `none found (${genError ?? "no Building in kit.js"})`;
    if (noFrames) {
        frames.clear();
        frameSource = "none (--frame none)";
    }
    for (const f of opts.frame) {
        if (f === "none" || f === true) continue;
        const m = String(f).match(/^([^=]+)=(-?[\d.]+),(-?[\d.]+)(?:,(-?[\d.]+))?$/);
        if (!m) throw new Error(`--frame ${f}: expected tag=x,z or tag=x,z,y`);
        frames.set(m[1], { ox: Number(m[2]), oz: Number(m[3]), oy: Number(m[4] ?? 0) });
        frameSource += `; ${m[1]} from --frame`;
    }

    let spec;
    let source;
    let notes = [];
    if (opts.live) {
        if (!generated) throw new Error(`--live: cannot use ${rel(genDir)}/index.js: ${genError}`);
        const { validateScene } = await import(url(join(REPO, "server/scene/validate.js")));
        const v = validateScene(structuredClone(generated));
        spec = v.scene;
        notes = v.notes ?? [];
        source = `generator ${rel(genDir)} (validated as seeding does)`;
    } else {
        const path = resolve(typeof opts.scene === "string" ? opts.scene : join(REPO, "scenes/kosinozici-villas.json"));
        const raw = JSON.parse(readFileSync(path, "utf8"));
        spec = raw.scene ?? raw;
        source = rel(path);
    }
    return { spec, source, notes, frames, frameSource };
}

/** The frame of the building an id belongs to (the longest tag `t` with the id starting `t-`). */
export function frameOf(frames, id) {
    let best = null;
    for (const [tag, f] of frames) if (id.startsWith(`${tag}-`) && (!best || tag.length > best.tag.length)) best = { tag, ...f };
    return best;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const r3 = (n) => Math.round(n * 1000) / 1000;
const f3 = (n) => r3(n).toFixed(3);
/** A plan point in site coordinates, and in its building's frame when there is one. */
export const pt = (p, frame) => (frame ? `${f3(p[0])},${f3(p[1])} (L ${f3(p[0] - frame.ox)},${f3(p[1] - frame.oz)})` : `${f3(p[0])},${f3(p[1])}`);
/** A plan direction as a compass point (north is -z), or a bearing when it is between them. */
export function compass([x, z]) {
    const deg = ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const k = Math.round(deg / 45) % 8;
    return Math.abs(deg - Math.round(deg / 45) * 45) < 3 ? names[k] : `${Math.round(deg)}°`;
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

function inPolygon([x, z], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

/** The room whose floor holds plan point p at about height y (within 0.4 m), nearest in height first. */
export function roomAt(spec, p, y) {
    let best = null;
    for (const r of spec.rooms ?? []) {
        const dy = Math.abs((r.elevation ?? 0) - y);
        if (dy > 0.4 || !r.polygon || !inPolygon(p, r.polygon)) continue;
        if (!best || dy < best.dy) best = { room: r, dy };
    }
    return best?.room ?? null;
}
export const roomName = (r) => (r ? `${r.id} "${r.name ?? ""}"` : "no room (outside)");

// ---------------------------------------------------------------------------
// Doors, as the app builds them
// ---------------------------------------------------------------------------

// The kit of parts decides whether a hung leaf turns on knuckles proud of its
// face (Door.js `hinges`): read which parts public/models/kit.glb has, and
// stand in boxes of the asked size for their geometry.
const KIT_PARTS = (() => {
    try {
        const b = readFileSync(join(REPO, "public/models/kit.glb"));
        const n = b.readUInt32LE(12);
        return new Set(JSON.parse(b.subarray(20, 20 + n).toString()).nodes.map((node) => node.name));
    } catch {
        return new Set();
    }
})();
const kit = {
    has: (name) => KIT_PARTS.has(name),
    size: () => new THREE.Vector3(0.02, 0.08, 0.02),
    part: () => new THREE.BoxGeometry(0.01, 0.01, 0.01),
    fit: (name, x, y, z) => new THREE.BoxGeometry(x ?? 0.01, y ?? 0.01, z ?? 0.01),
};
const plain = new THREE.MeshBasicMaterial();
const materials = { getTrim: () => plain, getTrimFront: () => plain, getTrimBehind: () => plain };

/**
 * Every door that swings (Door.js builds one for each `type: "door"` opening;
 * DOOR_TYPES says which swing), in walls and free-standing (`spec.doors`).
 *
 * Each entry: { id, wall, opening, door, root, sideA, centre, base,
 *   jambs: [startSide, endSide], fullAngle, pose(a), leaves: [...] }, where
 * pose(a) sets the leaves to a fraction a of the full opening angle (0 shut,
 * 1 fully open) and each leaf is { hinge, leaf, hingeSide, lo, hi, matrix() }:
 * lo/hi bound the leaf's own geometry in its local frame (the leaf slab as
 * Door.js sizes it; handles and pulls are separate meshes, left out).
 */
export function swingingDoors(spec, { filter = [] } = {}) {
    const out = [];
    const want = (ids) => !filter.length || filter.some((s) => ids.some((id) => id && id.includes(s)));
    const hang = (root, opening, wall, offset, extra) => {
        const type = DOOR_TYPES[opening.door?.type] || DOOR_TYPES.hinged;
        if (type.motion === "slide") return;
        const door = new Door(opening, wall, offset, materials, kit);
        root.add(door.group);
        root.updateMatrixWorld(true);
        const leaves = door.leaves.map(({ hinge, leaf, hingeSide }) => {
            leaf.geometry.computeBoundingBox();
            const { min, max } = leaf.geometry.boundingBox;
            return { hinge, leaf, hingeSide, lo: min.toArray(), hi: max.toArray(), matrix: () => leaf.matrixWorld.clone() };
        });
        const pose = (a) => {
            // Door.js eases its `open` as 1 - (1 - open)^2 and turns each hinge by
            // that times its full angle: set `open` so the eased value is a.
            const o = 1 - Math.sqrt(Math.max(0, 1 - a));
            door.open = o < 0.5 ? 1 : 0;
            door.target = o;
            door.update(1e3);
            root.updateMatrixWorld(true);
        };
        pose(1);
        const fullAngle = Math.max(...door.leaves.map(({ hinge }) => Math.abs(hinge.rotation.y)));
        pose(0);
        const w = (v) => {
            const p = door.group.localToWorld(new THREE.Vector3(...v));
            return [p.x, p.z];
        };
        const axisA = new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld);
        out.push({
            id: opening.id,
            wall: extra.free ? null : wall,
            opening,
            door,
            root,
            base: root.position.y,
            centre: w([0, 0, 0]),
            jambs: [w([-opening.width / 2, 0, 0]), w([opening.width / 2, 0, 0])],
            sideA: [axisA.x, axisA.z],
            fullAngle,
            pose,
            leaves,
            ...extra,
        });
    };
    for (const wall of spec.walls ?? []) {
        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        for (const opening of wall.openings ?? []) {
            if (opening.type !== "door" || !want([wall.id, opening.id])) continue;
            // The wall's frame as StructureBuilder.buildWall sets it: X along
            // start -> end, Z out of side A (the left of start -> end in plan).
            const root = new THREE.Group();
            root.position.set((x1 + x2) / 2, wall.base_height ?? 0, (z1 + z2) / 2);
            root.rotation.y = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
            hang(root, opening, wall, opening.offset - length / 2, {});
        }
    }
    // Free-standing doors, as SceneBuilder.buildFreeDoors hangs them.
    for (const d of spec.doors ?? []) {
        if (!want([d.id])) continue;
        const root = new THREE.Group();
        root.position.set(d.position[0], d.elevation ?? 0, d.position[1]);
        root.rotation.y = ((d.yaw ?? 0) * Math.PI) / 180;
        const opening = { id: d.id, type: "door", offset: 0, width: d.width, height: d.height, sill: 0, door: d.door };
        hang(root, opening, { thickness: d.thickness, height: d.height }, 0, { free: true });
    }
    return out;
}

/** A leaf-local point in site plan coordinates, at the door's current pose. */
export function leafPoint(L, v) {
    const p = L.leaf.localToWorld(new THREE.Vector3(...v));
    return [p.x, p.z];
}
/** The leaf's free edge (tip) and hinge edge, mid-thickness and mid-height, in its local frame. */
export function leafEdges(L) {
    const mid = (k) => (L.lo[k] + L.hi[k]) / 2;
    const tipX = L.hingeSide > 0 ? L.lo[0] : L.hi[0];
    const hingeX = L.hingeSide > 0 ? L.hi[0] : L.lo[0];
    return { tip: [tipX, mid(1), mid(2)], heel: [hingeX, mid(1), mid(2)] };
}

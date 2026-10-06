#!/usr/bin/env node
/**
 * Can the walker climb to every floor of kosinozici-villas (Ladonia)?
 *
 *   node stairs-check.mjs                 # the seeded scene, scenes/kosinozici-villas.json
 *   node stairs-check.mjs --gen           # straight from scripts/spaces/ladonia (validated as seeding does)
 *   node stairs-check.mjs --gen-dir dir   # from a patched copy of scripts/spaces/ladonia
 *   node stairs-check.mjs --scene path    # any other scene file
 *   node stairs-check.mjs --no-sim        # rules, headroom and clearance only
 *   node stairs-check.mjs --only a-stair-n,c-stair-out
 *
 * It builds the scene's collision exactly as the app does (StructureBuilder's
 * slabs, walls, roofs, stair ramps, landing rails and linings; LandscapeBuilder's
 * terrain, walls, railings, pergolas, planters; every piece of furniture from
 * its GLB, as mesh or box as SceneBuilder decides; doors left open), with the
 * app's own Collision/Octree, and then:
 *   1. checks each flight's numbers (rise, going, width, pitch);
 *   2. measures headroom up the flight (rays, no back-face culling) and the
 *      clearance the capsule (r 0.35, 1.9 tall) actually needs on that pitch;
 *   3. stands the capsule on the ramp every 5 cm and lists anything it meets
 *      other than its footing (slab edges, walls, rails, furniture...);
 *   4. finds the landing at the head and the approach at the foot (in line and
 *      to either side) and how deep each is;
 *   5. walks the capsule with Player.js's movement maths (60 fps, gravity 60,
 *      speed 1.75·60·0.35, damping e^-15t) along each flight and along named
 *      routes (street → upper flats → roof terraces), reporting where it sticks
 *      and what holds it.
 *
 * Paths: the repo is found from this file's location (four directories up:
 * checks -> build-property-space -> skills -> .claude -> repo); set REPO=<dir>
 * to check another checkout. The app's modules and three.js are imported from it.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const THREE = await import(`${REPO}/node_modules/three/build/three.module.js`);
const { Capsule } = await import(`${REPO}/node_modules/three/examples/jsm/math/Capsule.js`);
const { default: Collision, buildOctree, isTransient } = await import(`${REPO}/frontend/Experience/World/Collision.js`);
const { default: StructureBuilder } = await import(`${REPO}/frontend/Experience/World/Builders/StructureBuilder.js`);
const { buildLandscape } = await import(`${REPO}/frontend/Experience/World/Builders/LandscapeBuilder.js`);
const { pointInPolygon, rectCorners } = await import(`${REPO}/frontend/Experience/Utils/geometry.js`);

// ---------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------

async function loadSpec() {
    const genDir = opt("gen-dir", null) && resolve(opt("gen-dir"));
    if (has("gen") || genDir) {
        const { ladonia } = await import(`${genDir ?? `${REPO}/scripts/spaces/ladonia`}/index.js`);
        const { validateScene } = await import(`${REPO}/server/scene/validate.js`);
        const { scene, notes } = validateScene(structuredClone(ladonia));
        if (notes?.length) console.log(`validate notes: ${notes.length} (first: ${notes[0]})`);
        return { spec: scene, source: `generator ${genDir ?? "scripts/spaces/ladonia"} (validated as seeding does)` };
    }
    const path = opt("scene", `${REPO}/scenes/kosinozici-villas.json`);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { spec: raw.scene ?? raw, source: path };
}

const { spec, source } = await loadSpec();
const ONLY = opt("only", null)?.split(",") ?? null;

const R = 0.35; // capsule radius (Player.js)
const AXIS = 1.2; // Player.height: start→end of the capsule's axis
const TALL = AXIS + 2 * R; // 1.9
const LEAD = StructureBuilder.STAIR_LEAD_IN;
const SLAB_DEPTH = 0.6; // SceneBuilder.SLAB_DEPTH
const FLAT_HEIGHT = 0.035; // SceneBuilder.FLAT_HEIGHT
// SceneBuilder.MESH_COLLISION_BUDGET, read from the app so the two never drift apart.
const MESH_BUDGET = Number(readFileSync(`${REPO}/frontend/Experience/World/SceneBuilder.js`, "utf8").match(/MESH_COLLISION_BUDGET = (\d+)/)?.[1] ?? 12000);

const r3 = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);
const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : n);

// Building frames: where each building's own origin lands (site = local + offset).
function frame(roomId, local, fallback) {
    const room = spec.rooms.find((r) => r.id === roomId);
    if (!room) return { ox: fallback[0], oz: fallback[1], oy: 0, found: false };
    const [x, z] = room.polygon[0];
    return { ox: r3(x - local[0]), oz: r3(z - local[1]), oy: r3(room.elevation - local[2]), found: true };
}
const FRAMES = {
    a: frame("a-f-landing", [8.375, 5.2, 3.0], [0, 0]),
    b: frame("b-f-landing", [8.375, 5.2, 3.0], [0, 24.2]),
    c: frame("c-g-rec-e", [11.0, 4.25, 0.0], [2.5, -21]),
};
const toSite = (tag, [x, z]) => [r3(x + FRAMES[tag].ox), r3(z + FRAMES[tag].oz)];
const toLocal = (tag, [x, z]) => [r3(x - FRAMES[tag].ox), r3(z - FRAMES[tag].oz)];
const tagOf = (id) => (/^[abc]-/.test(id) ? id[0] : null);

// ---------------------------------------------------------------------
// Collision, as SceneBuilder builds it
// ---------------------------------------------------------------------

const plainMaterial = new THREE.MeshBasicMaterial();
const materials = {
    getSurface: () => plainMaterial,
    getTrim: () => plainMaterial,
    getTrimFront: () => plainMaterial,
    getTrimBehind: () => plainMaterial,
    tileSize: () => 2,
    applyWorldTiling: () => {},
    textures: { get: () => null, getData: () => null },
};
const structure = new StructureBuilder(materials);

const label = (root, text) => {
    root.traverse((node) => {
        if (node.isMesh) node.userData.label = node.userData.label && node.name === "blocker" ? `${text}:${node.userData.label}` : text;
    });
    return root;
};

function openingCorners(hole) {
    return rectCorners(hole.position[0], hole.position[1], hole.width, hole.depth, THREE.MathUtils.degToRad(hole.yaw || 0));
}
function openingCuts(room, elevation) {
    const top = room.elevation + room.height;
    return { floor: Math.abs(elevation - room.elevation) < 0.02, ceiling: top <= elevation + 0.02 && top > elevation - SLAB_DEPTH };
}
function holesFor(room) {
    const floor = [];
    const ceiling = [];
    for (const hole of spec.floor_openings || []) {
        const cuts = openingCuts(room, hole.elevation);
        if (cuts.floor) floor.push(openingCorners(hole));
        if (cuts.ceiling) ceiling.push(openingCorners(hole));
    }
    return { floor, ceiling };
}
function liningFor(hole) {
    const [x, z] = hole.position;
    let below = null;
    for (const room of spec.rooms) {
        if (!openingCuts(room, hole.elevation).ceiling) continue;
        if (!room.ceiling_finish || room.ceiling_finish === "none") continue;
        if (!pointInPolygon(x, z, room.polygon)) continue;
        if (!below || room.elevation + room.height > below.elevation + below.height) below = room;
    }
    const depth = below ? hole.elevation - (below.elevation + below.height) : 0;
    return depth > 0.01 ? { depth, finish: below.ceiling_finish } : null;
}

const shell = new THREE.Group();
for (const room of spec.rooms) {
    const { group } = structure.buildRoom(room, holesFor(room));
    group.children.forEach((mesh) => label(mesh, `${mesh.name.startsWith("ceiling") ? "ceiling" : "floor"}:${room.id}`));
    shell.add(group);
}
for (const wall of spec.walls) shell.add(label(structure.buildWall(wall).group, `wall:${wall.id}`));
for (const roof of spec.roofs || []) shell.add(label(structure.buildRoof(roof).group, `roof:${roof.id}`));
for (const hole of spec.floor_openings || []) {
    const group = structure.buildRails(hole, liningFor(hole));
    if (group) shell.add(label(group, `rail/lining:${hole.id}`));
}
if (spec.landscape) {
    const { group } = buildLandscape(spec.landscape, materials);
    group.traverse((node) => {
        if (node.isMesh) node.userData.label = `landscape:${node.name.replace("landscape:", "")}`;
    });
    shell.add(group);
}

const colliders = new THREE.Group();
const stairs = new Map();
for (const stair of spec.stairs) {
    const { collider } = structure.buildStairs(stair);
    colliders.add(label(collider, `ramp:${stair.id}`));
    stairs.set(stair.id, stair);
}

// Furniture: each piece's GLB, as SceneBuilder.dynamicCollisionRoots has it.
const CATALOG = JSON.parse(readFileSync(`${REPO}/public/models/furniture/catalog.json`, "utf8"));
const ITEMS = new Map(CATALOG.items.map((item) => [item.id, item]));
const glbCache = new Map();
function loadGlb(id) {
    if (glbCache.has(id)) return glbCache.get(id);
    const item = ITEMS.get(id);
    const path = item?.url ? `${REPO}/public${item.url}` : `${REPO}/public/models/furniture/${id}.glb`;
    let out = null;
    if (existsSync(path)) {
        const buf = readFileSync(path);
        const jsonLength = buf.readUInt32LE(12);
        const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
        const binStart = 20 + jsonLength + 8;
        const bin = buf.subarray(binStart);
        const read = (index) => {
            const accessor = json.accessors[index];
            const view = json.bufferViews[accessor.bufferView];
            const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
            const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[accessor.componentType];
            const stride = view.byteStride || Type.BYTES_PER_ELEMENT * comps;
            const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
            const out = new Type(accessor.count * comps);
            const dv = new DataView(bin.buffer, bin.byteOffset + offset);
            for (let i = 0; i < accessor.count; i++) {
                for (let c = 0; c < comps; c++) {
                    const at = i * stride + c * Type.BYTES_PER_ELEMENT;
                    out[i * comps + c] =
                        Type === Float32Array ? dv.getFloat32(at, true) : Type === Uint32Array ? dv.getUint32(at, true) : Type === Uint16Array ? dv.getUint16(at, true) : Type === Uint8Array ? dv.getUint8(at) : Type === Int16Array ? dv.getInt16(at, true) : dv.getInt8(at);
                }
            }
            if (accessor.normalized && Type !== Float32Array) {
                const max = { [Int8Array]: 127, [Uint8Array]: 255, [Int16Array]: 32767, [Uint16Array]: 65535 }[Type] || 1;
                return Float32Array.from(out, (v) => Math.max(v / max, -1));
            }
            return out;
        };
        const model = new THREE.Group();
        let opens = false;
        let triangles = 0;
        const visit = (index, parent) => {
            const node = json.nodes[index];
            const object = new THREE.Group();
            if (node.matrix) object.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
            else {
                if (node.translation) object.position.fromArray(node.translation);
                if (node.rotation) object.quaternion.fromArray(node.rotation);
                if (node.scale) object.scale.fromArray(node.scale);
            }
            if (node.extras?.opens) opens = true;
            if (node.mesh != null) {
                for (const primitive of json.meshes[node.mesh].primitives) {
                    if (primitive.mode != null && primitive.mode !== 4) continue;
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(read(primitive.attributes.POSITION)), 3));
                    if (primitive.indices != null) geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(read(primitive.indices)), 1));
                    triangles += (primitive.indices != null ? json.accessors[primitive.indices].count : json.accessors[primitive.attributes.POSITION].count) / 3;
                    object.add(new THREE.Mesh(geometry, plainMaterial));
                }
            }
            for (const child of node.children || []) visit(child, object);
            parent.add(object);
        };
        const scene = json.scenes[json.scene ?? 0];
        for (const index of scene.nodes) visit(index, model);
        out = { model, opens, triangles };
    }
    glbCache.set(id, out);
    return out;
}

function localBox(root) {
    root.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    const matrix = new THREE.Matrix4();
    root.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        matrix.multiplyMatrices(inverse, child.matrixWorld);
        part.copy(child.geometry.boundingBox).applyMatrix4(matrix);
        box.union(part);
    });
    return box;
}

const furnitureRoots = new THREE.Group();
const furnitureInfo = new Map();
const missingModels = new Set();
for (const placement of spec.furniture || []) {
    const item = ITEMS.get(placement.catalog_id);
    const group = new THREE.Group();
    group.position.set(...placement.position);
    group.rotation.y = THREE.MathUtils.degToRad(placement.rotation || 0);
    group.scale.setScalar((placement.scale ?? 1) * (item?.scale ?? 1));
    const glb = item ? loadGlb(item.id) : null;
    if (!glb) {
        missingModels.add(placement.catalog_id);
        const size = item?.size ?? [0.6, 0.6, 0.6];
        const placeholder = new THREE.Mesh(new THREE.BoxGeometry(...size), plainMaterial);
        placeholder.position.y = size[1] / 2;
        group.add(placeholder);
    } else {
        const model = glb.model.clone(true);
        model.rotation.y = THREE.MathUtils.degToRad(item.yaw ?? 0);
        group.add(model);
    }
    group.updateMatrixWorld(true);
    const box = localBox(group);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3()).multiply(group.scale);
    if (size.y < FLAT_HEIGHT || item?.collision === "none") continue;
    // As SceneBuilder: the catalogue's own `collision` if set, else box when it opens or is heavy.
    const mode = item?.collision === "box" || item?.collision === "mesh" ? item.collision : glb && (glb.opens || glb.triangles > MESH_BUDGET) ? "box" : "mesh";
    const text = `furniture:${placement.id}(${placement.catalog_id})`;
    furnitureInfo.set(placement.id, { placement, mode, size: size.toArray().map(r3) });
    if (mode === "mesh") furnitureRoots.add(label(group, text));
    else {
        const proxy = new THREE.Mesh(new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()), plainMaterial);
        box.getCenter(proxy.position);
        proxy.position.applyMatrix4(group.matrixWorld);
        proxy.quaternion.copy(group.quaternion);
        proxy.scale.copy(group.scale);
        proxy.userData.label = text;
        furnitureRoots.add(proxy);
    }
}

const t0 = Date.now();
const collision = new Collision();
collision.setStatic(buildOctree([shell], isTransient));
collision.setDynamic(buildOctree([colliders, furnitureRoots], (o) => isTransient(o) || o.name === "missing-model"));
const buildMs = Date.now() - t0;

// ---------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------

const _ray = new THREE.Ray();
const _hit = new THREE.Vector3();
/** Every triangle a ray meets within `far`, nearest first, front or back. */
function rayAll(origin, direction, far = 10, ignore = () => false) {
    _ray.origin.copy(origin);
    _ray.direction.copy(direction).normalize();
    const hits = [];
    for (const tree of [collision.static, collision.dynamic]) {
        const triangles = [];
        tree.getRayTriangles(_ray, triangles);
        for (const t of new Set(triangles)) {
            if (ignore(t.label || "")) continue;
            const p = _ray.intersectTriangle(t.a, t.b, t.c, false, _hit);
            if (!p) continue;
            const d = p.distanceTo(origin);
            if (d <= far) hits.push({ distance: d, label: t.label || "?", point: p.clone() });
        }
    }
    return hits.sort((m, n) => m.distance - n.distance);
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** The walkable surface under (x, z), searched down from `from`. */
function floorAt(x, z, from, ignore) {
    const hits = rayAll(new THREE.Vector3(x, from, z), DOWN, 3, ignore);
    return hits.length ? { y: r3(from - hits[0].distance), label: hits[0].label } : null;
}

/** Everything a capsule with its bottom sphere's centre at (x, y, z) overlaps, with how it would be pushed. */
function touching(x, y, z, ignore = () => false, radius = R) {
    const capsule = new Capsule(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + AXIS, z), radius);
    const out = [];
    for (const tree of [collision.static, collision.dynamic]) {
        const triangles = [];
        tree.getCapsuleTriangles(capsule, triangles);
        const seen = new Map();
        for (const t of new Set(triangles)) {
            if (ignore(t.label || "")) continue;
            const hit = tree.triangleCapsuleIntersect(capsule, t);
            if (!hit || hit.depth < 0.002) continue;
            const key = t.label || "?";
            const prev = seen.get(key);
            if (!prev || hit.depth > prev.depth) seen.set(key, { label: key, depth: r3(hit.depth), normal: hit.normal.toArray().map(r2), point: hit.point.toArray().map(r2) });
        }
        out.push(...seen.values());
    }
    return out;
}

/** Things in the way of a capsule standing on a floor at `floorY`: not its footing. */
function obstacles(x, z, floorY, ignore = () => false) {
    return touching(x, floorY + R + 0.004, z, ignore).filter((h) => !(h.normal[1] > 0.7 && h.point[1] < floorY + 0.12));
}

// ---------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------

function flight(stair) {
    const yaw = THREE.MathUtils.degToRad(stair.yaw ?? 0);
    const d = [Math.sin(yaw), Math.cos(yaw)]; // local +Z: the climb
    const n = [Math.cos(yaw), -Math.sin(yaw)]; // local +X: the left, climbing
    const rise = stair.top_height - stair.base_height;
    const going = stair.run / stair.steps;
    const stepRise = rise / stair.steps;
    const t = rise / stair.run;
    const pitch = Math.atan2(rise, stair.run);
    const F = stair.start;
    const H = [F[0] + d[0] * stair.run, F[1] + d[1] * stair.run];
    const at = (s, u = 0) => [F[0] + d[0] * s + n[0] * u, F[1] + d[1] * s + n[1] * u];
    // The ramp's top: the nosing line half a rise down, through the treads' middles.
    const ramp = (s) => stair.base_height + stepRise / 2 + t * s;
    const surface = (s) => (s < 0 ? Math.max(stair.base_height, ramp(s)) : s > stair.run ? stair.top_height : Math.max(stair.base_height, ramp(s)));
    return { stair, yaw, d, n, rise, going, stepRise, t, pitch, sec: 1 / Math.cos(pitch), F, H, at, ramp, surface };
}

const BASE_RULES = { rise: 0.2, going: 0.25, width: 0.9, headroom: 2.0, landing: 1.0, door: [0.8, 2.0] };

function holeOf(stair) {
    return (spec.floor_openings || []).filter((o) => o.stair_id === stair.id || (Math.abs(o.elevation - stair.top_height) < 0.02 && stairCovers(stair, o)));
}
function stairCovers(stair, hole) {
    const f = flight(stair);
    const [x0, z0, x1, z1] = holeBox(hole);
    for (const s of [0.1, stair.run / 2, stair.run - 0.1]) {
        const [x, z] = f.at(s);
        if (x > x0 && x < x1 && z > z0 && z < z1) return true;
    }
    return false;
}
function holeBox(hole) {
    const c = openingCorners(hole);
    const xs = c.map((p) => p[0]);
    const zs = c.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

/** How far along the climb (s) and across (u) a hole covers the flight. */
function holeCoverage(f, hole) {
    const [x0, z0, x1, z1] = holeBox(hole);
    const proj = (x, z) => [(x - f.F[0]) * f.d[0] + (z - f.F[1]) * f.d[1], (x - f.F[0]) * f.n[0] + (z - f.F[1]) * f.n[1]];
    const pts = [proj(x0, z0), proj(x1, z0), proj(x1, z1), proj(x0, z1)];
    const s = pts.map((p) => p[0]);
    const u = pts.map((p) => p[1]);
    return { s: [r3(Math.min(...s)), r3(Math.max(...s))], u: [r3(Math.min(...u)), r3(Math.max(...u))] };
}

function analyse(stair) {
    const f = flight(stair);
    const own = (l) => l === `ramp:${stair.id}`;
    const issues = [];
    const facts = {};
    const tag = tagOf(stair.id);
    const where = (s, u = 0) => {
        const p = f.at(s, u).map(r3);
        return tag ? `site [${p}] = ${tag.toUpperCase()}-local [${toLocal(tag, p)}]` : `site [${p}]`;
    };

    // 1. The numbers.
    facts.rise = r3(f.stepRise);
    facts.going = r3(f.going);
    facts.width = stair.width;
    facts.pitchDeg = r2((f.pitch * 180) / Math.PI);
    facts.twoRplusG = r3(2 * f.stepRise + f.going);
    facts.foot = where(0);
    facts.head = where(stair.run);
    if (f.stepRise > BASE_RULES.rise + 1e-6) issues.push({ sev: "major", what: `rise ${r3(f.stepRise)} m > ${BASE_RULES.rise}` });
    if (f.going < BASE_RULES.going - 1e-6) issues.push({ sev: f.pitch > (42 * Math.PI) / 180 ? "major" : "minor", what: `going ${r3(f.going)} m < ${BASE_RULES.going} (pitch ${facts.pitchDeg}°)` });
    if (stair.width < BASE_RULES.width) issues.push({ sev: "major", what: `width ${stair.width} < ${BASE_RULES.width}` });

    // 2. Its opening, and headroom up it.
    const holes = holeOf(stair);
    facts.holes = holes.map((h) => ({ id: h.id, rails: h.rails ?? [], ...holeCoverage(f, h) }));
    const needed = AXIS + 2 * R * f.sec; // ramp line to the lowest overhead edge, for the capsule
    facts.capsuleNeedsAboveRamp = r3(needed);
    let worst = null;
    for (let k = 0; k * 0.05 <= stair.run - 0.05 + 1e-9; k++) {
        const s = k * 0.05;
        for (const u of [0, -Math.max(0, stair.width / 2 - R), Math.max(0, stair.width / 2 - R)]) {
            const [x, z] = f.at(s, u);
            const y = f.surface(s);
            const hits = rayAll(new THREE.Vector3(x, y + 0.01, z), UP, 6, own);
            if (!hits.length) continue;
            const head = hits[0].distance + 0.01;
            // From the nosing line (pitch line) too, as codes measure it.
            const fromNosing = s >= 0 ? head - f.stepRise / 2 : head;
            if (!worst || fromNosing < worst.fromNosing) worst = { s: r3(s), u: r3(u), head: r3(head), fromNosing: r3(fromNosing), label: hits[0].label, y: r3(y + head) };
        }
    }
    facts.minHeadroom = worst;
    if (worst && worst.fromNosing < BASE_RULES.headroom) issues.push({ sev: worst.head < needed ? "blocker" : "major", what: `headroom ${worst.fromNosing} m above the pitch line (${worst.head} above the walking ramp; the capsule needs ${r3(needed)}) at s=${worst.s} (${where(worst.s, worst.u)}), under ${worst.label} at y=${worst.y}` });

    // 3. The capsule standing on the flight every 5 cm: what does it touch?
    const intrusions = new Map();
    const lanes = [0, ...(stair.width / 2 - R > 0.05 ? [-(stair.width / 2 - R), stair.width / 2 - R] : [])];
    for (let k = 0; k * 0.05 <= stair.run - 2 * R + 1e-9; k++) {
        const s = R + k * 0.05;
        for (const u of lanes) {
            const [x, z] = f.at(s, u);
            const y = f.ramp(s) + R * f.sec + 0.004;
            for (const h of touching(x, y, z, own)) {
                // Its footing: anything below the bottom sphere's centre pushing up.
                if (h.normal[1] > 0.7 && h.point[1] < y) continue;
                // Stepping off at the head onto the floor it arrives at.
                if (s > stair.run - 0.4 && h.normal[1] > 0.7 && h.point[1] < stair.top_height + 0.05) continue;
                const prev = intrusions.get(`${h.label}|${u === 0 ? "centre" : "side"}`);
                const key = `${h.label}|${u === 0 ? "centre" : "side"}`;
                if (!prev || h.depth > prev.depth) intrusions.set(key, { ...h, s: r3(s), u: r3(u), at: where(s, u) });
            }
        }
    }
    facts.intrusions = [...intrusions.values()];
    for (const h of facts.intrusions) {
        const down = h.normal[1] < -0.3;
        // On the walking line it stops the walk; only at the flight's side, it narrows it.
        issues.push({ sev: h.u === 0 ? (h.depth > 0.03 ? "blocker" : "major") : h.depth > 0.03 ? "major" : "minor", what: `${h.label} ${down ? "overhead" : "in the way"} at s=${h.s}${h.u ? ` u=${h.u}` : ""} (${h.at}): capsule overlaps ${h.depth} m, pushed [${h.normal}]` });
    }

    // 3b. Under an open (slab) flight, is there floor at its foot's level? A hole there shows.
    if (stair.style === "slab") {
        const gaps = [];
        for (let s = 0.4; s <= stair.run - 0.2 + 1e-9; s += 0.2) {
            const [x, z] = f.at(s);
            const floor = floorAt(x, z, stair.base_height + 0.3, (l) => l.startsWith("ramp:") || l.startsWith("furniture:"));
            if (!floor || floor.y < stair.base_height - 0.08) gaps.push({ s: r3(s), at: where(s), found: floor ? `${floor.y} ${floor.label}` : "nothing" });
        }
        facts.floorGapsUnder = gaps;
        if (gaps.length) issues.push({ sev: "minor", what: `no floor at ${stair.base_height} under the open flight for s ${gaps[0].s}…${gaps[gaps.length - 1].s} (${gaps[0].at} … ${gaps[gaps.length - 1].at}); below is ${gaps[0].found}` });
    }

    // 4. Landing at the head, approach at the foot.
    const ignoreRamps = (l) => l.startsWith("ramp:");
    const depthFrom = (origin, dir, y, max = 3) => {
        // How far a standing capsule's centre can go from `origin` along `dir` at floor `y`.
        let reach = null;
        for (let k = R; k <= max + 1e-9; k += 0.05) {
            const x = origin[0] + dir[0] * k;
            const z = origin[1] + dir[1] * k;
            const floor = floorAt(x, z, y + 0.6, ignoreRamps);
            if (!floor || Math.abs(floor.y - y) > 0.12) return { centre: reach, stop: `no floor at ${r3(y)} (found ${floor ? `${floor.y} ${floor.label}` : "none"}) at ${r3(k)} m` };
            const hits = obstacles(x, z, floor.y, ignoreRamps);
            if (hits.length) return { centre: reach, stop: `${hits[0].label} at ${r3(k)} m` };
            reach = r3(k);
        }
        return { centre: reach, stop: `clear past ${max} m` };
    };
    const head = depthFrom(f.H, f.d, stair.top_height);
    facts.landingInLine = { clearDepth: head.centre == null ? 0 : r3(head.centre + R), stop: head.stop };
    const foot = depthFrom(f.F, [-f.d[0], -f.d[1]], stair.base_height);
    facts.approachInLine = { clearDepth: foot.centre == null ? 0 : r3(foot.centre + R), stop: foot.stop };
    // Off either side near the head, and near the foot.
    const side = (s, sign, y) => {
        const u = sign * (stair.width / 2 + R + 0.05);
        const [x, z] = f.at(s, u);
        const floor = floorAt(x, z, y + 0.6, ignoreRamps);
        if (!floor || Math.abs(floor.y - y) > 0.12) return { ok: false, why: `no floor at ${r3(y)} (${floor ? `${floor.y} ${floor.label}` : "none"})` };
        const hits = obstacles(x, z, floor.y, ignoreRamps);
        if (hits.length) return { ok: false, why: hits.map((h) => h.label).join(", ") };
        // The lip from the floor up to the ramp's edge there.
        return { ok: true, at: where(s, u), lip: r3(f.surface(s) - y) };
    };
    facts.headSides = { left: side(stair.run - 0.25, 1, stair.top_height), right: side(stair.run - 0.25, -1, stair.top_height) };
    facts.footSides = { left: side(0.25, 1, stair.base_height), right: side(0.25, -1, stair.base_height) };
    const headExit = facts.landingInLine.clearDepth >= R * 2 || facts.headSides.left.ok || facts.headSides.right.ok;
    if (facts.landingInLine.clearDepth < BASE_RULES.landing) {
        const lateral = ["left", "right"].filter((k) => facts.headSides[k].ok);
        issues.push({
            sev: headExit ? "major" : "blocker",
            what: `landing in line with the head ${facts.landingInLine.clearDepth} m deep (< ${BASE_RULES.landing}): ${facts.landingInLine.stop}; side exits at the head: ${lateral.length ? lateral.join(", ") : `none (left: ${facts.headSides.left.why}; right: ${facts.headSides.right.why})`}`,
        });
    }
    if (facts.approachInLine.clearDepth < 0.8) {
        const lateral = ["left", "right"].filter((k) => facts.footSides[k].ok);
        issues.push({
            sev: lateral.length ? "major" : "blocker",
            what: `approach in line with the foot ${facts.approachInLine.clearDepth} m (${facts.approachInLine.stop}); from the side: ${lateral.length ? lateral.map((k) => `${k} (step up ${facts.footSides[k].lip} m onto the ramp)`).join(", ") : `none (left: ${facts.footSides.left.why}; right: ${facts.footSides.right.why})`}`,
        });
    }
    return { f, facts, issues };
}

// ---------------------------------------------------------------------
// Walking: Player.updateColliderMovement, with doors open
// ---------------------------------------------------------------------

const DT = 1 / 60;
function walk(start, waypoints, { name = "", startY, finalY = null, tol = 0.25 } = {}) {
    // placeAt: the bottom sphere's centre 0.4 above the spawn point.
    const capsule = new Capsule(new THREE.Vector3(start[0], startY + 0.4, start[1]), new THREE.Vector3(start[0], startY + 0.4 + AXIS, start[1]), R);
    const velocity = new THREE.Vector3();
    let onFloor = false;
    const trace = [];
    // Settle first.
    for (let i = 0; i < 30; i++) step(null);
    function step(target) {
        const speed = (onFloor ? 1.75 : 0.1) * 60 * 0.35;
        if (target) {
            const dir = new THREE.Vector3(target[0] - capsule.end.x, 0, target[1] - capsule.end.z);
            if (dir.lengthSq() > 1e-8) velocity.addScaledVector(dir.normalize(), DT * speed);
        }
        let damping = Math.exp(-15 * DT) - 1;
        if (!onFloor) {
            velocity.y -= 60 * DT;
            damping *= 0.1;
        }
        velocity.addScaledVector(velocity, damping);
        capsule.translate(velocity.clone().multiplyScalar(DT));
        const result = collision.capsuleIntersect(capsule);
        onFloor = false;
        if (result) {
            onFloor = result.normal.y > 0;
            capsule.translate(result.normal.clone().multiplyScalar(result.depth));
        }
    }
    const feet = () => capsule.start.y - R;
    for (let w = 0; w < waypoints.length; w++) {
        const target = waypoints[w];
        const dist0 = Math.hypot(target[0] - capsule.end.x, target[1] - capsule.end.z);
        const limit = dist0 / 0.6 + 6;
        let best = dist0;
        let bestAt = 0;
        for (let time = 0; ; time += DT) {
            step(target);
            const dist = Math.hypot(target[0] - capsule.end.x, target[1] - capsule.end.z);
            if (dist < best - 0.03) {
                best = dist;
                bestAt = time;
            }
            if (dist < tol) break;
            if (time - bestAt > 2.5 || time > limit || feet() < startY - 3) {
                const x = capsule.end.x;
                const z = capsule.end.z;
                // Touching, with a little slack: after the push-out it is only just in contact.
                const why = touching(x, capsule.start.y, z, () => false, R + 0.04).filter((h) => !(h.normal[1] > 0.7 && h.point[1] < capsule.start.y - 0.05));
                return {
                    ok: false,
                    name,
                    leg: w,
                    target: target.map(r3),
                    at: [r3(x), r3(feet()), r3(z)],
                    left: r3(dist),
                    fell: feet() < startY - 3,
                    blockers: why.map((h) => `${h.label} (depth ${h.depth}, push [${h.normal}])`),
                    trace,
                };
            }
        }
        trace.push([r2(capsule.end.x), r2(feet()), r2(capsule.end.z)]);
    }
    // Let it settle where it ended.
    for (let i = 0; i < 20; i++) step(null);
    const y = feet();
    const ok = finalY == null || Math.abs(y - finalY) < 0.2;
    return { ok, name, at: [r3(capsule.end.x), r3(y), r3(capsule.end.z)], finalY, trace, ...(ok ? {} : { why: `ended at y ${r3(y)}, expected ${finalY}` }) };
}

/** The walk up one flight, from the best approach to the best exit the probes found. */
function climbPlan(a) {
    const { f, facts } = a;
    const stair = f.stair;
    const plan = [];
    let start;
    if (facts.approachInLine.clearDepth >= 0.8) start = f.at(-0.6);
    else if (facts.footSides.left.ok) start = f.at(0.25, stair.width / 2 + R + 0.05);
    else if (facts.footSides.right.ok) start = f.at(0.25, -(stair.width / 2 + R + 0.05));
    else start = f.at(-0.6);
    plan.push(f.at(0.3), f.at(stair.run - 0.2));
    // In line only when the landing there is a real one; else step off sideways first.
    const sideways = facts.landingInLine.clearDepth < BASE_RULES.landing && (facts.headSides.left.ok || facts.headSides.right.ok);
    if (!sideways && facts.landingInLine.clearDepth >= 2 * R + 0.1) plan.push(f.at(stair.run + Math.min(0.8, facts.landingInLine.clearDepth - R)));
    else if (facts.headSides.left.ok) plan.push(f.at(stair.run - 0.25, stair.width / 2 + R + 0.05));
    else if (facts.headSides.right.ok) plan.push(f.at(stair.run - 0.25, -(stair.width / 2 + R + 0.05)));
    else plan.push(f.at(stair.run + 0.6));
    return { start, plan };
}

// ---------------------------------------------------------------------
// Doors on the routes
// ---------------------------------------------------------------------

function wallOpening(id) {
    for (const wall of spec.walls) for (const o of wall.openings || []) if (o.id === id) return { wall, o };
    return null;
}
function doorCheck(id) {
    const found = wallOpening(id);
    if (!found) return { id, ok: false, why: "missing" };
    const { o } = found;
    const ok = o.width >= BASE_RULES.door[0] - 1e-6 && o.sill + o.height >= BASE_RULES.door[1] - 1e-6 && o.sill <= 0.03 && (o.type === "door" || o.type === "doorway");
    return { id, ok, type: o.type, width: o.width, height: o.height, sill: o.sill, swing: o.door?.swing, motion: o.door?.type };
}

/** The quarter circle a hinged leaf sweeps, in plan, and whether it crosses a flight's footprint. */
function doorSweep(wall, o) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    // Wall-local +Z (side A) is the left of start→end: (uz, -ux)?? three: group.rotation.y = atan2(dx,dz) - π/2.
    const angle = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
    const localZ = [Math.sin(angle), Math.cos(angle)];
    const swing = o.door?.swing || "inward_right";
    const opensTo = swing.startsWith("outward") ? 1 : -1;
    const hingeSide = swing.endsWith("left") ? -1 : 1;
    const centre = o.offset - len / 2;
    const mid = [(x1 + x2) / 2, (z1 + z2) / 2];
    const hingeX = centre + (hingeSide * o.width) / 2;
    const side = opensTo * (wall.thickness / 2);
    const pts = [];
    for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * (Math.PI / 2);
        const lx = hingeX - hingeSide * o.width * Math.cos(a);
        const lz = side + opensTo * o.width * Math.sin(a);
        pts.push([mid[0] + ux * lx + localZ[0] * lz, mid[1] + uz * lx + localZ[1] * lz]);
    }
    pts.push([mid[0] + ux * hingeX + localZ[0] * side, mid[1] + uz * hingeX + localZ[1] * side]);
    return pts;
}

// ---------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------

console.log(`stairs-check — ${source}`);
console.log(`collision built in ${buildMs} ms; frames: ${Object.entries(FRAMES).map(([k, v]) => `${k.toUpperCase()} at [${v.ox}, ${v.oz}] y+${v.oy}${v.found ? "" : " (default)"}`).join(", ")}`);
if (missingModels.size) console.log(`furniture models missing (boxes used): ${[...missingModels].join(", ")}`);
console.log(`capsule: r ${R}, axis ${AXIS}, ${TALL} tall; physics: ramp collider (StructureBuilder.buildStairs), no step-up, treads not collided\n`);

const all = [];
const analyses = new Map();
for (const stair of spec.stairs) {
    if (ONLY && !ONLY.includes(stair.id)) continue;
    const a = analyse(stair);
    analyses.set(stair.id, a);
    const { facts } = a;
    console.log(`=== ${stair.id}: ${stair.base_height} → ${stair.top_height}, ${stair.steps} steps over ${stair.run} m, ${stair.width} wide, climbs ${stair.direction} (yaw ${stair.yaw})`);
    console.log(`  rise ${facts.rise}  going ${facts.going}  pitch ${facts.pitchDeg}°  2R+G ${facts.twoRplusG}`);
    console.log(`  foot ${facts.foot}`);
    console.log(`  head ${facts.head}`);
    console.log(`  opening(s): ${facts.holes.length ? facts.holes.map((h) => `${h.id} s∈[${h.s}] u∈[${h.u}] rails ${JSON.stringify(h.rails)}`).join("; ") : "none"}`);
    const w = facts.minHeadroom;
    console.log(`  min headroom: ${w ? `${w.fromNosing} m from the pitch line / ${w.head} from the ramp, at s=${w.s} u=${w.u}, under ${w.label} (y ${w.y})` : "open sky"}; capsule needs ${facts.capsuleNeedsAboveRamp} above the ramp at an overhead edge`);
    console.log(`  landing in line at the head: ${facts.landingInLine.clearDepth} m (${facts.landingInLine.stop})`);
    console.log(`  side exits at the head: left ${JSON.stringify(facts.headSides.left)}  right ${JSON.stringify(facts.headSides.right)}`);
    console.log(`  approach in line at the foot: ${facts.approachInLine.clearDepth} m (${facts.approachInLine.stop})`);
    console.log(`  side approaches at the foot: left ${JSON.stringify(facts.footSides.left)}  right ${JSON.stringify(facts.footSides.right)}`);
    if (facts.intrusions.length) for (const h of facts.intrusions) console.log(`  touches: ${h.label} at s=${h.s} u=${h.u} depth ${h.depth} normal [${h.normal}] point [${h.point}]`);
    if (!has("no-sim")) {
        const { start, plan } = climbPlan(a);
        const res = walk(start, plan, { name: `climb ${stair.id}`, startY: stair.base_height, finalY: stair.top_height });
        a.sim = res;
        console.log(`  WALK: ${res.ok ? "OK" : "FAILED"} from [${start.map(r3)}] via ${plan.map((p) => `[${p.map(r2)}]`).join(" ")} → ${res.ok ? `[${res.at}]` : `stuck at [${res.at}] on leg ${res.leg} → [${res.target}], ${res.left} m short${res.fell ? " (fell)" : ""}; touching: ${res.blockers?.join("; ") || res.why || "nothing (slope/edge)"}`}`);
        if (!res.ok) a.issues.push({ sev: "blocker", what: `the walk up fails: stuck at site [${res.at}] (leg ${res.leg} toward [${res.target}]); touching ${res.blockers?.join("; ") || res.why || "nothing"}` });
    }
    for (const i of a.issues) console.log(`  [${i.sev.toUpperCase()}] ${i.what}`);
    all.push(...a.issues.map((i) => ({ stair: stair.id, ...i })));
    console.log("");
}

// Door leaves swinging over a flight's head or foot (open leaves do not collide; this is visual/usability).
console.log("=== door leaves sweeping a flight's steps (at its foot's level) or its head's landing (at its top's)");
for (const [id, a] of analyses) {
    const { f } = a;
    const stair = f.stair;
    const box = (s0, s1) => [f.at(s0, -stair.width / 2), f.at(s0, stair.width / 2), f.at(s1, stair.width / 2), f.at(s1, -stair.width / 2)];
    for (const wall of spec.walls) {
        const base = wall.base_height ?? 0;
        const atFoot = Math.abs(base - stair.base_height) < 0.05;
        const atHead = Math.abs(base - stair.top_height) < 0.05;
        if (!atFoot && !atHead) continue;
        const area = atFoot ? box(0, stair.run) : box(stair.run - 0.3, stair.run + Math.max(0.05, Math.min(1.0, a.facts.landingInLine.clearDepth)));
        for (const o of wall.openings || []) {
            if (o.type !== "door" || o.door?.type === "sliding") continue;
            const sweep = doorSweep(wall, o);
            const inside = sweep.filter(([x, z]) => pointInPolygon(x, z, area));
            if (!inside.length) continue;
            const what = `${o.id} (${wall.id}, ${o.width} wide, ${o.door?.swing}) sweeps ${inside.length}/10 sample points of ${id}'s ${atFoot ? "steps" : "head landing"}`;
            console.log(`  ${what}`);
            all.push({ stair: id, sev: "minor", what: `door leaf: ${what}` });
        }
    }
}
console.log("");

// ---------------------------------------------------------------------
// Named routes: street → upper flats → roof terraces
// ---------------------------------------------------------------------

function routePoints(tag, items) {
    const out = [];
    for (const item of items) {
        if (item.climb) {
            const a = analyses.get(item.climb) ?? (stairs.has(item.climb) ? analyse(stairs.get(item.climb)) : null);
            if (!a) {
                out.push({ missing: item.climb });
                continue;
            }
            const { plan } = climbPlan(a);
            out.push(...plan.slice(0, -1).map((p) => ({ p })));
            // The plan's own exit, unless the route says where to go next.
            if (item.exit !== false) out.push({ p: plan[plan.length - 1] });
        } else if (item.site) out.push({ p: item.site });
        else if (item[1] == null) out.push({ p: [toSite(tag, [item[0], 0])[0], null] });
        else out.push({ p: toSite(tag, item) });
    }
    return out;
}

const ROUTES = [];
for (const tag of ["a", "b"]) {
    if (!FRAMES[tag].found) continue;
    const T = tag.toUpperCase();
    const y0 = FRAMES[tag].oy;
    const steps = spec.stairs.find((s) => s.id.startsWith("steps-") && Math.abs(s.start[1] - (FRAMES[tag].oz + 7.5)) < 0.5);
    ROUTES.push({
        name: `${T}: street → garden steps → outside stair → landing → north flat's door (${tag}-f-e-m-o0)`,
        tag,
        startSite: steps ? [steps.start[0] + 1.2, steps.start[1]] : null,
        startY: steps ? steps.base_height : -1,
        finalY: 3.0 + y0,
        doors: [`${tag}-f-e-m-o0`],
        items: [...(steps ? [{ climb: steps.id }] : []), [16.5, 7.5], [15.5, 7.3], [15.45, 5.83], { climb: `${tag}-stair-out`, exit: false }, [9.2, 5.83], [9.2, 6.92], [7.4, 6.92]],
    });
    ROUTES.push({
        name: `${T}: landing → south flat's door (${tag}-f-e-m-o1)`,
        tag,
        start: [9.3, 6.0],
        startY: 3.0 + y0,
        finalY: 3.0 + y0,
        doors: [`${tag}-f-e-m-o1`],
        items: [[9.2, 8.12], [7.4, 8.12]],
    });
    ROUTES.push({
        name: `${T}: north flat's hall → own stair → stone box → slider → north roof terrace`,
        tag,
        start: [7.6, 6.8],
        startY: 3.0 + y0,
        finalY: 6.0 + y0,
        doors: [`${tag}-box-n-o0`],
        items: [{ climb: `${tag}-stair-n`, exit: false }, [2.0, null], [2.0, 5.6], [5.2, 5.6], [5.2, 4.4]],
    });
    ROUTES.push({
        name: `${T}: south flat's hall → own stair → stone box → slider → south roof terrace`,
        tag,
        start: [7.6, 8.15],
        startY: 3.0 + y0,
        finalY: 6.0 + y0,
        doors: [`${tag}-box-s-o0`],
        items: [{ climb: `${tag}-stair-s`, exit: false }, [2.0, null], [2.0, 9.08], [5.2, 9.08], [5.2, 10.1], [5.2, 10.5]],
    });
}
if (FRAMES.c.found) {
    const y0 = FRAMES.c.oy;
    const steps = spec.stairs.find((s) => s.id.startsWith("steps-") && Math.abs(s.start[1] - (FRAMES.c.oz + 5.4)) < 0.5);
    ROUTES.push({
        name: "C: street → garden steps → path → recess (Entrance)",
        tag: "c",
        startSite: steps ? [steps.start[0] + 1.2, steps.start[1]] : toSite("c", [15.0, 5.4]),
        startY: steps ? steps.base_height : 0 + y0,
        finalY: 0 + y0,
        items: [...(steps ? [{ climb: steps.id }] : []), [14.0, 5.4], [12.6, 5.4], [11.8, 6.0]],
    });
    ROUTES.push({
        name: "C: recess → common stair (door c-g-slot-e-o0) → landing → C5's door (c-f-c5-mid-e-o0)",
        tag: "c",
        start: [11.8, 8.6],
        startY: 0 + y0,
        finalY: 3.2 + y0,
        doors: ["c-g-slot-e-o0", "c-f-c5-mid-e-o0"],
        items: [{ climb: "c-stair-out", exit: false }, [6.95, 8.5], [6.1, 8.5]],
    });
    ROUTES.push({
        name: "C: recess → common stair → landing → C4's door (c-f-c4-mid-e-o0)",
        tag: "c",
        start: [11.8, 8.6],
        startY: 0 + y0,
        finalY: 3.2 + y0,
        doors: ["c-g-slot-e-o0", "c-f-c4-mid-e-o0"],
        items: [{ climb: "c-stair-out", exit: false }, [7.05, 8.55], [7.3, 7.6], [7.3, 4.92], [6.1, 4.92]],
    });
    ROUTES.push({
        name: "C4: laundry & stair room → own stair → stone box → slider (c-box-n-o0) → terrace",
        tag: "c",
        start: [5.4, 5.0],
        startY: 3.2 + y0,
        finalY: 6.4 + y0,
        doors: ["c-box-n-o0"],
        items: [{ climb: "c-stair-n" }, [3.0, 5.0], [4.15, 4.0], [4.15, 2.6]],
    });
    ROUTES.push({
        name: "C5: laundry & stair room → own stair → stone box → slider (c-box-s-o0) → terrace",
        tag: "c",
        start: [5.4, 8.5],
        startY: 3.2 + y0,
        finalY: 6.4 + y0,
        doors: ["c-box-s-o0", "c-box-e-o2"],
        items: [{ climb: "c-stair-s" }, [3.0, 8.5], [4.15, 9.6], [4.15, 10.9]],
    });
}

if (!has("no-sim") && !ONLY) {
    console.log("=== named routes (doors open)");
    for (const route of ROUTES) {
        // [x, null]: x local, z carried from the previous point.
        const items = [];
        let last = null;
        for (const pt of routePoints(route.tag, route.items)) {
            if (pt.missing) {
                items.push(pt);
                continue;
            }
            let p = pt.p;
            if (p[1] == null || Number.isNaN(p[1])) p = [p[0], last[1]];
            items.push({ p });
            last = p;
        }
        const missing = items.filter((i) => i.missing);
        const start = route.startSite ?? toSite(route.tag, route.start);
        const doors = (route.doors || []).map(doorCheck);
        const doorText = doors.map((d) => `${d.id} ${d.ok ? "ok" : "FAIL"} (${d.type ?? ""} ${d.width ?? ""}×${d.height ?? ""}${d.why ? ` ${d.why}` : ""})`).join(", ");
        if (missing.length) {
            console.log(`  ${route.name}: SKIPPED, missing ${missing.map((m) => m.missing).join(", ")}`);
            continue;
        }
        const res = walk(start, items.map((i) => i.p), { name: route.name, startY: route.startY, finalY: route.finalY });
        const local = (p) => `[${toLocal(route.tag, [p[0], p[2]])}] y ${p[1]}`;
        console.log(`  ${res.ok ? "OK    " : "FAILED"} ${route.name}`);
        console.log(`         doors: ${doorText || "—"}`);
        if (!res.ok) {
            console.log(`         stuck at site [${res.at}] = ${route.tag.toUpperCase()}-local ${local(res.at)}, leg ${res.leg} → site [${res.target}] = local [${toLocal(route.tag, res.target)}], ${res.left ?? "?"} m short${res.fell ? " (fell)" : ""}`);
            console.log(`         touching: ${res.blockers?.join("; ") || res.why || "nothing (an edge or a slope)"}`);
            all.push({ stair: route.name, sev: "blocker", what: `route fails at site [${res.at}] (${route.tag.toUpperCase()}-local ${local(res.at)}): ${res.blockers?.join("; ") || res.why}` });
        }
        for (const d of doors) if (!d.ok) all.push({ stair: route.name, sev: "major", what: `door ${d.id}: ${JSON.stringify(d)}` });
    }
    console.log("");
}

// ---------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------

const order = { blocker: 0, major: 1, minor: 2 };
all.sort((m, n) => order[m.sev] - order[n.sev]);
console.log(`=== summary: ${all.filter((i) => i.sev === "blocker").length} blocker(s), ${all.filter((i) => i.sev === "major").length} major, ${all.filter((i) => i.sev === "minor").length} minor`);
for (const i of all) console.log(`  [${i.sev}] ${i.stair}: ${i.what}`);
if (has("json")) console.log(JSON.stringify(all, null, 1));
process.exitCode = all.some((i) => i.sev === "blocker") ? 1 : 0;

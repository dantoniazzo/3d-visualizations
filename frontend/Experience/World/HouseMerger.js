import * as THREE from "three";

/**
 * A published view's house, drawn from its bake, merged across rooms.
 *
 * The bake cuts the house up by room (`zone`): each room's faces are lit
 * as that room — Ladonia's 947 published meshes come back from it as 3,952
 * — and for as long as a room with switches or doors drew with materials
 * of its own they had to stay apart. With the house's light resolved into
 * one lightmap (World/LightResolver.js) every room draws with the same
 * materials, and what a frame costs out of doors is the number of meshes
 * handed to the GPU, not what is in them. So the meshes that draw alike
 * are made one here: the same material, lit the same way (by the lightmap
 * or through their vertices), on the same floor and of the same kind — as
 * the bird's-eye view shows and hides them (World/BirdView.js) — and in
 * the same square of the site (`cell`: MERGE_CELL — on a site no longer
 * than one, all of it), so that on a long site what is far behind the
 * visitor is still left out as a whole; a mesh wider than a square, the
 * outside's own, goes with the others as wide.
 *
 * Inside a merged mesh each room's triangles stay together, and the mesh
 * says where each room's are (`userData.ranges`): the thin faces' light is
 * still added up room by room (SceneBuilder.mixVertexLight), and a room can
 * be drawn by itself by its range (SceneBuilder.roomRanges) — with the
 * materials it was published with, which each range lists run by run
 * (`parts`: World/LiveRoom.js).
 *
 * A light's glass or bulb (`userData.glow`, its material swapped by its
 * switch), anything see-through, and whatever else is not a plain mesh of
 * one material is left as it is. So are the window panes (the runtime
 * file's see-through meshes): three sorts what is see-through back to
 * front by the middle of each mesh, and a row of panes made one mesh —
 * tried, panes of one material in one plane, at most 6 m of them — was
 * sorted otherwise than its panes against what is see-through behind it
 * (a window of Ladonia's, seen from the street, drew differently), for 16
 * meshes fewer of 141: most windows are one pane.
 */

/**
 * The side of a square of the site at most, in metres. Chosen by
 * measurement (Ladonia, three villas each about 15 m across on a site 62 m
 * long; M4 Pro): what a frame costs follows the number of meshes, whatever
 * is in them. Squares of 8, 16, 32 m and one square over the whole site
 * make 1,985, 1,264, 906 and 670 meshes of the house; the street then
 * draws in 20.4, 18.7, 16.2 and 15.6 ms at the highest step (9.7 at 16 m,
 * 8.0, 7.1 at the lowest, where nothing but the scene is drawn), and a
 * living room in 14.2, 13.6, 12.7 and 12.5 — although the triangles drawn
 * from inside it rise (4.24, 4.41, 4.56, 4.68 million of the frame's; a
 * bedroom's 4.17, 4.30, 4.34, 4.84). So one square for a site of that
 * size, and squares only where a site is several times as long: there
 * they keep a house at the far end of the street out of every frame.
 */
export const MERGE_CELL = 64;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _centre = new THREE.Vector3();

/** Whether a mesh can be made one with others that draw as it does. */
function mergeable(mesh) {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh) return false;
    if (mesh.children.length || mesh.userData.glow || mesh.userData.shadowCaster) return false;
    const material = mesh.material;
    if (!material || Array.isArray(material) || material.transparent || material.visible === false) return false;
    const geometry = mesh.geometry;
    if (!geometry?.attributes.position || geometry.groups.length) return false;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
    if (Object.keys(geometry.morphAttributes).length) return false;
    for (const attribute of Object.values(geometry.attributes)) if (attribute.isInterleavedBufferAttribute || attribute.isInstancedBufferAttribute) return false;
    return true;
}

const IDENTITY = new THREE.Matrix4();

/** What a mesh's vertices carry, by name: only meshes that carry the same are made one. */
function attributesOf(geometry) {
    return Object.keys(geometry.attributes)
        .sort()
        .map((name) => {
            const attribute = geometry.attributes[name];
            return `${name}:${attribute.itemSize}:${attribute.array.constructor.name}${attribute.normalized ? ":n" : ""}`;
        })
        .join(",");
}

/**
 * The squares of the site: laid from the corner of what is merged — the
 * middles of the meshes' boxes — as many across and along as its extent
 * needs at `cell` metres a side at most, all one size. A site smaller than
 * a square is one square, wherever the world's origin is in it.
 *
 * @returns {(mesh: THREE.Mesh) => string}  the square a mesh is in, by the
 *          middle of its box — or "wide", wider than a square (the
 *          outside's own, the terrain); "" with no squares
 */
function squares(meshes, cell) {
    if (!(cell > 0)) return () => "";
    const where = new Map();
    const min = [Infinity, Infinity];
    const max = [-Infinity, -Infinity];
    for (const mesh of meshes) {
        const geometry = mesh.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        _box.copy(geometry.boundingBox).applyMatrix4(mesh.matrix);
        _box.getSize(_size);
        if (Math.max(_size.x, _size.z) > cell) {
            where.set(mesh, null);
            continue;
        }
        _box.getCenter(_centre);
        where.set(mesh, [_centre.x, _centre.z]);
        min[0] = Math.min(min[0], _centre.x);
        min[1] = Math.min(min[1], _centre.z);
        max[0] = Math.max(max[0], _centre.x);
        max[1] = Math.max(max[1], _centre.z);
    }
    const count = [0, 1].map((axis) => Math.max(1, Math.ceil((max[axis] - min[axis]) / cell)));
    const side = [0, 1].map((axis) => (max[axis] - min[axis]) / count[axis] || cell);
    return (mesh) => {
        const at = where.get(mesh);
        if (!at) return "wide";
        return [0, 1].map((axis) => Math.min(count[axis] - 1, Math.floor((at[axis] - min[axis]) / side[axis]))).join(",");
    };
}

/**
 * A colour a vertex (`tint`), for a material that takes its colour from
 * its vertices: one colour over all `count` of them, or each run's own.
 *
 * @param {number} count
 * @param {number[]} [tint]  red, green, blue, as a material's colour is kept; white without
 * @param {{ count: number, tint: number[] }[]} [runs]
 */
export function tintOf(count, tint = null, runs = [{ count, tint }]) {
    const array = new Float32Array(count * 3);
    let at = 0;
    for (const run of runs) {
        const [r, g, b] = run.tint ?? [1, 1, 1];
        for (let k = 0; k < run.count; k++) {
            array[at++] = r;
            array[at++] = g;
            array[at++] = b;
        }
    }
    return new THREE.BufferAttribute(array, 3);
}

/**
 * An attribute written again and again, a range at a time
 * (SceneBuilder.mixThinLight): three sends the ranges asked for and forgets
 * them — but not when it first sends the whole of it, so they are forgotten
 * here then, not sent a second time with the next.
 */
export function rewritten(attribute) {
    attribute.setUsage(THREE.DynamicDrawUsage);
    attribute.onUpload(forgetRanges);
    return attribute;
}

function forgetRanges() {
    this.clearUpdateRanges();
}

/** A vertex-lit mesh's baked light — the variants' (`_day`…) and what is drawn of it (`color`): kept off the GPU but for the last. */
const isLight = (name) => name === "color" || name.startsWith("_");

/** An attribute's values as floats, whatever it is stored as. */
export function floatValues(attribute) {
    if (attribute.array instanceof Float32Array && !attribute.isInterleavedBufferAttribute) return attribute.array;
    const size = attribute.itemSize;
    const values = new Float32Array(attribute.count * size);
    const get = ["getX", "getY", "getZ", "getW"];
    for (let i = 0; i < attribute.count; i++) {
        for (let c = 0; c < size; c++) values[i * size + c] = attribute[get[c]](i);
    }
    return values;
}

/**
 * The meshes of a published view made as few as draw the same picture.
 *
 * @param {THREE.Mesh[]} meshes  as SceneBuilder.usePublishedView made them,
 *        each with its `userData` (`lighting`, `level`, `kind`, `zone`,
 *        `material`, and a vertex-lit one's `switchLight`), not yet in the
 *        scene. Those merged are emptied: their geometry's arrays let go.
 * @param {object} [options]
 * @param {number} [options.cell]  the side of a square of the site; 0 for none
 * @param {string[]} [options.without]  baked light of the thin faces that
 *        nothing will read, by attribute name (the variants' light less the
 *        sun's, where no door dims a room): let go, not kept
 * @returns {{ meshes: THREE.Mesh[], thin: object[], merged: number, into: number }}
 *          `meshes`: what to draw, in the order of the first of each;
 *          `thin`: each room's part of each merged vertex-lit mesh —
 *          `{ mesh, zone, vertexStart, vertexCount, light, switchLight }`,
 *          `light` the variants' baked light by attribute name
 *          (`{ array, itemSize }`, the merged mesh's own) and `switchLight`
 *          each switch's on that part (`{ index, indirect, values }`, three
 *          numbers a vertex)
 */
export function mergeRooms(meshes, { cell = MERGE_CELL, without = [] } = {}) {
    const buckets = new Map();
    const order = [];
    // A geometry two meshes draw (two nodes of one glTF mesh) stays theirs: merged, it is emptied.
    const users = new Map();
    for (const mesh of meshes) users.set(mesh.geometry, (users.get(mesh.geometry) ?? 0) + 1);
    const plain = meshes.filter((mesh) => mergeable(mesh) && users.get(mesh.geometry) === 1);
    for (const mesh of plain) mesh.updateMatrix();
    const squareOf = squares(plain, cell);
    const mergeables = new Set(plain);
    for (const mesh of meshes) {
        if (!mergeables.has(mesh)) {
            order.push(mesh);
            continue;
        }
        const data = mesh.userData;
        const square = squareOf(mesh);
        const key = [
            mesh.material.id,
            data.lighting ?? "",
            data.level ?? 0,
            data.kind ?? "",
            mesh.castShadow,
            mesh.receiveShadow,
            mesh.renderOrder,
            mesh.layers.mask,
            mesh.frustumCulled,
            mesh.matrix.equals(IDENTITY) ? "" : mesh.matrix.elements.join(","),
            mesh.geometry.index ? "i" : "",
            attributesOf(mesh.geometry),
            square,
        ].join("|");
        let bucket = buckets.get(key);
        if (!bucket) {
            buckets.set(key, (bucket = { cell: square, sources: [] }));
            order.push(bucket);
        }
        bucket.sources.push(mesh);
    }

    const out = [];
    const thin = [];
    const left = new Set(without);
    let merged = 0;
    let into = 0;
    for (const entry of order) {
        if (entry.isMesh) {
            out.push(entry);
            continue;
        }
        merged += entry.sources.length;
        into++;
        out.push(mergeBucket(entry, thin, left));
    }
    return { meshes: out, thin, merged, into };
}

/** One mesh of a bucket's: its rooms' triangles one room after another. */
function mergeBucket({ cell, sources }, thin, without = new Set()) {
    // Each room's together, the rooms in the order first met.
    const zones = new Map();
    for (const source of sources) {
        const zone = source.userData.zone ?? null;
        if (!zones.has(zone)) zones.set(zone, zones.size);
    }
    sources = sources
        .map((source, at) => ({ source, at }))
        .sort((a, b) => zones.get(a.source.userData.zone ?? null) - zones.get(b.source.userData.zone ?? null) || a.at - b.at)
        .map(({ source }) => source);

    const first = sources[0];
    const lit = first.userData.lighting === "vertex";
    // A vertex-lit mesh whose material takes no vertex colours — a metal, kept as it is live — draws none of that light.
    const mixes = lit && Boolean(first.material.vertexColors);
    let vertexCount = 0;
    let indexCount = 0;
    for (const { geometry } of sources) {
        const count = geometry.attributes.position.count;
        vertexCount += count;
        indexCount += geometry.index ? geometry.index.count : count;
    }

    const geometry = new THREE.BufferGeometry();
    const light = {};
    for (const name of Object.keys(first.geometry.attributes)) {
        const kept = lit && isLight(name);
        if (kept && (!mixes || without.has(name))) continue;
        const from = first.geometry.attributes[name];
        // (The thin faces' light is added up as numbers, whatever a file stores it as: floats.)
        const array = kept ? new Float32Array(vertexCount * from.itemSize) : new from.array.constructor(vertexCount * from.itemSize);
        let at = 0;
        for (const source of sources) {
            const part = source.geometry.attributes[name];
            const values = kept ? floatValues(part) : part.array;
            array.set(values.length === part.count * part.itemSize ? values : values.subarray(0, part.count * part.itemSize), at);
            at += part.count * part.itemSize;
        }
        if (kept && name !== "color") {
            light[name] = { array, itemSize: from.itemSize };
            continue;
        }
        const attribute = new THREE.BufferAttribute(array, from.itemSize, kept ? false : from.normalized);
        // What is drawn of the thin faces' light is written again as switches and doors change.
        if (kept) rewritten(attribute);
        geometry.setAttribute(name, attribute);
    }

    // Each surface's own colour, where the material leaves it to the vertices (SceneBuilder's tintShader).
    if (first.material.userData.tinted) {
        geometry.setAttribute("tint", tintOf(vertexCount, null, sources.map((source) => ({ count: source.geometry.attributes.position.count, tint: source.userData.tint }))));
    }

    const index = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(indexCount);
    const ranges = [];
    const parts = [];
    let v = 0;
    let i = 0;
    for (const source of sources) {
        const from = source.geometry.index?.array ?? null;
        const vertices = source.geometry.attributes.position.count;
        const count = from ? source.geometry.index.count : vertices;
        if (from) for (let k = 0; k < count; k++) index[i + k] = from[k] + v;
        else for (let k = 0; k < count; k++) index[i + k] = v + k;
        const zone = source.userData.zone ?? null;
        let range = ranges[ranges.length - 1];
        if (!range || range.zone !== zone) {
            ranges.push((range = { zone, start: i, count: 0, vertexStart: v, vertexCount: 0, parts: [] }));
            parts.push([]);
        }
        range.count += count;
        range.vertexCount += vertices;
        // Which material of the published version each run of its triangles was made with (World/LiveRoom.js draws a room by them).
        const key = source.userData.material;
        const run = range.parts[range.parts.length - 1];
        if (run && run.key === key) {
            run.count += count;
            run.vertexCount += vertices;
        } else {
            range.parts.push({ key, start: i, count, vertexStart: v, vertexCount: vertices });
        }
        parts[parts.length - 1].push({ at: v - range.vertexStart, vertices, switchLight: source.userData.switchLight ?? [] });
        v += vertices;
        i += count;
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    // Its box the rooms' boxes', its sphere as three would work it out — about the box's middle — in one pass.
    const box = new THREE.Box3();
    for (const source of sources) {
        if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
        box.union(source.geometry.boundingBox);
    }
    geometry.boundingBox = box;
    const middle = box.getCenter(new THREE.Vector3());
    const at = geometry.attributes.position.array;
    let far = 0;
    for (let k = 0; k < at.length; k += 3) {
        const x = at[k] - middle.x;
        const y = at[k + 1] - middle.y;
        const z = at[k + 2] - middle.z;
        const distance = x * x + y * y + z * z;
        if (distance > far) far = distance;
    }
    geometry.boundingSphere = new THREE.Sphere(middle, Math.sqrt(far));

    const mesh = new THREE.Mesh(geometry, first.material);
    mesh.applyMatrix4(first.matrix);
    const data = first.userData;
    mesh.name = sources.length > 1 ? `${first.material.name || data.material}@${data.level ?? 0}${data.kind ? `:${data.kind}` : ""}${cell ? `[${cell}]` : ""}` : first.name;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    mesh.layers.mask = first.layers.mask;
    mesh.frustumCulled = first.frustumCulled;
    mesh.visible = first.visible;
    mesh.raycast = first.raycast;
    mesh.userData = {
        batch: true,
        level: data.level ?? 0,
        kind: data.kind ?? null,
        lighting: data.lighting,
        // The room it is lit as, when it is all one room's; else by its ranges.
        zone: ranges.length === 1 ? ranges[0].zone : null,
        material: data.material,
        // Each room's triangles: where its indices start and how many, and its vertices — and, run by run (`parts`), the
        // published material each was made with: materials that look alike are one here (`material` is the first's).
        ranges,
        merged: sources.length,
    };

    if (mixes) {
        ranges.forEach((range, r) => {
            thin.push({ mesh, zone: range.zone, vertexStart: range.vertexStart, vertexCount: range.vertexCount, light, switchLight: joinSwitchLight(parts[r], range.vertexCount) });
        });
    }

    // The rooms' own meshes let go: their arrays are in the merged one now.
    for (const source of sources) {
        const from = source.geometry;
        for (const name of Object.keys(from.attributes)) from.deleteAttribute(name);
        from.setIndex(null);
        from.dispose();
        delete source.userData.switchLight;
    }
    return mesh;
}

/**
 * Each switch's light on a room's part of a merged mesh, from its sources'
 * (SceneBuilder's takeSwitchLight): three numbers a vertex — its colour,
 * not its alpha — over the part's vertices; nothing where a source has
 * none of that switch's.
 */
function joinSwitchLight(sources, vertexCount) {
    const joined = new Map();
    for (const { at, vertices, switchLight } of sources) {
        for (const { index, indirect, values } of switchLight) {
            const step = values.length / vertices;
            // A part that is one source's, its light three a vertex already: as it is.
            if (sources.length === 1 && step === 3) {
                joined.set(`${index}|${indirect}`, { index, indirect, values });
                continue;
            }
            const key = `${index}|${indirect}`;
            if (!joined.has(key)) joined.set(key, { index, indirect, values: new Float32Array(vertexCount * 3) });
            const out = joined.get(key).values;
            for (let k = 0, o = at * 3, s = 0; k < vertices; k++, o += 3, s += step) {
                out[o] = values[s];
                out[o + 1] = values[s + 1];
                out[o + 2] = values[s + 2];
            }
        }
    }
    return [...joined.values()];
}

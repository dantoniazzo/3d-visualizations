import * as THREE from "three";

import { boxUVs, mergeParts } from "./KitLibrary.js";
import { GROUNDS, terrainHeight, terrainPaint } from "../../../../shared/landscape.js";
import { pointInPolygon } from "../../../../shared/vegetation.js";

/**
 * What of a site's landscape stands still (shared/landscape.js): its
 * terrain, dry-stone walls, kerbs and road markings, pergolas, corten
 * planters, glass railings and pool — part of the house, so walked on,
 * collided with, published and baked like its walls (`group`). The pool's
 * water and the garden lights, which move or come and go with the
 * evening, are apart (`live`).
 *
 * The terrain is a grid a metre a square round the villas (`detail`) and
 * coarser out to its edges, each point at the terrain's height there
 * (terrainHeight) and painted with how much of each ground it is
 * (terrainPaint): the five grounds' photographs are blended by it, each at
 * two scales, near and far, so none repeats, under a slower variation in
 * brightness. Grid lines run along every hard pad's and hole's edges, so a
 * step in the ground — the garden a metre above the street, inside the
 * retaining wall — is a step, and a hole — the pool, the steps through the
 * wall — has straight sides.
 *
 * Everything in `group` is kept whole when a public view is published
 * (`userData.keepWhole`, Publish/Snapshot.js): a visitor walks round its
 * walls, planters and pergolas and over its terrain to places no sampled
 * viewpoint looks from, and its faces are few beside the houses'.
 *
 * @param {object} landscape  the spec's
 * @param {MaterialLibrary} materials
 */
export function buildLandscape(landscape, materials) {
    const group = new THREE.Group();
    group.name = "landscape";
    const live = new THREE.Group();
    live.name = "landscape-live";

    const holes = [...(landscape.terrain?.holes || []), ...(landscape.pools || []).map((pool) => boxPolygon(pool.box, 0.005))];
    if (landscape.terrain) group.add(...buildTerrain(landscape.terrain, holes, materials));

    const parts = new Parts(materials);
    for (const wall of landscape.walls || []) addWall(parts, wall);
    for (const kerb of landscape.kerbs || []) addKerb(parts, kerb);
    for (const pergola of landscape.pergolas || []) addPergola(parts, pergola);
    for (const planter of landscape.planters || []) addPlanter(parts, planter);
    for (const railing of landscape.railings || []) addRailing(parts, railing);
    for (const pool of landscape.pools || []) addPool(parts, pool, live);
    addMarkings(parts, landscape.markings || []);
    group.add(...parts.meshes());
    group.traverse((node) => {
        if (node.isMesh) node.userData.keepWhole = true;
    });

    return { group, live };
}

/**
 * What of a landscape moves, alone — the pools' water — for a public view
 * that builds none of the rest (SceneBuilder.buildFromRuntime): the same
 * meshes as `buildLandscape`'s `live`, so the garden (World/Flora) ripples
 * and lights them as it does in the editor.
 */
export function buildLandscapeLive(landscape) {
    const live = new THREE.Group();
    live.name = "landscape-live";
    for (const pool of landscape.pools || []) live.add(poolWater(pool));
    return live;
}

/**
 * A landscape material drawn by a shader of its own, made again for a
 * published view whose copy of it came through a glTF file, which keeps no
 * shader (Publish/Runtime.js): the terrain's. Null for any other.
 *
 * @param {THREE.Material} material  the copy
 * @param {MaterialLibrary} materials
 */
export function landscapeMaterial(material, materials) {
    const terrain = material?.userData?.landscape === "terrain" || (material?.name === "terrain" && material.userData?.attributes?.includes("paint"));
    return terrain ? terrainMaterial(materials) : null;
}

// ---------------------------------------------------------------------
// The terrain
// ---------------------------------------------------------------------

function buildTerrain(terrain, holes, materials) {
    const detail = terrain.detail || { centre: [0, 0], half: 80, step: 1, outer: 6 };
    const [cx, cz] = detail.centre;
    const half = detail.half;
    const step = detail.step ?? 1;
    const outerStep = detail.outer ?? 6;
    const size = terrain.size ?? 400;
    const [tx, tz] = terrain.centre ?? [0, 0];

    // Lines the grid must have: each hard pad's edges, either side, and each hole's.
    const extraX = [];
    const extraZ = [];
    for (const pad of terrain.pads || []) {
        if ((pad.margin ?? 0) > 0) continue;
        for (const [x, z] of pad.polygon) {
            extraX.push(x, x - 0.01, x + 0.01);
            extraZ.push(z, z - 0.01, z + 0.01);
        }
    }
    // The pads that meet at the retaining wall: their facing edges.
    for (const pad of terrain.pads || []) for (const [x, z] of pad.polygon) if ((pad.margin ?? 0) > 0) extraZ.push(z);
    for (const hole of holes) for (const [x, z] of hole) {
        extraX.push(x);
        extraZ.push(z);
    }

    const inner = gridMesh(terrain, {
        xs: lines(cx - half, cx + half, step, extraX),
        zs: lines(cz - half, cz + half, step, extraZ),
        skip: (x, z) => holes.some((hole) => pointInPolygon(x, z, hole)),
        skirt: 1.5,
    });
    const outer = gridMesh(terrain, {
        xs: lines(tx - size / 2, tx + size / 2, outerStep, [cx - half, cx + half]),
        zs: lines(tz - size / 2, tz + size / 2, outerStep, [cz - half, cz + half]),
        skip: (x, z) => x > cx - half && x < cx + half && z > cz - half && z < cz + half,
    });

    const material = terrainMaterial(materials);
    return [inner, outer].map((geometry, k) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = k ? "terrain-far" : "terrain";
        mesh.receiveShadow = true;
        mesh.userData = { kind: "surface", surfaceKind: "ground", label: "Ground" };
        return mesh;
    });
}

/** Grid lines from `from` to `to` every `step`, and the extra ones in range, sorted, none closer than 5 mm. */
function lines(from, to, step, extra = []) {
    const out = [];
    for (let v = from; v <= to + 1e-6; v += step) out.push(v);
    for (const v of extra) if (v > from && v < to) out.push(v);
    out.sort((a, b) => a - b);
    return out.filter((v, i) => i === 0 || v - out[i - 1] > 0.005);
}

/**
 * A grid over the terrain on the lines given, cells `skip` takes (by their
 * middle) left out; a skirt hanging `skirt` metres down from its edge.
 */
function gridMesh(terrain, { xs, zs, skip, skirt = 0 }) {
    const columns = xs.length;
    const positions = [];
    const normals = [];
    const uvs = [];
    const paint = [];
    const normal = new THREE.Vector3();
    const height = (x, z) => terrainHeight(terrain, x, z);
    const push = (x, y, z, n) => {
        positions.push(x, y, z);
        normals.push(n.x, n.y, n.z);
        uvs.push(x, -z);
        paint.push(...paintAt(terrain, x, z));
    };
    for (const z of zs) {
        for (const x of xs) {
            const e = 0.6;
            normal.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
            push(x, height(x, z), z, normal);
        }
    }
    const indices = [];
    for (let row = 0; row < zs.length - 1; row++) {
        for (let column = 0; column < columns - 1; column++) {
            if (skip((xs[column] + xs[column + 1]) / 2, (zs[row] + zs[row + 1]) / 2)) continue;
            const a = row * columns + column;
            const b = a + 1;
            const c = a + columns;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    if (skirt > 0) {
        // Down from each edge, so no crack shows where the coarse grid meets it.
        const edge = [];
        for (let k = 0; k < columns; k++) edge.push(k);
        for (let k = 1; k < zs.length; k++) edge.push(k * columns + columns - 1);
        for (let k = columns - 2; k >= 0; k--) edge.push((zs.length - 1) * columns + k);
        for (let k = zs.length - 2; k > 0; k--) edge.push(k * columns);
        edge.push(0);
        const down = new THREE.Vector3(0, 1, 0);
        const base = positions.length / 3;
        for (const index of edge) push(positions[index * 3], positions[index * 3 + 1] - skirt, positions[index * 3 + 2], down);
        for (let k = 0; k < edge.length - 1; k++) {
            const a = edge[k];
            const b = edge[k + 1];
            const c = base + k;
            const d = base + k + 1;
            indices.push(a, b, c, b, d, c);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("paint", new THREE.Float32BufferAttribute(paint, 4));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
}

/** The terrain's paint at (x, z), as its shader reads it: meadow is what is left of [lawn, gravel, forest, hillside]. */
function paintAt(terrain, x, z) {
    const w = terrainPaint(terrain, x, z);
    return [w[GROUNDS.indexOf("lawn")], w[GROUNDS.indexOf("gravel")], w[GROUNDS.indexOf("forest")], w[GROUNDS.indexOf("hillside")]];
}

/**
 * Paint a published copy of the terrain that came without its paint — a
 * version published, or baked, before its snapshot carried it (Blender's
 * bake keeps it now, as `_PAINT0` and `_PAINT1`): each vertex as the
 * terrain is painted where it stands (terrainPaint), as the editor paints
 * its grid's.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {object} terrain  the spec's landscape terrain
 * @param {THREE.Matrix4} [matrixWorld]  where the geometry stands
 */
export function paintTerrain(geometry, terrain, matrixWorld = null) {
    const position = geometry.getAttribute("position");
    const paint = new Float32Array(position.count * 4);
    const at = new THREE.Vector3();
    for (let v = 0; v < position.count; v++) {
        at.fromBufferAttribute(position, v);
        if (matrixWorld) at.applyMatrix4(matrixWorld);
        paint.set(paintAt(terrain, at.x, at.z), v * 4);
    }
    geometry.setAttribute("paint", new THREE.BufferAttribute(paint, 4));
}

/**
 * The terrain's material: three's standard material, its colour the five
 * grounds blended by the paint, each at two scales — near, and four and a
 * bit times as large far off — under a slower variation in brightness;
 * its relief the meadow's.
 */
function terrainMaterial(materials) {
    const textures = materials.textures;
    const ids = { lawn: "terrain_lawn", meadow: "terrain_meadow", gravel: "terrain_gravel", forest: "terrain_forest", hillside: "terrain_hillside" };
    const maps = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, textures.get(id)]));
    const tile = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, materials.tileSize(id)]));
    const relief = textures.getData("terrain_meadow", "normal");
    const normal = relief?.clone() ?? null;
    if (normal) {
        normal.repeat.setScalar(1 / tile.meadow);
        // For the GPU once its picture — its source's, which may still be
        // on its way — is in (TextureLibrary.whenLoaded), not before.
        normal.version = 0;
        textures.whenLoaded(relief).then(() => (normal.needsUpdate = true));
    }
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, metalness: 0, normalMap: normal });
    material.name = "terrain";
    // Behind the paving, the roads and the lawns' edges laid on it.
    material.polygonOffset = true;
    material.polygonOffsetFactor = 2;
    material.polygonOffsetUnits = 4;
    // Its paint, which a merge into a batch (StaticBatcher) must keep; and
    // what it is, for a published view to make it again (landscapeMaterial).
    material.userData.attributes = ["paint"];
    material.userData.landscape = "terrain";
    if (normal) material.normalScale.setScalar(0.8);
    const uniforms = {
        tLawn: { value: maps.lawn },
        tMeadow: { value: maps.meadow },
        tGravel: { value: maps.gravel },
        tForest: { value: maps.forest },
        tHill: { value: maps.hillside },
        tiles: { value: new THREE.Vector4(tile.lawn, tile.meadow, tile.gravel, tile.forest) },
        tileHill: { value: tile.hillside },
        // Each ground's colour, a little warmed or cooled to sit together.
        tintLawn: { value: new THREE.Color(0.82, 1.0, 0.78) },
        tintMeadow: { value: new THREE.Color(0.72, 1.0, 0.58) },
        tintForest: { value: new THREE.Color(0.78, 0.92, 0.62) },
    };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute vec4 paint;\nvarying vec4 vPaint;\nvarying vec2 vSite;\nvarying float vFar;")
            .replace(
                "#include <worldpos_vertex>",
                "#include <worldpos_vertex>\nvPaint = paint;\nvec4 siteWorld = modelMatrix * vec4( transformed, 1.0 );\nvSite = siteWorld.xz;\nvFar = length( cameraPosition.xz - siteWorld.xz );"
            );
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <common>",
                `#include <common>
uniform sampler2D tLawn, tMeadow, tGravel, tForest, tHill;
uniform vec4 tiles;
uniform float tileHill;
uniform vec3 tintLawn, tintMeadow, tintForest;
varying vec4 vPaint;
varying vec2 vSite;
varying float vFar;
vec3 ground( sampler2D map, float tile ) {
    vec3 near = texture2D( map, vSite / tile ).rgb;
    vec3 far = texture2D( map, vSite / ( tile * 4.37 ) + 0.37 ).rgb;
    return mix( near, far, smoothstep( 10.0, 60.0, vFar ) * 0.7 );
}`
            )
            .replace(
                "#include <map_fragment>",
                `{
    vec4 w = clamp( vPaint, 0.0, 1.0 );
    float meadow = clamp( 1.0 - w.x - w.y - w.z - w.w, 0.0, 1.0 );
    vec3 colour = ground( tMeadow, tiles.y ) * tintMeadow * meadow;
    if ( w.x > 0.004 ) colour += ground( tLawn, tiles.x ) * tintLawn * w.x;
    if ( w.y > 0.004 ) colour += ground( tGravel, tiles.z ) * vec3( 0.72, 0.7, 0.66 ) * w.y;
    if ( w.z > 0.004 ) colour += ground( tForest, tiles.w ) * tintForest * w.z;
    if ( w.w > 0.004 ) colour += ground( tHill, tileHill ) * w.w;
    // A slow variation in brightness, so no stretch of ground is the same.
    float slow = dot( texture2D( tMeadow, vSite / 97.0 ).rgb, vec3( 0.333 ) );
    colour *= mix( 0.82, 1.18, smoothstep( 0.15, 0.45, slow ) );
    diffuseColor.rgb *= colour;
}`
            );
    };
    material.customProgramCacheKey = () => "terrain";
    return material;
}

// ---------------------------------------------------------------------
// What stands on it
// ---------------------------------------------------------------------

/** Geometry gathered by material, each lot merged into one mesh at the end. */
class Parts {
    constructor(materials) {
        this.materials = materials;
        this.lots = new Map();
    }

    /** A finish's material (`finish:<id>`), or a trim's (`trim:<id>`), or one made here. */
    add(key, geometry, { tile = null } = {}) {
        if (tile) boxUVs(geometry.attributes.normal ? geometry : (geometry.computeVertexNormals(), geometry), tile);
        if (!this.lots.has(key)) this.lots.set(key, []);
        this.lots.get(key).push(geometry);
    }

    material(key) {
        const [kind, id] = key.split(":");
        if (kind === "finish") return this.materials.getSurface(id, "wall");
        if (kind === "trim") return this.materials.getTrim(id);
        return MADE[id]();
    }

    meshes() {
        const out = [];
        for (const [key, geometries] of this.lots) {
            const geometry = mergeParts(geometries);
            for (const part of geometries) part.dispose();
            const mesh = new THREE.Mesh(geometry, this.material(key));
            mesh.name = `landscape:${key}`;
            mesh.castShadow = !key.includes("glass") && !key.endsWith("paint");
            mesh.receiveShadow = true;
            mesh.userData = { kind: "surface", surfaceKind: "landscape", label: LABELS[key] ?? "Garden" };
            out.push(mesh);
        }
        return out;
    }
}

const LABELS = {
    "finish:dry_stone": "Dry-stone wall",
    "finish:corten": "Corten planter",
    "finish:hardwood_deck": "Timber",
    "trim:frame_anthracite": "Pergola",
    "trim:glass": "Glass balustrade",
    "finish:pool_mosaic": "Pool",
    "made:paint": "Road marking",
};

const MADE = {
    paint: () => {
        const material = new THREE.MeshStandardMaterial({ color: "#ecebe4", roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        material.name = "road_paint";
        return material;
    },
    soil: () => {
        const material = new THREE.MeshStandardMaterial({ color: "#3a2d22", roughness: 1 });
        material.name = "planter_soil";
        return material;
    },
};

/** A box w x h x d, its middle at (x, y, z), turned `yaw` about its middle. */
function box(w, h, d, x, y, z, yaw = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (yaw) geometry.rotateY(yaw);
    return geometry.translate(x, y, z);
}

/**
 * A wall-like solid along a segment: `thickness` wide, from `base` up to
 * `top0` at its start and `top1` at its end, running on `extend` past
 * each end (or [start, end], a negative one stopping short).
 */
function prism([ax, az], [bx, bz], base, top0, top1, thickness, extend = 0) {
    const length = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / length;
    const uz = (bz - az) / length;
    const nx = -uz * (thickness / 2);
    const nz = ux * (thickness / 2);
    const [e0, e1] = Array.isArray(extend) ? extend : [extend, extend];
    const sx = ax - ux * e0;
    const sz = az - uz * e0;
    const ex = bx + ux * e1;
    const ez = bz + uz * e1;
    const corners = [
        [sx + nx, base, sz + nz],
        [ex + nx, base, ez + nz],
        [ex + nx, top1, ez + nz],
        [sx + nx, top0, sz + nz],
        [sx - nx, base, sz - nz],
        [ex - nx, base, ez - nz],
        [ex - nx, top1, ez - nz],
        [sx - nx, top0, sz - nz],
    ];
    // Six faces, each its own four corners, so its normals are its own.
    const faces = [
        [0, 1, 2, 3],
        [5, 4, 7, 6],
        [3, 2, 6, 7],
        [4, 5, 1, 0],
        [4, 0, 3, 7],
        [1, 5, 6, 2],
    ];
    const positions = [];
    for (const [a, b, c, d] of faces) for (const k of [a, b, c, a, c, d]) positions.push(...corners[k]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    // Wound outward whichever way the segment runs.
    const n = geometry.attributes.normal;
    const p = geometry.attributes.position;
    const mid = new THREE.Vector3((sx + ex) / 2, (base + (top0 + top1) / 2) / 2, (sz + ez) / 2);
    const v = new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).sub(mid);
    const face = new THREE.Vector3(n.getX(0), n.getY(0), n.getZ(0));
    if (face.dot(v) < 0) {
        const array = p.array;
        for (let i = 0; i < array.length; i += 9) {
            for (let k = 0; k < 3; k++) [array[i + 3 + k], array[i + 6 + k]] = [array[i + 6 + k], array[i + 3 + k]];
        }
        geometry.computeVertexNormals();
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
    return geometry;
}

/** A dry-stone wall along its path, its top a pale stone coping. */
function addWall(parts, wall) {
    const tile = parts.materials.tileSize(wall.finish ?? "dry_stone");
    const [top0, top1] = wall.slope ?? [wall.top, wall.top];
    const points = wall.path;
    // Each piece runs on past its end, filling the corner; the next one
    // starts beyond that, so no two share a face there.
    const runOn = (i, e) => [i === 0 ? e : -e, e];
    for (let i = 0; i < points.length - 1; i++) {
        const t0 = i === 0 ? top0 : wall.top;
        const t1 = i === points.length - 2 ? top1 : wall.top;
        parts.add(`finish:${wall.finish ?? "dry_stone"}`, prism(points[i], points[i + 1], wall.base, t0, t1, wall.thickness, runOn(i, wall.thickness / 2)), { tile });
        // Its coping, following its top — unless it is laid dry (`coping: false`).
        if (wall.coping !== false) parts.add("finish:concrete_steps", slopedPanel([points[i][0], t0, points[i][1]], [points[i + 1][0], t1, points[i + 1][1]], 0.06, wall.thickness + 0.06, runOn(i, wall.thickness / 2 + 0.03)), { tile: 1.5 });
    }
}

function addKerb(parts, kerb) {
    for (let i = 0; i < kerb.path.length - 1; i++) {
        parts.add("finish:concrete_steps", prism(kerb.path[i], kerb.path[i + 1], kerb.base - 0.1, kerb.base + kerb.height, kerb.base + kerb.height, kerb.width), { tile: 1.5 });
    }
}

/** Road paint: strips a few millimetres proud of the surface, dashed where asked. */
function addMarkings(parts, markings) {
    for (const line of markings) {
        const [ax, az] = line.from;
        const [bx, bz] = line.to;
        const length = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / length;
        const uz = (bz - az) / length;
        const [on, off] = line.dash ?? [length, 0];
        for (let s = 0; s < length; s += on + off) {
            const e = Math.min(length, s + on);
            const geometry = new THREE.PlaneGeometry(e - s, line.width).rotateX(-Math.PI / 2).rotateY(-Math.atan2(uz, ux));
            geometry.translate(ax + ux * (s + e) / 2, line.base + 0.006, az + uz * (s + e) / 2);
            parts.add("made:paint", geometry);
        }
    }
}

/**
 * A pergola: posts and a frame of powder-coated aluminium (`frame`, a trim;
 * anthracite by default), louvres across its top — aluminium blades in the
 * frame's colour, tilted open as a bioclimatic roof's stand by day, or with
 * `louvres: "timber"` timber slats — and timber lattice screens down the
 * sides it names. Its back stands against the house; posts at its front
 * corners, or all four.
 */
function addPergola(parts, pergola) {
    const [x0, z0, x1, z1] = pergola.box;
    const top = pergola.base + pergola.height;
    const frame = `trim:${pergola.frame || "frame_anthracite"}`;
    const blades = `trim:${pergola.louvreTrim || pergola.frame || "frame_anthracite"}`;
    const post = 0.12;
    const beam = 0.22;
    // The frame round the top.
    parts.add(frame, box(x1 - x0, beam, post, (x0 + x1) / 2, top - beam / 2, z0 + post / 2));
    parts.add(frame, box(x1 - x0, beam, post, (x0 + x1) / 2, top - beam / 2, z1 - post / 2));
    parts.add(frame, box(post, beam, z1 - z0 - post * 2, x0 + post / 2, top - beam / 2, (z0 + z1) / 2));
    parts.add(frame, box(post, beam, z1 - z0 - post * 2, x1 - post / 2, top - beam / 2, (z0 + z1) / 2));
    const corners = [
        [x0, z0],
        [x1, z0],
        [x0, z1],
        [x1, z1],
    ];
    // Against the house (`against`: the sides it is fixed to, "z0" — its
    // north — by default), the frame is fixed to the wall: no posts there.
    const against = pergola.posts === "all" ? [] : [].concat(pergola.against ?? "z0");
    const fixed = (x, z) => (x === x0 && against.includes("x0")) || (x === x1 && against.includes("x1")) || (z === z0 && against.includes("z0")) || (z === z1 && against.includes("z1"));
    const postAt = (px, pz) => parts.add(frame, box(post, pergola.height - beam, post, px, pergola.base + (pergola.height - beam) / 2, pz));
    for (const [x, z] of corners) {
        if (fixed(x, z)) continue;
        postAt(x === x0 ? x0 + post / 2 : x1 - post / 2, z === z0 ? z0 + post / 2 : z1 - post / 2);
    }
    // Middle posts along a long free side, no more than `span` apart.
    const free = [
        ["z1", x1 - x0, (t) => [x0 + t * (x1 - x0), z1 - post / 2]],
        ["z0", x1 - x0, (t) => [x0 + t * (x1 - x0), z0 + post / 2]],
        ["x1", z1 - z0, (t) => [x1 - post / 2, z0 + t * (z1 - z0)]],
        ["x0", z1 - z0, (t) => [x0 + post / 2, z0 + t * (z1 - z0)]],
    ];
    for (const [side, length, at] of free) {
        if (against.includes(side) || pergola.posts === "corners") continue;
        const spans = Math.ceil(length / (pergola.span ?? 4.2));
        for (let k = 1; k < spans; k++) postAt(...at(k / spans));
    }
    // The louvres, tilted open, across the top.
    const timber = pergola.louvres === "timber";
    // Aluminium: blades six to the metre, tilted half open by day.
    const pitch = timber ? 0.22 : 0.17;
    const [depth, thick, tilt] = timber ? [0.15, 0.03, 0.95] : [0.16, 0.025, 0.72];
    const material = timber ? "finish:hardwood_deck" : blades;
    const alongX = pergola.slats !== "z";
    const span = alongX ? z1 - z0 - post * 2 : x1 - x0 - post * 2;
    const length = alongX ? x1 - x0 - post * 2 : z1 - z0 - post * 2;
    for (let s = pitch / 2; s < span; s += pitch) {
        const geometry = new THREE.BoxGeometry(alongX ? length : thick, depth, alongX ? thick : length).rotateX(alongX ? tilt : 0).rotateZ(alongX ? 0 : tilt);
        geometry.translate(alongX ? (x0 + x1) / 2 : x0 + post + s, top - 0.1, alongX ? z0 + post + s : (z0 + z1) / 2);
        parts.add(material, geometry, timber ? { tile: 1.6 } : undefined);
    }
    // Lattice screens.
    for (const side of pergola.screens || []) {
        const vertical = side.startsWith("x");
        const at = side === "x-" ? x0 + 0.06 : side === "x+" ? x1 - 0.06 : side === "z-" ? z0 + 0.06 : z1 - 0.06;
        const from = vertical ? z0 + post : x0 + post;
        const to = vertical ? z1 - post : x1 - post;
        const bottom = pergola.base + 0.05;
        const height = pergola.height - beam - 0.05;
        const grid = 0.14;
        for (let s = from + grid / 2; s < to; s += grid) {
            parts.add("finish:hardwood_deck", vertical ? box(0.03, height, 0.035, at, bottom + height / 2, s) : box(0.035, height, 0.03, s, bottom + height / 2, at), { tile: 1.6 });
        }
        for (let h = bottom + grid / 2; h < bottom + height; h += grid) {
            parts.add("finish:hardwood_deck", vertical ? box(0.035, 0.03, to - from, at, h, (from + to) / 2) : box(to - from, 0.03, 0.035, (from + to) / 2, h, at), { tile: 1.6 });
        }
    }
}

/** A corten planter along its path: four steel sides round a bed of soil, its grasses grown live. */
function addPlanter(parts, planter) {
    const t = 0.012;
    for (let i = 0; i < planter.path.length - 1; i++) {
        const [a, b] = [planter.path[i], planter.path[i + 1]];
        const w = planter.width;
        const extend = w / 2;
        const top = planter.base + planter.height;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) + extend * 2;
        const ux = (b[0] - a[0]) / (length - extend * 2);
        const uz = (b[1] - a[1]) / (length - extend * 2);
        const nx = -uz;
        const nz = ux;
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        for (const side of [-1, 1]) {
            parts.add("finish:corten", prism([a[0] + nx * side * (w / 2 - t / 2), a[1] + nz * side * (w / 2 - t / 2)], [b[0] + nx * side * (w / 2 - t / 2), b[1] + nz * side * (w / 2 - t / 2)], planter.base, top, top, t, extend), { tile: 1.4 });
            parts.add("finish:corten", prism([mid[0] + ux * side * (length / 2 - t / 2) - nx * (w / 2), mid[1] + uz * side * (length / 2 - t / 2) - nz * (w / 2)], [mid[0] + ux * side * (length / 2 - t / 2) + nx * (w / 2), mid[1] + uz * side * (length / 2 - t / 2) + nz * (w / 2)], planter.base, top, top, t), { tile: 1.4 });
        }
        parts.add("made:soil", prism(a, b, top - 0.12, top - 0.07, top - 0.07, w - t * 2, extend - t));
    }
}

/**
 * A frameless balustrade of tinted glass along its points, `height` above
 * each, clamped in a slim channel at its foot.
 */
function addRailing(parts, railing) {
    const pts = railing.points;
    for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az, ay] = pts[i];
        const [bx, bz, by] = pts[i + 1];
        // The glass, its bottom and top following the floor's rise.
        parts.add("trim:glass_balustrade", slopedPanel([ax, ay + 0.06, az], [bx, by + 0.06, bz], railing.height - 0.06, 0.016));
        parts.add("trim:frame_bronze", slopedPanel([ax, ay, az], [bx, by, bz], 0.07, 0.05));
    }
}

/** A flat panel from a to b, `height` tall above that line, `thickness` thick, run on `extend` past each end. */
function slopedPanel(a, b, height, thickness, extend = 0) {
    const geometry = prism([a[0], a[2]], [b[0], b[2]], 0, height, height, thickness, extend);
    // Lift each end by its own height.
    const p = geometry.attributes.position;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (let i = 0; i < p.count; i++) {
        const along = ((p.getX(i) - a[0]) * (b[0] - a[0]) + (p.getZ(i) - a[2]) * (b[2] - a[2])) / (length * length);
        p.setY(i, p.getY(i) + a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, along)));
    }
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * A pool: its basin lined in mosaic, a pale stone coping round its rim,
 * a hardwood deck round that, and its water (live: it moves).
 */
function addPool(parts, pool, live) {
    const [x0, z0, x1, z1] = pool.box;
    const rim = 0.02;
    const floor = pool.level - pool.depth;
    const t = 0.25;
    const tile = parts.materials.tileSize("pool_mosaic");
    // The basin: four walls and a floor, their inner faces the lining.
    parts.add("finish:pool_mosaic", box(x1 - x0 + t * 2, t, z1 - z0 + t * 2, (x0 + x1) / 2, floor - t / 2, (z0 + z1) / 2), { tile });
    parts.add("finish:pool_mosaic", box(x1 - x0 + t * 2, rim - floor, t, (x0 + x1) / 2, (rim + floor) / 2, z0 - t / 2), { tile });
    parts.add("finish:pool_mosaic", box(x1 - x0 + t * 2, rim - floor, t, (x0 + x1) / 2, (rim + floor) / 2, z1 + t / 2), { tile });
    parts.add("finish:pool_mosaic", box(t, rim - floor, z1 - z0, x0 - t / 2, (rim + floor) / 2, (z0 + z1) / 2), { tile });
    parts.add("finish:pool_mosaic", box(t, rim - floor, z1 - z0, x1 + t / 2, (rim + floor) / 2, (z0 + z1) / 2), { tile });
    // The coping, overhanging the water a little.
    const c = 0.32;
    const y = rim + 0.025;
    parts.add("finish:stone_paving_floor", box(x1 - x0 + c * 2 - 0.06, 0.05, c, (x0 + x1) / 2, y, z0 - c / 2 + 0.03), { tile: 1.5 });
    parts.add("finish:stone_paving_floor", box(x1 - x0 + c * 2 - 0.06, 0.05, c, (x0 + x1) / 2, y, z1 + c / 2 - 0.03), { tile: 1.5 });
    parts.add("finish:stone_paving_floor", box(c, 0.05, z1 - z0 - 0.06, x0 - c / 2 + 0.03, y, (z0 + z1) / 2), { tile: 1.5 });
    parts.add("finish:stone_paving_floor", box(c, 0.05, z1 - z0 - 0.06, x1 + c / 2 - 0.03, y, (z0 + z1) / 2), { tile: 1.5 });
    // The deck round it.
    if (pool.deck) {
        const [d0, e0, d1, e1] = pool.deck;
        const [i0, j0, i1, j1] = [x0 - c + 0.03, z0 - c + 0.03, x1 + c - 0.03, z1 + c - 0.03];
        const deck = (a, b, c2, d) => {
            if (c2 - a > 0.01 && d - b > 0.01) parts.add("finish:hardwood_deck", box(c2 - a, 0.04, d - b, (a + c2) / 2, 0.02, (b + d) / 2), { tile: 1.6 });
        };
        deck(d0, e0, d1, j0);
        deck(d0, j1, d1, e1);
        deck(d0, j0, i0, j1);
        deck(i1, j0, d1, j1);
    }
    live.add(poolWater(pool));
}

/**
 * The pool's water: a surface at its level, rippled by two scrolling
 * normals and lit by the sky it reflects; seen through, its floor tinted
 * turquoise with depth.
 */
function poolWater(pool) {
    const [x0, z0, x1, z1] = pool.box;
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, pool.level, (z0 + z1) / 2);
    const material = new THREE.MeshPhysicalMaterial({
        // A clear turquoise, as the renders' pool reads in the sun.
        // See-through by its opacity, not by transmission, which has three
        // draw every opaque thing a second time each frame.
        color: "#6fc6c9",
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.78,
    });
    material.name = "pool_water";
    const uniforms = { uTime: { value: 0 } };
    material.userData.time = uniforms.uTime;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vWaterWorld;")
            .replace(
                "#include <normal_fragment_maps>",
                `#include <normal_fragment_maps>
{
    vec2 p = vWaterWorld.xz;
    float t = uTime;
    vec2 g = vec2(
        sin( p.x * 3.1 + t * 1.3 ) * 0.5 + sin( p.x * 7.3 - p.y * 2.1 + t * 2.1 ) * 0.25 + sin( ( p.x + p.y ) * 11.0 + t * 2.9 ) * 0.12,
        cos( p.y * 2.7 - t * 1.1 ) * 0.5 + cos( p.y * 6.1 + p.x * 1.7 - t * 1.9 ) * 0.25 + cos( ( p.x - p.y ) * 12.0 - t * 3.3 ) * 0.12
    ) * 0.06;
    normal = normalize( normal + ( viewMatrix * vec4( g.x, 0.0, g.y, 0.0 ) ).xyz );
}`
            );
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vWaterWorld;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWaterWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;");
    };
    material.customProgramCacheKey = () => "pool-water";
    const water = new THREE.Mesh(geometry, material);
    water.name = "pool-water";
    water.receiveShadow = true;
    water.userData = { kind: "surface", surfaceKind: "water", label: "Pool" };
    return water;
}

/** A box [x0, z0, x1, z1] as a polygon, grown by `grow`. */
function boxPolygon([x0, z0, x1, z1], grow = 0) {
    return [
        [x0 - grow, z0 - grow],
        [x1 + grow, z0 - grow],
        [x1 + grow, z1 + grow],
        [x0 - grow, z1 + grow],
    ];
}

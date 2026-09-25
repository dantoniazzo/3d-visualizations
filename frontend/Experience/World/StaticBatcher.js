import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Draws a finished scene that nobody will edit in as few draw calls as it
 * can: everything static is merged into one mesh per material, per floor.
 *
 * A house built piece by piece is ~900 meshes, and a wall panel alone is
 * six draw calls — one per face material — so the GPU is asked for several
 * thousand small draws a frame, which is what a phone cannot keep up with.
 * Merged, the same house is a few hundred.
 *
 * The originals stay in the scene graph, hidden. Collision, the camera's
 * boom and the crosshair all read geometry rather than what is drawn, so
 * they go on working against them exactly as before; the merged meshes do
 * the drawing only and never answer a raycast. An original is hidden by
 * giving it an invisible material rather than by `visible = false`, which
 * would hide whatever hangs below it too — a glass pane that was not
 * merged, say. Their GPU buffers are freed, as they will not be drawn again.
 *
 * Batches are kept per floor so a floor can later be shown or hidden on its
 * own. Transparent, skinned, instanced and moving things are left alone.
 *
 * `collectStatic` is the first half on its own — every static triangle, in
 * world space, with its material and floor — which the public-view snapshot
 * (Publish/Snapshot.js) starts from too, so both agree on what is static.
 */

const _normalMatrix = new THREE.Matrix3();
const _v = new THREE.Vector3();

/** Worn by every merged original: never drawn, still raycast. */
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
HIDDEN.name = "batched";

/**
 * @typedef {object} StaticOptions
 * @property {(object: THREE.Object3D) => boolean} [skip]
 *           true for a subtree to leave alone (it moves, or is handled elsewhere)
 * @property {(mesh: THREE.Mesh, box: THREE.Box3) => number} [levelOf]
 *           which floor a piece of the mesh belongs to
 * @property {(mesh: THREE.Mesh) => string|null} [kindOf]
 *           "ceiling" or "roof" for what an overhead view leaves out
 */

/**
 * Every static, opaque triangle under `root`, one part per mesh and
 * material, in world space.
 *
 * @param {THREE.Object3D} root
 * @param {StaticOptions} options
 * @returns {{ parts: object[], meshes: THREE.Mesh[] }}
 *          parts: { mesh, material, geometry, level, kind, cast, receive, names }
 */
export function collectStatic(root, { skip = () => false, levelOf = () => 0, kindOf = () => null } = {}) {
    root.updateWorldMatrix(true, true);
    const parts = [];
    const meshes = [];

    const visit = (object) => {
        if (!object.visible || skip(object)) return;
        if (object.isMesh && canMerge(object)) {
            meshes.push(object);
            const kind = kindOf(object);
            for (const part of extractMesh(object)) {
                part.geometry.computeBoundingBox();
                parts.push({ ...part, mesh: object, kind, level: levelOf(object, part.geometry.boundingBox) });
            }
        }
        for (const child of object.children) visit(child);
    };
    visit(root);
    return { parts, meshes };
}

/**
 * The same meshes `collectStatic` would take, and every material they draw
 * with in the order first met — without copying any geometry. The public
 * view uses it to hide what a published snapshot draws instead, and to
 * find each of the snapshot's materials again (`materialKeys`).
 *
 * @returns {{ meshes: THREE.Mesh[], materials: THREE.Material[] }}
 */
export function listStatic(root, { skip = () => false } = {}) {
    root.updateWorldMatrix(true, true);
    const meshes = [];
    const materials = new Set();
    const visit = (object) => {
        if (!object.visible || skip(object)) return;
        if (object.isMesh && canMerge(object)) {
            meshes.push(object);
            for (const material of materialsOf(object)) if (material) materials.add(material);
        }
        for (const child of object.children) visit(child);
    };
    visit(root);
    return { meshes, materials: [...materials] };
}

/**
 * A name for each material that is the same wherever the same scene is
 * built: its own name, numbered when several share one. The snapshot names
 * its meshes' materials this way and the public view looks them up again.
 *
 * @returns {Map<THREE.Material, string>}
 */
export function materialKeys(materials) {
    const counts = new Map();
    const keys = new Map();
    for (const material of materials) {
        const base = material.name || material.type;
        const n = counts.get(base) ?? 0;
        counts.set(base, n + 1);
        keys.set(material, n ? `${base}#${n}` : base);
    }
    return keys;
}

/** Stop drawing originals that something else now draws for them. */
export function hideOriginals(meshes) {
    for (const mesh of meshes) {
        if (mesh.material === HIDDEN) continue;
        mesh.userData.batchedMaterial = mesh.material;
        mesh.material = HIDDEN;
        // Frees the GPU copy; the geometry itself stays for collision and picking.
        mesh.geometry.dispose();
    }
}

/**
 * @param {THREE.Object3D} root   everything that may be merged
 * @param {StaticOptions} options
 * @returns {{ group: THREE.Group, batches: number, merged: number }}
 */
export default function batchStatic(root, options = {}) {
    const { parts, meshes } = collectStatic(root, options);

    /** key -> { material, level, kind, cast, receive, geometries } */
    const buckets = new Map();
    for (const part of parts) {
        const key = [part.material.uuid, part.level, part.kind ?? "", part.names.join(","), part.cast, part.receive].join("|");
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { material: part.material, level: part.level, kind: part.kind, cast: part.cast, receive: part.receive, geometries: [] };
            buckets.set(key, bucket);
        }
        bucket.geometries.push(part.geometry);
    }

    const group = new THREE.Group();
    group.name = "static-batches";
    for (const bucket of buckets.values()) {
        const geometry = mergeGeometries(bucket.geometries, false);
        for (const part of bucket.geometries) part.dispose();
        if (!geometry) continue;

        const mesh = new THREE.Mesh(geometry, bucket.material);
        mesh.name = `batch:${bucket.material.name || bucket.material.type}:${bucket.level}`;
        mesh.castShadow = bucket.cast;
        mesh.receiveShadow = bucket.receive;
        mesh.userData = { batch: true, level: bucket.level, kind: bucket.kind ?? null };
        // Draws only: every question about the scene goes to the originals.
        mesh.raycast = () => {};
        group.add(mesh);
    }

    hideOriginals(meshes);
    return { group, batches: group.children.length, merged: meshes.length };
}

function materialsOf(mesh) {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Whether a mesh can be baked into a batch without changing how it looks. */
export function canMerge(mesh) {
    if (mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.morphTargetInfluences) return false;
    if (mesh.renderOrder !== 0 || mesh.layers.mask !== 1) return false;
    if (!mesh.geometry?.attributes.position) return false;
    // Transparent things are sorted back to front one by one; merged, they
    // would draw in whatever order their triangles happen to be in.
    return materialsOf(mesh).every(
        (m) => m && m.visible !== false && !m.transparent && !(m.transmission > 0)
    );
}

/** The attributes a batch for this material needs, in a fixed order. */
function attributesFor(material, geometry) {
    const names = ["position", "normal", "uv"];
    if (geometry.attributes.uv1) names.push("uv1");
    if (material.vertexColors && geometry.attributes.color) names.push("color");
    if (material.normalMap && geometry.attributes.tangent) names.push("tangent");
    return names;
}

/** One world-space part per material a mesh draws with. */
function extractMesh(mesh) {
    const geometry = mesh.geometry;
    const materials = materialsOf(mesh);
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    const ranges =
        Array.isArray(mesh.material) && geometry.groups.length
            ? geometry.groups
            : [{ start: 0, count, materialIndex: 0 }];

    const out = [];
    for (const range of ranges) {
        const material = materials[range.materialIndex ?? 0];
        if (!material) continue;
        const names = attributesFor(material, geometry);
        const part = extract(geometry, range.start, range.count, mesh.matrixWorld, names);
        if (!part) continue;
        out.push({ material, geometry: part, names, cast: mesh.castShadow, receive: mesh.receiveShadow });
    }
    return out;
}

/**
 * One draw range of a geometry, as a compact indexed geometry of its own in
 * world space: only the vertices that range uses, every attribute as plain
 * floats (quantised glTF attributes included), and its triangles turned
 * back the right way round if the mesh was mirrored.
 */
function extract(geometry, start, count, matrix, names) {
    const source = geometry.attributes;
    const index = geometry.index;
    const total = index ? index.count : source.position.count;
    const end = Math.min(total, start + count);
    if (end - start < 3) return null;

    const remap = new Int32Array(source.position.count).fill(-1);
    const used = [];
    const indices = new Uint32Array(end - start);
    for (let i = start; i < end; i++) {
        const vertex = index ? index.getX(i) : i;
        let mapped = remap[vertex];
        if (mapped < 0) {
            mapped = remap[vertex] = used.length;
            used.push(vertex);
        }
        indices[i - start] = mapped;
    }

    // A mirrored mesh is drawn with its winding reversed by the renderer;
    // baked into world space, the triangles have to be reversed instead.
    const mirrored = matrix.determinant() < 0;
    if (mirrored) {
        for (let i = 0; i + 2 < indices.length; i += 3) {
            const b = indices[i + 1];
            indices[i + 1] = indices[i + 2];
            indices[i + 2] = b;
        }
    }

    _normalMatrix.getNormalMatrix(matrix);
    const part = new THREE.BufferGeometry();
    for (const name of names) {
        const attribute = source[name];
        const itemSize = attribute ? attribute.itemSize : name === "uv" || name === "uv1" ? 2 : 3;
        const array = new Float32Array(used.length * itemSize);
        if (attribute) {
            for (let j = 0; j < used.length; j++) {
                for (let c = 0; c < itemSize; c++) array[j * itemSize + c] = attribute.getComponent(used[j], c);
            }
        }
        if (name === "position") {
            for (let j = 0; j < array.length; j += 3) {
                _v.fromArray(array, j).applyMatrix4(matrix).toArray(array, j);
            }
        } else if (name === "normal" && attribute) {
            for (let j = 0; j < array.length; j += 3) {
                _v.fromArray(array, j).applyMatrix3(_normalMatrix).normalize().toArray(array, j);
            }
        } else if (name === "tangent") {
            for (let j = 0; j < array.length; j += 4) {
                _v.fromArray(array, j).transformDirection(matrix).toArray(array, j);
                if (mirrored) array[j + 3] *= -1;
            }
        }
        part.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
    }
    part.setIndex(new THREE.BufferAttribute(indices, 1));
    if (!source.normal) part.computeVertexNormals();
    return part;
}

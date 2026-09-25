import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { FINISHES } from "../../../shared/catalog.js";
import { isTransient } from "../World/Collision.js";
import { skipDynamic } from "../World/SceneBuilder.js";
import { canMerge, listStatic, materialKeys } from "../World/StaticBatcher.js";

/**
 * A published version's runtime file: what the public view would otherwise
 * build the whole house for, beside the snapshot that draws it.
 *
 *   - collision: the building (walls, slabs, roof, ground) and what stands
 *     in it (stair ramps, each piece of furniture as its mesh or its box),
 *     exactly as the walkthrough collides with them — each mesh one thing,
 *     named, so the crosshair can still say "Wall — Warm white" or "Sofa";
 *   - the materials, under the keys the snapshot names its meshes' by. A
 *     finish's texture is generated on the device, as in the editor, so it
 *     goes as the finish's name; any other texture — a fabric, a worktop —
 *     goes in the file;
 *   - the glass, which is drawn live rather than merged, each pane saying
 *     which floor it is on for the bird's-eye view.
 *
 * The server simplifies the collision (a centimetre and a half is nothing
 * to a capsule a third of a metre wide) and compresses the lot
 * (server/publish/compress.js).
 *
 * @param {Experience} experience  the scene as the editor has it, furniture loaded
 * @returns {Promise<{ glb: ArrayBuffer, stats: object }>}
 */
export async function buildRuntime(experience) {
    const builder = experience.world.sceneBuilder;
    await builder.furnitureReady;
    builder.refreshCollision();
    const options = builder.staticOptions();
    const scene = new THREE.Scene();
    const disposables = [];

    const collision = new THREE.Group();
    collision.name = "collision";
    scene.add(collision);
    const labels = new Labeller(builder);
    const triangles = {
        static: addCollision(collision, "static", builder.staticCollisionRoots(), isTransient, labels, disposables),
        dynamic: 0,
    };
    const { roots, proxies } = builder.dynamicCollisionRoots();
    triangles.dynamic = addCollision(collision, "dynamic", roots, skipDynamic, labels, disposables);
    for (const proxy of proxies.children) proxy.geometry.dispose();

    // One small triangle for each material to travel on.
    const library = new THREE.Group();
    library.name = "materials";
    scene.add(library);
    const carrier = new THREE.BufferGeometry();
    carrier.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0, 0.01], 3));
    carrier.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    disposables.push(carrier);
    const keys = materialKeys(listStatic(builder.root, options).materials);
    for (const [material, key] of keys) {
        const mesh = new THREE.Mesh(carrier, exportable(material, disposables));
        mesh.name = `material:${key}`;
        mesh.userData = { materialKey: key };
        library.add(mesh);
    }

    const glass = new THREE.Group();
    glass.name = "see-through";
    scene.add(glass);
    const box = new THREE.Box3();
    builder.root.updateWorldMatrix(true, true);
    const visit = (object) => {
        if (!object.visible || options.skip(object) || object.userData?.helper) return;
        if (object.isMesh && object.geometry?.attributes.position && !canMerge(object) && !object.isSkinnedMesh) {
            const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
            disposables.push(geometry);
            const mesh = new THREE.Mesh(geometry, Array.isArray(object.material) ? object.material.map((m) => exportable(m, disposables)) : exportable(object.material, disposables));
            box.setFromObject(object);
            mesh.name = object.name;
            mesh.userData = { level: options.levelOf(object, box), kind: options.kindOf(object) };
            glass.add(mesh);
        }
        for (const child of object.children) visit(child);
    };
    visit(builder.root);

    scene.userData = { runtime: 1, levels: options.levels };
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
    for (const item of disposables) item.dispose();
    return {
        glb,
        stats: { triangles, labels: labels.count, materials: keys.size, glass: glass.children.length },
    };
}

/**
 * Every triangle under `roots` that collides, in world space, one mesh for
 * each thing it is part of.
 *
 * @returns {number} triangles
 */
function addCollision(parent, kind, roots, skip, labels, disposables) {
    const buckets = new Map();
    const a = new THREE.Vector3();
    const add = (mesh) => {
        const position = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        const count = (index ? index.count : position.count) / 3;
        const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count: count * 3, materialIndex: 0 }];
        for (const group of groups) {
            const label = labels.of(mesh, group.materialIndex);
            let bucket = buckets.get(label);
            if (!bucket) buckets.set(label, (bucket = []));
            const end = Math.min(group.start + group.count, count * 3);
            for (let i = group.start; i < end; i++) {
                a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
                bucket.push(a.x, a.y, a.z);
            }
        }
    };
    const visit = (object) => {
        if (!object || skip(object)) return;
        if (object.isMesh && object.geometry?.attributes.position) add(object);
        for (const child of object.children) visit(child);
    };
    for (const root of roots) {
        if (!root) continue;
        root.updateWorldMatrix(true, true);
        visit(root);
    }

    let total = 0;
    for (const [label, positions] of buckets) {
        if (!positions.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        disposables.push(geometry);
        const mesh = new THREE.Mesh(geometry);
        mesh.name = `${kind}:${label ?? ""}`;
        mesh.userData = label ? { collision: kind, label } : { collision: kind };
        parent.add(mesh);
        total += positions.length / 9;
    }
    return total;
}

/**
 * What the crosshair calls a triangle: a surface by its name and finish,
 * as the walkthrough labels it (frontend/index.js), a piece of furniture
 * by its name, a flight's ramp as the flight.
 */
class Labeller {
    constructor(builder) {
        this.builder = builder;
        this.cache = new Map();
        this.seen = new Set();
    }

    get count() {
        return this.seen.size;
    }

    of(mesh, slot) {
        const key = `${mesh.uuid}|${slot}`;
        if (!this.cache.has(key)) {
            const label = this.find(mesh, slot);
            if (label) this.seen.add(label);
            this.cache.set(key, label);
        }
        return this.cache.get(key);
    }

    find(mesh, slot) {
        const builder = this.builder;
        for (let node = mesh; node; node = node.parent) {
            if (node.userData?.kind === "surface") {
                const base = node.userData.surfaceId;
                let surface = builder.surfaces.get(base);
                // A wall panel's two faces are two surfaces: slots 4 and 5
                // (BoxGeometry's +Z and -Z); its reveals are neither.
                if (node.userData.surfaceKind === "wall" && builder.surfaces.has(`${base}:a`)) {
                    surface = slot === 4 ? builder.surfaces.get(`${base}:a`) : slot === 5 ? builder.surfaces.get(`${base}:b`) : null;
                }
                if (surface) return describe(surface);
                return node.userData.label ?? null;
            }
            if (node.userData?.label) return node.userData.label;
            for (const [id, entry] of builder.stairs) {
                if (entry.collider === node) {
                    const surface = builder.surfaces.get(`stairs:${id}`);
                    return surface ? describe(surface) : "Stairs";
                }
            }
        }
        return null;
    }
}

function describe(surface) {
    return `${surface.label || surface.kind} — ${FINISHES[surface.finish]?.label ?? surface.finish}`;
}

/**
 * A copy of a material to put in the file. A finish's texture is left out
 * and named instead: the public view draws it again, the same, as the
 * editor does. Anything else textured keeps its texture — as a JPEG, unless
 * it is see-through.
 */
function exportable(material, disposables) {
    const copy = material.clone();
    disposables.push(copy);
    copy.userData = { ...material.userData };
    const finish = FINISHES[material.name] && material.map?.image instanceof HTMLCanvasElement ? material.name : null;
    if (finish) {
        copy.map = null;
        copy.userData.finish = finish;
    } else if (copy.map) {
        copy.map = copy.map.clone();
        const alpha = material.transparent || material.alphaTest > 0;
        copy.map.userData = { ...copy.map.userData, mimeType: alpha ? "image/png" : "image/jpeg" };
    }
    if (material.vertexColors) copy.userData.vertexColors = true;
    return copy;
}

import * as THREE from "three";

import Experience from "../Experience.js";
import MaterialLibrary from "./Builders/MaterialLibrary.js";
import StructureBuilder from "./Builders/StructureBuilder.js";
import FurnitureLibrary from "./Builders/FurnitureLibrary.js";
import Door from "./Door.js";
import { GROUND_TYPES, FINISHES } from "../../../shared/catalog.js";

/**
 * Builds a property from a scene spec.
 *
 * Three things it owns that the rest of the app asks it for:
 *   - a registry of named surfaces, so finishes can be swapped in-world;
 *   - the doors, which need per-frame animation and their own collision;
 *   - furniture instances loaded from the imported-model catalogue.
 */
export default class SceneBuilder {
    constructor(spec) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.octree = this.experience.world.octree;
        this.spec = spec;

        this.materials = new MaterialLibrary();
        this.structure = new StructureBuilder(this.materials);
        this.furnitureLibrary = new FurnitureLibrary();

        this.root = new THREE.Group();
        this.root.name = "property";

        this.colliders = new THREE.Group();
        this.colliders.name = "colliders";
        this.colliders.visible = false;

        /** surfaceId -> { id, kind, meshes, slot, finish, label } */
        this.surfaces = new Map();
        this.doors = [];
        this.furniture = new Map();

        this.build();
    }

    build() {
        this.buildGround();
        this.buildRooms();
        this.buildWalls();
        this.buildRoofs();
        this.buildStairs();
        this.buildModel();
        this.buildFreeDoors();
        this.buildLights();
        this.applyFinishOverrides();

        this.scene.add(this.root);
        this.scene.add(this.colliders);

        if (this.model) this.buildModelCollision();
        this.octree.fromGraphNode(this.shell);
        this.octree.fromGraphNode(this.colliders);
        if (this.groundPlane) this.octree.fromGraphNode(this.groundPlane);

        // Doors join the graph only now that the static octree is closed,
        // so a shut leaf never becomes a permanent wall.
        for (const door of this.doors) {
            door.wallGroup.add(door.group);
            door.group.updateMatrixWorld(true);
        }

        // Furniture arrives after the catalogue fetch; it never blocks the
        // shell from being walkable.
        this.buildFurniture();
    }

    // ------------------------------------------------------------------
    // Shell
    // ------------------------------------------------------------------

    buildGround() {
        const { ground, ground_size: size } = this.spec.environment;
        if (ground === "none" || size <= 0) return;

        const spec = GROUND_TYPES[ground];
        const mesh = this.structure.buildGround({ ...spec, size });
        this.root.add(mesh);
        this.groundPlane = mesh;
    }

    registerSurfaces(list) {
        for (const surface of list) this.surfaces.set(surface.id, surface);
    }

    buildRooms() {
        this.shell = new THREE.Group();
        this.shell.name = "shell";
        this.rooms = new Map();

        for (const room of this.spec.rooms) {
            this.rooms.set(room.id, room);
            if (this.spec.model) continue; // imported models bring their own

            const { group, surfaces } = this.structure.buildRoom(room);
            this.shell.add(group);
            this.registerSurfaces(surfaces);
        }

        this.root.add(this.shell);
    }

    buildWalls() {
        if (this.spec.model) return;

        for (const wall of this.spec.walls) {
            const { group, surfaces, doors } = this.structure.buildWall(wall);
            this.shell.add(group);
            this.registerSurfaces(surfaces);
            this.doors.push(...doors);
        }
    }

    buildRoofs() {
        if (this.spec.model) return;

        for (const roof of this.spec.roofs || []) {
            const { group, surfaces } = this.structure.buildRoof(roof);
            // Part of the shell, so the octree picks it up: an attic needs
            // something over it that a visitor cannot walk out through.
            this.shell.add(group);
            this.registerSurfaces(surfaces);
        }
    }

    /**
     * Stairs are the one part of the shell whose visible geometry is not its
     * collision. Treads go in a group the octree never sees; the ramp that
     * makes them climbable goes in the invisible collider group.
     */
    buildStairs() {
        this.fittings = new THREE.Group();
        this.fittings.name = "fittings";
        this.root.add(this.fittings);

        for (const stair of this.spec.stairs || []) {
            const { group, collider, surfaces } = this.structure.buildStairs(stair);
            if (this.spec.model) {
                // The model's mesh already draws the treads; a stair spec in
                // a model scene contributes only the invisible ramp, which is
                // what makes those baked treads walkable.
                this.colliders.add(collider);
            } else {
                this.fittings.add(group);
                this.colliders.add(collider);
                this.registerSurfaces(surfaces);
            }
        }
    }

    /**
     * Doors that stand on their own rather than in a generated wall — how an
     * imported model gets working doors. The GLB carries the cased opening;
     * each entry here hangs a Door in it, on an anchor at the opening's
     * centre, turned so the anchor's local X runs along the wall.
     */
    buildFreeDoors() {
        if (!this.spec.doors?.length) return;

        this.doorAnchors = new THREE.Group();
        this.doorAnchors.name = "door-anchors";
        this.root.add(this.doorAnchors);

        for (const spec of this.spec.doors) {
            const anchor = new THREE.Group();
            anchor.name = `door-anchor:${spec.id}`;
            anchor.position.set(spec.position[0], spec.elevation, spec.position[1]);
            anchor.rotation.y = THREE.MathUtils.degToRad(spec.yaw);
            this.doorAnchors.add(anchor);

            const opening = {
                id: spec.id,
                type: "door",
                offset: 0,
                width: spec.width,
                height: spec.height,
                sill: 0,
                door: spec.door,
            };
            const door = new Door(opening, { thickness: spec.thickness, height: spec.height }, 0, this.materials);
            door.wallGroup = anchor;
            this.doors.push(door);
        }
    }

    /**
     * A soft light at the centre of each room's ceiling. The shell has no
     * light fittings of its own — those are furniture — but an unlit room
     * reads as a bug, so every room gets one.
     *
     * Outdoor slabs are skipped: a yard is lit by the sun, and a point light
     * hovering over a lawn reads as a bug of its own.
     */
    buildLights() {
        this.lights = new THREE.Group();
        this.lights.name = "fixtures";

        for (const room of this.spec.rooms) {
            if (FINISHES[room.floor_finish]?.kind === "ground") continue;

            const centre = room.polygon.reduce(
                (acc, [x, z]) => [acc[0] + x, acc[1] + z],
                [0, 0]
            );
            const x = centre[0] / room.polygon.length;
            const z = centre[1] / room.polygon.length;

            // Scale with floor area so a big living room isn't as dim as a WC.
            const area = polygonArea(room.polygon);
            // A fitting is a fitting, not a floodlight: these sit on top of
            // the environment rig rather than replacing it, so they only need
            // to lift the middle of a room away from its walls.
            const light = new THREE.PointLight(
                "#ffe9cf",
                THREE.MathUtils.clamp(area * 0.3, 2, 8.5),
                Math.max(6, Math.sqrt(area) * 3),
                1.8
            );
            light.position.set(x, room.elevation + room.height - 0.25, z);
            light.name = `light:${room.id}`;
            this.lights.add(light);
        }

        this.root.add(this.lights);
    }

    // ------------------------------------------------------------------
    // Finishes
    // ------------------------------------------------------------------

    /** Overrides written by the in-world picker, applied after the build. */
    applyFinishOverrides() {
        for (const [surfaceId, finishId] of Object.entries(this.spec.finishes || {})) {
            this.setFinish(surfaceId, finishId, { record: false });
        }
    }

    /**
     * Swap a surface's finish in place.
     *
     * Walls carry two faces in one mesh via BoxGeometry material groups, so
     * a wall surface replaces only its own slot and leaves the other side
     * alone. UVs are re-tiled because finishes differ in tile size.
     */
    setFinish(surfaceId, finishId, { record = true } = {}) {
        const surface = this.surfaces.get(surfaceId);
        if (!surface || !FINISHES[finishId]) return false;
        if (FINISHES[finishId].kind !== surface.kind) return false;

        const material = this.materials.getSurface(finishId, surface.kind);

        for (const mesh of surface.meshes) {
            if (Array.isArray(mesh.material) && surface.slot !== undefined) {
                mesh.material = mesh.material.slice();
                mesh.material[surface.slot] = material;
                // `surface.finish` is the authority for which finish this
                // face currently wears — a panel's two faces share one mesh,
                // so anything stored on the mesh describes only one of them.
                this.retileFace(mesh, surface.slot, finishId, surface.finish);
            } else {
                // Slabs are seen from both sides — a storey's floor is the
                // ceiling of the one below — so they get their own clone.
                mesh.material = doubleSided(material);
                this.materials.applyWorldTiling(
                    resetWorldTiling(mesh.geometry, surface.finish, this.materials),
                    finishId
                );
            }
            mesh.userData.finish = finishId;
        }

        surface.finish = finishId;
        if (record) {
            this.spec.finishes = this.spec.finishes || {};
            this.spec.finishes[surfaceId] = finishId;
        }
        return true;
    }

    /** Re-scale one BoxGeometry face's UVs for a new finish's tile size. */
    retileFace(mesh, slot, finishId, previousFinish) {
        const uv = mesh.geometry.attributes.uv;
        const start = slot * 4;

        const factor =
            this.materials.tileSize(previousFinish) / this.materials.tileSize(finishId);
        if (factor === 1) return;

        for (let i = start; i < start + 4; i++) {
            uv.setXY(i, uv.getX(i) * factor, uv.getY(i) * factor);
        }
        uv.needsUpdate = true;
    }

    /**
     * Which surface a raycast hit, and for a wall which of its two faces.
     * @returns {{surface: object, side: 'a'|'b'|null}|null}
     */
    resolveSurfaceHit(intersection) {
        let node = intersection.object;
        while (node && node.userData?.kind !== "surface") node = node.parent;
        if (!node) return null;

        const base = node.userData.surfaceId;

        // Only a wall panel carries two independent faces. A gable end is a
        // wall finish on a single plane, so it registers under its own id.
        if (node.userData.surfaceKind === "wall" && this.surfaces.has(`${base}:a`)) {
            // BoxGeometry's +Z face is side A, -Z side B.
            const side = (intersection.face?.normal?.z ?? 1) > 0 ? "a" : "b";
            return { surface: this.surfaces.get(`${base}:${side}`), side };
        }

        return { surface: this.surfaces.get(base), side: null };
    }

    // ------------------------------------------------------------------
    // Furniture
    // ------------------------------------------------------------------

    async buildFurniture() {
        this.furnitureGroup = new THREE.Group();
        this.furnitureGroup.name = "furniture";
        this.root.add(this.furnitureGroup);

        await this.furnitureLibrary.loadCatalog();

        for (const placement of this.spec.furniture || []) {
            this.addFurniture(placement, { record: false });
        }

        this.experience.world.emit("catalog", this.furnitureLibrary.catalog);
    }

    addFurniture(placement, { record = true } = {}) {
        const instance = this.furnitureLibrary.createInstance(placement);
        this.furnitureGroup.add(instance);
        this.furniture.set(placement.id, { placement, group: instance });

        if (record) {
            this.spec.furniture = this.spec.furniture || [];
            this.spec.furniture.push(placement);
        }
        return instance;
    }

    removeFurniture(id) {
        const entry = this.furniture.get(id);
        if (!entry) return false;

        this.furnitureGroup.remove(entry.group);
        entry.group.traverse((child) => {
            if (child.isMesh && child.name === "missing-model") child.geometry.dispose();
        });
        this.furniture.delete(id);

        this.spec.furniture = (this.spec.furniture || []).filter((f) => f.id !== id);
        return true;
    }

    // ------------------------------------------------------------------
    // Doors
    // ------------------------------------------------------------------

    updateDoors(delta) {
        for (const door of this.doors) door.update(delta);
    }

    /**
     * Push the player out of any door still shut enough to block. The scene
     * octree is static, so moving leaves have to be resolved separately.
     */
    resolveDoorCollisions(capsule) {
        let moved = false;
        for (const door of this.doors) {
            for (const blocker of door.getBlockers()) {
                if (Door.resolveCapsule(capsule, blocker)) moved = true;
            }
        }
        return moved;
    }

    /** Nearest door the player could reasonably reach and operate. */
    nearestDoor(position, maxDistance = 2.2) {
        let best = null;
        let bestDistance = maxDistance;

        for (const door of this.doors) {
            const worldPosition = new THREE.Vector3();
            door.group.getWorldPosition(worldPosition);
            worldPosition.y = position.y;

            const distance = worldPosition.distanceTo(position);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = door;
            }
        }

        return best;
    }

    // ------------------------------------------------------------------
    // Imported models (authored scenes)
    // ------------------------------------------------------------------

    buildModel() {
        const spec = this.spec.model;
        if (!spec) return;

        const source = this.experience.resources.items.sceneModel;
        if (!source?.scene) {
            console.error(`Scene model ${spec.url} failed to load.`);
            return;
        }

        this.model = source.scene;
        this.model.name = "imported-model";
        this.model.scale.setScalar(spec.scale);
        this.model.rotation.y = THREE.MathUtils.degToRad(spec.rotation);
        this.model.position.set(...spec.offset);
        this.model.updateMatrixWorld(true);

        for (const child of this.model.children) this.tagImportedNode(child);

        const override = spec.material
            ? new THREE.MeshStandardMaterial({
                  color: new THREE.Color(spec.material.color),
                  roughness: spec.material.roughness,
                  metalness: spec.material.metalness,
                  side: THREE.DoubleSide,
              })
            : null;

        let unlit = 0;
        let meshes = 0;

        this.model.traverse((child) => {
            if (!child.isMesh) return;
            meshes++;
            const isUnlit = child.material?.isMeshBasicMaterial === true;
            if (isUnlit) unlit++;

            const shadows = spec.shadows ?? !isUnlit;
            child.castShadow = shadows;
            child.receiveShadow = shadows;
            if (override) child.material = override;
        });

        this.modelIsUnlit = meshes > 0 && unlit === meshes;
        if (override) this.importedMaterial = override;

        this.root.add(this.model);
    }

    static COLLISION_TRIANGLE_BUDGET = 500000;

    buildModelCollision() {
        const requested = this.spec.model.collision || "auto";
        if (requested === "none") return;

        const triangles = countTriangles(this.model);
        let mode = requested;
        if (mode === "auto") {
            mode = triangles <= SceneBuilder.COLLISION_TRIANGLE_BUDGET ? "mesh" : "box";
        }

        if (mode === "mesh") this.buildMeshCollision();
        else this.buildBoundsCollider();

        this.collisionInfo = { mode, triangles, requested };

        if (mode === "box") {
            console.info(
                `[scene] ${triangles.toLocaleString()} triangles exceeds the ` +
                    `${SceneBuilder.COLLISION_TRIANGLE_BUDGET.toLocaleString()} budget — ` +
                    `using bounds collision. Interior walls will not block movement.`
            );
        }
    }

    /**
     * Feed the model to the octree, minus anything the spec collides another
     * way.
     *
     * Stair treads are the case this exists for: the model draws them, but
     * they are walked on via the ramps in `stairs`, exactly as a generated
     * staircase is. Leaving the risers in the octree catches the player's
     * capsule a metre up the flight. Excluded nodes are lifted out of the
     * graph for the build and put straight back, so they still render.
     */
    buildMeshCollision() {
        const exclude = this.spec.model.collision_exclude || [];
        if (!exclude.length) {
            this.octree.fromGraphNode(this.model);
            return;
        }

        const lifted = [];
        this.model.traverse((child) => {
            if (child !== this.model && exclude.some((p) => child.name.startsWith(p))) {
                lifted.push([child, child.parent]);
            }
        });
        for (const [child, parent] of lifted) parent.remove(child);

        this.octree.fromGraphNode(this.model);

        for (const [child, parent] of lifted) parent.add(child);
        this.model.updateMatrixWorld(true);
        this.excludedFromCollision = lifted.length;
    }

    buildBoundsCollider() {
        const box = new THREE.Box3().setFromObject(this.model);
        const size = new THREE.Vector3();
        const centre = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(centre);

        const t = 0.3;
        const h = Math.max(size.y, 2.5);

        const add = (w, height, d, x, y, z) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d));
            mesh.position.set(x, y, z);
            mesh.updateMatrixWorld(true);
            this.colliders.add(mesh);
        };

        add(size.x, t, size.z, centre.x, box.min.y - t / 2, centre.z);
        add(size.x, h, t, centre.x, box.min.y + h / 2, box.min.z - t / 2);
        add(size.x, h, t, centre.x, box.min.y + h / 2, box.max.z + t / 2);
        add(t, h, size.z, box.min.x - t / 2, box.min.y + h / 2, centre.z);
        add(t, h, size.z, box.max.x + t / 2, box.min.y + h / 2, centre.z);
    }

    tagImportedNode(node) {
        const label = cleanNodeName(node.name);
        if (label) {
            node.userData = { ...node.userData, kind: "object", id: node.uuid, label };
        }
        for (const child of node.children) this.tagImportedNode(child);
    }

    // ------------------------------------------------------------------

    /**
     * Which room a point is standing in.
     *
     * Storeys sit on top of each other, so the plan position alone is
     * ambiguous — the bedroom and the living room below it share it. The
     * nearest floor at or below the feet wins.
     */
    roomAt(x, y, z) {
        let best = null;
        let bestDrop = Infinity;

        for (const room of this.spec.rooms) {
            if (!pointInPolygon(x, z, room.polygon)) continue;
            if (room.voids?.some((hole) => pointInPolygon(x, z, hole))) continue;

            // A little slack below, for standing on a stair nosing or a rug.
            const drop = y - room.elevation;
            if (drop < -0.6 || drop > room.height + 0.4) continue;

            if (Math.abs(drop) < bestDrop) {
                bestDrop = Math.abs(drop);
                best = room;
            }
        }

        return best;
    }

    /** Everything a look-at raycast should consider. */
    getInteractiveObjects() {
        const list = [this.shell];
        if (this.fittings) list.push(this.fittings);
        if (this.doorAnchors) list.push(this.doorAnchors);
        if (this.furnitureGroup) list.push(this.furnitureGroup);
        if (this.model) list.push(this.model);
        return list;
    }

    getCameraObstacles() {
        return this.model ? [this.model] : [this.shell];
    }

    dispose() {
        this.scene.remove(this.root);
        this.scene.remove(this.colliders);

        this.root.traverse((child) => {
            if (child.isMesh && child.geometry) child.geometry.dispose();
        });
        this.colliders.traverse((child) => {
            if (child.isMesh && child.geometry) child.geometry.dispose();
        });

        for (const door of this.doors) door.dispose();
        this.importedMaterial?.dispose();
        this.furnitureLibrary.dispose();
        this.structure.dispose();
        this.materials.dispose();
    }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const doubleSidedCache = new Map();
function doubleSided(material) {
    if (doubleSidedCache.has(material.name)) return doubleSidedCache.get(material.name);
    const clone = material.clone();
    clone.side = THREE.DoubleSide;
    doubleSidedCache.set(material.name, clone);
    return clone;
}

/** Undo a previous world-UV tiling so a new tile size can be applied. */
function resetWorldTiling(geometry, previousFinish, materials) {
    const uv = geometry.attributes.uv;
    if (!uv || !previousFinish) return geometry;

    const tile = materials.tileSize(previousFinish);
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * tile, uv.getY(i) * tile);
    }
    uv.needsUpdate = true;
    return geometry;
}

function polygonArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    }
    return Math.abs(area / 2);
}

export function countTriangles(root) {
    let total = 0;
    root.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        const g = child.geometry;
        total += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    });
    return Math.round(total);
}

const WRAPPER_PATTERNS = [
    /^(RootNode|Scene|Sketchfab_model|imported-model)$/i,
    /^Object_?\d+$/i,
    /^[0-9a-f]{16,}/i,
    /\.(obj|fbx|dae|gltf|glb|blend|max|3ds)\b/i,
    /materialmerger|material_merger|\bcleaner\b|\bgles\b/i,
];

const isWrapperName = (name) => WRAPPER_PATTERNS.some((re) => re.test(name));

export function cleanNodeName(name) {
    if (typeof name !== "string" || isWrapperName(name)) return "";

    const cleaned = name
        .replace(/_\d+[\s_]*-[\s_]*[\w.]+_\d+$/, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_.]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s*\d+$/, "")
        .trim();

    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

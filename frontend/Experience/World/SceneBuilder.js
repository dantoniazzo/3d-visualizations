import * as THREE from "three";

import Experience from "../Experience.js";
import MaterialLibrary from "./Builders/MaterialLibrary.js";
import StructureBuilder from "./Builders/StructureBuilder.js";
import KitLibrary from "./Builders/KitLibrary.js";
import FurnitureLibrary from "./Builders/FurnitureLibrary.js";
import Door from "./Door.js";
import Car from "./Vehicle/Car.js";
import { buildOctree, isTransient } from "./Collision.js";
import { GROUND_TYPES, FINISHES } from "../../../shared/catalog.js";
import { pointInPolygon, rectCorners } from "../Utils/geometry.js";

/**
 * Builds a property from a scene spec, and rebuilds the parts of it the
 * editor changes.
 *
 * What stays put and what moves:
 *   - the building — slabs, walls, roofs, doors in their walls — is fixed.
 *     A door can slide along its wall, which rebuilds that wall, but
 *     nothing adds or removes walls;
 *   - stairs, floor openings, furniture and vehicles are the editable
 *     content, each kept in step with its entry in the spec so a save is
 *     just the spec.
 *
 * It also owns the surface registry (so finishes can be swapped in-world),
 * the doors (which animate and collide on their own), and the two collision
 * octrees the player walks against.
 */
export default class SceneBuilder {
    /** Below this many triangles a piece collides as its mesh, not a box. */
    static MESH_COLLISION_BUDGET = 6000;
    /** Anything flatter than this is a rug: walked over, placed under. */
    static FLAT_HEIGHT = 0.035;

    constructor(spec) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.collision = this.experience.world.collision;
        this.spec = spec;

        this.spec.floor_openings = this.spec.floor_openings || [];
        this.spec.furniture = this.spec.furniture || [];
        this.spec.stairs = this.spec.stairs || [];

        this.materials = new MaterialLibrary();
        this.kit = new KitLibrary(this.experience.resources?.items?.kit);
        this.structure = new StructureBuilder(this.materials, this.kit);
        this.furnitureLibrary = new FurnitureLibrary();

        this.root = new THREE.Group();
        this.root.name = "property";

        // Stair ramps: invisible, collide, and move with their flight.
        this.colliders = new THREE.Group();
        this.colliders.name = "colliders";
        this.colliders.visible = false;

        // Bounds boxes standing in for an over-budget imported model.
        this.staticColliders = new THREE.Group();
        this.staticColliders.name = "static-colliders";
        this.staticColliders.visible = false;

        /** surfaceId -> { id, kind, meshes, slot, finish, label } */
        this.surfaces = new Map();
        this.doors = [];
        /** id -> { placement, group } */
        this.furniture = new Map();
        /** id -> { spec, group, collider } */
        this.stairs = new Map();
        /** id -> group */
        this.roomGroups = new Map();
        /** id -> { group, doors } */
        this.wallGroups = new Map();
        /** node name -> { source, base } for pieces lifted out of the model */
        this.modelParts = new Map();

        this.build();
    }

    /**
     * Whether the building itself comes from an imported model. A model in
     * the "furnishings" role brings only furniture: the building is then
     * the spec's own, built here and editable like any generated one.
     */
    get isModelScene() {
        return Boolean(this.spec.model) && this.spec.model.role !== "furnishings";
    }

    build() {
        this.buildGround();
        this.buildRooms();
        this.buildRails();
        this.buildWalls();
        this.buildRoofs();
        this.buildStairs();
        this.buildModel();
        this.buildFreeDoors();
        this.buildLights();
        this.applyFinishOverrides();

        this.scene.add(this.root);
        this.scene.add(this.colliders);
        this.scene.add(this.staticColliders);

        this.buildStaticCollision();
        // Ramps only for now; rebuilt with the furniture once it has loaded.
        this.buildDynamicCollision();

        // Doors join the graph only now that the static octree is closed,
        // so a shut leaf never becomes a permanent wall.
        for (const door of this.doors) {
            door.wallGroup.add(door.group);
            door.group.updateMatrixWorld(true);
        }

        // Cars come after the octree is closed for the same reason doors do:
        // they move, so they must not be baked into the static collision tree.
        this.buildVehicles();

        // Furniture arrives after the catalogue fetch; it never blocks the
        // shell from being walkable.
        this.furnitureReady = this.buildFurniture();
    }

    // ------------------------------------------------------------------
    // Collision
    // ------------------------------------------------------------------

    /** The building: shell, ground, and an imported model's own mesh. */
    buildStaticCollision() {
        const roots = [this.staticColliders];
        if (this.groundPlane) roots.push(this.groundPlane);

        if (this.isModelScene) {
            if (this.model) roots.push(...this.modelCollisionRoots());
        } else {
            roots.push(this.shell);
        }

        this.collision.setStatic(buildOctree(roots, isTransient));
        this.shellDirty = false;
    }

    /**
     * Everything movable, as the player should meet it: stair ramps, and
     * each piece of furniture as its own mesh when that is cheap enough or
     * its bounding box when it is not. Rugs are left out — they are walked
     * over, not into.
     */
    buildDynamicCollision() {
        const proxies = new THREE.Group();
        const roots = [this.colliders, proxies];

        for (const { placement, group } of this.furniture.values()) {
            const item = this.furnitureLibrary.getItem(placement.catalog_id);
            const box = localBox(group);
            if (box.isEmpty()) continue;

            const size = box.getSize(new THREE.Vector3()).multiply(group.scale);
            if (size.y < SceneBuilder.FLAT_HEIGHT || item?.collision === "none") continue;

            const triangles = countTriangles(group);
            const mode =
                item?.collision === "box" || item?.collision === "mesh"
                    ? item.collision
                    : triangles <= SceneBuilder.MESH_COLLISION_BUDGET
                      ? "mesh"
                      : "box";

            if (mode === "mesh") {
                roots.push(group);
            } else {
                const proxy = new THREE.Mesh(
                    new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray())
                );
                box.getCenter(proxy.position);
                proxy.position.applyMatrix4(group.matrixWorld);
                proxy.quaternion.copy(group.quaternion);
                proxy.scale.copy(group.scale);
                proxies.add(proxy);
            }
        }

        this.collision.setDynamic(
            buildOctree(roots, (o) => isTransient(o) || o.name === "missing-model")
        );
        for (const proxy of proxies.children) proxy.geometry.dispose();
        this.objectsDirty = false;
    }

    /** Called by the editor whenever it changes something. */
    markDirty({ shell = false, objects = false } = {}) {
        if (shell) this.shellDirty = true;
        if (objects) this.objectsDirty = true;
    }

    /** Bring both octrees up to date before anyone walks again. */
    refreshCollision() {
        if (this.shellDirty) this.buildStaticCollision();
        if (this.objectsDirty) this.buildDynamicCollision();
    }

    // ------------------------------------------------------------------
    // Shell
    // ------------------------------------------------------------------

    buildGround() {
        const { ground, ground_size: size } = this.spec.environment;
        if (ground === "none" || size <= 0) return;

        const spec = GROUND_TYPES[ground];
        const mesh = this.structure.buildGround({ ...spec, size });
        mesh.userData = { kind: "surface", surfaceKind: "ground", label: "Ground" };
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
            if (this.isModelScene) continue; // imported models bring their own
            this.buildRoom(room);
        }

        this.root.add(this.shell);
    }

    buildRoom(room) {
        const { group, surfaces } = this.structure.buildRoom(room, this.holesFor(room));
        this.shell.add(group);
        this.roomGroups.set(room.id, group);
        this.registerSurfaces(surfaces);
        return group;
    }

    /**
     * Which of a room's slabs an opening at `elevation` goes through.
     *
     * An opening sits at a storey's floor level and cuts the whole
     * sandwich there: the floor of the room standing at that level, and the
     * ceiling of the room below — which is usually a slab's depth lower (a
     * 2.6 m room under a storey 2.8 m up), not level with it.
     */
    static openingCuts(room, elevation) {
        const top = room.elevation + room.height;
        return {
            floor: Math.abs(elevation - room.elevation) < 0.02,
            ceiling: top <= elevation + 0.02 && top > elevation - SceneBuilder.SLAB_DEPTH,
        };
    }

    /** How far below a floor the ceiling beneath it can sit. */
    static SLAB_DEPTH = 0.6;

    /** The floor openings that cut a room's floor and ceiling. */
    holesFor(room) {
        const floor = [];
        const ceiling = [];

        for (const hole of this.spec.floor_openings) {
            const cuts = SceneBuilder.openingCuts(room, hole.elevation);
            if (cuts.floor) floor.push(openingCorners(hole));
            if (cuts.ceiling) ceiling.push(openingCorners(hole));
        }
        return { floor, ceiling };
    }

    /**
     * Rebuild the slabs of every room a set of openings touches — or all of
     * them. Called while an opening, or the flight it belongs to, is moved.
     */
    rebuildRooms(elevations = null) {
        if (this.isModelScene) return;

        for (const room of this.spec.rooms) {
            if (elevations) {
                const touched = elevations.some((e) => {
                    const cuts = SceneBuilder.openingCuts(room, e);
                    return cuts.floor || cuts.ceiling;
                });
                if (!touched) continue;
            }

            const old = this.roomGroups.get(room.id);
            if (old) {
                this.shell.remove(old);
                this.structure.release(old);
            }
            this.buildRoom(room);
            this.reapplyFinishes([`floor:${room.id}`, `ceiling:${room.id}`]);
        }
        this.buildRails();
        this.shellDirty = true;
    }

    /**
     * Rails round the stairwells, each standing on the floor its opening is
     * cut through. Rebuilt with the slabs whenever an opening moves — they
     * go where it goes.
     */
    buildRails() {
        if (this.isModelScene) return;
        for (const group of this.railGroups?.values() || []) {
            this.shell.remove(group);
            this.structure.release(group);
        }
        this.railGroups = new Map();
        for (const hole of this.spec.floor_openings) {
            const group = this.structure.buildRails(hole);
            if (!group) continue;
            this.shell.add(group);
            this.railGroups.set(hole.id, group);
        }
    }

    buildWalls() {
        if (this.isModelScene) return;
        for (const wall of this.spec.walls) this.buildWall(wall);
    }

    buildWall(wall) {
        const { group, surfaces, doors } = this.structure.buildWall(wall);
        this.shell.add(group);
        this.registerSurfaces(surfaces);
        this.doors.push(...doors);
        this.wallGroups.set(wall.id, { group, doors });
        return { group, doors };
    }

    /**
     * Rebuild one wall after an opening in it moved or changed size. The
     * old wall's doors go with it; the new ones are hung straight away,
     * since by now the static octree is built and leaves them out anyway.
     */
    rebuildWall(wallId) {
        const wall = this.spec.walls.find((w) => w.id === wallId);
        const previous = this.wallGroups.get(wallId);
        if (!wall || !previous) return null;

        this.shell.remove(previous.group);
        this.structure.release(previous.group);
        for (const door of previous.doors) door.dispose();
        this.doors = this.doors.filter((d) => !previous.doors.includes(d));

        const { group, doors } = this.buildWall(wall);
        for (const door of doors) {
            door.wallGroup.add(door.group);
        }
        group.updateMatrixWorld(true);
        this.reapplyFinishes([`wall:${wallId}:a`, `wall:${wallId}:b`]);
        this.shellDirty = true;
        return group;
    }

    buildRoofs() {
        if (this.isModelScene) return;

        this.roofGroups = [];
        for (const roof of this.spec.roofs || []) {
            const { group, surfaces } = this.structure.buildRoof(roof);
            // Part of the shell, so the octree picks it up: an attic needs
            // something over it that a visitor cannot walk out through.
            this.shell.add(group);
            this.roofGroups.push(group);
            this.registerSurfaces(surfaces);
        }
    }

    // ------------------------------------------------------------------
    // Stairs
    // ------------------------------------------------------------------

    /**
     * Stairs are the one part of the shell whose visible geometry is not its
     * collision. Treads go in a group the octree never sees; the ramp that
     * makes them climbable goes in the invisible collider group, which the
     * dynamic octree is built from.
     */
    buildStairs() {
        this.fittings = new THREE.Group();
        this.fittings.name = "fittings";
        this.root.add(this.fittings);

        for (const stair of this.spec.stairs) this.buildStair(stair);
    }

    buildStair(stair) {
        const { group, collider, surfaces } = this.structure.buildStairs(stair);
        this.colliders.add(collider);

        const modelFlight = this.isModelFlight(stair);
        const entry = { spec: stair, group, collider, locked: modelFlight };
        if (modelFlight) {
            // The model's mesh already draws the treads; its flight's spec
            // contributes only the invisible ramp, which is what makes those
            // baked treads walkable.
            entry.group = null;
        } else {
            group.userData.stairId = stair.id;
            this.fittings.add(group);
            this.registerSurfaces(surfaces);
        }

        this.stairs.set(stair.id, entry);
        return entry;
    }

    /**
     * Whether a flight is one an imported model draws itself. Anything else
     * — every flight added in the editor — is a flight of its own, drawn and
     * editable, in a model scene as anywhere else. Treating every flight in
     * a model scene as the model's once turned stairs added there into
     * invisible ramps the editor could not see, select or delete.
     *
     * Model flights are marked `model: true`. Specs from before the mark
     * carry none; there it is any flight the editor did not add, whose ids
     * all start "stair-".
     */
    isModelFlight(stair) {
        if (!this.isModelScene) return false;
        return stair.model ?? !String(stair.id).startsWith("stair-");
    }

    /** Add a new flight to the spec and the scene. */
    addStair(stair) {
        this.spec.stairs.push(stair);
        const entry = this.buildStair(stair);
        this.reapplyFinishes([`stairs:${stair.id}`]);
        this.objectsDirty = true;
        return entry;
    }

    /** Rebuild a flight after its dimensions changed. */
    rebuildStair(id) {
        const entry = this.stairs.get(id);
        if (!entry) return null;

        this.disposeStair(entry);
        const next = this.buildStair(entry.spec);
        this.reapplyFinishes([`stairs:${id}`]);
        this.objectsDirty = true;
        return next;
    }

    /** Move a flight without rebuilding it: the treads and ramp just follow. */
    placeStair(id) {
        const entry = this.stairs.get(id);
        if (!entry) return;
        const { spec } = entry;
        for (const node of [entry.group, entry.collider]) {
            if (!node) continue;
            node.position.set(spec.start[0], spec.base_height, spec.start[1]);
            node.rotation.y = THREE.MathUtils.degToRad(spec.yaw);
            node.updateMatrixWorld(true);
        }
        this.objectsDirty = true;
    }

    removeStair(id) {
        const entry = this.stairs.get(id);
        if (!entry) return false;
        this.disposeStair(entry);
        this.stairs.delete(id);
        this.surfaces.delete(`stairs:${id}`);
        this.spec.stairs = this.spec.stairs.filter((s) => s.id !== id);
        this.objectsDirty = true;
        return true;
    }

    disposeStair(entry) {
        if (entry.group) {
            this.fittings.remove(entry.group);
            this.structure.release(entry.group);
        }
        this.colliders.remove(entry.collider);
        entry.collider.traverse((child) => child.isMesh && child.geometry.dispose());
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
            const door = new Door(opening, { thickness: spec.thickness, height: spec.height }, 0, this.materials, this.kit);
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

    /** Re-apply saved overrides to surfaces that were just rebuilt. */
    reapplyFinishes(surfaceIds) {
        for (const id of surfaceIds) {
            const finishId = this.spec.finishes?.[id];
            if (finishId) this.setFinish(id, finishId, { record: false });
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
    // Vehicles
    // ------------------------------------------------------------------

    buildVehicles() {
        this.cars = [];
        if (!this.spec.vehicles?.length) return;

        const models = {
            chassis: this.experience.resources.items.carChassis?.scene,
            wheel: this.experience.resources.items.carWheel?.scene,
        };
        if (!models.chassis) {
            console.error("Car model failed to load; skipping vehicles.");
            return;
        }

        this.vehicleGroup = new THREE.Group();
        this.vehicleGroup.name = "vehicles";
        this.root.add(this.vehicleGroup);

        for (const spec of this.spec.vehicles) {
            const car = new Car(spec, models, this.collision);
            this.vehicleGroup.add(car.group);
            this.cars.push(car);
        }
    }

    /** Nearest car a visitor could reasonably climb into. */
    nearestCar(position, maxDistance = 3.4) {
        let best = null;
        let bestDistance = maxDistance;

        for (const car of this.cars || []) {
            const distance = car.group.position.distanceTo(position);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = car;
            }
        }
        return best;
    }

    // ------------------------------------------------------------------
    // Furniture
    // ------------------------------------------------------------------

    async buildFurniture() {
        this.furnitureGroup = new THREE.Group();
        this.furnitureGroup.name = "furniture";
        this.root.add(this.furnitureGroup);

        await this.furnitureLibrary.loadCatalog();
        this.registerModelParts();

        const pending = [];
        for (const placement of this.spec.furniture) {
            const entry = this.addFurniture(placement, { record: false });
            pending.push(entry.group.userData.ready);
        }

        await Promise.all(pending);
        this.buildDynamicCollision();
        this.experience.world.emit("catalog", this.furnitureLibrary.catalog);
        this.experience.world.emit("furniture-ready");
    }

    addFurniture(placement, { record = true } = {}) {
        const instance = this.furnitureLibrary.createInstance(placement);
        this.furnitureGroup.add(instance);
        // Flush the transform now: raycasts run before the renderer does, so
        // on the frame a piece appears its matrix would still be at the
        // origin and a click would go straight through it.
        instance.updateMatrixWorld(true);
        const entry = { placement, group: instance };
        this.furniture.set(placement.id, entry);

        if (record) this.spec.furniture.push(placement);
        this.objectsDirty = true;
        return entry;
    }

    /**
     * Move, turn or resize a placed piece, and keep the spec in step so the
     * change survives a reload.
     */
    updateFurniture(id, { position, rotation, scale } = {}) {
        const entry = this.furniture.get(id);
        if (!entry) return null;

        if (position) {
            entry.group.position.set(position[0], position[1], position[2]);
            entry.placement.position = [...position];
        }
        if (rotation !== undefined) {
            entry.group.rotation.y = THREE.MathUtils.degToRad(rotation);
            entry.placement.rotation = rotation;
        }
        if (scale !== undefined) {
            const item = this.furnitureLibrary.getItem(entry.placement.catalog_id);
            entry.group.scale.setScalar(scale * (item?.scale ?? 1));
            entry.placement.scale = scale;
        }

        entry.group.updateMatrixWorld(true);
        this.objectsDirty = true;
        return entry.placement;
    }

    removeFurniture(id) {
        const entry = this.furniture.get(id);
        if (!entry) return false;

        this.furnitureGroup.remove(entry.group);
        entry.group.traverse((child) => {
            if (child.isMesh && child.name === "missing-model") child.geometry.dispose();
        });
        this.furniture.delete(id);

        this.spec.furniture = this.spec.furniture.filter((f) => f.id !== id);
        this.objectsDirty = true;
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

        this.extractModelParts();
        this.root.add(this.model);
    }

    /**
     * Lift the movable pieces out of an imported model.
     *
     * A model that names its building (`model.fixed_nodes`) gives up every
     * other top-level node: each is re-rooted at its base centre and kept as
     * a local furniture source, and the model keeps only the building. The
     * first time a scene is opened those pieces are also written into
     * `furniture` at the spot they were modelled in; after that the list is
     * the authority, so a piece deleted in the editor stays deleted.
     */
    extractModelParts() {
        // A furnishings model is all pieces: nothing in it is the building.
        const furnishings = this.spec.model.role === "furnishings";
        const fixed = furnishings ? [] : this.spec.model.fixed_nodes || [];
        if (!fixed.length && !furnishings) return;

        this.model.updateMatrixWorld(true);
        const relative = new THREE.Matrix4();

        for (const node of [...this.model.children]) {
            if (fixed.some((prefix) => node.name.startsWith(prefix))) continue;

            const box = new THREE.Box3().setFromObject(node);
            if (box.isEmpty()) continue;

            const base = new THREE.Vector3(
                (box.min.x + box.max.x) / 2,
                box.min.y,
                (box.min.z + box.max.z) / 2
            );

            relative.makeTranslation(-base.x, -base.y, -base.z).multiply(node.matrixWorld);
            this.model.remove(node);
            relative.decompose(node.position, node.quaternion, node.scale);

            const holder = new THREE.Group();
            holder.name = `part:${node.name}`;
            holder.add(node);
            holder.updateMatrixWorld(true);

            this.modelParts.set(node.name, {
                source: holder,
                base: base.toArray(),
                label: cleanNodeName(node.name) || node.name,
            });
        }
    }

    /** Hand the extracted pieces to the library, and place them once. */
    registerModelParts() {
        if (!this.modelParts.size) return;

        for (const [name, part] of this.modelParts) {
            this.furnitureLibrary.registerLocal(`model:${name}`, {
                name: part.label,
                source: part.source,
            });
        }

        if (!this.spec.model.parts_extracted) {
            const used = new Set(this.spec.furniture.map((f) => f.id));
            for (const [name, part] of this.modelParts) {
                let id = `m-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                while (used.has(id)) id += "-x";
                used.add(id);
                this.spec.furniture.push({
                    id,
                    catalog_id: `model:${name}`,
                    position: part.base.map((n) => Math.round(n * 1000) / 1000),
                    rotation: 0,
                    scale: 1,
                });
            }
            this.spec.model.parts_extracted = true;
        }
    }

    /** The parts of an imported model that the octree should see. */
    modelCollisionRoots() {
        const requested = this.spec.model.collision || "auto";
        if (requested === "none") return [];

        const triangles = countTriangles(this.model);
        let mode = requested;
        if (mode === "auto") {
            mode = triangles <= SceneBuilder.COLLISION_TRIANGLE_BUDGET ? "mesh" : "box";
        }
        this.collisionInfo = { mode, triangles, requested };

        if (mode === "box") {
            console.info(
                `[scene] ${triangles.toLocaleString()} triangles exceeds the ` +
                    `${SceneBuilder.COLLISION_TRIANGLE_BUDGET.toLocaleString()} budget — ` +
                    `using bounds collision. Interior walls will not block movement.`
            );
            this.buildBoundsCollider();
            return [];
        }

        // Stair treads are the case the exclusions exist for: the model
        // draws them, but they are walked on via the ramps in `stairs`.
        // Leaving the risers in the octree catches the player's capsule a
        // metre up the flight.
        const exclude = this.spec.model.collision_exclude || [];
        return this.model.children.filter(
            (child) => !exclude.some((prefix) => child.name.startsWith(prefix))
        );
    }

    static COLLISION_TRIANGLE_BUDGET = 500000;

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
            this.staticColliders.add(mesh);
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
    // Storeys
    // ------------------------------------------------------------------

    /** Indoor floor levels, lowest first. */
    levels() {
        const elevations = [];
        for (const room of this.spec.rooms) {
            if (FINISHES[room.floor_finish]?.kind === "ground") continue;
            if (!elevations.some((e) => Math.abs(e - room.elevation) < 0.05)) {
                elevations.push(room.elevation);
            }
        }
        return elevations.sort((a, b) => a - b);
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
        if (this.vehicleGroup) list.push(this.vehicleGroup);
        if (this.fittings) list.push(this.fittings);
        if (this.doorAnchors) list.push(this.doorAnchors);
        if (this.furnitureGroup) list.push(this.furnitureGroup);
        if (this.model) list.push(this.model);
        return list;
    }

    getCameraObstacles() {
        return this.isModelScene ? [this.model] : [this.shell];
    }

    dispose() {
        this.scene.remove(this.root);
        this.scene.remove(this.colliders);
        this.scene.remove(this.staticColliders);

        this.root.traverse((child) => {
            if (child.isMesh && child.geometry) child.geometry.dispose();
        });
        for (const group of [this.colliders, this.staticColliders]) {
            group.traverse((child) => {
                if (child.isMesh && child.geometry) child.geometry.dispose();
            });
        }

        for (const door of this.doors) door.dispose();
        this.importedMaterial?.dispose();
        this.furnitureLibrary.dispose();
        this.structure.dispose();
        this.kit.dispose();
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

/** A floor opening's outline in plan space. */
export function openingCorners(hole) {
    return rectCorners(
        hole.position[0],
        hole.position[1],
        hole.width,
        hole.depth,
        THREE.MathUtils.degToRad(hole.yaw || 0)
    );
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

/**
 * Bounding box of everything under `root`, in root's own frame — before
 * its position, turn and scale. The editor's fit test and the furniture
 * collision proxies are both built from this.
 */
export function localBox(root) {
    root.updateWorldMatrix(true, true);
    const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    const matrix = new THREE.Matrix4();

    root.traverse((child) => {
        if (!child.isMesh || !child.geometry || child.userData?.helper) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        matrix.multiplyMatrices(inverse, child.matrixWorld);
        part.copy(child.geometry.boundingBox).applyMatrix4(matrix);
        box.union(part);
    });
    return box;
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

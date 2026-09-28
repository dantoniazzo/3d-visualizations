import * as THREE from "three";

import Experience from "../Experience.js";
import MaterialLibrary from "./Builders/MaterialLibrary.js";
import StructureBuilder from "./Builders/StructureBuilder.js";
import KitLibrary from "./Builders/KitLibrary.js";
import batchStatic, { hideOriginals, listStatic, materialKeys } from "./StaticBatcher.js";
import FurnitureLibrary from "./Builders/FurnitureLibrary.js";
import Door from "./Door.js";
import Car from "./Vehicle/Car.js";
import { buildOctree, isTransient } from "./Collision.js";
import { GROUND_TYPES, FINISHES } from "../../../shared/catalog.js";
import { pointInPolygon, rectCorners } from "../Utils/geometry.js";
import { applyReflections } from "../Utils/reflections.js";
import { CEILING_STYLES, GLASS, SWITCH_PLATE, ceilingFitting, wallSwitch } from "./Fittings.js";
import { LIGHTMAP_DECODE, LIGHTMAP_YCOCG } from "./lightmapGLSL.js";

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
    /** How much brighter than white a lit lamp's bulb is drawn. */
    static BULB_GLOW = 6;

    /**
     * @param {object} spec
     * @param {object} [options]
     * @param {object} [options.runtime]  a published version's runtime file
     *        (Publish/Runtime.js): the house is then not built at all
     *        (buildFromRuntime)
     */
    constructor(spec, { runtime = null } = {}) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.collision = this.experience.world.collision;
        this.spec = spec;
        this.runtime = runtime;

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
        if (this.runtime) return this.buildFromRuntime();
        this.buildGround();
        this.buildRooms();
        this.buildRails();
        this.buildWalls();
        this.buildRoofs();
        this.buildStairs();
        this.buildModel();
        this.buildFreeDoors();
        this.buildLights();
        this.buildLightFittings();
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
        this.doorsHung = true;

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

    /** What the building collides as: shell, ground, and an imported model's own mesh. */
    staticCollisionRoots() {
        const roots = [this.staticColliders];
        if (this.groundPlane) roots.push(this.groundPlane);

        if (this.isModelScene) {
            if (this.model) roots.push(...this.modelCollisionRoots());
        } else {
            roots.push(this.shell);
        }
        return roots;
    }

    buildStaticCollision() {
        this.collision.setStatic(buildOctree(this.staticCollisionRoots(), isTransient));
        this.shellDirty = false;
    }

    /**
     * Everything movable, as the player should meet it: stair ramps, and
     * each piece of furniture as its own mesh when that is cheap enough or
     * its bounding box when it is not. Rugs are left out — they are walked
     * over, not into. The boxes are made for the asking: dispose of
     * `proxies` once done.
     */
    dynamicCollisionRoots() {
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
                proxy.userData.label = group.userData.label;
                proxies.add(proxy);
            }
        }
        return { roots, proxies };
    }

    buildDynamicCollision() {
        const { roots, proxies } = this.dynamicCollisionRoots();
        this.collision.setDynamic(buildOctree(roots, skipDynamic));
        for (const proxy of proxies.children) proxy.geometry.dispose();
        this.objectsDirty = false;
    }

    // ------------------------------------------------------------------
    // A published view's runtime file
    // ------------------------------------------------------------------

    /**
     * A public view of a version published with its runtime file
     * (Publish/Runtime.js) builds none of the house: the snapshot draws it,
     * and the file carries the rest — what to collide with, each triangle
     * saying what it is for the crosshair's label; the materials; the glass.
     * So no wall, slab, stair or piece of furniture is made, and no piece
     * of furniture downloaded. What moves is built as ever: the doors, in
     * stand-ins for their walls, the car, and the room lights.
     */
    buildFromRuntime() {
        this.shell = new THREE.Group();
        this.shell.name = "shell";
        this.root.add(this.shell);
        this.rooms = new Map(this.spec.rooms.map((room) => [room.id, room]));

        for (const wall of this.spec.walls || []) {
            const openings = (wall.openings || []).filter((opening) => opening.type === "door");
            if (!openings.length) continue;
            // Where StructureBuilder.buildWall puts a wall: X along it, Z through it.
            const [x1, z1] = wall.start;
            const [x2, z2] = wall.end;
            const group = new THREE.Group();
            group.name = `wall:${wall.id}`;
            group.userData = { kind: "wall", id: wall.id };
            group.position.set((x1 + x2) / 2, wall.base_height, (z1 + z2) / 2);
            group.rotation.y = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
            this.shell.add(group);
            const half = Math.hypot(x2 - x1, z2 - z1) / 2;
            const doors = openings.map((opening) => {
                const door = new Door(opening, wall, opening.offset - half, this.materials, this.kit);
                door.wallGroup = group;
                return door;
            });
            this.doors.push(...doors);
            this.wallGroups.set(wall.id, { group, doors });
        }
        // The cupboard doors under the flights, in stand-ins for the flights.
        for (const stair of this.spec.stairs) {
            if (!stair.closet) continue;
            const group = new THREE.Group();
            group.name = `stairs:${stair.id}`;
            group.userData = { kind: "stairs", id: stair.id };
            group.position.set(stair.start[0], stair.base_height, stair.start[1]);
            group.rotation.y = THREE.MathUtils.degToRad(stair.yaw ?? 0);
            this.shell.add(group);
            const door = this.hangClosetDoor(stair, group);
            if (door) this.doors.push(door);
        }
        this.buildFreeDoors();
        this.buildLights();

        this.scene.add(this.root);
        this.scene.add(this.colliders);
        this.scene.add(this.staticColliders);

        const roots = { static: [], dynamic: [] };
        this.runtime.scene.updateMatrixWorld(true);
        this.runtime.scene.traverse((node) => {
            if (node.isMesh && roots[node.userData.collision]) roots[node.userData.collision].push(node);
        });
        this.collision.setStatic(buildOctree(roots.static));
        this.collision.setDynamic(buildOctree(roots.dynamic));
        for (const mesh of [...roots.static, ...roots.dynamic]) mesh.geometry.dispose();

        for (const door of this.doors) {
            door.wallGroup.add(door.group);
            door.group.updateMatrixWorld(true);
            // The frame is the snapshot's; only what swings is drawn here.
            hideFixedParts(door.group);
        }
        this.buildVehicles();
        this.furnitureReady = Promise.resolve();
    }

    /** The runtime file's materials, by the key the snapshot names each by. */
    runtimeMaterials() {
        const byKey = new Map();
        this.runtime.scene.traverse((node) => {
            const key = node.userData?.materialKey;
            if (!node.isMesh || key === undefined) return;
            const material = node.material;
            // A finish's texture is drawn here, as the editor draws it.
            if (material.userData.finish) material.map = this.materials.getSurface(material.userData.finish).map;
            if (material.userData.vertexColors) material.vertexColors = true;
            material.needsUpdate = true;
            byKey.set(key, material);
        });
        return byKey;
    }

    /** The runtime file's glass, each pane saying which floor it is on. */
    addRuntimeGlass() {
        const group = this.runtime.scene.getObjectByName("see-through");
        if (!group) return;
        this.root.add(group);
        group.updateMatrixWorld(true);
        applyReflections(group);
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
            const group = this.structure.buildRails(hole, this.liningFor(hole));
            if (!group) continue;
            this.shell.add(group);
            this.railGroups.set(hole.id, group);
        }
    }

    /**
     * The lining an opening needs: from the ceiling of the room beneath it
     * up to the floor it is cut through, in that ceiling's finish. Null
     * with no ceiling there.
     */
    liningFor(hole) {
        const [x, z] = hole.position;
        let below = null;
        for (const room of this.spec.rooms) {
            if (!SceneBuilder.openingCuts(room, hole.elevation).ceiling) continue;
            if (!room.ceiling_finish || room.ceiling_finish === "none") continue;
            if (!pointInPolygon(x, z, room.polygon)) continue;
            if (!below || room.elevation + room.height > below.elevation + below.height) below = room;
        }
        const depth = below ? hole.elevation - (below.elevation + below.height) : 0;
        return depth > 0.01 ? { depth, finish: below.ceiling_finish } : null;
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
        // A switch goes by a door: moving the door moves it.
        this.buildLightFittings();
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
        const entry = { spec: stair, group, collider, locked: modelFlight, doors: [] };
        const door = this.hangClosetDoor(stair, group);
        if (door) {
            entry.doors.push(door);
            this.doors.push(door);
            // Hung at once after the build; during it, with the rest.
            if (this.doorsHung) {
                door.wallGroup.add(door.group);
                door.group.updateMatrixWorld(true);
            }
        }
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
     * The door of the cupboard under a flight, if it has one, hung in the
     * flight's `group` where StructureBuilder.closetDoor says: opening out,
     * in a panel a few centimetres thick. Not yet in the graph; the caller
     * adds it, as the walls' doors are.
     */
    hangClosetDoor(stair, group) {
        const place = StructureBuilder.closetDoor(stair);
        if (!place) return null;
        const holder = new THREE.Group();
        holder.name = `closet:${stair.id}`;
        holder.position.copy(place.position);
        holder.rotation.y = place.rotation;
        group.add(holder);
        const opening = {
            id: `${stair.id}-closet`,
            type: "door",
            offset: 0,
            width: place.width,
            height: place.height,
            sill: 0,
            door: { type: "hinged", swing: "outward_left", leaf: "trim_white", frame: "trim_white", handle: "metal_brass" },
        };
        const door = new Door(opening, { id: `${stair.id}-closet`, thickness: 0.04, height: place.height + 0.2 }, 0, this.materials, this.kit);
        door.wallGroup = holder;
        return door;
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
        for (const door of entry.doors || []) door.dispose();
        this.doors = this.doors.filter((door) => !entry.doors?.includes(door));
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
     * A soft light in each room, at its ceiling light (buildLightFittings):
     * an unlit room reads as a bug, so every room gets one.
     *
     * Outdoor slabs are skipped: a yard is lit by the sun, and a point light
     * hovering over a lawn reads as a bug of its own.
     */
    buildLights() {
        this.lights = new THREE.Group();
        this.lights.name = "fixtures";

        for (const room of this.spec.rooms) {
            const fitting = ceilingFitting(room);
            if (!fitting) continue;
            const [x, y, z] = fitting.position;

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
            // Under the glass, clear of it, so the ceiling round it is lit.
            light.position.set(x, y - CEILING_STYLES[fitting.style].radius - 0.1, z);
            light.name = `light:${room.id}`;
            this.lights.add(light);
        }

        this.root.add(this.lights);
    }

    /**
     * Each room's ceiling light — an opal globe on a cord, or a dome flat to
     * the ceiling (World/Fittings.js) — and the switch for it on the wall by
     * the door. Drawn, published and baked like the rest of the house, and
     * walked through: nothing here is collided with. Built again whenever a
     * wall's openings change, since a switch goes by a door.
     */
    buildLightFittings() {
        if (this.lightFittings) {
            this.root.remove(this.lightFittings);
            this.lightFittings.traverse((node) => node.geometry?.dispose());
        }
        const group = new THREE.Group();
        group.name = "light-fittings";
        group.userData.decor = true;
        this.lightFittings = group;
        if (this.isModelScene) return;

        const glass = this.materials.getTrim(GLASS);
        const white = this.materials.getTrim("trim_white");
        const cord = this.materials.getTrim("trim_charcoal");
        const roomAt = (x, y, z) => this.roomAt(x, y, z);

        for (const room of this.spec.rooms) {
            const fitting = ceilingFitting(room);
            if (!fitting) continue;
            // The room's, for which floor they are on (staticOptions).
            const owner = new THREE.Group();
            owner.name = `fittings:${room.id}`;
            owner.userData = { kind: "fitting", id: room.id, decor: true };
            group.add(owner);
            const part = (geometry, material, label, x, y, z) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(x, y, z);
                mesh.userData = { decor: true, label };
                mesh.castShadow = false;
                owner.add(mesh);
                return mesh;
            };
            const label = `${room.name || room.id} light`;
            const style = CEILING_STYLES[fitting.style];
            const [x, y, z] = fitting.position;
            const top = fitting.ceiling;
            if (fitting.style === "pendant") {
                const canopy = 0.025;
                part(new THREE.CylinderGeometry(style.canopy, style.canopy, canopy, 24), white, label, x, top - canopy / 2, z);
                const hang = top - canopy - (y + style.radius);
                part(new THREE.CylinderGeometry(style.cord, style.cord, hang, 6), cord, label, x, top - canopy - hang / 2, z);
                part(new THREE.CylinderGeometry(0.032, 0.036, 0.035, 16), white, label, x, y + style.radius + 0.005, z);
                part(new THREE.SphereGeometry(style.radius, 28, 18), glass, label, x, y, z);
            } else {
                // The dome's rim at the ceiling, its glass below.
                part(new THREE.CylinderGeometry(style.radius + 0.012, style.radius + 0.012, 0.012, 32), white, label, x, top - 0.006, z);
                const dome = part(new THREE.SphereGeometry(style.radius, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass, label, x, top - 0.012, z);
                dome.scale.y = style.depth / style.radius;
            }

            const plate = wallSwitch(room, this.spec, roomAt);
            if (!plate) continue;
            const holder = new THREE.Group();
            holder.position.set(...plate.position);
            holder.rotation.y = plate.yaw;
            holder.userData.decor = true;
            const { size, depth, rocker } = SWITCH_PLATE;
            const face = new THREE.Mesh(new THREE.BoxGeometry(size, size, depth), white);
            const key = new THREE.Mesh(new THREE.BoxGeometry(...rocker), white);
            key.position.z = depth / 2 + rocker[2] / 2;
            for (const mesh of [face, key]) {
                mesh.userData = { decor: true, label: `${label} switch` };
                holder.add(mesh);
            }
            owner.add(holder);
        }

        group.updateMatrixWorld(true);
        this.root.add(group);
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
            if (this.staticColliders.children.length) return [];
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

    /**
     * What a visitor can point at to turn a light on or off, in a public
     * view with light switches (World/Switches.js): a box round each lamp,
     * each ceiling light and each wall switch, from the published spec's
     * lights. Never drawn, published or collided with — only aimed at.
     *
     * @param {object[]} lights  the published spec's, on the switches there are
     */
    buildLightTargets(lights) {
        if (this.lightTargets) {
            this.scene.remove(this.lightTargets);
            this.lightTargets.traverse((node) => node.geometry?.dispose());
        }
        const group = new THREE.Group();
        group.name = "light-targets";
        const material = new THREE.MeshBasicMaterial({ visible: false });
        const rooms = new Map(this.spec.rooms.map((room) => [room.id, room]));
        for (const light of lights) {
            const room = rooms.get(light.room);
            for (const { part, box } of light.targets || []) {
                const [x0, y0, z0, x1, y1, z1] = box;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material);
                mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
                mesh.userData = {
                    lightSwitch: light.switch,
                    name: light.label,
                    label: part === "switch" ? `${light.label} switch` : light.label,
                    elevation: room?.elevation ?? y0,
                };
                group.add(mesh);
            }
        }
        group.updateMatrixWorld(true);
        this.lightTargets = group;
        this.scene.add(group);
    }

    /**
     * The light a ray meets first — or its switch — or null.
     *
     * @param {THREE.Ray} ray
     * @param {object} [options]
     * @param {number} [options.far]  how far it reaches
     * @param {(target: object) => boolean} [options.accept]  which may be picked
     * @returns {{ id, name, label, distance }|null}  the switch, the light's
     *          name, and what was pointed at
     */
    pickLight(ray, { far = Infinity, accept = () => true } = {}) {
        if (!this.lightTargets) return null;
        _pick.ray.copy(ray);
        _pick.far = far;
        for (const hit of _pick.intersectObjects(this.lightTargets.children, false)) {
            const { lightSwitch, name, label, elevation } = hit.object.userData;
            if (!accept({ elevation })) continue;
            return { id: lightSwitch, name, label, distance: hit.distance };
        }
        return null;
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
        // Built from a runtime file, the walls are only in the collision tree.
        if (this.runtime) return [];
        return this.isModelScene ? [this.model] : [this.shell];
    }

    /**
     * Make the finished scene as cheap to draw as it can be, for a public
     * view nobody edits: plain glass, and everything static merged.
     */
    optimizeForViewing() {
        this.simplifyGlass();
        return this.batchStatic();
    }

    /**
     * Swap refractive glass for plain see-through glass.
     *
     * A single transmissive material anywhere in view makes three render
     * every opaque object a second time, into the texture the glass
     * refracts — doubling the frame for a window pane. At the glass's own
     * thinness the difference is hard to see; the reflection it carries
     * from the environment map is what reads as glass, and that stays.
     */
    simplifyGlass() {
        const done = new Set();
        this.root.traverse((object) => {
            if (!object.isMesh) return;
            for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (!material || done.has(material) || !(material.transmission > 0)) continue;
                done.add(material);
                material.transmission = 0;
                material.transparent = true;
                material.opacity = Math.min(material.opacity ?? 1, 0.3);
                material.depthWrite = false;
                material.needsUpdate = true;
            }
        });
    }

    /**
     * What merging, and the public-view snapshot, need to know about the
     * static scene: what to leave out because it moves, which floor each
     * piece is on, and which pieces a bird's-eye view of a floor takes away
     * — its ceilings, and the roof.
     *
     * A piece's floor comes from what it belongs to (its room, its wall's
     * base, its flight's foot, the height it stands at) rather than from
     * how low it reaches: the slab under an upper floor reaches down below
     * that floor's level, but it is that floor's.
     */
    staticOptions() {
        const levels = [...new Set(this.spec.rooms.map((room) => room.elevation))].sort((a, b) => a - b);
        if (!levels.length) levels.push(0);
        const levelAt = (y) => {
            let level = 0;
            for (let i = 0; i < levels.length; i++) if (y >= levels[i] - 0.3) level = i;
            return level;
        };

        const byId = (list) => new Map((list || []).map((item) => [item.id, item]));
        const rooms = byId(this.spec.rooms);
        const walls = byId(this.spec.walls);
        const stairs = byId(this.spec.stairs);
        const holes = byId(this.spec.floor_openings);
        const OWNERS = new Set(["room", "wall", "roof", "stairs", "rail", "furniture", "fitting"]);
        const owner = (mesh) => {
            for (let node = mesh; node; node = node.parent) if (OWNERS.has(node.userData?.kind)) return node;
            return null;
        };
        const _position = new THREE.Vector3();

        return {
            levels,
            skip: (object) =>
                object === this.vehicleGroup ||
                object.userData?.doorLeaf ||
                object.userData?.hingeSide !== undefined ||
                object.userData?.helper,
            levelOf: (mesh, box) => {
                const node = owner(mesh);
                const id = node?.userData.id;
                switch (node?.userData.kind) {
                    case "room":
                    case "fitting":
                        return levelAt(rooms.get(id)?.elevation ?? box.min.y);
                    case "wall":
                        return levelAt(walls.get(id)?.base_height ?? box.min.y);
                    case "stairs":
                        return levelAt(stairs.get(id)?.base_height ?? box.min.y);
                    case "rail":
                        return levelAt(holes.get(node.userData.holeId)?.elevation ?? box.min.y);
                    case "roof":
                        return levels.length - 1;
                    case "furniture":
                        return levelAt(node.getWorldPosition(_position).y);
                    default:
                        return levelAt(box.min.y + 0.05);
                }
            },
            kindOf: (mesh) => {
                if (mesh.userData?.surfaceKind === "ceiling") return "ceiling";
                return owner(mesh)?.userData.kind === "roof" ? "roof" : null;
            },
        };
    }

    /**
     * Merge everything that will not move into one mesh per material and
     * floor. Doors' leaves, the car and the people are left as they are, as
     * is anything transparent.
     *
     * @returns {{ batches: number, merged: number }}
     */
    batchStatic() {
        if (this.batches) return null;
        const { group, batches, merged } = batchStatic(this.root, this.staticOptions());
        this.batches = group;
        this.scene.add(group);
        return { batches, merged };
    }

    /**
     * Draw a published snapshot (Publish/Snapshot.js) in place of the static
     * scene: the same triangles, less every face nobody can see, with every
     * face turned the way it is seen from. The scene built here stays
     * underneath, hidden, for collision, doors and the crosshair, exactly
     * as when it is merged at runtime.
     *
     * Each of the snapshot's meshes names the material it was made with; the
     * live one is used, single-sided, since the snapshot already carries a
     * reversed copy of every face that is seen from both sides.
     *
     * Once its lighting is baked (scripts/bake-public.mjs), each mesh is
     * lit either by the lightmap or through its vertices, and is drawn
     * unlit: its own colour and texture times the light baked for it. No
     * live light touches it, and no shadow map is drawn for it — the
     * difference, on a phone, between lighting the house every frame and
     * not lighting it at all. Metals keep their live material, for the
     * reflections that make them read as metal.
     *
     * @param {object} gltf  the loaded snapshot
     * @param {object} [lighting]  the published version's baked lighting
     * @param {object} [options]  what it was published with (shared/publishOptions.js):
     *   without `cull`, its faces are as they are in the scene, and each
     *   material is drawn single- or double-sided as it is live
     */
    usePublishedView(gltf, lighting = null, { glass = true, cull = true } = {}) {
        if (this.batches) return null;

        const options = this.staticOptions();
        let meshes = [];
        let byKey;
        if (this.runtime) {
            this.addRuntimeGlass();
            byKey = this.runtimeMaterials();
        } else {
            const listed = listStatic(this.root, options);
            meshes = listed.meshes;
            byKey = new Map([...materialKeys(listed.materials)].map(([material, key]) => [key, material]));
        }
        if (glass) this.simplifyGlass();
        const cache = new Map();
        this.baked = Boolean(lighting?.variants);
        this.bakedMaterials = [];
        this.vertexLit = [];
        // Each light switch's own light, baked room by room: which of it
        // each room's lightmapped materials add in (setSwitchLight).
        this.switches = this.baked ? lighting.switches ?? [] : [];
        this.switchLayers = planSwitchLayers(this.switches, maxSwitchLayers(this.experience.renderer?.renderer));
        this.switchWeights = this.switches.map(() => 0);
        // Lamps' bulbs, lit up while their switches are on.
        this.bulbs = [];

        const materialFor = (key, lit, fallback, zone) => {
            // A room with switches of its own draws with materials of its own.
            const layers = lit === "lightmap" ? this.switchLayers.get(zone) : null;
            const cacheKey = `${key}|${this.baked ? lit : ""}${layers ? `|${zone}` : ""}`;
            if (cache.has(cacheKey)) return cache.get(cacheKey);
            const live = byKey.get(key) ?? fallback;
            // A metal has next to no diffuse colour, so its baked light is
            // next to nothing: it keeps its live material and reflections.
            const bakedLight = this.baked && lit && !(live.metalness >= 0.5);
            const side = cull ? THREE.FrontSide : live.side;
            let material;
            if (!bakedLight) {
                material = live.clone();
                material.side = side;
            } else {
                material = new THREE.MeshBasicMaterial({
                    name: live.name,
                    color: live.color ? live.color.clone() : 0xffffff,
                    map: live.map ?? null,
                    side,
                    vertexColors: lit === "vertex",
                });
                if (layers) material.userData.switchLayers = layers;
                this.bakedMaterials.push({ material, lit, zone: layers ? zone : null });
            }
            cache.set(cacheKey, material);
            return material;
        };

        const group = new THREE.Group();
        group.name = "published-view";
        let triangles = 0;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            const { material: key, level = 0, kind = null, cast = true, receive = true, lighting: lit, zone = null, glow = null } = node.userData;
            const mesh = new THREE.Mesh(node.geometry, materialFor(key, lit, node.material, zone));
            mesh.applyMatrix4(node.matrixWorld);
            mesh.name = node.name;
            // Baked, the shadows are in the light already.
            mesh.castShadow = this.baked ? false : cast;
            mesh.receiveShadow = this.baked ? false : receive;
            // Which room it is lit as, once the bake is laid out by room.
            mesh.userData = { batch: true, level, kind, lighting: lit, zone };
            mesh.raycast = () => {};
            if (this.baked && lit === "vertex") {
                this.vertexLit.push(mesh);
                // Each switch's light on it, kept off the GPU until the
                // switch is on (mixVertexLight).
                mesh.userData.switchLight = takeSwitchLight(node.geometry);
            }
            const bulbOf = glow ? this.switches.findIndex((entry) => entry.id === glow) : -1;
            if (bulbOf >= 0) this.bulbs.push({ mesh, index: bulbOf, id: glow, off: mesh.material, on: null });
            group.add(mesh);
            triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
        });

        hideOriginals(meshes);
        this.batches = group;
        this.scene.add(group);
        return { meshes: group.children.length, triangles, hidden: meshes.length };
    }

    /**
     * Light the baked view with one variant — day or night: its lightmap
     * on every lightmapped material, its vertex light on every vertex-lit
     * mesh.
     *
     * The lightmap is stored scaled so its bright light (all but the
     * brightest few texels in a thousand) comes to 1, and three divides a
     * lightmap by π; `info.scale` and π restore it, so what is drawn is the
     * surface's colour times the light Blender baked for it. A lightmap
     * encoded "reinhard" (blender/bake_public.py) keeps what is brighter
     * than that as well, squeezed into the top of its range, and is opened
     * back out here. One stored "ycocg" is its brightness alone, one
     * channel, with its colour beside it (`chroma`) at half the size: on
     * the GPU as they are, for well under half the memory of the colour
     * itself, and put back together as it is drawn.
     */
    setLightingVariant(texture, info, chroma = null) {
        const parted = info.storage === "ycocg" && chroma;
        prepareLightmap(texture, parted ? THREE.RedFormat : null);
        if (parted) prepareLightmap(chroma, THREE.RGFormat);
        const layerEncoding = this.switches[0]?.encoding;
        for (const { material, lit } of this.bakedMaterials) {
            if (lit !== "lightmap") continue;
            if (!material.lightMap) material.needsUpdate = true;
            material.lightMap = texture;
            material.lightMapIntensity = Math.PI * info.scale;
            decodeLightmap(material, info.encoding, parted ? chroma : null, layerEncoding);
        }
        this.lightingInfo = info;
        this.mixVertexLight();
        this.tintDoors(this.mixDoorLight());
    }

    /**
     * Turn light switches on and off: each switch's light, as baked on its
     * own, added to the day's or the night's — in the lightmaps of the
     * rooms it reaches, as layers each room's materials add in; on the
     * thin, vertex-lit faces; and on the doors.
     *
     * @param {number[]} weights  by switch, in the order the bake lists
     *        them (lighting.switches): 0 off, 1 on
     * @param {Map<string, { luma, chroma }>} [textures]  each switch's
     *        layer in each room, as `${switch}|${zone}`: a switch whose
     *        layer is not loaded adds nothing there
     */
    setSwitchLight(weights, textures = new Map()) {
        this.switchWeights = weights;
        for (const { material, zone } of this.bakedMaterials) {
            if (!zone) continue;
            const uniforms = material.userData.switchUniforms;
            if (!uniforms) continue;
            this.switchLayers.get(zone).forEach((layer, k) => {
                const loaded = textures.get(`${layer.index}|${zone}`);
                if (loaded) {
                    prepareLightmap(loaded.luma, THREE.RedFormat);
                    prepareLightmap(loaded.chroma, THREE.RGFormat);
                }
                const weight = loaded ? weights[layer.index] ?? 0 : 0;
                uniforms[k].luma.value = loaded?.luma ?? blankLayer().luma;
                uniforms[k].chroma.value = loaded?.chroma ?? blankLayer().chroma;
                uniforms[k].gain.value = Math.PI * layer.scale * weight;
            });
        }
        for (const bulb of this.bulbs) {
            const on = (weights[bulb.index] ?? 0) > 0;
            bulb.on ??= this.bulbMaterial(bulb);
            bulb.mesh.material = on ? bulb.on : bulb.off;
        }
        if (!this.lightingInfo) return;
        this.mixVertexLight();
        this.tintDoors(this.mixDoorLight());
    }

    /**
     * A lit bulb: its lamp's colour, bright — so bright Filmic draws it
     * close to white, as a camera sees one — and lit by nothing else.
     */
    bulbMaterial({ id, off }) {
        const fitting = this.spec.lights?.find((light) => light.switch === id);
        return new THREE.MeshBasicMaterial({
            name: `${off.name}-lit`,
            color: new THREE.Color(fitting?.color ?? "#ffcf99").multiplyScalar(SceneBuilder.BULB_GLOW),
            side: off.side,
        });
    }

    /**
     * The thin faces' light: the variant's, plus each switch that is on —
     * added up here, once, as switches change, rather than as they are
     * drawn. A face no switch that is on reaches draws the variant's own.
     */
    mixVertexLight() {
        const name = this.lightingInfo.attribute.toLowerCase();
        for (const mesh of this.vertexLit) {
            const geometry = mesh.geometry;
            const light = geometry.getAttribute(name);
            if (!light) continue;
            const on = mesh.userData.switchLight.filter(({ index }) => this.switchWeights[index] > 0);
            if (!on.length) {
                if (geometry.getAttribute("color") !== light) geometry.setAttribute("color", light);
                continue;
            }
            const size = light.itemSize;
            let mixed = mesh.userData.mixedLight;
            if (!mixed || mixed.count !== light.count || mixed.itemSize !== size) {
                mixed = mesh.userData.mixedLight = new THREE.BufferAttribute(new Float32Array(light.count * size), size);
            }
            const out = mixed.array;
            out.set(floatValues(light));
            for (const { index, values } of on) {
                const weight = this.switchWeights[index];
                const step = values.length / light.count;
                // Its colour, not its alpha.
                for (let v = 0, o = 0; o < out.length; v += step, o += size) {
                    out[o] += values[v] * weight;
                    out[o + 1] += values[v + 1] * weight;
                    out[o + 2] += values[v + 2] * weight;
                }
            }
            mixed.needsUpdate = true;
            if (geometry.getAttribute("color") !== mixed) geometry.setAttribute("color", mixed);
        }
    }

    /** Each door's light: the variant's, plus each switch that is on. */
    mixDoorLight() {
        const doors = {};
        for (const [id, light] of Object.entries(this.lightingInfo.doors || {})) doors[id] = [...light];
        this.switches.forEach((entry, index) => {
            const weight = this.switchWeights[index] ?? 0;
            if (!weight) return;
            for (const [id, light] of Object.entries(entry.doors || {})) {
                const door = (doors[id] ??= [0, 0, 0]);
                for (let c = 0; c < 3; c++) door[c] += light[c] * weight;
            }
        });
        return doors;
    }

    /**
     * Door leaves move, so their light cannot be baked; instead each is lit
     * like the air around it, from the probes baked each side of it. Most
     * of the leaf's brightness is that light, given as emission; a quarter
     * is left to the live lights, so its panels still catch some relief.
     */
    tintDoors(probes) {
        const light = new THREE.Color();
        for (const door of this.doors) {
            const probe = probes[door.spec.id];
            if (!probe) continue;
            light.setRGB(...probe);
            for (const { leaf } of door.leaves) {
                if (!leaf.userData.baseColor) {
                    leaf.userData.baseColor = leaf.material.color.clone();
                    leaf.material = leaf.material.clone();
                }
                const base = leaf.userData.baseColor;
                leaf.material.color.copy(base).multiplyScalar(0.25);
                leaf.material.emissive.copy(base).multiply(light).multiplyScalar(0.85);
            }
        }
    }

    dispose() {
        if (this.lightTargets) this.scene.remove(this.lightTargets);
        this.scene.remove(this.root);
        this.scene.remove(this.colliders);
        this.scene.remove(this.staticColliders);
        if (this.batches) {
            this.scene.remove(this.batches);
            for (const batch of this.batches.children) batch.geometry.dispose();
        }

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

const _pick = new THREE.Raycaster();

/** What the dynamic octree leaves out: what isTransient does, and placeholders for missing pieces. */
export function skipDynamic(object) {
    return isTransient(object) || object.name === "missing-model";
}

/** Hide a door's frame, leaving its leaves, hinges and handles. */
function hideFixedParts(node) {
    if (node.userData?.doorLeaf || node.userData?.hingeSide !== undefined) return;
    if (node.isMesh) node.visible = false;
    for (const child of node.children) hideFixedParts(child);
}

const doubleSidedCache = new Map();
function doubleSided(material) {
    if (doubleSidedCache.has(material.name)) return doubleSidedCache.get(material.name);
    const clone = material.clone();
    clone.side = THREE.DoubleSide;
    doubleSidedCache.set(material.name, clone);
    return clone;
}

/**
 * A lightmap texture set up once for drawing: through the lightmap UVs,
 * as the bake laid it out (not flipped). A colour lightmap is sRGB; its
 * brightness or colour alone (`format`, stored "ycocg") is raw 8-bit
 * values, decoded in the shader.
 */
function prepareLightmap(texture, format = null) {
    if (texture.userData.lightmap) return;
    texture.userData.lightmap = true;
    texture.flipY = false;
    texture.channel = 1;
    if (format) {
        texture.format = format;
        texture.colorSpace = THREE.NoColorSpace;
    } else {
        texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;
}

const LIGHTMAP_CHROMA = /* glsl */ `
uniform sampler2D lightMapChroma;
vec3 lightMapColour( float luma, vec2 uv ) {
	return ycocgColour( luma, texture2D( lightMapChroma, uv ).rg );
}
`;

/**
 * The light of the switches that are on, for a room's material with
 * `count` layers (setSwitchLight): each one's crop of the lightmap, stored
 * "ycocg", opened back out by `decode`, times its gain — nothing when it
 * is off, or not loaded yet. Written out layer by layer, as GLSL indexes
 * no array of textures by a loop's counter.
 */
function switchLightGLSL(count, decode) {
    const layers = Array.from({ length: count }, (_, k) => k);
    return /* glsl */ `
${layers.map((k) => `uniform sampler2D switchLuma${k};\nuniform sampler2D switchChroma${k};\nuniform vec4 switchRect${k};\nuniform float switchGain${k};`).join("\n")}
vec3 switchLayer( sampler2D luma, sampler2D chroma, vec4 rect, vec2 uv ) {
	vec2 st = ( uv - rect.xy ) / rect.zw;
	vec3 e = ycocgColour( texture2D( luma, st ).r, texture2D( chroma, st ).rg );
	return ${decode("e")};
}
vec3 switchLight( vec2 uv ) {
	vec3 light = vec3( 0.0 );
${layers.map((k) => `\tif ( switchGain${k} > 0.0 ) light += switchLayer( switchLuma${k}, switchChroma${k}, switchRect${k}, uv ) * switchGain${k};`).join("\n")}
	return light;
}
`;
}

/**
 * Draw a baked material's lightmap as it was stored and encoded
 * (setLightingVariant): its colour from its brightness and `chroma` when
 * given, then opened back out — and, for a room's material with switches
 * of its own (userData.switchLayers), their light added in, as encoded
 * `layerEncoding`.
 */
function decodeLightmap(material, encoding, chroma = null, layerEncoding = null) {
    const uniform = (material.userData.lightMapChroma ??= { value: null });
    uniform.value = chroma;
    const layers = material.userData.switchLayers ?? [];
    const switches = (material.userData.switchUniforms ??= layers.map((layer) => ({
        luma: { value: blankLayer().luma },
        chroma: { value: blankLayer().chroma },
        rect: { value: new THREE.Vector4(...layer.rect) },
        gain: { value: 0 },
    })));
    const key = `${LIGHTMAP_DECODE[encoding] ? encoding : ""}|${chroma ? "ycocg" : ""}|${switches.length}|${layerEncoding ?? ""}`;
    if ((material.userData.lightmapKey ?? "||0|") === key) return;
    material.userData.lightmapKey = key;
    const decode = LIGHTMAP_DECODE[encoding] ?? ((e) => e);
    const decodeLayer = LIGHTMAP_DECODE[layerEncoding] ?? ((e) => e);
    material.onBeforeCompile = (shader) => {
        const plain = "lightMapTexel.rgb * lightMapIntensity";
        if (!shader.fragmentShader.includes(plain)) console.warn("Lightmap not decoded: three's shader has changed");
        let colour = "lightMapTexel.rgb";
        let prefix = "";
        if (chroma || switches.length) prefix += LIGHTMAP_YCOCG;
        if (chroma) {
            shader.uniforms.lightMapChroma = uniform;
            prefix += LIGHTMAP_CHROMA;
            colour = "lightMapColour( lightMapTexel.r, vLightMapUv )";
        }
        let light = `${decode(colour)} * lightMapIntensity`;
        if (switches.length) {
            switches.forEach(({ luma, chroma: layerChroma, rect, gain }, k) => {
                shader.uniforms[`switchLuma${k}`] = luma;
                shader.uniforms[`switchChroma${k}`] = layerChroma;
                shader.uniforms[`switchRect${k}`] = rect;
                shader.uniforms[`switchGain${k}`] = gain;
            });
            prefix += switchLightGLSL(switches.length, decodeLayer);
            light = `( ${light} + switchLight( vLightMapUv ) )`;
        }
        shader.fragmentShader = prefix + shader.fragmentShader.replace(plain, light);
    };
    material.customProgramCacheKey = () => key;
    material.needsUpdate = true;
}

/**
 * How many switches' layers a room's materials can add in: two textures
 * each, beside the surface's own texture and the lightmap's two, within
 * what this GPU can bind at once — and never more than six.
 */
function maxSwitchLayers(renderer) {
    const units = renderer?.capabilities?.maxTextures ?? 16;
    return Math.max(0, Math.min(6, Math.floor((units - 3) / 2)));
}

/**
 * Which switches' light each room's materials add in: every switch whose
 * light reaches the room, as the bake found it — or, where more reach it
 * than there is room for, the strongest there. What is left out is the
 * faint spill through a doorway from the rooms beyond.
 *
 * @returns {Map<string, object[]>} zone -> `{ index, scale, rect }`, the
 *          switch's place in `switches` and its layer's place in the atlas
 */
function planSwitchLayers(switches, max) {
    const byZone = new Map();
    switches.forEach((entry, index) => {
        for (const [zone, layer] of Object.entries(entry.layers || {})) {
            if (entry.storage !== "ycocg" || !layer.chroma) continue;
            if (!byZone.has(zone)) byZone.set(zone, []);
            byZone.get(zone).push({ index, scale: entry.scale, rect: layer.rect, strength: layer.strength ?? 0, layer });
        }
    });
    for (const [zone, layers] of byZone) {
        layers.sort((a, b) => b.strength - a.strength);
        if (layers.length > max) layers.length = max;
        if (!layers.length) byZone.delete(zone);
    }
    return byZone;
}

/**
 * A switch layer's stand-in until it loads — no light, no colour — for the
 * shader to have a texture bound in its place.
 */
let blank = null;
function blankLayer() {
    if (blank) return blank;
    const texture = (data, format) => {
        const t = new THREE.DataTexture(data, 1, 1, format);
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
        return t;
    };
    blank = { luma: texture(new Uint8Array([0]), THREE.RedFormat), chroma: texture(new Uint8Array([128, 128]), THREE.RGFormat) };
    return blank;
}

/**
 * Take each switch's vertex light — `_s0`, `_s1`… — off a vertex-lit
 * mesh's geometry, so it is not sent to the GPU with it: as plain numbers,
 * for mixVertexLight to add up.
 *
 * @returns {{ index: number, values: Float32Array }[]}
 */
function takeSwitchLight(geometry) {
    const taken = [];
    for (const name of Object.keys(geometry.attributes)) {
        const match = /^_s(\d+)$/.exec(name);
        if (!match) continue;
        taken.push({ index: Number(match[1]), values: floatValues(geometry.getAttribute(name)).slice() });
        geometry.deleteAttribute(name);
    }
    return taken;
}

/** An attribute's values as floats, whatever it is stored as. */
function floatValues(attribute) {
    if (attribute.array instanceof Float32Array && !attribute.isInterleavedBufferAttribute) return attribute.array;
    const size = attribute.itemSize;
    const values = new Float32Array(attribute.count * size);
    const get = ["getX", "getY", "getZ", "getW"];
    for (let i = 0; i < attribute.count; i++) {
        for (let c = 0; c < size; c++) values[i * size + c] = attribute[get[c]](i);
    }
    return values;
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

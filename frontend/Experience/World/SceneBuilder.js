import * as THREE from "three";

import Experience from "../Experience.js";
import MaterialLibrary from "./Builders/MaterialLibrary.js";
import StructureBuilder from "./Builders/StructureBuilder.js";
import KitLibrary from "./Builders/KitLibrary.js";
import batchStatic, { hideOriginals, listStatic, materialKeys } from "./StaticBatcher.js";
import FurnitureLibrary from "./Builders/FurnitureLibrary.js";
import Door from "./Door.js";
import Openables, { shutBox, shutParts, shutProxy } from "./Openables.js";
import Car from "./Vehicle/Car.js";
import { TreeKeeper, buildOctree, isTransient } from "./Collision.js";
import rays from "../Utils/rays.js";
import { GROUND_TYPES, FINISHES } from "../../../shared/catalog.js";
import { DEFAULT_CAR } from "../../../shared/cars.js";
import { pointInPolygon, rectCorners } from "../Utils/geometry.js";
import { planBounds } from "./Whereabouts.js";
import { applyReflection, applyReflections, plainGlass, reflectionsOnly } from "../Utils/reflections.js";
import { edgeDistance } from "../../../shared/roomGraph.js";
import { doorOnFloor } from "../../../shared/interact.js";
import { CEILING_STYLES, GLASS, SWITCH_PLATE, ceilingFitting, doorSides, wallSwitch } from "./Fittings.js";
import { buildFence } from "./Builders/FenceBuilder.js";
import { buildHills } from "./Builders/HillBuilder.js";
import { buildNeighbourhood, buildWorldEdge } from "./Builders/NeighbourhoodBuilder.js";
import { planNeighbourhood } from "../../../shared/neighbourhood.js";
import { buildLandscape, buildLandscapeLive, landscapeMaterial, paintTerrain } from "./Builders/LandscapeBuilder.js";
import { hasLandscape } from "../../../shared/landscape.js";
import { groundGradient, hillOutline, planFence, planHills } from "../../../shared/vegetation.js";
import { LIGHTMAP_DECODE, LIGHTMAP_YCOCG } from "./lightmapGLSL.js";
import LightResolver, { PACKED_16 } from "./LightResolver.js";
import { MERGE_CELL, floatValues, mergeRooms, rewritten, tintOf } from "./HouseMerger.js";
import ShutBatcher from "./ShutBatcher.js";
import { LIVE_LAMPS, houseMerge, ownLayer, roomLightmap, roomLightmaps } from "../Utils/device.js";

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
 * the doors and the windows' sashes (which animate, and collide, on their
 * own), and the two collision octrees the player walks against.
 */
export default class SceneBuilder {
    /**
     * Below this many triangles a piece collides as its mesh, not a box: a
     * modelled bed (10–11k) included, whose box — its headboard's width —
     * would wall off the way along its sides in a small bedroom.
     */
    static MESH_COLLISION_BUDGET = 12000;
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
        // The garden's ground: one gradient over the plot, where its settings put it.
        this.materials.textures.setGradient(groundGradient(spec));
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
        // The wall round the neighbourhood's world (buildNeighbourhood): collided with, never drawn.
        this.worldEdge = new THREE.Group();
        this.worldEdge.name = "world-edge";
        this.worldEdge.visible = false;

        /** surfaceId -> { id, kind, meshes, slot, finish, label } */
        this.surfaces = new Map();
        this.doors = [];
        /**
         * The windows' sashes that open (World/Sash.js), a pane each — kept
         * apart from `doors` on purpose: that list is also the bake's doors,
         * each shut in a pass of its own, the doors' probes and the doors E
         * opens unaimed, none of which a window is.
         */
        this.windows = [];
        /** The furniture's doors and drawers that open (Openables.js) — each as far as nothing is in its way. */
        this.openables = new Openables({ world: this.experience.world });
        this.openables.room = { collision: this.collision, own: (part) => this.ownTriangles(part) };
        /** A public view's: those of them, and of the sashes, drawn while shut a mesh a material and a floor (World/ShutBatcher.js). */
        this.shutBatcher = null;
        /** id -> { placement, group } */
        this.furniture = new Map();
        /** id -> { spec, group, collider } */
        this.stairs = new Map();
        /** id -> group */
        this.roomGroups = new Map();
        /** id -> { group, doors, windows } */
        this.wallGroups = new Map();
        /** node name -> { source, base } for pieces lifted out of the model */
        this.modelParts = new Map();

        this.build();

        // A low window's sash that bars the way itself is in no tree, nor a shower's glass door: drawn with the
        // colliders (C) as a door's leaf is.
        this.unregisterSashes = this.experience.colliders?.register((add) => {
            for (const sash of this.windows) for (const { centre, quaternion, half } of sash.getBlockers()) add.box(centre, quaternion, half, "door");
            for (const part of this.openables.waysIn) for (const { centre, quaternion, half } of part.getBlockers()) add.box(centre, quaternion, half, "door");
        });
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
        this.buildFence();
        this.buildHills();
        this.buildNeighbourhood();
        this.buildLandscape();
        this.buildStairs();
        this.buildModel();
        this.buildFreeDoors();
        this.buildLights();
        this.buildLightFittings();
        this.applyFinishOverrides();

        this.scene.add(this.root);
        this.scene.add(this.colliders);
        this.scene.add(this.staticColliders);
        this.scene.add(this.worldEdge);

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
        const roots = [this.staticColliders, this.worldEdge];
        if (this.groundPlane) roots.push(this.groundPlane);

        if (this.isModelScene) {
            if (this.model) roots.push(...this.modelCollisionRoots());
        } else {
            roots.push(this.shell);
        }
        return roots;
    }

    /**
     * The building's tree, from whatever of it has changed since the last
     * time (Collision.js's TreeKeeper): a wall built again because its door
     * slid along it is that wall's triangles out and its new ones in, not
     * the whole house again. The same tree either way.
     */
    buildStaticCollision() {
        this.staticKeeper ??= new TreeKeeper(isTransient);
        this.collision.setStatic(this.staticKeeper.update(this.staticCollisionSources()));
        this.shellDirty = false;
    }

    /**
     * What the building collides as, piece by piece, in the order a tree
     * built from scratch visits it (buildOctree over staticCollisionRoots):
     * the shell a source for each wall, room, roof and the rest of what it
     * holds; anything else whole.
     */
    staticCollisionSources() {
        const sources = [];
        for (const root of this.staticCollisionRoots()) {
            if (!root) continue;
            root.updateWorldMatrix(true, true);
            if (root === this.shell && !root.isMesh && !isTransient(root)) {
                for (const child of root.children) sources.push({ key: child, root: child });
            } else {
                sources.push({ key: root, root });
            }
        }
        return sources;
    }

    /**
     * Everything movable, as the player should meet it: stair ramps, and
     * each piece of furniture as its own mesh when that is cheap enough or
     * its bounding box when it is not — a piece whose doors or drawers open
     * as its mesh without them and a box for each of them, shut. Rugs are
     * left out — they are walked over, not into. The boxes are made for the
     * asking: dispose of `proxies` once done.
     */
    dynamicCollisionRoots() {
        const proxies = new THREE.Group();
        const roots = [this.colliders, proxies];

        for (const { placement, group } of this.furniture.values()) {
            const met = this.collisionOf(placement, group);
            if (!met) continue;
            if (met.mode === "mesh") {
                roots.push(group);
                // (Among the pieces' boxes, in the pieces' order: where dynamicCollisionSources puts them.)
                for (const part of met.parts ?? []) proxies.add(shutProxy(part, group.userData.label));
            } else proxies.add(boxProxy(group, met.box));
        }
        return { roots, proxies };
    }

    /**
     * How a placed piece is met: as its own mesh, or as its box (`box`, in
     * the piece's own space, as it stands shut) — null for one that is
     * walked over, or that its catalogue entry says is not met at all.
     *
     * A piece whose doors or drawers open (Openables.js) is hollow behind
     * them, and they collide with nothing: they move. Met as its mesh, it
     * is met as the rest of it and a box for each of them where it stands
     * shut (`parts`: Openables.js's shutParts), so nobody walks through an
     * open door into the carcass, and the floor inside an L- or U-shaped
     * kitchen's arms is walked on, as it was when such a kitchen had no
     * door that opened. (Until 2026-10-16 such a piece was always met as its
     * box, and a catalogue's `"mesh"` let the visitor into it.) What counts
     * against the budget is what goes into the tree: the piece without its
     * parts. A way in — a shower's glass door (Openables.js's isWayIn) — has
     * no box: it bars the way itself while shut (resolveDoorCollisions), so
     * the shower is stepped into once it is open.
     */
    collisionOf(placement, group) {
        const item = this.furnitureLibrary.getItem(placement.catalog_id);
        const parts = shutParts(group, this.openables);
        const box = parts.length ? shutBox(group, parts) : localBox(group);
        if (box.isEmpty()) return null;

        const size = box.getSize(new THREE.Vector3()).multiply(group.scale);
        if (size.y < SceneBuilder.FLAT_HEIGHT || item?.collision === "none") return null;

        const triangles = countTriangles(group, parts.length ? isOpeningPart : null);
        const mode =
            item?.collision === "box" || item?.collision === "mesh"
                ? item.collision
                : triangles > SceneBuilder.MESH_COLLISION_BUDGET
                  ? "box"
                  : "mesh";
        return mode === "mesh" && parts.length ? { mode, box, parts: parts.filter((part) => !part.wayIn) } : { mode, box };
    }

    /**
     * Which triangles of the collision trees are of a part's own piece
     * (Openables.js's plan: its piece is made to clear them, so they are
     * never in its way as it opens), as a test of a triangle — or null. In
     * the editor, those its piece's sources of the kept tree made
     * (dynamicCollisionSources): its mesh, its parts' boxes, or its box. A
     * public view's tree was made from a runtime file's meshes, one for
     * each thing a triangle can be called (Publish/Runtime.js), and knows
     * only that: those called as the piece is — which leaves another of the
     * same piece beside it out of its way too. (Only for a version
     * published before its parts' `reach`, since 2026-10-16: with it, the
     * view does not look.)
     */
    ownTriangles(part) {
        if (this.runtime) {
            const label = part.node.userData?.label;
            return label ? (triangle) => triangle.label === label : null;
        }
        const group = this.furniture.get(part.piece)?.group;
        if (!group) return null;
        const keys = new Set([group]);
        for (const other of this.openables.parts) if (other.piece === part.piece) keys.add(other.node);
        return (triangle) => keys.has(triangle.source?.key);
    }

    /**
     * The same, piece by piece, for the tree that is kept in step with
     * them (buildDynamicCollision): a source for each ramp and each piece,
     * in the order a tree built from scratch over dynamicCollisionRoots
     * visits them — the ramps, the pieces met as boxes and the boxes of the
     * parts that open of the pieces met as themselves, then those pieces. A
     * box is made only when its piece has moved (`stamp`: where the piece
     * stands and the box round it; for a part, where it stands shut and its
     * box).
     */
    dynamicCollisionSources() {
        const sources = [];
        this.colliders.updateWorldMatrix(true, true);
        if (!skipDynamic(this.colliders)) {
            for (const child of this.colliders.children) sources.push({ key: child, root: child });
        }
        const boxes = [];
        const meshes = [];
        for (const { placement, group } of this.furniture.values()) {
            const met = this.collisionOf(placement, group);
            if (!met) continue;
            if (met.mode === "mesh") {
                meshes.push({ key: group, root: group });
                const label = group.userData.label;
                for (const part of met.parts ?? []) {
                    boxes.push({
                        key: part.node,
                        label,
                        stamp: [...part.matrix.elements, ...part.box.min.toArray(), ...part.box.max.toArray()],
                        mesh: () => {
                            const holder = new THREE.Group();
                            holder.add(shutProxy(part, label));
                            holder.updateWorldMatrix(true, true);
                            return holder.children[0];
                        },
                    });
                }
                continue;
            }
            const { box } = met;
            boxes.push({
                key: group,
                label: group.userData.label,
                stamp: [...group.matrixWorld.elements, ...group.quaternion.toArray(), ...group.scale.toArray(), ...box.min.toArray(), ...box.max.toArray()],
                mesh: () => {
                    const holder = new THREE.Group();
                    holder.add(boxProxy(group, box));
                    holder.updateWorldMatrix(true, true);
                    return holder.children[0];
                },
            });
        }
        return [...sources, ...boxes, ...meshes];
    }

    /**
     * What moves, as it stands now, in the tree the visitor walks against:
     * only the pieces that have moved, come or gone since the last time are
     * made again (Collision.js's TreeKeeper) — the same tree, cell for cell,
     * as building all of it again gives.
     */
    buildDynamicCollision({ wait = true } = {}) {
        this.dynamicKeeper ??= new TreeKeeper(skipDynamic);
        this.collision.setDynamic(this.dynamicKeeper.update(this.dynamicCollisionSources(), { slice: !wait }));
        this.objectsDirty = false;
    }

    /**
     * A tree of what moves that is being built a slice a frame (below),
     * carried on for a few milliseconds — each frame, from World.update —
     * and walked against once it is done. Until then the visitor walks
     * against the tree before it with the pieces that changed put right in
     * it (TreeKeeper.meanwhile); where too much changed for that
     * (`job.stale`) and they are on the move (`moving`), all that is left
     * is done now.
     */
    stepCollision(ms = 6, { moving = false } = {}) {
        const keeper = this.dynamicKeeper;
        if (keeper?.job && keeper.step(moving && keeper.job.stale ? Infinity : ms)) this.collision.setDynamic(keeper.tree);
    }

    /** That tree finished now, for whatever reads the collision as it should be: a publish. */
    settleCollision() {
        this.stepCollision(Infinity);
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
     * of furniture downloaded. What moves is built as ever: the doors and
     * the windows' sashes, in stand-ins for their walls, the car, the room
     * lights, and a site's pools' water (`landscapeLive`, as the editor has
     * it: World/Flora ripples it and lights it at night).
     */
    buildFromRuntime() {
        this.shell = new THREE.Group();
        this.shell.name = "shell";
        this.root.add(this.shell);
        this.rooms = new Map(this.spec.rooms.map((room) => [room.id, room]));

        // The windows whose sashes the publish left for the view to hang
        // (Publish/Runtime.js), and how; none in a version published before
        // windows opened, whose glass is in the file, fixed.
        const hung = this.runtime.scene.userData?.sashes ?? {};
        for (const wall of this.spec.walls || []) {
            const openings = (wall.openings || []).filter((opening) => opening.type === "door");
            const windows = (wall.openings || []).filter((opening) => opening.type === "window" && hung[wall.id]?.[opening.id]);
            if (!openings.length && !windows.length) continue;
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
            // Only the sashes: their frame, mullions and blind are the snapshot's, the pane that bars the way the file's collision.
            const sashes = windows.flatMap((opening) => {
                const tag = { kind: "opening", wallId: wall.id, openingId: opening.id };
                return this.structure.windowSashes(opening, wall, half, tag, hung[wall.id][opening.id]);
            });
            for (const sash of sashes) group.add(sash.group);
            this.windows.push(...sashes);
            this.wallGroups.set(wall.id, { group, doors, windows: sashes });
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
        if (!this.isModelScene && hasLandscape(this.spec)) {
            this.landscapeLive = buildLandscapeLive(this.spec.landscape);
            this.root.add(this.landscapeLive);
        }

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
        for (const sash of this.windows) sash.group.updateMatrixWorld(true);
        this.buildVehicles();
        // The furniture's doors and drawers, and the lights inside it,
        // drawn live as ever (Openables.js).
        this.openableGroup = this.runtime.scene.getObjectByName("openable") ?? null;
        if (this.openableGroup) {
            this.openableGroup.traverse((node) => {
                restoreShadows(node);
                for (const material of node.isMesh ? [node.material].flat() : []) restoreRuntimeMaterial(material, this.materials);
            });
            this.root.add(this.openableGroup);
            this.openableGroup.updateMatrixWorld(true);
            this.openables.add(this.openableGroup);
            // Each part stands here in the world's frame, not its piece's
            // (Publish/Runtime.js), but the way it moves is still said in
            // its piece's: turned as the frame it was said in is turned —
            // the holder's `turn` — or a drawer of a piece placed facing any
            // other way slides into it, or sideways, and a flap swings about
            // the wrong edge. A version published before the file said so
            // (2026-10-16) has a drawer turned as its holder is, which is
            // its piece's turn exactly, a drawer never being turned within
            // its piece (blender/lib/geometry.py's join_piece), and a door
            // about the up axis, which no piece's turn moves.
            const turn = new THREE.Quaternion();
            for (const holder of this.openableGroup.children) {
                const part = this.openables.of(holder);
                if (!part) continue;
                if (holder.userData.turn) part.turnFrame(turn.fromArray(holder.userData.turn));
                else if (part.opens.type === "slide") part.direction.applyQuaternion(holder.quaternion);
            }
        }
        this.furnitureReady = Promise.resolve();
    }

    /**
     * The runtime file's materials, by the key the snapshot names each by:
     * as the editor drew them (restoreRuntimeMaterial), and one drawn by a
     * shader of its own — the terrain's — made again (LandscapeBuilder).
     */
    runtimeMaterials() {
        const byKey = new Map();
        this.runtime.scene.traverse((node) => {
            const key = node.userData?.materialKey;
            if (!node.isMesh || key === undefined) return;
            const rebuilt = landscapeMaterial(node.material, this.materials);
            if (rebuilt) {
                byKey.set(key, rebuilt);
                return;
            }
            restoreRuntimeMaterial(node.material, this.materials);
            byKey.set(key, node.material);
        });
        return byKey;
    }

    /**
     * The runtime file's glass, each pane saying which floor it is on — but
     * a pool's water, which is built live here (buildFromRuntime).
     */
    addRuntimeGlass() {
        const group = this.runtime.scene.getObjectByName("see-through");
        if (!group) return;
        const live = this.landscapeLive?.getObjectByName("pool-water");
        for (const water of live ? group.children.filter((node) => node.name === "pool-water") : []) {
            group.remove(water);
            water.geometry.dispose();
        }
        this.root.add(group);
        group.updateMatrixWorld(true);
        group.traverse((node) => {
            restoreShadows(node);
            for (const material of node.isMesh ? [node.material].flat() : []) restoreRuntimeMaterial(material, this.materials);
        });
        applyReflections(group);
    }

    /** Called by the editor whenever it changes something. */
    markDirty({ shell = false, objects = false } = {}) {
        if (shell) this.shellDirty = true;
        if (objects) this.objectsDirty = true;
    }

    /**
     * Bring both octrees up to date before anyone walks again: what
     * changed is mended in them (Collision.js's TreeKeeper), a few
     * milliseconds for a piece moved or a wall built again.
     *
     * An edit that leaves the tree of what moves to be built again from
     * scratch — the outermost piece moved, or one put beyond all the
     * others (the tree's cells are cut from the box round them all), a
     * third of them moved — is a quarter of a second of a big house. With
     * `wait: false` (leaving edit mode, letting go of a piece in the
     * walkthrough) that is done a slice a frame instead (stepCollision):
     * `collision` is until then the tree as it was with the pieces that
     * changed put right in it — every piece where it stands, in other
     * cells — or, after a great many changed at once, the tree as it was,
     * and the build finished at the visitor's first step (World.update).
     * Whatever else reads it must settleCollision() first. Without
     * `wait: false`, everything is up to date when this returns.
     */
    refreshCollision({ wait = true } = {}) {
        if (this.shellDirty) this.buildStaticCollision();
        if (this.objectsDirty) this.buildDynamicCollision({ wait });
        else if (wait) this.settleCollision();
    }

    // ------------------------------------------------------------------
    // Shell
    // ------------------------------------------------------------------

    buildGround() {
        const { ground, ground_size: size } = this.spec.environment;
        if (ground === "none" || size <= 0) return;

        const spec = GROUND_TYPES[ground];
        // The hills behind the plot rise out of it, where it is cut away.
        const hills = this.isModelScene ? null : planHills(this.spec);
        // Out past the neighbourhood's world on every side.
        const plan = this.neighbourhoodPlan();
        const reach = plan ? 2 * (Math.max(Math.abs(plan.centre[0]), Math.abs(plan.centre[1])) + plan.radius + 40) : 0;
        const mesh = this.structure.buildGround({ ...spec, size: Math.max(size, reach) }, hills ? [hillOutline(hills)] : []);
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
        const { group, surfaces, doors, windows } = this.structure.buildWall(wall);
        this.shell.add(group);
        this.registerSurfaces(surfaces);
        this.doors.push(...doors);
        // (A sash is hung in its wall as it is made: it is in no collision tree — its meshes are leaves, isTransient.)
        this.windows.push(...windows);
        this.wallGroups.set(wall.id, { group, doors, windows });
        return { group, doors };
    }

    /**
     * Rebuild one wall after an opening in it moved or changed size. The
     * old wall's doors and sashes go with it; the new ones are hung straight
     * away, since by now the static octree is built and leaves them out
     * anyway. A window's sashes are new and shut, as a door's leaf is.
     */
    rebuildWall(wallId) {
        const wall = this.spec.walls.find((w) => w.id === wallId);
        const previous = this.wallGroups.get(wallId);
        if (!wall || !previous) return null;

        this.shell.remove(previous.group);
        this.structure.release(previous.group);
        for (const door of previous.doors) door.dispose();
        this.doors = this.doors.filter((d) => !previous.doors.includes(d));
        for (const sash of previous.windows ?? []) sash.dispose();
        this.windows = this.windows.filter((sash) => !previous.windows?.includes(sash));

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

    /**
     * The fence round the plot (shared/vegetation.js): part of the shell, so
     * it is collided with, published and baked as the house is.
     */
    buildFence() {
        if (this.isModelScene) return;
        const runs = planFence(this.spec);
        if (!runs.length) return;
        this.fence = buildFence(runs, this.materials);
        this.shell.add(this.fence);
    }

    /**
     * The small hills behind the house (shared/vegetation.js): ground like
     * the plot's, in the shell, so they are walked on, published and baked.
     */
    buildHills() {
        if (this.isModelScene) return;
        const hills = planHills(this.spec);
        if (!hills) return;
        this.hills = buildHills(hills, this.materials);
        this.shell.add(this.hills);
    }

    /**
     * The neighbourhood round the plot (shared/neighbourhood.js): its
     * streets and its neighbours' houses, in the shell, so they are walked
     * and driven on, published and baked — and the wall round its world,
     * collided with alone.
     */
    buildNeighbourhood() {
        if (this.isModelScene) return;
        const plan = this.neighbourhoodPlan();
        if (!plan) return;
        this.neighbourhood = buildNeighbourhood(plan, this.materials);
        this.shell.add(this.neighbourhood);
        this.worldEdge.add(buildWorldEdge(plan));
    }

    /**
     * A site's own landscape (shared/landscape.js): what of it stands still
     * — its terrain, walls, pergolas, planters, railings, pool — in the
     * shell, so it is walked on, published and baked; what moves — the
     * pool's water, the garden lights — beside it.
     */
    buildLandscape() {
        if (this.isModelScene || !hasLandscape(this.spec)) return;
        const { group, live } = buildLandscape(this.spec.landscape, this.materials);
        this.landscape = group;
        this.shell.add(group);
        this.landscapeLive = live;
        this.root.add(live);
    }

    /** The neighbourhood's plan, as the spec has it now; null without one. */
    neighbourhoodPlan() {
        const key = JSON.stringify([this.spec.garden ?? null, this.spec.rooms?.length]);
        if (this.plannedFor !== key) {
            this.plannedFor = key;
            this.planned = this.isModelScene ? null : planNeighbourhood(this.spec);
        }
        return this.planned;
    }

    /**
     * The hills again, once the garden's settings for them have changed
     * (the editor's Garden panel): them, the ground they are cut out of,
     * the neighbourhood's roads over them, and what is walked on. Not in a
     * view drawn merged.
     */
    rebuildHills() {
        if (this.runtime || this.batches || this.isModelScene) return;
        if (this.hills) {
            this.shell.remove(this.hills);
            this.hills.geometry.dispose();
            this.hills = null;
        }
        if (this.neighbourhood) {
            this.shell.remove(this.neighbourhood);
            this.neighbourhood.traverse((node) => node.geometry?.dispose());
            this.neighbourhood = null;
        }
        for (const edge of [...this.worldEdge.children]) {
            this.worldEdge.remove(edge);
            edge.geometry.dispose();
        }
        if (this.groundPlane) {
            this.root.remove(this.groundPlane);
            this.groundPlane.geometry.dispose();
            this.groundPlane.material.dispose();
            this.groundPlane = null;
        }
        this.buildGround();
        this.buildHills();
        this.buildNeighbourhood();
        for (const mesh of [this.groundPlane, this.hills, this.neighbourhood]) if (mesh) applyReflections(mesh);
        this.buildStaticCollision();
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
        const sides = doorSides(this.spec, roomAt);

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

            const plate = wallSwitch(room, this.spec, roomAt, sides);
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
        // Lit as their switches are, again (World: the glass of a view lit live).
        this.experience.world?.emit?.("fittings-rebuilt", group);
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

        this.vehicleGroup = new THREE.Group();
        this.vehicleGroup.name = "vehicles";
        this.root.add(this.vehicleGroup);

        // Each car as the model it names, preloaded with the scene; one that
        // was not (or failed) is downloaded, and the car dressed when it comes
        // — or, hidden by a visitor (World/Scenery.js), once it is shown.
        const models = this.experience.carModels;
        const hidden = this.experience.hiddenScenery?.has("car");
        for (const spec of this.spec.vehicles) {
            const id = spec.model || DEFAULT_CAR;
            const car = new Car(spec, models.get(id), this.collision);
            car.dress = () => {
                if (car.model || car.dressing) return;
                car.dressing = models
                    .load(id)
                    .catch((error) => {
                        console.error(`Car "${id}" didn't load; using the default.`, error);
                        return models.load(DEFAULT_CAR);
                    })
                    .then((model) => {
                        if (!car.model) car.setModel(model);
                    })
                    .catch((error) => console.error("No car model loaded; the car stays empty.", error));
            };
            car.group.visible = !hidden;
            if (!hidden) car.dress();
            this.vehicleGroup.add(car.group);
            this.cars.push(car);
        }
    }

    /**
     * The cars shown or hidden (World/Scenery.js): hidden, not drawn, not
     * offered to get into — and got out of, if one is being driven.
     */
    showCars(shown) {
        for (const car of this.cars || []) {
            car.group.visible = shown;
            if (shown) car.dress?.();
        }
        const player = this.experience.world?.player;
        if (!shown && player?.inVehicle) player.exitVehicle();
    }

    /**
     * The hills shown, or laid flat at the level of the ground round them
     * (World/Scenery.js): they are the house's own ground, cut out of the
     * ground under them, so hidden they would leave a hole. Flat, they keep
     * their baked light; what is walked on is as it was.
     */
    showHills(shown) {
        const hills = planHills(this.spec);
        if (!hills) return;
        const meshes = [];
        (this.batches ?? this.root).traverse((node) => {
            if (node.isMesh && (node === this.hills || node.userData.material === "hill_grass")) meshes.push(node);
        });
        const at = new THREE.Vector3();
        for (const mesh of meshes) {
            const geometry = mesh.geometry;
            const position = geometry.getAttribute("position");
            const normal = geometry.getAttribute("normal");
            if (!mesh.userData.risen) {
                if (shown) continue;
                mesh.userData.risen = { position: position.array.slice(), normal: normal?.array.slice() };
            }
            if (shown) {
                position.array.set(mesh.userData.risen.position);
                normal?.array.set(mesh.userData.risen.normal);
            } else {
                mesh.updateMatrixWorld();
                const inverse = mesh.matrixWorld.clone().invert();
                for (let i = 0; i < position.count; i++) {
                    at.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
                    at.y = hills.y;
                    at.applyMatrix4(inverse);
                    position.setXYZ(i, at.x, at.y, at.z);
                    // Facing up, for what lights it live.
                    normal?.setXYZ(i, 0, 1, 0);
                }
                if (normal) normal.needsUpdate = true;
            }
            position.needsUpdate = true;
            if (normal) normal.needsUpdate = true;
            geometry.computeBoundingSphere();
            geometry.computeBoundingBox();
        }
        // (Reshaped where they stand, in the geometry they had: what a ray can meet is looked through again, Utils/rays.js.)
        rays.touch();
    }

    /** Nearest car a visitor could reasonably climb into: none while the editor's view leaves the cars out (World/Scope.js). */
    nearestCar(position, maxDistance = 3.4) {
        let best = null;
        let bestDistance = maxDistance;
        if (this.vehicleGroup?.visible === false) return best;

        for (const car of this.cars || []) {
            if (!car.group.visible) continue;
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
        // Its doors and drawers, once its model is here.
        instance.userData.ready.then(() => {
            if (this.furniture.get(placement.id) === entry) this.openables.add(instance);
        });

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
        this.openables.remove(entry.group);
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
        for (const sash of this.windows) sash.update(delta);
        this.openables.update(delta);
        if (this.baked) this.updateDoorLight(delta);
    }

    /**
     * Push the player out of any door still shut enough to block — and of a
     * low window's sash, made to open, where it bars the way itself
     * (WindowSash.getBlockers; any other window's opening has a pane of its
     * own in the tree), and of a shower's glass door, a way in that has no
     * box in the tree (Openable.getBlockers). The scene octree is static, so
     * moving leaves have to be resolved separately.
     */
    resolveDoorCollisions(capsule) {
        let moved = false;
        for (const door of this.doors) {
            for (const blocker of door.getBlockers()) {
                if (Door.resolveCapsule(capsule, blocker)) moved = true;
            }
        }
        for (const sash of this.windows) {
            for (const blocker of sash.getBlockers()) {
                if (Door.resolveCapsule(capsule, blocker)) moved = true;
            }
        }
        for (const part of this.openables.waysIn) {
            for (const blocker of part.getBlockers()) {
                if (Door.resolveCapsule(capsule, blocker)) moved = true;
            }
        }
        return moved;
    }

    /** Every window's sash shut, at once: as a space is published (Publish/Runtime.js). */
    resetWindows() {
        for (const sash of this.windows) sash.reset();
    }

    /**
     * Nearest door the player could reasonably reach and operate: within
     * `maxDistance` across the floor of `position` — the head — and on the
     * floor they stand on (shared/interact.js's doorOnFloor: the door's foot,
     * the group's origin, not above the head nor more than 2.4 m under it),
     * so a door upstairs, over a bedroom below it, is not opened from there
     * with nothing aimed at.
     */
    nearestDoor(position, maxDistance = 2.2) {
        let best = null;
        let bestDistance = maxDistance;

        for (const door of this.doors) {
            const worldPosition = new THREE.Vector3();
            door.group.getWorldPosition(worldPosition);
            if (!doorOnFloor(position.y, worldPosition.y)) continue;
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
            // A little slack below, for standing on a stair nosing or a rug.
            const drop = y - room.elevation;
            if (drop < -0.6 || drop > room.height + 0.4) continue;
            // (Its plan's bounds before its outline: most rooms are nowhere near. Asked every frame, of every room — the
            // room's name on screen, the room drawn live, the lamps nearest — on threshold and stair in more than one place.)
            const [minX, minZ, maxX, maxZ] = planBounds(room.polygon);
            if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
            if (!pointInPolygon(x, z, room.polygon)) continue;
            if (room.voids?.some((hole) => pointInPolygon(x, z, hole))) continue;

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
                    room: light.room ?? null,
                    fixture: light.fixture ?? null,
                };
                group.add(mesh);
            }
        }
        // Never drawn and never moved: out of what each render goes through (hidden — a ray does not ask what is shown,
        // so pickLight meets them as ever) and out of the walk of the scene's matrices, their frames worked out once.
        // Shown, Ladonia's 269 were each tested against the view at each of the frame's three renders of the scene, and
        // each had its frame worked out again every frame: 0.2 ms of one at the highest step, for boxes that draw nothing.
        group.visible = false;
        for (const mesh of group.children) {
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
        }
        group.updateMatrixWorld(true);
        group.matrixAutoUpdate = false;
        group.matrixWorldAutoUpdate = false;
        this.lightTargets = group;
        this.scene.add(group);
    }

    /**
     * The light a ray meets first — or its switch — or null.
     *
     * @param {THREE.Ray} ray
     * @param {object} [options]
     * @param {number} [options.far]  how far it reaches
     * @param {(target: object) => boolean} [options.accept]  which may be
     *        picked, by `{ elevation, room, point, fixture }`: its floor,
     *        its room, where the ray meets it and, a lamp's, its piece
     * @returns {{ id, name, label, distance }|null}  the switch, the light's
     *          name, and what was pointed at
     */
    pickLight(ray, { far = Infinity, accept = () => true } = {}) {
        if (!this.lightTargets) return null;
        _pick.ray.copy(ray);
        _pick.far = far;
        for (const hit of _pick.intersectObjects(this.lightTargets.children, false)) {
            const { lightSwitch, name, label, elevation, room, fixture } = hit.object.userData;
            if (!accept({ elevation, room, point: hit.point, fixture })) continue;
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
        // Built from a runtime file, the furniture's doors and drawers alone.
        if (this.openableGroup) list.push(this.openableGroup);
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

    /** Swap refractive glass for plain see-through glass (Utils/reflections.js plainGlass). */
    simplifyGlass() {
        plainGlass(this.root);
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
        const OWNERS = new Set(["room", "wall", "roof", "stairs", "rail", "furniture", "fitting", "scenery"]);
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
                object.userData?.helper ||
                // A piece's doors and drawers move (Openables.js).
                object.userData?.opens !== undefined ||
                object.userData?.fixture !== undefined ||
                // So do the people (World/People.js, outside this root —
                // never merged, published or baked, wherever they are put).
                object.userData?.kind === "person",
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
                    // The neighbourhood, up its hill or not, is the ground floor's.
                    case "scenery":
                        return 0;
                    case "furniture":
                        return levelAt(node.getWorldPosition(_position).y);
                    default:
                        return levelAt(box.min.y + 0.05);
                }
            },
            kindOf: (mesh) => {
                if (mesh.userData?.surfaceKind === "ceiling") return "ceiling";
                const kind = owner(mesh)?.userData.kind;
                return kind === "roof" || kind === "scenery" ? kind : null;
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
     * Lit live (`live`, Utils/device.js's lightingMode), the sun and the
     * lamps are live lights instead, drawn with their shadows — which
     * follow the doors, the people and the car — on top of the rest of the
     * light, the sky's and everything bounced, from the bake: each mesh is
     * drawn lit, as a matt surface (Lambert, as the bake lit it), with that
     * light as all of its ambient light.
     *
     * @param {object} gltf  the loaded snapshot
     * @param {object} [lighting]  the published version's baked lighting
     * @param {object} [options]  what it was published with (shared/publishOptions.js):
     *   without `cull`, its faces are as they are in the scene, and each
     *   material is drawn single- or double-sided as it is live; whether its
     *   light is `live`; drawn from the bake, whether what moves `shade`s
     *   the sun in it (setSunShade); whether the light `probes` light
     *   what moves (World/ProbeLight.js), rather than the doors' probes;
     *   and whether a shut door dims its rooms (`doors`, the bake's door
     *   states) — none of which a view fully baked does
     */
    usePublishedView(gltf, lighting = null, { glass = true, cull = true, live = false, shade = false, probes = false, doors = true, room = false } = {}) {
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
        // The sun and the lamps drawn live, the rest of the light baked.
        this.liveLight = this.baked && live;
        // Drawn from the bake, what moves shading the sun in it.
        this.sunShade = this.baked && !this.liveLight && shade ? sunShadeUniforms() : null;
        this.probeLit = this.baked && probes;
        this.bakedMaterials = [];
        // Seen from above with the roof off (World/BirdView.js), by day, the
        // rooms' own light is a tenth to a hundredth of the garden's beside
        // them: every baked surface indoors draws its light times this
        // (setIndoorGain, INDOOR_LIFT) — 1, but then.
        this.indoorGain = { value: 1 };
        const indoors = new Set(this.spec.rooms.filter((room) => room.ceiling_finish !== "none").map((room) => room.id));
        this.vertexLit = [];
        /** ...and by the room each is lit as (mixVertexLight, a room at a time). */
        this.vertexLitByZone = new Map();
        // Each light switch's own light, baked room by room: which of it
        // each room's lightmapped materials add in (setSwitchLight). Lit
        // live, each material also samples the sun's and the lamps' shadows;
        // drawn from the bake with what moves shading the sun, the sun's
        // mask and its shadow map.
        this.switches = this.baked ? lighting.switches ?? [] : [];
        // How much of each room's light stays as each of its doors shuts
        // (lighting.doorStates): a room's lightmapped materials dim by it as
        // its doors close, read from one atlas of every door's rooms — and
        // by how open each door is, eased as its leaf swings (updateDoorLight).
        this.doorStates = this.baked && doors ? lighting.doorStates ?? null : null;
        this.doorLayers = planDoorLayers(this.doorStates);
        this.doorLight = new Map();
        for (const layers of this.doorLayers.values()) for (const { id } of layers) if (!this.doorLight.has(id)) this.doorLight.set(id, { value: 0 });
        this.doorAtlas = { value: whiteLayer() };
        this.doorAtlasReady = false;
        this.doorOpenness = new Map();
        this.doorLightVersion = 0;
        // The rooms each door's swing changes the light of: those it dims
        // as it shuts, and those a switch next door lights through it
        // (switchReach) — the only rooms whose thin faces' light is added
        // up again as it swings (updateDoorLight).
        this.doorZones = new Map();
        const dims = (id, zone) => {
            if (!this.doorZones.has(id)) this.doorZones.set(id, new Set());
            this.doorZones.get(id).add(zone);
        };
        for (const [zone, layers] of this.doorLayers) for (const { id } of layers) dims(id, zone);
        for (const entry of this.switches) for (const [zone, ids] of Object.entries(entry.through ?? {})) for (const id of ids) dims(id, zone);
        this.doorsMoved = new Set();
        const reserved = this.liveLight ? 3 + 1 + LIVE_LAMPS : this.sunShade ? 3 + 2 : 3;
        const renderer = this.experience.renderer?.renderer;
        // Drawn from the bake, the house's light as it is now — each room's
        // doors and switches in it — is resolved into ONE lightmap
        // (World/LightResolver.js), which every room's materials read alike:
        // no room then draws with materials of its own (materialFor's
        // `own`), and any number of switches may reach a room. Lit live, or
        // where the device cannot draw it, or asked not to (`?lightmap=rooms`),
        // each room's materials work it out as they are drawn, as before.
        this.resolver?.dispose();
        this.resolver = this.resolvesLight(lighting, renderer)
            ? new LightResolver(renderer, {
                  zones: lighting.zones,
                  doors: Math.max(0, ...[...this.doorLayers.values()].map((layers) => layers.length)),
                  // Where what moves shades the sun, the sun's light is the fragment's to add, by how much of each room's light its doors leave (RESOLVED_LIGHT).
                  stays: Boolean(this.sunShade && this.doorStates),
                  layerCurves: this.ownLayers(),
              })
            : null;
        this.lightmapSize = lighting?.size ?? 0;
        // Whether one room at a time may be drawn as a version that was not
        // baked draws it (World/LiveRoom.js), when its visitor asks: every
        // view drawn from its bake that may (`room`). For it the published
        // materials are kept by their keys, and how the snapshot was culled.
        this.roomLiveOK = Boolean(room && this.baked && !this.liveLight);
        this.liveByKey = byKey;
        this.viewCull = cull;
        /** A published material's copy for a room drawn unbaked (roomMaterial), by key and side. */
        this.roomMaterials = new Map();
        // A room with doors reads their atlas too: a texture fewer for switches.
        this.switchLayers = planSwitchLayers(
            this.switches,
            this.resolver ? Infinity : (zone) => maxSwitchLayers(renderer, reserved + (this.doorLayers.has(zone) ? 1 : 0)),
            Boolean(this.resolver)
        );
        /** The rooms with something of their own to resolve: switches that reach them, doors, or a part of the lightmap held their own way (roomLightmap). */
        this.resolvedZones = new Set([
            ...this.switchLayers.keys(),
            ...this.doorLayers.keys(),
            ...(this.resolver ? Object.values(lighting.variants).flatMap((variant) => Object.keys(roomLightmap(variant)?.zones ?? {})) : []),
        ]);
        if (this.resolver) {
            // The rooms nearest the visitor first, when many change at once.
            const middles = new Map(
                this.spec.rooms.map((room) => {
                    const xs = room.polygon.map((point) => point[0]);
                    const zs = room.polygon.map((point) => point[1]);
                    return [room.id, [(Math.min(...xs) + Math.max(...xs)) / 2, room.elevation ?? 0, (Math.min(...zs) + Math.max(...zs)) / 2]];
                })
            );
            this.resolver.distance = (zone) => {
                const middle = middles.get(zone);
                const at = this.experience.camera?.activeCamera?.position;
                if (!middle || !at) return 0;
                return (middle[0] - at.x) ** 2 + ((middle[1] + 1.5 - at.y) * 3) ** 2 + (middle[2] - at.z) ** 2;
            };
        }
        this.switchWeights = this.switches.map(() => 0);
        this.switchTextures = new Map();
        // Which switches' lamps are lit live (LiveLamps): theirs is only
        // what they bounce, from the bake.
        this.switchLive = this.switches.map(() => false);
        // Lamps' bulbs, lit up while their switches are on.
        this.bulbs = [];
        // Drawn from the bake, the rooms' meshes that draw alike are made
        // one (World/HouseMerger.js) — and, so that more of them do, the
        // materials that look the same are one material (lookOf: a
        // publish numbers each piece of furniture's own copy of a finish).
        // Lit live, and a version that was not baked, keep theirs.
        const merge = this.baked && !this.liveLight ? houseMerge(MERGE_CELL) : null;
        // ...and a surface with no texture takes its colour from its
        // vertices (`tint`, tintShader), so that every such surface draws
        // with one material whatever its colour — but a ground the garden
        // looks for by its material's name (Vegetation.findGroundUvs,
        // showHills).
        const grounds = new Set([...this.spec.rooms.map((room) => room.floor_finish), this.hills?.material?.name, "hill_grass", GROUND_TYPES[this.spec.environment?.ground]?.finish, "rough_grass"]);

        const materialFor = (key, lit, fallback, zone, kind, twoSided = false) => {
            const live = byKey.get(key) ?? fallback;
            // A room with switches or doors of its own draws with materials of
            // its own — but for one drawn by a shader of its own (the
            // terrain: five grounds and a relief), which has no texture units
            // to spare for them, and whatever of it is in a room lies under
            // the floor.
            // (None does where the house's light is resolved into one lightmap, which holds them all.)
            const ownDrawn = this.baked && ownShader(live) && live.userData.attributes?.length > 0;
            const layers = lit === "lightmap" && !ownDrawn && !this.resolver ? this.switchLayers.get(zone) : null;
            const doors = lit === "lightmap" && !ownDrawn && !this.resolver ? this.doorLayers.get(zone) : null;
            const own = Boolean(layers || doors);
            // Lit live, so do ceilings (bakedAmbient's `lid`).
            const lid = this.liveLight && kind === "ceiling";
            // ...and what is lit as a room indoors, from what is not: its
            // light is brought up from above (indoorGain) — but a ceiling's,
            // whose top is all that shows from there, and was baked as it
            // is seen then, with the roof off and the sun on it.
            const indoor = this.baked && Boolean(lit) && indoors.has(zone) && kind !== "ceiling";
            // A metal has next to no diffuse colour, so its baked light is
            // next to nothing: it keeps its live material and reflections.
            const bakedLight = this.baked && lit && !(live.metalness >= 0.5);
            // (Merged, one material for all that look as this one does, whatever their keys — and one for all without a texture that differ only in colour.)
            const tinted = Boolean(merge?.tint && bakedLight && live.color && !live.map && !ownShader(live) && !grounds.has(live.name));
            const look = tinted ? `tinted|${live.side}|${live.polygonOffset}|${live.polygonOffsetFactor}|${live.polygonOffsetUnits}` : merge?.share ? lookOf(live, bakedLight) : key;
            const cacheKey = `${look}|${this.baked ? lit : ""}${own ? `|${zone}` : ""}${lid ? "|lid" : ""}${indoor ? "|in" : ""}${twoSided ? "|two" : ""}`;
            if (cache.has(cacheKey)) return cache.get(cacheKey);
            // Culled, a face is drawn from the side it was seen from — but for
            // what is seen through itself, kept whole and drawn two-sided.
            const side = twoSided ? THREE.DoubleSide : cull ? THREE.FrontSide : live.side;
            let material;
            if (!bakedLight) {
                material = liveCopy(live, side, cull);
            } else {
                // Unlit, or — its light live — matt and lit, as it was baked.
                const Material = this.liveLight ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
                material = new Material({
                    name: tinted ? "tinted" : live.name,
                    color: live.color && !tinted ? live.color.clone() : 0xffffff,
                    map: live.map ?? null,
                    side,
                    vertexColors: lit === "vertex",
                });
                // Layered in depth as it is live (MaterialLibrary's layer()).
                material.polygonOffset = live.polygonOffset;
                material.polygonOffsetFactor = live.polygonOffsetFactor;
                material.polygonOffsetUnits = live.polygonOffsetUnits;
                if (lid) material.userData.lid = true;
                if (indoor) material.userData.indoorGain = this.indoorGain;
                // Drawn by a shader of its own — the terrain's grounds blended
                // by its paint — under the bake's light as under the sun:
                // its shader first, then the bake's (decodeLightmap,
                // lightByVertices); lit live, its relief too.
                if (ownShader(live) && live.userData.attributes?.length) {
                    material.userData.attributes = [...live.userData.attributes];
                    drawnByOwnShader(material, live);
                    if (this.liveLight && live.normalMap) {
                        material.normalMap = live.normalMap;
                        material.normalScale.copy(live.normalScale);
                    }
                }
                if (tinted) {
                    material.userData.tinted = true;
                    tintByVertices(material);
                }
                if (this.liveLight && lit === "vertex") lightByVertices(material);
                else if (indoor && lit === "vertex") gainByVertices(material);
                if (layers) material.userData.switchLayers = layers;
                if (doors) {
                    material.userData.doorAtlas = this.doorAtlas;
                    material.userData.doorUniforms = doors.map((layer) => ({
                        rect: { value: new THREE.Vector4(...layer.rect) },
                        at: { value: new THREE.Vector4(...layer.at) },
                        open: this.doorLight.get(layer.id),
                    }));
                }
                this.bakedMaterials.push({ material, lit, zone: own ? zone : null });
            }
            cache.set(cacheKey, material);
            return material;
        };

        const group = new THREE.Group();
        group.name = "published-view";
        let triangles = 0;
        let made = [];
        const none = () => {};
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            const { material: key, level = 0, kind = null, cast = true, receive = true, lighting: lit, zone = null, glow = null, twoSided = false } = node.userData;
            const material = materialFor(key, lit, node.material, zone, kind, twoSided);
            // What its shader reads of its own (the terrain's paint), under
            // its own name again: glTF wrote it as `_PAINT`, read back
            // `_paint` — or, four numbers a vertex, as two pairs (Snapshot.js).
            for (const name of material.userData.attributes ?? []) restoreAttribute(node.geometry, name);
            // A terrain published or baked before its paint went with it: painted here, as the editor paints it.
            if (material.userData.attributes?.includes("paint") && !node.geometry.getAttribute("paint") && this.spec.landscape?.terrain) {
                paintTerrain(node.geometry, this.spec.landscape.terrain, node.matrixWorld);
            }
            const mesh = new THREE.Mesh(node.geometry, material);
            mesh.applyMatrix4(node.matrixWorld);
            mesh.name = node.name;
            // Baked, the shadows are in the light already; lit live, they
            // are drawn — but, over a bake, for a lamp's glass or bulb,
            // which lets its light out, as the bake had it. Unbaked, a
            // lamp's casts as the editor's furniture does.
            const shadows = !this.baked || this.liveLight;
            mesh.castShadow = shadows && cast && !(glow && this.baked);
            mesh.receiveShadow = shadows && receive;
            // Which room it is lit as, once the bake is laid out by room.
            // A light's glass or bulb keeps its switch (Snapshot.js).
            mesh.userData = { batch: true, level, kind, lighting: lit, zone, material: key, ...(glow && { glow }) };
            // Its colour, where its material leaves that to its vertices (HouseMerger writes it into them).
            if (material.userData.tinted) mesh.userData.tint = (byKey.get(key) ?? node.material).color.toArray();
            mesh.raycast = none;
            // Each switch's light on a thin face, kept off the GPU until
            // the switch is on (mixVertexLight) — what its lamps bounce
            // too, only where they are lit live.
            if (this.baked && lit === "vertex") mesh.userData.switchLight = takeSwitchLight(node.geometry, this.liveLight);
            const bulbOf = glow ? this.switches.findIndex((entry) => entry.id === glow) : -1;
            if (bulbOf >= 0) this.bulbs.push({ mesh, index: bulbOf, id: glow, off: mesh.material, on: null });
            made.push(mesh);
            triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
        });

        // The rooms' meshes that draw alike made one, each room's triangles
        // together in it (World/HouseMerger.js): Ladonia's 3,952 become a
        // few hundred. The thin faces among them keep their baked light off
        // the GPU, a room's part at a time (`thin`: mixThinLight).
        this.thin = [];
        this.thinByZone = new Map();
        this.zoneRanges = null;
        this.merged = null;
        if (merge) {
            const started = performance.now();
            const count = made.length;
            // (The light a shut door leaves a thin face — all but the sun's — is read only where doors dim their rooms.)
            const soft = Object.values(lighting.variants).map((variant) => variant.indirect?.attribute?.toLowerCase()).filter(Boolean);
            const result = mergeRooms(made, { ...merge, without: this.doorStates ? [] : soft });
            made = result.meshes;
            for (const part of result.thin) {
                this.thin.push(part);
                if (!this.thinByZone.has(part.zone)) this.thinByZone.set(part.zone, []);
                this.thinByZone.get(part.zone).push(part);
            }
            // The rooms' own arrays are in the merged meshes now, and their
            // geometries emptied (HouseMerger): the loader, which keeps every
            // array it read for as long as the snapshot is kept, lets them go.
            gltf.parser?.cache?.removeAll?.();
            /** What the merge came to (to compare): the rooms' meshes, and what is drawn in their place. */
            this.merged = { from: count, to: made.length, merged: result.merged, into: result.into, cell: merge.cell, share: merge.share, tint: merge.tint, ms: performance.now() - started };
        }
        for (const mesh of made) {
            group.add(mesh);
            // (A mesh left a room's own — a lamp's glass — whose material takes its colour from its vertices.)
            if (mesh.material.userData?.tinted && !mesh.geometry.getAttribute("tint")) mesh.geometry.setAttribute("tint", tintOf(mesh.geometry.attributes.position.count, mesh.userData.tint));
            // The thin faces still a mesh a room: all of them, unmerged; merged, a lamp's glass and bulbs.
            if (!mesh.userData.switchLight) continue;
            const zone = mesh.userData.zone;
            this.vertexLit.push(mesh);
            if (!this.vertexLitByZone.has(zone)) this.vertexLitByZone.set(zone, []);
            this.vertexLitByZone.get(zone).push(mesh);
        }

        hideOriginals(meshes);
        if (cull && (!this.baked || this.liveLight)) this.addShadowCasters(group);
        // Reflecting what they reflect in the editor — before the sky, if
        // there is one, sorts them (Sky.applyIndoor): a metal or clear glass
        // the studio (Utils/reflections.js), which a runtime file's copy,
        // through glTF, comes without; what the sky lit stays the sky's.
        group.traverse((node) => {
            for (const material of node.isMesh ? [node.material].flat() : []) if (!material.userData.skyMap) applyReflection(material);
        });
        // Drawn from the bake, the clear glass that stands in a room draws its reflections alone.
        // (The furniture built here too, where the version has no runtime file to draw it from: its glass is kept live as that file's is.)
        // (The furniture's doors and drawers too, drawn live from either: a shower's glass door, a washing machine's porthole.
        // And the windows' sashes, whose panes hang in their walls, shut, as the fixed panes do: kept as those are —
        // until a sash is turned in, and its pane stands in the room: then kept to its reflections too.)
        if (this.baked) {
            this.clearGlassIndoors([group, this.root.getObjectByName("see-through"), this.furnitureGroup, this.openableGroup, ...this.windows.map((sash) => sash.group)]);
            for (const sash of this.windows) sash.glazeInRoom((material) => reflectionsOnly(material) ?? material);
        }
        // The furniture's doors and drawers, and the windows' sashes, drawn while they are shut a mesh a material and a
        // floor (World/ShutBatcher.js), each lit as it is: by the light probes, the doors' probes' tint, or live.
        if (this.openables.parts.length || this.windows.length) {
            const box = new THREE.Box3();
            this.shutBatcher = new ShutBatcher({
                parts: this.openables.parts,
                sashes: this.windows,
                light: this.probeLit ? "probe" : this.baked && !this.liveLight ? "tint" : "plain",
                look: (material) => lookOf(material, false),
                levelOf: (mesh) => mesh.userData.level ?? options.levelOf(mesh, box.setFromObject(mesh)),
                parent: this.root,
            });
            // ...and the glass shut inside a fridge, drawn only while a door of it is open.
            this.shutBatcher.enclose(this.enclosedGlass());
        }
        // The cars' headlamps' beam: a spotlight where the view takes live
        // light, a pool of light on the road where it is drawn from the bake.
        for (const car of this.cars ?? []) car.lights?.setMode(this.baked && !this.liveLight ? "baked" : "lit");
        // Lit live, whatever is drawn live — the glass, the doors — takes the
        // lamps' shadows too, or a lamp next door would light it through the wall.
        if (this.liveLight) {
            this.root.traverse((node) => {
                if (node.isMesh && node.visible) node.receiveShadow = true;
            });
        }
        this.batches = group;
        this.scene.add(group);
        this.holdStill();
        return { meshes: group.children.length, triangles, hidden: meshes.length };
    }

    /**
     * What of a public view never moves, its frames worked out once: the
     * root, the shell and its walls' and stairs' stand-ins and their doors'
     * frames, the furniture's parts' group and the lights inside pieces, the
     * glass, the fittings, the cars' group, the shut parts' meshes. three
     * works every object's frame out again from its position, turn and scale
     * at each render of the scene — a view drawn from its bake renders it
     * three times a frame — and an object whose frame has been worked out
     * again has every one under it worked out again too: the root's did, so
     * all of the house's were, every time. Ladonia's version with its parts
     * and sashes has 1,700 more of them than the one before (5,947 against
     * 4,254): three's walk of the matrices alone took 1.7 ms of a frame of
     * the highest step where the version before took 1.2 (1.4 since). What
     * moves under them moves as ever — a door's hinge and leaf, a sash's
     * turn and tilt, a car, a part lifted out of its floor's mesh (World/
     * ShutBatcher.js, which holds a shut part's own frame still while it is
     * drawn by it) — and its world matrix still follows its own.
     *
     * The scene itself is held still too, and the house's merged meshes
     * (`batches`) with it. Its frame was worked out at every walk like any
     * object's, and so — three passes the word down: an object whose frame is
     * worked out has every one under it worked out, held still or not, and
     * goes into every one of them, passed over (`matrixWorldAutoUpdate`) or
     * not — all of the scene's were, every frame: the 5,876 objects of
     * Ladonia's version with its parts, where the version before had 4,169
     * (1.4 ms of the walk at the highest step against 1.1). Held, a walk
     * goes into what is still only to find what has moved under it, and
     * works out the frames of what moves alone, and of what is under that.
     * What is added to a group passed over once this has run must have its
     * world matrix worked out by whoever adds it.
     */
    holdStill() {
        const still = (node) => {
            if (!node?.matrixAutoUpdate) return;
            node.updateMatrix();
            node.matrixAutoUpdate = false;
        };
        still(this.scene);
        still(this.root);
        for (const group of [this.shell, this.openableGroup, this.lights, this.vehicleGroup, this.root.getObjectByName("see-through"), this.shutBatcher?.group, this.batches]) still(group);
        for (const child of this.shell?.children ?? []) still(child);
        for (const door of this.doors) still(door.group);
        for (const pane of this.root.getObjectByName("see-through")?.children ?? []) still(pane);
        for (const mesh of this.batches?.children ?? []) still(mesh);
        // A light inside a piece stays where its piece was published (its holder: Publish/Runtime.js), the parts' own are the shut batcher's.
        // A holder that is only where something is — a tap, a shower's valve, its steam: Ladonia has 171 — draws nothing:
        // hidden, as the renders and the walk of the scene go, and read for where it is all the same (World/Water.js). Not
        // one with a light inside a piece, which hangs the light lent to it from itself (Openables.lend).
        for (const holder of this.openableGroup?.children ?? []) {
            if (holder.userData.opens) continue;
            still(holder);
            if (holder.userData.fixture && !holder.userData.fixture.light && !holder.children.length) holder.visible = false;
        }
        this.root.updateMatrixWorld(true);
        this.batches?.updateMatrixWorld(true);
        // The glass, the shut meshes and the house's merged meshes, nothing under them moving, are not so much as visited
        // from now on: what is merely visited at each render was still a third of a millisecond of a frame for Ladonia's
        // parts and sashes (two thousand objects), which the shut batcher passes over in the same way while they are shut.
        for (const group of [this.root.getObjectByName("see-through"), this.shutBatcher?.group, this.batches]) if (group) group.matrixWorldAutoUpdate = false;
    }

    /**
     * The glass a piece's light's doors shut in — a fridge's glass shelves —
     * with those doors (World/ShutBatcher.js's enclose): `[{ mesh, parts }]`.
     * A publish draws a piece's glass live, merged by its material (the
     * see-through group), and each of Ladonia's thirteen kitchens with a
     * fridge has its shelves as one such mesh: drawn every frame they were
     * in view, through any number of walls, from both of their sides in two
     * of the frame's renders — 36 of the draws of a frame of A1's living
     * room, for glass shut away in fridges, 9 of them in the other villa.
     *
     * A glass mesh is shut in by the doors a light inside its piece follows
     * (the fridge's, Openables.link) only as it stands: across the doors'
     * face no further than they reach, and wholly behind them — on the side
     * away from the way they swing open (tried, a little open, and put
     * back). A piece turned off the square is left as it is, its boxes in
     * the world being no measure of it; so is one whose doors' box is deeper
     * than a door's with its bins (ENCLOSING_DEPTH), and any glass not so
     * shut in.
     */
    enclosedGlass() {
        const glass = this.root.getObjectByName("see-through")?.children ?? [];
        const openables = this.openables;
        if (!glass.length || !openables?.lights.length) return [];
        openables.link();
        const found = [];
        const box = new THREE.Box3();
        const doorBox = new THREE.Box3();
        const size = new THREE.Vector3();
        const shut = new THREE.Vector3();
        const ajar = new THREE.Vector3();
        const placed = new Map((this.spec.furniture ?? []).map((item) => [item.id, item]));
        const claimed = new Set();
        for (const entry of openables.lights) {
            const doors = entry.doors.filter((part) => part.opens.type === "hinge");
            if (!doors.length || doors.length !== entry.doors.length) continue;
            // (Square to the world's axes, as its boxes are: turned by a quarter, or not at all.)
            const turn = (((placed.get(entry.piece)?.rotation ?? 0) % 90) + 90) % 90;
            if (Math.min(turn, 90 - turn) > 0.01) continue;
            doorBox.makeEmpty();
            for (const part of doors) {
                part.node.updateWorldMatrix(true, true);
                doorBox.expandByObject(part.node);
            }
            if (doorBox.isEmpty()) continue;
            // Its thinnest way is the way through the doors; the room is on the side they swing to.
            doorBox.getSize(size);
            const axis = size.x <= size.y && size.x <= size.z ? "x" : size.y <= size.z ? "y" : "z";
            if (size[axis] > ENCLOSING_DEPTH) continue;
            doorBox.getCenter(shut);
            for (const part of doors) part.pose(ENCLOSING_AJAR * part.reach);
            box.makeEmpty();
            for (const part of doors) {
                part.node.updateWorldMatrix(true, true);
                box.expandByObject(part.node);
            }
            box.getCenter(ajar);
            for (const part of doors) part.pose(0);
            for (const part of doors) part.node.updateWorldMatrix(true, true);
            const room = Math.sign(ajar[axis] - shut[axis]);
            if (!room) continue;
            const across = ["x", "y", "z"].filter((other) => other !== axis);
            for (const mesh of glass) {
                if (!mesh.isMesh || mesh.userData.helper || claimed.has(mesh)) continue;
                box.setFromObject(mesh);
                if (box.isEmpty()) continue;
                const within = across.every((other) => box.min[other] >= doorBox.min[other] - ENCLOSING_SLACK && box.max[other] <= doorBox.max[other] + ENCLOSING_SLACK);
                // (Behind them, and no further than a fridge is deep: the same kitchen in the next villa stands behind
                // this one's doors too, twenty-four metres on.)
                const behind =
                    room > 0
                        ? box.max[axis] <= doorBox.min[axis] + ENCLOSING_SLACK && box.min[axis] >= doorBox.min[axis] - ENCLOSING_REACH
                        : box.min[axis] >= doorBox.max[axis] - ENCLOSING_SLACK && box.max[axis] <= doorBox.max[axis] + ENCLOSING_REACH;
                if (!within || !behind) continue;
                found.push({ mesh, parts: doors });
                claimed.add(mesh);
            }
        }
        return found;
    }

    /**
     * In a view drawn from its bake, the clear glass that stands in a room
     * under a ceiling — a shower's screen, a table's top; not a window's
     * pane or a glazed door, which hang in a wall — given a copy of its
     * material that draws its reflections alone (Utils/reflections.js's
     * reflectionsOnly). Nothing lights glass there as its room is lit: what
     * moves has the bake's probes (World/ProbeLight.js) and the walls their
     * lightmap, but a pane kept live had only the studio it reflects, at the
     * garden's strength, on its own white — a milky white panel by day in a
     * bathroom lit by its lamp alone (and whiter in a room the eye has
     * adapted to).
     *
     * @param {(THREE.Object3D|undefined)[]} roots  what the view draws that does not move
     */
    clearGlassIndoors(roots) {
        const box = new THREE.Box3();
        const centre = new THREE.Vector3();
        for (const root of roots) {
            // (Where each stands, whether or not it has been drawn yet.)
            root?.updateWorldMatrix(true, true);
            root?.traverse((node) => {
                if (!node.isMesh || !node.geometry?.attributes?.position) return;
                const materials = [node.material].flat();
                if (!materials.some((material) => material?.transparent)) return;
                if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
                box.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld).getCenter(centre);
                const room = this.roomAt(centre.x, centre.y, centre.z);
                if (!room || room.ceiling_finish === "none") return;
                // (A pane at the room's very edge is a window's, set on the line of its wall: Ladonia's loggias'.)
                if (edgeDistance(centre.x, centre.z, room.polygon) < GLASS_CLEAR_OF_WALL) return;
                const clear = materials.map((material) => reflectionsOnly(material) ?? material);
                node.material = Array.isArray(node.material) ? clear : clear[0];
            });
        }
    }

    /**
     * Whether a published view's baked light is resolved into one lightmap
     * (World/LightResolver.js): drawn from the bake — not lit live, whose
     * rooms' materials go on working their light out themselves — with
     * something of a room's own to resolve (switches, doors, or a part of
     * the lightmap held its own way: Utils/device.js's roomLightmap), the
     * bake laid out room by room with its brightness and colour apart, as
     * the resolver keeps it; not asked otherwise in the link
     * (`?lightmap=rooms`); and on a device that draws it right.
     */
    /** Whether any switch's layer in a room is held its own way (Utils/device.js's ownLayer): the resolver's shader then opens those out too. */
    ownLayers() {
        return this.switches.some((entry) => Object.values(entry.layers ?? {}).some((layer) => ownLayer(layer)));
    }

    resolvesLight(lighting, renderer) {
        if (!this.baked || this.liveLight || !renderer || roomLightmaps()) return false;
        const coded = Object.values(lighting.variants ?? {}).some((variant) => roomLightmap(variant));
        if (!this.switches.length && !this.doorStates && !coded) return false;
        if (!lighting.zones || !lighting.size) return false;
        if (!Object.values(lighting.variants).every((variant) => variant.storage === "ycocg" && variant.chroma)) return false;
        // Every room with a switch's layer, a door or a curve of its own: a rectangle of the atlas.
        const rooms = [
            ...this.switches.flatMap((entry) => Object.keys(entry.layers ?? {})),
            ...this.doorLayers.keys(),
            ...Object.values(lighting.variants).flatMap((variant) => Object.keys(roomLightmap(variant)?.zones ?? {})),
        ];
        if (!rooms.every((zone) => lighting.zones[zone])) return false;
        // At the lightmap's size and at a phone's copy's (halved until it is 2048 or less: blender/bake_public.py's
        // write_lightmap): every room the texels its own faces blend in.
        let phone = lighting.size;
        while (phone > 2048) phone /= 2;
        if (![lighting.size, phone].every((size) => LightResolver.regions(lighting.zones, size))) return false;
        return LightResolver.usable(renderer, {
            doors: Math.max(1, ...[...this.doorLayers.values()].map((layers) => layers.length)),
            encoding: lighting.variants.day?.encoding ?? Object.values(lighting.variants)[0]?.encoding,
            layerEncoding: this.switches[0]?.encoding ?? null,
            // (Tried with the very shader the view will draw with: its rooms' curves, its layers' curves.)
            coded,
            layerCurves: this.ownLayers(),
        });
    }

    /**
     * The faces culled from the snapshot that cast a shadow in the editor
     * (Publish/Snapshot.js's shadowCasters, carried by the runtime file),
     * drawn into the shadow maps alone: nothing of them is drawn in the
     * view — a draw range of nothing, but while a shadow map is drawn — so
     * a table's underside, gone, still shades the floor under it. By floor
     * and kind, as the meshes beside them, for the bird's-eye view; and by
     * a square of the site, which a shadow camera that does not take it in
     * leaves out. Drawn as the editor draws them: from behind — a two-sided
     * material's faces (`twoSided`) from either side.
     */
    addShadowCasters(group) {
        const casters = this.runtime?.scene.getObjectByName("shadow-casters");
        if (!casters) return;
        const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        material.name = "shadow-caster";
        const twoSided = material.clone();
        twoSided.name = "shadow-caster-two-sided";
        twoSided.shadowSide = THREE.DoubleSide;
        const none = () => {};
        casters.updateMatrixWorld(true);
        for (const node of casters.children) {
            if (!node.isMesh) continue;
            const geometry = node.geometry;
            geometry.computeBoundingSphere();
            geometry.setDrawRange(0, 0);
            const mesh = new THREE.Mesh(geometry, node.userData.twoSided ? twoSided : material);
            mesh.applyMatrix4(node.matrixWorld);
            mesh.name = node.name;
            mesh.castShadow = true;
            mesh.receiveShadow = false;
            mesh.userData = { batch: true, shadowCaster: true, level: node.userData.level ?? 0, kind: node.userData.kind ?? null };
            mesh.onBeforeShadow = () => geometry.setDrawRange(0, Infinity);
            mesh.onAfterShadow = () => geometry.setDrawRange(0, 0);
            mesh.raycast = none;
            group.add(mesh);
        }
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
     *
     * `rooms`: the lightmap given is the one with each room's part held its
     * own way (World.drawLighting, Utils/device.js's roomLightmap) — which
     * rooms, and how. Only where the house's light is resolved into one
     * lightmap, which opens each room's part out; what else reads this
     * lightmap as it is (the grass, the terrain's own shader) reads the
     * garden's part of it, which is held as ever.
     */
    setLightingVariant(texture, info, chroma = null, rooms = null) {
        // (The one with each room's part held its own way: read texel for texel — prepareLightmaps says why.)
        const parted = this.prepareLightmaps(texture, info, chroma, !rooms);
        const layerEncoding = this.switches[0]?.encoding;
        // Resolved into one lightmap, the variant's own is what that is
        // drawn from, and the house's materials read the resolved one —
        // stored as the variant's is, so with the same scale and decoding.
        const resolver = this.resolver;
        const scale = resolver ? this.resolvedScale(info) : info.scale;
        if (resolver) {
            const size = texture.userData.size?.[0] || texture.image?.width || this.lightmapSize;
            resolver.setBase(texture, chroma, info, size, layerEncoding, scale, rooms);
        }
        // (How much of each room's light stays with its doors, for the sun's to be given back by: RESOLVED_LIGHT.)
        if (this.sunShade) this.sunShade.roomStays.value = resolver?.stays ?? whiteLayer();
        /** The variant's lightmap as the house's materials read it (lightByMap): kept, for a material made later. */
        this.lightmapNow = { texture, info, chroma: parted ? chroma : null, layerEncoding, scale };
        for (const { material, lit } of this.bakedMaterials) if (lit === "lightmap") this.lightByMap(material);
        this.lightingInfo = info;
        this.resolveRooms();
        this.mixVertexLight();
        this.tintDoors(this.mixDoorLight());
    }

    /**
     * A lightmapped material given the lightmap of the variant shown
     * (setLightingVariant): the house's light resolved into one, where it
     * is, and else the variant's own.
     */
    lightByMap(material) {
        const now = this.lightmapNow;
        if (!now) return;
        const { texture, info, chroma, layerEncoding, scale } = now;
        const resolver = this.resolver;
        if (!material.lightMap) material.needsUpdate = true;
        // One drawn by a shader of its own (the terrain) reads the
        // variant's own lightmap still, as it did room by room: no
        // switch lights it and no door dims it — what of it is in a
        // room lies under the floor, and shows through the gap at a
        // threshold, lit by the room's lamps, as a strip of grass.
        const resolved = Boolean(resolver) && !OWN_SHADER.has(material);
        material.lightMap = resolved ? resolver.luma : texture;
        material.lightMapIntensity = Math.PI * (resolved ? scale : info.scale);
        if (resolved) decodeLightmap(material, info.encoding, resolver.chroma, null, this.sunShade, true);
        else decodeLightmap(material, info.encoding, chroma, layerEncoding, this.sunShade);
    }

    /**
     * The scale the resolved lightmap of a variant is kept in — what its
     * squeezing (reinhard) is centred on. The variant's own, so that
     * whatever no switch lights and no door dims is the variant's texel to
     * the bit — but for a variant far darker than its lamps: a night's
     * lightmap is scaled to the dusk outside (Ladonia's 0.30, Wrenfield's
     * 0.05) and its rooms are lit by switches scaled to themselves (1.4,
     * 3.9, the middle one of each), whose light, kept in the night's scale,
     * would all lie squeezed up against the top of it — where blending
     * texels, and the mipmaps', comes out darker than it does in the
     * lamps' own layers (a ceiling's bright ring, seen at a slant, by a
     * tenth). There it is kept in the switches' middle scale.
     */
    resolvedScale(info) {
        const scales = this.switches.filter((entry) => entry.storage === "ycocg" && entry.scale > 0).map((entry) => entry.scale);
        if (!scales.length) return info.scale;
        scales.sort((a, b) => a - b);
        const middle = scales[scales.length >> 1];
        return info.scale >= middle / 4 ? info.scale : middle;
    }

    /**
     * The house's light resolved into one lightmap (World/LightResolver.js):
     * each room as it is now told to the resolver — its doors, each as far
     * open as it is, once their atlas is here; and every switch that is on
     * and loaded, its layer and how strongly it is added (its scale, how
     * far on it is, and, in a room it lights through doors alone, how far
     * those are open: switchReach) — or, its lamps lit live, what they
     * bounce. The resolver draws again the rooms that have changed, before
     * the next frame (drawLight).
     *
     * @param {Iterable<string>} [zones]  only these rooms; all of them without
     */
    resolveRooms(zones = null) {
        const resolver = this.resolver;
        if (!resolver || !this.lightingInfo) return;
        for (const zone of zones ?? this.resolvedZones) {
            const doors = [];
            if (this.doorAtlasReady) {
                for (const { id, rect, at } of this.doorLayers.get(zone) ?? []) doors.push({ rect, at, open: this.doorLight.get(id).value });
            }
            const layers = [];
            for (const layer of this.switchLayers.get(zone) ?? []) {
                const weight = this.switchWeights[layer.index] ?? 0;
                if (!(weight > 0)) continue;
                const reach = weight * this.switchReach(layer.index, zone);
                const loaded = this.switchTextures.get(`${layer.index}|${zone}`);
                if (!loaded) continue;
                // Read texel for texel as the resolved lightmap is drawn: no mipmaps of its own.
                prepareLightmap(loaded.luma, THREE.RedFormat, false);
                prepareLightmap(loaded.chroma, THREE.RGFormat, false);
                // (A layer held its own way — `curve` — is its light itself, opened out by the resolver: no scale.)
                layers.push({ luma: loaded.luma, chroma: loaded.chroma, rect: layer.rect, gain: (layer.curve ? 1 : layer.scale) * reach, curve: layer.curve });
            }
            resolver.setZone(zone, doors, layers);
        }
    }

    /**
     * Before a frame is drawn (Renderer.render): whatever of the resolved
     * lightmap has changed, drawn again. Nothing, while nothing has.
     */
    drawLight() {
        this.resolver?.flush();
        // (What of the doors and drawers, and the sashes, is drawn shut with others: as they are now, after the world's update.)
        const batcher = this.shutBatcher;
        if (!batcher) return;
        batcher.update();
        // Their own shaders, which nothing draws while they are merged, made ahead once every part has its light — a
        // moment after, out of the first frames' way — and again a moment after each change of the day's light
        // (ShutBatcher.prepareOwn): opened, a door of a material drawn nowhere else is then no stop of its first frame.
        if (!batcher.ownScheduled && batcher.allLit()) {
            batcher.ownScheduled = true;
            const world = this.experience.world;
            const prepare = (again) => {
                if (this.shutBatcher !== batcher) return;
                const own = batcher.prepareOwn(this.experience.renderer, this.experience.camera?.activeCamera, again);
                // ...and then those of the scene with a fridge's light in it, which is out of the scene's light while
                // every fridge is shut (Openables.warmAll): its first opening is then no wait for its light either.
                Promise.resolve(own)
                    .then(() => this.shutBatcher === batcher && this.openables.warmAll())
                    .catch((error) => console.warn("The shaders for a fridge's light could not be built ahead", error));
            };
            clearTimeout(this.ownTimer);
            if (this.onOwnLight) world.off?.("lighting", this.onOwnLight);
            this.ownTimer = setTimeout(() => prepare(false), OWN_AFTER);
            this.onOwnLight = () => {
                clearTimeout(this.ownTimer);
                this.ownTimer = setTimeout(() => prepare(true), OWN_AFTER);
            };
            world.on?.("lighting", this.onOwnLight);
        }
    }

    /**
     * Set a variant's lightmap up to be drawn — and its colour, when it is
     * stored apart — whether the house draws it or only the grass reads
     * it (lit live, the house draws the one without the sun). Returns
     * whether the colour is apart.
     *
     * `mipmaps` false for the lightmap with each room's part held its own
     * way (setLightingVariant's `rooms`): the resolver and the grass read
     * it texel for texel, and the one thing that read it through its
     * mipmaps — the terrain's own shader, which keeps the variant's own
     * lightmap (lightByMap) — blended, from the third of them on, the
     * rooms' texels beside the garden's rectangle into the ground: light
     * held by another curve, read as the garden's.
     */
    prepareLightmaps(texture, info, chroma = null, mipmaps = true) {
        const parted = Boolean(info.storage === "ycocg" && chroma);
        prepareLightmap(texture, parted ? THREE.RedFormat : null, mipmaps);
        if (parted) prepareLightmap(chroma, THREE.RGFormat, mipmaps);
        return parted;
    }

    /**
     * Turn light switches on and off: each switch's light, as baked on its
     * own, added to the day's or the night's — in the lightmaps of the
     * rooms it reaches, as layers each room's materials add in; on the
     * thin, vertex-lit faces; and on the doors.
     *
     * Lit live, a switch whose lamps are lit live (setLiveSwitches) adds
     * only what they bounce: their straight light is the live lights'.
     *
     * @param {number[]} weights  by switch, in the order the bake lists
     *        them (lighting.switches): 0 off, 1 on
     * @param {Map<string, { luma, chroma }>} [textures]  each switch's
     *        layer in each room, as `${switch}|${zone}` — and what its lamps
     *        bounce, as `${switch}|${zone}|indirect`: a switch whose layer
     *        is not loaded adds nothing there
     */
    setSwitchLight(weights, textures = new Map()) {
        this.switchWeights = weights;
        this.switchTextures = textures;
        this.applySwitchLight();
    }

    /**
     * Which switches' lamps are lit live (LiveLamps), by switch: theirs is
     * only what they bounce, from the bake; the others' is all of it.
     *
     * @param {boolean[]} live
     */
    setLiveSwitches(live) {
        if (live.every((on, index) => on === this.switchLive[index])) return;
        this.switchLive = live;
        this.applySwitchLight();
    }

    /** How far a switch's lamps are lit live — lit live over the whole house (setLiveSwitches): 0 or 1. */
    liveShare(index) {
        return this.switchLive[index] ? 1 : 0;
    }

    applySwitchLight() {
        const weights = this.switchWeights;
        const textures = this.switchTextures;
        // (Resolved into one lightmap, no material has layers of its own: applySwitchGains tells the resolver.)
        for (const { material, zone } of this.bakedMaterials) {
            const uniforms = material.userData.switchUniforms;
            if (!zone || !uniforms?.length) continue;
            this.switchLayers.get(zone).forEach((layer, k) => {
                const live = this.switchLive[layer.index];
                const loaded = textures.get(`${layer.index}|${zone}${live ? "|indirect" : ""}`);
                if (loaded) {
                    prepareLightmap(loaded.luma, THREE.RedFormat);
                    prepareLightmap(loaded.chroma, THREE.RGFormat);
                }
                uniforms[k].luma.value = loaded?.luma ?? blankLayer().luma;
                uniforms[k].chroma.value = loaded?.chroma ?? blankLayer().chroma;
            });
        }
        this.applySwitchGains();
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
     * How strongly each room's switch layers are added in: each switch's
     * light, on or off — only what its lamps bounce when they are lit
     * live — and in a room next door that it lights through doors alone,
     * as far as they are open (switchReach).
     *
     * @param {Iterable<string>} [zones]  resolved into one lightmap, only
     *        these rooms' light is worked out again (a door's)
     */
    applySwitchGains(zones = null) {
        if (this.resolver) return this.resolveRooms(zones);
        for (const { material, zone } of this.bakedMaterials) {
            const uniforms = material.userData.switchUniforms;
            if (!zone || !uniforms?.length) continue;
            this.switchLayers.get(zone).forEach((layer, k) => {
                const live = this.switchLive[layer.index];
                const loaded = this.switchTextures.has(`${layer.index}|${zone}${live ? "|indirect" : ""}`);
                const weight = loaded ? this.switchWeights[layer.index] ?? 0 : 0;
                const scale = live ? this.switches[layer.index].indirect.scale : layer.scale;
                uniforms[k].gain.value = Math.PI * scale * weight * this.switchReach(layer.index, zone);
            });
        }
    }

    /**
     * How much of a switch's light reaches `zone`: all of it, unless the
     * room is next door to the switch's and joined to it by doors alone
     * (the bake's `through`) — then as far as they are open, on average.
     */
    switchReach(index, zone) {
        const doors = this.switches[index]?.through?.[zone];
        if (!doors?.length) return 1;
        let open = 0;
        for (const id of doors) open += this.doorOpenness.get(id) ?? 1;
        return open / doors.length;
    }

    /**
     * How much of a room's light stays with its doors as they are: each
     * door's share of it (the bake's door states), as far as it is shut —
     * for what has no texels of the room's own, its thin faces and the
     * light probes. All of it until the doors' atlas is here, so the rest
     * of the room does not dim without it.
     */
    zoneStays(zone) {
        const doors = this.doorAtlasReady ? this.doorLayers.get(zone) : null;
        if (!doors) return 1;
        let stays = 1;
        for (const { id, share } of doors) stays *= THREE.MathUtils.lerp(share, 1, this.doorLight.get(id).value);
        return stays;
    }

    /**
     * The doors' atlas (World.loadDoorStates): how much of each room's light
     * stays with each of its doors shut, texel by texel.
     */
    setDoorAtlas(texture) {
        prepareLightmap(texture, THREE.RedFormat);
        // Every crop has only a few texels round it: no mipmaps to blend it with the next.
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        this.doorAtlas.value = texture;
        this.doorAtlasReady = true;
        this.doorLightVersion++;
        this.resolver?.setDoorAtlas(texture);
        this.resolveRooms();
        if (this.lightingInfo) this.mixVertexLight();
    }

    /**
     * Each door's light as it swings: how open it is — eased, as its leaf
     * is — in every material of the rooms either side, at once; in the
     * switches' light next door, at once; and in the thin faces' light
     * and the light probes', added up on the CPU, now and then while any
     * door moves and once they have all stopped.
     */
    updateDoorLight(delta = 0) {
        let moved = false;
        // Resolved into one lightmap: the rooms whose light the doors that moved this frame change.
        const rooms = this.resolver ? new Set() : null;
        for (const door of this.doors) {
            const id = door.spec.id;
            const open = 1 - (1 - door.open) ** 2;
            if (this.doorOpenness.get(id) === open) continue;
            this.doorOpenness.set(id, open);
            const uniform = this.doorLight.get(id);
            if (uniform) uniform.value = open;
            this.doorsMoved.add(id);
            if (rooms) for (const zone of this.doorZones.get(id) ?? []) rooms.add(zone);
            moved = true;
        }
        // (While a door swings the resolved lightmap's mipmaps are made again only now and then.)
        if (this.resolver) this.resolver.swinging = moved;
        if (moved) {
            this.doorLightStale = true;
            this.applySwitchGains(rooms);
        }
        this.doorMixWait = (this.doorMixWait ?? 0) - delta;
        if (this.doorLightStale && (!moved || this.doorMixWait <= 0)) {
            this.doorLightStale = false;
            this.doorMixWait = 0.1;
            this.doorLightVersion++;
            // Only the rooms whose light those doors change: a swing would
            // otherwise add up every thin face in the house again, five times.
            const zones = new Set();
            for (const id of this.doorsMoved) for (const zone of this.doorZones.get(id) ?? []) zones.add(zone);
            this.doorsMoved.clear();
            if (this.lightingInfo) {
                this.mixVertexLight(zones);
                this.tintDoors(this.mixDoorLight());
            }
        }
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
     *
     * A switch whose lamps are lit live (liveShare) adds what they bounce
     * in place of all of its light.
     *
     * @param {Iterable<string>} [zones]  only those lit as these rooms —
     *        the rooms a door that swung changes; all of them without
     */
    mixVertexLight(zones = null) {
        const info = this.lightingInfo;
        const name = info.attribute.toLowerCase();
        // Drawn from the bake, a shut door dims the light but the sun's
        // straight light, which is a vertex attribute of its own; lit live,
        // all of it is that.
        const softName = !this.liveLight && info.indirect?.attribute ? info.indirect.attribute.toLowerCase() : null;
        const meshes = zones ? [...zones].flatMap((zone) => this.vertexLitByZone.get(zone) ?? []) : this.vertexLit;
        for (const mesh of meshes) {
            const geometry = mesh.geometry;
            const light = geometry.getAttribute(name);
            if (!light) continue;
            const zone = mesh.userData.zone;
            // As much of the room's light as stays with its doors as they are.
            const stays = this.zoneStays(zone);
            // Each switch that is on: all of its light, or — as far as its
            // lamps are lit live — what they bounce.
            const on = [];
            for (const { index, indirect, values } of mesh.userData.switchLight) {
                if (!(this.switchWeights[index] > 0)) continue;
                const share = this.liveShare(index);
                const of = indirect ? share : 1 - share;
                if (of > 0) on.push({ index, values, of });
            }
            if (!on.length && stays > 0.999) {
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
            if (stays <= 0.999) {
                const soft = softName ? geometry.getAttribute(softName) : null;
                const values = soft ? floatValues(soft) : out.slice();
                const step = soft ? soft.itemSize : size;
                const gone = 1 - stays;
                for (let v = 0, o = 0; o < out.length; v += step, o += size) {
                    out[o] = Math.max(0, out[o] - values[v] * gone);
                    out[o + 1] = Math.max(0, out[o + 1] - values[v + 1] * gone);
                    out[o + 2] = Math.max(0, out[o + 2] - values[v + 2] * gone);
                }
            }
            for (const { index, values, of } of on) {
                const weight = this.switchWeights[index] * of * this.switchReach(index, zone);
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
        this.mixThinLight(zones);
    }

    /**
     * That, for the thin faces merged across rooms (World/HouseMerger.js):
     * each room's part of each merged mesh (`thin`) worked out as a mesh of
     * its own is — the same sums, in the same order — but only the parts
     * whose room's light has changed since it was last worked out (its
     * variant, how much of it stays with its doors, each switch that is on
     * and how far it reaches the room: `state`), written into the merged
     * mesh's colours where that part's vertices are, and only those ranges
     * of it sent to the GPU again.
     *
     * @param {Iterable<string>} [zones]  only these rooms' parts; all of them without
     */
    mixThinLight(zones = null) {
        if (!this.thin?.length) return;
        const info = this.lightingInfo;
        const name = info.attribute.toLowerCase();
        const softName = info.indirect?.attribute ? info.indirect.attribute.toLowerCase() : null;
        const parts = zones ? [...zones].flatMap((zone) => this.thinByZone.get(zone) ?? []) : this.thin;
        /** colours -> the ranges of them written, as [from, to) in numbers */
        const written = new Map();
        const on = [];
        for (const part of parts) {
            const light = part.light[name];
            if (!light) continue;
            const zone = part.zone;
            const stays = this.zoneStays(zone);
            const dims = stays <= 0.999;
            on.length = 0;
            let state = `${name}|${dims ? `${softName}:${stays}` : ""}`;
            for (const entry of part.switchLight) {
                const weight = this.switchWeights[entry.index];
                if (!(weight > 0)) continue;
                // All of the switch's light, or — its lamps lit live — what they bounce.
                const share = this.liveShare(entry.index);
                const of = entry.indirect ? share : 1 - share;
                if (!(of > 0)) continue;
                const gain = weight * of * this.switchReach(entry.index, zone);
                on.push(entry.values, gain);
                state += `|${entry.index}${entry.indirect ? "i" : ""}:${gain}`;
            }
            if (part.state === state) continue;
            part.state = state;

            const size = light.itemSize;
            const geometry = part.mesh.geometry;
            let colours = geometry.getAttribute("color");
            // (A variant whose light is stored another size than the colours merged: the colours made again, every part of them to write.)
            if (!colours || colours.itemSize !== size) {
                colours = rewritten(new THREE.BufferAttribute(new Float32Array(light.array.length), size));
                geometry.setAttribute("color", colours);
                for (const other of this.thin) if (other.mesh === part.mesh && other !== part) other.state = null;
            }
            const from = part.vertexStart * size;
            const to = from + part.vertexCount * size;
            const out = colours.array.subarray(from, to);
            out.set(light.array.subarray(from, to));
            if (dims) {
                const soft = softName ? part.light[softName] : null;
                const step = soft ? soft.itemSize : size;
                const values = soft ? soft.array.subarray(part.vertexStart * step, (part.vertexStart + part.vertexCount) * step) : out.slice();
                const gone = 1 - stays;
                for (let v = 0, o = 0; o < out.length; v += step, o += size) {
                    out[o] = Math.max(0, out[o] - values[v] * gone);
                    out[o + 1] = Math.max(0, out[o + 1] - values[v + 1] * gone);
                    out[o + 2] = Math.max(0, out[o + 2] - values[v + 2] * gone);
                }
            }
            for (let k = 0; k < on.length; k += 2) {
                const values = on[k];
                const weight = on[k + 1];
                // Its colour, not its alpha.
                for (let v = 0, o = 0; o < out.length; v += 3, o += size) {
                    out[o] += values[v] * weight;
                    out[o + 1] += values[v + 1] * weight;
                    out[o + 2] += values[v + 2] * weight;
                }
            }
            if (!written.has(colours)) written.set(colours, []);
            written.get(colours).push([from, to]);
        }
        for (const [colours, spans] of written) {
            // Parts side by side as one range.
            spans.sort((a, b) => a[0] - b[0]);
            let [from, to] = spans[0];
            for (let k = 1; k < spans.length; k++) {
                if (spans[k][0] <= to) {
                    to = Math.max(to, spans[k][1]);
                    continue;
                }
                colours.addUpdateRange(from, to - from);
                [from, to] = spans[k];
            }
            colours.addUpdateRange(from, to - from);
            // A mesh not drawn since (three sends the ranges, and forgets them, when it next is): all that has piled up as one.
            if (colours.updateRanges.length > 32) {
                const first = Math.min(...colours.updateRanges.map((range) => range.start));
                const last = Math.max(...colours.updateRanges.map((range) => range.start + range.count));
                colours.clearUpdateRanges();
                colours.addUpdateRange(first, last - first);
            }
            colours.needsUpdate = true;
        }
    }

    /**
     * Where a room's triangles are in what the published view draws: in
     * every mesh that has any of them, the part of its index that is the
     * room's (`start`, `count`: to draw it alone, as a group or a draw
     * range) and of its vertices (`vertexStart`, `vertexCount`). Merged
     * across rooms (World/HouseMerger.js) a mesh has a range a room
     * (`mesh.userData.ranges`); a mesh that is all one room's — a lamp's
     * glass, or every mesh of a view not merged — is one range, the whole
     * of it. `mesh.userData.lighting` says how each is lit ("lightmap",
     * "vertex"), `mesh.material` what it draws with — the bake's, which is
     * one for all that look alike: `parts` says, run by run of the range's
     * triangles, which of the published version's materials each was made
     * with (`key`: roomMaterial).
     *
     * @param {string|null} zone  the room's id, as the bake's zones are; null, what is lit as no room
     * @returns {{ mesh: THREE.Mesh, start: number, count: number, vertexStart: number, vertexCount: number, parts: { key: string, start: number, count: number, vertexStart: number, vertexCount: number }[] }[]}
     */
    roomRanges(zone) {
        if (!this.zoneRanges) {
            this.zoneRanges = new Map();
            for (const mesh of this.batches?.children ?? []) {
                if (mesh.userData.shadowCaster) continue;
                const geometry = mesh.geometry;
                const vertexCount = geometry.attributes.position.count;
                const count = geometry.index ? geometry.index.count : vertexCount;
                const whole = [{ zone: mesh.userData.zone ?? null, start: 0, count, vertexStart: 0, vertexCount, parts: [{ key: mesh.userData.material, start: 0, count, vertexStart: 0, vertexCount }] }];
                for (const range of mesh.userData.ranges ?? whole) {
                    if (!this.zoneRanges.has(range.zone)) this.zoneRanges.set(range.zone, []);
                    this.zoneRanges.get(range.zone).push({ mesh, start: range.start, count: range.count, vertexStart: range.vertexStart, vertexCount: range.vertexCount, parts: range.parts });
                }
            }
        }
        return this.zoneRanges.get(zone ?? null) ?? [];
    }

    /**
     * The material a part of a room is drawn with while the room is drawn
     * as a version that was not baked draws it (World/LiveRoom.js): the
     * published version's own, by its key — its colour, its finish's relief
     * and gloss, its reflections — copied as usePublishedView copies it for
     * a view lit live (liveCopy), from the side the bake's material is
     * drawn from. One copy a key and side, made when a room first asks and
     * kept. Null for a key the version does not have.
     *
     * @param {string} key  a part's (roomRanges)
     * @param {THREE.Material} baked  what the part's mesh draws with from the bake
     * @returns {THREE.Material|null}
     */
    roomMaterial(key, baked) {
        const live = this.liveByKey?.get(key);
        if (!live) return null;
        const side = baked?.side ?? (this.viewCull ? THREE.FrontSide : live.side);
        const id = `${key}|${side}`;
        if (!this.roomMaterials.has(id)) {
            const material = liveCopy(live, side, this.viewCull);
            // Reflecting what it reflects in the editor (usePublishedView does the same for a view lit live).
            if (!material.userData.skyMap) applyReflection(material);
            this.roomMaterials.set(id, material);
        }
        return this.roomMaterials.get(id);
    }

    /**
     * Each door's light: the variant's, plus each switch that is on — or,
     * its lamps lit live, what they bounce.
     */
    mixDoorLight() {
        const doors = {};
        for (const [id, light] of Object.entries(this.lightingInfo.doors || {})) doors[id] = [...light];
        this.switches.forEach((entry, index) => {
            const weight = this.switchWeights[index] ?? 0;
            if (!weight) return;
            const probes = this.switchLive[index] ? entry.indirect?.doors : entry.doors;
            for (const [id, light] of Object.entries(probes || {})) {
                const door = (doors[id] ??= [0, 0, 0]);
                for (let c = 0; c < 3; c++) door[c] += light[c] * weight;
            }
        });
        return doors;
    }

    /**
     * Each door's light a side at a time (the bake's `doorSides`): the
     * variant's on either side, as much as stays in that room with its doors
     * as they are (zoneStays), and each switch that is on, as far as it
     * reaches that room (switchReach) — so a shut door's face in a dark WC
     * is dark, and the other face lit by the hall light. Empty for a bake
     * without them.
     */
    mixDoorSides() {
        const info = this.lightingInfo;
        if (!info?.doorSides) return {};
        const out = {};
        const add = (sides, weight, share) => {
            for (const [id, two] of Object.entries(sides || {})) {
                const door = (out[id] ??= [
                    [0, 0, 0],
                    [0, 0, 0],
                ]);
                const zones = this.doorSideZones(id);
                two.forEach((rgb, side) => {
                    const k = weight * share(zones[side]);
                    for (let c = 0; c < 3; c++) door[side][c] += rgb[c] * k;
                });
            }
        };
        add(info.doorSides, 1, (zone) => this.zoneStays(zone));
        this.switches.forEach((entry, index) => {
            const weight = this.switchWeights[index] ?? 0;
            if (!weight) return;
            add(this.switchLive[index] ? entry.indirect?.doorSides : entry.doorSides, weight, (zone) => this.switchReach(index, zone));
        });
        return out;
    }

    /**
     * The rooms either side of a door, as the bake's probes' sides are: the
     * wall's +Z, then its -Z — or of a window, by its opening's id: its
     * sashes' group stands where a door's would (World/Sash.js), and a room
     * drawn live takes them as it takes a door's leaf (LiveRoom.movers).
     */
    doorSideZones(id) {
        this.sideZones ??= new Map();
        if (!this.sideZones.has(id)) {
            const door = this.doors.find((candidate) => candidate.spec.id === id) ?? this.windows.find((sash) => sash.spec.id === id);
            const zones = [0.3, -0.3].map((z) => {
                if (!door) return null;
                const at = door.group.localToWorld(new THREE.Vector3(0, 1, z));
                return this.roomAt(at.x, at.y, at.z)?.id ?? null;
            });
            this.sideZones.set(id, zones);
        }
        return this.sideZones.get(id);
    }

    /**
     * Door leaves move, so their light cannot be baked; instead each is lit
     * like the air around it, from the probes baked each side of it — each
     * face by its own side's, where the bake has them apart (`sides`,
     * mixDoorSides), or both by the two's average. Most of the leaf's
     * brightness is that light, given as emission; a quarter is left to the
     * live lights, so its panels still catch some relief.
     *
     * Lit live, the probes' light is the rest of the light — the sky's and
     * what is bounced — and all of it: the live sun and lamps light the
     * leaf in full, as they do the walls, and nothing else is ambient to it.
     */
    tintDoors(probes, sides = this.mixDoorSides()) {
        // Drawn from the bake with light probes, those light the leaves as
        // they do everything that moves (ProbeLight), the sun too.
        if (this.probeLit && !this.liveLight) return;
        const front = new THREE.Color();
        const back = new THREE.Color();
        for (const door of this.doors) {
            // Lit live, a door with no probes of its own — a cupboard under
            // the stairs — is lit like the nearest door that has them: it
            // has no light of the scene's to fall back on.
            const probe =
                probes[door.spec.id] ??
                (this.liveLight ? probes[this.nearestProbedDoor(door.group.getWorldPosition(new THREE.Vector3()), probes, door)] : null);
            if (!probe) continue;
            const two = sides[door.spec.id];
            front.setRGB(...(two ? two[0] : probe));
            back.setRGB(...(two ? two[1] : probe));
            // From above, by day, each face brought up as the room on its side is (setIndoorGain).
            if (this.indoorGain.value > 1) {
                const zones = this.doorSideZones(door.spec.id);
                front.multiplyScalar(this.indoorGainIn(zones[0], Math.max(front.r, front.g, front.b)));
                back.multiplyScalar(this.indoorGainIn(zones[1], Math.max(back.r, back.g, back.b)));
            }
            for (const { leaf } of door.leaves) {
                if (!leaf.userData.baseColor) {
                    leaf.userData.baseColor = leaf.material.color.clone();
                    leaf.material = leaf.material.clone();
                    // Its light is the bake's (Sky.js leaves it be).
                    leaf.material.userData.bakedTint = true;
                    litBySides(leaf.material, { live: this.liveLight });
                }
                const base = leaf.userData.baseColor;
                const share = this.liveLight ? [1, 1] : [0.25, 0.85];
                leaf.material.color.copy(base).multiplyScalar(share[0]);
                leaf.material.emissive.copy(base).multiply(front).multiplyScalar(share[1]);
                leaf.material.userData.emissiveBack.value.copy(base).multiply(back).multiplyScalar(share[1]);
            }
        }
        if (!this.liveLight && !this.probeLit) this.tintOpenables(probes);
    }

    /**
     * Drawn from the bake, the sun's share of the light at every texel (the
     * variant's sun `mask`, blender/bake_public.py's sun_mask) and its
     * colour, for what moves to shade it (decodeLightmap).
     *
     * @param {THREE.Texture} mask
     * @param {object} sun  the variant's sun: its `maskScale` and linear `color`
     */
    setSunShade(mask, sun) {
        if (!this.sunShade) return;
        prepareLightmap(mask, THREE.RedFormat);
        this.sunShade.sunMask.value = mask;
        this.sunShade.sunMaskScale.value = sun.maskScale ?? 0;
        const [r, g, b] = sun.color ?? [1, 1, 1];
        const most = Math.max(r, g, b, 1e-6);
        this.sunShade.sunTint.value.set(r / most, g / most, b / most);
    }

    /**
     * The sun's shadow map of what moves, as it is this frame — or none,
     * while what moves shades nothing: from above (holdSunShade).
     */
    updateSunShade(light) {
        if (!this.sunShade) return;
        const shade = this.sunShade;
        const map = light.castShadow && !this.sunShadeHeld ? light.shadow.map?.texture : null;
        shade.sunShadowMap.value = map ?? null;
        shade.sunShadowOn.value = map ? 1 : 0;
        shade.sunShadowMatrix.value = light.shadow.matrix;
        shade.sunShadowSize.value.copy(light.shadow.mapSize);
        shade.sunShadowBias.value = light.shadow.bias;
        shade.sunShadowNormalBias.value = light.shadow.normalBias;
    }

    /**
     * Drawn from the bake, what moves shading the sun in the house — or,
     * `held`, not: the bird's-eye view (World.lightFromAbove) draws no
     * shadow map again, and the one there is goes stale as the visitor
     * walks under it.
     */
    holdSunShade(held) {
        this.sunShadeHeld = Boolean(held);
    }

    /**
     * How many times its own every baked surface indoors draws its light
     * (INDOOR_LIFT): 1 — as it is — but from above by day, when the floor
     * shown is exposed as its rooms would be (Realism.js's LightMeter.above)
     * while the garden round it keeps the outside's exposure.
     */
    setIndoorGain(gain) {
        if (!this.indoorGain || this.indoorGain.value === gain) return;
        this.indoorGain.value = gain;
        // The door leaves, and the furniture's doors and drawers, where
        // their light is the doors' probes' (tintDoors): brought up with it.
        if (this.lightingInfo) this.tintDoors(this.mixDoorLight());
    }

    /**
     * That, for what moves in `room` — a room, or its id — whose light
     * (`brightest`: the most of it, any way) is the room's: brought up as
     * far, short of what the sun gives (World/ProbeLight.js, tintDoors).
     * None out of doors.
     */
    indoorGainIn(room, brightest = 0) {
        if (typeof room === "string") {
            this.roomsById ??= new Map(this.spec.rooms.map((each) => [each.id, each]));
            room = this.roomsById.get(room);
        }
        const gain = room && room.ceiling_finish !== "none" ? this.indoorGain?.value ?? 1 : 1;
        if (gain <= 1 || brightest * gain <= INDOOR_MOST) return gain;
        return Math.max(1, INDOOR_MOST / brightest);
    }

    /**
     * Lit live, whether the house takes the live sun's and lamps' light on
     * top of the bake's — as it does — or, given false, none of it: the
     * bird's-eye view (World.lightFromAbove) draws it from the bake alone,
     * with the lightmap that has the sun in it. The lights stay as they
     * are for what moves and the garden, and no shader is built again.
     */
    setDirectLight(on) {
        LIVE_DIRECT.value = on ? 1 : 0;
    }

    /**
     * Drawn from the bake, the furniture's doors and drawers — which move,
     * so are not baked — are lit as the door leaves are, from the probes of
     * the nearest door on their floor. Lit live, the light probes light
     * them (ProbeLight). Their clear glass is not: standing in a room it
     * draws its reflections alone (clearGlassIndoors), and lit from the
     * probes on its own white a shower's glass door would be the milky panel
     * that keeps it from.
     */
    tintOpenables(probes) {
        const light = new THREE.Color();
        const at = new THREE.Vector3();
        for (const part of this.openables.parts) {
            const probe = probes[this.nearestProbedDoor(part.node.getWorldPosition(at), probes)];
            if (!probe) continue;
            light.setRGB(...probe);
            // (From above, by day, brought up as the room it stands in is: setIndoorGain.)
            if (this.indoorGain.value > 1) light.multiplyScalar(this.indoorGainIn(this.roomAt(at.x, at.y, at.z), Math.max(light.r, light.g, light.b)));
            part.node.traverse((mesh) => {
                if (!mesh.isMesh) return;
                const tint = (material) => {
                    if (!material?.emissive || clearGlass(material)) return material;
                    if (!material.userData.baseColor) {
                        material = material.clone();
                        material.userData.baseColor = material.color.clone();
                        material.userData.bakedTint = true;
                    }
                    material.color.copy(material.userData.baseColor).multiplyScalar(0.25);
                    material.emissive.copy(material.userData.baseColor).multiply(light).multiplyScalar(0.85);
                    return material;
                };
                mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
            });
            // (Drawn shut with others, its light is its row's: World/ShutBatcher.js.)
            this.shutBatcher?.tintPart(part, light);
        }
    }

    /**
     * The id of the door with probes nearest the point `at`, on its floor
     * if there is one there: a door at or a little above the point's feet,
     * within a storey below it.
     */
    nearestProbedDoor(at, probes, except = null) {
        let best = null;
        let bestScore = Infinity;
        const other = new THREE.Vector3();
        for (const candidate of this.doors) {
            if (candidate === except || !probes[candidate.spec.id]) continue;
            candidate.group.getWorldPosition(other);
            // Another floor's doors only when this one has none.
            const sameFloor = other.y <= at.y + 0.3 && at.y - other.y < 2.5;
            const score = at.distanceTo(other) + (sameFloor ? 0 : 1000);
            if (score < bestScore) {
                bestScore = score;
                best = candidate.spec.id;
            }
        }
        return best;
    }

    dispose() {
        this.resolver?.dispose();
        this.resolver = null;
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

        clearTimeout(this.ownTimer);
        if (this.onOwnLight) this.experience.world?.off?.("lighting", this.onOwnLight);
        this.onOwnLight = null;
        this.shutBatcher?.dispose();
        for (const door of this.doors) door.dispose();
        for (const sash of this.windows) sash.dispose();
        this.unregisterSashes?.();
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
/** How long after every part has its light, or the day's light has changed, the parts' own shaders are made ahead (drawLight), in milliseconds. */
const OWN_AFTER = 1500;
/**
 * The glass a fridge's doors shut in (enclosedGlass): at most this thick, in metres, are doors — a fridge's with its
 * bins is 15 cm; a box of them any deeper is no front — how far open, as a share of their reach, they are tried, to
 * see which way they swing; and how far past the doors' edges, or into their depth, the glass may come and still be
 * taken as within, in metres.
 */
const ENCLOSING_DEPTH = 0.25;
const ENCLOSING_AJAR = 0.25;
const ENCLOSING_SLACK = 0.002;
/** How far behind its doors' face a fridge's inside reaches at most, in metres: further back is another piece's. */
const ENCLOSING_REACH = 0.9;

/** What the dynamic octree leaves out: what isTransient does, and placeholders for missing pieces. */
export function skipDynamic(object) {
    return isTransient(object) || object.name === "missing-model";
}

/** A part that opens (Openables.js), and everything under it: what a piece's triangles are counted without (collisionOf). */
function isOpeningPart(object) {
    return object.userData?.opens !== undefined;
}

/** Whether a material is clear glass, which a view drawn from its bake keeps to its reflections (Utils/reflections.js). */
function clearGlass(material) {
    return Boolean(material.transparent && reflectionsOnly(material));
}

/** The box a piece is met as (SceneBuilder.collisionOf's, in the piece's own space), where the piece stands: a mesh of its own. */
function boxProxy(group, box) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()));
    box.getCenter(proxy.position);
    proxy.position.applyMatrix4(group.matrixWorld);
    proxy.quaternion.copy(group.quaternion);
    proxy.scale.copy(group.scale);
    proxy.userData.label = group.userData.label;
    return proxy;
}

/** Hide a door's frame, leaving its leaves, hinges and handles. */
function hideFixedParts(node) {
    if (node.userData?.doorLeaf || node.userData?.hingeSide !== undefined) return;
    if (node.isMesh) node.visible = false;
    for (const child of node.children) hideFixedParts(child);
}

/** A runtime file's material layered in depth again, as it was drawn (Runtime.js keeps it in userData). */
function restoreLayer(material) {
    const offset = material?.userData?.polygonOffset;
    if (!offset) return;
    material.polygonOffset = true;
    [material.polygonOffsetFactor, material.polygonOffsetUnits] = offset;
}

/**
 * A runtime file's material as the editor drew it, from what Runtime.js's
 * `exportable` kept of it: a finish's textures drawn here, as the editor
 * draws them — its colour, and its relief, occlusion, roughness and
 * metalness, the right way up and at the editor's scale; any other relief
 * at its own scale again (glTF reads a normal map loaded as an image upside
 * down); its vertex colours, its depth layering, whether it writes depth
 * (glTF's see-through stops it), and the side it is drawn from.
 */
function restoreRuntimeMaterial(material, library) {
    const data = material?.userData;
    if (!data) return;
    if (data.finish) {
        const surface = library.getSurface(data.finish);
        material.map = surface.map;
        for (const slot of ["normalMap", "aoMap", "roughnessMap", "metalnessMap"]) if (surface[slot]) material[slot] = surface[slot];
        if (surface.normalMap && material.normalScale) material.normalScale.copy(surface.normalScale);
    } else if (data.normalScale && material.normalMap && material.normalScale) {
        material.normalScale.fromArray(data.normalScale);
    }
    if (data.vertexColors) material.vertexColors = true;
    if (typeof data.depthWrite === "boolean") material.depthWrite = data.depthWrite;
    if (data.side !== undefined) material.side = data.side;
    restoreLayer(material);
    material.needsUpdate = true;
}

/**
 * A snapshot's attribute of a shader's own under its own name again: from
 * `_<name>`, or from its two halves `_<name>0` and `_<name>1` (Snapshot.js).
 */
function restoreAttribute(geometry, name) {
    if (geometry.getAttribute(name)) return;
    const whole = geometry.getAttribute(`_${name}`);
    if (whole) {
        geometry.setAttribute(name, whole);
        geometry.deleteAttribute(`_${name}`);
        return;
    }
    const halves = [geometry.getAttribute(`_${name}0`), geometry.getAttribute(`_${name}1`)];
    if (!halves[0] || !halves[1]) return;
    const values = new Float32Array(halves[0].count * 4);
    for (let v = 0; v < halves[0].count; v++) {
        values[v * 4] = halves[0].getX(v);
        values[v * 4 + 1] = halves[0].getY(v);
        values[v * 4 + 2] = halves[1].getX(v);
        values[v * 4 + 3] = halves[1].getY(v);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, 4));
    geometry.deleteAttribute(`_${name}0`);
    geometry.deleteAttribute(`_${name}1`);
}

/** A runtime file's mesh casting and taking shadows again as it did (Runtime.js keeps them in userData). */
function restoreShadows(node) {
    if (!node.isMesh || typeof node.userData?.cast !== "boolean") return;
    node.castShadow = node.userData.cast;
    node.receiveShadow = Boolean(node.userData.receive);
}

/**
 * A copy of a published version's material as a view lit live draws it —
 * one that was not baked, and a room of a baked one drawn so
 * (SceneBuilder.roomMaterial): all of it, from the side given.
 */
function liveCopy(live, side, cull) {
    const material = live.clone();
    material.side = side;
    // A shader of its own, which a copy does not take with it.
    if (ownShader(live)) {
        material.onBeforeCompile = live.onBeforeCompile;
        material.customProgramCacheKey = live.customProgramCacheKey;
    }
    // Its shadow as the editor casts it: a two-sided material's
    // from both sides, though culling has made it one-sided. (A
    // one-sided one's faces culled come back as shadow casters
    // alone: addShadowCasters.)
    if (cull && live.side === THREE.DoubleSide) material.shadowSide = THREE.DoubleSide;
    return material;
}

/** Whether a material is drawn by a shader of its own (the terrain's, the pool's water). */
function ownShader(material) {
    return material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile;
}

/**
 * What a material looks like, as text: two of a runtime file's materials
 * with the same look are drawn by one material in a view merged across
 * rooms (usePublishedView's materialFor) — a publish numbers each piece of
 * furniture's own copy of a finish (`oak_veneer`, `oak_veneer#1`…:
 * Ladonia's 1,064 materials are 337 looks), and only meshes of one
 * material can be made one mesh.
 *
 * `baked`, for one drawn unlit from its bake: its name (the garden finds
 * the lawns by it), and the little of it such a material takes — its
 * colour, its texture, its depth layering, the side it is drawn from.
 * Otherwise — a metal, kept as it is live — everything about it. One drawn
 * by a shader of its own (the terrain's) is like no other.
 */
const LOOKS = new WeakMap();
function lookOf(material, baked) {
    let looks = LOOKS.get(material);
    if (!looks) LOOKS.set(material, (looks = {}));
    const which = baked ? "baked" : "whole";
    if (looks[which]) return looks[which];
    const text = (value) => {
        if (value === null || value === undefined || typeof value !== "object") return String(value);
        if (value.isTexture) return `texture:${value.uuid}`;
        if (typeof value.toArray === "function") return value.toArray().join(",");
        try {
            return JSON.stringify(value);
        } catch {
            return material.uuid;
        }
    };
    let look;
    if (ownShader(material)) look = `own:${material.uuid}`;
    else if (baked) look = ["baked", material.name, text(material.color), text(material.map), material.side, material.polygonOffset, material.polygonOffsetFactor, material.polygonOffsetUnits].join("|");
    else {
        look = Object.keys(material)
            .filter((key) => key !== "uuid" && key !== "version")
            .sort()
            .map((key) => `${key}=${typeof material[key] === "function" ? material.uuid : text(material[key])}`)
            .join("|");
    }
    looks[which] = look;
    return look;
}

/**
 * A baked material's shader of its own, taken from the live material it
 * stands for (the terrain's paint): run before whatever the bake's light
 * adds to it (decodeLightmap, lightByVertices). Kept here, not in userData,
 * which a clone copies through JSON.
 */
const OWN_SHADER = new WeakMap();

function drawnByOwnShader(material, live) {
    const own = { compile: live.onBeforeCompile, key: live.customProgramCacheKey?.() ?? live.uuid };
    OWN_SHADER.set(material, own);
    material.onBeforeCompile = own.compile;
    material.customProgramCacheKey = () => `own:${own.key}`;
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
export function prepareLightmap(texture, format = null, mipmaps = true) {
    if (texture.userData.lightmap) return;
    texture.userData.lightmap = true;
    texture.flipY = false;
    texture.channel = 1;
    // One only ever read texel for texel (a switch's layer, by the resolved lightmap) is uploaded without mipmaps.
    if (!mipmaps) {
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
    }
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
 * That, for the house's light resolved into one lightmap
 * (World/LightResolver.js): stored as a variant's is, but each value in
 * two bytes — its brightness in the lightmap's R and G, its colour's two
 * in the chroma's R, G and B, A.
 */
const LIGHTMAP_RESOLVED = /* glsl */ `
uniform sampler2D lightMapChroma;
${PACKED_16}
vec3 lightMapColour( vec2 luma, vec2 uv ) {
	vec4 c = texture2D( lightMapChroma, uv );
	return ycocgColour( unpack16( luma ), vec2( unpack16( c.rg ), unpack16( c.ba ) ) );
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
 * How much of a room's light stays with its doors as they are, for a
 * room's material with `count` of them (userData.doorUniforms): each
 * door's crop of the doors' atlas, where this texel is in it — the share
 * of the light that stays with it shut — as far as it is shut. A door
 * wide open reads nothing.
 */
function doorLightGLSL(count) {
    const doors = Array.from({ length: count }, (_, k) => k);
    return /* glsl */ `
uniform sampler2D doorAtlas;
${doors.map((k) => `uniform vec4 doorRect${k};\nuniform vec4 doorAt${k};\nuniform float doorOpen${k};`).join("\n")}
float doorKeeps( vec4 rect, vec4 at, float open, vec2 uv ) {
	if ( open > 0.999 ) return 1.0;
	return mix( texture2D( doorAtlas, at.xy + ( uv - rect.xy ) / rect.zw * at.zw ).r, 1.0, open );
}
float doorStays( vec2 uv ) {
	return 1.0${doors.map((k) => ` * doorKeeps( doorRect${k}, doorAt${k}, doorOpen${k}, uv )`).join("")};
}
`;
}

/**
 * Draw a baked material's lightmap as it was stored and encoded
 * (setLightingVariant): its colour from its brightness and `chroma` when
 * given, then opened back out — and, for a room's material with switches
 * of its own (userData.switchLayers), their light added in, as encoded
 * `layerEncoding`; for one with doors (userData.doorUniforms), as much of
 * the rest as stays with them as they are.
 *
 * `resolved`, the lightmap is the house's light resolved into one
 * (World/LightResolver.js) — the switches and the doors already in it, each
 * value in two bytes: the same shader for every room.
 */
function decodeLightmap(material, encoding, chroma = null, layerEncoding = null, shade = null, resolved = false) {
    const uniform = (material.userData.lightMapChroma ??= { value: null });
    uniform.value = chroma;
    const layers = material.userData.switchLayers ?? [];
    const switches = (material.userData.switchUniforms ??= layers.map((layer) => ({
        luma: { value: blankLayer().luma },
        chroma: { value: blankLayer().chroma },
        rect: { value: new THREE.Vector4(...layer.rect) },
        gain: { value: 0 },
    })));
    const doors = material.userData.doorUniforms ?? [];
    const lit = material.isMeshLambertMaterial;
    const lid = Boolean(material.userData.lid);
    const gain = material.userData.indoorGain ?? null;
    const own = OWN_SHADER.get(material);
    const tinted = Boolean(material.userData.tinted);
    const key = `${LIGHTMAP_DECODE[encoding] ? encoding : ""}|${chroma ? "ycocg" : ""}|${switches.length}|${layerEncoding ?? ""}${lit ? "|lit" : ""}${lid ? "|lid" : ""}${shade ? "|shade" : ""}${doors.length ? `|${doors.length}doors` : ""}${gain ? "|indoor" : ""}${own ? `|own:${own.key}` : ""}${resolved ? "|resolved" : ""}${tinted ? "|tinted" : ""}`;
    if ((material.userData.lightmapKey ?? "||0|") === key) return;
    material.userData.lightmapKey = key;
    const decode = LIGHTMAP_DECODE[encoding] ?? ((e) => e);
    const decodeLayer = LIGHTMAP_DECODE[layerEncoding] ?? ((e) => e);
    material.onBeforeCompile = (shader, renderer) => {
        // Its own shader first (the terrain's paint).
        own?.compile(shader, renderer);
        // Lit live, its lightmap is all of its ambient light.
        if (lit) {
            shader.fragmentShader = bakedAmbient(shader.fragmentShader, "", { lid });
            shader.uniforms.liveDirect = LIVE_DIRECT;
        }
        const plain = "lightMapTexel.rgb * lightMapIntensity";
        if (!shader.fragmentShader.includes(plain)) console.warn("Lightmap not decoded: three's shader has changed");
        let colour = "lightMapTexel.rgb";
        let prefix = "";
        if (chroma || switches.length) prefix += LIGHTMAP_YCOCG;
        if (chroma) {
            shader.uniforms.lightMapChroma = uniform;
            prefix += resolved ? LIGHTMAP_RESOLVED : LIGHTMAP_CHROMA;
            colour = resolved ? "lightMapColour( lightMapTexel.rg, vLightMapUv )" : "lightMapColour( lightMapTexel.r, vLightMapUv )";
        }
        let light = `${decode(colour)} * lightMapIntensity`;
        if (doors.length) {
            shader.uniforms.doorAtlas = material.userData.doorAtlas;
            doors.forEach(({ rect, at, open }, k) => {
                shader.uniforms[`doorRect${k}`] = rect;
                shader.uniforms[`doorAt${k}`] = at;
                shader.uniforms[`doorOpen${k}`] = open;
            });
            prefix += doorLightGLSL(doors.length);
        }
        // Drawn from the bake, what moves still shades the sun: its share
        // of the light, where the shadow map of what moves falls, taken
        // away — and a shut door dims the rest of it, and only that.
        if (shade) {
            Object.assign(shader.uniforms, shade);
            // (Resolved into one lightmap, the doors' dimming is in it already — the sun's light dimmed with the rest,
            // which RESOLVED_LIGHT gives back.)
            prefix += SUN_SHADE_FRAGMENT + (resolved ? RESOLVED_LIGHT : (doors.length ? "" : "float doorStays( vec2 uv ) { return 1.0; }\n") + BAKED_LIGHT);
            light = `bakedLight( ${light}, vLightMapUv )`;
            shader.vertexShader = SUN_SHADE_VERTEX + shader.vertexShader.replace("#include <project_vertex>", SUN_SHADE_PROJECT);
        } else if (doors.length) {
            light = `( ${light} * doorStays( vLightMapUv ) )`;
        }
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
        // Indoors, all of it brought up from above (SceneBuilder.setIndoorGain).
        if (gain) {
            shader.uniforms.indoorGain = gain;
            prefix += INDOOR_LIFT;
            light = `broughtUp( ${light} )`;
        }
        shader.fragmentShader = prefix + shader.fragmentShader.replace(plain, light);
        // Its colour from its vertices.
        if (tinted) tintShader(shader);
    };
    material.customProgramCacheKey = () => key;
    material.needsUpdate = true;
}

/**
 * A lit material's fragment shader for a surface whose ambient light is
 * baked — its lightmap, its vertices' light, or a door's probes: none of
 * the scene's ambient, hemisphere or probe light, which is there for what
 * has no baked light, the people and the car; only the live lights on top
 * of its own. The lightmap's chunk is written out, for decodeLightmap to
 * find its light in, and `extra` GLSL adds to the ambient light.
 *
 * A ceiling's (`lid`) top — seen only from above, in the bird's-eye view
 * of the floor over it, which takes the roof away — takes the sun
 * unshadowed, as it was baked (blender/bake_public.py's roof_lifted): the
 * roof still shades the rooms under it, drawing nothing.
 */
function bakedAmbient(fragmentShader, extra = "", { lid = false } = {}) {
    const begin = THREE.ShaderChunk.lights_fragment_begin;
    const sunShadow = "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]";
    const without = [
        ["vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = vec3( 0.0 );"],
        ["irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );", ""],
        ["irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", ""],
        ...(lid
            ? [
                  [
                      "vec3 geometryNormal = normal;",
                      "vec3 geometryNormal = normal;\nbool lidTop = dot( geometryNormal, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) > 0.5;",
                  ],
                  [sunShadow, sunShadow.replace("receiveShadow )", "receiveShadow && ! lidTop )")],
              ]
            : []),
    ];
    if (without.some(([line]) => !begin.includes(line))) console.warn("Baked ambient light not kept apart: three's shader has changed");
    // The live lights' light, all of it or none (SceneBuilder.setDirectLight).
    const own = `${without.reduce((code, [line, instead]) => code.replace(line, instead), begin)}\n\treflectedLight.directDiffuse *= liveDirect;\n\treflectedLight.directSpecular *= liveDirect;\n`;
    const maps = THREE.ShaderChunk.lights_fragment_maps + (extra && `\n#if defined( RE_IndirectDiffuse )\n\t${extra}\n#endif\n`);
    return `uniform float liveDirect;\n${fragmentShader.replace("#include <lights_fragment_begin>", own).replace("#include <lights_fragment_maps>", maps)}`;
}

/**
 * How much of the live lights' light a surface lit by its bake takes
 * (bakedAmbient): all of it, or — from above — none. One for every such
 * material; each hands it to its shader as it is built.
 */
const LIVE_DIRECT = { value: 1 };

/**
 * Lit live, a thin face's vertices' baked light is all of its ambient
 * light, as its lightmap is a wide face's: added to the light it gets,
 * rather than multiplying its colour as vertex colours do.
 */
function lightByVertices(material) {
    const own = OWN_SHADER.get(material);
    // Indoors, brought up from above as its room's lightmap is (SceneBuilder.setIndoorGain).
    const gain = material.userData.indoorGain ?? null;
    material.onBeforeCompile = (shader, renderer) => {
        own?.compile(shader, renderer);
        shader.fragmentShader = bakedAmbient(shader.fragmentShader.replace("#include <color_fragment>", ""), `irradiance += vColor.rgb * PI${gain ? ` * ${VERTEX_LIFT}` : ""};`);
        shader.uniforms.liveDirect = LIVE_DIRECT;
        if (gain) {
            shader.uniforms.indoorGain = gain;
            shader.fragmentShader = INDOOR_LIFT + shader.fragmentShader;
        }
    };
    material.customProgramCacheKey = () => `vertex-light${gain ? "|indoor" : ""}${own ? `|own:${own.key}` : ""}`;
}

/**
 * Drawn from the bake, a thin face indoors is its vertices' baked light
 * times its colour: that light brought up from above as its room's
 * lightmap is (SceneBuilder.setIndoorGain).
 */
function gainByVertices(material) {
    const own = OWN_SHADER.get(material);
    const gain = material.userData.indoorGain;
    const tinted = Boolean(material.userData.tinted);
    const colour = "#include <color_fragment>";
    material.onBeforeCompile = (shader, renderer) => {
        own?.compile(shader, renderer);
        if (!shader.fragmentShader.includes(colour)) console.warn("Thin faces' light not brought up from above: three's shader has changed");
        shader.uniforms.indoorGain = gain;
        shader.fragmentShader = INDOOR_LIFT + shader.fragmentShader.replace(colour, `${colour}\n\tdiffuseColor.rgb *= ${VERTEX_LIFT};`);
        if (tinted) tintShader(shader);
    };
    material.customProgramCacheKey = () => `vertex-indoor${own ? `|own:${own.key}` : ""}${tinted ? "|tinted" : ""}`;
}

/**
 * A baked material that takes its colour from its vertices (`tint`, three
 * numbers a vertex, the same over each surface: usePublishedView's
 * `tinted`, written by World/HouseMerger.js) in place of a colour of its
 * own — so that every untextured surface of a merged view, whatever its
 * colour, draws with one material and is one mesh. What it draws is the
 * same: its light times that colour.
 */
function tintShader(shader) {
    const begin = "#include <begin_vertex>";
    const colour = "#include <color_fragment>";
    if (!shader.vertexShader.includes(begin) || !shader.fragmentShader.includes(colour)) console.warn("Surfaces not coloured by their vertices: three's shader has changed");
    shader.vertexShader = `attribute vec3 tint;\nvarying vec3 vTint;\n${shader.vertexShader.replace(begin, `${begin}\n\tvTint = tint;`)}`;
    shader.fragmentShader = `varying vec3 vTint;\n${shader.fragmentShader.replace(colour, `${colour}\n\tdiffuseColor.rgb *= vTint;`)}`;
}

/** That, for one with nothing else of its own in its shader: a thin face out of doors, and any until its lightmap is here. */
function tintByVertices(material) {
    material.onBeforeCompile = tintShader;
    material.customProgramCacheKey = () => "tinted";
}

/**
 * How far a room's light is brought up from above, in the units of a white
 * wall's brightness before the view's exposure — the light times `indoorGain`
 * as it is up to the first, then easing off towards the second, about what
 * the sun gives a white wall outside: a patch of sun on a floor, or a
 * loggia open to the day, is not burnt out by what brings a bedroom up to
 * be seen. Never less than it was, so that with no gain it is as it is.
 */
const INDOOR_KNEE = 0.5;
const INDOOR_MOST = 1;
/** How far from its room's edge, in metres, a pane of glass stands to be the room's own and not a window's in its wall (clearGlassIndoors): Ladonia's nearest piece of furniture's glass is 0.23 m in, a window's 0.03. */
const GLASS_CLEAR_OF_WALL = 0.1;

/**
 * Indoors, a baked surface's light brought up from above
 * (SceneBuilder.setIndoorGain): `indoorLift` is how many times its own a
 * light of that brightness is drawn — a white wall's, so a lightmap's light
 * over π, or a vertex's as it is; `broughtUp`, a lightmap's light so drawn.
 */
const INDOOR_LIFT = /* glsl */ `
uniform float indoorGain;
float indoorLift( float light ) {
	if ( indoorGain <= 1.0 ) return 1.0;
	float lifted = light * indoorGain;
	float eased = min( lifted, ${INDOOR_KNEE.toFixed(3)} ) + ${(INDOOR_MOST - INDOOR_KNEE).toFixed(3)} * ( 1.0 - exp( - max( lifted - ${INDOOR_KNEE.toFixed(3)}, 0.0 ) / ${(INDOOR_MOST - INDOOR_KNEE).toFixed(3)} ) );
	return max( light, eased ) / max( light, 1e-6 );
}
vec3 broughtUp( vec3 light ) {
	return light * indoorLift( max( light.r, max( light.g, light.b ) ) / 3.141592653589793 );
}
`;
/** That, for a thin face's light, which is its vertices' colour. */
const VERTEX_LIFT = "indoorLift( max( vColor.r, max( vColor.g, vColor.b ) ) )";

/**
 * A door leaf's light from its probes (tintDoors), given as emission: its
 * `emissive` on the face towards the wall's +Z (the leaf's own, shut), the
 * light of the probes that side; `userData.emissiveBack` on the other —
 * a panel's mouldings too, however they slope; the edges between the two. Lit live, nothing of the scene's own ambient light
 * on top.
 */
function litBySides(material, { live = false } = {}) {
    const back = (material.userData.emissiveBack = { value: new THREE.Color() });
    material.onBeforeCompile = (shader) => {
        if (live) {
            shader.fragmentShader = bakedAmbient(shader.fragmentShader);
            shader.uniforms.liveDirect = LIVE_DIRECT;
        }
        shader.uniforms.emissiveBack = back;
        const emission = "vec3 totalEmissiveRadiance = emissive;";
        if (!shader.fragmentShader.includes(emission)) console.warn("Door leaf's sides not lit apart: three's shader has changed");
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying float vLeafFront;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvLeafFront = smoothstep( -0.25, 0.25, normal.z );");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform vec3 emissiveBack;\nvarying float vLeafFront;")
            .replace(emission, "vec3 totalEmissiveRadiance = mix( emissiveBack, emissive, vLeafFront );");
    };
    material.customProgramCacheKey = () => `door-leaf${live ? "|live" : ""}`;
    material.needsUpdate = true;
}

/**
 * Drawn from the bake, where a thing that moves stands between a texel and
 * the sun: the sun's shadow map (of what moves alone), where the texel is,
 * sampled as three samples a PCF map — its depth packed in RGBA (three's
 * MeshDepthMaterial), four taps half a texel apart — and the texel's share
 * of the sun's light (its mask: encoded as a lightmap's brightness is, the
 * bake's encode_mask), in the sun's colour, taken away as far as it is
 * shaded.
 */
/** What every baked material's sun shade reads (decodeLightmap), shared. */
function sunShadeUniforms() {
    const none = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
    none.needsUpdate = true;
    return {
        sunMask: { value: none },
        sunMaskScale: { value: 0 },
        sunTint: { value: new THREE.Vector3(1, 1, 1) },
        sunShadowMap: { value: null },
        sunShadowMatrix: { value: new THREE.Matrix4() },
        sunShadowSize: { value: new THREE.Vector2(1024, 1024) },
        sunShadowBias: { value: 0 },
        sunShadowNormalBias: { value: 0 },
        sunShadowOn: { value: 0 },
        // Resolved into one lightmap: how much of each room's light stays with its doors (LightResolver's `stays`).
        roomStays: { value: whiteLayer() },
    };
}

const SUN_SHADE_VERTEX = /* glsl */ `
uniform mat4 sunShadowMatrix;
uniform float sunShadowNormalBias;
varying vec4 vSunShadowCoord;
`;
const SUN_SHADE_PROJECT = /* glsl */ `#include <project_vertex>
	vSunShadowCoord = sunShadowMatrix * ( modelMatrix * vec4( transformed, 1.0 ) + vec4( normalize( mat3( modelMatrix ) * normal ) * sunShadowNormalBias, 0.0 ) );
`;
const SUN_SHADE_FRAGMENT = /* glsl */ `
uniform sampler2D sunMask;
uniform float sunMaskScale;
uniform vec3 sunTint;
uniform sampler2D sunShadowMap;
uniform vec2 sunShadowSize;
uniform float sunShadowBias;
uniform float sunShadowOn;
varying vec4 vSunShadowCoord;
float sunDepth( const in vec4 v ) {
	return dot( v, ( 255.0 / 256.0 ) / vec4( 256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0 ) );
}
float sunLit() {
	if ( sunShadowOn < 0.5 ) return 1.0;
	vec3 c = vSunShadowCoord.xyz / vSunShadowCoord.w;
	if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
	float z = c.z + sunShadowBias;
	vec2 t = 0.5 / sunShadowSize;
	return 0.25 * (
		step( z, sunDepth( texture2D( sunShadowMap, c.xy + vec2( -t.x, -t.y ) ) ) ) +
		step( z, sunDepth( texture2D( sunShadowMap, c.xy + vec2( t.x, -t.y ) ) ) ) +
		step( z, sunDepth( texture2D( sunShadowMap, c.xy + vec2( -t.x, t.y ) ) ) ) +
		step( z, sunDepth( texture2D( sunShadowMap, c.xy + vec2( t.x, t.y ) ) ) ) );
}
// (dx, dy: how fast the UV changes across the screen, worked out by the caller before any branch. The mask is
// read only where something shades the sun or a door dims the room — after a branch, where a texture's own level
// of detail is not defined: a pixel on the edge of a shadow read the mask's coarsest level, a dark line along it.)
vec3 sunPart( vec2 uv, vec2 dx, vec2 dy ) {
	float m = textureGrad( sunMask, uv, dx, dy ).r;
	float linear = m <= 0.04045 ? m / 12.92 : pow( ( m + 0.055 ) / 1.055, 2.4 );
	float share = linear / max( 1.0 - linear, 1.0 / 65.0 );
	// π, as a lightmap's light is here: three's PI is defined after this.
	return 3.141592653589793 * sunMaskScale * share * sunTint;
}
`;

/**
 * A lightmap's light, drawn from the bake: the sun's straight light in it
 * (sunPart) as far as nothing that moves shades it, and the rest as far as
 * the room's doors let it stay (doorStays) — or, where neither takes any
 * away, as it is.
 */
const BAKED_LIGHT = /* glsl */ `
vec3 bakedLight( vec3 light, vec2 uv ) {
	vec2 dx = dFdx( uv );
	vec2 dy = dFdy( uv );
	float stays = doorStays( uv );
	float lit = sunLit();
	if ( stays > 0.999 && lit > 0.999 ) return light;
	vec3 sun = min( sunPart( uv, dx, dy ), light );
	return ( light - sun ) * stays + sun * lit;
}
`;

/**
 * That, for the house's light resolved into one lightmap
 * (World/LightResolver.js), which has the switches in it and all of the
 * variant's light dimmed as far as the room's doors are shut — the sun's
 * with the rest. The sun's straight light is given back here as far as the
 * doors took it (`roomStays`: how much they leave, the resolver's third
 * target) and taken away as far as what moves shades it: the same sum as
 * a room's own material makes, ( light − sun ) × stays + sun × lit, with
 * the sun's share read from its mask the same way. No more of it than the
 * light there was before the doors.
 */
const RESOLVED_LIGHT = /* glsl */ `
uniform sampler2D roomStays;
vec3 bakedLight( vec3 light, vec2 uv ) {
	vec2 dx = dFdx( uv );
	vec2 dy = dFdy( uv );
	float stays = texture2D( roomStays, uv ).r;
	float lit = sunLit();
	if ( stays > 0.999 && lit > 0.999 ) return light;
	vec3 sun = min( sunPart( uv, dx, dy ), light / max( stays, 1.0 / 255.0 ) );
	return max( light + sun * ( lit - stays ), vec3( 0.0 ) );
}
`;

/**
 * How many switches' layers a room's materials can add in: two textures
 * each, beside the `reserved` others — the surface's own texture and the
 * lightmap's two; lit live, the sun's and the lamps' shadows; drawn from
 * the bake, the sun's mask and its shadow of what moves; and a room with
 * doors, their atlas — within what this GPU can bind at once, and never
 * more than six.
 */
function maxSwitchLayers(renderer, reserved = 3) {
    const units = renderer?.capabilities?.maxTextures ?? 16;
    return Math.max(0, Math.min(6, Math.floor((units - reserved) / 2)));
}

/**
 * Which switches' light each room's materials add in: every switch whose
 * light reaches the room, as the bake found it — or, where more reach it
 * than there is room for, the strongest there. What is left out is the
 * faint spill through a doorway from the rooms beyond.
 *
 * `own`: where the house's light is resolved into one lightmap, a room's
 * layer held its own way (Utils/device.js's ownLayer) is the one read —
 * Switches.load fetches it in the other's place — and `curve` says how.
 *
 * @returns {Map<string, object[]>} zone -> `{ index, scale, rect, curve }`,
 *          the switch's place in `switches` and its layer's place in the atlas
 */
function planSwitchLayers(switches, max, own = false) {
    const limit = typeof max === "function" ? max : () => max;
    const byZone = new Map();
    switches.forEach((entry, index) => {
        for (const [zone, layer] of Object.entries(entry.layers || {})) {
            if (entry.storage !== "ycocg" || !layer.chroma) continue;
            if (!byZone.has(zone)) byZone.set(zone, []);
            const curve = (own && ownLayer(layer)?.curve) || null;
            byZone.get(zone).push({ index, scale: entry.scale, rect: layer.rect, strength: layer.strength ?? 0, layer, curve });
        }
    });
    for (const [zone, layers] of byZone) {
        layers.sort((a, b) => b.strength - a.strength);
        if (layers.length > limit(zone)) layers.length = limit(zone);
        if (!layers.length) byZone.delete(zone);
    }
    return byZone;
}

/**
 * Each room's doors (the bake's door states): which crop of the doors'
 * atlas each room's materials read for each of its doors, and how much of
 * the room's light stays with it shut, all told.
 *
 * @returns {Map<string, { id, rect, at, share }[]>} zone -> its doors
 */
function planDoorLayers(states) {
    const byZone = new Map();
    for (const [id, zones] of Object.entries(states?.doors ?? {})) {
        for (const [zone, layer] of Object.entries(zones)) {
            if (!byZone.has(zone)) byZone.set(zone, []);
            byZone.get(zone).push({ id, rect: layer.rect, at: layer.at, share: layer.share ?? 1 });
        }
    }
    return byZone;
}

/** The doors' atlas until it loads: all of the light stays. */
let white = null;
function whiteLayer() {
    if (white) return white;
    white = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
    white.colorSpace = THREE.NoColorSpace;
    white.needsUpdate = true;
    return white;
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
 * Take each switch's vertex light — `_s0`, `_s1`… and what its lamps
 * bounce, `_s0_indirect`… — off a vertex-lit mesh's geometry, so it is not
 * sent to the GPU with it: as plain numbers, for mixVertexLight to add up.
 * What the lamps bounce is read only where lamps are lit live (`live`:
 * setLiveSwitches); drawn from the bake it is dropped, not kept — 9 MB of
 * Ladonia's.
 *
 * @returns {{ index: number, indirect: boolean, values: Float32Array }[]}
 */
function takeSwitchLight(geometry, live = true) {
    const taken = [];
    for (const name of Object.keys(geometry.attributes)) {
        const match = /^_s(\d+)(_indirect)?$/.exec(name);
        if (!match) continue;
        if (live || !match[2]) taken.push({ index: Number(match[1]), indirect: Boolean(match[2]), values: floatValues(geometry.getAttribute(name)).slice() });
        geometry.deleteAttribute(name);
    }
    return taken;
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

/** The triangles drawn under `root` — but under whatever `skip` says (a piece's parts that open: collisionOf). */
export function countTriangles(root, skip = null) {
    let total = 0;
    const visit = (child) => {
        if (skip?.(child)) return;
        if (child.isMesh && child.geometry) {
            const g = child.geometry;
            total += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        }
        for (const next of child.children) visit(next);
    };
    visit(root);
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

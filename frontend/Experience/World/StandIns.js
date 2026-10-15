import * as THREE from "three";

import Experience from "../Experience.js";
import { attributesFor, extract } from "./StaticBatcher.js";
import { REAL_LAYER } from "../Utils/layers.js";

/**
 * What the editor draws in place of the house and its furniture, under its
 * plain light (World/PlainLight.js): the same triangles in a fraction of the
 * draw calls. A house built piece by piece is thousands of small meshes — a
 * wall panel alone is six draws, one a face — and the editor's frame was the
 * time three takes to hand them to the GPU one by one, not the triangles.
 *
 * The objects the editor edits are not touched. Every wall, slab, stair,
 * fitting and piece of furniture stays in the scene exactly as it was built
 * — its meshes, materials, layers and `visible` — for everything that reads
 * them: picking, snapping, the fit test, collision, undo, a publish. Only
 * drawing changes hands. A real mesh that a stand-in draws is taken off the
 * layer the cameras look at (`hide`, Utils/layers.js) and put back the
 * moment it is to draw itself — or the scene is to be read as it was built
 * (the realistic preview, a publish: setActive).
 *
 * Two kinds of stand-in, each kept in step with what it stands for:
 *
 *   - the building (walls with their fixed joinery, slabs, roofs, rails,
 *     stairs, the rooms' light fittings) is **merged**: every triangle in
 *     world space, in one mesh for each material (a "bucket") over the whole
 *     property. Each part keeps its place in its bucket, so showing or
 *     hiding a wall, a room or a floor writes the bucket's index again and
 *     nothing else;
 *   - the furniture is **instanced**: one InstancedMesh for each geometry
 *     and material that two or more of the pieces' meshes share (a "batch"),
 *     a matrix an instance — those in the view, culled one by one as three
 *     culled the meshes. Moving a piece writes its matrices; nothing is
 *     copied. A mesh that is the only one of its kind draws itself.
 *
 * Both draw with the real meshes' own material objects, so whatever changes
 * a material in place — a switch lighting a bulb's glass, the time of day —
 * shows without being told.
 *
 * Drawn as itself, as before: whatever is selected or being moved (the
 * outline and the gizmo want the real meshes), a part of the building for a
 * moment after it was built again (a window dragged along its wall rebuilds
 * that wall at every step), anything see-through (three sorts those one by
 * one, back to front: X-ray, glass), a door's leaf, and whatever else three
 * draws in a way of its own.
 *
 * Nothing has to tell this what an edit changed. Each frame, before it is
 * drawn (Renderer.render, Editor.render), `update` looks: which walls,
 * rooms, flights, fittings and pieces the builder has now, whether each is
 * shown all the way up, where it stands — and, when the world or the editor
 * has said anything at all happened (`hear`) and in turn besides, which
 * materials and geometry each mesh wears — and mends only what differs. So
 * an edit made by any path, now or added later, is drawn right: on the frame
 * it is made if it rebuilds, moves, shows or hides something, or is heard
 * of; within a quarter of a second (LOOKS) if it only changes what a mesh
 * wears and says nothing.
 *
 * Only under the plain light: the realistic preview and a publish take the
 * scene as it always was (`setActive`). Never in a public view, which has a
 * merge of its own (StaticBatcher, HouseMerger).
 *
 * `?standins=0` in the link leaves all of it out, for comparing.
 */

/** How long a part of the building built again is drawn as itself before it is merged, in ms: while a drag rebuilds it at every step, nothing is copied. */
const SETTLE_MS = 250;
/** How many units are looked through again each frame for meshes come or gone inside them, whatever their root says. */
const RESCANS = 4;
/** One unit in this many has each of its meshes looked at each frame, whatever has been heard (`check`): all of them every quarter of a second or so. */
const LOOKS = 16;
/** What the world and the editor say when something may have changed what a mesh wears or whether it is shown: every mesh is looked at on the next frame. (Not "bird": the view from above shows and hides a floor mesh by mesh, inside the units — BirdView.showFloor — but only a public view has one, World.js, and only the editor has stand-ins. An editor given a view from above must list it here.) */
const WORLD_EVENTS = ["finish-changed", "scene-edited", "furniture-ready", "fittings-rebuilt", "scope", "mode", "lighting", "preview", "switches-ready"];
const EDITOR_EVENTS = ["settings", "changed", "selection", "mode"];
/** How many batches a frame are packed again only to drop instances that have left the view: leaving is never urgent — coming into it is, and is done at once. */
const TRIMS = 48;
/** A mesh's layers while a stand-in draws it: off layer 0, which every camera looks at, and on REAL_LAYER, which every ray of the editor's tests (Utils/layers.js). */
const REAL_MASK = 1 << REAL_LAYER;

const NONE = 0;
const MERGE = 1;
const INSTANCE = 2;

const OWN_BEFORE = THREE.Object3D.prototype.onBeforeRender;
const OWN_AFTER = THREE.Object3D.prototype.onAfterRender;
const _matrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export default class StandIns {
    /** @param {World} world  the editor's */
    constructor(world) {
        this.world = world;
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.builder = world.sceneBuilder;
        /** Whether there are stand-ins at all: not with `?standins=0` in the link. */
        this.enabled = standInsWanted();
        /** Whether they are what is drawn now (under the plain light). */
        this.active = false;

        this.group = new THREE.Group();
        this.group.name = "stand-ins";
        // Never picked, collided with, merged or published: they only draw — a group of the scene's own, in none
        // of the lists a ray, the collision, a merge or a publish goes through. (Nothing is set on its meshes to
        // keep a ray off them: a property of their own would make them another kind of object to three's draw
        // loop, which is slower for every object when it meets several kinds.)
        this.group.userData = { helper: true, standIns: true };
        this.group.visible = false;
        this.scene.add(this.group);

        /** root -> unit: a wall, a room, a roof, a stairwell's rails, a flight, a room's fittings, a piece of furniture */
        this.units = new Map();
        /** material and attributes -> bucket */
        this.buckets = new Map();
        /** geometry and material(s) -> batch */
        this.batches = new Map();
        this.dirtyBuckets = new Set();
        this.dirtyBatches = new Set();
        /** Batches still drawing an instance that has left the view (TRIMS). */
        this.loose = new Set();
        /** The view's six planes, as [nx, ny, nz, constant] each: what an instance is culled by, as three culled its mesh. */
        this.planes = new Float64Array(24);
        this.sighted = false;
        /** The units drawn as themselves this frame: selected, or being moved. */
        this.live = new Set();
        this.frame = 0;
        this.cursor = null;
        this.serial = 0;
        /** Whether every mesh is to be looked at on the next frame: something was heard (hear), or the stand-ins are back from the realistic view. */
        this.suspect = true;
        this.hear = () => (this.suspect = true);
        for (const name of WORLD_EVENTS) world.on(name, this.hear);
        this.heard = null;
        /** What it has done, for measuring: totals since the page opened, and the last frame's time in `update`. */
        this.done = { updates: 0, scans: 0, extracts: 0, layouts: 0, indexes: 0, packs: 0, ms: 0, last: 0, worst: 0 };
    }

    // ------------------------------------------------------------------
    // Each frame
    // ------------------------------------------------------------------

    /**
     * Before a frame is drawn (Renderer.render, Editor.render): the
     * stand-ins as the scene is now, and of the furniture's instances those
     * in `camera`'s view.
     *
     * @param {THREE.Camera} [camera]  the frame's; without one, the last frame's view
     */
    update(camera = null) {
        if (!this.enabled || !this.world.plain) {
            if (this.active) this.setActive(false);
            return;
        }
        const started = performance.now();
        if (!this.active) this.setActive(true);
        this.frame++;
        if (camera) this.sight(camera);
        // The editor comes a moment after the world (a chunk of its own): heard from then on.
        const editor = this.world.editor;
        if (editor && this.heard !== editor) {
            this.heard = editor;
            for (const name of EDITOR_EVENTS) editor.on(name, this.hear);
            this.suspect = true;
        }
        const all = this.suspect;
        this.suspect = false;
        const turn = this.frame % LOOKS;
        this.gatherLive();
        this.discover(started);
        let waiting = 0;
        for (const unit of this.units.values()) {
            if (unit.stamp !== this.frame) this.dropUnit(unit);
            else {
                this.check(unit, started, all || unit.turn === turn);
                if (unit.hotUntil > started) waiting++;
            }
        }
        /** How many parts of the building wait to be merged, a moment after they were built again: frames must go on until none does. */
        this.waiting = waiting;
        this.rescan();
        this.flush();
        this.first = false;
        const ms = performance.now() - started;
        this.done.updates++;
        this.done.ms += ms;
        this.done.last = ms;
        if (ms > this.done.worst) this.done.worst = ms;
    }

    /**
     * Drawn, or not: off, every real mesh is in the renderer's sight again
     * and the stand-ins are hidden — the scene as it was built, for the
     * realistic preview and a publish. What each stood for is remembered,
     * for when the plain light is back.
     */
    setActive(on) {
        on = Boolean(on) && this.enabled;
        if (on === this.active) return;
        this.active = on;
        this.group.visible = on;
        // Back from the realistic view: whatever it changed meanwhile, looked at.
        if (on) this.suspect = true;
        for (const unit of this.units.values()) {
            for (const item of unit.list) if (item.in) hide(item.mesh, on && !item.batch?.single);
        }
    }

    /** The view's planes, from a camera as three will draw it this frame. */
    sight(camera) {
        camera.updateMatrixWorld();
        _frustum.setFromProjectionMatrix(_matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const planes = this.planes;
        for (let i = 0; i < 6; i++) {
            const plane = _frustum.planes[i];
            planes[i * 4] = plane.normal.x;
            planes[i * 4 + 1] = plane.normal.y;
            planes[i * 4 + 2] = plane.normal.z;
            planes[i * 4 + 3] = plane.constant;
        }
        this.sighted = true;
    }

    /** With stand-ins or without, from now on (for comparing): without, the scene is drawn as it was built. */
    setEnabled(on) {
        this.enabled = Boolean(on);
        if (!this.enabled) this.setActive(false);
    }

    /** Everything built again a moment ago merged now, not once it has stood still (for a test, or a timing). */
    settle() {
        for (const unit of this.units.values()) unit.hotUntil = 0;
        this.update();
    }

    /** The units the editor draws as themselves: what is selected, and what a move has hold of. */
    gatherLive() {
        const live = this.live;
        live.clear();
        const editor = this.world.editor;
        if (!editor) return;
        const add = (editable) => {
            if (!editable) return;
            for (const object of editable.outlineObjects?.() ?? []) {
                for (let node = object; node; node = node.parent) {
                    if (this.units.has(node)) {
                        live.add(node);
                        break;
                    }
                }
            }
        };
        add(editor.selection);
        if (editor.session && editor.session.editable !== editor.selection) add(editor.session.editable);
    }

    /** The units there are now, by the builder's own lists: a part built again is a new group, and so a new unit. */
    discover(now) {
        const b = this.builder;
        if (!b.isModelScene) {
            for (const entry of b.wallGroups.values()) this.want(entry.group, MERGE, now);
            // A room's floor and its ceiling apart: the editor shows and hides each by itself.
            for (const group of b.roomGroups.values()) {
                const slabs = group.children;
                for (let i = 0; i < slabs.length; i++) this.want(slabs[i], MERGE, now);
            }
            for (const group of b.roofGroups ?? []) this.want(group, MERGE, now);
            if (b.railGroups) for (const group of b.railGroups.values()) this.want(group, MERGE, now);
            for (const owner of b.lightFittings?.children ?? []) this.want(owner, MERGE, now);
        }
        // (What the editor moves where it stands, rather than builds again: a flight, a piece.)
        for (const entry of b.stairs.values()) if (entry.group) this.want(entry.group, MERGE, now, true);
        for (const entry of b.furniture.values()) this.want(entry.group, INSTANCE, now, true);
    }

    want(root, kind, now, moves = false) {
        let unit = this.units.get(root);
        if (!unit) {
            unit = {
                root,
                kind,
                moves,
                items: new Map(),
                list: [],
                movers: [],
                children: -1,
                trs: new Float64Array(10),
                // Built again while the editor is open: as itself until it has stood still.
                hotUntil: kind === MERGE && this.first === false ? now + SETTLE_MS : 0,
                stamp: 0,
                /** Which frame in LOOKS its meshes are looked at unasked. */
                turn: this.serial++ % LOOKS,
                /** Its meshes to be looked at on its next check: new ones among them. */
                look: true,
                out: null,
            };
            readTRS(root, unit.trs);
            this.units.set(root, unit);
        }
        unit.stamp = this.frame;
    }

    /**
     * One unit against what it was last frame. Every frame: whether it is
     * the builder's still (discover), its children's number, where it
     * stands, whether it is shown all the way up, selected or just built —
     * all read from its root alone — and, of its instances, which are in the
     * view. Its meshes themselves — the materials and geometry each wears,
     * whether each is shown within it — are looked at (`deep`) when they are
     * new, when the world or the editor has said something changed (hear),
     * and in turn every LOOKS frames whatever was said: touching five
     * thousand meshes a frame cost 0.65 ms of Ladonia's ten.
     */
    check(unit, now, deep) {
        const root = unit.root;
        if (root.children.length !== unit.children) this.scan(unit);
        if (unit.moves && movedTRS(root, unit.trs)) {
            root.updateMatrixWorld(true);
            this.moved(unit, now);
        }
        for (const mover of unit.movers) {
            if (!movedTRS(mover.node, mover.trs)) continue;
            mover.node.updateMatrixWorld(true);
            this.moved(unit, now);
        }
        let out = unit.hotUntil > now || this.live.has(root);
        if (!out) {
            for (let node = root; node; node = node.parent) {
                if (!node.visible) {
                    out = true;
                    break;
                }
            }
        }
        const merged = unit.kind === MERGE;
        if (deep || unit.look) {
            unit.look = false;
            let adrift = false;
            for (const item of unit.list) {
                const mesh = item.mesh;
                if (mesh.material !== item.material || mesh.geometry !== item.geometry) this.refresh(item);
                else if (merged && item.cache && (item.geometry.attributes.position.version !== item.pv || (item.geometry.attributes.uv?.version ?? 0) !== item.uvv)) this.refresh(item);
                let shown = true;
                let node = mesh;
                for (; node && node !== root; node = node.parent) {
                    if (!node.visible) {
                        shown = false;
                        break;
                    }
                }
                // Taken out from inside the unit, whose root shows nothing of it: not drawn, and the unit looked through again.
                if (!node) {
                    shown = false;
                    adrift = true;
                }
                item.shown = shown;
            }
            if (adrift) this.scan(unit);
        } else if (out === unit.out && (merged || out)) {
            // Between looks nothing of a unit changes but whether it is drawn at all — and, of a piece of furniture drawn, which of its instances are in the view.
            return;
        }
        unit.out = out;
        const planes = this.planes;
        const sighted = this.sighted;
        for (const item of unit.list) {
            const want = !out && item.shown && item.kind !== NONE;
            if (want && !merged && !item.batch?.single) {
                // In the view or out of it, by the sphere three culled the mesh itself by.
                if (item.stale) bound(item);
                let seen = true;
                if (sighted) {
                    const reach = -item.sr;
                    for (let i = 0; i < 24; i += 4) {
                        if (planes[i] * item.sx + planes[i + 1] * item.sy + planes[i + 2] * item.sz + planes[i + 3] < reach) {
                            seen = false;
                            break;
                        }
                    }
                }
                if (seen !== item.seen) {
                    item.seen = seen;
                    if (item.in && item.batch) {
                        if (seen) this.dirtyBatches.add(item.batch);
                        else {
                            item.batch.trim = true;
                            this.loose.add(item.batch);
                        }
                    }
                }
            }
            if (want !== item.in) this.put(item, want);
        }
    }

    /** A few units a frame looked through again, in turn: a mesh added or taken away deep inside one changes nothing its root shows. */
    rescan() {
        for (let i = 0; i < RESCANS; i++) {
            const next = this.cursor?.next();
            if (!next || next.done) {
                this.cursor = this.units.values();
                return;
            }
            const unit = next.value;
            if (this.units.get(unit.root) === unit) this.scan(unit, true);
        }
    }

    /** Buckets laid out or indexed again, batches packed: once a frame each, whatever changed in them. */
    flush() {
        if (this.dirtyBuckets.size) {
            for (const bucket of this.dirtyBuckets) {
                if (bucket.layout) this.layout(bucket);
                else this.index(bucket);
            }
            this.dirtyBuckets.clear();
        }
        if (this.dirtyBatches.size) {
            for (const batch of this.dirtyBatches) this.pack(batch);
            this.dirtyBatches.clear();
        }
        if (this.loose.size) {
            let n = 0;
            for (const batch of this.loose) {
                this.loose.delete(batch);
                if (batch.trim) this.pack(batch);
                if (++n >= TRIMS) break;
            }
        }
    }

    // ------------------------------------------------------------------
    // Units and their meshes
    // ------------------------------------------------------------------

    /**
     * A unit's meshes as they are now: new ones taken on, those gone let go.
     * What moves on its own inside a piece of furniture — a door, a drawer
     * (World/Openables.js) — is watched for moving (`movers`); a wall's door
     * leaves are left to draw themselves.
     */
    scan(unit, quiet = false) {
        const root = unit.root;
        const before = unit.items.size;
        unit.children = root.children.length;
        unit.scanned = (unit.scanned ?? 0) + 1;
        const mark = unit.scanned;
        let fresh = 0;
        const movers = [];
        const instanced = unit.kind === INSTANCE;
        const visit = (node) => {
            const data = node.userData;
            if (node !== root && data) {
                if (data.helper || data.kind === "person") return;
                if (data.opens !== undefined) {
                    if (!instanced) return;
                    movers.push(node);
                } else if (!instanced && (data.doorLeaf || data.hingeSide !== undefined)) return;
            }
            if (node.isMesh) {
                let item = unit.items.get(node);
                if (!item) {
                    item = { unit, mesh: node, kind: NONE, material: undefined, geometry: undefined, in: false, parts: null, cache: null, batch: null, pv: 0, uvv: 0, mark: 0, shown: false, seen: true, stale: true, sx: 0, sy: 0, sz: 0, sr: 0 };
                    unit.items.set(node, item);
                    fresh++;
                }
                item.mark = mark;
            }
            const children = node.children;
            for (let i = 0; i < children.length; i++) visit(children[i]);
        };
        visit(root);
        let gone = 0;
        if (before > 0) {
            for (const item of unit.items.values()) {
                if (item.mark === mark) continue;
                this.forget(item);
                unit.items.delete(item.mesh);
                gone++;
            }
        }
        if (fresh) unit.look = true;
        if (fresh || gone || !quiet) {
            unit.list = [...unit.items.values()];
            // Where each mesh stands, before anything is copied from it: three places a new object when it next draws.
            if (fresh) root.updateWorldMatrix(true, true);
            this.done.scans++;
        }
        if (movers.length !== unit.movers.length || movers.some((node, i) => unit.movers[i].node !== node)) {
            unit.movers = movers.map((node) => {
                const trs = new Float64Array(10);
                readTRS(node, trs);
                return { node, trs };
            });
        }
    }

    /** A unit has moved (a piece put somewhere else, a flight slid along): its instances' matrices again; its merged triangles, once it stands still. */
    moved(unit, now) {
        if (unit.kind === INSTANCE) {
            for (const item of unit.list) {
                item.stale = true;
                if (item.batch) this.dirtyBatches.add(item.batch);
            }
            return;
        }
        unit.hotUntil = now + SETTLE_MS;
        for (const item of unit.list) {
            if (item.in) this.put(item, false);
            this.leave(item);
            item.cache = null;
        }
    }

    dropUnit(unit) {
        for (const item of unit.list) this.forget(item);
        this.units.delete(unit.root);
    }

    /** A mesh no longer the builder's: out of its bucket or batch, and in sight again (it may be drawn elsewhere yet). */
    forget(item) {
        if (item.in) this.put(item, false);
        this.leave(item);
        item.cache = null;
    }

    /** A mesh wears other materials or another geometry than it did: what can stand in for it now, if anything. */
    refresh(item) {
        const mesh = item.mesh;
        const sameGeometry = mesh.geometry === item.geometry && item.cache && mesh.geometry.attributes.position.version === item.pv && (mesh.geometry.attributes.uv?.version ?? 0) === item.uvv;
        if (item.in) this.put(item, false);
        this.leave(item);
        if (!sameGeometry) item.cache = null;
        item.material = mesh.material;
        item.geometry = mesh.geometry;
        item.stale = true;
        item.pv = mesh.geometry?.attributes.position?.version ?? 0;
        item.uvv = mesh.geometry?.attributes.uv?.version ?? 0;
        item.kind = kindOf(item.unit, mesh);
    }

    /** A mesh drawn by its stand-in (`on`), or by itself again. */
    put(item, on) {
        if (on) {
            if (item.kind === MERGE) {
                if (!item.parts) this.join(item);
                for (const part of item.parts) {
                    part.in = true;
                    this.dirtyBuckets.add(part.bucket);
                }
            } else {
                if (!item.batch) this.enlist(item);
                this.dirtyBatches.add(item.batch);
            }
        } else if (item.parts) {
            for (const part of item.parts) {
                part.in = false;
                this.dirtyBuckets.add(part.bucket);
            }
        } else if (item.batch) {
            this.dirtyBatches.add(item.batch);
        }
        item.in = on;
        // (The only one of its kind draws itself: pack.)
        if (this.active) hide(item.mesh, on && !item.batch?.single);
    }

    /** Out of whatever bucket or batch a mesh has a place in. */
    leave(item) {
        if (item.parts) {
            for (const part of item.parts) {
                part.gone = true;
                part.bucket.layout = true;
                this.dirtyBuckets.add(part.bucket);
            }
            item.parts = null;
        }
        if (item.batch) {
            const batch = item.batch;
            const at = batch.entries.indexOf(item);
            if (at >= 0) {
                batch.entries[at] = batch.entries[batch.entries.length - 1];
                batch.entries.pop();
            }
            this.dirtyBatches.add(batch);
            item.batch = null;
        }
    }

    // ------------------------------------------------------------------
    // Merged: the building
    // ------------------------------------------------------------------

    /**
     * A mesh's triangles into the buckets of its materials: copied into
     * world space once (kept, so that a finish painted on one face moves
     * that face's triangles to another bucket without copying the rest
     * again), a part for each material it draws with.
     */
    join(item) {
        const mesh = item.mesh;
        const geometry = mesh.geometry;
        const list = Array.isArray(mesh.material);
        const materials = list ? mesh.material : [mesh.material];
        const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
        // As three draws it: a list of materials by the geometry's groups, one material the whole of it.
        const ranges = list ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
        const cache = item.cache ?? (item.cache = new Map());
        const parts = [];
        for (let r = 0; r < ranges.length; r++) {
            const range = ranges[r];
            const material = materials[range.materialIndex ?? 0];
            if (!material) continue;
            const names = attributesFor(material, geometry);
            const signature = names.join();
            let kept = cache.get(r);
            if (!kept || kept.signature !== signature) {
                // As it is now: what the next frames compare with.
                item.pv = geometry.attributes.position.version;
                item.uvv = geometry.attributes.uv?.version ?? 0;
                const copy = copyRange(geometry, range.start, range.count, mesh.matrixWorld, names);
                kept = { signature, names, geometry: copy };
                cache.set(r, kept);
                this.done.extracts++;
            }
            if (!kept.geometry) continue;
            const bucket = this.bucketFor(material, kept.names, signature, mesh);
            const part = { bucket, geometry: kept.geometry, in: false, gone: false, offset: 0 };
            bucket.parts.push(part);
            bucket.layout = true;
            this.dirtyBuckets.add(bucket);
            parts.push(part);
        }
        item.parts = parts;
    }

    bucketFor(material, names, signature, source) {
        const key = `${material.id}|${signature}`;
        let bucket = this.buckets.get(key);
        if (!bucket) {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
            mesh.name = `stand-in:${material.name || material.type}`;
            mesh.userData = { helper: true, standIn: true };
            mesh.matrixAutoUpdate = false;
            mesh.receiveShadow = source.receiveShadow;
            mesh.castShadow = false;
            mesh.visible = false;
            this.group.add(mesh);
            bucket = { key, material, names, mesh, parts: [], layout: true, capacity: 0 };
            this.buckets.set(key, bucket);
        }
        return bucket;
    }

    /** A bucket's vertices again, after a part came or went: every part's in a row, shown or not. */
    layout(bucket) {
        bucket.layout = false;
        const parts = (bucket.parts = bucket.parts.filter((part) => !part.gone));
        const mesh = bucket.mesh;
        mesh.geometry.dispose();
        if (!parts.length) {
            this.group.remove(mesh);
            this.buckets.delete(bucket.key);
            return;
        }
        let vertices = 0;
        let indices = 0;
        for (const part of parts) {
            part.offset = vertices;
            vertices += part.geometry.attributes.position.count;
            indices += part.geometry.index.count;
        }
        const geometry = new THREE.BufferGeometry();
        for (const name of bucket.names) {
            const size = parts[0].geometry.attributes[name].itemSize;
            const array = new Float32Array(vertices * size);
            for (const part of parts) array.set(part.geometry.attributes[name].array, part.offset * size);
            geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
        }
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        mesh.geometry = geometry;
        geometry.boundingSphere = sphereOf(geometry.attributes.position.array);
        this.done.layouts++;
        this.index(bucket);
    }

    /** A bucket's index again: the triangles of the parts shown now. */
    index(bucket) {
        const geometry = bucket.mesh.geometry;
        const index = geometry.index;
        const array = index.array;
        let n = 0;
        for (const part of bucket.parts) {
            if (!part.in) continue;
            const source = part.geometry.index.array;
            const offset = part.offset;
            for (let i = 0; i < source.length; i++) array[n++] = source[i] + offset;
        }
        geometry.setDrawRange(0, n);
        index.needsUpdate = true;
        bucket.mesh.visible = n > 0;
        this.done.indexes++;
    }

    // ------------------------------------------------------------------
    // Instanced: the furniture
    // ------------------------------------------------------------------

    /** A mesh into the batch of its geometry and material(s). */
    enlist(item) {
        const mesh = item.mesh;
        const material = mesh.material;
        const key = `${mesh.geometry.id}|${Array.isArray(material) ? material.map((m) => m.id).join() : material.id}`;
        let batch = this.batches.get(key);
        if (!batch) {
            batch = { key, geometry: mesh.geometry, material: Array.isArray(material) ? material.slice() : material, receive: mesh.receiveShadow, name: mesh.name, entries: [], mesh: null, capacity: 0, single: false, trim: false };
            this.batches.set(key, batch);
        }
        batch.entries.push(item);
        item.batch = batch;
    }

    /**
     * A batch's matrices again: one for each of its meshes shown and in the
     * view now, where it stands now. A mesh that is the only one of its
     * geometry and material has no stand-in: it draws itself, as it always
     * did, until another comes.
     */
    pack(batch) {
        const entries = batch.entries;
        if (!entries.length) {
            this.retire(batch);
            if (this.batches.get(batch.key) === batch) this.batches.delete(batch.key);
            return;
        }
        if (entries.length === 1) {
            this.retire(batch);
            batch.single = true;
            batch.trim = false;
            hide(entries[0].mesh, false);
            return;
        }
        if (batch.single) {
            batch.single = false;
            if (this.active) for (const item of entries) hide(item.mesh, item.in);
        }
        if (entries.length > batch.capacity) {
            this.retire(batch);
            // Room for the next of its kind.
            batch.capacity = Math.ceil(entries.length * 1.5);
            const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.capacity);
            mesh.name = `stand-in:${batch.name || "furniture"}`;
            mesh.userData = { helper: true, standIn: true };
            mesh.matrixAutoUpdate = false;
            mesh.receiveShadow = batch.receive;
            mesh.castShadow = false;
            // Each instance is culled here, by the view (check): what is left is in it.
            mesh.frustumCulled = false;
            this.group.add(mesh);
            batch.mesh = mesh;
        }
        const mesh = batch.mesh;
        const array = mesh.instanceMatrix.array;
        let n = 0;
        for (const item of entries) {
            if (!item.in || !item.seen) continue;
            item.mesh.matrixWorld.toArray(array, n * 16);
            n++;
        }
        batch.trim = false;
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
        this.done.packs++;
    }

    retire(batch) {
        if (!batch.mesh) return;
        this.group.remove(batch.mesh);
        batch.mesh.dispose();
        batch.mesh = null;
        batch.capacity = 0;
    }

    // ------------------------------------------------------------------

    /** What there is now, for measuring. */
    stats() {
        const out = { enabled: this.enabled, active: this.active, waiting: this.waiting ?? 0, units: this.units.size, meshes: 0, merged: 0, instanced: 0, alone: 0, asThemselves: 0, hidden: 0, buckets: this.buckets.size, batches: 0, bucketTriangles: 0, instances: 0, ...this.done };
        for (const unit of this.units.values()) {
            for (const item of unit.list) {
                out.meshes++;
                if (item.in) out[item.kind === MERGE ? "merged" : item.batch?.single ? "alone" : "instanced"]++;
                else if (item.kind === NONE) out.asThemselves++;
                else out.hidden++;
            }
        }
        for (const bucket of this.buckets.values()) out.bucketTriangles += bucket.mesh.geometry.drawRange.count / 3 || 0;
        for (const batch of this.batches.values()) {
            if (!batch.mesh) continue;
            out.batches++;
            out.instances += batch.mesh.count;
        }
        return out;
    }

    dispose() {
        this.setActive(false);
        this.enabled = false;
        for (const name of WORLD_EVENTS) this.world.removeListener(name, this.hear);
        if (this.heard) for (const name of EDITOR_EVENTS) this.heard.removeListener(name, this.hear);
        for (const bucket of this.buckets.values()) bucket.mesh.geometry.dispose();
        for (const batch of this.batches.values()) batch.mesh?.dispose();
        this.scene.remove(this.group);
        this.units.clear();
        this.buckets.clear();
        this.batches.clear();
    }
}

/** The sphere round a bucket's vertices (x, y, z in a row), every part's, shown or not: what three culls the bucket by. */
function sphereOf(positions) {
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    let most = 0;
    for (let i = 0; i < positions.length; i += 3) {
        const dx = positions[i] - cx;
        const dy = positions[i + 1] - cy;
        const dz = positions[i + 2] - cz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d > most) most = d;
    }
    return new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(most));
}

const _normalMatrix = new THREE.Matrix3();

/**
 * One draw range of a geometry in world space, as StaticBatcher's `extract`
 * gives it — only the vertices the range uses, plain floats, the triangles
 * turned back if the mesh is mirrored — but several times faster for what
 * the building is made of (plain float attributes, three to a position):
 * a wall slid along rebuilds a hundred fittings, and all of them are copied
 * in the one frame they are merged again. Anything else goes to `extract`.
 */
function copyRange(geometry, start, count, matrix, names) {
    const source = geometry.attributes;
    for (const name of names) {
        const attribute = source[name];
        if (!attribute) continue;
        if (attribute.isInterleavedBufferAttribute || attribute.normalized || !(attribute.array instanceof Float32Array)) return extract(geometry, start, count, matrix, names);
    }
    if (source.position.itemSize !== 3 || (source.normal && source.normal.itemSize !== 3) || names.includes("tangent")) return extract(geometry, start, count, matrix, names);
    const index = geometry.index;
    const total = index ? index.count : source.position.count;
    const end = Math.min(total, start + count);
    const length = end - start;
    if (length < 3) return null;

    // The vertices the range uses, in the order it first uses them — or all of them as they are, when it is the whole geometry.
    const whole = start === 0 && end === total;
    let used = null;
    let vertices;
    const indices = new Uint32Array(length);
    if (whole && index) {
        vertices = source.position.count;
        indices.set(index.array);
    } else if (whole) {
        vertices = total;
        for (let i = 0; i < length; i++) indices[i] = i;
    } else {
        const remap = new Int32Array(source.position.count).fill(-1);
        used = new Uint32Array(Math.min(length, source.position.count));
        vertices = 0;
        const from = index ? index.array : null;
        for (let i = start; i < end; i++) {
            const vertex = from ? from[i] : i;
            let mapped = remap[vertex];
            if (mapped < 0) {
                mapped = remap[vertex] = vertices;
                used[vertices++] = vertex;
            }
            indices[i - start] = mapped;
        }
    }
    const e = matrix.elements;
    if (matrix.determinant() < 0) {
        for (let i = 0; i + 2 < length; i += 3) {
            const b = indices[i + 1];
            indices[i + 1] = indices[i + 2];
            indices[i + 2] = b;
        }
    }
    const part = new THREE.BufferGeometry();
    for (const name of names) {
        const attribute = source[name];
        const size = attribute ? attribute.itemSize : name === "uv" || name === "uv1" ? 2 : 3;
        const array = new Float32Array(vertices * size);
        if (attribute) {
            const from = attribute.array;
            if (!used) array.set(vertices * size === from.length ? from : from.subarray(0, vertices * size));
            else for (let j = 0; j < vertices; j++) for (let c = 0; c < size; c++) array[j * size + c] = from[used[j] * size + c];
        }
        if (name === "position") {
            for (let j = 0; j < array.length; j += 3) {
                const x = array[j];
                const y = array[j + 1];
                const z = array[j + 2];
                array[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
                array[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
                array[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
            }
        } else if (name === "normal" && attribute) {
            const m = _normalMatrix.getNormalMatrix(matrix).elements;
            for (let j = 0; j < array.length; j += 3) {
                const x = array[j];
                const y = array[j + 1];
                const z = array[j + 2];
                const nx = m[0] * x + m[3] * y + m[6] * z;
                const ny = m[1] * x + m[4] * y + m[7] * z;
                const nz = m[2] * x + m[5] * y + m[8] * z;
                const scale = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
                array[j] = nx * scale;
                array[j + 1] = ny * scale;
                array[j + 2] = nz * scale;
            }
        }
        part.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    part.setIndex(new THREE.BufferAttribute(indices, 1));
    return part;
}

/** Where a mesh's sphere is in the world now — its geometry's, as three's own culling takes it. */
function bound(item) {
    const geometry = item.mesh.geometry;
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    _sphere.copy(geometry.boundingSphere).applyMatrix4(item.mesh.matrixWorld);
    item.sx = _sphere.center.x;
    item.sy = _sphere.center.y;
    item.sz = _sphere.center.z;
    item.sr = _sphere.radius;
    item.stale = false;
}

/**
 * A real mesh out of every camera's sight (`on`), or back in it: by its
 * layers alone (Utils/layers.js), which every ray of the editor's sees
 * through. Nothing else of it changes — not its `visible`, its materials or
 * its place in the scene — and nothing is added to it: a property of its own
 * on four meshes in five (a sphere no frustum holds, tried first) made every
 * walking frame 2 ms longer, in the crosshair's ray, which reads them all.
 */
function hide(mesh, on) {
    const mask = on ? REAL_MASK : 1;
    if (mesh.layers.mask !== mask) mesh.layers.mask = mask;
}

/**
 * Whether a mesh can be drawn by a stand-in without a pixel changing, and
 * by which kind. Not what three sorts and draws one by one (see-through),
 * draws in a way of its own (skinned, morphed, instanced, a draw range, a
 * render order, a hook), or never culls; nor, instanced, a mesh mirrored or
 * sheared, which an instance's matrix cannot be lit rightly by.
 */
function kindOf(unit, mesh) {
    const geometry = mesh.geometry;
    if (!geometry?.attributes?.position || !geometry.attributes.normal) return NONE;
    if (mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.morphTargetInfluences) return NONE;
    if (!mesh.frustumCulled || mesh.renderOrder !== 0 || (mesh.layers.mask !== 1 && mesh.layers.mask !== REAL_MASK)) return NONE;
    if (mesh.boundingSphere !== undefined) return NONE;
    if (mesh.onBeforeRender !== OWN_BEFORE || mesh.onAfterRender !== OWN_AFTER) return NONE;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return NONE;
    const material = mesh.material;
    if (Array.isArray(material)) {
        if (!geometry.groups.length) return NONE;
        for (const one of material) if (!drawable(one)) return NONE;
    } else if (!drawable(material)) return NONE;
    if (unit.kind === MERGE) return geometry.attributes.position.count >= 3 ? MERGE : NONE;
    // An instance is lit through its matrix's own three axes: square to each other, and not mirrored.
    _matrix.copy(mesh.matrixWorld).extractBasis(_a, _b, _c);
    if (_matrix.determinant() <= 0) return NONE;
    const skew = 1e-4;
    if (Math.abs(_a.dot(_b)) > skew * _a.length() * _b.length() || Math.abs(_a.dot(_c)) > skew * _a.length() * _c.length() || Math.abs(_b.dot(_c)) > skew * _b.length() * _c.length()) return NONE;
    return INSTANCE;
}

function drawable(material) {
    return Boolean(material) && material.visible !== false && !material.transparent && !(material.transmission > 0) && !material.wireframe;
}

function readTRS(object, into) {
    const p = object.position;
    const q = object.quaternion;
    const s = object.scale;
    into[0] = p.x;
    into[1] = p.y;
    into[2] = p.z;
    into[3] = q.x;
    into[4] = q.y;
    into[5] = q.z;
    into[6] = q.w;
    into[7] = s.x;
    into[8] = s.y;
    into[9] = s.z;
}

/** Whether an object has been moved, turned or scaled since `last` was read — which is then read again. */
function movedTRS(object, last) {
    const p = object.position;
    const q = object.quaternion;
    const s = object.scale;
    if (last[0] === p.x && last[1] === p.y && last[2] === p.z && last[3] === q.x && last[4] === q.y && last[5] === q.z && last[6] === q.w && last[7] === s.x && last[8] === s.y && last[9] === s.z) return false;
    readTRS(object, last);
    return true;
}

/** Whether the link asks for the scene drawn as it is built (`?standins=0`). */
function standInsWanted() {
    const asked = new URL(window.location.href).searchParams.get("standins");
    return asked === null || (asked !== "0" && asked !== "false" && asked !== "off");
}

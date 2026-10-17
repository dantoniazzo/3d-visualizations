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
 * A piece whose doors and drawers open (World/Openables.js) is drawn
 * **whole** instead: each such part is a mesh of its own — a kitchen's
 * fronts, a wardrobe's doors, a nightstand's drawers, 843 meshes in
 * Ladonia — most of them the only one of their kind, and drawn one by one
 * they took A1's kitchen from 819 draws to 1,138. While every part of it is
 * shut, the piece is one mesh a material: its body and its parts merged in
 * its own frame (a "model", made once for every piece placed from the same
 * file, with the same finishes), and instanced over every such piece in the
 * view — or, the only one placed, drawn as a mesh of its own where it
 * stands. A part that moves or stands open is lifted out (`LIFTED`): it
 * draws itself, and the rest of its piece is still one mesh a material, of
 * the model's triangles but that part's — until it is shut again, to the
 * last digit of its rest pose, and back in. A window's sash (World/Sash.js)
 * is merged with its wall while it is shut, and draws itself while it is
 * not. (A kitchen's model is twenty materials, its fridge's liner and glass
 * shelves among them, so twenty draws: about what its body alone was.)
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
 * What it watches it also **holds still** (`hold`), and keeps out of
 * three's way (`drawnScene`). three works out every object's frame again at
 * each render of the scene, the scene's own first — which passes the word
 * down, so every object under it was worked out again whether it had moved
 * or not — and then goes into every object shown to find what to draw, on
 * the camera's layer or not. Ladonia's editor has 11,600 objects, 2,000 more
 * than before its doors, drawers and sashes opened: the walk took 1.5 ms of
 * a frame of A1's kitchen where it had taken 1.1; and three drew from
 * fewer than a thousand of the 10,600 shown, the rest being the real meshes
 * the stand-ins draw. A unit's frame changes only where this looks every
 * frame anyway — a piece's or a flight's root, the parts in a piece that
 * open (`movers`); the rest of the building is built again, never moved —
 * and where a door's leaf or a sash moves, whose own update works out its
 * world matrix as it moves (Door.update, WindowSash.place). So, while the
 * stand-ins are drawn:
 *
 *   - the groups the units hang in, up to the scene, have their frames
 *     worked out once (looked at each frame all the same, and worked out
 *     again with all under them should one move after all), and each unit
 *     is passed over by three's walk (`matrixWorldAutoUpdate`): its world
 *     matrices are worked out here when it is found, when its root or a part
 *     of it moves and when something comes into it — and by whoever asks, as
 *     ever, since its root still works out its own frame when asked
 *     (updateMatrixWorld, updateWorldMatrix);
 *   - three is handed the scene without the units the stand-ins draw
 *     entirely (`away`: every mesh merged, instanced or drawn by its piece's
 *     model, nothing in it drawing itself, no light of it shining) — an
 *     object of its own for the scene and each group, made from it
 *     (proxyOf), with only the children three is to go into.
 *
 * Everything else is walked and drawn as it always was. Let go
 * (`setActive(false)`: the realistic preview, a publish), the whole scene is
 * walked again, every frame of it worked out, and handed to three as it is.
 * What is added deep inside a unit, other than a model arriving, must work
 * out its own world matrix (Openables.lend does, for the light it hangs in a
 * piece). `?still=0` leaves all of this out, for comparing.
 *
 * Only under the plain light: the realistic preview and a publish take the
 * scene as it always was (`setActive`). Never in a public view, which has a
 * merge of its own (StaticBatcher, HouseMerger).
 *
 * `?standins=0` in the link leaves all of it out, for comparing; `?shut=0`
 * (or `setShutMerged(false)`) only the pieces drawn whole and the sashes
 * merged, which then draw mesh by mesh as before.
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

/**
 * How a piece whose parts open is drawn (drawWhole): mesh by mesh, as any
 * other piece is (LOOSE: selected, moved, something in it hidden); whole,
 * by its model, every part shut (WHOLE); or whole but for the parts lifted
 * out of it, moving or open, which draw themselves (LIFTED).
 */
const LOOSE = 0;
const WHOLE = 1;
const LIFTED = 2;

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
        /** Whether a piece whose parts open is drawn whole, and a sash shut merged with its wall: not with `?shut=0` in the link (setShutMerged). */
        this.mergesShut = shutWanted();
        /** Whether the units and the groups they hang in are held still while the stand-ins are drawn (hold): not with `?still=0` in the link. */
        this.holds = stillWanted();
        /** Whether they are held now. */
        this.holding = false;
        /**
         * The groups the units hang in, up to the scene (hold): group -> `{ node, proxy, sources, trs }` — its stand-in in
         * what three is handed to draw (drawnScene), its children as they were last sorted into that, and its position,
         * turn and scale as held (null when something else holds it). `groupList` is the same, for going through each
         * frame with nothing made to do so.
         */
        this.groups = new Map();
        this.groupList = [];
        /** Whether units have come or gone since the groups they hang in were gathered. */
        this.containersStale = true;
        /** The scene's stand-in, while held: what three is handed. */
        this.drawn = null;
        /** Whether the proxies' children are to be sorted again (sortDrawn). */
        this.drawStale = true;
        /** The units to be judged again before the frame is drawn, drawn entirely by the stand-ins or not (sortDrawn). */
        this.awayDirty = new Set();

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
        /** A piece's whole, by what it is made of -> model: the same for every piece placed from one file (drawWhole). */
        this.models = new Map();
        this.dirtyBuckets = new Set();
        this.dirtyBatches = new Set();
        /** Models whose pieces drawn whole have come, gone, moved or left the view: their instances written again. */
        this.dirtyModels = new Set();
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
        this.done = { updates: 0, scans: 0, extracts: 0, layouts: 0, indexes: 0, packs: 0, made: 0, lifts: 0, ms: 0, last: 0, worst: 0 };
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
        if (this.holds) this.hold();
        let waiting = 0;
        for (const unit of this.units.values()) {
            if (unit.stamp !== this.frame) this.dropUnit(unit);
            else {
                this.check(unit, started, all || unit.turn === turn);
                if (unit.hotUntil > started) waiting++;
                // (A light of its own may be lit or put out by anything: looked at every frame.)
                if (this.holding && unit.lights.length) this.awayDirty.add(unit);
            }
        }
        /** How many parts of the building wait to be merged, a moment after they were built again: frames must go on until none does. */
        this.waiting = waiting;
        this.rescan();
        this.flush();
        if (this.holding) this.sortDrawn();
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
        // Read as it was built, it is walked as it was built: every frame of it (held again with the next frame drawn plain).
        else this.letGo();
        for (const unit of this.units.values()) {
            for (const item of unit.list) {
                if (item.cast) this.hideItem(item, on);
                else if (item.in) this.hideItem(item, on && !item.batch?.single);
            }
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

    /** Pieces whose parts open drawn whole, and sashes merged with their walls, or — for comparing — mesh by mesh, as before (`?shut=0`). */
    setShutMerged(on) {
        this.mergesShut = Boolean(on);
        for (const unit of this.units.values()) unit.out = undefined;
        this.suspect = true;
    }

    /**
     * The units, the groups they hang in and the stand-ins' own group held
     * still, each frame before the units are checked (see the top): a group
     * found to have moved after all — nothing moves one today — is worked
     * out again with everything under it. Gathered again only when units
     * come or go: a group held and no longer hanging a unit is let go.
     */
    hold() {
        if (!this.holding) {
            this.holding = true;
            this.containersStale = true;
            // (Its meshes' frames are written where they are made and moved — placed — and the group itself never moves.)
            this.group.updateMatrixWorld(true);
            this.group.matrixAutoUpdate = false;
            this.group.matrixWorldAutoUpdate = false;
        }
        if (this.containersStale) {
            this.containersStale = false;
            const wanted = new Set();
            for (const unit of this.units.values()) {
                for (let node = unit.root.parent; node && !wanted.has(node); node = node.parent) {
                    if (!this.units.has(node)) wanted.add(node);
                }
            }
            for (const group of this.groupList) {
                if (wanted.has(group.node)) continue;
                if (group.trs) group.node.matrixAutoUpdate = true;
                this.groups.delete(group.node);
            }
            for (const node of wanted) {
                if (this.groups.has(node)) continue;
                const group = { node, proxy: proxyOf(node, node === this.scene), sources: [], trs: null };
                // (Held by something else already, it is left to that.)
                if (node.matrixAutoUpdate) {
                    node.updateMatrix();
                    node.matrixAutoUpdate = false;
                    group.trs = new Float64Array(10);
                    readTRS(node, group.trs);
                }
                this.groups.set(node, group);
            }
            this.groupList = [...this.groups.values()];
            this.drawn = this.groups.get(this.scene)?.proxy ?? null;
            this.drawStale = true;
        }
        const list = this.groupList;
        for (let i = 0; i < list.length; i++) {
            const { node, trs } = list[i];
            if (!trs || !movedTRS(node, trs)) continue;
            node.updateMatrix();
            node.updateMatrixWorld(true);
        }
    }

    /** A unit held still from now on: its world matrices worked out as it is found, then passed over by three's walk (check works them out again). */
    holdUnit(unit) {
        unit.held = true;
        this.awayDirty.add(unit);
        const root = unit.root;
        if (!root.matrixWorldAutoUpdate) return;
        root.updateMatrixWorld(true);
        root.matrixWorldAutoUpdate = false;
        unit.passed = true;
    }

    /** A unit walked by three again. */
    releaseUnit(unit) {
        if (unit.passed) unit.root.matrixWorldAutoUpdate = true;
        unit.held = unit.passed = false;
    }

    /**
     * Whether a unit is drawn entirely by the stand-ins: every mesh of it
     * merged, instanced or drawn by its piece's model, off the layer the
     * cameras look at (hide) — nothing of it left to draw itself (scan's
     * `foreign`: a door's leaf, a line), no light of it shining. Three need
     * not so much as go into it then (drawnScene).
     */
    awayOf(unit) {
        if (!this.active || unit.foreign) return false;
        for (const light of unit.lights) if (light.visible && light.layers.mask & 1) return false;
        for (const item of unit.list) if (!item.cast && !(item.in && !item.batch?.single)) return false;
        return true;
    }

    /**
     * What three is handed to draw the frame while the units are held: the
     * scene in everything it reads — its fog, its background, its hooks, how
     * each object is drawn — but for the units the stand-ins draw entirely
     * (away), which are left out of it. Three goes into every object handed
     * it to find what to draw, shown or not, on the camera's layer or not,
     * and the stand-ins' real meshes are off that layer but not hidden:
     * Ladonia's editor has 10,600 objects shown, of which three draws from
     * fewer than a thousand, and going into them was a third of three's own
     * time once the walk of their matrices was gone (hold). Each group the
     * units hang in stands in for itself here by an object made from it
     * (proxyOf) with only those of its children three is to go into, kept in
     * step with it (sortDrawn). Its matrices are the scene's, worked out here
     * (held: of what moves alone). Null when nothing is held.
     */
    drawnScene() {
        if (!this.holding || !this.active || !this.drawn) return null;
        this.scene.updateMatrixWorld();
        return this.drawn;
    }

    /**
     * Each frame, once the stand-ins are as they will be drawn: the units
     * whose meshes have been taken into or out of the stand-ins since (or
     * that hang a light) judged again (awayOf), and the drawn scene's groups'
     * children sorted again if a unit has come or gone or been found the
     * stand-ins' entirely or not, or a group's children have changed at all.
     */
    sortDrawn() {
        for (const unit of this.awayDirty) {
            if (this.units.get(unit.root) !== unit) continue;
            const away = this.awayOf(unit);
            if (away === unit.away) continue;
            unit.away = away;
            this.drawStale = true;
        }
        this.awayDirty.clear();
        const list = this.groupList;
        let stale = this.drawStale;
        for (let g = 0; g < list.length && !stale; g++) {
            const children = list[g].node.children;
            const sources = list[g].sources;
            if (children.length !== sources.length) stale = true;
            for (let i = 0; i < children.length && !stale; i++) if (children[i] !== sources[i]) stale = true;
        }
        if (!stale) return;
        this.drawStale = false;
        for (let g = 0; g < list.length; g++) {
            const { node, proxy, sources } = list[g];
            const children = node.children;
            const into = proxy.children;
            into.length = 0;
            sources.length = 0;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                sources.push(child);
                if (this.units.get(child)?.away) continue;
                into.push(this.groups.get(child)?.proxy ?? child);
            }
        }
    }

    /** A mesh drawn by its stand-in (`on`: off the layer the cameras look at), or by itself; its unit judged again before the frame is drawn (sortDrawn). */
    hideItem(item, on) {
        hide(item.mesh, on);
        if (this.holding) this.awayDirty.add(item.unit);
    }

    /** Nothing held still any more: the scene walked by three as it was built, every frame of it worked out now for whatever reads them next. */
    letGo() {
        if (!this.holding) return;
        this.holding = false;
        for (const unit of this.units.values()) {
            this.releaseUnit(unit);
            unit.away = false;
        }
        for (const group of this.groupList) if (group.trs) group.node.matrixAutoUpdate = true;
        this.groups.clear();
        this.groupList = [];
        this.awayDirty.clear();
        this.drawn = null;
        this.group.matrixAutoUpdate = true;
        this.group.matrixWorldAutoUpdate = true;
        this.scene.updateMatrixWorld(true);
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
                /** The parts that open under a piece, each `{ node, trs, first, rest, part, shut }` (scan, atRest). */
                movers: [],
                /** The sashes hung in a wall, each `{ sash, shut }`: merged with it while shut. */
                sashes: [],
                /** Drawn whole (drawWhole): the model it is drawn by, how (LOOSE, WHOLE, LIFTED), its own meshes while LIFTED, and whether it is in the view. */
                model: null,
                modelKey: null,
                modelStale: true,
                mode: LOOSE,
                own: null,
                recast: false,
                seen: true,
                sphereStale: true,
                instanceable: false,
                sx: 0,
                sy: 0,
                sz: 0,
                sr: 0,
                children: -1,
                trs: new Float64Array(10),
                /** Held still (hold), and passed over by three's walk because of it (holdUnit). */
                held: false,
                passed: false,
                /** Drawn entirely by the stand-ins, and so left out of what three is handed to draw (drawnScene); what of it draws itself whatever they do (scan), and its lights. */
                away: false,
                foreign: 0,
                lights: [],
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
            this.containersStale = true;
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
        if (this.holding && !unit.held) this.holdUnit(unit);
        if (root.children.length !== unit.children) {
            this.scan(unit);
            // (Held, what has come into it is placed here: a model arriving, a piece's parts taken on.)
            if (unit.passed) root.updateMatrixWorld(true);
        }
        // Moved: a piece put somewhere else, a flight slid along. (The rest of the building is built again, never moved: a
        // new group, and a new unit. Held, it is not looked at for it either: out of three's walk, that look would be the
        // one read of its position, turn and scale a frame — for Ladonia's 650 such units a quarter of a millisecond.)
        if (unit.moves && movedTRS(root, unit.trs)) {
            root.updateMatrixWorld(true);
            this.moved(unit, now);
        }
        // Whether a part of a piece, or a sash of a wall, has been opened or shut since: what of it is drawn whole, or merged, then changes.
        let shifted = false;
        for (const mover of unit.movers) {
            const moved = movedTRS(mover.node, mover.trs);
            if (moved) {
                mover.node.updateMatrixWorld(true);
                this.moved(unit, now);
            }
            // (Looked at again as it moves — and, until its rest pose is known, every frame.)
            if (moved || !mover.part) {
                const shut = this.atRest(mover);
                if (shut !== mover.shut) {
                    mover.shut = shut;
                    shifted = true;
                }
            }
        }
        for (const entry of unit.sashes) {
            const shut = sashShut(entry.sash);
            if (shut !== entry.shut) {
                entry.shut = shut;
                shifted = true;
            }
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
                // (A piece drawn whole is drawn whole only with every mesh of it shown: its model again.)
                if (shown !== item.shown) unit.modelStale = true;
                item.shown = shown;
            }
            if (adrift) this.scan(unit);
        } else if (!shifted && out === unit.out && (merged || out)) {
            // Between looks nothing of a unit changes but whether it is drawn at all — and, of a piece of furniture drawn, which of its instances are in the view.
            return;
        }
        // A piece whose parts open, drawn whole while it can be.
        if (unit.movers.length && this.drawWhole(unit, out || !this.mergesShut, shifted)) {
            unit.out = out;
            return;
        }
        unit.out = out;
        const planes = this.planes;
        const sighted = this.sighted;
        for (const item of unit.list) {
            // (A wall's sash: merged with it while it is shut.)
            const want = !out && item.shown && item.kind !== NONE && (item.sash === null || (this.mergesShut && sashShut(item.sash)));
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
        if (this.dirtyModels.size) {
            for (const model of this.dirtyModels) if (this.models.get(model.key) === model) this.packModel(model);
            this.dirtyModels.clear();
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
     * (World/Openables.js) — is watched for moving (`movers`), each mesh
     * knowing which part it is of; so is a window's sash in its wall
     * (`sashes`: World/Sash.js), whose frame is merged with the wall while
     * it is shut. A wall's door leaves are left to draw themselves.
     */
    scan(unit, quiet = false) {
        const root = unit.root;
        const before = unit.items.size;
        unit.children = root.children.length;
        unit.scanned = (unit.scanned ?? 0) + 1;
        const mark = unit.scanned;
        let fresh = 0;
        const movers = [];
        const sashes = [];
        const instanced = unit.kind === INSTANCE;
        // What of it draws itself whatever the stand-ins do — left to itself here, or not a mesh — and its lights: while
        // there is any, three is handed the unit to draw (away).
        let foreign = 0;
        const lights = [];
        const visit = (node, mover, sash) => {
            const data = node.userData;
            if (node !== root && data) {
                if (data.helper || data.kind === "person") return void foreign++;
                if (data.opens !== undefined) {
                    if (!instanced) return void foreign++;
                    mover = movers.length;
                    movers.push(node);
                } else if (!instanced && sash === null && data.sash) {
                    sash = data.sash;
                    sashes.push(sash);
                } else if (!instanced && sash === null && (data.doorLeaf || data.hingeSide !== undefined)) return void foreign++;
            }
            if (node.isLight) lights.push(node);
            else if (node.isLine || node.isPoints || node.isSprite) foreign++;
            if (node.isMesh) {
                let item = unit.items.get(node);
                if (!item) {
                    item = { unit, mesh: node, kind: NONE, material: undefined, geometry: undefined, in: false, cast: false, mover: -1, sash: null, parts: null, cache: null, batch: null, pv: 0, uvv: 0, mark: 0, shown: false, seen: true, stale: true, sx: 0, sy: 0, sz: 0, sr: 0 };
                    unit.items.set(node, item);
                    fresh++;
                }
                item.mark = mark;
                item.mover = mover;
                item.sash = sash;
            }
            const children = node.children;
            for (let i = 0; i < children.length; i++) visit(children[i], mover, sash);
        };
        visit(root, -1, null);
        unit.foreign = foreign;
        unit.lights = lights;
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
        // (Looked through again: whether it is the stand-ins' entirely judged again before the frame is drawn, sortDrawn.)
        if (this.holding) this.awayDirty.add(unit);
        if (fresh || gone || !quiet) {
            unit.list = [...unit.items.values()];
            // Where each mesh stands, before anything is copied from it: three places a new object when it next draws.
            if (fresh) root.updateWorldMatrix(true, true);
            this.done.scans++;
        }
        if (fresh || gone) unit.modelStale = true;
        if (movers.length !== unit.movers.length || movers.some((node, i) => unit.movers[i].node !== node)) {
            unit.movers = movers.map((node) => {
                const trs = new Float64Array(10);
                readTRS(node, trs);
                // `first`: where it stood when first seen — shut, as a model arrives — its rest until its part says (atRest).
                const mover = { node, trs, first: trs.slice(), rest: null, part: null, shut: true };
                mover.shut = this.atRest(mover);
                return mover;
            });
            unit.modelStale = true;
        }
        if (sashes.length !== unit.sashes.length || sashes.some((sash, i) => unit.sashes[i].sash !== sash)) {
            unit.sashes = sashes.map((sash) => ({ sash, shut: sashShut(sash) }));
        }
    }

    /**
     * Whether a part of a piece stands as it does shut — its Openable's rest
     * pose (World/Openables.js), to the last digit: an Openable puts it back
     * there exactly when it shuts (Openable.update). Until the piece's parts
     * are taken on, a frame or two after its model arrives, as it was first
     * seen. Read from `trs`, where it stands now.
     */
    atRest(mover) {
        if (!mover.part) {
            const part = this.builder.openables?.byNode.get(mover.node) ?? null;
            if (part) {
                const { restPosition: p, restQuaternion: q } = part;
                const s = mover.node.scale;
                mover.part = part;
                mover.rest = Float64Array.of(p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z);
            }
        }
        const rest = mover.rest ?? mover.first;
        const trs = mover.trs;
        for (let i = 0; i < 10; i++) if (trs[i] !== rest[i]) return false;
        return true;
    }

    /** A unit has moved (a piece put somewhere else, a flight slid along): its instances' matrices again; its merged triangles, once it stands still. */
    moved(unit, now) {
        if (unit.kind === INSTANCE) {
            for (const item of unit.list) {
                item.stale = true;
                if (item.batch) this.dirtyBatches.add(item.batch);
            }
            // Drawn whole: where its model is drawn, and what of the view it is in (drawWhole).
            unit.sphereStale = true;
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
        // (Its root may come back — an edit undone puts the same group back — and is walked and drawn by three until it does.)
        this.releaseUnit(unit);
        this.containersStale = true;
        this.drawStale = true;
        this.loosen(unit);
        this.adopt(unit, null);
        for (const item of unit.list) this.forget(item);
        this.units.delete(unit.root);
    }

    /** A mesh no longer the builder's: out of its bucket or batch, and in sight again (it may be drawn elsewhere yet). */
    forget(item) {
        if (item.cast) {
            item.cast = false;
            this.hideItem(item, false);
        }
        if (item.in) this.put(item, false);
        this.leave(item);
        item.cache = null;
    }

    /** A mesh wears other materials or another geometry than it did: what can stand in for it now, if anything. */
    refresh(item) {
        const mesh = item.mesh;
        const sameGeometry = mesh.geometry === item.geometry && item.cache && mesh.geometry.attributes.position.version === item.pv && (mesh.geometry.attributes.uv?.version ?? 0) === item.uvv;
        // (Of a piece drawn whole: its model is no longer what the piece is made of.)
        item.unit.modelStale = true;
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
        if (this.active) this.hideItem(item, on && !item.batch?.single);
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
            this.hideItem(entries[0], false);
            return;
        }
        if (batch.single) {
            batch.single = false;
            if (this.active) for (const item of entries) this.hideItem(item, item.in);
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
    // Whole: a piece whose parts open
    // ------------------------------------------------------------------

    /**
     * A piece whose parts open, drawn whole — by its model, every part shut
     * (`WHOLE`), or whole but for the parts lifted out of it (`LIFTED`) — or,
     * false, not: selected or being moved (`out`), something of it hidden,
     * nothing in it a stand-in can draw, or placed mirrored or sheared, which
     * an instance's matrix cannot light rightly. Then it is drawn mesh by
     * mesh, as any other piece is.
     *
     * @param {object} unit
     * @param {boolean} out  whether it is to be drawn as itself this frame
     * @param {boolean} shifted  whether one of its parts has been opened or shut since the last frame
     */
    drawWhole(unit, out, shifted) {
        const model = out ? null : this.modelOf(unit);
        if (model && unit.sphereStale) this.placeWhole(unit, model);
        if (!model || !unit.instanceable) {
            if (unit.mode !== LOOSE) this.loosen(unit);
            return false;
        }
        let mode = WHOLE;
        for (const mover of unit.movers) {
            if (!mover.shut) {
                mode = LIFTED;
                break;
            }
        }
        if (mode !== unit.mode || shifted || unit.recast) this.cast(unit, model, mode);
        // In the view or out of it, as a whole, by the sphere round its model where it stands (what is lifted out of it is culled by three, as any mesh is).
        if (mode === WHOLE) {
            let seen = true;
            if (this.sighted) {
                const planes = this.planes;
                const reach = -unit.sr;
                for (let i = 0; i < 24; i += 4) {
                    if (planes[i] * unit.sx + planes[i + 1] * unit.sy + planes[i + 2] * unit.sz + planes[i + 3] < reach) {
                        seen = false;
                        break;
                    }
                }
            }
            if (seen !== unit.seen) {
                unit.seen = seen;
                this.dirtyModels.add(model);
            }
        }
        return true;
    }

    /**
     * A piece's meshes drawn by its model (WHOLE), or by its model but for
     * the parts lifted out, which draw themselves (LIFTED): each mesh the
     * model has, out of whatever batch it was instanced in and out of the
     * cameras' sight; each lifted, in it again.
     */
    cast(unit, model, mode) {
        unit.recast = false;
        const movers = unit.movers;
        for (const item of unit.list) {
            const drawn = item.kind !== NONE && (item.mover < 0 || movers[item.mover].shut);
            if (drawn === item.cast && !item.in) continue;
            // (Not drawn by a batch of its own either way: by the model, or as itself.)
            if (item.in) this.put(item, false);
            this.leave(item);
            if (drawn === item.cast) continue;
            item.cast = drawn;
            this.hideItem(item, drawn);
        }
        if (mode === WHOLE) {
            this.releaseOwn(unit);
            if (!model.whole.has(unit)) {
                model.whole.add(unit);
                this.dirtyModels.add(model);
            }
        } else {
            if (model.whole.delete(unit)) this.dirtyModels.add(model);
            this.lift(unit, model);
            this.done.lifts++;
        }
        unit.mode = mode;
    }

    /** A piece drawn mesh by mesh again (LOOSE): every mesh its model drew in the cameras' sight, for the loop that follows to put each where it goes. */
    loosen(unit) {
        if (unit.model?.whole.delete(unit)) this.dirtyModels.add(unit.model);
        this.releaseOwn(unit);
        for (const item of unit.list) {
            if (!item.cast) continue;
            item.cast = false;
            this.hideItem(item, false);
        }
        unit.mode = LOOSE;
    }

    /**
     * The model a piece is drawn whole by, as it is made now: looked up by
     * what it is made of (keyOf) — every piece placed from one file, wearing
     * the same finishes, has the same — and made the first time; or null,
     * where it cannot be drawn whole.
     */
    modelOf(unit) {
        if (unit.modelStale) {
            unit.modelStale = false;
            unit.recast = true;
            const key = this.keyOf(unit);
            unit.modelKey = key;
            this.adopt(unit, key === null ? null : this.models.get(key) ?? this.buildModel(unit, key));
        }
        return unit.model;
    }

    /** A piece's model from now on (or none): its own meshes, which are its last model's, let go — and that model too, with no other piece drawn by it. */
    adopt(unit, model) {
        const was = unit.model;
        if (was === model) return;
        this.releaseOwn(unit);
        if (was) {
            if (was.whole.delete(unit)) this.dirtyModels.add(was);
            was.units.delete(unit);
            if (!was.units.size) this.dropModel(was);
        }
        unit.model = model;
        unit.sphereStale = true;
        if (model) model.units.add(unit);
    }

    /**
     * What a piece drawn whole is made of, said so that two pieces placed
     * from one file say the same: each mesh a stand-in can draw — its
     * geometry, its materials, the part it is of and its place in the piece
     * with every part shut (localOf). Null where one of them is hidden, or
     * there is none.
     */
    keyOf(unit) {
        const restOf = restsOf(unit);
        const words = [];
        for (const item of unit.list) {
            if (item.kind === NONE) continue;
            if (!item.shown) return null;
            const mesh = item.mesh;
            const materials = Array.isArray(mesh.material) ? mesh.material.map((material) => material.id).join("+") : mesh.material.id;
            words.push(`${mesh.geometry.id}:${materials}:${item.mover}:${localOf(mesh, unit.root, restOf).elements.join(",")}`);
        }
        return words.length ? words.join("|") : null;
    }

    /**
     * A piece's model: every mesh of it a stand-in can draw, its parts shut,
     * copied into the piece's own frame and merged a material at a time —
     * each a mesh drawn where each piece drawn by it stands (packModel).
     * Each part's triangles stay together in it (`ranges`, by the part's
     * place among its piece's), so a piece with a part lifted out draws the
     * rest of them by an index of its own (lift).
     */
    buildModel(unit, key) {
        const restOf = restsOf(unit);
        const groups = new Map();
        for (const item of unit.list) {
            if (item.kind === NONE) continue;
            const mesh = item.mesh;
            const geometry = mesh.geometry;
            const local = localOf(mesh, unit.root, restOf);
            const list = Array.isArray(mesh.material);
            const materials = list ? mesh.material : [mesh.material];
            const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
            // As three draws it: a list of materials by the geometry's groups, one material the whole of it.
            const ranges = list ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
            for (const range of ranges) {
                const material = materials[range.materialIndex ?? 0];
                if (!material) continue;
                const names = attributesFor(material, geometry);
                const copy = copyRange(geometry, range.start, range.count, local, names);
                this.done.extracts++;
                if (!copy) continue;
                const signature = `${material.id}|${names.join()}`;
                let group = groups.get(signature);
                if (!group) groups.set(signature, (group = { material, names, receive: mesh.receiveShadow, pieces: [] }));
                group.pieces.push({ geometry: copy, mover: item.mover });
            }
        }
        if (!groups.size) return null;
        const model = { key, buckets: [...groups.values()].map(joinModel), units: new Set(), whole: new Set(), sphere: null };
        model.sphere = sphereOf(...model.buckets.map((bucket) => bucket.geometry.attributes.position.array));
        this.models.set(key, model);
        this.done.made++;
        return model;
    }

    /** Where a piece drawn whole stands now: the sphere round its model there, for the view to cull it by, whether an instance can be lit there, and its model's meshes moved with it. */
    placeWhole(unit, model) {
        unit.sphereStale = false;
        const world = unit.root.matrixWorld;
        _sphere.copy(model.sphere).applyMatrix4(world);
        unit.sx = _sphere.center.x;
        unit.sy = _sphere.center.y;
        unit.sz = _sphere.center.z;
        unit.sr = _sphere.radius;
        unit.instanceable = instanceable(world);
        if (unit.mode === WHOLE) this.dirtyModels.add(model);
        if (unit.own) {
            for (const mesh of unit.own) placeAt(mesh, world);
        }
    }

    /**
     * A piece with parts lifted out of it: its model drawn as a mesh of its
     * own a material, where it stands, by an index of its own — every
     * triangle but those of its parts lifted out, which draw themselves. The
     * vertices are the model's, shared: nothing is copied but the index.
     */
    lift(unit, model) {
        const movers = unit.movers;
        if (!unit.own) {
            unit.own = model.buckets.map((bucket) => {
                const geometry = new THREE.BufferGeometry();
                for (const [name, attribute] of Object.entries(bucket.geometry.attributes)) geometry.setAttribute(name, attribute);
                geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bucket.geometry.index.count), 1));
                geometry.boundingSphere = bucket.geometry.boundingSphere;
                const mesh = this.addStandIn(new THREE.Mesh(geometry, bucket.material), bucket);
                placeAt(mesh, unit.root.matrixWorld);
                return mesh;
            });
        }
        model.buckets.forEach((bucket, b) => {
            const mesh = unit.own[b];
            const from = bucket.geometry.index.array;
            const index = mesh.geometry.index;
            let n = 0;
            for (const { mover, start, count } of bucket.ranges) {
                if (mover >= 0 && !movers[mover].shut) continue;
                index.array.set(from.subarray(start, start + count), n);
                n += count;
            }
            mesh.geometry.setDrawRange(0, n);
            index.needsUpdate = true;
            mesh.visible = n > 0;
        });
    }

    /** A piece's own meshes let go, once nothing of it is lifted out: their indices — not their vertices, which are their model's and drawn still. */
    releaseOwn(unit) {
        if (!unit.own) return;
        for (const mesh of unit.own) {
            this.group.remove(mesh);
            // (Disposing a geometry lets go of every attribute it holds, on the GPU: the shared ones taken off it first.)
            const geometry = mesh.geometry;
            for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
            geometry.dispose();
        }
        unit.own = null;
    }

    /**
     * A model's meshes for the pieces drawn whole by it now: the one piece's
     * own, where it stands — as a mesh that is the only one of its kind
     * draws itself, with the shader it always had — or, for more, an
     * instance each of those in the view.
     */
    packModel(model) {
        const units = model.whole;
        const alone = units.size === 1 ? units.values().next().value : null;
        for (const bucket of model.buckets) {
            if (alone) {
                this.retireWhole(bucket, "instanced");
                bucket.plain ??= this.addStandIn(new THREE.Mesh(bucket.geometry, bucket.material), bucket);
                placeAt(bucket.plain, alone.root.matrixWorld);
                // (Out of the view as a whole, passed over at once; in it, three culls each material's mesh by its own sphere.)
                bucket.plain.visible = alone.seen;
                continue;
            }
            this.retireWhole(bucket, "plain");
            if (!units.size) {
                this.retireWhole(bucket, "instanced");
                continue;
            }
            if (units.size > bucket.capacity) {
                this.retireWhole(bucket, "instanced");
                // Room for the next of its kind.
                bucket.capacity = Math.ceil(units.size * 1.5);
                const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.capacity);
                // Each piece is culled here, by the view (drawWhole): what is left is in it.
                mesh.frustumCulled = false;
                bucket.instanced = this.addStandIn(mesh, bucket);
            }
            const mesh = bucket.instanced;
            const array = mesh.instanceMatrix.array;
            let n = 0;
            for (const unit of units) {
                if (!unit.seen) continue;
                unit.root.matrixWorld.toArray(array, n * 16);
                n++;
            }
            mesh.count = n;
            mesh.visible = n > 0;
            mesh.instanceMatrix.needsUpdate = true;
        }
        this.done.packs++;
    }

    addStandIn(mesh, bucket) {
        mesh.name = `stand-in:${bucket.name}`;
        mesh.userData = { helper: true, standIn: true };
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = bucket.receive;
        mesh.castShadow = false;
        this.group.add(mesh);
        return mesh;
    }

    /** One of a model's meshes for a material — its `plain` one or its `instanced` — out of the scene. */
    retireWhole(bucket, which) {
        const mesh = bucket[which];
        if (!mesh) return;
        this.group.remove(mesh);
        if (mesh.isInstancedMesh) {
            mesh.dispose();
            bucket.capacity = 0;
        }
        bucket[which] = null;
    }

    /** A model no piece is drawn by any more, let go. */
    dropModel(model) {
        for (const bucket of model.buckets) {
            this.retireWhole(bucket, "plain");
            this.retireWhole(bucket, "instanced");
            bucket.geometry.dispose();
        }
        if (this.models.get(model.key) === model) this.models.delete(model.key);
        this.dirtyModels.delete(model);
    }

    // ------------------------------------------------------------------

    /** What there is now, for measuring. */
    stats() {
        const out = { enabled: this.enabled, active: this.active, waiting: this.waiting ?? 0, units: this.units.size, meshes: 0, merged: 0, instanced: 0, alone: 0, asThemselves: 0, hidden: 0, buckets: this.buckets.size, batches: 0, bucketTriangles: 0, instances: 0, ...this.done };
        // Of the pieces whose parts open: how many drawn whole, how many with parts lifted out, their meshes drawn by models, and the models' meshes drawn.
        Object.assign(out, { wholes: 0, lifted: 0, cast: 0, models: this.models.size, modelMeshes: 0, modelInstances: 0 });
        for (const unit of this.units.values()) {
            if (unit.mode === WHOLE) out.wholes++;
            else if (unit.mode === LIFTED) out.lifted++;
            for (const item of unit.list) {
                out.meshes++;
                if (item.cast) out.cast++;
                else if (item.in) out[item.kind === MERGE ? "merged" : item.batch?.single ? "alone" : "instanced"]++;
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
        for (const model of this.models.values()) {
            for (const bucket of model.buckets) {
                if (bucket.plain) out.modelMeshes++;
                if (bucket.instanced) {
                    out.modelMeshes++;
                    out.modelInstances += bucket.instanced.count;
                }
            }
        }
        return out;
    }

    dispose() {
        this.setActive(false);
        this.enabled = false;
        for (const name of WORLD_EVENTS) this.world.removeListener(name, this.hear);
        if (this.heard) for (const name of EDITOR_EVENTS) this.heard.removeListener(name, this.hear);
        for (const unit of this.units.values()) this.releaseOwn(unit);
        for (const model of [...this.models.values()]) this.dropModel(model);
        for (const bucket of this.buckets.values()) bucket.mesh.geometry.dispose();
        for (const batch of this.batches.values()) batch.mesh?.dispose();
        this.scene.remove(this.group);
        this.units.clear();
        this.buckets.clear();
        this.batches.clear();
    }
}

/** The sphere round a bucket's vertices (x, y, z in a row), every part's, shown or not: what three culls the bucket by — or round several such rows at once (a model's, a material each). */
function sphereOf(...rows) {
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (const positions of rows) {
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
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    let most = 0;
    for (const positions of rows) {
        for (let i = 0; i < positions.length; i += 3) {
            const dx = positions[i] - cx;
            const dy = positions[i + 1] - cy;
            const dz = positions[i + 2] - cz;
            const d = dx * dx + dy * dy + dz * dz;
            if (d > most) most = d;
        }
    }
    return new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(most));
}

/** Each part of a piece and the pose it stands in shut — its rest, or as first seen (StandIns.atRest) — as ten numbers: what its model is made with. */
function restsOf(unit) {
    return new Map(unit.movers.map((mover) => [mover.node, mover.rest ?? mover.first]));
}

const _link = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * A mesh's frame in its piece's, every part of the piece shut (`restOf`):
 * from each node's own position, turn and scale down from the piece, as
 * three makes its matrices — not from the world's, which two pieces placed
 * from one file in two places come to by two different sums. So both come
 * to the same numbers, and to one model.
 */
function localOf(mesh, root, restOf) {
    const chain = [];
    for (let node = mesh; node && node !== root; node = node.parent) chain.push(node);
    const matrix = new THREE.Matrix4();
    for (let i = chain.length - 1; i >= 0; i--) {
        const node = chain[i];
        const rest = restOf.get(node);
        if (rest) _link.compose(_p.set(rest[0], rest[1], rest[2]), _q.set(rest[3], rest[4], rest[5], rest[6]), _s.set(rest[7], rest[8], rest[9]));
        else _link.compose(node.position, node.quaternion, node.scale);
        matrix.multiply(_link);
    }
    return matrix;
}

/**
 * The pieces of a model of one material (StandIns.buildModel) in a row, as
 * one geometry — and where each part's triangles are in its index
 * (`ranges`: `{ mover, start, count }`, the part's place among its piece's,
 * -1 for what does not move).
 */
function joinModel({ material, names, receive, pieces }) {
    let vertices = 0;
    let indices = 0;
    for (const { geometry } of pieces) {
        vertices += geometry.attributes.position.count;
        indices += geometry.index.count;
    }
    const geometry = new THREE.BufferGeometry();
    for (const name of names) {
        const size = pieces[0].geometry.attributes[name].itemSize;
        const array = new Float32Array(vertices * size);
        let at = 0;
        for (const piece of pieces) {
            array.set(piece.geometry.attributes[name].array, at);
            at += piece.geometry.attributes.position.count * size;
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    const index = new Uint32Array(indices);
    const ranges = [];
    let v = 0;
    let i = 0;
    for (const piece of pieces) {
        const from = piece.geometry.index.array;
        for (let k = 0; k < from.length; k++) index[i + k] = from[k] + v;
        const last = ranges[ranges.length - 1];
        if (last && last.mover === piece.mover) last.count += from.length;
        else ranges.push({ mover: piece.mover, start: i, count: from.length });
        v += piece.geometry.attributes.position.count;
        i += from.length;
        piece.geometry.dispose();
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.boundingSphere = sphereOf(geometry.attributes.position.array);
    return { material, names, geometry, ranges, receive, name: material.name || material.type, plain: null, instanced: null, capacity: 0 };
}

/** Whether a piece placed so (its world matrix) can be drawn as an instance: its three axes square to each other, and not mirrored — as an instance is lit through them (kindOf). */
function instanceable(matrix) {
    matrix.extractBasis(_a, _b, _c);
    if (matrix.determinant() <= 0) return false;
    const skew = 1e-4;
    return !(Math.abs(_a.dot(_b)) > skew * _a.length() * _b.length() || Math.abs(_a.dot(_c)) > skew * _a.length() * _c.length() || Math.abs(_b.dot(_c)) > skew * _b.length() * _c.length());
}

/** Whether a window's sash is shut, and still (World/Sash.js): its frame then where it was merged with its wall's. */
function sashShut(sash) {
    return sash.open === 0 && sash.target === 0;
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

/**
 * A group's stand-in in what three is handed to draw (StandIns.drawnScene):
 * the group itself in everything three reads of it — made from it
 * (Object.create), so shown, layered, ordered and placed as it is, whatever
 * it becomes — but with children of its own (sortDrawn). The scene's does
 * not walk matrices: drawnScene walks the real scene's. (three keeps a list
 * of what to draw and the lights for each scene it is handed: this one's are
 * its own, made once.)
 */
function proxyOf(group, scene) {
    const proxy = Object.create(group);
    proxy.children = [];
    if (scene) proxy.matrixWorldAutoUpdate = false;
    return proxy;
}

/**
 * A stand-in's frame, in the world: written to its world matrix as well,
 * since the stand-ins' group, which never moves, is passed over by three's
 * walk while the units are held still (hold).
 */
function placeAt(mesh, matrix) {
    mesh.matrix.copy(matrix);
    mesh.matrixWorld.copy(matrix);
    mesh.matrixWorldNeedsUpdate = false;
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

/** Whether the link asks for the pieces whose parts open drawn mesh by mesh, and the sashes by themselves (`?shut=0`), as before 2026-10-16. */
function shutWanted() {
    const asked = new URL(window.location.href).searchParams.get("shut");
    return asked === null || (asked !== "0" && asked !== "false" && asked !== "off");
}

/** Whether the link asks for the scene's frames worked out by three alone, every one at each render, as before 2026-10-17 (`?still=0`). */
function stillWanted() {
    const asked = new URL(window.location.href).searchParams.get("still");
    return asked === null || (asked !== "0" && asked !== "false" && asked !== "off");
}

/** Whether the link asks for the scene drawn as it is built (`?standins=0`). */
function standInsWanted() {
    const asked = new URL(window.location.href).searchParams.get("standins");
    return asked === null || (asked !== "0" && asked !== "false" && asked !== "off");
}

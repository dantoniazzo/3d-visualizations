import * as THREE from "three";
import { EventEmitter } from "events";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import Experience from "../Experience.js";
import EditorCamera from "./EditorCamera.js";
import EditorUI from "./EditorUI.js";
import FieldEdit from "./FieldEdit.js";
import FitChecker from "./FitChecker.js";
import Gizmo from "./Gizmo.js";
import Ghost from "./Ghost.js";
import Snapper, { STEP_UP } from "./Snapper.js";
import Collections, { LEVEL_NAMES } from "./Collections.js";
import TransformSession from "./TransformSession.js";
import { FurnitureEditable, StairEditable, FloorOpeningEditable, WallOpeningEditable, VehicleEditable } from "./Editables.js";
import { DEG, round } from "./axes.js";
import { FINISHES } from "../../../shared/catalog.js";

/**
 * Edit mode: a Blender-style editor over the live scene.
 *
 * The building — walls, slabs, roof — is fixed. Everything else can be
 * selected and moved: furniture (catalogue pieces and the pieces lifted out
 * of an imported house), staircases, the openings in floors that stairs
 * need, doors and windows along their walls, and the car.
 *
 * The view can be narrowed to one floor or one room (the outliner's
 * collections, the header's picker, `/` and Page Up/Down), collections can
 * be hidden with their eye, and X-ray (`Alt Z`) makes walls, ceilings and
 * the roof see-through. Walls never stop a click: whatever is behind one
 * can be selected through it.
 *
 * Tab switches between this and the walkthrough. On the way back the
 * collision octrees are rebuilt from whatever moved, so the player walks
 * into the new layout exactly as it was left.
 *
 * The same editor also works from the walkthrough, with the crosshair as
 * its cursor (FieldEdit): input and drawing then go through the player's
 * camera, and the collision is rebuilt when the selection is let go.
 *
 * The visitor can walk in edit mode too, relative to where its view looks:
 * WASD while nothing is selected (with a selection they are Blender's
 * keys), the arrows at any time.
 *
 * Emits "mode" ("edit" | "walk"), "selection", "changed" (the outliner's
 * contents) and "edited" (something worth saving).
 */

const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

export default class Editor extends EventEmitter {
    constructor() {
        super();
        this.experience = new Experience();
        this.world = this.experience.world;
        this.builder = this.world.sceneBuilder;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;
        this.cameraRig = this.experience.camera;

        this.active = false;
        this.tool = "move";
        this.orientation = "global";
        this.snapEnabled = true;
        this.increment = 0.1;
        this.angleIncrement = 15;
        /** One floor or room to work on alone, or null for everything. */
        this.focus = null;
        /** Collections switched off in the outliner: "level:0", "room:id", "outside", "roof". */
        this.hiddenCollections = new Set();
        this.xray = false;
        this.xrayed = new Set();
        this.xrayMaterials = new Map();
        this.trackpad = readPreference("trackpad", false);

        this.selection = null;
        this.session = null;
        this.nav = null;
        this.pending = null;
        this.lastPointer = { x: 0, y: 0 };
        this.shift = false;

        this.history = { undo: [], redo: [] };
        this.editables = new Map();
        this.owners = new WeakMap();
        this.holeHelpers = new Map();

        this.view = new EditorCamera(this.cameraRig, this.experience.sizes);
        this.cameraRig.editorView = this.view;

        this.overlay = new THREE.Scene();
        this.gizmo = new Gizmo(this.overlay);
        this.ghost = new Ghost(this.scene);
        this.fit = new FitChecker(this);
        this.snapper = new Snapper(this);
        this.collections = new Collections(this.builder);

        this.helpers = new THREE.Group();
        this.helpers.name = "editor-helpers";
        this.helpers.visible = false;
        this.helpers.userData.helper = true;
        this.scene.add(this.helpers);
        this.helperFill = new THREE.MeshBasicMaterial({
            color: 0xffa040,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        this.helperLine = new THREE.LineBasicMaterial({ color: 0xffa040 });

        this.ui = new EditorUI(this);
        this.field = new FieldEdit(this);
        this.refreshRegistry();
        this.bind();

        this.world.on("furniture-ready", () => {
            this.refreshRegistry();
            for (const editable of this.editables.values()) editable.invalidate();
        });
    }

    /** Edit mode opens only once the visitor is actually in the space. */
    get available() {
        return document.body.classList.contains("walkthrough-active");
    }

    /** The camera the pointer is read against: edit mode's, or the player's. */
    get camera() {
        return this.active ? this.view.camera : this.cameraRig.perspectiveCamera;
    }

    /** Whether this frame is the editor's to draw — outline and gizmo. */
    get draws() {
        return this.active || this.field.engaged;
    }

    /** Metres per screen pixel at a distance from a camera. */
    worldPerPixel(camera, distance) {
        if (this.active) return this.view.worldPerPixel(distance);
        const height = this.experience.sizes.height || 1;
        return (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
    }

    // ------------------------------------------------------------------
    // Modes
    // ------------------------------------------------------------------

    setMode(mode) {
        if (mode === "edit") this.enter();
        else this.leave();
    }

    enter() {
        if (this.active || !this.available) return;
        const player = this.world.player;
        // A move begun from the walkthrough is dropped; its selection comes along.
        this.field.reset();

        player?.setEnabled(false);
        // Walking goes on here, steered by this view rather than the head.
        player?.setRemote(() => this.view.theta);
        this.walked = false;
        this.cameraRig.releaseLock();

        this.active = true;
        document.body.classList.add("mode-edit");
        this.savedFog = this.scene.fog;
        this.scene.fog = null;
        this.helpers.visible = true;

        // Start from where the visitor is standing, a few metres back and up.
        const camera = this.cameraRig.perspectiveCamera;
        const look = camera.getWorldDirection(new THREE.Vector3()).setY(0);
        if (look.lengthSq() < 1e-6) look.set(0, 0, -1);
        look.normalize();
        const target = player
            ? player.player.collider.start.clone().add(new THREE.Vector3(0, 0.6, 0)).addScaledVector(look, 2.5)
            : new THREE.Vector3();
        const position = target.clone().addScaledVector(look, -7).add(new THREE.Vector3(0, 5.5, 0));
        this.view.activate({ position, target });

        this.refreshRegistry();
        this.applyVisibility();
        this.ui.show();
        this.emit("mode", "edit");
        this.world.emit("mode", "edit");
    }

    leave() {
        if (!this.active) return;
        if (this.session) this.endSession(this.session.cancel());
        this.nav = null;
        this.pending = null;
        // Back to walking: a selection would hold the visitor still.
        this.select(null);

        this.active = false;
        document.body.classList.remove("mode-edit");
        this.applyVisibility();
        this.helpers.visible = false;
        this.gizmo.configure(null);
        this.ghost.reset();
        this.scene.fog = this.savedFog ?? this.scene.fog;

        // Whatever moved is walked into from here on.
        this.builder.refreshCollision();

        this.view.deactivate();
        const player = this.world.player;
        player?.setRemote(null);
        // Walked here: carry on looking the way this view did.
        if (this.walked && this.cameraRig.angles) this.cameraRig.angles.horizontal = this.view.theta;
        player?.setEnabled(true);
        this.ui.hide();
        this.cameraRig.requestLock();
        this.emit("mode", "walk");
        this.world.emit("mode", "walk");
    }

    /** Stand the visitor on the floor in the middle of the view and walk. */
    walkFromHere() {
        const hit = this.surfaceUnder({ x: 0, y: 0 }, true);
        const player = this.world.player;
        if (hit && player) {
            const yaw = (this.view.theta + Math.PI) / DEG;
            player.teleport({ position: hit.toArray(), yaw });
        } else {
            this.ui.toast("Point the view at a floor to walk from there", "warn");
            return;
        }
        this.leave();
    }

    // ------------------------------------------------------------------
    // Registry
    // ------------------------------------------------------------------

    /**
     * Mirror the scene's editable content as Editable objects, keeping the
     * existing ones (and the selection) where their key survives.
     */
    refreshRegistry() {
        const b = this.builder;
        const next = new Map();
        const keep = (key, make) => {
            const existing = this.editables.get(key);
            next.set(key, existing && make.reuse(existing) ? existing : make.create());
        };

        for (const entry of b.furniture.values()) {
            keep(`furniture:${entry.placement.id}`, {
                reuse: (e) => e.entry === entry,
                create: () => new FurnitureEditable(this, entry),
            });
        }
        for (const entry of b.stairs.values()) {
            if (entry.locked) continue;
            keep(`stair:${entry.spec.id}`, {
                reuse: (e) => e.entry === entry,
                create: () => new StairEditable(this, entry),
            });
        }
        if (!b.isModelScene) {
            for (const hole of b.spec.floor_openings) {
                const helper = this.holeHelper(hole);
                keep(`hole:${hole.id}`, {
                    reuse: (e) => e.hole === hole,
                    create: () => new FloorOpeningEditable(this, hole, helper),
                });
            }
            for (const wall of b.spec.walls) {
                for (const opening of wall.openings) {
                    keep(`opening:${wall.id}/${opening.id}`, {
                        reuse: (e) => e.opening === opening && e.wall === wall,
                        create: () => new WallOpeningEditable(this, wall, opening),
                    });
                }
            }
        }
        for (const car of b.cars || []) {
            keep(`car:${car.spec.id}`, {
                reuse: (e) => e.car === car,
                create: () => new VehicleEditable(this, car),
            });
        }

        // Helpers for openings that no longer exist.
        for (const [id, helper] of this.holeHelpers) {
            if (!b.spec.floor_openings.some((h) => h.id === id)) {
                this.helpers.remove(helper);
                helper.traverse((o) => (o.isMesh || o.isLineSegments) && o.geometry.dispose());
                this.holeHelpers.delete(id);
            }
        }

        this.editables = next;
        this.owners = new WeakMap();
        for (const editable of next.values()) {
            if (editable.object3d) this.owners.set(editable.object3d, editable);
        }

        if (this.selection && !next.has(this.selection.key)) this.select(null);
        else if (this.selection) this.selection = next.get(this.selection.key);
        this.emit("changed");
    }

    /** The outline an opening shows in edit mode, made on first use. */
    holeHelper(hole) {
        let helper = this.holeHelpers.get(hole.id);
        if (!helper) {
            helper = new THREE.Group();
            helper.name = `hole-helper:${hole.id}`;
            helper.userData = { helper: true };
            const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
            const fill = new THREE.Mesh(plane, this.helperFill);
            fill.userData = { helper: true, pickable: true };
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(plane), this.helperLine);
            edges.userData = { helper: true };
            helper.add(fill, edges);
            this.helpers.add(helper);
            this.holeHelpers.set(hole.id, helper);
        }
        helper.position.set(hole.position[0], hole.elevation + 0.012, hole.position[1]);
        helper.rotation.set(0, (hole.yaw || 0) * DEG, 0);
        helper.scale.set(hole.width, 1, hole.depth);
        helper.updateMatrixWorld(true);
        return helper;
    }

    /** The editable an object in the scene belongs to, if any. */
    editableFor(object) {
        for (let node = object; node; node = node.parent) {
            const owner = this.owners.get(node);
            if (owner) return owner;
            const data = node.userData || {};
            if (data.kind === "door" && data.wallId) return this.editables.get(`opening:${data.wallId}/${data.id}`) || null;
            if (data.kind === "opening") return this.editables.get(`opening:${data.wallId}/${data.openingId}`) || null;
        }
        return null;
    }

    isInside(object, set) {
        for (let node = object; node; node = node.parent) {
            const owner = this.owners.get(node);
            if (owner) return set.has(owner);
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Scene changes the editables report
    // ------------------------------------------------------------------

    openingsChanged(elevations) {
        this.builder.rebuildRooms(elevations);
        for (const hole of this.builder.spec.floor_openings) {
            if (this.holeHelpers.has(hole.id)) this.holeHelper(hole);
        }
        this.fit.invalidate();
        this.applyVisibility();
    }

    wallChanged(wallId) {
        this.builder.rebuildWall(wallId);
        this.fit.invalidate();
        this.applyVisibility();
    }

    // ------------------------------------------------------------------
    // Selection and picking
    // ------------------------------------------------------------------

    select(editable) {
        if (this.selection === editable) return;
        this.selection = editable || null;
        this.emit("selection", this.selection);
    }

    selectKey(key) {
        const editable = this.editables.get(key);
        if (editable) this.select(editable);
    }

    toNdc(pointer) {
        const rect = this.canvas.getBoundingClientRect();
        return new THREE.Vector2(
            ((pointer.x - rect.left) / rect.width) * 2 - 1,
            -((pointer.y - rect.top) / rect.height) * 2 + 1
        );
    }

    toScreen(point) {
        const rect = this.canvas.getBoundingClientRect();
        const p = point.clone().project(this.camera);
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    }

    pickTargets() {
        const b = this.builder;
        return [b.shell, b.fittings, b.furnitureGroup, b.vehicleGroup, b.model, b.doorAnchors, b.groundPlane, this.helpers].filter(Boolean);
    }

    /**
     * The first visible thing under the pointer that a click should land on.
     *
     * Walls never stop a click, so what is behind one can be selected
     * through it; nor does anything drawn see-through by X-ray. Floors,
     * ceilings and roofs do — otherwise a click on an empty floor would
     * pick up the sofa on the storey below.
     */
    raycast(pointer, ndc = false) {
        _ray.setFromCamera(ndc ? new THREE.Vector2(pointer.x, pointer.y) : this.toNdc(pointer), this.camera);
        for (const hit of _ray.intersectObjects(this.pickTargets(), true)) {
            if (!isShown(hit.object)) continue;
            if (hit.object.userData?.helper && !hit.object.userData.pickable) continue;
            // Cut away by a room focus: not there to be clicked.
            const c = this.clipBox;
            if (c && (hit.point.x < c.x0 || hit.point.x > c.x1 || hit.point.z < c.z0 || hit.point.z > c.z1)) continue;
            if (this.editableFor(hit.object)) return hit;
            if (hit.object.userData?.xray) continue;
            if (hit.face) {
                _v.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
                if (Math.abs(_v.y) < 0.5) continue;
            }
            return hit;
        }
        return null;
    }

    /** The floor level the view is working on, for placing things. */
    focusElevation() {
        const levels = this.builder.levels();
        if (this.focus?.type === "level") return levels[this.focus.level] ?? 0;
        if (this.focus?.type === "room") {
            return this.builder.spec.rooms.find((r) => r.id === this.focus.room)?.elevation ?? 0;
        }
        return 0;
    }

    pick(pointer) {
        const hit = this.raycast(pointer);
        return hit ? this.editableFor(hit.object) : null;
    }

    /** A floor point under the pointer, for adding things and walking from. */
    surfaceUnder(pointer, ndc = false) {
        _ray.setFromCamera(ndc ? new THREE.Vector2(pointer.x, pointer.y) : this.toNdc(pointer), this.camera);
        for (const hit of _ray.intersectObjects(this.pickTargets(), true)) {
            if (!isShown(hit.object) || hit.object.userData?.helper || hit.object.userData?.xray || !hit.face) continue;
            _v.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
            if (Math.abs(_v.y) > 0.7) return hit.point.clone();
        }
        const y = this.focusElevation();
        const point = new THREE.Vector3();
        return _ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), point) ? point : null;
    }

    /** Pieces standing on `editable`, which move when it does. */
    ridersOf(editable) {
        const riders = [];
        const box = editable.worldBox();
        if (box.isEmpty()) return riders;

        for (const other of this.editables.values()) {
            if (other === editable || other.type !== "furniture" || !other.object3d.visible) continue;
            const f = other.footprint();
            if (!f || f.cx < box.min.x || f.cx > box.max.x || f.cz < box.min.z || f.cz > box.max.z) continue;
            const bottom = other.bottom();
            if (bottom < box.min.y + 0.05 || bottom > box.max.y + 0.05) continue;

            _ray.set(new THREE.Vector3(f.cx, bottom + 0.05, f.cz), _down);
            _ray.far = 0.15;
            const hit = _ray.intersectObject(editable.object3d, true)[0];
            _ray.far = Infinity;
            if (hit) riders.push(other);
        }
        return riders;
    }

    // ------------------------------------------------------------------
    // Transform sessions
    // ------------------------------------------------------------------

    startSession(kind, options = {}) {
        const editable = options.editable || this.selection;
        if (!editable || this.session) return null;

        const caps = editable.caps;
        const allowed = kind === "move" ? Boolean(caps.move) : kind === "rotate" ? caps.rotate : Boolean(caps.scale);
        if (!allowed) {
            const what = { move: "moved", rotate: "rotated", scale: "scaled" }[kind];
            this.ui.toast(`${editable.label} can't be ${what}`, "warn");
            return null;
        }

        this.pending = null;
        const before = options.before || this.capture();
        this.session = new TransformSession(this, editable, kind, {
            pointer: options.pointer || this.lastPointer,
            source: options.source || "modal",
            handle: options.handle,
            isNew: options.isNew,
            startRay: options.startRay,
        });
        this.session.before = before;
        this.session.label = options.label || { move: "Move", rotate: "Rotate", scale: "Scale" }[kind];
        this.gizmo.setActive(options.handle || null);
        this.ui.onSession(this.session);
        return this.session;
    }

    onSessionUpdate(session) {
        this.ui.onSessionUpdate(session);
    }

    endSession(result) {
        const session = this.session;
        if (!session) return;
        this.session = null;
        this.ghost.reset();
        this.gizmo.setActive(null);

        if (result === "removed") {
            this.removeEditable(session.editable);
            if (!session.cancelled) this.ui.toast("Nothing placed — there was no room for it there", "warn");
        } else if (result === "changed") {
            this.commit(session.before, session.label);
            if (session.status && !session.status.ok && !session.status.soft) {
                this.ui.toast(`Kept at the last place it fit — ${blockedText(session.status)}`, "warn");
            }
        }
        this.applyVisibility();
        this.ui.onSessionEnd();
    }

    // ------------------------------------------------------------------
    // History
    // ------------------------------------------------------------------

    /** Snapshot of everything the editor can change. */
    capture() {
        const spec = this.builder.spec;
        return structuredClone({
            furniture: spec.furniture,
            stairs: spec.stairs,
            floor_openings: spec.floor_openings,
            walls: Object.fromEntries((spec.walls || []).map((w) => [w.id, w.openings])),
            vehicles: spec.vehicles || [],
        });
    }

    commit(before, label) {
        this.history.undo.push({ state: before, label });
        if (this.history.undo.length > 100) this.history.undo.shift();
        this.history.redo = [];
        this.edited();
    }

    edited() {
        this.builder.markDirty({ objects: true });
        // From the walkthrough, walked into as soon as walking resumes.
        if (!this.active) this.field.settle();
        this.emit("changed");
        this.world.emit("scene-edited");
    }

    undo() {
        const entry = this.history.undo.pop();
        if (!entry) return this.ui.toast("Nothing to undo");
        this.history.redo.push({ state: this.capture(), label: entry.label });
        this.restore(entry.state);
        this.ui.toast(`Undo ${entry.label}`);
    }

    redo() {
        const entry = this.history.redo.pop();
        if (!entry) return this.ui.toast("Nothing to redo");
        this.history.undo.push({ state: this.capture(), label: entry.label });
        this.restore(entry.state);
        this.ui.toast(`Redo ${entry.label}`);
    }

    /** Bring the scene back to a snapshot, rebuilding only what differs. */
    restore(state) {
        const b = this.builder;
        const spec = b.spec;

        // Furniture.
        const wanted = new Map(state.furniture.map((f) => [f.id, f]));
        for (const id of [...b.furniture.keys()]) if (!wanted.has(id)) b.removeFurniture(id);
        for (const f of state.furniture) {
            if (b.furniture.has(f.id)) b.updateFurniture(f.id, { position: f.position, rotation: f.rotation, scale: f.scale });
            else b.addFurniture(structuredClone(f));
        }

        // Stairs.
        const stairs = new Map(state.stairs.map((s) => [s.id, s]));
        for (const [id, entry] of [...b.stairs]) if (!entry.locked && !stairs.has(id)) b.removeStair(id);
        for (const s of state.stairs) {
            const entry = b.stairs.get(s.id);
            if (!entry) b.addStair(structuredClone(s));
            else if (JSON.stringify(entry.spec) !== JSON.stringify(s)) {
                Object.assign(entry.spec, structuredClone(s));
                b.rebuildStair(s.id);
            }
        }

        // Floor openings.
        const holesChanged = JSON.stringify(spec.floor_openings) !== JSON.stringify(state.floor_openings);
        spec.floor_openings = structuredClone(state.floor_openings);
        if (holesChanged) b.rebuildRooms();

        // Doors and windows.
        for (const wall of spec.walls || []) {
            const openings = state.walls[wall.id];
            if (openings && JSON.stringify(openings) !== JSON.stringify(wall.openings)) {
                wall.openings = structuredClone(openings);
                b.rebuildWall(wall.id);
            }
        }

        // The car.
        for (const car of b.cars || []) {
            const saved = state.vehicles.find((v) => v.id === car.spec.id);
            const editable = this.editables.get(`car:${car.spec.id}`);
            if (saved && editable) {
                editable.applyPose({
                    position: new THREE.Vector3(saved.position[0], saved.elevation + editable.rideHeight, saved.position[1]),
                    yaw: saved.yaw * DEG,
                    scale: new THREE.Vector3(1, 1, 1),
                });
            }
        }

        this.fit.invalidate();
        const selected = this.selection?.key;
        this.refreshRegistry();
        for (const editable of this.editables.values()) editable.invalidate();
        if (selected) this.select(this.editables.get(selected) || null);
        this.applyVisibility();
        this.edited();
        this.emit("selection", this.selection);
    }

    // ------------------------------------------------------------------
    // Adding, duplicating, deleting
    // ------------------------------------------------------------------

    newId(prefix) {
        return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    }

    /**
     * Add something where the pointer was when the Add menu opened: a
     * catalogue piece, a staircase or a floor opening. It is dropped at the
     * nearest spot it fits; failing that it follows the cursor until one is
     * found, and cancelling removes it.
     */
    async addObject(kind, catalogId = null, pointer = this.addPointer || this.lastPointer) {
        if (this.session) return;
        // From the walkthrough's Add menu: take the pointer back now, while
        // this is still the click that chose — browsers want a gesture.
        if (!this.active) this.field.resume();
        const before = this.capture();
        const point =
            this.surfaceUnder(pointer) ||
            (this.active ? this.view.target.clone() : this.world.player.player.collider.start.clone());
        const b = this.builder;
        let key;

        if (kind === "furniture") {
            // Wall-hung pieces start at hanging height, not on the floor.
            if (b.furnitureLibrary.getItem(catalogId)?.anchor === "wall") point.y += 1.4;
            const placement = {
                id: this.newId("f"),
                catalog_id: catalogId,
                position: point.toArray().map((n) => round(n)),
                rotation: 0,
                scale: 1,
            };
            const entry = b.addFurniture(placement);
            this.ui.toast("Loading model…");
            await entry.group.userData.ready;
            key = `furniture:${placement.id}`;
        } else if (kind === "stair") {
            const levels = b.levels();
            const base = round(point.y);
            const above = levels.find((l) => l > base + 1.5);
            const rise = round(above !== undefined ? above - base : 2.8);
            const steps = Math.max(3, Math.round(rise / 0.19));
            const run = round(steps * 0.25);
            const stair = {
                id: this.newId("stair"),
                start: [round(point.x), round(point.z - run / 2)],
                direction: "north",
                yaw: 0,
                width: 1.0,
                base_height: base,
                top_height: round(base + rise),
                run,
                steps,
                finish: FINISHES.oak_parquet ? "oak_parquet" : Object.keys(FINISHES).find((k) => FINISHES[k].kind === "floor"),
                riser: "trim_white",
            };
            b.addStair(stair);
            if (!b.isModelScene) {
                b.spec.floor_openings.push({
                    id: this.newId("hole"),
                    position: [round(point.x), round(point.z)],
                    elevation: stair.top_height,
                    width: stair.width,
                    depth: run,
                    yaw: 0,
                    stair_id: stair.id,
                });
                this.openingsChanged([stair.top_height]);
            }
            key = `stair:${stair.id}`;
        } else if (kind === "hole") {
            const elevation = this.nearestSlab(point.y);
            const hole = {
                id: this.newId("hole"),
                position: [round(point.x), round(point.z)],
                elevation,
                width: 1.2,
                depth: 2.4,
                yaw: 0,
            };
            b.spec.floor_openings.push(hole);
            this.openingsChanged([elevation]);
            key = `hole:${hole.id}`;
        }

        this.refreshRegistry();
        const editable = this.editables.get(key);
        if (!editable) {
            // Never leave behind something that can't be seen or selected:
            // it would still be saved, and still be walked into.
            this.restore(before);
            this.ui.toast("Couldn't add that here", "error");
            return;
        }
        editable.invalidate();

        const spot = this.freeSpot(editable);
        this.select(editable);
        if (spot) {
            editable.applyPose(spot);
            this.commit(before, `Add ${editable.label}`);
            this.ui.toast(`Added ${editable.label}`);
        } else {
            this.ui.toast("No room right there — move it to where it fits, then click", "warn");
            this.startSession("move", { editable, isNew: true, before, label: `Add ${editable.label}` });
        }
        this.applyVisibility();
    }

    /** The nearest pose to where a piece is now that passes the fit test. */
    freeSpot(editable) {
        const start = editable.getPose();
        const exclude = new Set([editable]);
        const tryPose = (pose) => {
            if (editable.caps.gravity) {
                const bottom = editable.bottom(pose);
                const support = this.snapper.supportUnder(editable.footprint(pose), bottom + 0.3, exclude);
                if (support !== null) pose.position.y += support - bottom;
            }
            return this.fit.test(editable.hulls(pose), { exclude }).ok;
        };

        const first = { ...start, position: start.position.clone(), scale: start.scale.clone() };
        if (tryPose(first)) return first;
        for (let r = 0.2; r <= 3; r += 0.2) {
            const count = Math.max(8, Math.round(r * 12));
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2;
                const pose = { ...start, position: start.position.clone(), scale: start.scale.clone() };
                pose.position.x += Math.cos(a) * r;
                pose.position.z += Math.sin(a) * r;
                if (tryPose(pose)) return pose;
            }
        }
        return null;
    }

    /** The floor or ceiling level nearest a height, for new openings. */
    nearestSlab(y) {
        let best = y;
        let distance = Infinity;
        for (const { value } of this.slabLevels()) {
            if (Math.abs(value - y) < distance) {
                distance = Math.abs(value - y);
                best = value;
            }
        }
        return round(best);
    }

    async duplicateSelection() {
        const source = this.selection;
        if (!source || this.session) return;
        if (!source.caps.duplicate) return this.ui.toast(`${source.label} can't be duplicated`, "warn");

        const before = this.capture();
        const b = this.builder;
        let key;

        if (source.type === "furniture") {
            const placement = source.duplicateSpec(this.newId("f"));
            const entry = b.addFurniture(placement);
            await entry.group.userData.ready;
            key = `furniture:${placement.id}`;
        } else if (source.type === "stair") {
            const stair = source.duplicateSpec(this.newId("stair"));
            b.addStair(stair);
            const elevations = [];
            for (const hole of source.linkedOpenings()) {
                b.spec.floor_openings.push({ ...structuredClone(hole), id: this.newId("hole"), stair_id: stair.id });
                elevations.push(hole.elevation);
            }
            if (elevations.length) this.openingsChanged(elevations);
            key = `stair:${stair.id}`;
        } else if (source.type === "hole") {
            const hole = source.duplicateSpec(this.newId("hole"));
            b.spec.floor_openings.push(hole);
            this.openingsChanged([hole.elevation]);
            key = `hole:${hole.id}`;
        }

        this.refreshRegistry();
        const copy = this.editables.get(key);
        if (!copy) return;
        copy.invalidate();
        this.select(copy);
        this.startSession("move", { editable: copy, isNew: true, before, label: "Duplicate" });
    }

    deleteSelection() {
        const editable = this.selection;
        if (!editable || this.session) return;
        if (!editable.caps.remove) {
            const why = editable.type === "opening" ? " — it is part of the house, but it can slide along its wall" : "";
            return this.ui.toast(`${editable.label} can't be deleted${why}`, "warn");
        }
        const before = this.capture();
        this.removeEditable(editable);
        this.commit(before, `Delete ${editable.label}`);
    }

    removeEditable(editable) {
        const b = this.builder;
        if (editable.type === "furniture") {
            b.removeFurniture(editable.id);
        } else if (editable.type === "stair") {
            const holes = editable.linkedOpenings();
            b.spec.floor_openings = b.spec.floor_openings.filter((h) => !holes.includes(h));
            b.removeStair(editable.id);
            if (holes.length) this.openingsChanged(holes.map((h) => h.elevation));
        } else if (editable.type === "hole") {
            b.spec.floor_openings = b.spec.floor_openings.filter((h) => h !== editable.hole);
            this.openingsChanged([editable.hole.elevation]);
        }
        this.fit.invalidate();
        if (this.selection === editable) this.select(null);
        this.refreshRegistry();
    }

    /** Settle the selection onto whatever is under it. */
    dropSelection() {
        const editable = this.selection;
        if (!editable?.caps.gravity) return;
        const pose = editable.getPose();
        const exclude = new Set([editable]);
        const bottom = editable.bottom(pose);
        // Look down from just above the base, so it drops rather than climbs.
        const support = this.snapper.supportUnder(editable.footprint(pose), bottom - STEP_UP + 0.02, exclude);
        if (support === null) return this.ui.toast("Nothing under it to rest on", "warn");
        pose.position.y += support - bottom;
        this.applyPose(editable, pose, "Drop to surface");
    }

    /** Apply a pose from outside a drag — a typed property — if it fits. */
    applyPose(editable, pose, label) {
        if (editable.caps.fit) {
            const exclude = new Set([editable]);
            const ignore = this.fit.touching(editable.hulls(), exclude);
            const result = this.fit.test(editable.hulls(pose), { exclude, ignore });
            if (!result.ok) {
                this.ui.toast(`Doesn't fit there — ${blockedText(result)}`, "error");
                this.emit("selection", this.selection);
                return false;
            }
        }
        const before = this.capture();
        editable.applyPose(pose);
        this.commit(before, label);
        this.applyVisibility();
        this.emit("selection", this.selection);
        return true;
    }

    /** A value typed into the properties panel. */
    setProperty(key, value) {
        const editable = this.selection;
        if (!editable || this.session) return;

        const pose = editable.poseWith(key, value);
        if (pose) {
            editable.clampScale(pose.scale);
            this.applyPose(editable, pose, "Edit");
            return;
        }
        if (editable.setParam) {
            const before = this.capture();
            const result = editable.setParam(key, value);
            if (result.ok) this.commit(before, "Edit");
            if (result.message) this.ui.toast(result.message, result.ok ? "info" : "error");
            this.refreshRegistry();
            this.emit("selection", this.selection);
        }
    }

    runAction(id) {
        const editable = this.selection;
        if (id === "duplicate") return this.duplicateSelection();
        if (id === "delete") return this.deleteSelection();
        if (id === "drop") return this.dropSelection();
        if (id === "frame") return this.frameSelected();
        if (id === "cut-opening" && editable?.type === "stair") {
            const before = this.capture();
            const hole = { id: this.newId("hole"), position: [0, 0], elevation: 0, width: 1, depth: 1, yaw: 0, stair_id: editable.id };
            this.builder.spec.floor_openings.push(hole);
            editable.fitOpenings();
            const result = this.fit.test(editable.hulls(), { exclude: new Set([editable]) });
            if (!result.ok) {
                this.builder.spec.floor_openings = this.builder.spec.floor_openings.filter((h) => h !== hole);
                return this.ui.toast(`Can't open the floor there — ${blockedText(result)}`, "error");
            }
            this.openingsChanged([hole.elevation]);
            this.refreshRegistry();
            this.commit(before, "Cut opening");
            this.emit("selection", this.selection);
        }
    }

    // ------------------------------------------------------------------
    // Settings
    // ------------------------------------------------------------------

    setTool(tool) {
        this.tool = tool;
        this.emit("settings");
    }

    setOrientation(orientation) {
        this.orientation = orientation;
        this.emit("settings");
    }

    setSnap(on) {
        this.snapEnabled = on;
        this.emit("settings");
        this.ui.toast(on ? "Snapping on — hold Shift to move freely" : "Snapping off");
    }

    setIncrement(value) {
        this.increment = value;
        this.emit("settings");
    }

    setTrackpad(on) {
        this.trackpad = on;
        writePreference("trackpad", on);
        this.emit("settings");
    }

    /**
     * The levels an opening can sit at: every storey's floor, plus the top
     * storey's ceiling for a loft hatch.
     */
    slabLevels() {
        const levels = this.builder.levels();
        const out = levels.map((e, i) => ({ value: round(e), label: LEVEL_NAMES[i] || `Level ${i}` }));
        for (const room of this.builder.spec.rooms) {
            if (FINISHES[room.floor_finish]?.kind === "ground" || room.ceiling_finish === "none") continue;
            const top = room.elevation + room.height;
            if (levels.some((e) => e >= top - 0.02 && e < top + 0.6)) continue;
            if (!out.some((l) => Math.abs(l.value - top) < 0.02)) out.push({ value: round(top), label: `Ceiling at ${top.toFixed(2)} m` });
        }
        return out.sort((a, b) => a.value - b.value);
    }

    // ------------------------------------------------------------------
    // Floors, rooms and X-ray
    // ------------------------------------------------------------------

    /**
     * Work on one floor or one room alone: everything else hides, and the
     * view frames what is left. Selecting the current focus again, or null,
     * shows the whole property.
     */
    setFocus(focus, { frame = true } = {}) {
        this.focus = focus || null;
        // A collection focused on is one the user wants to see.
        if (focus) {
            this.hiddenCollections.delete(Collections.key(focus));
            if (focus.type === "room") {
                const room = this.builder.spec.rooms.find((r) => r.id === focus.room);
                if (room) this.hiddenCollections.delete(`level:${this.collections.levelOf(room.elevation)}`);
            }
        }
        // Whatever is selected outside the new focus is let go.
        if (this.selection && !this.collections.shows(this.collections.membership(this.selection), this.focus, this.hiddenCollections)) {
            this.select(null);
        }
        const clip = this.collections.clipBox(this.focus);
        this.clipBox = clip;
        this.clipPlanes = clip
            ? [
                  new THREE.Plane(new THREE.Vector3(1, 0, 0), -clip.x0),
                  new THREE.Plane(new THREE.Vector3(-1, 0, 0), clip.x1),
                  new THREE.Plane(new THREE.Vector3(0, 0, 1), -clip.z0),
                  new THREE.Plane(new THREE.Vector3(0, 0, -1), clip.z1),
              ]
            : [];
        this.applyVisibility();
        if (frame) {
            const box = this.focus ? this.collections.focusBox(this.focus) : null;
            if (box && !box.isEmpty()) this.view.frame(box, 1.1);
            else if (!this.focus) this.frameAll();
        }
        this.emit("settings");
    }

    toggleFocus(key) {
        this.setFocus(Collections.key(this.focus) === key ? null : Collections.parse(key));
    }

    /** Page Up / Page Down: the floor above or below the one in focus. */
    stepFloor(direction) {
        const floors = this.collections.floors();
        if (!floors.length) return;
        let current = -1;
        if (this.focus?.type === "level") current = this.focus.level;
        else if (this.focus?.type === "room") {
            const room = this.builder.spec.rooms.find((r) => r.id === this.focus.room);
            current = room ? this.collections.levelOf(room.elevation) : -1;
        }
        const next = current === -1 ? (direction > 0 ? 0 : floors.length - 1) : THREE.MathUtils.clamp(current + direction, 0, floors.length - 1);
        this.setFocus({ type: "level", level: next });
    }

    /** `/`: the selection's room alone, as Blender's local view; again to leave. */
    toggleLocalView() {
        if (this.focus) return this.setFocus(null);
        if (!this.selection) return this.ui.toast("Select something to see its room on its own");
        const member = this.collections.membership(this.selection);
        const room = member.rooms?.[0];
        if (room) this.setFocus({ type: "room", room });
        else if (member.outside) this.setFocus({ type: "outside" });
        else if (member.levels?.length) this.setFocus({ type: "level", level: member.levels[0] });
    }

    toggleHidden(id) {
        if (this.hiddenCollections.has(id)) this.hiddenCollections.delete(id);
        else this.hiddenCollections.add(id);
        if (this.selection && !this.collections.shows(this.collections.membership(this.selection), this.focus, this.hiddenCollections)) {
            this.select(null);
        }
        this.applyVisibility();
        this.emit("settings");
    }

    /** Alt H: every collection back on. */
    showAllCollections() {
        this.hiddenCollections.clear();
        this.applyVisibility();
        this.emit("settings");
    }

    isHidden(id) {
        return this.hiddenCollections.has(id);
    }

    setXray(on) {
        this.xray = on;
        this.applyXray();
        this.emit("settings");
    }

    /**
     * Show and hide the building and the pieces for the current focus and
     * hidden collections. Outside edit mode, everything shows.
     */
    applyVisibility() {
        const collections = this.collections;
        const focus = this.active ? this.focus : null;
        const hidden = this.active ? this.hiddenCollections : new Set();

        // three.js skips only `visible === false`, so this must be a boolean.
        for (const part of collections.buildingParts()) {
            part.object.visible = Boolean(collections.shows(part, focus, hidden));
        }

        for (const editable of this.editables.values()) {
            if (!editable.object3d || editable.type === "opening") continue;
            // A piece being placed is shown and hidden by its move.
            if (this.session?.editable === editable) continue;
            let show = Boolean(collections.shows(collections.membership(editable), focus, hidden));
            // What is selected stays in view, even if it was moved out of the
            // room being worked on.
            if (editable === this.selection) show = true;
            if (editable.type === "hole") show = show && this.active;
            editable.object3d.visible = show;
        }

        // People are not part of a floor plan: with a floor or room on its
        // own they would stand in mid-air.
        const people = focus === null;
        const player = this.world.player;
        if (player?.avatar) player.avatar.avatar.visible = this.showsVisitor();
        for (const other of Object.values(player?.otherPlayers || {})) {
            if (!other.model) continue;
            other.model.avatar.visible = people;
            other.model.nametag.visible = people;
        }

        this.applyXray();
    }

    /**
     * X-ray: walls, ceilings and the roof drawn see-through, and not
     * casting shadows, so the rooms inside can be seen and worked on from
     * any angle. Floors stay solid, so it is still clear what stands where.
     * Door and window frames stay solid too — they are editable.
     */
    applyXray() {
        const targets = new Set();
        if (this.active && this.xray) {
            for (const part of this.collections.buildingParts()) {
                if (!["wall", "ceiling", "roof"].includes(part.kind)) continue;
                const visit = (node) => {
                    if (node.userData?.kind === "door" || node.userData?.kind === "opening") return;
                    if (node.isMesh) targets.add(node);
                    for (const child of node.children) visit(child);
                };
                visit(part.object);
            }
        }

        for (const mesh of this.xrayed) {
            if (targets.has(mesh)) continue;
            const saved = mesh.userData.xray;
            if (saved) {
                mesh.material = saved.material;
                mesh.castShadow = saved.castShadow;
                delete mesh.userData.xray;
            }
        }
        for (const mesh of targets) {
            if (mesh.userData.xray) continue;
            mesh.userData.xray = { material: mesh.material, castShadow: mesh.castShadow };
            mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map((m) => this.xrayMaterial(m))
                : this.xrayMaterial(mesh.material);
            mesh.castShadow = false;
        }
        this.xrayed = targets;
    }

    xrayMaterial(material) {
        let clone = this.xrayMaterials.get(material);
        if (!clone) {
            clone = material.clone();
            clone.transparent = true;
            clone.opacity = 0.2 * (material.opacity ?? 1);
            clone.depthWrite = false;
            this.xrayMaterials.set(material, clone);
        }
        return clone;
    }

    /** Header picker options: the whole property, each floor and its rooms, outside. */
    focusOptions() {
        const groups = this.collections.floors().map((floor) => ({
            label: floor.name,
            options: [
                { value: floor.id, label: `${floor.name} — whole floor` },
                ...floor.rooms.map((room) => ({ value: `room:${room.id}`, label: room.name })),
            ],
        }));
        if (this.collections.outdoorRooms().length || this.builder.groundPlane) {
            groups.push({ label: "Outside", options: [{ value: "outside", label: "Outside — the site" }] });
        }
        return groups;
    }

    // ------------------------------------------------------------------
    // View
    // ------------------------------------------------------------------

    frameSelected() {
        if (!this.selection) return this.frameAll();
        let box = this.selection.worldBox();
        if (box.isEmpty()) {
            box = new THREE.Box3();
            for (const o of this.selection.outlineObjects()) box.expandByObject(o);
        }
        if (box.isEmpty()) box.setFromCenterAndSize(this.selection.getPose().position, new THREE.Vector3(1, 1, 1));
        this.view.frame(box, 1.8);
    }

    frameAll() {
        if (this.focus) {
            const box = this.collections.focusBox(this.focus);
            if (!box.isEmpty()) return this.view.frame(box, 1.1);
        }
        const b = this.builder;
        const box = new THREE.Box3();
        for (const root of [b.isModelScene ? b.model : b.shell, b.fittings, b.furnitureGroup]) if (root) box.expandByObject(root);
        this.view.frame(box, 1.05);
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------

    bind() {
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onContextMenu = (event) => {
            if (this.active) event.preventDefault();
        };

        this.canvas.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
        this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
        this.canvas.addEventListener("contextmenu", this.onContextMenu);
        // Capture phase: edit mode's keys must win over the walkthrough's.
        document.addEventListener("keydown", this.onKeyDown, true);
        document.addEventListener("keyup", this.onKeyUp, true);
    }

    onPointerDown(event) {
        if (!this.active) return this.field.onPointerDown(event);
        this.ui.closePopups();
        const pointer = { x: event.clientX, y: event.clientY };
        this.lastPointer = pointer;
        this.shift = event.shiftKey;

        if (this.session) {
            event.preventDefault();
            if (event.button === 0) this.endSession(this.session.confirm());
            else if (event.button === 2) this.endSession(this.session.cancel());
            return;
        }

        // Navigation: middle button, or Alt with the left for a trackpad.
        if (event.button === 1 || (event.button === 0 && event.altKey)) {
            event.preventDefault();
            const mode = event.shiftKey ? "pan" : event.ctrlKey || event.metaKey ? "zoom" : "orbit";
            this.nav = { mode, x: event.clientX, y: event.clientY };
            this.canvas.setPointerCapture?.(event.pointerId);
            this.ui.setCursor(mode === "pan" ? "grabbing" : "move");
            return;
        }

        if (event.button === 0) {
            _ray.setFromCamera(this.toNdc(pointer), this.camera);
            const handle = this.gizmo.pick(_ray);
            if (handle && this.selection) {
                this.startSession(handle.tool, { handle, pointer, source: "gizmo" });
                return;
            }

            const editable = this.pick(pointer);
            this.select(editable);
            // Press-and-drag on a piece moves it, as with Blender's tweak.
            if (editable && editable.caps.move && this.tool !== "select") {
                this.pending = { x: event.clientX, y: event.clientY, editable };
            }
            return;
        }

        if (event.button === 2) {
            const editable = this.pick(pointer);
            if (editable) this.select(editable);
            if (this.selection) this.ui.showContextMenu(event.clientX, event.clientY);
        }
    }

    onPointerMove(event) {
        if (!this.active) return this.field.onPointerMove(event);
        const pointer = { x: event.clientX, y: event.clientY };
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        this.lastPointer = pointer;
        this.shift = event.shiftKey;

        if (this.nav) {
            if (this.nav.mode === "orbit") this.view.orbit(dx, dy);
            else if (this.nav.mode === "pan") this.view.pan(dx, dy);
            else this.view.zoom(Math.exp(dy * 0.01));
            return;
        }

        if (this.session) {
            this.session.update(pointer, event.shiftKey);
            return;
        }

        if (this.pending) {
            if (Math.hypot(event.clientX - this.pending.x, event.clientY - this.pending.y) > 5) {
                const { editable, x, y } = this.pending;
                this.pending = null;
                const session = this.startSession("move", { editable, pointer: { x, y }, source: "drag" });
                session?.update(pointer, event.shiftKey);
            }
            return;
        }

        if (event.target === this.canvas) {
            _ray.setFromCamera(this.toNdc(pointer), this.camera);
            const handle = this.gizmo.pick(_ray);
            this.gizmo.setHover(handle);
            this.ui.setCursor(handle ? "pointer" : "");
        }
    }

    onPointerUp(event) {
        if (!this.active) return this.field.onPointerUp(event);
        if (this.nav) {
            this.nav = null;
            this.ui.setCursor("");
            return;
        }
        this.pending = null;
        if (this.session && this.session.source !== "modal" && event.button === 0) {
            this.endSession(this.session.confirm());
        }
    }

    onWheel(event) {
        if (!this.active) return;
        event.preventDefault();
        if (event.ctrlKey) {
            // Pinch.
            this.view.zoom(Math.exp(event.deltaY * 0.01));
        } else if (this.trackpad) {
            if (event.shiftKey) this.view.pan(-event.deltaX, -event.deltaY);
            else this.view.orbit(-event.deltaX, -event.deltaY);
        } else {
            this.view.zoom(Math.exp(event.deltaY * 0.0015));
        }
    }

    isTyping() {
        const active = document.activeElement;
        return active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
    }

    onKeyDown(event) {
        if (this.isTyping()) return;

        if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (!this.available) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey && this.active) return this.setSnap(!this.snapEnabled);
            if (this.active) this.leave();
            else this.enter();
            return;
        }
        if (!this.active) return this.field.onKeyDown(event);
        // Everything below belongs to the editor, not the walkthrough.
        event.stopPropagation();

        if (event.key === "Shift") {
            this.shift = true;
            this.session?.setShift(true);
            // And runs, while walking.
            this.world.player?.setMovementKey(event.code, true);
            return;
        }

        if (this.session) {
            this.onSessionKey(event);
            return;
        }

        if (this.walkKey(event)) return;

        const key = event.key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;

        if (mod) {
            if (key === "z") {
                event.preventDefault();
                if (event.shiftKey) this.redo();
                else this.undo();
            } else if (key === "y") {
                event.preventDefault();
                this.redo();
            } else if (key === "s") {
                event.preventDefault();
                this.world.emit("save-now");
            }
            return;
        }

        if (event.shiftKey && key === "d") return this.duplicateSelection();
        if (event.shiftKey && key === "a") {
            event.preventDefault();
            return this.ui.showAddMenu(this.lastPointer.x, this.lastPointer.y);
        }
        if (event.altKey && (key === "a" || event.code === "KeyA")) return this.select(null);
        if (event.altKey && event.code === "KeyZ") {
            event.preventDefault();
            return this.setXray(!this.xray);
        }
        if (event.altKey && event.code === "KeyH") return this.showAllCollections();
        if (event.code === "Slash" || event.code === "NumpadDivide") {
            event.preventDefault();
            return this.toggleLocalView();
        }
        if (event.code === "PageUp" || event.code === "PageDown") {
            event.preventDefault();
            return this.stepFloor(event.code === "PageUp" ? 1 : -1);
        }

        const views = { Numpad1: "front", Numpad3: "right", Numpad7: "top" };
        const opposite = { front: "back", right: "left", top: "bottom" };
        const emulated = { Digit1: "Numpad1", Digit3: "Numpad3", Digit7: "Numpad7", Digit5: "Numpad5" };
        const code = emulated[event.code] || event.code;

        if (views[code]) {
            event.preventDefault();
            this.view.setView(event.ctrlKey ? opposite[views[code]] : views[code]);
            return;
        }

        switch (code) {
            case "Numpad5":
                return this.view.toggleOrtho();
            case "Numpad4":
                return this.view.orbitStep(-15 * DEG, 0);
            case "Numpad6":
                return this.view.orbitStep(15 * DEG, 0);
            case "Numpad8":
                return this.view.orbitStep(0, -15 * DEG);
            case "Numpad2":
                return this.view.orbitStep(0, 15 * DEG);
            case "NumpadDecimal":
            case "Period":
                return this.frameSelected();
            case "Home":
                return this.frameAll();
            default:
                break;
        }

        // Held down, these would fire again and again — a W held to walk
        // until something was selected would keep switching tools.
        if (event.repeat) return;

        switch (key) {
            case "g":
                return this.startSession("move");
            case "r":
                return this.startSession("rotate");
            case "s":
                return this.startSession("scale");
            case "x":
            case "delete":
            case "backspace":
                return this.deleteSelection();
            case "escape":
                if (!this.ui.closePopups()) this.select(null);
                return;
            case "n":
                return this.ui.toggleSidebar();
            case "t":
                return this.ui.toggleToolbar();
            case "w":
                return this.setTool(this.tool === "select" ? "move" : "select");
            default:
                return;
        }
    }

    onSessionKey(event) {
        const session = this.session;
        const key = event.key;
        event.preventDefault();

        if (key === "Escape") return this.endSession(session.cancel());
        if (key === "Enter") return this.endSession(session.confirm());

        const lower = key.toLowerCase();
        if (["x", "y", "z"].includes(lower)) {
            if (event.shiftKey) session.togglePlane(lower);
            else session.toggleAxis(lower);
            return;
        }
        // By code as well as by character: layouts disagree about what
        // the minus and decimal keys produce.
        const typed =
            event.code === "Minus" || event.code === "NumpadSubtract"
                ? "-"
                : event.code === "Period" || event.code === "NumpadDecimal" || event.code === "Comma"
                  ? "."
                  : /^(Digit|Numpad)[0-9]$/.test(event.code)
                    ? event.code.slice(-1)
                    : key;
        if (/^[0-9.]$/.test(typed) || typed === "-" || typed === "Backspace") session.type(typed);
    }

    /**
     * WASD, Space and the arrows walk the visitor from edit mode, relative
     * to where the view is looking. WASD and Space only while nothing is
     * selected — with a selection they are Blender's (S scales, W switches
     * tools) — the arrows at any time, the editor having no use for them.
     * Shift runs, except that Shift A is still Add.
     */
    walkKey(event) {
        const player = this.world.player;
        if (!player || event.ctrlKey || event.metaKey || event.altKey) return false;
        const always = event.code.startsWith("Arrow");
        const free = ["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code) && !this.selection;
        if (!always && !free) return false;
        if (event.shiftKey && event.code === "KeyA") return false;
        event.preventDefault();
        // Into the layout as it is now, not as it was when edit mode opened.
        // Nothing to do unless something has changed since the last step.
        this.builder.refreshCollision();
        player.setMovementKey(event.code, true);
        this.walked = true;
        return true;
    }

    /**
     * Whether your own avatar is drawn. In edit mode it is, on the floor or
     * in the room being worked on as long as it is standing there, so
     * walking can be watched; in the walkthrough, unless in first person.
     */
    showsVisitor() {
        const player = this.world.player;
        if (!player?.avatar) return false;
        if (!this.active) return player.camera.mode !== "first";
        if (!this.focus) return true;
        const collider = player.player.collider;
        const feet = collider.start.y - collider.radius;
        const room = this.collections.roomAt(collider.start.x, feet + 0.05, collider.start.z);
        const member = { levels: [this.collections.levelOf(feet)], rooms: room ? [room.id] : [] };
        return Boolean(this.collections.shows(member, this.focus, this.hiddenCollections));
    }

    onKeyUp(event) {
        if (!this.active) return this.field.onKeyUp(event);
        if (event.key === "Shift") {
            this.shift = false;
            this.session?.setShift(false);
        }
    }

    // ------------------------------------------------------------------
    // Frame
    // ------------------------------------------------------------------

    update() {
        if (!this.active) return this.field.update();

        const selection = this.selection;
        const spec = selection && this.tool !== "select" && (!this.session || this.session.source === "gizmo")
            ? selection.gizmoSpec(this.session?.kind || this.tool, this.orientation)
            : null;
        this.gizmo.configure(spec);
        this.ui.update();

        // Walking in and out of the floor or room being worked on.
        const player = this.world.player;
        if (this.focus && player?.avatar && player.isMoving()) player.avatar.avatar.visible = this.showsVisitor();
    }

    /** Draw the frame: the scene (outlined selection), then the gizmo. */
    render(renderer, scene, camera) {
        if (!this.active) this.field.beforeRender(camera);
        if (this.gizmo.root.visible) {
            const distance = camera.position.distanceTo(this.gizmo.root.position);
            this.gizmo.update(camera, this.worldPerPixel(camera, distance));
        }

        // A room focus cuts the scene to the room's footprint; the gizmo
        // drawn after it is never cut.
        renderer.clippingPlanes = (this.active && this.clipPlanes) || [];

        const outline = this.selection ? this.selection.outlineObjects().filter(isShown) : [];
        if (outline.length) {
            this.ensureComposer(renderer);
            this.renderPass.camera = camera;
            this.outlinePass.renderCamera = camera;
            this.outlinePass.selectedObjects = outline;
            this.composer.render();
        } else {
            renderer.render(scene, camera);
        }

        renderer.clippingPlanes = [];
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.overlay, camera);
        renderer.autoClear = true;
        return true;
    }

    ensureComposer(renderer) {
        if (this.composer) return;
        const sizes = this.experience.sizes;
        this.composer = new EffectComposer(renderer);
        this.composer.setPixelRatio(sizes.pixelRatio);
        this.composer.setSize(sizes.width, sizes.height);

        this.renderPass = new RenderPass(this.scene, this.view.camera);
        this.outlinePass = new OutlinePass(new THREE.Vector2(sizes.width, sizes.height), this.scene, this.view.camera);
        this.outlinePass.edgeStrength = 4;
        this.outlinePass.edgeThickness = 1;
        this.outlinePass.edgeGlow = 0;
        this.outlinePass.visibleEdgeColor.set("#ffaa33");
        this.outlinePass.hiddenEdgeColor.set("#8a5a1c");

        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.outlinePass);
        this.composer.addPass(new OutputPass());
    }

    onResize(sizes) {
        if (!this.composer) return;
        this.composer.setPixelRatio(sizes.pixelRatio);
        this.composer.setSize(sizes.width, sizes.height);
    }

    dispose() {
        this.canvas.removeEventListener("pointerdown", this.onPointerDown);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
        this.canvas.removeEventListener("wheel", this.onWheel);
        this.canvas.removeEventListener("contextmenu", this.onContextMenu);
        document.removeEventListener("keydown", this.onKeyDown, true);
        document.removeEventListener("keyup", this.onKeyUp, true);
        this.field.dispose();
        this.gizmo.dispose();
        this.ghost.dispose();
        this.fit.dispose();
        this.composer?.dispose();
        for (const material of this.xrayMaterials.values()) material.dispose();
        this.ui.dispose();
    }
}

/** Visible all the way up — a focus hides whole groups. */
function isShown(object) {
    for (let node = object; node; node = node.parent) {
        if (!node.visible) return false;
    }
    return true;
}

export function blockedText(result) {
    const blocker = result.blocker;
    if (!blocker) return "it doesn't fit";
    if (blocker.reason) return `it ${blocker.reason}`;
    return `it would hit the ${blocker.label.toLowerCase()}`;
}

function readPreference(key, fallback) {
    try {
        const value = localStorage.getItem(`editor.${key}`);
        return value === null ? fallback : JSON.parse(value);
    } catch {
        return fallback;
    }
}

function writePreference(key, value) {
    try {
        localStorage.setItem(`editor.${key}`, JSON.stringify(value));
    } catch {
        // Private windows; the setting just won't stick.
    }
}

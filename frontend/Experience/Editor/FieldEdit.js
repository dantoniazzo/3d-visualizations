import * as THREE from "three";

import { blockedText } from "./Editor.js";

/**
 * Editing from the walkthrough, with the crosshair as the cursor.
 *
 * Nothing changes while nothing is selected: the walkthrough is the
 * walkthrough. A click on anything edit mode can move selects it — outline
 * and gizmo as in edit mode — and from then until it is deselected the
 * keyboard is Blender's: G, R, S, X, Shift D, Shift A, the axis keys, typed
 * values. Walking stops meanwhile, because S, Shift A and Shift D would
 * otherwise do two things at once. Looking around does not stop: it is what
 * moves the cursor.
 *
 * The cursor never moves on screen — the view moves under it. So a move
 * follows where you look, a gizmo handle is dragged by holding the button
 * and looking along it, and R and S, which Blender reads from the cursor
 * circling or leaving the pivot (which the crosshair is usually sitting on),
 * turn the piece as you turn your head and scale it as you look up or down.
 *
 * Underneath it is the same editor: the same fit test and snapping, the
 * same undo history, saved the same way. Tab carries the selection into
 * edit mode. Ctrl/⌘ Z undoes even with nothing selected, so a deletion can
 * be taken back.
 */

/** How far from the camera a click can select, in metres. */
const REACH = 12;
/** Mouse travel, in pixels, that turns a press on a piece into a drag. */
const DRAG_START = 6;
/** How often the aim is re-read while the view is still, in ms. */
const AIM_INTERVAL = 150;

const _ray = new THREE.Raycaster();
const _centre = new THREE.Vector2(0, 0);

export default class FieldEdit {
    constructor(editor) {
        this.editor = editor;
        this.rig = editor.cameraRig;
        this.canvas = editor.canvas;

        this.pending = null;
        this.aimState = null;
        this.aimAt = 0;
        this.escapedAt = 0;
        this.menuOpen = false;
        this.view = new THREE.Matrix4();
        this.aimView = new THREE.Matrix4();

        this.hud = new FieldHud(this);

        this.onLockChange = this.onLockChange.bind(this);
        this.rig.on("lockchange", this.onLockChange);
        editor.on("selection", (selection) => this.onSelection(selection));
        // Edit mode has its own panels; the walkthrough's goes when it opens.
        editor.on("mode", () => {
            this.setAim(null);
            this.hud.invalidate();
            this.hud.sync();
        });
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    /** Whether the walkthrough is where editing happens right now. */
    get enabled() {
        const editor = this.editor;
        return (
            editor.available &&
            !editor.active &&
            this.rig.scheme === "pointerLock" &&
            !editor.world.player?.inVehicle
        );
    }

    /** Something is selected, so the frame is drawn with its outline and gizmo. */
    get engaged() {
        return this.enabled && Boolean(this.editor.selection || this.editor.session);
    }

    get locked() {
        return document.pointerLockElement === this.canvas;
    }

    /** The client point the crosshair sits on. */
    centre() {
        const rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    centreRay() {
        _ray.setFromCamera(_centre, this.editor.camera);
        return _ray;
    }

    /**
     * The piece under the crosshair, if a click there should select it.
     * Walls stop the look here, as they stop the eye — unlike edit mode,
     * where a click goes through them.
     */
    aim() {
        const ray = this.centreRay();
        ray.far = REACH;
        const hits = ray.intersectObjects(this.editor.pickTargets(), true);
        ray.far = Infinity;
        for (const hit of hits) {
            if (!isShown(hit.object) || hit.object.userData?.helper) continue;
            return this.editor.editableFor(hit.object);
        }
        return null;
    }

    /** Stop editing from here: drop a move in progress and the selection. */
    reset() {
        const editor = this.editor;
        this.pending = null;
        if (editor.session) editor.endSession(editor.session.cancel());
        this.setAim(null);
        this.hud.invalidate();
    }

    // ------------------------------------------------------------------
    // Per frame
    // ------------------------------------------------------------------

    /** Before the camera moves: what the crosshair is on, and the HUD. */
    update() {
        const editor = this.editor;
        if (!this.enabled) {
            // Getting into the car, say, ends whatever was being edited.
            if (!editor.active && (editor.session || editor.selection)) {
                this.reset();
                editor.select(null);
                this.settle();
            }
            this.setAim(null);
            this.hud.sync();
            return;
        }

        // What a click would do: grab a gizmo handle, or select a piece.
        // Re-read when the view moves, and now and then when it doesn't
        // (things move under a still view too).
        let aim = this.aimState;
        const camera = editor.camera;
        const now = performance.now();
        if (!this.locked || editor.session) {
            aim = null;
        } else if (!this.aimView.equals(camera.matrixWorld) || now - this.aimAt > AIM_INTERVAL) {
            this.aimView.copy(camera.matrixWorld);
            this.aimAt = now;
            aim = editor.selection && editor.gizmo.pick(this.centreRay()) ? "handle" : this.aim() ? "piece" : null;
        }
        this.setAim(aim);
        this.hud.sync();
    }

    /** After the camera has moved, just before drawing: follow the look. */
    beforeRender(camera) {
        const editor = this.editor;
        const pointer = this.centre();
        editor.lastPointer = pointer;

        const moved = !this.view.equals(camera.matrixWorld);
        if (moved) this.view.copy(camera.matrixWorld);
        if (editor.session && moved) editor.session.update(pointer, editor.shift);

        const selection = editor.selection;
        const spec =
            selection && editor.tool !== "select" && (!editor.session || editor.session.source === "gizmo")
                ? selection.gizmoSpec(editor.session?.kind || editor.tool, editor.orientation)
                : null;
        editor.gizmo.configure(spec);
        if (spec && !editor.session) {
            editor.gizmo.setHover(this.locked ? editor.gizmo.pick(this.centreRay()) : null);
        }
    }

    setAim(aim) {
        if (aim === this.aimState) return;
        this.aimState = aim;
        document.body.classList.toggle("field-aim-piece", aim === "piece");
        document.body.classList.toggle("field-aim-handle", aim === "handle");
    }

    // ------------------------------------------------------------------
    // Pointer
    // ------------------------------------------------------------------

    onPointerDown(event) {
        if (!this.enabled) return;
        const editor = this.editor;

        // The click that captures the pointer is not an edit; it does close
        // an open Add menu.
        if (!this.locked) {
            editor.ui.closePopups();
            return;
        }

        const pointer = this.centre();
        if (editor.session) {
            event.preventDefault();
            if (event.button === 0) editor.endSession(editor.session.confirm());
            else if (event.button === 2) editor.endSession(editor.session.cancel());
            return;
        }
        if (event.button !== 0) return;

        if (editor.selection) {
            const handle = editor.gizmo.pick(this.centreRay());
            if (handle) {
                editor.startSession(handle.tool, { handle, pointer, source: "gizmo" });
                return;
            }
        }

        // A click on nothing editable — a wall, the floor — deselects.
        const editable = this.aim();
        editor.select(editable);
        // Press and look away drags it, as Blender's tweak drags with the
        // mouse. The ray is kept from now, before the view turns.
        if (editable?.caps.move && editor.tool !== "select") {
            this.pending = { editable, travel: 0, ray: this.centreRay().ray.clone() };
        }
    }

    onPointerMove(event) {
        if (!this.pending || !this.locked) return;
        this.pending.travel += Math.hypot(event.movementX || 0, event.movementY || 0);
        if (this.pending.travel < DRAG_START) return;
        const { editable, ray } = this.pending;
        this.pending = null;
        this.editor.startSession("move", { editable, pointer: this.centre(), source: "drag", startRay: ray });
    }

    onPointerUp(event) {
        if (!this.enabled) return;
        this.pending = null;
        const session = this.editor.session;
        if (session && session.source !== "modal" && event.button === 0) {
            this.editor.endSession(session.confirm());
        }
    }

    // ------------------------------------------------------------------
    // Keys
    // ------------------------------------------------------------------

    onKeyDown(event) {
        const editor = this.editor;
        if (!this.enabled || editor.isTyping()) return;
        const key = event.key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;

        // Undo and redo clash with nothing in the walkthrough, and have to
        // work with nothing selected: that is what a deletion leaves.
        if (mod && !editor.session && (key === "z" || key === "y")) {
            if (!editor.history.undo.length && !editor.history.redo.length) return;
            event.preventDefault();
            event.stopPropagation();
            if (key === "y" || event.shiftKey) editor.redo();
            else editor.undo();
            return;
        }

        if (!editor.selection && !editor.session) return;
        // Looking stays the walkthrough's, and so do the menu and chat.
        if (!editor.session && (event.code === "KeyV" || event.code === "KeyM" || event.key === "Enter")) return;
        // Everything else belongs to the selection now — including W A S D,
        // so the visitor stands still while it is being worked on.
        event.stopPropagation();

        if (event.key === "Shift") {
            editor.shift = true;
            editor.session?.setShift(true);
            return;
        }

        if (editor.session) {
            if (event.key === "Escape") this.escapedAt = performance.now();
            editor.onSessionKey(event);
            return;
        }

        if (mod) {
            if (key === "s") {
                event.preventDefault();
                editor.world.emit("save-now");
            }
            return;
        }

        const pointer = this.centre();
        if (event.shiftKey && event.code === "KeyD") return editor.duplicateSelection();
        if (event.shiftKey && event.code === "KeyA") {
            event.preventDefault();
            return this.openAddMenu();
        }
        if (event.altKey && event.code === "KeyA") return editor.select(null);

        switch (key) {
            case "g":
                return editor.startSession("move", { pointer });
            case "r":
                return editor.startSession("rotate", { pointer });
            case "s":
                return editor.startSession("scale", { pointer });
            case "x":
            case "delete":
            case "backspace":
                return editor.deleteSelection();
            case "escape":
                this.escapedAt = performance.now();
                return editor.select(null);
            case "w":
                return editor.setTool(editor.tool === "select" ? "move" : "select");
            default:
                return;
        }
    }

    onKeyUp(event) {
        if (event.key !== "Shift") return;
        this.editor.shift = false;
        this.editor.session?.setShift(false);
    }

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    /**
     * Esc frees the pointer — the browser does that whatever the page wants.
     * Freed mid-move, the move is cancelled, as Esc cancels it in Blender;
     * freed otherwise, the selection goes, so the keys are the walkthrough's
     * again. The Add menu frees it on purpose and is left alone.
     */
    onLockChange(locked) {
        const editor = this.editor;
        if (locked || editor.active) return;
        this.pending = null;
        this.setAim(null);
        if (this.menuOpen) return;
        if (editor.session) {
            editor.endSession(editor.session.cancel());
            return;
        }
        // The same Esc may already have cancelled a move as a key press.
        if (performance.now() - this.escapedAt < 500 && editor.selection) return;
        if (editor.selection) editor.select(null);
    }

    onSelection(selection) {
        if (!this.enabled) return;
        // A key held while selecting would keep the visitor walking.
        const player = this.editor.world.player;
        if (selection && player) player.actions = {};
        if (!selection) this.settle();
        this.hud.invalidate();
    }

    /**
     * Rebuild the collision from whatever moved, once walking can resume.
     * It takes a moment in a big house, so not after every change: the
     * visitor stands still while something is selected anyway. Deferred a
     * tick, so the frame that lets go is drawn first.
     */
    settle() {
        if (this.editor.selection || this.settling) return;
        this.settling = setTimeout(() => {
            this.settling = null;
            if (!this.editor.selection) this.editor.builder.refreshCollision();
        }, 0);
    }

    /** Shift A: the Add menu needs a cursor, so the pointer is let go. */
    openAddMenu() {
        const { x, y } = this.centre();
        this.menuOpen = true;
        this.editor.ui.showAddMenu(x, y);
        this.rig.releaseLock();
    }

    /** The Add menu closed; anything chosen from it is aimed with the crosshair. */
    onPopupsClosed() {
        this.menuOpen = false;
    }

    /** Take the pointer back — called from a click, which browsers require. */
    resume() {
        this.menuOpen = false;
        this.rig.requestLock();
    }

    dispose() {
        this.rig.removeListener("lockchange", this.onLockChange);
        this.setAim(null);
        this.hud.dispose();
    }
}

// ---------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------

const IDLE_KEYS = [
    ["G", "Move"],
    ["R", "Rotate"],
    ["S", "Scale"],
    ["⇧ D", "Duplicate"],
    ["X", "Delete"],
    ["⇧ A", "Add"],
    ["Esc", "Done"],
];

/** How each kind of transform is steered from the walkthrough. */
const STEER = {
    move: "Look where it should go",
    rotate: "Turn your head to rotate",
    scale: "Look up or down to scale",
    gizmo: "Hold and look along the handle",
};

/**
 * What is selected and what the keys do, at the bottom of the screen — the
 * status bar and header readout edit mode has, in the walkthrough's style.
 */
class FieldHud {
    constructor(field) {
        this.field = field;
        this.dirty = true;

        const root = document.createElement("div");
        root.className = "field-edit";
        root.hidden = true;
        root.innerHTML = `
            <div class="field-edit-toasts" data-toasts></div>
            <div class="field-edit-card">
                <div class="field-edit-title"><b data-name></b><span data-state></span></div>
                <div class="field-edit-keys" data-keys></div>
            </div>`;
        document.body.append(root);
        this.root = root;
        this.dom = {
            card: root.querySelector(".field-edit-card"),
            name: root.querySelector("[data-name]"),
            state: root.querySelector("[data-state]"),
            keys: root.querySelector("[data-keys]"),
            toasts: root.querySelector("[data-toasts]"),
        };
    }

    invalidate() {
        this.dirty = true;
    }

    /** Redraw when what it shows has changed. */
    sync() {
        const field = this.field;
        const editor = field.editor;
        const session = editor.session;
        const visible = field.engaged;

        // Toasts outlive the selection: "Undo Delete" arrives after it has gone.
        const toasts = this.dom.toasts.childElementCount > 0;
        const signature = visible
            ? [editor.selection?.key, session?.describe(), session?.status.ok, session?.status.soft, editor.shift].join("|")
            : "";
        if (!this.dirty && signature === this.signature && visible === !this.dom.card.hidden) return;
        this.dirty = false;
        this.signature = signature;

        this.root.hidden = !visible && !toasts;
        this.dom.card.hidden = !visible;
        document.body.classList.toggle("field-selected", visible);
        document.body.classList.toggle("field-moving", Boolean(visible && session));
        if (!visible) return;

        if (session) {
            const status = session.status;
            this.dom.name.textContent = session.describe();
            this.dom.state.className = !status.ok ? (status.soft ? "is-warn" : "is-bad") : "";
            this.dom.state.textContent = !status.ok
                ? status.soft
                    ? `Stopped at ${status.blocker.label}`
                    : `Doesn't fit — ${blockedText(status)}`
                : session.source === "gizmo" || session.source === "drag"
                  ? STEER[session.source === "gizmo" ? "gizmo" : "move"]
                  : STEER[session.kind];
            this.renderKeys([
                ["X Y Z", "Axis"],
                ["0-9", "Value"],
                ["⇧", editor.snapEnabled ? "No snapping" : "Snapping"],
                ["Click / ↵", "Confirm"],
                ["Right-click / Esc", "Cancel"],
            ]);
        } else {
            this.dom.name.textContent = editor.selection.label;
            this.dom.state.className = "";
            this.dom.state.textContent = "Selected · walking resumes when you're done";
            this.renderKeys(IDLE_KEYS);
        }
    }

    renderKeys(keys) {
        this.dom.keys.innerHTML = keys.map(([k, label]) => `<span><kbd>${k}</kbd>${label}</span>`).join("");
    }

    toast(message, kind = "info") {
        const el = document.createElement("div");
        el.className = `field-edit-toast is-${kind}`;
        el.textContent = message;
        this.dom.toasts.append(el);
        this.root.hidden = false;
        while (this.dom.toasts.children.length > 3) this.dom.toasts.firstChild.remove();
        setTimeout(() => el.classList.add("is-leaving"), kind === "info" ? 1800 : 3200);
        setTimeout(() => {
            el.remove();
            this.dirty = true;
        }, kind === "info" ? 2200 : 3600);
    }

    dispose() {
        document.body.classList.remove("field-selected", "field-moving");
        this.root.remove();
    }
}

/** Visible all the way up. */
function isShown(object) {
    for (let node = object; node; node = node.parent) {
        if (!node.visible) return false;
    }
    return true;
}

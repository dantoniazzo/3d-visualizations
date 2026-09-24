import { AXES, AXIS_CSS } from "./axes.js";
import { blockedText } from "./Editor.js";
import Collections from "./Collections.js";

/**
 * Edit mode's chrome, laid out the way Blender's default workspace is: a
 * header along the top (mode, menus, orientation, snapping), the tool
 * shelf down the left, the outliner and properties down the right, key
 * hints along the bottom, and the navigation gizmo in the viewport's
 * corner. The canvas is resized to the space in between.
 *
 * It only reads from and calls into the Editor; nothing in here decides
 * what an edit does.
 */

const ICONS = {
    select: '<path d="M4 2l8 7-3.6.4L10.6 14l-1.7.8-2.2-4.6L4 12.6z"/>',
    move: '<path d="M8 1l2.2 2.3H8.8v3.9h3.9V5.8L15 8l-2.3 2.2V8.8H8.8v3.9h1.4L8 15l-2.2-2.3h1.4V8.8H3.3v1.4L1 8l2.3-2.2v1.4h3.9V3.3H5.8z"/>',
    rotate: '<path d="M8 2a6 6 0 0 1 5.6 3.9l1.2-.5-.6 3.4-3-1.7 1.1-.5A4.4 4.4 0 1 0 12.4 9h1.6A6 6 0 1 1 8 2z"/>',
    scale: '<path d="M2 6h1.6v6.4H10V14H2zM6 2h8v8h-1.6V4.7L7.1 10 6 8.9l5.3-5.3H6z"/>',
    add: '<path d="M7.2 2h1.6v5.2H14v1.6H8.8V14H7.2V8.8H2V7.2h5.2z"/>',
    edit: '<path d="M11.3 1.9l2.8 2.8-8.4 8.4-3.5.7.7-3.5zM3.8 11l-.3 1.5 1.5-.3z"/>',
    walk: '<circle cx="9" cy="2.6" r="1.6"/><path d="M7.4 5.2l2.4-.4 1.6 3 2.1.7-.4 1.2-2.7-.9-.7-1.4-.6 2.6 2 1.8V15H9.8v-2.6L7.9 10.8 7 15H5.6l1.4-7-1.6.9V11H4V8z"/>',
    magnet: '<path d="M3 2h3v6a2 2 0 0 0 4 0V2h3v6A5 5 0 0 1 3 8zM3 3.6v1.6h3V3.6zm7 0v1.6h3V3.6z"/>',
    orient: '<path d="M2 14V3.5L1 4.6 0 3.5 2.8.8l2.8 2.7-1 1.1-1-1.1v9h9l-1.1-1 1.1-1 2.7 2.8-2.7 2.8-1.1-1 1.1-1z"/>',
    layers: '<path d="M8 1.5l7 3.8-7 3.8-7-3.8zM2.7 8.3L8 11.2l5.3-2.9L15 9.2l-7 3.8-7-3.8z"/>',
    furniture: '<path d="M2 7a1.5 1.5 0 0 1 3 0v1.5h6V7a1.5 1.5 0 0 1 3 0v5h-1.5v1.5H11V12H5v1.5H3.5V12H2zM4 3h8a1.5 1.5 0 0 1 1.5 1.5v.9A2.6 2.6 0 0 0 9.9 7.5H6.1A2.6 2.6 0 0 0 2.5 5.4v-.9A1.5 1.5 0 0 1 4 3z"/>',
    stairs: '<path d="M1 14V11h3.5V7.5H8V4h3.5V1H15v1.6h-2V5.6H9.6V9.1H6.1v3.5H2.6V14z"/>',
    hole: '<path d="M1 3h14v10H1zm1.6 1.6v6.8h10.8V4.6z"/><path d="M4 6h8v4H4z" opacity=".45"/>',
    door: '<path d="M3 1h10v13h1.5v1.5h-13V14H3zm1.6 1.6V14h6.8V2.6zM9.5 8a.8.8 0 1 1 0 .01z"/>',
    window: '<path d="M2 2h12v12H2zm1.5 1.5v3.8h3.8V3.5zm5.2 0v3.8h3.8V3.5zM3.5 8.7v3.8h3.8V8.7zm5.2 0v3.8h3.8V8.7z"/>',
    car: '<path d="M3.2 5.2L4.6 2.5h6.8l1.4 2.7L14.5 6v5h-1.6v1.6h-2V11H5.1v1.6h-2V11H1.5V6zm2-1.1l-.8 1.6h7.2l-.8-1.6zM3.8 7.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm8.4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>',
    lock: '<path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2H13v7.5H3V7zM6 7h4V5a2 2 0 0 0-4 0z"/>',
    chevron: '<path d="M5.2 3.5L9.7 8l-4.5 4.5-1.1-1.1L7.5 8 4.1 4.6z"/>',
    zoom: '<path d="M6.5 1a5.5 5.5 0 0 1 4.4 8.8l3.8 3.8-1.1 1.1-3.8-3.8A5.5 5.5 0 1 1 6.5 1zm0 1.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8z"/>',
    pan: '<path d="M7.2 1.5a1 1 0 0 1 1.6 0v5h.6V2.7a1 1 0 0 1 2 0v4.6h.6V4.1a1 1 0 0 1 2 0v6.4A4.5 4.5 0 0 1 9.5 15h-1A4.6 4.6 0 0 1 4.8 13L2 8.9a1 1 0 0 1 1.6-1.2l1.6 1.8V3a1 1 0 0 1 2 0v3.5z"/>',
    grid: '<path d="M1 1h14v14H1zm1.5 1.5v4.2h4.2V2.5zm5.8 0v4.2h4.2V2.5zM2.5 8.3v4.2h4.2V8.3zm5.8 0v4.2h4.2V8.3z"/>',
    frame: '<path d="M1 1h5v1.6H2.6V6H1zm9 0h5v5h-1.6V2.6H10zM1 10h1.6v3.4H6V15H1zm12.4 0H15v5h-5v-1.6h3.4zM5.5 5.5h5v5h-5z"/>',
    menu: '<path d="M2 3.5h12V5H2zm0 3.8h12v1.5H2zm0 3.7h12v1.5H2z"/>',
    eye: '<path d="M8 3.5c3.2 0 5.7 2.1 7 4.5-1.3 2.4-3.8 4.5-7 4.5S2.3 10.4 1 8c1.3-2.4 3.8-4.5 7-4.5zm0 1.6A2.9 2.9 0 1 0 8 11a2.9 2.9 0 0 0 0-5.9zm0 1.5a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z"/>',
    eyeOff: '<path d="M2.3 1.2l12.5 12.5-1.1 1.1-2.2-2.2A7.6 7.6 0 0 1 8 12.5C4.8 12.5 2.3 10.4 1 8a9 9 0 0 1 2.6-3L1.2 2.3zM5 6.3A2.9 2.9 0 0 0 9.7 10.4zM8 3.5c3.2 0 5.7 2.1 7 4.5a8.9 8.9 0 0 1-1.8 2.3L10.9 8A2.9 2.9 0 0 0 8 5.1l-.4.1L5.9 3.8A7.7 7.7 0 0 1 8 3.5z"/>',
    xray: '<path d="M1 1h9v9H1zm1.5 1.5v6h6v-6z"/><path d="M6 6h9v9H6z" opacity=".5"/>',
    floor: '<path d="M8 2l7 4v1.7L8 3.7 1 7.7V6zm-7 7l7-4 7 4-7 4z"/>',
    room: '<path d="M1.5 1.5h13v13h-13zM3 3v10h10V3zm2 2h6v6H5z" opacity=".9"/>',
    roof: '<path d="M8 1.5l7 6.2-1 1.2-1-.9V14H3V8l-1 .9-1-1.2zm0 2.1L4.6 6.6V12.5h6.8V6.6z"/>',
    outside: '<path d="M8 1l4 5h-2l3 4H9v5H7v-5H3l3-4H4z"/>',
    close: '<path d="M3.6 2.5L8 6.9l4.4-4.4 1.1 1.1L9.1 8l4.4 4.4-1.1 1.1L8 9.1l-4.4 4.4-1.1-1.1L6.9 8 2.5 3.6z"/>',
};

const icon = (name, size = 16) =>
    `<svg class="ed-icon" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${ICONS[name] || ""}</svg>`;

const INCREMENTS = [
    [0.01, "1 cm"],
    [0.05, "5 cm"],
    [0.1, "10 cm"],
    [0.25, "25 cm"],
    [0.5, "50 cm"],
    [1, "1 m"],
];

const escape = (value) => {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
};

export default class EditorUI {
    constructor(editor) {
        this.editor = editor;
        /** Outliner rows opened or closed by hand, over their defaults. */
        this.openState = new Map();
        this.filter = "";
        this.dirtyOutliner = true;
        this.dirtyProperties = true;

        this.build();
        this.bind();

        editor.on("selection", () => {
            this.dirtyProperties = true;
            this.markSelection();
        });
        editor.on("changed", () => {
            this.dirtyOutliner = true;
            this.dirtyProperties = true;
        });
        editor.on("settings", () => this.syncSettings());
    }

    // ------------------------------------------------------------------
    // Markup
    // ------------------------------------------------------------------

    build() {
        const root = document.createElement("div");
        root.className = "ed";
        root.hidden = true;
        root.innerHTML = `
            <header class="ed-header">
                <div class="ed-bar">
                    <button class="ed-btn ed-app" data-menu="file" title="Space">${icon("menu")}</button>
                    <div class="ed-modes" role="group" aria-label="Mode">
                        <button data-mode="edit" class="is-active" title="Edit Mode (Tab)">${icon("edit")}<span>Edit Mode</span></button>
                        <button data-mode="walk" title="Walkthrough (Tab)">${icon("walk")}<span>Walkthrough</span></button>
                    </div>
                    <button class="ed-menu" data-menu="view">View</button>
                    <button class="ed-menu" data-menu="add">Add</button>
                    <button class="ed-menu" data-menu="object">Object</button>
                </div>
                <div class="ed-bar ed-bar-right">
                    <label class="ed-select" title="Transform orientation">
                        ${icon("orient")}
                        <select data-setting="orientation">
                            <option value="global">Global</option>
                            <option value="local">Local</option>
                        </select>
                    </label>
                    <div class="ed-snap">
                        <button class="ed-toggle" data-action="snap" title="Snapping (Shift Tab). Hold Shift while moving to place freely.">${icon("magnet")}</button>
                        <label class="ed-select" title="Snap increment">
                            <select data-setting="increment">
                                ${INCREMENTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
                            </select>
                        </label>
                    </div>
                    <label class="ed-select ed-focus-select" title="Work on one floor or one room — everything else is hidden (Page Up / Page Down, /)">
                        ${icon("layers")}
                        <select data-setting="focus"></select>
                    </label>
                    <button class="ed-toggle" data-action="xray" title="X-ray: see through walls, ceilings and roof (Alt Z)">${icon("xray")}</button>
                    <button class="ed-btn ed-walk" data-action="walk-here" title="Stand where the view is pointing and start walking">${icon("walk")}<span>Walk from here</span></button>
                    <span class="ed-save" data-save>Saved</span>
                </div>
            </header>
            <nav class="ed-toolbar" aria-label="Tools">
                <button data-tool="select" title="Select (W)">${icon("select", 18)}</button>
                <button data-tool="move" title="Move (G)">${icon("move", 18)}</button>
                <button data-tool="rotate" title="Rotate (R)">${icon("rotate", 18)}</button>
                <button data-tool="scale" title="Scale (S)">${icon("scale", 18)}</button>
                <span class="ed-toolbar-sep"></span>
                <button data-action="add" title="Add (Shift A)">${icon("add", 18)}</button>
            </nav>
            <aside class="ed-sidebar">
                <section class="ed-panel ed-outliner">
                    <header class="ed-panel-head">
                        <span>Outliner</span>
                        <input type="search" placeholder="Filter" data-filter aria-label="Filter the outliner" />
                    </header>
                    <div class="ed-outliner-list" data-outliner></div>
                </section>
                <section class="ed-panel ed-props">
                    <header class="ed-panel-head"><span>Properties</span></header>
                    <div class="ed-props-body" data-properties></div>
                </section>
            </aside>
            <footer class="ed-status">
                <span class="ed-hints" data-hints></span>
                <span class="ed-stats" data-stats></span>
            </footer>
            <div class="ed-viewport">
                <div class="ed-view-label" data-view-label></div>
                <div class="ed-focus-chip" data-focus-chip hidden></div>
                <div class="ed-modal" data-modal hidden></div>
                <div class="ed-nav">
                    <svg class="ed-nav-axes" viewBox="-50 -50 100 100" data-nav></svg>
                    <div class="ed-nav-buttons">
                        <button data-nav-drag="zoom" title="Zoom — drag up and down">${icon("zoom")}</button>
                        <button data-nav-drag="pan" title="Pan — drag">${icon("pan")}</button>
                        <button data-action="ortho" title="Perspective / Orthographic (Numpad 5)">${icon("grid")}</button>
                        <button data-action="frame-all" title="Frame all (Home)">${icon("frame")}</button>
                    </div>
                </div>
                <div class="ed-toasts" data-toasts></div>
            </div>
            <div class="ed-popup" data-popup hidden></div>
        `;
        document.body.append(root);
        this.root = root;

        const $ = (selector) => root.querySelector(selector);
        this.dom = {
            outliner: $("[data-outliner]"),
            properties: $("[data-properties]"),
            filter: $("[data-filter]"),
            hints: $("[data-hints]"),
            stats: $("[data-stats]"),
            save: $("[data-save]"),
            modal: $("[data-modal]"),
            viewLabel: $("[data-view-label]"),
            nav: $("[data-nav]"),
            toasts: $("[data-toasts]"),
            popup: $("[data-popup]"),
            orientation: $('[data-setting="orientation"]'),
            increment: $('[data-setting="increment"]'),
            focus: $('[data-setting="focus"]'),
            xray: $('[data-action="xray"]'),
            focusChip: $("[data-focus-chip]"),
            snap: $('[data-action="snap"]'),
        };

        this.buildNavGizmo();
    }

    buildNavGizmo() {
        const svg = this.dom.nav;
        svg.innerHTML = `<circle class="ed-nav-bg" r="48"/>`;
        this.navItems = [];
        for (const axis of ["x", "y", "z"]) {
            for (const sign of [1, -1]) {
                const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                g.classList.add("ed-nav-axis");
                g.dataset.axis = axis;
                g.dataset.sign = sign;
                const color = AXIS_CSS[axis];
                g.innerHTML =
                    sign > 0
                        ? `<line x1="0" y1="0" stroke="${color}" stroke-width="2.4"/><circle r="8.5" fill="${color}"/><text text-anchor="middle" dy="3.6">${axis.toUpperCase()}</text>`
                        : `<circle r="7.5" fill="${color}" fill-opacity=".35" stroke="${color}" stroke-width="1.5"/>`;
                svg.append(g);
                this.navItems.push({ g, axis, sign, line: g.querySelector("line") });
            }
        }
    }

    // ------------------------------------------------------------------
    // Wiring
    // ------------------------------------------------------------------

    bind() {
        const editor = this.editor;
        const root = this.root;

        root.addEventListener("click", (event) => {
            const target = event.target.closest("button, [data-key], [data-collection]");
            if (!target || !root.contains(target)) return;

            if (target.dataset.mode) return editor.setMode(target.dataset.mode);
            if (target.dataset.tool) return editor.setTool(target.dataset.tool);
            if (target.dataset.menu) return this.openMenu(target.dataset.menu, target);
            if (target.dataset.toggle) return this.toggleOpen(target.dataset.toggle);
            if (target.dataset.eye) return editor.toggleHidden(target.dataset.eye);
            if (target.dataset.clearFocus !== undefined) return editor.setFocus(null);
            if (target.dataset.key && target.closest("[data-outliner]")) return this.selectFromOutliner(target.dataset.key);
            if (target.dataset.collection !== undefined) {
                if (target.dataset.focusable !== undefined) editor.toggleFocus(target.dataset.collection);
                else this.toggleOpen(target.dataset.collection);
                return;
            }
            if (target.dataset.propAction) return editor.runAction(target.dataset.propAction);

            switch (target.dataset.action) {
                case "snap":
                    return editor.setSnap(!editor.snapEnabled);
                case "xray":
                    return editor.setXray(!editor.xray);
                case "walk-here":
                    return editor.walkFromHere();
                case "add": {
                    const rect = editor.canvas.getBoundingClientRect();
                    return this.showAddMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, target);
                }
                case "ortho":
                    return editor.view.toggleOrtho();
                case "frame-all":
                    return editor.frameAll();
                default:
                    return;
            }
        });

        root.addEventListener("dblclick", (event) => {
            if (event.target.closest("[data-outliner] [data-key]")) editor.frameSelected();
        });

        this.dom.orientation.addEventListener("change", (e) => editor.setOrientation(e.target.value));
        this.dom.increment.addEventListener("change", (e) => editor.setIncrement(Number(e.target.value)));
        this.dom.focus.addEventListener("change", (e) => {
            editor.setFocus(Collections.parse(e.target.value));
            e.target.blur();
        });
        for (const select of [this.dom.orientation, this.dom.increment]) {
            select.addEventListener("change", () => select.blur());
        }
        this.dom.filter.addEventListener("input", (e) => {
            this.filter = e.target.value.trim().toLowerCase();
            this.dirtyOutliner = true;
        });
        this.dom.filter.addEventListener("keydown", (e) => {
            if (e.key === "Escape") e.target.blur();
        });

        this.bindNavGizmo();
        this.bindProperties();
    }

    bindNavGizmo() {
        const editor = this.editor;
        let drag = null;

        const start = (mode, event) => {
            event.preventDefault();
            drag = { mode, x: event.clientX, y: event.clientY, moved: false, target: event.target };
            event.currentTarget.setPointerCapture(event.pointerId);
        };
        const move = (event) => {
            if (!drag) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
            drag.x = event.clientX;
            drag.y = event.clientY;
            if (drag.mode === "orbit") editor.view.orbit(dx, dy);
            else if (drag.mode === "pan") editor.view.pan(dx, dy);
            else editor.view.zoom(Math.exp(dy * 0.012));
        };
        const end = () => {
            if (drag && !drag.moved && drag.mode === "orbit") {
                const bubble = drag.target.closest?.(".ed-nav-axis");
                if (bubble) this.alignTo(bubble.dataset.axis, Number(bubble.dataset.sign));
            }
            drag = null;
        };

        this.dom.nav.addEventListener("pointerdown", (e) => start("orbit", e));
        this.dom.nav.addEventListener("pointermove", move);
        this.dom.nav.addEventListener("pointerup", end);
        for (const button of this.root.querySelectorAll("[data-nav-drag]")) {
            button.addEventListener("pointerdown", (e) => start(button.dataset.navDrag, e));
            button.addEventListener("pointermove", move);
            button.addEventListener("pointerup", end);
        }
    }

    /** Clicking an axis bubble looks down that axis, as in Blender. */
    alignTo(axis, sign) {
        const view = { x: ["right", "left"], y: ["back", "front"], z: ["top", "bottom"] }[axis][sign > 0 ? 0 : 1];
        this.editor.view.setView(view);
    }

    bindProperties() {
        const body = this.dom.properties;
        let scrub = null;

        body.addEventListener("pointerdown", (event) => {
            const box = event.target.closest(".ed-num");
            if (!box || document.activeElement === box.querySelector("input")) return;
            event.preventDefault();
            const input = box.querySelector("input");
            scrub = {
                box,
                input,
                x: event.clientX,
                start: parseFloat(input.value) || 0,
                step: Number(box.dataset.step) || 0.01,
                moved: false,
            };
            box.setPointerCapture(event.pointerId);
        });
        body.addEventListener("pointermove", (event) => {
            if (!scrub) return;
            const dx = event.clientX - scrub.x;
            if (!scrub.moved && Math.abs(dx) < 3) return;
            scrub.moved = true;
            const fine = event.shiftKey ? 0.1 : 1;
            let value = scrub.start + Math.round(dx / 4) * scrub.step * fine;
            if (scrub.box.dataset.integer) value = Math.round(value);
            scrub.input.value = formatNumber(value, scrub.step);
        });
        body.addEventListener("pointerup", () => {
            if (!scrub) return;
            const { input, moved, box } = scrub;
            scrub = null;
            if (moved) this.commitField(box, input.value);
            else {
                input.focus();
                input.select();
            }
        });

        body.addEventListener("keydown", (event) => {
            const input = event.target.closest(".ed-num input");
            if (!input) return;
            if (event.key === "Enter") {
                event.preventDefault();
                input.blur();
            } else if (event.key === "Escape") {
                input.value = input.dataset.original;
                input.blur();
            }
            event.stopPropagation();
        });
        body.addEventListener(
            "blur",
            (event) => {
                const input = event.target.closest?.(".ed-num input");
                if (input && input.value !== input.dataset.original) this.commitField(input.closest(".ed-num"), input.value);
            },
            true
        );
        body.addEventListener("change", (event) => {
            const select = event.target.closest("select[data-key]");
            if (!select) return;
            const value = select.dataset.numeric ? Number(select.value) : select.value;
            this.editor.setProperty(select.dataset.key, value);
            select.blur();
        });
    }

    commitField(box, raw) {
        const value = evaluate(raw);
        if (value === null) {
            this.toast("That isn't a number", "error");
            this.dirtyProperties = true;
            return;
        }
        this.editor.setProperty(box.dataset.key, box.dataset.integer ? Math.round(value) : value);
        this.dirtyProperties = true;
    }

    // ------------------------------------------------------------------
    // Visibility
    // ------------------------------------------------------------------

    show() {
        this.root.hidden = false;
        this.renderFocusOptions();
        this.syncSettings();
        this.dirtyOutliner = true;
        this.dirtyProperties = true;
    }

    hide() {
        this.root.hidden = true;
        this.closePopups();
    }

    toggleSidebar() {
        document.body.classList.toggle("ed-no-sidebar");
    }

    toggleToolbar() {
        document.body.classList.toggle("ed-no-toolbar");
    }

    setCursor(cursor) {
        this.editor.canvas.style.cursor = cursor;
    }

    syncSettings() {
        const editor = this.editor;
        for (const button of this.root.querySelectorAll("[data-tool]")) {
            button.classList.toggle("is-active", button.dataset.tool === editor.tool);
        }
        this.dom.orientation.value = editor.orientation;
        this.dom.increment.value = String(editor.increment);
        this.dom.focus.value = Collections.key(editor.focus);
        this.dom.snap.classList.toggle("is-on", editor.snapEnabled);
        this.dom.xray.classList.toggle("is-on", editor.xray);

        // The chip says what is being worked on, and gets back out of it.
        const chip = this.dom.focusChip;
        chip.hidden = !editor.focus;
        if (editor.focus) {
            chip.innerHTML = `${icon(editor.focus.type === "room" ? "room" : editor.focus.type === "outside" ? "outside" : "floor", 13)}
                <span>${escape(editor.collections.describe(editor.focus))}</span>
                <button data-clear-focus title="Show the whole property (/)">${icon("close", 11)}</button>`;
        }

        this.dirtyHints = true;
        this.dirtyOutliner = true;
    }

    renderFocusOptions() {
        const groups = this.editor.focusOptions();
        this.dom.focus.innerHTML =
            `<option value="">Whole property</option>` +
            groups
                .map(
                    (g) => `<optgroup label="${escape(g.label)}">${g.options
                        .map((o) => `<option value="${escape(o.value)}">${escape(o.label)}</option>`)
                        .join("")}</optgroup>`
                )
                .join("");
        this.dom.focus.value = Collections.key(this.editor.focus);
    }

    // ------------------------------------------------------------------
    // Per frame
    // ------------------------------------------------------------------

    update() {
        if (this.dirtyOutliner) this.renderOutliner();
        // Live during a drag, as Blender's N panel is, but at a few frames a
        // second rather than every one.
        const now = performance.now();
        const throttled = this.editor.session && now - (this.propertiesAt || 0) < 120;
        if (this.dirtyProperties && !throttled && !this.isEditingField()) {
            this.propertiesAt = now;
            this.renderProperties();
        }
        if (this.dirtyHints) this.renderHints();
        this.updateNavGizmo();

        const editor = this.editor;
        const label = `${editor.view.label} · ${editor.collections.describe(editor.focus)}${editor.xray ? " · X-ray" : ""}`;
        if (label !== this.viewLabel) {
            this.viewLabel = label;
            this.dom.viewLabel.textContent = label;
        }
    }

    isEditingField() {
        return this.dom.properties.contains(document.activeElement) && document.activeElement.tagName === "INPUT";
    }

    updateNavGizmo() {
        const camera = this.editor.view.camera;
        const inverse = camera.quaternion.clone().invert();
        const items = this.navItems.map((item) => {
            const v = AXES[item.axis].clone().multiplyScalar(item.sign).applyQuaternion(inverse);
            return { ...item, x: v.x * 34, y: -v.y * 34, depth: v.z };
        });
        items.sort((a, b) => a.depth - b.depth);
        for (const item of items) {
            item.g.setAttribute("transform", `translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})`);
            if (item.line) {
                item.line.setAttribute("x2", (-item.x).toFixed(1));
                item.line.setAttribute("y2", (-item.y).toFixed(1));
            }
            this.dom.nav.append(item.g);
        }
    }

    // ------------------------------------------------------------------
    // Outliner
    // ------------------------------------------------------------------

    /**
     * The outliner's tree: each floor, its rooms and the pieces in them,
     * then the site outside and the roof. Stairs and floor openings, and
     * doors and windows, get a group of their own on each floor — they
     * belong to the floor more than to any one room.
     */
    outlinerTree() {
        const editor = this.editor;
        const collections = editor.collections;

        const floors = collections.floors().map((floor) => ({
            id: floor.id,
            kind: "floor",
            title: floor.name,
            focusable: true,
            rooms: floor.rooms.map((room) => ({ id: `room:${room.id}`, kind: "room", title: room.name, focusable: true, items: [] })),
            stairs: { id: `${floor.id}:stairs`, kind: "group", title: "Stairs & floor openings", items: [] },
            openings: { id: `${floor.id}:openings`, kind: "group", title: "Doors & windows", items: [] },
            loose: { id: `${floor.id}:loose`, kind: "group", title: "Not in a room", items: [] },
        }));
        const outside = {
            id: "outside",
            kind: "outside",
            title: "Outside",
            focusable: true,
            rooms: collections.outdoorRooms().map((room) => ({ id: `room:${room.id}`, kind: "room", title: room.name, focusable: true, items: [], outdoor: true })),
            loose: { id: "outside:loose", kind: "group", title: "On the site", items: [] },
        };

        const floorOf = (level) => floors[level] || floors[0];
        const roomIn = (holder, roomId) => holder.rooms.find((r) => r.id === `room:${roomId}`);

        for (const editable of editor.editables.values()) {
            const member = collections.membership(editable);
            if (member.outside) {
                (roomIn(outside, member.rooms?.[0]) || outside.loose).items.push(editable);
                continue;
            }
            const floor = floorOf(member.levels?.[0] ?? 0);
            if (!floor) continue;
            if (editable.type === "stair" || editable.type === "hole") floor.stairs.items.push(editable);
            else if (editable.type === "opening") floor.openings.items.push(editable);
            else (roomIn(floor, member.rooms?.[0]) || floor.loose).items.push(editable);
        }

        const sort = (list) => list.sort((a, b) => a.label.localeCompare(b.label));
        for (const floor of floors) {
            floor.children = [...floor.rooms, floor.stairs, floor.openings, floor.loose];
            floor.children.forEach((c) => sort(c.items));
        }
        // Only the outdoor slabs with something on them are worth a row.
        outside.children = [...outside.rooms.filter((r) => r.items.length), outside.loose];
        outside.children.forEach((c) => sort(c.items));

        const tree = [...floors, outside];
        if (editor.builder.roofGroups?.length || editor.builder.model?.children.some((n) => /^roof/i.test(n.name))) {
            tree.push({ id: "roof", kind: "roof", title: "Roof", children: [] });
        }
        return tree;
    }

    /** Open unless closed by hand; rooms and groups start closed on big scenes. */
    isOpen(node, depth) {
        if (this.openState.has(node.id)) return this.openState.get(node.id);
        if (depth === 0) return true;
        if (node.kind === "group") return node.id.endsWith(":stairs");
        const focus = this.editor.focus;
        if (focus?.type === "room") return node.id === `room:${focus.room}`;
        return this.editor.editables.size < 60;
    }

    toggleOpen(id) {
        const node = this.findNode(id);
        const depth = node ? node.depth : 1;
        this.openState.set(id, !this.isOpen({ id, kind: node?.kind }, depth));
        this.dirtyOutliner = true;
    }

    findNode(id) {
        for (const top of this.lastTree || []) {
            if (top.id === id) return { ...top, depth: 0 };
            for (const child of top.children || []) if (child.id === id) return { ...child, depth: 1 };
        }
        return null;
    }

    renderOutliner() {
        this.dirtyOutliner = false;
        const editor = this.editor;
        const filter = this.filter;
        const selected = editor.selection?.key;
        const focusKey = Collections.key(editor.focus);
        const tree = this.outlinerTree();
        this.lastTree = tree;

        const collections = editor.collections;
        const shownItem = (e) => collections.shows(collections.membership(e), editor.focus, editor.hiddenCollections);
        const matches = (e) => !filter || e.label.toLowerCase().includes(filter);
        const count = (node) => (node.items?.filter(matches).length || 0) + (node.children || []).reduce((n, c) => n + count(c), 0);

        const collectionRow = (node, depth, open) => {
            const hidden = editor.isHidden(node.id);
            const focused = focusKey === node.id;
            const kindIcon = { floor: "floor", room: node.outdoor ? "outside" : "room", outside: "outside", roof: "roof", group: node.id.endsWith(":openings") ? "door" : node.id.endsWith(":stairs") ? "stairs" : "furniture" }[node.kind];
            const hasChildren = (node.children?.length || node.items?.length) > 0;
            const eye = node.kind === "group" ? "" : `<button class="ed-eye${hidden ? " is-off" : ""}" data-eye="${escape(node.id)}" title="${hidden ? "Show" : "Hide"} ${escape(node.title)}">${icon(hidden ? "eyeOff" : "eye", 14)}</button>`;
            const title = node.focusable ? `Work on ${node.title} alone — click again to show everything` : "";
            return `
                <div class="ed-tree-row is-${node.kind}${open ? " is-open" : ""}${focused ? " is-focus" : ""}${hidden ? " is-hidden" : ""}"
                     data-collection="${escape(node.id)}" ${node.focusable ? "data-focusable" : ""} style="--depth:${depth}" title="${escape(title)}">
                    ${hasChildren ? `<button class="ed-disclose" data-toggle="${escape(node.id)}" aria-label="Expand">${icon("chevron", 11)}</button>` : `<span class="ed-disclose"></span>`}
                    ${icon(kindIcon, 13)}
                    <span class="ed-tree-label">${escape(node.title)}</span>
                    <em>${node.kind === "roof" ? "fixed" : count(node) || ""}</em>
                    ${eye}
                </div>`;
        };

        const html = [];
        html.push(`
            <div class="ed-tree-row is-scene${!editor.focus ? " is-focus" : ""}" data-collection="" data-focusable style="--depth:0" title="Show the whole property">
                <span class="ed-disclose"></span>${icon("layers", 13)}<span class="ed-tree-label">${escape(editor.builder.spec.name)}</span>
            </div>`);

        const walk = (node, depth) => {
            if (filter && !count(node) && node.kind !== "roof") return;
            const open = filter ? true : this.isOpen(node, depth);
            html.push(collectionRow(node, depth, open));
            if (!open) return;
            for (const child of node.children || []) {
                if (child.kind === "group" && !child.items.length) continue;
                walk(child, depth + 1);
            }
            for (const e of (node.items || []).filter(matches)) {
                const dim = !shownItem(e);
                html.push(`
                    <div class="ed-row${e.key === selected ? " is-selected" : ""}${dim ? " is-dim" : ""}" data-key="${escape(e.key)}" style="--depth:${depth + 1}">
                        ${icon(e.icon, 14)}<span class="ed-row-label">${escape(e.label)}</span>
                        <span class="ed-row-sub">${escape(e.subtitle)}</span>
                    </div>`);
            }
        };
        for (const node of tree) walk(node, 0);

        html.push(`
            <div class="ed-tree-row is-locked" style="--depth:0" title="Walls, floors and ceilings are fixed. Doors and windows slide along their walls.">
                <span class="ed-disclose"></span>${icon("lock", 12)}<span class="ed-tree-label">Walls, floors & ceilings</span><em>fixed</em>
            </div>`);

        const scroll = this.dom.outliner.scrollTop;
        this.dom.outliner.innerHTML = html.join("");
        this.dom.outliner.scrollTop = scroll;
        if (this.scrollToSelection) {
            this.scrollToSelection = false;
            this.dom.outliner.querySelector(".ed-row.is-selected")?.scrollIntoView({ block: "nearest" });
        }
        this.renderStats();
    }

    /**
     * Clicking a piece in the outliner selects it. One hidden by the
     * current focus brings its room into focus first, so the selection is
     * never something that cannot be seen.
     */
    selectFromOutliner(key) {
        const editor = this.editor;
        const editable = editor.editables.get(key);
        if (!editable) return;
        const collections = editor.collections;
        const member = collections.membership(editable);
        if (!collections.shows(member, editor.focus, editor.hiddenCollections)) {
            const room = member.rooms?.[0];
            const focus = room
                ? { type: "room", room }
                : member.outside
                  ? { type: "outside" }
                  : { type: "level", level: member.levels?.[0] ?? 0 };
            for (const id of [`room:${room}`, `level:${member.levels?.[0]}`, "outside"]) editor.hiddenCollections.delete(id);
            editor.setFocus(editor.focus ? focus : null, { frame: Boolean(editor.focus) });
        }
        editor.select(editable);
    }

    markSelection() {
        const key = this.editor.selection?.key;
        let row = null;
        for (const el of this.dom.outliner.querySelectorAll("[data-key]")) {
            const on = el.dataset.key === key;
            el.classList.toggle("is-selected", on);
            if (on) row = el;
        }
        if (key && !row) {
            // Open the rows above it so it can be seen.
            const tree = this.lastTree || this.outlinerTree();
            for (const top of tree) {
                for (const child of top.children || []) {
                    if (child.items?.some((e) => e.key === key)) {
                        this.openState.set(top.id, true);
                        this.openState.set(child.id, true);
                    }
                }
            }
            this.dirtyOutliner = true;
            this.scrollToSelection = true;
        }
        row?.scrollIntoView({ block: "nearest" });
        this.dirtyHints = true;
    }

    renderStats() {
        const count = this.editor.editables.size;
        this.dom.stats.textContent = `${this.editor.builder.spec.name} · ${count} editable objects`;
    }

    // ------------------------------------------------------------------
    // Properties
    // ------------------------------------------------------------------

    renderProperties() {
        this.dirtyProperties = false;
        const editable = this.editor.selection;
        const body = this.dom.properties;

        if (!editable) {
            body.innerHTML = `
                <div class="ed-props-empty">
                    <p><b>Nothing selected.</b> Click a piece in the viewport or the outliner.</p>
                    <ul class="ed-keys">
                        <li><kbd>G</kbd> move · <kbd>R</kbd> rotate · <kbd>S</kbd> scale</li>
                        <li>then <kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd> to lock an axis, or type a value</li>
                        <li>hold <kbd>Shift</kbd> to place without snapping</li>
                        <li><kbd>Shift</kbd> <kbd>A</kbd> add · <kbd>Shift</kbd> <kbd>D</kbd> duplicate · <kbd>X</kbd> delete</li>
                        <li>middle drag or <kbd>Alt</kbd> drag to orbit, with <kbd>Shift</kbd> to pan</li>
                        <li><kbd>Tab</kbd> back to the walkthrough</li>
                    </ul>
                </div>`;
            return;
        }

        const sections = editable.properties();
        const caps = editable.caps;
        const actions = [];
        if (caps.duplicate) actions.push({ id: "duplicate", label: "Duplicate" });
        if (caps.gravity) actions.push({ id: "drop", label: "Drop to surface" });
        actions.push({ id: "frame", label: "Frame" });
        if (caps.remove) actions.push({ id: "delete", label: "Delete", danger: true });

        body.innerHTML = `
            <div class="ed-props-title">
                ${icon(editable.icon, 18)}
                <div><b>${escape(editable.label)}</b><span>${escape(editable.subtitle)}</span></div>
            </div>
            ${sections.map((s) => this.renderSection(s)).join("")}
            <div class="ed-actions">
                ${actions
                    .map((a) => `<button class="ed-action${a.danger ? " is-danger" : ""}" data-prop-action="${a.id}">${a.label}</button>`)
                    .join("")}
            </div>`;
    }

    renderSection(section) {
        const fields = (section.fields || []).map((f) => this.renderField(f)).join("");
        const text = section.text ? `<p class="ed-note">${escape(section.text)}</p>` : "";
        const actions = (section.actions || [])
            .map((a) => `<button class="ed-action" data-prop-action="${a.id}">${escape(a.label)}</button>`)
            .join("");
        return `
            <div class="ed-section">
                <h6>${escape(section.title)}</h6>
                ${fields}${text}${actions ? `<div class="ed-actions">${actions}</div>` : ""}
            </div>`;
    }

    renderField(field) {
        const label = `<label>${escape(field.label)}</label>`;
        if (field.type === "select") {
            return `
                <div class="ed-field">${label}
                    <select data-key="${field.key}" ${field.numeric ? "data-numeric" : ""}>
                        ${field.options
                            .map((o) => `<option value="${escape(o.value)}"${String(o.value) === String(field.value) ? " selected" : ""}>${escape(o.label)}</option>`)
                            .join("")}
                    </select>
                </div>`;
        }
        const value = formatNumber(field.value, field.step ?? 0.01);
        const axis = { x: "x", y: "y", z: "z" }[field.key];
        const accent = axis ? ` style="--axis:${AXIS_CSS[axis]}"` : "";
        if (field.readonly) {
            return `<div class="ed-field">${label}<div class="ed-num is-readonly"><span>${value}</span><span class="ed-unit">${field.unit || ""}</span></div></div>`;
        }
        return `
            <div class="ed-field${axis ? " has-axis" : ""}"${accent}>${label}
                <div class="ed-num" data-key="${field.key}" data-step="${field.step ?? 0.01}" ${field.integer ? "data-integer" : ""} title="Drag to change, click to type">
                    <input value="${value}" data-original="${value}" spellcheck="false" />
                    <span class="ed-unit">${field.unit || ""}</span>
                </div>
            </div>`;
    }

    // ------------------------------------------------------------------
    // Transform feedback
    // ------------------------------------------------------------------

    onSession(session) {
        this.editor.field?.hud.invalidate();
        this.dom.modal.hidden = false;
        this.onSessionUpdate(session);
        this.dirtyHints = true;
    }

    onSessionUpdate(session) {
        this.editor.field?.hud.invalidate();
        this.dirtyProperties = true;
        const status = session.status;
        let state;
        if (!status.ok) {
            state = status.soft
                ? `<span class="is-warn">Stopped at ${escape(status.blocker.label)}</span>`
                : `<span class="is-bad">Doesn't fit — ${escape(blockedText(status))}</span>`;
        } else {
            state = this.editor.snapEnabled && !session.shift
                ? `<span class="is-muted">Snapping · hold Shift to place freely</span>`
                : `<span class="is-muted">Free placement</span>`;
        }
        this.dom.modal.innerHTML = `<b>${escape(session.describe())}</b>${state}`;
    }

    onSessionEnd() {
        this.editor.field?.hud.invalidate();
        this.dom.modal.hidden = true;
        this.dirtyProperties = true;
        this.dirtyOutliner = true;
        this.dirtyHints = true;
    }

    renderHints() {
        this.dirtyHints = false;
        const editor = this.editor;
        let hints;
        if (editor.session) {
            hints = [
                ["X Y Z", "Axis"],
                ["⇧ X Y Z", "Plane"],
                ["0-9", "Value"],
                ["⇧ hold", "No snapping"],
                ["↵ / LMB", "Confirm"],
                ["Esc / RMB", "Cancel"],
            ];
        } else if (editor.selection) {
            hints = [
                ["G", "Move"],
                ["R", "Rotate"],
                ["S", "Scale"],
                ["⇧ D", "Duplicate"],
                ["X", "Delete"],
                ["/", "Its room alone"],
                [".", "Frame"],
                ["⌘ Z", "Undo"],
                ["← ↑ ↓ →", "Walk"],
                ["Tab", "Walkthrough"],
            ];
        } else {
            hints = [
                ["LMB", "Select"],
                ["W A S D", "Walk"],
                ["⇧ A", "Add"],
                ["MMB / Alt", "Orbit"],
                ["⇧ MMB", "Pan"],
                ["PgUp PgDn", "Floors"],
                ["Alt Z", "X-ray"],
                ["7 1 3", "Top / Front / Right"],
                ["Tab", "Walkthrough"],
            ];
        }
        this.dom.hints.innerHTML = hints.map(([k, l]) => `<span><kbd>${k}</kbd>${l}</span>`).join("");
    }

    setSaveState(state) {
        const text = { saving: "Saving…", saved: "Saved", error: "Not saved", pending: "Unsaved changes" }[state] || state;
        this.dom.save.textContent = text;
        this.dom.save.dataset.state = state;
    }

    toast(message, kind = "info") {
        // Editing from the walkthrough, this panel is hidden: say it there.
        if (!this.editor.active && this.editor.field) return this.editor.field.hud.toast(message, kind);
        const el = document.createElement("div");
        el.className = `ed-toast is-${kind}`;
        el.textContent = message;
        this.dom.toasts.append(el);
        while (this.dom.toasts.children.length > 3) this.dom.toasts.firstChild.remove();
        setTimeout(() => el.classList.add("is-leaving"), kind === "info" ? 1800 : 3200);
        setTimeout(() => el.remove(), kind === "info" ? 2200 : 3600);
    }

    // ------------------------------------------------------------------
    // Menus
    // ------------------------------------------------------------------

    closePopups() {
        const open = !this.dom.popup.hidden;
        this.dom.popup.hidden = true;
        this.dom.popup.innerHTML = "";
        // The walkthrough's Add menu showed this panel for its popup alone.
        if (this.root.classList.contains("is-field")) {
            this.root.classList.remove("is-field");
            this.root.hidden = !this.editor.active;
            this.editor.field?.onPopupsClosed();
        }
        for (const button of this.root.querySelectorAll("[data-menu].is-open")) button.classList.remove("is-open");
        return open;
    }

    /** Place a popup at a point, kept inside the window. */
    place(x, y) {
        const popup = this.dom.popup;
        popup.hidden = false;
        popup.style.left = "0px";
        popup.style.top = "0px";
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.max(4, Math.min(x, window.innerWidth - rect.width - 4))}px`;
        popup.style.top = `${Math.max(4, Math.min(y, window.innerHeight - rect.height - 4))}px`;
    }

    showMenu(items, x, y) {
        this.dom.popup.className = "ed-popup ed-menu-popup";
        this.dom.popup.innerHTML = items
            .map((item, i) => {
                if (item.separator) return `<hr/>`;
                if (item.heading) return `<h6>${escape(item.heading)}</h6>`;
                return `<button data-item="${i}"${item.disabled ? " disabled" : ""}>
                    <span class="ed-check">${item.checked ? "✓" : ""}</span>
                    <span>${escape(item.label)}</span>
                    <kbd>${escape(item.hint || "")}</kbd>
                </button>`;
            })
            .join("");
        this.dom.popup.onclick = (event) => {
            const button = event.target.closest("[data-item]");
            if (!button) return;
            const item = items[Number(button.dataset.item)];
            this.closePopups();
            item.action?.();
        };
        this.place(x, y);
    }

    openMenu(name, anchor) {
        const wasOpen = anchor.classList.contains("is-open");
        this.closePopups();
        if (wasOpen) return;
        const rect = anchor.getBoundingClientRect();
        if (name === "add") {
            this.showAddMenu(rect.left, rect.bottom + 2, anchor);
            return;
        }
        anchor.classList.add("is-open");
        const editor = this.editor;
        const sel = editor.selection;
        const menus = {
            file: [
                { label: "Save now", hint: "⌘ S", action: () => editor.world.emit("save-now") },
                { separator: true },
                { label: "Walkthrough", hint: "Tab", action: () => editor.leave() },
                { label: "Back to all spaces", action: () => editor.world.emit("leave-space") },
            ],
            view: [
                { label: "Frame selected", hint: ".", action: () => editor.frameSelected(), disabled: !sel },
                { label: "Frame all", hint: "Home", action: () => editor.frameAll() },
                { separator: true },
                { label: "Top", hint: "7", action: () => editor.view.setView("top") },
                { label: "Front", hint: "1", action: () => editor.view.setView("front") },
                { label: "Right", hint: "3", action: () => editor.view.setView("right") },
                { label: "Perspective / Orthographic", hint: "5", action: () => editor.view.toggleOrtho() },
                { separator: true },
                { label: "X-ray", hint: "Alt Z", checked: editor.xray, action: () => editor.setXray(!editor.xray) },
                { label: "Selection's room alone", hint: "/", action: () => editor.toggleLocalView() },
                { label: "Floor above", hint: "PgUp", action: () => editor.stepFloor(1) },
                { label: "Floor below", hint: "PgDn", action: () => editor.stepFloor(-1) },
                { label: "Whole property", action: () => editor.setFocus(null), disabled: !editor.focus },
                { label: "Unhide everything", hint: "Alt H", action: () => editor.showAllCollections(), disabled: !editor.hiddenCollections.size },
                { separator: true },
                { label: "Trackpad: scroll orbits, pinch zooms", checked: editor.trackpad, action: () => editor.setTrackpad(!editor.trackpad) },
                { label: "Sidebar", hint: "N", action: () => this.toggleSidebar() },
                { label: "Toolbar", hint: "T", action: () => this.toggleToolbar() },
            ],
            object: [
                { label: "Move", hint: "G", action: () => editor.startSession("move"), disabled: !sel },
                { label: "Rotate", hint: "R", action: () => editor.startSession("rotate"), disabled: !sel?.caps.rotate },
                { label: "Scale", hint: "S", action: () => editor.startSession("scale"), disabled: !sel?.caps.scale },
                { separator: true },
                { label: "Duplicate", hint: "⇧ D", action: () => editor.duplicateSelection(), disabled: !sel?.caps.duplicate },
                { label: "Delete", hint: "X", action: () => editor.deleteSelection(), disabled: !sel?.caps.remove },
                { label: "Drop to surface", action: () => editor.dropSelection(), disabled: !sel?.caps.gravity },
                { separator: true },
                { label: "Undo", hint: "⌘ Z", action: () => editor.undo(), disabled: !editor.history.undo.length },
                { label: "Redo", hint: "⇧ ⌘ Z", action: () => editor.redo(), disabled: !editor.history.redo.length },
            ],
        };
        this.showMenu(menus[name], rect.left, rect.bottom + 2);
    }

    showContextMenu(x, y) {
        const editor = this.editor;
        const sel = editor.selection;
        if (!sel) return;
        this.showMenu(
            [
                { heading: sel.label },
                { label: "Move", hint: "G", action: () => editor.startSession("move", { pointer: { x, y } }) },
                { label: "Rotate", hint: "R", action: () => editor.startSession("rotate", { pointer: { x, y } }), disabled: !sel.caps.rotate },
                { label: "Scale", hint: "S", action: () => editor.startSession("scale", { pointer: { x, y } }), disabled: !sel.caps.scale },
                { separator: true },
                { label: "Duplicate", hint: "⇧ D", action: () => editor.duplicateSelection(), disabled: !sel.caps.duplicate },
                { label: "Drop to surface", action: () => editor.dropSelection(), disabled: !sel.caps.gravity },
                { label: "Frame selected", hint: ".", action: () => editor.frameSelected() },
                { separator: true },
                { label: "Delete", hint: "X", action: () => editor.deleteSelection(), disabled: !sel.caps.remove },
            ],
            x,
            y
        );
    }

    /**
     * Blender's Add menu, flattened into one searchable list: structure
     * first, then the catalogue by category, then the pieces that came
     * with an imported model.
     */
    showAddMenu(x, y, anchor = null) {
        const editor = this.editor;
        this.closePopups();
        // From the walkthrough: show the popup, and nothing else of edit mode.
        if (!editor.active) {
            this.root.hidden = false;
            this.root.classList.add("is-field");
        }
        anchor?.classList.add("is-open");
        editor.addPointer = anchor
            ? (() => {
                  const rect = editor.canvas.getBoundingClientRect();
                  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
              })()
            : { x, y };

        const sections = [];
        const structure = [{ kind: "stair", label: "Staircase", icon: "stairs" }];
        if (!editor.builder.isModelScene) structure.push({ kind: "hole", label: "Floor opening", icon: "hole" });
        sections.push({ title: "Structure", items: structure });

        const library = editor.builder.furnitureLibrary;
        for (const [category, items] of library.itemsByCategory()) {
            sections.push({
                title: category.label,
                items: items.map((item) => ({ kind: "furniture", id: item.id, label: item.name, icon: "furniture" })),
            });
        }

        const popup = this.dom.popup;
        popup.className = "ed-popup ed-add-popup";
        popup.innerHTML = `
            <header><b>Add</b><input type="search" placeholder="Search…" data-add-search aria-label="Search things to add" /></header>
            <div class="ed-add-list">
                ${sections
                    .map(
                        (s) => `
                    <section>
                        <h6>${escape(s.title)}</h6>
                        ${s.items
                            .map(
                                (item) => `<button data-add-kind="${item.kind}" data-add-id="${escape(item.id || "")}" data-label="${escape(item.label.toLowerCase())}">
                                    ${icon(item.icon, 14)}<span>${escape(item.label)}</span></button>`
                            )
                            .join("")}
                    </section>`
                    )
                    .join("")}
            </div>`;

        const search = popup.querySelector("[data-add-search]");
        search.addEventListener("input", () => {
            const q = search.value.trim().toLowerCase();
            for (const section of popup.querySelectorAll("section")) {
                let any = false;
                for (const button of section.querySelectorAll("button")) {
                    const show = !q || button.dataset.label.includes(q);
                    button.hidden = !show;
                    any = any || show;
                }
                section.hidden = !any;
            }
        });
        search.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape") this.closePopups();
            if (event.key === "Enter") popup.querySelector(".ed-add-list button:not([hidden])")?.click();
        });

        popup.onclick = (event) => {
            const button = event.target.closest("[data-add-kind]");
            if (!button) return;
            const pointer = editor.addPointer;
            this.closePopups();
            editor.addObject(button.dataset.addKind, button.dataset.addId || null, pointer);
        };

        this.place(x, y);
        search.focus();
    }

    dispose() {
        this.root.remove();
    }
}

// ---------------------------------------------------------------------

function formatNumber(value, step) {
    if (!Number.isFinite(value)) return "0";
    const places = step >= 1 ? 0 : step >= 0.1 ? 2 : 3;
    return Number(value).toFixed(places);
}

/**
 * A typed field value. Plain numbers, and the small sums Blender's fields
 * accept — "1.2+0.3", "2*0.6" — but nothing that could run code.
 */
function evaluate(raw) {
    const text = String(raw).replace(/,/g, ".").replace(/[m°\s]/g, "");
    if (!/^[-+*/().0-9]+$/.test(text)) return null;
    try {
        // eslint-disable-next-line no-new-func
        const value = Function(`"use strict"; return (${text});`)();
        return Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

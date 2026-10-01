import { creditLine, megabytes } from "../World/Vehicle/CarModels.js";

/**
 * The car picker: with a car selected, "Change car…" opens a ring of the
 * cars on offer around it — each its picture and name — with the one it is
 * marked. The hub in the middle says which car the pointer or focus is on,
 * who made it and what choosing it downloads; choosing one downloads it,
 * the hub showing how far, and puts it on the car.
 *
 * Keys: arrows go round the ring, Enter or Space chooses, 1–9 choose by
 * place, Esc closes (and abandons a download under way).
 */

const ITEM = 92;        // px: a car's button
const HUB = 148;        // px: the middle
const GAP = 18;         // px: between the hub and the ring, and round it
const MARGIN = 16;      // px: kept clear of the viewport's edges

export default class CarPicker {
    constructor(editor) {
        this.editor = editor;
        this.isOpen = false;
        this.el = null;
        this.loading = null;          // the car id being downloaded
        this.attempt = 0;             // so an abandoned download is not applied
        this.onOutside = this.onOutside.bind(this);
    }

    /** Open it on the selected car. */
    async open() {
        const editable = this.editor.selection;
        if (editable?.type !== "car" || this.isOpen) return;
        this.isOpen = true;
        this.editable = editable;
        let index;
        try {
            index = await this.editor.experience.carModels.list();
        } catch (error) {
            this.isOpen = false;
            this.editor.ui.toast(error.message || "The list of cars didn't load", "error");
            return;
        }
        if (!this.isOpen) return;
        this.cars = index.cars;
        this.current = editable.car.spec.model || index.default;
        this.render();
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.attempt++;
        this.loading = null;
        document.removeEventListener("pointerdown", this.onOutside, true);
        const el = this.el;
        this.el = null;
        if (el) {
            el.classList.add("is-closing");
            setTimeout(() => el.remove(), 160);
        }
        this.editor.ui.dom.properties.querySelector('[data-prop-action="change-car"]')?.focus();
    }

    // ------------------------------------------------------------------

    render() {
        const viewport = this.editor.ui.dom.viewport;
        const models = this.editor.experience.carModels;
        const n = this.cars.length;
        // the ring's radius: clear of the hub, and room for every car round it
        const radius = Math.max(HUB / 2 + GAP + ITEM / 2, (n * (ITEM + GAP)) / (2 * Math.PI));
        const { x, y } = this.anchor(viewport, radius + ITEM / 2 + 22);

        const items = this.cars
            .map((car, i) => {
                const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
                const current = car.id === this.current;
                return `
                    <button class="ed-cp-item${current ? " is-current" : ""}" role="menuitemradio"
                            aria-checked="${current}" data-car="${car.id}" title="${escape(car.name)}"
                            style="--x:${(radius * Math.cos(angle)).toFixed(1)}px;--y:${(radius * Math.sin(angle)).toFixed(1)}px;--i:${i}">
                        <span class="ed-cp-thumb"><img src="${escape(models.url(car.files.thumb))}" alt="" draggable="false" /></span>
                        <span class="ed-cp-label">${escape(car.name)}</span>
                    </button>`;
            })
            .join("");

        const el = document.createElement("div");
        el.className = "ed-carpicker";
        el.style.setProperty("--cx", `${x}px`);
        el.style.setProperty("--cy", `${y}px`);
        el.innerHTML = `
            <div class="ed-cp-backdrop" data-cp-close></div>
            <div class="ed-cp-wheel" role="menu" aria-label="Choose a car">
                <div class="ed-cp-hub" data-cp-close title="Close (Esc)">
                    <svg class="ed-cp-ring" viewBox="0 0 100 100" aria-hidden="true">
                        <circle class="ed-cp-track" cx="50" cy="50" r="47" />
                        <circle class="ed-cp-bar" cx="50" cy="50" r="47" pathLength="100" />
                    </svg>
                    <div class="ed-cp-hub-text" aria-live="polite">
                        <b data-cp-name></b>
                        <span data-cp-detail></span>
                    </div>
                </div>
                ${items}
            </div>`;
        viewport.appendChild(el);
        this.el = el;

        el.addEventListener("click", (event) => {
            if (event.target.closest("[data-cp-close]") && !event.target.closest("[data-car]")) return this.close();
            const button = event.target.closest("[data-car]");
            if (button) this.choose(button.dataset.car);
        });
        el.addEventListener("pointerover", (event) => {
            const button = event.target.closest("[data-car]");
            if (button && !this.loading) this.describe(button.dataset.car);
        });
        el.addEventListener("focusin", (event) => {
            const button = event.target.closest("[data-car]");
            if (button && !this.loading) this.describe(button.dataset.car);
        });
        el.addEventListener("pointerleave", () => {
            if (!this.loading) this.describe(this.focused()?.dataset.car || this.current);
        });
        // a pointer down anywhere else closes it
        setTimeout(() => this.isOpen && document.addEventListener("pointerdown", this.onOutside, true));

        this.describe(this.current);
        (this.button(this.current) || el.querySelector("[data-car]"))?.focus({ preventScroll: true });
    }

    /**
     * Where the ring goes: on the car as the view shows it, kept inside the
     * viewport — or in its middle, if the car is out of view.
     */
    anchor(viewport, extent) {
        const rect = viewport.getBoundingClientRect();
        const camera = this.editor.experience.camera.activeCamera;
        const point = this.editable.car.group.position.clone();
        point.y += 0.6;
        point.project(camera);
        let x = ((point.x + 1) / 2) * rect.width;
        let y = ((1 - point.y) / 2) * rect.height;
        if (!Number.isFinite(x) || !Number.isFinite(y) || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) {
            x = rect.width / 2;
            y = rect.height / 2;
        }
        const clamp = (v, size) => (size < 2 * (extent + MARGIN) ? size / 2 : Math.min(size - extent - MARGIN, Math.max(extent + MARGIN, v)));
        return { x: clamp(x, rect.width), y: clamp(y, rect.height) };
    }

    button(id) {
        return this.el?.querySelector(`[data-car="${CSS.escape(id)}"]`);
    }

    focused() {
        return this.el?.contains(document.activeElement) ? document.activeElement.closest("[data-car]") : null;
    }

    /** The hub says which car, who made it, and what choosing it costs. */
    describe(id, detail) {
        const car = this.cars.find((c) => c.id === id);
        if (!car || !this.el) return;
        this.el.querySelector("[data-cp-name]").textContent = car.name;
        const credit = creditLine(car);
        const note =
            detail ??
            (id === this.current
                ? "This car"
                : this.editor.experience.carModels.get(id)
                  ? "Ready"
                  : `${megabytes(car.bytes)} download`);
        this.el.querySelector("[data-cp-detail]").innerHTML = `${escape(note)}${credit ? `<small>${escape(credit)}</small>` : ""}`;
    }

    progress(fraction) {
        if (!this.el) return;
        this.el.style.setProperty("--progress", fraction.toFixed(3));
        const car = this.cars.find((c) => c.id === this.loading);
        if (car) this.describe(car.id, fraction >= 0.99 ? "Preparing…" : `Downloading ${Math.round(fraction * 100)}%`);
    }

    async choose(id) {
        if (this.loading) return;
        if (id === this.current) return this.close();
        const attempt = ++this.attempt;
        this.loading = id;
        this.el.classList.add("is-loading");
        this.button(id)?.classList.add("is-chosen");
        this.progress(0);
        try {
            const done = await this.editor.changeCar(this.editable, id, {
                onProgress: (fraction) => attempt === this.attempt && this.progress(fraction),
                abandoned: () => attempt !== this.attempt,
            });
            if (attempt !== this.attempt) return;
            if (done) {
                const car = this.cars.find((c) => c.id === id);
                this.close();
                this.editor.ui.toast(`Car: ${car?.name || id}`);
            }
        } catch (error) {
            if (attempt !== this.attempt) return;
            console.error(error);
            this.loading = null;
            this.el?.classList.remove("is-loading");
            this.button(id)?.classList.remove("is-chosen");
            this.describe(id, "Didn't load — try again");
            this.editor.ui.toast(`That car didn't load: ${error.message || error}`, "error");
        }
    }

    // ------------------------------------------------------------------

    onOutside(event) {
        if (this.el && !this.el.contains(event.target)) this.close();
    }

    /** Every key while it is open is its: nothing reaches the editor. */
    onKeyDown(event) {
        event.stopPropagation();
        const buttons = [...(this.el?.querySelectorAll("[data-car]") || [])];
        const at = buttons.indexOf(this.focused());
        const go = (step) => {
            event.preventDefault();
            if (!buttons.length) return;
            buttons[(Math.max(0, at) + step + buttons.length) % buttons.length].focus();
        };
        switch (event.key) {
            case "Escape":
                event.preventDefault();
                return this.close();
            case "ArrowRight":
            case "ArrowDown":
                return go(1);
            case "ArrowLeft":
            case "ArrowUp":
                return go(-1);
            case "Tab":
                return go(event.shiftKey ? -1 : 1);
            case "Enter":
            case " ":
                event.preventDefault();
                if (at >= 0) this.choose(buttons[at].dataset.car);
                return;
            default: {
                const digit = Number(event.key);
                if (Number.isInteger(digit) && digit >= 1 && digit <= buttons.length) {
                    event.preventDefault();
                    this.choose(buttons[digit - 1].dataset.car);
                }
            }
        }
    }
}

function escape(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

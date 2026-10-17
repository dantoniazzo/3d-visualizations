/**
 * What the visitor collides with, drawn over the view when asked for: a
 * debug view of the collision trees, the doors' leaves, the cars and the
 * visitor's own capsule (World/ColliderView.js), for seeing where the
 * colliders are rather than guessing from where the walk stops.
 *
 * This is the small part that is always there — `experience.colliders` —
 * and knows only whether they are shown and how. The drawing itself is a
 * chunk of its own, downloaded the first time they are shown: a view that
 * never shows them pays nothing for it, not even the download.
 *
 * Who may see them: everyone in the editor (`/?scene=`), in the walkthrough
 * and in edit mode alike; in a public view (`/view/<id>`) only a link that
 * asks for it — `?debug`, or `?colliders`, which also shows them from the
 * start (`?colliders=xray`: seen through everything). A client sent the
 * plain link never comes across them.
 *
 * C shows and hides them (by the key's place, `KeyC`, as WASD are read, so
 * it is the same key on a Croatian keyboard); Shift C has them seen through
 * everything (x-ray) or not. Not while typing, nor with the chat open, nor
 * with Ctrl, ⌘ or Alt held, nor a key held down repeating. In edit mode the
 * editor has every key, and passes this one on (Editor.onKeyDown); so does
 * the walkthrough with something selected (FieldEdit). The walkthrough's
 * menu has a switch for it on a touch screen, and the editor's header and
 * View menu another.
 *
 * Each change is told as the world's "colliders" event, `{ shown, xray }`:
 * the menus keep in step by it, the editor draws a frame for it (Pace.js),
 * and a public view's frame-rate guard stops judging frames while they are
 * shown (FrameGuard.js) — a debug view must never make a visitor's view
 * lighter.
 */
export default class Colliders {
    /** @param {Experience} experience */
    constructor(experience) {
        this.experience = experience;
        const params = new URL(window.location.href).searchParams;
        /** Whether this view may show them at all. */
        this.available = !experience.publicView || params.has("debug") || params.has("colliders");
        this.shown = false;
        this.xray = false;
        /** The drawing (World/ColliderView.js), once it has been downloaded. */
        this.view = null;
        this.loading = null;
        /** What else draws a collider of its own each frame (register). */
        this.providers = [];
        if (!this.available) return;

        this.onKeyDown = (event) => this.onKey(event);
        window.addEventListener("keydown", this.onKeyDown);
        if (params.has("colliders")) this.show(true, { xray: params.get("colliders") === "xray" });
    }

    /**
     * C, or Shift C (`xray`): shown or hidden — and with Shift, seen through
     * everything or not, shown either way.
     */
    toggle({ xray = false } = {}) {
        if (xray) return this.show(true, { xray: !(this.shown && this.xray) });
        return this.show(!this.shown);
    }

    /**
     * Shown or not, and seen through everything or not (left as it was
     * without `xray`). Whether they are shown now.
     */
    show(on, { xray } = {}) {
        if (!this.available) return false;
        const shown = Boolean(on);
        const through = xray === undefined ? this.xray : Boolean(xray);
        if (shown === this.shown && through === this.xray) return shown;
        this.shown = shown;
        this.xray = through;
        if (shown) this.load();
        this.view?.setShown(shown, through);
        this.experience.world?.emit("colliders", { shown, xray: through });
        this.experience.wake("colliders");
        return shown;
    }

    /** The drawing, downloaded and made the first time it is wanted. */
    load() {
        if (this.view) return Promise.resolve(this.view);
        this.loading ??= import("./World/ColliderView.js")
            .then(({ default: ColliderView }) => {
                this.view = new ColliderView(this.experience, this);
                this.view.setShown(this.shown, this.xray);
                this.experience.wake("colliders");
                return this.view;
            })
            .catch((error) => {
                console.warn("The colliders could not be drawn.", error);
                this.loading = null;
                return null;
            });
        return this.loading;
    }

    /**
     * Over the frame just drawn, if shown (Renderer.render, Editor.render).
     * `depth`: the frame was drawn straight to the screen, whose depth is
     * then the scene's (not through the post-processing, whose picture has
     * none) — which the editor's colliders are hidden behind as well as
     * behind each other (World/ColliderView.js).
     */
    draw(renderer, camera, { depth = false } = {}) {
        if (this.shown && this.view) this.view.draw(renderer, camera, depth);
    }

    /**
     * Something else that collides and is in no tree — a door of a later
     * kind, a swimmer's water — drawn each frame it is shown: `provider(add)`
     * calls `add.box(centre, quaternion, half, kind)` or
     * `add.capsule(start, end, radius, kind)` for each (World/ColliderView.js).
     * Returns what takes it away again.
     */
    register(provider) {
        this.providers.push(provider);
        return () => {
            const at = this.providers.indexOf(provider);
            if (at >= 0) this.providers.splice(at, 1);
        };
    }

    /** What is drawn, for `?stats`: triangles by kind, the doors that block, how long the last build took. Null while hidden. */
    stats() {
        return this.shown && this.view ? this.view.counts : null;
    }

    onKey(event) {
        if (event.code !== "KeyC" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        if (!document.body.classList.contains("walkthrough-active") || typing() || chatOpen()) return;
        this.toggle({ xray: event.shiftKey });
    }

    dispose() {
        if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown);
        this.view?.dispose();
        this.view = null;
    }
}

/** Whether a key is going into a field: the chat's, a name, a property. */
function typing() {
    const active = document.activeElement;
    return Boolean(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable));
}

/** Whether the walkthrough's chat is open (frontend/index.js's isChatOpen). */
function chatOpen() {
    return Boolean(document.querySelector(".message-input-wrapper:not(.hidden)"));
}

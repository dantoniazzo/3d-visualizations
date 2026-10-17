import { EventEmitter } from "events";

import { GUARD, guardChose, guardRoomLight, guardSettle, guardStart, guardStep, guardTaken } from "../../shared/frameGuard.js";
import { QUALITY_STEP, onQualityChange, setQualityStep } from "./Utils/device.js";

/**
 * A public view's frame-rate guard: it watches how long the frames really
 * take while the visitor is in the view, and when the view runs slowly for a
 * couple of seconds makes it lighter, a thing at a time — the resolution,
 * then the room's live light, then the slider's step — and gives each back,
 * one at a time, when there has been clear room for half a minute; and at
 * once, whatever it took that did not make the view faster. So that
 * no visitor is left in a view too heavy for their computer: the slider's
 * ceiling and the pixel budget (Utils/device.js) are what a device is never
 * asked for; this is what answers what it is in fact given.
 *
 * The decisions are shared/frameGuard.js's — when, what, and why it does not
 * flutter — which knows nothing of the page. This is the rest: which frames
 * are a measure of the view at all, and the changes themselves.
 *
 * Frames that are no measure, and are not judged:
 *
 *   - before the visitor is in the view (the loading screen, the name and
 *     the avatar), and for three seconds after;
 *   - while the tab is not on show — it draws no frames then, and the first
 *     one back is not a slow frame;
 *   - while a publish holds the renderer (the editor's; never here);
 *   - for a second after anything known to take frames of its own: the
 *     window resized, day or night chosen, the view from above opened or
 *     shut, a switch turned, a room's lights switched, something acted on
 *     (a door, a drawer), a car got into or out of, the colliders shown or
 *     hidden, a floor or a place jumped to, the slider moved (`settle`,
 *     which whatever does such a thing calls) — and while a room is being
 *     made ready to be drawn live (RoomLight's `busy`);
 *   - while the colliders are drawn over the view (Experience/Colliders.js,
 *     `?debug`): a debug view's cost is no reason to make a visitor's view
 *     lighter;
 *   - a frame in which the renderer built a shader, or sent the GPU a
 *     texture or a mesh it had not seen: a first look at something. A
 *     second and a half of those at most, earned back over fifteen seconds
 *     — a view that only ever does that is slow.
 *
 * What it changes it changes as the visitor would: the resolution through
 * Utils/Sizes.js's `scale` (the step's own pixel ratio, and its pixel
 * budget, times a rung), the room's light through RoomLight.end — which
 * tells them —, the step through setQualityStep, unkept: the next visit
 * opens as this one did. The step it takes goes under the line at which a
 * view's lighting and its lightmaps' size were chosen as it loaded (steps
 * 0–1) as the slider does, with no reload: everything drawn follows at once
 * — the pixels, the post-processing dropped, the shadows, the planting's
 * reach — and what was chosen at load stays as loaded (a view opened
 * "baked" keeps what moves shading the sun and lit by the probes, and its
 * full-size lightmaps).
 *
 * It never turns the room's live light on, never goes above the step its
 * visitor chose, and after they move the slider themselves takes nothing
 * for half a minute (`chose`).
 *
 * Not in the editor: its plain light has nothing to take, and under its
 * realistic preview a view that changed its own resolution or step would be
 * a different thing from the one being judged — and published.
 *
 * `?guard=off` in the link leaves it out; `?guard=report` has it say what
 * it does (Utils/device.js's guardOptions). `status()` and `log` say the
 * same to a script, and `feed(ms)` takes a frame's time from one: its own
 * way in, which `frame` — called once a frame by Experience — goes through.
 *
 * Emits "change" ({ act, ...status() }) whenever it changes something.
 */

/** How long after the visitor comes into the view no frame is judged, in milliseconds. */
const ARRIVAL = 3000;
/** How much time in frames that were a first look at something goes unjudged, in milliseconds, and how fast that is earned back (per millisecond drawn). */
const EXCUSE = 1500;
const EXCUSE_BACK = 0.1;
/** How often, in milliseconds, it says what it sees (`?guard=report`). */
const REPORT_EVERY = 5000;
/** How many of the things it did are kept (`log`). */
const LOG_MOST = 200;
/**
 * What the world tells (World emits them, and Player, and the colliders)
 * that takes frames of its own, and is settled on: day or night, the view
 * from above, a switch, first or third person, something acted on, a car,
 * a room's lights, the colliders. One list, so that `dispose` lets go of
 * every one `bind` took.
 */
const SETTLE_ON = ["lighting", "bird", "switches", "view", "interact", "vehicle", "room-lights", "colliders"];

export default class FrameGuard extends EventEmitter {
    /**
     * @param {Experience} experience  a public view's
     * @param {object} [options]
     * @param {boolean} [options.report]  say in the console what it does
     */
    constructor(experience, { report = false } = {}) {
        super();
        this.experience = experience;
        /** Its thresholds: shared/frameGuard.js's, a copy a test may change. */
        this.limits = { ...GUARD };
        this.report = report;
        this.state = guardStart({ step: QUALITY_STEP }, this.limits);
        /** When the last frame began, while frames are being judged. */
        this.last = null;
        this.entered = false;
        /** A change of step that is the guard's own (onQualityChange). */
        this.own = false;
        /** What it did, and when: { at (ms since the page opened), act, fps, resolution, step }. */
        this.log = [];
        /** The frames' pace, smoothed, in milliseconds — for the readout only. */
        this.pace = null;
        this.seen = { programs: 0, textures: 0, geometries: 0 };
        this.excuse = EXCUSE;
        this.reportedAt = 0;

        this.stopQuality = onQualityChange(() => {
            if (!this.own) this.settle(this.limits.settleStep);
        });
        this.onVisibility = () => this.settle();
        document.addEventListener("visibilitychange", this.onVisibility);
        this.onResize = () => this.settle(this.limits.settle, { resized: true });
        experience.sizes.on("resize", this.onResize);
    }

    /** What the world does that takes frames of its own: told of each (World emits them). */
    bind(world) {
        this.world = world;
        this.onToggle = () => this.settle();
        for (const event of SETTLE_ON) world.on(event, this.onToggle);
    }

    /**
     * Something is about to take frames that are no measure of the view — a
     * toggle, a jump, a resize: none is judged for `ms`.
     */
    settle(ms = this.limits.settle, what = undefined) {
        this.state = guardSettle(this.state, ms, what);
    }

    /** Whether frames are a measure of the view now. */
    watching() {
        const experience = this.experience;
        if (document.visibilityState !== "visible" || experience.suspended) return false;
        if (experience.colliders?.shown) return false;
        if (!this.entered) {
            if (!experience.world?.readyIn || !document.body.classList.contains("walkthrough-active")) return false;
            this.entered = true;
            // As the view was opened: a version's own quality is set after the page's first.
            this.state = guardSettle(guardStart({ step: QUALITY_STEP }, this.limits), ARRIVAL);
        }
        return true;
    }

    /**
     * Once a frame, as it begins (Experience.update).
     *
     * @param {number} now  when, in milliseconds (requestAnimationFrame's own time)
     */
    frame(now) {
        if (!this.watching()) {
            this.last = null;
            return;
        }
        const last = this.last;
        this.last = now;
        if (last === null) return;
        const dt = now - last;
        // (The same frame told twice is no frame.)
        if (!(dt > 0)) return;
        // A room being made ready to be drawn live (World/RoomLight.js): each new shader's first draw is a long frame of
        // its own, a dozen or two of them the first time — built some turns before, so not excused below.
        if (this.world?.roomLight?.busy) this.settle();
        // A first look at something: the renderer has more shaders, textures or meshes than a frame ago.
        const info = this.experience.renderer.renderer.info;
        const seen = this.seen;
        const programs = info.programs?.length ?? 0;
        const grew = programs > seen.programs || info.memory.textures > seen.textures || info.memory.geometries > seen.geometries;
        seen.programs = programs;
        seen.textures = info.memory.textures;
        seen.geometries = info.memory.geometries;
        this.excuse = Math.min(EXCUSE, this.excuse + dt * EXCUSE_BACK);
        if (grew && dt > this.limits.fast && this.excuse >= Math.min(dt, this.limits.stall)) {
            this.excuse -= Math.min(dt, this.limits.stall);
            return;
        }
        this.feed(dt);
        if (this.report && now - this.reportedAt >= REPORT_EVERY) {
            this.reportedAt = now;
            console.info(`[guard] ${this.describe()}`);
        }
    }

    /**
     * A frame that took `dt` milliseconds: judged, and what follows from it
     * done. (A script's way in: a made-up frame time is acted on as a real
     * one is.)
     */
    feed(dt) {
        let state = this.state;
        // A room drawn live is something to end; one only asked for — its visitor out of doors, or looking from
        // above — draws nothing and costs nothing.
        const roomLight = this.world?.roomLight;
        const lit = Boolean(roomLight?.plan);
        const asked = Boolean(roomLight?.wanted);
        if (lit !== state.roomLight || asked !== state.asked) state = guardRoomLight(state, lit, asked, this.limits);
        const out = guardStep(state, dt, this.limits);
        this.state = out.state;
        const counted = Math.min(dt, this.limits.stall);
        this.pace = this.pace === null ? counted : this.pace + (counted - this.pace) * 0.05;
        if (out.act) this.act(out.act);
    }

    /** What the decision comes to in the view. */
    act(kind) {
        const state = this.state;
        if (kind.startsWith("resolution-")) {
            this.resize();
        } else if (kind === "room-light-off") {
            this.world?.roomLight?.end();
        } else if (kind.startsWith("step-")) {
            this.own = true;
            try {
                // Not kept: the next visit opens at the visitor's own step.
                setQualityStep(state.step, { persist: false });
            } finally {
                this.own = false;
            }
        }
        this.note(kind);
        this.emit("change", { act: kind, ...this.status() });
    }

    /** The resolution's rung, drawn: the step's own pixel ratio times it, and every picture the view is drawn through made again at that size. */
    resize() {
        const sizes = this.experience.sizes;
        sizes.scale = this.limits.scales[this.state.scale];
        sizes.handleSizes();
        this.experience.renderer.onResize();
    }

    /**
     * The visitor is moving the slider to `step` — called before the step is
     * set (index.js): it is theirs, the guard forgets what it had taken of
     * the step, gives back the resolution with a step raised, and takes
     * nothing for half a minute.
     */
    chose(step) {
        const before = this.state;
        this.state = guardChose(before, step, this.limits);
        if (this.state.scale !== before.scale) {
            this.experience.sizes.scale = this.limits.scales[this.state.scale];
            // (Drawn by the change of step that follows; with none, here.)
            if (step === QUALITY_STEP) this.resize();
        }
        this.note(`visitor: step ${step}`);
    }

    /** Whether the view is drawn under the step its visitor chose, by the guard's doing. */
    get lowered() {
        return this.state.step < this.state.chosen;
    }

    /** The step the visitor chose: what the guard goes back up to. */
    get chosen() {
        return this.state.chosen;
    }

    /** Where it stands: what it has taken, what it sees, and how long until it may act. */
    status() {
        const state = this.state;
        const { resolution, steps } = guardTaken(state, this.limits);
        return {
            watching: this.entered && document.visibilityState === "visible" && !this.experience.suspended,
            step: state.step,
            chosen: state.chosen,
            floor: state.floor,
            resolution,
            steps,
            pixelRatio: this.experience.sizes.pixelRatio,
            roomLight: state.roomLight,
            asked: state.asked,
            /** What has still to show that it made the view faster, and how long each kind is left alone for not having. */
            trial: state.trial ? { kind: state.trial.kind, rungs: state.trial.rungs, before: Math.round(state.trial.before * 10) / 10 } : null,
            rest: { resolution: Math.round(state.rest.resolution), step: Math.round(state.rest.step) },
            early: state.early,
            fps: this.pace ? Math.round(1000 / this.pace) : null,
            slow: Math.round(state.slow),
            fast: Math.round(state.fast),
            quiet: Math.round(state.quiet),
            grace: Math.round(state.grace),
            wait: state.wait,
        };
    }

    /** That, in a line. */
    describe() {
        const s = this.status();
        return (
            `${s.fps ?? "–"} fps · slow ${s.slow}/${this.limits.patience} ms · fast ${(s.fast / 1000).toFixed(1)}/${(s.wait / 1000).toFixed(0)} s · ` +
            `resolution ${s.resolution} (ratio ${s.pixelRatio.toFixed(2)}) · step ${s.step}${s.steps ? ` of ${s.chosen}` : ""}` +
            `${s.roomLight ? " · room lit live" : ""}${s.quiet ? ` · quiet ${s.quiet} ms` : ""}${s.grace ? ` · grace ${(s.grace / 1000).toFixed(0)} s` : ""}`
        );
    }

    note(act) {
        const s = this.status();
        this.log.push({ at: Math.round(performance.now()), act, fps: s.fps, resolution: s.resolution, step: s.step });
        if (this.log.length > LOG_MOST) this.log.shift();
        if (this.report) console.info(`[guard] ${act} → ${this.describe()}`);
    }

    dispose() {
        this.stopQuality();
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.experience.sizes.off("resize", this.onResize);
        if (this.world) for (const event of SETTLE_ON) this.world.off(event, this.onToggle);
    }
}

import * as THREE from "three";

import { onQualityChange } from "./Utils/device.js";

/**
 * When the editor draws a frame (Experience.update).
 *
 * A public view draws every frame the browser offers. So did the editor: an
 * edit view left alone cost its whole frame a hundred times a second, for as
 * long as the tab was open. Under its plain light the editor now draws when
 * the picture may have changed, and only then:
 *
 *   - **something happened** (`wake`): a pointer, wheel or key event
 *     anywhere on the page; anything the world, the editor, the people, the
 *     window's size or the camera's lock said (every event they emit); a
 *     model, a texture or a sky's picture arriving (three's loading
 *     manager); another visitor moving; the quality slider; the tab shown
 *     again — and for a moment after (HOLD), for whatever follows from it;
 *   - **something is still moving by itself** (`busy`, asked after every
 *     frame): a door or a drawer easing, or anything else acted on that
 *     says it still is (World/Interactables.js's busy: sitting down or
 *     getting up, World/Seats.js; a television's picture coming up or
 *     going, World/Screens.js), the visitor walking, falling or at the
 *     wheel, another visitor's figure not standing or sitting still, the
 *     camera, the collision trees built a slice a
 *     frame, the stand-ins merging what was built again or dropping what
 *     has left the view;
 *   - and, with none of that, **twice a second all the same** (HEARTBEAT):
 *     a frame in which no time passes, so that a change nothing told this
 *     of — a case missed above, a tool's own — is on the screen within half
 *     a second, and anything it set moving is then seen to be (`busy`).
 *
 * What idles for ever by itself — the people's clips, the visitor's own
 * figure breathing, the pool's ripple, the wind in the garden — does not ask
 * for frames in edit mode: at rest all of it holds its pose (a heartbeat's
 * frame passes no time, so nothing twitches), and goes on from there
 * whenever frames are drawn for another reason. Two things are kept moving
 * at a slower rate (REST frames a second) instead: the walkthrough, where a
 * visitor standing still sees their figure, the people and the water as
 * alive as before, and a television that is on playing at that rate (in
 * edit mode its picture is paused: World/Screens.js); and, in edit mode,
 * the people while one of them is selected or being placed — a clip being
 * chosen is to be watched.
 *
 * Every frame, as before: a public view (it has no Pace); the realistic
 * preview and a publish (`world.plain` false, or the scene held or
 * suspended); the page until the space is open and furnished; and
 * `?frames=always` in the link, or `pace.set("always")`, for a test or a
 * tool that counts on frames.
 *
 * The first frame after a rest is asked for by the event that ends it, and
 * is drawn when the browser next offers one: no later than a view that had
 * been drawing all along would have drawn it.
 */

/** How long frames go on after the last thing that happened, in ms: what follows an event without saying so — a promise, a fade of 0.2 s between two clips. */
const HOLD = 250;
/** ...and after the camera last moved: long enough for what follows the view a few times a second (the garden's grass, World/Flora) to have followed it. */
const VIEW_HOLD = 350;
/** At rest, a frame every so many ms whatever happens. */
const HEARTBEAT = 500;
/** Frames a second for what idles by itself where it is kept moving (the walkthrough; a person selected). */
const REST = 30;
/** How far the visitor's figure moves in a frame before it counts as moving, in metres. */
const STILL = 1e-5;
/** ...and how much any number of the camera's place or projection changes before the view counts as moved (a tenth of a micrometre, where it is a length). */
const STEADY = 1e-7;

/**
 * Another visitor's figure playing a clip of these names is at rest: standing, sitting (World/Seats.js's "sitting",
 * and any sitting clip after it), or treading water where it floats (Player/Swim.js's "treading": it bobs where it
 * is, as standing idles).
 */
const AT_REST = /^(idle$|sitting|treading$)/;

/** What ends a rest, of what the page hears of the visitor. */
const INPUTS = ["pointerdown", "pointermove", "pointerup", "pointercancel", "mousemove", "wheel", "keydown", "keyup", "click", "dblclick", "contextmenu", "input", "change", "focusin", "focusout", "touchstart", "touchmove", "touchend", "drop", "resize", "visibilitychange", "pointerlockchange", "fullscreenchange"];

export default class Pace {
    /** @param {Experience} experience  the editor's (never a public view's) */
    constructor(experience) {
        this.experience = experience;
        /** "always", or null: as the view is (onDemand). */
        this.forced = paceWanted();
        /** Until when frames are drawn whatever else (wake), by performance.now. */
        this.until = 0;
        /** What was still moving by itself after the last frame (busy), or null. */
        this.moving = null;
        /** "always" (every frame), "awake", "rest" (REST frames a second) or "idle" (the heartbeat alone). */
        this.state = "always";
        this.drawnAt = 0;
        /** What the frame being drawn is: "always", "awake", "rest" or "beat" (the heartbeat's). */
        this.kind = "always";
        this.timer = 0;
        this.beating = false;
        /** The camera as the last frame drew it: its place and its projection. */
        this.view = new Float64Array(32);
        this.viewOf = null;
        this.feet = new THREE.Vector3(Infinity, 0, 0);
        this.heard = new WeakSet();
        /** For measuring: frames drawn and why, turns skipped, what woke it (by name). */
        this.stats = { frames: 0, awake: 0, rest: 0, beat: 0, always: 0, skipped: 0, wakes: {}, busy: {} };

        this.onInput = (event) => this.wake(event.type);
        for (const type of INPUTS) window.addEventListener(type, this.onInput, { capture: true, passive: true });
        this.onContext = () => this.wake("context");
        experience.canvas.addEventListener("webglcontextrestored", this.onContext);
        this.beat = () => {
            this.timer = 0;
            this.beating = true;
            this.experience.request();
        };
        // Whatever three loads — a piece of furniture's model, a finish's picture, a tree, a sky — as each arrives.
        const manager = THREE.DefaultLoadingManager;
        this.itemEnd = manager.itemEnd;
        manager.itemEnd = (url) => {
            this.itemEnd.call(manager, url);
            this.wake("loaded");
        };
        this.stopQuality = onQualityChange(() => this.wake("quality"));
    }

    /**
     * Something happened that may show: frames from now until `ms` after —
     * the next as soon as the browser offers one. Free to call, as often as
     * anything likes (a counter and a comparison); `why` is for measuring.
     */
    wake(why = "asked", ms = HOLD) {
        const until = performance.now() + ms;
        if (until > this.until) this.until = until;
        this.stats.wakes[why] = (this.stats.wakes[why] ?? 0) + 1;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = 0;
        }
        // (Asked for even while frames are coming — it is then asked for already: a loop that an error stopped mid-frame starts again.)
        this.experience.request();
    }

    /** Every frame from now on ("always"), or as the view is (null): for a test, or a tool that counts on frames. */
    set(forced = null) {
        this.forced = forced === "always" ? "always" : null;
        this.wake("set");
    }

    /**
     * Whether frames are drawn only when asked for, now: the editor under
     * its plain light, open and furnished. Not the realistic preview nor a
     * publish, which draw (or hold) the scene as a visitor's view does —
     * lamps fading, the eye adapting, shadows and probes drawn a part a
     * frame — nor the page while it loads.
     */
    onDemand() {
        if (this.forced) return false;
        const experience = this.experience;
        const world = experience.world;
        if (!world?.player || !world.editor) return false;
        if (!world.plain || world.realisticWanted || experience.suspended) return false;
        if (!this.furnished) {
            // (Asked once: from then on the pieces that arrive are heard of as they do.)
            if (this.furnished === undefined) {
                this.furnished = false;
                Promise.resolve(world.sceneBuilder.furnitureReady).then(() => {
                    this.furnished = true;
                    this.wake("furnished");
                });
            }
            return false;
        }
        return document.body.classList.contains("walkthrough-active");
    }

    /** Whoever says when something changes, heard from now on — each as it comes to be (the editor is a chunk of its own). */
    listen() {
        const experience = this.experience;
        const world = experience.world;
        this.hear(experience.sizes);
        this.hear(experience.camera);
        this.hear(experience.resources);
        if (!world) return;
        this.hear(world, "tick");
        this.hear(world.people);
        this.hear(world.editor);
    }

    /** Everything an emitter says, but `skip`, is something that happened (wake). */
    hear(emitter, skip = null) {
        if (!emitter || this.heard.has(emitter)) return;
        this.heard.add(emitter);
        const pace = this;
        const emit = emitter.emit;
        emitter.emit = function (name, ...rest) {
            if (name !== skip) pace.wake(name);
            return emit.call(this, name, ...rest);
        };
    }

    /**
     * Before a frame (Experience.update): whether it is to be drawn. Not, in
     * a turn of the loop that comes sooner than the slow rate asks for — the
     * loop goes on, and nothing is updated or drawn in it.
     *
     * @param {number} now  performance.now()
     */
    begin(now) {
        const experience = this.experience;
        this.listen();
        if (!this.onDemand()) {
            this.state = "always";
            this.kind = "always";
            return true;
        }
        if (this.state === "always") {
            // Just come to rest on demand: whatever that change set going is drawn out first.
            if (now + HOLD > this.until) this.until = now + HOLD;
            this.state = "awake";
        }
        const awake = now < this.until || this.moving !== null;
        if (!awake && !this.beating && this.state === "rest" && now - this.drawnAt < 1000 / REST - 3) {
            this.stats.skipped++;
            experience.request();
            return false;
        }
        // After a pause no more time has passed than a frame's — and none at all in a frame drawn only to look.
        if (this.state === "idle") experience.time.resume(awake ? 1 / 60 : 0);
        // (The `?stats` readout: a wait of this kind is not a slow frame.)
        if (this.state !== "awake") experience.renderer?.stats?.paused();
        this.kind = awake ? "awake" : this.state === "rest" ? "rest" : "beat";
        // A frame drawn only to look looks at everything: the stand-ins at every mesh, not a sixteenth of them (World/StandIns.js).
        if (this.kind === "beat") experience.world.standIns?.hear();
        this.beating = false;
        this.drawnAt = now;
        return true;
    }

    /** Whether the frame being drawn is the heartbeat's: one in which no time passes, drawn only to look. */
    get looking() {
        return this.kind === "beat";
    }

    /**
     * After a frame: whether another follows at once (something happened a
     * moment ago, or is still moving), at the slow rate (what idles is kept
     * moving), or none until something happens or the heartbeat comes.
     */
    end() {
        const experience = this.experience;
        const stats = this.stats;
        stats.frames++;
        if (this.state === "always") {
            stats.always++;
            experience.request();
            return;
        }
        stats[this.kind]++;
        const why = this.busy();
        this.moving = why;
        if (why) stats.busy[why] = (stats.busy[why] ?? 0) + 1;
        if (why || performance.now() < this.until) {
            this.state = "awake";
            experience.request();
            return;
        }
        if (this.rests()) {
            this.state = "rest";
            experience.request();
            return;
        }
        this.state = "idle";
        if (!this.timer) this.timer = setTimeout(this.beat, HEARTBEAT);
    }

    /**
     * What is still moving by itself, as the frame just drawn left it — its
     * name, or null. Looked at, not told: each is a flag or a few numbers.
     */
    busy() {
        const experience = this.experience;
        const world = experience.world;
        const builder = world.sceneBuilder;
        // The view: moved in this frame, by whatever moved it — and for a moment after its last move (VIEW_HOLD).
        if (this.viewMoved(experience.camera.activeCamera)) {
            this.wake("view", VIEW_HOLD);
            return "view";
        }
        // What the visitor walks against, built again a slice a frame (World.update's stepCollision).
        if (builder.dynamicKeeper?.job || builder.staticKeeper?.job) return "collision";
        // The stand-ins: a part built again waiting to be merged, batches still to drop what left the view (World/StandIns.js).
        const standIns = world.standIns;
        if (standIns?.active && (standIns.waiting > 0 || standIns.loose.size > 0)) return "stand-ins";
        for (const door of builder.doors ?? []) if (door.isMoving) return "door";
        for (const part of builder.openables?.parts ?? []) if (part.isMoving) return "drawer";
        // Whatever else the visitor acts on that goes on moving by itself once acted on — what World/Interactables.js
        // has been given (a seat sat on, a tap's water, a set's picture fading in or out) says so; the doors and drawers
        // are the two lines above.
        const acted = world.interactables?.busy();
        if (acted) return acted;
        const player = world.player;
        if (player.inVehicle) return "driving";
        // Climbing out of a pool: the figure swims to the edge, comes on to it and stands up at the end while the body waits (Player/Swim.js).
        if (player.swimmer?.climb || player.swimmer?.toEdge) return "climbing";
        if (player.avatar) {
            if (player.isMoving() || player.actions?.jump) return "walking";
            // Coasting to a stop, in the air, pushed by a door: by where the body is, not its speed — standing, it is
            // pressed to the floor and lifted off it again every frame.
            const feet = player.player.collider.end;
            if (Math.abs(feet.x - this.feet.x) > STILL || Math.abs(feet.y - this.feet.y) > STILL || Math.abs(feet.z - this.feet.z) > STILL) {
                // (Remembered only when it has moved: a drift too slow to count in one frame still adds up to a move.)
                this.feet.copy(feet);
                return "walking";
            }
        }
        // Another visitor's figure walking, running, jumping or dancing where it stands (its moves are heard of: Player's
        // socket). Standing or sitting still it idles, as the people do: kept moving at the slow rate, in the walkthrough.
        for (const id in player.otherPlayers) {
            const animation = player.otherPlayers[id].animation;
            if (animation && !AT_REST.test(animation)) return "visitor";
        }
        return null;
    }

    /** Whether the camera drawn with is another, or stands or projects otherwise, than at the frame before — which is then remembered. */
    viewMoved(camera) {
        const world = camera.matrixWorld.elements;
        const projection = camera.projectionMatrix.elements;
        const view = this.view;
        let moved = this.viewOf !== camera;
        // (Not to the last digit: a visitor standing still is pressed to the floor and lifted off it again every frame,
        // by a millionth of a millionth of a metre, and the camera with them.)
        for (let i = 0; i < 16 && !moved; i++) moved = Math.abs(view[i] - world[i]) > STEADY || Math.abs(view[16 + i] - projection[i]) > STEADY;
        if (!moved) return false;
        this.viewOf = camera;
        view.set(world, 0);
        view.set(projection, 16);
        return true;
    }

    /**
     * Whether what idles by itself is kept moving, slowly, with nothing else
     * happening: in the walkthrough — the visitor's own figure, the people,
     * the water, and what the crosshair rests on, read again now and then —
     * and in edit mode while a person is selected or being placed.
     */
    rests() {
        const editor = this.experience.world.editor;
        if (!editor.active) return true;
        return editor.selection?.type === "person" || editor.session?.editable?.type === "person";
    }

    dispose() {
        for (const type of INPUTS) window.removeEventListener(type, this.onInput, { capture: true });
        this.experience.canvas.removeEventListener("webglcontextrestored", this.onContext);
        THREE.DefaultLoadingManager.itemEnd = this.itemEnd;
        this.stopQuality?.();
        clearTimeout(this.timer);
    }
}

/** Whether the link asks for every frame (`?frames=always`): for a test. */
function paceWanted() {
    const asked = new URL(window.location.href).searchParams.get("frames");
    return asked === "always" ? "always" : null;
}

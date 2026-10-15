/**
 * The frame-rate guard's decisions (frontend/Experience/FrameGuard.js): when
 * a public view that runs slowly is made lighter, by what, and when it may
 * go back — worked out from the time each frame took and the state it is
 * in, and nothing else: no clock, no page, no renderer. So it runs in node
 * on made-up frame times (scripts/test-frame-guard.mjs) exactly as it runs
 * in the page.
 *
 * WHAT A VISITOR FEELS, and so what it acts on. A walkthrough turned with
 * the mouse is comfortable from about thirty frames a second up; under
 * that the view lags the hand. A screen of 60 Hz shows a view at 60, 30 or
 * 20 a second and little between, so "slow" is put between the last two —
 * a frame of more than 36 ms, under 28 a second: the view has fallen off
 * thirty. One that holds thirty is left alone: the slider's step is what its
 * visitor (or their device's rating) asked the view to look like, and this
 * is a net under it, not a second hand on the slider. It goes back up only
 * with clear room to: frames of 22 ms or less (45 a second or better — a
 * 50 Hz screen's 20 ms counts) for half a minute.
 *
 * HOW IT JUDGES. Two buckets, in milliseconds. `slow` fills with the time
 * spent in slow frames and drains twice as fast in any other: it fills in
 * two seconds of nothing but slow frames, holds level when two thirds of
 * the time is slow, and never fills on less. One frame counts for at most a
 * quarter of a second, however long it took — a stall (a shader built, a tab
 * coming back) is one hitch, not two seconds of slowness. `fast` fills with
 * the time spent in fast frames and drains nine times as fast in any other:
 * a tenth of the time off the pace and there is no clear room. Full, each
 * lets one change be made; every change empties both and is followed by a
 * second or two in which no frame is judged (`quiet`) — what the change
 * itself took.
 *
 * WHAT IT CHANGES, lighter first to last:
 *
 *   1. the resolution — the step's own pixel ratio by `scales`, a rung at a
 *      time, and not twice within `resize` (the pictures the view is drawn
 *      through are made again at each);
 *   2. the room drawn live (World/RoomLight.js), ended — while a room is
 *      drawn so, not while it is only asked for (out of doors or from
 *      above nothing is drawn for it, and nothing saved by ending it);
 *   3. the slider's step, one down at a time, as far as `floor`.
 *
 * Going back up is the same road the other way, but for the room's live
 * light, which is the visitor's to turn on: never this. Never above the step
 * they chose (`chosen`).
 *
 * WHAT A THING TAKEN MUST GIVE. A view that is slow for another reason than
 * its pixels or its step — a slow processor, a page busy with something
 * else — is no faster for losing them, and then they are not to be lost. So
 * each is judged by what it gave: the pace (the frames' time, smoothed over
 * a second) as it was before a rung was taken against the pace when the view
 * is next found slow. Faster by a tenth (`gain`) and the rung has shown its
 * worth; the next is judged from there. Not, and one more rung of the same
 * is taken unjudged (`blind`: a screen shows a frame in whole refreshes, and
 * one rung's worth may not reach the next), and if the two together gave
 * nothing they are both given back (`resolution-back`, `step-back`) and that
 * kind is left alone for a while (`rest`: two minutes, twice as long each
 * time it proves useless again). With nothing left that helps it says so
 * once (`stuck`) and leaves the view as its visitor set it.
 *
 * WHY IT DOES NOT FLUTTER. Between 28 and 45 a second nothing happens at
 * all. A change up that is undone within half a minute (`proof`) was wrong:
 * the wait for the next is doubled, to eight minutes at most, and falls back
 * to half a minute once a change up has held. And the visitor's own hand
 * comes first: after they move the slider, or turn the room's light on,
 * nothing is taken away for half a minute (`grace`) — a minute, two, four…
 * if they put back what was taken.
 *
 * ONE EXCEPTION, for a view still settling in. The resolution taken in the
 * first half minute after its visitor arrives (`early`) may have been taken
 * for a few slow seconds that were not the view's weight — the trees still
 * coming in, a shader cache not yet warm — and a view that then holds thirty
 * a second would never earn it back by the rule above. So those rungs are
 * given back on trial, one at a time, once the view has not been slow for
 * half a minute, fast or not. If a trial does not hold, the rest stay taken,
 * and the rule is the rule above from then on. (Not the step: a step given
 * back on trial and taken again is two changes of the picture and two
 * hitches, and a start slow for long enough to cost a step — three rungs of
 * resolution come first, nine seconds of them — is a heavy view.)
 */

export const GUARD = {
    /** A frame longer than this, in milliseconds, is slow: under about 28 a second. */
    slow: 36,
    /** A frame no longer than this is fast: 45 a second or better. */
    fast: 22,
    /** How much slow time fills the bucket: the view is made lighter. */
    patience: 2000,
    /** How many times as fast a frame that is not slow empties it. */
    relief: 2,
    /** The most one frame counts for, in milliseconds. */
    stall: 250,
    /** How much fast time, at least, before the view goes back up a rung. */
    headroom: 30000,
    /** How many times as fast a frame that is not fast empties that. */
    doubt: 9,
    /** After a change of resolution, and after a change of step: how long no frame is judged. */
    settle: 1000,
    settleStep: 2000,
    /** The least time between two changes of resolution. */
    resize: 2500,
    /** The resolution's rungs: how much of the step's own pixel ratio is drawn. */
    scales: [1, 0.85, 0.72, 0.6],
    /** After the visitor's own choice, how long nothing is taken away. */
    grace: 30000,
    /** A change up undone within this long was wrong; the longest wait that comes to. */
    proof: 30000,
    most: 480000,
    /** What a thing taken must give: the view faster by this share of its pace. */
    gain: 0.1,
    /** How many rungs of one kind are taken before they must have given that between them. */
    blind: 2,
    /** How long a kind that gave nothing is left alone: twice as long each time, up to `most`. */
    rest: 120000,
    /** A rung that has not had the view found slow again within this long was enough. */
    trial: 8000,
    /** Over how long the pace is smoothed, in milliseconds. */
    smooth: 1000,
    /** How long after its visitor arrives a view is still settling in: the resolution taken then is given back once it has not been slow for `headroom`. */
    early: 30000,
};

/**
 * The guard as a view starts.
 *
 * @param {object} view
 * @param {number} view.step  the slider's step the view is drawn at
 * @param {number} [view.floor]  the lowest step the guard may take it to
 * @param {boolean} [view.roomLight]  whether a room is lit live
 * @param {object} [limits]
 */
export function guardStart({ step, floor = 0, roomLight = false }, limits = GUARD) {
    return {
        /** Which rung of `scales` the resolution is on (0: all of it). */
        scale: 0,
        /** The step drawn at, the visitor's own, and the lowest the guard goes. */
        step,
        chosen: step,
        floor: Math.min(floor, step),
        /** Whether a room is lit live, and whether its visitor has asked for one to be: told by the view. */
        roomLight,
        asked: roomLight,
        /** The two buckets, in milliseconds; and a third, of the time not slow, for what was taken early. */
        slow: 0,
        fast: 0,
        steady: 0,
        /** How long the view has been watched; how many of the resolution's rungs taken were taken early. */
        age: 0,
        early: 0,
        /** The frames' pace, smoothed, in milliseconds; null until one is judged, and again after each change. */
        pace: null,
        /** The kind last taken that has still to show what it gave: { kind, before, rungs, age }. */
        trial: null,
        /** How much longer each kind is left alone, having given nothing, and how long that is the next time. */
        rest: { resolution: 0, step: 0 },
        restNext: { resolution: limits.rest, step: limits.rest },
        /** How much longer no frame is judged. */
        quiet: 0,
        /** Since the resolution last changed, and since the guard last went up. */
        sinceResize: Infinity,
        sinceUp: Infinity,
        /** How much longer nothing is taken away, and how long that is the next time. */
        grace: 0,
        graceNext: limits.grace,
        /** How much fast time the next change up waits for. */
        wait: limits.headroom,
        /** Said once: at the floor, and still slow. */
        floored: false,
    };
}

/**
 * One frame: the state after it, and what is to be done, if anything.
 *
 * @param {object} state  as guardStart and the functions here return it
 * @param {number} dt  how long the frame took, in milliseconds
 * @returns {{ state: object, act: null|"resolution-down"|"resolution-up"|"resolution-back"|"room-light-off"|"step-down"|"step-up"|"step-back"|"floor"|"stuck" }}
 */
export function guardStep(state, dt, limits = GUARD) {
    const s = { ...state, rest: { ...state.rest } };
    if (!(dt > 0)) return { state: s, act: null };
    s.age += dt;
    s.sinceResize += dt;
    s.sinceUp += dt;
    s.grace = Math.max(0, s.grace - dt);
    s.rest.resolution = Math.max(0, s.rest.resolution - dt);
    s.rest.step = Math.max(0, s.rest.step - dt);
    if (s.quiet > 0) {
        s.quiet = Math.max(0, s.quiet - dt);
        return { state: s, act: null };
    }
    const counted = Math.min(dt, limits.stall);
    s.slow = dt > limits.slow ? Math.min(limits.patience, s.slow + counted) : Math.max(0, s.slow - dt * limits.relief);
    s.fast = dt <= limits.fast ? Math.min(s.wait, s.fast + dt) : Math.max(0, s.fast - counted * limits.doubt);
    s.steady = dt <= limits.slow ? Math.min(s.wait, s.steady + dt) : Math.max(0, s.steady - counted * limits.doubt);
    s.pace = s.pace === null ? counted : s.pace + (counted - s.pace) * Math.min(1, counted / limits.smooth);
    // A rung after which the view has not been found slow again: it was enough.
    if (s.trial) s.trial = s.trial.age + dt >= limits.trial ? null : { ...s.trial, age: s.trial.age + dt };
    // A change up that has held: the next waits no longer than the first did.
    if (s.sinceUp >= limits.proof && Number.isFinite(s.sinceUp) && s.wait > limits.headroom) s.wait = limits.headroom;

    let act = null;
    if (s.slow >= limits.patience && s.grace <= 0) act = lighter(s, limits);
    else if (s.fast >= s.wait) act = heavier(s, limits);
    // (What was taken while the view was settling in, given back on trial: it has not been slow since.)
    else if (s.early > 0 && s.scale > 0 && s.steady >= s.wait && s.sinceResize >= limits.resize) act = "resolution-up";
    if (act) apply(s, act, limits);
    return { state: s, act };
}

/** Whether what is on trial has made the view faster by a tenth of what its pace was. */
function gained(s, limits) {
    return s.pace !== null && s.pace <= s.trial.before * (1 - limits.gain);
}

/** Whether there is more of a kind to take. */
function more(s, kind, limits) {
    return kind === "resolution" ? s.scale < limits.scales.length - 1 : s.step > s.floor;
}

/** What makes the view lighter, as it is now — or null: nothing left, or not yet. Found slow again, what was last taken is judged first. */
function lighter(s, limits) {
    const trial = s.trial;
    if (trial && !gained(s, limits) && (trial.rungs >= limits.blind || !more(s, trial.kind, limits))) return `${trial.kind}-back`;
    if (more(s, "resolution", limits) && s.rest.resolution <= 0) return s.sinceResize >= limits.resize ? "resolution-down" : null;
    if (s.roomLight) return "room-light-off";
    if (more(s, "step", limits) && s.rest.step <= 0) return "step-down";
    if (s.floored) return null;
    // At its lightest — or as its visitor set it, nothing taken having helped.
    return !more(s, "resolution", limits) && !more(s, "step", limits) ? "floor" : "stuck";
}

/** What gives back the last thing taken. */
function heavier(s, limits) {
    if (s.step < s.chosen) return "step-up";
    if (s.scale > 0) return s.sinceResize >= limits.resize ? "resolution-up" : null;
    return null;
}

function apply(s, act, limits) {
    s.slow = 0;
    s.fast = 0;
    s.steady = 0;
    if (act === "floor" || act === "stuck") {
        s.floored = true;
        return;
    }
    const kind = act.startsWith("resolution") ? "resolution" : act.startsWith("step") ? "step" : null;
    const trial = s.trial;
    const before = s.pace;
    s.trial = null;
    s.pace = null;
    if (kind === "resolution") s.sinceResize = 0;
    s.quiet = kind === "step" ? limits.settleStep : limits.settle;
    if (act === "resolution-back" || act === "step-back") {
        // What gave nothing, given back — all of it that has not shown its worth — and its kind left alone for a while.
        if (kind === "resolution") {
            s.scale -= trial.rungs;
            s.early = Math.max(0, s.early - trial.rungs);
        } else s.step += trial.rungs;
        s.rest[kind] = s.restNext[kind];
        s.restNext = { ...s.restNext, [kind]: Math.min(s.restNext[kind] * 2, limits.most) };
        return;
    }
    if (act === "step-up" || act === "resolution-up") {
        if (kind === "resolution") {
            s.scale--;
            s.early = Math.max(0, s.early - 1);
        } else s.step++;
        s.sinceUp = 0;
        s.floored = false;
        return;
    }
    if (act === "room-light-off") s.roomLight = false;
    else {
        if (kind === "resolution") s.scale++;
        else s.step--;
        // On trial: judged when the view is next found slow, from the pace before the first rung that has not shown its worth.
        const proven = !trial || trial.kind !== kind || gained({ ...s, trial, pace: before }, limits);
        s.trial = proven ? { kind, before, rungs: 1, age: 0 } : { ...trial, rungs: trial.rungs + 1, age: 0 };
        if (trial?.kind === kind && proven) s.restNext = { ...s.restNext, [kind]: limits.rest };
        if (kind === "resolution" && s.age < limits.early) s.early++;
    }
    s.floored = false;
    // Taken back within half a minute of being given: the next is waited for twice as long — and nothing more is given back on trial.
    if (s.sinceUp < limits.proof) {
        s.wait = Math.min(s.wait * 2, limits.most);
        s.early = 0;
    }
    s.sinceUp = Infinity;
}

/**
 * Something other than the view's own weight is about to make frames long —
 * a toggle, a window resized, the tab back on show: no frame is judged for
 * `ms`, and what was counted towards "slow" is dropped.
 *
 * @param {object} [what]
 * @param {boolean} [what.resized]  the pictures the view is drawn through were made again
 */
export function guardSettle(state, ms = GUARD.settle, { resized = false } = {}) {
    return { ...state, quiet: Math.max(state.quiet, ms), slow: 0, sinceResize: resized ? 0 : state.sinceResize };
}

/**
 * The visitor moved the slider to `step`: theirs from now on. Raised, the
 * step is drawn whole — the resolution the guard took comes back with it;
 * lowered, what the guard took stays taken, to be given back as there is
 * room. Either way nothing is taken away for a while: half a minute, and
 * twice as long each time they put back a step the guard had taken.
 */
export function guardChose(state, step, limits = GUARD) {
    const raised = step > state.step;
    const insisted = raised && state.step < state.chosen;
    const grace = insisted ? state.graceNext : limits.grace;
    return {
        ...state,
        step,
        chosen: step,
        floor: Math.min(state.floor, step),
        scale: raised ? 0 : state.scale,
        sinceResize: raised && state.scale > 0 ? 0 : state.sinceResize,
        slow: 0,
        fast: 0,
        steady: 0,
        early: raised ? 0 : state.early,
        pace: null,
        // (Their hand: nothing is on trial, and no kind is left alone for what it failed to give before.)
        trial: null,
        rest: { resolution: 0, step: 0 },
        restNext: { resolution: limits.rest, step: limits.rest },
        quiet: Math.max(state.quiet, limits.settleStep),
        grace,
        graceNext: insisted ? Math.min(state.graceNext * 2, limits.most) : limits.grace,
        wait: limits.headroom,
        sinceUp: Infinity,
        floored: false,
    };
}

/**
 * Whether a room is lit live, as the view has it now (`lit`: there is
 * something to end), and whether its visitor has asked for one to be
 * (`asked`: on, though perhaps nothing is lit — they are out of doors, or
 * look from above). Asked for — which only its visitor does — nothing is
 * taken away for half a minute. A room coming on, walked into, takes a
 * frame or two of its own: none is judged for a moment.
 */
export function guardRoomLight(state, lit, asked = lit, limits = GUARD) {
    lit = Boolean(lit);
    asked = Boolean(asked);
    if (lit === state.roomLight && asked === state.asked) return state;
    const next = { ...state, roomLight: lit, asked };
    if (asked && !state.asked) Object.assign(next, { slow: 0, quiet: Math.max(state.quiet, limits.settle), grace: Math.max(state.grace, limits.grace) });
    else if (lit && !state.roomLight) Object.assign(next, { slow: 0, quiet: Math.max(state.quiet, limits.settle) });
    return next;
}

/** What the guard has taken, for a readout: the share of the resolution drawn, and how many steps under the visitor's. */
export function guardTaken(state, limits = GUARD) {
    return { resolution: limits.scales[state.scale], steps: state.chosen - state.step };
}

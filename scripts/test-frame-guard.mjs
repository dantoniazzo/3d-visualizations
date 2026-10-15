/**
 * The frame-rate guard's decisions (shared/frameGuard.js) run on made-up
 * frame times: `node scripts/test-frame-guard.mjs`. Prints what the guard
 * does in each case and exits 1 if any is not what is expected of it.
 *
 * Two kinds of case. "Given" frames are a fixed sequence, whatever the guard
 * does about them (the frame times do not answer its changes). A "view" is a
 * made-up one that does answer: its frame takes
 *   cpu + gpu × (share of the resolution)² × (the step's weight) + the room's live light
 * milliseconds, shown as a 60 Hz screen shows it (in whole refreshes) when
 * `vsync` is set.
 */
import { GUARD, guardChose, guardRoomLight, guardSettle, guardStart, guardStep, guardTaken } from "../shared/frameGuard.js";

const results = [];
let failed = 0;

/** Runs frames through the guard: `next(state, t)` gives the next frame's time in ms, or null to stop; `events` are things that happen at a time. */
function run({ start = { step: 4 }, next, events = [], seconds }) {
    let state = guardStart(start);
    let t = 0;
    const acts = [];
    const pending = [...events].sort((a, b) => a.at - b.at);
    while (t < seconds * 1000) {
        while (pending.length && pending[0].at * 1000 <= t) {
            const event = pending.shift();
            state = event.change(state);
            acts.push({ t, act: `(${event.name})` });
        }
        const dt = next(state, t);
        if (dt === null) break;
        t += dt;
        // A frame the page does not feed (a hidden tab's) moves the clock and nothing else.
        if (dt.hidden) continue;
        const out = guardStep(state, Number(dt));
        state = out.state;
        if (out.act) acts.push({ t, act: out.act });
    }
    return { state, acts, t };
}

const seconds = (ms) => (ms / 1000).toFixed(1);
const timeline = (acts) => (acts.length ? acts.map(({ t, act }) => `${seconds(t)}s ${act}`).join(", ") : "nothing");
const taken = (state) => {
    const { resolution, steps } = guardTaken(state);
    return `resolution ${resolution}, step ${state.step}${steps ? ` (${steps} under the visitor's ${state.chosen})` : ""}${state.roomLight ? ", room lit live" : ""}`;
};
const only = (acts) => acts.filter(({ act }) => !act.startsWith("(")).map(({ act }) => act);

function check(name, what, result, expect) {
    const problems = expect(result) || [];
    if (problems.length) failed++;
    results.push({ name, what, result, problems });
}

/** A made-up view: how long its frame takes with what the guard has taken. */
function view({ cpu = 3, gpu, weights = [0.3, 0.42, 0.62, 0.9, 1], roomLight = 1.5, vsync = false }) {
    return (state) => {
        const scale = GUARD.scales[state.scale];
        let ms = cpu + gpu * scale * scale * weights[state.step] + (state.roomLight ? roomLight : 0);
        if (vsync) ms = Math.ceil(ms / (1000 / 60) - 1e-9) * (1000 / 60);
        return ms;
    };
}

// ---- given frames -----------------------------------------------------------

check("steady 60 a second", "16.7 ms frames for 2 minutes", run({ next: () => 1000 / 60, seconds: 120 }), ({ acts }) => (acts.length ? ["did something"] : []));

check("steady 45 a second", "22.2 ms frames for 2 minutes", run({ next: () => 1000 / 45, seconds: 120 }), ({ acts }) => (acts.length ? ["did something"] : []));

check("steady 30 a second", "33.3 ms frames for 2 minutes: held thirty, left alone", run({ next: () => 1000 / 30, seconds: 120 }), ({ acts }) => (acts.length ? ["did something"] : []));

check(
    "steady 20 a second that nothing helps",
    "50 ms frames for 1 minute, whatever is done about them (a slow processor); opened at step 4 with a room lit live: two rungs of each kind are tried, given back, and the view is left as its visitor set it",
    run({ start: { step: 4, roomLight: true }, next: () => 50, seconds: 60 }),
    ({ acts, state }) => {
        const list = only(acts);
        const want = ["resolution-down", "resolution-down", "resolution-back", "room-light-off", "step-down", "step-down", "step-back", "stuck"];
        const problems = [];
        if (list.join() !== want.join()) problems.push(`order was ${list.join(" > ")}`);
        if (acts[0] && Math.abs(acts[0].t - 2000) > 60) problems.push(`first change at ${seconds(acts[0].t)}s, not 2 s`);
        for (let i = 1; i < acts.length; i++) if (acts[i].t - acts[i - 1].t < 2900) problems.push(`two changes ${seconds(acts[i].t - acts[i - 1].t)}s apart`);
        if (state.step !== 4 || state.scale !== 0) problems.push(`ended at ${taken(state)}, not as the visitor set it`);
        return problems;
    }
);

check(
    "what gave nothing is tried again, later each time",
    "50 ms frames for 16 minutes, whatever is done about them: the resolution is tried at once, then two minutes after it was given back, then four, then eight",
    run({ next: () => 50, seconds: 960 }),
    ({ acts, state }) => {
        const backs = acts.filter(({ act }) => act === "resolution-back").map(({ t }) => t);
        const tries = acts.filter(({ act }, i) => act === "resolution-down" && acts[i - 1]?.act !== "resolution-down").map(({ t }) => t);
        const problems = [];
        const want = [120000, 240000, 480000];
        want.forEach((gap, i) => {
            const waited = tries[i + 1] - backs[i];
            if (!(Math.abs(waited - gap) < 3000)) problems.push(`try ${i + 2} came ${Number.isFinite(waited) ? seconds(waited) : "never"}s after the last was given back, not about ${gap / 1000}s`);
        });
        if (acts.filter(({ act }) => act === "stuck").length < 1) problems.push("never said it was stuck");
        if (state.step !== 4 || state.scale !== 0) problems.push(`ended at ${taken(state)}`);
        return problems;
    }
);

check(
    "a 2 second stall",
    "60 a second, one frame of 2000 ms after 10 s, then 60 a second again",
    run({ next: (state, t) => (t >= 10000 && t < 10016 ? 2000 : 1000 / 60), seconds: 60 }),
    ({ acts }) => (acts.length ? ["did something"] : [])
);

check(
    "hitches",
    "60 a second with a 300 ms frame every second, for 2 minutes",
    run({ next: (state, t) => (Math.floor(t / 1000) !== Math.floor((t - 17) / 1000) && t > 500 ? 300 : 1000 / 60), seconds: 120 }),
    ({ acts }) => (acts.length ? ["did something"] : [])
);

check(
    "a slow ramp",
    "frames growing from 16.7 ms to 60 ms over 2 minutes, whatever is done about them",
    run({ next: (state, t) => 1000 / 60 + ((60 - 1000 / 60) * t) / 120000, seconds: 120 }),
    ({ acts }) => {
        const first = acts[0];
        if (!first) return ["never acted"];
        // Frames pass 36 ms at 53.5 s; two seconds of them later it acts.
        const problems = [];
        if (first.act !== "resolution-down") problems.push(`first was ${first.act}`);
        if (first.t < 53500 || first.t > 57000) problems.push(`first change at ${seconds(first.t)}s; frames pass 36 ms at 53.5 s`);
        if (only(acts).some((act) => act.endsWith("-up"))) problems.push("went up");
        return problems;
    }
);

const saw = (low, high, period) => (state, t) => low + ((high - low) * (t % period)) / period;
check(
    "a sawtooth round the threshold, half over",
    "frames sweeping 30 to 42 ms once a second (half of the time over 36 ms), for 3 minutes",
    run({ next: saw(30, 42, 1000), seconds: 180 }),
    ({ acts }) => (acts.length ? ["did something"] : [])
);
check(
    "a sawtooth round the threshold, mostly over",
    "frames sweeping 34 to 46 ms once a second (five sixths of the time over 36 ms), for 1 minute",
    run({ next: saw(34, 46, 1000), seconds: 60 }),
    ({ acts }) => {
        const list = only(acts);
        const problems = [];
        if (!list.length) problems.push("never acted");
        if (list.some((act) => act.endsWith("-up"))) problems.push("went up");
        return problems;
    }
);

const hiddenFrame = () => Object.assign(new Number(1000), { hidden: true });
check(
    "a background tab's one-second frames",
    "60 a second for 10 s, then 5 minutes of 1000 ms frames while the tab is hidden (the page feeds none of them, and settles as it comes back), then 60 a second",
    run({
        next: (state, t) => (t >= 10000 && t < 310000 ? hiddenFrame() : 1000 / 60),
        events: [{ at: 310, name: "tab back on show", change: (state) => guardSettle(state) }],
        seconds: 330,
    }),
    ({ acts }) => (only(acts).length ? ["did something"] : [])
);
check(
    "one-second frames in a tab on show",
    "1000 ms frames that are fed (a view that really draws one frame a second): each counts a quarter of a second",
    run({ next: () => 1000, seconds: 30 }),
    ({ acts }) => {
        const first = acts[0];
        if (!first) return ["never acted"];
        return Math.abs(first.t - 8000) > 1 ? [`first change at ${seconds(first.t)}s, not 8 s`] : [];
    }
);

// ---- made-up views that answer ---------------------------------------------

// (Taken in the view's first half minute, a rung of resolution is given back once on trial: `early`.)
const EARLY_TRIAL = ["resolution-up", "resolution-down"];

check(
    "a view too heavy at full resolution",
    "a view of 3 + 50 ms at step 4 (19 a second): fill-bound, so the resolution answers. Taken as the view opened, a rung is given back once on trial half a minute later, and taken again",
    run({ next: view({ gpu: 50 }), seconds: 600 }),
    ({ acts, state }) => {
        const list = only(acts);
        const problems = [];
        if (list.join() !== ["resolution-down", "resolution-down", ...EARLY_TRIAL].join()) problems.push(`did ${list.join(" > ") || "nothing"}`);
        if (state.step !== 4 || state.scale !== 2) problems.push(`ended at ${taken(state)}`);
        return problems;
    }
);

check(
    "the same on a 60 Hz screen",
    "3 + 50 ms at step 4 shown in whole refreshes (66.7 ms: 15 a second); resolution 0.72 gives 28.9 ms, shown as 33.3",
    run({ next: view({ gpu: 50, vsync: true }), seconds: 600 }),
    ({ acts, state }) => {
        const list = only(acts);
        return list.join() !== ["resolution-down", "resolution-down", ...EARLY_TRIAL].join() || state.step !== 4 || state.scale !== 2 ? [`did ${list.join(" > ") || "nothing"}`] : [];
    }
);

check(
    "a rung that does not reach the next refresh",
    "3 + 45 ms on a 60 Hz screen (shown as 50 ms). One rung gives 35.5 ms, still shown as 50: not given back for that — a second is taken unjudged, and the two give 26.3 ms, shown as 33.3",
    run({ next: view({ gpu: 45, vsync: true }), seconds: 25 }),
    ({ acts, state }) => {
        const list = only(acts);
        return list.join() !== "resolution-down,resolution-down" || state.scale !== 2 ? [`did ${list.join(" > ") || "nothing"}, ended at ${taken(state)}`] : [];
    }
);

check(
    "a view too heavy for its step",
    "a view of 20 + 90 ms at step 4 with a room lit live: the resolution is not enough. (The first step gives 6%, the second with it 23%: both kept.)",
    run({ start: { step: 4, roomLight: true }, next: view({ cpu: 20, gpu: 90 }), seconds: 600 }),
    ({ acts, state }) => {
        const list = only(acts);
        const want = ["resolution-down", "resolution-down", "resolution-down", "room-light-off", "step-down", "step-down", "step-down", ...EARLY_TRIAL];
        const problems = [];
        if (list.join() !== want.join()) problems.push(`did ${list.join(" > ")}`);
        if (state.step !== 1 || state.scale !== 3) problems.push(`ended at ${taken(state)}`);
        return problems;
    }
);

check(
    "a slow start",
    "33.3 ms frames throughout (thirty a second: left alone), but for six seconds of 60 ms frames as the view opens — the trees coming in. Two rungs of resolution go, and both come back once it has held its pace for half a minute each",
    run({ next: (state, t) => (t < 6000 ? 60 : 1000 / 30), seconds: 180 }),
    ({ acts, state }) => {
        const list = only(acts);
        const problems = [];
        if (list.join() !== "resolution-down,resolution-down,resolution-up,resolution-up") problems.push(`did ${list.join(" > ") || "nothing"}`);
        if (state.scale !== 0 || state.step !== 4) problems.push(`ended at ${taken(state)}`);
        const ups = acts.filter(({ act }) => act === "resolution-up").map(({ t }) => t);
        if (ups[0] < 30000) problems.push(`gave the first back at ${seconds(ups[0])}s`);
        if (ups[1] - ups[0] < 30000) problems.push(`gave the second back ${seconds(ups[1] - ups[0])}s after the first`);
        return problems;
    }
);

check(
    "slow seconds later in the visit",
    "33.3 ms frames throughout, with six seconds of 60 ms frames a minute in: what is taken then is not a start's, and stays taken until there is clear room",
    run({ next: (state, t) => (t >= 60000 && t < 66000 ? 60 : 1000 / 30), seconds: 300 }),
    ({ acts, state }) => {
        const list = only(acts);
        return list.join() !== "resolution-down,resolution-down" || state.scale !== 2 ? [`did ${list.join(" > ") || "nothing"}, ended at ${taken(state)}`] : [];
    }
);

check(
    "a restore that does not hold",
    "22 ms at full resolution is not the trouble: 38 ms at full, 20 ms a rung down. Up after 30 s, down again, and each next try waits twice as long",
    run({ next: (state) => (state.scale === 0 ? 38 : 20), seconds: 1500 }),
    ({ acts }) => {
        const ups = acts.filter(({ act }) => act === "resolution-up").map(({ t }) => t);
        const downs = acts.filter(({ act }) => act === "resolution-down").map(({ t }) => t);
        const gaps = ups.map((t, i) => t - downs[i]);
        const problems = [];
        const want = [31000, 61000, 121000, 241000, 481000];
        gaps.slice(0, 5).forEach((gap, i) => {
            if (Math.abs(gap - want[i]) > 400) problems.push(`try ${i + 1} came ${seconds(gap)}s after the drop, not about ${want[i] / 1000}s`);
        });
        if (ups.length < 4) problems.push(`only ${ups.length} tries`);
        if (acts.some(({ act }) => act.startsWith("step"))) problems.push("changed the step");
        return problems;
    }
);

check(
    "heavy out of doors, light indoors",
    "3 + 70 ms for the first 20 s (out by the pool), then 3 + 12 ms (indoors): down while it is slow, then back up a rung each half minute, to all of it",
    run({ next: (state, t) => view({ gpu: t < 20000 ? 70 : 12 })(state), seconds: 200 }),
    ({ acts, state }) => {
        const list = only(acts);
        const downs = list.filter((act) => act.endsWith("-down") || act === "room-light-off").length;
        const ups = acts.filter(({ act }) => act.endsWith("-up"));
        const problems = [];
        if (state.scale !== 0 || state.step !== 4) problems.push(`ended at ${taken(state)}`);
        if (downs !== ups.length) problems.push(`${downs} down, ${ups.length} up`);
        for (let i = 1; i < ups.length; i++) if (ups[i].t - ups[i - 1].t < 30000) problems.push(`two changes up ${seconds(ups[i].t - ups[i - 1].t)}s apart`);
        const order = list.slice(downs).join();
        if (!/^(step-up,)*(resolution-up,?)*$/.test(order)) problems.push(`went up as ${order}`);
        return problems;
    }
);

check(
    "the visitor's own slider",
    "a view that is slow at step 4 whatever the resolution (40 + 30 ms). The guard gets to step 3; at 60 s the visitor puts the slider back to 4, and again at 150 s",
    run({
        next: (state) => view({ cpu: 40, gpu: 30, weights: [0.1, 0.2, 0.3, 0.3, 1] })(state),
        events: [
            { at: 60, name: "visitor: slider to 4", change: (state) => guardChose(state, 4) },
            { at: 150, name: "visitor: slider to 4", change: (state) => guardChose(state, 4) },
        ],
        seconds: 330,
    }),
    ({ acts }) => {
        const problems = [];
        const after = (from) => acts.find(({ t, act }) => t > from * 1000 && !act.startsWith("("));
        const first = after(60);
        const second = after(150);
        if (!first || first.t - 60000 < 30000) problems.push(`acted ${first ? seconds(first.t - 60000) : "never"}s after the first choice`);
        if (first && first.t - 60000 > 31000) problems.push(`waited ${seconds(first.t - 60000)}s after the first choice`);
        if (!second || second.t - 150000 < 60000) problems.push(`acted ${second ? seconds(second.t - 150000) : "never"}s after the second choice (a minute was due)`);
        return problems;
    }
);

check(
    "the visitor lowers the slider themselves",
    "3 + 70 ms; the guard has taken two rungs of resolution by 6 s; at 10 s the visitor moves the slider from 4 to 2: the step is theirs, the resolution stays taken, nothing more is done for 30 s",
    run({
        next: view({ gpu: 70 }),
        events: [{ at: 10, name: "visitor: slider to 2", change: (state) => guardChose(state, 2) }],
        seconds: 45,
    }),
    ({ acts, state }) => {
        const problems = [];
        if (state.chosen !== 2 || state.step !== 2) problems.push(`step ${state.step}, chosen ${state.chosen}`);
        const later = acts.find(({ t, act }) => t > 10000 && t < 40000 && !act.startsWith("("));
        if (later) problems.push(`did ${later.act} ${seconds(later.t - 10000)}s after the choice`);
        return problems;
    }
);

check(
    "live room light turned on in a view with no room for it",
    "33 ms without it (30 a second, left alone), 45 ms with it. Turned on at 5 s: nothing for 30 s, then the resolution, and it stays on if that is enough",
    run({
        start: { step: 4 },
        next: (state) => (state.roomLight ? 12 : 0) + 3 + 30 * GUARD.scales[state.scale] ** 2,
        events: [{ at: 5, name: "visitor: room light on", change: (state) => guardRoomLight(state, true) }],
        seconds: 120,
    }),
    ({ acts, state }) => {
        const list = only(acts);
        const problems = [];
        const first = acts.find(({ act }) => !act.startsWith("("));
        if (!first || first.t < 35000) problems.push(`first change ${first ? seconds(first.t) : "never"}s; the light went on at 5 s`);
        if (list[0] !== "resolution-down") problems.push(`first was ${list[0]}`);
        if (!state.roomLight) problems.push("ended the room's light though the resolution was enough");
        return problems;
    }
);

check(
    "live room light that the resolution cannot pay for",
    "30 ms without it, 50 ms with it, on the CPU (the resolution changes nothing). On from the start: two rungs of resolution, given back for giving nothing, then the light is ended; no step is taken",
    run({ start: { step: 4, roomLight: true }, next: (state) => (state.roomLight ? 50 : 30), seconds: 60 }),
    ({ acts, state }) => {
        const list = only(acts);
        const want = ["resolution-down", "resolution-down", "resolution-back", "room-light-off"];
        return list.join() !== want.join() || state.step !== 4 || state.scale !== 0 ? [`did ${list.join(" > ")}, ended at ${taken(state)}`] : [];
    }
);

check(
    "live room light asked for, and nothing lit",
    "the light is on from 5 s but its visitor is out by the pool, where no room is lit and the view is heavy (3 + 60 ms from 40 s): the resolution answers; the light, which costs nothing there, is not ended",
    run({
        next: (state, t) => view({ gpu: t < 40000 ? 12 : 60 })(state),
        events: [{ at: 5, name: "visitor: room light on, out of doors", change: (state) => guardRoomLight(state, false, true) }],
        seconds: 120,
    }),
    ({ acts, state }) => {
        const list = only(acts);
        const problems = [];
        if (list.includes("room-light-off")) problems.push("ended a light that lit nothing");
        if (!state.asked) problems.push("no longer asked for");
        if (list[0] !== "resolution-down") problems.push(`first was ${list[0]}`);
        return problems;
    }
);

check(
    "live room light asked for out of doors, in a view nothing helps",
    "the same, but 50 ms whatever is done: the resolution and the step are tried and given back; the light is never ended, and no half minute of grace is spent waiting on it",
    run({
        next: () => 50,
        events: [{ at: 0, name: "visitor: room light on, out of doors", change: (state) => ({ ...guardRoomLight(state, false, true), grace: 0 }) }],
        seconds: 60,
    }),
    ({ acts }) => {
        const list = only(acts);
        const want = ["resolution-down", "resolution-down", "resolution-back", "step-down", "step-down", "step-back", "stuck"];
        return list.join() !== want.join() ? [`did ${list.join(" > ")}`] : [];
    }
);

check(
    "toggles",
    "a view at 60 a second in which every toggle (day and night, a floor from above) is followed by 600 ms of 120 ms frames; one every 5 s for 2 minutes. The page tells the guard of each",
    (() => {
        const events = [];
        for (let at = 5; at < 120; at += 5) events.push({ at, name: "toggle", change: (state) => guardSettle(state) });
        const out = run({ next: (state, t) => (t % 5000 < 600 && t > 4000 ? 120 : 1000 / 60), events, seconds: 120 });
        return out;
    })(),
    ({ acts }) => (only(acts).length ? [`did ${only(acts).join(" > ")}`] : [])
);

// ---- the report -------------------------------------------------------------

console.log(`Frame guard: slow over ${GUARD.slow} ms (under ${(1000 / GUARD.slow).toFixed(0)} a second) for ${GUARD.patience / 1000} s; fast at ${GUARD.fast} ms or less (${(1000 / GUARD.fast).toFixed(0)} a second) for ${GUARD.headroom / 1000} s; resolution rungs ${GUARD.scales.join(", ")}.\n`);
for (const { name, what, result, problems } of results) {
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name}`);
    console.log(`       ${what}`);
    const shown = result.acts.length > 14 ? [...result.acts.slice(0, 12), { t: NaN, act: `… ${result.acts.length - 12} more` }] : result.acts;
    console.log(`       did: ${timeline(shown).replace("NaNs ", "")}`);
    console.log(`       ends: ${taken(result.state)}${result.state.wait > GUARD.headroom ? `, next try up after ${result.state.wait / 1000} s of room` : ""}`);
    for (const problem of problems) console.log(`       NOT EXPECTED: ${problem}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

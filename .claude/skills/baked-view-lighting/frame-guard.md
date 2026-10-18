# A public view watches its own frame rate (`Experience/FrameGuard.js`)

The frame-rate guard of a public view, in full: what it takes and in
which order, how each rung is judged, what it fetches, how to test it.
A public view has no `Pace` (the editor's frames on demand,
[../walkthrough-editor/frames-on-demand.md](../walkthrough-editor/frames-on-demand.md)):
it draws every frame, and the guard judges them. Its tests are
`node scripts/test-frame-guard.mjs` (the current count:
[../app-testing-and-performance/node-tests.md](../app-testing-and-performance/node-tests.md)).

- For a tester: in a hidden pane it judges nothing by itself — put
  `?guard=off` on every timed link and test it with `guard.feed(ms)`
  ([../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)).
- For whoever adds an interaction: one that makes frames long tells the
  guard (`"interact"`, through the picker, or its own event added to
  `SETTLE_ON`), and the guard settles on it
  ([../visitor-interactions/SKILL.md](../visitor-interactions/SKILL.md)).
- While the colliders are shown (C) it judges nothing, and it settles on
  `"colliders"` ([../walkthrough-editor/colliders-view.md](../walkthrough-editor/colliders-view.md)).

- **A public view watches its own frame rate** (`Experience/FrameGuard.js`,
  `experience.guard`; decisions in `shared/frameGuard.js`, tested by `node
  scripts/test-frame-guard.mjs`). Slow = a frame over 36 ms; two seconds'
  worth (a `slow` bucket: a slow frame adds its time, at most 250 ms; any
  other takes twice its time off) and it takes one thing: the resolution
  (`sizes.scale` 0.85, 0.72, 0.6 — `Sizes.handleSizes` multiplies the step's
  ratio and budget by it), then `roomLight.end()`, then `setQualityStep(step
  − 1, { persist: false })` down to 0. Fast = 22 ms or less; thirty seconds'
  worth (a frame that is not fast takes nine times its time off) and it
  gives the last back: a step first, the resolution after. Never the room's
  light, never above `state.chosen`. A change up undone within 30 s doubles
  the next wait (to 480 s). `guard.chose(step)` — called by the slider's
  handler before `setQualityStep` — makes the step the visitor's, gives the
  resolution back with a step raised, and holds everything for 30 s (60,
  120… when they put back a step it took).
  - **A room lit, not a room asked for**: `guardRoomLight(state, lit,
    asked)` — `lit` is `Boolean(roomLight.plan)`, what `room-light-off`
    ends; `asked` is `roomLight.wanted`, which only earns the half minute
    of grace when it goes on. Out of doors or from above with K on there
    is nothing to end (it used to spend three seconds on it, say so, and
    leave the visitor to press K again indoors).
  - **Each thing taken is judged by what it gave** (`trial`, `gain` 0.1,
    `blind` 2, `rest` 120 s): the pace (frame time, smoothed over a second)
    before a rung against the pace when the view is next found slow. A
    tenth faster and the rung is proven; if not, one more of the same kind
    is taken unjudged (frames come in whole refreshes: 35.5 ms and 48 ms
    are both shown as 50), and if the two gave nothing both are given back
    (`resolution-back`, `step-back`) and that kind rests two minutes, then
    four, eight. With nothing left that helps: `stuck`, once, unsaid. A
    view slow on the processor (a 30 ms busy loop a frame) used to end at
    Fastest and 0.6 of its resolution, as slow as before; now two rungs
    and two steps are tried over 25 s and it is left as its visitor set
    it, with "Drawing it lighter did not make this view faster, so it is
    back at …" said for the step.
  - **The resolution taken in a view's first half minute comes back on
    trial** (`early`): six slow seconds as the trees arrive took two rungs
    that a view holding thirty a second (never "fast") kept for the whole
    visit. Those rungs are given back one at a time after 30 s not slow;
    if one does not hold, the rest stay, by the usual rule. A view really
    too heavy pays one raise and one drop, 30 s in. Not the step.
    `toggleLighting()` calls `guard.settle()` before the sky changes.
  - **What the guard's step fetches is what the page was opened for**:
    `lightmapURL`, `chromaURL`, `sunMaskURL` and `doorStatesURL` pick the
    phone copies by `LOADED_LOW_POWER`, not the live `LOW_POWER` — a first
    night or a first switch while the guard held the view at step 1 was
    fetched half-size and kept for the visit. And a context lost in a tab
    not on show stores one under the visitor's own step
    (`guardContextLoss(…, { chosen })`), not under the guard's.
  - **In a test it does nothing by itself**: it judges frames only while
    `document.visibilityState === "visible"`, after `walkthrough-active`,
    and a hidden pane is "hidden" (a tab fronted with `tabs_select` too:
    its own requestAnimationFrame ran at 120 Hz for some twenty seconds
    once and at 1 Hz every other time, never reliably). `guard.feed(ms)`
    takes a made-up frame time and acts on it as on a real one (the view
    really resized, the notices shown); `guard.status()`, `guard.log`,
    `guard.limits` (its own copy: shorten `headroom` to see the way back).
    To run it on real frames, drive them, hold each to a refresh inside
    `experience.update`, and tell the page it is visible
    (`Object.defineProperty(document, "visibilityState", …)`; the pacing
    tool of 2026-10-12 that did so was scratch and is gone). Told "visible" while the pane's own frames
    come once a second, it takes a rung every eight seconds, as it should
    of a view that draws one frame a second.
  - `?guard=off` when timing anything by real frames; `?guard=report` for
    its lines in the console. Whatever makes frames long by itself should
    call `experience.guard?.settle()` (the world's "lighting", "bird",
    "switches" and "view" events and, since 2026-10-16, "interact",
    "vehicle", "room-lights" and "colliders"; a resize, the slider, a jump
    and the scenery do too). The world's events it settles on are one
    list, `SETTLE_ON` in `FrameGuard.js`, read by both `bind` and
    `dispose` (`dispose` once let go of only the first four). While the
    colliders are shown it judges nothing (`watching()` false:
    ../walkthrough-editor/colliders-view.md).
  - **The bloom's pictures keep the step's own size** whatever the guard's
    scale (`PostProcessing.sizeBloom`): its blur is so many pixels of them,
    so sized with the frame the glow spread wider at each rung — a night
    room's mean level 83 → 89 at 0.6. (It still differs between steps 2 and
    3, whose own ratios differ: 85.9 against 83.)
  - Measured on the M4 Pro, Ladonia's living room at night, still frame
    best/median: as opened 12.4/12.8; room lit live 13.1/13.3 (2026-10-12:
    the lamps over the bake of that day — the rooms drawn unbaked cost
    more, live-room-measured.md); resolution
    0.85 11.4/11.7, 0.72 10.1/10.2, 0.6 8.9/9.1; light off 8.5/8.6; step 3
    7.5/7.7; step 2 6.0/6.3; step 1 4.4/4.7; step 0 4.0/4.6. By the pool by
    day 16.3/16.6 → 12.5/12.7 at 0.6 → 8.0/8.2 at step 0. A change of
    resolution: 5–10 ms in the call and the next frame 5–10 ms longer. A
    change of step: one frame of 200–240 ms indoors, 500 out of doors
    (every shader of the new shadow filter), under the Balanced step no
    worse than above it. In a 1:1 crop of a 2560 × 1440 frame 0.85 is not
    told from full, 0.72 softens fine grain and thin edges, 0.6 is plainly
    soft.
  - There is no second frame loop any more: since 2026-10-13
    `experience.update()` called by hand (a test's kick while the app's
    first frame was still to come) drops the frame already asked for and
    asks for the next itself (`Experience.request`). Before, each such
    call started a loop of its own and the guard was handed every frame
    twice. A frame told to it no time after the last is still ignored
    (`FrameGuard.frame`).
  - **Never seen on real frames.** Every run of it was `guard.feed()`, or
    driven frames held to a refresh in a hidden pane, on a Mac that is not
    slow. Its thresholds (36 ms and 22 ms, 2 s and 30 s) are a judgement,
    not tuned on a device that runs slowly; a browser capped at thirty a
    second (a phone's low-power mode) was not tried — by the numbers it is
    left alone. A step it takes is not kept, so a device too slow for its
    rating walks down again at every visit, 20–30 s to the floor. It is
    told of what the picker does: `"interact"` for a door, drawer, window,
    seat, TV or tap acted on by E, a click from above or the touch button,
    settled 1 s, longer than a door's 0.4 s swing (`Door.speed` 2.6). It
    is not told of a swing begun outside the picker (a tool's
    `door.toggle()`, or `water.toggle()`, which tells no `"interact"`),
    nor of walking into another room (the world's `"room"` is not in
    `SETTLE_ON`): there it leans on the quarter-second cap and its two
    seconds of patience (not tested with a walk).

---
name: app-testing-and-performance
description: "Testing and measuring the walkthrough app: scratch test servers (never the user's :3000), the browser pane and its quirks, the in-page tools (boot.js, sink, the baton, act/sit/water/pool/birdcar and the rest), frame timing and the paired-tab method, the speed architecture and its rules, and running big app jobs as parallel builder lanes with reviewers, integrators and verifiers. Use before testing or timing anything in a browser, and for any performance work."
---

# Test and measure the walkthrough app

How to test the app — the editor and its walkthrough (`/?scene=<id>`) and
the public view (`/view/<id>`) — without touching anything the user has;
how to time it so that a number means something; the speed architecture
every change to the app must keep; and how big work on the app's own
code is run as lanes of agents. The worked example throughout is Ladonia
(`kosinozici-villas`): anything tagged "Ladonia", or named after its
buildings A, B and C, is that project's value, not a rule.

The user's standing terms are in the repo's `CLAUDE.md`
(`../../../CLAUDE.md`, always loaded) and are not repeated here: never
touch their server on port 3000 or a tab of it, never `preview_start` its
`walkthrough` entry, build into scratch folders and `dist/` only at
delivery, never write the repo's `published/`, and the highest frame rate
with the most realism kept — a new feature must not slow down what was
there, measured against HEAD at the same spots, both ways round. This
skill is how to keep them while testing.

**Conventions.**
- Every frame time in these skills is one Mac's (an Apple M4 Pro, ANGLE
  on Metal, its pane hidden) unless it says otherwise; how they were taken
  is `measuring.md`.
- A tool "in this folder" is this skill's own
  (`.claude/skills/app-testing-and-performance/`), loaded in a page
  through the sink. In notes older than the split of 2026-10-18 it meant
  `build-property-space`'s folder, where the kit lived; since 2026-10-17
  the usability work's in-page kit is among them (`measuring.md`, The kits
  were scratch until 2026-10-17).
- Placeholders: `<repo>` the repo root; `<skill>` this folder; `<scratch>`
  the session's scratchpad; `<job>` a scratch folder per job of app work
  and `<lane>` a lane within it; `<id>` the scene id.

## When to read what

- Before the first test tab of a session: `test-servers.md` (where to
  build, a server of your own, several lanes, after a break), then
  "Starting a test tab" below and `browser-pane.md`; for an editor tab,
  `browser-testing.md` (its light, its scope, its frames); for a link's
  words, a stored key or a page handle, `test-tabs.md`.
- Before writing an in-page helper, or trusting one: `in-page-tools.md`.
- Before timing anything or comparing two builds: `measuring.md`.
- Before changing code that runs every frame, or that makes a light, a
  shader, or something that moves: `speed-architecture.md`.
- Before a big job on the app's own code: `parallel-lanes.md`, then
  `lane-briefs.md`.
- Before saying an app change is done: below, and `node-tests.md`.
- A link's words are two tables: the editor's
  (`../walkthrough-editor/links-and-handles.md`: `?preview`, `?scope`,
  `?standins`, `?shut`, `?still`, `?frames`, `?outline`) and the public
  view's (`../baked-view-lighting/links-and-handles.md`: `?version`,
  `?live`, `?lighting`, `?quality`, `?uncapped`, `?rated`, `?guard`,
  `?stats`); `test-tabs.md` indexes both, with the words a test needs.
- The shell on this Mac (no `timeout`, foreground `sleep` blocked, waiters
  by an until-loop or Monitor, `pgrep -f` matching itself, long jobs
  `run_in_background`) is the repo's `CLAUDE.md`.

## The rules that matter here

- **A build into `dist/` is a deploy** to the user's own tabs: build work
  in progress somewhere else (`test-servers.md`).
- Test on a server of your own, started in a folder of its own over a copy
  of the scenes, with a scratch `PUBLISH_DIR` and `BAKE=off`
  (`test-servers.md`). Load `boot.js` (or `harness.js`) first in every
  tab, so that nothing saves. The stubs let `/publish`, `/runtime` and
  `/bake` through by path, on whatever server the tab is of: publish only
  from a tab of the scratch publish server (`browser-pane.md`;
  `../publish-and-bake/SKILL.md`).
- Tabs of your own (`tabs_create`, then every call with its `tabId`),
  never another agent's and never one of the user's; close them at the
  end and say which they were.
- Say of every frame and timing which light and scope it was taken in
  (an editor tab: plain light or the realistic preview; House, Exterior
  or All), or which lighting mode (a public view: baked, static or live),
  with the canvas's size and the load average (`browser-testing.md`;
  `measuring.md`).
- Before reusing an earlier agent's tool, change the names it saves
  under: run as it was, it writes over the frames its author's report
  cites.
- Copy any tool you rely on into this folder, with a header in the style
  of the others, the day you write it: the scratch folder does not
  survive a restart.

## Starting a test tab

1. Build the working tree into a scratch outDir and serve it on a test
   server of your own; for a "before", HEAD's build or a copy of the
   user's `dist/` on another port (`test-servers.md`).
2. Start the sink and the tools server once a session, in the background
   (`run_in_background`):
   `python3 <skill>/sink.py <scratch>/frames` (127.0.0.1:3199) and
   `python3 <skill>/serve.py <scratch>/frames 3187`.
3. Open your own tab on the test server and, first after every
   navigation, run `boot.js` from the tools server (below). Front the tab
   or drive its frames: a hidden pane has no requestAnimationFrame
   (`browser-pane.md`).
4. In an editor tab, ask for what the test needs: the realistic preview
   for anything judged by its look, the scope for the surroundings, the
   pace "always" for whatever counts frames (`browser-testing.md`).
5. Load `act.js`, then the feature's own tools (`tools.md`), each through
   the sink.
6. Step the world by hand where the pane is hidden — `e.time.delta = 1 /
   60; e.world.update(); e.camera.update(); e.world.afterCamera()`, then
   one render — and render 3–4 views per call: `javascript_tool` stops at
   45 s (`browser-pane.md`).

### The tools server and a test tab's start

- `serve.py`, `boot.js`, `fast.js`, `pick.js` — the tools server and a test
  tab's start (`test-servers.md`). `python3 <skill>/serve.py
  <scratch>/frames 3187` serves this folder's files as the sink does,
  saves POSTs and passes the baton that timing tabs take in turns
  (`take?me=`, `give?to=`, `ready`, `prog`, `status`, `wait`). `boot.js` is
  the first call after every navigation of a test tab (`await
  window.__dvBoot; window.__dvBooted`). It:
  - stubs every non-GET but the tools' own, and a publish unless
    `window.__bootPublish`;
  - loads `fast.js` (short timers for a throttled tab; it needs serve.py)
    and `drive.js`, and drives the frames;
  - passes the name prompt, with the avatar `window.__pickSkin` names;
  - in an editor tab, loads harness.js and sets the pace to "always".

  Both servers serve this folder's top-level files only: nothing in a
  subfolder, nor in another skill's folder, can be loaded by a page. A
  tool a page must load lives here, at the top.
- `harness.js` — in-page, once the space has loaded: `__K.pose(p, t, fov)`,
  `__K.shot(label, width)` (a canvas), `__K.save(name, canvases, cols)`
  (through the sink), `__K.time(n)` (the render timed to a pixel read back,
  with its draw calls and triangles), and `__K.render(name, keys, opts)`
  over `__K.views` (the views file's `__POSES` replaces these). An editor
  tab opens under the editor's plain light with the houses alone drawn
  (`browser-testing.md`): `await __K.realistic()` turns the realistic
  preview on for the page — sun, shadows, lamps, post-processing,
  everything shown — and `__K.scope("all")` shows the surroundings under
  the plain light; `render` calls the first itself, `shot` and `time` draw
  the tab as it is lit — under the plain light by the editor's stand-ins,
  whose draw calls are what `time` counts (`in-page-tools.md`). It stubs
  every non-GET fetch but a publish's, its runtime file's and a bake's
  (`/publish`, `/runtime`, `/bake`), so a test tab can publish to the test
  server's `PUBLISH_DIR` but never save the scene — and it answers a
  tool's own POSTs too, all but those to the sink (`browser-pane.md`).
- `drive.js` — in-page: frames for a tab the browser isn't drawing (the
  pane hidden, a background tab): `__driveOn()`, `await __drive(ms,
  until)`, `__driveOff()`. Loaded after the app asked for its first frame
  it may have nothing to run: one `experience.update()` then
  (`browser-pane.md`). An editor tab at rest asks for no frames at all — it
  draws only when something has changed: `experience.pace.set("always")`
  first for whatever counts on driven frames, `set(null)` after
  (`browser-testing.md`, When the editor draws;
  `../walkthrough-editor/frames-on-demand.md`).
- `sink.py` — the frame sink on 127.0.0.1:3199: writes POSTed frames to a
  folder and serves this folder's files by GET (load helpers with
  `await eval(await (await fetch("http://127.0.0.1:3199/walk.js")).text())`).
- `undef.config.mjs` — an ESLint config with only `no-undef`, for after
  moving code between files (`node --check` and the build both pass a call
  to a function that no longer exists; 2026-10-05 it stopped every view lit
  live): `npx eslint -c <skill>/undef.config.mjs --no-ignore
  frontend/Experience frontend/index.js shared scripts server` (any ESLint
  9+; the repo has none).

## Before saying an app change is done

Run three checks:
- The no-undef lint: `node <eslint>/bin/eslint.js -c
  <skill>/undef.config.mjs --no-ignore frontend/Experience
  frontend/index.js shared scripts server`, with an ESLint 9 from the
  npx cache (`~/.npm/_npx/*/node_modules/eslint`), or `npx eslint`. It
  must give 0 errors and the one old warning (`EditorUI.js:1358`, an
  unused eslint-disable).
- Every node test: `for t in scripts/test-*.mjs; do node "$t" | tail -1;
  done`, 14 of them, about a minute. On 2026-10-17:
  - bake-batches: 40 made-up sites, by the rules;
  - capsule-through 9; collider-view 32; collision-tree 77;
    frame-guard 27; interact 51;
  - light-regions: 55 atlases, 0 differ;
  - openables 46; screens 19; seats 39; shut 31; standins 19; water 44;
    windows 30.

  A test that covered behaviour since taken out is changed with it, and
  the report says so (`node-tests.md`: what each holds, and whose it is).
- `JSON.stringify(__act.run())` in an editor tab and a public view,
  against the base server's: the same, but for what was meant to change
  (`act.js`; `in-page-tools.md`; `../visitor-interactions/SKILL.md`).

The lint does not see everything: **a class with two methods of one name
keeps the later one, silently**. People's per-frame `update(delta)`
replaced the editor's `update(person)` until the frame call became
`tick`. The `no-undef` lint does not see it.

## Clean up after testing

Stop the test servers, kill the sink and the tools server, restore
`.claude/launch.json`, close your tabs, clear the `localStorage` keys set
while testing (`render-quality`, `view-lighting`, `view-scenery`,
`view-lost-graphics`, `editor-preview`, `editor-scope`, `editor.trackpad`,
`publish-options`; and `view-reloaded-at` in `sessionStorage`:
`test-tabs.md`, What a browser keeps — keep the two lists in step), and
reset a viewport set with `resize_window` (`preset: "desktop"`).

## Performance

**The user's terms** since 2026-10-10: the highest frame rate in the
editor and in the public view with the most realism kept, and a published
view drawn from its bake by default; since 2026-10-16, a new feature must
not slow down what was there, and must cost as little as possible when
used (the standing terms, `CLAUDE.md`). What the app does for that now — a
space gets it without asking, and can spoil it — and the rules that keep
it are `speed-architecture.md`; what a visitor's device is given, and how
a baked view is drawn and lit, are `../baked-view-lighting/`. In short,
for any change to the app:
- costs are draw calls and live lights, not triangles;
- a light that is off is out of the scene, hidden — never dimmed to 0;
- never give a scene object a property of its own;
- skip what is at rest;
- build a new mesh's programs, and the shadow maps' for a new count of
  lights, before it is first drawn;
- whatever moves under a group held still updates its own world matrix.

**The low end was never measured.** The public view's low end is a
phone (which, and what it is given: `../baked-view-lighting/SKILL.md`,
"Every figure is this M4 Pro's"). None of this was measured on one, nor
on an integrated GPU: every figure is this M4 Pro's, its pane hidden.
Say so whenever a number is quoted, and test a phone when there is one to
test. To see what a weaker device is given, `?rated=` or `?quality=`
(`browser-pane.md`).

**Measure in pairs, never by eye**, and never by `?stats` in a hidden
pane: the committed code built in a frozen copy — or a copy of the build
the user's server still has (`test-servers.md`) — against the working
tree's build, a tab each, taking turns under a baton, the render timed to
a pixel read back (`__K.time(n)` is that: the mean of n frames after one
warm-up; the work's own cells were nine frames after three warm-ups, best
and median), the load average noted (`measuring.md`). The same frames
time twice as slow while Chrome or Blender is busy: compare within one
sitting, never during an export or a bake — two sittings' figures for the
same build differ, so each pair compares and two sittings do not chain.
Since wave C, run every comparison both ways round, with the GPU timer
beside it and the draws counted over all of a frame's renders
(`pair-time.js` with `pair.py`, `gtime.js`, `wtime.js`'s `draws`; the
spots in `<project>-spots.js`). Timing two versions in two tabs, which
tab holds which counts: an old-version tab at A1's living room swung a
millisecond of CPU from round to round. A first run within target did
not reproduce: it is not a result until another run, by another agent,
both ways round, agrees.

**A fault in one load of several is an order of arrival**, and a tab
loaded beside another receives things in another order: there, the
probes' file came after the sky's first glazing. Don't reload until it
shows. Make each order happen on purpose and read the result, before the
fix and after (`glass-race.js`: right is one look throughout, as
`../baked-view-lighting/baked-drawing.md`, the glass-door race, gives it;
`speed-architecture.md`, What runs every frame).

### Measuring tools

- `pair-time.js` (`__pair`: two tabs in turns through the baton) with
  `pair.py`;
- `ladonia-spots.js` (the timing spots: copy it as `<project>-spots.js`,
  in this folder; a new space's own spots file is asked for by
  `../build-property-space/SKILL.md`, Starting a new space);
- `frame-split.js` (`__frame`: where a frame's time goes);
- `hold-check.js` (`__hold`: the editor's held units against three's own
  walk and against the frame let go);
- `cold.js` (before boot.js) and `coldsplit.js` (a first visit's shaders,
  and what each frame built);
- `light-in.js` (a fridge opened as a first visitor opens it);
- `glass-race.js` (the glass-door race forced; the view's side is
  `../baked-view-lighting/`);
- `vshot.js` (a frame with the page's own HUD over it);
- `gtime.js` (`__gtime`: a frame's GPU time by the timer query) and
  `wtime.js` (`__wtime`: a frame's wall time and its draws over all of
  the frame's renders — `info.render.calls` holds the last pass's alone).

## Files in this skill

- `test-servers.md` — the user's `dist/`, scratch builds and outDirs, a
  test server of your own (the `house-test` entry, `SCENES_DIR`,
  `PUBLISH_DIR`, `BAKE=off`), several lanes at once (ports 3130–3136, at
  most five servers, only the lead edits `launch.json`), after a break,
  other spaces against the committed code.
- `sessions.md` — the scratch folder, which a restart wipes: the
  workflow's journal, what goes into the session's `snapshots/` (reports,
  tree tarballs, tools, scene backups, assets, frames); after a break
  (scene backups, `git log`/`status`, `launch.json`); where the checks
  before "done" and the clean-up are. Moved from the repo's `CLAUDE.md`,
  which keeps its summary.
- `browser-pane.md` — the pane's limits: 45 s calls, stepping by hand, no
  requestAnimationFrame, a 0 × 0 window, the name prompt, both skins,
  before a first sit or swim, no pointer lock, tabs with several agents,
  video, stubs, warnings, expected noise, touch, a lost context, the
  guard, the exposure, stale console errors.
- `browser-testing.md` — an editor test tab: the realistic preview and
  the scope, `__drive` and the pace, the heartbeat, stepping by hand,
  lamps settling.
- `test-tabs.md` — where the old "The view" reference went; the words a
  test tab opens with (an index of both link tables); what a browser
  keeps; the index of the page handles by subsystem.
- `in-page-tools.md` — loading the tools, writing a helper of your own
  (stand-ins, layer 12, `hear()`, `drawnScene`, the scope, the stubs),
  `placeAt` in degrees, and the audits: act.js, openables.js, sitting,
  the pool, Q, the HUD and driving from above.
- `tools.md` — every tool in this folder, one line each, by group, and
  where the tools that moved to other skills are.
- `node-tests.md` — the fourteen `scripts/test-*.mjs`: what each holds,
  its count, whose it is.
- `measuring.md` — the paired-tab method in full: what a frame time is,
  2048 × 1536, draws over the whole frame, a cell, the frozen copy and the
  baton, both ways round, where a frame goes, long frames of a load, a
  tab alone, timers in a hidden pane, frames that are not what they seem,
  pictures by number, GPU time, a first visit's shaders.
- `speed-architecture.md` — the rules for code that runs in a frame; the
  editor's speed and what it bought; lights, parts and sashes as draws;
  what a public view runs every frame (holdStill, the pooled lights,
  ProbeLight, passOver, drawTransparency) and wave C's final table; what
  was tried and not built.
- `parallel-lanes.md` — the approvals pattern (survey, plan, answers word
  for word, stage reports with "Still short"); lanes, reviewers, fixer,
  measurer, verifier, docs check; what the people work and the app work
  taught about agent-built work; running the agents.
- `lane-briefs.md` — the templates (h)–(p): code survey reader, lane
  builder with the standing rules, reviewers, integrator, measurer and
  end-to-end verifier, docs fact-checker, the scratch-publish lane (a
  pointer), the targeted pass, the verifier of the visitor's figure.
- `history.md` — this skill's dated entries and superseded figures,
  newest first.

Tools, by group (one line each in `tools.md`): the servers and the tab's
start (`sink.py`, `serve.py`, `boot.js`, `fast.js`, `drive.js`,
`pick.js`, `harness.js`); measuring (above); what the visitor acts on
(`act.js`, `walk.js`, `openables.js`, `sit.js`, `seat-sweep.js` and
`.py` with `ladonia-seat-starts.json` and `ladonia-w-boxes.json`,
`figure-fade.js`, `tv.js`, `water.js`, `steam.js`, `jump.js`,
`lights.js`, `hud.js`, `birdcar.js`, `holes.js`); swimming (`pool.js`,
`pool-look.js`, `clips.js`, `swim-trace.js`, `swim-checks.js`,
`others.js` with `net.py`); looking and the bake (`ladonia-views.js`,
`zfight.js`, `people-audit.js`, `bake-check.js`, `compare.mjs`); the
lint (`undef.config.mjs`).

# Every tool in this skill's folder

One line of use for each tool here, by group, and the order a test tab
loads them in. `<skill>` is `<repo>/.claude/skills/app-testing-and-performance`.

Until the split of 2026-10-18 these lived in `build-property-space`'s
folder. The node checkers of a built space (`checks/`) and the model QA
(`models/`, its own `README.md`) are still there, with `prep_review.mjs`,
`gridcrop.mjs`, `thumbs.py` and `copy-merge.sh`
(`../build-property-space/SKILL.md`); `people-plans.mjs` is in
`../space-people/checks/`, and `mixamo.js` and `mixamo-fetch.sh` in
`../space-people/`; `count-views.mjs` and `bake-replay.py` are
`../publish-and-bake/`'s; `encode-video.py` and `patch-pool-steps.mjs`
are `../visitor-interactions/`'s.

In-page tools run in a page of a TEST server (never the user's on
:3000: `test-servers.md`), loaded through the sink:
`await eval(await (await fetch("http://127.0.0.1:3199/<file>?" + Date.now())).text())`.
`sink.py` and `serve.py` serve this folder's top-level files by name
(JSON too), so a page can load any of them from either — but nothing in
a subfolder, nor any other skill's folder: a tool a page must load lives
here, at the top. Each file's header says what to load before it, what
each call does and what it returns. The order in a test tab: `boot.js`
right after the navigation, then `act.js`, then the feature's own tools.
Start both servers once a session, in the background, writing into the
scratch folder:

    python3 <skill>/sink.py <scratch>/frames            # 127.0.0.1:3199
    python3 <skill>/serve.py <scratch>/frames 3187      # the tools server and the baton

A restart of the machine empties the scratch folder: a tool worth keeping
goes into this folder, with a header in the style of these, the same
session it is written.

**Servers and the tab's start**
- `sink.py <out-dir>`: 127.0.0.1:3199; saves each POST's body as `<out-dir>/<path>`, serves the
  skill folder's files by GET.
- `serve.py <out-dir> [port]`: the tools server (3187): the same, plus the baton for tabs that time in
  turns (`take?me=`, `give?to=`, `ready`, `prog`, `status`, `wait`) and a ~20 ms wait for fast.js.
- `boot.js`: first after every navigation; stubs every non-GET but the tools' own (a publish too,
  unless `window.__bootPublish`), keeps errors in `__log`, loads fast.js and drive.js and drives the
  frames, passes the name prompt (avatar `window.__pickSkin`), loads harness.js and the pace "always"
  in an editor tab; `await __dvBoot`, then read `__dvBooted.how` ("forced" is common).
- `fast.js`: short timers for a throttled tab (boot.js loads it; needs serve.py).
- `drive.js`: `__driveOn()`, `await __drive(ms, until)`, `__driveOff()`: frames for a tab the
  browser is not drawing.
- `pick.js`: `window.__pickSkin = "female"` then load it: that avatar first in the preloader's list.
- `harness.js`: `__K` — poses, shots, saves, `time`, `render` over the views, `realistic()`, `scope()`;
  stubs every save but a publish, its runtime file and a bake.

**Measuring** (`measuring.md`)
- `wtime.js`: `__wtime.frames(n)`, `compare(label, on, off)` (with each side's draws), `update(n)`,
  `draws()`.
- `gtime.js`: `__gtime.frames(n)`, `compare(...)`: the GPU's own time by the timer query.
- `pair-time.js`: `__pair.dpr2()`, `run({ me, next, rounds, spots })` in turns through the baton,
  `save(name)`, `summary()`, `ab(on, off)`, `frame`, `draws`, `step`, `others`.
- `ladonia-spots.js`: `__spots` / `__spot(names)`: Ladonia's public-view timing spots (living,
  pool, bath-dry, bath-shower, seated-tv, bird-ground, drive-above), and `__editorSpots` (kitchen,
  living, upperU walking; overview, terrace in edit mode); copy as `<project>-spots.js`.
- `light-in.js`: `__lightIn.parts()`, `await first({ part })`, `await again(n)`: a fridge's door
  opened as a visitor first opens it, every frame timed until its light has been in a second.
- `pair.py <a> <b> [label-a label-b] [--dir frames]`: two tabs' rows paired round by round.
- `frame-split.js`: `__frame.census()`, `split(n)`, `deep(n)`, `churn(n)`, `glcount(n)`, `lights()`,
  `subtrees`, `under`, `walked`, `drawsBy`, `drawTime`: where a frame's time goes.
- `hold-check.js`: `__hold.audit()`, `same(label)`: the editor's held units against three's own walk
  and against the frame let go; `grab`, `cmp`, `save`.
- `cold.js` (before boot.js) and `coldsplit.js`: `__cold.mark/report`, `__coldsplit.on/off/rows`: a
  first visit's shaders, salted, and what each frame built.
- `glass-race.js`: `await __glassRace()`: the glass-door race forced; one look throughout is right.
- `vshot.js`: `await __vshot(name, { width })`: the frame with the page's own HUD over it.

**What the visitor acts on** (`in-page-tools.md`; `../visitor-interactions/picker-and-keys.md` and the
features' files)
- `act.js`: `__act.doors/drawers/switches`, `stand`, `aim`, `look`, `press("E"|"F"|"Q")`, `spot`,
  `run()`, `timeLook()`.
- `walk.js`: `__walk.doors()`, `to()`, `free()`: the real player physics through every door both
  ways and along routes; it first finishes a tree an edit left being built a slice a frame
  (`sceneBuilder.settleCollision()`).
- `openables.js`: `__openables.pieces`, `walkIn`, `sameTriangles`, `free`, `freeSpots`, `place`,
  `removeTest`, `stops()` (what stops each part), `everyE()` (E on one part of each kind), `sashes()`
  (every window turned or tilted and shut). `pieces`, `walkIn`, `sameTriangles`, `freeSpots` and
  `place` read the editor's furniture: an editor tab's alone.
- `sit.js`: `__sit.ready()`, `seats`, `before`, `aim`, `press`, `state()` (plan, part, side, afar,
  prelude, risingBy, opacity), `view`, `shot`. `await __sit.ready()` first — the clips worn, the seats
  dressed, their catalogue read — or the first E only queues the sit.
- `seat-sweep.js`: `__seats.ready()`, `loadBoxes` / `takeBoxes`, `loadStarts` / `makeStarts`,
  `sweep(name)`, `seat(id)`, `decide`, `ownCheck`, `self`, `limbsMeet`: every seat sat on and got up
  from, limbs against everything but its own piece; with `ladonia-seat-starts.json` (214 seats: the
  scene of 2026-10-17's a-f116#0, a-f189#0/#2 and b-f192#0/#2 have no start in it, `makeStarts` for
  them) and `ladonia-w-boxes.json` (171 pieces' editor boxes).
- `seat-sweep.py kinds | compare | per-seat [-v] | detail | self <files>`: the sweep's files read.
- `figure-fade.js`: `__fade.fade({ id, from, at })`, `fades(name)`, `snap`, `check`: sat on from
  afar, got up mid-fade, the materials worn at the end.
- `tv.js`: `__tv.list`, `freeze`, `frames`, `measure`, `off`.
- `water.js`, `steam.js`: `__water.list/go/inside/press/sweep/sheet/view/inject`,
  `__steam.series/strip/timings/reset`.
- `jump.js`: `__jump.all()`: run and jump at every upstairs window; `windows`, `run` (`record`: the
  path), `place`, `step`.
- `lights.js`: `__lights.info`, `stand`, `q()`, `walk(from, to)`, `night/day`, `whereNow`: Q and
  which room the visitor is in.
- `hud.js`: `__hud.room(id)`, `measure()`: the HUD's top row.
- `birdcar.js`: `__bc.info/cars/stand/key/tap/step/drive/route/click/hover/drag/shadows/shot`,
  `behind()` (the byte-for-byte drive across builds); in an editor tab `__K.scope("all")` first (no
  car is offered under "house").
- `holes.js`: `__holes.look/sweep/shot/seenBy`: culled faces the bird's-eye camera would see, in a
  public view (`sweep`'s `azimuths` is a count; each call puts the page's floors back after).
- `count-views.mjs [--dir <publish-dir>] [--dump out.json] <id>...` (node, read-only): a published
  version's bird's-eye samples, the drive ones included — in `../publish-and-bake/`'s folder.
- `holes.js` is also a check of a publish: run it after any change to a
  publish's culling or viewpoints (`../publish-and-bake/culling-and-viewpoints.md`).

**Swimming** (`../visitor-interactions/swimming.md`; `../visitor-interactions/pool-water.md`)
- `pool.js`: `__pool.at(u, v)`, `stand`, `step`, `hold`, `space`, `look`, `st()`, `shot`, `run`.
- `pool-look.js`: `__poolLook.poses()`, `sheet(name)`, `swimSheet`, `hide`, `time`, `water`.
- `clips.js`: `__clips.probe(clip, pitch, lift)`, `figure()`, `range`, `steady`, `sitTrace(id)`,
  `ready`, `skin`.
- `swim-trace.js`: `__trace.trace(frames, { each })`: pops, facing, waterline, limbs through faces.
- `swim-checks.js`: `__swim.track`, `wall`, `corner`, `taps`, `fullChanges`, `alone`, `turn`,
  `climb`: the clips passes' measures.
- `others.js`: `__others.mirror({ scenario })`, `send` / `recv` (two real pages), `save`: what other
  visitors see; `net.py <send.json> <recv.json>` matches the two pages' rows.

**Looking, plans and the bake**
- `ladonia-views.js`: `__POSES`, `__renderSet(prefix)`, `__plans(prefix)`; copy as
  `<project>-views.js`, here (the sink serves only this folder): replace `__POSES` with your
  references' cameras, change the night key in `__renderSet` (`"16"`) to your night reference, and
  rewrite `__plans`'s `at` table and default list (one entry per building and floor: centre x,
  centre z, floor y with the building's level, span); keep your routes for `__walk.to()` there too.
  `__renderSet` turns an editor tab's realistic preview on first (`__K.realistic`); `__plans` draws
  the tab as it is lit — evenly, under the plain light, which is what a plan cut is read for (top-down
  cuts 1.5 m above each floor). Reference renders and plan cuts are
  `../build-property-space/`'s use of it (its `checks/c-grade.mjs` reads a views file by `--views`).
- `zfight.js`: `__zfight({ limit })`: coplanar triangles on the same depth layer, in the page,
  clustered. It tests what is shown, so in an editor tab it first sets the scope to All for the page,
  and it reads the scene's own meshes, passing over the stand-ins (left in, every surface fights its
  own copy). A space's z-fighting check is `../build-property-space/`'s.
- `people-audit.js`: `__people.audit()`, `load`, `patch`, `lineup`, `shots` (it asks for the scope it
  needs itself): `../space-people/`'s check of the placed people.
- `bake-check.js`: `await __bakeCheck({ poses })`: a baked view's sun, black and drawn light
  (`../publish-and-bake/`, checking a bake).
- `compare.mjs <out.jpg> "<path with {k}>"... -- <keys>` (node): frames side by side with their
  luminance (`measuring.md`, Pictures by number; a bake's render | unbaked | baked,
  `../publish-and-bake/`).
- The rest of that group (`prep_review.mjs`, `gridcrop.mjs`,
  `bake-replay.py`) is `../build-property-space/` and
  `../publish-and-bake/`'s.

**Lint**
- `undef.config.mjs`: `npx eslint -c <skill>/undef.config.mjs --no-ignore frontend/Experience
  frontend/index.js shared scripts server`: calls to functions that no longer exist.
  (any ESLint 9+; the repo has none: `npx eslint`, or the npx cache's
  `node ~/.npm/_npx/*/node_modules/eslint/bin/eslint.js`). SKILL.md,
  "Before saying an app change is done".

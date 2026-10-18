# Measuring: frame times and pictures

The method behind every frame time these skills quote: what can be timed
in a hidden pane, the paired-tab method (a frozen "before" and the working
build, a tab each, taking turns under a baton, both ways round), where a
frame goes, what a first visit costs, and how to compare pictures. The
short form is in SKILL.md ("Measure in pairs, never by eye"); the servers
it runs on are `test-servers.md`; the tools are in this skill's folder
(`tools.md`, Measuring). Measuring the live room (K) against an unbaked
reference is `../baked-view-lighting/live-room-measured.md`; comparing
two bakes is `../publish-and-bake/baking.md` (Two bakes); a room's mean
luminance is `../build-property-space/light-and-look.md` (Measure, don't
judge by eye).

How the performance work of 2026-10-10/14 was measured: every frame time
in these notes marked M4 Pro came this way. One Mac (Apple M4 Pro, ANGLE
on Metal), its pane hidden: none of it says what a phone or an integrated
GPU does, and none of it was watched in a visible tab at the display's
rate.

- **What a frame time is.** A hidden pane has no requestAnimationFrame and
  its timers are throttled, so real frames cannot be timed there, and
  `?stats` in a hidden, throttled or driven pane says nothing. What can be
  timed is the render: `experience.renderer.render()`, then
  `gl.readPixels` of one pixel (which waits for the GPU), in a loop —
  harness.js's `__K.time(n)` is that, after one warm-up frame (its
  `calls` are of one plain render of `experience.scene` without the
  post-processing: right for an editor under the plain light, never for
  a public view's frame — "Draws", below). The work's
  own cells were nine frames after three warm-ups a round, several rounds,
  given as best / median. "Moving": the sun's
  shadow map and every lit lamp's flagged before each frame — the worst
  case. "As run": `world.update()` and the render, nothing forced. A
  walk: the player stepped at 1/60 s along a route, every frame's time
  kept (median, p95, the frames over 16.7, 25 and 33.3 ms). The viewport
  set to 1280 × 720 at ratio 2 (`resize_window`): the canvas is then 2560
  × 1440 at steps 3–4, 1920 × 1080 at step 2 and 1280 × 720 at step 0 —
  read it in every cell. `?guard=off` on every public link timed. The wind
  and the water held still (the materials' `uTime` uniforms and the pool's
  time set to a constant), so that two builds draw the same frame. Since
  wave B the figures are at 2048 × 1536 (next).
- **2048 × 1536 in the pane** (waves B and C, 2026-10-16/17): the pane at
  1024 × 768 (`resize_window`), the page's pixel ratio held at 2 whatever
  its screen reports (the hidden pane's reports 1; after a navigation
  under `resize_window`'s emulation it can be 1 or 2):
  `Object.defineProperty(window, "devicePixelRatio", { get: () => 2,
  configurable: true }); experience.sizes.handleSizes();
  experience.onResize()`, after the load (`pair-time.js`'s `dpr2()`).
  Read the canvas's size back in every timing.
- **Draws over the whole frame.** three's `renderer.info` keeps the last
  render's figures only (unless `?stats` has turned `autoReset` off), and
  a public view's frame through post-processing is several renders —
  N8AO's beauty pass, its two pictures of what is seen through, a live
  room's calls, the shadow maps. Count a frame's draws by wrapping
  `renderer.renderBufferDirect` round one `experience.renderer.render()`
  (`pair-time.js`'s `draws()`; A1's living room: 1,102).
- **A cell**, since wave B (`pair-time.js`'s `run`): four rounds a spot,
  each three runs of 15 frames after six unrecorded renders, the other
  visitors' figures hidden (`__pair.others(false)`); `render`
  (Renderer.render + a 1 px read back), `full` (world.update, camera.update and
  afterCamera first), `cpu` (Renderer.render alone) and `gpu` (the timer
  query's median of 9 frames, `gtime.js`), with the draws and the load.
  `python3 <skill>/pair.py <a> <b>` (this skill's folder) pairs two
  tabs' rows by round
  and spot and gives the median of the round-by-round differences, on
  which the machine's drift falls alike. `__pair.ab(on, off)` is one
  change's cost at one pose in one tab.
- **Old against new: a frozen copy and a baton.** The old side is a build
  that is never edited after — the committed code copied out to the
  scratch folder and built there once (2026-10-10/12), or a copy of the
  repo's `dist/` as the user's own server still serves it (2026-10-13/14,
  when the new side was built into the scratch folder and `dist/` left
  alone: `test-servers.md`) — on servers of its own over the *same* publish
  folders and a copy of the scenes; the new side is the working tree,
  built. One tab a build,
  loaded one after the other (loaded together, the second stays 0.5–1 ms a
  frame slower for as long as it lives, whatever it draws — measured with
  one build in both). Between them a baton: a small server both tabs ask
  for it and hand it back to, so that only one draws at a time and the two
  take the same steps in turn — old, new, old, new — four rounds a cell.
  A busy machine then falls on both alike: the difference holds where the
  absolute figures do not (the same cell moved by up to 1.6 ms between
  sittings). Have the baton's answer carry the machine's load average,
  note it with every cell, throw away a cell that something else starting
  fell on (a Teams call took the load from 2–4 to 5–12) and run it again;
  never time during a bake or with Blender running (`ps`). Three builds
  with two tabs are two pairs: the new one timed twice.
- **Two tabs, taken in turns, and both ways round.** Three sittings
  showed why:
  - *One tab drifts* (wave B, 2026-10-16): measured one after the other in
    one tab, a frame drifted 16.1 → 20.2 ms within a minute with nothing
    changed (load 5–6), and a one-tab before and after read the drift as
    the change. Two tabs measured alternately, the baton handed between
    them, put the drift on both alike: that is how the live room's
    "lasting 0.8 ms" came out as no cost at all.
  - *Which tab holds which build is part of its figure* (2026-10-14: the
    realistic preview's "0.3–2.4 ms a frame slower than before", Ladonia
    by day, `render()` and a pixel read back, the two tabs read turn and
    turn about). The new build in one tab and the build before in the
    other, the preview switched on in the page: +0.2, +0.8 and +0.9 ms on
    the medians (living room, pool, street). Both loaded straight into the
    preview (`?preview=1&scope=all`), the same tabs: +1.2 to +2.3 and +1.8
    to +2.8 at the pool and the street. The same two loads with the tabs
    changed over: +0.1 to +0.3. The build before alone read 17.9 ms in one
    tab, 18.5 in the other, and 19.3–19.6 there once the first tab held a
    loaded Ladonia too.
  - *And it swings* (wave C): the same build and version in two tabs
    differed by up to ±0.2 ms; an old version's tab at A1's living room
    swung by a millisecond of CPU from round to round; the first tab of a
    pair read 0.4–1.2 ms faster whichever build it held (the final check).
    Three sittings gave a new version's cost at A1 living as +0.1, +0.8 to
    +1.15 and 0.0 / +0.45 ms; the fourth, both ways round, +0.35.

  So use one tab per side and hand the baton between them (old, new, old,
  new; four rounds a cell or more). Run each comparison again with the
  tabs swapped, pair the rounds (`pair.py`) and average the two runs, and
  give the GPU timer beside the frame time: at A1 living it moved
  +0.2–0.25 ms in every sitting while the frame time read +0.1 to +1.15. A
  first run within target that does not reproduce is not a result. What
  the 2026-10-14 sitting found besides:
  - **What followed the build, whichever tab**: three's one
    `scene.updateMatrixWorld()` a frame — 1.53–1.76 ms in the new build,
    1.35–1.45 in the build before, over the same 9,770 objects, all of
    them `matrixAutoUpdate` (by part: the shell 0.62 for 0.36, the
    furniture 0.65 for 0.54) — while the same call in a loop is 0.64–0.67
    for 0.63–0.64. Three's walk of the same scene is slower when it comes
    cold, which is where the scene's objects lie in memory, not something
    run each frame. Why they lie worse in the new build was not found,
    and nothing was mended.
  - **Ruled out, by number** (new / before): what a frame asks of the
    GPU's driver (43,076 / 43,105 calls, 18,855 / 18,847 of them
    uniforms, 1,029 / 1,035 `useProgram`, 11,879 draws in both); the
    programs (183 / 186, their uniforms 5,581 / 5,749); callbacks of
    their own on scene objects (27 in both, 0.01 ms a frame); layers
    (every object's mask 1, the camera's 1) and the camera's near and
    far (0.05, 800); properties of their own on scene objects (the same
    19 kinds of object by their keys); the stand-ins (off, an invisible
    group of 441: taken out of three's walk by `matrixWorldAutoUpdate`
    the walk stayed 1.53 ms; never made in a page loaded straight into
    the preview, where the gap is no smaller; their `update` while off
    0.01 ms); `Realism.update` (0.03 in both). Pace, the ray index, the
    wrapped `emit` and the edit camera are not in the timed call at all.
- **Two questions, two comparisons** (wave C). The user's last version
  on the new build against HEAD's build: what the app's own changes cost.
  The new version against that one, both on the new build: what the new
  content costs. Both are wanted (`speed-architecture.md`, What runs every
  frame in a public view).
- **Where a frame goes, before changing anything** (wave C, 2026-10-16:
  profile, don't guess). `frame-split.js` (this skill's folder) is the kit:
  - `split(n)`: `world.update` by subsystem (the look ray and its
    providers, Whereabouts, the parts' and sashes' updates, ProbeLight,
    the water, the colliders' hooks, BirdView), then the camera, then
    three's own render by stage (the matrix walk, the shadow maps,
    projection and sort, the draws), with each frame's counts; `deep(n)`
    inside `world.update`;
  - `census()`: objects, shown, `matrixAutoUpdate` /
    `matrixWorldAutoUpdate`, lights by kind and whether shown, two-sided
    see-through materials, `onBeforeRender` hooks; `walked`, `subtrees`;
  - `churn(n)`: which materials change `version` from frame to frame;
    `glcount(n)`, `drawsBy`, `drawTime`.
  Then profile the same spot in both builds: a CPU profile from a scratch
  Playwright page (`page.context().newCDPSession(page)`, `Profiler`
  sampling at 50 µs, 240 frames stepped and drawn in one `evaluate`) of
  an unminified build (`npx vite build --minify false --outDir
  <scratch>/…`), the two profiles diffed by each function's self time.
  That is how the Scene's own matrix was found walking all 5,876 objects
  (`speed-architecture.md`, holdStill). The Playwright script was
  scratch and is gone: write it again from this.
- **The long frames of a load** (Ladonia's editor, the app in an iframe
  with its frames and short timers driven flat out, 2026-10-14: three
  loads of this build, two of the build before). The longest is a frame
  in which 24–53 textures first reach the GPU: 213–373 ms here, 303–304
  in the build before. The frame that first draws the shell is 86–98 ms
  for 43: the stand-ins' own first merge is 23–31 ms of it (6,488 parts
  copied, 34 buckets laid out), the rest seven programs and 29 geometries
  new to the GPU where the build before has four and eleven. Not sliced.
  (The furniture's collision tree is built when the furniture arrives,
  outside any frame: 365–930 ms of Ladonia in one go, 2.3–2.4 s before.)
- **An editor tab draws on demand** (`browser-testing.md`;
  `../walkthrough-editor/frames-on-demand.md`): none of
  the above is touched by it — a cell is `renderer.render()` in a loop —
  but anything that waits on the app's own frames in an editor tab needs
  `experience.pace.set("always")`, and "frames a second at rest" is now a
  figure of its own: `experience.pace.stats`.
- **The first frame after a rest is a longer one, by the GPU's own doing**
  (this Mac, pane hidden; not seen in a visible tab): with no frame drawn
  for 20 ms to half a second the next takes 7–10 ms more to reach the
  screen than a frame of a run (Ladonia's whole property: 17–24 ms where a
  drag's frames are 10; a room 14–19 where 6.6) — and after two seconds
  with none, 65–270 ms. The heartbeat keeps it at the first figure; so does
  the 30 a second of the walkthrough at rest. In a hidden pane the
  heartbeat's timer is the browser's to delay: a first move timed there
  after a long gap reads the second figure.
- **A tab alone for walks and for first times.** In two tabs taking turns,
  the first heavy frame after the other tab's turn was 33–78 ms at the
  same frame of a walk, every round; alone it is 19–20. Without a pass
  over every view before the timed rounds, the first round of *both* tabs
  was uneven (a pool view 32.7 ms for 17.6–18.0 after). In a light view
  (Wrenfield, 4–5 ms) the first dozen frames after any pause are up to 2
  ms slower. So: a first-visit pass over every pose, kept apart; walks,
  fresh-load figures (a first look, a first night, a first switch-on) and
  a light view's standing figures in a tab alone, two loads each.
- **Timers in a hidden pane.** Whatever the app does between frames on a
  timer crawls there — once a second, and once a minute after five minutes
  hidden. `Renderer.prepareLights` builds shaders in slices between
  timers: an unbaked view's lamps took 157 s to come in on a first night,
  and under 5 s with short timers run from the event loop (a `setTimeout`
  of up to 250 ms kept in the page and run from a MessageChannel, or after
  a quick request to a local server). Do the same, and say that the thing
  was not seen in a visible tab. A chunk imported when first wanted (the
  post-processing's, at a first preview) did not arrive while frames were
  driven flat out: await it (`renderer.usePost(true,
  renderer.postWanted)`, as `__K.realistic()` does) rather than drive past
  it.
- **Frames that are not what they seem:**
  - *The harness's stub answers a tool's POSTs* (`browser-pane.md`): a
    collector's rounds, posted to its own server, never left the page.
  - *drive.js with nothing queued* (`browser-pane.md`): a `__drive` that
    returns millions has drawn nothing.
  - *Another tab on the same server is a visitor standing in your pose*
    (below), and two test tabs are each other's.
  - *three uploads a geometry, and the GPU makes a program's pipeline, when
    it is first drawn.* With no whole-house shadow pass a view holds 374
    of 4,615 geometries after load (the committed code 4,179), and the
    first turn of the head uploads the rest. A pose's first frame is not
    its time: warm up — or measure the first look on purpose (the camera
    turned once round in place, every frame kept).
  - *Shaders prepared ahead may not have arrived*: the build's waits are
    timers, so in a background tab a "first" time is the throttle's, and a
    lamp is not lit until `!lampPool.entering && lampPool.settled`, a room
    until `roomLight.status().state === "lit"`, a first night's layers
    until `resolver.pending` is 0, an exposure until `meter.fresh`.
  - *A first build the browser has seen before is not a first build*:
    Chrome keeps built shaders on disk. Make text it has never seen: wrap
    `gl.shaderSource` and add a used term (`?roomlight=` takes `on` and
    `off` only now).
  - *The frame-rate guard does nothing in a hidden pane*
    (`../baked-view-lighting/frame-guard.md`): `guard.feed(ms)`.
  - *`gl.getError()` round every render* reads about 1.5 ms high.
  - *A job a `javascript_tool` call waits on outlives the call*: navigate
    the tab before it says done and the job is lost.
- **Comparing two builds or two paths frame by frame**: hide every avatar —
  another test tab on the same server is a visitor standing in your pose
  (`e.scene.children` Groups named "Scene", and Sprites: off every layer,
  not `visible = false`, which the app sets itself) — wait for the probes,
  the doors' atlas and the sun's mask, and draw unsorted
  (`renderer.sortObjects = false`): fewer materials change the draw order,
  and with it which of two touching surfaces a pixel on their shared line
  is. Two loads of one build then differ by 0 levels.
- **Two loads of one build are not always the same picture on Ladonia**:
  `Flora/trees.js` builds each species as its model arrives
  (`Promise.all` over the species), so the order — and three's material
  ids, and so the order the leaf cards are drawn in — changes from load
  to load. From above by day that is some 900 pixels of 3.7 million at
  the crowns' edges, by up to 20 levels (2–3 at night); the living room
  and the pool have shown none. Before blaming a change for such a
  difference, read the species' order (`scene.getObjectByName("flora")`'s
  `tree:<species>` children) or hide the flora in both: with it hidden
  the two builds were the same to the pixel.
- **Pictures by number.** `compare.mjs` (this skill's folder; its header) tiles
  the same views from several sources with each tile's mean level; for two
  builds count the pixels that differ by more than 2 and by more than 8
  levels, and look at a 1:1 crop before calling a difference a fault.
  Merged against unmerged, and resolved against per-room, are equal but at
  single pixels on lines where two surfaces touch
  (`../baked-view-lighting/merged-house.md`). Name frames with a prefix
  of your own, and change the names an earlier agent's tool saves under
  before running it.
- **The kits were scratch until 2026-10-17.** The baton's server, the
  kit that poses, pins and times, the turn-taking runner and the short
  timers of 2026-10-10/14 were written in the session's scratch folder
  (`opt/final-timing/tools/`: `serve.py`, `boot.js`, `kit.js`, `t2.js`,
  `fast.js`, `run.sh`; the editor's in `opt/editor-measure/tools/`),
  which a restart of the machine empties — it did on 2026-10-13. They
  survive only as that session's `snapshots/perf-tools.tgz` and
  `perf-tools-2.tgz`, and the other scratch paths these notes name
  (`opt/s4b/…`, `opt/s5b/…`, `opt/s5c/…`) are gone. The usability
  work's kit (104 files in that session's scratch folder) was in no
  snapshot at all. What of it is worth keeping is in the skill's folder
  since 2026-10-17 (build-property-space's then; this skill's since the
  split of 2026-10-18):
  `serve.py` (the tools server and its baton), `boot.js`, `fast.js`,
  `pick.js`, `pair-time.js` and `pair.py`, `frame-split.js`, `gtime.js`,
  `wtime.js`, `cold.js` and `coldsplit.js`, and the in-page drivers
  (`in-page-tools.md`). Copy any other tool you rely on into this folder or
  the snapshots on the day you write it, and change the names it saves
  under before reusing it.
- **GPU time** (`gtime.js`, in this skill's folder):
  EXT_disjoint_timer_query_webgl2 works in the pane (ANGLE/Metal). A query's result is never ready in the
  task that asked for it (WebGL's rule): wait across event-loop turns (a
  MessageChannel, since a hidden pane throttles timers); a synchronous
  poll hangs the tab. Sync each frame (a 1 px `readPixels`) before the
  next query, or each also counts the wait behind the frame before it (5
  frames read 8.6 → 20.6 ms). With the sync it is steady to ±0.05 ms,
  where render() + read back is ±0.3 and, for small parts, does not add
  up.
- **A first visit's shader cache in a warm profile** (`cold.js`, and
  `coldsplit.js` for the frame's parts, this skill's folder). The pane's browser
  keeps every shader it has built, across visits; a first visit builds
  them all. Patch `WebGL2RenderingContext.prototype.shaderSource` before
  the app draws (right after the navigation, before boot.js drives its
  frames), adding to every shader a function of the load's own name that
  main calls (`void coldSalt_<id>() {}` and a call to it). A comment alone
  is not enough: it is gone before the GPU's cache key is taken, and a
  load "salted" with one was barely colder than an ordinary one. Then time
  every frame the app draws with a 1 px read back. Ladonia's A1 kitchen
  first seen built 26–30 programs in a frame of 2.7–3.0 s that way.
  Caveat: shaders built before the patch are not salted, so a program that
  would be the same source as one of them (a shadow map's for another light
  count) is colder than it would really be.

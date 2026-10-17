---
name: build-property-space
description: Build a new walkable 3D space in this repo from a real-estate project — its listing page, floor plans and renders — as close to the real thing as the app can draw it, with buildings, furnished interiors, landscape, trees, grass, sky and lighting, and animated people set round it. Use when the user gives a property listing URL or reference images and asks for a space that looks like it, asks to correct or improve such a space, or asks for people in one. Carries the corrections log of what the user has said was wrong; read it every time.
---

# Build a property space from a listing

The method for building a walkable space from a real-estate listing, and for
correcting one. The worked example throughout is Ladonia Residence in
Kosinožići: generator `scripts/spaces/ladonia/`, scene id
`kosinozici-villas` (the id is older than the folder name). Anything tagged
"Ladonia", or named after its buildings A, B and C, is that project's
value, not a rule.

Read the **Corrections log** at the bottom first: its general lessons are
already folded into §0–§13 (the people's into §4b); from its entries take
what the user cares about and the "Still short" lists, which are gaps not
to repeat. Add a dated entry naming the project whenever the user says
something is wrong or you find something worth doing differently. Keep
this file the single source of truth for the method — edit it, don't
append duplicates.

**The user's standing terms.** Realism first, performance as their choice
(the quality slider) — and, since 2026-10-10, the highest frame rate that
keeps the most realism: the editor under a plain working light until the
look is asked for, a published view drawn from its bake by default (§12);
since 2026-10-16, in their words, "I want the frame rate both in the
editor and in the public view to be as high as possible": a new feature
must not slow down what was there, and must cost as little as possible
when used. Measure that against HEAD at the same spots, both ways round
(§12; `app-notes.md`, Measuring).
A listing is built *exactly* — structure, scenery and
interiors — so a buyer has the feel of the real property; where the plans
can't be followed (a door too narrow to walk through), deviate as little as
possible and say so. Bought-in assets (textures, skies, plants and vases,
cars, and the people's characters and animation clips) may come from any
source whose licence the user accepts — prefer CC0 or MIT where there is a
choice — each listed with source and licence in `assets/THIRD_PARTY.md`
(cars, avatars and people in the README too) for the user to review. A
source behind an account (Mixamo's Adobe login) is the user's to sign in
to, in the browser pane; you then download what they agreed to (§4b).
Where a licence lets files be used but not passed on (Mixamo's), the
downloads stay git-ignored in `assets/`, and whether what is built from
them is committed is the user's decision: ask (this repository is public,
and for Mixamo they chose to keep the converted files out of git too:
`.gitignore`). Furniture is modelled in
Blender, not downloaded. Never restart or touch their server on port
3000, never act on a tab of it, never `preview_start` its `walkthrough`
entry in `.claude/launch.json`, and never build into the `dist/` it
serves while work is in progress: work is built into scratch folders and
`dist/` only at delivery (§0). Never touch `scenes/wrenfield-house.json`;
back up any other scene before writing it, and never undo the user's
edits (§0). Never write the repo's `published/`: a test server may read
it, but publish and bake into a scratch `PUBLISH_DIR` (§0, §10b) unless
the user asks for theirs. Never deploy, spend or contact anyone, and
commit, open PRs or merge only when asked. Big work goes as a plan
first (doable? steps, alternatives, questions), then step by step, quick
wins first, with measured before/after numbers; "do it" after a proposal
means build it, not publish the plan. If a request sets a time limit, track
it with `date` and report before it runs out.

For new features in the app, the plan that worked (2026-10-16):
- First, a read-only survey: one reader per area, whose file:line facts
  the plan and every brief then cite.
- Then the plan:
  - what each new key does;
  - the defaults the user may accept wholesale;
  - the stages, quick wins first;
  - only the questions the survey could not answer. That time there were
    four: the Mixamo sign-in, the TV's content, steering from above, and
    which kitchen fronts open.
- Their answers go word for word into the design file every agent reads.
- Each stage ends with a report whose "Still short" is split into:
  - the user's to decide;
  - found and left;
  - not yet done;
  - unseen (a phone, a visible tab, two visitors);
  - left for the user (a build, a reload, a publish and bake, a commit).

**What a visitor can do in a space**, as the user answered on 2026-10-16
(standing until they say otherwise):
- Each visitor has their own state: no sharing of doors, lights, taps,
  the TV or the cars.
- No sound.
- Every kitchen front opens but the dishwasher's and the ovens'.
- Sitting, but no lying down. Swimming, but no diving. Both by Mixamo
  clips, downloaded through their own sign-in (§4b).
- A television plays a real video loop: public domain or CC, about 3 MB,
  fetched when it is first switched on.
- From above, the car's keys are the car's.
- Edit mode gets only the colliders' wireframes.

Supporting files in this folder:

- `reference.md` — the generator's helpers (`kit.js`, `furnish.js`,
  `index.js`), the spec fields that matter, the landscape schema as the
  builders read it, the people's data (entries, seats.json, the index, the
  planner's constants, the scripts), the view's lists (a link's words, the
  browser's stored keys, the slider's steps, the publish options, the
  bake's options and the manifest's lighting fields) and the numbers that
  worked. Read it before writing or changing a space's scripts, before
  placing people, and before opening a test tab with anything in its link.
- `app-notes.md` — the app around a space: the validator, the editor with
  its plain light, view scope and stand-ins, its rays and collision trees
  and when it draws a frame, lights and fittings, people, publishing, what
  a visitor's device is given, how a baked view is drawn and exposed, the
  live room, baking, measuring, tone mapping, cars, Blender, in-page
  audits, the browser pane's limits, the shell, git — and since
  2026-10-16 the colliders drawn as wireframes (C), what the visitor acts
  on (the one picker behind E and F, its providers, the list of keys, Q
  and which room the visitor is in) and driving from above, and since its
  waves A and B windows that open, sitting and the televisions, running
  water and steam, and swimming and the pool's steps, and since wave C
  the pool's water and what a baked view runs every frame (the editor's
  stand-ins holding still what they draw too). Read "The
  spec, the validator and the editor", "The editor's plain light and
  view scope", "When the editor draws" and "The browser pane" before the
  first seed and test session; "Rays and the collision trees" before
  adding a ray or anything that moves by itself; "Furniture: the
  catalogue, its height and its collision" and "Doors" (the furniture's
  parts: labels, axes, how far each opens, the light inside a piece, ways
  in) before modelling a piece whose fronts open; "Windows that open"
  before choosing a space's windows; "What the visitor acts
  on" before adding something to sit on, turn on or open, a key or a
  touch button ("Running water and steam" for a shader of its own, and
  how to make its programs before they are wanted), and "The colliders
  drawn" before adding anything that
  collides outside the trees; "How a baked view is drawn" (what runs every
  frame) before adding anything that moves under a group held still or a
  light that comes and goes; "Measuring" before timing anything or
  comparing two builds; the rest when you publish, bake, light, place
  people, add a car or use Blender.
- `briefs.md` — reusable templates for the agents of a round (§11): the
  read-only auditor, the model builder in a Blender copy, the placement
  builder in a generator copy, the floor reviewer, the model and render
  reviewer, the final integrity reviewer and the RESUMING preamble, with
  lessons on writing briefs; and, for work on the app's own code in the
  one checkout (§11), (h)–(p): the code survey reader, the lane builder,
  the reviewers, the integrator, the measurer and end-to-end verifier, the
  docs fact-checker, the scratch-publish lane, the targeted pass and the
  verifier of what moves the visitor's figure.
- `checks/` — node checkers run against the seeded scene (or the generator):
  furniture reach and spacing, every stair and route, the street steps,
  z-fighting, C at street level, and small GLB and plan helpers
  (`_glbbox`, `_glbparts`, `_modes`, `_plan`). `doors-dump.mjs` lists every
  hinged door with its emitted wall, side A, hinge point and where the
  leaf parks. `door-swing.mjs` sweeps each leaf to Door.js's full open
  against the furniture and the other leaves (§8). `people-plans.mjs
  <scene-id> [--seeds 20]` holds the people planner to its own rules over
  many seeds, and reads the scene's saved people the same way (§4b); it
  works on any seeded scene. `_hands.mjs <glb | catalog-id>…` gives each
  furniture part's label, shut box, hinge edge and swing or slide;
  `part-sweep.py <scene.json>` sweeps every placed part against the other
  pieces' boxes and the walls (§4). Run it with Blender's own
  `python3.13`, which has numpy. As shipped most of the others audit
  Ladonia; read `checks/README.md` before §8 for how to run each and what
  to change for a new project. Its last section, "Every tool in this
  skill's folder", gives one line of use for every tool here, by group,
  and the order a test tab loads them in.
- `models/` — model QA (commands, and what a good piece reads, in
  `models/README.md`):
  - `views.py` renders four views of each id: front 3/4, orthographic
    side, top-front and back 3/4.
  - `sheet.mjs` joins them into one sheet per id.
  - `pair.mjs` puts a listing render above our frame from the same camera.
  - The measurements: `lean.py` (which way each soft part's top points),
    `profile.py` (a part's thickness across it), `facets.py` (the share of
    split normals), `contacts.py` (one part's vertices inside another, and
    gaps), `flatbase.py` (flat faces where a part sits) and `coplanar.py`
    (coplanar overlapping faces of different parts).
  - Parts that open: `sweep.py` (each part swept shut to open against its
    own piece's static parts, about its hinge's axis), `openview.py` (GLBs
    rendered with their parts open or shut; `--flat 1` flattens textures
    to their mean, `FIX=1` draws the water, control and steam anchors),
    `imgdiff.py` (the share of pixels over 2, 8 and 24 levels apart, and
    an amplified difference) and `export_scratch.py` (export_furniture.py
    into a scratch folder: `B2_OUT`, refused inside `public/`).
- `walk.js` — in-page: walks the real player physics through every door
  both ways and along routes (`__walk.doors()`, `__walk.to()`,
  `__walk.free()`). It walks the collision as it stands, and first
  finishes a tree an edit left being built a slice a frame
  (`sceneBuilder.settleCollision()`: `app-notes.md`, Rays and the
  collision trees).
- `openables.js`, `sit.js`, `tv.js` — in-page, through the sink after
  act.js: the furniture's parts as the visitor meets them (`walkIn` every
  part, `freeSpots` between a kitchen's arms, `sameTriangles` the
  editor's tree against a publish's — these three in an editor tab
  alone —, `stops()` what stops each part,
  `everyE()` E on one part of each kind or on all, `sashes()` every window
  turned or tilted and shut), sitting (`await __sit.ready()` first — the
  clips worn, the seats dressed, their catalogue read — or the first E
  only queues the sit), the televisions (`app-notes.md`, In-page audits;
  Sitting and the televisions).
- `water.js`, `steam.js`, `wtime.js`, `gtime.js` — in-page, through the
  sink after act.js: the taps and showers (`__water`: `list`, `go`,
  `inside`, `press`, `sweep` every control, `sheet`, `view`, `inject`
  anchors into an older publish), a shower's steam over time as sheets and
  what the water costs (`__steam`), a frame's wall time and its draws over
  all of the frame's renders (`__wtime`: `info.render.calls` holds the
  last pass's alone) and its GPU time by the timer query (`__gtime`)
  (`app-notes.md`, Running water and steam; Measuring).
- `jump.js` — in-page, through the sink: runs and jumps at every upstairs
  window with a sill and says whether the capsule got out (`__jump.all()`;
  `app-notes.md`, Rays and the collision trees).
- The usability work's in-page tools (2026-10-16/17), through the sink
  after `boot.js` and `act.js`; one line each in `checks/README.md`, Every
  tool in this skill's folder:
  - Q and the room the visitor is in: `lights.js` (`__lights`; `walk`
    counts the readout's changes across a threshold) and `hud.js` (the
    HUD's top row measured).
  - Driving from above: `birdcar.js` (`__bc`; `behind()` is the byte for
    byte drive across two builds) and `holes.js` (culled faces the view
    from above would see). `count-views.mjs` counts a published version's
    bird's-eye samples, its drive ones included (read-only).
  - The pool and swimming:
    - `pool.js` (`__pool`) and `pool-look.js` (`__poolLook`, its poses
      worked out from the pool's box and steps);
    - `clips.js` (`__clips`: the figure against the water);
    - `swim-trace.js` (`__trace`: bones, facing, waterline and limbs a
      frame);
    - `swim-checks.js` (`__swim`: walls, corners, taps, the climb).
  - What other visitors see: `others.js` (`__others`: mirrored in the
    page, or sent and received by two real pages), with `net.py`.
  - Sitting:
    - `seat-sweep.js` (`__seats`: every seat sat on and got up from, the
      limbs against all but the seat's own piece), with `seat-sweep.py`
      and Ladonia's `ladonia-seat-starts.json` and `ladonia-w-boxes.json`;
    - `figure-fade.js` (`__fade`: sat on from afar, got up mid-fade, the
      very materials worn after).
  - Measuring:
    - `pair-time.js` (`__pair`: two tabs in turns through the baton) with
      `pair.py`;
    - `ladonia-spots.js` (the timing spots: copy it as
      `<project>-spots.js`);
    - `frame-split.js` (`__frame`: where a frame's time goes);
    - `hold-check.js` (`__hold`: the editor's held units against three's
      own walk and against the frame let go);
    - `cold.js` (before boot.js) and `coldsplit.js` (a first visit's
      shaders, and what each frame built);
    - `light-in.js` (a fridge opened as a first visitor opens it);
    - `glass-race.js` (the glass-door race forced, §13);
    - `vshot.js` (a frame with the page's own HUD over it).
- `serve.py`, `boot.js`, `fast.js`, `pick.js` — the tools server and a test
  tab's start (§0). `python3 <skill>/serve.py <scratch>/frames 3187` serves
  this folder's files as the sink does, saves POSTs and passes the baton
  that timing tabs take in turns (`take?me=`, `give?to=`, `ready`, `prog`,
  `status`, `wait`). `boot.js` is the first call after every navigation
  of a test tab (`await window.__dvBoot; window.__dvBooted`). It:
  - stubs every non-GET but the tools' own, and a publish unless
    `window.__bootPublish`;
  - loads `fast.js` (short timers for a throttled tab; it needs serve.py)
    and `drive.js`, and drives the frames;
  - passes the name prompt, with the avatar `window.__pickSkin` names;
  - in an editor tab, loads harness.js and sets the pace to "always".

  Both servers serve this folder's top-level files only: nothing in
  `checks/` or `models/` can be loaded by a page.
- `encode-video.py` — `<blender> --background --python
  <skill>/encode-video.py -- <src> <out.mp4> <t0> <t1> <w> <h> <kbps>
  [fps]`: an H.264 loop for a television, in Blender's sequencer (this
  Mac has no ffmpeg); its header has Ladonia's cut.
- `patch-pool-steps.mjs` — `node <skill>/patch-pool-steps.mjs <scene.json>
  [--pool b-pool] [--steps JSON] [--backup dir] [--dry-run]`: a seeded
  scene's pool given its `steps` and nothing else, without seeding it
  again (a backup first; refuses a file not as the server writes it, or
  one changed while it ran). Reload every editor tab on the scene first,
  and give it `--backup`: its default, `backups/` beside it, is in the
  repo and not git-ignored (§0).
- `act.js` — in-page, through the sink (in an editor tab after
  harness.js, or in a public view): drives what E, F and Q do, as walk.js
  drives the walk — `__act.doors()`, `drawers()`, `switches()` list what
  there is, `stand`, `aim`, `look`, `press("E" | "F" | "Q")` and `spot`
  stand the capsule (`stand` resets a swimmer first, as `Player.placeAt`
  does), turn the camera on a thing, run the look ray and the
  prompt and press, keeping every event told; `run()` does Ladonia's
  spots (a door, a drawer, two switches, the BMW) and times the look ray.
  It reads the build before 2026-10-16 and after alike, so the same spots
  on two builds can be compared; a kind added later passes its own
  `state` to `spot` (`app-notes.md`, In-page audits; What the visitor
  acts on).
- `zfight.js` — in-page: `__zfight({ limit })` finds coplanar or near
  coplanar triangles drawn on the same depth layer, clustered. It tests
  what is shown, so in an editor tab it first sets the view's scope to All
  for the page (the editor opens with the cars, the far ground and the
  neighbourhood hidden) — and it reads the scene's own meshes, passing
  over the stand-ins the editor draws them by (§10; left in, every surface
  fights its own copy).
- `harness.js` — in-page, once the space has loaded: `__K.pose(p, t, fov)`,
  `__K.shot(label, width)` (a canvas), `__K.save(name, canvases, cols)`
  (through the sink), `__K.time(n)` (the render timed to a pixel read back,
  with its draw calls and triangles), and `__K.render(name, keys, opts)`
  over `__K.views` (the views file's `__POSES` replaces these). An editor
  tab opens under the editor's plain light with the houses alone drawn
  (§10): `await __K.realistic()` turns the realistic preview on for the
  page — sun, shadows, lamps, post-processing, everything shown — and
  `__K.scope("all")` shows the surroundings under the plain light; `render`
  calls the first itself, `shot` and `time` draw the tab as it is lit —
  under the plain light by the editor's stand-ins, whose draw calls are
  what `time` counts (§10). It
  stubs every non-GET fetch but a publish's, its runtime file's and a
  bake's (`/publish`, `/runtime`, `/bake`), so a test tab can publish to
  the test server's `PUBLISH_DIR` but never save the scene — and it
  answers a tool's own POSTs too, all but those to the sink
  (`app-notes.md`, The browser pane).
- `drive.js` — in-page: frames for a tab the browser isn't drawing (the
  pane hidden, a background tab): `__driveOn()`, `await __drive(ms,
  until)`, `__driveOff()`. Loaded after the app asked for its first frame
  it may have nothing to run: one `experience.update()` then (app-notes.md,
  The browser pane). An editor tab at rest asks for no frames at all — it
  draws only when something has changed: `experience.pace.set("always")`
  first for whatever counts on driven frames, `set(null)` after
  (`app-notes.md`, When the editor draws).
- `undef.config.mjs` — an ESLint config with only `no-undef`, for after
  moving code between files (`node --check` and the build both pass a call
  to a function that no longer exists; 2026-10-05 it stopped every view lit
  live): `npx eslint -c <skill>/undef.config.mjs --no-ignore frontend/Experience
  frontend/index.js shared scripts server` (any ESLint 9+; the repo has none).
- `ladonia-views.js` — in-page, after harness.js: the reference-matched
  poses (`__POSES`, keyed by gallery number), `__renderSet(prefix, keys)`
  and `__plans(prefix, which)` (top-down cuts 1.5 m above each floor).
  `__renderSet` turns an editor tab's realistic preview on first
  (`__K.realistic`); `__plans` draws the tab as it is lit — evenly, under
  the plain light, which is what a plan cut is read for.
  Make one per project: copy it to this folder as `<project>-views.js`
  (sink.py serves only this folder), replace `__POSES` with your
  references' cameras, change the night key in `__renderSet` (`"16"`) to
  your night reference, and rewrite `__plans`'s `at` table and default list
  (one entry per building and floor: centre x, centre z, floor y with the
  building's level, span). Keep your routes for `__walk.to()` there too.
- `sink.py` — the frame sink on 127.0.0.1:3199: writes POSTed frames to a
  folder and serves this folder's files by GET (load helpers with
  `await eval(await (await fetch("http://127.0.0.1:3199/walk.js")).text())`).
- `thumbs.py` — renders catalogue GLBs to PNGs in Blender, to look at new
  furniture before placing it (command in §4).
- `prep_review.mjs` — run from the scratch folder: `cd <scratch> && node
  <skill>/prep_review.mjs <round> [frame-prefix]` pairs
  `frames/<prefix><n>.jpg` with `<project>/gallery/<n>.jpg` in random order
  into `review/<round>/`, the key in `review/<round>.key.json`. Its key list
  (10–22) and `ladonia/gallery` folder are Ladonia's: change them.
- `gridcrop.mjs` — `node <skill>/gridcrop.mjs <plan.png> <out.jpg>
  <px-per-m> <origin-px-x> <origin-px-y> <x0> <z0> <x1> <z1> [zoom=4]`: a
  plan crop with a metre grid (lines every 0.5 m, labels every metre) in a
  building's own frame; origin-px is the plan pixel at the building's outer
  north-west corner, x0…z1 the crop in metres.
- `copy-merge.sh` — the parallel copies of §11. `blender-copy` and
  `gen-copy` give an agent its own copy of `blender/` or of
  `scripts/spaces/<space>/`, keeping a pristine base once. `merge-blender`
  and `merge-gen` merge the copies back into the repo with `git
  merge-file` against that base and report conflicts.
- `bake-replay.py` — reruns the bake's atlas packing (`pack_zones`) on a
  `BAKE_CHECKPOINT` scene in a minute; `app-notes.md` (Baking)
  has when and how.
- `bake-check.js` — in-page, in a baked `/view/<id>` after harness.js and
  the views file: `__bakeCheck({ poses: [...] })` gives the sun drawn vs
  baked vs the site sky's (degrees apart); `black`, each room's part of
  each lightmapped mesh that baked black, read from the bake's own
  one-scale lightmap file (no switch on, every door open); `drawn`, the
  same scan of what the view draws now, read from the resolved lightmap
  (switches as they are, doors as they stand — null where the light is
  not resolved); each room's daylight from the bake's probes; the light
  meter's exposure per pose; and `cannot`, a plain list of whatever it
  could not read. Rewritten 2026-10-12 for the resolved lightmap (the
  older one drew `material.lightMap.image` to a canvas, which is no longer
  a picture); run by day on Wrenfield's two bakes only so far.
- `compare.mjs` — `node <skill>/compare.mjs <out.jpg> "<path with {k}>" …
  -- <keys…>`: one row per view, one column per source (render | live |
  baked), each tile labelled with its mean luminance, the table printed as
  JSON. Missing frames show red.
- `people-audit.js` — in-page, after harness.js, in the editor's page of a
  test server whose space has people (§4b; as it loads it sets the view's
  scope to All for the page — the editor opens with the garden not made,
  and the planting is part of what it measures against; it measures
  against the builder's own meshes, which the editor's stand-ins leave
  where they were):
  `__people.audit()` measures
  each person's skin, through their clip, against the floor, their seat or
  lounger and everything round them, and flags what is out of tolerance
  (`__people.TOL`); `__people.load(plan)` puts a plan's people in the page
  and `__people.patch({…})` edits them by hand, neither saving anything;
  `__people.lineup()` frames every character side by side and
  `__people.shots(prefix)` each person close.
- `mixamo.js` — in-page, on mixamo.com once the user has signed in there
  (paste its text into `javascript_tool`: that page cannot reach the
  sink): `__mixamo.pickCharacter`, `pickAnimation` and `download` pick
  characters and clips, drive the Download dialog and catch each
  export's link; `__mixamo.inPlace(on)` sets a clip's *In Place* box;
  `__mixamo.batch(list)` and `take()` do a list of them (never yet run on
  the site). `mixamo-fetch.sh <links-dir> <repo>/assets/people` is the
  background watcher that curls those links into `assets/people/<kind>/`
  — `characters`, `animations`, or `avatar` for the visitor's own clips,
  from links named `avatar__<name>.url` (§4b; `app-notes.md`, The browser
  pane).

## Starting a new space (in this order)

1. Read the Corrections log.
2. Do §1 and enough of §2 to scope the job, read-only.
3. Send the plan and wait for "do it": the buildings and flats counted,
   the site levels, streets and lanes, what the app can't draw, the Blender
   pieces needed, the milestones below, and your questions (people: §4b's).
4. Scaffold `scripts/spaces/<project>/`:
   1. Copy `ladonia/kit.js`, and change only your copy from then on. Set
      your listing's defaults in it (kit's opening helpers default to
      Ladonia's slim bronze frames, `win` blinds at 0.5 and oak door
      leaves), and fix its N/S stair mapping (`climbs: "N"` gives yaw 0,
      which climbs *south*; Ladonia used only W/E flights — swap to
      `{ N: 180, S: 0, E: 90, W: -90 }` and walk the first N/S flight).
   2. One `<design>.js` per building design on the pattern of `ab.js`:
      `export const X = { storey, roof, … }` and `export function
      buildingX(tag, offset, { furnish })`, which makes a `Building`, lays
      out its floors and roof, calls `furnish(b)` and returns `b`.
   3. Copy `furnish.js`'s helpers (everything above `furnishAB`) and replace
      the `ld-` ids they hard-code (`kitchen`, `bedSet`, `LOOK`,
      `gardenTable`, `loungePair`); then one `furnish<X>(b)` per design.
   4. `index.js` from Ladonia's: the site constants, buildings, gardens and
      `landscape`, exporting a spec with the same top-level fields (`name,
      summary, environment, garden` (all off, §5), `landscape, rooms,
      walls, roofs, stairs, floor_openings, doors: [], vehicles, furniture,
      finishes: {}, spawns`). Write the listing's URL and API ids in its
      header comment so a later session can fetch them again.
   5. Register it in `scripts/seed-scenes.js` (an import and an
      `["<id>", <project>]` pair at the bottom; the kebab-case id is the
      `/?scene=<id>` URL — check `scenes/<id>.json` doesn't exist yet).
   6. `node -e "import('./scripts/spaces/<project>/index.js').then(() =>
      console.log('ok'))"`, then `npm run seed -- <id>`, and read its notes
      and counts.
   7. A views file (`<project>-views.js`, see the list above), a spots
      file for timing (`<project>-spots.js`, from `ladonia-spots.js`) and
      your own copies of the checkers (`checks/README.md`).
5. Build in milestones, seeding and walking (§8) after each: one building's
   shell; every building at its site level with the street, lanes and
   entrances; landscape; furniture; light; people, where the user wants
   them (§4b); then critic rounds (§11).
6. Give every feature of the app what it needs of the space (since
   2026-10-16), and try each (§8.6–9):
   - **Windows that turn or tilt**: slim windows with sills of 0.3 m or
     more (§3).
   - **Fronts that open**: modelled with parts, each labelled for the
     prompt; a fridge's door labelled exactly "fridge", for its light; the
     body under 12,000 triangles; swept against its piece and the scene
     (§4).
   - **Taps, showers and steam**: water, control and steam anchors on
     every wet piece (§4).
   - **Sitting and the televisions**: new pieces measured into
     `seats.json` and `screens.json` (§4).
   - **Swimming**: a pool's `steps` on the loungers' side (§5), and the
     visitor's clips packed (§4b).
   - **Q**: a switch in every room.
   - **Driving from above**: a car and a terrain or ground plane (§8.6).
   - **Speed**: what a new piece or feature costs, measured against HEAD
     at the same spots, both ways round (§12).

## 0. Session hygiene

- Back up `scenes/*.json` before each write after the first seed (a new
  space has none before), somewhere a restart keeps:
  `~/.claude/projects/<project>/<session>/snapshots/scene-backups/`, not
  the scratchpad (below). `cmp` before every later write: the user keeps
  editing in their own tab and their server saves too (Ladonia,
  overnight: a counter scaled to 0.8, a sofa nudged, a terrace sofa turned
  round; on 2026-10-17, hours after the pool steps' patch, five dining
  chairs moved or turned and a sixth scaled to 0.88). Give any tool that
  writes a scene that folder: the default of `patch-pool-steps.mjs
  --backup`, `backups/` beside the tool, is in the repo and not
  git-ignored. Before writing the user's own file:
  - their server on 3000 not running (`lsof -nP -iTCP:3000
    -sTCP:LISTEN`; never stop it yourself);
  - the file's md5 the one you last saw;
  - a dry run first;
  - the restore command in the report.

  Before any reseed, diff the generator's validated output against the
  scene; carry the user's edits into the generator, or patch only your
  own entries with node (next). A reseed's spec has no `people`: copy them
  out of the scene first and write them back after (§4b). Never delete
  user edits that look accidental (a coffee table on the lawn) — name
  them in the report.
- **Patching the user's scene.** When the generator comes to emit a field
  that a reseed would bring in at the cost of every edit (a pool's
  `steps`), never edit the file by hand. Write a tool on the pattern of
  `patch-pool-steps.mjs`. It:
  - refuses a file that does not read back byte for byte as the server
    writes it (`JSON.stringify(…, null, 2)`);
  - copies the file first (`--backup <dir>`);
  - writes through a temporary file and a rename, and refuses if the file
    changed on disk while it ran;
  - reads the result back and shows that the one field is all that
    differs;
  - with `--dry-run`, prints the size before and after and writes
    nothing.

  Try it first on the lanes' copies of the scene, each byte-identical to
  the user's before the patch. Reload every editor tab on the scene before
  the real run, or its next save writes the old field back. Check the
  field in a reloaded tab before publishing from it. Run it on the user's
  file at delivery, and name the backup in the report.
- `npm run seed -- <id>`, never bare `npm run seed` (it rewrites every
  space). Import the generator with node first to catch module errors.
- **The user's own server, on port 3000, serves the repo's `dist/`**, and
  they use the app while you work: a build into `dist/` is what their
  tabs load next, finished or not. So work in progress is built into the
  scratch folder — from the repo's root, `npx vite build --outDir
  <scratch>/dist-work --emptyOutDir` (the folder as an absolute path: Vite
  takes a relative one from `frontend/`) — and the repo's `dist/` is built
  once, at the end, when the work is finished and checked (`npm run
  build`), or left to the user and said so: until then their server shows
  none of it. Wherever this file says `npm run build` for something to be
  looked at in a test tab, it means that scratch build.
  - Never run two builds into one outDir. Lanes building at once each
    build into their own (`<scratch>/<job>/<lane>-dist`) from the one
    checkout. Vite reads the tree as it stands, so a build may catch
    another lane mid-edit: if it fails in a file you do not own, wait a
    minute and build again.
  - After integration, clone one merged build into every lane's dist, so
    that every server serves the same tree: `npx vite build --outDir
    <scratch>/<job>/merged-dist --emptyOutDir`, then for each lane `rm -rf
    <lane>-dist && cp -c -R merged-dist <lane>-dist` (APFS clones).
  - Before trusting a served build, show it is current. Either no file
    under `frontend`, `shared`, `public`, `scripts` or `server` is newer
    than its `index.html` (`find … -newer`), or a fresh build into another
    folder comes out byte-identical.
- Test on a server of your own, started in a folder of its own: the
  server takes `dist`, `scenes` and `published` from its working directory,
  and `SCENES_DIR` and `PUBLISH_DIR` move the last two (server/index.js,
  server/store/drivers/fsStore.js, server/publish/store.js). So make
  `<scratch>/srv` with `dist` a link to `<scratch>/dist-work` and `scenes`
  a copy of the repo's, back up `.claude/launch.json` and add
  `{ "name": "house-test", "runtimeExecutable": "sh", "runtimeArgs":
  ["-c", "cd <scratch>/srv && PORT=3108 PUBLISH_DIR=<scratch>/published
  BAKE=off SCENES_DIR=<scratch>/srv/scenes exec node
  <repo>/server/index.js"], "port": 3108 }`; start it with `preview_start`.
  Nothing a test tab does then reaches the user's scenes. A seed (`npm
  run seed -- <id>`, from the repo) writes the repo's `scenes/`: copy the
  seeded file into the server's folder and reload the tab — the server
  reads a scene's file at each request. A second entry with `PUBLISH_DIR`
  at the repo's `published/` shows the user's own versions — to look at
  only, never to publish from or bake against. To compare with the app as
  the user has it, copy `dist/` to `<scratch>/dist-before` before
  anything is built and serve it the same way on another port (§12).
  Start this folder's sink and tools server by their paths, in the
  background: `python3 <repo>/.claude/skills/build-property-space/sink.py
  <scratch>/frames` and `python3 <…>/serve.py <scratch>/frames 3187`
  (run_in_background). Open
  `http://localhost:3108/?scene=<id>`, pass the name prompt and front the
  tab (`app-notes.md`, The browser pane), then load helpers with
  `await eval(await (await fetch("http://127.0.0.1:3199/harness.js")).text())`
  — the harness first, in every editor tab: it stops a save, which over a
  copy of the scenes is the second guard and over the repo's own the only
  one — likewise your views file and `walk.js`. Or, first after every
  navigation, `boot.js` from the tools server
  (`await eval(await (await fetch("http://127.0.0.1:3187/boot.js?" +
  Date.now())).text()); await window.__dvBoot`), which stubs the saves in
  any tab, passes the prompt, drives a hidden tab's frames and loads the
  harness in an editor tab (the list above). That tab opens under the
  editor's plain light with the houses alone drawn, by stand-ins, and at
  rest draws nothing: for what a visitor will see, `?preview=1` in the
  link or `await __K.realistic()`; for a helper of your own, §10. A
  server serves the build it was started over: build again after any
  frontend or `public/` change, and restart the test server after a
  catalogue, finish or validator change (it runs the repo's `server/` and
  `shared/` as they stood when it started).
- **Several lanes at once** (2026-10-16/17): a test server per lane, named
  `<job>-<lane>`, each on its own port — `ux-base` 3130, `ux-p` 3131,
  `ux-c` 3133, `ux-s` 3134, `ux-w` 3135, `ux-b` 3136 — over
  `<scratch>/<job>/<lane>-srv/`, with `dist` a link to the lane's own
  `<lane>-dist` and `scenes` its own copy, `BAKE=off`.
  - The base server serves HEAD, built once before the first edit
    (`base-dist`; `HEAD-at-start.txt` names the commit). It reads the
    user's `published/` read-only, and is the "before" of every
    comparison.
  - Lanes that need a public view's new code paths share one scratch
    `PUBLISH_DIR` (`pub-w`): a copy of the user's latest version, which
    `?version=<v>` still reaches after newer publishes there.
  - At most five preview servers run at once: stop those a wave no longer
    needs (`preview_stop`).
  - Only the lead edits `.claude/launch.json`; agents are told not to.
    Its `walkthrough` entry is the user's own server on 3000: never
    `preview_start` it.
  - A rebuilt dist needs only a reload. Restart a server (`preview_stop`,
    then `preview_start`) only after a change to the `server/` or `shared/`
    code it runs. A restart may navigate some other tab of the pane to it
    (twice on 2026-10-17): leave tabs that are not yours alone.
  - Agents open tabs of their own (`tabs_create`, then every call with
    its `tabId`), never another's, and close them at the end.
- After a usage-limit break or reconnect: `preview_list`, `lsof` the test
  servers' ports (3108, or the lanes'), the sink's 3199 and the tools
  server's 3187, restart what died (the sink only when you next need frames,
  `run_in_background` with the longest timeout, 7200000 ms), re-check the
  scene file against the backup, redo the tab setup before trusting a
  frame, relaunch any critic that failed, and resume stopped bakes (delete
  a stopped bake's half-written `bake-<stamp>/` folder; `.bake-lock` clears
  itself once its pid is dead). A workflow's agents may all die mid-task
  at a limit (two whole rounds did during the people work): keep their
  copies, diff each against its base to see what it got done, read each
  dead agent's transcript for what it had already found (below), and
  relaunch only the dead ones with the RESUMING preamble (`briefs.md`)
  before their unchanged brief.
- The scratch folder is under /private/tmp and does not survive a restart
  of the machine (2026-10-09: backups, frames and reports gone mid-task).
  Keep nothing only there that cannot be made again:
  - downloads go straight into `assets/`;
  - agents return their reports as their final text, which the workflow's
    journal keeps:
    `~/.claude/projects/<project>/<session>/subagents/workflows/<wf>/journal.jsonl`
    has a `{"type":"result","agentId":…,"result":…}` line for each agent
    that finished (its label is on its `started` line), and
    `agent-<agentId>.jsonl` beside it is the agent's whole transcript.
    Write the reports out again from there;
  - a vetted plan or patch goes into the report's text, entry by entry,
    not only into a scratch file;
  - a tool worth keeping goes into this skill's folder the same session,
    with a header in the style of the others (the usability work's
    hundred-odd scratch tools were in no snapshot until they were brought
    here on 2026-10-17);
  - and keep a copy as you go in
    `~/.claude/projects/<project>/<session>/snapshots/`, which is what
    saved the work across the restart of 2026-10-13:
    - `reports/`: the design files every agent reads, the surveys, each
      agent's report, each workflow's result JSON;
    - `tree-<stage>.tgz` after each stage: the changed and new files
      (`git ls-files -m -o --exclude-standard | tar czf …`);
    - the job's measuring tools as a tarball;
    - `scene-backups/` (above);
    - `assets/`: downloads not in git (the TV's clip and its encoding,
      copies of the Mixamo files);
    - `frames/<stage>/`: the pictures shown to the user;
    - before editing the skill, a tarball of it.

    The harness keeps each Workflow's script
    (`<session>/workflows/scripts/<name>-<wf>.js`) and its run
    (`<session>/workflows/<wf>.json`, with its `result`) beside the
    journals.

  After any break — a restart, a limit, a night — take the scene backups
  and their md5s again before the next write, and run `git log -3` and
  `git status`: the user may have committed meanwhile (2026-10-06:
  everything, the temporary launch.json entry included). The
  `.claude/launch.json` to restore is then `git show <the commit
  before>:.claude/launch.json`, and taking the test entry out at clean-up
  leaves an uncommitted change: say so.
- Agents' patches can silently undo earlier edits (one written against an
  older `kit.js` removed the door widening; 57 narrow doors came back). Back
  up the scripts, apply one patch at a time with `git apply --check`, diff
  key files against the backup, and re-run every check after each.
- **Before saying a change to the app is done**, run three checks:
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
    the report says so.
  - `JSON.stringify(__act.run())` in an editor tab and a public view,
    against the base server's: the same, but for what was meant to change.
- End every report that changed a scene, the app or the server with the
  user's steps: `npm run build` if frontend or `public/` changed and the
  repo's `dist/` was left as it was; reload every open app tab before
  editing (an old tab autosaves its old scene over the fix, and keeps the
  old build); restart `npm start` if server code changed; and re-publish
  and bake to see it in `/view/<id>`.
- Clean up: stop the test servers, kill the sink and the tools server,
  restore `.claude/launch.json`, close your tabs, clear the `localStorage`
  keys set while testing (`render-quality`, `view-lighting`,
  `view-scenery`, `view-lost-graphics`, `editor-preview`, `editor-scope`,
  `editor.trackpad`, `publish-options`; and `view-reloaded-at` in
  `sessionStorage`: `reference.md`), and reset a viewport set with
  `resize_window`.

## 1. Research the listing first, exhaustively

Never build from the first image alone. Gather everything before modelling:

1. **Fetch the page in the in-app browser** (WebFetch misses JS-rendered
   galleries). Decline non-essential cookies.
2. **Find the JSON API** the page calls (`read_network_requests`, or
   `performance.getEntriesByType("resource")` filtered by `/api/`). For
   konekt-nekretnine.hr:
   - `/api/v1/real-estate-project-listings/<id>` — project, gallery
   - `/api/v1/real-estate-project-listings/<id>/buildings`
   - `/api/v1/real-estate-project-listings/floor-listings/<id>?buildingId=<b>&fillEmptyFloors=false`
     — per floor: the blueprint (`floorGroupPlanS3ImageLink`), unit
     polygons, net areas, bedrooms, bathrooms, toilets
   - `/api/v1/real-estate-project-listings/<id>/apartments?page=0&size=50`
   The per-unit `additionalRealEstateDetails.images` are exterior renders,
   not plans. Read the unit list (code, rooms, m²) for the flat count per
   building before modelling: Ladonia has 5 per building (1–3 ground, 4–5
   upstairs), not the 4 first guessed.
3. **Download everything** with `curl -A "Mozilla/5.0"` into
   `<scratch>/<project>/`: `gallery/<n>.jpg` in the listing's gallery order
   (views and blind pairs key on these numbers), `plans/<building>-<floor>.png`,
   `units/`, `api/*.json`. Keep them out of the repo (the listing's
   copyright). Convert WebP to JPEG with sharp to view them. Sites that
   block curl open in the in-app browser; developers' and architects' press
   kits have the best images.
4. **Read every image at full size.** Per building: massing, storeys,
   materials and colours, window types and positions, pergolas, roofs,
   stairs, planting, parking, interiors (kitchen colours, floors, furniture
   models, lighting, textiles), terraces and their furniture.
5. **Note which building is which** (Ladonia: A and B share a plan, B has
   the pool; C differs). Build each, don't average them.
6. **Go round every building's surroundings** in every exterior and drone
   view — roads, lanes, kerbs, ground levels — not just the main street, and
   draw them on the site plan. Ladonia's refs 12 and 14 show a lane at
   street level beside C; C was built a metre up behind a wall until the
   user asked for it lowered.
7. When measuring from photos or plans, trace the whole element with its
   dark frames and borders, not just the clear glass.

## 2. Measure the plans

- Scale each floor image on its own, from things of known size, and
  cross-check two ways (a unit's net area against its pixel area, a door
  leaf 0.80–0.90, a WC 0.40 × 0.70). Don't assume the bed: Ladonia's
  Croatian plans draw 1.80 × 2.00 doubles in A and B but 1.4–1.5 × 1.9 in
  C, whose small squares either side of the head are nightstands, not part
  of the bed (an auditor read them as bed and got 1.85). Look at the crop
  yourself where two readings disagree. Scales there: A/B ground 28.3,
  first 40.6, roof 38.0; C ground 29.75, first 50.4 px/m (not the nominal
  50). Each sheet has its own: B's own ground sheet is 29.4. Origins and
  scales per sheet: `briefs.md`, shared context block.
- Overlay a pixel grid (sharp + SVG, `gridcrop.mjs`) and read wall lines off
  it; `scripts/plans/trace-walls.mjs <plan> <px/m> <out> --crop … --min 3`
  is a ruler only (it also traces wardrobes). Read windows from per-wall
  strips (each outside wall cropped, turned level, gridded at 2–3×). Record
  walls, openings and furniture in a measured JSON before writing the spec.
- The roof plan says what is on the roof terraces — model it, unless the
  renders disagree (renders win).
- Plans draw doors narrower than a walker fits (Ladonia's 0.55–0.85 m) and
  rooms tighter than their furniture: read them, then check §8.

## 3. Build the buildings as the spec's rooms, walls and roofs

The generator lives in `scripts/spaces/<project>/` — `kit.js` (a `Building`
in its own frame), one file per building design, `furnish.js`, and
`index.js` (site, gardens, landscape) — seeded by `scripts/seed-scenes.js`.
Signatures and numbers: `reference.md`.

- One building written once in local coordinates (its outer north-west
  corner at the origin, x east, z south — "north" is the plan's up; true
  north comes later with `sky.turn`), placed with `new Building(tag, [ox,
  oz, oy])`; a design built twice is one function called twice. kit places
  by translation only — no rotation, no mirroring: for buildings set at
  different angles add an opt-in rotation to your copy (turning furniture
  and stair yaws with it), or ask before squaring them up.
- `oy` puts a whole building at another level (Ladonia's C at the street's
  −1.0). kit's helpers already pass their heights through `Y()`: write
  building heights from its own floors (0, 3.0…). Anything written in site
  coordinates outside kit — landscape items, spawns, camera poses,
  plan-cut heights, hole-only floor openings — needs the level added by
  hand (`C_Y + 6.4`).
- `wall(name, a, b, { outside, … })` orients each wall so side A faces
  outside (without `outside`, side A is north or west); openings are given
  in the building's own plan coordinates along the wall's main axis, not as
  offsets from its start. Partitions end at the centreline of the wall they
  meet, not through it. After any wall change, look at each floor's plan
  cut (`__plans`): every room's walls should show its own finish on all four
  sides (a swapped `finish`/`back` is easy to miss in code).
- Partition heights come from the storey: `h = storey − 0.02` for walls
  thinner than 0.3 m (out of the floor above's plane), full height where
  the wall stands beside an open-air space (the 2 cm would be a slit).
  Rooms are `storey − 0.25` high.
- Room polygons on one level never overlap (L-shapes where one wraps
  another).
- Doors: at least 0.9 m (`kit.js` widens narrower ones where the wall has
  room); hinged doors open into the room they serve, never across a
  corridor or hall; small WCs' doors open outwards. A door squeezed between
  cross walls is narrower and says so (`door(…, { fit: true })`), or its
  lining runs out of the wall's end.
- Stairs: at least 0.9 m wide, ~2.1 m clear above the pitch line, a landing
  at least 1 m deep in line with the head or a side exit wider than 0.9 m
  (0.70 equals the walker), at least 1.1 m before the foot, no door onto a
  stairwell. Check the climb direction of any N/S flight (kit's mapping is
  inverted, see "Starting a new space"). A flight over a bathroom gets a
  low wall under it (to the steps' underside, 1.65 m in Ladonia) and
  full-height walls either side. The space under a flight is closed (a
  collider, or a cupboard: stair `closet`).
- Stairwells' rails: open at the head, closed on the other sides; the hole
  flush with the flight's strings; an edge along a wall sits 1 cm inside it.
- Reveals and wall ends in the façade's own colour (`render_khaki` for sand
  render, `render_peach` for ochre, `stone_trim` for stone), never
  `trim_white` on render; parapet tops a thin dark flashing; a loggia's
  underside a ceiling in the render's colour; a stone box a thin flush
  coping.
- Modern listings: `style: "slim"` windows and doors in the frame colour the
  renders show (Ladonia: `frame_bronze`), `blind` (0..1) lowered as the
  renders show, glass sliders, `door.flush`, stairs `style: "slab"`,
  `room.fitting: "recessed"` where the design has
  its own pendants or tracks, glass corners (the storey walls of one face
  run on to where the other face's glass stands; the bands above keep their
  square corner). Roof terraces stop at voids open to the sky.
- **Windows that open** (`World/Sash.js` `windowOpens`; `app-notes.md`,
  Windows that open). Only a slim window (`style: "slim"`) opens.
  - With a sill of 0.3 m or more (`OPENS_FROM_SILL`; Ladonia's `win()`) it
    turns in by itself, a sash a pane. Where its turn would meet anything
    on the room's side it tilts 10° instead. Glazing down to the floor
    stays fixed.
  - A kit-framed window (Wrenfield's, Ashgrove's) never opens, whatever
    `opens` asks: its frame and sash are one moulded ring, and the
    editor's *Opening* says "Fixed". A listing whose windows open needs
    slim windows.
  - `opens: { type: "turn" | "tilt" | "fixed", hinge }` on the window's
    opening (`{ ...win(…), opens: {…} }`: kit's helpers know nothing of
    it) makes a pane only tilt, or stay fixed, or open in a low window (a
    French window). A low window has no invisible "Window" pane behind
    it: its sash bars the way until it is turned, as a door's leaf does.
  - `hinge: "left"` is towards the wall's emitted start, as a door's swing
    is named, and `outside` turns it round: check it against the seeded
    wall's `start` and `end` (`checks/doors-dump.mjs` gives them for
    doors, not windows).
  - Whatever stands beside a window makes it tilt: a wardrobe, a
    headboard, a wall unit, a tap. Ladonia turns 41 of its 59 sashes and
    tilts 18. List the tilts after furnishing (§8).
- Photographed finishes in `shared/catalog.js` via `pbr(id)` with `tint`
  (linear, may brighten) or `color` (fetching textures: §6). Never retune a
  finish or generator default another space uses: add a space-specific
  finish (`oak_honey`) or an opt-in option (`soft: true`). A new room
  finish must match Sky.js's `ROOM` pattern: give it one of its prefixes
  (`limewash_`, `paint_`, `oak_`, …) rather than widening the regex, which
  is app-wide (§7).
- A new spec field may need the validator (`app-notes.md`).
- **Settle the site before furnishing**: each building's level (`oy`), the
  street and lanes (§1.6), the entrance flights or paths — seeded and
  walked. Getting a level wrong late moved all of Ladonia's C and its
  furniture.

## 4. Furnish every unit, as the plans and renders show it

1. **Read the furniture off the plans**: labelled grid crops of each floor
   mapped to the building's frame. Note each piece's extent, which wall its
   back is to, which way it faces (pillows = a bed's head; a sofa's back is
   its thick side).
2. **Check the catalogue first** (`public/models/furniture/catalog.json`)
   and reuse a piece that already matches the renders (joinery's `wc`,
   `shower`, `fridge`, `vanity-small`; Ladonia's `ld-` pieces). **Model the
   rest in Blender** in `blender/lib/<project>.py` after the renders: add it
   to the `from lib import …` line of `blender/export_furniture.py` and
   register each piece there as `("<prefix>-id", "Name", "category",
   lambda c, mats: XX.fn(c, mats), "wall"|"ceiling"?)` under a new id
   prefix (Ladonia's is `ld-`). Variants per length (kitchens 2.4–4.8 m,
   wardrobes 1.2–2.4 m), per handedness (kitchens: plain = tall units at
   their left, `-r` at their right; sofas `-chaise-l`/`-chaise-r`), per
   scheme. New finishes in `materials.library()`; `veneer` and `speckled`
   bake textures on export. `npm run furniture -- <prefix>` rebuilds only
   those (2–5 s a piece), then `npm run build`. Render thumbnails —
   `/Applications/Blender.app/Contents/MacOS/Blender --background --python
   <skill>/thumbs.py -- <scratch>/thumbs <id> <id> …` (Blender isn't on
   PATH) — and look at every piece: check articulated parts' signs (a chair
   back reclines away from the seat, a lamp's shade points at the work).
   - Fitted units have real fronts: carcass 21 mm short of the front, 19 mm
     doors and drawers with 3 mm gaps, handles out; a sink base has no top
     panel under the bowl. Build a run's sink, hob and ovens into the run.
     Since 2026-10-16 every front opens (`_fixed` is gone): hollow
     carcasses, white inside with their front edges in the carcass colour
     (`_board`, `_faced`), so a shut piece looks as it did; drawers on white
     trays (`_drawer`); doors swung a right angle about the outer corner of
     their face (`K_SWING`), hung away from what a run ends against (`walls`,
     `_hands`), pairs from the middle; a door with a pull swung
     `_pull_swing` short of that, so the pull never passes back over its
     hinge line; a wide low door a flap (`geometry.hinged(…, axis=(1, 0,
     0))`). The dishwasher, the ovens, blind corners, fillers and the hob
     cabinet's flaps stay shut. A kitchen's fridge is integrated: its first
     `"fridge_col"`, else a base `"fridge"` beside the sink, else
     `"fridge_drawers"`. Label every part for the prompt
     (`geometry.hinged/sliding(label=)`: door, drawer, fridge, freezer,
     wardrobe, closet, washing machine, dryer, detergent drawer, shower
     door, microwave).
   - A fridge's light is a `g.fixture("light", at, { "light": { power,
     color, reach } }, aim=…)` on its body, never on a moving part. It
     follows the doors labelled exactly "fridge" (a freezer's "freezer",
     a cupboard's "door", so that they leave it off), or every part where
     none is; one light to a piece (`app-notes.md`, Doors).
   - Sweep every part shut to open against its own piece's static parts
     (`models/sweep.py`) *and* against the scene's other placements and
     walls (`checks/part-sweep.py`) before exporting: a piece alone hides
     the nightstand 0.4 m before a wardrobe, the ceiling track before
     cupboards to the ceiling, the chair before a kitchen (`app-notes.md`,
     Blender). The other hand of a piece with a fridge or a spot is built
     by its builder's `hand=`, as the `-r` kitchens are, never by
     `ladonia.mirrored()` (§13).
   - Shut, a piece's parts are drawn with it, so it costs its materials,
     not its parts (§12). Give a part glass only where the real piece has
     it: glass on a part draws itself, two-sided, in two renders, wherever
     it is in view, behind walls too (Ladonia's portholes and shower
     doors: 48 draws a frame at A1's living room).
   - Wet pieces carry the water, control and steam anchors their taps and
     showers run from (`app-notes.md`, Blender, Water anchors; Running
     water and steam): a wet piece without them has no water, and a
     shower without a steam box no steam.
   - Never move a television's glass; after exporting a piece with one,
     `npm run screens -- --check`.
   - Re-exporting a placed piece (to make its fronts open, or any change):
     its catalogue entry stays byte for byte (`git diff
     public/models/furniture/catalog.json` empty), because furnish.js and
     the saved scene placed it by that `size`. Its shut look stays too:
     render it shut before and after with its textures flattened to their
     mean (`models/openview.py --open 0 --flat 1`; re-exports reshuffle
     them, `app-notes.md`, Blender) and compare (`models/imgdiff.py`).
     Ladonia's kitchens differed by ≤ 0.03 % of their pixels, its
     wardrobes by ≤ 0.5 %, on the joints only. Try an export into a
     scratch folder first (`models/export_scratch.py`).
   - What a visitor uses needs its data:
     - A new piece one sits on needs `npm run seats -- <id>`: a piece
       missing from `seats.json` is no seat, for the people or the
       visitor. A visitor sits only 0.3–0.62 m high (`SEAT_HEIGHT`: no
       bar stool).
     - Its catalogue id or name says how it is sat on. `lounge|daybed|club`
       is soft, and out of doors sat back in — but only where a loose
       pillow lies on it (`seats.json`'s `room` ≥ 0.5 m). `arm|lounge|club|
       desk` is a chair with arms, never sat on turned. A lone chair or
       stool may be turned, where that meets nothing.
     - A new television: its face an upright block of `tv_glass` (or
       `screen`) facing −z, at least 20 cm a side, then `npm run screens --
       <id>` to add it. `--check` (exit 1 when a screen moved, came or
       went) is for re-exports.
   - Curved fittings as lofted shells (`geometry.py` `rounded_rect` + `loft`,
     `sweep` + `catmull_rom` for taps and arms, `lathe`), not stacked boxes;
     parts that meet overlap 1–2 mm instead of sharing a face.
   - Wall-hung pieces get the `wall` anchor (the tuple's 5th element). Lamps
     carry a light tag (`app-notes.md`).
   - Small rooms need small fittings: `vanity-small` (0.62 × 0.43) for guest
     WCs and tight bathrooms.
   - Changing a shared joinery helper for one piece: pass it as a parameter
     and diff triangles per node before and after.
   - Poly Haven's CC0 furniture is too antique for modern listings — plants
     and vases only.
   - Soft furnishings (the user's sharpest complaint, 2026-10-03): every
     pillow and cushion stands on its bottom edge and leans *back* (a
     positive X rotation tips the top to −Y); one closed mesh per pillow
     with a lens profile that thins steadily to the seam — no separate
     flange plate, no flat plateau, no flat-clamped base; all edges smooth
     on a fine grid (a coarse grid with sharp edges renders as a patchwork
     of flat rectangles); stacked pillows touch the one behind, never pass
     through it; embroidered lines only where the render has them. Prove it
     with the orthographic side view and a measurement (thickness profile,
     split-normal share, vertices inside the neighbour: the model QA
     below), not by eye.
   - A bed's headboard is its own `wall` piece (felt panels hung at
     y + 0.55, centred on the head wall where the render does), so one bed
     serves every room; the bed's catalogue width includes the duvet's
     overhang, so space the drawers from the base (`BED_BASE` in
     `furnish.js`), not the catalogue width.
   - A piece over the app's collision budget (12000 triangles) collides as
     its box, which walls off floor it doesn't cover — the inside of an
     L-shaped sofa, where the plans put the coffee table. Give such pieces
     `{"collision": "mesh"}` (a dict at the end of the registration
     tuple becomes extra catalogue fields; `SceneBuilder` honours it).
     Since 2026-10-16 that is safe on a piece with parts that open too: it
     collides as itself without them and a box for each, shut, and only
     its body without them counts against the budget (`app-notes.md`,
     Furniture). Keep a fitted kitchen's body under 12,000 triangles, or
     its box walls off the floor inside an L's arms.
   - joinery's `vanity` and `vanity-small` are floating vanities whose
     export stands them on the floor: place them at y + 0.34.
   - **Model QA** for every new or changed piece, in three steps:
     1. Four-view sheets (`models/views.py`, `models/sheet.mjs`): look at
        the signs of articulated parts, the leans and any floating parts.
     2. Measurements (`models/lean.py`, `profile.py`, `facets.py`,
        `contacts.py`, `flatbase.py`, `coplanar.py`) on soft goods and on
        anything with cushions: beds, sofas, lounge and garden chairs.
        Ladonia's first two rounds checked only beds and sofas, and the
        final review found a lounge chair's cushions leaning forward
        23–28°.
     3. An in-app frame beside the listing render from the same camera
        (`models/pair.mjs`). Judge colours there: they read darker and more
        saturated in the app than on Blender sheets (felt, curtains,
        mustard fronts).

     `models/README.md` gives the readings that mean done.
3. **Place them in `furnish.js`** with helpers that take what the plan
   gives (`reference.md`): `against(b, id, wall, face, along)` places from
   the wall's *face* (centreline ± thickness/2), never the centreline or by
   eye; `kitchen`, `dining`, `roundSet`, `hang`, `bedSet`, and `mirrored()`
   for a flat that is another turned about an axis. Sizes come from
   `catalog.json`, so a piece is placed by its real depth. Handed pieces
   (the corner shower) are placed per flat.
4. **Every room** gets what its type needs — living (sofa, coffee table,
   rug, TV wall, dining set, pendant), kitchen with appliances, bedrooms
   (bed, wardrobe), bathrooms (shower or bath, basin, WC), laundry; every
   terrace (garden table and chairs, loungers, outdoor kitchen, pendant
   under the pergola); every roof terrace (dining under its pergola,
   loungers, parasol, outdoor kitchen); pool decks.
5. **…with floor to use each piece** (§8): a WC 0.6 m before it, a basin
   and a shower's door 0.7, a wardrobe 0.8, a bed's sides 0.6, a 0.7 m way
   from the door to each, tables 0.75 off walls with doors in them, about
   1 m before a kitchen. In a 1.2–1.5 m room put the fittings in one row
   along a wall and keep the other side clear (two fittings facing each
   other leave nothing between). Beds against inside walls, not across
   windows; nothing fitted across glazing; showers 1 cm off their walls; a
   towel rail or basin never in a door's way. Nothing in a part's way
   either: a door or drawer opens only until it meets something
   (`Openable.plan`), so a chair, nightstand or WC inside its swing reads
   as a broken door. Ladonia's placements left 32 of 475 parts stopping
   short (`app-notes.md`, Doors):
   - keep a dining chair's back further from a cupboard's or an
     under-counter fridge's front than the door is wide;
   - keep the 0.8 m before a wardrobe clear: nightstands go beside its
     doors, not in front;
   - hang a ceiling track's spots further from cupboards to the ceiling
     than their doors are wide (A1's 1.12 m doors: 1.15 m; wall units:
     0.6 m);
   - keep a vanity's drawers clear of the WC beside it, and garden chairs
     clear of an outdoor kitchen's doors.

   Never scale a piece that has parts (a placement `scale` other than 1):
   its drawers slide scale × distance in the editor and distance in a
   public view.

Facing: a catalogue piece faces north (−z) at rotation 0 when modelled with
its front to Blender +Y (loose.py, ladonia.py); joinery.py's `wc`,
`washing-machine`, `wardrobe`, `nightstand`, `fridge`, `kitchen-run` and
`microwave` face south at 0 (`SOUTHWARD`); the corner `shower` has its
walls west and south and its door north at 0. `FACE = { N: 0, W: 90, S:
180, E: -90 }`.

People on the furniture are §4b, after §9: placed last, on the pieces as
they finally stand.

## 5. The landscape

`spec.landscape` (`shared/landscape.js`, schema in `reference.md`) replaces
the Fluffy Tree garden: terrain, dry-stone walls, kerbs, markings,
pergolas, corten planters, glass railings, pools, hedges, lawns, trees,
forest and shrub scatter, meadows, lights, sky. Built by
`World/Builders/LandscapeBuilder.js` (static, part of the house) and
`World/Flora/` (live). Switch the default garden off explicitly, each key
as its own object: `garden: { hills: { enabled: false }, tufts: { enabled:
false }, trees: { enabled: false }, blades: { enabled: false },
neighbourhood: { enabled: false } }`.

- A path or paving slab is a collidable floor sheet: it stops at the top
  step of a flight, or it is a lid the walker hits ("a piece of the entrance
  over the steps"). Landscape walls run on half their thickness past their
  ends: end them inside what they meet (a flight's cheeks). Steps are solid
  and fill their opening (2.58 m in a 2.6 m hole).
- Terrain sits 3–5 cm under paving (pads −0.03 / −0.05); holes under
  flights and pools. A level change between plots is a hard pad plus a wall
  (`rw-ac`).
- A pool one swims in needs a way in and out: `steps` (`reference.md`,
  pools) on the side by the loungers — treads of the pool's mosaic walked
  on an unseen ramp, as a flight is. A scene seeded before them is given
  them with `patch-pool-steps.mjs`, never a reseed.
- Pergola louvres stay about half open — the builder draws aluminium blades
  at 0.17 pitch tilted 0.72 rad, timber slats (`louvres: "timber"`,
  Ladonia's) at 0.22 pitch tilted 0.95 rad: nearly shut blades lose the
  stripe shadows that sign a terrace render.
- Hedges: each spray red or green by `red` (never a lerp, which reads
  brown); `red: 0` is a green laurel. Photinia only where the renders show
  it. Trees in roof planters need `elevation`.
- Roads: stop a side road's lines short of the main road (Ladonia's lane:
  0.4 m) and dashes short of junctions so they don't overlap; split kerbs
  at a lane's mouth; terrain pads must cover a road's full length.
- Grass: a mown lawn is a turf tile plus shell layers near the visitor, not
  more blades, and no mowing stripes (the user had them removed). When the
  user names a reference (fluffytree-threejs), copy it exactly — measure its
  own assets and densities instead of improving them.

## 6. Assets

Whose licence, and where each asset is listed: the standing terms at the
top. Textures and skies are CC0; the cars are CC-BY-NC/-SA; the people are
Mixamo's, to use but not to pass on. Large originals go in `assets/`,
never `public/` (deployed).

- Textures and skies: Poly Haven (`api.polyhaven.com/assets?t=textures`,
  thumbnails `cdn.polyhaven.com/asset_img/thumbs/<id>.png?width=200`; files
  `api.polyhaven.com/files/<id>`; urllib needs a User-Agent) and ambientCG
  (`ambientcg.com/get?file=<id>_2K-JPG.zip`). To add one: put its id in
  `TEXTURES` (Poly Haven), `AMBIENTCG` or `SKIES` in
  `scripts/fetch-site-assets.mjs`, run `npm run site-assets` (fetched and
  WebP-converted into `public/textures/pbr/<id>/`), add its finish in
  `shared/catalog.js` with `pbr(id)` and a `tint`, list it in
  `assets/THIRD_PARTY.md`, `npm run build` and restart the test server.
  Choose from a thumbnail montage; measure a texture's mean colour
  (`sharp(f).stats()`) before tinting. Tints that matched Ladonia are in `shared/catalog.js`
  (sand render, ochre render, ledgestone, dry stone, corten — corten needs
  blue boosted, its texture's mean is (98, 58, 31)).
- Skies that worked: day `kloofendal_48d_partly_cloudy_puresky`, dusk
  `qwantani_dusk_2_puresky`.
- Trees: ez-tree (`scripts/trees/`, grown in the browser, packed by
  `npm run trees`). Big scanned plants are millions of triangles: no.
- Prefer greener grass textures (ambientCG Grass001/004).
- Furniture, fittings: Blender (§4). Cars: `app-notes.md`. People: Mixamo
  characters and clips, through the user's sign-in (§4b); what they hold
  is built in Blender (`blender/lib/props.py`).

## 7. Light and look

- **Decide the sun once**, before the first critic round: tally which faces
  are lit in every exterior reference, set `sky.turn` and `sky.elevation`,
  and keep them. Exterior renders outvote interior ones. Ladonia: turn 19,
  elevation 36 (east-south-east, ~105°), after six flips between single
  critics. Measure the real direction from `sun.position − sun.target`.
- **A space sets only** `landscape.sky` (`day`, `dusk`, `turn`,
  `elevation`) and, if it needs them, `garden.colour.toneMapping` and
  `exposure`. **The rest is app-wide and already set** — don't retune it
  for one space; change it only as a proposal to the user, comparing the
  other spaces before and after (§10). The values that matched Ladonia's
  renders (Sky.js `VARIANTS`, `INDOOR`, `GLASS_*`; Realism.js):
  day exposure 1.3, `outdoor` 0.3 of the sky's light (shaded faces 2.3–3.3×
  darker than sunlit ones), rooms a warmer, greyer indoor share (`INDOOR`
  0.8, the furniture's finishes included — re-applied once furniture and
  batches exist), indoor exposure 2.2 (`INDOOR_EXPOSURE`), dusk outdoor a
  third; windows dark outside by day (`GLASS_OUTSIDE` #4b545a at 0.78) and
  near clear inside (`GLASS_INSIDE` #eef2f2 at 0.12); the per-room light
  probe from slider step 3 up. Interiors at night glow from their own
  surfaces (`Sky.glowIndoors`), not unshadowed point lights — and where
  the light fittings are switched live (the editor's realistic preview, an
  unbaked publish), room by room as their switches are (`RoomGlow`,
  app-notes.md, Lights and fittings), with a few live lights nearest the
  visitor.
- **All of this is the look lit live**: the editor's realistic preview
  (**P**; an editor tab opens under a plain working light instead, §10) and
  a version published unbaked. A baked view takes its light from the bake
  and its exposure from a meter that reads the frame (§10b; `app-notes.md`,
  Exposure in a baked view): never judge one at a fixed exposure, and say
  of every frame which of the three it is — plain, lit live, or baked and
  in which mode.
- **What a visitor of a published view can switch to is judged against
  the baked frame**, not against the editor (2026-10-15). With **K** the
  rooms round the visitor keep their true materials and take the bake's
  own light, only the sun and the nearest lamps live
  (`World/RoomBakeLight.js`; `app-notes.md`, Live room light). Compare
  them with the baked frame of the same pose by the room's own pixels (a
  mask of where each pixel's nearest surface is): mean, warmth ((R − B) /
  sum, G − B) and shade. A change asked of the published view leaves the
  editor and the unbaked publish as they were, byte for byte: show it.
- **No refractive glass anywhere** (`transmission`): one pane in view
  darkens the whole frame through the post-processing — a shower's glass
  door left a bathroom near black and every room 15–40 % darker. Glass
  trims default to `transmission: 0`; furniture and cars get plain
  see-through glass on load (`Utils/reflections.js` `plainGlass`). Pool
  water is clear without transmission (since wave C, 2026-10-16;
  `app-notes.md`, The pool's water). A first pass multiplies what is under
  it by a turquoise that deepens with the path through the water, worked
  out from the pool's box and steps (no depth read). Then a surface whose
  alpha is its Fresnel reflectance, its roughness kept over 0.1. An
  opacity hides the steps: 0.78 did.
- A balustrade's glass must not match Sky.js's `GLASS` (`/^glass_solar/`),
  or it reads as a dark panel; a new room finish must match `ROOM`, or its
  rooms take the full outdoor sky.
- A room is "indoors" (and exposed for it) by the camera, or by the
  player's feet when the third-person camera has clipped into a wall;
  open-air slabs (`ceiling_finish: "none"`) are not.
- **Measure, don't judge by eye.** Mean luminance (0.2126R + 0.7152G +
  0.0722B, without the 16 px label bar) from each living-room spawn: place
  the player (`player.placeAt(spawn)`), step the world a few times and
  render once (`app-notes.md`, The browser pane — not by
  `experience.update()`, which in an editor tab at rest is a frame in
  which no time passes), in an editor tab with the realistic
  preview on (`await __K.realistic()`: under the plain light every room
  reads the same, day and night). Keep the slider step and tone mapping
  fixed while comparing. Ladonia's living rooms read 128–186, bedrooms and baths 107–177, after
  the glass fix (73–122 before). Diagnose by elimination: change one thing
  at a time (env intensity, sun, lights, emissives, post) and sample a fixed
  patch. three r163: `scene.environmentIntensity` scales the sky's light;
  `envMapIntensity` alone does nothing.

## 8. Make it walkable

The walking character is a capsule 0.7 m wide and 1.9 m tall. It climbs
invisible ramp colliders with no step-up (treads don't collide); furniture
collides as its mesh up to `SceneBuilder.MESH_COLLISION_BUDGET` (12000
triangles) and as its box when it has more — a piece with parts that
open as its body without them and a box for each part, shut, a shower's
door barring the way itself until opened (`checks/_modes.mjs` says which;
the catalogue's `collision` overrides).
Ladonia's beds, 14–24k with their pillows, collide as boxes, which works
because the headboard is its own piece. Rugs (under 3.5 cm) don't
collide; a shut door is an oriented box, an open one (0.3 open or more)
nothing. Floors are zero-thickness sheets in the static octree.

- **Walk it, don't eyeball it.** After every seed and every furnishing
  change:
  1. `checks/` in node: `furniture-check.mjs` (A/B: reach from the
     entrance, door zones, clearances, covered windows), `furniture-check-c.mjs`
     (C), `stairs-check.mjs` (every flight and named route; exit 1 on
     blockers), `entrance-check.mjs` (the street flights), `c-grade.mjs`.
     As shipped these audit Ladonia — on a new space they can look like a
     pass while checking nothing of yours: use your own copies
     (`checks/README.md`) and see your building ids in their output. They
     collide a piece as `SceneBuilder.collisionOf` does (since
     2026-10-17), so an ACCESS at a walk-in shower behind its shut glass
     door (Ladonia's c-f071) is a note, not a fault.
  2. `walk.js` in the page: `__walk.doors()` — every door both ways from
     free standing spots (only a door opening straight onto a flight
     should report `noSpot`) — and `__walk.to()` along each route from the
     street to every roof. Ladonia: 84 of 85 doors (C's service slot has
     no standing room behind its door) and every route pass.
  3. Sweep every hinged leaf from shut to full open against the furniture
     and the other leaves (`checks/door-swing.mjs --mesh`). Door.js opens
     a leaf to 0.52π (93.6°), not 90°. Ladonia's first review measured at
     90° and passed leaves that, fully open, stood up to 3.4 cm inside a
     washer, a WC and wardrobes. It also missed two leaves that crossed.
     They were re-hung, narrowed with `fit` or moved 2–3 cm. In the page,
     audit a leaf through its arc (`app-notes.md` has the stepping trick)
     and confirm bounding-box hits with rays before acting on them.
  4. Check every door's hand against the plan from the generator's
     emitted wall (start, end, side A) and the hinge point it gives
     (`checks/doors-dump.mjs`), never from the swing name: a wall flipped
     by `outside` turns `_left` and `_right` round, and a review found
     eight Ladonia doors hinged on the wrong jamb that way.
  5. Check where each leaf stands when left open. Doors stay open until
     toggled, and an open leaf doesn't collide (`Door.getBlockers` is
     empty past 0.3 open). The walker passes through it and no checker
     sees it, but in the real flat a leaf parked across the only way from
     a lobby to a stair is a wall. Ladonia's C first-floor front doors,
     hung as drawn, left 0.21 m beside the open leaf. The north flat's now
     opens onto the landing (declared). The south flat's stays as drawn,
     because on the landing it would cross the common stair's side exit.
  6. **Look at what collides, and press what can be pressed.** **C**
     (Shift C to see through everything; in a public view, `?debug`)
     draws every collider in its kind's colour (`app-notes.md`, The
     colliders drawn). Walk the rooms with it on after each furnishing
     pass, looking for:
     - a piece colliding as its box where its mesh was meant;
     - a stairwell's blocker missing;
     - a leaf or a shower's door barring a way.

     Then run `act.js`'s spots for the space's own doors, drawers, a
     switch on each floor and the car (E, F, Q), in the editor and a
     public view, against the base build. What a new space needs for them:
     - **Q**: a switch in every indoor room (Fittings gives each its
       ceiling light). In a public view only lamps in the bake switch:
       Ladonia's terrace lamps are not, so Q there has nothing.
     - **E with nothing aimed at** opens the nearest door whose foot (its
       wall's base) is at most 0.85 m under the visitor's feet and not
       above their head (`doorOnFloor`, `DOOR_BELOW` 2.4 m under the eye):
       hang each door in a wall that starts on its own floor.
     - **Driving from above** needs a car and a terrain or ground plane
       (`shared/drive.js` `driveBounds`). Without them the view keeps to
       the floor's rooms ± 1.5 m (`BirdView.withinReach`), and a car driven
       off that leaves the frame. Publish after it, so that
       `driveViewpoints` samples the view from out there.
  7. **The furniture's parts and the windows** (`openables.js`, after
     act.js):
     - list every part that stops short and what stopped it
       (`__openables.stops()`);
     - press E on one part of each catalogue kind and label, and on every
       part after a furnishing change (`everyE()`);
     - `walkIn` at an L or U kitchen's parts, `freeSpots` between its arms,
       and `sameTriangles()`: the editor's tree must be what a publish
       collides;
     - every sash's plan (turn or tilt, and what is in its way) and E on
       each (`sashes()`).

     On a new space each stop and each tilt is a placement to move, unless
     the plans put it there (§4.5). Ladonia: 32 stops and 18 tilts; 74 of
     74 kinds and 475 of 475 parts open and shut with E; 59 of 59 sashes;
     6 and 23 free spots in its L and U; 971,018 triangles each way.
  8. **Use it as a visitor does**, with both avatars
     (`.avatar-option[data-avatar="male"]`, then `"female"`, a fresh page
     each; `window.__pickSkin` with boot.js), in the editor and the public
     view. First `await P.avatar.wear(experience)`, `await
     w.seats.dress(P.avatar)` and `await w.seats.catalogue()`
     (`__sit.ready()` does all three), or the first E only queues the
     sit. Then:
     - sit at a seat of each kind and get up (`sit.js`): a dining chair at
       its table, a sofa's middle place behind its coffee table, a pouf,
       an outdoor lounge chair, a chaise's deep end; from above too;
     - switch every television, and sit before one (`tv.js`);
     - swim into each wall of every pool, up its steps, and out at each
       side (`pool.js`, `swim-checks.js`);
     - open every kind of part (`openables.js`) and run every tap
       (`water.js`).

     Sweep every seat for limbs more than 2.5 cm into anything but the
     seat's own piece (`seat-sweep.js`, `seat-sweep.py`). Take the starts
     (`makeStarts`) and, for a public view, the editor's boxes
     (`takeBoxes`) once, and use them for every build compared; take them
     again after the furniture moves. Read the
     result against Ladonia's: 214 seats a run; the seated pose meets
     something at 124–149 of them (every tucked-in dining chair:
     accepted); the walks meet something at 85–111 (`app-notes.md`,
     Sitting).
  9. **Run and jump at every upstairs window with a sill** (`jump.js`,
     `__jump.all()`), in the editor and a public view. No run may end
     outside the building or a floor up, and no frame may rise more than
     climbing onto furniture does (Ladonia 0.53 m). three's capsule
     resolve pushes a head that crosses a one-sided ceiling up through the
     slab, and shoves it out over a sill. Player holds it under (`from`,
     `headroom`: `app-notes.md`, Rays and the collision trees). Before
     that fix Ladonia let the visitor out at 24 of its 32 such windows.
- **Spawns on free floor** (`__walk.free`); move them after any furniture
  change. A spawn camera inside a TV or wardrobe gives a one-colour frame
  and a false "too dark". Give each building a ground-level spawn just
  inside its front door labelled "<Building> — entrance": the furniture
  checker floods its reach from spawns whose label says "entrance".
- **Placement audit** after every furnishing pass: pieces poking into
  walls; pieces floating more than ~3 cm over their floor (pictures,
  mirrors, TVs excepted); pieces in no room (stray on the lawn); pieces
  meant against a wall standing 0.05–0.8 m off it.
- What the walk found in Ladonia, and the fix: 70 plan doors under 0.9 m
  (widened); a corridor 0.63 m (the core moved 0.3 m); bathrooms whose WC,
  basin and shower left no floor (made deeper, re-laid in a row, a hand
  basin); a dining table 0.57 m from a door wall; a stair under a door's
  2.74 m head; flights rubbing their walls (0.95 → 0.9 m wide); bathrooms
  open under the stairs (low walls).

## 9. No flicker (z-fighting)

Depth precision: two surfaces `gap` apart fight beyond d ≈ √(gap · near ·
2²⁴). With the camera's near plane at 0.05 (not 0.01), 1 mm fights from
29 m and 1 cm from 92 m — so a centimetre apart is enough indoors.

- **Layer what shares a plane** (`layer(material, FRONT)` or
  `layer(material, BEHIND)`, named exports of
  `World/Builders/MaterialLibrary.js`): frames and glass in front (by name,
  `getTrim`); door linings in front (`getTrimFront`); walls' ends, tops and reveals, thresholds,
  risers and soffits behind (`getTrimBehind`); terrain behind paving; road
  paint in front; floors none (a rug 1 cm over a floor-in-front reads under
  it); in furniture, screens, glass, hobs and handles in front and grooves,
  gaps and plinths behind (`FurnitureLibrary` `layerFlushFaces`). Never
  layer a whole kind behind by default: a trim used as a decal (road paint,
  a neighbour's window, skirting) then sinks into its surface at a
  distance. The runtime file and the baked view's own materials carry the
  layering (`userData.polygonOffset`).
- **Fix real overlaps geometrically**: partitions 2 cm under the floor
  above; walls ending at the centreline of the wall they meet; stairwell
  edges 1 cm inside the wall beside them (their linings are drawn in the
  wall's face otherwise); showers 1 cm off their walls; paving short of
  glazing sills; planters short of parapets; landscape walls meeting at
  corners without overlapping; joinery parts overlapping 1–2 mm.
- **Find it**: `checks/zfight-check.mjs` (static, models the layering by
  hand) and `zfight.js` in the page (reads the real offsets; ~10 s over
  1.2M triangles). Ladonia: 1502 clusters → 214, the rest hidden faces
  (furniture undersides, kitchen backs against walls). Identify any odd
  patch by casting a ray through its pixel and reading the object's name.

## 4b. People

Animated people set round a property: standing in twos and threes with a
drink, sitting on sofas and chairs, lying on the pool loungers. Do them
once the furniture is settled and walked (§4, §8) and the light is set
(§7), before the final review: they sit on the furniture as it stands, and
a reseed drops them. The data — entry fields, seats.json, the index, the
planner's constants, the scripts — is `reference.md`, People; how the app
draws them, and what is still short, is `app-notes.md`, People.

1. **Ask first**, with options. The user's answers for Ladonia stand until
   they say otherwise: the source and its licence — Mixamo downloads;
   random on every load, or generated once, saved in the scene and
   editable — saved and editable; in published views, or only in the
   editor — published, behind a People toggle; which spaces — only those
   they name (Ladonia).
2. **Get the assets through the user's own sign-in.** Mixamo needs an
   Adobe account. Open mixamo.com in the browser pane, let the user sign
   in there, and have them confirm the download list once — source,
   counts, sizes (Ladonia: 12 characters, 0.6 GB; 17 clips, 15 MB) —
   before you fetch anything. `app-notes.md`, The browser pane, has the
   rules and the site's dialog values; `mixamo.js` and `mixamo-fetch.sh`
   do the driving. Characters as FBX Binary, T-pose, with skin. Clips as
   FBX Binary, without skin, 30 fps, no keyframe reduction, all with one
   character selected, each file named after its clip ("Sitting
   Talking.fbx": the pose is read from the name). They go in
   `assets/people/characters/` and `assets/people/animations/`,
   git-ignored.

   The visitor's own clips go in `assets/people/avatar/`, never
   `animations/`, where the people's pipeline would take them for the
   people's (its `settle` cut "Stand To Sit", a sitting clip by its name,
   to half a second). Six were downloaded on 2026-10-16, 3.5 MB, once the
   user had signed in; confirm the list with them first, as for the rest.
   Take them as FBX Binary, without skin, 30 fps, all on one character,
   each file named after what it is played as (the tile, then its
   description):
   - "Swimming" (Swimming: Swimming Underwater);
   - "Breaststroke" (Swimming To Edge);
   - "Treading Water" (Treading Water: Floating);
   - "Climbing" (Climbing: Pulling Up To A Ledge);
   - "Stand To Sit" and "Sit To Stand".

   *In Place* is a checkbox in the clip's panel, beside Mirror, not in the
   Download dialog (`__mixamo.inPlace`). Tick it on a loop alone: only
   Swimming Underwater has one. The climb and the two transitions keep
   their travel, which the app follows. The pipeline prints each clip's
   travel as downloaded and warns of none — its "NOT In Place" check is
   never reached for a clip it knows (`import_people.py`): read the
   travel. Mixamo has no front crawl. `npm run people -- --avatar-clips`
   packs them (git-ignored, as the rest): it cuts a travelling stroke to a
   loop held in place and swum heads-up, and keeps a climb's travel
   (`reference.md`, The npm scripts; `app-notes.md`, People).
3. **Choose** characters by thumbnail: everyday and summer clothes, as
   many women as men, no uniforms, kits or costumes (Ladonia's shannon
   came in a football strip). Mixamo has no swimwear:
   tell the user those on the loungers will be dressed. Clips by what
   they are for (Ladonia's 17 and what each measured: `reference.md`):
   - standing: one that drinks — only clips of drinking were recorded
     holding anything — two or three that talk, and listeners (agreeing,
     laughing, idling): a group is one of each;
   - sitting: each is made for one seat height (0.34–0.44 m), so take
     five or six, most of them with both feet flat before the seat (a
     tucked foot goes into a sofa's base);
   - lying: on the back, arms by the sides or behind the head. One
     propped up of itself is no use on a lounger with a raised back.
4. **Convert and measure**: add each new character to `SEXES` in
   `blender/import_people.py`, then `npm run props` (once, and when a
   prop is new), `npm run people`, `npm run seats`, `npm run build`. Read
   `index.json`: every character has `sex`, `eyes` and `sits`, every clip
   the `pose` and `hand` you expect. Credit the characters and clips in
   `assets/THIRD_PARTY.md` and the README, and ask whether the converted
   files in `public/models/people/` are to be committed (the standing
   terms).
5. **Plan many seeds, writing nothing.** `node
   <skill>/checks/people-plans.mjs <id> --seeds 20` must end "No
   problems": it holds every plan to the planner's own rules and says
   nothing of how one looks. Then `npm run people:place -- <id> --seed n
   --out <scratch>/plans/plan-n.json --png <scratch>/plans/plan-n.png`
   for a dozen seeds. Read each listing and picture: a group by the pool,
   the loungers taken, someone on an outdoor sofa, someone indoors, a
   group on a roof, and who the first 4 and 8 drawn are (§12).
6. **Audit by skin, in the app.** On the test server (§0), in the
   editor's page, with harness.js and `people-audit.js`: for each
   candidate `await __people.load(<the plan's JSON>)`, then start
   `__people.audit()`, poll `__people.run` and read `__people.last`. It
   poses each person through their clip as the app finishes them and
   measures their skin against the real meshes, never bones alone or the
   index's numbers. Its tolerances (`__people.TOL`) are those Ladonia's
   checker passed and failed by: soles within 2 cm of the floor; seated
   skin −4 to +1.5 cm on the seat (a sofa gives 3); lying, hips, back and
   head −3.5 to +3 cm on the lounger, heels within 3 (which every lounger
   fails today: `app-notes.md`, People, Still short); no skin more than
   1 cm inside furniture, a wall, a rail, a hedge's core or a planter's
   grasses; a drink within 16° of upright while its hand is 35 cm or more
   from the mouth, tipped only at the lips and never 2 cm under the
   face's skin; standing, 0.38 m clear of everything (the planner's 0.4,
   less rounding) and facing the group within 25°. It does not see lawn
   or meadow grass, a hedge's leaves or anything the wind moves: look in
   the frames.
7. **Pick the cleanest plan and edit it by hand** with
   `__people.patch({ "<id>": { … } })`: swap two characters (a head that
   floats on one body rests on another's), change a clip or a drink,
   move someone a decimetre or two. Audit again after the last edit, and
   keep what `patch` returns, the list of people, as the plan file.
   Ladonia: twelve seeds audited, seed 12 taken, four people edited and
   audited clean. Two were then moved again unaudited, and one of them
   has an arm in a planter's grass (`app-notes.md`, People, Still short).
8. **Take the frames and look at every one**: `__people.lineup()` (every
   character: all there, opaque, matt, haired, of a size),
   `__people.shots(prefix)` and again with `{ sip: true }`, then each
   gathering wide by day and by night, and the site from above — the
   gatherings with the realistic preview on (`await __K.realistic()`: an
   editor tab's plain light is the same by day and at night). A tab
   never shown saves blurs until it is given a size (`app-notes.md`, The
   browser pane).
9. **Write the plan** once the audit and the frames pass. Back up the
   scene and check its md5 against the last backup (§0), then write the
   plan file through `validateScene` and `writeScene` (`reference.md`
   has the command; `npm run people:place -- <id> --seed n` writes an
   unedited seed). Diff the scene against the backup: only `people` has
   changed. Load it: everyone built, no failed shader programs, no 4xx.
10. **Tell the user** to restart `npm start` if it has run since before
    the validator kept `people` (2026-10-06), or their next editor save
    drops them, and to reload open tabs; to publish again to see them in
    `/view/<id>`, where they are never baked and sit behind the People
    toggle; that the editor moves, adds, deletes and re-rolls them, and a
    re-roll replaces the vetted plan; that a reseed drops them, and the
    same seed is not the same plan once the furniture or the planner has
    changed — the scene holds the only copy, so copy `people` out before
    a reseed and check each `seat.furniture` after it; and what is still
    short.

## 10. Verify like a photographer

With the test server and sink up (§0), load `harness.js` and the project's
views file in the page, and render the same views as the references side by
side with them. Compare honestly: massing, colours, window rhythm,
planting, furniture. Check day and night, the public view (`/view/<id>?live`
for current work — plain `/view/<id>` is the last publish), the walkthrough
(`/?scene=<id>`) and the editor.

- **An editor tab does not open as a visitor sees it.** `/?scene=<id>`
  opens under the editor's plain light — no sun, shadows, lamps, room glow
  or post-processing, the same by day and at night — with the houses alone
  drawn: no garden, cars, far ground or sky, the garden not even made. The
  user's editor is to be fast to work in (§12). Reference frames, light
  levels and nights need the realistic preview — `?preview=1` in the link,
  or `await __K.realistic()`, which `__renderSet` and `__K.render` call
  themselves — and anything that only needs the surroundings needs the
  scope (`?scope=all`, `__K.scope("all")`; `app-notes.md`, The editor's
  plain light and view scope). Check both: the plain view is what the user
  works in, the preview what they publish.
- **Nor does it draw the scene's own meshes, or every frame** (since
  2026-10-13). Under the plain light the house and the furniture are
  drawn by stand-ins — merged and instanced copies under the scene's
  "stand-ins" group — while the real walls and pieces stay in the scene,
  `visible`, on a layer no camera draws; and a tab at rest draws a frame
  only when something has changed. The skill's own helpers allow for
  both. One of your own must too: walking `experience.scene`, pass over
  `userData.standIn` or every surface is there twice; a Raycaster needs
  `layers.enable(12)` or it passes through the house; a mesh hidden or
  re-dressed by hand inside a wall or a piece needs
  `world.standIns.hear()` before the next still (it is otherwise in the
  picture for up to 16 frames more); something added inside a piece or a
  wall below its root's own children (a test's marker) is not drawn at all
  until the stand-ins look that unit through again — four units a frame,
  on Ladonia about 320 frames — so hang it on the root, or in a group of
  your own in the scene (`StandIns.drawnScene`, since wave C); whatever
  moves under a held unit works out its own world matrix; whatever waits on the app's own
  frames needs `experience.pace.set("always")` first, `set(null)` after;
  and a tool that reads the collision after an edit, `sceneBuilder
  .settleCollision()` (`app-notes.md`: The editor's plain light and view
  scope, Rays and the collision trees, When the editor draws). The
  realistic preview draws the scene as built, every frame.
- **Calibrate each reference's pose before critics see anything**: find on
  the plan which building, terrace or room it shows, render ~4 candidate
  poses in one sheet at the reference's aspect, pick by features (which way
  a stair climbs, which corner a recess is on). Keep poses in the
  project's views file (its `__POSES`), never typed straight into the page,
  where a reload loses them. Check each pose against walls *and* furniture;
  looking along (fx, fz), screen-right is (−fz, fx). For exact poses, solve
  the reference's camera from 8–10 known points (building corners, window
  heads).
- **The pane**: hidden, it has no requestAnimationFrame: step the world
  and render by hand, or drive the app's own frames (`drive.js`).
  `experience.update()` by hand no longer starts a second loop, but in an
  editor tab at rest it is a frame in which no time passes
  (`app-notes.md`, The browser pane). `javascript_tool` stops at 45 s —
  render 3–4 views per call. Camera rigs reset the pose every frame: step
  the world, then pose, then render once.
- **Other spaces**: check them against the committed code, not by eye — run
  HEAD in a scratch worktree (`git worktree add --detach`, `node_modules`
  symlinked, its own server on another port, the same publish folder) and
  compare the same view. That is how Wrenfield's black published lawn was
  found. Frame times are compared the same way: the committed build — or
  a copy of the build the user's server still has (§0) — against yours, a
  tab each, taking turns under a baton (§12).
- **Review the code you changed**: after renderer or generator changes, an
  adversarial review workflow (one reviewer per area, one skeptic per
  finding). Ladonia's walkability round: 5 real bugs confirmed (layering
  lost in the baked view, BEHIND sinking decals, glass draw order, gaps
  round the new low walls).

## 11. Review loop: builders and blind critics

When the user asks for an exact match, work in rounds:

1. Render every reference view (`__renderSet`) and the plan cuts
   (`__plans`), and make blind pairs (`prep_review.mjs`).
2. One fresh critic agent per part (each building's exterior, each interior
   scheme, the bedroom, the terrace, each building's blueprint fidelity), as
   a Workflow with a JSON schema, under 10 agents a wave (if a wave's output
   won't parse, read the `type: "result"` lines of
   `subagents/workflows/<id>/journal.jsonl`; relaunch any critic that died
   at a usage limit). Brief: the part, the X/Y pairs without saying which
   is ours, the camera only roughly matched (separate framing from model),
   the 16 px label bar not part of the scene. Ask for the target's id, a 0–10 score and a top-10 list of
   gaps tagged `[LIGHTING-RENDER] [ARCHITECTURE] [MATERIAL-COLOUR]
   [FURNITURE-ASSET] [ACCESSORY] [PLANTING] [LANDSCAPE]`, `[CAMERA]` last,
   each with measured hexes, sizes, counts and a fix. Scores of 2–5 are
   normal; the ranked gaps are what matter. Critics never edit files.
3. For a big correction against the plans and renders, run the round the
   way Ladonia's interiors round ran. Brief every agent from `briefs.md`.
   1. **Audit**, read-only: one auditor per floor and one per topic
      (bedrooms, living, models). Each makes its own gridded plan crops and
      writes findings with ids (`A0-3`) to `<scratch>/<round>/audit/`. An
      auditor may also write a re-runnable checker (now in `checks/`) or a
      verified patch; apply patches yourself, one at a time (§0).
   2. **Decide** what the audits leave open. Where two disagree, crop the
      plan yourself. Fix each new piece's id, size and hand.
   3. **Build in copies**, made with `copy-merge.sh blender-copy` and
      `gen-copy`; the checkers' `--gen`/`--src` flags check a generator
      copy. Blender builders go first, then placement builders, given the
      new pieces' sizes. Use builders only where work is independent, and
      give each its own regions and anchor lines so the merges are clean.
      The renderer and app code stay with you.
   4. **Merge** with `copy-merge.sh merge-blender` and `merge-gen`. Then
      run `npm run furniture -- <prefix>` once (only it writes the real
      catalogue) and `npm run build`. Back up, diff against the scene and
      reseed (§0).
   5. **Walk and look**: the checkers and `__walk.doors()` (§8), the
      references rendered and paired with the listing (`models/pair.mjs`),
      and the plan cuts (`__plans`).
   6. **Independent review** by agents who didn't build: one per floor
      (the generated footprints over gridded plan crops) and one on the
      models (pairs, sheets, `models/` measurements). Tell them the
      declared deviations.
   7. **Fix round** on what they verified, in fresh copies under a new
      scratch folder (`copy-merge.sh` refuses a base the merge has made
      stale). Merge, reseed and walk again.
   8. **Final review**: visual, floors and integrity (`briefs.md` (f)).
      Integrity means the generator's output through validateScene equals
      the scene file with 0 notes, catalogue ids and GLBs exist, rooms
      don't overlap, finishes exist, nothing is changed out of scope, and
      checker artefacts are verified. Fix what it finds yourself and
      re-run every check.

   Ladonia's interiors round had 9 auditors (187 findings), 5 Blender and
   3 placement builders, 6 reviewers, 5 fixers and 4 final reviewers. Each
   review found real defects the round before had passed.
4. Between critic rounds, fix the largest gap each critic names first,
   re-render, and brief fresh critics. Finish with two integration
   critics: one visual against the brief, and one on code and data, like
   the final integrity reviewer (`briefs.md` (f)).

What the rounds found (Ladonia):

- Renders beat plans where they disagree (the roofs read as gravel and
  planters with a dining set under each pergola; the plans add jacuzzis).
- A critic's "it's not there" can mean "it's covered": the pool's water was
  under its own terrace's paving. Look at the scene before modelling.
- Resolve critic conflicts (sun side, frame colour, pergola colour) by
  cropping the references side by side yourself, not by following the
  latest critic.
- Check neighbouring plots for overlap: B's north hedge, lawn and terrace
  ran through A's south terrace until B moved 2.2 m south.
- A checker's blocker can be its own bounding box. Ladonia's L and U
  kitchens and corner sofas were checked as rectangles, and a window
  shower's 2.74 m box top was read as reaching under a flight. Verify
  against the GLB before moving furniture, then teach the checker the
  shape (`checks/README.md`).

What the people work added (2026-10-09), for anything built by agents:

- A build checked on stand-ins proves the plumbing and little else. Six
  builders made the people and checked them on the app's two avatars
  with made-up poses, and each reported its part working. The first load
  of the real characters and clips, in the review, broke the drinks
  (tipped past 45° for half of every clip or more), the sitting (feet up
  to 5 cm under the floor) and the lying (backs 15–25 cm off the
  lounger). Get the real data in before anyone builds on it.
- The fixer's own check is not the acceptance check. After each fix
  round a checker who had built nothing, and measured the thing itself,
  found what the fixer had passed: "0 hits" from rays along the shin
  bones, with calves 1–2 cm inside the sofas. Give every fix round a
  fresh, independent checker; this took three rounds, and the last still
  left a list.
- Have the checker choose as well as fail: Ladonia's audited twelve
  seeds, picked one and tested the hand edits that cleared it.
- What you fix after the last independent check is unchecked: run the
  check's own tool on it again, or say so in the report. Ladonia's lead
  made four small fixes after the checker's audit and said so; the audit
  tool, run on the saved scene a day later, cleared them — and showed
  what the user had since moved (§0: they keep editing): one of two
  people nudged in the editor now has an arm in the grass the checker
  had moved him out of.

What the app work added (2026-10-10/17: the performance work, the live
room and the usability request), for the app's own code built by
agents:

- **Survey before the plan.** One read-only reader per feature area
  (`briefs.md` (h)). Their
  file:line facts are what the plan and every brief then cite (the
  session's `snapshots/reports/survey-<area>.json`).
- **Lanes in one checkout, each owning its files** (`briefs.md` (i)), not copies: app code
  does not merge the way placements do, and two lanes in one file is a
  conflict nobody sees until the build. Write the contracts between lanes
  into every brief word for word. What a lane needs of another goes in its
  report, never into the other lane's files. Two or three lanes a wave,
  then a reviewer per lane or two, one integrator or fixer, and one
  verifier: still under 10 agents.
- **Each lane builds into a scratch outDir of its own** and tests on a
  server of its own beside HEAD's build (§0), one tab timing at a time, by
  the baton.
- **After the builders**: a code reviewer and an in-use reviewer, then a
  fixer, then a measurer who built nothing (`briefs.md` (j)–(m)). On 2026-10-13 the measurer
  after the fixer found what the fix cost: Wrenfield's walk indoors 5 ms a
  frame slower. In wave C a first timing within target did not reproduce
  for two others. Run every comparison both ways round, by another agent,
  with the GPU timer beside it (§12).
- **A fix pass can make things worse.** The third clips pass:
  - sat 67–71 chairs a run sideways into their own backs and shells;
  - sent a clock that left others' figures still one frame and doubled
    the next;
  - took least-contact walks that went deeper at more seats than they
    helped.

  The next verifier, rerunning the last verifier's sweep, showed all
  three, and the fourth pass took them out, from the copies kept before
  the third (`<scratch>/<job>/<pass>-before/`: `briefs.md` (o)). So keep the files a pass
  will touch as they were before it, give its verifier the last
  verifier's instruments, and revert what measures worse rather than
  mending forward.
- **A verifier's instrument can be wrong too.** The public view's female
  "before" counts came from a sweep whose figure still lay back from the
  pool. Take the figure's state from the page before each case, and
  strike from the docs any numbers made that way.
- **Last, a docs fact-check against the code**: every identifier, every
  `Owner.member` pair and every quoted constant checked in its owner's
  file, and every figure traced to a report.

## 10b. Bake, and check the bake

The bake is what every device draws a published version from — a
computer with what moves still shading the sun and a shut door dimming
its rooms ("baked"), a phone and the slider's two lowest steps with
nothing live ("static") — and what gives the interiors their real light;
a live view is not judged by it. Bake once the space is settled and its
unbaked publish checked (§10). Details, numbers and causes: `app-notes.md`,
"Baking", "How a baked view is drawn" and "Exposure in a baked view".

1. **Before**: a site with its own sky is baked under it (`landscape.sky`;
   its `day`/`dusk` names plain, the HDRs in `public/textures/sky/`, or it
   falls back to the preset and says so). Spaces without one bake under
   their preset. A room daylight does not reach bakes black by day and
   starts the day with its ceiling light on, told from the spec: list
   them (`darkRooms(spec)` of `shared/daylight.js`, in node — Ladonia 20,
   Wrenfield 4) and see they are the rooms you expect; a window left out
   of a wall makes a room one of them.
2. **Draft on a copy**, never on the user's `published/`: a bake rewrites
   its version in place and deletes that version's earlier bake. Copy
   `published/<id>/manifest.json` and the version folder (without its
   `bake-*`) to `<scratch>/pub/<id>/`, print the folder the store resolves
   (`PUBLISH_DIR`, server/publish/store.js) and stop if it is not the
   copy, then run detached and poll — `(PUBLISH_DIR=<scratch>/pub nohup
   node scripts/bake-public.mjs <id> --samples 16 --size 1024 >
   <scratch>/draft.log 2>&1 &)`. It bakes the version that `manifest.json`
   names, the latest published: for any other folder you copied — the
   earlier, baked version, where the latest is an unbaked one, as
   Wrenfield's is — add `--version <v>`, or it stops on a file it does not
   find. One bake at a time. A house's draft is
   minutes (Wrenfield: 7 at 128 samples and 2048). Ladonia's took 1 h
   55 min on 2026-10-04 (16 samples at 1024), nearly all of it handing the
   scene to Cycles — some 1,400 times as the code then was (1,542 as
   committed then). On the code since 2026-10-12 it is 423 hand-overs (230
   for lightmap passes, 193 for the vertices' and the probes' light), and
   with its 475 opening parts and 59 sashes a draft at 128 samples and
   2048 took 61–68 min (wave B, 2026-10-16, three drafts: 3,640–4,065 s;
   `PUBLISH_DIR=<scratch>/pub node scripts/bake-public.mjs <id> --samples
   128 --size 2048`, detached): view 35.4 MB, lightmaps 0.5 + 0.5 MB,
   probes 1.3 MB. Blender holds the GPU the whole time: take no timings
   meanwhile. To try one thing on a big site in minutes,
   bake part of it (`--variants night --no-switches --no-doors`,
   `BAKE_CUT`, `BAKE_BOX`: never a bake to keep).
3. **Read the log's health lines**: `unwrapped … 100.0% … even texel
   density` (Ladonia's draft: 8.3 s); `margins narrowed` (fine); `atlas N%
   filled; zones' texels per metre within …` ≤ ~50% (Ladonia's draft:
   30% filled, within 24–33%); no `zone short of texels`; `house texels` a few cm at 4096
   (Ladonia 5.5; 10.3 at a draft's 2048); `sky <hdr> turned <turn>°, strength 1, N sun
   pixels clipped` for a site sky; `the scene was handed to Cycles N times`
   (Wrenfield 148: far more than its passes means something is baked an
   object at a time again); `Baked in …`. Any Python traceback stops the
   bake (`--python-exit-code`).
4. **Look at the draft** on a test server whose `PUBLISH_DIR` is the copy.
   Run `bake-check.js` (the list above) and read its `sun`, `black`,
   `drawn`, `zones` and `cannot`; the same by hand, in the page, where it
   says it cannot read something: the sun drawn against the bake's (`sun.position −
   sun.target.position` of `world.environment.sun`, and
   `experience.published.lighting.variants.day.sun.position`, both made
   unit: the same, and the site sky's); each room's daylight from the
   probes, in "baked" mode once `world.probes` is there
   (`experience.renderer.realism.meter.roomDaylight(world.probes, room)`
   over `world.spec.rooms`: step 1's rooms should be among the lowest —
   Wrenfield's four read 0.00006–0.0015 where its other rooms read
   0.008–0.08; Ladonia's twenty 0.00001–0.011, its guest WCs at the top
   of that, the probes being measured with every door open); black where
   it should not be — frames room
   by room, by day with the lights off and at night with them on, at the
   doorways (linings, thresholds), the casings and skirtings, and from
   above (the wall tops are dark there, as a cut wall is on a plan). Then
   render the views (`__renderSet`) and `compare.mjs` render | unbaked |
   baked. Healthy: interiors' mean luminance within ~15 % of the unbaked
   view's by day — the meter brings each room there, ×3 in a glazed room
   to ×32 in a dim bedroom — exteriors as the renders. A draft is blotchy
   and its small pieces bleed: judge light levels and directions, not
   grain.
5. **Final**: `npm run bake -- <id>` bakes the user's latest published
   version in place (only when they asked for the bake) — detached with
   nohup, polled; a background shell is stopped after 2 h. A house is 28
   min at 512 samples, 4096, with 2048 copies for phones (Wrenfield; 20
   min published "Fully baked", which bakes for that mode alone). Ladonia
   took 3 h 22 min on 2026-10-04; the user's own bake of it on 2026-10-12
   took 1 h 52 min, by its folder's stamp and its `bakedAt` (`app-notes.md`,
   Baking): ask before starting it. `/view/<id>` draws the baked light once it
   ends — **if that version is still the latest**: a later publish without
   a bake is what the plain link opens.
6. **Check the published view** in every way a visitor meets it, saying
   of each frame which it is: as it opens on this Mac (step 4, "baked" —
   the bake's light, what moves shading the sun, the meter reading the
   frame under a site's sky and the probes without one); `?quality=0`
   ("static" — nothing live, no probes, one exposure for every room: what
   a phone is given; `?rated=1` shows the rest of what a device rated low
   gets); from above (**B**: always the bake's); at night (**N**); with a
   door shut and a light switched; with **K**, the rooms round the visitor
   in their own materials, the editor's, lit by the bake's own light
   (`World/RoomBakeLight.js`, since 2026-10-15): the sun and the nearest
   lamps live with their shadows; the sky through the windows, every
   bounce and the lamps not drawn live the bake's. Judge them against the
   baked frame of the same pose, not against the editor (§7): the room's
   own pixels within a few levels of it in mean, warmth and shade, and
   dark at night with its lamps off. Check:
   - the room stood in, and the rooms seen through its open doors;
   - a door opened onto the next and walked through: nothing in view
     should change but at the first press;
   - in from the garden;
   - a lamp turned off and on standing under it: every frame of the fade
     further than the last, the exposure the bake's;
   - a room with a sheer curtain;
   - K off again: the bake's, to the pixel.

   A bake without its light apart (an older one, a "static" one),
   `?lightmap=rooms` or `?merge=off` draws K's rooms as the unbaked view
   does (`RoomBakeLight.usable`). `?lighting=live` draws the old whole
   house lit live, to compare. Then tell the user what is still short (§
   Corrections log).
7. **Baking again** changes what the bake holds, not how the view draws
   it: a version baked before a fix to the bake shows the old fault until
   it is baked again (`app-notes.md`, Baking, "What baking a version again
   changes": Ladonia's published bake is the user's own of 2026-10-12, with
   the fixes of that date; Wrenfield's is still 2026-10-01's). Two bakes are compared at the light probes and face by face,
   not texel for texel (`app-notes.md`, Measuring).

## 12. Performance

The user's terms since 2026-10-10: the highest frame rate in the editor
and in the public view with the most realism kept, and a published view
drawn from its bake by default; since 2026-10-16, a new feature must not
slow down what was there, and must cost as little as possible when used
(the standing terms). What the app does for that now — a space
gets it without asking, and can spoil it (the numbers and how they were
taken: `app-notes.md`, "What a visitor is given", "How a baked view is
drawn", "Measuring"):

- **The editor opens cheap**: one plain light and the houses alone, until
  the look (**P**, Realistic preview) or more of the site (the *Show*
  menu) is asked for — and under that light it draws the house merged
  and the furniture instanced (stand-ins: the scene's own objects are
  untouched), answers every ray from an index, mends its collision trees
  after an edit, outlines a selection without drawing the scene twice,
  and draws a frame only when something has changed. Ladonia on this Mac,
  the committed code → the plain light (2026-10-12) → this (2026-10-14):
  edit mode over the whole property 45 ms a frame → 22–24 → 10.9 (9,541
  draw calls → 1,438), one villa 48 → 18–20 → 10.3, a view of one room
  (nothing in focus) 24.5 → 6.6 → 5.9; a piece selected over a villa 66 →
  34 → 12; and since the plain light, walking by the pool 37 → 12 for the
  whole frame, a drag's pointer move 101 ms → 2.8, leaving edit mode after
  an edit 2.4–3.0 s → 26–32 ms, an edit view left alone 19 frames in 10
  s. Opening to a furnished, walkable scene: 6.4–8.2 s → 4.3–4.5 in the
  first sitting, 6.5–6.7 → 2.2–4.1 in the second — the same build read
  4.3–4.5 in the one and 6.5–6.7 in the other (the second drove the load
  flat out in an iframe), so each pair compares and the two do not chain.
  What is left there: some 1,400 draw calls of what is one of a kind,
  see-through or moving; nothing gained in a view of one room, and a room
  in focus half a millisecond slower (3.7 → 4.2 ms). Wrenfield's walk
  indoors, found slower by the final measurement, was mended on the 14th
  (§ Corrections log, 2026-10-13). Since wave C (2026-10-16) what the
  stand-ins draw is also held still, and the units they draw entirely are
  left out of three's own pass over the scene (`StandIns.hold`,
  `drawnScene`; `?still=0` compares; `node scripts/test-standins.mjs`):
  1.6–1.9 ms a frame, three's walk of the matrices 1.52 → 0.22 ms. With
  the opening furniture in, the editor is at or under HEAD at A1's
  kitchen and living room, the upper U kitchen and in edit mode.
  Whatever moves or is added deep inside a held unit must work out its
  own world matrix (§10, §13).
- **A baked version is drawn from its bake on every device**: "baked" at
  slider steps 2–4 (what moves shades the sun and is lit by the bake's
  probes, a shut door dims its rooms), "static" at steps 0–1 and on
  phones (nothing live), the bird's-eye view from the bake always, and the
  whole house lit live only by link (`?lighting=live`), to compare. Its
  switches and doors are resolved into one lightmap and its rooms merged
  into one house (Ladonia 3,952 meshes → 670). Ladonia baked at step 4:
  25–44 ms a frame → 13–17 (the living room 79 a second, the pool 59), at
  night 39–64 → 13–17; at step 0, 10–22 → 4–8; Wrenfield 8–10 → 5–6. The
  rooms round the visitor in their true materials, lit by the bake's own
  light with the sun and the nearest lamps live and real shadows, are
  theirs to ask for (**K**; `app-notes.md`, Live room light). Cost, at
  2560 × 1440 standing: +2.0–3.4 ms a frame (2026-10-15; +3.0–4.2 when K
  drew them unbaked), and 0.7–1.0 ms more while a sheer curtain of a room
  shown is in sight. It holds a second lightmap, 64 MB at 4096², from the
  first press until K is off. A first press at night on a fresh load is
  lit 1.75 s after it (K before: 2.7 s). After K off nothing of it is
  drawn or run, but it keeps about 14 MB so that K again builds nothing.
- **Nothing takes a device above the step it is rated for** (touch 1,
  integrated graphics 2, other Apple chips and discrete cards 3, Apple
  Pro/Max/Ultra and RTX 4; `?uncapped` lifts it for a developer), each
  step has a pixel budget, and a public view that falls under 28 frames a
  second makes itself lighter — resolution, then the live room, then the
  step — and goes back when there is room.
- The public view's low end is still a mid-range Android phone about
  three years old: "static", step 1, pixel ratio at most 1.5, eight people
  at most. **None of this was measured on one**, nor on an integrated GPU:
  every figure is this M4 Pro's, its pane hidden. Say so whenever a
  number is quoted, and test a phone when there is one to test.
- Costs are draw calls and live lights, not triangles. A light at nothing
  costs every lit pixel what a lit one does, and three builds each lit
  shader for the number of lights there are: a light that is off is out
  of the scene, hidden, never dimmed to 0; in the editor anything that
  makes a light hands it to `world.plainLight?.keepOut`. A light inside a
  piece (a fridge's) is one light lent round, not one each (Ladonia's 15
  dark fridge lights cost 4–6 ms a frame). It stays out of the scene,
  hidden, until one of its kind is lit (at intensity 0 it cost 0.2 ms of
  A1's living room). It comes in only once its shaders, and the shadow
  maps' for the new count of lights, are built (`Openables.warmAll` at
  load: about 70 programs paced over 2.4 s on a first visit). It goes out
  4 s after the last is shut (`LINGER`).
- A furniture part or a window's sash is a draw call of its own only
  while it moves or stands open. Ladonia has 475 parts (every front of
  its kitchens, wardrobes and storage since 2026-10-16) and 59 sashes;
  drawn one by one they took a baked view's kitchen frame from 13.1 to
  16–17 ms (+609 calls).
  - Shut, the editor draws a piece whole, one mesh a material, by a model
    shared by every piece of the same file and finishes
    (`World/StandIns.js`): 170 pieces from 45 models; A1's kitchen 1,138
    → 910 draws.
  - A public view merges every shut part and sash by look as it loads
    (`World/ShutBatcher.js`): 534 entries in 21 meshes, each part's floor
    kept for the view from above, a window's panes one glass mesh while
    its sashes are shut. A1's kitchen 1,499 → 1,056 draws, against 1,038
    for the version before. Their own shaders are made ahead, since
    nothing draws them until one opens. `?shut=0` compares.
  - So a fitted piece costs its materials, not its fronts: give it no
    more than its look needs (a Ladonia kitchen has about 20, its
    fridge's liner and glass among them).
  - Still a draw each: glass on a part (a washer's porthole, a shower's
    door: two-sided, in two renders — 48 draws a frame at A1's living
    room, most behind walls); lamp glass; door leaves; a baked view's
    fixed panes.
  - Over the 12 October version the shut fronts also cost their light:
    lit by the probes where the house was lightmapped (the upper U kitchen
    1.1 ms). A bake output for shut parts is the user's to decide
    (`app-notes.md`, How a baked view is drawn).
- **What is left, and the user's to decide** (wave C, 2026-10-16/17;
  2048 × 1536, step 4; the final check, each comparison run both ways
  round: `app-notes.md`, How a baked view is drawn › Measured):
  - A public view of the version with the opening furniture, windows and
    water costs +0.08 to +0.35 ms over the user's 12 October version at
    the same spots with no water running (A1's living room +0.35, GPU
    +0.24), and +0.62 with a hot shower running, about +0.5 of it the
    water. Earlier sittings read A1's living room at +0.1, +0.8 to +1.15
    and 0.0 / +0.45 by their tab set-up; the GPU's +0.2–0.25 and the
    draws (+30–36) held in every one.
  - The 12 October version itself is 0.15–0.53 ms faster on this build
    than on HEAD; the editor −0.55 to +0.08.
  - The rest is new content: part glass drawn two-sided in two renders,
    more draws, a longer look ray. Two-sided transparent glass costs
    1.1–1.7 ms of CPU at A1's living room in either version, because
    three draws it twice a draw.
  - Cutting that changes the look (`forceSinglePass` on part glass, or
    shut part glass merged across pieces, which changes how glass sorts):
    ask before doing it.
- What a space can spoil: a room drawn without its window is "without
  daylight" and starts lit (§10b.1); anything new drawn out of doors that
  is no collection's shows in the editor's House scope until `Scope.apply`
  hides it; a material drawn by a shader of its own must carry its data
  through a publish; and something new that moves by itself inside a wall
  or a piece, or changes the picture with no event, is not seen by the
  editor's ray index, its stand-ins or its frames on demand until it says
  so (`app-notes.md`: Rays and the collision trees, When the editor
  draws).
- **Measure in pairs, never by eye**, and never by `?stats` in a hidden
  pane: the committed code built in a frozen copy — or a copy of the build
  the user's server still has (§0) — against the working tree's build, a
  tab each, taking turns under a baton, the render timed to a
  pixel read back (`__K.time(n)` is that: the mean of n frames after one
  warm-up; the work's own cells were nine frames after three warm-ups,
  best and median), the load average noted (`app-notes.md`, Measuring). The same
  frames time twice as slow while Chrome or Blender is busy: compare
  within one sitting, never during an export or a bake. Since wave C,
  run every comparison both ways round (which tab holds which build
  swung a millisecond of CPU), with the GPU timer beside it and the
  draws counted over all of a frame's renders (`pair-time.js` with
  `pair.py`, `gtime.js`, `wtime.js`'s `draws`; the spots in
  `<project>-spots.js`); a first run within target did not reproduce.
- Trees whole < 24 m, light < 48 m, impostors beyond at slider step 3
  (× `QUALITY.flora.reach`, 0.6–1.5 by step); AO half-res, kept over a
  bake (without it a room is a tenth brighter and nothing is seated on
  its floor; it is 4–5 ms of a step-4 frame — the user's call).
- A larger site widens the sun's shadow frustum and coarsens the
  buildings' shadows: check shadow texel size when the site grows.
- People (§4b) are draw calls: 5–8 skinned meshes and about 50 thousand
  triangles each (measured frames: `app-notes.md`, People). The phone
  rules:
  - The slider step caps how many are drawn — 8 at step 1, a phone's
    default, 4 at step 0 — from the top of the spec's list, whole groups
    at a time. So a plan's first four must already be the scene: the
    group by the pool and the loungers.
  - A public view downloads only the characters it draws, under a third
    of the bytes for four of Ladonia's twelve.
  - They are never in the bake, and a visitor can switch them off with
    the rest of the scenery.

## 13. Pitfalls already hit (don't repeat)

- Static batching drops custom attributes: list them in
  `material.userData.attributes` (the terrain's `paint`).
- N8AO: `gammaCorrection: false` before OutputPass (double sRGB).
- Sky picture: no mipmaps (`generateMipmaps = false`) or a seam shows.
- GLB packing prunes unused UVs: `packGlb(…, { keepAttributes: true })` for
  models whose textures are given in the app; packed meshes carry node
  transforms (apply `node.matrixWorld`).
- A seeded space's furniture must use catalogue ids that exist; missing
  pieces mean `dist/` is stale.
- joinery's `wardrobe` only draws its cornice facing −Y: build it so and
  turn it round for a +Y front.
- Anything overhanging a piece's footprint (a hob wider than its module)
  widens its catalogue size and shifts where it lands.
- A baked pattern's colours (`veneer`, `speckled`, `noisy`) reach the app as
  sRGB, a `plain` one's as linear: give the former as they should look, or
  oak comes out mahogany.
- A canvas radial gradient fading to `rgba(0,0,0,0)` fades through black:
  fade in the patch's own colour (the plaster generator's `soft`).
- Wrenfield's grass looked up its baked light on the first ground within
  0.3 m — the neighbourhood's field below the lawn — until it took the
  nearest in height (`Vegetation.js` `groundUv`).
- Fog on huge ground triangles must be per pixel, not per vertex, or whole
  fields darken unevenly.
- A class with two methods of one name keeps the later one, silently:
  People's per-frame `update(delta)` replaced the editor's
  `update(person)` until the frame call became `tick`. The `no-undef`
  lint does not see it.
- three's GLTFLoader drops the colon from a node's name (`prop:wine-red`
  becomes `propwine-red`, `mixamorig:Hips` `mixamorigHips`; the original
  stays in `userData.name`), and gives every skinned mesh a Skeleton of
  its own even over one list of bones: share by the bones.
- A skinned mesh's bounds are its rest pose's: cull by a sphere round the
  pose, and pick by capsules round the bones (a ray against the skin cost
  8.6 ms a person).
- A list stored as "the pieces kept" (the publish options a browser
  remembers, a manifest's) leaves out every piece added later: store the
  pieces known beside it (`sceneryKnown`).
- A cap by quality step must not hold in the editor's edit mode, or what
  is being placed can be neither seen nor picked.
- A light at intensity 0 is still a light: three builds every lit shader
  for the count of lights and each lit pixel pays for it. Hide it
  (`visible = false`), or in the editor keep it off every layer
  (`world.plainLight?.keepOut`); let in for one frame, it has every shader
  built again.
- A shadow map that does not look every way its light shines is a leak: a
  point outside a map is lit. The room lamp's first map looked straight
  down, and the upper part of every wall was lit unshaded — walls the lamp
  cannot see among them.
- Never read a mipmapped texture after a branch on something that varies
  by pixel: its level of detail is undefined there, and edges read the
  coarsest level (take `dFdx`/`dFdy` before the branch, `textureGrad`).
- three keeps the uniforms of the last shader it *built* for a material,
  not of the one in use: a material that goes between two shaders must
  hand every variant the same uniforms.
- One 8-bit scale for a whole lightmap is the sunlit garden's: a room lit
  through its windows is left fourteen to twenty of the 255 levels, and
  lossy compression then
  shows as tinted blocks at the room's exposure — which more samples do
  not mend. Hold each room's part by a curve of its own.
- A helper that reads the scene graph reads what is drawn. The editor
  opens with the garden not made and the cars, the far ground and the
  neighbourhood hidden, so a check run there passes on what it never saw
  (the people's audit, z-fighting): ask for the scope first.
- A stub that answers every POST answers your own tool's: results sent to
  a server of yours from a harnessed tab never leave the page.
- The editor draws stand-ins for the house and the furniture, and the
  real meshes stay `visible`: a helper that walks the scene has every
  surface twice (`zfight.js` called 552 of Wrenfield's 615 clusters a
  surface against its own copy — pass over `userData.standIn`), a
  Raycaster of its own passes through what they draw
  (`layers.enable(12)`), and a mesh hidden by hand inside a wall or a
  piece stays in the picture for up to 16 frames
  (`world.standIns.hear()`). Since wave C, something added inside a piece
  or a wall below its root's own children (a test's marker, a helper) is
  not drawn at all until the stand-ins look that unit through again: the
  unit is left out of what three is handed (`StandIns.drawnScene`), and
  they look through four units a frame, so on Ladonia about 320 frames.
  Hang such a thing on the root, or in a group of your own in the scene.
- Never give a scene object a property of its own (`mesh.foo = …`): it is
  another kind of object to the engine from then on, and three's loops
  read them all — 2 ms a frame on one ray, measured.
- Cut from a wider box, a collision tree is another tree: room given
  round the furniture's, so that a piece carried outside would be a mend,
  left Wrenfield's two levels deep and its walk indoors 5 ms a frame
  slower — taken out the same day (the box is the furniture's own again,
  the tree the build before's). After touching how a tree is cut, time
  the walk, not only the edit, and fold the tree against the build
  before's (`app-notes.md`, Rays and the collision trees; `node
  scripts/test-collision-tree.mjs`).
- A build into `dist/` is a deploy to the user's own tabs: build work in
  progress somewhere else (§0).
- A published furniture part's slide (`opens.direction`) is in its
  piece's frame while its holder is put in the world: every drawer of a
  turned piece slid into it or sideways in the public view until the
  loader turned it (`app-notes.md`, Doors). Check a public view's
  drawers against the editor's, all of them.
- A collision tree's floors in a public view have tops and no
  undersides: a ray from below goes through, and whatever it meets
  upstairs is behind the ceiling. Test what is aimed at against the
  two-sided sight, as the lights always were (`app-notes.md`, What the
  visitor acts on).
- Clips taken by index break the day the list changes (the visitor's
  avatar had no "waving" at its index, and a network name like
  `toString` threw): bind them by name and fall back to idle.
- What clamps a walker's camera does not suit a car: from above, the
  floor's box held the view while a car drove off it, out of the frame.
  Follow a car over all the ground it can drive on (`shared/drive.js`),
  stop it where that ground ends, and sample the publish from there too
  (`app-notes.md`, The bird's-eye view › Driving from above).
- A rule for the nearest thing "within 2.2 m" measured across the floor
  reaches through ceilings: give it the floor too (`doorOnFloor`) — and
  through walls: from above, E sat the visitor on the next flat's sofa
  through the party wall until the seat had to be in sight
  (`Seats.inSight`).
- A door with something proud of its face (a pull, a handle), swung 90°
  about the face's outer corner, carries it back past the hinge line by
  its height: into an end wall, or into the next door. Swing it by
  atan(nearest point along the door / its height) at most (`_pull_swing`).
- A lamp's target is its piece's box (`Fittings.gatherLights`), and a
  light's box beats a door within 5 cm: a lamp on a piece with doors
  (ld-cabinet) took every press of E until its target became the lamp
  alone (`aimedAt`). A turned piece's world box stands out in front of its
  doors.
- Anything that comes over the network is unchecked (the server relays a
  visitor's `animation` as it was sent): a number there threw in every
  other visitor's frame. Take it as a string or a default where it arrives.
- What the HUD is told "only as it changes" must be keyed on all of what
  it shows: the prompt's signature left out its `also`, and "Space Stand
  up" stayed on screen after standing.
- A hundred-odd small parts that each ask something every frame (the
  probes' light, a matrix brought up to date) add up to milliseconds:
  skip what is at rest (`ProbeLight` 3.2 → 0.3–0.5 ms with 475 parts).
- GLSL `smoothstep` with edge0 > edge1 is undefined, and on ANGLE/Metal it
  drew nothing: write `1.0 - smoothstep(a, b, x)`.
- A camera-facing quad built with `cross(axis, toPoint)` is wound
  backwards and culled by FrontSide: make particle materials DoubleSide.
- A ShaderMaterial whose `side` is flipped at run time keeps the program it
  was built with until something else rebuilds it; then it is built again
  keyed by the side it has: make both ahead.
- three keys every program by how many lights of each kind the scene has
  — a ShaderMaterial that takes no light included — but only rebuilds the
  programs of materials that take light when the lights change. A shader
  made ahead "at load" is made for the load's lights: one first drawn
  after N was built in that frame. Make a new mesh's programs before it is
  first drawn, for the lights there are then, and hold it back till then
  (`Water.hold`, through `Renderer.build`).
- That includes the shadow maps' depth materials, which read no light:
  their programs are keyed by the light counts too, three draws the shadow
  maps before it takes the frame's lights, and its one shared depth
  material changes program at each change of the kind it draws (rigged,
  instanced, plain — 17 times a pass at A1's kitchen). A light let in by
  day therefore built six programs in the frame after it, where every lit
  material's had been built ahead. Build those too (`Renderer.shadowDraws`,
  `shadowTwins`: the next pass watched, its programs built again with the
  light in, in an empty scene, into a picture).
- A group's `matrixWorldAutoUpdate = false` holds nothing still while the
  Scene over it has `matrixAutoUpdate` true: three's `updateMatrixWorld`
  forces the walk down from every node whose matrix it composes, so all of
  Ladonia's 5,876 objects were walked and multiplied every frame. Hold the
  Scene itself still (`SceneBuilder.holdStill`); then whatever moves under
  a held group must update its own world matrix (Door.update,
  WindowSash.place, Openables.lend).
- reflections.js gives every transparent MeshStandard/Physical material of
  roughness ≤ 0.1 its studio to mirror as Environment is made, and the
  material keeps it ("its own reflections" in Sky.share). Something meant
  to mirror the sky — the pool's water — needs a roughness over 0.1: at
  0.04 the water mirrored the studio's softboxes.
- A fragment shader cannot read the depth of the frame it is drawn into:
  the pool's water works out what is under it analytically, from the
  pool's box and its steps.
- A pass that multiplies the frame (DstColor × SrcColor) must write its
  factor through `linearToOutputTexel`, or it dims less on the
  gamma-encoded screen (steps 0–1, no post-processing) than into the
  linear post-processing picture.
- Timing two versions in two tabs: which tab holds which counts (an
  old-version tab at A1's living room swung a millisecond of CPU from round
  to round). Run every comparison both ways round and give the GPU timer
  beside it (`app-notes.md`, Measuring); a first run within target did not
  reproduce.
- What nothing draws is never built: parts merged away into one mesh
  (`World/ShutBatcher.js`) built their own programs in the frame they were
  first opened. Build such shaders ahead, by one mesh a program, and again
  when a light comes in (`ShutBatcher.prepareOwn`, `Renderer.buildFor`).
- Whatever depends on where the eye is — which faces to draw, a depth test,
  an order against glass, the frustum — must be worked out after the
  camera is placed for the frame (`World.afterCamera`), not in
  World.update before it: the third-person boom snaps, and a frame drew a
  shower's steam inside out.
- OrbitControls takes its radius from where the camera is: move the camera
  after it and the next update reads a shorter boom. Limit it instead
  (`maxPolarAngle`, `Camera.dryOrbit`).
- A view's helpers are drawn into everything the scene is drawn into — a
  room probe's cube faces too. Hide what is drawn for the eye alone around
  such a draw (`RoomProbe.drawFace`).
- A copy of a material that something else changes in place every frame
  takes what it shows at that moment, and keeps it. The probes' dressing
  (`ProbeLight.dress`) cloned a glazed door's glass while `Sky.glaze` had
  it darkened for a view from outside. In about one load in four all 20
  of Ladonia's glazed leaves kept that look (0.78, #4b545a) indoors for
  the visit. Copy through the owner's record of its own values
  (`Sky.withoutGlaze`, as `withoutGlow` does for the glow).
- A fault in one load of several is an order of arrival, and a tab loaded
  beside another receives things in another order: there, the probes'
  file came after the sky's first glazing. Don't reload until it shows.
  Make each order happen on purpose and read the result, before the fix
  and after (`glass-race.js`: right is one look throughout, Ladonia's 20
  leaves at 0.62, #6a7f8a).
- A test that reads a list checks only the list. The touch icons are
  checked from `ICONS` (`shared/interact.js`), and the touch button runs
  by the prompt's key (`index.js` `runAction`). So an icon drawn in CSS
  but not listed (the pool's) is checked by nothing, and a prompt on a
  new key passes every test and does nothing on a touch screen. Add the
  list's entry and the key's line with the provider (`app-notes.md`, What
  the visitor acts on › Adding a kind).
- The checkers carry the app's rules in copies of their own. When
  `SceneBuilder.collisionOf` changed (2026-10-16), `checks/_modes.mjs`
  was updated, but `furniture-check-c.mjs` and `stairs-check.mjs` walled
  every piece with parts in as its box until 2026-10-17 (Ladonia's C:
  ACCESS 12 → 13, NARROW 27 → 26 once mended). After changing how anything
  collides, grep `checks/` for the old rule.
- `blender/lib/ladonia.py`'s `mirrored()` reverses an aimed light's aim.
  It turns each marker to (rx, −ry, −rz): right for a hinge and, with
  π − rz, for a slide. But an aimed fixture's X is its aim
  (`geometry.fixture`), and that comes out pointing back the wrong way.
  Build the other hand of a piece with a fridge or a spot by its
  builder's `hand=`, as the `-r` kitchens are.
- `Player.placeAt` and `teleport` take `spawn.yaw` in degrees. The
  scratch tools of 2026-10-16/17 passed radians (`yaw: Math.PI`, 3.14°),
  hidden because they set the camera's angles after.
- three's `crossFadeFrom` fades the clip played last out from all of the
  pose, whatever share it holds. A change during a fade (a tap of W, a
  stroke flicking to treading at a wall) put the pose back in a frame:
  bones 0.25–0.55 m, the root 0.58 m. Blend every change from each clip's
  share now (`Avatar.animation.play`, `blend`).
- The mixer sets a bone only where its value has changed. Whatever is
  added on top of a pose (a knee bent to lift a foot) is added again each
  frame to a bone the clip holds still: 20 cm higher a frame. Put back
  what you turned (Swim.js `unliftLegs`).
- Pose a figure last, after its turn and its clip for the frame
  (`Player.updateAvatarPose`): posed before the turn, a swimmer's head ran
  7–10 cm off the camera's through every turn.
- Measure a figure by its skin, from the frame before the key:
  - the toe bones stop 10–15 cm short of the soles (feet "off" the pool's
    floor were 0.14–0.24 m in it);
  - measures begun after Space missed a climb's first-frame snap of
    0.25–0.46 m.
- Try both avatars. `avatar_male.glb` hangs from an Armature turned +90°
  at scale 0.01 and has no eye bones: a clip fitted in the skeleton's own
  frame laid him on his back under the floor (`fitClip`'s `into`). What
  passes on one fails on the other.
- Clear what a test leaves on the figure before a baseline. A capsule
  placed by hand out of the pool without `swimmer.reset()` kept the
  float's lay-back while it sat, and a sweep counted shins 0.42–0.47 m
  into tables that were not (`act.js`'s `stand` resets it now).
- What a contact check leaves out as "its own" it cannot see.
  - A seat's own piece taken as what the triangles round its cushion are
    mostly of was the dining table, a corner sofa or a curtain.
  - The whole chair taken as its own let the figure sit turned with its
    torso 0.22 m into the backrest (0.39 m on the editor's meshes), which
    no sweep saw.
  - Take it by label within the piece's catalogue footprint, and narrower
    still for what must not be touched (`Seats.own`, its `side`).
- A "least bad" rule where nothing is clear — the way of sitting or
  walking that meets least — went deeper at more seats than it helped.
  Sweep such a rule seat by seat against the rule it replaces, everything
  else the same, before keeping it: a comparison with the seating changed
  between the two runs hid it.
- A figure seen must never move faster than it could. A 0.35 s glide onto
  a seat ran up to 14 m/s through the table, and a seat clicked from
  across the room cut the figure 3.8–4.6 m in a frame. Walk it, facing
  its way, at a walking pace, or fade it out and in and cut only at
  opacity 0.
- A fade by material copies must give back the very material each mesh
  wore, and look every frame it is not fading. The probes and the live
  room copy what a mesh wears mid-fade, and a copy of a copy left the
  figure at 0.991 for the visit (`Avatar.setOpacity`, `whole`).
- Another visitor's figure is played by the receiving page's own frames,
  from the place and the clip's name alone (sent every 20 ms whatever
  changed). Played by the sender's clock, sent along, it stood still
  between messages and doubled the next frame, and still sank 0.46–0.56 m
  after a hold-up.
- A pipeline that sorts by name misfiles a new kind: the people's `settle`
  cut "Stand To Sit" — a sitting clip by its name — to half a second.
  Keep the visitor's clips apart (`assets/people/avatar/`).

## Corrections log

Newest first. Each: what the user said, what was changed, where.

- **2026-10-16/17** — Ladonia (`kosinozici-villas`); one request in five
  stages. The user: "I need to be able to see debug mode on the objects,
  rather wireframes to see where the colliders are"; "Lights should be
  switchable with a keyboard key when entering the room instead of
  pointing to the light, as it needs to be easier to simply switch the
  lights on and off"; "Cars should be drivable in birds view without the
  camera switching to the driving view when entering the car from
  birdview, but rather staying in birdview the entire time"; "Add stairs
  in the pool and the ability to swim with proper character animations";
  "User should have the ability to sit in chairs, open drawers, wash
  machine doors, shower doors, turn the water on and off in the shower
  with steam appearing inside rendered with custom shaders, also turn
  water on and off in bathroom and kitchen sinks, open a fridge, closet
  and wardrobe doors, open windows and also watch tv".
  - Their answers: the swimming clips from Mixamo, through their own
    sign-in; the TV a real video loop, public domain or CC, about 3 MB,
    loaded when first watched; from above the car's keys are the car's,
    the view swinging round behind it about 1.4 s after the last drag; in
    the kitchens every front opens.
  - The defaults they accepted: each visitor's own state, no sound, the
    dishwasher and the ovens shut, no lying down or diving, the insides
    plain (shelves, rails, a fridge's shelves and bins, no props), edit
    mode the wireframes only. Answers and defaults now stand at the top
    of this file.
  - Before wave C they added their standing word on speed, "I want the
    frame rate both in the editor and in the public view to be as high as
    possible" (the standing terms).

  → How it was worked: a read-only survey (eight readers), the plan (the
  approvals pattern at the top), then:
  - stage 1 (the colliders, Q, driving from above, the groundwork for the
    rest): two lanes;
  - wave A (sitting and the TV; the furniture in Blender; opening
    furniture and windows): three lanes;
  - wave B (fixes and speed; water and steam; the pool's steps, swimming
    and the jump-out bug): three lanes;
  - wave C (speed; the pool's water and the swimmer): two lanes.

  Each lane owned its files in one checkout, and each wave had a review,
  an integrator or fixer, and a verifier. The user signed in to Mixamo
  after wave B, on the evening of the 16th, and the visitor's six clips
  were downloaded (3.5 MB; §4b). On the 17th they were wired in, then
  four passes more, one lane each, on what each pass's verifier had
  found.

  Built only into the scratch folder, tried on test servers of their own
  beside HEAD 5876694's build (§0), with scratch publishes and three
  draft bakes into a scratch folder; every figure this M4 Pro's, its pane
  hidden. Nothing published or committed; the repo's `published/`
  untouched. The user's scene was given the pool's steps and nothing else
  at the end of wave C (`patch-pool-steps.mjs`; the backup
  `kosinozici-villas.2026-10-17T02-58-24-844Z.json` in the session's
  `snapshots/scene-backups/`). Lessons folded into the standing terms, §0,
  §3, §4, §4b, §7, §8.6–9, §11, §12 and §13.
  - *The colliders as wireframes* (**C**, **Shift C** seen through
    everything; `Experience/Colliders.js`, `World/ColliderView.js`;
    `app-notes.md`, The colliders drawn; README, Seeing the colliders):
    - every kind in its colour: the building, blockers, stairs, furniture
      as its mesh or its box, people, trunks, door leaves while they
      block, cars driven and parked, the visitor's capsule;
    - in the editor always: a region round the visitor, and in edit mode
      a moved piece's would-be collider live;
    - in a public view only with `?debug` or `?colliders`: the whole house,
      92,799 triangles, cut above the floor shown from above.

    Hidden it costs nothing (its code is not even downloaded); shown
    +0.5–1.5 ms a frame, seen through +0.5–2.9 (step 4, 2048 × 1536).
  - *Q, the room's lights* (`Player.toggleRoomLights`,
    `World/Whereabouts.js`; `app-notes.md`, What the visitor acts on):
    - any on → all off, else all on;
    - a chip by the room's name, a round button on touch, and a line saying
      what was done or that there is nothing to switch;
    - from above, the avatar's room.

    One answer now for which room the visitor is in — the readout, Q and
    the live room — so half way up a flight it is never the bathroom
    under it, and a threshold no longer blinks the name. A1's bedroom at
    night: the frame's mean 103.6 → 5.0 → 103.6.
  - *Driving from above* (`World/BirdView.js`, `Camera.js`,
    `Vehicle/CarLights.js`, `shared/drive.js`; `app-notes.md`, The
    bird's-eye view › Driving from above; README):
    - F, or a click or tap on a car, gets in, and the view stays;
    - B and V go behind the car and back mid-drive;
    - the view follows the car over all the ground it can drive on
      (Ladonia's whole 640 m terrain, at whose edge a car now stops), and
      on after the visitor gets out until they are back by the house;
    - the publish samples the view from out there too (`driveViewpoints`:
      642 more bird's-eye samples, about 2 s);
    - the car's lamps are the bake's pool, with no shadow pass.

    Standing by the BMW 9.0–9.2 ms a frame (9.2–9.3 before), driving a
    median 4.4. Behind the car nothing changed: a scripted drive is the
    same byte for byte.
  - *What the visitor acts on* (`World/Interactables.js`,
    `shared/interact.js`; `app-notes.md`, What the visitor acts on):
    - one picker behind the crosshair, the prompt, E and F, with seats,
      taps, showers, a TV and windows as providers, each with its reach,
      priority, touch icon and key;
    - one list of keys (`KEYS`: the clash test, and the scopes of the
      hints; the hints' words are written in `index.html`);
    - a touch button for drawers and cupboard doors;
    - the visitor's clips bound by name;
    - `colliders.register` for what collides outside the trees;
    - `interactables.busy()` asked by Pace.

    With nothing aimed at, E opens the nearest door on the visitor's own
    floor only: over Ladonia's rooms it had been another floor's at
    7,047 of 15,235 spots.
  - *Sitting* (`World/Seats.js`, `Player.sit`/`stand`, `sitPlan`,
    `risePlan`, `walkPlan`, `seatPose`; `Utils/fitClip.js`;
    `app-notes.md`, Sitting; README, Sitting):
    - E on any of Ladonia's 219 seats; from above, a click on a seat, or
      E by one in sight.
    - The people's Sitting Idle is fitted to both avatars. Low seats are
      sat on as a person would (`Seats.wayOf`): reclined on the outdoor
      lounge chairs, knees opened on the low sofa and the poufs.
    - Sitting down and getting up are by the clips (Stand To Sit, Sit To
      Stand) only where the walk there, the turn and the body at eight
      moments meet nothing but the seat's own piece. Else on foot: the
      figure walks to where it stands at the seat, round what is in the
      way, turns, and sits down where it stands; it stands up, turns and
      walks back to where the visitor stood, or to the nearest free spot
      with a clear way. Never faster than a walk, never sideways.
    - From afar, it walks there where the way is clear and ≤ 6 m, else it
      fades out and in beside the seat (0.3 s each, dithered, cut only at
      opacity 0). Every fade ends in the very materials worn before.
    - It faces the seat's way, turned to a side only where that meets
      nothing at all, its own chair's back and shell included: one pouf,
      for the female figure.
    - Others see all of it.
  - *The televisions* (`World/Screens.js`, `screens.json`,
    `public/media/earth-tv.mp4`, NASA, public domain): twelve sets, a 40 s
    loop of the Earth from the ISS, without sound, loaded at the first
    switch-on, its brightness divided by the exposure, so that it reads as
    a screen by day, at night, from above and in the live room alike.
    Seated before one, E switches it and the view turns onto it.
  - *Every front opens* (`blender/lib/ladonia.py`, `joinery.py`,
    `geometry.py`; README, Doors and drawers; `app-notes.md`, Doors,
    Furniture, Blender):
    - what opens: Ladonia's 13 kitchens, 4 counters, the peninsula and the
      outdoor kitchens; its wardrobes, nightstands, sideboards, cabinet,
      media wall and TV-wall closets; the washing machines and the corner
      showers. 475 parts, each named for the prompt ("Open fridge"); the
      fridges integrated, with a light;
    - every part swept against its piece and against the scene;
    - the catalogue's sizes byte for byte the same, and the televisions'
      glass where it was;
    - water, control and steam anchors on every wet piece.
  - *The app side* (`World/Openables.js`, `Openable.plan`,
    `SceneBuilder.collisionOf`, `Publish/Runtime.js`):
    - a hinge about any axis, and a part's label;
    - a piece with parts collides as its body and a shut box a part, a
      shower's door barring the way only while shut. The L and U kitchens
      can be walked into, no carcass entered, and the editor's tree is what
      a publish collides (971,018 triangles each);
    - a part opens only until it meets something: 32 of 475 in Ladonia;
      a publish carries each part's `reach`.
  - *Windows that open* (`World/Sash.js`; README and `app-notes.md`,
    Windows that open): 59 sashes in 45 windows turn in, or tilt where
    something stands in the way (18). An invisible pane in each opening;
    a window's `opens` field and the editor's *Opening* selector.
  - *Running water and steam* (`World/Water.js`, `World/waterShaders.js`;
    README, Running water; `app-notes.md`, Running water and steam):
    - E on any of Ladonia's 70 taps, mixers, sinks and showers' valves, or
      standing in a shower;
    - streams, droplets, ripples, and rain ending on the visitor's head;
    - the 15 indoor showers hot: steam as a volume looked through, filling
      from the top, spilling into the room, the glass misting and
      clearing. The rest run cold.

    +0.73 ms at most at step 4, nothing while all is off.
  - *The pool, and swimming* (`World/Player/Swim.js`,
    `LandscapeBuilder.addPoolSteps`, `poolWater`; `shared/landscape.js`
    `poolSteps`; `blender/import_people.py` `AVATAR_AS`; README,
    Swimming; `app-notes.md`, Swimming and the pool's steps, The pool's
    water, People):
    - five steps across B's pool's south end, by the loungers (a small
      addition: the renders show a plain basin);
    - the water clear (§7): the mosaic, the steps and a swimmer showing
      through, caustics by day, the pool lamp's glow at night, the sky
      mirrored at grazing angles; +0.05–0.2 ms of GPU over the milky
      water;
    - wading, then swimming by the visitor's clips: the frog kick at
      swimming pace, the breaststroke with Shift, treading water still;
    - the figure sits in the water by what shows of it at every moment of
      the clip — its clothes under, its eyes out — and is kept within the
      pool's box and off the steps, its feet off the floor and the treads;
    - out with Space at the edge, the climb fitted to the coping, or up
      the steps;
    - no diving.

    The pipeline cuts a stroke to a loop where its pose comes back round
    (the breaststroke's reach for the edge left out), takes out its
    travel and swims it heads-up; the climb keeps its travel.
  - *The jump-out bug* (`Collision.capsuleIntersect`'s `from`,
    `headroom`; `app-notes.md`, Rays and the collision trees): running and
    jumping at 24 of 32 upstairs sill windows threw the visitor up through
    the wall and out. Now none, and walking, stairs, doors and cars are bit
    for bit as before.
  - *Speed* (`app-notes.md`, How a baked view is drawn: what runs every
    frame; the editor's stand-ins):
    - the editor draws a piece with parts whole (A1's kitchen 1,138 → 910
      draws), holds still what its stand-ins draw and leaves it out of
      three's pass (1.6–1.9 ms a frame: at or under HEAD at A1's kitchen
      and living room, the upper U kitchen and in edit mode);
    - a public view merges the shut parts and sashes by look (21 meshes;
      A1's kitchen 1,499 → 1,056 draws), holds the Scene and the merged
      house still (three's walk had gone through all 5,876 objects every
      frame), hides the light targets and empty fixture holders, and hides
      a fridge's glass shelves behind its shut doors;
    - ProbeLight passes over what is at rest (3.2 → 0.3–0.5 ms with 475
      parts);
    - the fridges' light is one lent round, out of the scene until one is
      opened, its shaders and the shadow maps' built ahead.

    The user's 12 October version is 0.15–0.53 ms faster on this build
    than on HEAD. The new version costs +0.08 to +0.35 ms more than it at
    the same spots with no water running, +0.62 with a hot shower: §12,
    What is left.
  - *The glass-door race*: in about one load in four the 20 glazed door
    leaves kept the outside look indoors (0.78, #4b545a); now always their
    own (0.62, #6a7f8a): `ProbeLight.dress` copies through `Sky.withoutGlaze`
    (§13).
  - *Mended by the reviews, the integrators and the verifiers* — the
    general lessons are in §13:
    - Stage 1:
      - in a public view every drawer of a turned piece slid into it or
        sideways (34 of 38; the loader turns the slide now, for every
        version published);
      - a door upstairs was opened, and named, through the ceiling;
      - the frame guard's `dispose` let go of half its events;
      - the editor's header toggle squeezed the floor picker at 1280 px.
    - Wave A:
      - from above, E sat the visitor through the party wall;
      - a visitor's `animation` that was not a string threw in everyone
        else's frame;
      - "Space Stand up" stayed after standing;
      - ld-cabinet's lamp took every press meant for its doors;
      - the 15 dark fridge lights cost 4–6 ms a frame.
    - Wave B:
      - a merged part's shaders were built in the frame it first opened
        (50–102 ms);
      - the water's programs were built for the load's lights only;
      - the water was drawn for the frame before's camera, and into the
        room probe's faces;
      - the orbit camera's boom shrank for good over the pool;
      - others saw a visitor on a low seat upright.
    - Wave C:
      - the frame after a fridge's light came in built the shadow maps'
        programs (35–43 ms; 0.7 s cold);
      - K drew a fridge's shelves behind its shut door;
      - a first timing within +0.5 ms of the 12 October version did not
        reproduce.
    - The clips passes:
      - a change of clip during a fade popped (bones 0.25–0.55 m);
      - a turn jolted the swimmer's head 7–10 cm;
      - getting up was a glide at up to 14 m/s through the table;
      - a seat clicked from afar cut the figure 3.8–4.6 m in a frame;
      - the climb's first frame snapped 0.25–0.46 m;
      - the feet went 0.07–0.24 m into the pool's floor;
      - a page's first fade, Space the next frame, left the figure at
        0.991 opacity for good.
  - *Tried and taken out again* (the third clips pass's; the fourth
    reverted them from copies kept before it, §11):
    - turning a chair's sitter to a side where every way met something:
      67–71 seats a run sat into their own chair's back or shell, unseen
      by a sweep that counted the whole chair as the seat's own;
    - walking the way that met least where no way is clear: deeper at more
      seats than it helped;
    - playing others' figures by the sender's clock: still one frame,
      doubled the next.
  - **The user's own edits since** (the scene saved again 2026-10-17
    13:54Z, after the pool steps' patch; theirs, in the editor: keep
    them):
    - five dining chairs moved or turned (a-f011, a-f116, b-f117, b-f119,
      b-f120);
    - b-f011 scaled to 0.88.

    The seat sweep's starts and boxes (`ladonia-seat-starts.json`,
    `ladonia-w-boxes.json`) were taken before these edits: take them again
    before the next sweep.
  - **Still short**:
    - *The user's to decide*:
      - Ladonia must be published again and baked (the final bake about
        2 h) for the opening furniture, the windows, the water, the steps
        and swimming to reach its public view. Their `published/` still
        ends at 20261012T114849Z.
      - What the new version still costs over the 12 October one (§12,
        What is left): cutting the part glass's passes changes its look,
        and a bake output for the shut parts is not built.
      - The live room keeps about 14 MB of its own after K off, so that K
        again builds nothing.
      - Their placements stop 32 of 475 parts short (§4.5):
        - A1's and B1's wall-unit doors and ld-media-ochre's top doors at
          the ceiling tracks' spots (a-f005, a-f038, b-f005, b-f041);
        - the L kitchens' cupboard door beside the under-counter fridge
          (`door2` of a-f069 / b-f072, at −47.7° and −45.7°) at dining
          chairs a-f073 / b-f076 (the fridge's own door opens fully);
        - the outdoor kitchens a-f171 / b-f174 at garden chairs;
        - wardrobes at nightstands 0.38–0.5 m before them;
        - the small vanities' drawers at the WC pans.

        `scenes/` was not touched for these.
      - At a tucked-in dining chair or a four-seat table (chairs 0.355 m
        under the top) no way of sitting is clear. The figure sits
        forward, its forearms, thighs and most often a foot (19–24 of the
        44 oak chairs, male) in the table's edge and base: seated depth
        median 0.19–0.29 m, at most 0.46 m. Accepted. Garden armchairs
        drawn up to their tables are the same.
      - Q switches the room stood in only, not the room an open-plan room
        runs into. It is the key marked A on AZERTY. Ladonia's terrace
        lamps are not in its bake, so Q on a terrace has nothing to
        switch in the public view. A1's bedroom switch stands behind its
        wardrobe and can be reached only by Q.
      - From above, the pedals count as moving for the follow, not speed.
        The view leads the car by about 2 m at 16 m/s, not the 4 it aims
        for. The keys are said once.
    - *Found, left*:
      - Sitting:
        - getting up while the figure is still walking to a seat slides it
          to the stand spot at 0.10–0.155 m a frame, seen whole;
        - a second seat clicked within about 0.1 s of Space during a
          fade-back draws the figure whole at 0.99 opacity 6 m away, then
          fades it out there;
        - K taking the figure mid-fade draws it whole for one frame;
        - the prelude's cut frame is at ≤ 0.009 opacity, not 0;
        - the walks meet something at 85–111 of 214 seats: tables 49–65,
          the next seat 15–29, a wall or door 4–8 (the pouf c-f103's leg
          0.39 m into a wall);
        - Sitting Idle hangs the feet 3–5 cm on 0.49 m chairs;
        - on the 37 cm lounge the toes go 4 cm under the floor for a
          moment as the figure sits and gets up;
        - the female figure reclines with the male's clip (the women's is
          `LEFT_OUT`);
        - seated sideways (the pouf), the television "in front" is the
          seat's own facing's.
      - Others' figures:
        - a remote page sees the fade from afar as a cut;
        - a receiving tab whose messages bunch or stall (hidden: 10–15
          places a second, stalls of 0.3–2.7 s) sees a remote swimmer's
          eyes 0.46–0.66 m under at ordinary stroke changes;
        - a remote climb runs about 40 frames ahead of the sender's and
          stands still 21–22 frames, held at its start and its end.
      - Swimming:
        - the breaststroke swum heads-up is steeper in the water than a
          real one (the female's at 65°);
        - the sleeves of a stroke's arms come over the water, as a
          swimmer's arms do;
        - B's west side, lined with loungers, offers climbing out only at
          its ends;
        - the deck and the house are not truly mirrored in the water, and a
          swimmer near the surface reads a little too turquoise;
        - the water's light, fully baked, is an estimate;
        - the water's two programs build the first time the pool is seen.
      - Water and steam:
        - the steam cannot see the depth of what is inside its box;
        - N8AO darkens it a little before a dark corner;
        - the rain ends at the top of the head, so none is seen falling
          past a first-person eye;
        - the water's meshes carry a `raycast` of their own, which the
          stand-ins' notes warn against.
      - Furniture:
        - the walker (0.7 m) does not fit a corner shower's 0.6 m door;
        - there is no freezer door anywhere;
        - re-exports are not byte-reproducible (`bake.py` seeds by
          `hash()`);
        - a public view's colliders draw a piece's part boxes in its mesh
          colour;
        - a piece with parts placed at a scale other than 1 slides its
          drawers differently in the two views (none is so today).
      - Televisions: a set lights nothing round it, and from above at
        night A1's cabinet spots' bloom lies over its picture.
      - The camera: the third-person boom ignores door leaves and passes
        through people.
      - Driving: the car's nose hangs over the terrain's edge (its middle
        is the probe); going to a room or the spawn while driving is
        undone the next frame.
      - Where the visitor is: on `c-stair-n`/`s` the readout goes hall →
        stair room → hall on the way up; the nearest door is still the
        nearest across the floor, through a wall too (A2's bedroom by
        A1's bathroom opens A1's bathroom door).
      - The ground: a hairline crack shows along the edge of Ladonia's
        1 m terrain grid (x 76, z 78 / −62).
      - The colliders: in a public view under post-processing a collider
        shows through what collides with nothing over it (a pergola's
        slats, a car's body); the editor's region is gathered again in one
        go, 8–12 ms every 5 m walked.
      - First draws:
        - a lamp's lens or halo shown for the first time is a frame of
          29–45 ms;
        - on a first visit, walking into a room not yet seen builds its
          programs in the frame (A1's kitchen: 26–30 programs, a frame of
          2.7–3.0 s simulated) — three's way, as before;
        - the fridges' light's shaders are built at load whether or not a
          fridge is opened (about 70 programs, 2.4–2.6 s paced, no frame
          over 50 ms).
      - A public view draws 6–54 more calls at the pool and seated with
        the TV than the report before: cause not found.
    - *Unseen*: a real phone (the mobile preset only), a visible tab at
      the display's rate, another GPU, two visitors but through two
      hidden tabs.
    - *Left for the user*: `npm run build` and a reload of every open tab —
      their server has none of it until then; a publish and a bake
      (above); a commit when they ask. The Mixamo downloads and the
      converted `avatar-clips` files stay out of git (`.gitignore`).

- **2026-10-15** — Ladonia and Wrenfield; the live room (**K**). The
  user: "in the public view, in the live light mode for
  the room, when its nighttime and the lights are off, the room is still
  clearly visible, just like in the editor mode, but it should be dark,
  like the baked version", then "Make sure that in the editor mode it
  stays as it is currently, only change the published view". Later the
  same day: "There is a significant difference between baked light and
  live light in the view mode. The baked light is more yellow and warmer
  and live light is more white/blue, and also fewer shadows appear with
  the live light. Make the live lights ambience look as similar as
  possible to the baked one" — the materials to stay the true ones. →
  Builders, verifiers and fixers in rounds, built into the scratch folder
  and compared with the user's build room by room: each room's own
  pixels, baked | K before | K now. Nothing published or committed.
  Lessons folded into §7, §10b.6 and §12.
  - *Dark at night* (`LiveRoom.measure`, RoomGlow's `shares`): as far as
    a room's own lamps are off, its light that is not theirs is what its
    bake measured. That is its probes' six ways, raised to its lightmap's
    figure, no longer the unbaked view's share of the dusk. Villa A's 32
    rooms with every lamp off went from 24–122 levels to 0–0.5 in 25 of
    them; lamplit rooms are as before. This is now the fallback for a bake
    that cannot give its own light (below).
  - *In the bake's own light* (`World/RoomBakeLight.js`, with a second
    `LightResolver` holding the light without the sun's straight light):
    - the surfaces keep their materials and take their light from round
      about from the bake alone;
    - only the sun and the nearest lamps are live, each as strong as the
      bake's probes measured it, and shading as softly as the bake's lamp
      is big;
    - the exposure is the baked view's own meter's, clear glass is
      reflections only, and a sheer curtain is the baked view's own.

    Nine of Ladonia's rooms, mean difference from the baked frame, K
    before → now:
    - at night with the default lamps: 13.1 → 3.0 levels, warmth 0.086 →
      0.014;
    - by day with the lamps off: 38.9 → 8.6;
    - by day with every lamp on: 40.2 → 2.8;
    - Wrenfield's four rooms: 13.7–69.2 → 0.0–4.9.

    Standing +2.0–3.4 ms over the bake (K before +3.0–4.2), and 0.7–1.0
    ms more with a curtain in sight. The editor, the unbaked publish and a
    visit that never presses K are byte for byte the user's build's.
  - **Still short**:
    - a switch with more lights than the step's shadowed lamps (Ladonia's
      living rooms) is all the bake's, with no moving shadow;
    - door leaves are their true oak, where the baked view draws them
      nearly white;
    - by day a window's frame and pane, and a mirror or a washer, are the
      room's, not the baked view's white sky and studio (A1's windowless
      bathroom with its light off is black, for the bake's 45);
    - the indoor sky's light is upside down (`Sky.indoorLight`; found, not
      changed: mending it changes every view lit live);
    - not seen in a visible tab, at steps 2–3, or with two visitors.

- **2026-10-13** — Two requests, worked from the evening of 2026-10-12
  to the 14th. The user, on seeing K light a room's lamps live over its
  bake: "The live lights with K should completely transform the room into
  the same version that we see in the editor, without the bake, so the
  room should have a rendered geometries with their own materials
  rendered as it were the editor view, so not switch from baked to live
  lights, but also remove the baked textures and replace with actual
  ones". And, on the
  performance work's list of what was left in the editor: "Do the edit
  mode suggestions that were left to do". → For each, builders, a
  measurer, reviews and a fixer; every figure this M4 Pro's, its pane
  hidden, the build before against the new one in one sitting (§12).
  - *K draws rooms unbaked* (`World/LiveRoom.js`, `World/RoomLight.js`;
    `app-notes.md`, Live room light; since 2026-10-15 lit by the bake's
    own light where the bake allows, the entry above): the room the visitor is in, the
    rooms that always stand open to it, and every room seen from there
    through a door that is open or has glass in it, or a stairwell — their
    own materials, the sun through the windows with its shadows, the sky,
    their lamps, their glass, what moves in them, the frames and reveals
    of their openings, a flight of stairs with the room it starts in —
    and nothing of the bake on them. Every other room, the garden and the
    view from above stay baked. A room is made ready a little a frame
    before it is shown — the one behind a shut door as the door is
    neared — so that walking on changes nothing in view; K off is the
    bake's again to the pixel; the lamps-over-the-bake version's code is
    gone. Against the unbaked view: 50 of 57 poses by day within 1.5
    levels, night within 0.2; through open doors 0 px of baked room in 14
    of 16 stills. It costs +1.7 to +3.7 ms a frame standing with the
    doors shut, +3.0 to +4.2 with a door open to the next room; a 19.5 s
    walk through four rooms, three doors opened, 14.3 → 17.3 ms median,
    17–22 of 1,168 frames over 25 ms, none over 50. K never pressed, the
    view is the build before's: 28 of 28 pictures identical to the pixel.
  - *The editor* (`app-notes.md`: the stand-ins in "The editor's plain
    light and view scope", "Rays and the collision trees", "When the
    editor draws"): it draws the house as one mesh a material and the
    furniture as instances (`World/StandIns.js`), answers every ray from
    an index (`Utils/rays.js`), mends its collision trees after an edit
    (`Collision.js`'s `TreeKeeper`), draws a frame only when something has
    changed (`Pace.js`) and outlines a selection without drawing the scene
    again (`Editor/SelectionOutline.js`). Ladonia, before → after: the
    whole property 24.3 ms a frame → 10.9 (41 → 92 a second; 9,541 → 1,438
    draw calls), one villa 20.0 → 10.3, one room 6.0 → 5.9; walking —
    renderer, world and camera — the living room 20.0 → 8.7, the pool 36.9
    → 12.1, the street 35.8 → 11.3; a piece selected over a villa 33.9 →
    11.8; a drag's pointer move 101 ms → 2.8; leaving edit mode 2.4–3.0 s
    → 26–32 ms; an idle edit view, drawing all the time → 19 frames in 10
    s; load to a furnished, walkable scene 6.5–6.7 s → 2.2–4.1. Nothing
    the editor does changed: the saved scene byte for byte, a publish's
    files and stats equal, the pictures under the plain light equal to
    rounding.
  - *What the reviews found, mended on the 14th.* The editor: a piece
    carried beyond all the others (or its undo) had the furniture's whole
    tree built again, and half a second of walking against the pieces as
    they had stood — the tree was given room round it (a mend, 10 ms:
    taken out again the same day, below), and one still being built was
    finished in the frame the visitor first moves; a publish whose
    realistic light fails would have been taken
    with four fifths of the meshes off the layer a merge takes; sources
    only reordered left the old tree; seen from high over the property,
    which of two surfaces a millimetre apart showed was chance (the edit
    view's near plane now goes out with its distance). K: a room walked
    into from out of doors was 76 levels too bright — not the lamp the
    review named, but a dash of twelve texels of the sun in a pane across
    the garden, in the room's probe — and then 13–19 too dark (its probe
    taken through its own windows as seen from outside); the upper half
    of a flight of stairs was the bake's until the bathroom under it was
    opened; the façade above and below every window was drawn live. Two
    findings were not real: the editor has no view from above to come
    apart in, and the outline's edges and blur were made at half size
    already.
  - *How it was worked*: built into the scratch folder and tested on
    servers of their own over a copy of the scenes, the user's server and
    the repo's `dist/` untouched throughout — now §0's rule; `zfight.js`
    taught to pass over the stand-ins (§10, §13). The lesson of the last
    step: the measurer who came after the fixer found what the fix cost.
  - **Still short**:
    - *Slower than before, found by the final measurement — the first
      mended on the 14th, the second not.* Walking indoors in Wrenfield's
      editor: the room given to the furniture's collision tree had left
      it two levels deep, its largest leaf 17,989 triangles, the
      visitor's collision step 10.9 ms a frame where it cost none (a
      whole walking frame 15.3 ms for 9.8), and the editor's walk ending
      elsewhere than before wherever the visitor touches furniture
      (inside a sofa 30 cm). The room is gone: the furniture's tree is
      cut from its own box again and is the build before's in Ladonia,
      Wrenfield and Ashgrove through thirteen edits each (box, cells,
      every leaf's triangles in order), the walk equal to the digit
      (villa A's 30 doors, seven routes, 44 drops onto and beside
      furniture: 703 coordinates), the collision step 0.004–0.012 ms on
      Wrenfield. An edit that changes the furniture's box (the outermost
      piece moved, one put beyond the rest) has Ladonia's tree built
      again a slice a frame — Tab back in 19–35 ms, half a second of
      frames of 11–17 ms (one of 36–42), walked meanwhile against the
      tree as it was with the changed pieces put right in it. The
      realistic preview: 0.3–2.4 ms a frame more inside `render()`, same
      draw calls — looked for on the 14th and not mended: the same calls
      to the GPU's driver in both builds (43,076 and 43,105 a frame),
      nothing of the editor's running in the frame; what is slower is
      three's own walk of the same scene when it comes cold (its one
      `updateMatrixWorld` a frame 1.5–1.8 ms for 1.35–1.45; the same call
      in a loop 0.64–0.67 for 0.63–0.64), and how much slower turns with
      the tab a build is read in (`app-notes.md`, Measuring).
    - *The user's to decide*: in edit mode at rest the people and the
      pool's water stand still (they move while frames are drawn for any
      other reason, and while a person is selected) — before, they always
      moved; the heartbeat still draws two frames a second at rest.
    - *K*: a room come into from out of doors is the bake's until its
      visitor is in it, and changes in one frame; day and night, the
      slider and the view from above send the live rooms back to the bake
      for 8–43 frames; what is seen out of a window or a door to the
      garden, and the villa across it, is the bake's (out of an open
      terrace door a fifth of the frame is over 8 levels from the unbaked
      view's); a glazed entry door is darker live than unbaked (6–7% of a
      frame over 8 levels, final measurement); by day stairwells
      are 10–22 levels over the editor and some rooms evenly 5–9 off,
      cause not found; a first K on shaders the browser has never built
      is five to six seconds in coming, thirty frames of it 60–160 ms;
      beyond eight groups of rooms a room in sight is the bake's.
    - *The editor, left*: 1,438 draw calls of what is one of a kind,
      see-through or moving (door leaves, glass, 365 single furniture
      meshes); a view of one room gains nothing (6.0 → 5.9 ms), a room in
      focus is slower (3.7 → 4.2) and X-ray gains little; Wrenfield's
      first frame after leaving edit mode with furniture moved is 61–80 ms
      long, and the longest frame of a load is longer than it was
      (Ladonia 51–64 ms → 130–167) though the load is shorter; the
      furniture's tree is still built in one go at load (0.35–0.9 s);
      the first frame after a rest is 7–10 ms longer (the GPU's; hidden
      pane only); a lower resolution while moving was measured and not
      built (0.2–1.5 ms); an imported-model building is not merged, and
      was not tried; `rays.js` leans on `Mesh._computeIntersections`, a
      three r163 method outside its documentation — look at it on an
      upgrade.
    - *Unseen*: a visible tab at the display's rate, another GPU or
      browser, a phone. Edits were synthetic events and the editor's own
      functions, not a hand; Ashgrove got pictures and a sanity run only.
    - *Left for the user*: `npm run build` and a reload of every open
      tab — until then their server has none of this; Wrenfield's bake of
      2026-10-01 baked again, for its doorways' reveals beside a live
      room; villa C's first-floor hall has a wall's end baked black (the
      bake's zoning, K or no K).

- **2026-10-12** — Performance of the editor and the public view, Ladonia
  and Wrenfield (the work of 2026-10-10 to 12). The user asked for the
  highest frame rate in the editor and in the public view with the most
  realism kept, the public view fully baked by default, and to "test out
  multiple variants of optimization techniques, including quality of
  renders for both the interior and exterior". → Five stages of builders,
  measurers and reviewers, every change timed against the committed code
  in a frozen copy (§12; `app-notes.md`, Measuring). Decided, and why:
  - *The editor opens under a plain light, with the houses alone*
    (`World/PlainLight.js`, `World/Scope.js`): most of its frame was the
    sun's shadow map, ten to twenty-five lights in every shader, the
    post-processing and the garden, none of which helps place a sofa. The
    look is a key away (**P**), and a publish takes the scene lit
    realistically whatever is on screen. Ladonia: edit mode 45–48 ms a
    frame → 18–22, a view of one room 24.5 → 6.6, walking a room 32.6 → 9.8,
    opening 6.4–8.2 s → 4.3–4.5; Wrenfield 14–15 → 5.
  - *A baked version is drawn from its bake on every device*: "baked" at
    steps 2–4, "static" at 0–1 and on phones. The whole house lit live —
    what a computer was given — is a link's alone now: it cost 25–64 ms a
    frame on Ladonia, more whenever something moved. The bird's-eye view
    is the bake's always (at night 49–65 ms → 11–15).
  - *One lightmap, one house*: the switches' and the doors' light is
    resolved into a single lightmap on the GPU when one changes
    (`World/LightResolver.js`), and the rooms' meshes merged
    (`World/HouseMerger.js`: 3,952 → 670). The frame was draw calls and
    material variants, not triangles.
  - *What is live is the visitor's to ask for and the view's to take
    back*: the one room they stand in (**K**, `World/RoomLight.js` — at
    first its lamps' light over the bake, +0.5–1 ms; since the same
    evening the rooms drawn unbaked, `World/LiveRoom.js`: the entry
    above); a guard that lightens a view fallen
    under 28 frames a second (`FrameGuard.js`); a ceiling at the device's
    rated step and a pixel budget a step.
  - *Rooms daylight does not reach start the day lit*
    (`shared/daylight.js`), and at night a lamplit room is metered as a
    daylit one is: drawn from their bake those rooms were black by day,
    and a lamplit room at night a quarter darker than under the old live
    lamps (mean level 62–84; 86–101 now, the old live lamps' 77–107).
  - *The bake's blotches were its encoding, not its samples* (sixteen
    variants of Wrenfield): one scale for the whole atlas left a room
    14–20 of 255 levels and the lossy WebP erred in blocks. Each room's
    part is now written by a curve of its own. 512 samples at 4096 stays
    the final: 128 leaves mottle indoors by day, 2048 samples buy little
    for four times the sampling, a 2048 atlas loses strips, sun-patch
    edges and contact shade; out of doors 32 samples would do. Strips
    under three texels are lit through their vertices, doorway faces cut
    along the wall's middle and given to the room they are seen from, the
    garden's lamps are in the night's bake, and the scene is handed to
    Cycles 148 times a bake, not 352 (Wrenfield 34.9 min → 28).

  Ladonia baked at step 4, this Mac: 25–44 ms a frame → 13–17 (the living
  room 39 → 79 a second, the pool 23 → 59), at night 39–64 → 13–17; step
  0, 10–22 → 4–8; a 5 s walk indoors, every frame over 25 ms → none;
  Wrenfield 7.7–10.5 → 4.7–5.9. Unbaked, ×1.6–2.4 at night and ×1.1–1.5 by
  day. Also folded in: §7, §10, §10b, §12 and §13 here; `app-notes.md`
  split into sections of its own for what a visitor is given, how a baked
  view is drawn and exposed, live room light, baking and measuring;
  `reference.md`'s lists of the view's links, keys, steps, options and
  manifest; the in-page helpers ask for the preview or the scope they
  need. **Still short:**
  - *Unmeasured*: no phone, no touch device, no integrated or slow GPU —
    every figure is one M4 Pro's, its pane hidden, the render timed to a
    pixel; nothing was watched in a visible tab at the display's rate.
    The guard has never judged real frames, and its thresholds are a
    judgement; what a low-rated device is given was seen only through
    `?rated=` and `?quality=`. No Safari or Firefox; loads on localhost
    only; a lost graphics context only by `WEBGL_lose_context`.
  - *Not baked again* (as this was written; the user published and baked
    Ladonia afresh that same day — 20261012T114849Z, with its twelve
    people — so its plain link is drawn from a bake of this code):
    neither published bake. Ladonia's (20261004T152226Z) still has the
    black doorway bands and strips, no garden lamps in its night, the
    tinted blocks in dim rooms and no people; and the latest published
    version of both spaces is an unbaked one, so the user's plain links
    draw lit live. Wrenfield is half an hour to publish and bake —
    still so, and theirs to ask for.
  - *Went back, and was mended the same day*: the lamps that now start
    lit by day had put the lamp pool into every material of the unbaked
    view and the editor's preview by day (3–7 ms a frame) and made a baked
    Ladonia wait for 86 switch-layer files before its first frame (0.35 s);
    the pool now joins the light only while a lit fitting is in sight, and
    the first frame waits only for switches seen from the start (verified
    against the old build: back at the mid-way figures, 17.2 / 24.7 /
    20.6 ms unbaked by day, drawn and walkable at 3.15 s). Left: a first
    night's one long frame is 40–75 ms longer than mid-way (cause not
    found; it is still half the committed code's); at an indoor start the
    first lit frame draws door leaves wrongly until the sun's mask and the
    doors' atlas land a frame to 0.6 s later (behind the preloader, by the
    code — not watched in a visible tab); the lamp's light on a shut
    door's threshold goes out in one frame 3 s after the door shuts.
  - *The look*: a lamplit room at night is still a shade under the
    unbaked view's (86–101 for 109–125); the garden through a window from
    a lamplit room is up to twice as bright as from outside; steps 0–1
    expose every room alike, and brighter (140–152 for 105–111); the live
    room lamp's shades read dull and the ring of light round a recessed
    fitting is gone from its ceiling (of the lamps drawn over the bake,
    gone since: the entry above); door leaves, lit a side at a time,
    differ from every earlier frame (a glazed leaf pale grey-blue in a lit
    room at night); mirrors and metals reflect a studio, pale by day and
    black at night; a room without daylight is black from above with its
    light off; rooms with a small or blinded window (Ladonia's twin
    bedrooms) start unlit and dim.
  - *Unfinished*: the measuring tools were left in the scratch folder,
    which a restart empties; the editor's house is not merged and its
    selection outline draws the scene a second time (both done since: the
    entry above); what the preview allocates
    (the 8192 shadow map) and the garden once made are kept until a
    reload; face zoning does not cut at floors and ceilings; switches are
    still baked one to a pass (lit together their light changed); the
    ambient occlusion is still drawn over a bake (4–5 ms: kept for the
    look, the user's call); window panes are not merged (about 500 draws
    out of doors); the cars' textures and the trees' and grass's reach
    were left as they were.
  - *Not tried*: people in a baked view or in a room lit live (no baked
    version had any; Ladonia's of that day has, and the live room was
    measured on it); a version published "Always high"; Ashgrove (it has
    no published version); a whole bake of Ladonia with this code (only
    cut-down night bakes of it were run, for the garden's lamps).

- **2026-10-05/09** — The user: "add animated Mixamo characters randomly
  around the properties either standing with a drink in their hands
  talking on the terrace, lying beside the pool tanning, sitting on the
  sofa etc."; asked with options, they chose Mixamo downloads, placements
  generated once, saved and editable, shown in published views behind a
  People toggle, Ladonia only. Offered a list to download by hand, they
  answered: "Can't you download mixamo yourself, I will just login through
  the browser you open?" → §4b, all of it new: 12 characters and 17 clips
  fetched in their session; the conversion, the props, the seat
  measuring, the planner, the runtime and the editor and publish support
  built by six agents on stand-in avatars, reviewed by a seventh, then
  mended against the real set in three rounds (§11). Ladonia has 12
  people — seed 12 of the planner as it then stood, four of them edited
  by the checker; the plan was written exactly as audited (the scene's
  diff: `people` alone): a pair
  with drinks by B's pool, three on its loungers, one on a roof lounger,
  three seated (a roof lounge chair, a terrace sofa, an indoor sofa), a
  group of three on C5's roof. **Still short:** the list in app-notes'
  People section — chiefly lying legs that hover over the cushion, heads
  off the headrest on some bodies, street clothes on the loungers; the
  last four fixes had no independent audit before the plan was written
  (the audit tool cleared them the next day); the converted characters
  (14 files, 13.8 MB, in `public/models/people/`): asked, the user chose
  to keep them out of git — the repository is public — so `.gitignore`
  holds them, a clone draws the stand-ins, and a deploy needs
  `npm run people` or the files copied in.
  **The user's own edits since** (the scene was saved again 2026-10-10
  00:39, 45 minutes after the report — theirs, in the editor; carry them
  into any re-plan, never undo them): brian (person-9) moved 0.2 m to
  x 10.94 and remy (person-11) 0.1 m to z −19.123 on C5's roof, and a
  terrace chair, `b-f201`, moved 1.7 m and turned. `people-audit.js` on
  the scene as they left it finds brian's arm 1.8 cm in a planter's
  grass (clear at the checker's x 11.14) — told to the user, not
  changed.

- **2026-10-05** — The user: lights switchable in the editor (walkthrough
  and edit mode), and a publish "with the first 4 optimizations but nothing
  else … everything look like during the edit mode, only without the edit
  capabilities, and be able to turn the lights on and off"; then "save the
  baking you did into skill, then continue with this". → Live switching
  (LiveSwitches, LampPool, RoomGlow, LiveBulbs; HUD panel, editor bulb, L,
  Ctrl/⌘-click, day/night in edit mode) and the preset "Lit live — as in
  the editor"; Ladonia's 11 lamp pieces given light extras; the publish
  follow-ups (night publishes keep their shadow casters, casters simplified
  on the server, the baked terrain painted, the bake reading the new
  snapshot). Three verification rounds of agents found 38, then 21, then a
  handful of faults, all fixed but those listed below; the ones worth
  remembering: point lights under track heads burned ceilings white (all
  pool lights now shine down); unshadowed lights through walls (masked by
  room, with open-plan groups); lamps filed under the flat upstairs (a
  lamp's room holds its middle); the baked terrain's own shader overran 16
  texture units; published views let a visitor switch a light upstairs
  through the ceiling (two-sided sight); duplicate switch names across
  villas (`distinguish`); a woven shade lost a fifth of its strands in a
  publish. And one of mine: moving a helper between files left RoomGlow
  calling a function that no longer existed — `node --check` and the build
  passed, every view lit live threw (run `undef.config.mjs`).
  **Still short:** a wall light's tube still blooms a headboard seen from
  a metre (17 k saturated pixels at q4; a third of its power now, not
  re-measured); window reveals finished in the façade's render
  (`render_khaki`) take the outdoor share of the sky, so at night they read
  darker than the wall beside them; a light seen through a window can be
  Ctrl/⌘-clicked in edit mode but not pointed at in a walkthrough (glass
  stops sight there); Ashgrove's kitchen switch sits by the back door (the
  'hub' rule, unchanged, and baked so); in edit mode the lights panel's
  floor names ("Level +2.2 m") are not the floor menu's; grass blades, a
  car dressed later and other visitors' avatars are not masked by room;
  ceiling-hung lamps filed by the storey under their bottom (app-notes);
  night rooms lit live read a little brighter than the same rooms by day
  with their lights on (exposure 1.1 vs 0.85) — a judgement for the user.

- **2026-10-04/05** — The user: fix the issues the last review found, and
  "perform the bake, I got some error during the bake, so fix it if there
  are any issues with it". → The three model faults fixed (the lounge
  lumbar inside its back cushion, the ochre kitchen's splashback coplanar
  with its shelf column, the bed runner floating), plus a garden chair's
  sling and cushion. The bake's failure: `pack_zones` sized each room for a
  density the atlas could not hold, and Blender's packer shrank a dozen
  rooms to nothing (now sized from island boxes, margins narrowed as
  needed); Blender's exit code hid the traceback (`--python-exit-code 1`);
  the minimum-stretch unwrap was nondeterministic (angle-based now). Then
  a draft bake that ran showed every room far darker than the live view,
  and the bake ignored the site's sky: sun 83° off, procedural sky, moon.
  → `shared/sky.js` shared by Sky.js and the bake (`landscapeSky`,
  `sky_world`); the baked view sets the sky before the bake's light (no
  race); interiors metered (Realism's `LightMeter`); glass and metals
  whose shaders failed (`userData` textures through `Material.clone`)
  fixed; two adversarial review rounds, all confirmed findings fixed
  (`app-notes.md`, Baking). Final bake of version
  20261004T152226Z: 3 h 22 min, 5.5 cm texels, no errors; interiors at
  101–112 of 255 mean brightness against the live view's 105–124,
  sunlit exteriors 7–9% brighter, shaded façades 25% brighter (as in
  renders 13/14). Still short: the
  landscape's trees, woods and hedges cast no shade in the bake (phones
  show none); windowless rooms are black by day until their light is
  switched on; bedrooms whose blinds are down bake dim.

- **2026-10-03/04** — The user: go through the blueprints again and check
  every piece of furniture is placed as drawn, create the missing ones
  (corner sofa, corner kitchen…); no weird errors in the models — pillows
  on sofas and beds must not fall forward, the white bed pillows must not
  have a flat plane in the middle; pillows natural as in the renders;
  bedrooms exactly like the listing's, shapes and textures; all interior
  details as the listing and the plans. Then: "This is now pretty good" —
  update the skill. → One §11 round (agents briefed as in `briefs.md`):
  nine read-only auditors (187 findings); five Blender and three placement
  builders in parallel copies merged with `git merge-file`; reseed and
  walk; six independent reviewers; a fix round; a final review (visual,
  A/B floors, C floors, integrity). Built: bed() without its headboard
  (`ld-headboard-*` wall pieces, `bedSet` with `BED_BASE`), 1.8 doubles in
  A/B and 1.4 in C, a draped runner, floating drawers, a two-capped wall
  light, twill wardrobes with walnut discs, opaque caramel curtains; corner
  (`sofa_corner`) and narrow-chaise sofas; L and U kitchens and the plans'
  straight runs; walk-in showers (with window openings), round tables,
  wall TVs, terrace pieces; every floor re-placed to the plans. Each review
  caught what the round before had passed: the white pillows' flat plane
  (a flange plate, a sharp-edged coarse grid, pillows through each other —
  now lens-profiled, smooth, touching); flat sofa pillows; sheers too
  clear; eight doors on the wrong jamb (swing names on walls flipped by
  `outside`); then, in the final review, a lounge chair's cushions leaning
  forward 23–28° (rotation sign and position), leaves at Door.js's 93.6°
  full open inside a washer, a WC and wardrobes and two leaves crossing
  (re-hung, narrowed or moved 2–3 cm), and C's first-floor front doors
  leaving 0.21 m beside the open leaf (the north flat's now opens onto the
  landing, hinged north; the south flat's stays as drawn). Also fixed:
  checker false positives (the staleness note compares validateScene's
  output; L/U kitchens and corner sofas checked as their shapes;
  `TALL_MIDDLE` for the window showers); the `planks` generator showing
  the gap colour at the start of rows staggered by more than a board
  (opt-in `cover`, on for `oak_honey` only); the terrazzo's seam (wrapped);
  L-shaped sofas over the collision budget walling off their L
  (`collision: "mesh"`); floating vanities at y + 0.34; pergola pendants
  1 cm up into the beams (flush tops z-fought). End: furniture-check A/B
  0 blockers, stairs-check 0 (5 C majors from before), every street flight
  passing, 84 of 85 doors walked both ways, z-fighting only on hidden
  faces, generator output equal to the scene with 0 notes. Declined or
  still short, for the user to choose: window frames bronze inside as well
  as out (the renders' are oak inside), inner reveals in the façade's
  render; the plan's U-turn roof stairs; the stone box's south wall 0.42 m
  short of the plan; A3/B3's south pergola and terrace extents and B's
  pool position; the A1 table seats four as the plan draws it (renders
  17/18 show six to eight); C's south-flat front door, left open, stands
  across the way to that flat's roof stair; the plans' tight spots (dining
  chairs a few cm off walls, the A2 side table 0.12 m off the sofa, C's bed
  feet 0.44–0.55 m from wardrobes); A1's floor plant and garden-window
  sheer (renders 17/18; only the sage flats get sheers). Found after the
  round by the new `models/` tools, not fixed: the lounge chair's mustard
  lumbar pillow 61 mm inside its back cushion (`contacts.py` FAIL), and
  `ld-kitchen-ochre-a1`'s terrazzo splashback in the plane of its shelf
  column's back panel (`coplanar.py` FAIL, a z-fight).

- **2026-10-03** — The user: "It looks pretty good now" after the
  walkability round; first update the skill with everything learned, then
  more improvements will follow. → This file reorganised around the method
  as it now runs ("Starting a new space", §0 hygiene, §8 walkable, §9
  flicker, §10–11 verification and review), `reference.md` rewritten from
  the code, `app-notes.md` for the app around a space, the session's
  checkers kept in `checks/` (aligned with the app: collision budget,
  layering, near plane) and `walk.js`; all checked by four critics against
  the code and the session's lessons. Found meanwhile: the user had edited
  Ladonia in their editor overnight (C's counter scaled to 0.8, C1's sofa
  nudged, a terrace sofa turned round) — kept; a reseed would lose them
  unless they are carried into the generator.

- **2026-10-02** — The user: lower C to street level beside its lane; fix
  the entrance steps through the stone walls (a piece of the entrance over
  them stopped the character climbing); fix all z-fighting; fix the
  furniture's positions and spacing, so the character passes every door
  and climbs to every floor, the order makes sense and nothing is crammed;
  let daylight in so the rooms are not too dark. → C at the street's level
  (`kit.js` vertical offset `Y()`, `C_Y` in `index.js`), its own path in
  from the parking; the garden paths stop at the top step, the retaining
  walls' ends inside the cheeks, the flights 2.58 m and solid; depth
  layering, near plane 5 cm and the geometric fixes (§9); doors 0.9 m,
  A1's bathroom 0.2 m deeper, the upper north core 0.3 m south (0.95 m
  corridor), guest WCs wider with outward doors and a hand basin, C4/C5
  bathrooms 0.32 m deeper and laid out in a row, C1's re-laid, low walls
  under the stairs, every door walked both ways in the browser; plain glass
  everywhere, indoor exposure 2.2. Still short: some bedrooms are small for
  a 2.4 m-wide bed set (C2/C3, C4/C5, the upper south flat's: a bed side or
  a wardrobe front 0.4–0.7 m); C's and the flats' compact stairs have no
  full landing at the head (you step off sideways); windowless bathrooms
  and halls are lit by the indoor light alone.

- **2026-10-02** — The user asked for Ladonia to look exactly like the
  listing's renders and blueprints, with maximum realism and a
  performance/quality slider, worked in rounds of builders and blind
  critics (§11). → Four rounds: structure and plan fixes in
  `scripts/spaces/ladonia/`, 113 `ld-` pieces modelled on the renders in
  `blender/lib/ladonia.py`, the slider (Utils/device.js, Realism.js,
  PostProcessing.js), and the finishes and light (§7); then one integration
  pass (open-air slabs are not "indoors", glass without transmission,
  crash-safe default step, Wrenfield's lawn). Still short: exterior glass
  and the pool reflect little (no outside probe or SSR); one sun can't
  light every render's faces (C's 13/14); interiors get no sun patches (the
  sun is ESE, A1's garden faces west); the dusk ground is near black; the
  cars are the app's models; plan details (A/B first-floor bathrooms,
  U-turn roof stairs, the pits under them) are simplified.

- **2026-10-02 (found)** — First furnished pass of Ladonia: 479 pieces in
  15 flats and their terraces, read off the plans and styled on renders
  17–22. Found along the way, now in §4, §7, §12: textured colours are
  sRGB; interiors needed the warm indoor share; openable fitted furniture
  was too many draw calls. Still short of the renders: no oak wall
  panelling or full-wall curtains, white walls rather than the renders'
  warm plaster, bathroom layouts approximate, and the live view isn't
  baked — publish with the bake for the renders' light.

- **2026-10-02** — Kosinožići Villas was an interpretation, not the real
  project. The user wants the listing built *exactly*: every building type
  in the gallery, their real plans, and fully furnished interiors
  (furniture, appliances, terrace furniture). → Rebuild from the listing's
  plans and renders (Ladonia Residence, konekt-nekretnine.hr project 253):
  §1–2; buildings A and B share a plan (B has the pool), C differs.

- **Earlier, in this repo** (Wrenfield, before the skill): downloaded
  furniture removed — everything generated in Blender at true scale for
  collisions; sinks and showers rebuilt as proper lofted fittings; every
  door left free and the house restructured where needed to be usable
  ("move staircases, windows, doors… freely" — for a fictional house only;
  a listing keeps its plans); stairs need room at the foot; the space under
  every flight closed or a cupboard; ceiling lamps as real fittings with
  wall switches; the grass and hills copied exactly from fluffytree-threejs
  when asked; a downloaded car model preferred over a hand-built one.

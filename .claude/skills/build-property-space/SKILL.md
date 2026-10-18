---
name: build-property-space
description: "Build a new walkable 3D space in this repo from a real-estate project — its listing page, floor plans and renders — as close to the real thing as the app can draw it: buildings, furnished interiors (every piece carrying what the app needs: opening parts, water anchors, seat and screen data), landscape, trees, grass, sky and lighting. Use when the user gives a property listing URL or reference images and asks for a space that looks like it, or asks to correct or improve such a space (its geometry, furniture, finishes, landscape). Carries the space corrections log; read it every time."
---

# Build a property space from a listing

The method for building a walkable space from a real-estate listing, and for
correcting one. The worked example throughout is Ladonia Residence in
Kosinožići: generator `scripts/spaces/ladonia/`, scene id
`kosinozici-villas` (the id is older than the folder name). Anything tagged
"Ladonia", or named after its buildings A, B and C, is that project's
value, not a rule.

Read **`history.md`** (the space corrections log) first, every time: its
general lessons are already folded into this skill's method (and the
people's into `../space-people/SKILL.md`); from its entries take what the
user cares about and the "Still short" lists, which are gaps not to
repeat. The user's standing terms — realism first, the frame rate as high
as possible, a listing built *exactly*, licences, never the user's server
on port 3000 or their `dist/`, never `scenes/wrenfield-house.json`,
scratch publishes, plan first — are in **CLAUDE.md**, which also says
where a new history entry and its lesson go. They apply throughout and are
not repeated here. Whenever the user says something about a space is
wrong, or you find something worth doing differently, add a dated entry
naming the project to `history.md` and fold its lesson into this skill's
method: edit the method, don't append duplicates.

## What this skill covers, and what is elsewhere

This skill is the space itself: the listing read, the plans measured, the
generator (`scripts/spaces/<project>/`), the buildings, the furniture
modelled in Blender and placed, the landscape, the look a space sets, the
space walked and checked, and the review rounds. The rest:

- people round the space, and the visitor's own clips: `../space-people/SKILL.md`;
- publishing a space's public view and baking it: `../publish-and-bake/SKILL.md`;
- how the public view is lit and drawn from its bake: `../baked-view-lighting/SKILL.md`;
- the editor and the world's building code (the validator, plain light and
  view scope, stand-ins, collision, lights and fittings, doors, finishes'
  generators): `../walkthrough-editor/SKILL.md`;
- what a visitor can do (E, Q, sitting, the televisions, opening furniture
  and windows, water, swimming, driving): `../visitor-interactions/SKILL.md`;
- test servers, the browser pane, the in-page tools, timing and speed, and
  big jobs as parallel lanes: `../app-testing-and-performance/SKILL.md`.

## The rules of this skill

- **Exact, from the listing**: build each building as its plans and
  renders show it, don't average; renders beat plans where they disagree;
  where the plans can't be followed (a door too narrow to walk through),
  deviate as little as possible and say so (`research-and-plans.md`).
- **Never lose the user's edits**: back up every scene before writing it,
  `cmp` before every later write, seed one id only (`npm run seed -- <id>`),
  diff before a reseed, patch a new field in by tool, never by hand or by
  reseed (`scene-safety.md`).
- **Never retune what another space uses** — a finish, a texture
  generator's defaults, the app-wide light values: add a space-specific
  finish or an opt-in option, and propose an app-wide change with the other
  spaces compared before and after (`buildings.md`, `finishes.md`,
  `light-and-look.md`).
- **Settle the site before furnishing**: each building's level, the
  street and lanes, the entrances — seeded and walked (`buildings.md`).
- **Furniture is modelled in Blender, not downloaded**, and every piece
  carries what the app needs: parts labelled for the prompt, a fridge's
  door labelled "fridge" and its light on the body, water, control and
  steam anchors, its seats in `seats.json`, a television's glass in
  `screens.json`; a re-export keeps its catalogue entry byte for byte
  (`furnishing.md`, `furniture-data.md`).
- **Measure, don't judge by eye**: plans scaled sheet by sheet, soft goods
  by `models/`, the walk by the checkers and in the page, light by mean
  luminance (`walkable.md`, `light-and-look.md`).
- **Say of every frame which it is**: plain (the editor's working light),
  lit live, or baked and in which mode; an editor tab is not what a
  visitor sees (`verifying.md`).
- All testing on a server of your own over scratch copies, never the
  user's (`../app-testing-and-performance/test-servers.md`).

## Starting a new space (in this order)

1. Read `history.md`.
2. Research the listing and enough of its plans to scope the job,
   read-only (`research-and-plans.md`).
3. Send the plan and wait for "do it": the buildings and flats counted,
   the site levels, streets and lanes, what the app can't draw, the Blender
   pieces needed, the milestones below, and your questions (people: the
   questions in `../space-people/SKILL.md`).
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
      summary, environment, garden` (all off, `landscape.md`), `landscape,
      rooms, walls, roofs, stairs, floor_openings, doors: [], vehicles,
      furniture, finishes: {}, spawns`). Write the listing's URL and API
      ids in its header comment so a later session can fetch them again.
   5. Register it in `scripts/seed-scenes.js` (an import and an
      `["<id>", <project>]` pair at the bottom; the kebab-case id is the
      `/?scene=<id>` URL — check `scenes/<id>.json` doesn't exist yet).
   6. `node -e "import('./scripts/spaces/<project>/index.js').then(() =>
      console.log('ok'))"`, then `npm run seed -- <id>`, and read its notes
      and counts (`scene-safety.md`).
   7. A views file (`<project>-views.js`, copied from
      `../app-testing-and-performance/ladonia-views.js` into that folder,
      which the sink serves: Tools below), a spots file for timing
      (`<project>-spots.js`, from
      `../app-testing-and-performance/ladonia-spots.js`;
      `../app-testing-and-performance/SKILL.md`) and your own copies of the
      checkers (`checks/README.md`).
5. Build in milestones, seeding and walking (`walkable.md`) after each:
   one building's shell; every building at its site level with the
   street, lanes and entrances; landscape; furniture; light; people, where
   the user wants them (`../space-people/SKILL.md`); then critic rounds
   (`review-rounds.md`).
6. Give every feature of the app what it needs of the space (since
   2026-10-16), and try each (`walkable.md`, items 6–9). What each feature
   does for the visitor is `../visitor-interactions/SKILL.md`.
   - **Windows that turn or tilt**: slim windows with sills of 0.3 m or
     more (`buildings.md`).
   - **Fronts that open**: modelled with parts, each labelled for the
     prompt; a fridge's door labelled exactly "fridge", for its light; the
     body under 12,000 triangles; swept against its piece and the scene
     (`furnishing.md`).
   - **Taps, showers and steam**: water, control and steam anchors on
     every wet piece (`furnishing.md`, `furniture-data.md`).
   - **Sitting and the televisions**: new pieces measured into
     `seats.json` and `screens.json` (`furnishing.md`).
   - **Swimming**: a pool's `steps` on the loungers' side (`landscape.md`),
     and the visitor's clips packed (`../space-people/SKILL.md`).
   - **Q**: a switch in every room.
   - **Driving from above**: a car and a terrain or ground plane
     (`walkable.md`, item 6).
   - **Speed**: what a new piece or feature costs, measured against HEAD
     at the same spots, both ways round
     (`../app-testing-and-performance/SKILL.md`).

## The method, by step

1. **Research the listing** exhaustively (the page, its JSON API,
   everything downloaded out of the repo, every image read at full size,
   every building's surroundings) — `research-and-plans.md`.
2. **Measure the plans** sheet by sheet, cross-checked two ways, on a
   gridded crop; record a measured JSON before the spec —
   `research-and-plans.md`.
3. **Build the buildings** as the spec's rooms, walls and roofs, each in
   its own frame; doors at least 0.9 m, stairs with landings, reveals in
   the façade's colour, slim windows where they open — `buildings.md`,
   with `generator.md`, `spec-fields.md`, `site.md` and
   `numbers-that-worked.md`.
4. **Furnish every unit** as the plans and renders show it: reuse, or
   model in Blender; fitted fronts that open; soft goods proved by
   measurement; placed from wall faces with floor to use each piece and
   nothing in a part's way — `furnishing.md`, with `furnish.md`,
   `furniture-catalogue.md`, `furniture-data.md`, `blender.md` and
   `blender-builders.md`.
5. **The landscape**: terrain, walls, paving, pergolas, planters, pools
   with steps, hedges, lawns, trees, lights, sky — `landscape.md`.
6. **Assets** from sources whose licence the user accepts: textures,
   skies, trees, cars — `assets.md`.
7. **Light and look**: the sun decided once; a space sets only its sky,
   tone mapping and exposure; no refractive glass; luminance measured —
   `light-and-look.md`.
8. **Make it walkable**: the checkers, every door walked both ways, leaves
   swept fully open, hands checked from the emitted wall, colliders looked
   at, everything pressable pressed, sat on, swum and jumped at, spawns on
   free floor — `walkable.md`, `in-page-audits.md`.
9. **No flicker**: layer what shares a plane, fix real overlaps
   geometrically, find the rest — `z-fighting.md`.
10. **Verify like a photographer**: the references' views rendered beside
    them, day and night, the public view, the walkthrough and the editor —
    `verifying.md`.
11. **Review rounds** for an exact match: blind critics, then auditors,
    builders in copies, independent reviewers, a fix round and a final
    review — `review-rounds.md`, `briefs.md`.

## Pitfalls that matter

- What a space can spoil: a room drawn without its window is "without
  daylight" and starts lit (`buildings.md`; `../baked-view-lighting/switches.md`);
  anything new drawn out of doors that
  is no collection's shows in the editor's House scope until `Scope.apply`
  hides it; a material drawn by a shader of its own must carry its data
  through a publish (`../publish-and-bake/publishing.md`); and something
  new that moves by itself inside a wall
  or a piece, or changes the picture with no event, is not seen by the
  editor's ray index, its stand-ins or its frames on demand until it says
  so (`../walkthrough-editor/rays-and-collision.md`,
  `../walkthrough-editor/stand-ins.md`, `../walkthrough-editor/frames-on-demand.md`).
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
- A door with something proud of its face (a pull, a handle), swung 90°
  about the face's outer corner, carries it back past the hinge line by
  its height: into an end wall, or into the next door. Swing it by
  atan(nearest point along the door / its height) at most (`_pull_swing`).
- The checkers carry the app's rules in copies of their own. When
  `SceneBuilder.collisionOf` changed (2026-10-16), `checks/_modes.mjs`
  was updated, but `furniture-check-c.mjs` and `stairs-check.mjs` walled
  every piece with parts in as its box until 2026-10-17 (Ladonia's C:
  ACCESS 12 → 13, NARROW 27 → 26 once mended). After changing how anything
  collides, grep `checks/` for the old rule (the rule itself:
  `../walkthrough-editor/rays-and-collision.md`, `furniture-catalogue.md`).
- `blender/lib/ladonia.py`'s `mirrored()` reverses an aimed light's aim.
  It turns each marker to (rx, −ry, −rz): right for a hinge and, with
  π − rz, for a slide. But an aimed fixture's X is its aim
  (`geometry.fixture`), and that comes out pointing back the wrong way.
  Build the other hand of a piece with a fridge or a spot by its
  builder's `hand=`, as the `-r` kitchens are.
- three.js, as a space's pieces meet it (`../walkthrough-editor/three-pitfalls.md`):
  keep paint and lacquer below 0.5 metalness (at 0.5+ it turns
  studio-silver); furniture loaded after the Environment must go through
  `applyReflections` (FurnitureLibrary does); a `THREE.Color` is linear —
  write it into a canvas with `color.getRGB(target, THREE.SRGBColorSpace)`
  or the texture comes out far too dark; never overwrite a meshopt-packed
  node's scale or position from the app — wrap it in a parent.
- Re-measure after exporting: `npm run seats` after a sofa, chair or
  lounger changes, `npm run screens -- --check` after any piece with a
  television (`seats.json` and `screens.json` are what the view reads).
- Keep the pool water's roughness over 0.1
  (`../visitor-interactions/pool-water.md`).
- What the bake makes of a space (`../publish-and-bake/baking.md`): a
  landscape's own trees are in no lightmap unless added to
  `scripts/bake-public.mjs`; a landscape's walls, planters and terrain go
  into the bake's `solids` and `coarseMaterials` before a final bake;
  hidden surfaces are cut out, not left under geometry; faces running
  inside the next wall, T-junctions and slivers, two-sided copies closer
  than 3 mm and fittings close to the ceiling show as bake faults
  (`buildings.md`); opening parts are never baked, so a new opening piece
  reaches a public view only after a publish and a bake
  (`furniture-data.md`).
- Before blaming your change for a fault you see, render the same pose on
  the previous published version: an old fault is a separate task, not a
  fix in passing (`in-page-audits.md`).

## Files in this folder

- `history.md` — the space corrections log, newest first; pointers to the
  later entries other skills keep; superseded measurements.
- `scene-safety.md` — scene backups, patching the user's scene, seeding one
  space, the user's own edits on record.
- `research-and-plans.md` — researching the listing (konekt-nekretnine.hr's
  API), downloads, measuring the plans per sheet.
- `buildings.md` — rooms, walls, roofs, doors, stairs, reveals, windows
  that open, finishes, lights, dark rooms, the site settled.
- `furnishing.md` — furnishing every unit: the catalogue, Blender, fronts
  that open, fridge lights, sweeps, wet pieces, seats and screens, soft
  goods, collision, model QA, placing, clearances, facing.
- `furniture-catalogue.md` — the catalogue's fields, a piece's lift, how it
  collides (mesh, box, shut boxes, ways in), lamps that give light, a new
  space's wet pieces.
- `furniture-data.md` — what a GLB carries for the app: parts that open
  (`opens` extras, labels, the sweeps) and water anchors.
- `blender.md` — Blender 5.1, its path, lib guards, shared joinery helpers,
  the material recipes, reshuffled textures, sheets against app colour.
- `blender-builders.md` — the `ld-` builders in `blender/lib/ladonia.py`.
- `finishes.md` — the finishes' texture generators and how to add to them.
- `landscape.md` — the landscape's method and its schema.
- `assets.md` — textures, skies, trees and cars: where from, how fetched.
- `light-and-look.md` — the sun, what a space sets of the look and what is
  app-wide, glass, indoors, measuring luminance, shadows on a larger site.
- `walkable.md` — the capsule, the checkers, the walk, doors, colliders,
  pressing, sitting, swimming, jumping, spawns, placement.
- `z-fighting.md` — depth precision, layering, geometric fixes, finding it.
- `verifying.md` — rendering against the references; what an editor tab
  shows; calibrating poses; other spaces.
- `in-page-audits.md` — door swing, placement and "what is that patch?" in
  the page.
- `review-rounds.md` — critic rounds and the interiors round's eight steps;
  what the rounds found.
- `briefs.md` — the agent briefs (a)–(g) of a round and the RESUMING
  preamble, with lessons on writing briefs.
- `generator.md` — the generator's files and kit.js's `Building`, its
  opening helpers, door swings and widening.
- `spec-fields.md` — the spec fields the validator keeps, and the heading
  conventions.
- `furnish.md` — furnish.js's helpers and facing.
- `site.md` — index.js: how Ladonia's site is assembled.
- `numbers-that-worked.md` — the generator's numbers that worked.
- `reference.md` — where each part of the old reference now is.
- `checks/README.md` — the static checkers, how to run each and what to
  change for a new project.
- `models/README.md` — model QA: commands and the readings that mean done.

Read `generator.md`, `spec-fields.md`, `furnish.md`, `site.md`,
`landscape.md` and `numbers-that-worked.md` before writing or changing a
space's scripts; `furniture-catalogue.md`, `furniture-data.md` and
`../visitor-interactions/opening-parts.md` before modelling a piece whose
fronts open; `buildings.md`, Windows that open, before choosing a space's
windows; `scene-safety.md`, `../walkthrough-editor/spec-and-validator.md`
and `../app-testing-and-performance/test-servers.md` before the first seed
and test session. Before placing people: `../space-people/SKILL.md`.
Before opening a test tab with anything in its link (a link's words, the
keys a browser keeps, the slider's steps): `../app-testing-and-performance/test-tabs.md`
(the index), `../walkthrough-editor/links-and-handles.md` and
`../baked-view-lighting/links-and-handles.md`. Publish options, bake
options and the manifest's lighting fields: `../publish-and-bake/publish-options.md`,
`../publish-and-bake/bake-options.md` and `../publish-and-bake/manifest.md`.

## Tools

In this folder (`<skill>` below is this folder,
`<repo>/.claude/skills/build-property-space`):

- `checks/` — node checkers run against the seeded scene (or the generator):
  furniture reach and spacing, every stair and route, the street steps,
  z-fighting, C at street level, and small GLB and plan helpers
  (`_glbbox`, `_glbparts`, `_modes`, `_plan`). `doors-dump.mjs` lists every
  hinged door with its emitted wall, side A, hinge point and where the
  leaf parks. `door-swing.mjs` sweeps each leaf to Door.js's full open
  against the furniture and the other leaves (`walkable.md`).
  `_hands.mjs <glb | catalog-id>…` gives each
  furniture part's label, shut box, hinge edge and swing or slide;
  `part-sweep.py <scene.json>` sweeps every placed part against the other
  pieces' boxes and the walls (`furnishing.md`). Run it with Blender's own
  `python3.13`, which has numpy. As shipped most of the others audit
  Ladonia; read `checks/README.md` before walking a space for how to run
  each and what to change for a new project. The people planner's checker,
  `people-plans.mjs`, is `../space-people/checks/`.
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
- `thumbs.py` — renders catalogue GLBs to PNGs in Blender, to look at new
  furniture before placing it (`<blender> --background --python
  <skill>/thumbs.py -- <out-dir> <id>…`; `furnishing.md`).
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
- `copy-merge.sh` — the parallel copies of the review rounds
  (`review-rounds.md`). `blender-copy` and
  `gen-copy` give an agent its own copy of `blender/` or of
  `scripts/spaces/<space>/`, keeping a pristine base once. `merge-blender`
  and `merge-gen` merge the copies back into the repo with `git
  merge-file` against that base and report conflicts.

In other skills' folders, used here (the in-page tools load through the
sink in a page of a test server, after `boot.js`:
`../app-testing-and-performance/tools.md`; the sink and the tools server
serve only the top-level files of `../app-testing-and-performance/`):

- `ladonia-views.js` (`../app-testing-and-performance/`) — in-page, after
  harness.js: the reference-matched poses (`__POSES`, keyed by gallery
  number), `__renderSet(prefix, keys)` and `__plans(prefix, which)`
  (top-down cuts 1.5 m above each floor). `__renderSet` turns an editor
  tab's realistic preview on first (`__K.realistic`); `__plans` draws the
  tab as it is lit — evenly, under the plain light, which is what a plan
  cut is read for. Make one per project: copy it as `<project>-views.js`
  into `../app-testing-and-performance/` (sink.py, which lives there,
  serves only that folder), replace `__POSES` with your references'
  cameras, change the night key in `__renderSet` (`"16"`) to your night
  reference, and rewrite `__plans`'s `at` table and default list (one
  entry per building and floor: centre x, centre z, floor y with the
  building's level, span). Keep your routes for `__walk.to()` there too.
  `checks/c-grade.mjs` reads Ladonia's from there by default (`--views`
  for another).
- `zfight.js` (`../app-testing-and-performance/`) — in-page:
  `__zfight({ limit })` finds coplanar or near coplanar triangles drawn on
  the same depth layer, clustered. It tests what is shown, so in an editor
  tab it first sets the view's scope to All for the page (the editor opens
  with the cars, the far ground and the neighbourhood hidden) — and it
  reads the scene's own meshes, passing over the stand-ins the editor
  draws them by (`verifying.md`; left in, every surface fights its own
  copy). With `z-fighting.md`.
- `walk.js` (`../app-testing-and-performance/`) — in-page: walks the real
  player physics through every door both ways and along routes
  (`__walk.doors()`, `__walk.to()`, `__walk.free()`). It walks the
  collision as it stands, and first finishes a tree an edit left being
  built a slice a frame (`sceneBuilder.settleCollision()`:
  `../walkthrough-editor/rays-and-collision.md`).
- `harness.js` (`__K`: poses, shots, `realistic()`, `scope()`), `boot.js`,
  `act.js`, `openables.js`, `sit.js`, `tv.js`, `pool.js`,
  `swim-checks.js`, `water.js`, `seat-sweep.js` / `.py`, `jump.js` and
  `compare.mjs` (`../app-testing-and-performance/`) — what `walkable.md`
  (items 6–9) and `verifying.md` run; `people-audit.js` is the people's
  (`../space-people/SKILL.md`).
- `patch-pool-steps.mjs` (`../visitor-interactions/`) — `node
  .claude/skills/visitor-interactions/patch-pool-steps.mjs <scene.json> [--pool b-pool]
  [--steps JSON] [--backup dir] [--dry-run]`: a seeded scene's pool given
  its `steps` and nothing else, without seeding it again (a backup first;
  refuses a file not as the server writes it, or one changed while it
  ran). Reload every editor tab on the scene first, and give it
  `--backup`: its default, `backups/` beside it, is in the repo and not
  git-ignored. The pattern it follows: `scene-safety.md`.

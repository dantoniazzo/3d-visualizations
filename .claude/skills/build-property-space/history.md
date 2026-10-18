# History: the space corrections log

Newest first. Each: what the user said, what was changed, where.

This is the log of the spaces themselves — their buildings, furniture,
landscape and look — for Ladonia Residence in Kosinožići (generator
`scripts/spaces/ladonia/`, scene `kosinozici-villas`) and, before it, the
repo's fictional Wrenfield house. Read it every time: its general lessons
are already folded into this skill's method (SKILL.md and its topic
files); from its entries take what the user cares about and the "Still
short" lists, which are gaps not to repeat. Where a new entry goes, and its
lesson: CLAUDE.md.

- **2026-10-18** — The user: "The skill file is too large, is it possible
  to split it into several better scoped skills?" → The one
  build-property-space skill (a SKILL.md of 3,229 lines, app-notes.md,
  reference.md, briefs.md, checks/) split into seven: this one keeps the
  space itself (research, buildings, furniture, landscape, look, walking,
  review rounds, its checkers and model tools); space-people,
  publish-and-bake, baked-view-lighting, walkthrough-editor,
  visitor-interactions and app-testing-and-performance took the rest, with
  their dated entries in their own history.md; the standing terms and an
  index of the skills went to CLAUDE.md. The in-page tools, the sink and
  the views files now live in `../app-testing-and-performance/`.

## The later entries, kept in other skills

The work from 2026-10-04/05 on was mostly on the app around a space; its
entries are in the history.md of the skill each concerns. What a space
builder needs of them:

- **2026-10-16/17, every front opens (the Blender side;
  `../visitor-interactions/history.md`)** — 475 parts in Ladonia's
  kitchens (13, with 4 counters, the peninsula and the outdoor kitchens),
  wardrobes, nightstands, sideboards, cabinet, media wall and TV-wall
  closets, washing machines and corner showers, each named for the prompt,
  the fridges integrated with a light; every part swept against its piece
  and against the scene; the catalogue's sizes byte for byte the same; the
  televisions' glass where it was; water, control and steam anchors on
  every wet piece (`blender/lib/ladonia.py`, `joinery.py`, `geometry.py`).
  The method is now in `furnishing.md`, `furniture-data.md` and
  `blender-builders.md`.
- **2026-10-16/17, the user's own edits since** (same file) — the scene
  saved again 2026-10-17 13:54Z, after the pool steps' patch, in their
  editor: five dining chairs moved or turned (a-f011, a-f116, b-f117,
  b-f119, b-f120) and b-f011 scaled to 0.88. Keep them
  (`scene-safety.md`). The seat sweep's starts and boxes
  (`ladonia-seat-starts.json`, `ladonia-w-boxes.json`, in
  `../app-testing-and-performance/`) were taken before these edits: take
  them again before the next sweep.
- **2026-10-16/17, Still short, for the space** (same file):
  - the placements stop 32 of 475 parts short (`furnishing.md`, step 5):
    A1's and B1's wall-unit doors and ld-media-ochre's top doors at the
    ceiling tracks' spots (a-f005, a-f038, b-f005, b-f041); the L kitchens'
    cupboard door beside the under-counter fridge (`door2` of a-f069 /
    b-f072, at −47.7° and −45.7°) at dining chairs a-f073 / b-f076 (the
    fridge's own door opens fully); the outdoor kitchens a-f171 / b-f174 at
    garden chairs; wardrobes at nightstands 0.38–0.5 m before them; the
    small vanities' drawers at the WC pans. `scenes/` was not touched for
    these: the user's to decide;
  - the 0.7 m walker does not fit the corner showers' 0.6 m doors
    (`furniture-catalogue.md`, a way in);
  - a hairline crack shows along the edge of Ladonia's 1 m terrain grid
    (x 76, z 78 / −62).
- **2026-10-04/05** (`../publish-and-bake/history.md`, with the bake's
  fixes) — the three model faults the final review of 2026-10-03/04 found
  fixed (the lounge lumbar inside its back cushion, the ochre kitchen's
  splashback coplanar with its shelf column, the bed runner floating),
  plus a garden chair's sling and cushion.

## Superseded measurements

- The checkers' run against the app as a whole (`checks/README.md`, as it
  read until 2026-10-18): "All nine checkers were run against the app as it
  stood on 2026-10-12, after the performance work: every one still ran,
  with Ladonia's results as the sections below record them (stairs-check 0
  blockers, 5 majors, 3 minors; door-swing 71 leaves, no contact over 5 mm
  on the mesh; every street flight passing; people-plans no problems over
  its seeds). One of them imports code the editor's work of 2026-10-13
  rewrote — `stairs-check.mjs` builds its trees with `Collision.js`'s
  `buildOctree` — and was run again on 2026-10-14: the same 0 blockers, 5
  majors and 3 minors, every flight and route OK. The others import only
  the validator, the catalogue, `Door.js` and the landscape, none of which
  that work touched." (The ninth, `people-plans.mjs`, is now
  `../space-people/checks/`.)
- `furniture-check-c.mjs` until 2026-10-17 still boxed every piece with a
  part that opens, walling off an L or U kitchen's floor and every
  wardrobe, nightstand and washer the walker passes: against that copy,
  Ladonia's C read ACCESS 12, NARROW 27; with the rule mended, ACCESS 13,
  NARROW 26 (`stairs-check.mjs` was mended the same day: SKILL.md,
  pitfalls).

## The entries of 2026-10-02 to 2026-10-03/04

Kept as they were written. Their § numbers are the old single SKILL.md's,
and "this file" is that SKILL.md: §0 is now `scene-safety.md` (and
`../app-testing-and-performance/test-servers.md`), §1–2
`research-and-plans.md`, §3 `buildings.md`, §4 `furnishing.md`, §7
`light-and-look.md`, §8 `walkable.md`, §9 `z-fighting.md`, §10
`verifying.md`, §11 `review-rounds.md` and §12
`../app-testing-and-performance/speed-architecture.md`; `reference.md` is
split into `generator.md`, `spec-fields.md`, `furnish.md`, `site.md`,
`landscape.md`, `numbers-that-worked.md` and `blender-builders.md`;
`app-notes.md` went to the seven skills, and `walk.js` to
`../app-testing-and-performance/`.

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

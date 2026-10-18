# Furnish every unit, as the plans and renders show it

The pieces are modelled in Blender (`blender.md`, `blender-builders.md`),
registered in the catalogue (`furniture-catalogue.md`), carry the data the
app reads (`furniture-data.md`) and are placed by `furnish.js`
(`furnish.md`). People on the furniture come last:
`../space-people/SKILL.md`.

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
   those (2–5 s a piece), then `npm run build` (into a scratch folder while
   work is in progress: `../app-testing-and-performance/test-servers.md`).
   Render thumbnails —
   `/Applications/Blender.app/Contents/MacOS/Blender --background --python
   <skill>/thumbs.py -- <scratch>/thumbs <id> <id> …` (Blender isn't on
   PATH; `<skill>` is this folder) — and look at every piece: check
   articulated parts' signs (a chair back reclines away from the seat, a
   lamp's shade points at the work).
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
     hinge line (why: SKILL.md, pitfalls); a wide low door a flap
     (`geometry.hinged(…, axis=(1, 0, 0))`). The dishwasher, the ovens,
     blind corners, fillers and the hob cabinet's flaps stay shut. A
     kitchen's fridge is integrated: its first `"fridge_col"`, else a base
     `"fridge"` beside the sink, else `"fridge_drawers"`. Label every part
     for the prompt (`geometry.hinged/sliding(label=)`: door, drawer,
     fridge, freezer, wardrobe, closet, washing machine, dryer, detergent
     drawer, shower door, microwave). The `opens` extras each moving part's
     node carries: `furniture-data.md`; how the app opens them, and how far:
     `../visitor-interactions/opening-parts.md`.
   - A fridge's light is a `g.fixture("light", at, { "light": { power,
     color, reach } }, aim=…)` on its body, never on a moving part. It
     follows the doors labelled exactly "fridge" (a freezer's "freezer",
     a cupboard's "door", so that they leave it off), or every part where
     none is; one light to a piece (`../visitor-interactions/opening-parts.md`,
     the light inside a piece).
   - Sweep every part shut to open against its own piece's static parts
     (`models/sweep.py`) *and* against the scene's other placements and
     walls (`checks/part-sweep.py`) before exporting: a piece alone hides
     the nightstand 0.4 m before a wardrobe, the ceiling track before
     cupboards to the ceiling, the chair before a kitchen
     (`furniture-data.md`, Parts that open). The other hand of a piece with
     a fridge or a spot is built by its builder's `hand=`, as the `-r`
     kitchens are, never by `ladonia.mirrored()` (SKILL.md, pitfalls).
   - Shut, a piece's parts are drawn with it, so it costs its materials,
     not its parts (`../app-testing-and-performance/speed-architecture.md`).
     Give a part glass only where the real piece has it: glass on a part
     draws itself, two-sided, in two renders, wherever it is in view,
     behind walls too (Ladonia's portholes and shower doors: 48 draws a
     frame at A1's living room).
   - Wet pieces carry the water, control and steam anchors their taps and
     showers run from (`furniture-data.md`, Water anchors;
     `furniture-catalogue.md`, a new space's wet pieces;
     `../visitor-interactions/water.md`): a wet piece without them has no
     water, and a shower without a steam box no steam.
   - Never move a television's glass; after exporting a piece with one,
     `npm run screens -- --check`.
   - Re-exporting a placed piece (to make its fronts open, or any change):
     its catalogue entry stays byte for byte (`git diff
     public/models/furniture/catalog.json` empty), because furnish.js and
     the saved scene placed it by that `size`. Its shut look stays too:
     render it shut before and after with its textures flattened to their
     mean (`models/openview.py --open 0 --flat 1`; re-exports reshuffle
     them, `blender.md`) and compare (`models/imgdiff.py`).
     Ladonia's kitchens differed by ≤ 0.03 % of their pixels, its
     wardrobes by ≤ 0.5 %, on the joints only. Try an export into a
     scratch folder first (`models/export_scratch.py`).
   - What a visitor uses needs its data (`seats.json` and `screens.json`
     are what the view reads):
     - A new piece one sits on needs `npm run seats -- <id>`: a piece
       missing from `seats.json` is no seat, for the people or the
       visitor. Run `npm run seats` again after a sofa, chair or lounger
       changes. A visitor sits only 0.3–0.62 m high (`SEAT_HEIGHT`: no
       bar stool). The file: `../space-people/people-data.md`; sitting:
       `../visitor-interactions/sitting-and-tv.md`.
     - Its catalogue id or name says how it is sat on. `lounge|daybed|club`
       is soft, and out of doors sat back in — but only where a loose
       pillow lies on it (`seats.json`'s `room` ≥ 0.5 m). `arm|lounge|club|
       desk` is a chair with arms, never sat on turned. A lone chair or
       stool may be turned, where that meets nothing.
     - A new television: its face an upright block of `tv_glass` (or
       `screen`) facing −z, at least 20 cm a side, then `npm run screens --
       <id>` to add it. `--check` (exit 1 when a screen moved, came or
       went) is for re-exports: re-run it after re-exporting any TV piece
       (`../visitor-interactions/sitting-and-tv.md`).
   - Curved fittings as lofted shells (`geometry.py` `rounded_rect` + `loft`,
     `sweep` + `catmull_rom` for taps and arms, `lathe`), not stacked boxes;
     parts that meet overlap 1–2 mm instead of sharing a face.
   - Wall-hung pieces get the `wall` anchor (the tuple's 5th element). Lamps
     carry a light tag (`furniture-catalogue.md`, Lamps).
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
     its body without them counts against the budget
     (`furniture-catalogue.md`, collision; the trees it lands in:
     `../walkthrough-editor/rays-and-collision.md`). Keep a fitted
     kitchen's body under 12,000 triangles, or its box walls off the floor
     inside an L's arms.
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
        mustard fronts; `blender.md`).

     `models/README.md` gives the readings that mean done.
3. **Place them in `furnish.js`** with helpers that take what the plan
   gives (`furnish.md`): `against(b, id, wall, face, along)` places from
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
5. **…with floor to use each piece** (`walkable.md`): a WC 0.6 m before it,
   a basin and a shower's door 0.7, a wardrobe 0.8, a bed's sides 0.6, a
   0.7 m way from the door to each, tables 0.75 off walls with doors in
   them, about 1 m before a kitchen. In a 1.2–1.5 m room put the fittings
   in one row along a wall and keep the other side clear (two fittings
   facing each other leave nothing between). Beds against inside walls,
   not across windows; nothing fitted across glazing; showers 1 cm off
   their walls; a towel rail or basin never in a door's way. A piece
   against the wall beside a door's hinge jamb stands about 6 cm + 2 cm
   clear of the jamb: a 0.9 m leaf fully open (93.6°) ends that far back
   past the jamb's line (`../walkthrough-editor/doors.md`); doors are
   audited fully open (t = 1, `in-page-audits.md`). Nothing in a part's
   way either: a door or drawer opens only until it meets something
   (`Openable.plan`), so a chair, nightstand or WC inside its swing reads
   as a broken door. Ladonia's placements left 32 of 475 parts stopping
   short (`../visitor-interactions/opening-parts.md`; listed by id in
   `history.md`):
   - keep a dining chair's back further from a cupboard's or an
     under-counter fridge's front than the door is wide;
   - keep the 0.8 m before a wardrobe clear: nightstands go beside its
     doors, not in front;
   - hang a ceiling track's spots further from cupboards to the ceiling
     than their doors are wide (A1's 1.12 m doors: 1.15 m; wall units:
     0.6 m);
   - keep a vanity's drawers clear of the WC beside it, and garden chairs
     clear of an outdoor kitchen's doors.

   In an editor tab, `../app-testing-and-performance/openables.js` checks
   a kitchen as fitted: `walkIn` at each part (stood 1.1 m out in front
   and walked straight at it, the part open or shut), `free` and
   `freeSpots` (where the capsule stands free between its arms), `place`
   for a hand-made trial fridge column or L kitchen (never saved;
   `removeTest()` after) and `sameTriangles` for the editor's tree against
   a publish's (`walkable.md`, item 7).

   Never scale a piece that has parts (a placement `scale` other than 1):
   its drawers slide scale × distance in the editor and distance in a
   public view.

Facing: a catalogue piece faces north (−z) at rotation 0 when modelled with
its front to Blender +Y (loose.py, ladonia.py); joinery.py's `wc`,
`washing-machine`, `wardrobe`, `nightstand`, `fridge`, `kitchen-run` and
`microwave` face south at 0 (`SOUTHWARD`); the corner `shower` has its
walls west and south and its door north at 0. `FACE = { N: 0, W: 90, S:
180, E: -90 }`.

People on the furniture (`../space-people/SKILL.md`) come after the
z-fighting pass (`z-fighting.md`): placed last, on the pieces as they
finally stand. Name a new space's rooms so the people planner reads them
right: a room named terrace, deck, roof, pool, garden… (`GATHERING`) is
twice as likely to hold a standing group, and one named as a way through —
parking, road, path, steps, entrance, hall… (`PASSING`) — holds none
(`../space-people/planner.md`).

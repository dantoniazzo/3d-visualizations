# Opening furniture: the app side of a piece's parts

What a visitor meets when a front opens (`World/Openables.js`,
`Openable.plan`, `Publish/Runtime.js`'s parts), since 2026-10-16 — wave B
added the parts that stop where something is in their way. Read it before
adding anything that opens, and before modelling a piece whose fronts
open (with the space side below).

The space side, which this file does not repeat:
- what each piece must carry for the app — `opens` extras on each moving
  part's node (geometry.hinged/sliding, `join_piece`), the labels (fridge,
  freezer, door, shower door …), one fixture light per piece hung on its
  body, opening pieces kept at scale 1, and the sweeps (`models/sweep.py`,
  `models/openview.py`, `checks/part-sweep.py`):
  `../build-property-space/furniture-data.md` (Blender, Parts that open)
  and `../build-property-space/furnishing.md` (§4);
- the builders' opening fronts (kitchens, wardrobes, the media wall's
  flaps, joinery's swings, `_pull_swing`, `mirrored()`):
  `../build-property-space/blender-builders.md`;
- how a piece with parts collides (`SceneBuilder.collisionOf`: its body
  and a shut box a part, `shutParts`, `shutProxy`, the ways in):
  `../build-property-space/furniture-catalogue.md`. Only the label
  "shower door" makes a way in, and it must be at least 0.75 m wide for
  the walker (the corner shower's 0.6 m door is not);
- door leaves of the building (`Door.update`, `BLOCKING_THRESHOLD` 0.3,
  `resolveDoorCollisions`, auditing a leaf fully open): the old "Doors"
  section's start, `../walkthrough-editor/doors.md`;
- offline, `checks/_modes.mjs` (the collision mode a piece gets) and
  `checks/part-sweep.py` (on Ladonia its hits equal the app's 32
  `Openable.plan` stops): `../build-property-space/checks/README.md`.

## The parts in the app

- **A published part moves in its piece's frame.** `Runtime.js` puts
  each part's holder in the world but leaves its `opens` (`direction`,
  `axis`) in its piece's frame. Since 2026-10-16 a publish writes each
  holder's `turn`, its parent frame's world quaternion, and the view turns
  the part's slide and hinge axis by it (`Openable.turnFrame`). A version
  without `turn` keeps the rule before: a drawer turned by its holder's
  quaternion (the piece's turn exactly, since `join_piece` never turns a
  part inside its piece), a door about world up. Before that rule 34 of
  Ladonia's 38 drawers slid into their vanity or sideways in a public view
  (a-f034's to z 4.641 where the editor's goes to 5.121). Checked: Wrenfield
  published to a scratch folder, and all 77 parts' world matrices at 0, ½
  and 1 open equal the editor's. Compare every part against the editor's,
  not one.
  - **Scaled pieces are not right yet** (found by reading, wave A; not
    made to happen): a slide's `distance` is in its parent's units. The
    holder carries the piece's scale in its own matrix but hangs in the
    world, and its direction is turned, never scaled — so a piece placed
    at scale s slides s × distance in the editor and distance in a public
    view, and its published `reach`, a share of the editor's travel, is
    then a share of the wrong length. Every opening piece in Ladonia and
    Wrenfield is at scale 1: keep it so (`../build-property-space/furnishing.md`,
    §4), or scale the
    direction by the holder's scale in `buildFromRuntime`.
- **The furniture's parts** (`World/Openables.js`): `opens: { type:
  "hinge"|"slide", angle?, direction?, distance?, axis?, label? }` on each
  moving part's node (geometry.join_piece,
  `../build-property-space/furniture-data.md`). `axis` is a hinge
  about any direction in the part's parent's frame, in app axes (default
  up; one that is no direction is up): a flap that lifts or drops
  (ld-media-ochre's console, `[1, 0, 0]`). `label` names it for the prompt
  ("Open fridge"): door, drawer, fridge, freezer, wardrobe, closet, washing
  machine, dryer, detergent drawer, shower door, microwave; empty or not a
  string, the type's word. A part eases open at 2.2 a second. Ladonia,
  lane B's GLBs: 475 parts — door 166, drawer 142, wardrobe 98, washing
  machine 21, detergent drawer 21, fridge 17, shower door 8, closet 2.
- **A part opens only as far as nothing blocks it** (`Openable.plan`,
  `clearance`; wave B of 2026-10-16), as a real door swung into a chair
  stops at the chair. The user's placements are not moved.
  - When a part starts to open from shut, it is tried against the
    collision trees (static, dynamic and outdoor; not the people's),
    leaving out its own piece. `SceneBuilder.ownTriangles` decides which
    triangles are the piece's own: in the editor, the kept tree's sources
    keyed by the piece's group or its parts' nodes; in a public view of a
    version without `reach`, the triangles labelled as the piece
    (`openables.room = { collision, own }`).
  - It opens to `reach`: the share of its swing or slide before it first
    meets something (`planned.met` names it).
  - Its shape is a box per mesh per 10 cm cell of its own frame (boxes
    inside another dropped), each shrunk 4 mm all round (`TOUCH`), so that
    touching is not blocking. One box round the whole part does not work:
    a wardrobe door's 4 cm pull at its free edge made the box 4 cm deep at
    the hinge too, and turning 5–10° pushed that edge into the wall the
    wardrobe stands against (37 false stops).
  - Poses are spaced so that the far corner moves no more than 5 mm
    (`STEP`; 240 at most), then 7 halvings. Triangles the part already
    meets while shut are passed over, and a cylinder round the hinge
    prunes the candidates. The result is kept on the part by the trees'
    revisions (`revision.static/dynamic/outdoor`): moving a chair 0.6 m
    mends the tree and the plan goes 0.530 → 0.933, back again 0.530.
  - A part that stops short starts at the same pace and settles sooner. A
    way in (a shower's door) bars the way until open × reach ≥ 0.3. A part
    caught on its way shut opens as far again.
  - Ladonia: 32 of 475 parts stop — exactly the scene sweep's 22 kitchen
    clashes and the 10 more (ld-media-ochre's top doors at track a-f005;
    wardrobe doors at nightstands; the small vanities' drawers at the WC),
    none falsely. In the L kitchens it is the cupboard door beside the
    under-counter fridge that stops (`door2`, labelled "door": a-f069 at
    −47.7° of −90°, b-f072 at −45.7°), its corner at the dining chair's
    back; the fridge's own door (`door1`) opens fully. Wrenfield: 6
    of 77 (wardrobe doors at a side wall at 97–103°, and the dressing
    room's two wardrobes' doors at each other). On E: 9.7 ms the first
    time (its shape built), about 1 ms after; 316 ms for all 475 cold.
  - **Published**: `Publish/Runtime.js` writes each part's `reach` on its
    holder (floored to 1e-4), worked out against the editor's exact
    trees, and the view takes it as it is (`Openable.published`; 0 ms).
    The view's own collision is the server's simplification, in which the
    spots and the chairs' arms stand a few cm off. A version published
    before (20261016T123730Z and earlier) works the stop out in the view,
    against that collision: 26 of Ladonia's 32 stop; the other 6 open
    fully, a few cm into the spots and the garden chairs, as before.
- **A part or a sash lands on its target** (`Openable.update`,
  `WindowSash.update`, 2026-10-16) in the step that comes within 1e-3 of
  it. Before, a step could leave it up to 0.001 short for good — a door
  0.2° open and "not moving" — never back at the rest pose that the
  editor's models and the public view's merging go by; about 3% of
  closes.
- **A part's child meshes have `matrixAutoUpdate` false** (`Openables.add`),
  and so have a sash's group, leaf, frame and pane: they never move
  against what moves them. Anything that moves one must call
  `updateMatrix` itself.
- **The light inside a piece** (`userData.fixture.light`, a fridge's) is
  on as far as the piece's doors labelled "fridge" are open, or any of its
  parts where none is (a kitchen's freezer and cupboards leave its fridge
  light off). Not a light each: **one light of each kind** (aimed, a spot;
  else a point), made with the first fixture of its kind and kept, lent
  to the fridge opened last of those lit (`Openables.pool`, `lend`,
  `lightOf(piece)`). three counts the lights that are there, not those
  that shine: Ladonia's 15 fridge lights, all shut at intensity 0, drew
  A1's kitchen in 19.2 ms where one takes 15.2–15.7 and none 14.9
  (public, unbaked, 1024 × 768, 2026-10-16); and a light that came and
  went with its fridge would make every lit material's shader again the
  first time a fridge opened. Lit as before: 0.239 at the column fridges,
  0.159 under the counters.
  - *A new piece with a light in it*: a `g.fixture("light", at, {
    "light": { power, color, reach } }, aim=…)` among its parts, which
    `join_piece` hangs on its body, never on a moving part. Aimed, it is
    lent the spot, else the point. It follows the piece's doors labelled
    exactly "fridge" (`Openables.link`), or every part where none is: label
    a freezer's door "freezer" and a cupboard's "door" so that they leave
    it off.
  - *One light to a piece*: two in one piece (two fridges side by side,
    each lit) would each follow all its fridge doors, and either door
    would light both. And of each kind only the fridge opened last of
    those lit shines (`relight`): two fridges open at once never both do.
  - Its see-through shelves go dark behind its shut doors only where they
    stand within the doors' face, behind them and no deeper than 0.9 m
    (`SceneBuilder.enclosedGlass`; `../baked-view-lighting/merged-house.md`,
    What shut doors hide).
- **Glass in a part** (a shower's door, a washer's porthole): a baked view
  keeps it to its reflections, like a room's fixed panes —
  `clearGlassIndoors` runs over the openable group too, and `tintOpenables`
  and `ProbeLight.dress` leave such glass alone (before the ProbeLight fix
  a shower's glass door drew as a milky sheet beside its clear fixed
  screen in a probe-lit view).
- **Testing** (all run on 2026-10-17, each as expected): `node
  scripts/test-openables.mjs` (46: motion, axes and labels, a published
  part against the editor's, the light lent round, shut boxes, the
  editor's tree against a publish's, an L's corner, a door stopped by a
  chair, a drawer by a WC, a pull kept off its wall, the plan's cache,
  ways in, the triangle–box test); `node scripts/test-shut.mjs` (31: the
  shut parts' and sashes' merging, lifting out and back, the live room's
  mark, what shut doors hide); `node scripts/test-windows.mjs` (30);
  `node scripts/test-standins.mjs` (19). In a page, `openables.js`
  (`../app-testing-and-performance/`; `../app-testing-and-performance/in-page-tools.md`;
  `__openables.stops()` is every part's plan and what stopped it). Offline,
  before a piece or a placement: the sweeps
  (`../build-property-space/furniture-data.md`, Parts that open).

## Elsewhere

- `collision.revision` (static, dynamic, outdoor), which `Openable.plan`
  caches by, and the trees it plans against:
  `../walkthrough-editor/rays-and-collision.md`.
- In a public view the shut parts are merged by material
  (`World/ShutBatcher.js`): a part leaves the merged mesh while it moves or
  stands open, and goes back when shut; a live room marks its meshes
  `userData.roomLive`. `../baked-view-lighting/merged-house.md`; its
  handle `sb.shutBatcher`: `../baked-view-lighting/links-and-handles.md`.
- The fridge's pooled light as a speed rule (one light of each kind lent
  round, out of the scene until one is opened, `LINGER` 4 s,
  `warmAll` / `warm` building its shaders and the shadow maps' ahead), part
  glass's cost, and "what nothing draws is never built"
  (`ShutBatcher.prepareOwn`, `Renderer.buildFor`):
  `../app-testing-and-performance/speed-architecture.md`.
- Glass in a part, in a baked view (`clearGlassIndoors`, `tintOpenables`,
  `ProbeLight.dress`, `SceneBuilder.enclosedGlass`):
  `../baked-view-lighting/merged-house.md`.
- A publish writes each holder's `turn` and `reach`, and versions up to
  20261016T123730Z work the stop out in the view:
  `../publish-and-bake/publishing.md`.
- The in-page check: `openables.js` (`__openables.stops()`, `everyE()`,
  `walkIn`, `freeSpots`, `sameTriangles`, `sashes()`), in
  `../app-testing-and-performance/`; the node tests `test-openables.mjs`
  and `test-shut.mjs`: `../app-testing-and-performance/node-tests.md`.

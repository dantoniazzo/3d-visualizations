# The furniture catalogue: entries, heights, collision, lamps, wet pieces

What a piece must be in the catalogue for the app to place, collide, light
and run it. Its GLB side (parts that open, water anchors) is
`furniture-data.md`; the builders are `blender-builders.md`.

## The catalogue, its height and its collision

- `public/models/furniture/catalog.json` is written by
  `blender/export_furniture.py` (`npm run furniture`). The app reads each
  item's `id` and `url`, and these fields:
  - `name`, the editor's label, and `category`;
  - `size`, [w, h, d] as it faces north, which furnish.js places by;
  - `scale` and `yaw`: FurnitureLibrary multiplies a placement's scale
    by `scale` and turns the model by `yaw`;
  - `enabled`: `false` drops the item on load;
  - `anchor` and `collision`, below.

  Register a piece in `PIECES` as `(id, label, category, build[, anchor][,
  {fields}])`. A trailing string is the anchor (`floor` by default). A
  dict is merged into the entry as it stands, e.g. `{"collision": "mesh"}`.
  `npm run furniture -- <prefix>` rebuilds the ids that start with a
  prefix, and any id not yet in the catalogue. It keeps every other entry
  as it was.
- The exporter centres each piece on its footprint and stands its lowest
  point on y = 0, whatever height it was modelled at: the double vanity is
  built from z 0.40 and its GLB starts at 0. A placement's y is where that
  lowest point goes, so a floating piece carries its lift in y:
  - joinery's `vanity` and `vanity-small`: +0.34;
  - Ladonia's walnut drawers: +0.28; its double vanity: +0.40;
  - headboards: +0.55; the wall light: +1.165;
  - TVs: +0.8 to +0.95; art: +1.0;
  - a ceiling piece: `top − height` (furnish.js `hang`).

  Name the lift in the catalogue label ("hang at y 0.28"). The anchor
  changes none of this; it matters only in the editor. `wall` and `ceiling`
  pieces get no gravity. A newly added `wall` piece starts 1.4 m up and a
  `ceiling` one with its top at 2.7 m. A floating `floor` piece keeps its
  height when dragged level, because gravity holds only a piece that starts
  within 3 cm of a support. "Drop to surface" does put it on the floor.
  The checkers sort pieces by anchor, so don't change an anchor to avoid
  that.
- How a piece collides is decided by `SceneBuilder.collisionOf` — for the
  tree the visitor walks against (`dynamicCollisionSources`,
  `../walkthrough-editor/rays-and-collision.md`) and, by
  `dynamicCollisionRoots`, for a publish's runtime file:
  - pieces flatter than `FLAT_HEIGHT` (3.5 cm: rugs) and `collision:
    "none"` are left out;
  - a piece collides as its own triangles up to `MESH_COLLISION_BUDGET`
    (12000, counted over the loaded model), and over it as its local
    bounding box, turned with it;
  - the catalogue's `collision: "mesh"` or `"box"` forces either;
  - a piece with parts that open (`userData.opens`) collides, since
    2026-10-16, as its mesh **without** those parts plus one box per part
    where it stands shut. The parts move, so `isTransient` already keeps
    them out of every tree. `Openables.js`'s `shutParts` gives each part's
    rest pose under its parent and its box from its own meshes' local
    matrices (opening it changes no digit of it); `shutProxy` makes that
    box a mesh. Only the triangles without the parts count against the
    budget; over it, or forced `"box"`, the piece is its whole box, shut
    (`shutBox`). Each box stays where its part is shut, open or not, so an
    open cupboard is not walked into, and an open door is walked through
    like a room's door swung open. Before, every such piece was its whole
    box: an L or U kitchen walled off the floor inside its arms (a test L's
    corner, 1 m from both runs, is now reached to 0.02 m where the visitor
    stopped 2.32 m short; Ladonia's a-f069 has 6 free spots between its
    arms at a 0.25 m step, the U a-f152 23, as a box none). Forcing
    `"mesh"` let the visitor through an open door into the hollow carcass;
    that is safe now.
  - A **way in** — a part labelled `"shower door"` (`Openables.js`'s
    `WAYS_IN`, `isWayIn`; `Openable.wayIn`) — has no box: shut and until it
    is open 0.3 it bars the way as a room door's leaf does
    (`Openable.getBlockers()`, its shut box, pushed out of by
    `Door.resolveCapsule` in `SceneBuilder.resolveDoorCollisions`), and is
    walked through once open; the colliders view (C) draws it as a door.
    It is in neither the editor's tree nor what a publish collides.
    Ladonia's 8 corner showers' doors are; the walker (0.7 m) still does
    not fit their 0.6 m opening (open, the capsule goes 0.22–0.24 m into
    where the box was, and no further). **Only the label "shower door"
    makes a way in** (`WAYS_IN`): a new door a visitor steps through (a
    sauna's glass door, a walk-in wardrobe's) must carry it or add its own
    label there, or its shut box stays where it is shut and blocks the way
    when open. And a way in is a way only if the walker fits it — 0.75 m
    at least for the 0.7 m capsule: joinery's corner `shower` (0.6 m) is
    looked into, not stepped into, so a shower the visitor is to stand in
    (its rain on their head) is a walk-in (`ld-shower-walkin`, open along
    its front) or has a wider door.
  - The part boxes are sources of the furniture's kept tree, keyed by each
    part's node, among the boxed pieces in the pieces' order, so the
    editor's tree is the one `buildOctree` makes over
    `dynamicCollisionRoots`, which is what a publish collides: Ladonia with
    lane B's 475 parts 971,018 = 971,018 triangles, 517 box sources = 517
    proxies, hash equal (Wrenfield 71,118 = 71,118). Opening a part changes
    no source (the keeper says "same").
  - Ladonia's 170 pieces with parts that open are all mesh plus boxes
    (`checks/_modes.mjs <id> …` prints each: e.g. ld-kitchen-ochre-l 2,896
    triangles without its parts, + 10 shut boxes; the largest kitchen body
    5.9k). A piece whose body without its parts passes 12,000 is still its
    whole box and walls off an L's floor: give it `"mesh"` or keep it lean.

  A box covers floor the piece doesn't. The inside of an L-shaped sofa,
  where the plans put the coffee table, became a wall the walker couldn't
  pass. Ladonia's chaise and corner sofas have 14–21k triangles with their
  cushions, so all of them carry `"mesh"`. Its beds (14–24k since the
  2026-10-03/04 pillows: the doubles 19.5–24k, the singles 14–15.5k)
  collide as boxes. That works because the
  headboard is a separate wall piece, so a bed's box is only the bed.
  `checks/_modes.mjs <id> …` prints each piece's count and mode. Since
  2026-10-16 Ladonia's kitchens, wardrobes and storage open (no piece is
  exported shut any more: `_fixed` is gone, `blender.md`). After a
  catalogue change, build again (the catalogue is copied into the build:
  where a test server's build goes is
  `../app-testing-and-performance/test-servers.md`) and restart the test
  server.

## Lamps: a catalogue piece that gives light

The room's own ceiling fitting, its wall switch, lights switched live and
where a visitor points at a lamp are the app's:
`../walkthrough-editor/lights-and-fittings.md`.

- A catalogue lamp gives light (bake, switches, live lights) only with a
  node extra `light: { at, power, color, glow, radius[, room] }` in the
  node's own Blender coordinates; `glow` is the material of its bulb or
  glass (default `linen_white`), `radius` how far from `at` that glass
  reaches (default 0.022), `room: true` puts it on its room's ceiling
  switch (a pendant, a wall light, a track — part of the room's lighting),
  else it gets a switch of its own (a bedside or table lamp).
  - Ladonia's 11 lamp pieces carry them (2026-10-05): in `ladonia.py`, a
    builder returns `_lit(parts, _light(glow_part, W, BULB|LED))` (`BULB`
    #ffcf99, 2700 K; `LED` #ffd6a3, the ceiling fittings'), `_light` sets
    `at` at the glow part's centre and `radius` to its farthest vertex, and
    `export_furniture.py`'s `LD.place_lights(obj, shift)` moves the lights
    with the piece's re-centring. A track has one light per head, each on
    a child node `<id>.lightN` (one summed light would need a 1.9 m bulb).
  - Give every lamp's glow material a name only that piece uses (`_glow`
    renames a copy): a publish numbers a second model's same-named
    material `name#1`, and the bake matches bulbs by exact name. Wrenfield's
    lamps (`furnish.py`'s `_lamp`) still use `linen_white`.
  - A light *inside* a piece (`fixture.light`, a fridge's) is not one of
    these: it is lit as its doors open (`furniture-data.md`, Parts that
    open; `../visitor-interactions/opening-parts.md`, the light inside a
    piece).
  - Model shades open at the light's end; keep bulbs and glass vertex-lit.
    `part_bulbs` takes a glow face only if all its vertices are within
    `radius` + 1.2 cm of a light — a long diffuser needs a long radius, and
    the live view caps a lamp light's offset below `at` at 5 cm
    (LampPool, `../walkthrough-editor/lights-and-fittings.md`) so a wall
    light's light doesn't land in the headboard.

## A new space's wet pieces, as Water reads them

How the taps, showers and steam run: `../visitor-interactions/water.md`.
The anchors themselves: `furniture-data.md`, Water anchors.

- a steam box steams only with a rain outlet of its own piece that is
  `hot` (outdoor showers and sinks run cold and have no steam box);
- its spill over the top keeps to its room's polygon (`roomAt` at the
  tray, `spillOf`) and stays under the room's ceiling (its elevation +
  height); an enclosure in no room spreads `SPILL` 0.9 m every way,
  through any wall, under a ceiling 0.7 m over its top;
- the glass door's mist needs the part labelled "shower door" in the
  same piece, its glass a material named /glass/ or transparent (the
  largest such box: `doorOf`);
- a control whose `for` takes in a rain outlet is a shower, any other a
  tap;
- indoors is a room whose `ceiling_finish` is not "none" (lit by its
  own probes there);
- a public view has water only from a version published since the
  anchors (`Publish/Runtime.js` copies the fixture nodes;
  `../app-testing-and-performance/water.js`'s `__water.inject()` puts them
  into an older one, in the page alone).

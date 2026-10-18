# Build the buildings as the spec's rooms, walls and roofs

The generator lives in `scripts/spaces/<project>/` — `kit.js` (a `Building`
in its own frame), one file per building design, `furnish.js`, and
`index.js` (site, gardens, landscape) — seeded by `scripts/seed-scenes.js`.
Signatures and numbers: `generator.md` (kit.js), `spec-fields.md` (what
the validator keeps), `site.md` (index.js) and `numbers-that-worked.md`.

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
  cut (`__plans`, the views file: `verifying.md`): every room's walls
  should show its own finish on all four sides (a swapped `finish`/`back`
  is easy to miss in code).
- Partition heights come from the storey: `h = storey − 0.02` for walls
  thinner than 0.3 m (out of the floor above's plane), full height where
  the wall stands beside an open-air space (the 2 cm would be a slit).
  Rooms are `storey − 0.25` high.
- Room polygons on one level never overlap (L-shapes where one wraps
  another): the floors z-fight as black stripes and the editor files
  fittings under the wrong room.
- Doors: at least 0.9 m (`kit.js` widens narrower ones where the wall has
  room); hinged doors open into the room they serve, never across a
  corridor or hall; small WCs' doors open outwards. A door squeezed between
  cross walls is narrower and says so (`door(…, { fit: true })`), or its
  lining runs out of the wall's end. Which jamb each swing name hinges on:
  `generator.md` (Swing); how the app hangs and opens a leaf:
  `../walkthrough-editor/doors.md`.
- Stairs: at least 0.9 m wide, ~2.1 m clear above the pitch line, a landing
  at least 1 m deep in line with the head or a side exit wider than 0.9 m
  (0.70 equals the walker), at least 1.1 m before the foot, no door onto a
  stairwell. Check the climb direction of any N/S flight (kit's mapping is
  inverted, see SKILL.md, "Starting a new space"). A flight over a bathroom
  gets a low wall under it (to the steps' underside, 1.65 m in Ladonia) and
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
- **Lights**: every light needs a visible fitting where it is — the app
  gives each indoor room one ceiling fitting and a wall switch. Use
  `room.fitting: "recessed"` where the design hangs its own pendants or
  tracks, and never put a second light under the space's own pendant
  (`../walkthrough-editor/lights-and-fittings.md`).
- **Rooms daylight does not reach**: windowless rooms bake black by day, so
  by day they start with their ceiling light on. Which rooms those are is
  read from the spec — a room with no window, glazed door or open doorway
  to the outdoors, not one space with a room that has one (`openPairs`) —
  so a new space's dark rooms follow from its plan
  (`../baked-view-lighting/switches.md`, `darkRooms`). A room drawn
  without its window is "without daylight" and starts lit.
- **Windows that open** (`World/Sash.js` `windowOpens`; the app side:
  `../visitor-interactions/windows.md`). Only a slim window
  (`style: "slim"`) opens.
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
    The field as the validator keeps it: `spec-fields.md`, Openings.
  - `hinge: "left"` is towards the wall's emitted start, as a door's swing
    is named, and `outside` turns it round: check it against the seeded
    wall's `start` and `end` (`checks/doors-dump.mjs` gives them for
    doors, not windows).
  - Whatever stands beside a window makes it tilt: a wardrobe, a
    headboard, a wall unit, a tap. Ladonia turns 41 of its 59 sashes and
    tilts 18. List the tilts after furnishing (`walkable.md`, item 7).
- Photographed finishes in `shared/catalog.js` via `pbr(id)` with `tint`
  (linear, may brighten) or `color` (fetching textures: `assets.md`). Never
  retune a finish or generator default another space uses: add a
  space-specific finish (`oak_honey`) or an opt-in option (`soft: true`;
  `finishes.md`). A new room finish must match Sky.js's `ROOM` pattern:
  give it one of its prefixes (`limewash_`, `paint_`, `oak_`, …) rather
  than widening the regex, which is app-wide (`light-and-look.md`; how the
  baked view reads `ROOM` and `GLASS`: `../baked-view-lighting/SKILL.md`).
  In a baked view a material keeps its finish texture only if its name is
  exactly a catalogue finish id (`../baked-view-lighting/baked-drawing.md`).
- A new spec field may need the validator
  (`../walkthrough-editor/spec-and-validator.md`).
- **Settle the site before furnishing**: each building's level (`oy`), the
  street and lanes (`research-and-plans.md`, step 6), the entrance flights
  or paths — seeded and walked. Getting a level wrong late moved all of
  Ladonia's C and its furniture.
- **What the bake makes of the modelling** (`../publish-and-bake/baking.md`,
  known bake faults): faces running on inside the next wall bake dark
  corners and lines; T-junctions and slivers bake seams; two-sided copies
  must stand 3 mm apart or light leaks through; fittings close to the
  ceiling raise a switch's lightmap scale and bake a hot halo; a surface
  hidden under other geometry bakes black and bleeds — cut it out (holes)
  rather than leave it underneath. Wall linings, thresholds and reveals are
  given to a room by the bake's `face_zones` rules, so a modelling choice
  can leave faces "outside" (`../publish-and-bake/bake-light-files.md`).

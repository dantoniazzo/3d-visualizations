# What a piece carries for the app: parts that open, water anchors

The GLB side of opening furniture and running water: what the Blender
builders must write into each piece. The app side — how `Openables.link`
reads the labels and opens a part only as far as nothing blocks, and how
`World/Water.js` runs a tap — is `../visitor-interactions/opening-parts.md`
and `../visitor-interactions/water.md`. The in-page check
`__openables.stops()` is `../app-testing-and-performance/openables.js`.

- **Parts that open** (`geometry.hinged(…, label, axis)`,
  `geometry.sliding(…, label)`): each moving part is its own `opens` unit,
  its node's origin on its hinge and never turned inside its piece;
  `join_piece` writes `opens: { type, angle | direction, distance, axis?,
  label }` into the node's extras (`../visitor-interactions/opening-parts.md`,
  the furniture's parts). `axis`
  (a flap: `axis=(1, 0, 0)`) is written in app axes. `label` is what the
  prompt calls it, and the light inside a piece follows only its doors
  labelled exactly `"fridge"` (any of its parts where none is): label a
  freezer's door `"freezer"` and a cupboard's `"door"` so that they leave
  it off (`Openables.link`; joinery's fridge-freezer does). Since
  2026-10-16 every front of Ladonia's fitted pieces opens (`_fixed` is
  gone): sweep every part from shut to open before exporting — against
  its own piece's static parts with `models/sweep.py` (18 poses, faces
  every 2 cm, 2 mm tolerance, `PLANES=1`; Ladonia's 33 storage pieces in
  23 s), and against the scene's other placements' catalogue boxes and
  walls with `checks/part-sweep.py` (5 mm; Ladonia 5 min 15 s); then in
  the page `__openables.stops()` (openables.js), which found exactly the
  scene sweep's hits — 22 in the kitchens and 10 more. The sweeps found
  the U kitchen's fridge door in its back leg's worktop (8.9 mm), the
  vanity's top drawer through its counter (3.4 mm), the fridge's bins in
  its shelves and the wardrobe pulls in end walls. Look at each piece
  open as well as shut (`models/openview.py --open 1`): the hinge side,
  the swing's sign and the inside.
  - One fixture light to a piece, hung on its body, never on a moving part
    (`furnishing.md`). Keep every opening piece at placement scale 1.
  - The parts are never baked: the body is baked as seen with its doors
    open, and new opening pieces reach a public view only after a publish
    and a bake (`../publish-and-bake/baking.md`, furniture with parts that
    open).
- **Water anchors** (what `World/Water.js` runs the taps, showers and
  steam from: `../visitor-interactions/water.md`; 2026-10-16, lane B):
  empties kept by `join_piece` as node extras
  `fixture`, named `<piece>.water_<group>`, `.control_<group>`, `.steam`.
  Positions only: such a node has no turn of its own (its world rotation is
  its piece's, `ladonia.mirrored` flips rotations), and its sizes are given
  in the piece's app axes, turned so by `join_piece`'s `_in_app_axes`;
  gravity is −y.
  - `water: { kind: "tap"|"rain", fall, land: [w, d], hot, group, r |
    size }` at each outlet: `fall` metres to the bowl's or tray's floor
    (a ray straight down from each Ladonia anchor meets its piece within
    2–6 mm of it; the outdoor shower's passes a slat gap), `land` the wet
    area, `r` an outlet's or round head's radius, `size` a square head's.
  - `control: { for: [group…], half: [x, y, z] }` at each tap body or
    shower valve: the pick box's half-size (the tap's box + 1 cm), 0.10–0.14
    m from its outlet, 1.0–1.16 m from a shower head.
  - `steam: { half: [x, y, z], screens: [[x0, x1, z0, z1]…] }` at each
    indoor shower enclosure's middle: the fixed panes' plan footprints
    relative to the node, each the box's full height. A shower's glass door
    is its part labelled "shower door", not a screen.
  - Helpers: `geometry.water(at, kind, fall, land, group, hot, r|size)`,
    `control(at, groups, half)` / `control_round(lo, hi, groups)`,
    `steam(at, half, screens)`; a wet helper takes the `floor` its water
    falls to (`joinery.basin_mixer`, `tap`, `_shower_kit`;
    `ladonia._gooseneck`, `_vessel_tap`). Groups are basin / basin1 /
    basin2, sink and rain; outdoor kitchens and the outdoor shower run cold.
  - Ladonia: 70 water (51 taps — 23 basins, 15 kitchen sinks, 13 outdoor
    sinks — and 19 rain heads, 15 indoor and 4 outdoor), 53 hot, 17 cold;
    70 controls; 15 steam boxes. kitchen-run has none (its catalogue build
    has no sink, and a tap would change its height); `bath` none (a solid
    block, Ashgrove's only).
  - What Water makes of the anchors in a new space (steam boxes, spills,
    mist, shower or tap, indoors, older publishes):
    `furniture-catalogue.md`, a new space's wet pieces. Draw them on a
    render with `FIX=1 models/openview.py`.

Tools: `models/sweep.py`, `models/openview.py`, `models/imgdiff.py`,
`models/export_scratch.py` (`models/README.md`), `checks/part-sweep.py`
and `checks/_hands.mjs` (`checks/README.md`).

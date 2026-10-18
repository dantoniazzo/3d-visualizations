# furnish.js: helpers and facing

Ladonia's `scripts/spaces/ladonia/furnish.js`, as the code stands: copy its helpers (everything above `furnishAB`) for a new project and replace the `ld-` ids they hard-code (SKILL.md, "Starting a new space", step 4.3). The method of furnishing is `furnishing.md`.

All placement is in the building's own frame. `y` is the floor in that frame: 0, then 3.0 and 6.0 for A/B, or 3.2 and 6.4 for C. kit's `Y` adds the building's level.

**Facing**
- `FACE = { N: 0, W: 90, S: 180, E: -90 }` (kit.js). A catalogue piece faces north at rotation 0.
- `SOUTHWARD` lists the joinery.py pieces that face south at rotation 0: `wc`, `washing-machine`, `fridge`, `kitchen-run`, `nightstand`, `wardrobe`, `microwave`. furnish's `put` adds 180° for these, so every call simply says which way the piece faces.
- The `ld-` pieces, including `ld-wardrobe-*` and `ld-nightstand*`, face north.
- `AWAY = { N: "S", S: "N", W: "E", E: "W" }`.
- The corner `shower` is 0.98 × 0.9 m:
  - rotation 0: walls on its west and south, door to the north;
  - 90: walls south and east, door west;
  - 180: walls east and north, door south;
  - −90: walls north and west, door east.

  A handed shower can't be mirrored by turning it. Place it in each flat separately.
- Sizes come from `public/models/furniture/catalog.json` (`SIZE[id]` = [w, h, d] facing north). An unknown id throws an error, so run `npm run furniture` first.

```
put(b, id, x, z, face = "N", y = 0, scale = 1)
against(b, id, wall, line, at, { y = 0, gap = 0, scale = 1 })
kitchen(b, scheme, length, wall, line, from, { tall = "lo", y = 0 })
hang(b, id, x, z, top)
dining(b, table, chair, x, z, { along = "x", per = 3, y = 0, pitch = 0.62, tuck = 0.12 })
roundSet(b, table, chair, x, z, { n = 4, start = 45, y = 0 })
mirrored(b, axis)                          // → { put, against, kitchen, hang, dining, roundSet }; plain = unmirrored
                                           //   (its put takes no scale)
bedSet(f, b, id, wall, line, at, { y = 0, long = false, hb = at, panel = HEADBOARD[id], stand = "ld-nightstand-60", stands = true, light = true })
smallTable(f, b, L, x, z, { along = "x", y = 0 })   // defined, not used yet
gardenTable(b, x, z, { y = 0, top = null })
loungePair(b, x, z, face, { y = 0, along = "x" })
```

**`against`**
- `wall` is the side the piece's back is to (N/S/E/W).
- `line` is that wall's face: a z value for N or S, an x value for E or W.
- `at` is where the piece's middle sits along the wall.
- The piece stands at `line ± (depth / 2 + gap)` and faces `AWAY[wall]`. Curtains use `gap: 0.02`.

**`kitchen`**
- It places `ld-kitchen-<scheme>-<length×10>[-r]`. Lengths are 2.4, 3.0, 3.6, 4.2 and 4.8 m; schemes are `ochre` and `sage`.
- The run starts at `from` along the wall. `tall` puts the tall units at the low or high end of the wall's axis.
- The pieces have their tall units at their own left, so furnish.js's `kitchen` picks `-r` when the units must be at the other end.
- Ladonia places none of these generic runs: every kitchen is one built to its plan and placed with `against` — `ld-kitchen-<scheme>-a1`, `-a2`, `-40n`, `ld-kitchen-sage-c1`, `-c2` (`-c2-r` for C3), and the L corner `ld-kitchen-<scheme>-l` — or, the U, with `put(b, id, 9.34, 11.44, "W", F)` at the one spot it was built for. The catalogue's counters are `ld-counter-<scheme>-18|24` (base units with sink and hob), `-hob-24`, `-sink-18`, `-sink-20` (doors first, a low upstand), `-plain-22` (under a window) and `ld-counter-sage-low-24[-r]` (C's, glazing behind); Ladonia places only `-plain-22` (beside the 40n run) and `ld-counter-sage-low-24` (through `mirrored`, so `-r` too).

**The other helpers**
- **`hang`** puts the piece's top at `top`. Under a pergola, hang it from the pergola's top plus 0.01 (`R + 2.46` under a 2.45 m roof pergola), so the pendant's top runs 1 cm into the beams and louvres rather than meeting a face flush, which z-fights. The ground pergolas' pendants hang from 2.7 under their 2.75 m top, among the louvres.
- **`dining`** sets the table facing N (along x) or W (along z). Chairs go `per` a side, `pitch` apart, each pushed `tuck` under the table's edge (the chair's middle at half the table's depth plus half its own, less `tuck`): 0.12 by default, 0.155 at A/B's 1.4 m four-seaters, 0.3–0.35 in C, as its plans draw them.
- **`roundSet`** puts chairs at the table's radius plus half a chair depth, less 0.12. The first chair sits at `start`° (0 is south of the table) and each faces the middle.
- **`mirrored(b, axis)`** maps z to `2·axis − z` and swaps N and S. Numeric faces become `180 − face`, and a round set's `start` becomes `180 − start`. `against` on an N or S wall swaps the wall and mirrors `line`; on an E or W wall it mirrors `at`. `kitchen` on an E or W wall starts from `2·axis − (from + length)` with `tall` swapped.
  - Its `hand(id)` swaps a handed piece for its other hand: `shower` ↔ `shower-m`, any id ending `-chaise-l` ↔ `-chaise-r`, and `-r` added to or taken off `ld-kitchen-sage-c2`, `ld-shower-walkin-c2` and `ld-counter-sage-low-24`. Any other handed piece goes through unchanged, so it comes out wrong-handed: the corner sofas, the L and U kitchens, the other walk-in showers, and `ld-out-kitchen` (whose other hand is `ld-out-kitchen-r`). Build its other hand and add it to `hand`, or place it per flat.
  - Functions that take `f` (`bedSet`, `smallTable`, `endFlat`, `upperEnd`) work through either `plain` or a mirrored set.
  - C's flats are mirrored about axis 6.75.
- **`HEADBOARD`** maps each bed to its felt headboard: `ld-bed` → `ld-headboard-210`, `ld-bed-sage` → `-210-sage`, `ld-bed-sage-160` → `-180-sage`, `ld-bed-sage-140` → `-160-sage`, `ld-bed-single` → `-110`, `ld-bed-single-80` → `-90-sage`. **`BED_BASE`** is each bed's platform width (the mattress plus 4 cm): 1.84, 1.84, 1.64, 1.44, 0.94 and 0.84. The catalogue width is wider, because it includes the duvet's overhang (1.97 for a 1.8 m bed).
- **`bedSet`** hangs the headboard (`panel`, `HEADBOARD[id]` by default) against the wall at y + 0.55, centred at `hb` (the head wall's middle where the render centres it there), and puts the bed 4 cm off the wall. Either side it puts a floating walnut drawer (`stand`, 0.15 tall) at y + 0.28, 1 cm off the platform (`BED_BASE`). `long` puts an `ld-nightstand` (1.0 m) on the side towards +x (N/S wall) or +z (E/W wall), and `stands: false` puts none. The `ld-wall-light` goes at y + 1.165, centred at `hb` (`light: false`: none). A single bed gets the headboard only. Every bed goes through it.
- **`LOOK.ochre`** (A) and **`LOOK.sage`** (B, C) each give:
  - `table` and `chair`;
  - `small`, read only by `smallTable`;
  - `pendant`, `media`, `rug` and `bed`;
  - `sofa`, a chaise sofa ending `-chaise-l` (`.replace(/-l$/, "-r")` gives the other hand);
  - `corner`, a corner sofa's stem: `${L.corner}-l` is the 2.36 m one and `${L.corner}-s-l` the 2.27 m;
  - `single`, the single beds' headboard: `ld-headboard-110` or `ld-headboard-110-sage`.
- **`gardenTable`** places `ld-out-table` with four `ld-out-chair` at 45°, and an `ld-pendant-woven` if `top` is given.
- **`loungePair`** places two `ld-out-lounge` 0.65 either side of an `ld-out-side`.


# Reference: the generator, the spec, the landscape and the people

This covers the code as it stands for Ladonia (`scripts/spaces/ladonia/`, seeded as
`kosinozici-villas`). `scripts/spaces/kosinozici.js` is the old first attempt. Nothing imports it.
The people set round a space (SKILL.md §4b) are not the generator's: their data is in "People", below the landscape.

## Files

- `kit.js`: `Building`, `FACE`, the opening helpers and the door widening.
- `ab.js`: `buildingAB(tag, offset, { furnish })`. This is A and B, one design built twice (`AB`).
- `c.js`: `buildingC(tag, offset, { furnish })` (`C`).
- `furnish.js`: `furnishAB(b, { scheme, pool })` and `furnishC(b)`.
- `index.js`: the site, gardens, street and landscape. It exports `ladonia`.
- `blender/lib/ladonia.py`: the `ld-` pieces' builders (last section), registered in `blender/export_furniture.py`.
- `scripts/seed-scenes.js`: `["kosinozici-villas", ladonia]`. Run `npm run seed -- kosinozici-villas`, which prints `validateScene` notes for anything dropped or repaired.

## kit.js: `Building`

**Frame.** Each building is written in its own frame, in metres. Its outer north-west corner is the origin, x runs east and z runs south, the way the plan is drawn. y is measured from its own ground floor.

**Placing it on the site.** `new Building(tag, [ox, oz, oy = 0])`:
- `ox, oz` are where the local origin lands, in absolute site plan coordinates (`A_AT`, `B_AT`, `C_AT`).
- `oy` raises or lowers the whole building. C stands at street level: `buildingC("c", [...C_AT, C_Y])`.
- `P(x, z)` returns `[ox + x, oz + z]`, rounded to the millimetre. There is no mirroring.
- `Y(y)` returns `oy + y`.
- Every height written by the helpers below goes through `Y()`: wall `base_height`, room `elevation`, roof and stair heights, hole elevations and furniture y. Furniture and storeys are therefore written from the building's own floors (0, 3.0, 6.0).
- Landscape items and spawns are written in absolute site coordinates. Add the building's level yourself (`C_Y + 6.4`).

**Output and ids.**
- `id(name)` returns `${tag}-${name}`. Prefix names by storey (`g-`, `f-`, `p-`, `r-`, `box-`). `validateScene` renames a duplicate id to `-2` without a note.
- `b.out = { rooms, walls, roofs, stairs, floor_openings, furniture, spawns }`. `index.js` concatenates these.
- Furniture ids are `${tag}-f001`, `-f002` and so on.

### Methods

```
wall(name, a, b, { t = 0.12, base = 0, h = 3, finish = "limewash_warm", back = "limewash_warm",
                   reveal = "trim_white", outside = null, openings = [] })
room(name, label, polygon, floor, { elevation = 0, h = 3, ceiling = "ceiling_warm", fitting = "recessed" })
rect(x0, z0, x1, z1)                      // 4 local points
flatRoof(name, x0, z0, x1, z1, base, { finish = "roof_membrane", overhang = 0.05, thickness = 0.25, soffit = "coping_grey" })
stair(name, foot, climbs, { width = 1.0, base, top, run, steps, finish = "concrete_steps",
                            riser = "trim_white", hole = null, style = null })
put(catalog, x, z, face = 0, y = 0, scale = 1)   // face: FACE key or degrees; use furnish.js's put instead
```

**`wall`**
- `a` and `b` are points on the wall's centreline.
- Side A carries `finish` and faces the `outside` point (local coordinates). Without `outside`, side A faces north for a wall running mostly east–west and west for one running mostly north–south. Side B carries `back`.
- `reveal` is a trim.
- kit orders start and end so that side A is outside:
  - an east–west wall with outside to the north runs west; with outside to the south it runs east;
  - a north–south wall with outside to the west runs south; with outside to the east it runs north.
- Openings are given as `{ at: [lo, hi], ...rest }`. `lo` and `hi` are local coordinates along the wall's main axis: x if it runs mostly east–west, z if mostly north–south. On a slanted wall they are scaled along the slant. kit turns them into `offset` (the middle, measured from the start) and `width`, with ids `${tag}-${name}-o${k}`.

**`room`**
- The polygon is a list of local points, drawn to the wall faces (centreline ± t/2).
- If `ceiling` is null or `"none"`, kit writes `ceiling_finish: "none"`, `height: 0.05` and no `fitting`. That is an open-air slab.

**`flatRoof`** writes `ridge_height` as `base + 0.3` and `gable_finish` as `render_sand`.

**`stair`**
- `foot` is the middle of the bottom step.
- `climbs` maps `{ N: 0, S: 180, E: 90, W: -90 }` to `yaw`.
- `hole: [x0, z0, x1, z1, rails?]` adds a `floor_openings` entry at `Y(top)`, with `stair_id` set and the optional rails list.
- A hole with no flight, such as C's unrailed stair heads, is pushed straight into `b.out.floor_openings` using `b.P` and `b.Y`.

### Opening helpers: `(lo, hi, opts)`

| helper | gives | defaults |
|---|---|---|
| `win` | window | `h 1.5, sill 0.9, blind 0.5`, panes `[round(w/1.2), 1]`, `frame_bronze`, `style: "slim"` (`SLIM`) |
| `glazing` | fixed window, floor to head | `h 2.45`, sill 0.02, no blind, panes `round(w/1.3)` |
| `slider` | `door.type: "sliding"`, glazed | `h 2.45`, bronze leaf and frame, `metal_black`, slim |
| `entry` | hinged flush front door | `swing "inward_right"`, `h 2.3`, `frame_bronze` leaf and frame |
| `door` | hinged flush inside door | `h 2.1`, `swing "inward_right"`, `leaf "trim_oak"`, frame `trim_white`, `fit` |
| `glassDoor` | hinged, `glazed: true` | `swing "outward_right"`, `h 2.3`, slim bronze |
| `doorway` | open doorway | `h 2.1` |

- `blind` runs from 0 (up in its box) to 1 (fully down). It is drawn on side A. Pass `blind: null` for no blind.
- Any helper's result can be spread and overridden. C's sliding front door is `{ ...entry(…), door: { ...entry(…).door, type: "sliding" } }`.
- **Swing:** `inward_*` opens to side B (away from `outside`) and `outward_*` to side A. `*_left` hinges at the jamb towards the wall's emitted start and `*_right` at the one towards its end (in the wall's frame, StructureBuilder's and Door.js's, −X is the start and +Z side A). kit emits start and end so that side A faces outside, whichever order `a` and `b` were written in, so the hinge follows side A:

  | wall | side A | runs | `_left` hinges at | `_right` hinges at |
  |---|---|---|---|---|
  | east–west | north (also the default) | west | east jamb | west jamb |
  | east–west | south | east | west jamb | east jamb |
  | north–south | west (also the default) | south | north jamb | south jamb |
  | north–south | east | north | south jamb | north jamb |

  Changing a wall's `outside` swaps the hands of every door in it. Check a door against the plan from the emitted wall (`start`, `end`) and the hinge point, never from its swing name. A `sliding` or `pocket` leaf moves towards the jamb its swing names, 6 cm out on side A. A pocket door is a `door` with its type overridden, as the guest WCs': `{ ...door(lo, hi), door: { ...door(lo, hi).door, type: "pocket" } }`.

### Door widening

`widenDoors` runs on every wall.
- Any opening whose type matches `/door/` (so `door` and `doorway`) and is narrower than `MIN_DOOR = 0.9` is widened to 0.9 about its middle.
- It stays `DOOR_GAP` 0.1 clear of the neighbouring openings and the wall's ends, or 0.04 if that is the only way it fits, and shifts along the wall if it must.
- A door that cannot be widened is left as drawn and listed in kit's exported `narrowDoors`. Nothing prints that list, so log it yourself when checking.
- `door(…, { fit: true })` skips widening. Use it where the cross walls at a wall's ends leave no room for the door's lining.
- `validateScene` silently shifts an opening that runs off the wall's end back inside it, and drops one that overlaps the previous opening (after that shift).

## Spec fields that matter (`server/scene/validate.js`)

**Rooms**: `{ id, name, polygon (≥ 3 points), voids, floor_finish, ceiling_finish, height, elevation, fitting? }`
- A floor finish of kind `floor` makes an indoor room: `height` 1.9–20, default 2.5.
- A floor finish of kind `ground` makes a yard: the ceiling is forced to `"none"` and `height` defaults to 0.05.
- Ground finishes: `stone_paving`, `roof_gravel`, `hardwood_deck`, `asphalt`, `concrete_pavers`.
- Floor finishes include `terrazzo`, `oak_honey`, `bath_tile`, `concrete_steps`, and `stone_paving_floor` (paving under a roof, such as the loggia).
- `ceiling_finish: "none"` means open air. Sky.js treats only rooms with a ceiling as indoors, so open-air slabs get no indoor exposure and no ceiling is drawn.
- `fitting` is `pendant`, `flush` or `recessed`.

**Walls**: `{ id, start, end, height (0.3–20), thickness (default 0.12), finish (A), finish_back (B), reveal (trim), base_height, openings, trims?: "a"|"b"|"both" }`

**Openings**
- `{ id, type, offset (middle, measured from start), width (default 0.85), height (default 2.05, no taller than the wall), sill }`.
- `type` is `door`, `doorway`, `window`, `arch` or `pass_through`. The default is `doorway`.
- `door` carries `{ type: hinged|double|sliding|pocket, swing: inward_left|inward_right|outward_left|outward_right, leaf, frame, handle, glazed?, flush? }`. The trim defaults are `trim_white`, `trim_white` and `metal_brass`.
- A window can carry `frame`, `panes: [across, up]` (1–8 each) and `cill: true`.
- A window or door can carry `style: "slim"` and `blind` (0–1).

**Roofs**: `{ type: flat|gable, footprint, base_height, ridge_height (≥ base + 0.2), ridge_axis, finish, gable_finish, overhang, thickness, soffit }`

**Stairs**: `{ id, start (the foot's middle), direction, yaw, width (0.6–6, default 1.05), base_height, top_height (rise ≥ 0.2), run, steps, finish (floor kind), riser (trim) }`
- Optional fields: `style: "slab"` (cast steps over a stepped soffit, open underneath), `balustrade: left|right|both`, `closet: { to, door: { side: left|right|end, width, height, at } }`, `model`.
- The going is `run / steps` and each step rises `(top − base) / steps`.
- Defaults are `run = rise × 1.5` and `steps = rise / 0.19`.

**Floor openings**: `{ id, position (centre [x, z]), elevation, width (x), depth (z), yaw, stair_id?, rails?, rail_offset_x? }`
- The hole goes through every slab at `elevation`: the floors standing at that level and the ceilings of the rooms below.
- `stair_id` must name an existing stair.
- `rails` lists sides in the hole's own frame: `x-`, `x+`, `z-`, `z+`. At yaw 0, `z-` is the north side.
- `rail_offset_x` is 0–0.5. The default is 0.05.

**Other fields**
- Furniture: `{ id, catalog_id, position: [x, y, z], rotation (degrees), scale }`.
- Vehicles: `{ id, model (an id from public/models/cars/index.json, e.g. bmw-x6-m, chery-jaecoo-j7), position: [x, z], elevation, yaw }`.
- Spawns: `{ position: [x, y, z], yaw, label }`. y is the floor level.
- `environment: { preset, ground, ground_size }`.
- `garden`: Ladonia turns `hills`, `tufts`, `trees`, `blades` and `neighbourhood` to `{ enabled: false }`.
- `doors: []`: standalone doors are only for imported models.
- `people`: the people set round the space. The generator writes none and a seed's spec has none; see "People" below.

**Heading conventions (they differ):**

| field | 0 means | 90 means |
|---|---|---|
| furniture `rotation` | faces north (−z) | faces west |
| person `rotation` | faces north (−z); lying, the head points north | faces west |
| stair `yaw` | climbs +z (south on the site) | climbs east |
| spawn `yaw` | faces +z (south) | faces east |

The stair `direction` names don't match the site: `"north"`, and kit's `"N"`, both mean yaw 0, which climbs south on the site. `"S"` climbs north. Only W/E flights have been used. Check any N/S flight in the browser.

## furnish.js: helpers and facing

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

## index.js: how the site is assembled

**Placement**
- `A_AT = [0, 0]`, `B_AT = [0, 24.2]` and `C_AT = [2.5, -21]` are absolute plan positions of each building's north-west corner.
- A and B stand at 0. `C_Y = STREET = -1.0`, so C stands at street level beside its lane.

**Street (x runs east)**
- The retaining wall's face is at `WALL_X = 20.2`.
- `PARKING [20.2, 25.2]` (asphalt; C's stretch is `concrete_pavers`) and `PAVEMENT [25.2, 27.2]` are at `STREET`.
- `ROAD [27.3, 34.3]` is at `ROAD_Y = -1.1`, with kerbs 0.12 high.
- The lane is at `LANE_Z [-33.4, -27.4]`, also at `ROAD_Y`.
- The plots span `PLOT_Z [-25.5, 44.7]`. C's plot meets A's at `AC_Z = -4.2`.

**Spec assembly**
- `rooms` are each building's rooms, plus the gardens' paving, plus `street()`.
- `walls`, `roofs`, `floor_openings` and `furniture` come from the buildings.
- `stairs` are the buildings' flights plus `stepFlights`.

**Gardens**
- `gardensAB(o, { pool })` and `gardensC(o)` write in site coordinates through `at(o, points)` and `box(o, [x0, z0, x1, z1])`, which add the building's x/z offset.
- Heights are explicit, with `C_Y + …` for C.
- Paving is a room `{ floor_finish: "stone_paving", ceiling_finish: "none", height: 0.05, elevation: 0.01 }`, or `C_Y + 0.01` for C.
  - Paving goes round a pool, never over it.
  - The path stops at the head of the steps, `WALL_X − 1.78`.
  - C's path is level with the parking: no wall, no steps.

**Steps** (`stepFlights`, at `STEPS` = each of A's and B's z + 7.5)
- `start: [WALL_X + 0.02, z]`, direction west (`yaw: -90`), `width: 2.58`, from `STREET` to 0.
- `run: 1.8`, `steps: 6`, `concrete_steps` with `concrete_grey` risers, no `style`.
- A terrain hole is cut at `rect(WALL_X − 1.78, z − 1.3, WALL_X + 0.3, z + 1.3)`.

**Retaining walls** (`retainingWalls()`)
- The runs are at `WALL_X − 0.22`, t 0.45, with base `STREET − 0.05`, top 0.02 and `coping: false`.
- They end 1.55 either side of each flight, so their half-thickness run-on lands inside the cheeks.
- Cheeks are at z ± 1.5, from `WALL_X` to `WALL_X − 2.6`, t 0.4, top 0.05. That leaves them a little proud of the wall.
- `rw-ac` runs across `AC_Z` with base `C_Y − 0.4`, top 0.55, t 0.55 and `slope: [0.25, 0.55]`.
- Rendered screens (`a3-screen`, `pool-screen`) use finish `render_sand` with `coping: false`.

**Hedges** (`frontHedges()`)
- They run at `WALL_X − 0.6`, 0.7 high, with `red: 0`, and are broken ±1.8 at each flight.

**Terrain pads.** A later pad wins. Each plot is eased first (`margin: 8`), then repeated hard (`margin: 0`) at the end, so neither eases into the other. The step between them is `rw-ac`.
- A/B: −0.03.
- C: `C_Y − 0.03`.
- Street: `STREET − 0.05`, hard.
- Road: `ROAD_Y − 0.05`.
- Lane: `ROAD_Y − 0.05`, margin 6.
- Verge: `ROAD_Y − 0.08`.

**Terrain holes** are the step flights plus the pools, each grown 1 cm.

**`planterShrubs(planters)`**
- Places `bush_1` and `bush_3` about every 1.6 m along each planter, at `elevation: base + height − 0.06`.

**Lights**
- An uplight per olive, offset (0.55, 0.45), at y 0.05, aimed 2.2 m up.
- Downlights at 2.6 under the ground pergolas.
- A `step` light on every other step of the outside stair.

**Spawns** are absolute `[x, y, z]`. y is 0, 3.0 or 6.0 for A/B, `C_Y`, `C_Y + 3.2` or `C_Y + 6.4` for C, and `ROAD_Y` for the street.

**Sky** is `{ day: "kloofendal_48d_partly_cloudy_puresky", dusk: "qwantani_dusk_2_puresky", turn: 19, elevation: 36 }`, with environment `exterior_mediterranean` and ground `none`.

## landscape: as the builders read it

The schema is in `shared/landscape.js`. Static parts are built by `World/Builders/LandscapeBuilder.js`; live parts by `World/Flora`.

```
sky       { day, dusk, turn, elevation }
terrain   { size = 400, centre = [0, 0], base,
            detail: { centre, half, step = 1, outer = 6 },        // default { [0,0], 80, 1, 6 }
            slopes: [{ origin, dir, rise (per m), max, ease }],
            hills:  [{ at, radius, height }],
            noise:  { amplitude, scale, seed },
            pads:   [{ polygon, height, margin = 0 }],
            holes:  [polygon],
            paint:  [{ ground: lawn|meadow|gravel|forest|hillside, polygon, margin = 1, noise, strength = 1 }] }
walls     [{ path, base, top, thickness, finish = "dry_stone", slope?: [top0, top1], coping?: false }]
kerbs     [{ path, base, height, width }]
markings  [{ from, to, width, dash?: [on, off], base }]
pergolas  [{ box: [x0, z0, x1, z1], base, height, slats: "x"|"z", posts?: "all"|"corners",
             against?: ["x0"|"x1"|"z0"|"z1"], span = 4.2, frame = "frame_anthracite",
             louvres?: "timber", louvreTrim?, screens?: ["x-", "x+", "z-", "z+"] }]
planters  [{ path, base, height, width }]
railings  [{ points: [[x, z, y], ...], height }]
pools     [{ box, level, depth, deck?: box }]
hedges    [{ path, base = 0, height, width, red = 1 }]
lawns     [{ polygon }]
grassBeds [{ polygon }]
trees     [{ species, position: [x, z], scale = 1, yaw = 0, elevation? }]
forest, shrubs [{ polygon, spacing = 8, species: { name: weight }, clearings, scale?: [lo, hi] }]
meadow    [{ polygon }]                    // `density` is not read: grass.js fixes it (4.5 clumps/m², 2 on low power)
lights    [{ type: "uplight"|"downlight"|"step", position: [x, y, z], target?: [x, y, z] }]
```

The header in `shared/landscape.js` says pergolas take `wall`, but the builder reads `against`. The header also leaves out `grassBeds`, which Flora does read.

**sky**
- `day` and `dusk` are Poly Haven ids under `public/textures/sky/`.
- `turn` rotates the sky and sun about the upright, in degrees.
- `elevation` sets only the day sun's height, in degrees.

**terrain**
- A hard pad (`margin: 0`) gets grid lines at its edges ±1 cm, so a step stays a sharp step. An eased pad adds z lines only.
- Holes remove grid cells.
- Unpainted ground is meadow.
- The terrain material sits behind (polygon offset) the paving, roads and lawn edges.

**walls**
- With `slope`, `top0` is the height at the path's first point and `top1` at its last; points in between are at `top`.
- Each piece runs on `thickness / 2` past its end, and the first piece also past its start. The next piece starts that far beyond the corner, so no two pieces share a face. A wall's end therefore pokes half its thickness past the point you give: end it inside whatever it meets.
- The coping is a 6 cm `concrete_steps` slab, thickness + 6 cm wide, following the top. Set `coping: false` for dry-laid walls and screens.
- `finish` can be any wall finish.

**kerbs** run from `base − 0.1` to `base + height` in `concrete_steps`.

**markings** are drawn at `base + 0.006` and layered in front.

**pergolas**
- Posts are 0.12, and the top beam is 0.22 deep.
- The `against` sides (default `"z0"`) are fixed to the house and get no posts. `posts: "all"` means free-standing with four corner posts. `"corners"` means no middle posts. Otherwise, a long free side gets middle posts no more than `span` apart.
- `slats: "z"` runs the blades along z; any other value runs them along x.
- Aluminium blades take `louvreTrim` (or the frame's trim), at 0.17 pitch, tilted 0.72 rad.
- `louvres: "timber"` gives `hardwood_deck` slats 0.15 × 0.03 at 0.22 pitch, tilted 0.95 rad.
- `screens` are timber lattice on a 0.14 grid, 6 cm in from the named side (`x-` is the x0 side, `z+` the z1 side).

**planters**
- Corten sides 12 mm thick. The ends run on `width / 2` past the path's ends.
- The soil sits 7 cm below the top.
- Grasses are grown live (`planterGrasses`), and LED strips light the long sides at dusk.
- Shrubs are separate `trees` entries with an `elevation`.

**railings**
- `glass_balustrade` glass from `y + 0.06` to `y + height`, with a 7 × 5 cm `frame_bronze` channel at the foot.
- Each point has its own y, so a railing can follow a flight, e.g. `[[14.85, 6.43, 0.0], [9.9, 6.43, 3.0]]`.

**pools**
- The basin rim is fixed at y 0.02, so pools only work at ground level 0.
- The water is at `level` and the floor at `level − depth`.
- The coping is 0.32 m of `stone_paving_floor`, overhanging 3 cm, with its top at 0.07.
- The `hardwood_deck` fills `deck` round the coping, with its top at 0.04.
- The box is cut out of the terrain automatically.
- The water is opacity 0.78 with no transmission.

**hedges**
- These are photinia. `red` is the share of red tips; 0 gives a green laurel hedge.
- No lawn grows under a hedge.

**trees**
- A tree stands at the ground − 0.05 unless it has an absolute `elevation`.
- Within 70 m of the origin, trunks collide with the player; bushes don't.
- Species: `oak_1` to `oak_4`, `ash_1`, `olive_1` to `olive_3`, `bush_1`, `bush_3`.

**forest and shrubs**
- Trees are scattered on a jittered grid.
- They keep clear of rooms (+0.6 m), building walls (+0.8 m), pools, landscape walls and lawns.
- `scale` defaults to [0.8, 1.25] for forest and [0.7, 1.3] for shrubs.

**lights**
- All are off by day.
- An uplight is a spotlight at `position` aimed at `target`. A downlight is a point light 0.2 below `position`. A step light is a glowing fitting only.
- Roof parapets get LED strips automatically. A parapet here is a wall with reveal `coping_grey` or `coping_dark`, height ≤ 0.8 and `base_height` ≥ 2.5.

**Validation.** `sanitizeLandscape` checks shape only, so a new landscape field survives without a validator change. It clamps numbers to ±1e5 and drops non-finite ones, drops strings over 200 characters, keeps the first 5000 items of an array and the first 64 keys of an object, drops anything nested deeper than 8 or keyed outside `/^[A-Za-z_][\w-]{0,40}$/`, and stops after 400,000 values.

## People: the spec's entries, the seats, the index and the planner

The method is SKILL.md §4b; how the app draws, lights and edits them, and what is still short, is `app-notes.md`, People. This is the data, as the code stood on 2026-10-10.

**Files**
- `shared/people.js`: the planner (`planPeople`, `planOne`), `seatsOf`, `siteOf`, `sanitizePeople`. Pure: node and the page alike, seeded.
- `scripts/place-people.mjs`: `npm run people:place`.
- `scripts/measure-seats.mjs`: `npm run seats`, which writes `public/models/furniture/seats.json`.
- `blender/import_people.py`, then `scripts/optimize-people.mjs`: `npm run people`, which writes `public/models/people/`.
- `blender/lib/props.py` and `blender/export_props.py`: `npm run props`, which writes `public/models/people/props.glb`.
- `frontend/Experience/World/People.js`: the runtime. Its class comment is the contract.
- `assets/people/characters/*.fbx` and `assets/people/animations/*.fbx`: the Mixamo downloads, git-ignored (`assets/people/**/*.fbx`).

### The npm scripts

| command | what it does |
|---|---|
| `npm run props` | Builds what the people hold, wear or lay down (Blender) into `props.glb`. Run it before `npm run people` when a prop is new, so the index lists it. |
| `npm run people` | Converts every download (Blender, about 50 s for 12 characters and 17 clips) and packs it: `<id>.glb` a character (0.5–1.4 MB), `clips.glb` (0.9 MB), `index.json`. With nothing downloaded it makes the stand-ins instead. |
| `npm run people -- --standin` | The stand-ins from the app's own two avatars, whatever is downloaded: `index.standin.json`, `standin-*.glb`, `clips.standin.glb`. |
| `npm run people -- --src <dir> --out <dir>` | Another set, somewhere else. A trial run goes to a scratch `--out`: a run into `public/` replaces the stand-ins for every tab at the next `npm run build`. `--keep` keeps Blender's unpacked output. |
| `npm run seats` | Measures every piece one can sit or lie on (32 in the catalogue) into `seats.json`. `-- <id prefix> …` measures only those and merges them in; `-- --png <dir>` also draws a top view of each with its seats. Run it again after `npm run furniture` changes a sofa, a chair or a lounger. |
| `npm run people:place -- <scene-id> [--seed n] [--count n]` | Plans the people and **writes the scene**, as an editor save does (validated, through `writeScene`). Seed 1 and `defaultCount` if not given. |
| `… --dry-run` | Plans and prints; writes nothing. |
| `… --out <file.json>` | The plan to a file, `{ scene, seed, people }`; the scene is not written. |
| `… --png <file.png>` | Also a picture from above, a panel a floor: standing red, sitting blue, lying orange, each with a tick the way it faces, groups ringed. It stops no write: without `--dry-run` or `--out` the scene is still written. |

- After `props`, `people` or `seats` has written into `public/`, `npm run build`: the servers serve `dist/`.
- `people:place` prints the plan in the spec's order: who, clip, what is held and in which hand, where; for a sitter, the feet off the floor (+ hanging, − under it), how far the seat gives and how far forward they sit, and a solid base; then who the first 4 and the first 8 drawn are. It stops if the validator would change the plan.
- A plan is the same for the same seed only while the scene, `seats.json`, `index.json` and `shared/people.js` are the same. Ladonia's seed 12 gives another first group since the planner's last fixes (`COPING`, `GRASSES`, `LEFT_OUT`). Keep a vetted plan as a file, not as its seed.
- To write an edited plan file — the list `__people.patch` returns, or `--out`'s `{ people }` — run from the repo (the scene diff is then `people` alone, the record's `updated_at` aside):

```
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { validateScene } from './server/scene/validate.js';
import { readScene, writeScene } from './server/store/sceneStore.js';
const [id, file] = process.argv.slice(1);
const plan = JSON.parse(readFileSync(file, 'utf8'));
const people = Array.isArray(plan) ? plan : plan.people;
if (!Array.isArray(people)) throw new Error('no list of people in ' + file);
const record = await readScene(id);
const { scene, notes } = validateScene({ ...record.scene, people });
if (JSON.stringify(scene.people) !== JSON.stringify(people)) throw new Error('the validator changed the plan: ' + notes.join('; '));
await writeScene({ id, scene, brief: record.brief, notes });
console.log('wrote', scene.people.length, 'people into', id);
" <scene-id> <plan.json>
```

  `SCENES_DIR=<dir>` in front makes the store read and write another folder: try it on a copy of `scenes/` first. The check on the list is not a nicety: a spec whose `people` is not a list comes out of the validator with no `people` at all, and is written so.

### `spec.people`: one entry a person

`{ id, character, pose, clip, position, rotation, seat, prop, group, seed }`

| field | value |
|---|---|
| `id` | `"person-<n>"`, numbered in the plan's order. |
| `character` | A character's id from the index. One the index lacks is stood in for by one it has. |
| `pose` | `"stand"`, `"sit"` or `"lie"`. |
| `clip` | A clip's name, played whoever it was made for; or `null` for the pose's own (the first of that pose in the index not made for the other sex, one with a hand free if they hold something). |
| `position` | `[x, y, z]` in site coordinates. Standing: the feet, y the floor's. Sitting: the seat's surface under the pelvis — the seat's `at`, less up to `GIVE` on a soft seat, up to `FORWARD_MOST` forward of it. Lying: the lounger's surface under the pelvis (`lie.at`). |
| `rotation` | Degrees, as a piece of furniture's: 0 faces north (−z), 90 west, −90 east, 180 south; lying, the way the head points. Kept in (−180, 180]. A Mixamo rig faces +z, so the runtime turns it `rotation + 180°`. |
| `seat` | `{ furniture: <placement id>, index: <its seat's number in seats.json; 0 lying> }`, or `null`. |
| `prop` | Held (`wine-red`, `wine-white`, `flute`, `tumbler`, `beer`, `coffee`, `book`), worn (`sunglasses`), laid by them (`towel`, `book-open`), or `null`. |
| `group` | `"group-<n>"` for a standing group or two seated together, else `null`. |
| `seed` | An integer: where in its clip the person starts, and its speed (0.92–1.08×). |

- **The list's order is the priority.** A device that draws only some (`QUALITY.people.most`) takes the first whole groups that fit; a person alone is a group of one. The planner returns: the standing group nearest those lying by the pool, those lying by the pool, those sitting out of doors, those sitting indoors, the other standing groups, those lying elsewhere.
- **The validator** (`server/scene/validate.js` → `sanitizePeople`) keeps `people` only when the spec has a list: an empty list stays empty, a spec without the key gets none. It keeps the first 200 (`MAX_PEOPLE`); drops an entry without three finite position numbers or without a character; makes a missing or unknown pose `"stand"` and a taken id unique, each with a note; wraps `rotation`; lets go, with a note, of a seat on a piece the spec no longer has; keeps `clip`, `prop` and `group` as a string of 80 characters at most or `null`.
- `npm run seed -- <id>` rebuilds the spec without `people`. Furniture ids are sequence numbers (`b-f228`): after a reseed that added or removed a piece, a saved entry's `seat.furniture` can name another piece.

### `public/models/furniture/seats.json`

One entry a catalogue id, in the piece's own frame: facing north (−z), metres at the placement's scale 1, before its rotation. The `"$comment"` key is not a piece.

```
"<catalog id>": { kind: "sofa" | "chair" | "stool" | "lounger" | "bench",
                  seats: [{ at: [x, z], height, depth, facing, base: "solid" | "open", room? }],
                  lie: { at: [x, z], height, head: [x, z], length, width, incline } | null }
```

| field | meaning |
|---|---|
| `seats[].at` | Where a seated person's buttocks rest: 0.15 m out from the foot of the back (`SIT_BACK`), or the middle of a shallower seat. |
| `height` | The seat's surface above the piece's base. A loose pillow lying on the seat is not the seat. |
| `depth` | From the back's foot to the front edge: what is left to sit on before a loose pillow. |
| `room` | Only where a loose pillow lies on the seat: the front edge to the back proper, behind the pillow. |
| `facing` | The way a sitter faces, in degrees as a `rotation`. A corner sofa's return seats face −90. |
| `base` | `"solid"`: a box or plinth down to the floor, so feet can't be tucked back under it. `"open"`: a seat on legs. |
| `lie.at` | The point under a lying person's pelvis: 0.1 m footwards of where the raised back begins, or 0.9 m from the head end of a flat one. |
| `lie.head` | The middle of the head end. `seatsOf` turns `at → head` into the person's `rotation`. |
| `lie.length`, `lie.width` | The lying surface end to end, and the cushion's width under the pelvis. |
| `lie.incline` | The raised back's angle off the flat, in degrees. 5 or less is taken for flat. |

- How it is measured: a 2 cm height field of the model as the app shows it; one seat per ~0.6 m of a run; a chaise's deep end (over 0.78 m) is one seat; a back is what stands within 0.12 m of the piece's top and 0.15 m over the seat, so an arm is not one; a seat with more than a quarter of the 0.3 m before its front edge taken by the piece itself (the corner of a corner sofa) is no seat.
- `seatsOf(placement, seats)` puts a placed piece's seats on the site: each `at` as `[x, y, z]` with y = the placement's y + `height` × scale, `facing` turned by the placement's rotation.
- Ladonia's pieces: `ld-lounger` lies at 0.39, 1.94 long, 0.64 wide, inclined 35°; `ld-out-lounge` sits at 0.371, 0.40 deep before its pillow (`room` 0.54), open; `ld-out-sofa` 0.40, solid; the indoor `ld-sofa-*` 0.45–0.47, solid; dining and garden chairs 0.45–0.49, open; bar stools 0.76–0.77 (the planner seats no one on a stool).

### `public/models/people/index.json`

Every path is under `/models/`. The app loads `index.json`, else `index.standin.json`, else its own two avatars playing Idle.

**`characters[]`**: `{ id, name, file, height, hips, legs, sex, eyes, mouth, sits }`

| field | meaning | used by |
|---|---|---|
| `id`, `name`, `file` | `"remy"`, `"Remy"`, `"people/remy.glb"`. The id is the FBX file's name. | both |
| `height` | Metres, standing (Ladonia's twelve: 1.75–1.89). | — |
| `hips` | How high the pelvis stands (0.93–1.05). A clip's Hips track, seat and feet are scaled by `character.hips / clips.hips`. | both |
| `legs` | `[thigh, shin]` in metres. | planner (where `sits` lacks the clip) |
| `sex` | `"f"`, `"m"`, or `null` for an id `SEXES` in `import_people.py` doesn't list: add every new character there. | both: a clip made for one sex is not given to the other |
| `eyes` | `[x, up, forward]` from the head's joint, at rest: where a pair of glasses' lenses hang. `null` if not found. | runtime wears sunglasses there; the planner gives none without it |
| `mouth` | The lips, likewise. | runtime tips a drink at it |
| `sits` | `{ "<clip>": [seat, knee, tuck, far] }`: how each sitting clip sits on this very body, in metres — the seat height that puts its soles on the floor, and its rearmost knee, rearmost ankle and foremost ankle forward of its seat. | planner, in place of the clip's own scaled |

**`clips`**: `{ file: "people/clips.glb", hips, legs, list: [...] }`. `hips` (0.962) and `legs` ([0.411, 0.377]) are the clips' own skeleton's. Pass the whole object to the planner (`clips: index.clips`), not only its list, or nothing is scaled to the character.

Each of `list[]`: `{ name, pose, hand, tilt, curl, pelvis, seat, head, duration, feet?, tuck?, knee?, far?, reach?, sex?, still? }`

| field | meaning | used by |
|---|---|---|
| `name` | The FBX file's name. | — |
| `pose` | `"stand"`, `"sit"` or `"lie"`, read from the name (`CLASSIFY` in `import_people.py`: "sit…" sits; "lay…", "lying", "sleep", "sunbath", "tann" lie and hold nothing; anything else stands, and one named for clapping, waving, pointing, a phone or dancing holds nothing). | both |
| `hand` | `"right"`, `"left"` or `false`: the hand that can hold a glass all through the clip. Measured (`tilt` ≤ 80° and `curl` ≥ 40° over every frame), but set outright for the drinking clips (`HANDS`), which fail the measure by drinking. | planner gives a drink only where it is not `false`; runtime holds in that hand whatever the prop's `grip` says |
| `tilt`, `curl` | Per hand, degrees: the furthest off upright a glass in its fist ever points, and the least its fingers are ever curled. | planner prefers the steadier hand; runtime keeps a glass in the thumb's crook where `curl` < 45 |
| `pelvis`, `seat`, `head` | At the first frame, from the root, Y up, facing +Z: the Hips; the point under the pelvis that rests on the seat (`null` standing); the head. | runtime places by `seat`; `head` says which way a lying clip lies, whether a sitting one is sat back in (0.2 m behind its seat) and whether a lying one sits up of itself (0.45 m over it) |
| `duration` | Seconds. | — |
| `feet` | Sitting: where the feet rest, at the soles' height. `seat[1] − feet[1]` is the seat height the clip was made for. | planner |
| `knee`, `tuck`, `far` | Sitting: how far forward of the seat the rearmost knee, the rearmost ankle and the foremost ankle ever are. | planner: knees before the front edge, ankles before a solid base, feet short of a coffee table |
| `reach` | Lying: how far from the midline the hands lie. | planner; the runtime brings arms in from the pose itself |
| `sex` | `"f"` or `"m"` for a clip whose name says Female or Male. | both |
| `still` | `true` for a clip of one frame. | runtime makes it breathe |

Ladonia's 17 clips (`hand`; for a sitting clip the seat height it was made for; Mixamo's own tile name where the file was renamed, as recorded while downloading and not checked again):

| clip | pose | hand | notes |
|---|---|---|---|
| Agreeing | stand | — | 1.8 s |
| Drinking ("Male Drinking") | stand | left, set | drinks from a bottle, the hand lifted over the mouth; carries the body 1–2 cm over its root |
| Happy Idle | stand | right | tilt 64.5° |
| Laughing | stand | — | |
| Standing Idle ("Weight Shift Idle") | stand | right | tilt 71.4° |
| Talking ("General Conversation") | stand | right | tilt 76.9°; the hand opens as it gestures |
| Talking Funny | stand | — | opens and splays the hands |
| Talking Question | stand | — | |
| Sitting Drinking | sit | right, set | 0.342; the download walks 2.7 m and sits down first (trimmed to its seated 11 s) and faced backwards (turned) |
| Sitting Idle ("Sitting With Breathing Idle") | sit | right | 0.396; feet flat before the seat (`tuck` 0.41): fits a solid base |
| Sitting Laughing | sit | left | 0.413; tucks a foot back (`tuck` 0.20): seldom on a solid base |
| Sitting Talking | sit | — | 0.438; a foot stretched out (`far` 0.61); 45 s |
| Sitting Reclined Male | sit | — | 0.381; still; sat back, hands behind the head; men only |
| Sitting Reclining Female | sit | — | 0.351; still; women only; in `LEFT_OUT` |
| Laying Hands Behind Head ("Male Laying Pose: On Back, Legs Crossed, Hands Behind Head") | lie | — | still; `reach` 0.24 |
| Laying Idle ("Laying On Back Idle") | lie | — | `reach` 0.46: the arms lie out past a 0.64 m lounger and are brought in |
| Laying Propped Female | lie | — | still; women only; sits up of itself (head 0.64 m over its seat): never on a raised back |

**`props`**: `{ file: "people/props.glb", list: [{ id, node, grip }] }`. `node` is the name three's loader gives the GLB's `prop:<id>` node (`propwine-red`: it drops the colon). `grip` is `"right"`, or `null` for a prop that is worn or laid down. Each node's origin is its grip point, and its extras carry `{ prop: { id, grip, size, at, off } }`: `at` the share of its height the grip is up, `off` how far the grip is from the middle of its footprint.

| id | what | size x, y, z (m) | grip |
|---|---|---|---|
| `wine-red` | Bordeaux glass | 0.095, 0.226, 0.095 | the stem, 0.21 of its height up |
| `wine-white` | white wine glass | 0.081, 0.206, 0.081 | the stem, 0.23 |
| `flute` | champagne flute | 0.069, 0.236, 0.069 | the stem, 0.23 |
| `tumbler` | Negroni on ice with an orange wheel | 0.110, 0.113, 0.085 | the body, 0.27; 13 mm off centre (the wheel, not a handle) |
| `beer` | brown longneck | 0.062, 0.231, 0.062 | the body, 0.33 |
| `coffee` | cappuccino | 0.115, 0.066, 0.092 | through the handle, 0.56; 42 mm off centre |
| `book` | closed paperback | 0.129, 0.198, 0.025 | the spine |
| `towel` | folded beach towel | 0.46, 0.051, 0.32 | none: laid past the feet of someone lying |
| `book-open` | paperback open face down | 0.251, 0.044, 0.198 | none: laid likewise |
| `sunglasses` | sunglasses | 0.143, 0.047, 0.146 | none: worn, the origin under the bridge |

Each is under 1,500 triangles (`BUDGET` in `blender/export_props.py`, which says when one is over). Glass is see-through by opacity, never transmission (SKILL.md §7). A new prop is a builder and a row in `PROPS` (`blender/lib/props.py`: id, name, hand or `None`, builder).

### The planner (`shared/people.js`)

`planPeople(spec, catalog, seats, { seed = 1, count, characters, clips, props })` returns the entries; `planOne(spec, catalog, seats, { pose, near, facing, seed, characters, clips, props })` returns one more for the editor's Add, or `null` with nothing within 12 m.

**How many and where**
- `defaultCount`: 4, plus one per 25 m² of terrace and deck, plus one per lounger by the water, up to 12. Ladonia gets 12.
- Lying: about a quarter, and no more than there are loungers by water: those within 3.5 m of a pool (`NEAR_POOL`) first, then within 4.5 m of a hot tub (`NEAR_TUB`). With none by water, two at most on any.
- Standing: one group of two or three for every six people. A group stands only in a room whose floor finish is of kind `ground`, not gravel, asphalt, grass or the like (`SOFT_GROUND`, so not on `roof_gravel`), whose name is not a way through (`PASSING`: parking, road, path, steps, entrance, hall…) and which is at least 4 m². A room named terrace, deck, roof, pool, garden… (`GATHERING`) is twice as likely. Name a new space's rooms accordingly. The first group stands within 12 m (`BY_THE_POOL`) of those lying by the pool, on their level, and has someone drinking.
- Sitting: the rest — outdoor sofas and lounge chairs first, one or two on indoor sofas (a room named living, lounge… twice as likely), then terrace chairs, then indoor chairs. Seats 0.3–0.62 m high and 0.2–0.78 m deep (`SEAT_HEIGHT`, `SEAT_DEPTH`); no stools. A seat no character and clip fit is left empty, and whoever was to sit there stands.

**Clearances and spacing**

| constant | value | what |
|---|---|---|
| `MARGIN` | 0.4 m | Someone standing is this clear of every obstacle and of the edge of the room. |
| `SPACING` | 0.9–1.3 m | A standing group's members apart, facing its middle ± 12°. |
| `APART` | 0.8 m | Two people not of one group. |
| `DOORWAY` | 0.6 m | Kept clear either side of a door, a doorway or glazing to the floor (and `MARGIN` more). |
| `COPING` | 0.3 m | Round a pool's box no one stands: its raised coping. |
| `GRASSES` | out 0.25, up 1.0 m | How far a planter's grasses are taken to reach past its box and above it. Ladonia's reach further (`app-notes.md`, People, Still short). |
| `FLAT` | 0.035 m | A piece flatter than this (a rug) is walked on. |
| `LEFT_OUT` | "Sitting Reclining Female" | Clips no one is planned with. The editor can still give them. |
| `BOTTLE` | `"beer"` | What anyone whose clip drinks holds. |

Obstacles (`siteOf(spec, catalog)`, which gives `roomAt`, `blockedBy`, `clearOf`): the spec's walls, furniture as its catalogue box, stairs and the holes they rise through; the landscape's walls, planters with their grasses, hedges, railings, pergola posts and screens, trees and pools with their coping. Furniture is a box here too: the inside of an L-shaped sofa counts as taken.

**Sitting fit**

| constant | value | what |
|---|---|---|
| `FEET_NEAR`, `FEET_MOST` | 0.02, 0.04 m | The feet's distance from the floor on that seat: within the first no one can tell, within the second it passes. |
| `UNDER_MOST` | 0.025 m | Feet under the floor count for more: this much under is as far off as `FEET_MOST` hanging. |
| `GIVE` | 0.03 m | A sofa's or a lounge chair's cushion gives this much under someone whose feet would hang. |
| `LEG_CLEAR`, `HEEL_CLEAR` | 0.04, 0.06 m | Knees this far past the seat's front edge; on a base not `open`, ankles too. |
| `FORWARD_MOST`, `FORWARD_BACK` | 0.15, 0.08 m | How far forward of the seat's point someone may sit for that; the second for a clip sat back in. `SEAT_UNDER` 0.12 m of seat stays under them. |
| `FOOT`, `LEG_SPACE`, `KNEE_HIGH` | 0.2, 1.2, 0.62 m | The foremost ankle and a foot more come short of whatever stands before the seat lower than the knees, looked for out to 1.2 m. |
| `ROOMY` | 0.4 m | A shallower seat has a cushion propped on it: sat on only when nothing better is free. |
| `RECLINED`, `RECLINE_DEPTH`, `SITS_BACK` | 0.2, 0.5 m, 0.3 | A clip sat back in goes only on a soft seat out of doors at least 0.5 m deep, three times in ten, and never two alike. |

**Lying, drinks and the rest**
- `SITS_UP` 0.45 m, `RAISED` 5°: a lying clip that sits up of itself is not for a lounger whose back is raised. Those lying take the lying clips in turn, so the loungers by a pool are not all one pose.
- `LYING_PROPS`: a towel (weight 5), sunglasses (2, only on a character whose `eyes` the index has), an open book (1.5), or nothing (1.5).
- A drink goes only to a clip whose `hand` holds; the steadier the hand (`TILT_MOST` 80°) the likelier. A standing group has one with a drink, one talking, one listening; a talker or listener whose clip has a hand holds one six times in ten. Indoors the drinks are coffee, wine or a tumbler; out of doors wine, a flute, a tumbler or a beer.
- No character twice until all are used; none twice in a group; no two of a group play one clip.
- `MAX_PEOPLE` 200.

### `QUALITY.people` per slider step (`frontend/Experience/Utils/device.js`)

| step | `most` | `every` | `near` (m) | `farEvery` | `still` (m) |
|---|---|---|---|---|---|
| 0 Fastest (the slider's lowest; a software renderer's default) | 4 | 2 | 8 | 4 | 30 |
| 1 Fast (a phone's or tablet's default) | 8 | 1 | 10 | 3 | 45 |
| 2 Balanced | 16 | 1 | 12 | 3 | 60 |
| 3 High | 32 | 1 | 15 | 2 | 90 |
| 4 Maximum realism | all | 1 | 15 | 2 | 120 |

At most `most` are drawn; each is animated every `every` frames within `near` of the camera, every `farEvery` beyond, and held still beyond `still` or out of sight.

### `World/People.js`: what the editor and the checks call

- `world.people` exists in the editor and in a public view. `ready` is a promise; it emits `"ready"` after a rebuild and `"change"` (with the id) when one person is added, removed or changed.
- `rebuild(spec?)`: everyone again from `spec.people`. `add(entry)`, `remove(id)`.
- `update(entry | { id, ...fields })`: moved or turned, the person is placed again in the same group; a changed character, pose, clip, prop or seed builds a new one.
- `readBack(id)`: after the group itself was moved or turned (a gizmo drag), writes the entry's `position` and `rotation` from it.
- `get(id)` (the record), `list` (the records built, in the spec's order), `count` (as many as the spec has), `objectFor(id)` (its group), `personOf(object)` (the id of the person a ray's hit is part of).
- `show(on)`: all of them and their collision boxes, the "people" scenery. `setFilter(fn | null)`: only those `fn(entry)` is true for. Hide through these, never `group.visible`, which People overwrites.
- `index()`: a promise of the index as the app reads it (`characters`, `clips`, `props`). `tick(delta)` is the world's per-frame call; `update` is the editor's.
- A person's group is `person:<id>` with `userData { kind: "person", id, label }`, under the root `people`. A record carries `entry`, `group`, `model`, `meshes`, `character`, `clipEntry`, `info` (measured at the clip's start: seat, soles, back, head), `sphere` (culling) and `collisionBox`.

## Numbers that worked (as in the code)

**Storeys**
- A/B: `AB = { storey: 3.0, roof: 6.0, parapet: 0.45, box: 9.8 }`.
- C: `C = { storey: 3.2, band: [2.8, 3.65], roof: 6.4, top: 7.65, box: 9.6 }`.
- Rooms are `storey − 0.25` high (the slab). Rooms in the stone box are `box − roof − 0.3`.
- Pendants hang from 2.75 (A/B) or 2.95 (C) above their floor.

**Walls**
- Outside walls are 0.35 (`EXT`).
- Party walls are 0.2 (`PARTY`).
- The stone box is 0.3, with a 0.15 wall down its middle.
- A/B's roof parapets are 0.25 thick and 0.45 high, with reveal `coping_dark`.
- C's corten band is 0.37.
- Partitions are 0.12.

**Partitions and junctions**
- Any wall thinner than 0.3 is `H − 0.02` high, so it stops 2 cm under the floor above.
- A wall stays at full height `H` where it stands beside an open-air space.
- A partition starts at an outside wall's inner face (0.35) and ends at the centreline of the partition it meets.

**Doors and corridors**
- `MIN_DOOR` is 0.9. Inside doors are 2.1 high. Front doors are 2.3–2.74 high. Sliders are 2.45, or 2.4 in the box.
- Guest WC doors open outwards.
- Corridors are at least 0.9 between wall faces. The A/B upper north corridor is 0.95.

**Stairs.** Width is at least 0.9. For each flight (going = run / steps):

| flight | width | steps | going | rise | pitch |
|---|---|---|---|---|---|
| street steps | 2.58 | 6 | 0.30 | 0.167 | 29° |
| A/B outside stair (`slab`) | 1.15 | 16 | 0.31 | 0.188 | 31° |
| A/B flats' stairs (`slab`) | 1.05 / 0.95 | 15 | 0.25 | 0.20 | 39° |
| C common stair (`slab`) | 1.1 | 17 | 0.22 | 0.188 | 40° |
| C flats' stairs | 0.9 | 17 | 0.23 | 0.188 | 39° |

- Where a flight climbs over a bathroom, a knee wall 1.65 high closes the space underneath.
- A stairwell's edge along a wall sits 1 cm into the wall's thickness, e.g. z 7.58 against a wall face at 7.59.
- The landing rail's channel sits 2 cm under the paving: y 2.98, height 1.02.

**Site levels**
- The street is 1 m below the gardens (`STREET` −1.0). The road is 0.1 m lower again (`ROAD_Y` −1.1), behind a 0.12 kerb.
- Terrain pads sit 3–5 cm under the paving: −0.03 under garden paving at +0.01, and 5 cm under the street slabs.
- The retaining wall's top is at 0.02, the cheeks' at 0.05.
- The steps' terrain hole is 2.6 wide for a 2.58 flight.

**Pergolas**
- Ground pergolas are 2.75 high (pendants from 2.7) and use `slats: "x"` with `against`.
- Roof pergolas are 2.45 high on the roof (pendants from roof + 2.46, see `hang`) and use `slats: "z"`, `posts: "all"` and `screens`.
- All use `frame: "alu_anthracite"` and `louvres: "timber"`.

**Clearances**
- Glazing sills are 0.02.
- Showers sit 1 cm off their walls.
- Planters stop 5 cm short of the parapet's inner face. A/B planters are 0.9 wide and 0.55 high. C's are 1.05 wide and 1.05 high, raised so they show over the tall corten parapet.

**Sizes that read right for new pieces** (accepted by the user): 3-seat sofa 2.10 × 0.78 × 0.92; dining chair seat 0.46, back 0.88; bar stool 0.77; table tops — dining 0.76, coffee 0.40, side 0.55, console 0.80; handrails 0.9 above the nosings, landing rails 0.95.

**Furnishing gaps used in the code**
- Coffee table 0.35–0.4 before the sofa's seat, with 0.8 left past it.
- Tables 0.75 off walls with doors in them and 0.95 clear of a kitchen front.
- About a metre clear in front of a counter.
- A sofa's back 0.9 off a slider.

## The Blender builders (`blender/lib/ladonia.py`)

The `ld-` pieces' builders, worth copying into the next project's `blender/lib/<project>.py`. Each takes `(col, mats, …)` and returns its parts. Each is centred on the origin, stands on z = 0 and has its front towards +Y, which the app turns to face north at rotation 0. The registrations in `export_furniture.py` show the parameters each catalogue id was built with.

**Soft furnishings**
- `_pillow(name, size, loc, col, mat, rot, r, puff, crease, cuts, seed, sag, flare, folds, axis, bend)`: a rounded box fattened across `axis` (by default its thinnest), with an optional sagging top, creases, flared foot, loose-cover folds and bend. Used for seat and back cushions, sofa frames and arms, the pouf and the lounge chair's cushions.
- `_lean(foot, h, a)`: the middle of a cushion `h` tall standing on `foot` and leaning back by `a`. Pass `rot=(a, 0, yaw)` with a positive `a`, which tips the top to −Y (the back).
- `_case_pillow(name, w, h, t, loc, col, mat, rot, flange, stripes, stripe_mat, seed, crease, pull, grid=22, profile="slab")`: a throw cushion as one closed shell, lens-shaped in section. `profile="dome"` thins steadily from the middle to the seam (about 80 % of `t` at half width): the sofas' cushions. `"slab"` stays full almost to the edge.
- `_bed_pillow(name, w, h, t, x, y, z, lean, col, mat, flange, stripes, stripe_mat, seed, take, sag, flop, crinkle, grid, yaw, sink, behind, rest)`: a bed pillow.
  - Shape: a lens with no flat middle, eared corners, a top that sags and flops back, fine crumples, shaded smooth throughout.
  - Placing: it stands on its bottom edge at (x, y, z), leaned back by `lean`. Its foot sinks `sink` into `rest` (the mattress), and wherever it would cross into one of `behind` it is pushed forward onto it.
- `_rest(obj, behind, d, tol=0.005, reach=(-0.25, 0.3))`: slides a placed cushion along `d` (away from what it leans on) until it touches `behind`, pressing in no more than `tol`.
- `bed(w=1.80, l=2.00, single=False, throw, lining, sham, duvet)`: a bed without its headboard, its head at −Y. The mattress top is at 0.50, on a platform 4 cm bigger. The duvet is turned down 0.66 m from the head, with a runner over it. Each side has a Euro sham, a white pillow with three olive lines and a sand cushion (one set, centred, on a single).
- `headboard(w=2.10, h=0.50, t=0.04, panels=2, felt="felt_fleck")`: felt panels butt-joined; a `wall` piece, hung at y + 0.55.
- `curtain(w=1.6, h=2.74, mat="curtain_linen", depth=None, folds=None, heading="ripple")`: one two-sided sheet hanging from a track in the ceiling.
  - `"ripple"`: S-folds every 10.5 cm, 0.13 deep. Each fold is sampled 16 times, because fewer reads as a zigzag.
  - `"pinch"`: pleats every 13 cm, 0.09 deep, over soft folds.
  - A narrow `w` with `depth` and `folds=6` is a curtain stacked open (`ld-sheer-05`, `ld-curtain-caramel-06`).

**Seating and tables**
- `sofa(w=2.50, chaise=None, style="linen", d=None, chaise_len=1.65, cw=0.95)`:
  - `style` picks from `SOFAS`: `"linen"` (slip-covered) or `"boucle"`.
  - `chaise` `"left"` or `"right"` (−X or +X) pulls that end forward `chaise_len`, `cw` wide with its arm (0.8 for C's narrow chaise). `d` overrides the style's depth.
  - The back cushions lean back 0.22 rad. The throw cushions lean back 0.40 rad and are settled against them with `_rest`.
- `sofa_corner(w=2.36, ret=2.30, depth=0.96, style="linen", ret_seats=1)`: backs on two walls. The run goes along X with its back at −Y; the return, at −X, comes forward to +Y. Only this hand is built (`-corner-l`, `-corner-s-l`).
- `dining_table(w=2.00, d=0.95, wood="oak_pale", base=0.55)`: a top at 0.75 with 0.15 m corners, on oak slabs; the cross slabs stand `base` of the length apart. The 1.4 m four-seater uses 0.9, which puts them beyond its tucked chairs.
- `round_table(r=0.525, top, base, h=0.75, t=0.06, drum=0.225)`: a bullnosed top on a drum. It is also the garden table (`outdoor_green`).
- `coffee_round(r=0.30, h=0.40, mat)`: a low drum table.
- `pouf(w=0.38, h=0.42, fabric="linen_ecru")`: square and soft, with a flat base.
- `stump(r, h, sphere)`: the teak drum with an armillary sphere.

**Kitchens.** All stand against y = 0 facing +Y, exported shut (`_fixed`): a worktop at 0.92 (`K_TOP`), units 0.6 deep (`K_D`), tall units to 2.74 (`FULL`).
- `kitchen(length, scheme="ochre", tall=1, tall_side=-1, uppers=True, shelves=None)`: the generic run, with `tall` columns at its own left (−X), or at its right with `tall_side` +1. `tall=0, uppers=False` gives a counter.
- `_sage_run(L, mods, hob, cab, niche, shelves, hand=-1)` and `_ochre_run(L, mods, hob, hood, niche)` lay out a run to a plan. Use them for any new plan's kitchen.
  - `mods` is a list of (kind, width) from the run's own left: `oven_col` (sage), `column`, `shelfbase`, or a base kind (`door`, `drawers`, `sink`, `dishwasher`, `oven`, `filler`).
  - The other arguments are spans measured the same way. `hob` is (u0, u1, w). `cab` is sage's deep cabinet over the hob. `hood` and `niche` are ochre's visor cupboard and its bronze-framed box; for sage, `niche` and `shelves` are the grooved recess and its three shelves.
  - `hand` +1 lays a sage run out from its right.
- Ladonia's plan runs are each one such call; copy one and change its `mods`:
  - `kitchen_a1(scheme)`;
  - `kitchen_a2(L=4.5, scheme="sage")` (any other `L` gives B2's plan; `"ochre"` gives A2's);
  - `kitchen_40n(scheme)` (3.95 m) and `kitchen_42s()` (4.2 m);
  - `kitchen_c1()` (3.9 m, laid out from its right) and `kitchen_c2(hand=-1)` (2.8 m; +1 for C3).
- `kitchen_l(scheme="ochre", w=2.49, d=2.20, sink_at=1.57, hob_at=0.65)`: an L corner. Each leg is built as a straight run, then turned and cut into place (`_turn`, `_cut`), with one worktop round the corner.
  - The long leg runs along the back. It holds the sink, with a 15 cm upstand and no wall units.
  - The short leg stands at −X facing +X. It holds the oven under the hob, a splashback and cupboards (ochre) or the deep cabinet (sage), and its free end is panelled to the ceiling.
- `kitchen_u(scheme)`: a U built for one spot, with its legs cut to a slanted back wall. Use it as a pattern for a U; it is not reusable as it stands.
- `counter(length, scheme, kind, lead=0.0, splash=0.6, hand=-1)`: base units alone, both ends finished.
  - `"hob"`: a hob over an oven, with doors and drawers.
  - `"sink"`: `lead` metres of doors from −X, then the sink and a dishwasher; a splashback `splash` high (0 for none).
  - `"plain"`: doors either side of a drawer stack and no splashback, to stand under a window.
  - `"low"`: C's order, from the hob end at −X (at +X with `hand` +1), with no splashback.
- `peninsula(w=2.10, d=0.62, scheme)`: a peninsula whose worktop runs on over its back as a breakfast bar.

**Storage, bathroom and lights**
- `wardrobe(w=1.80, h=FULL, d=0.58)`: fitted to the ceiling, facing +Y (north), unlike joinery's.
  - Doors: in pairs, 2·round(w/1.1) of them, or a single door under 0.9 m; faced in `linen_panel` twill.
  - Pulls: a 0.34 m walnut disc on each pair's middle joint, 0.98 m up (a single door's sits 0.20 from its +X edge).
- `nightstand(w=1.0, d=0.40, h=0.15, wood="walnut_veneer")`: a floating drawer with its back at −Y, hung at y + 0.28.
- `wall_light(w=0.80, r=0.0135)`: a tube a centimetre off the wall, oak sleeves on both ends and an opal diffuser between them; a `wall` piece at y + 1.165. It lights its room (25 W, `LED`, on the room's switch: `light` extra with `room: true`, `app-notes.md`).
- `track(length=3.0, spots=4, leds=0)` and `pendant_felt`, `pendant_pleat`, `pendant_woven` (`r, h, drop`): `ceiling` pieces, hung by their top. Each lights its room: a pendant 40–60 W `BULB`, a track 20 W a spot and 25 W an LED module, one light a head (`app-notes.md`, Lights and fittings).
- `shower_walkin(w=2.18, d=1.10, h=2.10, screen=1.0, side=1, style="black", window=None)`: a floor-flush walk-in shower with its back at −Y. It is open along +Y except for a fixed screen `screen` long at +X.
  - `side=-1`: the screen at −X instead (built as the mirror image).
  - `style`: `"black"` has a tiled pre-wall with a niche and black fittings; `"chrome"` has the joinery shower's finishes.
  - `window=(u0, u1, sill)`: leaves the pre-wall open above a ledge so a window behind it shows.
- `vanity_double(w=1.45, d=0.45, wood, tap)`: a floating oak vanity with two vessel basins and a mirror over them; a `wall` piece at y + 0.40.

**Television**
- `tv_volume(w=2.6, d=0.4, wood="oak_rift", tv=(1.43, 0.81), niche=True, tv_x=0.1, joints=())`: a rift-oak block to the ceiling, `d` deep.
  - The TV sits flush 1 m up, centred at `tv_x` (+X is the viewer's left).
  - `niche` opens a recess at the floor at its −X end; `joints` are the x of hairline door joints.
- `tv_wall(w=1.23, h=0.72)`: a wall-hung TV on its bracket, 5 cm deep; a `wall` piece at y + 0.95 (0.8 in C).
- `media_wall(w=2.32, …)`: A's oak-framed niche with cupboards and a console.

**Outdoors**
- `lounge_chair(frame="outdoor_orange")`: a strap chair. Both cushions lean back on the straps with a positive X turn.
- `outdoor_kitchen(w=1.6, d=0.70, grill=False, mirror=False)`: a teak base with a stone top, the sink at −X and, with `grill`, a grill at +X. `mirror` swaps the ends (`ld-out-kitchen-r`).
- `outdoor_shower(h=2.25)`: a stainless gooseneck over a teak plate, its arm reaching +Y.
- `kamado()`: a 0.52 m ceramic egg in a steel nest, with a teak shelf at +X.
- `garden_sofa(w=2.0, d=0.85, frame="teak", fabric="canvas_cream")`: `frame_bottle` with `canvas_bottle` gives C's green one.

**Helpers**
- `_fixed(parts)`: exports fitted pieces shut, so the piece is one draw call.
- `mirrored(parts)`: a piece's other hand. It mirrors the piece in X, turns the faces back out and reverses the hinges: `shower-m`, `ld-out-kitchen-r`, the −X walk-in showers.
- `_soft_box(name, size, loc, col, mat, r, r_x, n, k, crown, puff, crease, seed)`: a rounded box whose grid is gathered into its rounds: the mattress, the platform and the headboard's panels.

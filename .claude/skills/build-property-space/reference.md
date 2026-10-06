# Reference: the generator, the spec and the landscape

This covers the code as it stands for Ladonia (`scripts/spaces/ladonia/`, seeded as
`kosinozici-villas`). `scripts/spaces/kosinozici.js` is the old first attempt. Nothing imports it.

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

**Heading conventions (they differ):**

| field | 0 means | 90 means |
|---|---|---|
| furniture `rotation` | faces north (−z) | faces west |
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

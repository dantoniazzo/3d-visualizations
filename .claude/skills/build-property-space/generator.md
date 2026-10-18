# The generator: its files and kit.js's `Building`

This covers the code as it stands for Ladonia (`scripts/spaces/ladonia/`, seeded as
`kosinozici-villas`). `scripts/spaces/kosinozici.js` is the old first attempt. Nothing imports it.
The rest of the generator's reference: `spec-fields.md` (what the validator keeps), `furnish.md` (the furniture helpers and facing), `site.md` (index.js), `landscape.md` (the landscape schema), `numbers-that-worked.md` and `blender-builders.md`. The people set round a space are not the generator's: their data is `../space-people/people-data.md`. What a test tab, a publish or a bake meets of the app itself — a link's words, the keys a browser keeps, the walkthrough's keys, the slider's steps, the publish and bake options, the manifest's lighting, what a test tab can ask the page — is the same for every space: `../app-testing-and-performance/test-tabs.md` says where each part now is.

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


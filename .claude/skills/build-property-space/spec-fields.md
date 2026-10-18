# Spec fields that matter (`server/scene/validate.js`)

What a generator writes and the validator keeps, field by field, as the code stands. The validator is world code: `../walkthrough-editor/spec-and-validator.md`, whose owner updates this file whenever the validator changes. A new field is silently dropped on seed and on every editor save until the validator keeps it.

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
- A slim window (`style: "slim"`) can carry `opens: { type: "turn"|"tilt"|"fixed", hinge: "left"|"right" }` (2026-10-16). The validator keeps those two keys on any window and drops anything else, but only a slim one acts on them (`Sash.js`'s `windowOpens`): a kit-framed window is fixed whatever it says. Without `opens`, a slim window with a sill of 0.3 m or more (`OPENS_FROM_SILL`) turns in, tilting where something is in the way, and one lower stays fixed. With it, a low one opens too, and its sash bars the way itself until it is turned 0.3 open. `left` is the emitted wall's start, as for door swings; by default each pane hangs on the jamb nearer its end of the window, a lone pane on the left (`buildings.md`, Windows that open; the app side: `../visitor-interactions/windows.md`).

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
- `people`: the people set round the space. The generator writes none and a seed's spec has none; see `../space-people/people-data.md`. It survives a seed and an editor save only because the validator keeps it.

**Heading conventions (they differ):**

| field | 0 means | 90 means |
|---|---|---|
| furniture `rotation` | faces north (−z) | faces west |
| person `rotation` | faces north (−z); lying, the head points north | faces west |
| stair `yaw` | climbs +z (south on the site) | climbs east |
| spawn `yaw` | faces +z (south) | faces east |

The stair `direction` names don't match the site: `"north"`, and kit's `"N"`, both mean yaw 0, which climbs south on the site. `"S"` climbs north. Only W/E flights have been used. Check any N/S flight in the browser.


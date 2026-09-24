# Space Walkthrough

A real-estate walkthrough tool with two modes. **Edit mode** is a
Blender-style editor for laying a property out — furniture, kitchen units,
staircases and the openings in the floor they need, doors and windows along
their walls. **Walkthrough mode** is the game: walk the result with your
client, together, with live presence and chat, and change the finishes
in-world. `Tab` switches between them.

Built on the multiplayer mechanics of [PSU-VR](https://github.com/andrewwoan/PSU-VR):
same capsule/octree movement and Socket.IO presence model. The camera is
adapted from a sibling project (pointer-lock rather than drag-to-orbit).

---

## How it works

A property is two things with different rules:

```
the building ──▶ fixed          walls, slabs, roof, the doors in their walls
                                (a procedural shell spec, or a GLB from Blender)

its contents ──▶ editable       furniture and kitchen units (catalogue GLBs,
                                or pieces lifted out of the house's own GLB),
                                staircases, floor openings, the car
```

**Only the building is fixed.** Walls, floors, ceilings and the roof never
move. Doors and windows are part of their wall, but slide along it — a door
always stays on the floor, a window can also go up and down. Everything else
can be moved, turned, duplicated and deleted in the editor, and each change
writes straight back to the scene spec, which is saved automatically.

**Things only go where they fit.** Every move is checked against the
building and the other pieces; a piece that would hit something is shown as a
red ghost at the cursor while the piece itself stays at the last place it fit.
A staircase carries the opening in the floor above it wherever it goes, and
an opening cannot be moved under furniture on the floor above.

**Snapping does the aiming.** Moves step in grid increments and turns in
15°; a piece that comes within 20 cm of a wall or the side of another piece
is pulled flush against it; and a piece that was standing on something keeps
standing on whatever is under it. Hold `Shift` to place freely.

**Finishes are procedural.** Parquet, tile, carpet, brick, plaster, pantiles,
grass and tarmac are drawn to a canvas at runtime (`TextureLibrary`), so adding
one is a data change in `shared/catalog.js` rather than a texture download.
Tiling is baked into each surface's UVs, so one GPU texture serves every
surface using a finish, and a 2 m cloakroom floor reads at the same scale as a
9 m living room.

A finish also carries a *kind* — `floor`, `wall`, `ceiling`, `roof` or
`ground` — and that is what the picker filters on, so you cannot carpet a
ceiling or tarmac a bedroom. The kind is load-bearing in one further place: a
room whose floor finish is a `ground` one *is* an outdoor slab, which is how
yards, drives, paths and roads are built without a second concept.

---

## Running it

```bash
npm install
npm run seed      # writes the bundled example properties
npm run build
npm start         # http://localhost:3000
```

### Building the models

**Every model is generated in Blender — nothing is downloaded.** The house,
all of its furniture, the furniture catalogue, the car and the kit of parts
doors, windows and stairs are dressed with are built from primitives by the
scripts in `blender/`, at real-world size in metres, so what
the app collides with is exactly what it draws. They are build outputs, not
repository content, so build them once:

```bash
npm run models    # needs Blender 4.2+; ~35 s, fully offline
npm run seed
```

That runs `build_house.py` (the .blend), `export_app.py` (Wrenfield's
furnishings GLB and the spec its structure is built from),
`export_furniture.py` (the catalogue),
`export_car.py` (the car) and `export_kit.py` (the kit). `npm run furniture`,
`npm run models -- --car` and `npm run models -- --kit` rebuild just those. Set `BLENDER=/path/to/blender` if it is not on `PATH` or
in the usual place.

The pieces are deliberately plain — boxes, cylinders and spheres — because
the point for now is that they are the right size. Where they come from:

| | |
|---|---|
| `blender/lib/joinery.py` | Built-ins: kitchen runs, islands, appliances, beds, wardrobes, bathrooms |
| `blender/lib/loose.py` | Loose pieces: sofas, chairs, stools, tables, bookcases, TVs, lamps, plants, decor |
| `blender/export_car.py` | The car, to the wheelbase, track and ride height `Car.js` drives with |
| `blender/lib/kit.py` | The kit of parts: panelled door leaves, levers, hinges and stops, skirting, mitred architraves, window frames, glazing bars and cills, stair treads, newels, turned balusters and handrails |

The kit is how a building built from a scene spec gets real joinery while
staying editable. The app still decides where every door, window and flight
goes and how big it is, then stretches each part to fit — only across the
zones the part declares (a panel's field, a moulding's run, a baluster's
plain shaft), so mitres, mouldings and turnings keep their modelled size.
Without `public/models/kit.glb` the same parts are drawn as plain boxes.

Wrenfield's furniture keeps fixed object names (`sofa_a`, `kit_island`, …),
because a saved layout refers to each piece by name; a piece can be rebuilt
differently, but renaming it orphans it from saved scenes. **A scene whose
model file is absent is skipped by `npm run seed`**, so the app runs before
the first build; Ashgrove House, being fully procedural, never needs it.

Development with hot reload (Vite on 5173, API proxied to 3000):

```bash
npm run dev
```

---

## Deploying

The server is a **long-lived process**, not a set of functions: it holds
Socket.IO connections and runs a 50 Hz presence tick with in-memory room
state. That rules out serverless platforms — and note the app is not playable
without it even single-player, because your own avatar is created only when
the server echoes `setAvatarSkin` back. So deploy the container anywhere that
runs one: Railway, Render, Fly.io.

```bash
docker build --build-arg VITE_MODEL_BASE=https://cdn.example.com -t walkthrough .
```

`render.yaml` spells the same thing out for Render; Railway and Fly read the
Dockerfile directly.

### Scenes

`sceneStore.js` picks a driver from configuration. Set `SCENES_BUCKET` and
scenes live in S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze,
MinIO); leave it unset and they are JSON files under `scenes/`, which is what
local development and `npm run seed` use.

A container's own disk is not durable and is not shared between instances, so
**set `SCENES_BUCKET` in any real deployment** — `/api/health` reports
`storage` so you can confirm which driver is live. Seed the bucket once:

```bash
SCENES_BUCKET=my-bucket npm run seed
```

| variable | purpose |
|---|---|
| `SCENES_BUCKET` | Bucket for scene JSON. Unset = local filesystem. |
| `SCENES_PREFIX` | Key prefix, default `scenes/`. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials. |
| `S3_ENDPOINT` | Only for R2 / MinIO; omit for AWS S3. |
| `VITE_MODEL_BASE` | CDN origin for the GLBs. **Build-time**, not runtime. |

### Models

Specs store model URLs relative (`/models/x.glb`), so no spec ever carries a
hostname. Build them, upload once, and point the frontend at the CDN:

```bash
npm run models                                   # needs Blender
MODELS_BUCKET=my-bucket npm run upload-models
docker build --build-arg VITE_MODEL_BASE=https://cdn.example.com -t walkthrough .
```

---

## Using it

1. **Open a space** from the list.
2. **Enter your name and pick an avatar.** You start in the walkthrough.
3. **Press `Tab`** for edit mode, and `Tab` again to walk what you made.

### Walkthrough

Click once to capture the pointer, then look with the mouse.

| | |
|---|---|
| `Mouse` | look |
| `WASD` / arrows | move |
| `Shift` | run |
| `Space` | jump |
| `E` | open / close the door you're at |
| `F` | get in / out of the car you're at |
| `T` | change the finish of the surface under the crosshair |
| `V` | first / third person |
| `Tab` | edit mode |
| `M` | menu (jump-to-room) |
| `Enter` | chat |
| `Esc` | free the cursor |

Behind the wheel, `WASD` steers and `Space` brakes; `F` gets you out.
Touch devices fall back to drag-to-look plus an on-screen joystick.

**Share the URL.** `?scene=<id>` puts everyone in the same property.

### Edit mode

Laid out like Blender's default workspace: the header has the mode switch,
the View / Add / Object menus, transform orientation, snapping and a storey
picker; the tools run down the left; the outliner (grouped by room) and the
properties panel run down the right; key hints run along the bottom. Axes
are Blender's — **Z is up**, X red, Y green, Z blue — and so are the keys:

| | |
|---|---|
| `LMB` | select (in the viewport or the outliner) — drag a piece to move it |
| `G` `R` `S` | move, rotate, scale — then move the mouse |
| `X` `Y` `Z` | lock to an axis; again for the piece's own axis; again to release |
| `Shift` `X` `Y` `Z` | lock to the plane without that axis |
| `0`–`9` `.` `-` | type an exact value |
| `Enter` / `LMB` | confirm · `Esc` / `RMB` cancel |
| hold `Shift` | no snapping while you move |
| `Shift` `A` | add — catalogue pieces, a staircase, a floor opening (searchable) |
| `Shift` `D` | duplicate and move · `X` / `Delete` delete |
| `Ctrl`/`⌘` `Z` | undo · `Ctrl`/`⌘` `Shift` `Z` redo · `Ctrl`/`⌘` `S` save now |
| `MMB` drag / `Alt` + drag | orbit · add `Shift` to pan · wheel or pinch to zoom |
| `Numpad` `7` `1` `3` (or `7` `1` `3`) | top / front / right; `Ctrl` for the opposite side |
| `Numpad` `5` | perspective / orthographic · `.` frame selected · `Home` frame all |
| `Page Up` / `Page Down` | work on the floor above / below |
| `/` | the selected piece's room on its own; again for everything |
| `Alt` `Z` | X-ray · `Alt` `H` unhide every floor and room |
| `N` / `T` | toggle the sidebar / toolbar |
| `Shift` `Tab` | toggle snapping |

The gizmo does the same with the mouse: arrows move along an axis, squares
in a plane, the white ring freely, the blue ring turns, the cubes scale. The
navigation gizmo in the corner orbits when dragged and snaps to an axis view
when an axis is clicked; below it, drag the magnifier to zoom and the hand to
pan — which, with *View → Trackpad*, is all a laptop needs.

**Working on one floor or one room.** The outliner lists the property the
way Blender lists collections: each floor, the rooms on it with the pieces in
them, then the site outside and the roof. Click a floor or a room there (or
pick one in the header) and everything else is hidden — the ceiling over it
too, so you look straight in — and the view frames it; click it again, or the
× on the chip in the viewport, to see the whole property. A room is cut to
its own walls. `Page Up` / `Page Down` step through the floors, and `/` shows
the selected piece's room on its own. The eye beside each floor and room
hides it without narrowing the view (`Alt` `H` shows everything again), and
clicking a piece that is out of view in the outliner brings its room up.

**Seeing and selecting through walls.** A click is never stopped by a wall:
aim at the sofa behind one and the sofa is selected. Floors and ceilings do
stop a click, so an empty spot on the floor still deselects rather than
picking up whatever is on the storey below. **X-ray** (`Alt` `Z`, or the
header button) draws walls, ceilings and the roof see-through; floors, door
and window frames and furniture stay solid.

With `7` for the top view, a floor on its own is the floor plan. **Walk from
here** drops you onto the floor in the middle of the view.

What can be done to what:

| | move | rotate | scale | add / duplicate / delete |
|---|---|---|---|---|
| furniture, kitchen units | ✓ | ✓ | uniform | ✓ |
| staircase | ✓ (carries its floor opening) | ✓ | width, length, rise, steps in the panel | ✓ |
| floor opening | on its level | ✓ | width and depth | ✓ (generated shells) |
| door, doorway, archway | along its wall, on the floor | | width, height in the panel | |
| window | along and up its wall | | width, height in the panel | |
| car | on the ground | ✓ | | |
| walls, floors, ceilings, roof | fixed | | | |

A staircase needs the floor above it open. One added from the menu comes with
its own opening; one without can get one from **Cut opening above** in its
properties, or be placed under an opening made with *Add → Floor opening*.

Every change is saved to the scene as it is made; the header says when.
Others in the same space see the edits when they next open it.

### Changing finishes

In the walkthrough, the dot at the centre of the screen is the selector.
Point it at a floor, wall or ceiling and the HUD names the surface and its
current finish; press `T` for a swatch grid of everything valid for that
surface kind. Walls have two independent faces, so the bathroom side can be
tiled while the hallway side stays painted.

### Bringing in objects from Blender

1. Model the piece in Blender at real size, in metres, with its **origin at
   the centre of its base** and its front facing −Y.
2. Export glTF binary (`.glb`) with **+Y Up** (the exporter's default). Draco
   compression is fine.
3. Drop it in `public/models/furniture/` and add an entry to
   `public/models/furniture/catalog.json`:

   ```json
   {
       "id": "armchair-oak",
       "name": "Oak armchair",
       "category": "seating",
       "url": "/models/furniture/armchair-oak.glb",
       "scale": 1,
       "yaw": 0,
       "size": [0.8, 0.9, 0.85],
       "anchor": "floor",
       "collision": "mesh"
   }
   ```

   `collision` is optional: `mesh` (exact), `box` (its bounding box — cheaper
   for dense models) or `none`; by default pieces under 6,000 triangles
   collide as their mesh and heavier ones as a box.
4. Reload: it is in the Add menu (`Shift` `A`) under its category.

To keep a piece in the generated catalogue instead, write it as a function in
`blender/lib/loose.py` (or `joinery.py`) that builds it from primitives at its
real size, add a line to `PIECES` in `blender/export_furniture.py`, and run
`npm run furniture`. Wall-hung pieces take `"wall"` as their anchor, so the
editor places them at hanging height and does not drop them to the floor.

A whole house's furnishings can come from Blender as one GLB. With
`"role": "furnishings"` on the model, every top-level node — each sofa,
cabinet and picture — is lifted out on load and becomes a piece the editor
can move, exactly like a catalogue one, while the building is the spec's own
rooms, walls and roofs (Wrenfield House does this; see
`scripts/seed-scenes.js`). A model can also be the building itself: list the
node-name prefixes that make it up in `model.fixed_nodes`, and every other
top-level node is lifted out the same way — but then its walls and floors
are mesh, and doors cannot slide or floors be cut.

## Project layout

```
shared/catalog.js         Finishes, trims, door types, environment presets
server/
  scene/validate.js       Repairs, clamps, fits openings to walls, migrates
                          older specs (stairwell voids -> floor openings)
  api/                    Scenes CRUD
  sockets/                Per-scene presence (50 Hz) and chat
frontend/Experience/World/
  SceneBuilder.js         Spec -> scene graph; rebuilds what the editor
                          changes; surface registry, doors, model parts
  Collision.js            Static + dynamic octrees the player walks against
  Door.js                 Openable door: geometry, swing, own collision
  Builders/
    TextureLibrary.js     Canvas-generated finishes
    MaterialLibrary.js    One material per finish; UV-baked tiling
    StructureBuilder.js   Floors and ceilings with openings cut, walls with
                          punched openings, roofs, stairs
    FurnitureLibrary.js   Model catalogue (files, and pieces of the house
                          GLB) and instancing
frontend/Experience/Editor/
  Editor.js               Edit mode: selection, keys, undo, add/delete,
                          floor/room focus, X-ray
  Collections.js          Which floor and room every part of the building
                          and every piece belongs to
  EditorUI.js             Header, toolbar, outliner, properties, menus
  EditorCamera.js         Turntable viewport camera, axis views, ortho
  TransformSession.js     One move/turn/scale: constraints, snapping, fit
  Editables.js            What can be edited, and how: furniture, stairs,
                          floor openings, doors/windows, the car
  FitChecker.js           Does it fit? Oriented boxes vs the building and
                          the other pieces
  Snapper.js              Grid, flush-to-face and rest-on-surface snapping
  Gizmo.js                The transform gizmo
public/models/furniture/  Drop .glb files here + list in catalog.json
scenes/                   Saved properties (JSON, safe to hand-edit)
scripts/seed-scenes.js    Writes the bundled examples
scripts/inspect-glb.mjs   Pre-import report for a GLB
```

`window.experience` is exposed in the console once a property is open.

### Bundled properties

| | |
|---|---|
| **Ashgrove House** | Fully procedural — three storeys, 19 rooms plus 11 outdoor slabs, 37 walls, 18 working doors, two climbable flights, a pantiled roof, an attached garage, and a site with road, drive, path, yards and patio. The worked example of the spec format. |
| **Wrenfield House** | A hybrid, three storeys, ~380 m². The structure — 36 walls with their 18 doors, 25 windows and 3 open doorways, floors, ceilings, roofs, both flights and their stairwells — is built by the app from `scripts/wrenfield-spec.json`, so doors and windows slide and floors can be cut like Ashgrove's. Its 110 pieces of furniture, the fitted kitchen and the bathrooms are modelled in Blender and all editable. Both come from the same data in `blender/lib/structure.py` and `plan.py`, via `blender/export_app.py`; `blender/build_house.py` builds the whole house in Blender for renders. |

### Importing a whole building as a GLB

A scene can point at a model instead of describing geometry:

```json
"model": {
  "url": "/models/my_house.glb",
  "scale": 1,
  "offset": [0, 0, 0],
  "rotation": 0,
  "collision": "mesh",
  "fixed_nodes": ["slab_", "fl_", "wall", "ce_", "roof"]
}
```

`material` optionally overrides every surface with one flat colour, for
exports that carry none of their own.

Run `node scripts/inspect-glb.mjs <file>` first — it reports extents, whether
the export has textures, a scale derived from objects of known real size, and
the most open floor positions to use as spawns. `collision` is `mesh`, `box`,
`none`, or `auto` (mesh under the triangle budget, box above it); pin `mesh`
on anything whose geometry must be stood on.

---

## Design notes worth knowing

**The fit test uses boxes for the piece and triangles for everything else.**
A moving piece is one oriented box (a staircase is one per tread; a floor
opening is the column of air above it), shrunk by 1.5 cm so that pieces
standing on a floor or snapped flush against a wall count as fitting. It is
tested box-against-box with wall panels, and triangle by triangle against
slabs, the imported building and other pieces — so a microwave can stand on
a worktop and a stool can go under a table's overhang. Overlaps between
pieces that were already there when a move started (a hob sunk into an
island, an oven built into a tall unit) are carried through the move; the
building gets no such allowance.

**A floor opening cuts the whole slab sandwich.** It sits at a storey's floor
level and cuts that floor *and* the ceiling of the room below, which in
these houses is a slab's depth lower (2.6 m rooms under 2.8 m storeys). Slabs
are triangulated and each triangle has the opening clipped out of it, so an
opening may straddle two rooms or run past a room's edge.

**The octree stops splitting when splitting stops helping.** three's Octree
subdivides any cell with more than eight triangles to sixteen levels. Big
near-coplanar triangles — a lawn, a drive and a floor slab a few centimetres
apart — land in every child of every cell they cross, so the tree multiplies
along their plane: Wrenfield's shell came out at 4.6 million cells and 2.6 GB
of heap. `Collision.js` stops a split that no longer separates anything, or
below a quarter-metre cell; the same house is now about 200 MB.

**Collision is split into what moves and what doesn't.** The building's
octree is built once (and again only if a door slid along a wall); furniture
and stair ramps go into a second, small one that is rebuilt on the way back
to the walkthrough.

**A wall is built centred on its line.** A 0.35 m external wall drawn along
x = 0 therefore has its inner face at 0.175, not 0.35 — so room polygons and
partitions that start at `EXT` leave a gap all the way round the building.
The external rings are set in by `EXT_H` so their inner faces land where
everything else expects them.

**A stairwell void stops at the head of the flight, never past it.** Carried
further it leaves a stretch with neither floor nor stair to fall through, and
a landing rail across the head fences off the way down. Both the structural
slab *and* the room's floor-finish overlay need the hole — cutting only the
slab leaves a 2 mm lid over the stairwell that is invisible and stands on
exactly like a floor.

**A glTF export cannot carry a procedural material.** The format has room for
a constant `baseColorFactor` or an image and nothing else, so a Base Color fed
by Blender's Noise/Brick/ColorRamp nodes exports as plain white — which is how
a fully painted house first arrived in the app as a colourless one. Each
material therefore records a bake recipe, and `blender/export_app.py`
regenerates the pattern as a seamless 512px image (`blender/lib/bake.py`,
numpy) and box-projects world-space UVs at that material's tile size. One
image serves every surface using a finish; nothing is unwrapped per object.
Each baked tile is scaled so its mean matches the flat colour the palette was
tuned against, because grout lines and board joints otherwise drag every floor
about a quarter darker.

**The car is arcade, not simulated.** Its enter/exit flow, chase camera and
controls come from the sibling `game` project, but not its physics: that car
is a Rapier raycast vehicle in a world built entirely from Rapier colliders,
whereas everything here — the player included — collides against a three.js
Octree. Running a second physics world alongside the octree, plus two
megabytes of wasm, is a poor trade for a car that lives in a garage and on a
drive, so `Car.js` uses the same octree: a ray per wheel to sit it on the
ground and take its pitch, and a swept capsule for walls. That capsule is
lifted clear of the road on purpose — one wide enough to span the car has a
lower hemisphere that otherwise ploughs the floor slab and brakes it to a
standstill on flat tarmac.

**Doors are not in the collision octree.** That octree is built once and is
static, so a leaf baked into it would either block a doorway forever or never
block it at all. Doors attach to the scene graph *after* the octree is closed
and collide through their own capsule-vs-oriented-box resolve each frame.

**Openings are cut by splitting, not CSG.** A wall becomes solid panels around
each hole, so every panel stays a box and the octree stays cheap. The cost is
that a wall's openings cannot overlap along its length — two windows can't
share an x at different heights — which is why a multi-storey building gets one
ring of external walls *per storey*, each with its own `base_height`.

**Stairs are drawn and collided separately.** The treads are cosmetic; what you
actually walk on is an invisible ramp through their nosings, laid in the
collider group. The capsule physics has no step-up assist, so discrete treads
would stop a visitor at the first riser, but a slope it resolves perfectly. The
ramp runs half a metre on past the bottom step, dipping below the floor, so the
foot of a flight is a slope rather than a lip.

**Rooms can have holes.** Older specs drew a stairwell as `voids` on the
room polygons, which cut through a room's floor *and* its ceiling. The
validator now turns each one that sits over a flight into a floor opening tied
to that flight; voids that serve no flight still work as they did.

**Every opening that reaches the floor gets a threshold.** Room polygons stop
at the inner faces of their walls, so the wall's thickness is a gap in the
floor — harmless under a solid panel, a slot straight through to the ground in
every doorway.

**Wall faces are BoxGeometry material groups.** Side A is `+Z` in the wall's
local frame (the left of `start`→`end`), side B is `-Z`. That is what lets one
wall carry two finishes without doubling the geometry — and why the surface
registry, not the mesh, is the authority on which finish a given face wears.

---

## Known limitations

- **Edits are not broadcast live.** Changes save immediately, but others in
  the same space see them when they next open it.
- **Edit mode is for a mouse and keyboard.** Touch devices keep the
  walkthrough.
- **Imported buildings keep their own stairs and floors.** A GLB's slabs are
  mesh, so openings cannot be cut in them and its baked flights stay where
  they are. Stairs added in the editor to an imported house need somewhere
  that is already open above them.
- **Stairs inside imported models are only climbable with a ramp.** A
  staircase that arrives as GLB geometry needs a `stairs` entry for its ramp
  collider; the capsule physics has no step-up assist.
- **Rotation is about the vertical only.** Furniture stands upright; tilt it
  in Blender.
- **Roofs are gable or flat, over a bounding box.** No hips, dormers, valleys
  or L-shaped plans; a building that isn't roughly rectangular needs more than
  one roof.
- **Imported models have no retextureable surfaces.** The finish picker works
  on generated shells only — a GLB's materials come from its own file.
- **Very heavy imports lose exact collision.** Past ~500k triangles the octree
  build freezes the tab, so a model that heavy falls back to bounds collision
  and you can walk through its interior walls.
- **Joinery is opt-in and plain.** Walls take skirting and door casings
  (`trims`: `"a"`, `"b"` or `"both"`), windows glazing bars (`panes`) and a
  cill (`cill`), flights a balustrade (`balustrade`) and stairwells rails
  (`rails`); all are simple boxes, drawn but not collided with, except the
  invisible panel along each rail and balustrade.
- **No auth.** Anyone with the URL can enter and edit.

---

## Credits

Multiplayer architecture and avatar rig adapted from
[PSU-VR](https://github.com/andrewwoan/PSU-VR) by Andrew Woan.
Characters from [Ready Player Me](https://readyplayer.me/).

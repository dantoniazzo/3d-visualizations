# Space Walkthrough

A real-estate walkthrough tool. Describe an apartment or house in plain
English, get a floor plan you can walk through with your client — together,
with live presence and chat — then furnish it from imported models and change
the finishes in-world.

Built on the multiplayer mechanics of [PSU-VR](https://github.com/andrewwoan/PSU-VR):
same capsule/octree movement and Socket.IO presence model. The camera is
adapted from a sibling project (pointer-lock rather than drag-to-orbit).

---

## How it works

The pipeline splits the building from its contents, because they want
different tools:

```
brief ──▶ Claude ──▶ shell spec ──▶ validator ──▶ builders ──▶ three.js
                     rooms, walls,   repairs &     procedural
                     openings, doors, clamps       geometry
                     stairs, roofs,
                     grounds, finishes

furniture ──▶ catalogue of imported .glb models ──▶ placed in-world
finishes  ──▶ procedural textures ──▶ swapped by pointing at a surface
```

**Claude only draws the shell** — rooms, walls, openings, doors, the stairs
between storeys, the roof over them and the ground around them, plus the
finish on every surface. It does not furnish anything. Floor plans are the one
part of this an LLM is genuinely good at, and keeping generation to the
building makes the output small, fast and checkable.

**Furniture is imported, not generated.** Drop `.glb` files into
`public/models/furniture/`, list them in `catalog.json`, and they appear in
the placement picker. Sketchfab, IKEA and Poly Haven exports all work.

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

Binary models are build outputs, not repository content — the Blender scene
alone is well over 100 MB. Wrenfield House is generated from
`blender/build_house.py`, so build it once:

```bash
npm run models    # needs Blender 4.2+; writes the .blend and its GLB
npm run seed
```

Set `BLENDER=/path/to/blender` if it is not on `PATH` or in the usual place.
The first run downloads roughly 145 MB of CC0 furniture from Poly Haven into
`blender/cache/`, after which builds are offline.

Two scenes point at third-party models that are not ours to redistribute —
`public/models/apartment_2.glb` and `studio_apartment.glb`. Drop your own
copies in `public/models/` to enable them. **Any scene whose model file is
absent is skipped by `npm run seed`**, so the app runs either way; the fully
procedural properties never need this step at all.

Development with hot reload (Vite on 5173, API proxied to 3000):

```bash
npm run dev
```

### AI generation

Needs Anthropic **API** credentials — note that a Claude Pro/Max subscription
covers Claude Code and claude.ai but bills the API separately. Either set
`ANTHROPIC_API_KEY` in `.env`, or run `ant auth login` (the SDK reads the
resulting OAuth profile automatically). Without credentials the app still
runs: you can open, walk, furnish and retexture saved properties; only
*Generate* and *Apply change* return a clear error.

```
SCENE_MODEL=claude-opus-5     # default
SCENE_EFFORT=high             # low | medium | high | xhigh | max
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
| `ANTHROPIC_API_KEY` | Only for AI generation. |
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

1. **Describe a property**, or open a saved one.
2. **Enter your name and pick an avatar.**
3. **Click once to capture the pointer**, then look with the mouse.

   | | |
   |---|---|
   | `Mouse` | look |
   | `WASD` / arrows | move |
   | `Shift` | run |
   | `Space` | jump |
   | `E` | open / close the door you're at |
   | `T` | change the finish of the surface under the crosshair |
   | `V` | first / third person |
   | `M` | menu (furnishing, jump-to-room, revisions) |
   | `Enter` | chat |
   | `Esc` | free the cursor |

   Touch devices fall back to drag-to-look plus an on-screen joystick.

4. **Share the URL.** `?scene=<id>` puts everyone in the same property.

### Changing finishes

In first person the dot at the centre of the screen is the selector. Point it
at a floor, wall or ceiling and the HUD names the surface and its current
finish; press `T` for a swatch grid of everything valid for that surface kind
(you can't put carpet on a ceiling). Walls have two independent faces, so the
bathroom side can be tiled while the hallway side stays painted. Changes save
automatically.

### Furnishing

`M` opens the menu. Pick a catalogue item and it enters placement mode: the
piece follows the crosshair, `[` and `]` (or the wheel) rotate, click drops
it, `Esc` cancels. Placed items are listed in the menu and can be removed.

---

## Project layout

```
shared/catalog.js         Finishes, trims, door types, environment presets
server/
  ai/schema.js            JSON Schema for a shell — no furniture
  ai/generator.js         The Claude call (structured output, streamed)
  ai/validate.js          Repairs, clamps, and fits openings to walls
  api/                    Scenes CRUD, generation
  sockets/                Per-scene presence (50 Hz) and chat
frontend/Experience/World/
  SceneBuilder.js         Spec -> scene graph, surface registry, doors
  Door.js                 Openable door: geometry, swing, own collision
  Builders/
    TextureLibrary.js     Canvas-generated finishes
    MaterialLibrary.js    One material per finish; UV-baked tiling
    StructureBuilder.js   Floors, ceilings, walls with punched openings,
                          roofs, stairs
    FurnitureLibrary.js   Imported-model catalogue and instancing
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
| **Wrenfield House** | Modelled and furnished in Blender, imported as GLB — three storeys, ~380 m². Exported *without* door leaves, so its 17 doors are rebuilt programmatically by the app and open with `E`; both stair flights are walkable via ramp colliders. Built by `blender/build_house.py` + `blender/export_app.py`. |
| **Studio Loft** | Imported GLB, untextured white model. |
| **Scanned Apartment** | Imported GLB with baked textures. |

### Importing a whole building as a GLB

A scene can point at a model instead of describing geometry:

```json
"model": {
  "url": "/models/studio_apartment.glb",
  "scale": 0.39,
  "offset": [0, 0, 0],
  "rotation": 0,
  "collision": "mesh",
  "material": { "color": "#cfcac2", "roughness": 0.85, "metalness": 0 }
}
```

Run `node scripts/inspect-glb.mjs <file>` first — it reports extents, whether
the export has textures, a scale derived from objects of known real size, and
the most open floor positions to use as spawns. `collision` is `mesh`, `box`,
`none`, or `auto` (mesh under the triangle budget, box above it); pin `mesh`
on anything whose geometry must be stood on.

---

## Design notes worth knowing

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

**Rooms can have holes.** `voids` cut through a room's floor *and* its ceiling,
which is exactly what a stairwell needs: the storey a flight arrives at wants
its floor open, and the storey it leaves wants its ceiling open. One hole in
the right room does both.

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

- **Stairs inside imported models are still not climbable.** Generated flights
  work, because they carry their own ramp collider. A staircase that arrives as
  GLB geometry does not, and the capsule physics has no step-up assist to fall
  back on — so the studio loft's mezzanine is reachable only via its jump-list
  entries. Fixing that case means adding step-up handling to
  `Player.updateColliderMovement`.
- **Roofs are gable or flat, over a bounding box.** No hips, dormers, valleys
  or L-shaped plans; a building that isn't roughly rectangular needs more than
  one roof.
- **Attic windows only go in gable-end walls.** The eaves wall ring is short,
  and nothing puts an opening in the roof slope itself.
- **An imported model can now carry working doors and stairs.** A top-level
  `doors` array places a `Door` at a plan position, and `stairs` entries in a
  model scene contribute only their ramp colliders. `model.collision_exclude`
  keeps the model's own tread geometry out of the octree — without it the
  baked risers catch the player's capsule a metre up the flight.
- **Imported models have no retextureable surfaces.** The finish picker works
  on generated shells only — a GLB's materials come from its own file.
- **Very heavy imports lose exact collision.** Past ~500k triangles the octree
  build freezes the tab, so those scenes fall back to bounds collision and you
  can walk through interior walls. The scanned apartment (1.36M) is one.
- **The furniture catalogue ships empty.** The system is built and tested, but
  no models are bundled — licensing is yours to choose.
- **No skirtings or architraves.** The shell is deliberately simple.
- **No auth.** Anyone with the URL can enter, edit and generate.

---

## Credits

Multiplayer architecture and avatar rig adapted from
[PSU-VR](https://github.com/andrewwoan/PSU-VR) by Andrew Woan.
Characters from [Ready Player Me](https://readyplayer.me/).

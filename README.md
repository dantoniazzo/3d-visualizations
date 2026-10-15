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

**Finishes are procedural.** Parquet, tile, carpet, brick, plaster, pantiles
and tarmac are drawn to a canvas at runtime (`TextureLibrary`), so adding
one is a data change in `shared/catalog.js` rather than a texture download.
The garden's ground is the one image: Fluffy Tree's gradient, laid once
over the whole garden rather than tiled.
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
all of its furniture, the furniture catalogue and the kit of parts doors,
windows and stairs are dressed with are built from primitives by the
scripts in `blender/`, at real-world size in metres, so what
the app collides with is exactly what it draws. (The cars, the avatars
and the people are bought in; see below.) They are build outputs, not
repository content, so build them once:

```bash
npm run models    # needs Blender 4.2+; ~35 s, fully offline
npm run seed
```

That runs `build_house.py` (the .blend), `export_app.py` (Wrenfield's
furnishings GLB and the spec its structure is built from),
`export_furniture.py` (the catalogue),
`import_cars.py` (the cars), `export_kit.py` (the kit) and `export_props.py`
(what the people hold). `npm run furniture`,
`npm run models -- --cars`, `npm run models -- --kit` and `npm run props` rebuild just those. Set `BLENDER=/path/to/blender` if it is not on `PATH` or
in the usual place.

The avatars are the exception: they are bought-in characters, kept as
sources in `assets/avatars/`. `npm run avatars` writes the versions the app
loads to `public/models/`:
- redundant animation keys resampled away;
- the unused clip and face morphs left out;
- textures cut to what a character a few hundred pixels tall can show
  (512², normal maps 256²), as WebP;
- meshopt compression with its rotation and normal filters.

That takes them from 9 MB to 1.6 MB, and 0.9 MB as sent, with every pose
within a degree of the original.

**The people set round a property are bought in too**: characters and
animation clips from [Mixamo](https://www.mixamo.com) (Adobe), who stand
with a drink on the terraces, sit on the sofas and chairs and lie on the
pool loungers (`World/People.js`). The downloads are kept out of the
repository — Mixamo's files are for use in a project, not for passing on —
in `assets/people/`, which is git-ignored; the app ships what
`npm run people` makes of them. Those converted files
(`public/models/people/<id>.glb`, `clips.glb`, `index.json`) are
git-ignored as well, this repository being public: a clone without them
draws the two stand-in characters (`index.standin.json`) until
`npm run people` has been run on the downloads, or the files copied in
beside a deploy. To add a character or a clip:

1. Download it from Mixamo into `assets/people/characters/` or
   `assets/people/animations/`:
   - a character as **FBX Binary, With Skin, T-pose**;
   - a clip as **FBX Binary, Without Skin, 30 fps, keyframe reduction
     none**, the file named after the clip (`Sitting Talking.fbx`) —
     whether it stands, sits or lies is read from the name.
2. `npm run people` (needs Blender; about a minute) converts them all:
   `blender/import_people.py` brings every character and clip to one
   skeleton in metres, and `scripts/optimize-people.mjs` packs them into
   `public/models/people/` — a compressed `<id>.glb` a character,
   `clips.glb` for every clip, and `index.json`, the list the app and the
   planner read. Until there is one the app uses stand-ins made from its
   own two avatars.
3. `npm run props` rebuilds what they hold and have beside them —
   glasses, a bottle, a cup, a towel, books, sunglasses — which are not
   bought in: `blender/lib/props.py` builds each in Blender, into
   `public/models/people/props.glb`. Run it before `npm run people` when
   a prop is new, so the index lists it.
4. `npm run seats` measures where one sits or lies on each piece of the
   furniture catalogue (`public/models/furniture/seats.json`); run it
   again after `npm run furniture` changes a sofa, a chair or a lounger.
5. `npm run people:place -- <scene> --seed n` plans a space's people
   (`shared/people.js`) and writes them into its spec, where the editor
   moves, turns, adds and removes them; another seed is another
   arrangement, `--dry-run` only prints it. Reload any open editor tab of
   the space first, or it autosaves its old spec over them.

The characters and clips there now, and their licence, are listed in
`assets/THIRD_PARTY.md`.

The pieces are deliberately plain — boxes, cylinders and spheres — because
the point for now is that they are the right size. Where they come from:

| | |
|---|---|
| `blender/lib/joinery.py` | Built-ins: kitchen runs, islands, appliances, beds, wardrobes, bathrooms |
| `blender/lib/loose.py` | Loose pieces: sofas, chairs, stools, tables, bookcases, TVs, lamps, plants, decor |
| `blender/import_cars.py` | The cars the editor offers (below), each split into the body and wheels `Car.js` drives, with its wheelbase, tracks and wheel sizes measured |
| `blender/lib/kit.py` | The kit of parts: panelled door leaves, levers, hinges and stops, skirting, mitred architraves, window frames, glazing bars and cills, stair treads, newels, turned balusters and handrails |
| `blender/lib/props.py` | What the people hold or have beside them: wine glasses, a champagne flute, a tumbler, a beer bottle, a coffee cup, a folded towel, a book closed and open, sunglasses |

**The cars are bought in, like the avatars.** Each is a model downloaded
from Sketchfab and kept as it came in `assets/cars/`, listed in
`assets/cars/cars.json` — its id, its name, and the two things a model
does not say about itself: its size (a `scale`, or its real `length`) and
which way its nose points. The cars there now, and their licences (all
non-commercial; credit the author, read from each file):

| Car | Model by | Licence |
| --- | --- | --- |
| BMW X6 M (2016) | [Ddiaz Design](https://sketchfab.com/3d-models/2016-bmw-x6-m-9cba50132a864bd79bfab48bd631574d) | CC BY-NC-SA 4.0 |
| Chery Jaecoo J7 (2025) | [Ddiaz Design](https://sketchfab.com/3d-models/2025-chery-jaecoo-j7-02e3ca1e9a8f4c7aad40617bd0693615) | CC BY-NC-SA 4.0 |
| BMW M4 Widebody | [VTX](https://sketchfab.com/3d-models/bmw-m4-modified-widebody-61b1259b14ae4840ba1b0e9d819e60c1) | CC BY-NC-SA 4.0 |
| Ford F-150 Raptor | [Outlaw Games™](https://sketchfab.com/3d-models/ford-f150-raptor-5bde9684bf6d40e0902ee8e482ad1063) | CC BY-NC 4.0 |

`npm run models -- --cars` turns each into what the app drives, in
`public/models/cars/<id>/`: `body.glb` (everything but the wheels — body,
glass, lamps, interior), `wheels.glb` (a front and a rear wheel, each what
turns and what does not — its caliper), a picture, and one
`public/models/cars/index.json` of them all, with each car's wheelbase,
tracks, wheel sizes and body extent, which `Car.js` drives it by. Nothing
else about a model is known in advance, so `blender/import_cars.py` finds
its wheels by their shape: the tyres are the parts round in side view that
reach the ground at the four corners, each's axle the way it spreads least
(a model posed with its front wheels steered, like the Raptor, has them
straightened); everything inside a tyre turns with it, its tread blocks
too, but for materials that sit off its axle, like a caliper. The files are
packed for the web with meshopt and WebP textures of 2048 px at most — the
four cars are 85 MB as downloaded and about 13 MB here. Each car's models
were made for a viewer's image-based lighting, so `Car.js` gives all their
metals the studio reflections the rest of the app gives only polished ones.

In the editor, select the car and press **Change car…**: the cars on offer
open in a ring round it, each its picture and name, the one it is marked;
the hub in the middle names the car under the pointer, who made it and
what choosing it downloads. Choosing one downloads it — the hub counts it
in — and puts it on the car where it stands, one step to undo. A scene's
vehicle stores which car it is (`model`, an id from the index); its own
cars are loaded with it, any other only when chosen. To add a car, put its
GLB in `assets/cars/`, list it in `cars.json`, and run `npm run models --
--cars <id>`.

Driven, a car's lamps work (`World/Vehicle/CarLights.js`): its daytime
running lamps and tail lamps while it is, its headlights, on by themselves at
night and off by day — `H` turns them on or off for the drive — its brake
lamps, the tail lamps brighter, when it brakes (`Space`, or backing while it
still rolls forward) and its reversing lamps when it backs. Each lamp is the
model's own, lit in its own shape: its glass, light guides and reflectors —
the X6's rings, the M4's laser-blue guides, the Raptor's C-shaped running
lamps, the Jaecoo's full-width tail bar. Which of a model's parts is which
lamp is listed for each car in `LAMPS` (a material, at the nose or the tail,
at a height, lit by its red or its clear parts); a car not listed lights its
lamp materials at its nose white and the red ones at its tail. At night each
lamp has a glow round it as well. The beam: where the view takes live light
(the editor's realistic preview, a public view lit live), a dipped
spotlight that lights the road, the garage, the house; drawn from the bake,
a pool of light on the road ahead; under the editor's plain light only the
lamps' glass. Parked, everything is off.

The X6 was also modelled, and that is kept to take further:
`blender/export_car.py` builds an X6 M as a quad cage the way a car
modeller does — the method of Enpix's *Best Way To Model A Car In Blender*
— from lines measured off the imported model (`blender/lib/x6.py`,
`carbody.py`), shrinks the cage onto that model's surface as in retopology
(`fit.py`, `x6_reference.py`), and adds its details and wheel
(`x6_parts.py`, `x6_wheel.py`). It writes its GLBs and `bmw_x6.blend` to
`blender/out/`, not to the app's models: run it with `blender --background
--python blender/export_car.py`.

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

The server serves the build, the scenes and the published versions of the
folder it is started in — `dist/`, `scenes/`, `published/` — and
`SCENES_DIR` and `PUBLISH_DIR` move the last two. So a second copy of the
app can run beside the one in use without touching it: build somewhere
else (`npx vite build --outDir /abs/path/dist-work --emptyOutDir`), and
start `node /path/to/repo/server/index.js` with another `PORT` from a
folder whose `dist` is, or links to, that build, with `SCENES_DIR` at a
copy of `scenes/`.

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
| `P` | realistic preview on / off (see Edit mode) |
| `Tab` | edit mode |
| `M` | menu (jump-to-room) |
| `Enter` | chat |
| `Esc` | free the cursor |

Behind the wheel, `WASD` steers and `Space` brakes; `H` turns the
headlights on or off; `F` gets you out.
Touch devices fall back to drag-to-look plus an on-screen joystick.

**Share the URL.** `?scene=<id>` puts everyone in the same property.

### Public view

`/view/<id>` is the link to send clients. It walks, drives, opens doors and
chats exactly like the walkthrough, but nothing in it edits or saves: no edit
mode (its code is not even downloaded), no finish picker, no way back to the
library. Because nothing will move, it is also drawn far more cheaply: once
the furniture is in, everything static is merged into one mesh per material
per floor — a tenth of the draw calls. (All glass is plain see-through glass,
here and in the walkthrough, never refracting: a refractive pane anywhere in
view redrew every opaque thing and darkened the whole frame — a shower's door
left a bathroom near black.)

**Bird's-eye view.** **B**, or the *Bird's-eye* button, looks down on one
floor at a time with everything over it taken away: the floors above, the
floor's own ceilings and the roof, like a doll's house with its top lifted
off. Drag to turn and tilt it; scroll or pinch to go nearer or further. It
follows you: you keep walking (WASD or the stick, the way the view faces)
and chatting, and it shows whichever floor you are on, so going upstairs
takes the view up a floor. The floor picker, or **Page Up** and **Page
Down**, shows another floor; walking again brings the view back to yours.
**V** or *Walk* goes back to walking. The view stays within the distances
(6–24 m) and angles (30° and steeper) the publish looked from, so no face it
threw away can come into sight (`frontend/Experience/World/BirdView.js`).

A floor is a storey as a visitor counts them (`shared/storeys.js`): every
building's ground floor together, with the terraces and the street round
them, then their first floors, then their roof terraces — whatever heights
the buildings stand at. (Ladonia's villas stand on nine floor levels, some a
centimetre apart; they list as *Ground floor*, *First floor*, *Roof
terrace*, and so do the lights in the *Lights* panel.) The garden goes by
the floor it grows on, as the house does: a roof terrace's planters go with
the roof.

The view is always drawn from the bake, with nothing live: no live sun or
lamps on the house, no shadow map drawn again while it is open, nothing
kept for its shadow — whichever way the walkthrough is lit, which comes
back as it was when the view is left (`World.lightFromAbove`). By day a
baked room holds a tenth to a hundredth of the garden's light, and one
exposure cannot show both: from above, the floor shown is exposed as its
rooms would be, by bringing up the rooms' own baked light short of burning
out (`Realism.js`'s `LightMeter.above`, `SceneBuilder`'s `INDOOR_LIFT`),
while the garden keeps the outside's exposure. A version that was not
baked has no bake to draw from: its view from above is drawn flat, the sun
unshadowed and none of its lamps lit (the lit rooms still glow).

Walking, a baked room by day is exposed for what the camera sees in it, as
a photographer meters a room (`Realism.js`'s `LightMeter`): a glazed living
room a few times over the garden's exposure, a bedroom with one window ten
to thirty. The meter reads the frame that was just drawn — its light before
any exposure, which the post-processing has — brought down to a few pixels
and read back a frame or two later, without waiting for the GPU; nothing is
drawn a second time for it. Where the view is drawn straight to the screen
(the two lowest steps, and a space without a sky of its own at any step) it
takes the room's own light from the bake's probes instead, and a fully
baked view at the lowest steps one exposure for every room. A space
without its own sky is metered the same way: its baked rooms used to be
left as dark as the bake has them beside the day outside. At night the
outside keeps the night's exposure, and a room whose own lamps are on is
metered for the part of the frame they light — up to twice the night's
exposure: drawn from its bake at the exposure that suits the dusk, a
lamplit room came out a quarter darker than the same room lit live. A
room open to the air, a loggia, counts as out of doors.

**Publishing** makes the public view lighter still. *Publish* in the editor
(or *Publish public view…* in its menu) takes a snapshot of the space as a
visitor can see it and sends it to the server, which keeps it as a fixed
version: `/view/<id>` opens the latest, and editing the space afterwards
changes nothing there until it is published again. The snapshot:

- renders every static triangle, by id, from thousands of places a camera
  can be — every room at three heights, the stairs, the garden, and a
  bird's-eye orbit of each floor with the floors above taken away — and
  throws away every face none of them sees: undersides of furniture, faces
  pressed against walls, the insides of overlapping boxes;
- turns round any face that was only ever seen from behind, and splits a
  surface seen from both sides into two single-sided ones, so the whole
  view draws with back-face culling;
- merges what is left into one mesh per material and floor;
- checks itself from a second, random set of viewpoints and puts back
  anything that set sees, reporting how much that was.

On Wrenfield that is 205,570 triangles down to 139,685, in about two
minutes. Versions are kept under `published/<id>/` on the machine that runs
the server (`PUBLISH_DIR` moves it): `snapshot.glb` as sent — the input to
baking the lighting, next — `spec.json`, `view.glb`, Draco-compressed,
which is what the public view downloads, and the version's `manifest.json`.

Straight after the snapshot the panel sends the version's **runtime file**,
`runtime.glb` (`frontend/Experience/Publish/Runtime.js`): everything the
public view would otherwise build the whole house for. It holds what to
collide with, each mesh named for what it is, so the crosshair still reads
"Wall — Warm white" or "Sofa". It holds the real materials; a finish's
texture travels as its name and is drawn on the device, as in the editor.
And it holds the glass. The server simplifies the collision to within
1.5 cm and Draco-compresses the file. On Wrenfield that is 94,000 collision
triangles down to 10,000, in a 256 KB file. With it, a public view builds
no wall, slab, stair or piece of furniture and downloads no furniture. It
builds only what moves: the doors, the car and the room lights. It is
ready to walk round in less than half the time, with half the memory and
a third of the scene objects. A version published without one, or before
there were any, builds the house as before.

**Comparing optimisations.** The Publish panel starts with a checklist of
what the version is made with (`shared/publishOptions.js`): removing hidden
faces, merging, compression, plain glass, baked lighting (off, draft or
final), the phone quality tier, how it is lit (below) and its scenery — the
car, the trees and bushes, the hills, the grass, each of which can be left
out: neither drawn nor baked, and the car never downloaded (`shared/scenery.js`;
the hills, being ground, are published without the hole cut for them). Every version is kept and listed under
it with what it was made with, its triangles, meshes and download, and an
*Open* link — `/view/<id>?version=<version>&stats` — so two versions can be
compared side by side; the `?stats` overlay names the version and options
on show. `/view/<id>` itself, the link for clients, always opens the latest,
and `?live` on any public link ignores published versions altogether.

**Baking the lighting** is the last step, and it runs on this machine, in
Blender — started by the Publish panel when a publish asks for it (or with
*Bake* on any version there), or from a terminal:

```bash
npm run bake -- <id>     # the latest version: 4096², 512 samples
                         # --size 2048 --samples 128 for a quicker, noisier draft
                         # --version <version> for an earlier one
                         # --margin 4 for narrower margins round the lightmap's islands
                         # --full for everything, of a version published "Fully baked" too
                         # --static for only what a fully baked view reads, whatever the version says
                         # --debug also keeps the raw and denoised lightmaps (EXR)
```

A version published *Fully baked* is drawn from the bake alone on every
device, so its bake leaves out what such a view never reads: the rooms
baked again with each door shut, the light probes, the sun's share of the
light, and the lightmaps and vertex light without the sun's or the lamps'
straight light — a quarter less to bake, and two fifths less of the house
to download. Its view is then drawn fully baked whatever its link asks
(`lighting.only` in the manifest); `--full` bakes all of it.

The panel only offers baking to a browser on the same machine as the
server, and only where Blender is installed (`BLENDER=/path/to/blender` if
it is not found; `BAKE=off` turns it off). One bake runs at a time, and it
rewrites its version in place: the version's earlier bake is deleted. On
an M4 Pro a final bake of Wrenfield — nineteen rooms, 22 switches, 17
doors — takes 28 minutes (35 before the work described below), 20
published *Fully baked*, and a draft 7; Ladonia's three villas took 3 h
22 min before it, and 1 h 52 min in the one final bake run since (its
bake folder's stamp to its manifest's `bakedAt`, 12 October).

`blender/bake_public.py` bakes the published snapshot by day (sun and
sky) and by night (moonlight), then the light of each light switch on its
own, with every bounce between surfaces, and denoises it. Every object
baked hands the whole scene to the renderer again, which was most of a big
site's bake: so the thin faces' light is baked on one object a pass, not
one a room, and doors in parts of the site that no opening joins — a flat
and the flat next door, two buildings — are shut in one pass, taken apart
room by room afterwards (`blender/lib/batches.py`;
`node scripts/test-bake-batches.mjs`). Switches stay one to a pass:
lit together, each lamp is chosen less often for its own room and its
bounced light clamped more, and their light came out changed.

Wide surfaces get a 4096² lightmap for a final bake (about 2 cm a texel on
the house; gardens, the roof and the ground far coarser; skirting boards,
door casings and
window frames finer), and phones a 2048² copy of it; only thin and small
surfaces — a moulding's curve, balusters, handrails — are lit through their
vertices instead, and so is any narrow strip that would be under three of
its own texels across (a casing or a skirting top at a big site's coarser
texels, a fence's pickets: on the lightmap they came out black). The
lightmap is unwrapped the way one should be: cut only along sharp edges
(and where a curved surface has to be opened to lie flat), each piece
unwrapped by its angles (Blender's minimum-stretch unwrap failed pieces on
a big site, differently at each run) and scaled so a texel covers the same
area everywhere, walls made whole across the joins between their pieces
first. Portals in every outside window and door send the
sky's samples through the openings; texels hidden behind frames and
skirting boards, or inside the walls themselves (every wall runs on into
the next at a corner, and outside walls carry on up past the ceiling),
take the light round them rather than baking black and bleeding a dark
line into every corner; and where the lightmap is cut but the
surface carries on, the two sides are stitched together. A surface seen
from both sides, like a gable or a ceiling, is baked as two copies a few
millimetres apart, so the lamps inside don't glow through to its outside at
night. The top of a ceiling is only ever seen from above, in the
bird's-eye view of the floor over it, so it is baked as it is seen there,
with the roof lifted off. That makes it the floor of an open doll's house
rather than of a pitch-dark roof space. Each surface is the room's it is
seen from, so that a switch lights its own room's and a door dims them:
a wall that runs on behind a partition is cut along the room's edge, and
what lies in a wall's thickness at a doorway — the lining, the head, the
threshold — along the wall's middle, each half the room's on its side.
Door leaves,
which move, are tinted from light probes baked either side of each. A
site's own garden lights — uplights, the pergolas' downlights, the pool's
lamp — are part of the night's light, no visitor's to switch.

Each lightmap is written twice. Once at one scale for the whole of it,
which is the sunlit garden's: a room lit through its windows has a tenth
to a hundredth of that, a dozen or two of the file's 255 levels, and at
the exposure a room is shown at the compression's blocks then show as
tinted rectangles on its walls and ceilings — sixteen trial bakes of
Wrenfield showed it was this, not too few samples. So it is written again
with each room's part of it held by a curve of its own, the logarithm of
its light up to the room's brightest texel, so that a level is two or
three hundredths of the light everywhere in the room
(`blender/lib/lightzones.py`; `shared/lightRegions.js` is the view's side
of which texels are whose). A view that resolves the house's light (below)
fetches that one; anything else, and a build from before it, the first.

The
public view then draws the house unlit, from what was baked, on every
device: no live lights on it, which is most of what a frame was spent on
(*Drawn from the bake*, below). **N**, or the sun and moon button,
switches between day and night; the night lightmap is only downloaded the
first time it is asked for. Lightmaps, the switches' layers, the sun's mask
and the doors' atlas are decoded off the main thread
(`Utils/bakedTexture.js`).

**Light switches.** Every indoor room has a ceiling light — an opal globe
on a cord, or a dome flat to the ceiling in a small, low or tiled room —
and a switch for it on the wall where you come in: beside the door, on
the side it opens from, or by the top of the stairs for a landing or a
loft. Every lamp — a piece of furniture whose model marks its bulb
(`_lamp` in `blender/lib/furnish.py`) — has a switch of its own. Where
each goes is worked out from the spec (`World/Fittings.js`), so they
move with the doors; publishing gathers them into the published spec,
and the bake lights each switch on its own, from inside its glass or
bulb, in its room and the rooms next door. The lightmap is laid out room
by room, so each switch's light is a small crop of it for each room it
reaches, a few kilobytes. A room the light only spills into — up a
stair, through a doorway — has a hundredth of what the switch's own room
has, too little for the 8 bits at the switch's one scale: its crop is
written a second time held its own way, as each room's part of the
lightmap is, for the view that adds the light up itself.

In the public view, **L**, or the *Lights* button, lists the switches
floor by floor. A light can also be turned on and off by pointing the
crosshair at it, or at its switch on the wall, and pressing **E** (the
button under the thumb on a touch screen), or by clicking it — tapping
it — in the bird's-eye view. The view adds the light of each switch that
is on to the day's or the night's (`World/Switches.js`), and lights its
glass or bulb. At night every ceiling light starts on. By day every light
starts off but those of the rooms daylight does not reach — a bathroom, a
lobby, a utility room with no window, nor open to a room that has one
(`shared/daylight.js`, told from the published spec's walls and openings):
with every light off those were black to walk into and black patches from
above. Ladonia has twenty such rooms, Wrenfield four, Ashgrove two. They
are switched off like any other light, and day and night each keep their
own switches, so the two can be compared as they were left. The same holds
in a view lit live and in the editor's realistic preview
(`World/LiveSwitches.js`), not under the editor's plain light. A switch's light is only downloaded the first time it
is turned on.

**One lightmap for the house.** A switch turned or a door swung does not
change how anything is drawn: the view works the house's light out again
on the GPU — the day's or the night's, each room's dimmed by its doors,
plus every switch that is on — into one lightmap, only over the rooms that
changed, and every lightmapped surface reads that one map with one shader
(`World/LightResolver.js`). Any number of switches can light a room, and
Ladonia's 2,242 materials became 1,064. The sun's straight light alone is
still worked out a pixel at a time, for what moves to shade it. A device
that cannot do this, or `?lightmap=rooms` in the link, keeps each room's
own materials, which add up to six switches' light (five with the sun's
share apart; four, the whole house lit live): where more reach a room, the
faintest (spill through a doorway) is left out.

**One house.** The bake parts the house by room, so that a room's
surfaces can be lit and dimmed alone: 3,952 meshes for Ladonia. A view
drawn from its bake merges them again across rooms — whatever has the
same look, is lit the same way and is on the same floor — with materials
that look alike shared and plain colours carried in the vertices
(`World/HouseMerger.js`): Ladonia's 3,952 meshes become 670, Wrenfield's
618 become 159, and a frame out of doors at the top step went from 29 ms
to 16. What moves, what is see-through and each lamp's glass
stay meshes of their own. `?merge=off` keeps the rooms' meshes.

**Drawn from the bake.** Every device draws a baked version's house from
its bake, and what moves is all that is live. The bake writes how much of
the sun's (or the moon's) straight light each texel has (`day-sun.webp`, a
grey lightmap); the view draws a shadow map of what moves alone — the
visitors, the people, the car, the doors and the furniture's doors and
drawers, not the house or a garden's trees, whose shade is baked (a site's
own trees, of which the bake has no shade, are in it too) — and takes that
share of the light away where it falls. So people and the car throw
shadows in the sun, and a shut door keeps the sun off the floor behind it;
a floor the sun never reached is left alone. The shadow map is drawn again
only when something moves by more than a visitor settles standing still.
What moves has no light baked, so the bake also measures the light at a
grid of points through the house and round it, a metre apart, each from
six ways (`probes.bin`); the visitors, the people and the car take theirs
from the points round them, those in the room they are in first, instead
of from a sky-coloured hemisphere light that lit them the same in the
garage as on the lawn — with the sun on them only as far as the probes say
it reaches. Their reflections dim with it (`World/ProbeLight.js`). The
lamps stay baked: they light what moves through the probes, but it casts
no shadow from them. This is "baked" (`lightingMode` in `Utils/device.js`),
what a computer is given.

**Fully baked.** The lightest way to draw it: all of the light from the
bake and nothing live — no shadow map at all, no light probes, no door
dimming its rooms. Phones and tablets are given it, and so is any device
at the slider's two lowest steps. The Publish panel's *Lighting* can give
it to every device (*Fully baked everywhere*).

**The live room.** Over a view drawn "baked", the visitor can ask to see
the rooms round them as they really are: a switch at the head of the
*Lights* panel, or **K**. It is off at every visit and never comes on by
itself. While it is on, the room they stand in — with the rooms that
always stand open to it: a hall and the living room it runs into with no
wall between, a bedroom through a doorway that has no door — and every
room they can see into from there, through a door that is open or ajar, a
door with glass in it or a stairwell, is drawn with its own materials —
the editor's: colour, relief, gloss, reflections — in the bake's own
light. The sun through its windows is drawn live, with its shadows, and
so are the lamps nearest the visitor, each where the bake's lamp hung and
as strong as the bake's own light probes measured it (a ceiling light set
into the ceiling gives half what one hanging free does), with a shadow of its own that a door's leaf or a person throws
as it moves, as soft as the bake's lamp is big — sharp by what casts it,
softer further off; all the rest of its light is the bake's, as the bake traced
it: the sky through the windows, every bounce off the warm walls and
floors, the soft shade in the corners and under and behind the furniture,
and the lamps not drawn live — two at most at the top step, one at
Balanced, a switch's lamps all together, so a living room whose ceiling
light, spots and lamps are on one switch keeps the bake's light of them,
soft shadows and all. Nothing of the editor's light is in it: no share of
the open sky, no flat glow of a lit room. So a room is as warm, as dark
in its corners and as bright as the baked view shows it — by day and at
night, its lamps on or off — and the picture is exposed by the baked
view's own light meter, which reads the room again once a lamp turned off
or on has faded; turning a lamp off or on fades its light in and out
where the bake's light of it falls (`World/RoomBakeLight.js`). A mirror,
a tap or a steel front reflects the room as it is drawn, by night as by
day. The
editor itself, and a version published unbaked, draw as they did; a bake
without its light apart (an old one) draws its live rooms as before, in
the editor's light but for a dark room's at night. Its glass is drawn so too — a window's pane,
a shower's screen, a glazed door: its reflections alone, as the baked view
draws the glass that stands in a room, for the bake lights no glass; so a
window at night is dark, the lit room faint in it, not a frosted sheet,
and by day it is clear — and what
moves in it: the people round the property, the visitors' figures, door
leaves, a car in a garage; and so is what stands in the openings of its
walls and is no room's — a window's frame and reveals, its sill, a door's
casing — and a flight of stairs, with the room it starts in. A sheer
curtain is not: the bake has no curtain to light (nothing seen through is
in what it traced), so it stays as the baked view draws it — its own
material in the view's own light, with the night's warm glow — by day
and at night, whenever the live room was first turned on, but over the
room's glass behind it. Every room
out of sight, the garden and the bird's-eye view stay exactly as baked:
what is seen through a window, or through a door to the garden, is the
bake's. It is drawn
in calls of its own round the scene's — its surfaces before, its glass
after — with lights of its own that light nothing else, and its sheer
curtains last, in the view's own light
(`World/LiveRoom.js`; `World/RoomLight.js` says which rooms and when).
Until it is first asked for nothing of it exists; switched off again, its
lights, materials and shaders are kept for the next time, nothing is
drawn or worked out for it, and the baked picture is what it was to the
pixel. Its switches stand as the baked view's do, by day too in a space
without a sky of its own (Wrenfield), whose editor draws the rooms with
their lights on.

A room is made ready before it is seen — its textures sent, its shaders
built and each drawn once out of sight, a little a frame. The first time,
the view says *Getting the live room ready…* meanwhile, and then shows
the visitor's room and everything in sight of it in one frame. Walking on,
the room behind a shut door is made ready as the visitor comes within a
few steps of the door and is shown in the frame the door starts to open;
a room stays live for as long as open doors join it to where the visitor
is, behind them too. So walking from one room into the next changes
nothing in view. Eight groups of rooms at most are live at once — the
visitor's own, then the nearest in sight; beyond them a room is the
bake's until its turn comes. The exposure does not change for it: the
live rooms are in the bake's light, and the picture is metered as the
baked view meters it. Stepping out of doors ends it until the visitor
is back in a room — coming in from the garden, a room is the bake's
until its visitor is in it — and the view from above suspends it, as a
change of day and night or of the slider does for a moment. Not on a
touch device, one rated under Balanced or a version published fully
baked, where it is not shown at all; nor in a view its visitor has set
to *Fastest* or opened at the slider's two lowest steps, where its row
is greyed and K says why. On an M4 Pro, at the top step, it adds
2.0 to 3.4 ms to a frame standing in a room in the bake's light (it was
3.0 to 4.2 in the editor's: measured 2026-10-15) — with the lamps'
shadows as soft as the bake's, 2.5 to 3.4 where lamps are drawn live
and 1.7 to 2.2 by day without them — and 3 to
4.2 with a door open onto the next (measured before); a walk at night
through six of A1's rooms, opening two doors, takes a median 21.6 ms a
frame, none over 50; an earlier walk through four of Ladonia's
rooms, opening three doors, takes a median 17.3 ms a frame with it on
where the bake alone takes 14.3, some twenty of its 1,168 frames over
25 ms and none over 50 (at Balanced, an earlier walk through six rooms:
12.5 for 10.8); the first time, with
shaders the browser has never built, it is five to six seconds in coming,
some thirty of whose frames are 60 to 160 ms long — one for each new
shader's first use, which is the graphics card's own time — and the frame
that shows the rooms is 35 ms.

**The whole house lit live** is no longer given to anyone, nor offered in
the menu: on Ladonia, at the top step on an M4 Pro, it took 25–49 ms a
frame by day and 58–97 at night whenever something moved, where the same
views drawn from the bake now take 13–17, day and night. The bake
still keeps the sun's straight light apart from the rest, and each
switch's lamps' straight light apart from what they bounce, and the view
can still draw the house lit — matt surfaces with the rest of the light as
their ambient light, the bake's own sun and the four lamps nearest the
visitor as live lights with shadows (`World/LiveLamps.js`) — but only when
the link asks for it, `?lighting=live`, to compare; a touch device, or one
at the two lowest steps, is refused it. (`?lighting=baked` and
`?lighting=static` in a link pick either of the others on any device.)

**The visitor's own choices.** The public view's menu (**M**) lets whoever
is looking pick a lighter way than they are given, never a heavier one:
*Auto* (as published) or *Fastest* (fully baked), where they are not given
that already, which reloads the view — and a switch for each piece of
scenery the version has, which hides it at once: the car (not downloaded
while hidden), the trees and bushes, the hills (laid flat, being ground;
their trees and grass go with them) and the grass. Both are kept on the
visitor's device for every space (`Utils/viewerChoices.js`,
`World/Scenery.js`); a choice kept from when the menu offered *Best* is
read as *Auto*. What they cost, drawn fully baked on the phone tier:
from the front path, the trees are 0.93 of its 1.45 million triangles and
the car 0.25 (53 draw calls); the grass and the hills' tufts about 45 draw
calls each; the house itself about 550 draw calls. A hidden tree's shade
stays baked on the lawn.

**Doors shut.** The bake has no door leaves, so its light comes through
every doorway, shut or not: the sun is shaded by the leaves (above), but
the light from the sky and everything bounced came through a shut door as
through an open one — a windowless WC stayed lit with its door shut. So the bake shuts each room door in turn —
a leaf in the doorway as `World/Door.js` hangs it — and bakes the rooms
either side of it again, by day, those rooms alone, keeping how much of
their light stays: texel by texel, in one grey atlas of every door's rooms
at half the lightmap's texels (`doors.webp`, and a phone's copy), and for
each room all told. The view dims each room by it as its doors close, eased
as the leaf swings: the WC goes dark behind its shut door, a bedroom with a
window hardly changes. It dims only that light (not in a view fully
baked, which dims no room); two doors of a room shut together each keep
their share, and the night dims as the day does. A switch's light in a room next door that it
reaches through doors alone is let in as far as they are open. The thin
faces and the light probes, which have no texels of it, take the room's
share of its light all told; and a leaf's two faces are lit apart, each by
the probe on its own side, so a shut WC door is dark inside and lit by the
hall light outside. A room with doors reads their atlas as one
more texture. As a door swings, the thin faces' light is added up again
only in the rooms it changes (`SceneBuilder.mixVertexLight`).

**Doors and drawers.** The furniture's doors and drawers open: the
wardrobes', the kitchen's cupboards and drawers, the tall units', the
microwave's, the fridge's, the nightstands' and the vanities'. Point the
crosshair at one within two and a half metres and press **E**. The
builders in `blender/lib/joinery.py` mark each door as hinged on its edge
and each drawer as sliding, and `geometry.join_piece` keeps each a part of
its own, its origin on its hinge, what it does in its node's extras. The
carcasses behind them are hollow, with shelves, rails, a hanging rail in a
wardrobe, and in the fridge a white liner, glass shelves, bins in the doors
and a light that comes on as a door opens. The doors and drawers are left
out of the merged house, the snapshot, the bake and the collision; the
bake lights the insides as they are seen with the doors open, and shut, a
door hides it. They are drawn live (`World/Openables.js`); a published
version's runtime file carries them, shut, and in a baked view they are
lit by the light probes and shade the sun's light as they move — or, from
a bake without probes or in a view fully baked, like the door leaves, from
the probes of the nearest door on their floor.

**The garden.** Every lawn is grassed, fenced round, with bushes along
the fence and trees in the back garden — in the editor, the walkthrough
and the public view alike, all worked out from the rooms alone
(`shared/vegetation.js`). The plot's front is the side the road is on:
the fence runs along every edge of a lawn with nothing of the plot beyond
it, leaving the path and the drive open as gates, in low white pickets in
front of the house and tall timber boards beside and behind it
(`World/Builders/FenceBuilder.js`). It is part of the house: drawn,
published, baked — at coarser texels than the house's own — and walked
into like a wall. Bushes of every size stand here and there along it,
small along the pickets and bigger along the boards; the back garden's
trees stand towards its edges, clear of the house, the patio and each
other. Behind the back fence, small hills rise out of the fields — a
band of rolling ground past the plot, a few hills on it, part of the
house like the fence (`World/Builders/HillBuilder.js`).

The garden is drawn as
[fluffytree-threejs](https://github.com/leoawen/fluffytree-threejs)'s demo
draws its own, when first opened. The ground under all of it — lawns,
fields and hills — is its gradient, sand in the middle to green at the
edge, laid once over the plot. The hills are grassed with its grass cards,
in patches with bare ground between, as thick as in the demo; the trees
are its tree (`public/models/fluffy-tree.glb`), a little shorter, one on
each of the taller hills and a few on their slopes; and all of it is
coloured as the demo colours it — its trees' volumetric gradient, its
grass read back off the screen's own colours, which is what makes it so
vivid, and its light — with three's ACES Filmic, as the demo is drawn.
The lawns' grass is single blades, each bent from root to tip and swaying
in a swell of wind, in the greens they are drawn in by Isaac Mason's
[sketches](https://github.com/isaac-mason/sketches) (MIT). Both notices are
in `frontend/Experience/World/Vegetation/shaders.js`, and the textures' in
`public/textures/vegetation/`.

All of it can be changed by hand in edit mode's **Garden** panel (the leaf
in the header): Fluffy Tree's own controls — its lighting, its grass's
colours and wind, its leaves' gradient and wind — and the sketch's for
the blades, and how thick the grass grows, how far off it is drawn, how big
the trees are and how many, the hills, where the gradient lies, and the
tone mapping and exposure of the whole view (ACES, or Blender's Filmic, as
the house was drawn before). The look follows as a control moves; the
grass, trees and hills are grown again once it is let go. What differs
from the defaults is saved with the space (`garden`, `shared/garden.js`),
and a version published from it is drawn and baked with it. The blades'
density goes up to 800 a square metre, for trying what a device can draw.

The trees, bushes and grass are drawn live, never published or baked; but
the bake is told where the trees and bushes are and casts their shade on
the ground, the fence and the house, and in a baked view the grass takes
its light from the ground's own lightmap — the sun's shade from the house
and the trees, day or night. The trees' trunks are walked into, not
through. Live, the sun's shadow reaches over the hills, so the trees and
the grass shade them as in the demo; the shadow map is twice as big then
(except on phones), so the house's own shadows stay as sharp.

**The neighbourhood.** Round the plot is a neighbourhood
(`shared/neighbourhood.js`), planned from the spec as the garden is: the
street in front of the plot carried on both ways to the edge of the world;
a cross street beside the plot, on the side of its drive, meeting it at the
one junction, its back arm running past the plot and winding up and over a
hill behind it — the hills put that hill on its way, eight metres high, and
grade the ground to the road, cut and filled, so it never climbs steeper
than one in ten — asphalt with a dashed line down the middle, gravel each
side, then grass, the hills' tufts on the verges, and trees along every
road; and five neighbours' houses round the junction and across the street,
only their outsides — walls, a gable roof with eaves, windows of dark glass
in white frames, a door, a chimney, a path to the street
(`World/Builders/NeighbourhoodBuilder.js`). It is the house's own ground and
walls: published (kept whole — no viewpoint stands on the roads), baked
(coarse, as scenery), walked and driven on. The car drives up and over the
hill and back, its body lying along the slope.

The world ends a radius round the plot's middle (150 m): over its last 55
everything fades into the dark — by how far it is from the middle, wherever
it is seen from (`Environment.applyDome`'s fog) — and the sky darkens down
to the horizon to meet it, a dome the world sits in; a wall no one sees
keeps people and the car inside it. The Garden panel's *Neighbourhood* has
the radius, the hill's height, how many houses, how close the road trees
are, how thick the verges' grass, and whether there is one at all; a version
published before it had none, and draws none.

A tree farther than 30 m off (22 on a phone) is drawn light: a quarter of
its crown's leaf cards, each grown to fill in for the others, on a plain
trunk — a sixth of its triangles. The tufts thin out with distance as the
blades do, all of them up to a third of their draw distance, then fewer.

**Performance or realism** is a slider in the view's panel, five steps from
*Fastest* to *Maximum realism* (`QUALITY_STEPS` in `Utils/device.js`): the
pixel ratio (1 to 2), multisampling, ambient occlusion's samples, the sun's
shadow map (1024 hard-edged to 8192 with contact-hardening soft shadows,
fitted to what the camera sees), texture filtering, how far and how dense
the trees and grass are drawn, the colour grade, and on the top two steps a
light probe captured per room so a room's surfaces and furniture are lit by
its own bounced light. The AO, grade, probe and the trees' and grass's reach
apply to a space with its own landscape (Ladonia); elsewhere the slider sets
the pixel ratio, the shadows' filter and texture filtering. Each device
starts at the step its graphics are rated for (a phone 1, a software
renderer 0, integrated graphics 2, other discrete cards and Apple chips 3,
Apple Pro/Max/Ultra chips and RTX cards 4) — and **that step is its
ceiling**: the slider goes no higher, a step kept from before is brought
down to it, and neither `?quality=` in a link nor a version's own *Always
high* takes a device above it (`stepCeiling` in `Utils/device.js`). A
visitor's own choice below it is kept on their device. Each step also has
a budget of pixels, however big the window — 2.1 million at the two lowest
steps, 3.7 at the middle one, 5 at the top two — met by drawing at a lower
pixel ratio (`Utils/Sizes.js`): a 5K window at a ratio of 2 was 14.7
million. If the GPU gives up on a public view its visitor is looking at
(its WebGL context lost), the next visit starts at the lowest step and fully
baked, and says so once; both are then the visitor's to raise again in the
menu — and the view loads itself again when the graphics come back. In the
editor, or in a tab that is not on show, the next visit starts one step
lower and nothing else changes. The shadow map is never bigger
than the device can make. Measured on an M4 Pro in a 1280 × 720 window at a
pixel ratio of 2 (2026-10-12; nothing here was measured on a phone or on
integrated graphics): Ladonia's baked view takes 13–17 ms a frame at the
last step — the living room 12.6, the pool 17.0, the street 16.1, by day
and at night alike — and 4–8 at the first, where the code before this work
took 25–64 and 8–26; published unbaked it takes 18–33 ms at the last
step. Wrenfield's baked view takes 5–6 ms. (Twice that with another 3D
page busy on the same GPU.)

Phones and tablets draw at a pixel ratio of at most 1.5 with a smaller,
harder-edged sun shadow, in the public view and the walkthrough alike.
**A view that runs slowly makes itself lighter** (`Experience/FrameGuard.js`,
public views only; its decisions are `shared/frameGuard.js`, which runs in
node too: `node scripts/test-frame-guard.mjs`). The ceiling and the pixel
budget above are what a device is never asked for; this watches what it is
in fact given — the real time between frames, while the tab is on show and
the visitor is in the view, not while it loads, nor for the second after a
toggle, a resize or a jump, nor a frame in which a shader was first built.
Slow is a frame of more than 36 ms, under 28 a second: a 60 Hz screen shows
60, 30 or 20, so that is a view fallen off thirty, where the mouse begins
to lag; one that holds thirty is left alone, since the slider's step is
what its visitor asked it to look like. Two seconds of slow frames (a
single stall counts for a quarter of a second, however long) and one thing
is taken, then the next: first the resolution — 0.85, 0.72 and 0.6 of the
step's own pixel ratio, not twice within two and a half seconds; then the
live room, while one is drawn (not while it is only asked for: out of
doors or from above it costs nothing), with a line to say so; then
the slider's step, one at a time down to the lowest, shown on the slider
and said, and not kept — the next visit opens as the visitor set it. Each
thing taken is judged by what it gave: if two rungs of the resolution, or
two steps, leave the view no faster by a tenth — a slow processor, a page
busy with something else — they are given back and that kind is left alone
for two minutes, then four, eight; a view nothing helps is left as its
visitor set it. And the resolution taken in a view's first half minute,
perhaps only for the seconds its trees took to arrive, is given back on
trial once it has not been slow for half a minute. Under the Balanced step it goes as
the slider itself does, without a reload: the post-processing is dropped
and everything drawn follows, while what was chosen as the view loaded —
its lighting mode, its lightmaps' size — stays as loaded. With half a
minute of frames of 22 ms or less (45 a second) it gives the last thing
back, a step first and the resolution after, never the live room and
never above the visitor's own step; a change up that has to be undone
within half a minute doubles the wait for the next, up to eight minutes.
After the visitor moves the slider, or turns the live room on, it takes
nothing for half a minute — twice as long each time they put back a step it
had taken. On Ladonia's living room at night on an M4 Pro the whole way
down takes a still frame from 13.4 ms to 4.3; a change of resolution costs
about 10 ms once, a change of step one frame of 200–500 ms. Its own work is
a tenth of a microsecond a frame. `?guard=off` in the link leaves it out,
`?guard=report` has it say in the console what it does. The editor has
none: its plain light has nothing to take.

`?quality=low` or `?quality=high` asks for step 1 or 3 (`?quality=0`…`4`
or `max` for any step), up to the device's ceiling. Two more are a
developer's: `?uncapped` lifts the ceiling (not on a touch device), to see
a step on a device not rated for it, and `?rated=0`…`4` pretends a device
rated that low — never higher than it is — to see what such a device is
given (it changes nothing kept on the device). `?stats` on any link shows frame rate, draw calls, triangles and
the bytes downloaded — which is how to compare a change on the device it
is for.

### A site of its own: Ladonia Residence, Kosinožići

**Kosinožići Villas** (`scripts/spaces/ladonia/`, id `kosinozici-villas`) is
Ladonia Residence near Poreč, built from its listing (konekt-nekretnine.hr
project 253): the developer's floor plans of every floor, measured, and its
renders for the look. Three buildings of five flats each:

- **A and B** (`ab.js`), one design built twice — two wings in sand render
  joined under a stone-clad box on the roof, three ground-floor flats with
  gardens under louvred pergolas, two first-floor flats up an outside stair,
  each with its own stair up into the box and out onto a roof terrace. B has
  the pool in front.
- **C** (`c.js`), banded in corten over sand render, with a stone-clad
  recess through both floors on each long side and glass wrapping its four
  corners; three flats on the ground floor, two above, and their roof
  terraces.

Every flat is **furnished** as its plan draws it (`furnish.js`): the kitchens,
sofas, dining tables, beds, wardrobes and bathroom fittings where the plans
put them, in the renders' style — A's honey oak and mustard kitchens with an
oak table under a felt dome and an oatmeal basket-weave sofa, B's and C's sage
kitchens with round white tables, oak chairs and pleated paper pendants,
slip-covered linen sofas, oak TV walls and track lights, and felt headboards
over long floating nightstands throughout. The two kitchens the renders show
(A1's and B's A2's) are modelled as drawn, unit by unit. Outside, every
ground-floor terrace has a garden table under a woven pendant, orange lounge
chairs and an outdoor kitchen; every roof terrace a dining table under its
pergola, sofas, a parasol and an outdoor kitchen against the stone box (the
plans' jacuzzis are left out, as the renders show the roofs); B's pool deck
three loungers, a bar and armchairs.
The pieces are modelled in Blender (`blender/lib/ladonia.py`, ids `ld-*` in the
catalogue) and are editable like any other furniture.

Its buildings are the spec's rooms, walls and flat roofs like any other
space's (written per building in its own frame by `kit.js`), with modern
joinery — slim anthracite frames (`style: "slim"`), external venetian blinds
lowered part way (`blind`), glass sliding doors (`door.glazed`) and
solar-control glass — and photographed finishes. `npm run seed --
kosinozici-villas` writes it alone.

**Walkable throughout.** The walking character is a capsule 0.7 m wide and
1.9 m tall, and every route is clear for it: from the parking up the garden
steps through the stone walls (the paths stop at the top step), up the
outside stairs, into every flat and every room, and up each flat's own stair
to its roof terrace. Doors are 0.9 m (`kit.js` widens narrower ones where
the wall has room; the two squeezed between cross walls, `door(…, { fit:
true })`, are 0.84 m), and each room's furniture leaves a way to its door
and in front of each piece — the bathrooms laid out so the WC, the basin
and the shower each have their own floor (`vanity-small`, a 0.6 m hand
basin, where a full vanity left none). Where a flat's stair climbs over its
bathroom, a low wall closes the bathroom off under it. C stands at the
street's level beside its lane, a metre below A's and B's gardens, with its
own path in from the parking.

**No flicker.** Faces that share a plane are layered in depth
(`MaterialLibrary.js`'s `layer`): window frames and glass, and doors' linings
(`getTrimFront`), in front; walls' ends, tops and reveals, stairs' risers and
roofs' soffits (`getTrimBehind`) behind, while a trim laid on a surface —
skirting, road paint — is drawn as it stands; the terrain behind the paving;
in the furniture, screens, glass, hobs and handles in front and grooves,
gaps and plinths behind (`FurnitureLibrary.js`). The runtime file and the
baked public view keep the layering. Floors have none of their own, so a rug 1 cm over one stays on
top, and the camera's near plane is 5 cm, so a centimetre apart is enough
at any distance a room is seen from. Where two things really overlapped,
they were moved apart: partitions stop 2 cm under the floor above, the
stairwells' edges sit inside the walls beside them, showers stand a
centimetre off their walls, landscape walls meet at corners without
overlapping. How it was built, and what to do
differently next time, is the `build-property-space` skill
(`.claude/skills/build-property-space/`).

Everything round its buildings is its **landscape** (`spec.landscape`,
`shared/landscape.js`), and in a space that has one the Fluffy Tree garden,
fence, hills and neighbourhood are left out:

- **The ground** is a terrain (`World/Builders/LandscapeBuilder.js`): a base
  height raised along slopes and over hills, roughened by noise, held flat
  on pads — the gardens, the street a metre below them — and eased back to
  the hillside; a metre-square grid round the villas, coarser out to 300 m,
  its grid lines run along every hard edge so the street drops sharply
  inside the retaining wall and the pool and the steps have straight-sided
  holes. It is painted lawn, meadow, gravel, forest floor or rocky
  hillside by region, the five photographs blended in the shader at two
  scales each, near and far, under a slow brightness variation, so nothing
  visibly repeats. It is part of the house: walked on, driven on,
  collided with, published.
- **What stands on it**, also part of the house: dry-stone retaining walls
  with copings, kerbs and road markings, pergolas (anthracite frames,
  timber louvres, lattice screens), corten planters, glass balustrades and
  a mosaic-lined pool with its hardwood deck. The pool's water ripples and
  reflects the sky.
- **What grows** (`World/Flora/`), drawn live and swaying in the wind:
  - *Trees and shrubs* are grown with
    [ez-tree](https://github.com/dgreenheck/ez-tree): downy oaks, an ash
    and gnarled olives (`scripts/trees/`), scattered by thousands over the
    woods' regions and placed by hand in the gardens. Each is drawn three
    ways by distance: whole near; with a quarter of its leaf cards and its
    twigs dropped further off; and past ~50 m as an impostor — a card that
    turns to face the camera, showing the tree as rendered from the
    nearest of eight sides into an atlas when it loads. Leaf normals point
    out from the crown, so it is lit as a mass, and the sun shines through
    leaves seen against it.
  - *Photinia hedges* are dark cores under tens of thousands of instanced
    leaf sprays, green below and red with new growth at the top.
  - *Grass* is lawns, meadows and the roof planters' ornamental grasses:
    clumps of curved, tapering blades in squares of ground, fewer of them
    the further off a square is, until the ground's photograph carries it.
- **The sky** (`World/Sky.js`) is a Poly Haven HDRI: its HDR lights
  everything (PMREM), with the sun clipped out of it and drawn as a
  directional light from where the sun is in the photograph, so shadows
  fall the way the sky says; the photograph itself is the background, the
  far terrain fading into its haze. `sky.turn` turns it, here so the
  sun comes from the east-south-east (about 105°), lighting the street and
  south faces as most of the developer's exterior renders do, and
  `sky.elevation` sets the sun's height (36°) without moving the picture. Rooms
  inside take less of the sky's light than the outside does, and a warmer,
  greyer version of it, as it reaches a room bounced off floors and walls.
- **Night** (`N`, or the sun and moon button, as for a baked view) is the
  dusk sky darkened: the rooms glow warm from within, so the windows show
  lit rooms without lamps that would light the walls' outsides; uplights
  under the olives, downlights under the pergolas, step lights up the
  outside stairs and the pool lit from under the water; bloom. Every
  fitting glows, but only the few nearest the visitor shine — one to five
  by the slider's step (`garden` in `Utils/device.js`), handed on with a
  fade as the visitor walks (`World/Flora/lights.js`): each light there is
  costs every lit pixel, near it or not, and sixteen cost a view lit live
  half its frame. In a baked version their light on the house and the
  ground is the night bake's; the live ones go on lighting what is drawn
  live — the trees, the people, the cars.
- **A light that is off is not there.** three builds every lit shader for
  the lights in the scene, and a light at nothing costs what a lit one
  does. So the lamps' pool is out of the scene (hidden) until a fitting
  whose light the visitor can see is on — in their own room, in one that
  opens into it through a doorway, glass or a door that is not shut, or,
  from out of doors, in a room with a window: a lit bathroom behind its
  shut door brings nothing in — a car's beam until its headlamps are, and
  the garden's lights but for the few that shine. The first time one comes
  in, the shaders for the scene with it are built ahead, a few milliseconds
  at a time, and the light waits for them (`Renderer.prepareLights`) — a
  lamp comes on a moment late once, the view hitching while the GPU builds
  them, rather than stopping for several seconds; after that each state's
  shaders are found again. The pool's are built while a lit fitting is
  only near, so its lamp is there as the door opens.
- **Post-processing** (`frontend/Experience/PostProcessing.js`), not on
  phones: [N8AO](https://github.com/N8python/n8ao)'s ambient occlusion,
  half-resolution and upsampled by depth, from the depth buffer alone — so
  a leaf card shades as its leaf, not its square — then bloom at night,
  then tone mapping. Its chunk is only downloaded for such a space. The
  two pictures N8AO takes of what is seen through (glass, the pool) are
  drawn by the app (`drawTransparency`): the library's own drew every
  wall made of several materials a second time into them, and the sun's
  shadow map again with each. A view drawn from its bake keeps the
  occlusion: over a bake it is still what seats the furniture, the plants
  and whatever moves, and without it a room is drawn a tenth brighter and
  flatter.

Its assets are bought in, all CC0 or MIT — Poly Haven textures and skies,
ambientCG grass, ez-tree's trees — listed with their sources in
`assets/THIRD_PARTY.md`:

```bash
npm run site-assets              # textures and skies → public/textures/pbr, public/textures/sky
npm run trees -- --textures      # ez-tree's bark and leaves → public/textures/trees
npx vite scripts/trees           # grow the trees in the browser, "Download all"
npm run trees -- ~/Downloads     # pack them → public/models/vegetation
```

It is published and baked like any other space. Its first final bake
took 3 h 22 min on an M4 Pro (512 samples, 4096², 5.5 cm a texel on the
villas), before the bake was made to hand the scene to the renderer less
often, to write each room's light its own way, to light narrow strips
through their vertices and to give doorway faces to the room they are seen
from: a version shows those only once it is baked again, as the version
published on 12 October was (1 h 52 min, 5.05 cm a texel). `/view/<id>`
opens the version published last, baked or not; `?live` draws the space as
it stands, live and merged.

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

**A plain light.** Edit mode is drawn under one fixed light
(`World/PlainLight.js`), the same by day and at night: an ambient and a
hemisphere light and one unshadowed light from over the camera's shoulder,
at one exposure, with the day's sky to reflect — no sun, no shadow map, no
lamps, no room glow, no haze, no post-processing — so everything can be
seen and worked on, and is cheaper to draw. Day and night change
only the sky behind and which set of light-switch states is shown; a light
switched on still shows in its glass. The editor's walkthrough is lit the
same way until **Realistic preview** is turned on (`P`, the button beside
*Edit mode* in the walkthrough, or the View menu's entry in edit mode — and
the header's button): then the
walkthrough is drawn as visitors of a version lit live will
see it — sun and shadows, lamps, lit rooms, the room probe, the
post-processing — and going into edit mode and back keeps it. The choice is
remembered in the browser; `?preview=1` in the link forces it on for that
page. What only the preview draws (the sun's shadow map, the lamps' lights,
the room glow, the probe, the post-processing) is first made when it is
first turned on. Publishing takes the scene as the preview draws it,
whatever is on screen — from the plain view without drawing it: the view
stands still until the publish is done.

On an M4 Pro the plain light and the *House* scope (next) took Ladonia's
edit mode from 45–48 ms a frame to 18–22, a view of one room from 24.5
to 6.6, and walking a room from 33 to 10; the space opens furnished and
walkable in 4.4 s where it took 6.4–8.2.

Under the plain light the house and the furniture are drawn by stand-ins
(`World/StandIns.js`): the building merged into one mesh a material, the
furniture instanced, a piece selected or just rebuilt drawn as itself — the
same picture in a sixth of the draw calls (Ladonia's whole property: 9,541
→ 1,438; 24.3 ms a frame → 10.9, 41 frames a second → 92; one villa 20.0 →
10.3; a view of one room is as it was, 6, and a room in focus half a
millisecond slower, 3.7 → 4.2). The objects the editor
edits, picks, snaps to, collides with and publishes are untouched — still
in the scene, on a layer no camera draws — so a console snippet that walks
the scene meets each surface twice, and a `Raycaster` of its own needs
that layer (`layers.enable(12)`). `?standins=0` in the link draws them as
they are built, for comparing.

What the editor asks the scene — what is under a click, what a dragged
piece stands on, what the crosshair points at, where the camera's boom
meets a wall — is answered from an index (`Utils/rays.js`): three's own
answer, hit for hit, without asking every mesh and every triangle. On
Ladonia a drag's pointer move took 101 ms and takes 2.8; a click's pick 8
ms and is 0.1; the two rays of every walking frame 7.5–10 ms and are 0.15
— a whole walking frame by the pool, 36.9 ms, is 12.1. And leaving edit
mode after an edit no longer builds the collision again (2.4–3.0 s with
the page frozen): it is mended where the edit touched it, and the
walkthrough is back in 26–32 ms.

Under the plain light the editor draws a frame only when the picture may
have changed (`Experience/Pace.js`): on any pointer, wheel or key event, on
anything the world or the editor says has changed, as a model or a texture
arrives, while a door, the visitor or the camera is still moving — and
twice a second regardless, so that nothing it was not told of stays stale.
An edit view left alone draws those two frames a second (it drew every
frame the display offered: 22 ms of each on Ladonia, for as long as the tab
was open); what idles by itself there — the people, the visitor's own
figure, the pool's ripple, the wind — holds its pose meanwhile and goes on
whenever frames are drawn, and the people play while one of them is
selected. The walkthrough standing still is drawn 30 times a second. The
realistic preview, a publish and every public view draw every frame, as
before; `?frames=always` in an editor's link does too, for a test.

The selection's outline (`Editor/SelectionOutline.js`) is three's
OutlinePass to look at, without its second draw of the whole scene: the
selection alone is drawn again, against the depth the frame has just
drawn, in the rectangle of the screen it covers. A chair selected on
Ladonia added 4–13 ms to every frame and adds 1.0–1.6 (a piece selected
over a villa: 33.9 ms a frame → 11.8). What is seen through
an X-rayed wall is now outlined as seen, in amber, not as hidden.
`?outline=pass` draws three's own, for comparing.

All of that was measured on one M4 Pro with the tab not on show (the
build before against this one, in one sitting, 2026-10-14), and with it a
Ladonia that opens furnished and walkable in 2.2–4.1 s where it took
6.5–6.7 (that sitting drove the load flat out, so its 6.5–6.7 is the
same build as the 4.4 s above: each pair compares, the two do not
chain). Two things it found slower. Walking indoors in Wrenfield's
editor (15 ms a frame where it was 10) was its furniture's collision
tree, cut that day from a box with room round it: mended the same day —
the tree is the build before's again (below). And the realistic preview,
by 0.3–2.4 ms a frame inside the renderer: not mended, and not a thing
that runs each frame (`app-notes.md`, Measuring).

**How much is shown.** The header's **Show** menu (and the View menu) sets
the view's scope (`World/Scope.js`), remembered in the browser
(`?scope=house|exterior|all` in the link sets it for that page):

- **House** — as it starts: the houses with their yards and nothing else.
  The structure, furniture and fittings, the ground near the houses,
  terraces, garden walls, pergolas, planters, the pool, the fence and the
  people are drawn; the garden (every tree, hedge and blade of grass, the
  garden lights), a site's far ground, the neighbourhood and the cars are
  not, and a flat colour stands in for the sky, light by day and dark at
  night. (The hills behind a plot stay, bare: they are cut out of the
  plot's ground, and hidden would leave a hole in it.) The fastest to work
  in, and the fastest to open: the garden is not even made until something
  first shows it.
- **Exterior** — the surroundings on their own: everything out of doors,
  with the houses as empty shells (roofs and outside walls, their windows
  and doors; no floors, ceilings, inner walls, stairs, lights or furniture
  indoors).
- **All** — everything.

It holds in edit mode and in the walkthrough while that is lit plainly; the
realistic preview always shows everything, and so does a publish. A floor
or a room in focus leaves the surroundings out whatever the scope (a car
standing in it stays). What a scope leaves out is not drawn, picked,
snapped to or fitted against, but is walked into exactly as before.
Selecting, adding or focusing on something the scope
leaves out (a car picked in the outliner while only the houses are drawn)
switches to **All** and says so; opening the Garden panel shows everything
while it is open.

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
   for dense models) or `none`; by default pieces of up to 12,000 triangles
   collide as their mesh, and heavier ones — or any with a part that opens
   — as a box.
4. Reload: it is in the Add menu (`Shift` `A`) under its category.

To keep a piece in the generated catalogue instead, write it as a function in
`blender/lib/loose.py` (or `joinery.py`) that builds it from primitives at its
real size, add a line to `PIECES` in `blender/export_furniture.py`, and run
`npm run furniture` (`npm run furniture -- ld-` rebuilds only the pieces whose
ids start so). Wall-hung pieces take `"wall"` as their anchor, so the
editor places them at hanging height and does not drop them to the floor;
pendants take `"ceiling"`.

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
  Collision.js            Static + dynamic octrees the player walks against,
                          each kept in step with what it is made from
  Door.js                 Openable door: geometry, swing, own collision
  PlainLight.js, Scope.js The editor's plain light, and how much of the site
                          it draws (House, Exterior, All)
  StandIns.js             What the editor draws under that light in place
                          of the house and the furniture: merged, instanced
  LiveSwitches.js, LampPool.js, RoomGlow.js
                          Lights switched live: the editor's preview, an
                          unbaked public view
  Switches.js, LightResolver.js, HouseMerger.js
                          A baked view: its switches, its light resolved
                          into one lightmap, its rooms' meshes merged
  RoomLight.js, LiveRoom.js, RoomBakeLight.js
                          The rooms round a visitor drawn with their own
                          materials, when they ask (K): which rooms and
                          when, how, and in the bake's own light — its
                          lightmap less the sun's and the live lamps'
                          straight light, the bake's lamps live with
                          shadows; a bake without its light apart, the
                          editor's light, at night a dark room's the
                          bake's measure (RoomGlow's table, rows 1–7)
  ProbeLight.js           What moves, lit by the bake's light probes
  BirdView.js             One floor from above
  Builders/
    TextureLibrary.js     Canvas-generated finishes
    MaterialLibrary.js    One material per finish; UV-baked tiling
    StructureBuilder.js   Floors and ceilings with openings cut, walls with
                          punched openings, roofs, stairs
    FurnitureLibrary.js   Model catalogue (files, and pieces of the house
                          GLB) and instancing
frontend/Experience/
  Pace.js                 When the editor draws a frame: on demand under its
                          plain light, with a heartbeat
  Realism.js              Sun shadow fit, room probe, and a baked view's
                          light meter
  FrameGuard.js           A public view that runs slowly makes itself lighter
  Utils/device.js         The slider's steps, a device's ceiling, how a
                          baked view is lit
  Utils/rays.js           Rays through the scene as three's Raycaster answers
                          them, from an index of its units and triangles
frontend/Experience/Editor/
  Editor.js               Edit mode: selection, keys, undo, add/delete,
                          floor/room focus, X-ray
  Collections.js          Which floor and room every part of the building
                          and every piece belongs to
  EditorUI.js             Header, toolbar, outliner, properties, menus
  EditorCamera.js         Turntable viewport camera, axis views, ortho
  SelectionOutline.js     The outline round what is selected, drawn against
                          the frame's own depth
  TransformSession.js     One move/turn/scale: constraints, snapping, fit
  Editables.js            What can be edited, and how: furniture, stairs,
                          floor openings, doors/windows, the car
  FitChecker.js           Does it fit? Oriented boxes vs the building and
                          the other pieces
  Snapper.js              Grid, flush-to-face and rest-on-surface snapping
  Gizmo.js                The transform gizmo
public/models/furniture/  Drop .glb files here + list in catalog.json
scenes/                   Saved properties (JSON, safe to hand-edit)
published/                Published versions and their bakes (git-ignored)
shared/                   What the page, the server and the bake all read:
                          publishOptions.js, daylight.js, storeys.js,
                          roomGraph.js, lightRegions.js, frameGuard.js
scripts/bake-public.mjs   npm run bake: Blender (blender/bake_public.py) on
                          a published version
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
octree is one tree; furniture and stair ramps go into a second.

**Both are kept, not rebuilt.** Each wall, room, ramp and piece is a source
whose triangles a `TreeKeeper` (`Collision.js`) remembers. Back in the
walkthrough after an edit, only the sources that changed have their
triangles made again, and the tree is mended in the cells they left and
came to — and it is, cell for cell and triangle for triangle in the same
order, the tree that building from scratch gives, because that order is
what three's Octree pushes a capsule out by: another order is another walk.
Ladonia's furniture is 961 thousand triangles; building them into a tree was
2.4 s, mending it after a piece is moved is a few milliseconds. Every cell
is cut from the box round everything, to the digit: an edit that changes
that box (the outermost piece moved, a chair carried out beyond all the
others), changes the order of what stays or changes more than three
tenths of the triangles has the tree built again — a slice a frame, half
a second of Ladonia's, and walked against meanwhile is the tree as it was
with the pieces that changed put right in it, so nobody walks against
the pieces as they were (after a great many moved at once it is left as
it was, and the build finished in the frame the visitor first moves).
Building from scratch is itself seven times quicker than it was: the same
split, without asking three's `Box3.intersectsTriangle` of every triangle
and every cell. A box with room round it, so that a piece carried outside
would still be a mend, was tried and taken out: a cell is divided only
while dividing it separates something, and furniture in the middle of a
box three times its size came out two levels deep with a leaf of eighteen
thousand triangles — 11 ms of collision a frame indoors. `node
scripts/test-collision-tree.mjs` holds the keeper's tree to the committed
split.

**Rays are three's, from an index.** `rays.cast(raycaster, roots)`
(`Utils/rays.js`) returns what `raycaster.intersectObjects(roots, true)`
returns — the same hits in the same order, with three's own numbers. Each
child of a root (a wall, a piece) is a unit with a box round it, looked
over before every ray — where it stands, its children, what moves inside
it — so nothing has to tell the index what an edit changed; a mesh of many
triangles is asked through a tree of them, by three's own triangle test
over the runs the tree finds. The terrain alone was four fifths of every
ray: its sphere holds the visitor wherever they stand, and three then asks
all fifty thousand of its triangles.

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

**Doors are not in the collision octree.** That octree holds what stands
still, so a leaf in it would either block a doorway forever or never block
it at all. Doors are left out of it (`isTransient`) and collide through
their own capsule-vs-oriented-box resolve each frame.

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
The people set round a property — their characters and animation clips —
are from [Mixamo](https://www.mixamo.com) (Adobe), converted by
`npm run people`; what they hold was made here, in Blender
(`blender/lib/props.py`). The cars are credited under *Building the
models*; everything else bought in, the people's names and licence
included, is in `assets/THIRD_PARTY.md`.

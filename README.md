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
the app collides with is exactly what it draws. (The cars and the avatars
are bought in; see below.) They are build outputs, not
repository content, so build them once:

```bash
npm run models    # needs Blender 4.2+; ~35 s, fully offline
npm run seed
```

That runs `build_house.py` (the .blend), `export_app.py` (Wrenfield's
furnishings GLB and the spec its structure is built from),
`export_furniture.py` (the catalogue),
`import_cars.py` (the cars) and `export_kit.py` (the kit). `npm run furniture`,
`npm run models -- --cars` and `npm run models -- --kit` rebuild just those. Set `BLENDER=/path/to/blender` if it is not on `PATH` or
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

The pieces are deliberately plain — boxes, cylinders and spheres — because
the point for now is that they are the right size. Where they come from:

| | |
|---|---|
| `blender/lib/joinery.py` | Built-ins: kitchen runs, islands, appliances, beds, wardrobes, bathrooms |
| `blender/lib/loose.py` | Loose pieces: sofas, chairs, stools, tables, bookcases, TVs, lamps, plants, decor |
| `blender/import_cars.py` | The cars the editor offers (below), each split into the body and wheels `Car.js` drives, with its wheelbase, tracks and wheel sizes measured |
| `blender/lib/kit.py` | The kit of parts: panelled door leaves, levers, hinges and stops, skirting, mitred architraves, window frames, glazing bars and cills, stair treads, newels, turned balusters and handrails |

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
(the editor, a public view lit live), a dipped spotlight that lights the
road, the garage, the house; drawn from the bake, a pool of light on the
road ahead. Parked, everything is off.

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
                         # --debug also keeps the raw and denoised lightmaps (EXR)
```

The panel only offers baking to a browser on the same machine as the
server, and only where Blender is installed (`BLENDER=/path/to/blender` if
it is not found; `BAKE=off` turns it off). One bake runs at a time.

`blender/bake_public.py` bakes the published snapshot by day (sun and
sky) and by night (moonlight), then the light of each light switch on its
own, with every bounce between surfaces, and denoises it. Wide surfaces get a
4096² lightmap for a final bake (about 2 cm a texel on the house; gardens,
the roof and the ground far coarser; skirting boards, door casings and
window frames finer), and phones a 2048² copy of it; only thin and small
surfaces — a moulding's curve, balusters, handrails — are lit through their
vertices instead. The lightmap is unwrapped the way one should be: cut
only along sharp edges (and where a curved surface has to be opened to lie
flat), each piece relaxed with Blender's minimum-stretch unwrap so a texel
covers the same area everywhere, walls made whole across the joins between
their pieces first. Portals in every outside window and door send the
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
rather than of a pitch-dark roof space. Door leaves,
which move, are tinted from light probes baked either side of each. On a
phone the public view then draws the house unlit, from what was baked: no
live lights and no shadow map, which is most of what a phone was spending
its frame on. Elsewhere the sun and the lamps are live (*Live light*,
below). **N**, or the sun and moon button, switches between day and
night; the night lightmap is only downloaded the first time it is asked
for.

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
reaches, a few kilobytes.

In the public view, **L**, or the *Lights* button, lists the switches
floor by floor. A light can also be turned on and off by pointing the
crosshair at it, or at its switch on the wall, and pressing **E** (the
button under the thumb on a touch screen), or by clicking it — tapping
it — in the bird's-eye view. The view adds the light of each switch that
is on to the day's or the night's (`World/Switches.js`), and lights its
glass or bulb. By day every light starts off, and at night every ceiling
light starts on; each keeps its own switches, so the two can be compared
as they were left. A switch's light is only downloaded the first time it
is turned on. A room's surfaces add up to six switches' light (four, lit
live; five on a phone, drawn from a bake with the sun's share apart): where
more reach it, the faintest (spill through a doorway) is left out.

**Live light.** The bake also keeps the sun's straight light apart from
the rest — the sky's through the windows and everything bounced — and
each switch's lamps' straight light apart from what they bounce. Except
on a phone, the public view draws the house lit, as matt surfaces the way
Blender baked them, with that rest of the light from the bake as all of
their ambient light, and the sun and the lamps as live lights with
shadows: the bake's own sun, at its strength (a Blender sun's W/m² is a
DirectionalLight's intensity as it is; a lamp's watts over 4π a
PointLight's). So shadows follow what moves. A shut door keeps the sun
and the hall light out of a room (the bake has no door leaves, so baked
light comes through a shut door), opening it lets them in, and the
visitor and the car cast shadows by day and under the lamps at night. The four lamps
that are on nearest the visitor are lit live, each with a shadow of its
own (`World/LiveLamps.js`); the rest are drawn from the bake. Shadows are
drawn again only when something near them moves. What moves has no light
baked, so the bake also measures the light at a grid of points through
the house and round it, a metre apart, each from six ways
(`probes.bin`); the visitors and the car take theirs from the points round
them, those in the room they are in first, instead of from a sky-coloured
hemisphere light that lit them the same in the garage as on the lawn. Their
reflections dim with it (`World/ProbeLight.js`). `?lighting=live` or
`?lighting=baked` in the link picks either on any device, to compare
them; a view baked before this is drawn baked until it is baked again.

**On a phone.** Drawn from the bake, the house still shows what moves in
the sun. The bake writes how much of the sun's (or the moon's) straight
light each texel has (`day-sun.webp`, a grey lightmap); the phone draws a
shadow map of what moves alone — the visitors, the car, the doors and the
furniture's doors and drawers, not the house or the trees, whose shade is
baked — and takes that share of the light away where it falls. So people
and the car throw shadows in the sun on a phone too, and a shut door keeps
the sun off the floor behind it; a floor the sun never reached is left
alone. Each light probe also records how much of the sun reaches it, and
on a phone the probes light what moves, with the sun on it only as far as
it reaches: no longer through the walls at half strength. The shadow map
is drawn again only when something moves. The lamps stay baked on a
phone: they light what moves through the probes, but it casts no shadow
from them.

**Fully baked.** For the slowest phones there is a third way to draw it:
all of the light from the bake and nothing live — no shadow map at all, no
light probes, no door dimming its rooms — the house unlit, as the view was
before any of the above. The Publish panel's *Lighting* says who gets it:
live off a phone and moving shadows on one (the default), live off a phone
and fully baked on one, or fully baked everywhere. `?lighting=live`,
`?lighting=baked` or `?lighting=static` in a link overrides it.

**The visitor's own choices.** The public view's menu (**M**) has the same
choice for whoever is looking — *Auto* (as published), *Best*, *Balanced*
or *Fastest*, which reloads the view — and a switch for each piece of
scenery the version has, which hides it at once: the car (not downloaded
while hidden), the trees and bushes, the hills (laid flat, being ground;
their trees and grass go with them) and the grass. Both are kept on the
visitor's device for every space (`Utils/viewerChoices.js`,
`World/Scenery.js`). What they cost, drawn fully baked on the phone tier:
from the front path, the trees are 0.93 of its 1.45 million triangles and
the car 0.25 (53 draw calls); the grass and the hills' tufts about 45 draw
calls each; the house itself about 550 draw calls. A hidden tree's shade
stays baked on the lawn.

**Doors shut.** The bake has no door leaves, so its light comes through
every doorway, shut or not: the live sun and lamps are shaded by the leaves,
and on a phone the sun is too, but the light from the sky and everything
bounced came through a shut door as through an open one — a windowless WC
stayed lit with its door shut. So the bake shuts each room door in turn —
a leaf in the doorway as `World/Door.js` hangs it — and bakes the rooms
either side of it again, by day, those rooms alone, keeping how much of
their light stays: texel by texel, in one grey atlas of every door's rooms
at half the lightmap's texels (`doors.webp`, and a phone's copy), and for
each room all told. The view dims each room by it as its doors close, eased
as the leaf swings: the WC goes dark behind its shut door, a bedroom with a
window hardly changes. It dims only that light, lit live or drawn from the
bake; two doors of a room shut together each keep their share, and the
night dims as the day does. A switch's light in a room next door that it
reaches through doors alone is let in as far as they are open. The thin
faces and the light probes, which have no texels of it, take the room's
share of its light all told; and a leaf's two faces are lit apart, each by
the probe on its own side, so a shut WC door is dark inside and lit by the
hall light outside. A room with doors reads their atlas as one
more texture, so lit live it adds three switches' light rather than four.

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
version's runtime file carries them, shut, and in a view lit live they
are lit by the light probes and shade the lamps' and the sun's light as
they move; drawn from the bake, as on a phone, they are lit by the light
probes too, or, from a bake without them, like the door leaves, from the
probes of the nearest door on their floor.

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
starts at the step its graphics keep up with (a phone 1, other discrete cards
3, Apple Pro/Max/Ultra chips and RTX cards 4); a visitor's own choice is kept
on their device, and if the GPU gives up (its WebGL context lost) the next
visit starts a step lower. The shadow map is never bigger than the device
can make. In Ladonia's street view at 1920 × 1080 on an M-series Pro a frame
takes about 12 ms at the first step and 24 ms at the last (twice that with
another 3D page busy on the same GPU).

Phones and tablets draw at a pixel ratio of at most 1.5 with a smaller,
harder-edged sun shadow, in the public view and the walkthrough alike.
`?quality=low` or `?quality=high` forces step 1 or 3 on any device
(`?quality=0`…`4` or `max` any step), and
`?stats` on any link shows frame rate, draw calls, triangles and the bytes
downloaded — which is how to compare a change on the device it is for.

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
  outside stairs and the pool lit from under the water; bloom.
- **Post-processing** (`frontend/Experience/PostProcessing.js`), not on
  phones: [N8AO](https://github.com/N8python/n8ao)'s ambient occlusion,
  half-resolution and upsampled by depth, from the depth buffer alone — so
  a leaf card shades as its leaf, not its square — then bloom at night,
  then tone mapping. Its chunk is only downloaded for such a space.

Its assets are bought in, all CC0 or MIT — Poly Haven textures and skies,
ambientCG grass, ez-tree's trees — listed with their sources in
`assets/THIRD_PARTY.md`:

```bash
npm run site-assets              # textures and skies → public/textures/pbr, public/textures/sky
npm run trees -- --textures      # ez-tree's bark and leaves → public/textures/trees
npx vite scripts/trees           # grow the trees in the browser, "Download all"
npm run trees -- ~/Downloads     # pack them → public/models/vegetation
```

Its live view has not been through publishing and baking yet: open it
unpublished (`/view/kosinozici-villas`, which is drawn live and merged) or
with `?live`.

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

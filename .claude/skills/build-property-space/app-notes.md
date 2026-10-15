# App notes: what a space meets beyond its own scripts

Read the part you need when a space is furnished, published, baked, lit,
driven or edited, or when the tools misbehave. SKILL.md is the method;
this is the app around it, learned the hard way.

Its sections, in order: The spec, the validator and the editor · The
editor's plain light and view scope · Rays and the collision trees · When
the editor draws · Lights and fittings · People ·
Furniture · Doors · Finishes · Publishing and the public view · What a
visitor is given · The bird's-eye view · How a baked view is drawn ·
Exposure in a baked view · Live room light · Baking · Measuring · Tone, AO
and colour · Cars · Blender · The browser pane · In-page audits · Shell and
tools · Git. Until 2026-10-12 the seven from "Publishing" to "Measuring"
were one section, "Publishing, the public view and baking": an older note
that points there means one of them. "Rays and the collision trees" and
"When the editor draws" are of 2026-10-13, as are the editor's stand-ins
(in its plain light's section), and "Live room light" was written again
then for the rooms drawn unbaked: a note from before that describes
lamps lit over the bake, which is gone. Every frame time here is one
Mac's (an Apple M4 Pro) unless it says otherwise; how they were taken is
"Measuring".

## The spec, the validator and the editor

- `server/scene/validate.js` rebuilds rooms, walls, openings, stairs, floor
  openings, doors, vehicles, furniture, people and spawns field by field: a
  new field or top-level key is silently dropped on seed and on every editor
  save until it is added (as `closetSpec`, `RAIL_SIDES` and `people`
  were). Garden settings must exist
  in `shared/garden.js`'s `GARDEN`. The landscape is kept as given, within
  `sanitizeLandscape`'s limits (shared/landscape.js). After adding a field,
  check it survives `npm run seed -- <id>` and an editor save, and restart
  the test server; the user's own server keeps dropping it until they
  restart it too.
- Read the seed's printed notes every time ("walls[256].openings[1]:
  overlapped the previous opening, dropped") and its room/wall/door counts.
- `npm run seed` without an id rewrites every seeded space: always
  `npm run seed -- <id>`. Back up every `scenes/*.json` to the scratchpad
  before any seed, and if a bare seed happens, copy the others back from
  that backup. Never `git checkout` a scene file: every one can carry
  uncommitted work — the user's own edits, and since 2026-10-09 Ladonia's
  people.
- The editor: flights rest only on floors (`gravity: "floor"`); its fit
  check must stop at a flight's cupboard ceiling; a flight through an
  opening keeps its head when resized. If the user reports "can't change X,
  it would hit Y", reproduce it in a test editor with saves stubbed first.
  Aim its camera with `editor.view.lookFrom(pos, target)` then
  `editor.view.update()`; it resets the camera on every draw otherwise.
- Room polygons on one level must never overlap: the floors z-fight as
  black stripes and the editor files fittings under the wrong room.
- Chrome and mirrors are black without an environment map:
  `Utils/reflections.js` gives a PMREM room only to metals (metalness ≥
  0.5, roughness < 0.6, no metalnessMap — or any metal with `imageLit`) and
  clear glass. Keep paint and lacquer below 0.5 metalness (paint at 0.5+
  turns studio-silver). Furniture loaded after the Environment must go
  through `applyReflections` (FurnitureLibrary does). Night reflections are
  scaled down or metals glow in the dark: 0.06 under a landscape's Sky
  (`Sky.applyIndoor`), 0.03 under the old Environment presets.
- `THREE.Color("#hex")` is linear: write it into a canvas (sRGB) with
  `color.getRGB(target, THREE.SRGBColorSpace)`, or the texture comes out
  far too dark.
- If something "exists" but nothing shows, look for NaN in its bounding box.
- meshopt-packed GLBs keep each mesh's quantisation in its node's TRS:
  never overwrite a packed node's scale or position from the app; wrap it
  in a parent and transform that.
- The editor's collections (Editor/Collections.js) file a piece by the
  room under its bottom: a lamp hung over a terrace or a roof deck is the
  deck's, Outside (as is the furniture on it); a lamp hung from a ceiling
  is filed by its bottom's storey, which can be the storey above's level
  index when storeys of two buildings interleave (Ladonia's A tracks at
  2.55 m read as C's first floor, 2.2) — known, not fixed.

## The editor's plain light and view scope

What an editor tab (`/?scene=<id>`) draws as it opens is not what a visitor
sees: one plain light, the houses alone — and, since 2026-10-13, not the
scene's own meshes but stand-ins for them. All three came of the
performance work of 2026-10-10/14 (SKILL.md, Corrections log) — the editor
is to be fast to work in — and all three change what a test tab shows and
what a helper that reads the scene finds. Read this before taking a frame
in one, and "When the editor draws" before waiting for one.

- **The editor's plain light** (`World/PlainLight.js`): edit
  mode is always drawn under one fixed rig — an ambient light (0.35), a
  hemisphere light (0.7) and one unshadowed directional (1.7) from over the
  camera's shoulder, exposure 1 whatever the garden's setting, the day's sky
  at 0.3 to reflect, no fog — the same by day and at night; and so is the
  editor's walkthrough unless **Realistic preview** is on (`P`, the HUD's
  button, the View menu, the header's button,
  `world.setPreview(true, { remember: false })`,
  `localStorage["editor-preview"]`, `?preview=1`). `world.plain` says which.
  Under it every other light is out of three's light state — on no layer
  (`light.layers.mask === 0`), not hidden, not at 0 — RoomGlow is out of the
  shaders (`roomGlow.setShown`), `Realism.update` and `settle()` return at
  once, and LampPool, RoomGlow, the room probe, the sun's shadow map and
  the post-processing do not exist until the preview (or a publish, which
  holds the scene realistic meanwhile: `world.holdRealistic()`) first asks
  for them. So to look at or test live light, shadows, glow or the look,
  `await world.setPreview(true, { remember: false })` first: a frame taken
  as the editor opens shows none of it. Day and night under it differ only
  by the sky behind and the lamps' glass. Anything that makes a light must
  hand it to `world.plainLight?.keepOut(light)` there (CarLights, Openables,
  LampPool, Flora do): let into the light state for one frame, it has every
  shader built again. A public view has no plain light.
  - A publish from the plain view holds the scene realistic *without
    drawing it* (`experience.suspended` from the hold to its release): the
    canvas stands still for the whole publish, and afterwards the sun's
    shadow map, the room probe and the realistic programs still do not
    exist (`environment.sun.shadow.map === null`). The files are the same
    as from the preview (checked 2026-10-10: binary chunks identical, JSON
    apart only in the timings and the pool's clock).
  - The time of day and the change of light take turns (`world.inTurn`):
    `setLighting` and `relight` asked for at once end as the last asked,
    never mixed. Going over to realistic waits for the sky's light to load
    (the dusk's HDR on a first night), so `world.plain` is still true right
    after `setPreview(true)`: await its promise before reading or testing.
- **The editor's view scope** (`World/Scope.js`,
  `localStorage["editor-scope"]`, `?scope=house|exterior|all`): the editor
  opens in **House** — the houses and their yards only. The garden
  (`world.vegetation`: Flora or Vegetation) is then *not built*
  (`vegetation.planted === false`, its group empty) until a scope that shows
  it, the realistic preview or the Garden panel first asks; the far terrain,
  the neighbourhood and the cars are hidden (`visible = false`), the sky's
  dome is on no layer and `scene.background` is a flat colour. **Exterior**
  hides the houses' insides instead (Collections.inScope: floors, ceilings,
  walls with indoor rooms on both sides, indoor furniture, stairs, rails,
  light fittings; indoor people are left undrawn but still collide). So
  before judging trees, grass, cars, the sky or anything out of doors in an
  editor tab: `world.scope.set("all", { remember: false })` (or load with
  `?scope=all`), and wait for `world.vegetation.treeSet.kinds.size` to reach
  its species. `world.scope.current` is what is drawn now ("all" under the
  realistic preview and while a publish holds the scene);
  `world.scope.exterior` whether the surroundings are. A room or level focus
  hides the surroundings in every scope — but not a car that stands in the
  room or on the floor in focus (`scope.cars` says only whether cars are
  drawn at all; the editor shows each by where it stands) — and puts the
  flat colour behind it, the Garden panel open or not. A floor or a room
  indoors focused on in Exterior widens the view to All with a toast, as a
  selection does; Exterior picked with one in focus lets the focus go. In
  House, Home frames the houses and 12 m of yard round them
  (`collections.propertyBox()`), not the street's whole length. Collision,
  saving and publishing are the same in every scope; the hills behind a plot
  stay (hidden, they would leave a hole in the ground they are cut out of).
  Anything new that is drawn out of doors and is not a collection's must be
  hidden in `Scope.apply`, or it shows in House.
- **In a test tab, so:** a frame taken as an editor tab opens has no sun,
  shadow, lamp light, room glow, post-processing, tree, hedge, grass, car,
  far ground or sky in it. Whatever judges the look — a reference frame, a
  mean level, a night — needs the realistic preview first: `?preview=1` in
  the link, or `await __K.realistic()` (harness.js: `world.setPreview(true,
  { remember: false })`, then the post-processing's chunk and the garden's
  trees awaited — 5 s on Ladonia), which shows everything too. It holds in
  the walkthrough only: edit mode is always plain. Whatever only needs the
  surroundings there — z-fighting, the people's audit, a look at the garden
  under the plain light — needs the scope: `?scope=all`, or
  `__K.scope("all")`. `__K.render`, the views file's `__renderSet`,
  people-audit.js and zfight.js ask for what they need themselves
  (2026-10-12: as the editor opens the garden is not made, so the people's
  audit had no hedge, planter grass or tree to measure against, and
  zfight.js no car, far ground or neighbourhood); `walk.js` needs neither
  (collision is the same in every scope). Neither call keeps anything in
  the browser; the HUD's and the menus' own controls do (`editor-preview`,
  `editor-scope`: remove them after a test that clicked). Say of every
  editor frame and timing which light and scope it was taken in.
- **What it bought** — two measurements, each two builds taking turns in
  one sitting ("Measuring"): median ms a frame, step 4, 1280 × 720 CSS at
  ratio 2, the tab as it opens (plain light, House) unless said.
  - *The plain light and the House scope* (2026-10-12: the committed code
    → that day's build). Ladonia's edit mode over the whole property 44.8
    → 22.0, one villa 47.7 → 18.0, a view of one room 24.5 → 6.6 (the
    cells' "one room": the camera on a room with nothing in focus — a room
    *in focus* was a cell of its own, 12.3 → 3.8); at night
    53.6 → 22.5, 70.6 → 19.0, 29.3 → 6.4 (the new frame is the same by day
    and at night). Walking: living room 32.6 → 9.8, pool 57.8 → 22.7,
    street 52.3 → 23.1; at night 53.9 → 10.2, 87.9 → 23.2, 73.4 → 22.9. All
    is 2–3 ms more than House. A chair selected: 65.7 → 34.0 (villa), 40.6
    → 13.5 (room), 47.7 → 18.6 (walking). With the realistic preview,
    against the old walkthrough: by day 32.9 → 24.7, 57.4 → 44.4, 51.8 →
    40.7; at night 54.0 → 26.4, 86.0 → 46.1, 70.7 → 41.0. Load to a
    furnished, walkable scene 6.4–8.2 s → 4.3–4.5 (a walkable shell 2.9 →
    1.35 s). Wrenfield: edit mode 13.9–15.0 → 5.2–5.4, a room 10.2 → 2.9,
    walking 12.5–14.9 → 3.7–5.5; load 2.3 → 0.83 s.
  - *The stand-ins, the indexed rays, the kept collision trees, frames on
    demand and the outline* (2026-10-14: that build → this one; the rest of
    this section and the two that follow). Ladonia's whole property 24.3 →
    10.9 (41 → 92 a second; 9,541 → 1,438 draw calls), one villa 20.0 →
    10.3, one room 6.0 → 5.9 — unchanged: the merged building is drawn
    whole where three culled it mesh by mesh (856 → 274 calls, 0.30 → 0.41
    million triangles). Walking, the renderer with the world's and the
    camera's update: living room 20.0 → 8.7, pool 36.9 → 12.1 (27 → 83 a
    second), street 35.8 → 11.3. A piece selected over a villa 33.9 →
    11.8. A drag's pointer move 101 ms → 2.8. Leaving edit mode after an
    edit 2.4–3.0 s → 26–32 ms. An edit view left alone: every frame the
    browser offered → 19 frames in 10 s. Load to a furnished, walkable
    Ladonia 6.5–6.7 s → 2.2–4.1 (four loads of the new build: 2.2, 4.1,
    2.8, 3.5; the app in an iframe, its frames and short timers driven
    flat out — which is why the build before reads 6.5–6.7 here and
    4.3–4.5 in the sitting above: compare within a sitting only).
    Wrenfield's whole house 5.2 → 3.9 (1,921 →
    690 calls). The pictures under the plain light are equal to rounding:
    they differ on edges alone.
  - *What that sitting found slower*, none of it mended: walking indoors
    in Wrenfield's editor, 9.8 → 15.3 ms a whole frame (the furniture's
    collision tree: "Rays and the collision trees"); the realistic
    preview, 0.3–2.4 ms a frame more inside `render()` with the same draw
    calls and triangles (Ladonia by day 20.5 → 21.6, 36.6 → 38.5, 33.7 →
    36.1; Wrenfield +0.4–0.5) — not the stand-ins (switched off, the
    same); cause not found. A preview's whole walking frame is shorter all
    the same (the pool 51.3 → 39.3): its two rays went. And, smaller: a
    room in focus on Ladonia, 3.2 / 3.7 → 3.8 / 4.2 ms best / median
    (inside `render()` 1.5 → 2.3 with half the draw calls); Wrenfield's
    first frame after leaving edit mode with furniture moved, 61–80 ms
    long (to the first walking frame still 67–88 ms where it was 166); the
    longest frame of a load, Ladonia 51–64 ms → 130–167.
  - One-off costs the plain light moved (measured 2026-10-10, on its first
    build): the first switch to All stops for 1.6 s on Ladonia (1.2 on
    Wrenfield) while the garden is made, its trees in at 2.1 s; the first
    preview on a page that never showed the garden is ready after 3.6 s
    (0.2 with the garden made); with no shadow pass three uploads a mesh
    only when it first comes into view, so the first frame turned towards
    the villas is 0.4–0.6 s long, once. What the preview makes — the sun's
    8192 shadow map, the post-processing's pictures, the probe, LampPool,
    RoomGlow — stays allocated under the plain light until the page
    reloads.
- **The editor's stand-ins** (`World/StandIns.js`, `Utils/layers.js`; since
  2026-10-13): under the plain light the house and the furniture are not
  what is drawn. The building — walls with their fixed joinery, slabs,
  roofs, rails, flights, the rooms' light fittings — is drawn as one merged
  mesh a material over the whole property (a "bucket", its triangles in
  world space), and the furniture as one InstancedMesh for each geometry
  and material that two or more meshes share (a "batch"). Both hang from
  `scene.getObjectByName("stand-ins")`, each named `stand-in:<its material
  or mesh>` with `userData.standIn`, and draw with the real meshes' own
  material objects — so whatever changes a material in place (a switch
  lighting a bulb's glass) shows without being told. The frame was the
  time three takes to hand thousands of small meshes to the GPU one by
  one — a wall panel alone is six draws, a face each — not the triangles.
  Before the stand-ins the editor's house was not merged at all, and that
  was most of what the plain light had left of a frame ("What it bought").
  - **The real objects are untouched** — in the scene, `visible`, with
    their materials — and are what picking, snapping, the fit test,
    collision, undo and a publish read. A real mesh that a stand-in draws
    is only moved off layer 0 onto `REAL_LAYER` (12): no camera draws it,
    and every Raycaster of the app looks at that layer too (`seeReal`).
    **A new Raycaster that meets the house or the furniture in the editor
    needs `seeReal`, or it passes through everything a stand-in draws** —
    an in-page tool's too (`raycaster.layers.enable(12)`: tried
    2026-10-14 from inside Wrenfield, five rays met 2, 1, 2, 2, 1 things
    without it and 2, 1, 8, 2, 2 with), and one whose ray is cast through
    the index (`rays.cast`, "Rays and the collision trees") as much as one
    cast by three; nothing else about a mesh says it is hidden
    (`mesh.layers.mask === 4096`).
  - **A helper that walks the scene meets both** — the real meshes, still
    `visible`, and their copies. One that measures what is there (a
    z-fight finder, a count of triangles) must pass over `userData.standIn`
    or it has every surface twice: `zfight.js` as it stood called 552 of
    Wrenfield's 615 clusters a surface against its own stand-in (mended
    2026-10-14: with the stand-ins on and off it now gives the same 63).
    One that walks `sceneBuilder.root`, the builder's lists or the
    collision (`people-audit.js`, `walk.js`) never meets them: the group
    hangs from the scene itself, and is in no list a ray, the collision, a
    merge or a publish goes through. Run that day on the new build:
    people-audit's six flags on Ladonia as on 2026-10-10, walk.js's 85
    doors with the one `noSpot`.
  - **Drawn as themselves, as before**: whatever is selected or being
    moved (the outline draws the real meshes, and against the depth they
    drew in the frame); a part of the building for
    a quarter of a second after it was built again (a window dragged along
    its wall rebuilds the wall and every room's fittings at each step:
    nothing is copied until it stands still — `standIns.waiting` counts
    them, `standIns.settle()` merges them now); anything see-through
    (glass, X-ray: three sorts those one by one); a wall's door leaves; a
    mesh that is the only one of its geometry and material, or mirrored or
    sheared; the ground, the landscape, the cars, the people. Of a
    building that is an imported model (`isModelScene`) no wall, slab,
    roof, rail or fitting is merged — only flights are, and its furniture
    is instanced; none of the three spaces is one, and it was not tried.
  - **Nothing has to tell it what an edit changed.** Each frame
    (`Renderer.render` / `Editor.render` call `standIns.update(camera)`) it
    looks at the builder's own lists — a part built again is a new group —
    and at each unit's root: its children, where it stands, whether it and
    everything over it is shown. What each mesh *inside* a unit wears, and
    whether it is shown there, is looked at when the world emits
    `finish-changed`, `scene-edited`, `furniture-ready`,
    `fittings-rebuilt`, `scope`, `mode`, `lighting`, `preview` or
    `switches-ready`, when the editor emits `settings`, `changed`,
    `selection` or `mode`, at every heartbeat of a view at rest ("When the
    editor draws"), and in turn every 16 frames besides. **So a change
    inside a unit that rebuilds and moves nothing and emits none of those —
    a mesh hidden by `visible`, a material swapped by hand — is drawn up
    to 16 frames late**, and a still drawn by hand straight after it shows
    the old picture (2026-10-14: a wall's panel hidden by `visible` went
    from the frame 13 frames on, and in a second trial one frame on and
    was back 16 frames after it was shown again — it is the unit's turn
    in sixteen that decides; after `world.standIns.hear()`, in the
    next). Call `world.standIns.hear()` after such a change. Hiding a
    wall's, a room's or a piece's own group is seen in the next frame.
  - **Only under the plain light.** The realistic preview and a publish
    take the scene as built (`setActive(false)` from `World.switchLight`:
    every mask back to 1, the stand-ins hidden), so a publish is the same
    files (2026-10-13: every binary chunk of `view.glb`, `snapshot.glb` and
    `runtime.glb` identical to the publish before, the stats equal).
    `?standins=0` in the link, or `world.standIns.setEnabled(false)`,
    draws the editor as built — for comparing; `world.standIns.stats()`
    says what is merged, instanced and drawn as itself. Never in a public
    view, which has merges of its own (StaticBatcher, HouseMerger).
  - **Against the scene drawn as built**, a frame differs only where the
    old build's own frame changes when its camera moves a millimetre —
    edges, and surfaces within the depth buffer's
    step of each other (a threshold a millimetre under its floor seen from
    30 m, two walls' faces in one plane): 0.000–0.060% of the pixels by
    more than 8 levels over 23 poses and states of Ladonia, fewer than a
    0.01 mm camera move changes in 22 of them. From high over the
    property there were more — 257–1,073 of 606 thousand half-size pixels
    looking straight down from 40 m: two surfaces a millimetre or two
    apart, the depth buffer's step there 2 mm with the near plane at 5 cm,
    and neither picture right. Since 2026-10-14 the edit view's near plane
    goes out with its distance (`EditorCamera.update`: a two-hundredth of
    the orbit's radius, 5 cm to 0.5 m — half a millimetre's step at 40 m):
    Home over the whole property 352 → 8–20. A frame taken with a camera
    posed by hand keeps whatever near plane the view last set.
  - **A publish whose realistic light fails to come up** (`World.relight`
    keeps a sky's failure to itself) is still read as built:
    `holdRealistic` takes the stand-ins out itself. Before 2026-10-14 the
    snapshot would have been taken with 4,114 of Ladonia's 4,999 meshes on
    layer 12, which `canMerge` passes over (found by reading; made to
    happen with `sky.prepare` rejecting: none on layer 12 while held, the
    stand-ins back and the frame right after).
  - **What is still a draw each** in Ladonia's whole-property view (1,438
    calls): 365 one-of-a-kind furniture meshes and 51 see-through ones,
    190 door-leaf meshes, 89 panes of glass, 91 for the people, beside the
    315 batches and 126 buckets. X-ray gains little (7,128 → 4,641 calls):
    see-through walls, ceilings and roofs are drawn one by one for three
    to sort. Not tried: door leaves merged at rest, glass, materials that
    are equal counted as one (685 objects for 143 names).
  - **Never give a scene object a property of its own** (`mesh.foo = …`,
    even `mesh.raycast = …` or `mesh.boundingSphere = …`, least of all
    `delete`): it makes that object another kind of object to V8, and
    three's draw loop and every ray read all of them. Measured here: a
    property on four meshes in five made the crosshair's ray 2 ms a frame
    slower (5.5 → 7.4 ms on Ladonia); one on the 441 stand-ins made the
    realistic preview, which does not even draw them, 1.5–2 ms a frame
    slower. Use what is there: `layers`, `userData`, `visible`. (A mesh
    with a `boundingSphere` of its own, hooks of its own, a `renderOrder`
    or a draw range is left to draw itself: `kindOf`.)

## Rays and the collision trees

Since 2026-10-13 a ray is answered from an index, and the trees the visitor
walks against are mended after an edit, not built again. Neither changes
an answer: the same hit, and the tree that building from scratch gives —
both the building's and the furniture's the very tree of the build before
(for a few hours of 2026-10-14 the furniture's was cut from a wider box:
below, what that cost and why it was taken out). Read this before adding
a ray, a thing that moves by itself, or anything that reads
`world.collision`.

- **Every ray goes through `rays.cast`** (`Utils/rays.js`; the one
  instance is also `world.rays`): `rays.cast(raycaster, roots)` is
  `raycaster.intersectObjects(roots, true)` — the same hits in the same
  order, each with three's own numbers (point, distance, face, uv) — for
  the crosshair (`Player.updateLookTarget`), the camera's boom
  (`Camera.resolveDistance`), a click (`Editor.raycast`, `surfaceUnder`,
  `sightUnder`), the walkthrough's aim (`FieldEdit.aim`), a person's seat
  (`seatingHit`), and a dragged piece looking for what it stands on
  (`Snapper.supportUnder`: `rays.hold(roots)` once, `rays.through` for
  each of its five rays; `TransformSession.resolve` has the snapper hold
  for the whole of a step). `rays.into(raycaster, object)` is
  `intersectObject(object, true)` for one piece (`Editor.ridersOf`).
  three's own way asked every object under the roots, and every triangle
  of every mesh whose sphere the ray touched — the terrain's fifty
  thousand, whose sphere holds the visitor wherever they stand.
  - **Two indexes.** Each child of a root (a wall, a room, a flight, a
    piece, a car) is a *unit* with a box round it; only the units whose
    box the ray crosses within its reach are gone into, by three's own
    walk (layers, each object's own `raycast`). A plain Mesh of 96
    triangles or more is asked through a tree of its geometry's triangles,
    made the first time a ray reaches it (Ladonia's 50-thousand-triangle
    terrain: 8–11 ms, once; a mesh of a few thousand, under a millisecond —
    so the first look at a room of furniture never looked at is a frame a
    few milliseconds longer): three's own sphere and box test, then three's own
    triangle test (`Mesh._computeIntersections`, a three r163 method that
    is not in its documentation — `rays.js` falls back to `mesh.raycast`
    without it) over the runs of triangles the tree finds, by way of the
    geometry's `drawRange`, which is put back at once. Nothing of three's
    arithmetic is copied.
  - **It looks before every ray; nothing tells it.** A root's children,
    each unit's `matrixWorld` and children, and inside a unit whatever
    moves by itself — a node with `userData.doorLeaf`, `hingeSide` or
    `opens`; every part of a car (`userData.kind === "car"`) — are
    compared with what they were, and a unit that differs has its box
    taken again (28 µs for Ladonia's eleven hundred units). What that
    cannot see is a change deep inside a unit that moves nothing and swaps
    no child of the unit's root: `rays.touch()` has every unit looked
    through before the next ray (0.8 ms), and World calls it on
    `scene-edited`, `finish-changed`, `furniture-ready`,
    `fittings-rebuilt`, `scenery-ready` and `bird-ready`, the Editor on
    its `changed`, `SceneBuilder.showHills` itself. **So: something new
    that moves by itself inside a wall or a piece needs one of those
    flags, or to be a unit of its own; code that reshapes a geometry in
    place sets `position.needsUpdate` (the triangle tree is made again by
    its `version`) and calls `rays.touch()`.**
  - A unit holding anything but plain meshes (a line, a sprite, an
    instanced or skinned mesh, an object with a `raycast` of its own — the
    editor's people picker) is always gone into, and those are asked by
    their own `raycast`.
  - **In a test tab:** `world.rays.cast(rc, roots)` against
    `rc.intersectObjects(roots, true)` with `rc.layers.enable(12)`, hit
    for hit (2026-10-13: 1,200 rays of Ladonia's and 1,250 of Wrenfield's
    — crosshair, boom, straight down, a click's, long ones — 11,237 hits,
    every field equal — the hits' count is the builder's note; its report
    gives 14,667 and more over four sets, Ashgrove's and a public view's
    among them). `world.rays.stats` counts casts, looks, units scanned
    (`scans`) and entered, trees made (its `units` is never counted).
  - **What it bought** (Ladonia, the editor as it opens; before → now).
    Walking, outside the renderer: the crosshair 5.4–5.5 ms a frame →
    0.09–0.11, the camera 2.1–4.9 → 0.04–0.06, `world.update()` 5.5–5.7 →
    0.23–0.37. A click's pick 7.8 ms → 0.10, `surfaceUnder` 7.9 → 0.08. A
    step of a drag (the pointer event, 312 of them over 39 drags) 77.5 ms
    median, 160 at the ninetieth, 180 worst → 2.4–2.8, 5.1–5.3, 22–23 (a
    flight dragged, which builds its floors again at each step; once 48
    for a page's first, the trees being made); `supportUnder` 38.9 ms a
    call → 0.2; a move begun (G) 41.6 → 5.1. Wrenfield: a step 7.1 / 21.5
    → 1.4 / 2.6–3.2, a pick 1.24 → 0.08. What is left of a step is the placing of the
    scene (`updateMatrixWorld` over the shell and the furniture, 0.5 ms,
    once a step), some thirteen rays at 0.06 ms, and the fit test against
    the building (`FitChecker.hitStatic`, 0.9 ms: every static mesh's box
    in turn — not touched).
  - **A public view** casts the crosshair at its doors, its cars and the
    furniture's doors and drawers (Ladonia: 76 + 3 + 38 units), and finds
    the house itself in the collision tree, each triangle saying what it
    is of — as before. There the crosshair was 0.05–0.10 ms already (now
    0.03–0.04) but for the cars: beside one, three went through its
    hundred and ninety thousand triangles, 2.6–4.5 ms a frame → 0.03–0.07.
- **`Collision.rayIntersect(ray, { twoSided, far })`**: with `far`, only
  the cells the ray crosses within that reach are looked in; a hit within
  it is the hit three's `Octree.rayIntersect` gives. The crosshair passes
  its 4 m, the boom its length, a car's wheel its drop. A hit past `far`
  may be reported or not — test its distance.
- **The collision trees are kept in step, and are the same trees**
  (`Collision.js`: `TreeKeeper`, `SceneBuilder.staticKeeper` and
  `dynamicKeeper`). Leaving edit mode after any edit built Ladonia's 961
  thousand furniture triangles into a tree again: 2.3–2.9 s with the page
  frozen. Now each wall, room, ramp and piece is a *source* whose
  triangles are kept (`staticCollisionSources`, `dynamicCollisionSources`:
  in the order `buildOctree` would visit them); `update` looks at every
  source — its meshes, their geometry and `matrixWorld`, a boxed piece's
  box — makes again the triangles of those that differ, and mends the
  tree in the cells they left and came to.
  - **Cell for cell and triangle for triangle, in the same order, it is
    the tree building from scratch gives** — the order is what three's
    tree pushes a capsule out by, so the walk is the same walk to the last
    digit. Checked 2026-10-13 by folding a tree's cells, boxes and
    triangles into one number: equal to the build before's after each of
    39 + 24 drags, a move, ten, a piece added, a door slid along its wall,
    a piece put outside all the others, a sofa stood across a door and
    taken away, three undos — in both spaces — and to three's own split of
    the same scene made in the page each time; `walk.js` through villa A's
    thirty doors, and seven routes (a terrace, a flight up and down, a
    room) with every step's place folded likewise, equal in both builds.
    **And again on 2026-10-14, as the code now stands**, in Ladonia,
    Wrenfield and Ashgrove, the same thirteen steps in a tab of each
    build — as loaded; a piece moved 0.5 m among the others, and undone;
    the piece put 60 m beyond them all, and undone; a piece deleted,
    undone, redone, undone; a piece duplicated beside its original,
    deleted, undone, undone — the trees brought up to date
    (`refreshCollision()`) and folded after each: the furniture's tree in
    this build equal to the build before's at all thirty-nine (its box,
    its cells, its levels, its leaves and the largest, and a sum over
    every cell's box and every leaf's triangles in order), equal each
    time to the tree made again from nothing in the page
    (`dynamicKeeper.clear()`, then built), and the building's equal too.
    As loaded: Ladonia a box 24.6 × 10.0 × 65.9 m, 6 levels, 19,904 leaves,
    the largest 5,296 triangles; Wrenfield 15.3 × 8.5 × 24.0 m, 6 levels,
    5,918 leaves, the largest 1,052; Ashgrove 5 levels, 767 leaves, the
    largest 605. The walk: villa A's thirty doors both ways, seven routes
    (the outside flight up and down, a flight to the roof, two terraces,
    a roof terrace, a living room) and forty-four drops of the visitor
    onto and beside pieces (into the living room's sofa among them), each
    left 90 frames then walked 45 — 703 coordinates, every one equal in
    the two builds, not to a millionth but to the digit; Wrenfield's 19
    doors, four routes and 43 drops (574), Ashgrove's 18, two and 40
    (531) the same. (The people's boxes out of it —
    `collision.setPeople(null)`: they differ from load to load, and one
    route by the pool brushes someone.) `node
    scripts/test-collision-tree.mjs` holds the same on made-up furniture —
    the keeper's tree against `buildOctree`'s and against the committed
    split (three's own `Box3.intersectsTriangle`) through 53 edits, and
    the tree handed out while another is built: 64 of 64 on 2026-10-14.
  - **`buildOctree` is the same split, written out**: three's
    `Box3.intersectsTriangle` made three arrays a call and was asked of
    every triangle and each of eight cells at every level. `touched` asks
    the box's own three axes once for both halves, takes a triangle well
    inside one cell (a micrometre) as in it and no other, and puts the
    rest to three's other ten axes, term for term. Ladonia from scratch:
    the building 395–432 ms → 62, the furniture 2,323–2,429 → 350 (250
    with its triangles kept); a published view's two trees likewise, at
    load.
  - **When it builds again from scratch**: the edit changed the box round
    all the sources — every cell is cut from it, to the digit
    (`keeper.low`, `high`), so the outermost piece any way moved at all,
    a piece put beyond all the others, the first piece or the last —
    changed the order of sources that stayed (with nothing else changed,
    too: until 2026-10-14 that was reported "same" and left the old
    tree), or changed more than three tenths of the triangles
    (`MEND_SHARE` 0.3, of the larger of the tree before and after) — or,
    where it need not wait (next) and the tree is of over 150 thousand,
    more than 60 thousand of them (`MEND_AT_ONCE`: mending that many at
    once is 40–65 ms and grows with them).
    `keeper.last` says which (`how`: none before its first update, then
    same, mended, built, building; `why`: bounds, order, share, long,
    empty, begun — and finished, for a sliced build ended by a call that
    waits).
  - **A box with room round it was tried, and taken out the same day**
    (2026-10-14). Cut to fit, the outermost piece nudged — or a chair
    carried out onto the lawn, and its undo — leaves every cell to be cut
    again: Ladonia's 961 thousand triangles for two pieces. So for a few
    hours the furniture's tree was cut from a box 24 m wider each way and
    6 m up and down, within which every edit was a mend. **What that
    cost**: a cell is divided only while dividing it separates something —
    `divide`'s rule, the committed code's: more than eight triangles,
    fewer than its parent holds, and room to halve — and furniture in the
    middle of a box three times its size is halved once by the root and
    then lies whole in one corner of each half, which therefore "separates
    nothing" and is never divided again. Wrenfield's tree came out 2
    levels deep with 5 leaves, the largest of 17,989 triangles, in a box
    63 × 21 × 72 m (it is 6 levels, 5,918 leaves, the largest 1,052, in
    15 × 9 × 24): the visitor's capsule was handed 17,242 triangles a
    frame indoors, `Player.updateColliderMovement` cost 10.9 ms a frame
    where it costs 0.01, a walking frame 15.3 ms for 9.8; Ladonia's
    largest leaf was 31,902 for 5,296; and dropped into a sofa the visitor
    ended 30 cm from where the build before puts them. The box is the
    sources' own again, and the tree the build before's (above).
    - **The same rule is the build before's, and has the same weakness
      there — kept, since the tree is to be the same tree**: a piece
      carried far beyond the others stretches the box, and the tree built
      in it is coarser for as long as the piece stands there. With one
      piece 60 m out (in both builds alike): Ladonia 9,190 leaves for
      19,904, the largest 6,830 for 5,296; Wrenfield 1,954 for 5,918;
      Ashgrove 210 for 767, the largest 1,648 for 605. And a dense small
      piece that falls whole into one cell of eight stops the split
      there: that is what Ladonia's leaf of 5,296 is. To look: walk
      `world.collision.dynamic`'s cells (`subTrees`, `triangles`) for
      their depth and their leaves' sizes, and time
      `player.updateColliderMovement()` at the pose — **after touching how
      a tree is cut, time the walk, not only the edit.** Read on
      2026-10-14, ms a call (fifty calls a reading; the build before in
      brackets): Wrenfield's living room 0.004 (0.002), its kitchen
      0.012 (0.006), the street 0.002; Ladonia inside the living room's
      sofa 0.098–0.102 (0.098), a bedroom 0.034–0.036 (0.034), by the
      pool 0.012–0.014 (0.012); the capsule handed 0, 62, 0 and 725, 181,
      80 triangles of the furniture's, in both builds.
  - **`refreshCollision({ wait: false })`** (leaving edit mode, a piece
    let go in the walkthrough, a walking key in edit mode): a tree of over
    150 thousand triangles that has to be built again — the box changed,
    a third of them moved — is built a slice a frame (`stepCollision`,
    6 ms, from `World.update`; the root's own division is one slice of
    26–40 ms), and `world.collision` is meanwhile **the tree as it was
    with what changed put right in it** (`TreeKeeper.meanwhile`,
    `keeper.job`: `old`, `aside`, `stale`): the triangles of the sources
    that went taken out of its cells as any mend takes them, those of the
    sources that came in a small tree of their own beside it, both under
    one root that three's walks and ours go through like any cell's
    eight. Every piece is where it stands, in other cells than building
    from scratch gives — so for the half second the build takes the walk
    is not the build before's to the last digit (that build stood frozen
    2.4 s instead), and nobody walks through a sofa or into one that has
    gone. Where more than 60 thousand triangles changed (`MEND_AT_ONCE`
    again: putting that many right is itself a long frame) the tree is
    left as it was, the job says `stale`, and all that is left of the
    build is done in the frame the visitor first moves
    (`Player.underWay()`: a key, the stick, a jump, a fall, a car — 181–205
    ms once on Ladonia, for a step taken within half a second of Tab
    after four of its largest pieces were moved). A tree of under 150
    thousand (Wrenfield's 53) is built at once: 16–28 ms. `world.collision`
    is the new tree only when the job is done: `refreshCollision()`
    waits, and `settleCollision()` finishes one begun — a publish does
    both (`Runtime.js`, `Snapshot.js`), and a test that reads the tree
    after an edit must (`walk.js` after `editor.leave()`:
    `builder.settleCollision()` first, or drive frames until
    `!builder.dynamicKeeper.job`).
  - **What it bought** (`editor.leave()`, before → now). Read on
    2026-10-14 with the app's own frames run and timed to the pixel, the
    handler and when the first walking frame was on screen, ms after the
    key (the build before: 2.4–3.0 s, whatever was edited, measured the
    same day). Ladonia: nothing edited 9–14 / 20–26; one piece moved
    among the others 19–25 / 29–36 (`mended`, 1.5–3 ms; the longest frame
    after 13–21); a piece put beyond all the others, or brought back,
    19–35 / 59–74 (`building`, `bounds`; the first frame 36–42 ms with the
    root's division in it, 30–37 frames in all while it builds, of 11–17
    ms with a slice in each, the new tree 0.52–0.57 s after the key —
    walked from the first frame, W held, the same); the piece put beyond
    and three large ones moved (58 thousand triangles) 38 / 73, 29
    frames, none over 35 ms. Wrenfield: nothing 1.2 / 7; one piece 3.5 /
    20 (the longest frame after 17 ms; the measurement, with the wider
    box, met one of 80 there); a piece put beyond 17.5 / 25, and back 29
    / 36 (`built` at once, 16–28 ms).
    `refreshCollision()` waited for, a piece moved among the others: 3–4
    ms on Ladonia where the build before took 2.3–2.5 s, 1 ms on
    Wrenfield for 250, under 1 on Ashgrove for 29; a piece put beyond:
    224–258 ms, 17–24, 4.
    Earlier, on 2026-10-13 (two sittings; `editor.leave()` alone):
    Ladonia after one piece moved 2,363 ms → 12–21; ten 2,391 → 25–77
    (24 sources, 42 thousand triangles: the mend itself 16–35); a piece
    added 2,408 → 11–19; a door slid along its wall 2,892 → 12–18; 39
    drags (54 sources, 91 thousand triangles: a slice a frame) 2,405 → 38,
    then 36 frames of up to 35 ms. Wrenfield: 139–380 → 2–45.
    Of Ladonia's 12 ms after one move the keeper's own work is 2–4: the
    rest is leaving edit mode.
    - **Not explained**: of 39 builds a slice a frame watched on
      2026-10-14, 36 had no slice over 42 ms — 26 of them made to catch
      one, with the heap read round every slice; three had one stop of
      136, 245 and 712 ms inside a slice, and once Tab's handler took 323
      ms with 6.7 of it the keeper's. No slice does that much by the code
      (it ends with the cell it is dividing: the root's 26–40 ms is the
      longest) — the page was stopped there, by a garbage collection or
      by the hidden pane's process being set aside. Not seen in a visible
      tab.
  - A keeper holds every triangle's source, so nothing here is for a tree
    made by `buildOctree` alone (a published view's, the people's boxes,
    the garden's trunks): those are built whole, as before.

## When the editor draws: frames on demand, and the outline

Since 2026-10-13 the editor under its plain light draws a frame only when
the picture may have changed (`Experience/Pace.js`, `experience.pace`), and
its selection outline no longer draws the scene again
(`Editor/SelectionOutline.js`). A public view has no Pace and draws every
frame, as before. Read this before driving frames in an editor tab, before
adding anything that changes the picture without the user's hand, and
before touching what `Editor.render` draws after the scene.

- **What asks for a frame.** (1) *Something happened* — `experience.wake(why)`:
  any pointer, wheel, key, input or focus event anywhere on the page; every
  event the world, the editor, the people, the window's size and the
  camera's lock emit (their `emit` is wrapped: nothing has to be listed —
  `tick` alone is left out); three's loading manager, as each model, picture
  or sky arrives; another visitor moving (Player's socket); the quality
  slider; a restored context; `EditorCamera`'s every move,
  `Editor.applyVisibility`, `Editor.onSessionUpdate`,
  `World.gardenChanged` — and frames go on for 250 ms after the last of
  them (350 after the view last moved). (2) *Something is still moving by
  itself* — `pace.busy()`, asked after every frame: the view, a door or a
  drawer easing, the visitor walking, falling or driving, another visitor's
  figure not standing still, a collision tree built a slice a frame
  (`dynamicKeeper.job`), the stand-ins waiting to merge or to trim
  (`standIns.waiting`, `standIns.loose`). (3) *A heartbeat*: at rest, one
  frame every 500 ms all the same, in which no time passes
  (`time.resume(0)`) and the stand-ins look at every mesh — so a change
  nothing announced (a tool's `door.toggle()`, a material swapped by hand)
  is on screen within half a second, and whatever it set moving is then
  seen to be.
- **What it draws when.** `pace.state`: `"always"` — every frame: the
  realistic preview (`world.plain` false or wanted), a publish (held or
  suspended), the page until the space is furnished and the visitor is in
  (`walkthrough-active`), `?frames=always`; `"awake"`; `"rest"` — 30 frames
  a second: the walkthrough standing still, and edit mode while a person is
  selected or being placed; `"idle"` — the heartbeat alone: edit mode
  otherwise. Measured, driven for 5 s with nothing touched: Ladonia's edit
  view 10 frames (the heartbeat's: 20 calls of `renderer.render`, the scene
  and the gizmo's overlay each; 110 in a second and a half before),
  Wrenfield's the same; the walkthrough standing, a frame every 30.3 ms
  driven — 30 a second on a display. In the final sitting (2026-10-14):
  an edit view of Ladonia left alone 10 s drew 19 frames, the build before
  every frame it was offered; its walkthrough standing, 163 frames in 5 s
  of 7.9 ms each.
- **What holds still at rest in edit mode**: the people's clips, the
  visitor's own figure, the pool's ripple, the wind (with the garden shown).
  They go on from where they were whenever frames are drawn for another
  reason, and the people play while one of them is selected. A heartbeat's
  frame moves none of them (`People.tick(delta, hold)`, `delta` 0).
- **A new thing that changes the picture by itself** needs one of: an event
  on the world or the editor (anything emitted is heard), a call of
  `experience.wake("why")` (free, and a no-op in a public view), or — if it
  goes on moving — a line in `Pace.busy()`. Without, it is drawn at the
  next heartbeat, and only as far as a frame with no time passed takes it:
  something that eases by `delta` and is in none of `busy()`'s lines would
  stand still at rest.
- **In a test tab** — the pane is hidden, so nothing is ever a real frame:
  - `__drive` runs the app's frames *as they are asked for*: in an editor
    tab at rest it spins over an empty queue and returns its turns, not
    frames. Count frames by `experience.pace.stats` (`frames`, `awake`,
    `rest`, `beat`, `always`, `skipped`, `wakes` and `busy` by name) or
    `renderer.frames`. A tool that counts on frames — "drive 400 ms, then
    read" — needs `experience.pace.set("always")` first (and `set(null)`
    after), or `?frames=always` in the link; a step that waits for
    something to come to rest can wait for `pace.state === "idle"`.
  - The heartbeat is a 500 ms timer: a hidden pane's come once a second,
    and once a minute after five minutes — use short timers (Measuring).
  - `experience.update()` by hand is now safe: one loop at a time, whoever
    asks (a frame already asked for is dropped for the one asked after).
    At rest it is a heartbeat's frame: no time passes in it.
  - Stepping the world by hand (`e.time.delta = 1 / 60; w.update();
    e.camera.update(); R.render()`) is untouched by any of this, as are
    `__K.time`, `__K.shot` and every tool that calls `renderer.render()`.
  - Synthetic pointer and key events wake it as real ones do; a change made
    through the editor's functions with no event (`ed.undo()`,
    `world.setFinish`, `switches.toggle`) is drawn at once too — they emit.
  - `?stats`: frames a second are those drawn, marked "(drawn on demand)".
- **Checked 2026-10-13** (Ladonia; each step with the app at rest, its own
  frames driven, the picture before, the first frame after, the last frame
  at rest and a frame drawn afresh by hand compared): orbit, pan, zoom,
  numpad views, orthographic, frame-all and frame-selected; a click's
  selection, the gizmo's hover, deselect; G with pointer moves, a typed
  move, a rotation, a cancelled move, the gizmo's arrow; undo and redo; a
  piece added whose model was not loaded, duplicated, deleted; a property
  and a finish changed; X-ray, the eyes, a room and a floor in focus; the
  three scopes (the garden made, its trees arriving); day and night; a
  light by its panel, its switch and a Ctrl-click; the Garden panel and its
  sliders; a door and a drawer (by their own `toggle()`, nothing told: the
  heartbeat saw them 0.14–0.51 s later, then every frame of the swing); a
  person added, selected, taken away; a window slid along its wall; the
  sidebar and the toolbar; the quality slider; Tab both ways; walking from
  both modes; another visitor walking in a second tab; a context lost and
  restored; a publish (every frame while it holds the scene, the view drawn
  again after). In every one the first frame after showed the change and
  the frame at rest was the frame drawn afresh, to the pixel (94 steps in
  one page of Ladonia, 50 of Wrenfield). A drag of 300 pointer moves drew
  300 frames, one a move: Ladonia's whole property orbited 10.0 ms median,
  17.2 at the 99th, 19.4 the longest; a sofa moved in a room 6.6, 12.4,
  14.3 (its pointer handler 2.6 median, 3.9 the longest).
- **The selection's outline** is three's OutlinePass to look at —
  its own edge, blur and overlay shaders, taken from it — without its second
  draw of the scene. The frame is drawn straight to the screen, whose depth
  cannot be read but can be drawn against: within the rectangle the
  selection covers, the picture is kept (copied to a texture), the
  selection's own meshes are drawn onto the screen twice — its whole shape,
  then what the frame's depth lets through — as the red and green of
  OutlinePass's mask, the mask copied out, the picture put back, and the
  outline made from the mask and added. Ladonia, a chair selected (best /
  median ms a frame added): 4.4 / 4.5 in a room, 9.7 / 11.7 over a villa
  and 13.4 / 12.2 over the whole property before the stand-ins; 3.8 / 4.0,
  5.5 / 8.4 and 6.5 / 8.3 with OutlinePass over the stand-ins
  (`?outline=pass`, kept for comparing); **1.2 / 1.4, 1.0 / 1.3 and 1.2 /
  1.4 now**, a sofa filling the screen 1.6 — almost all of it the three
  times the screen's own picture is left and come back to (two copies, one
  trip off screen), not the selection's size.
  - **What differs to look at**: what is seen through an X-rayed wall,
    ceiling or roof, or through a piece's own see-through glass (a shower's
    screen) — which write no depth — is outlined as seen, in amber, where
    OutlinePass drew it dim; a window's or a door's pane does write depth,
    and what is behind one is dim as before. The outline's inner edge is
    antialiased with the picture (300–3,200 of 2.4 million pixels differ
    by more than 8 levels from OutlinePass's, all on the line itself). With
    the gizmo drawn, some 25–40 pixels where its edges cross the scene's
    inside the rectangle differ by up to 14 levels from a frame with no
    outline (the samples under them were put back as one colour); with no
    gizmo the picture round the outline is put back to the byte.
  - It reads the screen mid-frame (`copyTexSubImage2D` from the canvas):
    nothing may be drawn over the scene's depth between `renderer.render`
    and `outline.render` in `Editor.render`, and the canvas must stay the
    render target there. `outline.last` is the last rectangle and mesh
    count. Not tried on another GPU: on this one the cost is the render
    passes it breaks, a millisecond whatever the selection's size.
- **Resolution while moving was measured and not built**: orbiting
  Ladonia's whole property at pixel ratio 2, 1.5 and 1 (1832 × 1324, 1374 ×
  993, 916 × 662), best / median ms a frame 9.7 / 10.2, 9.2 / 9.9 and 8.9 /
  9.3; one villa 8.9 / 9.1, 8.4 / 8.9, 8.0 / 8.4 — 0.2–0.5 ms for ratio
  1.5 and 0.7–0.9 for ratio 1, where 6.2 of the 10.2 ms is three's own time
  in `render()`: the frame is still draw calls, and a change of ratio
  reallocates the canvas and sharpens visibly on release. In a 1920 × 1200
  window, where the step's five million pixels cap the ratio at 1.68 (2610
  × 1915), ratio 1 buys 1.2–1.5 ms and ratio 1.5 0.4; Wrenfield 0.2–0.5.
- **The first frame after a rest is a longer one, by the GPU's own doing**
  (this Mac, pane hidden; not seen in a visible tab): with no frame drawn
  for 20 ms to half a second the next takes 7–10 ms more to reach the
  screen than a frame of a run (Ladonia's whole property: 17–24 ms where a
  drag's frames are 10; a room 14–19 where 6.6) — and after two seconds
  with none, 65–270 ms. The heartbeat keeps it at the first figure; so does
  the 30 a second of the walkthrough at rest. In a hidden pane the
  heartbeat's timer is the browser's to delay: a first move timed there
  after a long gap reads the second figure.

## Lights and fittings

- Every light needs a visible fitting where it is (`World/Fittings.js`):
  one ceiling light per indoor room — a pendant opal globe (drop 0.42) in
  rooms ≥ 10 m², ≥ 2.5 m high whose floor isn't a `ceramic_*` or
  concrete-generator finish (`bath_tile` counts as dry), else a flush dome,
  or `room.fitting: "recessed"` (a small downlight) where the design hangs
  its own pendants or tracks (kit.js's default). Each gets a wall switch
  1.1 m up, 0.16 m beside the entry door on its handle side. 9 W/m²
  (40 W at least), #ffd6a3. Don't put a second light under the space's own
  pendant.
- A catalogue lamp gives light (bake, switches, live lights) only with a
  node extra `light: { at, power, color, glow, radius[, room] }` in the
  node's own Blender coordinates; `glow` is the material of its bulb or
  glass (default `linen_white`), `radius` how far from `at` that glass
  reaches (default 0.022), `room: true` puts it on its room's ceiling
  switch (a pendant, a wall light, a track — part of the room's lighting),
  else it gets a switch of its own (a bedside or table lamp).
  - Ladonia's 11 lamp pieces carry them (2026-10-05): in `ladonia.py`, a
    builder returns `_lit(parts, _light(glow_part, W, BULB|LED))` (`BULB`
    #ffcf99, 2700 K; `LED` #ffd6a3, the ceiling fittings'), `_light` sets
    `at` at the glow part's centre and `radius` to its farthest vertex, and
    `export_furniture.py`'s `LD.place_lights(obj, shift)` moves the lights
    with the piece's re-centring. A track has one light per head, each on
    a child node `<id>.lightN` (one summed light would need a 1.9 m bulb).
  - Give every lamp's glow material a name only that piece uses (`_glow`
    renames a copy): a publish numbers a second model's same-named
    material `name#1`, and the bake matches bulbs by exact name. Wrenfield's
    lamps (`furnish.py`'s `_lamp`) still use `linen_white`.
  - Model shades open at the light's end; keep bulbs and glass vertex-lit.
    `part_bulbs` takes a glow face only if all its vertices are within
    `radius` + 1.2 cm of a light — a long diffuser needs a long radius, and
    the live view caps a lamp light's offset below `at` at 5 cm
    (LampPool) so a wall light's light doesn't land in the headboard.
- **Lights switched live** (2026-10-05) — the editor, `?live`, and a
  version published unbaked (the publish panel's preset "Lit live — as in
  the editor", `PUBLISH_PRESETS`): the switches are the bake's
  (`Fittings.gatherLights`, one per room's ceiling light plus one per lamp
  of its own), turned with the HUD's lights panel, the editor's bulb button
  or **L**, and Ctrl/⌘-click on a light or its wall switch (in sight only —
  walls stop it — and only on what the editor shows). A visitor's switching
  is never saved. In the editor the *light* of it is the realistic
  preview's: under the plain light (edit mode always, the walkthrough until
  the preview is on — the section above) a switch is a state, shown in its
  fitting's glass, and LampPool and RoomGlow are first made when the
  preview first draws. The pieces:
  - `LiveSwitches.js`: the state, per day and night as a baked view's — at
    night the rooms' ceiling switches on and lamps of their own off; by day
    all off, or the ceiling switches on in a space without a sky
    (`dayOn`, so Wrenfield and Ashgrove look as they did with their old
    always-on fill lights, which the live lights replace).
  - `LampPool.js`: a fixed pool of live lights — changing how many lights a
    scene has recompiles every material in three r163 — of
    `QUALITY.lamps` (device.js: SpotLights shining down, with a shadow (one
    pass each) or without; step 0: 0+2, step 4: 2+4 with 1024 maps), given
    to the lit fittings nearest the visitor by power/(1+d²): in a room, its
    own and those its doors open onto; outside, within 14 m and over the
    visitor's feet. Every one shines down: point lights hung under track
    heads and downlights burned the ceilings white (16 thousand saturated
    pixels in A1's living room); the room's glow lights the ceiling. A
    lamp's light stands 0.12 m off its room's walls; a wall light's tube
    (glass over 0.1 m long, by a wall) gets its light 0.25 m off the wall,
    from the tube's height, at a third of its power (a point under it put a
    hot patch on the headboard below). A woven shade, which a light shining
    down leaves dark, glows softly from within as its switch is
    (`userData.glow = "shade:<switch>"`, LiveBulbs; the bake takes it as a
    surface). In edit mode, drawn plain, there is no pool light to see (its
    aim there, `editor.view.target`, is reached only while a publish holds
    the scene realistic). Fades 0.25 s; shadows
    redrawn when something moves more than a centimetre within 10 m (the
    own avatar included — a visitor standing still settles by millimetres,
    which redrew them every other frame) at most every 0.1 s; slots
    rebound by fitting id after an edit, so nothing blinks.
  - `RoomGlow.js`: every lit room glows (warm, 0.16 of a surface's colour
    by day, 0.4 at night, by the share of its fittings' power that is on)
    from a map of the plan in the shader (room ids, 5 cm texels, up to four
    rooms stacked; rooms reach 0.2 m into their outside walls, for the
    window reveals) — far-off rooms read as lit from the garden, where no
    live light reaches. The same map keeps every light without a shadow
    (the pool's, the garden's) where it hangs (`roomGlowReach`): one in a
    room lights only that room and those open to it with no wall between
    (`shared/roomGraph.js` `openPairs`: Ladonia's ten hall/living pairs —
    without them the light stopped in a straight line across the opening),
    one out of doors only what is out of doors; only lights reaching 12 m
    or less (a car's headlamps reach 60 and run on out of a garage). An
    open-plan group also glows as one. `roomLinks` joins open pairs too,
    so the bake's switch zones and the pool's include them.
  - `LiveBulbs.js`: each switch's glass and bulbs (`userData.glow`, tagged
    by `markBulbs`, kept apart by a publish) on their own material copies,
    glowing ×2.2 when on; `Sky.adopt` keeps the copies lit by the sky as
    their originals.
  - The room probe (Realism) is drawn again a face a frame once a switch's
    fades have settled (`sky.lightVersion`; all six at once cost a 100 ms
    frame); a night glow from before the switches started is cleared
    (`Sky.glowIndoors(false)`).
  - Switch names: two buildings of one design have rooms named alike;
    `Fittings.distinguish` tags them from where their room ids differ
    ("A · Upper north flat light"), at publish and — for versions published
    or baked before — at load (World, Switches.js).
  - In a published view the walls and floors are only in the collision
    tree, and its floors have no undersides: sight for pointing at a light
    uses a two-sided ray (`Collision.rayIntersect(ray, { twoSided })`), or
    lights upstairs are switched through the ceiling.
  - Performance (M4 Pro, 1280×720): the pool costs ~0.3–0.5 ms a frame,
    and each lamp shadow redraw ~1.3 ms when it happens; Realism owns the
    sun's `shadow.autoUpdate` too, so a lamp's redraw no longer redraws the
    sun's map.
- **A light that is off is out of the scene, hidden**: a
  light at intensity 0 costs every lit pixel what a lit one does, and three
  builds each lit shader for the *number* of lights there are. So
  `light.visible` is its owner's (the plain light's layers are apart from
  it): LampPool's lights are all in or all out (`lampPool.lit`: in while a
  fitting that holds one of them is on *in sight*, out 3 s of the world's
  own time after the last — `LampPool.sees`: in the visitor's own room; in
  a room that opens into it, through what joins the two as it stands (a
  doorway, a stairwell, no wall, a glazed door, a door not shut); from out
  of doors, in any room but one daylight does not reach, whose light shows
  only through a door of its own to the outdoors standing open. Which
  fittings are handed the lights is as it was — sight only says whether
  the pool is in — so a night's frames are the same to the pixel. While a
  lit fitting is only near, within 14 m or behind its shut door, the
  shaders for the pool in are built ahead, `LampPool.warm`, and it comes
  in on the frame the door starts to open: ten rounds of door open, walk
  in, walk out, door shut drew 22–27 ms frames at each coming in, but for
  a frame of 39–92 ms at the first one or two of a page; a pass of `warm`
  that finds everything built is 2–4 ms), a car's beam is
  in only while its headlamps are on (`CarLights.showBeam`), and of a
  site's garden lights only `QUALITY.garden` shine (`{ spots, points }`:
  0+1, 0+1, 1+1, 2+2, 3+2 by step), the nearest the visitor, one handed on
  for another at nothing with a 0.35 s fade (`GardenLights.places`), always
  the same number. Ladonia unbaked at step 4, M4 Pro, as this was built
  (2026-10-11): by day 25–40 ms → 17–25 (six pool lights and three beams
  out); at night 49–73 → 24–36 (16 garden lights → 5). In the final
  sitting, against the committed code: at night ×1.6–2.4 at every step
  (step 4: living room 46.9 → 23.0, pool 69.4 → 33.1), by day ×1.1–1.5
  (24.8 → 21.0, 37.0 → 31.6, 29.3 → 25.5) — by day 3–7 ms slower than as
  it was built: the rooms without daylight had since started lit (below),
  and a lit bathroom behind its shut door, or within 14 m of a terrace,
  kept the pool in — by the pool's edge always; in the living room and
  the street only because the timing kit holds the world's clock still
  and the pool takes 3 s of it to leave (each pose held 4 s first, that
  build read 18.4 and 22.9 there, and 34.2 by the pool). With the pool in
  only for a fitting in sight (2026-10-12, a busier sitting: the committed
  code read 2–4 ms over its figures above): by day 26.6 → 18.9, 40.4 →
  26.7, 33.3 → 23.4 against the committed code and 22.3 → 18.6, 35.7 →
  26.3, 28.9 → 23.1 against the build before; the editor's preview 36.6 →
  23.1, 60.3 → 39.6, 55.1 → 36.7 and 28.4 → 23.1, 48.5 → 39.7, 44.0 →
  36.8.
  - Coming in for the first time, a light waits for
    `renderer.prepareLights([lights])` (the app's Renderer): the lit
    materials of what is drawn are compiled for the scene *with* them (12
    objects at a time, 4 ms a turn of the event loop), polled until
    linked, asked for their uniforms (three's first-use cost) and, under
    post-processing, drawn once into a 4 × 4 picture of the post's own
    formats (`drawAhead`: on a Mac the GPU makes a program's pipeline at
    its first draw) — the lights shown only inside each call, never for a
    frame. It spreads the work; it does not remove it. A never-built set
    (Ladonia's street, 65 programs, M4 Pro): unprepared, one frame of
    6.7 s; prepared, 3.5 s of frames, the worst 0.47 s, and 0.36 s for the
    first frame with the light in. Chrome keeps built shaders on disk: on
    a later load the same entry's worst frame was 72 ms. A state seen
    before in the page is found again at once (programs steady over ten
    day/night round trips and ten lamp on/off round trips), and what was
    built ahead for it is remembered (`Renderer.builtFor`: by the count of
    lights of each kind, post or screen, the shadow filter, the fog and
    the scene's environment; each object by its materials' ids and
    versions; forgotten when the slider moves): the pool coming back was
    lit 19 frames after the first return to a state and 4 after each later
    one (Ladonia unbaked, night, driven). Under the editor's plain light
    nothing is built (the lights are on no layer). So in a test,
    a frame taken right after a night toggle or a switch has no lamp light
    yet: wait for `!world.lampPool.entering && world.lampPool.settled`.
    To time a first build honestly, make a variant the browser has never
    seen (add one, two, three… hidden point lights and prepare those).
  - Never call `renderer.compile(scene, camera)` on the whole scene for
    this: it builds a new program for every *unlit* material too (a baked
    house's 2,000 MeshBasic), which three itself never rebuilds on a
    change of lights. `prepareLights` hands `compile` only what takes
    light, through a stand-in for the scene.
- **By day the rooms daylight does not reach start with their ceiling
  light on** (`shared/daylight.js` `darkRooms(spec)`; `Switches.startsOn`,
  `LiveSwitches.startsOn`). Windowless rooms (bathrooms, closets) bake
  black by day — their lamps are switches — and with every light off, as a
  day used to start, they were black to walk into and black patches from
  above. A room is dark where none of its walls has a window, a glazed door
  or an open doorway to the outdoors, it is not one space with a room that
  has (`openPairs`), and it does not look into one through a doorway or
  glass. Ladonia 20 rooms (nine bathrooms, four guest WCs, four utility
  rooms, two lobbies, C's first-floor landing), Wrenfield 4 (utility,
  dressing, loft, loft shower room), Ashgrove 2. Told from the spec, not
  the bake: the probes are measured with every door open, three to a WC
  (Ladonia's WCs read 0.02, as its bedrooms do; the rooms picked read
  0.0001–0.025, the garden 0.26–0.40), and a view drawn "static" or
  unbaked has none.
  - In a view lit live only while `daylight` is on (`World.daylit`): a
    public view, the editor's realistic preview; not its plain light, nor
    while a publish holds the scene, which takes the fittings' glass unlit
    as it always did. LiveSwitches' `states` hold only what was turned by
    hand (`Map<id, boolean>`): the rest follow `startsOn`.
  - From above, the floor's gain goes by its rooms' *daylight alone*
    (`LightMeter.roomDaylight`: the variant's own probes' light, no
    switch's in it) and leaves the rooms without daylight out
    (`LightMeter.above`): Ladonia ×17.4, ×17.9, ×24.4 by floor and
    Wrenfield's first floor ×18.2, lamps on or off; only a floor of nothing
    but rooms without daylight goes by its lamps (Wrenfield's attic: ×32
    off, ×1 on). The lit rooms do not burn out (no pixel at white at steps
    4 and 1).
  - A lamp's light still reaches the rooms its door opens onto (Wrenfield's
    landing takes the loft's through the stairwell; one first-floor window
    seen from the street is 0.035% of a frame brighter). A frame of a
    default day visit was otherwise the same to the pixel as before
    (Ladonia living room, pool; Wrenfield living room, garden).
  - Rooms the rule leaves unlit although the bake has them dim: those whose
    windows have blinds down (Ladonia's twin bedrooms read 0.003–0.006
    with a window), two bathrooms with a window, C's stair lobbies and its
    halls open to their living rooms, two entry closets (0.003–0.02). They
    have daylight on paper, start unlit and are left to the meter.
  - What it costs (2026-10-12): nothing where such a room is out of sight.
    A baked view's first light is drawn as soon as its lightmap is here:
    it waits only for the switches whose light is seen from where the
    visitor starts (`Switches.prepare`'s `from`, `Switches.seen`: one that
    reaches a room they are in or look into, or any room with daylight —
    Wrenfield's loft, for the landing's window from the street) and not
    for the sun's mask, which is set when it has loaded; the others'
    layers are asked for once that frame is drawn, the nearest rooms'
    first, and drawn as they land (`Switches.bringIn`). Ladonia's default
    day visit, localhost, seven loads a build in one sitting on a busy
    machine: 92–95 files asked for by the first lit frame where the build
    before asked for 178–180, and that frame 3.55–3.78 s after navigation
    where it was at 4.08–4.42 (the world built at 2.95–3.23 s in both);
    the frame after it at 3.97–4.25 s — the garden's trees are built in
    between — and the twenty rooms' light in at 4.16–4.46 s. Not measured
    over a network. The start view is the same to the pixel with and
    without the switches that come later (Ladonia from its street, from
    inside a windowless bathroom and from the hall outside it; Wrenfield
    from its loft and its landing; from Wrenfield's front path 17 of
    921,600 pixels by up to 5 levels). In a view lit live — unbaked, the
    editor's preview — the pool's lights are in the scene's light only
    while such a room's lamp is in sight ("A light that is off", above).
    What that gives up: by day, from the hall outside a lit bathroom's
    shut door, the strip of threshold under the door is no longer lit by
    the lamp behind it (44,763 of 3.7 million pixels of a frame looking
    down at the foot of the door, the most 54 levels; no other frame
    differs, day or night).
- Light units, matched to the bake: a Blender sun of strength S is a
  DirectionalLight of intensity S; a W-watt point lamp is W/(4π).

## People

Animated people set round a property (Ladonia, 2026-10-05/09): standing
groups with drinks, people on sofas and chairs, people lying on pool
loungers — the spec's `people`, drawn by
`frontend/Experience/World/People.js`. The method is SKILL.md §4b; every
field, constant and script is in `reference.md`, People. Read People.js's
class comment and `shared/people.js`'s header before touching either.

- **What they are made of.** One GLB a character, cloned per person with
  one skeleton for all its meshes (GLTFLoader gives each skinned mesh its
  own; `sharedSkeletons` took twelve people from 72 bone textures to
  12); one `clips.glb` for everyone, each clip fitted to each body: its
  rotations kept, its hips' movement scaled by `character.hips /
  clips.hips`. Without `index.json` the app uses the stand-ins
  (`index.standin.json`: its own two avatars with a made-up sitting and
  lying pose), which prove the plumbing and nothing about how real clips
  sit, lie or hold. Each person starts its clip at a point and a speed of
  its own (`seed`). A clip of one frame (four of Ladonia's 17) breathes:
  the chest turned 1.1° back and forth at about 0.25 Hz, the top of the
  spine against it (and with the chest whatever hangs from it: hands
  under a head move a centimetre).
- **Placing.** Rotation 0 faces north, as furniture; a rig faces +z and
  is turned half round. Standing: the lowest the soles come in the clip
  (12 samples) on the floor, not the rig's root. Sitting and lying: the
  clip's seat on the entry's position, as low as the body's own skin
  under the pelvis. A sitter is then lifted, 1.5 cm at most, or on a
  sofa let down, 3 cm at most counting what the planner gave, until the
  soles are on the floor (`liftFor`).
- **Lying on a raised back** (seats.json's `incline` over 5°): the spine
  is turned up about the hinge on the surface, where the lounger's back
  starts to rise, by as much as lays the body's own back skin on it (on
  Ladonia's 35° lounger 16–33°, measured on three bodies: less for a
  clip that lies with its shoulders up), the spine's position corrected
  for the turn. The neck is let back, 35° at most, when the head would
  be over 3 cm off, unless the hands are under it. Arms lying out past
  the cushion's `width` are brought in to rest on it by three turns:
  upper arm, forearm, hand. A clip propped up of itself is left as it
  is.
- **Holding.** A prop goes in the hand the clip's `hand` names; a clip
  with `hand: false` holds nothing. Its grip point is put where the
  fingers close, measured on the hand itself (`GRIPS`), or in the crook
  of the thumb of a hand that opens in its clip (`curl` under 45°).
  Every held drink is stood upright after each mixer update (`upright`):
  16° off at most, whatever the hand does, its grip where it was. Within
  reach of the mouth it is tipped at the lips: a bottle as far as the
  clip lifts it, 130° at most, and let down through the hand until its
  mouth stops 4 mm short of the lips; a glass or a cup 65° at most. A
  clip that drinks is given the beer bottle when it is built, whatever
  drink its entry names (the entry keeps its own). Sunglasses hang at
  the character's `eyes`; a towel or an open book lies past the feet of
  someone lying; a prop with no grip is left off anyone else.
- **Cap and cull.** `QUALITY.people` by slider step (reference.md): at
  most `most` are drawn, the first of the spec's list, whole groups at a
  time — except in the editor's edit mode, which draws all. A public
  view builds, and so downloads, only those its step draws, and the rest
  when the step rises: at step 0 four people fetched 3.4 MB with clips
  and props, against 11.7 MB for all twelve (as the server sends them,
  compressed; the files are 4.6 and 14.0 MB). Each is culled by a fixed
  sphere round its pose (a skinned mesh's own bounds are its rest
  pose's), animated every frame near the camera, every few beyond, and
  not at all out of sight or past `still`.
- **Collision.** Each person drawn is a box in `collision.people`, a
  fourth tree: the walker goes round someone standing and round a seated
  person's legs. Rays pass it (the camera's boom, pointing at a light).
  Hidden or filtered people have no box.
- **Light.** Lit as the furniture is. Each character's materials are
  copied in two sets, out of doors (the whole sky) and indoors (`INDOOR`,
  and RoomGlow with the room's switch), chosen by the room under the
  person's spot; they cast and take shadows. In a baked view they take
  the bake's probes at the middle of each pose (ProbeLight), and the
  lamp and sun shadows are drawn again when a person appears, goes or is
  hidden, not as it breathes.
- **The editor** (`PersonEditable` in Editor/Editables.js; Editor.js):
  - Select, move, turn, duplicate and delete as a piece of furniture; no
    scaling. Picking is by capsules round the bones: a ray against the
    skinned meshes cost 8.6 ms a person, every frame of the
    walkthrough's aim.
  - Someone standing rests on the floor and must fit, but is never
    pulled flush to a wall. Someone sitting or lying, dragged, goes to
    the free seat or lounger nearest the pointer within 1.5 m, or stays;
    moved with Shift they go anywhere, and keep their seat within 0.6 m
    of it.
  - Add → People: standing (on the nearest clear floor, facing and
    joining a group within 2.5 m), sitting on the nearest free seat,
    lying on the nearest free lounger; a toast when there is none within
    12 m.
  - The panel: Character, Pose, Animation, Holding; under "Everyone",
    How many and "Re-roll everyone" (also Object → Re-roll people). A
    re-roll plans everyone afresh with a random seed and replaces a
    vetted plan: one undo brings it back.
  - Moving or turning a piece carries the people on it; deleting it
    deletes them (one undo restores both); scaling it does not re-seat
    them.
  - Undo and redo cover people. The outliner's People collection lists
    them by room; its eye hides them all. Hide through
    `people.setFilter`, never `group.visible`.
  - The editor hands the planner the whole of the index's `clips`
    (`castOf`); given only its list, nothing was scaled to the
    character, and re-rolled sitters needed 2.6–3.0 cm of lift.
- **Publishing.** People are a piece of scenery (`shared/scenery.js`):
  - Left out of a version by the Publish panel's Scenery boxes
    (`leaveOut` empties `people`), or hidden by a visitor with the
    People toggle, which their browser remembers. Hidden on load,
    nothing of them is downloaded until they are shown.
  - They travel only as the published `spec.json`'s list: never in
    snapshot.glb, view.glb or runtime.glb, never in the visibility
    sampling, never in a bake. So after placing or changing them,
    publish again; no bake is needed for them.
  - In the bird's-eye view, people on floors above the one shown are
    hidden.
  - Remembered options: `publishOptions` keeps the pieces there were to
    choose from beside the pieces chosen (`sceneryKnown`). Before it
    did, options a browser remembered from before there were people
    came back with People unticked, and a publish silently dropped
    everyone (the rule: SKILL.md §13).
- **The validator** keeps `people` (reference.md). A server started
  before that code drops the key on its next save: restart the test
  server, and tell the user to restart `npm start`.
- **What the conversion mends** in Mixamo's downloads
  (`blender/import_people.py`): numbered bone prefixes (`mixamorig12:`);
  a character at twice life size (remy, 3.78 m); lying clips with their
  heads any way round and sitting clips facing backwards or sideways,
  all turned to +Z; a clip that walks in before it sits ("Sitting
  Drinking": 2.7 m), cut to its settled part; see-through hair and
  bodies, a gloss map read as roughness, a specular map; textures cut to
  1024 px (normal maps 512).
- **Why it is built this way** (what the real clips showed; the stand-ins
  showed none of it):
  - A hanging or gesturing hand tips a glass 60–110°, and only the
    drinking clips were recorded holding anything. So the runtime stands
    every drink upright, the conversion measures which hand can hold
    (`hand`, `tilt`, `curl`), and the planner gives drinks only to those.
    Mixamo's "Drinking" drinks from a bottle, the left hand lifted over
    the mouth: a glass there went into the face, hence the bottle.
  - Scaling a sitting clip to a body by its hips' height was up to 6 cm
    out. So the conversion measures every sitting clip on every body
    (`sits`), and the runtime rests each body on its own skin.
  - A loose pillow is not the seat: the lounge chairs measured 0.577 m
    until `measure-seats.mjs` took the pillow for part of the back
    (0.371).
  - A lying clip lies with its shoulders up by an angle of its own. So
    each body is bent by what its own back needs, about the hinge, not
    by the lounger's incline.
- **Cost**, as the first fix round's verifier measured it (M4 Pro, public
  view, hidden pane, so approximate — the runtime's builder had a third
  of it; the rules are SKILL.md §12). At step 4 (2048 × 1536) nine in
  view added 66 draw calls, 438 thousand triangles and 2.5–4.5 ms a
  frame; a group seen from 3 m, 21 calls and 2.1–2.5 ms. At step 0
  (1024 × 768) four drawn added 27 calls and 0.6–3.2 ms. `tick` itself
  is 0.05 ms at step 4 and 0.02 at step 0.
- **Still short** (2026-10-10):
  - Lying legs hover: calves 3–8 cm and heels up to 11 cm over the
    cushion on every lounger (Ladonia's plan: heels 4–9 cm). The pelvis
    rests and the clips lie with their heels higher; the thighs want
    turning down about the hips, as `armsFor` turns the arms.
  - Some heads miss the headrest: in "Laying Idle" brian 7–8 cm, josh
    and lewis 4–5; in "Laying Hands Behind Head" brian 7 and lewis 5–6,
    and megan's bun sinks 6 cm into the cushion. Ladonia's plan avoids
    these pairings by hand.
  - "Sitting Reclining Female" puts an arm through a chair's rail or a
    sofa's back cushion wherever it sits (9 of 9): left out of planning
    (`LEFT_OUT`), still offered in the editor's Animation list.
  - Seated calves: 7 of 43 planned sitters had calf skin 1.4–2.3 cm in
    the seat's front edge. Corner sofas: a foot can go 4.5 cm into the
    other wing (`LEG_ROOM_TAKEN` in measure-seats.mjs).
  - Lounge chairs (`ld-out-lounge`): their slats count as soft, so a
    sitter can sink 2–4 cm into them; the loose pillow is 7–9 cm into
    every sitter's lower back; two of Ladonia's sixteen get no one (a
    round table stands 0.3 m before the seat).
  - "Sitting Drinking" brings the bottle 4 cm under the skin of the
    face on kate, sophie and megan; "Laying Hands Behind Head" leaves
    the elbows past the cushion's edge. A hand that opens as it
    gestures ("Talking") keeps its glass in the palm without gripping
    it.
  - Most sitters play "Sitting Idle" (49 of 71 over 20 seeds): the
    livelier clips tuck their feet, which a sofa's solid base is in the
    way of.
  - A baked view has no probes on roof terraces (rooms 0.05 m tall;
    outdoor probes stop 3 m above the lowest floor): people there keep
    the scene's light. On phones a person's sun shadow keeps one pose
    until something moves.
  - No swimwear: Mixamo has none, so those on the loungers wear street
    clothes. shannon, by Ladonia's pool, is in a football strip.
  - Unchecked when the plan was written: the last four fixes (the
    pool's coping and planter grasses as obstacles, the bottle for any
    drink on a drinking clip, `LEFT_OUT`). `checks/people-plans.mjs`
    passes all of it over 20 seeds. The user then moved two people in
    the editor (brian, remy on C5's roof — their edits, to keep).
    `people-audit.js` on the scene as they left it (2026-10-10) flags
    six: the heels and the pillow above, and
    - brian (person-9): his left upper arm 1.8 cm in a roof planter's
      grass. He stands 0.72 m from the planter's box, which `GRASSES`
      (0.25 m out) and `MARGIN` allow: Ladonia's grasses reach further.
      At the checker's spot, `[11.14, 5.4, -20.04]`, the roof group
      audits clean (tried with `patch`; not written);
    - kate (person-3), "Laying Hands Behind Head": the right hand under
      her head 3–5 cm into the cushion as she breathes in.

## Furniture: the catalogue, its height and its collision

- `public/models/furniture/catalog.json` is written by
  `blender/export_furniture.py` (`npm run furniture`). The app reads each
  item's `id` and `url`, and these fields:
  - `name`, the editor's label, and `category`;
  - `size`, [w, h, d] as it faces north, which furnish.js places by;
  - `scale` and `yaw`: FurnitureLibrary multiplies a placement's scale
    by `scale` and turns the model by `yaw`;
  - `enabled`: `false` drops the item on load;
  - `anchor` and `collision`, below.

  Register a piece in `PIECES` as `(id, label, category, build[, anchor][,
  {fields}])`. A trailing string is the anchor (`floor` by default). A
  dict is merged into the entry as it stands, e.g. `{"collision": "mesh"}`.
  `npm run furniture -- <prefix>` rebuilds the ids that start with a
  prefix, and any id not yet in the catalogue. It keeps every other entry
  as it was.
- The exporter centres each piece on its footprint and stands its lowest
  point on y = 0, whatever height it was modelled at: the double vanity is
  built from z 0.40 and its GLB starts at 0. A placement's y is where that
  lowest point goes, so a floating piece carries its lift in y:
  - joinery's `vanity` and `vanity-small`: +0.34;
  - Ladonia's walnut drawers: +0.28; its double vanity: +0.40;
  - headboards: +0.55; the wall light: +1.165;
  - TVs: +0.8 to +0.95; art: +1.0;
  - a ceiling piece: `top − height` (furnish.js `hang`).

  Name the lift in the catalogue label ("hang at y 0.28"). The anchor
  changes none of this; it matters only in the editor. `wall` and `ceiling`
  pieces get no gravity. A newly added `wall` piece starts 1.4 m up and a
  `ceiling` one with its top at 2.7 m. A floating `floor` piece keeps its
  height when dragged level, because gravity holds only a piece that starts
  within 3 cm of a support. "Drop to surface" does put it on the floor.
  The checkers sort pieces by anchor, so don't change an anchor to avoid
  that.
- How a piece collides is decided by `SceneBuilder.collisionOf` — for the
  tree the visitor walks against (`dynamicCollisionSources`, "Rays and the
  collision trees") and, by `dynamicCollisionRoots`, for a publish's
  runtime file:
  - pieces flatter than `FLAT_HEIGHT` (3.5 cm: rugs) and `collision:
    "none"` are left out;
  - a piece collides as its own triangles up to `MESH_COLLISION_BUDGET`
    (12000, counted over the loaded model);
  - over the budget, or with any part that opens (`userData.opens`), it
    collides as its local bounding box, turned with it;
  - the catalogue's `collision: "mesh"` or `"box"` forces either.

  A box covers floor the piece doesn't. The inside of an L-shaped sofa,
  where the plans put the coffee table, became a wall the walker couldn't
  pass. Ladonia's chaise and corner sofas have 14–21k triangles with their
  cushions, so all of them carry `"mesh"`. Its beds (14–24k since the
  2026-10-03/04 pillows: the doubles 19.5–24k, the singles 14–15.5k)
  collide as boxes. That works because the
  headboard is a separate wall piece, so a bed's box is only the bed.
  `checks/_modes.mjs <id> …` prints each piece's count and mode. Never
  force `"mesh"` on a piece with opening parts: those are skipped as
  transient, and the walker goes through its doors into the hollow
  carcass. Fitted pieces exported shut (`_fixed`) have none. After a
  catalogue change, build again (the catalogue is copied into the build:
  SKILL.md §0 for where a test server's build goes) and restart the test
  server.

## Doors

- A hinged leaf opens to 0.52π (93.6°), eased, about the jamb its swing
  names (`Door.update`). A sliding or pocket leaf slides its width less
  4 cm towards that jamb, and stands 6 cm out on side A. Which jamb and
  which side each swing name means: `reference.md` (kit.js, Swing).
- Leaves are never in the collision octrees (`isTransient`).
  - While a door's `open` is under 0.3 (`BLOCKING_THRESHOLD`; about 48° of
    swing, since the swing is eased), each leaf is an oriented box (its
    width less 1 cm, its height less 2 cm, 4 cm thick).
    `SceneBuilder.resolveDoorCollisions` pushes the walker out of it every
    frame (`Door.resolveCapsule`, an upright cylinder against the box in
    the box's frame).
  - Past that, a leaf collides with nothing. The walker passes through it,
    and it passes through furniture.

  So a leaf that sweeps into furniture is a fault you see, not one that
  blocks the way. Audit it fully open (In-page audits, t = 1), not at 90°.
  At 93.6° the tip of a 0.9 m leaf ends about 6 cm back past the line of
  the hinge jamb (0.9 · sin 3.6°). A piece against the wall beside that
  jamb must stand that much clear of it, plus 2 cm for half the leaf's
  thickness, or the open leaf cuts into it. Ladonia's final review re-hung
  or moved several doors for this.

## Finishes and their texture generators

- The canvas generators in `World/Builders/TextureLibrary.js`
  (`GENERATORS`: `planks`, `herringbone`, `plaster`, `terrazzo`, …) draw
  every generated finish in `shared/catalog.js`, for every space. A change
  to a generator or to its defaults redraws every finish that uses it.
  Instead, add a param that defaults to the old drawing and set it only
  on your own finish, as Ladonia added `planks`' `vertical` (boards on
  end, `oak_cladding`) and `cover`, and `plaster`'s `soft`. Then compare
  another space's frames before and after (SKILL.md §10).
- `planks` lays two boards a row, each row shifted by `stagger` × its row
  number of the tile's width (wrapped). Where the shift passes a board's
  length, half the tile (as some rows do at 0.37), the start of the row is
  left bare and the gap colour shows there as a dark block. `cover: true`
  lays one more board there. It is set on `oak_honey` only, so
  `oak_parquet`, also at 0.37, is drawn as before.
- Every generator must tile. Anything drawn within reach of an edge is
  drawn again across it (terrazzo's `wraps`, for its mottle and every
  chip), or a seam of cut-off chips shows at every repeat. The Blender
  bake generators tile by indexing pixels modulo the image size
  (`lib/bake.py`), with any period a divisor of 512.

## Publishing and the public view

- `/view/<id>` shows the latest *published* version, not the scene being
  edited. See current work with `/view/<id>?live` or `/?scene=<id>` (an
  editor tab: plain light and the houses alone until asked, above);
  `?version=<v>` opens one publish. The link's other words — `?lighting=`,
  `?quality=`, `?uncapped`, `?rated=`, `?guard=`, `?stats`, and the
  developer's `?lightmap=`, `?merge=`, `?roomlight=`, `?night=` — are
  listed in `reference.md` ("The view: links, stored keys, the slider's
  steps, publish options, the bake's options and the manifest"), with the
  browser's keys a test must remove. Lights,
  switches and garden settings are gathered at publish: after changing
  them, re-publish and re-bake (`npm run build` alone changes nothing
  baked).
- **"The latest" is whatever was published last, baked or not.** A publish
  with its bake off (the preset "Lit live — as in the editor") becomes what
  `/view/<id>` opens, over an earlier baked version. As the user's
  `published/` stood on 2026-10-14: Ladonia's latest is 20261012T114849Z,
  which they published and baked themselves on 2026-10-12 (final: 512
  samples at 4096, 93 switches, 84 doors, 12 people in its spec) — its
  plain link is drawn from the bake; Wrenfield's is still
  20261002T073753Z, unbaked, over the baked 20261001T143211Z — its plain
  link draws lit live, and all that "What a visitor is given" says of a
  baked view needs `?version=20261001T143211Z` there, or the latest baked:
  a new publish with *Bake lighting* on (the panel's default is Final), or
  a bake of the latest as it stands (`npm run bake -- <id>` bakes the
  latest; the panel's *Bake* beside a version bakes that one). Theirs to
  ask for. Read `published/<id>/manifest.json` before saying which a link
  opens.
- Test publishing against a scratch `PUBLISH_DIR`. To look at the user's
  own published bake, start another test server with `PUBLISH_DIR` at the
  repo's `published/` and `BAKE=off`, and only open `/view/<id>` on it —
  never publish from it, and never bake against it: **a bake rewrites a
  published version in place** and deletes that version's earlier `bake-*`
  folders (`scripts/bake-public.mjs`). In a test tab (non-GET requests
  stubbed except /publish, /runtime and /bake):
  `experience.world.emit("publish")`, click `[data-publish]`, poll
  `[data-result]` (~16 s; poll the folder from bash if the 45 s call times
  out). Version folders must be timestamps (`20260926T120555Z`). A copy to
  bake: `published/<id>/manifest.json` and the version folder (without its
  `bake-*` folders) under `<scratch>/pub/<id>/`.
- Publishing drops faces no sampled viewpoint sees: landscape a visitor can
  walk round needs `mesh.userData.keepWhole = true` (HillBuilder,
  NeighbourhoodBuilder and LandscapeBuilder set it). The viewpoints
  (`Publish/viewpoints.js`) stand on every outdoor level a point has —
  a parking slot under a roof terrace as well as the terrace — on the
  terrain's height, and on roof terraces over rooms.
- **A version published unbaked looks as the editor does** (2026-10-05;
  the preset "Lit live — as in the editor": hidden faces removed, merged,
  compressed, plain glass, not baked, quality auto, all the scenery). What
  that took, for anything new a space draws: a material drawn by its own
  shader must take its data with it (the terrain's paint goes as four
  numbers a vertex, written `_PAINT0`/`_PAINT1` pairs and restored by
  name; an older version's terrain is painted on load, `paintTerrain`);
  materials keep `normalScale`, `depthWrite`, `side` and the metals'
  studio reflections (Runtime.js `exportable`); the faces culled that still
  cast a shadow travel in runtime.glb as position-only casters
  (`shadow:<floor>:<kind>:<cell>[:two]`, every face whatever the time of
  day, two-sided materials apart and drawn DoubleSide, in 16 m squares —
  8 m made 133 pieces, ~125 more draw calls a sun's map, for no time
  saved), simplified by the server like the collision (Ladonia 647,612 →
  78,116 triangles; the manifest's `shadowCasters`); a woven shade's
  strands, too fine for the samples, are kept whole from both sides
  (`keepWhole: "both"`, set by `markBulbs`); light glass and bulbs are
  their own meshes tagged with their switch, and the published spec's
  `lights` is gatherLights' list, which the public view switches live
  (an older version without it gathers its own from what it built). A
  version with nothing to switch keeps the old fill lights.
- `findPublished` (`frontend/index.js`) serves every lighting file whose
  name ends `.webp/.png/.jpe?g/.ktx2/.bin` from beside the manifest: a new
  file type must be added to that pattern, or it fetches index.html ("read
  past end").
- Never keep a Texture or a Color in `material.userData`: three's
  `Material.clone` copies userData through JSON, so a clone gets a plain
  object for the texture (`CUBEUV_MAX_MIP NaN` — the glass and metals fail
  to compile) and a number for the colour; and a runtime publish carries
  the JSON in its extras. Sky.js keeps them in WeakMaps (`OWN_ENV`,
  `GLASS_OWN`, `OWN_EMISSIVE`). Tell a stale console error from a new
  one: install `renderer.debug.onShaderError` after load and render, or
  count `renderer.info.programs` with failing `diagnostics` — the pane's
  console keeps the previous load's messages.
- Now and then Chrome's Metal translator fails to link a shader that is
  fine (one load in nine: "no matching function for call to
  'ANGLE_sc2d'"); `Renderer.relinkFailed` rebuilds any failed program's
  materials, twice at most.

## What a visitor is given: lighting modes, ceilings, the frame-rate guard

- **A baked version is drawn from its bake on every device** (`Utils/device.js`
  `lightingMode`): steps 2–4 get "baked" — the bake's
  light, a shadow map of what moves alone (and a site's own trees, which
  the bake has no shade of) taking the sun's share away where it falls,
  what moves lit by the probes, doors dimming rooms — and steps 0–1, phones
  among them, "static": nothing live. `world.lightingMode` says which. The
  whole house lit live is never given and not in the visitor's menu (which
  offers only *Auto* and, where that is not it already, *Fastest*; a stored
  `view-lighting` of "live" or "baked" reads as Auto): only
  `?lighting=live` draws it, to compare, and not on a touch device or at
  steps 0–1. So a frame of a baked view taken without `?lighting=` is the
  "baked" mode on this Mac — say which mode every frame was taken in. The
  publish option's "phones" is what "auto" gives now; kept for old
  versions, no longer offered (`retired` in `shared/publishOptions.js`).
- **Seen in the page on this Mac** (2026-10-12, Wrenfield's baked
  20261001T143211Z on the final build): as it opens, step 4 —
  `world.lightingMode` "baked", the probes and the sun's shade map there,
  the light resolved at 4096, the house merged, the live room offered (the
  lights panel's *Live room* switch, **K**), the menu's lighting *Auto*
  and *Fastest*; with `?quality=0` — "static", no probes, no shade map,
  the light resolved from the 2048 copies, the canvas 1280 × 720, no
  lighting choice in the menu, the live room withheld ("step").
- **What the default costs now** (the final measurement, 2026-10-12: the
  committed code → this, median ms a frame, 1280 × 720 CSS at ratio 2; the
  committed code's default on this Mac was the whole house lit live at
  steps 2–4 and "baked" at 0–1). Ladonia baked, step 4: living room 25.7 →
  12.6 (39 → 79 a second), bedroom 24.9 → 13.1, pool 43.9 → 17.0, street
  41.7 → 16.1; at night 39.4 → 12.8, 44.7 → 13.3, 63.6 → 17.1, 56.6 →
  16.1. Step 2: 19.0 → 7.9, 35.9 → 12.3, 35.3 → 12.2; night pool 47.1 →
  12.1. Step 0: 9.7 → 4.3, 21.9 → 7.6, 22.2 → 7.6. With something moving
  every frame the old view went to 34–67 ms indoors at step 4; this stays
  at 12.7–14.1. A 5 s walk indoors at step 4: median 43.4 → 16.3, frames
  over 25 ms 300 of 300 → 0; a 10 s run out of doors: p95 50.6 → 19.0,
  frames over 25 ms 598 of 598 → 1. All 93 lights turned on: 1,108 ms and
  then 57 ms a frame → 176 ms and 13.3. A first night: 1.9–2.1 s with one
  frame of 813–951 ms → 0.9 s and 391–429 ms. Wrenfield baked: step 4
  living room 7.7 → 4.7, garden 10.3 → 5.7, street 10.5 → 5.9; step 0 4.2
  → 2.3, 7.0 → 4.1. Unbaked (Ladonia, 12 people): at night ×1.6–2.4 at
  every step (step 4: living room 46.9 → 23.0, pool 69.4 → 33.1); by day
  ×1.1–1.5 (24.8 → 21.0, 37.0 → 31.6, 29.3 → 25.5). **No phone, no touch
  device and no integrated or slow GPU was measured**: what a rated-low
  device is given was only seen through `?rated=` and `?quality=` here.
- The whole house lit live (`?lighting=live`) is what the committed code
  gave a computer by default — the old figures above at steps 2–4 are that
  mode. On this build it is a link's alone, and is neither resolved nor
  merged (Ladonia: 3,952 meshes): 25–49 ms a frame by day and 58–97 at
  night when something moves (step 4, 2026-10-10). Door leaves aren't in
  the bake.
- **Ceilings on what a device is asked for**: `stepCeiling()`
  is the device's rated step (`deviceDefaultStep`: touch 1, software 0,
  integrated 2, other Apple and discrete 3, Apple Pro/Max/Ultra and RTX 4)
  and nothing goes above it — the slider's `max`, `?quality=`, a stored
  `render-quality` (brought down and rewritten at load), a version's
  "Always high". `?uncapped` in the link lifts it (not on touch);
  `?rated=0…4` pretends a lower rating, never a higher one — the way to
  test what a weaker device is given on this Mac
  (`?rated=1&lighting=live` opens static); it leaves a stored step as it
  is. Each step has a pixel budget too
  (`QUALITY.pixels`: 2.1, 2.1, 3.7, 5, 5 million; `Utils/Sizes.js` lowers
  the pixel ratio to meet it — nothing changes at 1280 × 720, where the
  steps' own ratios already fit; a 2560 × 1440 window at step 4 draws at
  1.165, not 2). A WebGL context lost in a **public view that is on show**
  (`document.visibilityState === "visible"`) writes `render-quality` 0,
  `view-lighting` "static" and `view-lost-graphics` 1; the next visit opens
  at step 0, static, and shows `#view-notice` once (public views only).
  Lost in the editor, or in a tab not on show — an agent's hidden pane is
  one —, it writes only `render-quality`, one step lower (a
  browser drops the contexts of background tabs and of the oldest of many).
  When the context comes back a public view reloads itself (its bake's
  bitmaps were closed after upload, so three could not restore it), at most
  once a minute a tab (`sessionStorage["view-reloaded-at"]`). To test the
  first: `Object.defineProperty(document, "visibilityState", { get: () =>
  "visible", configurable: true })`, then `WEBGL_lose_context` on the app's
  canvas; remove all four keys after.
- **A public view watches its own frame rate** (`Experience/FrameGuard.js`,
  `experience.guard`; decisions in `shared/frameGuard.js`, tested by `node
  scripts/test-frame-guard.mjs`). Slow = a frame over 36 ms; two seconds'
  worth (a `slow` bucket: a slow frame adds its time, at most 250 ms; any
  other takes twice its time off) and it takes one thing: the resolution
  (`sizes.scale` 0.85, 0.72, 0.6 — `Sizes.handleSizes` multiplies the step's
  ratio and budget by it), then `roomLight.end()`, then `setQualityStep(step
  − 1, { persist: false })` down to 0. Fast = 22 ms or less; thirty seconds'
  worth (a frame that is not fast takes nine times its time off) and it
  gives the last back: a step first, the resolution after. Never the room's
  light, never above `state.chosen`. A change up undone within 30 s doubles
  the next wait (to 480 s). `guard.chose(step)` — called by the slider's
  handler before `setQualityStep` — makes the step the visitor's, gives the
  resolution back with a step raised, and holds everything for 30 s (60,
  120… when they put back a step it took).
  - **A room lit, not a room asked for**: `guardRoomLight(state, lit,
    asked)` — `lit` is `Boolean(roomLight.plan)`, what `room-light-off`
    ends; `asked` is `roomLight.wanted`, which only earns the half minute
    of grace when it goes on. Out of doors or from above with K on there
    is nothing to end (it used to spend three seconds on it, say so, and
    leave the visitor to press K again indoors).
  - **Each thing taken is judged by what it gave** (`trial`, `gain` 0.1,
    `blind` 2, `rest` 120 s): the pace (frame time, smoothed over a second)
    before a rung against the pace when the view is next found slow. A
    tenth faster and the rung is proven; if not, one more of the same kind
    is taken unjudged (frames come in whole refreshes: 35.5 ms and 48 ms
    are both shown as 50), and if the two gave nothing both are given back
    (`resolution-back`, `step-back`) and that kind rests two minutes, then
    four, eight. With nothing left that helps: `stuck`, once, unsaid. A
    view slow on the processor (a 30 ms busy loop a frame) used to end at
    Fastest and 0.6 of its resolution, as slow as before; now two rungs
    and two steps are tried over 25 s and it is left as its visitor set
    it, with "Drawing it lighter did not make this view faster, so it is
    back at …" said for the step.
  - **The resolution taken in a view's first half minute comes back on
    trial** (`early`): six slow seconds as the trees arrive took two rungs
    that a view holding thirty a second (never "fast") kept for the whole
    visit. Those rungs are given back one at a time after 30 s not slow;
    if one does not hold, the rest stay, by the usual rule. A view really
    too heavy pays one raise and one drop, 30 s in. Not the step.
    `toggleLighting()` calls `guard.settle()` before the sky changes.
  - **What the guard's step fetches is what the page was opened for**:
    `lightmapURL`, `chromaURL`, `sunMaskURL` and `doorStatesURL` pick the
    phone copies by `LOADED_LOW_POWER`, not the live `LOW_POWER` — a first
    night or a first switch while the guard held the view at step 1 was
    fetched half-size and kept for the visit. And a context lost in a tab
    not on show stores one under the visitor's own step
    (`guardContextLoss(…, { chosen })`), not under the guard's.
  - **In a test it does nothing by itself**: it judges frames only while
    `document.visibilityState === "visible"`, after `walkthrough-active`,
    and a hidden pane is "hidden" (a tab fronted with `tabs_select` too:
    its own requestAnimationFrame ran at 120 Hz for some twenty seconds
    once and at 1 Hz every other time, never reliably). `guard.feed(ms)`
    takes a made-up frame time and acts on it as on a real one (the view
    really resized, the notices shown); `guard.status()`, `guard.log`,
    `guard.limits` (its own copy: shorten `headroom` to see the way back).
    To run it on real frames, drive them, hold each to a refresh inside
    `experience.update`, and tell the page it is visible
    (`Object.defineProperty(document, "visibilityState", …)`; scratch
    `opt/s4b/tools/pace.js`). Told "visible" while the pane's own frames
    come once a second, it takes a rung every eight seconds, as it should
    of a view that draws one frame a second.
  - `?guard=off` when timing anything by real frames; `?guard=report` for
    its lines in the console. Whatever makes frames long by itself should
    call `experience.guard?.settle()` (the world's "lighting", "bird",
    "switches" and "view" events, a resize, the slider, a jump and the
    scenery do).
  - **The bloom's pictures keep the step's own size** whatever the guard's
    scale (`PostProcessing.sizeBloom`): its blur is so many pixels of them,
    so sized with the frame the glow spread wider at each rung — a night
    room's mean level 83 → 89 at 0.6. (It still differs between steps 2 and
    3, whose own ratios differ: 85.9 against 83.)
  - Measured on the M4 Pro, Ladonia's living room at night, still frame
    best/median: as opened 12.4/12.8; room lit live 13.1/13.3 (2026-10-12:
    the lamps over the bake of that day — the rooms drawn unbaked cost
    more, "Live room light"); resolution
    0.85 11.4/11.7, 0.72 10.1/10.2, 0.6 8.9/9.1; light off 8.5/8.6; step 3
    7.5/7.7; step 2 6.0/6.3; step 1 4.4/4.7; step 0 4.0/4.6. By the pool by
    day 16.3/16.6 → 12.5/12.7 at 0.6 → 8.0/8.2 at step 0. A change of
    resolution: 5–10 ms in the call and the next frame 5–10 ms longer. A
    change of step: one frame of 200–240 ms indoors, 500 out of doors
    (every shader of the new shadow filter), under the Balanced step no
    worse than above it. In a 1:1 crop of a 2560 × 1440 frame 0.85 is not
    told from full, 0.72 softens fine grain and thin edges, 0.6 is plainly
    soft.
  - There is no second frame loop any more: since 2026-10-13
    `experience.update()` called by hand (a test's kick while the app's
    first frame was still to come) drops the frame already asked for and
    asks for the next itself (`Experience.request`). Before, each such
    call started a loop of its own and the guard was handed every frame
    twice. A frame told to it no time after the last is still ignored
    (`FrameGuard.frame`).
  - **Never seen on real frames.** Every run of it was `guard.feed()`, or
    driven frames held to a refresh in a hidden pane, on a Mac that is not
    slow. Its thresholds (36 ms and 22 ms, 2 s and 30 s) are a judgement,
    not tuned on a device that runs slowly; a browser capped at thirty a
    second (a phone's low-power mode) was not tried — by the numbers it is
    left alone. A step it takes is not kept, so a device too slow for its
    rating walks down again at every visit, 20–30 s to the floor. It is
    not told of a door's swing or of walking into another room: it leans
    on the quarter-second cap and its two seconds of patience there (not
    tested with a walk).

## The bird's-eye view

- **The bird's-eye view is drawn from the bake with nothing live**
  (`World.lightFromAbove`, called by `BirdView` as it opens and
  shuts): no shadow pass while it is open in any mode (`Realism.holdShadows`
  sets the sun's `shadow.autoUpdate` off and, unless the map is to be kept,
  its `shadow.matrix` to one that puts every point outside the frustum —
  lit, unsampled, no shader rebuilt; a redraw on leaving puts it back); no
  shadow-only casters for hidden floors; "baked": `sunShade.sunShadowOn` 0;
  `?lighting=live`: the full lightmap in (`World.lightHouse`), the house's
  direct light off (`LIVE_DIRECT`, a uniform in `bakedAmbient`), the lamps
  at 0 and no switch lit live (`LiveLamps.hold`), the sun's whole-house map
  kept as last drawn for what moves; unbaked: the sun unshadowed and no
  lamp given to any fitting (`LampPool.where().above`), RoomGlow as ever.
  Test it with `renderer.shadowMap.render` wrapped to count passes, over
  frames in which a door swings.
  - Its floors are **storeys** (`shared/storeys.js` `planStoreys`): a room
    is on the storey above the highest room indoors it stands over (1.8 m
    or more below it); each published level takes the storey of most of
    its indoor rooms; never lower than a level under it. Ladonia's nine
    levels give Ground floor (levels 0–4), First floor (5, 6), Roof terrace
    (7, 8); one house's are as before. `birdView.floors[i]` has `level`
    (the storey's index — what `setLevel`, `birdView.level` and
    `levelAt(y)` speak in), `levels` (the published level indices),
    `box` (all its rooms, for following), `middle` (its houses', for a
    floor picked from the list), `indoors`. A mesh's `userData.level` is
    still a published level index: `birdView.shows(level, kind, shown)`
    maps it. The lights panels (`Switches`, `LiveSwitches`) list by the
    same storeys: `switches.floorName(level)`.
  - By day the floor shown is exposed as its rooms would be while the
    outside keeps its own exposure: `SceneBuilder.setIndoorGain` (set each
    frame by `Realism.updateBaked` from `LightMeter.above`: the area-weighted
    log-average of the probes' *daylight* in the floor's rooms that daylight
    reaches — no lamp's light in it, the rooms without daylight left out
    ("Lights and fittings", the day-time lights) — brought to `PROBE_KEY`,
    ×1–32; ×12 without probes) multiplies the baked light of every surface
    lit as a room with a ceiling — lightmapped and vertex-lit materials
    built `|in` (`INDOOR_LIFT`) — easing off between 0.5 and 1.0 of a
    sunlit white wall so nothing burns out; ceilings are left out (only
    their tops show from above, baked with the roof off); what the probes
    light is brought up with it (`indoorGainIn`). The adaptation is 1 from
    above. Ladonia at step 4, "baked": gain 17.4, 17.9 and 24.4 by floor
    (read in the page 2026-10-12; 18.5, 18.3 and 25.2 while the rooms
    without daylight still counted); the view over A's ground floor 97 mean
    level — 88 before those rooms started the day lit, 58 before there was
    a gain (the unbaked view's, 102) — no pixel at white. Works without a
    site sky too (Wrenfield: gain 16.7 and 18.2, and for the attic, both of
    whose rooms are without daylight, 1 with their lamps on as a day opens
    and 32 with them off; its ground floor 134 mean level, 87 before there
    was a gain). Door
    leaves and the furniture's doors are brought up with their rooms
    (`ProbeLight`, or `tintDoors` where the probes do not light them).
  - The garden goes by floor (`Flora.showUpTo`): shrubs with an
    `elevation`, the planters' grasses and the roof LED strips are hidden
    under the floor they are on; what stands on the terrain is always the
    lowest floor's.
- Ladonia from above at step 4 (the final measurement: the committed code
  → this, median ms a frame): by day 26.3 / 33.1 / 37.8 → 10.5 / 11.5 /
  13.8 (ground / first / roof), at night 48.9 / 59.7 / 65.1 → 11.2 / 12.2
  / 14.8; with something moving at night 91–110 → 10.6–14.7. Wrenfield
  8.0–12.3 → 3.6–4.4.
- As it was, and still is: a room with no daylight and its light off is
  black from above (a gain cannot add light the bake has none of); the gain
  is one a floor, not a room's — a glazed living room and a one-window
  bedroom get the same lift; in "static" it is a fixed ×12 (no probes are
  loaded there); the garden's lights are not filtered by floor but for the
  roof's LED strips; lit live over a bake from above, the four lamps stay
  in three's light state at intensity 0 (taken out, every lit shader would
  be built again).

## How a baked view is drawn

The "baked" and "static" views of a version with a bake ("What a visitor
is given"). Lit live over its bake (`?lighting=live`) or unbaked, the
first two bullets do not apply: `sceneBuilder.resolver` and
`sceneBuilder.merged` are null there and every mesh is a room's.

- **A baked landscape view is drawn under its sky** (World.setLighting):
  the sky's variant first (`Sky.setVariant`, prefetched with the lightmaps
  — `Sky.prepare` — and caught if it fails), then the bake's light over it
  (`Environment.setVariant`: the bake's sun, exposure `2^view.exposure ×
  Sky.exposure(variant)`, background/fog/hemisphere left to the sky,
  shadows re-fitted). Before, the two raced — whichever finished last set
  the sun, exposure and fog, and a day/night toggle swapped them.
- **The house's baked light is resolved into ONE lightmap**
  (`World/LightResolver.js`, `sceneBuilder.resolver`) in "baked" and
  "static" views of a bake with switches or door states — not
  `?lighting=live`, not unbaked, not a bake without zones or with its colour
  unparted (those draw as before; `sceneBuilder.resolver` is null). A pair
  of render targets the size of the lightmap in use holds `base × doors + Σ
  switches` texel by texel, drawn on the GPU only when something changes (a
  variant, a switch, a layer loaded, a door moving, the doors' atlas
  arriving) and only over the rooms that changed (`resolver.regions`,
  below); `Renderer.render` calls `sceneBuilder.drawLight()` before every
  frame. Every lightmapped material then reads that map with one shader
  (`decodeLightmap(…, resolved)`): no `own` materials by zone (Ladonia 2,242
  materials → 1,064, lightmap shader variants 32 → 5; Wrenfield 320 → 122),
  no limit of switches a room. What is still per fragment: the sun's
  straight light in "baked" mode (below), and the bird's-eye indoor gain
  (materials still split `|in`). `?lightmap=rooms` forces the old per-room
  materials, to compare; a device that fails `LightResolver.usable` (a tiny
  resolve drawn and read back) keeps them by itself — judged by the
  resolver's own program alone and after clearing whatever GL error was
  pending (another shader's failed link, the app's one load in nine, used to
  turn it off for the whole visit); its own shader, failing to link, is
  built once more as another program (`LightResolver.build`). The program
  tried is the one the view will draw with (`coded`: some rooms' parts held
  their own way; `layerCurves`: some switches' layers), its curves among
  what is drawn and read back — it used to try the plain one and leave the
  view to build the other, untried, at its first frame.
  - **The sun's straight light is the fragment's, not the map's** ("baked"
    mode, `RESOLVED_LIGHT`): the map dims all of a room's light by its
    doors, the sun's with the rest, and the fragment gives the sun's share
    back as far as the doors took it and takes it away where what moves
    shades it — `light + sun × (lit − stays)`, the same sum as a room's own
    material makes, the sun read from its mask the same way. For that it
    needs `stays`, how much of each room's light its doors leave: a third
    target beside the two (`resolver.stays`, the shared uniform
    `roomStays`: one byte a texel at the colour's size, no mipmaps, 4 MB at
    4096²; only where `sunShade` and door states both are — "static" has
    none). At first the map kept the sun's light undimmed and the fragment
    only took it away where shaded: what it takes away is read from the
    mask at the view's own level of detail, what the map held was added
    texel by texel, and from a few metres the two no longer cancelled — an
    orange strip of sun at the foot of a shut door (Wrenfield's hall:
    3,425 pixels of a 2560 × 1440 frame, now 2). It is also nearer the
    per-room picture where nothing is shaded: sun patches seen at a slant
    in a room with its doors shut (A1's living room from 0.6 m up: 14,947
    pixels over 8 levels → 3,088, of a 1280 × 720 frame). What is left
    there is one map's: the light is dimmed before it is blended, where a
    room's material blended first.
  - **Each room's part of the map** (`LightResolver.regions(zones, size)`,
    `{ luma, chroma, outer }`): the texels its own faces blend in — the one
    whose middle lies next beyond each edge of its rectangle — and on from
    there as far as halfway to the next room (8 texels at most), the
    brightness and the colour each laid out in its own texels. The bake
    leaves 4 texels between rooms at 4096 (Ladonia; Wrenfield 8), 2 in a
    phone's copy: there one texel of the colour is blended in by both
    rooms, and is the nearer one's. Before, a room's rectangle went out to
    whole texels of the colour and the texels between two rooms to
    whichever came first in the list: 38 of Ladonia's 376 room sides (81 at
    2048) blended in a line of the next room's — its lamp's light. Null
    (and the light is not resolved: `resolvesLight`, which asks at the
    lightmap's size and its phone copy's, and that every room with a layer
    or a door has a rectangle) when two rooms lie too close.
  - It is kept **as the variant's lightmap is encoded** (reinhard, sRGB,
    brightness at full size, colour at half), each value as 16 bits in two
    8-bit channels (RG8 + RGBA8: 64 MB with mipmaps at 4096², 16 MB for a
    phone's 2048²; no float-target extension needed; 15 textures bound at
    most in its own shader). Kept as linear light
    every edge would blend differently from the lightmap it stands for.
    A texel no switch lights and no door dims is the variant's, to the bit.
  - Its scale is the variant's own, except for a variant far darker than
    its lamps (`sceneBuilder.resolvedScale`: under a quarter of the
    switches' middle scale — the nights: Ladonia 0.30 → 1.41, Wrenfield
    0.05 → 3.89): lamp light kept in the night's scale sits squeezed at the
    top of the range, where blending and mipmaps come out a tenth darker
    than in the lamps' own layers. So `material.lightMapIntensity` is
    `π × resolver.scale`, not `π × info.scale`. One scale cannot fit every
    lamp: a lamp brighter than it glows a little less seen from afar (its
    bloom smaller: A2's living room through the window, lamp 2.13 against
    1.41, 4,724 pixels over 8 levels), one fainter a little more. Tried at
    the three-quarter mark (2.07), the nine-tenths (3.02) and the largest
    (11.14) over twelve night views: each mends the views whose lamps are
    near it and spoils the others (the largest: 9.7% of the living room
    over 2 levels); without that window view the middle one is the least
    off. Left at the middle.
  - A texel of the colour is four of the brightness: its colour is each of
    the four's, worked out as its own, weighted by brightness — the colour
    of their average draws a dark tinted line at island edges.
  - More than six switches on in a room (Wrenfield's landing with its doors
    open: ten) are added in turns through a scratch pair. Checked against a
    sum worked out in JS from the files: within 0.004 of a lightmap level.
  - Mipmaps are `generateMipmap`, after each change; while a door swings,
    every 0.1 s (not timed on an integrated GPU). A first night's layers
    come in at most 64 textures a
    frame, the rooms nearest the camera first (`resolver.pending` says how
    much is still to draw — wait for 0 before a still: tools' `F.flush()`).
  - The switch layers are uploaded without mipmaps there (read texel for
    texel); the variants' lightmaps and the sun's mask keep theirs.
  - **Never read a mipmapped texture after a branch on something that
    varies by pixel**: `sunPart` was read after `if ( lit > 0.999 ) return`
    — its level of detail is undefined there, and pixels on the edge of a
    moving thing's shade read the mask's coarsest level (thin dark stepped
    lines on walls, darker dappled shade on the road). It now takes
    `dFdx/dFdy` worked out before the branch (`textureGrad`), in both paths.
- **The baked house is merged across rooms** (`World/HouseMerger.js`, called
  at the end of `SceneBuilder.usePublishedView`) in "baked" and "static"
  views — not `?lighting=live`, not unbaked (`sceneBuilder.merged` is null
  there, and every mesh is a room's as before). The bake's meshes that draw
  alike become one: the same material, lit the same way (lightmap or
  vertices), the same `level` and `kind` (what `BirdView.showFloor` shows
  and hides by), the same square of the site. Ladonia: 3,952 meshes → 670, a
  frame out of doors 29–30 ms → 16–17 at step 4 and 19–24 → 7–8.5 at step 0;
  Wrenfield 618 → 159. `?merge=off` keeps the rooms' meshes, to compare;
  `?merge=<metres>` another square (0: none), `?merge=own` no shared
  materials, `?merge=tint` no colours in the vertices (below).
  - **So that more of them draw alike, materials are shared**
    (`materialFor`): two of a runtime file's materials that look the same
    are one (`lookOf` — a publish numbers each piece of furniture's own
    copy of a finish, `oak_veneer#1`…: Ladonia's 1,064 materials are 337
    looks), and an untextured surface drawn from its bake takes its colour
    from its vertices (`tint`, three floats a vertex written by the
    merger; `tintShader` multiplies it in where the material's colour
    was), so every such surface draws with ONE material whatever its
    colour (337 → 218 materials). Not the grounds the garden finds by
    their material's name (`Vegetation.findGroundUvs`, `showHills`: every
    room's `floor_finish`, `hill_grass`, the site's ground). So in a
    merged view `mesh.material.color` is white for a tinted mesh and
    `mesh.userData.material` is the key of the first mesh merged, no
    more: a lit material for such a surface must read `tint` too.
  - **Each room's triangles stay together** in a merged mesh, and
    `mesh.userData.ranges` says where: `{ zone, start, count, vertexStart,
    vertexCount }` — index range and vertex range. `sceneBuilder
    .roomRanges(zone)` gives a room's range in every mesh that has one
    (merged or not; a mesh of one room is one range), and each range's
    `parts` the runs of it made with one published material: what the
    live room makes a room's own meshes from, and leaves out of the baked
    mesh's draw ("Live room light").
  - **The thin faces' light is mixed a room's part at a time**
    (`sceneBuilder.thin`, `mixThinLight`): the variants' vertex light and
    the switches' are kept off the GPU; a part is worked out again only if
    its room's state changed (variant, how much stays with its doors, each
    switch on and its reach), and only those ranges of the `color`
    attribute are sent (`addUpdateRange`). Turning all 93 of Ladonia's
    switches on: 376 ms → 66. A lamp's glass and bulbs (`userData.glow`)
    stay a mesh each, on the old path (`vertexLit`). The light kept is
    floats whatever the file stores (`floatValues`), and only what will be
    read: a variant's light less the sun's (`_day_indirect`…) where doors
    dim rooms — not "static" — and what a switch's lamps bounce
    (`_s#_indirect`) only lit live (`takeSwitchLight(geometry, live)`).
    Ladonia, "static": 43.6 → 18.7 MB of the variants' light kept; the
    switches' 10.5 MB, what their lamps bounce let go.
  - **One square on a site of Ladonia's size** (`MERGE_CELL` 64 m, laid
    from the site's corner in equal squares, so a site shorter than that is
    one): measured, fewer and bigger meshes are faster everywhere, indoors
    too, although more triangles are drawn there (the living room 4.20 →
    4.68 million of the frame's). At 32 m the street is +0.5 ms, at 16 m
    +3.0, at 8 m +4.9. Squares are for sites several times as long.
  - **What is left a mesh each, and why**: lamps' glass and bulbs (their
    material is swapped by their switch); anything see-through; door
    leaves, the furniture's doors and drawers, cars, people (they move,
    and are not in this group at all). **Window panes are not merged**:
    three sorts see-through meshes back to front by the middle of each;
    a row of panes in one plane made one mesh was sorted otherwise against
    what is see-through behind it (a window seen from the street drew
    differently), for 16 meshes fewer of 141.
  - The rooms' own geometries are emptied and the glTF loader's cache
    cleared (`gltf.parser.cache.removeAll()`: it keeps every array it
    read, so without that the merged copy is 100 MB on top). Never read
    `resources.items.publishedView`'s geometry after the view is built. A
    geometry two meshes draw (two nodes of one glTF mesh; no published
    file has one) is left to them, unmerged.
  - Comparing merged with unmerged: equal but at single pixels on lines
    where two surfaces touch (which of the two a pixel is depends on the
    order they are drawn in) — under 0.001% of pixels over 8 levels a
    frame on average, 0.003% at most from above. A long thin line of them
    is still that (Wrenfield, a door leaf's edge against its casing: 340
    pixels). The exposure is read from the frame, so in a few frames the
    fifth digit of it moves and 0.5% of pixels move by one level.
- The sun's shade map of a "baked" view is drawn again only when something
  that shows moves by more than a centimetre, or the view has moved a metre
  (`LiveLamps` `STILL`, `SUN_MOVE`): the visitor's hidden first-person
  avatar settling used to draw it every frame (461 calls on Ladonia). A
  door's swing adds up the thin faces' light only in the rooms it changes
  (`SceneBuilder.doorZones`, `mixVertexLight(zones)`).
- **A door leaf is lit a side at a time** ("baked" mode,
  `ProbeLight.leafLight`): the leaf hangs in a wall, where `roomAt` is null
  and the probes — in the wall's own thickness, tagged "outside" — measure
  nothing, so many leaves were black in lit rooms, day and night (every door
  on one of the grid's planes: Wrenfield's kitchen doors, Ladonia's A2
  bedroom), and were not brought up from above. Each way the leaf can face
  takes the room on that side of its wall (`doorSideZones`), sampled 0.5 m
  into it; the ways along the wall (its edges, its panels' bevels) the
  dimmer of the two; swung open past 60°, the room it opens into, every way;
  each side with its own room's gain from above. So frames with a door in
  them differ from those taken before (the leaves alone: Ladonia's living
  room 0.4% of pixels over 8 levels by day, 1.4% at night; from above 1.8%
  and 1.5%; the pool and Wrenfield's living room to the bit), and a glazed
  leaf reads pale grey-blue at night in a lit room where it was black.
- Lightmaps, switch layers, the sun's mask and the doors' atlas load
  through `Utils/bakedTexture.js` (`createImageBitmap`, off the main
  thread; the bitmap is closed once uploaded, so `texture.image` has no
  size afterwards — do not read it or set `needsUpdate` on one again; its
  size is kept in `texture.userData.size`).
- The baked view rebuilds materials from runtime.glb by name: a material
  keeps its finish texture only if its name is exactly a catalogue finish
  id, and its depth layering only through `userData.polygonOffset`
  (Runtime.js `exportable`, SceneBuilder `restoreLayer` and `materialFor`).
- A baked material drawn by a shader of its own (the terrain's paint, kept
  under the lightmap: `drawnByOwnShader`) gets none of its room's switch
  or door layers in the per-room path: five grounds and a relief leave no
  texture units for them (16), and whatever of the terrain is in a room
  lies under its floor. Resolved (above) it reads the variant's own
  lightmap still (`setLightingVariant`: `OWN_SHADER.has(material)`), not
  the resolved one: lit by its room's lamps it showed through the gap at a
  threshold as a strip of grass (Ladonia: `terrain@a-g-a1-bed` from the
  hall), and kept in the lamps' scale at night the verge beyond the road
  came out a few levels brighter.
- Mirrors and metals are kept live and reflect a studio (Utils/
  reflections.js), at full strength by day and 0.06 of it at night,
  whatever lights their room: a bathroom's mirror is a pale grey sheet by
  day and black at night, a bronze frame black in a lamplit room (the
  unbaked view's are the room probe's capture, which a baked view does
  not make). Clear glass standing in a room no longer takes that studio's
  light on its own white (`SceneBuilder.clearGlassIndoors`,
  `reflectionsOnly`: a copy of the material whose diffuse colour is
  nothing in the shader — a shower's screen was a milky white panel by day
  in every baked mode, 117.7 → 102.0 mean in A1's bathroom, the tiles
  seen through it); window panes and glazed doors, which hang in a wall
  (within 0.1 m of their room's edge), are left as they were.

## Exposure in a baked view: the light meter

- **Interiors in a baked view are metered** (Realism's `LightMeter`): the
  bake's rooms hold the real light through their windows, a tenth to a
  hundredth of the day's and far from even, where the live view gives every
  room 0.8 of the whole sky; with the live view's flat ×2.2 they drew at a
  fifth of its brightness. Indoors by day the camera meters what it sees
  (the log-average of the frame's light, NaNs dropped, nothing darker than
  ×32 can lift counting for more) and exposes it to `METER_KEY` 0.18, ×1 to
  ×32 (`METER_MOST`). It reads **the frame that was just drawn** —
  `PostProcessing`'s `frame`, the scene's light before the occlusion, the
  tone mapping and the grade — through a 16 × 9 float target (64 points
  of the frame a pixel) and a pixel buffer read a frame or two later (`ask`,
  `take`: `fenceSync`, never a wait; a buffer of its own for each reading —
  one buffer written again and again had Chrome log "READ-usage buffer was
  written, then fenced, but written again before being read back" by the
  hundred, which a page's `console.warn` hook never sees: read the pane's
  console, `read_console_messages`): no second render of the scene (it was
  one, 9–15 ms, at every reading, twice a second while walking). It agrees
  with the old reading to ±0.04 stop (eleven poses). It reads again in
  another room, after a jump, on a change of light (variant, lightmap,
  switches, doors) and every 0.2 s while the camera moves. A jump is the
  camera 3 m (`JUMP`) from where the frame before had it —
  `meter.track(camera)` is told before every frame, in a room or not —:
  walked into, a room keeps the last exposure for the two frames the reading
  takes and is then eased to; jumped into (a teleport, the bird's-eye view
  left) it takes at once what stands in for the reading — the room's last,
  if it jumped within the room (so the view from above left in place comes
  back exactly as it was), else about what its probes say (`ROOM_KEY`) — and
  two frames on the reading itself, at once too. A reading is never asked of
  a frame drawn while the meter was not (from above, out of doors: `told`,
  `since`), nor of the picture before it is first drawn at a new size
  (`PostProcessing.frames` goes back to 0). Where there is no
  post-processing — steps 0–1, and **a space without a sky of its own at
  every step, which is now metered too** — it reads the room's mean light
  from the bake's probes: brought to `PROBE_KEY` 0.55 under a sky (as the
  lowest steps were tuned), to `ROOM_KEY` 0.22 without one (Wrenfield's
  living room: mean level 91 for the live view's 89 — it was 36 unmetered,
  and is 148 at 0.55), and there ×8 at most (`METER_MOST_PLAIN`: at ×32 a
  windowless hall whited out the room and the garden seen from it, and the
  lightmap's own compression blocks showed; they still show a little at ×8
  in Wrenfield's study — a matter for a re-bake); without probes ×12 under a
  sky, ×6 without — or, with the room's own ceiling light on, ×1.4 and ×1
  (`LightMeter.unmetered`: a phone's fully baked room no longer burns out
  when its light is turned on by day). Outside and at night as live.
  Calibrated so Ladonia's living rooms and bedrooms match the live view's
  mean brightness: the glazed living room ×3–4, the open-plan ones ×11–15, a
  one-window bedroom ×27–32, and ×1.3–1.5 with the room's ceiling light on.
  Never judge a baked interior at a fixed exposure.
  - A still taken right after posing a camera shows the *last* view's
    exposure: the reading comes two frames later, through the event loop
    (its shader is built by `compileAsync`, its fence polled per frame). In
    a test, draw frames with an `await` between them until
    `renderer.realism.meter.fresh`, then set `realism.lastAt = null` and
    draw once more (the tools' `K.read()` in the scratch folder does). A
    synchronous loop of renders never gets a reading.
  - What does *not* stand in for the frame: the room's probes (their light
    in the air is 2–4 times what a camera sees of a dark-furnished room
    from by its window: A1's living room read ×4–6 for today's ×12), the
    lightmap over the room's rectangle (worse), or a factor per room taken
    from one reading (worse than none: the difference is per view). Any of
    them is within ⅔ stop of a given reading for three views in four — as
    close as two readings in one room are to each other (1.5 stops apart,
    median, by the way looked).
  - **At night a lamplit room is metered too** (`NIGHT` in Realism.js,
    `renderer.realism.night`; `?night=meter|lift|asis` to compare, also
    settable live: `realism.night.mode`). Drawn from its bake at the night's
    own exposure (0.85 under a sky with the grade), a room lit by its lamps
    came out at mean level 62–84 for the old live lamps' 77–107 and the
    unbaked view's 109–125. Now, in a room whose own lamps are on
    (`LightMeter.lamplit`: a switch of the room, or of a room open to it
    with no wall between — not next door's), the same reading of the frame
    is taken with one difference: a point counts by how far its light, as
    the night exposes it, is over a floor (`floor` 0.008 → 0.025: under it
    is the night — a window, a television, a dark doorway), and the
    log-average of *that part* is brought to `key` 0.2, never under the
    night's exposure and at most `most` ×2 over it, by as much as that part
    is of the frame (`share` 0.05 → 0.25). Ladonia at step 4: living room
    83.5 → 93.7 and 62.4 → 91.7 (two views), bedroom 69.4 → 85.9, bathroom
    65.2 → 93.2, twin 83.6 → 100.5, upper living 82.7 → 94.6; no more pixels
    at white (≤ 0.2%). Out of doors, from above, with the lights off (a dark
    room: mean level 0.3–6, the same to the pixel) and in a room lit only
    through a doorway: as before, exactly. Tried and not taken: every
    lamplit room ×1.4 (`lift`: the old default's levels almost exactly —
    76–98 — but a dim room stays dim: 49 → 60 where the meter gives 72); the
    day's own count of dark points (a room looked at towards its window came
    up a stop, and the garden with it: 52 → 79); from above, the rooms' gain
    ×1.4 (the lamps' glass crosses the bloom's threshold: the floor whites
    out, 39.6 → 85.8) and the exposure ×1.4 (the garden comes up with it).
    **Only through post-processing**: drawn straight to the screen (steps
    0–1; a space without a sky at every step) a lamplit room is already as
    bright — Ladonia at step 1: 76–112; Wrenfield 142–197, within 4–10 of
    its old live default — and is left as it is. It costs what the day's
    meter does: the same 16 × 9 picture, asked for at most every 0.2 s while
    the camera moves (a night walk: median 14.0 ms metered and not).
    `meter.light` and `meter.share` are the last reading. In a test at night
    `K.read()` returns at once (it was written when nothing was metered
    then): wait for `meter.fresh` as by day.
  - **Under a door the camera is still in the room it was in**
    (`Realism.between`, baked views): on no room's floor (the floors stop
    at their walls' faces) but within 0.2 m of a room under a ceiling, the
    exposure is the room's. It used to ease towards the outside's for the
    few frames of every doorway — by day ×13.7 → ×6.8 and back up on the
    way from a hall into a bedroom, a dip anyone walking saw; at night the
    lamplit room's would have dipped as far as the night's. Out on a
    terrace's or the street's floor, further out than that, or from above:
    out, at once, as before.
  - **While a reading is awaited the ease's clock is kept**
    (`updateBaked`: `adaptedAt`): `adapt` eases by the time
    since it was last called, and it is not called for the frames a first
    reading takes — so the first step into a room was as long as the wait:
    0.85 → 1.39 in one frame from a dark bedroom into a lamplit living
    room (63% of the way), ×1 → ×3.7 by day off a terrace. Now the largest
    single step of that walk is 7%.
  - **A change of the time of day is taken at once, and by what the house is
    lit for** (`World.houseLighting`, `meter.track(camera, turned)`):
    `drawLighting` puts the lightmap, the sun's mask and the switches in
    together, in one frame (the mask was waited for after the lightmap was
    in: a first night drew the night's house under the day's switches, dark,
    for six frames; only a view's first light, with nothing shown before
    it, does not wait for the mask), then waits a frame or two for the sky — and
    `world.lighting` only says the new time after that. The exposure went by
    `world.lighting` and was eased: day → night in a lamplit room drew a
    frame at the day's ×7 (mean level 157 for 94) and eased down over a
    second and a half; night → day two frames at the night's ×1.7 (50 for
    107). Realism, the meter and ProbeLight now go by `world.houseLighting`
    — the time the house is lit for, from the frame its light changes — and
    the change counts as a jump (what stands in for the reading at once,
    then the reading at once): Ladonia's living room 107.2 → 76 → 91.5
    within three frames, and 91.7 → 97.3 → 107.2. Out of doors the base
    exposure changes at once too.
  - **A room open to the air is out of doors at night**
    (`shared/daylight.js` `airyRooms`, `Realism.airy`): a loggia has a
    ceiling and a lamp, so it was metered as a lamplit room, and what is
    seen from it is the garden and the dusk — drawn ×1.7, twice as bright as
    from the terrace a step further out (mean level 53 → 77). A room is airy
    with a metre of its edge under only a parapet (a wall under 1.2 m from
    its floor: a knee wall under a roof's slope, 1.4 or 1.65, is not one)
    and nothing of the house beyond or below, or with no wall at all and an
    outdoor room beyond; never for want of a wall alone (a landing's
    stairwell, a plan drawn short of its wall). Ladonia: its two loggias;
    Wrenfield and Ashgrove none. By day nothing changes. *Not done*: the
    view through a window from a lamplit room is still up to ×2 brighter
    than the same garden from outside (the dusk sky is over the meter's
    floor and counts as lamplit; the frame's light alone cannot tell sky
    through glass from a lit wall).
- **Which of these a visitor is in, by step.** Under a site's own sky at
  steps 2–4: the frame's reading. Without a sky of its own (Wrenfield,
  Ashgrove) at steps 2–4, "baked": the probes, to `ROOM_KEY`. At steps 0–1
  a visitor is given "static", which loads no probes: one exposure for
  every room — ×12 under a sky, ×6 without (`METER_FALLBACK`,
  `METER_FALLBACK_PLAIN`), ×1.4 and ×1 with the room's own ceiling light
  on — and the probes' reading at those steps is only a link's
  (`?lighting=baked&quality=1`). So a room looked at with `?quality=0` is
  at a fixed exposure: Ladonia's rooms draw at 140–152 there for 105–111
  at steps 2–4 (2026-10-11; not re-tuned).

## Live room light

Over a view drawn "baked", **K** — or the *Live room* switch at the head of
the lights panel — has the rooms round the visitor drawn with their own
materials, the editor's, in the bake's own light: the sun through their
windows and the lamps nearest the visitor live, with their shadows, and
the rest of their light — the sky through the windows, every bounce, the
soft shade in corners and under the furniture, the lamps not drawn live —
the bake's (*In the bake's own light*, below; until 2026-10-15 their light
was the unbaked view's, the editor's realistic walkthrough, which is still
how a bake without its light apart draws them). Every other room, the
garden and the view from above stay the bake's, exactly. Off at every
visit, never on by itself. The user's words
for it (2026-10-12), on seeing K light a room's lamps over its bake: "The
live lights with K should completely transform the room into the same
version that we see in the editor, without the bake … not switch from
baked to live lights, but also remove the baked textures and replace with
actual ones." That first drawing — the lamps as uniforms read by the
room's surfaces over the bake, their bounce kept from the bake's layers —
is gone, code and all (`roomLampGLSL.js`, `roomTwin`, `setRoomLive`,
`FITTING`, `ProbeLight.lampRoots`, `Switches.loadBounce`, every
`?roomlight=` word but `on` and `off`): a note that names one of those is
of before. And on 2026-10-15, of the light: "There is a significant
difference between baked light and live light in the view mode. The baked
light is more yellow and warmer and live light is more white/blue, and
also fewer shadows appear with the live light. Make the live lights
ambience look as similar as possible to the baked one" — the materials
staying the true ones, the editor and the unbaked view as they were.
`World/RoomLight.js` says which rooms and when, `World/LiveRoom.js` draws
them, `World/RoomBakeLight.js` gives them the bake's light, and each
file's header says how and why so. Read this before changing any of them,
or measuring them.

- **Which rooms** (`RoomLight.js`):
  - *Groups.* Rooms that always stand open to one another on a storey are
    drawn as one (`groups`, from `roomLinks`' `links` holding a `null`): no
    wall between them, or a doorway with no door. A1's bedroom opens off
    its hall so: left the bake's, its light in the hall's probe was the
    bake's (the hall 4 levels dark), and the wall they share drew in
    zigzags — the bake cuts a wall that runs through a doorway into each
    room's triangles, and one room's were live beside the other's baked.
    Ladonia has eleven groups of more than one room: A1's and B1's bedroom
    + hall + living room, A3's and B3's closet + living room, A's and B's
    first-floor south hall + living room, C1's, C2's and C3's living room
    + hall, C4's living room + hall + stair room, C5's stair room +
    living room; Wrenfield two: hall + kitchen, living room + study. Only
    rooms under a ceiling with a part of the bake of their own count
    (`rooms`: 93 of Ladonia's 139, 19 of Wrenfield's 32).
  - *What joins two groups* (`ways`, read once from the spec): each door
    and doorway of a wall with a group either side, each stairwell
    (`floor_openings`), and — `over` — each flight of stairs, from the room
    it starts in to every room it passes over. The bake files a step with
    the room it is over: the upper half of villa A's and B's flights to
    the roof is the bathroom's under it, black steps in a stair hall drawn
    live until the bathroom's door was opened (958–2,372 px of 57,600). So
    the room a flight starts in sees those rooms as through a stairwell,
    from that room only: the bathroom is drawn live behind its shut door,
    and its steps with it. Counted 2026-10-13/14, and again on the 14th by
    replaying the constructor in node over the published specs and
    zones: Ladonia 67 ways between 79 groups (59 doors, 8 stairwells) and
    six such flights besides, 73 in `ways` (A's and B's two first-floor
    flats each, C4, C5, each over its bathroom); Wrenfield 17 ways between
    17 groups (15 doors, 2 stairwells) and no such flight.
  - *What is live* (`look`): the group the visitor is in and every group
    seen from it — through any opening of the visitor's own rooms that
    lets the eye by as it stands (`passes`, LampPool's rule for a lamp's
    light: a doorway or a stairwell, a door with glass in it, a door not
    shut or on its way open), and on through the openings of those as far
    as a straight line passes them (each narrows what is seen through the
    next: `open`, `clip`, in plan), three openings deep (`DEPTH`), nearest
    first, those ahead of the eye before those behind it. **A group once
    shown stays shown while open doors still join it to the visitor**,
    whichever way they look, and goes back to its bake when the door
    between is shut or its place is wanted: giving rooms back as the eye
    left them made 23–26 changes in a walk through six rooms, each one the
    probe taken again and the sun's map drawn again.
  - *How many*: eight groups at every step that has it (`LIVE_MOST`;
    `roomLight.most` is a developer's own ceiling, for a test) — the
    visitor's own, then the nearest in sight; beyond them a room in sight
    is the bake's and changes in a frame when its turn comes. No walk
    measured on Ladonia reached eight; its review found that Wrenfield's
    seventeen groups, joined by two stairwells, can (not raised
    unmeasured). With the ceiling set to four there was bake in view in up
    to 6.5% of a frame and rooms changing in view as they took turns: a
    ceiling lower than a flat's doors costs more, in changes, than the
    rooms it leaves out.
  - *Where the visitor is* (`where`): by their feet. `roomAt` finds a room
    from as far above its floor as its ceiling — on a threshold upstairs,
    a strip that is no room's, it answers with the room a storey below —
    so a room is taken only from within 1.2 m of its floor (`ON_FLOOR`: a
    bed counts, the storey above does not); on a flight of stairs
    (`flightAt`, from the spec's `stairs`) the room at the end nearer in
    height; on a threshold or in a wall's thickness the room live now if
    it is within 0.3 m (`REACH`), else a room indoors that is; in no room
    at all the last stays live 0.6 s (`BETWEEN`). Out of doors nothing is
    live (`status().state === "outdoors"`).
- **Made ready before it is seen** (`follow`; `LiveRoom.prepare`, then
  `show`). Nothing of it exists until it is first asked for, and none of it
  may be made in the frame that first shows it — the first time that was
  one frame of 3.5 s.
  - *Staged, then shown in one frame.* A group's meshes are built on no
    layer, its textures sent one a frame (`renderer.initTexture`), its
    shaders built for the lights it will be drawn under and each drawn
    once out of sight (`Renderer.build`), the surroundings the view has
    never drawn made ready the same way (`surround`, 30 m), the sun's map
    drawn, the probe taken a face a frame. One group at a time; sixteen
    stay staged at most (`STAGED_MOST`: eight shown, four ahead, the last
    few left).
  - *The first press* makes everything in sight ready before the
    visitor's own group, and that one last with the others beside it — the
    probe and the sun's map are then drawn with all of them (`prepare`'s
    `first`, `beside`) — and shows them in one frame: the view changes
    once ("Getting the live room ready…" meanwhile, state "coming").
  - *Walking on*: the group behind a shut door is staged as the visitor
    comes within 3.6 m of the door (`AHEAD`; the key opens the nearest
    within 2.2 m), the doors they face first, four at most
    (`AHEAD_MOST`), and shown in the frame the door starts to move (a door
    is 0.38 s in opening, eased: 18° after three frames). Nearest only,
    two at most, the door at the end of a corridor was not among them and
    its room came a frame late. So walking from one room into the next
    changes nothing in view: both were live, and still are.
  - *Only under lights its shaders were built for* (`fresh`): another time
    of day or step of the slider has every live room given back to its
    bake and staged again, and the view from above takes them out for as
    long as it is open (`hold`) — 8–43 frames of the bake's rooms after
    each: a room kept on screen under the next lights would be the day's
    room at the night's exposure. A group waiting behind a shut door is
    looked at,
    while it waits, for lights changed since it was made ready (`stale`),
    and made ready again, twice at most (`again`).
  - *In from out of doors* the room is the bake's until its visitor is in
    it (13–15 frames made ready, 126 on a visit's first), then changes in
    one frame: nothing is staged or shown from no room. That needs the
    entry doors as ways from "outside", and a probe and an exposure for
    rooms seen from the garden: not built.
- **How it is drawn** (`LiveRoom.js`):
  - *Calls of its own, round the scene's.* three gathers a call's lights
    by its camera's layers, so the rooms' surfaces and the unbaked view's
    lights are on a layer of their own (`ROOM_LAYER` 20), drawn first into
    the same picture from `scene.onBeforeRender` (hooked only while a room
    is shown); the scene's own call then clears nothing; what is seen
    through of the rooms' — a window's pane, a shower's screen, a glazed
    leaf — comes last, in a second call (`GLASS_LAYER` 22, from
    `scene.onAfterRender`): left in the scene's call a pane was lit by the
    baked view's sun, which the house does not shade, and by none of the
    room's lamps. The two never light each other, and nothing of the
    baked view is built again for a light of the room's. Two calls into
    one multisampled target work because three r163 does not invalidate
    it after resolving.
  - *Each call is handed a stand-in for the scene* (`standIn`:
    `Object.create(scene)` with no hooks, `matrixWorldAutoUpdate` off, and
    for `children` only what the call draws): three keeps a call's lights
    and its render list by the scene object it is given, and handed the
    scene itself the room's call and the scene's shared one light state,
    which each found changed under it every frame. **A stand-in works no
    matrix out**: a call of the room's made outside a frame of the view (a
    probe's face, the shadow map drawn ahead) must call
    `scene.updateMatrixWorld()` itself, or a lamp just handed to another
    fitting has its shadow map drawn from where it hung (a bathroom 8–10
    levels dark in one run and right in the next). The shadow pass is
    handed the scene itself (`roomCall`), which is where the casters are.
  - *The rooms' surfaces* are meshes made of the merged house's own
    vertices by `sceneBuilder.roomRanges(zone)[].parts` — each run of a
    range's triangles with the key of the published material it was made
    with — drawn with `sceneBuilder.roomMaterial(key, baked)`. The bake's
    own drawing of them is left out by an index, not by groups (`cut`):
    each baked mesh with something shown live is drawn by an index of its
    own that holds the rest, one draw a mesh however many rooms of it are
    live (a mesh that is all the rooms', off every layer). The index is
    kept (`parts`) and sent again only when what it leaves out changes
    (0.1–0.4 ms for the 21–76 meshes of a change; `show` itself 0.7–1.8
    ms), and kept from one switching-off to the next (let go, its buffer
    was never given back: three frees one only with the geometry it is
    the index of). Nothing else reads a merged mesh's index after
    `roomRanges` has listed it; a ray cast at a merged mesh misses what is
    left out of it (the camera's boom goes by the collision tree in a
    published view).
  - *Frames, reveals, sills, thresholds* (`frames`, `FRAME_REACH`): what
    stands in the openings of a room's walls is no room's — the bake files
    it under "outside" — and beside a room drawn live it was what was left
    of the bake in it (dark green in Wrenfield). Every triangle of the
    bake's "outside" that lies wholly within an opening of a wall — as
    wide as the opening and as deep as the wall, and 12 cm along, 8 cm out
    of the wall's faces and 12 cm up and down more — or in the plane of
    one of the opening's sides (within 2 cm: an older bake has no reveal
    cut to the opening, and the end of the wall beside it is the reveal)
    is that opening's, found once for the house in slices (55 ms in one go
    for Ladonia's 486 thousand outside triangles) and drawn live with the
    rooms either side: with the group where the opening is its alone, as a
    small group of its own where two share it (`frameOf`). An opening's
    two sides are two bits (`inside`): with one for both, the wall panel
    over an opening and under a window had every corner "in the plane of
    one of its sides", and the façade above and below every outside window
    was drawn live. Ladonia: 173 of its 178 openings have something, 8,154
    triangles; Wrenfield's 46 of 46. A deck's boards, a terrace lamp and a
    grill by a door lie 10–20 cm out and stay the bake's, as does all the
    garden.
  - *Its light is the unbaked view's own code, pointed at the rooms* — where
    the bake cannot light them (*In the bake's own light*, below, keeps of
    this the switches, the pool of lamps, the fittings' glass, the probe and
    the sun's map): the
    switches (`LiveSwitches`), the lamps handed to the fittings nearest
    (`LampPool` with `{ layer }`), the lit rooms' glow (`RoomGlow`, in the
    rooms' materials alone), the fittings' glass (`LiveBulbs`), the sky's
    share and the room probe (`Sky.share`, Realism's `RoomProbe`, each
    face drawn by the two calls) and the sun's shadow map and its filter
    (Realism's `SunFit`) — but at night, as far as a room's own lamps
    are off, its light that is not theirs is the bake's (*At night the
    light that is not its lamps' is the bake's*, below). **One sun, one pool of lamps, one probe** over
    all the groups shown, as a view lit live has: the sun's map is fitted
    over them (`sunZones`, `sunBox`: 1024 a side on Ladonia, not the
    step's 8192; without a sky of its own, `fitSun`, as many texels as
    give the whole footprint's map its own texel or finer — Wrenfield 512
    or 1024 for 4096), the lamps are handed round by where the visitor
    is, and the probe, taken in the room the camera is in, sees live
    neighbours.
  - *Its shadows.* The house's meshes cast none in a baked view, and must
    not. So the rooms' lights have casters of their own on a layer no
    camera draws (`CAST_LAYER` 21): a stand-in for each mesh of the house
    and the runtime file's "shadow-casters", drawn by three's own shadow
    pass in the room's call, and only when one is due (a fit moved, a lamp
    handed on, something moved by the rooms — `stirred` — not at every
    metre walked). `renderer.shadowMap.render` cannot be called outside a
    render: it is swapped for the length of the room's call. **The bake's
    view.glb has lost the editor's `cast`/`receive`** (bake_public.py
    deletes them on export): they are read from the JSON chunk of the
    version's unbaked `<version>/view.glb` by two Range requests (0.84 MB
    for Ladonia). A new bake should keep them. A garden that casts
    nothing in the baked view casts for the rooms' sun for the length of
    its map's drawing (`lend`).
  - *Its glass.* The baked view keeps the clear glass that stands in a
    room to its reflections alone (`clearGlassIndoors`); a room drawn live
    takes the glass it was made from (`reflections.js`'s `wholeGlass`): a
    shower's screen is the lit, milky pane of the unbaked view (in the
    bake's light, below, all clear glass keeps to its reflections). The
    ambient occlusion eases off behind glass by its alpha, read from two
    pictures N8AO has drawn of what is seen through
    (`PostProcessing.drawTransparency`) through the view's own camera,
    which does not see the rooms' glass layer: it is drawn into each by a
    call of the rooms' (`veil`) with a material only as see-through as the
    glass (`veilOf`: the glass's own, lit by every lamp, was 1.2 ms of the
    frame). Without it a shower's tiles were 2–3 levels dark.
  - *What moves in it* (`plan`, `apply`, `track`): rigged figures — the
    people, the visitors — go onto the rooms' layer themselves; door
    leaves, the furniture's doors and drawers and a car by stand-ins,
    their own meshes left where the crosshair finds them (with a material
    that does not show, `userData.roomLive`); whoever walks in or out is
    taken up or given back as they go.
  - *The exposure is the unbaked view's rule* — where the bake cannot light
    them; in the bake's light it is the baked view's own meter's, below —
    while rooms are live and the
    camera indoors (`roomLight.drawn`: `{ zones, gain, adaptation }` —
    under a site's own sky `INDOOR_EXPOSURE` ×2.2 by day and the night's
    0.85 where the step grades, 1 where not; without a sky of its own the
    preset's exposure, the plain night's at night — each over
    `environment.bakedExposure`, `LiveRoom.expose`; Wrenfield's living
    room by day read `adaptation` 0.85 and `gain` 5.4 in the page on
    2026-10-14; read by `Realism.updateBaked`), not the meter's; the baked rooms seen from
    them are brought up by `setIndoorGain(drawn.gain)` by day (1 at night,
    where any gain blooms), eased (`expose`), raised for a room just
    stepped into that is still the bake's (`aim`), and put back by
    `LiveRoom.hide` itself: K off is the bake's again to the pixel. The
    exposure comes down in the frame a room is shown and is eased when it
    has to go up.
  - *At night the light that is not its lamps' is the bake's — as far as
    its lamps are off* — where the bake cannot light them all (a bake
    without its light apart; in the bake's light, below, none of this is
    made) (2026-10-15; the user: "in the public view, in the
    live light mode for the room, when its nighttime and the lights are
    off, the room is still clearly visible, just like in the editor mode,
    but it should be dark, like the baked version", and then: "Make sure
    that in the editor mode it stays as it is currently, only change the
    published view"). The unbaked view lights every room by the same
    share of the open sky, which knows nothing of walls (`Sky.share`:
    `INDOOR` 0.8 × the sky's strength; at steps 3–4 by day a room probe of
    a room so lit; without a sky of its own the night's hemisphere,
    `LIVE_NIGHT_SKY`). The dusk's HDR, its sun clipped, is three times the
    day's sky, so at 0.36 that share is as bright at night as by day (a
    mean of 0.269 against 0.259), while the night is exposed at 0.89 where
    a room by day is at 2.86: villa A's 32 rooms with their lamps off were
    24–122 levels with K (36–95 in 30 of them), the bake's 0–8 (18–34 in
    A2's and A3's living rooms, warm from the garden's lamps, and in A1's
    hall, a door leaf). So at night, **as far as a room's own lamps — and
    those of a room open to it with no wall between (`RoomGlow.together`)
    — are off**, its light that is not a lamp's is what its bake measured
    reaching it (`LiveRoom.measure`), red, green and blue each:
    - its light probes' mean **for each of the six ways** (+x, −x, up,
      down, +z, −z) for the time of day with no lamp, × `zoneStays` (as
      `roomDaylight` reads a room), and on a surface the six ways' light
      as it faces — an ambient cube, as `ProbeLight` lights what moves —
      in place of the unbaked view's sky (its ambient light, its indoor
      sky, the scene's own environment on what has no map of its own);
    - brought up, colour by colour, to what the bake's **lightmap** holds
      on the room's own surfaces with every switch off, where that is more
      (`lightFigures`, `readLightmapRooms`: read once a night from the
      published phone copy of the variant's lightmap — each room's part by
      its own curve where the bake held it so, else the one-scale reinhard
      / ycocg — the mean over the lit texels of the room's atlas rectangle;
      the light the view draws is on the GPU alone): the garden's own lamps'
      straight light through a glazed room's windows, which the probes
      leave out by design (bake_public.py's `garden_lights`). The larger of
      two measures of one light, so nothing is lit twice, and no light of
      the live room's is the garden's;
    - a room whose probes measured nothing (under `UNMEASURED` 5% of its
      lightmap's: villa A's A3 closet has four, in its wardrobes' space,
      that read 0) or that has none (villa B's A3 closet) takes its
      lightmap's figure every way; a room with neither, none (dark);
    - plus each switch that is on in a room not open to it, at its probes
      each way × `switchReach` (as `ProbeLight.compose` adds it: the spill
      of a lit room through an open door, which no light of the live
      room's carries past a door).
    Carried by the live room's own RoomGlow table (`shares: true`,
    `setShares`): row 1 a room's share of the sky's reflections (its six
    ways' mean over `modelLight` — the sky's strength × `INDOOR` ×
    `Sky.js`'s `indoorLevel`, or the rig's hemisphere and ambient light —
    clamped 0–1), rows 2–7 its six ways' light, the outside's share a
    uniform; all faded over the glow's 0.25 s from where they stand
    (`easeShares`; at once the first time and from day to night); the
    uniform `roomShareNight` 1 at night alone. Each surface's shader finds
    its room as the glow does (the room its face looks into, 0.15 m out;
    of two, the more lit) and, with `g` that room's glow — row 0's own
    figure, the share of its group's lamp power that is on, faded over
    0.25 s as LampPool fades the lamps themselves — takes `irradiance × g
    + π × cube(normal) × (1 − g)` and `iblIrradiance × g`, its reflections
    × `share + (1 − share) × g`; facing no room (a window's frame, the
    outer part of its reveals: no room's map reaches there), × the
    outside's share lifted as far as the visitor's own room's lamps are on
    (`roomShareOutGlow`, the glow of RoomGlow's `outsideRoom`, which
    LiveRoom sets to the room its visitor is in: without it a lamplit
    room's window frames were up to 54 levels darker than the editor's). So
    **lamps on (`g` 1) a room is the unbaked view's to the last bit — the
    editor's look K gave before, which the user asked for**; half its
    lamps' power on, halfway; a room lit only by a neighbour's spill keeps
    the bake's measure. A door leaf (`trim_oak`, which no indoor finish
    pattern matches, so the unbaked view lights it by the outdoor dusk at
    0.12 and draws it near black) takes its room's six ways as the walls
    do. What a material takes of a room probe (`roomShareProbe`) is left
    whole: the probe is drawn with all this and holds the room's light.
    Nothing more is drawn or built; a door's swing or a switch changes a
    few numbers. By day `roomShareNight` is 0 and the sums are the unbaked
    view's to the bit; the editor's glow (no `shares`) has the shader text
    it had. Why the bake's own figure at night and nothing by day: by day
    the two views are exposed each to its own light (the meter lifts a
    baked room 4–16×) and the live room is the editor's; at night both are
    exposed at the night's 0.89, so the room must hold the bake's light
    itself. Tried and replaced (the same day): the probes' all-round mean
    as a share of the unbaked view's own indoor sky — that sky is upside
    down (below), so a floor or a sofa's seat took 0.45 of the mean and a
    ceiling 1.08; A2's living room, 19.6 baked, was 4.6, villa B's closet
    (no probes, full share) 95.5, and lamplit rooms 17–31 levels under the
    editor's, the dusk's share gone from under their lamps. The ratio of
    the bake's night to day light, set against the model's (the first
    idea), kept 0.13–0.6 of the dusk and left the rooms grey. Units: the
    probes hold irradiance/π as the lightmap does; three draws the dusk's
    indoor light at a mean of 0.271 over six ways for `modelLight`'s 0.269;
    a room's lightmap mean is 0.8–1.6 times its probes' in 24 of villa A's
    32 rooms (A2's living room 1.55, A3's 1.33, A1's 1.34; the phone copy's
    means within 1–4% of the full size's but for three small dark rooms,
    8–14%).
  - *Switches.* The live rooms' switches stand as the baked view's do —
    but, where the bake cannot light them, a space without a sky of its own
    is drawn lit live with its rooms'
    lights **on** by day (`LiveSwitches`' `dayOn`: nothing else lights
    them there) while its bake starts them off: copying the baked view's,
    Wrenfield's rooms were 33–73 levels under the unbaked view by day. A
    switch its visitor has not turned stands as the view lit live starts
    it (`syncSwitches`, `turnedIn`); one they have turned, as they left
    it. So there the lights panel may say "off" over a lamp the live room
    has lit: the first press turns the bake's on (no change in the room),
    the second turns both off.
  - *Kept after it is switched off*: the lights, RoomGlow's map and table,
    the casters, the rooms' material copies and every program built — and
    in the bake's light the switches' bounce layers, the thin faces' light
    (zeroed) and each copy's six ways.
    Given back (`release`): the shadow maps, the probe, the staged meshes,
    the textures it sent itself — and in the bake's light its lightmap's
    targets, the light without the sun and the lamps' casters.
- **In the bake's own light** (2026-10-15, `World/RoomBakeLight.js`, made
  with the rig where `RoomBakeLight.usable`: the view's light resolved into
  one lightmap over a merged house, every time of day with a sun its light
  without it, 16 texture units). Why K and the bake differed: the live
  room lit its true materials as the editor does — 0.8 of the sky's
  picture as ambient, blue-white and the same in every corner, a flat
  glow for a lit room's bounce (RoomGlow), two spotlights shining down
  with shadows and the rest without, exposed by the editor's rule — where
  the bake traced every lamp and the sky through the windows with every
  bounce off the warm walls. Now the surfaces keep their materials and
  take their light from round about from the bake alone; only the sun and
  the nearest lamps are live.
  - *The lightmap without what is drawn live* (`resolver`: a second
    `LightResolver`, `sunless`, the size of the view's, made at the first
    press and given back by `release`, 64 MB at 4096²): for each room
    shown and made ready (`track`), the time of day's light less the sun's
    straight light, dimmed by the doors as they are, plus each switch that
    is on — `whole` layer × (on − live) + `indirect` layer × live, where
    `on` is how far it is on (`weights`, faded over 0.25 s) and `live` how
    much of it its lamps give live (`shares`, LampPool's levels): a switch
    whose lamps are not drawn live keeps all of its light, with the bake's
    soft shadows. The light less the sun: the very lightmap the view draws
    from, its rooms each held their own way, with the sun's share taken out
    texel by texel by its mask (`setSun`: `light − tint × share × scale`
    before the doors) — the bake's `<variant>-indirect` lightmap, tried
    first, is one-scale, and by day a dim bedroom at the meter's ×15 showed
    its chroma as pink and green blotches; it is still taken if the mask
    has not come in 3 s (`MASK_WAIT`). With no sun (Ladonia's night) the
    view's own base, nothing taken out. The surfaces read it through the
    merged house's `uv1` (kept on the live meshes of a part lit by the
    lightmap), opened out as the view's resolved lightmap is.
  - *Each part lit as it is in the bake* (`kindOf`): "lightmap"; "vertex"
    — a thin face, its light added up as the view's (`addThin`: the
    variant's `_<variant>_indirect` × doors + each switch whole, into a
    `roomBake` attribute of its own; thin faces take no live lamp, since
    the bake's lamps' bounce on them is dropped at load); "room:<id>" —
    what has neither (a fitting's glass, a metal's thin face): its room's
    probes' mean every way.
  - *What moves* (the people, door leaves, drawers, the car, the rooms'
    panes — which keep to their reflections, below): a copy of each material for each thing (`material(…, "cube",
    root)`), lit by the probes round it as `ProbeLight` lights it — six
    ways, eased — from the probes' light added up the same way
    (`ProbeLight.composeShared`; the switches' `indirect` is read from the
    probes' file the first time K asks for it, `indirectOf` — 0.77 MB of
    Ladonia's numbers a visit that never presses K does not decode; since
    the lamps' strengths are measured from them, the first press reads
    every switch's, 3.4 ms, `ready`'s `kindStrength`). What
    takes no light — a car's lamps (shaders of their own), anything drawn
    unlit — is copied as it is, not patched (`LIT`): patched, each logged
    that three's shader had changed, seven at every showing of Wrenfield's
    rooms, the car in its garage. A door leaf is lit a side at
    a time (`leafLight`); its true oak is tan-pink there, where the baked
    view, whose leaf has no map of its own and takes the scene's outdoor
    sky on top of its probes, draws it nearly white by day.
  - *Nothing else from round about* (`bakeShader`): no ambient, hemisphere
    or probe light, no environment's diffuse (`iblIrradiance`), no
    RoomGlow (not made). Reflections stay: the room probe's whole — it is
    the room as drawn —, by night as by day (`LiveRoom.probeOn`: Sky.share
    dims what reflects its own studio, or the probe in the studio's place,
    to 0.06 at night, which a view lit live makes up with its lit room's
    glow; here a lamplit bathroom's steel washer was 9 levels at night for
    the bake's 53 and the editor's 82, now 79, and its mirror reflects the
    lit room as the editor's shows it, 140 for the bake's 83 — the baked
    view's metals reflect a studio at the night's 0.06), a studio of the material's own whole (a metal's,
    as the baked view keeps it: Wrenfield's mirror and taps, which have no
    probe there, were black when they were cut) but into a face of a probe
    (`capturing`: a windowless bathroom's chrome and shower screen at the
    studio's day strength were what its walls reflected, at the meter's
    ×32), and the sky's or the scene's as far as the surface's own light
    is of what the sky would give it (`share`). **Clear glass is
    reflections only** — a shower's screen as the baked view keeps it (no
    `wholeGlass`), and since 2026-10-15's second fix every pane drawn live
    too, a window's, a glazed leaf's (`plan`: `reflectionsOnly(material)`):
    the bake lights no glass. A shower's screen lit by the bake's light hid
    its tiles; a window's pane (`glass_solar`, #eef2f2 a tenth opaque)
    lit by a lamplit room's probes was a frosted sheet over the night — B's
    upper north bedroom 2's pane 137,110,85 where the bake's is 16,13,14,
    its window 87.6 for 21.9, now 52,18,0 and 35.0 (what is left is the
    bronze louvre outside the glass, drawn live as the opening's, lit by
    the room's lamp through the pane and reflecting the room). By day the
    panes are clear: the baked view's white veil is its own pane lit by
    its unshaded sun at the meter's exposure, which is not the bake's light.
  - *Everything drawn live takes the shadows* (`receiveShadow` on every
    surface and stand-in, whatever the editor's flag): a light switch's
    plate, which takes none in the editor, was lit by the sun through the
    walls of A2's windowless bathroom — 204 levels by day where the bake
    has 31.
  - *A sheer curtain is the baked view's* (2026-10-15, after the third
    review: `movers`' `sheers`, `sheerCall`, `lightsOfView` in
    LiveRoom.js). The bake has no curtain: nothing seen through is in the
    snapshot it traced (StaticBatcher's `canMerge`), so it neither lights
    one nor is shaded by one, and the baked view draws its curtains live,
    in its own light — the sun unshaded by the house, the indoor sky's
    picture at its share (0.8 by day), and at night Sky.glowIndoors' warm
    glow (emissive = colour × #ffbb7a, × 0.3, the colour map as its map).
    K drew them as what moves: a copy lit by the probes round it ("cube"),
    cloned from the scene's material as it was at the first press. The
    face seen looks into the room and took the room's light alone, a dark
    brown sheet by day; copied by day it had no glow at night, copied at
    night it kept the glow for the visit — saturated orange by day. Now
    whatever is seen through by or in a room shown and has no clear glass
    in it (`reflectionsOnly` null for all its materials) stays the scene's
    own mesh: hidden for the scene's call (`before`) and drawn after the
    room's glass in a call of its own (`after` → `sheerCall`), handed a
    stand-in for the scene holding the curtains and the view's own lights
    (each `Object.create(light)` with no children, looked for at each
    `show`, those under a hidden object left out) — the scene's call's
    light state, so the same shader and the same light. Left in the
    scene's call (tried first) the room's clear panes behind it, drawn
    after it, lay over it: 7 levels darker over B's A2 living room's
    window, 12 from the room's north end. It casts nothing for the room's
    sun or lamps (the bake's light has none of its shade), and the call is
    not made while none of them is in sight (`_frustum`). The room probe's
    faces still draw it in the scene's call, under the glass. Ladonia has four (`curtain_linen`,
    0.88 opaque, two-sided): A's and B's upper south living rooms, and two
    in B's A2 living room; Wrenfield none. Measured on the curtains' own
    pixels (a mask of where the nearest surface is a curtain, the house in
    front counted), 640 × 360 of a 2560 × 1440 frame, the people hidden;
    baked | K as the third review found it (index-CQEccRmn) | K now
    (index-si0LEYQ7; its build without the frustum test, index-B_mdutKG,
    the same to 0.1), A's upper south living room, B's, B's A2 living
    room from its north end and from the west (the review's pose):
    - day, lamps off, K first pressed by day: 165.4 | 79.9 | 164.8, 161.1
      | 90.8 | 160.6, 194.0 | 92.6 | 186.1, 187.9 | 63.5 | 145.0; over a
      wall (no pane behind) 165.4 | 79.7 | 164.9, 161.1 | 90.8 | 160.6,
      191.2 | 92.1 | 190.1, 150.5 | 71.4 | 149.6. From the west the baked
      view draws the window's pane — white, lit by its unshaded sun — over
      the curtain (its sort puts the pane last there), K its clear pane
      under it: the rest of that 43.
    - the same, K first pressed at night: K before (R−B) 102.6, 97.8,
      95.2, 95.5 where the baked view has 45.3, 45.2, 40.4, 28.6; K now
      45.5, 45.3, 44.4, 41.2 and every level as when first pressed by day.
    - night, lamps off: 83.3 | 0.2 | 83.3, 83.5 | 0.0 | 83.5, 99.8 | 6.5 |
      99.7, 76.0 | 2.9 | 78.3 (first pressed at night, K before 43.5, 44.5,
      54.4, 42.9, orange).
    - night, the default lamps: 98.7 | 79.7 | 96.3, 102.2 | 83.6 | 99.8,
      124.7 | 135.6 | 124.7, 88.9 | 99.1 | 91.2.
    - day, every lamp on: 94.1 | 106.1 | 90.0, 95.1 | 109.3 | 91.1, 130.2 |
      146.6 | 122.5, 122.8 | 116.3 | 72.7 (over a wall 87.7 | 131.4 | 87.0).
    - What is left is what shows through the sheer: K's room behind it and
      its clear pane. Made opaque for a test, A's curtain by day with every
      lamp on is 79.3 baked and 79.3 in K. The baked view's own curtain at
      B's A2 living room's west end at night differs from load to load by
      up to 2 levels (86.7–88.9; K's 91.2 in both): the view's, not K's.
    - Nothing else moved: four rooms with no curtain (A2's twin bedroom,
      the upper south bathroom, B's A3 twin bedroom, C2's bedroom), by day
      with the lamps off and at night with the lamps off and on, K and
      baked, pixel for pixel the build before's; in the curtains' rooms,
      outside the curtains and 6 px round them, by day 45–4,667 pixels
      over 2 levels of 184,000–217,000 (0–912 over 8: slivers of a glazed
      door's bronze frame and a lacquered column's side, brighter — not the
      curtain's shadow: its casting turned off in the build before leaves
      them; most likely the room probe, which now holds the curtain as the
      baked view draws it; not looked into further), at night 0–14. The
      editor (plain and `?preview=1&scope=all`) and a visit with K never
      pressed: as the user's build, but for the figure walking on the road
      and single pixels of ±1–3, as every load differs from the last.
    - What it costs: the curtains' call is a render call more, and every
      call into the view's multisampled picture resolves it — 0.7–1.0 ms of
      a whole frame at 2560 × 1440 while a curtain of a room shown is in
      sight (A's upper south living room by day: 20.8 / 21.0 against 20.1 /
      20.2 before; the call made empty costs the same); none otherwise.
  - *A copy of a scene's material is made as the material is*, and is no
    part of the scene after (`roomLive`): nothing that walks the scene's
    materials by the time of day or a switch reaches it again.
    Sky.glowIndoors' glow is the one such change a copy's source can wear
    (it skips what the probes light, a door's tint and K's own; LiveBulbs
    drives K's own glass; Sky.share and Sky.glaze are run again over K's
    own sets): `withoutGlow` (Sky.js) gives a copy its material's own glow
    instead (`GLOWING`: what wears the glow now) — RoomBakeLight.material
    and LiveRoom.copyOf. On Ladonia at night the glow is on
    `curtain_linen` (its four meshes) and on `trim_white` (224 hidden door
    casings), and on nothing else K copies; Wrenfield has no sky of its
    own and no glow.
  - *The sun* is the bake's (`lightRig`: its colour, strength and
    direction from the variant's `sun`; Wrenfield's moon too), and **every
    mesh casts for it** that cast in the bake (`makeCasters`): with the
    editor's flags ceilings cast nothing, and the sun shone through A1's
    living room's ceiling onto its orange wall in a patch the bake has
    not — the editor shows it too.
  - *The lamps* (LampPool's `whole`, `lightsOf`): the bake's own, where
    they hung, each a point light with a shadow on every side (a cube of
    six 512² maps; reach and far plane 20 m), a switch's all together or
    none, the visitor's own room's first, then those whose light they see;
    as many as the step's lights with shadows (two at the top step, one at
    Balanced) and none without. A switch with more lights than that —
    Ladonia's living rooms: a ceiling light, ten spots and two lamps on
    one switch — keeps the bake's light, all of it; so do the others.
    **Each as strong as the bake's probes measured it** (`strengths`,
    `measure`, made once a switch, the first time it is lit live): at each
    probe of the switch's own room, on each of its six ways, the switch's
    light less its bounce (`full` − `indirect`) against a point light's of
    the light's watts over 4π, unshadowed, Lambert — where that light gives
    92% or more of what the switch's lights would there (`ALONE`) and faces
    the way (`FACING`); the middle of the ways it lights (over a tenth:
    not in a shade), from 12 ways (`ENOUGH`); a light measured at fewer
    takes its kind's middle in the bake (`kindStrength`), else `LAMP` 0.5.
    Ladonia's bake: 79 of its ceiling lights measured 0.48–0.51 (each a
    sphere 3 cm across hung 1.2 cm under the ceiling — a sphere light half
    in the ceiling gives half, the same straight under it as level with
    it, colour for colour; the other 14 take that middle, 0.50), 24 of its
    lamps 0.76–1.00, middle 1.00 (the other 69 — the living rooms' floor
    lamps, mostly in their shades — take 1.00); Wrenfield's
    pendants, hanging 0.42 m under the ceiling, 1.00, and its three lamps
    0.36–0.58. Until 2026-10-15's second fix every lamp was drawn at 0.5,
    the first measure (made on pixels, 0.50 in A1's bathroom and hall, the
    bedrooms' 0.52–0.60 being their lamps): a bedside wall lamp at half
    left A1's bedroom 117.6 for the bake's 124.0 at night (18.7 under in
    the third of the frame round the lamp), now 124.0; and Wrenfield's
    pendants at half its rooms 2–9 levels under (hall 191.5 for 195.8, now
    197.1). (The editor's lamps are W/4π as before.) Their glass and bulbs cast
    nothing (the bake's block no light). **Each shades as softly as the
    bake's lamp is big** (`SOFT_LAMP_GLSL` in RoomBakeLight.js: the
    shadow's `radius` is the lamp's own size, negative — 3 cm on Ladonia's
    ceiling lights — and the rooms' shaders filter by it, percentage-closer
    soft shadows over the cube: a first look, the way to the point and four
    round it, settles most of a room — all clear, lit; all blocked, shade —
    and only between them 8 taps for the blockers, out to as wide as
    anything 0.2 m or more from the lamp could shade the point from, then
    14 over the penumbra that gives, each held to the receiver's own plane
    so a wall at a slant does not shade itself; a surface facing away from
    the lamp takes one tap. With 12 and 20 taps and no first look it was
    +4.6–5.0 ms a frame over the bake with two lamps live, now +2.9–3.4,
    the first build's +1.1–1.6); three's own nine taps a
    texel or two apart threw a hard-edged wedge across A's north bathroom's
    wall from the roof stair's box, where the bake has a soft gradient, and
    a sharp disc under C2's shower head. Their cubes are drawn of what is
    drawn live alone (`lampCasters`: of each caster, the runs of the rooms
    shown and their openings, made again when those change; the snapshot's
    culled faces all) — of the whole house, six times over, a door's swing
    was 31–53 ms frames every 0.1 s — and the sun's map in a pass of its
    own over the whole house (`shadowPass`). The people round the property
    are among what moves for them.
  - *The exposure* is the baked view's own meter's (`drawn.metered`:
    `Realism.updateBaked` meters the room as it meters the bake; it reads
    the frame, which is now the bake's light; the rooms next door are not
    brought up, `gain` 1). Standing still K changes no reading as it is
    pressed; but once the rooms' light has stood still, whatever sets it
    moving again — a switch fading in or out, a lamp handed on, the probe
    taken again — has the meter read the frame again once it stands
    (`drawn.light`, counted in `LiveRoom.update` from RoomBakeLight's
    `moving`, in `LightMeter.lightKey`; for `STIR_MOST` 2 s at most). Read
    in the middle of a switch's fade, a lamp turned off and on again
    standing under it left the exposure at 1.70 where the bake's is 0.85 —
    B's upper north bedroom 155 levels for 124 — until the camera moved.
    The probe is taken again after a switch once the bake's own fade has
    ended too (`!bake.moving`): taken at once, as the pool of lamps was
    settled for a switch of the bake's, it held the room half lit.
  - *Switches* as the baked view's, by day too, in a space without a sky
    of its own (no `dayOn`).
  - *Not drawn in the bake's light*: a bake without its light apart (an
    old one; "static" ones offer no K), a device where the view's light is
    not resolved, `?lightmap=rooms`, `?merge=off`: as before (the bullets
    above).
- **The room probe** is where most of its wrong pictures came from:
  - *It has real bright patches, and must keep them*: a ceiling fitting
    lit by its own lamp from two centimetres (51 texels up to 3,648 — a
    fifth of that face's light), the lamp's glare on tiles, the sun in a
    pane. A cap of 16 on every texel made bathrooms 5–7 levels dark. What
    a view lit live does not have is the single texel, or the thin dash:
    the rooms' faces are drawn into a multisampled picture and one sample
    in four at a triangle's edge can come out saturated (+7 levels in a
    bedroom), and a pane in a room or a villa that is still the bake's
    glints under the baked view's unshaded sun. So the copy onto the face
    (`through`, `FACE_SPIKE`) brings a texel down to four times the
    brightest of the eight round it, plus one, and to the third brightest
    of the eight four texels off (`reach`): what is bright over several
    texels each way stays.
  - *A room come into from out of doors was 76 levels too bright, and it
    was not a lamp* (the review of 2026-10-13 took the bathroom's lamp
    behind its shut door for the cause; that lamp's light put out by hand
    changes no pixel in ten directions). The probe, taken as the visitor
    stood in the doorway, held a dash of twelve texels of 11,821 — the
    baked view's sun in a pane of the villa across the garden — each with
    one as bright either side, which the eight-neighbour rule let by:
    that face's mean 2.08 where the unbaked view's is 0.05. Held to
    `reach` too, the face is 0.063 and the other five the same to four
    digits. **To tell a lamp from a probe**: put the lamp's light out
    (`slot.light.intensity = 0`) and draw the view again *without*
    `world.update()` — a retake of the probe moves it to where the visitor
    now stands, and that alone took 70 levels off.
  - *It is taken again when the glass changes its view* (`sky.glassDark`):
    a room made ready as its visitor reaches the door has its probe drawn
    through its own panes as they are seen from out of doors — dark,
    mirroring the sky — and kept it, the frame 13–19 levels under until
    its visitor had gone 2.5 m further in. The flip now marks it stale,
    and it is taken again once the visitor has been in for half a second;
    likewise half a second after something by the rooms has stopped
    moving (`probeWait`: taken during a door's swing, with the sun's map
    and the lamps' drawn every frame of it, it was 35–37 ms three frames
    running). Walked in from out of doors, the frame's mean at the showing
    frame: 188.3 → 98 → 112.2, the unbaked view's 112.4.
  - *The pool of lamps counts for nothing while no room is shown*
    (`lampsFor`, `lampsIn`, `LampPool.wouldLight`): nothing hands the
    lamps round while the visitor is out of doors or a room is being made
    ready, so the pool stayed "in the light" as the last rooms shown had
    left it, and the shadows and the probe drawn ahead of a first show
    were drawn under the last rooms' lamp, still lit where it hung. A
    first show, and what is drawn ahead of it, now has the pool in the
    call's light only if a lit fitting would be in sight from where the
    visitor is.
  - *What it and the windows see out of doors is the bake's*: the garden,
    the terrace and the house next door through a window or an open door
    are the baked view's, lit by its unshaded sun — the one difference
    from the unbaked view that is left by construction (a hall with a
    glazed front door 1.9 levels dark, a living room over a terrace 3.8
    bright; Wrenfield's neighbour green-grey where the editor's is grey).
- **Where it is, and is not** (`Utils/device.js`): a view drawn "baked", on
  a device rated for the Balanced step or more, at the Balanced step or
  above (`ROOM_LIGHT_STEP` 2), not driven by touch (`roomLightAllowed`).
  Not in a view published or chosen fully static, nor one opened at the
  slider's two lowest steps: the row is then absent, or there greyed with
  the reason (`roomLightWithheld`: "step", "chosen" — kept on purpose, it
  is how a visitor learns the view can do it; K there says the same
  line — on a touch device, one rated under Balanced or a version
  published fully static there is no row and K does nothing,
  `frontend/index.js` `toggleRoomLight`). From above it is suspended
  (`roomLight.hold`, by `World.lightFromAbove`): its row says it waits,
  and K pressed there turns it off if it was on, or says it is for
  walking through; out of doors it waits for a room. `roomLight.end(why)` turns it off at once
  with a notice — the frame-rate guard's, which judges no frame while a
  room is being made ready (`roomLight.busy`). A throw in a call of the
  rooms' turns it off with a word instead of taking every frame with it.
  - Script: `world.roomLight.set(on)`, `.toggle()`, `.end(why)`,
    `.status()` — `supported`, `withheld`, `on`, `state`: off, withheld,
    step, above, outdoors, coming, lit; `room`, `groups`, `zones`, `sight`
    (`seen`, `ahead`, `beyond`), `lamps`, `exposure`, `stats` (`installs`,
    `prepares`, `handovers` and LiveRoom's own) — `.most`, and the events
    "change", "hint", "ended". In a test, drive frames until
    `status().state === "lit"` — with the visitor in a room: before that
    it is "outdoors" and nothing is made (2026-10-14, Wrenfield's bake on
    the new build, the collider set down in the living room as `walk.js`
    sets it: "coming", then "lit" 72 driven frames and 0.47 s on, one
    group of two rooms, 46 openings found; from above "above", off
    "off"). In the
    link, a developer's: `?roomlight=on` (asked for as the view opens,
    which a visitor's never is) and `?roomlight=off` (not offered, to
    compare).
- **What cost time to find** — each a rule for whoever changes it:
  - **A pipeline is per kind of picture.** On a Mac the GPU makes a
    program's pipeline when it first draws with it, into each kind of
    picture: the probe's faces, drawn straight into the cube, made one
    for every program in sight (0.6 s in the first face) — they are drawn
    into a picture of the view's own kind and copied (`through`,
    `copier`); what is seen through is drawn twice more a frame into
    N8AO's two transparency pictures, another kind
    (`Renderer.aheadThrough`; all three in one frame were the frames of
    0.22–0.24 s of a first switch-on: each has a frame of its own now);
    and a program drawn ahead but culled has drawn nothing (`construct`'s
    `around` unculls).
  - **three builds a depth program for the lights of the call it is used
    in, as the last render of that call left them** (the light counts are
    in every program's key, lit or not; it sets a call's lights up after
    its shadow pass): the map drawn ahead in the rooms' first call ever
    was drawn under no lights, and the showing frame built the shadow
    pass's shaders again for its sun (38–105 ms). `primeShadows` makes the
    call twice — once with no map due, then with every map due and
    everything that casts unculled — at staging and before the lamps first
    come in or go out.
  - **A manual `matrixWorld` does not survive a frame** in r163: every
    object whose `matrixAutoUpdate` is on forces its children's update.
    Put the world matrix in `matrix` (with `matrixAutoUpdate` off) under an
    identity parent. And **`eye.copy(camera)` copies `matrixAutoUpdate`**:
    the rooms' camera, set by its matrices alone, was then worked out from
    a stale position — the room drawn from where the visitor stood when it
    was staged (`sight()` sets it field by field).
  - **Hiding an object hides its children**: what the view has never
    drawn is left out of a probe's face (`undrawn`) by taking it off every
    layer; hidden, a door leaf took its pane of glass with it and a living
    room's probe came out ten levels dark.
  - **Anything that walks the whole scene's materials finds the rooms'**,
    which wait in the scene from one showing to the next:
    `Sky.glowIndoors` gave every one of them an indoor share of the sky at
    night, and a room first shown by day was 23 levels over the unbaked
    view at night for the rest of the visit. `userData.roomLive` is left
    out there, as it is by `Sky.share` and `ProbeLight.dress`: check a new
    walk of the scene's materials for that flag.
  - **Put materials back in the order opposite to the one they were put on
    in** (`construct`'s `around`): a pane is in a batch twice, once for
    each material it is drawn with, and restored in the same order it was
    left with the room's material for good.
  - **A walk with the camera posed where the eyes are must be in
    first-person mode** (`e.camera.setFirstPerson()`): in third person
    the visitor's own figure is taken up by the live room, fills the lens,
    and has the sun's map drawn every frame of the walk (+3.5 ms a frame:
    a first set of timings was thrown away for it).
- **Measured** (M4 Pro, step 4, 2560 × 1440, the pane hidden):
  - *In the bake's own light* (2026-10-15; Ladonia's bake 20261012T114849Z
    and Wrenfield's 20261001T143211Z; frames at 1280 × 720, the people
    hidden but in A3's living room, the wind still; each room's own pixels
    by the mask of where each pixel's nearest surface is, K off; baked |
    K before (the user's build, :3117) | K now). Warmth is the mean over
    the room of (R − B)/(R + G + B) and of G − B; shade the share of the
    room's pixels under a fifth of its mean. The mean difference from the
    baked frame, before → now, over nine of Ladonia's rooms (A1's living
    room with its kitchen, hall, bedroom 2 and bathroom, A3's bedroom and
    its living room with a woman on the sofa, A2's glazed living room, the
    north first-floor living room, the south first-floor bedroom 1):
    - night, the default lamps: level 13.1 → 3.0, (R−B)/sum 0.086 → 0.014,
      G−B 13.3 → 0.9, the same blurred over 32 px 0.086 → 0.011, shade
      3.4 → 1.3 points. E.g. A1's bedroom 2 101.6 | 111.4 | 100.6 and
      0.254 | 0.139 | 0.253; A1's bathroom 93.3 | 127.9 | 95.4.
    - night, every lamp off: level 3.4 → 0.8 (A2's living room 19.5 |
      12.6 | 21.3, A3's 19.1 | 8.6 | 19.0, A1's hall 6.5 | 1.0 | 6.7; the
      rest 0–4 in all three).
    - day, lamps off: level 38.9 → 8.6, (R−B)/sum 0.062 → 0.042, G−B 5.4
      → 0.6, shade 11.3 → 8.5; but for the windowless bathroom and the
      north living room's two door leaves (below), within 0.9–1.9 levels
      in six rooms and 10 under in A2's glazed living room, (R−B)/sum
      within 0.023 (before: +19 to +42 levels, 0.03–0.11 less warm).
    - day, every lamp on: level 40.2 → 2.8, (R−B)/sum 0.100 → 0.019, G−B
      7.3 → 0.8, shade 2.4 → 0.7.
    - Wrenfield's living room, kitchen, first bedroom and bathroom: night
      lamps on 40.0 → 4.9 levels, 0.096 → 0.018; off 0.2 → 0.0; day off
      13.7 → 1.3, 0.105 → 0.000; day all on 69.2 → 4.7, 0.047 → 0.015.
    - What still differs, and why: by day A1's windowless bathroom with its
      light off is black (1.6 for the bake's 45.1: the baked view's shower
      screen and chrome reflect a white studio at the meter's ×32); door
      leaves are their true oak, tan-pink, where the baked view draws them
      nearly white (its leaf takes the outdoor sky on top of its probes):
      the north living room's view 88.5 for 103.0, warmer; A2's glazed
      living room 95.6 for 105.8 by day; A1's living room at night a little
      less warm (0.141 for 0.163: its true white cabinets and glossy floor
      reflect the room); the live sun's and lamps' shadow edges are crisp
      where the bake's are soft (the lamps' soft since the fixes below).
    - Calibration of the lamps (above): with the pool's lights in and then
      out (every switch the bake's), A1's bedroom 2 at night 100.6 against
      102.1 (median pixel ratio 0.99), its bathroom 114.4 against 114.0.
    - A lamp turned off and on standing under it (A1's bedroom, night): 104
      → 2 over 15 frames and 2 → 135 over 30, every frame further than the
      last; after standing, 136.5 → 2 → 136.5 at the same exposure.
    - The fixes after its review (2026-10-15; the review's own rooms: ten
      of Ladonia's in villas A, B and C, four of Wrenfield's; baked | K as
      first built | K now):
      - A lamp turned off and on standing under it, K on: B's upper north
        bedroom at night 124.5 at ×0.85 → 0 → 155.4 at ×1.70 as first
        built, now 124.5 → 0 → 124.5 at ×0.85 throughout (the baked view
        130.2 → 0 → 130.2 at ×0.85); C1's living room 118.1 → 3.5 (×1.22)
        → 117.7 at ×0.85 (baked 115.8 → 3.9 at ×1.32 → 115.8); A3's twin
        bedroom by day 132.3 at ×1 → 99.6 at ×31.9 → 132.3 at ×1 (baked
        130.7 → 95.2 at ×29.7 → 130.7). A's north bathroom at night comes
        back at ×1.25 where it was shown at the bake's ×1.34 (104.2 →
        101.1): read again, its own frame, with the mirror reflecting the
        lit room, is brighter than the bake's.
      - Wrenfield: no console warning in sixteen showings of its rooms
        (seven at each before).
      - The lamps' shadows soft: A's north bathroom, the share of steps
        between neighbouring pixels of over 12 levels where the roof
        stair's box shades the wall, at night 4.20% | 5.99% | 4.35%, the
        tenth largest step 3.8 | 6.6 | 5.0 levels; C2's bathroom at night,
        the share of the room under a fifth of its mean (the shower head's
        disc) 2.8 | 6.5 | 1.7.
      - Metals at night: A's north bathroom's washer 52.7 | 9.0 | 79.3
        (the editor's look, K before: 81.9), the side of the frame with
        its mirror 83.2 | 85.3 | 140.3 (138.7), its tap 78.7 | 75.7 | 98.1
        (117.7); the room 92.5 | 92.2 | 104.2, (R−B)/sum 0.172 | 0.246 |
        0.183; C2's bathroom 99.4 | 98.7 | 103.0, 0.211 | 0.229 | 0.207.
      - Mean |difference from baked| over the ten rooms, first → now:
        night, the default lamps, level 2.6 → 4.1 (the two bathrooms
        above), (R−B)/sum 0.014 → 0.006, correlation 0.987 → 0.970; night
        off, day off and day all on the same to 0.1 level; Wrenfield's
        four conditions the same to 0.1.
    - Standing (render and a pixel back, median of 60, two rounds; the
      machine's load 3–4): K now over the bake +2.6 (A1's bedroom at night,
      two lamps live), +2.0 (A1's living room at night, one), +3.4 (A2's
      living room by day), +2.9 (A1's bedroom 2 by day) ms; K before in the
      other tab +3.3, +4.2, +3.8, +3.0.
    - A walk through A1's bedroom, hall, bathroom (its door opened), hall,
      living room and bedroom 2 (its door opened) at night, 645 frames:
      median 21.6 ms, p95 29.1, 58 over 25, 8 over 33, none over 50, the
      longest 42 (K before: 21.9, 26.9, 57, 2, 0, 37); no step of the
      frame's level over 8 but where the view turned. With the lamps' cubes
      of the whole house (before `lampCasters`): 15 over 33, one of 53 ms.
    - The first press at night on a fresh load (A1's bedroom 2): lit after
      65 frames and 1.75 s, the longest frame 40 ms, the room 101.5 baked
      → 100.5 live with nothing between (K before: 104 frames, 2.7 s, 41
      ms, 101.5 → 111.4).
    - Unchanged: K never pressed, three poses by day and three at night on
      fresh loads, four byte for byte the user's build's, the fifth and
      sixth (A3's living room, people shown) apart only on the woman (her
      clip's phase) and the trees through the window (the species' order);
      the editor (:3114 against :3116), four poses, plain light day and
      night 8 of 8 byte for byte, `?preview=1&scope=all` 8 of 8 with the
      flora hidden (with it, 5 of 8; the rest in trees' pixels, max 15);
      the unbaked publish 20261014T022629Z day and night 8 of 8 on loads
      with the flora hidden from the first frame.
  - *What it costs* (the final sitting, 2026-10-14, Ladonia's bake
    20261012T114849Z): standing, +1.7 to +3.7 ms a frame over the same
    room baked with its doors shut, +3.0 to +4.2 with a door open to the
    next room (two groups live), +2.8 with four doors open (six groups
    live). A 19.5 s walk through four rooms opening three doors: median
    14.3 → 17.3 ms a frame, 17–22 of 1,168 frames over 25 ms (the bake
    alone: 1–2), 2 over 33, none over 50 (at night 14.9 → 17.5, 23–24
    over 25 where the bake has 2–4). What a frame costs follows what
    is in view, not how many groups are live. At step 2 (1920 × 1080,
    2026-10-13, a walk through six rooms): 10.8 → 12.5.
  - *What is the bake's in view*: through open doors no baked room of the
    flat is seen — 0 px of baked room in 14 of 16 stills (1 px in two),
    and at most 26 px of 57,600 in any frame of the walk. Still the
    bake's: the garden through a door or a window, and the neighbouring
    villa's rooms across the garden.
  - *K off, and K never pressed*: off, at four poses with 1, 3, 7 and 8
    groups, 0 of 3,686,400 pixels from the frame before K, the exposure
    equal; WebGL buffers after each of five K on/off, 6,109 every time.
    Never pressed, the public view is the build before's: 28 of 28
    pictures identical to the pixel, times within 0.3 ms.
  - *Against the unbaked view* (2026-10-12/14, before the night's share
    — at night the live room is now the bake's darkness, not the unbaked
    view's, below; by day it is as here; the reference is the
    version's unbaked publish, or the editor's realistic preview with
    everything shown — means within 0.1 of each other; probes taken
    afresh in both): the room's own pixels by day within 1.5 levels at 50
    of 57 poses, every bathroom with a shower's screen 0.0; at night 8
    rooms within 0.2. Whole frames through open doors, live − unbaked: by
    day hall → bathroom −4.2 (its group was 3.7 dark standing in the
    living room), a hall through two open doors −1.0, a corridor through
    five +0.2, a stair looked up from its hall −2.0; at night within 0.3
    but one at −1.9. In the final sitting (2026-10-14, eight views through
    two to five open doors, whole frames at 640 wide, the share of pixels
    over 8 levels after each): by day a corridor through four doors 0.0,
    0.6%; the other way through five +0.6, 1.3%; to the bathroom and the
    stair +2.3, 6.6%; a corridor +0.9, 2.2%; the south hall to its window
    −0.5, 9.2%; its stair −0.1, 0.1%; A1's hall through two doors −1.1,
    6.4% (the glazed entry door beside it darker live); A1's living room
    out of its open terrace door −5.4, 22.1% (the terrace is the bake's);
    at night all eight within 0.8, 0.1–7.3%. The bake itself in those
    views by day: 28–48 levels under the unbaked view upstairs. Wrenfield
    (the bake of 2026-10-01): 0.0–0.4 in six
    rooms of seven, whole frames within 1.1 in ten views.
  - *At night, the bake's light* (2026-10-15, the six ways and the
    lightmap's measure; Ladonia's bake 20261012T114849Z and Wrenfield's
    20261001T143211Z, step 4, frames at 1280 × 720 of 2560 × 1440, the
    people hidden; the room's own pixels by a mask of where each pixel's
    nearest surface is, K off; baked | K before (the user's build, :3117)
    | K now): villa A's 32 rooms and both A3 closets with every lamp off —
    now 0–0.5 levels in 25 rooms, A1's hall 1.4, the south first-floor
    living room 2.5, the loggia 6.5, A2's and A3's glazed living rooms
    12.6 and 9.0 (dim and warm, as the bake has them at 19.5 and 18.3),
    villa B's A3 closet 7.0 (baked 3.3; it was 95.5 at the probes' full
    share) and villa A's 5.3 (baked 5.1); before 24–122; baked 0–7 but
    those two living rooms and A1's hall, 33.6 (a door leaf the bake
    lights from its probes and the outdoor dusk — dark live, as the hall's
    walls are). Nothing is lighter than the bake by more than villa B's
    closet's 3.7. Every lamp on as the night starts them (93), eight
    rooms: K now = K before to 0.1 level in all eight (131, 111.4, 110.6,
    127.9, 139.3, 122.8, 128.5, 144.7); at 1280 × 720 no pixel over 2
    levels apart in seven (at most 1), 7 pixels (at most 3) in the eighth.
    A1's living room's ceiling light alone turned off and on standing
    under it: 128.4 → 0.2 and back over 15 frames each way, every frame
    further than the last (before 129.5 → 68.7 → 129.5); lit, 1.1 under
    K before, as asked — the hall is open to it, and the hall's own light,
    off, is 7% of that space's lamps' power (its glow 0.929).
    Beside a lit room through an open door: A1's hall by its lit bathroom
    19 (baked 41.1, before 84.5), bedroom 2 by the lit living room 1.2
    (21.5, 64.6), C1's hall by its lit bedroom 19.6 (19.4, 75.6); the lit
    rooms beyond the doors look as K before draws them. By day six rooms:
    K now, K before and the baked view each the same to the pixel in both
    builds. K never pressed (fresh loads, three poses by day and three at
    night): every frame byte for byte the user's build's. Wrenfield's four
    rooms with every lamp off: 0–0.2 now and before, the bake 0–0.5 (its
    lightmap read too, the one-scale way: 19 rooms). The first press at
    night on a fresh load (A1's bedroom 2): baked 2 → live 0 with no frame
    between lighter than 2; lit after 125 driven frames and 2.9 s against
    81 and 1.9 s before, the slowest frame 46 ms against 27 (the
    lightmap's read is 274–416 ms of it in 16–17 slices; the rest not told
    apart: new shader text, built once). Not timed standing: three texel
    reads more a pixel of the rooms' surfaces at night. The editor (:3114,
    the scratch copy of the scenes) against the user's build (:3116),
    Ladonia, A1's living room, A3's bedroom, the north first-floor living
    room, by day and at night: under the plain light and in
    `?preview=1&scope=all`, all twelve frames byte for byte the same; the
    unbaked publish 20261014T022629Z, the same three poses, day and night:
    five byte for byte, the sixth 142 pixels of 921,600 at most 7 apart in
    the trees' crowns seen through a window — the two loads' trees in
    another order (olive_1/olive_3, oak_1/oak_4 swapped); with the flora
    hidden in both, byte for byte. The unbaked view and the editor still
    light a dark room at night with the grey share of the dusk (44–84), as
    asked.
  - *The first time*, on shaders the browser has never built (four loads,
    Ladonia's living room by day): lit after 5.7–6.1 s, the showing frame
    32–38 ms, the longest 146–161 ms, 29–31 frames over 50 ms — each lit
    program's first draw is 57–161 ms of the GPU's own, one a frame, and
    nothing in the page makes one shorter. With shaders built: 0.24–0.28
    s, worst frame 30–46 ms.
- **Still short**:
  - In the bake's light (2026-10-15): a switch with more lights than the
    pool's lights with shadows is all the bake's (no moving shadow under a
    living room's lamps: its ceiling light, ten spots and two lamps are one
    switch, and the top step has two); a door leaf is its true oak, not
    the baked view's white; a dark room keeps nothing of a studio's
    reflections; by day a window's frame is the true dark bronze and its
    pane clear glass reflecting the room, where the baked view draws its
    metal and its glass live by the open sky and its unshaded sun at the
    room's exposure — white frames, a white veil over the garden (A3's
    twin bedroom by day: the frame 24 levels for the baked view's 217;
    the bake's own probes inside that window measure 0.002–0.02 a way,
    the open garden's 0.24–0.31) — and a mirror, a washer or a tap
    reflects the room, not the baked view's white studio (A's north
    bathroom by day 71.4 for 95.7); a window's pane at night shows the lit
    room faintly and the live lamp's glint, where the baked view's is
    black; thin faces take no live lamp, and so no moving shadow;
    a person lights by the probes round them, eased; the second lightmap
    is 64 MB at 4096², from the first press to switching off; a sheer
    curtain is the baked view's own but what shows through it is K's —
    its room and its clear pane, where the baked view has its white veil,
    which from some places it draws over the curtain (B's A2 living room
    from the west by day 145.0 for 187.9, the curtain over a wall within
    1.1) —, and the curtains' call costs 0.7–1.0 ms a frame while one is
    in sight; the room probe's faces draw a curtain under the room's
    glass. Not seen in
    a visible tab, on another GPU, at step 2 or 3, in villas B and C but
    two rooms, Wrenfield walked, or with two visitors.
  - Where the bake cannot light them (below, of before):
  - At night (2026-10-15): a room with its lamps off is lit evenly by
    its bake's six ways, where the bake pools the light — by the glazing,
    by a door to a lit room — and the night's grade (contrast 1.16 round
    the middle, `PostProcessing`) crushes an even dim light to black
    sooner than a pooled one: K's dark rooms come out 0–6 levels under the
    bake's, A2's and A3's living rooms 7–9, A1's hall 32 (its door leaf;
    the baked view lights a leaf by its probes *and* the outdoor dusk). A
    lit room's spill into the next is a room's figure, not a pool by the
    door (bedroom 2 by the lit living room 1.2 where the bake has 21.5).
    Lamplit rooms are the editor's, as K always drew them: −14 to +35
    levels from the baked view, whose meter lifts a lamplit room. The
    unbaked view and the editor still light a dark room with the grey
    share of the dusk (not changed, by the user's word: no bake to
    measure by there).
  - **The indoor sky's light is upside down** (found 2026-10-15, not
    changed: it changes every view lit live, by day too): `Sky.js`'s
    `indoorLight` copies the HDR into a `DataTexture`, whose `flipY` is
    false where RGBELoader's texture has it true, so the indoor PMREM (and
    the night's cooled one, the scene's environment at night) has the sky
    below and the ground above — at the night's share (0.288) a face
    looking up is lit 0.12, one looking down 0.29, where the HDR has 0.32
    up and 0.14 down (drawn by three on a white sphere). Floors are lit by
    the ground, ceilings by the sky.
  - Seen from no room, a room is the bake's: come into from out of doors
    it changes in one frame once its visitor is in it; day and night, the
    slider and the view from above send every live room back to the bake
    for 8–43 frames.
  - By day stairwells are 10–22 levels over the unbaked view, some rooms
    evenly 5–9 off, an open leaf darker: cause not found. The glazed
    entry door beside flat A1's hall is darker live than unbaked, by day
    (6.4% of the frame over 8 levels) and at night (7.3%, 3.2% over 24) —
    the final measurement's, not looked into.
  - What is seen out of doors is the bake's, and the rooms' probe takes a
    little of it. Metal the bake keeps live that is no room's and stands
    in no opening of a room's wall is lit by the baked view's sun without
    the house's shadow, K or no K.
  - **Wrenfield's bake of 2026-10-01 wants baking again**: its doorways'
    reveals and some wall faces are zoned to the room behind them (the
    zoning before doorway faces were cut at the wall's middle) and stay
    baked in a live room. Villa C's first-floor hall has a wall's end the
    bake files under "outside" and lights black, with K off too: the
    bake's zoning, to be mended there.
  - First frames of 0.2–0.8 s where a room's shaders have never been
    built by the browser, and again whenever a door to a room with new
    materials is neared; the first look into a flat never seen is the
    baked view's own long frame (126–148 ms: 376 geometries and 30
    textures sent in one), with K or without.
  - Not seen: a visible tab at the display's rate, another GPU, a phone
    (not offered there), third-person walking, a second visitor, step 3,
    villas B and C walked, Wrenfield walked (its poses were stood in), a
    stairwell walked with K on since the flights' change, and — "a group
    waiting behind a shut door is looked at while it waits" — the walk
    whose doors showed a room a frame late (5–7 of 21 by day) was not
    walked again after that change.
- **Measuring it**: an unbaked reference's lamps may be in or out of the
  scene's light by where the tab has been (the pool leaves 3 s after
  nothing lit is in sight), and its probe is kept until the camera has
  moved 2.5 m: move both probes (`probe.at.set(Infinity, 0, 0)`) before
  every frame compared. Two runs of one cell that differ by 5 levels are a
  state, not noise: read the pool (`rig.pool.lit`, each slot's fitting and
  level), the probe's faces, and what each pane is drawn with, in both.
  To count the bake in view, draw where each pixel's nearest surface is,
  once with everything and once with the house alone, and count those
  whose nearest is a baked surface of a room under a ceiling that is not
  shown live (what is behind glass does not count). A walker that presses
  every door within reach at once measures a visitor nobody is: two doors
  opened in one frame are two rooms let in in one frame. To time a first
  switch-on honestly make every shader new: wrap `gl.shaderSource` and
  add a used term at the end of each main. The tools were scratch and are
  gone with it.

## Baking

- **Commands.** A draft, in the background, against a scratch folder:
  `PUBLISH_DIR=<scratch>/published node scripts/bake-public.mjs <id>
  --version <V> --samples 32 --size 1024 > log 2>&1`; the final is `npm run
  bake -- <id>` (512 samples at 4096). Its other words — `--margin`,
  `--full`, `--static`, `--variants`, `--no-switches`, `--no-doors`,
  `--dry <file>`, `--debug` — and the developer's `BAKE_…` switches are
  listed in `reference.md`. One bake at a time (`.bake-lock`: Blender takes
  the whole GPU). Print the resolved `PUBLISH_DIR`
  (`server/publish/store.js`) before a first bake and stop if it is not
  the folder meant: a bake updates the version in place. Run it detached
  with nohup and poll the log — a background shell stops at 2 h, a
  foreground command at 10 min.
- **Times** (M4 Pro). Wrenfield — a house of 19 rooms with 22 switches and
  17 doors — final: 27.7 min on a quiet machine (1,664 s), 28.7 with a
  browser drawing on the same GPU for its first ten minutes (1,719 s); the
  committed code took 34.9 (2,093 s). Published "Fully baked", 20 min
  (1,201 s). The Publish panel's draft, 128 samples at 2048: 7 min (418 s;
  10.4 min with the committed code). With the committed code five settings
  fitted `555 s + 491 s × (size/4096)² + 1,079 s × sampling` (sampling 1 =
  512 samples at 4096: 32 at 4096 19.1 min, 512 at 2048 17.9, 128 at 4096
  22.7) — a draft is nearly all fixed cost. Ladonia — three buildings, 93
  switches, 84 doors — took 3 h 22 min on 2026-10-04 and was expected to
  take about two hours with this code, by arithmetic ("What a bake's time
  goes on", below). The user's own final bake of it on 2026-10-12 bears
  that out, by its files: version 20261012T114849Z `publishedAt` 11:48:50
  UTC; its folder `bake-mv57vs13`, whose name is the time the bake's
  script started in base 36 (`scripts/bake-public.mjs`: 12:17:13 UTC);
  `bakedAt`, written as it ends, 14:09:10 — 1 h 52 min, begun 28 minutes
  after the publish (5.05 cm texels, margin 4). Whether the Publish panel
  or a terminal started it the files do not say.
- Drafts are blotchy and their small pieces bleed: judge light levels and
  directions in one, not grain, trims, pickets, sun-patch edges or contact
  shade. What each setting is good for (sixteen variants of Wrenfield,
  2026-10-10, the committed code): out of doors 32 samples is the same
  picture as 512; under lamps 128 looks as 512 on walls, floors and
  worktops, and 32 breaks where a lamp barely reaches and on vertex-lit
  pieces; by day indoors 512 is clean at walking distance, 128 leaves soft
  mottle on beds, worktops and one-window rooms' walls, and 2048 is better
  only close up for four times the sampling. A 2048 atlas for a house (5.9
  cm texels: Ladonia's density) loses the window bars in a sun patch and
  weakens contact shade, whatever the samples. So: final 512 at 4096;
  draft 128 at 2048 for levels and placement only.
- The bake's tree shade comes only from the Fluffy Tree garden's trees
  (`planTrees`, `planHillTrees`, `planRoadTrees` → `tree_shade` proxies);
  a landscape's own trees (World/Flora) are in no lightmap unless added to
  `scripts/bake-public.mjs`'s settings. Drawn "baked" they shade the sun
  live instead, in the shade map of what moves (`LiveLamps` `SUN_MOVE`:
  drawn again as the view moves a metre); drawn "static" — steps 0–1,
  phones — and from above they cast nothing.
- Big outdoor geometry steals lightmap texels, and the bake fills hidden
  faces only from spec walls and slabs (`scripts/bake-public.mjs`
  `solids`), with only the fence and hills in `coarseMaterials`. Before a
  final bake of a `spec.landscape` site, add its landscape walls, planters
  and terrain to both, and compare `[bake] house texels` before and after.
- A surface hidden under other geometry bakes black and bleeds: cut it out
  (holes) rather than leaving it underneath.
- A bake that fails inside Blender: Blender exits 0 after a Python error
  unless it runs with `--python-exit-code 1` (scripts/bake-public.mjs now
  passes it), so the error used to surface later as "ENOENT … bake.json",
  with a `bake-<stamp>/` folder holding only `settings.json` left behind
  (the script now deletes a stopped bake's folder, unless `--debug`). Read
  the Blender traceback in the log, not the last line. Reproduce on a copy:
  copy `published/<id>/manifest.json` and the version folder (without its
  `bake-*` folders) to `<scratch>/pub/<id>/`, then `PUBLISH_DIR=<scratch>/pub
  node scripts/bake-public.mjs <id> --samples 16 --size 1024 > log 2>&1`
  (~25 min for Ladonia to reach the samples; ~1 h 55 min to the end on
  2026-10-04 — nearly all of it handing the 1.5 M-face scene to Cycles,
  some 1,400 times then: "What a bake's time goes on", below). To work on
  the unwrap or the packing alone: `BAKE_CHECKPOINT_UNWRAP=<file.blend>`
  (with `BAKE_STOP=1` to stop there) saves the scene before the unwrap,
  `BAKE_CHECKPOINT=<file.blend>` before the packing, and `bake-replay.py`
  (this folder; its header has the commands) reruns them on it with
  bake_public.py as it is now — minutes, not 25.
- The lightmap unwrap is angle-based (2026-10-04): Blender's
  minimum-stretch unwrap failed islands on Ladonia and varied from run to
  run on the same input — 94% of the surface at an even texel density in
  three runs, 15% in the fourth, a bedroom floor with no lightmap — where
  angle-based gives 100% every time, in half the time.
- The atlas is one lightmap for the whole site, cut into a rectangle per
  room (`pack_zones`). Ladonia's first bakes failed there: 22 thousand
  islands (three buildings' furniture) with 8-texel margins needed about
  twice the 4096² atlas, every room's rectangle came out smaller than its
  trial pack assumed, and Blender's packer shrank a dozen rooms' islands to
  nothing (then a division by zero). `pack_zones` now sizes each room from
  its islands' boxes and margins at the one scale at which all of them fit,
  narrows the margins to as little as half when the islands would otherwise
  cover under `MIN_SURFACE` (a quarter) of the atlas — Ladonia: 8 → 4
  texels, 5.6 cm texels, 30% filled; a single house keeps 8 — and logs
  `zone short of texels` for any room still packed under half the usual
  density. Read the `[bake]   atlas …` and `house texels` lines of every
  bake: zones within ~50% of each other and texels of a few cm are healthy.
  `--margin 4` (`npm run bake -- <id> --margin 4`) asks for narrower
  margins outright; `lighting.margin` says what a bake ended with. Tried
  on Wrenfield (128 samples at 4096 against the same code at
  8): texels 2.8 → 2.3 cm, the atlas 32% → 46% filled, each room's
  rectangle — and so its switches' layers, their bytes and GPU memory —
  the same size, 10% longer to bake; no light of the next island seen at
  an edge from 30 m above, from the street, down a room's length, by day
  or at night, at 4096 or in the phone's copy (2 texels round an island).
  Not made the default: a pixel must cover 9–18 cm of surface before the
  neighbour's light can blend in at 4, 18–37 cm at 8 — far, or at a very
  low angle along a wall — and only those views were looked at.
- **Each variant's lightmap is written twice**
  (`blender/lib/lightzones.py`, bake_public.py's `write_rooms`): once as
  ever, one scale for the whole atlas (`lightmap`, `chroma`, `scale`), and
  once with **each room's part of the atlas held its own way** (`rooms`:
  `{ lightmap, chroma, lightmapPhone, chromaPhone, encoding: "log", zones:
  { <room>: [knee, top, gain] } }`). The one scale is the sunlit garden's:
  a room lit through its windows was left 14–20 of the 255 levels (a step
  of 7–9% of its light), the WebP then erred by blocks of those steps, and
  the view, exposing the room ×4–32, drew rectangular patches tinted pink
  and green on every wall and ceiling. A room's own curve is its light's
  logarithm — `ln(1 + L/knee) / ln(1 + top/knee)`, the knee an eighth of
  the room's middle light, the top its brightest texel — so a level is
  2–3% of the light everywhere, a patch of sun and the shade beside it
  alike; its colour's two differences are stretched ×4 (×2, ×1 where a
  room's colour is strong: `gain`). Measured on Wrenfield's day (512
  samples; scratch `opt/s5b/tools/enc5b.mjs`, error against the bake's
  own float light, over 5 × 5 texels): one scale q90 2.1% of the light and
  the red-to-blue balance off by 22% (95th percentile), 0.67 MB; one scale
  lossless 0.4% / 5%, 3.15 MB — and its 8 bits' steps show as contours;
  a quarter of the scale at q98 0.8% / 12%, 1.5 MB, faint tinted blocks
  still, the garden worse; a curve a room at q90 1.0% / 5%, 1.2 MB; at
  **q80 with the colour at q90 — what is written — clean to the eye on
  walls, ceilings and sun patches at 4096 and in the phone's copy, 0.80 MB
  for the one scale's 0.63 (a phone's copy 0.36 for 0.28; the night 0.32
  for 0.47)**. The garden's zone has no curve: its texels
  are the one-scale lightmap's own, so the grass and the terrain's shader,
  which read the lightmap as it is, read what they always did.
  - **Only a view that resolves the house's light reads it**
    (`Utils/device.js` `roomLightmap`, `World.drawLighting`,
    `LightResolver.setBase(…, rooms)`): the resolver opens each room's
    part out by its curve as it draws it (`uBaseCurve`; every such room
    is drawn, whatever its switches and doors — and without its switches'
    layers meanwhile, should those wait their turn) and keeps the result
    as it keeps everything. Such a bake is resolved even with no switch
    and no door. Lit live, `?lightmap=rooms`, a device that cannot
    resolve — and **a build from before this — read the one-scale files,
    exactly as before**: a visitor fetches one pair or the other, never
    both (`lightmap:day:rooms` is what is fetched with the scene when the
    view will most likely resolve: `roomLightmapsLikely`). The own-way
    lightmap is uploaded **without mipmaps** (`prepareLightmaps(…,
    mipmaps)`): the resolver and the grass read it texel for texel, and
    the one thing that read it through them — the terrain's own shader —
    blended, from the third mipmap on, the rooms' texels beside the
    garden's rectangle (4 texels off on Ladonia) into the ground: light
    held by another curve, read as the garden's.
    `?lightmap=one` draws the one-scale lightmap through the resolver, to
    compare. A manifest whose `rooms.encoding` this build does not know is
    read as having none.
  - **Which texels are a room's is worked out twice and must agree**:
    `shared/lightRegions.js` (the view) and `lightzones.regions` (the
    bake), from the zones' rectangles *as bake.json rounds them*.
    `node scripts/test-light-regions.mjs` holds one against the other over
    every published bake and some made-up atlases (needs `python3`); run
    it after touching either.
  - The least light a curve spends levels on is the variant's
    (`ROOM_LEAST`): 0.0002 by day (next to black at ×32), 0.004 at night —
    a night's dark rooms are only grain, and held by its logarithm that
    grain was most of the file (a 2048² night: 547 KB → 137, under the
    one scale's 197).
  - Two things are no room's whatever they lie in (`zone_split`): **the
    top of a ceiling** (lit roof-off, as the sun: in its room's part it
    set the top of the room's range) and **what the view draws by a shader
    of its own** (`own`: any mesh whose snapshot carries `_…` vertex
    attributes — the terrain's paint), which reads the garden's lightmap.
    They are told by a property from there on (`is_back`), never by their
    names: two joined objects of one name are numbered by Blender
    (`…~back.001`), and the first-floor ceilings' tops, no longer "~back",
    were not baked roof-off and came out black from above.
  - **A switch's layer in a room its light only spills into is written
    twice as well** (`encode_own`, a layer's `own`:
    `{ lightmap, chroma, lightmapPhone, chromaPhone, encoding: "log",
    curve: [knee, top, gain] }`). A switch has one scale for all its rooms,
    its own room's: the landing under Wrenfield's loft lamp has 1.2% of
    it — some 28 of the 255 levels at its middle — and by day, the landing
    exposed ×5.4 for its daylight, the WebP's blocks showed as tinted
    rectangles along a door's casing (the walls were clean with that one
    lamp off). Where a room's middle light of a switch is under 0.15 of
    the switch's scale (`LAYER_OWN`) its crop is written again held as a
    room's part of the lightmap is (its own logarithm, colour stretched,
    q80/q90; `LAYER_LEAST` 0.0005 the least light it spends levels on).
    A view that resolves the house's light fetches that one *in place of*
    the other (`Utils/device.js` `ownLayer`, `Switches.load`,
    `planSwitchLayers`) and the resolver opens it out by its curve
    (`uLayerCurve`, in the shader only for a bake that has such layers:
    `layerCurves`); `?lightmap=one` reads the one-scale layers, to
    compare. Everything else — per-room materials, lit live, a build from
    before — reads the one-scale file as ever. What the lamps bounce
    (`indirect`) is left at one scale: read only in the lamp's own room.
    Its curve spends no levels on light under a quarter of the room's own
    middle daylight (`LAYER_BESIDE`, from the day's curve of the room): a
    level there is still under a hundredth of what the spill is seen
    beside, and what it would hold is the bake's grain. Wrenfield, final:
    52 of 67 layers (every room a light spills into, and the own rooms of
    four ceiling lights, whose ring on the ceiling is their scale, and of
    the three lamps); a view
    that resolves fetches 2.29 MB of layers for every switch where the
    one-scale ones are 1.61 (a night with every ceiling light on 1.47 →
    2.07 MB; a phone's copies 0.74 → 1.06) — 2.61 before the knee's floor.
    The same lamp's light in the air is the same (each switch at the
    probes of its rooms ×0.995–1.004 of the bake before); a layer's own
    file opens out to ×0.98 of its one-scale file's sum (the middle one;
    nine in ten ×0.96–1.03): the WebP smooths the logarithm, and the mean
    of noisy light's logarithm is under its mean.
- **A narrow strip is lit through its vertices when it would be under
  three of its own texels across** (`split_thin`,
  `texel_guess`, `STRIP_TEXELS`, capped at `THIN_MOST` 0.3 m): the texel
  is guessed before the unwrap from the surfaces' area (Wrenfield 2.9 cm
  guessed, 2.8 packed). At 2 cm a strip's texel nothing changes for the
  house (a 6 cm casing is three); at Ladonia's density, or in a 2048
  draft, the casings and skirtings narrower than ~11 cm go to the
  vertices instead of coming out black; and a material given coarser
  texels (`coarseMaterials`: the fence, ×3) no longer overrides the rule —
  every picket is vertex-lit, and evenly white, at any size.
- **The garden's own lights are in the night's bake**
  (`scripts/bake-public.mjs` `garden`, bake_public.py's `garden_lights`):
  the site's uplights, downlights and each pool's lamp
  (`World/Flora/lights.js`), as part of the night's own light — no visitor
  switches them — each at the power that lights a surface 2.5 m off as the
  live one does (the live ones fall off slower than light does). Their
  straight light is kept out of the light probes (`lit_by("house")`,
  `_garden`): the view's live garden lamps go on lighting what is drawn
  live — the trees, the people, the cars — and the probes give those only
  what the lamps bounce. `variants.night.garden` is how many. Not the step
  lights nor the LED strips, which give no light live either. Lit live
  over such a bake (`?lighting=live`) the house would have them twice —
  left so: the thin faces' light apart (`_…_INDIRECT`) is
  one thing to two readers — "all but the sun's", which the baked view
  dims by the doors and gives the sun back over, and "all but what is
  drawn live", which the link's compare mode adds its live lights to —
  and the garden's lamps belong in the first and not in the second:
  taken out for the one they are the other's "sun". The lightmap's
  (`-indirect`, read lit live alone) could have them out by itself, for
  a pass more of every night's bake and the sun's mask worked out
  without them — and the thin faces would have them twice still. It
  wants a third light apart, for a mode only the link asks for.
  **The pool's lamp is baked at the water's surface**, not where the live
  one is, half a metre under it: the live one casts no shadow and lights
  the walls round the pool through the pool's own sides; baked there the
  basin kept all of it in (Ladonia, a cut-down night bake: nothing of the
  turquoise on the terrace). At the surface the pergola, the loungers and
  the wall facing the pool take it, shaded as they should be — fainter
  than live on the wall. Tried only on cut-down night bakes of Ladonia
  (32 samples, 2048, no switches: 16 min for the site without rooms, 1
  and 5 min for the pool's corner with `BAKE_BOX`, the second with its
  rooms, the probes and the lamps' own pass): under a pergola's downlight
  the terrace reads 29 mean level for the published bake's 16 and the
  unbaked view's 43 (whose rooms are lit too), by the pool 58 for 50 and
  59.
- **Each face is given to the room it is seen from** (`cut_at_rooms`,
  `cut_at_walls`, `face_zones`, `zone_split` in blender/bake_public.py), so
  that a switch lights its own room's faces and a door dims them. Each
  switch is baked into its own room and the rooms it opens into
  (scripts/bake-public.mjs, `zones: [light.room, ...neighbours]`); a face
  zoned to another room, or to `outside` — which no switch has a layer for
  — gets none of its room's lamp, and the view cannot draw it better: the
  lamp's light on it is in no file. How a face is placed:
  - `cut_at_rooms` cuts every face that lies in a room and runs more than
    0.25 m past its edge (`CUT_BEYOND`), along that edge, before anything
    is zoned: a wall running on behind a partition was one polygon, and the
    other room's whole.
  - `cut_at_walls` cuts whatever lies in the thickness of a wall with a
    room either side — linings, heads, thresholds — along the wall's
    middle. A half narrower than a strip may be and still have the lightmap
    (`thin_under`: half of a 10 cm partition) is lit through its vertices,
    as any strip that narrow is (Wrenfield at 4096: 460 faces cut, 1,089
    half-faces to the vertices).
  - `face_zones` gives a face to the room holding a point 5 cm off its
    middle; a face in a wall's own thickness (`settings.walls`, every
    wall's footprint) to the room at whose height it is *seen* (5 cm off
    it, the way it faces), else to the room whose plan is nearest its
    middle within 0.4 m (`WALL_REACH`), unless it faces away from it — the
    outside face of an outside wall stays outside. It never gives a room a
    face that looks up from over its ceiling or down from under its floor
    by more than a centimetre: an upstairs threshold lies a millimetre
    under its own floor, within reach of the room below (the underside of
    a two-sided floor, which `part_twins` moves 3 mm under it, stays its
    floor's room's). A face that looks up or down hard against a solid
    part of a wall (`settings.solids.walls`: the panels round the
    openings) is nobody's: the top of a wall under the wall of the floor
    above stays outside, dark from above as the cut through a wall is on a
    plan — but not the top of a door's lining, which runs on up behind the
    head of its frame and is seen below it.
  - `zone_split` parts objects by face, never through one. Not done: cuts
    at the rooms' floors and ceilings (a face running from one storey into
    the next).
  - **What a bake from before 2026-10-12 shows of it — Ladonia's
    20261004T152226Z, and Wrenfield's 20261001T143211Z, which is still its
    only bake — until it is baked again**: a
    wall black at night beside a door (A1's bedroom 2: one polygon from x
    2.85 to 9.4 zoned `a-g-a3-bath`); a black diagonal where the long
    triangles of a wall between two rooms fall alternately to each
    (`a-r-util-n` and `a-r-util-s`); black bands at every doorway at night,
    and by day in a room lit only by its lamp (`c-f-hall`'s far triangle,
    6.7 m², and its side wall) — wall ends, thresholds and reveals zoned
    `outside`; on Wrenfield the black triangle of wall over Bedroom 3's
    bed, a wedge and a whole wall of the loft shower room dark with its
    light on, every lining parted between its two rooms along its diagonal
    (15 of 15 doors) and every upstairs threshold the room's below (9 of
    9).
  - Checked on Wrenfield's last test bake (2026-10-12, scratch
    `pub-bake/wrenfield-house/20261012T060400Z`, by reading its `lit.glb`
    door by door): faces across a wall's thickness given to two rooms at 0
    of 15 doors, no upstairs threshold in a room of the floor below, 57 m²
    of wall tops back outside (so from above at night the mean level is
    77.6 for 81.6 and 97.0 for 102.9: the wall tops dark again, as in the
    committed code's bake). The light is the same: each room's daylight at
    the probes ×0.981–1.014 of the bake before, each switch's
    ×0.995–1.004, 36 poses' mean levels within 1.9.
- **A light probe measures if a lamp's light reaches it**
  (bake_public.py `grid_seen`): a probe counted as in the air only if the
  day or the night gave it more than 1e-5 — and in a room daylight does
  not reach, with every lamp off, which probes were over that was their
  grain's doing: Wrenfield's loft shower room had one probe in one bake
  and none in the next two, the loft's far end none, and their drawers
  were drawn black in a lit room (`ProbeLight` gave a mover with no probe
  round it nothing). Now any switch's light counts. And in the view
  (`ProbeLight.sample`), where none of the eight probes round a point
  measures anything, the nearest that does within two steps of the grid —
  its own room's before any other's — for every bake there is (Ladonia's
  A3 closet has none in the published one). A door leaf's side still goes
  by its own room alone (`leafLight`: an unmeasured side takes the other
  side's, not a third room's).
- **A version published "Fully baked" is baked for that alone**
  (`scripts/bake-public.mjs` reads `options.lighting ===
  "static"` and passes `--static`; `--full` on its command line bakes all
  of it, `--static` leaves it out whatever the version says): no doors
  baked shut, no light probes, no sun masks, no `-indirect` lightmaps or
  switch layers, no `_…_INDIRECT` vertex light. The passes of light are
  the same ones, so what such a bake keeps is what a whole bake has
  (Wrenfield: its lightmaps and switch layers differ from the whole
  bake's as two runs of one bake do; the thin faces' light has other
  grain, their probes' object being without the light probes' points;
  16 frames against the whole bake drawn `?lighting=static`: mean levels
  within 0.2, 0–0.6% of pixels over 8 levels, 3.5% on the landing with
  its balusters and door leaves). **1,664 s → 1,201** — the doors' 430 s,
  and 30 s of files not written — and **view.glb 6.46 → 3.94 MB**, the
  bake's folder 17.6 → 9.4 MB (568 files → 285). Its
  manifest says `lighting.only: "static"`, and `lightingMode` draws it
  static whatever the link asks (`?lighting=baked`, `=live`): it has
  nothing else to draw from (a manifest the store rebuilds from a bake's
  own `bake.json` keeps `only` and `margin` too: `server/publish/store.js`
  `rebuildManifest`). The Publish panel's bake goes by the same
  option, through the same script. The whole-atlas `-indirect` lightmaps
  alone (read only by `?lighting=live`) are not worth an option of their
  own: writing them is 4 s of a bake, and the pass they come from is the
  sun mask's, which "baked" mode needs.
- **A site with its own sky is baked under it** (2026-10-04): until then the
  bake lit every space with its `environment.preset` — Ladonia's sun 83°
  from the live view's (from the west, not east-south-east), a flat
  procedural sky, a moon. `shared/sky.js` now holds the live sky's numbers
  (`SKY_VARIANTS`) and its sun maths (`findSun`, `sunDirection`), used by
  both World/Sky.js and `scripts/bake-public.mjs`'s `landscapeSky`, which
  hands bake_public.py's `sky_world` the HDR (sun clipped at the browser's
  ceiling, turned with a TEXTURE Mapping at Z = +turn — render-checked),
  the sun (`#fff6ea`, 3.2, 1.1° across) and the strengths: by day the
  sky's own (1.0; the live view's 0.3 is for light that knows no walls —
  against renders 13/14 the bake's shaded façades match, the live view's
  are too dark), at dusk the live outdoor share over the share of the
  dusk's light above the horizon (`findSun`'s `above`: 0.179), no moon.
  The log shows `[bake] sky <hdr> turned 19°, strength 1, 982 sun pixels
  clipped`. Check it: the baked view's sun (`sun.position −
  sun.target.position`) equals the live one's ((0.780, 0.588, 0.213) for
  Ladonia). Spaces without `landscape.sky` bake as before.
- **What a bake's time goes on is handing the scene to Cycles.** Every
  `bpy.ops.object.bake` is a new Cycles session *for each object baked*: the
  whole scene exported and its BVH built again (Wrenfield 0.6–0.7 s, Ladonia
  about 3.5 s by arithmetic — its 16-sample draft took 1 h 55 min). The
  lightmap passes bake one joined copy (`as_one`), but the thin faces' light
  was baked on **a probe object a room**, every pass: 20 hand-overs a pass
  on Wrenfield, 94 on Ladonia — with the switches' two vertex passes a room
  each, 254 of a Wrenfield bake's 352 hand-overs and 1,168 of Ladonia's
  1,542 (the "about 147 Cycles calls" of the bake matrix counted calls, not
  objects). The log's last line now counts them: `[bake] the scene was
  handed to Cycles N times`. What was done, each held against the same bake
  as it was (scratch `opt/s5c/tools/cmp.mjs`: every lightmap file, switch
  layer, door crop, vertex attribute and the probes' file of two bakes):
  - **The probes of a pass are baked as one object** (`probes_as_one`,
    bake_vertices): one hand-over a vertex pass. A vertex's samples go by
    its index in the object baked, so the thin faces' light has *other
    grain* and is otherwise the same: against the reference, each vertex's
    light differs by 2.0% (median; 12.9% at the 95th percentile) and all of
    it by ×1.0000 — what the same bake with another seed differs by
    (`BAKE_SEED=1`: 2.1%, 13.0%).
  - **Doors in parts of the site that no opening joins are shut in one
    pass** (`blender/lib/batches.py`, `door_batches`; `settings.openings`,
    `roomLinks`' `joined` in `shared/roomGraph.js`: the rooms a door, a
    doorway, a stairwell or no wall joins — `settings.links`, what a
    switch is baked into — and those that only share light, through an
    arch, a hatch or a window between two rooms; none of the three
    spaces has one of those joining two parts today): a flat and the flat
    next door, two buildings. Ladonia's 84 doors, in 14 such parts: 12
    passes.
    A single house is one part — a door a pass, as before. *Within* a part
    it was tried and does not hold (`BAKE_PASSES=rooms`: doors whose rooms
    do not touch; Wrenfield's 17 in 9 passes): 31 of the 32 rooms' crops
    changed by less than another seed changes them (0.28 of a level on
    average for the seed's 6.4), but the front door, shut in the same pass
    as the loft bathroom's, took a twentieth off the loft — windowless, it
    has its daylight up the stairs from the landing over the hall, two
    openings off (its share 1.00 → 0.955).
  - **Switches stay one to a pass.** Lighting several whose light falls
    in no room in common, and taking the pass apart by room, was built
    and measured (`BAKE_PASSES=rooms`: Wrenfield's 22 switches in 14
    passes, 88 s saved) and **changes their light beyond its grain** — a
    switch alone in its pass came out the same to ×1.0000; lit with
    others: the two ensuites and the loft's shower room, in the kitchen
    lamp's pass, lost 7% of their light and a tenth of what they bounce;
    Bedroom 2's thin faces 18% (the study's lamp is a metre under its
    skirting); the desk lamp's layer in the room next door gained 59%
    from the bedroom lamp three openings away. Cause: every lamp lit is
    one more for Cycles to choose between at each bounce (its light tree
    knows no walls: a lamp the other side of a floor is "near"), a room's
    own lamp is then picked less often and counted for more each time,
    and the bounced light is clamped (`sample_clamp_indirect`) — more of
    it lost the oftener the wrong lamp is picked (shown by baking those
    four switches again with no clamp, `BAKE_ONLY=<ids> BAKE_CLAMP=0`,
    apart and together: the three small rooms then keep ×0.993–0.996 of
    their light lit together, for ×0.924–0.931 with the clamp; their
    thin faces ×1.00 for ×0.92); and light gets round a house into rooms
    a switch is not baked into. What would lift it —
    each surface lit by its own switch's lamps alone (light linking) —
    is by object, and an object baked is a hand-over; light groups cannot
    be baked. `BAKE_PASSES=parts|rooms|loose` still lights them together,
    to try again: never for a bake to keep. `lamp_sight` (a lamp's
    straight line into a room not its own, by rays at a lattice of each
    room's air) is that experiment's: on Ladonia five lamps see into
    another villa's room.
  - **`spread` works on the ring it is filling**, not the whole atlas
    eight times a round: 2 s for 15 at 4096², the same to the bit
    (`opt/s5c/tools/spread_test.py`, `spread_real.py` hold it against the
    old one, kept as `spread_whole`, on made-up and on a real bake's
    masks). It runs after every pass and on every room's crop.
  - **The ceilings' tops are denoised in their own squares of the atlas**
    (`denoise_tiles`, `TILE` 64 with 32 texels round each, laid side by
    side in one small picture): 35 squares, 0.9% of Wrenfield's atlas,
    for the whole of it three times a variant — 77 s → 13. The tops
    differ from before by 0.6 of a level on average (a seed: 0.9–1.5).
    **And with them a level here and there in the rest of the file**:
    the tops, lit with the roof off, are among the lightmap's brightest
    texels, its scale is their 99.7th percentile, and it moved in its
    fifth digit (1.61328 → 1.61319) — every code is then worked out
    against another scale, a few in a thousand fall the other side of a
    half, and the lossy WebP spreads each over its block: 12% of the
    day's texels differ by one level from the reference (0.19 on
    average) where two runs of one bake differ in 2.5–4.3%; at night,
    whose scale is its floor, 2.3% for 0.7–0.9%. The light they hold is
    the same. (Found by baking the day alone with each thing put back:
    `BAKE_APART=tops` gives the reference's scale.) Their three guide
    bakes are left: the masks of one cannot be had from another's
    exactly, and they are 5 s.
  - Not bit for bit, whatever is done: two runs of one code and seed
    differ in 2.5–4.3% of a day lightmap's texels by a level (0.04–0.06
    on average; GPU arithmetic, then the WebP), 6% of a switch's layer,
    and the per-room files in a fifth (a room's brightest texel sets its
    curve); 5–14% of the thin faces' vertices in their last digits.
    Compare bakes by what a seed changes: `BAKE_SEED=1` on the same copy
    (a day's texels 1.1 levels on average, a switch's own room 1.3, a
    thin face's vertex 2% of its light, a door's leaf 8%).
  - **Wrenfield, 512 samples at 4096: 2,197 s → 1,664** (the same code
    before and after, a quiet machine; by stage: guides and masks 55 → 29,
    day 326 → 187, doors 511 → 430, night 232 → 107, switches 1,022 →
    859), hand-overs 352 → 148; the Publish panel's draft, 128 samples
    at 2048, 622 s → 418 (its progress bar's steps are fitted to the two:
    `server/publish/bake.js` `STEPS`, each with the part of it that no
    setting shortens). Ladonia by arithmetic from its settings
    (`--dry`) and its rooms' graph: 1,542 → 423 hand-overs (1,168 → 193
    of probe objects, 374 → 230 lightmap passes: its 84 doors in 12) —
    at some 3.5 s each 65 min, 8 more of the 144 passes' own set-up
    (4–5 s a pass at 4096² on Wrenfield, half of it not the scene's),
    and 5 from `spread` and the tops: about 1 h 20 min of its 3 h 22 min,
    so about two hours. Not baked to see; what a hand-over costs there
    is from its draft's time, not measured. The code as it ended — the
    doorway cuts and the layers' own copies on top of this — baked
    Wrenfield in 1,719 s with the same 148 hand-overs, a figure that is
    not clean (a browser drew on the same GPU for its first ten minutes);
    the committed code's own bake of those settings took 2,093 s.
  - Developer's switches, none for a bake to keep: `BAKE_APART=switches,
    doors,probes,tops,fill` bakes each as before, to hold the two
    together; `BAKE_SEED`; `BAKE_KEEP=masks` (mask-written/-covered/
    -tops.npy beside the bake); `BAKE_CUT=switches` (no switch baked, the
    same atlas — `--no-switches` leaves the bulbs unparted and lays out
    another); `--stage passes` on bake_public.py (the passes the doors
    would go in, nothing baked: 13 s on Ladonia's snapshot); `--dry
    <file>` on bake-public.mjs (the settings alone: no bake's lock taken,
    no bake folder made under the version, Blender not looked for — it
    used to do all three before stopping).
- The bake's set-up had three Python loops over every face or vertex
  (`bounds`, `texel_size`, `stretch_report`), now numpy: Wrenfield's
  unwrap-and-pack 17 s → 2; on Ladonia `texel_size` alone was 3.6 min.
- `BAKE_CUT=zones,edges,covered,lids,sun,vertices,switches`
  (bake_public.py, with `--variants night --no-switches --no-doors`):
  parts of a bake left out,
  to try one thing on a big site in minutes — never a bake to keep; and
  `BAKE_BOX=x0,z0,x1,z1` (the app's x and z): only that part of the site.
  A view of a bake with no day variant opens unlit by day: go to night.
- Known bake faults and their causes: dark corners and lines from faces
  running on inside the next wall; seams from T-junctions and slivers (weld,
  split, BEAUTY-triangulate, delete < 1e-7 m²); light leaks through
  two-sided surfaces (bake the copies 3 mm apart); smudges from wrong
  denoiser guides; a hot halo from fittings close to the ceiling raising a
  switch's lightmap scale (read `scale` in the manifest). A room's material
  mixes at most 6 switch layers — 5 in "baked" mode on a 16-unit GPU — in
  the per-room path only (`?lightmap=rooms`); resolved, any number ("How a
  baked view is drawn").
- **What baking a version again changes.** The view's side of this work —
  the modes, the resolved lightmap, the merged house, the meter, the
  guard, the live room — applies to an old bake as it is (the live room
  with one fault of the old zoning: a doorway's reveals zoned to the room
  behind them stay baked beside a room drawn live — Wrenfield's). The bake's
  side shows only in a version baked with this code: each room's part of
  the lightmap held its own way and the spill layers' own copies (no
  tinted rectangles on walls and ceilings by day); narrow strips lit
  through their vertices (no black casings, skirting tops or pickets);
  faces given to the room they are seen from (no black doorway bands, wall
  wedges or linings); the garden's lights in the night; light probes
  wherever a lamp reaches (no black drawers in a room without daylight);
  the manifest's `margin`, and `only` for a version published "Fully
  baked". For a visitor it is 0.5 MB more to fetch for day and night
  together on Wrenfield (8.79 → 9.30 MB), no more GPU memory, and the
  same frame times (within 0.5 ms at 14 views). It replaces the version's
  bake folder — every file's name changes — and, the faces being cut
  otherwise, every room's rectangle moves: two such bakes are not compared
  texel for texel (Measuring). **Of the user's published bakes, Ladonia's
  is of this code** — they published and baked it afresh on 2026-10-12
  (20261012T114849Z: its manifest has `margin`, each variant's `rooms` and
  the night's `garden`, 16) — **and Wrenfield's is not**
  (20261001T143211Z): half an hour to publish and bake, and theirs to ask
  for.

## Measuring: frame times and pictures

How the performance work of 2026-10-10/14 was measured: every frame time
in these notes marked M4 Pro came this way. One Mac (Apple M4 Pro, ANGLE
on Metal), its pane hidden: none of it says what a phone or an integrated
GPU does, and none of it was watched in a visible tab at the display's
rate.

- **What a frame time is.** A hidden pane has no requestAnimationFrame and
  its timers are throttled, so real frames cannot be timed there, and
  `?stats` in a hidden, throttled or driven pane says nothing. What can be
  timed is the render: `experience.renderer.render()`, then
  `gl.readPixels` of one pixel (which waits for the GPU), in a loop —
  harness.js's `__K.time(n)` is that, after one warm-up frame. The work's
  own cells were nine frames after three warm-ups a round, several rounds,
  given as best / median. "Moving": the sun's
  shadow map and every lit lamp's flagged before each frame — the worst
  case. "As run": `world.update()` and the render, nothing forced. A
  walk: the player stepped at 1/60 s along a route, every frame's time
  kept (median, p95, the frames over 16.7, 25 and 33.3 ms). The viewport
  set to 1280 × 720 at ratio 2 (`resize_window`): the canvas is then 2560
  × 1440 at steps 3–4, 1920 × 1080 at step 2 and 1280 × 720 at step 0 —
  read it in every cell. `?guard=off` on every public link timed. The wind
  and the water held still (the materials' `uTime` uniforms and the pool's
  time set to a constant), so that two builds draw the same frame.
- **Old against new: a frozen copy and a baton.** The old side is a build
  that is never edited after — the committed code copied out to the
  scratch folder and built there once (2026-10-10/12), or a copy of the
  repo's `dist/` as the user's own server still serves it (2026-10-13/14,
  when the new side was built into the scratch folder and `dist/` left
  alone: SKILL.md §0) — on servers of its own over the *same* publish
  folders and a copy of the scenes; the new side is the working tree,
  built. One tab a build,
  loaded one after the other (loaded together, the second stays 0.5–1 ms a
  frame slower for as long as it lives, whatever it draws — measured with
  one build in both). Between them a baton: a small server both tabs ask
  for it and hand it back to, so that only one draws at a time and the two
  take the same steps in turn — old, new, old, new — four rounds a cell.
  A busy machine then falls on both alike: the difference holds where the
  absolute figures do not (the same cell moved by up to 1.6 ms between
  sittings). Have the baton's answer carry the machine's load average,
  note it with every cell, throw away a cell that something else starting
  fell on (a Teams call took the load from 2–4 to 5–12) and run it again;
  never time during a bake or with Blender running (`ps`). Three builds
  with two tabs are two pairs: the new one timed twice.
- **Which tab a build is read in is part of its figure** (2026-10-14:
  the realistic preview's "0.3–2.4 ms a frame slower than before",
  Ladonia by day, `render()` and a pixel read back, the two tabs read
  turn and turn about). The new build in one tab and the build before in
  the other, the preview switched on in the page: +0.2, +0.8 and +0.9 ms
  on the medians (living room, pool, street). Both loaded straight into
  the preview (`?preview=1&scope=all`), the same tabs: +1.2 to +2.3 and
  +1.8 to +2.8 at the pool and the street. The same two loads with the
  tabs changed over: +0.1 to +0.3. The build before alone read 17.9 ms in
  one tab, 18.5 in the other, and 19.3–19.6 there once the first tab held
  a loaded Ladonia too. So a difference of a millisecond or two between
  two builds needs each build read in both tabs — the turns alternated
  are not enough.
  - **What followed the build, whichever tab**: three's one
    `scene.updateMatrixWorld()` a frame — 1.53–1.76 ms in the new build,
    1.35–1.45 in the build before, over the same 9,770 objects, all of
    them `matrixAutoUpdate` (by part: the shell 0.62 for 0.36, the
    furniture 0.65 for 0.54) — while the same call in a loop is 0.64–0.67
    for 0.63–0.64. Three's walk of the same scene is slower when it comes
    cold, which is where the scene's objects lie in memory, not something
    run each frame. Why they lie worse in the new build was not found,
    and nothing was mended.
  - **Ruled out, by number** (new / before): what a frame asks of the
    GPU's driver (43,076 / 43,105 calls, 18,855 / 18,847 of them
    uniforms, 1,029 / 1,035 `useProgram`, 11,879 draws in both); the
    programs (183 / 186, their uniforms 5,581 / 5,749); callbacks of
    their own on scene objects (27 in both, 0.01 ms a frame); layers
    (every object's mask 1, the camera's 1) and the camera's near and
    far (0.05, 800); properties of their own on scene objects (the same
    19 kinds of object by their keys); the stand-ins (off, an invisible
    group of 441: taken out of three's walk by `matrixWorldAutoUpdate`
    the walk stayed 1.53 ms; never made in a page loaded straight into
    the preview, where the gap is no smaller; their `update` while off
    0.01 ms); `Realism.update` (0.03 in both). Pace, the ray index, the
    wrapped `emit` and the edit camera are not in the timed call at all.
- **The long frames of a load** (Ladonia's editor, the app in an iframe
  with its frames and short timers driven flat out, 2026-10-14: three
  loads of this build, two of the build before). The longest is a frame
  in which 24–53 textures first reach the GPU: 213–373 ms here, 303–304
  in the build before. The frame that first draws the shell is 86–98 ms
  for 43: the stand-ins' own first merge is 23–31 ms of it (6,488 parts
  copied, 34 buckets laid out), the rest seven programs and 29 geometries
  new to the GPU where the build before has four and eleven. Not sliced.
  (The furniture's collision tree is built when the furniture arrives,
  outside any frame: 365–930 ms of Ladonia in one go, 2.3–2.4 s before.)
- **An editor tab draws on demand** ("When the editor draws"): none of
  the above is touched by it — a cell is `renderer.render()` in a loop —
  but anything that waits on the app's own frames in an editor tab needs
  `experience.pace.set("always")`, and "frames a second at rest" is now a
  figure of its own: `experience.pace.stats`.
- **A tab alone for walks and for first times.** In two tabs taking turns,
  the first heavy frame after the other tab's turn was 33–78 ms at the
  same frame of a walk, every round; alone it is 19–20. Without a pass
  over every view before the timed rounds, the first round of *both* tabs
  was uneven (a pool view 32.7 ms for 17.6–18.0 after). In a light view
  (Wrenfield, 4–5 ms) the first dozen frames after any pause are up to 2
  ms slower. So: a first-visit pass over every pose, kept apart; walks,
  fresh-load figures (a first look, a first night, a first switch-on) and
  a light view's standing figures in a tab alone, two loads each.
- **Timers in a hidden pane.** Whatever the app does between frames on a
  timer crawls there — once a second, and once a minute after five minutes
  hidden. `Renderer.prepareLights` builds shaders in slices between
  timers: an unbaked view's lamps took 157 s to come in on a first night,
  and under 5 s with short timers run from the event loop (a `setTimeout`
  of up to 250 ms kept in the page and run from a MessageChannel, or after
  a quick request to a local server). Do the same, and say that the thing
  was not seen in a visible tab. A chunk imported when first wanted (the
  post-processing's, at a first preview) did not arrive while frames were
  driven flat out: await it (`renderer.usePost(true,
  renderer.postWanted)`, as `__K.realistic()` does) rather than drive past
  it.
- **Frames that are not what they seem:**
  - *The harness's stub answers a tool's POSTs* ("The browser pane"): a
    collector's rounds, posted to its own server, never left the page.
  - *drive.js with nothing queued* ("The browser pane"): a `__drive` that
    returns millions has drawn nothing.
  - *Another tab on the same server is a visitor standing in your pose*
    (below), and two test tabs are each other's.
  - *three uploads a geometry, and the GPU makes a program's pipeline, when
    it is first drawn.* With no whole-house shadow pass a view holds 374
    of 4,615 geometries after load (the committed code 4,179), and the
    first turn of the head uploads the rest. A pose's first frame is not
    its time: warm up — or measure the first look on purpose (the camera
    turned once round in place, every frame kept).
  - *Shaders prepared ahead may not have arrived*: the build's waits are
    timers, so in a background tab a "first" time is the throttle's, and a
    lamp is not lit until `!lampPool.entering && lampPool.settled`, a room
    until `roomLight.status().state === "lit"`, a first night's layers
    until `resolver.pending` is 0, an exposure until `meter.fresh`.
  - *A first build the browser has seen before is not a first build*:
    Chrome keeps built shaders on disk. Make text it has never seen: wrap
    `gl.shaderSource` and add a used term (`?roomlight=` takes `on` and
    `off` only now).
  - *The frame-rate guard does nothing in a hidden pane* ("What a visitor
    is given"): `guard.feed(ms)`.
  - *`gl.getError()` round every render* reads about 1.5 ms high.
  - *A job a `javascript_tool` call waits on outlives the call*: navigate
    the tab before it says done and the job is lost.
- **Comparing two builds or two paths frame by frame**: hide every avatar —
  another test tab on the same server is a visitor standing in your pose
  (`e.scene.children` Groups named "Scene", and Sprites: off every layer,
  not `visible = false`, which the app sets itself) — wait for the probes,
  the doors' atlas and the sun's mask, and draw unsorted
  (`renderer.sortObjects = false`): fewer materials change the draw order,
  and with it which of two touching surfaces a pixel on their shared line
  is. Two loads of one build then differ by 0 levels.
- **Two loads of one build are not always the same picture on Ladonia**:
  `Flora/trees.js` builds each species as its model arrives
  (`Promise.all` over the species), so the order — and three's material
  ids, and so the order the leaf cards are drawn in — changes from load
  to load. From above by day that is some 900 pixels of 3.7 million at
  the crowns' edges, by up to 20 levels (2–3 at night); the living room
  and the pool have shown none. Before blaming a change for such a
  difference, read the species' order (`scene.getObjectByName("flora")`'s
  `tree:<species>` children) or hide the flora in both: with it hidden
  the two builds were the same to the pixel.
- **Pictures by number.** `compare.mjs` (this folder; its header) tiles
  the same views from several sources with each tile's mean level; for two
  builds count the pixels that differ by more than 2 and by more than 8
  levels, and look at a 1:1 crop before calling a difference a fault.
  Merged against unmerged, and resolved against per-room, are equal but at
  single pixels on lines where two surfaces touch ("How a baked view is
  drawn"). Name frames with a prefix of your own, and change the names an
  earlier agent's tool saves under before running it.
- **Two bakes.** Two runs of one code and seed already differ by a level in
  a few texels in a hundred ("What a bake's time goes on": compare by what
  another seed changes, `BAKE_SEED=1`). Once the faces are cut differently
  no texel is where it was: compare the light at the probes, the same grid
  in both — each room's daylight, each switch's light in its rooms — and
  face by face (the triangles with the same three corners in both, each
  read from its own bake's lightmap at several points), then frames of the
  same poses. `node scripts/test-light-regions.mjs` holds the view's and
  the bake's idea of each room's texels together.
- **The tools were scratch.** The baton's server, the kit that poses,
  pins and times, the turn-taking runner and the short timers were written
  in the session's scratch folder (`opt/final-timing/tools/`: `serve.py`,
  `boot.js`, `kit.js`, `t2.js`, `fast.js`, `run.sh`; the editor's cells
  and walks in `opt/editor-measure/tools/`), which a restart of the
  machine empties — it did on 2026-10-13: three kits were put back
  (`opt/final-timing/tools`, `opt/final-verify/tools`, `opt/bakeq/tools`)
  and the rest written again as needed. The other scratch paths these
  notes name (`opt/s4b/…`, `opt/s5b/…`, `opt/s5c/…`) went with it. This
  section is what to write them again from; if they are still there,
  change the names they save under first.

## Tone, AO and colour

- Tone mapping is per space: `garden.colour.toneMapping` is `aces` (three's
  ACES Filmic — the default, and Ladonia's) or `filmic` (Blender's Filmic
  curve, `Utils/filmic.js`), with `exposure`. At the graded slider steps
  (2–4) an ACES space is drawn with AgX plus the renders' colour grade
  (PostProcessing.js); `filmic` is kept as asked. Pick the tone mapping and
  the slider step, and keep both fixed while measuring against renders.
- A Blender sheet is not the app's colour. `thumbs.py` renders with AgX
  under a flat grey world. The app uses ACES (or AgX plus the grade at
  steps 2–4), with rooms under the warm indoor share at exposure 2.2. The
  same material reads darker and more saturated in the app: felt, the
  caramel curtains, mustard fronts. Judge a colour in an in-app frame
  beside its reference at a fixed slider step, then change the material.
  A sheet shows shape only.
- AO: N8AO 1.10.1 + postprocessing 6.35.6, half resolution, 8/12/16
  samples at slider steps 2/3/4 (none at 0–1, which have no
  post-processing), `gammaCorrection: false`, lazy-imported. three's
  GTAOPass draws leaf cards as solid squares.
  - Its two transparency passes are the app's (`PostProcessing.
    drawTransparency`, set on the pass as `renderTransparency`):
    the library hides what is not for a pass with `visible =
    was && material.transparent && …`, which is `undefined` for a mesh with
    a material array, and three skips only `false` — every multi-material
    wall of a view lit live went into the second pass (5,000 draws from
    Ladonia's garden) — and each pass was a whole `renderer.render`:
    matrices again, and the sun's shadow map again at a step that draws it
    every frame (three times a frame at step 2). Ours sorts once, draws a
    multi-material mesh only if one of its materials is see-through and
    writes depth, holds `shadowMap.autoUpdate` and
    `scene.matrixWorldAutoUpdate`, and clears an empty pass once instead of
    drawing it. The picture is the same to the pixel.
  - Kept over a bake, on the frames: without it Ladonia's living room is
    10 levels brighter (46% of pixels by more than 8), the hedges and
    crowns flatter, nothing seated on the floor; it would save 4.3–5.4 ms
    of 19–32 at step 4. Without the transparency passes alone (−2.6 to
    −3.3 ms) the windows seen from outside by day darken by up to 25
    levels: the occlusion of the room behind them.

## Cars

- A downloaded car goes in `assets/cars/` (never `public/`, which is
  deployed), listed in `assets/cars/cars.json`
  (`{ id, name, file, scale | length, forward }`), then
  `npm run models -- --cars <id>` and `npm run build`; a space uses it as
  `vehicles[].model`. Record author and licence in README and
  `assets/THIRD_PARTY.md`. For an exact likeness of a branded object, offer
  a sourced model early rather than iterating a hand-built one.
- Spin every imported car's wheels: steered-pose fronts wobble and separate
  tread blocks stay on the body.

## Blender

- 5.1 API: the compositor is `scene.compositing_node_group`; Denoise
  options are input sockets; `pack_islands` needs
  `tool_settings.use_uv_select_sync = True`; export with
  `export_vertex_color="NONE"`, `export_all_vertex_colors=False`; GLTFLoader
  lowercases custom attributes. Blender (x, y, z) is the app's (x, z, −y).
- Blender isn't on PATH on this Mac:
  `/Applications/Blender.app/Contents/MacOS/Blender --background --python …`
  (the npm scripts find it themselves, `scripts/lib/blender.mjs`).
- Guard lib modules with `if __name__ == "__main__"`; keep preview runs
  export-free. `__pycache__/` and `*.pyc` are untracked and gitignored:
  Blender's rewrites need nothing; never force-add them.
- When changing a shared joinery helper for one piece, pass the change as a
  parameter and diff triangle counts per GLB node before and after: one
  "small" handle change altered every handle in the house.
- Materials (`lib/materials.py`). `plain`, `glass` and `emissive` are flat
  colours, given `linear()`. The other recipes bake a tiling image on
  export (`export_app.bake_tiling_textures`, with the generators in
  `lib/bake.py`), laid on world box UVs at `tile` metres a repeat. Their
  colours are given `srgb()`, as they should look. Besides `planks` and
  `tiles`, pick the recipe by what the surface is:
  - `veneer` → `grain`: wood (oak, walnut, teak), and opaque cloth with a
    straight slub (`curtain_caramel`);
  - `speckled` → `terrazzo`: stone — the terrazzo and quartzite tops,
    granite, marble. On upholstery it reads as stone chips: the `boucle_*`
    finishes, no longer used;
  - `nubbly`: bouclé and fine basket weave (`weave_oat`, `weave_cream`);
  - `heather`: heathered felt and wool, short fibres over a mottled ground
    (`felt_fleck`, `felt_sage`, the headboards);
  - `twill`: fine diagonal ribs, for cloth on a flat panel (`linen_panel`,
    the wardrobe doors);
  - `sheer(…, weave=…)` → `linen`: see-through curtain cloth, blended and
    two-sided (`curtain_linen`);
  - `noisy` → `carpet` (scale ≥ 60) or `mottle`: linens, rugs, plaster.

  `_two_sided(mat)` turns backface culling off, for a single sheet seen
  from both sides such as an opaque curtain; glass and sheers are
  two-sided already. The export scales each baked image so that its mean
  is the material's flat colour (`flat_color`). A pattern therefore adds
  texture, never tone: to fix a tone, change the colours, not the
  pattern's contrast.

## The browser pane

- `javascript_tool` stops at 45 s but the page keeps running: keep calls
  short and assume a timed-out loop is still changing state. Never
  `await img.decode()` with the pane hidden (never settles). Read pixels in
  the same call as the render (`preserveDrawingBuffer` is false).
- `experience.update()` by hand no longer starts a loop of its own (until
  2026-10-13 each call did, and never stopped: 40 calls hung the tab) —
  there is one loop, whoever asks — but in an editor tab at rest it is a
  heartbeat's frame, in which no time passes ("When the editor draws"). To
  step the world, set `e.time.delta = 1 / 60` (seconds) and call
  `e.world.update(); e.camera.update()` a few times, then render once
  (`e.renderer.render()`, which runs `Realism.update`: the exposure snaps
  to its target after a camera jump of more than 3 m, and
  `e.renderer.realism.settle()` also draws a pending room probe). After
  posing a camera for a still outside harness.js, call
  `e.world.vegetation?.update(0.016)` before rendering, or the grass is
  culled for the old view.
- A hidden pane has no requestAnimationFrame: Publish stalls at "Checking
  for holes" and the preloader at 80% until the tab is fronted
  (`tabs_select` + a screenshot); `editor.enter()` does nothing until
  the visitor is in (`body.walkthrough-active`: `Editor.available`),
  which a hidden pane never reaches by itself — with frames driven and
  the name prompt passed it enters hidden too (2026-10-14, with
  `pace.state` then `"idle"`). When fronting isn't possible (an agent's background tab, the
  user away), drive the frames: `drive.js` (this folder, through the sink)
  queues the app's requestAnimationFrame callbacks and runs them as fast as
  they come (`__driveOn()`, `await __drive(30000, () => done)`,
  `__driveOff()`) — a Ladonia publish took ~8 min driven, 2.5× faster than
  a hidden pane's throttled timers. If drive.js is loaded after the app
  has asked the browser for its first frame — harness.js, loaded first,
  waits for the world — nothing may ever be queued, and `__drive` spins
  over an empty queue (it returns millions of "frames", and nothing was
  drawn): call `experience.update()` once then (the frame the browser was
  asked for is dropped for the one asked after it), or start on the scene
  list and `__driveOn()` before opening the space. **An editor tab at rest
  asks for no frames at all** ("When the editor draws"): `__drive` then
  returns its turns, not frames — `experience.pace.set("always")` for a
  tool that counts on them. Never judge a frame rate by real frames in a hidden,
  throttled or driven pane: time the render itself (Measuring). A tab
  whose pane was never shown has a
  window of 0 × 0 and a canvas of 2 × 2: measurements run, and every
  frame saved is a blur. Before taking frames give it a size
  (`resize_window` to 1280 × 800, then
  `window.dispatchEvent(new Event("resize"))` and a few driven frames),
  and clear it (`preset: "desktop"`) when done.
- **Sign-ins.** The pane keeps sign-ins. For a site that needs the user's
  account (Mixamo's Adobe login): open it, ask the user to sign in there
  themselves, and wait. Never type into or click in a sign-in form, never
  create an account, and never sign out. Whatever else the site asks —
  terms, a consent banner, an upgrade — is the user's to answer (decline
  non-essential cookies). Then work in their session, on what they asked
  for only.
- **Click by script.** A click by coordinate lands on the wrong element in
  a `resize_window`-emulated viewport (on Mixamo it selected the wrong
  character). Find the element by its text and call `element.click()`.
  Set a React `<select>` through `HTMLSelectElement.prototype`'s own
  `value` setter, then dispatch a bubbling `change`. Read back what is
  now selected before the next step.
- **Downloads.** Ask before downloading: state the source, how many files
  and their sizes once, and wait for a yes. The pane saves no downloads.
  Where a site's export ends in a link, catch the link in the page (wrap
  its `fetch` and `XMLHttpRequest`), return it from `javascript_tool`, and
  fetch it with `curl` into the project. The page of an https site could
  not reach the sink on 127.0.0.1 at all (mixamo.com, 2026-10-06): paste
  a helper's text into `javascript_tool` instead of fetching it, and
  bring each link back as the tool's result, to a file that a background
  watcher curls.
- **Mixamo** (as driven on 2026-10-06; `mixamo.js` in this folder does
  it, and its header says which of its parts ran that day):
  - Each export ends in a presigned S3 link that lives 300 s, in the JSON
    of `GET /api/v1/characters/<id>/monitor`: `{ status: "completed",
    job_result: "https://…" }`. Write each at once to
    `<links-dir>/<kind>__<name>.url` (kind `characters` or `animations`;
    the folder in the scratch folder, since a link is the whole of the
    authorisation). `mixamo-fetch.sh <links-dir> <repo>/assets/people`,
    run in the background, curls each within two seconds into
    `assets/people/<kind>/<name>.fbx` and logs it in `fetch.log`.
  - A character: its tile, "Use this character", Download with the
    dialog's selects at Format `fbx7_2019` (FBX Binary) and Pose
    `t-pose`; named `<id>` (`remy`). Each is 28–59 MB.
  - A clip: search, click its tile, wait until the page reads "<clip> on
    <character>", then Download with Format `fbx7_2019`, Skin `false`
    (Without Skin), Frames per Second `30`, Keyframe Reduction `0`; named
    as the app is to call it (`Sitting Talking`). Each is 0.3–3.8 MB. It
    exports on the skeleton of the character selected at the time. A
    tile's text is its name and its description run together: pick by
    the whole text, since names repeat (three "Drinking"s).
- Don't `SendMessage` a subagent that is still working: the message can
  resume a second copy of it from its transcript, and the two then edit the
  same files and drive the same tab (2026-10-05: a duplicate publish, a
  reload mid-publish and a bake neither copy remembered starting).
- The walkthrough waits on its name prompt: fill `#name-input`, click
  `#name-input-button`, then an avatar (`.avatar-option`); wait for
  `body.walkthrough-active`. For stills alone, hide `.preloader`: the
  helpers, the realistic preview and the scope work without passing it.
- An editor tab opens under the editor's plain light with the houses alone
  drawn — by stand-ins, and at rest not drawn at all ("The editor's plain
  light and view scope", "When the editor draws"): `?preview=1` or
  `await __K.realistic()` before any frame that is judged for its light;
  `layers.enable(12)` on a Raycaster of your own; `userData.standIn`
  passed over by whatever walks the scene.
- three isn't on `window`: take constructors from live objects
  (`camera.position.constructor`) or import `/assets/three-<hash>.js`.
- Stub every non-GET fetch before driving the editor in a test tab
  (harness.js does; ad-hoc scripts don't): one unstubbed test autosaved a
  coffee table into the user's scene. A test server over a copy of the
  scenes (`SCENES_DIR`: SKILL.md §0) is the guard before that one. A stub that answers *every* non-GET
  swallows a publish too: after four minutes of walking the panel says
  "Couldn't publish: Cannot read properties of undefined (reading 'view')"
  — the stub's `{}` read as the server's answer (2026-10-11). Let
  `/publish`, `/versions/<v>/runtime` and `/bake` through, as harness.js
  does — and it does so by the path alone, on whatever server the tab is
  of: it looks at no port. So a publish clicked in a harnessed tab of a
  server whose `PUBLISH_DIR` is the repo's `published/` is a real one:
  publish only from a tab of the scratch publish server. The same stub answers a
  tool's own POSTs: results sent to a server of yours from a tab with
  harness.js loaded get `{}` back and never leave the page (2026-10-10: a
  profile's raw rounds, lost). Keep the page's real fetch before the
  harness is loaded (`window.__realFetch ??= window.fetch.bind(window)`),
  or post through the sink, which the stub lets through.
- Before reusing an earlier agent's tool, change the names it saves
  under: a frame-taker run as it was writes over the frames its author's
  report cites (2026-10-11: one grid of a review's, lost).
- A warning from a load's first frames is missed by a hook put in after
  the page has loaded, and a hidden tab draws no frames while it loads, so
  the warning may not come at all (2026-10-10: "Texture marked for update
  but no image data found", the terrain's normal map copied before its
  picture was in — seen in the pane's console, never by the hook). Start
  on the scene list (`/`, no space open), wrap `console.warn` there, load
  `drive.js`, `__driveOn()`, then click the space's card
  (`[data-scene="<id>"]`) and `__drive`: frames run from the first, as a
  visible tab draws them.
- Expected noise: a 404 for an unpublished space's manifest, and
  ERR_CONNECTION_REFUSED from the multiplayer socket. Find real failures
  with `performance.getEntriesByType("resource").filter(e =>
  e.responseStatus >= 400)`. Missing catalogue pieces mean the build the
  server serves is stale — the `dist` of the folder it was started in
  (SKILL.md §0): build again, into the same folder.

## In-page audits beyond walk.js

- **Door swing.** `walk.js` walks doors forced open; to check what a leaf
  sweeps, step each hinged door open in t = 0.1 … 1:
  `d.target = t; d.open = t - 0.01; d.update(0.01 / d.speed);
  d.group.updateMatrixWorld(true)` (open and target must differ by more
  than 0.001 or `isMoving` is false, and updating only the leaf's matrix
  leaves the hinge stale — the audit then passes falsely). Sample a 9 × 7
  grid on both leaf faces against the oriented boxes of furniture, stairs,
  rails and other walls, and a 0.8 m-deep passage box each side of the
  opening. Confirm box hits with rays along the leaf (0.08, 0.5, 1.0, 1.5,
  1.88 m up) before acting: cupboard hits were bounding-box artefacts.
  t = 1 is the leaf fully open at 93.6° (Doors, above).
- **Placement.** Over `sceneBuilder`'s furniture, walls and `spec.rooms`:
  sample points of each piece inside wall/trim oriented boxes (poking into
  walls); pieces whose base is > 3 cm above their room's floor (only
  pictures, mirrors, TVs should be); pieces in no room polygon; pieces
  meant against a wall (beds, nightstands, wardrobes, desks, vanities)
  whose back is 0.05–0.8 m off the nearest wall face.
- **What is that patch?** Cast a ray through the pixel from the same camera
  and read `hit.object.name` — in an editor tab with
  `raycaster.layers.enable(12)`, and past whatever is under the scene's
  "stand-ins" group: under the plain light the pixel is drawn by a
  stand-in, and the wall or piece it stands for is on layer 12 ("The
  editor's plain light and view scope"); re-render with the lightmap off to tell
  geometry from bake; recolour suspects one at a time; count pixels over a
  threshold rather than judging by eye. Render the same pose on the
  previous published version before blaming your change — an old fault is
  a separate task, not a fix in passing.

## Shell and tools on this Mac

- No `timeout`; foreground `sleep` is blocked. Wait with
  `until grep -qE 'Baked in|Traceback' log; do sleep 2; done` in a
  background command, or Monitor. A `pgrep -f` waiter matches itself.
  Long Blender jobs: `run_in_background` (foreground is cut at 600 s).
- sharp from scratch scripts:
  `createRequire("<repo>/")("sharp")`; it applies `extract` before
  `composite`, so composite into a buffer and crop in a second pass. Don't
  name scratch files after stdlib modules (`bisect.py`).
- Scripted edits: assert each anchor occurs exactly once; never use broad
  regexes. Import the generator with node before seeding to catch module
  errors.

## Git

- Commit, open PRs and merge only when asked. Stage only the feature's
  files when other work is uncommitted; never stage the temporary test
  entries in `.claude/launch.json` (`house-test`, `house-new`…). Leave the user's own scene
  edits out of commits unless asked, and say they are uncommitted. `gh` is
  installed and logged in. When a PR has merged, `git fetch`, confirm its
  commit is on main, and branch fresh from main for the next; delete a
  branch (locally and on origin) only when the user says so. If a PR merged
  before a late push, open a new one. Check a split of commits builds on
  its own in a scratch `git worktree`.

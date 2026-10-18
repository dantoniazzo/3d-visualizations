# The speed architecture and its rules

What the app does for speed now — a space gets it without asking, and can
spoil it — and the rules any change to the app's code must keep. The
user's terms (the highest frame rate in the editor and the public view
with the most realism kept; a new feature must not slow down what was
there, and must cost as little as possible when used) are in the repo's
`CLAUDE.md`; how the numbers were taken is `measuring.md`; every figure is
this M4 Pro's, its pane hidden (SKILL.md, "The low end was never
measured"). The mechanisms are owned elsewhere: the editor's (PlainLight,
Scope, StandIns, the rays' index, TreeKeeper, Pace, SelectionOutline) by
`../walkthrough-editor/`, what a visitor is given and how a baked view is
lit and drawn by `../baked-view-lighting/`. This file holds what they
cost, what they bought, and the rules that keep them.

## The rules, for any code that runs in a frame

- Costs are draw calls and live lights, not triangles ("Lights,
  furniture parts and sashes as draws", below).
- A light at intensity 0 is still a light: three builds every lit shader
  for the count of lights and each lit pixel pays for it. Hide it
  (`visible = false`), or in the editor keep it off every layer
  (`world.plainLight?.keepOut`); let in for one frame, it has every shader
  built again.
- **Never give a scene object a property of its own** (`mesh.foo = …`,
  even `mesh.raycast = …` or `mesh.boundingSphere = …`, least of all
  `delete`): it makes that object another kind of object to V8 — to the
  engine — from then on, and three's draw loop and every ray read all of
  them: 2 ms a frame on one ray, measured. Measured here: a
  property on four meshes in five made the crosshair's ray 2 ms a frame
  slower (5.5 → 7.4 ms on Ladonia); one on the 441 stand-ins made the
  realistic preview, which does not even draw them, 1.5–2 ms a frame
  slower. Use what is there: `layers`, `userData`, `visible`. (A mesh
  with a `boundingSphere` of its own, hooks of its own, a `renderOrder`
  or a draw range is left to draw itself: `kindOf`.)
- A hundred-odd small parts that each ask something every frame (the
  probes' light, a matrix brought up to date) add up to milliseconds:
  skip what is at rest (`ProbeLight` 3.2 → 0.3–0.5 ms with 475 parts).
- three keys every program by how many lights of each kind the scene has
  — a ShaderMaterial that takes no light included — but only rebuilds the
  programs of materials that take light when the lights change. A shader
  made ahead "at load" is made for the load's lights: one first drawn
  after N was built in that frame. Make a new mesh's programs before it is
  first drawn, for the lights there are then, and hold it back till then
  (`Water.hold`, through `Renderer.build`).
- That includes the shadow maps' depth materials, which read no light:
  their programs are keyed by the light counts too, three draws the shadow
  maps before it takes the frame's lights, and its one shared depth
  material changes program at each change of the kind it draws (rigged,
  instanced, plain — 17 times a pass at A1's kitchen). A light let in by
  day therefore built six programs in the frame after it, where every lit
  material's had been built ahead. Build those too (`Renderer.shadowDraws`,
  `shadowTwins`: the next pass watched, its programs built again with the
  light in, in an empty scene, into a picture).
- A group's `matrixWorldAutoUpdate = false` holds nothing still while the
  Scene over it has `matrixAutoUpdate` true: three's `updateMatrixWorld`
  forces the walk down from every node whose matrix it composes, so all of
  Ladonia's 5,876 objects were walked and multiplied every frame. Hold the
  Scene itself still (`SceneBuilder.holdStill`); then whatever moves under
  a held group must update its own world matrix (Door.update,
  WindowSash.place, Openables.lend).
- What nothing draws is never built: parts merged away into one mesh
  (`World/ShutBatcher.js`) built their own programs in the frame they were
  first opened. Build such shaders ahead, by one mesh a program, and again
  when a light comes in (`ShutBatcher.prepareOwn`, `Renderer.buildFor`).
- Never call `renderer.compile(scene, camera)` on the whole scene to build
  shaders ahead: it builds a new program for every *unlit* material too
  (a baked house's 2,000 MeshBasic), which three itself never rebuilds on
  a change of lights. `prepareLights` hands `compile` only what takes
  light, through a stand-in for the scene
  (`../walkthrough-editor/lights-and-fittings.md`; the handle,
  `../walkthrough-editor/links-and-handles.md`: shaders built ahead, the
  programs built in a frame counted, shadow programs keyed `depth,` /
  `distance,`).
- three r163's rules that cost the live room time to find
  (`../baked-view-lighting/live-room.md`, What cost time to find), each a
  rule for whoever changes the code near them:
  - a GPU pipeline is made per kind of picture a program first draws into
    (draw ahead into a picture of the view's own kind, and uncull what is
    drawn ahead, or it has drawn nothing);
  - a depth program is built for the light counts of the call it is used
    in, as that call's last render left them (`primeShadows`: the call
    made twice, no map due, then every map due);
  - a manual `matrixWorld` does not survive a frame (put the world matrix
    in `matrix`, `matrixAutoUpdate` off, under an identity parent), and
    `eye.copy(camera)` copies `matrixAutoUpdate`;
  - hiding an object hides its children (take what must not be drawn off
    every layer instead);
  - whatever walks the whole scene's materials must pass over
    `userData.roomLive`;
  - put materials back in the order opposite to the one they were put on
    in;
  - time a walk with the camera posed where the eyes are in first-person
    mode (`e.camera.setFirstPerson()`; in third person the visitor's own
    figure cost +3.5 ms a frame).
- Whatever moves under a group held still updates its own world matrix,
  and anything new in a public view that the probes light, or that moves,
  follows "So, for anything new in a public view" below.

## The editor opens cheap

- **The editor opens cheap**: one plain light and the houses alone, until
  the look (**P**, Realistic preview) or more of the site (the *Show*
  menu) is asked for — and under that light it draws the house merged
  and the furniture instanced (stand-ins: the scene's own objects are
  untouched), answers every ray from an index, mends its collision trees
  after an edit, outlines a selection without drawing the scene twice,
  and draws a frame only when something has changed. Ladonia on this Mac,
  the committed code → the plain light (2026-10-12) → this (2026-10-14):
  edit mode over the whole property 45 ms a frame → 22–24 → 10.9 (9,541
  draw calls → 1,438), one villa 48 → 18–20 → 10.3, a view of one room
  (nothing in focus) 24.5 → 6.6 → 5.9; a piece selected over a villa 66 →
  34 → 12; and since the plain light, walking by the pool 37 → 12 for the
  whole frame, a drag's pointer move 101 ms → 2.8, leaving edit mode after
  an edit 2.4–3.0 s → 26–32 ms, an edit view left alone 19 frames in 10
  s. Opening to a furnished, walkable scene: 6.4–8.2 s → 4.3–4.5 in the
  first sitting, 6.5–6.7 → 2.2–4.1 in the second — the same build read
  4.3–4.5 in the one and 6.5–6.7 in the other (the second drove the load
  flat out in an iframe), so each pair compares and the two do not chain.
  What is left there: some 1,400 draw calls of what is one of a kind,
  see-through or moving; nothing gained in a view of one room, and a room
  in focus half a millisecond slower (3.7 → 4.2 ms). Wrenfield's walk
  indoors, found slower by the final measurement, was mended on the 14th
  (`../walkthrough-editor/history.md`, 2026-10-13). Since wave C
  (2026-10-16) what the stand-ins draw is also held still, and the units they draw entirely are
  left out of three's own pass over the scene (`StandIns.hold`,
  `drawnScene`; `?still=0` compares; `node scripts/test-standins.mjs`):
  1.6–1.9 ms a frame, three's walk of the matrices 1.52 → 0.22 ms. With
  the opening furniture in, the editor is at or under HEAD at A1's
  kitchen and living room, the upper U kitchen and in edit mode.
  Whatever moves or is added deep inside a held unit must work out its
  own world matrix (`in-page-tools.md`; the rules above).
- To check the stand-ins and their hold: `hold-check.js` (this skill's
  folder: `__hold.audit()`, `same(label)` — the held units against
  three's own walk and against the frame let go); the comparison words
  `?standins=0`, `?shut=0` and `?still=0` (`test-tabs.md`, A link's
  words); `node scripts/test-standins.mjs` (`node-tests.md`); the hold's
  own measurements are in `../walkthrough-editor/stand-ins.md`.
- The rays' index and the kept collision trees — what they bought, and
  the rule to time the walk, not only the edit, after touching how a tree
  is cut — are `../walkthrough-editor/rays-and-collision.md`; their tests
  `test-collision-tree.mjs` (`node-tests.md`) and `walk.js`
  (`in-page-tools.md`).

### What it bought, measured

- **What it bought** — two measurements, each two builds taking turns in
  one sitting (`measuring.md`): median ms a frame, step 4, 1280 × 720 CSS at
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
    demand and the outline* (2026-10-14: that build → this one; the
    mechanisms are `../walkthrough-editor/stand-ins.md`,
    `../walkthrough-editor/rays-and-collision.md` and
    `../walkthrough-editor/frames-on-demand.md`). Ladonia's whole
    property 24.3 → 10.9 (41 → 92 a second; 9,541 → 1,438 draw calls), one villa 20.0 →
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
    collision tree: `../walkthrough-editor/rays-and-collision.md`; mended
    on the 14th, `../walkthrough-editor/history.md`, 2026-10-13); the realistic
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

### Resolution while moving: measured, not built

- **Resolution while moving was measured and not built**: orbiting
  Ladonia's whole property at pixel ratio 2, 1.5 and 1 (1832 × 1324, 1374 ×
  993, 916 × 662), best / median ms a frame 9.7 / 10.2, 9.2 / 9.9 and 8.9 /
  9.3; one villa 8.9 / 9.1, 8.4 / 8.9, 8.0 / 8.4 — 0.2–0.5 ms for ratio
  1.5 and 0.7–0.9 for ratio 1, where 6.2 of the 10.2 ms is three's own time
  in `render()`: the frame is still draw calls, and a change of ratio
  reallocates the canvas and sharpens visibly on release. In a 1920 × 1200
  window, where the step's five million pixels cap the ratio at 1.68 (2610
  × 1915), ratio 1 buys 1.2–1.5 ms and ratio 1.5 0.4; Wrenfield 0.2–0.5.

## Lights, furniture parts and sashes as draws

- Costs are draw calls and live lights, not triangles. A light at nothing
  costs every lit pixel what a lit one does, and three builds each lit
  shader for the number of lights there are: a light that is off is out
  of the scene, hidden, never dimmed to 0; in the editor anything that
  makes a light hands it to `world.plainLight?.keepOut`. A light inside a
  piece (a fridge's) is one light lent round, not one each (Ladonia's 15
  dark fridge lights cost 4–6 ms a frame). It stays out of the scene,
  hidden, until one of its kind is lit (at intensity 0 it cost 0.2 ms of
  A1's living room). It comes in only once its shaders, and the shadow
  maps' for the new count of lights, are built (`Openables.warmAll` at
  load: about 70 programs paced over 2.4 s on a first visit). It goes out
  4 s after the last is shut (`LINGER`).
- A furniture part or a window's sash is a draw call of its own only
  while it moves or stands open. Ladonia has 475 parts (every front of
  its kitchens, wardrobes and storage since 2026-10-16) and 59 sashes;
  drawn one by one they took a baked view's kitchen frame from 13.1 to
  16–17 ms (+609 calls).
  - Shut, the editor draws a piece whole, one mesh a material, by a model
    shared by every piece of the same file and finishes
    (`World/StandIns.js`): 170 pieces from 45 models; A1's kitchen 1,138
    → 910 draws.
  - A public view merges every shut part and sash by look as it loads
    (`World/ShutBatcher.js`): 534 entries in 21 meshes, each part's floor
    kept for the view from above, a window's panes one glass mesh while
    its sashes are shut. A1's kitchen 1,499 → 1,056 draws, against 1,038
    for the version before. Their own shaders are made ahead, since
    nothing draws them until one opens. `?shut=0` compares.
  - So a fitted piece costs its materials, not its fronts: give it no
    more than its look needs (a Ladonia kitchen has about 20, its
    fridge's liner and glass among them).
  - Still a draw each: glass on a part (a washer's porthole, a shower's
    door: two-sided, in two renders — 48 draws a frame at A1's living
    room, most behind walls); lamp glass; door leaves; a baked view's
    fixed panes.
  - Over the 12 October version the shut fronts also cost their light:
    lit by the probes where the house was lightmapped (the upper U kitchen
    1.1 ms). A bake output for shut parts is the user's to decide
    (`../baked-view-lighting/merged-house.md`).
- **What is left, and the user's to decide** (wave C, 2026-10-16/17;
  2048 × 1536, step 4; the final check, each comparison run both ways
  round: below, What runs every frame › Measured):
  - A public view of the version with the opening furniture, windows and
    water costs +0.08 to +0.35 ms over the user's 12 October version at
    the same spots with no water running (A1's living room +0.35, GPU
    +0.24), and +0.62 with a hot shower running, about +0.5 of it the
    water. Earlier sittings read A1's living room at +0.1, +0.8 to +1.15
    and 0.0 / +0.45 by their tab set-up; the GPU's +0.2–0.25 and the
    draws (+30–36) held in every one.
  - The 12 October version itself is 0.15–0.53 ms faster on this build
    than on HEAD; the editor −0.55 to +0.08.
  - The rest is new content: part glass drawn two-sided in two renders,
    more draws, a longer look ray. Two-sided transparent glass costs
    1.1–1.7 ms of CPU at A1's living room in either version, because
    three draws it twice a draw.
  - Cutting that changes the look (`forceSinglePass` on part glass, or
    shut part glass merged across pieces, which changes how glass sorts):
    ask before doing it.

## What a public view runs every frame

### `holdStill`

From the list of how a baked view's shut parts are drawn
(`../baked-view-lighting/merged-house.md`, Shut parts); it is the matrix
walk's rule, so it is kept here.

- **`holdStill`** (SceneBuilder): a public view's root, shell and its
  children, door groups, openable group, fixtures, vehicles, see-through
  group and its panes, and fixture holders have their matrices worked
  out once. Before, the root's update forced every matrix under it to be
  worked out again at each of the frame's three renders. The see-through
  and shut groups are passed over altogether. The matrix walk went from
  1.7 to 1.4 ms (the version before: 1.2). **Anything that later moves
  one of those must call `updateMatrix` itself.**
  - Wave C found that this had never taken effect: three's
    `updateMatrixWorld` forces the walk down from any node whose matrix
    it composes, and the Scene itself had `matrixAutoUpdate` true, so all
    5,876 objects of Ladonia's new version were walked and multiplied
    every frame, whatever their groups said. The Scene and the merged
    house (`batches`, 722 objects) are now held still too, and passed
    over with the see-through group, the shut group, the light targets
    and a public view's people (`matrixWorldAutoUpdate` false): the walk
    alone 0.42 → 0.21 ms. **Whatever moves under one of these updates
    its own world matrix.**
  - Fixture holders that draw nothing (171 water, control and steam
    anchors) are hidden — not those that hang a lamp inside a piece.
    Water judges an anchor by what it hangs from. The 269 light-target
    boxes are hidden and held still (rays still meet them; `pickLight`
    unchanged): they were tested against the view in each of the three
    renders, 0.2 ms.

### What runs every frame, and what doesn't

- **What runs every frame, and what doesn't** (wave C of 2026-10-16: the
  frame time won back for the opening furniture, the windows and the
  water, which had made the new version 0.6–1.5 ms slower than the user's
  12 Oct one at the same spots, and the build itself 0.4–0.6 ms slower
  than HEAD on the 12 Oct version):
  - *The matrix walk*: the Scene and the merged house held still, the
    light targets and empty fixture holders hidden (`holdStill`, above).
  - *The shut parts*: one merged mesh a look (21, not 68); sashes with
    nothing of their own hidden at their group; a fridge's shelves on no
    layer behind its shut doors (`../baked-view-lighting/merged-house.md`,
    Shut parts).
  - *The pooled lights inside furniture* (a fridge's spot, Openables) are
    out of the scene's light — hidden — until one of their kind is lit:
    every lit shader pays for every light in the scene, at intensity 0
    too (0.2 ms of A1's living room, the GPU 0.3). They come in once their
    shaders are built (Renderer.prepareLights, `paced`: three set going at
    a time, each new program drawn ahead in a frame of its own), and go
    out LINGER (4 s) after the last is shut.
    - The shaders are built ahead after the parts' own (drawLight →
      `openables.warmAll`), and again when a part of a fridge's piece is
      aimed at (`warm`), if the view has built shaders since. On a first
      visit's cache (simulated: every shader given a name of the load's
      own) the warm at the spawn was 68 programs in 2.4 s in the
      background: frames median 10.8 → 11.0 ms, p95 12.3 → 15.5, none
      over 50 ms. Wave B, the light always there, stopped a frame for
      0.44–0.57 s at the first opening instead.
    - The shadow maps' programs are built ahead too (integration of wave
      C: Renderer.shadowDraws, shadowTwins, build's `shadows`). three keys
      a depth material's program by the light counts though it reads no
      light, draws the shadow maps before it takes the frame's lights,
      and its one shared depth material changes program at every change
      of kind it draws — rigged people, instanced plants, the rest:
      17 times a pass at A1's kitchen. So the frame after the light came
      in built six programs in the frame (35–43 ms on a warm cache, 0.7 s
      cold) unless the warm had happened to make them. The next shadow
      pass is watched (the sun's drawn again for it), each program it
      drew with is copied with what it drew, and those copies are built
      with the light in, in an empty scene and into a picture as the pass
      draws, so that three finds them by key. After: no program built in
      any frame of a first opening, warm or cold; re-opened, the light in
      at the next frame as before. Measured with `light-in.js` (in this
      skill's folder: a fridge opened as a first visitor opens it, every frame
      timed until its light has been in a second) after `cold.js` and
      `coldsplit.js` (which frame built what, and where).
  - *ProbeLight* (`ProbeLight.update`; the parts' skip a fix of
    2026-10-16 before wave C, the rest wave C): anything at rest in the light there is
    now is passed over, nothing sampled or dressed — a part by its own say
    (not moving, its light settled within `SETTLED`, 1e-4 of the open
    garden's daylight, of what it is taking on: the compose key and the
    indoor gain), anything else (people, door leaves, cars, visitors) by
    its world matrix as last drawn. Ladonia's 475 parts, sampled and
    dressed every frame, took 3.2 ms of the main thread where the
    visitors, the people, the cars and the leaves take 0.3–0.5; with 437
    parts added to the 141 roots of a baked test version, `probes.update`
    is 0.3–0.5 ms a call (1.7–2.6 with the skip defeated), the first call
    after they come 13 ms once (their materials); the rest's skip, 0.5 ms
    of either version. A part opened is sampled while it moves and rests
    again once settled. Light changes are counted (`epoch`) instead of a
    key string each frame; the list of what it lights is rebuilt only
    when something comes or goes (`roots`, by `markOf` / `same`); whether
    a resting thing still wears its dressing is asked once in 8 frames
    (`DRESSED_EVERY`, `stillDressed`; it was 60 µs a frame — only a room
    shown live dresses things otherwise, and it marks its meshes).
    LiveLamps' and LampPool's `moved()` do not work out a resting part's
    matrix again (the last frame drawn did): 0.28 → 0.10 ms with 578
    roots. Probe-lit shaders skip the sun's shadow and shading where the
    probes give the sun no share (`probeSun > 0.0`: 434 of 475 parts).
    The probes' light and that gate are put into three r163's
    `lights_fragment_begin` by its text (`probeLightsBegin`, `SUN_LOOP`):
    after an upgrade of three look for "Probe light not applied: three's
    shader has changed" in the console — whatever is probe-lit would then
    keep three's own ambient light and sun, and the parts would no longer
    match their bake.
    - **So, for anything new in a public view**: a thing the probes light
      (a part, a door leaf, a car, a person, a visitor) that is given
      another material while it stands still keeps it for at most 8
      frames — `stillDressed` finds it undressed and dresses it again;
      mark its meshes `userData.roomLive` while they wear it, as the live
      room does. A mesh added under a root the probes already light and
      at rest is not dressed until that root moves or the light changes:
      `entry.meshes`, what `stillDressed` looks over, is listed once, at
      its first dressing. And a new kind of thing that moves and should be
      lit by the probes, or should have the sun's shade map drawn again
      when it moves, goes into `ProbeLight.roots()` or `LiveLamps.movers()`
      and into what their `markOf` / `same` compare: both lists are made
      again only when those change.
  - *The glass-door race* (a glazed door leaf dressed by the probes after
    the sky's first glazing): `../baked-view-lighting/` has it; forced on
    purpose by `glass-race.js` (this skill's folder), and the testing
    lesson is SKILL.md's "A fault in one load of several is an order of
    arrival".
  - *People* (public view): the group held still, and a rig not animated
    this frame passed over by the walk (`passOver`: its group's
    `matrixWorldAutoUpdate` set each tick by whether it was turned). Its
    bones' world matrices are then the last render's: a tool that steps
    `world.update` without rendering (act.js, a timing loop) reads them
    stale until that person's next turn — render once before measuring a
    figure; the app always renders after the update. The editor moves
    people, and walks them all.
  - *LiveLamps*: settled parts and sashes passed over, the movers list
    kept.
  - *PostProcessing*: `drawTransparency` takes what goes into N8AO's two
    pictures of what is seen through, and what to hide meanwhile, from
    what its beauty pass has just drawn (`renderer.renderLists.get(scene,
    0)`, read before either picture is drawn, since drawing one begins the
    lists again) — not by walking and hiding the whole scene, which was
    0.2–0.35 ms a frame over the 3,400 objects Ladonia's new version
    shows (`../baked-view-lighting/tone-ao-colour.md`). So something new that should ease the
    ambient occlusion behind it must be drawn in that pass, on the
    camera's layers and in its view; what a call of its own draws (a live
    room's glass) is drawn into those pictures by that call (`LiveRoom`'s
    `veil`).
  - **The rule**: whatever moves under a group held still updates its own
    world matrix (SceneBuilder.holdStill's comment), as Door.update (the
    hinge), WindowSash.place (the turn) and Openables.lend (the lamp and
    its target) do.
  - **Measured** (2048 × 1536, step 4, two tabs taking turns, paired
    medians). The figures to quote are the final check's (verifyC,
    2026-10-17, on the final build, each comparison run both ways round —
    the tabs swapped — and the two runs' paired medians averaged, load
    2.3–3.3):
    - The user's 12 Oct version on this build against HEAD, render: A1
      living −0.53, pool −0.15, A1 bathroom −0.53, bird's-eye −0.53 ms
      (driving from above and seated have no HEAD to compare: HEAD can do
      neither). It includes the new pool water (GPU +0.15 at the pool
      spot: `../visitor-interactions/pool-water.md`). The editor against HEAD, the same way:
      −0.55 to +0.08 (`../walkthrough-editor/stand-ins.md`, the hold).
    - The new version (with the opening furniture) over the 12 Oct one,
      on this build — **within the +0.5 ms aimed at wherever no water
      runs**:

      | spot | render | GPU timer | draws |
      |---|---|---|---|
      | A1 living | +0.35 | +0.24 | 1,102 → 1,132 |
      | pool | +0.15 | +0.11 | 424 → 430 |
      | A1 bathroom, dry | +0.13 | +0.13 | 672 → 680 |
      | A1 bathroom, corner shower hot | +0.62 | +0.59 | 671 → 688 |
      | seated, TV on | +0.25 | +0.25 | 1,088 → 1,114 |
      | bird's-eye, ground floor | +0.08 | +0.13 | 444 → 462 |
      | driving from above | +0.08 | +0.06 | 347 → 356 |

      Of the hot shower's +0.62 the water is about +0.5 (lane H's own
      budget for it was +1 ms). The first tab of a pair read 0.4–1.2 ms
      faster whichever build it held, which is why each comparison is run
      both ways round (`measuring.md`).
    - The sittings before it read otherwise, by their tab set-up: A1
      living +0.1 (a first measurement that did not reproduce), +0.8 to
      +1.15 (lane K's three runs), 0.0 / +0.45 (the integration's two),
      +0.35 (this). The CPU half moved with the tabs (an old-version tab
      at A1's living room swung by a millisecond of CPU from round to
      round); the GPU's +0.2–0.25 and the draws (+30–36) held in every one.
    - What is left is new content: part glass drawing itself (washing
      machines' portholes 32 draws a frame, shower doors 16: two-sided,
      in two renders), more draws, and a longer look ray over more
      things to aim at (+0.11 ms). Cutting the glass is a look decision
      (`forceSinglePass` on part glass, or shut part glass merged across
      pieces, which changes how glass sorts); not taken.

## Tried and not built, or left to the user

- A lower resolution while the editor moves ("Resolution while moving",
  above): the frame is draw calls, not pixels.
- `forceSinglePass` on part glass, or shut part glass merged across
  pieces (which changes how glass sorts): a look decision — ask before
  doing it.
- Splitting each piece of double-sided glass into a back and a front
  material: kept the draws and saved nothing (wave C, measured).
- A bake output for shut parts, so that shut fronts are lit from the bake
  rather than live by the probes (the upper U kitchen's 1.1 ms): the
  user's to decide.

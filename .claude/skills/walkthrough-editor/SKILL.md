---
name: walkthrough-editor
description: "The editor and the walkthrough's world (/?scene=<id>): the spec and validator, the editor's plain light and view scope, stand-ins, rays and the collision trees, the colliders view (C), frames on demand and the outline, lights and fittings, doors, finishes. Use when changing the editor, the world's building code, collision or the walkthrough's core."
---

# The walkthrough editor and its world

The app at `/?scene=<id>` — the editor (edit mode, **Tab**) and its
walkthrough — and the world code under it that a publish and a public
view share: what the server keeps of a scene, how the world is built,
drawn, cast at and walked against. The worked examples are Ladonia
(`kosinozici-villas`), Wrenfield and Ashgrove. Every figure in these files
is one Mac's (an Apple M4 Pro), its pane hidden, unless it says otherwise.

What is somewhere else:

- building a space's content (rooms, walls, furniture, finishes,
  landscape) and its checks: ../build-property-space/SKILL.md;
- what a visitor can do (E, Q, the HUD, sitting, opening, water, driving,
  swimming): ../visitor-interactions/SKILL.md;
- how a published view is lit and drawn from its bake:
  ../baked-view-lighting/SKILL.md;
- publishing and baking: ../publish-and-bake/SKILL.md;
- the scene's people and the avatars' clips: ../space-people/SKILL.md;
- testing and timing anything in a browser, the in-page tools and the
  speed architecture's rules: ../app-testing-and-performance/SKILL.md —
  read it before the first test tab.

## The rules that hold here

The repo's standing rules are in ../../../CLAUDE.md (always loaded). The
ones this work meets most:

- **Speed is the user's standing term**: "I want the frame rate both in
  the editor and in the public view to be as high as possible" — a new
  feature must not slow down what was there and must cost as little as
  possible when used. Measure against HEAD at the same spots, in pairs and
  both ways round (../app-testing-and-performance/SKILL.md). What the
  editor's mechanisms bought (Ladonia's whole property 45 ms a frame →
  22–24 under the plain light → 10.9 with the stand-ins, 9,541 → 1,438
  draw calls) and what is left: ../app-testing-and-performance/speed-architecture.md.
- **Never touch the user's server on 3000 or the repo's `dist/` while
  working**: build into the scratch folder and test on servers of your own
  over a copy of the scenes (../app-testing-and-performance/test-servers.md).
  A test server runs the repo's `server/` and `shared/` as they stood when
  it started: restart it after a validator, catalogue or finish change.
- **Seeding**: always `npm run seed -- <id>`, never bare; back up every
  `scenes/*.json` before any seed, where a restart keeps it; never
  `git checkout` a scene file (spec-and-validator.md).
- **Before saying an app change is done**: the no-undef lint
  (`undef.config.mjs`: 0 errors and the one old `EditorUI.js:1358`
  warning — run it after moving code between files), every
  `scripts/test-*.mjs`, and `JSON.stringify(__act.run())` in an editor tab
  and a public view against the base server's
  (../app-testing-and-performance/SKILL.md, before saying an app change
  is done).
- **End the report with the user's steps**: `npm run build` if frontend or
  `public/` changed and `dist/` was left alone; reload every open app tab
  before editing (an old tab autosaves its old scene over the fix);
  restart `npm start` if server code changed (a new validator field is
  dropped by their server until then); publish and bake again to see it in
  `/view/<id>`.
- **Say of every editor frame and timing which light and scope it was
  taken in** — plain or the realistic preview, House, Exterior or All —
  and of any frame whether it is plain, lit live, or baked and in which
  mode.

## Read before

- **Adding a field to the spec**, or anything the server keeps:
  spec-and-validator.md, then ../build-property-space/spec-fields.md
  (which you update with the validator).
- **Taking a frame or a reading in an editor tab**:
  editor-plain-light-and-scope.md — what opens is one plain light, the
  houses alone, drawn by stand-ins — and
  ../app-testing-and-performance/browser-testing.md.
- **Waiting for frames in an editor tab, adding anything that changes the
  picture without the user's hand, or touching what `Editor.render` draws
  after the scene**: frames-on-demand.md.
- **Writing a Raycaster, a helper that walks the scene, or anything moved
  or added inside a wall or a piece**: stand-ins.md.
- **Adding a ray, a thing that moves by itself, or anything that reads
  `world.collision`**: rays-and-collision.md.
- **Adding anything that collides outside the trees, or judging a frame
  with the colliders shown**: colliders-view.md.
- **Making a light, or touching switching**: lights-and-fittings.md.
- **Touching door leaves**: doors.md; a piece's catalogue entry and how it
  collides: ../build-property-space/furniture-catalogue.md (and, for
  modelling a piece whose fronts open, ../build-property-space/SKILL.md).
- **Materials, textures, colours, packed models**: three-pitfalls.md.
- **A link's words or a test tab's handles**: links-and-handles.md.

## The pieces, and where each is

- The spec and the validator: `server/scene/validate.js` (field by field),
  `shared/garden.js` (`GARDEN`), `shared/landscape.js`
  (`sanitizeLandscape`); the editor's collections `Editor/Collections.js`
  (spec-and-validator.md).
- The plain light and the scope: `World/PlainLight.js`, `World/Scope.js`;
  the realistic preview **P** (`world.setPreview`) and `holdRealistic` for
  a publish (editor-plain-light-and-scope.md).
- The stand-ins: `World/StandIns.js`, `Utils/layers.js` (`REAL_LAYER` 12,
  `seeReal`); the hold (`StandIns.hold`, `drawnScene`) (stand-ins.md).
- Rays: `Utils/rays.js` (`world.rays`: `cast`, `into`, `hold`, `through`,
  `touch`). Collision: `World/Collision.js` (`TreeKeeper`,
  `buildOctree`, `rayIntersect`, `capsuleIntersect`, `revision`,
  `meets`/`meetsAny`/`anyIn`), `SceneBuilder.staticKeeper` /
  `dynamicKeeper`, `refreshCollision`, `settleCollision`,
  `SceneBuilder.collisionOf` (rays-and-collision.md).
- The colliders drawn: `Experience/Colliders.js` (`experience.colliders`),
  `World/ColliderView.js` (colliders-view.md).
- Frames on demand: `Experience/Pace.js` (`experience.pace`,
  `experience.wake`); the outline `Editor/SelectionOutline.js`
  (frames-on-demand.md).
- Lights: `World/Fittings.js` (`gatherLights`, `aimedAt`, `distinguish`),
  `LiveSwitches.js`, `LampPool.js`, `RoomGlow.js`, `LiveBulbs.js`,
  `Renderer.prepareLights`, `Flora/lights.js` (lights-and-fittings.md).
- Doors: `Door.update`, `BLOCKING_THRESHOLD`,
  `SceneBuilder.resolveDoorCollisions` (doors.md).
- Finishes: `World/Builders/TextureLibrary.js`'s `GENERATORS` and
  `shared/catalog.js` are world building code (Finishes, below).

## Method: changing the editor or the world

1. Find the subsystem in the list above and read its file; read the
   history (history.md) only when a date, a figure's provenance or a
   "Still short" matters.
2. Build into a scratch folder and open your own test server's editor tab
   (../app-testing-and-performance/test-servers.md), `boot.js` first. Note
   which light and scope the tab is in; ask for the realistic preview or
   `?scope=all` before judging the look or anything out of doors.
3. As you write, go through what each kind of change asks of the rest of
   the editor:
   - **A new spec field**: add it to `validate.js` (or it is dropped on
     seed and on every save), check it survives `npm run seed -- <id>` and
     an editor save, restart the test server, update
     ../build-property-space/spec-fields.md, and tell the user to restart
     theirs.
   - **A ray**: through `rays.cast` (or `rays.into` for one piece); in the
     editor its raycaster needs `seeReal` (`layers.enable(12)`).
   - **Something that moves by itself** inside a wall or a piece: a flag
     the ray index looks for (`userData.doorLeaf`, `hingeSide`, `opens`,
     or `userData.kind === "car"`) or a unit of its own; it works out its
     own world matrix under a held unit (as `Door.update`,
     `WindowSash.place`, `Openables.lend` do); it tells frames on demand
     (an emitted event, `experience.wake(why)`, a line in `Pace.busy()`,
     or its provider's `busy()`); if it bars the way outside the trees,
     `experience.colliders.register`.
   - **A geometry reshaped in place**: `position.needsUpdate` and
     `rays.touch()`; a unit the stand-ins draw is built again rather than
     moved in place, and a change that emits nothing is followed by
     `world.standIns.hear()`.
   - **Something added deep inside a unit** (a marker, a helper): on the
     unit's root itself, or in a group of its own in `experience.scene`,
     as Water and Screens do.
   - **A light**: handed to `world.plainLight?.keepOut(light)` where it is
     made; out of the scene (`visible = false`) when off, never dimmed to
     0; its shaders built ahead (`renderer.prepareLights`); a visible
     fitting for it.
   - **Something new drawn out of doors** that is no collection's: hidden
     in `Scope.apply`, or it shows in House.
   - **A module's own group outside `builder.root`** (the water, a TV's
     picture): it hides itself from above by
     `birdView.floorAt(x, y, z) <= shown` — `floorAt`, not `levelAt`
     (../baked-view-lighting/birds-eye.md).
   - **A new invisible blocker or ramp**: its name and label in
     `BLOCKER_NAMES`/`BLOCKER_LABELS` or `STEP_NAMES`/`STEP_LABELS`, or it
     draws as building (colliders-view.md).
   - **How a tree is cut, or how anything collides**: time the walk, not
     only the edit; fold the tree against the build before's
     (`node scripts/test-collision-tree.mjs`); grep
     ../build-property-space/checks/ for copies of the old rule.
   - **What `Editor.render` draws after the scene**: nothing over the
     scene's depth between `renderer.render` and `outline.render`, the
     canvas the render target throughout.
4. Check it: the node tests that hold this skill's parts
   (`test-collision-tree.mjs`, `test-collider-view.mjs`,
   `test-standins.mjs`, `test-capsule-through.mjs`;
   ../app-testing-and-performance/node-tests.md); `hold-check.js` after
   anything that moves under a held unit; `walk.js` after anything that
   touches collision (`sceneBuilder.settleCollision()` first after an
   edit); frames against the build before's, in pairs, both ways round.
5. Run the three checks before calling it done (The rules, above), then
   write the user's steps into the report.

## Pitfalls already hit (don't repeat)

- Static batching drops custom attributes: list them in
  `material.userData.attributes` (the terrain's `paint`).
- A cap by quality step must not hold in the editor's edit mode, or what
  is being placed can be neither seen nor picked (the people's cap by
  step: ../space-people/SKILL.md).
- Cut from a wider box, a collision tree is another tree: room given
  round the furniture's, so that a piece carried outside would be a mend,
  left Wrenfield's two levels deep and its walk indoors 5 ms a frame
  slower — taken out the same day (the box is the furniture's own again,
  the tree the build before's). After touching how a tree is cut, time
  the walk, not only the edit, and fold the tree against the build
  before's (rays-and-collision.md; `node
  scripts/test-collision-tree.mjs`).
- Whatever depends on where the eye is — which faces to draw, a depth test,
  an order against glass, the frustum — must be worked out after the
  camera is placed for the frame (`World.afterCamera`), not in
  World.update before it: the third-person boom snaps, and a frame drew a
  shower's steam inside out (../visitor-interactions/SKILL.md for the
  steam and the pool).
- OrbitControls takes its radius from where the camera is: move the camera
  after it and the next update reads a shorter boom. Limit it instead
  (`maxPolarAngle`, `Camera.dryOrbit`): the boom shrank for good over the
  pool.
- A light at intensity 0 is still a light: three builds every lit shader
  for the count of lights and each lit pixel pays for it. Hide it
  (`visible = false`), or in the editor keep it off every layer
  (`world.plainLight?.keepOut`); let in for one frame, it has every shader
  built again (../app-testing-and-performance/speed-architecture.md).
- The stand-ins (stand-ins.md):
  - a new Raycaster in the editor needs `seeReal` (`layers.enable(12)`),
    or it passes through everything a stand-in draws;
  - a measurer that walks the scene must pass over `userData.standIn`, or
    it has every surface twice (`zfight.js` called 552 of Wrenfield's 615
    clusters a surface against its own copy);
  - code that moves a unit in place leaves its stand-in where it was:
    build it again instead;
  - a change inside a unit that emits nothing is drawn up to 16 frames
    late: `world.standIns.hear()`;
  - before disposing a lifted geometry, take the model's shared
    attributes off it: disposing a geometry frees every attribute buffer
    it holds on the GPU, the shared ones too;
  - whatever moves deep inside a held unit works out its own world
    matrix, and what is added below a unit root's own children is neither
    drawn nor placed for about 320 frames on Ladonia: add new meshes to
    the unit's root or to a group of their own in `experience.scene`.
- Rays and the trees (rays-and-collision.md):
  - every ray goes through `rays.cast`;
  - something new that moves by itself inside a wall or a piece needs a
    flag (`doorLeaf`, `hingeSide`, `opens` or a car's `kind`) or must be a
    unit of its own;
  - code that reshapes a geometry in place sets `position.needsUpdate`
    and calls `rays.touch()`;
  - a test that reads the tree after an edit calls `settleCollision()`
    first (or drives frames until `!builder.dynamicKeeper.job`);
  - `rays.js` leans on three r163's `Mesh._computeIntersections`, outside
    its documentation (it falls back to `mesh.raycast` without it): look
    at it on an upgrade.
- The plain light and the scope (editor-plain-light-and-scope.md):
  anything that makes a light hands it to `world.plainLight?.keepOut`;
  anything new drawn out of doors that is no collection's is hidden in
  `Scope.apply`. A helper reads what is drawn: as the editor opens the
  garden is not made and the cars, far ground and neighbourhood are
  hidden, so a check run there passes on what it never saw — ask for the
  scope first (../app-testing-and-performance/in-page-tools.md).
- Frames on demand (frames-on-demand.md): a new thing that changes the
  picture by itself needs an emitted event, `experience.wake(why)`, a line
  in `Pace.busy()`, or its provider's `busy()`, or it stands still at rest.
  `Editor.render` reads the canvas mid-frame (`copyTexSubImage2D`):
  nothing may be drawn over the scene's depth between `renderer.render`
  and `outline.render`, and the canvas must stay the render target there.
- Never give a scene object a property of its own (`mesh.foo = …`): it is
  another kind of object to the engine from then on, and three's loops
  read them all — 2 ms a frame on one ray, measured
  (../app-testing-and-performance/speed-architecture.md).
- A group's `matrixWorldAutoUpdate = false` holds nothing still while the
  Scene over it has `matrixAutoUpdate` true: hold the Scene itself still
  (`SceneBuilder.holdStill`), and then whatever moves under a held group
  updates its own world matrix (Door.update, WindowSash.place,
  Openables.lend) — ../app-testing-and-performance/speed-architecture.md.
- three r163's rules met by the live room hold for any world code: a GPU
  pipeline per kind of picture; depth programs keyed by the call's light
  counts (`primeShadows`); a manual `matrixWorld` does not survive a frame
  and `eye.copy(camera)` copies `matrixAutoUpdate`; hiding hides children;
  a walk of the scene's materials must skip `userData.roomLive`; restore
  materials in the reverse order; time walks in first-person mode
  (../baked-view-lighting/live-room.md). Never read a mipmapped texture
  after a branch on something that varies by pixel (`dFdx`/`dFdy` before
  the branch, `textureGrad`): ../baked-view-lighting/resolved-lightmap.md.
- The indoor sky's light is upside down (`Sky.indoorLight`'s `DataTexture`
  has `flipY` false): every view lit live has it, the editor's realistic
  preview included — found, not changed (../baked-view-lighting/live-room.md).
- The checkers carry the app's rules in copies: after changing how
  anything collides (`SceneBuilder.collisionOf`), grep
  ../build-property-space/checks/ for the old rule — furniture-check-c and
  stairs-check boxed every piece with parts until 2026-10-17 (ACCESS 12 →
  13, NARROW 27 → 26).
- Keep paint and lacquer below 0.5 metalness, put late-loaded furniture
  through `applyReflections`, write a `THREE.Color` into a canvas with
  `getRGB(…, SRGBColorSpace)`, never overwrite a meshopt-packed node's
  scale or position, and never keep a Texture or a Color in
  `material.userData` (three-pitfalls.md).

## Finishes

`World/Builders/TextureLibrary.js`'s `GENERATORS` draw every generated
finish in `shared/catalog.js`, for every space: a change to a generator or
its defaults redraws every finish that uses it. Never retune a finish or a
generator default another space uses — add a space's own finish or an
opt-in parameter that defaults to the old drawing — and compare another
space's frames before and after (../build-property-space/finishes.md, and
buildings.md there). A new room finish must match Sky.js's `ROOM` pattern
by one of its prefixes (`limewash_`, `paint_`, `oak_`, …) rather than a
wider regex, which is app-wide (the `ROOM` and `GLASS` patterns:
../baked-view-lighting/SKILL.md). The depth layering that keeps
coplanar faces from flickering — `layer(material, FRONT | BEHIND)` from
`World/Builders/MaterialLibrary.js`, `getTrim`, `getTrimFront`,
`getTrimBehind`, `FurnitureLibrary`'s `layerFlushFaces`, carried by the
runtime file and the baked view as `userData.polygonOffset`, the near
plane at 0.05 — is ../build-property-space/z-fighting.md.

## Where the space's side is

- A space's walkability checks — C and Shift C, the capsule (0.7 m wide,
  1.9 m tall), `MESH_COLLISION_BUDGET` (12000), a door open past 0.3
  colliding with nothing, `jump.js` and the Player's headroom:
  ../build-property-space/walkable.md (§8, item 9).
- How a piece collides and is catalogued (`collision: "mesh" | "box"`,
  the shut boxes of its parts): ../build-property-space/furniture-catalogue.md;
  furnishing within the 12000-triangle budget, or with `"mesh"` where a
  box would wall off floor: ../build-property-space/furnishing.md.
- Every light needs a visible fitting; `room.fitting: "recessed"` where the
  design hangs its own pendants; never a second light under the space's
  own pendant: lights-and-fittings.md here, the space's method in
  ../build-property-space/SKILL.md.
- A piece against the wall beside a hinge jamb stands about 6 cm + 2 cm
  clear of it, and doors are audited fully open (t = 1): doors.md here,
  ../build-property-space/in-page-audits.md there.
- What a space can spoil for the editor (a room drawn without its window
  starts lit; outdoor things not in a collection show in House; a shader
  of its own must carry its data through a publish; anything moving by
  itself must tell the ray index, the stand-ins and frames on demand):
  ../build-property-space/SKILL.md.
- Verifying a space by its pictures: ../build-property-space/verifying.md.
- Edit mode's keys as the user meets them: the repo's README (Edit mode);
  who hears a key first (`Editor.onKeyDown`'s capture listener, before its
  transform session's check, and `FieldEdit`'s key filter, which passes C
  and Q on): ../visitor-interactions/picker-and-keys.md.
- A person in the editor (`PersonEditable`): ../space-people/scene-people.md.

## Files here

- spec-and-validator.md — what `validate.js` keeps and drops, seeding,
  the editor's flights, fit check and camera, room polygons, how the
  collections file a piece.
- three-pitfalls.md — reflections and metalness, linear `THREE.Color`,
  NaN boxes, meshopt node TRS, Textures and Colours in `userData`, stale
  console errors, Metal shader link failures.
- editor-plain-light-and-scope.md — the plain light, the realistic preview
  (**P**), `holdRealistic`, `inTurn`, the House/Exterior/All scope.
- stand-ins.md — buckets and batches, `REAL_LAYER` 12 and `seeReal`, what
  is looked at when, pieces drawn whole, lifted or loose, the hold and
  `drawnScene`.
- rays-and-collision.md — `rays.cast` and its two indexes, `rays.touch`,
  `rayIntersect`'s `far`, `TreeKeeper`, `buildOctree` written out, when a
  tree is built again, the wider box tried, `refreshCollision({ wait:
  false })`, the revisions, a capsule pushed up through a ceiling.
- colliders-view.md — the wireframes (C): who sees them, keys, colours,
  what is drawn where, how, `register`, names and labels, cost, testing.
- frames-on-demand.md — what asks for a frame, the pace states, what holds
  still at rest, the check of every editor action, the selection outline.
- lights-and-fittings.md — fittings and switches, where a lamp is pointed
  at, lights switched live, a light that is off out of the scene,
  `prepareLights`, light units, garden lights by day.
- doors.md — door leaves, the blocking threshold, the sweep past the hinge
  jamb.
- links-and-handles.md — the editor's link words (`?scene`, `?preview`,
  `?scope`, `?standins`, `?shut`, `?still`, `?frames`, `?outline`,
  `?debug`, `?colliders`) and a test tab's handles.
- history.md — this skill's dated entries, newest first, and the
  superseded measurements.

## Tools

All in ../app-testing-and-performance/ unless said; how to load them
through the sink: ../app-testing-and-performance/in-page-tools.md.

- `jump.js` — in-page, through the sink: runs and jumps at every upstairs
  window with a sill and says whether the capsule got out (`__jump.all()`;
  `windows`, `run(win, { record: true })`; rays-and-collision.md).
- `hold-check.js` — `__hold.audit()` every world matrix against three's
  own full walk, `same(label)` the frame held against the same frame let
  go: after anything that moves under a held unit (stand-ins.md).
- `walk.js` — the real player physics through every door both ways and
  along routes (`__walk.doors()`, `to()`, `free()`); it first finishes a
  tree an edit left being built a slice a frame
  (`sceneBuilder.settleCollision()`).
- `harness.js` — stops a save in an editor tab; `__K.realistic()`,
  `__K.scope("all")`, `__K.render`, `__K.time`. `drive.js` — the app's
  frames driven in a hidden pane (`pace.set("always")`, then `set(null)`:
  frames-on-demand.md). `boot.js` — the first call after every navigation
  of a test tab.
- `zfight.js` (passes over the stand-ins), `people-audit.js` (asks for
  the scope it needs), `act.js` (`__act.run()`, the done check).
- `undef.config.mjs` — the no-undef lint config; run after moving code
  between files (2026-10-05: RoomGlow called a function that no longer
  existed, `node --check` and the build passed, every view lit live
  threw).
- In ../build-property-space/checks/: `doors-dump.mjs`, `door-swing.mjs`
  (doors.md), `_modes.mjs <id> …` (each piece's triangle count and
  collision mode).
- Node tests in `scripts/`: `test-collision-tree.mjs` (77 on 2026-10-17),
  `test-collider-view.mjs` (32), `test-standins.mjs` (19),
  `test-capsule-through.mjs` (9);
  ../app-testing-and-performance/node-tests.md has them all.

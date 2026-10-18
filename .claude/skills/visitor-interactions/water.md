# Running water and steam (`World/Water.js`, `World/waterShaders.js`, `world.water`)

Since wave B of 2026-10-16. Made in both views (World.js): in a public
view in `furnitureReady` after the screens, in the editor beside them.

- **Anchors** are Blender empties kept as node extras `fixture`: `water
  { kind: "tap"|"rain", fall, land, hot, group, r|size }` at each outlet,
  `control { for, half }` at each tap body or valve, `steam { half,
  screens }` at each indoor enclosure's middle; their numbers in the
  piece's axes, the node with no turn of its own (a mirrored piece flips
  turns). In the editor they are found in each piece's model, again when
  a model comes and after an edit; in a public view they come from the
  runtime file's openable holders (`Publish/Runtime.js` copies every
  fixture node there), so **only a version published with the current
  furniture has water** (in the scratch folder, 20261016T123730Z on).
  Ids: `<piece>:water_<group>`, `:control_<group>`, `:steam` — the same
  in both views. GLTFLoader drops the dot from node names: ids never use
  the names. Ladonia: 70 outlets, 70 controls, 15 enclosures; 53 outlets
  hot; 19 showers (15 indoor, the 4 outdoor cold).
- **What the visitor acts on**: provider "water", kinds "tap" and
  "shower". Aiming at a control's box gives a candidate at its entry
  distance (`REACH.tap` 1.6, `REACH.shower` 2.0). A head inside an
  enclosure's box (up to 0.4 m over its top, `OVER_TOP`) gives a
  "standing" candidate at min(sight, far), with no reach and priority −1:
  whatever else is aimed at there (its glass door, a light, the room's
  door) is what E does. Prompts "Turn on/off the tap|shower", touch
  `{ On|Off, water }`. `act` tells the world "water" `{ id, kind, on }`
  and Player "interact". Neither Player nor Interactables needed a change.
- **Drawing**: one group "water" in the scene, outside the builder's root,
  a helper; its meshes `frustumCulled` false (Water culls them itself),
  `matrixAutoUpdate` false, raycast off and `userData.treatAsOpaque` (no
  second draw in N8AO's pass for what is seen through).
  - A running tap: its stream (a tapered tube with scrolling noise, head
    and tail travelling), its splash droplets and a ripple where it lands:
    3 draws.
  - A running shower: rain (instanced streaks ending on the visitor's head
    and shoulders under it: `uBlock`), spray and ripple — 3 draws; its
    steam (only the nearest `steaming` hot showers **in sight**: in sight
    first, then by distance, so one behind the eye takes no turn from one
    in front, fix of the integration); a mist pane for each fixed screen
    and the glass door (its mist goes with the door as it swings).
  - Nothing is drawn, and `update` returns at once, while everything is off.
  - Seven unlit ShaderMaterials (`waterShaders.js`'s `MATERIALS`:
    stream, splash, ripple, rain, steam, haze, mist; eight programs with
    the haze's from inside): premultiplied One/OneMinusSrcAlpha blending,
    no depth write, the fog, tone mapping, colour space and clipping
    chunks; two-sided but the stream (its near half only) and the haze
    (its front faces from outside its box, its back faces from inside:
    Water turns it, `dressSteam`). A 128² tileable value noise and a
    layered 64² one are made in code (no file).
  - Its meshes' `raycast` is their own property (`Water.mesh`:
    `mesh.raycast = () => {}`), against "Never give a scene object a
    property of its own" (`../app-testing-and-performance/speed-architecture.md`;
    `../walkthrough-editor/stand-ins.md`); made as each fixture
    first runs, and not measured. (The app's look ray never goes into
    the "water" group, which is outside the builder's root.)
- **What is drawn, and where** (`usable`, `FAR`): a fixture's water only
  while its piece is drawn (the editor's scope; an anchor is judged by
  what it hangs from, `shown`), within `FAR` of the eye — a tap 25 m, a
  shower, its steam and its glass's mist 40 m — and in the frustum (a
  sphere round its fall, or round its enclosure and `SPILL` + 0.5). From
  above (the world's "bird") only on the floors shown (`BirdView.floorAt`
  of its piece's floor ≤ the floor shown), the steam at
  `STEAM_FROM_ABOVE` 0.4 of its opacity, the ceilings being gone; nothing
  is aimed at there, and what runs goes on running. Every visit starts
  with all of it off: it is the visitor's own, never saved or sent. Fully
  baked, water out of doors takes the live estimate (sky and sun), never
  a door's light.
- **A new space's wet pieces**, as Water reads them (a steam box steams
  only with a hot rain outlet of its own piece; the spill keeps to its
  room; the glass door's mist needs the part labelled "shower door" and a
  /glass/ material; a control's `for`; `ceiling_finish` "none" means
  outdoors; an older publish has no water): the authoring rules,
  `../build-property-space/furniture-catalogue.md`. The anchors as
  Blender writes them (fixture extras `water` / `control` / `steam`, their
  helpers, Ladonia's counts; positions only, the piece's rotation, gravity
  −y): `../build-property-space/furniture-data.md`, Water anchors; the
  builders that carry them: `../build-property-space/blender-builders.md`.
- **The steam's body** (`hazeMaterial`) is a volume looked through: two
  boxes a hot shower — its enclosure's own, and the room's over its top
  (`spillOf`: the enclosure's plan grown up to `SPILL` 0.9 m a side, 5 cm
  at a time, while every point of the new edge is in the room's polygon,
  so never through a wall). Each pixel samples its look `water.haze` times
  (3/3/3/4/4), fewer on a short one, jittered. Density: a layer under the
  top whose lower edge falls as it heats (`uLayer`), a column off the
  falling water (`uColumn`, `STEAM_COLUMN` 0.7 /m), a spread over the top
  that gathers under the ceiling; soft at walls, glass, tray and ceiling;
  times a 3D value noise rising and turning about the water (one read of
  the layered texture a sample, the fine octave once a look). How thick:
  `STEAM_THICK` 0.85 /m × the share of a corner cabinet's 1.6 m³
  (`STEAM_VOLUME`) to the box's own volume, held to 0.35–1: a walk-in
  thinner, never thicker (`shapeSteam`).
  Seen as a veil, not smoke: the enclosure's light × `STEAM_GLOW` 1.1,
  hiding `STEAM_VEIL` 0.75 of what is behind. From outside a box its near
  faces are drawn, depth-tested; from inside it (within 0.1 m) its far
  faces, with no depth test (so a valve or the visitor inside it is
  veiled as the wall behind is). `renderOrder` against the glass at 0:
  beside it spill −4, water −3, puffs −2, body −1; in it 1–4; over its top
  water 1, puffs 2, body 3, spill 4. Puffs (8/10/12/14/16 by step) are the
  spray's mist, curls off the water and what is carried over the top.
  Glass mist forms from the top of each pane down as the steam fills,
  beads only close to, a run in about one 2 cm column in twenty.
- **Heat and time**: steam builds over about 15 s and clears about 45 s
  after the water stops, from the bottom up; the glass clears last (about
  70 s). Head and tail come from `fallen(t, v0)` (`v0` 0.6 m/s from a
  spout, 1.6 from a rain head); the lever eases 0.25 s; a bowl stays wet
  1.2 s, a tray 3.5 s. The water keeps its own clock from `delta`, so it
  holds still on edit mode's heartbeats.
- **Light** (`uLight`, looked up about 4 times a second, `NEUTRAL` 0.3
  less tinted): the editor's plain light 0.8; baked with probes, the
  probes of the point's own room (outdoors the open air's), between their
  all-round and their brightest way's light, × the indoor gain, plus the
  sun outdoors — a tap's point half a metre in front of it, a shower's the
  brighter of its enclosure's and half a metre in front of it in its own
  room (corner cabinets' probes are half in their walls); fully baked
  (steps 0–1), its own room's side of its doors × `DOOR_LIGHT` 1.6, else
  the nearest door's; lit live, the sky's indoor level × strength × 0.8 in
  a room, plus RoomGlow, the lamps' pool and the sun. The light of
  Realism's room probe cannot be read back: a room lit mostly by sun
  patches may make the water a shade dark.
- **After the camera** (`World.afterCamera`, the integration of wave B):
  World.update no longer steps the water; Experience.update does right
  after `camera.update`, and Water brings the camera's matrices up to
  date first. Before, inside or outside, which faces, the depth test, the
  order against the glass and the frustum were the frame before's camera:
  a third-person boom that snapped through a shower's glass drew the steam
  over the door's handle for that frame.
- **Not in a room probe** (`Realism.js` `RoomProbe.drawFace` hides the
  group): the steam's looks are the view's eye's, and from inside a shower
  it has no depth test; drawn into the probe's faces it lit the bathroom's
  reflections until the probe was next drawn.
- **Programs** (the integration of wave B): nothing at load — most
  visitors never turn a tap. Once the visitor first comes to water (aims
  at a control, stands in a shower: `wanted`), one mesh of each of the 8
  programs (the haze from inside and outside) is handed to
  `Renderer.build`: sliced, parallel, each drawn ahead into a few pixels,
  paced. Again only if, since, the fog, the post-processing, the tone
  mapping, the colour space or the lights have changed (`signature`,
  `lightEpoch` bumped by the light events and "bird"): three keys every
  non-raw shader by how many lights of each kind there are, a
  ShaderMaterial that takes none included. And **every mesh made of a
  fixture's drawing is held hidden until its own programs are built for
  the lights there are then** (`hold`, set going after the frame that made
  it): a tap turned on just after N shows its water a frame or two late
  and stops no frame. Before, the 8 were drawn in one frame at load (about
  0.4 s cold) and only for the load's lights: the first tap after N
  compiled three in its frame (+10 ms here; 21–96 ms a program cold
  elsewhere). Changing a material's `side` does not rebuild its program in
  three r163, but a rebuild for another reason is keyed by the side: both
  of the haze's are made.
- **Pace**: busy "water" while a lever eases or water falls or settles,
  and while water runs or steam settles within 8 m of the camera; null in
  edit mode.
- **Quality**: `QUALITY_STEPS[].water` (`../baked-view-lighting/quality-steps.md`,
  the slider's steps: rain, splash, spray, steam, steaming, haze). The
  quad-cloud geometries are shared by every fixture and drawn to the
  step's count.
- **Measured** (M4 Pro, scratch 20261016T140136Z baked; GPU timer query,
  synced each frame): step 4 at 2560 × 1600, standing in a walk-in at full
  steam +0.73 ms, beside it +0.19, a corner shower shut and misted +0.55,
  a tap 0, everything off 0; step 0 at 1280 × 800 at most +0.25. The body
  is the cost: a full-screen blended layer alone is 0.18 ms at step 4.
  `water.update` 0.005 ms with one running, 0.04 with all 70.
- **Known**: N8AO (steps 2–4) darkens the steam a little in front of a
  dark corner; the steam cannot see the depth of what is inside its box;
  standing under the rain in first person, the drops end at the top of
  the head, so none is seen falling past the eye.
- **Testing**: `node scripts/test-water.mjs` (44). In a page, after
  act.js: `water.js` (`__water`: `list`, `go(id)`, `inside(piece)`,
  `press`, `step`, `view(id, opts)`, `shot`, `sheet`, `sweep({ filter,
  standing })`, `pose`, `inject()` to put anchors into an older publish),
  `steam.js` (`__steam`: `series`, `strip`, `timings({ gpu })`), `wtime.js`
  and `gtime.js` (a frame's wall and GPU time), all in
  `../app-testing-and-performance/`.

## Elsewhere

- Three shader pitfalls found here (`1.0 − smoothstep(a, b, x)`, particle
  materials DoubleSide, both sides' programs made ahead): SKILL.md,
  Pitfalls.
- Programs keyed by light counts and the shadow maps' depth programs
  (`Water.hold` through `Renderer.build`), and "never give a scene object
  a property of its own" (the water's meshes' own `raycast` is a known
  exception): `../app-testing-and-performance/speed-architecture.md`.
- Working out eye-dependent things after the camera (`World.afterCamera`):
  `../walkthrough-editor/SKILL.md`, Pitfalls.
- Helpers drawn into a room probe's faces (`RoomProbe.drawFace`):
  `../baked-view-lighting/SKILL.md`, Pitfalls.
- The water's light in each lighting mode, from the bake's side (fully
  baked: the door light × `DOOR_LIGHT`): `../baked-view-lighting/baked-drawing.md`.
- The step's counts (`QUALITY_STEPS[].water`: rain, splash, spray, steam,
  steaming, haze): `../baked-view-lighting/quality-steps.md`.
- From above, a group outside `builder.root` hides itself by
  `birdView.floorAt(x, y, z) <= shown`: `../baked-view-lighting/birds-eye.md`.
- Only a version published with the current furniture has water
  (`Publish/Runtime.js` copies the fixture nodes):
  `../publish-and-bake/publishing.md`.
- The in-page tools (`water.js`, `steam.js`, `wtime.js`, `gtime.js`) are
  in `../app-testing-and-performance/`; the node test `test-water.mjs`:
  `../app-testing-and-performance/node-tests.md`.

---
name: visitor-interactions
description: "What a visitor can do in a space: the E picker and its providers, keys and the HUD/touch prompts, the room-lights key (Q), driving (also from bird's-eye), sitting and the televisions, opening furniture and windows (app side), running water and steam, swimming and the pool's steps and water. Use when adding or changing an interaction, its prompts or controls."
---

# What a visitor can do in a space

Everything a visitor acts on in the walkthrough (`/?scene=<id>`) and the
public view (`/view/<id>`): the one picker behind E and F and its
providers, the list of keys, the HUD's and the touch screen's prompts, Q
for the room's lights and which room the visitor is in, driving (from
above too), sitting and the televisions, the furniture's parts and the
windows as the app opens them, running water and steam, and swimming, the
pool's steps and its water. Most of it was built for Ladonia Residence
(scene id `kosinozici-villas`) on 2026-10-16/17; anything tagged
"Ladonia", or named after its buildings A, B and C, is that project's
value, not a rule. Every frame time here is one Mac's (an Apple M4 Pro)
unless it says otherwise; how they were taken:
`../app-testing-and-performance/measuring.md`.

**The user's answers come first**: `../../../CLAUDE.md`, What a visitor
can do in a space (2026-10-16, standing until they say otherwise):
- each visitor has their own state — no sharing of doors, lights, taps,
  the TV or the cars;
- no sound;
- every kitchen front opens but the dishwasher's and the ovens';
- sitting, but no lying down; swimming, but no diving — both by Mixamo
  clips, downloaded through the user's own sign-in
  (`../space-people/SKILL.md`);
- a television plays a real video loop, public domain or CC, about 3 MB,
  fetched when it is first switched on;
- from above, the car's keys are the car's;
- edit mode gets only the colliders' wireframes.

The defaults they accepted with those (the insides plain: shelves, rails,
a fridge's shelves and bins, no props) and their own words are in
`history.md`.

Read first:
- `../../../CLAUDE.md` — the standing terms (never the user's :3000 or its
  tabs, scene backups, never undo their edits, the frame rate "as high as
  possible") and the index of the skills.
- `history.md`, Still short — the gaps found and left; don't repeat them.

What is elsewhere: the space's side of what opens, runs or is sat on (the
pieces, their parts and anchors, the windows' sills, the pool's basin) is
`../build-property-space/SKILL.md`; fitting the visitor's clips to the
avatars `../space-people/SKILL.md`; the editor, collision, doors and
lights at large `../walkthrough-editor/SKILL.md`; how a baked view lights
what is acted on `../baked-view-lighting/SKILL.md`; publishing what needs
a publish `../publish-and-bake/SKILL.md`; test servers, the browser pane,
the in-page tools and timing `../app-testing-and-performance/SKILL.md`.

## Read before

- `picker-and-keys.md` before adding something to sit on, turn on or
  open, a key, a touch button, a line the HUD says, or anything that asks
  which room the visitor is in.
- `windows.md` (and `../build-property-space/buildings.md`, Windows that
  open) before choosing a space's windows.
- `opening-parts.md` (and `../build-property-space/furniture-data.md`,
  `../build-property-space/furniture-catalogue.md`) before modelling a
  piece whose fronts open.
- `water.md` for a shader of its own, and how to make its programs before
  they are wanted.
- `../walkthrough-editor/colliders-view.md` before adding anything that
  collides outside the trees.
- `../app-testing-and-performance/speed-architecture.md` (what runs every
  frame) before adding anything that moves under a group held still, or a
  light that comes and goes.
- `../app-testing-and-performance/test-servers.md` and
  `../app-testing-and-performance/browser-pane.md` before the first test
  tab.

## Rules that hold here

- **The visitor's state is their own.** A provider's `act` returns `{
  kind, id, state }`, never saved or sent (no sync was the user's choice);
  every visit starts afresh (the water all off), and nothing of it is kept
  in the browser. Others see only the figure: its place and its clip's name
  (sent every 20 ms), played by their own page's frames.
- **Speed.** A new interaction must not slow down what was there, and must
  cost as little as possible when used: measure it against HEAD at the
  same spots, both ways round, with the GPU timer beside it
  (`../app-testing-and-performance/measuring.md`). Keep the look ray and
  the prompt within today's 0.05–0.11 ms a call; nothing is drawn, and
  `update` returns at once, while a feature is off (as the water does).
- **Never give a scene object a property of its own**: it changes the
  object's V8 shape (2 ms a frame on one ray). Known exceptions, noted as
  still short: the water's meshes' `raycast` (`water.md`) and the pool's
  depth pass (`pool-water.md`).
  `../app-testing-and-performance/speed-architecture.md`.
- **Whatever moves under a group held still updates its own world
  matrix** (`Door.update`, `WindowSash.place`, `Openables.lend`); for the
  same reason Water and Screens hang their own groups in
  `experience.scene`, outside the held units
  (`../walkthrough-editor/stand-ins.md`;
  `../app-testing-and-performance/speed-architecture.md`).
- **A module's own group outside `builder.root`** (the water, a TV's
  picture) hides itself from above by `birdView.floorAt(x, y, z) <=
  shown` — `floorAt`, not `levelAt` (`../baked-view-lighting/birds-eye.md`).
- **A new thing that changes the picture by itself** needs an emitted
  event, `experience.wake(why)`, a line in `Pace.busy()`, or (for
  something acted on) its provider's `busy()`
  (`../walkthrough-editor/frames-on-demand.md`). A public view has no
  Pace and draws every frame.
- **A new interaction that makes frames long** tells the frame-rate guard:
  `"interact"`, or add its event to `SETTLE_ON` and settle on it
  (`../baked-view-lighting/frame-guard.md`).
- A public view has no plain light, and the editor's live light is the
  realistic preview's (`../walkthrough-editor/editor-plain-light-and-scope.md`):
  anything that makes a light hands it to `world.plainLight?.keepOut(light)`.
- **What needs a publish** (`../publish-and-bake/publishing.md`): seats and TVs
  nothing (a public view reads its published spec, `seats.json` and
  `screens.json`); water only a version published with the current
  furniture (`Publish/Runtime.js` copies the fixture nodes); the
  furniture's parts a publish that writes each holder's `turn` and
  `reach`; the windows a publish that lists the sashes; the pool's steps a
  publish and a bake, while the water's look reaches every version with a
  build alone.
- **The user's scene**: never reseed it for a feature; give it only the
  field needed with a tool that backs up first (`patch-pool-steps.mjs`,
  with `--backup`; `../build-property-space/scene-safety.md`, the old §0).
- **Both skins, both views, every time** for whatever moves the figure
  (`../app-testing-and-performance/browser-pane.md`, Both skins).
- **Before saying a change is done**: the no-undef lint, every node test
  and `JSON.stringify(__act.run())` in an editor tab and a public view
  against the base server's — the same but for what was meant to change
  (`../app-testing-and-performance/SKILL.md`).

## Method: adding a kind of thing to act on

In full, with the why of each step: `picker-and-keys.md`, Adding a kind.
1. A provider, `world.interactables.register(provider)`. Read a thing off
   `look.hit` where it hangs under `SceneBuilder.getInteractiveObjects()`;
   anything in a group of its own, or a point, test yourself against boxes
   of your own, skipping what is further than its reach + 0.5 m. A reach
   past the look ray's 4 m needs a ray of its own.
2. Its `prompt` with a `touch` icon in `ICONS` and in hud.scss; its `act`
   returning `{ kind, id, state }`, the visitor's own.
3. A prompt on a key other than E, F, T or Space (or Space meaning
   anything but climbing out): its line in `index.js`'s `runAction`, or the
   touch button does nothing.
4. `busy()` naming it while it eases by itself — not while it merely plays.
5. Colliding outside the trees: `experience.colliders.register`, and a
   name and a label the colliders view knows (`BLOCKER_NAMES` /
   `BLOCKER_LABELS`, `STEP_NAMES` / `STEP_LABELS`:
   `../walkthrough-editor/colliders-view.md`).
6. A new key: its entry in `KEYS`, its words in both hint blocks of
   `index.html`, read by `event.code` in Player, and through `FieldEdit`'s
   key filter if it must work with a piece selected
   (`picker-and-keys.md`).
7. Clicked from above: `of(ref)`, a `<kind>At(x, y)` in `BirdView.thingAt`,
   its click in `onPointerUp`, an `action` for the hover label.
8. Anything drawn outside `builder.root` hidden from above on the floors
   over the one shown (`floorAt`).
9. Cases in `scripts/test-interact.mjs`, and a spot in act.js with its own
   `state`.

Then measure the look ray and the frame at the same spots against HEAD,
and run the done-check above.

## Method: checking a space's interactions

A new space's checks are `../build-property-space/walkable.md` (the old
§8), items 6–9; what each piece must carry for them is
`../build-property-space/furnishing.md` (the old §4: parts labelled for the
prompt, a fridge's door labelled exactly "fridge" and its light on the
body, water, control and steam anchors, `seats.json` by `npm run seats`
with `SEAT_HEIGHT` 0.3–0.62, `screens.json` by `npm run screens -- --check`
with the glass an upright `tv_glass` face towards −z at least 20 cm a
side, never a piece with parts at a scale other than 1). In short, with
Ladonia's figures to read a new space's against:
- `act.js`'s spots for the space's own doors, drawers, a switch on each
  floor and the car (E, F, Q), in the editor and a public view, against
  the base build. Q needs a switch in every indoor room (in a public view
  only lamps in the bake switch); E with nothing aimed at opens the
  nearest door on the visitor's floor only (`doorOnFloor`, `DOOR_BELOW`
  2.4 m); driving from above needs a car and a terrain or ground plane
  (`driveBounds`), and a publish after it.
- `openables.js`: every part that stops short and what stopped it
  (`stops()`), E on one part of each kind (`everyE()`), `walkIn`,
  `freeSpots` and `sameTriangles()` at an L or U kitchen, every sash
  (`sashes()`). Ladonia: 32 stops and 18 tilts; 74 of 74 kinds and 475 of
  475 parts; 59 of 59 sashes; 971,018 triangles each way.
- With both avatars, in both views (`await __sit.ready()` first): a seat
  of each kind sat on and got up from, from above too (`sit.js`); every
  television (`tv.js`); every pool's walls, steps and sides (`pool.js`,
  `swim-checks.js`); every kind of part and every tap (`openables.js`,
  `water.js`). Sweep every seat (`seat-sweep.js`, `seat-sweep.py`):
  Ladonia 214 seats a run, the seated pose meeting something at 124–149
  (every tucked-in dining chair, accepted), the walks at 85–111.
- `jump.js` at every upstairs window with a sill: no run may end outside
  or a floor up (`../walkthrough-editor/rays-and-collision.md`).

## Pitfalls already hit (don't repeat)

- A published furniture part's slide (`opens.direction`) is in its
  piece's frame while its holder is put in the world: every drawer of a
  turned piece slid into it or sideways in the public view until the
  loader turned it (`opening-parts.md`). Check a public view's drawers
  against the editor's, all of them.
- A collision tree's floors in a public view have tops and no
  undersides: a ray from below goes through, and whatever it meets
  upstairs is behind the ceiling. Test what is aimed at against the
  two-sided sight, as the lights always were (`picker-and-keys.md`).
- What clamps a walker's camera does not suit a car: from above, the
  floor's box held the view while a car drove off it, out of the frame.
  Follow a car over all the ground it can drive on (`shared/drive.js`),
  stop it where that ground ends, and sample the publish from there too
  (`driving.md`; `../publish-and-bake/culling-and-viewpoints.md`).
- A rule for the nearest thing "within 2.2 m" measured across the floor
  reaches through ceilings: give it the floor too (`doorOnFloor`) — and
  through walls: from above, E sat the visitor on the next flat's sofa
  through the party wall until the seat had to be in sight
  (`Seats.inSight`).
- A lamp's target is its piece's box (`Fittings.gatherLights`), and a
  light's box beats a door within 5 cm: a lamp on a piece with doors
  (ld-cabinet) took every press of E until its target became the lamp
  alone (`aimedAt`; `../walkthrough-editor/lights-and-fittings.md`). A
  turned piece's world box stands out in front of its doors.
- Anything that comes over the network is unchecked (the server relays a
  visitor's `animation` as it was sent): a number there threw in every
  other visitor's frame. Take it as a string or a default where it arrives.
- What the HUD is told "only as it changes" must be keyed on all of what
  it shows: the prompt's signature left out its `also`, and "Space Stand
  up" stayed on screen after standing.
- GLSL `smoothstep` with edge0 > edge1 is undefined, and on ANGLE/Metal it
  drew nothing: write `1.0 - smoothstep(a, b, x)`.
- A camera-facing quad built with `cross(axis, toPoint)` is wound
  backwards and culled by FrontSide: make particle materials DoubleSide.
- A ShaderMaterial whose `side` is flipped at run time keeps the program it
  was built with until something else rebuilds it; then it is built again
  keyed by the side it has: make both ahead.
- reflections.js gives every transparent MeshStandard/Physical material of
  roughness ≤ 0.1 its studio to mirror as Environment is made, and the
  material keeps it ("its own reflections" in Sky.share). Something meant
  to mirror the sky — the pool's water — needs a roughness over 0.1: at
  0.04 the water mirrored the studio's softboxes.
- A fragment shader cannot read the depth of the frame it is drawn into:
  the pool's water works out what is under it analytically, from the
  pool's box and its steps.
- A pass that multiplies the frame (DstColor × SrcColor) must write its
  factor through `linearToOutputTexel`, or it dims less on the
  gamma-encoded screen (steps 0–1, no post-processing) than into the
  linear post-processing picture.
- A test that reads a list checks only the list. The touch icons are
  checked from `ICONS` (`shared/interact.js`), and the touch button runs
  by the prompt's key (`index.js` `runAction`). So an icon drawn in CSS
  but not listed (the pool's) is checked by nothing, and a prompt on a
  new key passes every test and does nothing on a touch screen. Add the
  list's entry and the key's line with the provider (`picker-and-keys.md`,
  Adding a kind).
- What a contact check leaves out as "its own" it cannot see.
  - A seat's own piece taken as what the triangles round its cushion are
    mostly of was the dining table, a corner sofa or a curtain.
  - The whole chair taken as its own let the figure sit turned with its
    torso 0.22 m into the backrest (0.39 m on the editor's meshes), which
    no sweep saw.
  - Take it by label within the piece's catalogue footprint, and narrower
    still for what must not be touched (`Seats.own`, its `side`).
- A "least bad" rule where nothing is clear — the way of sitting or
  walking that meets least — went deeper at more seats than it helped.
  Sweep such a rule seat by seat against the rule it replaces, everything
  else the same, before keeping it: a comparison with the seating changed
  between the two runs hid it.
- A figure seen must never move faster than it could. A 0.35 s glide onto
  a seat ran up to 14 m/s through the table, and a seat clicked from
  across the room cut the figure 3.8–4.6 m in a frame. Walk it, facing
  its way, at a walking pace, or fade it out and in and cut only at
  opacity 0.
- A fade by material copies must give back the very material each mesh
  wore, and look every frame it is not fading. The probes and the live
  room copy what a mesh wears mid-fade, and a copy of a copy left the
  figure at 0.991 for the visit (`Avatar.setOpacity`, `whole`).
- Another visitor's figure is played by the receiving page's own frames,
  from the place and the clip's name alone (sent every 20 ms whatever
  changed). Played by the sender's clock, sent along, it stood still
  between messages and doubled the next frame, and still sank 0.46–0.56 m
  after a hold-up.

Met in the same work, kept by the skill they belong to:
- Clips taken by index break the day the list changes — bind them by name
  and fall back to idle; and animating the figure (cross-fades from each
  clip's share, the mixer setting only what changed, posing last,
  measuring by skin from the frame before the key, both avatars, a clean
  baseline): `../space-people/SKILL.md`, Fitting clips to the visitor's
  avatars.
- Programs keyed by light counts (make a new mesh's programs before it is
  first drawn, `Water.hold` through `Renderer.build`), the shadow maps'
  depth programs (`Renderer.shadowDraws`, `shadowTwins`), holding the
  Scene still (`SceneBuilder.holdStill`), what nothing draws is never
  built (`ShutBatcher.prepareOwn`, `Renderer.buildFor`), a hundred small
  parts each asking something every frame (`ProbeLight` 3.2 → 0.3–0.5 ms):
  `../app-testing-and-performance/speed-architecture.md`.
- Work out what depends on the eye after the camera (`World.afterCamera`:
  the steam was drawn inside out), and limit OrbitControls instead of
  moving the camera after it (`Camera.dryOrbit`: the boom shrank over the
  pool): `../walkthrough-editor/SKILL.md`, Pitfalls.
- Helpers drawn into a room probe's faces (`RoomProbe.drawFace`: the
  steam), and copying a material another module changes in place (the
  glass-door race, `Sky.withoutGlaze`): `../baked-view-lighting/SKILL.md`,
  Pitfalls.
- A door with something proud of its face swung 90° about its outer
  corner carries it back past the hinge line (`_pull_swing`), and
  `mirrored()` reverses an aimed light: `../build-property-space/SKILL.md`.

## Files in this skill

- `picker-and-keys.md` — the one picker behind E and F: the list of keys
  and the hand-written hints, who hears a key first, the look ray,
  `pickTarget`, prompts and touch icons, the providers, adding a kind;
  Whereabouts, Q and a room's lights at once, the HUD's top row, the
  nearest door on the visitor's floor, testing, cost, where the HUD says
  things; then the numbers: the `KEYS` table, `REACH`, `SLACK`, `TIE`,
  `PRIORITY`, the icons, Whereabouts' and BirdView's constants,
  `driveBounds`, `Car.alongEdge`, `driveViewpoints`.
- `opening-parts.md` — the app side of the furniture's parts: a published
  part's frame, scaled pieces, `opens`, how far a part opens
  (`Openable.plan`, `reach`), landing on target, the light inside a piece
  lent round, glass in a part, testing.
- `windows.md` — `World/Sash.js`: which windows open, how a sash turns or
  tilts, in the scene, collision, the public view, lit, acted on, cost.
- `sitting-and-tv.md` — the seats, a seat as a point, taken, where the
  figure goes, which way it sits, sitting down and getting up (by the
  clips, on foot, from afar, the dissolve), from above, others, pace; the
  televisions (`screens.json`, the sets, brightness, the video, picking,
  seated before one); testing.
- `water.md` — running water and steam: anchors, the provider, drawing,
  what is drawn where, the steam's body, heat and time, light, after the
  camera, not in a room probe, programs, pace, quality, measured, testing.
- `swimming.md` — `World/Player/Swim.js`: depths and speeds, the walls,
  the steps' keel, which stroke, no diving, climbing out (the climb fitted
  to the edge), the camera, others, the steps' ramp, patching the user's
  scene, measured, testing; then pools as data: the water's look, the
  steps' layout, nosing and ramp (`poolSteps`), the swimming depths and
  the keel.
- `pool-water.md` — the pool's water: two passes, built live, caustics,
  roughness over 0.1, night, what it is not, measured.
- `driving.md` — driving from above (following, swinging behind, getting
  in and out, the lamps, out over the ground, limits) and the car
  provider.
- `page-handles.md` — what a test tab can ask the page for these:
  `w.interactables`, `P` target/act, `P.seated` and its plans, `w.seats`,
  `w.screens`, `sb.windows`, `sb.openables`, a part's plan, `w.water`,
  `P.swimmer`, Q, Whereabouts, `w.switches`, `w.birdView`, the events.
- `history.md` — the 2026-10-16/17 request in the user's words, its
  stages, what was mended and taken out, the user's edits since, Still
  short; the patch of their file; superseded values.

## Tools

### In this folder

- `encode-video.py` — `<blender> --background --python
  .claude/skills/visitor-interactions/encode-video.py -- <src> <out.mp4>
  <t0> <t1> <w> <h> <kbps> [fps]`: an H.264 loop for a television, in
  Blender's sequencer (this Mac has no ffmpeg; Blender is
  `/Applications/Blender.app/Contents/MacOS/Blender`, 5.1); its header has
  Ladonia's cut (`sitting-and-tv.md`, The video).
- `patch-pool-steps.mjs` — `node
  .claude/skills/visitor-interactions/patch-pool-steps.mjs <scene.json>
  [--pool b-pool] [--steps JSON] [--backup dir] [--dry-run]`: a seeded
  scene's pool given its `steps` and nothing else, without seeding it
  again (a backup first; refuses a file not as the server writes it, or
  one changed while it ran). Reload every editor tab on the scene first,
  and give it `--backup`: its default, `backups/` beside it, is in the
  repo and not git-ignored (`../build-property-space/scene-safety.md`,
  the old §0). A scene seeded before the steps gets them by this tool, never by a
  reseed (`../build-property-space/landscape.md`).

### In-page tools, in `../app-testing-and-performance/`

Loaded through the sink in a page of a test server (never the user's on
:3000): `boot.js` right after the navigation, then `act.js`, then the
feature's own. Both servers serve that folder's top-level files only;
each file's header says what to load before it and what each call
returns. How to load and start them:
`../app-testing-and-performance/tools.md` and
`../app-testing-and-performance/in-page-tools.md`.
- `act.js` — in an editor tab after harness.js, or in a public view:
  drives what E, F and Q do, as walk.js drives the walk — `__act.doors()`,
  `drawers()`, `switches()` list what there is; `stand`, `aim`, `look`,
  `press("E" | "F" | "Q")` and `spot` stand the capsule (`stand` resets a
  swimmer first, as `Player.placeAt` does), turn the camera on a thing,
  run the look ray and the prompt and press, keeping every event told;
  `run()` does Ladonia's spots (a door, a drawer, two switches, the BMW)
  and times the look ray (`timeLook()`). It reads the build before
  2026-10-16 and after alike, so the same spots on two builds can be
  compared; a kind added later passes its own `state` to `spot`
  (`picker-and-keys.md`). `JSON.stringify(__act.run())` against the base
  server's is the done-check.
- `walk.js` — the real player physics through every door both ways and
  along routes (`__walk.doors()`, `to()`, `free()`).
- `openables.js`, `sit.js`, `tv.js` — after act.js: the furniture's parts
  as the visitor meets them (`walkIn` every part, `freeSpots` between a
  kitchen's arms, `sameTriangles` the editor's tree against a publish's —
  these three, with `pieces` and `place`, in an editor tab alone —,
  `stops()` what stops each part, `everyE()` E on one part of each kind or
  on all, `sashes()` every window turned or tilted and shut); sitting
  (`await __sit.ready()` first — the clips worn, the seats dressed, their
  catalogue read — or the first E only queues the sit; `seats`, `before`,
  `aim`, `press`, `state()`, `view`, `shot`); the televisions (`__tv.list`,
  `freeze(t)`, `frames`, `measure`, `off`) (`sitting-and-tv.md`).
- `water.js`, `steam.js` — after act.js: the taps and showers (`__water`:
  `list`, `go`, `inside`, `press`, `sweep` every control, `sheet`, `view`,
  `inject` anchors into an older publish) and a shower's steam over time
  as sheets and what the water costs (`__steam`: `series`, `strip`,
  `timings`, `reset`) (`water.md`). What a frame costs is measured with
  `wtime.js` (`__wtime`: a frame's wall time and its draws over all of the
  frame's renders: `info.render.calls` holds the last pass's alone) and
  `gtime.js` (`__gtime`: its GPU time by the timer query), app-testing's
  tools.
- `jump.js` — runs and jumps at every upstairs window with a sill and says
  whether the capsule got out (`__jump.all()`;
  `../walkthrough-editor/rays-and-collision.md`).
- The usability work's tools (2026-10-16/17), after `boot.js` and
  `act.js`; one line each in `../app-testing-and-performance/tools.md`:
  - Q and the room the visitor is in: `lights.js` (`__lights`; `walk`
    counts the readout's changes across a threshold) and `hud.js` (the
    HUD's top row measured).
  - Driving from above: `birdcar.js` (`__bc`; `behind()` is the byte for
    byte drive across two builds; in an editor tab `__K.scope("all")`
    first, no car is offered under "house"). The culled faces the view
    from above would see (`holes.js`) and a version's bird's-eye samples
    (`count-views.mjs`, read-only) are publish-and-bake's
    (`../publish-and-bake/culling-and-viewpoints.md`).
  - The pool and swimming: `pool.js` (`__pool`), `pool-look.js`
    (`__poolLook`, its poses worked out from the pool's box and steps) and
    `swim-checks.js` (`__swim`: walls, corners, taps, the climb). The
    figure against the water (`clips.js`, `__clips`) and bones, facing,
    waterline and limbs a frame (`swim-trace.js`, `__trace`) are listed
    by `../space-people/SKILL.md`.
  - What other visitors see: `others.js` (`__others`: mirrored in the
    page, or sent and received by two real pages), with `net.py`.
  - Sitting: `seat-sweep.js` (`__seats`: every seat sat on and got up
    from, the limbs against all but the seat's own piece), with
    `seat-sweep.py` and Ladonia's `ladonia-seat-starts.json` and
    `ladonia-w-boxes.json`; `figure-fade.js` (`__fade`: sat on from afar,
    got up mid-fade, the very materials worn after). The starts and boxes
    were taken before the user's edits of 2026-10-17 13:54Z (five dining
    chairs moved or turned, b-f011 scaled 0.88; `history.md`): take them
    again (`makeStarts`, `takeBoxes`) before the next sweep.
  - A fridge opened as a first visitor opens it: `light-in.js`
    (`../app-testing-and-performance/speed-architecture.md`, the fridge's
    light).
- The verifier of what moves the visitor's figure, and its instruments:
  `../app-testing-and-performance/lane-briefs.md` (p).

### Node tests that hold this skill's code

On 2026-10-17, each as expected (all fourteen and their history:
`../app-testing-and-performance/node-tests.md`):
- `node scripts/test-interact.mjs` — 51: `pickTarget` against Player's old
  rules, the keys and scopes, every icon's CSS, Whereabouts, the nearest
  door's floor.
- `node scripts/test-openables.mjs` — 46: motion, axes, labels, a
  published part, the light lent round, shut boxes, the plan.
- `node scripts/test-windows.mjs` — 30 (25 mutations caught).
- `node scripts/test-seats.mjs` — 39: which seats turn, `poseFor`, the
  clip fitted, the knees opened, another visitor's way of sitting.
- `node scripts/test-screens.mjs` — 19 (runs `measure-screens --check`
  when the GLBs are there).
- `node scripts/test-water.mjs` — 44.
- Beside them: `test-shut.mjs` (31, the shut parts merged:
  `../baked-view-lighting/SKILL.md`) and `test-capsule-through.mjs` (9,
  `../walkthrough-editor/rays-and-collision.md`).

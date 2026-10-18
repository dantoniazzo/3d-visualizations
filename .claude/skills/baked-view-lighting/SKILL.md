---
name: baked-view-lighting
description: "How the public view (/view/<id>) is lit and drawn from a bake: lighting modes and quality steps, the resolved lightmap and switches, the light meter and exposure, the live room (K) in the bake's own light, ceilings, the frame-rate guard, the bird's-eye view, tone, AO and colour. Use when changing or debugging how a published view looks, is lit, or switches lights."
---

# Baked view lighting: how a public view is lit and drawn

A published version (`/view/<id>`) is drawn from its bake on every
device. This skill is the view's side of that: which lighting mode a
visitor is given and why; how the bake's light is drawn — one resolved
lightmap over one merged house, the shut parts merged, what moves and
the door leaves lit by the bake's probes; how a frame is exposed (the
light meter); what the visitor can switch to (the live room, **K**, in
the bake's own light); what holds the frame rate (device ceilings, pixel
budgets, the frame-rate guard); the view from above; and the tone, AO
and colour over all of it. The worked examples are Ladonia
(`kosinozici-villas`) and Wrenfield. Every figure is this Mac's (an
Apple M4 Pro), its pane hidden, unless it says otherwise.

Not here: making, checking and publishing the bake, and its manifest —
[../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md); the editor
and the look lit live (the realistic preview **P**, `LiveSwitches`,
`LampPool`, `RoomGlow`, the plain light) —
[../walkthrough-editor/SKILL.md](../walkthrough-editor/SKILL.md); what a
visitor acts on (E, Q, doors, parts, windows, seats, water, driving) —
[../visitor-interactions/SKILL.md](../visitor-interactions/SKILL.md);
timing, the browser pane and the in-page tools —
[../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md).
The user's standing terms — realism first, performance as their choice,
the highest frame rate in the editor and the public view, a new feature
costing nothing where it is not used — are the project's
[CLAUDE.md](../../../CLAUDE.md). What the user asked, in their words, and
what was left short: [history.md](history.md).

## When to read what

- Before changing anything a public view draws, or how it is lit: this
  file, then the topic file that holds it (the list at the end).
- Before changing or measuring the live room (`World/RoomLight.js`,
  `World/LiveRoom.js`, `World/RoomBakeLight.js`): live-room.md and
  live-room-bake-light.md, whole; live-room-measured.md before quoting a
  figure of it. Each of those code files' headers says how and why too.
- Before judging how bright a baked frame is: light-meter.md.
- Before adding anything that moves under a held group, or a light that
  comes and goes, to a public view: "What runs every frame, and what
  doesn't" in
  [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md),
  and the pitfalls below.
- Before opening a test tab with anything in its link:
  links-and-handles.md and quality-steps.md, and the keys a browser
  keeps ([../app-testing-and-performance/test-tabs.md](../app-testing-and-performance/test-tabs.md):
  `render-quality`, `view-lighting`, `view-scenery`, `view-lost-graphics`,
  `view-reloaded-at` — remove what a test set).
- Before saying an app change is done: "Before saying an app change is
  done" in [../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)
  — the `no-undef` lint, the node tests (this skill's:
  `scripts/test-frame-guard.mjs`, `scripts/test-shut.mjs`, and
  `scripts/test-light-regions.mjs` after touching `shared/lightRegions.js`
  or the bake's `lightzones.regions`), `__act.run()` in an editor tab and
  a public view.

## The user's words for the published view

- On K, 2026-10-12, seeing it light a room's lamps over its bake: "The
  live lights with K should completely transform the room into the same
  version that we see in the editor, without the bake … not switch from
  baked to live lights, but also remove the baked textures and replace
  with actual ones."
- 2026-10-15: "in the public view, in the live light mode for the room,
  when its nighttime and the lights are off, the room is still clearly
  visible, just like in the editor mode, but it should be dark, like the
  baked version", then "Make sure that in the editor mode it stays as it
  is currently, only change the published view".
- Later that day: "There is a significant difference between baked light
  and live light in the view mode. The baked light is more yellow and
  warmer and live light is more white/blue, and also fewer shadows appear
  with the live light. Make the live lights ambience look as similar as
  possible to the baked one" — the materials to stay the true ones.
- 2026-10-10 to 12: the highest frame rate in the editor and in the
  public view with the most realism kept, the public view fully baked by
  default, and to "test out multiple variants of optimization techniques,
  including quality of renders for both the interior and exterior".

So: a published view is drawn from its bake by default; K keeps the
rooms' true materials (the editor's), takes the bake's own light with
only the sun and the nearest lamps live, and is dark at night where the
bake is dark; and nothing of the editor or of an unbaked publish changes
for any of it.

## Rules

- **Say of every frame which it is**: plain (the editor's working
  light), lit live (the editor's realistic preview, a version published
  unbaked, `?live`, `?lighting=live`), or baked — and then in which mode:
  "baked" (steps 2–4), "static" (steps 0–1, phones, a version published
  fully static), K on or off, from above. A frame of a baked view taken
  without `?lighting=` is "baked" on this Mac (lighting-modes.md).
- **Never judge a baked interior at a fixed exposure.** A baked view
  takes its light from the bake and its exposure from a meter that reads
  the frame (light-meter.md): by day ×3 in a glazed room to ×32 in a dim
  bedroom. Under `?quality=0` ("static") every room is at one fixed
  exposure, and brighter (Ladonia 140–152 for 105–111 at steps 2–4).
- **What a visitor of a published view can switch to is judged against
  the baked frame**, not against the editor (2026-10-15). With **K** the
  rooms round the visitor keep their true materials and take the bake's
  own light, only the sun and the nearest lamps live
  (`World/RoomBakeLight.js`; live-room.md, live-room-bake-light.md). Compare
  them with the baked frame of the same pose by the room's own pixels (a
  mask of where each pixel's nearest surface is): mean, warmth ((R − B) /
  sum, G − B) and shade. A change asked of the published view leaves the
  editor and the unbaked publish as they were, byte for byte: show it.
- **The app-wide look lit live is not this skill's to retune**: day
  exposure 1.3, `outdoor` 0.3, `INDOOR` 0.8, `INDOOR_EXPOSURE` 2.2,
  `GLASS_OUTSIDE` #4b545a at 0.78, `GLASS_INSIDE` #eef2f2 at 0.12, the
  room probe from step 3, `Sky.glowIndoors`, `RoomGlow` — changed only as
  a proposal to the user, the other spaces compared before and after
  ([../build-property-space/light-and-look.md](../build-property-space/light-and-look.md)).
  A space sets only its sky, and maybe its tone mapping and exposure. A
  public view has no plain light; the editor's live light is its
  realistic preview's
  ([../walkthrough-editor/editor-plain-light-and-scope.md](../walkthrough-editor/editor-plain-light-and-scope.md)).
  A balustrade's glass must not match Sky.js's `GLASS`
  (`/^glass_solar/`), and a new room finish must match `ROOM`, or its
  rooms take the full outdoor sky
  ([../build-property-space/buildings.md](../build-property-space/buildings.md),
  finishes).
- **Every figure is this M4 Pro's, its pane hidden.** No phone, touch
  device, integrated or slow GPU, Safari or Firefox was measured; what a
  rated-low device is given was seen only through `?rated=` and
  `?quality=`. The public view's low end is still a mid-range Android
  phone about three years old: "static", step 1, pixel ratio at most
  1.5, eight people at most. Say so whenever a number is quoted, and test
  a phone when there is one to test
  ([../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)).
- **A new feature must not slow down what was there** (CLAUDE.md): time
  it against HEAD at the same spots, two tabs in turns and both ways
  round, the GPU timer beside it, `?guard=off` on every timed link
  ([../app-testing-and-performance/measuring.md](../app-testing-and-performance/measuring.md)).
- **Whatever makes frames long by itself tells the guard**
  (`experience.guard?.settle()`, or its event in `SETTLE_ON`;
  frame-guard.md).

## What a visitor is given

- **A baked version is drawn from its bake on every device**: "baked" at
  slider steps 2–4 (what moves shades the sun and is lit by the bake's
  probes, a shut door dims its rooms), "static" at steps 0–1 and on
  phones (nothing live), the bird's-eye view from the bake always, and the
  whole house lit live only by link (`?lighting=live`), to compare. Its
  switches and doors are resolved into one lightmap and its rooms merged
  into one house (Ladonia 3,952 meshes → 670). Ladonia baked at step 4:
  25–44 ms a frame → 13–17 (the living room 79 a second, the pool 59), at
  night 39–64 → 13–17; at step 0, 10–22 → 4–8; Wrenfield 8–10 → 5–6. The
  rooms round the visitor in their true materials, lit by the bake's own
  light with the sun and the nearest lamps live and real shadows, are
  theirs to ask for (**K**; live-room.md). Cost, at
  2560 × 1440 standing: +2.0–3.4 ms a frame (2026-10-15; +3.0–4.2 when K
  drew them unbaked), and 0.7–1.0 ms more while a sheer curtain of a room
  shown is in sight. It holds a second lightmap, 64 MB at 4096², from the
  first press until K is off. A first press at night on a fresh load is
  lit 1.75 s after it (K before: 2.7 s). After K off nothing of it is
  drawn or run, but it keeps about 14 MB so that K again builds nothing.
- **Nothing takes a device above the step it is rated for** (touch 1,
  integrated graphics 2, other Apple chips and discrete cards 3, Apple
  Pro/Max/Ultra and RTX 4; `?uncapped` lifts it for a developer), each
  step has a pixel budget, and a public view that falls under 28 frames a
  second makes itself lighter — resolution, then the live room, then the
  step — and goes back when there is room.
- Trees whole < 24 m, light < 48 m, impostors beyond at slider step 3
  (× `QUALITY.flora.reach`, 0.6–1.5 by step); AO half-res, kept over a
  bake (without it a room is a tenth brighter and nothing is seated on
  its floor; it is 4–5 ms of a step-4 frame — the user's call).

The modes in full, what was seen in the page and what the default costs
are lighting-modes.md; the steps' table quality-steps.md; the guard
frame-guard.md. How many people each step draws (8 at step 1, 4 at step
0, whole groups from the top of the spec's list; never baked) is
[../space-people/SKILL.md](../space-people/SKILL.md).

## The pieces, and where each is written

| what | code | here |
|---|---|---|
| the mode a visitor is given | `Utils/device.js` `lightingMode`, `stepCeiling`; `world.lightingMode` | lighting-modes.md |
| the steps | `QUALITY_STEPS`, `QUALITY.pixels`, `Utils/Sizes.js` | quality-steps.md |
| the sky before the bake's light | `World.setLighting`, `Sky.setVariant`, `Environment.setVariant` | resolved-lightmap.md |
| one lightmap: switches and doors resolved | `World/LightResolver.js`, `sb.resolver` | resolved-lightmap.md |
| one house; the shut parts and sashes | `World/HouseMerger.js` (`sb.merged`), `World/ShutBatcher.js` | merged-house.md |
| door leaves, baked textures, materials by name, mirrors, glass | `ProbeLight.leafLight`, `Utils/bakedTexture.js`, `SceneBuilder` | baked-drawing.md |
| what moves, lit by the probes | `World/ProbeLight.js` (`w.probes`), `LiveLamps` | baked-drawing.md; ../app-testing-and-performance/speed-architecture.md |
| rooms lit by day; the switches the first frame waits for | `shared/daylight.js`, `World/Switches.js` | switches.md |
| exposure | Realism's `LightMeter`, `Realism.between`, `airyRooms` | light-meter.md |
| the live room (K) | `World/RoomLight.js`, `LiveRoom.js`, `RoomBakeLight.js` | live-room.md, live-room-bake-light.md, live-room-measured.md |
| the frame-rate guard | `Experience/FrameGuard.js`, `shared/frameGuard.js` | frame-guard.md |
| from above (B) | `World.lightFromAbove`, `BirdView`, `shared/storeys.js` | birds-eye.md |
| tone mapping, AO | `PostProcessing.js`, `Utils/filmic.js`, N8AO | tone-ao-colour.md |
| a link's words, the page's handles | — | links-and-handles.md |

## Method: changing or debugging how a published view looks

1. **Know what is drawn.** Open the version on a test server of your
   own, never the user's :3000
   ([../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)),
   and read `published/<id>/manifest.json` before saying which version a
   link opens ([../publish-and-bake/publishing.md](../publish-and-bake/publishing.md)).
   In the page: `w.lightingMode`, `sb.resolver`, `sb.merged`,
   `e.guard.status()`, `w.roomLight.status()` (links-and-handles.md). A
   version baked before a fix to the bake shows the old fault until it is
   baked again ([../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md)).
2. **Isolate by a developer's word**: `?lightmap=rooms|one`,
   `?merge=off|<metres>|own|tint`, `?shut=0`, `?roomlight=on|off`,
   `?night=meter|lift|asis`, `?lighting=baked|static|live`, `?quality=`,
   `?rated=`, `?uncapped`, `?guard=off` (links-and-handles.md). Merged
   against unmerged, and resolved against per-room, a frame differs only
   at single pixels on lines where two surfaces touch: more than that is
   a fault.
3. **Pose, and let the meter read.** A still taken right after posing
   shows the last view's exposure: draw frames with an `await` between
   them until `renderer.realism.meter.fresh`, set `realism.lastAt =
   null`, draw once more; before a still also wait for
   `sb.resolver.pending` 0 (light-meter.md, resolved-lightmap.md). In a
   view lit live, after a night toggle or a switch, wait for
   `!world.lampPool.entering && world.lampPool.settled`
   ([../walkthrough-editor/lights-and-fittings.md](../walkthrough-editor/lights-and-fittings.md)).
   A walk with the camera where the eyes are is in first-person mode
   (`e.camera.setFirstPerson()`).
4. **Measure by the room's own pixels**: a mask of where each pixel's
   nearest surface is; mean, warmth ((R − B)/(R + G + B), and G − B) and
   shade (the share under a fifth of the room's mean); baked | before |
   now at the same pose, the people hidden (live-room-measured.md). Two
   runs of one cell 5 levels apart are a state, not noise: read the pool
   of lamps, the probe's faces and what each pane is drawn with, in both.
5. **Change one thing**, then check every mode a visitor meets (below),
   and that the editor (plain and `?preview=1&scope=all`), the unbaked
   publish and a visit that never presses K are byte for byte the build
   before's.
6. **Time it** against HEAD, both ways round
   ([../app-testing-and-performance/measuring.md](../app-testing-and-performance/measuring.md)).
7. **Say what is still short**: a dated entry in history.md, newest
   first, and the topic file's "Still short".

## Checking a published view in every mode

The full step is "Check the published view" in
[../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md); in short,
saying of each frame which it is:

- as it opens on this Mac: step 4, "baked" — the bake's light, what
  moves shading the sun, the meter reading the frame under a site's sky
  and the probes without one;
- `?quality=0`: "static" — nothing live, no probes, one exposure for
  every room, what a phone is given; `?rated=1` shows the rest of what a
  device rated low gets;
- from above (**B**, always the bake's); at night (**N**); a door shut
  and a light switched;
- with **K**, judged against the baked frame of the same pose, not the
  editor — the room's own pixels within a few levels of it in mean,
  warmth and shade, and dark at night with its lamps off: the room stood
  in and the rooms seen through its open doors; a door opened onto the
  next and walked through (nothing in view should change but at the
  first press); in from the garden; a lamp turned off and on standing
  under it (every frame of the fade further than the last, the exposure
  the bake's); a room with a sheer curtain; K off again (the bake's, to
  the pixel);
- a bake without its light apart (an older one, a "static" one),
  `?lightmap=rooms` or `?merge=off` draws K's rooms as the unbaked view
  does (`RoomBakeLight.usable`); `?lighting=live` draws the old whole
  house lit live, to compare.

The bake's own figures — the sun drawn against the bake's and the site
sky's, black where it should not be, what the resolved lightmap draws,
each room's daylight from the probes, the meter's exposure — are
`bake-check.js`'s (below); two bakes are compared at the probes and face
by face, not texel for texel
([../app-testing-and-performance/measuring.md](../app-testing-and-performance/measuring.md)).

## Pitfalls that matter

- N8AO: `gammaCorrection: false` before OutputPass (double sRGB).
- Sky picture: no mipmaps (`generateMipmaps = false`) or a seam shows.
- Wrenfield's grass looked up its baked light on the first ground within
  0.3 m — the neighbourhood's field below the lawn — until it took the
  nearest in height (`Vegetation.js` `groundUv`).
- Fog on huge ground triangles must be per pixel, not per vertex, or whole
  fields darken unevenly.
- A shadow map that does not look every way its light shines is a leak: a
  point outside a map is lit. The room lamp's first map looked straight
  down, and the upper part of every wall was lit unshaded — walls the lamp
  cannot see among them.
- Never read a mipmapped texture after a branch on something that varies
  by pixel: its level of detail is undefined there, and edges read the
  coarsest level (take `dFdx`/`dFdy` before the branch, `textureGrad`).
- three keeps the uniforms of the last shader it *built* for a material,
  not of the one in use: a material that goes between two shaders must
  hand every variant the same uniforms.
- A view's helpers are drawn into everything the scene is drawn into — a
  room probe's cube faces too. Hide what is drawn for the eye alone around
  such a draw (`RoomProbe.drawFace`).
- A copy of a material that something else changes in place every frame
  takes what it shows at that moment, and keeps it. The probes' dressing
  (`ProbeLight.dress`) cloned a glazed door's glass while `Sky.glaze` had
  it darkened for a view from outside. In about one load in four all 20
  of Ladonia's glazed leaves kept that look (0.78, #4b545a) indoors for
  the visit. Copy through the owner's record of its own values
  (`Sky.withoutGlaze`, as `withoutGlow` does for the glow).
- In a merged view `mesh.material.color` is white for a tinted mesh and
  `mesh.userData.material` the key of the first mesh merged: a lit
  material for such a surface must read `tint` (merged-house.md). Never
  read `resources.items.publishedView`'s geometry after the view is built.
- A baked texture's `texture.image` has no size once uploaded (the
  bitmap is closed): its size is `texture.userData.size`; never set
  `needsUpdate` on one again. A material keeps its finish texture only if
  its name is exactly a catalogue finish id, and its depth layering only
  through `userData.polygonOffset` (baked-drawing.md).
- **For anything new in a public view** ("What runs every frame",
  [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md)):
  a thing the probes light that is given another material while it
  stands still keeps it for at most 8 frames unless its meshes are marked
  `userData.roomLive` while they wear it; a mesh added under a root the
  probes already light, at rest, is not dressed until that root moves or
  the light changes; a new kind of mover goes into `ProbeLight.roots()`
  or `LiveLamps.movers()` and their `markOf` / `same`; whatever moves
  under a group held still (`holdStill`) updates its own world matrix;
  whatever should ease the AO behind it is drawn by N8AO's beauty pass
  (tone-ao-colour.md). After an upgrade of three, look for "Probe light
  not applied: three's shader has changed" in the console.
- Every lit shader pays for every light in the scene, at intensity 0
  too: a light that is off is hidden, out of three's light state
  ([../walkthrough-editor/lights-and-fittings.md](../walkthrough-editor/lights-and-fittings.md)).
- Anything drawn outside `builder.root` (a module's own group: the
  water, a TV's picture) hides itself from above by
  `birdView.floorAt(x, y, z) <= shown` — `floorAt`, not `levelAt`
  (birds-eye.md).
- three r163, learnt on K (live-room.md, What cost time to find): a GPU
  pipeline is made per kind of picture a program draws into; a depth
  program is keyed by the light counts of the call it is used in
  (`primeShadows`); a manual `matrixWorld` does not survive a frame, and
  `eye.copy(camera)` copies `matrixAutoUpdate`; hiding an object hides
  its children; a walk of the scene's materials must skip
  `userData.roomLive`; materials go back in the order opposite to the one
  they were put on in.
- A public view has no `Pace`: it draws every frame
  ([../walkthrough-editor/frames-on-demand.md](../walkthrough-editor/frames-on-demand.md)).
  While the colliders are shown (C) the guard judges nothing.
- The bake's view.glb has lost the editor's `cast`/`receive`
  (bake_public.py deletes them on export): K reads them from the unbaked
  `<version>/view.glb` by two Range requests. A new bake should keep them
  (live-room.md; [../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md)).
- The indoor sky's light is upside down (`Sky.indoorLight`'s
  `DataTexture` has `flipY` false): found 2026-10-15 and left, because
  mending it changes every view lit live, the editor's too (live-room.md,
  Still short).

## Still short (gaps not to repeat)

- K in the bake's light: a switch with more lights than the step's
  shadowed lamps (Ladonia's living rooms) is all the bake's, with no
  moving shadow; door leaves are their true oak where the baked view
  draws them nearly white; by day a window's frame and pane, and a mirror
  or a washer, are the room's, not the baked view's white sky and studio;
  thin faces take no live lamp; the second lightmap is 64 MB from the
  first press until K is off, and about 14 MB stays after; a curtain in
  sight costs 0.7–1.0 ms.
- Seen from no room a room is the bake's (in from the garden it changes
  in one frame once the visitor is in it); day and night, the slider and
  the view from above send the live rooms back to the bake for 8–43
  frames; a first K on shaders the browser never built is 5–6 s in
  coming; beyond eight groups a room in sight is the bake's.
- Q on a terrace has nothing to switch in the public view: the terrace
  lamps are not in Ladonia's bake.
- Wrenfield's bake of 2026-10-01 wants baking again (doorway reveals
  zoned to the room behind); villa C's first-floor hall has a wall's end
  baked black ([../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md)).
- The look: steps 0–1 expose every room alike, and brighter; the garden
  through a window from a lamplit room is up to twice as bright as from
  outside; a room without daylight is black from above with its light
  off; mirrors and metals in a baked view reflect a studio, pale by day
  and black at night.
- The guard has never judged real frames; nothing was seen in a visible
  tab at the display's rate, at steps 2–3 with K, with two visitors, or
  on a phone.

The full lists: live-room.md "Still short", each topic file's, and
history.md.

## Files here

- lighting-modes.md — what a visitor is given: "baked", "static", lit
  live by link; what was seen; the default's cost; ceilings, `?uncapped`,
  `?rated=`, pixel budgets; a lost graphics context and how to test it.
- quality-steps.md — the slider's steps table, the device's rating and
  ceiling, the step drawn, water's counts, K, post and shadow maps by mode.
- links-and-handles.md — the public view's link words and the test
  tab's handles for it (`w.roomLight`, `w.lightingMode`, `sb.resolver`,
  `sb.merged`, `e.guard`, `w.probes`, `sb.holdStill`, `sb.shutBatcher`).
- frame-guard.md — the frame-rate guard: rungs, trials, early rungs,
  fetches, test hooks, `SETTLE_ON`, bloom size, costs, its limits.
- resolved-lightmap.md — the sky before the bake's light; the house's
  light resolved into one lightmap (`LightResolver`).
- merged-house.md — the house merged (`HouseMerger`), the sun's shade
  map on movement, the shut parts and sashes merged (`ShutBatcher`).
- baked-drawing.md — door leaves a side at a time, baked textures,
  materials by name, own-shader terrain, mirrors, metals, clear glass,
  the glass-door race; what else is drawn in a baked view and where.
- switches.md — the rooms daylight does not reach start lit; the
  switches the first frame waits for.
- light-meter.md — the light meter by day and at night, under a door,
  the ease's clock, the time of day, airy rooms, which a visitor is in.
- live-room.md — K: which rooms, made ready, how drawn, the room probe,
  where it is, what cost time to find, after K off, still short.
- live-room-bake-light.md — K in the bake's own light
  (`RoomBakeLight.js`): sunless lightmap, parts lit as baked, the sun,
  the lamps, curtains, the exposure.
- live-room-measured.md — every measurement of K, and how to measure it.
- birds-eye.md — the view from above: nothing live, storeys, indoor
  gain, the garden by floor, groups outside `builder.root`, its costs.
- tone-ao-colour.md — tone mapping per space; N8AO and its two
  transparency passes; why AO is kept over a bake.
- history.md — the dated entries, newest first, and superseded figures.

## Tools

In [../app-testing-and-performance/](../app-testing-and-performance/SKILL.md),
loaded in a page through the sink after `boot.js` (how:
that skill's SKILL.md):

- `bake-check.js` — a baked view's own checks: the sun drawn against the
  bake's and the site sky's, black, what the resolved lightmap draws,
  rooms' daylight, the meter's exposure, and what it `cannot` read (run
  as [../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md) says).
- `glass-race.js` — the glass-door race made to happen both ways round
  (`await __glassRace()`): right is one look, Ladonia's 20 glazed leaves
  at 0.62, #6a7f8a.
- `light-in.js` — a fridge's light coming in as a first visitor opens
  it, every frame timed until it has been in a second.
- `cold.js` (before `boot.js`) and `coldsplit.js` — a first visit's
  shaders, every source salted new; which frame built what, and where.
- `frame-split.js` — where a frame's time goes, by subsystem.
- `pair-time.js` with `pair.py`, `gtime.js`, `wtime.js` — two tabs timed
  in turns, the GPU timer, the draws.
- `lights.js` — Q and which room the visitor is in.
- `vshot.js` — a picture with the page's HUD over it (K's hint).
- `harness.js` (`__K`) — renders through the sink; in an editor tab the
  realistic preview, for the lit-live reference.
- `compare.mjs` (node, from the repo) — render | live | baked rows, each
  tile with its mean luminance.

Node tests: `scripts/test-frame-guard.mjs`, `scripts/test-shut.mjs`,
`scripts/test-light-regions.mjs` (their counts:
[../app-testing-and-performance/node-tests.md](../app-testing-and-performance/node-tests.md)).

# How a baked view is drawn: door leaves, textures, materials, mirrors and glass

Door leaves lit a side at a time (`ProbeLight.leafLight`), the baked
textures (`Utils/bakedTexture.js`), materials rebuilt from runtime.glb by
name, the terrain's own shader under the lightmap, mirrors, metals and
clear glass indoors, and the glass-door race. The sky and the resolved
lightmap are [resolved-lightmap.md](resolved-lightmap.md); the merged
house and shut parts [merged-house.md](merged-house.md).

For whoever models a space: a material keeps its finish texture in the
baked view only if its name is exactly a catalogue finish id (below;
[../build-property-space/SKILL.md](../build-property-space/SKILL.md)),
and a new room finish must match Sky.js's `ROOM` prefixes, a
balustrade's glass must not match `GLASS` (`/^glass_solar/`)
([../build-property-space/buildings.md](../build-property-space/buildings.md),
finishes).

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
  lies under its floor. Resolved (resolved-lightmap.md) it reads the variant's own
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
- **The glass-door race** (wave C of 2026-10-16; a look fix, not a speed
  one; it stood in "What runs every frame, and what doesn't",
  [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md)):
  `ProbeLight.dress` copies through Sky's `withoutGlaze`, so a glazed
  door leaf keeps its glass's own colour and opacity (0.62, #6a7f8a)
  whenever the probes' file arrives. Before, a leaf dressed after the
  sky's first glazing kept the outside look (0.78, #4b545a) or the inside
  one (0.12, #eef2f2) for the visit (1 load in 4). Made to happen on
  purpose, either way round, by `glass-race.js`
  (../app-testing-and-performance/glass-race.js, in a baked public view
  after boot.js: `await __glassRace()`): right is one look throughout,
  all 20 of Ladonia's leaves at 0.62, #6a7f8a.

  The rule behind it (SKILL.md, pitfalls): a copy of a material that
  something else changes in place takes what it shows at that moment, and
  keeps it — copy through the owner's record of its own values. And the
  testing lesson: a fault in one load of several is an order of arrival;
  make each order happen on purpose
  ([../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)).
  The record: [history.md](history.md), 2026-10-16/17.

## What else is drawn in a baked view, and where it is written

- **What runs every frame, and what doesn't** (wave C):
  [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md).
  In short, for anything new in a public view: a thing the probes light
  (a part, a door leaf, a car, a person, a visitor) that is given another
  material while it stands still keeps it for at most 8 frames
  (`stillDressed` dresses it again) unless its meshes are marked
  `userData.roomLive` while they wear it, as the live room does; a mesh
  added under a root the probes already light, at rest, is not dressed
  until that root moves or the light changes; a new kind of thing that
  moves and should be lit by the probes, or should have the sun's shade
  map drawn again when it moves, goes into `ProbeLight.roots()` or
  `LiveLamps.movers()` and into what their `markOf` / `same` compare. The
  probes' light is put into three r163's `lights_fragment_begin` by its
  text: after an upgrade of three look for "Probe light not applied:
  three's shader has changed" in the console.
- **Glass in a furniture part** (`clearGlassIndoors`, `tintOpenables`,
  `ProbeLight.dress`) and what shut doors enclose (`enclosedGlass`):
  [../visitor-interactions/opening-parts.md](../visitor-interactions/opening-parts.md)
  and merged-house.md (`enclose`).
- **A window's sash** turned past 25° draws its glass as glass in a room,
  reflections only (`glazeInRoom`); K draws sash and frame live:
  [../visitor-interactions/windows.md](../visitor-interactions/windows.md).
- **Running water and steam** take the light of the mode they are in —
  fully baked (steps 0–1), their own room's side of its doors ×
  `DOOR_LIGHT` 1.6: [../visitor-interactions/water.md](../visitor-interactions/water.md).
- **The pool's water** is built live in every view and never baked; a
  public view drops the runtime file's own "pool-water":
  [../visitor-interactions/pool-water.md](../visitor-interactions/pool-water.md).
  Its reflections are the studio's (roughness ≤ 0.1 mirrors the
  softboxes): [../visitor-interactions/SKILL.md](../visitor-interactions/SKILL.md).
- **People** are lit by `ProbeLight`; a baked view has no probes on roof
  terraces, so people there keep the scene's light:
  [../space-people/scene-people.md](../space-people/scene-people.md).
- **Night reflections** are scaled down or metals glow in the dark: 0.06
  under a landscape's Sky (`Sky.applyIndoor`), 0.03 under the old
  Environment presets ([../walkthrough-editor/three-pitfalls.md](../walkthrough-editor/three-pitfalls.md)).

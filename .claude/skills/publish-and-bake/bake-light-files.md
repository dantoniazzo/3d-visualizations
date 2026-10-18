# How a bake writes and zones its light

What a bake writes for each variant and each switch, and how it decides
which room each face and each texel belongs to (`blender/bake_public.py`,
`blender/lib/lightzones.py`, `scripts/bake-public.mjs`). Why: a room held
by the sunlit garden's one scale showed tinted blocks, and a face zoned to
the wrong room — or to `outside` — gets none of its room's lamp, which the
view cannot draw back.

How the view reads all this back — the resolver, the curves opened out
per fragment, the switches' layers, the mipmaps — is
[../baked-view-lighting/resolved-lightmap.md](../baked-view-lighting/resolved-lightmap.md).
The view's side is kept below as well, as the bake's notes had it ("Only
a view that resolves the house's light reads it", and how a view fetches
a layer's own copy): the two files must say the same. The manifest's fields for all of it
(`variants.*.rooms`, a layer's `own`, `zones`, `probes`) are in
[manifest.md](manifest.md). Run `node scripts/test-light-regions.mjs`
(needs `python3`) after touching `shared/lightRegions.js` or
`lightzones.regions`.

For the modeller: wall linings, thresholds and reveals are zoned by the
`face_zones` rules below, so a modelling choice can leave faces "outside"
([../build-property-space/SKILL.md](../build-property-space/SKILL.md)
points here).

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
  samples; a scratch encoder of that day, `enc5b.mjs`, gone with the
  scratch folder; error against the bake's
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
  - Checked on Wrenfield's last test bake (2026-10-12, a scratch
    publish's version 20261012T060400Z, gone with the scratch folder; by
    reading its `lit.glb`
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

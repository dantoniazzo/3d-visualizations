# Live room light (K) in the bake's own light (`World/RoomBakeLight.js`)

How K draws its rooms since 2026-10-15 (and the review fixes of that
day): their true materials, lit by the bake's own light, with only the
sun and the nearest lamps live. Read it with [live-room.md](live-room.md)
— which rooms, how they are made ready and drawn, the room probe, where
K is — and [live-room-measured.md](live-room-measured.md) for the figures,
the curtains' among them. The user's words behind it (2026-10-15): "Make
the live lights ambience look as similar as possible to the baked one",
the materials staying the true ones, the editor and the unbaked view as
they were.

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
    not resolved, `?lightmap=rooms`, `?merge=off`: as before (the bullets of live-room.md, How it is
    drawn).

# Live room light (K): which rooms, made ready, how they are drawn, the room probe, where it is, still short

The live room over a view drawn "baked". This file: which rooms and
when, how they are made ready, how they are drawn, the room probe,
where K is and is not, what cost time to find, what it keeps after K
off, and what is still short. How the rooms take the bake's own light
(since 2026-10-15, `World/RoomBakeLight.js`) is
[live-room-bake-light.md](live-room-bake-light.md); every measurement
of it, and how to measure it, [live-room-measured.md](live-room-measured.md).
Read all three before changing any of `World/RoomLight.js`,
`World/LiveRoom.js` or `World/RoomBakeLight.js`, or measuring them.

The user's words quoted below (2026-10-12 and 2026-10-15, with "in the
editor mode it stays as it is currently, only change the published
view") are the standing requirements for K (SKILL.md, the user's words).
The manifest's fields K reads (zones, probes, doorStates, the switch
layers and their `own` curves, the variants' rooms and garden, the sun's
mask, `indirect`) are [../publish-and-bake/manifest.md](../publish-and-bake/manifest.md).

Over a view drawn "baked", **K** — or the *Live room* switch at the head of
the lights panel — has the rooms round the visitor drawn with their own
materials, the editor's, in the bake's own light: the sun through their
windows and the lamps nearest the visitor live, with their shadows, and
the rest of their light — the sky through the windows, every bounce, the
soft shade in corners and under the furniture, the lamps not drawn live —
the bake's (*In the bake's own light*, live-room-bake-light.md; until 2026-10-15 their light
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
    live (`status().state === "outdoors"`). Since 2026-10-16 these rules
    are `World/Whereabouts.js`'s, the same answers (2,020 seeded points
    hashed alike before and after), and the room's name on screen and Q
    go by them too (../visitor-interactions/picker-and-keys.md): `where()` is
    `world.whereabouts.locate` with `accept` the rooms drawn as rooms and
    `keep` the room drawn live.
  - Which room the visitor is in is shared with the room's name on
    screen and Q: [../visitor-interactions/picker-and-keys.md](../visitor-interactions/picker-and-keys.md)
    (Whereabouts; `RoomLight.where`'s rules moved there unchanged). K's
    hint (`.room-light-hint`) sits at 64 % of the height, where the
    action prompt is; the line Q writes is at 36 %.
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
    the bake cannot light them (*In the bake's own light*,
    live-room-bake-light.md, keeps of
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
    bake's light, live-room-bake-light.md, all clear glass keeps to its
    reflections). The
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
    them; in the bake's light it is the baked view's own meter's,
    live-room-bake-light.md —
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
    without its light apart; in the bake's light, live-room-bake-light.md,
    none of this is
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
  - *Q and K*: Q turns a room's switches at once (`inRoom`, `setMany` on
    the baked `Switches`), and K's live switch follows — Ladonia public,
    A1's bedroom at night with K's live room on: the frame's mean level
    101.8 → 0.9 → 102.9 by Q, Q (103.6 → 5.0 → 103.6 without K)
    ([../visitor-interactions/picker-and-keys.md](../visitor-interactions/picker-and-keys.md)).

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
- **After K off nothing of the live room is drawn or run** (wave B,
  2026-10-16; the "0.8 ms left behind" verify A reported was the
  machine's drift, read in one tab): after K on and off, a frame's WebGL
  calls are the same, call for call, as a fresh view's (6,312 calls, 602
  draws, 73 programs; 843 drawn meshes' materials, programs and textures
  compared), nothing of it runs per frame but RoomLight's early returns,
  and two tabs timed in turns differ by no more than 0.1 ms. What it
  keeps, it keeps on purpose (`LiveRoom.release`), so that K again builds
  no shader: its lights in the scene on the room's layers (6 nodes, in no
  frame of the camera's), its 648 caster stand-ins (11.8 MB of index), 93
  cut indices (2.5 MB: forgotten, three never gave their buffers back),
  +50 textures and +55 programs. Letting the casters go would trade a
  rebuild at the next K for that memory; not done.

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
  - Q on a terrace has nothing to switch in the public view: Ladonia's
    11 terrace lamps (`lamp:a-f201`…) are not in its bake (2026-10-16/17,
    [../visitor-interactions/history.md](../visitor-interactions/history.md)).
  - The indoor sky's flip (above) is in every view lit live, the editor's
    realistic preview among them: whoever mends it there,
    [../walkthrough-editor/SKILL.md](../walkthrough-editor/SKILL.md), mends
    it here.
  - Wrenfield's bake and villa C's wall end (above) are the bake's to
    mend: [../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md).
    So is the lost `cast`/`receive` (How it is drawn, its shadows): a
    new bake should keep them in view.glb.

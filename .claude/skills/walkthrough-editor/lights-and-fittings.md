# Lights and fittings

The app's side of a space's lights: the fittings World builds, where a
visitor points at a lamp, lights switched live (the editor, `?live`, a
version published unbaked), why a light that is off is out of the scene,
building shaders ahead for a light, the light units and the garden's
lights by day. Moved from app-notes.md, "Lights and fittings". How a
baked view switches its lights is ../baked-view-lighting/switches.md;
authoring a lamp in a catalogue piece is
../build-property-space/furniture-catalogue.md. Every frame time here is
one Mac's (an Apple M4 Pro) unless it says otherwise.

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
  node's own Blender coordinates — `room: true` on its room's ceiling
  switch, else a switch of its own; Ladonia's 11 lamp pieces carry them
  (2026-10-05), and every lamp's glow material needs a name only that piece
  uses, since the bake matches bulbs by exact name. The authoring rules in
  full: ../build-property-space/furniture-catalogue.md; the builders'
  side (`_lit`, `_light`, `BULB`, `LED`, `LD.place_lights`):
  ../build-property-space/blender-builders.md.
  - Where a visitor points at a lamp (its target, `gatherLights`): the
    piece's whole box, 3 cm over — but on a piece whose doors or drawers
    open under its lamp (every bulb more than 0.1 m over their top), only
    the lamp: the piece's vertices over the parts' top within 0.3 m of a
    bulb across the floor, 3 cm over (`Fittings.aimedAt`, fix of
    2026-10-16). A light's box met first, or within 5 cm of a door, is the
    light, and ld-cabinet's two doors under the lamp on it (b-f038; the one
    piece with both) could never be opened. The piece's box from the doors'
    top up was not enough: the world box of a turned piece stands out in
    front of its doors, and from close by the ray aimed down at them passed
    through it first. Targets are published: a public view has it on the
    next publish.
  - A light *inside* a piece (`fixture.light`, a fridge's) is not one of
    these: it is lit as its doors open (../visitor-interactions/opening-parts.md).
  - Model shades open at the light's end, bulbs and glass vertex-lit, and
    `part_bulbs`' radius: ../build-property-space/furniture-catalogue.md.
    The app's side of it: the live view caps a lamp light's offset below
    `at` at 5 cm (LampPool) so a wall light's light doesn't land in the
    headboard.
- **Lights switched live** (2026-10-05) — the editor, `?live`, and a
  version published unbaked (the publish panel's preset "Lit live — as in
  the editor", `PUBLISH_PRESETS`): the switches are the bake's
  (`Fittings.gatherLights`, one per room's ceiling light plus one per lamp
  of its own), turned with the HUD's lights panel, the editor's bulb button
  or **L**, and Ctrl/⌘-click on a light or its wall switch (in sight only —
  walls stop it — and only on what the editor shows). A visitor's switching
  is never saved. In the editor the *light* of it is the realistic
  preview's: under the plain light (edit mode always, the walkthrough until
  the preview is on — editor-plain-light-and-scope.md) a switch is a state, shown in its
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
  it was built: the rooms without daylight had since started lit (next, and ../baked-view-lighting/switches.md),
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
  `LiveSwitches.startsOn`; in a view lit live only while `daylight` is on,
  `World.daylit`: a public view, the editor's realistic preview, not its
  plain light nor while a publish holds the scene): the rule, its rooms,
  the light meter from above and what it costs are
  ../baked-view-lighting/switches.md.
- **A room's lights at once** (Q, 2026-10-16): both kinds of switches have
  `inRoom(roomId)` and `setMany(ids, on)` — the key, the HUD and which
  room are ../visitor-interactions/SKILL.md; under the editor's plain
  light Q changes the fitting's glass alone (emissive 2.2 → off).
- Light units, matched to the bake: a Blender sun of strength S is a
  DirectionalLight of intensity S; a W-watt point lamp is W/(4π).
- **Garden lights by day** (`Flora/lights.js`, `GardenLights.set(false)`;
  fix of 2026-10-16): every garden light is put out (`visible` false,
  intensity 0) and its place handed back, not only hidden with its
  group. Before, after a night and back, five stayed visible and lit inside
  the hidden group — three counts the lights that are there, not those
  that shine (12 Oct version, public: day 0/0 → night 5/5 → day 0/0 →
  night 5/5 → day 0/0 lit/shown, where the day had been 5 lit).

## Elsewhere

- A light at intensity 0 is still a light; hide it, or in the editor keep
  it off every layer (`world.plainLight?.keepOut`): the speed rule in
  ../app-testing-and-performance/speed-architecture.md, with the programs
  keyed by light counts and the shadow maps' depth programs
  (`Renderer.shadowDraws`, `shadowTwins`).
- A shadow map must look every way its light shines (the room lamp's first
  map looked straight down), mipmaps after a per-pixel branch, and the
  uniforms of the last shader built for a material:
  ../baked-view-lighting/SKILL.md, Pitfalls.
- Light targets are published, so a public view has a change on the next
  publish; the light units are what the bake uses:
  ../publish-and-bake/SKILL.md.
- The keys and controls a visitor switches with (L, the HUD's lights
  panel, Ctrl/⌘-click, Q): ../visitor-interactions/picker-and-keys.md.
- Every light needs a visible fitting, and a space uses
  `room.fitting: "recessed"` where its design hangs its own pendants:
  ../build-property-space/SKILL.md (method). Garden lights in a space's
  landscape: ../build-property-space/SKILL.md (the landscape).
- In a test: wait for `!world.lampPool.entering && world.lampPool.settled`
  after a night toggle or a switch; never `renderer.compile` the whole
  scene; to time a first build, a variant the browser has never seen —
  ../app-testing-and-performance/SKILL.md. The handle
  `e.renderer.prepareLights` is in links-and-handles.md.

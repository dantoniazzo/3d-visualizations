# App notes: what a space meets beyond its own scripts

Read the part you need when a space is furnished, published, baked, lit,
driven or edited, or when the tools misbehave. SKILL.md is the method;
this is the app around it, learned the hard way.

## The spec, the validator and the editor

- `server/scene/validate.js` rebuilds rooms, walls, openings, stairs, floor
  openings, doors, vehicles, furniture, people and spawns field by field: a
  new field or top-level key is silently dropped on seed and on every editor
  save until it is added (as `closetSpec`, `RAIL_SIDES` and `people`
  were). Garden settings must exist
  in `shared/garden.js`'s `GARDEN`. The landscape is kept as given, within
  `sanitizeLandscape`'s limits (shared/landscape.js). After adding a field,
  check it survives `npm run seed -- <id>` and an editor save, and restart
  the test server; the user's own server keeps dropping it until they
  restart it too.
- Read the seed's printed notes every time ("walls[256].openings[1]:
  overlapped the previous opening, dropped") and its room/wall/door counts.
- `npm run seed` without an id rewrites every seeded space: always
  `npm run seed -- <id>`. Back up every `scenes/*.json` to the scratchpad
  before any seed, and if a bare seed happens, copy the others back from
  that backup. Never `git checkout` a scene file: every one can carry
  uncommitted work — the user's own edits, and since 2026-10-09 Ladonia's
  people.
- The editor: flights rest only on floors (`gravity: "floor"`); its fit
  check must stop at a flight's cupboard ceiling; a flight through an
  opening keeps its head when resized. If the user reports "can't change X,
  it would hit Y", reproduce it in a test editor with saves stubbed first.
  Aim its camera with `editor.view.lookFrom(pos, target)` then
  `editor.view.update()`; it resets the camera on every draw otherwise.
- Room polygons on one level must never overlap: the floors z-fight as
  black stripes and the editor files fittings under the wrong room.
- Chrome and mirrors are black without an environment map:
  `Utils/reflections.js` gives a PMREM room only to metals (metalness ≥
  0.5, roughness < 0.6, no metalnessMap — or any metal with `imageLit`) and
  clear glass. Keep paint and lacquer below 0.5 metalness (paint at 0.5+
  turns studio-silver). Furniture loaded after the Environment must go
  through `applyReflections` (FurnitureLibrary does). Night reflections are
  scaled down or metals glow in the dark: 0.06 under a landscape's Sky
  (`Sky.applyIndoor`), 0.03 under the old Environment presets.
- `THREE.Color("#hex")` is linear: write it into a canvas (sRGB) with
  `color.getRGB(target, THREE.SRGBColorSpace)`, or the texture comes out
  far too dark.
- If something "exists" but nothing shows, look for NaN in its bounding box.
- meshopt-packed GLBs keep each mesh's quantisation in its node's TRS:
  never overwrite a packed node's scale or position from the app; wrap it
  in a parent and transform that.

## Lights and fittings

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
  node's own Blender coordinates; `glow` is the material of its bulb or
  glass (default `linen_white`), `radius` how far from `at` that glass
  reaches (default 0.022), `room: true` puts it on its room's ceiling
  switch (a pendant, a wall light, a track — part of the room's lighting),
  else it gets a switch of its own (a bedside or table lamp).
  - Ladonia's 11 lamp pieces carry them (2026-10-05): in `ladonia.py`, a
    builder returns `_lit(parts, _light(glow_part, W, BULB|LED))` (`BULB`
    #ffcf99, 2700 K; `LED` #ffd6a3, the ceiling fittings'), `_light` sets
    `at` at the glow part's centre and `radius` to its farthest vertex, and
    `export_furniture.py`'s `LD.place_lights(obj, shift)` moves the lights
    with the piece's re-centring. A track has one light per head, each on
    a child node `<id>.lightN` (one summed light would need a 1.9 m bulb).
  - Give every lamp's glow material a name only that piece uses (`_glow`
    renames a copy): a publish numbers a second model's same-named
    material `name#1`, and the bake matches bulbs by exact name. Wrenfield's
    lamps (`furnish.py`'s `_lamp`) still use `linen_white`.
  - Model shades open at the light's end; keep bulbs and glass vertex-lit.
    `part_bulbs` takes a glow face only if all its vertices are within
    `radius` + 1.2 cm of a light — a long diffuser needs a long radius, and
    the live view caps a lamp light's offset below `at` at 5 cm
    (LampPool) so a wall light's light doesn't land in the headboard.
- **Lights switched live** (2026-10-05) — the editor's walkthrough and edit
  mode, `?live`, and a version published unbaked (the publish panel's
  preset "Lit live — as in the editor", `PUBLISH_PRESETS`): the switches are
  the bake's (`Fittings.gatherLights`, one per room's ceiling light plus one
  per lamp of its own), turned with the HUD's lights panel, the editor's
  bulb button or **L**, and Ctrl/⌘-click on a light or its wall switch (in
  sight only — walls stop it — and only on what the editor shows). A
  visitor's switching is never saved. The pieces:
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
    surface). In edit mode the pool follows what the view looks at
    (`editor.view.target`). Fades 0.25 s; shadows
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
- The editor's collections (Editor/Collections.js) file a piece by the
  room under its bottom: a lamp hung over a terrace or a roof deck is the
  deck's, Outside (as is the furniture on it); a lamp hung from a ceiling
  is filed by its bottom's storey, which can be the storey above's level
  index when storeys of two buildings interleave (Ladonia's A tracks at
  2.55 m read as C's first floor, 2.2) — known, not fixed.
- Light units, matched to the bake: a Blender sun of strength S is a
  DirectionalLight of intensity S; a W-watt point lamp is W/(4π).

## People

Animated people set round a property (Ladonia, 2026-10-05/09): standing
groups with drinks, people on sofas and chairs, people lying on pool
loungers — the spec's `people`, drawn by
`frontend/Experience/World/People.js`. The method is SKILL.md §4b; every
field, constant and script is in `reference.md`, People. Read People.js's
class comment and `shared/people.js`'s header before touching either.

- **What they are made of.** One GLB a character, cloned per person with
  one skeleton for all its meshes (GLTFLoader gives each skinned mesh its
  own; `sharedSkeletons` took twelve people from 72 bone textures to
  12); one `clips.glb` for everyone, each clip fitted to each body: its
  rotations kept, its hips' movement scaled by `character.hips /
  clips.hips`. Without `index.json` the app uses the stand-ins
  (`index.standin.json`: its own two avatars with a made-up sitting and
  lying pose), which prove the plumbing and nothing about how real clips
  sit, lie or hold. Each person starts its clip at a point and a speed of
  its own (`seed`). A clip of one frame (four of Ladonia's 17) breathes:
  the chest turned 1.1° back and forth at about 0.25 Hz, the top of the
  spine against it (and with the chest whatever hangs from it: hands
  under a head move a centimetre).
- **Placing.** Rotation 0 faces north, as furniture; a rig faces +z and
  is turned half round. Standing: the lowest the soles come in the clip
  (12 samples) on the floor, not the rig's root. Sitting and lying: the
  clip's seat on the entry's position, as low as the body's own skin
  under the pelvis. A sitter is then lifted, 1.5 cm at most, or on a
  sofa let down, 3 cm at most counting what the planner gave, until the
  soles are on the floor (`liftFor`).
- **Lying on a raised back** (seats.json's `incline` over 5°): the spine
  is turned up about the hinge on the surface, where the lounger's back
  starts to rise, by as much as lays the body's own back skin on it (on
  Ladonia's 35° lounger 16–33°, measured on three bodies: less for a
  clip that lies with its shoulders up), the spine's position corrected
  for the turn. The neck is let back, 35° at most, when the head would
  be over 3 cm off, unless the hands are under it. Arms lying out past
  the cushion's `width` are brought in to rest on it by three turns:
  upper arm, forearm, hand. A clip propped up of itself is left as it
  is.
- **Holding.** A prop goes in the hand the clip's `hand` names; a clip
  with `hand: false` holds nothing. Its grip point is put where the
  fingers close, measured on the hand itself (`GRIPS`), or in the crook
  of the thumb of a hand that opens in its clip (`curl` under 45°).
  Every held drink is stood upright after each mixer update (`upright`):
  16° off at most, whatever the hand does, its grip where it was. Within
  reach of the mouth it is tipped at the lips: a bottle as far as the
  clip lifts it, 130° at most, and let down through the hand until its
  mouth stops 4 mm short of the lips; a glass or a cup 65° at most. A
  clip that drinks is given the beer bottle when it is built, whatever
  drink its entry names (the entry keeps its own). Sunglasses hang at
  the character's `eyes`; a towel or an open book lies past the feet of
  someone lying; a prop with no grip is left off anyone else.
- **Cap and cull.** `QUALITY.people` by slider step (reference.md): at
  most `most` are drawn, the first of the spec's list, whole groups at a
  time — except in the editor's edit mode, which draws all. A public
  view builds, and so downloads, only those its step draws, and the rest
  when the step rises: at step 0 four people fetched 3.4 MB with clips
  and props, against 11.7 MB for all twelve (as the server sends them,
  compressed; the files are 4.6 and 14.0 MB). Each is culled by a fixed
  sphere round its pose (a skinned mesh's own bounds are its rest
  pose's), animated every frame near the camera, every few beyond, and
  not at all out of sight or past `still`.
- **Collision.** Each person drawn is a box in `collision.people`, a
  fourth tree: the walker goes round someone standing and round a seated
  person's legs. Rays pass it (the camera's boom, pointing at a light).
  Hidden or filtered people have no box.
- **Light.** Lit as the furniture is. Each character's materials are
  copied in two sets, out of doors (the whole sky) and indoors (`INDOOR`,
  and RoomGlow with the room's switch), chosen by the room under the
  person's spot; they cast and take shadows. In a baked view they take
  the bake's probes at the middle of each pose (ProbeLight), and the
  lamp and sun shadows are drawn again when a person appears, goes or is
  hidden, not as it breathes.
- **The editor** (`PersonEditable` in Editor/Editables.js; Editor.js):
  - Select, move, turn, duplicate and delete as a piece of furniture; no
    scaling. Picking is by capsules round the bones: a ray against the
    skinned meshes cost 8.6 ms a person, every frame of the
    walkthrough's aim.
  - Someone standing rests on the floor and must fit, but is never
    pulled flush to a wall. Someone sitting or lying, dragged, goes to
    the free seat or lounger nearest the pointer within 1.5 m, or stays;
    moved with Shift they go anywhere, and keep their seat within 0.6 m
    of it.
  - Add → People: standing (on the nearest clear floor, facing and
    joining a group within 2.5 m), sitting on the nearest free seat,
    lying on the nearest free lounger; a toast when there is none within
    12 m.
  - The panel: Character, Pose, Animation, Holding; under "Everyone",
    How many and "Re-roll everyone" (also Object → Re-roll people). A
    re-roll plans everyone afresh with a random seed and replaces a
    vetted plan: one undo brings it back.
  - Moving or turning a piece carries the people on it; deleting it
    deletes them (one undo restores both); scaling it does not re-seat
    them.
  - Undo and redo cover people. The outliner's People collection lists
    them by room; its eye hides them all. Hide through
    `people.setFilter`, never `group.visible`.
  - The editor hands the planner the whole of the index's `clips`
    (`castOf`); given only its list, nothing was scaled to the
    character, and re-rolled sitters needed 2.6–3.0 cm of lift.
- **Publishing.** People are a piece of scenery (`shared/scenery.js`):
  - Left out of a version by the Publish panel's Scenery boxes
    (`leaveOut` empties `people`), or hidden by a visitor with the
    People toggle, which their browser remembers. Hidden on load,
    nothing of them is downloaded until they are shown.
  - They travel only as the published `spec.json`'s list: never in
    snapshot.glb, view.glb or runtime.glb, never in the visibility
    sampling, never in a bake. So after placing or changing them,
    publish again; no bake is needed for them.
  - In the bird's-eye view, people on floors above the one shown are
    hidden.
  - Remembered options: `publishOptions` keeps the pieces there were to
    choose from beside the pieces chosen (`sceneryKnown`). Before it
    did, options a browser remembered from before there were people
    came back with People unticked, and a publish silently dropped
    everyone (the rule: SKILL.md §13).
- **The validator** keeps `people` (reference.md). A server started
  before that code drops the key on its next save: restart the test
  server, and tell the user to restart `npm start`.
- **What the conversion mends** in Mixamo's downloads
  (`blender/import_people.py`): numbered bone prefixes (`mixamorig12:`);
  a character at twice life size (remy, 3.78 m); lying clips with their
  heads any way round and sitting clips facing backwards or sideways,
  all turned to +Z; a clip that walks in before it sits ("Sitting
  Drinking": 2.7 m), cut to its settled part; see-through hair and
  bodies, a gloss map read as roughness, a specular map; textures cut to
  1024 px (normal maps 512).
- **Why it is built this way** (what the real clips showed; the stand-ins
  showed none of it):
  - A hanging or gesturing hand tips a glass 60–110°, and only the
    drinking clips were recorded holding anything. So the runtime stands
    every drink upright, the conversion measures which hand can hold
    (`hand`, `tilt`, `curl`), and the planner gives drinks only to those.
    Mixamo's "Drinking" drinks from a bottle, the left hand lifted over
    the mouth: a glass there went into the face, hence the bottle.
  - Scaling a sitting clip to a body by its hips' height was up to 6 cm
    out. So the conversion measures every sitting clip on every body
    (`sits`), and the runtime rests each body on its own skin.
  - A loose pillow is not the seat: the lounge chairs measured 0.577 m
    until `measure-seats.mjs` took the pillow for part of the back
    (0.371).
  - A lying clip lies with its shoulders up by an angle of its own. So
    each body is bent by what its own back needs, about the hinge, not
    by the lounger's incline.
- **Cost**, as the first fix round's verifier measured it (M4 Pro, public
  view, hidden pane, so approximate — the runtime's builder had a third
  of it; the rules are SKILL.md §12). At step 4 (2048 × 1536) nine in
  view added 66 draw calls, 438 thousand triangles and 2.5–4.5 ms a
  frame; a group seen from 3 m, 21 calls and 2.1–2.5 ms. At step 0
  (1024 × 768) four drawn added 27 calls and 0.6–3.2 ms. `tick` itself
  is 0.05 ms at step 4 and 0.02 at step 0.
- **Still short** (2026-10-10):
  - Lying legs hover: calves 3–8 cm and heels up to 11 cm over the
    cushion on every lounger (Ladonia's plan: heels 4–9 cm). The pelvis
    rests and the clips lie with their heels higher; the thighs want
    turning down about the hips, as `armsFor` turns the arms.
  - Some heads miss the headrest: in "Laying Idle" brian 7–8 cm, josh
    and lewis 4–5; in "Laying Hands Behind Head" brian 7 and lewis 5–6,
    and megan's bun sinks 6 cm into the cushion. Ladonia's plan avoids
    these pairings by hand.
  - "Sitting Reclining Female" puts an arm through a chair's rail or a
    sofa's back cushion wherever it sits (9 of 9): left out of planning
    (`LEFT_OUT`), still offered in the editor's Animation list.
  - Seated calves: 7 of 43 planned sitters had calf skin 1.4–2.3 cm in
    the seat's front edge. Corner sofas: a foot can go 4.5 cm into the
    other wing (`LEG_ROOM_TAKEN` in measure-seats.mjs).
  - Lounge chairs (`ld-out-lounge`): their slats count as soft, so a
    sitter can sink 2–4 cm into them; the loose pillow is 7–9 cm into
    every sitter's lower back; two of Ladonia's sixteen get no one (a
    round table stands 0.3 m before the seat).
  - "Sitting Drinking" brings the bottle 4 cm under the skin of the
    face on kate, sophie and megan; "Laying Hands Behind Head" leaves
    the elbows past the cushion's edge. A hand that opens as it
    gestures ("Talking") keeps its glass in the palm without gripping
    it.
  - Most sitters play "Sitting Idle" (49 of 71 over 20 seeds): the
    livelier clips tuck their feet, which a sofa's solid base is in the
    way of.
  - A baked view has no probes on roof terraces (rooms 0.05 m tall;
    outdoor probes stop 3 m above the lowest floor): people there keep
    the scene's light. On phones a person's sun shadow keeps one pose
    until something moves.
  - No swimwear: Mixamo has none, so those on the loungers wear street
    clothes. shannon, by Ladonia's pool, is in a football strip.
  - Unchecked when the plan was written: the last four fixes (the
    pool's coping and planter grasses as obstacles, the bottle for any
    drink on a drinking clip, `LEFT_OUT`). `checks/people-plans.mjs`
    passes all of it over 20 seeds. The user then moved two people in
    the editor (brian, remy on C5's roof — their edits, to keep).
    `people-audit.js` on the scene as they left it (2026-10-10) flags
    six: the heels and the pillow above, and
    - brian (person-9): his left upper arm 1.8 cm in a roof planter's
      grass. He stands 0.72 m from the planter's box, which `GRASSES`
      (0.25 m out) and `MARGIN` allow: Ladonia's grasses reach further.
      At the checker's spot, `[11.14, 5.4, -20.04]`, the roof group
      audits clean (tried with `patch`; not written);
    - kate (person-3), "Laying Hands Behind Head": the right hand under
      her head 3–5 cm into the cushion as she breathes in.

## Furniture: the catalogue, its height and its collision

- `public/models/furniture/catalog.json` is written by
  `blender/export_furniture.py` (`npm run furniture`). The app reads each
  item's `id` and `url`, and these fields:
  - `name`, the editor's label, and `category`;
  - `size`, [w, h, d] as it faces north, which furnish.js places by;
  - `scale` and `yaw`: FurnitureLibrary multiplies a placement's scale
    by `scale` and turns the model by `yaw`;
  - `enabled`: `false` drops the item on load;
  - `anchor` and `collision`, below.

  Register a piece in `PIECES` as `(id, label, category, build[, anchor][,
  {fields}])`. A trailing string is the anchor (`floor` by default). A
  dict is merged into the entry as it stands, e.g. `{"collision": "mesh"}`.
  `npm run furniture -- <prefix>` rebuilds the ids that start with a
  prefix, and any id not yet in the catalogue. It keeps every other entry
  as it was.
- The exporter centres each piece on its footprint and stands its lowest
  point on y = 0, whatever height it was modelled at: the double vanity is
  built from z 0.40 and its GLB starts at 0. A placement's y is where that
  lowest point goes, so a floating piece carries its lift in y:
  - joinery's `vanity` and `vanity-small`: +0.34;
  - Ladonia's walnut drawers: +0.28; its double vanity: +0.40;
  - headboards: +0.55; the wall light: +1.165;
  - TVs: +0.8 to +0.95; art: +1.0;
  - a ceiling piece: `top − height` (furnish.js `hang`).

  Name the lift in the catalogue label ("hang at y 0.28"). The anchor
  changes none of this; it matters only in the editor. `wall` and `ceiling`
  pieces get no gravity. A newly added `wall` piece starts 1.4 m up and a
  `ceiling` one with its top at 2.7 m. A floating `floor` piece keeps its
  height when dragged level, because gravity holds only a piece that starts
  within 3 cm of a support. "Drop to surface" does put it on the floor.
  The checkers sort pieces by anchor, so don't change an anchor to avoid
  that.
- How a piece collides is decided by `SceneBuilder.dynamicCollisionRoots`,
  which also feeds a publish's runtime file:
  - pieces flatter than `FLAT_HEIGHT` (3.5 cm: rugs) and `collision:
    "none"` are left out;
  - a piece collides as its own triangles up to `MESH_COLLISION_BUDGET`
    (12000, counted over the loaded model);
  - over the budget, or with any part that opens (`userData.opens`), it
    collides as its local bounding box, turned with it;
  - the catalogue's `collision: "mesh"` or `"box"` forces either.

  A box covers floor the piece doesn't. The inside of an L-shaped sofa,
  where the plans put the coffee table, became a wall the walker couldn't
  pass. Ladonia's chaise and corner sofas have 14–21k triangles with their
  cushions, so all of them carry `"mesh"`. Its beds (14–24k since the
  2026-10-03/04 pillows: the doubles 19.5–24k, the singles 14–15.5k)
  collide as boxes. That works because the
  headboard is a separate wall piece, so a bed's box is only the bed.
  `checks/_modes.mjs <id> …` prints each piece's count and mode. Never
  force `"mesh"` on a piece with opening parts: those are skipped as
  transient, and the walker goes through its doors into the hollow
  carcass. Fitted pieces exported shut (`_fixed`) have none. After a
  catalogue change, run `npm run build` and restart the test server.

## Doors

- A hinged leaf opens to 0.52π (93.6°), eased, about the jamb its swing
  names (`Door.update`). A sliding or pocket leaf slides its width less
  4 cm towards that jamb, and stands 6 cm out on side A. Which jamb and
  which side each swing name means: `reference.md` (kit.js, Swing).
- Leaves are never in the collision octrees (`isTransient`).
  - While a door's `open` is under 0.3 (`BLOCKING_THRESHOLD`; about 48° of
    swing, since the swing is eased), each leaf is an oriented box (its
    width less 1 cm, its height less 2 cm, 4 cm thick).
    `SceneBuilder.resolveDoorCollisions` pushes the walker out of it every
    frame (`Door.resolveCapsule`, an upright cylinder against the box in
    the box's frame).
  - Past that, a leaf collides with nothing. The walker passes through it,
    and it passes through furniture.

  So a leaf that sweeps into furniture is a fault you see, not one that
  blocks the way. Audit it fully open (In-page audits, t = 1), not at 90°.
  At 93.6° the tip of a 0.9 m leaf ends about 6 cm back past the line of
  the hinge jamb (0.9 · sin 3.6°). A piece against the wall beside that
  jamb must stand that much clear of it, plus 2 cm for half the leaf's
  thickness, or the open leaf cuts into it. Ladonia's final review re-hung
  or moved several doors for this.

## Finishes and their texture generators

- The canvas generators in `World/Builders/TextureLibrary.js`
  (`GENERATORS`: `planks`, `herringbone`, `plaster`, `terrazzo`, …) draw
  every generated finish in `shared/catalog.js`, for every space. A change
  to a generator or to its defaults redraws every finish that uses it.
  Instead, add a param that defaults to the old drawing and set it only
  on your own finish, as Ladonia added `planks`' `vertical` (boards on
  end, `oak_cladding`) and `cover`, and `plaster`'s `soft`. Then compare
  another space's frames before and after (SKILL.md §10).
- `planks` lays two boards a row, each row shifted by `stagger` × its row
  number of the tile's width (wrapped). Where the shift passes a board's
  length, half the tile (as some rows do at 0.37), the start of the row is
  left bare and the gap colour shows there as a dark block. `cover: true`
  lays one more board there. It is set on `oak_honey` only, so
  `oak_parquet`, also at 0.37, is drawn as before.
- Every generator must tile. Anything drawn within reach of an edge is
  drawn again across it (terrazzo's `wraps`, for its mottle and every
  chip), or a seam of cut-off chips shows at every repeat. The Blender
  bake generators tile by indexing pixels modulo the image size
  (`lib/bake.py`), with any period a divisor of 512.

## Publishing, the public view and baking

- `/view/<id>` shows the latest *published* version, not the scene being
  edited. See current work with `/view/<id>?live` or `/?scene=<id>`;
  `?version=<v>` opens one publish; `?lighting=live|baked` forces either;
  `?quality=0…4|max` a slider step; `?stats` draw calls, triangles and
  bytes. Lights, switches and garden settings are gathered at publish:
  after changing them, re-publish and re-bake (`npm run build` alone
  changes nothing baked).
- Test publishing against a scratch `PUBLISH_DIR`. To look at the user's
  own published bake, start another test server with `PUBLISH_DIR` at the
  repo's `published/` and `BAKE=off`, and only open `/view/<id>` on it —
  never publish from it. In a test tab (non-GET
  requests stubbed except /publish, /runtime and /bake):
  `experience.world.emit("publish")`, click `[data-publish]`, poll
  `[data-result]` (~16 s; poll the folder from bash if the 45 s call times
  out). Version folders must be timestamps (`20260926T120555Z`). Draft
  bake in the background: `PUBLISH_DIR=<scratch>/published node
  scripts/bake-public.mjs <id> --version <V> --samples 32 --size 1024 >
  log 2>&1`; final is `npm run bake -- <id>` (512 samples at 4096,
  12–15 min on the M4 Pro for one house, plus a 2048 phone copy; Ladonia,
  three buildings with 93 switches, 3 h 22 min — run it detached with
  nohup and poll the log, a background shell stops at 2 h).
- Drafts are blotchy: judge light levels, not grain. Budget: ~78 s bare,
  ~4 min with 22 switches, ~15 min with a full garden.
- Publishing drops faces no sampled viewpoint sees: landscape a visitor can
  walk round needs `mesh.userData.keepWhole = true` (HillBuilder,
  NeighbourhoodBuilder and LandscapeBuilder set it). The viewpoints
  (`Publish/viewpoints.js`) stand on every outdoor level a point has —
  a parking slot under a roof terrace as well as the terrace — on the
  terrain's height, and on roof terraces over rooms.
- **A version published unbaked looks as the editor does** (2026-10-05;
  the preset "Lit live — as in the editor": hidden faces removed, merged,
  compressed, plain glass, not baked, quality auto, all the scenery). What
  that took, for anything new a space draws: a material drawn by its own
  shader must take its data with it (the terrain's paint goes as four
  numbers a vertex, written `_PAINT0`/`_PAINT1` pairs and restored by
  name; an older version's terrain is painted on load, `paintTerrain`);
  materials keep `normalScale`, `depthWrite`, `side` and the metals'
  studio reflections (Runtime.js `exportable`); the faces culled that still
  cast a shadow travel in runtime.glb as position-only casters
  (`shadow:<floor>:<kind>:<cell>[:two]`, every face whatever the time of
  day, two-sided materials apart and drawn DoubleSide, in 16 m squares —
  8 m made 133 pieces, ~125 more draw calls a sun's map, for no time
  saved), simplified by the server like the collision (Ladonia 647,612 →
  78,116 triangles; the manifest's `shadowCasters`); a woven shade's
  strands, too fine for the samples, are kept whole from both sides
  (`keepWhole: "both"`, set by `markBulbs`); light glass and bulbs are
  their own meshes tagged with their switch, and the published spec's
  `lights` is gatherLights' list, which the public view switches live
  (an older version without it gathers its own from what it built). A
  version with nothing to switch keeps the old fill lights.
- The bake's tree shade comes only from the Fluffy Tree garden's trees
  (`planTrees`, `planHillTrees`, `planRoadTrees` → `tree_shade` proxies);
  a landscape's own trees cast none in a baked view unless added to
  `scripts/bake-public.mjs`'s settings.
- Big outdoor geometry steals lightmap texels, and the bake fills hidden
  faces only from spec walls and slabs (`scripts/bake-public.mjs`
  `solids`), with only the fence and hills in `coarseMaterials`. Before a
  final bake of a `spec.landscape` site, add its landscape walls, planters
  and terrain to both, and compare `[bake] house texels` before and after.
- A surface hidden under other geometry bakes black and bleeds: cut it out
  (holes) rather than leaving it underneath.
- A bake that fails inside Blender: Blender exits 0 after a Python error
  unless it runs with `--python-exit-code 1` (scripts/bake-public.mjs now
  passes it), so the error used to surface later as "ENOENT … bake.json",
  with a `bake-<stamp>/` folder holding only `settings.json` left behind
  (the script now deletes a stopped bake's folder, unless `--debug`). Read
  the Blender traceback in the log, not the last line. Reproduce on a copy:
  copy `published/<id>/manifest.json` and the version folder (without its
  `bake-*` folders) to `<scratch>/pub/<id>/`, then `PUBLISH_DIR=<scratch>/pub
  node scripts/bake-public.mjs <id> --samples 16 --size 1024 > log 2>&1`
  (~25 min for Ladonia to reach the samples; ~1 h 55 min to the end, about
  55 s of it each time Blender hands the 1.5 M-face scene to Cycles — a
  hundred times, with 93 switches). To work on
  the unwrap or the packing alone: `BAKE_CHECKPOINT_UNWRAP=<file.blend>`
  (with `BAKE_STOP=1` to stop there) saves the scene before the unwrap,
  `BAKE_CHECKPOINT=<file.blend>` before the packing, and `bake-replay.py`
  (this folder; its header has the commands) reruns them on it with
  bake_public.py as it is now — minutes, not 25.
- The lightmap unwrap is angle-based (2026-10-04): Blender's
  minimum-stretch unwrap failed islands on Ladonia and varied from run to
  run on the same input — 94% of the surface at an even texel density in
  three runs, 15% in the fourth, a bedroom floor with no lightmap — where
  angle-based gives 100% every time, in half the time.
- The atlas is one lightmap for the whole site, cut into a rectangle per
  room (`pack_zones`). Ladonia's first bakes failed there: 22 thousand
  islands (three buildings' furniture) with 8-texel margins needed about
  twice the 4096² atlas, every room's rectangle came out smaller than its
  trial pack assumed, and Blender's packer shrank a dozen rooms' islands to
  nothing (then a division by zero). `pack_zones` now sizes each room from
  its islands' boxes and margins at the one scale at which all of them fit,
  narrows the margins to as little as half when the islands would otherwise
  cover under `MIN_SURFACE` (a quarter) of the atlas — Ladonia: 8 → 4
  texels, 5.6 cm texels, 30% filled; a single house keeps 8 — and logs
  `zone short of texels` for any room still packed under half the usual
  density. Read the `[bake]   atlas …` and `house texels` lines of every
  bake: zones within ~50% of each other and texels of a few cm are healthy.
- **A site with its own sky is baked under it** (2026-10-04): until then the
  bake lit every space with its `environment.preset` — Ladonia's sun 83°
  from the live view's (from the west, not east-south-east), a flat
  procedural sky, a moon. `shared/sky.js` now holds the live sky's numbers
  (`SKY_VARIANTS`) and its sun maths (`findSun`, `sunDirection`), used by
  both World/Sky.js and `scripts/bake-public.mjs`'s `landscapeSky`, which
  hands bake_public.py's `sky_world` the HDR (sun clipped at the browser's
  ceiling, turned with a TEXTURE Mapping at Z = +turn — render-checked),
  the sun (`#fff6ea`, 3.2, 1.1° across) and the strengths: by day the
  sky's own (1.0; the live view's 0.3 is for light that knows no walls —
  against renders 13/14 the bake's shaded façades match, the live view's
  are too dark), at dusk the live outdoor share over the share of the
  dusk's light above the horizon (`findSun`'s `above`: 0.179), no moon.
  The log shows `[bake] sky <hdr> turned 19°, strength 1, 982 sun pixels
  clipped`. Check it: the baked view's sun (`sun.position −
  sun.target.position`) equals the live one's ((0.780, 0.588, 0.213) for
  Ladonia). Spaces without `landscape.sky` bake as before.
- **A baked landscape view is drawn under its sky** (World.setLighting):
  the sky's variant first (`Sky.setVariant`, prefetched with the lightmaps
  — `Sky.prepare` — and caught if it fails), then the bake's light over it
  (`Environment.setVariant`: the bake's sun, exposure `2^view.exposure ×
  Sky.exposure(variant)`, background/fog/hemisphere left to the sky,
  shadows re-fitted). Before, the two raced — whichever finished last set
  the sun, exposure and fog, and a day/night toggle swapped them.
- **Interiors in a baked view are metered** (Realism's `LightMeter`): the
  bake's rooms hold the real light through their windows, a tenth to a
  hundredth of the day's and far from even, where the live view gives every
  room 0.8 of the whole sky; with the live view's flat ×2.2 they drew at a
  fifth of its brightness. Indoors by day the camera now meters what it
  sees (a 64×36 half-float render, log-average, NaNs dropped, nothing
  darker than ×32 can lift counting for more) and exposes it to
  `METER_KEY` 0.18, ×1 to ×32 (`METER_MOST`); it stores the light, not the
  exposure, and reads again at once on a room change, a 1.5 m jump, or a
  change of light (variant, lightmap, switches, doors), and at most every
  0.5 s while moving. At the steps without post-processing (phones) a
  render into a target of its own would compile every material a second
  time (no tone mapping, linear output), so there it reads the room's mean
  light from the bake's probes instead (`PROBE_KEY` 0.55; 12 without
  probes). Outside and at night as live. Calibrated so Ladonia's living
  rooms and bedrooms match the live view's mean brightness: the glazed
  living room ×3–4, the open-plan ones ×11–15, a one-window bedroom ×27–32,
  and ×1.3–1.5 with the room's ceiling light on. Never judge a baked
  interior at a fixed exposure.
- Windowless rooms (bathrooms, closets) bake black by day: their lamps are
  switches, off by day. Rooms whose windows have blinds down bake dim.
- Known bake faults and their causes: dark corners and lines from faces
  running on inside the next wall; seams from T-junctions and slivers (weld,
  split, BEAUTY-triangulate, delete < 1e-7 m²); light leaks through
  two-sided surfaces (bake the copies 3 mm apart); smudges from wrong
  denoiser guides; a hot halo from fittings close to the ceiling raising a
  switch's lightmap scale (read `scale` in the manifest). A room's material
  mixes at most 6 switch layers.
- The baked view rebuilds materials from runtime.glb by name: a material
  keeps its finish texture only if its name is exactly a catalogue finish
  id, and its depth layering only through `userData.polygonOffset`
  (Runtime.js `exportable`, SceneBuilder `restoreLayer` and `materialFor`).
- Never keep a Texture or a Color in `material.userData`: three's
  `Material.clone` copies userData through JSON, so a clone gets a plain
  object for the texture (`CUBEUV_MAX_MIP NaN` — the glass and metals fail
  to compile) and a number for the colour; and a runtime publish carries
  the JSON in its extras. Sky.js keeps them in WeakMaps (`OWN_ENV`,
  `GLASS_OWN`, `OWN_EMISSIVE_MAP`). Tell a stale console error from a new
  one: install `renderer.debug.onShaderError` after load and render, or
  count `renderer.info.programs` with failing `diagnostics` — the pane's
  console keeps the previous load's messages.
- A baked material drawn by a shader of its own (the terrain's paint, kept
  under the lightmap: `drawnByOwnShader`) gets none of its room's switch
  or door layers: five grounds and a relief leave no texture units for
  them (16), and whatever of the terrain is in a room lies under its
  floor.
- Now and then Chrome's Metal translator fails to link a shader that is
  fine (one load in nine: "no matching function for call to
  'ANGLE_sc2d'"); `Renderer.relinkFailed` rebuilds any failed program's
  materials, twice at most.
- `findPublished` (`frontend/index.js`) serves every lighting file whose
  name ends `.webp/.png/.jpe?g/.ktx2/.bin` from beside the manifest: a new
  file type must be added to that pattern, or it fetches index.html ("read
  past end").
- Live vs baked: live ~6 ms idle, 13–18 ms with movement; baked 1.5–2.2 ms.
  Phones always get the baked view. Door leaves aren't in the bake.

## Tone, AO and colour

- Tone mapping is per space: `garden.colour.toneMapping` is `aces` (three's
  ACES Filmic — the default, and Ladonia's) or `filmic` (Blender's Filmic
  curve, `Utils/filmic.js`), with `exposure`. At the graded slider steps
  (2–4) an ACES space is drawn with AgX plus the renders' colour grade
  (PostProcessing.js); `filmic` is kept as asked. Pick the tone mapping and
  the slider step, and keep both fixed while measuring against renders.
- A Blender sheet is not the app's colour. `thumbs.py` renders with AgX
  under a flat grey world. The app uses ACES (or AgX plus the grade at
  steps 2–4), with rooms under the warm indoor share at exposure 2.2. The
  same material reads darker and more saturated in the app: felt, the
  caramel curtains, mustard fronts. Judge a colour in an in-app frame
  beside its reference at a fixed slider step, then change the material.
  A sheet shows shape only.
- AO: N8AO 1.10.1 + postprocessing 6.35.6, half resolution, 8/12/16
  samples at slider steps 2/3/4 (none at 0–1, which have no
  post-processing), `gammaCorrection: false`, lazy-imported. three's
  GTAOPass draws leaf cards as solid squares.

## Cars

- A downloaded car goes in `assets/cars/` (never `public/`, which is
  deployed), listed in `assets/cars/cars.json`
  (`{ id, name, file, scale | length, forward }`), then
  `npm run models -- --cars <id>` and `npm run build`; a space uses it as
  `vehicles[].model`. Record author and licence in README and
  `assets/THIRD_PARTY.md`. For an exact likeness of a branded object, offer
  a sourced model early rather than iterating a hand-built one.
- Spin every imported car's wheels: steered-pose fronts wobble and separate
  tread blocks stay on the body.

## Blender

- 5.1 API: the compositor is `scene.compositing_node_group`; Denoise
  options are input sockets; `pack_islands` needs
  `tool_settings.use_uv_select_sync = True`; export with
  `export_vertex_color="NONE"`, `export_all_vertex_colors=False`; GLTFLoader
  lowercases custom attributes. Blender (x, y, z) is the app's (x, z, −y).
- Blender isn't on PATH on this Mac:
  `/Applications/Blender.app/Contents/MacOS/Blender --background --python …`
  (the npm scripts find it themselves, `scripts/lib/blender.mjs`).
- Guard lib modules with `if __name__ == "__main__"`; keep preview runs
  export-free. `__pycache__/` and `*.pyc` are untracked and gitignored:
  Blender's rewrites need nothing; never force-add them.
- When changing a shared joinery helper for one piece, pass the change as a
  parameter and diff triangle counts per GLB node before and after: one
  "small" handle change altered every handle in the house.
- Materials (`lib/materials.py`). `plain`, `glass` and `emissive` are flat
  colours, given `linear()`. The other recipes bake a tiling image on
  export (`export_app.bake_tiling_textures`, with the generators in
  `lib/bake.py`), laid on world box UVs at `tile` metres a repeat. Their
  colours are given `srgb()`, as they should look. Besides `planks` and
  `tiles`, pick the recipe by what the surface is:
  - `veneer` → `grain`: wood (oak, walnut, teak), and opaque cloth with a
    straight slub (`curtain_caramel`);
  - `speckled` → `terrazzo`: stone — the terrazzo and quartzite tops,
    granite, marble. On upholstery it reads as stone chips: the `boucle_*`
    finishes, no longer used;
  - `nubbly`: bouclé and fine basket weave (`weave_oat`, `weave_cream`);
  - `heather`: heathered felt and wool, short fibres over a mottled ground
    (`felt_fleck`, `felt_sage`, the headboards);
  - `twill`: fine diagonal ribs, for cloth on a flat panel (`linen_panel`,
    the wardrobe doors);
  - `sheer(…, weave=…)` → `linen`: see-through curtain cloth, blended and
    two-sided (`curtain_linen`);
  - `noisy` → `carpet` (scale ≥ 60) or `mottle`: linens, rugs, plaster.

  `_two_sided(mat)` turns backface culling off, for a single sheet seen
  from both sides such as an opaque curtain; glass and sheers are
  two-sided already. The export scales each baked image so that its mean
  is the material's flat colour (`flat_color`). A pattern therefore adds
  texture, never tone: to fix a tone, change the colours, not the
  pattern's contrast.

## The browser pane

- `javascript_tool` stops at 45 s but the page keeps running: keep calls
  short and assume a timed-out loop is still changing state. Never
  `await img.decode()` with the pane hidden (never settles). Read pixels in
  the same call as the render (`preserveDrawingBuffer` is false).
- Never call `experience.update()` by hand: each call also queues its own
  requestAnimationFrame loop that never stops (40 calls hung the tab, and a
  few leave extra loops that skew timings until a reload). To step the
  world, set `e.time.delta = 1 / 60` (seconds) and call
  `e.world.update(); e.camera.update()` a few times, then render once
  (`e.renderer.render()`, which runs `Realism.update`: the exposure snaps
  to its target after a camera jump of more than 3 m, and
  `e.renderer.realism.settle()` also draws a pending room probe). After
  posing a camera for a still outside harness.js, call
  `e.world.vegetation?.update(0.016)` before rendering, or the grass is
  culled for the old view.
- A hidden pane has no requestAnimationFrame: Publish stalls at "Checking
  for holes" and the preloader at 80% until the tab is fronted
  (`tabs_select` + a screenshot); `editor.enter()` does nothing while
  hidden. When fronting isn't possible (an agent's background tab, the
  user away), drive the frames: `drive.js` (this folder, through the sink)
  queues the app's requestAnimationFrame callbacks and runs them as fast as
  they come (`__driveOn()`, `await __drive(30000, () => done)`,
  `__driveOff()`) — a Ladonia publish took ~8 min driven, 2.5× faster than
  a hidden pane's throttled timers. Never time frames in a hidden,
  throttled or driven pane. A tab whose pane was never shown has a
  window of 0 × 0 and a canvas of 2 × 2: measurements run, and every
  frame saved is a blur. Before taking frames give it a size
  (`resize_window` to 1280 × 800, then
  `window.dispatchEvent(new Event("resize"))` and a few driven frames),
  and clear it (`preset: "desktop"`) when done.
- **Sign-ins.** The pane keeps sign-ins. For a site that needs the user's
  account (Mixamo's Adobe login): open it, ask the user to sign in there
  themselves, and wait. Never type into or click in a sign-in form, never
  create an account, and never sign out. Whatever else the site asks —
  terms, a consent banner, an upgrade — is the user's to answer (decline
  non-essential cookies). Then work in their session, on what they asked
  for only.
- **Click by script.** A click by coordinate lands on the wrong element in
  a `resize_window`-emulated viewport (on Mixamo it selected the wrong
  character). Find the element by its text and call `element.click()`.
  Set a React `<select>` through `HTMLSelectElement.prototype`'s own
  `value` setter, then dispatch a bubbling `change`. Read back what is
  now selected before the next step.
- **Downloads.** Ask before downloading: state the source, how many files
  and their sizes once, and wait for a yes. The pane saves no downloads.
  Where a site's export ends in a link, catch the link in the page (wrap
  its `fetch` and `XMLHttpRequest`), return it from `javascript_tool`, and
  fetch it with `curl` into the project. The page of an https site could
  not reach the sink on 127.0.0.1 at all (mixamo.com, 2026-10-06): paste
  a helper's text into `javascript_tool` instead of fetching it, and
  bring each link back as the tool's result, to a file that a background
  watcher curls.
- **Mixamo** (as driven on 2026-10-06; `mixamo.js` in this folder does
  it, and its header says which of its parts ran that day):
  - Each export ends in a presigned S3 link that lives 300 s, in the JSON
    of `GET /api/v1/characters/<id>/monitor`: `{ status: "completed",
    job_result: "https://…" }`. Write each at once to
    `<links-dir>/<kind>__<name>.url` (kind `characters` or `animations`;
    the folder in the scratch folder, since a link is the whole of the
    authorisation). `mixamo-fetch.sh <links-dir> <repo>/assets/people`,
    run in the background, curls each within two seconds into
    `assets/people/<kind>/<name>.fbx` and logs it in `fetch.log`.
  - A character: its tile, "Use this character", Download with the
    dialog's selects at Format `fbx7_2019` (FBX Binary) and Pose
    `t-pose`; named `<id>` (`remy`). Each is 28–59 MB.
  - A clip: search, click its tile, wait until the page reads "<clip> on
    <character>", then Download with Format `fbx7_2019`, Skin `false`
    (Without Skin), Frames per Second `30`, Keyframe Reduction `0`; named
    as the app is to call it (`Sitting Talking`). Each is 0.3–3.8 MB. It
    exports on the skeleton of the character selected at the time. A
    tile's text is its name and its description run together: pick by
    the whole text, since names repeat (three "Drinking"s).
- Don't `SendMessage` a subagent that is still working: the message can
  resume a second copy of it from its transcript, and the two then edit the
  same files and drive the same tab (2026-10-05: a duplicate publish, a
  reload mid-publish and a bake neither copy remembered starting).
- The walkthrough waits on its name prompt: fill `#name-input`, click
  `#name-input-button`, then an avatar; wait for `body.walkthrough-active`.
  For stills alone, hide `.preloader`.
- three isn't on `window`: take constructors from live objects
  (`camera.position.constructor`) or import `/assets/three-<hash>.js`.
- Stub every non-GET fetch before driving the editor in a test tab
  (harness.js does; ad-hoc scripts don't): one unstubbed test autosaved a
  coffee table into the user's scene.
- Expected noise: a 404 for an unpublished space's manifest, and
  ERR_CONNECTION_REFUSED from the multiplayer socket. Find real failures
  with `performance.getEntriesByType("resource").filter(e => e.responseStatus >= 400)`.
  Missing catalogue pieces mean `dist/` is stale: `npm run build`.

## In-page audits beyond walk.js

- **Door swing.** `walk.js` walks doors forced open; to check what a leaf
  sweeps, step each hinged door open in t = 0.1 … 1:
  `d.target = t; d.open = t - 0.01; d.update(0.01 / d.speed);
  d.group.updateMatrixWorld(true)` (open and target must differ by more
  than 0.001 or `isMoving` is false, and updating only the leaf's matrix
  leaves the hinge stale — the audit then passes falsely). Sample a 9 × 7
  grid on both leaf faces against the oriented boxes of furniture, stairs,
  rails and other walls, and a 0.8 m-deep passage box each side of the
  opening. Confirm box hits with rays along the leaf (0.08, 0.5, 1.0, 1.5,
  1.88 m up) before acting: cupboard hits were bounding-box artefacts.
  t = 1 is the leaf fully open at 93.6° (Doors, above).
- **Placement.** Over `sceneBuilder`'s furniture, walls and `spec.rooms`:
  sample points of each piece inside wall/trim oriented boxes (poking into
  walls); pieces whose base is > 3 cm above their room's floor (only
  pictures, mirrors, TVs should be); pieces in no room polygon; pieces
  meant against a wall (beds, nightstands, wardrobes, desks, vanities)
  whose back is 0.05–0.8 m off the nearest wall face.
- **What is that patch?** Cast a ray through the pixel from the same camera
  and read `hit.object.name`; re-render with the lightmap off to tell
  geometry from bake; recolour suspects one at a time; count pixels over a
  threshold rather than judging by eye. Render the same pose on the
  previous published version before blaming your change — an old fault is
  a separate task, not a fix in passing.

## Shell and tools on this Mac

- No `timeout`; foreground `sleep` is blocked. Wait with
  `until grep -qE 'Baked in|Traceback' log; do sleep 2; done` in a
  background command, or Monitor. A `pgrep -f` waiter matches itself.
  Long Blender jobs: `run_in_background` (foreground is cut at 600 s).
- sharp from scratch scripts:
  `createRequire("<repo>/")("sharp")`; it applies `extract` before
  `composite`, so composite into a buffer and crop in a second pass. Don't
  name scratch files after stdlib modules (`bisect.py`).
- Scripted edits: assert each anchor occurs exactly once; never use broad
  regexes. Import the generator with node before seeding to catch module
  errors.

## Git

- Commit, open PRs and merge only when asked. Stage only the feature's
  files when other work is uncommitted; never stage the temporary
  `house-test` entry in `.claude/launch.json`. Leave the user's own scene
  edits out of commits unless asked, and say they are uncommitted. `gh` is
  installed and logged in. When a PR has merged, `git fetch`, confirm its
  commit is on main, and branch fresh from main for the next; delete a
  branch (locally and on origin) only when the user says so. If a PR merged
  before a late push, open a new one. Check a split of commits builds on
  its own in a scratch `git worktree`.

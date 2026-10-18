# People round a space: what the app does with them

Animated people set round a property (Ladonia, 2026-10-05/09): standing
groups with drinks, people on sofas and chairs, people lying on pool
loungers — the spec's `people`, drawn by
`frontend/Experience/World/People.js`. The method is this folder's
`SKILL.md`; every field, constant and script is in `people-data.md`,
`planner.md` and `people-runtime.md`. Read People.js's
class comment and `shared/people.js`'s header before touching either. The
visitor's own clips are `avatar-clips.md`; what is still short is at the
end of the list below.

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
- **Cap and cull.** `QUALITY.people` by slider step (`people-runtime.md`): at
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
    everyone (the rule: `SKILL.md`, Pitfalls; the publish side:
    `../publish-and-bake/SKILL.md`).
- **The validator** keeps `people` (`people-data.md`, The validator). A server started
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
  of it; the rules are `SKILL.md`, People's cost and the phone rules). At step 4 (2048 × 1536) nine in
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
    `people-audit.js` (`../app-testing-and-performance/people-audit.js`) on
    the scene as they left it (2026-10-10) flags
    six: the heels and the pillow above, and
    - brian (person-9): his left upper arm 1.8 cm in a roof planter's
      grass. He stands 0.72 m from the planter's box, which `GRASSES`
      (0.25 m out) and `MARGIN` allow: Ladonia's grasses reach further.
      At the checker's spot, `[11.14, 5.4, -20.04]`, the roof group
      audits clean (tried with `patch`; not written);
    - kate (person-3), "Laying Hands Behind Head": the right hand under
      her head 3–5 cm into the cushion as she breathes in.

## Where the rest of the app touches them

- **A public view's rigs** (`passOver`): the group held still, and a rig not
  animated this frame passed over. Its bones' world matrices are then the
  last render's: a tool that steps `world.update` without rendering
  (act.js, a timing loop) reads them stale until that person's next turn —
  render once before measuring a figure
  (`../app-testing-and-performance/speed-architecture.md`, What runs every
  frame).
- **Edit mode at rest** holds the people's clips still (they play while one
  of them is selected; a heartbeat's frame moves none of them:
  `People.tick(delta, hold)`, `delta` 0), and the view scope's Exterior
  leaves indoor people undrawn but colliding:
  `../walkthrough-editor/SKILL.md` (when the editor draws, plain light and
  view scope). The editor's `PersonEditable` and the editor at large are
  walkthrough-editor's; the people's part of it is above.
- **The collision tree** `collision.people` (rays pass it, the camera's boom
  goes through people): `../walkthrough-editor/SKILL.md` (rays and the
  collision trees).
- **Publishing**: people travel only in the published `spec.json`, so after
  a change publish again (no bake needed); `leaveOut` and `sceneryKnown`
  keep remembered options from dropping everyone:
  `../publish-and-bake/SKILL.md`.
- **Light in a baked view**: ProbeLight lights people, and roof terraces
  have no probes (above, Light and Still short):
  `../baked-view-lighting/SKILL.md`.
- **The validator** keeps `people` only because it is told to: a new spec
  field and the seeding rules are `../walkthrough-editor/spec-and-validator.md`;
  a reseed drops the people (`SKILL.md` step 10,
  `../build-property-space/scene-safety.md`).

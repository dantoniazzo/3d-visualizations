# Swimming and the pool's steps (`World/Player/Swim.js`, `player.swimmer`)

The app side of swimming. The steps' layout, the ramp and the depths as
data: Pools as data, below; the water as drawn: `pool-water.md`.

Since wave B of 2026-10-16. The steps are `landscape.pools[i].steps`
(Pools as data, below; `../build-property-space/landscape.md`, pools);
Ladonia's generator gives B's pool five.

- **Depths**, from the water's level to the feet: deeper than 0.3 m,
  wading, slower the deeper; deeper than 1.2 m, afloat; afloat, a floor
  less than 1.05 m under the surface is stood on (the steps; the gap stops
  a flicker) — or less than 1.18 m where the figure's feet have come onto
  a tread (`STAND_MOST`, keel below). Afloat the capsule's line shrinks to
  0.3 m under the head and a damped spring (k 30, c 9) holds the head at
  the level + 0.12 m. Swims at `SPEED` 0.85 m/s, `FAST` 1.8 times that
  with Shift (eased by `GLIDE` 4: measured 0.82 and 1.5 m/s). The figure bobs
  only as drawn, so treading water is at rest for Pace.
  - **Where the water comes on the figure, from one clip into another,
    the floor** (`postureOf`, the lean, `floatOf`, `blend`, `liftFeet`,
    `unliftLegs`, since 2026-10-17): how the swimming clips are fitted to
    the avatars and the water, `../space-people/avatar-clips.md`. In
    short: the figure keeps the lean that keeps what it wears under and
    its eyes out, its knees keep each foot 3 cm (`KEEL_CLEAR`) over the
    floor or a tread (the lowest shoe skin 1.3–2.8 cm over the floor), and
    `Player.update` is 0.3 ms swimming or treading (0.2 walking). The
    `blend` change to `Avatar.animation.play` affects every clip change,
    not only swimming.
  - **The walls** (`clear`): all of the figure inside the pool's box, 4 cm
    clear, by its reach turned the way it faces (no rays: a pool is its
    box); pushed off a wall it has turned into at 1.5 m/s; swimming, the
    way into a wall is stopped where the stroke — or treading water,
    whichever reaches further, so that stopping does not push it back — would
    meet it, and it treads water there (`blocked`, `clip`): once the keys
    push it within 37° of straight into the wall (`BLOCK_STOP` 0.8) with the
    wall within 1 cm of where the stroke meets it; kept while the push is
    within 66° (0.4), the wall within 10 cm, and for 0.5 s at least unless
    it turns away (since the second clips pass: by the body's speed, a
    frame's push against the wall, it flipped 1–6 times as it came to rest,
    each flip a pop). 0 flips in 66 runs into the three walls. The climb is
    offered where the figure, not the capsule, is within 0.3 m of the edge
    (`offer`). Measured: swimming into each wall and along one, treading
    and turning there, both skins: the skin never past a wall's face (≤
    −3.3 cm); stopped facing a wall the head is 0.78–0.81 m from it
    (treading's legs reach that far).
  - **The steps** (`keel`): the keel's cells against the steps' treads as
    drawn (`poolSteps`: not the ramp), a tread's edge felt as a 1.5 slope.
    Swimming up the steps the figure is lifted as its feet come onto a
    tread (0.3 m at most) — eased up at 8/s (`RAISE_RATE`, since the third
    clips pass; the knees take the feet over a tread meanwhile): lifted at
    once, it rose 0.23 m in a frame where treading water's legs, laid back,
    came over the steps' corner (along the east wall at 45–60°); now ≤ 2.8
    cm a frame, the head ≤ 6.2 cm — and stands where the floor under its head is less
    than 1.18 m deep (stood at z 40.96–41.15, no contact with a tread);
    otherwise — stopped before the steps, treading's legs over them — it is
    pushed back off them at 3 m/s (the legs swing out faster than that,
    and the knees take a foot over a tread up off it: the floor, above).
    Never lifted off the floor (`postureOf`).
  - **Which stroke**: the frog kick at swimming pace (its 2.27 s kick is
    a 1.9 m glide at 0.85 m/s), the breaststroke with Shift played 1.35
    times as fast (1.0 s a stroke, 1.5 m at 1.5 m/s); where a figure has
    only one, that one.
- **No diving**: afloat, Space does not jump and E does nothing; a jump in
  plunges the head to about −0.8 m and floats back in about a second.
  Under the surface Camera sets `body.underwater` (a CSS tint,
  `canvas.scss`) and tells "underwater"; the water is two-sided in one
  pass (`gl_FrontFacing`), so nothing compiles.
- **Climbing out**: Space, or *Climb out* (touch: the pool icon), where a
  landing 0.55 m past the nearest edge, on a floor 0–0.6 m over the water,
  has room for the whole capsule — tried ±0.35 and ±0.7 m along the edge
  too (cached). It tells "interact" `pool:<id>:<side>` climbing, then out.
  B's west side, lined with occupied loungers, offers it only near its
  ends. By the clip (`climbPlan`, `updateClimbByClip`; since 2026-10-17):
  the figure's root is put where the clip's hands (the wrists' middle at
  its start, `Avatar.bonesAt`) are 3 cm over the coping's top (a ray just
  beyond the water's edge, straight in from the landing), facing out. It
  swims there first (`toEdge`, since the second clips pass: the stroke
  playing, straight out at the edge, until the stroke meets the wall or
  2 s), then comes on to the clip's start (`beginClimb`) in as long as
  keeps its head to swimming pace (1.5 × the head's way / (0.8 × 0.85
  m/s), 0.3 s at least: 1.1–1.5 s), the stroke or treading water fading
  into the clip (held at its start) over the first 70%, the figure up to
  the clip's height over that and on to the edge from 20% (so the hands
  come up out of the water before they come over the coping: they cross
  the wall's face 1.9 cm over it, where coming on at once put them 8 cm
  into its edge). Since the third clips pass the lean follows the climb's
  weight (`weightOf("climbing")`): the climb fit's lean and pivot (below)
  as much as the climb makes of the pose, the way it floated as much as
  the clips it floats by still do — leant at once as the climb began, its
  hips turned 19° and its head rose 0.25–0.46 m in that one frame, the
  chest out of the water; now 1–2.2 cm, ≤ 2° (measured from the frame
  before Space: earlier measures began after it). Its eyes are kept as
  far out of the water as they were as it began (5 cm at most: `eyesOf`,
  the eyes' meshes, `climb.eyes`), less from 70% of the reach on as the
  clip's own start comes (its eyes 2.8–3 cm out there) — a pose half the
  one and half the other went 5–7 cm under; and its feet are kept off the
  pool's floor by the knees (`liftFeet`) until the climb has them out
  (dropped at once as it began, they went 0.2 m into it). Before,
  it glided 0.7–1.05 m at up to 2.4 m/s with the clip frozen; now its head
  at most 1.2–1.5 m/s, between the two swimming paces. The clip plays
  through (2.7 s at its pace) from there; the capsule, and the camera, go
  up from the water to standing on the landing as far as the clip's hips
  have come up from their start to their end, and over as far as they
  have come forward, never back; at its end (crouched on the coping) idle
  fades in over 0.7 s, the root going, linearly, to the capsule's by
  idle's own share of the pose (`weightOf`; by its own clock a frame
  apart, the last frame jumped 8 cm), and the soles kept 1 cm over what is
  under them — the coping or the paving, a ray down at the lowest foot,
  eased — until the last of the fade (half crouched and half stood, they
  went 17–18 cm into the paving): ≤ 1.2 cm under now. The capsule ends on
  the paving as walking stands (not 2 cm over it). Without the clip, a 1.1 s lift playing the
  jump. **Fitted to the edge** (`climbFitOf`, since the clips-fix pass:
  as made and fitted, the clip's hands came 7–17 cm up off the coping as
  it pulls up and its shoes stood 0.20–0.26 m into the wall): 41 looks
  through it (`Avatar.bonesAlong`) give, at each, how far the figure is
  let down — its hands onto the coping while they are over it, none of
  their bones over the stone under 1.5 cm over it (the start's curled
  fingers were in it), its toes, ankles and knees no lower than 3, 7, 7 cm
  over it once up on it — and how far it is leant forward about its hands
  (0–30°: Swim.pose turns the node about the wrists' middle) for its legs
  under the coping to keep 4–8 cm (by bone) behind the wall's face; each
  eased over its neighbours. Measured, east edge, both skins, both views:
  the hands' lowest bone over the coping 1.7–3.6 cm (median) through the
  pull, the skin in the stone at most 4–4.7 cm (a palm pressing), the
  shoes ≤ 3 cm past the wall's face (skin, not bones). Others' pages lean
  it the same way (`layOther`). Pace: busy "climbing" all through,
  swimming to the edge too (the reach and the stand at the end move the
  figure, not the body).
- **Camera**: in third person it turns round a point 0.45 m over the head
  (above the loungers; the boom passes through people, as rays never meet
  them). Behind a head above the water it is kept 8 cm over the water:
  the pointer-lock camera by `keepDry`, moved after it is placed (it
  places itself from its angles every frame); the orbit (touch) by
  `dryOrbit`, which limits how far down OrbitControls lets it swing
  (`maxPolarAngle`, the mode's own `orbitLowest` elsewhere). Moved after
  OrbitControls, as it first was, the orbit took the lifted camera as a
  shorter boom — it works its radius out from where the camera is — and a
  drag down over the pool pulled it in from 2.8 to 1.8 m in 40 frames,
  and left it there after the swim (fix of the integration).
- **Others** see a swimmer by the clip's name ("swimming", "breaststroke",
  "treading", "climbing"): their page fits the clips to that figure on
  first sight (`Avatar.wear`; the stand-in till then), plays it where it is
  sent (their page placed it), laid back as their own is (`swimmer.layOther`,
  by the same weighed postures, for the pool it is in), the nametag 0.45 m
  over the water (`waterOn`) — a
  climber's 1.1 m over its hips as they come up; a remote figure treading
  is at rest (`AT_REST`). Played by the receiving page's own frames, every
  frame (`Player.updateOtherPlayers`), faded at the sender's rates where
  those are not Avatar.js's 0.2 s (since the third clips pass; all by the
  clip's name alone): the breaststroke — swum only fast where the figure
  has the frog kick too — played at 1.35 (`strideOf`: at 1, the mixer's
  fades ran at 0.083 a frame where the sender's ran 0.113); into the climb
  over 70% of its reach, worked out for the nearest side (`fadeOther`; the
  sender's landing may be up to 0.7 m along the edge, and its reach is
  longer where it swam on to the edge first), held at its start meanwhile
  (`holdOther`), idle after it over 0.7 s; the climb's lean by the climb's
  weight, as the sender's. Only the place is sent with the clip's name
  (`server/sockets/presence.js`), and the messages fall between the frames
  — bunched, in a hidden tab — so the height a remote swimmer floats at
  (sent) and how far its strokes have played (its own) can disagree when
  the strokes change every few frames: its waterline is approximate then.
  Measured (fourth pass) with a same-skin figure fed the visitor's root,
  turn and clip, strokes switched every 3–6 frames (both "stroke" and a mix
  with treading water), against the visitor's own: fed every frame, its
  eyes ≥ 2.9 cm out and its bones 0.6 cm off on average (with the
  breaststroke at 1: −0.11 to −0.48 m, 84–294 frames under); at 50 messages
  a second, eyes down to −0.13 to −0.24 m (34–67 of 360 frames under;
  at 1: −0.24 to −0.42 m, 90–347 under); at 15 a second, or with no
  message for 6–12 frames now and then, down to −0.2 to −0.68 m either way
  (fewer frames under at 1.35). Its bones move about as far in a frame as
  the sender's (0.16–0.2 m at 50 a second, the sender's 0.16–0.17;
  0.21–0.38 m with bunched delivery, as at 1) and never stand still a frame.
  The climb, fed every frame: its bones 0.48 m off on average and 1.29 at
  most (Avatar.js's fade, no hold: 0.81 and 1.61), the eyes never under.
  Through the server, two public views of this page (strokes switched every
  3–6 frames, the hidden pane delivering about 15 messages a second): the
  sender's eyes ≥ 2.9 cm out, the remote's down to −0.56 m, 452 of 1081
  frames under; switched every 20–60 frames, 11 frames under, the deepest
  (−0.45 m) on first sight, before its clips were fitted — but the fourth
  pass's verifier, its receiving tab stalling 0.3–2.7 s, saw −0.46 to
  −0.49 m at ordinary changes too (22 and 71 of ~1140 frames, stretches
  up to 37): the root arrives at the new stroke's depth while the blend is
  still the old stroke's. The third clips
  pass sent the figure's clock with it and played the remote by that:
  still between messages, it moved double the next frame (bones 0.32–0.42
  m), and after any hold-up its eyes went 0.46–0.56 m under all the same —
  taken out in the fourth, the server back as it was (no restart needed).
  Measured so with `others.js` (in `../app-testing-and-performance/`:
  `__others.mirror`, an
  in-page figure fed the visitor's root, turn and clip at a rate or with
  gaps; `send` / `recv`, two real pages) and `net.py`, which matches the
  two pages' rows by the sender's exact root.
- **The clips**: the visitor's own clips (`../space-people/avatar-clips.md`).
  Without them the
  visitor wades: Walking and Idle with the body sunk to the shoulders.
- **The steps' ramp** is invisible, in the landscape's group, so the
  static tree and a publish's collision take it with no change to
  SceneBuilder; a down ray at (15.6, 1, 41.4) meets "Pool steps" at about
  −0.93. Walking north from the coping: wading at z 41.9 (pace 1 → 0.5),
  afloat at z 40.8; back, standing at 41.15 and out onto the coping at
  0.07. `../build-property-space/checks/zfight-check.mjs` mirrors them
  through `poolSteps`.
- **The user's own scene**: a scene seeded before the steps has none.
  Never reseed it for them (`npm run seed` throws away every edit): give
  its pool its `steps` alone —
  `node .claude/skills/visitor-interactions/patch-pool-steps.mjs
  scenes/kosinozici-villas.json [--dry-run]` (this
  folder): it changes `landscape.pools[<--pool b-pool>].steps` and nothing
  else, copies the file first (`--backup <dir>`, else `backups/` beside
  the tool — in the repo and not git-ignored, so give it the session's
  `snapshots/scene-backups/`: `../build-property-space/scene-safety.md`,
  §0), refuses a file not as the server writes it or changed on disk
  while it runs, and reads the result back. Reload or close any editor
  tab on that scene first: its next save would write the old pool back.
  The user's own file was patched so on 2026-10-17 (the record, its md5
  and its backup's path: `history.md`). They have edited the scene since:
  never restore that backup over it. The pattern this tool follows (the
  four checks before writing the user's file, a backup first, a dry run):
  `../build-property-space/scene-safety.md` (§0).
- **Seen from the deck** the steps show through the water, which has been
  clear since wave C (`pool-water.md`).
- **Measured**: Player.update while swimming 0.20–0.21 ms, treading at the
  edge 0.21–0.23 (0.35–0.40 before the climb-out offer was cached); the
  public view's frame at the pool the same as the build before within
  noise. After the clips-fix pass: 0.2 ms (median; the timer resolves 0.1)
  swimming, treading and through a change of clip.
- **Testing**: `node scripts/test-capsule-through.mjs`
  (`../walkthrough-editor/rays-and-collision.md`). In a page, after boot.js
  and act.js, the tools every swimming verifier used, in
  `../app-testing-and-performance/` since 2026-10-17 (their poses
  are B's pool's):
  - `pool.js`: `__pool.pool(i)`, `at(u, v, y, i)`, `stand(feet, yaw)`,
    `step(n)`, `hold(actions, frames)`, `space(frames)`, `look(h, v)`,
    `st()` (the water state, the capsule, the clip asked and played, the
    figure's root, the prompt, the camera, whether it is under water),
    `shot`, `run(list)`;
  - `pool-look.js`: the water from fixed poses (deck, along, above, low,
    steps, bird), `sheet`, `swimSheet`, `hide`, `time`;
  - `clips.js` (after sit.js too): `__clips.figure()` (the clothes' top,
    mouth, eyes and crown over the water), `range`, `steady`,
    `probe(name, pitch, lift)`, `sitTrace(id)`, `ready()`,
    `skin("male" | "female")`;
  - `swim-trace.js`: `__trace.trace(frames, { label })` — per frame the
    clip, bone pops in the root's frame, the facing afloat, the waterline,
    and every bone a straight line from the hips crosses a collision face
    to reach; `swim-checks.js` the passes' measures built on it.
  Both skins, both views, every time
  (`../app-testing-and-performance/browser-pane.md`).

## Pools as data: the water's look, the steps, the depths

`landscape.pools[i]` as the builders and Swim read it, continued from the
pools bullet of `../build-property-space/landscape.md` (the basin at y
0.02, the water at `level`, the floor at `level − depth`, the coping and
deck, the box cut out of the terrain — and its summary of `steps`). How
each works in the app: `pool-water.md` and above. The depths, the
keel and `liftFeet` below are also what the swimming clips are fitted to
(`../space-people/avatar-clips.md`).

**pools** (continued)
- The water is clear, with no transmission (since wave C of 2026-10-16;
  what it was before: `history.md`). Two passes over the one
  quad: a depth pass that multiplies what is under it by a turquoise that
  deepens with the path through the water (worked out against the pool's
  box and its steps, no depth buffer read), with drifting caustics by
  day; and a surface whose alpha is its Fresnel reflectance, the sky
  mirrored on it and the water body's glow added. Its roughness is 0.12:
  at 0.1 or under, reflections.js gives it the studio to mirror instead
  of the sky. `pool-water.md`.
- From under it (a swimmer's camera) it is drawn as the surface seen from
  below, in one pass (`gl_FrontFacing`), with nothing compiled for it.
- `steps` (since 2026-10-16): straight steps the pool's full width, coming
  down from that side of `box`.
  - `count` treads, each `going` deep, rising evenly from the floor to the
    coping's top at 0.07.
  - `side` is one of `x0`, `x1`, `z0`, `z1` (anything else becomes `z1`).
    `going` is held to 0.2–0.6 m (0.35 by default). `count` is rounded and
    held to 1–12, and to no more than leaves half the pool's length to swim
    in (`floor(length × 0.5 / going)`). The rise is
    `(0.07 − floor) / (count + 1)`: the last step up is onto the coping.
  - Each tread is of the pool's mosaic with a flush 5 cm nosing of the
    coping's stone (`NOSING`, `NOSING_DEPTH`).
  - Treads and nosings are `decor`: drawn, published and baked, never
    collided with. The steps are walked on an invisible ramp,
    "pool-steps-ramp" (label "Pool steps"), in the landscape's group: in
    the static tree, the published collision and the colliders view (as
    stairs), as a flight's ramp is. Keep it there, in a static collision
    root: anywhere else, neither the building's tree nor a publish's
    collision has it.
  - The ramp (`poolSteps(pool).ramp`: `from` −(count + 1) · going, `to`
    going / 2, along `out` from the edge; `low` floor − rise / 2, `high`
    0.07) is a slab 0.3 m thick, the pool's full width. Its top runs from
    the coping's top half a going back from the edge, down through the
    middle of every tread, to half a rise under the floor a going past the
    foot: it is met as a slope, never as a lip (the capsule cannot step up
    a riser). Ladonia: a ray profile along it reads −1.37 → −0.20, then the
    coping at 0.07; a down ray at (15.6, 1, 41.4) meets it at −0.93.
  - The layout is `shared/landscape.js`'s `poolSteps(pool)`, which the
    builder (`LandscapeBuilder.addPoolSteps`) and
    `../build-property-space/checks/zfight-check.mjs` both read.
  - Ladonia's B pool: `{ side: "z1", count: 5, going: 0.35 }`, rises of
    0.255 m, where four treads would rise 0.31 m.
- Swimming in a pool (`World/Player/Swim.js`), from the water's level to
  the feet:
  - deeper than 0.3 m, wading, slower the deeper;
  - deeper than 1.2 m, afloat;
  - afloat, a floor less than 1.05 m under the surface is stood on again
    (the steps): the gap between the two stops a flicker — or less than
    1.18 m, where the figure's feet have come onto a tread;
  - the figure is kept in the pool's box (its reach, not only the
    capsule's) and off its treads. A pool shallower than about 1.6 m has
    its swimmers' feet at its floor at the bottom of a kick (Ladonia's
    1.4 m does). The figure keeps the lean that keeps what it wears under,
    and its knees bend to keep each foot 3 cm (`KEEL_CLEAR`) over the
    floor or a tread under it, lifted 0.4 m at most (`liftFeet`,
    `FEET_LIFT_MOST`): the shoes' skin 1.3–2.8 cm over Ladonia's floor. No
    lean keeps both (`../space-people/avatar-clips.md`, Swimming: the
    floor; Depths, above).

## Elsewhere

- The visitor's own clips (download, `AVATAR_AS`, the stroke cut to a loop
  and swum heads-up, the climb keeping its travel, packing, loading, the
  stand-ins): `../space-people/avatar-clips.md`. The climb's fit to the
  edge and the lean following `weightOf("climbing")`, and others' swimmers
  (`strideOf`, `fadeOther`, `holdOther`), as clip work:
  `../space-people/SKILL.md` (Fitting clips to the visitor's avatars:
  cross-fades, the mixer, pose last, skin, both avatars, clean
  baselines).
- The pool's basin, coping and deck, and the `steps` field's summary:
  `../build-property-space/landscape.md` (§5); a seeded scene given its
  steps by `patch-pool-steps.mjs` (SKILL.md, Tools), never by a reseed.
- Limiting OrbitControls instead of moving the camera after it
  (`Camera.dryOrbit`, `maxPolarAngle`): `../walkthrough-editor/SKILL.md`,
  Pitfalls.
- `test-capsule-through.mjs` and the capsule pushed up through a ceiling:
  `../walkthrough-editor/rays-and-collision.md`.
- Both skins and Before a first sit or swim (`player.avatar.wear`,
  `seats.dress`, `seats.catalogue`): `../app-testing-and-performance/browser-pane.md`;
  the verifier of what moves the visitor's figure (pool, swim-checks,
  others, net.py): `../app-testing-and-performance/lane-briefs.md` (p).

# The visitor's own clips: made, bound by name, fitted to the avatars

The visitor's figure — the app's two avatars, `avatar_male.glb` and
`avatar_female.glb` — plays Mixamo clips of its own for swimming, treading
water, climbing out, sitting down and getting up, and the people's Sitting
Idle fitted to it. This file is how those clips are made, bound and fitted
to the avatars and to the water. How sitting and swimming use them (the
seats, the plans, the walls, the steps, the camera, others' figures) is
visitor-interactions': `../visitor-interactions/sitting-and-tv.md` and
`../visitor-interactions/swimming.md` (the pool's depths, `KEEL_CLEAR` and
the steps' data: its Pools as data). Both play
these clips, and fall back to the stand-ins without them. The test-tab
handle `P.avatar` is `visitor-clips.md`; `P.swimmer`'s clip and fade parts
and the `P.seated` / `P.rising` plans are
`../visitor-interactions/page-handles.md`. The download is `mixamo.md`, the
npm script `people-data.md`; the lessons that cost most are `SKILL.md`,
Fitting clips to the visitor's avatars.

## Made: the six clips and what the pipeline does to each

- **The visitor's own clips** (`npm run people -- --avatar-clips`; wave B
  of 2026-10-16, downloaded and made the same night): six Mixamo clips in
  `assets/people/avatar/` (FBX Binary, *Without Skin*, 30 fps, *In Place*
  on a loop alone — of the six only Swimming Underwater offers the box;
  `mixamo.md`), named after what they are played as
  (`AVATAR_AS` in `blender/import_people.py`, `VISITOR_CLIPS` in
  `Player/Avatar.js`, the first pattern that matches):
  - "Swimming" ("Swimming Underwater", In Place: a frog kick, the body
    along the water, its own 4.5 s loop) → `swimming`;
  - "Breaststroke" ("Swimming To Edge": no In Place — one stroke, then a
    reach for the edge and a hold, the hips travelling 0.93 m) →
    `breaststroke`;
  - "Treading Water" ("Floating", in place, 3 s loop) → `treading`;
  - "Climbing" ("Pulling Up To A Ledge": from a hang at arms' length up
    onto the ledge, crouched; the hips travel 0.54 m and rise 1.29 m) →
    `climbing`;
  - "Stand To Sit" and "Sit To Stand" (2.2 and 2.3 s; sat down 0.47 m
    behind where it stood, stood up 0.46 m before the seat) → `sit-down`,
    `stand-up`.
  Mixamo has no front crawl. `import_people.py --avatar-clips` puts them on
  one skeleton (`import_clips(people=False)`: none settled or turned as a
  person's pose — the people's `settle` cut "Stand To Sit", a "sit" clip by
  its name, to half a second of sitting — and each skeleton sized at rest)
  and handles each by what it is played as:
  - **loop** (the strokes, treading): `find_loop` takes the stroke part —
    before a hand comes up 0.15 m (`REACH_UP`) higher than over its first
    0.8 s, onto the edge — and in it the pair of frames at least 0.8 s
    apart whose pose, and next pose, come nearest (`pose_gaps`: the RMS
    over every bone of the angle between their turns), or within 1° of
    that and further apart; `close_loop` keys those frames with each
    bone's difference at the end spread over the loop and the hips'
    travel (its straight-line trend, across the floor and up or down)
    taken out — held where the app swims it. The breaststroke: frames
    1–42 of its stroke's 1–45, 0.44 m of travel out (it swam 0.32 m/s as
    made), its pose back only to 13° (its legs kick in turn; no frame
    repeats closer), made up over the loop — the step across the seam is
    3.0° against 2.3–2.9° either side. Mixamo's own loops come back at 0°
    and are kept whole.
  - The strokes (`STROKES`) are swum heads-up (`head_up`): turned 35°
    (`STROKE_PITCH`) about the head at the loop's start, the legs down,
    and the neck and the head lifted 45° (`STROKE_LIFT`) between them.
    Mixamo's strokes swim face down along the water with the back of the
    neck the highest of the figure: with the hoodie under, the face was
    too. 60° of lift had the head looking at the sky.
  - **climb**: begun where its head is no more than 0.15 m (`CLIMB_HEAD`)
    under its hands (frame 24 of 116: the hang put the head 0.25 m under a
    pool's water); its travel kept; `grip` (its hands at its start) listed.
  - **move** (sit-down, stand-up): as they are, travel kept.
  `optimize-people.mjs` packs `public/models/people/avatar-clips.glb` (230
  KB, 91 sent) and `avatar-clips.json` (`{ name, as, duration, frames,
  head, pelvis, last, travel, loop?, stripped?, pace?, seam?, grip? }`),
  git-ignored as the people's are; a plain `npm run people` builds them
  too whenever the files are there; the run takes 3 s. The page loads them
  the first time a figure needs one (`Avatar.wear`: the visitor's own over
  a pool or aiming at a seat, another visitor's as theirs is first seen
  playing one) and fits them to either avatar (`Avatar.fit`, the male's
  armature corrected). `climbing`, `sit-down` and `stand-up` play once and
  hold their end (`ONCE`, with their pace: 1.15, 1.3, 1.45 — on every
  page). Without the file: one harmless 404, then the stand-ins
  (`STAND_INS`: the strokes as walking slowed to 0.65, treading as idle,
  climbing as jumping, sit-down as idle, stand-up as sitting), the walk
  onto a seat and off it (`Player.walkPlan`, `walkOffPlan`) and the old
  lift out of the pool.

## Bound by name (`Player/Avatar.js`)

- **The visitor's own figure** (`Player/Avatar.js`): clips are bound by
  name — Dancing → `dancing`, Idle → `idle`, Jump → `jumping`, Running →
  `running`, Walking → `walking`, any other its own name in lower case —
  where they were taken by index (and index 5, "waving", was missing).
  `animation.play(name)` of a clip the avatar does not have plays idle
  (before, the last clip went on), names sent over the network included
  (the actions are on a null-prototype object: `play("toString")` threw).
  `avatar.addClips([clips] | { name: clip })` adds fitted clips — sitting,
  swimming — played and sent by name. Getting into a car sets `idle`, so
  others see the figure standing where it got in, not frozen mid-stride.

## Sitting: the way it sits, the clip, fitted to the avatars

What a seat is, where the figure goes and which way it faces
(`poseFor`, `seatPose`, `seatingClear`), and sitting down and getting up,
are `../visitor-interactions/sitting-and-tv.md`; the seats come from
`seats.json` through `shared/people.js`'s `seatsOf`, as the people's do
(`people-data.md`).

- **How it sits** (`wayOf(seat, avatar)`, since wave B of 2026-10-16):
  - by default, Sitting Idle;
  - on an outdoor lounge chair (soft, out of doors, its `room` at least
    0.5 m — seats.json's, there only where a loose pillow lies on the
    seat, so a lounge chair without one is never sat back in —, a LOUNGE
    piece: the people's recline rule, `reclines`),
    "Sitting Reclined Male", on either avatar — the women's reclining clip
    is `shared/people.js`'s `LEFT_OUT`;
  - where the clip's seat over its soles is more than `LIFT_MOST` above the
    seat's height, the same clip with its knees opened (`Utils/fitClip.js`):
    - `legsAt` measures each knee, ankle and the foot's lowest skin point on
      a posed copy;
    - `kneeFor` picks the smallest turn either way that lifts that foot to
      4 mm over the floor — out for a hanging shin, further under for a
      tucked one, 50° at most;
    - `openKnees` turns the shin about the knee's axis in the thigh's frame
      and the foot back by as much, so the sole stays level.
  - Named "sitting", "sitting reclined", "sitting 40", "sitting reclined
    37" (the seat's height in cm), and cached by avatar file × way × that
    name. The way chosen becomes this figure's own "sitting" action
    (`Avatar.addClips`), which Player plays.
  - Ladonia, measured on the skin (soles over the floor / seat contact
    against the cushion's top), both skins: the lounge chair (0.371 m)
    0 / −5 mm, the outdoor sofa (0.40) −1 / −4 mm, the pouf (0.41) +3 / 0
    mm. They were 6–7, 3–4 and 2–3 cm under the floor before.
  - A first lounge chair 6.7 ms, a first 40 cm seat 2.8 ms, then 0–0.2.
- **The clip**: the people's index (`People.index()`, `file`) gives
  "Sitting Idle" from `clips.glb`, or "Sitting (stand-in)" from
  `clips.standin.glb`; loaded the first time a seat is aimed at or
  hovered from above; played here as `"sitting"` (`SITTING`), and sent by
  the way's own name (`pose.clip`: "sitting", "sitting reclined 37", …),
  which the other pages make for their copy of the figure (Others:
  `../visitor-interactions/sitting-and-tv.md`).
- **Fitted to the avatars** (`Utils/fitClip.js`: `canonical`, `rigOf`,
  `fitClip`, moved out of People.js, whose behaviour is unchanged): the
  `into` option carries the Hips keys into the frame of whatever the hips
  hang from. avatar_male.glb's Armature is turned +90° about x at scale
  0.01: fitted as People fits, he lay on his back with his hips under the
  floor (`node scripts/test-seats.mjs`); avatar_female.glb and the people
  need nothing. `Avatar.fit(name, clip, hips)` fits once per avatar file
  (0.4 ms; every visitor of a skin shares it); `Avatar.sitting(name)`
  measures, on a posed copy, the seat contact under the pelvis, the
  soles, the rearmost knee and the ankles, the head and the eye (3 ms,
  once a file); `Avatar.has(name)`; `animation.play(name, fade)`.

## Swimming: where the water comes on the figure, from one clip into another, the floor

In `World/Player/Swim.js` (`player.swimmer`). The depths (wading, afloat,
a floor stood on), the capsule's spring and the speeds are
`../visitor-interactions/swimming.md`; the wading and afloat depths,
`KEEL_CLEAR` and `liftFeet` as data, the same file's Pools as data.
The `blend` change to `Avatar.animation.play` below applies to every
change of clip, not only swimming.

- **Where the water comes on the figure** (`postureOf(avatar, name,
  deep)`, since 2026-10-17): measured once a clip, skin and pool depth on
  a copy, 12 times through the clip, at each lean of 0°–50° by 10° about
  the head (`setNode`, which turns and moves the "Armature" node no clip
  or facing code touches): the least the water may come to (the top of
  what it wears, 1.2 cm under at the top of a bob), the most (the eyes —
  their meshes; the male avatar has no eye bones — 5 cm out at the bottom
  of one), and how deep the feet go (the points weighted to the legs'
  and feet's bones). The least lean that has the first two at every look
  (what it wears to 2 mm) wins, else the one nearest; then, of that lean
  and the next, the least that also keeps the feet 3 cm off a floor
  `deep` under the water, if either does. The water stands as high as
  keeps the eyes out all through, higher at a look where the clothes
  would show by up to 2 cm more of the face. What it wears leaves out
  its skin, hair, eyes and teeth, anything weighted to the head and its
  arms' sleeves. And, so laid back: where its head is (`ahead`, the mean
  of the looks: the frog kick's came 0.6–0.7 m before the root as the
  clips were made, the breaststroke's 0.5–0.6, treading's 0.15–0.2 —
  Swim.pose puts the root that far back, so the head is under the
  capsule's head, where the camera is, and a turn swings the body round
  the head, not the head round a point behind it); how far it reaches
  each of 16 ways across the water (`reach`) and its deepest parts in
  12 cm cells (`keel`). About 20–30 ms a clip, worked out ahead, one at a
  time between frames, once the visitor is over a pool (`prepare`).
- Why the lean: Ready Player Me's hoodies stand up round the neck — the
  male's hood as high behind his head as his mouth — so no placement
  keeps both the face out and the hood under without it. The feet: as
  the clips are made the avatars' shoes go 1.45–1.57 m under the water —
  through Ladonia's 1.4 m floor at the bottom of a kick (the earlier
  reports measured the toe bones, which stop 10–15 cm short of the
  soles). No lean keeps both the hood under and the feet off that floor
  for treading water: laid back 50° the male's are off it, but he holds
  his hands up before his face and reads as floating (40° with the rest
  lifted showed the hood); so the clothes win, and in Ladonia every clip
  keeps the lean it had (male frog kick 10°, breaststroke 20°, treading
  30°; female 20°, 30°, 30°) — the feet went 0.14–0.24 m into the floor,
  nearly all the time treading water — and the knees bend instead (the
  floor, below). Measured steady (public view and editor
  alike; metres over the water, "clothes" off the arms): male treading
  eyes 0.04–0.07, clothes ≤ −0.015; frog kick eyes 0.06–0.11, ≤ −0.013;
  breaststroke eyes 0.05–0.09, ≤ −0.027. Female treading eyes 0.04–0.07,
  ≤ −0.015; frog kick 0.04–0.08, ≤ −0.014; breaststroke 0.03–0.05, ≤
  −0.012. The sleeves come over the water at the reach of a stroke.
- **From one clip into another** (`floatOf`): each clip's way of
  floating weighed as the crossfade weighs the clip itself (each
  action's effective weight; `Player.updateAvatarPose` moves the mixer on
  and poses the figure last, after the clip for the frame is played and
  the figure turned — so it is this frame's weight and this frame's turn:
  posed before the turn, a swimmer's head sat 7–10 cm off the capsule's
  through a turn and snapped back as it ended) — the water's height (each at its
  own clip's moment), the lean and the node's move with it, the head's
  place before the root — and the reach and keels of every clip that
  shows. Before, the head's height switched at once (0.85 m the frog
  kick's against 1.5 the others') while the lean eased and the water's
  height followed at its own rate: the hoodie came 0.21 m out or the head
  went 0.11 m under for 6–10 frames, the body jumping 13–37 cm. And a
  pose half the one clip's and half the other's is neither's: during a
  fade the figure's own shape is looked at each frame (`fadeLevel`: every
  6th point of what it wears, its eyes and its feet, skinned on the CPU,
  ~0.1 ms) and the water kept no lower than keeps the clothes under, nor
  higher than keeps the eyes out, nor the feet in the floor where the
  clothes allow. Measured over every change (tread↔swim↔fast, both
  skins, both views): eyes ≥ 0.034, clothes ≤ 0.008; bones move smoothly
  (the head ≤ 5 cm a frame). **Every change blends from where the fade
  is** (`Avatar.animation.play`, `blend`, since the second clips pass):
  the avatar keeps each playing action's share of the pose itself
  (`animation.weights`, set on the actions before the mixer runs) and a
  change takes every share from what it is now — the clip played last up
  to 1, the rest down to 0 in step, in as long as a whole fade would take
  for what is left of it (`weightOf(name)` reads a share). three's
  crossFadeFrom faded the clip played last out from all of the pose,
  whatever it was making of it: a change during a fade (a tap of W, the
  wall's flicker) put the pose back in one frame — bones 0.25–0.55 m, the
  root up to 0.58 m. Now, tapping W 4–11 frames at a time: bones ≤ 0.12 m
  a frame (the fade's own rate), the head ≤ 3 cm; others' figures alike
  (bones ≤ 0.10 m, swim and tread flicked every 3–6 frames). A clip still
  fading out, played again, goes on from where it is.
- **The floor** (`liftFeet`, `liftLeg`, since the second clips pass):
  afloat, each foot — its own skin, every 6th point, as the clips pose it
  this frame — is kept 3 cm over the floor under it (the pool's, or a
  tread's top: `floorUnder`) by its knee: the foot lifted straight up as
  far as it would go in (0.4 m at most), its turn in the world kept, the
  knee bent further about a hinge across the figure (its root's x, square
  to the thigh — a hinge from the leg's own bend flipped from one side to
  the other on a straight leg, 0.4 m a frame) and the hip swung to put the
  foot there; once more for what is left. At once as the foot comes down,
  let down again at 6/s. The figure itself is not lifted (what it wears
  stays under). The mixer sets a bone only where its value has changed
  since it last set it, so a leg a clip holds still (the stand-ins'
  standing) kept the turn and was bent again on top of it, 20 cm higher
  each frame: `unliftLegs` puts back each bone turned and not set since.
  The visitor's own figure (not in first person) and others' (`layOther`).
  Measured, every clip and change, both skins, both views: the lowest
  shoe skin 1.3–2.8 cm over the floor (was 0.14–0.24 m in it); eyes and
  clothes as before; `Player.update` 0.3 ms swimming or treading (0.2
  walking).

## How sitting and swimming play them (summary; visitor-interactions owns it)

- **Sitting down and getting up** (`Player.sit`, `stand`; `sitPlan`,
  `risePlan`, since 2026-10-17): by the `sit-down` and `stand-up` clips
  only where the walk there, the turn and the body at eight moments meet
  nothing but the seat's own piece; else on foot. Never faster than a
  walk, never sideways. From afar (more than 2.5 m across the floor, or
  another floor) it walks there where the way is clear and no longer than
  6 m (`WALK_FROM_AFAR`), else `seated.prelude`: it fades out where it
  stands and in beside the seat, 0.3 s each (`DISSOLVE`), cut only at
  opacity 0.
- **The fade** (`Avatar.setOpacity`): while less than whole each mesh
  wears a dithered (three's `alphaHash`) copy of what it wore whole — or of
  what it is given meanwhile (`ProbeLight.dress`'s copies) — made with the
  original's shader additions and kept for the next fade; `whole()` puts
  back exactly what each mesh wore; no shadow under half. `Player.update`
  asks `setOpacity(1)` every frame it is not fading on purpose, so a
  dithered copy handed back since is put back as what it stands for (the
  third clips pass left a figure at 0.991 for good). `figure-fade.js`
  (`../app-testing-and-performance/`) measures it.
- **Others' sitting figures** (`otherFade`): the receiving page fades
  between the sitting clips as the visitor's own does, as near as the
  names tell — into sitting from "sit-down" over 0.4 s, on foot 0.35; into
  "stand-up" 0.25; out of it 0.3; up on foot 0.35 — played by its own
  frames; a remote page sees the fade from afar as a cut.
- **The climb fitted to the edge** (`climbFitOf`): 41 looks through it
  (`Avatar.bonesAlong`) give how far the figure is let down (its hands onto
  the coping; toes, ankles and knees no lower than 3, 7, 7 cm over it once
  up) and how far it is leant forward about its hands (0–30°) to keep its
  legs 4–8 cm behind the wall's face. The lean follows the climb's share of
  the pose (`weightOf("climbing")`), so its first frame no longer snaps
  (1–2.2 cm, ≤ 2°; it was 0.25–0.46 m). At its end idle fades in over
  0.7 s, the root going to the capsule's by idle's share.
- **Remote swimmers**: played by the clip's name, fitted on first sight
  (`Avatar.wear`; the stand-in till then), laid back as one's own
  (`swimmer.layOther`), by the receiving page's own frames
  (`Player.updateOtherPlayers`), faded at the sender's rates: the
  breaststroke at 1.35 (`strideOf`), into the climb over 70% of its reach
  (`fadeOther`), held at its start meanwhile (`holdOther`), idle after it
  over 0.7 s. Only the place and the clip's name are sent, so a remote
  swimmer's waterline is approximate when the strokes change every few
  frames.
- Getting into a car sets `idle` (above), and every clip is played and
  sent by name.

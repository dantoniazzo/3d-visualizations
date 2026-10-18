# Sitting and the televisions

The app side: where a visitor sits, how the figure gets there and back,
what others see, and the televisions. Wave A of 2026-10-16, with the
clips passes of 2026-10-17 (their dated record: `history.md`). Seats and
TVs need nothing published: a public view reads its published spec,
`seats.json` and `screens.json`.

Elsewhere, and read with this:
- The seats' data (`public/models/furniture/seats.json`: schema, how it is
  measured, `seatsOf`, Ladonia's pieces; `npm run seats` after a sofa,
  chair or lounger changes): `../space-people/people-data.md` — the same
  file the people sit by. The planner's recline rule, which the visitor's
  `reclines` follows (a LOUNGE piece with a `room`):
  `../space-people/planner.md`.
- How the figure sits (`wayOf`, the knees opened by `fitClip`), the clip
  (`People.index()`, Sitting Idle, the stand-in) and how it is fitted to
  the avatars (`fitClip`'s `into`, `Avatar.fit`, `Avatar.sitting`) — the
  old "How it sits", "The clip" and "Fitted to the avatars" bullets:
  `../space-people/avatar-clips.md`. The visitor's own clips (Stand To
  Sit, Sit To Stand; without them, the stand-ins) and `P.avatar`
  (`setOpacity`, `whole`, `hipsAt`, `bonesAlong`):
  `../space-people/avatar-clips.md` and `../space-people/visitor-clips.md`.
- `Collision.meets`, `meetsAny`, `anyIn` (which `Seats.wayClear`,
  `turnClear` and `roomFor` use): `../walkthrough-editor/links-and-handles.md`.
- A TV's face in Blender (an upright box of `tv_glass` facing −z, never
  moved; `tv_volume`, `tv_wall`, `media_wall`):
  `../build-property-space/blender-builders.md` and
  `../build-property-space/furnishing.md`.

Since 2026-10-16. Both are providers of `World/Interactables.js`
(registered by their modules), made in both views after People (World.js).

## Sitting (`World/Seats.js`, `world.seats`)

- **The seats** come from `spec.furniture` × `public/models/furniture/
  seats.json` through `shared/people.js`'s `seatsOf`, as the people's do:
  Ladonia 219, 11 of them chaises' deep ends; loungers are skipped (no
  lying, the user's choice), and so is anything sat on outside
  `SEAT_HEIGHT` 0.3–0.62 m (a bar stool: the clip is made for a chair).
  Refreshed with the furniture (`refresh`).
- **A seat is a point**, not a mesh: a public view's collision tree says
  nothing of which piece a triangle is. Aimed at when the crosshair's ray
  passes within `AIM.across` 0.4 m of the point 0.12 m over the cushion
  (half the way to the next place on a sofa), within `REACH.seat` 2 m, and
  no more than `AIM.slack` 0.3 m behind the first solid hit (its own
  cushion's edge, aimed at low); of several, the one passed nearest.
  `pick` costs 1.3 µs over 219 seats. A seat over a dining table's edge
  can be aimed at over the table.
- **Taken** (`taken`): a person of the spec sitting there and drawn; the
  visitor; another visitor's figure playing a "sitting…" clip within
  `HELD` 0.3 m of the point or of the deep end's front. In the editor a
  seat whose piece the scope hides is skipped (`usable`). Ladonia's people
  hold 3 (a-f076#0, c-f154#0, c-f164#1).
- **Where the figure goes** (`poseFor(seat, avatar)`), as `People.place`
  puts a seated person: turned to face the seat's way (+180°: a rig faces
  +z), the contact point measured on the figure's own skin on the seat's
  point, moved forward until the knees are 4 cm past the front edge (the
  heels 6 cm before a solid base), `FORWARD_MOST` 0.15 m at most — but on
  a deep end all the way, so it is sat at its front, legs over the edge;
  let down into a sofa or a lounge chair up to `GIVE` 3 cm where the feet
  would hang, lifted up to 1.5 cm where they would be under the floor.
  `position`, `quaternion`, `point`, `head`, `eye`, and the `clip` it sits
  by there; `side`, `face` (the way it faces, [x, z]), `origin` and `edge`
  (its front edge that far along `face` from `origin`: what spots beside
  it are measured from). Sitting Idle is made for a seat about 0.45 m
  high: on 0.49 m chairs the feet hang 3–5 cm; knees can meet a table a
  chair is tucked under. `poseFor(seat, avatar, side, { back })` (since the
  third clips pass, 2026-10-17): `side` ±1 turned a quarter to the seat's
  left / right, on the seat's point (as near its back as facing it: the
  hip is beside the back), moved along the way it faces as far as puts
  the knees 4 cm past that side edge — back towards the other side, 0.4 of
  half the piece's catalogue width at most (`SIDE_BACK`; Ladonia's knees
  0.42 m before the pelvis come 0.15–0.2 m past a 0.47–0.54 m chair's side
  sat in its middle) — and `back` metres towards the chair's back. Only on
  a seat that `turns`: alone on its piece (a chair's or a stool's: not a
  sofa's place), not reclined, not a chaise's deep end, its width known,
  and not a chair with arms by its catalogue id or name (`ARMS`
  /arm|lounge|club|desk/: the garden armchair's legs went over its arm,
  which the public collision has only the top plane of, at 0.66 m — the
  thighs at 0.55 pass under it unmet). Ladonia: 74 seats turn (44 oak and
  24 shell dining chairs, 6 poufs); its 59 garden armchairs and 16 lounge
  chairs do not.
- **Which way it sits** (`Player.seatPose(seat, from)`; as it is since the
  fourth clips pass, 2026-10-17): the seat's way, as it always was, unless
  sitting so meets anything but the seat's own piece (`seatingClear`: the
  seated body at 4 moments of the sitting clip, `SEATED_LOOKS`, and sitting
  down and getting up on foot — `footPoses`: idle at `standSpot`, and each
  bone a third and two thirds of the way to its seated place — or else by
  both clips, `sitByClip`, `riseByClip`; `Seats.roomFor`: every limb
  capsule, nothing met by more than 2 cm). Then, on a seat that turns, a
  side only where the figure turned so meets nothing at all: turned, the
  seat's own piece (`Seats.own(seat, { side })`) is the seat and what is
  under it alone (no higher than 4 cm over its top) — its back, a shell's
  sides and an arm all count — and the seated body and sitting down and
  getting up on foot must meet nothing (the clips are taken only where they
  meet nothing too: `sitPlan` and `risePlan` look by the same rule); tried
  on the seat's point and then 3, 6 and 9 cm further from the table
  (`SIDE_BACKS`), the first clear; of two sides, the one facing more
  towards `from`. Otherwise the seat's way, whatever it meets. Ladonia
  (both skins, both views): of its 74 seats that turn, one is sat turned —
  the pouf c-f103#0 by the corner sofa, turned to its right, by the female
  figure (facing its way, the legs went into the sofa's chaise) — and none
  by the male; every dining chair is sat facing its table, as before the
  third pass: drawn up under it, the figure's hands, thighs and feet go
  into the table's edge and base — the deepest limb most often a foot in
  the base (19–24 of the 44 oak chairs, male), seated depth median
  0.19–0.29 m, at most 0.46 m (accepted). The third clips pass took, where no way met
  nothing, the way that went least far into things, with the chair's back
  counted as its own and looked at only 3–9 cm back: 67–71 seats a run were
  sat turned, the torso up to 0.22 m into an oak chair's backrest in a
  public view (0.39 m in the editor's full meshes) and the thighs through a
  shell chair's sides — none of which its own measures saw.
- **How it sits, the clip, fitted to the avatars** (`wayOf`, Sitting Idle
  or Sitting Reclined Male, the knees opened, `Avatar.fit`,
  `Avatar.sitting`): `../space-people/avatar-clips.md`. In short: the way
  chosen becomes the figure's own "sitting" action, sent by the way's own
  name (`pose.clip`: "sitting", "sitting reclined 37", …), and the other
  pages make it for their copy of the figure (Others, below).
- **Sitting and getting up** (`Player.sit`, `stand`). By the clips
  (`sitPlan`, `risePlan`; since 2026-10-17): sitting down, the figure goes
  to where `sit-down` starts — before the seat, turned as its sitter is,
  so far out that the clip's hips at its end (`Avatar.hipsAt`: the clip's
  own hips track, carried out of the male's Armature) land where the
  seat's sitting clip has them at its start — on foot (`routeOf`: turned on
  the spot to the way it goes at 9 rad/s, walked there facing it, eased,
  1.6 m/s at its fastest, then turned on the spot to its back to the seat,
  still for 0.25 s at least: a stride faded into the clip put a foot 7 cm
  through the floor; within 5 cm, only turned); plays the clip, its root
  let down (or up) to the seated root's height over the clip's second
  half; and fades into the seat's own clip over its last 0.4 s, the root
  going linearly (as the fade weighs the two) to the seat's, so the hips
  stay put. About 2 s in all; `seated.plan` (`by: "clip"`), `.time`,
  `.part` (walking/idle, sit-down, settle).
  **Only where there is room**: `Seats.roomFor(seat, poses)` puts the body
  (`LIMBS`: a capsule round each limb, bone to bone, 3.5–13 cm thick;
  `Avatar.bonesAlong(name, LIMB_BONES, 8)`, eight looks through the clip
  measured on one copy and kept, ~10 ms once a skin, done ahead by
  `Player.prepareSitting` when a seat is offered) at each look of
  `sit-down` but the last, placed as `sitPose` plays it; `Seats.wayClear`
  the walk there — the walking clip's whole body at 10 moments
  (`bonesAlong("walking", LIMB_BONES, 11)`), legs down to the feet on the
  floor, every 0.2 m of the way, turned the way it goes, looked at only
  where `Collision.anyIn` finds anything within 0.55 m — and
  `Seats.turnClear` the turn on the spot where the clip starts (idle's
  body every 15°). Against everything (`Collision.meetsAny(capsules, box,
  { except, depth, count })`: the triangles round them all gathered once,
  each tried against the capsules whose boxes it touches — some 0.3 ms a
  sample where asking the tree for each limb was 3 ms) but the seat's own
  piece and what is underfoot (`Seats.own(seat)`, since the second clips
  pass: the triangles called as the piece is — its catalogue name, as the
  crosshair's label has it, in the editor its group's — all three corners
  within its catalogue footprint as placed, +1 cm; and anything under 6 cm
  over the floor. The same rule in the editor and in a public view, which
  fetches `/models/furniture/catalog.json` once from `prepareSitting`
  (`Seats.catalogue`); it had picked the piece most of what is round the
  cushion is of — in a public view the dining table, a corner sofa, the
  kitchen, a curtain at 8 seats — and left out the next armchair of the
  same name. With `{ near: true }`, for the walks and turns, only the
  seat's own place of its piece: the triangles whose middle is within
  0.35 m of the seat point across the seat — a walk to a sofa's middle
  place went over its other places). A meeting deeper than 2 cm and there
  is no plan: the figure goes on foot. Ladonia, from a free spot before
  each seat (or beside it, or round it, from which the seat can be walked
  to): sitting down by the clip at 24–27 seats, getting up at 34–35.
  Getting up by the clip (`risePlan`): the capsule is put where `stand-up`
  ends (its hips over the feet, 0.46 m before the seat) — or as little
  further on the way the seat faces (the way the figure faces, stood) as
  `Seats.freeAt` finds it free, 0.4 m at most, 5 cm at a time (`freeAt`:
  `Collision.meets` with 1 cm, 0.3 ms; `capsuleIntersect`, resolving all it
  met, took 5–7) — and the body at each look but the first must have room;
  else no plan. It waits there (`Player.update` skips the walk) while the
  figure fades from sitting into the clip (0.25 s, the root from the seat's
  to the clip's), plays it (the root let down to the floor over its first
  half) and fades into idle or walking over max(0.3 s, the step / 0.8 m/s),
  the root to the capsule's, never turned on the way. Keys pressed
  meanwhile walk off after it.
  **On foot** (`walkPlan`, `walkOffPlan`, since the second clips pass,
  2026-10-17), without the clips or the room for them. Where the figure
  stands at the seat (`standSpot`): before it, its feet where they are sat,
  where idle's body has room there; else where it sits, its hips straight
  over where they are sat, or up to 0.3 m further back for room (a chair
  drawn up to a table: stood straight up, its knees were in the table's
  top); else there all the same. Sitting down it walks there (`routeOf`,
  as above; ways that turn by less than 50° walked round the corner,
  facing the way between over 0.3 m of it) — straight where the way
  (`wayClear`) and the turn there (`turnClear`) are clear, else round what
  is in the way: `Seats.wayRound`, a grid of spots 0.2 m apart a figure
  could stand in (`figureAt`: a 0.22 m capsule from 6 cm to 1.65 m), the
  shortest of 300 looked at (`GRID_MOST`; `{ most }` asks for more) within
  1.4 m of the two ends, straightened to the furthest point each walk to is
  clear; none found, straight there all the same (`clear` false) — and
  sits down where it stands, sitting fading in as the root goes onto the
  seat's (`sitTime`: 0.35 s, or the hips at most 0.6 m/s across the floor,
  0.35 m/s going back). Getting up, it stands up the same way where it
  sits, turns to where the visitor stood (`from`) and walks there; that way
  or the turn blocked, to the nearest spot round it (0.6–1.8 m, every
  eighth of a turn) the capsule can stand in (`freeAt`) with a clear way and
  turn; none, round what is in the way to `from` (`wayRound`), else
  straight there. Sat on from afar (`seated.afar`), never back to `from`:
  the nearest free spot round it with a clear way, those of the ring
  2.2–3.5 m round too where none is nearer (`AROUND_FAR`); none, round what
  is in the way to the nearest of them, else straight there. Where a seat
  is hemmed in — a sofa's middle place behind a close coffee table, a chair
  drawn up between others, a pouf against a wall — no way is clear and the
  walk goes through what is in the way. (The third clips pass walked the
  way its walking body met at the fewest places instead — a grid that went
  through spots it could not stand in at 1 m each, `GRID_MOST` 600 — and it
  was worse by the verifier's sweep: deeper at 5 and 4 seats on the way to
  them and 9 and 17 on the way off, in a public view (male) and the editor
  (female), as against 6 and 4, 6 and 4 better; put back in the fourth.)
  Not back through the seat where it stood in it (within
  101° of straight back). The capsule waits where the walk ends and the
  camera's pivot follows the figure's head. Every walk faces the way it
  goes; hips at most 1.9–2.0 m/s (the root 1.6, the walking clip's sway on
  top), never more than 45° off the way the figure faces at walking speed.
  Plans (the seat's way chosen, sitting down; getting up), fourth clips
  pass: a public view 2.0 / 1.2 ms median, 13 / 15 ms at most; the editor
  (its 1100-triangle chairs) 10–12.5 / 6–8 ms median, 20–25 / 19–22 at the
  90th percentile, 51–77 / 44–126 ms at most. Ladonia, its 214 seats a
  visitor can walk to from the clips passes' starts (`seat-sweep.js`, in
  `../app-testing-and-performance/` since 2026-10-17, with `ladonia-seat-starts.json` and
  `ladonia-w-boxes.json`: every limb capsule against everything but the seat's own
  piece, more than 2.5 cm; both skins in both views): seats meeting
  something in any part — seated, sitting down, getting up or the walks —
  151 and 154 (editor and public, female), 173 and 178 (male); the seated
  pose itself 124–149: every oak and shell dining chair (its hands and
  thighs at the table's edge, its feet in the base), the garden armchairs at their tables (38–54
  of 59), a sofa's middle place behind a close coffee table; the walks to a
  seat 93–111, off it 85–91. As the second clips pass had them, but for
  the one pouf sat turned. The old glide met something at 182 of 219, at
  up to 14 m/s. **Sat on from afar** (more than 2.5 m across the floor, or
  another floor: a click from above; since the third clips pass): walked
  there where the plan's way is clear and no longer than 6 m (`WALK_FROM_
  AFAR`; the grid looks at up to 900 spots, `AFAR_GRID_MOST`); otherwise
  `seated.prelude`: the figure fades out where it stands and in beside the
  seat (`spotBeside(seat, …, pose)`, out the way it sits; none free, where it
  stands at the seat), 0.3 s each (`DISSOLVE`), still, playing idle, then
  walks the last of the way and sits. Got up from before it has come (a
  key during the fade: `stand` → `fadeBack`, a `rising` plan `by: "fade"`,
  the capsule waiting), it fades back in where it is seen — where it stood,
  or where it was put, if that spot is free (`prelude.free`: `spotBeside`
  found it) — from as far as it had faded, at the same pace; put where
  nothing is free (in the seat's own place at a table), it fades out there,
  is put back where it stood at 0 — drawn there first not at all — and
  fades in. Third clips pass: put whole at once where it was fading in, the
  capsule in a chair at a table was pushed out 0.65 m and then 0.12 m, seen
  whole. `stand({ now })` (edit mode, a car, a teleport) is whole at once:
  where it is seen if free, else where it stood. The fade
  (`Avatar.setOpacity`): while less than whole each mesh wears a dithered
  (three's `alphaHash`) copy of what it wore whole — or of what it is given
  meanwhile (`ProbeLight.dress` copies what a mesh wears, and of a dithered
  copy its copy is dithered too; `userData.dithered` says so) — made with
  the original's shader additions (`onBeforeCompile`,
  `customProgramCacheKey`: the probes' light) and kept for the next fade
  (`dithers`, the copy it wore last: the probes' own copy, which they then
  leave as it is); whole (`whole()`), each mesh wears again exactly what it
  wore before. No shadow cast under half. `Player.update` asks
  `setOpacity(1)` every frame it is not fading on purpose (`fading()`): any
  dithered copy given back to it since — a room shown live gives back what
  it took, which it may have taken mid-fade — is put back as what it stands
  for (a few meshes' materials looked at, once the figure has ever faded).
  Third clips pass: kept dithered for good, and the probes' copy made the
  frame Space was pressed after a page's first fade stayed at 0.991 for
  the rest of the visit. Measured (fourth pass, both views, 8 seats at
  4.5–9 m, Space 1–35 frames into the fade, 262 runs; `figure-fade.js`, in
  `../app-testing-and-performance/`: `__fade.fades`, `snap` / `check` of the very materials
  worn): while the figure is
  seen it never moves more than 0.7 cm a frame; every cut (up to 9.8 m) at
  opacity 0; the opacity ends at exactly 1 and all 9 of the figure's meshes
  wear the very materials they wore before it sat (also after 52 whole
  fades a view); it ends on a free spot, the figure on the capsule; the
  fade back takes 0.58 s at most. Sat on from afar to the end (14 seats ×
  3–9 m, both views): 6–7 of 52 walked, the rest dissolved; seen, at most
  2.7 cm a frame (1.6 m/s); got up 0.48–2.0 m from the seat, on a free
  spot, never back at the far start. Before the third pass: a cut of
  3.8–4.6 m in one frame, and with nothing free beside the seat a walk back
  to the far start. Others see the figure stand and then be across the
  room (the fade is the visitor's own page's).
  Seated the capsule is parked under the seat
  point at floor height, with no physics; the bird's-eye view, the room
  readout, the live room and the grass follow it there; getting up puts
  the capsule where the walk off ends: the free spot kept (`from`) — or,
  sat on from afar, the nearest free spot round where it stands up (above)
  — checked free and with ground under it (`Seats.freeAt`); `from` is then
  `spotBeside(seat, …, pose)` (out the way it sits, else either side), else
  where the visitor was: where `stand({ now })` puts it.
  `player.seated = { seat, pose, from, afar, prelude, mode, distance, t,
  start, pivot, look, plan, time, part }`;
  `player.rising` getting up (`plan` by the clip); `settling()` while either or a turn of
  the view is under way (`busy` "seat" for Pace). In first person the view
  turns the way the figure faces (`pose.face`), 0.1 rad down; in third person the camera
  turns round the seated head. E (*Stand up*, or what the seat offers),
  Space, the walking keys (they walk off once up), a stick push of 0.2,
  Tab, F, a teleport and the menu's room jump get the visitor up; V still
  switches the view, and that is the one they get up into. On a touch
  screen the orbit camera is put back out to where it was
  (`seated.distance`, `orbitOut`) if first person left it collapsed on the
  eye (fix of 2026-10-16: after a television turned the view, the camera
  stayed 5 cm from the head, inside the figure).
- **From above** (BirdView's `thingAt` → `seatAt`): a click or a tap on a
  free seat of the floor shown sits there (hover: "Sofa · click to sit",
  `action`); E with nothing aimed at sits on the nearest free seat within
  `SEAT_NEAR` 1.2 m of the feet, unless a door is nearer, and only one in
  sight (`Seats.nearest` → `inSight`: a two-sided collision ray across the
  floor 1.3 m over the feet, and no shut door's leaf, between the feet and
  the seat; fix of 2026-10-16 — in B2's bathroom E sat the visitor on the
  living room's sofa through the party wall; of 7,884 spots round the
  seats 554 now lose their old seat, 76 of them spots one can stand on; the
  six of those looked at all had a wall between). The figure
  stays drawn; the view never goes to first person.
- **Others** see a visitor sit down ("sit-down", their root as sent: the
  sitting clip is fitted to that figure meanwhile) and get up ("stand-up")
  by the clips' names, and sit by the clip's name: their page fits the
  clip to that figure on first sight (`seats.dress`; standing until then),
  the nametag at 1.55 m over the root; the seat counts as taken for them.
  The name sent is the way's (`Player.sit` sends `pose.clip`, and plays
  "sitting" itself): `seats.dress(model, "sitting reclined 37")` works the
  same way out for their figure on a seat of that height (`WAY_NAME`; their
  skin is the same file here, so it comes out the same) and adds it by
  that name. Before the integration of wave B, others saw Sitting Idle at
  the root sent: upright on a lounge chair, the soles a few cm under their
  floor. Checked with two tabs of one public view: the second plays "Sitting
  Reclined Male (37 cm seat)" at the first's root, the seat taken.
  A visitor's `animation` comes over the network unchecked by the server:
  it is taken as a string, else "idle", where it arrives (fix of
  2026-10-16: a number threw in `Player.update` every frame for everyone
  else in the scene). Since the third clips pass their page fades between
  the sitting clips as the visitor's own does, as near as the names tell
  (`otherFade`: into sitting from "sit-down" over 0.4 s, on foot 0.35;
  into "stand-up" 0.25; out of it 0.3; up on foot 0.35) — played by its own
  frames, each frame. Measured with a same-skin figure fed the visitor's
  root and clip each frame, against the visitor's own (the fourth pass):
  sitting down and getting up by the clips (a-f003#0) and on foot
  (a-f197#0), its bones 0.2 cm off on average and 2.8–3.5 cm at most, where
  Avatar.js's 0.2 s fade put them 1.3–1.9 cm off and 24–28 cm at most; on
  foot at a sofa's place (a-f040#2), 4.6 cm against 6.4 on average.
  Seated sideways a television "in front" is still the one before the
  seat's own facing (`Screens.inFront(seat, eye)` reads `seat.face`).
- **Pace**: a remote figure playing "idle", "sitting…" or "treading"
  (afloat and still, `Player/Swim.js`) is at rest (`AT_REST`); seated in
  the walkthrough the editor draws at the 30 fps rest rate.
- **Measured** (public, step 4, 2048 × 1536): render standing 14.7–14.9
  ms, seated 14.6–15.5. Look ray + prompt at a seat 0.059 ms.

## Televisions (`World/Screens.js`, `world.screens`)

- **Where the glass is**: `public/models/furniture/screens.json`, written
  by `scripts/measure-screens.mjs` (`npm run screens`): each piece's
  `tv_glass` or `screen` primitive, its blocks of shared corners kept if
  upright within 5° and at least 20 cm a side, read in the piece's frame
  as the app shows it (catalogue yaw and scale, not re-centred) — `{
  screens: [{ at, size: [w, h], recess }] }`, `at` the middle of the front
  face, `recess` how far the rest of the piece stands in front of it
  (ld-media-ochre 0.452, tv 0.104). Six pieces; the laptop is left out
  (its glass leans 20°). `npm run screens -- --check` measures again and
  exits 1 if any glass moved or changed size by more than 1 mm (a
  recess-only change is a note): run it after re-exporting a piece with a
  television. After lane B's re-export of ld-media-ochre and
  ld-tv-volume-30 (2026-10-16): every screen as in the file. No Blender
  fixture, republish or rebake is needed: the public view reads its
  published spec and this file.
- **The sets**: one per placed piece with a screen (Ladonia 12: 8
  ld-tv-wall, 2 ld-tv-volume-30, ld-media-ochre, ld-media-oak), placed in
  the editor from the furniture group's matrixWorld (gizmo edits move the
  picture), in a public view from the placement. Nothing is drawn while a
  set is off; the first switch-on makes its picture: a unit plane in the
  group "screens" (`userData.helper`, outside builder.root: never merged,
  baked, published, collided with or stood in for), 3 mm proud of the
  glass, a 12 mm bezel, 16:9 fitted (1.206 × 0.678 m on ld-tv-wall). Each
  its own MeshBasicMaterial; one VideoTexture shared.
- **Brightness**: in onBeforeRender the colour is `LEVEL × fade ÷
  renderer.toneMappingExposure` (÷ 1 without tone mapping), so the
  picture's white is the same at any exposure — the room's metering (× 2
  to 30), night, K's live room, and from above (the indoor gain lifts the
  rooms, not the exposure). `LEVEL` 1.3 by day, 1.0 by night. On a bright
  frame in A1, picture mean / p99 / wall: by day 92 / 193 / 99 (1.0
  matched the wall, 1.6 washed out); night, lamps on 106 / 181; lights off
  80 / 178; from above 92 / 192; never a pixel at 250. Switching fades over
  0.3 s (`busy` "tv").
- **The video**: one lazily made `<video>` (muted, playsinline, loop,
  preload none, `/media/earth-tv.mp4`, NASA, `assets/THIRD_PARTY.md`). It
  plays only while a set that is on is shown and has been in the camera's
  frustum within the last 1 s, and pauses in edit mode and on a hidden tab
  (`visibilitychange`). Frames go up as the browser presents them
  (`requestVideoFrameCallback`); where none has been presented for 0.5 s
  (a hidden or driven test pane) a frame goes each time the clock moves.
  A failed video shows every set that is on as no signal (a dark blue,
  0.01, 0.016, 0.045 linear × LEVEL), with one warning. The file has its
  moov atom at the end: a faststart remux would start a little sooner on
  a slow link. Made with `<blender> --background --python
  .claude/skills/visitor-interactions/encode-video.py -- <src> <out.mp4> <t0> <t1> <w> <h> <kbps>`
  (Blender's sequencer: H.264 in MP4 at 29.97 fps, a key every 60 frames,
  no audio; this Mac has no ffmpeg): Ladonia's is the Commons webm (19.5
  MB) from 28 to 68 s at 960 × 540, 600 kbps → 2.67 MB, cut to miss
  NASA's text at the start and its insignia at the end.
- **Picking a set**: `pick(ray)` from the front only, each candidate's
  slack `recess + 0.05`; past the look ray's 4 m, up to `REACH.tv` 5 m, its
  own collision ray, ignoring the set's own piece. `fromAbove(ray,
  accept)`: the glass's box, 8 cm round and 5 cm deep, so a wall set's
  thin top seen straight down is clicked too. From above a set on a floor
  over the one shown is hidden (`showFloor`), a click toggles one on the
  floor shown ("TV · click to turn on/off", the on style while on).
- **Seated before one** (`inFront(seat, eye)`, the provider's `seated`):
  the picture within 7 m of the eyes, within 40° of the seat's facing and
  35° up or down, 0.3–2.5 m over the seat's floor, the set turned to the
  seat within 70°, nothing solid between; the nearest to straight ahead
  wins, kept 1 s. Ladonia: 46 viewing seats, at least 3 a set. E switches
  it and the prompt adds `also` "Space Stand up"; switched on from a seat,
  `player.lookFromSeat(centre)` turns the view to first person, eased
  onto the screen over 0.6 s (`LOOK_TURN`); getting up gives back the view
  sat in. From above the view never changes.
- **Measured** (public, step 4, 2048 × 1536, seated in A1): a set on 18.3
  ms against off 20.0 (noise); the first switch-on of a page one 38.6 ms
  frame (two new programs), which FrameGuard takes as a first look; look
  ray + prompt at a set 0.10 ms; `pick` 0.2 µs; Pace draws a playing set at
  the 30 fps rest rate, edit mode at the heartbeat (the video paused).
- Not done: the set casts no light on the room. From above at night A1's
  cabinet spots' bloom lies over its picture.

## Testing

`node scripts/test-seats.mjs` (39 since the third clips pass — which
seats turn, `poseFor`'s sides, a chair's own piece turned to a side: the
seat and under it, since the fourth not its back —; 33 at first: the clip
fitted with and without the root correction, Ladonia's 219 seats, held, aimed, the nearest and the
nearest out of sight, `poseFor` on every seat; the knees opened on an
unturned figure and on one hanging from a turned, scaled armature, as
avatar_male's — rise exact, knee fixed, feet level, a tucked shin turned
under, the rest of the clip untouched; another visitor's way of sitting
dressed by its name), `node
scripts/test-screens.mjs` (19; runs `measure-screens --check` when the
GLBs are there). In a page, after act.js: `sit.js` (`__sit.seats`,
`before`, `aim`, `press`, `step`, `state`, `ready`, `view`, `shot`) and `tv.js`
(`__tv.list`, `freeze(t)`, `unfreeze`, `frames`, `measure(id, { shot })`,
`shot`, `off`), both in `../app-testing-and-performance/`; for the clips,
`clips.js` (`sitTrace(id)`, `skin`) and `swim-trace.js` (`swimming.md`,
Testing), and
`seat-sweep.js` / `seat-sweep.py` for every seat at once. In a driven tab
first `await __sit.ready()` — the figure's clips (`Avatar.wear`), Sitting
Idle fitted (`Seats.dress`) and, in a public view, the catalogue that
says which piece is a seat's own (`Seats.catalogue`): without them the
first E only queues the sit (`Player.sit` answers "sitting" and calls
itself again once those settle, which a synchronous press-and-step never
lets happen). Test both skins
(`../app-testing-and-performance/browser-pane.md`, Both skins).

## `public/models/furniture/screens.json`

Where each television's picture goes (`World/Screens.js`), written by `scripts/measure-screens.mjs` (`npm run screens`; `-- <id prefix> …` measures only those and merges them in; `-- --check` measures again, writes nothing and exits 1 if any glass moved or changed size by more than 1 mm, or came or went). In the piece's own frame, facing north (−z), metres at scale 1, before its rotation; the `"$comment"` key is not a piece.

```
"<catalog id>": { screens: [{ at: [x, y, z], size: [w, h], recess }] }
```

| field | meaning |
|---|---|
| `at` | The middle of the glass's front face. |
| `size` | That face's width and height. |
| `recess` | How far the rest of the piece stands in front of the face: how far behind what a public view's collision meets first the screen may still be aimed at. |

- What is measured: each primitive of `tv_glass` or `screen` (`blender/lib/materials.py`), its blocks of triangles that share corners, kept where the block stands upright within 5° and is at least 20 cm a side.
- 2026-10-16: `tv` (0, 0.39, −0.006) 1.07 × 0.61, recess 0.104; `ld-tv-wall` (0, 0.36, −0.025) 1.23 × 0.72; `ld-tv-volume` and `ld-media-oak` (0.1, 1.405, −0.211) 1.43 × 0.81; `ld-tv-volume-30` (0.62, 1.405, −0.311); `ld-media-ochre` (0, 1.42, 0.202) 1.66 × 0.94, recess 0.452. The laptop's glass leans 20° and is left out. Ladonia's 12 sets: 8 `ld-tv-wall`, 2 `ld-tv-volume-30`, `ld-media-ochre`, `ld-media-oak`.
- A television's face must be an upright box of `tv_glass` (or `screen`) facing −z, a block of glass of its own; after exporting a piece with one, run `npm run screens` (or `-- --check`).

## Elsewhere

- The video's encoding: `encode-video.py` in this folder (SKILL.md,
  Tools); a hidden or driven pane presents no video frames:
  `../app-testing-and-performance/browser-pane.md` (Video in a hidden or
  driven pane), where Both skins and Before a first sit or swim are too.
- The in-page tools (`sit.js`, `tv.js`, `seat-sweep.js` / `.py`,
  `figure-fade.js`, `clips.js`) are in `../app-testing-and-performance/`;
  the verifier that sweeps them: `../app-testing-and-performance/lane-briefs.md`
  (p).
- The frame-rate guard takes a set's first switch-on as a first look:
  `../baked-view-lighting/frame-guard.md`.

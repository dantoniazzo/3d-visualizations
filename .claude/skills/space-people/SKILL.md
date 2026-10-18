---
name: space-people
description: "Animated people round a space and the visitor's own animations: placing the scene's people (standing, sitting, lying), the Mixamo download flow (the user signs in, Claude downloads), converting characters and clips (npm run people), fitting clips to the player avatars (sitting, swimming, transitions). Use when adding, fixing or animating people, avatars or animation clips."
---

# People round a space, and the visitor's own clips

Animated people set round a property: standing in twos and threes with a
drink, sitting on sofas and chairs, lying on the pool loungers — the spec's
`people`, drawn by `frontend/Experience/World/People.js`, planned by
`shared/people.js`. And the visitor's own figure's Mixamo clips: swimming,
treading water, climbing out, sitting down and getting up, and the people's
Sitting Idle fitted to it. The worked example is Ladonia Residence (scene id
`kosinozici-villas`; `../../../CLAUDE.md` says what is Ladonia's value and
what is a rule).

Read first:
- `../../../CLAUDE.md` — the user's standing terms (licences, the Mixamo
  sign-in, never the user's :3000, scene backups, never undo their edits)
  and the index of the skills.
- `history.md` — what the user asked for and chose, their edits since, and
  the dated gaps; `scene-people.md`, Still short, is the current list of
  open issues. Don't repeat them.

What is elsewhere: how a visitor sits, swims, climbs out and is seen by
others (the seats, the plans, the walls, the steps, the camera) is
`../visitor-interactions/SKILL.md`; publishing a version with people
`../publish-and-bake/SKILL.md`; the editor's code at large
`../walkthrough-editor/SKILL.md`; test servers, the browser pane and timing
`../app-testing-and-performance/SKILL.md`; the furniture people sit on
`../build-property-space/furnishing.md`.

## Rules specific to people

- **The user signs in, Claude downloads.** Open mixamo.com in the browser
  pane, let the user sign in themselves, confirm the download list once
  (source, counts, sizes) and only then fetch (`mixamo.md`, the standing
  rule in `../../../CLAUDE.md`).
- **The licence.** Mixamo's files may be used, not passed on: the
  downloads stay git-ignored (`assets/people/**/*.fbx`); the converted
  characters and clips in `public/models/people/` are kept out of git too,
  the user's choice since the repository is public (`.gitignore`). A clone
  draws the stand-ins; a deploy needs `npm run people` or the files copied
  in. Credit the characters and clips in `assets/THIRD_PARTY.md` and the
  README, and ask before committing anything built from them.
- **The scene holds the only copy of a vetted plan.** A reseed drops
  `people`; the same seed is not the same plan once the furniture, the
  index or the planner has changed. Keep a vetted plan as a file, not as
  its seed; copy `people` out before a reseed and back after
  (`../build-property-space/scene-safety.md`), and check each
  `seat.furniture` after it.
- **The user keeps editing.** Carry their moves of people and furniture
  into any re-plan, never undo them (`history.md`: brian, remy, `b-f201`;
  the dining chairs of 2026-10-17 in `../visitor-interactions/history.md`).
- **Write only `people`.** Back up, write through `validateScene` and
  `writeScene`, then diff: `people` alone has changed (step 9).
- **People are never baked**: they travel only in the published
  `spec.json`. After placing or changing them, publish again; no bake is
  needed (`scene-people.md`, Publishing).
- **Keep the visitor's clips in `assets/people/avatar/`**, never
  `animations/`, which the people's pipeline would take for the people's.
- **Test on scratch servers, both skins, both views**
  (`../app-testing-and-performance/test-servers.md`,
  `../app-testing-and-performance/browser-pane.md`).
  Any change to the app's code ends with the done-checks (lint, node tests,
  `__act.run()`): `../app-testing-and-performance/SKILL.md`.

## The method

Do them once the furniture is settled and walked
(`../build-property-space/furnishing.md`,
`../build-property-space/walkable.md`) and the light is
set (`../build-property-space/SKILL.md`, Light and look), before the final
review: they sit on the furniture as it stands, and a reseed drops them.
The data — entry fields, seats.json, the index, the planner's constants,
the scripts — is `people-data.md` and `planner.md`; how the app draws them,
and what is still short, is `scene-people.md`.

1. **Ask first**, with options. The user's answers for Ladonia stand until
   they say otherwise: the source and its licence — Mixamo downloads;
   random on every load, or generated once, saved in the scene and
   editable — saved and editable; in published views, or only in the
   editor — published, behind a People toggle; which spaces — only those
   they name (Ladonia).
2. **Get the assets through the user's own sign-in.** Mixamo needs an
   Adobe account. Open mixamo.com in the browser pane, let the user sign
   in there, and have them confirm the download list once — source,
   counts, sizes (Ladonia: 12 characters, 0.6 GB; 17 clips, 15 MB) —
   before you fetch anything. `mixamo.md` has the rules and the site's
   dialog values; `mixamo.js` and `mixamo-fetch.sh` do the driving.
   Characters as FBX Binary, T-pose, with skin. Clips as FBX Binary,
   without skin, 30 fps, no keyframe reduction, all with one character
   selected, each file named after its clip ("Sitting Talking.fbx": the
   pose is read from the name). They go in `assets/people/characters/` and
   `assets/people/animations/`, git-ignored.

   The visitor's own clips go in `assets/people/avatar/`, never
   `animations/`, where the people's pipeline would take them for the
   people's (its `settle` cut "Stand To Sit", a sitting clip by its name,
   to half a second). Six were downloaded on 2026-10-16, 3.5 MB, once the
   user had signed in; confirm the list with them first, as for the rest.
   Take them as FBX Binary, without skin, 30 fps, all on one character,
   each file named after what it is played as (the tile, then its
   description):
   - "Swimming" (Swimming: Swimming Underwater);
   - "Breaststroke" (Swimming To Edge);
   - "Treading Water" (Treading Water: Floating);
   - "Climbing" (Climbing: Pulling Up To A Ledge);
   - "Stand To Sit" and "Sit To Stand".

   *In Place* is a checkbox in the clip's panel, beside Mirror, not in the
   Download dialog (`__mixamo.inPlace`). Tick it on a loop alone: only
   Swimming Underwater has one. The climb and the two transitions keep
   their travel, which the app follows. The pipeline prints each clip's
   travel as downloaded and warns of none — its "NOT In Place" check is
   never reached for a clip it knows (`import_people.py`): read the
   travel. Mixamo has no front crawl. `npm run people -- --avatar-clips`
   packs them (git-ignored, as the rest): it cuts a travelling stroke to a
   loop held in place and swum heads-up, and keeps a climb's travel
   (`people-data.md`, The npm scripts; `avatar-clips.md`).
3. **Choose** characters by thumbnail: everyday and summer clothes, as
   many women as men, no uniforms, kits or costumes (Ladonia's shannon
   came in a football strip). Mixamo has no swimwear:
   tell the user those on the loungers will be dressed. Clips by what
   they are for (Ladonia's 17 and what each measured: `people-data.md`,
   index.json):
   - standing: one that drinks — only clips of drinking were recorded
     holding anything — two or three that talk, and listeners (agreeing,
     laughing, idling): a group is one of each;
   - sitting: each is made for one seat height (0.34–0.44 m), so take
     five or six, most of them with both feet flat before the seat (a
     tucked foot goes into a sofa's base);
   - lying: on the back, arms by the sides or behind the head. One
     propped up of itself is no use on a lounger with a raised back.
4. **Convert and measure**: add each new character to `SEXES` in
   `blender/import_people.py`, then `npm run props` (once, and when a
   prop is new), `npm run people`, `npm run seats`, `npm run build`. Read
   `index.json`: every character has `sex`, `eyes` and `sits`, every clip
   the `pose` and `hand` you expect. Credit the characters and clips in
   `assets/THIRD_PARTY.md` and the README, and ask whether the converted
   files in `public/models/people/` are to be committed (the standing
   terms, `../../../CLAUDE.md`).
5. **Plan many seeds, writing nothing.** `node
   .claude/skills/space-people/checks/people-plans.mjs <id> --seeds 20`
   must end "No problems": it holds every plan to the planner's own rules
   and says nothing of how one looks (`checks/README.md`). Then `npm run
   people:place -- <id> --seed n --out <scratch>/plans/plan-n.json --png
   <scratch>/plans/plan-n.png` for a dozen seeds. Read each listing and
   picture: a group by the pool, the loungers taken, someone on an outdoor
   sofa, someone indoors, a group on a roof, and who the first 4 and 8
   drawn are (People's cost and the phone rules, below).
6. **Audit by skin, in the app.** On a scratch test server
   (`../app-testing-and-performance/test-servers.md`), in the editor's
   page, with harness.js and `people-audit.js` (both in
   `../app-testing-and-performance/`): for each candidate `await
   __people.load(<the plan's JSON>)`, then start `__people.audit()`, poll
   `__people.run` and read `__people.last`. It poses each person through
   their clip as the app finishes them and measures their skin against the
   real meshes, never bones alone or the index's numbers. Its tolerances
   (`__people.TOL`) are those Ladonia's checker passed and failed by:
   soles within 2 cm of the floor; seated skin −4 to +1.5 cm on the seat
   (a sofa gives 3); lying, hips, back and head −3.5 to +3 cm on the
   lounger, heels within 3 (which every lounger fails today:
   `scene-people.md`, Still short); no skin more than 1 cm inside
   furniture, a wall, a rail, a hedge's core or a planter's grasses; a
   drink within 16° of upright while its hand is 35 cm or more from the
   mouth, tipped only at the lips and never 2 cm under the face's skin;
   standing, 0.38 m clear of everything (the planner's 0.4, less rounding)
   and facing the group within 25°. It does not see lawn or meadow grass, a
   hedge's leaves or anything the wind moves: look in the frames.
7. **Pick the cleanest plan and edit it by hand** with
   `__people.patch({ "<id>": { … } })`: swap two characters (a head that
   floats on one body rests on another's), change a clip or a drink,
   move someone a decimetre or two. Audit again after the last edit, and
   keep what `patch` returns, the list of people, as the plan file.
   Ladonia: twelve seeds audited, seed 12 taken, four people edited and
   audited clean. Two were then moved again unaudited, and one of them
   has an arm in a planter's grass (`scene-people.md`, Still short).
8. **Take the frames and look at every one**: `__people.lineup()` (every
   character: all there, opaque, matt, haired, of a size),
   `__people.shots(prefix)` and again with `{ sip: true }`, then each
   gathering wide by day and by night, and the site from above — the
   gatherings with the realistic preview on (`await __K.realistic()`: an
   editor tab's plain light is the same by day and at night). A tab
   never shown saves blurs until it is given a size
   (`../app-testing-and-performance/browser-pane.md`).
9. **Write the plan** once the audit and the frames pass. Back up the
   scene and check its md5 against the last backup
   (`../build-property-space/scene-safety.md`), then write the plan file
   through `validateScene` and `writeScene` (`people-data.md`, The npm
   scripts, has the command; `npm run people:place -- <id> --seed n`
   writes an unedited seed). Diff the scene against the backup: only
   `people` has changed. Load it: everyone built, no failed shader
   programs, no 4xx.
10. **Tell the user** to restart `npm start` if it has run since before
    the validator kept `people` (2026-10-06), or their next editor save
    drops them, and to reload open tabs; to publish again to see them in
    `/view/<id>`, where they are never baked and sit behind the People
    toggle; that the editor moves, adds, deletes and re-rolls them, and a
    re-roll replaces the vetted plan; that a reseed drops them, and the
    same seed is not the same plan once the furniture or the planner has
    changed — the scene holds the only copy, so copy `people` out before
    a reseed and check each `seat.furniture` after it; and what is still
    short. (`people` survives a save only because the validator keeps it:
    `people-data.md`, The validator; adding a spec field,
    `../walkthrough-editor/spec-and-validator.md`.)

## People's cost and the phone rules

- People are draw calls: 5–8 skinned meshes and about 50 thousand
  triangles each (measured frames: `scene-people.md`, Cost). The phone
  rules:
  - The slider step caps how many are drawn — 8 at step 1, a phone's
    default, 4 at step 0 — from the top of the spec's list, whole groups
    at a time. So a plan's first four must already be the scene: the
    group by the pool and the loungers.
  - A public view downloads only the characters it draws, under a third
    of the bytes for four of Ladonia's twelve.
  - They are never in the bake, and a visitor can switch them off with
    the rest of the scenery.
- The caps per step: `people-runtime.md`; the cap never holds in edit mode
  (`../walkthrough-editor/SKILL.md`). The app's speed rules at large:
  `../app-testing-and-performance/speed-architecture.md`.

## Fitting clips to the visitor's avatars

How the six clips are made, bound and fitted, sitting and swimming, is
`avatar-clips.md`; these are the lessons that cost a pass each.

- three's `crossFadeFrom` fades the clip played last out from all of the
  pose, whatever share it holds. A change during a fade (a tap of W, a
  stroke flicking to treading at a wall) put the pose back in a frame:
  bones 0.25–0.55 m, the root 0.58 m. Blend every change from each clip's
  share now (`Avatar.animation.play`, `blend`).
- The mixer sets a bone only where its value has changed. Whatever is
  added on top of a pose (a knee bent to lift a foot) is added again each
  frame to a bone the clip holds still: 20 cm higher a frame. Put back
  what you turned (Swim.js `unliftLegs`).
- Pose a figure last, after its turn and its clip for the frame
  (`Player.updateAvatarPose`): posed before the turn, a swimmer's head ran
  7–10 cm off the camera's through every turn.
- Measure a figure by its skin, from the frame before the key:
  - the toe bones stop 10–15 cm short of the soles (feet "off" the pool's
    floor were 0.14–0.24 m in it);
  - measures begun after Space missed a climb's first-frame snap of
    0.25–0.46 m.
- Try both avatars. `avatar_male.glb` hangs from an Armature turned +90°
  at scale 0.01 and has no eye bones: a clip fitted in the skeleton's own
  frame laid him on his back under the floor (`fitClip`'s `into`). What
  passes on one fails on the other.
- Clear what a test leaves on the figure before a baseline. A capsule
  placed by hand out of the pool without `swimmer.reset()` kept the
  float's lay-back while it sat, and a sweep counted shins 0.42–0.47 m
  into tables that were not (`act.js`'s `stand` resets it now).
- Clips taken by index break the day the list changes (the visitor's
  avatar had no "waving" at its index, and a network name like
  `toString` threw): bind them by name and fall back to idle.
- A pipeline that sorts by name misfiles a new kind: the people's `settle`
  cut "Stand To Sit" — a sitting clip by its name — to half a second.
  Keep the visitor's clips apart (`assets/people/avatar/`).
- In a public view a rig not animated this frame keeps the last render's
  bone matrices: render once before measuring a figure
  (`../app-testing-and-performance/speed-architecture.md`).
- Before a first sit or swim stepped by hand, await the clips and the
  catalogue (`__sit.ready()`, `__clips.ready()`, `__seats.ready()`), and
  check which skin a forced boot gave you
  (`../app-testing-and-performance/browser-pane.md`, Both skins, Before a
  first sit or swim).
- How sitting and swimming play the clips — the sit-down and stand-up
  fades, `Avatar.setOpacity`'s dithered copies, `otherFade` for remote
  figures, the climb's fit (`climbFitOf`, the lean by
  `weightOf("climbing")`), remote swimmers (`strideOf`, `fadeOther`,
  `holdOther`) — in short: `avatar-clips.md`, last section; in full:
  `../visitor-interactions/sitting-and-tv.md` and
  `../visitor-interactions/swimming.md`. The
  verifier of what moves the figure, and its instruments, is
  `../app-testing-and-performance/lane-briefs.md` (p).

## Pitfalls already hit

- three's GLTFLoader drops the colon from a node's name (`prop:wine-red`
  becomes `propwine-red`, `mixamorig:Hips` `mixamorigHips`; the original
  stays in `userData.name`), and gives every skinned mesh a Skeleton of
  its own even over one list of bones: share by the bones.
- A skinned mesh's bounds are its rest pose's: cull by a sphere round the
  pose, and pick by capsules round the bones (a ray against the skin cost
  8.6 ms a person).
- A class with two methods of one name keeps the later one, silently:
  People's per-frame `update(delta)` replaced the editor's
  `update(person)` until the frame call became `tick`; the `no-undef` lint
  does not see it (`../app-testing-and-performance/SKILL.md`).
- A list stored as "the pieces kept" leaves out every piece added later:
  options a browser remembered from before there were people came back
  with People unticked, and a publish silently dropped everyone. Store the
  pieces known beside it (`sceneryKnown`: `scene-people.md`, Publishing;
  `../publish-and-bake/SKILL.md`).
- A server started before the validator kept `people` drops them on its
  next save: restart the test server, and tell the user to restart
  `npm start`.
- Hide people through `people.setFilter` or `show`, never `group.visible`,
  which People overwrites.
- The editor hands the planner the whole of the index's `clips`; given only
  its list, nothing is scaled to the character (re-rolled sitters needed
  2.6–3.0 cm of lift).

## What building the people with agents taught

The general lessons are `../app-testing-and-performance/parallel-lanes.md`;
the people work (2026-10-09) is where they came from:

- A build checked on stand-ins proves the plumbing and little else: six
  builders on the app's two avatars with made-up poses each reported their
  part working; the first load of the real characters and clips broke the
  drinks (tipped past 45° for half of every clip or more), the sitting
  (feet up to 5 cm under the floor) and the lying (backs 15–25 cm off the
  lounger). Get the real data in before anyone builds on it.
- The fixer's own check is not the acceptance check: a checker who had
  built nothing found calves 1–2 cm inside the sofas where the fixer's
  rays along the shin bones gave "0 hits". Give every fix round a fresh,
  independent checker; it took three rounds, and the last still left a
  list.
- Have the checker choose as well as fail: Ladonia's audited twelve
  seeds, picked one and tested the hand edits that cleared it.
- What you fix after the last independent check is unchecked: run the
  check's tool on it again, or say so. The audit tool, run on the saved
  scene a day later, cleared the lead's four late fixes — and showed that
  of the two people the user had since moved, brian has an arm 1.8 cm in
  a planter's grass the checker had moved him out of.

## Files in this skill

- `scene-people.md` — what the people are made of, placing, lying,
  holding, cap and cull, collision, light, the editor, publishing, the
  validator, the conversion, why it is built so, cost, and **Still short**
  (the open issues); then where the rest of the app touches them.
- `people-data.md` — the files, the npm scripts (`props`, `people`,
  `--avatar-clips`, `--standin`, `seats`, `screens`, `people:place`),
  writing an edited plan file, the `spec.people` entry, the list's order,
  the validator, `seats.json`, `index.json` (characters, Ladonia's 17
  clips, the ten props).
- `planner.md` — `planPeople` / `planOne`: how many and where,
  clearances and spacing, sitting fit, lying, drinks and the rest.
- `people-runtime.md` — `QUALITY.people` per slider step, and what
  `World/People.js` offers the editor and the checks.
- `avatar-clips.md` — the visitor's own clips: the six downloads and what
  the pipeline does to each, bound by name, the sitting fit (`wayOf`,
  `fitClip`, `Avatar.fit`, `Avatar.sitting`), the swimming fit
  (`postureOf`, `floatOf`, `blend`, `liftFeet`), and how sitting and
  swimming play them.
- `visitor-clips.md` — the test-tab handle `P.avatar`.
- `mixamo.md` — the browser pane's sign-ins, clicking by script,
  downloads, and Mixamo itself (presigned links, characters, clips, the
  visitor's clips, *In Place*, the `avatar` kind, the clips' kept copy).
- `history.md` — the dated entries, newest first.
- `checks/README.md` — how to run `people-plans.mjs` and read it.

## Tools

In this folder:
- `checks/people-plans.mjs <scene-id> [--seeds 20] [--seed n]` (node) —
  the people planner over many seeds, held to its own rules, and the
  scene's saved people read the same way; it works on any seeded scene.
  It finds the repo four folders up (or `REPO=`), so it stays in
  `checks/`.
- `mixamo.js` — in-page, on mixamo.com once the user has signed in there
  (paste its text into `javascript_tool`: that page cannot reach the
  sink): `__mixamo.pickCharacter`, `pickAnimation` and `download` pick
  characters and clips, drive the Download dialog and catch each
  export's link; `__mixamo.inPlace(on)` sets a clip's *In Place* box;
  `__mixamo.batch(list)` and `take()` do a list of them (never yet run on
  the site). Its header says which of its parts ran on the day.
- `mixamo-fetch.sh <links-dir> <repo>/assets/people` — the background
  watcher that curls those links into `assets/people/<kind>/` —
  `characters`, `animations`, or `avatar` for the visitor's own clips,
  from links named `avatar__<name>.url` (step 2; `mixamo.md`). Keep
  `<links-dir>` in the scratch folder: a link is the whole of the
  authorisation.

In `../app-testing-and-performance/` (load through the sink after boot.js
and harness.js: `../app-testing-and-performance/tools.md`):
- `people-audit.js` — in-page, after harness.js, in the editor's page of a
  test server whose space has people (the method, step 6; as it loads it
  sets the view's scope to All for the page — the editor opens with the
  garden not made, and the planting is part of what it measures against;
  it measures against the builder's own meshes, which the editor's
  stand-ins leave where they were): `__people.audit()` measures each
  person's skin, through their clip, against the floor, their seat or
  lounger and everything round them, and flags what is out of tolerance
  (`__people.TOL`); `__people.load(plan)` puts a plan's people in the page
  and `__people.patch({…})` edits them by hand, neither saving anything;
  `__people.lineup()` frames every character side by side and
  `__people.shots(prefix)` each person close.
- `clips.js` (`__clips`, after sit.js too: the figure against the water —
  `figure()`, `range`, `steady`, `probe(name, pitch, lift)`,
  `sitTrace(id)`, `ready()`, `skin("male" | "female")`) and
  `swim-trace.js` (`__trace.trace(frames, { label })`: per frame the clip,
  bone pops in the root's frame, the facing afloat, the waterline, and the
  limbs through collision faces) — the clips' own measures.
- `figure-fade.js` (the fades), `seat-sweep.js` / `.py`, `sit.js`,
  `swim-checks.js`, `others.js` with `net.py` — sitting, swimming and
  others' figures, listed by `../visitor-interactions/SKILL.md`.

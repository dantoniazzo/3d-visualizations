# History: what the visitor acts on

Newest first (one entry so far; the records after it are its detail).
The dated record behind this skill: the request that made
the interactions, what each stage did, what was mended and taken out
again, and what was still short. The lessons are already in SKILL.md and
the topic files; read this for the user's own words, for the "Still
short" lists (gaps not to repeat) and for a superseded number. Section
names in quotes ("What the visitor acts on", "Doors") are the old
`app-notes.md`'s; `../README.md`, Older names, maps them to their files.

## 2026-10-16/17 — the usability request (Ladonia)

The whole entry, as the Corrections log had it. The colliders (C), the
jump-out bug, the speed work and the glass-door race are part of it and
kept here whole; the other skills' histories point here for them.

- **2026-10-16/17** — Ladonia (`kosinozici-villas`); one request in five
  stages. The user: "I need to be able to see debug mode on the objects,
  rather wireframes to see where the colliders are"; "Lights should be
  switchable with a keyboard key when entering the room instead of
  pointing to the light, as it needs to be easier to simply switch the
  lights on and off"; "Cars should be drivable in birds view without the
  camera switching to the driving view when entering the car from
  birdview, but rather staying in birdview the entire time"; "Add stairs
  in the pool and the ability to swim with proper character animations";
  "User should have the ability to sit in chairs, open drawers, wash
  machine doors, shower doors, turn the water on and off in the shower
  with steam appearing inside rendered with custom shaders, also turn
  water on and off in bathroom and kitchen sinks, open a fridge, closet
  and wardrobe doors, open windows and also watch tv".
  - Their answers: the swimming clips from Mixamo, through their own
    sign-in; the TV a real video loop, public domain or CC, about 3 MB,
    loaded when first watched; from above the car's keys are the car's,
    the view swinging round behind it about 1.4 s after the last drag; in
    the kitchens every front opens.
  - The defaults they accepted: each visitor's own state, no sound, the
    dishwasher and the ovens shut, no lying down or diving, the insides
    plain (shelves, rails, a fridge's shelves and bins, no props), edit
    mode the wireframes only. Answers and defaults now stand in the
    project's `CLAUDE.md` (What a visitor can do in a space).
  - Before wave C they added their standing word on speed, "I want the
    frame rate both in the editor and in the public view to be as high as
    possible" (`CLAUDE.md`'s standing terms).

  → How it was worked: a read-only survey (eight readers), the plan (the
  approvals pattern: `../app-testing-and-performance/parallel-lanes.md`),
  then:
  - stage 1 (the colliders, Q, driving from above, the groundwork for the
    rest): two lanes;
  - wave A (sitting and the TV; the furniture in Blender; opening
    furniture and windows): three lanes;
  - wave B (fixes and speed; water and steam; the pool's steps, swimming
    and the jump-out bug): three lanes;
  - wave C (speed; the pool's water and the swimmer): two lanes.

  Each lane owned its files in one checkout, and each wave had a review,
  an integrator or fixer, and a verifier. The user signed in to Mixamo
  after wave B, on the evening of the 16th, and the visitor's six clips
  were downloaded (3.5 MB; `../space-people/SKILL.md`, the old §4b). On
  the 17th they were wired in, then four passes more, one lane each, on
  what each pass's verifier had found.

  Built only into the scratch folder, tried on test servers of their own
  beside HEAD 5876694's build
  (`../app-testing-and-performance/test-servers.md`, the old §0), with
  scratch publishes and three draft bakes into a scratch folder; every
  figure this M4 Pro's, its pane
  hidden. Nothing published or committed; the repo's `published/`
  untouched. The user's scene was given the pool's steps and nothing else
  at the end of wave C (`patch-pool-steps.mjs`; the backup
  `kosinozici-villas.2026-10-17T02-58-24-844Z.json` in the session's
  `snapshots/scene-backups/`). Lessons folded into the standing terms, §0,
  §3, §4, §4b, §7, §8.6–9, §11, §12 and §13 of the old SKILL.md — now
  `CLAUDE.md`'s standing terms and the skills' methods: §0
  `../build-property-space/scene-safety.md` and
  `../app-testing-and-performance/test-servers.md`, §3
  `../build-property-space/buildings.md`, §4
  `../build-property-space/furnishing.md`, §4b `../space-people/SKILL.md`,
  §7 `../build-property-space/light-and-look.md`, §8.6–9
  `../build-property-space/walkable.md`, §11
  `../app-testing-and-performance/parallel-lanes.md`, §12
  `../app-testing-and-performance/speed-architecture.md`, §13 each skill's
  Pitfalls (this skill's SKILL.md for what the visitor acts on).
  - *The colliders as wireframes* (**C**, **Shift C** seen through
    everything; `Experience/Colliders.js`, `World/ColliderView.js`;
    `../walkthrough-editor/colliders-view.md`; README, Seeing the colliders):
    - every kind in its colour: the building, blockers, stairs, furniture
      as its mesh or its box, people, trunks, door leaves while they
      block, cars driven and parked, the visitor's capsule;
    - in the editor always: a region round the visitor, and in edit mode
      a moved piece's would-be collider live;
    - in a public view only with `?debug` or `?colliders`: the whole house,
      92,799 triangles, cut above the floor shown from above.

    Hidden it costs nothing (its code is not even downloaded); shown
    +0.5–1.5 ms a frame, seen through +0.5–2.9 (step 4, 2048 × 1536).
  - *Q, the room's lights* (`Player.toggleRoomLights`,
    `World/Whereabouts.js`; `picker-and-keys.md`):
    - any on → all off, else all on;
    - a chip by the room's name, a round button on touch, and a line saying
      what was done or that there is nothing to switch;
    - from above, the avatar's room.

    One answer now for which room the visitor is in — the readout, Q and
    the live room — so half way up a flight it is never the bathroom
    under it, and a threshold no longer blinks the name. A1's bedroom at
    night: the frame's mean 103.6 → 5.0 → 103.6.
  - *Driving from above* (`World/BirdView.js`, `Camera.js`,
    `Vehicle/CarLights.js`, `shared/drive.js`; `driving.md`; README):
    - F, or a click or tap on a car, gets in, and the view stays;
    - B and V go behind the car and back mid-drive;
    - the view follows the car over all the ground it can drive on
      (Ladonia's whole 640 m terrain, at whose edge a car now stops), and
      on after the visitor gets out until they are back by the house;
    - the publish samples the view from out there too (`driveViewpoints`:
      642 more bird's-eye samples, about 2 s);
    - the car's lamps are the bake's pool, with no shadow pass.

    Standing by the BMW 9.0–9.2 ms a frame (9.2–9.3 before), driving a
    median 4.4. Behind the car nothing changed: a scripted drive is the
    same byte for byte.
  - *What the visitor acts on* (`World/Interactables.js`,
    `shared/interact.js`; `picker-and-keys.md`):
    - one picker behind the crosshair, the prompt, E and F, with seats,
      taps, showers, a TV and windows as providers, each with its reach,
      priority, touch icon and key;
    - one list of keys (`KEYS`: the clash test, and the scopes of the
      hints; the hints' words are written in `index.html`);
    - a touch button for drawers and cupboard doors;
    - the visitor's clips bound by name;
    - `colliders.register` for what collides outside the trees;
    - `interactables.busy()` asked by Pace.

    With nothing aimed at, E opens the nearest door on the visitor's own
    floor only: over Ladonia's rooms it had been another floor's at
    7,047 of 15,235 spots.
  - *Sitting* (`World/Seats.js`, `Player.sit`/`stand`, `sitPlan`,
    `risePlan`, `walkPlan`, `seatPose`; `Utils/fitClip.js`;
    `sitting-and-tv.md`; README, Sitting):
    - E on any of Ladonia's 219 seats; from above, a click on a seat, or
      E by one in sight.
    - The people's Sitting Idle is fitted to both avatars. Low seats are
      sat on as a person would (`Seats.wayOf`): reclined on the outdoor
      lounge chairs, knees opened on the low sofa and the poufs.
    - Sitting down and getting up are by the clips (Stand To Sit, Sit To
      Stand) only where the walk there, the turn and the body at eight
      moments meet nothing but the seat's own piece. Else on foot: the
      figure walks to where it stands at the seat, round what is in the
      way, turns, and sits down where it stands; it stands up, turns and
      walks back to where the visitor stood, or to the nearest free spot
      with a clear way. Never faster than a walk, never sideways.
    - From afar, it walks there where the way is clear and ≤ 6 m, else it
      fades out and in beside the seat (0.3 s each, dithered, cut only at
      opacity 0). Every fade ends in the very materials worn before.
    - It faces the seat's way, turned to a side only where that meets
      nothing at all, its own chair's back and shell included: one pouf,
      for the female figure.
    - Others see all of it.
  - *The televisions* (`World/Screens.js`, `screens.json`,
    `public/media/earth-tv.mp4`, NASA, public domain): twelve sets, a 40 s
    loop of the Earth from the ISS, without sound, loaded at the first
    switch-on, its brightness divided by the exposure, so that it reads as
    a screen by day, at night, from above and in the live room alike.
    Seated before one, E switches it and the view turns onto it.
  - *Every front opens* (`blender/lib/ladonia.py`, `joinery.py`,
    `geometry.py`; README, Doors and drawers; `opening-parts.md`,
    `../build-property-space/furniture-catalogue.md`,
    `../build-property-space/furniture-data.md`):
    - what opens: Ladonia's 13 kitchens, 4 counters, the peninsula and the
      outdoor kitchens; its wardrobes, nightstands, sideboards, cabinet,
      media wall and TV-wall closets; the washing machines and the corner
      showers. 475 parts, each named for the prompt ("Open fridge"); the
      fridges integrated, with a light;
    - every part swept against its piece and against the scene;
    - the catalogue's sizes byte for byte the same, and the televisions'
      glass where it was;
    - water, control and steam anchors on every wet piece.
  - *The app side* (`World/Openables.js`, `Openable.plan`,
    `SceneBuilder.collisionOf`, `Publish/Runtime.js`):
    - a hinge about any axis, and a part's label;
    - a piece with parts collides as its body and a shut box a part, a
      shower's door barring the way only while shut. The L and U kitchens
      can be walked into, no carcass entered, and the editor's tree is what
      a publish collides (971,018 triangles each);
    - a part opens only until it meets something: 32 of 475 in Ladonia;
      a publish carries each part's `reach`.
  - *Windows that open* (`World/Sash.js`; README and `windows.md`): 59
    sashes in 45 windows turn in, or tilt where something stands in the
    way (18). An invisible pane in each opening;
    a window's `opens` field and the editor's *Opening* selector.
  - *Running water and steam* (`World/Water.js`, `World/waterShaders.js`;
    README, Running water; `water.md`):
    - E on any of Ladonia's 70 taps, mixers, sinks and showers' valves, or
      standing in a shower;
    - streams, droplets, ripples, and rain ending on the visitor's head;
    - the 15 indoor showers hot: steam as a volume looked through, filling
      from the top, spilling into the room, the glass misting and
      clearing. The rest run cold.

    +0.73 ms at most at step 4, nothing while all is off.
  - *The pool, and swimming* (`World/Player/Swim.js`,
    `LandscapeBuilder.addPoolSteps`, `poolWater`; `shared/landscape.js`
    `poolSteps`; `blender/import_people.py` `AVATAR_AS`; README,
    Swimming; `swimming.md`, `pool-water.md`,
    `../space-people/avatar-clips.md`):
    - five steps across B's pool's south end, by the loungers (a small
      addition: the renders show a plain basin);
    - the water clear (`../build-property-space/light-and-look.md`, §7):
      the mosaic, the steps and a swimmer showing through, caustics by
      day, the pool lamp's glow at night, the sky
      mirrored at grazing angles; +0.05–0.2 ms of GPU over the milky
      water;
    - wading, then swimming by the visitor's clips: the frog kick at
      swimming pace, the breaststroke with Shift, treading water still;
    - the figure sits in the water by what shows of it at every moment of
      the clip — its clothes under, its eyes out — and is kept within the
      pool's box and off the steps, its feet off the floor and the treads;
    - out with Space at the edge, the climb fitted to the coping, or up
      the steps;
    - no diving.

    The pipeline cuts a stroke to a loop where its pose comes back round
    (the breaststroke's reach for the edge left out), takes out its
    travel and swims it heads-up; the climb keeps its travel.
  - *The jump-out bug* (`Collision.capsuleIntersect`'s `from`,
    `headroom`; `../walkthrough-editor/rays-and-collision.md`): running and
    jumping at 24 of 32 upstairs sill windows threw the visitor up through
    the wall and out. Now none, and walking, stairs, doors and cars are bit
    for bit as before.
  - *Speed* (`../app-testing-and-performance/speed-architecture.md`: what
    runs every frame; `../walkthrough-editor/stand-ins.md`):
    - the editor draws a piece with parts whole (A1's kitchen 1,138 → 910
      draws), holds still what its stand-ins draw and leaves it out of
      three's pass (1.6–1.9 ms a frame: at or under HEAD at A1's kitchen
      and living room, the upper U kitchen and in edit mode);
    - a public view merges the shut parts and sashes by look (21 meshes;
      A1's kitchen 1,499 → 1,056 draws), holds the Scene and the merged
      house still (three's walk had gone through all 5,876 objects every
      frame), hides the light targets and empty fixture holders, and hides
      a fridge's glass shelves behind its shut doors;
    - ProbeLight passes over what is at rest (3.2 → 0.3–0.5 ms with 475
      parts);
    - the fridges' light is one lent round, out of the scene until one is
      opened, its shaders and the shadow maps' built ahead.

    The user's 12 October version is 0.15–0.53 ms faster on this build
    than on HEAD. The new version costs +0.08 to +0.35 ms more than it at
    the same spots with no water running, +0.62 with a hot shower:
    `../app-testing-and-performance/speed-architecture.md`, What is left.
  - *The glass-door race*: in about one load in four the 20 glazed door
    leaves kept the outside look indoors (0.78, #4b545a); now always their
    own (0.62, #6a7f8a): `ProbeLight.dress` copies through `Sky.withoutGlaze`
    (`../baked-view-lighting/SKILL.md`, Pitfalls).
  - *Mended by the reviews, the integrators and the verifiers* — the
    general lessons are in the skills' Pitfalls (this skill's SKILL.md
    and the others'):
    - Stage 1:
      - in a public view every drawer of a turned piece slid into it or
        sideways (34 of 38; the loader turns the slide now, for every
        version published);
      - a door upstairs was opened, and named, through the ceiling;
      - the frame guard's `dispose` let go of half its events;
      - the editor's header toggle squeezed the floor picker at 1280 px.
    - Wave A:
      - from above, E sat the visitor through the party wall;
      - a visitor's `animation` that was not a string threw in everyone
        else's frame;
      - "Space Stand up" stayed after standing;
      - ld-cabinet's lamp took every press meant for its doors;
      - the 15 dark fridge lights cost 4–6 ms a frame.
    - Wave B:
      - a merged part's shaders were built in the frame it first opened
        (50–102 ms);
      - the water's programs were built for the load's lights only;
      - the water was drawn for the frame before's camera, and into the
        room probe's faces;
      - the orbit camera's boom shrank for good over the pool;
      - others saw a visitor on a low seat upright.
    - Wave C:
      - the frame after a fridge's light came in built the shadow maps'
        programs (35–43 ms; 0.7 s cold);
      - K drew a fridge's shelves behind its shut door;
      - a first timing within +0.5 ms of the 12 October version did not
        reproduce.
    - The clips passes:
      - a change of clip during a fade popped (bones 0.25–0.55 m);
      - a turn jolted the swimmer's head 7–10 cm;
      - getting up was a glide at up to 14 m/s through the table;
      - a seat clicked from afar cut the figure 3.8–4.6 m in a frame;
      - the climb's first frame snapped 0.25–0.46 m;
      - the feet went 0.07–0.24 m into the pool's floor;
      - a page's first fade, Space the next frame, left the figure at
        0.991 opacity for good.
  - *Tried and taken out again* (the third clips pass's; the fourth
    reverted them from copies kept before it,
    `../app-testing-and-performance/parallel-lanes.md`):
    - turning a chair's sitter to a side where every way met something:
      67–71 seats a run sat into their own chair's back or shell, unseen
      by a sweep that counted the whole chair as the seat's own;
    - walking the way that met least where no way is clear: deeper at more
      seats than it helped;
    - playing others' figures by the sender's clock: still one frame,
      doubled the next.
  - **The user's own edits since** (the scene saved again 2026-10-17
    13:54Z, after the pool steps' patch; theirs, in the editor: keep
    them):
    - five dining chairs moved or turned (a-f011, a-f116, b-f117, b-f119,
      b-f120);
    - b-f011 scaled to 0.88.

    The seat sweep's starts and boxes (`ladonia-seat-starts.json`,
    `ladonia-w-boxes.json`) were taken before these edits: take them again
    before the next sweep.
  - **Still short**:
    - *The user's to decide*:
      - Ladonia must be published again and baked (the final bake about
        2 h) for the opening furniture, the windows, the water, the steps
        and swimming to reach its public view. Their `published/` still
        ends at 20261012T114849Z.
      - What the new version still costs over the 12 October one
        (`../app-testing-and-performance/speed-architecture.md`, What is
        left): cutting the part glass's passes changes its look,
        and a bake output for the shut parts is not built.
      - The live room keeps about 14 MB of its own after K off, so that K
        again builds nothing.
      - Their placements stop 32 of 475 parts short
        (§4.5: `../build-property-space/furnishing.md`, item 5):
        - A1's and B1's wall-unit doors and ld-media-ochre's top doors at
          the ceiling tracks' spots (a-f005, a-f038, b-f005, b-f041);
        - the L kitchens' cupboard door beside the under-counter fridge
          (`door2` of a-f069 / b-f072, at −47.7° and −45.7°) at dining
          chairs a-f073 / b-f076 (the fridge's own door opens fully);
        - the outdoor kitchens a-f171 / b-f174 at garden chairs;
        - wardrobes at nightstands 0.38–0.5 m before them;
        - the small vanities' drawers at the WC pans.

        `scenes/` was not touched for these.
      - At a tucked-in dining chair or a four-seat table (chairs 0.355 m
        under the top) no way of sitting is clear. The figure sits
        forward, its forearms, thighs and most often a foot (19–24 of the
        44 oak chairs, male) in the table's edge and base: seated depth
        median 0.19–0.29 m, at most 0.46 m. Accepted. Garden armchairs
        drawn up to their tables are the same.
      - Q switches the room stood in only, not the room an open-plan room
        runs into. It is the key marked A on AZERTY. Ladonia's terrace
        lamps are not in its bake, so Q on a terrace has nothing to
        switch in the public view. A1's bedroom switch stands behind its
        wardrobe and can be reached only by Q.
      - From above, the pedals count as moving for the follow, not speed.
        The view leads the car by about 2 m at 16 m/s, not the 4 it aims
        for. The keys are said once.
    - *Found, left*:
      - Sitting:
        - getting up while the figure is still walking to a seat slides it
          to the stand spot at 0.10–0.155 m a frame, seen whole;
        - a second seat clicked within about 0.1 s of Space during a
          fade-back draws the figure whole at 0.99 opacity 6 m away, then
          fades it out there;
        - K taking the figure mid-fade draws it whole for one frame;
        - the prelude's cut frame is at ≤ 0.009 opacity, not 0;
        - the walks meet something at 85–111 of 214 seats: tables 49–65,
          the next seat 15–29, a wall or door 4–8 (the pouf c-f103's leg
          0.39 m into a wall);
        - Sitting Idle hangs the feet 3–5 cm on 0.49 m chairs;
        - on the 37 cm lounge the toes go 4 cm under the floor for a
          moment as the figure sits and gets up;
        - the female figure reclines with the male's clip (the women's is
          `LEFT_OUT`);
        - seated sideways (the pouf), the television "in front" is the
          seat's own facing's.
      - Others' figures:
        - a remote page sees the fade from afar as a cut;
        - a receiving tab whose messages bunch or stall (hidden: 10–15
          places a second, stalls of 0.3–2.7 s) sees a remote swimmer's
          eyes 0.46–0.66 m under at ordinary stroke changes;
        - a remote climb runs about 40 frames ahead of the sender's and
          stands still 21–22 frames, held at its start and its end.
      - Swimming:
        - the breaststroke swum heads-up is steeper in the water than a
          real one (the female's at 65°);
        - the sleeves of a stroke's arms come over the water, as a
          swimmer's arms do;
        - B's west side, lined with loungers, offers climbing out only at
          its ends;
        - the deck and the house are not truly mirrored in the water, and a
          swimmer near the surface reads a little too turquoise;
        - the water's light, fully baked, is an estimate;
        - the water's two programs build the first time the pool is seen.
      - Water and steam:
        - the steam cannot see the depth of what is inside its box;
        - N8AO darkens it a little before a dark corner;
        - the rain ends at the top of the head, so none is seen falling
          past a first-person eye;
        - the water's meshes carry a `raycast` of their own, which the
          stand-ins' notes warn against.
      - Furniture:
        - the walker (0.7 m) does not fit a corner shower's 0.6 m door;
        - there is no freezer door anywhere;
        - re-exports are not byte-reproducible (`bake.py` seeds by
          `hash()`);
        - a public view's colliders draw a piece's part boxes in its mesh
          colour;
        - a piece with parts placed at a scale other than 1 slides its
          drawers differently in the two views (none is so today).
      - Televisions: a set lights nothing round it, and from above at
        night A1's cabinet spots' bloom lies over its picture.
      - The camera: the third-person boom ignores door leaves and passes
        through people.
      - Driving: the car's nose hangs over the terrain's edge (its middle
        is the probe); going to a room or the spawn while driving is
        undone the next frame.
      - Where the visitor is: on `c-stair-n`/`s` the readout goes hall →
        stair room → hall on the way up; the nearest door is still the
        nearest across the floor, through a wall too (A2's bedroom by
        A1's bathroom opens A1's bathroom door).
      - The ground: a hairline crack shows along the edge of Ladonia's
        1 m terrain grid (x 76, z 78 / −62).
      - The colliders: in a public view under post-processing a collider
        shows through what collides with nothing over it (a pergola's
        slats, a car's body); the editor's region is gathered again in one
        go, 8–12 ms every 5 m walked.
      - First draws:
        - a lamp's lens or halo shown for the first time is a frame of
          29–45 ms;
        - on a first visit, walking into a room not yet seen builds its
          programs in the frame (A1's kitchen: 26–30 programs, a frame of
          2.7–3.0 s simulated) — three's way, as before;
        - the fridges' light's shaders are built at load whether or not a
          fridge is opened (about 70 programs, 2.4–2.6 s paced, no frame
          over 50 ms).
      - A public view draws 6–54 more calls at the pool and seated with
        the TV than the report before: cause not found.
    - *Unseen*: a real phone (the mobile preset only), a visible tab at
      the display's rate, another GPU, two visitors but through two
      hidden tabs.
    - *Left for the user*: `npm run build` and a reload of every open tab —
      their server has none of it until then; a publish and a bake
      (above); a commit when they ask. The Mixamo downloads and the
      converted `avatar-clips` files stay out of git (`.gitignore`).

## 2026-10-17 — the user's file given the pool's steps (the record)

**The user's file was patched on 2026-10-17** (02:58 UTC, after wave
C's integration): their server on :3000 not running (`lsof -nP
-iTCP:3000 -sTCP:LISTEN`), the file's md5 that of their last save
(1d136acd…), a dry run first (487,210 → 487,320 bytes; `b-pool.steps`
null → `{ side: "z1", count: 5, going: 0.35 }`), then `--backup` to the
session's snapshots: the file as it was is
`~/.claude/projects/-Users-antonido-Code-per-3d-visualizations/b21f0e85-4473-429a-a7ab-8e09ce77cd35/snapshots/scene-backups/kosinozici-villas.2026-10-17T02-58-24-844Z.json`
(the tool prints the `cp` that restores it). They have edited the scene
since (its `updated_at` 2026-10-17T13:54, pieces nudged): never restore
that copy over it.

The tool was `patch-pool-steps.mjs`, then in build-property-space's
folder, now in this one (SKILL.md, Tools). The standing rule it leaves —
never reseed the user's scene, patch only the field needed with a tool
that backs up to the session's `snapshots/scene-backups/`, and never
restore that backup over their later edits — is in `CLAUDE.md` and
`../build-property-space/scene-safety.md`.

## When the old app-notes sections of this skill were written

- "What the visitor acts on" — 2026-10-16 (stage 1, with the colliders
  drawn); and so is driving from above in "The bird's-eye view".
- "Windows that open" and "Sitting and the televisions" — wave A,
  2026-10-16.
- "Running water and steam" and "Swimming and the pool's steps" — wave B,
  2026-10-16, with wave B's furniture parts that stop where something is
  in their way ("Doors").
- "The pool's water" — wave C, 2026-10-16.
- The usability work's in-page kit was brought into the skill's folder on
  2026-10-17 (now `../app-testing-and-performance/`).

## Superseded values

- The pool's water until wave C of 2026-10-16: an opaque milky turquoise,
  `MeshPhysicalMaterial` at opacity 0.78, which hid the new steps in every
  realistic view (now clear, two passes: `pool-water.md`); its roughness
  was 0.04 (the studio's softboxes mirrored), now 0.12.
- `node scripts/test-interact.mjs`: 44 cases before the nearest door's
  floor was added, then 51 (2026-10-16; 51 again on 2026-10-17).
- `node scripts/test-seats.mjs`: 33 at first, 39 since the third clips
  pass (2026-10-17).
- The look ray and prompt before wave A's providers: 0.047–0.095 ms a call
  on both builds; 0.094–0.107 ms (editor) and 0.050–0.076 (public) with
  the windows, seats and TVs registered (`picker-and-keys.md`, What it
  costs).
- `Player.update` treading at the pool's edge: 0.35–0.40 ms before the
  climb-out offer was cached, 0.21–0.23 after (`swimming.md`, Measured).

# History: how a public view is lit and drawn

The dated entries of the old Corrections log (build-property-space's
SKILL.md until 2026-10-18) that are about the public view's light — its
modes, the bake drawn as one lightmap over one merged house, the meter,
the live room (K), the guard, the view from above — newest first, and the
dated notes of the sections this skill took over. Their lessons are in
SKILL.md and the topic files already; read an entry for what the user
asked, in their words, and for what was left short, which is a gap not
to repeat. Add a dated entry here whenever the user says something about
a published view is wrong, or something is found worth doing otherwise.

An older note that cites "app-notes.md, <section>" or "SKILL.md §n" —
the map from those to the seven skills' files is the skills' index,
[../README.md](../README.md), Older names. Until 2026-10-12 the seven
app-notes sections from "Publishing" to "Measuring" were one,
"Publishing, the public view and baking", now split between
[../publish-and-bake/](../publish-and-bake/SKILL.md) and this skill.

## The sections' own dates

- "Live room light" (live-room.md, live-room-bake-light.md,
  live-room-measured.md) was written again on 2026-10-13 for the rooms
  drawn unbaked: a note from before that describes lamps lit over the
  bake describes something that is gone, code and all (`roomLampGLSL.js`,
  `roomTwin`, `setRoomLive`, `FITTING`, `ProbeLight.lampRoots`,
  `Switches.loadBounce`, every `?roomlight=` word but `on` and `off`). It
  was rewritten again on 2026-10-15 for the bake's own light.
- Wave B (2026-10-16) merged a public view's shut parts ("How a baked
  view is drawn": merged-house.md, ShutBatcher) and left nothing of the
  live room drawn or run after K off (live-room.md).
- Wave C (2026-10-16) wrote "What runs every frame, and what doesn't" in
  "How a baked view is drawn" — now
  [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md),
  its glass-door race baked-drawing.md — and took the shut parts to one
  merged mesh a look (21, not 68).

## Entries

- **2026-10-16/17** — The usability work (opening furniture, windows,
  sitting, water, swimming, driving from above); its record is
  [../visitor-interactions/history.md](../visitor-interactions/history.md).
  What of it is this skill's:
  - *The glass-door race*: `ProbeLight.dress` now copies through
    `Sky.withoutGlaze`; in about one load in four all 20 of Ladonia's
    glazed leaves had kept 0.78, #4b545a indoors for the visit — now
    always 0.62, #6a7f8a (baked-drawing.md; `glass-race.js`).
  - *The frame guard's `dispose`* let go of only the first four of the
    world's events it settles on: they are now one list, `SETTLE_ON`, read
    by both `bind` and `dispose` (frame-guard.md); the guard was told of
    `"interact"`, `"vehicle"`, `"room-lights"` and `"colliders"`.
  - *Still short, of this skill's*: K keeps about 14 MB after it is
    switched off (live-room.md, After K off: on purpose, so that K again
    builds nothing); Q on a terrace has nothing to switch in the public
    view, Ladonia's 11 terrace lamps not being in its bake.
  - *Measured* (verifyC, 2026-10-17): the new version over the 12 Oct one
    within the +0.5 ms aimed at wherever no water runs —
    [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md).

- **2026-10-15** — Ladonia and Wrenfield; the live room (**K**). The
  user: "in the public view, in the live light mode for
  the room, when its nighttime and the lights are off, the room is still
  clearly visible, just like in the editor mode, but it should be dark,
  like the baked version", then "Make sure that in the editor mode it
  stays as it is currently, only change the published view". Later the
  same day: "There is a significant difference between baked light and
  live light in the view mode. The baked light is more yellow and warmer
  and live light is more white/blue, and also fewer shadows appear with
  the live light. Make the live lights ambience look as similar as
  possible to the baked one" — the materials to stay the true ones. →
  Builders, verifiers and fixers in rounds, built into the scratch folder
  and compared with the user's build room by room: each room's own
  pixels, baked | K before | K now. Nothing published or committed.
  Lessons folded into the method then (§7, §10b.6 and §12 — now this
  skill's SKILL.md and ../publish-and-bake/SKILL.md, checking the
  published view; the drawing is live-room-bake-light.md, the figures
  live-room-measured.md).
  - *Dark at night* (`LiveRoom.measure`, RoomGlow's `shares`): as far as
    a room's own lamps are off, its light that is not theirs is what its
    bake measured. That is its probes' six ways, raised to its lightmap's
    figure, no longer the unbaked view's share of the dusk. Villa A's 32
    rooms with every lamp off went from 24–122 levels to 0–0.5 in 25 of
    them; lamplit rooms are as before. This is now the fallback for a bake
    that cannot give its own light (below).
  - *In the bake's own light* (`World/RoomBakeLight.js`, with a second
    `LightResolver` holding the light without the sun's straight light):
    - the surfaces keep their materials and take their light from round
      about from the bake alone;
    - only the sun and the nearest lamps are live, each as strong as the
      bake's probes measured it, and shading as softly as the bake's lamp
      is big;
    - the exposure is the baked view's own meter's, clear glass is
      reflections only, and a sheer curtain is the baked view's own.

    Nine of Ladonia's rooms, mean difference from the baked frame, K
    before → now:
    - at night with the default lamps: 13.1 → 3.0 levels, warmth 0.086 →
      0.014;
    - by day with the lamps off: 38.9 → 8.6;
    - by day with every lamp on: 40.2 → 2.8;
    - Wrenfield's four rooms: 13.7–69.2 → 0.0–4.9.

    Standing +2.0–3.4 ms over the bake (K before +3.0–4.2), and 0.7–1.0
    ms more with a curtain in sight. The editor, the unbaked publish and a
    visit that never presses K are byte for byte the user's build's.
  - **Still short**:
    - a switch with more lights than the step's shadowed lamps (Ladonia's
      living rooms) is all the bake's, with no moving shadow;
    - door leaves are their true oak, where the baked view draws them
      nearly white;
    - by day a window's frame and pane, and a mirror or a washer, are the
      room's, not the baked view's white sky and studio (A1's windowless
      bathroom with its light off is black, for the bake's 45);
    - the indoor sky's light is upside down (`Sky.indoorLight`; found, not
      changed: mending it changes every view lit live);
    - not seen in a visible tab, at steps 2–3, or with two visitors.

- **2026-10-13** — Two requests, worked from the evening of 2026-10-12
  to the 14th. The user, on seeing K light a room's lamps live over its
  bake: "The live lights with K should completely transform the room into
  the same version that we see in the editor, without the bake, so the
  room should have a rendered geometries with their own materials
  rendered as it were the editor view, so not switch from baked to live
  lights, but also remove the baked textures and replace with actual
  ones". The second request, on the performance work's list of what was
  left in the editor ("Do the edit mode suggestions that were left to
  do"), is in [../walkthrough-editor/history.md](../walkthrough-editor/history.md).
  → For each, builders, a measurer, reviews and a fixer; every figure
  this M4 Pro's, its pane hidden, the build before against the new one in
  one sitting ([../app-testing-and-performance/measuring.md](../app-testing-and-performance/measuring.md)).
  - *K draws rooms unbaked* (`World/LiveRoom.js`, `World/RoomLight.js`;
    live-room.md; since 2026-10-15 lit by the bake's
    own light where the bake allows, the entry above): the room the visitor is in, the
    rooms that always stand open to it, and every room seen from there
    through a door that is open or has glass in it, or a stairwell — their
    own materials, the sun through the windows with its shadows, the sky,
    their lamps, their glass, what moves in them, the frames and reveals
    of their openings, a flight of stairs with the room it starts in —
    and nothing of the bake on them. Every other room, the garden and the
    view from above stay baked. A room is made ready a little a frame
    before it is shown — the one behind a shut door as the door is
    neared — so that walking on changes nothing in view; K off is the
    bake's again to the pixel; the lamps-over-the-bake version's code is
    gone. Against the unbaked view: 50 of 57 poses by day within 1.5
    levels, night within 0.2; through open doors 0 px of baked room in 14
    of 16 stills. It costs +1.7 to +3.7 ms a frame standing with the
    doors shut, +3.0 to +4.2 with a door open to the next room; a 19.5 s
    walk through four rooms, three doors opened, 14.3 → 17.3 ms median,
    17–22 of 1,168 frames over 25 ms, none over 50. K never pressed, the
    view is the build before's: 28 of 28 pictures identical to the pixel.
    These figures are superseded for K as it is drawn today (the bake's
    own light, 2026-10-15: +2.0–3.4 ms standing; live-room-measured.md);
    they stand for the fallback path, a bake without its light apart.
  - *What the reviews found of K, mended on the 14th* (with the editor's,
    in [../walkthrough-editor/history.md](../walkthrough-editor/history.md)):
    a room walked into from out of doors was 76 levels too bright — not
    the lamp the review named, but a dash of twelve texels of the sun in a
    pane across the garden, in the room's probe — and then 13–19 too dark
    (its probe taken through its own windows as seen from outside); the
    upper half of a flight of stairs was the bake's until the bathroom
    under it was opened; the façade above and below every window was
    drawn live (live-room.md: the room probe, frames and reveals, ways).
    The work was built into the scratch folder and tested on servers of
    its own, the user's server and `dist/` untouched — now
    [../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)'s
    rule.
  - **Still short** (K's; the editor's are in
    [../walkthrough-editor/history.md](../walkthrough-editor/history.md)):
    - *K*: a room come into from out of doors is the bake's until its
      visitor is in it, and changes in one frame; day and night, the
      slider and the view from above send the live rooms back to the bake
      for 8–43 frames; what is seen out of a window or a door to the
      garden, and the villa across it, is the bake's (out of an open
      terrace door a fifth of the frame is over 8 levels from the unbaked
      view's); a glazed entry door is darker live than unbaked (6–7% of a
      frame over 8 levels, final measurement); by day stairwells
      are 10–22 levels over the editor and some rooms evenly 5–9 off,
      cause not found; a first K on shaders the browser has never built
      is five to six seconds in coming, thirty frames of it 60–160 ms;
      beyond eight groups of rooms a room in sight is the bake's.
    - *Left for the user* then, for K: Wrenfield's bake of 2026-10-01
      baked again, for its doorways' reveals beside a live room; villa
      C's first-floor hall has a wall's end baked black (the bake's
      zoning, K or no K). Both still open (live-room.md, Still short;
      [../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md)).

- **2026-10-12** — Performance of the editor and the public view, Ladonia
  and Wrenfield (the work of 2026-10-10 to 12). The user asked for the
  highest frame rate in the editor and in the public view with the most
  realism kept, the public view fully baked by default, and to "test out
  multiple variants of optimization techniques, including quality of
  renders for both the interior and exterior". → Five stages of builders,
  measurers and reviewers, every change timed against the committed code
  in a frozen copy (../app-testing-and-performance/measuring.md; the five
  stages' timing record is ../app-testing-and-performance/history.md).
  The entry is this skill's, its main topic how the public view is drawn
  by default; the editor's part of it (the plain light, the view's
  scope) is pointed to from ../walkthrough-editor/history.md. Decided, and why:
  - *The editor opens under a plain light, with the houses alone*
    (`World/PlainLight.js`, `World/Scope.js`): most of its frame was the
    sun's shadow map, ten to twenty-five lights in every shader, the
    post-processing and the garden, none of which helps place a sofa. The
    look is a key away (**P**), and a publish takes the scene lit
    realistically whatever is on screen. Ladonia: edit mode 45–48 ms a
    frame → 18–22, a view of one room 24.5 → 6.6, walking a room 32.6 → 9.8,
    opening 6.4–8.2 s → 4.3–4.5; Wrenfield 14–15 → 5.
  - *A baked version is drawn from its bake on every device*: "baked" at
    steps 2–4, "static" at 0–1 and on phones. The whole house lit live —
    what a computer was given — is a link's alone now: it cost 25–64 ms a
    frame on Ladonia, more whenever something moved. The bird's-eye view
    is the bake's always (at night 49–65 ms → 11–15).
  - *One lightmap, one house*: the switches' and the doors' light is
    resolved into a single lightmap on the GPU when one changes
    (`World/LightResolver.js`), and the rooms' meshes merged
    (`World/HouseMerger.js`: 3,952 → 670). The frame was draw calls and
    material variants, not triangles.
  - *What is live is the visitor's to ask for and the view's to take
    back*: the one room they stand in (**K**, `World/RoomLight.js` — at
    first its lamps' light over the bake, +0.5–1 ms; since the same
    evening the rooms drawn unbaked, `World/LiveRoom.js`: the entry
    above, 2026-10-13); a guard that lightens a view fallen
    under 28 frames a second (`FrameGuard.js`); a ceiling at the device's
    rated step and a pixel budget a step.
  - *Rooms daylight does not reach start the day lit*
    (`shared/daylight.js`), and at night a lamplit room is metered as a
    daylit one is: drawn from their bake those rooms were black by day,
    and a lamplit room at night a quarter darker than under the old live
    lamps (mean level 62–84; 86–101 now, the old live lamps' 77–107).
  - *The bake's blotches were its encoding, not its samples* (sixteen
    variants of Wrenfield): one scale for the whole atlas left a room
    14–20 of 255 levels and the lossy WebP erred in blocks. Each room's
    part is now written by a curve of its own. 512 samples at 4096 stays
    the final: 128 leaves mottle indoors by day, 2048 samples buy little
    for four times the sampling, a 2048 atlas loses strips, sun-patch
    edges and contact shade; out of doors 32 samples would do. Strips
    under three texels are lit through their vertices, doorway faces cut
    along the wall's middle and given to the room they are seen from, the
    garden's lamps are in the night's bake, and the scene is handed to
    Cycles 148 times a bake, not 352 (Wrenfield 34.9 min → 28).

  Ladonia baked at step 4, this Mac: 25–44 ms a frame → 13–17 (the living
  room 39 → 79 a second, the pool 23 → 59), at night 39–64 → 13–17; step
  0, 10–22 → 4–8; a 5 s walk indoors, every frame over 25 ms → none;
  Wrenfield 7.7–10.5 → 4.7–5.9. Unbaked, ×1.6–2.4 at night and ×1.1–1.5 by
  day. Also folded in: §7, §10, §10b, §12 and §13 here; `app-notes.md`
  split into sections of its own for what a visitor is given, how a baked
  view is drawn and exposed, live room light, baking and measuring;
  `reference.md`'s lists of the view's links, keys, steps, options and
  manifest [then build-property-space's SKILL.md, app-notes.md and
  reference.md; since 2026-10-18 split across the seven skills — this
  skill's lighting-modes.md, resolved-lightmap.md, merged-house.md,
  baked-drawing.md, light-meter.md, live-room*.md, quality-steps.md and
  links-and-handles.md among them]; the in-page helpers ask for the preview or the scope they
  need. **Still short:**
  - *Unmeasured*: no phone, no touch device, no integrated or slow GPU —
    every figure is one M4 Pro's, its pane hidden, the render timed to a
    pixel; nothing was watched in a visible tab at the display's rate.
    The guard has never judged real frames, and its thresholds are a
    judgement; what a low-rated device is given was seen only through
    `?rated=` and `?quality=`. No Safari or Firefox; loads on localhost
    only; a lost graphics context only by `WEBGL_lose_context`.
  - *Not baked again* (as this was written; the user published and baked
    Ladonia afresh that same day — 20261012T114849Z, with its twelve
    people — so its plain link is drawn from a bake of this code):
    neither published bake. Ladonia's (20261004T152226Z) still has the
    black doorway bands and strips, no garden lamps in its night, the
    tinted blocks in dim rooms and no people; and the latest published
    version of both spaces is an unbaked one, so the user's plain links
    draw lit live. Wrenfield is half an hour to publish and bake —
    still so, and theirs to ask for.
  - *Went back, and was mended the same day*: the lamps that now start
    lit by day had put the lamp pool into every material of the unbaked
    view and the editor's preview by day (3–7 ms a frame) and made a baked
    Ladonia wait for 86 switch-layer files before its first frame (0.35 s);
    the pool now joins the light only while a lit fitting is in sight, and
    the first frame waits only for switches seen from the start (verified
    against the old build: back at the mid-way figures, 17.2 / 24.7 /
    20.6 ms unbaked by day, drawn and walkable at 3.15 s). Left: a first
    night's one long frame is 40–75 ms longer than mid-way (cause not
    found; it is still half the committed code's); at an indoor start the
    first lit frame draws door leaves wrongly until the sun's mask and the
    doors' atlas land a frame to 0.6 s later (behind the preloader, by the
    code — not watched in a visible tab); the lamp's light on a shut
    door's threshold goes out in one frame 3 s after the door shuts.
  - *The look*: a lamplit room at night is still a shade under the
    unbaked view's (86–101 for 109–125); the garden through a window from
    a lamplit room is up to twice as bright as from outside; steps 0–1
    expose every room alike, and brighter (140–152 for 105–111); the live
    room lamp's shades read dull and the ring of light round a recessed
    fitting is gone from its ceiling (of the lamps drawn over the bake,
    gone since: 2026-10-13, above); door leaves, lit a side at a time,
    differ from every earlier frame (a glazed leaf pale grey-blue in a lit
    room at night); mirrors and metals reflect a studio, pale by day and
    black at night; a room without daylight is black from above with its
    light off; rooms with a small or blinded window (Ladonia's twin
    bedrooms) start unlit and dim.
  - *Unfinished*: the measuring tools were left in the scratch folder,
    which a restart empties; the editor's house is not merged and its
    selection outline draws the scene a second time (both done since:
    2026-10-13, ../walkthrough-editor/history.md); what the preview allocates
    (the 8192 shadow map) and the garden once made are kept until a
    reload; face zoning does not cut at floors and ceilings; switches are
    still baked one to a pass (lit together their light changed); the
    ambient occlusion is still drawn over a bake (4–5 ms: kept for the
    look, the user's call); window panes are not merged (about 500 draws
    out of doors); the cars' textures and the trees' and grass's reach
    were left as they were.
  - *Not tried*: people in a baked view or in a room lit live (no baked
    version had any; Ladonia's of that day has, and the live room was
    measured on it); a version published "Always high"; Ashgrove (it has
    no published version); a whole bake of Ladonia with this code (only
    cut-down night bakes of it were run, for the garden's lamps).
  Pointers for the rest of that entry's Still short: what was not
  measured (no phone, touch device, integrated GPU, Safari or Firefox;
  the guard never judged real frames; a lost context only by
  `WEBGL_lose_context`) is the testing skill's standing caveat
  ([../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md));
  the measuring tools left in the scratch folder have since been brought
  into ../app-testing-and-performance/; what was not baked again
  (Ladonia's 20261004T152226Z faults, the user's own bake 20261012T114849Z
  with its twelve people, Wrenfield's half an hour theirs to ask for) is
  [../publish-and-bake/history.md](../publish-and-bake/history.md)'s; the
  preview's 8192 shadow map and the garden kept until a reload are
  [../walkthrough-editor/history.md](../walkthrough-editor/history.md)'s.

- **2026-10-05** — Live switching in the editor and the "Lit live"
  publish: [../walkthrough-editor/history.md](../walkthrough-editor/history.md).
  This skill's in it: two-sided sight for switching through ceilings;
  window reveals in `render_khaki` take the outdoor share; the night lit
  live exposed at 1.1 against the day's 0.85, the user's judgement.
- **2026-10-04/05** — The review's faults fixed and the bake run
  ([../publish-and-bake/history.md](../publish-and-bake/history.md)).
  This skill's in it: the baked view sets the sky before the bake's light
  (resolved-lightmap.md, the first bullet); interiors metered by Realism's
  `LightMeter` (light-meter.md); the glass and metal shaders made through
  `Material.clone` fixed.

## Superseded figures, and what they were of

Kept here so that an old note's number can be placed. Each still stands
in its topic file beside the figure that replaced it.

- K standing over the bake: +0.5–1 ms (2026-10-12, the lamps over the
  bake, `World/RoomLight.js`, gone) → +1.7 to +3.7 with the doors shut,
  +3.0–4.2 with a door open (2026-10-13/14, the rooms drawn unbaked; now
  the fallback path) → +2.0–3.4 (2026-10-15, the bake's own light), and
  0.7–1.0 ms more with a curtain in sight.
- K's walk: 14.3 → 17.3 ms median over the bake (2026-10-14, drawn
  unbaked); 21.6 ms median at night through six rooms at 2560 × 1440
  (2026-10-15, K before 21.9).
- K's first press at night on a fresh load: 2.7 s (drawn unbaked) →
  1.75 s (the bake's own light). The night's-share build of the same day
  (the six ways and the lightmap's measure) was lit after 2.9 s where the
  build before it took 1.9 (the lightmap's read 274–416 ms of it).
- The guard's "room lit live" rung: 13.1/13.3 ms in Ladonia's living room
  at night was the lamps over the bake of 2026-10-12 (frame-guard.md).
- The bird's-eye indoor gain: 18.5, 18.3 and 25.2 by floor while the
  rooms without daylight still counted → 17.4, 17.9 and 24.4.
- A lamplit room at night, drawn from its bake: mean level 62–84 → 86–101
  metered (the old live lamps 77–107, the unbaked view 109–125).
- Every lamp drawn live by K at 0.5 of its watts over 4π, the first
  measure (made on pixels) → each as strong as the bake's probes measured
  it (2026-10-15's second fix; live-room-bake-light.md, the lamps).

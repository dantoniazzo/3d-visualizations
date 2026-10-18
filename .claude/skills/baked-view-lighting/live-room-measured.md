# Live room light (K): measured, and how to measure it

Every figure taken of K (M4 Pro, step 4, 2560 × 1440, the pane hidden
unless it says otherwise), and how to compare it with a reference
without being fooled. What K is and how it is drawn:
[live-room.md](live-room.md), [live-room-bake-light.md](live-room-bake-light.md).

Two parts measure K as it was drawn before 2026-10-15 — its rooms lit
by the unbaked view's light, which is today only the fallback for a
bake that cannot give its own light apart, `?lightmap=rooms` or
`?merge=off`: *What it costs* (2026-10-14) and *Against the unbaked
view* (2026-10-12/14). They are marked so below. The figures to quote
for K today are *In the bake's own light* and its review fixes.

- **Measured** (M4 Pro, step 4, 2560 × 1440, the pane hidden):
  - *In the bake's own light* (2026-10-15; Ladonia's bake 20261012T114849Z
    and Wrenfield's 20261001T143211Z; frames at 1280 × 720, the people
    hidden but in A3's living room, the wind still; each room's own pixels
    by the mask of where each pixel's nearest surface is, K off; baked |
    K before (the user's build, :3117) | K now). Warmth is the mean over
    the room of (R − B)/(R + G + B) and of G − B; shade the share of the
    room's pixels under a fifth of its mean. The mean difference from the
    baked frame, before → now, over nine of Ladonia's rooms (A1's living
    room with its kitchen, hall, bedroom 2 and bathroom, A3's bedroom and
    its living room with a woman on the sofa, A2's glazed living room, the
    north first-floor living room, the south first-floor bedroom 1):
    - night, the default lamps: level 13.1 → 3.0, (R−B)/sum 0.086 → 0.014,
      G−B 13.3 → 0.9, the same blurred over 32 px 0.086 → 0.011, shade
      3.4 → 1.3 points. E.g. A1's bedroom 2 101.6 | 111.4 | 100.6 and
      0.254 | 0.139 | 0.253; A1's bathroom 93.3 | 127.9 | 95.4.
    - night, every lamp off: level 3.4 → 0.8 (A2's living room 19.5 |
      12.6 | 21.3, A3's 19.1 | 8.6 | 19.0, A1's hall 6.5 | 1.0 | 6.7; the
      rest 0–4 in all three).
    - day, lamps off: level 38.9 → 8.6, (R−B)/sum 0.062 → 0.042, G−B 5.4
      → 0.6, shade 11.3 → 8.5; but for the windowless bathroom and the
      north living room's two door leaves (below), within 0.9–1.9 levels
      in six rooms and 10 under in A2's glazed living room, (R−B)/sum
      within 0.023 (before: +19 to +42 levels, 0.03–0.11 less warm).
    - day, every lamp on: level 40.2 → 2.8, (R−B)/sum 0.100 → 0.019, G−B
      7.3 → 0.8, shade 2.4 → 0.7.
    - Wrenfield's living room, kitchen, first bedroom and bathroom: night
      lamps on 40.0 → 4.9 levels, 0.096 → 0.018; off 0.2 → 0.0; day off
      13.7 → 1.3, 0.105 → 0.000; day all on 69.2 → 4.7, 0.047 → 0.015.
    - What still differs, and why: by day A1's windowless bathroom with its
      light off is black (1.6 for the bake's 45.1: the baked view's shower
      screen and chrome reflect a white studio at the meter's ×32); door
      leaves are their true oak, tan-pink, where the baked view draws them
      nearly white (its leaf takes the outdoor sky on top of its probes):
      the north living room's view 88.5 for 103.0, warmer; A2's glazed
      living room 95.6 for 105.8 by day; A1's living room at night a little
      less warm (0.141 for 0.163: its true white cabinets and glossy floor
      reflect the room); the live sun's and lamps' shadow edges are crisp
      where the bake's are soft (the lamps' soft since the fixes below).
    - Calibration of the lamps (live-room-bake-light.md, the lamps): with the pool's lights in and then
      out (every switch the bake's), A1's bedroom 2 at night 100.6 against
      102.1 (median pixel ratio 0.99), its bathroom 114.4 against 114.0.
    - A lamp turned off and on standing under it (A1's bedroom, night): 104
      → 2 over 15 frames and 2 → 135 over 30, every frame further than the
      last; after standing, 136.5 → 2 → 136.5 at the same exposure.
    - The fixes after its review (2026-10-15; the review's own rooms: ten
      of Ladonia's in villas A, B and C, four of Wrenfield's; baked | K as
      first built | K now):
      - A lamp turned off and on standing under it, K on: B's upper north
        bedroom at night 124.5 at ×0.85 → 0 → 155.4 at ×1.70 as first
        built, now 124.5 → 0 → 124.5 at ×0.85 throughout (the baked view
        130.2 → 0 → 130.2 at ×0.85); C1's living room 118.1 → 3.5 (×1.22)
        → 117.7 at ×0.85 (baked 115.8 → 3.9 at ×1.32 → 115.8); A3's twin
        bedroom by day 132.3 at ×1 → 99.6 at ×31.9 → 132.3 at ×1 (baked
        130.7 → 95.2 at ×29.7 → 130.7). A's north bathroom at night comes
        back at ×1.25 where it was shown at the bake's ×1.34 (104.2 →
        101.1): read again, its own frame, with the mirror reflecting the
        lit room, is brighter than the bake's.
      - Wrenfield: no console warning in sixteen showings of its rooms
        (seven at each before).
      - The lamps' shadows soft: A's north bathroom, the share of steps
        between neighbouring pixels of over 12 levels where the roof
        stair's box shades the wall, at night 4.20% | 5.99% | 4.35%, the
        tenth largest step 3.8 | 6.6 | 5.0 levels; C2's bathroom at night,
        the share of the room under a fifth of its mean (the shower head's
        disc) 2.8 | 6.5 | 1.7.
      - Metals at night: A's north bathroom's washer 52.7 | 9.0 | 79.3
        (the editor's look, K before: 81.9), the side of the frame with
        its mirror 83.2 | 85.3 | 140.3 (138.7), its tap 78.7 | 75.7 | 98.1
        (117.7); the room 92.5 | 92.2 | 104.2, (R−B)/sum 0.172 | 0.246 |
        0.183; C2's bathroom 99.4 | 98.7 | 103.0, 0.211 | 0.229 | 0.207.
      - Mean |difference from baked| over the ten rooms, first → now:
        night, the default lamps, level 2.6 → 4.1 (the two bathrooms
        above), (R−B)/sum 0.014 → 0.006, correlation 0.987 → 0.970; night
        off, day off and day all on the same to 0.1 level; Wrenfield's
        four conditions the same to 0.1.
    - Standing (render and a pixel back, median of 60, two rounds; the
      machine's load 3–4): K now over the bake +2.6 (A1's bedroom at night,
      two lamps live), +2.0 (A1's living room at night, one), +3.4 (A2's
      living room by day), +2.9 (A1's bedroom 2 by day) ms; K before in the
      other tab +3.3, +4.2, +3.8, +3.0.
    - A walk through A1's bedroom, hall, bathroom (its door opened), hall,
      living room and bedroom 2 (its door opened) at night, 645 frames:
      median 21.6 ms, p95 29.1, 58 over 25, 8 over 33, none over 50, the
      longest 42 (K before: 21.9, 26.9, 57, 2, 0, 37); no step of the
      frame's level over 8 but where the view turned. With the lamps' cubes
      of the whole house (before `lampCasters`): 15 over 33, one of 53 ms.
    - The first press at night on a fresh load (A1's bedroom 2): lit after
      65 frames and 1.75 s, the longest frame 40 ms, the room 101.5 baked
      → 100.5 live with nothing between (K before: 104 frames, 2.7 s, 41
      ms, 101.5 → 111.4).
    - Unchanged: K never pressed, three poses by day and three at night on
      fresh loads, four byte for byte the user's build's, the fifth and
      sixth (A3's living room, people shown) apart only on the woman (her
      clip's phase) and the trees through the window (the species' order);
      the editor (:3114 against :3116), four poses, plain light day and
      night 8 of 8 byte for byte, `?preview=1&scope=all` 8 of 8 with the
      flora hidden (with it, 5 of 8; the rest in trees' pixels, max 15);
      the unbaked publish 20261014T022629Z day and night 8 of 8 on loads
      with the flora hidden from the first frame.
  - *What it costs* — **K as drawn before 2026-10-15, now the fallback
    path's** (the final sitting, 2026-10-14, Ladonia's bake
    20261012T114849Z): standing, +1.7 to +3.7 ms a frame over the same
    room baked with its doors shut, +3.0 to +4.2 with a door open to the
    next room (two groups live), +2.8 with four doors open (six groups
    live). A 19.5 s walk through four rooms opening three doors: median
    14.3 → 17.3 ms a frame, 17–22 of 1,168 frames over 25 ms (the bake
    alone: 1–2), 2 over 33, none over 50 (at night 14.9 → 17.5, 23–24
    over 25 where the bake has 2–4). What a frame costs follows what
    is in view, not how many groups are live. At step 2 (1920 × 1080,
    2026-10-13, a walk through six rooms): 10.8 → 12.5.
  - *What is the bake's in view*: through open doors no baked room of the
    flat is seen — 0 px of baked room in 14 of 16 stills (1 px in two),
    and at most 26 px of 57,600 in any frame of the walk. Still the
    bake's: the garden through a door or a window, and the neighbouring
    villa's rooms across the garden.
  - *K off, and K never pressed*: off, at four poses with 1, 3, 7 and 8
    groups, 0 of 3,686,400 pixels from the frame before K, the exposure
    equal; WebGL buffers after each of five K on/off, 6,109 every time.
    Never pressed, the public view is the build before's: 28 of 28
    pictures identical to the pixel, times within 0.3 ms.
  - *Against the unbaked view* — **K as drawn before 2026-10-15, now the
    fallback path's** (2026-10-12/14, before the night's share
    — at night the live room is now the bake's darkness, not the unbaked
    view's, below; by day it is as here; the reference is the
    version's unbaked publish, or the editor's realistic preview with
    everything shown — means within 0.1 of each other; probes taken
    afresh in both): the room's own pixels by day within 1.5 levels at 50
    of 57 poses, every bathroom with a shower's screen 0.0; at night 8
    rooms within 0.2. Whole frames through open doors, live − unbaked: by
    day hall → bathroom −4.2 (its group was 3.7 dark standing in the
    living room), a hall through two open doors −1.0, a corridor through
    five +0.2, a stair looked up from its hall −2.0; at night within 0.3
    but one at −1.9. In the final sitting (2026-10-14, eight views through
    two to five open doors, whole frames at 640 wide, the share of pixels
    over 8 levels after each): by day a corridor through four doors 0.0,
    0.6%; the other way through five +0.6, 1.3%; to the bathroom and the
    stair +2.3, 6.6%; a corridor +0.9, 2.2%; the south hall to its window
    −0.5, 9.2%; its stair −0.1, 0.1%; A1's hall through two doors −1.1,
    6.4% (the glazed entry door beside it darker live); A1's living room
    out of its open terrace door −5.4, 22.1% (the terrace is the bake's);
    at night all eight within 0.8, 0.1–7.3%. The bake itself in those
    views by day: 28–48 levels under the unbaked view upstairs. Wrenfield
    (the bake of 2026-10-01): 0.0–0.4 in six
    rooms of seven, whole frames within 1.1 in ten views.
  - *At night, the bake's light* (2026-10-15, the six ways and the
    lightmap's measure; Ladonia's bake 20261012T114849Z and Wrenfield's
    20261001T143211Z, step 4, frames at 1280 × 720 of 2560 × 1440, the
    people hidden; the room's own pixels by a mask of where each pixel's
    nearest surface is, K off; baked | K before (the user's build, :3117)
    | K now): villa A's 32 rooms and both A3 closets with every lamp off —
    now 0–0.5 levels in 25 rooms, A1's hall 1.4, the south first-floor
    living room 2.5, the loggia 6.5, A2's and A3's glazed living rooms
    12.6 and 9.0 (dim and warm, as the bake has them at 19.5 and 18.3),
    villa B's A3 closet 7.0 (baked 3.3; it was 95.5 at the probes' full
    share) and villa A's 5.3 (baked 5.1); before 24–122; baked 0–7 but
    those two living rooms and A1's hall, 33.6 (a door leaf the bake
    lights from its probes and the outdoor dusk — dark live, as the hall's
    walls are). Nothing is lighter than the bake by more than villa B's
    closet's 3.7. Every lamp on as the night starts them (93), eight
    rooms: K now = K before to 0.1 level in all eight (131, 111.4, 110.6,
    127.9, 139.3, 122.8, 128.5, 144.7); at 1280 × 720 no pixel over 2
    levels apart in seven (at most 1), 7 pixels (at most 3) in the eighth.
    A1's living room's ceiling light alone turned off and on standing
    under it: 128.4 → 0.2 and back over 15 frames each way, every frame
    further than the last (before 129.5 → 68.7 → 129.5); lit, 1.1 under
    K before, as asked — the hall is open to it, and the hall's own light,
    off, is 7% of that space's lamps' power (its glow 0.929).
    Beside a lit room through an open door: A1's hall by its lit bathroom
    19 (baked 41.1, before 84.5), bedroom 2 by the lit living room 1.2
    (21.5, 64.6), C1's hall by its lit bedroom 19.6 (19.4, 75.6); the lit
    rooms beyond the doors look as K before draws them. By day six rooms:
    K now, K before and the baked view each the same to the pixel in both
    builds. K never pressed (fresh loads, three poses by day and three at
    night): every frame byte for byte the user's build's. Wrenfield's four
    rooms with every lamp off: 0–0.2 now and before, the bake 0–0.5 (its
    lightmap read too, the one-scale way: 19 rooms). The first press at
    night on a fresh load (A1's bedroom 2): baked 2 → live 0 with no frame
    between lighter than 2; lit after 125 driven frames and 2.9 s against
    81 and 1.9 s before, the slowest frame 46 ms against 27 (the
    lightmap's read is 274–416 ms of it in 16–17 slices; the rest not told
    apart: new shader text, built once). Not timed standing: three texel
    reads more a pixel of the rooms' surfaces at night. The editor (:3114,
    the scratch copy of the scenes) against the user's build (:3116),
    Ladonia, A1's living room, A3's bedroom, the north first-floor living
    room, by day and at night: under the plain light and in
    `?preview=1&scope=all`, all twelve frames byte for byte the same; the
    unbaked publish 20261014T022629Z, the same three poses, day and night:
    five byte for byte, the sixth 142 pixels of 921,600 at most 7 apart in
    the trees' crowns seen through a window — the two loads' trees in
    another order (olive_1/olive_3, oak_1/oak_4 swapped); with the flora
    hidden in both, byte for byte. The unbaked view and the editor still
    light a dark room at night with the grey share of the dusk (44–84), as
    asked.
  - *The first time*, on shaders the browser has never built (four loads,
    Ladonia's living room by day): lit after 5.7–6.1 s, the showing frame
    32–38 ms, the longest 146–161 ms, 29–31 frames over 50 ms — each lit
    program's first draw is 57–161 ms of the GPU's own, one a frame, and
    nothing in the page makes one shorter. With shaders built: 0.24–0.28
    s, worst frame 30–46 ms.
- **Measuring it**: an unbaked reference's lamps may be in or out of the
  scene's light by where the tab has been (the pool leaves 3 s after
  nothing lit is in sight), and its probe is kept until the camera has
  moved 2.5 m: move both probes (`probe.at.set(Infinity, 0, 0)`) before
  every frame compared. Two runs of one cell that differ by 5 levels are a
  state, not noise: read the pool (`rig.pool.lit`, each slot's fitting and
  level), the probe's faces, and what each pane is drawn with, in both.
  To count the bake in view, draw where each pixel's nearest surface is,
  once with everything and once with the house alone, and count those
  whose nearest is a baked surface of a room under a ceiling that is not
  shown live (what is behind glass does not count). A walker that presses
  every door within reach at once measures a visitor nobody is: two doors
  opened in one frame are two rooms let in in one frame. To time a first
  switch-on honestly make every shader new: wrap `gl.shaderSource` and
  add a used term at the end of each main (`cold.js`,
  ../app-testing-and-performance/cold.js since 2026-10-17, does it; the
  tools of 2026-10-15 were scratch and are gone). This and the paired-tab
  method: ../app-testing-and-performance/measuring.md.

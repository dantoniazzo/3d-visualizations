# Exposure in a baked view: the light meter

How a baked view is exposed: by day the frame just drawn is metered
(Realism's `LightMeter`), at night a lamplit room is metered too, under
a door the camera stays in its room, the ease's clock is kept while a
reading is awaited, a change of the time of day is taken at once, a room
open to the air is out of doors at night, and which of these a visitor
is in by step. **Never judge a baked interior at a fixed exposure.**

The live look's own exposure (`INDOOR_EXPOSURE` 2.2 and the rest of the
app-wide values) is [../build-property-space/light-and-look.md](../build-property-space/light-and-look.md);
K's exposure in the bake's own light is this meter's
([live-room-bake-light.md](live-room-bake-light.md), the exposure). For a
tester: a still taken right after posing shows the last view's exposure
— the recipe is below and in
[../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md).

- **Interiors in a baked view are metered** (Realism's `LightMeter`): the
  bake's rooms hold the real light through their windows, a tenth to a
  hundredth of the day's and far from even, where the live view gives every
  room 0.8 of the whole sky; with the live view's flat ×2.2 they drew at a
  fifth of its brightness. Indoors by day the camera meters what it sees
  (the log-average of the frame's light, NaNs dropped, nothing darker than
  ×32 can lift counting for more) and exposes it to `METER_KEY` 0.18, ×1 to
  ×32 (`METER_MOST`). It reads **the frame that was just drawn** —
  `PostProcessing`'s `frame`, the scene's light before the occlusion, the
  tone mapping and the grade — through a 16 × 9 float target (64 points
  of the frame a pixel) and a pixel buffer read a frame or two later (`ask`,
  `take`: `fenceSync`, never a wait; a buffer of its own for each reading —
  one buffer written again and again had Chrome log "READ-usage buffer was
  written, then fenced, but written again before being read back" by the
  hundred, which a page's `console.warn` hook never sees: read the pane's
  console, `read_console_messages`): no second render of the scene (it was
  one, 9–15 ms, at every reading, twice a second while walking). It agrees
  with the old reading to ±0.04 stop (eleven poses). It reads again in
  another room, after a jump, on a change of light (variant, lightmap,
  switches, doors) and every 0.2 s while the camera moves. A jump is the
  camera 3 m (`JUMP`) from where the frame before had it —
  `meter.track(camera)` is told before every frame, in a room or not —:
  walked into, a room keeps the last exposure for the two frames the reading
  takes and is then eased to; jumped into (a teleport, the bird's-eye view
  left) it takes at once what stands in for the reading — the room's last,
  if it jumped within the room (so the view from above left in place comes
  back exactly as it was), else about what its probes say (`ROOM_KEY`) — and
  two frames on the reading itself, at once too. A reading is never asked of
  a frame drawn while the meter was not (from above, out of doors: `told`,
  `since`), nor of the picture before it is first drawn at a new size
  (`PostProcessing.frames` goes back to 0). Where there is no
  post-processing — steps 0–1, and **a space without a sky of its own at
  every step, which is now metered too** — it reads the room's mean light
  from the bake's probes: brought to `PROBE_KEY` 0.55 under a sky (as the
  lowest steps were tuned), to `ROOM_KEY` 0.22 without one (Wrenfield's
  living room: mean level 91 for the live view's 89 — it was 36 unmetered,
  and is 148 at 0.55), and there ×8 at most (`METER_MOST_PLAIN`: at ×32 a
  windowless hall whited out the room and the garden seen from it, and the
  lightmap's own compression blocks showed; they still show a little at ×8
  in Wrenfield's study — a matter for a re-bake); without probes ×12 under a
  sky, ×6 without — or, with the room's own ceiling light on, ×1.4 and ×1
  (`LightMeter.unmetered`: a phone's fully baked room no longer burns out
  when its light is turned on by day). Outside and at night as live.
  Calibrated so Ladonia's living rooms and bedrooms match the live view's
  mean brightness: the glazed living room ×3–4, the open-plan ones ×11–15, a
  one-window bedroom ×27–32, and ×1.3–1.5 with the room's ceiling light on.
  Never judge a baked interior at a fixed exposure.
  - A still taken right after posing a camera shows the *last* view's
    exposure: the reading comes two frames later, through the event loop
    (its shader is built by `compileAsync`, its fence polled per frame). In
    a test, draw frames with an `await` between them until
    `renderer.realism.meter.fresh`, then set `realism.lastAt = null` and
    draw once more (the tools' `K.read()` did so; they were scratch, of
    2026-10-15, and are gone). A
    synchronous loop of renders never gets a reading.
  - What does *not* stand in for the frame: the room's probes (their light
    in the air is 2–4 times what a camera sees of a dark-furnished room
    from by its window: A1's living room read ×4–6 for today's ×12), the
    lightmap over the room's rectangle (worse), or a factor per room taken
    from one reading (worse than none: the difference is per view). Any of
    them is within ⅔ stop of a given reading for three views in four — as
    close as two readings in one room are to each other (1.5 stops apart,
    median, by the way looked).
  - **At night a lamplit room is metered too** (`NIGHT` in Realism.js,
    `renderer.realism.night`; `?night=meter|lift|asis` to compare, also
    settable live: `realism.night.mode`). Drawn from its bake at the night's
    own exposure (0.85 under a sky with the grade), a room lit by its lamps
    came out at mean level 62–84 for the old live lamps' 77–107 and the
    unbaked view's 109–125. Now, in a room whose own lamps are on
    (`LightMeter.lamplit`: a switch of the room, or of a room open to it
    with no wall between — not next door's), the same reading of the frame
    is taken with one difference: a point counts by how far its light, as
    the night exposes it, is over a floor (`floor` 0.008 → 0.025: under it
    is the night — a window, a television, a dark doorway), and the
    log-average of *that part* is brought to `key` 0.2, never under the
    night's exposure and at most `most` ×2 over it, by as much as that part
    is of the frame (`share` 0.05 → 0.25). Ladonia at step 4: living room
    83.5 → 93.7 and 62.4 → 91.7 (two views), bedroom 69.4 → 85.9, bathroom
    65.2 → 93.2, twin 83.6 → 100.5, upper living 82.7 → 94.6; no more pixels
    at white (≤ 0.2%). Out of doors, from above, with the lights off (a dark
    room: mean level 0.3–6, the same to the pixel) and in a room lit only
    through a doorway: as before, exactly. Tried and not taken: every
    lamplit room ×1.4 (`lift`: the old default's levels almost exactly —
    76–98 — but a dim room stays dim: 49 → 60 where the meter gives 72); the
    day's own count of dark points (a room looked at towards its window came
    up a stop, and the garden with it: 52 → 79); from above, the rooms' gain
    ×1.4 (the lamps' glass crosses the bloom's threshold: the floor whites
    out, 39.6 → 85.8) and the exposure ×1.4 (the garden comes up with it).
    **Only through post-processing**: drawn straight to the screen (steps
    0–1; a space without a sky at every step) a lamplit room is already as
    bright — Ladonia at step 1: 76–112; Wrenfield 142–197, within 4–10 of
    its old live default — and is left as it is. It costs what the day's
    meter does: the same 16 × 9 picture, asked for at most every 0.2 s while
    the camera moves (a night walk: median 14.0 ms metered and not).
    `meter.light` and `meter.share` are the last reading. In a test at night
    `K.read()` returns at once (it was written when nothing was metered
    then): wait for `meter.fresh` as by day.
  - **Under a door the camera is still in the room it was in**
    (`Realism.between`, baked views): on no room's floor (the floors stop
    at their walls' faces) but within 0.2 m of a room under a ceiling, the
    exposure is the room's. It used to ease towards the outside's for the
    few frames of every doorway — by day ×13.7 → ×6.8 and back up on the
    way from a hall into a bedroom, a dip anyone walking saw; at night the
    lamplit room's would have dipped as far as the night's. Out on a
    terrace's or the street's floor, further out than that, or from above:
    out, at once, as before.
  - **While a reading is awaited the ease's clock is kept**
    (`updateBaked`: `adaptedAt`): `adapt` eases by the time
    since it was last called, and it is not called for the frames a first
    reading takes — so the first step into a room was as long as the wait:
    0.85 → 1.39 in one frame from a dark bedroom into a lamplit living
    room (63% of the way), ×1 → ×3.7 by day off a terrace. Now the largest
    single step of that walk is 7%.
  - **A change of the time of day is taken at once, and by what the house is
    lit for** (`World.houseLighting`, `meter.track(camera, turned)`):
    `drawLighting` puts the lightmap, the sun's mask and the switches in
    together, in one frame (the mask was waited for after the lightmap was
    in: a first night drew the night's house under the day's switches, dark,
    for six frames; only a view's first light, with nothing shown before
    it, does not wait for the mask), then waits a frame or two for the sky — and
    `world.lighting` only says the new time after that. The exposure went by
    `world.lighting` and was eased: day → night in a lamplit room drew a
    frame at the day's ×7 (mean level 157 for 94) and eased down over a
    second and a half; night → day two frames at the night's ×1.7 (50 for
    107). Realism, the meter and ProbeLight now go by `world.houseLighting`
    — the time the house is lit for, from the frame its light changes — and
    the change counts as a jump (what stands in for the reading at once,
    then the reading at once): Ladonia's living room 107.2 → 76 → 91.5
    within three frames, and 91.7 → 97.3 → 107.2. Out of doors the base
    exposure changes at once too.
  - **A room open to the air is out of doors at night**
    (`shared/daylight.js` `airyRooms`, `Realism.airy`): a loggia has a
    ceiling and a lamp, so it was metered as a lamplit room, and what is
    seen from it is the garden and the dusk — drawn ×1.7, twice as bright as
    from the terrace a step further out (mean level 53 → 77). A room is airy
    with a metre of its edge under only a parapet (a wall under 1.2 m from
    its floor: a knee wall under a roof's slope, 1.4 or 1.65, is not one)
    and nothing of the house beyond or below, or with no wall at all and an
    outdoor room beyond; never for want of a wall alone (a landing's
    stairwell, a plan drawn short of its wall). Ladonia: its two loggias;
    Wrenfield and Ashgrove none. By day nothing changes. *Not done*: the
    view through a window from a lamplit room is still up to ×2 brighter
    than the same garden from outside (the dusk sky is over the meter's
    floor and counts as lamplit; the frame's light alone cannot tell sky
    through glass from a lit wall).
- **Which of these a visitor is in, by step.** Under a site's own sky at
  steps 2–4: the frame's reading. Without a sky of its own (Wrenfield,
  Ashgrove) at steps 2–4, "baked": the probes, to `ROOM_KEY`. At steps 0–1
  a visitor is given "static", which loads no probes: one exposure for
  every room — ×12 under a sky, ×6 without (`METER_FALLBACK`,
  `METER_FALLBACK_PLAIN`), ×1.4 and ×1 with the room's own ceiling light
  on — and the probes' reading at those steps is only a link's
  (`?lighting=baked&quality=1`). So a room looked at with `?quality=0` is
  at a fixed exposure: Ladonia's rooms draw at 140–152 there for 105–111
  at steps 2–4 (2026-10-11; not re-tuned).

# Driving from above, and getting in and out of a car

The old app-notes "The bird's-eye view › Driving from above" (2026-10-16)
and the car provider from "Cars". The view from above itself — drawn from
the bake with nothing live, its storeys, the indoor gain, the garden by
floor, hiding what is outside `builder.root` — is
`../baked-view-lighting/birds-eye.md`'s; driving keeps that view, and no
shadow pass is drawn from above while driving. The constants
(`LEAD`, `REACH`, `VEHICLE_CAMERA`, `EDGE_SCRUB`, `driveBounds`):
`picker-and-keys.md`, From above at the wheel.

- **Driving from above** (2026-10-16; a public view's alone — the editor
  has no view from above). Getting in from above keeps the view:
  `Player.enterVehicle` no longer leaves it, and `World.toggleBirdView` no
  longer refuses at the wheel, so B and the buttons go between behind the
  car and above, both ways, mid-drive; V from above at the wheel goes
  behind the car (behind it V is swallowed, as before), and the walk
  button reads "Behind the car". The pieces:
  - *Following* (`BirdView.car()`, `aim`): the target is the car plus its
    forward × clamp(speed × 0.35, −2, 4) m (`LEAD`), the lead capped at
    half of radius · tan(fov / 2) — what the frame shows of the ground —
    held to the floor's box ± `REACH` (1.5 m) together with the car's
    ground (*Out over the ground*, below). Then `keepInFrame` / `frameAt`
    solve, per corner of the car's body box (down to the ground), in screen
    terms, for the least shift of the target that keeps the whole body 10 %
    inside the frame; where it cannot fit (6 m, straight down, the car
    across the frame) the camera is drawn back (`birdView.distance`, up to
    `maxDistance`) while the visitor's own radius is kept for later (fix of
    2026-10-16: at the closest zoom the car's rear left the frame). Over 12
    pitch × zoom combinations (30/45/60/89° × 6/14/24 m), 3,960 frames of W,
    W+A, S, S+D at up to 16 m/s: no frame with any corner out; the least
    margin 38 px at 6 m (the 10 %), 106–160 at 14 m, 220–257 at 24; drawn
    back to 6.49 m at most. The target's own ease (1 −
    exp(−8·dt)) lags by speed / 8, so at 16 m/s it sits about 2 m ahead,
    not 4. The pedals held (W/S, the stick up or down) count as moving
    for the follow, as keys do on foot — not speed: rolling on after
    PageUp leaves the other floor shown until the throttle is touched.
  - *Swinging behind* (`turnBehind`): once 1.4 s have passed since the
    last drag and |speed| > 1 m/s, theta eases to heading + π at 1 −
    exp(−2.2·dt) — Camera.js's `VEHICLE_CAMERA` (`recenterAfter`,
    `recenterSpeed`, `recenter`), exported with `wrapAngle` for it. Pitch
    and distance stay the visitor's. On the road at 16 m/s theta held
    within 1–8° of heading + π; after a 300 px drag it waited 80–90
    frames, then swung.
  - *Getting in and out*: F within 3.4 m, or a click or tap on a car
    (`carAt`: a ray against each visible car's body box, `meta.body` down
    to the ground, in the car's own frame, after
    `car.group.updateWorldMatrix(true, false)` — a car driven since the
    last frame drawn had a stale matrix and a tap missed it; only cars on
    the floor shown, none while driving, and none while the cars are
    hidden as scenery, `vehicleGroup.visible` false). `thingAt` takes the
    nearest along the ray of a light, a car, a free seat on the floor
    shown (`seatAt`) and a TV (`screenAt`); a click boards the car
    (`board`), sits (`sitOn`) or switches the set (`switchScreen`), each
    through `interactables.of(kind, ref)` and `player.act`, and a light is
    switched by `switches.toggle`. The world's `"bird-hover"` is `{ kind:
    "light" | "car" | "seat" | "tv", id, label, action, on, x, y }`,
    `action` what a click does ("click to drive", "click to sit", "click
    to turn on/off"); `index.js`'s `showPickLabel` shows "<label> ·
    <action>" (a light has its own On/Off line), lit (`is-on`) for a set
    that is on, with a pointer cursor. `activate` at the wheel takes theta
    from `camera.vehicleLook`
    (heading + π + yaw; `getYaw` is a stale walking angle under pointer
    lock — B mid-drive gave 223.4° for the chase camera's 222.7°);
    `deactivate` at the wheel calls `camera.enterVehicleMode(car)`, which
    eases in from where the bird's camera was. F out leaves the feet at
    `car.exitPoint()`, the view above, walking along the view's forward.
    The first drive started from above in a visit says the keys once
    (`index.js`'s `onVehicle`; a touch variant for the stick), not one
    reached by B mid-drive.
  - *Fixed with it*: `showPeople` keeps the visitor's own figure hidden at
    the wheel; `looseMeshes` skips `builder.vehicleGroup` — its captured
    "parked" visibility put a driven car's lamp lenses and pool out at
    every floor change; cars are drawn in every floor's view (Ladonia's
    stand on the ground storey, which every view shows; a car on an upper
    deck would show over lower floors). `Camera.exitVehicleMode` leaves the
    orbit controls off while the view owns the camera (touch: they came
    back on under it), and `Camera.onDragDown` ignores drags then, so
    `dragMovement` stays 0 and a one-finger drag only turns the view.
  - *The lamps from above*: `World.lightFromAbove` holds every car's lamps
    (`CarLights.hold(on)`): the beam is the baked road pool in every mode —
    `?lighting=live` and unbaked or `?live` included — never a SpotLight;
    let go, the car's own mode comes back ('lit' where a mode was still
    null); `setMode` while held changes only what it returns to. Night
    lamps survived PageUp, PageDown and B both ways.
  - *Measured* (2026-10-16, step 4, 2048 × 1536, night, `?guard=off`):
    shadow-map passes while driving from above 0 — baked by day and by
    night, after PageUp, `?lighting=live`, `?live`; behind the car (baked,
    by day) one a frame. Render + readback, base → new: standing by the
    BMW 9.2–9.3 → 9.0–9.2 ms; in it, still, 8.8; driving the road (step +
    render) a median 4.4, p95 5.7, one frame of 1,430 over 16.7 (29.5, a
    lamp lens shown for the first time). An earlier sitting the same day:
    by the BMW 9.9–10.4 against 9.9–10.6; backing out, eight of 145
    frames over 16.7, the reversing lens's first show. Behind the car nothing changed:
    a scripted drive (F, V, back out, turn, on, brake, F out) gave
    byte-identical JSON on the build before and this one, public and
    editor.
  - *Out over the ground* (fix of 2026-10-16: off the floor's box the
    view used to wait at its edge — Ladonia's x 35.8 — and the car drove on
    off the screen). Where a car can go is `shared/drive.js`'s
    `driveBounds(spec)`: a site terrain's square (`centre` ± `size` / 2),
    the ground plane round the plot (as `buildGround` sizes it), inside the
    neighbourhood's world edge (radius − 8) where it has one; null with no
    car, an imported model, or no ground past the rooms. Ladonia has no
    world edge (its neighbourhood is off) and no ground plane: its terrain,
    x −320…320, z −312…328 (the static tree's box x −320…316, z −312…324);
    Wrenfield x −136…148, z −150.5…133.5 (the edge); Ashgrove ±142…146. A
    car there drove east over the open terrain at 16 m/s to x 316 and then
    off it, falling for ever (y −18,490 a minute on): `Car.update` now
    stops only the motion that would go over the edge (`Car.alongEdge`, fix
    of 2026-10-16: at first the car was put back and stopped, then pinned
    there — 0 mm in 5 s with W + D). Of the step's two plan-axis components,
    or the step turned 15–75° either way (`EDGE_TURNS`), the longest that
    has ground under it is kept, and the speed falls towards that share at
    `EDGE_SCRUB` 3/s: the car slides along a slanting edge (met at 21°:
    15.9 m/s, 29 m in 2 s), creeps at about 4.3 m/s head on, and turns away
    when steered (W+A from 97°: off at 13.2 m/s). It never fell. The car's
    middle is the ground probe, so its nose still hangs over the edge. `BirdView` keeps
    `ground` and `roaming`: set on getting into any car (the world's
    `"vehicle"`, from above or behind it) and at the wheel; on foot it
    lasts until the feet are back within the ground floor's box ±
    `REACH` — cleared on getting out by the rooms (`"vehicle"` with
    `driving` false), and on each tick while the view is shut, whether or
    not the bird's-eye view is on (fix of 2026-10-16). Which floor a point
    is on from above is `floorAt(x, y, z)`: anything past the ground
    floor's box ± `REACH` on a car's ground counts as the ground floor,
    whatever its height — for the visitor's own figure, other visitors and
    the car pick (fix of 2026-10-16: out of the car on Ladonia's western
    hill, ≥ 1.9 m up and 45.8 % of its drivable ground, the figure was
    hidden and the parked car could not be clicked). While roaming the
    clamp is that box joined with the ground;
    past the ground floor's box (`out`) the target stands at the feet's
    own height + 1 m, not the floor level's (the terrain falls to −6.5 east
    and rises to 12 west: with the level's height the car slid off the
    bottom of a close, flat view), and the floor shown is the ground storey
    (`followed`: at 8.7 m up the western hillside `levelAt` says the roof
    terrace). On foot without a car nothing changed: walking east off the
    road the view still waits at x 35.8. Checked on Ladonia (1024 × 768,
    the car's middle against the window's edges): east to the terrain's
    edge ≥ 245 px in, stopped there on the ground; north (pitch 30, 24 m)
    ≥ 323, south (pitch 60, 6 m) ≥ 33 — the same 33 as on the road inside
    the box at that zoom while it speeds up (the lead runs ahead) —, a
    W + A circle off the road at 6 m ≥ 61, the NE corner ≥ 311, the
    western hill ≥ 258 and the ground floor shown; out of the car at x 95,
    the figure shown and followed back to x 35.75, where roaming ends;
    driven out behind the car, got out at x 188 and B: the view opens on
    the figure. Night: the pool and three lenses lit off-road, after
    PageUp and back; shadow-map passes 0. Render + step + readback, 2048 ×
    1536, step 4, day: the road 9.3–9.4 ms median, off-road 8.2–8.5.
    Behind the car, `behind()` still byte-identical with the build before.
  - *Sampled at publish* (`Publish/viewpoints.js`'s `driveViewpoints`:
    rings round the ground storey's box, Ladonia 642 more bird's-eye
    views, about 2 s) and *the version published before, looked at from
    out there* (`holes.js`, `count-views.mjs`: single pixels on cut wall
    tops, the terrain grid's hairline crack at x 76, z 78 / −62):
    `../publish-and-bake/culling-and-viewpoints.md`. Publish after giving
    a space a car and ground, so that the view is sampled from out there.
  - *Limits*: past the box at the wheel, Page Up / Page Down still take the
    view to the houses' middle (as on foot) until the pedals are pressed.
    A car going off a drop of more than 3 m now stops at it too. Others
    see the figure standing idle where it got in: cars are not synced.

## Getting in and out (the car provider)

- Getting in and out goes through the car provider (`World/Interactables.js`:
  F within 3.4 m of the car's middle, offered before anything aimed at;
  `picker-and-keys.md`), and both are told as `"interact"` —
  `driving`, and since 2026-10-16 `parked` too (`Player.leaveVehicle`, F
  at the wheel and the touch *Get out*; `exitVehicle` alone tells only
  `"vehicle"`). From above, a car is driven without leaving the view (above).
  Importing a car (`assets/cars/`, `npm run models -- --cars <id>`) is
  the space's: `../build-property-space/assets.md`. Nothing of a drive is sent to the
  other visitors: they see the figure idle where it got in.

## Elsewhere

- The in-page tool: `birdcar.js` (`__bc`; `behind()` is the byte-for-byte
  drive across two builds; in an editor tab `__K.scope("all")` first), in
  `../app-testing-and-performance/`.
- The pitfall this came from (follow a car over all the ground it can
  drive on): SKILL.md, Pitfalls.
- A car's lamps and the bake's road pool: `../baked-view-lighting/birds-eye.md`.

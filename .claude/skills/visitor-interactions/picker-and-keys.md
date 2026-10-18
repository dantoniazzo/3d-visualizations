# What the visitor acts on: the picker, the keys, the room they are in

As the code stood on 2026-10-16, read again on 2026-10-17
(`shared/interact.js`, `World/Interactables.js`, `World/Whereabouts.js`,
`World/BirdView.js`, `World/Player/Player.js`). The numbers alone — the
`KEYS` table, `REACH`, `SLACK`, `TIE`, `PRIORITY` — are at the end, in
The walkthrough's keys and the picker's numbers; what a test tab can ask
is in `page-handles.md`.

Since 2026-10-16 everything E and F do goes through one picker (Q, the
room's lights, is `Player.toggleRoomLights` beside it) and one list of
keys, so that each thing to act on is added beside the doors, drawers,
lights and cars without touching Player again — as the windows, the
seats, the televisions, and the taps and showers were (`windows.md`,
`sitting-and-tv.md`, `water.md`). Read
this before adding a thing to act on, a key, a touch button, a line the
HUD says, or anything that asks which room the visitor is in.

- **One list of keys** (`shared/interact.js`'s `KEYS`, pure, in node
  too): each `{ code, key, action, label, scopes, touch }` — `code` as
  `KeyboardEvent.code` names it (several for keys that work together),
  `key` the cap's word, `scopes` where it works (`walk`, `bird`, `drive`,
  narrowed by `editor`, `public`, `debug`), `touch` the button's icon
  where it has one. `keysFor({ state, editor, debug })` gives the keys
  that work there — for the clash test, the scopes and the keyed hints.
  **The hints are not drawn from `KEYS`**: they are written by hand twice
  in `index.html` (the avatar stage's `.controls-hint` and the
  `.lock-hint`), shown by `data-edit-only` / `data-public-only`.
  `showKeyHints` asks `keysFor` for `walk` alone and toggles only the
  spans keyed `data-key-hint` (Q's `room-lights` once the view has
  switches, C's `colliders` where the colliders are available) and
  `data-pool-hint` (Space at the pool's edge, where the spec has
  `landscape.pools`). So a new key, or a new thing E does, is written
  into both blocks, keyed with `data-key-hint` only where it is not
  everywhere. E's hints name doors, windows, seats and a TV, not drawers
  or taps, which `KEYS`' own label does. New keys are read by
  `event.code` in Player (by place, as WASD: Q is the key marked A on
  AZERTY, and the hint still says Q); `index.js`'s older letter keys stay
  on `event.key`. C is bound by `Experience/Colliders.js`, not Player.
- **Who hears a key first** (in the editor; a public view has no editor
  in the way). The editor's `keydown` is a capture listener on
  `document` (`Editor.js`, `addEventListener(…, true)`), and it takes
  Tab. In edit mode it stops every other key: C it handles itself before
  its transform session's check; the arrows always walk, and WASD and
  Space only with nothing selected (`walkKey`). In the walkthrough it
  hands the key to `FieldEdit.onKeyDown`: with a piece selected FieldEdit
  stops every key but V, M, P, C, Q and Enter (Ctrl/⌘ Z and Y it takes
  for undo and redo), and while a move is under way those too. A key
  stopped there never reaches Player's or `index.js`'s `document`
  listeners, nor `Colliders`' on `window` — so with a piece selected in
  the walkthrough E, F, N, L, K, B, T, O and Space do nothing until Esc
  lets it go. A new walkthrough key that must work with a selection goes
  into FieldEdit's list; one for edit mode into `Editor.onKeyDown` before
  its session check, as C is.
- **The look ray finds how far the crosshair sees, as it always did**
  (`Player.updateLookTarget`): in the editor `rays.cast` over the
  interaction objects, the real meshes, with the view's scope filter; in a
  public view the collision tree has the last word — `collision.rayIntersect`
  and a two-sided cast (its floors have tops only: seen from below, sight
  still stops at the floor above), a piece's own doors and drawers aimed
  at through its shut box within `SLACK.openable`. Then
  `world.interactables.aim(ray, { hit, sight, far, head })` says what is
  aimed at (`player.target`); anything else met is described for the
  inspect label (`describe(hit)`: a named surface, else what it is part
  of). From above there is no crosshair: the target is null.
- **What is aimed at** (`pickTarget(candidates, sight)`): a candidate
  counts within its kind's `REACH` (door 4, openable 2.5, light 4, window
  2, seat 2, tv 5 — past the look ray's 4, by a ray of the TV's own; tap
  1.6 and shower 2, a control's box: `water.md`) and no
  further behind
  the first solid thing than its `SLACK` (light 0.05 — a light's box
  stands proud of it — openable 0.25, else 0.05); of those the nearest,
  but within `TIE` (5 cm) of it the higher `PRIORITY` (light 5, openable
  and window 4, door 3, tap, shower and tv 2, seat 1). So a light's box
  within 5 cm of a door's leaf is the light, as it always was, and a door
  or drawer more than 5 cm nearer is the door or drawer. A candidate may
  carry its own `reach`, `slack`, `priority`. The built-in kinds cast no
  ray of three's but the light's (as before): a door's leaf and a drawer
  are read off `hit`, and the window provider tests each sash's opening
  itself (`through`, 0.6–1.8 µs over Ladonia's 59).
  - *Changed on purpose*: in a public view, what the look ray met further
    behind `sight` than its slack is dropped — neither aimed at nor named,
    as a bare ceiling is not. Before, E opened a door upstairs through the
    ceiling and the label named it (5,000 seeded looks, base against new:
    27 differ, every one a door or a sofa upstairs seen through the floor
    above; at A2's bathroom pose base aimed at `a-f-gwc-n-e-o0`, new at
    nothing, offering the bathroom's own door). Nothing else of what E
    does changed: the act.js spots, editor and public, are identical but
    for the touch field and the new event.
- **What is offered and done.** `Player.updatePrompt`: at the wheel,
  getting out (`interactables.driving(car)`); else `offer(target, head)` —
  a `first` provider's `near` (a car within 3.4 m of its middle), then
  the target, then `nearby(head)` (the nearest door within 2.2 m across the
  floor) — from above, where nothing is aimed at, a free seat within 1.2 m
  if no door is nearer (`Player.unaimed`); seated, `seatedOffer()` (what
  a provider's `seated(seat, eye, player)` offers, a television in front,
  else getting up); afloat, the pool's edge alone (`swimmer.offer()`,
  where it is near enough to climb out over), and nothing while climbing.
  Afloat, E does nothing (`Player.interact` returns null): the edge is
  Space's. The world's `"prompt"` is `{ label, key, touch: {
  label, icon }, also? }` — `also: { key, label }` what another key does
  there, shown after a thin rule on a keyboard only (`#action-also`:
  seated before a TV, "Space Stand up") — told only as its signature
  changes, so it turns from Open to Close the moment a door is opened. The
  signature is all of what it says, `also` and the touch button's word and
  icon included (fix of 2026-10-16: got up while still aimed at the same
  set, "Space Stand up" stayed on screen, and Space jumped).
  `Player.interact()` (E) acts on the target
  or the nearest door; F is `enterNearestVehicle` (`nearest("car")`) or
  `leaveVehicle` (`driving(car)`); each goes through `Player.act`, which
  tells the world `"interact"` `{ kind, id, state }` — `open`/`shut`,
  `on`/`off`, `driving`/`parked` — besides the old `"door"`, `"openable"`,
  `"vehicle"` and the switches' own. A car clicked from above is
  `interactables.of("car", car)`. On a touch screen `#touch-action` takes
  the prompt's `touch`: drawers and cupboard doors have a button now
  (before only doors did), its icon one of `ICONS` — door, drawer, car,
  light, finish, seat, tv, water (the taps and showers), window — CSS
  alone (`hud.scss` `.touch-action-icon[data-icon=…]`). The pool ladder
  (`pool`, *Climb out*) is drawn in hud.scss but is not in `ICONS`, so
  nothing checks it: `test-interact.mjs` checks that each `ICONS` entry
  has its CSS and each `KEYS` `touch` is in `ICONS`, never the icon a
  provider's prompt names. Give a new icon both (and add `pool` the next
  time `shared/interact.js` is open). **The button runs by the prompt's
  key, not by its provider** (`index.js` `runAction`): E
  `player.interact()`, F in or out of the car, T the finish picker, Space
  `player.climbOut()`.
- **Providers** (`World/Interactables.js`, `world.interactables`, made
  right after the SceneBuilder in both views — World.js; a module made
  before it registers nothing and says nothing,
  `world.interactables?.register`): `{ name, first?, aim(ray,
  look) → [{ kind, id, distance, ref, label }], near?(head), of?(ref),
  prompt(target), act(target, player) → { kind, id, state }, busy?(),
  refresh?(), dispose?(), seated?(seat, eye, player) }`. Built in: *door*
  (the `userData.kind === "door"` group up from `hit`, or
  `SceneBuilder.nearestDoor(head, 2.2)`), *openable*
  (`builder.openables.of(hit.object)`; "Open <label>" / "Close <label>" by
  the part's model, the touch button Open/Close with the drawer icon for a
  slide and the door icon otherwise; the inspect label the piece's, else
  the part's), *window* (`windows.md`), *light*
  (`builder.pickLight(ray, { far, accept })` against the light targets'
  boxes; with the editor showing the surroundings alone, only a lamp whose
  piece is drawn), *car* (`first`, `nearestCar(head, 3.4)`, `of`).
  Registered by their own modules, each made after it: *seat*
  (`World/Seats.js`) and *tv* (`World/Screens.js`), `sitting-and-tv.md`;
  *water* (`World/Water.js`, kinds `tap` and `shower`), `water.md`. Not
  registered: the pool's edge
  (`Player/Swim.js`'s `CLIMB_OUT_PROVIDER`, name `pool`, key Space, touch
  *Climb out*), which `Player.updatePrompt` offers itself while afloat.
  `refresh` runs on `furniture-ready`, `scene-edited` and
  `fittings-rebuilt`.
- **Adding a kind** (seats, taps, a shower, a television, windows):
  1. a provider, `world.interactables.register(provider)` (it returns what
     lets it go). The look ray meets only what hangs under
     `SceneBuilder.getInteractiveObjects()` — the shell, the cars, the
     fittings, the door anchors, the furniture, a public view's openable
     holders, an imported model — handed to Player once, at
     `furniture-ready` (World.js, `setInteractionObjects`): read a thing
     there off `look.hit`, at no cost. Anything in a group of its own
     outside the root (the water's controls, a TV's picture) is never
     `hit`, nor is a point (a seat's): test it yourself against boxes of
     your own (`Water.aim`'s control boxes, `Screens.pick`), skipping
     first whatever is further from the head than its reach + 0.5 m, as
     `Water.aim` does — and keep the look ray and prompt within today's
     0.05–0.11 ms a call. A reach beyond the look ray's 4 m needs a ray of
     its own past it, as `Screens.pick` casts one, ignoring the set's own
     piece.
  2. its `prompt` with a `touch` icon in `ICONS` and in hud.scss (`node
     scripts/test-interact.mjs` fails an `ICONS` entry without CSS, not
     an icon a prompt names that `ICONS` lacks), its `act` returning `{
     kind, id, state }` — the state the visitor's own, never saved or sent
     (no sync was the user's choice);
  3. if the prompt is on a key other than E, F, T or Space, or Space means
     anything but climbing out, its line in `index.js`'s `runAction`, or
     the touch button does nothing (or climbs out);
  4. `busy()` naming it while it eases by itself — a seat's blend, water
     starting, stopping or running near the camera, a set's 0.3 s fade —
     or the editor at rest stands it still (Pace.js asks it after its own
     door and drawer lines). Not while it merely plays: a playing
     television is not busy (the walkthrough draws it at the 30-a-second
     rest rate, and edit mode pauses it), and `Water.busy` is null in edit
     mode, where the editor holds things still;
  5. if it collides outside the trees, `experience.colliders.register`,
     and a name and a label the colliders view knows
     (`../walkthrough-editor/colliders-view.md`: `BLOCKER_NAMES` /
     `BLOCKER_LABELS` for a blocker, `STEP_NAMES` / `STEP_LABELS` for a
     ramp);
  6. a new key: an entry in `KEYS` (the clash test and the keyed hints'
     scopes), its words in both hint blocks of `index.html` (a
     `data-key-hint` span where it is not everywhere), read by
     `event.code` in Player — and through `FieldEdit`'s key filter if it
     must work with a piece selected in the walkthrough ("Who hears a key
     first", above). The frame-rate guard already settles on
     `"interact"`;
  7. to be clicked from above, where there is no crosshair: `of(ref)` on
     the provider; a `<kind>At(x, y)` in `BirdView.thingAt` (the ray from
     `rayAt`, kept to `floorAt(…) === this.level`, none at the wheel); its
     click in `onPointerUp`, through `interactables.of` and `player.act`;
     and an `action` for the hover label ("click to …"). E from above acts
     only on what `Player.unaimed` offers: the nearest door, or a free
     seat in sight within `SEAT_NEAR` 1.2 m of the feet;
  8. if it draws anything outside `builder.root`, hide it from above on
     the floors over the one shown, by `birdView.floorAt(x, y, z) <= shown`
     (`floorAt`, not `levelAt`: `../baked-view-lighting/birds-eye.md`);
  9. cases in `scripts/test-interact.mjs`, and a spot in act.js (SKILL.md,
     Tools) with its own `state`.
- **The visitor's own figure** (`Player/Avatar.js`: clips bound by name,
  `addClips`): `../space-people/avatar-clips.md`. What matters here:
  getting into a car sets `idle`, and clips are played and sent by name.
- **Which room the visitor is in** (`World/Whereabouts.js`,
  `world.whereabouts`, from the builder's spec and `roomAt`, asked again
  each call): the one answer for the HUD's readout, Q and the live room
  (`RoomLight.where`, whose rules moved here unchanged —
  `../baked-view-lighting/live-room.md`). `locate(x, y, z, { accept,
  keep })` → `{ room, floor }`: on a flight more than `ON_FLIGHT` (0.3 m
  of height) from either end, the room
  at the end nearer in height (`flightAt`; on Ladonia's six inside flights
  `roomAt` says the bathroom under the flight half-way up, `locate` never
  does); else the room whose floor the feet are on within `ON_FLOOR`
  (1.2 m); else, on a threshold or in a wall, a room within `REACH`
  (0.3 m), the kept one first. `follow(x, y, z, delta)` keeps the room it
  holds through a threshold and holds it `BETWEEN` (0.6 s) in no room;
  `forget()`; `nearRoom()` skips the eight look-rounds where no room's
  bounds are near. The readout follows at the feet and is null at the
  wheel. Walked frame by frame up a-stair-n: the readout went living →
  box, one change each way (before: living → none → bathroom → box);
  through a-g-a2-bath-n-o0 and upstairs a-f-core-n-o0, one change and the
  chip never blinking (before: two or three, and upstairs the bathroom a
  storey below for a moment). `RoomLight.where` at 2,020 seeded points
  gave the same hash before and after. `SceneBuilder.roomAt` now tests
  each room's height window and its plan's bounds (`planBounds`, cached
  by polygon — nothing moves a polygon's corner in place) before the
  polygon: the same answers, 4–5 × cheaper; the readout is 1.0–2.0 µs a
  frame indoors where it was 4.4–5.3, and 7.6 out in the garden near
  rooms' bounds (4.4 before).
- **Q, the room's lights** (`Player.toggleRoomLights`, `roomLights()` →
  `{ room, items }`, `player.room`): any of the room's switches on → all
  off, else all on (`roomLightPlan`), through `switches.setMany` (the next
  bullet); on foot and from above (the avatar's room, whichever
  floor is shown); not at the wheel, not in edit mode (Editor.onKeyDown
  does nothing with it); with a walkthrough selection, yes (`FieldEdit`
  passes it); not on repeat, nor with Ctrl, ⌘ or Alt. The world's
  `"room-lights"` `{ room, on, count }` — `on` null and `count` 0 when
  there was nothing to switch. Only the room stood in: an open-plan
  room's neighbour stays as it is. HUD (`index.js`, `hud.scss`): the chip
  `#room-lights` after `#room-readout` — its bulb lit while any is on,
  "Lights on/off" and Q, its label hidden under 1280 px in the editor and
  1024 elsewhere, clickable with the cursor free, hidden on touch, at the
  wheel and in a room without a switch; `#touch-room-lights`, 56 px round,
  over `#touch-action`, saying what a tap does (On/Off) as the action
  button does for an aimed light; the line `#room-lights-said` at 36 % of
  the height — "<Room>: lights on/off", "No lights to switch here", and in
  the editor under the plain light "(seen in the realistic preview, P)" —
  apart from K's hint at 64 %. Ladonia's 11 terrace lamps (`lamp:a-f201`…)
  are not in its bake: Q on a terrace says there is nothing to switch in
  the public view and switches the lamp in the editor.
- **A room's lights at once** (Q, 2026-10-16; the switch side, from the
  old "Lights and fittings" section — the bullet above has the key, the
  HUD and which room): both kinds of switches have
  `inRoom(roomId)` — the switches whose room it is, ceiling and lamps of
  their own, never a room open to it — and `setMany(ids, on)`, one state
  change, one `"change"` and one apply; the baked `Switches` shows them
  switched at once and awaits their layers together (`Promise.all`), as
  `set` does one. Ladonia public, A1's bedroom at night: the frame's mean
  level 103.6 → 5.0 → 103.6 by Q, Q; with K's live room on 101.8 → 0.9 →
  102.9 (the live switch follows); in the editor's realistic preview 114
  → 84.5 → 115; under its plain light the fitting's glass alone, emissive
  2.2 → off. Wrenfield (LiveSwitches): a bedroom's three switches and the
  study's two go together, all off if one was on by hand.
- **The row along the top at narrow widths** (fix of 2026-10-16: the
  editor's at 1024 px wrapped the room's name onto two lines and pushed
  the chip against the window's edge; base did the same with a long name,
  and on a phone squeezed the buttons to 28–30 px): `.hud-top-left` is no
  wider than the window less 1.1rem a side, its children `flex: none` but
  `#room-readout` (`flex: 0 1 auto`, `min-width: 0`, one line, `overflow:
  hidden`, `text-overflow: ellipsis`; `title` the whole name, set in
  `updateRoomReadout`); at 640 px and under the row's gap is 0.5rem and the
  readout's side padding 0.6rem, so the editor's six icons leave it "A1 …".
  Measured on Ladonia (A1's living room, and "Upper north flat — living,
  dining & kitchen", the longest): editor 1024 one line 147.8 px, cut, the
  chip 16.5 px from the edge; 1280 and 1440 the same boxes as base (784.4,
  19.2, 195.8 / 276.8 × 34.6), the public view's likewise (594.6 …); public
  1024 the long name cut by half a pixel, the chip 16.5 px in; phones 57 px
  (editor) and 104.5 px (public), buttons 40 px. The readout's font,
  padding, colours, border, radius and height as base.
- **The nearest door, on the visitor's floor** (fix of 2026-10-16):
  `SceneBuilder.nearestDoor(head)` skips a door whose foot — its group's
  world y, where `Door.js` hangs the leaf, at the wall's base; every
  door's sill is 0 in the three scenes — is over the head or more than
  `DOOR_BELOW` (2.4 m) under it (`shared/interact.js`'s `doorOnFloor`; the
  head is the capsule's top sphere, 1.55 m over the feet, so a door's foot
  may be 0.85 m under the feet). In A1's ground-floor bedroom it opened
  `a-f-bed1-e-o0` upstairs; over Ladonia's rooms and flights, every 25 cm,
  the nearest door within 2.2 m was another floor's at 7,047 of 15,235
  spots, now at none, and the same door wherever it was the visitor's
  floor's (`test-interact.mjs`). Each of the three scenes' doors is within
  the band from the rooms either side of it. Still across the floor: in
  A2's bedroom at (3.5, 4.0) it is A1's bathroom door, through the wall.
  RoomLight's `AHEAD` (3.6 m) holds: `look` counts a door's way as its
  distance across + |its foot − the feet| × 0.5, at most 2.2 + 0.78.
- **Known, not mended**: on `c-stair-n`/`s` the flight's foot sample,
  0.4 m before it, is in `c-f-hall` while its first steps stand in the C4
  or C5 stair room, so
  climbing reads hall → stair room → hall → box (RoomLight's rule too,
  left so). After a jump into no room (a test's `stand`) the readout, the
  chip and Q name the room left for 0.6 s. A1's bedroom ceiling switch
  stands behind its linen wardrobe (a-f025): from square in front of it
  the wardrobe's door is 0.42 m nearer along the ray, and since the
  wardrobe opens E there opens its door ("Open wardrobe"); from the side,
  50–70° along the wall, the switch is aimed at. Q reaches it anyway.
- **Testing.** `node scripts/test-interact.mjs`: 51 of 51 on 2026-10-16
  (44, and then the nearest door's floor: its band, and every 25 cm of
  Ladonia's rooms and flights against the rule before; a band of 3.5 m, or
  a door's foot let 0.5 m over the head, fails it) —
  `pickTarget` against a transcription of Player's old rules over 8,000
  seeded looks, editor and public (with a floor above in front of a fifth
  of the public ones, and the one intended change), the keys (no clash
  by scope), the scopes, every icon's CSS, and Whereabouts over
  published Ladonia (`PUBLISH_DIR`, else `published/`; skipped with a note
  without one) — mutation-checked: a light slack of 0.06, a tie of 0.04, a
  drawer reach of 2.6, `BETWEEN` 0.5, no kept room, no flight rule each
  fail it (51 of 51 again on 2026-10-17). In a page, `act.js`
  (`../app-testing-and-performance/`; how to load it:
  `../app-testing-and-performance/in-page-tools.md`), and `lights.js` for Q
  and the room readout, `birdcar.js` for driving and clicking from above,
  `hud.js` (all in `../app-testing-and-performance/`). Touch, in the
  pane: `resize_window` with the mobile preset, then reload — the scheme
  is chosen as the page loads
  (`camera.scheme === "orbit"`, `body.input-touch`). A click on
  `#touch-action` runs `runAction` by the prompt's key. The stick is
  nipplejs: drive it by touch pointer events on its zone, or set
  `player.joystickVector` and `actions.movingJoyStick` (at the wheel
  `steerWithJoystick` reads them, ±0.3 to count). Checked so on
  2026-10-16: the drawer's Open/Close button, the room-lights button,
  driving from above with the real stick. Put the preset back
  (`desktop`) after.
- **What it costs.** The look ray and the prompt: 0.047–0.095 ms a call
  on both builds (the picker's candidates and prompt object add 3–6 µs,
  no ray); with the windows, seats and TVs registered (wave A's merged
  build, Ladonia, act.js's spots) 0.094–0.107 ms in the editor and
  0.050–0.076 in a public view, at a load of 3–5. With the 70 taps and
  showers registered too (the new version, wave C), the look ray over
  seats, water and windows is +0.11 ms of `world.update` at A1's living
  room (`../app-testing-and-performance/speed-architecture.md`, What runs
  every frame). The HUD is
  redrawn only on events (`room`, `switches`, `vehicle`, `room-lights`).
- **Where the HUD says things.** `tellView(text, ms)` writes
  `#view-notice` at the top (4.2rem); from above it sits under the floor
  picker (`.bird-view .view-notice`, 1.1rem + 96 px), since at 1024 px it
  covered "Roof terrace". It carries the colliders' state, the guard's
  changes, the live room's word and the keys at a first drive from
  above. `#room-lights-said` at 36 % of the height is Q's line, and K's
  hint (`.room-light-hint`) is at 64 %, where the action prompt is.
  Edit mode has the editor's toasts, and the walkthrough's lines are not
  said there (`onColliders` returns while editing). A new message takes
  one of these, not a new place.

## The walkthrough's keys and the picker's numbers

`shared/interact.js`'s `KEYS`, the picker's `REACH`, `SLACK`, `TIE` and
`PRIORITY`, the touch icons, Whereabouts' and BirdView's constants. As the
code stood when the walkthrough's keys and the interaction, room and
colliders handles were added on 2026-10-16 (`Experience/Colliders.js`,
`World/ColliderView.js`, `shared/interact.js`, `World/Interactables.js`,
`World/Whereabouts.js`, `World/BirdView.js`, `World/Player/Player.js`),
the providers and the view from above read again against the code on
2026-10-17. Why each is so: above (and `driving.md` for the
car from above).

### `KEYS`

One list; `keysFor({ state, editor, debug })` gives those that work, and `index.js`'s keyed hints (`[data-key-hint="<action>"]`: Q and C) follow it; the hints' words themselves are written by hand in `index.html`, twice (One list of keys, above). `code` is `KeyboardEvent.code` (the key's place); Player reads its own keys so, and `index.js` its older letter keys by `event.key`. Scopes: `walk` on foot, `bird` from above, `drive` at the wheel; `editor` or `public` only there; `debug` only where the colliders are available. Edit mode's keys are the editor's (README, Edit mode; `../walkthrough-editor/SKILL.md`).

| key | action | where | touch |
|---|---|---|---|
| WASD | move · drive and steer | walk, bird · drive | the stick |
| Shift | run | walk, bird | |
| Space | jump · brake · seated, stand up · afloat by the pool's edge, climb out | walk, bird · drive | `pool` (*Climb out*) |
| E | open, sit, switch a TV or a tap: what is aimed at (with nothing aimed at, the nearest door within 2.2 m on the visitor's floor; from above, a free seat within 1.2 m in sight if no door is nearer); standing in a shower, that shower, below everything else; seated, the TV in front, or stand up | walk, bird | the prompt's own icon |
| Q | the lights of the room stood in | walk, bird | `light` (`#touch-room-lights`) |
| C | colliders, Shift C x-ray (bound by `Experience/Colliders.js`) | walk, bird, drive; debug | the menu's *Debug* switch |
| F | get in or out of a car | walk, bird, drive | `car` |
| H | headlights | drive | |
| B | each floor from above, driving too | walk, bird, drive; public | |
| V | first / third person; from above, back down (at the wheel, behind the car) | walk, bird, drive | |
| O | dance | walk, bird | |
| N | day or night | walk, bird, drive | |
| L | the lights panel | walk, bird, drive | |
| K | the room you are in, live | walk; public | |
| P | realistic preview | walk, drive; editor | |
| T | change a finish | walk; editor | `finish` |
| M | menu | walk, bird, drive | |
| Enter | chat | walk, bird, drive | |
| PgUp / PgDn | floor up or down | bird; public | |

Nothing of 2026-10-16's is kept in the browser: the colliders, the room's
lights by Q and driving from above start as they always do at every visit
(the one-off hint for driving from above is once a page, in memory).

### What each kind can be acted on from

- `REACH`, metres from the head:
  - door 4 aimed at, 2.2 near (across the floor, and on the visitor's
    floor: `doorOnFloor(head, foot)`, the door's foot not over the head
    nor more than `DOOR_BELOW` 2.4 m under it);
  - openable 2.5; light 4; car 3.4 from its middle; window 2.0 (from the
    room's side); seat 2.0 (within 0.4 m of its point across the ray); tv
    5 (past the look ray's 4, by its own ray);
  - tap 1.6 and shower 2.0 (a control's pick box, `World/Water.js`;
    standing in a shower's enclosure, up to 0.4 m over its top, that
    shower with no reach and priority −1).
  - Seated: a TV within 7 m of the eyes, ±40° of the seat's facing.
- `SLACK` behind the first solid thing met: light 0.05, openable 0.25,
  anything else 0.05. `TIE` 0.05; `PRIORITY` light 5, openable and window
  4, door 3, tap, shower and tv 2, seat 1.
- Touch icons (`ICONS`, `hud.scss`): door, drawer, car, light, finish,
  seat, tv, water, window. `pool` (a CSS pool ladder: *Climb out*, Swim's
  prompt) is drawn in hud.scss but is not in `ICONS`, so
  `test-interact.mjs` does not check it.
- Which room (`World/Whereabouts.js`): `REACH` 0.3, `BETWEEN` 0.6 s,
  `ON_FLOOR` 1.2, `ON_FLIGHT` 0.3.

### From above at the wheel (`World/BirdView.js`)

- `LEAD` speed × 0.35 clamped to −2…4 m and to half of radius · tan(fov /
  2), the car's whole body then kept 10 % inside the frame (`keepInFrame`,
  the view drawn back where it cannot be).
- `REACH` 1.5 round the floor's box — at the wheel, and on foot where a car
  left the visitor until they are back within it, that box joined with
  where a car can go (`shared/drive.js`'s `driveBounds(spec)`: a terrain's
  square, the ground plane, inside the neighbourhood's world edge at radius
  − 8; Ladonia x −320…320, z −312…328), out past the ground floor's box at
  the feet's height + 1 m and showing the ground storey.
- The swing is `VEHICLE_CAMERA`'s (`recenterAfter` 1.4 s, `recenterSpeed`
  1 m/s, `recenter` 2.2 /s).
- A car stops going where the ground under it ends, and slides along the
  edge (`Car.alongEdge`: of the step's plan components or the step turned
  15–75° either way, the longest with ground under it; speed falls to that
  share at `EDGE_SCRUB` 3/s).
- Past the ground floor's box on a car's ground a point is on the ground
  floor from above (`floorAt`).
- Sampled at publish (`Publish/viewpoints.js`'s `driveViewpoints`): rings
  round the ground storey's box `DRIVE_RING` 12 m out and 24 m apart, each
  next twice as far out and as sparse, to `driveBounds`, every distance,
  pitch and azimuth of `BIRD_VIEW` kept only with the houses' box (indoor
  rooms ± 8 m) in frame; drawn with `maxLevel` the storey's top level and
  `ceilingFrom` its lowest (Ladonia 642 views, Wrenfield 490). The publish
  side of it: `../publish-and-bake/culling-and-viewpoints.md`.
- The bird's-eye camera's own framing (pitch, zoom, floors) is
  `../baked-view-lighting/birds-eye.md`'s.

## Elsewhere

- Where a visitor points at a lamp (`Fittings.gatherLights`' target, the
  `Fittings.aimedAt` fix for ld-cabinet; a light's box met first or within
  5 cm of a door is the light): `../walkthrough-editor/lights-and-fittings.md`.
  Light targets are published, so a public view gets a change to them only
  on the next publish (`../publish-and-bake/SKILL.md`).
- The L key, the HUD's lights panel and Ctrl/⌘-click switching (the
  lights switched live: LiveSwitches, LampPool, RoomGlow):
  `../walkthrough-editor/lights-and-fittings.md`.
- Who hears a key first, from the editor's side (`Editor.onKeyDown`'s
  capture listener, `FieldEdit`'s key filter): `../walkthrough-editor/SKILL.md`.
- Anything colliding outside the trees (`experience.colliders.register`,
  `BLOCKER_NAMES`/`BLOCKER_LABELS`, `STEP_NAMES`/`STEP_LABELS`):
  `../walkthrough-editor/colliders-view.md`.
- A new thing that changes the picture by itself (an emitted event,
  `experience.wake(why)`, a line in `Pace.busy()`, or its provider's
  `busy()`): `../walkthrough-editor/frames-on-demand.md`.
- The frame-rate guard (`"interact"`, `SETTLE_ON`):
  `../baked-view-lighting/frame-guard.md`.
- The view from above itself (floors, `floorAt`, hiding what is outside
  `builder.root`): `../baked-view-lighting/birds-eye.md`; driving and
  clicking from above: `driving.md`.
- The live room (K) asks Whereabouts for the room too:
  `../baked-view-lighting/live-room.md`.
- The in-page tools named here (act.js, lights.js, birdcar.js, hud.js) and
  how to load them: `../app-testing-and-performance/in-page-tools.md`;
  touch in the pane: `../app-testing-and-performance/browser-pane.md`.

# In-page tools: loading them, writing your own, and the audits

The in-page tools are this skill's folder's `.js` files, run in a page of
a TEST server (never the user's on :3000: `test-servers.md`). Each
file's header says what to load before it, what each call does and what
it returns; one line of use for each is `tools.md`.

## Loading them

- Through the sink (`sink.py`, 127.0.0.1:3199) or the tools server
  (`serve.py`, 3187), which both serve this folder's top-level files only:
  `await eval(await (await fetch("http://127.0.0.1:3199/<file>?" +
  Date.now())).text())`.
- The order in a test tab: `boot.js` right after the navigation (from the
  tools server: `await window.__dvBoot`), then `act.js`, then the
  feature's own tools. In an editor tab without boot.js, `harness.js`
  first: it stops a save.
- An https page (mixamo.com) cannot reach the sink on 127.0.0.1: paste the
  helper's text into `javascript_tool` instead (`browser-pane.md`;
  `../space-people/mixamo.md`).

## Writing a helper of your own

An editor tab (`/?scene=<id>`) opens under the editor's plain light with
the houses alone drawn, not as a visitor sees it: for the look,
`?preview=1` or `await __K.realistic()`; for the surroundings, the scope
(`browser-testing.md`; the mechanisms are
`../walkthrough-editor/editor-plain-light-and-scope.md`).

- **An editor tab draws neither the scene's own meshes nor every frame**
  (since 2026-10-13). Under the plain light the house and the furniture
  are drawn by stand-ins — merged and instanced copies under the scene's
  "stand-ins" group — while the real walls and pieces stay in the scene,
  `visible`, on a layer no camera draws; and a tab at rest draws a frame
  only when something has changed. The skill's own helpers allow for
  both. One of your own must too:
  - walking `experience.scene`, pass over `userData.standIn`, or every
    surface is there twice (`zfight.js` called 552 of Wrenfield's 615
    clusters a surface against its own copy);
  - a Raycaster of its own needs `layers.enable(12)`, or it passes
    through the house — through what the stand-ins draw;
  - a mesh hidden or re-dressed by hand inside a wall or a piece needs
    `world.standIns.hear()` before the next still (it is otherwise in the
    picture for up to 16 frames more);
  - something added inside a piece or a wall below its root's own
    children (a test's marker, a helper) is not drawn at all until the
    stand-ins look that unit through again: since wave C the unit is left
    out of what three is handed (`StandIns.drawnScene`), and they look
    through four units a frame — on Ladonia about 320 frames. So hang it
    on the root, or in a group of your own in the scene;
  - whatever moves under a held unit works out its own world matrix
    (`speed-architecture.md`);
  - whatever waits on the app's own frames needs
    `experience.pace.set("always")` first, `set(null)` after
    (`browser-testing.md`);
  - and a tool that reads the collision after an edit,
    `sceneBuilder.settleCollision()`.

  The mechanisms are `../walkthrough-editor/stand-ins.md`,
  `../walkthrough-editor/rays-and-collision.md` and
  `../walkthrough-editor/frames-on-demand.md`. The realistic
  preview draws the scene as built, every frame.
- A helper that reads the scene graph reads what is drawn. The editor
  opens with the garden not made and the cars, the far ground and the
  neighbourhood hidden, so a check run there passes on what it never saw
  (the people's audit, z-fighting): ask for the scope first.
- A stub that answers every POST answers your own tool's: results sent to
  a server of yours from a harnessed tab never leave the page (keep
  `window.__realFetch`, or post through the sink: `browser-pane.md`).
- In a public view a person's rig not animated this frame is passed over
  by the matrix walk, so its bones' world matrices are the last render's:
  a tool that steps `world.update` without rendering (act.js, a timing
  loop) reads them stale — render once before measuring a figure
  (`speed-architecture.md`, People).
- Before trusting a tool another agent wrote, change the names it saves
  under (`browser-pane.md`).

## The pane, and placing the visitor

- **The pane**: hidden, it has no requestAnimationFrame: step the world
  and render by hand, or drive the app's own frames (`drive.js`).
  `experience.update()` by hand no longer starts a second loop, but in an
  editor tab at rest it is a frame in which no time passes
  (`browser-pane.md`). `javascript_tool` stops at 45 s —
  render 3–4 views per call. Camera rigs reset the pose every frame: step
  the world, then pose, then render once.
  The rest of the pane's quirks — the step order, video, pointer lock,
  tabs, stubs, warnings — are `browser-pane.md`.
- `Player.placeAt` and `teleport` take `spawn.yaw` in degrees. The
  scratch tools of 2026-10-16/17 passed radians (`yaw: Math.PI`, 3.14°),
  hidden because they set the camera's angles after.

## In-page audits beyond walk.js

- **What E and F do, at the same spots on two builds** — `act.js` (this
  skill's folder; through the sink: `await eval(await (await
  fetch("http://127.0.0.1:3199/act.js")).text())`, in an editor tab after
  harness.js or in a public view after its name prompt): `__act.doors({
  room })`, `drawers({ catalog })`, `switches({ room, part: "switch" })`
  list what there is; `stand(feet)` settles the capsule there, `aim(point)`
  turns the camera to it from the head, `look()` runs the look ray and the
  prompt once and returns `{ look, prompt, target }`, `press("E" | "F" |
  "Q", frames)` presses and steps the world, returning every event told;
  `spot(name, { feet, aimAt, door | part | light | car | state, key,
  frames })` is stand, aim, look, press, look, press again (to put it
  back), look; `run()` does Ladonia's five spots (a bedroom door of A2,
  a vanity-small's drawer, two ceiling switches — each from 0.9 m off the
  wall, turned off the square 10° at a time until the crosshair is on the
  switch: A1's bedroom's from 50°, by its wardrobe's side (since
  2026-10-17; from square on, E opened the wardrobe) — and the BMW from
  its driver's door) and times the look ray. It works on the build before
  2026-10-16 (`updateDoorPrompt`, `lookedAt*`) and after (`updatePrompt`,
  `target`), so `JSON.stringify(__act.run())` from each, compared, says
  what changed; an openable part's uuid differs from page to page and is
  named `<piece>/<node>`. A later kind's spot passes its own `state: () =>
  …`. Nothing is saved. A spot's second press is meant to put back what
  the first changed, but acts on whatever is offered by then: a door's
  leaf swings out of the crosshair, and E opens the nearest door instead
  (before the nearest door kept to the visitor's floor, `run()`'s A2
  bedroom door was left open in the public view and `a-f-beds-s-o0`,
  upstairs, opened; now the second press shuts it), so read `second.told`
  before trusting `last`. In the editor the cars are
  only there with the scope at All: `run()` shows them for the car's spot
  and puts the scope back. Checked on 2026-10-16 in the new build's public
  view: the five spots as the lanes had them, the look ray 0.045–0.077 ms
  a call, Q out of doors `{ count: 0, on: null }`. After wave A (lane B's
  opening furniture in, the merged build): the public view the same to the
  last field; the editor different only where the furniture changed — the
  vanity-small's drawer 8 mm further along the ray, and at A1's bedroom
  switch the wardrobe a-f025 in front of it now opens ("Open wardrobe").
- **The furniture's parts as the visitor meets them** — `openables.js`
  (this skill's folder, through the sink after act.js): `__openables.pieces()`
  (every piece with parts that open: its mode, its boxes, its labels),
  `walkIn(id, { part, open })` (stood 1.1 m before each part, walked at a
  point 0.3 m behind its middle, the part open or shut: `nearest` how near
  its shut face the capsule's axis came, `clear` how far its skin stayed
  from the part's shut box — negative is in it), `sameTriangles()` (the
  editor's furniture tree against what a publish collides, counted and
  hashed), `free(feet)`, `freeSpots(id, { step, margin, outside })` (an L
  or U kitchen's floor between its arms), `place("column" | "l", at,
  rotation)` and `removeTest()` (a hand-made fridge column or L kitchen,
  never saved). On Ladonia with lane B's GLBs, every part of the L and U
  kitchens open: worst `clear` 0.00–0.02 m (never in a carcass); a corner
  shower's door shut 0, open −0.22 to −0.24 (a way in: no box), the walker
  still short of the tray.
- **Sitting and the televisions** — `sit.js` and `tv.js` (this skill's folder,
  through the sink after act.js; `../visitor-interactions/sitting-and-tv.md`), and
  `seat-sweep.js` / `seat-sweep.py` for every seat at once.
- **The pool and the visitor's clips** — `pool.js`, `pool-look.js`,
  `clips.js`, `swim-trace.js`, `swim-checks.js` (`../visitor-interactions/swimming.md`,
  Testing); the water — `water.js`, `steam.js`
  (`../visitor-interactions/water.md`).
- **Q, the HUD, driving and clicking from above** — `lights.js`,
  `hud.js`, `birdcar.js` (`../visitor-interactions/picker-and-keys.md`; driving and
  the view from above, `../visitor-interactions/driving.md` and
  `../baked-view-lighting/birds-eye.md`).
- **Door swing, placement, and what is that patch** — the build-quality
  audits of a space (a leaf swept against the furniture, pieces in walls
  or floating, what a pixel is) are `../build-property-space/in-page-audits.md`.
- **A space's walk** — `walk.js` (`__walk.doors()`, `to()`, `free()`):
  the real player physics through every door both ways and along routes.
  It walks the collision as it stands, and first finishes a tree an edit
  left being built a slice a frame (`sceneBuilder.settleCollision()`:
  `../walkthrough-editor/rays-and-collision.md`).
- **A room's light by number** — mean luminance, the player placed and
  the world stepped, the realistic preview on:
  `../build-property-space/light-and-look.md` (Measure, don't judge by
  eye).

# The browser pane

What the Claude browser pane does to a test of the app, learned the hard
way: a hidden pane has no requestAnimationFrame and throttles its timers,
`javascript_tool` stops at 45 s, there is no pointer lock, and every tab
an agent opens is shared with the others. The rule never to act on a tab
of the user's server on 3000 is the repo's `CLAUDE.md`; an editor tab's
own light, scope and frames are `browser-testing.md`; timing anything is
`measuring.md`.

## Calls, steps and frames

- `javascript_tool` stops at 45 s. An asynchronous loop it started goes
  on in the page — assume a timed-out loop is still changing state — but
  a synchronous task running at that moment is ended with the call (wave
  C: a windows sweep in one long task was cut short twice). Run a long
  sweep in chunks with a yield between them, and poll in calls of 15 s or
  less. Never
  `await img.decode()` with the pane hidden (never settles). Read pixels in
  the same call as the render (`preserveDrawingBuffer` is false).
- `experience.update()` by hand no longer starts a loop of its own (until
  2026-10-13 each call did, and never stopped: 40 calls hung the tab) —
  there is one loop, whoever asks — but in an editor tab at rest it is a
  heartbeat's frame, in which no time passes (`browser-testing.md`). To
  step the world, set `e.time.delta = 1 / 60` (seconds) and call
  `e.world.update(); e.camera.update(); e.world.afterCamera()` a few
  times — the order `Experience.update` keeps; the water steps in
  `afterCamera`, and without it no tap runs or settles — then render once
  (`e.renderer.render()`, which runs `Realism.update`: the exposure snaps
  to its target after a camera jump of more than 3 m, and
  `e.renderer.realism.settle()` also draws a pending room probe). After
  posing a camera for a still outside harness.js, call
  `e.world.vegetation?.update(0.016)` before rendering, or the grass is
  culled for the old view.
- A hidden pane has no requestAnimationFrame: Publish stalls at "Checking
  for holes" and the preloader at 80% until the tab is fronted
  (`tabs_select` + a screenshot); `editor.enter()` does nothing until
  the visitor is in (`body.walkthrough-active`: `Editor.available`),
  which a hidden pane never reaches by itself — with frames driven and
  the name prompt passed it enters hidden too (2026-10-14, with
  `pace.state` then `"idle"`). When fronting isn't possible (an agent's background tab, the
  user away), drive the frames: `drive.js` (this skill's folder, through the sink)
  queues the app's requestAnimationFrame callbacks and runs them as fast as
  they come (`__driveOn()`, `await __drive(30000, () => done)`,
  `__driveOff()`) — a Ladonia publish took ~8 min driven, 2.5× faster than
  a hidden pane's throttled timers. If drive.js is loaded after the app
  has asked the browser for its first frame — harness.js, loaded first,
  waits for the world — nothing may ever be queued, and `__drive` spins
  over an empty queue (it returns millions of "frames", and nothing was
  drawn): call `experience.update()` once then (the frame the browser was
  asked for is dropped for the one asked after it), or start on the scene
  list and `__driveOn()` before opening the space. **An editor tab at rest
  asks for no frames at all** (`browser-testing.md`): `__drive` then
  returns its turns, not frames — `experience.pace.set("always")` for a
  tool that counts on them. Never judge a frame rate by real frames in a hidden,
  throttled or driven pane: time the render itself (`measuring.md`). A tab
  whose pane was never shown has a
  window of 0 × 0 and a canvas of 2 × 2: measurements run, and every
  frame saved is a blur. Before taking frames give it a size
  (`resize_window` to 1280 × 800, then
  `window.dispatchEvent(new Event("resize"))` and a few driven frames),
  and clear it (`preset: "desktop"`) when done.

## Sites behind a sign-in, clicks and downloads

Sign-ins (the user signs in, Claude downloads), clicks by script in a
`resize_window`-emulated viewport (a click by coordinate lands on the
wrong element: find the element by its text and call `element.click()`;
set a React `<select>` through `HTMLSelectElement.prototype`'s own
`value` setter, then dispatch a bubbling `change`), and catching a
download link in the page (wrap its `fetch` and `XMLHttpRequest`, return
the link from `javascript_tool`, `curl` it into the project) are
`../space-people/mixamo.md`, with the Mixamo flow itself. An https page
cannot reach the sink on 127.0.0.1: paste a helper's text into
`javascript_tool` instead.

## A test tab of the app

- The walkthrough waits on its name prompt: fill `#name-input`, click
  `#name-input-button`, then an avatar by its `data-avatar` —
  `.avatar-option[data-avatar="male"]` is Alex (avatar_male.glb: its
  Armature turned +90° at 0.01, no eye bones), `"female"` is Sam — never
  just the first one; wait for `body.walkthrough-active`. For stills
  alone, hide `.preloader`: the helpers, the realistic preview and the
  scope work without passing it.
- **Both skins.** Whatever moves the visitor's figure (sitting, swimming,
  climbing, a clip) is tried on both, each in a fresh page and in both
  views. boot.js clicks the option named by `window.__pickSkin` ("male" |
  "female", set before loading it), else the first; `pick.js` does the
  same for a prompt passed some other way (it moves that option first,
  and keeps it there). A boot that was "forced" (`__dvBooted.how`: 57 of
  145 loads on 2026-10-16/17) has whatever avatar the app made: read
  `experience.world.player.player.avatarSkin` before trusting the skin.
- **Before a first sit or swim stepped by hand**, await what a visitor's
  page would have fetched by then: `player.avatar.wear(experience)` (the
  visitor's clips), `world.seats.dress(player.avatar)` (Sitting Idle
  fitted) and, in a public view, `world.seats.catalogue()` (the furniture
  catalogue, which says which piece is a seat's own) — `__sit.ready()`,
  `__clips.ready()` and `__seats.ready()` do all three. Without them the
  first case runs on the stand-in clips, or with no piece counted as the
  seat's own.
- **No pointer lock in the pane.** Walk, look and press through the app's
  own methods: `player.actions = { forward: true, run: true }`, stepped,
  then cleared; `player.setMovementKey("Space", true)`, then `false`;
  `player.teleport({ position: [x, y, z], yaw })` (the feet; `yaw` in
  degrees, up off any seat and out of any water); `camera.angles.horizontal` /
  `.vertical` (radians); or a key as the keyboard sends it,
  `document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ",
  key: "q", bubbles: true }))` and its keyup (lights.js, birdcar.js) —
  the path a visitor's key takes: Player listens on `document` by
  `event.code`, Colliders' C on `window` (`../visitor-interactions/picker-and-keys.md`, Who
  hears a key first). Step the world after each (above). A tab whose boot
  was "forced" has `camera.pointerLockEnabled` set by hand.
- **Tabs, with several agents in one pane.** Each agent opens its own tab
  (`tabs_create`, then `navigate` with its `tabId`) and passes that
  `tabId` to every call; it never acts on another agent's tab, nor on any
  tab of the user's server on 3000; at the end it closes its tabs and
  says which they were. A `preview_start` after a `preview_stop` may
  navigate some existing tab to the server (twice on 2026-10-17, the same
  tab): leave that tab alone.
- **Video in a hidden or driven pane**: the browser presents no frames
  (`requestVideoFrameCallback` never fires), and the tab counts as hidden.
  Screens then uploads a frame each time the video's clock moves, once
  0.5 s have passed without one (`../visitor-interactions/sitting-and-tv.md`,
  Televisions), so a set plays — but no
  faster than the frames you drive. For pictures to compare, `tv.js`'s
  `freeze(t)` holds it at a time. To test a pause on a hidden tab, force
  `document.visibilityState` (as for the frame-rate guard,
  `../baked-view-lighting/frame-guard.md`).
- An editor tab opens under the editor's plain light with the houses alone
  drawn — by stand-ins, and at rest not drawn at all (`browser-testing.md`;
  `in-page-tools.md`, Writing a helper of your own): `?preview=1` or
  `await __K.realistic()` before any frame that is judged for its light;
  `layers.enable(12)` on a Raycaster of your own; `userData.standIn`
  passed over by whatever walks the scene.
- three isn't on `window`: take constructors from live objects
  (`camera.position.constructor`) or import `/assets/three-<hash>.js`.
- Stub every non-GET fetch before driving the editor in a test tab
  (harness.js does; ad-hoc scripts don't): one unstubbed test autosaved a
  coffee table into the user's scene. A test server over a copy of the
  scenes (`SCENES_DIR`: `test-servers.md`) is the guard before that one. A stub that answers *every* non-GET
  swallows a publish too: after four minutes of walking the panel says
  "Couldn't publish: Cannot read properties of undefined (reading 'view')"
  — the stub's `{}` read as the server's answer (2026-10-11). Let
  `/publish`, `/versions/<v>/runtime` and `/bake` through, as harness.js
  does — and it does so by the path alone, on whatever server the tab is
  of: it looks at no port. So a publish clicked in a harnessed tab of a
  server whose `PUBLISH_DIR` is the repo's `published/` is a real one:
  publish only from a tab of the scratch publish server
  (`../publish-and-bake/SKILL.md`). The same stub answers a
  tool's own POSTs: results sent to a server of yours from a tab with
  harness.js loaded get `{}` back and never leave the page (2026-10-10: a
  profile's raw rounds, lost). Keep the page's real fetch before the
  harness is loaded (`window.__realFetch ??= window.fetch.bind(window)`),
  or post through the sink, which the stub lets through.
- Before reusing an earlier agent's tool, change the names it saves
  under: a frame-taker run as it was writes over the frames its author's
  report cites (2026-10-11: one grid of a review's, lost).
- A warning from a load's first frames is missed by a hook put in after
  the page has loaded, and a hidden tab draws no frames while it loads, so
  the warning may not come at all (2026-10-10: "Texture marked for update
  but no image data found", the terrain's normal map copied before its
  picture was in — seen in the pane's console, never by the hook). Start
  on the scene list (`/`, no space open), wrap `console.warn` there, load
  `drive.js`, `__driveOn()`, then click the space's card
  (`[data-scene="<id>"]`) and `__drive`: frames run from the first, as a
  visible tab draws them.
- Expected noise: a 404 for an unpublished space's manifest, and
  ERR_CONNECTION_REFUSED from the multiplayer socket. Find real failures
  with `performance.getEntriesByType("resource").filter(e =>
  e.responseStatus >= 400)`. Missing catalogue pieces mean the build the
  server serves is stale — the `dist` of the folder it was started in
  (`test-servers.md`): build again, into the same folder.
- Don't `SendMessage` a subagent that is still working
  (`parallel-lanes.md`, Running the agents).

## Touch, weaker devices, a lost context, the guard and the exposure

- **Touch, in the pane**: `resize_window` with the mobile preset, then
  reload — the scheme is chosen as the page loads (`camera.scheme ===
  "orbit"`, `body.input-touch`). A click on `#touch-action` runs
  `runAction` by the prompt's key. The stick is nipplejs: drive it by
  touch pointer events on its zone, or set `player.joystickVector` and
  `actions.movingJoyStick` (at the wheel `steerWithJoystick` reads them,
  ±0.3 to count). Put the preset back (`desktop`) after
  (`../visitor-interactions/picker-and-keys.md`).
- **What a weaker device is given**: `?rated=0…4` (the device rated that
  low, never higher than it is) or `?quality=0…4`; `?uncapped` lifts the
  ceiling for a developer (not on touch). `test-tabs.md`, A link's words;
  `../baked-view-lighting/lighting-modes.md`, Ceilings on what a device
  is asked for.
- **A lost graphics context in a public view on show**: force
  `Object.defineProperty(document, "visibilityState", { get: () =>
  "visible", configurable: true })`, then `WEBGL_lose_context` on the
  app's canvas; remove all four keys after (`render-quality`,
  `view-lighting`, `view-lost-graphics`, and `view-reloaded-at` in
  `sessionStorage`: `test-tabs.md`, What a browser keeps;
  `../baked-view-lighting/lighting-modes.md`).
- **The frame-rate guard does nothing in a hidden pane**: put
  `?guard=off` on every public link timed, and test the guard by
  `guard.feed(ms)` (`../baked-view-lighting/frame-guard.md`).
- **A still right after posing shows the last view's exposure** in a
  baked view: draw frames with an `await` between them until
  `renderer.realism.meter.fresh`, then set `realism.lastAt = null` and
  draw once more; a synchronous loop of renders never gets a reading
  (`../baked-view-lighting/light-meter.md`).
- **A stale console error**: the pane's console keeps the previous
  load's messages. Tell a new shader error from an old one by
  `renderer.debug.onShaderError`, installed after load and render, or by
  counting `renderer.info.programs` with failing `diagnostics`
  (`../walkthrough-editor/three-pitfalls.md`).

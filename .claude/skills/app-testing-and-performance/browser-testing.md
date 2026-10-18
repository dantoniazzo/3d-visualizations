# An editor test tab: its light, its scope and its frames

An editor tab (`/?scene=<id>`) is not what a visitor sees, and at rest it
draws nothing: what a test tab must ask for before a frame is judged or a
tool counts frames. The mechanisms — the plain light, the Realistic
preview (P), the House / Exterior / All scope, frames on demand — are
`../walkthrough-editor/editor-plain-light-and-scope.md` and
`../walkthrough-editor/frames-on-demand.md`; a public view has no plain
light, and its look is `../baked-view-lighting/`. A link's words and the
browser's stored keys are `test-tabs.md`; the pane's own quirks
`browser-pane.md`.

## The plain light and the view scope, in a test tab

- **In a test tab:** a frame taken as an editor tab opens has no sun,
  shadow, lamp light, room glow, post-processing, tree, hedge, grass, car,
  far ground or sky in it. Whatever judges the look — a reference frame, a
  mean level, a night — needs the realistic preview first: `?preview=1` in
  the link, or `await __K.realistic()` (harness.js: `world.setPreview(true,
  { remember: false })`, then the post-processing's chunk and the garden's
  trees awaited — 5 s on Ladonia), which shows everything too. It holds in
  the walkthrough only: edit mode is always plain. Whatever only needs the
  surroundings there — z-fighting, the people's audit, a look at the garden
  under the plain light — needs the scope: `?scope=all`, or
  `__K.scope("all")`. `__K.render`, the views file's `__renderSet`,
  people-audit.js and zfight.js ask for what they need themselves
  (2026-10-12: as the editor opens the garden is not made, so the people's
  audit had no hedge, planter grass or tree to measure against, and
  zfight.js no car, far ground or neighbourhood); `walk.js` needs neither
  (collision is the same in every scope). Neither call keeps anything in
  the browser; the HUD's and the menus' own controls do (`editor-preview`,
  `editor-scope`: remove them after a test that clicked). Say of every
  editor frame and timing which light and scope it was taken in.
- Say of every frame and timing of a public view which lighting mode it
  was taken in (baked, static or live: `w.lightingMode`;
  `../baked-view-lighting/lighting-modes.md`), as of every editor frame
  which light and scope.

## When the editor draws, in a test tab

- **In a test tab** — the pane is hidden, so nothing is ever a real frame:
  - `__drive` runs the app's frames *as they are asked for*: in an editor
    tab at rest it spins over an empty queue and returns its turns, not
    frames. Count frames by `experience.pace.stats` (`frames`, `awake`,
    `rest`, `beat`, `always`, `skipped`, `wakes` and `busy` by name) or
    `renderer.frames`. A tool that counts on frames — "drive 400 ms, then
    read" — needs `experience.pace.set("always")` first (and `set(null)`
    after), or `?frames=always` in the link; a step that waits for
    something to come to rest can wait for `pace.state === "idle"`.
  - The heartbeat is a 500 ms timer: a hidden pane's come once a second,
    and once a minute after five minutes — use short timers (`measuring.md`,
    Timers in a hidden pane; `fast.js`).
  - `experience.update()` by hand is now safe: one loop at a time, whoever
    asks (a frame already asked for is dropped for the one asked after).
    At rest it is a heartbeat's frame: no time passes in it.
  - Stepping the world by hand (`e.time.delta = 1 / 60; w.update();
    e.camera.update(); w.afterCamera(); R.render()`) is untouched by any of this, as are
    `__K.time`, `__K.shot` and every tool that calls `renderer.render()`.
  - Synthetic pointer and key events wake it as real ones do; a change made
    through the editor's functions with no event (`ed.undo()`,
    `world.setFinish`, `switches.toggle`) is drawn at once too — they emit.
  - `?stats`: frames a second are those drawn, marked "(drawn on demand)".
- After a night toggle or a switch, a frame taken at once has no lamp
  light yet: wait for `!world.lampPool.entering && world.lampPool.settled`
  (`../walkthrough-editor/lights-and-fittings.md`; the waits for a room
  lit live, a first night's layers and an exposure are `measuring.md`,
  Frames that are not what they seem). To time a first build of the
  lamps' shaders honestly, make a variant the browser has never seen (add
  one, two, three… hidden point lights and prepare those).

# The editor's plain light and view scope

Moved from app-notes.md, "The editor's plain light and view scope"; its
third part, the stand-ins, has a file of its own (stand-ins.md). Every frame time here
is one Mac's (an Apple M4 Pro) unless it says otherwise; how they were
taken: ../app-testing-and-performance/SKILL.md (measuring).

What an editor tab (`/?scene=<id>`) draws as it opens is not what a visitor
sees: one plain light, the houses alone — and, since 2026-10-13, not the
scene's own meshes but stand-ins for them (stand-ins.md). All three came
of the performance work of 2026-10-10/14 (history.md here, 2026-10-13;
../baked-view-lighting/history.md, 2026-10-12;
../app-testing-and-performance/history.md) — the editor
is to be fast to work in — and all three change what a test tab shows and
what a helper that reads the scene finds. Read this before taking a frame
in one, and frames-on-demand.md before waiting for one.

- **The editor's plain light** (`World/PlainLight.js`): edit
  mode is always drawn under one fixed rig — an ambient light (0.35), a
  hemisphere light (0.7) and one unshadowed directional (1.7) from over the
  camera's shoulder, exposure 1 whatever the garden's setting, the day's sky
  at 0.3 to reflect, no fog — the same by day and at night; and so is the
  editor's walkthrough unless **Realistic preview** is on (`P`, the HUD's
  button, the View menu, the header's button,
  `world.setPreview(true, { remember: false })`,
  `localStorage["editor-preview"]`, `?preview=1`). `world.plain` says which.
  Under it every other light is out of three's light state — on no layer
  (`light.layers.mask === 0`), not hidden, not at 0 — RoomGlow is out of the
  shaders (`roomGlow.setShown`), `Realism.update` and `settle()` return at
  once, and LampPool, RoomGlow, the room probe, the sun's shadow map and
  the post-processing do not exist until the preview (or a publish, which
  holds the scene realistic meanwhile: `world.holdRealistic()`) first asks
  for them. So to look at or test live light, shadows, glow or the look,
  `await world.setPreview(true, { remember: false })` first: a frame taken
  as the editor opens shows none of it. Day and night under it differ only
  by the sky behind and the lamps' glass. Anything that makes a light must
  hand it to `world.plainLight?.keepOut(light)` there (CarLights, Openables,
  LampPool, Flora do): let into the light state for one frame, it has every
  shader built again. A public view has no plain light.
  - A publish from the plain view holds the scene realistic *without
    drawing it* (`experience.suspended` from the hold to its release): the
    canvas stands still for the whole publish, and afterwards the sun's
    shadow map, the room probe and the realistic programs still do not
    exist (`environment.sun.shadow.map === null`). The files are the same
    as from the preview (checked 2026-10-10: binary chunks identical, JSON
    apart only in the timings and the pool's clock).
  - The time of day and the change of light take turns (`world.inTurn`):
    `setLighting` and `relight` asked for at once end as the last asked,
    never mixed. Going over to realistic waits for the sky's light to load
    (the dusk's HDR on a first night), so `world.plain` is still true right
    after `setPreview(true)`: await its promise before reading or testing.
- **The editor's view scope** (`World/Scope.js`,
  `localStorage["editor-scope"]`, `?scope=house|exterior|all`): the editor
  opens in **House** — the houses and their yards only. The garden
  (`world.vegetation`: Flora or Vegetation) is then *not built*
  (`vegetation.planted === false`, its group empty) until a scope that shows
  it, the realistic preview or the Garden panel first asks; the far terrain,
  the neighbourhood and the cars are hidden (`visible = false`), the sky's
  dome is on no layer and `scene.background` is a flat colour. **Exterior**
  hides the houses' insides instead (Collections.inScope: floors, ceilings,
  walls with indoor rooms on both sides, indoor furniture, stairs, rails,
  light fittings; indoor people are left undrawn but still collide). So
  before judging trees, grass, cars, the sky or anything out of doors in an
  editor tab: `world.scope.set("all", { remember: false })` (or load with
  `?scope=all`), and wait for `world.vegetation.treeSet.kinds.size` to reach
  its species. `world.scope.current` is what is drawn now ("all" under the
  realistic preview and while a publish holds the scene);
  `world.scope.exterior` whether the surroundings are. A room or level focus
  hides the surroundings in every scope — but not a car that stands in the
  room or on the floor in focus (`scope.cars` says only whether cars are
  drawn at all; the editor shows each by where it stands) — and puts the
  flat colour behind it, the Garden panel open or not. A floor or a room
  indoors focused on in Exterior widens the view to All with a toast, as a
  selection does; Exterior picked with one in focus lets the focus go. In
  House, Home frames the houses and 12 m of yard round them
  (`collections.propertyBox()`), not the street's whole length. Collision,
  saving and publishing are the same in every scope; the hills behind a plot
  stay (hidden, they would leave a hole in the ground they are cut out of).
  Anything new that is drawn out of doors and is not a collection's must be
  hidden in `Scope.apply`, or it shows in House.

## Elsewhere

- **In a test tab** — what a frame taken as an editor tab opens lacks,
  `?preview=1` or `await __K.realistic()` for the look, `?scope=all` or
  `__K.scope("all")` for the surroundings, which tools ask for these
  themselves (`__K.render`, `__renderSet`, `people-audit.js`, `zfight.js`;
  `walk.js` needs neither), the `editor-preview` and `editor-scope` keys
  to remove after a test that clicked, and saying of every editor frame
  and timing which light and scope it was taken in:
  ../app-testing-and-performance/browser-testing.md.
- **What it bought** — the timings of the plain light and the House scope
  (2026-10-12) and of the stand-ins, indexed rays, kept trees, frames on
  demand and the outline (2026-10-14); what that sitting found slower and
  did not mend; the one-off costs the plain light moved (the first switch
  to All 1.6 s on Ladonia, the first preview 3.6 s, the first turn towards
  the villas 0.4–0.6 s, and what the preview makes staying allocated until
  the page reloads): ../app-testing-and-performance/speed-architecture.md.
  Compare within a sitting only: the same build read 4.3–4.5 s to load in
  one sitting and 6.5–6.7 in the other.
- The app-wide live look the realistic preview draws (exposure, the
  outdoor and indoor shares, the glass, the probe, `Sky.glowIndoors`,
  RoomGlow) is changed only as a proposal: ../build-property-space/light-and-look.md.
  Say of every frame which it is: plain, lit live, or baked and in which
  mode.
- Verifying a space by its pictures (the references side by side, day and
  night, `/view/<id>?live` against plain `/view/<id>`, the editor's House
  scope against `?scope=all`): ../build-property-space/verifying.md.
- By day the rooms daylight does not reach start lit in the realistic
  preview as in a public view (`LiveSwitches.startsOn`, `World.daylit`),
  not under the plain light nor while a publish holds the scene:
  ../baked-view-lighting/switches.md.
- The indoor sky's light is upside down (`Sky.indoorLight`; found, not
  changed): every view lit live has it, the realistic preview included —
  ../baked-view-lighting/live-room.md, Still short.
- A public view has no plain light, and its light is the bake's:
  ../baked-view-lighting/SKILL.md. The editor's live light is the
  realistic preview's, as is a version published unbaked ("Lit live — as
  in the editor"): lights-and-fittings.md.

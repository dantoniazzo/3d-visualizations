# When the editor draws: frames on demand, and the outline

Moved from app-notes.md, "When the editor draws" (2026-10-13; the
interactables' `busy()` and the climb out of a pool added 2026-10-16).
How to drive frames in a test tab — `__drive`'s turns against frames,
`pace.set("always")`, the hidden pane's heartbeat timers, stepping the
world by hand, `?stats` — is ../app-testing-and-performance/browser-testing.md.
Every frame time here is one Mac's (an Apple M4 Pro), its pane hidden,
unless it says otherwise.

Since 2026-10-13 the editor under its plain light draws a frame only when
the picture may have changed (`Experience/Pace.js`, `experience.pace`), and
its selection outline no longer draws the scene again
(`Editor/SelectionOutline.js`). A public view has no Pace and draws every
frame, as before. Read this before driving frames in an editor tab, before
adding anything that changes the picture without the user's hand, and
before touching what `Editor.render` draws after the scene.

- **What asks for a frame.** (1) *Something happened* — `experience.wake(why)`:
  any pointer, wheel, key, input or focus event anywhere on the page; every
  event the world, the editor, the people, the window's size and the
  camera's lock emit (their `emit` is wrapped: nothing has to be listed —
  `tick` alone is left out); three's loading manager, as each model, picture
  or sky arrives; another visitor moving (Player's socket); the quality
  slider; a restored context; `EditorCamera`'s every move,
  `Editor.applyVisibility`, `Editor.onSessionUpdate`,
  `World.gardenChanged` — and frames go on for 250 ms after the last of
  them (350 after the view last moved). (2) *Something is still moving by
  itself* — `pace.busy()`, asked after every frame: the view, a door or a
  drawer easing, the visitor walking, falling or driving, another visitor's
  figure not standing still, a collision tree built a slice a frame
  (`dynamicKeeper.job`), the stand-ins waiting to merge or to trim
  (`standIns.waiting`, `standIns.loose`), and since 2026-10-16 whatever a
  registered interactable says it is still moving
  (`world.interactables.busy()`, after the doors and drawers: a furniture
  part, a window's sash, a seat being sat on or got up from — the figure
  gliding, the view turning — a television's 0.3 s fade, and the water
  (`"water"`: starting or stopping anywhere, running or steaming within
  `NEAR` 8 m of the camera in the walkthrough, never in edit mode), by the
  kind's name; at rest nothing changed — ../visitor-interactions/picker-and-keys.md); and
  the visitor climbing out of a pool (`"climbing"`, a line of Pace's own:
  `player.swimmer.climb` or `toEdge`). Another visitor's figure playing
  "idle", a "sitting…" clip or "treading" (treading water where it
  floats) stands still (`AT_REST`); a television playing is not busy:
  seated before one the
  walkthrough draws at the rest rate (59–61 frames in 2 s), and edit mode,
  where the video pauses, at the heartbeat. (3) *A heartbeat*: at rest, one
  frame every 500 ms all the same, in which no time passes
  (`time.resume(0)`) and the stand-ins look at every mesh — so a change
  nothing announced (a tool's `door.toggle()`, a material swapped by hand)
  is on screen within half a second, and whatever it set moving is then
  seen to be.
- **What it draws when.** `pace.state`: `"always"` — every frame: the
  realistic preview (`world.plain` false or wanted), a publish (held or
  suspended), the page until the space is furnished and the visitor is in
  (`walkthrough-active`), `?frames=always`; `"awake"`; `"rest"` — 30 frames
  a second: the walkthrough standing still, and edit mode while a person is
  selected or being placed; `"idle"` — the heartbeat alone: edit mode
  otherwise. Measured, driven for 5 s with nothing touched: Ladonia's edit
  view 10 frames (the heartbeat's: 20 calls of `renderer.render`, the scene
  and the gizmo's overlay each; 110 in a second and a half before),
  Wrenfield's the same; the walkthrough standing, a frame every 30.3 ms
  driven — 30 a second on a display. In the final sitting (2026-10-14):
  an edit view of Ladonia left alone 10 s drew 19 frames, the build before
  every frame it was offered; its walkthrough standing, 163 frames in 5 s
  of 7.9 ms each.
- **What holds still at rest in edit mode**: the people's clips, the
  visitor's own figure, the pool's ripple, the wind (with the garden shown).
  They go on from where they were whenever frames are drawn for another
  reason, and the people play while one of them is selected. A heartbeat's
  frame moves none of them (`People.tick(delta, hold)`, `delta` 0).
- **A new thing that changes the picture by itself** needs one of: an event
  on the world or the editor (anything emitted is heard), a call of
  `experience.wake("why")` (free, and a no-op in a public view), or — if it
  goes on moving — a line in `Pace.busy()`, or, for something the visitor
  acts on, its provider's `busy()`. Without, it is drawn at the
  next heartbeat, and only as far as a frame with no time passed takes it:
  something that eases by `delta` and is in none of `busy()`'s lines would
  stand still at rest.
- **In a test tab** the pane is hidden, so nothing is ever a real frame. A
  tool that counts on frames needs `experience.pace.set("always")` first
  and `set(null)` after, or `?frames=always` in the link (`boot.js` sets
  the pace to "always" in an editor tab); the rest — `__drive`'s turns
  against frames, the heartbeat's timers, stepping by hand, `?stats` — is
  ../app-testing-and-performance/browser-testing.md.
- **Checked 2026-10-13** (Ladonia; each step with the app at rest, its own
  frames driven, the picture before, the first frame after, the last frame
  at rest and a frame drawn afresh by hand compared): orbit, pan, zoom,
  numpad views, orthographic, frame-all and frame-selected; a click's
  selection, the gizmo's hover, deselect; G with pointer moves, a typed
  move, a rotation, a cancelled move, the gizmo's arrow; undo and redo; a
  piece added whose model was not loaded, duplicated, deleted; a property
  and a finish changed; X-ray, the eyes, a room and a floor in focus; the
  three scopes (the garden made, its trees arriving); day and night; a
  light by its panel, its switch and a Ctrl-click; the Garden panel and its
  sliders; a door and a drawer (by their own `toggle()`, nothing told: the
  heartbeat saw them 0.14–0.51 s later, then every frame of the swing); a
  person added, selected, taken away; a window slid along its wall; the
  sidebar and the toolbar; the quality slider; Tab both ways; walking from
  both modes; another visitor walking in a second tab; a context lost and
  restored; a publish (every frame while it holds the scene, the view drawn
  again after). In every one the first frame after showed the change and
  the frame at rest was the frame drawn afresh, to the pixel (94 steps in
  one page of Ladonia, 50 of Wrenfield). A drag of 300 pointer moves drew
  300 frames, one a move: Ladonia's whole property orbited 10.0 ms median,
  17.2 at the 99th, 19.4 the longest; a sofa moved in a room 6.6, 12.4,
  14.3 (its pointer handler 2.6 median, 3.9 the longest).
- **The selection's outline** is three's OutlinePass to look at —
  its own edge, blur and overlay shaders, taken from it — without its second
  draw of the scene. The frame is drawn straight to the screen, whose depth
  cannot be read but can be drawn against: within the rectangle the
  selection covers, the picture is kept (copied to a texture), the
  selection's own meshes are drawn onto the screen twice — its whole shape,
  then what the frame's depth lets through — as the red and green of
  OutlinePass's mask, the mask copied out, the picture put back, and the
  outline made from the mask and added. Ladonia, a chair selected (best /
  median ms a frame added): 4.4 / 4.5 in a room, 9.7 / 11.7 over a villa
  and 13.4 / 12.2 over the whole property before the stand-ins; 3.8 / 4.0,
  5.5 / 8.4 and 6.5 / 8.3 with OutlinePass over the stand-ins
  (`?outline=pass`, kept for comparing); **1.2 / 1.4, 1.0 / 1.3 and 1.2 /
  1.4 now**, a sofa filling the screen 1.6 — almost all of it the three
  times the screen's own picture is left and come back to (two copies, one
  trip off screen), not the selection's size.
  - **What differs to look at**: what is seen through an X-rayed wall,
    ceiling or roof, or through a piece's own see-through glass (a shower's
    screen) — which write no depth — is outlined as seen, in amber, where
    OutlinePass drew it dim; a window's or a door's pane does write depth,
    and what is behind one is dim as before. The outline's inner edge is
    antialiased with the picture (300–3,200 of 2.4 million pixels differ
    by more than 8 levels from OutlinePass's, all on the line itself). With
    the gizmo drawn, some 25–40 pixels where its edges cross the scene's
    inside the rectangle differ by up to 14 levels from a frame with no
    outline (the samples under them were put back as one colour); with no
    gizmo the picture round the outline is put back to the byte.
  - It reads the screen mid-frame (`copyTexSubImage2D` from the canvas):
    nothing may be drawn over the scene's depth between `renderer.render`
    and `outline.render` in `Editor.render`, and the canvas must stay the
    render target there. `outline.last` is the last rectangle and mesh
    count. Not tried on another GPU: on this one the cost is the render
    passes it breaks, a millisecond whatever the selection's size.

## Elsewhere

- Two measurements of this part of the editor that were not built on —
  a lower resolution while moving (0.2–1.5 ms) and the longer first frame
  after a rest, the GPU's doing — are with the editor's other speed
  figures: ../app-testing-and-performance/speed-architecture.md.
- What a public view draws every frame (it has no Pace):
  ../baked-view-lighting/SKILL.md.
- The handles `e.pace`, `e.wake`, `e.update`, `e.renderer.frames` and the
  link's `?frames=always`, `?outline=pass`: links-and-handles.md.
- A kind the visitor acts on says it is still moving by its provider's
  `busy()`: ../visitor-interactions/SKILL.md.

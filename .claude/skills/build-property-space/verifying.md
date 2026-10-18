# Verify like a photographer

With the test server and sink up (`../app-testing-and-performance/test-servers.md`),
load `harness.js` and the project's views file in the page (both in
`../app-testing-and-performance/`, through the sink), and render the same
views as the references side by side with them. Compare honestly:
massing, colours, window rhythm, planting, furniture. Check day and night,
the public view (`/view/<id>?live` for current work — plain `/view/<id>`
is the last publish), the walkthrough (`/?scene=<id>`) and the editor.

- **An editor tab does not open as a visitor sees it.** `/?scene=<id>`
  opens under the editor's plain light — no sun, shadows, lamps, room glow
  or post-processing, the same by day and at night — with the houses alone
  drawn: no garden, cars, far ground or sky, the garden not even made. The
  user's editor is to be fast to work in
  (`../app-testing-and-performance/speed-architecture.md`). Reference
  frames, light levels and nights need the realistic preview —
  `?preview=1` in the link, or `await __K.realistic()`, which
  `__renderSet` and `__K.render` call themselves — and anything that only
  needs the surroundings needs the scope (`?scope=all`,
  `__K.scope("all")`; the mechanism:
  `../walkthrough-editor/editor-plain-light-and-scope.md`). Check both: the plain view is what the user
  works in, the preview what they publish.
- **Nor does it draw the scene's own meshes, or every frame**: under the
  plain light the house and furniture are drawn by stand-ins, and a tab at
  rest draws only when something changes. What a helper of your own must
  allow for (pass over `userData.standIn`, `layers.enable(12)` on a
  Raycaster, `world.standIns.hear()`, the pace, `settleCollision()`):
  `../walkthrough-editor/stand-ins.md` and
  `../walkthrough-editor/frames-on-demand.md`. The realistic preview draws the scene
  as built, every frame.
- **Calibrate each reference's pose before critics see anything**: find on
  the plan which building, terrace or room it shows, render ~4 candidate
  poses in one sheet at the reference's aspect, pick by features (which way
  a stair climbs, which corner a recess is on). Keep poses in the
  project's views file (its `__POSES`), never typed straight into the page,
  where a reload loses them. Check each pose against walls *and* furniture;
  looking along (fx, fz), screen-right is (−fz, fx). For exact poses, solve
  the reference's camera from 8–10 known points (building corners, window
  heads).
- **Frames side by side**: `models/pair.mjs` puts a listing render above
  our frame from the same camera, for your own eye; critics get blind pairs
  from `prep_review.mjs` (`review-rounds.md`). `compare.mjs`
  (`../app-testing-and-performance/compare.mjs`; `../publish-and-bake/SKILL.md`)
  lays out render | live | baked rows, each tile labelled with its mean
  luminance. Light levels are measured, not judged: `light-and-look.md`.
- **The browser pane** (hidden, it has no requestAnimationFrame;
  `javascript_tool` stops at 45 s: render 3–4 views per call; camera rigs
  reset the pose every frame — step the world, then pose, then render
  once): `../app-testing-and-performance/browser-pane.md`.
- **Other spaces**: check them against the committed code, not by eye —
  HEAD in a scratch worktree, its own server, the same publish folder,
  the same view compared (that is how Wrenfield's black published lawn was
  found): `../app-testing-and-performance/test-servers.md`, other spaces.
  Do it whenever a change touches anything app-wide (a shared finish or
  generator, a value of `light-and-look.md`).
- **Before blaming your change** for a fault you see, render the same pose
  on the previous published version: an old fault is a separate task, not
  a fix in passing (`in-page-audits.md`).

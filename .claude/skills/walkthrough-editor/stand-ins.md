# The editor's stand-ins

How the editor draws the house merged and the furniture instanced under
its plain light, draws pieces whose fronts open whole, and holds still
what it draws — and what all that asks of any code or helper that meets
the scene. Moved from app-notes.md, where it stood in "The editor's plain
light and view scope": the stand-ins are of 2026-10-13, the pieces drawn
whole of wave B and the hold of wave C (both 2026-10-16). Read this before
writing a Raycaster, a helper that walks the scene, or anything that
moves or is added inside a wall or a piece in the editor; the rules for an
in-page helper are gathered in ../app-testing-and-performance/in-page-tools.md.
Every frame time here is one Mac's (an Apple M4 Pro) unless it says
otherwise.

- **The editor's stand-ins** (`World/StandIns.js`, `Utils/layers.js`; since
  2026-10-13): under the plain light the house and the furniture are not
  what is drawn. The building — walls with their fixed joinery, slabs,
  roofs, rails, flights, the rooms' light fittings — is drawn as one merged
  mesh a material over the whole property (a "bucket", its triangles in
  world space), and the furniture as one InstancedMesh for each geometry
  and material that two or more meshes share (a "batch"). Both hang from
  `scene.getObjectByName("stand-ins")`, each named `stand-in:<its material
  or mesh>` with `userData.standIn`, and draw with the real meshes' own
  material objects — so whatever changes a material in place (a switch
  lighting a bulb's glass) shows without being told. The frame was the
  time three takes to hand thousands of small meshes to the GPU one by
  one — a wall panel alone is six draws, a face each — not the triangles.
  Before the stand-ins the editor's house was not merged at all, and that
  was most of what the plain light had left of a frame
  (../app-testing-and-performance/speed-architecture.md).
  - **The real objects are untouched** — in the scene, `visible`, with
    their materials — and are what picking, snapping, the fit test,
    collision, undo and a publish read. A real mesh that a stand-in draws
    is only moved off layer 0 onto `REAL_LAYER` (12): no camera draws it,
    and every Raycaster of the app looks at that layer too (`seeReal`).
    **A new Raycaster that meets the house or the furniture in the editor
    needs `seeReal`, or it passes through everything a stand-in draws** —
    an in-page tool's too (`raycaster.layers.enable(12)`: tried
    2026-10-14 from inside Wrenfield, five rays met 2, 1, 2, 2, 1 things
    without it and 2, 1, 8, 2, 2 with), and one whose ray is cast through
    the index (`rays.cast`, rays-and-collision.md) as much as one
    cast by three; nothing else about a mesh says it is hidden
    (`mesh.layers.mask === 4096`).
  - **A helper that walks the scene meets both** — the real meshes, still
    `visible`, and their copies. One that measures what is there (a
    z-fight finder, a count of triangles) must pass over `userData.standIn`
    or it has every surface twice: `zfight.js` as it stood called 552 of
    Wrenfield's 615 clusters a surface against its own stand-in (mended
    2026-10-14: with the stand-ins on and off it now gives the same 63).
    One that walks `sceneBuilder.root`, the builder's lists or the
    collision (`people-audit.js`, `walk.js`) never meets them: the group
    hangs from the scene itself, and is in no list a ray, the collision, a
    merge or a publish goes through. Run that day on the new build:
    people-audit's six flags on Ladonia as on 2026-10-10, walk.js's 85
    doors with the one `noSpot`.
  - **Drawn as themselves, as before**: whatever is selected or being
    moved (the outline draws the real meshes, and against the depth they
    drew in the frame); a part of the building for
    a quarter of a second after it was built again (a window dragged along
    its wall rebuilds the wall and every room's fittings at each step:
    nothing is copied until it stands still — `standIns.waiting` counts
    them, `standIns.settle()` merges them now); anything see-through
    (glass, X-ray: three sorts those one by one); a wall's door leaves; a
    mesh that is the only one of its geometry and material, or mirrored or
    sheared; the ground, the landscape, the cars, the people. Of a
    building that is an imported model (`isModelScene`) no wall, slab,
    roof, rail or fitting is merged — only flights are, and its furniture
    is instanced; none of the three spaces is one, and it was not tried.
  - **Nothing has to tell it what an edit changed.** Each frame
    (`Renderer.render` / `Editor.render` call `standIns.update(camera)`) it
    looks at the builder's own lists — a part built again is a new group —
    and at each unit's root: its children's number, whether it and
    everything over it is shown, and, for a flight or a piece alone
    (`unit.moves`), where it stands. A wall, a room's slab, a roof, a rail
    or a room's fittings is never looked at for moving: it is built again
    (a new group, and so a new unit), and while held (below) its position
    is not read at all — that read was a quarter of a millisecond a frame
    for Ladonia's 650 such units (`StandIns.check`). **Code that moves one
    in place leaves its stand-in drawn where it was: build it again
    instead.** What each mesh *inside* a unit wears, and
    whether it is shown there, is looked at when the world emits
    `finish-changed`, `scene-edited`, `furniture-ready`,
    `fittings-rebuilt`, `scope`, `mode`, `lighting`, `preview` or
    `switches-ready`, when the editor emits `settings`, `changed`,
    `selection` or `mode`, at every heartbeat of a view at rest
    (frames-on-demand.md), and in turn every 16 frames besides. **So a change
    inside a unit that rebuilds and moves nothing and emits none of those —
    a mesh hidden by `visible`, a material swapped by hand — is drawn up
    to 16 frames late**, and a still drawn by hand straight after it shows
    the old picture (2026-10-14: a wall's panel hidden by `visible` went
    from the frame 13 frames on, and in a second trial one frame on and
    was back 16 frames after it was shown again — it is the unit's turn
    in sixteen that decides; after `world.standIns.hear()`, in the
    next). Call `world.standIns.hear()` after such a change. Hiding a
    wall's, a room's or a piece's own group is seen in the next frame.
  - **Only under the plain light.** The realistic preview and a publish
    take the scene as built (`setActive(false)` from `World.switchLight`:
    every mask back to 1, the stand-ins hidden), so a publish is the same
    files (2026-10-13: every binary chunk of `view.glb`, `snapshot.glb` and
    `runtime.glb` identical to the publish before, the stats equal).
    `?standins=0` in the link, or `world.standIns.setEnabled(false)`,
    draws the editor as built — for comparing; `world.standIns.stats()`
    says what is merged, instanced and drawn as itself. Never in a public
    view, which has merges of its own (StaticBatcher, HouseMerger).
  - **Against the scene drawn as built**, a frame differs only where the
    old build's own frame changes when its camera moves a millimetre —
    edges, and surfaces within the depth buffer's
    step of each other (a threshold a millimetre under its floor seen from
    30 m, two walls' faces in one plane): 0.000–0.060% of the pixels by
    more than 8 levels over 23 poses and states of Ladonia, fewer than a
    0.01 mm camera move changes in 22 of them. From high over the
    property there were more — 257–1,073 of 606 thousand half-size pixels
    looking straight down from 40 m: two surfaces a millimetre or two
    apart, the depth buffer's step there 2 mm with the near plane at 5 cm,
    and neither picture right. Since 2026-10-14 the edit view's near plane
    goes out with its distance (`EditorCamera.update`: a two-hundredth of
    the orbit's radius, 5 cm to 0.5 m — half a millimetre's step at 40 m):
    Home over the whole property 352 → 8–20. A frame taken with a camera
    posed by hand keeps whatever near plane the view last set.
  - **A publish whose realistic light fails to come up** (`World.relight`
    keeps a sky's failure to itself) is still read as built:
    `holdRealistic` takes the stand-ins out itself. Before 2026-10-14 the
    snapshot would have been taken with 4,114 of Ladonia's 4,999 meshes on
    layer 12, which `canMerge` passes over (found by reading; made to
    happen with `sky.prepare` rejecting: none on layer 12 while held, the
    stand-ins back and the frame right after).
  - **What is still a draw each** in Ladonia's whole-property view (1,438
    calls): 365 one-of-a-kind furniture meshes and 51 see-through ones,
    190 door-leaf meshes, 89 panes of glass, 91 for the people, beside the
    315 batches and 126 buckets. X-ray gains little (7,128 → 4,641 calls):
    see-through walls, ceilings and roofs are drawn one by one for three
    to sort. Not tried: door leaves merged at rest, glass, materials that
    are equal counted as one (685 objects for 143 names).
  - **A piece whose doors or drawers open is drawn whole** (models; wave
    B of 2026-10-16). Ladonia's 843 part meshes were nearly all the only
    one of their kind and drew one by one: A1's kitchen went from 819
    draws to 1,138 when its fronts began to open.
    - *Whole*: while every part is at its Openable's rest pose, to the last
      digit, the piece is one mesh per material. The mesh merges its body
      and shut parts in the piece's own frame: a "model", keyed by each
      drawable mesh's geometry, materials, part index and local matrix
      (composed from each node's TRS down from the piece, the parts at
      rest), so the clones of one file with one set of finishes share one.
      Copies are instanced over the pieces in view; a piece placed once is
      a plain mesh with its root's matrix, hidden when its sphere is out of
      view.
    - *Lifted*: a part moving or open draws itself; the rest of the piece
      is meshes of its own that share the model's vertex buffers with an
      index of their own. **Before disposing such a geometry, take its
      shared attributes off it**: disposing a geometry frees every
      attribute buffer it holds on the GPU.
    - *Loose*: selected, being moved, with a hidden mesh, or placed
      mirrored or sheared — drawn mesh by mesh as before.
    - A shut sash's frame is merged into its wall's bucket, and draws
      itself while it moves.
    - A kitchen's model is about 20 materials (its fridge's liner and glass
      among them), so a kitchen is about 20 draws. A piece wearing a
      finish of its own gets a model of its own; materials changed in
      place still show (models draw with the real material objects).
    - `setActive` brings hidden meshes back for the realistic preview and a
      publish: while a publish holds the scene realistic, none of
      Ladonia's 5,889 meshes is off layer 0, and the parts' child world
      matrices equal what auto-update makes.
    - `?shut=0` or `world.standIns.setShutMerged(false)` compares in the
      same tab; `stats()` adds `wholes`, `lifted`, `cast`, `models`,
      `modelMeshes`, `modelInstances`. Ladonia: 170 pieces drawn whole by
      45 models.
    - Measured (2560 × 1600, plain light, render + 1 px read back,
      alternating with HEAD): A1 kitchen 910 draws and 9.8 ms against
      HEAD's 819 and 8.8 (10.5 with `?shut=0`); A1 living 9.7 against 8.3;
      the upper U kitchen 7.1 against 6.5. What is left is not how the
      parts are drawn: the scene graph is 2,100 objects larger (11,789
      against 9,662; the matrix walk 2.2 against 1.8 ms), a pane of glass
      a sash, the showers' glass doors, and kitchen models of 20 materials.
      (Wave C mended the walk by holding what the stand-ins draw still,
      the next bullet: since then the editor is at or under HEAD at these
      spots.)
    - Frames against the scene drawn as built: 42–50 of 4.1 M pixels over
      8 levels, at edges, whole, lifted, moved and back, selected and not.
  - **What the stand-ins draw is held still and kept out of three's way**
    (`StandIns.hold`, `drawnScene`; wave C of 2026-10-16), under the plain
    light only. Test anything that moves under a held unit with
    `hold-check.js` (../app-testing-and-performance/: `__hold.audit()`, every world matrix
    against three's own full walk; `same(label)`, the frame held against
    the same frame let go).
    - *Why*: at each render three works every object's frame out again,
      starting with the scene's own, which passes `force` to everything
      under it; then it goes into every shown object to find what to
      draw. Ladonia's editor has 11,628 objects, 2,000 more since its
      doors, drawers and sashes opened: the walk took 1.5 ms at A1's
      kitchen (1.1 on HEAD), and three drew from fewer than a thousand of
      the 10,600 shown.
    - *The walk*: the groups the units hang in, up to the scene (145 in
      Ladonia), work out their frames once, and are checked each frame
      for having moved after all. Each unit is passed over by three's
      walk (`matrixWorldAutoUpdate`); StandIns works its world matrices
      out when it is found, when its root or a part moves, and when
      something comes into it. The stand-ins' own group is passed over
      too; their meshes' frames are written as they are placed.
    - *The scene three is handed* (`drawnScene() ?? scene`, in
      Renderer.render and Editor.render) is made from the scene and each
      held group (Object.create), with children of their own, leaving out
      every unit the stand-ins draw entirely: merged, instanced or cast by
      its model, with no door leaf, line or lit light of its own — 1,031
      of Ladonia's 1,284. A unit is judged again only when its meshes go
      into or out of the stand-ins, it is looked through, or it hangs a
      light; nothing is allocated per frame.
    - *Let go* (`letGo`, from `setActive(false)`) for the realistic
      preview and a publish: the scene is walked once, forced, and handed
      to three as built. `?still=0` leaves all of it out, for comparing.
    - **The rule**: whatever moves or is added deep inside a held unit —
      other than a model arriving or a piece's part — works out its own
      world matrix: Door.update (the hinge), WindowSash.place (the turn),
      Openables.lend (the lamp and its target). Walls, rooms, roofs and
      rails are still built again rather than moved.
    - **What is added deep inside a held unit waits for its turn.** While
      held, a unit the stand-ins draw entirely is not handed to three at
      all (`sortDrawn` leaves `away` units out of the scene it is given).
      A unit is looked through for new meshes only when its root's own
      children change in number (`check`) or when `rescan` comes to it,
      four units a frame (`RESCANS`): Ladonia's 1,284 take about 320
      drawn frames — ten seconds of the walkthrough at rest, minutes of an
      edit view at its heartbeat. So a mesh, a line or a light added below
      a unit root's own children (a marker hung on a piece for a test, a
      helper inside a wall) is neither drawn nor placed until then;
      `world.standIns.hear()` looks again at the meshes it already knows,
      not for new ones. Add such a thing to the unit's root itself, or to a
      group of its own in `experience.scene`, as Water and Screens do.
      Before wave C three went into every unit and a new mesh drew itself
      at once; `?still=0` still does. (Read from the code — `check`,
      `rescan`, `scan`, `sortDrawn`; `test-standins.mjs` has a light hung
      deep in a piece handed to three once the piece is looked through
      again — not made to happen in a page.)
    - *Measured* (2560 × 1600, plain light, render + 1 px read back,
      three tabs on a ring, two runs, this build minus HEAD): A1 kitchen
      −0.2 / +0.1 ms, A1 living −0.8 / −0.4, upper U kitchen −1.1 / −0.9,
      edit mode overview −0.5 / −0.2, roof terrace −0.3 / 0.0; with
      `?still=0` the same spots were +0.7 to +2.0 (the final check, verifyC
      of 2026-10-17, both ways round on the final build: −0.55 to +0.08 ms
      against HEAD over the same five spots). The in-frame walk 1.52 →
      0.22 ms; draws unchanged (kitchen 760 → 837 render-only). Every
      world matrix equal to three's own full walk (11,628 checked) and
      0 pixels apart from the same frame let go, through opening,
      moving, duplicating, deleting, undoing, rebuilding a wall, room
      focus, colliders, water and sitting.
    - `node scripts/test-standins.mjs` (19 checks).

## Elsewhere

- **Never give a scene object a property of its own** (`mesh.foo = …`,
  even `mesh.raycast = …` or `mesh.boundingSphere = …`, least of all
  `delete`): it makes that object another kind of object to V8, and
  three's draw loop and every ray read all of them — the crosshair's ray
  2 ms a frame slower from a property on four meshes in five, the
  realistic preview 1.5–2 ms slower from one on the 441 stand-ins. Use
  what is there: `layers`, `userData`, `visible`; a mesh with a
  `boundingSphere` of its own, hooks of its own, a `renderOrder` or a draw
  range is left to draw itself (`kindOf`). The note in full, with its
  known exceptions: ../app-testing-and-performance/speed-architecture.md.
- What the stand-ins bought, and wave C's hold (1.6–1.9 ms a frame; three's
  matrix walk 1.52 → 0.22 ms): ../app-testing-and-performance/speed-architecture.md,
  with `SceneBuilder.holdStill` (the Scene itself held still, after which
  Door.update, WindowSash.place and Openables.lend work out their own
  world matrices).
- Comparing with them off in the same build: `?standins=0`, `?shut=0`,
  `?still=0` and the handles in links-and-handles.md; the tools
  `hold-check.js` (../app-testing-and-performance/hold-check.js) and
  `node scripts/test-standins.mjs` (../app-testing-and-performance/node-tests.md).
  `zfight.js`, `people-audit.js` and `walk.js` are in
  ../app-testing-and-performance/ too.
- Water and the televisions hang their own groups in `experience.scene`
  for the reason above; Door.update, WindowSash.place and Openables.lend
  compute their own matrices: ../visitor-interactions/SKILL.md.
- A public view's own merges (StaticBatcher, HouseMerger, ShutBatcher):
  ../baked-view-lighting/merged-house.md. A publish gives the same files,
  since `setActive(false)` and `holdRealistic` take the stand-ins out:
  ../publish-and-bake/SKILL.md.

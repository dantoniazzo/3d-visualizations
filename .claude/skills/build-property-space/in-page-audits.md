# In-page audits of a built space

Build-quality checks of a space done in a page of a test server: what a
leaf sweeps, pieces in walls or floating, what a pixel is. How to load the
in-page tools and what each returns: `../app-testing-and-performance/in-page-tools.md`.
The static counterparts are `checks/door-swing.mjs` and
`checks/doors-dump.mjs` (`checks/README.md`). How a door is hung and
opened (`Door.update`, `isMoving`, the 93.6° full open) is
`../walkthrough-editor/doors.md`; stand-ins and layer 12 are
`../walkthrough-editor/stand-ins.md`.

- **Door swing.** `walk.js` (`../app-testing-and-performance/walk.js`)
  walks doors forced open; to check what a leaf
  sweeps, step each hinged door open in t = 0.1 … 1:
  `d.target = t; d.open = t - 0.01; d.update(0.01 / d.speed);
  d.group.updateMatrixWorld(true)` (open and target must differ by more
  than 0.001 or `isMoving` is false, and updating only the leaf's matrix
  leaves the hinge stale — the audit then passes falsely). Sample a 9 × 7
  grid on both leaf faces against the oriented boxes of furniture, stairs,
  rails and other walls, and a 0.8 m-deep passage box each side of the
  opening. Confirm box hits with rays along the leaf (0.08, 0.5, 1.0, 1.5,
  1.88 m up) before acting: cupboard hits were bounding-box artefacts.
  t = 1 is the leaf fully open at 93.6° (`../walkthrough-editor/doors.md`).
- **Placement.** Over `sceneBuilder`'s furniture, walls and `spec.rooms`:
  sample points of each piece inside wall/trim oriented boxes (poking into
  walls); pieces whose base is > 3 cm above their room's floor (only
  pictures, mirrors, TVs should be); pieces in no room polygon; pieces
  meant against a wall (beds, nightstands, wardrobes, desks, vanities)
  whose back is 0.05–0.8 m off the nearest wall face.
- **What is that patch?** Cast a ray through the pixel from the same camera
  and read `hit.object.name` — in an editor tab with
  `raycaster.layers.enable(12)`, and past whatever is under the scene's
  "stand-ins" group: under the plain light the pixel is drawn by a
  stand-in, and the wall or piece it stands for is on layer 12 (the
  editor's plain light and view scope: `../walkthrough-editor/editor-plain-light-and-scope.md`);
  re-render with the lightmap off to tell
  geometry from bake; recolour suspects one at a time; count pixels over a
  threshold rather than judging by eye. Render the same pose on the
  previous published version before blaming your change — an old fault is
  a separate task, not a fix in passing.
- **A kitchen as fitted**: `../app-testing-and-performance/openables.js`
  (`walkIn`, `free`, `freeSpots`, `place`, `sameTriangles`, in an editor
  tab; `stops()`, `everyE()`, `sashes()` in either): `furnishing.md`,
  step 5, and `walkable.md`, item 7.

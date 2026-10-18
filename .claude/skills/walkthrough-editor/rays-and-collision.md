# Rays and the collision trees

Moved from app-notes.md, "Rays and the collision trees" (written
2026-10-13; the trees' revisions and the capsule pushed up through a
ceiling are of 2026-10-16). Every frame time here is one Mac's (an Apple
M4 Pro) unless it says otherwise; how they were taken:
../app-testing-and-performance/SKILL.md (measuring).

Since 2026-10-13 a ray is answered from an index, and the trees the visitor
walks against are mended after an edit, not built again. Neither changes
an answer: the same hit, and the tree that building from scratch gives —
both the building's and the furniture's the very tree of the build before
(for a few hours of 2026-10-14 the furniture's was cut from a wider box:
below, what that cost and why it was taken out). Read this before adding
a ray, a thing that moves by itself, or anything that reads
`world.collision`.

- **Every ray goes through `rays.cast`** (`Utils/rays.js`; the one
  instance is also `world.rays`): `rays.cast(raycaster, roots)` is
  `raycaster.intersectObjects(roots, true)` — the same hits in the same
  order, each with three's own numbers (point, distance, face, uv) — for
  the crosshair (`Player.updateLookTarget`), the camera's boom
  (`Camera.resolveDistance`), a click (`Editor.raycast`, `surfaceUnder`,
  `sightUnder`), the walkthrough's aim (`FieldEdit.aim`), a person's seat
  (`seatingHit`), and a dragged piece looking for what it stands on
  (`Snapper.supportUnder`: `rays.hold(roots)` once, `rays.through` for
  each of its five rays; `TransformSession.resolve` has the snapper hold
  for the whole of a step). `rays.into(raycaster, object)` is
  `intersectObject(object, true)` for one piece (`Editor.ridersOf`).
  three's own way asked every object under the roots, and every triangle
  of every mesh whose sphere the ray touched — the terrain's fifty
  thousand, whose sphere holds the visitor wherever they stand.
  - **Two indexes.** Each child of a root (a wall, a room, a flight, a
    piece, a car) is a *unit* with a box round it; only the units whose
    box the ray crosses within its reach are gone into, by three's own
    walk (layers, each object's own `raycast`). A plain Mesh of 96
    triangles or more is asked through a tree of its geometry's triangles,
    made the first time a ray reaches it (Ladonia's 50-thousand-triangle
    terrain: 8–11 ms, once; a mesh of a few thousand, under a millisecond —
    so the first look at a room of furniture never looked at is a frame a
    few milliseconds longer): three's own sphere and box test, then three's own
    triangle test (`Mesh._computeIntersections`, a three r163 method that
    is not in its documentation — `rays.js` falls back to `mesh.raycast`
    without it) over the runs of triangles the tree finds, by way of the
    geometry's `drawRange`, which is put back at once. Nothing of three's
    arithmetic is copied.
  - **It looks before every ray; nothing tells it.** A root's children,
    each unit's `matrixWorld` and children, and inside a unit whatever
    moves by itself — a node with `userData.doorLeaf`, `hingeSide` or
    `opens`; every part of a car (`userData.kind === "car"`) — are
    compared with what they were, and a unit that differs has its box
    taken again (28 µs for Ladonia's eleven hundred units). What that
    cannot see is a change deep inside a unit that moves nothing and swaps
    no child of the unit's root: `rays.touch()` has every unit looked
    through before the next ray (0.8 ms), and World calls it on
    `scene-edited`, `finish-changed`, `furniture-ready`,
    `fittings-rebuilt`, `scenery-ready` and `bird-ready`, the Editor on
    its `changed`, `SceneBuilder.showHills` itself. **So: something new
    that moves by itself inside a wall or a piece needs one of those
    flags, or to be a unit of its own; code that reshapes a geometry in
    place sets `position.needsUpdate` (the triangle tree is made again by
    its `version`) and calls `rays.touch()`.**
  - A unit holding anything but plain meshes (a line, a sprite, an
    instanced or skinned mesh, an object with a `raycast` of its own — the
    editor's people picker) is always gone into, and those are asked by
    their own `raycast`.
  - **In a test tab:** `world.rays.cast(rc, roots)` against
    `rc.intersectObjects(roots, true)` with `rc.layers.enable(12)`, hit
    for hit (2026-10-13: 1,200 rays of Ladonia's and 1,250 of Wrenfield's
    — crosshair, boom, straight down, a click's, long ones — 11,237 hits,
    every field equal — the hits' count is the builder's note; its report
    gives 14,667 and more over four sets, Ashgrove's and a public view's
    among them). `world.rays.stats` counts casts, looks, units scanned
    (`scans`) and entered, trees made (its `units` is never counted).
  - **What it bought** (Ladonia, the editor as it opens; before → now).
    Walking, outside the renderer: the crosshair 5.4–5.5 ms a frame →
    0.09–0.11, the camera 2.1–4.9 → 0.04–0.06, `world.update()` 5.5–5.7 →
    0.23–0.37. A click's pick 7.8 ms → 0.10, `surfaceUnder` 7.9 → 0.08. A
    step of a drag (the pointer event, 312 of them over 39 drags) 77.5 ms
    median, 160 at the ninetieth, 180 worst → 2.4–2.8, 5.1–5.3, 22–23 (a
    flight dragged, which builds its floors again at each step; once 48
    for a page's first, the trees being made); `supportUnder` 38.9 ms a
    call → 0.2; a move begun (G) 41.6 → 5.1. Wrenfield: a step 7.1 / 21.5
    → 1.4 / 2.6–3.2, a pick 1.24 → 0.08. What is left of a step is the placing of the
    scene (`updateMatrixWorld` over the shell and the furniture, 0.5 ms,
    once a step), some thirteen rays at 0.06 ms, and the fit test against
    the building (`FitChecker.hitStatic`, 0.9 ms: every static mesh's box
    in turn — not touched).
  - **A public view** casts the crosshair at its doors, its cars and the
    furniture's doors and drawers (Ladonia: 76 + 3 + 38 units), and finds
    the house itself in the collision tree, each triangle saying what it
    is of — as before. There the crosshair was 0.05–0.10 ms already (now
    0.03–0.04) but for the cars: beside one, three went through its
    hundred and ninety thousand triangles, 2.6–4.5 ms a frame → 0.03–0.07.
- **`Collision.rayIntersect(ray, { twoSided, far })`**: with `far`, only
  the cells the ray crosses within that reach are looked in; a hit within
  it is the hit three's `Octree.rayIntersect` gives. The crosshair passes
  its 4 m, the boom its length, a car's wheel its drop. A hit past `far`
  may be reported or not — test its distance.
- **The collision trees are kept in step, and are the same trees**
  (`Collision.js`: `TreeKeeper`, `SceneBuilder.staticKeeper` and
  `dynamicKeeper`). Leaving edit mode after any edit built Ladonia's 961
  thousand furniture triangles into a tree again: 2.3–2.9 s with the page
  frozen. Now each wall, room, ramp and piece is a *source* whose
  triangles are kept (`staticCollisionSources`, `dynamicCollisionSources`:
  in the order `buildOctree` would visit them); `update` looks at every
  source — its meshes, their geometry and `matrixWorld`, a boxed piece's
  box — makes again the triangles of those that differ, and mends the
  tree in the cells they left and came to.
  - **Cell for cell and triangle for triangle, in the same order, it is
    the tree building from scratch gives** — the order is what three's
    tree pushes a capsule out by, so the walk is the same walk to the last
    digit. Checked 2026-10-13 by folding a tree's cells, boxes and
    triangles into one number: equal to the build before's after each of
    39 + 24 drags, a move, ten, a piece added, a door slid along its wall,
    a piece put outside all the others, a sofa stood across a door and
    taken away, three undos — in both spaces — and to three's own split of
    the same scene made in the page each time; `walk.js` through villa A's
    thirty doors, and seven routes (a terrace, a flight up and down, a
    room) with every step's place folded likewise, equal in both builds.
    **And again on 2026-10-14, as the code now stands**, in Ladonia,
    Wrenfield and Ashgrove, the same thirteen steps in a tab of each
    build — as loaded; a piece moved 0.5 m among the others, and undone;
    the piece put 60 m beyond them all, and undone; a piece deleted,
    undone, redone, undone; a piece duplicated beside its original,
    deleted, undone, undone — the trees brought up to date
    (`refreshCollision()`) and folded after each: the furniture's tree in
    this build equal to the build before's at all thirty-nine (its box,
    its cells, its levels, its leaves and the largest, and a sum over
    every cell's box and every leaf's triangles in order), equal each
    time to the tree made again from nothing in the page
    (`dynamicKeeper.clear()`, then built), and the building's equal too.
    As loaded: Ladonia a box 24.6 × 10.0 × 65.9 m, 6 levels, 19,904 leaves,
    the largest 5,296 triangles; Wrenfield 15.3 × 8.5 × 24.0 m, 6 levels,
    5,918 leaves, the largest 1,052; Ashgrove 5 levels, 767 leaves, the
    largest 605. The walk: villa A's thirty doors both ways, seven routes
    (the outside flight up and down, a flight to the roof, two terraces,
    a roof terrace, a living room) and forty-four drops of the visitor
    onto and beside pieces (into the living room's sofa among them), each
    left 90 frames then walked 45 — 703 coordinates, every one equal in
    the two builds, not to a millionth but to the digit; Wrenfield's 19
    doors, four routes and 43 drops (574), Ashgrove's 18, two and 40
    (531) the same. (The people's boxes out of it —
    `collision.setPeople(null)`: they differ from load to load, and one
    route by the pool brushes someone.) `node
    scripts/test-collision-tree.mjs` holds the same on made-up furniture —
    the keeper's tree against `buildOctree`'s and against the committed
    split (three's own `Box3.intersectsTriangle`) through 53 edits, and
    the tree handed out while another is built: 64 of 64 on 2026-10-14.
  - **`buildOctree` is the same split, written out**: three's
    `Box3.intersectsTriangle` made three arrays a call and was asked of
    every triangle and each of eight cells at every level. `touched` asks
    the box's own three axes once for both halves, takes a triangle well
    inside one cell (a micrometre) as in it and no other, and puts the
    rest to three's other ten axes, term for term. Ladonia from scratch:
    the building 395–432 ms → 62, the furniture 2,323–2,429 → 350 (250
    with its triangles kept); a published view's two trees likewise, at
    load.
  - **When it builds again from scratch**: the edit changed the box round
    all the sources — every cell is cut from it, to the digit
    (`keeper.low`, `high`), so the outermost piece any way moved at all,
    a piece put beyond all the others, the first piece or the last —
    changed the order of sources that stayed (with nothing else changed,
    too: until 2026-10-14 that was reported "same" and left the old
    tree), or changed more than three tenths of the triangles
    (`MEND_SHARE` 0.3, of the larger of the tree before and after) — or,
    where it need not wait (next) and the tree is of over 150 thousand,
    more than 60 thousand of them (`MEND_AT_ONCE`: mending that many at
    once is 40–65 ms and grows with them).
    `keeper.last` says which (`how`: none before its first update, then
    same, mended, built, building; `why`: bounds, order, share, long,
    empty, begun — and finished, for a sliced build ended by a call that
    waits).
  - **A box with room round it was tried, and taken out the same day**
    (2026-10-14). Cut to fit, the outermost piece nudged — or a chair
    carried out onto the lawn, and its undo — leaves every cell to be cut
    again: Ladonia's 961 thousand triangles for two pieces. So for a few
    hours the furniture's tree was cut from a box 24 m wider each way and
    6 m up and down, within which every edit was a mend. **What that
    cost**: a cell is divided only while dividing it separates something —
    `divide`'s rule, the committed code's: more than eight triangles,
    fewer than its parent holds, and room to halve — and furniture in the
    middle of a box three times its size is halved once by the root and
    then lies whole in one corner of each half, which therefore "separates
    nothing" and is never divided again. Wrenfield's tree came out 2
    levels deep with 5 leaves, the largest of 17,989 triangles, in a box
    63 × 21 × 72 m (it is 6 levels, 5,918 leaves, the largest 1,052, in
    15 × 9 × 24): the visitor's capsule was handed 17,242 triangles a
    frame indoors, `Player.updateColliderMovement` cost 10.9 ms a frame
    where it costs 0.01, a walking frame 15.3 ms for 9.8; Ladonia's
    largest leaf was 31,902 for 5,296; and dropped into a sofa the visitor
    ended 30 cm from where the build before puts them. The box is the
    sources' own again, and the tree the build before's (above).
    - **The same rule is the build before's, and has the same weakness
      there — kept, since the tree is to be the same tree**: a piece
      carried far beyond the others stretches the box, and the tree built
      in it is coarser for as long as the piece stands there. With one
      piece 60 m out (in both builds alike): Ladonia 9,190 leaves for
      19,904, the largest 6,830 for 5,296; Wrenfield 1,954 for 5,918;
      Ashgrove 210 for 767, the largest 1,648 for 605. And a dense small
      piece that falls whole into one cell of eight stops the split
      there: that is what Ladonia's leaf of 5,296 is. To look: walk
      `world.collision.dynamic`'s cells (`subTrees`, `triangles`) for
      their depth and their leaves' sizes, and time
      `player.updateColliderMovement()` at the pose — **after touching how
      a tree is cut, time the walk, not only the edit.** Read on
      2026-10-14, ms a call (fifty calls a reading; the build before in
      brackets): Wrenfield's living room 0.004 (0.002), its kitchen
      0.012 (0.006), the street 0.002; Ladonia inside the living room's
      sofa 0.098–0.102 (0.098), a bedroom 0.034–0.036 (0.034), by the
      pool 0.012–0.014 (0.012); the capsule handed 0, 62, 0 and 725, 181,
      80 triangles of the furniture's, in both builds.
  - **`refreshCollision({ wait: false })`** (leaving edit mode, a piece
    let go in the walkthrough, a walking key in edit mode): a tree of over
    150 thousand triangles that has to be built again — the box changed,
    a third of them moved — is built a slice a frame (`stepCollision`,
    6 ms, from `World.update`; the root's own division is one slice of
    26–40 ms), and `world.collision` is meanwhile **the tree as it was
    with what changed put right in it** (`TreeKeeper.meanwhile`,
    `keeper.job`: `old`, `aside`, `stale`): the triangles of the sources
    that went taken out of its cells as any mend takes them, those of the
    sources that came in a small tree of their own beside it, both under
    one root that three's walks and ours go through like any cell's
    eight. Every piece is where it stands, in other cells than building
    from scratch gives — so for the half second the build takes the walk
    is not the build before's to the last digit (that build stood frozen
    2.4 s instead), and nobody walks through a sofa or into one that has
    gone. Where more than 60 thousand triangles changed (`MEND_AT_ONCE`
    again: putting that many right is itself a long frame) the tree is
    left as it was, the job says `stale`, and all that is left of the
    build is done in the frame the visitor first moves
    (`Player.underWay()`: a key, the stick, a jump, a fall, a car — 181–205
    ms once on Ladonia, for a step taken within half a second of Tab
    after four of its largest pieces were moved). A tree of under 150
    thousand (Wrenfield's 53) is built at once: 16–28 ms. `world.collision`
    is the new tree only when the job is done: `refreshCollision()`
    waits, and `settleCollision()` finishes one begun — a publish does
    both (`Runtime.js`, `Snapshot.js`), and a test that reads the tree
    after an edit must (`walk.js` after `editor.leave()`:
    `builder.settleCollision()` first, or drive frames until
    `!builder.dynamicKeeper.job`).
  - **What it bought** (`editor.leave()`, before → now). Read on
    2026-10-14 with the app's own frames run and timed to the pixel, the
    handler and when the first walking frame was on screen, ms after the
    key (the build before: 2.4–3.0 s, whatever was edited, measured the
    same day). Ladonia: nothing edited 9–14 / 20–26; one piece moved
    among the others 19–25 / 29–36 (`mended`, 1.5–3 ms; the longest frame
    after 13–21); a piece put beyond all the others, or brought back,
    19–35 / 59–74 (`building`, `bounds`; the first frame 36–42 ms with the
    root's division in it, 30–37 frames in all while it builds, of 11–17
    ms with a slice in each, the new tree 0.52–0.57 s after the key —
    walked from the first frame, W held, the same); the piece put beyond
    and three large ones moved (58 thousand triangles) 38 / 73, 29
    frames, none over 35 ms. Wrenfield: nothing 1.2 / 7; one piece 3.5 /
    20 (the longest frame after 17 ms; the measurement, with the wider
    box, met one of 80 there); a piece put beyond 17.5 / 25, and back 29
    / 36 (`built` at once, 16–28 ms).
    `refreshCollision()` waited for, a piece moved among the others: 3–4
    ms on Ladonia where the build before took 2.3–2.5 s, 1 ms on
    Wrenfield for 250, under 1 on Ashgrove for 29; a piece put beyond:
    224–258 ms, 17–24, 4.
    (Earlier figures for leaving edit mode, from two sittings of
    2026-10-13: history.md.)
    - **Not explained**: of 39 builds a slice a frame watched on
      2026-10-14, 36 had no slice over 42 ms — 26 of them made to catch
      one, with the heap read round every slice; three had one stop of
      136, 245 and 712 ms inside a slice, and once Tab's handler took 323
      ms with 6.7 of it the keeper's. No slice does that much by the code
      (it ends with the cell it is dividing: the root's 26–40 ms is the
      longest) — the page was stopped there, by a garbage collection or
      by the hidden pane's process being set aside. Not seen in a visible
      tab.
  - A keeper holds every triangle's source, so nothing here is for a tree
    made by `buildOctree` alone (a published view's, the people's boxes,
    the garden's trunks): those are built whole, as before.
  - **The trees' revisions.** A keeper mends its tree in place, so "is
    this the tree I drew?" cannot be asked of the object:
    `world.collision.revision` (`{ static, dynamic, people, outdoor }`,
    bumped by each setter, 2026-10-16) can. Anything that keeps a copy of
    what a tree holds — the colliders drawn (colliders-view.md) — goes by it.
- **A capsule pushed up through a ceiling** (`Collision.capsuleIntersect(
  capsule, { from })`, `SceneOctree.triangleCapsuleIntersect`; wave B of
  2026-10-16). Ladonia's room ceilings are one-sided faces that face up
  (the floor above's underside). three resolves a capsule whose line
  crosses such a face by pushing it out to the face's front: up through
  the slab onto the floor above. And its edge push against a ceiling of
  many triangles shoves the capsule sideways — out over a window's sill:
  running and jumping at 24 of Ladonia's 32 upstairs sill windows threw
  the visitor up through the wall and out, the worst a 2.1 m rise in one
  frame.
  - Player passes `from`, the capsule's middle before the frame's move. A
    head that came up through a face facing up is held a radius under it
    in two places: `headroom`, one short ray, cast only when the move went
    up (so walking casts none), and the resolve itself.
  - Without `from` (the cars, the seats' tests) three's resolve is as it
    was.
  - After: 0 of 659 runs out of the building in the editor, 0 in a public
    view (43/67 and 67/93 before); 0 of 371 jumps from furniture through a
    ceiling (224 before). All 85 doors walked both ways and all 11 flights
    up and down gave 11,798 capsule positions bit for bit the same with it
    on and off; behind-the-car driving byte for byte as before.
  - `node scripts/test-capsule-through.mjs` (9); in a page, `jump.js`
    (../app-testing-and-performance/jump.js, through the sink;
    `__jump.windows`, `run` — `record: true` keeps the capsule's path —
    and `all`) runs and jumps at every upstairs sill window.
- **What a furniture part may open into** is planned against these trees
  too (`Openable.plan`: ../visitor-interactions/opening-parts.md).

## Elsewhere

- **How a piece collides** — `SceneBuilder.collisionOf`: its box, or its
  own triangles up to `MESH_COLLISION_BUDGET` (12000, counted over the
  loaded model), the catalogue's `collision: "mesh"` or `"box"` forcing
  either; a piece with parts as its body plus a shut box a part
  (`Openables.js`'s `shutParts`, `shutProxy`), those boxes sources of the
  kept tree like any piece; a shower's door the one way in:
  ../build-property-space/furniture-catalogue.md. After changing how
  anything collides, grep ../build-property-space/checks/ for the old
  rule: the checkers carry the app's rules in copies (furniture-check-c
  and stairs-check boxed every piece with parts until 2026-10-17: ACCESS
  12 → 13, NARROW 27 → 26; ../build-property-space/SKILL.md, Pitfalls).
- The walker is a capsule 0.7 m wide and 1.9 m tall; a door open past 0.3
  collides with nothing (doors.md); a space's walkability checks — C and
  Shift C, `jump.js`, the Player's headroom — are
  ../build-property-space/walkable.md (§8, item 9).
- What the visitor walks against, drawn (C): colliders-view.md, which goes
  by `world.collision.revision`.
- What a furniture part may open into (`Openable.plan`, its `reach` cached
  by the trees' revisions): ../visitor-interactions/opening-parts.md.
  Sitting tests its figure's body by `meetsAny` (`Seats.wayClear`,
  `turnClear`, `roomFor`): links-and-handles.md;
  ../visitor-interactions/sitting-and-tv.md.
- A publish calls `refreshCollision()` and `settleCollision()`
  (`Runtime.js`, `Snapshot.js`): ../publish-and-bake/SKILL.md.
- The tests and tools: `node scripts/test-collision-tree.mjs` and
  `test-capsule-through.mjs` (../app-testing-and-performance/node-tests.md);
  `walk.js` and `jump.js` in ../app-testing-and-performance/; how the walk
  and the edits were timed: ../app-testing-and-performance/speed-architecture.md.

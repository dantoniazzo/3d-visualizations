# The colliders drawn: wireframes over the view (C)

Moved from app-notes.md, "The colliders drawn" (2026-10-16). The keys as a
visitor and an editor user meet them are in the repo's README ("Seeing the
colliders"; Edit mode). Every frame time here is one Mac's (an Apple M4
Pro) unless it says otherwise.

Since 2026-10-16 what the visitor walks against can be seen
(`Experience/Colliders.js`, always loaded, as `experience.colliders`;
the drawing is `World/ColliderView.js`, a chunk of its own, 17.9 kB). Read
this before adding anything that collides outside the trees, or before
judging a frame with them shown.

- **Who may see them.** The editor (`/?scene=`), in the walkthrough and
  in edit mode; a public view only with `?debug` (available) or
  `?colliders` (and shown from the start; `?colliders=xray` seen
  through). `colliders.available` says which; a plain `/view/<id>` binds
  no key and never fetches the chunk (0 resource entries, checked).
- **Keys and controls.** C (`KeyC`, by place) shows and hides, Shift C
  seen through everything (x-ray) or not; not while typing, with the chat
  open, with Ctrl/⌘/Alt or on repeat, and only once `walkthrough-active`.
  In edit mode the editor has the key (`Editor.onKeyDown`, before its
  transform session's check, so it works mid-move) and says so in a
  toast; with a walkthrough selection `FieldEdit` passes C (and Q) on.
  The editor's header has a toggle beside X-ray (Shift-click: x-ray),
  shown under 1600 px only while they are on (`editor.scss`: the header
  has no width to spare between about 1000 and 1560 px, and the toggle
  takes the focus menu from 141 px to 107 at 1280), the View menu "Colliders C" and
  "Colliders seen through everything ⇧ C", the hint bar "C Colliders", the
  view label "· Colliders". The walkthrough's menu (M) has a *Debug*
  section with a switch where they are available (`index.js`), and its
  notice says "Colliders shown — C to hide · Shift C: see through
  everything" / "Colliders seen through everything — Shift C: nearest
  only" / "Colliders hidden" (not in edit mode, which has its own toast).
  Every change is the world's `"colliders"` `{ shown, xray }`.
- **Colours** (`ColliderView`'s `KINDS`, by id): `static` building and
  ground blue; `blocker` the invisible blockers and the world's edge
  magenta; `stairs` ramps, guards and the cupboards under flights yellow;
  `mesh` furniture colliding as its mesh green; `box` as its box orange;
  `people` violet; `trunk` the trees' trunks lime; `door` red while a leaf
  blocks (open under 0.3), `door-open` faint; `car` cyan bright while
  driven, `car-parked` faint (a parked car blocks nothing); `player` the
  visitor's capsule white — not walking in first person, nor at the wheel;
  shown in edit mode and from above; `chosen-*` the editor selection's
  would-be collider in its class's colour, bright; `other` pale yellow,
  for what a provider adds. Lines on a faint tint of each kind's colour;
  the long edge of a right triangle is left out, so walls, boxes and the
  terrain read as rectangles.
- **What is drawn where.**
  - *Editor*: a region 15 m each way round the visitor's feet (in edit
    mode the view's target), from 1 m under the floor stood on to 3 m over
    it (`REGION`, `BAND_BELOW`, `BAND_ABOVE`), gathered from the keepers'
    entries, or from the tree itself while a keeper's job is stale (what is
    walked is what is drawn); gathered again when the centre moves 5 m,
    the floor changes or a tree's revision does — 8–12 ms, in one go, not
    a slice a frame. In edit mode, while shown, the furniture's tree is
    brought in step 300 ms after an edit (`refreshCollision({ wait: false
    })`), never during a transform session; the selection's would-be
    collider (`SceneBuilder.collisionOf`: its box, or its mesh and, since
    wave A, each part that opens as its shut box in `chosen-box`'s orange;
    a flight's collider group) is drawn live as it moves. A floor or a room in focus
    sets the floor and cuts the overlay 2 m above it, as the editor hides
    the focus's ceilings; a room focus's clip planes cut it too.
  - *Public view*: the whole runtime tree, built once on first show
    (Ladonia 41,891 + 50,908 = 92,799 triangles, the manifest's count;
    27–77 ms) and kept across a hide; the people's and the trunks' trees
    gathered again on their revisions. Kinds come from the triangles'
    labels ("Stair rail", "Window" — an opening window's invisible pane —
    and "Edge of the world" a blocker; "Balustrade", "Cupboard" and a
    flight's own stairs) and from shape: a label whose triangles are boxes
    (12 to every 8 corners) is boxed — Ladonia 828 = 69 × 12, exactly the
    editor's 69 box proxies. A label shared by a boxed piece and a mesh
    piece is drawn as mesh, and so are a mesh piece's part boxes, which
    carry its label.
  - *From above*: cut at the shown storey's top, its highest level + 2 m
    but under the next storey (Ladonia 2.01 m on the ground floor, 5.00
    on the first).
  - *What moves*, made again every drawn frame: door leaves within 40 m of
    the camera (`Door.getBlockers()` while blocking, the leaf's box
    after), every car's `collider()` capsule, the visitor's capsule
    (`player.collider`), the selection's, and whatever is registered —
    SceneBuilder registers a low window's sash and a shower's glass door
    while they bar the way, drawn as door leaves.
- **How it is drawn.** In its own `THREE.Scene`, after the frame
  (`Renderer.render`, after the post-processing or the plain render;
  `Editor.render` after the outline and before the gizmo, the room
  focus's clip planes still set) — never in `experience.scene` or
  `builder.root`, so no merge, bake, publish, ray index, live-room layer,
  stand-in or `BirdView.looseMeshes` sees it. One triangle soup with a
  kind a vertex, lines by barycentric (`gl_VertexID`, `fwidth`, ~1.1 px ×
  the pixel ratio), a depth pre-pass of its own and then colour; x-ray
  no depth test at 0.62. Drawn straight to the screen in the editor
  (plain light, edit mode) it is also hidden behind the scene's depth,
  pulled forward by polygon offset — with its own depth alone, the
  floor's colliders drew over the roof; under post-processing, and always
  in a public view, it is hidden only behind itself, so a collider under
  something that collides with nothing shows through it (a pergola's
  slats from above, a car's body round its capsule).
- **Something new that collides outside the trees** (a door or a sash
  that bars the way while shut, a moving blocker):
  `experience.colliders.register((add) => { add.box(centre, quaternion,
  half, kind); add.capsule(start, end, radius, kind); })`, called each
  drawn frame while shown, `kind` a `KINDS` id (`"other"` by default);
  it returns what takes it away. A box drawn so was 12 triangles, gone
  after the unregister (checked). Only SceneBuilder registers one today
  (a low window's sash and a shower's glass door while they bar the way,
  drawn as `door`); the seats, the water and the pool add none — a seat
  taken, a swimmer's water and the pool's edge collide with nothing of
  their own.
- **A new collider gets its colour from its name or its label, and
  nothing else** (`ColliderView`'s `entryKind`, `labelKind`). In the
  editor a static mesh named `blocker`, `closet` or `world-edge`
  (`BLOCKER_NAMES`) is a blocker; `pool-steps-ramp` (`STEP_NAMES`) and a
  flight's own collider group are stairs; a furniture source with a stamp
  is boxed. In a public view it goes by its runtime label: "Stair rail",
  "Window", "Edge of the world" (`BLOCKER_LABELS`) and "Pool steps"
  (`STEP_LABELS`) in the static tree; "Balustrade", "Cupboard" or a label
  that starts "Stair" (`STAIR_LABELS`) in the furniture's. A new invisible
  blocker or ramp named and labelled otherwise draws blue as building (or
  green as a mesh, in the furniture's tree): add its name and label to
  those sets.
- **What it costs.** Hidden: nothing measured — until the first show the
  chunk is not even fetched, and after it hiding leaves one property read
  a frame; the build before and this within ±0.3 ms at every pose of the
  final sitting, either way round. Shown (2026-10-16, step 4,
  2048 × 1536, render + 1 px readback; hidden → shown → x-ray): editor
  walk in A1's living room 6.0 → 6.8 → 8.8 ms (218–224 thousand
  triangles); public, baked, the same room 11.6 → 12.2 → 13.4, the pool
  11.0 → 11.5 → 11.9; from above, ground floor 11.1 → 12.6 → 12.5;
  driving from above, a median 4.4 → 5.5. An earlier sitting the same day,
  at 2560 × 1600 and busier: the editor walk +0.8 (x-ray +3.0), edit mode +0.5 over the
  property and +1.7 with the ground floor in focus, public +0.9 (x-ray
  +4.9), from above +1.9. In edit mode at rest it draws no frame more:
  the heartbeat's alone, shown or hidden.
- **Frames with them shown are not judged**: the frame-rate guard's
  `watching()` is false while `colliders.shown` (a debug view must never
  make a visitor's view lighter), and it settles on `"colliders"`.
- **In a test tab**: `experience.colliders` (`available`, `shown`,
  `xray`, `toggle({ xray })`, `show(on, { xray })`, `register`,
  `stats()` — null while hidden, and totals of 0 until the first frame
  drawn after a show — and `view`); `view.counts`, `view.region`,
  `view.last` (gather ms), `view.fixed` / `.loose` / `.movers` `.sink`
  (positions, kinds, counts); `uniqueTriangles(tree, box)` from
  `World/Collision.js` (each triangle once, from a `buildOctree` tree, a
  mended keeper's or the meanwhile union); `?stats` lines while shown
  (total, the region or all, build ms, triangles by kind, doors
  blocking). `node scripts/test-collider-view.mjs`: 32 of 32 on
  2026-10-16 (the gather against every kind of tree, whole or in a
  region, classification, the hidden edges, boxes and capsules).
- A pool's steps' ramp ("pool-steps-ramp", label "Pool steps": `STEP_NAMES`,
  `STEP_LABELS`) is drawn as stairs, though it is in the ground's static
  tree: by its mesh's name in the editor, by its label in a public view
  (Ladonia's 12 triangles; before the integration of wave B, building).

## Elsewhere

- The trees drawn, their revisions and `SceneBuilder.collisionOf`:
  rays-and-collision.md. The links' words `?debug`, `?colliders`,
  `?colliders=xray` and `e.colliders`' handles: links-and-handles.md.
- Adding a kind the visitor acts on that collides outside the trees (a
  sash, a shower's door): ../visitor-interactions/SKILL.md, whose steps
  point back here for `register` and the name and label sets.
- The frame-rate guard and why it judges nothing while these are shown:
  ../baked-view-lighting/SKILL.md.
- `node scripts/test-collider-view.mjs`: ../app-testing-and-performance/node-tests.md.

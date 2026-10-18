# How a baked view is drawn: the house merged, the shut parts merged

The baked house merged across rooms (`World/HouseMerger.js`), the sun's
shade map drawn again only on movement (`LiveLamps` `STILL`,
`SUN_MOVE`), and the shut parts and sashes merged (`World/ShutBatcher.js`,
wave B of 2026-10-16, with wave C's changes). The sky and the resolved
lightmap are [resolved-lightmap.md](resolved-lightmap.md); door leaves,
textures and glass [baked-drawing.md](baked-drawing.md).

For anyone touching published materials: in a merged view
`mesh.material.color` is white for a tinted mesh, and a lit material for
such a surface must read `tint` (below). For opening furniture and
windows, the app side — a part leaves the merged mesh while it moves or
stands open, or is drawn by K (`userData.roomLive`) — is
[../visitor-interactions/opening-parts.md](../visitor-interactions/opening-parts.md)
and [../visitor-interactions/windows.md](../visitor-interactions/windows.md).
`?shut=0` works in the editor too
([../walkthrough-editor/links-and-handles.md](../walkthrough-editor/links-and-handles.md)).

- **The baked house is merged across rooms** (`World/HouseMerger.js`, called
  at the end of `SceneBuilder.usePublishedView`) in "baked" and "static"
  views — not `?lighting=live`, not unbaked (`sceneBuilder.merged` is null
  there, and every mesh is a room's as before). The bake's meshes that draw
  alike become one: the same material, lit the same way (lightmap or
  vertices), the same `level` and `kind` (what `BirdView.showFloor` shows
  and hides by), the same square of the site. Ladonia: 3,952 meshes → 670, a
  frame out of doors 29–30 ms → 16–17 at step 4 and 19–24 → 7–8.5 at step 0;
  Wrenfield 618 → 159. `?merge=off` keeps the rooms' meshes, to compare;
  `?merge=<metres>` another square (0: none), `?merge=own` no shared
  materials, `?merge=tint` no colours in the vertices (below).
  - **So that more of them draw alike, materials are shared**
    (`materialFor`): two of a runtime file's materials that look the same
    are one (`lookOf` — a publish numbers each piece of furniture's own
    copy of a finish, `oak_veneer#1`…: Ladonia's 1,064 materials are 337
    looks), and an untextured surface drawn from its bake takes its colour
    from its vertices (`tint`, three floats a vertex written by the
    merger; `tintShader` multiplies it in where the material's colour
    was), so every such surface draws with ONE material whatever its
    colour (337 → 218 materials). Not the grounds the garden finds by
    their material's name (`Vegetation.findGroundUvs`, `showHills`: every
    room's `floor_finish`, `hill_grass`, the site's ground). So in a
    merged view `mesh.material.color` is white for a tinted mesh and
    `mesh.userData.material` is the key of the first mesh merged, no
    more: a lit material for such a surface must read `tint` too.
  - **Each room's triangles stay together** in a merged mesh, and
    `mesh.userData.ranges` says where: `{ zone, start, count, vertexStart,
    vertexCount }` — index range and vertex range. `sceneBuilder
    .roomRanges(zone)` gives a room's range in every mesh that has one
    (merged or not; a mesh of one room is one range), and each range's
    `parts` the runs of it made with one published material: what the
    live room makes a room's own meshes from, and leaves out of the baked
    mesh's draw (live-room.md).
  - **The thin faces' light is mixed a room's part at a time**
    (`sceneBuilder.thin`, `mixThinLight`): the variants' vertex light and
    the switches' are kept off the GPU; a part is worked out again only if
    its room's state changed (variant, how much stays with its doors, each
    switch on and its reach), and only those ranges of the `color`
    attribute are sent (`addUpdateRange`). Turning all 93 of Ladonia's
    switches on: 376 ms → 66. A lamp's glass and bulbs (`userData.glow`)
    stay a mesh each, on the old path (`vertexLit`). The light kept is
    floats whatever the file stores (`floatValues`), and only what will be
    read: a variant's light less the sun's (`_day_indirect`…) where doors
    dim rooms — not "static" — and what a switch's lamps bounce
    (`_s#_indirect`) only lit live (`takeSwitchLight(geometry, live)`).
    Ladonia, "static": 43.6 → 18.7 MB of the variants' light kept; the
    switches' 10.5 MB, what their lamps bounce let go.
  - **One square on a site of Ladonia's size** (`MERGE_CELL` 64 m, laid
    from the site's corner in equal squares, so a site shorter than that is
    one): measured, fewer and bigger meshes are faster everywhere, indoors
    too, although more triangles are drawn there (the living room 4.20 →
    4.68 million of the frame's). At 32 m the street is +0.5 ms, at 16 m
    +3.0, at 8 m +4.9. Squares are for sites several times as long.
  - **What is left a mesh each, and why**: lamps' glass and bulbs (their
    material is swapped by their switch); anything see-through; door
    leaves, the furniture's doors and drawers, cars, people (they move,
    and are not in this group at all). **Fixed window panes are not
    merged**: three sorts see-through meshes back to front by the middle
    of each; a row of panes in one plane made one mesh was sorted
    otherwise against what is see-through behind it (a window seen from
    the street drew differently), for 16 meshes fewer of 141. A window
    that opens (a version published since wave A) has its panes as its
    sashes'; while every sash of it is shut, a window of two panes or more
    is one glass mesh (ShutBatcher, below; lane K counted 172 → 116 + 56).
  - The rooms' own geometries are emptied and the glTF loader's cache
    cleared (`gltf.parser.cache.removeAll()`: it keeps every array it
    read, so without that the merged copy is 100 MB on top). Never read
    `resources.items.publishedView`'s geometry after the view is built. A
    geometry two meshes draw (two nodes of one glTF mesh; no published
    file has one) is left to them, unmerged.
  - Comparing merged with unmerged: equal but at single pixels on lines
    where two surfaces touch (which of the two a pixel is depends on the
    order they are drawn in) — under 0.001% of pixels over 8 levels a
    frame on average, 0.003% at most from above. A long thin line of them
    is still that (Wrenfield, a door leaf's edge against its casing: 340
    pixels). The exposure is read from the frame, so in a few frames the
    fifth digit of it moves and 0.5% of pixels move by one level.
- The sun's shade map of a "baked" view is drawn again only when something
  that shows moves by more than a centimetre, or the view has moved a metre
  (`LiveLamps` `STILL`, `SUN_MOVE`): the visitor's hidden first-person
  avatar settling used to draw it every frame (461 calls on Ladonia). A
  door's swing adds up the thin faces' light only in the rooms it changes
  (`SceneBuilder.doorZones`, `mixVertexLight(zones)`).
- **Shut parts and sashes are merged** (`World/ShutBatcher.js`, made at
  the end of `usePublishedView` and brought up to date in
  `SceneBuilder.drawLight` before each frame; wave B of 2026-10-16):
  - Every shut part's opaque meshes, and every shut sash's frame, are
    merged by material look (`lookOf`), in world space, each part's index
    range kept. Without it Ladonia's new version drew A1's kitchen in 1,499
    draws against the version before's 1,038; with it, 1,056 — 534 entries
    (475 parts, 59 sashes) in 14 windows' glass and, since wave C, 21
    meshes, built in 35–55 ms at load. Wave B merged by look and floor as
    well (68 meshes): each was as wide as its villas, so always in view,
    and they were 57 of the 1,158 draws of A1's living room. Each part's
    floor (`userData.level`) is now kept with its triangles instead, and
    the merged meshes are marked `userData.floors`.
  - *Light*: each part keeps its own. Probe-lit, ProbeLight.update hands
    each part's eased cube, sun and reflection share to `lightPart`, into
    a row of six RGBA float texels; the bucket's material is
    `ProbeLight.batchMaterial(undressed)` — the clone `dress` makes,
    patched by `lightByPartProbes`, which reads the row per vertex into
    five flat varyings. Tinted (static), `tintOpenables` hands each part's
    tint to `tintPart`: a tinted part's material with its glow times the
    row, its reflections following the tinted parts' as the sky sets them.
    Lit live or unbaked, the material as it is. A part goes in only once
    its light is known. The texture is sent only while ProbeLight eases
    (80 uploads at nightfall), never at rest.
  - *Lifted out*: a part leaves its mesh while it moves, stands open
    (`open` or `target` not 0) or is drawn by K's live room
    (`userData.roomLive`), and goes back once shut.
  - *While in*: its meshes are on `REAL_LAYER`, so rays still hit them (the
    crosshair aims at a merged drawer); a part with no glass is hidden at
    its node; its moving nodes (the part's, a sash's turn and tilt) are
    held still and passed over by three's matrix walk
    (`matrixWorldAutoUpdate` false), the world matrix brought up to date as
    it goes in; layers are set again on every change, because
    `LiveRoom.giveBack` restores the mask it took.
  - *A window's glass*: a window of two panes or more is one glass mesh
    about the panes' middle while every sash of it is shut, as its glass
    was before the panes opened. A sash whose frame is merged and whose
    pane is in its window's glass has nothing left of its own to draw, and
    is hidden at its group until it moves (wave C: 28 sashes in Ladonia,
    six objects each, passed over by each render at the group).
  - *From above*: the meshes hang in a `shut` group under the root, which
    must not be a helper (the first try showed the upper floors' over the
    ground floor). BirdView.showFloor calls `showFloors(fn)`, which writes
    each mesh's index again with the floors above the one shown left out;
    `looseMeshes` passes the merged meshes over (`userData.floors`). An
    empty mesh is on no layer: a mesh with an empty draw range is still a
    draw call.
  - *What shut doors hide* (`enclose`, wave C): SceneBuilder.enclosedGlass
    finds the see-through meshes behind a fridge's doors (within the
    doors' face, behind them, no deeper than 0.9 m; Ladonia 13 of 13
    kitchens, each its own). While every door of it is shut they are on
    no layer — not hidden, which the bird's-eye view's own showing and
    hiding would undo — so nothing draws them through walls, and no
    hairline of a shelf shows through the shut door: 36 draws fewer at A1's
    living room. A room shown live (K) takes such a mesh up like any glass
    near its zones; the batcher then marks it `userData.shutIn` as its
    doors stand, and LiveRoom.follow shows the room's stand-in of it only
    while it is not (fix of the integration of wave C: the room drew the
    shelves behind the shut door again).
  - *Their own shaders, made ahead* (`prepareOwn`, the integration of wave
    B): nothing draws a merged part's own material, so the first part of a
    material drawn nowhere else to be opened built its program in the
    frame it began to move — the A3 kitchen's three, a frame of 50–102 ms.
    So 1.5 s after every part has its light, the merged meshes are keyed by
    three a few dozen at a time (`oneEach`) and one mesh a program kept
    (`unseen`: 4 in Ladonia), whose shaders `Renderer.build` makes, paced,
    each shown for its turn (`around`: its node unhidden, frustum culling
    off); again 1.5 s after each "lighting"; and `Renderer.buildFor` makes
    them too for a light about to come in. After: 80 parts of the A3
    kitchen opened at once built nothing, by day or at night, the worst
    frame 12–13 ms.
  - **`holdStill`** (SceneBuilder), the sub-bullet that stood here — a
    public view's root, shell, door groups, openable group, fixtures,
    vehicles, see-through group and its panes, fixture holders, and since
    wave C the Scene and the merged house, held still; empty fixture
    holders and the 269 light-target boxes hidden — is the speed
    architecture's matrix-walk rule:
    [../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md).
    Its rule for everyone: **whatever moves under a group held still
    updates its own world matrix** (as `Door.update`, `WindowSash.place`
    and `Openables.lend` do).
  - `?shut=0` or `sceneBuilder.shutBatcher.setEnabled(false)` compares;
    `.stats()` says what is merged. Pictures with it on and off: 0–86
    pixels of 3.1 M over 8 levels (an edge), by day, at night, lit live,
    tinted, unbaked, from above, with the live room on and off.
  - **Timings**, 2048 × 1536, step 4, two tabs taking turns: the version
    before / the new one merged / unmerged — A1 kitchen 13.7 / 14.9 /
    16.7 ms; living 13.6 / 14.5 / 15.7; sofa view 13.7 / 14.1 / 15.1;
    upper U kitchen 13.3 / 14.8 / 15.0; from above floor 0 11.2 / 11.7 /
    12.4, floor 1 12.6 / 13.2 / 15.2.
  - **What is left over the version before** is not how the parts are
    drawn. The shut fronts are lit live by the probes where they were in
    the lightmapped house (upper U: 1.1 ms, 0.7 of it the GPU's). And the
    new glass costs too: the fridges' glass shelves (13 see-through meshes,
    0.2 ms — hidden behind shut doors since wave C, `enclose`) and the
    showers' doors and portholes (0.2 ms). Each piece of double-sided glass
    is drawn four times a frame (two renders × back and front), and three
    works its program out again at each, because it swaps the material's
    side. Matching the version before would take the shut parts lit from
    the bake (a bake output of their own) or glass drawn in fewer passes —
    `forceSinglePass` is the same picture for a flat pane but not for a
    closed glass solid's two faces; splitting each into a back and a front
    material kept the draws and saved nothing (wave C, measured). Neither
    is done; it is the user's to decide. What wave C left is below.

# Windows that open: the app side (`World/Sash.js`)

Since 2026-10-16, wave A (`World/Sash.js`, `Builders/StructureBuilder.js`'s slim
branch).

- **Which open.** A slim window (`style: "slim"`) with a sill of at least
  0.3 m (`OPENS_FROM_SILL`), one sash per pane: Ladonia's `win()`, 45
  windows, 59 panes. Floor-to-head glazing (`glazing()`, sill 0.02) stays
  fixed, and so do kit-framed windows (Wrenfield's 25, Ashgrove's 22), whose
  frame and sash are one moulded ring. On a slim window, `opens: { type:
  "turn"|"tilt"|"fixed", hinge: "left"|"right" }` overrides this —
  nothing opens any other style whatever it asks (`windowOpens` returns
  null, and the editor's *Opening* says "Fixed: its frame and sash are one
  moulded piece"); the
  validator keeps only those two keys, the editor sets them under the
  window's properties, *Opening* ("As usual", Turns in, Tilts in, Fixed;
  *Hinged*: at the window's ends, Left, Right). No scene needs the field.
- **How a sash opens.** It turns in 90° about the jamb nearer its end of
  the window, so a pair opens from the middle and a lone pane, or the
  middle of three, hangs on the left (`paneHinge`; `left` is the wall's
  start, as for door swings). So `hinge` is named from the wall as
  emitted, start to end: a wall kit turns round for `outside` swaps left
  and right, as it swaps a door's hands
  (`../build-property-space/generator.md`, Swing) — check a
  hinge against the seeded wall's `start` and `end`, never by its name
  alone (`../build-property-space/checks/doors-dump.mjs` does this for
  doors, not windows).
  Inward is side B (−Z): the slim frame is set
  towards side A, outside. Where the collision trees hold anything in the
  quarter-cylinder its turn would sweep — room side, the sash's own
  height, out to its width + 1 cm, plus 4 cm past 90° for the handle, no
  clearance along the hinge (a bed's box ends 1 mm under the rail) — it
  tilts in 10° about its bottom rail instead (`WindowSash.plan(collision)`,
  exact, cached per tree revision; `planned.met` says what is in the
  way). Ladonia: 41 turn, 18 tilt — wardrobes beside windows, a headboard,
  the L kitchens' wall units, the U kitchens' taps, walk-in showers'
  pre-walls, an acute corner whose two windows would cross — the same with
  lane B's opening furniture in. `plan` for all 59: 8.5 ms (once a tree).
- **In the scene** a sash hangs in its wall's group like a door leaf
  (group `hingeSide`, meshes `doorLeaf`), so merging, the snapshot, the
  runtime's glass, stand-ins, the fit test, rays and the trees leave it
  alone; it is never in `builder.doors` (the bake's door states, the door
  probes and `nearestDoor` would take it for a door) but in
  `builder.windows` and `wallGroups[].windows`. The window's frame,
  mullions and blind are the same meshes as a fixed window's: its snapshot
  and bake are unchanged.
- **Collision.** A sill window's opening has an invisible 2 cm pane,
  labelled "Window", in the frame's outer half, in the static tree open or
  shut: nobody climbs or falls out (a jump reaches 1.7 m). The sash itself
  collides with nothing, like an open door's leaf. A low window made to
  open has no such pane; its sash bars the way while shut, tilted or
  turned under 0.3 (`getBlockers`, `Door.resolveCapsule`), drawn by C like
  a door. C draws the "Window" pane as a blocker (magenta), in a public view
  too (`ColliderView`'s `BLOCKER_LABELS`).
- **Public view.** A publish leaves an opening window's glass out of
  "see-through" and lists the sashes in the runtime file's scene extras,
  `sashes: { <wall>: { <opening>: { type, hinges } } }`; `buildFromRuntime`
  hangs exactly those, in stand-in walls as it does doors (shut before the
  publish: `resetWindows`). A version without the list keeps its fixed
  glass (Ladonia's 20261012T114849Z: 0 sashes, 142 panes).
- **Lit** as the window's fixed frame (a metal) and its fixed panes are,
  live, in every mode — not by ProbeLight, not tinted from the doors'
  probes — so a shut window looks as published (9,775 of 786,432 px
  differ, all inside the opening: the sash profiles). In a baked view a
  sash turned past 25° draws its glass as glass in a room, reflections
  only (`glazeInRoom`; before, turned in, it was a white sheet: 255, 251,
  238 → 86, 78, 71). K draws sash and frame live (`LiveRoom.movers`), and
  LiveLamps and LampPool redraw their shadows as a sash moves.
- **Acted on** by the built-in *window* provider (`picker-and-keys.md`): a sash the look
  ray met, or the hole of a pane (`through`) from the room's side, within
  `REACH.window` 2 m, never from outside; "Open window", "Tilt window" or
  "Close window", touch icon `window`; `act` → `{ kind: "window", id:
  "<opening>:<pane>", state: open|tilted|shut }`, the world's `"window"`;
  `busy()` "window" while one moves.
- **Cost**: public baked view, step 4, +12 / +110 / +26 draw calls
  (bedroom / street front / living room), +0.1–0.6 ms a frame; editor +24 /
  +162 / +42. The provider's share of the look ray 0.6–1.8 µs.
- **Testing**: `node scripts/test-windows.mjs` (30, 25 mutations caught).
  In a page with act.js: stand inside, aim at a pane, press E;
  `builder.windows[i].plan(world.collision)` and `.planned.met`.

## Elsewhere

- The space side — slim only, a sill of at least 0.3 m
  (`OPENS_FROM_SILL`), tilt 10°, kit-framed never open, `opens { type,
  hinge }`, hinge "left" towards the wall's emitted start, Ladonia 41
  turned and 18 tilted: `../build-property-space/buildings.md` (§3,
  Windows that open), and the spec field (a slim window's `opens`):
  `../build-property-space/spec-fields.md`.
- The spec's `opens` field (the validator keeps two keys), the editor's
  *Opening* property, StructureBuilder's slim branch and the invisible
  "Window" pane in the static tree, from the editor's side:
  `../walkthrough-editor/SKILL.md`; C drawing the pane as a blocker:
  `../walkthrough-editor/colliders-view.md`.
- A publish puts the sashes in the runtime file's scene extras, and a
  version without them keeps its fixed glass:
  `../publish-and-bake/publishing.md`.
- How a sash is lit in a baked view (`glazeInRoom`) and K drawing sash and
  frame live: `../baked-view-lighting/baked-drawing.md` and
  `../baked-view-lighting/live-room.md`; shut sashes merged with the shut
  parts: `../baked-view-lighting/merged-house.md`.
- Running and jumping at every sill window (`jump.js`, the capsule's
  `from` and `headroom`): `../walkthrough-editor/rays-and-collision.md`.
- The in-page check: `openables.js`'s `sashes()` (every sash's plan and E
  on each), in `../app-testing-and-performance/`.

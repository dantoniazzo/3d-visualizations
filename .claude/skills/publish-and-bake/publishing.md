# Publishing and the public view

What a publish makes and what a link opens: the latest version, what a
new feature needs published, how a scratch publish is made and checked,
what the publish's culling drops, what an unbaked version carries, and
which files a version serves. The rules and steps of publishing are
[SKILL.md](SKILL.md); the options are [publish-options.md](publish-options.md),
the manifest [manifest.md](manifest.md), the viewpoints and culling in
detail [culling-and-viewpoints.md](culling-and-viewpoints.md), a lane's
publish brief [scratch-publish.md](scratch-publish.md).

The two link words that pick a version (the rest of the table, with its
header and the code it was read against, is
[../baked-view-lighting/links-and-handles.md](../baked-view-lighting/links-and-handles.md)):

| word | where | what |
|---|---|---|
| `?version=<v>` | public | That published version, not the latest. |
| `?live` | public | No published version: the space as it stands, built and merged in the page, lit live. |

- `/view/<id>` shows the latest *published* version, not the scene being
  edited. See current work with `/view/<id>?live` or `/?scene=<id>` (an
  editor tab: plain light and the houses alone until asked:
  [../walkthrough-editor/editor-plain-light-and-scope.md](../walkthrough-editor/editor-plain-light-and-scope.md));
  `?version=<v>` opens one publish. The link's other words — `?lighting=`,
  `?quality=`, `?uncapped`, `?rated=`, `?guard=`, `?stats`, and the
  developer's `?lightmap=`, `?merge=`, `?roomlight=`, `?night=` — are
  listed in [../baked-view-lighting/links-and-handles.md](../baked-view-lighting/links-and-handles.md),
  and the browser's keys a test must remove in
  [../app-testing-and-performance/test-tabs.md](../app-testing-and-performance/test-tabs.md)
  (the publish options, the bake's options and the manifest are this
  folder's). Lights,
  switches and garden settings are gathered at publish: after changing
  them, re-publish and re-bake (`npm run build` alone changes nothing
  baked).
- **What wave A (2026-10-16) needs published.** A runtime file now carries
  each furniture part's holder's `turn`
  ([../visitor-interactions/opening-parts.md](../visitor-interactions/opening-parts.md)), the windows' `sashes`
  (scene extras) with their invisible "Window" panes in the static
  collision and their glass out of "see-through"
  ([../visitor-interactions/windows.md](../visitor-interactions/windows.md)),
  and no box for a way in (a shower's door); the published spec's lights
  carry ld-cabinet's lamp's new target. Ladonia's opening kitchens,
  wardrobes and storage, and its windows, reach the public view only once
  it is published again and baked (the final bake about 2 h; done at the
  user's ask on 2026-10-17, below); the
  versions published before keep their fixed fronts and fixed glass, and
  load and behave as they did
  ([act.js](../app-testing-and-performance/act.js)'s spots the same to the last field).
  The seats and the televisions need nothing published: the view reads
  the published spec, `seats.json` and `screens.json`. The shut parts and
  sashes are merged as the view loads (`World/ShutBatcher.js`;
  [../baked-view-lighting/merged-house.md](../baked-view-lighting/merged-house.md)): drawn one by one, 437 parts added to a baked
  test version had taken a kitchen frame from 13.1 to 16.0–17.3 ms (+609
  calls; 1024 × 768, step 4).
  A scratch publish (`PUBLISH_DIR` a scratch folder, its test server's
  publish and runtime PUT let through) is how lane W tried the path:
  Ladonia in 150 s, 59 sashes hung, every part where the editor has it.
  Wave B published Ladonia to a scratch folder three times
  (20261016T123730Z, 20261016T140136Z with the pool's steps and the
  parts' `reach`, and the integration's 20261016T173118Z), each draft-baked
  (128 samples, 2048²) in 3,640–4,065 s: 2,171,814 → 1,605,572 triangles,
  1,147 meshes, a 7.5 MB view unbaked and 35.4 MB baked, a 6,701 KB
  runtime, collision 1,067,926 → 99,908 triangles, 147–244 s a publish.
  A version published with the current furniture carries the water's
  anchors ([../visitor-interactions/water.md](../visitor-interactions/water.md)) and the pool's steps; one published
  before has neither.
  - *How the scratch publishes were made and checked* (wave B). The test
    tab was reloaded after any patch of the test server's scene copy
    (lane P's pool steps: an open tab's next save writes the old spec
    back). Before publishing, in that tab: the spec's new field there
    (`landscape.pools[0].steps`), its mesh ("pool-steps-ramp"), every
    piece loaded (630 of 630), 475 parts, 59 sashes. Only
    `POST /api/scenes/<id>/publish` and
    `PUT /api/scenes/<id>/versions/<v>/runtime` let through
    ([../app-testing-and-performance/harness.js](../app-testing-and-performance/harness.js);
    every other non-GET stubbed); the
    scratch `manifest.json`'s latest read before and after, and the
    repo's `published/` checked untouched. A test server that cannot bake
    (`BAKE=off`) publishes with the bake off whatever the option says;
    the draft from the terminal (`PUBLISH_DIR=<scratch> node
    scripts/bake-public.mjs <id> --samples 128 --size 2048`) then marks
    `options.bake` "draft", and the same version id draws baked. Ladonia:
    viewpoints 12,704 walking and 4,962 overhead, 146.6 s (157 with the
    runtime file). After, in its public view: `lighting` "baked", no
    warning; 475 parts with a published `reach`, 32 short; the batcher's
    534 entries and 4 `unseen` programs; water 70 outlets, 70 controls,
    15 enclosures; a down ray at (15.6, 1, 41.4) meeting "Pool steps" at
    −0.932.
- **"The latest" is whatever was published last, baked or not.** A publish
  with its bake off (the preset "Lit live — as in the editor") becomes what
  `/view/<id>` opens, over an earlier baked version. As the user's
  `published/` stood on 2026-10-14: Ladonia's latest is 20261012T114849Z,
  which they published and baked themselves on 2026-10-12 (final: 512
  samples at 4096, 93 switches, 84 doors, 12 people in its spec) — its
  plain link is drawn from the bake; Wrenfield's is still
  20261002T073753Z, unbaked, over the baked 20261001T143211Z — its plain
  link draws lit live, and all that "What a visitor is given"
  ([../baked-view-lighting/lighting-modes.md](../baked-view-lighting/lighting-modes.md)) says of a
  baked view needs `?version=20261001T143211Z` there, or the latest baked:
  a new publish with *Bake lighting* on (the panel's default is Final), or
  a bake of the latest as it stands (`npm run bake -- <id>` bakes the
  latest; the panel's *Bake* beside a version bakes that one). Theirs to
  ask for. Read `published/<id>/manifest.json` before saying which a link
  opens. As it stood when read on 2026-10-18: Ladonia's latest is
  20261017T173248Z, published from a server of our own and baked (final,
  512 at 4096) at the user's ask on 2026-10-17 ([SKILL.md](SKILL.md), step
  5) — its runtime file has 475 parts with `turn` and `reach`, sashes in
  45 windows and 70 water outlets, its spec the pool's steps, and its
  plain link is drawn from the bake; Wrenfield's is as above (latest
  20261002T073753Z unbaked, over the baked 20261001T143211Z). Older states:
  [history.md](history.md).
- Publishing drops faces no sampled viewpoint sees: landscape a visitor can
  walk round needs `mesh.userData.keepWhole = true` (HillBuilder,
  NeighbourhoodBuilder and LandscapeBuilder set it). The viewpoints
  (`Publish/viewpoints.js`) stand on every outdoor level a point has —
  a parking slot under a roof terrace as well as the terrace — on the
  terrain's height, and on roof terraces over rooms; from above, besides
  each floor level's own orbit, the ground floor is looked at from out
  where a car takes the view (`driveViewpoints`:
  [culling-and-viewpoints.md](culling-and-viewpoints.md); driving from
  above itself is [../visitor-interactions/driving.md](../visitor-interactions/driving.md)).
- **A version published unbaked looks as the editor does** (2026-10-05;
  the preset "Lit live — as in the editor": hidden faces removed, merged,
  compressed, plain glass, not baked, quality auto, all the scenery). What
  that took, for anything new a space draws: a material drawn by its own
  shader must take its data with it (the terrain's paint goes as four
  numbers a vertex, written `_PAINT0`/`_PAINT1` pairs and restored by
  name; an older version's terrain is painted on load, `paintTerrain`);
  materials keep `normalScale`, `depthWrite`, `side` and the metals'
  studio reflections (Runtime.js `exportable`); the faces culled that still
  cast a shadow travel in runtime.glb as position-only casters
  (`shadow:<floor>:<kind>:<cell>[:two]`, every face whatever the time of
  day, two-sided materials apart and drawn DoubleSide, in 16 m squares —
  8 m made 133 pieces, ~125 more draw calls a sun's map, for no time
  saved), simplified by the server like the collision (Ladonia 647,612 →
  78,116 triangles; the manifest's `shadowCasters`); a woven shade's
  strands, too fine for the samples, are kept whole from both sides
  (`keepWhole: "both"`, set by `markBulbs`); light glass and bulbs are
  their own meshes tagged with their switch, and the published spec's
  `lights` is gatherLights' list, which the public view switches live
  (an older version without it gathers its own from what it built). A
  version with nothing to switch keeps the old fill lights.
- `findPublished` (`frontend/index.js`) serves every lighting file whose
  name ends `.webp/.png/.jpe?g/.ktx2/.bin` from beside the manifest: a new
  file type must be added to that pattern, or it fetches index.html ("read
  past end").

## What else a publish carries (one line each, from the other skills)

A publish takes the scene as the editor has built it; these are the
things other subsystems put into it, or need from it, and where each is
written up.

- **People** travel only as the published `spec.json`'s list — never in
  the snapshot, view or runtime file, the visibility sampling or a bake —
  so after placing or changing them, publish again (no bake). The Publish
  panel's Scenery boxes leave them out (`leaveOut`), and `sceneryKnown`
  keeps remembered options from dropping everyone
  ([../space-people/scene-people.md](../space-people/scene-people.md);
  [publish-options.md](publish-options.md)).
- **Opening parts**: a publish writes each holder's `turn` and `reach`
  (`Publish/Runtime.js`); versions up to 20261016T123730Z work the stop
  out in the view, against its collision
  ([../visitor-interactions/opening-parts.md](../visitor-interactions/opening-parts.md);
  in a test tab `part.plan`, `reach` and `published`:
  [../visitor-interactions/page-handles.md](../visitor-interactions/page-handles.md)).
  The parts are never baked; the body is baked open ([baking.md](baking.md)).
  A turned piece's drawers slid sideways until the loader turned
  `opens.direction` ([../visitor-interactions/SKILL.md](../visitor-interactions/SKILL.md)).
- **Windows**: the sashes go in the runtime file's scene extras, and a
  version without them keeps fixed glass
  ([../visitor-interactions/windows.md](../visitor-interactions/windows.md)).
- **Water**: only a version published with the current furniture has
  water, because `Publish/Runtime.js` copies the fixture nodes
  ([../visitor-interactions/water.md](../visitor-interactions/water.md)).
- **The pool**: its steps are `decor` of the static house and need a
  publish and a bake; the water's look reaches every version with a build
  alone, the runtime's own "pool-water" being dropped
  ([../visitor-interactions/pool-water.md](../visitor-interactions/pool-water.md)).
- **Seats and televisions** need nothing published: the view reads the
  published spec, `seats.json` and `screens.json`
  ([../visitor-interactions/sitting-and-tv.md](../visitor-interactions/sitting-and-tv.md)).
- **Light targets** (where a visitor points at a lamp) are published: a
  public view gets a change only on the next publish
  ([../walkthrough-editor/lights-and-fittings.md](../walkthrough-editor/lights-and-fittings.md)).
- **Lamp glow materials**: the bake matches bulbs by exact material name,
  and a publish renames a second model's same-named material `name#1`
  ([../build-property-space/furniture-catalogue.md](../build-property-space/furniture-catalogue.md)).
- **The editor's stand-ins**: `setActive(false)` and `holdRealistic` take
  them out, so a publish gives identical files; a publish from the plain
  view holds the scene realistic without drawing it, and one whose
  realistic light fails to come up is still read as built
  ([../walkthrough-editor/stand-ins.md](../walkthrough-editor/stand-ins.md),
  [../walkthrough-editor/editor-plain-light-and-scope.md](../walkthrough-editor/editor-plain-light-and-scope.md)).
- **Collision**: a publish calls `refreshCollision()` and
  `settleCollision()` (`Runtime.js`, `Snapshot.js`), and collides the
  editor's furniture tree (`dynamicCollisionRoots`)
  ([../walkthrough-editor/rays-and-collision.md](../walkthrough-editor/rays-and-collision.md)).
- **userData**: a runtime publish carries `userData` as JSON in its
  extras, so never keep a Texture or a Color in `material.userData`
  ([../walkthrough-editor/three-pitfalls.md](../walkthrough-editor/three-pitfalls.md)).
- **Landscape**: walkable landscape needs `userData.keepWhole`, and
  anything new drawn by its own shader must carry its data into the
  publish (above; [../build-property-space/landscape.md](../build-property-space/landscape.md)).
- **A car from above**: follow a car over `shared/drive.js`'s ground and
  sample the publish there (`driveViewpoints`,
  [culling-and-viewpoints.md](culling-and-viewpoints.md);
  [../visitor-interactions/driving.md](../visitor-interactions/driving.md)).
- **The publishing tab**: a hidden pane has no requestAnimationFrame, so
  Publish stalls at "Checking for holes" until the tab is fronted
  (`tabs_select` + a screenshot) or its frames are driven (`drive.js`: a
  Ladonia publish took ~8 min driven); a stub that answers every non-GET
  swallows a publish ("Couldn't publish: Cannot read properties of
  undefined (reading 'view')"), and harness.js lets `/publish`,
  `/versions/<v>/runtime` and `/bake` through by the path alone, on any
  port ([../app-testing-and-performance/browser-pane.md](../app-testing-and-performance/browser-pane.md)).

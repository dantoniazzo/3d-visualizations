# The snapshot's culling and viewpoints

A publish drops every face no sampled viewpoint sees and turns the rest
single-sided (the `cull` option, [publish-options.md](publish-options.md)).
So what the viewpoints miss is a hole in the public view: landscape a
visitor can walk round needs `mesh.userData.keepWhole = true`, and the
viewpoints themselves (`frontend/Experience/Publish/viewpoints.js`) are
in [publishing.md](publishing.md) ("Publishing drops faces…"). The faces
culled that still cast a shadow travel in `runtime.glb` as position-only
casters (publishing.md, "A version published unbaked looks as the editor
does"). Run [holes.js](../app-testing-and-performance/holes.js) after any
change to the publish's viewpoints or culling.

In short (from the walkthrough's keys table,
[../visitor-interactions/picker-and-keys.md](../visitor-interactions/picker-and-keys.md),
From above at the wheel):
sampled at publish (`Publish/viewpoints.js`'s `driveViewpoints`): rings
round the ground storey's box `DRIVE_RING` 12 m out and 24 m apart, each
next twice as far out and as sparse, to `driveBounds`, every distance,
pitch and azimuth of `BIRD_VIEW` kept only with the houses' box (indoor
rooms ± 8 m) in frame; drawn with `maxLevel` the storey's top level and
`ceilingFrom` its lowest (Ladonia 642 views, Wrenfield 490).

Driving from above itself — the view following a car over all the ground
it can drive on (`shared/drive.js`'s `driveBounds(spec)`) — is
[../visitor-interactions/driving.md](../visitor-interactions/driving.md);
the bird's-eye view as drawn is
[../baked-view-lighting/birds-eye.md](../baked-view-lighting/birds-eye.md).
What follows is the publish's side of it, and the check of the version
published before it, from out there (2026-10-16).

- *Sampled at publish* (`Publish/viewpoints.js`'s `driveViewpoints`,
  appended to `birdViewpoints`, so the jittered check set gets its share
  and every older sample keeps its place in the seeded sequence):
  targets on rings round the ground storey's box, `DRIVE_RING` (12 m)
  out and 24 m apart, then 36 m / 48, 84 / 96, 180 / 192… — each ring
  twice as far out and twice as sparse — as far as `driveBounds` goes,
  at the ground's height + 1 m (the terrain's, else the storey's); each
  orbited as a floor's targets are, keeping only the views whose frame
  (fov + 8°, 4 : 3, as the IdPass draws) takes in the houses' box (the
  indoor rooms ± 8 m, every floor's height): out there nothing else is
  culled — the terrain, the landscape and the neighbourhood are kept
  whole. Drawn as the view shows the storey: `maxLevel` its top level,
  and the IdPass's new `ceilingFrom` its lowest, so every level's
  ceilings go (an older view passes its own level: the same test as
  before). Ladonia: 82 targets, 642 views (4,320 the floors' own), 73 in
  the check set, ≈ 2 s at its 2.75 ms a bird sample (of 168.5 s);
  Wrenfield 34 / 490 / 66, ≈ 0.9 s of 14.9. The frame tested against all
  the rooms instead (Ladonia's 320 m road among them) gave 4,498, +14 s.
- *The version published before, looked at from out there* (2026-10-16,
  20261012T114849Z; [holes.js](../app-testing-and-performance/holes.js),
  in the skills since 2026-10-17, with [count-views.mjs](count-views.mjs)
  (this folder) for a version's bird's-eye samples, drive ones
  included, and `--dump` for `holes.js`'s `seenBy`): the runtime file's shadow
  casters are every culled face that casts a shadow; drawn after the
  view's own depth, pushed 5 cm back along the ray, front faces only (two
  faces for two-sided), on the floors shown, what passes the depth test
  is a face the editor shows and the view does not (under a dining
  table looking up: 702 px). 96 views a target (pitch 30/45/60/89, 8
  azimuths, 6/14/24 m), 512 × 384: inside the box (road edge, parking,
  garden, road ends) 132 of 864 views had any, 1,139 px, worst 38; east
  off-road 38 of 960, 148 px, worst 14; north past the road 2 px; south,
  west (the forest) and far out (x 150–300, the corners) none. All of it
  single pixels on the cut tops of the ground-floor walls at y ≈ 3 (level
  4, and building C's terraces at level 2) — there from inside the box
  too: the publish samples each floor *level* with the level's own
  ceilings alone taken away, while the view shows a *storey* with all of
  its ceilings gone. The 642 drive views see 134 of those 150 px at the
  same metre (147 within a metre). Not a culling hole but seen out there:
  a hairline crack along the edge of the terrain's 1 m detail grid (x 76,
  z 78 and −62, x −64), the inner grid's one-way skirt against the 6 m
  one — the terrain as built, kept whole, there from the road as well.

## The tools

- [count-views.mjs](count-views.mjs) (node, this folder; read-only):
  `node .claude/skills/publish-and-bake/count-views.mjs [--dir
  <publish-dir>] [--dump out.json] <id>...` — a published version's
  bird's-eye samples, counted as the publish plans them, the drive ones
  included, against its manifest's levels and stats. `--dir` is a test
  server's `PUBLISH_DIR` (default the repo's `published/`, only read);
  `--dump` writes one version's drive and check samples for `holes.js`'s
  `seenBy`. It finds the repo three folders up (or `REPO=<dir>`) and
  imports the app's own modules.
- [holes.js](../app-testing-and-performance/holes.js) (in-page, in a
  public view, after boot.js, through the sink):
  `__holes.look/sweep/shot/seenBy` — culled faces the bird's-eye camera
  would see (`sweep`'s `azimuths` is a count; each call puts the page's
  floors back after). A lower bound: a culled face that casts no shadow
  (glass, alpha-tested leaves) is not carried in the runtime file. How to
  load it: [../app-testing-and-performance/tools.md](../app-testing-and-performance/tools.md).

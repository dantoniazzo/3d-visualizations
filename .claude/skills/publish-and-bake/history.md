# Publish and bake: history

Newest first. Each: what the user said or what was found, what was
changed, where. The lessons are in [SKILL.md](SKILL.md) and the topic
files; this is the record, read when you need to know what was done
before, what a version holds, or what is still short. Where a whole entry
belongs to another skill, the line here says what of it is this skill's
and points there.

- **2026-10-18 (read)** — `published/` as it stood, read when this skill
  was split out: Ladonia's (`kosinozici-villas`) latest is
  20261017T173248Z, baked (final, 512 samples at 4096, `bakedAt`
  2026-10-17 19:29:02 UTC, 5.19 cm texels, margin 4, 93 switches, the
  night's `garden` 16, 12 people in its spec; its runtime file has 475
  parts with `turn` and `reach`, sashes in 45 windows, 70 water outlets;
  the manifest's `shadowCasters` 610,698 → 80,715 triangles in 51 pieces).
  Wrenfield's latest is still 20261002T073753Z, unbaked, over the baked
  20261001T143211Z: its plain link draws lit live; re-baking it is the
  user's to ask for.

- **2026-10-17** — The user asked to "publish and bake" Ladonia. →
  Published from a server of our own, never their :3000 (`PORT=<free>
  BAKE=off SCENES_DIR=<scratch copy of scenes/> node server/index.js`, a
  launch.json entry restored after), with the latest version's options
  from its manifest, Bake "Off" there: 144 s, 1,605,627 triangles, 1,147
  meshes, view 7.5 MB, runtime 6.7 MB. The tab closed, then `npm run bake
  -- kosinozici-villas` in the background, logged to the session's folder:
  6,940 s (1 h 56 min; view 33.4 MB, lightmaps 1.1 + 1.0 MB,
  `options.bake` "final"). The recipe is [SKILL.md](SKILL.md) step 5.
  This closes 2026-10-16/17's "Ladonia must be published again and baked"
  (below). Also that day: `holes.js` and `count-views.mjs` brought into
  the skill's folder from the scratch folder (now
  [../app-testing-and-performance/holes.js](../app-testing-and-performance/holes.js)
  and [count-views.mjs](count-views.mjs)), with the usability work's
  in-page kit; `holes.js` since puts the page's own floors back after
  each call (before, a walking view was left with its upper floors,
  ceilings and roofs hidden).

- **2026-10-16/17** — Q, driving from above, the picker, sitting, the
  televisions, windows that open, running water, swimming and the pool's
  steps and water (waves A, B and C, then the clips passes): the whole
  entry is [../visitor-interactions/history.md](../visitor-interactions/history.md).
  This skill's share:
  - *Driving from above*: the publish samples the view from out there too
    (`driveViewpoints`: 642 more bird's-eye samples, about 2 s;
    [culling-and-viewpoints.md](culling-and-viewpoints.md)). The check of
    the version published before (20261012T114849Z) from out there with
    `holes.js`: single pixels on the cut tops of the ground-floor walls,
    because the publish samples levels and the view shows storeys; the
    terrain grid's hairline crack (x 76, z 78 / −62) is the terrain as
    built.
  - *What wave A needs published*: the parts' holders' `turn`, the
    windows' `sashes` and their invisible panes, no box for a way in,
    ld-cabinet's lamp's new target ([publishing.md](publishing.md)).
  - *Wave B's scratch publishes* of Ladonia, the record: lane W's try of
    the path, 150 s, 59 sashes hung; then 20261016T123730Z,
    20261016T140136Z (with the pool's steps and the parts' `reach`) and
    the integration's 20261016T173118Z, each draft-baked at 128 samples
    and 2048 in 3,640, 4,065 and 3,878 s (423 hand-overs each, the unwrap
    8.2–8.3 s, the atlas 30% filled, house texels 10.3 cm); 2,171,814 →
    1,605,572 triangles, 1,147 meshes, a 7.5 MB view unbaked and 35.4 MB
    baked, a 6,701 KB runtime, collision 1,067,926 → 99,908 triangles,
    147–244 s a publish; viewpoints 12,704 walking and 4,962 overhead,
    146.6 s (157 with the runtime file). How they were made and checked:
    [publishing.md](publishing.md). Nothing was published to the repo's
    `published/`.
  - *Still short, then*: Ladonia must be published again and baked (the
    final about 2 h) for the opening furniture, the windows, the water,
    the steps and swimming to reach its public view; their `published/`
    still ended at 20261012T114849Z — done on 2026-10-17 (above). What the
    new version still costs over the 12 October one: cutting the part
    glass's passes changes its look, and a bake output for the shut parts
    is not built — the user's to decide
    ([../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md)).
    Q on a terrace has nothing to switch in a public view because the
    terrace lamps are not in its bake
    ([../baked-view-lighting/history.md](../baked-view-lighting/history.md)).
    A public view has water only from a version published since the
    anchors (20261016T123730Z on, in the scratch folder).

- **2026-10-15** — The live room (**K**) in the bake's own light: the
  whole entry is [../baked-view-lighting/history.md](../baked-view-lighting/history.md).
  This skill's share: step 6's checks of K (judged against the baked
  frame of the same pose, the six cases) come from it. Still short there:
  a switch with more lights than the step's shadowed lamps is all the
  bake's; door leaves are their true oak where the baked view draws them
  nearly white; a window's frame and pane, a mirror or a washer are the
  room's by day; the indoor sky's light is upside down
  (`Sky.indoorLight`, not mended: it changes every live view).

- **2026-10-14** — As the user's `published/` stood that day: Ladonia's
  latest was 20261012T114849Z, which they published and baked themselves
  on 2026-10-12 (final: 512 samples at 4096, 93 switches, 84 doors, 12
  people in its spec) — its plain link drawn from the bake; Wrenfield's
  was 20261002T073753Z, unbaked, over the baked 20261001T143211Z — its
  plain link lit live, a baked view needing `?version=20261001T143211Z`.
  Found by reading that day: a publish whose realistic light fails to
  come up would have taken the snapshot with 4,114 of Ladonia's 4,999
  meshes on layer 12, which `canMerge` passes over; `holdRealistic` now
  takes the stand-ins out itself
  ([../walkthrough-editor/editor-plain-light-and-scope.md](../walkthrough-editor/editor-plain-light-and-scope.md)).
  `test-bake-batches.mjs` and `test-light-regions.mjs` passed again
  after the editor's and the live room's work.

- **2026-10-13** — K draws rooms unbaked, the editor's speed: the whole
  entry is [../walkthrough-editor/history.md](../walkthrough-editor/history.md).
  This skill's share: a publish's files are the same through the
  editor's stand-ins (every binary chunk of `view.glb`, `snapshot.glb` and
  `runtime.glb` identical to the publish before, the stats equal). Left
  for the user: Wrenfield's bake of 2026-10-01 baked again, for its
  doorways' reveals beside a live room (zoned to the room behind them
  before doorway faces were cut at the wall's middle); villa C's
  first-floor hall has a wall's end the bake files under "outside" and
  lights black, K or no K — the bake's zoning, to be mended there
  ([bake-light-files.md](bake-light-files.md)).

- **2026-10-12** — Performance of the editor and the public view (the
  work of 2026-10-10 to 12): the whole entry is
  [../baked-view-lighting/history.md](../baked-view-lighting/history.md).
  This skill's share:
  - *The bake's blotches were its encoding, not its samples* (sixteen
    variants of Wrenfield): one scale for the whole atlas left a room
    14–20 of 255 levels and the lossy WebP erred in blocks. Each room's
    part is now written by a curve of its own. 512 samples at 4096 stays
    the final: 128 leaves mottle indoors by day, 2048 samples buy little
    for four times the sampling, a 2048 atlas loses strips, sun-patch
    edges and contact shade; out of doors 32 samples would do. Strips
    under three texels are lit through their vertices, doorway faces cut
    along the wall's middle and given to the room they are seen from, the
    garden's lamps are in the night's bake, and the scene is handed to
    Cycles 148 times a bake, not 352 (Wrenfield 34.9 min → 28).
    ([bake-light-files.md](bake-light-files.md), [bake-time.md](bake-time.md).)
  - *Not baked again*, as that entry was written: neither published bake.
    Ladonia's 20261004T152226Z still had the black doorway bands and
    strips, no garden lamps in its night, the tinted blocks in dim rooms
    and no people. The user published and baked Ladonia afresh that same
    day — 20261012T114849Z, with its twelve people, 1 h 52 min, begun 28
    minutes after the publish — so its plain link was drawn from a bake
    of this code. Wrenfield is half an hour to publish and bake — still
    so, and theirs to ask for.
  - *Unfinished then*: face zoning does not cut at floors and ceilings;
    switches are still baked one to a pass (lit together their light
    changed); a whole bake of Ladonia with this code was not run (only
    cut-down night bakes, for the garden's lamps — the user's own bake
    that day was the first).
  - `bake-check.js` rewritten for the resolved lightmap (it drew
    `material.lightMap.image` to a canvas, no longer a picture).
  - `app-notes.md` split "Publishing, the public view and baking" into
    sections of its own (the seven from "Publishing" to "Measuring"); an
    older note that points there means one of them, now in this skill
    and [../baked-view-lighting/SKILL.md](../baked-view-lighting/SKILL.md)
    ([SKILL.md](SKILL.md), "Older names").

- **2026-10-11** — A stub that answered every non-GET swallowed a
  publish: after four minutes of walking the panel said "Couldn't publish:
  Cannot read properties of undefined (reading 'view')" — the stub's `{}`
  read as the server's answer. → harness.js lets `/publish`,
  `/versions/<v>/runtime` and `/bake` through
  ([../app-testing-and-performance/browser-pane.md](../app-testing-and-performance/browser-pane.md)).

- **2026-10-10** — Sixteen variants of Wrenfield's bake, on the committed
  code: what each setting is good for ([baking.md](baking.md), drafts).
  A publish from the editor's plain view gives the same files as from the
  preview (binary chunks identical, JSON apart only in the timings and the
  pool's clock).

- **2026-10-05** — Lights switchable in the editor, and a publish "with
  the first 4 optimizations but nothing else … everything look like during
  the edit mode": the whole entry is
  [../walkthrough-editor/history.md](../walkthrough-editor/history.md).
  This skill's share: the preset "Lit live — as in the editor" (a version
  published unbaked looks as the editor does: [publishing.md](publishing.md));
  night publishes keep their shadow casters, the casters simplified on the
  server, the baked terrain painted, the bake reading the new snapshot; a
  woven shade lost a fifth of its strands in a publish (kept whole from
  both sides since: `keepWhole: "both"`). The same day a `SendMessage` to
  a subagent still working resumed a second copy of it: a duplicate
  publish, a reload mid-publish and a bake neither copy remembered
  starting.

- **2026-10-04/05** — The user: fix the issues the last review found, and
  "perform the bake, I got some error during the bake, so fix it if there
  are any issues with it". → The three model faults fixed (the lounge
  lumbar inside its back cushion, the ochre kitchen's splashback coplanar
  with its shelf column, the bed runner floating), plus a garden chair's
  sling and cushion
  ([../build-property-space/history.md](../build-property-space/history.md)).
  The bake's failure: `pack_zones` sized each room for a
  density the atlas could not hold, and Blender's packer shrank a dozen
  rooms to nothing (now sized from island boxes, margins narrowed as
  needed); Blender's exit code hid the traceback (`--python-exit-code 1`);
  the minimum-stretch unwrap was nondeterministic (angle-based now). Then
  a draft bake that ran showed every room far darker than the live view,
  and the bake ignored the site's sky: sun 83° off, procedural sky, moon.
  → `shared/sky.js` shared by Sky.js and the bake (`landscapeSky`,
  `sky_world`); the baked view sets the sky before the bake's light (no
  race); interiors metered (Realism's `LightMeter`); glass and metals
  whose shaders failed (`userData` textures through `Material.clone`)
  fixed (those three: [../baked-view-lighting/history.md](../baked-view-lighting/history.md));
  two adversarial review rounds, all confirmed findings fixed
  ([baking.md](baking.md)). Final bake of version
  20261004T152226Z: 3 h 22 min, 5.5 cm texels, no errors; interiors at
  101–112 of 255 mean brightness against the live view's 105–124,
  sunlit exteriors 7–9% brighter, shaded façades 25% brighter (as in
  renders 13/14). Still short: the
  landscape's trees, woods and hedges cast no shade in the bake (phones
  show none); windowless rooms are black by day until their light is
  switched on; bedrooms whose blinds are down bake dim.

- **2026-10-01** — Wrenfield's only bake, 20261001T143211Z, from before
  the code of 2026-10-12 (one scale a lightmap, the old zoning): what it
  shows until it is baked again is in
  [bake-light-files.md](bake-light-files.md) ("What a bake from before
  2026-10-12 shows of it"). Its latest, 20261002T073753Z, was published
  unbaked over it the next day.

## Superseded measurements

The figures a later one replaced, kept for comparison; each is also in
its topic file with its context.

- Wrenfield final, 512 samples at 4096: the committed code 34.9 min
  (2,093 s) → 2,197 s on the same code before the hand-over work → 1,664
  s (27.7 min) after it on a quiet machine; 1,719 s (28.7 min) with the
  doorway cuts and the layers' own copies, a browser drawing on the GPU
  for its first ten minutes. Hand-overs 352 → 148. The Publish panel's
  draft (128 at 2048) 10.4 min with the committed code, 622 s → 418 (7
  min). "Fully baked" 1,201 s. The committed code's fit: `555 s + 491 s
  × (size/4096)² + 1,079 s × sampling` ([baking.md](baking.md), Times;
  [bake-time.md](bake-time.md)).
- Ladonia final: 3 h 22 min (2026-10-04, 20261004T152226Z) → about two
  hours by arithmetic on the code of 2026-10-12 → 1 h 52 min (the user's,
  2026-10-12, 20261012T114849Z) → 6,940 s, 1 h 56 min (2026-10-17,
  20261017T173248Z, with 475 opening parts and 59 sashes). Hand-overs
  1,542 → 423 (1,168 → 193 of probe objects, 374 → 230 lightmap passes;
  some 1,400 as the code stood on 2026-10-04).
- Ladonia draft: 1 h 55 min (2026-10-04, 16 samples at 1024; ~25 min to
  reach the samples) → 61–68 min (2026-10-16, 128 samples at 2048, with
  its opening furniture).
- Ladonia's house texels at 4096: 5.5 cm (2026-10-04), 5.6 with the
  margins narrowed 8 → 4, 5.05 (2026-10-12), 5.19 (2026-10-17).
- Ladonia's shadow casters: 647,612 → 78,116 triangles as the publish
  notes have it; 610,698 → 80,715 in 20261017T173248Z.
- A Ladonia publish: lane W 150 s; wave B 147–244 s; 2026-10-17 144 s.
  Triangles 2,171,814 → 1,605,572 (wave B); 1,605,627 (2026-10-17).
- `driveViewpoints`: the frame tested against all the rooms (Ladonia's
  320 m road among them) gave 4,498 views, +14 s, before it was tested
  against the houses' box (642, ≈ 2 s).
- A Wrenfield day lightmap's encodings, 512 samples
  ([bake-light-files.md](bake-light-files.md)): one scale q90 0.67 MB,
  lossless 3.15 MB, a quarter of the scale at q98 1.5 MB, a curve a room
  at q90 1.2 MB → q80 with the colour at q90, 0.80 MB (what is written).

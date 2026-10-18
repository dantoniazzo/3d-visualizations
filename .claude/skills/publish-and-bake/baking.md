# Baking

How to run a bake, how long it takes, what it takes from the site, the
two kinds of bake, what goes wrong and why, and how to compare two bakes.
The steps of a bake — before, draft on a copy, the log, the draft looked
at, the final, the published view checked — are [SKILL.md](SKILL.md);
the bake's words and environment are [bake-options.md](bake-options.md);
what a bake writes and how it zones its light is
[bake-light-files.md](bake-light-files.md); where its time goes is
[bake-time.md](bake-time.md); what it writes into the manifest is
[manifest.md](manifest.md). How the view draws a bake is
[../baked-view-lighting/SKILL.md](../baked-view-lighting/SKILL.md).

## Commands and times

- **Commands.** A draft, in the background, against a scratch folder:
  `PUBLISH_DIR=<scratch>/published node scripts/bake-public.mjs <id>
  --version <V> --samples 32 --size 1024 > log 2>&1`; the final is `npm run
  bake -- <id>` (512 samples at 4096). Its other words — `--margin`,
  `--full`, `--static`, `--variants`, `--no-switches`, `--no-doors`,
  `--dry <file>`, `--debug` — and the developer's `BAKE_…` switches are
  listed in [bake-options.md](bake-options.md). One bake at a time (`.bake-lock`: Blender takes
  the whole GPU). Print the resolved `PUBLISH_DIR`
  (`server/publish/store.js`) before a first bake and stop if it is not
  the folder meant: a bake updates the version in place. Run it detached
  with nohup and poll the log — a background shell stops at 2 h, a
  foreground command at 10 min.
- **Times** (M4 Pro). Wrenfield — a house of 19 rooms with 22 switches and
  17 doors — final: 27.7 min on a quiet machine (1,664 s), 28.7 with a
  browser drawing on the same GPU for its first ten minutes (1,719 s); the
  committed code took 34.9 (2,093 s). Published "Fully baked", 20 min
  (1,201 s). The Publish panel's draft, 128 samples at 2048: 7 min (418 s;
  10.4 min with the committed code). With the committed code five settings
  fitted `555 s + 491 s × (size/4096)² + 1,079 s × sampling` (sampling 1 =
  512 samples at 4096: 32 at 4096 19.1 min, 512 at 2048 17.9, 128 at 4096
  22.7) — a draft is nearly all fixed cost. Ladonia — three buildings, 93
  switches, 84 doors — took 3 h 22 min on 2026-10-04 and was expected to
  take about two hours with this code, by arithmetic
  ([bake-time.md](bake-time.md)). The user's own final bake of it on 2026-10-12 bears
  that out, by its files: version 20261012T114849Z `publishedAt` 11:48:50
  UTC; its folder `bake-mv57vs13`, whose name is the time the bake's
  script started in base 36 (`scripts/bake-public.mjs`: 12:17:13 UTC);
  `bakedAt`, written as it ends, 14:09:10 — 1 h 52 min, begun 28 minutes
  after the publish (5.05 cm texels, margin 4). Whether the Publish panel
  or a terminal started it the files do not say. Ladonia's draft (128
  samples at 2048) with its opening furniture: 3,640–4,065 s, three times
  on 2026-10-16 (scratch publishes; [bake-time.md](bake-time.md)).
- Drafts are blotchy and their small pieces bleed: judge light levels and
  directions in one, not grain, trims, pickets, sun-patch edges or contact
  shade. What each setting is good for (sixteen variants of Wrenfield,
  2026-10-10, the committed code): out of doors 32 samples is the same
  picture as 512; under lamps 128 looks as 512 on walls, floors and
  worktops, and 32 breaks where a lamp barely reaches and on vertex-lit
  pieces; by day indoors 512 is clean at walking distance, 128 leaves soft
  mottle on beds, worktops and one-window rooms' walls, and 2048 is better
  only close up for four times the sampling. A 2048 atlas for a house (5.9
  cm texels: Ladonia's density) loses the window bars in a sun patch and
  weakens contact shade, whatever the samples. So: final 512 at 4096;
  draft 128 at 2048 for levels and placement only.
- **Ladonia's drafts and finals**, as the bake's method recorded them.
  Its draft took 1 h 55 min on 2026-10-04 (16 samples at 1024), nearly
  all of it handing the scene to Cycles — some 1,400 times as the code
  then was (1,542 as committed then). On the code since 2026-10-12 it is
  423 hand-overs (230 for lightmap passes, 193 for the vertices' and the
  probes' light), and with its 475 opening parts and 59 sashes a draft at
  128 samples and 2048 took 61–68 min (wave B, 2026-10-16, three drafts:
  3,640–4,065 s; `PUBLISH_DIR=<scratch>/pub node scripts/bake-public.mjs
  <id> --samples 128 --size 2048`, detached): view 35.4 MB, lightmaps 0.5
  + 0.5 MB, probes 1.3 MB. The final: 3 h 22 min on 2026-10-04; the
  user's own bake on 2026-10-12, 1 h 52 min, by its folder's stamp and
  its `bakedAt` ("Times", above); the user's of 2026-10-17, with the
  opening parts and sashes, 6,940 s (1 h 56 min; view 33.4 MB, lightmaps
  1.1 + 1.0 MB, `options.bake` "final"). Blender holds the GPU the whole
  time: take no timings meanwhile.

## What the bake takes from the site

Before a final bake of a site, see that the bake will have what the
view will need of it.

- The bake's tree shade comes only from the Fluffy Tree garden's trees
  (`planTrees`, `planHillTrees`, `planRoadTrees` → `tree_shade` proxies);
  a landscape's own trees (World/Flora) are in no lightmap unless added to
  `scripts/bake-public.mjs`'s settings. Drawn "baked" they shade the sun
  live instead, in the shade map of what moves (`LiveLamps` `SUN_MOVE`:
  drawn again as the view moves a metre); drawn "static" — steps 0–1,
  phones — and from above they cast nothing.
- Big outdoor geometry steals lightmap texels, and the bake fills hidden
  faces only from spec walls and slabs (`scripts/bake-public.mjs`
  `solids`), with only the fence and hills in `coarseMaterials`. Before a
  final bake of a `spec.landscape` site, add its landscape walls, planters
  and terrain to both, and compare `[bake] house texels` before and after.
- A surface hidden under other geometry bakes black and bleeds: cut it out
  (holes) rather than leaving it underneath.
- Light units, matched to the bake: a Blender sun of strength S is a
  DirectionalLight of intensity S; a W-watt point lamp is W/(4π)
  ([../walkthrough-editor/lights-and-fittings.md](../walkthrough-editor/lights-and-fittings.md)).
- The bake matches bulbs by exact material name, and a publish renames a
  second model's same-named material `name#1`: give every lamp's glow
  material a name only that piece uses
  ([../build-property-space/furniture-catalogue.md](../build-property-space/furniture-catalogue.md)).
- The bake's texture generators tile by indexing pixels modulo the image
  size (`lib/bake.py`), with any period a divisor of 512
  ([../build-property-space/finishes.md](../build-property-space/finishes.md)).
- The garden's own lights (uplights, downlights, each pool's lamp) are in
  the night's bake, the pool's lamp at the water's surface:
  [bake-light-files.md](bake-light-files.md).
- People are never in a bake, nor in the visibility sampling: they travel
  only in the published `spec.json`
  ([../space-people/scene-people.md](../space-people/scene-people.md)).

## Two kinds of bake, and the site's sky

- **A version published "Fully baked" is baked for that alone**
  (`scripts/bake-public.mjs` reads `options.lighting ===
  "static"` and passes `--static`; `--full` on its command line bakes all
  of it, `--static` leaves it out whatever the version says): no doors
  baked shut, no light probes, no sun masks, no `-indirect` lightmaps or
  switch layers, no `_…_INDIRECT` vertex light. The passes of light are
  the same ones, so what such a bake keeps is what a whole bake has
  (Wrenfield: its lightmaps and switch layers differ from the whole
  bake's as two runs of one bake do; the thin faces' light has other
  grain, their probes' object being without the light probes' points;
  16 frames against the whole bake drawn `?lighting=static`: mean levels
  within 0.2, 0–0.6% of pixels over 8 levels, 3.5% on the landing with
  its balusters and door leaves). **1,664 s → 1,201** — the doors' 430 s,
  and 30 s of files not written — and **view.glb 6.46 → 3.94 MB**, the
  bake's folder 17.6 → 9.4 MB (568 files → 285). Its
  manifest says `lighting.only: "static"`, and `lightingMode` draws it
  static whatever the link asks (`?lighting=baked`, `=live`): it has
  nothing else to draw from (a manifest the store rebuilds from a bake's
  own `bake.json` keeps `only` and `margin` too: `server/publish/store.js`
  `rebuildManifest`). The Publish panel's bake goes by the same
  option, through the same script. The whole-atlas `-indirect` lightmaps
  alone (read only by `?lighting=live`) are not worth an option of their
  own: writing them is 4 s of a bake, and the pass they come from is the
  sun mask's, which "baked" mode needs.
- **A site with its own sky is baked under it** (2026-10-04): until then the
  bake lit every space with its `environment.preset` — Ladonia's sun 83°
  from the live view's (from the west, not east-south-east), a flat
  procedural sky, a moon. `shared/sky.js` now holds the live sky's numbers
  (`SKY_VARIANTS`) and its sun maths (`findSun`, `sunDirection`), used by
  both World/Sky.js and `scripts/bake-public.mjs`'s `landscapeSky`, which
  hands bake_public.py's `sky_world` the HDR (sun clipped at the browser's
  ceiling, turned with a TEXTURE Mapping at Z = +turn — render-checked),
  the sun (`#fff6ea`, 3.2, 1.1° across) and the strengths: by day the
  sky's own (1.0; the live view's 0.3 is for light that knows no walls —
  against renders 13/14 the bake's shaded façades match, the live view's
  are too dark), at dusk the live outdoor share over the share of the
  dusk's light above the horizon (`findSun`'s `above`: 0.179), no moon.
  The log shows `[bake] sky <hdr> turned 19°, strength 1, 982 sun pixels
  clipped`. Check it: the baked view's sun (`sun.position −
  sun.target.position`) equals the live one's ((0.780, 0.588, 0.213) for
  Ladonia). Spaces without `landscape.sky` bake as before.

## When a bake fails, or bakes wrong

- A bake that fails inside Blender: Blender exits 0 after a Python error
  unless it runs with `--python-exit-code 1` (scripts/bake-public.mjs now
  passes it), so the error used to surface later as "ENOENT … bake.json",
  with a `bake-<stamp>/` folder holding only `settings.json` left behind
  (the script now deletes a stopped bake's folder, unless `--debug`). Read
  the Blender traceback in the log, not the last line. Reproduce on a copy:
  copy `published/<id>/manifest.json` and the version folder (without its
  `bake-*` folders) to `<scratch>/pub/<id>/`, then `PUBLISH_DIR=<scratch>/pub
  node scripts/bake-public.mjs <id> --samples 16 --size 1024 > log 2>&1`
  (~25 min for Ladonia to reach the samples; ~1 h 55 min to the end on
  2026-10-04 — nearly all of it handing the 1.5 M-face scene to Cycles,
  some 1,400 times then: [bake-time.md](bake-time.md)). To work on
  the unwrap or the packing alone: `BAKE_CHECKPOINT_UNWRAP=<file.blend>`
  (with `BAKE_STOP=1` to stop there) saves the scene before the unwrap,
  `BAKE_CHECKPOINT=<file.blend>` before the packing, and `bake-replay.py`
  (this folder; its header has the commands) reruns them on it with
  bake_public.py as it is now — minutes, not 25.
- The lightmap unwrap is angle-based (2026-10-04): Blender's
  minimum-stretch unwrap failed islands on Ladonia and varied from run to
  run on the same input — 94% of the surface at an even texel density in
  three runs, 15% in the fourth, a bedroom floor with no lightmap — where
  angle-based gives 100% every time, in half the time.
- The atlas is one lightmap for the whole site, cut into a rectangle per
  room (`pack_zones`). Ladonia's first bakes failed there: 22 thousand
  islands (three buildings' furniture) with 8-texel margins needed about
  twice the 4096² atlas, every room's rectangle came out smaller than its
  trial pack assumed, and Blender's packer shrank a dozen rooms' islands to
  nothing (then a division by zero). `pack_zones` now sizes each room from
  its islands' boxes and margins at the one scale at which all of them fit,
  narrows the margins to as little as half when the islands would otherwise
  cover under `MIN_SURFACE` (a quarter) of the atlas — Ladonia: 8 → 4
  texels, 5.6 cm texels, 30% filled; a single house keeps 8 — and logs
  `zone short of texels` for any room still packed under half the usual
  density. Read the `[bake]   atlas …` and `house texels` lines of every
  bake: zones within ~50% of each other and texels of a few cm are healthy.
  `--margin 4` (`npm run bake -- <id> --margin 4`) asks for narrower
  margins outright; `lighting.margin` says what a bake ended with. Tried
  on Wrenfield (128 samples at 4096 against the same code at
  8): texels 2.8 → 2.3 cm, the atlas 32% → 46% filled, each room's
  rectangle — and so its switches' layers, their bytes and GPU memory —
  the same size, 10% longer to bake; no light of the next island seen at
  an edge from 30 m above, from the street, down a room's length, by day
  or at night, at 4096 or in the phone's copy (2 texels round an island).
  Not made the default: a pixel must cover 9–18 cm of surface before the
  neighbour's light can blend in at 4, 18–37 cm at 8 — far, or at a very
  low angle along a wall — and only those views were looked at.
- The bake's set-up had three Python loops over every face or vertex
  (`bounds`, `texel_size`, `stretch_report`), now numpy: Wrenfield's
  unwrap-and-pack 17 s → 2; on Ladonia `texel_size` alone was 3.6 min.
- `BAKE_CUT=zones,edges,covered,lids,sun,vertices,switches`
  (bake_public.py, with `--variants night --no-switches --no-doors`):
  parts of a bake left out,
  to try one thing on a big site in minutes — never a bake to keep; and
  `BAKE_BOX=x0,z0,x1,z1` (the app's x and z): only that part of the site.
  A view of a bake with no day variant opens unlit by day: go to night.
- Known bake faults and their causes: dark corners and lines from faces
  running on inside the next wall; seams from T-junctions and slivers (weld,
  split, BEAUTY-triangulate, delete < 1e-7 m²); light leaks through
  two-sided surfaces (bake the copies 3 mm apart); smudges from wrong
  denoiser guides; a hot halo from fittings close to the ceiling raising a
  switch's lightmap scale (read `scale` in the manifest). A room's material
  mixes at most 6 switch layers — 5 in "baked" mode on a 16-unit GPU — in
  the per-room path only (`?lightmap=rooms`); resolved, any number
  ([../baked-view-lighting/resolved-lightmap.md](../baked-view-lighting/resolved-lightmap.md)).

## Baking again, and comparing two bakes

- **What baking a version again changes.** The view's side of this work —
  the modes, the resolved lightmap, the merged house, the meter, the
  guard, the live room — applies to an old bake as it is (the live room
  with one fault of the old zoning: a doorway's reveals zoned to the room
  behind them stay baked beside a room drawn live — Wrenfield's). The bake's
  side shows only in a version baked with this code: each room's part of
  the lightmap held its own way and the spill layers' own copies (no
  tinted rectangles on walls and ceilings by day); narrow strips lit
  through their vertices (no black casings, skirting tops or pickets);
  faces given to the room they are seen from (no black doorway bands, wall
  wedges or linings); the garden's lights in the night; light probes
  wherever a lamp reaches (no black drawers in a room without daylight);
  the manifest's `margin`, and `only` for a version published "Fully
  baked". For a visitor it is 0.5 MB more to fetch for day and night
  together on Wrenfield (8.79 → 9.30 MB), no more GPU memory, and the
  same frame times (within 0.5 ms at 14 views). It replaces the version's
  bake folder — every file's name changes — and, the faces being cut
  otherwise, every room's rectangle moves: two such bakes are not compared
  texel for texel ("Two bakes", below). **Of the user's published bakes, Ladonia's
  is of this code** — they published and baked it afresh on 2026-10-12
  (20261012T114849Z: its manifest has `margin`, each variant's `rooms` and
  the night's `garden`, 16) — **and Wrenfield's is not**
  (20261001T143211Z): half an hour to publish and bake, and theirs to ask
  for. Since 2026-10-17 Ladonia's latest is 20261017T173248Z, published and
  baked at the user's ask that day ([SKILL.md](SKILL.md), step 5; its
  manifest read on 2026-10-18: 512 samples at 4096, margin 4, 93
  switches, the night's `garden` 16). Read `published/<id>/manifest.json`
  before saying which bake a link draws.
- **Two bakes.** Two runs of one code and seed already differ by a level in
  a few texels in a hundred ([bake-time.md](bake-time.md): compare by what
  another seed changes, `BAKE_SEED=1`). Once the faces are cut differently
  no texel is where it was: compare the light at the probes, the same grid
  in both — each room's daylight, each switch's light in its rooms — and
  face by face (the triangles with the same three corners in both, each
  read from its own bake's lightmap at several points), then frames of the
  same poses. `node scripts/test-light-regions.mjs` holds the view's and
  the bake's idea of each room's texels together.

## Furniture with parts that open

- **Furniture with parts that open, in the bake.** The parts are never
  baked (`SceneBuilder.staticOptions` leaves them out of the snapshot):
  they are drawn live, lit by the probes, and merged while shut
  (ShutBatcher). The piece's body is baked as it is seen with its doors
  open, so a cupboard's inside is lit by the bake and, shut, its door
  hides it. New opening pieces reach a public view only after a publish
  and a bake (a draft about an hour on Ladonia, the final about two).
  Not measured yet, to look at on the first bake after a piece is
  hollowed: whether a pair's middle joint shows a light hairline where
  the solid block showed dark, and what the hollow interiors add to the
  unwrap, the atlas and the vertex-lit faces (Ladonia's drafts with them:
  15,068–15,103 islands, the atlas 30% filled).

## Blender, as the bake scripts use it

From [../build-property-space/blender.md](../build-property-space/blender.md),
which holds the rest:

- Blender isn't on PATH on this Mac:
  `/Applications/Blender.app/Contents/MacOS/Blender --background --python …`
  (the npm scripts find it themselves, `scripts/lib/blender.mjs`; `BLENDER`
  gives its path if not found).
- 5.1 API: the compositor is `scene.compositing_node_group`; Denoise
  options are input sockets; `pack_islands` needs
  `tool_settings.use_uv_select_sync = True`; export with
  `export_vertex_color="NONE"`, `export_all_vertex_colors=False`; GLTFLoader
  lowercases custom attributes. Blender (x, y, z) is the app's (x, z, −y).
- Long Blender jobs: `run_in_background` (foreground is cut at 600 s); wait
  with `until grep -qE 'Baked in|Traceback' log; do sleep 2; done` in a
  background command, or Monitor (CLAUDE.md, Shell and tools on this Mac).
- **The bake's view.glb has lost the editor's `cast`/`receive`**
  (bake_public.py deletes them on export): the live room reads them from
  the JSON chunk of the version's unbaked `<version>/view.glb` by two Range
  requests (0.84 MB for Ladonia). A new bake should keep them
  ([../baked-view-lighting/live-room.md](../baked-view-lighting/live-room.md)).

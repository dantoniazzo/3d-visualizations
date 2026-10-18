---
name: publish-and-bake
description: "Publish a space's public view and bake its lighting in Blender, safely: publish options and the manifest, the snapshot's culling and viewpoints, scratch publishes and draft bakes, the final bake, checking a bake, publishing for the user without touching their server or scene. Use when the user asks to publish, bake or re-bake, or when a published version or its bake is wrong."
---

# Publish and bake

A publish turns the scene being edited into a version a visitor opens at
`/view/<id>`: the snapshot culled to what its sampled viewpoints see,
merged and compressed, with a runtime file for what moves and the
published spec. A bake then lights that version in Blender's Cycles and
writes its light beside it.

The bake is what every device draws a published version from — a
computer with what moves still shading the sun and a shut door dimming
its rooms ("baked"), a phone and the slider's two lowest steps with
nothing live ("static") — and what gives the interiors their real light;
a live view is not judged by it. Bake once the space is settled and its
unbaked publish checked
([../build-property-space/verifying.md](../build-property-space/verifying.md),
verify like a photographer). Details, numbers and causes:
[baking.md](baking.md), [bake-light-files.md](bake-light-files.md),
[bake-time.md](bake-time.md); how a baked view is drawn and exposed:
[../baked-view-lighting/SKILL.md](../baked-view-lighting/SKILL.md).

The user's standing terms are in the project's `CLAUDE.md` and are not
repeated here; the one this skill lives under: never write the repo's
`published/` — a test server may read it, but publish and bake into a
scratch `PUBLISH_DIR` unless the user asks for theirs.

## When to read what

- Before any publish or bake: the rules below.
- Before publishing a new feature, or saying what a link opens:
  [publishing.md](publishing.md) (the latest, what each subsystem needs
  published, scratch publishes, what an unbaked version carries).
- Before a draft or a final bake: the steps below, then
  [baking.md](baking.md) (commands, times, what the bake takes from the
  site, failures) and [bake-options.md](bake-options.md).
- When a bake is slow, or the log's hand-over count is off:
  [bake-time.md](bake-time.md).
- When a bake's light looks wrong — tinted blocks, black casings, black
  doorway bands, a room's lamp missing on a wall, black drawers — or
  before touching `lightzones.py`, `shared/lightRegions.js` or the
  switches' layers: [bake-light-files.md](bake-light-files.md).
- When a public view shows holes from above or from out by the road, or
  before touching `Publish/viewpoints.js` or the culling:
  [culling-and-viewpoints.md](culling-and-viewpoints.md).
- For what a version holds: [manifest.md](manifest.md),
  [publish-options.md](publish-options.md).
- Briefing a lane that publishes: [scratch-publish.md](scratch-publish.md).
- For what was done before and what is still short: [history.md](history.md).

## Rules

- **Never publish or bake against the user's `published/`** unless they
  asked for their own: **a bake rewrites a published version in place**
  and deletes that version's earlier `bake-*` folders
  (`scripts/bake-public.mjs`). Test against a scratch `PUBLISH_DIR`.
- **Print the resolved `PUBLISH_DIR`** (`server/publish/store.js`) before
  a first bake and stop if it is not the folder meant.
- **Publish only from a tab of the scratch publish server.** harness.js
  lets `/publish`, `/versions/<v>/runtime` and `/bake` through by the path
  alone, on whatever server the tab is of — it looks at no port — so a
  publish clicked in a harnessed tab of a server whose `PUBLISH_DIR` is
  the repo's `published/` is a real one
  ([../app-testing-and-performance/browser-pane.md](../app-testing-and-performance/browser-pane.md)).
  When the user asks for their own publish, it goes from a tab of a server
  of your own (step 5) — never from the user's :3000 or a tab of it.
- **One bake at a time** (`.bake-lock`: Blender takes the whole GPU). Say
  when Blender starts and stops; take no timings meanwhile — the same
  frames time twice as slow while Chrome or Blender is busy.
- **Run a bake detached with nohup and poll its log** — a background
  shell stops at 2 h, a foreground command at 10 min. Wait with `until
  grep -qE 'Baked in|Traceback' log; do sleep 2; done` in a background
  command, or Monitor (`CLAUDE.md`, Shell and tools on this Mac).
- **The final bake only when the user asked for it**; ask before starting
  one (Ladonia about two hours). A draft is for levels and placement, on
  a copy.
- **"The latest" is whatever was published last, baked or not**: a
  publish with its bake off becomes what `/view/<id>` opens, over an
  earlier baked version. Read `published/<id>/manifest.json` before
  saying which version a link opens.
- Lights, switches and garden settings are gathered at publish: after
  changing them, re-publish and re-bake (`npm run build` alone changes
  nothing baked). A version baked before a fix to the bake shows the old
  fault until it is baked again (step 7).
- Never let a publishing tab save the user's scene: a test server over a
  copy of `scenes/` (`SCENES_DIR`), and backups before writing any scene
  ([../build-property-space/scene-safety.md](../build-property-space/scene-safety.md)).
- Don't `SendMessage` a subagent that is still working: it can resume a
  second copy of itself, and the two drive the same tab (2026-10-05: a
  duplicate publish, a reload mid-publish and a bake neither copy
  remembered starting).
- After a usage-limit break: resume stopped bakes — delete a stopped
  bake's half-written `bake-<stamp>/` folder; `.bake-lock` clears itself
  once its pid is dead
  ([../app-testing-and-performance/test-servers.md](../app-testing-and-performance/test-servers.md),
  after a break).

## Publishing: a test publish, a copy to bake

- Test publishing against a scratch `PUBLISH_DIR`. To look at the user's
  own published bake, start another test server with `PUBLISH_DIR` at the
  repo's `published/` and `BAKE=off`, and only open `/view/<id>` on it —
  never publish from it, and never bake against it: **a bake rewrites a
  published version in place** and deletes that version's earlier `bake-*`
  folders (`scripts/bake-public.mjs`). In a test tab (non-GET requests
  stubbed except /publish, /runtime and /bake:
  [harness.js](../app-testing-and-performance/harness.js)):
  `experience.world.emit("publish")`, click `[data-publish]`, poll
  `[data-result]` (~16 s; poll the folder from bash if the 45 s call times
  out). Version folders must be timestamps (`20260926T120555Z`). A copy to
  bake: `published/<id>/manifest.json` and the version folder (without its
  `bake-*` folders) under `<scratch>/pub/<id>/`.
- The test server: the `house-test` entry of `.claude/launch.json` (port
  3108, `PUBLISH_DIR`, `BAKE=off`, `SCENES_DIR`), set up as
  [../app-testing-and-performance/test-servers.md](../app-testing-and-performance/test-servers.md)
  says. A server that cannot bake (`BAKE=off`) publishes with the bake off
  whatever the option says; a draft from the terminal then marks
  `options.bake` "draft", and the same version id draws baked.
- Reload the test tab after any patch of the server's scene copy (an open
  tab's next save writes the old spec back), and before publishing check
  in it the new spec fields and meshes and every piece loaded (Ladonia: 630
  of 630, 475 parts, 59 sashes). Read the scratch `manifest.json`'s latest
  before and after, and check the repo's `published/` untouched
  ([publishing.md](publishing.md), how the scratch publishes were made and
  checked).
- A hidden pane has no requestAnimationFrame: Publish stalls at "Checking
  for holes" until the tab is fronted (`tabs_select` + a screenshot), or
  drive its frames with [drive.js](../app-testing-and-performance/drive.js)
  (a Ladonia publish took ~8 min driven).
- What each subsystem needs published (people, opening parts, sashes,
  water, the pool's steps, light targets) and what needs nothing (seats,
  televisions, the pool water's look): [publishing.md](publishing.md),
  "What else a publish carries".

## Bake, and check the bake

1. **Before**: a site with its own sky is baked under it (`landscape.sky`;
   its `day`/`dusk` names plain, the HDRs in `public/textures/sky/`, or it
   falls back to the preset and says so). Spaces without one bake under
   their preset. A room daylight does not reach bakes black by day and
   starts the day with its ceiling light on, told from the spec: list
   them (`darkRooms(spec)` of `shared/daylight.js`, in node — Ladonia 20,
   Wrenfield 4) and see they are the rooms you expect; a window left out
   of a wall makes a room one of them (how the view lights them:
   [../baked-view-lighting/light-meter.md](../baked-view-lighting/light-meter.md)).
   Before a final bake of a `spec.landscape` site, see that the bake has
   what it takes from the site — its walls, planters and terrain in
   `solids` and `coarseMaterials`, its trees for shade
   ([baking.md](baking.md), "What the bake takes from the site").
2. **Draft on a copy**, never on the user's `published/`: a bake rewrites
   its version in place and deletes that version's earlier bake. Copy
   `published/<id>/manifest.json` and the version folder (without its
   `bake-*`) to `<scratch>/pub/<id>/`, print the folder the store resolves
   (`PUBLISH_DIR`, server/publish/store.js) and stop if it is not the
   copy, then run detached and poll — `(PUBLISH_DIR=<scratch>/pub nohup
   node scripts/bake-public.mjs <id> --samples 16 --size 1024 >
   <scratch>/draft.log 2>&1 &)`. It bakes the version that `manifest.json`
   names, the latest published: for any other folder you copied — the
   earlier, baked version, where the latest is an unbaked one, as
   Wrenfield's is — add `--version <v>`, or it stops on a file it does not
   find. One bake at a time. A house's draft is minutes (Wrenfield: 7 at
   128 samples and 2048); Ladonia's, with its 475 opening parts and 59
   sashes, 61–68 min at 128 samples and 2048 (`PUBLISH_DIR=<scratch>/pub
   node scripts/bake-public.mjs <id> --samples 128 --size 2048`,
   detached; its earlier drafts, hand-overs and sizes:
   [baking.md](baking.md), "Ladonia's drafts and finals"). Blender holds
   the GPU the whole time: take no timings meanwhile. To try one thing on
   a big site in minutes, bake part of it (`--variants night --no-switches
   --no-doors`, `BAKE_CUT`, `BAKE_BOX`: never a bake to keep).
3. **Read the log's health lines**: `unwrapped … 100.0% … even texel
   density` (Ladonia's draft: 8.3 s); `margins narrowed` (fine); `atlas N%
   filled; zones' texels per metre within …` ≤ ~50% (Ladonia's draft:
   30% filled, within 24–33%); no `zone short of texels`; `house texels` a
   few cm at 4096 (Ladonia 5.5; 10.3 at a draft's 2048); `sky <hdr> turned
   <turn>°, strength 1, N sun pixels clipped` for a site sky; `the scene
   was handed to Cycles N times` (Wrenfield 148: far more than its passes
   means something is baked an object at a time again); `Baked in …`. Any
   Python traceback stops the bake (`--python-exit-code`): read the
   Blender traceback in the log, not the last line ([baking.md](baking.md),
   "When a bake fails").
4. **Look at the draft** on a test server whose `PUBLISH_DIR` is the copy.
   Run [bake-check.js](../app-testing-and-performance/bake-check.js)
   (Tools, below) and read its `sun`, `black`, `drawn`, `zones` and
   `cannot`; the same by hand, in the page, where it says it cannot read
   something: the sun drawn against the bake's (`sun.position −
   sun.target.position` of `world.environment.sun`, and
   `experience.published.lighting.variants.day.sun.position`, both made
   unit: the same, and the site sky's); each room's daylight from the
   probes, in "baked" mode once `world.probes` is there
   (`experience.renderer.realism.meter.roomDaylight(world.probes, room)`
   over `world.spec.rooms`: step 1's rooms should be among the lowest —
   Wrenfield's four read 0.00006–0.0015 where its other rooms read
   0.008–0.08; Ladonia's twenty 0.00001–0.011, its guest WCs at the top
   of that, the probes being measured with every door open; the meter:
   [../baked-view-lighting/light-meter.md](../baked-view-lighting/light-meter.md));
   black where it should not be — frames room by room, by day with the
   lights off and at night with them on, at the doorways (linings,
   thresholds), the casings and skirtings, and from above (the wall tops
   are dark there, as a cut wall is on a plan). Then render the views
   (`__renderSet`, [ladonia-views.js](../app-testing-and-performance/ladonia-views.js)
   copied as `<project>-views.js`) and
   [compare.mjs](../app-testing-and-performance/compare.mjs) render |
   unbaked | baked. Healthy: interiors' mean luminance within ~15 % of the
   unbaked view's by day — the meter brings each room there, ×3 in a
   glazed room to ×32 in a dim bedroom — exteriors as the renders. A draft
   is blotchy and its small pieces bleed: judge light levels and
   directions, not grain.
5. **Final**: `npm run bake -- <id>` bakes the user's latest published
   version in place (only when they asked for the bake) — detached with
   nohup, polled; a background shell is stopped after 2 h. A house is 28
   min at 512 samples, 4096, with 2048 copies for phones (Wrenfield; 20
   min published "Fully baked", which bakes for that mode alone). Ladonia
   took 3 h 22 min on 2026-10-04; the user's own bake of it on 2026-10-12
   took 1 h 52 min, by its folder's stamp and its `bakedAt`
   ([baking.md](baking.md), "Times"): ask before starting it. Asked to
   "publish and bake" it (2026-10-17), publish from a server of your own,
   never the user's :3000: from the repo, `PORT=<free> BAKE=off
   SCENES_DIR=<scratch copy of scenes/> node server/index.js` (a
   launch.json entry, restored after:
   [../app-testing-and-performance/test-servers.md](../app-testing-and-performance/test-servers.md)),
   so `dist/` and `published/` are the repo's but no editor tab can save
   over the user's scene; check every piece, part and sash has loaded;
   Publish with the latest version's options from its manifest (Bake
   "Off" there, as that server cannot bake); wait for `runtime.glb` beside
   the view; close the tab (Blender wants the GPU); then `npm run bake --
   <id>` in the background, logged to the session's folder. Ladonia with
   its 475 opening parts and 59 sashes: published in 144 s (1,605,627
   triangles, 1,147 meshes, view 7.5 MB, runtime 6.7 MB), baked in 6,940 s
   (1 h 56 min; view 33.4 MB, lightmaps 1.1 + 1.0 MB, `options.bake`
   "final"; version 20261017T173248Z). `/view/<id>` draws the baked light
   once it ends — **if that version is still the latest**: a later
   publish without a bake is what the plain link opens.
6. **Check the published view** in every way a visitor meets it, saying
   of each frame which it is: as it opens on this Mac (step 4, "baked" —
   the bake's light, what moves shading the sun, the meter reading the
   frame under a site's sky and the probes without one); `?quality=0`
   ("static" — nothing live, no probes, one exposure for every room: what
   a phone is given; `?rated=1` shows the rest of what a device rated low
   gets); from above (**B**: always the bake's); at night (**N**); with a
   door shut and a light switched; with **K**, the rooms round the visitor
   in their own materials, the editor's, lit by the bake's own light
   (`World/RoomBakeLight.js`, since 2026-10-15): the sun and the nearest
   lamps live with their shadows; the sky through the windows, every
   bounce and the lamps not drawn live the bake's. Judge them against the
   baked frame of the same pose, not against the editor (the user's rule
   of 2026-10-15:
   [../baked-view-lighting/SKILL.md](../baked-view-lighting/SKILL.md)):
   the room's own pixels within a few levels of it in mean, warmth and
   shade, and dark at night with its lamps off. Check:
   - the room stood in, and the rooms seen through its open doors;
   - a door opened onto the next and walked through: nothing in view
     should change but at the first press;
   - in from the garden;
   - a lamp turned off and on standing under it: every frame of the fade
     further than the last, the exposure the bake's;
   - a room with a sheer curtain;
   - K off again: the bake's, to the pixel.

   A bake without its light apart (an older one, a "static" one),
   `?lightmap=rooms` or `?merge=off` draws K's rooms as the unbaked view
   does (`RoomBakeLight.usable`). `?lighting=live` draws the old whole
   house lit live, to compare (the link's words:
   [../baked-view-lighting/links-and-handles.md](../baked-view-lighting/links-and-handles.md)).
   Then tell the user what is still short ([history.md](history.md), and
   the history of the skill whose part it is).
7. **Baking again** changes what the bake holds, not how the view draws
   it: a version baked before a fix to the bake shows the old fault until
   it is baked again ([baking.md](baking.md), "What baking a version again
   changes": Ladonia's published bake is the user's own — of 2026-10-12,
   with the fixes of that date, and since 2026-10-17 20261017T173248Z;
   Wrenfield's is still 2026-10-01's). Two bakes are compared at the light
   probes and face by face, not texel for texel ([baking.md](baking.md),
   "Two bakes"; how frames are measured:
   [../app-testing-and-performance/measuring.md](../app-testing-and-performance/measuring.md)).

## Pitfalls that matter

- **Why 512 samples at 4096 stays the final** (sixteen variants of
  Wrenfield, 2026-10-10): 128 leaves mottle indoors by day, 2048
  samples buy little for four times the sampling, a 2048 atlas loses
  strips, sun-patch edges and contact shade; out of doors 32 samples would
  do. A draft (128 at 2048) is for levels and placement only.
- **One 8-bit scale for a whole lightmap is the sunlit garden's**: a room
  lit through its windows is left fourteen to twenty of the 255 levels,
  and lossy compression then shows as tinted blocks at the room's
  exposure — which more samples do not mend. Hold each room's part by a
  curve of its own ([bake-light-files.md](bake-light-files.md); how the
  view decodes it:
  [../baked-view-lighting/resolved-lightmap.md](../baked-view-lighting/resolved-lightmap.md)).
  A switch's layer in a room it only spills into is held the same way.
- **A face zoned to the wrong room gets none of its room's lamp**, and
  the view cannot draw it better: faces are cut at rooms and walls and
  given to the room they are seen from; narrow strips under three texels
  are lit through their vertices
  ([bake-light-files.md](bake-light-files.md)). Face zoning does not cut
  at floors and ceilings.
- **A list stored as "the pieces kept"** (the publish options a browser
  remembers, a manifest's) leaves out every piece added later: store the
  pieces known beside it (`sceneryKnown`). A publish once silently
  dropped every person this way.
- **A bake's time is its hand-overs to Cycles**: each object baked is a
  new Cycles session. Switches stay one to a pass — lit together, their
  light changes beyond its grain; doors are batched only across parts of
  the site no opening joins ([bake-time.md](bake-time.md)).
- **Not bit for bit**: two runs of one code and seed differ by a level in
  a few texels in a hundred. Compare two bakes by what another seed
  changes (`BAKE_SEED=1`), and once the faces are cut differently at the
  probes and face by face ([baking.md](baking.md), "Two bakes").
- Blender exits 0 after a Python error unless it runs with
  `--python-exit-code 1` (the script passes it); the error used to surface
  later as "ENOENT … bake.json". Reproduce a failing bake on a copy;
  `BAKE_CHECKPOINT` and [bake-replay.py](bake-replay.py) rerun the unwrap
  and the packing in minutes ([baking.md](baking.md)).
- A surface hidden under other geometry bakes black and bleeds: cut it
  out rather than leaving it underneath. Big outdoor geometry steals
  lightmap texels: compare `[bake] house texels` before and after adding
  a landscape to `solids` and `coarseMaterials`.
- A landscape's own trees (World/Flora) are in no lightmap unless added to
  `scripts/bake-public.mjs`'s settings: the bake's tree shade is the
  Fluffy Tree garden's alone.
- Opening parts are never baked: the piece's body is baked open, and new
  opening pieces reach a public view only after a publish and a bake.
- The bake's `view.glb` has lost the editor's `cast`/`receive`
  (bake_public.py deletes them on export; the view reads them from the
  unbaked `view.glb`): a new bake should keep them.
- `findPublished` (`frontend/index.js`) serves only lighting files ending
  `.webp/.png/.jpe?g/.ktx2/.bin`: a new file type must be added there, or
  it fetches index.html ("read past end").
- A bake made "Fully baked" (`lighting.only: "static"`) has nothing else
  to draw from: the view draws it static whatever the link asks.

## Reference files

- [publishing.md](publishing.md) — what a link opens, what each wave and
  subsystem needs published, scratch publishes made and checked, the
  culling's `keepWhole`, a version published unbaked, `findPublished`,
  and what else a publish carries for the other skills.
- [culling-and-viewpoints.md](culling-and-viewpoints.md) — the publish's
  viewpoints from out where a car takes the view (`driveViewpoints`), the
  check of a version from out there (`holes.js`, `count-views.mjs`).
- [baking.md](baking.md) — commands, times, drafts and what each setting
  is good for, what the bake takes from the site, "Fully baked" and the
  site's sky, failures and known faults, baking again, two bakes compared,
  furniture that opens, Blender as the bake uses it.
- [bake-light-files.md](bake-light-files.md) — each variant's lightmap
  written twice (per-room curves), the switches' own layers, narrow strips
  through vertices, the garden's lights in the night, faces given to the
  room they are seen from, light probes.
- [bake-time.md](bake-time.md) — hand-overs to Cycles: probes as one, door
  batches, switches one to a pass and why, `spread`, the ceilings' tops,
  not bit for bit, the timings, the developer's switches.
- [publish-options.md](publish-options.md) — the Publish panel's options
  and the one preset.
- [bake-options.md](bake-options.md) — `npm run bake`'s words, the
  environment, the developer's `BAKE_…` switches.
- [manifest.md](manifest.md) — a baked version's manifest and its
  `lighting` fields.
- [scratch-publish.md](scratch-publish.md) — brief (n), the lane that
  publishes a scratch version.
- [history.md](history.md) — this skill's dated entries and superseded
  measurements, newest first.

## Tools

In this folder:

- [bake-replay.py](bake-replay.py) — reruns the bake's unwrap and atlas
  packing (`pack_zones`) on a `BAKE_CHECKPOINT` scene in a minute, with
  bake_public.py as it is now; its header has the commands
  ([baking.md](baking.md), "A bake that fails inside Blender").
- [count-views.mjs](count-views.mjs) — `node
  .claude/skills/publish-and-bake/count-views.mjs [--dir <publish-dir>]
  [--dump out.json] <id>...`: a published version's bird's-eye samples,
  the drive ones included (read-only; it finds the repo three folders up,
  so it runs from anywhere).

In [../app-testing-and-performance/](../app-testing-and-performance/SKILL.md)
(loaded in a page through the sink after `boot.js` or `harness.js`:
[tools.md](../app-testing-and-performance/tools.md)):

- [bake-check.js](../app-testing-and-performance/bake-check.js) — in-page,
  in a baked `/view/<id>` after harness.js and the views file:
  `__bakeCheck({ poses: [...] })` gives the sun drawn vs baked vs the site
  sky's (degrees apart); `black`, each room's part of each lightmapped
  mesh that baked black, read from the bake's own one-scale lightmap file
  (no switch on, every door open); `drawn`, the same scan of what the view
  draws now, read from the resolved lightmap (switches as they are, doors
  as they stand — null where the light is not resolved); each room's
  daylight from the bake's probes; the light meter's exposure per pose;
  and `cannot`, a plain list of whatever it could not read. Rewritten
  2026-10-12 for the resolved lightmap (the older one drew
  `material.lightMap.image` to a canvas, which is no longer a picture);
  run by day on Wrenfield's two bakes only so far.
- [compare.mjs](../app-testing-and-performance/compare.mjs) — `node
  .claude/skills/app-testing-and-performance/compare.mjs <out.jpg> "<path
  with {k}>" … -- <keys…>`: one row per view, one column per source
  (render | live | baked), each tile labelled with its mean luminance, the
  table printed as JSON. Missing frames show red.
- [holes.js](../app-testing-and-performance/holes.js) —
  `__holes.look/sweep/shot/seenBy`: culled faces the bird's-eye camera
  would see, in a public view; run it after any change to culling or
  viewpoints ([culling-and-viewpoints.md](culling-and-viewpoints.md)).
- [ladonia-views.js](../app-testing-and-performance/ladonia-views.js) —
  `__POSES`, `__renderSet(prefix)`: the poses rendered for step 4.
- [harness.js](../app-testing-and-performance/harness.js),
  [boot.js](../app-testing-and-performance/boot.js) — stub every non-GET
  request but `/publish`, `/runtime` and `/bake`;
  [drive.js](../app-testing-and-performance/drive.js) drives a hidden
  tab's frames through a publish.

Node tests that hold this skill's code (counts and the rest of the suite:
[../app-testing-and-performance/node-tests.md](../app-testing-and-performance/node-tests.md)):
`node scripts/test-bake-batches.mjs` (the bake's passes: 40 made-up
sites) and `node scripts/test-light-regions.mjs` (needs `python3`; the
rooms' texels as the bake and the view each work them out, over every
published bake and made-up atlases: 55, none differing) — both passed on
2026-10-12, 2026-10-14 and 2026-10-16. Run the second after touching
`shared/lightRegions.js` or `lightzones.regions`.

## Older names

Older notes and log entries cite the old files' sections. Before
2026-10-12 "Publishing, the public view and baking" in `app-notes.md`
meant the seven sections from "Publishing" to "Measuring"; now:

- `app-notes.md` "Publishing and the public view" → [publishing.md](publishing.md)
  (and the rules and test publish here);
- "Baking" → [baking.md](baking.md), [bake-light-files.md](bake-light-files.md),
  [bake-time.md](bake-time.md);
- "The bird's-eye view", Driving from above, sampled at publish →
  [culling-and-viewpoints.md](culling-and-viewpoints.md);
- "Measuring", Two bakes → [baking.md](baking.md);
- `reference.md` "Publish options", "The bake's options", "A baked
  version's manifest" → [publish-options.md](publish-options.md),
  [bake-options.md](bake-options.md), [manifest.md](manifest.md);
- `briefs.md` (n) → [scratch-publish.md](scratch-publish.md);
- the old `build-property-space/SKILL.md` §10b → this file's steps, and
  its §13 pitfalls on a list of "the pieces kept" and one 8-bit scale →
  this file's pitfalls;
- "What a visitor is given", "How a baked view is drawn", "Exposure in a
  baked view", "Live room light" →
  [../baked-view-lighting/SKILL.md](../baked-view-lighting/SKILL.md).

# What a test tab can use: a link's words, stored keys, page handles

## The view: links, stored keys, the walkthrough's keys, the slider's steps, publish options, the bake's options and the manifest

This was one section of the old `reference.md`; it is now split by
subsystem, and this heading is kept as the index of where each part went.
Its provenance, for the whole of it:

The same for every space, as the code stood on 2026-10-12 (`frontend/Experience/Utils/device.js`, `frontend/index.js`, `World/World.js`, `World/Scope.js`, `shared/publishOptions.js`, `scripts/bake-public.mjs`, `blender/bake_public.py`) — the editor's three words of 2026-10-13, the live room's and "What a test tab can ask the page" read again on 2026-10-14 (`World/StandIns.js`, `Pace.js`, `Editor/Editor.js`, `World/RoomLight.js`, `Utils/rays.js`, `World/Collision.js`), and the colliders' words, the walkthrough's keys and the interaction, room and colliders handles added on 2026-10-16 (`Experience/Colliders.js`, `World/ColliderView.js`, `shared/interact.js`, `World/Interactables.js`, `World/Whereabouts.js`, `World/BirdView.js`, `World/Player/Player.js`); the handles under the stand-ins' hold and the view's (`World/StandIns.js`, `World/PlainLight.js`, `World/ProbeLight.js`, `World/SceneBuilder.js`), the providers, the view from above and the camera's water read again against the code on 2026-10-17. What each thing does, and why, was `app-notes.md` and is now the topic files of the skill that owns it.

Each file that took a part carries the line of that provenance that covers
its own part. Where each part is now:

- **A link's words** — one table, split in two:
  - the editor's words (`?scene`, `?preview`, `?scope`, `?standins`,
    `?shut`, `?still`, `?frames`, `?outline`):
    `../walkthrough-editor/links-and-handles.md`;
  - the public view's (`?version`, `?live`, `?lighting`, `?quality`,
    `?uncapped`, `?rated`, `?guard`, `?stats`, and the developer's
    `?lightmap`, `?merge`, `?roomlight`, `?night`):
    `../baked-view-lighting/links-and-handles.md` (`?version` and `?live`
    with a pointer from `../publish-and-bake/SKILL.md`);
  - the colliders' (`?debug`, `?colliders`, `?colliders=xray`): with the
    colliders view, `../walkthrough-editor/colliders-view.md` and
    `../walkthrough-editor/links-and-handles.md`.
- **What a browser keeps** — here, below (the tester's rule is "remove
  what a test set").
- **The walkthrough's keys** (`shared/interact.js` `KEYS`):
  `../visitor-interactions/picker-and-keys.md`.
- **The slider's steps** (`QUALITY`): `../baked-view-lighting/quality-steps.md`.
- **The publish options, the bake's options and a baked version's
  manifest**: `../publish-and-bake/publish-options.md`,
  `../publish-and-bake/bake-options.md` and `../publish-and-bake/manifest.md`.
- **What a test tab can ask the page** — the handles, split by subsystem
  (below).

## The words a test tab opens with

A word with no `=` is read by its presence alone; none of them keeps
anything in the browser. What each does, in full, is in the two link
tables above. The ones a test or a timing needs:

- the editor's look and scope: `?preview=1` (the realistic preview on for
  the page), `?scope=house|exterior|all` (`browser-testing.md`);
- the editor's comparisons: `?standins=0` (mesh by mesh, no stand-ins),
  `?shut=0` (parts and sashes drawn one by one; in a public view too),
  `?still=0` (the stand-ins' hold left out), `?outline=pass` (three's
  OutlinePass), `?frames=always` (every frame drawn, for a tool that
  counts on frames);
- a public view: `?version=<v>` (that version, not the latest), `?live`
  (no published version: lit live in the page), `?lighting=baked|static|live`;
- what a device is given: `?quality=0…4|low|high|max`, `?uncapped` (no
  ceiling), `?rated=0…4` (the device rated that low: to see what a weaker
  device is given);
- timing: `?guard=off` on every public link timed (`?guard=report` says
  what the guard does); `?stats` says nothing in a hidden, throttled or
  driven pane (`measuring.md`);
- the colliders: `?debug`, `?colliders`, `?colliders=xray`;
- a developer's, for the bake and the live room: `?lightmap=rooms|one`,
  `?merge=…`, `?roomlight=on|off`, `?night=meter|lift|asis`.

## What a browser keeps

`localStorage` of the page's origin, unless said: a test server on another port has its own. Remove what a test set. The link's words above keep nothing; a control clicked does.

| key | value | written by |
|---|---|---|
| `render-quality` | the slider's step, `0`…`4` | the slider; brought down to the device's ceiling when a page loads; a lost graphics context (`0` in a public view on show, else one under the visitor's step) |
| `view-lighting` | `static`, or absent for "as published" | the public view's menu (*Fastest* / *Auto*); a graphics context lost in a public view on show |
| `view-scenery` | a JSON list of the scenery ids hidden | the public view's menu |
| `view-lost-graphics` | `1` until the next visit has said so | a graphics context lost in a public view on show |
| `editor-preview` | `1` or `0` | **P**, the HUD's and the header's button, the View menu (not `setPreview(…, { remember: false })`) |
| `editor-scope` | `house`, `exterior` or `all` | the *Show* menu (not `scope.set(…, { remember: false })`) |
| `publish-options` | the Publish panel's options, JSON | a publish |
| `editor.trackpad` | `true` or `false` | *View → Trackpad* |
| `view-reloaded-at` (`sessionStorage`) | a time in ms | a public view loading itself again after its graphics came back, at most once a minute a tab |

Nothing of 2026-10-16's is kept: the colliders, the room's lights by Q and driving from above start as they always do at every visit (the one-off hint for driving from above is once a page, in memory).

Which skill each key belongs to: `editor-preview`, `editor-scope` and
`editor.trackpad` are the editor's (`../walkthrough-editor/`);
`render-quality`, `view-lighting`, `view-scenery`, `view-lost-graphics`
and `view-reloaded-at` the public view's (`../baked-view-lighting/`);
`publish-options` a publish's (`../publish-and-bake/`). SKILL.md's
"Clean up after testing" lists them all: keep the two lists in step.

## What a test tab can ask the page

`window.experience` (`e`), its world (`w = e.world`) and builder (`sb = w.sceneBuilder`). Each is what the app itself uses; why, and what to watch for, is in the topic files of the skill that owns it.

The table (`| handle | where | what |`, where being `editor`, `public`,
`public, baked` or `both`) is split by subsystem, each part with that
header repeated:

- **The editor, the rays and the collision** (`w.plain`, `w.setPreview`,
  `w.plainLight.keepOut`, `w.scope`, `w.standIns` — stats, `hear`,
  `settle`, `setEnabled`, `holds`, `drawnScene`, `letGo`,
  `setShutMerged`, `units` —, `w.rays`, `e.pace`, `e.wake`, `e.update`,
  `e.renderer.frames`, `e.renderer.prepareLights` and `.shadowDraws`,
  `sb.refreshCollision`, `sb.settleCollision`, `sb.dynamicKeeper`;
  `e.colliders`, `w.collision.revision`, `w.collision.meets` /
  `meetsAny` / `anyIn`): `../walkthrough-editor/links-and-handles.md`.
  `prepareLights` (shaders built ahead, the programs built in a frame
  counted, shadow programs keyed `depth,` / `distance,`) is what to read
  for a first-use hitch (`speed-architecture.md`).
- **The public view's light** (`w.roomLight`, `w.lightingMode`,
  `sb.resolver`, `sb.merged`, `e.guard`, `w.probes`, `sb.holdStill`,
  `sb.shutBatcher`): `../baked-view-lighting/links-and-handles.md`.
  `holdStill` is part of what a baked view runs every frame
  (`speed-architecture.md`).
- **What the visitor acts on** (`w.interactables`; `P = w.player`'s
  target, look, prompt, act, vehicle; `P.seated`, `P.sit`, `P.stand` and
  the rest of sitting; `w.seats`, `w.screens`, `sb.windows`,
  `sb.openables` and each part's `plan()` / `reach`, `w.water`,
  `P.swimmer`, `P.room` and Q, `w.whereabouts`, `w.switches.inRoom` /
  `setMany`, `w.birdView`, the world's events of 2026-10-16,
  `e.camera.underwater`): `../visitor-interactions/page-handles.md`. The
  tools that drive them (`act.js`, `sit.js`, `seat-sweep.js`, `tv.js`,
  `openables.js`, `water.js`, `pool.js`, `swim-checks.js`) are this
  skill's (`tools.md`).
- **The visitor's figure** (`P.avatar`: `animation.play`, `weights`,
  `fading`, `blend`, `weightOf`, `has`, `playable`, `fit`):
  `../space-people/visitor-clips.md` (with
  `../visitor-interactions/page-handles.md`).

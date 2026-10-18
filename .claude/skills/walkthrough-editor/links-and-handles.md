# The editor's links and handles

The words an editor link takes and the handles a test tab can ask an
editor (and, where it says "both", a public view) for. Moved from
reference.md, "The view": its links table and "What a test tab can ask the
page", the rows that are the editor's. As the code stood on 2026-10-12
(`frontend/index.js`, `World/World.js`, `World/Scope.js`), with the
editor's three words of 2026-10-13 and the handles read again on
2026-10-14 (`World/StandIns.js`, `Pace.js`, `Editor/Editor.js`,
`Utils/rays.js`, `World/Collision.js`), the colliders' words and handles
added on 2026-10-16 (`Experience/Colliders.js`, `World/ColliderView.js`),
and the handles under the stand-ins' hold and the plain light's read again
on 2026-10-17 (`World/StandIns.js`, `World/PlainLight.js`,
`World/SceneBuilder.js`). What each thing does, and why, is this skill's
topic files.

The public view's words (`?version`, `?live`, `?lighting`, `?quality`,
`?uncapped`, `?rated`, `?guard`, `?stats`, `?lightmap`, `?merge`,
`?roomlight`, `?night`) are ../baked-view-lighting/SKILL.md's; the other
handles (the live room, the shut parts, the visitor's interactions, the
people) are in their skills, indexed by
../app-testing-and-performance/test-tabs.md, which also has what a
browser keeps. The editor's own keys there: `editor-preview` (`1` or `0`,
from **P**, the HUD's and the header's button, the View menu — not
`setPreview(…, { remember: false })`), `editor-scope` (`house`,
`exterior` or `all`, from the *Show* menu — not `scope.set(…, { remember:
false })`) and `editor.trackpad` (*View → Trackpad*); remove what a test
set. Edit mode's keys are in the repo's README (Edit mode).

## A link's words

`/?scene=<id>` is the editor (and its walkthrough); `/view/<id>` a public view. A word with no `=` is read by its presence alone.

| word | where | what |
|---|---|---|
| `?scene=<id>` | editor | The space. The app writes it into the address itself. |
| `?preview=1` | editor | The walkthrough's realistic preview on, for this page: sun, shadows, lamps, lit rooms, post-processing, everything shown. `0` or `false`: off. Without it, as the browser last left it (`editor-preview`), off at first. Edit mode is drawn plain whatever it says. |
| `?scope=house\|exterior\|all` | editor | How much is drawn under the plain light, for this page. Without it, as the browser last left it (`editor-scope`), `house` at first. |
| `?standins=0` | editor | The house and the furniture drawn mesh by mesh, as they are built, in place of the merged and instanced stand-ins the plain light draws (`World/StandIns.js`; stand-ins.md): for comparing a frame or a time with and without them. Also `world.standIns.setEnabled(false)` in a page. Nothing is kept in the browser. |
| `?shut=0` | both | A developer's: the furniture's doors and drawers, and the windows' sashes, drawn one by one as before 2026-10-16, for comparing. In the editor, pieces with parts are then not drawn whole and sashes not merged into their walls (`World/StandIns.js`); in a public view, the shut ones are not merged by material (`World/ShutBatcher.js`). Also `world.standIns.setShutMerged(false)` or `sceneBuilder.shutBatcher.setEnabled(false)` in a page. Nothing is kept. |
| `?still=0` | editor | A developer's: the stand-ins' hold left out (since wave C of 2026-10-16) — what they draw is walked by three every frame and handed to it whole, as before, for comparing a frame time (`World/StandIns.js`: `hold`, `drawnScene`; stand-ins.md). Nothing is kept. |
| `?frames=always` | editor | Every frame drawn, as before 2026-10-13, where the editor under its plain light otherwise draws only when something has changed (`Experience/Pace.js`; frames-on-demand.md): for a test or a tool that counts on frames. Also `experience.pace.set("always")` in a page, `set(null)` to give it back. Nothing is kept in the browser. |
| `?outline=pass` | editor | The selection's outline drawn by three's OutlinePass, which draws the scene a second time, in place of the editor's own (`Editor/SelectionOutline.js`): for comparing a frame or a time. Read as the page opens. |
| `?debug` | public | The colliders may be shown (`experience.colliders.available`): C and Shift C, the menu's *Debug* switch, the C hints. The editor has them without it. Nothing is kept. |
| `?colliders`, `?colliders=xray` | both | The colliders shown from the start (in a public view, as `?debug` besides); `xray`, seen through everything. A public view's frame-rate guard judges nothing while they are shown. |

`?shut=0` works in a public view too (`World/ShutBatcher.js`):
../baked-view-lighting/SKILL.md. While the colliders are shown, a public
view's frame-rate guard judges nothing (../baked-view-lighting/SKILL.md).

## What a test tab can ask the page

`window.experience` (`e`), its world (`w = e.world`) and builder (`sb =
w.sceneBuilder`). Each is what the app itself uses; why, and what to watch
for, is in the topic files here.

| handle | where | what |
|---|---|---|
| `w.plain`, `w.setPreview(on, { remember: false })` | editor | Whether the plain light is what is drawn; the realistic preview (a promise: await it). |
| `w.plainLight.keepOut(root)` | editor | Every light under `root` kept out of three's light state under the plain light (off every layer), as whatever makes a light while it is on calls it: a car's beam, a fridge's, the garden's, the lamps' as the slider moves. Let in for a frame, each would have every shader built again. |
| `w.scope.current`, `w.scope.set("all", { remember: false })` | editor | What the view's scope draws. |
| `w.standIns.stats()` | editor | The stand-ins now: `active`, `units`, `meshes`, `merged`, `instanced`, `alone` (the only one of its kind, drawing itself), `asThemselves`, `hidden`, `buckets`, `batches`, `bucketTriangles`, `instances`, `waiting`; of the pieces whose parts open, `wholes` (drawn whole by their model), `lifted` (whole but for parts lifted out), `cast` (meshes drawn by a model), `models`, `modelMeshes`, `modelInstances`; and what `update` has done and taken (`updates`, `scans`, …, `ms`, `last`, `worst`). |
| `w.standIns.hear()`, `.settle()`, `.setEnabled(on)` | editor | Every mesh looked at on the next frame (after a change by hand that emits nothing); what was just built again merged now; the stand-ins off or on (as `?standins=0`). Their meshes carry `userData.standIn`, under `e.scene.getObjectByName("stand-ins")`; a real mesh a stand-in draws has `layers.mask === 4096` (layer 12). |
| `w.standIns.holds`, `.holding`, `.drawnScene()`, `.letGo()`, `.setShutMerged(on)`, `.units` | editor | The hold (since wave C of 2026-10-16): whether the units are to be held still (false with `?still=0`) and whether they are now; what three is handed to draw (null while nothing is held); everything let go, walked by three as it was built (what the realistic preview does); pieces with parts drawn mesh by mesh and sashes not merged with their walls, or back (as `?shut=0`). `units` is a Map, root → `{ root, kind, held, passed, away, movers, sashes, mode, … }`: held and passed over by three's walk, drawn entirely by the stand-ins and left out of what three is handed (`away`), its parts and sashes, and how its piece is drawn (`mode` 0 loose, 1 whole, 2 parts lifted out). Anything under the hold is tested with these (`test-standins.mjs`, `hold-check.js`). |
| `w.rays.cast(raycaster, roots)`, `.touch()`, `.stats` | both | A ray as `raycaster.intersectObjects(roots, true)` answers it, from the index — in the editor the raycaster needs `layers.enable(12)`; every unit looked through before the next ray; `casts`, `looks` (roots looked over), `lists` (a root's children taken again), `scans` (units looked through), `entered` (units a ray went into), `trees` (triangle trees made), `triangles` (found along rays by those trees) — `units` is among them and is never counted. |
| `e.pace.state`, `.stats`, `.set("always" \| null)` | editor | `"always"`, `"awake"`, `"rest"` or `"idle"`; frames drawn and why (`frames`, `awake`, `rest`, `beat`, `always`, `skipped`, `wakes`, `busy`); every frame drawn, for a tool that counts on them, and given back. A public view has no `pace`. |
| `e.wake(why)`, `e.update()`, `e.renderer.frames` | both | A frame asked for (nothing, in a public view); one frame by hand — at rest in the editor, one in which no time passes; frames drawn. |
| `e.renderer.prepareLights(lights, { paced })`, `.shadowDraws()` | both | The shaders for the scene with `lights` in it built ahead, the lights left hidden (a promise; not under the plain light) — the lit materials', and since the integration of wave C the shadow maps' own for those lights; what the next shadow pass of the scene draws with (a promise of `Map<programKey, { object, material }>`, or null where no pass came). Count what was built in a frame by `e.renderer.renderer.info.programs.length` before and after it; a shadow map's programs' keys start `depth,` or `distance,`. |
| `sb.refreshCollision({ wait })`, `sb.settleCollision()` | editor | The collision trees brought in step with the scene (waiting for them unless `wait: false`); a tree being built a slice a frame finished now. |
| `sb.dynamicKeeper.last`, `.job`, `.low`, `.high` | editor | What the furniture's tree last did (`how`: same, mended, built, building; `why`: bounds, order, share, long, empty, begun, finished; `ms`; `sources`, `changed`, `triangles`, `total`), whether it is still being built, and the box it is cut from. `sb.staticKeeper` likewise for the building's. `w.collision.static`, `.dynamic`, `.outdoor`, `.people` are the trees. |
| `e.colliders`: `.available`, `.shown`, `.xray`, `.toggle({ xray })`, `.show(on, { xray })`, `.register(provider)`, `.stats()`, `.view` | both | The colliders drawn (`Experience/Colliders.js`; the drawing `World/ColliderView.js`, loaded at the first show): whether this view may show them, whether and how they are; `register((add) => { add.box(centre, quaternion, half, kind); add.capsule(start, end, radius, kind) })` → unregister, `kind` a `KINDS` id; `stats()` null while hidden. `view.counts`, `view.region`, `view.last` (gather ms), `view.fixed` / `.loose` / `.movers` `.sink`. |
| `w.collision.revision` | both | `{ static, dynamic, people, outdoor }`, bumped as each tree is set — a keeper mends its tree in place. `uniqueTriangles(tree, box)` is exported from `World/Collision.js`. |
| `w.collision.meets(capsule, { except, depth })`, `.meetsAny(capsules, box, { except, depth, count })`, `.anyIn(box, { except })` | both | Whether a capsule meets anything (every tree) by more than `depth`, leaving out what `except` says; whether any of many capsules does, the triangles in `box` (which holds them all) gathered once (a figure's body at many moments: `Seats.wayClear`, `turnClear`, `roomFor`); whether any triangle at all lies in a box. |

`e.renderer.prepareLights` and `.shadowDraws` are what a first-use hitch is
looked into with: ../app-testing-and-performance/speed-architecture.md.
The world's `"colliders"` event (`{ shown, xray }`) is among the world's
events of 2026-10-16: ../visitor-interactions/page-handles.md.

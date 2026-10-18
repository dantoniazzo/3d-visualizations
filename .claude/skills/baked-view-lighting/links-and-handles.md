# A public view's links and handles

The public view's rows of the old reference's two tables, "A link's
words" and "What a test tab can ask the page". As the code stood on
2026-10-12 (`frontend/Experience/Utils/device.js`, `frontend/index.js`,
`World/World.js`, `shared/publishOptions.js`), the live room's words and
handles read again on 2026-10-14 (`World/RoomLight.js`), and the view's
handles (`World/ProbeLight.js`, `World/SceneBuilder.js`,
`World/ShutBatcher.js`) against the code on 2026-10-17. What each thing
does, and why, is in this skill's topic files.

The other rows: the editor's words (`?scene`, `?preview`, `?scope`,
`?standins`, `?shut`, `?still`, `?frames`, `?outline`) and the colliders'
(`?debug`, `?colliders`, `?colliders=xray`; a public view's frame-rate
guard judges nothing while they are shown) are
[../walkthrough-editor/links-and-handles.md](../walkthrough-editor/links-and-handles.md)
— `?shut=0` works in a public view too, where the shut parts are then
not merged by material (`World/ShutBatcher.js`, merged-house.md). The
index of both tables, the handles' intro and the keys a browser keeps
(`render-quality`, `view-lighting`, `view-scenery`, `view-lost-graphics`,
`view-reloaded-at`) are
[../app-testing-and-performance/test-tabs.md](../app-testing-and-performance/test-tabs.md).
`?version` and `?live` are the publish's side too
([../publish-and-bake/publishing.md](../publish-and-bake/publishing.md));
`?quality`, `?uncapped`, `?rated` and `?guard=off` (to time anything) a
tester's ([../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md)).

## A link's words (public view)

`/?scene=<id>` is the editor (and its walkthrough); `/view/<id>` a public view. A word with no `=` is read by its presence alone.

| word | where | what |
|---|---|---|
| `?version=<v>` | public | That published version, not the latest. |
| `?live` | public | No published version: the space as it stands, built and merged in the page, lit live. |
| `?lighting=baked\|static\|live` | public, baked | The mode, over the version's and the visitor's: `baked` and `static` on any device at any step; `live` (the whole house lit live over its bake) only where the bake has the light apart, not on touch and not at steps 0–1. A bake made for a fully static view (`lighting.only`) is drawn `static` whatever is asked. |
| `?quality=0…4\|low\|high\|max` | both | The slider's step for this page (`low` 1, `high` 3, `max` 4), over a stored step and a version's own — never above the device's ceiling. Moving the slider takes it out of the address. |
| `?uncapped` | both | A developer's: no ceiling (not on touch), to see a step on a device not rated for it. |
| `?rated=0…4` | both | A developer's: the device rated that low — never higher than it is — to see what such a device is given. Leaves a stored step as it is. |
| `?guard=off\|report` | public | The frame-rate guard left out (to time anything), or saying in the console what it does. |
| `?stats` | both | Frame rate, draw calls, triangles, bytes; in a public view the version and its options; while the colliders are shown, theirs: total, "within 30 m" or "all", build ms, triangles by kind, doors blocking. |
| `?lightmap=rooms\|one` | public, baked | A developer's: `rooms`, each room's own materials as before the light was resolved into one lightmap; `one`, the one-scale lightmap and layers drawn through the resolver, not those held each room's own way. |
| `?merge=off\|<metres>\|own\|tint` | public, baked | A developer's, comma-separated: the house left a mesh a room; another side for the squares it is merged by (`0`: none); `own`, no materials shared; `tint`, no colours in the vertices. |
| `?roomlight=on\|off` | public, baked | A developer's, for the live room (K): `off` (not offered), `on` (asked for as the view opens, which a visitor's never is). The other words it once took went with the lamps-over-the-bake drawing. |
| `?night=meter\|lift\|asis` | public, baked | A developer's: how a lamplit room is exposed at night (`meter` is what is on). |


## What a test tab can ask the page (public view)

`window.experience` (`e`), its world (`w = e.world`) and builder
(`sb = w.sceneBuilder`); the rest of the table is indexed in
[../app-testing-and-performance/test-tabs.md](../app-testing-and-performance/test-tabs.md).
`sb.holdStill()` is the speed architecture's
([../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md));
`sb.shutBatcher` matters to opening furniture
([../visitor-interactions/opening-parts.md](../visitor-interactions/opening-parts.md)).

| handle | where | what |
|---|---|---|
| `w.roomLight.status()`, `.set(on)`, `.toggle()`, `.end(why)`, `.most` | public, baked | The live room: `state` (off, withheld, step, above, outdoors, coming, lit), `groups`, `zones`, `sight`, `lamps`, `exposure`, `stats`; asked for or not; turned off with a word; a ceiling on the groups shown, for a test. |
| `w.lightingMode`, `sb.resolver`, `sb.merged`, `e.guard` | public | "baked", "static" or "live" (null for a version with no bake); the resolved lightmap and the merged house (null lit live or unbaked); the frame-rate guard (`feed(ms)`, `status()`). |
| `w.probes` (`World/ProbeLight.js`): `.tracked`, `.epoch`, `.key`, `.update(delta)` | public, baked or lit live | The light probes lighting what moves (the visitors, the people, the cars, the furniture's parts and, drawn from the bake, the doors' leaves), once the bake's `probes` file is loaded (none "static"). `tracked`: root → `{ cube, sun, factor, room, rest, frame, materials, meshes, … }`, its six ways' light and sun share. `epoch` moves on whenever the light changes (`key`: the variant, the switches' weights, which are lit live, the doors; the sun; the gain from above); an entry whose `rest === epoch` is passed over until it moves. Whether it still wears what it was dressed in is asked once in 8 frames (`DRESSED_EVERY`). |
| `sb.holdStill()` | public | The Scene, the root, the shell, the openables', lights' and cars' groups, the doors, the see-through panes, the shut group and the merged house held still (`matrixAutoUpdate` off; the see-through, shut and merged groups not visited at all). The view calls it as it builds; whatever is added under them afterwards works out its own world matrix. |
| `sb.shutBatcher` (`World/ShutBatcher.js`): `.stats()`, `.setEnabled(on)`, `.entries`, `.buckets`, `.windows`, `.unseen`, `.prepareOwn(renderer, camera, again)`, `.allLit()`, `.showFloors(fn)`, `.enclosed` (`enclose(list)`; each `{ mesh, parts, hidden, live }`, the mesh marked `userData.shutIn` while a room shown live draws it) | public | The shut parts and sashes merged by material (each part's floor kept, `showFloors` leaving out of each mesh's index the floors `fn(level)` says no to); what shut doors enclose (a fridge's glass shelves); `{ enabled, light, parts, sashes, in, meshes, buckets, drawn, windows, glazed, lifted, indexes, uploads, ms }`; on or off (as `?shut=0`); one mesh of the parts' own for each program they are drawn by lifted out, whose shaders are made ahead (null until made). |

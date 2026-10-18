# Test-tab handle: the visitor's figure (`P.avatar`)

`window.experience` (`e`), its world (`w = e.world`), and `P = w.player`.
Each is what the app itself uses; the full list of handles is
`../app-testing-and-performance/test-tabs.md`, and the sitting and swimming
handles that drive this figure (`P.seated`, `P.rising`, `P.swimmer`, its clip
and fade parts) are `../visitor-interactions/page-handles.md`. How the clips
are made and fitted is `avatar-clips.md`. Before a first sit or swim stepped
by hand, await `P.avatar.wear(e)`, `w.seats.dress(P.avatar)` and, in a
public view, `w.seats.catalogue()` (`__sit.ready()`, `__clips.ready()`,
`__seats.ready()` do all three: `../app-testing-and-performance/browser-pane.md`),
and try both skins.

| handle | where | what |
|---|---|---|
| `P.avatar` (`Player/Avatar.js`): `.animation.play(name, fade)`, `.animation.weights`, `.animation.fading`, `.blend(time)`, `.weightOf(name)`, `.has(name)`, `.playable(name)`, `.fit(name, clip, hips)`, `.wear(experience)`, `.worn`, `.hipsAt(name, time)`, `.bonesAt(name, time, bones)`, `.bonesAlong(name, bones, count)`, `.sitting(name)`, `.setOpacity(opacity)`, `.whole()`, `.opacity`, `.faded`, `.meshes()`; `visitorClips(experience)`, `VISITOR_CLIPS`, `ONCE` | both | A clip played, every clip showing fading into it from what it makes of the pose now (`weights`: each action's share, set on the actions before the mixer runs; `fading`: `{ from, to, start, t, length }`); the fade moved on; a clip's share now; whether it has a clip, what plays in its place; a clip fitted; the visitor's own clips fitted (a promise; `worn` once looked for); where the hips are in a clip at a time (root frame, its scale: read off the track), where bones are (measured once on a copy), and at `count` moments evenly through a clip (`[{ time, bones }]`, one copy, kept); how it sits; the figure drawn see-through (each mesh in a dithered, `alphaHash`, copy of what it wore whole — or of what it is given meanwhile, the probes' copies — kept for the next fade; no shadow under half; 1, `whole()`: each mesh in exactly what it wore before, and, not fading, any dithered copy handed back to it since put back as what it stands for — `faded` while under 1, `opacity` how far it is drawn); its meshes; the file of them (a promise of a Map); their names' patterns; the once-through clips and their pace. |

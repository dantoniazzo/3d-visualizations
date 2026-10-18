# The slider's steps (`QUALITY_STEPS`)

The table and what goes with it — the device's rating and ceiling, the
step drawn, the water's counts, the live room, post-processing and the
sun's shadow map by mode. From the old reference's "The view", as the
code stood on 2026-10-12 (`frontend/Experience/Utils/device.js`,
`frontend/index.js`, `World/World.js`), the water's counts added on
2026-10-16 (`World/Water.js`) and the live room's line read again on
2026-10-15 (`World/RoomLight.js`, `World/RoomBakeLight.js`). What a
visitor is given at each step is [lighting-modes.md](lighting-modes.md);
the people's column (`QUALITY.people`) is
[../space-people/people-runtime.md](../space-people/people-runtime.md);
the water's counts are explained in
[../visitor-interactions/water.md](../visitor-interactions/water.md).
The rating and ceiling matter to a tester too (`?rated=`, `?uncapped`,
the low-power reload): [../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md).

| step | name | pixel ratio, pixels at most | post, MSAA, AO samples | sun's shadow map | `lamps` (live, shadowed + not) | `garden` (spots + points) | room probe, grade | live room (K) |
|---|---|---|---|---|---|---|---|---|
| 0 | Fastest | 1, 2.1 M | no | 1024, hard, to 35 m | 0 + 2 | 0 + 1 | no | — |
| 1 | Fast | 1.5, 2.1 M | no | 1024, hard, to 50 m | 1 + 1 | 0 + 1 | no | — |
| 2 | Balanced | 1.5, 3.7 M | yes, 2, 8 | 2048, soft, to 60 m | 1 + 2 | 1 + 1 | grade | yes |
| 3 | High | 2, 5 M | yes, 4, 12 | 4096, soft, to 90 m, every 2nd frame | 2 + 2 | 2 + 2 | both | yes |
| 4 | Maximum realism | 2, 5 M | yes, 4, 16 | 8192, sun-soft, to 120 m, every 3rd frame | 2 + 4 | 3 + 2 | both | yes |

- A device is rated (`deviceDefaultStep`) by touch (1) or by its graphics' name: a software renderer 0, integrated Intel and AMD 2, other Apple chips and discrete cards 3, Apple Pro/Max/Ultra and RTX 4. The rating is its ceiling (`stepCeiling`): the slider's top, and the most a link, a stored step or a version's *Always high* gives.
- The step drawn is, in order: `?quality=`, the stored step, the version's `quality` (`low` 1, `high` 3), the device's rating — then capped. Steps 0–1 are "low power": a baked version is drawn "static" and from its 2048 copies; that much is chosen as the page opens and waits for a reload when the slider crosses the line (`needsReloadFor`).
- `water` (`World/Water.js`, since 2026-10-16), steps 0–4: `rain` drops a shower 72/110/170/240/320, `splash` droplets a tap 10/14/18/24/28, `spray` droplets a shower's tray 20/28/40/56/72, `steam` puffs 8/10/12/14/16, `steaming` showers drawn with steam at once 1/1/2/2/2 (the nearest in sight), `haze` samples a look through the steam's body 3/3/3/4/4. One geometry each, shared by every fixture and drawn to the step's count, made again larger if a step asks for more.
- The live room (K, `World/RoomLight.js`): the rooms round the visitor drawn in their true materials over a view drawn "baked" — lit by the bake's own light with the sun and the nearest lamps live (`World/RoomBakeLight.js`, since 2026-10-15; drawn unbaked only where `RoomBakeLight.usable` does not hold: live-room-bake-light.md, and ../publish-and-bake/SKILL.md, checking the published view) —, when they ask — eight groups of rooms at most at each of those steps (`LIVE_MOST`), on a device rated for step 2 or more and not driven by touch; at steps 0–1 the view is "static" and has none.
- Post-processing, the room probe and the grade apply only under a site's own sky (a space with a `landscape`); elsewhere a step sets the pixels, the shadows' filter and the texture filtering. The people's column is in ../space-people/people-runtime.md. The sun's shadow map as the table has it — that size, fitted to the view out to that reach, drawn again every so many frames — is a view lit live under a site's own sky (`Realism.js`'s fit; not a baked view, nor a space without a sky): the filter alone is the step's everywhere. A view drawn "baked" has a map of what moves alone, 2048 a side at steps 2–4 (`SHADOW_MAP_SIZE` in `World/Environment.js`; twice that for `?lighting=live`'s whole house), and "static" has none. `lamps` is a view lit live. `garden` is every view of a site at night: over a bake those few lights go on lighting what is drawn live — the trees, the people, the cars, the glass — the house's and the ground's share of them being the bake's, where the bake has it.

- Trees' reach goes by the step too: whole under 24 m, light under 48 m,
  impostors beyond at step 3, × `QUALITY.flora.reach` (0.6–1.5 by step)
  (SKILL.md).

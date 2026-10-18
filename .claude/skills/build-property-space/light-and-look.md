# Light and look

What a space decides of its light, and what it leaves to the app. How a
published view is lit and drawn from its bake is
`../baked-view-lighting/SKILL.md`; the editor's plain working light (P for
the realistic preview) is `../walkthrough-editor/editor-plain-light-and-scope.md`.

- **Decide the sun once**, before the first critic round: tally which faces
  are lit in every exterior reference, set `sky.turn` and `sky.elevation`,
  and keep them. Exterior renders outvote interior ones. Ladonia: turn 19,
  elevation 36 (east-south-east, ~105°), after six flips between single
  critics. Measure the real direction from `sun.position − sun.target`.
- **A space sets only** `landscape.sky` (`day`, `dusk`, `turn`,
  `elevation`) and, if it needs them, `garden.colour.toneMapping` and
  `exposure`. **The rest is app-wide and already set** — don't retune it
  for one space; change it only as a proposal to the user, comparing the
  other spaces before and after (`verifying.md`; run HEAD in a scratch
  worktree beside yours: `../app-testing-and-performance/test-servers.md`,
  other spaces). The values that matched Ladonia's
  renders (Sky.js `VARIANTS`, `INDOOR`, `GLASS_*`; Realism.js):
  day exposure 1.3, `outdoor` 0.3 of the sky's light (shaded faces 2.3–3.3×
  darker than sunlit ones), rooms a warmer, greyer indoor share (`INDOOR`
  0.8, the furniture's finishes included — re-applied once furniture and
  batches exist), indoor exposure 2.2 (`INDOOR_EXPOSURE`), dusk outdoor a
  third; windows dark outside by day (`GLASS_OUTSIDE` #4b545a at 0.78) and
  near clear inside (`GLASS_INSIDE` #eef2f2 at 0.12); the per-room light
  probe from slider step 3 up. Interiors at night glow from their own
  surfaces (`Sky.glowIndoors`), not unshadowed point lights — and where
  the light fittings are switched live (the editor's realistic preview, an
  unbaked publish), room by room as their switches are (`RoomGlow`,
  `../walkthrough-editor/lights-and-fittings.md`), with a few live lights
  nearest the visitor.
- **Tone mapping** is per space (`garden.colour.toneMapping`: `aces`, the
  default and Ladonia's, or `filmic`, with `exposure`; at slider steps 2–4
  an ACES space is drawn with AgX plus the renders' grade): pick the tone
  mapping and the slider step, and keep both fixed while matching renders
  (`../baked-view-lighting/tone-ao-colour.md`). The sky picture is drawn
  without mipmaps, and N8AO with `gammaCorrection: false`
  (`../baked-view-lighting/SKILL.md`).
- **All of this is the look lit live**: the editor's realistic preview
  (**P**; an editor tab opens under a plain working light instead,
  `verifying.md`) and a version published unbaked. A baked view takes its
  light from the bake and its exposure from a meter that reads the frame
  (`../baked-view-lighting/light-meter.md`;
  publishing: `../publish-and-bake/SKILL.md`): never judge one at a fixed
  exposure, and say of every frame which of the three it is — plain, lit
  live, or baked and in which mode.
- **What a visitor of a published view can switch to (K, the live room)
  is judged against the baked frame**, not against the editor:
  `../baked-view-lighting/live-room.md`.
- **No refractive glass anywhere** (`transmission`): one pane in view
  darkens the whole frame through the post-processing — a shower's glass
  door left a bathroom near black and every room 15–40 % darker. Glass
  trims default to `transmission: 0`; furniture and cars get plain
  see-through glass on load (`Utils/reflections.js` `plainGlass`); glass
  is see-through by opacity, never transmission. Pool
  water is clear without transmission (since wave C, 2026-10-16;
  `../visitor-interactions/pool-water.md`). A first pass multiplies what is under
  it by a turquoise that deepens with the path through the water, worked
  out from the pool's box and steps (no depth read). Then a surface whose
  alpha is its Fresnel reflectance, its roughness kept over 0.1. An
  opacity hides the steps: 0.78 did.
- A balustrade's glass must not match Sky.js's `GLASS` (`/^glass_solar/`),
  or it reads as a dark panel; a new room finish must match `ROOM`, or its
  rooms take the full outdoor sky.
- A room is "indoors" (and exposed for it) by the camera, or by the
  player's feet when the third-person camera has clipped into a wall;
  open-air slabs (`ceiling_finish: "none"`) are not.
- **Measure, don't judge by eye.** Mean luminance (0.2126R + 0.7152G +
  0.0722B, without the 16 px label bar) from each living-room spawn: place
  the player (`player.placeAt(spawn)`), step the world a few times and
  render once (`../app-testing-and-performance/browser-pane.md`
  — not by `experience.update()`, which in an editor tab at rest is a
  frame in which no time passes), in an editor tab with the realistic
  preview on (`await __K.realistic()`: under the plain light every room
  reads the same, day and night). Keep the slider step and tone mapping
  fixed while comparing. Ladonia's living rooms read 128–186, bedrooms and baths 107–177, after
  the glass fix (73–122 before). Diagnose by elimination: change one thing
  at a time (env intensity, sun, lights, emissives, post) and sample a fixed
  patch. three r163: `scene.environmentIntensity` scales the sky's light;
  `envMapIntensity` alone does nothing.
- A larger site widens the sun's shadow frustum and coarsens the
  buildings' shadows: check shadow texel size when the site grows.

# What a visitor is given: lighting modes and ceilings

How a published view (`/view/<id>`) is drawn on each device and at each
step of the slider: the modes ("baked", "static", the whole house lit
live by link alone), what was seen in the page, what the default costs,
the device's ceiling, the pixel budgets and a lost graphics context. The
frame-rate guard that lightens a view from there is
[frame-guard.md](frame-guard.md); the steps themselves
[quality-steps.md](quality-steps.md); a link's words and the page's
handles [links-and-handles.md](links-and-handles.md); the keys a browser
keeps (`render-quality`, `view-lighting`, `view-lost-graphics`,
`view-reloaded-at`) [../app-testing-and-performance/test-tabs.md](../app-testing-and-performance/test-tabs.md).

A version published "Fully baked" (`lighting.only` "static") is baked
for that alone and drawn "static" whatever the link asks
([../publish-and-bake/baking.md](../publish-and-bake/baking.md)); the
publish options the view reads, `lighting` and `quality`, are
[../publish-and-bake/publish-options.md](../publish-and-bake/publish-options.md).
How many people each step draws (8 at step 1, 4 at step 0, whole groups
from the top of the spec's list) is
[../space-people/SKILL.md](../space-people/SKILL.md). `?rated=` and
`?quality=` are how a tester sees what a weaker device gets, and the
context-loss recipe below is a test's: both are indexed in
[../app-testing-and-performance/SKILL.md](../app-testing-and-performance/SKILL.md).

- **A baked version is drawn from its bake on every device** (`Utils/device.js`
  `lightingMode`): steps 2–4 get "baked" — the bake's
  light, a shadow map of what moves alone (and a site's own trees, which
  the bake has no shade of) taking the sun's share away where it falls,
  what moves lit by the probes, doors dimming rooms — and steps 0–1, phones
  among them, "static": nothing live. `world.lightingMode` says which. The
  whole house lit live is never given and not in the visitor's menu (which
  offers only *Auto* and, where that is not it already, *Fastest*; a stored
  `view-lighting` of "live" or "baked" reads as Auto): only
  `?lighting=live` draws it, to compare, and not on a touch device or at
  steps 0–1. So a frame of a baked view taken without `?lighting=` is the
  "baked" mode on this Mac — say which mode every frame was taken in. The
  publish option's "phones" is what "auto" gives now; kept for old
  versions, no longer offered (`retired` in `shared/publishOptions.js`).
- **Seen in the page on this Mac** (2026-10-12, Wrenfield's baked
  20261001T143211Z on the final build): as it opens, step 4 —
  `world.lightingMode` "baked", the probes and the sun's shade map there,
  the light resolved at 4096, the house merged, the live room offered (the
  lights panel's *Live room* switch, **K**), the menu's lighting *Auto*
  and *Fastest*; with `?quality=0` — "static", no probes, no shade map,
  the light resolved from the 2048 copies, the canvas 1280 × 720, no
  lighting choice in the menu, the live room withheld ("step").
- **What the default costs now** (the final measurement, 2026-10-12: the
  committed code → this, median ms a frame, 1280 × 720 CSS at ratio 2; the
  committed code's default on this Mac was the whole house lit live at
  steps 2–4 and "baked" at 0–1). Ladonia baked, step 4: living room 25.7 →
  12.6 (39 → 79 a second), bedroom 24.9 → 13.1, pool 43.9 → 17.0, street
  41.7 → 16.1; at night 39.4 → 12.8, 44.7 → 13.3, 63.6 → 17.1, 56.6 →
  16.1. Step 2: 19.0 → 7.9, 35.9 → 12.3, 35.3 → 12.2; night pool 47.1 →
  12.1. Step 0: 9.7 → 4.3, 21.9 → 7.6, 22.2 → 7.6. With something moving
  every frame the old view went to 34–67 ms indoors at step 4; this stays
  at 12.7–14.1. A 5 s walk indoors at step 4: median 43.4 → 16.3, frames
  over 25 ms 300 of 300 → 0; a 10 s run out of doors: p95 50.6 → 19.0,
  frames over 25 ms 598 of 598 → 1. All 93 lights turned on: 1,108 ms and
  then 57 ms a frame → 176 ms and 13.3. A first night: 1.9–2.1 s with one
  frame of 813–951 ms → 0.9 s and 391–429 ms. Wrenfield baked: step 4
  living room 7.7 → 4.7, garden 10.3 → 5.7, street 10.5 → 5.9; step 0 4.2
  → 2.3, 7.0 → 4.1. Unbaked (Ladonia, 12 people): at night ×1.6–2.4 at
  every step (step 4: living room 46.9 → 23.0, pool 69.4 → 33.1); by day
  ×1.1–1.5 (24.8 → 21.0, 37.0 → 31.6, 29.3 → 25.5). **No phone, no touch
  device and no integrated or slow GPU was measured**: what a rated-low
  device is given was only seen through `?rated=` and `?quality=` here.
- The whole house lit live (`?lighting=live`) is what the committed code
  gave a computer by default — the old figures above at steps 2–4 are that
  mode. On this build it is a link's alone, and is neither resolved nor
  merged (Ladonia: 3,952 meshes): 25–49 ms a frame by day and 58–97 at
  night when something moves (step 4, 2026-10-10). Door leaves aren't in
  the bake.
- **Ceilings on what a device is asked for**: `stepCeiling()`
  is the device's rated step (`deviceDefaultStep`: touch 1, software 0,
  integrated 2, other Apple and discrete 3, Apple Pro/Max/Ultra and RTX 4)
  and nothing goes above it — the slider's `max`, `?quality=`, a stored
  `render-quality` (brought down and rewritten at load), a version's
  "Always high". `?uncapped` in the link lifts it (not on touch);
  `?rated=0…4` pretends a lower rating, never a higher one — the way to
  test what a weaker device is given on this Mac
  (`?rated=1&lighting=live` opens static); it leaves a stored step as it
  is. Each step has a pixel budget too
  (`QUALITY.pixels`: 2.1, 2.1, 3.7, 5, 5 million; `Utils/Sizes.js` lowers
  the pixel ratio to meet it — nothing changes at 1280 × 720, where the
  steps' own ratios already fit; a 2560 × 1440 window at step 4 draws at
  1.165, not 2). A WebGL context lost in a **public view that is on show**
  (`document.visibilityState === "visible"`) writes `render-quality` 0,
  `view-lighting` "static" and `view-lost-graphics` 1; the next visit opens
  at step 0, static, and shows `#view-notice` once (public views only).
  Lost in the editor, or in a tab not on show — an agent's hidden pane is
  one —, it writes only `render-quality`, one step lower (a
  browser drops the contexts of background tabs and of the oldest of many).
  When the context comes back a public view reloads itself (its bake's
  bitmaps were closed after upload, so three could not restore it), at most
  once a minute a tab (`sessionStorage["view-reloaded-at"]`). To test the
  first: `Object.defineProperty(document, "visibilityState", { get: () =>
  "visible", configurable: true })`, then `WEBGL_lose_context` on the app's
  canvas; remove all four keys after.

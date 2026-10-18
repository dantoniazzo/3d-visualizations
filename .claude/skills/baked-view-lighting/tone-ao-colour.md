# Tone, AO and colour

Tone mapping per space and the ambient occlusion (N8AO) over every
graded view, a bake's among them. A Blender sheet is not the app's
colour — judge a material's colour in an in-app frame beside its
reference at a fixed slider step — is
[../build-property-space/blender.md](../build-property-space/blender.md).
The app-wide live look (exposure, indoor share, glass) is
[../build-property-space/light-and-look.md](../build-property-space/light-and-look.md);
the pool water's reflections and its multiply pass through
`linearToOutputTexel` [../visitor-interactions/SKILL.md](../visitor-interactions/SKILL.md);
the same `drawTransparency` rule from the speed side
[../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md)
(What runs every frame, PostProcessing).

For whoever builds a space: pick the tone mapping and the slider step,
and keep both fixed while matching renders
([../build-property-space/SKILL.md](../build-property-space/SKILL.md)).

## Tone, AO and colour

- Tone mapping is per space: `garden.colour.toneMapping` is `aces` (three's
  ACES Filmic — the default, and Ladonia's) or `filmic` (Blender's Filmic
  curve, `Utils/filmic.js`), with `exposure`. At the graded slider steps
  (2–4) an ACES space is drawn with AgX plus the renders' colour grade
  (PostProcessing.js); `filmic` is kept as asked. Pick the tone mapping and
  the slider step, and keep both fixed while measuring against renders.
- AO: N8AO 1.10.1 + postprocessing 6.35.6, half resolution, 8/12/16
  samples at slider steps 2/3/4 (none at 0–1, which have no
  post-processing), `gammaCorrection: false`, lazy-imported. three's
  GTAOPass draws leaf cards as solid squares.
  - Its two transparency passes are the app's (`PostProcessing.
    drawTransparency`, set on the pass as `renderTransparency`):
    the library hides what is not for a pass with `visible =
    was && material.transparent && …`, which is `undefined` for a mesh with
    a material array, and three skips only `false` — every multi-material
    wall of a view lit live went into the second pass (5,000 draws from
    Ladonia's garden) — and each pass was a whole `renderer.render`:
    matrices again, and the sun's shadow map again at a step that draws it
    every frame (three times a frame at step 2). Ours sorts once, draws a
    multi-material mesh only if one of its materials is see-through and
    writes depth, holds `shadowMap.autoUpdate` and
    `scene.matrixWorldAutoUpdate`, and clears an empty pass once instead of
    drawing it. The picture is the same to the pixel.
    Since wave C (2026-10-16) what goes into each picture, and what is
    hidden meanwhile, is read off three's render lists of N8AO's beauty
    pass, drawn just before with the same camera
    (`renderer.renderLists.get(scene, 0)`: opaque, transmissive,
    transparent), not looked for object by object through the scene —
    that walk was 0.2–0.35 ms of every frame with the 3,400 objects
    Ladonia's new version shows. Read the lists before either picture is
    drawn: drawing one begins them again. What is not in them (hidden, off
    the camera's layers, out of view) three would leave out of the
    pictures anyway; so whatever should ease the occlusion behind it must
    be drawn by the beauty pass
    (../app-testing-and-performance/speed-architecture.md, What runs
    every frame).
  - Kept over a bake, on the frames: without it Ladonia's living room is
    10 levels brighter (46% of pixels by more than 8), the hedges and
    crowns flatter, nothing seated on the floor; it would save 4.3–5.4 ms
    of 19–32 at step 4. Without the transparency passes alone (−2.6 to
    −3.3 ms) the windows seen from outside by day darken by up to 25
    levels: the occlusion of the room behind them.

- Pitfalls (SKILL.md): N8AO wants `gammaCorrection: false` before the
  OutputPass (double sRGB otherwise); the sky's picture has no mipmaps
  (`generateMipmaps = false`) or a seam shows.

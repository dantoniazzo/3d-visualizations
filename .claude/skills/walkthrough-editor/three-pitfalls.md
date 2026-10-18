# three.js pitfalls met in the world's code

Moved from app-notes.md: the three.js items of "The spec, the validator
and the editor", and the material and shader items of "Publishing and the
public view". They hold wherever the world is built — the editor, a
publish, a public view. The others, by where they bite, are listed under
Elsewhere.

- Chrome and mirrors are black without an environment map:
  `Utils/reflections.js` gives a PMREM room only to metals (metalness ≥
  0.5, roughness < 0.6, no metalnessMap — or any metal with `imageLit`) and
  clear glass. Keep paint and lacquer below 0.5 metalness (paint at 0.5+
  turns studio-silver). Furniture loaded after the Environment must go
  through `applyReflections` (FurnitureLibrary does). Night reflections are
  scaled down or metals glow in the dark: 0.06 under a landscape's Sky
  (`Sky.applyIndoor`), 0.03 under the old Environment presets.
- `THREE.Color("#hex")` is linear: write it into a canvas (sRGB) with
  `color.getRGB(target, THREE.SRGBColorSpace)`, or the texture comes out
  far too dark.
- If something "exists" but nothing shows, look for NaN in its bounding box.
- meshopt-packed GLBs keep each mesh's quantisation in its node's TRS:
  never overwrite a packed node's scale or position from the app; wrap it
  in a parent and transform that.
- Never keep a Texture or a Color in `material.userData`: three's
  `Material.clone` copies userData through JSON, so a clone gets a plain
  object for the texture (`CUBEUV_MAX_MIP NaN` — the glass and metals fail
  to compile) and a number for the colour; and a runtime publish carries
  the JSON in its extras. Sky.js keeps them in WeakMaps (`OWN_ENV`,
  `GLASS_OWN`, `OWN_EMISSIVE`). Tell a stale console error from a new
  one: install `renderer.debug.onShaderError` after load and render, or
  count `renderer.info.programs` with failing `diagnostics` — the pane's
  console keeps the previous load's messages.
- Now and then Chrome's Metal translator fails to link a shader that is
  fine (one load in nine: "no matching function for call to
  'ANGLE_sc2d'"); `Renderer.relinkFailed` rebuilds any failed program's
  materials, twice at most.

## Elsewhere

- Static batching drops custom attributes: list them in
  `material.userData.attributes` (the terrain's `paint`) — SKILL.md,
  Pitfalls.
- `Mesh._computeIntersections`, which `rays.js` leans on, is a three r163
  method outside its documentation: rays-and-collision.md; look at it on
  an upgrade.
- Never give a scene object a property of its own; programs keyed by the
  light counts, the shadow maps' depth programs, a Scene held still:
  ../app-testing-and-performance/speed-architecture.md.
- A GPU pipeline per kind of picture; depth programs keyed by the call's
  light counts (`primeShadows`); a manual `matrixWorld` does not survive a
  frame and `eye.copy(camera)` copies `matrixAutoUpdate`; hiding hides
  children; walks of the scene's materials must skip `userData.roomLive`;
  restore materials in reverse order; time walks in first-person mode:
  ../baked-view-lighting/live-room.md.
- Never read a mipmapped texture after a branch on something that varies
  by pixel (take `dFdx`/`dFdy` before the branch, `textureGrad`); a shadow
  map must look every way its light shines; three keeps the uniforms of
  the last shader it built for a material: ../baked-view-lighting/SKILL.md,
  Pitfalls, and resolved-lightmap.md there.
- The pane's console keeps the previous load's messages (above): reading
  it in a test tab, ../app-testing-and-performance/SKILL.md.
- A runtime publish carries `userData` as JSON in its extras:
  ../publish-and-bake/SKILL.md.

# How a baked view is drawn: under its sky, and the house's light in one lightmap

The first part of the old app-notes section "How a baked view is drawn".
The rest: the house and its shut parts merged, and the sun's shade map,
[merged-house.md](merged-house.md); door leaves, baked textures,
materials rebuilt by name, the terrain's own shader, mirrors, metals,
clear glass and the glass-door race, [baked-drawing.md](baked-drawing.md);
what runs every frame, and what doesn't,
[../app-testing-and-performance/speed-architecture.md](../app-testing-and-performance/speed-architecture.md).

The "baked" and "static" views of a version with a bake
(lighting-modes.md). Lit live over its bake (`?lighting=live`) or
unbaked, the resolved lightmap (here) and the merged house
(merged-house.md) do not apply: `sceneBuilder.resolver` and
`sceneBuilder.merged` are null there and every mesh is a room's.

- **A baked landscape view is drawn under its sky** (World.setLighting):
  the sky's variant first (`Sky.setVariant`, prefetched with the lightmaps
  — `Sky.prepare` — and caught if it fails), then the bake's light over it
  (`Environment.setVariant`: the bake's sun, exposure `2^view.exposure ×
  Sky.exposure(variant)`, background/fog/hemisphere left to the sky,
  shadows re-fitted). Before, the two raced — whichever finished last set
  the sun, exposure and fog, and a day/night toggle swapped them.
- **The house's baked light is resolved into ONE lightmap**
  (`World/LightResolver.js`, `sceneBuilder.resolver`) in "baked" and
  "static" views of a bake with switches or door states — not
  `?lighting=live`, not unbaked, not a bake without zones or with its colour
  unparted (those draw as before; `sceneBuilder.resolver` is null). A pair
  of render targets the size of the lightmap in use holds `base × doors + Σ
  switches` texel by texel, drawn on the GPU only when something changes (a
  variant, a switch, a layer loaded, a door moving, the doors' atlas
  arriving) and only over the rooms that changed (`resolver.regions`,
  below); `Renderer.render` calls `sceneBuilder.drawLight()` before every
  frame. Every lightmapped material then reads that map with one shader
  (`decodeLightmap(…, resolved)`): no `own` materials by zone (Ladonia 2,242
  materials → 1,064, lightmap shader variants 32 → 5; Wrenfield 320 → 122),
  no limit of switches a room. What is still per fragment: the sun's
  straight light in "baked" mode (below), and the bird's-eye indoor gain
  (materials still split `|in`). `?lightmap=rooms` forces the old per-room
  materials, to compare; a device that fails `LightResolver.usable` (a tiny
  resolve drawn and read back) keeps them by itself — judged by the
  resolver's own program alone and after clearing whatever GL error was
  pending (another shader's failed link, the app's one load in nine, used to
  turn it off for the whole visit); its own shader, failing to link, is
  built once more as another program (`LightResolver.build`). The program
  tried is the one the view will draw with (`coded`: some rooms' parts held
  their own way; `layerCurves`: some switches' layers), its curves among
  what is drawn and read back — it used to try the plain one and leave the
  view to build the other, untried, at its first frame.
  - **The sun's straight light is the fragment's, not the map's** ("baked"
    mode, `RESOLVED_LIGHT`): the map dims all of a room's light by its
    doors, the sun's with the rest, and the fragment gives the sun's share
    back as far as the doors took it and takes it away where what moves
    shades it — `light + sun × (lit − stays)`, the same sum as a room's own
    material makes, the sun read from its mask the same way. For that it
    needs `stays`, how much of each room's light its doors leave: a third
    target beside the two (`resolver.stays`, the shared uniform
    `roomStays`: one byte a texel at the colour's size, no mipmaps, 4 MB at
    4096²; only where `sunShade` and door states both are — "static" has
    none). At first the map kept the sun's light undimmed and the fragment
    only took it away where shaded: what it takes away is read from the
    mask at the view's own level of detail, what the map held was added
    texel by texel, and from a few metres the two no longer cancelled — an
    orange strip of sun at the foot of a shut door (Wrenfield's hall:
    3,425 pixels of a 2560 × 1440 frame, now 2). It is also nearer the
    per-room picture where nothing is shaded: sun patches seen at a slant
    in a room with its doors shut (A1's living room from 0.6 m up: 14,947
    pixels over 8 levels → 3,088, of a 1280 × 720 frame). What is left
    there is one map's: the light is dimmed before it is blended, where a
    room's material blended first.
  - **Each room's part of the map** (`LightResolver.regions(zones, size)`,
    `{ luma, chroma, outer }`): the texels its own faces blend in — the one
    whose middle lies next beyond each edge of its rectangle — and on from
    there as far as halfway to the next room (8 texels at most), the
    brightness and the colour each laid out in its own texels. The bake
    leaves 4 texels between rooms at 4096 (Ladonia; Wrenfield 8), 2 in a
    phone's copy: there one texel of the colour is blended in by both
    rooms, and is the nearer one's. Before, a room's rectangle went out to
    whole texels of the colour and the texels between two rooms to
    whichever came first in the list: 38 of Ladonia's 376 room sides (81 at
    2048) blended in a line of the next room's — its lamp's light. Null
    (and the light is not resolved: `resolvesLight`, which asks at the
    lightmap's size and its phone copy's, and that every room with a layer
    or a door has a rectangle) when two rooms lie too close.
  - It is kept **as the variant's lightmap is encoded** (reinhard, sRGB,
    brightness at full size, colour at half), each value as 16 bits in two
    8-bit channels (RG8 + RGBA8: 64 MB with mipmaps at 4096², 16 MB for a
    phone's 2048²; no float-target extension needed; 15 textures bound at
    most in its own shader). Kept as linear light
    every edge would blend differently from the lightmap it stands for.
    A texel no switch lights and no door dims is the variant's, to the bit.
  - Its scale is the variant's own, except for a variant far darker than
    its lamps (`sceneBuilder.resolvedScale`: under a quarter of the
    switches' middle scale — the nights: Ladonia 0.30 → 1.41, Wrenfield
    0.05 → 3.89): lamp light kept in the night's scale sits squeezed at the
    top of the range, where blending and mipmaps come out a tenth darker
    than in the lamps' own layers. So `material.lightMapIntensity` is
    `π × resolver.scale`, not `π × info.scale`. One scale cannot fit every
    lamp: a lamp brighter than it glows a little less seen from afar (its
    bloom smaller: A2's living room through the window, lamp 2.13 against
    1.41, 4,724 pixels over 8 levels), one fainter a little more. Tried at
    the three-quarter mark (2.07), the nine-tenths (3.02) and the largest
    (11.14) over twelve night views: each mends the views whose lamps are
    near it and spoils the others (the largest: 9.7% of the living room
    over 2 levels); without that window view the middle one is the least
    off. Left at the middle.
  - A texel of the colour is four of the brightness: its colour is each of
    the four's, worked out as its own, weighted by brightness — the colour
    of their average draws a dark tinted line at island edges.
  - More than six switches on in a room (Wrenfield's landing with its doors
    open: ten) are added in turns through a scratch pair. Checked against a
    sum worked out in JS from the files: within 0.004 of a lightmap level.
  - Mipmaps are `generateMipmap`, after each change; while a door swings,
    every 0.1 s (not timed on an integrated GPU). A first night's layers
    come in at most 64 textures a
    frame, the rooms nearest the camera first (`resolver.pending` says how
    much is still to draw — wait for 0 before a still, as the measuring
    tools of 2026-10-12 did with `F.flush()`).
  - The switch layers are uploaded without mipmaps there (read texel for
    texel); the variants' lightmaps and the sun's mask keep theirs.
  - **Never read a mipmapped texture after a branch on something that
    varies by pixel**: `sunPart` was read after `if ( lit > 0.999 ) return`
    — its level of detail is undefined there, and pixels on the edge of a
    moving thing's shade read the mask's coarsest level (thin dark stepped
    lines on walls, darker dappled shade on the road). It now takes
    `dFdx/dFdy` worked out before the branch (`textureGrad`), in both paths.

- **The bake's side of these files** — each room's part of a lightmap
  written by a log curve of its own, the switch layers held their own way
  where a room's light of them is dim, and which texels are a room's
  worked out twice, by `shared/lightRegions.js` (the view) and
  `lightzones.regions` (the bake), which must agree (`node
  scripts/test-light-regions.mjs` after touching either) — is
  [../publish-and-bake/bake-light-files.md](../publish-and-bake/bake-light-files.md).
  The view's side of it is there too: `Utils/device.js` `roomLightmap`,
  `LightResolver.setBase(…, rooms)` opening each room's part by its curve
  (`uBaseCurve`), the own-way lightmap uploaded without mipmaps,
  `?lightmap=one`, and for the switch layers `ownLayer` and `uLayerCurve`
  (`layerCurves`). Why the curves: one 8-bit scale for a whole lightmap
  left a dim room 14–20 of 255 levels, and lossy compression showed it as
  tinted blocks ([../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md),
  pitfalls).
- The manifest's lighting fields read here (`zones`, `doorStates`, the
  switches' layers and their `own` curves, the variants' `rooms` and
  `garden`, the sun's mask): [../publish-and-bake/manifest.md](../publish-and-bake/manifest.md).
- Resolved against per-room (`?lightmap=rooms`), like merged against
  unmerged, a frame differs only at single pixels on lines where two
  surfaces touch ([../app-testing-and-performance/measuring.md](../app-testing-and-performance/measuring.md)).

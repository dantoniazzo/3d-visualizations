# A baked version's manifest

What a version's `manifest.json` holds once baked, as the code stood on
2026-10-12 (`scripts/bake-public.mjs`, `blender/bake_public.py`,
`server/publish/store.js`), with the fields added since. Read
`published/<id>/manifest.json` — the scene's latest — before saying which
version a link opens or whether it is baked.

The view reads these fields: `zones`, `probes`, `doorStates`, the
switches' `layers` and their `own` curves, the variants' `rooms` and
`garden`, the sun's mask, and `indirect` for the live room (K). How it
draws them is
[../baked-view-lighting/resolved-lightmap.md](../baked-view-lighting/resolved-lightmap.md)
and [../baked-view-lighting/live-room.md](../baked-view-lighting/live-room.md);
how the bake writes them, [bake-light-files.md](bake-light-files.md).

Where: `published/<id>/<version>/manifest.json`, and the scene's own
copy of the latest, `published/<id>/manifest.json`.

Beside `id`, `version`, `publishedAt`, `options`, `spec`, `view`, `snapshot`, `runtime`, `levels`, `birdView`, `stats`, `collision` and `sizes` (`snapshot`, `view`, `runtime`, and once baked `lightmaps` and `roomLightmaps` by variant, `probes`, `doorStates`, in bytes), a bake adds `lighting`. Every file it names is served from beside the manifest, in the bake's own folder (`<version>/bake-<stamp>/`).

| field | what |
|---|---|
| `bakedAt`, `samples`, `size`, `texel`, `meshes`, `triangles` | When and how: `texel` is the house's, in metres. |
| `margin` | The texels left round every island, as the bake ended. Since 2026-10-12. |
| `only` | `"static"` for a bake made for a fully static view alone: it has no `probes`, no `doorStates`, no `indirect` and no sun mask, and the view draws it static whatever is asked. Since 2026-10-12. |
| `view` | How the light is drawn: `{ transform, look, exposure }`. |
| `zones` | Each room's rectangle of the lightmap, `{ <room id> \| "outside": [x, y, w, h] }` in 0…1. |
| `probes` | The light probes: `{ file, layout, origin, step, size, zoneIds, zones, variants, switches }` — a grid a metre apart (0.8 up), each probe's room, and where in `probes.bin` each variant's and each switch's light is. |
| `doorStates` | `{ file, filePhone, size, doors: { <door id>: { <room>: { rect, at, share } } } }`: how much of each room's light stays with each of its doors shut, texel by texel in `doors.webp` and for the room all told (`share`). |
| `switches[]` | `{ id, label, scale, encoding, storage, attribute, doors, doorSides, lights, through, layers, indirect }`. `layers`: `{ <room>: { lightmap, chroma, lightmapPhone, chromaPhone, strength, rect, own? } }`, the switch's light in each room it reaches, at the switch's one `scale`; `own` (since 2026-10-12) is the same crop held by a curve of its own, `{ lightmap, chroma, lightmapPhone, chromaPhone, encoding: "log", curve: [knee, top, gain] }`, where the light only spills in. `lights`: its lamps as baked (`kind`, `position`, `power` in watts, `color`, `size`). `through`: the doors its light reaches each other room by. `indirect`: what its lamps bounce (`scale`, `attribute`, `doors`, `doorSides`, `layers`), read where the whole house is lit live over its bake (`?lighting=live`), and by the live room (K, `World/RoomBakeLight.js`, since 2026-10-15) for a switch whose lamps it draws live: their bounce from the bake, their straight light live. `attribute` (`_S<n>`): its light on the thin faces, in the view's vertices. |
| `variants.day`, `variants.night` | `{ lightmap, chroma, lightmapPhone, chromaPhone, storage: "ycocg", encoding: "reinhard", scale, attribute, doors, doorSides, sun, indirect, rooms?, garden? }`. `sun`: `{ position, color, strength, angle, mask, maskScale, maskPhone }` — the mask is the sun's share of each texel's light. `indirect`: all of the light but the sun's straight light (lit live alone). `rooms` (since 2026-10-12): the lightmap again with each room's part held by a curve of its own, `{ lightmap, chroma, lightmapPhone, chromaPhone, encoding: "log", zones: { <room>: [knee, top, gain] } }` — what a view that resolves the house's light fetches in the other's place. `garden` (night, a site with garden lights): how many of them are in the bake. `doors`, `doorSides`: the light at each door leaf, and on each of its sides. |

A version baked before 2026-10-12 has no `margin`, `rooms`, `own` or `garden`, and is drawn from its one-scale files exactly as before; the view asks for nothing it lacks.

- A manifest the store rebuilds from a bake's own `bake.json` keeps
  `only` and `margin` too (`server/publish/store.js` `rebuildManifest`).
- Beside the lighting: the runtime file's scene extras carry the windows'
  `sashes`, and each opening part's holder its `turn` and `reach`, in
  versions published since 2026-10-16 ([publishing.md](publishing.md));
  the manifest's `shadowCasters` (`{ before, after, pieces }`) is the
  culled faces kept to cast shadows, before and after the server
  simplifies them (Ladonia 647,612 → 78,116 triangles as publishing.md
  has it; 610,698 → 80,715 in 51 pieces in 20261017T173248Z, read on
  2026-10-18).
- `findPublished` (`frontend/index.js`) serves every lighting file whose
  name ends `.webp/.png/.jpe?g/.ktx2/.bin` from beside the manifest: a new
  file type must be added to that pattern ([publishing.md](publishing.md)).

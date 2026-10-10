# Third-party assets and code

What the app is drawn with that it did not make itself, where each came
from and under what licence — for review. The cars and the avatars are
listed in the README; this is everything added for the Kosinožići Villas
space (`scripts/spaces/ladonia/`, an earlier draft in `scripts/spaces/kosinozici.js`) and its landscape,
and the people set round a property.

## Textures — Poly Haven (CC0)

Photographed PBR materials, each its colour, OpenGL normal and packed
AO/roughness/metalness (`arm`) maps, fetched and turned into WebP by
`npm run site-assets` (`scripts/fetch-site-assets.mjs`) into
`public/textures/pbr/<id>/`. Licence: [CC0](https://polyhaven.com/license).

| Id | Used for | Source |
| --- | --- | --- |
| beige_wall_001 | the villas' sand and ochre renders (`render_sand`, `render_ochre`) | https://polyhaven.com/a/beige_wall_001 |
| castle_wall_slates | the dry-stone walls (`dry_stone`) | https://polyhaven.com/a/castle_wall_slates |
| rustic_stone_wall_02 | Ladonia's ledgestone cladding (`stone_cladding`) | https://polyhaven.com/a/rustic_stone_wall_02 |
| rust_coarse_01 | corten planters and building C's corten bands (`corten`, `corten_cladding`) | https://polyhaven.com/a/rust_coarse_01 |
| rectangular_paving | paths (`stone_paving_floor`) | https://polyhaven.com/a/rectangular_paving |
| asphalt_02 | road and parking (`asphalt`) | https://polyhaven.com/a/asphalt_02 |
| concrete_pavement | pavement and the roof terraces (`concrete_pavers`, `roof_pavers`) | https://polyhaven.com/a/concrete_pavement |
| wooden_planks | pool deck, pergola louvres and lattices (`hardwood_deck`) | https://polyhaven.com/a/wooden_planks |
| concrete_floor_01 | steps, copings, kerbs and the terraces' large pale slabs (`concrete_steps`, `stone_paving`) | https://polyhaven.com/a/concrete_floor_01 |
| rounded_square_tiled_wall | pool mosaic (`pool_mosaic`) | https://polyhaven.com/a/rounded_square_tiled_wall |
| granite_tile_04 | fetched for pale stone terraces; no finish uses it at present | https://polyhaven.com/a/granite_tile_04 |
| gravel_floor_02 | road verges (`terrain_gravel`) | https://polyhaven.com/a/gravel_floor_02 |
| forest_leaves_02 | the woods' floor (`terrain_forest`) | https://polyhaven.com/a/forest_leaves_02 |
| aerial_grass_rock | the far hillsides (`terrain_hillside`) | https://polyhaven.com/a/aerial_grass_rock |

## Textures — ambientCG (CC0)

| Id | Used for | Source |
| --- | --- | --- |
| Grass001 | lawns (`terrain_lawn`) | https://ambientcg.com/view?id=Grass001 |
| Grass004 | meadows (`terrain_meadow`) | https://ambientcg.com/view?id=Grass004 |

Fetched by the same script into `public/textures/pbr/acg_grass001/` and
`acg_grass004/`. Licence: [CC0](https://docs.ambientcg.com/license/).

## Skies — Poly Haven HDRIs (CC0)

Each its 1k HDR (the image-based light) and its tone-mapped picture,
cropped to the sky (the background), in `public/textures/sky/`, fetched by
`npm run site-assets`.

| Id | Used for | Source |
| --- | --- | --- |
| kloofendal_48d_partly_cloudy_puresky | day (Greg Zaal, sky edits Jarod Guest) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| qwantani_dusk_2_puresky | dusk and night | https://polyhaven.com/a/qwantani_dusk_2_puresky |

## Trees — ez-tree (MIT)

[ez-tree](https://github.com/dgreenheck/ez-tree) by Dan Greenheck, MIT
licence. The trees and shrubs in `public/models/vegetation/` were grown
with it (`scripts/trees/`: its presets, with the seeds and changes in
`scripts/trees/species.js` — the olives are its Oak Small, reworked). The
bark and leaf textures in `public/textures/trees/` are ez-tree's own,
carried in its package and taken out of it by `npm run trees -- --textures`;
ez-tree is published under MIT, but where its textures were originally
photographed is not stated in the package — worth checking with its author
before relying on them commercially.

## People — Mixamo (Adobe)

The people set round a property — standing with a drink on a terrace,
sitting on the sofas and chairs, lying on the pool loungers
(`frontend/Experience/World/People.js`) — are characters and animation
clips from [Mixamo](https://www.mixamo.com), Adobe's library, downloaded
there with an Adobe account. As listed in
`public/models/people/index.json`:

| | |
| --- | --- |
| Characters (12) | Brian, Bryce, Elizabeth, Josh, Kate, Leonard, Lewis, Martha, Megan, Remy, Shannon, Sophie |
| Clips, standing (8) | Agreeing, Drinking, Happy Idle, Laughing, Standing Idle, Talking, Talking Funny, Talking Question |
| Clips, sitting (6) | Sitting Drinking, Sitting Idle, Sitting Laughing, Sitting Talking, Sitting Reclined Male, Sitting Reclining Female |
| Clips, lying (3) | Laying Hands Behind Head, Laying Idle, Laying Propped Female |

(Four of the clips are a single pose, one frame long: Sitting Reclined
Male, Sitting Reclining Female, Laying Hands Behind Head and Laying
Propped Female.)

Licence: Adobe's terms for Mixamo (its FAQ, and Adobe's General Terms of
Use) — the characters and animations are royalty-free to use in projects;
the raw files are not to be redistributed. So:

- the downloads, FBX files in `assets/people/characters/` and
  `assets/people/animations/`, are git-ignored (`assets/people/**/*.fbx`)
  and never served;
- the converted characters, `clips.glb` and `index.json` in
  `public/models/people/` are git-ignored too (this repository is public):
  they are served by the app where it runs, not handed on from here. The
  stand-ins and the props, which are not Mixamo's, are tracked;
- what the app ships is made from them by `npm run people`
  (`blender/import_people.py`, then `scripts/optimize-people.mjs`), in
  `public/models/people/`: a character a `<id>.glb`, brought to the one
  skeleton in metres, its textures cut to 1024 px (normal maps 512) as
  WebP, its morph targets gone, meshopt-compressed; `clips.glb`, every
  clip on that skeleton, keeping each bone's turn and only the hips'
  place; and `index.json`, the list of them with what was measured of
  each.

This summary of the terms is ours, not Adobe's wording, and was not
checked against the terms as they stand today — worth reading them before
relying on the people commercially, and before putting the converted GLBs
in a repository anyone can clone.

Without them the app falls back to stand-ins made from its own two avatars
(`index.standin.json`, `standin-*.glb`, `clips.standin.glb`; the avatars
are credited in the README).

## Props — made here

What the people hold or have beside them — red and white wine, a
champagne flute, a tumbler, a beer, a coffee, a folded towel, a book
closed and open, sunglasses — is not bought in. Each is built from
primitives in Blender at real size (`blender/lib/props.py`) and exported
by `npm run props` (`blender/export_props.py`) to
`public/models/people/props.glb`. Nothing to credit.

## Code (npm)

| Package | Version | Licence | Used for |
| --- | --- | --- | --- |
| [n8ao](https://github.com/N8python/n8ao) | 1.10.1 | ISC | ambient occlusion (`frontend/Experience/PostProcessing.js`) |
| [postprocessing](https://github.com/pmndrs/postprocessing) | 6.35.6 | Zlib | required by n8ao (only its `Pass` is bundled) |
| three.js addons (EffectComposer, UnrealBloomPass, OutputPass, RGBELoader) | 0.163 | MIT | already a dependency |

ez-tree itself is not a dependency of the app — it needs three r167+ — and
is only loaded, from jsDelivr, by the generator page in `scripts/trees/`.

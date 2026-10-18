# Assets: textures, skies, trees, cars

Whose licence, and where each asset is listed: CLAUDE.md, the standing
terms (any source whose licence the user accepts, CC0 or MIT preferred,
each listed with source and licence in `assets/THIRD_PARTY.md`).
Textures and skies are CC0; the cars are CC-BY-NC/-SA; the people are
Mixamo's, to use but not to pass on. Large originals go in `assets/`,
never `public/` (deployed).

- Textures and skies: Poly Haven (`api.polyhaven.com/assets?t=textures`,
  thumbnails `cdn.polyhaven.com/asset_img/thumbs/<id>.png?width=200`; files
  `api.polyhaven.com/files/<id>`; urllib needs a User-Agent) and ambientCG
  (`ambientcg.com/get?file=<id>_2K-JPG.zip`). To add one: put its id in
  `TEXTURES` (Poly Haven), `AMBIENTCG` or `SKIES` in
  `scripts/fetch-site-assets.mjs`, run `npm run site-assets` (fetched and
  WebP-converted into `public/textures/pbr/<id>/`), add its finish in
  `shared/catalog.js` with `pbr(id)` and a `tint`, list it in
  `assets/THIRD_PARTY.md`, `npm run build` and restart the test server.
  Choose from a thumbnail montage; measure a texture's mean colour
  (`sharp(f).stats()`) before tinting. Tints that matched Ladonia are in `shared/catalog.js`
  (sand render, ochre render, ledgestone, dry stone, corten — corten needs
  blue boosted, its texture's mean is (98, 58, 31)).
- Skies that worked: day `kloofendal_48d_partly_cloudy_puresky`, dusk
  `qwantani_dusk_2_puresky`.
- Trees: ez-tree (`scripts/trees/`, grown in the browser, packed by
  `npm run trees`). Big scanned plants are millions of triangles: no.
- Prefer greener grass textures (ambientCG Grass001/004).
- Furniture, fittings: Blender (`furnishing.md`). Cars: below. People:
  Mixamo characters and clips, through the user's sign-in
  (`../space-people/SKILL.md`); what they hold is built in Blender
  (`blender/lib/props.py`).

## Cars

- A downloaded car goes in `assets/cars/` (never `public/`, which is
  deployed), listed in `assets/cars/cars.json`
  (`{ id, name, file, scale | length, forward }`), then
  `npm run models -- --cars <id>` and `npm run build`; a space uses it as
  `vehicles[].model` (`spec-fields.md`, Vehicles). Record author and
  licence in README and `assets/THIRD_PARTY.md`. For an exact likeness of
  a branded object, offer a sourced model early rather than iterating a
  hand-built one.
- Spin every imported car's wheels: steered-pose fronts wobble and separate
  tread blocks stay on the body.
- Getting in, driving and driving from above are the visitor's:
  `../visitor-interactions/driving.md`. Driving from above needs a car and a
  terrain or ground plane in the space (`walkable.md`, item 6).

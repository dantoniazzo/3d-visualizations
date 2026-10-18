# Blender

How the furniture is built and exported. The builders themselves are
`blender-builders.md`; what a piece carries for the app (parts that open,
water anchors) is `furniture-data.md`. The bake's own Blender scripts are
`../publish-and-bake/baking.md` (they rely on the same path and 5.1 API
notes below).

- 5.1 API: the compositor is `scene.compositing_node_group`; Denoise
  options are input sockets; `pack_islands` needs
  `tool_settings.use_uv_select_sync = True`; export with
  `export_vertex_color="NONE"`, `export_all_vertex_colors=False`; GLTFLoader
  lowercases custom attributes. Blender (x, y, z) is the app's (x, z, −y).
- Blender isn't on PATH on this Mac:
  `/Applications/Blender.app/Contents/MacOS/Blender --background --python …`
  (the npm scripts find it themselves, `scripts/lib/blender.mjs`). Its own
  Python, which has numpy, is
  `/Applications/Blender.app/Contents/Resources/5.1/python/bin/python3.13`
  (`checks/part-sweep.py` needs it).
- Guard lib modules with `if __name__ == "__main__"`; keep preview runs
  export-free. `__pycache__/` and `*.pyc` are untracked and gitignored:
  Blender's rewrites need nothing; never force-add them.
- When changing a shared joinery helper for one piece, pass the change as a
  parameter and diff triangle counts per GLB node before and after: one
  "small" handle change altered every handle in the house.
- Materials (`lib/materials.py`). `plain`, `glass` and `emissive` are flat
  colours, given `linear()`. The other recipes bake a tiling image on
  export (`export_app.bake_tiling_textures`, with the generators in
  `lib/bake.py`), laid on world box UVs at `tile` metres a repeat. Their
  colours are given `srgb()`, as they should look. Besides `planks` and
  `tiles`, pick the recipe by what the surface is:
  - `veneer` → `grain`: wood (oak, walnut, teak), and opaque cloth with a
    straight slub (`curtain_caramel`);
  - `speckled` → `terrazzo`: stone — the terrazzo and quartzite tops,
    granite, marble. On upholstery it reads as stone chips: the `boucle_*`
    finishes, no longer used;
  - `nubbly`: bouclé and fine basket weave (`weave_oat`, `weave_cream`);
  - `heather`: heathered felt and wool, short fibres over a mottled ground
    (`felt_fleck`, `felt_sage`, the headboards);
  - `twill`: fine diagonal ribs, for cloth on a flat panel (`linen_panel`,
    the wardrobe doors);
  - `sheer(…, weave=…)` → `linen`: see-through curtain cloth, blended and
    two-sided (`curtain_linen`);
  - `noisy` → `carpet` (scale ≥ 60) or `mottle`: linens, rugs, plaster.

  `_two_sided(mat)` turns backface culling off, for a single sheet seen
  from both sides such as an opaque curtain; glass and sheers are
  two-sided already. The export scales each baked image so that its mean
  is the material's flat colour (`flat_color`). A pattern therefore adds
  texture, never tone: to fix a tone, change the colours, not the
  pattern's contrast.
- A baked pattern's colours (`veneer`, `speckled`, `noisy`) reach the app as
  sRGB, a `plain` one's as linear: give the former as they should look, or
  oak comes out mahogany.
- `blender/lib/bake.py`'s `_rng` seeds each texture with Python's
  per-process `hash()`, so every re-export reshuffles the veneer and
  terrazzo patterns and a GLB is not byte-identical to the last: to compare
  shut looks before and after a change, flatten the textures to their mean
  (a `zlib.crc32` seed would make exports reproducible).
- A Blender sheet is not the app's colour. `thumbs.py` renders with AgX
  under a flat grey world. The app uses ACES (or AgX plus the grade at
  steps 2–4), with rooms under the warm indoor share at exposure 2.2. The
  same material reads darker and more saturated in the app: felt, the
  caramel curtains, mustard fronts. Judge a colour in an in-app frame
  beside its reference at a fixed slider step, then change the material.
  A sheet shows shape only. (Tone mapping per space:
  `../baked-view-lighting/tone-ao-colour.md`.)
- Keep paint and lacquer below 0.5 metalness: the app gives a reflection
  room only to metals (metalness ≥ 0.5, roughness < 0.6) and clear glass,
  and paint at 0.5+ turns studio-silver
  (`../walkthrough-editor/three-pitfalls.md`).

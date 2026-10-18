# Finishes and their texture generators

The finishes are shared by every space (`shared/catalog.js`), and their
canvas generators are world building code
(`../walkthrough-editor/SKILL.md`, finishes). The rule for a space: never
retune a finish or generator default another space uses; add a
space-specific finish or an opt-in option (`buildings.md`). Photographed
finishes and their tints: `assets.md`.

- The canvas generators in `World/Builders/TextureLibrary.js`
  (`GENERATORS`: `planks`, `herringbone`, `plaster`, `terrazzo`, …) draw
  every generated finish in `shared/catalog.js`, for every space. A change
  to a generator or to its defaults redraws every finish that uses it.
  Instead, add a param that defaults to the old drawing and set it only
  on your own finish, as Ladonia added `planks`' `vertical` (boards on
  end, `oak_cladding`) and `cover`, and `plaster`'s `soft`. Then compare
  another space's frames before and after (`verifying.md`, other spaces).
- `planks` lays two boards a row, each row shifted by `stagger` × its row
  number of the tile's width (wrapped). Where the shift passes a board's
  length, half the tile (as some rows do at 0.37), the start of the row is
  left bare and the gap colour shows there as a dark block. `cover: true`
  lays one more board there. It is set on `oak_honey` only, so
  `oak_parquet`, also at 0.37, is drawn as before.
- Every generator must tile. Anything drawn within reach of an edge is
  drawn again across it (terrazzo's `wraps`, for its mottle and every
  chip), or a seam of cut-off chips shows at every repeat. The Blender
  bake generators tile by indexing pixels modulo the image size
  (`lib/bake.py`), with any period a divisor of 512.
- A canvas radial gradient fading to `rgba(0,0,0,0)` fades through black:
  fade in the patch's own colour (the plaster generator's `soft`).
- In a baked view a material keeps its finish texture only if its name is
  exactly a catalogue finish id (`../baked-view-lighting/baked-drawing.md`).
- A new room finish must match Sky.js's `ROOM` pattern by one of its
  prefixes (`limewash_`, `paint_`, `oak_`, …); a balustrade's glass must
  not match `GLASS` (`light-and-look.md`).

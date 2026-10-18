# No flicker (z-fighting)

The layering is the world's building code (`MaterialLibrary`'s `layer()`,
`getTrim` / `getTrimFront` / `getTrimBehind`, `FurnitureLibrary`'s
`layerFlushFaces`, `userData.polygonOffset` carried by the runtime file and
the baked view): `../walkthrough-editor/SKILL.md`. This is what a space
must do with it.

Depth precision: two surfaces `gap` apart fight beyond d ≈ √(gap · near ·
2²⁴). With the camera's near plane at 0.05 (not 0.01), 1 mm fights from
29 m and 1 cm from 92 m — so a centimetre apart is enough indoors.

- **Layer what shares a plane** (`layer(material, FRONT)` or
  `layer(material, BEHIND)`, named exports of
  `World/Builders/MaterialLibrary.js`): frames and glass in front (by name,
  `getTrim`); door linings in front (`getTrimFront`); walls' ends, tops and reveals, thresholds,
  risers and soffits behind (`getTrimBehind`); terrain behind paving; road
  paint in front; floors none (a rug 1 cm over a floor-in-front reads under
  it); in furniture, screens, glass, hobs and handles in front and grooves,
  gaps and plinths behind (`FurnitureLibrary` `layerFlushFaces`). Never
  layer a whole kind behind by default: a trim used as a decal (road paint,
  a neighbour's window, skirting) then sinks into its surface at a
  distance. The runtime file and the baked view's own materials carry the
  layering (`userData.polygonOffset`).
- **Fix real overlaps geometrically**: partitions 2 cm under the floor
  above; walls ending at the centreline of the wall they meet; stairwell
  edges 1 cm inside the wall beside them (their linings are drawn in the
  wall's face otherwise); showers 1 cm off their walls; paving short of
  glazing sills; planters short of parapets; landscape walls meeting at
  corners without overlapping; joinery parts overlapping 1–2 mm.
- **Find it**: `checks/zfight-check.mjs` (static, models the layering by
  hand) and `zfight.js` in the page
  (`../app-testing-and-performance/zfight.js`; reads the real offsets;
  ~10 s over 1.2M triangles; how it treats an editor tab: SKILL.md, tools).
  Ladonia: 1502 clusters → 214, the rest hidden faces (furniture
  undersides, kitchen backs against walls). Identify any odd patch by
  casting a ray through its pixel and reading the object's name
  (`in-page-audits.md`, What is that patch?).
- In a model, coplanar overlapping faces of different parts are found by
  `models/coplanar.py` before export (`models/README.md`).

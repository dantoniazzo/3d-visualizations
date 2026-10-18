# The landscape

The method first, then the schema as the builders read it. Ladonia's values
are examples; how its site is assembled in `index.js` is `site.md`.

## The method

`spec.landscape` (`shared/landscape.js`, schema below) replaces
the Fluffy Tree garden: terrain, dry-stone walls, kerbs, markings,
pergolas, corten planters, glass railings, pools, hedges, lawns, trees,
forest and shrub scatter, meadows, lights, sky. Built by
`World/Builders/LandscapeBuilder.js` (static, part of the house) and
`World/Flora/` (live). Switch the default garden off explicitly, each key
as its own object: `garden: { hills: { enabled: false }, tufts: { enabled:
false }, trees: { enabled: false }, blades: { enabled: false },
neighbourhood: { enabled: false } }`.

- A path or paving slab is a collidable floor sheet: it stops at the top
  step of a flight, or it is a lid the walker hits ("a piece of the entrance
  over the steps"). Landscape walls run on half their thickness past their
  ends: end them inside what they meet (a flight's cheeks). Steps are solid
  and fill their opening (2.58 m in a 2.6 m hole).
- Terrain sits 3–5 cm under paving (pads −0.03 / −0.05); holes under
  flights and pools. A level change between plots is a hard pad plus a wall
  (`rw-ac`).
- A pool one swims in needs a way in and out: `steps` (the pools entry
  below) on the side by the loungers — treads of the pool's mosaic walked
  on an unseen ramp, as a flight is. A scene seeded before them is given
  them with `../visitor-interactions/patch-pool-steps.mjs` (always with
  `--backup`: `scene-safety.md`), never a reseed. Swimming and the steps
  as the visitor meets them: `../visitor-interactions/swimming.md`;
  the water's look: `../visitor-interactions/pool-water.md` (keep its
  roughness over 0.1).
- Pergola louvres stay about half open — the builder draws aluminium blades
  at 0.17 pitch tilted 0.72 rad, timber slats (`louvres: "timber"`,
  Ladonia's) at 0.22 pitch tilted 0.95 rad: nearly shut blades lose the
  stripe shadows that sign a terrace render.
- Hedges: each spray red or green by `red` (never a lerp, which reads
  brown); `red: 0` is a green laurel. Photinia only where the renders show
  it. Trees in roof planters need `elevation`.
- Roads: stop a side road's lines short of the main road (Ladonia's lane:
  0.4 m) and dashes short of junctions so they don't overlap; split kerbs
  at a lane's mouth; terrain pads must cover a road's full length.
- Grass: a mown lawn is a turf tile plus shell layers near the visitor, not
  more blades, and no mowing stripes (the user had them removed). When the
  user names a reference (fluffytree-threejs), copy it exactly — measure its
  own assets and densities instead of improving them.
- Garden lights (`lights` below) are off by day; how their units match the
  bake's, and what shows of them by day:
  `../walkthrough-editor/lights-and-fittings.md`.
- What the public view makes of a landscape:
  - Publishing drops faces no sampled viewpoint sees: landscape a visitor
    can walk round needs `mesh.userData.keepWhole = true` (LandscapeBuilder
    sets it), and anything new drawn by a shader of its own must carry its
    data into the publish (`../publish-and-bake/publishing.md`).
  - A landscape's own trees (World/Flora) are in no lightmap unless added
    to `scripts/bake-public.mjs`'s settings; before a final bake of a
    `spec.landscape` site, add its landscape walls, planters and terrain to
    the bake's `solids` and `coarseMaterials` and compare `[bake] house
    texels` before and after (`../publish-and-bake/baking.md`).
  - How far trees are drawn whole, lit or as impostors at each slider step
    (`QUALITY.flora.reach`): `../baked-view-lighting/SKILL.md`. Grass looks
    up its baked light on the ground nearest in height (`Vegetation.js`
    `groundUv`; Wrenfield's took the neighbourhood's field below its lawn
    until then): same file.
  - A larger site widens the sun's shadow frustum: `light-and-look.md`.

## The schema, as the builders read it

The schema is in `shared/landscape.js`. Static parts are built by `World/Builders/LandscapeBuilder.js`; live parts by `World/Flora`.

```
sky       { day, dusk, turn, elevation }
terrain   { size = 400, centre = [0, 0], base,
            detail: { centre, half, step = 1, outer = 6 },        // default { [0,0], 80, 1, 6 }
            slopes: [{ origin, dir, rise (per m), max, ease }],
            hills:  [{ at, radius, height }],
            noise:  { amplitude, scale, seed },
            pads:   [{ polygon, height, margin = 0 }],
            holes:  [polygon],
            paint:  [{ ground: lawn|meadow|gravel|forest|hillside, polygon, margin = 1, noise, strength = 1 }] }
walls     [{ path, base, top, thickness, finish = "dry_stone", slope?: [top0, top1], coping?: false }]
kerbs     [{ path, base, height, width }]
markings  [{ from, to, width, dash?: [on, off], base }]
pergolas  [{ box: [x0, z0, x1, z1], base, height, slats: "x"|"z", posts?: "all"|"corners",
             against?: ["x0"|"x1"|"z0"|"z1"], span = 4.2, frame = "frame_anthracite",
             louvres?: "timber", louvreTrim?, screens?: ["x-", "x+", "z-", "z+"] }]
planters  [{ path, base, height, width }]
railings  [{ points: [[x, z, y], ...], height }]
pools     [{ box, level, depth, deck?: box, steps?: { side: "x0"|"x1"|"z0"|"z1", count, going = 0.35 } }]
hedges    [{ path, base = 0, height, width, red = 1 }]
lawns     [{ polygon }]
grassBeds [{ polygon }]
trees     [{ species, position: [x, z], scale = 1, yaw = 0, elevation? }]
forest, shrubs [{ polygon, spacing = 8, species: { name: weight }, clearings, scale?: [lo, hi] }]
meadow    [{ polygon }]                    // `density` is not read: grass.js fixes it (4.5 clumps/m², 2 on low power)
lights    [{ type: "uplight"|"downlight"|"step", position: [x, y, z], target?: [x, y, z] }]
```

The header in `shared/landscape.js` says pergolas take `wall`, but the builder reads `against`. The header also leaves out `grassBeds`, which Flora does read.

**sky**
- `day` and `dusk` are Poly Haven ids under `public/textures/sky/`.
- `turn` rotates the sky and sun about the upright, in degrees.
- `elevation` sets only the day sun's height, in degrees.

**terrain**
- A hard pad (`margin: 0`) gets grid lines at its edges ±1 cm, so a step stays a sharp step. An eased pad adds z lines only.
- Holes remove grid cells.
- Unpainted ground is meadow.
- The terrain material sits behind (polygon offset) the paving, roads and lawn edges.
- Known: a hairline crack shows along the edge of Ladonia's 1 m terrain grid (x 76, z 78 / −62), found 2026-10-17 and left (`history.md`).

**walls**
- With `slope`, `top0` is the height at the path's first point and `top1` at its last; points in between are at `top`.
- Each piece runs on `thickness / 2` past its end, and the first piece also past its start. The next piece starts that far beyond the corner, so no two pieces share a face. A wall's end therefore pokes half its thickness past the point you give: end it inside whatever it meets.
- The coping is a 6 cm `concrete_steps` slab, thickness + 6 cm wide, following the top. Set `coping: false` for dry-laid walls and screens.
- `finish` can be any wall finish.

**kerbs** run from `base − 0.1` to `base + height` in `concrete_steps`.

**markings** are drawn at `base + 0.006` and layered in front.

**pergolas**
- Posts are 0.12, and the top beam is 0.22 deep.
- The `against` sides (default `"z0"`) are fixed to the house and get no posts. `posts: "all"` means free-standing with four corner posts. `"corners"` means no middle posts. Otherwise, a long free side gets middle posts no more than `span` apart.
- `slats: "z"` runs the blades along z; any other value runs them along x.
- Aluminium blades take `louvreTrim` (or the frame's trim), at 0.17 pitch, tilted 0.72 rad.
- `louvres: "timber"` gives `hardwood_deck` slats 0.15 × 0.03 at 0.22 pitch, tilted 0.95 rad.
- `screens` are timber lattice on a 0.14 grid, 6 cm in from the named side (`x-` is the x0 side, `z+` the z1 side).

**planters**
- Corten sides 12 mm thick. The ends run on `width / 2` past the path's ends.
- The soil sits 7 cm below the top.
- Grasses are grown live (`planterGrasses`), and LED strips light the long sides at dusk.
- Shrubs are separate `trees` entries with an `elevation`.

**railings**
- `glass_balustrade` glass from `y + 0.06` to `y + height`, with a 7 × 5 cm `frame_bronze` channel at the foot.
- Each point has its own y, so a railing can follow a flight, e.g. `[[14.85, 6.43, 0.0], [9.9, 6.43, 3.0]]`.

**pools**
- The basin rim is fixed at y 0.02, so pools only work at ground level 0.
- The water is at `level` and the floor at `level − depth`.
- The coping is 0.32 m of `stone_paving_floor`, overhanging 3 cm, with its top at 0.07.
- The `hardwood_deck` fills `deck` round the coping, with its top at 0.04.
- The box is cut out of the terrain automatically.
- The water (clear, no transmission: two passes over one quad, roughness
  0.12), how it is drawn from under it, the steps' layout, nosings and
  unseen ramp, and the depths at which a visitor wades and floats:
  `../visitor-interactions/swimming.md` (Pools as data) and
  `../visitor-interactions/pool-water.md`. In short, `steps: { side,
  count, going }` (since 2026-10-16) are straight steps the pool's full
  width, coming down from that side of `box`: `side` one of `x0`, `x1`,
  `z0`, `z1` (anything else becomes `z1`); `going` held to 0.2–0.6 m (0.35
  by default); `count` rounded and held to 1–12, and to no more than leaves
  half the pool's length to swim in; the treads rise evenly from the floor
  to the coping's top at 0.07. The layout is `shared/landscape.js`'s
  `poolSteps(pool)`, which the builder and `checks/zfight-check.mjs` both
  read. The ramp the steps are walked on must stay in a static collision
  root (the landscape's group). Ladonia's B pool: `{ side: "z1", count:
  5, going: 0.35 }`. A scene seeded before the steps gets them from
  `../visitor-interactions/patch-pool-steps.mjs`, never a reseed.

**hedges**
- These are photinia. `red` is the share of red tips; 0 gives a green laurel hedge.
- No lawn grows under a hedge.

**trees**
- A tree stands at the ground − 0.05 unless it has an absolute `elevation`.
- Within 70 m of the origin, trunks collide with the player; bushes don't.
- Species: `oak_1` to `oak_4`, `ash_1`, `olive_1` to `olive_3`, `bush_1`, `bush_3`.

**forest and shrubs**
- Trees are scattered on a jittered grid.
- They keep clear of rooms (+0.6 m), building walls (+0.8 m), pools, landscape walls and lawns.
- `scale` defaults to [0.8, 1.25] for forest and [0.7, 1.3] for shrubs.

**lights**
- All are off by day.
- An uplight is a spotlight at `position` aimed at `target`. A downlight is a point light 0.2 below `position`. A step light is a glowing fitting only.
- Roof parapets get LED strips automatically. A parapet here is a wall with reveal `coping_grey` or `coping_dark`, height ≤ 0.8 and `base_height` ≥ 2.5.

**Validation.** `sanitizeLandscape` checks shape only, so a new landscape field survives without a validator change. It clamps numbers to ±1e5 and drops non-finite ones, drops strings over 200 characters, keeps the first 5000 items of an array and the first 64 keys of an object, drops anything nested deeper than 8 or keyed outside `/^[A-Za-z_][\w-]{0,40}$/`, and stops after 400,000 values.

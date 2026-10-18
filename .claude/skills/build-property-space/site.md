# index.js: how the site is assembled

Ladonia's `scripts/spaces/ladonia/index.js`, as the code stands. Every value here is Ladonia's, an example to copy the pattern of, not a rule. The landscape schema it writes to is `landscape.md`; the numbers that worked across the generator are `numbers-that-worked.md`.

**Placement**
- `A_AT = [0, 0]`, `B_AT = [0, 24.2]` and `C_AT = [2.5, -21]` are absolute plan positions of each building's north-west corner.
- A and B stand at 0. `C_Y = STREET = -1.0`, so C stands at street level beside its lane.

**Street (x runs east)**
- The retaining wall's face is at `WALL_X = 20.2`.
- `PARKING [20.2, 25.2]` (asphalt; C's stretch is `concrete_pavers`) and `PAVEMENT [25.2, 27.2]` are at `STREET`.
- `ROAD [27.3, 34.3]` is at `ROAD_Y = -1.1`, with kerbs 0.12 high.
- The lane is at `LANE_Z [-33.4, -27.4]`, also at `ROAD_Y`.
- The plots span `PLOT_Z [-25.5, 44.7]`. C's plot meets A's at `AC_Z = -4.2`.

**Spec assembly**
- `rooms` are each building's rooms, plus the gardens' paving, plus `street()`.
- `walls`, `roofs`, `floor_openings` and `furniture` come from the buildings.
- `stairs` are the buildings' flights plus `stepFlights`.

**Gardens**
- `gardensAB(o, { pool })` and `gardensC(o)` write in site coordinates through `at(o, points)` and `box(o, [x0, z0, x1, z1])`, which add the building's x/z offset.
- Heights are explicit, with `C_Y + …` for C.
- Paving is a room `{ floor_finish: "stone_paving", ceiling_finish: "none", height: 0.05, elevation: 0.01 }`, or `C_Y + 0.01` for C.
  - Paving goes round a pool, never over it.
  - The path stops at the head of the steps, `WALL_X − 1.78`.
  - C's path is level with the parking: no wall, no steps.

**Steps** (`stepFlights`, at `STEPS` = each of A's and B's z + 7.5)
- `start: [WALL_X + 0.02, z]`, direction west (`yaw: -90`), `width: 2.58`, from `STREET` to 0.
- `run: 1.8`, `steps: 6`, `concrete_steps` with `concrete_grey` risers, no `style`.
- A terrain hole is cut at `rect(WALL_X − 1.78, z − 1.3, WALL_X + 0.3, z + 1.3)`.

**Retaining walls** (`retainingWalls()`)
- The runs are at `WALL_X − 0.22`, t 0.45, with base `STREET − 0.05`, top 0.02 and `coping: false`.
- They end 1.55 either side of each flight, so their half-thickness run-on lands inside the cheeks.
- Cheeks are at z ± 1.5, from `WALL_X` to `WALL_X − 2.6`, t 0.4, top 0.05. That leaves them a little proud of the wall.
- `rw-ac` runs across `AC_Z` with base `C_Y − 0.4`, top 0.55, t 0.55 and `slope: [0.25, 0.55]`.
- Rendered screens (`a3-screen`, `pool-screen`) use finish `render_sand` with `coping: false`.

**Hedges** (`frontHedges()`)
- They run at `WALL_X − 0.6`, 0.7 high, with `red: 0`, and are broken ±1.8 at each flight.

**Terrain pads.** A later pad wins. Each plot is eased first (`margin: 8`), then repeated hard (`margin: 0`) at the end, so neither eases into the other. The step between them is `rw-ac`.
- A/B: −0.03.
- C: `C_Y − 0.03`.
- Street: `STREET − 0.05`, hard.
- Road: `ROAD_Y − 0.05`.
- Lane: `ROAD_Y − 0.05`, margin 6.
- Verge: `ROAD_Y − 0.08`.

**Terrain holes** are the step flights plus the pools, each grown 1 cm.

**`planterShrubs(planters)`**
- Places `bush_1` and `bush_3` about every 1.6 m along each planter, at `elevation: base + height − 0.06`.

**Lights**
- An uplight per olive, offset (0.55, 0.45), at y 0.05, aimed 2.2 m up.
- Downlights at 2.6 under the ground pergolas.
- A `step` light on every other step of the outside stair.

**Spawns** are absolute `[x, y, z]`. y is 0, 3.0 or 6.0 for A/B, `C_Y`, `C_Y + 3.2` or `C_Y + 6.4` for C, and `ROAD_Y` for the street.

**Sky** is `{ day: "kloofendal_48d_partly_cloudy_puresky", dusk: "qwantani_dusk_2_puresky", turn: 19, elevation: 36 }`, with environment `exterior_mediterranean` and ground `none`.


# Numbers that worked (as in the code)

Ladonia's (`scripts/spaces/ladonia/`), accepted by the user or found by walking. A new space starts from them and measures its own.

**Storeys**
- A/B: `AB = { storey: 3.0, roof: 6.0, parapet: 0.45, box: 9.8 }`.
- C: `C = { storey: 3.2, band: [2.8, 3.65], roof: 6.4, top: 7.65, box: 9.6 }`.
- Rooms are `storey − 0.25` high (the slab). Rooms in the stone box are `box − roof − 0.3`.
- Pendants hang from 2.75 (A/B) or 2.95 (C) above their floor.

**Walls**
- Outside walls are 0.35 (`EXT`).
- Party walls are 0.2 (`PARTY`).
- The stone box is 0.3, with a 0.15 wall down its middle.
- A/B's roof parapets are 0.25 thick and 0.45 high, with reveal `coping_dark`.
- C's corten band is 0.37.
- Partitions are 0.12.

**Partitions and junctions**
- Any wall thinner than 0.3 is `H − 0.02` high, so it stops 2 cm under the floor above.
- A wall stays at full height `H` where it stands beside an open-air space.
- A partition starts at an outside wall's inner face (0.35) and ends at the centreline of the partition it meets.

**Doors and corridors**
- `MIN_DOOR` is 0.9. Inside doors are 2.1 high. Front doors are 2.3–2.74 high. Sliders are 2.45, or 2.4 in the box.
- Guest WC doors open outwards.
- Corridors are at least 0.9 between wall faces. The A/B upper north corridor is 0.95.

**Stairs.** Width is at least 0.9. For each flight (going = run / steps):

| flight | width | steps | going | rise | pitch |
|---|---|---|---|---|---|
| street steps | 2.58 | 6 | 0.30 | 0.167 | 29° |
| A/B outside stair (`slab`) | 1.15 | 16 | 0.31 | 0.188 | 31° |
| A/B flats' stairs (`slab`) | 1.05 / 0.95 | 15 | 0.25 | 0.20 | 39° |
| C common stair (`slab`) | 1.1 | 17 | 0.22 | 0.188 | 40° |
| C flats' stairs | 0.9 | 17 | 0.23 | 0.188 | 39° |

- Where a flight climbs over a bathroom, a knee wall 1.65 high closes the space underneath.
- A stairwell's edge along a wall sits 1 cm into the wall's thickness, e.g. z 7.58 against a wall face at 7.59.
- The landing rail's channel sits 2 cm under the paving: y 2.98, height 1.02.

**Site levels**
- The street is 1 m below the gardens (`STREET` −1.0). The road is 0.1 m lower again (`ROAD_Y` −1.1), behind a 0.12 kerb.
- Terrain pads sit 3–5 cm under the paving: −0.03 under garden paving at +0.01, and 5 cm under the street slabs.
- The retaining wall's top is at 0.02, the cheeks' at 0.05.
- The steps' terrain hole is 2.6 wide for a 2.58 flight.

**Pergolas**
- Ground pergolas are 2.75 high (pendants from 2.7) and use `slats: "x"` with `against`.
- Roof pergolas are 2.45 high on the roof (pendants from roof + 2.46, see `hang`) and use `slats: "z"`, `posts: "all"` and `screens`.
- All use `frame: "alu_anthracite"` and `louvres: "timber"`.

**Clearances**
- Glazing sills are 0.02.
- Showers sit 1 cm off their walls.
- Planters stop 5 cm short of the parapet's inner face. A/B planters are 0.9 wide and 0.55 high. C's are 1.05 wide and 1.05 high, raised so they show over the tall corten parapet.

**Sizes that read right for new pieces** (accepted by the user): 3-seat sofa 2.10 × 0.78 × 0.92; dining chair seat 0.46, back 0.88; bar stool 0.77; table tops — dining 0.76, coffee 0.40, side 0.55, console 0.80; handrails 0.9 above the nosings, landing rails 0.95.

**Furnishing gaps used in the code**
- Coffee table 0.35–0.4 before the sofa's seat, with 0.8 left past it.
- Tables 0.75 off walls with doors in them and 0.95 clear of a kitchen front.
- About a metre clear in front of a counter.
- A sofa's back 0.9 off a slider.


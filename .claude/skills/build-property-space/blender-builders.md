# The Blender builders (`blender/lib/ladonia.py`)

The GLB side of features other skills own: the opening fronts (Kitchens, the wardrobe, nightstand, media wall, joinery's doors and washer below) are what `../visitor-interactions/opening-parts.md` opens; the water anchors (the wet pieces below) are what `../visitor-interactions/water.md` runs; the lights in pieces (the wall light, tracks, pendants, `ld-cabinet`) are what `../walkthrough-editor/lights-and-fittings.md` switches; the television's glass is what `../visitor-interactions/sitting-and-tv.md` reads from `screens.json`. How to build and export: `blender.md`; what a piece carries: `furniture-data.md`.

The `ld-` pieces' builders, worth copying into the next project's `blender/lib/<project>.py`. Each takes `(col, mats, …)` and returns its parts. Each is centred on the origin, stands on z = 0 and has its front towards +Y, which the app turns to face north at rotation 0. The registrations in `export_furniture.py` show the parameters each catalogue id was built with.

**Soft furnishings**
- `_pillow(name, size, loc, col, mat, rot, r, puff, crease, cuts, seed, sag, flare, folds, axis, bend)`: a rounded box fattened across `axis` (by default its thinnest), with an optional sagging top, creases, flared foot, loose-cover folds and bend. Used for seat and back cushions, sofa frames and arms, the pouf and the lounge chair's cushions.
- `_lean(foot, h, a)`: the middle of a cushion `h` tall standing on `foot` and leaning back by `a`. Pass `rot=(a, 0, yaw)` with a positive `a`, which tips the top to −Y (the back).
- `_case_pillow(name, w, h, t, loc, col, mat, rot, flange, stripes, stripe_mat, seed, crease, pull, grid=22, profile="slab")`: a throw cushion as one closed shell, lens-shaped in section. `profile="dome"` thins steadily from the middle to the seam (about 80 % of `t` at half width): the sofas' cushions. `"slab"` stays full almost to the edge.
- `_bed_pillow(name, w, h, t, x, y, z, lean, col, mat, flange, stripes, stripe_mat, seed, take, sag, flop, crinkle, grid, yaw, sink, behind, rest)`: a bed pillow.
  - Shape: a lens with no flat middle, eared corners, a top that sags and flops back, fine crumples, shaded smooth throughout.
  - Placing: it stands on its bottom edge at (x, y, z), leaned back by `lean`. Its foot sinks `sink` into `rest` (the mattress), and wherever it would cross into one of `behind` it is pushed forward onto it.
- `_rest(obj, behind, d, tol=0.005, reach=(-0.25, 0.3))`: slides a placed cushion along `d` (away from what it leans on) until it touches `behind`, pressing in no more than `tol`.
- `bed(w=1.80, l=2.00, single=False, throw, lining, sham, duvet)`: a bed without its headboard, its head at −Y. The mattress top is at 0.50, on a platform 4 cm bigger. The duvet is turned down 0.66 m from the head, with a runner over it. Each side has a Euro sham, a white pillow with three olive lines and a sand cushion (one set, centred, on a single).
- `headboard(w=2.10, h=0.50, t=0.04, panels=2, felt="felt_fleck")`: felt panels butt-joined; a `wall` piece, hung at y + 0.55.
- `curtain(w=1.6, h=2.74, mat="curtain_linen", depth=None, folds=None, heading="ripple")`: one two-sided sheet hanging from a track in the ceiling.
  - `"ripple"`: S-folds every 10.5 cm, 0.13 deep. Each fold is sampled 16 times, because fewer reads as a zigzag.
  - `"pinch"`: pleats every 13 cm, 0.09 deep, over soft folds.
  - A narrow `w` with `depth` and `folds=6` is a curtain stacked open (`ld-sheer-05`, `ld-curtain-caramel-06`).

**Seating and tables**
- `sofa(w=2.50, chaise=None, style="linen", d=None, chaise_len=1.65, cw=0.95)`:
  - `style` picks from `SOFAS`: `"linen"` (slip-covered) or `"boucle"`.
  - `chaise` `"left"` or `"right"` (−X or +X) pulls that end forward `chaise_len`, `cw` wide with its arm (0.8 for C's narrow chaise). `d` overrides the style's depth.
  - The back cushions lean back 0.22 rad. The throw cushions lean back 0.40 rad and are settled against them with `_rest`.
- `sofa_corner(w=2.36, ret=2.30, depth=0.96, style="linen", ret_seats=1)`: backs on two walls. The run goes along X with its back at −Y; the return, at −X, comes forward to +Y. Only this hand is built (`-corner-l`, `-corner-s-l`).
- `dining_table(w=2.00, d=0.95, wood="oak_pale", base=0.55)`: a top at 0.75 with 0.15 m corners, on oak slabs; the cross slabs stand `base` of the length apart. The 1.4 m four-seater uses 0.9, which puts them beyond its tucked chairs.
- `round_table(r=0.525, top, base, h=0.75, t=0.06, drum=0.225)`: a bullnosed top on a drum. It is also the garden table (`outdoor_green`).
- `coffee_round(r=0.30, h=0.40, mat)`: a low drum table.
- `pouf(w=0.38, h=0.42, fabric="linen_ecru")`: square and soft, with a flat base.
- `stump(r, h, sphere)`: the teak drum with an armillary sphere.

**Kitchens.** All stand against y = 0 facing +Y: a worktop at 0.92 (`K_TOP`), units 0.6 deep (`K_D`), tall units to 2.74 (`FULL`). Since 2026-10-16 every front opens (no longer `_fixed`):
- Carcasses are hollow (`_carcass`, `_board`): white inside, their front edges, rails and tall tops in the old carcass colour, so a kitchen shut looks as before. A shelf in each cupboard (`_shelves`, `_carcass_shelves`).
- Doors hang 90° (`K_SWING`) about the outer corner of their face (`_hang`), so an open door stands in front of its own cupboard and meets no wall, neighbour's front or neighbour's open door, on either hand. Hands follow `_hands` / `_tall_hand` / `_sides_of` / `_run_stops`: away from what a run ends against (each builder's `walls` — ends against a wall or another piece; tall units; the other leg), pairs from the middle where free, and a lone column on its free side, so a fridge opens away from the worktop.
- Drawers (`_drawer`) run on white trays and come out ¾ of `K_TRAY`; a fridge drawer is an insulated tub.
- Shut: the dishwasher, the ovens, blind corners, fillers, the sage hob cabinet's flaps (`_uppers(…, shut=True)`), and a tall door another unit stands across (`_tall(shut=)`).
- The fridge (`_fridge`: liner, glass shelves, crisper, the light aimed as joinery.fridge has it, the door with its seal and bins): the first `"fridge_col"` (a column whose lowest door is an integrated fridge); else a base `"fridge"` beside the sink; else `"fridge_drawers"` (C4/C5's `ld-counter-sage-low-24` and `-r`: the two deep drawers beside the sink, a cutlery drawer over them). All labelled `"fridge"`. No column is cut low for a freezer.
- Tall kinds `"column"`, `"oven_col"`, `"fridge_col"`; base kinds add `"fridge"`, `"fridge_drawers"` and `"corner"`. `_tall(…, hand, fridge, shut)`, `_base_units(…, stops)`, `_wall_units` / `_uppers(…, stops)`.
- The U kitchens have two corner fillers (3 cm between the oven column and the fridge, about 5.5 cm at the back leg's north end): without them the fridge door met the back leg's worktop overhang and the back leg's drawers the oven column's front.
- `kitchen(length, scheme="ochre", tall=1, tall_side=-1, uppers=True, shelves=None, walls=…)`: the generic run, with `tall` columns at its own left (−X), or at its right with `tall_side` +1. `tall=0, uppers=False` gives a counter.
- `_sage_run(L, mods, hob, cab, niche, shelves, hand=-1, walls=…)` and `_ochre_run(L, mods, hob, hood, niche, walls=…)` lay out a run to a plan. Use them for any new plan's kitchen.
  - `mods` is a list of (kind, width) from the run's own left: `oven_col` (sage), `column`, `shelfbase`, or a base kind (`door`, `drawers`, `sink`, `dishwasher`, `oven`, `filler`).
  - The other arguments are spans measured the same way. `hob` is (u0, u1, w). `cab` is sage's deep cabinet over the hob. `hood` and `niche` are ochre's visor cupboard and its bronze-framed box; for sage, `niche` and `shelves` are the grooved recess and its three shelves.
  - `hand` +1 lays a sage run out from its right.
- Ladonia's plan runs are each one such call; copy one and change its `mods`:
  - `kitchen_a1(scheme)`;
  - `kitchen_a2(L=4.5, scheme="sage")` (any other `L` gives B2's plan; `"ochre"` gives A2's);
  - `kitchen_40n(scheme)` (3.95 m) and `kitchen_42s()` (4.2 m);
  - `kitchen_c1()` (3.9 m, laid out from its right) and `kitchen_c2(hand=-1)` (2.8 m; +1 for C3).
- `kitchen_l(scheme="ochre", w=2.49, d=2.20, sink_at=1.57, hob_at=0.65)`: an L corner. Each leg is built as a straight run, then turned and cut into place (`_turn`, `_cut`), with one worktop round the corner.
  - The long leg runs along the back. It holds the sink, with a 15 cm upstand and no wall units.
  - The short leg stands at −X facing +X. It holds the oven under the hob, a splashback and cupboards (ochre) or the deep cabinet (sage), and its free end is panelled to the ceiling.
- `kitchen_u(scheme)`: a U built for one spot, with its legs cut to a slanted back wall. Use it as a pattern for a U; it is not reusable as it stands.
- `counter(length, scheme, kind, lead=0.0, splash=0.6, hand=-1, walls=…)`: base units alone, both ends finished (the two `ld-counter-*-plain-22` pass `walls=(True, True)`: they stand between the upper north kitchen and the east wall).
  - `"hob"`: a hob over an oven, with doors and drawers.
  - `"sink"`: `lead` metres of doors from −X, then the sink and a dishwasher; a splashback `splash` high (0 for none).
  - `"plain"`: doors either side of a drawer stack and no splashback, to stand under a window.
  - `"low"`: C's order, from the hob end at −X (at +X with `hand` +1), with no splashback.
- `peninsula(w=2.10, d=0.62, scheme)`: a peninsula whose worktop runs on over its back as a breakfast bar.

**Storage, bathroom and lights**
- `wardrobe(w=1.80, h=FULL, d=0.58)`: fitted to the ceiling, facing +Y (north), unlike joinery's. Hollow, a shelf and a hanging rail a bay; every door labelled `"wardrobe"`.
  - Doors: in pairs from the middle, 2·round(w/1.1) of them, or a single door under 0.9 m; faced in `linen_panel` twill. Each swings `_pull_swing(near, proud)` short of a right angle (79.6–85.9°), so its pull never passes back over the hinge line (at 90° the 4 cm discs went 4 cm into an end wall, and across the neighbour door on a shared joint).
  - Pulls: a 0.34 m walnut disc on each pair's middle joint, 0.98 m up, cut in half, one half a door (a single door's sits 0.20 from its +X edge).
- `nightstand(w=1.0, d=0.40, h=0.15, wood="walnut_veneer")`: a floating drawer with its back at −Y, hung at y + 0.28. Hollow and lined dark, an oak box sliding 0.27 m, a dust board.
- `wall_light(w=0.80, r=0.0135)`: a tube a centimetre off the wall, oak sleeves on both ends and an opal diffuser between them; a `wall` piece at y + 1.165. It lights its room (25 W, `LED`, on the room's switch: `light` extra with `room: true`, `furniture-catalogue.md`, Lamps).
- `track(length=3.0, spots=4, leds=0)` and `pendant_felt`, `pendant_pleat`, `pendant_woven` (`r, h, drop`): `ceiling` pieces, hung by their top. Each lights its room: a pendant 40–60 W `BULB`, a track 20 W a spot and 25 W an LED module, one light a head (`furniture-catalogue.md`, Lamps; the room's lighting in the app: `../walkthrough-editor/lights-and-fittings.md`).
- `shower_walkin(w=2.18, d=1.10, h=2.10, screen=1.0, side=1, style="black", window=None)`: a floor-flush walk-in shower with its back at −Y. It is open along +Y except for a fixed screen `screen` long at +X.
  - `side=-1`: the screen at −X instead (built as the mirror image).
  - `style`: `"black"` has a tiled pre-wall with a niche and black fittings; `"chrome"` has the joinery shower's finishes.
  - `window=(u0, u1, sill)`: leaves the pre-wall open above a ledge so a window behind it shows.
- `vanity_double(w=1.45, d=0.45, wood, tap)`: a floating oak vanity with two vessel basins and a mirror over them; a `wall` piece at y + 0.40. Its drawers are U-shaped trays round the traps; water for both basins (`basin1`, `basin2`).
- `sideboard`, `cabinet`: cupboards with oak insides, the doors hung by `_hands`. `ld-cabinet`'s lamp stands on it, its own target (`furniture-catalogue.md`, Lamps; `../walkthrough-editor/lights-and-fittings.md`).
- Water and steam on every wet piece: `_gooseneck` / `_undermount` (every kitchen and counter sink), `outdoor_kitchen` (cold), `_vessel_tap`, `shower_walkin` (rain, control, steam), `outdoor_shower` (cold, no steam) — `furniture-data.md`, Water anchors; how the app runs them: `../visitor-interactions/water.md`.

**Television**
- `tv_volume(w=2.6, d=0.4, wood="oak_rift", tv=(1.43, 0.81), niche=True, tv_x=0.1, joints=())`: a rift-oak block to the ceiling, `d` deep.
  - The TV sits flush 1 m up, centred at `tv_x` (+X is the viewer's left). Its glass is never moved (`screens.json`: re-run `npm run screens -- --check` after exporting it; `../visitor-interactions/sitting-and-tv.md`).
  - `niche` opens a recess at the floor at its −X end; `joints` are the x of hairline door joints, and each stretch between joints the TV does not hang on is a closet (`_closet`, labelled `"closet"`). Re-exported for `ld-tv-volume-30` only; `ld-tv-volume` (not placed in Ladonia) is still solid.
- `tv_wall(w=1.23, h=0.72)`: a wall-hung TV on its bracket, 5 cm deep; a `wall` piece at y + 0.95 (0.8 in C).
- `media_wall(w=2.32, …)`: A's oak-framed niche with cupboards and a console. The top cupboards open from the middle; the console's doors are flaps dropping down about X (`geometry.hinged(…, axis=(1, 0, 0))`). In A1 its 1.12 m top doors stop where they meet the ceiling track's spots 0.415 m in front of them (a-f005: `Openable.plan`, the published `reach`); a track 1.15 m or more from that wall would let them open fully (a placement).

**Outdoors**
- `lounge_chair(frame="outdoor_orange")`: a strap chair. Both cushions lean back on the straps with a positive X turn.
- `outdoor_kitchen(w=1.6, d=0.70, grill=False, mirror=False)`: a teak base with a stone top, the sink at −X and, with `grill`, a grill at +X. `mirror` swaps the ends (`ld-out-kitchen-r`). Hollow, its doors opening in pairs; the sink runs cold.
- `outdoor_shower(h=2.25)`: a stainless gooseneck over a teak plate, its arm reaching +Y.
- `kamado()`: a 0.52 m ceramic egg in a steel nest, with a teak shelf at +X.
- `garden_sofa(w=2.0, d=0.85, frame="teak", fabric="canvas_cream")`: `frame_bottle` with `canvas_bottle` gives C's green one.

**Helpers**
- `_fixed(parts)` is gone (2026-10-16): no fitted piece is exported shut.
- `_board`, `_carcass`, `_faced(col, mat, xa…zb, **faces)` (a box with some faces in another material: a carcass white inside, dark on its edges), `_hang(…, swing)`, `_hands`, `_drawer`, `_pull_swing(near, proud)`, `_closet(…)`: the opening fronts' pieces, `K_SWING` and `K_TRAY` their swing and slide.
- `mirrored(parts)`: a piece's other hand. It mirrors the piece in X, turns the faces back out and reverses the hinges — an axis hinge keeps its angle, and steam screens are mirrored: `shower-m`, `ld-out-kitchen-r`, the −X walk-in showers. Not for a piece with an aimed light (a fridge, a spot): it would turn the light's aim backwards. No mirrored piece has one today; the `-r` kitchens are built with their builder's `hand=`, as such a piece's other hand must be.
- What a piece's parts and wet anchors carry in the GLB (`opens`, `fixture` extras): `furniture-data.md` (Parts that open, Water anchors); how the app opens the parts: `../visitor-interactions/opening-parts.md`.
- joinery's doors (`_hinged_door`, so its `wardrobe`; `fridge`, `microwave`) swing 105° (`SWING`), past a right angle: beside a side wall or another wardrobe they stop short (Wrenfield: 4 wardrobe doors at 97–103°, and its dressing room's two wardrobes' doors at each other — 6 of its 77 parts). Ladonia's swing 90° (`K_SWING`) or `_pull_swing` and never pass their wall or a neighbour: prefer those, or stand a joinery piece clear.
- joinery (Wrenfield's and the shared pieces): `washer` (hollow, a porthole panel, gasket, drum and lifters; the porthole hinged on its left, swinging 100° — `PORTHOLE_SWING` — labelled `"washing machine"`, `"dryer"` on a dryer; the detergent drawer sliding 0.15 m, `"detergent drawer"`), `shower` (the door, seal, sweep, clamps and handles one leaf, `"shower door"`, swinging out 85° — `SHOWER_SWING` — about the clamps' outer face, so its handle keeps off a wall running on past the shower; a steam box), and labels on every joinery part (door, drawer, wardrobe, fridge, freezer, microwave).
- `_soft_box(name, size, loc, col, mat, r, r_x, n, k, crown, puff, crease, seed)`: a rounded box whose grid is gathered into its rounds: the mattress, the platform and the headboard's panels.

"""Furnish every room.

Everything here is generated: built-ins from joinery.py, loose furniture and
decor from loose.py. Nothing is downloaded. Object names are stable — the app
lifts each named piece out of the exported model and a saved layout refers to
it by that name — so a piece can be rebuilt differently but not renamed.
"""

import math

from . import geometry as g
from . import joinery as j
from . import loose as L
from . import plan as P

PI = math.pi


def _put(col, parts, name, lift=0.0):
    """Join a set of parts and raise them to their storey.

    Everything in joinery.py is modelled standing on z=0, so anything above
    the ground floor has to be lifted or it builds itself into the room below.
    """
    obj = g.join(parts, name, col)
    if lift:
        obj.location.z += lift
    return obj


# =====================================================================
# Ground floor
# =====================================================================

def ground(col, mats):
    z = P.G

    # --- Kitchen ------------------------------------------------------
    # Sink run under the north window: the bowl centred on it, set into the
    # worktop, whose top clears the raised cill. The sink is part of the
    # run, so the two cannot be parted.
    run_y = P.IY1
    sink = j.sink(col, mats, 7.80, run_y - j.COUNTER_D / 2 + 0.01, facing=-1, bowl_side=1)
    _put(col, j.base_run(col, mats, 6.15, 8.85, run_y, -1, carcass="cab_sage",
                         modules=[("drawers", 0.60), ("appliance", 0.60), ("sink", 0.90),
                                  ("door", 0.60)], sink=sink), "kit_run_n")
    # Stopping short of the window's casing.
    _put(col, j.wall_run(col, mats, 6.15, 6.93, run_y, -1, z=1.52, carcass="cab_sage"),
         "kit_wall_n")

    # Ovens, a larder and the microwave in one bank of tall units beside it.
    _put(col, j.tall_housing(col, mats, 8.90, 10.60, run_y, -1, h=2.20, carcass="cab_sage",
                             columns=[("ovens", 0.60), ("larder", 0.55), ("microwave", 0.55)]),
         "kit_tall")

    # The island, with the hob set into it and the extractor over that.
    # 1.1 m clear of the sink run, so two can pass behind the stools.
    island_y = 7.90
    _put(col, j.island(col, mats, 8.50, island_y, 2.80, 1.05, carcass="cab_navy",
                       overhang=0.34, hob_at=8.10), "kit_island")
    _put(col, j.extractor(col, mats, 8.10, island_y - 0.02, z=1.58), "kit_extractor")

    # Fridge against the south wall, east of the snug door.
    _put(col, j.fridge(col, mats, 14.70, 6.10, facing=1), "kit_fridge")

    # Stools under the overhang, facing the island.
    stool_y = island_y + 1.05 / 2 + 0.34 + 0.03 - 0.065
    for i, x in enumerate((7.30, 8.10, 8.90)):
        _put(col, L.bar_stool(col, mats, x, stool_y, rot=PI), f"barstool{i}", lift=z)

    # Dining by the garden doors. Chairs face the table: west side turned
    # to +X, east side to -X.
    _put(col, L.dining_table(col, mats, 13.00, 8.60, rot=PI / 2), "dining_table", lift=z)
    for i, (dx, dy, r) in enumerate([(-0.95, 0.65, -PI / 2), (-0.95, -0.05, -PI / 2),
                                     (-0.95, -0.75, -PI / 2), (0.95, 0.65, PI / 2),
                                     (0.95, -0.05, PI / 2), (0.95, -0.75, PI / 2)]):
        _put(col, L.dining_chair(col, mats, 13.00 + dx, 8.60 + dy, rot=r), f"dchair{i}", lift=z)
    _put(col, L.bowl(col, mats, 13.00, 8.60), "wooden_bowl_01", lift=z + L.DINING_TOP)
    _put(col, L.plant(col, mats, 15.10, 10.10, h=1.00), "potted_plant_01", lift=z)

    # --- Living room --------------------------------------------------
    # The TV on the pier between the two front windows, on a unit lower than
    # their cills; a sofa facing it across the coffee table, a second sofa
    # along the windowless hall wall and the armchair on the pier between
    # the west windows, both facing in.
    _put(col, j.rug(col, mats, 3.00, 3.10, 3.20, 2.40, "fabric_cream"), "liv_rug")
    _put(col, L.sofa(col, mats, 5.20, 3.10, rot=PI / 2), "sofa_a", lift=z)
    _put(col, L.sofa(col, mats, 3.00, 4.45, rot=PI), "sofa_b", lift=z)
    _put(col, L.coffee_table(col, mats, 3.00, 3.10), "modern_coffee_table_01", lift=z)
    _put(col, L.armchair(col, mats, 1.20, 3.10, rot=-PI / 2), "ArmChair_01", lift=z)
    _put(col, L.side_table(col, mats, 5.35, 4.60), "side_table_01", lift=z)
    _put(col, L.vase(col, mats, 5.35, 4.60), "ceramic_vase_01", lift=z + L.SIDE_TOP)
    _put(col, j.shelving(col, mats, 2.20, 3.80, P.IY0 + 0.22, h=0.50, d=0.42, shelves=1,
                         carcass="cab_white", back=-1), "liv_tvunit")
    _put(col, L.tv(col, mats, 3.00, P.IY0 + 0.27, w=0.90, h=0.52), "Television_01", lift=z + 0.511)
    _put(col, L.plant(col, mats, 5.40, 5.90, h=0.90), "potted_plant_02", lift=z)
    _put(col, L.books(col, mats, 3.15, 3.10), "book_encyclopedia_set_01", lift=z + L.COFFEE_TOP)
    # Over the sofa on the hall wall, and between the west windows.
    _put(col, L.picture(col, mats, 5.88, 3.10, rot=PI / 2), "liv_art0", lift=z + 1.45)
    _put(col, L.picture(col, mats, 0.40, 3.25, rot=PI / 2, art="art_b"), "liv_art1", lift=z + 1.50)

    # --- Study --------------------------------------------------------
    # Against the wall under the window, its rail at the back.
    _put(col, j.desk(col, mats, 3.00, 10.25, 1.60, 0.70), "study_desk")
    desk_top = z + 0.756
    _put(col, L.office_chair(col, mats, 3.00, 9.50), "modern_arm_chair_01", lift=z)
    _put(col, L.laptop(col, mats, 2.90, 10.22, rot=PI), "classic_laptop", lift=desk_top)
    _put(col, L.desk_lamp(col, mats, 3.55, 10.45, h=0.46, rot=PI - 0.6), "desk_lamp_arm_01", lift=desk_top)
    # Full-height shelves west of the window, clear of it.
    _put(col, j.shelving(col, mats, 0.50, 1.95, 10.45, h=2.10, shelves=5,
                         carcass="cab_white"), "study_shelves")
    # Back to the east wall.
    _put(col, L.bookcase(col, mats, 5.72, 8.20, rot=PI / 2), "wooden_bookshelf_worn", lift=z)
    _put(col, j.rug(col, mats, 3.00, 8.20, 2.60, 1.90, "fabric_grey"), "study_rug")

    # --- Snug ---------------------------------------------------------
    # The seating well back from the TV, round an ottoman, and the plant in
    # the corner away from the garage door, which swings over its old spot.
    _put(col, j.rug(col, mats, 13.50, 2.40, 3.00, 2.20, "fabric_grey"), "snug_rug")
    _put(col, L.lounge_chair(col, mats, 12.60, 1.80, rot=-PI / 4), "mid_century_lounge_chair", lift=z)
    _put(col, L.lounge_chair(col, mats, 14.40, 1.80, rot=PI / 4), "snug_chair_b", lift=z)
    _put(col, L.ottoman(col, mats, 13.50, 2.70), "Ottoman_01", lift=z)
    _put(col, L.tv(col, mats, 12.35, 5.36, w=0.90, h=0.52, rot=PI), "television_02", lift=z + 0.561)
    _put(col, j.shelving(col, mats, 11.70, 13.00, 5.36, h=0.55, d=0.40, shelves=1,
                         carcass="cab_white"), "snug_tvunit")
    _put(col, L.plant(col, mats, 15.25, 0.75, h=0.55), "potted_plant_04", lift=z)

    # --- Utility ------------------------------------------------------
    # Washer and dryer stand in open slots under the worktop.
    _put(col, j.base_run(col, mats, 9.80, 11.30, 2.55, 1, carcass="cab_white",
                         modules=[("slot", 0.64), ("slot", 0.64), ("door", 0.22)]), "util_run")
    _put(col, j.washer(col, mats, 10.12, 2.86, facing=1), "util_washer")
    _put(col, j.washer(col, mats, 10.76, 2.86, facing=1, dryer=True), "util_dryer")

    # --- Cloakroom ----------------------------------------------------
    _put(col, j.wc(col, mats, 11.16, 1.20, rot=-PI / 2), "wc_pan")
    # The basin on the north wall, clear of the door, which opens in.
    _put(col, j.vanity(col, mats, 10.05, 2.32, w=0.60, d=0.40, rot=PI,
                       carcass="cab_navy"), "wc_vanity")

    # --- Hall ---------------------------------------------------------
    # The console and mirror in the west passage, a runner down the east
    # one, which leads to the cloakroom, the utility and the kitchen, and a
    # mat inside the front door.
    cx = P.HALL_X0 + 0.18
    _put(col, L.console_table(col, mats, cx, 2.80, rot=-PI / 2), "ClassicConsole_01", lift=z)
    _put(col, L.vase(col, mats, cx, 2.80, h=0.26, mat="porcelain"), "ceramic_vase_03",
         lift=z + L.CONSOLE_TOP)
    _put(col, L.mirror(col, mats, P.HALL_X0 + 0.03, 2.80, rot=-PI / 2), "ornate_mirror_01", lift=z + 1.15)
    _put(col, j.rug(col, mats, 8.99, 2.95, 0.85, 3.50, "fabric_grey"), "hall_runner")
    _put(col, j.rug(col, mats, 8.40, 0.72, 1.00, 0.55, "fabric_rust"), "hall_mat")
    # The cloaks cupboard under the stairs: its door is in the flight's
    # east side (structure.py), towards the head, where the headroom is.
    _put(col, L.closet_fittings(col, mats, P.STAIR_A["x0"] + 0.06, P.STAIR_A["x1"] - 0.06, 5.58,
                                depth=0.34, rail_z=1.75, shelf_z=2.05),
         "understair_closet", lift=z)


# =====================================================================
# First floor
# =====================================================================

def first(col, mats):
    z = P.F1
    put = lambda parts, name: _put(col, parts, name, lift=z)

    # --- Principal bedroom -------------------------------------------
    # The bed's head to the wall between the en-suite and dressing-room
    # doors, with a slim nightstand either side, clear of both.
    put(j.bed(col, mats, 3.60, 5.98, 1.65, 2.10, frame="cab_oak",
                    throw="fabric_grey"), "bed1_bed")
    for i, x in enumerate((2.52, 4.68)):
        put(j.nightstand(col, mats, x, 6.11, rot=PI, w=0.42), f"bed1_ns{i}")
        _put(col, L.desk_lamp(col, mats, x, 6.10, h=0.42), f"bed1_lamp{i}", lift=z + 0.52)
    put(j.rug(col, mats, 3.60, 7.60, 2.80, 2.40, "fabric_cream"), "bed1_rug")
    # Names repeat on purpose: Blender suffixes them (.001), exactly as the
    # exported model always has, and saved layouts refer to those names.
    put(L.lounge_chair(col, mats, 5.10, 9.90, rot=-3 * PI / 4), "mid_century_lounge_chair")
    put(L.plant(col, mats, 0.80, 10.10, h=0.90), "potted_plant_02")
    _put(col, L.picture(col, mats, 3.60, 5.99, art="art_b"), "hanging_picture_frame_02", lift=z + 1.55)

    # --- Dressing room -----------------------------------------------
    put(j.wardrobe(col, mats, 3.45, 5.80, 3.21, 1, h=2.30, carcass="cab_white"),
         "dress_wr")
    # A second run on the east wall, stopping well short of the door in.
    put(j._rotate(j.wardrobe(col, mats, 5.89 - 0.50, 5.89 + 0.50, 4.42, -1, h=2.30,
                             carcass="cab_white"), 5.89, 4.42, -PI / 2), "dress_wr2")
    put(L.ottoman(col, mats, 4.30, 4.75, fabric="fabric_sage"), "dress_pouf")
    _put(col, L.mirror(col, mats, 3.33, 4.75, w=0.60, h=1.60, rot=-PI / 2), "dress_mirror",
         lift=z + 0.30)

    # --- En-suite 1 ---------------------------------------------------
    # Shower in the north-west corner, its valve on the outside wall clear of
    # the window and its door hung off the partition beside the bedroom door.
    put(j.shower(col, mats, P.IX0, 5.80, w=0.80, d=0.98, rot=-PI / 2), "ens1_shower")
    put(j.vanity(col, mats, 2.30, 3.28, w=0.95, d=0.45, carcass="cab_oak"), "ens1_vanity")
    put(j.wc(col, mats, 2.96, 4.60, rot=-PI / 2), "ens1_wc")
    put(j.towel_rail(col, mats, 0.48, 3.90, rot=-PI / 2), "ens1_towel")

    # --- Bedroom 2 ----------------------------------------------------
    # The bed's head to the inside wall, not across the windows, the
    # wardrobe beside it.
    put(j.bed(col, mats, 2.60, 3.025, 1.40, 2.00, rot=PI, frame="cab_oak",
                    throw="fabric_cream"), "bed2_bed")
    put(j.nightstand(col, mats, 1.60, 2.89), "bed2_ns")
    put(j.nightstand(col, mats, 3.60, 2.89), "bed2_ns2")
    put(j.wardrobe(col, mats, 4.35, 5.80, 3.08, -1, h=2.20, carcass="cab_white"),
         "bed2_wr")
    put(j.rug(col, mats, 2.60, 1.75, 2.40, 1.90, "fabric_grey"), "bed2_rug")

    # --- Bedroom 3 and its en-suite -----------------------------------
    # The bed's head to the inside wall, clear of the door's swing; the
    # wardrobes along the rest of it, into the bay beside the en-suite; the
    # desk under the window.
    put(j.bed(col, mats, 11.30, 4.125, 1.40, 2.00, rot=PI, frame="cab_oak",
                    throw="fabric_grey"), "bed3_bed")
    put(j.nightstand(col, mats, 10.25, 3.99), "bed3_ns")
    put(j.nightstand(col, mats, 12.35, 3.99), "bed3_ns2")
    put(j.wardrobe(col, mats, 13.00, 15.55, 4.19, -1, h=2.20, carcass="cab_white"),
         "bed3_wr")
    put(j.desk(col, mats, 11.275, 0.66, 1.20, 0.60, rot=PI), "bed3_desk")
    put(L.office_chair(col, mats, 11.275, 1.25, rot=PI), "bed3_chair")

    # North-east corner, out of the doorway, valve on the partition. The east
    # window falls inside it, so the tiles stop under its board (1.36 m up,
    # y 1.095 to 2.055) and the door is in the side facing the room.
    put(j.shower(col, mats, P.IX1, 2.30, w=1.00, d=0.90, rot=PI, door="side",
                 window=(2.30 - 2.065, 2.30 - 1.085, 1.355)), "ens2_shower")
    put(j.vanity(col, mats, 15.10, 0.78, w=0.80, d=0.42, rot=PI / 2,
                       carcass="cab_oak"), "ens2_vanity")
    put(j.wc(col, mats, 13.70, 2.06, rot=0), "ens2_wc")

    # --- Family bathroom ----------------------------------------------
    # Against the partition, 20 mm off it, so the shower over it is fixed to
    # the wall rather than standing in the room.
    put(j.bath(col, mats, 11.00, 4.32, w=1.70, d=0.75, shower_over=True), "bath_tub")
    put(j.vanity(col, mats, 13.60, 4.40, w=1.30, d=0.50, basins=2,
                       carcass="cab_navy"), "bath_vanity")
    put(j.wc(col, mats, 15.30, 5.60, rot=-PI / 2), "bath_wc")
    put(j.towel_rail(col, mats, 11.00, 6.47, rot=PI), "bath_towel")

    # --- Bedroom 4 ----------------------------------------------------
    put(j.bed(col, mats, 12.60, 6.78, 1.55, 2.05, frame="cab_oak",
                    throw="fabric_cream"), "bed4_bed")
    for i, x in enumerate((11.50, 13.70)):
        put(j.nightstand(col, mats, x, 6.91, rot=PI), f"bed4_ns{i}")
    put(j.wardrobe(col, mats, 14.10, 15.55, 10.63, -1, h=2.20, carcass="cab_white"),
         "bed4_wr")
    put(j.rug(col, mats, 12.60, 9.40, 2.80, 2.00, "fabric_grey"), "bed4_rug")
    put(L.plant(col, mats, 10.10, 10.10, h=0.55), "potted_plant_04")

    # --- Landing ------------------------------------------------------
    put(j.nightstand(col, mats, 6.30, 9.90, h=0.70, carcass="cab_white"), "ClassicNightstand_01")
    _put(col, L.vase(col, mats, 6.30, 9.90, h=0.34), "ceramic_vase_02", lift=z + 0.70)
    _put(col, L.picture(col, mats, 6.05, 6.40, rot=PI / 2), "hanging_picture_frame_03", lift=z + 1.50)
    # A low linen shelf in the cupboard under the loft stair, where it is
    # still tall enough to reach into.
    put(j.shelving(col, mats, P.STAIR_B["x0"] + 0.08, P.STAIR_B["x1"] - 0.08, 7.25,
                   h=0.90, d=0.30, shelves=2, carcass="cab_white"), "landing_closet")


# =====================================================================
# Attic
# =====================================================================

def attic(col, mats):
    z = P.F2
    put = lambda parts, name: _put(col, parts, name, lift=z)

    # The sitting area west of the stairwell, the TV on the north knee wall.
    lx = 5.40
    put(j.rug(col, mats, lx, 7.10, 3.00, 2.30, "fabric_cream"), "loft_rug")
    put(L.sofa(col, mats, lx, 6.20, fabric="fabric_sage"), "loft_sofa")
    put(L.coffee_table_round(col, mats, lx, 7.35), "coffee_table_round_01")
    _put(col, L.tv(col, mats, lx, 8.72, w=0.90, h=0.52, rot=PI), "television_02", lift=z + 0.561)
    put(j.shelving(col, mats, lx - 0.90, lx + 0.90, 8.72, z0=0.0, h=0.55, d=0.40,
                         shelves=1, carcass="cab_white"), "loft_tvunit")

    # Head to the south knee wall, whose face is at 2.05.
    put(j.bed(col, mats, 10.90, 2.125, 1.40, 2.00, frame="cab_oak",
                    throw="fabric_grey"), "loft_bed")
    put(j.nightstand(col, mats, 9.85, 2.26, rot=PI), "loft_ns")
    put(j.shelving(col, mats, 11.85, 12.35, 2.20, z0=0.0, h=1.60, d=0.30,
                         shelves=4, carcass="cab_white"), "loft_shelves")
    put(L.plant(col, mats, 3.85, 8.55, h=1.00), "potted_plant_01")
    put(L.armchair(col, mats, 4.02, 7.25, rot=-PI / 2), "modern_arm_chair_01")

    # Loft shower room.
    put(j.shower(col, mats, P.AT_X0 + P.INT / 2, P.AT_Y0 + P.INT / 2, w=1.00, d=0.90),
        "loftbath_shower")
    put(j.vanity(col, mats, 5.55, 2.12, w=0.70, d=0.42, carcass="cab_oak"),
         "loftbath_vanity")
    put(j.wc(col, mats, 5.55, 4.36, rot=0), "loftbath_wc")


def build(cols, mats):
    ground(cols["ground"], mats)
    first(cols["first"], mats)
    attic(cols["attic"], mats)

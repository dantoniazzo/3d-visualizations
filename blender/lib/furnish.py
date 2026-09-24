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
    # Sink run under the north window; the cill at 0.9 sits just over the
    # 0.92 worktop, which is where a sink wants to be.
    _put(col, j.base_run(col, mats, 6.15, 8.85, 10.65, -1, carcass="cab_sage",
                         modules=[("appliance", 0.60), ("sink", 0.90),
                                  ("drawers", 0.60), ("door", 0.60)]), "kit_run_n")
    _put(col, j.sink(col, mats, 7.20, 10.30), "kit_sink")
    _put(col, j.wall_run(col, mats, 6.15, 7.15, 10.65, -1, z=1.52, carcass="cab_sage"),
         "kit_wall_n")

    # Oven and larder housing beside it.
    _put(col, j.tall_housing(col, mats, 8.90, 10.60, 10.65, -1, h=2.20,
                             carcass="cab_sage"), "kit_tall")
    _put(col, j._oven(col, mats, 9.30, 10.65 - 0.62 + 0.01, 0.72, 0.60), "kit_oven")
    _put(col, j._oven(col, mats, 9.30, 10.65 - 0.62 + 0.01, 1.34, 0.60), "kit_oven2")
    _put(col, j.microwave(col, mats, 10.15, 10.36, 1.42, facing=-1), "kit_microwave")

    # Island with the hob, and the extractor over it.
    _put(col, j.island(col, mats, 8.50, 8.20, 2.80, 1.05, carcass="cab_navy",
                       overhang=0.34), "kit_island")
    _put(col, j.hob(col, mats, 8.10, 8.05), "kit_hob")
    _put(col, j.extractor(col, mats, 8.10, 8.05, z=1.58), "kit_extractor")

    # Fridge against the south wall, east of the snug door.
    _put(col, j.fridge(col, mats, 14.60, 6.10, facing=1), "kit_fridge")

    for i, x in enumerate((7.30, 8.10, 8.90)):
        _put(col, L.bar_stool(col, mats, x, 9.00, rot=PI), f"barstool{i}", lift=z)

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
    _put(col, j.rug(col, mats, 3.00, 3.10, 3.20, 2.40, "fabric_cream"), "liv_rug")
    # Two sofas facing each other across the coffee table.
    _put(col, L.sofa(col, mats, 3.00, 1.80, rot=0), "sofa_a", lift=z)
    _put(col, L.sofa(col, mats, 3.00, 4.45, rot=PI), "sofa_b", lift=z)
    _put(col, L.coffee_table(col, mats, 3.00, 3.10), "modern_coffee_table_01", lift=z)
    _put(col, L.armchair(col, mats, 1.20, 3.10, rot=-PI / 2), "ArmChair_01", lift=z)
    _put(col, L.side_table(col, mats, 4.90, 3.60), "side_table_01", lift=z)
    _put(col, L.vase(col, mats, 4.90, 3.60), "ceramic_vase_01", lift=z + L.SIDE_TOP)
    _put(col, L.tv(col, mats, 1.05, 0.62, w=1.00, h=0.56), "Television_01", lift=z + 0.511)
    _put(col, j.shelving(col, mats, 0.45, 1.65, 0.60, h=0.50, d=0.42, shelves=1,
                         carcass="cab_white"), "liv_tvunit")
    _put(col, L.plant(col, mats, 5.40, 5.90, h=0.90), "potted_plant_02", lift=z)
    _put(col, L.books(col, mats, 3.15, 3.10), "book_encyclopedia_set_01", lift=z + L.COFFEE_TOP)
    # The only solid pier on the south wall is between the two windows.
    _put(col, L.picture(col, mats, 3.00, 0.42), "liv_art0", lift=z + 1.50)
    _put(col, L.picture(col, mats, 0.40, 3.25, rot=PI / 2, art="art_b"), "liv_art1", lift=z + 1.50)

    # --- Study --------------------------------------------------------
    _put(col, j.desk(col, mats, 3.00, 9.90, 1.60, 0.70, rot=PI), "study_desk")
    desk_top = z + 0.756
    _put(col, L.office_chair(col, mats, 3.00, 9.10), "modern_arm_chair_01", lift=z)
    _put(col, L.laptop(col, mats, 3.00, 9.95, rot=PI), "classic_laptop", lift=desk_top)
    _put(col, L.desk_lamp(col, mats, 3.85, 10.05, h=0.46, rot=PI), "desk_lamp_arm_01", lift=desk_top)
    _put(col, j.shelving(col, mats, 0.50, 2.60, 10.45, h=2.10, shelves=5,
                         carcass="cab_white"), "study_shelves")
    # Back to the east wall.
    _put(col, L.bookcase(col, mats, 5.72, 8.20, rot=PI / 2), "wooden_bookshelf_worn", lift=z)
    _put(col, j.rug(col, mats, 3.00, 8.20, 2.60, 1.90, "fabric_grey"), "study_rug")

    # --- Snug ---------------------------------------------------------
    _put(col, j.rug(col, mats, 13.50, 2.90, 3.00, 2.20, "fabric_grey"), "snug_rug")
    _put(col, L.lounge_chair(col, mats, 12.60, 2.30, rot=-PI / 4), "mid_century_lounge_chair", lift=z)
    _put(col, L.lounge_chair(col, mats, 14.40, 2.30, rot=PI / 4), "snug_chair_b", lift=z)
    _put(col, L.ottoman(col, mats, 13.50, 3.40), "Ottoman_01", lift=z)
    _put(col, L.tv(col, mats, 12.35, 5.36, w=0.90, h=0.52, rot=PI), "television_02", lift=z + 0.561)
    _put(col, j.shelving(col, mats, 11.70, 13.00, 5.36, h=0.55, d=0.40, shelves=1,
                         carcass="cab_white"), "snug_tvunit")
    _put(col, L.plant(col, mats, 15.20, 5.10, h=0.55), "potted_plant_04", lift=z)

    # --- Utility ------------------------------------------------------
    _put(col, j.base_run(col, mats, 9.80, 11.30, 2.55, 1, carcass="cab_white",
                         modules=[("appliance", 0.62), ("appliance", 0.62)]), "util_run")
    _put(col, j.washer(col, mats, 10.13, 2.90, facing=1), "util_washer")
    _put(col, j.washer(col, mats, 10.90, 2.90, facing=1, dryer=True), "util_dryer")

    # --- Cloakroom ----------------------------------------------------
    _put(col, j.wc(col, mats, 11.16, 1.20, rot=-PI / 2), "wc_pan")
    _put(col, j.vanity(col, mats, 9.78, 2.05, w=0.70, d=0.42, rot=-PI / 2,
                       carcass="cab_navy"), "wc_vanity")

    # --- Hall ---------------------------------------------------------
    _put(col, L.console_table(col, mats, 9.28, 2.70, rot=-PI / 2), "ClassicConsole_01", lift=z)
    _put(col, L.vase(col, mats, 9.28, 2.70, h=0.26, mat="porcelain"), "ceramic_vase_03",
         lift=z + L.CONSOLE_TOP)
    _put(col, L.mirror(col, mats, 9.55, 2.70, rot=-PI / 2), "ornate_mirror_01", lift=z + 1.15)
    _put(col, j.rug(col, mats, 8.40, 2.20, 1.10, 2.60, "fabric_grey"), "hall_runner")


# =====================================================================
# First floor
# =====================================================================

def first(col, mats):
    z = P.F1
    put = lambda parts, name: _put(col, parts, name, lift=z)

    # --- Principal bedroom -------------------------------------------
    put(j.bed(col, mats, 3.10, 6.60, 1.65, 2.10, frame="cab_oak",
                    throw="fabric_grey"), "bed1_bed")
    for i, x in enumerate((2.10, 4.10)):
        put(j.nightstand(col, mats, x, 7.05), f"bed1_ns{i}")
        _put(col, L.desk_lamp(col, mats, x, 7.05, h=0.42), f"bed1_lamp{i}", lift=z + 0.52)
    put(j.rug(col, mats, 3.10, 8.60, 3.00, 2.20, "fabric_cream"), "bed1_rug")
    # Names repeat on purpose: Blender suffixes them (.001), exactly as the
    # exported model always has, and saved layouts refer to those names.
    put(L.lounge_chair(col, mats, 5.10, 9.90, rot=-3 * PI / 4), "mid_century_lounge_chair")
    put(L.plant(col, mats, 0.80, 10.10, h=0.90), "potted_plant_02")
    _put(col, L.picture(col, mats, 3.10, 5.99, art="art_b"), "hanging_picture_frame_02", lift=z + 1.55)

    # --- Dressing room -----------------------------------------------
    put(j.wardrobe(col, mats, 3.45, 5.80, 3.25, 1, h=2.30, carcass="cab_white"),
         "dress_wr")

    # --- En-suite 1 ---------------------------------------------------
    # Shower in the north-west corner, its valve on the outside wall clear of
    # the window and its door hung off the partition beside the bedroom door.
    put(j.shower(col, mats, P.IX0, 5.80, w=0.80, d=0.98, rot=-PI / 2), "ens1_shower")
    put(j.vanity(col, mats, 2.30, 3.28, w=0.95, d=0.45, carcass="cab_oak"), "ens1_vanity")
    put(j.wc(col, mats, 2.96, 4.60, rot=-PI / 2), "ens1_wc")
    put(j.towel_rail(col, mats, 0.48, 3.90, rot=-PI / 2), "ens1_towel")

    # --- Bedroom 2 ----------------------------------------------------
    put(j.bed(col, mats, 3.00, 0.55, 1.40, 2.00, frame="cab_oak",
                    throw="fabric_cream"), "bed2_bed")
    put(j.nightstand(col, mats, 1.90, 1.00), "bed2_ns")
    put(j.wardrobe(col, mats, 4.35, 5.80, 3.00, -1, h=2.20, carcass="cab_white"),
         "bed2_wr")
    put(j.rug(col, mats, 3.00, 2.20, 2.20, 1.60, "fabric_grey"), "bed2_rug")

    # --- Bedroom 3 and its en-suite -----------------------------------
    put(j.bed(col, mats, 11.30, 0.55, 1.40, 2.00, frame="cab_oak",
                    throw="fabric_grey"), "bed3_bed")
    put(j.nightstand(col, mats, 10.25, 1.00), "bed3_ns")
    put(j.wardrobe(col, mats, 9.85, 11.60, 4.10, -1, h=2.20, carcass="cab_white"),
         "bed3_wr")
    put(j.desk(col, mats, 12.60, 3.90, 1.20, 0.60, rot=PI), "bed3_desk")

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
    put(j.towel_rail(col, mats, 9.85, 5.50, rot=-PI / 2), "bath_towel")

    # --- Bedroom 4 ----------------------------------------------------
    put(j.bed(col, mats, 12.60, 6.95, 1.55, 2.05, frame="cab_oak",
                    throw="fabric_cream"), "bed4_bed")
    for i, x in enumerate((11.50, 13.70)):
        put(j.nightstand(col, mats, x, 7.40), f"bed4_ns{i}")
    put(j.wardrobe(col, mats, 14.10, 15.55, 10.52, -1, h=2.20, carcass="cab_white"),
         "bed4_wr")
    put(j.rug(col, mats, 12.60, 9.40, 2.80, 2.00, "fabric_grey"), "bed4_rug")
    put(L.plant(col, mats, 10.10, 10.10, h=0.55), "potted_plant_04")

    # --- Landing ------------------------------------------------------
    put(j.nightstand(col, mats, 6.30, 9.90, h=0.70, carcass="cab_white"), "ClassicNightstand_01")
    _put(col, L.vase(col, mats, 6.30, 9.90, h=0.34), "ceramic_vase_02", lift=z + 0.70)
    _put(col, L.picture(col, mats, 6.05, 6.40, rot=PI / 2), "hanging_picture_frame_03", lift=z + 1.50)


# =====================================================================
# Attic
# =====================================================================

def attic(col, mats):
    z = P.F2
    put = lambda parts, name: _put(col, parts, name, lift=z)

    put(j.rug(col, mats, 6.00, 7.10, 3.20, 2.40, "fabric_cream"), "loft_rug")
    put(L.sofa(col, mats, 6.00, 6.20, fabric="fabric_sage"), "loft_sofa")
    put(L.coffee_table_round(col, mats, 6.00, 7.30), "coffee_table_round_01")
    _put(col, L.tv(col, mats, 6.00, 8.72, w=0.90, h=0.52, rot=PI), "television_02", lift=z + 0.561)
    put(j.shelving(col, mats, 5.10, 6.90, 8.72, z0=0.0, h=0.55, d=0.40,
                         shelves=1, carcass="cab_white"), "loft_tvunit")

    put(j.bed(col, mats, 10.90, 2.35, 1.40, 2.00, frame="cab_oak",
                    throw="fabric_grey"), "loft_bed")
    put(j.nightstand(col, mats, 9.85, 2.80), "loft_ns")
    put(j.shelving(col, mats, 11.85, 12.35, 2.20, z0=0.0, h=1.60, d=0.30,
                         shelves=4, carcass="cab_white"), "loft_shelves")
    put(L.plant(col, mats, 4.10, 8.50, h=1.00), "potted_plant_01")
    put(L.armchair(col, mats, 4.35, 5.65, rot=PI / 2), "modern_arm_chair_01")

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

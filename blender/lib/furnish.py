"""Furnish every room: scripted built-ins plus Poly Haven CC0 loose pieces."""

import math

from . import assets as A
from . import geometry as g
from . import joinery as j
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
        A.place("bar_chair_round_01", (x, 9.00, z), rot_z=PI, col=col,
                sit_on=z, name=f"barstool{i}")

    # Dining by the garden doors.
    A.place("dining_table", (13.00, 8.60, z), rot_z=PI / 2, col=col, sit_on=z, res="2k")
    for i, (dx, dy, r) in enumerate([(-0.95, 0.65, PI / 2), (-0.95, -0.05, PI / 2),
                                     (-0.95, -0.75, PI / 2), (0.95, 0.65, -PI / 2),
                                     (0.95, -0.05, -PI / 2), (0.95, -0.75, -PI / 2)]):
        A.place("dining_chair_02", (13.00 + dx, 8.60 + dy, z), rot_z=r, col=col,
                sit_on=z, name=f"dchair{i}")
    A.place("wooden_bowl_01", (13.00, 8.60, z), col=col, sit_on=0.88)
    A.place("potted_plant_01", (15.10, 10.10, z), col=col, sit_on=z, res="1k")

    # --- Living room --------------------------------------------------
    _put(col, j.rug(col, mats, 3.00, 3.10, 3.20, 2.40, "fabric_cream"), "liv_rug")
    A.place("Sofa_01", (3.00, 1.80, z), rot_z=0, col=col, sit_on=z, res="2k", name="sofa_a")
    A.place("Sofa_01", (3.00, 4.45, z), rot_z=PI, col=col, sit_on=z, res="2k", name="sofa_b")
    A.place("modern_coffee_table_01", (3.00, 3.10, z), col=col, sit_on=z, res="2k")
    A.place("ArmChair_01", (1.20, 3.10, z), rot_z=-PI / 2, col=col, sit_on=z)
    A.place("side_table_01", (4.90, 3.60, z), col=col, sit_on=z)
    A.place("ceramic_vase_01", (4.90, 3.60, z), col=col, sit_on=0.55)
    A.place("Television_01", (1.05, 0.72, z), col=col, height=0.62, sit_on=0.50)
    _put(col, j.shelving(col, mats, 0.45, 1.65, 0.60, h=0.50, d=0.42, shelves=1,
                         carcass="cab_white"), "liv_tvunit")
    A.place("potted_plant_02", (5.40, 5.90, z), col=col, sit_on=z)
    A.place("book_encyclopedia_set_01", (3.15, 3.10, z), col=col, height=0.26, sit_on=0.40)
    # The only solid pier on the south wall is between the two windows.
    A.place("hanging_picture_frame_01", (3.00, 0.42, z), col=col, sit_on=1.50,
            name="liv_art0")
    A.place("hanging_picture_frame_02", (0.40, 3.25, z), rot_z=PI / 2, col=col,
            sit_on=1.50, name="liv_art1")

    # --- Study --------------------------------------------------------
    _put(col, j.desk(col, mats, 3.00, 9.90, 1.60, 0.70, rot=PI), "study_desk")
    A.place("modern_arm_chair_01", (3.00, 9.10, z), col=col, sit_on=z)
    A.place("classic_laptop", (3.00, 9.95, z), rot_z=PI, col=col, height=0.23, sit_on=0.775)
    A.place("desk_lamp_arm_01", (3.85, 10.05, z), col=col, height=0.46, sit_on=0.775)
    _put(col, j.shelving(col, mats, 0.50, 2.60, 10.45, h=2.10, shelves=5,
                         carcass="cab_white"), "study_shelves")
    A.place("wooden_bookshelf_worn", (5.30, 8.20, z), rot_z=-PI / 2, col=col, sit_on=z)
    _put(col, j.rug(col, mats, 3.00, 8.20, 2.60, 1.90, "fabric_grey"), "study_rug")

    # --- Snug ---------------------------------------------------------
    _put(col, j.rug(col, mats, 13.50, 2.90, 3.00, 2.20, "fabric_grey"), "snug_rug")
    A.place("mid_century_lounge_chair", (12.60, 2.30, z), rot_z=-PI / 4, col=col, sit_on=z)
    A.place("mid_century_lounge_chair", (14.40, 2.30, z), rot_z=PI / 4, col=col,
            sit_on=z, name="snug_chair_b")
    A.place("Ottoman_01", (13.50, 3.40, z), col=col, sit_on=z)
    A.place("television_02", (12.35, 5.26, z), rot_z=PI, col=col, sit_on=0.55)
    _put(col, j.shelving(col, mats, 11.70, 13.00, 5.36, h=0.55, d=0.40, shelves=1,
                         carcass="cab_white"), "snug_tvunit")
    A.place("potted_plant_04", (15.20, 5.10, z), col=col, height=0.55, sit_on=z)

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
    A.place("ClassicConsole_01", (9.28, 2.70, z), rot_z=-PI / 2, col=col, sit_on=z)
    A.place("ceramic_vase_03", (9.28, 2.70, z), col=col, sit_on=0.95)
    A.place("ornate_mirror_01", (9.55, 2.70, z), rot_z=-PI / 2, col=col, sit_on=1.15)
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
        A.place("desk_lamp_arm_01", (x, 7.05, z), col=col, height=0.42,
                sit_on=z + 0.52, name=f"bed1_lamp{i}")
    put(j.rug(col, mats, 3.10, 8.60, 3.00, 2.20, "fabric_cream"), "bed1_rug")
    A.place("mid_century_lounge_chair", (5.10, 9.90, z), rot_z=-3 * PI / 4, col=col, sit_on=z)
    A.place("potted_plant_02", (0.80, 10.10, z), col=col, sit_on=z)
    A.place("hanging_picture_frame_02", (3.10, 5.99, z), col=col, sit_on=z + 1.55)

    # --- Dressing room -----------------------------------------------
    put(j.wardrobe(col, mats, 3.45, 5.80, 3.25, 1, h=2.30, carcass="cab_white"),
         "dress_wr")

    # --- En-suite 1 ---------------------------------------------------
    put(j.shower(col, mats, 0.45, 4.60, 1.30, 5.70), "ens1_shower")
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

    put(j.shower(col, mats, 13.55, 0.50, 14.55, 1.60), "ens2_shower")
    put(j.vanity(col, mats, 15.10, 0.78, w=0.80, d=0.42, rot=PI / 2,
                       carcass="cab_oak"), "ens2_vanity")
    put(j.wc(col, mats, 13.70, 2.06, rot=0), "ens2_wc")

    # --- Family bathroom ----------------------------------------------
    put(j.bath(col, mats, 11.00, 4.45, w=1.70, d=0.75, shower_over=True), "bath_tub")
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
    A.place("potted_plant_04", (10.10, 10.10, z), col=col, height=0.55, sit_on=z)

    # --- Landing ------------------------------------------------------
    A.place("ClassicNightstand_01", (6.30, 9.90, z), col=col, sit_on=z)
    A.place("ceramic_vase_02", (6.30, 9.90, z), col=col, sit_on=z + 0.70)
    A.place("hanging_picture_frame_03", (6.05, 6.40, z), rot_z=PI / 2, col=col, sit_on=z + 1.50)


# =====================================================================
# Attic
# =====================================================================

def attic(col, mats):
    z = P.F2
    put = lambda parts, name: _put(col, parts, name, lift=z)

    put(j.rug(col, mats, 6.00, 7.10, 3.20, 2.40, "fabric_cream"), "loft_rug")
    A.place("Sofa_01", (6.00, 6.20, z), rot_z=0, col=col, sit_on=z, res="2k", name="loft_sofa")
    A.place("coffee_table_round_01", (6.00, 7.30, z), col=col, sit_on=z)
    A.place("television_02", (6.00, 8.62, z), rot_z=PI, col=col, sit_on=z + 0.55)
    put(j.shelving(col, mats, 5.10, 6.90, 8.72, z0=0.0, h=0.55, d=0.40,
                         shelves=1, carcass="cab_white"), "loft_tvunit")

    put(j.bed(col, mats, 10.90, 2.35, 1.40, 2.00, frame="cab_oak",
                    throw="fabric_grey"), "loft_bed")
    put(j.nightstand(col, mats, 9.85, 2.80), "loft_ns")
    put(j.shelving(col, mats, 11.85, 12.35, 2.20, z0=0.0, h=1.60, d=0.30,
                         shelves=4, carcass="cab_white"), "loft_shelves")
    A.place("potted_plant_01", (4.10, 8.50, z), col=col, sit_on=z)
    A.place("modern_arm_chair_01", (4.35, 5.65, z), rot_z=PI / 2, col=col, sit_on=z)

    # Loft shower room.
    put(j.shower(col, mats, 3.65, 2.15, 4.65, 3.25), "loftbath_shower")
    put(j.vanity(col, mats, 5.55, 2.12, w=0.70, d=0.42, carcass="cab_oak"),
         "loftbath_vanity")
    put(j.wc(col, mats, 5.55, 4.36, rot=0), "loftbath_wc")


def build(cols, mats):
    ground(cols["ground"], mats)
    first(cols["first"], mats)
    attic(cols["attic"], mats)
    A.hide_masters()

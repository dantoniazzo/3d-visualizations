"""The floor plan of Wrenfield House, as data.

Plan convention: X runs west->east across the 16 m frontage, Y runs
south->north through the 11 m depth, Z is up. The street is to the south.

Storeys stack 0.00 / 3.10 / 6.05 with 0.25 m of floor structure between the
clear heights. External walls come in one ring per storey, because a wall is
split into panels between its openings and so cannot carry two windows at the
same X — one ring per storey gives each floor its own fenestration.
"""

# --- levels ----------------------------------------------------------
G, F1, F2 = 0.00, 3.10, 6.05          # finished floor levels
H_G, H_F1, H_F2 = 2.85, 2.70, 2.30    # clear heights
SLAB = 0.25
EAVES, RIDGE = 7.00, 11.30
RIDGE_Y = 5.50                        # the ridge runs along X at this Y

EXT = 0.35                            # external wall thickness
EXT_H = EXT / 2                       # ...and its half, for centreline maths
INT = 0.10                            # stud partition
PARTY = 0.15                          # thicker internal masonry

# --- envelope --------------------------------------------------------
W, D = 16.0, 11.0                     # outer footprint of the main block
IX0, IX1 = EXT, W - EXT               # 0.35 .. 15.65  internal faces
IY0, IY1 = EXT, D - EXT               # 0.35 .. 10.65

GAR_X0, GAR_X1 = 16.0, 22.4           # garage, attached east
GAR_Y0, GAR_Y1 = 0.0, 6.4
GAR_H = 3.10

# --- stair hall ------------------------------------------------------
HALL_X0, HALL_X1 = 6.00, 9.60         # 3.6 m wide: two flights plus a passage

# Flight A, ground -> first, against the hall's west side, climbing +Y.
# The foot stands 0.85 m clear of the entrance wall so there is somewhere to
# stand at the bottom; the run shortens to suit, which the ramp handles.
STAIR_A = dict(x0=6.10, x1=7.25, y0=1.20, y1=5.40, base=G, top=F1, steps=17)
# Flight B, first -> attic, against the hall's east side, also climbing +Y,
# far enough along Y that the two never block the passage between them.
STAIR_B = dict(x0=8.45, x1=9.60, y0=3.00, y1=7.60, base=F1, top=F2, steps=16)

# Stairwell openings, cut generously past each flight: a void that stops at
# the head of the stair leaves a slab edge exactly where a climber's head is,
# which snags them on the way up and blocks the way back down.
# A void runs from below the foot (for headroom on the way up) to exactly the
# head of the flight — no further. Carrying it past the top leaves a stretch
# with neither floor nor stair, which is a hole to fall through rather than a
# way down.
VOID_A = [(5.95, 0.95), (7.40, 0.95), (7.40, 5.40), (5.95, 5.40)]   # in the F1 slab
VOID_B = [(8.30, 2.65), (9.70, 2.65), (9.70, 7.60), (8.30, 7.60)]   # in the F2 slab

# --- attic footprint -------------------------------------------------
# Inset from the external walls so the roof slopes clear its ceiling: at
# 3.5 m from the ridge the roof soffit is 8.56 and the ceiling is 8.35.
AT_X0, AT_X1 = 3.50, 12.50
AT_Y0, AT_Y1 = 2.00, 9.00


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# ---------------------------------------------------------------------
# Rooms: name -> (polygon, floor finish, wall finish, level, height)
# ---------------------------------------------------------------------

# The hall runs to y 5.60 so the lower flight, which tops out at 5.40, lands
# inside it rather than through the kitchen wall.
GROUND_ROOMS = {
    "hall":     (rect(HALL_X0, IY0, HALL_X1, 5.60),      "tile_stone", "wall_white"),
    "living":   (rect(IX0, IY0, 5.90, 6.40),             "oak",        "wall_warm"),
    "study":    (rect(IX0, 6.50, 5.90, IY1),             "oak",        "wall_sage"),
    "kitchen":  (rect(HALL_X0, 5.70, IX1, IY1),          "oak",        "wall_white"),
    "wc":       (rect(9.70, IY0, 11.40, 2.40),           "tile_white", "wall_clay"),
    "utility":  (rect(9.70, 2.50, 11.40, 5.60),          "tile_white", "wall_white"),
    "snug":     (rect(11.50, IY0, IX1, 5.60),            "carpet_grey","wall_charcoal"),
}

# Every room opens off the central landing. An earlier arrangement stacked
# the bathroom and bedroom 4 two-deep on the east side, which left whichever
# was further out with no door to anywhere.
FIRST_ROOMS = {
    "landing":  (rect(HALL_X0, IY0, HALL_X1, IY1),       "oak",         "wall_white"),
    "bed2":     (rect(IX0, IY0, 5.90, 3.10),             "carpet_grey", "wall_sage"),
    "ensuite1": (rect(IX0, 3.20, 3.20, 5.80),            "tile_white",  "wall_white"),
    "dressing": (rect(3.30, 3.20, 5.90, 5.80),           "carpet_beige","wall_warm"),
    "bed1":     (rect(IX0, 5.90, 5.90, IY1),             "carpet_beige","wall_warm"),
    "bed3":     (rect(9.70, IY0, IX1, 4.20),             "carpet_grey", "wall_white"),
    "ensuite2": (rect(13.40, IY0, IX1, 2.30),            "tile_white",  "wall_white"),
    "bath":     (rect(9.70, 4.30, IX1, 6.60),            "tile_white",  "wall_white"),
    "bed4":     (rect(9.70, 6.70, IX1, IY1),             "carpet_beige","wall_clay"),
}

ATTIC_ROOMS = {
    "loft":     (rect(AT_X0, AT_Y0, AT_X1, AT_Y1),       "oak",        "wall_white"),
    "loftbath": (rect(AT_X0, AT_Y0, 6.20, 4.60),         "tile_white", "wall_white"),
}

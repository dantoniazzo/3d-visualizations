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

# Flight A, ground -> first, up the middle of the hall, climbing +Y, with a
# passage either side of it: the living room off the west one, the
# cloakroom and utility off the east, and a doorway into the kitchen at the
# end of each. Its foot stands 1.15 m clear of the entrance wall, clear of
# the front door's swing, so the run is a steepish 3.9 m (17 risers of
# 182 mm, goings of 229 mm).
STAIR_A = dict(x0=7.225, x1=8.375, y0=1.50, y1=5.40, base=G, top=F1, steps=17)
# Flight B, first -> attic, straight over flight A but climbing -Y: its foot
# at the back of the landing, its head over flight A's, landing in the loft
# clear of the roof slopes. On the first floor the landing is then a
# gallery either side of flight A's stairwell, which every room opens off.
# Its foot stands 1.15 m off the back wall, room to arrive at it from the
# galleries: a 4.3 m run of 16 risers (184 mm rise, 269 mm going, 34°).
STAIR_B = dict(x0=7.225, x1=8.375, y0=5.20, y1=9.50, base=F1, top=F2, steps=16, climb=-1)

# Stairwell openings: from the head of each flight back as far as a
# climber's head needs them — 2 m clear over the nosings — and no further,
# so the floor goes on round them. Across, flush with the strings' outer
# faces (5 mm outside the flight), so there is no slit to see up through.
VOID_A = [(7.22, 1.40), (8.38, 1.40), (8.38, 5.40), (7.22, 5.40)]   # in the F1 slab
VOID_B = [(7.22, 5.20), (8.38, 5.20), (8.38, 8.52), (7.22, 8.52)]   # in the F2 slab

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
    # L-shaped round en-suite 2, which is cut out of its corner: a rectangle
    # laid its carpet under the en-suite's tiles at the same height.
    "bed3":     ([(9.70, IY0), (13.30, IY0), (13.30, 2.40), (IX1, 2.40), (IX1, 4.20),
                  (9.70, 4.20)],                         "carpet_grey", "wall_white"),
    "ensuite2": (rect(13.40, IY0, IX1, 2.30),            "tile_white",  "wall_white"),
    "bath":     (rect(9.70, 4.30, IX1, 6.60),            "tile_white",  "wall_white"),
    "bed4":     (rect(9.70, 6.70, IX1, IY1),             "carpet_beige","wall_clay"),
}

ATTIC_ROOMS = {
    # L-shaped round the shower room in its south-west corner, for the same
    # reason as bedroom 3.
    "loft":     ([(6.30, AT_Y0), (AT_X1, AT_Y0), (AT_X1, AT_Y1), (AT_X0, AT_Y1),
                  (AT_X0, 4.70), (6.30, 4.70)],           "oak",        "wall_white"),
    "loftbath": (rect(AT_X0, AT_Y0, 6.20, 4.60),         "tile_white", "wall_white"),
}

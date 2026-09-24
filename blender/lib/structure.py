"""Wrenfield House's structure, as data.

Every wall and what is in it, storey by storey; the roofs; which side of
each flight has a balustrade and which sides of each stairwell a rail; the
site. Two builders read it:

  - shell.py builds the Blender house from it, for renders and the .blend;
  - export_app.py writes it out as the walkthrough's scene spec, which the
    app builds for itself. A door moved in the app's editor then moves in a
    wall the app owns, and a stairwell is cut wherever a flight is moved to.

Walls are (start, end, openings[, finish_a[, finish_b]]) in plan
coordinates: finish_a on the wall's left, the +Y side of its own frame, and
finish_b on its right, defaulting to finish_a. External rings run
anticlockwise seen from above, so the left of every external wall is
indoors. Openings come from architecture's door / doorway / window / french.
"""

from . import architecture as a
from . import plan as P

E = P.EXT_H

# ---------------------------------------------------------------------
# External walls: one ring per storey, so each storey has its own windows
# ---------------------------------------------------------------------

RINGS = [
    dict(level="ground", base=P.G, height=P.F1 - P.G, walls=[
        # South elevation, offset = x
        ((E, E), (P.W - E, E), [
            a.window(1.80, 1.5, 1.80, 0.60, panes_z=3),
            a.window(4.20, 1.5, 1.80, 0.60, panes_z=3),
            a.door(8.40, 1.05, 2.20, leaf="cab_navy", handle="brass", swing=0),
            a.window(10.55, 0.6, 0.90, 1.50, panes_x=1),
            a.window(13.60, 1.8, 1.80, 0.60, panes_x=3, panes_z=3),
        ]),
        # East elevation, offset = y. The garage abuts up to y 6.4, so the
        # door into it sits below that and the window above.
        ((P.W - E, E), (P.W - E, P.D - E), [
            a.door(4.45, 0.90, 2.04, swing=18),      # garage -> snug
            a.window(8.05, 2.4, 1.80, 0.60, panes_x=4, panes_z=3),
        ]),
        # North elevation, offset = 16 - x
        ((P.W - E, P.D - E), (E, P.D - E), [
            a.french(4.00, 2.6, 2.30, panes_x=4, panes_z=3),
            a.window(8.00, 1.6, 1.50, 0.90),
            a.window(13.00, 1.8, 1.60, 0.70, panes_x=3),
        ]),
        # West elevation, offset = 11 - y
        ((E, P.D - E), (E, E), [
            a.window(2.50, 1.5, 1.60, 0.70),
            a.window(6.50, 1.5, 1.80, 0.60, panes_z=3),
            a.window(9.00, 1.5, 1.80, 0.60, panes_z=3),
        ]),
    ]),
    dict(level="first", base=P.F1, height=P.F2 - P.F1, walls=[
        ((E, E), (P.W - E, E), [
            a.window(1.80, 1.4, 1.50, 0.90),
            a.window(4.20, 1.4, 1.50, 0.90),
            a.window(7.80, 1.2, 1.50, 0.90),
            a.window(11.10, 1.4, 1.50, 0.90),
            a.window(14.20, 0.8, 1.00, 1.40, panes_x=1),
        ]),
        ((P.W - E, E), (P.W - E, P.D - E), [
            a.window(1.40, 0.8, 1.00, 1.40, panes_x=1),
            a.window(5.50, 1.4, 1.50, 0.90),
            a.window(8.80, 1.6, 1.50, 0.90),
        ]),
        ((P.W - E, P.D - E), (E, P.D - E), [
            a.window(3.00, 1.6, 1.50, 0.90),
            a.window(11.50, 1.4, 1.50, 0.90),
            a.window(14.00, 1.4, 1.50, 0.90),
        ]),
        ((E, P.D - E), (E, E), [
            a.window(2.50, 1.6, 1.50, 0.90),
            a.window(6.50, 0.8, 1.00, 1.40, panes_x=1),
            a.window(9.30, 1.4, 1.50, 0.90),
        ]),
    ]),
    # The eaves: the external walls carry on up to the roof behind the loft.
    dict(level="attic", base=P.F2, height=P.EAVES - P.F2, walls=[
        ((E, E), (P.W - E, E), []),
        ((P.W - E, E), (P.W - E, P.D - E), []),
        ((P.W - E, P.D - E), (E, P.D - E), []),
        ((E, P.D - E), (E, E), []),
    ]),
]

# ---------------------------------------------------------------------
# Internal partitions, storey by storey
# ---------------------------------------------------------------------

PARTITIONS = [
    dict(level="ground", base=P.G, height=P.H_G, walls=[
        # Hall / living-study spine
        ((5.95, P.IY0), (5.95, P.IY1), [a.door(0.43, 0.76, swing=25)],
         "wall_warm", "wall_white"),
        # Living / study
        ((P.IX0, 6.45), (5.95, 6.45), [a.doorway(2.65, 1.2)], "wall_sage", "wall_warm"),
        # Hall / wc-utility
        ((9.65, P.IY0), (9.65, 5.65), [a.door(1.05, 0.76), a.door(3.65, 0.80)],
         "wall_white", "wall_clay"),
        # WC / utility
        ((9.65, 2.45), (11.45, 2.45), [], "wall_white", "wall_clay"),
        # Utility / snug
        ((11.45, P.IY0), (11.45, 5.65), [], "wall_charcoal", "wall_white"),
        # The long wall between the front rooms and the kitchen
        ((5.95, 5.65), (P.IX1, 5.65), [
            a.doorway(2.05, 1.60), a.door(4.55, 0.80), a.door(7.55, 0.85, swing=20),
        ], "wall_white", "wall_white"),
    ]),
    dict(level="first", base=P.F1, height=P.H_F1, walls=[
        ((5.95, P.IY0), (5.95, P.IY1),
         [a.door(1.35, swing=20), a.door(4.15, 0.80), a.door(7.85, swing=15)],
         "wall_sage", "wall_white"),
        ((9.65, P.IY0), (9.65, P.IY1),
         [a.door(1.85, swing=18), a.door(5.15, 0.80), a.door(8.25, swing=22)],
         "wall_white", "wall_white"),
        ((P.IX0, 3.15), (5.95, 3.15), [], "wall_white", "wall_sage"),
        ((3.25, 3.20), (3.25, 5.85), [], "wall_warm", "wall_white"),
        ((P.IX0, 5.85), (5.95, 5.85),
         [a.door(1.45, 0.76), a.door(4.25, 0.80)], "wall_warm", "wall_white"),
        ((13.35, P.IY0), (13.35, 2.35), [a.door(0.95, 0.76)], "wall_white", "wall_white"),
        ((13.35, 2.35), (P.IX1, 2.35), [], "wall_white", "wall_white"),
        ((9.65, 4.25), (P.IX1, 4.25), [], "wall_white", "wall_white"),
        ((9.65, 6.65), (P.IX1, 6.65), [], "wall_clay", "wall_white"),
    ]),
    # Knee walls enclosing the loft, inside the roof rather than on the
    # external ring, and the loft shower room in its south-west corner.
    dict(level="attic", base=P.F2, height=P.H_F2, walls=[
        ((P.AT_X0, P.AT_Y0), (P.AT_X0, P.AT_Y1), [], "wall_white"),
        ((P.AT_X1, P.AT_Y0), (P.AT_X1, P.AT_Y1), [], "wall_white"),
        ((P.AT_X0, P.AT_Y0), (P.AT_X1, P.AT_Y0), [], "wall_white"),
        ((P.AT_X0, P.AT_Y1), (P.AT_X1, P.AT_Y1), [], "wall_white"),
        ((6.25, P.AT_Y0), (6.25, 4.60), [a.door(1.30, 0.76)], "wall_white"),
        ((P.AT_X0, 4.65), (6.25, 4.65), [], "wall_white"),
    ]),
]

# ---------------------------------------------------------------------
# The garage, attached east
# ---------------------------------------------------------------------

GX0, GX1, GY0, GY1 = P.GAR_X0, P.GAR_X1, P.GAR_Y0, P.GAR_Y1
GARAGE = dict(
    base=P.G,
    height=P.GAR_H,
    # Open on its west side, where the house's east wall is.
    walls=[
        ((GX0, GY0 + E), (GX1 - E, GY0 + E), [a.doorway(3.20, 4.60, 2.40)]),
        ((GX1 - E, GY0 + E), (GX1 - E, GY1 - E), []),
        ((GX1 - E, GY1 - E), (GX0, GY1 - E), [a.door(1.20, 0.90, 2.05)]),
    ],
    # The floor inside the walls.
    floor=P.rect(GX0, GY0 + P.EXT, GX1 - P.EXT, GY1 - P.EXT),
)

# ---------------------------------------------------------------------
# Stairs: flights, their balustrades, and the rails round their wells
# ---------------------------------------------------------------------

#: Both flights climb +Y. `balustrade` is the open side, the other being a
#: wall; `level` is the storey the flight leaves from.
FLIGHTS = [
    dict(id="flight-a", level="ground", balustrade="east", void=P.VOID_A, **P.STAIR_A),
    dict(id="flight-b", level="first", balustrade="west", void=P.VOID_B, **P.STAIR_B),
]

#: Rails guard the open sides of each stairwell, and only those: a rail
#: across the head of a flight is a fence in front of the way down.
LANDING_RAILS = [
    dict(flight="flight-a", z=P.F1, level="first",
         points=[(7.45, 5.40), (7.45, 0.90), (5.95, 0.90)]),
    dict(flight="flight-b", z=P.F2, level="attic",
         points=[(8.25, 7.60), (8.25, 2.60), (9.75, 2.60), (9.75, 7.60)]),
]

# ---------------------------------------------------------------------
# Roofs
# ---------------------------------------------------------------------

ROOFS = [
    dict(id="house", x0=0, x1=P.W, y0=0, y1=P.D, eaves=P.EAVES, ridge=P.RIDGE,
         overhang=0.55, thickness=0.24, ridge_axis="x",
         rooflights=[
             dict(at=5.0, w=0.90, h=1.35, from_ridge=2.10, side=-1),
             dict(at=8.0, w=0.90, h=1.35, from_ridge=2.10, side=-1),
             dict(at=11.0, w=0.90, h=1.35, from_ridge=2.10, side=-1),
             dict(at=6.5, w=0.90, h=1.35, from_ridge=2.10, side=1),
             dict(at=10.0, w=0.90, h=1.35, from_ridge=2.10, side=1),
         ]),
    dict(id="garage", x0=GX0, x1=GX1, y0=GY0, y1=GY1, eaves=P.GAR_H, ridge=P.GAR_H + 1.35,
         overhang=0.40, thickness=0.20, ridge_axis="y", rooflights=None),
]

# ---------------------------------------------------------------------
# The site
# ---------------------------------------------------------------------

#: What Blender lays: one lawn under everything, paving and tarmac on it at
#: staggered heights so nothing z-fights.
SITE = [
    ("lawn", P.rect(-22, -18, 34, 30), -0.06, "grass"),
    ("road", P.rect(-22, -18, 34, -13), -0.04, "tarmac"),
    ("drive", P.rect(16.4, -13, 22.0, 0), -0.04, "tarmac"),
    ("path", P.rect(7.6, -13, 9.2, 0), -0.03, "paving"),
    ("patio", P.rect(4.0, P.D, 16.0, P.D + 4.5), -0.03, "paving"),
]

#: The same site laid edge to edge, for the app: its slabs all sit at
#: ground level, so the lawn is cut round the house, the garage, the paving
#: and the road instead of lying under them. (name, label, rect, finish)
SITE_TILES = [
    ("road", "Road", P.rect(-22, -18, 34, -13), "tarmac"),
    ("drive", "Driveway", P.rect(16.4, -13, 22.0, 0), "tarmac"),
    ("path", "Front path", P.rect(7.6, -13, 9.2, 0), "paving"),
    ("patio", "Patio", P.rect(4.0, P.D, 16.0, P.D + 4.5), "paving"),
    ("front-w", "Front garden", P.rect(-22, -13, 7.6, 0), "grass"),
    ("front-m", "Front garden", P.rect(9.2, -13, 16.4, 0), "grass"),
    ("front-e", "Front garden", P.rect(22.0, -13, 34, 0), "grass"),
    ("side-w", "West side", P.rect(-22, 0, 0, P.D), "grass"),
    ("side-e", "East side", P.rect(GX1, 0, 34, P.D), "grass"),
    ("garage-n", "Beside the garage", P.rect(GX0, GY1, GX1, P.D), "grass"),
    ("back-w", "Back garden", P.rect(-22, P.D, 4.0, 30), "grass"),
    ("back-m", "Back garden", P.rect(4.0, P.D + 4.5, 16.0, 30), "grass"),
    ("back-e", "Back garden", P.rect(16.0, P.D, 34, 30), "grass"),
]

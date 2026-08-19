"""Construct the shell of Wrenfield House from the plan."""

import math

import bpy

from . import architecture as a
from . import geometry as g
from . import plan as P


def _ring(walls, col, mats, base, height, thickness=P.EXT):
    """One storey's external walls."""
    out = []
    for (s, e, openings) in walls:
        w = a.Wall(s, e, height, thickness, base=base, openings=openings,
                   mat_a=mats["wall_white"], external=True)
        out.append(a.build_wall(w, col, mats))
    return out


def _partitions(specs, col, mats, base, height, thickness=P.INT):
    out = []
    for spec in specs:
        s, e, openings = spec[0], spec[1], spec[2]
        ma = mats[spec[3]] if len(spec) > 3 else mats["wall_white"]
        mb = mats[spec[4]] if len(spec) > 4 else ma
        w = a.Wall(s, e, height, thickness, base=base, openings=openings,
                   mat_a=ma, mat_b=mb)
        out.append(a.build_wall(w, col, mats))
    return out


def build(mats):
    """Build every storey. Returns the collections it made."""
    cols = {k: g.collection(k) for k in
            ("ground", "first", "attic", "roof", "garage", "site", "lights")}

    # =================================================================
    # Ground floor
    # =================================================================
    cg = cols["ground"]

    # Ground slab, and a finish per room laid on top of it.
    a.slab("slab_g", P.rect(-0.05, -0.05, P.W + 0.05, P.D + 0.05), P.G, 0.30,
           cg, mats["concrete"])
    for name, (poly, floor, _) in P.GROUND_ROOMS.items():
        g.polygon(f"fl_{name}", poly, loc=(0, 0, P.G + 0.002), col=cg, mat=mats[floor])

    # External ring. The centrelines sit half a wall in from the footprint so
    # the INNER face lands on P.EXT, which is where the room polygons and every
    # internal wall begin — centring them on 0 and 16 instead left a 17.5 cm
    # gap all the way round the building.
    E = P.EXT_H
    _ring([
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
    ], cg, mats, P.G, P.F1)

    _partitions([
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
    ], cg, mats, P.G, P.H_G)

    # The stair hall gets no ceiling plane of its own: the floor slab above
    # already shows its soffit AND carries the stairwell void, whereas a flat
    # ceiling here seals the flight over and stops a climber's head dead about
    # a metre up.
    for name, (poly, _, _) in P.GROUND_ROOMS.items():
        if name == "hall":
            continue
        a.ceiling(f"ce_{name}", poly, P.G + P.H_G, cg, mats["ceiling"])

    # =================================================================
    # First floor
    # =================================================================
    cf = cols["first"]
    a.slab("slab_f1", P.rect(-0.05, -0.05, P.W + 0.05, P.D + 0.05), P.F1, P.SLAB,
           cf, mats["ceiling"], holes=[P.VOID_A])
    # The finish overlay needs the same hole as the slab beneath it: cutting
    # only the slab leaves a 2 mm lid stretched across the stairwell, which is
    # invisible but stands on exactly like a floor.
    for name, (poly, floor, _) in P.FIRST_ROOMS.items():
        if name == "landing":
            a.slab(f"fl_{name}", poly, P.F1 + 0.004, 0.004, cf, mats[floor],
                   holes=[P.VOID_A])
        else:
            g.polygon(f"fl_{name}", poly, loc=(0, 0, P.F1 + 0.002), col=cf, mat=mats[floor])

    _ring([
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
    ], cf, mats, P.F1, P.F2 - P.F1)

    _partitions([
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
    ], cf, mats, P.F1, P.H_F1)

    for name, (poly, _, _) in P.FIRST_ROOMS.items():
        if name == "landing":     # same reason as the hall below it
            continue
        a.ceiling(f"ce_{name}", poly, P.F1 + P.H_F1, cf, mats["ceiling"])

    # =================================================================
    # Attic
    # =================================================================
    ca = cols["attic"]
    a.slab("slab_f2", P.rect(-0.05, -0.05, P.W + 0.05, P.D + 0.05), P.F2, P.SLAB,
           ca, mats["ceiling"], holes=[P.VOID_B])
    for name, (poly, floor, _) in P.ATTIC_ROOMS.items():
        if name == "loft":
            a.slab(f"fl_{name}", poly, P.F2 + 0.004, 0.004, ca, mats[floor],
                   holes=[P.VOID_B])
        else:
            g.polygon(f"fl_{name}", poly, loc=(0, 0, P.F2 + 0.002), col=ca, mat=mats[floor])

    # Knee walls enclosing the loft, inside the roof rather than on the
    # external ring.
    _partitions([
        ((P.AT_X0, P.AT_Y0), (P.AT_X0, P.AT_Y1), [], "wall_white"),
        ((P.AT_X1, P.AT_Y0), (P.AT_X1, P.AT_Y1), [], "wall_white"),
        ((P.AT_X0, P.AT_Y0), (P.AT_X1, P.AT_Y0), [], "wall_white"),
        ((P.AT_X0, P.AT_Y1), (P.AT_X1, P.AT_Y1), [], "wall_white"),
        # Loft shower room in the south-west corner.
        ((6.25, P.AT_Y0), (6.25, 4.60), [a.door(1.30, 0.76)], "wall_white"),
        ((P.AT_X0, 4.65), (6.25, 4.65), [], "wall_white"),
    ], ca, mats, P.F2, P.H_F2)

    a.ceiling("ce_loft", P.rect(P.AT_X0, P.AT_Y0, P.AT_X1, P.AT_Y1),
              P.F2 + P.H_F2, ca, mats["ceiling"])

    # Eaves ring: the external walls carry on to the eaves behind the loft.
    E = P.EXT_H
    _ring([
        ((E, E), (P.W - E, E), []), ((P.W - E, E), (P.W - E, P.D - E), []),
        ((P.W - E, P.D - E), (E, P.D - E), []), ((E, P.D - E), (E, E), []),
    ], ca, mats, P.F2, P.EAVES - P.F2)

    # =================================================================
    # Stairs
    # =================================================================
    fa, ra = a.build_stair(**{k: P.STAIR_A[k] for k in ("x0", "x1", "y0", "y1", "base", "top", "steps")},
                           col=cg, mats=mats, balustrade="east")
    fb, rb = a.build_stair(**{k: P.STAIR_B[k] for k in ("x0", "x1", "y0", "y1", "base", "top", "steps")},
                           col=cf, mats=mats, balustrade="west")

    # Guard the open sides of each stairwell, and only those: a rail across
    # the head of a flight is a fence in front of the way down.
    a.landing_rail([(7.45, 5.40), (7.45, 0.90), (5.95, 0.90)], P.F1, cf, mats)
    a.landing_rail([(8.25, 7.60), (8.25, 2.60), (9.75, 2.60), (9.75, 7.60)],
                   P.F2, ca, mats)

    # =================================================================
    # Roof
    # =================================================================
    roof, rooflight_glass = a.gable_roof(
        0, P.W, 0, P.D, P.EAVES, P.RIDGE, cols["roof"], mats, overhang=0.55,
        rooflights=[
            dict(at=5.0, w=0.90, h=1.35, from_ridge=2.10, side=-1),
            dict(at=8.0, w=0.90, h=1.35, from_ridge=2.10, side=-1),
            dict(at=11.0, w=0.90, h=1.35, from_ridge=2.10, side=-1),
            dict(at=6.5, w=0.90, h=1.35, from_ridge=2.10, side=1),
            dict(at=10.0, w=0.90, h=1.35, from_ridge=2.10, side=1),
        ])

    # =================================================================
    # Garage
    # =================================================================
    cgar = cols["garage"]
    gx0, gx1, gy0, gy1 = P.GAR_X0, P.GAR_X1, P.GAR_Y0, P.GAR_Y1
    E = P.EXT_H
    a.slab("slab_gar", P.rect(gx0, gy0, gx1, gy1), P.G, 0.30, cgar, mats["concrete"])
    _ring([
        ((gx0, gy0 + E), (gx1 - E, gy0 + E), [a.doorway(3.20, 4.60, 2.40)]),
        ((gx1 - E, gy0 + E), (gx1 - E, gy1 - E), []),
        ((gx1 - E, gy1 - E), (gx0, gy1 - E), [a.door(1.20, 0.90, 2.05)]),
    ], cgar, mats, P.G, P.GAR_H)
    a.gable_roof(gx0, gx1, gy0, gy1, P.GAR_H, P.GAR_H + 1.35, cgar, mats,
                 overhang=0.40, thickness=0.20, ridge_axis="y")

    # =================================================================
    # Site
    # =================================================================
    cs = cols["site"]
    g.polygon("lawn", P.rect(-22, -18, 34, 30), loc=(0, 0, -0.06), col=cs, mat=mats["grass"])
    g.polygon("road", P.rect(-22, -18, 34, -13), loc=(0, 0, -0.04), col=cs, mat=mats["tarmac"])
    g.polygon("drive", P.rect(16.4, -13, 22.0, 0), loc=(0, 0, -0.04), col=cs, mat=mats["tarmac"])
    g.polygon("path", P.rect(7.6, -13, 9.2, 0), loc=(0, 0, -0.03), col=cs, mat=mats["paving"])
    g.polygon("patio", P.rect(4.0, P.D, 16.0, P.D + 4.5), loc=(0, 0, -0.03), col=cs, mat=mats["paving"])

    return cols, dict(roof=roof, rooflights=rooflight_glass)

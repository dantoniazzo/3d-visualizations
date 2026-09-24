"""Construct the shell of Wrenfield House in Blender, from the plan and the
structure data in structure.py — the same data the app's scene spec is
written from."""

import math

import bpy

from . import architecture as a
from . import geometry as g
from . import plan as P
from . import structure as S


def _level(groups, level):
    return next(group for group in groups if group["level"] == level)


def _walls(group, col, mats, external=False):
    """Build one group of walls from structure.py. External walls are
    rendered on both faces; a partition's faces are painted per room."""
    out = []
    for spec in group["walls"]:
        start, end, openings = spec[0], spec[1], spec[2]
        if external:
            w = a.Wall(start, end, group["height"], P.EXT, base=group["base"], openings=openings,
                       mat_a=mats["wall_white"], external=True)
        else:
            ma = mats[spec[3]] if len(spec) > 3 else mats["wall_white"]
            mb = mats[spec[4]] if len(spec) > 4 else ma
            w = a.Wall(start, end, group["height"], P.INT, base=group["base"], openings=openings,
                       mat_a=ma, mat_b=mb)
        out.append(a.build_wall(w, col, mats))
    return out


def _storey_walls(level, col, mats):
    """A storey's external ring and its partitions."""
    _walls(_level(S.RINGS, level), col, mats, external=True)
    _walls(_level(S.PARTITIONS, level), col, mats)


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
    _storey_walls("ground", cg, mats)

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

    _storey_walls("first", cf, mats)

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

    # Knee walls enclosing the loft, and the loft shower room.
    _walls(_level(S.PARTITIONS, "attic"), ca, mats)

    a.ceiling("ce_loft", P.rect(P.AT_X0, P.AT_Y0, P.AT_X1, P.AT_Y1),
              P.F2 + P.H_F2, ca, mats["ceiling"])

    # Eaves ring: the external walls carry on to the eaves behind the loft.
    _walls(_level(S.RINGS, "attic"), ca, mats, external=True)

    # =================================================================
    # Stairs
    # =================================================================
    for flight in S.FLIGHTS:
        a.build_stair(**{k: flight[k] for k in ("x0", "x1", "y0", "y1", "base", "top", "steps")},
                      col=cols[flight["level"]], mats=mats, balustrade=flight["balustrade"])

    # Guard the open sides of each stairwell, and only those: a rail across
    # the head of a flight is a fence in front of the way down.
    for rail in S.LANDING_RAILS:
        a.landing_rail(rail["points"], rail["z"], cols[rail["level"]], mats)

    # =================================================================
    # Roof
    # =================================================================
    house = S.ROOFS[0]
    roof, rooflight_glass = a.gable_roof(
        house["x0"], house["x1"], house["y0"], house["y1"], house["eaves"], house["ridge"],
        cols["roof"], mats, overhang=house["overhang"], thickness=house["thickness"],
        ridge_axis=house["ridge_axis"], rooflights=house["rooflights"])

    # =================================================================
    # Garage
    # =================================================================
    cgar = cols["garage"]
    a.slab("slab_gar", P.rect(S.GX0, S.GY0, S.GX1, S.GY1), P.G, 0.30, cgar, mats["concrete"])
    _walls(S.GARAGE, cgar, mats, external=True)
    garage = S.ROOFS[1]
    a.gable_roof(garage["x0"], garage["x1"], garage["y0"], garage["y1"], garage["eaves"],
                 garage["ridge"], cgar, mats, overhang=garage["overhang"],
                 thickness=garage["thickness"], ridge_axis=garage["ridge_axis"])

    # =================================================================
    # Site
    # =================================================================
    cs = cols["site"]
    for name, rect, z, finish in S.SITE:
        g.polygon(name, rect, loc=(0, 0, z), col=cs, mat=mats[finish])

    return cols, dict(roof=roof, rooflights=rooflight_glass)

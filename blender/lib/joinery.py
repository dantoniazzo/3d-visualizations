"""Built-in joinery, sanitaryware and appliances.

These are the pieces that have to fit the architecture exactly — a kitchen run
that stops short of the wall, or a bath that does not span its alcove, reads as
a mistake in a way a slightly-wrong armchair never does. Everything here is
parametric so it can be sized to the room it goes in.

Loose furniture — seating, tables, lamps, decor — is in loose.py.
"""

import math

from mathutils import Vector

from . import geometry as g

PLINTH = 0.10          # recess under a base unit
COUNTER_H = 0.92       # worktop height
COUNTER_D = 0.635
WALL_UNIT_H = 0.72
WALL_UNIT_D = 0.33


def _handle(col, mats, x, y, z, length=0.16, vertical=False, style="bar", facing=-1,
            segments=32):
    """A brushed bar handle on two stand-offs, standing off a front that
    faces `facing` (-1: -Y, +1: +Y)."""
    m = mats["steel"]
    parts = []
    # A cylinder is born along Z, so a vertical handle needs no rotation and
    # a horizontal one a quarter turn about Y.
    axis = (0, 0, 0) if vertical else (0, math.pi / 2, 0)
    parts.append(g.cylinder("h", 0.008, length, loc=(x, y, z), rot=axis, col=col, mat=m,
                            segments=segments))
    for s in (-1, 1):
        off = (s * length / 2 * 0.75, 0, 0) if not vertical else (0, 0, s * length / 2 * 0.75)
        parts.append(g.cylinder("hs", 0.005, 0.028,
                                loc=(x + off[0], y - facing * 0.014, z + off[2]),
                                rot=(math.pi / 2, 0, 0), col=col, mat=m,
                                segments=segments))
    return parts


def _door_front(col, mats, w, h, x, y, z, mat, handle_side=1, gap=0.003):
    """A slab cabinet door with a shadow gap and a handle."""
    parts = [g.box("front", (w - gap * 2, 0.019, h - gap * 2), loc=(x, y, z),
                   col=col, mat=mat, bevel=0.002)]
    parts += _handle(col, mats, x + handle_side * (w / 2 - 0.055), y - 0.020, z, 0.14, vertical=True)
    return parts


def _drawer_front(col, mats, w, h, x, y, z, mat, facing=-1, segments=32):
    parts = [g.box("front", (w - 0.006, 0.019, h - 0.006), loc=(x, y, z),
                   col=col, mat=mat, bevel=0.002)]
    parts += _handle(col, mats, x, y + facing * 0.020, z, min(0.30, w * 0.5), facing=facing,
                     segments=segments)
    return parts


# ---------------------------------------------------------------------
# Kitchen
# ---------------------------------------------------------------------

def base_run(col, mats, x0, x1, y, facing, carcass="cab_sage", worktop="worktop",
             modules=None, height=COUNTER_H, depth=COUNTER_D):
    """A run of base units along X with a continuous worktop.

    `facing` is +1 if the doors face +Y, -1 if they face -Y. `modules` is a
    list of ("door"|"drawers"|"appliance"|"sink"|"oven", width) in order;
    None fills the run with 0.6 m doors.
    """
    parts = []
    cab = mats[carcass]
    total = x1 - x0
    if modules is None:
        n = max(1, round(total / 0.6))
        modules = [("door", total / n)] * n

    fy = y + facing * depth / 2
    front_y = y + facing * (depth / 2 - 0.010)

    # Carcass and plinth for the whole run.
    parts.append(g.box("carcass", (total, depth, height - PLINTH),
                       loc=(x0 + total / 2, fy, PLINTH + (height - PLINTH) / 2),
                       col=col, mat=cab))
    parts.append(g.box("plinth", (total, depth - 0.06, PLINTH),
                       loc=(x0 + total / 2, fy - facing * 0.03, PLINTH / 2),
                       col=col, mat=mats["trim_charcoal"] if "trim_charcoal" in mats else cab))

    x = x0
    for kind, w in modules:
        cx = x + w / 2
        if kind == "drawers":
            heights = [0.14, 0.20, 0.26]
            z = PLINTH + 0.02
            for dh in heights:
                parts += _drawer_front(col, mats, w, dh, cx, front_y, z + dh / 2, cab)
                z += dh + 0.006
        elif kind == "door":
            h = height - PLINTH - 0.04
            parts += _door_front(col, mats, w, h, cx, front_y, PLINTH + 0.02 + h / 2, cab,
                                 handle_side=1 if (x - x0) % 1.2 < 0.6 else -1)
        elif kind == "sink":
            parts += _door_front(col, mats, w / 2, height - PLINTH - 0.04, cx - w / 4,
                                 front_y, PLINTH + 0.02 + (height - PLINTH - 0.04) / 2, cab, -1)
            parts += _door_front(col, mats, w / 2, height - PLINTH - 0.04, cx + w / 4,
                                 front_y, PLINTH + 0.02 + (height - PLINTH - 0.04) / 2, cab, 1)
        elif kind == "appliance":
            # Integrated front: dishwasher or washer behind a matching door.
            parts += _door_front(col, mats, w, height - PLINTH - 0.04, cx, front_y,
                                 PLINTH + 0.02 + (height - PLINTH - 0.04) / 2, cab)
        elif kind == "oven":
            parts += _oven(col, mats, cx, front_y, PLINTH + 0.30, w)
            parts += _drawer_front(col, mats, w, 0.18, cx, front_y, PLINTH + 0.09, cab)
        x += w

    # Worktop, overhanging the doors slightly.
    parts.append(g.box("worktop", (total + 0.02, depth + 0.02, 0.038),
                       loc=(x0 + total / 2, fy - facing * 0.01, height + 0.019),
                       col=col, mat=mats[worktop], bevel=0.003))
    return parts


def wall_run(col, mats, x0, x1, y, facing, z=1.50, carcass="cab_sage", modules=None):
    parts = []
    cab = mats[carcass]
    total = x1 - x0
    fy = y + facing * WALL_UNIT_D / 2
    front_y = y + facing * (WALL_UNIT_D / 2 - 0.010)

    parts.append(g.box("carcass", (total, WALL_UNIT_D, WALL_UNIT_H),
                       loc=(x0 + total / 2, fy, z + WALL_UNIT_H / 2), col=col, mat=cab))
    n = max(1, round(total / 0.5)) if modules is None else len(modules)
    w = total / n
    for i in range(n):
        cx = x0 + (i + 0.5) * w
        parts += _door_front(col, mats, w, WALL_UNIT_H - 0.02, cx, front_y,
                             z + WALL_UNIT_H / 2, cab, handle_side=-1 if i % 2 else 1)
    return parts


def island(col, mats, cx, cy, w, d, carcass="cab_navy", worktop="worktop",
           overhang=0.32, seats=0):
    """A kitchen island with a breakfast overhang on one side."""
    parts = []
    cab = mats[carcass]
    h = COUNTER_H
    parts.append(g.box("carcass", (w, d, h - PLINTH), loc=(cx, cy, PLINTH + (h - PLINTH) / 2),
                       col=col, mat=cab))
    parts.append(g.box("plinth", (w - 0.06, d - 0.06, PLINTH), loc=(cx, cy, PLINTH / 2),
                       col=col, mat=mats["trim_charcoal"] if "trim_charcoal" in mats else cab))

    n = max(2, round(w / 0.6))
    for i in range(n):
        x = cx - w / 2 + (i + 0.5) * (w / n)
        z = PLINTH + 0.02
        for dh in (0.16, 0.24, 0.28):
            parts += _drawer_front(col, mats, w / n, dh, x, cy - d / 2 + 0.010, z + dh / 2, cab)
            z += dh + 0.006

    parts.append(g.box("top", (w + 0.06, d + overhang + 0.06, 0.042),
                       loc=(cx, cy + overhang / 2, h + 0.021), col=col,
                       mat=mats[worktop], bevel=0.004))
    return parts


def _oven(col, mats, x, y, z, w=0.60):
    """A built-in oven: glass door, steel surround, control strip."""
    parts = []
    steel, black, glass = mats["steel"], mats["black_metal"], mats["glass"]
    parts.append(g.box("oven", (w - 0.02, 0.06, 0.58), loc=(x, y, z + 0.29),
                       col=col, mat=steel, bevel=0.004))
    parts.append(g.box("oven_glass", (w - 0.12, 0.02, 0.36), loc=(x, y - 0.028, z + 0.24),
                       col=col, mat=black))
    parts.append(g.box("oven_panel", (w - 0.04, 0.02, 0.07), loc=(x, y - 0.030, z + 0.52),
                       col=col, mat=black))
    parts.append(g.cylinder("oven_bar", 0.011, w - 0.10, loc=(x, y - 0.055, z + 0.46),
                            rot=(0, math.pi / 2, 0), col=col, mat=steel))
    for s in (-1, 1):
        parts.append(g.cylinder("knob", 0.014, 0.020, loc=(x + s * (w / 2 - 0.07), y - 0.038, z + 0.52),
                                rot=(math.pi / 2, 0, 0), col=col, mat=steel))
    return parts


def hob(col, mats, cx, cy, w=0.75, d=0.52):
    parts = [g.box("hob", (w, d, 0.010), loc=(cx, cy, COUNTER_H + 0.042), col=col,
                   mat=mats["black_metal"], bevel=0.003)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(g.cylinder("ring", 0.085, 0.004,
                                    loc=(cx + sx * w * 0.22, cy + sy * d * 0.22, COUNTER_H + 0.048),
                                    col=col, mat=mats["steel"], segments=24))
    return parts


def extractor(col, mats, cx, cy, z=1.55, w=0.90, d=0.50):
    parts = [
        g.box("hood", (w, d, 0.10), loc=(cx, cy, z), col=col, mat=mats["steel"], bevel=0.006),
        g.box("flue", (0.30, 0.26, 1.10), loc=(cx, cy, z + 0.60), col=col, mat=mats["steel"]),
        g.box("filter", (w - 0.10, d - 0.10, 0.012), loc=(cx, cy, z - 0.052), col=col,
              mat=mats["black_metal"]),
    ]
    return parts


def sink(col, mats, cx, cy, w=0.62, d=0.42):
    parts = [
        g.box("bowl", (w, d, 0.19), loc=(cx, cy, COUNTER_H - 0.055), col=col,
              mat=mats["steel"], bevel=0.012, segments=3),
        g.box("bowl_in", (w - 0.05, d - 0.05, 0.17), loc=(cx, cy, COUNTER_H - 0.040),
              col=col, mat=mats["black_metal"]),
    ]
    parts += tap(col, mats, cx, cy - d / 2 - 0.10, COUNTER_H + 0.038)
    return parts


def tap(col, mats, x, y, z, height=0.30, reach=0.17):
    m = mats["chrome"]
    return [
        g.cylinder("tap_base", 0.026, 0.020, loc=(x, y, z + 0.01), col=col, mat=m),
        g.cylinder("tap_col", 0.017, height, loc=(x, y, z + height / 2), col=col, mat=m),
        g.cylinder("tap_arm", 0.014, reach, loc=(x, y + reach / 2, z + height),
                   rot=(math.pi / 2, 0, 0), col=col, mat=m),
        g.cylinder("tap_out", 0.012, 0.05, loc=(x, y + reach, z + height - 0.025), col=col, mat=m),
        g.box("tap_lever", (0.018, 0.09, 0.016), loc=(x, y - 0.05, z + height * 0.92),
              col=col, mat=m, bevel=0.004),
    ]


def fridge(col, mats, cx, cy, facing=-1, w=0.91, d=0.70, h=1.79):
    """An American-style fridge-freezer in brushed steel."""
    steel = mats["steel"]
    parts = [g.box("fridge", (w, d, h), loc=(cx, cy, h / 2), col=col, mat=steel, bevel=0.008)]
    fy = cy + facing * (d / 2 - 0.004)
    for s in (-1, 1):
        parts.append(g.box("fr_door", (w / 2 - 0.008, 0.03, h - 0.06),
                           loc=(cx + s * w / 4, fy, h / 2), col=col, mat=steel, bevel=0.006))
        parts += _handle(col, mats, cx + s * (w / 4 + (0.16 * -s)), fy + facing * 0.02,
                         h * 0.62, 0.55, vertical=True)
    parts.append(g.box("fr_gap", (0.012, 0.035, h - 0.08), loc=(cx, fy + facing * 0.004, h / 2),
                       col=col, mat=mats["black_metal"]))
    return parts


def tall_housing(col, mats, x0, x1, y, facing, h=2.20, d=0.62, carcass="cab_sage"):
    """A run of full-height units — larder, oven housing, utility cupboards."""
    cab = mats[carcass]
    total = x1 - x0
    fy = y + facing * d / 2
    front_y = y + facing * (d / 2 - 0.010)
    parts = [g.box("tall", (total, d, h - PLINTH),
                   loc=(x0 + total / 2, fy, PLINTH + (h - PLINTH) / 2), col=col, mat=cab),
             g.box("plinth", (total, d - 0.06, PLINTH),
                   loc=(x0 + total / 2, fy - facing * 0.03, PLINTH / 2), col=col,
                   mat=mats["trim_charcoal"] if "trim_charcoal" in mats else cab)]
    n = max(1, round(total / 0.6))
    w = total / n
    for i in range(n):
        cx = x0 + (i + 0.5) * w
        parts += _door_front(col, mats, w, 1.30, cx, front_y, PLINTH + 0.68, cab,
                             handle_side=-1 if i % 2 else 1)
        parts += _door_front(col, mats, w, h - PLINTH - 1.40, cx, front_y,
                             PLINTH + 1.36 + (h - PLINTH - 1.40) / 2, cab,
                             handle_side=-1 if i % 2 else 1)
    return parts


def washer(col, mats, cx, cy, facing=-1, w=0.60, d=0.60, h=0.85, dryer=False):
    steel, black, glass = mats["steel"], mats["black_metal"], mats["glass"]
    fy = cy + facing * (d / 2 - 0.002)
    parts = [g.box("washer", (w, d, h), loc=(cx, cy, h / 2), col=col, mat=steel, bevel=0.006),
             g.box("panel", (w - 0.02, 0.012, 0.10), loc=(cx, fy, h - 0.07), col=col, mat=black),
             g.cylinder("porthole", 0.155, 0.05, loc=(cx, fy, h * 0.48),
                        rot=(math.pi / 2, 0, 0), col=col, mat=black),
             g.cylinder("glass", 0.125, 0.03, loc=(cx, fy + facing * 0.012, h * 0.48),
                        rot=(math.pi / 2, 0, 0), col=col, mat=glass)]
    if not dryer:
        parts.append(g.box("drawer", (0.20, 0.03, 0.07), loc=(cx - w / 4, fy, h - 0.07),
                           col=col, mat=steel))
    return parts


def microwave(col, mats, cx, cy, z, facing=-1, w=0.55, d=0.38, h=0.32):
    steel, black = mats["steel"], mats["black_metal"]
    fy = cy + facing * (d / 2 - 0.002)
    return [g.box("mw", (w, d, h), loc=(cx, cy, z + h / 2), col=col, mat=steel, bevel=0.005),
            g.box("mw_glass", (w * 0.62, 0.012, h - 0.09), loc=(cx - w * 0.16, fy, z + h / 2),
                  col=col, mat=black),
            g.box("mw_panel", (w * 0.24, 0.012, h - 0.09), loc=(cx + w * 0.33, fy, z + h / 2),
                  col=col, mat=black)]


# ---------------------------------------------------------------------
# Bathrooms
# ---------------------------------------------------------------------

def wc(col, mats, x, y, rot=0.0):
    """A back-to-wall pan on a concealed cistern panel."""
    p, tr = mats["porcelain"], mats["trim_white"]
    parts = [
        g.box("cistern", (0.56, 0.22, 0.92), loc=(x, y + 0.11, 0.46), col=col, mat=tr, bevel=0.006),
        g.box("shelf", (0.60, 0.26, 0.028), loc=(x, y + 0.13, 0.935), col=col, mat=tr, bevel=0.004),
        g.box("plate", (0.22, 0.014, 0.13), loc=(x, y - 0.005, 0.80), col=col,
              mat=mats["chrome"], bevel=0.004),
        g.box("pan", (0.37, 0.40, 0.28), loc=(x, y - 0.20, 0.29), col=col, mat=p,
              bevel=0.05, segments=4, shade_smooth=True),
        g.box("bowl", (0.31, 0.34, 0.06), loc=(x, y - 0.22, 0.405), col=col, mat=p,
              bevel=0.03, segments=3, shade_smooth=True),
        g.box("seat", (0.36, 0.42, 0.022), loc=(x, y - 0.21, 0.442), col=col, mat=tr,
              bevel=0.010, segments=3, shade_smooth=True),
        g.box("lid", (0.36, 0.42, 0.020), loc=(x, y - 0.21, 0.463), col=col, mat=tr,
              bevel=0.010, segments=3, shade_smooth=True),
    ]
    return _rotate(parts, x, y, rot)


def basin(col, mats, x, y, z, w=0.50, d=0.36, h=0.13, wall=0.015, segments=5):
    """A countertop basin standing on a surface at height `z`.

    One lofted shell rather than solid boxes: the foot, the outside wall
    flaring up to the rim, a 15 mm rim, the inside wall curving down into
    the bowl, and a floor that falls to the waste. Five loops of 24 points
    and a fan, about 220 triangles, with the rim's edges kept crisp and the
    rest smooth. The foot is tucked a millimetre into the counter and has no
    underside, so no face lies on top of another anywhere.
    """
    r = min(w, d) * 0.32
    depth = 0.10

    def ring(inset, height):
        return [(x + px, y + py, z + height)
                for px, py in g.rounded_rect(w - 2 * inset, d - 2 * inset,
                                             r - inset, segments)]

    floor = z + h - depth - 0.008          # falls 8 mm from the edge to the waste
    shell = g.loft("basin", [
        ring(0.025, -0.001),               # foot, narrower than the rim
        ring(0.0, h),                      # outside edge of the rim
        ring(wall, h),                     # inside edge of the rim
        ring(wall + 0.018, h - 0.06),      # bowl wall
        ring(wall + 0.055, h - depth),     # edge of the bowl floor
    ], center=(x, y, floor), sharp=(1, 2), col=col, mat=mats["porcelain"])

    # The waste stands 3 mm proud of the floor rather than flush with it.
    waste = g.cylinder("waste", 0.022, 0.004, loc=(x, y, floor + 0.001), col=col,
                       mat=mats["chrome"], segments=12)
    return [shell, waste]


def basin_mixer(col, mats, x, y, z, height=0.22, reach=0.14, segments=12):
    """A single-lever basin mixer on a surface at height `z`: a column, a
    spout reaching forward (+Y) over the bowl, the lever on top pointing
    sideways so it never reaches back into the wall. Parts overlap by a few
    millimetres where they meet instead of sharing a face."""
    c = mats["chrome"]
    spout_z = z + height - 0.014
    return [
        g.cylinder("mixer_base", 0.026, 0.012, loc=(x, y, z + 0.005), col=col, mat=c,
                   segments=segments),
        g.cylinder("mixer_body", 0.016, height - 0.009, loc=(x, y, z + 0.009 + (height - 0.009) / 2),
                   col=col, mat=c, segments=segments),
        g.cylinder("spout", 0.011, reach, loc=(x, y + reach / 2, spout_z),
                   rot=(math.pi / 2, 0, 0), col=col, mat=c, segments=segments),
        g.cylinder("outlet", 0.012, 0.028, loc=(x, y + reach - 0.004, spout_z - 0.012), col=col,
                   mat=c, segments=segments),
        g.box("lever", (0.075, 0.014, 0.012), loc=(x + 0.030, y, z + height + 0.004), col=col,
              mat=c),
    ]


def vanity(col, mats, x, y, w=1.10, d=0.50, rot=0.0, carcass="cab_oak", basins=1):
    """A wall-hung vanity with countertop basins and a mirror over each.

    The wall is on the -Y side (y); the drawers face +Y. Each basin sits
    5 cm back from the counter's front edge with its mixer standing clear
    behind it, 2 cm off the basin and well off the wall.
    """
    cab = mats[carcass]
    h = 0.52
    z0 = 0.34
    top = z0 + h + 0.030                  # the counter's surface
    front = y + d

    # The carcass stops 2 cm short of the front so the drawer fronts sit on
    # it with a millimetre's gap, not buried in it.
    parts = [g.box("vanity", (w, d - 0.02, h), loc=(x, y + (d - 0.02) / 2, z0 + h / 2),
                   col=col, mat=cab, bevel=0.004)]
    for i in range(2):
        parts += _drawer_front(col, mats, w - 0.02, h / 2 - 0.008, x, front - 0.0095,
                               z0 + h * (0.27 + 0.5 * i), cab, facing=1, segments=10)
    parts.append(g.box("top", (w + 0.02, d + 0.02, 0.030), loc=(x, y + d / 2, z0 + h + 0.015),
                       col=col, mat=mats["worktop"], bevel=0.003))

    bw = min(0.50, w / basins - 0.10)
    bd = min(0.36, d - 0.14)
    by = front - 0.05 - bd / 2
    mixer_y = by - bd / 2 - 0.035
    for i in range(basins):
        bx = x if basins == 1 else x - w / 4 + i * w / 2
        parts += basin(col, mats, bx, by, top, w=bw, d=bd)
        parts += basin_mixer(col, mats, bx, mixer_y, top, reach=(by - mixer_y) * 0.75)
        # Mirror over each basin.
        parts.append(g.box("mirror", (0.60, 0.022, 0.80), loc=(bx, y + 0.012, 1.62),
                           col=col, mat=mats["trim_white"], bevel=0.004))
        parts.append(g.box("glass", (0.56, 0.006, 0.76), loc=(bx, y + 0.026, 1.62),
                           col=col, mat=mats["mirror"]))
    return _rotate(parts, x, y, rot)


def bath(col, mats, x, y, w=1.70, d=0.75, rot=0.0, shower_over=False):
    """A bath with its back edge on `y`, 20 mm off the wall behind it.

    With `shower_over`, a shower kit on that wall towards the -X end and a
    fixed glass screen across that end, in a channel on the wall.
    """
    p, tr = mats["porcelain"], mats["trim_white"]
    h = 0.56
    parts = [
        g.box("bath_out", (w, d, h), loc=(x, y + d / 2, h / 2), col=col, mat=p,
              bevel=0.030, segments=3, shade_smooth=True),
        g.box("bath_in", (w - 0.11, d - 0.11, h - 0.09), loc=(x, y + d / 2, h / 2 + 0.075),
              col=col, mat=p, bevel=0.055, segments=4, shade_smooth=True),
        g.box("rim", (w + 0.01, d + 0.01, 0.03), loc=(x, y + d / 2, h - 0.015),
              col=col, mat=p, bevel=0.012, segments=3, shade_smooth=True),
    ]
    parts += tap(col, mats, x, y + 0.07, h - 0.02, height=0.16, reach=0.16)
    if shower_over:
        wall = y - 0.02
        parts += _shower_kit(col, mats, x - w / 2 + 0.45, wall, reach=0.32)
        # The screen stands on the end of the rim, 2 mm down into it, and
        # runs from a wall channel to 30 mm short of the front edge.
        sx, top = x - w / 2 + 0.03, h + 1.40
        parts += [
            g.box("screen", (0.008, y + d - 0.03 - (wall + 0.006), top - (h - 0.002)),
                  loc=(sx, (wall + 0.006 + y + d - 0.03) / 2, (h - 0.002 + top) / 2),
                  col=col, mat=mats["glass"]),
            g.box("screen_channel", (0.016, 0.021, top - h + 0.002),
                  loc=(sx, wall + 0.0095, (h - 0.001 + top + 0.001) / 2),
                  col=col, mat=mats["chrome"]),
        ]
    return _rotate(parts, x, y, rot)


def _shower_kit(col, mats, x, y, zv=1.05, top=2.05, reach=0.30):
    """A thermostatic bar valve with a rigid riser, an overhead rain head and
    a handset on a slider, fed by a hose hanging in a loop.

    `y` is the face of the wall it is fixed to, and it stands off that face
    towards +Y. `zv` is the valve's centre line and `top` the arm's. Every
    joint overlaps by a millimetre or two rather than meeting face to face.
    """
    c, dark = mats["chrome"], mats["trim_charcoal"]
    along_x, along_y = (0, math.pi / 2, 0), (math.pi / 2, 0, 0)
    off = 0.075                          # the bar's centre line, off the wall
    parts = []

    # Bar valve on two legs at 150 mm centres, each with a cover plate on
    # the wall, and a temperature and a flow knob on its ends.
    for s in (-1, 1):
        parts += [
            g.cylinder("valve_plate", 0.030, 0.012, loc=(x + s * 0.075, y + 0.005, zv),
                       rot=along_y, col=col, mat=c, segments=16),
            g.cylinder("valve_leg", 0.013, off + 0.002, loc=(x + s * 0.075, y + off / 2, zv),
                       rot=along_y, col=col, mat=c, segments=10),
            g.cylinder("valve_knob", 0.029, 0.048, loc=(x + s * 0.170, y + off, zv),
                       rot=along_x, col=col, mat=c, segments=16),
        ]
    parts += [
        g.cylinder("valve", 0.024, 0.30, loc=(x, y + off, zv), rot=along_x, col=col, mat=c,
                   segments=16),
        g.cylinder("valve_outlet", 0.010, 0.030, loc=(x + 0.09, y + off, zv - 0.036), col=col,
                   mat=c, segments=8),
    ]

    # Riser up to an elbow, braced to the wall near the top, and an arm
    # reaching out to a slim rain head with a dark nozzle plate under it.
    rz0 = zv + 0.015
    parts += [
        g.cylinder("riser", 0.011, top - rz0, loc=(x, y + off, (top + rz0) / 2), col=col, mat=c,
                   segments=10),
        g.cylinder("riser_bracket", 0.009, off + 0.002, loc=(x, y + off / 2, top - 0.30),
                   rot=along_y, col=col, mat=c, segments=10),
        g.cylinder("riser_plate", 0.024, 0.012, loc=(x, y + 0.005, top - 0.30), rot=along_y,
                   col=col, mat=c, segments=16),
        g.sphere("elbow", 0.016, loc=(x, y + off, top), col=col, mat=c, subdivisions=1),
        g.cylinder("arm", 0.011, reach - off, loc=(x, y + (off + reach) / 2, top), rot=along_y,
                   col=col, mat=c, segments=10),
        g.cylinder("swivel", 0.013, 0.030, loc=(x, y + reach, top - 0.012), col=col, mat=c,
                   segments=10),
        g.cylinder("rain_head", 0.125, 0.010, loc=(x, y + reach, top - 0.031), col=col, mat=c,
                   segments=24),
        g.cylinder("nozzles", 0.105, 0.003, loc=(x, y + reach, top - 0.037), col=col, mat=dark,
                   segments=24),
    ]

    # Handset resting in a cradle on a slider, leaning out from the riser.
    zs = zv + 0.55
    a = 0.28
    u = Vector((0, math.sin(a), math.cos(a)))       # along the handle, head up
    n = Vector((0, math.cos(a), -math.sin(a)))      # the way the spray faces
    hc = Vector((x, y + off + 0.05, zs + 0.03))
    head = hc + u * 0.135
    face = (-(math.pi / 2 + a), 0, 0)
    parts += [
        g.box("slider", (0.034, 0.036, 0.05), loc=(x, y + off, zs), col=col, mat=c, bevel=0.004,
              segments=1),
        g.box("cradle", (0.030, 0.034, 0.028), loc=(x, y + off + 0.03, zs), col=col, mat=c,
              bevel=0.003, segments=1),
        g.cylinder("handset", 0.012, 0.20, loc=hc, rot=(-a, 0, 0), col=col, mat=c, segments=10),
        g.cylinder("handset_head", 0.048, 0.024, loc=head, rot=face, col=col, mat=c, segments=16),
        g.cylinder("handset_face", 0.038, 0.003, loc=head + n * 0.0125, rot=face, col=col,
                   mat=dark, segments=16),
    ]

    # Hose from under the valve, down in a loop and up into the handset's
    # tail, passing in front of the bar and clear of the riser.
    tail = hc - u * 0.10
    path = g.catmull_rom([
        (x + 0.09, y + off, zv - 0.045),
        (x + 0.09, y + off + 0.012, zv - 0.20),
        (x + 0.065, y + off + 0.035, zv - 0.43),
        (x + 0.02, y + off + 0.055, zv - 0.38),
        (x + 0.004, y + off + 0.062, zv - 0.10),
        (x, y + off + 0.055, zv + 0.25),
        tail - u * 0.01,
        tail + u * 0.012,
    ], steps=3)
    parts.append(g.sweep("hose", path, 0.0065, sides=6, col=col, mat=c))
    return parts


def _caddy(col, mats, x, y, z):
    """A brushed-steel corner shelf with a lip and two bottles on it; (x, y)
    is the corner of the tiles, and the shelf runs out along +X and +Y."""
    s = 0.20
    steel = mats["steel"]
    parts = [
        g.prism("shelf", [(x - 0.001, y - 0.001), (x + s, y - 0.001), (x - 0.001, y + s)], 0.008,
                loc=(0, 0, z), col=col, mat=steel),
        g.cylinder("shelf_lip", 0.004, s * math.sqrt(2) - 0.02, loc=(x + s / 2, y + s / 2, z + 0.011),
                   rot=(0, math.pi / 2, 3 * math.pi / 4), col=col, mat=steel, segments=8),
    ]
    base = z + 0.007
    for bx, by, r, h, mat in ((0.075, 0.032, 0.026, 0.19, "bottle_white"),
                              (0.034, 0.090, 0.030, 0.15, "bottle_sage")):
        parts += [
            g.cylinder("bottle", r, h, loc=(x + bx, y + by, base + h / 2), col=col, mat=mats[mat],
                       segments=12),
            g.cylinder("bottle_cap", r * 0.55, 0.03, loc=(x + bx, y + by, base + h + 0.013),
                       col=col, mat=mats["trim_charcoal"], segments=12),
        ]
    return parts


def shower(col, mats, x, y, w=1.00, d=0.90, rot=0.0, door="front", window=None):
    """A corner shower: a stone tray, tiled walls, a frameless glass
    enclosure with a hinged door, and a thermostatic valve feeding a rain
    head and a handset.

    (x, y) is the corner it is built into. At rot=0 the walls are on -X (the
    side) and -Y (the back, where the valve is), and the shower runs `w`
    along +X and `d` along +Y; `rot` turns it about that corner to suit the
    room. The door is in the +Y face, hung off the side wall, or with
    door="side" in the +X face, hung off the back wall.

    `window` = (start, end, sill) is a window in the side wall: between
    `start` and `end`, measured along that wall from the back one, the tiles
    stop at `sill`, and glass meeting the wall there stands clear of the
    window board.

    Everything stands 20 mm off both walls, clear of the skirting, and the
    tiles are panels of their own, so nothing lies on a wall's face. No two
    faces anywhere share a plane where they meet: parts overlap by a
    millimetre or two instead.
    """
    c, gl, seal = mats["chrome"], mats["glass"], mats["seal"]
    tile, trim = mats["tile_shower"], mats["steel"]

    G = 0.02                         # off each wall
    TH = 0.010                       # tile and adhesive
    T = 0.045                        # tray height
    TILE_H = 2.10
    GT = 0.008                       # glass
    fx, by = G + TH, G + TH          # faces of the side and back tiles
    gx, gy = w - 0.025, d - 0.025    # centre lines of the side and front glass
    gz0, gz1 = T + 0.004, T + 1.95   # fixed glass, standing in its channels

    def at(lx, ly, lz):
        return (x + lx, y + ly, lz)

    def slab(name, x0, x1, y0, y1, z0, z1, mat, **kw):
        return g.box(name, (x1 - x0, y1 - y0, z1 - z0),
                     loc=at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), col=col, mat=mat, **kw)

    # Tray: a flat 45 mm border, a 4 mm step down, and a floor falling a
    # further 8 mm to the waste in four planes, like a stone tray. Flat
    # shaded, with no underside, standing a millimetre into the floor.
    tw, td = w - G, d - G
    tcx, tcy = G + tw / 2, G + td / 2

    def ring(inset, z):
        return [at(tcx + px, tcy + py, z)
                for px, py in g.rounded_rect(tw - 2 * inset, td - 2 * inset, 0.008, 1)]

    wz = T - 0.012
    parts = [
        g.loft("tray", [ring(0.0, -0.001), ring(0.0, T), ring(0.045, T), ring(0.052, T - 0.004)],
               center=at(tcx, tcy, wz), col=col, mat=mats["stone_slate"], smooth=False),
        g.cylinder("waste", 0.045, 0.005, loc=at(tcx, tcy, wz + 0.0015), col=col, mat=c,
                   segments=16),
    ]
    for i in range(4):
        dy = -0.015 + i * 0.010
        parts.append(g.box("waste_slot", (2 * math.sqrt(0.034 ** 2 - dy ** 2), 0.004, 0.002),
                           loc=at(tcx, tcy + dy, wz + 0.004), col=col, mat=mats["trim_charcoal"]))

    # Tiles on both walls, sitting 2 mm down into the tray's border, capped
    # and edged with a steel trim that stands a millimetre proud. The side
    # wall's run steps down under a window, if there is one.
    side0, side1 = G + TH - 0.001, d - 0.004
    spans = [(side0, side1, TILE_H)]
    if window:
        a, b, low = window
        a, b = max(side0, min(a, side1)), max(side0, min(b, side1))
        spans = [span for span in ((side0, a, TILE_H),
                                   (max(side0, a - 0.001), b, low),
                                   (max(side0, b - 0.001), side1, TILE_H))
                 if span[1] - span[0] > 0.01]

    def tile_top(ly):
        """How high the side wall is tiled `ly` along it."""
        return min((top for s0, s1, top in spans if s0 <= ly <= s1), default=TILE_H)

    parts += [
        slab("tiles_back", G, w - 0.004, G, G + TH, T - 0.002, TILE_H, tile),
        slab("trim", G, w - 0.004, G + 0.001, G + TH + 0.002, TILE_H - 0.002, TILE_H + 0.004, trim),
        slab("trim", w - 0.006, w - 0.001, G + 0.001, G + TH + 0.003, T - 0.001, TILE_H + 0.005, trim),
        slab("trim", G + 0.001, G + TH + 0.003, side1 - 0.002, side1 + 0.003, T - 0.001,
             spans[-1][2] + 0.005, trim),
    ]
    for s0, s1, top in spans:
        parts += [
            slab("tiles_side", G, G + TH, s0, s1, T - 0.002, top, tile),
            slab("trim", G + 0.001, G + TH + 0.002, s0, s1, top - 0.002, top + 0.0045, trim),
        ]
    # An upright trim on the tall tiles' edge wherever they step down.
    for (s0, s1, t0), (u0, u1, t1) in zip(spans, spans[1:]):
        if t0 > t1:
            parts.append(slab("trim", G + 0.001, G + TH + 0.003, s1 - 0.002, s1 + 0.003,
                              t1, t0 + 0.005, trim))
        elif t1 > t0:
            parts.append(slab("trim", G + 0.001, G + TH + 0.003, u0 - 0.003, u0 + 0.002,
                              t0, t1 + 0.005, trim))

    # The enclosure is laid out along the door's run: `u` runs along it
    # from the wall the door hangs off, `v` across it. For a front door
    # that is x and y; for a side door, y and x.
    swap = door == "side"

    def run(name, u0, u1, v0, v1, z0, z1, mat, **kw):
        if swap:
            return slab(name, v0, v1, u0, u1, z0, z1, mat, **kw)
        return slab(name, u0, u1, v0, v1, z0, z1, mat, **kw)

    def run_at(u, v, z):
        return at(v, u, z) if swap else at(u, v, z)

    along_u = (math.pi / 2, 0, 0) if swap else (0, math.pi / 2, 0)
    along_v = (0, math.pi / 2, 0) if swap else (math.pi / 2, 0, 0)
    hinge = by if swap else fx       # tiles the door hangs off
    wall = fx if swap else by        # tiles the fixed return panel starts from
    gv = gx if swap else gy          # the door run's centre line
    gu = gy if swap else gx          # the return panel's centre line
    # Where the return panel meets the side wall under a window, its channel
    # stops with the tiles and the glass stands clear of the window board.
    wall_top = tile_top(gy) if swap else TILE_H
    clear = 0.006 if wall_top >= gz1 else 0.038

    # Fixed glass: a return panel from its wall channel to 2 mm short of the
    # door run, and an in-line panel beside the door running to the return
    # panel's outer face, both in low floor channels and clamped together.
    door_w = min(0.60, gu - hinge - 0.20)
    ud0 = hinge + 0.006              # hinge side
    ud1 = ud0 + door_w               # closing edge
    ui0 = ud1 + 0.004                # in-line panel
    ret1 = gv - GT / 2 - 0.002
    parts += [
        run("glass_side", gu - GT / 2, gu + GT / 2, wall + clear, ret1, gz0, gz1, gl),
        run("glass_fixed", ui0, gu + GT / 2, gv - GT / 2, gv + GT / 2, gz0, gz1, gl),
        run("channel", gu - 0.008, gu + 0.008, wall - 0.001, wall + clear + 0.014,
            T - 0.001, min(gz1, wall_top) + 0.001, c),
        run("channel", gu - 0.0075, gu + 0.0075, wall + clear + 0.013, ret1, T - 0.001, T + 0.011, c),
        run("channel", ui0, gu - 0.007, gv - 0.0075, gv + 0.0075, T - 0.001, T + 0.011, c),
    ]
    for z in (T + 0.25, T + 1.70):
        parts.append(run("clamp", gu - 0.014, gu + 0.014, gv - 0.014, gv + 0.014,
                         z - 0.02, z + 0.02, c))

    # Door, hung on two hinges, with a sweep seal under it, a magnetic seal
    # on its closing edge and a pull handle through it.
    dz0, dz1 = T + 0.012, gz1 - 0.015
    parts += [
        run("door", ud0, ud1, gv - GT / 2, gv + GT / 2, dz0, dz1, gl),
        run("door_sweep", ud0 + 0.005, ud1 - 0.005, gv - 0.006, gv + 0.006, T + 0.003, T + 0.017, seal),
        run("door_seal", ud1 - 0.001, ud1 + 0.003, gv - 0.007, gv + 0.007, dz0 + 0.001, dz1 - 0.001, seal),
    ]
    for z in (T + 0.28, T + 1.62):
        parts += [
            run("hinge_plate", hinge - 0.001, hinge + 0.009, gv - 0.0225, gv + 0.0225,
                z - 0.0425, z + 0.0425, c, bevel=0.002, segments=1),
            run("hinge", hinge + 0.008, hinge + 0.078, gv - 0.011, gv + 0.011,
                z - 0.0275, z + 0.0275, c, bevel=0.002, segments=1),
        ]
    hu, hz = ud1 - 0.06, 1.05
    reach = GT / 2 + 0.035
    for s in (-1, 1):
        parts.append(g.cylinder("handle", 0.0095, 0.30, loc=run_at(hu, gv + s * reach, hz), col=col,
                                mat=c, segments=10))
        parts.append(g.cylinder("handle_post", 0.006, 2 * reach + 0.004,
                                loc=run_at(hu, gv, hz + s * 0.11), rot=along_v,
                                col=col, mat=c, segments=8))

    # Stabiliser bar over the door, from the wall it hangs off to a clamp on
    # the in-line panel's top edge, high enough for the door to clear it.
    bz = gz1 + 0.006
    parts += [
        g.cylinder("bar", 0.009, ui0 + 0.03 - (hinge - 0.001),
                   loc=run_at((hinge - 0.001 + ui0 + 0.03) / 2, gv, bz), rot=along_u,
                   col=col, mat=c, segments=10),
        g.cylinder("bar_plate", 0.020, 0.012, loc=run_at(hinge + 0.005, gv, bz), rot=along_u,
                   col=col, mat=c, segments=16),
        run("bar_clamp", ui0 + 0.002, ui0 + 0.052, gv - 0.011, gv + 0.011, gz1 - 0.03, gz1 + 0.018, c),
    ]

    # Valve and heads centred on the back wall, the rain head over the
    # middle of the tray; a corner shelf where the two walls meet.
    parts += _shower_kit(col, mats, x + (fx + gx) / 2, y + by, reach=max(0.28, tcy - by))
    parts += _caddy(col, mats, x + fx, y + by, 1.25)
    return _rotate(parts, x, y, rot)


def towel_rail(col, mats, x, y, rot=0.0, w=0.60, h=0.95):
    c = mats["chrome"]
    parts = [g.box("rail_v", (0.028, 0.028, h), loc=(x - w / 2, y, 0.90 + h / 2), col=col, mat=c),
             g.box("rail_v", (0.028, 0.028, h), loc=(x + w / 2, y, 0.90 + h / 2), col=col, mat=c)]
    for i in range(7):
        parts.append(g.cylinder("bar", 0.011, w, loc=(x, y, 0.98 + i * h / 7),
                                rot=(0, math.pi / 2, 0), col=col, mat=c))
    return _rotate(parts, x, y, rot)


# ---------------------------------------------------------------------
# Bedrooms
# ---------------------------------------------------------------------

def bed(col, mats, x, y, w=1.55, l=2.05, rot=0.0, frame="cab_oak",
        linen="linen_white", throw="fabric_grey"):
    """An upholstered-headboard bed, made up with a duvet and pillows."""
    fr, ln = mats[frame], mats[linen]
    base_h, mat_h = 0.28, 0.26
    parts = [
        g.box("base", (w, l, base_h), loc=(x, y + l / 2, base_h / 2 + 0.06), col=col,
              mat=fr, bevel=0.006),
        g.box("head", (w + 0.06, 0.09, 1.05), loc=(x, y - 0.02, 0.55), col=col,
              mat=mats[throw], bevel=0.020, segments=3, shade_smooth=True),
        g.box("mattress", (w - 0.03, l - 0.03, mat_h), loc=(x, y + l / 2, base_h + mat_h / 2 + 0.06),
              col=col, mat=ln, bevel=0.030, segments=3, shade_smooth=True),
    ]
    top = base_h + mat_h + 0.06
    # Duvet, turned back at the head end.
    parts.append(g.box("duvet", (w + 0.05, l - 0.62, 0.11),
                       loc=(x, y + 0.42 + (l - 0.62) / 2, top + 0.045), col=col,
                       mat=ln, bevel=0.045, segments=3, shade_smooth=True))
    parts.append(g.box("throw", (w + 0.05, 0.62, 0.055),
                       loc=(x, y + l - 0.44, top + 0.09), col=col, mat=mats[throw],
                       bevel=0.026, segments=3, shade_smooth=True))
    for s in (-1, 1):
        parts.append(g.box("pillow", (w / 2 - 0.06, 0.36, 0.13),
                           loc=(x + s * (w / 4 - 0.005), y + 0.26, top + 0.065), col=col,
                           mat=ln, bevel=0.055, segments=4, shade_smooth=True))
    for sx in (-1, 1):
        for sy in (0.12, l - 0.12):
            parts.append(g.box("leg", (0.05, 0.05, 0.07),
                               loc=(x + sx * (w / 2 - 0.06), y + sy, 0.035), col=col, mat=fr))
    return _rotate(parts, x, y, rot)


def nightstand(col, mats, x, y, rot=0.0, w=0.46, d=0.40, h=0.52, carcass="cab_oak"):
    cab = mats[carcass]
    parts = [g.box("ns", (w, d, h - 0.10), loc=(x, y, 0.10 + (h - 0.10) / 2), col=col,
                   mat=cab, bevel=0.005)]
    for i in range(2):
        parts += _drawer_front(col, mats, w - 0.02, (h - 0.13) / 2, x, y - d / 2 + 0.010,
                               0.13 + (h - 0.13) * (0.25 + 0.5 * i), cab)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(g.cylinder("leg", 0.016, 0.10,
                                    loc=(x + sx * (w / 2 - 0.05), y + sy * (d / 2 - 0.05), 0.05),
                                    col=col, mat=mats["black_metal"]))
    return _rotate(parts, x, y, rot)


def wardrobe(col, mats, x0, x1, y, facing=-1, h=2.30, d=0.62, carcass="cab_white"):
    """A run of full-height wardrobes with a cornice."""
    cab = mats[carcass]
    total = x1 - x0
    fy = y + facing * d / 2
    front_y = y + facing * (d / 2 - 0.011)
    parts = [g.box("wr", (total, d, h), loc=(x0 + total / 2, fy, h / 2), col=col,
                   mat=cab, bevel=0.004),
             g.bar("cornice", g.CORNICE, total + 0.04,
                   loc=(x0 - 0.02, fy - facing * (d / 2 + 0.02), h),
                   rot=(0, 0, 0), col=col, mat=mats["trim_white"])]
    n = max(2, round(total / 0.60))
    w = total / n
    for i in range(n):
        cx = x0 + (i + 0.5) * w
        parts += _door_front(col, mats, w, h - 0.05, cx, front_y, h / 2, cab,
                             handle_side=-1 if i % 2 else 1)
    return parts


def desk(col, mats, x, y, w=1.40, d=0.62, rot=0.0, top="cab_oak"):
    t = mats[top]
    h = 0.74
    parts = [g.box("top", (w, d, 0.032), loc=(x, y, h), col=col, mat=t, bevel=0.004)]
    for sx in (-1, 1):
        parts.append(g.box("leg", (0.045, d - 0.08, h - 0.03),
                           loc=(x + sx * (w / 2 - 0.06), y, (h - 0.03) / 2), col=col,
                           mat=mats["black_metal"]))
    parts.append(g.box("rail", (w - 0.20, 0.030, 0.09), loc=(x, y + d / 2 - 0.08, h - 0.13),
                       col=col, mat=mats["black_metal"]))
    return _rotate(parts, x, y, rot)


def shelving(col, mats, x0, x1, y, z0=0.0, h=2.10, d=0.30, shelves=5,
             carcass="cab_white", rot=0.0):
    cab = mats[carcass]
    total = x1 - x0
    parts = [
        g.box("side", (0.022, d, h), loc=(x0, y, z0 + h / 2), col=col, mat=cab),
        g.box("side", (0.022, d, h), loc=(x1, y, z0 + h / 2), col=col, mat=cab),
        g.box("back", (total, 0.014, h), loc=(x0 + total / 2, y + d / 2, z0 + h / 2),
              col=col, mat=cab),
    ]
    for i in range(shelves + 1):
        parts.append(g.box("shelf", (total, d, 0.022),
                           loc=(x0 + total / 2, y, z0 + i * h / shelves), col=col,
                           mat=cab, bevel=0.003))
    return parts


def rug(col, mats, cx, cy, w, d, mat="fabric_grey", z=0.004):
    return [g.box("rug", (w, d, 0.012), loc=(cx, cy, z + 0.006), col=col,
                  mat=mats[mat], bevel=0.004)]


def _rotate(parts, px, py, angle):
    """Spin a group of parts about a plan point, for pieces set against a wall
    that does not run along X."""
    if not angle:
        return parts
    import mathutils
    m = (mathutils.Matrix.Translation((px, py, 0)) @
         mathutils.Matrix.Rotation(angle, 4, "Z") @
         mathutils.Matrix.Translation((-px, -py, 0)))
    for p in parts:
        p.matrix_basis = m @ p.matrix_basis
    return parts

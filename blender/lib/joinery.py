"""Built-in joinery, sanitaryware and appliances.

These are the pieces that have to fit the architecture exactly — a kitchen run
that stops short of the wall, or a bath that does not span its alcove, reads as
a mistake in a way a slightly-wrong armchair never does. Everything here is
parametric so it can be sized to the room it goes in.

Loose furniture comes from the Poly Haven catalogue instead; see assets.py.
"""

import math

from . import geometry as g

PLINTH = 0.10          # recess under a base unit
COUNTER_H = 0.92       # worktop height
COUNTER_D = 0.635
WALL_UNIT_H = 0.72
WALL_UNIT_D = 0.33


def _handle(col, mats, x, y, z, length=0.16, vertical=False, style="bar"):
    """A brushed bar handle on two stand-offs."""
    m = mats["steel"]
    parts = []
    # A cylinder is born along Z, so a vertical handle needs no rotation and
    # a horizontal one a quarter turn about Y.
    axis = (0, 0, 0) if vertical else (0, math.pi / 2, 0)
    parts.append(g.cylinder("h", 0.008, length, loc=(x, y, z), rot=axis, col=col, mat=m))
    for s in (-1, 1):
        off = (s * length / 2 * 0.75, 0, 0) if not vertical else (0, 0, s * length / 2 * 0.75)
        parts.append(g.cylinder("hs", 0.005, 0.028,
                                loc=(x + off[0], y + 0.014, z + off[2]),
                                rot=(math.pi / 2, 0, 0), col=col, mat=m))
    return parts


def _door_front(col, mats, w, h, x, y, z, mat, handle_side=1, gap=0.003):
    """A slab cabinet door with a shadow gap and a handle."""
    parts = [g.box("front", (w - gap * 2, 0.019, h - gap * 2), loc=(x, y, z),
                   col=col, mat=mat, bevel=0.002)]
    parts += _handle(col, mats, x + handle_side * (w / 2 - 0.055), y - 0.020, z, 0.14, vertical=True)
    return parts


def _drawer_front(col, mats, w, h, x, y, z, mat):
    parts = [g.box("front", (w - 0.006, 0.019, h - 0.006), loc=(x, y, z),
                   col=col, mat=mat, bevel=0.002)]
    parts += _handle(col, mats, x, y - 0.020, z, min(0.30, w * 0.5))
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


def vanity(col, mats, x, y, w=1.10, d=0.50, rot=0.0, carcass="cab_oak", basins=1):
    """A wall-hung vanity with a counter-top basin and mirror over."""
    cab, p = mats[carcass], mats["porcelain"]
    h = 0.52
    z0 = 0.34
    parts = [g.box("vanity", (w, d, h), loc=(x, y + d / 2, z0 + h / 2), col=col,
                   mat=cab, bevel=0.004)]
    for i in range(2):
        parts += _drawer_front(col, mats, w - 0.02, h / 2 - 0.008, x,
                               y + 0.010, z0 + h * (0.27 + 0.5 * i), cab)
    parts.append(g.box("top", (w + 0.02, d + 0.02, 0.030), loc=(x, y + d / 2, z0 + h + 0.015),
                       col=col, mat=mats["worktop"], bevel=0.003))

    for i in range(basins):
        bx = x if basins == 1 else x - w / 4 + i * w / 2
        parts.append(g.box("basin", (0.44, 0.34, 0.12), loc=(bx, y + d / 2, z0 + h + 0.09),
                           col=col, mat=p, bevel=0.045, segments=4, shade_smooth=True))
        parts.append(g.box("basin_in", (0.38, 0.28, 0.09), loc=(bx, y + d / 2, z0 + h + 0.105),
                           col=col, mat=p, bevel=0.035, segments=3, shade_smooth=True))
        parts += tap(col, mats, bx, y + 0.10, z0 + h + 0.03, height=0.22, reach=0.13)
        # Mirror over each basin.
        parts.append(g.box("mirror", (0.60, 0.022, 0.80), loc=(bx, y + 0.012, 1.62),
                           col=col, mat=mats["trim_white"], bevel=0.004))
        parts.append(g.box("glass", (0.56, 0.006, 0.76), loc=(bx, y + 0.026, 1.62),
                           col=col, mat=mats["mirror"]))
    return _rotate(parts, x, y, rot)


def bath(col, mats, x, y, w=1.70, d=0.75, rot=0.0, shower_over=False):
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
        parts += _shower_kit(col, mats, x, y + 0.05, wall=True)
        parts.append(g.box("screen", (0.020, d - 0.02, 1.45),
                           loc=(x - w / 2 + 0.01, y + d / 2, h + 0.725), col=col, mat=mats["glass"]))
    return _rotate(parts, x, y, rot)


def _shower_kit(col, mats, x, y, wall=False, z=2.05):
    c = mats["chrome"]
    parts = [
        g.box("riser", (0.05, 0.03, 1.05), loc=(x, y + 0.02, 1.35), col=col, mat=c, bevel=0.006),
        g.cylinder("arm", 0.016, 0.30, loc=(x, y + 0.16, z), rot=(math.pi / 2, 0, 0), col=col, mat=c),
        g.cylinder("head", 0.115, 0.030, loc=(x, y + 0.30, z - 0.02), col=col, mat=c, segments=28),
        g.box("valve", (0.16, 0.055, 0.16), loc=(x, y + 0.03, 1.05), col=col, mat=c, bevel=0.010),
    ]
    return parts


def shower(col, mats, x0, y0, x1, y1, tray_h=0.06, door_side="x1"):
    """A glazed shower enclosure on a low tray."""
    p, c, gl = mats["porcelain"], mats["chrome"], mats["glass"]
    w, d = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    parts = [
        g.box("tray", (w, d, tray_h), loc=(cx, cy, tray_h / 2), col=col, mat=p, bevel=0.010),
        g.cylinder("waste", 0.045, 0.006, loc=(cx, cy, tray_h + 0.002), col=col, mat=c),
    ]
    # Two glazed sides with slim posts; the other two are tiled wall.
    parts.append(g.box("scr_a", (0.010, d, 1.95), loc=(x1, cy, tray_h + 0.975), col=col, mat=gl))
    parts.append(g.box("scr_b", (w, 0.010, 1.95), loc=(cx, y1, tray_h + 0.975), col=col, mat=gl))
    parts.append(g.box("post", (0.032, 0.032, 2.00), loc=(x1, y1, tray_h + 1.0), col=col, mat=c))
    parts.append(g.box("rail", (w, 0.028, 0.028), loc=(cx, y1, tray_h + 1.96), col=col, mat=c))
    parts += _shower_kit(col, mats, cx, y0 + 0.02)
    return parts


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

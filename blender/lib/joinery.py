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


#: A front's thickness, the gap round it, and how far a carcass stops short
#: of its fronts so they stand on it rather than being buried in it.
FRONT_T = 0.019
FRONT_GAP = 0.003
FRONT_SET = FRONT_T + 0.002


def _door_front(col, mats, w, h, x, y, z, mat, handle_side=1, gap=FRONT_GAP, facing=-1,
                handle=True):
    """A slab cabinet door, `y` the middle of its thickness, facing
    `facing` (-1: -Y, +1: +Y), with a shadow gap round it and a bar handle
    on its opening edge."""
    parts = [g.box("front", (w - gap * 2, FRONT_T, h - gap * 2), loc=(x, y, z),
                   col=col, mat=mat, bevel=0.003)]
    if handle:
        parts += _handle(col, mats, x + handle_side * (w / 2 - 0.055), y + facing * 0.020, z,
                         min(0.18, h * 0.4), vertical=True, facing=facing)
    return parts


def _drawer_front(col, mats, w, h, x, y, z, mat, facing=-1, segments=32):
    parts = [g.box("front", (w - FRONT_GAP * 2, FRONT_T, h - FRONT_GAP * 2), loc=(x, y, z),
                   col=col, mat=mat, bevel=0.003)]
    parts += _handle(col, mats, x, y + facing * 0.020, z, min(0.30, w * 0.5), facing=facing,
                     segments=segments)
    return parts


# ---------------------------------------------------------------------
# Kitchen
# ---------------------------------------------------------------------

def base_run(col, mats, x0, x1, y, facing, carcass="cab_sage", worktop="worktop",
             modules=None, height=COUNTER_H, depth=COUNTER_D, sink=None):
    """A run of base units along X with a continuous worktop.

    `y` is the wall the run stands against; `facing` is +1 if the fronts
    face +Y, -1 if they face -Y. `modules` is a list of
    ("door"|"drawers"|"appliance"|"sink"|"oven"|"slot", width) in order;
    None fills the run with 0.6 m doors. A "slot" is open under the worktop,
    for a freestanding washer or dryer. `sink`, if given, is a sink from
    `sink()` set into the worktop over the "sink" module, which the
    worktop is cut round.
    """
    parts = []
    cab = mats[carcass]
    plinth_mat = mats["trim_charcoal"] if "trim_charcoal" in mats else cab
    total = x1 - x0
    if modules is None:
        n = max(1, round(total / 0.6))
        modules = [("door", total / n)] * n

    # Carcasses stop short of the fronts; the fronts stand on them.
    body = depth - FRONT_SET
    body_y = y + facing * body / 2
    front_y = y + facing * (depth - FRONT_T / 2)
    front_h = height - PLINTH - 0.03
    front_z = PLINTH + 0.015 + front_h / 2

    x = x0
    sink_x = None
    for i, (kind, w) in enumerate(modules):
        cx = x + w / 2
        if kind == "sink" and sink:
            # Open at the top for the bowl: sides and a back to the worktop,
            # a base below the bowl's floor, a rail behind the fronts.
            low = height - 0.26
            parts.append(g.box("carcass", (w, body, low - PLINTH),
                               loc=(cx, body_y, PLINTH + (low - PLINTH) / 2), col=col, mat=cab))
            for s in (-1, 1):
                parts.append(g.box("carcass", (0.018, body, height - low),
                                   loc=(cx + s * (w / 2 - 0.009), body_y, (low + height) / 2),
                                   col=col, mat=cab))
            parts.append(g.box("carcass", (w - 0.036, 0.018, height - low),
                               loc=(cx, y + facing * 0.009, (low + height) / 2), col=col, mat=cab))
            parts.append(g.box("carcass", (w - 0.036, 0.018, 0.08),
                               loc=(cx, y + facing * (body - 0.009), height - 0.04), col=col, mat=cab))
        elif kind != "slot":
            parts.append(g.box("carcass", (w, body, height - PLINTH),
                               loc=(cx, body_y, PLINTH + (height - PLINTH) / 2), col=col, mat=cab))
        if kind != "slot":
            parts.append(g.box("plinth", (w, body - 0.05, PLINTH),
                               loc=(cx, y + facing * (body - 0.05) / 2, PLINTH / 2), col=col,
                               mat=plinth_mat))
        else:
            # An end panel either side of the opening, so the worktop over it
            # stands on something.
            for s in (-1, 1):
                parts.append(g.box("panel", (0.018, depth, height),
                                   loc=(cx + s * (w / 2 - 0.009), y + facing * depth / 2, height / 2),
                                   col=col, mat=cab))
        if kind == "drawers":
            # A shallow drawer over two deep ones, as a kitchen has them.
            z = PLINTH + 0.015
            for share in (0.22, 0.34, 0.44):
                h = front_h * share
                parts += _drawer_front(col, mats, w, h, cx, front_y, z + h / 2, cab, facing=facing)
                z += h
        elif kind == "door":
            parts += _door_front(col, mats, w, front_h, cx, front_y, front_z, cab,
                                 handle_side=1 if i % 2 == 0 else -1, facing=facing)
        elif kind == "sink":
            sink_x = cx
            for s in (-1, 1):
                parts += _door_front(col, mats, w / 2, front_h, cx + s * w / 4, front_y, front_z,
                                     cab, handle_side=-s, facing=facing)
        elif kind == "appliance":
            # Integrated front: a dishwasher behind a matching door, its
            # handle a bar along the top.
            parts += _door_front(col, mats, w, front_h, cx, front_y, front_z, cab,
                                 handle=False, facing=facing)
            parts += _handle(col, mats, cx, front_y + facing * 0.020, front_z + front_h / 2 - 0.06,
                             min(0.34, w * 0.6), facing=facing)
        elif kind == "oven":
            parts += _oven(col, mats, cx, y + facing * depth, PLINTH + 0.30, w, facing=facing)
            parts += _drawer_front(col, mats, w, 0.18, cx, front_y, PLINTH + 0.105, cab,
                                   facing=facing)
        x += w

    # Worktop, overhanging the fronts, cut round the sink when there is one.
    top_z = height + 0.019
    top_d = depth + 0.02
    ty0, ty1 = min(y, y + facing * top_d), max(y, y + facing * top_d)
    if sink and sink_x is not None:
        sw, sd = sink["cut"]
        sy = sink["y"]
        pieces = [
            (x0 - 0.01, sink_x - sw / 2, ty0, ty1),
            (sink_x + sw / 2, x1 + 0.01, ty0, ty1),
            (sink_x - sw / 2, sink_x + sw / 2, ty0, sy - sd / 2),
            (sink_x - sw / 2, sink_x + sw / 2, sy + sd / 2, ty1),
        ]
        for a, b, c, d in pieces:
            if b - a > 0.001 and d - c > 0.001:
                parts.append(g.box("worktop", (b - a, d - c, 0.038),
                                   loc=((a + b) / 2, (c + d) / 2, top_z), col=col,
                                   mat=mats[worktop], bevel=0.002))
        parts += sink["parts"]
    else:
        parts.append(g.box("worktop", (total + 0.02, top_d, 0.038),
                           loc=(x0 + total / 2, (ty0 + ty1) / 2, top_z),
                           col=col, mat=mats[worktop], bevel=0.003))
    return parts


def wall_run(col, mats, x0, x1, y, facing, z=1.50, carcass="cab_sage", modules=None):
    """Wall cupboards along X at height `z`, their doors facing `facing`."""
    parts = []
    cab = mats[carcass]
    total = x1 - x0
    body = WALL_UNIT_D - FRONT_SET
    parts.append(g.box("carcass", (total, body, WALL_UNIT_H),
                       loc=(x0 + total / 2, y + facing * body / 2, z + WALL_UNIT_H / 2),
                       col=col, mat=cab))
    front_y = y + facing * (WALL_UNIT_D - FRONT_T / 2)
    n = max(1, round(total / 0.5)) if modules is None else len(modules)
    w = total / n
    for i in range(n):
        cx = x0 + (i + 0.5) * w
        parts += _door_front(col, mats, w, WALL_UNIT_H, cx, front_y, z + WALL_UNIT_H / 2, cab,
                             handle_side=-1 if i % 2 else 1, facing=facing)
    return parts


def island(col, mats, cx, cy, w, d, carcass="cab_navy", worktop="worktop",
           overhang=0.32, seats=0, hob_at=None):
    """A kitchen island: drawers facing -Y, a breakfast overhang towards +Y,
    and — `hob_at`, an x — a hob set into its top."""
    parts = []
    cab = mats[carcass]
    h = COUNTER_H
    body_d = d - FRONT_SET
    body_cy = cy + FRONT_SET / 2
    parts.append(g.box("carcass", (w, body_d, h - PLINTH), loc=(cx, body_cy, PLINTH + (h - PLINTH) / 2),
                       col=col, mat=cab))
    parts.append(g.box("plinth", (w - 0.06, body_d - 0.06, PLINTH), loc=(cx, body_cy, PLINTH / 2),
                       col=col, mat=mats["trim_charcoal"] if "trim_charcoal" in mats else cab))

    front_y = cy - d / 2 + FRONT_T / 2
    front_h = h - PLINTH - 0.03
    n = max(2, round(w / 0.6))
    for i in range(n):
        x = cx - w / 2 + (i + 0.5) * (w / n)
        z = PLINTH + 0.015
        for share in (0.22, 0.34, 0.44):
            dh = front_h * share
            parts += _drawer_front(col, mats, w / n, dh, x, front_y, z + dh / 2, cab)
            z += dh

    parts.append(g.box("top", (w + 0.06, d + overhang + 0.06, 0.042),
                       loc=(cx, cy + overhang / 2, h + 0.021), col=col,
                       mat=mats[worktop], bevel=0.004))
    if hob_at is not None:
        parts += hob(col, mats, hob_at, cy - 0.02)
    return parts


def _oven(col, mats, x, y, z, w=0.60, facing=-1, h=0.58):
    """A built-in oven `h` high whose front is at `y`, facing `facing`:
    glass door, a steel surround, a control strip."""
    parts = []
    steel, black = mats["steel"], mats["black_metal"]
    f = facing
    parts.append(g.box("oven", (w - 0.01, 0.05, h - 0.01), loc=(x, y - f * 0.025, z + h / 2),
                       col=col, mat=steel, bevel=0.004))
    parts.append(g.box("oven_glass", (w - 0.12, 0.012, h * 0.60), loc=(x, y + f * 0.002, z + h * 0.40),
                       col=col, mat=black))
    parts.append(g.box("oven_panel", (w - 0.04, 0.012, 0.075), loc=(x, y + f * 0.002, z + h - 0.06),
                       col=col, mat=black))
    parts.append(g.cylinder("oven_bar", 0.010, w - 0.12, loc=(x, y + f * 0.030, z + h * 0.78),
                            rot=(0, math.pi / 2, 0), col=col, mat=steel))
    for sx in (-1, 1):
        parts.append(g.cylinder("oven_stay", 0.005, 0.030, loc=(x + sx * (w / 2 - 0.10), y + f * 0.015,
                                                                   z + h * 0.78),
                                rot=(math.pi / 2, 0, 0), col=col, mat=steel))
        parts.append(g.cylinder("knob", 0.014, 0.020, loc=(x + sx * (w / 2 - 0.07), y + f * 0.010,
                                                            z + h - 0.06),
                                rot=(math.pi / 2, 0, 0), col=col, mat=steel))
    return parts


def hob(col, mats, cx, cy, w=0.75, d=0.52):
    """A glass induction hob set into a worktop: four zones and a touch strip."""
    parts = [g.box("hob", (w, d, 0.008), loc=(cx, cy, COUNTER_H + 0.043), col=col,
                   mat=mats["black_metal"], bevel=0.003)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            r = 0.095 if sx == sy else 0.075
            parts.append(g.tube("zone", r, 0.002, 0.004,
                                loc=(cx + sx * w * 0.23, cy + sy * d * 0.20, COUNTER_H + 0.0475),
                                col=col, mat=mats["steel"], segments=28))
    parts.append(g.box("controls", (w * 0.36, 0.035, 0.002),
                       loc=(cx, cy - d / 2 + 0.035, COUNTER_H + 0.0475), col=col, mat=mats["steel"]))
    return parts


def extractor(col, mats, cx, cy, z=1.55, w=0.90, d=0.50):
    parts = [
        g.box("hood", (w, d, 0.10), loc=(cx, cy, z), col=col, mat=mats["steel"], bevel=0.006),
        g.box("flue", (0.30, 0.26, 1.10), loc=(cx, cy, z + 0.60), col=col, mat=mats["steel"]),
        g.box("filter", (w - 0.10, d - 0.10, 0.012), loc=(cx, cy, z - 0.052), col=col,
              mat=mats["black_metal"]),
    ]
    return parts


def sink(col, mats, cx, cy, w=0.86, d=0.48, bowl_w=0.44, bowl_d=0.38, facing=-1, bowl_side=-1):
    """An inset stainless sink for `base_run`: a bowl and a ribbed drainer
    on one flanged plate lying on the worktop, and a swan-neck mixer behind
    the bowl. The front of the run is towards `facing`.

    Returns {"parts", "cut": (w, d) of the worktop cut-out, "y"}. The bowl
    is one lofted shell like the basins': the flange's inner edge, a wall
    falling 18 cm with rounded corners, and a floor that drops to the
    waste, so it is a bowl and not a box."""
    steel = mats["steel"]
    top = COUNTER_H + 0.038
    # The bowl to one side (`bowl_side`), the drainer the other.
    bx = cx + bowl_side * ((w - bowl_w) / 2 - 0.03)
    parts = []

    # The flange: a plate with a hole where the bowl is, a few mm proud.
    fl = 0.004
    for a, b, c, dd in ((cx - w / 2, cx + w / 2, cy - d / 2, cy - bowl_d / 2),
                        (cx - w / 2, cx + w / 2, cy + bowl_d / 2, cy + d / 2),
                        (cx - w / 2, bx - bowl_w / 2, cy - bowl_d / 2, cy + bowl_d / 2),
                        (bx + bowl_w / 2, cx + w / 2, cy - bowl_d / 2, cy + bowl_d / 2)):
        parts.append(g.box("flange", (b - a, dd - c, fl), loc=((a + b) / 2, (c + dd) / 2, top + fl / 2),
                           col=col, mat=steel, bevel=0.0015))

    def ring(inset, height, r=0.04):
        return [(bx + px, cy + py, top + height)
                for px, py in g.rounded_rect(bowl_w - 2 * inset, bowl_d - 2 * inset, r - inset * 0.5, 5)]

    floor = top - 0.19
    parts.append(g.loft("bowl", [
        ring(0.0, fl),                  # the flange's inner edge
        ring(0.0, -0.01),
        ring(0.004, -0.17),             # the wall, down
        ring(0.02, -0.185),             # rounding into the floor
    ], center=(bx, cy, floor), sharp=(0,), col=col, mat=steel))
    parts.append(g.cylinder("waste", 0.045, 0.004, loc=(bx, cy, floor + 0.003), col=col,
                            mat=mats["chrome"], segments=20))

    # The drainer: grooves falling towards the bowl.
    if bowl_side < 0:
        dx0, dx1 = bx + bowl_w / 2 + 0.03, cx + w / 2 - 0.03
    else:
        dx0, dx1 = cx - w / 2 + 0.03, bx - bowl_w / 2 - 0.03
    for k in range(6):
        gy = cy - bowl_d / 2 + 0.05 + k * (bowl_d - 0.10) / 5
        parts.append(g.box("groove", (dx1 - dx0, 0.012, 0.003), loc=((dx0 + dx1) / 2, gy, top + fl + 0.0005),
                           col=col, mat=mats["black_metal"]))

    # A swan-neck mixer behind the bowl, spout over its middle.
    back = -facing
    tx, ty = bx, cy + back * (bowl_d / 2 + 0.035)
    parts += tap(col, mats, tx, ty, top + fl, towards=facing, reach=bowl_d / 2 + 0.035)
    return {"parts": parts, "cut": (w - 0.02, d - 0.02), "y": cy}


def tap(col, mats, x, y, z, height=0.36, reach=0.19, towards=-1):
    """A swan-neck kitchen mixer on a surface at `z`, its spout arching over
    towards `towards` (-1: -Y, +1: +Y), the lever on the side."""
    m = mats["chrome"]
    t = towards
    arc = [(x, y, z + 0.01), (x, y, z + height * 0.72), (x, y + t * reach * 0.12, z + height),
           (x, y + t * reach * 0.55, z + height * 1.02), (x, y + t * reach * 0.92, z + height * 0.88),
           (x, y + t * reach, z + height * 0.70)]
    parts = [
        g.cylinder("tap_base", 0.028, 0.022, loc=(x, y, z + 0.011), col=col, mat=m, segments=20),
        g.sweep("tap_neck", g.catmull_rom(arc, steps=6), 0.013, sides=12, col=col, mat=m),
        g.cylinder("tap_out", 0.015, 0.03, loc=(x, y + t * reach, z + height * 0.70 - 0.012),
                   col=col, mat=m, segments=16),
        g.cylinder("tap_hub", 0.020, 0.05, loc=(x + 0.025, y, z + 0.13), rot=(0, math.pi / 2, 0),
                   col=col, mat=m, segments=16),
        g.box("tap_lever", (0.012, 0.012, 0.09), loc=(x + 0.05, y, z + 0.17), rot=(0, 0.25, 0),
              col=col, mat=m, bevel=0.004),
    ]
    return parts


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


def tall_housing(col, mats, x0, x1, y, facing, h=2.20, d=0.62, carcass="cab_sage",
                 columns=None):
    """A run of full-height units along X: `columns` is a list of
    ("larder"|"ovens"|"microwave", width). An oven column has a drawer under
    two built-in ovens and a cupboard over them; a microwave column a door
    below the microwave and one above; a larder a door the full height
    with a short one over it. The appliances are part of the unit, so the
    doors never cross them."""
    cab = mats[carcass]
    total = x1 - x0
    if columns is None:
        n = max(1, round(total / 0.6))
        columns = [("larder", total / n)] * n
    body = d - FRONT_SET
    front_y = y + facing * (d - FRONT_T / 2)
    face = y + facing * d
    plinth = mats["trim_charcoal"] if "trim_charcoal" in mats else cab
    parts = [g.box("tall", (total, body, h - PLINTH),
                   loc=(x0 + total / 2, y + facing * body / 2, PLINTH + (h - PLINTH) / 2), col=col, mat=cab),
             g.box("plinth", (total, body - 0.05, PLINTH),
                   loc=(x0 + total / 2, y + facing * (body - 0.05) / 2, PLINTH / 2), col=col, mat=plinth)]

    def door(cx, w, z0, z1, side):
        return _door_front(col, mats, w, z1 - z0, cx, front_y, (z0 + z1) / 2, cab,
                           handle_side=side, facing=facing)

    x = x0
    for i, (kind, w) in enumerate(columns):
        cx = x + w / 2
        side = -1 if i % 2 else 1
        z0 = PLINTH + 0.015
        if kind == "ovens":
            parts += _drawer_front(col, mats, w, 0.60 - z0, cx, front_y, (z0 + 0.60) / 2, cab, facing=facing)
            parts += _oven(col, mats, cx, face, 0.62, w, facing=facing, h=0.59)
            parts += _oven(col, mats, cx, face, 1.23, w, facing=facing, h=0.45)
            parts += door(cx, w, 1.70, h - 0.015, side)
        elif kind == "microwave":
            parts += door(cx, w, z0, 1.38, side)
            parts += microwave(col, mats, cx, face + facing * 0.005, 1.40, facing=facing, w=w - 0.04, d=0.38)
            parts += door(cx, w, 1.74, h - 0.015, side)
        else:
            parts += door(cx, w, z0, 1.70, side)
            parts += door(cx, w, 1.70, h - 0.015, side)
        x += w
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
    """A microwave whose front is at `cy`, facing `facing`, standing at `z`."""
    steel, black = mats["steel"], mats["black_metal"]
    f = facing
    return [g.box("mw", (w, d, h), loc=(cx, cy - f * d / 2, z + h / 2), col=col, mat=steel, bevel=0.005),
            g.box("mw_glass", (w * 0.62, 0.008, h - 0.09), loc=(cx - w * 0.16, cy + f * 0.002, z + h / 2),
                  col=col, mat=black),
            g.box("mw_panel", (w * 0.24, 0.008, h - 0.09), loc=(cx + w * 0.33, cy + f * 0.002, z + h / 2),
                  col=col, mat=black)]


# ---------------------------------------------------------------------
# Bathrooms
# ---------------------------------------------------------------------

def wc(col, mats, x, y, rot=0.0):
    """A back-to-wall pan on a concealed cistern panel."""
    p, tr = mats["porcelain"], mats["trim_white"]
    parts = [
        g.box("cistern", (0.56, 0.22, 0.92), loc=(x, y + 0.11, 0.46), col=col, mat=tr, bevel=0.006),
        g.box("shelf", (0.60, 0.26, 0.028), loc=(x, y + 0.09, 0.935), col=col, mat=tr, bevel=0.004),
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
    parts += tap(col, mats, x, y + 0.07, h - 0.02, height=0.16, reach=0.16, towards=1)
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
    """Two drawers facing -Y at `rot` 0, on four short legs."""
    cab = mats[carcass]
    body = d - FRONT_SET
    parts = [g.box("ns", (w, body, h - 0.10), loc=(x, y + FRONT_SET / 2, 0.10 + (h - 0.10) / 2), col=col,
                   mat=cab, bevel=0.005)]
    front_y = y - d / 2 + FRONT_T / 2
    for i in range(2):
        parts += _drawer_front(col, mats, w, (h - 0.10) / 2, x, front_y,
                               0.10 + (h - 0.10) * (0.25 + 0.5 * i), cab)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(g.cylinder("leg", 0.016, 0.10,
                                    loc=(x + sx * (w / 2 - 0.05), y + sy * (d / 2 - 0.05), 0.05),
                                    col=col, mat=mats["black_metal"]))
    return _rotate(parts, x, y, rot)


def wardrobe(col, mats, x0, x1, y, facing=-1, h=2.30, d=0.62, carcass="cab_white"):
    """A run of full-height wardrobes with a cornice, standing against a
    wall at `y` with their doors facing `facing`."""
    cab = mats[carcass]
    total = x1 - x0
    body = d - FRONT_SET
    front_y = y + facing * (d - FRONT_T / 2)
    parts = [g.box("wr", (total, body, h), loc=(x0 + total / 2, y + facing * body / 2, h / 2), col=col,
                   mat=cab, bevel=0.004),
             g.bar("cornice", g.CORNICE, total + 0.04,
                   loc=(x0 - 0.02, y + facing * (d + 0.02), h),
                   rot=(0, 0, 0 if facing < 0 else math.pi), col=col, mat=mats["trim_white"])]
    n = max(2, round(total / 0.60))
    w = total / n
    for i in range(n):
        cx = x0 + (i + 0.5) * w
        parts += _door_front(col, mats, w, h - 0.06, cx, front_y, h / 2 + 0.01, cab,
                             handle_side=-1 if i % 2 else 1, facing=facing)
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
             carcass="cab_white", back=1):
    """Open shelving along X, `y` the middle of its depth; its back panel
    is on the +Y side, or with `back` -1 on the -Y side — against whichever
    wall it stands on."""
    cab = mats[carcass]
    total = x1 - x0
    parts = [
        g.box("side", (0.022, d, h), loc=(x0, y, z0 + h / 2), col=col, mat=cab),
        g.box("side", (0.022, d, h), loc=(x1, y, z0 + h / 2), col=col, mat=cab),
        g.box("back", (total, 0.014, h), loc=(x0 + total / 2, y + back * d / 2, z0 + h / 2),
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

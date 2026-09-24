"""Loose furniture and decor, built from primitives.

Seating, tables, lamps, screens, plants and the small things that stand on
them. None of it is meant to be beautiful yet — it is meant to be the right
size. Every piece is built to real-world dimensions in metres, standing on
z = 0 at a plan point, so its bounds (and therefore its collision in the app)
match the space it would really take up. The looks can be improved later
without changing any of that.

Conventions, shared with joinery.py:
  - `x, y` is the centre of the piece's footprint;
  - the front faces +Y at `rot` = 0, and `rot` turns about that point;
  - each function returns a list of parts for geometry.join to merge.
"""

import math

from . import geometry as g
from .joinery import _rotate

PI = math.pi

#: Heights other pieces stand on, so decor can be put on top exactly.
DINING_TOP = 0.76
COFFEE_TOP = 0.40
SIDE_TOP = 0.55
CONSOLE_TOP = 0.80


def _legs(col, mat, x, y, w, d, h, inset=0.05, size=0.04, round_=False):
    parts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx, ly = x + sx * (w / 2 - inset), y + sy * (d / 2 - inset)
            if round_:
                parts.append(g.cylinder("leg", size / 2, h, loc=(lx, ly, h / 2), col=col,
                                        mat=mat, segments=10))
            else:
                parts.append(g.box("leg", (size, size, h), loc=(lx, ly, h / 2), col=col, mat=mat))
    return parts


# ---------------------------------------------------------------------
# Seating
# ---------------------------------------------------------------------

def sofa(col, mats, x, y, w=2.10, d=0.92, rot=0.0, fabric="fabric_grey", seats=3,
         arm=0.18, legs="black_metal"):
    """A box sofa: frame, arms, back, a cushion per seat. Seat at 0.44."""
    f = mats[fabric]
    leg_h, frame_h = 0.10, 0.24
    back_d = 0.20
    top = leg_h + frame_h
    parts = [
        g.box("frame", (w, d, frame_h), loc=(x, y, leg_h + frame_h / 2), col=col, mat=f,
              bevel=0.01),
        g.box("back", (w, back_d, 0.44), loc=(x, y - d / 2 + back_d / 2, top + 0.22), col=col,
              mat=f, bevel=0.02, shade_smooth=True),
    ]
    for s in (-1, 1):
        parts.append(g.box("arm", (arm, d, 0.28), loc=(x + s * (w / 2 - arm / 2), y, top + 0.14),
                           col=col, mat=f, bevel=0.02, shade_smooth=True))
    inner = w - 2 * arm
    cw = inner / seats
    seat_d = d - back_d
    for i in range(seats):
        cx = x - inner / 2 + (i + 0.5) * cw
        parts.append(g.box("seat", (cw - 0.01, seat_d - 0.01, 0.10),
                           loc=(cx, y + d / 2 - seat_d / 2, top + 0.05), col=col, mat=f,
                           bevel=0.025, shade_smooth=True))
        parts.append(g.box("cushion", (cw - 0.02, 0.14, 0.34),
                           loc=(cx, y - d / 2 + back_d + 0.07, top + 0.10 + 0.17), col=col,
                           mat=f, bevel=0.03, shade_smooth=True))
    parts += _legs(col, mats[legs], x, y, w, d, leg_h, inset=0.07, size=0.04, round_=True)
    return _rotate(parts, x, y, rot)


def armchair(col, mats, x, y, rot=0.0, fabric="fabric_cream", w=0.86, d=0.86):
    return sofa(col, mats, x, y, w=w, d=d, rot=rot, fabric=fabric, seats=1, arm=0.16)


def lounge_chair(col, mats, x, y, rot=0.0, leather="leather_tan", wood="wood_walnut"):
    """A low reclining lounge chair on a timber shell. Seat at 0.40."""
    wd, lt = mats[wood], mats[leather]
    w, d = 0.82, 0.86
    parts = [
        g.box("shell_seat", (w, 0.62, 0.05), loc=(x, y + 0.08, 0.33), col=col, mat=wd,
              bevel=0.01),
        g.box("shell_back", (w, 0.05, 0.62), loc=(x, y - 0.28, 0.66),
              rot=(-0.26, 0, 0), col=col, mat=wd, bevel=0.01),
        g.box("seat", (w - 0.08, 0.58, 0.10), loc=(x, y + 0.08, 0.40), col=col, mat=lt,
              bevel=0.03, shade_smooth=True),
        g.box("back", (w - 0.08, 0.10, 0.54), loc=(x, y - 0.22, 0.68),
              rot=(-0.26, 0, 0), col=col, mat=lt, bevel=0.03, shade_smooth=True),
    ]
    for s in (-1, 1):
        parts.append(g.box("arm", (0.06, 0.62, 0.05), loc=(x + s * (w / 2 - 0.03), y + 0.05, 0.58),
                           col=col, mat=wd, bevel=0.01))
        parts.append(g.box("arm_post", (0.05, 0.05, 0.25),
                           loc=(x + s * (w / 2 - 0.03), y + 0.30, 0.45), col=col, mat=wd))
    parts.append(g.cylinder("stem", 0.03, 0.30, loc=(x, y, 0.16), col=col, mat=mats["black_metal"]))
    parts.append(g.cylinder("foot", 0.30, 0.02, loc=(x, y, 0.01), col=col, mat=mats["black_metal"],
                            segments=24))
    return _rotate(parts, x, y, rot)


def office_chair(col, mats, x, y, rot=0.0, fabric="fabric_grey"):
    """A swivel desk chair on a five-star base. Seat at 0.47."""
    f, m = mats[fabric], mats["black_metal"]
    parts = [
        g.box("seat", (0.48, 0.46, 0.08), loc=(x, y + 0.02, 0.47), col=col, mat=f,
              bevel=0.02, shade_smooth=True),
        g.box("back", (0.44, 0.06, 0.48), loc=(x, y - 0.22, 0.80), col=col, mat=f,
              bevel=0.02, shade_smooth=True),
        g.box("spine", (0.05, 0.03, 0.30), loc=(x, y - 0.25, 0.56), col=col, mat=m),
        g.cylinder("column", 0.025, 0.34, loc=(x, y, 0.26), col=col, mat=m, segments=12),
    ]
    for i in range(5):
        a = i * 2 * PI / 5
        parts.append(g.box("spoke", (0.30, 0.04, 0.03),
                           loc=(x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, 0.07),
                           rot=(0, 0, a), col=col, mat=m))
        parts.append(g.sphere("castor", 0.025, loc=(x + math.cos(a) * 0.29, y + math.sin(a) * 0.29, 0.025),
                              col=col, mat=m, subdivisions=1))
    return _rotate(parts, x, y, rot)


def dining_chair(col, mats, x, y, rot=0.0, wood="cab_oak", fabric="fabric_cream"):
    """A timber side chair. Seat at 0.46, back to 0.88."""
    wd = mats[wood]
    w, d = 0.44, 0.48
    parts = [
        g.box("seat", (w, d, 0.04), loc=(x, y, 0.44), col=col, mat=wd, bevel=0.004),
        g.box("pad", (w - 0.04, d - 0.06, 0.03), loc=(x, y + 0.01, 0.475), col=col,
              mat=mats[fabric], bevel=0.01, shade_smooth=True),
        g.box("rail", (w - 0.06, 0.02, 0.14), loc=(x, y - d / 2 + 0.02, 0.76), col=col, mat=wd),
    ]
    parts += _legs(col, wd, x, y, w, d, 0.42, inset=0.025, size=0.035)
    for s in (-1, 1):
        parts.append(g.box("post", (0.035, 0.035, 0.42),
                           loc=(x + s * (w / 2 - 0.025), y - d / 2 + 0.025, 0.67), col=col, mat=wd))
    return _rotate(parts, x, y, rot)


def bar_stool(col, mats, x, y, rot=0.0, seat="leather_tan"):
    """A counter stool: round seat at 0.76 on four legs with a foot ring."""
    m = mats["black_metal"]
    parts = [
        g.cylinder("seat", 0.19, 0.05, loc=(x, y, 0.745), col=col, mat=mats[seat], segments=24),
    ]
    for i in range(4):
        a = PI / 4 + i * PI / 2
        parts.append(g.cylinder("leg", 0.012, 0.72,
                                loc=(x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, 0.36),
                                col=col, mat=m, segments=8))
    for i in range(4):
        a = i * PI / 2
        parts.append(g.box("ring", (0.22, 0.016, 0.016),
                           loc=(x + math.cos(a) * 0.106, y + math.sin(a) * 0.106, 0.26),
                           rot=(0, 0, a + PI / 2), col=col, mat=m))
    return _rotate(parts, x, y, rot)


def ottoman(col, mats, x, y, rot=0.0, w=0.80, d=0.60, h=0.42, fabric="fabric_rust"):
    parts = [g.box("pouf", (w, d, h - 0.06), loc=(x, y, 0.06 + (h - 0.06) / 2), col=col,
                   mat=mats[fabric], bevel=0.04, shade_smooth=True)]
    parts += _legs(col, mats["wood_walnut"], x, y, w, d, 0.06, inset=0.06, size=0.04, round_=True)
    return _rotate(parts, x, y, rot)


# ---------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------

def dining_table(col, mats, x, y, w=1.80, d=0.90, rot=0.0, wood="cab_oak"):
    """Top surface at DINING_TOP."""
    wd = mats[wood]
    t = 0.04
    parts = [
        g.box("top", (w, d, t), loc=(x, y, DINING_TOP - t / 2), col=col, mat=wd, bevel=0.004),
        g.box("apron", (w - 0.14, d - 0.14, 0.08), loc=(x, y, DINING_TOP - t - 0.04), col=col, mat=wd),
    ]
    parts += _legs(col, wd, x, y, w, d, DINING_TOP - t, inset=0.07, size=0.07)
    return _rotate(parts, x, y, rot)


def coffee_table(col, mats, x, y, w=1.10, d=0.60, rot=0.0, wood="wood_walnut"):
    """Top surface at COFFEE_TOP, with a shelf under it."""
    wd = mats[wood]
    parts = [
        g.box("top", (w, d, 0.04), loc=(x, y, COFFEE_TOP - 0.02), col=col, mat=wd, bevel=0.004),
        g.box("shelf", (w - 0.10, d - 0.10, 0.02), loc=(x, y, 0.12), col=col, mat=wd),
    ]
    parts += _legs(col, mats["black_metal"], x, y, w, d, COFFEE_TOP - 0.04, inset=0.04, size=0.03)
    return _rotate(parts, x, y, rot)


def coffee_table_round(col, mats, x, y, r=0.45, rot=0.0, wood="cab_oak"):
    wd = mats[wood]
    parts = [
        g.cylinder("top", r, 0.04, loc=(x, y, COFFEE_TOP - 0.02), col=col, mat=wd, segments=32),
        g.cone("pedestal", 0.10, 0.06, COFFEE_TOP - 0.06, loc=(x, y, 0.02 + (COFFEE_TOP - 0.06) / 2),
               col=col, mat=wd),
        g.cylinder("foot", r * 0.6, 0.02, loc=(x, y, 0.01), col=col, mat=wd, segments=24),
    ]
    return _rotate(parts, x, y, rot)


def side_table(col, mats, x, y, r=0.24, rot=0.0, wood="cab_oak"):
    """A round lamp table, top surface at SIDE_TOP."""
    wd = mats[wood]
    parts = [g.cylinder("top", r, 0.03, loc=(x, y, SIDE_TOP - 0.015), col=col, mat=wd, segments=24)]
    for i in range(3):
        a = i * 2 * PI / 3
        parts.append(g.cylinder("leg", 0.015, SIDE_TOP - 0.03,
                                loc=(x + math.cos(a) * r * 0.7, y + math.sin(a) * r * 0.7,
                                     (SIDE_TOP - 0.03) / 2), col=col, mat=wd, segments=8))
    return _rotate(parts, x, y, rot)


def console_table(col, mats, x, y, w=1.10, d=0.36, rot=0.0, wood="wood_walnut"):
    """A narrow hall table, top surface at CONSOLE_TOP."""
    wd = mats[wood]
    parts = [
        g.box("top", (w, d, 0.035), loc=(x, y, CONSOLE_TOP - 0.0175), col=col, mat=wd, bevel=0.004),
        g.box("shelf", (w - 0.08, d - 0.06, 0.02), loc=(x, y, 0.20), col=col, mat=wd),
        g.box("drawer", (w - 0.10, d - 0.04, 0.10), loc=(x, y, CONSOLE_TOP - 0.085), col=col, mat=wd),
    ]
    parts += _legs(col, wd, x, y, w, d, CONSOLE_TOP - 0.035, inset=0.03, size=0.04)
    return _rotate(parts, x, y, rot)


def bookcase(col, mats, x, y, w=0.90, d=0.32, h=1.90, rot=0.0, wood="cab_oak", shelves=5):
    """Open shelving with books on it; its back is at -Y."""
    wd = mats[wood]
    x0, x1 = x - w / 2, x + w / 2
    parts = [
        g.box("side", (0.025, d, h), loc=(x0 + 0.0125, y, h / 2), col=col, mat=wd),
        g.box("side", (0.025, d, h), loc=(x1 - 0.0125, y, h / 2), col=col, mat=wd),
        g.box("back", (w, 0.012, h), loc=(x, y - d / 2 + 0.006, h / 2), col=col, mat=wd),
    ]
    step = (h - 0.04) / shelves
    for i in range(shelves + 1):
        z = 0.02 + i * step
        parts.append(g.box("shelf", (w - 0.05, d, 0.022), loc=(x, y, z), col=col, mat=wd))
        if i < shelves and i % 2 == 0:
            parts += books(col, mats, x, y - 0.02, w=w - 0.12, h=min(0.26, step - 0.06), z=z + 0.011)
    return _rotate(parts, x, y, rot)


# ---------------------------------------------------------------------
# Screens and lamps
# ---------------------------------------------------------------------

def tv(col, mats, x, y, w=1.10, h=0.64, rot=0.0, z=0.0):
    """A flat screen on a pedestal foot; the screen faces +Y."""
    m, s = mats["black_metal"], mats["screen"]
    foot_h = 0.07
    parts = [
        g.box("foot", (w * 0.36, 0.22, 0.015), loc=(x, y, z + 0.0075), col=col, mat=m),
        g.box("neck", (0.06, 0.03, foot_h), loc=(x, y - 0.02, z + foot_h / 2), col=col, mat=m),
        g.box("panel", (w, 0.045, h), loc=(x, y - 0.02, z + foot_h + h / 2), col=col, mat=m,
              bevel=0.004),
        g.box("screen", (w - 0.03, 0.004, h - 0.03), loc=(x, y + 0.004, z + foot_h + h / 2),
              col=col, mat=s),
    ]
    return _rotate(parts, x, y, rot)


def laptop(col, mats, x, y, rot=0.0, z=0.0):
    """Open, keyboard towards +Y, screen at the back."""
    m, s = mats["steel"], mats["screen"]
    w, d = 0.33, 0.23
    parts = [
        g.box("base", (w, d, 0.018), loc=(x, y, z + 0.009), col=col, mat=m, bevel=0.003),
        g.box("lid", (w, 0.008, d * 0.95), loc=(x, y - d / 2 - 0.03, z + 0.018 + d * 0.46),
              rot=(-0.28, 0, 0), col=col, mat=m, bevel=0.002),
        g.box("display", (w - 0.02, 0.002, d * 0.85), loc=(x, y - d / 2 - 0.024, z + 0.018 + d * 0.46),
              rot=(-0.28, 0, 0), col=col, mat=s),
    ]
    return _rotate(parts, x, y, rot)


def desk_lamp(col, mats, x, y, h=0.45, rot=0.0, z=0.0):
    """An angled task lamp reaching towards +Y."""
    m = mats["black_metal"]
    parts = [
        g.cylinder("base", 0.08, 0.02, loc=(x, y, z + 0.01), col=col, mat=m, segments=20),
        g.cylinder("stem", 0.008, h * 0.62, loc=(x, y - 0.02, z + 0.02 + h * 0.31), col=col,
                   mat=m, segments=8),
        g.cylinder("arm", 0.007, 0.24, loc=(x, y + 0.09, z + h * 0.70),
                   rot=(PI / 2 - 0.4, 0, 0), col=col, mat=m, segments=8),
        g.cone("shade", 0.075, 0.03, 0.12, loc=(x, y + 0.19, z + h - 0.06), col=col,
               mat=mats["shade"], segments=20),
    ]
    return _rotate(parts, x, y, rot)


# ---------------------------------------------------------------------
# Plants and decor
# ---------------------------------------------------------------------

def plant(col, mats, x, y, h=1.00, rot=0.0, z=0.0):
    """A potted plant `h` tall: a tapered pot and a clump of foliage."""
    pot_h = min(0.34, h * 0.32)
    pot_r = max(0.10, h * 0.16)
    f = mats["foliage"]
    parts = [
        g.cone("pot", pot_r * 0.78, pot_r, pot_h, loc=(x, y, z + pot_h / 2), col=col,
               mat=mats["terracotta"], segments=20),
        g.cylinder("soil", pot_r * 0.94, 0.01, loc=(x, y, z + pot_h - 0.02), col=col,
                   mat=mats["soil"], segments=20),
        g.cylinder("stem", 0.015, h - pot_h - 0.1, loc=(x, y, z + pot_h + (h - pot_h - 0.1) / 2),
                   col=col, mat=mats["wood_walnut"], segments=8),
    ]
    crown = h - pot_h
    r = max(0.14, h * 0.2)
    for i, (dx, dy, dz, s) in enumerate([(0, 0, 0.62, 1.0), (0.09, 0.05, 0.40, 0.8),
                                          (-0.08, -0.06, 0.45, 0.75), (0.02, -0.09, 0.80, 0.7)]):
        parts.append(g.sphere("leaves", r * s,
                              loc=(x + dx * h, y + dy * h, z + pot_h + crown * dz),
                              col=col, mat=f, scale=(1.0, 1.0, 0.85), subdivisions=2))
    return _rotate(parts, x, y, rot)


def vase(col, mats, x, y, h=0.30, rot=0.0, z=0.0, mat="ceramic_blue"):
    v = mats[mat]
    parts = [
        g.cone("body", 0.06, 0.09, h * 0.55, loc=(x, y, z + h * 0.275), col=col, mat=v, segments=20),
        g.cone("shoulder", 0.09, 0.04, h * 0.30, loc=(x, y, z + h * 0.70), col=col, mat=v, segments=20),
        g.cylinder("neck", 0.035, h * 0.15, loc=(x, y, z + h * 0.925), col=col, mat=v, segments=16),
    ]
    return _rotate(parts, x, y, rot)


def bowl(col, mats, x, y, r=0.16, h=0.07, rot=0.0, z=0.0):
    return [g.cone("bowl", r * 0.45, r, h, loc=(x, y, z + h / 2), col=col,
                   mat=mats["wood_walnut"], segments=24)]


def books(col, mats, x, y, w=0.30, h=0.26, rot=0.0, z=0.0, d=0.20):
    """A row of upright books along X."""
    colours = ["book_red", "book_green", "book_blue", "linen_white", "cab_oak"]
    parts = []
    cursor = x - w / 2
    i = 0
    while cursor < x + w / 2 - 0.02:
        t = 0.025 + 0.012 * ((i * 7) % 3)
        bh = h * (0.78 + 0.22 * ((i * 5) % 4) / 3)
        parts.append(g.box("book", (t, d, bh), loc=(cursor + t / 2, y, z + bh / 2), col=col,
                           mat=mats[colours[i % len(colours)]]))
        cursor += t + 0.002
        i += 1
    return _rotate(parts, x, y, rot)


def picture(col, mats, x, y, w=0.80, h=0.60, rot=0.0, z=0.0, art="art_a"):
    """A framed picture hung with its bottom edge at `z`. Its face is
    painted both sides, so it reads right whichever way it is hung."""
    d = 0.035
    parts = [
        g.box("frame", (w, d, h), loc=(x, y, z + h / 2), col=col, mat=mats["wood_walnut"],
              bevel=0.003),
    ]
    for s in (-1, 1):
        parts.append(g.box("canvas", (w - 0.08, 0.004, h - 0.08),
                           loc=(x, y + s * (d / 2 + 0.001), z + h / 2), col=col, mat=mats[art]))
    return _rotate(parts, x, y, rot)


def mirror(col, mats, x, y, w=0.70, h=1.00, rot=0.0, z=0.0):
    d = 0.04
    parts = [g.box("frame", (w, d, h), loc=(x, y, z + h / 2), col=col, mat=mats["brass"],
                   bevel=0.005)]
    for s in (-1, 1):
        parts.append(g.box("glass", (w - 0.08, 0.004, h - 0.08),
                           loc=(x, y + s * (d / 2 + 0.001), z + h / 2), col=col,
                           mat=mats["mirror"]))
    return _rotate(parts, x, y, rot)

"""The things people hold or use: a drink in the hand on a terrace — red
and white wine, champagne, a Negroni on ice, a beer, a cappuccino — and,
for the loungers, a folded beach towel and a paperback, with a pair of
sunglasses. Each is modelled at real size, as the furniture is (loose.py,
ladonia.py), for World/People.js to put in a hand or on a lounger.

Every prop is built round its grip point: where the fingers close round
it — a stemmed glass at the middle of its stem, a tumbler or a bottle
round its body a third of the way up, a cup through its handle, a closed
book by the middle of its spine — standing upright. The exporter moves
that point to the origin, so the app hangs a prop from a hand by it and
need only keep it level. What lies rather than is held (the towel, the
open book) has its origin at the middle of its underside, where it rests,
and the sunglasses at the bridge, where they sit on the nose.

Blender axes as everywhere here: Z up, and a prop's front (a bottle's
label, the way sunglasses look) towards -Y, which is glTF's +Z, the way a
character faces. A cup's handle is at -X, the holder's right when they
face +Z, so a right hand holds the cup inboard of it.

Glass is plain see-through glass: a pale tint at a low opacity, blended,
with no transmission. Refraction would make three draw the whole scene a
second time for every glass in view (Utils/reflections.js, plainGlass);
smooth (roughness 0.05), the app gives it the environment to reflect,
which is what reads as glass. Liquids are opaque, a hair inside the glass.
"""

import math

import bpy
from mathutils import Matrix

from . import geometry as g
from . import materials as m

PI = math.pi

#: How far a liquid stands in from the glass round it, so the two never meet.
GAP = 0.0008


# ---------------------------------------------------------------------
# Finishes
# ---------------------------------------------------------------------

def _clear(name, tint, alpha, rough=0.05):
    """Plain see-through glass (or ice): `tint` at `alpha`, blended, no
    transmission, culled behind — each piece is a closed shell, its inside
    face as well as its outside modelled."""
    mat = m.plain(name, tint, rough=rough, alpha=alpha)
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = True
    return mat


def finishes(mats):
    """materials.library()'s finishes and the props' own, in one dict. The
    plain colours are linear, as plain() takes them; the towel's terry is
    baked on export, its colours given as they should look."""
    lin = m.linear
    return {
        **mats,
        # A grey glass, not a white one: what is seen through it keeps its
        # colour (a white one lit by the sun washes a red wine to mauve),
        # and its highlights and reflections say it is glass.
        "prop_glass": _clear("prop_glass", (0.32, 0.35, 0.35), 0.2),
        # Ice: frostier than the glass, so a cube above the drink still shows.
        "prop_ice": _clear("prop_ice", (0.55, 0.62, 0.66), 0.45, rough=0.08),
        "prop_wine_red": m.plain("prop_wine_red", lin("#7a0d26"), rough=0.04),
        "prop_wine_white": m.plain("prop_wine_white", lin("#d4bf5c"), rough=0.04),
        "prop_champagne": m.plain("prop_champagne", lin("#dcb44c"), rough=0.04),
        # A Negroni: deep red-orange over ice, a wheel of orange on the rim.
        "prop_negroni": m.plain("prop_negroni", lin("#b0220f"), rough=0.04),
        "prop_orange_peel": m.plain("prop_orange_peel", lin("#e57d16"), rough=0.45),
        "prop_orange_flesh": m.plain("prop_orange_flesh", lin("#f6a948"), rough=0.35),
        # A brown longneck, its cream label edged in red, a gold crown cap.
        # Amber-brown, warmer than it looks bare: under a blue sky its gloss
        # turns a darker brown purple.
        "prop_bottle_brown": m.plain("prop_bottle_brown", lin("#6e3610"), rough=0.1, coat=0.5, coat_rough=0.05),
        "prop_label": m.plain("prop_label", lin("#efe2c2"), rough=0.6),
        "prop_label_red": m.plain("prop_label_red", lin("#a3202a"), rough=0.5),
        # A cappuccino: pale foam ringed with crema.
        "prop_foam": m.plain("prop_foam", lin("#d9bf9c"), rough=0.6),
        "prop_crema": m.plain("prop_crema", lin("#8f5a30"), rough=0.4),
        # A beach towel in navy and white stripes: terry, a fine dense pile.
        "prop_terry_white": m.noisy("prop_terry_white", m.srgb("#f0ece3"), m.srgb("#e0dbd0"), scale=90, detail=10,
                                    rough=1.0, bump=0.4),
        "prop_terry_navy": m.noisy("prop_terry_navy", m.srgb("#2d4c70"), m.srgb("#243f5e"), scale=90, detail=10,
                                   rough=1.0, bump=0.4),
        # A paperback: a teal cover, a cream title panel, cream pages.
        "prop_cover": m.plain("prop_cover", lin("#2e7680"), rough=0.5),
        "prop_title": m.plain("prop_title", lin("#efe4cc"), rough=0.6),
        "prop_ink": m.plain("prop_ink", lin("#2a2522"), rough=0.6),
        "prop_pages": m.plain("prop_pages", lin("#ebdfc5"), rough=0.85),
        # Sunglasses: dark tortoiseshell acetate, near-black lenses.
        "prop_acetate": m.plain("prop_acetate", lin("#2b1c14"), rough=0.25, coat=0.6, coat_rough=0.1),
        "prop_lens": m.plain("prop_lens", (0.006, 0.007, 0.008), rough=0.05, coat=1.0, coat_rough=0.02),
    }


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def _skin(name, rings, col, mats, bands=None, sharp=()):
    """One surface through `rings` of points, each ring the same length and
    running the same way round, or a single point: a pole the surface
    closes at. `mats` is a material or a list of them, and `bands` the
    index into it of each band between two rings (the first, if not
    given). Rings listed in `sharp` keep a crisp edge under the smooth
    shading (a rim, a foot's edge, a liquid's surface)."""
    import bmesh
    mats = list(mats) if isinstance(mats, (list, tuple)) else [mats]
    bm = bmesh.new()
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    for b, (a, c) in enumerate(zip(verts, verts[1:])):
        n = max(len(a), len(c))
        if n == 1:
            continue
        for j in range(n):
            k = (j + 1) % n
            if len(a) == 1:
                face = (a[0], c[k], c[j])
            elif len(c) == 1:
                face = (a[j], a[k], c[0])
            else:
                face = (a[j], a[k], c[k], c[j])
            f = bm.faces.new(face)
            f.material_index = bands[b] if bands else 0
            f.smooth = True
    bm.edges.ensure_lookup_table()
    for index in sharp:
        ring = verts[index]
        for j in range(len(ring)):
            edge = bm.edges.get((ring[j], ring[(j + 1) % len(ring)]))
            if edge:
                edge.smooth = False
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in mats:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    return g.link(obj, col)


def _lathe(name, profile, col, mats, bands=None, segments=24, sharp=()):
    """A turned shape about Z from (radius, height) points. Taken bottom
    to top, and for a vessel over its lip and down inside, the surface
    faces out; a radius of 0 is a pole that closes it."""
    rings = []
    for r, z in profile:
        if r <= 0:
            rings.append([(0.0, 0.0, z)])
        else:
            rings.append([(r * math.cos(2 * PI * i / segments), r * math.sin(2 * PI * i / segments), z)
                          for i in range(segments)])
    return _skin(name, rings, col, mats, bands, sharp)


def _vessel(name, outer, lip, inner, col, mat, segments=24, sharp=()):
    """A glass or a cup as one closed shell: `outer` from the underside's
    centre (radius 0) up to the rim's outside, `lip` the rim's top, `inner`
    from the inside's bottom centre (radius 0) up to the rim's inside.
    `sharp` indexes `outer`."""
    return _lathe(name, outer + [lip] + inner[::-1], col, mat, segments=segments, sharp=sharp)


def _fill(inner, level):
    """The liquid in a vessel whose inside is `inner` ((radius, height)
    from its bottom centre up), filled to `level`: its sides GAP inside
    the glass, its surface flat (the last ring before the pole, crisp)."""
    pts = [(0.0, inner[0][1] + GAP)]
    for (r0, z0), (r1, z1) in zip(inner, inner[1:]):
        if z1 >= level:
            t = (level - z0) / (z1 - z0)
            pts.append((r0 + (r1 - r0) * t - GAP, level))
            break
        pts.append((r1 - GAP, z1 + GAP))
    pts.append((0.0, level))
    return pts


def _liquid(name, inner, level, col, mat, segments=24):
    prof = _fill(inner, level)
    return _lathe(name, prof, col, mat, segments=segments, sharp=(len(prof) - 2,))


def _transform(obj, matrix):
    """Move a part by `matrix`, after whatever it already has."""
    obj.matrix_basis = matrix @ g.world_matrix(obj)
    return obj


# ---------------------------------------------------------------------
# Stemmed glasses
# ---------------------------------------------------------------------

def _foot(r):
    """A stemmed glass's foot `r` across: resting on its rim, its
    underside domed up 3 mm, its top sloping up into the stem."""
    return [(0.0, 0.003), (r, 0.0), (r + 0.0005, 0.002), (r - 0.003, 0.0035), (r * 0.38, 0.0065), (0.0047, 0.013)]


def _stemmed(col, mats, outer, lip, inner, level, liquid, segments=20):
    """A stemmed glass and what is in it; the grip, the middle of its stem
    (from the foot's top, 13 mm up, to where the bowl starts)."""
    glass = _vessel("glass", outer, lip, inner, col, mats["prop_glass"], segments=segments, sharp=(1,))
    drink = _liquid("drink", inner, level, col, mats[liquid], segments=segments)
    bowl_from = next(z for r, z in outer[6:] if r > 0.006)
    return [glass, drink], (0.0, 0.0, (0.013 + bowl_from) / 2)


def wine_red(col, mats):
    """A Bordeaux glass, 225 mm tall, its bowl 95 mm across: 150 ml of
    red, poured to just under the widest point."""
    outer = _foot(0.037) + [(0.0037, 0.045), (0.0043, 0.075), (0.009, 0.083), (0.024, 0.093), (0.037, 0.108),
                            (0.0455, 0.13), (0.0475, 0.155), (0.045, 0.182), (0.039, 0.207), (0.0345, 0.225)]
    inner = [(0.0, 0.0875), (0.0225, 0.0945), (0.0358, 0.109), (0.0443, 0.13), (0.0463, 0.155), (0.0438, 0.182),
             (0.0378, 0.207), (0.0322, 0.2248)]
    return _stemmed(col, mats, outer, (0.0333, 0.2258), inner, 0.133, "prop_wine_red")


def wine_white(col, mats):
    """A white-wine glass, 205 mm tall, a tulip 81 mm across: about 100 ml
    of pale straw wine."""
    outer = _foot(0.035) + [(0.0035, 0.045), (0.004, 0.072), (0.008, 0.08), (0.02, 0.089), (0.031, 0.102),
                            (0.0385, 0.12), (0.0405, 0.14), (0.0385, 0.162), (0.0335, 0.185), (0.0305, 0.205)]
    inner = [(0.0, 0.0845), (0.019, 0.0905), (0.0298, 0.103), (0.0373, 0.121), (0.0393, 0.14), (0.0373, 0.162),
             (0.0323, 0.185), (0.0283, 0.2048)]
    return _stemmed(col, mats, outer, (0.0294, 0.2058), inner, 0.13, "prop_wine_white")


def flute(col, mats):
    """A champagne flute, 235 mm tall, 55 mm across at its widest: about
    140 ml, filled to 40 mm under the rim."""
    outer = _foot(0.034) + [(0.0034, 0.05), (0.0038, 0.085), (0.0065, 0.095), (0.013, 0.105), (0.0195, 0.12),
                            (0.024, 0.14), (0.0265, 0.165), (0.0275, 0.19), (0.027, 0.215), (0.0262, 0.235)]
    inner = [(0.0, 0.099), (0.0115, 0.107), (0.018, 0.121), (0.0229, 0.141), (0.0254, 0.165), (0.0264, 0.19),
             (0.0259, 0.215), (0.0248, 0.2348)]
    return _stemmed(col, mats, outer, (0.0255, 0.2357), inner, 0.195, "prop_champagne")


# ---------------------------------------------------------------------
# A tumbler, a bottle, a cup
# ---------------------------------------------------------------------

def _orange_wheel(name, col, mats, r=0.029, t=0.006, segments=24):
    """A wheel of orange `r` across and `t` thick about Z: flesh on its
    faces, a band of peel round its edge."""
    rf = r - 0.0022
    prof = [(0.0, -t / 2), (rf, -t / 2), (r, -t / 2 + 0.0012), (r, t / 2 - 0.0012), (rf, t / 2), (0.0, t / 2)]
    return _lathe(name, prof, col, [mats["prop_orange_flesh"], mats["prop_orange_peel"]], bands=[0, 1, 1, 1, 0],
                  segments=segments, sharp=(1, 4))


def tumbler(col, mats):
    """A rocks glass, 90 mm tall and 85 mm across, its base 13 mm thick:
    a Negroni over three cubes of ice, a wheel of orange slit onto the rim
    at its +X side, its face to the front and the back. The grip, round its
    body a third of the way up."""
    outer = [(0.0, 0.0015), (0.036, 0.0), (0.0395, 0.0015), (0.0405, 0.006), (0.0425, 0.088)]
    inner = [(0.0, 0.0135), (0.036, 0.0145), (0.0393, 0.02), (0.041, 0.0888)]
    parts = [_vessel("glass", outer, (0.0418, 0.0898), inner, col, mats["prop_glass"], segments=32),
             _liquid("drink", inner, 0.062, col, mats["prop_negroni"], segments=32)]
    # Floating: each cube's top a few millimetres proud of the drink.
    for k, (x, y, z, rot) in enumerate(((0.015, 0.007, 0.052, (0.3, 0.2, 0.5)), (-0.013, 0.013, 0.054, (-0.2, 0.35, 1.2)),
                                        (-0.003, -0.016, 0.053, (0.25, -0.3, 2.1)))):
        parts.append(g.box(f"ice{k}", (0.026, 0.025, 0.024), loc=(x, y, z), rot=rot, col=col, mat=mats["prop_ice"],
                           bevel=0.003, segments=1, shade_smooth=True))
    # The wheel's plane holds the glass's axis: slit from its edge to its
    # middle, it straddles the wall, half in the drink and half outside.
    a = -0.3
    wheel = _orange_wheel("orange", col, mats)
    _transform(wheel, Matrix.Translation((0.0415 * math.cos(a), 0.0415 * math.sin(a), 0.084)) @
               Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(PI / 2, 4, "X"))
    parts.append(wheel)
    return parts, (0.0, 0.0, 0.03)


def beer(col, mats):
    """A 0.33 l brown longneck, 231 mm tall and 61 mm across, a cream
    label edged in red round its body and a red band round its neck,
    facing -Y; a gold crown cap. The grip, round its body a third of the
    way up."""
    bottle = [(0.0, 0.002), (0.026, 0.0), (0.0295, 0.0025), (0.0305, 0.008), (0.0305, 0.135), (0.0285, 0.152),
              (0.022, 0.168), (0.0155, 0.182), (0.0135, 0.195), (0.0132, 0.215), (0.0145, 0.2175), (0.0145, 0.2215),
              (0.0135, 0.2225), (0.0, 0.2225)]
    parts = [_lathe("bottle", bottle, col, mats["prop_bottle_brown"], segments=24, sharp=(1,))]
    # The labels stand 0.6 mm proud of the glass: open bands, as paper is.
    r = 0.0311
    parts.append(_lathe("label", [(r, 0.045), (r, 0.051), (r, 0.119), (r, 0.125)], col,
                        [mats["prop_label_red"], mats["prop_label"]], bands=[0, 1, 0], segments=24, sharp=(1, 2)))
    parts.append(_lathe("neck_label", [(0.0149, 0.188), (0.0142, 0.196), (0.0139, 0.204)], col, mats["prop_label_red"],
                        segments=24))
    # The crown: a crimped skirt of 21 flutes under a flat top.
    n = 42
    rings = [[(0.0136 * math.cos(2 * PI * i / n), 0.0136 * math.sin(2 * PI * i / n), 0.2214) for i in range(n)]]
    for rr, z, crimp in ((0.0158, 0.2214, 0.0009), (0.016, 0.2262, 0.0009), (0.0154, 0.2296, 0.0002),
                         (0.0128, 0.2306, 0.0)):
        rings.append([((rr + crimp * math.cos(21 * 2 * PI * i / n)) * math.cos(2 * PI * i / n),
                       (rr + crimp * math.cos(21 * 2 * PI * i / n)) * math.sin(2 * PI * i / n), z) for i in range(n)])
    rings.append([(0.0, 0.0, 0.2306)])
    parts.append(_skin("crown", rings, col, mats["brass"], sharp=(3,)))
    return parts, (0.0, 0.0, 0.231 / 3)


def coffee(col, mats):
    """A cappuccino cup, 180 ml: 92 mm across and 66 mm tall on a narrow
    foot, white glazed porcelain, pale foam ringed with crema 8 mm under
    the rim. Its handle at -X; the grip, through the handle."""
    outer = [(0.0, 0.002), (0.024, 0.0), (0.0255, 0.003), (0.026, 0.006), (0.034, 0.014), (0.042, 0.03), (0.0455, 0.05),
             (0.0462, 0.064)]
    inner = [(0.0, 0.0105), (0.032, 0.016), (0.0402, 0.031), (0.0438, 0.05), (0.0445, 0.064)]
    parts = [_vessel("cup", outer, (0.0455, 0.0656), inner, col, mats["porcelain"], segments=28, sharp=(1,))]
    level = 0.057
    edge = 0.0438 + (0.0445 - 0.0438) * (level - 0.05) / 0.014 - GAP
    # From the rim inwards, so the surface faces up.
    parts.append(_lathe("coffee", [(edge, level), (0.026, level + 0.0006), (0.0, level + 0.0012)], col,
                        [mats["prop_crema"], mats["prop_foam"]], bands=[0, 1], segments=28))
    # The handle: a loop out from the wall, its ends buried in it.
    # Its top end stays under the coffee's surface and outside the bowl,
    # so nothing of it shows inside the cup.
    loop = [(-0.0445, 0.051), (-0.053, 0.0555), (-0.0615, 0.0515), (-0.065, 0.041), (-0.062, 0.03), (-0.053, 0.0225),
            (-0.0365, 0.021)]
    parts.append(g.sweep("handle", g.catmull_rom([(x, 0.0, z) for x, z in loop], 3), 0.0045, sides=10, col=col,
                         mat=mats["porcelain"]))
    return parts, (-0.054, 0.0, 0.037)


# ---------------------------------------------------------------------
# For the loungers
# ---------------------------------------------------------------------

def _towel_section(w, h, layers):
    """A folded towel's section across its width, (y, z) from its bottom
    at +Y round anticlockwise (seen from +X): up the open side, where its
    `layers` show as rounded edges with creases between them, across the
    top, round the fold at -Y and back along the bottom."""
    rb = h / (2 * layers)
    cy, yl = w / 2 - rb, -w / 2 + h / 2
    pts = [(cy, 0.0)]
    for i in range(layers):
        zc = rb * (2 * i + 1)
        pts += [(cy + rb * math.cos(a), zc + rb * math.sin(a)) for a in (-PI / 4, 0.0, PI / 4)]
        if i < layers - 1:
            pts.append((cy + 0.4 * rb, 2 * rb * (i + 1)))
    pts.append((cy, h))
    pts += [(cy + (yl - cy) * t, h) for t in (0.25, 0.5, 0.75)]
    pts += [(yl + h / 2 * math.cos(a), h / 2 + h / 2 * math.sin(a)) for a in (PI / 2, 3 * PI / 4, PI, 5 * PI / 4, 3 * PI / 2)]
    pts += [(yl + (cy - yl) * t, 0.0) for t in (1 / 3, 2 / 3)]
    return pts


def towel(col, mats, length=0.46, width=0.32, height=0.045, layers=4, puff=0.006):
    """A beach towel folded for a lounger: a soft slab 460 x 320 mm and 45
    mm thick, its ends and its -Y side round folds, its +Y side the edges
    of its four layers, its top a little puffed, striped across in navy
    and white. Lying along X; its origin, the middle of its underside."""
    rr = height / 2
    stripes = (0.14, 0.22, 0.42, 0.58, 0.78, 0.86)        # navy from the 1st to the 2nd, the 3rd to the 4th ...
    flat = length - 2 * rr
    section = _towel_section(width, height, layers)
    # Each end rounded over as a fold: (x, its share of the full height).
    tip = [(-length / 2 + rr * (1 - math.cos(p)), math.sin(p)) for p in (0.2, 0.6, 1.05)]
    xs = sorted({round(-flat / 2 + flat * k / 8, 5) for k in range(9)} |
                {round(-length / 2 + length * u, 5) for u in stripes})
    stations = tip + [(x, 1.0) for x in xs if abs(x) <= flat / 2 + 1e-6] + [(-x, k) for x, k in reversed(tip)]
    rings = [[(-length / 2, 0.0, rr)]]
    for x, k in stations:
        narrow = (width - 0.016 * (1 - k)) / width
        ring = []
        for y, z in section:
            z = rr + (z - rr) * k
            if z > rr:
                z += puff * max(0.0, 1 - (2 * x / length) ** 2) * max(0.0, 1 - (2 * y / width) ** 2)
            ring.append((x, y * narrow, z))
        rings.append(ring)
    rings.append([(length / 2, 0.0, rr)])

    def navy(x):
        u = (x + length / 2) / length
        return int(any(stripes[i] <= u < stripes[i + 1] for i in range(0, len(stripes), 2)))

    xs_all = [-length / 2] + [x for x, _ in stations] + [length / 2]
    bands = [navy((a + b) / 2) for a, b in zip(xs_all, xs_all[1:])]
    obj = _skin("towel", rings, col, [mats["prop_terry_white"], mats["prop_terry_navy"]], bands)
    return [obj], (0.0, 0.0, 0.0)


_BOOK = (0.129, 0.198, 0.024)          # a B-format paperback: wide, tall, thick
_CARD = 0.0006                          # its cover


def book(col, mats):
    """A closed paperback, 129 x 198 mm and 24 mm thick, standing on its
    tail: its spine at x = 0, its front cover (teal, a cream title panel)
    towards -Y. The grip, the middle of its spine."""
    w, h, t = _BOOK
    cover, pages = mats["prop_cover"], mats["prop_pages"]
    parts = [
        g.box("pages", (w - 0.0022, t - 2 * _CARD, h - 0.0016), loc=(0.0015 + (w - 0.0022) / 2, 0, h / 2), col=col,
              mat=pages),
        g.box("front", (w, _CARD, h), loc=(w / 2, -t / 2 + _CARD / 2, h / 2), col=col, mat=cover),
        g.box("back", (w, _CARD, h), loc=(w / 2, t / 2 - _CARD / 2, h / 2), col=col, mat=cover),
        g.box("spine", (0.0016, t, h), loc=(0.0008, 0, h / 2), col=col, mat=cover, bevel=0.0007, segments=2,
              shade_smooth=True),
        g.box("title", (0.094, 0.0004, 0.052), loc=(w / 2 + 0.004, -t / 2 - 0.0002, h * 0.7), col=col,
              mat=mats["prop_title"]),
        g.box("title_ink", (0.066, 0.0003, 0.007), loc=(w / 2 + 0.004, -t / 2 - 0.00055, h * 0.7 + 0.008), col=col,
              mat=mats["prop_ink"]),
        g.box("author_ink", (0.044, 0.0003, 0.004), loc=(w / 2 + 0.004, -t / 2 - 0.00055, h * 0.7 - 0.01), col=col,
              mat=mats["prop_ink"]),
    ]
    return parts, (0.0, 0.0, h / 2)


def book_open(col, mats, slope=0.24):
    """The paperback open face down, tented over its spine as it is put
    down mid-chapter: each half `slope` radians below level, the spine
    along Y at the top. Its origin, the middle of its underside."""
    w, h, t = _BOOK
    half = t / 2
    parts = []
    # Raised so the pages' outer edges, the lowest points, rest on z = 0.
    lift = (w - 0.0015) * math.sin(slope) + (half + _CARD) * math.cos(slope)
    for s in (-1, 1):
        turn = Matrix.Translation((0, 0, lift)) @ Matrix.Rotation(s * slope, 4, "Y")
        board = g.box("cover", (w, h, _CARD), loc=(s * w / 2, 0, -_CARD / 2), col=col, mat=mats["prop_cover"])
        leaves = g.box("pages", (w - 0.0015, h - 0.0016, half), loc=(s * (w - 0.0015) / 2, 0, -_CARD - half / 2), col=col,
                       mat=mats["prop_pages"])
        parts += [_transform(board, turn), _transform(leaves, turn)]
    # The spine, rounded over where the two halves meet.
    spine = g.cylinder("spine", 0.0045, h, loc=(0, 0, lift - 0.0035), rot=(PI / 2, 0, 0), col=col, mat=mats["prop_cover"],
                       segments=12)
    parts.append(spine)
    return parts, (0.0, 0.0, 0.0)


def sunglasses(col, mats):
    """Sunglasses, open: tortoiseshell acetate, 140 mm across, dark
    lenses 52 x 42 mm, looking -Y, the temples back along +Y. Its origin,
    the underside of the bridge, where they sit on the nose."""
    acetate, lens = mats["prop_acetate"], mats["prop_lens"]
    parts = []
    # Wayfarer-ish: each lens wider across its top than its foot.
    outline = [(x * (1 + 0.1 * z / 0.021), z) for x, z in g.rounded_rect(0.052, 0.042, 0.013, segments=4)]
    for s in (-1, 1):
        cx, cz = s * 0.0355, 0.002
        loop = [(cx + px, 0.0, cz + pz) for px, pz in outline]
        parts.append(g.sweep("rim", loop + loop[:2], 0.0026, sides=6, col=col, mat=acetate))
        parts.append(_skin("lens", [[(cx + px * 0.97, 0.0004, cz + pz * 0.97) for px, pz in outline[::-1]],
                                    [(cx, 0.0012, cz)]], col, lens))
        temple = [(s * 0.0615, 0.0, 0.016), (s * 0.066, 0.012, 0.016), (s * 0.0685, 0.06, 0.0145), (s * 0.069, 0.105, 0.011),
                  (s * 0.0675, 0.128, 0.001), (s * 0.065, 0.14, -0.012)]
        parts.append(g.sweep("temple", g.catmull_rom(temple, 3), 0.0022, sides=6, col=col, mat=acetate))
    parts.append(g.sweep("bridge", g.catmull_rom([(-0.0105, 0.0, 0.011), (0.0, -0.0015, 0.0125), (0.0105, 0.0, 0.011)], 3),
                         0.0028, sides=6, col=col, mat=acetate))
    return parts, (0.0, 0.0, 0.0095)


#: id, name, the hand that holds it (None: it lies, or is worn), builder.
PROPS = [
    ("wine-red", "Red wine glass", "right", wine_red),
    ("wine-white", "White wine glass", "right", wine_white),
    ("flute", "Champagne flute", "right", flute),
    ("tumbler", "Negroni on ice, in a tumbler", "right", tumbler),
    ("beer", "Beer, a brown longneck", "right", beer),
    ("coffee", "Cappuccino", "right", coffee),
    ("towel", "Beach towel, folded", None, towel),
    ("book", "Paperback, closed", "right", book),
    ("book-open", "Paperback, open face down", None, book_open),
    ("sunglasses", "Sunglasses", None, sunglasses),
]


if __name__ == "__main__":
    print("lib/props.py is a library: blender --background --python blender/export_props.py")

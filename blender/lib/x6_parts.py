"""The X6's parts that are not body panels: lamps, the kidneys' frames and
slats, mirrors, handles, badges, wheel-arch liners, the underbody,
exhausts — each built from its own outline or dimensions, traced off the
reference (x6_reference.py), and laid onto the finished body (x6.py's) by
casting rays at its surface, as a modeller shrinkwraps a part onto a
panel.

Like the body, they are one side's: the Mirror modifier makes the other.
The few that sit across the centreline (the badges, the roof's antenna)
are built whole, into a part of their own.
"""
import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from lib import carbody as cb, x6

# ---------------------------------------------------------------------
# Laying things on the body
# ---------------------------------------------------------------------

# How a view looks at the car: (where a ray starts, in design mm, from a
# point (a, b) in the view; the ray's direction in Blender).
VIEWS = {
    "front": (lambda a, b: (-600.0, a, b), (0.0, 1.0, 0.0)),
    "rear": (lambda a, b: (5600.0, a, b), (0.0, -1.0, 0.0)),
    "side": (lambda a, b: (a, 1600.0, b), (-1.0, 0.0, 0.0)),
    # from above: (a, b) = (X, Y)
    "top": (lambda a, b: (a, b, 3000.0), (0.0, 0.0, -1.0)),
    # the other side: the car's right (design +Y is its left, as the app has it)
    "right": (lambda a, b: (a, -1600.0, b), (1.0, 0.0, 0.0)),
}


class Surface:
    """The body as the app draws it — mirrored, not subdivided — to cast
    rays at."""

    def __init__(self, obj):
        subdivided = [(mod, mod.levels) for mod in obj.modifiers if mod.type == "SUBSURF"]
        for mod, _ in subdivided:
            mod.levels = 0
        depsgraph = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(obj, depsgraph)
        for mod, levels in subdivided:
            mod.levels = levels

    def on(self, view, a, b, lift=0.0):
        """The body under the point (a, b) of a view, raised `lift` mm off it
        along its normal; None where the ray misses."""
        start, direction = VIEWS[view]
        origin = Vector(x6.to_blender(start(a, b)))
        d = Vector(direction)
        loc, normal, _, _ = self.bvh.ray_cast(origin, d)
        if loc is None:
            return None
        if normal.dot(d) > 0:
            normal = -normal
        return loc + normal * (lift / 1000.0), normal


def _plane(view):
    """Two unit vectors (Blender) spanning a view's drawing plane, along its
    (a, b) axes."""
    return {"front": (Vector((1, 0, 0)), Vector((0, 0, 1))), "rear": (Vector((1, 0, 0)), Vector((0, 0, 1))),
            "side": (Vector((0, 1, 0)), Vector((0, 0, 1))), "right": (Vector((0, 1, 0)), Vector((0, 0, 1)))}[view]


Surface.plane = staticmethod(_plane)


class Parts:
    """Quads for one object, each with its material's name."""

    def __init__(self):
        self.verts, self.faces, self.mats = [], [], []

    def quad(self, pts, mat, out=None):
        """A face; `out`, a direction it should face (a vector, or a function
        of its middle), turns it round if it faces the other way."""
        pts = [Vector(p) for p in pts]
        if out is not None:
            mid = sum(pts, Vector()) / len(pts)
            direction = out(mid) if callable(out) else Vector(out)
            normal = Vector()
            for a, b in zip(pts, pts[1:] + pts[:1]):
                normal += a.cross(b)
            if normal.dot(direction) < 0:
                pts.reverse()
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(base, base + len(pts))))
        self.mats.append(mat)

    def grid(self, grid, mat, out=None):
        """Quads over a grid[j][i] of points; None points leave holes."""
        for j in range(len(grid) - 1):
            for i in range(len(grid[j]) - 1):
                q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                if any(p is None for p in q):
                    continue
                self.quad(q, mat, out)

    def object(self, name, mats, col, mirror=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        names = sorted(set(self.mats))
        for n in names:
            me.materials.append(mats[n])
        me.polygons.foreach_set("material_index", [names.index(n) for n in self.mats])
        me.update()
        # weld the quads' shared corners
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        obj = bpy.data.objects.new(name, me)
        col.objects.link(obj)
        if mirror:
            mod = obj.modifiers.new("Mirror", "MIRROR")
            mod.use_axis[0] = True
            mod.use_clip = True
            mod.use_mirror_merge = True
            mod.merge_threshold = 0.0005
        return obj


# ---------------------------------------------------------------------
# Outlines filled with quads
# ---------------------------------------------------------------------

def closed(outline, samples=10):
    """A smooth closed curve through an outline's points, as a polyline
    running anticlockwise."""
    pts = list(outline)
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    if area < 0:
        pts.reverse()
    poly = cb.catmull(pts + pts[:1], samples=samples, start=pts[-1], end=pts[1])
    return poly[:-1]


def fill(outline, nu, nv):
    """A quad grid inside a closed outline: its edge split into four — along
    the bottom, up the right end, back along the top, down the left end —
    and a Coons patch spanned between. Returns (grid[j][i], its edge loop)."""
    poly = closed(outline)
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    width, height = max(xs) - min(xs), max(ys) - min(ys)
    # start the bottom at the lower-left, a quarter of the height round from the leftmost point
    lengths = cb.lengths(poly + poly[:1])
    total = lengths[-1]
    left = min(range(len(poly)), key=lambda k: poly[k][0])
    start = (lengths[left] + height * 0.5) % total
    run = poly + poly[:1]
    # arc lengths of the four sides, in proportion to the outline's shape
    side = [width, height, width, height]
    scale = total / sum(side)
    marks = [start]
    for s in side[:-1]:
        marks.append((marks[-1] + s * scale) % total)
    counts = [nu, nv, nu, nv]

    def arc(a, n, length):
        return [cb.at_length(run, lengths, (a + length * k / n) % total) for k in range(n + 1)]

    arcs = [arc(marks[k], counts[k], side[k] * scale) for k in range(4)]
    bottom, right, top, leftside = arcs
    grid = cb.coons(bottom, top[::-1], leftside[::-1], right)
    loop = bottom[:-1] + right[:-1] + top[:-1] + leftside[:-1]
    return grid, loop


def offset_loop(loop, distance):
    """A closed loop moved outward (anticlockwise loop) by `distance`."""
    n = len(loop)
    out = []
    for k in range(n):
        a, b = loop[k - 1], loop[(k + 1) % n]
        tx, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, ty) or 1.0
        out.append((loop[k][0] + ty / length * distance, loop[k][1] - tx / length * distance))
    return out


def lamp(parts, surface, view, outline, nu, nv, lens, bezel="trim_black", rim=6.0, strips=(), lift=3.5):
    """A lamp laid on the body: its lens filling the outline `lift` mm off
    it, a bezel `rim` mm wide round it standing proud, a skirt from the
    bezel down into the body, and light bars (`strips`: (polyline, width,
    material)) on the lens."""
    grid, loop = fill(outline, nu, nv)
    raised = lift
    lift = lambda p, h: (surface.on(view, p[0], p[1], h) or (None,))[0]
    toward = -Vector(VIEWS[view][1])
    parts.grid([[lift(p, raised) for p in row] for row in grid], lens, toward)
    outer = offset_loop(loop, rim)
    n = len(loop)
    inner3 = [lift(p, raised) for p in loop]
    top3 = [lift(p, raised + 1.5) for p in loop]
    outer3 = [lift(p, raised + 1.5) for p in outer]
    foot3 = [lift(p, -4.0) for p in outer]
    middle = [p for p in inner3 if p is not None]
    middle = sum(middle, Vector()) / max(1, len(middle))
    for k in range(n):
        a, b = k, (k + 1) % n
        for ring, out in (((inner3, top3), lambda c: middle - c), ((top3, outer3), toward), ((outer3, foot3), lambda c: c - middle)):
            q = [ring[0][a], ring[0][b], ring[1][b], ring[1][a]]
            if all(p is not None for p in q):
                parts.quad(q, bezel, out)
    for line, width, mat in strips:
        strip(parts, surface, view, line, width, mat, 4.2)


def strip(parts, surface, view, line, width, mat, lift):
    """A band `width` mm wide along a polyline, laid on the body."""
    pts = cb.resample(cb.catmull(line, samples=6), max(2, len(line) * 4))
    left, right = [], []
    for k, p in enumerate(pts):
        a, b = pts[max(0, k - 1)], pts[min(len(pts) - 1, k + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length * width / 2, tx / length * width / 2
        left.append((p[0] + nx, p[1] + ny))
        right.append((p[0] - nx, p[1] - ny))
    row = lambda side: [(surface.on(view, x, y, lift) or (None,))[0] for x, y in side]
    parts.grid([row(right), row(left)], mat, -Vector(VIEWS[view][1]))


def spoiler(parts, root, back, up, thick, mat):
    """A wedge along a line of the body (design mm points): its trailing
    edge `back` mm behind and `up` mm above, `thick` mm deep at the root —
    a spoiler."""
    top, tip, bottom = [], [], []
    for p in root:
        top.append(Vector(x6.to_blender((p[0], p[1], p[2] + thick / 2))))
        tip.append(Vector(x6.to_blender((p[0] + back, p[1], p[2] + up))))
        bottom.append(Vector(x6.to_blender((p[0] + back * 0.2, p[1], p[2] - thick / 2))))
    parts.grid([top, tip], mat, (0, 0, 1))
    parts.grid([tip, bottom], mat, (0, 0.3, -1))


# ---------------------------------------------------------------------
# Solids
# ---------------------------------------------------------------------

def rounded_box(parts, centre, half, mat, n=4, q=3.2, taper=None, material_of=None):
    """A box with rounded edges and corners — a cube's six grids pushed out
    onto a superellipsoid, all quads — centred at `centre` (design mm),
    `half` its half-sizes. `taper(p)` may reshape each point (unit-box
    coordinates in, out); `material_of(normal, u, v)` may pick a face's
    material from the cube side it is on and where on it (0..1 each way)."""
    faces = []
    middle = Vector(x6.to_blender(centre))
    for axis in range(3):
        for sign in (-1, 1):
            grid = []
            for j in range(n + 1):
                row = []
                for i in range(n + 1):
                    u, v = -1 + 2 * i / n, -1 + 2 * j / n
                    p = [0.0, 0.0, 0.0]
                    p[axis] = sign
                    p[(axis + 1) % 3] = u
                    p[(axis + 2) % 3] = v
                    norm = sum(abs(c) ** q for c in p) ** (1 / q)
                    p = [c / norm for c in p]
                    if taper:
                        p = taper(p)
                    row.append(Vector(x6.to_blender((centre[0] + p[0] * half[0], centre[1] + p[1] * half[1],
                                                     centre[2] + p[2] * half[2]))))
                grid.append(row)
            faces.append((grid, axis, sign))
    for grid, axis, sign in faces:
        for j in range(n):
            for i in range(n):
                quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                m = mat
                if material_of:
                    normal = [0.0, 0.0, 0.0]
                    normal[axis] = sign
                    m = material_of(normal, (i + 0.5) / n, (j + 0.5) / n) or mat
                parts.quad(quad, m, lambda c: c - middle)


def tube(parts, start, end, radius, mat, inner=None, segments=16):
    """A tube from start to end (design mm), open, with an inner face at
    its end `inner` mm in, dark — an exhaust's tip."""
    a, b = Vector(x6.to_blender(start)), Vector(x6.to_blender(end))
    axis = (b - a).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    e1 = axis.cross(ref).normalized()
    e2 = axis.cross(e1)
    r = radius / 1000.0
    ring = lambda c, rr: [c + (e1 * math.cos(t) + e2 * math.sin(t)) * rr for t in
                          (2 * math.pi * k / segments for k in range(segments))]
    outer_a, outer_b = ring(a, r), ring(b, r)
    inner_b = ring(b, r * 0.86)
    inner_c = ring(b - axis * (inner or 30) / 1000.0, r * 0.86)
    radial = lambda c: (c - a) - axis * (c - a).dot(axis)
    for k in range(segments):
        m = (k + 1) % segments
        parts.quad([outer_a[k], outer_a[m], outer_b[m], outer_b[k]], mat, radial)
        parts.quad([outer_b[k], outer_b[m], inner_b[m], inner_b[k]], mat, axis)
        parts.quad([inner_b[k], inner_b[m], inner_c[m], inner_c[k]], mat, lambda c: -radial(c))
    centre = b - axis * (inner or 30) / 1000.0
    for k in range(0, segments, 2):
        parts.quad([inner_c[k], inner_c[(k + 1) % segments], inner_c[(k + 2) % segments], centre], "grille", axis)


# ---------------------------------------------------------------------
# The X6's parts
# ---------------------------------------------------------------------

# The headlamp, in the front view, and in the side view: the twin round
# units' "corona" rings in it.
HEADLAMP = [(443, 795), (649, 805), (717, 797), (765, 797), (831, 803), (859, 811), (881, 825), (897, 853),
            (903, 877), (905, 921), (891, 933), (845, 965), (819, 975), (767, 975), (745, 969), (619, 955),
            (555, 941), (443, 897), (449, 847)]
HEADLAMP_SIDE = [(109, 797), (237, 805), (297, 797), (369, 809), (411, 823), (577, 915), (577, 921), (535, 943),
                 (463, 973), (397, 975), (275, 955), (181, 931), (127, 907), (117, 895), (109, 863)]
CORONAS = [((560, 876), 62.0), ((762, 884), 64.0)]
# The fog lamps, round, in the bumper; the side markers ahead of the wheels.
FOG = ((594, 671), 52.0)
MARKER = [(448, 660), (470, 657), (646, 834), (628, 842)]
# The kidneys: the frame's outer edge, and the opening inside it.
KIDNEY = [(11, 845), (13, 801), (23, 761), (35, 743), (57, 727), (85, 721), (165, 719), (295, 721), (349, 727),
          (381, 735), (405, 749), (421, 765), (439, 795), (447, 833), (447, 883), (441, 901), (431, 913),
          (403, 929), (379, 935), (279, 943), (197, 943), (89, 937), (43, 927), (21, 907)]
# The M gill behind the front wheel.
GILL = [(1499, 493), (1521, 493), (1523, 499), (1483, 649), (1463, 741), (1473, 767), (1473, 805), (1435, 807),
        (1395, 801), (1371, 789), (1365, 775), (1367, 745), (1413, 619), (1453, 533), (1475, 505)]
# The tail lamps: in the rear view across the tailgate and the wing, and in
# the side view round the corner; the L-shaped light guides in them.
TAILLAMP = [(807, 989), (653, 989), (537, 991), (453, 997), (431, 1005), (399, 1029), (325, 1111), (323, 1119),
            (333, 1129), (357, 1137), (459, 1151), (647, 1175), (693, 1209), (749, 1207), (809, 1193), (841, 1177),
            (863, 1149), (861, 1057), (857, 1035), (843, 1007), (829, 995)]
TAIL_BARS = [[(352, 1120), (470, 1136), (640, 1158), (700, 1192), (790, 1186), (840, 1164), (852, 1120)],
             [(470, 1030), (640, 1024), (780, 1024), (835, 1040)]]
TAILLAMP_SIDE = [(4575, 989), (4717, 991), (4727, 1021), (4725, 1053), (4707, 1153), (4699, 1171), (4675, 1195),
                 (4655, 1209), (4551, 1203), (4377, 1177), (4359, 1171), (4343, 1155), (4339, 1133), (4351, 1115),
                 (4383, 1087), (4485, 1017), (4535, 995)]
TAIL_BAR_SIDE = [(4380, 1150), (4520, 1172), (4650, 1186), (4705, 1150)]
# The rear bumper's reflectors, in the vents.
REFLECTOR = [(806, 562), (800, 570), (800, 800), (806, 806), (826, 790), (832, 776), (837, 745), (839, 700),
             (837, 614), (833, 594), (828, 580)]
# The tailgate's shut line, round the plate's panel and up between the lamps.
TAILGATE = [(650, 1290), (650, 1209), (648, 1060), (645, 960), (636, 900), (615, 862), (575, 838), (500, 830),
            (300, 828), (0, 828)]
# The fuel flap, on the right rear wing (the car's right: design -Y).
FUEL = [(3890, 1060), (3900, 1045), (4100, 1040), (4118, 1060), (4122, 1170), (4105, 1192), (3905, 1195),
        (3890, 1180), (3890, 1060)]


def rim(parts, surface, view, outline, width, height, mat, samples=10):
    """A frame standing proud round an opening: a loop following the
    outline, `width` mm across, its crown `height` mm off the body, dropping
    into the opening on its inside — the kidneys' chrome surround."""
    loop = closed(outline, samples)
    toward = -Vector(VIEWS[view][1])
    inner = offset_loop(loop, -width)
    mid = offset_loop(loop, -width * 0.45)
    hits = [surface.on(view, a, b) for a, b in loop]
    ring = []
    for (a, b), (ma, mb), (ia, ib), hit in zip(loop, mid, inner, hits):
        if hit is None:
            ring.append(None)
            continue
        p, n = hit
        # the frame's section, in the view's plane: outer foot, crown, inner lip, down into the opening
        def at(u, v, lift):
            q = Vector(p)
            axes = Surface.plane(view)
            q += axes[0] * ((u - a) / 1000.0) + axes[1] * ((v - b) / 1000.0)
            return q + toward * (lift / 1000.0)
        ring.append([at(a, b, 0.5), at(ma, mb, height), at(ia, ib, height * 0.7), at(ia, ib, -25.0)])
    for k in range(len(ring)):
        a, b = ring[k], ring[(k + 1) % len(ring)]
        if a is None or b is None:
            continue
        for r in range(3):
            parts.quad([a[r], b[r], b[r + 1], a[r + 1]], mat, toward)


def slats(parts, surface, outline, pitch, mat, depth=18.0, width=7.0, inset=14.0):
    """Upright slats across a grille's opening, in the front view: one every
    `pitch` mm, each as tall as the opening is there, set back from the
    frame."""
    loop = closed(outline, 8)
    ys = [p[0] for p in loop]
    y = min(ys) + pitch * 0.6
    while y < max(ys) - pitch * 0.4:
        zs = sorted(z0 + (y - y0) * (z1 - z0) / (y1 - y0)
                    for (y0, z0), (y1, z1) in zip(loop, loop[1:] + loop[:1]) if (y0 - y) * (y1 - y) < 0)
        if len(zs) >= 2:
            z0, z1 = zs[0] + inset, zs[-1] - inset
            col = []
            for k in range(7):
                hit = surface.on("front", y, z0 + (z1 - z0) * k / 6)
                col.append(hit[0] if hit else None)
            if all(p is not None for p in col):
                fwd = Vector((0, -depth / 1000.0, 0))
                side = Vector((width / 2000.0, 0, 0))
                front = [p + fwd for p in col]
                parts.grid([[p - side for p in col], [p - side for p in front]], mat)
                parts.grid([[p - side for p in front], [p + side for p in front]], mat)
                parts.grid([[p + side for p in front], [p + side for p in col]], mat)
        y += pitch


def circle(centre, radius, n=24):
    (a, b) = centre
    return [(a + radius * math.cos(2 * math.pi * k / n), b + radius * math.sin(2 * math.pi * k / n)) for k in range(n)]


def build(body_obj, body, mats, col):
    """Every part, laid on the body; returns the objects."""
    surface = Surface(body_obj)
    half, centre = Parts(), Parts()

    # Headlamps: the lens over the twin units, their corona rings lit.
    lamp(half, surface, "front", HEADLAMP, 36, 6, "lens_front", rim=5,
         strips=[(circle(c, r) + circle(c, r)[:1], 10, "chrome") for c, r in CORONAS] +
                [(circle(c, r * 0.55) + circle(c, r * 0.55)[:1], 14, "lens_clear") for c, r in CORONAS])
    lamp(half, surface, "side", HEADLAMP_SIDE, 14, 5, "lens_front", rim=5)
    # Fog lamps in chrome rings; the side markers.
    lamp(half, surface, "front", circle(*FOG, n=20), 6, 6, "lens_clear", bezel="chrome", rim=7)
    lamp(half, surface, "side", MARKER, 8, 2, "lens_clear", rim=3)

    # The kidneys: a chrome frame standing proud, upright black slats behind.
    rim(half, surface, "front", KIDNEY, 30.0, 14.0, "chrome")
    slats(half, surface, offset_loop(closed(KIDNEY, 8), -30.0), 34.0, "trim_black")

    # The gill: a chrome frame, black inside.
    lamp(half, surface, "side", GILL, 4, 10, "grille", bezel="chrome", rim=9)

    # Tail lamps: smoked red, the L-shaped guides lit; the tailgate's shut
    # line through them.
    lamp(half, surface, "rear", TAILLAMP, 40, 6, "lens_clear", bezel="trim_black", rim=5,
         strips=[(bar, 8, "chrome") for bar in TAIL_BARS])
    lamp(half, surface, "side", TAILLAMP_SIDE, 16, 6, "lens_clear", bezel="trim_black", rim=5,
         strips=[(TAIL_BAR_SIDE, 8, "chrome")])
    strip(half, surface, "rear", [(330, 1116), (400, 1036), (450, 1004), (540, 996), (653, 994), (810, 994),
                                  (845, 1010), (858, 1040)], 7, "lens_rear", 4.4)
    strip(half, surface, "rear", TAILGATE, 4, "rubber_seal", 0.4)
    strip(half, surface, "rear", [(650, 1209), (650, 989)], 4, "trim_black", 6.0)
    lamp(half, surface, "rear", REFLECTOR, 2, 6, "lens_clear", rim=3)

    # The side glass's black pillars: the B-pillar, and the bar between the
    # rear door's glass and the quarter light.
    strip(half, surface, "side", [(2676, 1195), (2778, 1619)], 44, "trim_black", 1.0)
    strip(half, surface, "side", [(3440, 1258), (3510, 1545)], 40, "trim_black", 1.0)

    # Mirrors: the cap body-coloured, the housing's foot and underside black,
    # the glass facing back, on a short black arm.
    def housing_shape(p):
        x, y, z = p
        out = (y + 1) / 2                      # 0 at the car, 1 at the tip
        k = 0.7 + 0.3 * out
        return [max(-0.85, min(1.0, x)) * (0.82 + 0.18 * out), y, z * k + 0.12 * (1 - out)]

    def housing_material(normal, u, v):
        if normal[0] > 0.5:
            return "mirror"
        if normal[2] < -0.5:
            return "trim_black"
        # the sides: the cap above, black below
        if normal[2] == 0:
            axis = [abs(c) for c in normal].index(1.0)
            # where on this side the face is, up the car: the cube side's second coordinate is Z for X and Y sides
            height = v if axis == 0 else u
            return "trim_black" if height < 0.3 else None
        return None

    rounded_box(half, (1830, 975, 1250), (86, 112, 86), "paint", n=6, q=2.8,
                taper=housing_shape, material_of=housing_material)
    rounded_box(half, (1782, 885, 1190), (60, 44, 30), "trim_black", n=3, q=3.0)

    # Door handles, body-coloured, standing just proud of the doors.
    for x, z, length in ((2430, 1035, 90), (3470, 1098, 86)):
        hit = surface.on("side", x, z)
        if hit:
            y = x6.from_blender(hit[0])[1]
            rounded_box(half, (x, y + 4, z), (length, 12, 14), "paint", n=3, q=3.2)

    # Wheel-arch liners: a tunnel inside each arch, black.
    for arch in (x6.FRONT_ARCH, x6.REAR_ARCH):
        liner(half, body, arch)

    # The underbody: flat, black, between and round the wheels; and the
    # splitter under the front bumper.
    floor = [(1350, 3380, 0, 900, 270), (4270, 4700, 0, 600, 330),
             (450, 1350, 0, 560, 250), (3380, 4270, 0, 560, 290)]
    for x0, x1, y0, y1, z in floor:
        pts = [[Vector(x6.to_blender((x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * j / 3, z))) for i in range(7)]
               for j in range(4)]
        half.grid(pts, "grille", (0, 0, -1))

    # The diffuser's slotted black insert, between the tailpipes.
    diffuser = [(-321, 453), (-305, 435), (-291, 421), (-271, 411), (-241, 407)] + \
        [(y, 406) for y in range(-200, 201, 50)] + [(241, 407), (271, 411), (291, 421), (305, 435), (321, 453),
                                                     (313, 457)] + [(y, 457) for y in range(250, -251, -50)] + [(-313, 457)]
    lamp(centre, surface, "rear", diffuser, 16, 3, "grille", rim=3)
    for z in (420.0, 432.0, 444.0):
        strip(centre, surface, "rear", [(-280.0, z), (280.0, z)], 3, "trim_black", 3.0)

    # Exhausts: four round tips, chrome, through the diffuser's notches.
    for y in (381.0, 480.0):
        hit = surface.on("rear", y, 387.0)
        x_face = x6.from_blender(hit[0])[0] if hit else 4760.0
        tube(half, (x_face - 60, y, 387), (4818, y, 387), 44, "exhaust", inner=45)

    # The tailgate's lip spoiler, body-coloured, along the deck's edge.
    lip = []
    for y in range(0, 600, 50):
        hit = surface.on("top", 4730.0, float(y))
        if hit and x6.from_blender(hit[0])[2] > 1200:
            lip.append(x6.from_blender(hit[0]))
    spoiler(half, lip, 95.0, 22.0, 10.0, "paint")

    # Across the centre: the badges, the plate, the roof's antenna.
    badge(centre, surface, "front", 0.0, 968.0, 40.0)
    badge(centre, surface, "rear", 0.0, 1183.0, 48.0)
    # "X6", then the M: read from behind, left to right is the car's left to right, Y falling
    lettering(centre, surface, "rear", "X6", -417.0, 1187.0, 32.0, 7.0, "chrome", 2.5, direction=-1.0)
    stripes = [(-535.0 - 11.0 * k, "m_light_blue m_dark_blue m_red".split()[k]) for k in range(3)]
    for y, mat in stripes:
        strip(centre, surface, "rear", [(y, 1188.0), (y - 9.0, 1218.0)], 6.0, mat, 2.5)
    lettering(centre, surface, "rear", "M", -575.0, 1187.0, 32.0, 7.0, "chrome", 2.5, direction=-1.0)
    m_badge(centre, surface, "front", 358.0, 875.0, 66.0, 13.0, 36.0)
    m_badge(half, surface, "side", 1424.0, 781.0, 60.0, 11.0, 12.0, stripes_only=True)
    plate = [(y, 945) for y in range(-150, 151, 30)] + [(152, 947), (152, 1087)] + \
        [(y, 1089) for y in range(150, -151, -30)] + [(-152, 1087), (-152, 947)]
    lamp(centre, surface, "rear", plate, 24, 8, "plate", bezel="plate", rim=2, lift=6.0)
    strip(centre, surface, "right", FUEL, 3, "rubber_seal", 0.4)
    roof = surface.on("top", 3610.0, 0.0)
    roof_z = x6.from_blender(roof[0])[2] if roof else body.profile(3610)
    rounded_box(centre, (3610, 0, roof_z + 22), (95, 32, 30), "paint", n=4, q=2.6,
                taper=lambda p: [p[0], p[1] * (0.35 + 0.65 * (1 - (p[2] + 1) / 2)), p[2] - 0.35 * max(0, p[0])])

    return [half.object("Details", mats, col), centre.object("Badges", mats, col, mirror=False)]


# Letters as strokes, in a box one unit high: (advance, [polyline, ...]).
GLYPHS = {
    "X": (0.8, [[(0.0, 0.0), (0.7, 1.0)], [(0.0, 1.0), (0.7, 0.0)]]),
    "6": (0.8, [[(0.65, 1.0), (0.25, 1.0), (0.05, 0.75), (0.02, 0.3), (0.15, 0.03), (0.5, 0.0), (0.68, 0.12),
                 (0.7, 0.38), (0.55, 0.53), (0.2, 0.53), (0.04, 0.4)]]),
    "M": (1.0, [[(0.0, 0.0), (0.18, 1.0), (0.45, 0.35), (0.72, 1.0), (0.9, 0.0)]]),
}


def lettering(parts, surface, view, text, a, b, height, stroke, mat, lift, direction=1.0):
    """Text in chrome strokes on the body, starting at (a, b) of a view (its
    baseline's left end as read), `height` mm tall; `direction` -1 where the
    view's first axis runs right to left as read."""
    x = 0.0
    for ch in text:
        if ch == " ":
            x += 0.5
            continue
        advance, strokes = GLYPHS[ch]
        for line in strokes:
            pts = [(a + direction * (x + u) * height, b + v * height) for u, v in line]
            strip(parts, surface, view, pts, stroke, mat, lift)
        x += advance


def m_badge(parts, surface, view, a, b, width, height, lift, stripes_only=False):
    """A model badge laid on the body at (a, b) of a view: a dark chrome
    plate with the M's three slanted stripes at its end (the stripes alone
    on the gills)."""
    def at(u, v):
        hit = surface.on(view, u, v, lift)
        return hit[0] if hit else None
    toward = -Vector(VIEWS[view][1])
    a0, a1, b0, b1 = a - width / 2, a + width / 2, b - height / 2, b + height / 2
    # which way "along" runs in the view: the stripes at the end nearer the car's outside
    sign = 1.0 if view == "side" else (1.0 if a >= 0 else -1.0)
    stripes_start = a0 if stripes_only else a + sign * width * 0.12
    if not stripes_only:
        # the plate
        rows = [[at(a0 + (a1 - a0) * i / 6, v) for i in range(7)] for v in (b0, b1)]
        if all(p is not None for row in rows for p in row):
            parts.grid(rows, "exhaust", toward)
    span = (width if stripes_only else width * 0.36) / 3
    slant = height * 0.35
    for k, mat in enumerate(("m_light_blue", "m_dark_blue", "m_red")):
        u0 = stripes_start + sign * span * k
        u1 = u0 + sign * span * 0.8
        quad = [at(u0, b0), at(u1, b0), at(u1 + sign * slant, b1), at(u0 + sign * slant, b1)]
        if all(p is not None for p in quad):
            quad = [p + toward * 0.0008 for p in quad]
            parts.quad(quad, mat, toward)


def liner(parts, body, arch):
    """A wheel arch's liner: a tunnel from just inside its lip in to the
    wheel's inner side, and a wall closing it."""
    lip = body.arch_lip(arch)[::10] + [body.arch_lip(arch)[-1]]
    (cx, cz) = arch["centre"]
    rows = []
    for depth in (0.0, 0.25, 0.5, 0.75, 1.0):
        row = []
        for x, z in lip:
            y_lip = body.point(x, body.row_at_height(x, z))[1] + 25
            y = y_lip - 12 - (y_lip - 540) * depth
            # a little inside the lip, and wider as it goes in
            r = 1 + 0.03 * depth
            row.append(Vector(x6.to_blender((cx + (x - cx) * r - (x - cx) * 0.02, y, cz + (z - cz) * r - (z - cz) * 0.02))))
        rows.append(row)
    axle = Vector(x6.to_blender((cx, 0.0, cz)))
    toward_axle = lambda c: Vector((0.0, axle.y - c.y, axle.z - c.z))
    parts.grid(rows, "grille", toward_axle)
    # the wall at the inner end, facing out to the wheel
    wall = [rows[-1], [Vector(x6.to_blender((x, 540, 250))) for x, _ in lip]]
    parts.grid(wall, "grille", (1, 0, 0))


def badge(parts, surface, view, a, b, radius):
    """A BMW roundel on the body: a black ring round a quartered disc, blue
    and white — each of its points laid on the surface under it."""
    toward = -Vector(VIEWS[view][1])
    segments = 32
    lift = lambda da, db, h: (surface.on(view, a + da, b + db, h) or (None,))[0]
    for k in range(segments):
        t0, t1 = 2 * math.pi * k / segments, 2 * math.pi * (k + 1) / segments
        quarter = int(((t0 + t1) / 2) // (math.pi / 2))
        inner = "badge_blue" if quarter % 2 == 0 else "badge_white"
        ring = lambda t, r, h: lift(r * math.cos(t), r * math.sin(t), h)
        outer = [ring(t0, radius * 0.58, 2.6), ring(t1, radius * 0.58, 2.6), ring(t1, radius, 3.2), ring(t0, radius, 3.2)]
        disc = [lift(0, 0, 2.4), lift(0, 0, 2.4), ring(t1, radius * 0.58, 2.6), ring(t0, radius * 0.58, 2.6)]
        if all(p is not None for p in outer):
            parts.quad(outer, "badge_black", toward)
        if all(p is not None for p in disc):
            parts.quad([disc[0], disc[2], disc[3]], inner, toward)

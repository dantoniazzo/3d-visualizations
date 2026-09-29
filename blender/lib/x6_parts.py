"""The X6's parts that are not body panels: lamps, grille slats, mirrors,
handles, badges, wheel-arch liners, the underbody, exhausts — each built
from its own outline or dimensions off the blueprints, and laid onto the
finished body (x6.py's) by casting rays at its surface, as a modeller
shrinkwraps a part onto a panel.

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
}


class Surface:
    """The body as it is drawn — mirrored and subdivided — to cast rays at."""

    def __init__(self, obj):
        depsgraph = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(obj, depsgraph)

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


def lamp(parts, surface, view, outline, nu, nv, lens, bezel="trim_black", rim=6.0, strips=()):
    """A lamp laid on the body: its lens filling the outline, a bezel `rim`
    mm wide round it standing proud, a skirt from the bezel down into the
    body, and light bars (`strips`: (polyline, width, material)) on the
    lens."""
    grid, loop = fill(outline, nu, nv)
    lift = lambda p, h: (surface.on(view, p[0], p[1], h) or (None,))[0]
    toward = -Vector(VIEWS[view][1])
    parts.grid([[lift(p, 1.5) for p in row] for row in grid], lens, toward)
    outer = offset_loop(loop, rim)
    n = len(loop)
    inner3 = [lift(p, 1.5) for p in loop]
    top3 = [lift(p, 3.0) for p in loop]
    outer3 = [lift(p, 3.0) for p in outer]
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
        strip(parts, surface, view, line, width, mat, 2.2)


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


# ---------------------------------------------------------------------
# Solids
# ---------------------------------------------------------------------

def rounded_box(parts, centre, half, mat, n=4, q=3.2, taper=None, material_of=None):
    """A box with rounded edges and corners — a cube's six grids pushed out
    onto a superellipsoid, all quads — centred at `centre` (design mm),
    `half` its half-sizes. `taper(p)` may reshape each point (unit-box
    coordinates in, out); `material_of(normal)` may pick a face's material
    from its outward direction."""
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
                    m = material_of(normal) or mat
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

HEADLAMP = [(492, 906), (540, 946), (700, 958), (866, 966), (900, 944), (894, 876), (780, 852),
            (620, 842), (530, 858)]
HEADLAMP_SIDE = [(196, 996), (300, 1000), (392, 996), (330, 972), (250, 944), (196, 930)]
TAILLAMP = [(206, 1082), (206, 1124), (420, 1132), (640, 1134), (720, 1172), (800, 1200), (872, 1194),
            (898, 1150), (886, 1058), (720, 1054), (640, 1074), (420, 1078)]
TAILLAMP_SIDE = [(4560, 1148), (4660, 1186), (4762, 1196), (4762, 1054), (4660, 1076)]
REFLECTOR = [(838, 742), (864, 754), (872, 924), (848, 918), (838, 860)]
GILL = [(1262, 812), (1330, 812), (1530, 612), (1470, 604)]
KIDNEY_INNER = [(56, 906), (300, 912), (362, 888), (392, 848), (394, 758), (372, 718), (322, 694), (70, 692), (56, 710)]


def build(body_obj, body, mats, col):
    """Every part, laid on the body; returns the objects."""
    surface = Surface(body_obj)
    half, centre = Parts(), Parts()

    # Lamps
    lamp(half, surface, "front", HEADLAMP, 16, 3, "lens_front", strips=[
        ([(646, 950), (604, 902), (646, 856)], 9, "drl"),
        ([(826, 958), (866, 910), (832, 864)], 9, "drl"),
    ])
    lamp(half, surface, "side", HEADLAMP_SIDE, 6, 2, "lens_front")
    lamp(half, surface, "rear", TAILLAMP, 18, 3, "lens_rear", rim=5, strips=[
        ([(230, 1103), (420, 1106), (640, 1108), (720, 1140), (820, 1172), (870, 1170)], 7, "lamp_rear_bar"),
    ])
    lamp(half, surface, "side", TAILLAMP_SIDE, 6, 3, "lens_rear", rim=5, strips=[
        ([(4600, 1150), (4700, 1170), (4755, 1172)], 7, "lamp_rear_bar"),
    ])
    lamp(half, surface, "rear", REFLECTOR, 2, 4, "reflector", rim=4)
    lamp(half, surface, "side", GILL, 5, 2, "trim_black", rim=4, strips=[
        ([(1300, 800), (1488, 616)], 10, "chrome"),
    ])

    # The kidneys' slats, across the opening behind the frame.
    kidney = closed(KIDNEY_INNER)
    for z in range(708, 900, 24):
        crossings = sorted(x for (x0, z0), (x1, z1) in zip(kidney, kidney[1:] + kidney[:1])
                           if (z0 - z) * (z1 - z) < 0 for x in [x0 + (z - z0) * (x1 - x0) / (z1 - z0)])
        if len(crossings) < 2:
            continue
        y0, y1 = crossings[0], crossings[-1]
        row = []
        for y in (y0 + (y1 - y0) * k / 8 for k in range(9)):
            hit = surface.on("front", y, z)
            row.append(hit[0] if hit else None)
        if any(p is None for p in row):
            continue
        # a bar 7 mm high, standing 22 mm deep, set 14 mm in front of the grille's back
        up = Vector((0, 0, 0.0035))
        fwd = Vector((0, -0.036, 0))
        back = Vector((0, -0.014, 0))
        bar = [[p + back + fwd - up for p in row], [p + back + fwd + up for p in row],
               [p + back + up for p in row], [p + back - up for p in row]]
        half.grid(bar[:2], "trim_black")
        half.grid(bar[1:3], "trim_black")
        half.grid(bar[2:4], "trim_black")

    # The intakes' fins: upright blades across each outer intake.
    for y in (700, 800):
        blade = []
        for z in range(420, 720, 30):
            hit = surface.on("front", y, z)
            blade.append(hit[0] if hit else None)
        if all(p is not None for p in blade):
            front = [p + Vector((0, -0.045, 0)) for p in blade]
            side = Vector((0.004, 0, 0))
            half.grid([[p - side for p in blade], [p - side for p in front]], "trim_black")
            half.grid([[p - side for p in front], [p + side for p in front]], "trim_black")
            half.grid([[p + side for p in front], [p + side for p in blade]], "trim_black")

    # Mirrors: a housing swept back on an arm from the door's front corner.
    def housing_shape(p):
        # narrower towards the car, the glass face flat
        x, y, z = p
        k = 0.78 + 0.22 * (y + 1) / 2
        return [max(-0.72, min(1.0, x)) * k, y, z * k]

    glass_back = lambda nrm: "mirror" if nrm[0] > 0.5 else None
    rounded_box(half, (1800, 1000, 1256), (96, 108, 72), "trim_black", n=6, q=3.0,
                taper=housing_shape, material_of=glass_back)
    rounded_box(half, (1760, 900, 1196), (46, 46, 22), "trim_black", n=3, q=3.0)

    # Door handles, pulled out of the door skin.
    for x, z in ((2468, 1030), (3466, 1046)):
        hit = surface.on("side", x, z)
        if hit:
            y = x6.from_blender(hit[0])[1]
            rounded_box(half, (x, y + 6, z), (104, 13, 19), "paint", n=3, q=3.2)

    # Wheel-arch liners: a tunnel inside each arch, black.
    for arch in (x6.FRONT_ARCH, x6.REAR_ARCH):
        liner(half, body, arch)

    # The underbody: flat, black, between and round the wheels.
    floor = [(150, 440, 0, 880, 285), (1350, 3410, 0, 930, 250), (4320, 4880, 0, 900, 320),
             (440, 1350, 0, 560, 250), (3410, 4320, 0, 560, 270)]
    for x0, x1, y0, y1, z in floor:
        pts = [[Vector(x6.to_blender((x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * j / 3, z))) for i in range(7)]
               for j in range(4)]
        half.grid(pts, "grille", (0, 0, -1))

    # Exhausts: four tips, two a side, black chrome.
    for y in (614, 735):
        tube(half, (4905, y, 405), (4968, y, 405), 50, "exhaust")

    # Across the centre: the badges, and the roof's antenna.
    badge(centre, surface, "front", 0.0, 987.0, 41.0)
    badge(centre, surface, "rear", 0.0, 1160.0, 41.0)
    rounded_box(centre, (3620, 0, body.profile(3620) + 26), (78, 26, 30), "trim_black", n=4, q=2.6,
                taper=lambda p: [p[0], p[1] * (0.35 + 0.65 * (1 - (p[2] + 1) / 2)), p[2] - 0.35 * max(0, p[0])])

    return [half.object("Details", mats, col), centre.object("Badges", mats, col, mirror=False)]


def liner(parts, body, arch):
    """A wheel arch's liner: a tunnel from just inside its lip in to the
    wheel's inner side, and a wall closing it."""
    lip = body.arch_lip(arch)[::10] + [body.arch_lip(arch)[-1]]
    (cx, cz) = arch["centre"]
    rows = []
    for depth in (0.0, 0.25, 0.5, 0.75, 1.0):
        row = []
        for x, z in lip:
            y_lip = body.point(x, body.row_at_height(x, z))[1]
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
    and white."""
    hit = surface.on(view, a, b, 2.0)
    if not hit:
        return
    centre, normal = hit
    ref = Vector((0, 0, 1)) if abs(normal.z) < 0.9 else Vector((1, 0, 0))
    e1 = normal.cross(ref).normalized()
    e2 = normal.cross(e1)
    r = radius / 1000.0
    segments = 32
    at = lambda t, rr, h=0.0: centre + (e1 * math.cos(t) + e2 * math.sin(t)) * rr + normal * h
    for k in range(segments):
        t0, t1 = 2 * math.pi * k / segments, 2 * math.pi * (k + 1) / segments
        quarter = int(((t0 + t1) / 2) // (math.pi / 2))
        inner = "badge_blue" if quarter % 2 == 0 else "badge_white"
        parts.quad([at(t0, r * 0.58, 0.0006), at(t1, r * 0.58, 0.0006), at(t1, r, 0.0015), at(t0, r, 0.0015)], "badge_black", normal)
        parts.quad([at(t0, r * 0.001), at(t1, r * 0.001), at(t1, r * 0.58, 0.0006), at(t0, r * 0.58, 0.0006)], inner, normal)

"""The BMW X6 M Competition (G06, 2023), modelled from the-blueprints.com's
side, top, front and rear drawings.

Built as a car modeller builds one (the method of Enpix's "Best Way To
Model A Car In Blender"): the panels' outlines traced off the blueprints,
each filled with an even grid of quads, the panels joined along the edges
they share, one half built and mirrored, subdivided for smoothness. Here
the tracing is numbers — every line below was measured off the drawings —
and the filling is done by the grid code in carbody.py.

Design space is the drawings': millimetres, X from the front of the car
back, Y out from the centreline on the car's right, Z up from the ground.

The body's topology, one half:

  - 58 columns along the car, 0 at the front corner, 58 at the rear. Each
    is a station the body's cross-section is taken at; the design's
    edges — the windscreen's base and top, the doors, the pillars, the
    rear window — each fall on a column (COLUMNS).
  - 26 rows round each section, from the bottom edge (0) up the side to
    the shoulder crease (9) and the beltline (12), up the side glass to
    its top (16), across the roof rail to the roof panel (18) and over
    it to the centreline (26). Each row is a line along the car — the
    crease, the beltline, the window line all run along one.
  - Round each wheel arch the rows below the crease give way to three
    rows running round the arch — concentric, as a car's edge loops are
    — and the columns above it fan down to meet them (arch()).
  - The front and rear faces are patches filling the first and last
    column's outline, their rows the side's continued across the car.
"""
import math

from lib import carbody as cb

# ---------------------------------------------------------------------
# Dimensions (mm), from the drawings: 4960 long, 2004 wide, 1700 high
# ---------------------------------------------------------------------

LENGTH = 4960.0
FRONT_AXLE, REAR_AXLE = 890.0, 3865.0          # 2975 wheelbase
WHEEL_RADIUS = 372.0                            # 295/35 R21, 315/30 R22
TRACK_HALF = 842.0                              # 1684 track

# How finely the body is divided: its quads about 40 mm a side. The layout
# below is in units of 80 mm; each is D quads.
D = 2

# The body's origin, as the app drives it (Car.js): at ride height, midway
# between the axles.
RIDE_HEIGHT = 450.0
MID = (FRONT_AXLE + REAR_AXLE) / 2


def to_blender(p):
    """Design mm (X back, Y right, Z up from the ground) -> Blender metres,
    Z up, -Y forward."""
    X, Y, Z = p
    return (Y / 1000.0, (X - MID) / 1000.0, (Z - RIDE_HEIGHT) / 1000.0)


def from_blender(v):
    return ((v[1] * 1000.0) + MID, v[0] * 1000.0, v[2] * 1000.0 + RIDE_HEIGHT)


# The rows round a section at which a line along the car runs.
ROW_CREASE, ROW_BELT, ROW_UPPER, ROW_PANEL, ROW_TOP = 9 * D, 12 * D, 16 * D, 18 * D, 26 * D
KEY_ROWS = (0, ROW_CREASE, ROW_BELT, ROW_UPPER, ROW_PANEL, ROW_TOP)
# How many rows run round a wheel arch.
RING = 2 * D
# The arch's own lip, and the columns its box spans.
FRONT_ARCH = dict(centre=(FRONT_AXLE, 372.0), rx=455.0, rz=460.0, cols=(0, 16 * D))
REAR_ARCH = dict(centre=(REAR_AXLE, 372.0), rx=450.0, rz=440.0, cols=(38 * D, 54 * D))

N_COLS = 58 * D
# Column (in 80 mm units) -> X at the beltline, through the design's edges:
# 15 the windscreen's base, 16 the front door's leading edge, 17 the side
# glass's front, 22 the windscreen's top, 29/31 the B-pillar, 38 the rear
# arch's box, 45 the quarter glass's tip, 46 the rear window's top, 54 the
# rear arch's box, 56 the rear window's foot.
COLUMNS = [(i * D, x) for i, x in [
    (0, 190), (15, 1440), (16, 1500), (17, 1575), (22, 2000), (29, 2580), (31, 2760),
    (38, 3265), (40, 3420), (41, 3490), (45, 3850), (46, 3930), (54, 4460), (56, 4630), (58, 4800)]]

# The centreline's height, over the car: the silhouette's top in the
# side view (the roof spoiler above the rear window left out).
PROFILE = [(110, 1005), (200, 1043), (300, 1074), (400, 1098), (500, 1121), (600, 1134), (700, 1146),
           (800, 1165), (900, 1177), (1000, 1189), (1100, 1200), (1200, 1207), (1300, 1215), (1400, 1222),
           (1440, 1232), (1500, 1276), (1600, 1347), (1700, 1401), (1800, 1450), (1900, 1510), (2000, 1558),
           (2100, 1606), (2200, 1643), (2300, 1664), (2400, 1682), (2500, 1692), (2600, 1698), (2700, 1703),
           (2800, 1705), (2900, 1704), (3000, 1699), (3100, 1693), (3200, 1686), (3300, 1675), (3400, 1662),
           (3500, 1648), (3600, 1633), (3700, 1617), (3800, 1600), (3900, 1582), (3930, 1572), (4000, 1542),
           (4100, 1511), (4200, 1480), (4300, 1450), (4400, 1414), (4500, 1383), (4600, 1350), (4630, 1342),
           (4700, 1322), (4800, 1313), (4885, 1310)]

# The section's lines along the car, (Y, Z) at each X:
#   E  the bottom edge — the sill's underside, the bumpers'
#   S  the sill's top
#   M  the body at its widest
#   K  the shoulder crease (row 9) — over the arches, the top of their box
#   B  the beltline (row 12): the side glass's foot; forward, the wing's
#      shoulder to the headlamp's top corner; back, the shoulder over the
#      tail lamps
#   U  the side glass's top (row 16) — the A-pillar's outer edge, the roof
#      rail, the quarter glass's tip; forward, a line over the bonnet;
#      back, the rear window's frame
#   P  the roof panel's edge (row 18) — the windscreen's and the rear
#      window's side edge, the bonnet's, the tailgate's
SECTION = [
    # X      E           S           M            K            B            U            P
    (190,  (740, 300), (775, 345), (838, 620),  (832, 822),  (800, 1000), (560, 1004), (400, 1005)),
    (400,  (880, 292), (905, 335), (952, 700),  (945, 900),  (905, 1050), (650, 1080), (480, 1092)),
    (890,  (930, 290), (950, 332), (993, 770),  (985, 975),  (915, 1095), (690, 1152), (505, 1168)),
    (1300, (935, 262), (955, 322), (988, 760),  (980, 995),  (900, 1142), (740, 1200), (600, 1212)),
    (1440, (935, 262), (955, 322), (986, 760),  (978, 1000), (886, 1163), (790, 1230), (705, 1238)),
    (1600, (935, 262), (955, 322), (982, 760),  (975, 1003), (878, 1175), (768, 1310), (700, 1326)),
    (1800, (935, 262), (955, 322), (980, 760),  (973, 1006), (873, 1180), (744, 1428), (680, 1446)),
    (2000, (935, 262), (955, 322), (980, 760),  (972, 1010), (870, 1186), (722, 1528), (660, 1548)),
    (2200, (935, 262), (955, 322), (980, 760),  (972, 1013), (870, 1192), (702, 1602), (644, 1626)),
    (2400, (935, 262), (955, 322), (980, 762),  (972, 1016), (870, 1200), (692, 1628), (632, 1654)),
    (2800, (935, 262), (955, 322), (980, 764),  (972, 1022), (870, 1216), (684, 1636), (624, 1664)),
    (3200, (936, 262), (956, 322), (984, 768),  (976, 1028), (872, 1235), (682, 1626), (622, 1656)),
    (3265, (937, 262), (957, 322), (985, 770),  (978, 1030), (873, 1238), (684, 1620), (622, 1652)),
    (3500, (940, 275), (960, 325), (999, 785),  (990, 1005), (880, 1250), (690, 1588), (625, 1626)),
    (3700, (945, 285), (962, 330), (1011, 800), (1000, 990), (895, 1260), (730, 1468), (612, 1596)),
    (3865, (945, 290), (962, 332), (1011, 800), (1000, 985), (905, 1265), (760, 1392), (600, 1558)),
    (4000, (942, 295), (960, 335), (1011, 805), (1000, 990), (915, 1263), (625, 1528), (505, 1540)),
    (4300, (930, 310), (948, 350), (980, 815),  (972, 1002), (925, 1258), (615, 1450), (495, 1452)),
    (4460, (920, 320), (935, 360), (955, 820),  (945, 1010), (905, 1252), (608, 1405), (490, 1406)),
    (4640, (870, 325), (888, 366), (905, 815),  (897, 1040), (860, 1245), (600, 1345), (478, 1343)),
    (4800, (760, 330), (775, 372), (798, 800),  (790, 1060), (760, 1235), (540, 1300), (400, 1305)),
]

# The front: its profile at the centreline (X at each Z), and its foot in
# plan (X at each Y).
NOSE = [(290, 52), (330, 26), (400, 8), (500, 0), (650, 0), (750, 5), (850, 16), (930, 36), (980, 70), (1005, 110)]
FRONT_FOOT = [(0, 52), (300, 64), (500, 92), (650, 132), (740, 190)]
# The back: its profile, and its foot.
TAIL = [(330, 4905), (400, 4932), (500, 4950), (650, 4960), (900, 4960), (1000, 4955), (1100, 4945),
        (1200, 4930), (1260, 4908), (1310, 4885)]
REAR_FOOT = [(0, 4905), (300, 4900), (500, 4885), (650, 4852), (760, 4800)]


# ---------------------------------------------------------------------
# Details drawn on the body: outlines in the view they are drawn in —
# front and rear (Y out from the centre, Z up), side (X back, Z up).
# The faces inside an outline become its part; the region's edge is then
# drawn onto the outline (Body.mark_features).
# ---------------------------------------------------------------------

FEATURES = [
    # The kidney grille, one each side of the centre bar.
    dict(part="kidney", view="front", outline=[
        (32, 928), (120, 937), (300, 937), (378, 912), (416, 858), (418, 752), (394, 698),
        (336, 670), (200, 666), (48, 668), (32, 700)]),
    # The headlamp: slim, pointed inboard, wrapping round the corner.
    dict(part="headlamp", view="front", outline=[
        (492, 906), (540, 946), (700, 958), (866, 966), (910, 940), (906, 872), (780, 852),
        (620, 842), (530, 858)]),
    dict(part="headlamp", view="side", outline=[
        (30, 990), (140, 996), (300, 1000), (392, 996), (330, 972), (200, 918), (90, 888), (30, 880)]),
    # The outer air intakes, their inner edge raked.
    dict(part="intake", view="front", outline=[
        (560, 722), (760, 736), (900, 744), (912, 600), (908, 408), (760, 396), (646, 392),
        (600, 560)]),
    # The lower grille, across the centre.
    dict(part="intake", view="front", outline=[
        (0, 562), (300, 566), (446, 560), (486, 470), (474, 326), (300, 316), (0, 314)]),
    # The M gill behind the front arch.
    dict(part="gill", view="side", outline=[
        (1262, 812), (1330, 812), (1530, 612), (1470, 604)]),
    # The tail lamps, thin inboard, tall at the corner, wrapping round it.
    dict(part="taillamp", view="rear", outline=[
        (206, 1082), (206, 1124), (420, 1132), (640, 1134), (720, 1172), (800, 1200), (872, 1194),
        (898, 1150), (886, 1058), (720, 1054), (640, 1074), (420, 1078)]),
    dict(part="taillamp", view="side", outline=[
        (4560, 1148), (4660, 1186), (4800, 1198), (4960, 1194), (4960, 1052), (4800, 1050), (4660, 1076)]),
    # The rear bumper's reflectors, upright at its corners.
    dict(part="reflector", view="rear", outline=[(826, 736), (872, 760), (886, 930), (846, 920), (826, 860)]),
]


def dome(X, y):
    """The bonnet's power domes: a ridge each side of the centre, from above
    the kidneys back to the windscreen, splaying out as it goes — mm to add
    to the bonnet's height."""
    if X < 250 or X > 1450:
        return 0.0
    ridge = 330 + (590 - 330) * (X - 250) / 1200
    rise = smoothstep((X - 250) / 300) * (1 - smoothstep((X - 1250) / 200))
    return 8.0 * rise * math.exp(-((y - ridge) / 70.0) ** 2)


# The details cut into the body — openings with depth. The rest are parts
# of their own, laid on it (details.py).
CUT = {"kidney", "intake"}


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


class Body:
    """The body's surface, and its mesh."""

    def __init__(self):
        self.col_x = cb.smooth1d(COLUMNS)
        xs = [row[0] for row in SECTION]
        self.lines = []
        for k in range(7):
            self.lines.append((cb.smooth1d([(x, row[k + 1][0]) for x, row in zip(xs, SECTION)]),
                               cb.smooth1d([(x, row[k + 1][1]) for x, row in zip(xs, SECTION)])))
        self.profile = cb.smooth1d(PROFILE)
        self.nose = cb.smooth1d(NOSE)
        self.front_foot = cb.smooth1d(FRONT_FOOT)
        self.tail = cb.smooth1d(TAIL)
        self.rear_foot = cb.smooth1d(REAR_FOOT)
        self._sections = {}
        # (arch's first column, patch name) -> its points, grid[j][i]
        self.arch_patches = {}

    # -----------------------------------------------------------------
    # The surface: a point for any station X and row u
    # -----------------------------------------------------------------

    def section(self, X):
        """The cross-section at X: a smooth curve from the bottom edge to the
        centreline through the lines along the car, and the length along it
        at which each key row falls."""
        key = round(X, 2)
        got = self._sections.get(key)
        if got:
            return got
        E, S, M, K, B, U, P = [(fy(X), fz(X)) for fy, fz in self.lines]
        C = (0.0, self.profile(X))
        samples = 24
        poly = cb.catmull([E, S, M, K, B, U, P, C], samples=samples,
                          start=(E[0] - 40, E[1] - 60), end=(-P[0], P[1]))
        acc = cb.lengths(poly)
        # E, K, B, U, P, C are control points 0, 3, 4, 5, 6, 7.
        marks = [acc[k * samples] for k in (0, 3, 4, 5, 6, 7)]
        got = (poly, acc, marks)
        self._sections[key] = got
        return got

    def point(self, X, u):
        """The surface at station X, row u (fractional rows allowed)."""
        poly, acc, marks = self.section(X)
        u = max(0.0, min(float(ROW_TOP), u))
        for a, b, sa, sb in zip(KEY_ROWS, KEY_ROWS[1:], marks, marks[1:]):
            if u <= b:
                y, z = cb.at_length(poly, acc, sa + (sb - sa) * (u - a) / (b - a))
                break
        else:
            y, z = poly[-1]
        if u > ROW_BELT:
            z += dome(X, y)
        return (X, y, z)

    def row_at_height(self, X, Z):
        """The row, below the crease, at height Z on station X."""
        lo, hi = 0.0, float(ROW_CREASE)
        for _ in range(40):
            mid = (lo + hi) / 2
            if self.point(X, mid)[2] < Z:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def column_x(self, i, u):
        """Where column i crosses row u: straight across the car, except at
        the ends, where the front column curves forward to the bonnet's
        leading edge at the centre and the rear one back to the tailgate's
        lip, and the columns next to them follow a little."""
        x = self.col_x(i)
        if u > ROW_BELT:
            f = smoothstep((u - ROW_BELT) / (ROW_TOP - ROW_BELT))
            if i < 4 * D:
                x -= 80 * f * (1 - i / (4 * D)) ** 2
            if i > N_COLS - 4 * D:
                x += 85 * f * (1 - (N_COLS - i) / (4 * D)) ** 2
        return x

    # -----------------------------------------------------------------
    # The mesh
    # -----------------------------------------------------------------

    def build(self, builder, part_of):
        """Every face of the body's half into `builder`; `part_of(region, i, j)`
        names each face's part (paint, glass, ...)."""
        self.build_side(builder, part_of)
        self.build_bands(builder, part_of)
        self.build_front(builder, part_of)
        self.build_rear(builder, part_of)
        self.mark_features(builder)

    # -----------------------------------------------------------------
    # Details drawn onto the surface
    # -----------------------------------------------------------------

    def seams(self):
        """The panels' shut lines, each a chain of the body's vertices (design
        mm), along the grid: the front door's leading edge, the B-pillar's,
        the rear door's trailing edge down round the rear arch to its lip,
        the doors' bottom edge, and the bonnet's edge — along its front, and
        back along the wings to the windscreen's corner."""
        at = lambda c, u: self.point(self.column_x(c, u), u)
        door_front, b_pillar = 16 * D, 30 * D
        rear_arch = REAR_ARCH["cols"][0]
        rear_door = rear_arch + D
        top = self.arch_patches[(rear_arch, "arch_top")]
        # the rear door's edge: down the shoulder, then the arch's radial line to its lip
        rear = [at(rear_door, u) for u in range(ROW_BELT, ROW_CREASE - 1, -1)]
        rear += [top[j][rear_door - rear_arch] for j in range(RING - 1, -1, -1)]
        bonnet_row = ROW_BELT + D
        bonnet = [at(0, u) for u in range(ROW_TOP, bonnet_row - 1, -1)]
        bonnet += [at(c, bonnet_row) for c in range(1, 15 * D + 1)]
        bonnet += [at(15 * D, u) for u in range(bonnet_row + 1, ROW_PANEL + 1)]
        return [
            [at(door_front, u) for u in range(D, ROW_BELT + 1)],
            [at(b_pillar, u) for u in range(D, ROW_BELT + 1)],
            rear,
            [at(c, D) for c in range(door_front, rear_arch + 1)],
            bonnet,
        ]

    VIEWS = {
        "front": (1, 2),   # (Y, Z)
        "rear": (1, 2),
        "side": (0, 2),    # (X, Z)
    }

    def mark_features(self, builder):
        """Each detail's outline drawn onto the body: the painted faces whose
        middle is inside it, as its part — then the edge of that patch of
        faces moved onto the outline itself, each vertex along the surface,
        so the detail's edge is the outline and not the grid's steps."""
        verts, faces = builder.verts, builder.faces
        centre = (2480.0, 0.0, 700.0)

        def face_normal(f):
            # Newell's method, turned to face out from the car's middle
            n = [0.0, 0.0, 0.0]
            pts = [verts[k] for k in f]
            for a, b in zip(pts, pts[1:] + pts[:1]):
                n[0] += (a[1] - b[1]) * (a[2] + b[2])
                n[1] += (a[2] - b[2]) * (a[0] + b[0])
                n[2] += (a[0] - b[0]) * (a[1] + b[1])
            length = math.sqrt(sum(c * c for c in n)) or 1.0
            n = [c / length for c in n]
            mid = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
            if sum(n[k] * (mid[k] - centre[k]) for k in range(3)) < 0:
                n = [-c for c in n]
            return n, mid

        def view_of(n):
            front, rear, side = -n[0], n[0], n[1]
            best = max(front, rear, side)
            return "front" if best == front else "rear" if best == rear else "side"

        info = [face_normal(f) for f in faces]
        vnormal = [[0.0, 0.0, 0.0] for _ in verts]
        for f, (n, _) in zip(faces, info):
            for k in f:
                for c in range(3):
                    vnormal[k][c] += n[c]
        for k, n in enumerate(vnormal):
            length = math.sqrt(sum(c * c for c in n)) or 1.0
            vnormal[k] = [c / length for c in n]

        outlines = []
        for feature in FEATURES:
            if feature["part"] not in CUT:
                continue
            poly = cb.catmull(feature["outline"] + feature["outline"][:1], samples=8,
                              start=feature["outline"][-1], end=feature["outline"][1])
            outlines.append((feature["part"], feature["view"], poly))

        # The faces inside each outline.
        for fi, (n, mid) in enumerate(info):
            if builder.parts[fi] != "paint":
                continue
            view = view_of(n)
            for part, fview, poly in outlines:
                if fview != view:
                    continue
                if view == "front" and mid[0] > 900 or view == "rear" and mid[0] < 4000:
                    continue
                a, b = self.VIEWS[view]
                if inside(poly, (mid[a], mid[b])):
                    builder.parts[fi] = part
                    break

        # Each detail's edge onto its outline.
        by_vertex = {}
        for fi, f in enumerate(faces):
            for k in f:
                by_vertex.setdefault(k, set()).add(builder.parts[fi])
        moved = 0
        for k, parts in by_vertex.items():
            detail = [p for p in parts if p in {o[0] for o in outlines}]
            if len(parts) < 2 or len(detail) != 1:
                continue
            part = detail[0]
            view = view_of(vnormal[k])
            candidates = [poly for p, v, poly in outlines if p == part and v == view]
            if not candidates:
                continue
            a, b = self.VIEWS[view]
            p = verts[k]
            here = (p[a], p[b])
            target = min((nearest(poly, here) for poly in candidates), key=lambda t: cb.dist(t, here))
            if cb.dist(target, here) > 90:
                continue
            on_centre = abs(p[1]) < 1e-6
            if on_centre and a == 1:
                target = (0.0, target[1])
            new = slide(p, vnormal[k], (a, b), target, keep_y=on_centre)
            if new:
                verts[k] = new
                moved += 1
        return moved



    def build_bands(self, builder, part_of):
        """The body above the crease, the whole length of the car: the
        shoulder, the glasshouse, the roof, the bonnet and the tailgate —
        one grid of columns by rows."""
        grid = []
        for u in range(ROW_CREASE, ROW_TOP + 1):
            grid.append([self.point(self.column_x(i, u), u) for i in range(N_COLS + 1)])
        builder.grid(grid, tag=lambda i, j: part_of("band", i, j + ROW_CREASE))

    def build_side(self, builder, part_of):
        """The body below the crease: round the wheel arches, and between."""
        self.arch(builder, part_of, FRONT_ARCH)
        self.arch(builder, part_of, REAR_ARCH)
        for i0, i1 in ((FRONT_ARCH["cols"][1], REAR_ARCH["cols"][0]), (REAR_ARCH["cols"][1], N_COLS)):
            grid = [[self.point(self.col_x(i), u) for i in range(i0, i1 + 1)] for u in range(ROW_CREASE + 1)]
            builder.grid(grid, tag=lambda i, j, i0=i0: part_of("side", i + i0, j))

    def arch_lip(self, arch):
        """The arch's lip, from where it meets the bottom edge in front of
        the wheel, over the wheel, to where it meets it behind: points in
        the side view (X, Z)."""
        (cx, cz), rx, rz = arch["centre"], arch["rx"], arch["rz"]
        at = lambda t: (cx + rx * math.cos(t), cz + rz * math.sin(t))

        def meets(t0, t1):
            # where the lip reaches the bottom edge, between angles t0 (below it) and t1
            for _ in range(50):
                mid = (t0 + t1) / 2
                x, z = at(mid)
                if z < self.point(x, 0)[2]:
                    t0 = mid
                else:
                    t1 = mid
            return (t0 + t1) / 2

        front = meets(math.radians(250), math.radians(180))
        rear = meets(math.radians(-70), 0.0)
        return [at(front + (rear - front) * k / 400) for k in range(401)]

    def arch(self, builder, part_of, arch):
        """A wheel arch: three rows running round its lip, and the columns
        above and the rows either side meeting them.

        Its box is the columns i0..i1 up to the crease. The lip is split in
        three — the front part rising to meet the box's front side, the top
        meeting the crease above, the rear part meeting the box's rear side
        — and each part and the side of the box it faces bound a patch."""
        i0, i1 = arch["cols"]
        n_side, n_top = ROW_CREASE, i1 - i0
        # Rows are about 85 / D mm apart; work in (X, that u) so the patches are even.
        scale = 85.0 / D
        lip = self.arch_lip(arch)
        dense = [(x, self.row_at_height(x, z) * scale) for x, z in lip[::4]] + \
                [(lip[-1][0], self.row_at_height(*lip[-1]) * scale)]
        # even along the lip in the side view
        side_lengths = cb.lengths([(x, z) for x, z in lip[::4]] + [lip[-1]])
        total = side_lengths[-1]
        n = n_side + n_top + n_side
        arc = []
        for k in range(n + 1):
            s = total * k / n
            idx = min(len(side_lengths) - 2, max(0, next(q for q in range(len(side_lengths)) if side_lengths[q] >= s) - 1))
            seg = side_lengths[idx + 1] - side_lengths[idx]
            t = (s - side_lengths[idx]) / seg if seg else 0
            arc.append(cb.lerp(dense[idx], dense[idx + 1], t))
        arc[0] = (arc[0][0], 0.0)
        arc[-1] = (arc[-1][0], 0.0)
        x0, x1 = self.col_x(i0), self.col_x(i1)
        top = ROW_CREASE * scale
        box_front = [(x0, u * scale) for u in range(n_side + 1)]
        box_top = [(self.col_x(i), top) for i in range(i0, i1 + 1)]
        box_rear = [(x1, u * scale) for u in range(n_side, -1, -1)]
        a, b = arc[n_side], arc[n_side + n_top]
        patches = [
            ("arch_front", arc[:n_side + 1], box_front, cb.line(arc[0], box_front[0], RING), cb.line(a, box_front[-1], RING)),
            ("arch_top", arc[n_side:n_side + n_top + 1], box_top, cb.line(a, box_top[0], RING), cb.line(b, box_top[-1], RING)),
            ("arch_rear", arc[n_side + n_top:], box_rear, cb.line(b, box_rear[0], RING), cb.line(arc[-1], box_rear[-1], RING)),
        ]
        for name, bottom, far, left, right in patches:
            grid = cb.coons(bottom, far, left, right)
            pts = [[self.point(x, w / scale) for x, w in row] for row in grid]
            self.arch_patches[(i0, name)] = pts
            builder.grid(pts, tag=lambda i, j, name=name: part_of(name, i, j))

    def build_front(self, builder, part_of):
        """The front: a patch filling the first column's outline, down to
        the bumper's foot and across to the centreline. Its rows carry the
        side's across the car, its columns the bonnet's rows down it."""
        right = [self.point(self.column_x(0, u), u) for u in range(ROW_BELT + 1)]
        top = [self.point(self.column_x(0, u), u) for u in range(ROW_TOP, ROW_BELT - 1, -1)]
        n, m = len(top) - 1, len(right) - 1
        # The centreline, its rows as high as the side's.
        z0, z1 = 290.0, top[0][2]
        zr0, zr1 = right[0][2], right[-1][2]
        left = []
        for j in range(m + 1):
            z = z0 + (right[j][2] - zr0) / (zr1 - zr0) * (z1 - z0)
            left.append((self.nose(z), 0.0, z))
        left[-1] = top[0]
        # The foot, its columns as far out as the bonnet's rows.
        y_end = right[0][1]
        bottom = []
        for i in range(n + 1):
            y = top[i][1] / top[-1][1] * y_end
            bottom.append((self.front_foot(y), y, z0 + (right[0][2] - z0) * (y / y_end) ** 2))
        bottom[0] = left[0]
        bottom[-1] = right[0]
        grid = cb.coons(bottom, top, left, right)
        builder.grid(grid, tag=lambda i, j: part_of("front", i, j))

    def build_rear(self, builder, part_of):
        """The back: as the front, filling the last column's outline."""
        right = [self.point(self.column_x(N_COLS, u), u) for u in range(ROW_BELT + 1)]
        top = [self.point(self.column_x(N_COLS, u), u) for u in range(ROW_TOP, ROW_BELT - 1, -1)]
        n, m = len(top) - 1, len(right) - 1
        z0, z1 = 330.0, top[0][2]
        zr0, zr1 = right[0][2], right[-1][2]
        left = []
        for j in range(m + 1):
            z = z0 + (right[j][2] - zr0) / (zr1 - zr0) * (z1 - z0)
            left.append((self.tail(z), 0.0, z))
        left[-1] = top[0]
        y_end = right[0][1]
        bottom = []
        for i in range(n + 1):
            y = top[i][1] / top[-1][1] * y_end
            bottom.append((self.rear_foot(y), y, z0 + (right[0][2] - z0) * (y / y_end) ** 2))
        bottom[0] = left[0]
        bottom[-1] = right[0]
        grid = cb.coons(bottom, top, left, right)
        builder.grid(grid, tag=lambda i, j: part_of("rear", i, j))

def inside(poly, pt):
    """Whether a 2D point is inside a closed polygon (even-odd rule)."""
    x, y = pt
    hit = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def nearest(poly, pt):
    """The nearest point to pt on a closed polygon's edge."""
    best, best_d = None, float("inf")
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ab = (b[0] - a[0], b[1] - a[1])
        ll = ab[0] ** 2 + ab[1] ** 2
        t = 0.0 if ll == 0 else max(0.0, min(1.0, ((pt[0] - a[0]) * ab[0] + (pt[1] - a[1]) * ab[1]) / ll))
        q = (a[0] + ab[0] * t, a[1] + ab[1] * t)
        d = cb.dist(q, pt)
        if d < best_d:
            best, best_d = q, d
    return best


def slide(p, n, axes, target, keep_y=False):
    """Move p within the surface's tangent plane (normal n) until its
    projection onto the view's axes is target; None when the surface is
    edge-on to the view. On the centreline, stay on it."""
    # a tangent basis
    ref = (0.0, 0.0, 1.0) if abs(n[2]) < 0.9 else (1.0, 0.0, 0.0)
    e1 = (n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0])
    l1 = math.sqrt(sum(c * c for c in e1))
    e1 = tuple(c / l1 for c in e1)
    e2 = (n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0])
    if keep_y:
        # slide only in the centre plane
        e1 = (e1[0], 0.0, e1[2])
        e2 = (e2[0], 0.0, e2[2])
    a, b = axes
    m11, m12, m21, m22 = e1[a], e2[a], e1[b], e2[b]
    det = m11 * m22 - m12 * m21
    if abs(det) < 0.25:
        return None
    ra, rb = target[0] - p[a], target[1] - p[b]
    s = (ra * m22 - rb * m12) / det
    t = (m11 * rb - m21 * ra) / det
    q = tuple(p[c] + s * e1[c] + t * e2[c] for c in range(3))
    if keep_y:
        q = (q[0], 0.0, q[2])
    return q

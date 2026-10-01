"""The BMW X6 M (F86, 2016), modelled from Ddiaz Design's model of it
(x6_reference.py): its lines measured off that model into the tables here,
and the body's cage then fitted to its surface (fit.py).

Built as a car modeller builds one (the method of Enpix's "Best Way To
Model A Car In Blender"): the panels' outlines traced, each filled with an
even grid of quads, the panels joined along the edges they share, one half
built and mirrored — then, as in retopology, the cage shrunk onto the
reference so every vertex sits on its surface while the rows and columns
keep following the car's lines. Here the tracing is numbers — every line
below was measured off the reference — and the filling is done by the grid
code in carbody.py.

Design space is millimetres, X from the front of the car back, Y out from
the centreline (+ the car's left), Z up from the ground.

The body's topology, one half:

  - 58 columns along the car, 0 at the front corner, 58 at the tail. Each
    is a station the body's cross-section is taken at; the doors' shut
    lines and the B-pillar fall on columns (COLUMNS).
  - 26 rows round each section: from the bottom edge (0) up the sill to
    the doors' lower crease (3), the shoulder crease (9), the beltline
    (11), the glasshouse's upper edge (16), the roof panel's edge — the
    windscreen's and rear window's side edge (18) — and over the roof to
    the centreline (26). Each row is a line along the car.
  - Round each wheel arch the rows below the shoulder give way to rows
    running round the arch, concentric, as a car's edge loops are.
  - The front and the tail are patches filling the end columns' outlines,
    their rows the side's continued across the car.
  - The glass, the grilles, the intakes, the diffuser are outlines drawn
    onto that surface afterwards (FEATURES): the faces inside one become
    its part, its edge moved onto the outline.
"""
import math

from lib import carbody as cb

# ---------------------------------------------------------------------
# Dimensions (mm): 4908 long, 1989 wide, 1715 high
# ---------------------------------------------------------------------

LENGTH = 4908.0
FRONT_AXLE, REAR_AXLE = 901.0, 3829.5           # 2928.5 wheelbase
WHEEL_RADIUS = 379.0                            # 285/35 R21, 325/30 R21
TRACK_FRONT, TRACK_REAR = 821.0, 835.0          # half-tracks: 1642, 1670

# How finely the body is divided: its quads about 40 mm a side. The layout
# below is in units of 80 mm; each is D quads.
D = 2

# The body's origin, as the app drives it (Car.js): at ride height, midway
# between the axles.
RIDE_HEIGHT = 450.0
MID = (FRONT_AXLE + REAR_AXLE) / 2


def to_blender(p):
    """Design mm (X back, Y left, Z up from the ground) -> Blender metres,
    Z up, -Y forward."""
    X, Y, Z = p
    return (Y / 1000.0, (X - MID) / 1000.0, (Z - RIDE_HEIGHT) / 1000.0)


def from_blender(v):
    return ((v[1] * 1000.0) + MID, v[0] * 1000.0, v[2] * 1000.0 + RIDE_HEIGHT)


# The rows round a section at which a line along the car runs.
ROW_LOW, ROW_CREASE, ROW_BELT, ROW_UPPER, ROW_PANEL, ROW_TOP = 3 * D, 9 * D, 11 * D, 16 * D, 18 * D, 26 * D
KEY_ROWS = (0, ROW_LOW, ROW_CREASE, ROW_BELT, ROW_UPPER, ROW_PANEL, ROW_TOP)
# How many rows run round a wheel arch.
RING = 2 * D
# Each arch's opening (its lip, where the panel turns in), and the columns
# its box spans.
FRONT_ARCH = dict(centre=(FRONT_AXLE, 379.0), rx=450.0, rz=464.0, cols=(0, 16 * D))
REAR_ARCH = dict(centre=(REAR_AXLE, 379.0), rx=448.0, rz=457.0, cols=(38 * D, 54 * D))

N_COLS = 58 * D
# Column (in 80 mm units) -> X at the side: 15 the bonnet's back corner, 16
# the front door's leading edge, 17 the side glass's front, 29 the front
# door's trailing edge (the B-pillar), 31 the rear door's leading edge, 38
# the rear arch's box, 42 the rear door's trailing edge, 54 the rear arch's
# box, 58 the tail's corner.
COLUMNS = [(i * D, x) for i, x in [
    (0, 250), (15, 1450), (16, 1515), (17, 1593), (29, 2665), (31, 2785), (38, 3250), (42, 3590),
    (54, 4430), (58, 4760)]]

# The shoulder crease's fold, degrees: how much further in the shoulder
# above it turns than the side below. (The fit takes the rest of the form
# from the reference.)
SHOULDER = 12.0
# The bonnet's leading edge: 140 mm further forward at the centre than at
# the front column's top.
FRONT_CURL = 140.0
# The tailgate's lower edge at the centreline: where it overhangs the bumper.
TAILGATE_EDGE = 830.0
# The tailgate's lip, in plan: straight across at the middle, curving
# forward to the corners — X at the centreline, and the power of the curve.
LIP_X, LIP_POWER = 4830.0, 2.6

# The centreline's height, over the car: the silhouette's top in the side
# view (the tailgate's spoiler left out).
PROFILE = [(60, 953), (110, 980), (200, 1016), (300, 1046), (400, 1072), (500, 1095), (600, 1118), (700, 1135),
           (800, 1151), (900, 1167), (1000, 1181), (1100, 1192), (1200, 1202), (1300, 1205), (1400, 1229),
           (1500, 1290), (1600, 1349), (1700, 1408), (1800, 1465), (1900, 1520), (2000, 1573), (2100, 1625),
           (2200, 1657), (2300, 1680), (2400, 1696), (2500, 1705), (2600, 1712), (2700, 1715), (2800, 1716),
           (2900, 1715), (3000, 1711), (3100, 1704), (3200, 1695), (3300, 1685), (3400, 1672), (3500, 1656),
           (3600, 1640), (3700, 1621), (3800, 1598), (3900, 1571), (4000, 1542), (4100, 1508), (4200, 1473),
           (4300, 1437), (4400, 1398), (4500, 1363), (4600, 1323), (4700, 1301), (4800, 1291), (4830, 1288)]

# The section's lines along the car, (Y, Z) at each X — each a point of the
# reference's surface; None where the station crosses a wheel's opening
# (the line is carried across from the stations either side):
#   E  the bottom edge — the sill's underside, the aprons'
#   S  the sill's top, where the side skirt turns up
#   L  the doors' lower crease, where the side kicks out over the sill
#   M  the body at its widest
#   K  the shoulder crease (row 9): through the door handles, from the
#      headlamps back to the tail lamps
#   B  the beltline (row 11): the side glass's foot; forward, the wing's
#      shoulder along the bonnet's edge; back, the shoulder over the lamps
#   U  the glasshouse's upper edge (row 16): the A-pillar's, the roof's
#      edge over the side glass, the C-pillar's; forward and back, a line
#      across the bonnet and the tailgate
#   P  the roof panel's edge (row 18): the windscreen's and the rear
#      window's side edge; forward and back, a line nearer the centre
SECTION = [
    # X      E           S           L           M           K           B           U           P
    (110,  None,       None,       None,       None,       None,       (430, 933), (300, 966), (160, 977)),
    (250,  (700, 256), (742, 390), (803, 558), (816, 610), (677, 900), (547, 985), (405, 1008), (273, 1020)),
    (400,  (810, 246), (918, 390), (940, 556), (940, 590), (831, 937), (712, 1010), (527, 1049), (356, 1063)),
    (600,  None,       None,       None,       (966, 742), (888, 962), (805, 1045), (596, 1095), (403, 1110)),
    (901,  None,       None,       None,       (976, 838), (913, 976), (826, 1093), (630, 1145), (430, 1157)),
    (1200, None,       None,       None,       (971, 800), (925, 986), (834, 1130), (690, 1179), (500, 1188)),
    (1450, (865, 262), (922, 390), (936, 546), (942, 780), (931, 994), (846, 1155), (790, 1195), (690, 1172)),
    (1515, (867, 270), (913, 390), (927, 544), (934, 780), (935, 995), (850, 1158), (805, 1185), (760, 1195)),
    (1600, (868, 270), (911, 390), (929, 537), (946, 782), (938, 998), (854, 1147), (810, 1225), (771, 1242)),
    (1800, (868, 270), (911, 390), (936, 520), (952, 798), (942, 1014), (867, 1131), (786, 1327), (720, 1383)),
    (2000, (883, 278), (914, 390), (943, 515), (957, 822), (944, 1030), (868, 1146), (729, 1454), (663, 1506)),
    (2200, (880, 278), (914, 390), (947, 522), (960, 846), (946, 1044), (869, 1160), (675, 1555), (615, 1610)),
    (2400, (876, 278), (916, 390), (950, 529), (962, 862), (946, 1057), (865, 1175), (645, 1604), (613, 1644)),
    (2700, (889, 286), (916, 390), (952, 542), (964, 886), (943, 1078), (863, 1196), (638, 1619), (612, 1656)),
    (3000, (884, 286), (918, 390), (952, 557), (964, 894), (937, 1094), (853, 1218), (645, 1608), (609, 1651)),
    (3250, (879, 278), (945, 390), (966, 570), (970, 846), (929, 1107), (840, 1233), (656, 1582), (606, 1634)),
    (3500, None,       None,       None,       (992, 758), (940, 1106), (823, 1248), (676, 1536), (603, 1602)),
    (3830, None,       None,       None,       (993, 830), (925, 1103), (806, 1264), (705, 1440), (602, 1522)),
    (4100, None,       None,       None,       (985, 774), (899, 1126), (804, 1252), (700, 1370), (612, 1439)),
    (4300, (878, 318), (914, 390), (949, 575), (957, 686), (872, 1142), (805, 1233), (700, 1319), (613, 1370)),
    (4430, (845, 334), (880, 390), (915, 574), (920, 710), (844, 1144), (800, 1217), (690, 1294), (590, 1327)),
    (4600, (700, 350), (763, 400), (850, 569), (862, 680), (785, 1147), (756, 1200), (600, 1285), (470, 1300)),
    (4760, (565, 380), (604, 430), (655, 564), (681, 734), (500, 1149), (495, 1190), (380, 1309), (250, 1307)),
    (4830, None,       None,       None,       None,       None,       None,       (300, 1285), (150, 1288)),
]

# The front: its profile at the centreline (X at each Z) — its openings'
# inserts left out, the bumper's surface carried across them — and its foot
# in plan (X at each Y).
NOSE = [(280, 45), (300, 36), (400, 22), (490, 13), (550, 3), (590, 0), (650, 5), (700, 10), (750, 25),
        (800, 28), (870, 26), (910, 29), (930, 39), (950, 56), (970, 85), (980, 110)]
FRONT_FOOT = [(0, 25), (200, 30), (300, 39), (400, 57), (500, 110), (600, 155), (700, 230)]
# The tail: its profile, and its foot.
TAIL = [(355, 4840), (390, 4847), (480, 4871), (540, 4877), (600, 4881), (660, 4893), (720, 4905), (750, 4905),
        (780, 4893), (810, 4881), (840, 4838), (900, 4830), (1000, 4822), (1100, 4818), (1200, 4824),
        (1260, 4830), (1288, 4830)]
REAR_FOOT = [(0, 4840), (300, 4832), (450, 4800), (565, 4760)]


# ---------------------------------------------------------------------
# Details drawn on the body: outlines in the view they are drawn in —
# front and rear (Y out from the centre, Z up), side (X back, Z up), top
# (X back, Y out). Traced off the reference's parts. The faces inside an
# outline become its part; the region's edge is then drawn onto the
# outline (Body.mark_features). The first outline a face falls in wins.
# ---------------------------------------------------------------------

FEATURES = [
    # The side glass and its black surround, as one: the front door's with
    # the mirror's sail, the rear door's and the quarter light, to the
    # Hofmeister kink.
    dict(part="dlo", view="side", outline=[
        (1593, 1153), (1647, 1133), (1717, 1125), (2200, 1160), (2677, 1195), (2987, 1217), (3639, 1257),
        (3747, 1265), (3803, 1287), (3867, 1331), (3893, 1359), (3901, 1379), (3899, 1395), (3885, 1413),
        (3865, 1427), (3753, 1469), (3635, 1505), (3527, 1531), (3369, 1563), (3231, 1585), (2951, 1613),
        (2781, 1619), (2599, 1619), (2433, 1609), (2323, 1591), (2259, 1575), (2187, 1551), (2061, 1491),
        (1901, 1393), (1823, 1337), (1747, 1281)]),
    # The windscreen, the rear window and the sunroof, their black frit
    # with them.
    dict(part="glass", view="top", outline=[
        (1290, -80), (1293, 0), (1297, 179), (1317, 341), (1355, 511), (1399, 637), (1435, 703), (1473, 749), (1545, 783),
        (1857, 705), (2097, 635), (2149, 613), (2119, 497), (2099, 375), (2083, 193), (2079, 0), (2076, -80)]),
    dict(part="glass", view="top", outline=[
        (3868, -80), (3867, 0), (3863, 127), (3851, 271), (3829, 405), (3797, 525), (3769, 599), (4009, 609), (4183, 615),
        (4331, 613), (4375, 607), (4417, 595), (4463, 557), (4489, 529), (4513, 491), (4539, 437), (4561, 369),
        (4581, 289), (4601, 151), (4609, 0), (4608, -80)]),
    dict(part="sunroof", view="top", outline=[
        (2351, -80), (2351, 0), (2351, 87), (2363, 297), (2377, 393), (2395, 429), (2413, 445), (2439, 453), (2483, 457),
        (2821, 457), (2885, 453), (2911, 443), (2931, 427), (2945, 395), (2949, 369), (2949, 0), (2949, -80)]),
    # The kidneys: the chrome frame's outer edge.
    dict(part="kidney", view="front", outline=[
        (11, 845), (13, 801), (23, 761), (35, 743), (57, 727), (85, 721), (165, 719), (295, 721), (349, 727),
        (381, 735), (405, 749), (421, 765), (439, 795), (447, 833), (447, 883), (441, 901), (431, 913),
        (403, 929), (379, 935), (279, 943), (197, 943), (89, 937), (43, 927), (21, 907)]),
    # The slot under the kidneys, the lower grille across the bumper, and
    # the intakes at its corners.
    # (the ones across the centre carried past it, so their edge crosses it square)
    dict(part="intake", view="front", outline=[
        (-80, 611), (0, 611), (347, 611), (403, 619), (417, 625), (413, 633), (381, 661), (347, 671), (183, 677),
        (0, 677), (-80, 677)]),
    dict(part="intake", view="front", outline=[
        (-80, 331), (0, 331), (279, 331), (379, 333), (447, 343), (493, 359), (525, 375), (537, 387), (537, 411),
        (517, 461), (387, 479), (281, 481), (0, 481), (-80, 481)]),
    dict(part="intake", view="front", outline=[
        (835, 367), (859, 367), (867, 373), (871, 385), (879, 483), (879, 539), (873, 555), (847, 577),
        (775, 609), (731, 609), (631, 587), (551, 565), (547, 559), (571, 511), (607, 485), (645, 389),
        (661, 373), (677, 369)]),
    # The rear bumper's reflectors, upright in its corners.
    dict(part="vent", view="rear", outline=[
        (803, 547), (795, 555), (795, 811), (803, 819), (829, 797), (837, 781), (843, 749), (845, 701),
        (843, 611), (839, 589), (833, 571)]),
]


# The details cut into the body — openings with depth, glass set in. The
# rest are parts of their own, laid on it (x6_parts.py).
CUT = {"kidney", "intake", "dlo", "glass", "sunroof", "vent"}


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


class Body:
    """The body's surface, and its mesh."""

    def __init__(self):
        self.col_x = cb.smooth1d(COLUMNS)
        self.lines = []
        for k in range(8):
            known = [(row[0], row[k + 1]) for row in SECTION if row[k + 1] is not None]
            self.lines.append((cb.smooth1d([(x, p[0]) for x, p in known]),
                               cb.smooth1d([(x, p[1]) for x, p in known])))
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
        E, S, L, M, K, B, U, P = [(fy(X), fz(X)) for fy, fz in self.lines]
        C = (0.0, self.profile(X))
        samples = 24
        # Two curves, meeting at the shoulder crease: the side arrives at K
        # going up; the shoulder leaves it turned SHOULDER degrees further in.
        # The sill runs up to the door's lower crease, L, and folds there.
        sill = cb.catmull([E, S, L], samples=samples, start=(E[0] - 40, E[1] - 60))
        side = cb.catmull([L, M, K], samples=samples)
        lower = sill + side[1:]
        up = math.atan2(K[0] - M[0], K[1] - M[1]) - math.radians(SHOULDER)
        reach = cb.dist(K, B)
        start = (B[0] - 2 * reach * math.sin(up), B[1] - 2 * reach * math.cos(up))
        upper = cb.catmull([K, B, U, P, C], samples=samples, start=start, end=(-P[0], P[1]))
        poly = lower + upper[1:]
        acc = cb.lengths(poly)
        # E, L, K, B, U, P, C are control points 0, 2, 4, 5, 6, 7, 8.
        marks = [acc[k * samples] for k in (0, 2, 4, 5, 6, 7, 8)]
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
        """Where column i crosses row u: straight across the car, but at the
        ends: at the front, the first columns curving forward to the
        bonnet's leading edge; at the back, the last round to the tailgate's
        lip."""
        x = self.col_x(i)
        if u > ROW_BELT and i < 4 * D:
            f = (u - ROW_BELT) / (ROW_TOP - ROW_BELT)
            x -= FRONT_CURL * (1 - (1 - f) ** 3) * (1 - i / (4 * D)) ** 2
        if u > ROW_BELT and i > N_COLS - D:
            # the lip: from the corner over the lamps round to the centreline
            y = self.point(x, u)[1]
            yb = self.point(x, ROW_BELT)[1]
            lip = LIP_X + (x - LIP_X) * max(0.0, min(1.0, y / yb)) ** LIP_POWER
            x += (lip - x) * (1 - (N_COLS - i) / D)
        return x

    # -----------------------------------------------------------------
    # The mesh
    # -----------------------------------------------------------------

    def build(self, builder, part_of):
        """Every face of the body's half into `builder`; `part_of(region, i, j)`
        names each face's part (paint, glass, ...). The details are drawn on
        after the cage is fitted (mark_features)."""
        self.build_side(builder, part_of)
        self.build_bands(builder, part_of)
        self.build_front(builder, part_of)
        self.build_rear(builder, part_of)

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
        door_front, b_pillar = 16 * D, 29 * D
        rear_arch = REAR_ARCH["cols"][0]
        rear_door = 42 * D
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
        "top": (0, 1),     # (X, Y)
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

        def faces_view(n, view):
            # a face can carry a view's detail if it faces that way enough to be drawn in it
            return {"front": -n[0] > 0.12, "rear": n[0] > 0.12, "side": n[1] > 0.45, "top": n[2] > 0.35}[view]

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
            for part, fview, poly in outlines:
                if not faces_view(n, fview):
                    continue
                view = fview
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
            views = [v for p, v, _ in outlines if p == part]
            view = views[0] if len(set(views)) == 1 else view_of(vnormal[k])
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
            if on_centre and view == "top":
                # on the centreline, drawn from above: only along the car
                n = vnormal[k]
                along = (n[2], 0.0, -n[0])
                if abs(along[0]) < 0.3:
                    continue
                t = (target[0] - p[0]) / along[0]
                verts[k] = (p[0] + t * along[0], 0.0, p[2] + t * along[2])
                moved += 1
                continue
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

    def creases(self):
        """Lines to shade sharp, each a chain of the body's vertices (design
        mm, as laid out, before the fit): the shoulder crease the length of
        the car, the doors' lower crease between the arches, and its
        continuation across the rear bumper."""
        return [[self.point(self.column_x(c, ROW_CREASE), ROW_CREASE) for c in range(N_COLS + 1)],
                [self.point(self.col_x(c), ROW_LOW) for c in range(FRONT_ARCH["cols"][1], REAR_ARCH["cols"][0] + 1)],
                # the rear bumper's crease, across the tail, and the tailgate's lower edge above it
                list(self.rear_grid[ROW_LOW]),
                list(min(self.rear_grid, key=lambda row: abs(row[0][2] - TAILGATE_EDGE)))]

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
        the apron's foot and across to the centreline. Its rows carry the
        side's across the car, its columns the bonnet's rows down it."""
        right = [self.point(self.column_x(0, u), u) for u in range(ROW_BELT + 1)]
        top = [self.point(self.column_x(0, u), u) for u in range(ROW_TOP, ROW_BELT - 1, -1)]
        n, m = len(top) - 1, len(right) - 1
        # The centreline, its rows as high as the side's.
        z0, z1 = NOSE[0][0], top[0][2]
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
        grid = relax(cb.coons(bottom, top, left, right))
        grid = self.round_end(grid, right, self.nose, +1)
        builder.grid(grid, tag=lambda i, j: part_of("front", i, j))

    def round_end(self, grid, right, centre_x, sign):
        """An end face's depth, across it: flat at the middle, curving
        faster and faster towards the corner, where it meets the side at
        the side's own slope — X = the centreline's, plus (the corner's
        minus it) times (Y / the corner's Y) to a power the slope sets.

        The corner is taken as a function of height, so the face is a
        smooth surface over (Y, Z) whatever shape the patch's grid has.
        `sign` is +1 at the front (X grows towards the corner), -1 at the
        back. The first and last rows (the foot, the top edge) are left as
        they are, the rows over the foot eased in."""
        m = len(grid) - 1
        zs, xbs, ybs, powers = [], [], [], []
        for j in range(m + 1):
            xb, yb, zb = right[j]
            step = 60.0 * sign
            slope = max(0.05, abs((self.point(xb + step, j)[1] - yb) / step))
            depth = max(1.0, abs(xb - centre_x(zb)))
            zs.append(zb)
            xbs.append(xb)
            ybs.append(yb)
            powers.append(max(1.6, min(6.0, yb / (depth * slope))))
        for _ in range(6):
            powers = [powers[0]] + [(powers[k - 1] + 2 * powers[k] + powers[k + 1]) / 4
                                    for k in range(1, m)] + [powers[m]]
        z_lo, z_hi = zs[0], zs[-1]
        fx = cb.smooth1d(list(zip(zs, xbs)))
        fy = cb.smooth1d(list(zip(zs, ybs)))
        fn = cb.smooth1d(list(zip(zs, powers)))
        out = [grid[0]]
        for j in range(1, m):
            row = []
            for x, y, z in grid[j]:
                zc = max(z_lo, min(z_hi, z))
                xb, yb, n = fx(zc), fy(zc), fn(zc)
                xc = centre_x(z)
                t = max(0.0, min(1.0, y / yb)) if yb > 1.0 else 0.0
                x_end = xc + (xb - xc) * t ** n
                w = smoothstep(j / 3.0)
                row.append((x + (x_end - x) * w, y, z))
            out.append(row)
        out.append(grid[m])
        return out

    def build_rear(self, builder, part_of):
        """The tail: as the front, filling the last column's outline."""
        right = [self.point(self.column_x(N_COLS, u), u) for u in range(ROW_BELT + 1)]
        top = [self.point(self.column_x(N_COLS, u), u) for u in range(ROW_TOP, ROW_BELT - 1, -1)]
        n, m = len(top) - 1, len(right) - 1
        z0, z1 = TAIL[0][0], top[0][2]
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
        grid = relax(cb.coons(bottom, top, left, right))
        grid = self.round_end(grid, right, self.tail, -1)
        self.rear_grid = grid
        builder.grid(grid, tag=lambda i, j: part_of("rear", i, j))


def relax(grid, passes=60):
    """A patch's grid evened out: each inner point moved towards the middle
    of its four neighbours, again and again, the edges held — as a modeller
    relaxes a patch's loops so its quads come out square."""
    g = [list(row) for row in grid]
    m, n = len(g) - 1, len(g[0]) - 1
    for _ in range(passes):
        nxt = [list(row) for row in g]
        for j in range(1, m):
            for i in range(1, n):
                nb = (g[j - 1][i], g[j + 1][i], g[j][i - 1], g[j][i + 1])
                avg = tuple(sum(p[c] for p in nb) / 4 for c in range(3))
                nxt[j][i] = tuple(a + (b - a) * 0.6 for a, b in zip(g[j][i], avg))
        g = nxt
    return g


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

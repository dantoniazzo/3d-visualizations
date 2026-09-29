"""The X6 M Competition's wheel, as the blueprints draw it: a 21-inch rim
of ten Y-spokes on a 295/35 tyre, the brake disc behind, and the M
Compound brakes' blue caliper.

Its frame is the one Car.js turns wheels in: centred on the hub, the axle
along X with the face on +X, Z up, -Y forward. Everything turns with the
wheel but the caliper, which is its own part ("caliper") at the wheel's
back and top — Car.js holds it still and mirrors it for the other wheels.
"""
import math

from mathutils import Vector

from lib.x6_parts import Parts

RADIUS = 372.0          # mm: the tyre's
SEGMENTS = 48


def mm(x, y, z):
    return Vector((x / 1000.0, y / 1000.0, z / 1000.0))


def polar(x, r, t):
    """A point at x along the axle, radius r, angle t (from -Y, forward, up)."""
    return mm(x, -r * math.cos(t), r * math.sin(t))


def lathe(parts, profile, mat, out, segments=SEGMENTS):
    """A profile of (x, r) points turned round the axle, as quads."""
    angles = [2 * math.pi * k / segments for k in range(segments + 1)]
    rings = [[polar(x, r, t) for t in angles] for x, r in profile]
    parts.grid(rings, mat, out)


def box(parts, corners, mat):
    """Six quads over eight corners: the first four one end, the rest the
    other, in the same order round."""
    a, b = corners[:4], corners[4:]
    centre = sum(corners, Vector()) / 8
    out = lambda c: c - centre
    parts.quad(a, mat, out)
    parts.quad(b, mat, out)
    for k in range(4):
        m = (k + 1) % 4
        parts.quad([a[k], a[m], b[m], b[k]], mat, out)


def spoke(parts, t0, t1, r0, r1, w0, w1, x0, x1, thick, mat):
    """A spoke from radius r0 at angle t0 to r1 at t1, w0 wide tapering to
    w1, its face at x0 at the hub dishing to x1 at the rim."""
    def at(r, t, w, x):
        mid = polar(x, r, t)
        side = Vector((0.0, math.sin(t), math.cos(t))) * (w / 2000.0)
        return mid, side

    p0, s0 = at(r0, t0, w0, x0)
    p1, s1 = at(r1, t1, w1, x1)
    back = Vector((-thick / 1000.0, 0.0, 0.0))
    box(parts, [p0 - s0, p0 + s0, p1 + s1, p1 - s1, p0 - s0 + back, p0 + s0 + back, p1 + s1 + back, p1 - s1 + back], mat)


def build():
    """The wheel's two parts: (wheel, caliper), as Parts."""
    wheel, caliper = Parts(), Parts()
    axis = Vector((1.0, 0.0, 0.0))

    # The tyre: tread, rounded shoulders, sidewalls down to the beads.
    tyre = [(-138, 282), (-150, 302), (-153, 330), (-149, 352), (-139, 366), (-120, 372), (-60, 374),
            (0, 374.5), (60, 374), (120, 372), (139, 366), (149, 352), (153, 330), (150, 302), (138, 282)]
    lathe(wheel, tyre, "tyre", lambda c: c - (Vector((0.0, c.y, c.z)).normalized() * 0.330))

    # The rim: its barrel inside, and the lip the spokes meet.
    barrel = [(-134, 266), (-128, 270), (-116, 262), (-90, 252), (70, 252), (96, 258), (118, 266)]
    lathe(wheel, barrel, "rim_barrel", lambda c: -Vector((0.0, c.y, c.z)))
    lip = [(118, 266), (132, 272), (142, 280), (146, 276), (140, 262), (128, 250)]
    lathe(wheel, lip, "rim", lambda c: Vector((1.0, c.y * 2, c.z * 2)))

    # Ten Y-spokes: a stem from the hub, splitting in two towards the rim.
    for k in range(10):
        t = 2 * math.pi * k / 10
        spoke(wheel, t, t, 76, 168, 42, 34, 112, 118, 26, "rim")
        for side in (-1, 1):
            spoke(wheel, t, t + side * math.radians(8.5), 150, 256, 24, 20, 118, 127, 22, "rim")

    # The hub, and its cap: a BMW roundel.
    hub = [(60, 80), (100, 80), (112, 74), (114, 40), (114, 0.5)]
    lathe(wheel, hub, "rim_dark", lambda c: axis + Vector((0.0, c.y, c.z)))
    roundel(wheel, 116.0, 34.0)

    # The brake disc, behind the spokes.
    disc = [(-4, 112), (-4, 196), (-34, 196), (-34, 112)]
    lathe(wheel, disc, "brake_disc", lambda c: Vector((1.0, c.y, c.z)))

    # The caliper: an arc of blue over the disc's back and top.
    arc = [math.radians(a) for a in range(110, 171, 10)]     # from above the axle, round the back
    inner = [(-66, 146), (22, 146)]
    outer = [(-66, 226), (22, 226)]
    rows = []
    for x, r in (inner[0], outer[0], outer[1], inner[1], inner[0]):
        rows.append([polar(x, r, a) for a in arc])
    caliper.grid(rows, "caliper", lambda c: c - polar(-22, 186, math.radians(140)))
    for a in (arc[0], arc[-1]):
        ends = [polar(x, r, a) for x, r in (inner[0], outer[0], outer[1], inner[1])]
        caliper.quad(ends, "caliper", lambda c, a=a: polar(0, 186, a) - polar(0, 186, math.radians(140)))
    return wheel, caliper


def roundel(parts, x, radius):
    """The centre cap: a black ring round a quartered disc, blue and white."""
    segments = 32
    at = lambda t, r, dx=0.0: polar(x + dx, r, t)
    out = Vector((1.0, 0.0, 0.0))
    for k in range(segments):
        t0, t1 = 2 * math.pi * k / segments, 2 * math.pi * (k + 1) / segments
        quarter = int(((t0 + t1) / 2) // (math.pi / 2))
        inner = "badge_blue" if quarter % 2 == 0 else "badge_white"
        parts.quad([at(t0, radius * 0.58, 0.6), at(t1, radius * 0.58, 0.6), at(t1, radius, 1.2), at(t0, radius, 1.2)],
                   "badge_black", out)
        parts.quad([at(t0, 0.3), at(t1, 0.3), at(t1, radius * 0.58, 0.6), at(t0, radius * 0.58, 0.6)], inner, out)

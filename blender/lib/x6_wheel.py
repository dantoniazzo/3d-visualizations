"""The X6 M's wheel, as the reference has it: a 21-inch rim of five double
spokes, their faces machined bright and their sides dark, on a 285/35
tyre; the brake disc behind, and the M Compound brakes' blue caliper.

Its frame is the one Car.js turns wheels in: centred on the hub, the axle
along X with the face on +X, Z up, -Y forward. Everything turns with the
wheel but the caliper, which is its own part ("caliper") at the wheel's
back and top — Car.js holds it still and mirrors it for the other wheels.
"""
import math

from mathutils import Vector

from lib.x6_parts import Parts

RADIUS = 379.0          # mm: the tyre's
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


def box(parts, corners, mat, face=None):
    """Six quads over eight corners: the first four one end, the rest the
    other, in the same order round. `face`, if given, is the material of
    the side facing out of the wheel (+X)."""
    a, b = corners[:4], corners[4:]
    centre = sum(corners, Vector()) / 8
    out = lambda c: c - centre
    sides = [a, b] + [[a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]] for k in range(4)]
    for quad in sides:
        mid = sum(quad, Vector()) / 4
        facing_out = face is not None and (mid - centre).normalized().x > 0.7
        parts.quad(quad, face if facing_out else mat, out)


def spoke(parts, t0, t1, r0, r1, w0, w1, x0, x1, thick, mat, face=None, segments=4):
    """A spoke from radius r0 at angle t0 to r1 at t1, w0 wide tapering to
    w1, its face at x0 at the hub dishing to x1 at the rim; in `segments`
    lengths, so it can curve."""
    def at(f):
        r, t, w, x = r0 + (r1 - r0) * f, t0 + (t1 - t0) * f, w0 + (w1 - w0) * f, x0 + (x1 - x0) * f
        mid = polar(x, r, t)
        side = Vector((0.0, math.sin(t), math.cos(t))) * (w / 2000.0)
        return mid, side

    back = Vector((-thick / 1000.0, 0.0, 0.0))
    for k in range(segments):
        (p0, s0), (p1, s1) = at(k / segments), at((k + 1) / segments)
        box(parts, [p0 - s0, p0 + s0, p1 + s1, p1 - s1, p0 - s0 + back, p0 + s0 + back, p1 + s1 + back, p1 - s1 + back],
            mat, face)


def build():
    """The wheel's two parts: (wheel, caliper), as Parts."""
    wheel, caliper = Parts(), Parts()
    axis = Vector((1.0, 0.0, 0.0))

    # The tyre: tread, rounded shoulders, sidewalls down to the beads.
    tyre = [(-136, 290), (-148, 310), (-151, 335), (-147, 358), (-137, 372), (-118, 378), (-60, 379),
            (0, 379.5), (60, 379), (118, 378), (137, 372), (147, 358), (151, 335), (148, 310), (136, 290)]
    lathe(wheel, tyre, "tyre", lambda c: c - (Vector((0.0, c.y, c.z)).normalized() * 0.335))

    # The rim: its barrel inside, and the machined lip the spokes meet.
    barrel = [(-134, 272), (-128, 276), (-116, 268), (-90, 258), (70, 258), (96, 264), (118, 272)]
    lathe(wheel, barrel, "rim_barrel", lambda c: -Vector((0.0, c.y, c.z)))
    lip = [(118, 272), (130, 280), (140, 290), (144, 286), (138, 272), (128, 262)]
    lathe(wheel, lip, "rim", lambda c: Vector((1.0, c.y * 2, c.z * 2)))

    # Five double spokes: each pair joined at the hub, spreading to the rim,
    # machined faces on dark sides.
    for k in range(5):
        t = 2 * math.pi * k / 5
        for side in (-1, 1):
            spoke(wheel, t + side * math.radians(4.2), t + side * math.radians(8.5), 82, 270, 42, 46, 114, 130, 36,
                  "rim_dark", face="rim")
        # the web between the pair, set back, dark
        spoke(wheel, t, t, 78, 200, 26, 18, 106, 114, 22, "rim_dark", segments=3)

    # The hub, dark, its five bolts; the cap a BMW roundel.
    hub = [(60, 86), (104, 86), (114, 80), (116, 44), (116, 0.5)]
    lathe(wheel, hub, "rim_dark", lambda c: axis + Vector((0.0, c.y, c.z)))
    for k in range(5):
        t = 2 * math.pi * (k + 0.5) / 5
        bolt = [(110, 13), (124, 13), (126, 10), (127, 0.5)]
        centre = polar(0, 60, t)
        ring = [[Vector((x / 1000.0, centre.y + (r / 1000.0) * math.cos(a), centre.z + (r / 1000.0) * math.sin(a)))
                 for a in (2 * math.pi * j / 6 for j in range(7))] for x, r in bolt]
        wheel.grid(ring, "rim", lambda c, cy=centre.y, cz=centre.z: Vector((1.0, (c.y - cy) * 3, (c.z - cz) * 3)))
    roundel(wheel, 118.0, 30.0)

    # The brake disc, behind the spokes.
    disc = [(-4, 112), (-4, 205), (-36, 205), (-36, 112)]
    lathe(wheel, disc, "brake_disc", lambda c: Vector((1.0, c.y, c.z)))

    # The caliper: an arc of blue over the disc's back and top.
    arc = [math.radians(a) for a in range(110, 171, 10)]     # from above the axle, round the back
    inner = [(-68, 150), (24, 150)]
    outer = [(-68, 238), (24, 238)]
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

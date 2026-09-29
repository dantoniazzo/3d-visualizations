"""Building a car's bodywork from blueprint measurements.

The tools a modeller uses on a car, as functions: smooth curves through
points measured off the blueprints, quad patches spanned between curves
(a Coons patch fills four boundary curves the way a modeller fills a
traced outline with an even grid), and a mesh builder that welds the
patches along the edges they share, so the panels become one surface.

Everything here is plain geometry on tuples; blender/lib/x6.py uses it to
build the BMW X6.
"""
import bisect
import math


# ---------------------------------------------------------------------
# Curves
# ---------------------------------------------------------------------

def smooth1d(pairs):
    """A smooth function through (x, y) pairs: monotone cubic (Fritsch-
    Carlson), so it never overshoots between the measured points, and
    straight beyond the first and last."""
    pts = sorted(pairs)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(xs)
    if n == 1:
        return lambda x: ys[0]
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2
    for i in range(n - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0.0
            continue
        a, b = m[i] / d[i], m[i + 1] / d[i]
        s = a * a + b * b
        if s > 9:
            t = 3 / math.sqrt(s)
            m[i], m[i + 1] = t * a * d[i], t * b * d[i]

    def f(x):
        if x <= xs[0]:
            return ys[0] + m[0] * (x - xs[0])
        if x >= xs[-1]:
            return ys[-1] + m[-1] * (x - xs[-1])
        k = bisect.bisect_right(xs, x) - 1
        h = xs[k + 1] - xs[k]
        t = (x - xs[k]) / h
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k]
                + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1])

    return f


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _mul(a, s):
    return tuple(x * s for x in a)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def catmull(points, samples=12, start=None, end=None):
    """A smooth curve through points (centripetal Catmull-Rom), as a dense
    polyline. `start` and `end` are phantom points that set the tangents
    at the ends; by default the curve runs straight on."""
    pts = list(points)
    if len(pts) < 2:
        return pts
    p0 = start if start is not None else _sub(_mul(pts[0], 2), pts[1])
    pn = end if end is not None else _sub(_mul(pts[-1], 2), pts[-2])
    ctrl = [p0] + pts + [pn]
    out = [pts[0]]
    for i in range(1, len(ctrl) - 2):
        a, b, c, e = ctrl[i - 1], ctrl[i], ctrl[i + 1], ctrl[i + 2]
        # centripetal parameterisation
        t0 = 0.0
        t1 = t0 + max(dist(a, b), 1e-6) ** 0.5
        t2 = t1 + max(dist(b, c), 1e-6) ** 0.5
        t3 = t2 + max(dist(c, e), 1e-6) ** 0.5
        for s in range(1, samples + 1):
            t = t1 + (t2 - t1) * s / samples
            a1 = _add(_mul(a, (t1 - t) / (t1 - t0)), _mul(b, (t - t0) / (t1 - t0)))
            a2 = _add(_mul(b, (t2 - t) / (t2 - t1)), _mul(c, (t - t1) / (t2 - t1)))
            a3 = _add(_mul(c, (t3 - t) / (t3 - t2)), _mul(e, (t - t2) / (t3 - t2)))
            b1 = _add(_mul(a1, (t2 - t) / (t2 - t0)), _mul(a2, (t - t0) / (t2 - t0)))
            b2 = _add(_mul(a2, (t3 - t) / (t3 - t1)), _mul(a3, (t - t1) / (t3 - t1)))
            out.append(_add(_mul(b1, (t2 - t) / (t2 - t1)), _mul(b2, (t - t1) / (t2 - t1))))
    return out


def lengths(poly):
    """Cumulative arc length along a polyline."""
    acc = [0.0]
    for a, b in zip(poly, poly[1:]):
        acc.append(acc[-1] + dist(a, b))
    return acc


def at_length(poly, acc, s):
    """The point `s` along a polyline whose cumulative lengths are `acc`."""
    if s <= 0:
        return poly[0]
    if s >= acc[-1]:
        return poly[-1]
    k = bisect.bisect_right(acc, s) - 1
    seg = acc[k + 1] - acc[k]
    return lerp(poly[k], poly[k + 1], (s - acc[k]) / seg if seg else 0.0)


def resample(poly, n):
    """n + 1 points evenly spaced along a polyline, ends included."""
    acc = lengths(poly)
    return [at_length(poly, acc, acc[-1] * i / n) for i in range(n + 1)]


def resample_at(poly, fractions):
    """Points at fractions (0..1) of a polyline's length."""
    acc = lengths(poly)
    return [at_length(poly, acc, acc[-1] * f) for f in fractions]


def spaced(n, ease_start=1.0, ease_end=1.0):
    """n + 1 fractions from 0 to 1, closer together at an end whose ease is
    under 1 (0.5: the first gap half the average) — for support loops."""
    w = [1.0] * n
    if n > 1:
        w[0] *= ease_start
        w[-1] *= ease_end
    total = sum(w)
    out, acc = [0.0], 0.0
    for x in w:
        acc += x
        out.append(acc / total)
    return out


# ---------------------------------------------------------------------
# Patches
# ---------------------------------------------------------------------

def coons(bottom, top, left, right):
    """A grid spanning four boundary curves: bottom and top have n + 1
    points each (from left to right), left and right m + 1 (from bottom to
    top), meeting at the corners. Returns grid[j][i], j up, i across.

    Transfinite interpolation — each boundary blended in by its distance
    from the opposite one, each point's parameters taken from the arc
    length along the boundaries, so uneven spacing on a boundary carries
    across the patch."""
    n, m = len(bottom) - 1, len(left) - 1
    lb, lt = lengths(bottom), lengths(top)
    ll, lr = lengths(left), lengths(right)
    ub = [x / lb[-1] if lb[-1] else i / n for i, x in enumerate(lb)]
    ut = [x / lt[-1] if lt[-1] else i / n for i, x in enumerate(lt)]
    vl = [x / ll[-1] if ll[-1] else j / m for j, x in enumerate(ll)]
    vr = [x / lr[-1] if lr[-1] else j / m for j, x in enumerate(lr)]
    p00, p10, p01, p11 = bottom[0], bottom[-1], top[0], top[-1]
    grid = []
    for j in range(m + 1):
        row = []
        for i in range(n + 1):
            # Where this point is across and up the patch: u runs from the
            # bottom's fraction to the top's as v rises, v from the left's to
            # the right's as u goes across — solved together.
            du, dv = ut[i] - ub[i], vr[j] - vl[j]
            u = (ub[i] + du * vl[j]) / (1 - du * dv)
            v = vl[j] + dv * u
            if j == 0:
                row.append(bottom[i])
                continue
            if j == m:
                row.append(top[i])
                continue
            if i == 0:
                row.append(left[j])
                continue
            if i == n:
                row.append(right[j])
                continue
            a = _add(_mul(bottom[i], 1 - v), _mul(top[i], v))
            b = _add(_mul(left[j], 1 - u), _mul(right[j], u))
            c = _add(_add(_mul(p00, (1 - u) * (1 - v)), _mul(p10, u * (1 - v))),
                     _add(_mul(p01, (1 - u) * v), _mul(p11, u * v)))
            row.append(_sub(_add(a, b), c))
        grid.append(row)
    return grid


def line(a, b, n):
    """n + 1 points evenly from a to b."""
    return [lerp(a, b, i / n) for i in range(n + 1)]


# ---------------------------------------------------------------------
# Mesh building
# ---------------------------------------------------------------------

class Builder:
    """Vertices and quads, welded wherever two patches share a boundary.

    A vertex is keyed by its position rounded to `weld` (mm), so the
    same boundary point computed for two neighbouring patches becomes one
    vertex. Each face carries a part name, for materials and for picking
    faces out afterwards (windows, lamps)."""

    def __init__(self, weld=0.01):
        self.weld = weld
        self.verts = []
        self.index = {}
        self.faces = []        # (v0, v1, v2, v3)
        self.parts = []        # part name per face
        self.tags = []         # dict of extra data per face

    def vert(self, p):
        key = tuple(round(c / self.weld) for c in p)
        k = self.index.get(key)
        if k is None:
            k = len(self.verts)
            self.index[key] = k
            self.verts.append(tuple(p))
        return k

    def quad(self, a, b, c, d, part="body", **tags):
        ids = [self.vert(p) for p in (a, b, c, d)]
        if len(set(ids)) < 3:
            return None
        if len(set(ids)) == 3:
            # a collapsed corner: keep the triangle
            seen = []
            for i in ids:
                if i not in seen:
                    seen.append(i)
            ids = seen
        self.faces.append(tuple(ids))
        self.parts.append(part)
        self.tags.append(tags)
        return len(self.faces) - 1

    def grid(self, grid, part="body", flip=False, tag=None):
        """Quads over a grid[j][i]; `tag(i, j)` gives each face's part and tags."""
        for j in range(len(grid) - 1):
            for i in range(len(grid[j]) - 1):
                a, b, c, d = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
                name, tags = part, {}
                if tag:
                    got = tag(i, j)
                    if got:
                        name, tags = got if isinstance(got, tuple) else (got, {})
                if flip:
                    self.quad(a, d, c, b, name, i=i, j=j, **tags)
                else:
                    self.quad(a, b, c, d, name, i=i, j=j, **tags)

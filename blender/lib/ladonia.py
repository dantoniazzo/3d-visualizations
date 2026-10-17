"""The furniture of Ladonia Residence (Kosinožići; konekt-nekretnine.hr
project 253), modelled on its interior and terrace renders (gallery 17–22):
handleless kitchens — mustard lacquer, light oak and cream in A, sage in B
and C — with slim terrazzo and quartzite tops, undermount sinks and flush
hobs; an ivory bouclé sofa and a slip-covered linen one, built of soft,
creased cushions; a pale oak table under an olive felt dome, a microcement
one under a pleated pendant; ceiling tracks; oak and rift-oak TV walls; a
made-up bed under felt panels; and, outside, sage and terracotta garden
furniture, an outdoor kitchen and a wisteria in a planter.

Conventions as loose.py's, with the piece centred on the origin: standing on
z = 0, its front towards +Y — the app's north at rotation 0 — so a placement
turns it to face where the plan has it face.
"""

import json
import math

import bpy

from . import geometry as g

PI = math.pi

#: Each scheme's kitchen: base fronts, wall cupboards, the tall column, the
#: worktop and the splashback behind it.
SCHEMES = {
    "ochre": dict(base="lacquer_ochre", upper="lacquer_cream", tall="oak_veneer", top="terrazzo_top",
                  splash="terrazzo_top", tap="gunmetal", oven="white", shelves=False),
    "sage": dict(base="lacquer_sage", upper="lacquer_sage", tall="lacquer_sage", top="stone_top",
                 splash="lacquer_sage", tap="champagne", tap_h=0.27, oven="black", shelves=True),
}


def _soft(name, size, loc, col, mat, rot=None, r=0.04):
    """An upholstered block: rounded edges, smooth shading."""
    return g.box(name, size, loc=loc, col=col, mat=mat, rot=rot, bevel=r, segments=3, shade_smooth=True)


def _disc(name, r, t, z, col, mat, segments=40):
    """A round top `t` thick, its top at `z`."""
    return g.cylinder(name, r, t, loc=(0, 0, z - t / 2), col=col, mat=mat, segments=segments)


# ---------------------------------------------------------------------
# The living room
# ---------------------------------------------------------------------

def _pillow(name, size, loc, col, mat, rot=None, r=0.05, puff=0.25, crease=0.004, cuts=6, seed=0, sag=0.0,
            flare=0.0, folds=0.0, axis=None, bend=0.0):
    """A soft upholstered shape: a box `size` with its edges rounded to `r`,
    fattened in the middle of its broad faces (`puff`, a share of its
    thickness), sagging on top (`sag`, metres), creased (`crease`, metres
    of noise), its foot flared out (`flare`) and hung with vertical folds
    (`folds`) like a loose cover — so cloth reads as cloth, not a box."""
    import bmesh
    from mathutils import Vector, noise
    sx, sy, sz = size
    h = Vector((sx / 2, sy / 2, sz / 2))
    rr = min(r, h.x * 0.95, h.y * 0.95, h.z * 0.95)
    k = axis if axis is not None else min(range(3), key=lambda i: size[i])
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    off = Vector((seed * 1.37, seed * 2.11, seed * 0.73))
    for v in bm.verts:
        p = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        # Even out the grid towards the edges so the rounding gets the vertices.
        q = Vector([max(-h[i] + rr, min(h[i] - rr, p[i])) for i in range(3)])
        dv = p - q
        if dv.length > 1e-9:
            p = q + dv.normalized() * rr
        u = [p[i] / h[i] for i in range(3)]
        a, b = [i for i in range(3) if i != k]
        bulge = (1 - min(1, u[a] ** 2)) * (1 - min(1, u[b] ** 2))
        p[k] += p[k] * puff * bulge
        if sag and p.z > 0:
            p.z -= sag * (p.z / h.z) * (1 - min(1, u[0] ** 2)) * (1 - min(1, u[1] ** 2))
        if flare and p.z < 0:
            t = (-p.z / h.z) ** 3
            p.x *= 1 + flare * t
            p.y *= 1 + flare * t
        n = Vector((p.x / h.x ** 2, p.y / h.y ** 2, p.z / h.z ** 2)).normalized()
        if crease:
            c = noise.noise(Vector((p.x * 9, p.y * 9, p.z * 9)) + off) + \
                0.6 * noise.noise(Vector((p.x * 3, p.y * 22, p.z * 3)) + off * 2) + \
                0.4 * noise.noise(Vector((p.x * 24, p.y * 4, p.z * 14)) - off)
            p += n * crease * c
        if folds and abs(n.z) < 0.7:
            # Loose cover: folds running down, deeper towards the hem.
            t = max(0.0, (h.z - p.z) / (2 * h.z))
            along = p.x if abs(n.y) > abs(n.x) else p.y
            p += Vector((n.x, n.y, 0)) * folds * t * (math.sin(along * 38 + seed) * 0.6 +
                                                       noise.noise(Vector((along * 12, seed, 0.3))) * 0.8)
        if bend:
            # Curve it round (a chair's back): its ends forward in +Y.
            p.y += bend * (p.x / h.x) ** 2
        v.co = p
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = g._finish(mesh, name, col, mat, loc, rot, True)
    return obj


def _lean(foot, h, a):
    """The middle of a cushion `h` tall standing on `foot` (x, y, z) and
    leaning back by `a` radians (its top towards -Y), for rot=(a, 0, yaw)."""
    return (foot[0], foot[1] - h / 2 * math.sin(a), foot[2] + h / 2 * math.cos(a))


def _case_pillow(name, w, h, t, loc, col, mat, rot=None, flange=0.0, stripes=(), stripe_mat=None, seed=0,
                 crease=0.004, pull=0.05, grid=22, profile="slab"):
    """A pillow as cloth is sewn: one closed shell, `w` x `h` (x, z) and `t`
    thick at its middle (y), its faces bowing out from a thin seam so it is
    lens-shaped in section, its edges drawn in between plump corners. A
    `flange` (an Oxford border) runs round it as a flat double layer of the
    same cloth, a few millimetres thick, and `stripes` — distances in from
    the outer edge, (d0, d1) each — are faces of `stripe_mat` on both sides
    of that border. No plane through the middle, nothing laid on top.
    `profile` "dome": a stuffed throw cushion, thinning steadily from its
    middle to the seam with no flat top (about 80% of `t` at half width),
    where the default "slab" stays full almost to its edge."""
    import bmesh
    from mathutils import Vector, noise
    W, H = w + 2 * flange, h + 2 * flange
    tf = 0.006 if flange else 0.004

    def axis(n, half, core):
        us = {round(-1 + 2 * i / n, 6) for i in range(n + 1)}
        for d0, d1 in stripes:
            for d in (d0, d1):
                us |= {round(1 - d / half, 6), round(-1 + d / half, 6)}
        if flange:
            us |= {round(core, 6), round(-core, 6)}
        return sorted(us)

    us, vs = axis(grid, W / 2, w / W), axis(grid, H / 2, h / H)
    off = Vector((seed * 1.37, seed * 2.11, seed * 0.73))
    bm = bmesh.new()
    sides = []
    for s in (1, -1):
        rows = []
        for v in vs:
            row = []
            for u in us:
                x = u * W / 2 * (1 - pull * (1 - v * v) * abs(u) ** 2)
                z = v * H / 2 * (1 - pull * (1 - u * u) * abs(v) ** 2)
                ex, ez = min(1.0, abs(u) * W / w), min(1.0, abs(v) * H / h)
                bulge = ((1 - ex ** 4) * (1 - ez ** 4)) ** 0.5
                if profile == "dome":
                    bulge = ((1 - ex ** 2) * (1 - ez ** 2)) ** 0.75
                half = tf / 2 + (t / 2 - tf / 2) * bulge
                c = noise.noise(Vector((x * 7, z * 7, s)) + off) + 0.6 * noise.noise(Vector((x * 22, z * 5, s * 2)) - off) + \
                    0.35 * noise.noise(Vector((x * 4, z * 30, s * 3)) + off * 2)
                y = s * (half + crease * c * bulge)
                row.append(bm.verts.new((x, y, z)))
            rows.append(row)
        sides.append(rows)
    front, back = sides
    nu, nv = len(us), len(vs)

    def in_stripe(uc, vc):
        dx, dz = (1 - abs(uc)) * W / 2, (1 - abs(vc)) * H / 2
        for d0, d1 in stripes:
            if (d0 <= dx <= d1 and dz >= d0) or (d0 <= dz <= d1 and dx >= d0):
                return True
        return False

    for j in range(nv - 1):
        for i in range(nu - 1):
            uc, vc = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            m = 1 if stripe_mat is not None and in_stripe(uc, vc) else 0
            f = bm.faces.new((front[j][i], front[j][i + 1], front[j + 1][i + 1], front[j + 1][i]))
            f.material_index = m
            b = bm.faces.new((back[j][i], back[j + 1][i], back[j + 1][i + 1], back[j][i + 1]))
            b.material_index = m
    # The seam round the edge, closing the shell.
    ring = [(0, i) for i in range(nu - 1)] + [(j, nu - 1) for j in range(nv - 1)] + \
           [(nv - 1, i) for i in range(nu - 1, 0, -1)] + [(j, 0) for j in range(nv - 1, 0, -1)]
    for k in range(len(ring)):
        (ja, ia), (jb, ib) = ring[k], ring[(k + 1) % len(ring)]
        bm.faces.new((front[ja][ia], back[ja][ia], back[jb][ib], front[jb][ib]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = g._finish(mesh, name, col, mat, loc, rot, True)
    if stripe_mat is not None:
        obj.data.materials.append(stripe_mat)
    return obj


def _rest(obj, behind, d, tol=0.005, reach=(-0.25, 0.3)):
    """Slide a cushion `obj` along `d` (horizontal, pointing away from what
    it leans on) to where it rests on `behind`: as far back as it can go
    without pressing more than `tol` into any of them — so it touches the
    cushion behind it, neither standing off it nor buried in it."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    d = Vector(d).normalized()
    trees = []
    for o in behind:
        mw = o.matrix_basis
        trees.append(BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [p.vertices[:] for p in o.data.polygons]))
    mw = obj.matrix_basis
    pts = [mw @ v.co for v in obj.data.vertices]
    rays = (Vector((0, 0, 1)), Vector((1, 0.0013, 0.0007)).normalized())

    def inside(t, q):
        # Ray parity both ways (a thin seam fools the nearest face's normal).
        for r in rays:
            k, o = 0, q
            for _ in range(16):
                hit = t.ray_cast(o, r)[0]
                if hit is None:
                    break
                k, o = k + 1, hit + r * 1e-5
            if k % 2 == 0:
                return False
        return True

    def depth(s):
        worst = 0.0
        for p in pts:
            q = p + d * s
            for t in trees:
                hit, _, _, dist = t.find_nearest(q, 0.15)
                if hit is not None and dist > worst and inside(t, q):
                    worst = dist
        return worst

    a, b = reach
    for _ in range(16):
        m = (a + b) / 2
        if depth(m) > tol:
            a = m
        else:
            b = m
    obj.location = Vector(obj.location) + d * b
    return b


#: The sofas of the renders: A's ivory bouclé (render 17), B's and C's
#: slip-covered oatmeal linen with bottle-green velvet cushions (render 19).
SOFAS = {
    "boucle": dict(fabric="weave_oat", d=1.12, arm_w=0.16, arm_h=0.60, back_h=0.86, seat_top=0.45,
                   cover=False, pillows=["linen_terracotta", "weave_cream"], crease=0.004),
    "linen": dict(fabric="linen_ecru", d=1.0, arm_w=0.15, arm_h=0.60, back_h=0.80, seat_top=0.46,
                  cover=True, pillows=["weave_oat", "velvet_bottle"], crease=0.014),
}


def sofa(col, mats, w=2.50, chaise=None, style="linen", d=None, chaise_len=1.65, cw=0.95):
    """A deep, low sofa of loose cushions: a frame under a cover (falling
    to the floor and creased, for the slip-covered linen one), slim track
    arms, seat cushions, tall back cushions leaning on the back, and throw
    cushions. `chaise` "left" or "right" (-X or +X) pulls that end forward
    into a chaise longue `chaise_len` deep, the arm running along it."""
    st = SOFAS[style]
    f = mats[st["fabric"]]
    d = d or st["d"]
    aw, ah, bh, top = st["arm_w"], st["arm_h"], st["back_h"], st["seat_top"]
    cr = st["crease"]
    y0 = -d / 2
    side = {"left": -1, "right": 1}.get(chaise, 0)
    # cw: the chaise's width, its arm included
    long = chaise_len
    back_t = 0.2
    base_top = top - 0.17
    parts = []
    hem = 0.012 if st["cover"] else 0.05
    folds = 0.01 if st["cover"] else 0.0

    def soft(name, x0, x1, ya, yb, z0, z1, m=f, **kw):
        kw.setdefault("crease", cr)
        parts.append(_pillow(name, (x1 - x0, yb - ya, z1 - z0), ((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2), col, m, **kw))

    # The frame under the seat, and the chaise's.
    soft("base", -w / 2 + aw - 0.02, w / 2 - aw + 0.02, y0 + 0.02, y0 + d, hem, base_top, r=0.03, puff=0.05, folds=folds,
         flare=0.012 if st["cover"] else 0.0, seed=1)
    if side:
        cx0, cx1 = (w / 2 - cw, w / 2 - aw + 0.02) if side > 0 else (-w / 2 + aw - 0.02, -w / 2 + cw)
        soft("base", cx0, cx1, y0 + d - 0.1, y0 + long, hem, base_top, r=0.03, puff=0.05, folds=folds,
             flare=0.012 if st["cover"] else 0.0, seed=2)
    else:
        cx0 = cx1 = None
    if not st["cover"]:
        # Bouclé: a recessed dark plinth on hidden feet.
        parts.append(_block(col, mats["kitchen_gap"], -w / 2 + aw, w / 2 - aw, y0 + 0.08, y0 + d - 0.06, 0, hem + 0.01, "plinth"))
        if side:
            parts.append(_block(col, mats["kitchen_gap"], cx0 + 0.04, cx1 - 0.04, y0 + d - 0.1, y0 + long - 0.06, 0, hem + 0.01,
                                "plinth"))
    # The back, behind the cushions, and the arms.
    soft("back", -w / 2 + aw - 0.02, w / 2 - aw + 0.02, y0, y0 + back_t, base_top - 0.02, bh - 0.09, r=0.05, puff=0.08,
         folds=folds * 0.5, seed=3)
    for s in (-1, 1):
        ya, yb = y0, y0 + (long if s == side else d)
        x0, x1 = (w / 2 - aw, w / 2) if s > 0 else (-w / 2, -w / 2 + aw)
        soft("arm", x0, x1, ya, yb, hem, ah, r=0.045 if st["cover"] else 0.03, puff=0.06 if st["cover"] else 0.03, folds=folds,
             flare=0.01 if st["cover"] else 0.0, seed=4 + s)
    # Seat cushions, and the chaise's long one.
    xa, xb = -w / 2 + aw, w / 2 - aw
    if side > 0:
        xb = w / 2 - cw
    elif side < 0:
        xa = -w / 2 + cw
    if side:
        ca, cb = (w / 2 - cw, w / 2 - aw) if side > 0 else (-w / 2 + aw, -w / 2 + cw)
        soft("seat", ca + 0.005, cb - 0.005, y0 + back_t - 0.02, y0 + long - 0.01, base_top - 0.01, top + 0.01, r=0.045,
             puff=0.08, sag=0.015, cuts=8, seed=7)
    n = max(1, round((xb - xa) / 1.0)) if style == "boucle" else max(1, round((xb - xa) / 0.78))
    sw = (xb - xa) / n
    for i in range(n):
        x0 = xa + i * sw
        soft("seat", x0 + 0.005, x0 + sw - 0.005, y0 + back_t - 0.02, y0 + d - 0.005, base_top - 0.01, top + 0.01, r=0.045,
             puff=0.08, sag=0.015, cuts=7, seed=8 + i)
    # Loose back cushions across the whole back, their feet on the seat's
    # back edge, reclining on the frame (their tops towards -Y).
    bx0, bx1 = -w / 2 + aw + 0.01, w / 2 - aw - 0.01
    n = max(2, round((bx1 - bx0) / (0.9 if style == "boucle" else 0.72)))
    bw = (bx1 - bx0) / n
    ct = 0.27 if style == "boucle" else 0.22
    hgt = 0.52 if style == "boucle" else 0.49
    gap = 0.03 if style == "boucle" else 0.01
    lean = 0.22
    foot_y = y0 + back_t + (0.12 if style == "boucle" else 0.10)
    for i in range(n):
        cx = bx0 + (i + 0.5) * bw
        parts.append(_pillow("cushion", (bw - gap, ct, hgt), _lean((cx, foot_y, top - 0.04), hgt, lean), col, f,
                             rot=(lean, 0, 0), r=0.08 if style == "boucle" else 0.07, puff=0.3 if style == "boucle" else 0.2,
                             crease=cr * 1.4, cuts=8, seed=12 + i, axis=1))
    # Throw cushions, standing on the seat and leaning back on the back
    # cushions, each one in front of the one it overlaps.
    pm = [mats[p] for p in st["pillows"]]
    if style == "boucle":
        far = bx1 if side <= 0 else bx0
        sgn = -1 if far > 0 else 1
        spots = [(far + sgn * 0.28, pm[1], 0.5, -0.2), (far + sgn * 0.62, pm[0], 0.45, 0.15),
                 (far + sgn * 0.98, pm[1], 0.5, -0.1)]
    else:
        spots = []
        for x, sgn in ((bx0, 1), (bx1, -1)):
            spots += [(x + sgn * 0.27, pm[0], 0.56, 0.1 * sgn), (x + sgn * 0.52, pm[1], 0.46, -0.12 * sgn)]
    back_front = foot_y + ct * (1.3 if style == "boucle" else 1.2) / 2 * math.cos(lean) - 0.04 * math.sin(lean)
    rest = [p for p in parts if p.name.startswith("cushion")]
    pillows = []
    for k, (x, m, size, yaw) in enumerate(spots):
        # Plump, domed and reclining well back (render 19).
        a = 0.40
        th = (0.17 if size > 0.48 else 0.15) * 1.15
        row = k % 2 if style != "boucle" else (1 if k == 1 else 0)
        yy = back_front + th / 2 * math.cos(a) + size * 0.46 * math.sin(a) - 0.05 + row * 0.15
        pillows.append((row, _case_pillow("pillow", size, size * 0.92, th, _lean((x, yy, top - 0.03), size * 0.92, a), col, m,
                                          rot=(a, 0, yaw), seed=20 + k, crease=0.008, pull=0.07, profile="dome")))
    # Each resting on the back cushions, the front row on the one behind it.
    for row, p in sorted(pillows, key=lambda e: e[0]):
        _rest(p, rest, (0, 1, 0))
        rest.append(p)
    parts += [p for _, p in pillows]
    return parts


def sofa_corner(col, mats, w=2.36, ret=2.30, depth=0.96, style="linen", ret_seats=1):
    """A corner sofa with no chaise, backed on two walls (plans AB1 and A0):
    a run `w` along X with its back on the -Y edge and, at its -X end, a
    return coming forward to the +Y edge (`ret` from back to front) with its
    back along the -X edge, the back wrapping the corner. Both legs `depth`
    deep, a slim track arm closing each free end. Built as sofa() is, in its
    fabrics: a frame under a cover (bouclé: on a dark plinth), seat cushions
    — the corner square, two on the run, `ret_seats` on the return — loose
    back cushions reclining on both backs, and throw cushions leaning back:
    a pair across the corner, more at the run's free end."""
    st = SOFAS[style]
    f = mats[st["fabric"]]
    aw, ah, bh, top = 0.15, st["arm_h"], st["back_h"], st["seat_top"]
    cr = st["crease"]
    cover = st["cover"]
    back_t = 0.17
    base_top = top - 0.17
    hem = 0.012 if cover else 0.05
    folds = 0.01 if cover else 0.0
    flare = 0.012 if cover else 0.0
    e = 0.012 if cover else 0.004            # the cover's creases stand that far proud
    x0, x1 = -w / 2 + e, w / 2 - e           # the return's outer side, the run's free end
    y0, y1 = -ret / 2 + e, ret / 2 - e       # the back, the return's free end
    xr, yr = x0 + depth, y0 + depth          # the return's and the run's seat fronts
    parts = []

    def soft(name, xa, xb, ya, yb, za, zb, m=f, **kw):
        kw.setdefault("crease", cr)
        parts.append(_pillow(name, (xb - xa, yb - ya, zb - za), ((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2), col, m, **kw))

    # The frames under the seats: the run's, through the corner, and the return's before it.
    soft("base", x0 + 0.02, x1 - aw + 0.02, y0 + 0.02, yr, hem, base_top, r=0.03, puff=0.05, folds=folds, flare=flare, seed=1)
    soft("base", x0 + 0.02, xr, yr - 0.1, y1 - aw + 0.02, hem + 0.002, base_top - 0.003, r=0.03, puff=0.05, folds=folds,
         flare=flare, seed=2)
    if not cover:
        # Bouclé: a recessed dark plinth on hidden feet.
        parts.append(_block(col, mats["kitchen_gap"], x0 + 0.08, x1 - aw, y0 + 0.08, yr - 0.06, 0, hem + 0.01, "plinth"))
        parts.append(_block(col, mats["kitchen_gap"], x0 + 0.08, xr - 0.06, yr - 0.06, y1 - aw, 0, hem + 0.01, "plinth"))
    # The backs, wrapping the corner, and the arms at the free ends.
    bk = bh - 0.09
    soft("back", x0, x1 - aw + 0.02, y0, y0 + back_t, base_top - 0.02, bk, r=0.05, puff=0.08, folds=folds * 0.5, seed=3)
    soft("back", x0, x0 + back_t, y0 + back_t - 0.04, y1 - aw + 0.02, base_top - 0.02, bk, r=0.05, puff=0.08,
         folds=folds * 0.5, seed=4)
    arm = dict(r=0.045 if cover else 0.03, puff=0.06 if cover else 0.03, folds=folds, flare=0.01 if cover else 0.0)
    soft("arm", x1 - aw, x1, y0, yr, hem, ah, seed=5, **arm)
    soft("arm", x0, xr, y1 - aw, y1, hem, ah, seed=6, **arm)
    # Seat cushions: the corner square, two on the run, the return's.
    sx0, sy0 = x0 + back_t - 0.02, y0 + back_t - 0.02
    seat = dict(r=0.045, puff=0.08, sag=0.015, cuts=7)
    soft("seat", sx0, xr - 0.005, sy0, yr - 0.005, base_top - 0.01, top + 0.01, seed=7, **seat)
    sw = (x1 - aw - xr) / 2
    for i in range(2):
        xa = xr + i * sw
        soft("seat", xa + 0.005, xa + sw - 0.005, sy0, yr - 0.005, base_top - 0.01, top + 0.01, seed=8 + i, **seat)
    sl = (y1 - aw - yr) / ret_seats
    for i in range(ret_seats):
        ya = yr + i * sl
        soft("seat", sx0, xr - 0.005, ya + 0.005, ya + sl - 0.005, base_top - 0.01, top + 0.01, seed=10 + i, **seat)
    # Loose back cushions, their feet on the seats' back edges, reclining on
    # the backs: along the rear into the corner, then along the return's
    # back from in front of the rear row's first one (their tops towards -X).
    ct = 0.27 if style == "boucle" else 0.22
    hgt = 0.52 if style == "boucle" else 0.49
    gap = 0.03 if style == "boucle" else 0.01
    puff = 0.3 if style == "boucle" else 0.2
    lean = 0.22
    foot = back_t + 0.10                     # in from the backs' outer faces
    face = foot + ct * (1 + puff) / 2        # the cushions' fronts, at their feet
    kw = dict(r=0.08 if style == "boucle" else 0.07, puff=puff, crease=cr * 1.4, cuts=8, axis=1)
    pitch = 0.9 if style == "boucle" else 0.72
    ra, rb = x0 + back_t + 0.01, x1 - aw - 0.01
    n = max(2, round((rb - ra) / pitch))
    bw = (rb - ra) / n
    for i in range(n):
        parts.append(_pillow("cushion", (bw - gap, ct, hgt), _lean((ra + (i + 0.5) * bw, y0 + foot, top - 0.04), hgt, lean), col, f,
                             rot=(lean, 0, 0), seed=12 + i, **kw))
    rear = parts[-n:]
    sa, sb = y0 + face + 0.005, y1 - aw - 0.01
    n = max(1, round((sb - sa) / pitch))
    bw = (sb - sa) / n
    for i in range(n):
        loc = (x0 + foot - hgt / 2 * math.sin(lean), sa + (i + 0.5) * bw, top - 0.04 + hgt / 2 * math.cos(lean))
        parts.append(_pillow("cushion", (bw - gap, ct, hgt), loc, col, f, rot=(lean, 0, -PI / 2), seed=17 + i, **kw))
    ret_row = parts[-n:]
    rest = rear + ret_row
    # Throw cushions standing on the seat, leaning back on the back cushions:
    # a big one set across the corner with a smaller one before it, and the
    # run's free end dressed as sofa()'s ends are.
    pm = [mats[p] for p in st["pillows"]]
    big, small = (pm[1], pm[0]) if style == "boucle" else (pm[0], pm[1])
    a = 0.40
    r2 = 1 / math.sqrt(2)
    cx, cy = x0 + face, y0 + face            # where the two rows' fronts meet
    for k, (m, size, row, lat, yaw) in enumerate(((big, 0.56, 0, 0.0, 0.0), (small, 0.46, 1, 0.1, 0.12))):
        th = (0.17 if size > 0.48 else 0.15) * 1.15
        h = size * 0.92
        dist = (size + th) / 2 - 0.03 + row * 0.15
        fx, fy = cx + dist * r2 + lat * r2, cy + dist * r2 - lat * r2
        loc = (fx - h / 2 * math.sin(a) * r2, fy - h / 2 * math.sin(a) * r2, top - 0.03 + h / 2 * math.cos(a))
        p = _case_pillow("pillow", size, h, th, loc, col, m, rot=(a, 0, -PI / 4 + yaw), seed=24 + k, crease=0.008, pull=0.07,
                         profile="dome")
        parts.append(p)
        if row:
            # The small one before it, touching it.
            _rest(p, rest, (r2, r2, 0))
        else:
            # The big one leaning on both backs: in to the return's cushions, then back to the rear row's.
            _rest(p, ret_row, (1, 0, 0))
            _rest(p, rear, (0, 1, 0))
        rest.append(p)
    back_front = y0 + foot + ct * (1.3 if style == "boucle" else 1.2) / 2 * math.cos(lean) - 0.04 * math.sin(lean)
    ends = [(rb - 0.28, big, 0.5, -0.12, 0)] if style == "boucle" else [(rb - 0.27, big, 0.56, -0.1, 0),
                                                                         (rb - 0.52, small, 0.46, 0.12, 1)]
    for k, (x, m, size, yaw, row) in enumerate(ends):
        th = (0.17 if size > 0.48 else 0.15) * 1.15
        yy = back_front + th / 2 * math.cos(a) + size * 0.46 * math.sin(a) - 0.05 + row * 0.15
        p = _case_pillow("pillow", size, size * 0.92, th, _lean((x, yy, top - 0.03), size * 0.92, a), col, m,
                         rot=(a, 0, yaw), seed=28 + k, crease=0.008, pull=0.07, profile="dome")
        parts.append(p)
        _rest(p, rest, (0, 1, 0))
        rest.append(p)
    return parts


# ---------------------------------------------------------------------
# Kitchens: handleless, as the renders draw them
# ---------------------------------------------------------------------

FULL = 2.74      # full-height units: a centimetre under the flats' 2.75 m ceilings
K_TOP = 0.92     # the worktop's surface
K_WT = 0.02      # its thickness: a slim slab, its edge eased
K_D = 0.60       # base and tall units, wall to the face of their fronts
K_PL = 0.08      # the recessed plinth
K_RAIL = 0.87    # the base fronts' top; the channel under the worktop above it
K_WALL = 1.52    # the ochre wall units' underside
GAP = 0.0015     # half a joint between two fronts (3 mm)
FT = 0.019       # a front's thickness
BOARD = 0.018    # a carcass board: the sides, bottoms, backs, rails and shelves behind the fronts
K_TRAY = 0.5     # a base unit's drawer tray, deep; it slides out three quarters of that
#: How far a fitted door swings: a right angle, about the outer edge of its
#: face on the side it hangs. Open so far it stands in front of its own
#: cupboard, clear of the front, the wall or the tall unit beside it and of
#: a neighbour's door open beside it, whichever side either hangs; any
#: further, a door at a wall end swings into the wall, two hung on one
#: joint cross, and one beside a drawer stands in the drawer's way (the
#: room doors' leaves crossing in the corrections log, 2026-10-03/04).
K_SWING = PI / 2
#: The kinds of base module whose fronts hang on hinges (_base_units).
HUNG = ("door", "sink", "fridge")


def _slab(col, mat, xa, xb, za, zb, face, t=FT, name="front"):
    """A flat lacquered front from xa to xb, za to zb, its face at y = `face`
    (towards +Y), a hairline joint round it."""
    return g.box(name, (xb - xa - 2 * GAP, t, zb - za - 2 * GAP), loc=((xa + xb) / 2, face - t / 2, (za + zb) / 2),
                 col=col, mat=mat, bevel=0.0012, segments=1)


def _block(col, mat, xa, xb, ya, yb, za, zb, name="carcass", bevel=0.0):
    return g.box(name, (xb - xa, yb - ya, zb - za), loc=((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2), col=col, mat=mat,
                 bevel=bevel, segments=1 if bevel else 2)


# ---------------------------------------------------------------------
# What is behind the fronts: hollow carcasses, drawers on trays, fridges
# ---------------------------------------------------------------------

def _board(col, inside, edge, xa, xb, ya, yb, za, zb, name="carcass", up=False):
    """A carcass board, white (`inside`) but for its front edge — its face
    towards +Y, which shows through the joints between the fronts — in
    `edge`, the colour the solid carcass had there, and with `up` its top
    too (a tall unit's, seen from above where the view leaves the ceiling
    off): hollowed, a shut kitchen still looks as it did, and it costs no
    triangle (a face given another material)."""
    board = _block(col, inside, xa, xb, ya, yb, za, zb, name)
    if edge is not None and edge is not inside:
        board.data.materials.append(edge)
        for face in board.data.polygons:
            if face.normal.y > 0.9 or (up and face.normal.z > 0.9):
                face.material_index = 1
    return board


def _faced(col, mat, xa, xb, ya, yb, za, zb, name="carcass", **faces):
    """A board in `mat` but for the faces named in `faces` — front (+Y),
    back, left (-X), right, top, bottom — each in a material of its own: a
    closet's board white inside, oak where it stands in for the block it
    was cut from, dark where a joint looks in. A face given another
    material, no triangle more (as _board's)."""
    board = _block(col, mat, xa, xb, ya, yb, za, zb, name)
    ways = {"front": (0, 1, 0), "back": (0, -1, 0), "left": (-1, 0, 0), "right": (1, 0, 0), "top": (0, 0, 1), "bottom": (0, 0, -1)}
    slots = [mat]
    for side, m in faces.items():
        if m is None or m is mat:
            continue
        if m not in slots:
            board.data.materials.append(m)
            slots.append(m)
        n = ways[side]
        for face in board.data.polygons:
            if face.normal.x * n[0] + face.normal.y * n[1] + face.normal.z * n[2] > 0.9:
                face.material_index = slots.index(m)
    return board


def _carcass(col, mats, edge, xa, xb, za, zb, d, shelves=(), top=False, rails=(), inside=None):
    """A cupboard's carcass from xa to xb and za to zb, its back on the wall
    (y = 0) and its front open at y = `d`, 18 mm boards, white inside: two
    sides, a bottom, a back, a top if asked for (a base unit's is its
    worktop), front `rails` (z0, z1) — the channels between handleless
    drawers and under the worktop, in `edge` all over their face — and
    `shelves` at those heights, a centimetre back from the front. A
    finished end panel beside it stays as it was, the board inside it."""
    white = mats["cab_white"] if inside is None else inside
    t = BOARD
    ia, ib = xa + t, xb - t
    lo, hi = za + t, zb - t if top else zb
    parts = [_board(col, white, edge, xa, ia, 0, d, za, zb), _board(col, white, edge, ib, xb, 0, d, za, zb),
             _board(col, white, edge, ia, ib, 0, d, za, lo), _board(col, white, None, ia, ib, 0, t, lo, hi, "back")]
    if top:
        parts.append(_board(col, white, edge, ia, ib, 0, d, hi, zb))
    for z0, z1 in rails:
        parts.append(_board(col, edge, edge, ia, ib, d - t, d, z0, z1, "rail"))
    for z in shelves:
        parts.append(_board(col, white, None, ia + 0.001, ib - 0.001, t - 0.001, d - 0.01, z - t / 2, z + t / 2, "shelf"))
    return parts


def _shelves(lo, hi, pitch=0.38):
    """Shelf heights evenly up a cupboard whose inside runs from lo to hi:
    one every `pitch` or so, at least one."""
    n = max(1, int((hi - lo) / pitch))
    return [lo + (hi - lo) * k / (n + 1) for k in range(1, n + 1)]


def _hang(parts, xa, xb, face, side, col, label="door", swing=K_SWING):
    """Hang a front (its `parts`: the front and whatever is fixed to it)
    from xa to xb on its `side` edge (-1 its -X, +1 its +X), swinging out
    towards +Y by `swing` (K_SWING) about the outer corner of its face, a
    joint's width in from that edge (geometry.hinged)."""
    if side < 0:
        return g.hinged(parts, (xa + GAP, face, 0.0), swing, col, label=label)
    return g.hinged(parts, (xb - GAP, face, 0.0), -swing, col, label=label)


def _hands(modules, stops, kinds=HUNG):
    """Which edge each door of a run hangs on, -1 its -X and +1 its +X:
    {the index of its module in `modules` — (kind, xa, xb) along X —: a
    side for each of its doors}, for the modules of `kinds`.

    As a kitchen is fitted: away from what the run ends against (`stops`,
    left and right: a wall, a tall unit, another leg or another piece), so
    an open door stands to the room's side of its cupboard, not against the
    wall or the tall unit beside it — every door of the run the same way
    round, away from its nearer stop where it has two; with none, each
    towards the nearer end of the run. A sink's two doors open from the
    middle, and so do two doors of a width side by side, unless one of
    them would hang at a stop, or on the joint the door beside them hangs
    on: two doors hung on one joint read as a pair the wrong way out."""
    lo, hi = modules[0][1], modules[-1][2]
    near = lambda a, b: abs(a - b) < 1e-6   # noqa: E731

    def way(xa, xb):
        c = (xa + xb) / 2
        if stops[0] and stops[1]:
            return 1 if c - lo <= hi - c else -1
        if stops[0] or stops[1]:
            return 1 if stops[0] else -1
        return -1 if c - lo < hi - c else 1

    def free(i, j):
        """Neither outer edge of modules i..j at a stop, nor on a joint a
        door beside them hangs on (as it would the run's way)."""
        xa, xb = modules[i][1], modules[j][2]
        if (stops[0] and near(xa, lo)) or (stops[1] and near(xb, hi)):
            return False
        before = modules[i - 1] if i > 0 else None
        after = modules[j + 1] if j + 1 < len(modules) else None
        if before and before[0] in kinds and near(before[2], xa) and way(*before[1:]) > 0:
            return False
        return not (after and after[0] in kinds and near(after[1], xb) and way(*after[1:]) < 0)

    hands = {}
    for i, (kind, xa, xb) in enumerate(modules):
        if kind not in kinds or i in hands:
            continue
        if kind == "sink" and xb - xa > 0.75:
            hands[i] = (-1, 1) if free(i, i) else (way(xa, xb),) * 2
            continue
        if kind == "door" and i + 1 < len(modules):
            nk, na, nb = modules[i + 1]
            if nk == "door" and near(xb, na) and abs((xb - xa) - (nb - na)) < 0.01 and free(i, i + 1):
                hands[i], hands[i + 1] = (-1,), (1,)
                continue
        hands[i] = (way(xa, xb),)
    return hands


def _tall_hand(left, right):
    """Which edge a column's doors hang on, from what stands at either side
    of it: "wall" (the end of the run against a wall or another piece),
    "tall" (another column), "base" (the base units) or "open" (nothing).
    Away from a wall, then from another column; a column with nothing at
    one side hangs there, so it opens away from the worktop, as a fridge
    should; two side by side at an open end open from the middle."""
    if left == "wall":
        return 1
    if right == "wall":
        return -1
    if left == "tall" or right == "tall":
        return 1 if left == "tall" else -1
    if left == "open" or right == "open":
        return -1 if left == "open" else 1
    return -1


def _sides_of(run, i, walls):
    """What stands either side of the run's module `i` (_tall_hand's words),
    `run` (kind, xa, xb) along X with its columns' kinds "column", "oven_col"
    or "fridge_col", and `walls` (left, right) True where the run ends
    against a wall or another piece."""
    tall = ("column", "oven_col", "fridge_col")
    left = ("wall" if walls[0] else "open") if i == 0 else ("tall" if run[i - 1][0] in tall else "base")
    right = ("wall" if walls[1] else "open") if i == len(run) - 1 else ("tall" if run[i + 1][0] in tall else "base")
    return left, right


def _drawer(col, mats, front, xa, xb, za, zb, face, label="drawer", tub=False, depth=K_TRAY):
    """A drawer of a hollow base unit from xa to xb (the unit's own width)
    and za to zb: its front, and the tray it slides out on behind it — a
    white floor, sides and back, inside the carcass's boards and clear of the
    rails between drawers — sliding out towards +Y by three quarters of its
    `depth`. `tub` makes it a fridge drawer's: an insulated white tub, its
    walls 2.5 cm thick."""
    parts = [_slab(col, front, xa, xb, za, zb, face)]
    white = mats["acrylic_white"] if tub else mats["cab_white"]
    t = 0.025 if tub else 0.012
    x0, x1 = xa + BOARD + 0.006, xb - BOARD - 0.006
    y1 = face - FT + 0.001                      # a millimetre into the front
    y0 = y1 - depth
    z0, z1 = za + 0.02, zb - 0.04
    parts += [_block(col, white, x0, x1, y0, y1, z0, z0 + t, "tray"),
              _block(col, white, x0, x0 + t, y0, y1, z0 + t, z1, "tray"),
              _block(col, white, x1 - t, x1, y0, y1, z0 + t, z1, "tray"),
              _block(col, white, x0 + t, x1 - t, y0, y0 + t, z0 + t, z1, "tray")]
    if tub:
        # Its own front wall behind the kitchen's: a tray's front is the drawer front.
        parts.append(_block(col, white, x0 + t, x1 - t, y1 - t - 0.002, y1 - 0.002, z0 + t, z1, "tray"))
    return g.sliding(parts, ((xa + xb) / 2, face, (za + zb) / 2), (0, 1), depth * 0.75, col, label=label)


def _fridge(col, mats, xa, xb, lo, hi, face, bins=3, light=3.0):
    """An integrated fridge in the cupboard whose opening runs from xa to
    xb and lo to hi, behind a front whose face is at y = `face`: a white
    liner, its walls 3 cm thick, glass shelves with white lips over a
    crisper at its foot, and a light at the top of its mouth shining down
    and out (the "light" fixture, as joinery.fridge's: Openables lights it
    as far as the fridge's doors are open). Returns what stays, and the
    appliance's own door, which the kitchen front is hung on and swings
    with it: white, a grey seal round it pressing on the liner's mouth,
    `bins` bins on its inside — each 9 cm deep, in front of the shelves,
    clear of the liner's walls as it swings."""
    liner, glass, seal = mats["acrylic_white"], mats["glass"], mats["seal"]
    w = 0.03
    yl = face - FT - 0.051          # the liner's mouth, room in front of it for the door, its seal and a millimetre
    yd0, yd1 = yl + 0.007, face - FT + 0.001
    yb = yd0 - 0.09                 # the bins' backs, and a centimetre in front of them the shelves'
    back = BOARD + w
    stay = [_block(col, liner, xa, xa + w, BOARD, yl, lo, hi, "liner"), _block(col, liner, xb - w, xb, BOARD, yl, lo, hi, "liner"),
            _block(col, liner, xa + w, xb - w, BOARD, yl, lo, lo + w, "liner"),
            _block(col, liner, xa + w, xb - w, BOARD, yl, hi - w, hi, "liner"),
            _block(col, liner, xa + w, xb - w, BOARD, back, lo + w, hi - w, "liner")]
    ia, ib, floor, roof = xa + w, xb - w, lo + w, hi - w

    def shelf(z):
        return [_block(col, glass, ia + 0.002, ib - 0.002, back - 0.001, yb - 0.01, z - 0.003, z + 0.003, "shelf"),
                _block(col, liner, ia + 0.002, ib - 0.002, yb - 0.028, yb - 0.01, z - 0.009, z + 0.013, "shelf_lip")]

    # The crisper: a clear front standing on the liner's floor, under a shelf for its lid.
    crisp = floor + 0.2
    stay.append(_block(col, glass, ia + 0.006, ib - 0.006, yb - 0.026, yb - 0.022, floor - 0.001, crisp - 0.01, "crisper"))
    stay += shelf(crisp)
    for z in _shelves(crisp, roof - 0.04, pitch=0.33):
        stay += shelf(z)
    stay.append(g.fixture("light", ((xa + xb) / 2, yl - 0.07, roof - 0.04),
                          {"light": {"power": light, "color": "#eef4ff", "reach": 1.8 if hi - lo > 1 else 1.0}}, col,
                          aim=(0, 0.45, -1)))

    door = [_block(col, liner, xa + 0.006, xb - 0.006, yd0, yd1, lo + 0.006, hi - 0.006, "fridge_door")]
    s0, s1 = yl + 0.001, yd0 + 0.001
    a, b, c, d = xa + 0.004, xb - 0.004, lo + 0.004, hi - 0.004
    door += [_block(col, seal, a, b, s0, s1, c, c + 0.02, "seal"), _block(col, seal, a, b, s0, s1, d - 0.02, d, "seal"),
             _block(col, seal, a, a + 0.02, s0, s1, c + 0.02, d - 0.02, "seal"),
             _block(col, seal, b - 0.02, b, s0, s1, c + 0.02, d - 0.02, "seal")]
    ba, bb = ia + 0.025, ib - 0.025
    for k in range(bins):
        z = floor + 0.12 + (roof - floor - 0.32) * k / max(1, bins - 1)
        door += [_block(col, liner, ba, bb, yb, yd0 + 0.001, z, z + 0.01, "bin"),
                 _block(col, liner, ba, bb, yb, yb + 0.008, z + 0.01, z + 0.075, "bin")]
    return stay, door


def _holed_slab(name, x0, x1, y0, y1, z0, z1, hole, col, mat, ease=0.003):
    """A slab with a rectangular hole (an undermount sink's), its outer
    edges eased and the hole's left sharp, in one piece so no joint shows."""
    import bmesh
    hx0, hx1, hy0, hy1 = hole
    bm = bmesh.new()
    outer = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    inner = [(hx0, hy0), (hx1, hy0), (hx1, hy1), (hx0, hy1)]
    ot = [bm.verts.new((x, y, z1)) for x, y in outer]
    it = [bm.verts.new((x, y, z1)) for x, y in inner]
    ob = [bm.verts.new((x, y, z0)) for x, y in outer]
    ib = [bm.verts.new((x, y, z0)) for x, y in inner]
    for k in range(4):
        n = (k + 1) % 4
        bm.faces.new((ot[k], ot[n], it[n], it[k]))          # top, up
        bm.faces.new((ob[k], ib[k], ib[n], ob[n]))          # underside, down
        bm.faces.new((ob[k], ob[n], ot[n], ot[k]))          # outside edge
        bm.faces.new((ib[k], it[k], it[n], ib[n]))          # the hole's edge
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if ease:
        edges = [e for e in bm.edges if all(v in ot or v in ob for v in e.verts)]
        bmesh.ops.bevel(bm, geom=edges, offset=ease, segments=2, profile=0.5, affect="EDGES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, None, None, False)


def _lathe(name, profile, col, mat, loc=(0, 0, 0), segments=16, closed=True, sharp=(), center_dz=-0.004):
    """A turned shape from (radius, height) points, bottom to top and over
    the lip into the mouth: vases, jugs, bowls, mugs, candlesticks."""
    loops = [[(loc[0] + r * math.cos(2 * PI * i / segments), loc[1] + r * math.sin(2 * PI * i / segments), loc[2] + z)
              for i in range(segments)] for r, z in profile]
    last_z = profile[-1][1]
    return g.loft(name, loops, center=(loc[0], loc[1], loc[2] + last_z + center_dz) if closed else None, sharp=sharp, col=col,
                  mat=mat)


def _gooseneck(col, mats, x, y, z, mat, h=0.32, reach=0.21, swan=False, towards=1, floor=None, hot=True):
    """A kitchen mixer on the worktop at `z`: a pipe up, bent over (`swan`:
    one round arch, else two tight right-angled bends) and down over the
    bowl towards `towards` (+1: +Y), a lever on its side. Given the bowl's
    `floor`, the water's fixtures too: the pipe's open end ("sink",
    running hot unless `hot` is False) and the mixer as the box a visitor
    turns it on by (geometry.water, control_round)."""
    t = towards
    pts = [(y, z + 0.02), (y, z + h * 0.5)]
    if swan:
        r = reach / 2
        for k in range(13):
            a = PI - PI * k / 12
            pts.append((y + t * (r + r * math.cos(a)), z + h - r + r * math.sin(a)))
        pts.append((y + t * reach, z + h - r - 0.06))
    else:
        r = 0.035
        pts.append((y, z + h - r))
        for k in range(1, 6):
            a = PI - (PI / 2) * k / 5
            pts.append((y + t * (r + r * math.cos(a)), z + h - r + r * math.sin(a)))
        pts.append((y + t * (reach - r), z + h))
        for k in range(1, 6):
            a = PI / 2 - (PI / 2) * k / 5
            pts.append((y + t * (reach - r + r * math.cos(a)), z + h - r + r * math.sin(a)))
        pts.append((y + t * reach, z + h - 0.075))
    m = mats[mat]
    parts = [
        g.cylinder("tap_base", 0.024, 0.03, loc=(x, y, z + 0.015), col=col, mat=m, segments=16),
        g.sweep("tap_neck", [(x, yy, zz) for yy, zz in pts], 0.0105, sides=10, col=col, mat=m),
        g.cylinder("tap_lever", 0.006, 0.07, loc=(x + 0.04, y, z + 0.12), rot=(0, PI / 2 - 0.25, 0), col=col, mat=m,
                   segments=8),
        g.cylinder("tap_hub", 0.016, 0.03, loc=(x + 0.02, y, z + 0.11), rot=(0, PI / 2, 0), col=col, mat=m, segments=12),
    ]
    if floor is not None:
        oy, oz = pts[-1]                         # the pipe's open end, pointing down
        ys = (y - t * 0.024, oy + t * 0.011)
        parts += [g.water((x, oy, oz), "tap", oz - floor, (0.14, 0.14), "sink", hot=hot, r=0.008),
                  g.control_round((x - 0.024, min(ys), z), (x + 0.075, max(ys), z + h + 0.011), ["sink"])]
    return parts


def _undermount(col, mats, cx, cy, w, d, tap, swan, depth=0.19, h=0.32):
    """A single bowl under the worktop's hole, a waste and a mixer `h` tall
    behind it, its water falling to the bowl's floor (_gooseneck)."""
    under = K_TOP - K_WT

    def ring(inset, z, r=0.035):
        return [(cx + px, cy + py, z) for px, py in g.rounded_rect(w - 2 * inset, d - 2 * inset, max(0.006, r - inset), 4)]

    parts = [g.loft("bowl", [ring(-0.012, under - 0.001), ring(0.0, under - 0.004), ring(0.004, under - depth + 0.02),
                             ring(0.025, under - depth)], center=(cx, cy, under - depth - 0.004), sharp=(0,), col=col,
                    mat=mats["sink_dark"])]
    parts.append(g.cylinder("waste", 0.035, 0.003, loc=(cx, cy, under - depth - 0.002), col=col, mat=mats["steel"],
                            segments=16))
    parts += _gooseneck(col, mats, cx, cy - d / 2 - 0.045, K_TOP, tap, h=h, swan=swan, reach=0.2 if swan else 0.19,
                        floor=under - depth)
    return parts


def _flush_hob(col, mats, cx, cy, w=0.6, d=0.52):
    """A black glass induction hob flush with the worktop, its zones faint."""
    parts = [g.box("hob", (w, d, 0.006), loc=(cx, cy, K_TOP - 0.0025), col=col, mat=mats["hob_glass"], bevel=0.0015,
                   segments=1)]
    zones = [(-0.25, 0.1, 0.1), (-0.25, -0.12, 0.085), (0.25, 0.1, 0.085), (0.25, -0.12, 0.1)] if w < 0.7 else \
        [(-0.3, 0.08, 0.1), (-0.3, -0.12, 0.09), (0.0, 0.0, 0.11), (0.3, 0.08, 0.09), (0.3, -0.12, 0.1)]
    for fx, fy, r in zones:
        x, y = cx + fx * w * (0.8 if w < 0.7 else 0.85), cy + fy * d / 0.52
        loops = [[(x + rr * math.cos(2 * PI * i / 28), y + rr * math.sin(2 * PI * i / 28), K_TOP + 0.0015) for i in range(28)]
                 for rr in (r, r - 0.004)]
        parts.append(g.loft("zone", loops, col=col, mat=mats["hob_ring"], smooth=False))
    parts.append(g.box("controls", (0.16, 0.025, 0.0008), loc=(cx, cy + d / 2 - 0.04, K_TOP + 0.0015), col=col,
                       mat=mats["hob_ring"]))
    return parts


def _builtin_oven(col, mats, cx, w, z0, z1, face, white=True):
    """A built-in oven between z0 and z1, its face at y = `face`: white
    with a fascia of three knobs over a dark glass door, or all black glass
    with a slim steel bar and a display."""
    h = z1 - z0
    body = mats["oven_white"] if white else mats["glass_black"]
    parts = [g.box("oven", (w - 0.006, 0.024, h - 0.006), loc=(cx, face - 0.012, (z0 + z1) / 2), col=col, mat=body,
                   bevel=0.002, segments=1)]
    if white:
        fz = z1 - 0.05
        parts.append(g.box("fascia", (w - 0.012, 0.003, 0.003), loc=(cx, face + 0.0005, z1 - 0.1), col=col,
                           mat=mats["kitchen_gap"]))
        for k, dx in enumerate((-0.2, -0.12, 0.2)):
            parts.append(g.cylinder("knob", 0.017, 0.02, loc=(cx + dx * w / 0.6, face + 0.009, fz), rot=(PI / 2, 0, 0), col=col,
                                    mat=mats["oven_white"], segments=14))
        parts.append(g.box("display", (0.07, 0.003, 0.025), loc=(cx + 0.04, face + 0.0005, fz), col=col, mat=mats["screen"]))
        parts.append(g.box("window", (w - 0.16, 0.003, h - 0.27), loc=(cx, face + 0.0005, z0 + 0.06 + (h - 0.27) / 2), col=col,
                           mat=mats["glass_black"]))
        parts.append(g.cylinder("handle", 0.0075, w - 0.18, loc=(cx, face + 0.022, z1 - 0.13), rot=(0, PI / 2, 0), col=col,
                                mat=mats["chrome"], segments=10))
        for s in (-1, 1):
            parts.append(g.cylinder("stay", 0.005, 0.022, loc=(cx + s * (w / 2 - 0.1), face + 0.011, z1 - 0.13),
                                    rot=(PI / 2, 0, 0), col=col, mat=mats["chrome"], segments=8))
    else:
        parts.append(g.box("display", (0.14, 0.003, 0.022), loc=(cx, face + 0.0005, z1 - 0.04), col=col, mat=mats["steel"]))
        parts.append(g.box("handle", (w - 0.1, 0.022, 0.014), loc=(cx, face + 0.011, z1 - 0.085), col=col, mat=mats["steel"],
                           bevel=0.004, segments=2))
        parts.append(g.box("window", (w - 0.08, 0.002, h - 0.2), loc=(cx, face + 0.0005, z0 + 0.04 + (h - 0.2) / 2), col=col,
                           mat=mats["sink_dark"]))
    return parts


def _base_units(col, mats, s, modules, depth=K_D, ends=(False, False), hob=None, sink=None, splash=None, plinth=True,
                splash_x=None, stops=None):
    """Base units along X facing +Y, their backs at y = 0: `modules` a list
    of (kind, xa, xb) — "door", "drawers", "sink", "dishwasher", "oven",
    "filler", "corner" (a blind corner's front, behind the leg standing
    across it), "fridge" (an integrated fridge behind its door) or
    "fridge_drawers" (drawers, the two deep ones a fridge's) — handleless
    (a channel under the worktop, one between each two drawers), on a
    recessed champagne plinth, under a slim worktop.

    Every cupboard is hollow, white inside (_carcass): a shelf behind a
    door, a tray behind each drawer, the bowl and its trap behind the
    sink's doors, a fridge behind a fridge's, a pan drawer under the oven.
    The dishwasher, the oven itself, a blind corner and a filler stay
    solid, their fronts shut. Whatever shows through the joints is in the
    fronts' colour, as the solid carcass was: the channel under the worktop
    and between the drawers reads as their own shadow (renders 18, 20).

    `ends` puts a panel on an open end; `stops` (left, right) says which
    ends stand against a wall, a tall unit or another leg — by default those
    without a panel — for the doors to hang away from (_hands); `hob` an x
    for a flush hob and its width; `sink` (x, w) an undermount bowl and its
    mixer; `splash` a height for a splashback in the scheme's material,
    along the whole run or `splash_x` (x0, x1)."""
    front, dark = mats[s["base"]], mats["kitchen_gap"]
    xa0, xb0 = modules[0][1], modules[-1][2]
    parts = []
    under = K_TOP - K_WT
    body = depth - FT - 0.001
    hands = _hands(modules, (not ends[0], not ends[1]) if stops is None else stops)
    top_rail = (K_RAIL - 0.03, under)
    for i, (kind, xa, xb) in enumerate(modules):
        if ends[0] and xa == xa0:
            parts.append(_block(col, front, xa, xa + 0.018, 0, depth, 0, under, "end"))
            xa += 0.018
        if ends[1] and xb == xb0:
            parts.append(_block(col, front, xb - 0.018, xb, 0, depth, 0, under, "end"))
            xb -= 0.018
        if plinth:
            parts.append(_block(col, mats["plinth_champagne"], xa, xb, 0, depth - 0.05, 0, K_PL, "plinth"))
        if kind in ("dishwasher", "filler", "corner"):
            parts.append(_block(col, front, xa, xb, 0, body, K_PL, under))
            parts.append(_slab(col, front, xa, xb, K_PL, K_RAIL, depth))
        elif kind in ("drawers", "fridge_drawers"):
            ch = 0.024
            avail = K_RAIL - K_PL - 2 * ch
            z, rails, fronts = K_PL, [top_rail], []
            for share in (0.39, 0.35, 0.26):           # bottom to top
                h = avail * share
                fronts.append((z, z + h))
                rails.append((z + h - 0.01, z + h + ch + 0.01))
                z += h + ch
            parts += _carcass(col, mats, front, xa, xb, K_PL, under, body, rails=rails[:-1])
            for k, (za, zb) in enumerate(fronts):
                cold = kind == "fridge_drawers" and k < 2
                parts += _drawer(col, mats, front, xa, xb, za, zb, depth, label="fridge" if cold else "drawer", tub=cold,
                                 depth=min(K_TRAY, body - 0.06))
            if kind == "fridge_drawers":
                # The fridge's light, at the top of its two drawers, shining down into them and out.
                parts.append(g.fixture("light", ((xa + xb) / 2, body - 0.1, fronts[1][1] - 0.02),
                                       {"light": {"power": 2.0, "color": "#eef4ff", "reach": 1.0}}, col, aim=(0, 0.45, -1)))
        elif kind == "oven":
            # The oven in its housing, a pan drawer under it.
            parts.append(_block(col, front, xa, xb, 0, body, 0.27, under))
            parts += _carcass(col, mats, front, xa, xb, K_PL, 0.27, body, rails=[(0.24, 0.27)])
            parts += _drawer(col, mats, front, xa, xb, K_PL, 0.27, depth, depth=0.45)
            parts += _builtin_oven(col, mats, (xa + xb) / 2, xb - xa, 0.27, K_RAIL, depth, white=s["oven"] == "white")
        else:
            inner = []
            if kind == "fridge":
                stay, inner = _fridge(col, mats, xa + BOARD, xb - BOARD, K_PL + BOARD, top_rail[0] - 0.005, depth, bins=2,
                                      light=2.0)
                parts += _carcass(col, mats, front, xa, xb, K_PL, under, body, rails=[top_rail]) + stay
            elif kind == "sink":
                # Open over the bowl, the trap under its waste and back to the wall.
                parts += _carcass(col, mats, front, xa, xb, K_PL, under, body, rails=[top_rail])
            else:
                parts += _carcass(col, mats, front, xa, xb, K_PL, under, body, rails=[top_rail],
                                  shelves=[(K_PL + under) / 2])
            label = "fridge" if kind == "fridge" else "door"
            sides = hands.get(i, (-1,))
            if len(sides) == 2:
                xm = (xa + xb) / 2
                parts += _hang([_slab(col, front, xa, xm, K_PL, K_RAIL, depth)], xa, xm, depth, sides[0], col)
                parts += _hang([_slab(col, front, xm, xb, K_PL, K_RAIL, depth)], xm, xb, depth, sides[1], col)
            else:
                parts += _hang([_slab(col, front, xa, xb, K_PL, K_RAIL, depth)] + inner, xa, xb, depth, sides[0], col,
                               label)
    top_d = depth + 0.02
    if sink:
        sx, sw = sink
        sd = 0.40
        cy = depth / 2 + 0.03
        hole = (sx - sw / 2, sx + sw / 2, cy - sd / 2, cy + sd / 2)
        parts.append(_holed_slab("worktop", xa0, xb0, 0, top_d, under, K_TOP, hole, col, mats[s["top"]]))
        parts += _undermount(col, mats, sx, cy, sw, sd, s["tap"], swan=s["tap"] == "brass_brushed", h=s.get("tap_h", 0.32))
        # The trap under the waste, back to the wall: what an open sink cupboard shows.
        waste = under - 0.19
        parts.append(g.sweep("trap", g.catmull_rom([(sx, cy, waste - 0.002), (sx, cy, waste - 0.12), (sx, cy - 0.04, waste - 0.2),
                                                    (sx, cy - 0.12, waste - 0.2), (sx, BOARD - 0.005, waste - 0.16)], steps=3),
                             0.02, sides=10, col=col, mat=mats["white_matte"]))
    else:
        parts.append(_block(col, mats[s["top"]], xa0, xb0, 0, top_d, under, K_TOP, "worktop", bevel=0.003))
    if hob:
        hx, hw = hob
        parts += _flush_hob(col, mats, hx, depth / 2 + 0.02, w=hw)
    if splash:
        sa, sb = splash_x or (xa0, xb0)
        parts.append(_block(col, mats[s["splash"]], sa, sb, 0, 0.012, K_TOP, splash, "splash"))
    return parts


def _tall(col, mats, xa, xb, mat, cuts, ovens=(), sides=(True, True), depth=K_D, top=FULL, hand=-1, fridge=False,
          shut=()):
    """A full-height column from xa to xb: its doors between the heights in
    `cuts`, a built-in oven in each (z0, z1, white) of `ovens`, finished
    side panels where `sides` says it shows, on the plinth.

    Hollow behind its doors, white inside, its boards' edges dark as the
    solid carcass was: a board at each cut, shelves about every 40 cm, the
    ovens in housings of their own. Its doors hang on its `hand` edge (-1
    its -X, +1 its +X: _tall_hand), but those whose lower edge is in `shut`
    (one another unit stands across); `fridge` makes the cupboard behind
    its lowest door an integrated fridge (_fridge), its door the fridge's."""
    m, dark = mats[mat], mats["kitchen_gap"]
    body = depth - FT - 0.001
    parts = [_block(col, mats["plinth_champagne"], xa, xb, 0, depth - 0.05, 0, K_PL, "plinth")]
    if sides[0]:
        parts.append(_block(col, m, xa, xa + 0.018, 0, depth, 0, top, "side"))
        xa += 0.018
    if sides[1]:
        parts.append(_block(col, m, xb - 0.018, xb, 0, depth, 0, top, "side"))
        xb -= 0.018
    white, t = mats["cab_white"], BOARD
    ia, ib = xa + t, xb - t
    parts += [_board(col, white, dark, xa, ia, 0, body, K_PL, top, up=True),
              _board(col, white, dark, ib, xb, 0, body, K_PL, top, up=True),
              _board(col, white, dark, ia, ib, 0, body, K_PL, K_PL + t),
              _board(col, white, dark, ia, ib, 0, body, top - t, top, up=True),
              _board(col, white, None, ia, ib, 0, t, K_PL + t, top - t, "back")]
    for z in cuts[1:-1]:
        parts.append(_board(col, white, dark, ia, ib, 0, body, z - t / 2, z + t / 2))
    cold = fridge
    for za, zb in zip(cuts, cuts[1:]):
        lo = za + (t if za == cuts[0] else t / 2)
        hi = zb - (t if zb == cuts[-1] else t / 2)
        if any(abs(za - o[0]) < 0.01 for o in ovens):
            parts.append(_block(col, dark, ia, ib, t, body, lo, hi, "housing"))
            continue
        front = [_slab(col, m, xa, xb, za, zb, depth)]
        if any(abs(za - z) < 0.01 for z in shut):
            parts += front
            continue
        if cold:
            stay, inner = _fridge(col, mats, ia, ib, lo, hi, depth, bins=4 if hi - lo > 1.7 else 3)
            parts += stay + _hang(front + inner, xa, xb, depth, hand, col, "fridge")
            cold = False
            continue
        parts += _carcass_shelves(col, mats, ia, ib, lo, hi, body)
        parts += _hang(front, xa, xb, depth, hand, col)
    for z0, z1, white_oven in ovens:
        parts += _builtin_oven(col, mats, (xa + xb) / 2, xb - xa, z0, z1, depth, white=white_oven)
    return parts


def _carcass_shelves(col, mats, ia, ib, lo, hi, body):
    """The shelves of a cupboard inside its boards, ia..ib and lo..hi."""
    white = mats["cab_white"]
    return [_board(col, white, None, ia + 0.001, ib - 0.001, BOARD - 0.001, body - 0.01, z - BOARD / 2, z + BOARD / 2, "shelf")
            for z in _shelves(lo, hi)]


def _wall_units(col, mats, s, spans, z0=K_WALL, z1=FULL, d=0.35, niche=None, hood=None, stops=(False, False)):
    """Wall cupboards from z0 to the ceiling, one door per span (xa, xb),
    handleless, their undersides in the doors' colour. `niche` (xa, xb, h)
    leaves an open box at the bottom of a span, framed in dark bronze;
    `hood` (xa, xb) hangs a slim pull-out extractor visor under a span.

    Each cupboard is hollow, white inside, a board between each two, their
    edges dark as the solid carcass was: shelves about every 40 cm (over
    the niche, or over the extractor's housing in the hood's), its door
    hung away from what the run ends against (`stops`, left and right: a
    tall unit or a wall; _hands). Beside a niche narrower than its cupboard
    the carcass stays solid behind fronts that stay shut."""
    m, dark, white, t = mats[s["upper"]], mats["kitchen_gap"], mats["cab_white"], BOARD
    xa0, xb0 = spans[0][0], spans[-1][1]
    body = d - FT - 0.001
    # Finished ends, the carcass between them.
    parts = [_block(col, m, xa0, xa0 + 0.018, 0, body, z0, z1, "side"), _block(col, m, xb0 - 0.018, xb0, 0, body, z0, z1, "side")]
    xa0, xb0 = xa0 + 0.018, xb0 - 0.018
    if niche:
        nx0, nx1, nh = niche
        # Its lining: cream inside, a thin bronze frame round its mouth.
        parts.append(_block(col, m, nx0, nx1, 0, 0.012, z0, z0 + nh, "niche"))
        parts.append(_block(col, m, nx0, nx1, 0, d, z0, z0 + 0.016, "niche"))
        parts.append(_block(col, m, nx0, nx1, 0, d, z0 + nh - 0.016, z0 + nh, "niche"))
        for xa, xb in ((nx0, nx0 + 0.016), (nx1 - 0.016, nx1)):
            parts.append(_block(col, m, xa, xb, 0, d, z0, z0 + nh, "niche"))
        bz = mats["bronze_dark"]
        f = 0.01
        parts += [_block(col, bz, nx0, nx1, d - 0.02, d + 0.001, z0, z0 + f, "frame"),
                  _block(col, bz, nx0, nx1, d - 0.02, d + 0.001, z0 + nh - f, z0 + nh, "frame"),
                  _block(col, bz, nx0, nx0 + f, d - 0.02, d + 0.001, z0, z0 + nh, "frame"),
                  _block(col, bz, nx1 - f, nx1, d - 0.02, d + 0.001, z0, z0 + nh, "frame")]
    parts.append(_block(col, m, xa0, xb0, 0, body, z0, z0 + 0.012, "underside"))
    # The carcass: a top, a board at each joint between two doors, a back
    # in each cupboard from its floor up (a niche keeps its own lining).
    parts.append(_board(col, white, dark, xa0, xb0, 0, body, z1 - t, z1, up=True))
    for (_, xb), (xa, _) in zip(spans, spans[1:]):
        parts.append(_board(col, white, dark, xa - t / 2, xa + t / 2, 0, body, z0 + 0.012, z1 - t))
    hands = _hands([("door", xa, xb) for xa, xb in spans], stops)
    for k, (xa, xb) in enumerate(spans):
        za, floor = z0, z0 + 0.012
        ia, ib = max(xa, xa0) + (t / 2 if k else 0), min(xb, xb0) - (t / 2 if k < len(spans) - 1 else 0)
        if niche and xa <= niche[0] + 0.001 and xb >= niche[1] - 0.001:
            za = floor = z0 + niche[2]
            for a, b in ((xa, niche[0]), (niche[1], xb)):
                if b - a > 0.03:
                    parts.append(_slab(col, m, a, b, z0, za, d))
                if b - a > 1e-4:
                    parts.append(_block(col, dark, max(a, ia), min(b, ib), t, body, z0 + 0.012, za))
        parts += [_board(col, white, dark, ia, ib, t, body, floor, floor + t),
                  _board(col, white, None, ia, ib, 0, t, floor + t, z1 - t, "back")]
        lo = floor + t
        if hood and xa <= hood[0] + 0.001 and xb >= hood[1] - 0.001:
            # The extractor's housing at the foot of the cupboard over its visor.
            parts.append(_block(col, mats["steel"], ia + 0.01, ib - 0.01, t, body - 0.03, lo, lo + 0.26, "extractor"))
            lo += 0.26
        parts += _carcass_shelves(col, mats, ia, ib, lo, z1 - t, body)
        parts += _hang([_slab(col, m, xa, xb, za, z1, d)], xa, xb, d, hands[k][0], col)
    if hood:
        hx0, hx1 = hood
        parts.append(_block(col, mats["bronze_dark"], hx0 + 0.005, hx1 - 0.005, 0.02, d + 0.01, z0 - 0.022, z0, "hood", bevel=0.002))
        parts.append(_block(col, mats["steel"], hx0 + 0.04, hx1 - 0.04, 0.04, d - 0.06, z0 - 0.0225, z0 - 0.02, "filter"))
    return parts


def _shelf_column(col, mats, mat, xa, xb, z0, z1, shelves, d=0.35):
    """An open column of shelves between two side panels, its back panelled."""
    m = mats[mat]
    parts = [_block(col, m, xa, xa + 0.018, 0, d, z0, z1, "side"), _block(col, m, xb - 0.018, xb, 0, d, z0, z1, "side"),
             _block(col, m, xa + 0.018, xb - 0.018, 0, 0.012, z0, z1, "back"),
             _block(col, m, xa + 0.018, xb - 0.018, 0, d, z1 - 0.018, z1, "top")]
    for z in shelves:
        parts.append(_block(col, m, xa + 0.018, xb - 0.018, 0.012, d - 0.01, z - 0.009, z + 0.009, "shelf"))
    return parts


def _mug(col, mats, x, y, z, mat="porcelain", side=1, turn=0.0):
    """A mug, its handle towards `side` (+1: +X), turned `turn` radians
    from there towards +Y (so mugs stood close in a row clear each other)."""
    parts = [_lathe("mug", [(0.036, 0.0), (0.04, 0.006), (0.041, 0.085), (0.037, 0.085), (0.036, 0.012)], col, mats[mat],
                    loc=(x, y, z), segments=14)]
    cx, cy = side * math.cos(turn), math.sin(turn)
    pts = [(x + cx * r, y + cy * r, z + h) for r, h in ((0.04, 0.068), (0.062, 0.064), (0.066, 0.045), (0.06, 0.025),
                                                         (0.04, 0.02))]
    parts.append(g.sweep("handle", pts, 0.005, sides=6, col=col, mat=mats[mat]))
    return parts


def _bowl(col, mats, x, y, z, r=0.07, h=0.05, mat="ceramic_grey"):
    return [_lathe("bowl", [(r * 0.45, 0.0), (r * 0.8, h * 0.3), (r, h), (r - 0.005, h), (r * 0.75, h * 0.35)], col, mats[mat],
                   loc=(x, y, z), segments=16)]


def _niche_props(col, mats, x0, y, shelf_z, length, flip=False):
    """What stands on the sage kitchen's three shelves, as render 20 has it,
    on shelves from `x0` along their `length` (+X). The piece faces +Y, so
    its -X end (x0) is the viewer's right, where the render has the jug,
    the four bowls and the mugs, by the tall units; `flip` mirrors it all
    for tall units at +X."""
    p = []
    lo, mid, hi = shelf_z
    t = 0.01
    s = 1 if flip else -1                               # towards the tall units' end (+X with `flip`)
    at = (lambda a: x0 + length - a) if flip else (lambda a: x0 + a)   # `a` from the tall units' end
    # Top: a slim patterned vase and a dark brown clay jug.
    p.append(_lathe("vase", [(0.03, 0), (0.032, 0.02), (0.03, 0.17), (0.022, 0.19), (0.02, 0.2), (0.016, 0.2)],
                    col, mats["ceramic_pattern"], loc=(at(0.32), y, hi + t), segments=14))
    p.append(_lathe("jug", [(0.05, 0), (0.075, 0.06), (0.08, 0.12), (0.06, 0.2), (0.042, 0.24), (0.05, 0.27),
                            (0.044, 0.27), (0.036, 0.24)], col, mats["clay_brown"], loc=(at(0.17), y, hi + t),
                    segments=18))
    # Its handle towards the vase, as in the render.
    p.append(g.sweep("jug_handle", [(at(0.17) - s * 0.045, y, hi + t + 0.24), (at(0.17) - s * 0.1, y, hi + t + 0.22),
                                    (at(0.17) - s * 0.095, y, hi + t + 0.14), (at(0.17) - s * 0.07, y, hi + t + 0.11)],
                     0.009, sides=6, col=col, mat=mats["clay_brown"]))
    # Middle: two off-white bottle vases, four grey-brown bowls.
    for k in range(2):
        p.append(_lathe("bottle", [(0.03, 0), (0.033, 0.03), (0.032, 0.12), (0.016, 0.16), (0.012, 0.2), (0.013, 0.205),
                                   (0.009, 0.205)], col, mats["porcelain_matte"], loc=(at(length - 0.12 - k * 0.1), y, mid + t),
                        segments=14))
    n = max(1, min(4, int((length - 0.35) / 0.125)))
    for k in range(n):
        p += _bowl(col, mats, at(0.06 + (n - k) * 0.125), y, mid + t, r=0.055, h=0.045)
    # Bottom: a stack of grey bowls and six white mugs, their handles right,
    # turned a little out so each clears the next mug.
    for k in range(3):
        p += _bowl(col, mats, at(length - 0.13), y, lo + t + k * 0.022, r=0.065 - k * 0.002, h=0.045)
    n = max(1, min(6, int((length - 0.3) / 0.1)))
    for k in range(n):
        p += _mug(col, mats, at(0.12 + (n - 1 - k) * 0.1), y - 0.01, lo + t, side=s, turn=0.75)
    return p


def _sage_niche(col, mats, s, xa, xb, top=1.96, shelf_from=None, shelf_len=1.1, shelf_z=(1.32, 1.60, 1.88),
                ceiling=FULL, props=True, flip=False):
    """The sage kitchen's recess over its sink: panelled behind, a plain
    board over the worktop, then recessed horizontal grooves every 8.5 cm
    from under the lowest shelf to `top` (just over the top shelf), plain
    above, as render 20 has it; three slim floating shelves
    `shelf_len` long from `shelf_from` (an x; +X along), set with jugs,
    bowls and mugs (`flip`: the tall units are at the shelves' +X end)."""
    m = mats[s["upper"]]
    parts = _grooved(col, mats, m, xa, xb, K_TOP, ceiling, stop=top)
    if shelf_from is not None:
        for zz in shelf_z:
            parts.append(_block(col, m, shelf_from, shelf_from + shelf_len, 0.018, 0.24, zz - 0.01, zz + 0.01, "shelf",
                                bevel=0.002))
        if props:
            parts += _niche_props(col, mats, shelf_from, 0.13, shelf_z, shelf_len, flip)
    return parts


def _hob_cabinet(col, mats, s, xa, xb, z0=1.55, d=0.42):
    """The sage kitchen's deep cabinet over the hob, one wide flap to the
    ceiling, and the panel under it: two plain boards, their joint in line
    with the lowest groove of the recess beside it (render 20)."""
    m = mats[s["upper"]]
    return [_block(col, mats["kitchen_gap"], xa + 0.018, xb - 0.018, 0, d - FT - 0.001, z0 + 0.016, FULL),
            _block(col, m, xa, xa + 0.018, 0, d, z0, FULL, "side"), _block(col, m, xb - 0.018, xb, 0, d, z0, FULL, "side"),
            _block(col, m, xa + 0.018, xb - 0.018, 0, d - FT - 0.001, z0, z0 + 0.016, "underside"),
            _slab(col, m, xa + 0.018, xb - 0.018, z0, FULL, d)] + _grooved(col, mats, m, xa, xb, K_TOP, z0, stop=K_TOP + 0.27)


def _span(length, side):
    """Map a stretch (u0, u1) measured from the tall end of a run `length`
    long to x: the tall end at -X (`side` -1, the piece's own left) or +X."""
    def x(u0, u1):
        if side < 0:
            return -length / 2 + u0, -length / 2 + u1
        return length / 2 - u1, length / 2 - u0
    return x


def _ochre_layout(run):
    """The ochre base run from the tall end: the sink, doors, a stack of
    drawers, the oven under the hob, then (on a long enough run) the open
    shelf column's cupboard."""
    shelf = 0.3 if run >= 2.0 else 0.0
    fixed = [("sink", 0.6)]
    tail = [("drawers", 0.45), ("oven", 0.6)]
    rest = run - shelf - 0.6 - 1.05
    doors = []
    if rest >= 0.3:
        n = max(1, math.ceil(rest / 0.6 - 0.01))
        doors = [("door", rest / n)] * n
        rest = 0
    # A filler, if any, before the drawers: the oven stays under its hood.
    mods = fixed + doors + ([("filler", rest)] if rest > 0.01 else []) + tail
    if shelf:
        mods.append(("shelfbase", shelf))
    return mods


def kitchen(col, mats, length, scheme="ochre", tall=1, tall_side=-1, uppers=True, shelves=None, walls=(False, False)):
    """A fitted kitchen `length` long against y = 0, facing +Y, handleless
    throughout, `tall` full-height columns at one end (`tall_side` -1 the
    piece's own left, -X; +1 its right), the first of them that is not an
    oven's an integrated fridge (_tall). Every front opens but the oven's,
    the dishwasher's and the sage hob cabinet's flap, each door hung away
    from the columns or from an end against a wall (`walls`, left and
    right; _hands, _tall_hand).

    Ochre (render 18): light oak columns; mustard base units — the sink,
    doors, drawers, a white built-under oven under a flush black hob —
    under a slim terrazzo top, terrazzo up the wall to cream cupboards that
    run to the ceiling, one of them with a bronze-framed niche and a hood
    visor; a cream open shelf column at the run's far end.

    Sage (render 20): sage columns, the first with a black glass oven at
    eye level; a hob bay under a deep wall cabinet; then a recess panelled
    in grooved sage over the sink, with three floating shelves of crockery.

    `uppers` False leaves out everything over the worktop but a splashback
    (a counter). A sage kitchen with no column but its oven's has its
    fridge under the worktop, behind the door beside the sink, where that
    door is wide enough for one."""
    s = SCHEMES[scheme]
    X = _span(length, tall_side)
    parts = []
    tw = 0.6 * tall
    run = length - tw
    # The tall end: the columns along X, the base run beside them, for which
    # way each column's doors hang.
    talls = [("oven_col" if scheme == "sage" and k == 0 else "column",) + X(k * 0.6, (k + 1) * 0.6) + (k,) for k in range(tall)]
    fridge = next((k for kind, _, _, k in talls if kind == "column"), None)
    seq = sorted((t[:3] for t in talls), key=lambda m: m[1])
    if tall:
        seq = seq + [("base", seq[-1][2], length / 2)] if tall_side < 0 else [("base", -length / 2, seq[0][1])] + seq
    for kind, xa, xb, k in talls:
        hand = _tall_hand(*_sides_of(seq, [m[1] for m in seq].index(xa), walls))
        first, last = k == 0, k == tall - 1
        sides = (first, last) if tall_side < 0 else (last, first)
        if kind == "oven_col":
            parts += _tall(col, mats, xa, xb, s["tall"], [K_PL, 0.86, 1.46, FULL], ovens=[(0.86, 1.46, False)], sides=sides,
                           hand=hand)
        else:
            parts += _tall(col, mats, xa, xb, s["tall"], [K_PL, 2.02, FULL], sides=sides, hand=hand, fridge=k == fridge)
    open_end = (False, True) if tall_side < 0 else (True, False)
    if not tall:
        open_end = (True, True)
    # What the base run and the wall cupboards end against: the columns, or a wall.
    stops = (walls[0] or (tall > 0 and tall_side < 0), walls[1] or (tall > 0 and tall_side > 0))
    if scheme == "ochre":
        mods, u = [], tw
        xs = {}
        for kind, w in _ochre_layout(run):
            xa, xb = X(u, u + w)
            xs.setdefault(kind, (xa, xb))
            mods.append(("door" if kind == "shelfbase" else kind, xa, xb))
            u += w
        mods.sort(key=lambda m: m[1])
        sx = sum(xs["sink"]) / 2
        ox = sum(xs["oven"]) / 2
        # The splashback stops inside the open shelf column's side panel: the
        # column has its own back, in the same plane, which it would fight.
        splash_x = None
        if uppers and "shelfbase" in xs:
            lo, hi = min(m[1] for m in mods), max(m[2] for m in mods)
            ca, cb = xs["shelfbase"]
            splash_x = (lo, ca + 0.009) if cb >= hi - 1e-6 else (cb - 0.009, hi)
        parts += _base_units(col, mats, s, mods, ends=open_end, hob=(ox, 0.58), sink=(sx, 0.5),
                             splash=K_WALL if uppers else K_TOP + 0.6, splash_x=splash_x, stops=stops)
        if uppers:
            # Cupboards over the run but its shelf column: the hood's over
            # the oven, the niche's beside it, wider doors from the tall end.
            shelf_w = 0.3 if "shelfbase" in xs else 0.0
            span_end = run - shelf_w
            spans_u = [(span_end - 0.6, span_end), (span_end - 1.2, span_end - 0.6)]
            rest = span_end - 1.2
            n = max(1, math.ceil(rest / 0.95 - 0.01)) if rest > 0.05 else 0
            for k in range(n):
                spans_u.append((rest - (k + 1) * rest / n, rest - k * rest / n))
            spans = sorted(X(tw + a, tw + b) for a, b in spans_u)
            niche_x = X(tw + span_end - 1.2, tw + span_end - 0.6)
            hood_x = X(tw + span_end - 0.6, tw + span_end)
            # They end against the columns, and at the far end against the
            # open shelf column, or what the run's end stands against.
            far = walls[1] if tall_side < 0 else walls[0]
            ends_w = (stops[0], far and not shelf_w) if tall_side < 0 else (far and not shelf_w, stops[1])
            parts += _wall_units(col, mats, s, spans, niche=(niche_x[0], niche_x[1], 0.36) if run >= 1.6 else None,
                                 hood=hood_x, stops=ends_w)
            if shelf_w:
                xa, xb = xs["shelfbase"]
                parts += _shelf_column(col, mats, s["upper"], xa, xb, K_TOP, FULL, [K_WALL + 0.009, 1.92, 2.32], d=0.35)
    else:
        hb = 1.2 if run >= 2.6 else 0.9
        hob_w = 0.8 if hb > 1 else 0.6
        niche_w = run - hb
        mods = []
        u = tw
        hob_mods = [("door", hb / 2), ("door", hb / 2)]
        niche_mods = []
        if niche_w >= 1.5:
            niche_mods.append(("dishwasher", 0.6))
        rest = niche_w - 0.6 - sum(w for _, w in niche_mods)
        if rest > 0.05:
            niche_mods.append(("fridge" if fridge is None and uppers and rest >= 0.55 else "door", rest))
        niche_mods.append(("sink", 0.6))
        for kind, w in hob_mods + niche_mods:
            xa, xb = X(u, u + w)
            mods.append((kind, xa, xb))
            u += w
        mods.sort(key=lambda m: m[1])
        hx = sum(X(tw, tw + hb)) / 2
        sx = sum(X(length - 0.6, length)) / 2
        parts += _base_units(col, mats, s, mods, ends=open_end, hob=(hx, hob_w), sink=(sx, 0.52),
                             splash=None if uppers else K_TOP + 0.6, stops=stops)
        if uppers:
            ha, hb_ = X(tw, tw + hb)
            parts += _hob_cabinet(col, mats, s, ha, hb_)
            na, nb = X(tw + hb, length)
            sl = min(1.1, niche_w - 0.15)
            far = nb if tall_side < 0 else na
            shelf_from = far - sl - 0.05 if tall_side < 0 else far + 0.05
            show = (shelves if shelves is not None else True) and niche_w >= 0.85
            parts += _sage_niche(col, mats, s, na, nb, shelf_from=shelf_from if show else None, shelf_len=sl)
    return parts


def counter(col, mats, length, scheme, kind, lead=0.0, splash=0.6, hand=-1, walls=(False, False)):
    """A base run alone, handleless, both ends finished, a splashback
    `splash` over the worktop (0: none): `kind` "hob" (a flush black hob
    over a built-under oven, drawers and doors), "sink" (`lead` metres of
    doors from -X, an undermount sink and its mixer, a dishwasher, then
    doors — or after a lead, a filler), "plain" (a pair of doors each side
    of a drawer stack and no splashback, to stand under a window) or "low"
    (C's plans' order, C1+C2-0, from the hob end at -X — at +X with `hand`
    +1: a door under the hob, drawers, the sink, then the dishwasher at
    the far end; no splashback, for glazing behind). C4 and C5 have no
    tall unit, so the low counter's drawers beside the sink are its fridge:
    the two deep ones refrigerated, the shallow one over them for cutlery.
    Every front opens but the oven's and the dishwasher's, the doors hung
    away from an end against a wall or another piece (`walls`, left and
    right; _hands)."""
    s = SCHEMES[scheme]
    if kind == "low":
        X = _span(length, hand)
        mods = sorted(((k,) + X(a, b) for k, a, b in (("door", 0.0, 0.6), ("fridge_drawers", 0.6, 1.2), ("sink", 1.2, 1.8),
                                                         ("dishwasher", 1.8, length))), key=lambda m: m[1])
        # The hob 4 cm in from the end it stands at, over its door.
        return _base_units(col, mats, s, mods, ends=(True, True), hob=(sum(X(0.04, 0.6)) / 2, 0.56),
                           sink=(sum(X(1.2, 1.8)) / 2, 0.52), stops=walls)
    if kind == "hob":
        widths = [("door", 0.6), ("oven", 0.6), ("drawers", 0.6)]
    elif kind == "plain":
        pair = (length - 0.6) / 4
        widths = [("door", pair)] * 2 + [("drawers", 0.6)] + [("door", pair)] * 2
        splash = 0
    else:
        widths = ([("door", lead / 2)] * 2 if lead > 0.6 else [("door", lead)] if lead else []) + [("sink", 0.6), ("dishwasher", 0.6)]
    rest = length - sum(w for _, w in widths)
    if rest > 0.05:
        widths.append(("filler" if lead else "door", rest))
    mods, x = [], -length / 2
    for k, w in widths:
        mods.append((k, x, x + w))
        x += w
    at = {k: (a + b) / 2 for k, a, b in mods}
    return _base_units(col, mats, s, mods, ends=(True, True), hob=(at["oven"], 0.58) if kind == "hob" else None,
                       sink=(at["sink"], 0.5) if kind == "sink" else None, splash=K_TOP + splash if splash else None,
                       stops=walls)


def kitchen_a1(col, mats, scheme="ochre"):
    """Flat A1's ochre kitchen, render 18 as seen from the front, left to
    right: the oak column, the sink, a door, drawers, the white oven, and
    the open shelf column; cream cupboards to the ceiling over it all.

    `scheme` "sage" is flat B1's (B0-4): the same order in render 20's
    sage, a black oven under the hob and its deep cabinet over it, the
    grooved recess and its shelves over the sink, the shelf column open."""
    if scheme != "ochre":
        # From -X, as _ochre_layout(2.4) runs from the column at +X.
        return _sage_run(col, mats, 3.0, [("shelfbase", 0.3), ("oven", 0.6), ("drawers", 0.45), ("door", 0.45),
                                          ("sink", 0.6), ("fridge_col", 0.6)],
                         hob=(0.3, 0.9, 0.58), cab=(0.3, 0.9), niche=(0.9, 2.4), shelves=(1.25, 2.35))
    # Its column stands against the media wall (ld-media-ochre), full height.
    return kitchen(col, mats, 3.0, "ochre", tall=1, tall_side=1, walls=(False, True))


def kitchen_a2(col, mats, L=4.5, scheme="sage"):
    """Flat A2's sage kitchen, render 20 as seen from the front, left to
    right: a column with a black oven at eye level, the hob bay under its
    deep cabinet, the grooved recess with its shelves over the sink, and
    two columns to the ceiling (an integrated fridge and a pantry).

    Any `L` but 4.5 is B2's plan (B0-2), from the viewer's left: the oven
    column, a 0.8 m hob bay under the deep cabinet, a dishwasher, a 0.7 m
    door, the sink, a door taking up the rest (L - 4.5; the plan's washer
    could stand behind it) and the two 0.6 m columns; the recess runs
    from the cabinet to the columns, its shelves over the sink.

    `scheme` "ochre" is A2's (A0+B0-1), the same plan in render 18's look,
    from its own left (-X): the two columns in oak, the door, the sink
    (centre 2.05 m from that end, as sage), drawers, the dishwasher, the
    white oven under the hob (centre L - 1.0, as sage), and the plan's
    base end unit, a door and the open shelf column's door; cream
    cupboards to the ceiling over it, the niche beside the hood's.

    The fridge is the first of the two columns as they are listed; both
    flats' kitchens run from wall to wall."""
    walls = (True, True)
    if scheme != "sage":
        return _ochre_run(col, mats, L, [("fridge_col", 0.6), ("column", 0.6), ("door", L - 4.5), ("sink", 0.6),
                                         ("drawers", 0.8), ("dishwasher", 0.6), ("oven", 0.6), ("door", 0.4), ("shelfbase", 0.3)],
                          hob=(L - 1.3, L - 0.7, 0.58), hood=(L - 1.3, L - 0.7), niche=(L - 1.9, L - 1.3), walls=walls)
    if L != 4.5:
        return _sage_run(col, mats, L, [("fridge_col", 0.6), ("column", 0.6), ("door", L - 4.5), ("sink", 0.6), ("door", 0.7),
                                        ("dishwasher", 0.6), ("door", 0.8), ("oven_col", 0.6)],
                         hob=(L - 1.4, L - 0.6, 0.78), cab=(L - 1.4, L - 0.6), niche=(1.2, L - 1.4), shelves=(1.25, 2.35),
                         walls=walls)
    s = SCHEMES["sage"]
    x = lambda u: L / 2 - u            # measured from the viewer's left (+X)
    parts = _tall(col, mats, x(0.6), x(0), s["tall"], [K_PL, 0.86, 1.46, FULL], ovens=[(0.86, 1.46, False)],
                  hand=_tall_hand("base", "wall"))
    mods = [("door", x(1.2), x(0.6)), ("door", x(1.8), x(1.2)), ("dishwasher", x(2.4), x(1.8)),
            ("door", x(2.8), x(2.4)), ("sink", x(3.4), x(2.8))]
    mods.sort(key=lambda m: m[1])
    parts += _base_units(col, mats, s, mods, hob=((x(0.6) + x(1.8)) / 2, 0.8), sink=((x(3.4) + x(2.8)) / 2, 0.52),
                         stops=(True, True))
    parts += _hob_cabinet(col, mats, s, x(1.8), x(0.6))
    parts += _sage_niche(col, mats, s, x(3.4), x(1.8), shelf_from=x(3.4) + 0.05, shelf_len=1.1)
    for k in range(2):
        # The fridge by the sink, the pantry at the wall.
        xa, xb = x(3.4 + (k + 1) * 0.55), x(3.4 + k * 0.55)
        parts += _tall(col, mats, xa, xb, s["tall"], [K_PL, 1.58, FULL], sides=(k == 1, k == 0), fridge=k == 0,
                       hand=_tall_hand("tall", "base") if k == 0 else _tall_hand("wall", "tall"))
    return parts


def _grooved(col, mats, m, xa, xb, z0, z1, stop=None, t=0.018, first=0.27):
    """Render 20's sage wall panel from z0 to z1 across xa..xb, its face at
    y = `t`: a plain board `first` tall from z0, then a recessed groove 7 mm
    tall every 8.5 cm up to `stop` (measured from z0, so panels side by
    side line up), a shadow strip 3 mm back in each, and the top board
    running on to z1. Under the hob cabinet (`stop` = z0 + `first`) that
    leaves the render's two plain boards and the one joint between them."""
    stop = z1 - 0.03 if stop is None else stop
    pitch, gap = 0.085, 0.007
    parts, lo, z = [], z0, z0 + first
    while z <= stop + 1e-6:
        parts.append(_block(col, m, xa, xb, 0, t, lo, z - gap, "board"))
        parts.append(_block(col, mats["lacquer_sage_shadow"], xa + 0.0005, xb - 0.0005, 0.003, t - 0.003, z - gap - 0.001,
                            z + 0.001, "groove"))
        lo, z = z, z + pitch
    parts.append(_block(col, m, xa, xb, 0, t, lo, z1, "board"))
    return parts


def _run_stops(seq, base, walls):
    """What a plan's base run ends against (left, right): a column beside
    it, or the end of the run where that is against a wall (`walls`). `seq`
    is the whole run (kind, u0, u1) in order, `base` its base modules."""
    tall = ("column", "oven_col", "fridge_col")
    near = lambda a, b: abs(a - b) < 1e-6   # noqa: E731
    b0, b1 = base[0][1], base[-1][2]
    lo, hi = seq[0][1], seq[-1][2]
    left = any(near(t[2], b0) for t in seq if t[0] in tall) or (walls[0] and near(b0, lo))
    right = any(near(t[1], b1) for t in seq if t[0] in tall) or (walls[1] and near(b1, hi))
    return left, right


def _sage_run(col, mats, L, mods, hob, cab, niche, shelves, hand=-1, walls=(False, False)):
    """A sage kitchen of render 20 laid out to a plan, `L` long, against
    y = 0 facing +Y. `mods` (kind, width) from its own left (-X; with
    `hand` +1 from its right): "oven_col" a column with the black oven at
    eye level, "column" a tall cupboard (a pantry), "fridge_col" one with
    an integrated fridge behind its lower door, "shelfbase" a door under a
    column of open shelves, or one of _base_units' kinds. Measured the same
    way: `hob` (u0, u1, w) a flush hob `w` wide centred on u0..u1, `cab`
    (u0, u1) the deep cabinet over it, `niche` (u0, u1) the grooved recess,
    `shelves` (u0, u1) its three shelves, their crockery set as the
    render's, by the nearer column. Every front opens but the oven's, the
    dishwasher's and the hob cabinet's flap, hung away from the columns
    and from an end against a wall (`walls`, left and right as the piece
    stands, -X first, whatever `hand`; _hands, _tall_hand)."""
    s = SCHEMES["sage"]
    if hand > 0:
        mods = mods[::-1]
        hob, cab, niche, shelves = [(L - r[1], L - r[0]) + tuple(r[2:]) for r in (hob, cab, niche, shelves)]
    x = lambda u: -L / 2 + u
    near = lambda a, b: abs(a - b) < 1e-6
    talls, base, seq, u = [], [], [], 0.0
    for kind, w in mods:
        (talls if kind in ("oven_col", "column", "fridge_col") else base).append((kind, u, u + w))
        seq.append((kind, u, u + w))
        u += w
    parts = []
    for kind, a, b in talls:
        # A finished side wherever it doesn't stand against another column.
        sides = (not any(near(t[2], a) for t in talls), not any(near(t[1], b) for t in talls))
        hand_ = _tall_hand(*_sides_of(seq, seq.index((kind, a, b)), walls))
        if kind == "oven_col":
            parts += _tall(col, mats, x(a), x(b), s["tall"], [K_PL, 0.86, 1.46, FULL], ovens=[(0.86, 1.46, False)], sides=sides,
                           hand=hand_)
        else:
            parts += _tall(col, mats, x(a), x(b), s["tall"], [K_PL, 1.58, FULL], sides=sides, hand=hand_,
                           fridge=kind == "fridge_col")
    b0, b1 = base[0][1], base[-1][2]
    ends = (not any(near(t[2], b0) for t in talls), not any(near(t[1], b1) for t in talls))
    sink = [(a + b) / 2 for kind, a, b in base if kind == "sink"]
    parts += _base_units(col, mats, s, [("door" if k == "shelfbase" else k, x(a), x(b)) for k, a, b in base], ends=ends,
                         hob=(x((hob[0] + hob[1]) / 2), hob[2]), sink=(x(sink[0]), 0.52) if sink else None,
                         stops=_run_stops(seq, base, walls))
    parts += _hob_cabinet(col, mats, s, x(cab[0]), x(cab[1]))
    mid = (shelves[0] + shelves[1]) / 2
    nearest = min(((a + b) / 2 for _, a, b in talls), key=lambda c: abs(c - mid), default=mid)
    parts += _sage_niche(col, mats, s, x(niche[0]), x(niche[1]), shelf_from=x(shelves[0]), shelf_len=shelves[1] - shelves[0],
                         flip=nearest > mid)
    for kind, a, b in base:
        if kind == "shelfbase":
            parts += _shelf_column(col, mats, s["upper"], x(a), x(b), K_TOP, FULL, [K_WALL + 0.009, 1.92, 2.32], d=0.35)
    return parts


def _ochre_run(col, mats, L, mods, hob, hood, niche, walls=(False, False)):
    """An ochre kitchen of render 18 laid out to a plan, as _sage_run lays
    out render 20's: `L` long against y = 0 facing +Y. `mods` (kind,
    width) from its own left (-X): "column" an oak tall unit (a pantry),
    "fridge_col" one with an integrated fridge behind its tall door,
    "shelfbase" a door under the cream open shelf column, or one of
    _base_units' kinds ("oven" the white built-under one). Measured the
    same way: `hob` (u0, u1, w) a flush hob `w` wide centred on u0..u1,
    `hood` (u0, u1) the cupboard its visor hangs under and `niche` (u0,
    u1) the one beside it with the bronze-framed open box; cream
    cupboards to the ceiling over the rest of the run between the
    columns and the shelf column, terrazzo up the wall to them. Every
    front opens but the oven's and the dishwasher's, hung away from the
    columns and from an end against a wall (`walls`, left and right)."""
    s = SCHEMES["ochre"]
    x = lambda u: -L / 2 + u
    near = lambda a, b: abs(a - b) < 1e-6
    talls, base, seq, u = [], [], [], 0.0
    for kind, w in mods:
        if w > 0.005:
            (talls if kind in ("column", "fridge_col") else base).append((kind, u, u + w))
            seq.append((kind, u, u + w))
        u += w
    parts = []
    for kind, a, b in talls:
        sides = (not any(near(t[2], a) for t in talls), not any(near(t[1], b) for t in talls))
        parts += _tall(col, mats, x(a), x(b), s["tall"], [K_PL, 2.02, FULL], sides=sides,
                       hand=_tall_hand(*_sides_of(seq, seq.index((kind, a, b)), walls)), fridge=kind == "fridge_col")
    b0, b1 = base[0][1], base[-1][2]
    ends = (not any(near(t[2], b0) for t in talls), not any(near(t[1], b1) for t in talls))
    stops = _run_stops(seq, base, walls)
    sink = [(a + b) / 2 for kind, a, b in base if kind == "sink"]
    parts += _base_units(col, mats, s, [("door" if k == "shelfbase" else k, x(a), x(b)) for k, a, b in base], ends=ends,
                         hob=(x((hob[0] + hob[1]) / 2), hob[2]), sink=(x(sink[0]), 0.5) if sink else None, stops=stops)
    shelf = next(((a, b) for k, a, b in base if k == "shelfbase"), None)
    w0, w1 = b0, shelf[0] if shelf else b1
    # The splashback stops a millimetre into what it meets, not on the
    # shelf column's back (the same plane).
    parts.append(_block(col, mats[s["splash"]], x(w0) - 0.001 * (not ends[0]), x(w1) + 0.001 * (shelf is not None or not ends[1]),
                        0, 0.012, K_TOP, K_WALL, "splash"))
    spans = [tuple(hood), tuple(niche)]
    for a, b in ((w0, min(hood[0], niche[0])), (max(hood[1], niche[1]), w1)):
        n = max(1, math.ceil((b - a) / 0.95 - 0.01)) if b - a > 0.05 else 0
        spans += [(a + k * (b - a) / n, a + (k + 1) * (b - a) / n) for k in range(n)]
    # The wall cupboards end as the base run does, but against the open
    # shelf column where there is one.
    parts += _wall_units(col, mats, s, sorted((x(a), x(b)) for a, b in spans), niche=(x(niche[0]), x(niche[1]), 0.36),
                         hood=(x(hood[0]), x(hood[1])), stops=(stops[0], stops[1] and not shelf))
    if shelf:
        parts += _shelf_column(col, mats, s["upper"], x(shelf[0]), x(shelf[1]), K_TOP, FULL, [K_WALL + 0.009, 1.92, 2.32], d=0.35)
    return parts


def kitchen_42s(col, mats):
    """The sage upper-north kitchen of A and B's plans (AB1-1), 4.2 m, from
    its own left (-X): the oven column and a pantry, a 0.2 m tray door,
    the sink (centre 1.7 m from that end) under the grooved recess and its
    shelves, a dishwasher, a 0.4 m door, and the 1.2 m hob bay (hob centre
    3.6) under the deep cabinet. The pantry column is the fridge's."""
    return _sage_run(col, mats, 4.2, [("oven_col", 0.6), ("fridge_col", 0.6), ("door", 0.2), ("sink", 0.6), ("dishwasher", 0.6),
                                      ("door", 0.4), ("door", 0.6), ("door", 0.6)],
                     hob=(3.0, 4.2, 0.78), cab=(3.0, 4.2), niche=(1.2, 3.0), shelves=(1.25, 2.35))


def kitchen_40n(col, mats, scheme="sage"):
    """A and B's upper north kitchen to their plans (A1+B1-1), 3.95 m, from
    its own left (-X): one tall column (sage: the oven column; ochre: an
    oak tall unit), a door, the sink (centre 1.5), the dishwasher, a
    0.65 m base unit (ochre: drawers, beside the oven as in render 18),
    the hob bay (hob centre 3.35) and a 0.3 m end door. Sage: the grooved
    recess from the column to the hob, its shelves from the column over
    the sink, the deep cabinet over the hob bay and the end (as C1's).
    Ochre: the white oven under the hob, cream cupboards to the ceiling
    with the niche beside the hood's, the end door under the open shelf
    column (as the ochre 4.2 m run).

    The fridge: ochre's oak column; sage's, which has none but the oven's,
    behind the door between it and the sink. Both stand from the stair's
    wall (-X) to the plain counter under the window (+X)."""
    walls = (True, True)
    if scheme == "sage":
        return _sage_run(col, mats, 3.95, [("oven_col", 0.6), ("fridge", 0.6), ("sink", 0.6), ("dishwasher", 0.6), ("door", 0.65),
                                           ("door", 0.6), ("door", 0.3)],
                         hob=(3.05, 3.65, 0.58), cab=(3.05, 3.95), niche=(0.6, 3.05), shelves=(0.65, 1.8), walls=walls)
    return _ochre_run(col, mats, 3.95, [("fridge_col", 0.6), ("door", 0.6), ("sink", 0.6), ("dishwasher", 0.6), ("drawers", 0.65),
                                        ("oven", 0.6), ("shelfbase", 0.3)],
                      hob=(3.05, 3.65, 0.58), hood=(3.05, 3.65), niche=(2.45, 3.05), walls=walls)


def kitchen_c2(col, mats, hand=-1):
    """C2's kitchen (C0-4), 2.8 m, from its own left (-X; `hand` +1 from its
    right, for C3): the oven column, a fridge and pantry column (the fridge
    behind its lower door), the sink under the grooved recess and its
    shelves, a 0.4 m door, and the hob bay under the deep cabinet; the
    columns at the open end, the hob bay's end against the wall."""
    return _sage_run(col, mats, 2.8, [("oven_col", 0.6), ("fridge_col", 0.6), ("sink", 0.6), ("door", 0.4), ("door", 0.6)],
                     hob=(2.2, 2.8, 0.58), cab=(2.2, 2.8), niche=(1.2, 2.2), shelves=(1.25, 2.15), hand=hand,
                     walls=(False, True) if hand < 0 else (True, False))


def kitchen_c1(col, mats):
    """C1's kitchen (C0-10), 3.9 m, from its own right (+X, the north end
    as placed): the fridge column, a pair of doors, the sink under the
    grooved recess and its shelves, a dishwasher, drawers, the hob bay and
    a 0.25 m end door under the deep cabinet; the fridge's end open, the
    hob's against the party wall (-X)."""
    return _sage_run(col, mats, 3.9, [("fridge_col", 0.6), ("door", 0.425), ("door", 0.425), ("sink", 0.6), ("dishwasher", 0.6),
                                      ("drawers", 0.4), ("door", 0.6), ("door", 0.25)],
                     hob=(3.05, 3.65, 0.58), cab=(3.05, 3.9), niche=(0.6, 3.05), shelves=(0.65, 2.05), hand=1,
                     walls=(True, False))


def peninsula(col, mats, w=2.10, d=0.62, scheme="sage"):
    """A peninsula in the kitchens' handleless style: drawers and doors
    facing +Y, the back panelled, the worktop running on over the back as
    a breakfast bar; its two doors open from the middle."""
    s = SCHEMES[scheme]
    third = w / 3
    mods = [("drawers", -w / 2, -w / 2 + third), ("door", -w / 2 + third, w / 2 - third), ("door", w / 2 - third, w / 2)]
    parts = []
    for p in _base_units(col, mats, s, mods, depth=d - 0.02, ends=(True, True)):
        if p.name.startswith("worktop"):
            bpy.data.objects.remove(p, do_unlink=True)
            continue
        p.location.y -= (d - 0.02) / 2
        parts.append(p)
    parts.append(_block(col, mats[s["base"]], -w / 2, w / 2, -d / 2 - 0.0, -d / 2 + 0.018, 0, K_TOP - K_WT, "back"))
    parts.append(_block(col, mats[s["top"]], -w / 2 - 0.01, w / 2 + 0.01, -d / 2 - 0.3, d / 2 + 0.0, K_TOP - K_WT, K_TOP,
                        "worktop", bevel=0.003))
    return parts


# ---------------------------------------------------------------------
# Corner kitchens: each leg built as a straight run (along X, facing +Y,
# its back at y = 0), then turned into place and cut where it meets a
# wall or another leg
# ---------------------------------------------------------------------

def _turn(parts, angle=0.0, dx=0.0, dy=0.0):
    """Turn `parts` by `angle` about Z, then move them by (dx, dy), baking
    the move into each mesh so the parts can be cut where they stand."""
    from mathutils import Matrix
    m = Matrix.Translation((dx, dy, 0.0)) @ Matrix.Rotation(angle, 4, "Z")
    for p in parts:
        if p.type == "MESH":
            p.data.transform(m @ g.world_matrix(p))
            p.matrix_basis = Matrix.Identity(4)
        else:
            p.matrix_basis = m @ p.matrix_basis
    return parts


def _cut(parts, co, no):
    """Cut `parts` by the upright plane through `co` (x, y), dropping all
    that lies on the side its normal `no` (x, y) points to and closing each
    cut with a face: a carcass or a worktop cut to a slanted wall, a leg's
    end cut to the face of the leg it runs into. Returns what is left."""
    import bmesh
    from mathutils import Matrix, Vector
    c = Vector((co[0], co[1], 0.0))
    n = Vector((no[0], no[1], 0.0)).normalized()
    kept = []
    for p in parts:
        if p.type != "MESH":
            kept.append(p)
            continue
        mw = g.world_matrix(p)
        ds = [(mw @ v.co - c).dot(n) for v in p.data.vertices]
        if not ds or max(ds) <= 1e-6:
            kept.append(p)
            continue
        if min(ds) >= -1e-6:
            bpy.data.objects.remove(p, do_unlink=True)
            continue
        p.data.transform(mw)
        p.matrix_basis = Matrix.Identity(4)
        bm = bmesh.new()
        bm.from_mesh(p.data)
        res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=c, plane_no=n,
                                     clear_outer=True)
        edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        bm.to_mesh(p.data)
        bm.free()
        kept.append(p)
    return kept


def _corner_scheme(scheme):
    """A scheme's colours, with the corner kitchens' black mixer (ochre's
    is render 18's near-black gunmetal already)."""
    s = dict(SCHEMES[scheme])
    if scheme != "ochre":
        s["tap"] = "black_metal"
    return s


def _uppers(col, mats, s, spans, deep=False, hood=None, niche=None, stops=(False, False), shut=False):
    """Cupboards to the ceiling over a run, their backs at y = 0, one
    handleless door per span (xa, xb): render 18's cream wall units, 0.35
    deep from K_WALL, `hood` (xa, xb) hanging its slim visor under a span
    and `niche` (xa, xb, h) opening a bronze-framed box at a span's foot;
    or, `deep`, render 20's deep cabinet, 0.42 deep from 1.55, its doors
    between finished sides. As _wall_units and _hob_cabinet, but the
    carcass stands on the underside rather than sharing its face.

    Hollow as _wall_units' are, each door hung away from what the run ends
    against (`stops`); `shut` keeps them solid and shut, as the deep
    cabinet's flaps over a hob stay."""
    m, dark, white, t = mats[s["upper"]], mats["kitchen_gap"], mats["cab_white"], BOARD
    z0, d, under = (1.55, 0.42, 0.016) if deep else (K_WALL, 0.35, 0.012)
    xa0, xb0 = spans[0][0], spans[-1][1]
    body = d - FT - 0.001
    sd = d if deep else body
    parts = [_block(col, m, xa0, xa0 + 0.018, 0, sd, z0, FULL, "side"), _block(col, m, xb0 - 0.018, xb0, 0, sd, z0, FULL, "side")]
    ia, ib = xa0 + 0.018, xb0 - 0.018
    if niche:
        nx0, nx1, nh = max(niche[0], ia), min(niche[1], ib), niche[2]
        for a, b in ((ia, nx0), (nx1, ib)):
            if b - a > 1e-4:
                parts.append(_block(col, m, a, b, 0, body, z0, z0 + under, "underside"))
                if shut:
                    parts.append(_block(col, dark, a, b, 0, body, z0 + under, FULL))
        if shut:
            parts.append(_block(col, dark, nx0, nx1, 0, body, z0 + nh, FULL))
        # Its lining, cream, behind a thin bronze frame round its mouth.
        tl, f, fd = 0.016, 0.01, d - 0.02
        parts += [_block(col, m, nx0, nx1, 0, fd, z0, z0 + tl, "niche"), _block(col, m, nx0, nx1, 0, fd, z0 + nh - tl, z0 + nh, "niche"),
                  _block(col, m, nx0, nx1, 0, 0.012, z0 + tl, z0 + nh - tl, "niche"),
                  _block(col, m, nx0, nx0 + tl, 0.012, fd, z0 + tl, z0 + nh - tl, "niche"),
                  _block(col, m, nx1 - tl, nx1, 0.012, fd, z0 + tl, z0 + nh - tl, "niche")]
        bz = mats["bronze_dark"]
        parts += [_block(col, bz, nx0, nx1, fd, d + 0.001, z0, z0 + f, "frame"),
                  _block(col, bz, nx0, nx1, fd, d + 0.001, z0 + nh - f, z0 + nh, "frame"),
                  _block(col, bz, nx0, nx0 + f, fd, d + 0.001, z0 + f, z0 + nh - f, "frame"),
                  _block(col, bz, nx1 - f, nx1, fd, d + 0.001, z0 + f, z0 + nh - f, "frame")]
    else:
        parts.append(_block(col, m, ia, ib, 0, body, z0, z0 + under, "underside"))
        if shut:
            parts.append(_block(col, dark, ia, ib, 0, body, z0 + under, FULL))
    if not shut:
        # The carcass: a top, a board at each joint between two doors, a
        # back in each cupboard from its floor up (a niche keeps its lining).
        parts.append(_board(col, white, dark, ia, ib, 0, body, FULL - t, FULL, up=True))
        for (_, xb), (xa, _) in zip(spans, spans[1:]):
            parts.append(_board(col, white, dark, xa - t / 2, xa + t / 2, 0, body, z0 + under, FULL - t))
    hands = _hands([("door", xa, xb) for xa, xb in spans], stops)
    for k, (xa, xb) in enumerate(spans):
        at_niche = niche and xa <= niche[0] + 0.001 and xb >= niche[1] - 0.001
        za = z0 + niche[2] if at_niche else z0
        if deep:
            xa, xb = max(xa, ia), min(xb, ib)
        front = _slab(col, m, xa, xb, za, FULL, d)
        if shut:
            parts.append(front)
            continue
        ca, cb = max(xa, ia) + (t / 2 if k else 0), min(xb, ib) - (t / 2 if k < len(spans) - 1 else 0)
        floor = za if at_niche else z0 + under
        parts += [_board(col, white, dark, ca, cb, t, body, floor, floor + t),
                  _board(col, white, None, ca, cb, 0, t, floor + t, FULL - t, "back")]
        lo = floor + t
        if hood and xa <= hood[0] + 0.001 and xb >= hood[1] - 0.001:
            parts.append(_block(col, mats["steel"], ca + 0.01, cb - 0.01, t, body - 0.03, lo, lo + 0.26, "extractor"))
            lo += 0.26
        parts += _carcass_shelves(col, mats, ca, cb, lo, FULL - t, body)
        parts += _hang([front], xa, xb, d, hands[k][0], col)
    if hood:
        hx0, hx1 = hood
        parts.append(_block(col, mats["bronze_dark"], hx0 + 0.005, hx1 - 0.005, 0.02, d + 0.01, z0 - 0.022, z0, "hood", bevel=0.002))
        parts.append(_block(col, mats["steel"], hx0 + 0.04, hx1 - 0.04, 0.04, d - 0.06, z0 - 0.0225, z0 - 0.02, "filter"))
    return parts


def kitchen_l(col, mats, scheme="ochre", w=2.49, d=2.20, sink_at=1.57, hob_at=0.65):
    """An L-shaped corner kitchen `w` along X by `d` along Y, facing +Y, in
    a scheme's handleless fronts (flats A3 and B3; renders 18 and 20 for
    the look). Its long leg runs along the back (-Y) under a high window:
    from -X a blind corner, a door, an undermount sink with a black mixer
    `sink_at` from the -X end, a dishwasher, a finished end; only a 15 cm
    upstand behind it, no wall units. Its short leg stands at -X facing
    +X: from its free (+Y) end a door, a built-under oven under a flush
    four-zone hob `hob_at` from that end, 0.55 drawers, a filler clearing
    the long leg's fronts. Over it, on the solid
    wall, a splashback up to cupboards to the ceiling (ochre: cream, render
    18's hood visor over the hob and its bronze-framed niche beside it;
    sage: render 20's deep cabinet), the free end panelled full height.
    One worktop round the corner, a recessed plinth.

    With no tall unit, its fridge is under the worktop, behind the door
    beside the sink. Every front opens but the oven's, the dishwasher's,
    the blind corner's (the short leg stands across it) and the sage deep
    cabinet's flaps over the hob, each leg's doors hung away from the
    corner and from the full-height panel at the free end."""
    s = _corner_scheme(scheme)
    hx, hy = w / 2, d / 2
    fx, fy = -hx + K_D, -hy + K_D          # the short leg's fronts (an x), the long leg's (a y)
    top, end = mats[s["top"]], 0.018
    parts = []
    # The long leg, from the corner: the corner unit's door beside a filler
    # that clears the short leg's fronts.
    sx = -hx + sink_at
    span = sx - 0.3 - (fx + 0.05)
    n = max(1, math.ceil(span / 0.65 - 0.01))
    mods = [("corner", -hx, fx), ("filler", fx, fx + 0.05)]
    mods += [("fridge" if k == n - 1 else "door", fx + 0.05 + k * span / n, fx + 0.05 + (k + 1) * span / n) for k in range(n)]
    mods.append(("sink", sx - 0.3, sx + 0.3))
    if hx - (sx + 0.9) > 0.1:
        mods += [("dishwasher", sx + 0.3, sx + 0.9), ("door", sx + 0.9, hx)]
    else:
        mods.append(("dishwasher", sx + 0.3, hx))
    parts += _turn(_base_units(col, mats, s, mods, ends=(False, True), sink=(sx, 0.5 if scheme == "ochre" else 0.52)), dy=-hy)
    parts.append(_block(col, top, -hx + 0.012, hx, -hy, -hy + 0.012, K_TOP, K_TOP + 0.15, "upstand"))
    # The short leg, built along its own x (= -Y): its free end at -d/2.
    hc = -(hy - hob_at)
    a, b = -hy + end, -fy - 0.001
    mods = [("door", a, hc - 0.3), ("oven", hc - 0.3, hc + 0.3), ("drawers", hc + 0.3, hc + 0.85), ("filler", hc + 0.85, b)]
    short = []
    # It ends against the free end's full-height panel and the corner.
    for p in _base_units(col, mats, s, mods, hob=(hc, 0.58), stops=(True, True)):
        if p.name.startswith("worktop"):
            bpy.data.objects.remove(p, do_unlink=True)        # one top round the corner, below
        else:
            short.append(p)
    deep = scheme != "ochre"
    short.append(_block(col, mats[s["splash"]], a, hy, 0, 0.012, K_TOP, 1.55 if deep else K_WALL, "splash"))
    if deep:
        mid = (a - fy) / 2
        short += _uppers(col, mats, s, [(a, mid), (mid, -fy)], deep=True, shut=True)
    else:
        short += _uppers(col, mats, s, [(a, hc - 0.3), (hc - 0.3, hc + 0.3), (hc + 0.3, -fy)], hood=(hc - 0.3, hc + 0.3),
                         niche=(hc + 0.3, -fy, 0.36), stops=(True, False))
    parts += _turn(short, -PI / 2, dx=-hx)
    # Its worktop, butting the long leg's; the plinth closed round the
    # inside corner; the free end's panel, floor to ceiling.
    parts.append(_block(col, top, -hx, fx + 0.02, fy + 0.02, hy - end, K_TOP - K_WT, K_TOP, "worktop", bevel=0.003))
    parts.append(_block(col, mats["plinth_champagne"], -hx, fx - 0.05, fy - 0.05, fy - 0.001, 0, K_PL, "plinth"))
    parts.append(_block(col, mats[s["tall"]], -hx, fx + 0.02, hy - end, hy, 0, FULL, "gable"))
    return parts


def kitchen_u(col, mats, scheme="ochre"):
    """Flats A and B's upper south kitchen: a U open to its front, made for
    put(b, id, 9.34, 11.44, "W") in a flat walled at z 9.98 (north), z
    12.905 (south) and by the slanted east face x = 10.574 - 0.1365 (z -
    9.781). Turned to face west, the piece's X is 11.4425 - z and its Y
    9.34 - x, so its back wall is the slant, y = -1.0072 - 0.1365 x, and
    every carcass, plinth and worktop along it is cut to it.

    Its north leg (+X), facing -X: two 0.57 base units (x 8.13-9.29)
    under cupboards to the ceiling, an integrated fridge column on to x
    9.86, where the back leg's fronts meet it, and in the corner an oven
    column cut to the slant, a compact oven just over the worktop that
    runs into it. Its back leg, along the slant, 0.6 deep: drawers, a
    built-under oven under a flush black hob centred at (10.03, 11.50), a
    door; under a window, so nothing over it. Its south leg (-X), facing
    +X: a door, an undermount sink centred at x 8.96 with a black mixer,
    the dishwasher's front at x 9.26-9.86 (the back leg's end covers its
    last 0.24) and the blind corner, a low upstand under the window. The
    worktop runs round the inside corner; the free ends are finished.

    Every front opens but the ovens', the dishwasher's, the blind
    corner's and the oven column's below the worktop, which the back
    leg's end stands across; the columns' doors hang away from the slant,
    each leg's away from the corner it runs into. Fillers in the corner
    let the fridge's door and the back leg's drawers by: one between the
    oven column and the fridge, clear of the back leg's worktop, and one at
    the back leg's north end, as its drawers travel north drawn out."""
    s = _corner_scheme(scheme)
    sage = scheme != "ochre"
    hx, fy = 1.4625, 1.21                  # half the north-south span; the free ends (x 8.13)
    w0, sl = -1.00721, 0.1365              # the slant: y = w0 - sl * x
    wall = lambda x: w0 - sl * x           # noqa: E731
    away = (-sl, -1.0)                     # the slant's normal, out of the room
    nf, sd = hx - K_D, 12.905 - 12.30      # the north leg's fronts (x); the south leg's depth
    sf = -hx + sd                          # the south leg's fronts
    lean = math.hypot(1.0, sl)             # a depth across the slant, measured along y
    yj = wall(nf) + K_D * lean             # the back leg's fronts meet the north leg there: the fridge's far side
    tall = s["tall"]
    parts = []

    # North leg, along its own x (= Y), turned to face -X: from the free
    # end a panel and two 0.57 units (to x 9.29), the fridge column on to
    # the back leg's fronts, the oven column's fronts from there to the
    # slant, its carcass carried on behind them and cut to it.
    n = []
    yb = fy - 0.018 - 2 * 0.57
    spans = [(yb, yb + 0.57), (yb + 0.57, fy)]
    n += _base_units(col, mats, s, [("drawers",) + spans[0], ("door",) + spans[1]], ends=(False, True))
    n.append(_block(col, mats[s["splash"]], yb, fy, 0, 0.012, K_TOP, 1.55 if sage else K_WALL, "splash"))
    # Its cupboards end against the fridge column, free at the leg's end.
    if sage:
        n += _uppers(col, mats, s, spans, deep=True, stops=(True, False))
    else:
        n += _uppers(col, mats, s, spans, niche=spans[0] + (0.36,), stops=(True, False))
    oven = (K_TOP + 0.002, K_TOP + 0.452, s["oven"] == "white")
    door = 1.58 if sage else 2.02
    yw = wall(nf) + 0.002
    # The back leg's worktop runs into the corner 2 cm proud of its fronts,
    # in the way of the fridge's door as it swings: a 3 cm filler there in
    # the columns' finish, the fridge column on from it.
    yf = yj + 0.03
    n += [_block(col, mats["kitchen_gap"], yj, yf, 0, K_D - FT - 0.001, K_PL, FULL),
          _block(col, mats["plinth_champagne"], yj, yf, 0, K_D - 0.05, 0, K_PL, "plinth"),
          _slab(col, mats[tall], yj, yf, K_PL, FULL, K_D, name="filler")]
    n += _tall(col, mats, yf, yb, tall, [K_PL, door, FULL], sides=(False, True), hand=_tall_hand("tall", "base"), fridge=True)
    n += _tall(col, mats, yw, yj, tall, [K_PL, oven[0], oven[1], door, FULL], ovens=[oven], sides=(False, False),
               hand=_tall_hand("wall", "tall"), shut=(K_PL,))
    n += [_block(col, mats["kitchen_gap"], -1.3, yw, 0, K_D - FT - 0.001, K_PL, FULL),
          _block(col, mats["plinth_champagne"], -1.3, yw, 0, K_D - 0.05, 0, K_PL, "plinth")]
    parts += _cut(_turn(n, PI / 2, dx=hx), (0, w0), away)

    # Back leg, along the slant: its x' runs north, its back on the wall.
    phi = -math.atan(sl)
    hob_x, hob_y = -(11.50 - 11.4425), -(10.03 - 9.34)
    ox = math.cos(phi) * hob_x + math.sin(phi) * (hob_y - w0)       # the hob along the leg
    oy = -math.sin(phi) * hob_x + math.cos(phi) * (hob_y - w0)      # and off the wall
    # Drawn out square to the slant, its drawers also travel north, by
    # sin(phi) of their travel: they stop short of the oven column's front
    # by that and 3 mm, a filler between them and the corner.
    travel = 0.75 * K_TRAY
    stop = (nf - 0.003 + (K_D + travel) * math.sin(phi)) / math.cos(phi)
    e = _base_units(col, mats, s, [("door", -1.2, ox - 0.3), ("oven", ox - 0.3, ox + 0.3), ("drawers", ox + 0.3, stop),
                                   ("filler", stop, 1.2)])
    e += _flush_hob(col, mats, ox, oy, w=0.58)
    _turn(e, phi, dy=w0)
    tops = [p for p in e if p.name.startswith("worktop")]
    plinths = [p for p in e if p.name.startswith("plinth")]
    rest = [p for p in e if p not in tops and p not in plinths]
    # Its ends cut to the faces they meet: the oven column's front, the
    # south leg's fronts (its worktop to the south worktop's edge, its
    # plinth on to the plinths it joins).
    for group, north, south in ((rest, nf - 0.0005, sf + 0.0005), (tops, nf - 0.0005, sf + 0.02),
                                (plinths, nf + 0.05, sf - 0.05)):
        group = _cut(group, (north, 0), (1, 0))
        parts += _cut(group, (south, 0), (-1, 0))

    # South leg, along its own x (= -Y), turned to face +X.
    so = _base_units(col, mats, s, [("door", -fy, -0.68), ("sink", -0.68, -0.08), ("dishwasher", -0.08, 0.52),
                                    ("corner", 0.52, 1.2)], depth=sd, ends=(True, False), sink=(-0.38, 0.52 if sage else 0.5))
    so.append(_block(col, mats[s["top"]], -fy, 1.2, 0, 0.012, K_TOP, K_TOP + 0.10, "upstand"))
    parts += _cut(_turn(so, -PI / 2, dx=-hx), (0, w0), away)
    return parts


def _tv(col, mats, cx, y, z0, w, h, t=0.028):
    """A frameless black television, its back at y, its lower edge at z0."""
    return [g.box("tv", (w, t, h), loc=(cx, y + t / 2, z0 + h / 2), col=col, mat=mats["tv_glass"], bevel=0.003, segments=1),
            g.box("tv_back", (w * 0.5, 0.02, h * 0.5), loc=(cx, y - 0.0, z0 + h / 2), col=col, mat=mats["black_metal_matte"])]


def media_wall(col, mats, w=2.32, wood="oak_veneer", back="lacquer_sand", top="lacquer_cream"):
    """A's TV wall (render 17): a niche framed in light oak to the ceiling,
    a cream lacquer panel behind a black 75" television, cream handleless
    cupboards across the top, and a low oak console with a 40 mm top
    overhanging two doors that meet in the middle, each with a short brass
    tab on its top edge, on a recessed plinth. Its back is at y = -d/2.

    The cupboards over the niche and the console's are hollow, white
    inside, a shelf in each; the cupboards' doors open from the middle,
    the console's drop as flaps. The television and its panel stay where
    they were."""
    wd, bk, cr = mats[wood], mats[back], mats[top]
    dark, white, t = mats["kitchen_gap"], mats["cab_white"], BOARD
    d = 0.5
    y0 = -d / 2
    fw = 0.04
    xa, xb = -w / 2 + fw, w / 2 - fw
    xm = (xa + xb) / 2
    parts = [_block(col, wd, -w / 2, xa, y0, y0 + d, 0, FULL, "frame"), _block(col, wd, xb, w / 2, y0, y0 + d, 0, FULL, "frame"),
             _block(col, bk, xa, xb, y0, y0 + 0.02, 0.45, 2.18, "panel")]

    def cupboards(za, zb, face):
        """The two cupboards of a pair of doors that meet in the middle,
        from za to zb, hollow behind them — white, a board under them and
        between them, a shelf in each, their edges dark — the doors hung
        on their outer edges, by the oak frame."""
        body = face - FT - 0.001
        out = [_board(col, white, dark, xa, xb, y0, body, za, za + t), _board(col, white, None, xa, xb, y0, y0 + t, za + t, zb, "back"),
               _board(col, white, dark, xm - t / 2, xm + t / 2, y0 + t, body, za + t, zb)]
        mid = (za + t + zb) / 2
        for a, b in ((xa, xm - t / 2), (xm + t / 2, xb)):
            out.append(_board(col, white, None, a + 0.001, b - 0.001, y0 + t - 0.001, body - 0.01, mid - t / 2, mid + t / 2, "shelf"))
        return out, body

    # Cupboards over the niche to the ceiling: two doors, cream underneath,
    # a top in the solid carcass's colour.
    cd = 0.38
    inside, body = cupboards(2.195, FULL - t, y0 + cd)
    parts += inside + [_block(col, cr, xa, xb, y0, body, 2.18, 2.195, "underside"),
                       _board(col, white, dark, xa, xb, y0, body, FULL - t, FULL, up=True)]
    parts += _hang([_slab(col, cr, xa, xm, 2.18, FULL, y0 + cd)], xa, xm, y0 + cd, -1, col)
    parts += _hang([_slab(col, cr, xm, xb, 2.18, FULL, y0 + cd)], xm, xb, y0 + cd, 1, col)
    # The console: a recessed plinth, a carcass, two doors, the top over
    # them; each door's brass tab near the middle, on its top edge.
    ch, tt = 0.45, 0.04
    cy1 = y0 + d - 0.04                     # its doors' face, the top 40 mm proud of it
    parts.append(_block(col, mats["kitchen_gap"], xa, xb, y0, y0 + 0.4, 0, 0.07, "plinth"))
    inside, body = cupboards(0.07, ch - tt, cy1)
    parts += inside
    parts.append(_block(col, wd, xa, xb, y0, y0 + d, ch - tt, ch, "top", bevel=0.002))
    # Each 1.1 m door is a flap: it drops on a hinge along its foot, its
    # brass tab at its top, to lie level a hand over the floor, 34 cm into
    # the room — where a door swung on its side would sweep a quarter of a
    # circle 1.1 m across the floor before the TV.
    for s, (a, b) in ((-1, (xa, xm)), (1, (xm, xb))):
        tab = _block(col, mats["brass"], xm + s * 0.12 - 0.04, xm + s * 0.12 + 0.04, cy1 - 0.001, cy1 + 0.012,
                     ch - tt - 0.03, ch - tt - 0.002, "pull", bevel=0.001)
        parts += g.hinged([_slab(col, wd, a, b, 0.07, ch - tt, cy1), tab], ((a + b) / 2, cy1, 0.07 + GAP), -K_SWING, col,
                          label="door", axis=(1, 0, 0))
    parts += _tv(col, mats, 0, y0 + 0.02, 0.95, 1.66, 0.94)
    # A dark bowl on the console, at one end.
    parts += _bowl(col, mats, xa + 0.3, y0 + d / 2, ch, r=0.1, h=0.06, mat="ceramic_dark")
    return parts


def tv_volume(col, mats, w=2.6, d=0.4, wood="oak_rift", tv=(1.43, 0.81), niche=True, tv_x=0.1, joints=()):
    """B's and C's TV wall (render 20): a block to the ceiling, standing
    `d` out from the wall (it boxes in the flat's entry wardrobes), clad in
    rift-cut oak with its grain upright, a 65" television flush on it, its
    lower edge 1 m up, an open niche at the floor at its right-hand end
    (as seen from the front: -X), dark inside, and a shadow gap under the
    ceiling (its top at 2.72 m). `tv_x`: the television's centre, +X being
    the viewer's left; `joints`: x of hairline door joints, from the niche's
    top (or the floor) to the top.

    Each stretch of the block between two joints, or a joint and its end,
    that the television does not hang on is the door of a closet behind it
    (_closet), the joint the gap round it; a joint with no door beside it
    stays a dark line. The television stays where it was."""
    wd = mats[wood]
    top = FULL - 0.02
    y0 = -d / 2
    parts = []
    tw, th = tv
    edges = [-w / 2] + sorted(joints) + [w / 2]
    doors = [(a, b) for a, b in zip(edges, edges[1:]) if joints and (b <= tv_x - tw / 2 or a >= tv_x + tw / 2)]
    nw, nh = 0.6, 0.35
    nx0, nx1 = -w / 2 + 0.03, -w / 2 + 0.03 + nw
    if not doors:
        if niche:
            parts += [_block(col, wd, nx1, w / 2, y0, y0 + d, 0, top, "body"),
                      _block(col, wd, -w / 2, nx1, y0, y0 + d, nh, top, "body"),
                      _block(col, wd, -w / 2, nx0, y0, y0 + d, 0, nh, "body")]
        else:
            parts.append(_block(col, wd, -w / 2, w / 2, y0, y0 + d, 0, top, "body"))
    else:
        lo = nh if niche else 0.0
        # The block but for its closets, a joint's half-width from each,
        # to the floor where nothing is cut from under it; what is left
        # under the closets but the niche.
        solid, x = [], -w / 2
        for a, b in doors:
            if a - x > 1e-6:
                solid.append((x, a - GAP))
            x = b + GAP if b < w / 2 - 1e-6 else w / 2
        if w / 2 - x > 1e-6:
            solid.append((x, w / 2))
        for sa, sb in solid:
            parts.append(_block(col, wd, sa, sb, y0, y0 + d, 0, top, "body"))
        if lo:
            low = [(-w / 2, nx0), (nx1, w / 2)] if niche else [(-w / 2, w / 2)]
            for sa, sb in solid:
                low = [p for a, b in low for p in ((a, min(b, sa)), (max(a, sb), b)) if p[1] - p[0] > 1e-6]
            for a, b in low:
                parts.append(_block(col, wd, a, b, y0, y0 + d, 0, lo, "body"))
        for a, b in doors:
            # Hung away from the nearer end of the block, which stands against a wall.
            parts += _closet(col, mats, wd, a, b, lo, top, y0, y0 + d, -1 if (a + b) / 2 > 0 else 1,
                             (a <= -w / 2 + 1e-6, b >= w / 2 - 1e-6))
    if niche:
        parts += [_block(col, mats["kitchen_gap"], nx0, nx1, y0, y0 + 0.05, 0, nh, "niche"),
                  _block(col, mats["wood_dark"], nx0, nx1, y0, y0 + d - 0.015, 0, 0.02, "niche")]
    parts += _tv(col, mats, tv_x, y0 + d, 1.0, tw, th, t=0.022)
    for jx in joints:
        if any(abs(jx - a) < 1e-6 or abs(jx - b) < 1e-6 for a, b in doors):
            continue
        # A 3 mm dark line, a millimetre proud of the oak.
        parts.append(_block(col, mats["kitchen_gap"], jx - 0.0015, jx + 0.0015, y0 + d - 0.004, y0 + d + 0.001,
                            0.35 if niche else 0.0, top, "joint"))
    return parts


def _closet(col, mats, wd, a, b, lo, top, back, face, hand, ends):
    """A closet in a block of `wd` (tv_volume), from a to b and lo to top,
    its back on the wall at `back`, its door's face at `face`: white
    inside, a shelf at 2 m and a rail under it; at an end of the block
    (`ends`, left and right) a side in the block's oak outside, at a joint a
    board behind it, its edge dark, against the block beside it; the floor
    oak underneath, where it is the niche's ceiling, the top oak above, as
    the block was. The door hangs on its `hand` edge ("closet")."""
    white, dark, t = mats["cab_white"], mats["kitchen_gap"], BOARD
    body = face - FT - 0.001
    la = a if ends[0] else a - GAP
    rb = b if ends[1] else b + GAP
    ia, ib = la + t, rb - t
    edge = lambda end: wd if end else dark   # noqa: E731
    parts = [_faced(col, white, la, ia, back, body, lo, top, "side", front=edge(ends[0]), left=wd, top=wd, bottom=wd),
             _faced(col, white, ib, rb, back, body, lo, top, "side", front=edge(ends[1]), right=wd, top=wd, bottom=wd),
             _faced(col, white, ia, ib, back, body, lo, lo + t, "floor", front=dark, bottom=wd),
             _faced(col, white, ia, ib, back, body, top - t, top, "carcass", front=dark, top=wd),
             _faced(col, white, ia, ib, back, back + t, lo + t, top - t, "back")]
    shelf = min(top - 0.40, 2.0)
    parts.append(_faced(col, white, ia + 0.001, ib - 0.001, back + t - 0.001, body - 0.01, shelf - t / 2, shelf + t / 2, "shelf"))
    parts.append(g.cylinder("rail", 0.012, ib - ia + 0.002, loc=((ia + ib) / 2, (back + t + body) / 2, shelf - t / 2 - 0.07),
                            rot=(0, PI / 2, 0), col=col, mat=mats["steel"], segments=12))
    return parts + _hang([_slab(col, wd, a, b, lo, top, face)], a, b, face, hand, col, label="closet")


def tv_wall(col, mats, w=1.23, h=0.72):
    """A wall-hung 55" television (plans AB1): a frameless black screen
    `w` x `h` on a flush bracket, 5 cm off the wall in all. Its back at
    y = 0 (the wall), facing +Y; its lower edge at z = 0."""
    m = mats["black_metal_matte"]
    parts = [_block(col, m, -0.2, 0.2, 0.0, 0.004, h / 2 - 0.15, h / 2 + 0.15, "bracket"),
             _block(col, m, -0.16, -0.13, 0.004, 0.016, h / 2 - 0.13, h / 2 + 0.13, "bracket"),
             _block(col, m, 0.13, 0.16, 0.004, 0.016, h / 2 - 0.13, h / 2 + 0.13, "bracket")]
    parts += _tv(col, mats, 0.0, 0.025, 0.0, w, h, t=0.025)
    return parts


def _eased_prism(name, outline, z0, z1, col, mat, ease=0.004):
    """A flat shape `outline` (x, y) from z0 to z1, the edges of its top and
    bottom eased: table tops, slab legs."""
    import bmesh
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    n = len(outline)
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if ease:
        edges = [e for e in bm.edges if (e.verts[0] in top and e.verts[1] in top) or (e.verts[0] in bot and e.verts[1] in bot)]
        bmesh.ops.bevel(bm, geom=edges, offset=ease, segments=2, profile=0.5, affect="EDGES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = g._finish(mesh, name, col, mat, None, None, False)
    # Smooth round the sides, crisp on the faces.
    for p in obj.data.polygons:
        p.use_smooth = abs(p.normal.z) < 0.5
    return obj


def _stadium(length, width, segments=10):
    """A plan with half-round ends, `length` along X."""
    r = width / 2
    pts = []
    for cx, a0 in ((length / 2 - r, -PI / 2), (-length / 2 + r, PI / 2)):
        for i in range(segments + 1):
            a = a0 + PI * i / segments
            pts.append((cx + r * math.cos(a), r * math.sin(a)))
    return pts


def _band(name, radius, a0, a1, z0, z1, t, col, mat, cy=0.0, n=16):
    """A strip of bent plywood: an arc of `radius` about (0, cy) from angle
    a0 to a1 (0 = +X, anticlockwise), z0 to z1 high, `t` thick."""
    import bmesh
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((rr * c, cy + rr * s, z)) for rr, z in
                      ((radius, z0), (radius, z1), (radius - t, z1), (radius - t, z0))])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((a[k], b[k], b[j], a[j]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, None, None, True)


def dining_table(col, mats, w=2.00, d=0.95, wood="oak_pale", base=0.55):
    """A pale oak table (render 18), its top 40 mm with corners rounded to
    0.15 m, on a base of flat, sharp-edged oak slabs: a long panel down its
    middle, a short one across under each end of it, `base` of its length."""
    wd = mats[wood]
    top = 0.75
    t = 0.04
    L = w * base
    parts = [_eased_prism("top", g.rounded_rect(w, d, 0.15, 7), top - t, top, col, wd, ease=0.004),
             _block(col, wd, -L / 2, L / 2, -0.035, 0.035, 0, top - t, "panel", bevel=0.0015)]
    for sx in (-1, 1):
        parts.append(_block(col, wd, sx * L / 2 - 0.035, sx * L / 2 + 0.035, -d * 0.26, d * 0.26, 0, top - t, "panel", bevel=0.0015))
    return parts


def round_table(col, mats, r=0.525, top="microcement", base="microcement", h=0.75, t=0.06, drum=0.225):
    """A round table on a broad drum, its top `t` thick with a full bullnose
    edge — B's and C's cream microcement one, or the terraces' green one."""
    prof = [(0.2, h - t)]
    for i in range(9):
        a = -PI / 2 + PI * i / 8
        prof.append((r - t / 2 + t / 2 * math.cos(a), h - t / 2 + t / 2 * math.sin(a)))
    prof.append((r - t, h))
    parts = [_lathe("top", prof, col, mats[top], segments=48, closed=True, center_dz=0.0)]
    parts.append(g.cylinder("drum", drum, h - t + 0.002, loc=(0, 0, (h - t) / 2 + 0.001), col=col,
                            mat=mats[base], segments=40))
    return parts


def shell_chair(col, mats, fabric="weave_beige"):
    """A dining chair upholstered in a smooth beige weave (render 18): a
    60 mm seat pad with rounded edges, a shell back 0.45 x 0.32 m curving
    round, its top at 0.82 m; black tapered square legs, the back pair
    rising behind the shell to hold it."""
    f, m = mats[fabric], mats["black_metal_matte"]
    w, d = 0.47, 0.52
    parts = [_pillow("seat", (w, d - 0.05, 0.06), (0, 0.02, 0.46), col, f, r=0.026, puff=0.1, crease=0.001, cuts=5, seed=1)]
    parts.append(_pillow("back", (0.45, 0.04, 0.32), (0, -d / 2 + 0.025, 0.66), col, f, rot=(0.16, 0, 0), r=0.018, puff=0.08,
                         crease=0.001, cuts=6, seed=2, bend=0.07))

    def leg(x0, y0, z0, x1, y1, z1):
        from mathutils import Quaternion, Vector
        a, b = Vector((x0, y0, z0)), Vector((x1, y1, z1))
        dv = b - a
        o = g.cone("leg", 0.0125, 0.0075, dv.length, loc=tuple((a + b) / 2), col=col, mat=m, segments=4)
        # Along the leg, then its square section turned 45 degrees about its own axis.
        o.rotation_euler = (dv.to_track_quat("Z", "Y") @ Quaternion((0, 0, 1), PI / 4)).to_euler()
        return o

    for sx in (-1, 1):
        x = sx * (w / 2 - 0.05)
        parts.append(leg(x, d / 2 - 0.07, 0.43, x + sx * 0.025, d / 2 - 0.04, 0.0))
        # The back leg runs on up behind the shell.
        parts.append(leg(x * 0.8, -d / 2 + 0.06, 0.43, x + sx * 0.025, -d / 2 + 0.03, 0.0))
        parts.append(leg(x * 0.8, -d / 2 + 0.063, 0.43, x * 0.75, -d / 2 + 0.004, 0.78))
    parts.append(g.box("rail", (w - 0.12, 0.02, 0.02), loc=(0, -d / 2 + 0.06, 0.42), col=col, mat=m))
    return parts


def oak_chair(col, mats, wood="oak_chair"):
    """A light oak chair after Muuto's Cover: a flat solid seat on straight
    front legs, the back legs rising and leaning back to a wide band of
    bent plywood curving round the sitter (render 19)."""
    wd = mats[wood]
    w, d = 0.50, 0.50
    seat = 0.45
    parts = [_eased_prism("seat", g.rounded_rect(w - 0.02, d - 0.04, 0.05, 4), seat - 0.022, seat, col, wd, ease=0.004)]
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.04)
        parts.append(g.cone("leg", 0.016, 0.019, seat - 0.022, loc=(x, d / 2 - 0.07, (seat - 0.022) / 2), col=col, mat=wd,
                            segments=10))
        top = (x * 1.03, -d / 2 + 0.004, 0.76)
        parts.append(g.sweep("back_leg", g.catmull_rom([(x, -d / 2 + 0.07, 0.0), (x, -d / 2 + 0.06, seat - 0.03),
                                                         (x * 1.02, -d / 2 + 0.012, 0.64), top], 4),
                             0.018, sides=8, col=col, mat=wd))
        parts.append(g.sphere("cap", 0.018, loc=top, col=col, mat=wd, scale=(1, 1, 0.6), subdivisions=2))
        parts.append(g.box("rail", (0.022, d - 0.14, 0.05), loc=(x, 0.0, seat - 0.05), col=col, mat=wd, bevel=0.004))
    parts.append(g.box("rail", (w - 0.1, 0.022, 0.05), loc=(0, d / 2 - 0.07, seat - 0.05), col=col, mat=wd, bevel=0.004))
    parts.append(_band("back", 0.33, PI * 1.5 - 0.95, PI * 1.5 + 0.95, 0.64, 0.775, 0.014, col, wd, cy=-d / 2 + 0.270))
    return parts


def vase_zigzag(col, mats, h=0.25):
    """A cream ceramic bottle vase painted with terracotta zig-zag bands."""
    k = h / 0.25
    prof = [(0.055 * k, 0.0), (0.072 * k, 0.03 * k), (0.08 * k, 0.09 * k), (0.07 * k, 0.16 * k), (0.035 * k, 0.21 * k),
            (0.022 * k, 0.235 * k), (0.026 * k, 0.25 * k), (0.019 * k, 0.25 * k), (0.016 * k, 0.225 * k)]
    parts = [_lathe("vase", prof, col, mats["porcelain_matte"], segments=24)]

    def radius(z):
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            if z0 <= z <= z1 and z1 > z0:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return prof[0][0]

    m = mats["terracotta"]
    for z in (0.06, 0.14, 0.175):
        zz = z * k
        rr = radius(zz) + 0.0012
        parts.append(g.sweep("band", [(rr * math.cos(2 * PI * i / 40), rr * math.sin(2 * PI * i / 40), zz) for i in range(41)],
                             0.0022, sides=4, col=col, mat=m))
    for zc, amp in ((0.1, 0.022), (0.155, 0.01)):
        pts = []
        for i in range(49):
            zz = (zc + (amp if i % 2 else -amp)) * k
            rr = radius(zz) + 0.0012
            a = 2 * PI * i / 48
            pts.append((rr * math.cos(a), rr * math.sin(a), zz))
        parts.append(g.sweep("zigzag", pts, 0.0018, sides=4, col=col, mat=m))
    return parts


def _ring_loops(profile, segments, rad=lambda a, r, z: r, height=lambda a, r, z: z):
    """Loops for a loft from (radius, z) points, each point's radius and
    height bent round the circle by `rad` and `height` (angle, r, z)."""
    return [[(rad(2 * PI * i / segments, r, z) * math.cos(2 * PI * i / segments),
              rad(2 * PI * i / segments, r, z) * math.sin(2 * PI * i / segments),
              height(2 * PI * i / segments, r, z)) for i in range(segments)] for r, z in profile]


def _cord(col, mats, top, bottom, mat="black_metal", canopy=0.05):
    m = mats[mat]
    return [g.cylinder("cord", 0.0028, top - bottom, loc=(0, 0, (top + bottom) / 2), col=col, mat=m, segments=6),
            g.cylinder("canopy", canopy, 0.02, loc=(0, 0, top - 0.01), col=col, mat=m, segments=24)]


# ---------------------------------------------------------------------
# A lamp's light
# ---------------------------------------------------------------------
#
# A lamp gives light (the bake, the switches, the live lamps) through a node
# extra `light: {at, power, color, glow, radius, room}`, as Wrenfield's do
# (furnish.py `_lamp`; app-notes.md, "Lights and fittings"): `at` where its
# bulb or LED is, in that node's own Blender coordinates; `power` the bake's
# watts; `glow` the material of the bulb, lens or diffuser, which the bake
# splits out as the bulb (bake_public.py part_bulbs: that material's faces
# within `radius` + 12 mm of `at`) and the app lights as the switch is;
# `room`, that it is on its room's ceiling switch, not one of its own
# (Fittings.js gatherLights; a lamp out of doors keeps its own).

#: A bulb's warm white (2700 K, as Wrenfield's lamps) and an LED's (3000 K,
#: as the house's own ceiling lights, Fittings.js).
BULB = "#ffcf99"
LED = "#ffd6a3"


def _glow(mats, name, piece):
    """`mats[name]` as a material of the piece's own, `<name>_<piece>`, the
    same in all but its name: what a lamp's light names as its `glow`. The
    bake finds a bulb by that name, and a publish keys a second model's
    material of the same name `<name>#1` (StaticBatcher.js materialKeys), so
    no two catalogue pieces may share one."""
    own = f"{name}_{piece}"
    mat = bpy.data.materials.get(own)
    if mat is None:
        mat = mats[name].copy()
        mat.name = own
    return mat


def _light(head, power, color, room=True):
    """One light of a lamp: at the middle of `head` — its bulb, lens or
    diffuser, a part in the glow material — reaching its farthest corner,
    so that the bake takes all of it as the bulb. In the coordinates the
    piece is built in; the export moves it with the piece (`place_lights`)."""
    mw = g.world_matrix(head)
    pts = [mw @ v.co for v in head.data.vertices]
    at = [(min(p[k] for p in pts) + max(p[k] for p in pts)) / 2 for k in range(3)]
    reach = max(math.dist(p, at) for p in pts)
    return {"at": at, "power": power, "color": color, "glow": head.data.materials[0].name,
            "radius": math.ceil(reach * 1000 - 1e-6) / 1000, "room": room}


def _lit(parts, *lights):
    """Give a piece its lamp's lights (`_light`), one a bulb or head. They
    ride to the export on the first part that stays put (not a door's or a
    drawer's), which the piece's own object is made of: geometry.join_piece
    merges the others into it."""
    body = next(p for p in parts if p is not None and p.type == "MESH" and p.get("unit") is None)
    body["lamp_lights"] = json.dumps(lights)
    return parts


def place_lights(obj, shift):
    """A piece's lamp lights (`_lit`) as the app reads them, once the export
    has centred it: each moved by the same `shift` as its vertices, then a
    `light` on the piece's own node for a lamp with one, or on a node of its
    own at each head for a lamp with several (a track's spots and LEDs:
    Fittings.js gathers every node's)."""
    data = obj.get("lamp_lights")
    if data is None:
        return
    del obj["lamp_lights"]
    lights = json.loads(data)
    for light in lights:
        light["at"] = [round(a - s, 4) for a, s in zip(light["at"], shift)]
    if len(lights) == 1:
        obj["light"] = lights[0]
        return
    for k, light in enumerate(lights, 1):
        head = bpy.data.objects.new(f"{obj.name}.light{k}", None)
        head.location = light["at"]
        head["light"] = {**light, "at": [0.0, 0.0, 0.0]}
        head.parent = obj
        for c in obj.users_collection:
            c.objects.link(head)


def pendant_felt(col, mats, r=0.40, h=0.45, drop=1.25, mat="felt_olive"):
    """A ribbed olive felt dome, Ø0.8 m and 0.45 high, with a narrow brim
    at its rim, on a black cord: its rim `drop` under the ceiling (0.75 m
    over a table in a 2.75 m room)."""
    ribs = 56
    seg = ribs * 6                          # six samples a rib, or the ribs alias into jagged facets

    def rib(a, rr, z):
        # Soft round ribs, fading out towards the crown and the brim.
        k = min(1.0, (z - 0.02) / 0.05, (h - 0.05 - z) / 0.08) if 0.02 < z < h - 0.05 else 0.0
        return rr * (1 + 0.012 * k * math.cos(ribs * a))

    prof = [(r + 0.025, 0.0), (r + 0.025, 0.008), (r, 0.012)]
    for t in range(1, 10):
        a = (PI / 2) * t / 10
        prof.append((r * math.cos(a), 0.012 + (h - 0.012) * math.sin(a)))
    prof.append((0.035, h))
    loops = _ring_loops(prof, seg, rad=rib)
    parts = [g.loft("dome", loops, center=(0, 0, h + 0.004), sharp=(1,), col=col, mat=mats[mat])]
    # A pale lining inside, so its underside glows, and the lamp.
    inner = _ring_loops([(r - 0.012, 0.008), (r * 0.62, h * 0.7), (0.05, h - 0.02)], 40)
    parts.append(g.loft("lining", list(reversed(inner)), col=col, mat=mats["linen_white"]))
    bulb = g.sphere("bulb", 0.05, loc=(0, 0, h - 0.09), col=col, mat=_glow(mats, "opal", "pendant_felt"), subdivisions=2)
    parts.append(bulb)
    parts += _cord(col, mats, drop, h, canopy=0.06)
    # Over a dining table, its whole light thrown down by the dome.
    return _lit(parts, _light(bulb, 60.0, BULB))


def pendant_pleat(col, mats, r=0.25, h=0.28, drop=1.2):
    """A soft white pleated fabric pendant in two tiers, Ø0.5 m (render
    20): a straight, finely pleated cone with a broad flat top, over a
    flared lower tier whose hem folds unevenly round, on a white cord
    under a disc canopy."""
    n = 96
    m = mats["pleat_white"]

    def pleat(amp):
        return lambda a, rr, z: rr * (1 + (amp if int(a / (2 * PI) * n) % 2 else -amp))

    up = _ring_loops([(r * 0.98, h * 0.24), (r * 0.3, h)], n, rad=pleat(0.008))
    parts = [g.loft("upper", up, center=(0, 0, h), col=col, mat=m, smooth=False)]

    def hem_r(a, rr, z):
        k = 1 + (0.06 * math.sin(2 * a + 0.6) + 0.03 * math.sin(5 * a)) * (1 - z / (h * 0.45))
        return pleat(0.01)(a, rr * k, z)

    def hem_z(a, rr, z):
        return z + (0.02 * math.sin(2 * a + 0.6) + 0.01 * math.sin(3 * a + 2.0) if z < 0.05 else 0.0)

    low = _ring_loops([(r * 1.04, 0.0), (r * 0.86, h * 0.4)], n, rad=hem_r, height=hem_z)
    parts.append(g.loft("lower", low, col=col, mat=m, smooth=False))
    bulb = g.sphere("bulb", 0.045, loc=(0, 0, h * 0.55), col=col, mat=_glow(mats, "opal", "pendant_pleat"), subdivisions=2)
    parts.append(bulb)
    parts += _cord(col, mats, drop, h, mat="pleat_white", canopy=0.055)
    # Over a kitchen's round table: a smaller shade than the felt dome's.
    return _lit(parts, _light(bulb, 40.0, BULB))


def pendant_woven(col, mats, r=0.35, h=0.30, drop=0.95):
    """The pergolas' pendant (render 22): a wide, shallow cone 0.7 m across,
    solid matte black over its upper 60%, a dense band of black rattan
    woven round its lower rim — wefts over and under stakes running down
    the cone — a globe bulb hanging bare in it, on a black cord."""
    m = mats["black_metal_matte"]
    rt = mats["rattan_weave"]
    top_r = 0.05
    fb = 0.40                                  # where the band gives way to the solid cone

    def at(f):
        # The cone's radius and height a share `f` of the way from its rim to its crown.
        return r - (r - top_r) * f, h * f * (1 - 0.15 * (1 - f))

    # The solid cone: a 3 mm shell, up the outside, over the crown's lip
    # and down the inside, closed under its foot (which the band hides).
    seg = 64
    up = [at(fb + (1 - fb) * k / 10) for k in range(11)]
    loops = [[((rr + 0.0015) * math.cos(2 * PI * i / seg), (rr + 0.0015) * math.sin(2 * PI * i / seg), z) for i in range(seg)]
             for rr, z in up]
    loops += [[((rr - 0.0015) * math.cos(2 * PI * i / seg), (rr - 0.0015) * math.sin(2 * PI * i / seg), z) for i in range(seg)]
              for rr, z in reversed(up)]
    loops.append(loops[0])
    parts = [g.loft("shade", loops, col=col, mat=m),
             g.cylinder("crown", top_r + 0.004, 0.012, loc=(0, 0, h + 0.004), col=col, mat=m, segments=32)]
    # The band: stakes running down the cone from under the solid part to
    # the rim, and wefts woven round them, each row passing over the stakes
    # the last one passed under.
    stakes = 60
    for i in range(stakes):
        a = 2 * PI * (i + 0.5) / stakes
        pts = []
        for k in range(6):
            rr, z = at((fb + 0.01) * (1 - k / 5))
            pts.append(((rr - 0.0015) * math.cos(a), (rr - 0.0015) * math.sin(a), z))
        parts.append(g.sweep("stake", pts, 0.0025, sides=3, col=col, mat=rt))
    rows = 14
    for j in range(rows):
        f = fb * (j + 0.35) / rows
        rr, z = at(f)
        n = stakes * 2
        ring = []
        for i in range(n + 1):
            a = 2 * PI * i / n
            rad = rr + 0.0032 * math.cos(stakes * a + PI * j)
            ring.append((rad * math.cos(a), rad * math.sin(a), z))
        parts.append(g.sweep("weft", ring, 0.0045, sides=3, col=col, mat=rt))
    # The rim: a stouter round of cane binding the band's edge.
    rr, z = at(0.0)
    parts.append(g.sweep("rim", [((rr + 0.001) * math.cos(2 * PI * i / 96), (rr + 0.001) * math.sin(2 * PI * i / 96), z)
                                 for i in range(97)], 0.005, sides=5, col=col, mat=rt))
    parts.append(g.cylinder("holder", 0.016, h - 0.16, loc=(0, 0, (h + 0.16) / 2), col=col, mat=m, segments=12))
    bulb = g.sphere("bulb", 0.07, loc=(0, 0, 0.095), col=col, mat=_glow(mats, "opal", "pendant_woven"), subdivisions=3)
    parts.append(bulb)
    parts += _cord(col, mats, drop, h, canopy=0.045)
    # Over a terrace's garden table, its globe hanging bare in the cone.
    return _lit(parts, _light(bulb, 40.0, BULB))


def track(col, mats, length=3.0, spots=4, leds=0):
    """A black magnetic track on the ceiling, `length` long along X, with
    `spots` black cylinder spots (Ø50 × 120 mm) hung from it at a slant,
    and `leds` white linear LED modules set into it. Its top is the
    ceiling, so it hangs from anchor "ceiling" at y = its height. Each spot
    and module is a light of its own, on the room's switch."""
    m = mats["black_metal_matte"]
    led = _glow(mats, "led_white", f"track_{round(length * 10)}_{spots}" + (f"_{leds}" if leds else ""))
    heads = []
    top = 0.16
    parts = [g.box("track", (length, 0.032, 0.03), loc=(0, 0, top - 0.015), col=col, mat=m, bevel=0.002, segments=1)]
    for s in (-1, 1):
        parts.append(g.box("cap", (0.006, 0.034, 0.032), loc=(s * (length / 2 - 0.003), 0, top - 0.016), col=col, mat=m))
    # Linear modules: diffusers flush in the channel's underside.
    led_w = 0.6
    led_x = []
    if leds:
        step = length / (leds + spots + 1)
        led_x = [-length / 2 + step * (spots // 2 + 1 + k * (spots + 1) / max(1, leds)) for k in range(leds)][:leds]
        led_x = [(-length / 4 if k == 0 else length / 4) for k in range(leds)] if leds == 2 else [0.0]
    for x in led_x:
        parts.append(g.box("led", (led_w, 0.022, 0.004), loc=(x, 0, top - 0.032), col=col, mat=led))
        heads.append(_light(parts[-1], 25.0, LED))
    free = [(-length / 2 + 0.25, length / 2 - 0.25)]
    xs = []
    if spots:
        span = length - 0.5
        for k in range(spots):
            x = -span / 2 + span * (k + 0.5) / spots
            # Keep clear of the LED modules.
            for lx in led_x:
                if abs(x - lx) < led_w / 2 + 0.06:
                    x = lx + (led_w / 2 + 0.08) * (1 if x >= lx else -1)
            xs.append(x)
    for k, x in enumerate(xs):
        tilt = 0.45 * (1 if k % 2 else -1)
        yaw = 0.0
        # The adapter in the track, a short stem, the cylinder aimed down and out.
        parts.append(g.box("adapter", (0.05, 0.026, 0.02), loc=(x, 0, top - 0.035), col=col, mat=m))
        parts.append(g.cylinder("stem", 0.006, 0.03, loc=(x, 0, top - 0.055), col=col, mat=m, segments=8))
        cz = top - 0.07 - 0.06 * math.cos(tilt)
        cy = 0.06 * math.sin(tilt)
        parts.append(g.cylinder("spot", 0.025, 0.12, loc=(x, cy, cz), rot=(tilt, 0, yaw), col=col, mat=m, segments=16))
        # The lens at its lower end.
        lz = cz - 0.0605 * math.cos(tilt)
        ly = cy + 0.0605 * math.sin(tilt)
        parts.append(g.cylinder("lens", 0.018, 0.002, loc=(x, ly, lz), rot=(tilt, 0, yaw), col=col, mat=led,
                                segments=12))
        heads.append(_light(parts[-1], 20.0, LED))
    return _lit(parts, *heads)


def wall_light(col, mats, w=0.80, r=0.0135):
    """The bedroom's wall light (render 21): a round tube 27 mm across and
    `w` long, held a centimetre off the wall on two slim stems, each inside
    a light oak sleeve: one over 0.15 m of its left end as seen from the
    front (+X), closed by a flat round end with a softened rim, one over
    0.10 m of its right end, rounded; between them an opal diffuser that
    reads ivory by day. Its back is at y = 0."""
    import bmesh
    cy, sl = 0.025, 0.15
    xs = w / 2 - sl

    def rod(name, profile, mat, segs=20):
        # A closed solid of revolution about the tube's axis from (x,
        # radius) points; a radius of 0 closes that end in a point.
        bm = bmesh.new()
        rings = []
        for x, rad in profile:
            if rad <= 0:
                rings.append([bm.verts.new((x, cy, 0.0))])
            else:
                rings.append([bm.verts.new((x, cy + rad * math.cos(2 * PI * i / segs), rad * math.sin(2 * PI * i / segs)))
                              for i in range(segs)])
        for a, b in zip(rings, rings[1:]):
            if len(a) == 1:
                for i in range(segs):
                    bm.faces.new((a[0], b[i], b[(i + 1) % segs]))
            elif len(b) == 1:
                for i in range(segs):
                    bm.faces.new((a[i], a[(i + 1) % segs], b[0]))
            else:
                for i in range(segs):
                    bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        return g._finish(mesh, name, col, mat, None, None, True)

    sr = r + 0.0008                          # the sleeves, over the tube
    xe = -w / 2 + 0.10                       # the right-hand sleeve's inner end
    dome = [(-w / 2 + sr * (1 - math.cos(a)), sr * math.sin(a)) for a in (PI / 2 * k / 6 for k in range(7))]
    parts = [rod("diffuser", [(xe - 0.004, 0), (xe - 0.004, r), (xs + 0.004, r), (xs + 0.004, 0)],
                 _glow(mats, "led_opal", "wall_light")),
             rod("sleeve", [(xs, 0), (xs, sr), (w / 2 - 0.0025, sr), (w / 2 - 0.0007, r - 0.0002),
                            (w / 2, r - 0.0022), (w / 2, 0)], mats["oak_veneer"]),
             rod("sleeve", dome + [(xe, sr), (xe, 0)], mats["oak_veneer"])]
    for x in (-w / 2 + 0.05, w / 2 - 0.09):
        parts.append(g.cylinder("stem", 0.005, cy, loc=(x, cy / 2, 0), rot=(PI / 2, 0, 0), col=col, mat=mats["lacquer_ivory"],
                                segments=10))
    # A bedside light, from the middle of its diffuser.
    return _lit(parts, _light(parts[0], 25.0, LED))


def slatted_table(col, mats, w=1.10, d=0.55, h=0.40, wood="oak_veneer"):
    """A low light-oak coffee table, its top of slats running across its
    width on a frame, square legs at the corners (render 17)."""
    wd = mats[wood]
    parts = []
    n = int(w / 0.045)
    gap = 0.012
    sw = (w - 0.08 - gap * (n - 1)) / n
    for i in range(n):
        x = -w / 2 + 0.04 + sw / 2 + i * (sw + gap)
        parts.append(g.box("slat", (sw, d - 0.08, 0.025), loc=(x, 0, h - 0.0125), col=col, mat=wd, bevel=0.002, segments=1))
    for s in (-1, 1):
        parts.append(_block(col, wd, s * w / 2 - (0.04 if s > 0 else 0), s * w / 2 + (0 if s > 0 else 0.04), -d / 2, d / 2,
                            h - 0.045, h, "rail", bevel=0.002))
        parts.append(_block(col, wd, -w / 2 + 0.04, w / 2 - 0.04, s * d / 2 - (0.04 if s > 0 else 0), s * d / 2 + (0 if s > 0 else 0.04),
                            h - 0.045, h, "rail", bevel=0.002))
        for t in (-1, 1):
            parts.append(_block(col, wd, s * w / 2 - (0.045 if s > 0 else 0), s * w / 2 + (0 if s > 0 else 0.045),
                                t * d / 2 - (0.045 if t > 0 else 0), t * d / 2 + (0 if t > 0 else 0.045), 0, h - 0.045, "leg",
                                bevel=0.002))
    return parts


def _armillary(col, mats, z, r=0.085):
    """An armillary sphere of flat dark-bronze bands, 12 mm wide and 2 mm
    thick (render 19), resting on its lowest band on a top at `z`."""
    import bmesh
    from mathutils import Matrix, Vector
    m = mats["bronze_dark"]
    bw, bt, n = 0.012, 0.002, 36
    c = Vector((0, 0, z + r))
    parts = []
    for rot in ((PI / 2, 0, 0.35), (PI / 2, 0, 0.35 + PI / 2), (PI / 2, 0, 0.35 + PI / 4), (0.0, 0, 0), (0.62, 0.0, 0.9)):
        mtx = Matrix.Rotation(rot[2], 3, "Z") @ Matrix.Rotation(rot[1], 3, "Y") @ Matrix.Rotation(rot[0], 3, "X")
        bm = bmesh.new()
        rings = []
        for i in range(n):
            a = 2 * PI * i / n
            ca, sa = math.cos(a), math.sin(a)
            rings.append([bm.verts.new(mtx @ Vector((rr * ca, rr * sa, hz)) + c)
                          for rr, hz in ((r, -bw / 2), (r, bw / 2), (r - bt, bw / 2), (r - bt, -bw / 2))])
        for i in range(n):
            a, b = rings[i], rings[(i + 1) % n]
            for k in range(4):
                j = (k + 1) % 4
                bm.faces.new((a[k], b[k], b[j], a[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new("band")
        bm.to_mesh(mesh)
        bm.free()
        parts.append(g._finish(mesh, "band", col, m, None, None, False))
    return parts


def stump(col, mats, r=0.32, h=0.45, sphere=True):
    """An organic drum of solid teak in a rounded-triangular plan (render
    19): long grain down its sides, a soft raised lip round its top, and
    inside it the end grain, dished a little and ringed. A dark-bronze
    armillary sphere of flat bands sits on it."""
    import bmesh
    import random
    seg = 48
    lip, dish = 0.93, 0.012

    def rad(a):
        return r * (1 + 0.09 * math.sin(3 * a + 1.0) + 0.03 * math.sin(5 * a + 0.4))

    def ring(k, z):
        return [(rad(2 * PI * i / seg) * k * math.cos(2 * PI * i / seg), rad(2 * PI * i / seg) * k * math.sin(2 * PI * i / seg), z)
                for i in range(seg)]

    side = [ring(k, z) for z, k in ((0.0, 0.95), (0.03, 0.985), (h * 0.5, 1.0), (h - 0.03, 0.99), (h - 0.008, 0.975),
                                    (h, 0.955), (h, lip))]
    parts = [g.loft("stump", side, sharp=(6,), col=col, mat=mats["wood_stump"])]
    # The top inside the lip: end grain in rings a few millimetres apart,
    # following the outline as a tree's do, the dish deepest at the middle.
    rnd = random.Random(11)
    ks, k, dark = [lip], lip, False
    while k > 0.04:
        k -= (rnd.uniform(0.0025, 0.0045) if dark else rnd.uniform(0.006, 0.014)) / r
        ks.append(max(k, 0.02))
        dark = not dark
    bm = bmesh.new()

    def z_at(k):
        t = min(1.0, max(0.0, (k / lip - 0.7) / 0.3))
        return h - dish * (1 - t * t * (3 - 2 * t))

    loops = [[bm.verts.new(p) for p in ring(k, z_at(k))] for k in ks]
    hub = bm.verts.new((0, 0, h - dish))
    for i, (a, b) in enumerate(zip(loops, loops[1:])):
        for j in range(seg):
            f = bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
            f.material_index = i % 2
    for j in range(seg):
        f = bm.faces.new((loops[-1][j], loops[-1][(j + 1) % seg], hub))
        f.material_index = (len(loops) - 1) % 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("endgrain")
    bm.to_mesh(mesh)
    bm.free()
    top = g._finish(mesh, "endgrain", col, mats["wood_endgrain"], None, None, True)
    top.data.materials.append(mats["wood_endgrain_ring"])
    parts.append(top)
    if sphere:
        parts += _armillary(col, mats, h - dish)
    return parts


def coffee_round(col, mats, r=0.30, h=0.40, mat="microcement"):
    """A low round drum table, Ø0.6 m (C1): ld-table-round's cream
    microcement — a bullnosed top 45 mm thick over a broad drum set in."""
    return round_table(col, mats, r=r, top=mat, base=mat, h=h, t=0.045, drum=r - 0.045)


def pouf(col, mats, w=0.38, h=0.42, fabric="linen_ecru"):
    """A square soft pouf `w` across and `h` high (C1): its edges rounded,
    its sides and top puffed out a little, its base flat on the floor."""
    w, h = w / 1.07, h / 1.025                   # the core, before the sides and top puff out to w and h
    p = _pillow("pouf", (w, w, h), (0, 0, h / 2), col, mats[fabric], r=0.07, puff=0.06, crease=0.003, cuts=8, seed=5,
                axis=0)
    hw, hh = w / 2, h / 2
    for v in p.data.vertices:
        x, y, z = v.co
        ux, uy, uz = min(1.0, abs(x) / hw), min(1.0, abs(y) / hw), min(1.0, abs(z) / hh)
        # The other pair of sides as _pillow puffed the first, and the top domed.
        v.co.y += y * 0.06 * (1 - ux * ux) * (1 - uz * uz)
        if z > 0:
            v.co.z += z * 0.05 * (1 - ux * ux) * (1 - uy * uy)
        else:
            v.co.z = max(z, -hh)
    return [p]


def rug_round(col, mats, r=1.0, mat="rug_rust"):
    return [_eased_prism("rug", [(r * math.cos(2 * PI * i / 72), r * math.sin(2 * PI * i / 72)) for i in range(72)], 0.0, 0.012,
                         col, mats[mat], ease=0.003)]


def art_dracaena(col, mats, w=0.45, h=0.9):
    """A framed print, portrait (render 17): a dracaena in a round
    terracotta vase against a warm, brushy yellow ground, in a deep light
    oak frame. Its back is at y = 0, its face towards +Y."""
    import random
    rnd = random.Random(5)
    wd = mats["oak_veneer"]
    fw, fd = 0.035, 0.05
    parts = [_block(col, wd, -w / 2, w / 2, 0, fd, 0, fw, "frame"), _block(col, wd, -w / 2, w / 2, 0, fd, h - fw, h, "frame"),
             _block(col, wd, -w / 2, -w / 2 + fw, 0, fd, fw, h - fw, "frame"),
             _block(col, wd, w / 2 - fw, w / 2, 0, fd, fw, h - fw, "frame"),
             _block(col, mats["art_ground"], -w / 2 + fw, w / 2 - fw, 0, fd - 0.012, fw, h - fw, "print")]
    y = fd - 0.0115

    def flat(name, pts, mat, dy=0.0):
        return g.polygon(name, list(pts), loc=(0, y + dy, 0), col=col, mat=mats[mat], rot=(PI / 2, 0, 0))

    # A warmer bloom of light behind the plant.
    parts.append(flat("glow", [(0.13 * math.cos(2 * PI * i / 28), 0.5 + 0.22 * math.sin(2 * PI * i / 28)) for i in range(28)],
                      "art_orange", 0.0004))
    # The vase: a round-bellied pot.
    prof = [(0.035, 0.06), (0.07, 0.1), (0.078, 0.15), (0.06, 0.2), (0.045, 0.22)]
    vase = [(r, z) for r, z in prof] + [(-r, z) for r, z in reversed(prof)]
    parts.append(flat("vase", vase, "terracotta", 0.0008))
    parts.append(flat("vase_light", [(0.02, 0.1), (0.05, 0.12), (0.055, 0.16), (0.03, 0.19)], "art_orange", 0.001))
    # Stems and crowns of long, arching strap leaves in mixed greens.
    for x1, top in ((-0.035, 0.52), (0.03, 0.66), (0.0, 0.78), (0.045, 0.47)):
        parts.append(flat("stem", [(x1 * 0.3 - 0.004, 0.21), (x1 * 0.3 + 0.004, 0.21), (x1 + 0.003, top), (x1 - 0.003, top)],
                          "bark_grey", 0.0012))
        for k in range(11):
            a = PI / 2 + (k - 5) * 0.3 + rnd.uniform(-0.08, 0.08)
            L = rnd.uniform(0.07, 0.13)
            droop = 0.02 * abs(k - 5) / 5
            mid = (x1 + L * 0.55 * math.cos(a), top + L * 0.55 * math.sin(a) + 0.01)
            tip = (x1 + L * math.cos(a), top + L * math.sin(a) - droop)
            nx, nz = -math.sin(a) * 0.006, math.cos(a) * 0.006
            parts.append(flat("leaf", [(x1, top), (mid[0] + nx, mid[1] + nz), tip, (mid[0] - nx, mid[1] - nz)],
                              ("leaf_dark", "leaf_mid", "leaf_stem")[k % 3], 0.0014 + 0.0001 * k))
    return parts


def shelf_cubes(col, mats, wood="oak_maple"):
    """B's wall shelf over the cabinet (render 19): a compact box unit of
    14 mm pale maple boards, 0.42 wide, 0.78 high and 0.22 deep, without a
    back — two columns: a half shelf at 0.58 across its left one, a divider
    under it down to a glass shelf at 0.36 across its right one — and thin
    glass shelves that run on out of it: at 0.36 and under the frame on its
    right, at 0.19 (across the whole unit) and at the half shelf's height on
    its left. On them: a black radio and a small plant out on the left, a
    big book face out and a few lying flat in the left column, a tall white
    vase in the right, a terracotta pot plant out on the right. Its back is at y = 0, facing +Y (its left being +X); its
    foot is the frame's underside."""
    wd, gl = mats[wood], mats["glass"]
    d, t, gt = 0.22, 0.014, 0.006
    H, W = 0.78, 0.42
    xl, xr = W / 2, -W / 2                       # the frame's left (+X) and right (-X) outer faces
    xm = 0.0                                     # the divider's middle
    zh, zm, zl = 0.578, 0.365, 0.186             # the half shelf's top, the glass shelves'
    parts = [_block(col, wd, xr, xl, 0, d, 0, t, "shelf"),
             _block(col, wd, xr, xl, 0, d, H - t, H, "shelf"),
             _block(col, wd, xl - t, xl, 0, d, t, H - t, "side"),
             _block(col, wd, xr, xr + t, 0, d, t, H - t, "side"),
             _block(col, wd, xm, xl - t, 0, d, zh - t, zh, "shelf"),
             _block(col, wd, xm - t / 2, xm + t / 2, 0, d, zm + 0.0005, zh - t, "divider")]
    # Glass, 6 mm, a touch shallower than the boards: through the frame and
    # out on one side, or out from its side alone.
    for xa, xb, z in ((xr - 0.17, xm + t / 2 - 0.002, zm), (xr + 0.002, xl + 0.15, zl), (xl - 0.002, xl + 0.15, zh - 0.002),
                      (xr - 0.18, xr + 0.002, t - 0.001)):
        parts.append(_block(col, gl, xa, xb, 0.004, d - 0.012, z - gt, z, "glass"))
    # Out on the left: the radio on the upper glass, a plant on the lower.
    parts.append(_block(col, mats["book_ink"], xl + 0.015, xl + 0.135, 0.06, 0.15, zh - 0.0015, zh + 0.058, "radio", bevel=0.004))
    parts.append(_block(col, mats["black_metal_matte"], xl + 0.03, xl + 0.05, 0.1501, 0.152, zh + 0.02, zh + 0.04, "dial"))
    parts.append(_block(col, mats["porcelain_matte"], xl + 0.07, xl + 0.12, 0.1501, 0.1515, zh + 0.035, zh + 0.045, "dial"))
    parts += _potted(col, mats, xl + 0.075, 0.11, zl, r=0.045, h=0.07, crown=0.08, pot="porcelain_matte")
    # In the left column: a big book face out against the wall, books lying flat.
    parts.append(g.box("book", (0.14, 0.022, 0.21), loc=(xl - t - 0.085, 0.03, zl + 0.106), col=col, mat=mats["book_ink"],
                       rot=(0.12, 0, 0), bevel=0.002, segments=1))
    for k in range(3):
        parts.append(g.box("book", (0.16 - k * 0.015, 0.12, 0.02), loc=(xm - 0.01, 0.12, zl + 0.0101 + k * 0.02), col=col,
                           mat=mats[("book_green", "paper", "book_green")[k]], bevel=0.0015, segments=1))
    # The tall white vase on the glass in the right column.
    parts.append(_lathe("vase", [(0.045, 0), (0.06, 0.08), (0.055, 0.2), (0.03, 0.28), (0.032, 0.3), (0.026, 0.3), (0.022, 0.27)], col,
                        mats["porcelain_matte"], loc=(xr + t + 0.075, 0.11, zm), segments=16))
    # Out on the right, under the frame: the terracotta pot plant.
    parts += _potted(col, mats, xr - 0.095, 0.11, t - 0.001, r=0.055, h=0.09, crown=0.09)
    return parts


def _potted(col, mats, x, y, z, r=0.06, h=0.09, crown=0.1, pot="terracotta"):
    parts = [_lathe("pot", [(r * 0.75, 0), (r, h), (r * 0.9, h), (r * 0.8, h * 0.85)], col, mats[pot], loc=(x, y, z), segments=14)]
    for k, (dx, dy, dz, rr) in enumerate(((0, 0, 0.6, 1.0), (0.4, 0.2, 0.4, 0.7), (-0.35, -0.1, 0.45, 0.75), (0.1, -0.3, 0.9, 0.6))):
        parts.append(g.sphere("leaves", crown * rr * 0.6, loc=(x + dx * crown, y + dy * crown, z + h + dz * crown), col=col,
                              mat=mats["leaf_mid"], scale=(1, 1, 0.8), subdivisions=1))
    return parts


def _pothos(col, mats, x, y, z):
    """A pothos in a little pot, its strands trailing over the edge."""
    parts = _potted(col, mats, x, y, z, r=0.05, h=0.07, crown=0.07, pot="porcelain_matte")
    for k, (dx, L) in enumerate(((-0.06, 0.22), (0.02, 0.3), (0.07, 0.16))):
        pts = [(x + dx * 0.5, y, z + 0.09), (x + dx, y + 0.12, z + 0.06), (x + dx * 1.3, y + 0.16, z - L * 0.4),
               (x + dx * 1.5, y + 0.15, z - L)]
        path = g.catmull_rom(pts, 3)
        parts.append(g.sweep("vine", path, 0.0025, sides=4, col=col, mat=mats["leaf_dark"]))
        for i, p in enumerate(path[2::2]):
            parts.append(g.sphere("leaf", 0.022, loc=(p[0] + 0.012 * (-1) ** i, p[1] + 0.01, p[2]), col=col, mat=mats["leaf_mid"],
                                  scale=(1, 0.4, 0.8), subdivisions=1))
    return parts


def sideboard(col, mats, w=2.40, d=0.45, h=0.75, wood="oak_mid", doors=None, plinth=False, fluted=False):
    """A low handleless oak sideboard (render 18): warm mid oak, standing
    on the floor like a built-in — no plinth unless asked — its doors
    joined by hairlines, a finger-pull shadow under the top. `fluted`: the
    doors reeded upright, a half-round reed every 25 mm, 3 mm deep.

    A cupboard behind each door, oak inside, the boards' front edges and
    the rail behind the finger pull dark as the solid carcass was, a shelf
    in each; the doors open in pairs from the middle, one left over towards
    its nearer end (_hands)."""
    wd, dark, t = mats[wood], mats["kitchen_gap"], BOARD
    n = doors or max(2, round(w / 0.6))
    pl = 0.06 if plinth else 0.0
    xa, xb = -w / 2 + 0.018, w / 2 - 0.018
    body = d / 2 - FT - 0.001                    # the carcass's front, a millimetre behind the doors
    floor = pl + t if plinth else 0.012          # the cupboards' floor
    under = h - 0.025                            # the top's underside
    z0, z1 = max(pl, 0.012), h - 0.045           # the doors, the finger pull's shadow over them
    parts = [_block(col, wd, -w / 2, xa, -d / 2, d / 2, 0, under, "side"),
             _block(col, wd, xb, w / 2, -d / 2, d / 2, 0, under, "side"),
             _block(col, wd, -w / 2, w / 2, -d / 2, d / 2, under, h, "top", bevel=0.002),
             _board(col, wd, None, xa, xb, -d / 2, -d / 2 + t, floor, under, "back"),
             _board(col, dark, dark, xa, xb, body - t, body, z1 - 0.012, under, "rail")]
    if plinth:
        parts += [_block(col, dark, -w / 2 + 0.04, w / 2 - 0.04, -d / 2, d / 2 - 0.05, 0, pl, "plinth"),
                  _board(col, wd, dark, xa, xb, -d / 2, body, pl, pl + t)]
    else:
        parts.append(_block(col, wd, -w / 2 + 0.018, w / 2 - 0.018, -d / 2 + 0.02, d / 2, 0, 0.012, "bottom"))
    dw = (w - 0.036) / n
    mods = [("door", xa + i * dw, xa + (i + 1) * dw) for i in range(n)]
    hands = _hands(mods, (False, False))
    for i, (_, x0, x1) in enumerate(mods):
        # Its cupboard: a board behind each joint, a shelf halfway up.
        if i:
            parts.append(_board(col, wd, dark, x0 - t / 2, x0 + t / 2, -d / 2 + t, body, floor, z1 - 0.012))
        ia, ib = (x0 + t / 2 if i else x0), (x1 - t / 2 if i < n - 1 else x1)
        mid = (floor + z1 - 0.012) / 2
        parts.append(_board(col, wd, None, ia + 0.001, ib - 0.001, -d / 2 + t - 0.001, body - 0.01, mid - t / 2, mid + t / 2, "shelf"))
        if not fluted:
            front = _slab(col, wd, x0, x1, z0, z1, d / 2)
        else:
            fa, fb = x0 + GAP, x1 - GAP
            k = max(1, round((fb - fa) / 0.025))
            reeds = []
            for j in range(k):
                for q in range(6):
                    u = q / 6
                    reeds.append((fb - (fb - fa) * (j + u) / k, d / 2 - 0.003 * (1 - math.sin(PI * u))))
            reeds.append((fa, d / 2 - 0.003))
            outline = [(fa, d / 2 - FT), (fb, d / 2 - FT)] + reeds
            front = _eased_prism("front", outline, z0 + GAP, z1 - GAP, col, wd, ease=0.0)
        parts += _hang([front], x0, x1, d / 2, hands[i][0], col)
    return parts


def table_lamp(col, mats, h=0.5, piece="table_lamp", lit=True):
    """A table lamp: a speckled grey granite column for a base, its
    shoulder rounded, a cream linen drum shade (render 19). `piece` names
    its bulb's material (`_glow`); `lit` gives it its light — a piece that
    moves it gives it its own, where it stands."""
    b = mats["brass_brushed"]
    hb = h * 0.48
    bulb = g.sphere("bulb", 0.03, loc=(0, 0, h * 0.63 + 0.027), col=col, mat=_glow(mats, "opal", piece), subdivisions=2)
    parts = [
        _lathe("base", [(0.056, 0.0), (0.062, 0.004), (0.062, hb - 0.05), (0.058, hb - 0.028), (0.045, hb - 0.011), (0.022, hb)],
               col, mats["granite_grey"], segments=28, center_dz=0.0),
        g.cylinder("stem", 0.008, h * 0.15, loc=(0, 0, h * 0.555), col=col, mat=b, segments=8),
        g.cylinder("holder", 0.014, 0.03, loc=(0, 0, h * 0.63 - 0.015), col=col, mat=b, segments=12),
        g.cylinder("shade", 0.15, h * 0.4, loc=(0, 0, h * 0.8), col=col, mat=mats["linen_shade"], segments=32, cap=False),
        bulb,
        # The spider: a rod up from the holder to a washer, three spokes to the shade's top ring.
        g.sweep("rod", [(0.0, 0.0, h * 0.63), (0.0, 0.0, h - 0.006)], 0.003, sides=6, col=col, mat=b),
        g.sweep("ring", [(0.149 * math.cos(2 * PI * i / 40), 0.149 * math.sin(2 * PI * i / 40), h - 0.004) for i in range(41)],
                0.0025, sides=5, col=col, mat=b),
    ]
    for k in range(3):
        a = 2 * PI * k / 3
        parts.append(g.sweep("spoke", [(0.0, 0.0, h - 0.006), (0.149 * math.cos(a), 0.149 * math.sin(a), h - 0.004)], 0.002, sides=5,
                             col=col, mat=b))
    # Beside a sofa or a bed, as bright as Wrenfield's lamps.
    return _lit(parts, _light(bulb, 30.0, BULB)) if lit else parts


def _triangle(col, mats, x, y, z, s=0.16, d=0.04):
    """A small sculpture: a solid oak tent `s` wide and `d` deep standing on
    z, a white triangle set in each face within a 12 mm oak border."""
    hh = s * 0.87
    b = 0.012
    tent = [(-s / 2, 0.0), (s / 2, 0.0), (0.0, hh)]
    # The inset: the outline moved in by `b` all round (the incentre's ratio).
    k = 1 - b * (s + 2 * math.hypot(s / 2, hh)) / (s * hh)
    cz = s * hh / (s + 2 * math.hypot(s / 2, hh))
    face = [(px * k, cz + (pz - cz) * k) for px, pz in tent]
    parts = [g.prism("triangle", tent, d, loc=(x, y + d / 2, z), rot=(PI / 2, 0, 0), col=col, mat=mats["oak_mid"])]
    for side in (1, -1):
        yy = y + side * (d / 2 + 0.0018) + (0.0 if side > 0 else 0.001)
        parts.append(g.prism("triangle_face", face, 0.001, loc=(x, yy, z), rot=(PI / 2, 0, 0), col=col, mat=mats["white_matte"]))
    return parts


def cabinet(col, mats, w=0.8, d=0.45, h=0.6):
    """A low two-door oak cabinet with a stone table lamp on it and three
    oak triangle sculptures (render 19)."""
    parts = sideboard(col, mats, w=w, d=d, h=h, doors=2, wood="oak_mid", plinth=True, fluted=True)
    # As render 19 has them seen from the front: the lamp on the left, the
    # sculptures on the right, a big one and a smaller pair, one behind the other.
    lamp = table_lamp(col, mats, piece="cabinet_lamp", lit=False)
    for p in lamp:
        p.location.x += 0.18
        p.location.z += h
        parts.append(p)
    parts += _triangle(col, mats, -0.06, 0.01, h, s=0.15)
    parts += _triangle(col, mats, -0.205, -0.04, h, s=0.12)
    parts += _triangle(col, mats, -0.25, 0.03, h, s=0.11)
    # The lamp's light, where it now stands.
    bulb = next(p for p in lamp if p.data.materials[0] == _glow(mats, "opal", "cabinet_lamp"))
    return _lit(parts, _light(bulb, 30.0, BULB))


def table_decor(col, mats):
    """The dining table's middle (render 18): two white pillar candles on
    round oak trays and a black turned candlestick with a taper."""
    parts = []
    for k, (x, ch) in enumerate(((-0.12, 0.11), (0.0, 0.16))):
        parts.append(g.cylinder("tray", 0.07, 0.025, loc=(x, 0.03 * k, 0.0125), col=col, mat=mats["oak_veneer"], segments=24))
        parts.append(g.cylinder("candle", 0.04, ch, loc=(x, 0.03 * k, 0.025 + ch / 2), col=col, mat=mats["porcelain_matte"],
                                segments=18))
    parts.append(_lathe("candlestick", [(0.04, 0), (0.04, 0.012), (0.018, 0.03), (0.025, 0.06), (0.012, 0.1), (0.02, 0.14),
                                        (0.01, 0.18), (0.016, 0.2), (0.012, 0.2)], col, mats["black_metal_matte"],
                        loc=(0.13, -0.02, 0), segments=14))
    parts.append(g.cylinder("taper", 0.009, 0.22, loc=(0.13, -0.02, 0.31), col=col, mat=mats["porcelain_matte"], segments=10))
    return parts


def sideboard_decor(col, mats):
    """For the sideboard (render 18), left to right as seen from the front:
    a plaster bust standing on two books, a herb in a white pot, a small
    tree in a terracotta one, and a black lantern with a candle."""
    m = mats["black_metal_matte"]
    lx = -0.55
    parts = [g.box("lantern_base", (0.14, 0.14, 0.02), loc=(lx, 0, 0.01), col=col, mat=m),
             g.box("lantern_top", (0.14, 0.14, 0.02), loc=(lx, 0, 0.27), col=col, mat=m),
             g.cone("lantern_roof", 0.1, 0.02, 0.06, loc=(lx, 0, 0.31), col=col, mat=m, segments=4),
             g.box("glass", (0.12, 0.12, 0.23), loc=(lx, 0, 0.14), col=col, mat=mats["glass"]),
             g.cylinder("candle", 0.03, 0.08, loc=(lx, 0, 0.06), col=col, mat=mats["porcelain_matte"], segments=12)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(g.box("post", (0.01, 0.01, 0.26), loc=(lx + sx * 0.065, sy * 0.065, 0.14), col=col, mat=m))
    parts += _potted(col, mats, -0.05, 0, 0, r=0.06, h=0.11, crown=0.11, pot="porcelain_matte")
    parts += _potted(col, mats, -0.3, 0.02, 0, r=0.08, h=0.13, crown=0.17)
    parts.append(g.box("book", (0.24, 0.17, 0.035), loc=(0.15, 0, 0.0175), col=col, mat=mats["book_ink"], bevel=0.002))
    parts.append(g.box("book", (0.21, 0.15, 0.03), loc=(0.15, 0, 0.05), col=col, mat=mats["paper"], bevel=0.002))
    pl = mats["plaster"]
    parts.append(_lathe("bust_base", [(0.05, 0), (0.045, 0.03), (0.03, 0.05), (0.09, 0.1), (0.07, 0.17), (0.035, 0.18),
                                      (0.035, 0.2)], col, pl, loc=(0.15, 0, 0.065), segments=16))
    parts.append(g.sphere("head", 0.065, loc=(0.15, 0.01, 0.065 + 0.27), col=col, mat=pl, scale=(0.85, 1.0, 1.15), subdivisions=2))
    return parts


def alocasia(col, mats, h=1.3):
    """An elephant-ear Alocasia, 1.3 m, in a pale pot: big heart-shaped
    leaves held out on long stems."""
    import bmesh
    parts = [_lathe("pot", [(0.17, 0), (0.21, 0.36), (0.2, 0.37), (0.18, 0.33)], col, mats["ceramic_white"], segments=24),
             g.cylinder("soil", 0.18, 0.01, loc=(0, 0, 0.33), col=col, mat=mats["soil"], segments=20)]
    leaves = ((0.0, 1.0, 0.25), (1.2, 0.9, 0.35), (2.3, 0.82, 0.4), (3.4, 0.95, 0.3), (4.4, 0.75, 0.45), (5.4, 0.88, 0.35),
              (0.6, 0.6, 0.55), (2.9, 0.62, 0.5))
    for k, (a, hh, lean) in enumerate(leaves):
        top = 0.34 + (h - 0.34) * hh
        dx, dy = math.cos(a), math.sin(a)
        reach = lean * 0.6
        base = (dx * 0.03, dy * 0.03, 0.34)
        tip = (dx * reach, dy * reach, top)
        stem = g.catmull_rom([base, (dx * reach * 0.3, dy * reach * 0.3, 0.34 + (top - 0.34) * 0.6), tip], 4)
        parts.append(g.sweep("stem", stem, 0.008, sides=5, col=col, mat=mats["leaf_stem"]))
        # The blade: a heart, hanging from the stem's tip, tipped down and out.
        L, W = 0.55 * (0.8 + 0.3 * hh), 0.42 * (0.8 + 0.3 * hh)
        outline = []
        for i in range(17):
            t = i / 16
            ang = PI * t
            # Lobes at the stem end, a point at the far end.
            rr = W / 2 * math.sin(ang) * (1 - 0.35 * t)
            outline.append((L * (t - 0.15), rr))
        outline += [(x, -y) for x, y in reversed(outline[1:-1])]
        bm = bmesh.new()
        tilt = 0.9 + lean
        vs = []
        for x, y in outline:
            # Fold along the midrib, droop towards the tip.
            z = -abs(y) * 0.35 - (x / L) ** 2 * 0.08
            px = x * math.cos(tilt) - z * math.sin(tilt)
            pz = x * math.sin(-tilt) * 0.6 + z * math.cos(tilt)
            vs.append(bm.verts.new((tip[0] + dx * px - dy * y, tip[1] + dy * px + dx * y, tip[2] + pz)))
        c = bm.verts.new((tip[0] + dx * L * 0.3 * math.cos(tilt), tip[1] + dy * L * 0.3 * math.cos(tilt), tip[2] - L * 0.3 * math.sin(tilt) * 0.6))
        for i in range(len(vs)):
            bm.faces.new((c, vs[i], vs[(i + 1) % len(vs)]))
        mesh = bpy.data.meshes.new("leaf")
        bm.to_mesh(mesh)
        bm.free()
        parts.append(g._finish(mesh, "leaf", col, mats["leaf_alocasia"], None, None, True))
    return parts


def ficus(col, mats, h=1.4):
    """A ficus-type shrub in a terracotta pot: a few stems under a loose
    crown of small leaves."""
    parts = [_lathe("pot", [(0.15, 0), (0.19, 0.32), (0.205, 0.33), (0.2, 0.35), (0.18, 0.33)], col, mats["terracotta"], segments=20),
             g.cylinder("soil", 0.17, 0.01, loc=(0, 0, 0.32), col=col, mat=mats["soil"], segments=16)]
    for k, (dx, dy) in enumerate(((0.03, 0.0), (-0.03, 0.03), (0.0, -0.04))):
        pts = [(dx, dy, 0.32), (dx * 2, dy * 2, 0.7), (dx * 4, dy * 3, h * 0.75)]
        parts.append(g.sweep("trunk", g.catmull_rom(pts, 3), 0.012, sides=6, col=col, mat=mats["olive_bark"]))
    import random
    rnd = random.Random(7)
    for k in range(16):
        a = rnd.uniform(0, 2 * PI)
        rr = rnd.uniform(0.05, 0.28)
        z = rnd.uniform(0.75, h - 0.1)
        s = rnd.uniform(0.09, 0.15)
        parts.append(g.sphere("crown", s, loc=(rr * math.cos(a), rr * math.sin(a), z), col=col,
                              mat=mats["olive_leaf" if k % 3 else "leaf_mid"], scale=(1, 1, 0.8), subdivisions=2))
    return parts


def coffee_maker(col, mats):
    """A pour-over coffee maker: an oak base and upright, a white tank on
    top, a grey glass carafe under the spout (render 18)."""
    wd = mats["oak_veneer"]
    return [_block(col, wd, -0.09, 0.09, -0.1, 0.1, 0, 0.025, "base", bevel=0.003),
            _block(col, wd, -0.05, 0.05, -0.1, -0.05, 0.025, 0.36, "upright", bevel=0.003),
            _block(col, wd, -0.06, 0.06, -0.1, 0.06, 0.25, 0.27, "arm", bevel=0.003),
            g.cylinder("tank", 0.06, 0.1, loc=(0, -0.01, 0.32), col=col, mat=mats["porcelain_matte"], segments=20),
            _lathe("dripper", [(0.03, 0), (0.065, 0.06), (0.06, 0.06)], col, mats["porcelain_matte"], loc=(0, 0.01, 0.17),
                   segments=18),
            _lathe("carafe", [(0.05, 0), (0.065, 0.06), (0.04, 0.11), (0.045, 0.14), (0.04, 0.14)], col, mats["glass_grey"],
                   loc=(0, 0.01, 0.025), segments=18)]


def curtain(col, mats, w=1.6, h=2.74, mat="curtain_linen", depth=None, folds=None, heading="ripple"):
    """A curtain hanging to just off the floor from a track concealed in the
    ceiling. `heading` "ripple": an even run of deep, narrow S-folds every
    10.5 cm (render 19), a little irregular, its heading in a slot in the
    ceiling, the track in it white as the ceiling so no dark comb shows over
    the folds; "pinch": pinch pleats every 13 cm across a flat heading,
    falling into soft irregular folds below it. One double-sided sheet."""
    import bmesh
    depth = depth or (0.09 if heading == "pinch" else 0.13)
    folds = folds or max(3, round(w / (0.13 if heading == "pinch" else 0.105)))
    amp = depth / 2 - 0.006
    # Ripple folds are deeper than they are wide: 16 samples a fold keep
    # each wave round rather than a zigzag.
    steps = folds * (8 if heading == "pinch" else 16)
    if heading != "pinch":
        # Deepest fold just inside `depth`, so the piece is as deep as asked.
        amp = (depth / 2 - 0.004) / max(abs(math.sin(2 * PI * t * folds + 0.5 * math.sin(3.1 * t * folds * 0.37 + 0.4)) *
                                            (1 + 0.22 * math.sin(5.3 * t * folds * 0.21 + 1) + 0.1 * math.sin(17.0 * t)))
                                        for t in (i / steps for i in range(steps + 1)))
    z0, z1 = 0.012, h - 0.02
    rows = [z0 + (z1 - z0) * k / 9 for k in range(10)] if heading == "pinch" else [z0, z1]
    if heading == "pinch":
        rows = sorted(set(rows + [z1 - 0.03, z1 - 0.1, z1 - 0.17]))
    bm = bmesh.new()
    grid = []
    for z in rows:
        ring = []
        for i in range(steps + 1):
            t = i / steps
            x = -w / 2 + w * t
            ph = 2 * PI * t * folds + 0.5 * math.sin(3.1 * t * folds * 0.37 + 0.4)
            body = amp * math.sin(ph) * (1 + 0.22 * math.sin(5.3 * t * folds * 0.21 + 1) + 0.1 * math.sin(17.0 * t))
            if heading == "pinch":
                # Near the top: flat, but for a tight pinch at each pleat.
                u = (t * folds) % 1.0
                pinch = 0.022 * math.exp(-((u - 0.5) / 0.08) ** 2)
                b = min(1.0, max(0.0, (z1 - z - 0.04) / 0.3))
                b = b * b * (3 - 2 * b)
                y = pinch * (1 - b) + body * b + 0.004 * math.sin(z * 3.0 + t * 9) * b
            else:
                y = body
            ring.append(bm.verts.new((x, y, z)))
        grid.append(ring)
    for ra, rb in zip(grid, grid[1:]):
        for i in range(steps):
            bm.faces.new((ra[i], ra[i + 1], rb[i + 1], rb[i]))
    mesh = bpy.data.meshes.new("curtain")
    bm.to_mesh(mesh)
    bm.free()
    parts = [g._finish(mesh, "curtain", col, mats[mat], None, None, True)]
    if heading == "pinch":
        parts.append(g.box("track", (w + 0.04, 0.03, 0.018), loc=(0, 0, h - 0.009), col=col, mat=mats["trim_white"]))
    else:
        parts.append(g.box("track", (w + 0.04, depth, 0.018), loc=(0, 0, h - 0.009), col=col, mat=mats["trim_white"]))
    return parts


def _stitched(col, mats, size, loc, mat, rot, seed, flange=0.045, stripes="charcoal"):
    """A plump white pillow with a thin flange of the same cloth, three fine
    charcoal pinstripes just inside the flange's edge."""
    from mathutils import Euler, Vector
    w, t, hgt = size
    parts = [_pillow("pillow", size, loc, col, mat, rot=rot, r=0.08, puff=0.7, crease=0.01, cuts=8, seed=seed, axis=1),
             _pillow("flange", (w + 2 * flange, 0.01, hgt + 2 * flange), loc, col, mat, rot=rot, r=0.004, puff=0.2,
                     crease=0.005, cuts=6, seed=seed + 1, axis=1)]
    e = Euler(rot)
    for k in range(3):
        inset = 0.008 + k * 0.004
        bw, bh = w + 2 * flange - 2 * inset, hgt + 2 * flange - 2 * inset
        for (dx, dz, sx, sz) in ((0, bh / 2, bw, 0.0012), (0, -bh / 2, bw, 0.0012), (bw / 2, 0, 0.0012, bh), (-bw / 2, 0, 0.0012, bh)):
            off = Vector((dx, 0.0062, dz))
            off.rotate(e)
            parts.append(g.box("stitch", (sx, 0.001, sz), loc=(loc[0] + off.x, loc[1] + off.y, loc[2] + off.z), rot=rot, col=col,
                               mat=mats[stripes]))
    return parts


def _drape(name, half_w, z_top, hem, y0, y1, t, col, mat, rr=0.06, seed=0, folds=0.012, flare=0.03):
    """A runner thrown over a bed: a cloth `t` thick lying over the top at
    `z_top` (its underside), round the edges (radius `rr`) and hanging down
    both sides to `hem`, from y0 to y1; soft vertical folds in the falls,
    flaring a little towards the hem."""
    import bmesh
    from mathutils import Vector, noise
    # The section's mid-line, from the left hem over the top to the right hem.
    path = []
    n_side, n_arc, n_top = 8, 6, 12
    for k in range(n_side + 1):
        z = hem + (z_top - rr - hem) * k / n_side
        path.append((-half_w, z, -1))
    for k in range(1, n_arc):
        a = PI - (PI / 2) * k / n_arc
        path.append((-half_w + rr + rr * math.cos(a), z_top - rr + rr * math.sin(a), 0))
    for k in range(n_top + 1):
        path.append((-half_w + rr + (2 * half_w - 2 * rr) * k / n_top, z_top, 0))
    for k in range(1, n_arc):
        a = PI / 2 - (PI / 2) * k / n_arc
        path.append((half_w - rr + rr * math.cos(a), z_top - rr + rr * math.sin(a), 0))
    for k in range(n_side + 1):
        z = z_top - rr - (z_top - rr - hem) * k / n_side
        path.append((half_w, z, 1))
    ny = 14
    bm = bmesh.new()
    off = Vector((seed, seed * 1.7, 0.3))
    grid = {}
    for side, d in (("in", 0.0), ("out", t)):
        for j in range(ny + 1):
            y = y0 + (y1 - y0) * j / ny
            for i, (x, z, hang) in enumerate(path):
                # Outward normal of the section at this point.
                if hang:
                    nx, nz = hang, 0.0
                    fall = (z_top - rr - z) / max(1e-6, z_top - rr - hem)
                    x2 = x + hang * (flare * fall ** 2 + folds * fall * (math.sin(y * 31 + seed) * 0.6 +
                                                                        noise.noise(Vector((y * 9, z * 3, 0)) + off)))
                else:
                    cx = -half_w + rr if x < 0 else half_w - rr
                    vx, vz = x - cx, z - (z_top - rr)
                    ln = math.hypot(vx, vz)
                    nx, nz = (vx / ln, vz / ln) if ln > 1e-6 and abs(x) > half_w - rr else (0.0, 1.0)
                    x2 = x
                grid[(side, j, i)] = bm.verts.new((x2 + nx * d, y, z + nz * d))
    n = len(path)
    for j in range(ny):
        for i in range(n - 1):
            bm.faces.new((grid[("out", j, i)], grid[("out", j, i + 1)], grid[("out", j + 1, i + 1)], grid[("out", j + 1, i)]))
            bm.faces.new((grid[("in", j, i)], grid[("in", j + 1, i)], grid[("in", j + 1, i + 1)], grid[("in", j, i + 1)]))
    for j in (0, ny):
        for i in range(n - 1):
            bm.faces.new((grid[("in", j, i)], grid[("in", j, i + 1)], grid[("out", j, i + 1)], grid[("out", j, i)]))
    for i in (0, n - 1):
        for j in range(ny):
            bm.faces.new((grid[("in", j, i)], grid[("out", j, i)], grid[("out", j + 1, i)], grid[("in", j + 1, i)]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, None, None, True)


def bed(col, mats, w=1.80, l=2.00, single=False, throw="linen_olive", lining="linen_sage_lining", sham="linen_olive_dark",
        duvet="linen_duvet"):
    """The bed of render 21, without its headboard — headboard() is a wall
    piece of its own, hung 5 cm over the mattress, and the bed stands 4 cm
    off the wall. A white mattress `w` x `l`, rounded, its top at 0.50, on
    a cream platform 4 cm bigger over a recessed dark plinth; a thick cream
    duvet turned down 0.66 m from the head, crowned, its head a soft roll,
    falling over both sides and the foot to 7 cm off the floor, flaring a
    little; a thin deep olive runner across it a third of the way up from
    the foot, following its crown and draped down both sides, folded in two
    with its sage reverse showing as a band beyond the top layer's edge;
    and per side (one set, centred, on a single) a dark olive Euro sham with
    its flange, a plump white pillow, plain-edged, with three fine olive
    stitch lines across one end, and a sand cushion, each one cloth case
    standing on the mattress and leaning back on the one behind. The head is
    at -Y; nothing reaches behind the platform's head end."""
    parts = []
    y0 = -l / 2
    plat, mt = 0.28, 0.22
    top = plat + mt
    # The plinth runs up into the platform, so no face lies on its underside.
    parts.append(_block(col, mats["kitchen_gap"], -w / 2 + 0.06, w / 2 - 0.06, y0 + 0.06, l / 2 - 0.06, 0, 0.06, "plinth"))
    parts.append(_soft_box("platform", (w + 0.04, l + 0.04, plat - 0.05), (0, 0, 0.05 + (plat - 0.05) / 2), col,
                           mats["bed_base"], r=0.012, n=4))
    parts.append(_soft_box("mattress", (w, l, mt + 0.004), (0, 0, plat - 0.004 + (mt + 0.004) / 2), col, mats["linen_white"],
                           r=0.045, n=7, crown=0.008, crease=0.0012, seed=3))
    parts += _bed_cover(col, w, l, top, mats[duvet], mats[throw], mats[lining], seed=4, single=single)
    # Pillows, back to front: sham, white, sand. Sizes over all (flange
    # included), scaled with the bed, and leaned so their tops step down a
    # hand under the headboard's top as in render 21: the shams' and white
    # pillows' at about 0.92, the sand cushions' at 0.86, with the panel's
    # top at 1.05. Per side, as there: the sham stands out 10-13 cm beyond
    # the white pillow's outer end; the white pillows meet in the middle,
    # the -X one lying a hand over the +X one, and the sand cushions just
    # meet. Each rests against the ones behind it, not crossing into them.
    if single:
        s = w / 0.9
        sides = [0]
        sham_w, white_w, sand_w = 0.84 * w, 0.76 * w, 0.60 * w
    else:
        s = w / 1.8
        sides = [1, -1]
        sham_w, white_w, sand_w = 0.70 * s, 0.80 * s, 0.60 * s
    hs = min(1.0, s) ** 0.5
    q = 0.0 if single else w / 4
    # The white pillows' three fine olive lines, 2.5 mm wide and 10 mm
    # apart, across their +X end 12-15 cm in from it.
    # 4 mm lines 8 mm apart: thinner ones alias into dashes at room distance.
    stripes = ((0.120, 0.124), (0.128, 0.132), (0.136, 0.140))
    shams, whites, sands = [], [], []
    rest = next(p for p in parts if p.name.startswith("mattress"))
    for sgn in sides:
        k, over = int(sgn > 0), sgn < 0
        shams.append(_bed_pillow("sham", sham_w, 0.55 * hs, 0.18, sgn * (q + (0.03 if over else 0.08) * s), y0 + 0.27, top,
                                 0.48, col, mats[sham], flange=0.05, seed=10 + k, take=0.06, sag=0.03, flop=0.025,
                                 crinkle=0.005, grid=round(34 * sham_w), yaw=0.02 * (sgn or 1), rest=rest))
    for sgn in sides:
        k, over = int(sgn > 0), sgn < 0
        whites.append(_bed_pillow("pillow", white_w, 0.52 * hs, 0.20, sgn * (q - (0.15 if over else 0.07) * s),
                                  y0 + 0.42 + 0.01 * over, top, 0.42, col, mats["pillow_white"], stripes=stripes,
                                  stripe_mat=mats["thread_olive"], seed=20 + k, take=0.07, sag=0.03, flop=0.02, crinkle=0.007,
                                  grid=round(45 * white_w), yaw=0.04 if over else (0.02 if sgn else -0.03), behind=shams + whites,
                                  rest=rest))
    for sgn in sides:
        k, over = int(sgn > 0), sgn < 0
        sands.append(_bed_pillow("cushion", sand_w, 0.42 * hs, 0.16, sgn * (q - (0.17 if over else 0.12) * s),
                                 y0 + 0.60 + 0.01 * over, top, 0.40, col, mats["linen_sand"], flange=0.008, seed=30 + k,
                                 take=0.08, sag=0.02, flop=0.015, crinkle=0.006, grid=round(40 * sand_w), yaw=0.04 * (sgn or 1),
                                 behind=shams + whites + sands, rest=rest))
    parts += shams + whites + sands
    return parts


def _smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _ticks(lo, hi, r_lo, r_hi, segs, k):
    """`segs` + 1 positions from lo to hi: `k` even steps across each rounded
    band (r_lo at lo, r_hi at hi; none where 0) and the rest even between,
    so a rounded edge gets its share of a grid's vertices."""
    kl, kh = (k if r_lo else 0), (k if r_hi else 0)
    mid = segs - kl - kh
    out = []
    for i in range(segs + 1):
        if i < kl:
            out.append(lo + r_lo * i / kl)
        elif kh and i > segs - kh:
            out.append(hi - r_hi * (segs - i) / kh)
        else:
            out.append(lo + r_lo + (hi - r_hi - lo - r_lo) * (i - kl) / mid)
    return out


def _soft_box(name, size, loc, col, mat, r=0.02, r_x=None, n=8, k=2, crown=0.0, puff=0.0, crease=0.0, seed=0):
    """A box `size` with its edges rounded to `r` — or, across X, to r_x =
    (left, right), so one edge can be just eased where it butts another —
    its grid gathered into the rounds so they come out round, crowned on top
    (`crown`, metres), puffed out in front (+Y, `puff`, metres) and creased
    (`crease`, metres of noise)."""
    import bmesh
    from mathutils import Vector, noise
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    rx0, rx1 = r_x if r_x else (r, r)
    rx0, rx1, ry, rz = min(rx0, hx * 0.9), min(rx1, hx * 0.9), min(r, hy * 0.95), min(r, hz * 0.95)
    segs = n + 1
    tx, ty, tz = _ticks(-hx, hx, rx0, rx1, segs, k), _ticks(-hy, hy, ry, ry, segs, k), _ticks(-hz, hz, rz, rz, segs, k)
    off = Vector((seed * 1.37, seed * 2.11, seed * 0.73))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=n, use_grid_fill=True)
    for v in bm.verts:
        i, j, m = [int(round((c + 0.5) * segs)) for c in v.co]
        p = Vector((tx[i], ty[j], tz[m]))
        rx = rx0 if p.x < 0 else rx1
        q = Vector((max(-hx + rx0, min(hx - rx1, p.x)), max(-hy + ry, min(hy - ry, p.y)), max(-hz + rz, min(hz - rz, p.z))))
        e = Vector(((p.x - q.x) / rx, (p.y - q.y) / ry, (p.z - q.z) / rz))
        if e.length > 1e-9:
            e.normalize()
            p = q + Vector((e.x * rx, e.y * ry, e.z * rz))
        nrm = e if e.length > 1e-9 else Vector((0, 0, 1))
        u, w_ = p.x / hx, p.y / hy
        if crown and p.z > 0:
            p.z += crown * (p.z / hz) ** 2 * max(0.0, 1 - u * u) * max(0.0, 1 - w_ * w_)
        if puff and p.y > 0:
            p.y += puff * (p.y / hy) ** 2 * max(0.0, 1 - u * u) * max(0.0, 1 - (p.z / hz) ** 2)
        if crease:
            p += nrm * crease * (noise.noise(p * 9 + off) + 0.5 * noise.noise(p * 23 - off))
        v.co = p
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, loc, None, True)


def _cover_surface(w, l, top, hem, ya, yb, rr, crown, flare, wave, folds, crinkle, seed, base=0.50):
    """The surface of a bed's duvet as a function: a rounded box over x
    +-(w/2 + 0.03), y `ya`..`yb`, from `hem` up to `top`, its top edges
    rounded to `rr`, crowned, its falls flaring towards the hem and softly
    folded, broadly waved and finely crinkled. Its turned-down head end
    rests on the mattress (`base`) as a soft roll, and beside the bed the
    side flaps hang straight down from it to the hem, their head corners
    sharp below the mattress so they clear the bed (render 21's head
    corner). It takes a point (X, Y, Z) of the plain box's surface and gives
    the point on the duvet, its outward normal and how far down the fall it
    is (0 on top, 1 at the hem) — so a runner laid over it can follow it
    exactly. It keeps clear of the mattress and the platform (w x l, and 4
    cm bigger)."""
    from mathutils import Vector, noise
    hx = w / 2 + 0.03
    cy, hy = (ya + yb) / 2, (yb - ya) / 2
    off = Vector((seed * 1.3, seed * 0.7, 0.3))
    plat_x, plat_y, matt_x, matt_y = w / 2 + 0.02 + 0.008, l / 2 + 0.02 + 0.008, w / 2 + 0.008, l / 2 + 0.008
    edge = w / 2 + 0.021                             # just outside the platform

    def surf(X, Y, Z):
        head = Y < cy
        # Over the bed the head end only reaches down to the mattress; beside
        # it, to the hem.
        kx = 1.0 - _smooth01((abs(X) - edge) / max(1e-6, hx - 0.001 - edge)) if head else 0.0
        zlo = hem + (base - hem) * kx
        Z = zlo + (Z - hem) / (top - hem) * (top - zlo)
        if Z > top - rr - 1e-6:
            q = Vector((max(-hx + rr, min(hx - rr, X)), max(ya + rr, min(yb - rr, Y)), top - rr))
            d = Vector((X, Y, Z)) - q
            N = d.normalized() if d.length > 1e-9 else Vector((0, 0, 1))
            P = q + N * rr
        else:
            # The vertical corners: round at the foot; at the head round
            # above the mattress, sharp below it.
            rc = rr if not head else max(0.006, rr * _smooth01((Z - (base - 0.04)) / 0.04))
            q = Vector((max(-hx + rc, min(hx - rc, X)), max(ya + rc, min(yb - rr, Y)), Z))
            d2 = Vector((X, Y, Z)) - q
            if d2.length > 1e-9:
                N = d2.normalized()
                P = q + N * rc
            else:
                N, P = Vector((0, 0, -1)), Vector((X, Y, Z))
        down = _smooth01((top - P.z) / (top - hem))
        wz = _smooth01((P.z - (top - rr)) / rr)
        P.z += crown * wz * max(0.0, 1 - (P.x / hx) ** 2) * max(0.0, 1 - ((P.y - cy) / hy) ** 2)
        nh = Vector((N.x, N.y, 0))
        if nh.length > 0.3:
            nh.normalize()
            along = P.y if abs(N.x) > abs(N.y) else P.x
            # Long soft folds, a third of a metre apart: the duvet's own grid
            # resolves them, so its facets never bulge through the runner.
            fold = noise.noise(Vector((along * 3.2, P.z * 0.8, seed))) + 0.2 * noise.noise(Vector((along * 7.0, P.z * 2, seed + 2)))
            P += nh * (flare * down * down + folds * down * fold)
        P += N * (wave * noise.noise(Vector((P.x * 2.3, P.y * 2.3, seed + 0.5))) +
                  crinkle * ((1 - abs(noise.noise(P * 7 + off))) ** 3 - 0.3))
        # Clear of the mattress and the platform under it.
        if nh.length > 0.3 and P.z < base - 0.005:
            gx, gy = (plat_x, plat_y) if P.z < 0.30 else (matt_x, matt_y)
            for _ in range(40):
                if abs(P.x) < gx and P.y < gy and P.y > ya - 0.01:
                    P += nh * 0.002
                else:
                    break
        return P, N, down

    return surf


def _bed_cover(col, w, l, top, duvet, throw, lining, seed=4, single=False):
    """The duvet and the runner over it (see bed())."""
    import bmesh
    from mathutils import Vector, noise
    y0 = -l / 2
    hem, rr = 0.07, min(0.10, w / 6)
    ya, yb = y0 + 0.66, l / 2 + 0.03
    ztop = top + 0.09
    hx = w / 2 + 0.03
    surf = _cover_surface(w, l, ztop, hem, ya, yb, rr, crown=0.025, flare=0.025, wave=0.011, folds=0.015, crinkle=0.004,
                          seed=seed, base=top)
    # The duvet: a subdivided cube laid onto that surface, its underside cut away.
    n, k = 19, 3
    segs = n + 1
    tx, ty, tz = _ticks(-hx, hx, rr, rr, segs, k), _ticks(ya, yb, rr, rr, segs, k), _ticks(hem, ztop, 0, rr, segs, k)
    # A column just outside the platform each side, where the head end's
    # drop from the mattress to the hem is made.
    tx[1], tx[-2] = -(w / 2 + 0.021), w / 2 + 0.021
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=n, use_grid_fill=True)
    under = set()
    for v in bm.verts:
        i, j, m = [int(round((c + 0.5) * segs)) for c in v.co]
        if m == 0:
            under.add(v)
        v.co = surf(tx[i], ty[j], tz[m])[0]
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in under for v in f.verts)], context="FACES")
    mesh = bpy.data.meshes.new("duvet")
    bm.to_mesh(mesh)
    bm.free()
    parts = [g._finish(mesh, "duvet", col, duvet, None, None, True)]

    # The runner, as render 21 lays it: folded in two along its length, the
    # fold at its head side; its top layer stops a hand short of the lower
    # one, so beyond its soft free edge the lower layer's sage face shows as
    # a band 3-4 cm wide, then the lower layer's olive hem, turned up. Swept
    # over the duvet's own surface (so it follows its crown and rounded
    # edges) and down both sides to 10 cm off the floor, its falls hanging
    # in a few soft folds.
    tl = 0.56 if not single else 0.50
    t1 = l / 2 - 0.45
    t0 = t1 - tl
    th = 0.10
    out, tk1, tk2 = 0.0035, 0.004, 0.008            # under the cloth; one layer; two
    band, hemw = 0.04, 0.065
    tf = t1 - band - hemw                            # the top layer's free edge
    zs = _ticks(th, ztop, 0, rr, 13, 3)
    xs = _ticks(-hx, hx, rr, rr, 17, 3)
    prof = [(-hx, z) for z in zs] + [(x, ztop) for x in xs[1:-1]] + [(hx, z) for z in reversed(zs)]
    # The section across the runner, a closed loop (y, height over the duvet,
    # sage?): underneath from foot to head, round the fold, over the top
    # layer, down its free edge, over the sage band and the hem, round the
    # hem's edge and back.
    loop = [(t1 - 0.005 - (t1 - 0.005 - t0) * i / 4, out, 0) for i in range(5)]
    for a in (-60, -20, 20, 60):
        a = math.radians(a)
        loop.append((t0 - tk2 / 2 * math.cos(a), out + tk2 / 2 + tk2 / 2 * math.sin(a), 0))
    loop += [(t0 + 0.012 + (tf - 0.014 - t0 - 0.012) * i / 7, out + tk2, 0) for i in range(8)]
    loop += [(tf - 0.003, out + tk2 + 0.0008, 0), (tf + 0.0005, out + tk2 - 0.002, 0), (tf + 0.0015, out + tk1 + 0.0012, 0)]
    loop += [(tf + 0.004, out + tk1, 1), (tf + band / 2, out + tk1, 1), (tf + band - 0.001, out + tk1, 1)]
    loop += [(tf + band + 0.001, out + tk1 + 0.0015, 0), (tf + band + 0.006, out + tk1 + 0.0015, 0),
             (t1 - hemw / 2, out + tk1 + 0.0012, 0), (t1 - 0.006, out + tk1 + 0.001, 0)]
    loop += [(t1 - 0.002, out + tk1 + 0.0005, 0), (t1, out + tk1 / 2 + 0.0005, 0), (t1 - 0.002, out + 0.0003, 0)]
    noff = Vector((seed * 2.3, 1.1, 0.4))
    bm = bmesh.new()
    rows = []
    for X, Z in prof:
        row = []
        for y, nn, _ in loop:
            P, N, down = surf(X, y, Z)
            # Soft folds down the falls: outward only, so it never dips into the duvet.
            fall = down ** 1.5 * (0.5 + 0.5 * math.sin(y * 11.0 + 1.7 * noise.noise(Vector((y * 3, Z * 1.5, seed)))))
            c = 0.0015 * (1 - abs(noise.noise(P * 9 + noff))) ** 2
            row.append(bm.verts.new(P + N * (nn + 0.010 * fall + c)))
        rows.append(row)
    nl = len(loop)
    for a, b in zip(rows, rows[1:]):
        for i in range(nl):
            j = (i + 1) % nl
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = 1 if loop[i][2] and loop[j][2] else 0
    # Close the two hems where the falls end.
    for row in (rows[0], rows[-1]):
        bm.faces.new(row)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("throw")
    bm.to_mesh(mesh)
    bm.free()
    obj = g._finish(mesh, "throw", col, throw, None, None, True)
    obj.data.materials.append(lining)
    parts.append(obj)
    return parts


def _bed_pillow(name, w, h, t, x, y, z, lean, col, mat, flange=0.0, stripes=(), stripe_mat=None, seed=0, take=0.06, sag=0.03,
                flop=0.02, crinkle=0.006, grid=16, yaw=0.0, sink=0.008, behind=(), rest=None):
    """A pillow as it sits on a bed: one closed case of cloth, `w` x `h` over
    all (its flange included) and `t` thick, lens-shaped in section — full
    in the middle and thinning steadily all the way out to its seam, with no
    flat middle and no wall — its edges drawn in between eared corners, its
    top sagging in the middle and flopping back, its cloth finely and softly
    crumpled, shaded smooth throughout. A `flange` (the Euro sham's) runs
    round it as a flat double layer of the same cloth a few millimetres
    thick, only rippled; `stripes` — (d0, d1) distances in from its +X end —
    are bands of `stripe_mat` across its front face, top to bottom. `grid`
    cells across, square ones up it. Stood on its bottom edge at (x, y, z),
    leaned back by `lean` radians — its top towards -Y, the head — and
    turned by `yaw`; its bottom sinks `sink` into what it stands on — the
    top of `rest` (the mattress) under each point of it, else a level just
    over z — softly squashed and bulging out a little there, and where it
    would cross into a pillow of `behind` (already placed) it rests against
    it instead."""
    import bmesh
    from mathutils import Matrix, Vector, noise
    from mathutils.bvhtree import BVHTree
    wc, hc = w - 2 * flange, h - 2 * flange
    tf = 0.006 if flange else 0.004

    def axis(n, core, cuts=()):
        forced = {round(c, 6) for c in cuts} | ({round(core, 6), round(-core, 6)} if flange else set())
        step = 2 / n
        even = {round(-1 + step * i, 6) for i in range(n + 1)}
        return sorted(forced | {u for u in even if abs(u) == 1 or all(abs(u - f) > 0.4 * step for f in forced)})

    us = axis(grid, wc / w, [1 - 2 * d / w for band in stripes for d in band])
    vs = axis(max(8, round(grid * h / w)), hc / h)
    off = Vector((seed * 3.1, seed * 1.7, seed * 0.9))
    lift = take * h / 2

    def crumple(X, Z):
        """Crumpled cloth, of about unit spread: long soft creases running
        on one diagonal or the other, patch by patch (so they never cross
        into pits), a finer undulation under them, and folds fanning in
        from the corners."""
        pick = 0.5 + 0.5 * math.tanh(noise.noise(Vector((X * 3, Z * 3, 5.1)) + off) / 0.15)
        c = 0.4 * noise.noise(Vector((X * 13, Z * 13, 7.4)) + off) / 0.28
        for k, (ca, sa, wt) in enumerate(((0.8, 0.6, pick), (0.8, -0.6, 1 - pick))):
            a, b = X * ca + Z * sa, Z * ca - X * sa
            c += wt * ((1 - abs(noise.noise(Vector((a * 4, b * 11, k * 3.7)) + off))) ** 4 - 0.435) / 0.28
        for cx, cz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            dx, dz = X - cx * w / 2, Z - cz * h / 2
            fan = math.atan2(dz * cz, dx * cx)
            c += 0.7 * math.exp(-math.hypot(dx, dz) / 0.10) * \
                (math.sin(fan * 9 + 2.5 * noise.noise(Vector((dx * 8, dz * 8, cx + 2 * cz)) + off)) - 0.3)
        return c
    bm = bmesh.new()
    sides, info = [], []
    for s in (1, -1):
        rows = []
        for v in vs:
            row = []
            for u in us:
                # The body's thickness: a lens, full in the middle and easing
                # all the way out to the seam (or the flange).
                ex, ez = min(1.0, abs(u) * w / wc), min(1.0, abs(v) * h / hc)
                body = (max(0.0, 1 - ex * ex) * max(0.0, 1 - ez * ez)) ** 0.8
                # The edges drawn in between the corners, as stuffing pulls
                # a case; the bottom edge left straight along what it stands on.
                X = u * w / 2 * (1 - take * (1 - v * v) * u * u)
                Z = v * h / 2 * (1 - take * (1 - u * u) * v * v)
                Y = s * (tf / 2 + (t / 2 - tf / 2) * body)
                tb = _smooth01((v - 0.2) / 0.8)
                # The top sags in the middle and flops back.
                Z -= sag * (1 - u * u) * tb
                Z -= lift * (1 - u * u) * _smooth01((-v - 0.3) / 0.7)
                ear = _smooth01((abs(u) - 0.82) / 0.18) * _smooth01((abs(v) - 0.82) / 0.18)
                X -= X * 0.035 * ear
                Z -= Z * 0.035 * ear
                Y -= flop * tb * tb * (1 - 0.5 * u * u)
                Y += s * crinkle * crumple(X, Z) * body ** 0.5 + \
                    0.005 * noise.noise(Vector((X * 9, Z * 9, 0)) + off) * (1 - body)
                row.append(bm.verts.new((X, Y, Z + h / 2)))
                info.append((s, body))
            rows.append(row)
        sides.append(rows)
    front, back = sides
    nu, nv = len(us), len(vs)
    for j in range(nv - 1):
        for i in range(nu - 1):
            f = bm.faces.new((front[j][i], front[j][i + 1], front[j + 1][i + 1], front[j + 1][i]))
            d = (2 - us[i] - us[i + 1]) * w / 4
            if stripe_mat is not None and any(d0 < d < d1 for d0, d1 in stripes):
                f.material_index = 1
            bm.faces.new((back[j][i], back[j + 1][i], back[j + 1][i + 1], back[j][i + 1]))
    # The seam round the edge, closing the case.
    ring = [(0, i) for i in range(nu - 1)] + [(j, nu - 1) for j in range(nv - 1)] + \
           [(nv - 1, i) for i in range(nu - 1, 0, -1)] + [(j, 0) for j in range(nv - 1, 0, -1)]
    for k in range(len(ring)):
        (ja, ia), (jb, ib) = ring[k], ring[(k + 1) % len(ring)]
        bm.faces.new((front[ja][ia], back[ja][ia], back[jb][ib], front[jb][ib]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = g._finish(mesh, name, col, mat, None, None, True)
    if stripe_mat is not None:
        obj.data.materials.append(stripe_mat)
    R = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(lean, 3, "X")
    fwd = R @ Vector((0, 1, 0))
    out = Vector((fwd.x, fwd.y, 0)).normalized()
    verts = obj.data.vertices
    for v in verts:
        v.co = R @ v.co
    # Its weight rests on its body: the body's underside goes `sink` into
    # what it stands on (taken 2 mm over the mattress's top); what would go
    # under is squashed to a quarter of that, easing off so nothing — not
    # even a sham's flange — goes more than `give` under, and the cloth just
    # above it bulges out a centimetre, front and back, so it sits rounded.
    floor, band, bulge, give = 0.004, 0.02, 0.01, 0.006
    if rest is not None:
        bed_top = BVHTree.FromPolygons([rest.location + q.co for q in rest.data.vertices],
                                       [p.vertices[:] for p in rest.data.polygons])
        hits = [bed_top.ray_cast(Vector((x + v.co.x, y + v.co.y, z + 1.0)), Vector((0, 0, -1)))[0] for v in verts]
        grounds = [h.z - z + 0.002 if h is not None else floor for h in hits]
    else:
        grounds = [floor] * len(verts)
    lo = min(v.co.z - gz for v, gz, (_, b) in zip(verts, grounds, info) if b > 0.2)
    for v, gz, (s, _) in zip(verts, grounds, info):
        co = v.co.copy()
        co.z -= sink + lo
        d = gz - co.z
        co += out * (s * bulge * _smooth01((d + band) / (2 * band)))
        if d > 0:
            co.z = gz - give * (1 - math.exp(-0.25 * d / give))
        v.co = co
    # Where it would cross into a pillow behind it, it is pushed forward
    # onto that one's face and rests there; its front gives way only as far
    # as it must to stay in front of its back.
    if behind:
        loc = Vector((x, y, z))
        shells, clouds = [], []
        for o in behind:
            pts = [o.location + q.co for q in o.data.vertices]
            shells.append(BVHTree.FromPolygons(pts, [p.vertices[:] for p in o.data.polygons]))
            clouds += pts

        def inside(bvh, p):
            for dr in (Vector((0.0013, 0.0007, 1)), Vector((1, 0.0013, 0.0007))):
                n, o_ = 0, p.copy()
                dr = dr.normalized()
                for _ in range(64):
                    hit = bvh.ray_cast(o_, dr)
                    if hit[0] is None:
                        break
                    n += 1
                    o_ = hit[0] + dr * 1e-5
                if n % 2 == 0:
                    return False
            return True

        gap = 0.003
        half = len(verts) // 2
        need = [0.0] * len(verts)
        for i, v in enumerate(verts):
            p = v.co + loc
            for _ in range(3):
                hits = [bvh for bvh in shells if inside(bvh, p)]
                if not hits:
                    break
                for bvh in hits:
                    hit = bvh.ray_cast(p, fwd)
                    if hit[0] is not None:
                        p = hit[0] + fwd * gap
            need[i] = (p - loc - v.co).dot(fwd)
        # Per grid point: the back goes forward as far as it must, the push
        # eased out over the cells round it; the front follows it — all the
        # way where the case is thin, half way where it is full — and never
        # comes closer to the back than the seam's thickness.
        def ease(d):
            for _ in range(5):
                d = [max(d[j * nu + i], sum(d[jj * nu + ii] for jj in (j - 1, j, j + 1) for ii in (i - 1, i, i + 1)
                                            if 0 <= jj < nv and 0 <= ii < nu) / 9) for j in range(nv) for i in range(nu)]
            return d

        dback = ease([max(need[k], need[k + half]) for k in range(half)])
        dfront = ease([max(need[k], dback[k] * (1 - 0.5 * info[k][1])) for k in range(half)])
        for k in range(half):
            a_, b_ = verts[k], verts[k + half]
            b_.co += fwd * dback[k]
            a_.co += fwd * dfront[k]
            sep = (a_.co - b_.co).dot(fwd)
            if sep < tf:
                a_.co += fwd * (tf - sep)
        # And where a crumple of the one behind still pokes between its
        # points, both its layers there go forward past it, eased out too.
        mine = BVHTree.FromPolygons([v.co + loc for v in verts], [p.vertices[:] for p in obj.data.polygons])
        lo_, hi_ = [min(v.co[i] + loc[i] for v in verts) for i in range(3)], [max(v.co[i] + loc[i] for v in verts) for i in range(3)]
        more = [0.0] * half
        for p in clouds:
            if all(lo_[i] <= p[i] <= hi_[i] for i in range(3)) and inside(mine, p):
                hit = mine.ray_cast(p, -fwd)
                if hit[0] is not None:
                    for vi in obj.data.polygons[hit[2]].vertices:
                        more[vi % half] = max(more[vi % half], hit[3] + gap)
        more = ease(more)
        for k in range(half):
            verts[k].co += fwd * more[k]
            verts[k + half].co += fwd * more[k]
    obj.data.update()
    obj.location = (x, y, z)
    return obj


def headboard(col, mats, w=2.10, h=0.50, t=0.04, panels=2, felt="felt_fleck"):
    """The felt headboard of render 21, a wall piece of its own (anchor
    "wall", its back on the wall): `panels` equal panels of heathered wool
    felt, `w` x `h` over all and `t` thick, butt-joined in a 3 mm V, their
    outer edges softly rounded and their faces a touch puffed. The app hangs
    it 0.55 m up — 5 cm over the mattress — centred on the head wall."""
    pw = w / panels
    parts = []
    for k in range(panels):
        x = -w / 2 + pw * (k + 0.5)
        rl = 0.0016 if k > 0 else 0.010
        rh = 0.0016 if k < panels - 1 else 0.010
        parts.append(_soft_box("panel", (pw - 0.0004, t, h), (x, -t / 2, h / 2), col, mats[felt], r=0.010, r_x=(rl, rh),
                               n=10, k=2, puff=0.003, crease=0.0006, seed=20 + k))
    return parts


def nightstand(col, mats, w=1.0, d=0.40, h=0.15, wood="walnut_veneer"):
    """A floating wall-hung drawer unit in warm rift-cut walnut (render 21):
    a slim box 0.15 m tall, its fine grain running up the front and front to
    back over its lighter top, one drawer front set into it 3 mm behind an
    8 mm shadow gap all round, a slim light-oak bar pull 0.20 m long in the
    middle: hang it with its top 7 cm under the mattress's (y = 0.28). Back
    at -Y.

    Hollow, lined dark where the solid one was dark, so the shadow gap
    still reads as one: the drawer runs out on a light oak box inside its
    front's outline, by three quarters of its depth."""
    wd, dark = mats[wood], mats["kitchen_gap"]
    e, gp = 0.014, 0.008
    face = d / 2
    fr = face - 0.003                                # the drawer front's face
    # The case, and the dark lining inside it from 16 mm behind its face, as
    # the solid block's front was: the lining's back, top, floor and sides.
    li0, li1, lz0, lz1 = -w / 2 + e - 0.001, w / 2 - e + 0.001, e - 0.001, h - e + 0.001
    lb, lf, k = -d / 2 + 0.001, face - 0.016, 0.003
    parts = [_block(col, mats["walnut_top"], -w / 2, w / 2, -d / 2, face, h - e, h, "case", bevel=0.0015),
             _block(col, wd, -w / 2, w / 2, -d / 2, face, 0, e, "case", bevel=0.0015),
             _block(col, wd, -w / 2, -w / 2 + e, -d / 2, face, e, h - e, "case"),
             _block(col, wd, w / 2 - e, w / 2, -d / 2, face, e, h - e, "case"),
             _block(col, dark, li0, li1, lb, lb + k, lz0, lz1, "lining"),
             _block(col, dark, li0, li1, lb + k, lf, lz1 - k, lz1, "lining"),
             _block(col, dark, li0, li1, lb + k, lf, lz0, lz0 + k, "lining"),
             _block(col, dark, li0, li0 + k, lb + k, lf, lz0 + k, lz1 - k, "lining"),
             _block(col, dark, li1 - k, li1, lb + k, lf, lz0 + k, lz1 - k, "lining")]
    # The drawer: the front and its pull, and behind it the box, inside the
    # front's outline and lower than it, so none of it shows in the gap.
    fx0, fx1, fz0, fz1 = -w / 2 + e + gp, w / 2 - e - gp, e + gp, h - e - gp
    oak = mats["oak_veneer"]
    bx0, bx1, bz0, bz1, b = fx0 + 0.004, fx1 - 0.004, fz0 + 0.002, fz1 - 0.012, 0.008
    y1, y0 = fr - 0.019 + 0.001, lb + k + 0.012
    drawer = [_block(col, wd, fx0, fx1, fr - 0.019, fr, fz0, fz1, "front", bevel=0.001),
              g.box("pull", (0.20, 0.010, 0.010), loc=(0, fr + 0.016, h / 2), col=col, mat=mats["oak_veneer"], bevel=0.003)]
    for s_ in (-1, 1):
        drawer.append(g.box("post", (0.008, 0.013, 0.006), loc=(s_ * 0.09, fr + 0.0055, h / 2), col=col, mat=mats["oak_veneer"]))
    # Over the box, a dark board from the lining's back to just behind the
    # front, under which the box runs: what the top of the shadow gap
    # shows, seen from above, as the solid block did.
    parts.append(_block(col, dark, li0 + k, li1 - k, lb + k, fr - 0.0205, bz1 + 0.002, lz1 - k, "lining"))
    drawer += [_block(col, oak, bx0, bx1, y0, y1, bz0, bz0 + b, "tray"),
               _block(col, oak, bx0, bx0 + b, y0, y1, bz0 + b, bz1, "tray"), _block(col, oak, bx1 - b, bx1, y0, y1, bz0 + b, bz1, "tray"),
               _block(col, oak, bx0 + b, bx1 - b, y0, y0 + b, bz0 + b, bz1, "tray")]
    return parts + g.sliding(drawer, (0.0, fr, h / 2), (0, 1), (y1 - y0) * 0.75, col, label="drawer")


def wardrobe(col, mats, w=1.80, h=FULL, d=0.58):
    """A fitted wardrobe to the ceiling (render 21): its doors in pairs —
    one door alone under 0.9 m — wrapped in a beige-grey linen twill, with
    hairline joints, and one big solid walnut disc pull, 0.34 m across and
    4 cm thick, on each pair's middle joint at 0.98 m (a lone door's near
    its opening edge).

    Hollow behind its doors, white inside, the edges of its boards dark as
    the solid carcass was: a bay behind each pair, a board between each two,
    a shelf across each at 2 m and a rail under it to hang clothes on. A
    pair opens from the middle, each door hung on its outer edge
    ("wardrobe"), its disc pull cut down the joint into a half on each; a
    lone door hangs on its edge away from its pull. Each swings short of a
    right angle by as much as keeps its pull, standing 4 cm proud of it,
    from passing back over the line it hangs on (_pull_swing): open, the
    pull stays clear of a wall the wardrobe stands against end-on and of
    the door hung on the same joint beside it."""
    lin, dark, white, t = mats["linen_panel"], mats["kitchen_gap"], mats["cab_white"], BOARD
    n = 1 if w < 0.9 else max(2, 2 * round(w / 1.1))
    dw = w / n
    yb, face = -d / 2, d / 2
    body = face - 0.022 - 0.001                  # a millimetre behind the doors' backs
    xa, xb = -w / 2 + 0.018, w / 2 - 0.018       # inside the finished side panels
    parts = [_block(col, lin, -w / 2, xa, yb, body, 0.0, h, "side"),
             _block(col, lin, xb, w / 2, yb, body, 0.0, h, "side"),
             _board(col, white, dark, xa, xb, yb, body, 0.0, t),
             _board(col, white, dark, xa, xb, yb, body, h - t, h, up=True),
             _board(col, white, None, xa, xb, yb, yb + t, t, h - t, "back")]
    # A bay behind each pair (or the lone door), a board between each two.
    walls = [-w / 2 + 2 * k * dw for k in range(1, (n + 1) // 2)]
    for x in walls:
        parts.append(_board(col, white, dark, x - t / 2, x + t / 2, yb + t, body, t, h - t))
    shelf = min(h - 0.35, 2.0)
    for a, b in zip([xa] + [x + t / 2 for x in walls], [x - t / 2 for x in walls] + [xb]):
        parts.append(_board(col, white, None, a + 0.001, b - 0.001, yb + t - 0.001, body - 0.01, shelf - t / 2, shelf + t / 2,
                            "shelf"))
        parts.append(g.cylinder("rail", 0.012, b - a + 0.002, loc=((a + b) / 2, (yb + t + body) / 2, shelf - t / 2 - 0.07),
                                rot=(0, PI / 2, 0), col=col, mat=mats["steel"], segments=12))

    r, proud = 0.17, 0.04

    def disc():
        return g.cylinder("pull", r, proud, loc=(0.0, face + proud / 2, 0.98), rot=(PI / 2, 0, 0), col=col, mat=mats["walnut_top"],
                          segments=56)

    for i in range(n):
        x0, x1 = -w / 2 + i * dw, -w / 2 + (i + 1) * dw
        front = [_slab(col, lin, x0, x1, 0.0, h, face, t=0.022)]
        if n == 1:
            pull = disc()
            pull.location.x = w / 2 - 0.20
            front.append(pull)
            side, near = -1, w / 2 - 0.20 - r - (x0 + GAP)
        else:
            # Its half of the pair's disc, cut flush with its joint.
            side = -1 if i % 2 == 0 else 1
            seam = x1 if side < 0 else x0
            pull = disc()
            pull.location.x = seam
            front += _cut([pull], (seam + side * GAP, 0.0), (-side, 0.0))
            near = dw - GAP - r
        parts += _hang(front, x0, x1, face, side, col, label="wardrobe", swing=_pull_swing(near, proud))
    return parts


def _pull_swing(near, proud, clear=0.002):
    """How far a door with a pull `proud` of its face, the pull's nearest
    point `near` from the hinge along the door, may swing — a right angle
    at most — and keep the pull from passing back over the line the door
    hangs on, `clear` short of it: open about the outer corner of its
    face, everything on that face turns back past the hinge by its height
    times the sine of the angle."""
    return min(K_SWING, math.atan2(near, proud + clear))


def rug(col, mats, w, d, mat, r=0.12, t=0.007):
    """A flat low-pile rug with rounded corners."""
    return [_eased_prism("rug", g.rounded_rect(w, d, r, 6), 0.0, t, col, mats[mat], ease=0.002)]


# ---------------------------------------------------------------------
# Terraces
# ---------------------------------------------------------------------

def _tube(col, m, a, b, s=0.024, name="tube"):
    """A square steel tube from point a to point b, `s` across."""
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    d = b - a
    obj = g.box(name, (s, s, d.length), loc=tuple((a + b) / 2), col=col, mat=m, bevel=0.003, segments=1)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return obj


def garden_chair(col, mats, frame="outdoor_sage"):
    """A garden armchair (render 22): a square-tube sage frame on four
    straight legs, teak arm caps, a warm linen sling back between the back
    posts, a thick dusty-tan seat cushion."""
    m = mats[frame]
    w, d = 0.58, 0.58
    hw, hd = w / 2 - 0.015, d / 2 - 0.015
    parts = []
    for sx in (-1, 1):
        x = sx * hw
        parts.append(_tube(col, m, (x, hd, 0), (x, hd, 0.64)))                          # front leg, up to the arm
        parts.append(_tube(col, m, (x, -hd, 0), (x, -hd - 0.03, 0.86)))                 # back leg, up to the back's top
        parts.append(_tube(col, m, (x, -hd, 0.39), (x, hd, 0.39)))                      # seat rail
        parts.append(_tube(col, m, (x, -hd + 0.01, 0.64), (x, hd, 0.64)))              # arm
        parts.append(_block(col, mats["teak"], x - 0.025, x + 0.025, -hd + 0.02, hd + 0.015, 0.652, 0.672, "arm_cap", bevel=0.003))
    for sy in (-1, 1):
        parts.append(_tube(col, m, (-hw, sy * hd, 0.39), (hw, sy * hd, 0.39)))
    parts.append(_tube(col, m, (-hw, -hd - 0.03, 0.85), (hw, -hd - 0.03, 0.85)))
    # The sling: a taut linen panel between the back posts, raked back with
    # them (a positive X turn tips its top to -Y).
    parts.append(_pillow("sling", (w - 0.06, 0.02, 0.36), (0, -hd - 0.022, 0.64), col, mats["canvas_linen"], rot=(0.035, 0, 0),
                         r=0.006, puff=0.25, crease=0.002, cuts=4, axis=1))
    # A taut linen seat between the rails, its edges wrapped into them, and
    # the cushion resting on it (narrower than the frame, it would otherwise
    # hang in the air between the rails).
    parts.append(_pillow("seat", (w - 0.03, d - 0.03, 0.016), (0, 0, 0.394), col, mats["canvas_linen"], r=0.006, puff=0.1,
                         crease=0.002, cuts=4))
    parts.append(_pillow("cushion", (w - 0.05, d - 0.06, 0.08), (0, 0.01, 0.445), col, mats["cushion_tan"], r=0.03, puff=0.18,
                         crease=0.003, cuts=5, seed=3))
    return parts


def _ribbon(name, path, width, col, mat):
    """A flat strap `width` wide (along X) following a path in the YZ plane."""
    import bmesh
    bm = bmesh.new()
    left = [bm.verts.new((x - width / 2, y, z)) for x, y, z in path]
    right = [bm.verts.new((x + width / 2, y, z)) for x, y, z in path]
    for i in range(len(path) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, None, None, True)


def lounge_chair(col, mats, frame="outdoor_orange"):
    """A low lounge chair after HAY's Palissade (render 22): a rounded tube
    frame in terracotta, wide flat straps curving from the back's top down
    into the seat and over its front edge as a bucket; an off-white cushion
    and a mustard lumbar one, both smooth."""
    m = mats[frame]
    w, d = 0.78, 0.78
    parts = []
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.02)
        loop = [(x, d / 2 - 0.02, 0.0), (x, d / 2 - 0.02, 0.6), (x, d / 2 - 0.08, 0.64), (x, -d / 2 + 0.14, 0.64),
                (x, -d / 2 + 0.11, 0.58), (x, -d / 2 + 0.09, 0.0)]
        parts.append(g.sweep("frame", g.catmull_rom(loop, 4), 0.013, sides=10, col=col, mat=m))
        parts.append(g.sweep("rail", [(x, d / 2 - 0.02, 0.2), (x, -d / 2 + 0.09, 0.2)], 0.011, sides=8, col=col, mat=m))
    # The strap's line: over the front edge, dipping into the seat, up the raked back.
    line = g.catmull_rom([(0, d / 2 - 0.02, 0.36), (0, d / 2 - 0.1, 0.4), (0, 0.0, 0.34), (0, -d / 2 + 0.17, 0.3),
                          (0, -d / 2 + 0.08, 0.5), (0, -d / 2 + 0.02, 0.78)], 4)
    n = 14
    for k in range(n):
        x = -w / 2 + 0.06 + k * (w - 0.12) / (n - 1)
        # A slight dish across the seat: the middle straps sit lower.
        dip = 0.02 * (1 - (2 * k / (n - 1) - 1) ** 2)
        parts.append(_ribbon("strap", [(x, y, z - dip) for _, y, z in line], 0.04, col, m))
    for z, y in ((0.36, d / 2 - 0.02), (0.78, -d / 2 + 0.02)):
        parts.append(g.sweep("rail", [(-w / 2 + 0.02, y, z), (w / 2 - 0.02, y, z)], 0.011, sides=8, col=col, mat=m))
    # Both cushions lie back on the straps (a positive X turn tips the top
    # to -Y, the back): the back cushion along the back's 17 degree rake, its
    # back face on the straps; the lumbar against its front, on the seat.
    cushion = _pillow("cushion", (0.5, 0.15, 0.42), (0.03, -0.21, 0.55), col, mats["cushion_offwhite"], rot=(0.29, 0, 0.05),
                      r=0.07, puff=0.4, crease=0.004, cuts=6, axis=1, seed=1)
    lumbar = _pillow("lumbar", (0.42, 0.13, 0.26), (-0.04, -0.045, 0.46), col, mats["cushion_mustard"],
                     rot=(0.35, 0, -0.08), r=0.06, puff=0.45, crease=0.004, cuts=6, axis=1, seed=2)
    # Slid forward until it only touches the back cushion, not inside it.
    _rest(lumbar, [cushion], (0, 1, 0))
    parts += [cushion, lumbar]
    return parts


def side_table_out(col, mats, r=0.225, h=0.5):
    """A white conical pedestal side table, its top 0.45 m across, with a
    bottle of wine and two glasses on it (render 22)."""
    wm = mats["white_matte"]
    parts = [_lathe("top", [(0.05, h - 0.02), (r - 0.006, h - 0.02), (r, h - 0.014), (r, h - 0.006), (r - 0.006, h)], col, wm,
                    segments=40, center_dz=0.0),
             _lathe("base", [(0.17, 0.0), (0.17, 0.012), (0.06, h - 0.05), (0.08, h - 0.02)], col, wm, segments=32, closed=False)]
    parts.append(_lathe("bottle", [(0.036, 0), (0.037, 0.2), (0.03, 0.235), (0.014, 0.26), (0.013, 0.31), (0.015, 0.315),
                                   (0.0, 0.316)], col, mats["glass_bottle"], loc=(-0.06, 0.03, h), segments=16, closed=False))
    for k, (x, y) in enumerate(((0.07, 0.04), (0.04, -0.08))):
        parts.append(_lathe("glass", [(0.032, 0.0), (0.03, 0.004), (0.004, 0.01), (0.004, 0.09), (0.03, 0.11), (0.04, 0.15),
                                      (0.036, 0.19), (0.034, 0.19), (0.037, 0.15), (0.0, 0.12)], col, mats["glass"],
                            loc=(x, y, h), segments=14, closed=False))
    return parts


def candles_out(col, mats):
    """A round wooden tray with three tall black candlesticks and tapers."""
    parts = [_lathe("tray", [(0.17, 0.0), (0.18, 0.02), (0.17, 0.025), (0.16, 0.012)], col, mats["teak"], segments=32)]
    for k, (x, y, hh) in enumerate(((-0.06, 0.02, 0.32), (0.05, 0.05, 0.38), (0.02, -0.07, 0.28))):
        parts.append(_lathe("stick", [(0.03, 0.0), (0.03, 0.01), (0.008, 0.03), (0.007, hh - 0.02), (0.016, hh - 0.01), (0.014, hh)],
                            col, mats["black_metal_matte"], loc=(x, y, 0.012), segments=10))
        parts.append(g.cylinder("taper", 0.008, 0.14, loc=(x, y, 0.012 + hh + 0.07), col=col, mat=mats["porcelain_matte"], segments=8))
    return parts


def outdoor_kitchen(col, mats, w=1.6, d=0.70, grill=False, mirror=False):
    """An outdoor kitchen (render 22): a warm wood cabinet base under a
    thick cream stone top, a white upstand along the back, a sink with a
    black gooseneck mixer — and, `grill`, a built-in grill under a lid.

    The cabinet is hollow behind its doors, teak inside, its boards' edges
    dark as the solid one was, one shelf under the sink's bowl; its doors
    open in pairs from the middle (_hands), a door left over towards its
    nearer end."""
    hgt = 0.90
    tt = 0.1
    wd, dark = mats["teak"], mats["kitchen_gap"]
    face = d / 2 - 0.06
    back, front = -d / 2 + 0.02, face - 0.022 - 0.001
    xa, xb = -w / 2 + 0.02, w / 2 - 0.02
    parts = [_block(col, dark, -w / 2 + 0.05, w / 2 - 0.05, -d / 2 + 0.02, d / 2 - 0.08, 0, 0.08, "plinth"),
             _board(col, wd, dark, xa, xb, back, front, 0.08, 0.08 + BOARD),
             _board(col, wd, None, xa, xb, back, back + BOARD, 0.08 + BOARD, hgt - tt, "back"),
             _board(col, wd, None, xa + 0.001, xb - 0.001, back + BOARD - 0.001, front - 0.01, 0.42 - BOARD / 2, 0.42 + BOARD / 2,
                    "shelf")]
    n = max(2, round(w / 0.55))
    dw = (w - 0.04) / n
    doors = [("door", -w / 2 + 0.02 + i * dw, -w / 2 + 0.02 + (i + 1) * dw) for i in range(n)]
    hands = _hands(doors, (False, False))
    for i, (_, x0, x1) in enumerate(doors):
        parts += _hang([_slab(col, wd, x0, x1, 0.08, hgt - tt, face, t=0.022)], x0, x1, face, hands[i][0], col)
    for s in (-1, 1):
        parts.append(_block(col, wd, s * w / 2 - (0.02 if s > 0 else 0), s * w / 2 + (0 if s > 0 else 0.02), -d / 2 + 0.02, d / 2 - 0.06,
                            0.0, hgt - tt, "side"))
    sx = -w / 2 + 0.45
    sw, sd = 0.45, 0.36
    cy = 0.04
    parts.append(_holed_slab("top", -w / 2, w / 2, -d / 2, d / 2, hgt - tt, hgt, (sx - sw / 2, sx + sw / 2, cy - sd / 2, cy + sd / 2),
                             col, mats["stone_cream"], ease=0.006))
    under = hgt - tt

    def ring(inset, z, r=0.03):
        return [(sx + px, cy + py, z) for px, py in g.rounded_rect(sw - 2 * inset, sd - 2 * inset, max(0.006, r - inset), 4)]

    parts.append(g.loft("bowl", [ring(-0.01, under + 0.001), ring(0, under - 0.004), ring(0.004, under - 0.17), ring(0.02, under - 0.185)],
                        center=(sx, cy, under - 0.19), col=col, mat=mats["steel"]))
    # The white upstand along the back.
    parts.append(_block(col, mats["render_white"], -w / 2, w / 2, -d / 2 - 0.0, -d / 2 + 0.12, hgt, hgt + 0.32, "upstand", bevel=0.004))
    # Its mixer runs cold, into the bowl's floor.
    parts += _gooseneck(col, mats, sx, -d / 2 + 0.17, hgt, "black_metal_matte", h=0.34, reach=0.2, floor=under - 0.187, hot=False)
    if grill:
        gx = w / 2 - 0.45
        parts.append(_block(col, mats["black_metal_matte"], gx - 0.33, gx + 0.33, -d / 2 + 0.14, d / 2 - 0.06, hgt, hgt + 0.012, "grill"))
        parts.append(_lathe("lid", [(0.0, 0.0)], col, mats["steel"]) if False else
                     _block(col, mats["steel"], gx - 0.32, gx + 0.32, -d / 2 + 0.14, d / 2 - 0.1, hgt + 0.012, hgt + 0.2, "lid",
                            bevel=0.03))
        parts.append(g.cylinder("lid_handle", 0.009, 0.4, loc=(gx, d / 2 - 0.07, hgt + 0.15), rot=(0, PI / 2, 0), col=col,
                                mat=mats["steel"], segments=10))
        for k in range(3):
            parts.append(g.cylinder("knob", 0.02, 0.025, loc=(gx - 0.15 + k * 0.15, d / 2 - 0.06 + 0.0125, hgt - 0.05),
                                    rot=(PI / 2, 0, 0), col=col, mat=mats["black_metal_matte"], segments=12))
    return mirrored(parts) if mirror else parts


def parasol(col, mats, r=1.3, h=2.5, canvas="canvas_tan", closed=False):
    """A centre-pole parasol in tan canvas on a stone base: open, or
    `closed`, its canvas furled round the pole."""
    parts = [g.cylinder("pole", 0.022, h, loc=(0, 0, h / 2), col=col, mat=mats["teak"], segments=12),
             g.box("base", (0.5, 0.5, 0.08), loc=(0, 0, 0.04), col=col, mat=mats["concrete_light"], bevel=0.01)]
    if closed:
        n = 16
        prof = [(0.03, h - 1.35), (0.09, h - 1.1), (0.12, h - 0.6), (0.08, h - 0.2), (0.03, h - 0.05)]
        loops = _ring_loops(prof, n, rad=lambda a, rr, z: rr * (1 + (0.12 if int(a / (2 * PI) * n) % 2 else -0.05)))
        parts.append(g.loft("furled", loops, center=(0, 0, h - 0.03), col=col, mat=mats[canvas], smooth=False))
        parts.append(g.cylinder("tie", 0.105, 0.03, loc=(0, 0, h - 0.75), col=col, mat=mats[canvas], segments=16))
        parts.append(g.cone("finial", 0.025, 0.005, 0.08, loc=(0, 0, h + 0.03), col=col, mat=mats["teak"], segments=10))
        return parts
    n = 8
    loops = [[(r * math.cos(2 * PI * i / n), r * math.sin(2 * PI * i / n), h - 0.25) for i in range(n)],
             [(r * 0.5 * math.cos(2 * PI * i / n), r * 0.5 * math.sin(2 * PI * i / n), h - 0.08) for i in range(n)]]
    parts.append(g.loft("canopy", loops, center=(0, 0, h), col=col, mat=mats[canvas], smooth=False))
    for i in range(n):
        a = 2 * PI * i / n
        parts.append(g.box("valance", (2 * r * math.sin(PI / n), 0.004, 0.12),
                           loc=(r * math.cos(PI / n) * math.cos(a + PI / n), r * math.cos(PI / n) * math.sin(a + PI / n), h - 0.31),
                           rot=(0, 0, a + PI / n + PI / 2), col=col, mat=mats[canvas]))
    return parts


def lilac_pot(col, mats, h=3.0):
    """A multi-stem lilac, 3 m, in a dark bronze square planter 1.0 x 1.0 x
    0.6 m (render 22): three smooth pale grey stems splaying in a V, a
    canopy of many small leaves, soft lilac racemes hanging in it."""
    import random
    import bmesh
    from mathutils import Vector
    rnd = random.Random(23)
    parts = [_block(col, mats["planter_bronze"], -0.5, 0.5, -0.5, 0.5, 0, 0.6, "planter", bevel=0.008),
             _block(col, mats["soil_rim"], -0.47, 0.47, -0.47, 0.47, 0.55, 0.585, "soil")]
    tips = []
    for k, a in enumerate((0.3, 2.4, 4.4)):
        dx, dy = math.cos(a), math.sin(a)
        pts = [(dx * 0.05, dy * 0.05, 0.58), (dx * 0.15, dy * 0.15, 1.1), (dx * 0.3, dy * 0.3, 1.7), (dx * 0.42, dy * 0.42, 2.2)]
        parts.append(g.sweep("stem", g.catmull_rom(pts, 5), 0.035 - k * 0.004, sides=8, col=col, mat=mats["bark_pale"]))
        for j in range(3):
            b = a + (j - 1) * 0.7
            ex, ey = math.cos(b), math.sin(b)
            br = [pts[-1], (pts[-1][0] + ex * 0.18, pts[-1][1] + ey * 0.18, 2.5), (pts[-1][0] + ex * 0.28, pts[-1][1] + ey * 0.28, 2.75)]
            parts.append(g.sweep("branch", g.catmull_rom(br, 3), 0.014, sides=6, col=col, mat=mats["bark_pale"]))
            tips.append(br[-1])
    # Leaves: small cards filling a rounded crown, thickest near its surface.
    cz, rx, rz = h - 0.55, 1.0, 0.5

    def shell(lo):
        while True:
            v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0 < v.length <= 1:
                v = v.normalized() * rnd.uniform(lo, 1.0)
                return v

    bm = bmesh.new()
    for _ in range(2300):
        v = shell(0.55)
        p = Vector((v.x * rx, v.y * rx, cz + v.z * rz))
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.2, 1))).normalized()
        u = n.cross(Vector((0, 0, 1)))
        if u.length < 1e-3:
            u = Vector((1, 0, 0))
        u.normalize()
        w_ = n.cross(u)
        L, W = rnd.uniform(0.06, 0.09), rnd.uniform(0.03, 0.045)
        vs = [bm.verts.new(p + u * L), bm.verts.new(p + w_ * W), bm.verts.new(p - u * L * 0.6), bm.verts.new(p - w_ * W)]
        bm.faces.new(vs)
    mesh = bpy.data.meshes.new("leaves")
    bm.to_mesh(mesh)
    bm.free()
    parts.append(g._finish(mesh, "leaves", col, mats["leaf_lilac"], None, None, False))
    # Racemes: soft cones hanging from the crown's outer, lower half.
    for _ in range(64):
        v = shell(0.85)
        v.z = -abs(v.z) * 0.8 + 0.25
        p = Vector((v.x * rx, v.y * rx, cz + v.z * rz))
        L = rnd.uniform(0.15, 0.25)
        parts.append(_lathe("raceme", [(0.014, 0.0), (0.042, L * 0.35), (0.055, L * 0.75), (0.035, L)], col,
                            mats["lilac_flower" if rnd.random() > 0.3 else "lilac_deep"], loc=(p.x, p.y, p.z - L), segments=8,
                            closed=True, center_dz=0.0))
    return parts


def garden_sofa(col, mats, w=2.0, d=0.85, frame="teak", fabric="canvas_cream"):
    """A teak-framed garden sofa with deep canvas cushions."""
    wd, f = mats[frame], mats[fabric]
    parts = [g.box("frame", (w, d, 0.12), loc=(0, 0, 0.2), col=col, mat=wd, bevel=0.004)]
    for sx in (-1, 1):
        parts.append(g.box("arm", (0.07, d, 0.58), loc=(sx * (w / 2 - 0.035), 0, 0.29), col=col, mat=wd, bevel=0.005))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(g.box("leg", (0.06, 0.06, 0.14), loc=(sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0.07), col=col, mat=wd))
    parts.append(g.box("back", (w - 0.14, 0.05, 0.38), loc=(0, -d / 2 + 0.03, 0.45), col=col, mat=wd))
    n = 3 if w > 1.6 else 2
    sw = (w - 0.14) / n
    for i in range(n):
        x = -w / 2 + 0.07 + (i + 0.5) * sw
        parts.append(_soft("seat", (sw - 0.01, d - 0.12, 0.14), (x, 0.04, 0.33), col, f, r=0.04))
        parts.append(_soft("back", (sw - 0.03, 0.16, 0.42), (x, -d / 2 + 0.14, 0.58), col, f, rot=(0.2, 0, 0), r=0.05))
    parts.append(_soft("pillow", (0.42, 0.12, 0.38), (-w / 2 + 0.38, -d / 2 + 0.3, 0.58), col, mats["fabric_terracotta"],
                       rot=(0.25, 0, 0.15), r=0.05))
    return parts


def coffee_table_out(col, mats, w=1.0, d=0.6):
    return slatted_table(col, mats, w=w, d=d, h=0.36, wood="teak")


def dining_table_out(col, mats, w=2.0, d=0.95):
    """A teak garden table on anthracite legs."""
    wd = mats["teak"]
    parts = []
    n = 7
    gap = 0.008
    sw = (d - gap * (n - 1)) / n
    for i in range(n):
        parts.append(g.box("slat", (w, sw, 0.03), loc=(0, -d / 2 + sw / 2 + i * (sw + gap), 0.745), col=col, mat=wd, bevel=0.002))
    parts.append(g.box("apron", (w - 0.1, d - 0.1, 0.06), loc=(0, 0, 0.70), col=col, mat=mats["frame_anthracite"]))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(g.box("leg", (0.05, 0.05, 0.70), loc=(sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), 0.35), col=col,
                               mat=mats["frame_anthracite"]))
    return parts


def jacuzzi(col, mats, w=2.0, d=2.0, h=0.92):
    """A hot tub: grey cladding, a stone coping, seats round water."""
    clad = mats["wpc_grey"]
    parts = []
    t = 0.12
    for s in (-1, 1):
        parts.append(g.box("side", (w, t, h), loc=(0, s * (d / 2 - t / 2), h / 2), col=col, mat=clad, bevel=0.01))
        parts.append(g.box("side", (t, d - 2 * t, h), loc=(s * (w / 2 - t / 2), 0, h / 2), col=col, mat=clad, bevel=0.01))
    for k in range(int(w / 0.14)):
        x = -w / 2 + 0.07 + k * 0.14
        for s in (-1, 1):
            parts.append(g.box("groove", (0.006, 0.004, h - 0.12), loc=(x, s * (d / 2 + 0.001), h / 2), col=col,
                               mat=mats["black_metal"]))
    parts.append(g.box("shell", (w - 2 * t, d - 2 * t, 0.4), loc=(0, 0, 0.2), col=col, mat=mats["acrylic_white"]))
    # Seats round the inside, then the water.
    for s in (-1, 1):
        parts.append(g.box("seat", (w - 2 * t, 0.42, 0.3), loc=(0, s * (d / 2 - t - 0.21), 0.4 + 0.15), col=col,
                           mat=mats["acrylic_white"], bevel=0.04))
    parts.append(g.box("water", (w - 2 * t, d - 2 * t, 0.02), loc=(0, 0, h - 0.12), col=col, mat=mats["water"]))
    # The coping: a stone frame.
    for s in (-1, 1):
        parts.append(g.box("coping", (w + 0.04, 0.16, 0.04), loc=(0, s * (d / 2 - 0.06), h + 0.02), col=col, mat=mats["stone_top"],
                           bevel=0.006))
        parts.append(g.box("coping", (0.16, d - 0.24, 0.04), loc=(s * (w / 2 - 0.06), 0, h + 0.02), col=col, mat=mats["stone_top"],
                           bevel=0.006))
    for k in range(6):
        a = 2 * PI * k / 6
        parts.append(g.cylinder("jet", 0.03, 0.01, loc=(0.55 * math.cos(a) * w / 2, 0.55 * math.sin(a) * d / 2, h - 0.105), col=col,
                                mat=mats["chrome"], segments=12))
    return parts


def lounger(col, mats, frame="teak", fabric="canvas_cream"):
    """A sun lounger: a teak frame on wheels and legs, a padded mattress, the back raised."""
    wd = mats[frame]
    w, l = 0.68, 1.98
    parts = []
    for sx in (-1, 1):
        parts.append(g.box("rail", (0.04, l, 0.08), loc=(sx * (w / 2 - 0.02), 0, 0.28), col=col, mat=wd, bevel=0.004))
        for y in (-l / 2 + 0.12, l / 2 - 0.12):
            parts.append(g.box("leg", (0.05, 0.05, 0.26), loc=(sx * (w / 2 - 0.03), y, 0.13), col=col, mat=wd))
    flat = l * 0.62
    parts.append(_soft("pad", (w - 0.06, flat, 0.07), (0, l / 2 - flat / 2, 0.355), col, mats[fabric], r=0.03))
    back = l - flat
    a = 0.6
    parts.append(_soft("back", (w - 0.06, back, 0.07), (0, -l / 2 + back / 2 * math.cos(a) + 0.05, 0.39 + back / 2 * math.sin(a)),
                       col, mats[fabric], rot=(-a, 0, 0), r=0.03))
    return parts


def bar_stool_out(col, mats):
    """A teak bar stool on four splayed legs."""
    wd = mats["teak"]
    parts = [_disc("seat", 0.19, 0.04, 0.76, col, wd, segments=28)]
    for i in range(4):
        a = PI / 4 + i * PI / 2
        parts.append(g.sweep("leg", [(math.cos(a) * 0.12, math.sin(a) * 0.12, 0.72), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.0)],
                             0.018, sides=8, col=col, mat=wd))
    parts.append(g.sweep("ring", [(math.cos(2 * PI * k / 24) * 0.165, math.sin(2 * PI * k / 24) * 0.165, 0.28) for k in range(25)],
                         0.009, sides=6, col=col, mat=mats["frame_anthracite"]))
    return parts


def olive_pot(col, mats, h=1.6):
    """A dwarf olive in a dark square planter, for the terraces."""
    parts = [
        g.box("planter", (0.6, 0.6, 0.55), loc=(0, 0, 0.275), col=col, mat=mats["frame_anthracite"], bevel=0.01),
        g.box("soil", (0.54, 0.54, 0.02), loc=(0, 0, 0.53), col=col, mat=mats["soil"]),
    ]
    trunk = [(0, 0, 0.52), (0.04, 0.02, 0.8), (-0.02, 0.05, 1.05), (0.03, 0.0, 1.2)]
    parts.append(g.sweep("trunk", g.catmull_rom(trunk, 4), 0.04, sides=8, col=col, mat=mats["olive_bark"]))
    for k, (x, y, z, r) in enumerate(((0, 0, 1.35, 0.32), (0.2, 0.1, 1.25, 0.24), (-0.18, -0.08, 1.28, 0.26),
                                      (0.05, -0.18, 1.5, 0.22), (-0.06, 0.16, 1.52, 0.2))):
        parts.append(g.sphere("crown", r, loc=(x, y, z * h / 1.6), col=col, mat=mats["olive_leaf"], scale=(1, 1, 0.75),
                              subdivisions=2))
    return parts


# ---------------------------------------------------------------------
# Bathrooms and terrace extras (the models audit: AB1, A0, C0, C1, AB2)
# ---------------------------------------------------------------------

def mirrored(parts):
    """The parts mirrored in X about x = 0, as the opposite hand of a piece:
    each mesh's vertices are flipped and its faces turned back to face out
    (a mirror turns their winding inside out), its transform baked in."""
    import bmesh
    from mathutils import Matrix
    flip = Matrix.Scale(-1, 4, (1, 0, 0))
    for p in parts:
        if p.type == "MESH":
            if p.data.users > 1:
                p.data = p.data.copy()
            bm = bmesh.new()
            bm.from_mesh(p.data)
            bmesh.ops.transform(bm, matrix=flip @ p.matrix_basis, verts=bm.verts)
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
            bm.to_mesh(p.data)
            bm.free()
            p.matrix_basis = Matrix.Identity(4)
        else:
            # A hinge or slide marker: mirrored in place, a hinge opening the other way.
            loc, rot = p.location.copy(), p.rotation_euler.copy()
            p.location = (-loc.x, loc.y, loc.z)
            p.rotation_euler = (rot.x, -rot.y, PI - rot.z if "opens" in p and p["opens"].get("type") == "slide" else -rot.z)
            # A hinge turns the other way: about the up axis by the opposite
            # angle; hung on an axis of its own (geometry.hinged's `axis`),
            # the turn just given its marker has reversed that axis already.
            if "opens" in p and p["opens"].get("type") == "hinge" and not p.get("axis"):
                p["opens"]["angle"] = -p["opens"]["angle"]
            # A shower's steam: its glass panes' footprints, said from the
            # marker, mirrored with it (a size needs nothing: geometry.steam).
            fixture = p.get("fixture")
            if fixture is not None and "screens" in fixture.get("steam", {}):
                props = fixture.to_dict()
                props["steam"]["screens"] = [[-x1, -x0, y0, y1] for x0, x1, y0, y1 in props["steam"]["screens"]]
                p["fixture"] = props
    return parts


def _niche_wall(name, x0, x1, y0, y1, z0, z1, niche, col, mat):
    """A tiled pre-wall from the wall (y0) to its face (y1), with a niche
    (nx0, nx1, nz0, nz1, depth) let into its face: one closed mesh, so no
    joint shows round the niche, without the underside it stands on."""
    import bmesh
    nx0, nx1, nz0, nz1, nd = niche
    bm = bmesh.new()

    def quad(pts):
        return [bm.verts.new(p) for p in pts]

    of = quad([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)])
    ob = quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])
    hf = quad([(nx0, y1, nz0), (nx1, y1, nz0), (nx1, y1, nz1), (nx0, y1, nz1)])
    hb = quad([(nx0, y1 - nd, nz0), (nx1, y1 - nd, nz0), (nx1, y1 - nd, nz1), (nx0, y1 - nd, nz1)])
    for k in range(4):
        n = (k + 1) % 4
        bm.faces.new((of[k], of[n], hf[n], hf[k]))          # the face round the niche
        bm.faces.new((hf[k], hf[n], hb[n], hb[k]))          # the niche's sill, sides and head
        bm.faces.new((of[k], ob[k], ob[n], of[n]))          # underside, ends and top
    bm.faces.new(hb)
    bm.faces.new(ob)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    under = [f for f in bm.faces if f.normal.z < -0.9 and all(abs(v.co.z - z0) < 1e-6 for v in f.verts)]
    bmesh.ops.delete(bm, geom=under, context="FACES_ONLY")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, None, None, False)


def _window_wall(name, x0, x1, y0, y1, z0, z1, window, col, mat):
    """A tiled pre-wall from the wall (y0) to its face (y1) with an opening
    (u0, u1, sill) from the sill to its top, the sill a ledge as deep as
    the wall: one closed mesh of quads, without the underside it stands on."""
    import bmesh
    u0, u1, sill = window
    xs, zs = (x0, u0, u1, x1), (z0, sill, z1)
    cells = {(i, j) for i in range(3) for j in range(2)} - {(1, 1)}
    bm = bmesh.new()
    vs = {}

    def v(i, j, k):
        if (i, j, k) not in vs:
            vs[i, j, k] = bm.verts.new((xs[i], (y0, y1)[k], zs[j]))
        return vs[i, j, k]

    for i, j in cells:
        for k in (0, 1):                                    # the back and the face
            bm.faces.new((v(i, j, k), v(i + 1, j, k), v(i + 1, j + 1, k), v(i, j + 1, k)))
        # Each edge of the cell with no cell beyond it, but the floor.
        for (a, b), (di, dj) in ((((i, j), (i, j + 1)), (-1, 0)), (((i + 1, j), (i + 1, j + 1)), (1, 0)),
                                 (((i, j + 1), (i + 1, j + 1)), (0, 1))):
            if (i + di, j + dj) not in cells:
                bm.faces.new((v(*a, 0), v(*b, 0), v(*b, 1), v(*a, 1)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return g._finish(mesh, name, col, mat, None, None, False)


def _linear_drain(col, mats, x0, x1, y0, y1, top, mat):
    """A linear drain flush with a floor whose surface is at `top`: a dark
    slot round a metal grate standing a hair proud of the tiles."""
    return [_block(col, mats["kitchen_gap"], x0, x1, y0, y1, top - 0.004, top + 0.0005, "drain_slot"),
            _block(col, mat, x0 + 0.004, x1 - 0.004, y0 + 0.004, y1 - 0.004, top - 0.002, top + 0.0015, "drain")]


def _niche_bottles(col, mats, x, y, z):
    """Two bottles and a jar standing in a niche whose sill is at `z`."""
    parts = []
    for dx, r, h, mat in ((-0.16, 0.026, 0.19, "bottle_white"), (-0.09, 0.03, 0.15, "bottle_sage"), (0.14, 0.035, 0.08, "bottle_white")):
        parts += [g.cylinder("bottle", r, h, loc=(x + dx, y, z + h / 2), col=col, mat=mats[mat], segments=14),
                  g.cylinder("bottle_cap", r * 0.55, 0.03, loc=(x + dx, y, z + h + 0.013), col=col, mat=mats["black_metal_matte"],
                             segments=12)]
    return parts


def shower_walkin(col, mats, w=2.18, d=1.10, h=2.10, screen=1.0, side=1, style="black", window=None):
    """A floor-flush walk-in shower across a bathroom's end (AB1, C0): its
    back to the wall at -Y, open along its long front (+Y) but for a fixed
    glass screen `screen` long from its +X end (`side` -1: its -X end),
    where the shower falls; a linear drain along the back wall.

    style "black": a grey large-format tiled tray and a tiled pre-wall with
    a niche, the screen in a slim black frame, a black wall mixer and hand
    spray, and a square black rain head on a wall arm over the screened end.
    style "chrome": the joinery shower's finishes — a flush slate tray, tiles
    on the back wall edged in steel, frameless glass in chrome channels and
    its thermostatic bar valve and rain head.

    `window` (u0, u1, sill), x as the piece stands (after `side`): the
    black pre-wall left out from `sill` up between u0 and u1, a tiled
    ledge under, so the window in the wall behind shows (A1+B1-3); the
    bottles stand on the ledge instead of in a niche, the rain head hangs
    from the ceiling, and the mixer and the screen's stay keep to the
    tiles beside the opening.

    Its water falls from the rain head to the tray, turned on at the mixer
    (the bar valve, chrome), and its steam fills the tray's length to the
    screen's top (geometry.water, control, steam)."""
    if window and side < 0:
        window = (-window[1], -window[0], window[2])
    black = style == "black"
    fit = mats["black_metal_matte" if black else "chrome"]
    pw = 0.10 if black else 0.012                 # the back wall's tiles: a pre-wall, or tiles alone
    yb = -d / 2
    yf = yb + pw                                  # the tiles' face
    T = 0.012                                     # the tray's surface
    TOP = 2.0                                     # the screen's top
    xn = w / 2 - 0.45                             # the niche's middle
    parts = []
    if black and window:
        parts.append(_window_wall("tiles", -w / 2, w / 2, yb, yf, 0.0, h, window, col, mats["tile_large_grey"]))
        parts += _niche_bottles(col, mats, window[1] - 0.25, (yb + yf) / 2, window[2])
    elif black:
        parts.append(_niche_wall("tiles", -w / 2, w / 2, yb, yf, 0.0, h, (xn - 0.3, xn + 0.3, 1.10, 1.40, 0.075), col,
                                 mats["tile_large_grey"]))
        parts += _niche_bottles(col, mats, xn, yf - 0.036, 1.10)
    else:
        st = mats["steel"]
        parts += [_block(col, mats["tile_shower"], -w / 2 + 0.004, w / 2 - 0.004, yb, yf, 0.0, h - 0.006, "tiles"),
                  _block(col, st, -w / 2, w / 2, yb, yf + 0.003, h - 0.006, h, "trim"),
                  _block(col, st, -w / 2, -w / 2 + 0.004, yb, yf + 0.003, T, h - 0.006, "trim"),
                  _block(col, st, w / 2 - 0.004, w / 2, yb, yf + 0.003, T, h - 0.006, "trim")]
    parts.append(_block(col, mats["tile_large_grey" if black else "stone_slate"], -w / 2, w / 2, yf - 0.001, d / 2, 0.0, T, "tray",
                        bevel=0.002))
    parts += _linear_drain(col, mats, -w / 2 + 0.03, w / 2 - 0.03, yf + 0.02, yf + 0.08, T, fit if black else mats["steel"])

    # The screen, standing on the tray along the front edge from the end wall.
    xs0, xs1 = w / 2 - screen, w / 2
    gy = d / 2 - 0.012
    if black:
        fy0, fy1, fw = d / 2 - 0.022, d / 2, 0.02
        parts += [_block(col, fit, xs0, xs0 + fw, fy0, fy1, T - 0.001, TOP, "frame"),
                  _block(col, fit, xs1 - fw, xs1, fy0, fy1, T - 0.001, TOP, "frame"),
                  _block(col, fit, xs0 + fw, xs1 - fw, fy0, fy1, T - 0.001, T + fw, "frame"),
                  _block(col, fit, xs0 + fw, xs1 - fw, fy0, fy1, TOP - fw, TOP, "frame"),
                  _block(col, mats["glass"], xs0 + 0.01, xs1 - 0.01, gy - 0.004, gy + 0.004, T + 0.01, TOP - 0.01, "glass")]
        bar_y1, bar_z = fy0 + 0.002, TOP - 0.01
    else:
        parts += [_block(col, mats["glass"], xs0, xs1 - 0.006, gy - 0.004, gy + 0.004, T + 0.004, TOP, "glass"),
                  _block(col, fit, xs1 - 0.022, xs1, gy - 0.011, gy + 0.011, T - 0.001, TOP + 0.002, "channel"),
                  _block(col, fit, xs0 + 0.004, xs1 - 0.022, gy - 0.009, gy + 0.009, T - 0.001, T + 0.012, "channel")]
        bx = xs0 + 0.05
        parts.append(_block(col, fit, bx - 0.02, bx + 0.02, gy - 0.012, gy + 0.012, TOP - 0.045, TOP + 0.008, "clamp", bevel=0.002))
        bar_y1, bar_z = gy - 0.011, TOP - 0.02
    # A stabiliser bar from the screen's free end back to the wall.
    bx = xs0 + 0.05
    if window:
        bx = min(bx, window[0] - 0.035)
    parts += [g.cylinder("bar", 0.008, bar_y1 - yf + 0.002, loc=(bx, (yf - 0.002 + bar_y1) / 2, bar_z), rot=(PI / 2, 0, 0), col=col,
                         mat=fit, segments=10),
              g.cylinder("bar_plate", 0.02, 0.01, loc=(bx, yf + 0.004, bar_z), rot=(PI / 2, 0, 0), col=col, mat=fit, segments=16)]

    if black:
        # Rain head on a wall arm over the middle of the screened end.
        hx, hy, az = w / 2 - screen / 2, yf + 0.45, 2.03
        if window:
            # No wall behind it: a drop from a plate on the ceiling.
            parts += [g.cylinder("ceiling_plate", 0.035, 0.012, loc=(hx, hy, FULL - 0.006), col=col, mat=fit, segments=20),
                      g.cylinder("drop", 0.011, FULL - 0.01 - az, loc=(hx, hy, (FULL - 0.01 + az) / 2), col=col, mat=fit,
                                 segments=12)]
        else:
            parts += [g.cylinder("arm_plate", 0.03, 0.012, loc=(hx, yf + 0.005, az), rot=(PI / 2, 0, 0), col=col, mat=fit,
                                 segments=20),
                      g.cylinder("arm", 0.011, hy - yf + 0.006, loc=(hx, (yf + hy + 0.006) / 2, az), rot=(PI / 2, 0, 0), col=col,
                                 mat=fit, segments=12)]
        parts += [g.cylinder("swivel", 0.013, 0.032, loc=(hx, hy, az - 0.016), col=col, mat=fit, segments=12),
                  g.box("rain_head", (0.30, 0.30, 0.008), loc=(hx, hy, az - 0.035), col=col, mat=fit, bevel=0.003, segments=2),
                  g.box("nozzles", (0.27, 0.27, 0.002), loc=(hx, hy, az - 0.0395), col=col, mat=mats["trim_charcoal"])]
        # Its water, from the nozzles' face to the tray, a little wider than the head where it lands.
        mouth = az - 0.0405
        parts.append(g.water((hx, hy, mouth), "rain", mouth - T, (0.36, 0.36), "rain", size=(0.27, 0.27)))
        # Wall mixer by the entry, a hand spray in a holder over it and its hose.
        mx = w / 2 - screen + 0.08
        if window:
            mx = min(mx, window[0] - 0.09)
        parts += [g.box("mixer_plate", (0.10, 0.012, 0.22), loc=(mx, yf + 0.006, 1.05), col=col, mat=fit, bevel=0.004, segments=2),
                  g.control_round((mx - 0.05, yf, 1.05 - 0.11), (mx + 0.05, yf + 0.062, 1.05 + 0.11), ["rain"])]
        for dz in (-0.055, 0.055):
            parts += [g.cylinder("mixer_knob", 0.022, 0.042, loc=(mx, yf + 0.032, 1.05 + dz), rot=(PI / 2, 0, 0), col=col, mat=fit,
                                 segments=16),
                      g.box("mixer_grip", (0.006, 0.012, 0.04), loc=(mx, yf + 0.056, 1.05 + dz), col=col, mat=fit)]
        hz = 1.30
        parts += [g.cylinder("outlet", 0.014, 0.04, loc=(mx, yf + 0.02, 0.90), rot=(PI / 2, 0, 0), col=col, mat=fit, segments=12),
                  g.box("holder", (0.035, 0.05, 0.03), loc=(mx, yf + 0.025, hz), col=col, mat=fit, bevel=0.004, segments=1),
                  g.cylinder("handset", 0.0145, 0.20, loc=(mx, yf + 0.052, hz + 0.02), col=col, mat=fit, segments=14),
                  g.cylinder("handset_head", 0.019, 0.07, loc=(mx, yf + 0.052, hz + 0.155), col=col, mat=fit, segments=16)]
        hose = g.catmull_rom([(mx, yf + 0.038, 0.90), (mx + 0.012, yf + 0.05, 0.80), (mx + 0.04, yf + 0.06, 0.62),
                              (mx + 0.075, yf + 0.06, 0.56), (mx + 0.095, yf + 0.058, 0.66), (mx + 0.075, yf + 0.055, 0.95),
                              (mx + 0.02, yf + 0.053, 1.12), (mx, yf + 0.052, 1.205)], steps=3)
        parts.append(g.sweep("hose", hose, 0.0065, sides=6, col=col, mat=fit))
    else:
        from . import joinery
        parts += joinery._shower_kit(col, mats, w / 2 - screen / 2, yf, reach=(d - pw) / 2, floor=T)

    # The steam's space: the tray from the back wall's tiles to its open
    # front, from its floor to the screen's top; the screen mists.
    sy, sz = (yf + d / 2) / 2, (T + TOP) / 2
    pane = (xs0 + 0.01, xs1 - 0.01) if black else (xs0, xs1 - 0.006)
    parts.append(g.steam((0.0, sy, sz), (w / 2, (d / 2 - yf) / 2, (TOP - T) / 2), [(pane[0], pane[1], gy - 0.004 - sy, gy + 0.004 - sy)],
                         col))
    return mirrored(parts) if side < 0 else parts


def _vessel(col, mats, x, y, z, rx=0.21, ry=0.17, mat="porcelain"):
    """An oval countertop vessel basin standing on `z`: one turned shell,
    thin-walled, its rim crisp, a black waste in its floor."""
    prof = [(0.004, -0.001), (0.10, 0.002), (0.165, 0.03), (0.198, 0.075), (0.21, 0.122), (0.209, 0.132), (0.2, 0.134),
            (0.196, 0.124), (0.185, 0.078), (0.15, 0.036), (0.09, 0.016)]
    shell = _lathe("basin", prof, col, mats[mat], segments=36, sharp=(5, 6), center_dz=-0.004)
    shell.scale = (rx / 0.21, ry / 0.21, 1.0)
    shell.location = (x, y, z)
    return [shell, g.cylinder("waste", 0.02, 0.003, loc=(x, y, z + 0.0135), col=col, mat=mats["black_metal_matte"], segments=16)]


def _vessel_tap(col, mats, x, y, z, h=0.30, reach=0.17, mat="black_metal_matte", floor=None, group="basin"):
    """A tall single-lever basin mixer for a vessel: a column, a straight
    spout over the bowl (+Y), a lever on its side. Given the vessel's
    `floor`, the water's fixtures too, as joinery.basin_mixer's."""
    m = mats[mat]
    sz = z + h - 0.03
    parts = [g.cylinder("tap_base", 0.024, 0.012, loc=(x, y, z + 0.006), col=col, mat=m, segments=16),
             g.cylinder("tap_body", 0.0155, h - 0.01, loc=(x, y, z + 0.01 + (h - 0.01) / 2), col=col, mat=m, segments=16),
             g.cylinder("tap_spout", 0.0105, reach, loc=(x, y + reach / 2, sz), rot=(PI / 2, 0, 0), col=col, mat=m, segments=12),
             g.cylinder("tap_outlet", 0.012, 0.024, loc=(x, y + reach - 0.004, sz - 0.01), col=col, mat=m, segments=12),
             g.cylinder("tap_hub", 0.012, 0.02, loc=(x + 0.022, y, z + h - 0.07), rot=(0, PI / 2, 0), col=col, mat=m, segments=12),
             g.cylinder("tap_lever", 0.006, 0.07, loc=(x + 0.062, y, z + h - 0.058), rot=(0, PI / 2 - 0.3, 0), col=col, mat=m,
                        segments=8)]
    if floor is not None:
        mouth = sz - 0.022                       # the outlet's underside
        parts += [g.water((x, y + reach - 0.004, mouth), "tap", mouth - floor, (0.12, 0.12), group, r=0.009),
                  g.control_round((x - 0.024, y - 0.024, z), (x + 0.096, y + reach + 0.008, z + h), [group])]
    return parts


def vanity_double(col, mats, w=1.45, d=0.45, wood="oak_veneer", tap="black_metal_matte"):
    """A floating oak double vanity (C1's 1.45 m double basin): two
    handleless drawers under a solid top with a finger-pull shadow, two
    white oval vessel basins with tall black mixers, and one wide mirror
    in a slim black frame over them. Back at -Y; hang it with its
    underside at 0.40 m (y = 0.40), its top is then at 0.80.

    Hollow behind its drawers, white inside, a board between them and a
    dark rail behind the finger pull, as the solid carcass showed there:
    each drawer slides out on a U-shaped tray round the waste of the basin
    over it, which drops through the top and runs back to the wall in a
    trap. Each mixer's water falls into its basin ("basin1" at -X, then
    "basin2")."""
    wd, dark, white = mats[wood], mats["kitchen_gap"], mats["cab_white"]
    z0, z1, tt = 0.40, 0.80, 0.03
    yb, yf = -d / 2, d / 2
    t = BOARD
    xa, xb = -w / 2 + 0.018, w / 2 - 0.018
    body = yf - FT - 0.001                       # the carcass's front, a millimetre behind the drawers
    under = z1 - tt                              # the top's underside
    dz1 = under - 0.02                           # the drawers' top, under the finger pull
    parts = [_block(col, wd, -w / 2, -w / 2 + 0.018, yb, yf, z0, z1 - tt, "side"),
             _block(col, wd, w / 2 - 0.018, w / 2, yb, yf, z0, z1 - tt, "side"),
             _block(col, wd, -w / 2 + 0.018, w / 2 - 0.018, yb, yf, z0, z0 + 0.012, "bottom"),
             _block(col, wd, -w / 2, w / 2, yb, yf, z1 - tt, z1, "top", bevel=0.002),
             _board(col, white, None, xa, xb, yb, yb + t, z0 + 0.012, under, "back"),
             _board(col, white, dark, -t / 2, t / 2, yb + t, body, z0 + 0.012, under),
             _board(col, dark, dark, xa, xb, body - t, body, dz1 - 0.012, under, "rail")]
    dw = (w - 0.036) / 2
    ty = yb + 0.045
    for i, s_ in enumerate((-1, 1)):
        x0 = -w / 2 + 0.018 + i * dw
        bx, by = s_ * w / 4, 0.02
        parts += _vessel(col, mats, bx, by, z1)
        parts += _vessel_tap(col, mats, bx, ty, z1, reach=by - ty - 0.02, mat=tap, floor=z1 + 0.014, group=f"basin{i + 1}")
        # The trap, from the basin's waste down through the top and back to the wall.
        parts.append(g.sweep("trap", g.catmull_rom([(bx, by, under + 0.004), (bx, by, under - 0.10), (bx, by - 0.04, under - 0.17),
                                                    (bx, by - 0.12, under - 0.17), (bx, yb + t - 0.005, under - 0.14)], steps=2),
                             0.016, sides=8, col=col, mat=mats["white_matte"]))
        # The drawer: its front, and a white tray inside the carcass's
        # boards, U-shaped round the trap — open at the back, so the trap
        # stays in the notch as the drawer runs out.
        tx0 = (xa if i == 0 else t / 2) + 0.006
        tx1 = (-t / 2 if i == 0 else xb) - 0.006
        y1, y0 = yf - FT + 0.001, yb + t + 0.01
        zf, zt = z0 + 0.012 + 0.008, dz1 - 0.04
        n0, n1, ny, k = bx - 0.055, bx + 0.055, by + 0.055, 0.012
        drawer = [_slab(col, wd, x0, x0 + dw, z0 + 0.012, dz1, yf),
                  _block(col, white, tx0, n0, y0, y1, zf, zf + k, "tray"), _block(col, white, n1, tx1, y0, y1, zf, zf + k, "tray"),
                  _block(col, white, n0, n1, ny, y1, zf, zf + k, "tray"),
                  _block(col, white, tx0, tx0 + k, y0, y1, zf + k, zt, "tray"), _block(col, white, tx1 - k, tx1, y0, y1, zf + k, zt, "tray"),
                  _block(col, white, tx0 + k, n0, y0, y0 + k, zf + k, zt, "tray"), _block(col, white, n1, tx1 - k, y0, y0 + k, zf + k, zt, "tray"),
                  _block(col, white, n0, n0 + k, y0, ny, zf + k, zt, "tray"), _block(col, white, n1 - k, n1, y0, ny, zf + k, zt, "tray"),
                  _block(col, white, n0 + k, n1 - k, ny, ny + k, zf + k, zt, "tray")]
        parts += g.sliding(drawer, (x0 + dw / 2, yf, (z0 + dz1) / 2), (0, 1), (y1 - y0) * 0.75, col, label="drawer")
    # The mirror: glass set a few millimetres back in a slim black frame.
    fm = mats["black_metal_matte"]
    mw, m0, m1, fb = 1.20, 1.15, 1.90, 0.015
    fy0, fy1 = yb + 0.004, yb + 0.028
    parts += [_block(col, fm, -mw / 2, mw / 2, fy0, fy1, m1 - fb, m1, "mirror_frame"),
              _block(col, fm, -mw / 2, mw / 2, fy0, fy1, m0, m0 + fb, "mirror_frame"),
              _block(col, fm, -mw / 2, -mw / 2 + fb, fy0, fy1, m0 + fb, m1 - fb, "mirror_frame"),
              _block(col, fm, mw / 2 - fb, mw / 2, fy0, fy1, m0 + fb, m1 - fb, "mirror_frame"),
              _block(col, mats["mirror"], -mw / 2 + 0.008, mw / 2 - 0.008, yb + 0.016, yb + 0.022, m0 + 0.008, m1 - 0.008, "mirror")]
    return parts


def coffee_table_round_out(col, mats, r=0.375, h=0.36, top="marble_light", base="white_matte"):
    """A low round garden coffee table, ld-out-side's family: a white marble
    top with an eased edge on a wide white conical drum."""
    return [_lathe("top", [(0.06, h - 0.025), (r - 0.008, h - 0.025), (r, h - 0.017), (r, h - 0.008), (r - 0.008, h)], col, mats[top],
                   segments=56, center_dz=0.0),
            _lathe("base", [(0.235, 0.0), (0.235, 0.012), (0.228, 0.02), (0.17, h - 0.045), (0.172, h - 0.032), (0.18, h - 0.024)], col,
                   mats[base], segments=44, closed=False)]


def outdoor_shower(col, mats, h=2.25):
    """A freestanding brushed-stainless garden shower (render 15): a 50 mm
    post at the back curving over in a gooseneck to a 0.25 m rain head at
    2.2 m, over a 0.35 m square teak drain plate; a lever mixer at 1.0 m and
    a hand spray in a holder beside it. The arm reaches forward (+Y)."""
    st, tk = mats["steel"], mats["teak"]
    py, hy, pr = -0.228, 0.10, 0.025
    parts = []
    # Teak slats on three battens.
    p0, p1 = -0.075, 0.275
    for bx in (-0.14, 0.0, 0.14):
        parts.append(_block(col, tk, bx - 0.015, bx + 0.015, p0 + 0.01, p1 - 0.01, 0.0, 0.025, "batten"))
    n, gap = 6, 0.008
    sw = (p1 - p0 - gap * (n - 1)) / n
    for i in range(n):
        y0 = p0 + i * (sw + gap)
        parts.append(_block(col, tk, -0.175, 0.175, y0, y0 + sw, 0.025, 0.047, "slat", bevel=0.002))
    # The post and its gooseneck, one tube: up, over a quarter bend, forward.
    zc = h - pr - 0.005
    R = 0.16
    path = [(0, py, 0.0), (0, py, 1.0), (0, py, zc - R - 0.06), (0, py, zc - R)]
    for k in range(1, 11):
        a = (PI / 2) * k / 10
        path.append((0, py + R - R * math.cos(a), zc - R + R * math.sin(a)))
    path += [(0, (py + R + hy) / 2, zc), (0, hy, zc)]
    parts += [g.sweep("post", path, pr, sides=18, col=col, mat=st),
              g.sphere("post_end", pr, loc=(0, hy, zc), col=col, mat=st, subdivisions=2),
              g.cylinder("flange", 0.045, 0.012, loc=(0, py, 0.006), col=col, mat=st, segments=24),
              g.cylinder("swivel", 0.018, 0.03, loc=(0, hy, zc - pr), col=col, mat=st, segments=16),
              g.cylinder("rain_head", 0.125, 0.016, loc=(0, hy, zc - pr - 0.023), col=col, mat=st, segments=40),
              g.cylinder("nozzles", 0.105, 0.002, loc=(0, hy, zc - pr - 0.0305), col=col, mat=mats["trim_charcoal"], segments=40)]
    # Lever mixer on the post's front, at 1.0 m.
    mz = 1.0
    a = 0.35
    parts += [g.cylinder("mixer", 0.021, 0.075, loc=(0, py + 0.045, mz), rot=(PI / 2, 0, 0), col=col, mat=st, segments=16),
              g.cylinder("mixer_hub", 0.012, 0.03, loc=(0, py + 0.06, mz + 0.025), col=col, mat=st, segments=12),
              g.cylinder("lever", 0.006, 0.11, loc=(0, py + 0.06 + 0.055 * math.cos(a), mz + 0.04 + 0.055 * math.sin(a)),
                         rot=(PI / 2 + a, 0, 0), col=col, mat=st, segments=8)]
    # Hand spray in a holder clamped to the post's side, its hose from the mixer.
    hx, hz = 0.07, 0.95
    parts += [g.cylinder("clamp", 0.031, 0.03, loc=(0, py, hz), col=col, mat=st, segments=20),
              g.box("holder_arm", (0.04, 0.014, 0.02), loc=(0.045, py, hz), col=col, mat=st),
              g.cylinder("holder", 0.019, 0.03, loc=(hx, py, hz), col=col, mat=st, segments=16),
              g.cylinder("handset", 0.0135, 0.22, loc=(hx, py, hz + 0.02), col=col, mat=st, segments=14),
              g.cylinder("handset_head", 0.021, 0.06, loc=(hx, py, hz + 0.155), col=col, mat=st, segments=16)]
    hose = g.catmull_rom([(0, py + 0.06, mz - 0.02), (0.01, py + 0.07, 0.86), (0.04, py + 0.08, 0.70), (0.075, py + 0.06, 0.64),
                          (0.095, py + 0.03, 0.70), (0.08, py + 0.008, 0.80), (hx, py, 0.84)], steps=4)
    parts.append(g.sweep("hose", hose, 0.0065, sides=8, col=col, mat=st))
    # Its water, cold, from the nozzles to the teak plate under them,
    # turned on at the lever mixer.
    mouth = zc - pr - 0.0315
    parts += [g.water((0, hy, mouth), "rain", mouth - 0.047, (0.30, 0.30), "rain", hot=False, r=0.105),
              g.control_round((-0.025, py + 0.005, mz - 0.025), (0.025, py + 0.168, mz + 0.085), ["rain"])]
    return parts


def kamado(col, mats):
    """A kamado grill (render 12): a 0.52 m black ceramic egg with chrome
    bands, hinge and handle, a black top vent and a draft door, sitting in
    a black steel nest on castors, a small teak shelf on its +X side."""
    blk, cr, ms = mats["kamado_black"], mats["chrome"], mats["black_metal_matte"]
    cx, zb = -0.06, 0.40
    seam = zb + 0.275
    parts = [
        _lathe("egg_base", [(0.004, 0.0), (0.10, 0.008), (0.17, 0.04), (0.22, 0.10), (0.25, 0.18), (0.26, 0.275)], col, blk,
               loc=(cx, 0, zb), segments=36, center_dz=0.0),
        _lathe("egg_lid", [(0.26, 0.278), (0.256, 0.34), (0.24, 0.41), (0.20, 0.48), (0.14, 0.53), (0.075, 0.555)], col, blk,
               loc=(cx, 0, zb), segments=36, center_dz=0.002),
        _lathe("band", [(0.246, 0.215), (0.266, 0.219), (0.266, 0.268), (0.256, 0.272)], col, cr, loc=(cx, 0, zb), segments=36,
               closed=False),
        _lathe("band", [(0.255, 0.281), (0.266, 0.285), (0.266, 0.330), (0.25, 0.334)], col, cr, loc=(cx, 0, zb), segments=36,
               closed=False),
        # Top vent: a cast cap on a short chimney.
        g.cylinder("vent", 0.06, 0.05, loc=(cx, 0, zb + 0.575), col=col, mat=ms, segments=24),
        g.cylinder("vent_cap", 0.072, 0.014, loc=(cx, 0, zb + 0.607), col=col, mat=ms, segments=24),
        g.cylinder("vent_wheel", 0.032, 0.022, loc=(cx, 0, zb + 0.625), col=col, mat=ms, segments=16),
        g.cylinder("vent_knob", 0.01, 0.018, loc=(cx, 0, zb + 0.643), col=col, mat=cr, segments=10),
        # Draft door low on the front.
        _block(col, cr, cx - 0.06, cx + 0.06, 0.18, 0.232, zb + 0.06, zb + 0.13, "draft_door", bevel=0.003),
        _block(col, ms, cx - 0.045, cx + 0.045, 0.2, 0.234, zb + 0.072, zb + 0.118, "draft_slot"),
        # Hinge at the back, two springs beside it.
        _block(col, cr, cx - 0.05, cx + 0.05, -0.31, -0.25, seam - 0.06, seam + 0.06, "hinge", bevel=0.005),
    ]
    for s in (-1, 1):
        parts.append(g.cylinder("spring", 0.013, 0.14, loc=(cx + s * 0.035, -0.31, seam - 0.05), col=col, mat=cr, segments=12))
        # Handle posts from the lid band.
        parts.append(g.cylinder("handle_post", 0.008, 0.07, loc=(cx + s * 0.08, 0.29, seam + 0.05), rot=(PI / 2, 0, 0), col=col, mat=cr,
                                segments=10))
    parts.append(g.cylinder("handle", 0.012, 0.22, loc=(cx, 0.312, seam + 0.05), rot=(0, PI / 2, 0), col=col, mat=cr, segments=14))
    # The nest: a ring round the egg's foot on four splayed legs, a lower
    # ring tying them, a castor under each.
    ring = [(cx + 0.19 * math.cos(2 * PI * k / 32), 0.19 * math.sin(2 * PI * k / 32), zb + 0.04) for k in range(33)]
    low = [(cx + 0.235 * math.cos(2 * PI * k / 32), 0.235 * math.sin(2 * PI * k / 32), 0.14) for k in range(33)]
    parts += [g.sweep("nest_ring", ring, 0.012, sides=8, col=col, mat=ms), g.sweep("nest_ring", low, 0.01, sides=8, col=col, mat=ms)]
    for k in range(4):
        a = PI / 4 + k * PI / 2
        ca, sa = math.cos(a), math.sin(a)
        parts.append(g.sweep("leg", [(cx + 0.19 * ca, 0.19 * sa, zb + 0.05), (cx + 0.245 * ca, 0.245 * sa, 0.07)], 0.013, sides=8, col=col,
                             mat=ms))
        parts += [g.cylinder("castor_fork", 0.016, 0.03, loc=(cx + 0.245 * ca, 0.245 * sa, 0.065), col=col, mat=ms, segments=10),
                  g.cylinder("castor", 0.03, 0.022, loc=(cx + 0.245 * ca, 0.245 * sa, 0.03), rot=(0, PI / 2, a), col=col,
                             mat=mats["rubber"], segments=16)]
    # Teak side shelf on two black brackets from the base band.
    sx0, sx1, sz = cx + 0.272, 0.325, seam - 0.035
    n, gp = 3, 0.006
    sw = (sx1 - sx0 - gp * (n - 1)) / n
    for i in range(n):
        x0 = sx0 + i * (sw + gp)
        parts.append(_block(col, mats["teak"], x0, x0 + sw, -0.17, 0.17, sz - 0.02, sz, "shelf", bevel=0.002))
    for y in (-0.12, 0.12):
        parts.append(_block(col, ms, cx + 0.255, sx1 - 0.01, y - 0.008, y + 0.008, sz - 0.035, sz - 0.02, "bracket"))
        parts.append(g.sweep("brace", [(cx + 0.24, y, zb + 0.17), (sx1 - 0.03, y, sz - 0.03)], 0.006, sides=6, col=col, mat=ms))
    return parts

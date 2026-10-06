# Flat faces at a part's lowest point: a soft pillow or cushion should rest
# on a small, rounded contact patch, not on a flat-clamped base. The round-1
# bed pillows were pressed flat into a 72 x 15 cm sheet at exactly one height
# (946 cm2), which read in the app as a flat plane through the pillow.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/flatbase.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--tol 0.0025] [--max-depth 0.05]
#
# How: per part, its lowest vertex height; the faces facing down (normal z
# under -0.9) whose vertices all lie within --tol (default 2.5 mm) of it are
# the flat base. Faces whose centre is more than 2 mm inside another closed
# part are buried (sunk into a mattress or seat: never seen) and set apart.
# Prints the visible patch's face count and area, and its length and depth
# along the part's own horizontal axes (length along its long side, depth
# across it), beside the part's.
#
# Good: a pillow's visible patch only a few cm deep (Ladonia's bed pillows
# and cushions 3-5 cm, sofa pillows none), whatever its length. With a filter
# (--mat, --part, --box) the verdict is FAIL when a selected part's patch is
# deeper than --max-depth (default 5 cm); without one it is an overview
# (WARN) — a mattress, seat cushions, a carcass or legs rest flat by design.
# Coordinates and part numbering: _glb.py.
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402
import numpy as np  # noqa: E402

p = G.parser("Flat faces at each part's lowest point.")
p.add_argument("--tol", type=float, default=0.0025, help="height band above the lowest point (m, default 0.0025)")
p.add_argument("--max-depth", type=float, default=0.05, help="deepest allowed flat patch (m, default 0.05)")
a = G.parse(p)
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("FLATBASE")
filtered = bool(a.mat or a.part or a.box)


def buried(q, c):
    for B in m.parts:
        if B is q or not B.closed or not all(B.lo[k] <= c[k] <= B.hi[k] for k in range(3)):
            continue
        v = G.Vector(c)
        if G.inside(B.bvh, v) and B.bvh.find_nearest(v)[3] > 0.002:
            return True
    return False


flat_parts = []
for q in m.select(a):
    P = np.array([tuple(v) for v in q.verts])
    zmin = P[:, 2].min()
    # The part's own horizontal axes: the principal axes of its footprint.
    xy = P[:, :2] - P[:, :2].mean(0)
    V = np.linalg.eigh(np.cov(xy.T))[1] if len(P) > 2 else np.eye(2)
    long_, across = V[:, 1], V[:, 0]
    patch, area, hidden = [], 0.0, 0.0
    for f in q.faces:
        vs = P[f]
        if (vs[:, 2] - zmin).max() > a.tol:
            continue
        n = np.zeros(3)
        for k in range(1, len(f) - 1):
            n += np.cross(vs[k] - vs[0], vs[k + 1] - vs[0])
        nn = np.linalg.norm(n)
        if nn == 0 or n[2] / nn > -0.9:
            continue
        if buried(q, vs.mean(0)):
            hidden += nn / 2
            continue
        area += nn / 2
        patch.append(vs)
    span = lambda pts, ax: (pts[:, :2] @ ax).max() - (pts[:, :2] @ ax).min()
    if patch:
        pts = np.vstack(patch)
        L, D = span(pts, long_), span(pts, across)
    else:
        L = D = 0.0
    PL, PD = span(P, long_), span(P, across)
    print(f"  {q.label():70s} z {zmin:.3f}  flat {len(patch):4d} faces {area * 1e4:6.0f} cm2  "
          f"patch {L * 100:5.1f} x {D * 100:4.1f} cm of {PL * 100:5.1f} x {PD * 100:4.1f}"
          + (f"  (+{hidden * 1e4:.0f} cm2 buried)" if hidden else ""))
    if D > a.max_depth:
        flat_parts.append((q, L, D, area))

if not flat_parts:
    G.verdict("OK", f"no flat base deeper than {a.max_depth * 100:.0f} cm")
else:
    text = (f"{len(flat_parts)} part(s) rest on a flat base deeper than {a.max_depth * 100:.0f} cm: "
            + ", ".join(f"#{q.index} {q.mat} {L * 100:.0f}x{D * 100:.0f} cm" for q, L, D, _ in flat_parts[:6]))
    G.verdict("FAIL" if filtered else "WARN",
              text + ("" if filtered else " — overview only: select the soft parts with --mat to judge them"))

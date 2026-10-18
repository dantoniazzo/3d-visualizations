# Coplanar overlapping faces inside one GLB: two faces of different parts or
# materials lying in the same plane, facing the same way. They z-fight
# (flicker) in the app. ../z-fighting.md has the depth-precision rule; this finds
# the cases built into a model (a splashback running on behind an open
# shelf's back panel, a frame's face in its carcass's plane, a plate on a
# panel).
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/coplanar.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--tol 0.0001] [--seen 0.3] [--min-area 1]
#
# How: every face triangulated; at its centre and at three points 70 % of
# the way to its corners, the faces within --tol (default 0.1 mm: the app's
# camera fights such gaps from about 9 m, ../z-fighting.md) whose normal is within
# 2.5 degrees of this face's, same way round. Faces of one part that share a
# vertex are neighbours, not overlaps. The filters pick the faces tested;
# their partners can be anywhere.
#
# Each overlap is one flat patch: a pair of (part, material) in one plane,
# printed with its facing, estimated area (the smaller side's, from the
# sample points that found a partner) and extent. Labels, in order:
#   layered           the app draws one of the two in front by its material
#                     name (FurnitureLibrary.js `layerFlushFaces`: screens,
#                     glass, hobs, handles… in front; gaps, grooves,
#                     plinths… behind; the patterns are read from that file,
#                     so they follow the app): no flicker
#   sliver            under --min-area (1 cm2)
#   hidden: underside facing down at the piece's lowest level (on the floor)
#   hidden: back      facing -Y at its back (against the wall, for pieces
#                     modelled front to +Y)
#   hidden: enclosed  seen from at most --seen (30 %) of its sample points; a
#                     point sees out when a ray along the normal or 30
#                     degrees off it leaves the piece (inside a carcass,
#                     behind shut doors, sandwiched between two units);
#                     `seen` is printed
#   end               facing +-X at the piece's own end: hidden when that end
#                     stands against a wall, seen when it is open
#   same material     harmless unless their textures differ
#   fights            the rest: different materials in one plane, in view
#
# Good: no "fights" patch (Ladonia's beds, sofas, lounge chair and the L
# kitchen). Verdict: FAIL on a "fights" patch, WARN on "end" or "same
# material" ones, else OK ("layered", "sliver" and "hidden" are listed only).
# Coordinates and part numbering: _glb.py.
import os
import re
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

p = G.parser("Coplanar overlapping faces of different parts or materials.")
p.add_argument("--tol", type=float, default=0.0001, help="largest gap between the planes (m, default 0.0001)")
p.add_argument("--seen", type=float, default=0.3,
               help="a patch seen from this share of its sample points or less is enclosed (default 0.3)")
p.add_argument("--min-area", type=float, default=1.0, help="patches under this many cm2 are slivers (default 1)")
a = G.parse(p)
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("COPLANAR")

# One triangle list over every part, each triangle with its part, material and
# vertex keys (part, vertex index) for the neighbour test.
verts, tris, owner, tmat, keys = [], [], [], [], []
for q in m.parts:
    base = len(verts)
    verts += q.verts
    for f, mat in zip(q.faces, q.face_mats):
        for k in range(1, len(f) - 1):
            tris.append((base + f[0], base + f[k], base + f[k + 1]))
            owner.append(q.index)
            tmat.append(mat)
            keys.append({f[0], f[k], f[k + 1]})
bvh = BVHTree.FromPolygons(verts, tris)
V = np.array([tuple(v) for v in verts])
T = np.array(tris)
nrm = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
area = np.linalg.norm(nrm, axis=1) / 2
nrm = nrm / np.maximum(np.linalg.norm(nrm, axis=1), 1e-12)[:, None]
tested = {q.index for q in m.select(a)}

# The app's flush-face layering, from its own source.
LIB = os.path.join(G.REPO, "frontend", "Experience", "World", "Builders", "FurnitureLibrary.js")
try:
    src = open(LIB).read()
    FRONT = re.compile(re.search(r"const front = /(.+?)/i\.test", src).group(1), re.I)
    BACK = re.compile(re.search(r"const back = /(.+?)/i\.test", src).group(1), re.I)
except (OSError, AttributeError):
    FRONT = BACK = None
    print(f"  (no layering patterns found in {LIB}: every different-material pair counts as fighting)")


def layer(mat):
    if FRONT is None:
        return 0
    return -1 if FRONT.search(mat) else 1 if BACK.search(mat) else 0


# Overlaps grouped per pair of (part, material) and per plane (facing and
# offset), so one group is one flat patch.
found = {}
for i in range(len(tris)):
    if owner[i] not in tested or area[i] < 1e-8:
        continue
    pts = V[T[i]]
    c = pts.mean(0)
    samples = [c] + [c + 0.7 * (v - c) for v in pts]
    for si, s in enumerate(samples):
        for _, _, j, _ in bvh.find_nearest_range(Vector(s), a.tol):
            if j == i or nrm[i] @ nrm[j] < 0.999:
                continue
            if owner[i] == owner[j] and (tmat[i] == tmat[j] or keys[i] & keys[j]):
                continue
            pa, pb = sorted(((owner[i], tmat[i]), (owner[j], tmat[j])))
            nq = tuple(float(round(x, 2)) + 0.0 for x in nrm[i])
            key = (pa, pb, nq, round(float(nrm[i] @ s), 3))
            rec = found.setdefault(key, {"hit": {pa: {}, pb: {}}, "pts": [], "n": nrm[i]})
            rec["hit"][(owner[i], tmat[i])][(i, si)] = area[i] / len(samples)
            rec["pts"].append(s)


def facing(n):
    k = int(np.argmax(np.abs(n)))
    return ("+" if n[k] > 0 else "-") + "XYZ"[k] if abs(n[k]) > 0.98 else f"({n[0]:+.2f},{n[1]:+.2f},{n[2]:+.2f})"


def seen(n, pts):
    """Share of the patch's sample points (up to 16) from which the patch can
    be seen: a ray along its normal, or at 30 degrees off it (four ways),
    leaves the piece. 0 means the piece itself encloses the patch (inside a
    carcass, behind shut doors, sandwiched between two units)."""
    n = Vector(n)
    u = n.orthogonal().normalized()
    v = n.cross(u)
    dirs = [n] + [(n + d * 0.5774).normalized() for d in (u, -u, v, -v)]
    step = max(2 * a.tol, 5e-4)
    pick = pts[:: max(1, len(pts) // 16)][:16]
    out = sum(1 for s in pick if any(bvh.ray_cast(Vector(s) + n * step, d, 5.0)[0] is None for d in dirs))
    return out / len(pick)


rows = []
for (pa, pb, _, _), rec in found.items():
    ar = min(sum(h.values()) for h in rec["hit"].values() if h)
    n, P = rec["n"], np.array(rec["pts"])
    lo, hi = P.min(0), P.max(0)
    vis = None
    if layer(pa[1]) != layer(pb[1]):
        kind = "layered"
    elif ar * 1e4 < a.min_area:
        kind = "sliver"
    elif n[2] < -0.98 and lo[2] <= m.lo.z + 0.01:
        kind = "hidden: underside"
    elif n[1] < -0.98 and lo[1] <= m.lo.y + 0.01:
        kind = "hidden: back"
    elif (vis := seen(n, rec["pts"])) <= a.seen:
        kind = "hidden: enclosed"
    elif abs(n[0]) > 0.98 and (lo[0] <= m.lo.x + 0.01 or hi[0] >= m.hi.x - 0.01):
        kind = "end"
    elif pa[1] == pb[1]:
        kind = "same material"
    else:
        kind = "fights"
    rows.append((kind, pa, pb, ar, n, lo, hi, vis))

order = {"fights": 0, "end": 1, "same material": 2, "hidden: underside": 3, "hidden: back": 3,
         "hidden: enclosed": 3, "sliver": 4, "layered": 4}
for kind, pa, pb, ar, n, lo, hi, vis in sorted(rows, key=lambda r: (order[r[0]], -r[3])):
    print(f"  {kind:17s} #{pa[0]} {pa[1]} / #{pb[0]} {pb[1]}  facing {facing(n)}  {ar * 1e4:7.1f} cm2  "
          f"x {lo[0]:+.3f}..{hi[0]:+.3f} y {lo[1]:+.3f}..{hi[1]:+.3f} z {lo[2]:.3f}..{hi[2]:.3f}"
          + (f"  seen {vis * 100:.0f} %" if vis is not None else ""))

count = {k: sum(1 for r in rows if r[0].startswith(k))
         for k in ("fights", "end", "same material", "hidden", "sliver", "layered")}
summary = (f"{count['fights']} fighting, {count['end']} at an end, {count['same material']} same-material, "
           f"{count['hidden']} hidden, {count['sliver']} sliver, {count['layered']} layered patch(es)")
G.verdict("FAIL" if count["fights"] else "WARN" if count["end"] or count["same material"] else "OK", summary)

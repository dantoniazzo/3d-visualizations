# Thickness profile of plate-like parts (pillows, cushions, a seat pad):
# how thick each part is across its width at mid-height and up its height at
# mid-width. A natural pillow is a lens: thickest in the middle, thinning
# steadily to the seam. The faults it shows are a flat slab (a plateau
# across the middle, then a steep wall at the seam), a thin flat rim (a
# flange plate or a fin sticking out of the seam), and dents.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/profile.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--samples 21] [--max 12]
#
# How: each part's area-weighted principal axes (thin n, middle, long; the
# middle axis points up for an upright part). At evenly spaced points on the
# part's mid-plane, a ray along n through the part's own surface: thickness
# = last hit - first hit. Rows print in cm, end to end: `across` along the
# long side toward +X (+Y if it runs along Y), `up` along the middle side
# from bottom to top (back to front for a lying part). Per row: `half` = mean thickness at +-half the width over
# the maximum; `rim` = how far in from the silhouette's edge the part stays
# under 1 cm thick (scanned in 2 mm steps); `dent` = the largest rise met
# walking outward from the maximum (a dip, then thicker again).
#
# Good: a lens (pillows) reads half 0.65-0.85, a crowned box (a boxed seat
# or back cushion) 0.85-0.94; rim under 2 cm; dent under 1.5 cm. A flat slab
# reads half over 0.94 (the round-1 sofa pillows: 0.93-0.97); a flange or fin
# reads rim 4-7 cm (the round-1 white bed pillow: 4.2; Ladonia's dark Euro
# shams keep a 4-5 cm flange on purpose, as the listing's have). A mattress
# and fitted panels are slabs by design: run this on soft parts (--mat).
# Parts that are not plates (thickness over 0.6 of the middle side) are
# skipped; an open sheet (a duvet) has no thickness to measure. The verdict
# is OK or WARN, never FAIL: a flange or a boxed cushion can be meant, so look
# at the part in views.py's side view before changing it. Coordinates and
# part numbering: _glb.py.
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

p = G.parser("Thickness profile of plate-like parts.")
p.add_argument("--samples", type=int, default=21, help="samples per row (default 21)")
p.add_argument("--max", type=int, default=12, help="profile at most this many parts (default 12)")
p.add_argument("--min-size", type=float, default=0.12, help="ignore parts shorter than this (m)")
a = G.parse(p)
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("PROFILE")


def frame(q):
    _, _, V = G.surface_axes(q.tris)
    n, b, l = Vector(V[:, 0]), Vector(V[:, 1]), Vector(V[:, 2])
    if abs(b.z) > 0.3:
        b = b if b.z > 0 else -b          # upright: bottom to top
    else:
        b = b if b.y > 0 else -b          # lying: back to front
    l = l if (l.x if abs(l.x) >= abs(l.y) else l.y) > 0 else -l
    M = np.array([tuple(n), tuple(b), tuple(l)]).T
    lo, hi = G.extents(q.verts, M)
    return n, b, l, lo, hi


def thick(q, n, pt, reach):
    o, hits = pt - n * reach, []
    for _ in range(40):
        h = q.bvh.ray_cast(o, n, 2 * reach)
        if h[0] is None:
            break
        hits.append((h[0] - pt).dot(n))
        o = h[0] + n * 1e-5
    return max(hits) - min(hits) if len(hits) >= 2 else 0.0


def row(q, n, axis, other, lo, hi, k):
    """Thickness along `axis` (index k in the frame) through the middle of the other."""
    reach = (hi[0] - lo[0]) + 0.05
    mid = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2))
    base = n * mid[0]
    base += (axis * mid[k]) + (other * mid[3 - k])
    half = (hi[k] - lo[k]) / 2
    us = np.linspace(-0.98, 0.98, a.samples)
    t = [thick(q, n, base + axis * (u * half), reach) for u in us]
    # The rim: from each end inward in 2 mm steps, the first point inside the
    # silhouette, then the first at least 1 cm thick.
    rims = []
    for s in (-1, 1):
        edge = None
        d = 0.0
        while d < half:
            th = thick(q, n, base + axis * (s * (half + 0.01 - d)), reach)
            if edge is None and th > 0:
                edge = d
            if th >= 0.01:
                break
            d += 0.002
        rims.append(d - (edge if edge is not None else d))
    T = np.array(t)
    tmax = T.max()
    hv = [T[int(np.argmin(np.abs(us - x)))] for x in (-0.5, 0.5)]
    i0 = int(np.argmax(T))
    dent = 0.0
    for step in (-1, 1):
        low, j = T[i0], i0 + step
        while 0 <= j < len(T):
            dent = max(dent, T[j] - low)
            low, j = min(low, T[j]), j + step
    return T, tmax, (sum(hv) / 2) / tmax if tmax > 0 else 0.0, max(rims), dent, 2 * half


sel = [q for q in m.select(a) if max(q.size) >= a.min_size and len(q.faces) >= 4]
done, bad, sheets, skipped, looked = [], [], [], 0, 0
for q in sel:
    if len(done) >= a.max:
        break
    looked += 1
    n, b, l, lo, hi = frame(q)
    ext = hi - lo
    if ext[0] > 0.6 * ext[1]:
        skipped += 1
        continue
    print(f"  {q.label()}")
    notes, rows = [], []
    for name, axis, other, k in (("across", l, b, 2), ("up", b, l, 1)):
        rows.append((name,) + row(q, n, axis, other, lo, hi, k))
    if all(r[2] == 0 for r in rows):
        print("    -> a single sheet (open, no thickness to measure)")
        sheets.append(q)
        continue
    for name, T, tmax, half, rim, dent, span in rows:
        print(f"    {name:6s} {span * 100:5.1f} cm: " + " ".join(f"{x * 100:4.1f}" for x in T))
        print(f"           max {tmax * 100:.1f} cm  half {half:.2f}  rim {rim * 100:.1f} cm  dent {dent * 100:.1f} cm")
        if half > 0.94:
            notes.append(f"{name}: flat slab (half {half:.2f})")
        if rim > 0.02:
            notes.append(f"{name}: thin rim {rim * 100:.1f} cm")
        if dent > 0.015:
            notes.append(f"{name}: dent {dent * 100:.1f} cm")
    shape = "lens" if max(r[3] for r in rows) <= 0.85 else "crowned box"
    print("    -> " + ("; ".join(notes) if notes else f"{shape}: thins steadily to the seam"))
    done.append(q)
    if notes:
        bad.append(q)

more = len(sel) - looked
tail = (f"; {skipped} not plates" if skipped else "") + (f", {len(sheets)} single sheets" if sheets else "")
tail += f"; {more} more not profiled (narrow with --mat/--part/--box or raise --max)" if more > 0 else ""
if not done:
    G.verdict("WARN", f"no plate-like part to profile{tail}")
elif bad:
    G.verdict("WARN", f"{len(bad)} of {len(done)} parts flat, rimmed or dented: " + " ".join(f"#{q.index}" for q in bad) + tail)
else:
    G.verdict("OK", f"{len(done)} part(s) thin steadily to the seam{tail}")

# Share of split normals per part: how many vertex positions carry more than
# one normal in the GLB (a hard edge runs through them). Cloth must be smooth
# everywhere; a soft part with hard edges on a grid renders as a patchwork of
# flat rectangles (the round-1 bed pillows: 25-48 % split).
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/facets.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--angle 3]
#
# How: the imported mesh's corner normals (the GLB's own normals), grouped by
# vertex position (to 0.01 mm); a position is split when two of its normals
# differ by more than --angle degrees (default 3). Prints positions, split
# positions and the share per part.
#
# Good: 0.0 % on every pillow, cushion, duvet and throw (Ladonia's beds and
# sofas). Hard-surface parts (boxes, panels, legs) are split at every corner
# by design, often 100 %. Verdict: OK when every selected part is under 1 %;
# otherwise FAIL if you selected parts (--mat, --part or --box: you are
# saying they should be smooth), WARN if you didn't (the faceted parts may
# be joinery). Coordinates and part numbering: _glb.py.
import math
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402
from mathutils import Vector  # noqa: E402

p = G.parser("Share of split normals per part.")
p.add_argument("--angle", type=float, default=3.0, help="normals further apart than this split (degrees)")
a = G.parse(p)
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("FACETS")
limit = math.radians(a.angle)
objs = {o.name: o for o in m.objects}
sel = m.select(a)
filtered = bool(a.mat or a.part or a.box)

rows = []
for q in sel:
    me = objs[q.obj].data
    cn = me.corner_normals
    pos = {}
    for pi in q.face_src:
        poly = me.polygons[pi]
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            pos.setdefault((round(co.x, 5), round(co.y, 5), round(co.z, 5)), []).append(Vector(cn[li].vector))
    split = sum(1 for ns in pos.values() if any(ns[0].angle(n, 0) > limit for n in ns[1:]))
    share = 100 * split / max(1, len(pos))
    rows.append((q, len(pos), split, share))
    print(f"  {q.label():70s} positions {len(pos):6d}  split {split:6d}  {share:5.1f} %")

faceted = [r for r in rows if r[3] >= 1.0]
smooth = len(rows) - len(faceted)
if not faceted:
    G.verdict("OK", f"{smooth} parts smooth (under 1 % split)")
else:
    worst = ", ".join(f"#{r[0].index} {r[0].mat} {r[3]:.0f} %" for r in sorted(faceted, key=lambda r: -r[3])[:6])
    G.verdict("FAIL" if filtered else "WARN",
              f"{len(faceted)} of {len(rows)} parts faceted: {worst}"
              + ("" if filtered else " (filter soft materials with --mat; joinery is faceted by design)"))

# Which way each upright soft part leans: pillows, cushions, a chair's back
# cushion. A pillow stands on its bottom edge and leans *back*; one whose top
# points forward is the "pillows falling forward" error.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/lean.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--back -y|+y|-x|+x|auto] [--all]
#
# How: each part's area-weighted principal axes; the smallest is the part's
# thickness (its normal n). A part is a plate when its thickness is under 0.6
# of its middle side and its longest side at least --min-size (12 cm); it
# stands upright when its plane is within 55 degrees of vertical (lying
# parts — seats, a mattress, a duvet — are only counted). Tilt =
# asin(|n.z|), the plane's angle from vertical; the top points along
# -n.z * (n.x, n.y), the plane's uphill direction read horizontally (the
# same whichever way n points).
#
# The back is Blender -Y by default, which is glTF +Z: the back of a piece
# modelled with its front to Blender +Y (glTF -Z), as every loose.py and
# ladonia.py piece is (SKILL.md §4, "Facing"). So "leans back" = top toward -Y in
# Blender = toward +Z in glTF. Use --back +y for joinery modelled facing
# the other way (joinery.py's SOUTHWARD pieces), and -x/+x for the cushions
# of an L's return (select them with --box), or --back auto.
# --back auto reads each part's own facing: a part facing along Y is judged
# against -Y, one facing along X against whichever of -X and +X is the
# nearer side of the piece's bounds (an L's return, the cushions on it).
#
# Good: every soft part "back", tilted a few degrees to ~35 (Ladonia: bed
# pillows 24-30, sofa throw pillows 23, sofa back cushions 12-13, the lounge
# chair's back cushion 17; that cushion read 23 degrees *forward* before the
# 2026-10-04 fix). "forward" on any part fails; "side" warns (an L's return
# read with the wrong --back); "upright" (under 2 degrees) is neither, and
# is listed with --all (a kitchen's doors and panels are all upright).
import math
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402
from mathutils import Vector  # noqa: E402

p = G.parser("Which way each upright soft part leans.")
p.add_argument("--back", default="-y", choices=["-y", "+y", "-x", "+x", "auto"],
               help="the piece's back, in Blender axes (default -y: glTF +Z)")
p.add_argument("--all", action="store_true", help="also list upright parts")
p.add_argument("--min-size", type=float, default=0.12, help="ignore parts shorter than this (m)")
a = G.parse(p, signed=("--back",))
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("LEAN")
print(f"  back = {a.back} (Blender axes; -y is glTF +Z)")

AX = {"-y": Vector((0, -1, 0)), "+y": Vector((0, 1, 0)), "-x": Vector((-1, 0, 0)), "+x": Vector((1, 0, 0))}


def back_of(q, n):
    if a.back != "auto":
        return a.back
    if abs(n.y) >= abs(n.x):
        return "-y"
    return "-x" if q.c.x - m.lo.x < m.hi.x - q.c.x else "+x"


rows, lying, small = [], 0, 0
for q in m.select(a):
    if max(q.size) < a.min_size or len(q.faces) < 4:
        small += 1
        continue
    r = G.surface_axes(q.tris)
    if r is None:
        continue
    _, _, V = r
    lo, hi = G.extents(q.verts, V)
    ext = hi - lo                        # thin, middle, long
    if ext[0] > 0.6 * ext[1]:
        small += 1                       # not a plate: no meaningful plane
        continue
    n = Vector(V[:, 0])
    tilt = math.degrees(math.asin(min(1.0, abs(n.z))))
    if tilt > 55:
        lying += 1
        continue
    top = Vector((-n.z * n.x, -n.z * n.y, 0))
    side = back_of(q, n)
    if tilt < 2 or top.length < 1e-9:
        rows.append((q, tilt, None, side, "upright", ext))
        continue
    top.normalize()
    ang = math.degrees(top.angle(AX[side]))
    kind = "back" if ang < 60 else "side" if ang <= 120 else "forward"
    rows.append((q, tilt, top, side, kind, ext))

for q, tilt, top, side, kind, ext in rows:
    if kind == "upright" and not a.all:
        continue
    t = f"top->({top.x:+.2f},{top.y:+.2f})" if top else "top->(  vertical )"
    print(f"  {q.label():70s} tilt {tilt:5.1f} deg {t} {kind}{'' if a.back != 'auto' else ' (back ' + side + ')'}"
          f"  plate {ext[2] * 100:.0f}x{ext[1] * 100:.0f}x{ext[0] * 100:.0f}")

count = {k: [r for r in rows if r[4] == k] for k in ("back", "side", "forward", "upright")}
span = (f" ({min(r[1] for r in count['back']):.1f}-{max(r[1] for r in count['back']):.1f} deg)"
        if count["back"] else "")
summary = (f"{len(count['back'])} lean back{span}, {len(count['side'])} sideways, "
           f"{len(count['forward'])} forward, {len(count['upright'])} upright; "
           f"{lying} lying, {small} small or not plates")
if count["forward"]:
    G.verdict("FAIL", summary + " — forward: " + " ".join(f"#{r[0].index}" for r in count["forward"]))
elif count["side"]:
    G.verdict("WARN", summary + " — sideways: " + " ".join(f"#{r[0].index}" for r in count["side"]))
else:
    G.verdict("OK", summary)

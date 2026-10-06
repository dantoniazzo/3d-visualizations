# What each part touches, passes into or floats beside: stacked pillows must
# touch the one behind and never pass through it (the round-1 bed pillows sat
# 5-10 cm inside one another), a cushion rests on its seat, nothing hangs in
# the air.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/contacts.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--max-depth 0.01] [--touch 0.003]
#
# How: for each selected part A and every other part B whose bounds come
# within 3 cm of A's: `gap` = the smallest distance from A's vertices to B's
# surface; `in` = A's vertices inside B (ray parity along two skewed rays;
# only when B is closed — an open B gets a gap only); `depth` = the deepest
# of those, measured to B's surface. A part touches B when either has
# vertices inside the other or the gap either way is under --touch (default
# 3 mm); a selected part that touches nothing, and doesn't stand on the
# piece's lowest level, floats.
#
# Select the soft parts that rest on each other (--mat 'pillow_*,linen_sand'):
# every pair *within* the selection must be no deeper than --max-depth
# (default 1 cm), or the verdict is FAIL; how deep each one sinks into the
# rest (a seat, a mattress) is listed, not judged — pillows resting 3-4 cm
# into a sofa's seat cushion read as resting on it. A selected part that
# floats is a WARN. Without a filter it is an overview: the pairs deeper
# than --max-depth and the floating parts, as a WARN, never a FAIL (frames,
# carcasses and joinery overlap by design; a part ending inside an open
# tube reads as a gap of the tube's radius).
#
# Good: pairs within the selection a few mm deep at most (Ladonia's bed
# pillows 0-1 mm, its sofa pillows 5-6 mm where they lean on each other;
# the round-1 bed pillows 70-100 mm), each pillow touching the one behind
# it (gap 0-3 mm), nothing floating. Coordinates and part numbering: _glb.py.
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402

p = G.parser("What each part touches, passes into or floats beside.")
p.add_argument("--max-depth", type=float, default=0.01, help="deepest allowed penetration (m, default 0.01)")
p.add_argument("--touch", type=float, default=0.003, help="a gap up to this counts as touching (m, default 0.003)")
a = G.parse(p)
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("CONTACTS")
filtered = bool(a.mat or a.part or a.box)
MARGIN = 0.03


def near(A, B):
    return all(A.lo[k] <= B.hi[k] + MARGIN and B.lo[k] <= A.hi[k] + MARGIN for k in range(3))


def contact(A, B):
    """(gap, vertices of A inside B, deepest of them)."""
    gap, n_in, depth = 9.0, 0, 0.0
    for v in A.verts:
        hit = B.bvh.find_nearest(v)
        if hit[0] is None:
            continue
        d = hit[3]
        if B.closed and all(B.lo[k] - 1e-6 <= v[k] <= B.hi[k] + 1e-6 for k in range(3)) and G.inside(B.bvh, v):
            n_in += 1
            depth = max(depth, d)
        else:
            gap = min(gap, d)
    return (0.0 if n_in else gap), n_in, depth


sel = m.select(a)
chosen = {q.index for q in sel}
deep, floating, pairs, inner = [], [], 0, 0.0
for A in sel:
    rows, touching = [], False
    for B in m.parts:
        if B is A or not near(A, B):
            continue
        gap, n_in, depth = contact(A, B)
        pairs += 1
        rows.append((B, gap, n_in, depth))
        within = filtered and B.index in chosen
        if within:
            inner = max(inner, depth)
        if depth > a.max_depth and (within or not filtered):
            deep.append((A, B, n_in, depth))
        if not touching:
            if n_in or gap <= a.touch:
                touching = True
            else:
                g2, n2, _ = contact(B, A)
                touching = bool(n2) or g2 <= a.touch
    nearest = min((r[1] for r in rows), default=9.0)
    floats = not touching and A.lo.z > m.lo.z + 0.002
    if floats:
        floating.append(A)
    show = rows if filtered else [r for r in rows if r[3] > a.max_depth]
    if filtered or show or floats:
        print(f"  {A.label()}  {'closed' if A.closed else 'open'}"
              + ("  FLOATS: " + (f"nearest {nearest * 1000:.0f} mm" if nearest < 9 else "nothing within 3 cm") if floats else ""))
        for B, gap, n_in, depth in sorted(show, key=lambda r: (-r[3], r[1])):
            tag = "  (selected)" if filtered and B.index in chosen else ""
            mark = "  <- too deep" if depth > a.max_depth and (tag or not filtered) else ""
            print(f"      {B.label():70s} gap {gap * 1000:5.1f} mm  in {n_in:4d}/{len(A.verts):<5d} depth {depth * 1000:5.1f} mm"
                  f"{'' if B.closed else '  (open: gap only)'}{tag}{mark}")

worst = max(deep, key=lambda r: r[3]) if deep else None
fl = (f"{len(floating)} {'part floats' if len(floating) == 1 else 'parts float'}: "
      + " ".join(f"#{A.index} {A.mat}" for A in floating[:8]) + (" …" if len(floating) > 8 else "")) if floating else ""
if filtered:
    if deep:
        G.verdict("FAIL", f"{len(deep)} pair(s) within the selection deeper than {a.max_depth * 1000:.0f} mm; deepest "
                  f"#{worst[0].index} {worst[0].mat} into #{worst[1].index} {worst[1].mat} {worst[3] * 1000:.0f} mm"
                  + (f"; {fl}" if fl else ""))
    elif floating:
        G.verdict("WARN", fl)
    else:
        G.verdict("OK", f"{len(sel)} parts; deepest pair within the selection {inner * 1000:.0f} mm "
                  f"(allowed {a.max_depth * 1000:.0f}); nothing floating")
else:
    if deep or floating:
        G.verdict("WARN", (f"{len(deep)} pair(s) deeper than {a.max_depth * 1000:.0f} mm (deepest #{worst[0].index} "
                           f"{worst[0].mat} into #{worst[1].index} {worst[1].mat} {worst[3] * 1000:.0f} mm)" if deep else "")
                  + ("; " if deep and fl else "") + fl
                  + " — overview only: select the soft parts with --mat to judge them")
    else:
        G.verdict("OK", f"{pairs} neighbour pairs, none deeper than {a.max_depth * 1000:.0f} mm, nothing floating")

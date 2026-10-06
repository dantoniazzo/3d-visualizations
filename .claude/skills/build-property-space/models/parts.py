# Lists a GLB's parts: number, materials (dominant first), closed or open,
# vertex count, centre and size. Run it first to find the part numbers and
# materials the other scripts' filters take.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/parts.py -- <glb|id> [--glb-dir DIR] [--mat a,b*] [--part 3,7] \
#     [--box x0,x1,y0,y1,z0,z1] [--min-size 0.05]
#
# --min-size hides parts whose largest side is under that many metres
# (screws, hinge pins), default 0: list everything. Coordinates and part
# numbering: _glb.py. Pillows and cushions should be closed (a duvet or a
# throw may be one open sheet); an open pillow has a hole or a missing cap,
# and contacts.py can't tell what passes into it.
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402

p = G.parser("List a GLB's parts.")
p.add_argument("--min-size", type=float, default=0.0, help="hide parts whose largest side is under this (m)")
a = G.parse(p)
m = G.Model(G.resolve(a.glb, a.glb_dir))
m.header("PARTS")
sel = [q for q in m.select(a) if max(q.size) >= a.min_size]
for q in sel:
    print(f"  {q.label()}  {'closed' if q.closed else 'open  '} v={len(q.verts)}")
mats = sorted({x for q in sel for x in q.mats})
opened = [q.index for q in sel if not q.closed]
print(f"  materials: {', '.join(mats)}")
G.verdict("OK", f"{len(sel)} parts listed ({len(opened)} open)")

"""Find furniture that is in a wall, in mid-air, or in a doorway — and walls
that do not meet each other."""
import os, sys, math, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
from lib import architecture as arch, furnish, geometry as g, materials as m, plan as P, shell

for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
             bpy.data.lights, bpy.data.cameras, bpy.data.collections):
    for item in list(coll):
        coll.remove(item, do_unlink=True)

mats = m.library()
cols, _ = shell.build(mats)
furnish.build(cols, mats)

SHELL_PREFIX = ("wall", "panel", "slab", "fl_", "ce_", "roof", "gable", "flight",
                "balustrade", "landing_rail", "lawn", "road", "drive", "path",
                "patio", "door", "glazing", "rl_", "cornice", "stairtreads")

def is_furniture(o):
    return (o.type == "MESH" and not o.name.startswith(SHELL_PREFIX)
            and not o.hide_render and o.data.vertices)

items = []
for o in bpy.data.objects:
    if is_furniture(o):
        lo, hi = g.bounds(o)
        items.append((o.name, lo, hi))

# --- storey floor levels, to test "is it resting on something" -----------
LEVELS = [P.G, P.F1, P.F2]

print("=== FLOATING (base more than 12 cm above its storey floor) ===")
WALL_MOUNTED = ("mirror", "picture", "frame", "art", "hood", "flue", "extractor",
                "wall", "rail", "shower", "cistern", "vanity", "wr", "mw",
                "cornice", "tap", "oven", "micro")
floating = 0
for name, lo, hi in items:
    lvl = min(LEVELS, key=lambda L: abs(lo.z - L))
    gap = lo.z - lvl
    supported = any(
        other != name
        and olo.x < hi.x and ohi.x > lo.x
        and olo.y < hi.y and ohi.y > lo.y
        and abs(ohi.z - lo.z) < 0.10
        for other, olo, ohi in items
    )
    if gap > 0.12 and not supported and not any(k in name.lower() for k in WALL_MOUNTED):
        print(f"  {name:28s} base z={lo.z:6.2f}  storey={lvl:5.2f}  gap={gap:5.2f}")
        floating += 1
print("FLOATING_COUNT", floating)

# --- penetration into wall slabs ---------------------------------------
walls = []
for o in bpy.data.objects:
    if o.type == "MESH" and o.name.startswith(("wall",)) and o.data.vertices:
        lo, hi = g.bounds(o)
        walls.append((o.name, lo, hi))

def overlap(a_lo, a_hi, b_lo, b_hi, pad=0.0):
    return all(a_lo[i] < b_hi[i] - pad and a_hi[i] > b_lo[i] + pad for i in range(3))

print("=== IN A WALL (furniture bbox overlapping a wall slab by >4 cm) ===")
pen = 0
for name, lo, hi in items:
    for wname, wlo, whi in walls:
        if overlap(lo, hi, wlo, whi, pad=0.09):
            ox = min(hi.x, whi.x) - max(lo.x, wlo.x)
            oy = min(hi.y, whi.y) - max(lo.y, wlo.y)
            print(f"  {name:28s} into {wname:12s} overlap {min(ox,oy):.2f} m")
            pen += 1
            break
print("PENETRATION_COUNT", pen)

# --- wall endpoint connectivity ----------------------------------------
print("=== WALL ENDS THAT MEET NOTHING ===")
ends = []
for w in getattr(shell, "_WALL_LINES", []):
    ends.append(w)
print("  (wall lines are not recorded; see shell.py)")

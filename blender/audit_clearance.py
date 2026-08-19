"""Report furniture standing in a doorway or on a stair.

Run after a full build. Doors need a clear box either side to be usable, and
the flights need their footprints kept clear.
"""
import os, sys, math
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

SHELL = ("wall", "panel", "slab", "fl_", "ce_", "roof", "gable", "flight",
         "balustrade", "landing_rail", "lawn", "road", "drive", "path",
         "patio", "door", "glazing", "rl_", "stairs", "cornice")

def is_furniture(o):
    return o.type == "MESH" and not o.name.startswith(SHELL) and not o.hide_render

items = []
for o in bpy.data.objects:
    if not is_furniture(o):
        continue
    lo, hi = g.bounds(o)
    items.append((o.name, lo, hi))

def overlaps(lo, hi, c, half, zlo, zhi):
    return (lo.x < c.x + half.x and hi.x > c.x - half.x and
            lo.y < c.y + half.y and hi.y > c.y - half.y and
            lo.z < zhi and hi.z > zlo)

print("=== doorway obstructions ===")
hits = 0
for i, d in enumerate(arch.DOOR_REGISTRY):
    th = math.radians(d["yaw"])
    n = Vector((math.sin(th + math.pi / 2), -math.cos(th + math.pi / 2), 0))
    n = Vector((-math.sin(th), math.cos(th), 0))   # wall normal in plan
    for side in (1, -1):
        c = Vector((d["x"] + n.x * side * 0.75, d["y"] + n.y * side * 0.75, 0))
        half = Vector((d["width"] / 2 + 0.15, d["width"] / 2 + 0.15, 0))
        for name, lo, hi in items:
            if overlaps(lo, hi, c, half, d["base"] + 0.05, d["base"] + 1.9):
                print(f"  wd-{i} ({d['x']:.2f},{d['y']:.2f}) z={d['base']:.2f} "
                      f"{'front' if side>0 else 'back':5s} <- {name}")
                hits += 1
print("TOTAL_DOOR_HITS", hits)

print("=== stair footprint obstructions ===")
sh = 0
for key, s in (("A", P.STAIR_A), ("B", P.STAIR_B)):
    for name, lo, hi in items:
        if (lo.x < s["x1"] and hi.x > s["x0"] and lo.y < s["y1"] and hi.y > s["y0"]
                and hi.z > s["base"] and lo.z < s["top"] + 2.0):
            print(f"  flight {key} <- {name}")
            sh += 1
print("TOTAL_STAIR_HITS", sh)

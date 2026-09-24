"""Export the kit of parts the app dresses its generated buildings with.

The app builds walls, openings and flights from the scene spec and stretches
these parts over them: door leaves, handles, hinges and stops, skirting and
architraves, window frames, glazing bars and cills, stair treads, newels,
balusters and rails. See lib/kit.py for how each one is made and how it may
be stretched.

    blender --background --python export_kit.py

Writes public/models/kit.glb: one node per part, each at the origin, with
its stretch zones and anything else the app needs to know about it in the
node's extras, where three.js puts them in `userData.kit`.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy

from lib import geometry as g, kit

OUT = os.path.join(REPO, "public", "models", "kit.glb")


def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras, bpy.data.collections,
                 bpy.data.images):
        for item in list(coll):
            coll.remove(item, do_unlink=True)


def app_zones(zones, lo, hi):
    """A part's stretch zones on the app's axes, measured from the low
    corner of its bounds. Blender Z is the app's Y; Blender -Y is its Z, so
    a zone along Blender Y comes out reversed."""
    out = {}
    if "x" in zones:
        out["x"] = [[round(a - lo.x, 5), round(b - lo.x, 5)] for a, b in zones["x"]]
    if "z" in zones:
        out["y"] = [[round(a - lo.z, 5), round(b - lo.z, 5)] for a, b in zones["z"]]
    if "y" in zones:
        out["z"] = [[round(hi.y - b, 5), round(hi.y - a, 5)] for a, b in zones["y"]]
    return out


def build(col):
    """Every part, named and tagged. Returns the objects."""
    out = []
    for name, make in kit.PARTS.items():
        obj, zones, meta = make(col)
        obj.name = name
        obj.data.name = name
        lo, hi = g.bounds(obj)
        obj["kit"] = json.dumps({"stretch": app_zones(zones, lo, hi), **meta})
        size = hi - lo
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        print(f"  {name:16s} {size.x:6.3f} x {size.z:6.3f} x {size.y:6.3f} m  {tris:5d} tris")
        out.append(obj)
    return out


def main():
    fresh()
    col = g.collection("kit")
    build(col)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_visible=True,
        export_apply=True,
        export_extras=True,
        # The app gives every part the material of whatever it dresses — a
        # door's leaf finish, a flight's tread finish — so none are needed.
        export_materials="NONE",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    print(f"  {os.path.getsize(OUT) / 1024:6.0f} KB  {os.path.relpath(OUT, REPO)}")


if __name__ == "__main__":
    main()

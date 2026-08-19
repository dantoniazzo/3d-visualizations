"""Build Wrenfield House. Run with:

    blender --background --python build_house.py -- [--shell-only] [--render]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy

from lib import geometry as g, materials as m, render as r, shell, furnish

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def clean():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras, bpy.data.collections):
        for item in list(coll):
            coll.remove(item, do_unlink=True)


def main():
    clean()
    mats = m.library()
    r.setup(samples=32)
    r.world(0.9)

    cols, extra = shell.build(mats)
    if "--shell-only" not in ARGS:
        furnish.build(cols, mats)
    r.sun(3.2, col=cols["lights"])

    n_obj = len(bpy.data.objects)
    n_tri = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"BUILD objects={n_obj} faces={n_tri}")

    out = os.path.join(HERE, "out", "wrenfield_house.blend")

    # Pack the Poly Haven textures into the file. They live in blender/cache,
    # which is a build artefact rather than something to ship alongside the
    # .blend, so the deliverable has to carry them.
    missing = [i.name for i in bpy.data.images
               if i.source == "FILE" and not os.path.exists(bpy.path.abspath(i.filepath))]
    if missing:
        print("UNRESOLVED", len(missing), missing[:5])
    for img in bpy.data.images:
        if img.source != "FILE" or img.packed_file:
            continue
        try:
            img.pack()
        except RuntimeError as exc:
            print("PACK_SKIP", img.name, exc)
    print("PACKED", sum(1 for i in bpy.data.images if i.packed_file))

    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("SAVED", out)

    if "--render" in ARGS:
        shots = [
            ("ext_front", (-13, -19, 9), (8, 5, 4)),
            ("ext_rear", (26, 24, 11), (8, 5, 4)),
        ]
        for name, loc, look in shots:
            cam = r.camera(f"cam_{name}", loc, look, lens=32, col=cols["lights"])
            r.shot(os.path.join(HERE, "out", f"{name}.png"), cam,
                   samples=32, resolution=(1200, 750))
            print("SHOT", name)


main()

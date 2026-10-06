"""Export the props people hold or use as one GLB, public/models/people/props.glb.

Each prop in lib/props.py is built at real size and becomes one node of the
GLB named `prop:<id>`, at the origin, its grip point there (lib/props.py
says where that is for each). Its extras carry what World/People.js needs
without opening the people index: `{"prop": {"id", "grip", "size"}}`, the
grip "right", "left" or null for a prop that lies or is worn, the size
[x, y, z] in metres with y up, `at` the share of that height the grip is
up from its foot and `off` how far the grip is from the middle of its
footprint [x, z] (a cup's handle, a garnish). three's GLTFLoader names the node
`propwine-red` (it drops the colon) and keeps `prop:wine-red` in
`userData.name`.

    npm run props
    blender --background --python export_props.py [-- <out.glb>]

It prints each prop's triangles, size and liquid volume, and the list for
the people index's `props`.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import geometry as g, materials as m, props as P  # noqa: E402
from export_app import bake_tiling_textures  # noqa: E402

OUT = os.path.join(REPO, "public", "models", "people", "props.glb")

#: A prop's triangle budget: a dozen people each holding one cost little.
BUDGET = 1500

#: The liquids, whose volume is printed as a check on the pour.
LIQUIDS = ("prop_wine_red", "prop_wine_white", "prop_champagne", "prop_negroni")


def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras, bpy.data.collections,
                 bpy.data.images):
        for item in list(coll):
            coll.remove(item, do_unlink=True)
    # materials.py memoises by name; those handles now point at datablocks
    # that no longer exist.
    m._cache.clear()


def measure(obj):
    """Triangles, and the volume each material encloses in millilitres
    (positive when its faces point out, as every closed part's should)."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    volume = {}
    for tri in mesh.loop_triangles:
        a, b, c = (mesh.vertices[i].co for i in tri.vertices)
        name = mesh.materials[tri.material_index].name
        volume[name] = volume.get(name, 0.0) + a.dot(b.cross(c)) / 6
    return len(mesh.loop_triangles), {k: round(v * 1e6, 1) for k, v in volume.items()}


def main():
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else OUT
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fresh()
    mats = P.finishes(m.library())
    listed, over = [], []
    for prop_id, label, grip, build in P.PROPS:
        name = f"prop:{prop_id}"
        col = g.collection(name)
        parts, at = build(col, mats)
        obj = g.join(parts, name, col)
        # Its grip point to the origin.
        shift = Vector(at)
        for v in obj.data.vertices:
            v.co -= shift
        obj.data.update()
        lo, hi = g.bounds(obj)
        size = [round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3)]
        # The share of its height the grip is up, as World/People.js's GRIPS
        # give it, and how far the grip is off its middle in plan (x, z).
        at_share = round(-lo.z / (hi.z - lo.z), 3) + 0.0
        off = [round(-(lo.x + hi.x) / 2, 3) + 0.0, round((lo.y + hi.y) / 2, 3) + 0.0]
        obj["prop"] = {"id": prop_id, "grip": grip, "size": size, "at": at_share, "off": off}
        tris, volume = measure(obj)
        if tris > BUDGET:
            over.append(prop_id)
        liquid = {k: v for k, v in volume.items() if k in LIQUIDS}
        print(f"  {prop_id:11s} {tris:5d} tris  {size}  at {at_share} off {off}  {label}" +
              (f"  {liquid} ml" if liquid else ""))
        closed = {k: v for k, v in volume.items() if k in ("prop_glass", "porcelain", "prop_bottle_brown", "prop_terry_white")}
        if any(v <= 0 for v in closed.values()):
            print(f"    INSIDE OUT? {closed}")
        listed.append({"id": prop_id, "node": name, "grip": grip})

    # Only what the props use is baked (the towel's terry) and exported.
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    bake_tiling_textures()

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_visible=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_yup=True,
        export_vertex_color="NONE",
        export_all_vertex_colors=False,
        export_image_format="WEBP",
        export_image_quality=60,
    )
    print(f"PROPS {len(listed)} -> {out} ({os.path.getsize(out) / 1024:.0f} KB)")
    if over:
        print(f"OVER {BUDGET} TRIANGLES: {', '.join(over)}")
    print("INDEX " + json.dumps({"file": "people/props.glb", "list": listed}))


main()

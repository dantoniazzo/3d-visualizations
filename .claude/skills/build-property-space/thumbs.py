# Render catalogue GLBs to PNGs for a look before placing them:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python thumbs.py -- <out-dir> <piece-id> ...
#   (Blender isn't on PATH on this Mac; ids as separate arguments)
# Front-left from above, on a grey floor.
import bpy, sys, os, math, json
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
out = args[0]; ids = args[1:]
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
cat = {i["id"]: i for i in json.load(open(f"{REPO}/public/models/furniture/catalog.json"))["items"]}
scn = bpy.context.scene
scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
scn.render.resolution_x = scn.render.resolution_y = 360
scn.render.film_transparent = False
scn.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in scn.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
world = bpy.data.worlds.new("w"); scn.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.62, 0.65, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
for pid in ids:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=f"{REPO}/public{cat[pid]['url']}")
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    lo = Vector((1e9,)*3); hi = Vector((-1e9,)*3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    ctr = (lo + hi) / 2; size = (hi - lo).length
    sun = bpy.data.lights.new("s", "SUN"); sun.energy = 3.5
    so = bpy.data.objects.new("s", sun); bpy.context.collection.objects.link(so); so.rotation_euler = (0.7, 0.2, 0.9)
    cam = bpy.data.cameras.new("c"); cam.lens = 50
    co = bpy.data.objects.new("c", cam); bpy.context.collection.objects.link(co)
    # Front is Blender +Y after the glTF import (app north = glTF -Z = Blender +Y)... view from the front-left, above.
    d = Vector((-0.55, 1.0, 0.55)).normalized()
    co.location = ctr + d * size * 1.7
    co.rotation_euler = (ctr - co.location).to_track_quat("-Z", "Y").to_euler()
    scn.camera = co
    plane = bpy.data.meshes.new("p"); 
    import bmesh; bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size*2); bm.to_mesh(plane); bm.free()
    po = bpy.data.objects.new("p", plane); po.location = (ctr.x, ctr.y, lo.z - 0.001); bpy.context.collection.objects.link(po)
    scn.render.filepath = os.path.join(out, pid + ".png")
    bpy.ops.render.render(write_still=True)
print("DONE")

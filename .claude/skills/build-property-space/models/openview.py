# openview.py: catalogue GLBs rendered with their opening parts posed — to check each part's hand, its swing and what is
# inside — and the same cameras shut, for a before/after comparison with imgdiff.py (app-notes.md, Furniture: opening
# parts; models/README.md).
#   <blender> --background --python <skill>/models/openview.py -- <out-dir> [--open 1.0] [--views front,left,right,top,low,back]
#            [--size 900] [--tag open] [--only part,…] [--flat 1] [--cam x,y,z --look x,y,z] <glb> ...
# Writes <out-dir>/<id>-<view>-<tag>.png (tag "open", or "shut" with --open 0). --open is the share of each part's
# swing or slide (from its extras.opens: angle and axis, or direction and distance); --only opens just the parts whose
# names hold one of the strings. --flat 1 replaces every base-colour texture by its mean colour, so two exports whose
# atlases were shuffled compare by shape alone. --cam/--look a camera of its own (Blender axes, after the import: x, y =
# the app's −z, z up; the piece's front is +Y). FIX=1 draws the water, control and steam anchors (a fixture's extras) as
# boxes: blue the fall and where it lands, red the control, cyan the steam's box, green its screens.
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
out = args.pop(0)


def opt(name, default):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


frac = float(opt("--open", "1.0"))
views = opt("--views", "front,left,right,top").split(",")
size = int(opt("--size", "900"))
tag = opt("--tag", "open" if frac > 0 else "shut")
only = opt("--only", "")          # comma list of part-name substrings to open (others shut)
flat = opt("--flat", "0") == "1"
cam_at = opt("--cam", "")         # x,y,z (Blender axes, after import): a camera of its own, with --look
look_at = opt("--look", "")  # textures replaced by their mean colour (re-exports reshuffle them)
os.makedirs(out, exist_ok=True)

scn = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scn.render.resolution_x = size
scn.render.resolution_y = int(size * 0.7)
scn.view_settings.view_transform = "AgX" if "AgX" in [v.identifier for v in scn.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"


def app_to_blender(v):
    return Vector((v[0], -v[2], v[1]))


for path in args:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for w in list(bpy.data.worlds):
        bpy.data.worlds.remove(w)
    world = bpy.data.worlds.new("w")
    scn.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.64, 0.67, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    bpy.ops.import_scene.gltf(filepath=path)
    pid = os.path.splitext(os.path.basename(path))[0]
    if flat:
        import numpy as np
        for mat in bpy.data.materials:
            if not mat.use_nodes:
                continue
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED" and node.inputs["Base Color"].is_linked:
                    src = node.inputs["Base Color"].links[0].from_node
                    if src.type == "TEX_IMAGE" and src.image:
                        px = np.array(src.image.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3].mean(axis=0)
                        mat.node_tree.links.remove(node.inputs["Base Color"].links[0])
                        node.inputs["Base Color"].default_value = (*px, 1.0)
    moved = 0
    for o in list(bpy.data.objects):
        opens = o.get("opens")
        if not opens:
            continue
        opens = opens.to_dict()
        if only and not any(s in o.name for s in only.split(",")):
            continue
        if opens["type"] == "slide":
            d = app_to_blender(opens["direction"])
            o.location = o.location + d * opens["distance"] * frac
        else:
            axis = app_to_blender(opens.get("axis", [0, 1, 0])).normalized()
            loc = o.location.copy()
            o.matrix_basis = Matrix.Translation(loc) @ Matrix.Rotation(opens["angle"] * frac, 4, axis) @ \
                Matrix.Translation(-loc) @ o.matrix_basis
        moved += 1

    if os.environ.get("FIX"):
        def mat(name, rgba, alpha=1.0):
            m = bpy.data.materials.new(name)
            m.use_nodes = True
            b = m.node_tree.nodes["Principled BSDF"]
            b.inputs["Base Color"].default_value = rgba
            b.inputs["Emission Color"].default_value = rgba
            b.inputs["Emission Strength"].default_value = 0.6
            b.inputs["Alpha"].default_value = alpha
            m.surface_render_method = "BLENDED" if alpha < 1 else "DITHERED"
            return m
        blue, red, cyan, pane = mat("fx_blue", (0.1, 0.3, 1, 1)), mat("fx_red", (1, 0.1, 0.1, 1), 0.35), mat("fx_cyan", (0.2, 0.9, 1, 1), 0.12), mat("fx_pane", (0.2, 1, 0.6, 1), 0.5)
        import bmesh as _bm
        def cube(name, centre, half, m):
            me = bpy.data.meshes.new(name)
            b = _bm.new(); _bm.ops.create_cube(b, size=2.0); _bm.ops.scale(b, vec=half, verts=b.verts); b.to_mesh(me); b.free()
            ob = bpy.data.objects.new(name, me); ob.location = centre; me.materials.append(m); bpy.context.collection.objects.link(ob)
            return ob
        for o in [o for o in bpy.data.objects if o.get("fixture")]:
            fx = o.get("fixture").to_dict()
            p = o.matrix_world.translation
            if "water" in fx:
                w = fx["water"]; r = w.get("r", (w.get("size") or [0.02])[0] / 2)
                cube("fx_fall", p - Vector((0, 0, w["fall"] / 2)), Vector((max(r, 0.004), max(r, 0.004), w["fall"] / 2)), blue)
                cube("fx_land", p - Vector((0, 0, w["fall"] - 0.002)), Vector((w["land"][0] / 2, w["land"][1] / 2, 0.002)), blue)
            if "control" in fx:
                h = fx["control"]["half"]
                cube("fx_control", p, Vector((h[0], h[2], h[1])), red)
            if "steam" in fx:
                h = fx["steam"]["half"]
                cube("fx_steam", p, Vector((h[0], h[2], h[1])), cyan)
                for x0, x1, z0, z1 in fx["steam"].get("screens", []):
                    cube("fx_pane", p + Vector(((x0 + x1) / 2, -(z0 + z1) / 2, 0)), Vector(((x1 - x0) / 2 + 0.003, (z1 - z0) / 2 + 0.003, h[1])), pane)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    ctr = (lo + hi) / 2
    ext = (hi - lo).length
    sun = bpy.data.lights.new("s", "SUN")
    sun.energy = 3.2
    so = bpy.data.objects.new("s", sun)
    bpy.context.collection.objects.link(so)
    so.rotation_euler = (0.75, 0.15, 0.6)
    fill = bpy.data.lights.new("f", "AREA")
    fill.energy = 120
    fill.size = 3
    fo = bpy.data.objects.new("f", fill)
    bpy.context.collection.objects.link(fo)
    fo.location = ctr + Vector((0, 3.5, 1.2))
    fo.rotation_euler = (Vector((0, 0, 0)) - Vector((0, 3.5, 1.2))).to_track_quat("-Z", "Y").to_euler()
    plane = bpy.data.meshes.new("p")
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=ext * 2)
    bm.to_mesh(plane)
    bm.free()
    po = bpy.data.objects.new("p", plane)
    po.location = (ctr.x, ctr.y, lo.z - 0.001)
    bpy.context.collection.objects.link(po)
    cam = bpy.data.cameras.new("c")
    cam.lens = 35
    co = bpy.data.objects.new("c", cam)
    bpy.context.collection.objects.link(co)
    scn.camera = co
    dirs = {"front": (0.0, 1.0, 0.18), "left": (-0.75, 1.0, 0.3), "right": (0.75, 1.0, 0.3), "top": (0.0, 0.6, 1.0),
            "low": (0.0, 1.0, -0.05), "back": (0.4, -1.0, 0.5)}
    if cam_at:
        views = ["cam"]
    for v in views:
        if cam_at:
            co.location = Vector([float(c) for c in cam_at.split(",")])
            target = Vector([float(c) for c in look_at.split(",")])
            co.rotation_euler = (target - co.location).to_track_quat("-Z", "Y").to_euler()
        else:
            d = Vector(dirs[v]).normalized()
            co.location = ctr + d * ext * 1.05
            co.rotation_euler = (ctr - co.location).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = os.path.join(out, f"{pid}-{v}-{tag}.png")
        bpy.ops.render.render(write_still=True)
    print("RENDERED", pid, "parts moved", moved)

# Renders catalogue GLBs from four views each, to look at a piece closely
# before placing it (thumbs.py gives one small view; this is for review):
# front three-quarter, the side in orthographic projection (where a lean or
# a flat plane shows), top-front and back three-quarter by default.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python \
#     <skill>/models/views.py -- <out-dir> [--size 640] [--glb-dir DIR] \
#     [--views front,side,top,back] <id|path.glb> ...
#
# Writes <out-dir>/<id>/<view>.png (a path's file name, without .glb, is its
# id). GLBs come from --glb-dir (a Blender copy's glb/, see copy-merge.sh) or
# from the repo's catalogue (the repo is four folders above this one, or
# $REPO). Then `node <skill>/models/sheet.mjs <out-dir> <sheets-dir>` puts
# each piece's views on one sheet.
#
# Views (Blender axes after the import: a piece's front is +Y, up is +Z):
#   front  perspective from the front on the piece's -X side, above
#          (direction -0.45, 1, 0.32)
#   side   orthographic from +X: the front is on the RIGHT of the image, so a
#          pillow leaning back has its top displaced to the left
#   left   orthographic from -X (front on the left): an L's other end
#   top    perspective from above, a little in front
#   plan   orthographic straight down, front at the bottom
#   back   perspective from the back on the +X side, above (0.55, -1, 0.45)
# Each piece stands on a grey floor under a sun and a fill light (EEVEE,
# AgX), framed to its bounds. Colours read lighter here than in the app
# (SKILL.md §4): judge colour in an in-app frame. Four pieces at 480 px take
# about 4 s.
import argparse
import math
import os
import sys

sys.dont_write_bytecode = True          # no __pycache__ in the skill folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _glb as G  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

VIEWS = {
    "front": (Vector((-0.45, 1.0, 0.32)), "persp"),
    "side": (Vector((1.0, 0.0, 0.0)), "ortho"),
    "left": (Vector((-1.0, 0.0, 0.0)), "ortho"),
    "top": (Vector((0.15, 0.55, 1.0)), "persp"),
    "plan": (Vector((0.0, 0.0, 1.0)), "ortho"),
    "back": (Vector((0.55, -1.0, 0.45)), "persp"),
}

p = argparse.ArgumentParser(prog="views.py", description="Four close views of catalogue GLBs.")
p.add_argument("out", help="output folder; each piece gets <out>/<id>/<view>.png")
p.add_argument("ids", nargs="+", help="catalogue ids or .glb paths")
p.add_argument("--size", type=int, default=640, help="square image size in px (default 640)")
p.add_argument("--glb-dir", help="look ids up as DIR/<id>.glb instead of in the repo's catalogue")
p.add_argument("--views", default="front,side,top,back", help=f"comma list of {', '.join(VIEWS)}")
a = p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
views = [v.strip() for v in a.views.split(",") if v.strip()]
for v in views:
    if v not in VIEWS:
        sys.exit(f"unknown view {v}: use {', '.join(VIEWS)}")

scn = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
try:
    scn.eevee.taa_render_samples = 24
except AttributeError:
    pass
scn.render.resolution_x = scn.render.resolution_y = a.size
scn.render.film_transparent = False
transforms = [t.identifier for t in scn.view_settings.bl_rna.properties["view_transform"].enum_items]
scn.view_settings.view_transform = "AgX" if "AgX" in transforms else "Filmic"


def stage(lo, hi):
    """World, lights and a floor under the piece (re-made after each import,
    which clears the scene)."""
    world = bpy.data.worlds.get("views") or bpy.data.worlds.new("views")
    scn.world = world
    if world.node_tree is None:               # older Blender: nodes are opt-in
        world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.75, 0.76, 0.78, 1)
    bg.inputs[1].default_value = 0.9
    for name, energy, rot in (("sun", 3.0, (0.75, 0.25, 0.6)), ("fill", 1.0, (1.0, -0.3, 3.6))):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = energy
        obj = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = rot
    size = max((hi - lo).length, 1.0) * 3
    me = bpy.data.meshes.new("floor")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    bm.to_mesh(me)
    bm.free()
    floor = bpy.data.objects.new("floor", me)
    floor.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z - 0.002)
    bpy.context.collection.objects.link(floor)
    mat = bpy.data.materials.new("floor")
    if mat.node_tree is None:
        mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.42, 0.42, 0.44, 1)
    me.materials.append(mat)


done = 0
for ref in a.ids:
    path = G.resolve(ref, a.glb_dir)
    pid = os.path.splitext(os.path.basename(path))[0] if ref.endswith(".glb") else ref
    objs = G.import_glb(path)
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    ctr, ext = (lo + hi) / 2, hi - lo
    size = ext.length
    stage(lo, hi)
    os.makedirs(os.path.join(a.out, pid), exist_ok=True)
    for name in views:
        d, kind = VIEWS[name]
        d = d.normalized()
        cam = bpy.data.cameras.new(name)
        cam.lens, cam.clip_start, cam.clip_end = 50, 0.01, 100
        co = bpy.data.objects.new(name, cam)
        bpy.context.collection.objects.link(co)
        if kind == "ortho":
            cam.type = "ORTHO"
            # The two sides the camera sees, with a 12 % margin.
            seen = [ext[k] for k in range(3) if abs(d[k]) < 0.5]
            cam.ortho_scale = max(seen) * 1.12
            co.location = ctr + d * (size + 2)
        else:
            fov = 2 * math.atan(18 / 50)      # 50 mm lens on a 36 mm sensor
            co.location = ctr + d * (size / 2) / math.sin(fov / 2) * 0.92
        if name == "plan":
            co.rotation_euler = (0.0, 0.0, math.pi)   # looking down, the front at the bottom
        else:
            co.rotation_euler = (ctr - co.location).to_track_quat("-Z", "Y").to_euler()
        scn.camera = co
        scn.render.filepath = os.path.join(a.out, pid, name + ".png")
        with G.quiet():
            bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(co, do_unlink=True)
    print(f"VIEWS {pid}: {', '.join(views)} -> {os.path.join(a.out, pid)}")
    done += 1
G.verdict("OK", f"{done} piece(s) rendered")

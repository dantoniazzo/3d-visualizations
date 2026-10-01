"""The reference the X6 is fitted to: Ddiaz Design's "2016 BMW X6 M" (F86),
from Sketchfab, CC BY-NC-SA 4.0 —
https://sketchfab.com/3d-models/2016-bmw-x6-m-9cba50132a864bd79bfab48bd631574d

It is read for its shape only. Its painted skin, its glass and its lamps'
lenses are the surface the body's cage is shrunk onto (fit.py); the rest —
the grilles' meshes, the chrome, the trim, the interior, the running gear —
is left out, so where it has an opening the cage spans it smoothly and the
opening is cut in by the X6's own details.

Everything here is in the design frame (x6.py): millimetres, X back from
the nose, Y across (+ the car's left), Z up from the ground.
"""
import contextlib
import io
import os

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.environ.get("X6_REFERENCE") or os.path.join(os.path.dirname(HERE), "assets", "cars", "2016_bmw_x6_m.glb")

# The parts of the reference that make the car's outside, by node name.
OUTSIDE = {"BumperF6", "Hood6", "FenderFL6", "FenderFR6", "DoorL_SetA6", "DoorR_SetA6", "FendersR6",
           "Chassis7", "Boot6", "BumperR6", "Skirts6", "Diffuser6", "Glass6", "Boot_Glass4",
           "DoorL_Glass4", "DoorR_Glass4", "FenderRL_Part_Door_Glass4", "FenderRR_Part_Door_Glass4",
           "HeadLightL6", "HeadLightR6", "TailLightL6", "TailLightR6", "BootLights6"}
# Materials that are not skin: openings' inserts, trim, chrome, badges.
NOT_SKIN = ("Interior", "Engine", "Chassis_Max", "Grille", "Chrome", "PlasticRough", "Badge", "Aluminum",
            "PaintSolidBlack", "Light_Max")


def part_of(name):
    return name.split("_Mesh")[0].replace("B:", "")


def skin(part, material):
    if part not in OUTSIDE or any(s in material for s in NOT_SKIN):
        return False
    # the front bumper's gloss-black pieces are its intakes' surrounds
    return not (part == "BumperF6" and "PlasticSmooth" in material)


class Reference:
    """The reference's skin as ray targets."""

    def __init__(self, path=PATH, select=skin):
        before = set(bpy.data.objects)
        kept = {coll: set(getattr(bpy.data, coll)) for coll in ("meshes", "materials", "images", "textures")}
        # quietly: the importer logs every node it makes to stdout
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in new if o.type == "MESH"]
        # its frame: Sketchfab's, scaled; the nose and the tyres' contact set ours
        world = {o: o.matrix_world.copy() for o in meshes}
        pts = lambda o: (world[o] @ Vector(c) for c in o.bound_box)
        body = [o for o in meshes if part_of(o.name) in OUTSIDE]
        tyres = [o for o in meshes if "Tire" in o.name] or meshes
        scale = 4.908 / (max(p.y for o in body for p in pts(o)) - min(p.y for o in body for p in pts(o)))
        nose = min(p.y for o in body for p in pts(o))
        ground = min(p.z for o in tyres for p in pts(o))

        def design(v):
            return Vector(((v.y - nose) * scale * 1000.0, v.x * scale * 1000.0, (v.z - ground) * scale * 1000.0))

        verts, polys, self.materials = [], [], []
        for o in meshes:
            part = part_of(o.name)
            names = [s.material.name if s.material else "-" for s in o.material_slots]
            base = len(verts)
            verts.extend(design(world[o] @ v.co) for v in o.data.vertices)
            for p in o.data.polygons:
                mat = names[p.material_index] if names else "-"
                if select(part, mat):
                    polys.append([base + i for i in p.vertices])
                    self.materials.append(mat)
        self.bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False)
        # nothing of it stays in the file
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        for name, old in kept.items():
            coll = getattr(bpy.data, name)
            for item in [i for i in coll if i not in old]:
                coll.remove(item)

    def ray(self, origin, direction, distance):
        """The first hit along a ray: (point, normal, distance, material) or
        None."""
        loc, normal, index, dist = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), distance)
        return None if loc is None else (loc, normal, dist, self.materials[index])


def available(path=PATH):
    return os.path.exists(path)

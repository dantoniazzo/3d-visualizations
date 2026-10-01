"""Export the cars the editor offers, each from a model downloaded from
Sketchfab and kept as it came in assets/cars/ (listed in its cars.json),
split into the parts Car.js drives, into public/models/cars/<id>/:

  - body.glb: everything but the wheels — body, glass, lamps, interior —
    its origin at ride height, 0.45 m above the ground, midway between the
    axles and on the car's centreline; +Z forward, +X to its left.
  - wheels.glb: two wheels, "wheel_front" and "wheel_rear", each centred on
    its hub with its axle along X and its face on +X — they are the car's
    left-hand wheels — made of what turns ("wheel_front_turning") and what
    does not ("static_front": the brake caliper), if anything.
  - thumb.png: a picture of it, for the editor's car picker.
  - car.json: what Car.js needs to drive it — each axle's wheel radius and
    track, the wheelbase, the body's extent — and the model's credits,
    read from the file itself.

Nothing about a model is known in advance but its size and which way it
faces (cars.json). The wheels are found by their shape: the tyres are the
loose parts that are round in side view and lowest at the four corners,
each's axle the way it spreads least — a model posed with its front wheels
steered has them straightened. Everything inside a tyre's cylinder turns
with it (and its tread blocks, which stand proud of it), but for materials
that sit off its axle — a caliper, which stays put.

In Blender, which is Z-up, forward is -Y and the ground z = -0.45.

    npm run models -- --cars                (this, then the files packed)
    blender --background --python import_cars.py [-- id ...]
"""
import contextlib
import io
import json
import math
import os
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SOURCE = os.path.join(REPO, "assets", "cars")
OUT = os.path.join(REPO, "public", "models", "cars")

RIDE_HEIGHT = 0.45      # m: the body's origin above the ground (Car.js)
# The rotation about Z that turns a model's nose to -Y, by where it points.
FACING = {"-y": 0.0, "+x": -math.pi / 2, "+y": math.pi, "-x": math.pi / 2}


# ---------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------

def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.textures, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for item in list(coll):
            coll.remove(item, do_unlink=True)


def credits(path):
    """The model's own credits, from its glTF asset block."""
    with open(path, "rb") as f:
        header = f.read(20)
        doc = json.loads(f.read(struct.unpack("<I", header[12:16])[0]))
    extras = doc.get("asset", {}).get("extras", {})
    return {key: extras.get(key, "") for key in ("title", "author", "license", "source")}


def load(path, entry):
    """The model's meshes, each with its own data, their transforms baked
    in, turned nose to -Y and brought to real size."""
    # quietly: the importer logs every node it makes to stdout
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    turn = Matrix.Rotation(FACING[entry.get("forward", "-y")], 4, "Z")
    world = {o: o.matrix_world.copy() for o in meshes}
    for o in meshes:
        o.data = o.data.copy()
        o.data.transform(turn @ world[o])
    for o in meshes:
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o, do_unlink=True)
    scale = entry.get("scale")
    if not scale:
        lo, hi = bounds(meshes)
        scale = entry["length"] / (hi.y - lo.y)
    for o in meshes:
        o.data.transform(Matrix.Scale(scale, 4))
    return meshes


def bounds(objects):
    los, his = [], []
    for o in objects:
        co = vertices(o.data)
        if len(co):
            los.append(co.min(axis=0))
            his.append(co.max(axis=0))
    return Vector(np.min(los, axis=0)), Vector(np.max(his, axis=0))


def vertices(me):
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


# ---------------------------------------------------------------------
# Finding the wheels
# ---------------------------------------------------------------------

class Mesh:
    """One object's geometry as arrays, and its loose parts."""

    def __init__(self, o):
        me = o.data
        self.object = o
        self.co = vertices(me)
        edges = np.empty(len(me.edges) * 2, np.int64)
        me.edges.foreach_get("vertices", edges)
        starts = np.empty(len(me.polygons), np.int64)
        me.polygons.foreach_get("loop_start", starts)
        loops = np.empty(len(me.loops), np.int64)
        me.loops.foreach_get("vertex_index", loops)
        self.material = np.empty(len(me.polygons), np.int64)
        me.polygons.foreach_get("material_index", self.material)
        self.area = np.empty(len(me.polygons))
        me.polygons.foreach_get("area", self.area)
        centres = np.empty(len(me.polygons) * 3)
        me.polygons.foreach_get("center", centres)
        self.centre = centres.reshape(-1, 3)
        self.names = [s.material.name if s.material else "" for s in o.material_slots] or [""]
        # a part named for a caliper stays put, whatever its shape
        self.caliper = "calip" in o.name.lower()
        # loose parts: each vertex labelled with its part. glTF splits a
        # vertex wherever its normal or UVs change, so vertices in the same
        # place are joined first — a hard edge or a UV seam does not make
        # two pieces of one.
        _, same = np.unique(np.round(self.co / 1e-4).astype(np.int64), axis=0, return_inverse=True)
        same = same.reshape(-1)
        label = loose_parts(same.max() + 1 if len(same) else 0, same[edges.reshape(-1, 2)])
        parts, self.part_of_vertex = np.unique(label[same], return_inverse=True)
        self.parts = len(parts)
        self.part_of_face = self.part_of_vertex[loops[starts]] if len(starts) else np.empty(0, np.int64)
        self.lo = np.full((self.parts, 3), np.inf)
        self.hi = np.full((self.parts, 3), -np.inf)
        np.minimum.at(self.lo, self.part_of_vertex, self.co)
        np.maximum.at(self.hi, self.part_of_vertex, self.co)

    def about(self, wheel):
        """Each part in a wheel's own frame (its axle along X): how far it
        reaches from the axle, and its extent."""
        local = wheel.local(self.co)
        reach = np.zeros(self.parts)
        np.maximum.at(reach, self.part_of_vertex, np.hypot(local[:, 1], local[:, 2]))
        lo = np.full((self.parts, 3), np.inf)
        hi = np.full((self.parts, 3), -np.inf)
        np.minimum.at(lo, self.part_of_vertex, local)
        np.maximum.at(hi, self.part_of_vertex, local)
        return reach, lo, hi

    def parts_all_of(self, names):
        """Which parts are made only of the materials `names`."""
        of = np.array([n in names for n in self.names] + [False] * (int(self.material.max(initial=0)) + 1))
        out = np.ones(self.parts, np.uint8)
        np.minimum.at(out, self.part_of_face, of[self.material].astype(np.uint8))
        return out.astype(bool)


def loose_parts(n, edges):
    """Each vertex labelled by the connected piece it belongs to: labels
    passed along edges, the smallest winning, until they settle."""
    label = np.arange(n)
    if not len(edges):
        return label
    while True:
        low = np.minimum(label[edges[:, 0]], label[edges[:, 1]])
        new = label.copy()
        np.minimum.at(new, edges[:, 0], low)
        np.minimum.at(new, edges[:, 1], low)
        new = new[new]
        if np.array_equal(new, label):
            return label
        label = new


class Wheel:
    """A wheel, from its tyre: where it is, which way its axle points — a
    model can come with its front wheels steered — and, in its own frame
    (its axle along X), how big it is and how wide."""

    def __init__(self, mesh, part):
        # the axle is the way the tyre spreads least: the least of its
        # faces' spread, by area, about their middle
        faces = mesh.part_of_face == part
        centres, area = mesh.centre[faces], mesh.area[faces]
        self.centre = (centres * area[:, None]).sum(axis=0) / area.sum()
        d = centres - self.centre
        _, axes = np.linalg.eigh((d * area[:, None]).T @ d)
        axle = axes[:, 0] * np.sign(axes[0, 0])
        turn = Vector(axle).rotation_difference(Vector((1, 0, 0))).to_matrix()
        self.turn = np.array([list(row) for row in turn])
        self.steer = math.degrees(math.atan2(axle[1], axle[0]))
        self.recentre(mesh.co[mesh.part_of_vertex == part])
        local = self.local(mesh.co[mesh.part_of_vertex == part])
        self.radius = float(np.hypot(local[:, 1], local[:, 2]).max())
        self.outer = self.radius
        self.span = (float(local[:, 0].min()), float(local[:, 0].max()))
        self.materials = {mesh.names[i] for i in np.unique(mesh.material[faces]) if i < len(mesh.names)}
        self.cache = {}

    def local(self, co):
        """Points in the wheel's frame: from its centre, its axle along X."""
        return (co - self.centre) @ self.turn.T

    def recentre(self, co):
        """Centre it on the middle of the points `co`, in its own frame."""
        local = self.local(co)
        self.centre = self.centre + self.turn.T @ ((local.min(axis=0) + local.max(axis=0)) / 2)

    def about(self, mesh):
        if mesh not in self.cache:
            self.cache[mesh] = mesh.about(self)
        return self.cache[mesh]

    def straighten(self):
        """The transform that takes the wheel to its own frame."""
        return Matrix(self.turn.tolist()).to_4x4() @ Matrix.Translation(-Vector(self.centre))


def find_wheels(meshes):
    """The four wheels, {(end, side): Wheel}, found from the tyres — loose
    parts round in side view (as tall as long, narrower than tall,
    0.45–1.3 m across) that reach the ground, the largest and lowest at each
    corner."""
    lo, hi = bounds([m.object for m in meshes])
    mid = (lo + hi) / 2
    candidates = []
    for m in meshes:
        size = m.hi - m.lo
        # round in side view, not as wide as tall (an off-road tyre joined to
        # its hub is nearly, and a steered one is wider), and down on the
        # ground — not a wheel arch
        round_ = (size[:, 2] > 0.45) & (size[:, 2] < 1.3) & \
            (np.abs(size[:, 1] - size[:, 2]) < 0.15 * size[:, 2]) & (size[:, 0] < 0.9 * size[:, 2]) & \
            (m.lo[:, 2] < lo.z + 0.15)
        for k in np.nonzero(round_)[0]:
            candidates.append((m, k))
    wheels = {}
    for end, side in (("front", "left"), ("front", "right"), ("rear", "left"), ("rear", "right")):
        own = [(m, k) for m, k in candidates
               if ((m.lo[k][1] + m.hi[k][1]) / 2 < mid.y) == (end == "front")
               and ((m.lo[k][0] + m.hi[k][0]) / 2 > mid.x) == (side == "left")]
        if not own:
            raise RuntimeError(f"no tyre found at the {end} {side}")
        bottom = min(m.lo[k][2] for m, k in own)
        low = [(m, k) for m, k in own if m.lo[k][2] < bottom + 0.1]
        wheel = Wheel(*max(low, key=lambda mk: mk[0].hi[mk[1]][2] - mk[0].lo[mk[1]][2]))
        # its width: every tyre-like part about the same axle — round, as
        # big as the tyre (a tyre can come in pieces: tread and sidewalls) —
        # and beside it, not the tyre across the car on the same axle
        x0, x1 = wheel.span
        for m in meshes:
            reach, plo, phi = wheel.about(m)
            size, centre = phi - plo, (plo + phi) / 2
            ring = (np.abs(centre[:, 0]) < wheel.radius) & \
                (np.abs(centre[:, 1]) < 0.05 * wheel.radius) & (np.abs(centre[:, 2]) < 0.05 * wheel.radius) & \
                (np.abs(size[:, 1] - size[:, 2]) < 0.1 * size[:, 2]) & \
                (reach > 0.9 * wheel.radius) & (reach < 1.03 * wheel.radius)
            if ring.any():
                x0, x1 = min(x0, float(plo[ring, 0].min())), max(x1, float(phi[ring, 0].max()))
        # and centred on it
        middle = (x0 + x1) / 2
        wheel.centre = wheel.centre + wheel.turn.T @ np.array((middle, 0.0, 0.0))
        wheel.span = (x0 - middle, x1 - middle)
        wheel.cache.clear()
        wheels[(end, side)] = wheel
    return wheels


def classify(meshes, wheels):
    """Each face's place: None for the body, else (end, side, turning).
    A wheel's parts are the loose parts inside its tyre's cylinder — and,
    of its tyre's material, a little beyond: an off-road tyre's tread blocks
    stand proud of it; of those, a material whose faces sit off the axle (a
    caliper) is static. Each wheel's outer radius is its parts' reach."""
    places = {}
    for m in meshes:
        place = np.full(len(m.material), -1, np.int64)       # -1 body, else a wheel's index
        for index, wheel in enumerate(wheels.values()):
            reach, lo, hi = wheel.about(m)
            x0, x1 = wheel.span
            tyre = m.parts_all_of(wheel.materials)
            inside = (lo[:, 0] > x0 - 0.05) & (hi[:, 0] < x1 + 0.05) & \
                ((reach < wheel.radius * 1.03) | (tyre & (reach < wheel.radius * 1.15)))
            if inside.any():
                place[inside[m.part_of_face]] = index
                wheel.outer = max(wheel.outer, float(reach[inside].max()))
        places[m] = place
    out = {}
    keys = list(wheels)
    for index, key in enumerate(keys):
        wheel = wheels[key]
        # every material of this wheel's, and where its faces sit about the axle
        groups = {}
        for m in meshes:
            faces = np.nonzero(places[m] == index)[0]
            for material in np.unique(m.material[faces]) if len(faces) else []:
                sel = faces[m.material[faces] == material]
                name = m.names[material] if material < len(m.names) else ""
                g = groups.setdefault(name, [0.0, 0.0, 0.0])
                w = m.area[sel]
                local = wheel.local(m.centre[sel])
                g[0] += float(w.sum())
                g[1] += float((w * local[:, 1]).sum())
                g[2] += float((w * local[:, 2]).sum())
        static = {name for name, (w, y, z) in groups.items()
                  if "calip" in name.lower() or (w > 0 and math.hypot(y / w, z / w) > 0.18 * wheel.radius)}
        for m in meshes:
            faces = places[m] == index
            if not faces.any():
                continue
            marks = out.setdefault(m, {})
            for material in np.unique(m.material[faces]):
                name = m.names[material] if material < len(m.names) else ""
                turning = name not in static and not m.caliper
                sel = faces & (m.material == material)
                marks.setdefault((key[0], key[1], turning), np.zeros(len(m.material), bool))
                marks[(key[0], key[1], turning)] |= sel
    return out


def extract(o, keep, name):
    """A copy of `o` with only the faces in `keep`."""
    part = o.copy()
    part.data = o.data.copy()
    for coll in o.users_collection:
        coll.objects.link(part)
    drop_faces(part, ~keep)
    part.name = name
    return part


def drop_faces(o, drop):
    if not drop.any():
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.nonzero(drop)[0]], context="FACES")
    bm.to_mesh(o.data)
    bm.free()


def join(objects, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name
    return joined


# ---------------------------------------------------------------------
# One car
# ---------------------------------------------------------------------

def build(entry):
    path = os.path.join(SOURCE, entry["file"])
    out = os.path.join(OUT, entry["id"])
    os.makedirs(out, exist_ok=True)
    fresh()
    objects = [o for o in load(path, entry) if len(o.data.polygons)]
    meshes = [Mesh(o) for o in objects]
    wheels = find_wheels(meshes)

    # Each face to the body or a wheel; the right-hand wheels dropped (Car.js
    # turns the left-hand ones round for them).
    marks = classify(meshes, wheels)
    for (end, side), wheel in wheels.items():
        if abs(wheel.steer) > 0.5:
            print(f"  {end} {side} wheel steered {wheel.steer:+.1f}°: straightened")

    # Into Car.js's frame: the ground at -RIDE_HEIGHT, the origin midway
    # between the axles on the car's centreline.
    ground = min(w.centre[2] - w.outer for w in wheels.values())
    front = sum(wheels[("front", s)].centre[1] for s in ("left", "right")) / 2
    rear = sum(wheels[("rear", s)].centre[1] for s in ("left", "right")) / 2
    centre_x = sum(w.centre[0] for w in wheels.values()) / 4
    shift = Vector((-centre_x, -(front + rear) / 2, -RIDE_HEIGHT - ground))
    pieces = {}
    for m in meshes:
        taken = np.zeros(len(m.material), bool)
        for (end, side, turning), keep in marks.get(m, {}).items():
            taken |= keep
            if side == "left":
                name = f"wheel_{end}_turning" if turning else f"static_{end}"
                pieces.setdefault(name, []).append(extract(m.object, keep, name))
        drop_faces(m.object, taken)
        if len(m.object.data.polygons):
            pieces.setdefault("body", []).append(m.object)
        else:
            bpy.data.objects.remove(m.object, do_unlink=True)
    for o in pieces["body"]:
        o.data.transform(Matrix.Translation(shift))

    body = join(pieces["body"], "body")
    wheel_objects, meta_wheels = [], {}
    for end in ("front", "rear"):
        wheel = wheels[(end, "left")]
        hub = Vector(wheel.centre) + shift
        group = bpy.data.objects.new(f"wheel_{end}", None)
        bpy.context.scene.collection.objects.link(group)
        wheel_objects.append(group)
        for name in (f"wheel_{end}_turning", f"static_{end}"):
            if name in pieces:
                part = join(pieces[name], name)
                # centred on its hub, its axle along X: straight, if the
                # model came with it steered
                part.data.transform(wheel.straighten())
                part.parent = group
                wheel_objects.append(part)
        # in Car.js's frame: x out to the left, z forward
        meta_wheels[end] = {"x": round(hub.x, 4), "z": round(-hub.y, 4), "radius": round(wheel.outer, 4)}
        print(f"  {end} wheels: {2 * hub.x:.3f} m track, {2 * wheel.outer:.3f} m across, {-hub.y:+.3f} m")
    lo, hi = bounds([body])
    print(f"  body: {hi.x - lo.x:.3f} wide, {hi.y - lo.y:.3f} long, {hi.z - lo.z:.3f} high, "
          f"{len(body.data.polygons)} faces")

    export(os.path.join(out, "body.glb"), [body])
    export(os.path.join(out, "wheels.glb"), wheel_objects)
    meta = {
        "id": entry["id"],
        "name": entry["name"],
        "credit": credits(path),
        "rideHeight": RIDE_HEIGHT,
        "wheels": meta_wheels,
        # the body's extent in Car.js's frame: x left, y up, z forward
        "body": {"min": [round(lo.x, 4), round(lo.z, 4), round(-hi.y, 4)],
                 "max": [round(hi.x, 4), round(hi.z, 4), round(-lo.y, 4)]},
    }
    with open(os.path.join(out, "car.json"), "w") as f:
        json.dump(meta, f, indent=2)
    thumbnail(os.path.join(out, "thumb.png"), body, wheel_objects, meta_wheels)


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    # quietly: glTF's exporter warns about every shared image sampler
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                                  export_cameras=False, export_lights=False, export_yup=True)
    print(f"  {os.path.getsize(path) / 1048576:6.1f} MB  {os.path.basename(path)}")


def thumbnail(path, body, wheel_objects, meta_wheels):
    """The car from its front three-quarter, on nothing, lit by a studio."""
    scene = bpy.context.scene
    placed = []
    groups = [o for o in wheel_objects if o.type == "EMPTY"]
    for group in groups:
        end = group.name.split("_")[1]
        w = meta_wheels[end]
        for side in (1, -1):
            for child in group.children:
                dup = child.copy()
                dup.parent = None
                scene.collection.objects.link(dup)
                dup.location = (side * w["x"], -w["z"], w["radius"] - RIDE_HEIGHT)
                if side < 0:
                    dup.scale = (-1, 1, 1)
                placed.append(dup)
    for o in wheel_objects:
        o.hide_render = True
    ids = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in ids else "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    transforms = [t.identifier for t in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items]
    scene.view_settings.view_transform = "AgX" if "AgX" in transforms else "Filmic"
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 32
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    hdri = os.path.join(bpy.utils.resource_path("LOCAL"), "datafiles", "studiolights", "world", "studio.exr")
    if os.path.exists(hdri):
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri)
        world.node_tree.links.new(env.outputs["Color"], world.node_tree.nodes["Background"].inputs["Color"])
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 2.2
    scene.view_settings.exposure = 0.4
    if hasattr(world, "sun_threshold"):
        world.sun_threshold = 1e6
    scene.world = world
    lo, hi = bounds([body])
    centre = (lo + hi) / 2
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z - 0.3, hi.z)]
    cam_data = bpy.data.cameras.new("thumb")
    cam_data.lens = 50
    cam = bpy.data.objects.new("thumb", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    direction = Vector((0.95, -1.0, 0.42)).normalized()
    distance = (hi - lo).length * 2
    # closer until the car fills nine tenths of the frame, then centred in it
    from bpy_extras.object_utils import world_to_camera_view
    for _ in range(5):
        cam.location = centre + direction * distance
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        seen = [world_to_camera_view(scene, cam, c) for c in corners]
        x0, x1 = min(p.x for p in seen), max(p.x for p in seen)
        y0, y1 = min(p.y for p in seen), max(p.y for p in seen)
        distance *= max(x1 - x0, y1 - y0) / 0.9
    cam_data.shift_x = (x0 + x1) / 2 - 0.5
    cam_data.shift_y = (y0 + y1) / 2 - 0.5
    scene.render.filepath = path
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.render.render(write_still=True)
    for o in placed + [cam]:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in wheel_objects:
        o.hide_render = False


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    with open(os.path.join(SOURCE, "cars.json")) as f:
        catalog = json.load(f)
    for entry in catalog["cars"]:
        if args and entry["id"] not in args:
            continue
        print(f"> {entry['id']}")
        build(entry)


if __name__ == "__main__":
    main()

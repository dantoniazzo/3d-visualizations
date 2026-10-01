"""The car modelled rather than imported: a BMW X6 M (F86, 2016) built as
a quad cage and fitted to Ddiaz Design's model of it (lib/x6.py,
lib/x6_reference.py), exported as two GLBs, the body and one wheel. The app
drives imported models (import_cars.py); this is kept to take the
modelling further, and writes to out/, not to the app's models.

Frames, as the app sees them after glTF's Y-up conversion (Car.js):
  - body: origin at ride height, 0.45 m above the ground, midway between
    the axles; +Z forward.
  - wheel: centred on its hub, axle along X, its face on +X (the app turns
    the left-hand wheels round so every face looks out); the brake
    caliper a node of its own, "caliper", which steers but does not turn.

In Blender, which is Z-up, that makes forward -Y and the ground z = -0.45.

    blender --background --python export_car.py [-- --views DIR] [--previews DIR]

With --views, renders the body side, top, front and rear instead,
orthographic at 3 mm a pixel, into DIR, for laying over drawings or the
reference's own views; with --previews,
perspective shots of the car and of its cage. Either leaves the GLBs be.
The .blend (out/bmw_x6.blend) keeps the modelling live: the body's half
with its Mirror and Subdivision modifiers, the car on its wheels.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bmesh
import bpy
from mathutils import Vector

from lib import carbody as cb, fit as fitting, materials as m, x6, x6_parts, x6_reference, x6_wheel

OUT = os.path.join(HERE, "out")
BLEND = os.path.join(HERE, "out", "bmw_x6.blend")

RIDE_HEIGHT = x6.RIDE_HEIGHT / 1000.0
MID = x6.MID
to_blender = x6.to_blender


def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras, bpy.data.collections,
                 bpy.data.images):
        for item in list(coll):
            coll.remove(item, do_unlink=True)
    m._cache.clear()


def car_materials():
    return {
        # Long Beach Blue, as the reference's car.
        # Under half metallic: the app lights anything more metallic with a
        # bright studio to reflect (Utils/reflections.js), which washes the
        # paint out. The clear coat gives it its gloss instead.
        "paint": m.plain("x6_paint", (0.0, 0.33, 0.78), rough=0.3, metal=0.35, coat=1.0, coat_rough=0.03),
        # Tinted, and opaque: there is no cabin to see.
        "glass": m.plain("x6_glass", (0.006, 0.007, 0.008), rough=0.03, coat=1.0, coat_rough=0.0),
        "trim_black": m.plain("x6_trim_black", (0.008, 0.008, 0.009), rough=0.12, coat=0.8),
        "rubber_seal": m.plain("x6_seal", (0.01, 0.01, 0.01), rough=0.7),
        "grille": m.plain("x6_grille", (0.02, 0.02, 0.021), rough=0.6),
        "lens_front": m.plain("x6_headlamp", (0.16, 0.165, 0.17), rough=0.05, metal=0.85, coat=1.0),
        "lens_rear": m.plain("x6_taillamp", (0.20, 0.01, 0.012), rough=0.05, coat=1.0),
        "lens_clear": m.plain("x6_lamp_clear", (0.55, 0.56, 0.58), rough=0.05, metal=0.9, coat=1.0),
        "reflector": m.plain("x6_reflector", (0.30, 0.01, 0.01), rough=0.25),
        "chrome": m.plain("x6_chrome", (0.9, 0.9, 0.92), rough=0.08, metal=1.0),
        "drl": m.emissive("x6_drl", (0.92, 0.95, 1.0), 3.0),
        "lamp_rear_bar": m.emissive("x6_taillamp_bar", (1.0, 0.05, 0.03), 2.5),
        "mirror": m.plain("x6_mirror", (0.85, 0.87, 0.9), rough=0.02, metal=1.0),
        "exhaust": m.plain("x6_exhaust", (0.8, 0.8, 0.82), rough=0.15, metal=1.0),
        "plate": m.plain("x6_plate", (0.02, 0.02, 0.022), rough=0.4),
        "badge_black": m.plain("x6_badge_black", (0.01, 0.01, 0.01), rough=0.2, coat=1.0),
        "badge_blue": m.plain("x6_badge_blue", (0.02, 0.18, 0.62), rough=0.2, coat=1.0),
        "badge_white": m.plain("x6_badge_white", (0.9, 0.9, 0.9), rough=0.2, coat=1.0),
        # the M's three stripes
        "m_light_blue": m.plain("x6_m_light_blue", (0.0, 0.42, 0.85), rough=0.2, coat=1.0),
        "m_dark_blue": m.plain("x6_m_dark_blue", (0.08, 0.06, 0.45), rough=0.2, coat=1.0),
        "m_red": m.plain("x6_m_red", (0.8, 0.03, 0.03), rough=0.2, coat=1.0),
        # The wheel: the M double-spoke, its faces machined, the rest dark;
        # the M Compound brakes' blue caliper.
        "tyre": m.plain("x6_tyre", (0.018, 0.018, 0.019), rough=0.85),
        "rim": m.plain("x6_rim", (0.6, 0.61, 0.63), rough=0.22, metal=0.8),
        "rim_dark": m.plain("x6_rim_dark", (0.03, 0.031, 0.033), rough=0.3, metal=0.6),
        "rim_barrel": m.plain("x6_rim_barrel", (0.025, 0.026, 0.028), rough=0.5, metal=0.6),
        "brake_disc": m.plain("x6_brake_disc", (0.10, 0.10, 0.105), rough=0.5, metal=0.9),
        "caliper": m.plain("x6_caliper", (0.015, 0.16, 0.62), rough=0.3, coat=0.8),
    }


def placeholders(mats):
    """The details' patches, until shape_details models them in: a material
    for each outline's part that is not a finished material already."""
    for part in x6.CUT:
        if part not in mats:
            mats[part] = m.plain(f"x6_part_{part}", (1.0, 0.0, 1.0))
    return mats


def part_of(region, i, j):
    """Which part a body face belongs to, by where it is on the grid: the
    sills' black foot. The glass, the grilles and the rest are drawn on by
    their outlines (x6.FEATURES)."""
    if region == "side" and j < 1:
        return "trim_black"
    return "paint"


# ---------------------------------------------------------------------
# Details: what each part's faces become
# ---------------------------------------------------------------------

def components(faces):
    """Faces split into connected patches."""
    left, out = set(faces), []
    while left:
        seed = left.pop()
        patch, stack = {seed}, [seed]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g in left:
                        left.remove(g)
                        patch.add(g)
                        stack.append(g)
        out.append(list(patch))
    return out


def region_normal(faces):
    n = Vector()
    for f in faces:
        n += f.normal * f.calc_area()
    return n.normalized()


def on_mirror(f):
    return all(abs(v.co.x) < 1e-6 for v in f.verts)


def recess(bm, faces, depth, wall):
    """Sink a patch of faces into the body by `depth` (m), walls round it
    of material `wall` — as a modeller extrudes a window's glass in."""
    n = region_normal(faces)
    ret = bmesh.ops.extrude_face_region(bm, geom=faces, use_keep_orig=False)
    # the op leaves the patch where it was; the copy is what sinks
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    new_faces = {g for g in ret["geom"] if isinstance(g, bmesh.types.BMFace)}
    new_verts = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
    for v in new_verts:
        step = n * depth
        if abs(v.co.x) < 1e-6:
            # on the mirror plane: stay on it
            step.x = 0.0
        v.co -= step
    walls = {f for v in new_verts for f in v.link_faces if f not in new_faces}
    for f in walls:
        f.material_index = wall
    # a wall lying on the mirror plane is inside the car once mirrored
    dead = [f for f in walls if on_mirror(f)]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    return list(new_faces)


def inset(bm, faces, width, material=None, depth=0.0):
    """A band `width` (m) round a patch's edge, inside it; the patch itself
    shrinks, sunk by `depth`. Left joined along the mirror plane."""
    ret = bmesh.ops.inset_region(bm, faces=faces, thickness=width, depth=-depth,
                                 use_even_offset=False, use_boundary=False)
    if material is not None:
        for f in ret["faces"]:
            f.material_index = material
    return ret["faces"]


# part: what its patches become — a list of steps
DETAILS = {
    "glass": [("recess", 0.012, "rubber_seal")],
    "sunroof": [("recess", 0.006, "rubber_seal"), ("retag", "glass")],
    "trim_black": [],
    # the side glass: a black surround round it, the glass set in behind
    "dlo": [("inset", 0.018, "trim_black", 0.0), ("recess", 0.01, "trim_black"), ("retag", "glass")],
    # the kidneys: a chrome frame, the slats' black well behind it
    "kidney": [("inset", 0.03, "chrome", 0.0), ("recess", 0.055, "grille"), ("retag", "grille")],
    "intake": [("inset", 0.01, "trim_black", 0.003), ("recess", 0.03, "grille"), ("retag", "grille")],
    "vent": [("inset", 0.008, "trim_black", 0.0), ("recess", 0.03, "grille"), ("retag", "grille")],
}


def shape_details(obj, mats):
    """Every detail's patches modelled in: windows set in with their seals,
    the grille's frames and slats' recess, the lamps behind their bezels,
    the intakes opened up."""
    me = obj.data
    names = [mat.name for mat in me.materials]
    index = {}
    for key, mat in mats.items():
        if mat.name not in names:
            me.materials.append(mat)
            names.append(mat.name)
        index[key] = names.index(mat.name)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    for part, steps in DETAILS.items():
        faces = [f for f in bm.faces if f.material_index == index[part]]
        for patch in components(faces):
            for step in steps:
                if step[0] == "inset":
                    _, width, material, depth = step
                    inset(bm, patch, width, index[material or "paint"], depth)
                elif step[0] == "recess":
                    patch = recess(bm, patch, step[1], index[step[2]])
                elif step[0] == "retag":
                    for f in patch:
                        f.material_index = index[step[1]]
                bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    # the details' placeholders, and anything else no face uses
    indices = [poly.material_index for poly in me.polygons]
    used = sorted(set(indices))
    keep = [me.materials[k] for k in used]
    me.materials.clear()
    for mat in keep:
        me.materials.append(mat)
    remap = {old: new for new, old in enumerate(used)}
    me.polygons.foreach_set("material_index", [remap[k] for k in indices])
    me.update()


def mesh_object(name, builder, mats, col):
    """A Blender object from a Builder's half: its faces, their materials,
    one material slot a part."""
    me = bpy.data.meshes.new(name)
    verts = [to_blender(v) for v in builder.verts]
    me.from_pydata(verts, [], builder.faces)
    names = sorted(set(builder.parts))
    for n in names:
        me.materials.append(mats[n])
    me.polygons.foreach_set("material_index", [names.index(p) for p in builder.parts])
    me.update()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    # Outward normals: the half is one connected surface; recalc, then make
    # sure the roof faces up.
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if top.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    return obj


def mirror_and_smooth(obj, levels=2):
    mod = obj.modifiers.new("Mirror", "MIRROR")
    mod.use_axis[0] = True
    mod.use_clip = True
    mod.use_mirror_merge = True
    mod.merge_threshold = 0.0005
    sub = obj.modifiers.new("Subdivision", "SUBSURF")
    sub.levels = levels
    sub.render_levels = levels


def mark_creases(obj, chains):
    """The body's creases shaded sharp: the edges along each chain of points."""
    from mathutils import kdtree
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    tree = kdtree.KDTree(len(bm.verts))
    for v in bm.verts:
        tree.insert(v.co, v.index)
    tree.balance()
    count = 0
    for chain in chains:
        verts = []
        for p in chain:
            _, index, distance = tree.find(Vector(to_blender(p)))
            verts.append(bm.verts[index] if distance < 1e-4 else None)
        for a, b in zip(verts, verts[1:]):
            edge = a and b and bm.edges.get((a, b))
            if edge:
                edge.smooth = False
                count += 1
    bm.to_mesh(me)
    bm.free()
    print(f"  creases: {count} edges sharp")


def cut_seams(obj, chains, depth=0.007, gap=0.0015):
    """The panels' shut lines cut in, as a modeller cuts them: the edges
    along each split, each side pulled back `gap` (m) from the other and
    turned in `depth` — so the panel edges hold under subdivision, and a
    dark gap shows between them."""
    from mathutils import kdtree
    me = obj.data
    seal = [mat.name for mat in me.materials].index("x6_seal")
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    tree = kdtree.KDTree(len(bm.verts))
    for v in bm.verts:
        tree.insert(v.co, v.index)
    tree.balance()
    edges, ends = [], set()
    for chain in chains:
        verts = []
        for p in chain:
            _, index, distance = tree.find(Vector(to_blender(p)))
            verts.append(bm.verts[index] if distance < 1e-4 else None)
        # a line's ends are not split: the gap closes there
        ends.update(v for v in (verts[0], verts[-1]) if v is not None)
        for a, b in zip(verts, verts[1:]):
            edge = a and b and bm.edges.get((a, b))
            if edge:
                edges.append(edge)
    split = bmesh.ops.split_edges(bm, edges=edges)
    rims = [e for e in split["edges"] if e.is_valid and e.is_boundary]
    bm.normal_update()
    rim_verts = {v for e in rims for v in e.verts}
    normals = {v: v.normal.copy() for v in rim_verts}
    # each side back from the gap, into its own panel
    for v in rim_verts:
        if v in ends:
            continue
        inward = Vector()
        for e in v.link_edges:
            if e.is_boundary:
                continue
            inward += (e.other_vert(v).co - v.co).normalized()
        if inward.length > 0:
            step = inward.normalized() * gap
            if abs(v.co.x) < 1e-6:
                step.x = 0.0
            v.co += step
    ext = bmesh.ops.extrude_edge_only(bm, edges=rims)
    new = {g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)}
    for v in new:
        source = next((e.other_vert(v) for e in v.link_edges if e.other_vert(v) not in new), None)
        if source is None:
            continue
        step = normals.get(source, source.normal) * depth
        if abs(source.co.x) < 1e-6:
            step.x = 0.0
        v.co = source.co - step
    for f in ext["geom"]:
        if isinstance(f, bmesh.types.BMFace):
            f.material_index = seal
            f.smooth = True
    bm.to_mesh(me)
    bm.free()
    print(f"  seams: {len(edges)} edges cut")


def build_body(col, mats):
    body = x6.Body()
    builder = cb.Builder()
    body.build(builder, part_of)
    print(f"  body half: {len(builder.verts)} vertices, {len(builder.faces)} faces")
    if x6_reference.available():
        reference = x6_reference.Reference()
        hits, filled, rms = fitting.fit(builder, reference)
        print(f"  fitted to the reference: {hits} on it, {filled} spanning its openings, {rms:.1f} mm rms move")
    else:
        print(f"  no reference at {x6_reference.PATH}: the body keeps its measured sections")
    body.mark_features(builder)
    # the lines along the cage, where the fit put them
    on_body = lambda chains: [[builder.at(p) for p in chain] for chain in chains]
    obj = mesh_object("Chassis", builder, mats, col)
    shape_details(obj, mats)
    mark_creases(obj, on_body(body.creases()))
    cut_seams(obj, on_body(body.seams()))
    mirror_and_smooth(obj)
    parts = x6_parts.build(obj, body, mats, col)
    return [obj] + parts


def build_wheel(col, mats):
    """The wheel, at the origin as Car.js wants it: `wheel`, which turns,
    and `caliper`, which does not."""
    wheel, caliper = x6_wheel.build()
    return [wheel.object("wheel", mats, col, mirror=False), caliper.object("caliper", mats, col, mirror=False)]


def mark_sharp(obj, degrees=40):
    """Edges where the faces either side meet at more than `degrees` drawn
    sharp: the windows' seals, the lamps' bezels, the grille's frame — so
    the car shades right without being subdivided."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    limit = math.radians(degrees)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > limit:
            e.smooth = False
    bm.to_mesh(obj.data)
    bm.free()


def export(path, objects):
    """Objects to a GLB, their modifiers applied: the body mirrored, not
    subdivided — its cage is fine enough to draw as it is."""
    subdivided = [(o, mod, mod.levels) for o in objects for mod in o.modifiers if mod.type == "SUBSURF"]
    for _, mod, _ in subdivided:
        mod.levels = 0
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    for _, mod, levels in subdivided:
        mod.levels = levels
    print(f"  {os.path.getsize(path) / 1024:6.0f} KB  {os.path.basename(path)}")


def place_wheels(col, wheel_objects):
    """Four of the wheel on the car, for the .blend and the previews: the
    left ones turned round, the caliper behind the front axle and ahead
    of the rear."""
    placed = []
    for side in (1, -1):
        for axle, rear, track in ((x6.FRONT_AXLE, False, x6.TRACK_FRONT), (x6.REAR_AXLE, True, x6.TRACK_REAR)):
            at = Vector(to_blender((axle, side * track, x6.WHEEL_RADIUS)))
            for src in wheel_objects:
                dup = src.copy()
                col.objects.link(dup)
                dup.location = at
                if src.name.startswith("caliper"):
                    dup.scale = (side, -1 if rear else 1, 1)
                elif side < 0:
                    dup.rotation_euler = (0, 0, math.pi)
                placed.append(dup)
    return placed


# ---------------------------------------------------------------------
# Views for checking against drawings of the car
# ---------------------------------------------------------------------

MM_PER_PX = 6.0710 / 2   # the-blueprints.com's drawings' scale, doubled


def render_views(outdir):
    os.makedirs(outdir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    cam_data = bpy.data.cameras.new("view")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("view", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # (name, look direction, up, design box: (u0, u1, v0, v1) in mm, how to map)
    views = {
        # u along the car from the front, v up from the ground
        "side": dict(width=(-60, 5020), height=(-30, 1780), loc=lambda cu, cv: ((3.0, (cu - MID) / 1000, cv / 1000 - RIDE_HEIGHT)),
                     rot=(math.pi / 2, 0, math.pi / 2)),
        # u along the car, v out to the right; rendered with the right side down, flipped after
        "top": dict(width=(-60, 5020), height=(-1150, 1150), loc=lambda cu, cv: (-cv / 1000, (cu - MID) / 1000, 3.0),
                    rot=(0, 0, math.pi / 2)),
        # u across (right side on the right), v up
        "front": dict(width=(-1150, 1150), height=(-30, 1780), loc=lambda cu, cv: (cu / 1000, -4.0, cv / 1000 - RIDE_HEIGHT),
                      rot=(math.pi / 2, 0, 0)),
        "rear": dict(width=(-1150, 1150), height=(-30, 1780), loc=lambda cu, cv: (-cu / 1000, 4.0, cv / 1000 - RIDE_HEIGHT),
                     rot=(math.pi / 2, 0, math.pi)),
    }
    for name, v in views.items():
        (u0, u1), (v0, v1) = v["width"], v["height"]
        w, h = u1 - u0, v1 - v0
        scene.render.resolution_x = round(w / MM_PER_PX)
        scene.render.resolution_y = round(h / MM_PER_PX)
        scene.render.resolution_percentage = 100
        cam_data.ortho_scale = max(w, h) / 1000
        cam.location = v["loc"]((u0 + u1) / 2, (v0 + v1) / 2)
        cam.rotation_euler = v["rot"]
        scene.render.filepath = os.path.join(outdir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  view {name}: {scene.render.resolution_x}x{scene.render.resolution_y}")


def render_previews(outdir, objects):
    """Perspective shots: the car shaded, and its half's cage — the quads it
    is modelled with — drawn over it."""
    os.makedirs(outdir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE_NEXT"
    scene.render.film_transparent = False
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    world = bpy.data.worlds.new("preview")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.66, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.5
    sun_obj = bpy.data.objects.new("sun", sun)
    sun_obj.rotation_euler = (math.radians(50), math.radians(10), math.radians(140))
    scene.collection.objects.link(sun_obj)
    ground = bpy.data.meshes.new("ground")
    ground.from_pydata([(-20, -20, -RIDE_HEIGHT), (20, -20, -RIDE_HEIGHT), (20, 20, -RIDE_HEIGHT), (-20, 20, -RIDE_HEIGHT)], [], [(0, 1, 2, 3)])
    ground_obj = bpy.data.objects.new("ground", ground)
    ground_obj.data.materials.append(m.plain("preview_ground", (0.35, 0.36, 0.37), rough=0.9))
    scene.collection.objects.link(ground_obj)
    # the cage: the unsubdivided half, as a wire
    cage = []
    for obj in objects:
        wire = obj.copy()
        wire.data = obj.data.copy()
        wire.modifiers.clear()
        mod = wire.modifiers.new("Wire", "WIREFRAME")
        mod.thickness = 0.004
        mod.use_replace = True
        wire.data.materials.clear()
        wire.data.materials.append(m.plain("preview_wire", (0.02, 0.35, 0.9), rough=0.5, emit=(0.02, 0.35, 0.9, 1), emit_str=1.5))
        scene.collection.objects.link(wire)
        cage.append(wire)
    cam_data = bpy.data.cameras.new("preview")
    cam_data.lens = 50
    cam = bpy.data.objects.new("preview", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    shots = {
        "front34": ((4.6, -5.4, 1.15), (0, -0.2, 0.25)),
        "rear34": ((-4.4, 5.6, 1.4), (0, 0.2, 0.25)),
        "side": ((7.5, 0.0, 0.55), (0, 0, 0.2)),
        "top34": ((3.0, -3.2, 4.2), (0, 0, 0.2)),
    }
    for name, (loc, target) in shots.items():
        cam.location = loc
        direction = Vector(target) - Vector(loc)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        for wire in cage:
            wire.hide_render = True
        scene.render.filepath = os.path.join(outdir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        for wire in cage:
            wire.hide_render = False
        scene.render.filepath = os.path.join(outdir, f"{name}-cage.png")
        bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    views = args[args.index("--views") + 1] if "--views" in args else None
    previews = args[args.index("--previews") + 1] if "--previews" in args else None
    os.makedirs(OUT, exist_ok=True)

    fresh()
    mats = placeholders(car_materials())
    col = bpy.data.collections.new("car")
    bpy.context.scene.collection.children.link(col)
    objects = build_body(col, mats)
    for obj in objects:
        mark_sharp(obj)
    wheel_col = bpy.data.collections.new("wheel")
    bpy.context.scene.collection.children.link(wheel_col)
    wheel = build_wheel(wheel_col, mats)
    for obj in wheel:
        mark_sharp(obj, 50)

    # Checking renders leave the app's models alone: `npm run models -- --car`
    # exports them, and packs them for the web after.
    if not (views or previews):
        export(os.path.join(OUT, "car-chassis.glb"), objects)
        export(os.path.join(OUT, "car-wheel.glb"), wheel)

    # The .blend: the car on its wheels; the wheel at the origin kept apart.
    place_wheels(col, wheel)
    wheel_col.hide_viewport = True
    wheel_col.hide_render = True
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    if views:
        render_views(views)
    if previews:
        render_previews(previews, objects[:1])


main()

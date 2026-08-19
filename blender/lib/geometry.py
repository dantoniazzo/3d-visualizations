"""Mesh primitives and scene-graph helpers.

Everything is built with bmesh rather than bpy.ops: operators depend on
selection state and an active view layer, which makes them slow and fragile
in a headless script that creates a few thousand objects.
"""

import bmesh
import bpy
from mathutils import Vector


# ---------------------------------------------------------------------
# Collections
# ---------------------------------------------------------------------

def collection(name, parent=None):
    """Get or make a collection, linked under `parent` (default: scene root)."""
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(col)
    return col


def link(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


# ---------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------

def _finish(mesh, name, col, mat, loc, rot, shade_smooth):
    obj = bpy.data.objects.new(name, mesh)
    if loc:
        obj.location = loc
    if rot:
        obj.rotation_euler = rot
    if mat is not None:
        obj.data.materials.append(mat)
    if shade_smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    link(obj, col or bpy.context.scene.collection)
    return obj


def box(name, size, loc=(0, 0, 0), col=None, mat=None, rot=None, origin="center",
        bevel=0.0, segments=2, shade_smooth=False):
    """An axis-aligned box.

    `origin` picks which point of the box `loc` refers to: "center", or a
    string of axis letters meaning min on that axis, e.g. "z" for sitting on
    the floor, "xyz" for the min corner.
    """
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)

    shift = Vector((0, 0, 0))
    if origin != "center":
        if "x" in origin:
            shift.x = sx / 2
        if "y" in origin:
            shift.y = sy / 2
        if "z" in origin:
            shift.z = sz / 2
        bmesh.ops.translate(bm, vec=shift, verts=bm.verts)

    if bevel > 0:
        bmesh.ops.bevel(
            bm, geom=list(bm.verts) + list(bm.edges), offset=bevel,
            segments=segments, profile=0.5, affect="EDGES",
        )

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(mesh, name, col, mat, loc, rot, shade_smooth)


def cylinder(name, radius, height, loc=(0, 0, 0), col=None, mat=None, rot=None,
             segments=32, origin="center", cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=cap, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=height,
    )
    if "z" in origin:
        bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = _finish(mesh, name, col, mat, loc, rot, True)
    # Keep the flat caps flat.
    for p in obj.data.polygons:
        if len(p.vertices) > 4:
            p.use_smooth = False
    return obj


def tube(name, radius, height, thickness, loc=(0, 0, 0), col=None, mat=None,
         rot=None, segments=32, origin="center"):
    """An open-ended pipe — taps, rails, legs."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segments,
                          radius1=radius, radius2=radius, depth=height)
    inner = bmesh.ops.create_cone(bm, cap_ends=False, segments=segments,
                                  radius1=radius - thickness,
                                  radius2=radius - thickness, depth=height)
    del inner
    if "z" in origin:
        bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(mesh, name, col, mat, loc, rot, True)


def prism(name, profile, depth, loc=(0, 0, 0), col=None, mat=None, rot=None,
          shade_smooth=False):
    """Extrude a 2D XY profile along Z. Profile is a list of (x, y)."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0.0)) for x, y in profile]
    bm.faces.new(verts)
    bm.faces.ensure_lookup_table()
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    moved = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, depth)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(mesh, name, col, mat, loc, rot, shade_smooth)


def plane(name, size, loc=(0, 0, 0), col=None, mat=None, rot=None):
    sx, sy = size
    bm = bmesh.new()
    for v in [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]:
        bm.verts.new((v[0], v[1], 0.0))
    bm.verts.ensure_lookup_table()
    bm.faces.new(bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(mesh, name, col, mat, loc, rot, False)


def polygon(name, points, loc=(0, 0, 0), col=None, mat=None, rot=None, flip=False):
    """A flat n-gon from XY points, lying in the XY plane.

    `flip` points the normal down by reversing the winding. Rotating the
    object 180 degrees would also flip it, but about the object origin — which
    for a room polygon in positive X/Y mirrors it clean off the building.
    """
    bm = bmesh.new()
    order = list(reversed(points)) if flip else list(points)
    verts = [bm.verts.new((x, y, 0.0)) for x, y in order]
    bm.faces.new(verts)
    if not flip:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(mesh, name, col, mat, loc, rot, False)


# ---------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------

def world_matrix(obj):
    """The object's true transform, without needing a depsgraph evaluation.

    `matrix_world` is only refreshed when the view layer updates, which a
    headless build never does on its own — so freshly created objects report
    an identity matrix and any geometry baked against it lands at the origin.
    `matrix_basis` is derived straight from loc/rot/scale, so it is correct
    the instant it is set; walk the parent chain to get the world transform.
    """
    m = obj.matrix_basis.copy()
    parent = obj.parent
    while parent is not None:
        m = parent.matrix_basis @ obj.matrix_parent_inverse @ m
        obj, parent = parent, parent.parent
    return m


def join(objs, name=None, col=None):
    """Merge objects into the first one, in world space."""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None

    # A single object still has to go through the bake below. Skipping it
    # leaves the part's own offset sitting on the object transform, which the
    # caller then overwrites when it places the assembly — dropping the piece
    # back onto the origin. A wall with no openings is exactly one panel, so
    # this is the common case, not the rare one.
    target = objs[0]
    bm = bmesh.new()
    bm.from_mesh(target.data)
    bmesh.ops.transform(bm, matrix=world_matrix(target), verts=bm.verts)

    # A boolean can drag an empty slot in from its cutter, so slots may be None.
    slots = {m.name: i for i, m in enumerate(target.data.materials) if m}

    for other in objs[1:]:
        tmp = bmesh.new()
        tmp.from_mesh(other.data)
        bmesh.ops.transform(tmp, matrix=world_matrix(other), verts=tmp.verts)

        remap = {}
        for i, m in enumerate(other.data.materials):
            if not m:
                remap[i] = 0
                continue
            if m.name not in slots:
                target.data.materials.append(m)
                slots[m.name] = len(slots)
            remap[i] = slots[m.name]

        mesh_tmp = bpy.data.meshes.new("_tmp")
        tmp.to_mesh(mesh_tmp)
        tmp.free()
        for p in mesh_tmp.polygons:
            p.material_index = remap.get(p.material_index, 0)
        bm.from_mesh(mesh_tmp)
        bpy.data.meshes.remove(mesh_tmp)

        bpy.data.objects.remove(other, do_unlink=True)

    bm.to_mesh(target.data)
    bm.free()
    target.matrix_basis.identity()
    target.location = (0, 0, 0)
    target.rotation_euler = (0, 0, 0)
    target.scale = (1, 1, 1)
    if name:
        target.name = name
        target.data.name = name
    if col:
        link(target, col)
    return target


def apply_modifiers(obj):
    """Bake an object's modifier stack into its mesh.

    `join` copies base mesh data, so any modifier left pending is either lost
    with the object it sat on or silently re-applied to the whole merged
    result. Booleans in particular have to be resolved before a join.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = baked
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def bevel_object(obj, width=0.002, segments=2, angle=0.7):
    """Add a bevel modifier — catches the light on every edge, which is most
    of what separates a modelled room from a box of cubes."""
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = angle
    m.harden_normals = False
    return obj


def solidify(obj, thickness, offset=-1.0):
    m = obj.modifiers.new("solidify", "SOLIDIFY")
    m.thickness = thickness
    m.offset = offset
    return obj


def array(obj, count, offset, col=None):
    """Real copies rather than a modifier, so each can be moved afterwards."""
    out = [obj]
    for i in range(1, count):
        dup = obj.copy()
        dup.data = obj.data
        dup.location = (
            obj.location.x + offset[0] * i,
            obj.location.y + offset[1] * i,
            obj.location.z + offset[2] * i,
        )
        link(dup, col or obj.users_collection[0])
        out.append(dup)
    return out


def instance(obj, loc, rot=None, scale=None, col=None, name=None):
    """A linked copy: shares mesh data, so a hundred chairs cost one mesh."""
    dup = obj.copy()
    dup.data = obj.data
    dup.location = loc
    if rot:
        dup.rotation_euler = rot
    if scale:
        dup.scale = scale if hasattr(scale, "__len__") else (scale, scale, scale)
    if name:
        dup.name = name
    link(dup, col or obj.users_collection[0])
    return dup


def bounds(obj):
    """World-space (min, max) corners.

    Read off the mesh rather than obj.bound_box: that cache is only refreshed
    on a depsgraph update, which a headless build never triggers, so it lies
    about anything created or edited in the same run.
    """
    mw = world_matrix(obj)
    if obj.type == "MESH" and obj.data.vertices:
        pts = [mw @ v.co for v in obj.data.vertices]
    else:
        pts = [mw @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def fit_to(obj, target_size=None, target_height=None, sit_on=None):
    """Scale an imported asset to a real-world size, and optionally drop it
    onto a surface. Poly Haven assets are metric, but not all are the size a
    given room wants."""
    lo, hi = bounds(obj)
    size = hi - lo
    if target_height:
        s = target_height / size.z if size.z else 1.0
        obj.scale = (s, s, s)
    elif target_size:
        s = min(
            target_size[0] / size.x if size.x else 1e9,
            target_size[1] / size.y if size.y else 1e9,
            target_size[2] / size.z if size.z else 1e9,
        )
        obj.scale = (s, s, s)
    if sit_on is not None:
        lo, _ = bounds(obj)
        obj.location.z += sit_on - lo.z
    return obj


def bar(name, profile, length, loc=(0, 0, 0), col=None, mat=None, rot=None,
        shade_smooth=False, cap=True):
    """A moulding run: a (y, z) profile swept along +X for `length`.

    This is how skirtings, architraves, cills, cornices and handrails are
    made — a real profile catching a real highlight, rather than a flat board.
    """
    bm = bmesh.new()
    front = [bm.verts.new((0.0, y, z)) for y, z in profile]
    bm.faces.new(front)
    bm.faces.ensure_lookup_table()
    ret = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    moved = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((length, 0, 0)), verts=moved)
    if not cap:
        for f in bm.faces:
            if abs(f.normal.x) > 0.9:
                bmesh.ops.delete(bm, geom=[f], context="FACES")
                break
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(mesh, name, col, mat, loc, rot, shade_smooth)


# Stock mouldings, as (y, z) profiles. y is out from the wall, z is up.
SKIRTING = [(0.0, 0.0), (0.018, 0.0), (0.018, 0.095), (0.012, 0.110),
            (0.012, 0.118), (0.004, 0.128), (0.0, 0.128)]
ARCHITRAVE = [(0.0, 0.0), (0.016, 0.0), (0.016, 0.048), (0.010, 0.058),
              (0.010, 0.064), (0.0, 0.070)]
CORNICE = [(0.0, 0.0), (0.075, 0.0), (0.070, 0.020), (0.050, 0.045),
           (0.020, 0.065), (0.0, 0.075)]
CILL = [(0.0, 0.0), (0.055, 0.0), (0.055, 0.026), (0.048, 0.032), (0.0, 0.032)]

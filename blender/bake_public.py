"""Bake the lighting of a published public view into lightmaps.

Input is a published snapshot (frontend/Experience/Publish/Snapshot.js):
every triangle a visitor can see, merged into one mesh per material and
floor, carrying each material's colour. Output, for each lighting variant
(day, night):

  - a lightmap: the light arriving at every point of the scene — sun, sky,
    the room lights, and everything bounced between them — without the
    surfaces' own colour, which the public view multiplies back in from its
    own tiling textures. So a floor keeps its crisp planks and gains soft,
    real shadows and bounce light that no real-time light on a phone could.
    A 4096² one for a final bake, about 2 cm a texel on the house, and a
    2048² copy for phones.
  - the same geometry, with a second set of UVs saying where on the
    lightmap each surface is.

The lightmap UVs (unwrap): each mesh is made whole first — T-junctions
split, coincident vertices joined — then cut only where the surface turns
sharply, and wherever a curved surface must be cut to lie flat; each piece
is relaxed flat with Blender's minimum-stretch unwrap, so every texel
covers the same few square centimetres, and packed tight. Texels are
spent where they are looked at: the house and everything in it at full
density, the roof, the upper side of ceilings and the garden at less, the
ground plane round the site at next to nothing.

The bake: every step bakes one joined copy of the meshes (as_one) — a
minute of setup each otherwise; portals in every outside opening, so the
sky is sampled through the windows; ten bounces, so corners are as light
as they would be. The light is baked in two passes (bake_lightmap): the
light straight from the sun and lamps, sharp-edged but clean, at full
size; the light bounced off everything else, grainy but slowly changing,
at half the size with four times the samples a texel. A surface seen
from both sides — a gable, a ceiling — is two copies set a few
millimetres apart, back to back (part_twins), so no light leaks between
them. The top of a ceiling is seen only from above, in the public view's
bird's-eye view of the floor over it, which lifts the roof off: so it is
baked again with the roof out of the way (roof_lifted). Texels that something sits on — the wall behind a door frame — are
found (bake_coverage), and so are those inside the walls and floors
themselves, where a wall runs on into the next or up past a ceiling
(bake_hidden, from the spec); all are given the light round them rather
than their own black, and the empty atlas round every island carries its
edge on, before the denoiser (Open Image Denoise) sees it. Where the
lightmap is cut but the surface is not, the two sides are stitched to
agree (stitch).

Narrow strips — a skirting board, a door casing, a window frame — go on
the lightmap at half again the texels, so each is still several texels
across. Only thin and small surfaces — a moulding's curve, balusters,
handrails, a leaf — are lit through their vertices instead: split off into
meshes of their own, their light baked into two vertex attributes, _DAY and
_NIGHT, and smoothed of its grain. A vertex's light is sampled a little way off
whatever it touches and out of anything solid, on probes that leave the
geometry where it is (sample_points, vertex_probes), and long edges get
extra vertices where the light along them changes (split_long_edges): a
skirting board is one strip from corner to corner of its wall.

    blender --background --python bake_public.py -- \\
        --snapshot published/<id>/<version>/snapshot.glb \\
        --out published/<id>/<version>/bake \\
        --settings settings.json --size 4096 --samples 512

settings.json (written by scripts/bake-public.mjs, which runs this) carries
the spec's lighting preset, the room lights, the portals and which
materials are outdoor ground. Writes, into --out: lit.glb, <variant>.webp
(and <variant>-phone.webp) for each variant, and bake.json describing them.
"""
import argparse
import json
import math
import os
import sys
import time
from contextlib import contextmanager

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

LIGHTMAP_UV = "lightmap"
# Surfaces narrower than this — a few lightmap texels — are lit through
# their vertices: a lightmap island any thinner can fall between texel
# centres altogether and come out black.
THIN = 0.06
# Surfaces narrower than this but wider than THIN — a skirting board, a
# door casing, a window frame — are narrow strips: on the lightmap, at
# STRIP_DENSITY times the texels a metre each way.
STRIP_WIDTH = 0.16
STRIP_DENSITY = 1.5
# ...and so are surfaces smaller than this, in square metres — a leaf, a
# tap, the end of a cushion: the light hardly changes across one, and in
# the lightmap each would cost as much again in margin round it as in
# texels on it.
SMALL = 0.04
# Faces meeting at less than this are one surface, lit and unwrapped as
# one; along sharper edges the light changes anyway, and the lightmap is
# cut there.
SMOOTH = math.radians(35)
# Empty texels round every island in a 4096² lightmap, and in proportion
# at other sizes: room for the bake's margin, and for the smaller mipmaps a
# distant surface is drawn with — and a phone's half-size copy — not to
# reach into the next island.
MARGIN_4K = 8
MARGIN = MARGIN_4K
VERTEX_ATTRIBUTES = {"day": "_DAY", "night": "_NIGHT"}


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--settings", required=True)
    parser.add_argument("--size", type=int, default=4096)
    parser.add_argument("--samples", type=int, default=512)
    parser.add_argument("--variants", default="day,night")
    parser.add_argument("--stage", default="all", help="unwrap: stop after the UVs, for checking them")
    parser.add_argument("--debug", action="store_true", help="also save each raw and denoised lightmap as EXR")
    return parser.parse_args(argv)


def log(*args):
    print("[bake]", *args, flush=True)


def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.images, bpy.data.worlds):
        for item in list(coll):
            coll.remove(item, do_unlink=True)


# ---------------------------------------------------------------------
# Texel density
# ---------------------------------------------------------------------

def density(obj, settings):
    """Metres per lightmap texel, relative to the house's own: 1 for the
    house and everything in it, coarser for ground outside, coarsest for
    the ground plane that runs off to the horizon."""
    lo, hi = bounds(obj)
    if max(hi.x - lo.x, hi.y - lo.y) > 100:
        return 40.0
    if obj.get("material") in settings["groundMaterials"]:
        return 6.0
    if obj.get("kind") == "roof":
        return 2.0
    # The upper side of a ceiling, seen only through a stairwell from the
    # floor above.
    if obj.get("kind") == "ceiling" and obj.name.endswith("~back"):
        return 3.0
    if obj.get("strip"):
        return 1.0 / STRIP_DENSITY
    return 1.0


def bounds(obj):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def smooth_regions(me):
    """Each face's surface: the faces joined to it across edges that turn
    less than SMOOTH — a sofa cushion and its rounded edge, the flat of a
    wall — found by where the vertices are, so a vertex split for its
    normals or its texture does not part two faces. Returns a region id
    for each face."""
    key = [tuple(round(c, 4) for c in v.co) for v in me.vertices]
    parent = list(range(len(me.polygons)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    edges = {}
    for poly in me.polygons:
        vs = poly.vertices
        for i in range(len(vs)):
            a, b = key[vs[i]], key[vs[i - 1]]
            if a != b:
                edges.setdefault((a, b) if a < b else (b, a), []).append(poly.index)
    limit = math.cos(SMOOTH)
    normals = [p.normal for p in me.polygons]
    for faces in edges.values():
        for i in range(len(faces) - 1):
            a, b = faces[i], faces[i + 1]
            if normals[a].dot(normals[b]) > limit:
                ra, rb = find(a), find(b)
                if ra != rb:
                    parent[ra] = rb
    return [find(i) for i in range(len(me.polygons))]


WIDE, STRIP, THIN_FACE = 0, 1, 2


def face_classes(me):
    """What each face belongs to — a wide surface (WIDE), a narrow strip
    (STRIP) or a thin or small one (THIN_FACE). Width is judged over each
    whole surface (smooth_regions), not face by face: a ceiling is a few
    long sliver triangles, and a cushion a hundred narrow facets round its
    edge, but each is one wide surface — lit through the corners of its
    facets instead, it comes out blotched."""
    region_of = smooth_regions(me)
    regions = {}
    for poly in me.polygons:
        region = regions.setdefault(region_of[poly.index], {"area": 0.0, "lo": Vector((1e9,) * 3), "hi": Vector((-1e9,) * 3)})
        region["area"] += poly.area
        for i in poly.vertices:
            co = me.vertices[i].co
            region["lo"] = Vector(map(min, region["lo"], co))
            region["hi"] = Vector(map(max, region["hi"], co))
    kind = {}
    for r, region in regions.items():
        width = region["area"] / max((region["hi"] - region["lo"]).length, 1e-6)
        if region["area"] < SMALL or width < THIN:
            kind[r] = THIN_FACE
        elif width < STRIP_WIDTH:
            kind[r] = STRIP
        else:
            kind[r] = WIDE
    return [kind[region_of[i]] for i in range(len(me.polygons))]


def split_thin(objects):
    """Split every mesh into its wide surfaces and its narrow strips, which
    get the lightmap — the strips at STRIP_DENSITY times the texels, so a
    door casing or a skirting board is still a few texels across — and its
    thin and small ones, which get vertex lighting. Returns (lightmapped,
    vertex-lit).

    A skirting or a casing lit through its vertices takes its light from
    its ends, a few metres apart, and in between it is only a blend of
    them: a board running from a dark corner behind the bed to one behind
    a wardrobe came out grey all along a sunlit wall. In the lightmap it
    has its own light, texel by texel, like the wall above it.

    A mesh that already carries vertex colours keeps them for its own
    colour, so it stays on the lightmap whole."""
    lightmapped = []
    vertex_lit = []
    for obj in objects:
        me = obj.data
        if len(me.color_attributes):
            lightmapped.append(obj)
            continue
        classes = face_classes(me)
        if STRIP in classes and len(set(classes)) > 1:
            strip = separate_faces(obj, [c == STRIP for c in classes], "~strip")
            strip["strip"] = True
            lightmapped.append(strip)
            classes = [c for c in classes if c != STRIP]
        elif set(classes) == {STRIP}:
            obj["strip"] = True
            lightmapped.append(obj)
            continue
        if THIN_FACE not in classes:
            lightmapped.append(obj)
            continue
        if set(classes) == {THIN_FACE}:
            obj["lighting"] = "vertex"
            vertex_lit.append(obj)
            continue
        split = separate_faces(obj, [c == THIN_FACE for c in classes], "~thin")
        split["lighting"] = "vertex"
        lightmapped.append(obj)
        vertex_lit.append(split)
    for obj in lightmapped:
        obj["lighting"] = "lightmap"
    return lightmapped, vertex_lit


def separate_faces(obj, selected, suffix):
    """Move the faces flagged in `selected` into a new object of their own,
    with the same material and properties. Returns it."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    # Select exactly these faces: selection carried over from the vertices
    # would pull in every face around them.
    bm = bmesh.from_edit_mesh(obj.data)
    for element in (*bm.verts, *bm.edges, *bm.faces):
        element.select = False
    bm.faces.ensure_lookup_table()
    for face, flag in zip(bm.faces, selected):
        face.select = flag
    bm.select_flush_mode()
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    split = [o for o in bpy.context.selected_objects if o is not obj][0]
    split.name = f"{obj.name}{suffix}"
    return split


def split_twins(objects):
    """A surface seen from both sides arrives as two copies of each face,
    one facing each way. Welding would make each pair share its vertices,
    and Blender then keeps one of the pair and drops the other — a ceiling
    seen from above and below keeps only its top. So the second copies go
    into an object of their own first. Returns the objects, with those.

    For a ceiling the second copy is always its top, whichever came first
    — and every face of it looking up, twin or not: the top is seen only
    from above, in the bird's-eye view, and is baked (and given texels)
    as that."""
    out = list(objects)
    for obj in objects:
        if obj.get("kind") == "ceiling":
            turn = obj.matrix_world.to_3x3()
            second = [(turn @ poly.normal).z > 0.5 for poly in obj.data.polygons]
            if all(second):
                obj.name = f"{obj.name}~back"
            elif any(second):
                out.append(separate_faces(obj, second, "~back"))
            continue
        seen = set()
        second = []
        for poly in obj.data.polygons:
            key = tuple(sorted(tuple(round(c, 4) for c in obj.data.vertices[i].co) for i in poly.vertices))
            second.append(key in seen)
            seen.add(key)
        if any(second):
            twin = separate_faces(obj, second, "~back")
            out.append(twin)
    return out


def part_twins(objects, gap=0.003):
    """Move every reversed copy (split_twins) a few millimetres towards the
    side it is seen from, so the two copies of a two-sided surface stand
    back to back rather than in the same place. In the same place, a ray
    leaving one copy could meet the other at no distance at all, and light
    came through: the outside of a gable glowed at night with the lamp
    lit on the other side of it. Each copy is only ever seen from its own
    side, so the gap does not show."""
    for obj in objects:
        if not obj.name.endswith("~back"):
            continue
        me = obj.data
        n = len(me.vertices)
        co = np.empty(n * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(n, 3)
        facing = np.zeros_like(co)
        for poly in me.polygons:
            for i in poly.vertices:
                facing[i] += poly.normal[:]
        facing /= np.maximum(np.linalg.norm(facing, axis=1, keepdims=True), 1e-9)
        me.vertices.foreach_set("co", (co + facing * gap).ravel())
        me.update()


def weld(objects):
    """Join each mesh into whole surfaces. A wall is built in pieces round
    its openings, and where the edge of one piece runs past a corner of
    the next — a T-junction — they share no edge, so they unwrap as two
    islands, each lit a little differently, with a seam between; and a
    floor cut round a stairwell arrives as loose slivers. So edges are
    split wherever another piece's corner lies on them, then vertices on
    top of each other are joined. Loop data — normals, UVs — is kept, so
    nothing about how the faces look changes."""
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        if split_at_t_junctions(bm):
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        # A face split at a T-junction has corners in a line along the split
        # edge. Left to itself, the bake would cut it into triangles with
        # one of them flat — no area, but not in the lightmap once
        # unwrapped, where it covers a line of texels and bakes them dark:
        # a dashed line down the wall. Triangulated here, the way that
        # avoids flat triangles, before anything is unwrapped.
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="BEAUTY")
        # Faces with no area that are left — slivers along a join — go.
        bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
        flat = [f for f in bm.faces if f.calc_area() < 1e-7]
        if flat:
            bmesh.ops.delete(bm, geom=flat, context="FACES_ONLY")
        bm.to_mesh(obj.data)
        bm.free()


def split_hard_edges(objects):
    """Part every mesh along the edges sharper than SMOOTH again, after
    weld: the light baked into a vertex is one value, and the top of a sill
    and its front should each keep their own."""
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > SMOOTH]
        bmesh.ops.split_edges(bm, edges=sharp)
        bm.to_mesh(obj.data)
        bm.free()


def split_at_t_junctions(bm, tolerance=1e-4):
    """Split every open edge at the vertices that lie along it."""
    cell = 0.25
    grid = {}
    for v in bm.verts:
        grid.setdefault(tuple(int(math.floor(c / cell)) for c in v.co), []).append(v)
    plan = []
    for edge in bm.edges:
        if not edge.is_boundary:
            continue
        a, b = edge.verts
        span = b.co - a.co
        length2 = span.length_squared
        if length2 < 1e-10:
            continue
        lo = [int(math.floor((min(a.co[i], b.co[i]) - tolerance) / cell)) for i in range(3)]
        hi = [int(math.floor((max(a.co[i], b.co[i]) + tolerance) / cell)) for i in range(3)]
        found = []
        for x in range(lo[0], hi[0] + 1):
            for y in range(lo[1], hi[1] + 1):
                for z in range(lo[2], hi[2] + 1):
                    for v in grid.get((x, y, z), ()):
                        if v is a or v is b:
                            continue
                        t = (v.co - a.co).dot(span) / length2
                        if 1e-4 < t < 1 - 1e-4 and (a.co + span * t - v.co).length < tolerance:
                            found.append(t)
        if found:
            plan.append((edge, a, sorted(set(round(t, 6) for t in found))))
    for edge, start, fractions in plan:
        done = 0.0
        for fraction in fractions:
            far = edge.other_vert(start)
            new_edge, vert = bmesh.utils.edge_split(edge, start, (fraction - done) / (1 - done))
            edge = new_edge if far in new_edge.verts else edge
            start, done = vert, fraction
    return len(plan)


def unwrap(objects, settings, size):
    """A second UV set on every object, packed into one shared atlas.

    Cut where the surface turns sharply — the corner of a room, the edge
    of a box: the light changes there anyway, and a texel straddling the
    corner would carry one face's light onto the other. Anywhere a curved
    surface still has to be cut to lie flat, the cuts smart projection
    would make. Then each piece is relaxed flat with as little stretch as
    it will take (Blender's minimum-stretch unwrap), so a texel covers the
    same few square centimetres everywhere on it, and scaled so every
    piece has the same texels per square metre — bar the ground outside,
    and the roof, which get fewer."""
    weld(objects)
    for obj in objects:
        uv = obj.data.uv_layers.new(name=LIGHTMAP_UV)
        obj.data.uv_layers.active = uv

    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    # With no UV editor open, UVs count as selected only through the mesh.
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    t = time.time()
    bpy.ops.mesh.select_mode(type="EDGE")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=SMOOTH)
    bpy.ops.mesh.mark_seam(clear=False)
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(89), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.seams_from_islands(mark_seams=True, mark_sharp=False)
    bpy.ops.uv.unwrap(method="MINIMUM_STRETCH", fill_holes=True, correct_aspect=True, margin=0.0)
    # Every island at the same texels per square metre...
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    log("unwrapped", round(time.time() - t, 1), "s;", stretch_report(objects))

    # ...then fewer for the ground outside and the roof.
    for obj in objects:
        scale = 1.0 / density(obj, settings)
        if scale == 1.0:
            continue
        data = obj.data.uv_layers[LIGHTMAP_UV].data
        coords = np.empty(len(data) * 2, dtype=np.float32)
        data.foreach_get("uv", coords)
        data.foreach_set("uv", coords * scale)

    # Packed square to the atlas, each island turned to lie along it: a
    # wall's edge, or a shadow along a skirting, then runs along a row of
    # texels rather than across them in steps.
    t = time.time()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, rotate_method="AXIS_ALIGNED", scale=True, margin_method="FRACTION",
                            margin=MARGIN / size, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    log("packed", round(time.time() - t, 1), "s")


def stretch_report(objects):
    """How evenly the unwrap spreads texels: the share of the surface whose
    texels per square metre are within a fifth of the usual, and the worst
    tenth's."""
    ratios, areas = [], []
    for obj in objects:
        me = obj.data
        uvs = me.uv_layers[LIGHTMAP_UV].data
        for poly in me.polygons:
            if poly.area < 1e-8:
                continue
            loop = [uvs[i].uv for i in poly.loop_indices]
            uv_area = abs(sum(loop[i].x * loop[i - 1].y - loop[i - 1].x * loop[i].y for i in range(len(loop)))) / 2
            ratios.append(uv_area / poly.area)
            areas.append(poly.area)
    ratios, areas = np.array(ratios), np.array(areas)
    typical = np.median(ratios[ratios > 0]) if ratios.size else 1
    r = ratios / typical
    even = areas[(r > 0.8) & (r < 1.25)].sum() / areas.sum()
    return f"{even * 100:.1f}% of the surface within 20% of even texel density"


def texel_size(objects, size):
    """Metres per texel for the house, as packed: its surface area over the
    atlas area its islands took."""
    area = 0.0
    uv_area = 0.0
    for obj in objects:
        if density_hint(obj) != 1.0:
            continue
        me = obj.data
        uvs = me.uv_layers[LIGHTMAP_UV].data
        for poly in me.polygons:
            area += poly.area
            loop = [uvs[i].uv for i in poly.loop_indices]
            uv_area += abs(sum(loop[i].x * loop[i - 1].y - loop[i - 1].x * loop[i].y for i in range(len(loop)))) / 2
    return math.sqrt(area / max(uv_area * size * size, 1))


def density_hint(obj):
    return obj.get("_density", 1.0)


# ---------------------------------------------------------------------
# Lighting
# ---------------------------------------------------------------------

def srgb(hex_color):
    """A #rrggbb colour as linear RGB."""
    c = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]


def world(zenith, horizon, ground, strength):
    """A sky that is brighter overhead than at the horizon, over a ground
    colour below it — what lights a room through its windows."""
    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    coords = nt.nodes.new("ShaderNodeTexCoord")
    split = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    elements = ramp.color_ramp.elements
    elements[0].position = 0.45
    elements[0].color = (*ground, 1)
    elements[1].position = 1.0
    elements[1].color = (*zenith, 1)
    mid = elements.new(0.52)
    mid.color = (*horizon, 1)
    remap = nt.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1
    remap.inputs["From Max"].default_value = 1
    # For a world, Generated is the direction looked in: Z runs -1 (down) to 1.
    nt.links.new(coords.outputs["Generated"], split.inputs["Vector"])
    nt.links.new(split.outputs["Z"], remap.inputs["Value"])
    nt.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def sun(name, position, color, strength, angle=1.0):
    """A sun shining from `position` (the app's Y-up axes) towards the origin."""
    data = bpy.data.lights.new(name, "SUN")
    data.energy = strength
    data.color = color
    data.angle = math.radians(angle)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    x, y, z = position
    direction = Vector((x, -z, y)).normalized()
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def room_lights(rooms, power_per_m2, color):
    """A light in every room, where the app hangs its own: a bulb a little
    below the ceiling, brighter in a bigger room. A bulb rather than a
    downlight, so the ceiling is lit too — as it is in a real room, and far
    less noisily than by bounce light alone."""
    for room in rooms:
        data = bpy.data.lights.new(f"light:{room['id']}", "POINT")
        data.shadow_soft_size = 0.12
        data.energy = max(40.0, room["area"] * power_per_m2)
        data.color = color
        obj = bpy.data.objects.new(data.name, data)
        bpy.context.scene.collection.objects.link(obj)
        x, y, z = room["light"]
        obj.location = (x, -z, y - 0.3)


def portals(openings):
    """A portal over every opening in an outside wall, facing in
    (scripts/bake-public.mjs finds them): not a light, but where Cycles is
    told the sky comes in, so that light from outside is sampled through
    the windows rather than found by chance — the difference between a
    room lit through its windows coming out clean or blotched."""
    for opening in openings:
        data = bpy.data.lights.new(f"portal:{opening['id']}", "AREA")
        data.shape = "RECTANGLE"
        data.size = opening["width"]
        data.size_y = opening["height"]
        data.cycles.is_portal = True
        obj = bpy.data.objects.new(data.name, data)
        bpy.context.scene.collection.objects.link(obj)
        x, y, z = opening["position"]
        obj.location = (x, -z, y)
        nx, _, nz = opening["normal"]
        # An area light faces down its -Z; its Y is the opening's height.
        obj.rotation_euler = Vector((nx, -nz, 0)).to_track_quat("-Z", "Y").to_euler()


def light(variant, settings):
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    portals(settings.get("portals", []))
    preset = settings["preset"]
    if variant == "day":
        sky = srgb(preset["hemi"]["sky"])
        world(zenith=sky, horizon=srgb(preset["background"]), ground=srgb(preset["hemi"]["ground"]),
              strength=settings["day"]["sky"])
        sun("sun", preset["sun"]["position"], srgb(preset["sun"]["color"]), settings["day"]["sun"])
        room_lights(settings["rooms"], settings["day"]["lights"], srgb("#ffe2bf"))
    else:
        world(zenith=srgb("#1a2440"), horizon=srgb("#2a3350"), ground=srgb("#0c0d10"),
              strength=settings["night"]["sky"])
        sun("moon", [-9, 16, -6], srgb("#b8c8ff"), settings["night"]["moon"], angle=0.6)
        room_lights(settings["rooms"], settings["night"]["lights"], srgb("#ffd6a3"))


# ---------------------------------------------------------------------
# Baking
# ---------------------------------------------------------------------

def use_gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == kind]
        if devices:
            for d in prefs.devices:
                d.use = d.type == kind
            bpy.context.scene.cycles.device = "GPU"
            log("device", kind, ", ".join(d.name for d in devices))
            return
    log("device CPU")


def prepare_materials(objects, image):
    """Point every material's bake at the shared lightmap, through the
    lightmap UVs. The image node is left unconnected: it is only where the
    bake writes."""
    for obj in objects:
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None:
                continue
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            for node in [n for n in nodes if n.name.startswith("lightmap")]:
                nodes.remove(node)
            uv = nodes.new("ShaderNodeUVMap")
            uv.name = "lightmap-uv"
            uv.uv_map = LIGHTMAP_UV
            tex = nodes.new("ShaderNodeTexImage")
            tex.name = "lightmap-image"
            tex.image = image
            mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            nodes.active = tex
        if not obj.material_slots:
            mat = bpy.data.materials.new(f"{obj.name}-bake")
            obj.data.materials.append(mat)
            prepare_materials([obj], image)


def cycles(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    # Light carried round a house: through a door, off a wall, onto a floor,
    # and on round the corner — between white walls it takes a good many
    # bounces before a corner or the space under the stairs is as light as
    # it would be.
    scene.cycles.max_bounces = 10
    scene.cycles.diffuse_bounces = 8
    scene.cycles.glossy_bounces = 2
    scene.cycles.transparent_max_bounces = 4
    # Light bounced off something shiny, focused: the odd very bright
    # sample, which no amount of denoising takes out cleanly.
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0
    scene.cycles.sample_clamp_indirect = 10.0
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


@contextmanager
def as_one(objects):
    """Bake a set of objects as one. Blender bakes the objects selected one
    after another, with the best part of a second of setting up for each —
    over a minute a bake for a house's hundred-odd meshes, whatever the
    size of the bake. So they are copied, joined into one mesh, and baked
    as that, with the originals kept out of the render meanwhile so each
    surface is there once. The copy is thrown away afterwards; the images
    it bakes into are the originals' own, through their shared materials
    and UVs."""
    copies = []
    for obj in objects:
        copy = obj.copy()
        copy.data = obj.data.copy()
        bpy.context.scene.collection.objects.link(copy)
        copies.append(copy)
    bpy.ops.object.select_all(action="DESELECT")
    for copy in copies:
        copy.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    joined = copies[0]
    # In the house's own space, so object-space normals are the world's.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if LIGHTMAP_UV in joined.data.uv_layers:
        joined.data.uv_layers.active = joined.data.uv_layers[LIGHTMAP_UV]
    hidden = [obj.hide_render for obj in objects]
    for obj in objects:
        obj.hide_render = True
    try:
        yield joined
    finally:
        for obj, was in zip(objects, hidden):
            obj.hide_render = was
        mesh = joined.data
        bpy.data.objects.remove(joined, do_unlink=True)
        bpy.data.meshes.remove(mesh)


RAYS = ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow")


@contextmanager
def roof_lifted(objects):
    """The roof, gables and all, out of the way of every ray meanwhile."""
    roof = [obj for obj in objects if obj.get("kind") == "roof"]
    saved = [(obj, [getattr(obj, ray) for ray in RAYS]) for obj in roof]
    for obj in roof:
        for ray in RAYS:
            setattr(obj, ray, False)
    try:
        yield
    finally:
        for obj, values in saved:
            for ray, value in zip(RAYS, values):
                setattr(obj, ray, value)


def island_core(objects, size, reach=3):
    """The texels of the objects' islands and the few just round them, for
    a pass over some islands to be copied into the lightmap without its
    margins reaching over the islands next to them."""
    global MARGIN
    saved, MARGIN = MARGIN, 1
    try:
        _, core = bake_guides(objects, size)
    finally:
        MARGIN = saved
    for _ in range(reach):
        core |= grow(core)
    return core


def bake_image(objects, image, **bake):
    """Bake into an image through the objects' lightmap UVs, as one."""
    prepare_materials(objects, image)
    with as_one(objects) as joined:
        select_only([joined])
        bpy.ops.object.bake(target="IMAGE_TEXTURES", margin=MARGIN, margin_type="EXTEND", use_clear=True, **bake)


def bake_pass(objects, size, samples, parts):
    """One pass of the light on every wide face, as an array."""
    image = bpy.data.images.new("lightmap-pass", size, size, float_buffer=True, alpha=False)
    cycles(samples)
    bake_image(objects, image, type="DIFFUSE", pass_filter=parts)
    rgb = pixels_of(image)
    bpy.data.images.remove(image)
    return rgb


def bake_lightmap(objects, variant, size, samples, written, covered, normal, debug=None):
    """The light on every wide face, denoised, as an array.

    Baked in two passes. The light straight from the sun, the sky and the
    lamps has the sharp edges — a window's shadow on the floor — but little
    grain, so it is baked at the lightmap's full size with a quarter of the
    samples. The light bounced off everything else has the grain — the
    sunlit patch of floor, found only now and then by a ray from across
    the room, is most of it — but changes slowly across a surface, so it is
    baked at half the size with four times the samples, for the same time:
    four times the samples a texel, half the grain. Each is denoised, and
    the bounced light scaled up to go with the other.

    Covered texels, and the empty atlas round the islands, are filled from
    the light round them first (spread)."""
    t = time.time()
    direct = bake_pass(objects, size, max(32, samples // 4), {"DIRECT"})
    bounced = bake_pass(objects, size // 2, samples * 4, {"INDIRECT"})
    log(variant, "lightmap baked", round(time.time() - t, 1), "s")

    valid = written & ~covered
    direct = denoise(spread(direct, valid), normal)
    valid_half = shrink(valid, every=True)
    normal_half = spread(half(normal), shrink(written))
    bounced = denoise(spread(bounced, valid_half), normal_half)
    if debug:
        save_exr(direct, f"{debug}-direct.exr")
        save_exr(bounced, f"{debug}-bounced.exr")
    return direct + double(bounced)


def shrink(mask, every=False):
    """A mask at half the size: true where any of the four texels is — or,
    with `every`, where all four are."""
    h, w = mask.shape
    blocks = mask.reshape(h // 2, 2, w // 2, 2)
    return blocks.all(axis=(1, 3)) if every else blocks.any(axis=(1, 3))


def double(rgb):
    """A lightmap at twice the size, each texel blended from the four
    nearest of the smaller one as the GPU would."""
    def along(a, axis):
        a = np.moveaxis(a, axis, 0)
        before = np.concatenate([a[:1], a[:-1]])
        after = np.concatenate([a[1:], a[-1:]])
        out = np.empty((a.shape[0] * 2,) + a.shape[1:], dtype=a.dtype)
        out[0::2] = 0.75 * a + 0.25 * before
        out[1::2] = 0.75 * a + 0.25 * after
        return np.moveaxis(out, 0, axis)
    return along(along(rgb, 0), 1)


def surroundings(objects):
    """Every face in the scene, in world space, for asking what a point is
    close to; and the object each face belongs to, by its index there."""
    verts, polys, owners = [], [], []
    for obj in objects:
        m = obj.matrix_world
        base = len(verts)
        verts.extend(m @ v.co for v in obj.data.vertices)
        polys.extend(tuple(base + i for i in p.vertices) for p in obj.data.polygons)
        owners.extend([obj] * len(obj.data.polygons))
    return BVHTree.FromPolygons(verts, polys), owners


# Directions over a hemisphere about +Z, evenly spread.
HEMISPHERE = [
    Vector((math.sqrt(1 - z * z) * math.cos(i * 2.39996), math.sqrt(1 - z * z) * math.sin(i * 2.39996), z))
    for i, z in ((i, (i + 0.5) / 24) for i in range(24))
]


# How finely what is round a long edge is looked at, how far, and how much
# it must change along the edge to be worth a vertex there.
SPLIT_STEP = 0.25
SPLIT_REACH = 0.5
SPLIT_TOLERANCE = 0.25
SPLIT_GAP = 1.5


def occlusion(tree, point, turn):
    """The share of a point's hemisphere (HEMISPHERE turned by `turn`) that
    something closes off within SPLIT_REACH: next to none in the open,
    more beside a bookcase, all of it inside a wall."""
    closed = 0
    for direction in HEMISPHERE:
        if tree.ray_cast(point, turn @ direction, SPLIT_REACH)[0] is not None:
            closed += 1
    return closed / len(HEMISPHERE)


def median3(values):
    """Each value replaced by the median of it and its two neighbours."""
    out = []
    for i in range(len(values)):
        window = sorted(values[max(0, i - 1): i + 2])
        out.append(window[len(window) // 2])
    return out


def simplify(samples, tolerance):
    """Douglas–Peucker over (position, value) samples: the positions between
    the first and the last to keep, so that straight lines between kept
    ones stay within `tolerance` of every value — as vertex light, drawn
    straight between vertices, would."""
    if len(samples) < 3:
        return []
    (t0, v0), (t1, v1) = samples[0], samples[-1]
    worst, at = tolerance, None
    for i in range(1, len(samples) - 1):
        t, v = samples[i]
        off = abs(v - (v0 + (v1 - v0) * (t - t0) / (t1 - t0)))
        if off > worst:
            worst, at = off, i
    if at is None:
        return []
    return simplify(samples[: at + 1], tolerance) + [samples[at][0]] + simplify(samples[at:], tolerance)


def split_long_edges(objects, tree, owners, longer=1.0, offset=0.01, margin=0.1):
    """Put vertices along the long edges of the vertex-lit meshes wherever
    the light along them is likely to change, so it is sampled either side.

    A skirting is built the whole length of its wall — through the walls
    that meet it and on past whatever stands against it — with vertices
    only at its two ends; lit through those, ten metres of it took the
    light inside the walls at its ends, or behind a bookcase in a corner.
    So an edge is split where it passes into or out of something,
    a partition wall or a cabinet; and between those, where what is round
    it changes — along the side of a bookcase standing off the wall — as
    judged from how much of the view is closed off close by, every
    SPLIT_STEP along it. Only changes get vertices, not every step, so it
    costs a few triangles where the light changes and few where it does
    not — though never fewer than one every SPLIT_GAP.

    A mesh crossing itself is left alone — that is a mitred corner, or the
    next run of the same moulding, and the wall they meet at is crossed
    too — as is anything within `margin` of an edge's ends, which its end
    vertices are sampled clear of anyway. `owners` names the object of
    each face in `tree`. Returns how many triangles that added."""
    added = 0
    for obj in objects:
        m = obj.matrix_world
        rotation = m.to_3x3()
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        before = len(bm.faces)
        plan = []
        for edge in bm.edges:
            if edge.calc_length() < longer or not edge.link_faces:
                continue
            a, b = edge.verts
            # Along the edge, just off the faces it joins, since the edge
            # itself runs along their surface.
            normal = sum((f.normal for f in edge.link_faces), Vector())
            normal = normal.normalized() if normal.length > 1e-6 else Vector((0, 0, 1))
            start = m @ (a.co + normal * offset)
            span = m @ (b.co + normal * offset) - start
            total = span.length
            direction = span / total

            crossings, travelled = [], 0.0
            while travelled < total:
                location, _normal, index, distance = tree.ray_cast(start + direction * travelled, direction, total - travelled)
                if location is None:
                    break
                travelled += distance
                if (owners[index] is not obj and margin < travelled < total - margin
                        and (not crossings or travelled - crossings[-1] > 0.02)):
                    crossings.append(travelled)
                travelled += 1e-3

            cuts = list(crossings)
            turn = (rotation @ normal).normalized().to_track_quat("Z", "Y")
            bounds = [0.0] + crossings + [total]
            for lo, hi in zip(bounds, bounds[1:]):
                if hi - lo < 2 * SPLIT_STEP:
                    continue
                inset = min(0.05, (hi - lo) / 4)
                steps = max(2, round((hi - lo - 2 * inset) / SPLIT_STEP))
                positions = [lo + inset + (hi - lo - 2 * inset) * k / steps for k in range(steps + 1)]
                # A median of three passes over the leg of a chair: what is
                # worth a vertex is a change that lasts.
                closed = median3([occlusion(tree, start + direction * t, turn) for t in positions])
                cuts.extend(simplify(list(zip(positions, closed)), SPLIT_TOLERANCE))

            # And never more than SPLIT_GAP apart, whatever was found:
            # light changes along a wall that nothing round the edge says
            # it will — a patch of sun, a lamp.
            marks = sorted([0.0] + cuts + [total])
            for lo, hi in zip(marks, marks[1:]):
                extra = math.ceil((hi - lo) / SPLIT_GAP) - 1
                cuts.extend(lo + (hi - lo) * (k + 1) / (extra + 1) for k in range(max(0, extra)))

            kept = []
            for t in sorted(cuts):
                if 0.02 < t < total - 0.02 and (not kept or t - kept[-1] > 0.02):
                    kept.append(t)
            if kept:
                plan.append((edge, a, [t / total for t in kept]))
        for edge, start, fractions in plan:
            done = 0.0
            for fraction in fractions:
                far = edge.other_vert(start)
                new_edge, vert = bmesh.utils.edge_split(edge, start, (fraction - done) / (1 - done))
                edge = new_edge if far in new_edge.verts else edge
                start, done = vert, fraction
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
        added += len(bm.faces) - before
        bm.to_mesh(obj.data)
        bm.free()
    return added


def enclosed(tree, point, normal):
    """The share of rays from a point, over the hemisphere it faces, that
    hit the back of a face: most of them inside a wall or a closed box,
    next to none in a room."""
    turn = normal.to_track_quat("Z", "Y")
    back = 0
    for direction in HEMISPHERE:
        direction = turn @ direction
        location, face_normal, _index, _distance = tree.ray_cast(point, direction, 5.0)
        if location is not None and face_normal.dot(direction) > 0:
            back += 1
    return back / len(HEMISPHERE)


def sample_points(obj, tree, offset=0.01, clearance=0.008):
    """Where each of a mesh's vertices has its light sampled: not the crack
    it sits in — a skirting's bottom edge is on the floor, its top against
    the wall, and its ends in the corners of the room, or, run to the
    walls' centre lines, inside the walls at either end; sampled exactly
    there, the whole board comes out black.

    Each vertex goes a centimetre out from its faces and in along them,
    towards their middle — a quarter of the way, up to 15 cm, and further
    in steps while it is still inside something solid: the two ends of a
    long strip light the whole of it. Then it is moved off anything else
    it is still within `clearance` of, a floor or a wall, a few times over
    to settle into corners. Faces turned away from the vertex's own are
    left alone there: they are the far side of something thin, not
    something it touches.

    Returns (points, facing): world positions, and the way the vertex's
    faces face, one row each per vertex."""

    def settle(point, facing, origin):
        for _ in range(4):
            settled = True
            for location, face_normal, _index, _distance in tree.find_nearest_range(point, clearance * 1.5):
                # Only what the vertex is in front of: not the far side of
                # something thin, nor the underside of a floor it stands on.
                if face_normal.dot(facing) < -0.9 or (origin - location).dot(face_normal) < -0.002:
                    continue
                height = (point - location).dot(face_normal)
                if height < clearance:
                    point = point + face_normal * (clearance - height)
                    settled = False
            if settled:
                break
        return point

    me = obj.data
    m = obj.matrix_world
    rotation = m.to_3x3()
    points = np.zeros((len(me.vertices), 3), dtype=np.float32)
    facings = np.zeros((len(me.vertices), 3), dtype=np.float32)
    facings[:, 2] = 1
    bm = bmesh.new()
    bm.from_mesh(me)
    for v in bm.verts:
        points[v.index] = m @ v.co
        if not v.link_faces:
            continue
        normal = sum((f.normal * f.calc_area() for f in v.link_faces), Vector())
        normal = normal.normalized() if normal.length > 1e-9 else v.normal
        facing = (rotation @ normal).normalized()
        # Towards the middle of its faces, the big ones counting most: a
        # vertex where an edge was cut at a wall's face has a sliver of
        # face inside the wall and a long one out in the room.
        area = sum(f.calc_area() for f in v.link_faces)
        if area > 1e-12:
            along = sum((f.calc_center_median() * f.calc_area() for f in v.link_faces), Vector()) / area - v.co
        else:
            along = sum((f.calc_center_median() for f in v.link_faces), Vector()) / len(v.link_faces) - v.co
        length = along.length
        along = along.normalized() if length > 1e-6 else Vector()
        best = None
        for step, share in ((0.15, 0.25), (0.3, 0.5), (0.6, 0.5), (1.2, 0.5)):
            distance = min(step, length * share)
            point = settle(m @ (v.co + normal * offset + along * distance), facing, m @ v.co)
            inside = enclosed(tree, point, facing)
            if best is None or inside < best[0]:
                best = (inside, point)
            if inside < 0.25 or distance < step:
                break
        points[v.index] = best[1]
        facings[v.index] = facing
    bm.free()
    return points, facings


def vertex_probes(objects, tree, size=0.002):
    """What the light of the thin faces' vertices is baked on: a tiny
    triangle at each vertex's sampling point (sample_points), facing the
    way its faces do, all in one object that no ray sees.

    Baking the vertices themselves meant moving them to where they are
    sampled — and the mesh moved with them, so each sample sat on its own
    displaced surface, folded where the vertices had been pulled along
    it, half in its own shadow: the skirting came out at half the light
    of the wall above it. The probes leave the geometry where it is.

    Returns the probe object and how many vertices each object has, in
    order, for bake_vertices to hand the light back."""
    points, facings, counts = [], [], []
    for obj in objects:
        p, f = sample_points(obj, tree)
        points.append(p)
        facings.append(f)
        counts.append(len(p))
    points = np.concatenate(points)
    facings = np.concatenate(facings)
    # Two directions across each facing, for the triangle's corners.
    up = np.where(np.abs(facings[:, 2:3]) > 0.9, [[1.0, 0.0, 0.0]], [[0.0, 0.0, 1.0]])
    across = np.cross(facings, up)
    across /= np.linalg.norm(across, axis=1, keepdims=True)
    other = np.cross(facings, across)
    corners = np.stack([
        points + size * across,
        points + size * (-0.5 * across + 0.866 * other),
        points + size * (-0.5 * across - 0.866 * other),
    ], axis=1).reshape(-1, 3)
    faces = np.arange(len(corners)).reshape(-1, 3)
    me = bpy.data.meshes.new("vertex-probes")
    me.from_pydata(corners.tolist(), [], faces.tolist())
    me.update()
    for name in VERTEX_ATTRIBUTES.values():
        me.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
    probe = bpy.data.objects.new("vertex-probes", me)
    bpy.context.scene.collection.objects.link(probe)
    for ray in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(probe, ray, False)
    return probe, counts




def bake_vertices(objects, probe, counts, variant, samples):
    """The light at every vertex of the thin faces, into that variant's
    vertex attribute: baked on the probes (vertex_probes), each probe's
    three corners averaged, and handed back to the vertex it stands for."""
    name = VERTEX_ATTRIBUTES[variant]
    cycles(samples)
    t = time.time()
    attributes = probe.data.color_attributes
    attributes.active_color = attributes[name]
    select_only([probe])
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, target="VERTEX_COLORS")
    light = np.empty(len(probe.data.vertices) * 4, dtype=np.float32)
    attributes[name].data.foreach_get("color", light)
    light = light.reshape(-1, 3, 4).mean(axis=1)
    start = 0
    for obj, count in zip(objects, counts):
        obj.data.color_attributes[name].data.foreach_set("color", light[start:start + count].ravel())
        start += count
    log(variant, "vertices baked", round(time.time() - t, 1), "s")


def smooth_vertex_light(objects, name, rounds=3):
    """Take the grain out of the light baked into vertices. Each was baked
    on its own, with its own noise, and nothing denoises them — so each is
    blended with its neighbours on the same surface (along edges and across
    split vertices, where the faces face much the same way), a few times
    over. Light across a surface changes slowly; the noise does not."""
    for obj in objects:
        me = obj.data
        n = len(me.vertices)
        if n == 0 or name not in me.color_attributes:
            continue
        data = me.color_attributes[name].data
        light = np.empty(n * 4, dtype=np.float32)
        data.foreach_get("color", light)
        light = light.reshape(n, 4)
        normals = np.empty(n * 3, dtype=np.float32)
        me.vertex_normals.foreach_get("vector", normals)
        normals = normals.reshape(n, 3)
        co = np.empty(n * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        pairs = np.empty(len(me.edges) * 2, dtype=np.int64)
        me.edges.foreach_get("vertices", pairs)
        pairs = pairs.reshape(-1, 2)
        # Vertices split where the faces' normals or UVs part: the same
        # point, so the same light.
        keys = np.round(co.reshape(n, 3) / 1e-4).astype(np.int64)
        _, group = np.unique(keys, axis=0, return_inverse=True)
        order = np.argsort(group, kind="stable")
        same = order[1:][group[order[1:]] == group[order[:-1]]]
        before = order[:-1][group[order[1:]] == group[order[:-1]]]
        pairs = np.concatenate([pairs, np.stack([before, same], axis=1)])
        alike = np.einsum("ij,ij->i", normals[pairs[:, 0]], normals[pairs[:, 1]]) > 0.8
        pairs = pairs[alike]
        for _ in range(rounds):
            total = light[:, :3].copy()
            count = np.ones(n, dtype=np.float32)
            np.add.at(total, pairs[:, 0], light[pairs[:, 1], :3])
            np.add.at(total, pairs[:, 1], light[pairs[:, 0], :3])
            np.add.at(count, pairs[:, 0], 1)
            np.add.at(count, pairs[:, 1], 1)
            light[:, :3] = 0.5 * light[:, :3] + 0.5 * total / count[:, None]
        data.foreach_set("color", light.ravel())


def add_probes(probes):
    """A small square facing out from each side of every door, at handle
    height and a hand's width off the leaf, whose baked light the public
    view tints that door with: a door leaf moves, so it cannot be baked,
    but it can be lit like the air around it."""
    objects = []
    for probe in probes:
        for side, (normal, position) in enumerate(zip(probe["normals"], probe["positions"])):
            bm = bmesh.new()
            n = Vector((normal[0], -normal[2], normal[1]))
            c = Vector((position[0], -position[2], position[1]))
            tangent = n.cross(Vector((0, 0, 1)))
            if tangent.length < 1e-6:
                tangent = Vector((1, 0, 0))
            tangent.normalize()
            up = tangent.cross(n).normalized()
            size = 0.05
            verts = [bm.verts.new(c + (tangent * sx + up * sy) * size) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            face = bm.faces.new(verts)
            face.normal_update()
            if face.normal.dot(n) < 0:
                face.normal_flip()
            me = bpy.data.meshes.new(f"probe:{probe['id']}:{side}")
            bm.to_mesh(me)
            bm.free()
            obj = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(obj)
            obj["probe"] = probe["id"]
            obj["side"] = side
            obj.data.materials.append(probe_material())
            objects.append(obj)
    return objects


def probe_material():
    mat = bpy.data.materials.get("probe") or bpy.data.materials.new("probe")
    return mat


def read_probes(objects, variant):
    """Each door's baked light, as the average of its two sides."""
    name = VERTEX_ATTRIBUTES[variant]
    by_door = {}
    for obj in objects:
        data = obj.data.color_attributes[name].data
        rgb = np.array([list(d.color)[:3] for d in data]).mean(axis=0)
        by_door.setdefault(obj["probe"], []).append(rgb)
    return {door: [round(float(v), 4) for v in np.mean(sides, axis=0)] for door, sides in by_door.items()}


def bake_guides(objects, size):
    """What the denoiser is told about the lightmap besides its light, once
    for every variant: the surface's direction at each texel — so it can
    tell an edge in the geometry from noise — and which texels belong to
    a surface at all. Returns (normal, written), arrays of the lightmap's
    size.

    Not the surfaces' colour, which a denoiser is usually given too: a
    lightmap holds light alone, colour already divided out, and a colour
    edge the light does not have only misleads it."""
    image = bpy.data.images.new("lightmap-normal", size, size, float_buffer=True, alpha=False)
    cycles(4)
    t = time.time()
    bake_image(objects, image, type="NORMAL", normal_space="OBJECT")
    raw = pixels_of(image)
    written = raw.sum(axis=2) > 0
    # Baked normals are stored as colours, 0..1; the denoiser wants -1..1.
    normal = raw * 2 - 1
    bpy.data.images.remove(image)
    log("guides baked", round(time.time() - t, 1), "s")
    return normal, written


# Anything this close over a texel covers it.
COVERED_DISTANCE = 0.03


def bake_coverage(objects, size):
    """Which lightmap texels something sits on: the wall behind a door
    frame or a skirting board, the floor under a cupboard's plinth. Nobody
    sees them, but they are baked black, and a texel's light is blended
    with its neighbours' when drawn — so every frame and skirting got a
    dark line round it on the wall, a texel wide. An occlusion bake with a
    reach of a few centimetres finds them, once for every variant.

    Returns a boolean array, one per texel, true where covered."""
    image = bpy.data.images.new("lightmap-coverage", size, size, float_buffer=True, alpha=False)
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("coverage")
    scene.world.light_settings.distance = COVERED_DISTANCE
    cycles(16)
    t = time.time()
    bake_image(objects, image, type="AO")
    px = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    covered = px.reshape(size, size, 4)[:, :, 0] < 0.2
    log("coverage baked", round(time.time() - t, 1), "s")
    return covered


def bake_hidden(objects, size, solids):
    """Which lightmap texels are inside the house's own solid parts, from
    the spec (scripts/bake-public.mjs lists them): inside a wall — each is
    built to the middle of the next, so a wall's face runs on past every
    corner into the wall across it — or in the slab between a ceiling and
    the floor above, where an outside wall's inner face carries on up past
    the ceiling. Nobody sees them, but they keep what little light gets in,
    and the texel at the corner is blended with them when drawn — and baked
    partly from them, a texel's samples spread across it: every corner and
    every ceiling's edge got a dark line along it. The inside of a wall is
    hollow, so bake_coverage finds nothing sitting on them.

    Only the house's own solids: a sofa or a table has no inside worth the
    name to find, and the snapshot keeps no underside of it to see.

    Returns a boolean array, one per texel, true where hidden."""
    image = bpy.data.images.new("lightmap-position", size, size, float_buffer=True, alpha=False)
    cycles(1)
    t = time.time()
    bake_image(objects, image, type="POSITION")
    raw = pixels_of(image)
    bpy.data.images.remove(image)
    # In the app's axes: Blender's (x, y, z) is the app's (x, -z, y).
    x, y, z = raw[:, :, 0], raw[:, :, 2], -raw[:, :, 1]
    hidden = np.zeros(x.shape, dtype=bool)

    for box in solids.get("walls", []):
        (sx, sz), (dx, dz) = box["start"], box["direction"]
        near = (y > box["bottom"]) & (y < box["top"])
        idx = np.nonzero(near)
        rx, rz = x[idx] - sx, z[idx] - sz
        along = rx * dx + rz * dz
        across = rz * dx - rx * dz
        inside = (along > box["from"]) & (along < box["to"]) & (np.abs(across) < box["half"])
        hidden[idx[0][inside], idx[1][inside]] = True

    for slab in solids.get("slabs", []):
        near = (y > slab["bottom"]) & (y < slab["top"])
        idx = np.nonzero(near)
        px, pz = x[idx], z[idx]
        # An outside wall's face is on the room's edge, so a centimetre
        # past the edge counts; a stairwell's opening, and the centimetre
        # round it, where the slab's edge is seen, does not.
        inside = in_polygon(px, pz, slab["polygon"], 0.01)
        for hole in slab.get("holes", []):
            inside &= ~in_polygon(px, pz, hole, 0.01)
        hidden[idx[0][inside], idx[1][inside]] = True

    log("hidden texels found", round(time.time() - t, 1), "s")
    return hidden


def in_polygon(x, z, polygon, margin=0.0):
    """Which of the points (x, z) are inside a polygon, or within `margin`
    of its edge."""
    inside = np.zeros(x.shape, dtype=bool)
    close = np.zeros(x.shape, dtype=bool)
    n = len(polygon)
    for i in range(n):
        (xi, zi), (xj, zj) = polygon[i], polygon[i - 1]
        crosses = (zi > z) != (zj > z)
        with np.errstate(divide="ignore", invalid="ignore"):
            at = (xj - xi) * (z - zi) / (zj - zi) + xi
        inside ^= crosses & (x < at)
        if margin:
            ex, ez = xj - xi, zj - zi
            length2 = ex * ex + ez * ez or 1e-12
            k = np.clip(((x - xi) * ex + (z - zi) * ez) / length2, 0, 1)
            close |= (x - xi - k * ex) ** 2 + (z - zi - k * ez) ** 2 < margin * margin
    return inside | close


def grow(mask):
    """The texels next to the mask's, not in it."""
    out = np.zeros_like(mask)
    h, w = mask.shape
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] |= \
                    mask[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out & ~mask


def pixels_of(image):
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[:, :, :3].copy()


def set_pixels(image, rgb):
    h, w, _ = rgb.shape
    out = np.ones((h, w, 4), dtype=np.float32)
    out[:, :, :3] = rgb
    image.pixels.foreach_set(out.ravel())


def save_exr(rgb, path):
    h, w, _ = rgb.shape
    image = bpy.data.images.new(os.path.basename(path), w, h, float_buffer=True, alpha=False)
    set_pixels(image, rgb)
    image.filepath_raw = path
    image.file_format = "OPEN_EXR"
    image.save()
    bpy.data.images.remove(image)


def spread(values, valid, reach=32):
    """Fill every texel that is not `valid` from the nearest ones that are,
    a texel at a time, `reach` texels out: the covered texels of a surface
    from the uncovered ones round them, and the empty atlas round every
    island from its edge — so the denoiser, which looks well beyond any one
    texel, sees each island carry on past its edge rather than stop dead
    against black."""
    out = values.copy()
    valid = valid.copy()
    h, w = valid.shape
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    for _ in range(reach):
        missing = ~valid
        if not missing.any():
            break
        total = np.zeros_like(out)
        count = np.zeros((h, w), dtype=np.float32)
        for dy, dx in steps:
            ys = slice(max(dy, 0), h + min(dy, 0))
            yd = slice(max(-dy, 0), h + min(-dy, 0))
            xs = slice(max(dx, 0), w + min(dx, 0))
            xd = slice(max(-dx, 0), w + min(-dx, 0))
            source = valid[ys, xs]
            total[yd, xd] += out[ys, xs] * source[..., None]
            count[yd, xd] += source
        grow = missing & (count > 0)
        out[grow] = total[grow] / count[grow][:, None]
        valid = valid | grow
    return out


def seam_samples(objects, size, texel):
    """Where the lightmap is cut but the surface is not: points along every
    island edge that another island's edge runs along too — a curved
    surface cut to lie flat, two pieces of one wall, the facade where one
    storey's wall ends and the next one's starts. Each is an atlas
    position either side of the cut. Edges meeting at a sharp angle are
    left alone: the light is meant to change there.

    Returns (uv_a, uv_b), arrays of matching positions."""
    from mathutils.kdtree import KDTree

    points, uvs, normals, edges = [], [], [], []
    edge_id = 0
    for obj in objects:
        m = obj.matrix_world
        rotation = m.to_3x3()
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        layer = bm.loops.layers.uv[LIGHTMAP_UV]
        for face in bm.faces:
            normal = (rotation @ face.normal).normalized()
            for loop in face.loops:
                edge = loop.edge
                a, b = loop.vert, loop.link_loop_next.vert
                ua, ub = loop[layer].uv.copy(), loop.link_loop_next[layer].uv.copy()
                if not edge.is_boundary:
                    other = [l for l in edge.link_loops if l.face is not face]
                    joined = False
                    for o in other:
                        oa = o[layer].uv if o.vert is a else o.link_loop_next[layer].uv
                        ob = o[layer].uv if o.vert is b else o.link_loop_next[layer].uv
                        if (oa - ua).length < 1e-6 and (ob - ub).length < 1e-6:
                            joined = True
                    if joined:
                        continue
                pa, pb = m @ a.co, m @ b.co
                # Two to a texel, so no stretch of the cut is left between.
                n = max(2, math.ceil(2 * (pb - pa).length / texel))
                for k in range(n):
                    t = (k + 0.5) / n
                    points.append(pa.lerp(pb, t))
                    uvs.append(ua.lerp(ub, t))
                    normals.append(normal)
                    edges.append(edge_id)
                edge_id += 1
        bm.free()
    if not points:
        return np.zeros((0, 2)), np.zeros((0, 2))

    tree = KDTree(len(points))
    for i, point in enumerate(points):
        tree.insert(point, i)
    tree.balance()
    limit = math.cos(SMOOTH)
    reach = texel * 0.35
    uv_a, uv_b = [], []
    for i, point in enumerate(points):
        best = None
        for _co, j, distance in tree.find_range(point, reach):
            if j <= i or edges[j] == edges[i] or normals[i].dot(normals[j]) < limit:
                continue
            if (uvs[i] - uvs[j]).length * size < 1.0:
                continue
            if best is None or distance < best[1]:
                best = (j, distance)
        if best:
            uv_a.append(uvs[i][:])
            uv_b.append(uvs[best[0]][:])
    return np.array(uv_a, dtype=np.float64), np.array(uv_b, dtype=np.float64)


def stitch(rgb, uv_a, uv_b, iterations=16):
    """Pull the light either side of every cut together: at each pair of
    positions, the two texel blends are moved towards their average, a
    little at a time, until they agree — so the cut does not show."""
    if not len(uv_a):
        return rgb
    h, w, _ = rgb.shape
    out = rgb.astype(np.float64)

    def footprint(uv):
        x = uv[:, 0] * w - 0.5
        y = uv[:, 1] * h - 0.5
        x0, y0 = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
        fx, fy = x - x0, y - y0
        taps = []
        for dx, dy, weight in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            taps.append((np.clip(y0 + dy, 0, h - 1), np.clip(x0 + dx, 0, w - 1), weight))
        return taps

    sides = [footprint(uv_a), footprint(uv_b)]
    for _ in range(iterations):
        values = [sum(out[ys, xs] * wt[:, None] for ys, xs, wt in taps) for taps in sides]
        middle = (values[0] + values[1]) / 2
        change = np.zeros_like(out)
        count = np.zeros((h, w))
        for taps, value in zip(sides, values):
            delta = middle - value
            norm = sum(wt * wt for _, _, wt in taps)
            for ys, xs, wt in taps:
                np.add.at(change, (ys, xs), delta * (wt / np.maximum(norm, 1e-9))[:, None])
                np.add.at(count, (ys, xs), 1.0)
        touched = count > 0
        out[touched] += change[touched] / count[touched][:, None]
    return out.astype(np.float32)


def denoise(rgb, normal):
    """Run a lightmap through Open Image Denoise, in the compositor — the
    one part of Blender that exposes it for an image rather than a render —
    with the surface normals as its guide and a white albedo: a lightmap is
    light alone, so its "colour" is white. The scene itself is drawn by
    Workbench with nothing in view, so the render is the compositor's work
    alone. Takes and returns arrays."""
    h, w, _ = rgb.shape
    images = []
    for name, values in (("denoise-colour", rgb), ("denoise-albedo", np.ones_like(rgb)), ("denoise-normal", normal)):
        image = bpy.data.images.new(name, w, h, float_buffer=True, alpha=False)
        image.colorspace_settings.name = "Non-Color"
        set_pixels(image, values.astype(np.float32))
        images.append(image)

    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    tree = bpy.data.node_groups.new("denoise", "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    node = tree.nodes.new("CompositorNodeDenoise")
    node.inputs["HDR"].default_value = True
    # The slowest and best: a lightmap is denoised once, and looked at
    # for as long as the view is published.
    for name, value in (("Quality", "High"), ("Prefilter", "Accurate")):
        try:
            node.inputs[name].default_value = value
        except (KeyError, TypeError, ValueError) as error:
            log("denoiser:", name, "left at its default:", error)
    for image, socket in zip(images, ("Image", "Albedo", "Normal")):
        source = tree.nodes.new("CompositorNodeImage")
        source.image = image
        tree.links.new(source.outputs["Image"], node.inputs[socket])
    out = tree.nodes.new("NodeGroupOutput")
    tree.links.new(node.outputs["Image"], out.inputs["Image"])
    scene.compositing_node_group = tree

    if scene.camera is None:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        cam.location = (0, 0, -1000)
        scene.collection.objects.link(cam)
        scene.camera = cam
    engine = scene.render.engine
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.use_compositing = True
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    t = time.time()
    bpy.ops.render.render(write_still=False)
    tmp = os.path.join(bpy.app.tempdir, "denoised.exr")
    bpy.data.images["Render Result"].save_render(tmp)
    scene.render.engine = engine
    scene.compositing_node_group = None
    bpy.data.node_groups.remove(tree)
    result = bpy.data.images.load(tmp)
    result.colorspace_settings.name = "Non-Color"
    clean = pixels_of(result)
    for image in images + [result]:
        bpy.data.images.remove(image)
    log("denoised", round(time.time() - t, 1), "s")
    return clean


def encode(rgb, path, scale=None, quality=90):
    """Save a lightmap as an 8-bit WebP the browser can load: scaled so the
    brightest light in it (bar the odd hot pixel) is 1, then sRGB encoded,
    which keeps the precision in the shadows where the eye wants it.
    Returns the scale the public view multiplies back by."""
    h, w, _ = rgb.shape
    if scale is None:
        lum = rgb.max(axis=2).ravel()
        lit = lum[lum > 1e-5]
        scale = float(np.percentile(lit, 99.7)) if lit.size else 1.0
        scale = max(scale, 0.05)
    v = np.clip(rgb / scale, 0, 1)
    v = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    set_pixels(img, v.astype(np.float32))
    img.filepath_raw = path
    img.file_format = "WEBP"
    img.save(quality=quality)
    bpy.data.images.remove(img)
    log("wrote", os.path.basename(path), f"{w}²", f"{os.path.getsize(path) / 1024:.0f} KB", "scale", round(scale, 3))
    return scale


def half(rgb):
    """A lightmap at half the size, each texel the average of four: what a
    phone is given, for a quarter of the memory."""
    h, w, c = rgb.shape
    return rgb.reshape(h // 2, 2, w // 2, 2, c).mean(axis=(1, 3))


# The largest lightmap a phone is given.
PHONE_SIZE = 2048


def export(objects, path):
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material is None:
                continue
            nodes = slot.material.node_tree.nodes
            for node in [n for n in nodes if n.name.startswith("lightmap")]:
                nodes.remove(node)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_apply=False,
        # The baked vertex light goes out as _DAY and _NIGHT, and only so:
        # a snapshot's meshes carry no colours of their own.
        export_attributes=True,
        export_vertex_color="NONE",
        export_all_vertex_colors=False,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    log("wrote", os.path.basename(path), f"{os.path.getsize(path) / 1048576:.1f} MB")


def main():
    args = parse()
    global MARGIN
    MARGIN = max(2, round(MARGIN_4K * args.size / 4096))
    settings = json.load(open(args.settings))
    os.makedirs(args.out, exist_ok=True)
    fresh()
    bpy.ops.import_scene.gltf(filepath=args.snapshot)
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    log(len(objects), "objects", sum(len(o.data.polygons) for o in objects), "faces")
    # Each surface whole before it is judged thin or wide: a strip of wall
    # between two openings, built as a piece of its own, is part of the wall.
    objects = split_twins(objects)
    t = time.time()
    weld(objects)
    log("welded", round(time.time() - t, 1), "s")
    # Welded first, so a corner's copies of a vertex move as one.
    part_twins(objects)
    lightmapped, vertex_lit = split_thin(objects)
    split_hard_edges(vertex_lit)
    objects = lightmapped + vertex_lit
    # The reversed copies of two-sided surfaces left out: a point by a
    # two-sided floor is near both copies, one facing each way, and would
    # be pushed off one straight back through the other.
    tree, owners = surroundings([obj for obj in objects if not obj.name.endswith("~back")])
    t = time.time()
    log("split long vertex-lit edges:", split_long_edges(vertex_lit, tree, owners), "triangles added,", round(time.time() - t, 1), "s")
    log(len(lightmapped), "lightmapped", sum(len(o.data.polygons) for o in lightmapped), "faces;",
        len(vertex_lit), "vertex-lit", sum(len(o.data.polygons) for o in vertex_lit), "faces")
    for obj in lightmapped:
        obj["_density"] = density(obj, settings)

    unwrap(lightmapped, settings, args.size)
    texel = texel_size(lightmapped, args.size)
    log(f"house texels: {texel * 100:.1f} cm")
    if args.stage == "unwrap":
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, "unwrapped.blend"))
        return
    use_gpu()
    probes = add_probes(settings.get("probes", []))
    for obj in vertex_lit + probes:
        for name in VERTEX_ATTRIBUTES.values():
            obj.data.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
    # A door's probes are only where its light is measured; they block none.
    for obj in probes:
        for ray in RAYS[1:]:
            setattr(obj, ray, False)
    t = time.time()
    sampled, counts = vertex_probes(vertex_lit + probes, tree)
    log("vertex probes placed:", sum(counts), round(time.time() - t, 1), "s")
    normal, written = bake_guides(lightmapped, args.size)
    covered = bake_coverage(lightmapped, args.size) | bake_hidden(lightmapped, args.size, settings.get("solids", {}))
    # And the texel along every edge of those: it straddles the edge, and
    # its samples, spread across it, are partly baked from under the
    # skirting or inside the wall — a dark, blotchy line along the top of
    # every skirting board otherwise.
    covered = written & (covered | grow(covered))
    # The guide carries on past every island's edge like the light does.
    normal = spread(normal, written)
    # The top of a ceiling is only ever seen from above, in the bird's-eye
    # view of the floor over it — which lifts the roof off. So it is lit as
    # it is seen: with the roof off, the floor of an open doll's house
    # rather than of a pitch-dark roof space. Between two floors it is
    # shut in either way.
    lids = [obj for obj in lightmapped if obj.get("kind") == "ceiling" and obj.name.endswith("~back")]
    if lids:
        lid_normal, lid_written = bake_guides(lids, args.size)
        lid_covered = lid_written & bake_coverage(lids, args.size)
        lid_covered = lid_written & (lid_covered | grow(lid_covered))
        lid_normal = spread(lid_normal, lid_written)
        lid_core = island_core(lids, args.size)
    t = time.time()
    seams = seam_samples(lightmapped, args.size, texel)
    log("seams to stitch:", len(seams[0]), "points,", round(time.time() - t, 1), "s")
    variants = {}
    for variant in args.variants.split(","):
        light(variant, settings)
        clean = bake_lightmap(lightmapped, variant, args.size, args.samples, written, covered, normal,
                              debug=os.path.join(args.out, variant) if args.debug else None)
        if lids:
            t = time.time()
            with roof_lifted(objects):
                lid = bake_lightmap(lids, variant, args.size, args.samples, lid_written, lid_covered, lid_normal)
            clean[lid_core] = lid[lid_core]
            log(variant, "ceiling tops baked, roof off", round(time.time() - t, 1), "s")
        bake_vertices(vertex_lit + probes, sampled, counts, variant, args.samples)
        smooth_vertex_light(vertex_lit, VERTEX_ATTRIBUTES[variant])
        t = time.time()
        rgb = stitch(clean, *seams)
        log(variant, "seams stitched", round(time.time() - t, 1), "s")
        scale = encode(rgb, os.path.join(args.out, f"{variant}.webp"))
        variants[variant] = {
            "lightmap": f"{variant}.webp",
            "scale": scale,
            "attribute": VERTEX_ATTRIBUTES[variant],
            "doors": read_probes(probes, variant),
        }
        if args.size > PHONE_SIZE:
            small = rgb
            while small.shape[0] > PHONE_SIZE:
                small = half(small)
            encode(small, os.path.join(args.out, f"{variant}-phone.webp"), scale=scale)
            variants[variant]["lightmapPhone"] = f"{variant}-phone.webp"
    for obj in probes + [sampled]:
        bpy.data.objects.remove(obj, do_unlink=True)

    for obj in objects:
        if "_density" in obj:
            del obj["_density"]
    export(objects, os.path.join(args.out, "lit.glb"))
    # What the baked view draws: more meshes than the snapshot, each split
    # into its lightmapped and vertex-lit parts, and the vertices added
    # along long thin edges.
    json.dump({"size": args.size, "samples": args.samples, "texel": texel, "variants": variants,
               "meshes": len(objects), "triangles": sum(len(o.data.polygons) for o in objects)},
              open(os.path.join(args.out, "bake.json"), "w"), indent=2)


main()

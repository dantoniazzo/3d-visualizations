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
  - a second lightmap with all of that light but the sun's straight light,
    for a view that draws the sun live — its shadows following the doors,
    the people and the car — on top of the rest of the light from here.
  - the same geometry, with a second set of UVs saying where on the
    lightmap each surface is.

Each light switch's light is baked apart, room by room, to be added in
when it is on: all of it, and only what its lamps bounce — for a view that
lights the lamps themselves live. bake.json carries the sun and the lamps
as they were baked, for such a view to light with the same.

And light probes (probe_grid), for that view to light what moves — the
people, the car — as the house around them is lit: a grid through the
house, each point's light from six ways, the same parts of it apart
(probes.bin).

And each room door shut in turn (bake_door_states): the bake has no door
leaves, so its light comes through every doorway; the rooms either side of
a door are baked again with a leaf in it, and how much of their light
stays, texel by texel, is kept (doors.webp) — for the view to dim a room
as its doors close, and a windowless WC to go dark.

The lightmap UVs (unwrap): each mesh is made whole first — T-junctions
split, coincident vertices joined — then cut only where the surface turns
sharply, and wherever a curved surface must be cut to lie flat; each piece
is laid flat with Blender's angle-based unwrap, so every texel covers
the same few square centimetres, and packed room by room. Texels are
spent where they are looked at: the house and everything in it at full
density, the roof, the upper side of ceilings and the garden at less, the
ground plane round the site at next to nothing.

The bake: every step bakes one joined copy of the meshes (as_one), and one
object of all the probes the thin faces' light is baked on
(probes_as_one) — every object baked is the whole scene handed to Cycles
again, a minute of it for a house's meshes and most of a big site's bake
otherwise (the log's last line counts them); portals in every outside opening, so the
sky is sampled through the windows; ten bounces, so corners are as light
as they would be. The light is baked in passes (bake_lightmap): the light
straight from the sun, and from the sky and lamps, sharp-edged but clean,
at full size, each apart; the light bounced off everything else, grainy
but slowly changing, at half the size with four times the samples a texel.
A surface seen
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
meshes of their own, their light baked into vertex attributes, _DAY and
_NIGHT (and, without the sun's straight light, _DAY_INDIRECT and
_NIGHT_INDIRECT), and smoothed of its grain. A vertex's light is sampled a little way off
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
materials are outdoor ground. Writes, into --out: lit.glb, for each
variant its lightmap as <variant>-luma.webp and <variant>-chroma.webp (and
<variant>-phone-*.webp), the one without the sun as <variant>-indirect-*,
and bake.json describing them.

The lightmap is laid out room by room — a square of it for each room's
surfaces, and their meshes cut up by room (zone_split, pack_zones) — so
each room is drawn, culled and can later be lit on its own.

Colour management is Blender's Filmic (VIEW), as the public view draws it:
the light is baked scene-linear and unclipped, highlights kept in the top
of each lightmap's range (encode), and Filmic applied once, in the browser,
after the light has met the surfaces' colours.
"""
import argparse
import json
import math
import os
import sys
import time
from contextlib import contextmanager, nullcontext

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import batches, lightzones  # noqa: E402

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
# ...as long as each is at least this many of its own texels across: any
# narrower, it is lit through its vertices like the thin surfaces. At 2 cm a
# texel a casing 6 cm wide is three; at Ladonia's 5.5 cm (3.6 for a strip)
# it was under two, and came out black — as did a picket of a fence whose
# material is given coarser texels still (settings' coarseMaterials).
STRIP_TEXELS = 3
# ...but nothing wider than this goes to the vertices for that: a garden
# path a metre wide at the ground's coarse texels is still better off with
# three texels of its own shade than with its light drawn between corners.
THIN_MOST = 0.3
# How much of the atlas a site's surfaces come to fill, near enough, once
# packed with their margins (pack_zones: a quarter at least, 28 to 30% for
# Wrenfield and Ladonia) — to say how big a texel will be before anything
# is unwrapped (texel_guess).
USUAL_FILL = 0.29
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
# How much of a rectangle Blender's packer fills with island boxes, and how
# much of the atlas the zones' boxes are sized to take between them (the
# rest is the gaps between zones).
PACKING = 0.8
FILL = 0.96
# The share of the atlas the islands themselves should cover at least,
# before the margins round them are narrowed (pack_zones).
MIN_SURFACE = 0.25
VERTEX_ATTRIBUTES = {"day": "_DAY", "night": "_NIGHT"}
# BAKE_CUT=<a,b,…>, a developer's: parts of the bake left out, to try one
# thing on a big site in minutes rather than hours — never for a bake that
# is kept. "zones": no rooms, everything the garden's (no switch, door or
# probe can then be baked); "edges": the thin faces' long edges not split;
# "covered": covered and hidden texels not looked for; "lids": the
# ceilings' tops not baked again with the roof off; "sun": the sun's
# straight light not baked apart (it is in with the rest, and its mask is
# empty); "vertices": the thin faces' light in one pass, not four;
# "switches": no switch's light baked — their bulbs parted from their
# fittings all the same, so the atlas is the one a whole bake lays out.
CUT = {part for part in os.environ.get("BAKE_CUT", "").split(",") if part}
# BAKE_BOX=<x0,z0,x1,z1>, likewise a developer's: only what lies in that part
# of the site (the app's x and z, metres) is baked — and is all the view
# then has of the house. A corner of a big site in three minutes.
BOX = [float(v) for v in os.environ["BAKE_BOX"].split(",")] if os.environ.get("BAKE_BOX") else None
#: `BAKE_APART=<a,b,…>`, a developer's: what is baked one thing at a time,
#: as it was before 2026-10-12, rather than together — to hold the one
#: against the other. "switches": a pass for each switch, not for each set
#: of switches that light no room in common (switch_batches); "doors": each
#: door shut alone; "probes": each room's vertex probes an object of their
#: own to bake (a hand-over of the whole scene each); "tops": the
#: ceilings' tops denoised over the whole atlas, not their own tiles of it;
#: "fill": every fill of the atlas worked out over the whole of it
#: (spread_whole).
APART = {part for part in os.environ.get("BAKE_APART", "").split(",") if part}
#: `BAKE_PASSES=<rule>`, a developer's, to see what it costs: light
#: SWITCHES several to a pass too, as the doors are shut (door_batches) —
#: "parts": those in parts of the site that no opening joins, with no lamp
#: of one in a straight line to a room of another's; "rooms": whenever no
#: room of one is a room of another's or opens into one (the doors go by
#: that as well); "loose": whenever they are baked into no room in common.
#: NEVER FOR A BAKE TO KEEP: every lamp lit in a pass is one more for
#: Cycles to choose between at each bounce, and what it lends a room's own
#: lamp less often it clamps more (sample_clamp_indirect) — Wrenfield's
#: ensuites, lit with the kitchen, lost 7% of their light and a tenth of
#: what they bounce; and a strong lamp three openings off put more light
#: into a desk lamp's next room than the desk lamp does (2026-10-12).
PASSES = os.environ.get("BAKE_PASSES")
#: `BAKE_KEEP=masks`, a developer's: which texels are a surface's
#: (mask-written.npy), which of those are covered (mask-covered.npy) and
#: which are the ceilings' tops (mask-tops.npy), kept beside the bake — to
#: hold two bakes' lightmaps against each other where there is light to see.
KEEP = {part for part in os.environ.get("BAKE_KEEP", "").split(",") if part}
#: How many times the scene was handed to Cycles, by what for (bake_image,
#: bake_vertices): each is a bake of one object, and the whole scene over
#: again — most of a big site's bake when there were 1,500 of them.
HANDED = {"lightmap": 0, "vertices": 0}
#: `BAKE_SEED=<n>`, a developer's: another seed for every pass of light (the
#: guides and the covered texels keep theirs) — the same bake with other
#: grain, to tell what a change did from what the grain does by itself.
SEED = int(os.environ.get("BAKE_SEED", 0))
#: `BAKE_ONLY=<switch id>,<id>…`, a developer's: only those switches baked;
#: and `BAKE_CLAMP=<n>`: another limit on a sample of bounced light (10;
#: 0 for none) — the two that showed what lighting switches together does.
ONLY = {part for part in os.environ.get("BAKE_ONLY", "").split(",") if part}
CLAMP = float(os.environ.get("BAKE_CLAMP", 10.0))


def keep_box(objects, box):
    """Only the faces whose middle lies in `box` (x0, z0, x1, z1, the app's
    axes) kept; objects left with none are removed. Returns the objects
    that are left."""
    x0, z0, x1, z1 = box
    kept = []
    for obj in objects:
        me = obj.data
        n = len(me.polygons)
        centres = np.empty(n * 3, dtype=np.float64)
        me.polygons.foreach_get("center", centres)
        m = np.array(obj.matrix_world)
        centres = centres.reshape(n, 3) @ m[:3, :3].T + m[:3, 3]
        # Blender's (x, y, z) is the app's (x, -z, y).
        inside = (centres[:, 0] >= x0) & (centres[:, 0] <= x1) & (-centres[:, 1] >= z0) & (-centres[:, 1] <= z1)
        if not inside.any():
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if not inside.all():
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.flatnonzero(~inside)], context="FACES")
            bm.to_mesh(me)
            bm.free()
            me.update()
        kept.append(obj)
    return kept


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--settings", required=True)
    parser.add_argument("--size", type=int, default=4096)
    parser.add_argument("--samples", type=int, default=512)
    parser.add_argument("--variants", default="day,night")
    parser.add_argument("--margin", type=int, default=MARGIN_4K, help="empty texels round every island, as at 4096")
    parser.add_argument("--stage", default="all",
                        help="unwrap: stop after the UVs, for checking them; passes: only say which switches and doors would share a pass")
    parser.add_argument("--static", action="store_true",
                        help="only what a view drawn fully static reads: no door states, light probes, sun masks or light apart")
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
    if obj.get("material") in settings.get("coarseMaterials", {}):
        return float(settings["coarseMaterials"][obj.get("material")])
    if obj.get("material") in settings["groundMaterials"]:
        return 6.0
    if obj.get("kind") == "roof":
        return 2.0
    # The neighbours' houses (World/Builders/NeighbourhoodBuilder.js): seen
    # from the street, never up close.
    if obj.get("kind") == "scenery":
        return 4.0
    # The upper side of a ceiling, seen only through a stairwell from the
    # floor above.
    if obj.get("kind") == "ceiling" and is_back(obj):
        return 3.0
    if obj.get("strip"):
        return 1.0 / STRIP_DENSITY
    return 1.0


def is_back(obj):
    """Whether an object is the reversed copies of a two-sided surface
    (split_twins) — the top of a ceiling among them. By its name's "~back"
    until the objects are cut up by room (zone_split), which notes it down:
    two of those joined objects may then have the same name, and Blender
    numbers the second ("…~back.001")."""
    return bool(obj["back"]) if "back" in obj.keys() else obj.name.endswith("~back")


def bounds(obj):
    n = len(obj.data.vertices)
    if not n:
        return Vector((0.0, 0.0, 0.0)), Vector((0.0, 0.0, 0.0))
    co = np.empty(n * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("co", co)
    m = np.array(obj.matrix_world)
    co = co.reshape(n, 3) @ m[:3, :3].T + m[:3, 3]
    return Vector(co.min(axis=0)), Vector(co.max(axis=0))


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


def face_classes(me, thin=THIN):
    """What each face belongs to — a wide surface (WIDE), a narrow strip
    (STRIP) or a thin or small one (THIN_FACE). Width is judged over each
    whole surface (smooth_regions), not face by face: a ceiling is a few
    long sliver triangles, and a cushion a hundred narrow facets round its
    edge, but each is one wide surface — lit through the corners of its
    facets instead, it comes out blotched. `thin`: narrower than this is
    thin (THIN, or more where the texels are coarse: split_thin)."""
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
        if region["area"] < SMALL or width < thin:
            kind[r] = THIN_FACE
        elif width < STRIP_WIDTH:
            kind[r] = STRIP
        else:
            kind[r] = WIDE
    return [kind[region_of[i]] for i in range(len(me.polygons))]


def texel_guess(objects, settings, size):
    """About how big the house's texels will be, in metres, before anything
    is unwrapped: every surface's area at its own density (density), over
    the share of the atlas they come to fill (USUAL_FILL)."""
    weighted = 0.0
    for obj in objects:
        if obj.get("glow"):
            continue
        scale = abs(obj.matrix_world.to_3x3().determinant()) ** (2 / 3)
        weighted += float(face_areas(obj).sum()) * scale / density(obj, settings) ** 2
    return math.sqrt(weighted / (USUAL_FILL * size * size)) if weighted else 0.0


def thin_under(obj, settings=None, texel=0.0):
    """How narrow a surface of `obj` is lit through its vertices (split_thin):
    THIN, or, where its texels would be coarse, STRIP_TEXELS of the texels
    it would be given (`texel`: about the house's, texel_guess), up to
    THIN_MOST."""
    if not texel or settings is None:
        return THIN
    coarse = density(obj, settings)
    return min(THIN_MOST, max(THIN, STRIP_TEXELS * texel * (coarse if coarse != 1.0 else 1.0 / STRIP_DENSITY)))


def split_thin(objects, settings=None, texel=0.0):
    """Split every mesh into its wide surfaces and its narrow strips, which
    get the lightmap — the strips at STRIP_DENSITY times the texels, so a
    door casing or a skirting board is still a few texels across — and its
    thin and small ones, which get vertex lighting. Returns (lightmapped,
    vertex-lit).

    `texel`, about what the house's texels will be (texel_guess): a surface
    narrower than STRIP_TEXELS of the texels it would be given — a strip's
    are finer than the house's, a coarse material's (a fence's) or the
    ground's coarser — is lit through its vertices too. So on a big site,
    or in a draft at half the size, the narrower casings and skirtings are,
    and every picket of a fence whose texels are three times the house's.

    A skirting or a casing lit through its vertices takes its light from
    its ends, a few metres apart, and in between it is only a blend of
    them: a board running from a dark corner behind the bed to one behind
    a wardrobe came out grey all along a sunlit wall. In the lightmap it
    has its own light, texel by texel, like the wall above it.

    A mesh that already carries vertex colours keeps them for its own
    colour, so it stays on the lightmap whole. A light's glass or bulb
    (part_bulbs) is lit through its vertices however wide it is: an
    object being baked still stops light, whatever rays it is hidden
    from, and its light would never get out of it."""
    lightmapped = []
    vertex_lit = []
    for obj in objects:
        me = obj.data
        if obj.get("glow"):
            obj["lighting"] = "vertex"
            vertex_lit.append(obj)
            continue
        if len(me.color_attributes):
            lightmapped.append(obj)
            continue
        classes = face_classes(me, thin_under(obj, settings, texel))
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


#: A lamp's bulb, when the fitting does not say (blender/lib/loose.py).
BULB_RADIUS = 0.022
#: How much further than its glass's or bulb's radius a face may reach
#: from a light, every corner of it, and still be that glass or bulb.
BULB_SLACK = 0.012


def part_bulbs(objects, switches):
    """Each light's glass or bulb — a ceiling light's opal globe or dome,
    a lamp's bulb: the faces of the fitting's `glow` material within its
    `radius` of the light — as an object of its own, tagged with its
    switch ("glow"), for the public view to light up when it is on.

    Its light is baked from inside it (light_switches), so it is left out of
    every ray but the camera's: as an opaque ball round the light it would
    keep all but a sliver of it in. Returns the objects, with the bulbs.

    A snapshot parts each light's glass already, as an object of its own
    tagged with its switch (Publish/Snapshot.js): only that switch's lights
    take faces from it — a lamp's back to back with another room's would
    otherwise take the other's end cap — and it stays its switch's glass
    whole, as the live view lights it. A switch that is not baked (a lamp
    out of doors, in no room) has no bulbs: its glass is baked as any other
    surface, as it was before the snapshot tagged it."""
    lamps = []
    for switch in switches:
        for fitting in switch["lights"]:
            x, y, z = fitting["position"]
            reach = fitting.get("radius", BULB_RADIUS) + BULB_SLACK
            lamps.append((switch["id"], np.array([x, -z, y]), reach, fitting.get("glow")))
    baked = {switch["id"] for switch in switches}
    tagged = untagged = 0
    for obj in objects:
        if not obj.get("glow"):
            continue
        if obj["glow"] in baked:
            tagged += 1
        else:
            del obj["glow"]
            untagged += 1
    if tagged or untagged:
        log("glass parted by the snapshot:", tagged, "objects of baked switches,", untagged, "of switches not baked (untagged)")
    out = list(objects)
    for obj in objects:
        for switch, at, reach, glow in lamps:
            # Another switch's glass, as the snapshot tagged it.
            if obj.get("glow") and obj["glow"] != switch:
                continue
            if glow and obj.get("material") != glow:
                continue
            # The object as it is now, less any bulb already taken from it.
            me = obj.data
            n = len(me.vertices)
            co = np.empty(n * 3, dtype=np.float64)
            me.vertices.foreach_get("co", co)
            co = co.reshape(n, 3) @ np.array(obj.matrix_world.to_3x3()).T + np.array(obj.matrix_world.translation)
            near = np.linalg.norm(co - at, axis=1) <= reach
            if not near.any():
                continue
            flags = [bool(near[list(poly.vertices)].all()) for poly in me.polygons]
            if not any(flags):
                continue
            if all(flags):
                bulb = obj
            else:
                bulb = separate_faces(obj, flags, "~bulb")
                out.append(bulb)
            bulb["glow"] = switch
            for ray in RAYS[1:]:
                setattr(bulb, ray, False)
            log("bulb of", switch, sum(flags), "faces")
            if bulb is obj:
                break
    return out


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


# ---------------------------------------------------------------------
# Lighting zones
# ---------------------------------------------------------------------

#: The zone of whatever no room sees: the outside of the house, the
#: garden, the roof.
OUTSIDE = "outside"


#: A face in a wall's own thickness is the room's whose floor plan is within
#: this of its middle (face_zones).
WALL_REACH = 0.4
#: A face is cut along a room's edge (cut_at_rooms) where it reaches at
#: least this far past the edge — further than into the wall that stands
#: on it — and this far into the room.
CUT_BEYOND = 0.25
CUT_INTO = 0.02
#: A face in the thickness of a wall between two rooms is cut along the
#: wall's middle (cut_at_walls) where it reaches at least this far to
#: either side of it; its two rooms are looked for this far off the
#: wall's faces...
WALL_CUT = 0.02
WALL_SIDE = 0.15
#: ...and it may reach this far out of the wall's faces: a threshold lies a
#: few centimetres into each room.
WALL_OVER = 0.06


def room_edges(rooms):
    """Every edge of every room's floor plan (the app's x, z): where it
    starts, the way it runs, its length, the way out of the room across
    it, and the heights the room is taken to reach (as face_zones has it)."""
    edges = []
    for room in rooms:
        polygon = room["polygon"]
        following = polygon[1:] + polygon[:1]
        turn = sum(x1 * z2 - x2 * z1 for (x1, z1), (x2, z2) in zip(polygon, following))
        for (x1, z1), (x2, z2) in zip(polygon, following):
            length = math.hypot(x2 - x1, z2 - z1)
            if length < 1e-6:
                continue
            dx, dz = (x2 - x1) / length, (z2 - z1) / length
            out = (dz, -dx) if turn > 0 else (-dz, dx)
            edges.append(((x1, z1), (dx, dz), length, out, room["elevation"] - 0.3, room["elevation"] + room["height"] + 0.3))
    return edges


def cut_at_rooms(objects, rooms):
    """Cut every face that lies in a room and runs on well past its edge
    along that edge, so each part can be the room's it is seen from
    (face_zones gives a FACE to one room, by its middle).

    A wall is built as one piece from end to end, past every wall that
    meets it: its face in one room runs on behind the partition into the
    next, as two long triangles — and the triangle whose middle fell in
    the other room, or inside the partition, was lit by the other room's
    switch or by none: a black triangle of wall over a bed with its own
    lamp on (Wrenfield's Bedroom 3), a wall dark beside a door (Ladonia's
    A1), a diagonal across a utility room. Only faces reaching CUT_BEYOND
    past the edge are cut — what ends inside the wall on the edge is left
    whole and goes to the nearest room (face_zones). Not the roof, the
    scenery, the terrain or the lamps' glass, which no room is given.
    Returns how many cuts were made."""
    edges = room_edges(rooms)
    cuts = 0
    for obj in objects:
        if obj.get("own") or obj.get("glow") or obj.get("kind") in ("roof", "scenery"):
            continue
        me = obj.data
        if not len(me.polygons):
            continue
        m = np.array(obj.matrix_world)
        stale = True
        for (x1, z1), (dx, dz), length, (nx, nz), low, high in edges:
            if stale:
                # The mesh as it is now (cut, it has more of everything).
                n = len(me.vertices)
                co = np.empty(n * 3, dtype=np.float64)
                me.vertices.foreach_get("co", co)
                co = co.reshape(n, 3) @ m[:3, :3].T + m[:3, 3]
                # Blender's (x, y, z) is the app's (x, -z, y).
                x, y, z = co[:, 0], co[:, 2], -co[:, 1]
                box = [(bx, bz) for bx in (x.min(), x.max()) for bz in (z.min(), z.max())]
                floor, top = y.min(), y.max()
                verts = np.empty(len(me.loops), dtype=np.int64)
                me.loops.foreach_get("vertex_index", verts)
                starts = np.empty(len(me.polygons), dtype=np.int64)
                me.polygons.foreach_get("loop_start", starts)
                stale = False
            # (Nothing of it across this edge at all: most objects, most edges.)
            if top < low or floor > high:
                continue
            reach = [(bx - x1) * nx + (bz - z1) * nz for bx, bz in box]
            span = [(bx - x1) * dx + (bz - z1) * dz for bx, bz in box]
            # (A wall's own face lies in the plane of the edge that meets this one at the corner: at the very end of
            # the edge, not past it — and is the face most often to be cut.)
            if max(reach) < CUT_BEYOND or min(reach) > -CUT_INTO or max(span) < -CUT_INTO or min(span) > length + CUT_INTO:
                continue
            across = (x - x1) * nx + (z - z1) * nz
            along = (x - x1) * dx + (z - z1) * dz
            least = lambda values: np.minimum.reduceat(values[verts], starts)
            most = lambda values: np.maximum.reduceat(values[verts], starts)
            hit = ((most(across) > CUT_BEYOND) & (least(across) < -CUT_INTO) & (most(along) > -CUT_INTO) & (least(along) < length + CUT_INTO)
                   & (most(y) > low) & (least(y) < high))
            if not hit.any():
                continue
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.faces.ensure_lookup_table()
            faces = [bm.faces[i] for i in np.flatnonzero(hit)]
            geom = set(faces)
            for face in faces:
                geom.update(face.edges)
                geom.update(face.verts)
            inverse = obj.matrix_world.inverted()
            bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=inverse @ Vector((x1, -z1, 0.0)),
                                   plane_no=obj.matrix_world.to_3x3().transposed() @ Vector((nx, -nz, 0.0)))
            bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method="BEAUTY", ngon_method="BEAUTY")
            bm.to_mesh(me)
            bm.free()
            me.update()
            cuts += int(hit.sum())
            stale = True
    return cuts


def rooms_at(rooms, x, y, z):
    """Which room holds each point (arrays, the app's x, y, z) — over its
    floor plan, between its floor and a little over its ceiling, as
    shared/roomGraph.js's roomAt has it — as its place in `rooms`; -1 where
    none does."""
    pick = np.full(x.shape, -1)
    for k, room in enumerate(rooms):
        low, high = room["elevation"], room["elevation"] + room["height"]
        inside = (pick < 0) & (y >= low - 0.05) & (y < high + 0.3) & in_polygon(x, z, room["polygon"])
        pick[inside] = k
    return pick


def cut_at_walls(objects, walls, rooms, settings=None, texel=0.0):
    """Cut every face that lies in the thickness of a wall between two
    rooms — the lining of a doorway, its head, the threshold under it —
    along the wall's middle, so each half can be the room's on its side
    (face_zones gives a FACE to one room).

    Such a face runs from one room's face of the wall to the other's, as
    two triangles; each went to the room nearer its own middle, a third and
    two thirds through the wall — so every lining was parted between its
    two rooms along its DIAGONAL: with the door shut, half of what a room
    sees of it had the light of the lamp behind the leaf and none of its
    own (a switch's light next door goes by how far the door is open), and
    by day the two long wedges, an island each in a different room's part
    of the atlas, came out smudged dark where they taper to nothing.

    A half narrower than a surface of its object may be and still have the
    lightmap (thin_under, with `settings` and `texel`: half of a partition's
    ten centimetres) is lit through its vertices, as any strip that narrow
    is: those are parted from their objects — an object that is nothing
    else is taken out of `objects` — and returned. Without `settings` (the
    thin faces themselves) the faces are only cut."""
    narrow = []
    if not walls or not rooms:
        return narrow
    cuts = 0
    for obj in list(objects):
        # (Nor the reversed copies of two-sided surfaces, told by their names until zone_split: is_back.)
        if obj.get("own") or obj.get("glow") or obj.get("kind") in ("roof", "scenery") or obj.name.endswith("~back"):
            continue
        me = obj.data
        if not len(me.polygons):
            continue
        m = np.array(obj.matrix_world)
        # (A mesh with colours of its own in its vertices stays on the lightmap whole: split_thin.)
        thin = thin_under(obj, settings, texel) if settings is not None and not len(me.color_attributes) else 0.0
        stale, marked = True, False
        for wall in walls:
            (sx, sz), (dx, dz) = wall["start"], wall["direction"]
            half, length = wall["half"], wall["length"]
            if stale:
                # The mesh as it is now (cut, it has more of everything).
                n = len(me.vertices)
                co = np.empty(n * 3, dtype=np.float64)
                me.vertices.foreach_get("co", co)
                co = co.reshape(n, 3) @ m[:3, :3].T + m[:3, 3]
                # Blender's (x, y, z) is the app's (x, -z, y).
                x, y, z = co[:, 0], co[:, 2], -co[:, 1]
                box = [(bx, bz) for bx in (x.min(), x.max()) for bz in (z.min(), z.max())]
                floor, top = y.min(), y.max()
                verts = np.empty(len(me.loops), dtype=np.int64)
                me.loops.foreach_get("vertex_index", verts)
                starts = np.empty(len(me.polygons), dtype=np.int64)
                me.polygons.foreach_get("loop_start", starts)
                stale = False
            # (Nothing of it across this wall's middle at all: most objects, most walls.)
            if top < wall["bottom"] - 0.05 or floor > wall["top"] + 0.05:
                continue
            reach = [(bz - sz) * dx - (bx - sx) * dz for bx, bz in box]
            span = [(bx - sx) * dx + (bz - sz) * dz for bx, bz in box]
            if max(reach) < WALL_CUT or min(reach) > -WALL_CUT or max(span) < -half or min(span) > length + half:
                continue
            across = (z - sz) * dx - (x - sx) * dz
            along = (x - sx) * dx + (z - sz) * dz
            least = lambda values: np.minimum.reduceat(values[verts], starts)
            most = lambda values: np.maximum.reduceat(values[verts], starts)
            # All of it within the wall's own thickness (a threshold, a little wider), and reaching to both sides of its middle.
            hit = ((most(across) > WALL_CUT) & (least(across) < -WALL_CUT) & (most(np.abs(across)) < half + WALL_OVER)
                   & (least(along) > -half - 0.02) & (most(along) < length + half + 0.02)
                   & (least(y) > wall["bottom"] - 0.1) & (most(y) < wall["top"] + 0.05))
            if not hit.any():
                continue
            # Only where a room lies either side of the wall there: an outside wall's doorway is its one room's, whole.
            at = (least(along)[hit] + most(along)[hit]) / 2
            height = np.clip((least(y)[hit] + most(y)[hit]) / 2, wall["bottom"] + 0.3, max(wall["bottom"] + 0.3, wall["top"] - 0.3))
            off = half + WALL_SIDE
            one = rooms_at(rooms, sx + dx * at - dz * off, height, sz + dz * at + dx * off)
            other = rooms_at(rooms, sx + dx * at + dz * off, height, sz + dz * at - dx * off)
            between = (one >= 0) & (other >= 0) & (one != other)
            if not between.any():
                continue
            bm = bmesh.new()
            bm.from_mesh(me)
            # Which faces are such halves, kept with the faces through every cut.
            layer = bm.faces.layers.int.get("halved")
            if layer is None:
                layer = bm.faces.layers.int.new("halved")
            bm.faces.ensure_lookup_table()
            faces = [bm.faces[i] for i in np.flatnonzero(hit)[between]]
            # How wide each half will be: what it reaches to either side of the middle.
            wide = np.maximum(most(across)[hit], -least(across)[hit])[between]
            for face, width in zip(faces, wide):
                if width < thin:
                    face[layer] = 1
                    marked = True
            geom = set(faces)
            for face in faces:
                geom.update(face.edges)
                geom.update(face.verts)
            inverse = obj.matrix_world.inverted()
            bmesh.ops.bisect_plane(bm, geom=list(geom), dist=1e-5, plane_co=inverse @ Vector((sx, -sz, 0.0)),
                                   plane_no=obj.matrix_world.to_3x3().transposed() @ Vector((-dz, -dx, 0.0)))
            bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method="BEAUTY", ngon_method="BEAUTY")
            bm.to_mesh(me)
            bm.free()
            me.update()
            cuts += len(faces)
            stale = True
        halved = me.attributes.get("halved")
        if halved is None:
            continue
        flags = np.zeros(len(me.polygons), dtype=np.int32)
        if marked:
            halved.data.foreach_get("value", flags)
        me.attributes.remove(halved)
        if not flags.any():
            continue
        if flags.all():
            objects.remove(obj)
            piece = obj
        else:
            piece = separate_faces(obj, (flags > 0).tolist(), "~thin")
        piece["lighting"] = "vertex"
        if "strip" in piece.keys():
            del piece["strip"]
        narrow.append(piece)
    if cuts:
        log("  faces cut along the middle of the walls between rooms:", cuts,
            *((f"— {sum(len(o.data.polygons) for o in narrow)} of their halves, too narrow for the lightmap, lit through their vertices",) if narrow else ()))
    return narrow


def nearest_on_polygon(x, z, polygon):
    """For points (x, z): how far each is from a polygon's edge, and the
    point of the edge nearest it."""
    best = np.full(x.shape, np.inf)
    px, pz = np.zeros(x.shape), np.zeros(x.shape)
    for (x1, z1), (x2, z2) in zip(polygon, polygon[1:] + polygon[:1]):
        ex, ez = x2 - x1, z2 - z1
        k = np.clip(((x - x1) * ex + (z - z1) * ez) / (ex * ex + ez * ez or 1e-12), 0, 1)
        qx, qz = x1 + k * ex, z1 + k * ez
        d = np.hypot(x - qx, z - qz)
        nearer = d < best
        best[nearer], px[nearer], pz[nearer] = d[nearer], qx[nearer], qz[nearer]
    return best, px, pz


def face_zones(obj, rooms, walls=(), solid=()):
    """The room each face of `obj` is seen from: the room holding a point a
    hand's width off the face along its normal — or, for a face hard
    against a wall (the back of a wardrobe), the one holding its middle, or
    the point as far behind it. A room holds a point over its floor plan
    from a little below its floor to a little above its ceiling, the room
    the point is nearest the height of winning. Returns zone ids per face,
    OUTSIDE where no room sees it.

    A face in a wall's own thickness (`walls`, the spec's, as
    scripts/bake-public.mjs lays them out) — the end of a wall at a
    doorway, a threshold, a window's reveal, the lining of a door's frame —
    has no room a hand's width off it, the rooms' floor plans stopping at
    their walls' faces. It is the room's whose plan is nearest its middle
    (within WALL_REACH) — but one it faces away from: the outside face of
    an outside wall stays outside. Left outside, as they all were, they
    had none of any switch's light: black bands at every doorway of a
    lamplit room.

    Which floor's room: never one the face looks up from over the ceiling
    of, or down from under the floor of; and of the others the one at
    whose height it is SEEN — a hand's width off it the way it faces —
    before the one nearest in plan. A threshold lies a millimetre under
    its own floor, within reach of the rooms below (0.3 m over their
    ceilings) as of its own, and went to the room below — over its floor
    plan, or first in the list where the two floors' walls stand over each
    other: every upstairs threshold had the light of the room under it and
    none of its own. And no room sees a face that looks up or down hard
    against a solid part of a wall (`solid`: the walls' panels round their
    openings): the top of a wall under the wall of the floor above stays
    outside, dark from above as the cut through a wall is on a plan — in a
    room's part of the atlas it only took texels."""
    me = obj.data
    n = len(me.polygons)
    centres = np.empty(n * 3, dtype=np.float64)
    normals = np.empty(n * 3, dtype=np.float64)
    me.polygons.foreach_get("center", centres)
    me.polygons.foreach_get("normal", normals)
    m = np.array(obj.matrix_world)
    centres = centres.reshape(n, 3) @ m[:3, :3].T + m[:3, 3]
    normals = normals.reshape(n, 3) @ np.linalg.inv(m[:3, :3])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    zones = np.full(n, "", dtype=object)
    # A face that looks up from over a room's ceiling, or down from under its floor, is never that room's. (By more
    # than a centimetre: the underside of a two-sided floor, moved a few millimetres under it — part_twins — stays
    # with its floor's room.)
    height, facing = centres[:, 2], normals[:, 2]
    never = lambda at, low, high: ((facing[at] > 0.5) & (height[at] > high + 0.01)) | ((facing[at] < -0.5) & (height[at] < low - 0.01))
    for offset in (0.05, 0.0, -0.05):
        todo = np.flatnonzero(zones == "")
        if not todo.size:
            break
        p = centres[todo] + normals[todo] * offset
        # Blender's (x, y, z) is the app's (x, -z, y), which the rooms are in.
        x, y, z = p[:, 0], p[:, 2], -p[:, 1]
        best = np.full(todo.size, np.inf)
        pick = np.full(todo.size, -1)
        for k, room in enumerate(rooms):
            low, high = room["elevation"], room["elevation"] + room["height"]
            off = np.maximum(0.0, np.maximum(low - y, y - high))
            hit = (off <= 0.3) & (off < best) & ~never(todo, low, high) & in_polygon(x, z, room["polygon"])
            best[hit] = off[hit]
            pick[hit] = k
        found = pick >= 0
        zones[todo[found]] = [rooms[k]["id"] for k in pick[found]]
    todo = np.flatnonzero(zones == "")
    if todo.size and walls:
        p = centres[todo]
        x, y, z = p[:, 0], p[:, 2], -p[:, 1]
        inside = np.zeros(todo.size, dtype=bool)
        for wall in walls:
            (sx, sz), (dx, dz) = wall["start"], wall["direction"]
            if not ((y > wall["bottom"] - 0.05) & (y < wall["top"] + 0.05)).any():
                continue
            rx, rz = x - sx, z - sz
            along = rx * dx + rz * dz
            across = rz * dx - rx * dz
            inside |= ((y > wall["bottom"] - 0.05) & (y < wall["top"] + 0.05) & (along > -wall["half"] - 0.02)
                       & (along < wall["length"] + wall["half"] + 0.02) & (np.abs(across) < wall["half"] + 0.02))
        todo = todo[inside]
        if todo.size:
            x, y, z = x[inside], y[inside], z[inside]
            # The way each faces (the app's x, y, z), and where it is seen from: a hand's width off it.
            nx, ny, nz = normals[todo][:, 0], normals[todo][:, 2], -normals[todo][:, 1]
            ox, oy, oz = x + nx * 0.05, y + ny * 0.05, z + nz * 0.05
            # Looking up or down hard against a solid part of a wall, nothing sees it. (Only those: the top of a
            # door's lining runs on up behind the head of its frame, and is seen below it.)
            buried = np.zeros(todo.size, dtype=bool)
            flat = np.abs(ny) > 0.5
            for box in solid:
                under = flat & (oy > box["bottom"]) & (oy < box["top"])
                if not under.any():
                    continue
                (sx, sz), (dx, dz) = box["start"], box["direction"]
                rx, rz = ox - sx, oz - sz
                along = rx * dx + rz * dz
                across = rz * dx - rx * dz
                buried |= under & (along > box["from"]) & (along < box["to"]) & (np.abs(across) < box["half"])
            miss = np.full(todo.size, np.inf)
            best = np.full(todo.size, WALL_REACH)
            pick = np.full(todo.size, -1)
            for k, room in enumerate(rooms):
                low, high = room["elevation"], room["elevation"] + room["height"]
                off = np.maximum(0.0, np.maximum(low - oy, oy - high))
                level = (off <= 0.3) & ~buried & ~never(todo, low, high)
                if not level.any():
                    continue
                far, px, pz = nearest_on_polygon(x, z, room["polygon"])
                toward = ((px - x) * nx + (pz - z) * nz) / np.maximum(far, 1e-6)
                # The room at its own height first, then the nearer.
                hit = level & (far < WALL_REACH) & (toward > -0.5) & ((off < miss - 1e-6) | ((off <= miss + 1e-6) & (far < best)))
                miss[hit] = off[hit]
                best[hit] = far[hit]
                pick[hit] = k
            found = pick >= 0
            zones[todo[found]] = [rooms[k]["id"] for k in pick[found]]
    zones[zones == ""] = OUTSIDE
    return zones


def zone_split(objects, rooms, walls=(), solid=()):
    """Every lightmapped object cut up by the room each face is seen from
    (face_zones) — a face that runs from one room into the next cut along
    the room's edge first (cut_at_rooms) — then joined again into one
    object for each zone and kind of surface — material, floor, what it
    is, how it is lit. Each room's surfaces are then packed together in the
    atlas (pack_zones), drawn as meshes of their own, culled room by room,
    and can be given light of their own. Returns the objects.

    Two things are no room's whatever they lie in. The top of a ceiling,
    seen only from above with the roof off and lit as that
    (roof_lifted): in its room's part of the atlas its sunlight would set
    the range the room's own dim light is held in (lib/lightzones.py). And
    whatever the view draws by a shader of its own (`own`: the terrain,
    its paint in its vertices), which reads the garden's lightmap as it is
    and takes no switch's light — what of it is in a room lies under the
    floor."""
    cuts = cut_at_rooms(objects, rooms)
    if cuts:
        log("  faces cut along the rooms' edges:", cuts)
    pieces = []
    for obj in objects:
        obj["back"] = obj.name.endswith("~back")
        # (Told by `back` from here on, not by their names: is_back.)
        if obj.get("own") or (obj.get("kind") == "ceiling" and obj["back"]):
            obj["zone"] = OUTSIDE
            pieces.append(obj)
            continue
        while True:
            zones = face_zones(obj, rooms, walls, solid)
            first = zones[0]
            if (zones == first).all():
                obj["zone"] = first
                pieces.append(obj)
                break
            other = zones[zones != first][0]
            piece = separate_faces(obj, (zones == other).tolist(), "")
            piece["zone"] = other
            pieces.append(piece)

    groups = {}
    for obj in pieces:
        me = obj.data
        key = (obj["zone"], obj.get("material"), obj.get("level"), obj.get("kind"), bool(obj.get("strip")),
               bool(obj.get("back")), obj.get("cast"), obj.get("receive"), obj.get("glow"), len(me.color_attributes) > 0,
               tuple(uv.name for uv in me.uv_layers),
               tuple(slot.material.name if slot.material else "" for slot in obj.material_slots))
        groups.setdefault(key, []).append(obj)
    joined = []
    for key, members in groups.items():
        head = members[0]
        if len(members) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in members:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = head
            bpy.ops.object.join()
        zone, material, _, _, strip, back = key[:6]
        # "~back" last: the reversed copies are told by it (density, lids).
        head.name = f"{material}@{zone}" + ("~bulb" if head.get("glow") else "") + ("~strip" if strip else "") + ("~back" if back else "")
        joined.append(head)
    return joined


def edit(objects):
    """Into edit mode on these objects alone, everything selected."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")


def uv_areas(obj):
    """The area of each of an object's faces in its lightmap UVs."""
    me = obj.data
    if not len(me.polygons):
        return np.zeros(0)
    uv = np.empty(len(me.loops) * 2, dtype=np.float64)
    me.uv_layers[LIGHTMAP_UV].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    starts = np.empty(len(me.polygons), dtype=np.int64)
    totals = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_start", starts)
    me.polygons.foreach_get("loop_total", totals)
    following = np.arange(len(uv)) + 1
    following[starts + totals - 1] = starts
    cross = uv[:, 0] * uv[following, 1] - uv[following, 0] * uv[:, 1]
    return np.abs(np.add.reduceat(cross, starts)) / 2


def face_areas(obj):
    """The area of each of an object's faces."""
    areas = np.empty(len(obj.data.polygons), dtype=np.float64)
    obj.data.polygons.foreach_get("area", areas)
    return areas


def uv_area(obj):
    """The area of an object's lightmap UVs."""
    return float(uv_areas(obj).sum())


def pack_zones(objects, size):
    """Pack the atlas room by room (zone_split), each zone's islands in a
    rectangle of their own, so a room's light lies together in the atlas
    and light of its own can later be baked into that rectangle alone.

    First each zone's islands are packed on their own (turned to lie along
    the axes) to see how much room they take — mostly the margins round
    them, which are MARGIN texels whatever the zone. The atlas is then cut
    into a rectangle for each zone, as big as it needs and as near square
    as will go (zone_rects), which between them fill it; and each zone is
    packed into its rectangle, at the texels per square metre every zone
    gets. Islands are packed as their bounding boxes — the surfaces of a
    house are rectangles, near enough, and it is a hundred times quicker.
    It all costs the house a few per cent of its texels per metre, against
    packing its islands with no regard to the rooms. Returns each zone's
    rectangle as [u, v, width, height], in UV units."""
    give_area(objects)
    zones = {}
    for obj in objects:
        zones.setdefault(obj.get("zone", OUTSIDE), []).append(obj)
    total = sum(uv_area(obj) for obj in objects) or 1.0
    # How much of the atlas each zone needs: its islands' boxes, MARGIN
    # texels round each, at the one scale at which every zone's fit the
    # atlas together. Sized from the islands themselves rather than from a
    # trial pack at the scale a smaller house would get: on a big site the
    # islands claim more atlas than there is, every zone's share shrinks
    # once laid out, and the margins — fixed in texels — eat a small room's
    # islands whole (Ladonia's first bakes: a dozen rooms packed to nothing).
    global MARGIN
    area = {zone: sum(uv_area(obj) for obj in members) for zone, members in zones.items()}
    boxes = {zone: np.array([box for obj in members for box in island_boxes(obj)] or [[0.0, 0.0]], dtype=np.float64)
             for zone, members in zones.items()}

    def needs(scale, margin):
        m = margin / size
        return {zone: float(np.sum((b[:, 0] * scale + 2 * m) * (b[:, 1] * scale + 2 * m))) / PACKING
                for zone, b in boxes.items()}

    def fit(margin):
        lo_s, hi_s = 0.0, 1.0
        while sum(needs(hi_s, margin).values()) < FILL:
            hi_s *= 2
        for _ in range(50):
            mid = (lo_s + hi_s) / 2
            lo_s, hi_s = (mid, hi_s) if sum(needs(mid, margin).values()) < FILL else (lo_s, mid)
        return lo_s

    # A site of many thousands of islands (Ladonia's three buildings: 22
    # thousand) spends most of the atlas on their margins: then narrower
    # margins, down to half, for at least MIN_SURFACE of it to be surface.
    full = MARGIN
    for margin in sorted({full, max(1, round(full * 0.75)), max(1, round(full / 2))}, reverse=True):
        scale = fit(margin)
        if scale * scale * total >= MIN_SURFACE:
            break
    if margin != full:
        log("  margins narrowed:", full, "to", margin, "texels, for", len([1 for b in boxes.values() for _ in b]), "islands")
    MARGIN = margin
    need = needs(scale, MARGIN)
    log("  islands:", sum(len(b) for b in boxes.values()), f"(margins {MARGIN} texels);",
        f"surface {scale * scale * total * 100:.0f}% of the atlas as laid out")
    # Laid out, and packed; then again, each zone's rectangle sized by how
    # well its islands filled the first — so every zone comes out at the
    # same texels per square metre — but never more than halved or doubled
    # at a time, so one zone the packer did badly can't take the atlas.
    for _ in range(2):
        rects = zone_rects(need, MARGIN / size)
        for zone, members in zones.items():
            pack_into(members, rects[zone], MARGIN / size)
        fill = {zone: sum(uv_area(obj) for obj in members) / (rects[zone][2] * rects[zone][3])
                for zone, members in zones.items()}
        need = {zone: min(2 * need[zone], max(0.5 * need[zone], area[zone] / max(fill[zone], 1e-6))) for zone in zones}
    by_zone = {zone: math.sqrt(sum(uv_area(obj) for obj in members) / area[zone])
               for zone, members in zones.items() if area[zone] > 1e-12}
    density = list(by_zone.values())
    usual = sorted(density)[len(density) // 2] if density else 1.0
    for zone, d in by_zone.items():
        if d < 0.5 * usual:
            members = zones[zone]
            log("  zone short of texels:", zone, f"{d / usual:.3g} of the usual;", len(members), "pieces,",
                f"uv {area[zone]:.3g} -> {sum(uv_area(obj) for obj in members):.3g};", "rect", [round(v, 5) for v in rects[zone]],
                "e.g.", ", ".join(obj.name for obj in members[:4]))
    log("  atlas", f"{sum(uv_area(obj) for obj in objects) * 100:.0f}% filled;",
        f"zones' texels per metre within {(max(density) / max(min(density), 1e-12) - 1) * 100:.0f}% of each other")
    return rects


def island_boxes(obj):
    """The size of each of an object's lightmap islands, (width, height) in
    UV units: faces joined where they share a vertex at the same UV."""
    me = obj.data
    n = len(me.polygons)
    if not n:
        return []
    uv = np.empty(len(me.loops) * 2, dtype=np.float64)
    me.uv_layers[LIGHTMAP_UV].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    verts = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", verts)
    totals = np.empty(n, dtype=np.int64)
    me.polygons.foreach_get("loop_total", totals)
    face_of = np.repeat(np.arange(n), totals)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    seen = {}
    q = np.round(uv * 1e6).astype(np.int64)
    for li, (v, a, b) in enumerate(zip(verts.tolist(), q[:, 0].tolist(), q[:, 1].tolist())):
        f = int(face_of[li])
        other = seen.setdefault((v, a, b), f)
        if other != f:
            ra, rb = find(f), find(other)
            if ra != rb:
                parent[ra] = rb
    roots = np.array([find(f) for f in range(n)])[face_of]
    order = np.argsort(roots, kind="stable")
    r, u = roots[order], uv[order]
    cuts = np.flatnonzero(np.diff(r)) + 1
    lo = np.minimum.reduceat(u, np.r_[0, cuts], axis=0)
    hi = np.maximum.reduceat(u, np.r_[0, cuts], axis=0)
    return (hi - lo).tolist()


def give_area(objects):
    """A piece the unwrap left with no area in the lightmap — Blender's
    unwrap fails to solve an island now and then, and a piece of slivers
    alone unwraps to nothing — would get a room of the atlas with none, and
    no light: box-projected instead, at the texels per metre its neighbours
    got. One with no surface at all gets a speck, so it still has a place
    in the atlas."""
    flat = [obj for obj in objects if uv_area(obj) <= 1e-12]
    if not flat:
        return
    def surface(obj):
        return sum(p.area for p in obj.data.polygons)
    # The house's UV units per metre before each piece's own density.
    rates = sorted(math.sqrt(uv_area(obj) / surface(obj)) * obj.get("_density", 1.0)
                   for obj in objects if uv_area(obj) > 1e-12 and surface(obj) > 1e-9)
    rate = rates[len(rates) // 2] if rates else 1.0
    for obj in flat:
        geo = surface(obj)
        log("  no lightmap area:", obj.name, len(obj.data.polygons), "faces,", f"{geo:.5f} m2")
        if geo > 1e-9:
            edit([obj])
            bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, scale_to_bounds=False)
            bpy.ops.object.mode_set(mode="OBJECT")
        # Fetched after the projection: edit mode rebuilds the mesh's data.
        data = obj.data.uv_layers[LIGHTMAP_UV].data
        if geo > 1e-9 and uv_area(obj) > 1e-12:
            k = rate / obj.get("_density", 1.0) / math.sqrt(uv_area(obj) / geo)
            coords = np.empty(len(data) * 2, dtype=np.float64)
            data.foreach_get("uv", coords)
            data.foreach_set("uv", (coords * k).astype(np.float32))
        else:
            # Each face a speck of its own, a texel or so across.
            e = 1e-4
            for poly in obj.data.polygons:
                ox, oy = (poly.index % 64) * 2 * e, (poly.index // 64) * 2 * e
                for i, li in enumerate(poly.loop_indices):
                    a = 2 * math.pi * i / max(poly.loop_total, 3)
                    data[li].uv = (ox + e * (1 + math.cos(a)) / 2, oy + e * (1 + math.sin(a)) / 2)


def zone_rects(need, gap):
    """The unit square cut into a rectangle for each zone, each of the area
    it needs (in proportion), as near square as they will go: the zones
    parted, largest first, into two sets as near equal as they will go, the
    square cut across its longer side in that proportion, and each part
    cut again for its set, down to one zone. `gap` is left between the
    rectangles. Returns [u, v, width, height] for each."""
    order = sorted(need, key=need.get, reverse=True)
    rects = {}

    def cut(zones, x, y, w, h):
        if len(zones) == 1:
            rects[zones[0]] = [x + gap / 2, y + gap / 2, max(w - gap, 1e-6), max(h - gap, 1e-6)]
            return
        total = sum(need[z] for z in zones)
        running, split = 0.0, 1
        for i in range(1, len(zones)):
            if abs(running + need[zones[i - 1]] - total / 2) > abs(running - total / 2) and i > 1:
                break
            running += need[zones[i - 1]]
            split = i
        share = sum(need[z] for z in zones[:split]) / total
        if w >= h:
            cut(zones[:split], x, y, w * share, h)
            cut(zones[split:], x + w * share, y, w * (1 - share), h)
        else:
            cut(zones[:split], x, y, w, h * share)
            cut(zones[split:], x, y + h * share, w, h * (1 - share))

    cut(order, 0.0, 0.0, 1.0, 1.0)
    return rects


def pack_into(objects, rect, margin):
    """Pack these objects' islands into a rectangle of the atlas, [u, v,
    width, height]: Blender's packer, told to pack into the box the islands
    are already in, with two specks marking the rectangle's corners so that
    box is the rectangle. `margin` is in UV units, as for the atlas as a
    whole."""
    u0, v0, w, h = rect
    # In the rectangle to start with, however they lie.
    lo, hi = uv_bounds(objects)
    k = 0.5 * min(w / max(hi[0] - lo[0], 1e-9), h / max(hi[1] - lo[1], 1e-9))
    for obj in objects:
        data = obj.data.uv_layers[LIGHTMAP_UV].data
        coords = np.empty(len(data) * 2, dtype=np.float64)
        data.foreach_get("uv", coords)
        coords = (coords.reshape(-1, 2) - lo) * k + (u0 + w / 4, v0 + h / 4)
        data.foreach_set("uv", coords.ravel().astype(np.float32))
    me = bpy.data.meshes.new("corners")
    me.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0), (5, 0, 0), (6, 0, 0), (5, 1, 0)], [], [(0, 1, 2), (3, 4, 5)])
    uv = me.uv_layers.new(name=LIGHTMAP_UV)
    e = 1e-7
    for loop, corner in zip(range(6), [(u0, v0), (u0 + e, v0), (u0, v0 + e),
                                        (u0 + w - e, v0 + h - e), (u0 + w, v0 + h - e), (u0 + w - e, v0 + h)]):
        uv.data[loop].uv = corner
    corners = bpy.data.objects.new("corners", me)
    bpy.context.scene.collection.objects.link(corners)
    edit(objects + [corners])
    bpy.ops.uv.pack_islands(udim_source="ORIGINAL_AABB", rotate=True, rotate_method="AXIS_ALIGNED", scale=True,
                            margin_method="FRACTION", margin=margin, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.data.objects.remove(corners, do_unlink=True)
    bpy.data.meshes.remove(me)


def uv_bounds(objects):
    """The corners of the box round these objects' lightmap UVs."""
    lo = np.array([np.inf, np.inf])
    hi = -lo
    for obj in objects:
        data = obj.data.uv_layers[LIGHTMAP_UV].data
        if not len(data):
            continue
        coords = np.empty(len(data) * 2, dtype=np.float64)
        data.foreach_get("uv", coords)
        coords = coords.reshape(-1, 2)
        lo = np.minimum(lo, coords.min(axis=0))
        hi = np.maximum(hi, coords.max(axis=0))
    return lo, hi


def unwrap(objects, settings, size):
    """A second UV set on every object, packed into one shared atlas, a
    square of it for each room (pack_zones), whose squares it returns.

    Cut where the surface turns sharply — the corner of a room, the edge
    of a box: the light changes there anyway, and a texel straddling the
    corner would carry one face's light onto the other. Anywhere a curved
    surface still has to be cut to lie flat, the cuts smart projection
    would make. Then each piece is laid flat with as little stretch as it
    will take (Blender's angle-based unwrap), so a texel covers the
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
    # Angle-based, not minimum-stretch: on Ladonia's 22 thousand islands the
    # minimum-stretch solver failed islands now and then, and from one run
    # to the next left from 6% to 85% of the surface off an even texel
    # density (a bedroom floor with no lightmap at all); angle-based gives
    # every run 100% within a fifth, in half the time.
    bpy.ops.uv.unwrap(method="ANGLE_BASED", fill_holes=True, correct_aspect=True, margin=0.0)
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

    # Packed square to the atlas room by room, each island turned to lie
    # along it: a wall's edge, or a shadow along a skirting, then runs along
    # a row of texels rather than across them in steps.
    # BAKE_CHECKPOINT=<file.blend>: saved here, unpacked, for working on the
    # packing without the twenty minutes before it.
    if os.environ.get("BAKE_CHECKPOINT"):
        bpy.ops.wm.save_as_mainfile(filepath=os.environ["BAKE_CHECKPOINT"], copy=True)
        log("checkpoint saved:", os.environ["BAKE_CHECKPOINT"])
    t = time.time()
    rects = pack_zones(objects, size)
    log("packed", len(rects), "zones", round(time.time() - t, 1), "s")
    return rects


def stretch_report(objects):
    """How evenly the unwrap spreads texels: the share of the surface whose
    texels per square metre are within a fifth of the usual, and the worst
    tenth's."""
    ratios, areas = [np.zeros(0)], [np.zeros(0)]
    for obj in objects:
        surface = face_areas(obj)
        kept = surface >= 1e-8
        ratios.append(uv_areas(obj)[kept] / surface[kept])
        areas.append(surface[kept])
    ratios, areas = np.concatenate(ratios), np.concatenate(areas)
    typical = np.median(ratios[ratios > 0]) if ratios.size else 1
    r = ratios / typical
    even = areas[(r > 0.8) & (r < 1.25)].sum() / areas.sum()
    return f"{even * 100:.1f}% of the surface within 20% of even texel density"


def texel_size(objects, size):
    """Metres per texel for the house, as packed: its surface area over the
    atlas area its islands took."""
    area = 0.0
    covered = 0.0
    for obj in objects:
        if density_hint(obj) != 1.0:
            continue
        area += float(face_areas(obj).sum())
        covered += uv_area(obj)
    return math.sqrt(area / max(covered * size * size, 1))


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


def sky_world(file, ceiling, turn, strength, keep=None, tint=None):
    """A site's own sky (scripts/bake-public.mjs's landscapeSky): its HDR,
    with the sun clipped out of it as the live view clips it (shared/sky.js's
    findSun: every pixel brighter than `ceiling` brought down to it) — the
    sun is a light of its own (sun()) — and at dusk greyed and tinted
    (`keep`, `tint`) as the live view's night has it on the walls. Turned
    `turn` degrees about the upright, as three turns it: three's turn about
    +Y is Blender's about +Z, and a Texture mapping turns the picture, not
    the way looked in. The Background node keeps its name, for lit_by."""
    image = bpy.data.images.load(file, check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape(-1, 4)[:, :3]
    weights = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lum = rgb @ weights
    over = lum > ceiling
    rgb[over] *= (ceiling / lum[over])[:, None]
    if keep is not None:
        lum = rgb @ weights
        rgb[:] = (lum[:, None] + (rgb - lum[:, None]) * keep) * np.array(tint or (1, 1, 1), dtype=np.float32)
    clipped = bpy.data.images.new(f"{image.name}-sky", width, height, alpha=True, float_buffer=True)
    clipped.colorspace_settings.name = "Linear Rec.709"
    clipped.pixels.foreach_set(pixels)
    bpy.data.images.remove(image)

    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.name = "Background"
    bg.inputs["Strength"].default_value = strength
    coords = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.vector_type = "TEXTURE"
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(turn))
    texture = nt.nodes.new("ShaderNodeTexEnvironment")
    texture.image = clipped
    texture.interpolation = "Linear"
    nt.links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
    nt.links.new(texture.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    log("sky", os.path.basename(file), f"turned {turn}°, strength {strength},", int(over.sum()), "sun pixels clipped")


def sun(name, position, color, strength, angle=1.0):
    """A sun shining from `position` (the app's Y-up axes) towards the origin.
    Returns it as the public view lights with it when its light is live:
    where it shines from, its colour (linear), its strength in W/m² — which
    a three.js DirectionalLight takes as its intensity as it is — and its
    size in the sky, in degrees."""
    data = bpy.data.lights.new(name, "SUN")
    data.energy = strength
    data.color = color
    data.angle = math.radians(angle)
    obj = bpy.data.objects.new(name, data)
    obj["sun"] = True
    bpy.context.scene.collection.objects.link(obj)
    x, y, z = position
    direction = Vector((x, -z, y)).normalized()
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return {"position": list(position), "color": [round(c, 5) for c in color], "strength": strength, "angle": angle}


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


#: How much light a tree's crown lets through, as its stand-in has it.
CROWN_OPENNESS = 0.25


def tree_shade(trees, bushes=()):
    """A stand-in for each of the garden's trees and bushes
    (shared/vegetation.js), for the shade they cast on the lawn and the
    house: a tree's opaque trunk, and a crown of each's size that lets a
    little light through. The public view draws the trees and bushes
    themselves, live; these are never baked or exported, only in the way
    of the light."""
    if not trees and not bushes:
        return []
    bark = bpy.data.materials.new("tree-bark")
    bark.diffuse_color = (0.12, 0.08, 0.05, 1.0)
    leaves = bpy.data.materials.new("tree-crown")
    leaves.use_nodes = True
    nodes = leaves.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (0.08, 0.16, 0.04, 1.0)
    principled.inputs["Alpha"].default_value = 1.0 - CROWN_OPENNESS
    made = []
    for tree in trees:
        x, y, z = tree["x"], tree["y"], tree["z"]
        bottom = tree["crownY"] - tree["crown"] * 0.35
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=tree["trunk"], depth=bottom, location=(x, -z, y + bottom / 2))
        trunk = bpy.context.active_object
        trunk.data.materials.append(bark)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(x, -z, y + tree["crownY"]))
        crown = bpy.context.active_object
        crown.scale = (tree["spread"], tree["spread"], tree["crown"])
        crown.data.materials.append(leaves)
        for obj in (trunk, crown):
            obj.name = f"{tree['id']}-shade"
            obj.visible_camera = False
        made += [trunk, crown]
    for bush in bushes:
        x, y, z = bush["x"], bush["y"], bush["z"]
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=(x, -z, y + bush["height"] * 0.5))
        crown = bpy.context.active_object
        crown.scale = (bush["radius"], bush["radius"], bush["height"] * 0.5)
        crown.data.materials.append(leaves)
        crown.name = f"{bush['id']}-shade"
        crown.visible_camera = False
        made.append(crown)
    log(len(trees), "trees' and", len(bushes), "bushes' shade")
    return made


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


def garden_lights(lamps):
    """The garden's own lights for the evening (the site's `lights` and its
    pools': World/Flora/lights.js, as scripts/bake-public.mjs has them):
    uplights in the ground, downlights under the pergolas, a pool lit from
    under its water. They come on with the night and no visitor turns them
    off, so they are part of the night's own light — on the terrace, the
    pool's walls, the house's — not a switch. Each is marked `garden`, for
    their straight light to be kept out of the light probes (lit_by): what
    moves is lit by the view's own live garden lamps."""
    for k, lamp in enumerate(lamps):
        spot = lamp["kind"] == "spot"
        data = bpy.data.lights.new(f"garden:{k}", "SPOT" if spot else "POINT")
        data.energy = lamp["power"]
        data.color = srgb(lamp["color"])
        data.shadow_soft_size = lamp.get("size", 0.05)
        if spot:
            data.spot_size = lamp["angle"]
            data.spot_blend = lamp.get("blend", 0.5)
        obj = bpy.data.objects.new(data.name, data)
        obj["garden"] = True
        bpy.context.scene.collection.objects.link(obj)
        x, y, z = lamp["position"]
        obj.location = (x, -z, y)
        if spot:
            tx, ty, tz = lamp["target"]
            # A light shines down its -Z.
            obj.rotation_euler = (Vector((tx, -tz, ty)) - Vector((x, -z, y))).to_track_quat("-Z", "Y").to_euler()
    if lamps:
        log(len(lamps), "garden lights in the night")


def light(variant, settings):
    """Light the scene for a variant. Returns its sun (or moon), as sun()
    describes it."""
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    portals(settings.get("portals", []))
    preset = settings["preset"]
    own = settings.get("sky")
    if variant == "day":
        if own:
            sky_world(own["day"]["file"], own["day"]["ceiling"], own["turn"], settings["day"]["sky"])
        else:
            sky = srgb(preset["hemi"]["sky"])
            world(zenith=sky, horizon=srgb(preset["background"]), ground=srgb(preset["hemi"]["ground"]),
                  strength=settings["day"]["sky"])
        shining = sun("sun", preset["sun"]["position"], srgb(preset["sun"]["color"]), settings["day"]["sun"],
                      angle=preset["sun"].get("angle", 1.0))
        # A space published before it had light fittings of its own: a
        # light in every room, baked in, as then.
        if settings["day"].get("lights"):
            room_lights(settings["rooms"], settings["day"]["lights"], srgb("#ffe2bf"))
    else:
        if own:
            dusk = own["night"]
            sky_world(dusk["file"], dusk["ceiling"], own["turn"], settings["night"]["sky"],
                      keep=dusk.get("keep"), tint=dusk.get("tint"))
        else:
            world(zenith=srgb("#1a2440"), horizon=srgb("#2a3350"), ground=srgb("#0c0d10"),
                  strength=settings["night"]["sky"])
        shining = sun("moon", [-9, 16, -6], srgb("#b8c8ff"), settings["night"]["moon"], angle=0.6)
        if settings["night"].get("lights"):
            room_lights(settings["rooms"], settings["night"]["lights"], srgb("#ffd6a3"))
        garden_lights(settings.get("garden", []))
    return shining


@contextmanager
def lit_by(part):
    """Part of the light meanwhile: "sun", the sun (or the moon) alone —
    the sky dark and every other light off — or "rest", everything but it.

    A public view whose light is live draws the sun's straight light
    itself, with shadows that follow the doors, the people and the car, and
    takes the rest from a lightmap without it: the sky's light through the
    windows, and everything bounced. So the two are baked apart."""
    lights = [obj for obj in bpy.data.objects if obj.type == "LIGHT" and not obj.data.cycles.is_portal]
    # (And, for the light probes: "garden", the garden's own lamps alone, and "house", the rest but them — garden_lights.)
    shines = {
        "sun": lambda obj: bool(obj.get("sun")),
        "rest": lambda obj: not obj.get("sun"),
        "garden": lambda obj: bool(obj.get("garden")),
        "house": lambda obj: not obj.get("sun") and not obj.get("garden"),
    }[part]
    off = [obj for obj in lights if not shines(obj)]
    hidden = [obj.hide_render for obj in off]
    for obj in off:
        obj.hide_render = True
    background = bpy.context.scene.world.node_tree.nodes.get("Background") if bpy.context.scene.world else None
    strength = background.inputs["Strength"].default_value if background else None
    if background and part in ("sun", "garden"):
        background.inputs["Strength"].default_value = 0.0
    try:
        yield
    finally:
        for obj, was in zip(off, hidden):
            obj.hide_render = was
        if background:
            background.inputs["Strength"].default_value = strength


def light_switches(switches):
    """The light of some switches' fittings, and nothing else: no sky, no
    sun — what the public view adds to the day or the night when a switch
    is on. One switch, or several that light no room in common
    (switch_batches), each room then holding one switch's light. Each light
    is as big as its fitting says: a lamp's bulb small, inside its shade; a
    ceiling light's bigger, inside its glass."""
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    black = (0.0, 0.0, 0.0)
    world(zenith=black, horizon=black, ground=black, strength=0.0)
    for switch in switches:
        for k, fitting in enumerate(switch["lights"]):
            data = bpy.data.lights.new(f"{switch['id']}:{k}", "POINT")
            data.energy = fitting["power"]
            data.color = srgb(fitting["color"])
            data.shadow_soft_size = fitting.get("size", 0.035 if fitting["kind"] == "lamp" else 0.12)
            obj = bpy.data.objects.new(data.name, data)
            bpy.context.scene.collection.objects.link(obj)
            x, y, z = fitting["position"]
            obj.location = (x, -z, y)


#: How far apart, in metres, the points of a room's air lie that a lamp is
#: looked for a straight line to (lamp_sight), and how far off the floor
#: and the ceiling the lowest and the highest are.
SIGHT_STEP = 0.5
SIGHT_INSET = 0.1
#: The most switches lit in one pass (switch_batches).
SWITCHES_MOST = 32


def blockers(objects):
    """Everything that stands in a lamp's light, as one tree to cast rays
    at: every face but the lamps' own glass and bulbs, and the scenery that
    casts no shadow — as Cycles has them (RAYS)."""
    points, triangles = [], []
    base = 0
    for obj in objects:
        if obj.get("glow") or not obj.visible_shadow:
            continue
        me = obj.data
        n = len(me.vertices)
        if not n or not len(me.polygons):
            continue
        co = np.empty(n * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        m = np.array(obj.matrix_world)
        points.append(co.reshape(n, 3) @ m[:3, :3].T + m[:3, 3])
        me.calc_loop_triangles()
        corners = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", corners)
        triangles.append(corners.reshape(-1, 3) + base)
        base += n
    if not points:
        return None
    return BVHTree.FromPolygons(np.concatenate(points).tolist(), np.concatenate(triangles).tolist())


def lamp_sight(switches, rooms, objects, skip=None):
    """Which rooms each switch's lamps shine straight into: for each switch,
    the ids of the rooms with a point of their air — a lattice SIGHT_STEP
    apart, at four heights — that one of its lamps has a clear line to,
    through a window, across the garden into another building's, down a run
    of doorways. `skip(k)`: rooms not worth asking of switch k (its own,
    which it lights anyway). Returns a list of sets."""
    tree = blockers(objects)
    lattice = {}
    for room in rooms:
        xs = [x for x, _ in room["polygon"]]
        zs = [z for _, z in room["polygon"]]
        x, z = np.meshgrid(np.arange(min(xs) + SIGHT_STEP / 2, max(xs), SIGHT_STEP),
                           np.arange(min(zs) + SIGHT_STEP / 2, max(zs), SIGHT_STEP))
        x, z = x.ravel(), z.ravel()
        inside = in_polygon(x, z, room["polygon"])
        x, z = x[inside], z[inside]
        low, high = room["elevation"] + SIGHT_INSET, room["elevation"] + room["height"] - SIGHT_INSET
        heights = sorted({round(low + (high - low) * k / 3, 3) for k in range(4)})
        # In Blender's axes: the app's (x, y, z) is (x, -z, y).
        lattice[room["id"]] = [Vector((float(a), float(-b), float(y))) for y in heights for a, b in zip(x, z)]
    seen = []
    for k, switch in enumerate(switches):
        lamps = [Vector((x, -z, y)) for x, y, z in (fitting["position"] for fitting in switch["lights"])]
        without = skip(k) if skip else ()
        into = set()
        for zone, points in lattice.items():
            if zone in without or tree is None:
                continue
            for lamp in lamps:
                clear = False
                for point in points:
                    way = point - lamp
                    distance = way.length
                    if distance < 1e-6 or tree.ray_cast(lamp, way / distance, distance)[0] is None:
                        clear = True
                        break
                if clear:
                    into.add(zone)
                    break
        seen.append(into)
    return seen


def switch_batches(switches, lit, settings, objects):
    """The switches to bake (`lit`: the rooms each is baked into) as
    passes, lists of their indices: ONE SWITCH A PASS — unless a developer
    asks otherwise (PASSES, which says why not), and then those that light
    no room in common by the rule asked for (lib/batches.py), none of them
    with a lamp in a straight line to a room of another's (lamp_sight)."""
    links = settings.get("links")
    if PASSES is None or links is None or "switches" in APART or len(switches) < 2:
        return [[k] for k in range(len(switches))]
    if PASSES == "loose":
        passes = batches.batches(lit, {}, most=SWITCHES_MOST)
        log("switches:", len(switches), "lit in", len(passes), "passes, LOOSELY — NOT A BAKE TO KEEP:", " ".join(str(len(members)) for members in passes))
        return passes
    t = time.time()
    joined = PASSES != "rooms"
    # What a lamp is kept from by the rooms themselves is not asked of its line of sight.
    part = batches.parts(links)
    if joined:
        near = [{room for room in part if part[room] in {part.get(own, own) for own in rooms}} | set(rooms) for rooms in lit]
    else:
        near = [batches.reach(rooms, links) for rooms in lit]
    sight = lamp_sight(switches, settings.get("rooms", []), objects, skip=lambda k: near[k])
    into = [set(rooms) for rooms in lit]
    passes = batches.batches(lit, links, sees=lambda a, b: bool(sight[a] & into[b]), most=SWITCHES_MOST, joined=joined)
    blind = batches.batches(lit, links, most=SWITCHES_MOST, joined=joined)
    log("switches:", len(switches), "lit in", len(passes), "passes — NOT A BAKE TO KEEP:",
        " ".join(str(len(members)) for members in passes) + ";", len(set(part.values())), "parts of the site no opening joins,",
        len(blind), "passes without the lines of sight,", sum(1 for rooms in sight if rooms),
        "switches with a straight line into", "another part's room," if joined else "a room not theirs,", round(time.time() - t, 1), "s")
    for k, rooms in enumerate(sight):
        if rooms:
            log("  ", switches[k]["id"], "shines straight into", ", ".join(sorted(rooms)))
    return passes


def door_batches(doors, links):
    """The doors to bake shut (the rooms either side of each) as passes,
    lists of their indices: those in parts of the site that no opening
    joins — a flat and the flat next door, two buildings — shut together
    (lib/batches.py). Within a part, a door a pass: a door shut dims rooms
    it does not touch — Wrenfield's front door, shut in the same pass as
    the loft bathroom's, took a twentieth off the loft, which has its
    daylight up the stairs from the landing over the hall. One door a pass
    without the rooms' links (`links`), or with BAKE_APART=doors."""
    if links is None or "doors" in APART or len(doors) < 2:
        return [[k] for k in range(len(doors))]
    joined = PASSES not in ("rooms", "loose")
    passes = batches.batches(doors, links, joined=joined)
    if len(passes) < len(doors):
        log("doors:", len(doors), "shut in", len(passes), "passes of those in parts of the site no opening joins:" if joined
            else "passes of those whose rooms do not touch — BY THE ROOMS ALONE, NOT A BAKE TO KEEP:", " ".join(str(len(members)) for members in passes))
    return passes


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


#: How the public view draws the light baked here: Blender's Filmic view
#: transform, at Blender's exposure (in stops) — the app does the same
#: (frontend/Experience/Utils/filmic.js). A bake is light alone, scene-linear
#: and unclipped, whatever the view: Filmic is applied once, when the light
#: has met the surfaces' colours, never baked in.
VIEW = dict(transform="Filmic", look="None", exposure=0.0)

#: How far over its scale a lightmap keeps light (encode). Filmic reaches
#: white at 16 times white, well short of it.
HEADROOM = 64.0
#: The name the public view knows that encoding by.
ENCODING = "reinhard"


def use_view(scene):
    """Colour-manage the scene as the public view draws it, so anything
    rendered from this file — a debug render, the unwrapped .blend opened
    to look at — shows the light as the public view will."""
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = VIEW["transform"]
    scene.view_settings.look = VIEW["look"]
    scene.view_settings.exposure = VIEW["exposure"]
    scene.view_settings.gamma = 1.0


def cycles(samples, seed=0):
    scene = bpy.context.scene
    use_view(scene)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.seed = seed
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
    scene.cycles.sample_clamp_indirect = CLAMP
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
    HANDED["lightmap"] += 1


def bake_pass(objects, size, samples, parts):
    """One pass of the light on every wide face, as an array."""
    image = bpy.data.images.new("lightmap-pass", size, size, float_buffer=True, alpha=False)
    cycles(samples, SEED)
    bake_image(objects, image, type="DIFFUSE", pass_filter=parts)
    rgb = pixels_of(image)
    bpy.data.images.remove(image)
    return rgb


def bake_lightmap(objects, variant, size, samples, written, covered, normal, debug=None, tiles=None):
    """The light on every wide face, denoised, as arrays: all of it, and all
    but the sun's straight light (lit_by) — what a public view whose light
    is live takes from the lightmap, drawing the sun itself.

    The light straight from the sun, the sky and the lamps has the sharp
    edges — a window's shadow on the floor — but little grain, so it is
    baked at the lightmap's full size with a quarter of the samples: the
    sun's apart from the rest's. The light bounced off everything else has
    the grain — the sunlit patch of floor, found only now and then by a ray
    from across the room, is most of it — but changes slowly across a
    surface, so it is baked at half the size with four times the samples,
    for the same time: four times the samples a texel, half the grain. Each
    is denoised, and the bounced light scaled up to go with the others.

    Covered texels, and the empty atlas round the islands, are filled from
    the light round them first (spread).

    With `tiles` (tiles_of), only those squares of the atlas are denoised
    (denoise_tiles) — a pass over a few surfaces, the ceilings' tops; the
    rest of what is returned is then not to be used."""
    t = time.time()
    if "sun" in CUT:
        direct = bake_pass(objects, size, max(32, samples // 4), {"DIRECT"})
        sun = np.zeros_like(direct)
    else:
        with lit_by("rest"):
            direct = bake_pass(objects, size, max(32, samples // 4), {"DIRECT"})
        with lit_by("sun"):
            sun = bake_pass(objects, size, max(32, samples // 4), {"DIRECT"})
    bounced = bake_pass(objects, size // 2, samples * 4, {"INDIRECT"})
    log(variant, "lightmap baked", round(time.time() - t, 1), "s")

    valid = written & ~covered
    clean = denoise if tiles is None else (lambda rgb, guide: denoise_tiles(rgb, guide, tiles, TILE * rgb.shape[0] // size))
    direct = clean(spread(direct, valid), normal)
    if "sun" not in CUT:
        sun = clean(spread(sun, valid), normal)
    valid_half = shrink(valid, every=True)
    normal_half = spread(half(normal), shrink(written))
    bounced = clean(spread(bounced, valid_half), normal_half)
    if debug:
        save_exr(direct, f"{debug}-direct.exr")
        save_exr(sun, f"{debug}-sun.exr")
        save_exr(bounced, f"{debug}-bounced.exr")
    soft = direct + double(bounced)
    return soft + sun, soft


#: A switch's layer in a room is written a second time, held its own way
#: (encode_own, main: `own`), where the room's middle light of it is under
#: this share of the switch's scale — under some 100 of the 255 levels, a
#: step of 2% of the light or more each — and LAYER_LEAST is the least
#: light its curve gives a share of its levels to (lightzones.room_curve):
#: what a view shows as next to black at the most it exposes a room by...
LAYER_OWN = 0.15
LAYER_LEAST = 0.0005
#: ...nor less than this share of the room's own middle daylight: under it
#: a level is still well under a hundredth of the light the spill is seen
#: beside, and what the curve would hold there is the bake's grain — an
#: eighth of those layers' bytes (Wrenfield: 2.61 MB fetched for every
#: switch → 2.29, where the one-scale layers are 1.61).
LAYER_BESIDE = 4
#: A switch's light is saved zone by zone, as crops of the atlas this many
#: texels square at a time — so a phone's copy at half the size, and its
#: colour at half again, still come out whole.
CROP_ALIGN = 16
#: The least of a switch's light a thin face in its own room keeps, as a
#: share of its brightest (its scale)...
SWITCH_REACH = 0.01
#: ...and in a room next door, where it comes through a doorway, the least
#: it must have on average: fainter spill than this is left to the walls
#: and floors, whose lightmaps have it all. Every such attribute is the
#: whole mesh's vertices over again, in every visitor's download.
SWITCH_SPILL = 0.02


def crop_box(rect, size):
    """A zone's rectangle of the atlas ([u, v, width, height], pack_zones)
    as texels, [x0, y0, x1, y1] from the bottom left, out to CROP_ALIGN."""
    u, v, w, h = rect
    snap = lambda value, up: int(math.ceil(value / CROP_ALIGN) if up else math.floor(value / CROP_ALIGN)) * CROP_ALIGN
    return [max(0, snap(u * size, False)), max(0, snap(v * size, False)),
            min(size, snap((u + w) * size, True)), min(size, snap((v + h) * size, True))]


def bake_switch(objects, zones, rects, size, samples, written, covered, normal, seams, part=None, label="switch"):
    """One switch's light on the wide faces of the rooms it reaches, zone by
    zone: baked as the day's is (bake_lightmap), then spread, denoised and
    stitched over each zone's crop of the atlas alone — its own texels and
    no one else's — rather than over the whole of it. Returns {zone: (rgb,
    bounced)}: all of its light, and only what is bounced — what a public
    view whose light is live takes from the lightmap, lighting the lamps
    themselves.

    With `part` ("rest", lit_by), the light straight from the lights is
    only that part of it: so a door's rooms are baked again shut
    (bake_door_states), the light bounced all of it."""
    t = time.time()
    with lit_by(part) if part else nullcontext():
        direct = bake_pass(objects, size, max(32, samples // 4), {"DIRECT"})
    bounced = bake_pass(objects, size // 2, samples * 4, {"INDIRECT"})
    valid = written & ~covered
    out = {}
    for zone in zones:
        x0, y0, x1, y1 = crop_box(rects[zone], size)
        # The zone's own rectangle, not what the crop takes in round it.
        u, v, w, h = rects[zone]
        own = np.zeros((y1 - y0, x1 - x0), dtype=bool)
        own[max(0, int(v * size) - y0):int(math.ceil((v + h) * size)) - y0,
            max(0, int(u * size) - x0):int(math.ceil((u + w) * size)) - x0] = True
        here = valid[y0:y1, x0:x1] & own
        light = denoise(spread(direct[y0:y1, x0:x1], here), normal[y0:y1, x0:x1])
        here_half = shrink(here, every=True)
        normal_half = spread(half(normal[y0:y1, x0:x1]), shrink(written[y0:y1, x0:x1] & own))
        bounce = double(denoise(spread(bounced[y0 // 2:y1 // 2, x0 // 2:x1 // 2], here_half), normal_half))
        box = (x0, y0, x1, y1)
        out[zone] = (stitch_crop(light + bounce, seams, box, size), stitch_crop(bounce, seams, box, size))
    log(label, "baked over", len(zones), "zones", round(time.time() - t, 1), "s")
    return out


def stitch_crop(rgb, seams, box, size):
    """stitch over a crop of the atlas: the seams wholly inside it, moved
    into its own coordinates."""
    x0, y0, x1, y1 = box
    uv_a, uv_b = seams
    if not len(uv_a):
        return rgb
    inside = lambda uv: ((uv[:, 0] * size >= x0) & (uv[:, 0] * size < x1)
                         & (uv[:, 1] * size >= y0) & (uv[:, 1] * size < y1))
    keep = inside(uv_a) & inside(uv_b)
    local = lambda uv: (uv[keep] * size - (x0, y0)) / (x1 - x0, y1 - y0)
    return stitch(rgb, local(uv_a), local(uv_b))


#: A door's light is kept at half the lightmap's texels each way
#: (bake_door_states): what a door lets through changes slowly across a
#: room, and there is a crop of a room for each of its doors.
DOOR_SHRINK = 2
#: Round each crop in the doors' atlas, texels of its own edge carried on,
#: so the GPU blending texels never reaches the next one's.
DOOR_PAD = 4


def door_leaf(door):
    """A room door's leaf, shut: a box square in the doorway, the colour of
    its paint (scripts/bake-public.mjs has it as World/Door.js hangs it).
    What is in the way of the light, and throws some of it back, while the
    rooms either side are baked with it shut."""
    (x, y, z), (w, h, t), (dx, dz) = door["centre"], door["size"], door["direction"]
    along, across = np.array([dx, 0.0, dz]), np.array([-dz, 0.0, dx])
    up = np.array([0.0, 1.0, 0.0])
    corners = []
    for a in (-1, 1):
        for b in (-1, 1):
            for c in (-1, 1):
                p = np.array([x, y, z]) + along * a * w / 2 + up * b * h / 2 + across * c * t / 2
                # The app's (x, y, z) is Blender's (x, -z, y).
                corners.append((p[0], -p[2], p[1]))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me = bpy.data.meshes.new(f"leaf:{door['id']}")
    me.from_pydata(corners, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.new(me.name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*srgb(door["color"]), 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
    me.materials.append(mat)
    obj = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def box_sum(values, reach):
    """Each texel's sum over the box `reach` texels each way round it."""
    k = 2 * reach + 1
    c = np.cumsum(np.pad(values.astype(np.float64), reach), axis=0)
    c = np.vstack([np.zeros((1, c.shape[1])), c])
    rows = c[k:] - c[:-k]
    c = np.cumsum(rows, axis=1)
    c = np.hstack([np.zeros((c.shape[0], 1)), c])
    return c[:, k:] - c[:, :-k]


def door_ratio(closed, opened, valid, reach=4):
    """How much of a room's light stays with a door shut, texel by texel:
    the light baked with it shut over the light baked with it open, each
    averaged over the `valid` texels a few round it first — two bakes'
    grain, over each other, would otherwise come out as speckle. 0 to 1:
    where the leaf throws back more than it keeps out, as it is taken as
    leaving the light as it was. Returns the ratio, and the share of the
    room's light that stays, all told."""
    weights = np.array([0.2126, 0.7152, 0.0722])
    shut, open_ = closed @ weights, opened @ weights
    count = np.maximum(box_sum(valid, reach), 1e-9)
    shut_near = box_sum(shut * valid, reach) / count
    open_near = box_sum(open_ * valid, reach) / count
    floor = 0.01 * float(np.percentile(open_[valid], 99)) if valid.any() else 1e-6
    ratio = np.clip((shut_near + floor) / (open_near + floor), 0.0, 1.0)
    share = float(np.clip(shut[valid].sum() / max(open_[valid].sum(), 1e-9), 0.0, 1.0)) if valid.any() else 1.0
    return ratio, share


def pack_crops(crops, width, pad):
    """Crops of one value (arrays), shelf by shelf, tallest first, into an
    atlas `width` texels wide, each with `pad` texels of its edge carried
    on round it; the rest of it 1. Returns the atlas (rows from the bottom,
    as Blender's images) and each crop's bottom-left corner in it."""
    order = sorted(range(len(crops)), key=lambda i: -crops[i].shape[0])
    at = [None] * len(crops)
    x = y = shelf = 0
    for i in order:
        h, w = crops[i].shape
        if x + w + 2 * pad > width:
            x, y, shelf = 0, y + shelf, 0
        at[i] = (x + pad, y + pad)
        x += w + 2 * pad
        shelf = max(shelf, h + 2 * pad)
    height = max(16, int(math.ceil((y + shelf) / 16)) * 16)
    atlas = np.ones((height, width), dtype=np.float32)
    for crop, (x, y) in zip(crops, at):
        h, w = crop.shape
        atlas[y - pad:y + h + pad, x - pad:x + w + pad] = np.pad(crop, pad, mode="edge")
    return atlas, at


def bake_door_states(objects, doors, rects, size, samples, written, covered, normal, seams, out, skip=None, links=None):
    """Each room door shut in turn, its leaf in the doorway (door_leaf),
    and the rooms either side baked again (bake_switch, the light but the
    sun's straight light — what the view's indirect lightmap holds, baked
    with every door open, as the house has no leaves). What stays of the
    light, texel by texel, is kept (door_ratio), for the view to dim a room
    by as its doors close — a windowless WC to next to nothing, a bedroom
    with a window hardly at all — the sun's and the lamps' straight light
    shaded by the leaves themselves. `skip`, texels baked otherwise (the
    ceiling tops, roof off), are left as they are.

    What each is held against is those rooms baked again too, every door
    open, the same way, room by room: Cycles samples a texel alike in both,
    so where a door makes no difference the two bakes' grain is the same
    grain, and cancels — against the lightmap, denoised over the whole
    atlas, a dark room's grain alone came out as a door's doing.

    A room's doors each shut on their own: with two shut, what stays of
    each is taken together. Only by day: at night what comes through a
    door is as much of what there is, near enough.

    Doors in parts of the site that no opening joins are shut in the same
    pass (door_batches; `links`, which rooms open into which): each room's
    light is still that of its own door shut — and a pass, which hands the
    whole scene to Cycles, is one for each such set of doors rather than
    one a door.

    Written as one grey atlas of every door's rooms' crops at half the
    lightmap's texels (DOOR_SHRINK), and a phone's copy. Returns what
    bake.json says of it, or None with no doors."""
    t = time.time()
    valid = written & ~covered
    if skip is not None:
        valid = valid & ~skip
    crops, places = [], []
    rooms = sorted({zone for door in doors for zone in door["zones"] if zone in rects})
    everyone = [obj for obj in objects if obj.get("zone") in rooms]
    opened = bake_switch(everyone, rooms, rects, size, samples, written, covered, normal, seams, part="rest",
                         label="doors open") if everyone else {}
    todo = []
    for door in doors:
        here = [zone for zone in door["zones"] if zone in rects]
        if any(obj.get("zone") in here for obj in objects):
            todo.append((door, here))
    passes = door_batches([here for _, here in todo], links)
    stays = {}
    for together in passes:
        rooms_shut = [zone for k in together for zone in todo[k][1]]
        members = [obj for obj in objects if obj.get("zone") in rooms_shut]
        leaves = [door_leaf(todo[k][0]) for k in together]
        try:
            layers = bake_switch(members, rooms_shut, rects, size, samples, written, covered, normal, seams, part="rest",
                                 label="door shut" if len(together) == 1 else f"{len(together)} doors shut")
        finally:
            for leaf in leaves:
                material, mesh = leaf.data.materials[0], leaf.data
                bpy.data.objects.remove(leaf, do_unlink=True)
                bpy.data.meshes.remove(mesh)
                bpy.data.materials.remove(material)
        for k in together:
            door, here = todo[k]
            stays[k] = []
            for zone in here:
                closed, _ = layers[zone]
                x0, y0, x1, y1 = crop_box(rects[zone], size)
                u, v, w, h = rects[zone]
                own = np.zeros((y1 - y0, x1 - x0), dtype=bool)
                own[max(0, int(v * size) - y0):int(math.ceil((v + h) * size)) - y0,
                    max(0, int(u * size) - x0):int(math.ceil((u + w) * size)) - x0] = True
                here_valid = valid[y0:y1, x0:x1] & own
                ratio, share = door_ratio(closed, opened[zone][0], here_valid)
                # What was not baked here as the rest was stays as it is, and
                # the empty atlas round the islands carries their edges on.
                kept = here_valid.copy()
                if skip is not None:
                    kept |= skip[y0:y1, x0:x1]
                ratio[~here_valid] = 1.0
                ratio = spread(ratio[..., None], kept, reach=16)[..., 0]
                small = ratio
                for _ in range(DOOR_SHRINK - 1):
                    small = half(small[..., None])[..., 0]
                stays[k].append((small.astype(np.float32), (door["id"], zone, (x0, y0, x1, y1), share)))
            log("door", door["id"], "shut:", ", ".join(f"{zone} keeps {share * 100:.0f}%" for _, (_, zone, _, share) in stays[k]))
    # In the doors' own order, whatever passes they were baked in: the atlas is packed by it.
    for k in range(len(todo)):
        for crop, place in stays[k]:
            crops.append(crop)
            places.append(place)
    log("door states baked:", len(doors), "doors,", len(crops), "rooms,", round(time.time() - t, 1), "s")
    if not crops:
        return None

    width = size // DOOR_SHRINK
    atlas, at = pack_crops(crops, width, DOOR_PAD)
    height = atlas.shape[0]
    write_webp(np.repeat(atlas[..., None], 3, axis=-1), os.path.join(out, "doors.webp"), 90)
    description = {"file": "doors.webp", "size": [width, height], "doors": {}}
    if size > PHONE_SIZE:
        small, at_size = atlas, size
        while at_size > PHONE_SIZE:
            small, at_size = half(small[..., None])[..., 0], at_size // 2
        write_webp(np.repeat(small[..., None], 3, axis=-1), os.path.join(out, "doors-phone.webp"), 90)
        description["filePhone"] = "doors-phone.webp"
    log("wrote doors", f"{width}x{height}", f"{os.path.getsize(os.path.join(out, 'doors.webp')) / 1024:.0f} KB")
    for (door, zone, (x0, y0, x1, y1), share), crop, (x, y) in zip(places, crops, at):
        h, w = crop.shape
        description["doors"].setdefault(door, {})[zone] = {
            # Its room's crop of the lightmap, and where that is in the
            # doors' atlas, both in the view's (glTF) UVs — v down from the
            # top: [u, v, width, height].
            "rect": [x0 / size, 1 - y1 / size, (x1 - x0) / size, (y1 - y0) / size],
            "at": [x / width, 1 - (y + h) / height, w / width, h / height],
            # How much of the room's light stays, all told: for its thin
            # faces, and the light probes, which have no texels of it.
            "share": round(share, 4),
        }
    return description


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


def vertex_probes(objects, tree, size=0.002, grid=None):
    """What the light of the thin faces' vertices is baked on: a tiny
    triangle at each vertex's sampling point (sample_points), facing the
    way its faces do, all in one object that no ray sees.

    Baking the vertices themselves meant moving them to where they are
    sampled — and the mesh moved with them, so each sample sat on its own
    displaced surface, folded where the vertices had been pulled along
    it, half in its own shadow: the skirting came out at half the light
    of the wall above it. The probes leave the geometry where it is.

    Points of the light probes' grid (probe_grid) can be given too,
    `grid`: their indices and positions (Blender's axes); each is six
    triangles after the vertices', one facing each way (GRID_FACINGS), and
    the probe keeps their indices as "grid" and where they start as
    "grid_from", for read_grid. One object for both: Blender takes the
    best part of a second to set up each object it bakes.

    Returns the probe object and how many vertices each object has, in
    order, for bake_vertices to hand the light back."""
    points, facings, counts = [np.empty((0, 3))], [np.empty((0, 3))], []
    for obj in objects:
        p, f = sample_points(obj, tree)
        points.append(p)
        facings.append(f)
        counts.append(len(p))
    start = sum(counts)
    if grid is not None:
        indices, at = grid
        points.append(np.repeat(at, 6, axis=0))
        facings.append(np.tile(GRID_FACINGS, (len(indices), 1)))
    probe = probe_mesh("vertex-probes", np.concatenate(points), np.concatenate(facings), size)
    if grid is not None:
        probe["grid"] = [int(i) for i in grid[0]]
        probe["grid_from"] = start
    return probe, counts


def probe_mesh(name, points, facings, size=0.002):
    """An object of tiny triangles, one at each point facing the way given
    (Blender's axes), that no ray sees: what light is baked on at points
    in space (bake_vertices), each triangle's light that arriving there
    from the way it faces."""
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
    me = bpy.data.meshes.new(name)
    me.from_pydata(corners.tolist(), [], faces.tolist())
    me.update()
    for attribute in VERTEX_ATTRIBUTES.values():
        me.color_attributes.new(name=attribute, type="FLOAT_COLOR", domain="POINT")
    probe = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(probe)
    for ray in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(probe, ray, False)
    return probe




def zone_probes(objects, tree, grid=None):
    """The probes the vertices' light is baked on (vertex_probes), one set
    for each zone's objects — the thin faces, and the doors' probes — and
    the light probes' grid points in it (probe_grid), so a switch's light
    is baked on the probes of the rooms it reaches alone. Grid points
    inside the house's walls and floors are left out.
    Returns {zone: (objects, probe, counts)}."""
    by_zone = {}
    for obj in objects:
        by_zone.setdefault(obj.get("zone", OUTSIDE), []).append(obj)
    points = {}
    if grid is not None:
        for zone in set(grid["zone"][~grid["solid"]]):
            indices = np.flatnonzero((grid["zone"] == zone) & ~grid["solid"])
            # In Blender's axes: the app's (x, y, z) is (x, -z, y).
            at = grid["points"][indices][:, [0, 2, 1]] * np.array([1.0, -1.0, 1.0])
            points[zone] = (indices, at)
    return {zone: (by_zone.get(zone, []), *vertex_probes(by_zone.get(zone, []), tree, grid=points.get(zone)))
            for zone in sorted(set(by_zone) | set(points))}


#: The light probes' grid, in metres: across, up, and along (the app's x, y, z).
GRID_STEP = (1.0, 0.8, 1.0)
#: How far past the house's rooms it reaches, for the garden by the house...
GRID_MARGIN = 2.0
#: ...and how high above the ground floor, outside.
GRID_OUTSIDE_HEIGHT = 3.0
#: The six ways each probe looks, in the app's axes — +x, -x, +y, -y, +z, -z
#: — and in Blender's, which are (x, -z, y).
GRID_FACINGS_APP = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))
GRID_FACINGS = np.array([(x, -z, y) for x, y, z in GRID_FACINGS_APP], dtype=np.float64)


def probe_grid(rooms, solids):
    """The light probes that light what moves in a view lit live — the
    people, the car: a grid of points through the house's rooms and a
    little way round them (GRID_STEP, GRID_MARGIN), each measuring the light
    arriving from six ways, as a surface facing each way would have it
    (the "ambient cube" of a probe). Which room holds each point, and which
    are inside the house's own walls and floors (the spec's solids, as
    bake_hidden has them): those measure nothing.

    Returns {origin, step, size, points (app axes), zone per point, solid
    per point — or outside, up by the roofs, where nothing that moves goes;
    neither is baked}."""
    xs = [x for room in rooms for x, _ in room["polygon"]]
    zs = [z for room in rooms for _, z in room["polygon"]]
    lows = [room["elevation"] for room in rooms]
    highs = [room["elevation"] + room["height"] for room in rooms]
    sx, sy, sz = GRID_STEP
    origin = np.array([min(xs) - GRID_MARGIN, min(lows) + sy / 2, min(zs) - GRID_MARGIN])
    top = np.array([max(xs) + GRID_MARGIN, max(highs), max(zs) + GRID_MARGIN])
    size = np.floor((top - origin) / GRID_STEP).astype(int) + 1
    ix, iy, iz = np.meshgrid(np.arange(size[0]), np.arange(size[1]), np.arange(size[2]), indexing="ij")
    # x fastest, then y, then z — as the public view indexes them.
    index = np.stack([ix, iy, iz], axis=-1).transpose(2, 1, 0, 3).reshape(-1, 3)
    points = origin + index * np.array(GRID_STEP)
    x, y, z = points[:, 0], points[:, 1], points[:, 2]

    zone = np.full(len(points), OUTSIDE, dtype=object)
    best = np.full(len(points), np.inf)
    for room in rooms:
        low, high = room["elevation"], room["elevation"] + room["height"]
        inside = (y >= low) & (y <= high) & in_polygon(x, z, room["polygon"]) & (y - low < best)
        zone[inside] = room["id"]
        best[inside] = (y - low)[inside]

    solid = np.zeros(len(points), dtype=bool)
    for box in solids.get("walls", []):
        (wx, wz), (dx, dz) = box["start"], box["direction"]
        rx, rz = x - wx, z - wz
        along = rx * dx + rz * dz
        across = rz * dx - rx * dz
        solid |= (y > box["bottom"]) & (y < box["top"]) & (along > box["from"]) & (along < box["to"]) & (np.abs(across) < box["half"])
    for slab in solids.get("slabs", []):
        inside = (y > slab["bottom"]) & (y < slab["top"]) & in_polygon(x, z, slab["polygon"])
        for hole in slab.get("holes", []):
            inside &= ~in_polygon(x, z, hole)
        solid |= inside
    # Outside, only near the ground, where the people and the car are: not
    # up by the roofs.
    aloft = (zone == OUTSIDE) & (y > min(lows) + GRID_OUTSIDE_HEIGHT)
    log("light probes:", len(points), "on a", "×".join(str(n) for n in size), "grid,", int(solid.sum()),
        "inside walls and floors,", int((aloft & ~solid).sum()), "up by the roofs")
    return {"origin": origin, "step": GRID_STEP, "size": size, "points": points, "zone": zone, "solid": solid | aloft}


def read_grid(sets, count, names):
    """The light the grid's probes (probe_grid), baked with the vertices'
    (zone_probes), had baked into attributes `names`, added up, as an array
    (count, 6, 3) — the light on a surface facing each of the six ways at
    each point of the grid; zero at points not baked."""
    out = np.zeros((count, 6, 3), dtype=np.float32)
    for _, probe, _ in (sets.values() if isinstance(sets, dict) else sets):
        if "grid" not in probe:
            continue
        members = np.array(probe["grid"], dtype=np.int64)
        start = int(probe["grid_from"])
        attributes = probe.data.color_attributes
        for name in names:
            if name not in attributes:
                continue
            light = np.empty(len(probe.data.vertices) * 4, dtype=np.float32)
            attributes[name].data.foreach_get("color", light)
            out[members] += light.reshape(-1, 3, 4).mean(axis=1)[start:, :3].reshape(-1, 6, 3)
    return out


def write_grid(path, grid, valid, variants, switches, sun=None):
    """The light probes as the public view reads them: in one file, as
    little-endian arrays one after another, each at a byte offset the
    description returned gives —

      - `zones`: each point's room, a byte, as an index into `zoneIds`
        (255 where nothing is measured: inside a wall, a floor or a sofa);
      - each variant's (`variants`: `light` and `sun`), at the points that
        measure something alone, in order (`layout` 2): its light but the
        sun's straight light, half floats, 18 a point (six ways, red,
        green, blue), and how much of the sun reaches it, a byte;
      - each switch's, at the points of the rooms it reaches (`indices`,
        16-bit): all of it, and only what its lamps bounce.

    Returns that description, for bake.json."""
    blobs = []
    offset = 0

    def add(array):
        nonlocal offset
        data = np.ascontiguousarray(array).tobytes()
        at = offset
        blobs.append(data)
        offset += len(data)
        pad = (-offset) % 4
        if pad:
            blobs.append(b"\0" * pad)
            offset += pad
        return at

    zone_ids = sorted(set(grid["zone"]))
    zone_index = {zone: k for k, zone in enumerate(zone_ids)}
    zones = np.array([zone_index[zone] for zone in grid["zone"]], dtype=np.uint8)
    zones[~valid] = 255
    kept = np.flatnonzero(valid)
    description = {
        "file": os.path.basename(path),
        "layout": 2,
        "origin": [round(float(v), 4) for v in grid["origin"]],
        "step": list(grid["step"]),
        "size": [int(n) for n in grid["size"]],
        "zoneIds": zone_ids,
        "zones": add(zones),
        "variants": {
            name: {
                "light": add(light[kept].astype("<f2")),
                **({"sun": add(np.round(sun[name][kept] * 255).astype(np.uint8))} if sun and name in sun else {}),
            }
            for name, light in variants.items()
        },
        "switches": [],
    }
    for entry in switches:
        if entry is None:
            description["switches"].append(None)
            continue
        indices, full, indirect = entry
        description["switches"].append({
            "count": int(len(indices)),
            "indices": add(indices.astype("<u2")),
            "full": add(full.astype("<f2")),
            "indirect": add(indirect.astype("<f2")),
        })
    with open(path, "wb") as f:
        for blob in blobs:
            f.write(blob)
    log("wrote", os.path.basename(path), f"{offset / 1024:.0f} KB")
    return description


def bake_vertices(sets, name, samples, parts=frozenset({"DIRECT", "INDIRECT"})):
    """The light at every vertex of the thin faces, and at the doors'
    probes, into attribute `name`: baked on their probes (zone_probes),
    every set given at once, each probe's three corners averaged and handed
    back to the vertex it stands for. `parts`: which of the light, straight
    and bounced.

    Blender bakes each object selected as a bake of its own, the whole
    scene handed to Cycles again for each: with a probe object a room, a
    site of ninety rooms was handed over ninety times a pass, some 1,200
    times a bake. So the sets' probes are baked as one object
    (probes_as_one) and their light dealt back to each."""
    cycles(samples, SEED)
    t = time.time()
    for objects, probe, counts in sets:
        attributes = probe.data.color_attributes
        if name not in attributes:
            attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
        attributes.active_color = attributes[name]
    probes = [probe for _, probe, _ in sets if len(probe.data.vertices)]
    if len(probes) > 1 and "probes" not in APART:
        with probes_as_one(probes, name) as joined:
            select_only([joined])
            bpy.ops.object.bake(type="DIFFUSE", pass_filter=set(parts), target="VERTEX_COLORS")
        HANDED["vertices"] += 1
    else:
        select_only([probe for _, probe, _ in sets])
        bpy.ops.object.bake(type="DIFFUSE", pass_filter=set(parts), target="VERTEX_COLORS")
        HANDED["vertices"] += len(sets)
    for objects, probe, counts in sets:
        light = np.empty(len(probe.data.vertices) * 4, dtype=np.float32)
        probe.data.color_attributes[name].data.foreach_get("color", light)
        light = light.reshape(-1, 3, 4).mean(axis=1)
        start = 0
        for obj, count in zip(objects, counts):
            attributes = obj.data.color_attributes
            if name not in attributes:
                attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
            attributes[name].data.foreach_set("color", light[start:start + count].ravel())
            start += count
    log(name, "vertices baked", round(time.time() - t, 1), "s")


@contextmanager
def probes_as_one(probes, name):
    """The probes' triangles (probe_mesh) as one object meanwhile, with a
    colour attribute `name` to bake into; afterwards each probe's own
    attribute `name` holds its part of what was baked. The triangles are
    apart, so each keeps its three corners in order, one probe's after
    another's. (A vertex's samples go by its index in the object baked:
    baked so, the light has other grain than baked a probe at a time, and
    is otherwise the same.)"""
    counts = [len(probe.data.vertices) for probe in probes]
    total = sum(counts)
    co = np.empty(total * 3, dtype=np.float32)
    at = 0
    for probe, count in zip(probes, counts):
        part = np.empty(count * 3, dtype=np.float32)
        probe.data.vertices.foreach_get("co", part)
        co[at * 3:(at + count) * 3] = part
        at += count
    me = bpy.data.meshes.new("vertex-probes-as-one")
    me.vertices.add(total)
    me.loops.add(total)
    me.polygons.add(total // 3)
    me.vertices.foreach_set("co", co)
    me.loops.foreach_set("vertex_index", np.arange(total, dtype=np.int32))
    me.polygons.foreach_set("loop_start", np.arange(0, total, 3, dtype=np.int32))
    me.update()
    me.validate()
    me.shade_flat()
    attribute = me.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
    me.color_attributes.active_color = attribute
    joined = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(joined)
    for ray in RAYS[1:]:
        setattr(joined, ray, False)
    try:
        yield joined
        light = np.empty(total * 4, dtype=np.float32)
        me.color_attributes[name].data.foreach_get("color", light)
        at = 0
        for probe, count in zip(probes, counts):
            probe.data.color_attributes[name].data.foreach_set("color", light[at * 4:(at + count) * 4])
            at += count
    finally:
        bpy.data.objects.remove(joined, do_unlink=True)
        bpy.data.meshes.remove(me)


#: What an attribute's name gains for its light without what a public view
#: whose light is live draws itself: the sun's straight light, or a lamp's.
INDIRECT = "_INDIRECT"


def add_attributes(sets, total, names, drop=()):
    """Attribute `total` on every object of the sets (the thin faces, the
    doors' probes) as the sum of attributes `names`; those in `drop` are
    then removed."""
    for objects, _, _ in sets:
        for obj in objects:
            attributes = obj.data.color_attributes
            if not all(name in attributes for name in names):
                continue
            n = len(obj.data.vertices)
            sum_ = np.zeros(n * 4, dtype=np.float32)
            values = np.empty(n * 4, dtype=np.float32)
            for name in names:
                attributes[name].data.foreach_get("color", values)
                sum_ += values
            sum_[3::4] = 1.0
            if total not in attributes:
                attributes.new(name=total, type="FLOAT_COLOR", domain="POINT")
            attributes[total].data.foreach_set("color", sum_)
            for name in drop:
                attributes.remove(attributes[name])


def bake_vertex_light(sets, name, samples, apart=True):
    """A variant's light at every vertex (bake_vertices), all of it into
    `name` and, into `name` + INDIRECT, all but the sun's straight light:
    the sky's straight light and everything bounced, as the lightmaps have
    them apart (bake_lightmap).

    The garden's own lamps' straight light (garden_lights), where there
    are any, is baked apart ("_garden") — the thin faces have it with the
    rest, as the lightmap does, but the light probes, read from "_rest"
    and "_bounced" (read_grid), do not: the view lights what moves with
    its own live garden lamps, and the probes give it what they bounce.

    Without `apart` (a version drawn fully static, which reads only all of
    the light) `name` + INDIRECT is not kept; the passes are the same, and
    so is `name`."""
    if "vertices" in CUT:
        bake_vertices(sets, name, max(32, samples // 4))
        add_attributes(sets, name + INDIRECT, [name])
        return
    garden = any(obj.get("garden") for obj in bpy.data.objects if obj.type == "LIGHT")
    # The sky's straight light, through the windows, has the grain; the
    # sun's, from one direction, little.
    with lit_by("house" if garden else "rest"):
        bake_vertices(sets, "_rest", samples, {"DIRECT"})
    if garden:
        with lit_by("garden"):
            bake_vertices(sets, "_garden", max(32, samples // 4), {"DIRECT"})
    with lit_by("sun"):
        bake_vertices(sets, "_sun", max(32, samples // 4), {"DIRECT"})
    bake_vertices(sets, "_bounced", samples, {"INDIRECT"})
    rest = ["_rest", "_bounced"] + (["_garden"] if garden else [])
    if apart:
        add_attributes(sets, name + INDIRECT, rest)
    add_attributes(sets, name, rest + ["_sun"], drop=rest + ["_sun"])


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


def read_probes(objects, name):
    """Each door's baked light in attribute `name`, as the average of its
    sides'."""
    by_door = {}
    for obj in objects:
        data = obj.data.color_attributes[name].data
        rgb = np.array([list(d.color)[:3] for d in data]).mean(axis=0)
        by_door.setdefault(obj["probe"], []).append(rgb)
    return {door: [round(float(v), 4) for v in np.mean(sides, axis=0)] for door, sides in by_door.items()}


def read_probe_sides(objects, name):
    """Each door's baked light in attribute `name`, a side at a time: the
    light on a leaf's face that way (add_probes' side 0, the wall's +Z, then
    side 1) — a shut door's two faces are lit by the two rooms apart. A
    side without the attribute, in a room a switch does not reach, is dark."""
    by_door = {}
    for obj in objects:
        sides = by_door.setdefault(obj["probe"], [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]])
        if name not in obj.data.color_attributes:
            continue
        data = obj.data.color_attributes[name].data
        rgb = np.array([list(d.color)[:3] for d in data]).mean(axis=0)
        sides[obj["side"]] = [round(float(v), 4) for v in rgb]
    return by_door


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
    against black.

    Each round fills the missing texels beside a known one with the mean of
    their known neighbours. Only those texels are worked on — a ring a
    texel wide round what is known, not the whole atlas eight times a round
    (14 s a pass at 4096², thirty times a bake) — and each is summed in
    the same order as when the whole atlas was: the result is the same to
    the bit (scratch opt/s5c/tools/spread_test.py holds the two together)."""
    if "fill" in APART:
        return spread_whole(values, valid, reach)
    out = values.copy()
    h, w = valid.shape
    if valid.all() or not valid.any():
        return out
    # One texel of room all round, so no neighbour is ever off the edge.
    known = np.zeros((h + 2, w + 2), dtype=bool)
    known[1:-1, 1:-1] = valid
    row = w + 2
    flat = known.ravel()
    offsets = [dy * row + dx for dy, dx in SPREAD_STEPS]
    near = np.zeros_like(known)
    for dy, dx in SPREAD_STEPS:
        near[1:-1, 1:-1] |= known[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx]
    near[1:-1, 1:-1] &= ~valid
    front = np.flatnonzero(near.ravel())
    # (`near` goes on as the scratch mark of the texels to fill next.)
    mark = near.ravel()
    mark[:] = False
    cells = out.reshape(h * w, -1)
    for _ in range(reach):
        if not front.size:
            break
        y, x = np.divmod(front, row)
        total = np.zeros((front.size, cells.shape[1]), dtype=out.dtype)
        count = np.zeros(front.size, dtype=np.float32)
        for (dy, dx), offset in zip(SPREAD_STEPS, offsets):
            source = flat[front + offset]
            # (Off the edge `source` is false: any texel stands in for it.)
            at = np.clip(y - 1 + dy, 0, h - 1) * w + np.clip(x - 1 + dx, 0, w - 1)
            total += cells[at] * source[:, None]
            count += source
        cells[(y - 1) * w + (x - 1)] = total / count[:, None]
        flat[front] = True
        # Next: the missing texels beside the ones just filled, inside the atlas.
        for offset in offsets:
            mark[front + offset] = True
        beside = np.flatnonzero(mark)
        mark[beside] = False
        beside = beside[~flat[beside]]
        by, bx = np.divmod(beside, row)
        front = beside[(by >= 1) & (by <= h) & (bx >= 1) & (bx <= w)]
    return out


#: The neighbours a missing texel is filled from (spread), in the order they are added up.
SPREAD_STEPS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def spread_whole(values, valid, reach=32):
    """spread as it was until 2026-10-12, every round over the whole atlas:
    kept to hold the two against each other (BAKE_APART=fill)."""
    out = values.copy()
    valid = valid.copy()
    h, w = valid.shape
    for _ in range(reach):
        missing = ~valid
        if not missing.any():
            break
        total = np.zeros_like(out)
        count = np.zeros((h, w), dtype=np.float32)
        for dy, dx in SPREAD_STEPS:
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
    use_view(scene)
    scene.compositing_node_group = None
    bpy.data.node_groups.remove(tree)
    result = bpy.data.images.load(tmp)
    result.colorspace_settings.name = "Non-Color"
    clean = pixels_of(result)
    for image in images + [result]:
        bpy.data.images.remove(image)
    log("denoised", round(time.time() - t, 1), "s")
    return clean


#: The squares of the atlas a pass over a few surfaces is denoised in
#: (denoise_tiles), in texels of the lightmap; how much of the atlas round
#: each the denoiser is shown with it, in texels of the picture denoised —
#: as far as spread carries an island's edge on, which is all there is to
#: see round the islands of such a pass; and how far past its own edge each
#: square is put back, for what is blended across it (double).
TILE = 64
TILE_PAD = 32
TILE_KEEP = 2


def tiles_of(mask):
    """The squares of TILE texels that hold any of a mask's texels, as
    [row, column] of squares."""
    h, w = mask.shape
    return np.argwhere(mask.reshape(h // TILE, TILE, w // TILE, TILE).any(axis=(1, 3)))


def denoise_tiles(rgb, normal, tiles, tile):
    """denoise, of some squares of a lightmap alone (`tiles`, each `tile`
    texels of this picture): each is cut out with TILE_PAD texels of the
    atlas round it, the cuts are laid side by side in one small picture and
    denoised in one go, and each square is put back. The ceilings' tops are
    a seven-hundredth of a house's atlas, and the whole of it was spread
    and denoised three times a variant for them (80 s of 4096²). What is
    returned outside the squares is not denoised."""
    h, w, _ = rgb.shape
    out = rgb.copy()
    if not len(tiles):
        return out
    side = tile + 2 * TILE_PAD
    columns = int(math.ceil(math.sqrt(len(tiles))))
    rows = int(math.ceil(len(tiles) / columns))
    colour = np.zeros((rows * side, columns * side, 3), dtype=np.float32)
    guide = np.zeros_like(colour)
    guide[..., 2] = 1.0
    span = np.arange(-TILE_PAD, tile + TILE_PAD)
    for k, (ty, tx) in enumerate(tiles):
        # (Past the atlas's edge, its last texel over again.)
        at = np.ix_(np.clip(ty * tile + span, 0, h - 1), np.clip(tx * tile + span, 0, w - 1))
        r, c = divmod(k, columns)
        colour[r * side:(r + 1) * side, c * side:(c + 1) * side] = rgb[at]
        guide[r * side:(r + 1) * side, c * side:(c + 1) * side] = normal[at]
    clean = denoise(colour, guide)
    # A little past each square's edge first, then each square itself: a
    # texel in two squares' reach is its own square's.
    for keep in (TILE_KEEP, 0):
        for k, (ty, tx) in enumerate(tiles):
            y0, y1 = max(ty * tile - keep, 0), min((ty + 1) * tile + keep, h)
            x0, x1 = max(tx * tile - keep, 0), min((tx + 1) * tile + keep, w)
            r, c = divmod(k, columns)
            oy, ox = r * side + TILE_PAD - ty * tile, c * side + TILE_PAD - tx * tile
            out[y0:y1, x0:x1] = clean[y0 + oy:y1 + oy, x0 + ox:x1 + ox]
    return out


#: How a lightmap's colour is held (encode): brightness in one image, the
#: colour in another at half the size — the public view keeps them so on
#: the GPU, for well under half the memory of the colour itself.
STORAGE = "ycocg"
#: Where zero sits in a colour difference stored in 8 bits.
CHROMA_ZERO = 128 / 255


def squeeze(rgb, scale):
    """A lightmap's light as its 8 bits hold it (encode), 0 to 1: over its
    scale, squeezed as x / (1 + x) up to HEADROOM, sRGB encoded."""
    x = np.clip(rgb / scale, 0, HEADROOM)
    v = x / (1.0 + x)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)


#: The WebP quality a lightmap with each room's part held its own way is
#: written at, its brightness and its colour (encode_rooms). Held so, a
#: level is 2 to 3% of a room's light, and the WebP errs by so much less
#: of it: at these the rooms' walls and ceilings come out without the
#: one-scale lightmap's patches, at 4096 and in a phone's copy, for a
#: quarter more bytes than that one (Wrenfield's day: 0.80 MB for 0.63).
#: At 90 and 95 it is 1.16 MB and keeps a little more of the bake's own
#: grain; the one-scale lightmap written lossless, 3.15 MB, shows its 8
#: bits' steps instead.
#: The least light a room's own curve gives a share of its levels to
#: (lightzones.room_curve's knee): what the view shows as next to black at
#: the most it ever exposes the variant by — by day a room is metered up to
#: 32 times; a night is drawn at its own exposure, twice that in a lamplit
#: room at most, and what the lamps add is in their own layers.
ROOM_LEAST = {"day": 0.0002}
ROOM_LEAST_NIGHT = 0.004
ROOM_QUALITY = int(os.environ.get("BAKE_ROOM_QUALITY", 80))
ROOM_CHROMA_QUALITY = int(os.environ.get("BAKE_ROOM_CHROMA_QUALITY", 90))


def encode_rooms(rgb, base, scale, parts, curves, gains=None, lit=None):
    """Save a lightmap a second time, each room's part of the atlas held
    its own way (lib/lightzones.py): `<base>-rooms-luma.webp` and
    `<base>-rooms-chroma.webp`. `parts` is each room's part at this size
    (lightzones.regions), `curves` each room's curve; what has none — the
    garden's zone, the atlas between — is as encode writes it at `scale`,
    so whatever reads the garden's light from this lightmap as it is (the
    grass, the terrain's own shader) reads what it always did. Returns how
    far each room's colour is stretched (`gains` given: by that)."""
    h, w, _ = rgb.shape
    luma, chroma, gains = lightzones.encode_rooms(rgb, squeeze(rgb, scale), parts, curves, gains=gains, lit=lit)
    chroma = np.concatenate([chroma + CHROMA_ZERO, np.full((h // 2, w // 2, 1), CHROMA_ZERO)], axis=-1)
    write_webp(np.repeat(np.clip(luma, 0, 1)[..., None], 3, axis=-1), f"{base}-rooms-luma.webp", ROOM_QUALITY)
    write_webp(np.clip(chroma, 0, 1), f"{base}-rooms-chroma.webp", ROOM_CHROMA_QUALITY)
    log("wrote", os.path.basename(base) + "-rooms", f"{w}²", "luma", f"{os.path.getsize(base + '-rooms-luma.webp') / 1024:.0f} KB",
        "chroma", f"{os.path.getsize(base + '-rooms-chroma.webp') / 1024:.0f} KB,", len(curves), "rooms held their own way")
    return gains


def encode_own(rgb, base, lit, least, curve=None):
    """One room's crop of a switch's layer, held as a room's part of the
    lightmap is held its own way (lib/lightzones.py: its light by its
    logarithm between next to nothing and the crop's brightest texel, its
    colour stretched): `<base>-luma.webp` and `<base>-chroma.webp`. `lit`:
    the crop's texels on a surface and not covered. Returns its curve,
    [knee, top, gain] — `curve` given (a phone's copy): by that one."""
    h, w, _ = rgb.shape
    part = {"own": {"luma": [0, 0, w, h], "chroma": [0, 0, w // 2, h // 2]}}
    knee, top = curve[:2] if curve else lightzones.room_curve(rgb, lit, least)
    luma, chroma, gains = lightzones.encode_rooms(rgb, np.zeros_like(rgb), part, {"own": (knee, top)},
                                                  gains={"own": curve[2]} if curve else None, lit=lit)
    chroma = np.concatenate([chroma + CHROMA_ZERO, np.full((h // 2, w // 2, 1), CHROMA_ZERO)], axis=-1)
    write_webp(np.repeat(np.clip(luma, 0, 1)[..., None], 3, axis=-1), f"{base}-luma.webp", ROOM_QUALITY)
    write_webp(np.clip(chroma, 0, 1), f"{base}-chroma.webp", ROOM_CHROMA_QUALITY)
    return [knee, top, gains["own"]]


def encode(rgb, base, scale=None, quality=90, chroma_quality=95):
    """Save a lightmap as two 8-bit WebPs the browser can load:
    `<base>-luma.webp` and `<base>-chroma.webp`. Scaled so its bright light —
    all but the brightest three texels in a thousand — comes to 1, then
    squeezed as x / (1 + x), which leaves the rest much as it was but keeps
    what is brighter still — a sun patch's core, up to HEADROOM times the
    scale — in the top of the range, for Filmic to roll off rather than
    flattened (ENCODING); then sRGB encoded, which keeps the precision in
    the shadows where the eye wants it. Then parted into brightness and two
    colour differences (YCoCg, STORAGE): brightness at full size, the colour
    — which in a lightmap hardly changes from texel to texel, and which a
    WebP halves anyway — at half. The public view puts them back together
    (SceneBuilder's decodeLightmap). Returns the scale it multiplies back
    by."""
    h, w, _ = rgb.shape
    if scale is None:
        lum = rgb.max(axis=2).ravel()
        lit = lum[lum > 1e-5]
        scale = float(np.percentile(lit, 99.7)) if lit.size else 1.0
        scale = max(scale, 0.05)
    v = squeeze(rgb, scale)
    r, g, b = v[..., 0], v[..., 1], v[..., 2]
    luma = r / 4 + g / 2 + b / 4
    chroma = np.stack([r / 2 - b / 2, -r / 4 + g / 2 - b / 4], axis=-1)
    chroma = chroma.reshape(h // 2, 2, w // 2, 2, 2).mean(axis=(1, 3)) + CHROMA_ZERO
    chroma = np.concatenate([chroma, np.full((h // 2, w // 2, 1), CHROMA_ZERO)], axis=-1)
    write_webp(np.repeat(luma[..., None], 3, axis=-1), f"{base}-luma.webp", quality)
    write_webp(np.clip(chroma, 0, 1), f"{base}-chroma.webp", chroma_quality)
    log("wrote", os.path.basename(base), f"{w}²", "luma", f"{os.path.getsize(base + '-luma.webp') / 1024:.0f} KB",
        "chroma", f"{os.path.getsize(base + '-chroma.webp') / 1024:.0f} KB", "scale", round(scale, 3))
    return scale


def encode_mask(values, path, scale=None, quality=90):
    """A lightmap of one quantity, as one 8-bit grey WebP: scaled, squeezed
    and sRGB encoded as encode does a lightmap's brightness. Returns the
    scale it multiplies back by."""
    if scale is None:
        lit = values[values > 1e-5]
        scale = max(float(np.percentile(lit, 99.7)) if lit.size else 1.0, 0.05)
    x = np.clip(values / scale, 0, HEADROOM)
    v = x / (1.0 + x)
    v = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    write_webp(np.repeat(v[..., None], 3, axis=-1), path, quality)
    log("wrote", os.path.basename(path), f"{values.shape[1]}²", f"{os.path.getsize(path) / 1024:.0f} KB", "scale", round(scale, 3))
    return scale


def sun_mask(full, soft, color):
    """How much of the sun's (or the moon's) straight light each texel has,
    as a share of its colour: the lightmap with it less the one without,
    over the brightest of its channels — for a phone's view to take away
    where something that moves stands in its way (SceneBuilder's
    decodeLightmap)."""
    return np.clip((full - soft).max(axis=2), 0, None) / max(max(color), 1e-6)


def sun_visibility(light, sun):
    """How much of the sun reaches each light probe (probe_grid): the sun's
    straight light each measured from its six ways (`light`, count × 6 × 3),
    over what they would have measured in the open — for a phone's view,
    which draws the sun on what moves unshadowed by the house, to dim it
    where the house shades it. 0 to 1."""
    to_sun = np.array(sun["position"], dtype=np.float64)
    to_sun /= np.linalg.norm(to_sun)
    facing = np.clip(np.array(GRID_FACINGS_APP, dtype=np.float64) @ to_sun, 0, None)
    weights = np.array([0.2126, 0.7152, 0.0722])
    open_air = float(np.dot(sun["color"], weights)) * sun["strength"] / math.pi * facing.sum()
    measured = (light @ weights).sum(axis=1)
    return np.clip(measured / max(open_air, 1e-6), 0, 1)


def write_webp(values, path, quality):
    """Values in [0, 1], written as they are to an 8-bit WebP."""
    h, w, _ = values.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    set_pixels(img, values.astype(np.float32))
    img.filepath_raw = path
    img.file_format = "WEBP"
    img.save(quality=quality)
    bpy.data.images.remove(img)


def half(rgb):
    """A lightmap at half the size, each texel the average of four: what a
    phone is given, for a quarter of the memory."""
    h, w, c = rgb.shape
    return rgb.reshape(h // 2, 2, w // 2, 2, c).mean(axis=(1, 3))


# The largest lightmap a phone is given.
PHONE_SIZE = 2048


def join_for_drawing(objects):
    """One object for each thing the public view draws differently: a zone,
    material, floor and kind of surface, lit by the lightmap or through its
    vertices. What else parted the objects mattered only to the bake — a
    narrow strip's texels, a reversed copy's, what casts shadows — and each
    object left is a draw. Returns the objects."""
    groups = {}
    for obj in objects:
        me = obj.data
        key = (obj.get("zone"), obj.get("lighting"), obj.get("level"), obj.get("kind"), obj.get("glow"),
               len(me.color_attributes), tuple(sorted(a.name for a in me.color_attributes)),
               tuple(uv.name for uv in me.uv_layers),
               tuple(slot.material.name if slot.material else "" for slot in obj.material_slots))
        groups.setdefault(key, []).append(obj)
    joined = []
    for members in groups.values():
        head = members[0]
        if len(members) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in members:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = head
            bpy.ops.object.join()
        for flag in ("strip", "back", "cast", "receive"):
            if flag in head:
                del head[flag]
        joined.append(head)
    return joined


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
    MARGIN = max(2, round(args.margin * args.size / 4096))
    settings = json.load(open(args.settings))
    os.makedirs(args.out, exist_ok=True)
    fresh()
    bpy.ops.import_scene.gltf(filepath=args.snapshot)
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    log(len(objects), "objects", sum(len(o.data.polygons) for o in objects), "faces")
    if BOX:
        objects = keep_box(objects, BOX)
        log("CUT DOWN to the part of the site in", BOX, ":", len(objects), "objects", sum(len(o.data.polygons) for o in objects), "faces")
    # What the view draws by a shader of its own, from what the snapshot
    # sent with its vertices for it (the terrain's paint): no room's (zone_split).
    for obj in objects:
        if any(attribute.name.startswith("_") for attribute in obj.data.attributes):
            obj["own"] = True
    objects = part_bulbs(objects, settings.get("switches", []))
    if args.stage == "passes":
        # Nothing baked: the passes the switches and the doors would go in, from the rooms and the house as it stands.
        known = {room["id"] for room in settings.get("rooms", [])}
        lit = [(switch, [zone for zone in switch["zones"] if zone in known]) for switch in settings.get("switches", [])]
        lit = [(switch, here) for switch, here in lit if here]
        switch_batches([switch for switch, _ in lit], [here for _, here in lit], settings, objects)
        door_batches([here for here in ([zone for zone in door["zones"] if zone in known] for door in settings.get("doors", [])) if here],
                     settings.get("openings", settings.get("links")))
        return
    # Each surface whole before it is judged thin or wide: a strip of wall
    # between two openings, built as a piece of its own, is part of the wall.
    objects = split_twins(objects)
    t = time.time()
    weld(objects)
    log("welded", round(time.time() - t, 1), "s")
    # Welded first, so a corner's copies of a vertex move as one.
    part_twins(objects)
    guess = texel_guess(objects, settings, args.size)
    log(f"texels of about {guess * 100:.1f} cm: narrow strips under {STRIP_TEXELS} of their own lit through their vertices")
    lightmapped, vertex_lit = split_thin(objects, settings, guess)
    if CUT:
        log("CUT DOWN, not a bake to keep:", ", ".join(sorted(CUT)))
    rooms = [] if "zones" in CUT else settings.get("rooms", [])
    walls = settings.get("walls", [])
    # What lies in the thickness of a wall between two rooms, cut along the
    # wall's middle before anything is given to a room (zone_split) — and
    # the halves too narrow for the lightmap lit through their vertices.
    cut_at_walls(vertex_lit, walls, rooms)
    vertex_lit += cut_at_walls(lightmapped, walls, rooms, settings, guess)
    split_hard_edges(vertex_lit)
    objects = lightmapped + vertex_lit
    # The reversed copies of two-sided surfaces left out: a point by a
    # two-sided floor is near both copies, one facing each way, and would
    # be pushed off one straight back through the other.
    tree, owners = surroundings([obj for obj in objects if not obj.name.endswith("~back")])
    t = time.time()
    if "edges" not in CUT:
        log("split long vertex-lit edges:", split_long_edges(vertex_lit, tree, owners), "triangles added,", round(time.time() - t, 1), "s")
    log(len(lightmapped), "lightmapped", sum(len(o.data.polygons) for o in lightmapped), "faces;",
        len(vertex_lit), "vertex-lit", sum(len(o.data.polygons) for o in vertex_lit), "faces")
    t = time.time()
    solid = settings.get("solids", {}).get("walls", [])
    lightmapped = zone_split(lightmapped, rooms, walls, solid)
    # The thin faces by room too, so a switch's light is baked into, and
    # carried by, the vertices of the rooms it reaches alone.
    vertex_lit = zone_split(vertex_lit, rooms, walls, solid)
    objects = lightmapped + vertex_lit
    # However they were cut up and joined again, the bulbs block no light.
    for obj in objects:
        if obj.get("glow"):
            for ray in RAYS[1:]:
                setattr(obj, ray, False)
        # Nor the neighbourhood's flat things that cast no shadow live: its
        # roads, their gravel and their paint — a dash a centimetre over the
        # asphalt would draw a line of shade beside itself.
        if obj.get("kind") == "scenery" and obj.get("cast") in (False, 0):
            obj.visible_shadow = False
    log("zones:", len({obj["zone"] for obj in lightmapped}), "over", len(lightmapped), "lightmapped objects,",
        round(time.time() - t, 1), "s")
    for obj in lightmapped:
        obj["_density"] = density(obj, settings)

    # BAKE_CHECKPOINT_UNWRAP=<file.blend>: saved here, before the unwrap,
    # for trying the unwrap on its own; with BAKE_STOP=1, nothing more.
    if os.environ.get("BAKE_CHECKPOINT_UNWRAP"):
        bpy.ops.wm.save_as_mainfile(filepath=os.environ["BAKE_CHECKPOINT_UNWRAP"], copy=True)
        log("checkpoint saved:", os.environ["BAKE_CHECKPOINT_UNWRAP"])
        if os.environ.get("BAKE_STOP"):
            sys.exit(0)
    zones = unwrap(lightmapped, settings, args.size)
    texel = texel_size(lightmapped, args.size)
    log(f"house texels: {texel * 100:.1f} cm")
    if args.stage == "unwrap":
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, "unwrapped.blend"))
        return
    use_gpu()
    tree_shade(settings.get("trees", []), settings.get("bushes", []))
    probes = add_probes(settings.get("probes", []))
    for obj in vertex_lit + probes:
        for name in VERTEX_ATTRIBUTES.values():
            obj.data.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
    # A door's probes are only where its light is measured; they block none.
    for obj in probes:
        for ray in RAYS[1:]:
            setattr(obj, ray, False)
        obj["zone"] = face_zones(obj, rooms)[0]
    t = time.time()
    # The light probes that light what moves (probe_grid), baked with the
    # vertices, room by room.
    # (None for a version drawn fully static, which lights nothing by them.)
    grid = probe_grid(rooms, settings.get("solids", {})) if rooms and not args.static else None
    grid_light, grid_sun, grid_seen, grid_switches = {}, {}, None, []
    sets = zone_probes(vertex_lit + probes, tree, grid)
    log("vertex probes placed:", sum(sum(counts) for _, _, counts in sets.values()), "in", len(sets), "zones,",
        round(time.time() - t, 1), "s")
    normal, written = bake_guides(lightmapped, args.size)
    if "covered" in CUT:
        covered = np.zeros_like(written)
    else:
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
    lids = [] if "lids" in CUT else [obj for obj in lightmapped if obj.get("kind") == "ceiling" and is_back(obj)]
    if lids:
        lid_normal, lid_written = bake_guides(lids, args.size)
        lid_covered = lid_written & bake_coverage(lids, args.size)
        lid_covered = lid_written & (lid_covered | grow(lid_covered))
        lid_normal = spread(lid_normal, lid_written)
        lid_core = island_core(lids, args.size)
        # Only the squares of the atlas they lie in are denoised (denoise_tiles).
        lid_tiles = None if "tops" in APART else tiles_of(lid_core)
        if lid_tiles is not None:
            log(f"ceiling tops: {int(lid_core.sum())} texels in {len(lid_tiles)} squares of {TILE}, "
                f"{len(lid_tiles) * TILE * TILE / args.size ** 2 * 100:.1f}% of the atlas")
    if "masks" in KEEP:
        np.save(os.path.join(args.out, "mask-written.npy"), written)
        np.save(os.path.join(args.out, "mask-covered.npy"), covered)
        np.save(os.path.join(args.out, "mask-tops.npy"), lid_core if lids else np.zeros_like(written))
    t = time.time()
    seams = seam_samples(lightmapped, args.size, texel)
    log("seams to stitch:", len(seams[0]), "points,", round(time.time() - t, 1), "s")
    def write_lightmap(rgb, base, scale=None):
        """A lightmap, or a crop of one, and a phone's copy of it when the
        atlas is bigger than a phone is given — halved as the atlas is:
        its files, as bake.json names them, and its scale."""
        scale = encode(rgb, os.path.join(args.out, base), scale=scale)
        # The lightmap is its brightness; its colour is beside it.
        files = {"lightmap": f"{base}-luma.webp", "chroma": f"{base}-chroma.webp"}
        if args.size > PHONE_SIZE:
            small, at = rgb, args.size
            while at > PHONE_SIZE:
                small, at = half(small), at // 2
            encode(small, os.path.join(args.out, f"{base}-phone"), scale=scale)
            files["lightmapPhone"] = f"{base}-phone-luma.webp"
            files["chromaPhone"] = f"{base}-phone-chroma.webp"
        return files, scale

    def write_rooms(rgb, base, scale, least=0.0):
        """The same lightmap with each room's part of the atlas held its
        own way (encode_rooms, lib/lightzones.py), and a phone's copy: what
        bake.json says of it — its files, and each room's curve and how far
        its colour is stretched, [knee, top, gain] — or None where the
        rooms lie too close in the atlas for the view to draw each one's
        part on its own (it then draws the one-scale lightmap, as before)."""
        # (As bake.json rounds them: the view works each room's part out from those.)
        rects = {zone: [round(c, 6) for c in rect] for zone, rect in zones.items()}
        sizes = [args.size]
        while sizes[-1] > PHONE_SIZE:
            sizes.append(sizes[-1] // 2)
        parts = {size: lightzones.regions(rects, size) for size in (sizes[0], sizes[-1])}
        if any(part is None for part in parts.values()):
            log(base, "rooms lie too close in the atlas to be held their own way: the one-scale lightmap alone")
            return None
        lit = written & ~covered
        curves = {}
        for zone, part in parts[args.size].items():
            if zone == OUTSIDE:
                continue
            y0, y1, x0, x1 = lightzones.rows(part["luma"], args.size)
            curves[zone] = lightzones.room_curve(rgb[y0:y1, x0:x1], lit[y0:y1, x0:x1], least)
        if not curves:
            return None
        gains = encode_rooms(rgb, os.path.join(args.out, base), scale, parts[args.size], curves, lit=lit)
        files = {"lightmap": f"{base}-rooms-luma.webp", "chroma": f"{base}-rooms-chroma.webp"}
        if sizes[-1] != args.size:
            small, at = rgb, args.size
            while at > PHONE_SIZE:
                small, at = half(small), at // 2
            encode_rooms(small, os.path.join(args.out, f"{base}-phone"), scale, parts[at], curves, gains=gains)
            files["lightmapPhone"] = f"{base}-phone-rooms-luma.webp"
            files["chromaPhone"] = f"{base}-phone-rooms-chroma.webp"
        return {**files, "encoding": lightzones.ENCODING,
                "zones": {zone: [knee, top, gains.get(zone, 1)] for zone, (knee, top) in curves.items()}}

    variants = {}
    door_states = None
    order = args.variants.split(",")
    for variant in order:
        shining = light(variant, settings)
        clean, soft = bake_lightmap(lightmapped, variant, args.size, args.samples, written, covered, normal,
                                    debug=os.path.join(args.out, variant) if args.debug else None)
        if lids:
            t = time.time()
            with roof_lifted(objects):
                lid, lid_soft = bake_lightmap(lids, variant, args.size, args.samples, lid_written, lid_covered, lid_normal,
                                              tiles=lid_tiles)
            clean[lid_core] = lid[lid_core]
            soft[lid_core] = lid_soft[lid_core]
            log(variant, "ceiling tops baked, roof off", round(time.time() - t, 1), "s")
        attribute = VERTEX_ATTRIBUTES[variant]
        bake_vertex_light(list(sets.values()), attribute, args.samples, apart=not args.static)
        if grid is not None:
            count = len(grid["points"])
            grid_light[variant] = read_grid(sets, count, ["_rest", "_bounced"])
            sunlit = read_grid(sets, count, ["_sun"])
            grid_sun[variant] = sun_visibility(sunlit, shining)
            # A probe inside a sofa or a cupboard sees no light at all.
            seen = (grid_light[variant] + sunlit).max(axis=(1, 2)) > 1e-5
            grid_seen = seen if grid_seen is None else grid_seen | seen
        smooth_vertex_light(vertex_lit, attribute)
        smooth_vertex_light(vertex_lit, attribute + INDIRECT)
        t = time.time()
        rgb = stitch(clean, *seams)
        if not args.static:
            soft = stitch(soft, *seams)
        log(variant, "seams stitched", round(time.time() - t, 1), "s")
        files, scale = write_lightmap(rgb, variant)
        # ...and again with each room's part of it held its own way, for a
        # view that resolves the house's light into one lightmap.
        own_way = write_rooms(rgb, variant, scale, ROOM_LEAST.get(variant, ROOM_LEAST_NIGHT))
        # For a view that draws some of the light itself — never one drawn
        # fully static: the light without the sun's straight light, and the
        # sun's share of it, texel by texel, and a phone's copy.
        if not args.static:
            soft_files, soft_scale = write_lightmap(soft, f"{variant}-indirect")
            mask = sun_mask(rgb, soft, shining["color"])
            mask_scale = encode_mask(mask, os.path.join(args.out, f"{variant}-sun.webp"))
            shining = {**shining, "mask": f"{variant}-sun.webp", "maskScale": mask_scale}
            if args.size > PHONE_SIZE:
                small, at = mask, args.size
                while at > PHONE_SIZE:
                    small, at = half(small[..., None])[..., 0], at // 2
                encode_mask(small, os.path.join(args.out, f"{variant}-sun-phone.webp"), scale=mask_scale)
                shining["maskPhone"] = f"{variant}-sun-phone.webp"
        variants[variant] = {
            **files,
            **({"rooms": own_way} if own_way else {}),
            # The garden's own lamps in it (garden_lights): how many.
            **({"garden": len(settings["garden"])} if variant != "day" and settings.get("garden") else {}),
            "storage": STORAGE,
            "scale": scale,
            "encoding": ENCODING,
            "attribute": attribute,
            "doors": read_probes(probes, attribute),
            "doorSides": read_probe_sides(probes, attribute),
            # The sun (or the moon) it was lit by, for a view that draws
            # its straight light live — and its share of the light at every
            # texel (`mask`), for a phone's view to take away where
            # something that moves shades it...
            "sun": shining,
            # ...and all the rest of its light, for that view to take from
            # a lightmap: the sky's straight light, and everything bounced.
            **({} if args.static else {"indirect": {
                **soft_files,
                "scale": soft_scale,
                "attribute": attribute + INDIRECT,
                "doors": read_probes(probes, attribute + INDIRECT),
                "doorSides": read_probe_sides(probes, attribute + INDIRECT),
            }}),
        }
        # Each room door shut in turn, the rooms either side baked again —
        # by day, which the night's dimming follows (bake_door_states).
        if variant == ("day" if "day" in order else order[0]):
            if args.static:
                log("door states baked: none, the version is drawn fully static")
            else:
                door_states = bake_door_states([obj for obj in lightmapped if obj not in lids], settings.get("doors", []), zones,
                                               args.size, args.samples, written, covered, normal, seams, args.out,
                                               skip=lid_core if lids else None, links=settings.get("openings", settings.get("links")))

    # Each switch's light, on its own, in the rooms it reaches: added to the
    # day's or the night's in the public view when the switch is on. A pass
    # is one switch's (switch_batches says why not more); written for
    # several all the same — a pass is then taken apart room by room, each
    # room's texels, vertices and probes holding one switch's light.
    asked = []
    for i, switch in enumerate([] if "switches" in CUT else settings.get("switches", [])):
        here = [zone for zone in switch["zones"] if zone in zones]
        if any(obj.get("zone") in here for obj in lightmapped) and (not ONLY or switch["id"] in ONLY):
            asked.append((i, switch, here))
    passes = switch_batches([switch for _, switch, _ in asked], [here for _, _, here in asked], settings, objects)

    def scale_of(images):
        lit = np.concatenate([rgb.max(axis=2).ravel() for rgb in images])
        lit = lit[lit > 1e-5]
        return max(float(np.percentile(lit, 99.7)) if lit.size else 1.0, 0.05)

    # Each room's middle daylight, from its own curve by day (lightzones.room_curve: its knee is an eighth of it): what a
    # lamp's spill into the room is seen beside (LAYER_BESIDE).
    daylight = {zone: curve[0] * lightzones.KNEE for zone, curve in ((variants.get("day") or {}).get("rooms") or {}).get("zones", {}).items()}
    baked_switches = {}
    for number, together in enumerate(passes):
        started = time.time()
        if len(together) > 1:
            log(f"switches, pass {number + 1} of {len(passes)}:", ", ".join(asked[k][1]["id"] for k in together))
        light_switches([asked[k][1] for k in together])
        lit_rooms = [zone for k in together for zone in asked[k][2]]
        members = [obj for obj in lightmapped if obj.get("zone") in lit_rooms]
        lit_layers = bake_switch(members, lit_rooms, zones, args.size, args.samples, written, covered, normal, seams)
        # Their thin faces' and doors' probes in those rooms, and the light
        # probes' there, for what moves: the lamps' straight light and what
        # they bounce, apart.
        lit_probed = [sets[zone] for zone in lit_rooms if zone in sets]
        if lit_probed:
            bake_vertices(lit_probed, "_straight", max(32, args.samples // 4), {"DIRECT"})
            bake_vertices(lit_probed, "_bounce", args.samples, {"INDIRECT"})
        for k in together:
            t = time.time()
            i, switch, here = asked[k]
            layers = {zone: lit_layers[zone] for zone in here}
            scale = scale_of([rgb for rgb, _ in layers.values()])
            bounce_scale = scale_of([bounce for _, bounce in layers.values()])
            name = f"_S{i}"
            probed = [sets[zone] for zone in here if zone in sets]
            gridded = [np.array(probe["grid"], dtype=np.int64) for _, probe, _ in probed if "grid" in probe]
            if gridded:
                # The light probes' share of it (probe_grid), for what moves:
                # all of it, and what the lamps bounce.
                count = len(grid["points"])
                indices = np.sort(np.concatenate(gridded))
                straight = read_grid(probed, count, ["_straight"])[indices]
                bounced = read_grid(probed, count, ["_bounce"])[indices]
                grid_light_of = (indices, straight + bounced, bounced)
            else:
                grid_light_of = None
            if probed:
                # What its lamps bounce (INDIRECT), and all of it.
                if not args.static:
                    add_attributes(probed, name + INDIRECT, ["_bounce"])
                add_attributes(probed, name, ["_straight", "_bounce"], drop=["_straight", "_bounce"])
                thin = [obj for objs, _, _ in probed for obj in objs if obj in vertex_lit]
                smooth_vertex_light(thin, name)
                smooth_vertex_light(thin, name + INDIRECT)
                # Where it hardly reaches — a room over from the lamp — the thin
                # faces keep none of it (SWITCH_SPILL).
                own = switch["zones"][0]
                for obj in thin:
                    if name not in obj.data.color_attributes:
                        continue
                    data = obj.data.color_attributes[name].data
                    values = np.empty(len(data) * 4, dtype=np.float32)
                    data.foreach_get("color", values)
                    values = values.reshape(-1, 4)[:, :3].max(axis=1)
                    if obj.get("zone") == own:
                        keep = values.max(initial=0.0) >= SWITCH_REACH * scale
                    else:
                        keep = values.size and values.mean() >= SWITCH_SPILL * scale
                    if not keep:
                        for drop in (name, name + INDIRECT):
                            if drop in obj.data.color_attributes:
                                obj.data.color_attributes.remove(obj.data.color_attributes[drop])
            nearby = [obj for obj in probes if obj.get("zone") in here]
            entry = {
                "id": switch["id"],
                "label": switch.get("label"),
                "scale": scale,
                "encoding": ENCODING,
                "storage": STORAGE,
                # Its light on the thin faces of those rooms, and on their doors.
                "attribute": name,
                "doors": read_probes(nearby, name),
                "doorSides": read_probe_sides(nearby, name),
                "layers": {},
                # Its lamps as they were baked, for a view that lights them live —
                # a three.js PointLight takes a lamp's power in watts over 4π as
                # its intensity — and the light they bounce, for that view to take
                # from its layers instead.
                "lights": [{key: fitting[key] for key in ("kind", "position", "power", "color", "size") if key in fitting}
                           for fitting in switch["lights"]],
                # The rooms next door it lights through doors alone, and which:
                # the view lets less of its light into each as they shut.
                "through": {zone: doors for zone, doors in switch.get("through", {}).items() if zone in layers},
                # (Not for a version drawn fully static, which lights no lamp itself.)
                **({} if args.static else {"indirect": {
                    "scale": bounce_scale,
                    "attribute": name + INDIRECT,
                    "doors": read_probes(nearby, name + INDIRECT),
                    "doorSides": read_probe_sides(nearby, name + INDIRECT),
                    "layers": {},
                }}),
            }
            for zone, (rgb, bounce) in layers.items():
                base = f"s{i}-{zone}"
                x0, y0, x1, y1 = crop_box(zones[zone], args.size)
                files, _ = write_lightmap(rgb, base, scale=scale)
                entry["layers"][zone] = {
                    **files,
                    # How much of its light falls here, for the view to keep the
                    # strongest where more reach a room than it has room for.
                    "strength": round(float(rgb.mean()), 6),
                    # Where the crop is in the atlas, in the view's (glTF) UVs —
                    # v down from the top: [u, v, width, height].
                    "rect": [x0 / args.size, 1 - y1 / args.size, (x1 - x0) / args.size, (y1 - y0) / args.size],
                }
                # A room the switch's light only spills into — up a stair, through a doorway — has a hundredth of
                # what its own room has: at the switch's one scale that is a handful of the 255 levels, the WebP errs
                # by blocks of them, and by day, the room exposed many times over, they show as tinted rectangles on
                # its walls (Wrenfield's landing under the loft's lamp). So such a room's layer is written a second
                # time held its own way (`own`, encode_own), for a view that adds the layers up itself (World/
                # LightResolver.js); the first is as ever, for a view that does not (a build from before this).
                lit = (written & ~covered)[y0:y1, x0:x1]
                brightness = rgb.max(axis=2)[lit]
                brightness = brightness[brightness > 1e-5]
                if brightness.size and float(np.median(brightness)) < scale * LAYER_OWN:
                    # Its curve spends no levels on light a small share of the room's own daylight: grain, and most of the file.
                    least = max(LAYER_LEAST, daylight.get(zone, 0.0) / LAYER_BESIDE)
                    curve = encode_own(rgb, os.path.join(args.out, f"{base}-own"), lit, least)
                    own_files = {"lightmap": f"{base}-own-luma.webp", "chroma": f"{base}-own-chroma.webp"}
                    if args.size > PHONE_SIZE:
                        small, at = rgb, args.size
                        while at > PHONE_SIZE:
                            small, at = half(small), at // 2
                        encode_own(small, os.path.join(args.out, f"{base}-own-phone"), None, least, curve=curve)
                        own_files["lightmapPhone"] = f"{base}-own-phone-luma.webp"
                        own_files["chromaPhone"] = f"{base}-own-phone-chroma.webp"
                    entry["layers"][zone]["own"] = {**own_files, "encoding": lightzones.ENCODING, "curve": curve}
                if not args.static:
                    entry["indirect"]["layers"][zone], _ = write_lightmap(bounce, f"{base}-indirect", scale=bounce_scale)
            baked_switches[k] = (entry, grid_light_of)
            log("switch", switch["id"], "written" if len(together) > 1 else "done", round(time.time() - (t if len(together) > 1 else started), 1), "s")
        if len(together) > 1:
            log(f"switches, pass {number + 1}:", len(together), "done", round(time.time() - started, 1), "s")
    # In the switches' own order, whatever passes they were baked in.
    switches = [baked_switches[k][0] for k in range(len(asked))]
    if switches:
        layers = [layer for entry in switches for layer in entry["layers"].values()]
        log(sum(1 for layer in layers if "own" in layer), "of the switches'", len(layers), "layers written a second time, held their own way")
    grid_switches = [baked_switches[k][1] for k in range(len(asked))]
    # A light probe that sees a lamp's light is in the air too: in a room daylight does not reach (a loft, a
    # windowless bathroom) the day and the night give its probes next to nothing, and which of them were over the
    # least light that counts as seeing was their grain's doing — a room left without one, its drawers drawn black.
    if grid_seen is not None:
        for entry in grid_switches:
            if entry is not None:
                indices, full, _ = entry
                grid_seen[indices] |= full.max(axis=(1, 2)) > 1e-5

    # The light probes, for a view lit live to light what moves with.
    grid_description = None
    if grid is not None:
        valid = ~grid["solid"] & (grid_seen if grid_seen is not None else True)
        log("light probes that see light:", int(valid.sum()), "of", len(valid))
        grid_description = write_grid(os.path.join(args.out, "probes.bin"), grid, valid, grid_light, grid_switches, grid_sun)

    for obj in probes + [probe for _, probe, _ in sets.values()]:
        bpy.data.objects.remove(obj, do_unlink=True)

    log("the scene was handed to Cycles", sum(HANDED.values()), "times:", HANDED["lightmap"], "for lightmap passes,",
        HANDED["vertices"], "for the vertices' and the probes' light")
    for obj in objects:
        if "_density" in obj:
            del obj["_density"]
    t = time.time()
    count = len(objects)
    objects = join_for_drawing(objects)
    log("joined for drawing:", count, "objects to", len(objects), round(time.time() - t, 1), "s")
    export(objects, os.path.join(args.out, "lit.glb"))
    # What the baked view draws: more meshes than the snapshot, each split
    # into its lightmapped and vertex-lit parts, and the vertices added
    # along long thin edges.
    json.dump({"size": args.size, "samples": args.samples, "texel": texel, "margin": MARGIN, "view": VIEW, "variants": variants,
               # Baked for a version drawn fully static alone (--static): no door states, light probes, sun masks or light apart.
               **({"only": "static"} if args.static else {}),
               # Each room's rectangle of the lightmap, [u, v, width, height] in UV units.
               "zones": {zone: [round(c, 6) for c in rect] for zone, rect in zones.items()},
               # Each switch's light, room by room (above).
               "switches": switches,
               # The light probes, and where in their file each part is (write_grid).
               **({"probes": grid_description} if grid_description else {}),
               # How much of each room's light stays as each of its doors shuts.
               **({"doorStates": door_states} if door_states else {}),
               "meshes": len(objects), "triangles": sum(len(o.data.polygons) for o in objects)},
              open(os.path.join(args.out, "bake.json"), "w"), indent=2)


main()

"""Turn the people downloaded from Mixamo into what the app animates round a
property (frontend/Experience/World/People.js), in a folder that
scripts/optimize-people.mjs then packs for the web:

  - <id>.glb, one a character: its meshes, materials and textures and its
    skeleton, in its bind pose, with no animation. About 1.6-1.9 m tall,
    its feet on y = 0, its pelvis over the origin, facing +Z.
  - clips.glb: one skeleton, and every clip as an animation of it, named
    after its file ("Sitting Talking"). Each moves the bones as Mixamo
    gave it; the Hips also carry where the body is, so a clip's root
    motion stays in it — but a sitting or lying clip that walks in and
    sits down first keeps only its settled part (settle), and a lying
    clip is turned to lie with its head to +Z (head_forward).
  - people.json: what the app needs to place them — each character's
    height and hips, each clip's pose and where its pelvis and seat are.

Both come in the same skeleton, Mixamo's, its bones named "mixamorig:Hips"
and so on (three.js's loader drops the colon: "mixamorigHips"). Mixamo
numbers the prefix of a character that came with a rig of its own
("mixamorig1:"), and the app's female avatar has none: all are made
"mixamorig:". A clip turns each bone as it says whatever the body, but
moves the Hips by a body of its own size: the app scales the Hips track,
and the pelvis and seat here, by the character's "hips" (its pelvis's
height standing) over the clips'.

The downloads, in --src (assets/people by default):

  characters/*.fbx   one a character: FBX Binary, With Skin, T-pose
  animations/*.fbx   one a clip: FBX Binary, Without Skin, 30 fps,
                     keyframe reduction none

Mixamo's FBX is in centimetres, its armature imported at 0.01 and turned
up from Y to Z: that scale and turn are taken into the bones and meshes,
so the skeleton comes out in metres with nothing above it but an
"Armature" node at the origin, in characters and clips alike — which is
what lets one clips.glb drive every character. A clip from a skeleton
other than the first clip's (downloaded on another character) is
re-keyed onto it frame by frame, bone for bone, its Hips scaled by size.

Mixamo's materials are mended on the way (tidy_materials: its gloss map
read as roughness, its specular map) and its textures cut to 1024 px; a
character not downloaded life size is brought to it (resize: Remy comes
at twice it).

With --standin it makes the stand-ins the app uses until there are
downloads, from the app's own avatars (assets/avatars/): the two avatars
as characters, their "Idle" clip, and a sitting and a lying pose made
here from it (standin-*.glb, clips.standin.glb, people.standin.json).

In Blender, which is Z-up, a person faces -Y; glTF's (x, y, z) is
Blender's (x, z, -y).

    npm run people                               (this, then the packing)
    blender --background --python import_people.py -- --src <dir> --out <dir> [--standin]
"""
import argparse
import contextlib
import io
import json
import math
import os
import re
import statistics
import sys

import bpy
import numpy as np
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
AVATARS = os.path.join(REPO, "assets", "avatars")

FPS = 30
HIPS = "mixamorig:Hips"
PREFIX = "mixamorig:"

# What each clip is, by its name (the file's, "Sitting Talking"). For the
# pose and for the hand, the first row whose pattern matches and gives one
# decides; edit freely. pose: "stand" (the default), "sit" or "lie"; hand:
# whether the right hand is free to hold a glass all through the clip
# (true unless a row says otherwise — a lying clip's is false).
CLASSIFY = [
    # pattern                                           pose     hand
    (r"\bsit|sitting",                                  "sit",   None),
    (r"\blay|laying|lying|\blie\b|sleep|sunbath|tann",  "lie",   False),
    (r"clap|cheer|wav(e|ing)|point|applau|phone|text|shrug|bow|stretch|"
     r"arms? crossed|hands? on hips|thumbs? up|danc",
                                                        None,    False),
]

# The bones whose skin is what a body sits or lies on (the buttocks, the
# backs of the thighs, the lower back), and how far round the pelvis to
# look for it.
SEAT_GROUPS = ("mixamorig:Hips", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg", "mixamorig:Spine")
SEAT_REACH = 0.25          # m, across, from the pelvis
SEAT_GUESS = 0.10          # m: the pelvis above the seat, when no body measures it
TEXTURE_MOST = 1024        # px: the largest texture side the export keeps

# A character whose download is not life size (Mixamo's Remy comes at
# twice it) is scaled by the first of these that brings it between
# HEIGHT_RANGE; one that none does, to TYPICAL_HEIGHT. HEIGHTS sets any
# character's height outright, by id, in metres.
HEIGHT_RANGE = (1.45, 2.1)
UNIT_SLIPS = (0.5, 2, 0.1, 10, 1 / 2.54, 2.54, 0.01, 100)
TYPICAL_HEIGHT = 1.75
HEIGHTS = {}

# A sitting or lying clip that gets there first — walks in, sits down —
# would do it again at every loop: only its settled part is kept, the
# frames where the pelvis is within SETTLED of its lowest, less the
# first SETTLE_FRAMES of them, moved back over the root (Mixamo's
# "Sitting Drinking" walks 2.7 m to its chair). TRIMS sets a clip's
# frames outright, by name, as (first, last) at 30 fps, counted from 1
# as Blender does.
SETTLED = 0.06             # m
SETTLE_FRAMES = 10
TRIMS = {}

# The made-up stand-in poses, from Idle: the pelvis above the floor,
# which puts the avatars' seat at about 0.45 m, and lying, about 0 m.
STANDIN_SIT_PELVIS = 0.59
STANDIN_LIE_PELVIS = 0.16


# ---------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------

def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def label(stem):
    """A file name as a person's name: "brian" -> "Brian"."""
    words = re.sub(r"[-_]+", " ", stem).strip()
    return words if words != words.lower() else words.title()


def load(path):
    """What one file holds: its armature and the meshes it deforms. Anything
    else it brings (empties, cameras, lights, unrigged meshes) is dropped,
    an empty above the armature after handing its transform down."""
    before = set(bpy.data.objects)
    # quietly: both importers log every node they make
    with contextlib.redirect_stdout(io.StringIO()):
        if path.lower().endswith(".fbx"):
            bpy.ops.import_scene.fbx(filepath=path, use_anim=True, ignore_leaf_bones=False,
                                     automatic_bone_orientation=False, use_custom_props=False)
        else:
            bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    armatures = [o for o in new if o.type == "ARMATURE"]
    if len(armatures) != 1:
        raise SystemExit(f"{os.path.basename(path)}: {len(armatures)} armatures — expected one Mixamo skeleton")
    arm = armatures[0]
    if arm.parent:
        world = arm.matrix_world.copy()
        arm.parent = None
        arm.matrix_world = world
    meshes = [o for o in new if o.type == "MESH"
              and any(m.type == "ARMATURE" and m.object == arm for m in o.modifiers)]
    for o in new:
        if o is not arm and o not in meshes:
            if o.type == "MESH" and o.parent is arm:
                print(f"  {os.path.basename(path)}: dropped {o.name}, which no bone deforms")
            bpy.data.objects.remove(o, do_unlink=True)
    return arm, meshes


def rename_bones(arm):
    """Every bone "mixamorig:<Bone>", whatever prefix it came with. Blender
    renames the vertex groups and the keyed channels with it."""
    names = [b.name for b in arm.data.bones]
    plain = not any(re.match(r"^mixamorig\d*[:_]", n) for n in names) and "Hips" in names
    for bone in arm.data.bones:
        m = re.match(r"^mixamorig\d*[:_](.+)$", bone.name)
        if m:
            bone.name = PREFIX + m.group(1)
        elif plain:
            bone.name = PREFIX + bone.name
    if HIPS not in arm.data.bones:
        raise SystemExit(f"{arm.name}: no Hips bone — not a Mixamo skeleton ({names[:4]} ...)")


def channelbag(action):
    """The action's F-curves (Blender 5's actions keep them in slots)."""
    for slot in action.slots:
        bag = anim_utils.action_get_channelbag_for_slot(action, slot)
        if bag and any(fc.data_path.startswith("pose.bones[") for fc in bag.fcurves):
            return bag
    return None


def bone_curves_only(action):
    """Drop what an action keys of the object itself (FBX bakes the
    armature's own transform in): only the bones move."""
    bag = channelbag(action)
    if bag:
        for fc in [fc for fc in bag.fcurves if not fc.data_path.startswith("pose.bones[")]:
            bag.fcurves.remove(fc)


# ---------------------------------------------------------------------
# Into metres, Z-up, at the origin
# ---------------------------------------------------------------------

def take_in(arm, meshes, matrix, actions=()):
    """Bake `matrix` (the armature's world transform, or a shift) into the
    bones and the meshes, leaving the armature at the origin, unscaled.

    A pose bone's location is in its own rest frame, in the armature's
    units: the bones turn with the matrix, so their keys stay right, but
    their locations take its scale (Mixamo's 0.01)."""
    scale = sum(matrix.to_scale()) / 3
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        world = o.matrix_world.copy()
        o.parent = None
        o.data.transform(matrix @ arm.matrix_world.inverted() @ world, shape_keys=True)
        o.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in arm.data.edit_bones:
        # Leaving edit mode puts a connected bone's head on its parent's
        # tail, which FBX import leaves wherever: some legs came out a
        # metre long. Nothing here needs bones connected.
        bone.use_connect = False
    for bone in arm.data.edit_bones:
        bone.transform(matrix, scale=True, roll=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.matrix_world = Matrix.Identity(4)
    if abs(scale - 1) > 1e-6:
        for action in actions:
            bag = channelbag(action)
            for fc in bag.fcurves if bag else ():
                if fc.data_path.endswith(".location"):
                    for k in fc.keyframe_points:
                        k.co.y *= scale
                        k.handle_left.y *= scale
                        k.handle_right.y *= scale
    for o in meshes:
        o.parent = arm
        o.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()


def facing_turn(arm):
    """The quarter turns about Z that face a T-posed body to -Y (glTF's
    +Z): its left side to +X. Mixamo's always face so; this only guards
    against a file that was turned."""
    left = arm.data.bones.get(PREFIX + "LeftUpLeg")
    right = arm.data.bones.get(PREFIX + "RightUpLeg")
    if not (left and right):
        return Matrix.Identity(4)
    across = left.head_local - right.head_local
    quarters = round(math.atan2(across.y, across.x) / (math.pi / 2))
    if quarters % 4 == 0:
        return Matrix.Identity(4)
    print(f"  turned {-90 * quarters}° to face +Z")
    return Matrix.Rotation(-quarters * math.pi / 2, 4, "Z")


def rest_pose(arm):
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def evaluated_points(meshes, groups=None):
    """World positions of the meshes' vertices as posed now — only those
    whose strongest bone is one of `groups`, if given."""
    deps = bpy.context.evaluated_depsgraph_get()
    points = []
    for o in meshes:
        wanted = None
        if groups:
            index = {g.index for g in o.vertex_groups if g.name in groups}
            if not index:
                continue
            wanted = []
            for v in o.data.vertices:
                top = max(v.groups, key=lambda g: g.weight, default=None)
                wanted.append(top is not None and top.group in index)
        e = o.evaluated_get(deps)
        me = e.to_mesh()
        mw = e.matrix_world
        for i, v in enumerate(me.vertices):
            if wanted is None or (i < len(wanted) and wanted[i]):
                points.append(mw @ v.co)
        e.to_mesh_clear()
    return points


def ankles(arm, posed=False):
    """The ankles' mean height, at rest or as posed now."""
    if posed:
        return sum(arm.pose.bones[f"{PREFIX}{s}Foot"].head.z for s in ("Left", "Right")) / 2
    return sum(arm.data.bones[f"{PREFIX}{s}Foot"].head_local.z for s in ("Left", "Right")) / 2


def leg_chain(arm, posed=False):
    """Pelvis to ankle with the leg straight, in metres, whatever the pose:
    the drop from the Hips to the hip joint along the Hips' own up, the
    thigh and the shin, averaged over both legs — at rest, or as posed
    now (a clip's own skeleton is the one its keys move, which a file
    without skin may rest differently from)."""
    bones = arm.pose.bones if posed else arm.data.bones

    def at(b):
        return b.head if posed else b.head_local
    hips = bones[HIPS]
    up = (hips.matrix if posed else hips.matrix_local).to_3x3().col[1].normalized()
    sides = []
    for side in ("Left", "Right"):
        hip, knee, foot = (bones.get(f"{PREFIX}{side}{b}") for b in ("UpLeg", "Leg", "Foot"))
        if not (hip and knee and foot):
            raise SystemExit(f"{arm.name}: no {side.lower()} leg to measure")
        sides.append(max(0.0, -(at(hip) - at(hips)).dot(up))
                     + (at(knee) - at(hip)).length + (at(foot) - at(knee)).length)
    return sum(sides) / len(sides)


def standing_hips(chain, ankle):
    """How high the pelvis is standing straight: the leg chain and the
    ankle's height off the floor. A clip moves the Hips for its own
    skeleton's size; on a character the app scales that by the
    character's standing height over the clips'."""
    return chain + min(max(ankle, 0.03), 0.25)


def gltf(v):
    """Blender (x, y, z) as glTF's Y-up (x, z, -y), rounded to the mm."""
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


# ---------------------------------------------------------------------
# Characters
# ---------------------------------------------------------------------

def image_name(image):
    return os.path.basename(image.filepath_raw or image.filepath or image.name)


def shrink(image, most=TEXTURE_MOST):
    """No side over `most`: the packing sizes them for the web anyway, and
    glTF's exporter takes minutes over Mixamo's 4096-pixel PNGs."""
    w, h = image.size
    if max(w, h) > most:
        k = most / max(w, h)
        image.scale(max(1, round(w * k)), max(1, round(h * k)))


def turned_over(image):
    """A copy of a glossiness map as a roughness map: 1 - gloss."""
    shrink(image)
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, 4)
    pixels[:, :3] = 1.0 - pixels[:, :3]
    pixels[:, 3] = 1.0
    name = re.sub(r"(?i)gloss(iness)?", "Roughness", os.path.splitext(image_name(image))[0])
    out = bpy.data.images.new(name, w, h, alpha=False)
    out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(pixels.reshape(-1))
    out.filepath_raw = f"//{name}.png"
    out.file_format = "PNG"
    out.pack()
    return out


def tidy_materials(meshes):
    """What Mixamo's FBX materials get wrong for a web view:

    - its glossiness map, which Blender's FBX import wires to Roughness as
      it is, so what should shine is matte and the cloth shines;
    - its specular map, which would make every material a physical one
      (a costlier shader) for little the roughness does not show;
    - a transparency or metal factor with no texture behind it (a see-
      through body, studio-chrome skin), and a high gloss (wet plastic)."""
    for mat in {s.material for o in meshes for s in o.material_slots if s.material}:
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.node_tree else None
        if not bsdf:
            continue
        rough = bsdf.inputs["Roughness"]
        if rough.is_linked:
            node = rough.links[0].from_node
            if node.type == "TEX_IMAGE" and node.image and "gloss" in image_name(node.image).lower():
                node.image = turned_over(node.image)
        else:
            rough.default_value = max(rough.default_value, 0.45)
        spec = bsdf.inputs["Specular IOR Level"]
        for link in list(spec.links):
            mat.node_tree.links.remove(link)
        spec.default_value = 0.5
        if not bsdf.inputs["Alpha"].is_linked:
            bsdf.inputs["Alpha"].default_value = 1.0
        if not bsdf.inputs["Metallic"].is_linked:
            bsdf.inputs["Metallic"].default_value = 0.0
    for image in bpy.data.images:
        if image.size[0]:
            shrink(image)


def character(path, ident, name, out):
    """Load, clean, measure and export one character; leave it loaded, so
    the clips can be measured on its body."""
    fresh()
    arm, meshes = load(path)
    if not meshes:
        raise SystemExit(f"{os.path.basename(path)}: no skinned mesh — download it With Skin")
    rename_bones(arm)
    for o in [arm, *meshes]:
        o.animation_data_clear()
        keys = getattr(o.data, "shape_keys", None)
        if keys:
            keys.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    rest_pose(arm)

    # metres, the armature at the origin, facing +Z (glTF) ...
    take_in(arm, meshes, arm.matrix_world.copy())
    take_in(arm, meshes, facing_turn(arm))
    # ... the feet on the ground, the pelvis over the origin
    points = evaluated_points(meshes)
    floor = min(p.z for p in points)
    hips = arm.data.bones[HIPS].head_local
    take_in(arm, meshes, Matrix.Translation((-hips.x, -hips.y, -floor)))

    tidy_materials(meshes)
    arm.name = "Armature"
    resize(arm, meshes, ident)
    size = standing_hips(leg_chain(arm), ankles(arm))
    points = evaluated_points(meshes)
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    meta = {
        "id": ident,
        "name": name,
        "file": f"{ident}.glb",
        "height": round(hi.z - lo.z, 3),
        "hips": round(size, 3),
        "source": os.path.basename(path),
    }
    left = arm.data.bones.get(PREFIX + "LeftHand")
    if left and left.head_local.x <= 0:
        print(f"  WARNING {ident}: its left hand is not on its left — facing check failed")
    export(os.path.join(out, meta["file"]), [arm, *meshes], animations=False)
    print(f"  {ident}: {meta['height']:.2f} m tall, hips {meta['hips']:.3f} m standing "
          f"({arm.data.bones[HIPS].head_local.z:.3f} at rest), "
          f"{len(arm.data.bones)} bones, {len(meshes)} meshes")
    return meta, arm, meshes


def resize(arm, meshes, ident):
    """Bring a character to life size (HEIGHT_RANGE, HEIGHTS)."""
    points = evaluated_points(meshes)
    height = max(p.z for p in points) - min(p.z for p in points)
    if ident in HEIGHTS:
        k = HEIGHTS[ident] / height
    elif HEIGHT_RANGE[0] <= height <= HEIGHT_RANGE[1]:
        return
    else:
        k = next((k for k in UNIT_SLIPS if HEIGHT_RANGE[0] <= height * k <= HEIGHT_RANGE[1]), TYPICAL_HEIGHT / height)
    if abs(k - 1) > 1e-4:
        take_in(arm, meshes, Matrix.Scale(k, 4))
        print(f"  {ident}: came {height:.2f} m tall, scaled x{k:.3g} to {height * k:.2f} m")


def export(path, objects, animations):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    # quietly: glTF's exporter warns about every shared image sampler
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True, export_yup=True,
            export_cameras=False, export_lights=False, export_extras=False,
            export_vertex_color="NONE", export_all_vertex_colors=False,
            export_skins=True, export_def_bones=False, export_leaf_bone=False,
            export_rest_position_armature=True, export_morph=False,
            export_animations=animations, export_animation_mode="ACTIONS",
            export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True,
            export_anim_single_armature=True, export_reset_pose_bones=True,
            export_optimize_animation_size=False, export_bake_animation=False,
        )


# ---------------------------------------------------------------------
# Clips
# ---------------------------------------------------------------------

def classify(name):
    pose = next((p for pattern, p, _ in CLASSIFY if p and re.search(pattern, name, re.I)), "stand")
    hand = next((h for pattern, _, h in CLASSIFY if h is not None and re.search(pattern, name, re.I)), None)
    if hand is None:
        hand = pose != "lie"
    return pose, hand


def rest_local(bone):
    """A bone's rest transform in its parent's frame — what glTF's node
    holds, and what a clip's key is applied after."""
    if bone.parent:
        return bone.parent.matrix_local.inverted() @ bone.matrix_local
    return bone.matrix_local.copy()


def same_skeleton(a, b):
    """Whether b rests exactly as a does (bone for bone, to 0.5° and 2 mm):
    then a's clip keys mean the same on b."""
    for bone in a.data.bones:
        other = b.data.bones.get(bone.name)
        if not other:
            continue
        ra, rb = rest_local(bone), rest_local(other)
        if (ra.to_translation() - rb.to_translation()).length > 0.002:
            return False
        if ra.to_quaternion().rotation_difference(rb.to_quaternion()).angle > math.radians(0.5):
            return False
    return True


def assign(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if action and action.slots and not ad.action_slot:
        ad.action_slot = action.slots[0]


def frames(action):
    lo, hi = action.frame_range
    return int(round(lo)), int(round(hi))


def local_pose(arm):
    """Each bone's transform in its parent's frame, as posed now."""
    return {pb.name: rest_local(pb.bone) @ pb.matrix_basis for pb in arm.pose.bones}


def write_keys(arm, action, samples, first):
    """Key `samples` ({bone: [(location | None, quaternion), ...]}, one a
    frame from `first`) into `action` on `arm`, linearly."""
    assign(arm, action)
    for name, keys in samples.items():
        path = f'pose.bones["{name}"]'
        channels = [("rotation_quaternion", 4, lambda k: k[1])]
        if keys[0][0] is not None:
            channels.append(("location", 3, lambda k: k[0]))
        for prop, n, pick in channels:
            for i in range(n):
                fc = action.fcurve_ensure_for_datablock(arm, f"{path}.{prop}", index=i, group_name=name)
                fc.keyframe_points.clear()
                fc.keyframe_points.add(len(keys))
                co = []
                for f, k in enumerate(keys):
                    co += [first + f, pick(k)[i]]
                fc.keyframe_points.foreach_set("co", co)
                fc.keyframe_points.foreach_set("interpolation", [1] * len(keys))   # LINEAR
                fc.update()


def retarget(src, action, master, name, ratio):
    """`action` (on `src`) as a new action of `master`: each frame, each bone
    turned as src's is in its parent's frame — as three.js will apply it —
    and the Hips moved as src's, scaled by `ratio` (master's size over
    src's)."""
    assign(src, action)
    action.name = f"{name} (as downloaded)"
    lo, hi = frames(action)
    rest = {b.name: rest_local(b) for b in master.data.bones}
    samples = {b.name: [] for b in master.data.bones if b.name in src.pose.bones}
    scene = bpy.context.scene
    for f in range(lo, hi + 1):
        scene.frame_set(f)
        posed = local_pose(src)
        for bone, keys in samples.items():
            m = posed[bone]
            q = m.to_quaternion()
            t = m.to_translation() * ratio if bone == HIPS else rest[bone].to_translation()
            basis = rest[bone].inverted() @ Matrix.Translation(t) @ q.to_matrix().to_4x4()
            loc, rot, _ = basis.decompose()
            if keys and keys[-1][1].dot(rot) < 0:
                rot.negate()
            keys.append((loc if bone == HIPS else None, rot))
    new = bpy.data.actions.new(name)
    write_keys(master, new, samples, lo)
    print(f"  {name}: re-keyed onto the first clip's skeleton ({hi - lo + 1} frames, Hips x{ratio:.3f})")
    return new


def stack(master, action):
    """Keep `action` on `master` as a track of its own, for the export."""
    action.use_fake_user = True
    ad = master.animation_data or master.animation_data_create()
    track = ad.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, frames(action)[0], action)
    if hasattr(strip, "action_slot") and action.slots and not strip.action_slot:
        strip.action_slot = action.slots[0]


def settle(arm, action):
    """Trim a sitting or lying clip to its settled part (TRIMS, SETTLED)."""
    name = action.name
    lo, hi = frames(action)
    if name in TRIMS:
        start, end = TRIMS[name]
    elif classify(name)[0] == "stand" or hi - lo < 2:
        return
    else:
        assign(arm, action)
        heights = []
        for f in range(lo, hi + 1):
            bpy.context.scene.frame_set(f)
            heights.append(arm.pose.bones[HIPS].head.z)
        low = min(heights)
        best, run = (0, -1), None
        for i, z in enumerate(heights + [math.inf]):
            if z <= low + SETTLED:
                run = i if run is None else run
            elif run is not None:
                if i - 1 - run > best[1] - best[0]:
                    best = (run, i - 1)
                run = None
        if best[1] - best[0] >= 0.95 * (hi - lo):
            return
        start = lo + min(best[0] + SETTLE_FRAMES, best[1])
        end = lo + best[1]
    action.use_frame_range = True
    action.frame_start, action.frame_end = start, end
    # where it settled, back over the root: the Hips' keys are in their
    # rest frame, so the shift is turned into it
    assign(arm, action)
    bpy.context.scene.frame_set(start)
    pelvis = arm.pose.bones[HIPS].head
    away = Vector((pelvis.x, pelvis.y, 0))
    shift = arm.data.bones[HIPS].matrix_local.to_3x3().inverted() @ away
    bag = channelbag(action)
    for fc in bag.fcurves:
        if fc.data_path == f'pose.bones["{HIPS}"].location':
            for k in fc.keyframe_points:
                k.co.y -= shift[fc.array_index]
                k.handle_left.y -= shift[fc.array_index]
                k.handle_right.y -= shift[fc.array_index]
            fc.update()
    print(f"  {name}: kept frames {start}-{end} of {lo}-{hi}, where it has settled, "
          f"{away.length:.2f} m from where it started")


def head_forward(arm, action):
    """Turn a lying clip about the root so its head lies to +Z (glTF), as a
    standing or sitting clip faces: then a person's rotation is which way
    its head points, whatever the clip. Mixamo's lie every which way
    ("Laying Idle" head to -Z, "Laying Propped Female" to -X)."""
    if classify(action.name)[0] != "lie":
        return
    lo, hi = frames(action)
    assign(arm, action)
    bpy.context.scene.frame_set(lo)
    bpy.context.view_layer.update()
    pose = arm.pose.bones
    lean = pose[PREFIX + "Head"].head - pose[HIPS].head
    if lean.xy.length < 0.15:      # not lying after all: the head is over the pelvis
        return
    turn = -math.pi / 2 - math.atan2(lean.y, lean.x)
    turn = math.atan2(math.sin(turn), math.cos(turn))
    if abs(turn) < math.radians(2):
        return
    spin = Matrix.Rotation(turn, 4, "Z")
    rest = rest_local(arm.data.bones[HIPS])
    keys = []
    for f in range(lo, hi + 1):
        bpy.context.scene.frame_set(f)
        basis = rest.inverted() @ spin @ rest @ pose[HIPS].matrix_basis
        loc, rot, _ = basis.decompose()
        if keys and keys[-1][1].dot(rot) < 0:
            rot.negate()
        keys.append((loc, rot))
    write_keys(arm, action, {HIPS: keys}, lo)
    print(f"  {action.name}: turned {math.degrees(turn):.0f}° to lie head to +Z")


def clip_size(arm, action):
    """How high the pelvis of the skeleton `action` was made for stands
    (standing_hips), from its first frame: the ankles off the floor as
    they are there if it stands or sits (feet down), else as at rest;
    and its leg chain."""
    assign(arm, action)
    bpy.context.scene.frame_set(frames(action)[0])
    bpy.context.view_layer.update()
    feet_down = classify(action.name)[0] != "lie"
    chain = leg_chain(arm, posed=True)
    return standing_hips(chain, ankles(arm, posed=feet_down)), chain


def import_clips(paths):
    """Every clip as an action of one armature — the first standing clip's
    skeleton, whose feet are surely on the floor in its first frame — and
    how high that skeleton's pelvis stands."""
    paths = sorted(paths, key=lambda p: classify(os.path.basename(p))[0] != "stand")
    master, actions, size, chain = None, [], None, None
    for path in paths:
        name = os.path.splitext(os.path.basename(path))[0]
        arm, meshes = load(path)
        for o in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
        if meshes:
            print(f"  {name}: dropped its skin (download clips Without Skin: smaller, same motion)")
        action = arm.animation_data.action if arm.animation_data else None
        if not action:
            print(f"  SKIPPED {name}: no animation in it")
            bpy.data.objects.remove(arm, do_unlink=True)
            continue
        rename_bones(arm)
        bone_curves_only(action)
        take_in(arm, [], arm.matrix_world.copy(), [action])
        action.name = name
        settle(arm, action)
        head_forward(arm, action)
        if master is None:
            master = arm
            master.name = "Armature"
            size, chain = clip_size(master, action)
        elif not same_skeleton(master, arm):
            action = retarget(arm, action, master, name, size / clip_size(arm, action)[0])
        if arm is not master:
            source = arm.animation_data.action
            arm.animation_data_clear()
            bpy.data.objects.remove(arm, do_unlink=True)
            # glTF's exporter takes every action that fits the skeleton
            if source is not action:
                bpy.data.actions.remove(source)
        actions.append(action)
    return master, actions, chain


def measure_clips(master, actions):
    """Each clip at its first frame: where the pelvis and head are from the
    root, and every bone's turn in its parent's frame (to pose bodies by)."""
    ad = master.animation_data
    for track in ad.nla_tracks:
        track.mute = True
    clips = []
    for action in actions:
        assign(master, action)
        lo, hi = frames(action)
        bpy.context.scene.frame_set(lo)
        bpy.context.view_layer.update()
        hips = master.pose.bones[HIPS].head.copy()
        head = master.pose.bones.get(PREFIX + "Head")
        pose, hand = classify(action.name)
        posed = local_pose(master)
        clips.append({
            "name": action.name,
            "pose": pose,
            "hand": hand,
            "pelvis": gltf(hips),
            "head": gltf(head.head) if head else None,
            "duration": round((hi - lo) / FPS, 3),
            "_turns": {b: m.to_quaternion() for b, m in posed.items()},
            "_hips": posed[HIPS].to_translation(),
            "_pelvis": hips,
            "_ankle": ankles(master, posed=True),
            "_thickness": [],
        })
    ad.action = None
    for track in ad.nla_tracks:
        track.mute = False
    return clips


def clips_size(master, chain, clips):
    """How high the clips' skeleton's pelvis stands: its leg chain, and its
    ankles off the floor as most clips that stand have them on their
    first frame (else most that sit; else at rest)."""
    for pose in ("stand", "sit"):
        heights = [c["_ankle"] for c in clips if c["pose"] == pose]
        if heights:
            return standing_hips(chain, statistics.median(heights))
    return standing_hips(chain, ankles(master))


def seat_on(body, body_hips, meshes, clips, clips_hips):
    """Pose `body` as each sitting or lying clip's first frame is (each bone
    turned as the clip turns it, its Hips where the clip puts them, scaled
    as the app will) and note how far its pelvis sits above the lowest
    skin under it, in the clips' skeleton's size."""
    ratio = body_hips / clips_hips
    rest = {b.name: rest_local(b) for b in body.data.bones}
    for clip in clips:
        if clip["pose"] == "stand":
            continue
        for pb in body.pose.bones:
            q = clip["_turns"].get(pb.name)
            if q is None:
                pb.matrix_basis = Matrix.Identity(4)
                continue
            t = clip["_hips"] * ratio if pb.name == HIPS else rest[pb.name].to_translation()
            pb.matrix_basis = rest[pb.name].inverted() @ Matrix.Translation(t) @ q.to_matrix().to_4x4()
        bpy.context.view_layer.update()
        pelvis = body.matrix_world @ body.pose.bones[HIPS].head
        under = [p for p in evaluated_points(meshes, SEAT_GROUPS)
                 if math.hypot(p.x - pelvis.x, p.y - pelvis.y) < SEAT_REACH and p.z < pelvis.z]
        if under:
            clip["_thickness"].append((pelvis.z - min(p.z for p in under)) / ratio)
    rest_pose(body)


def finish_clips(clips):
    """The clips as people.json lists them: a sitting or lying clip's seat
    under its pelvis, by the bodies' median, else a guess."""
    out = []
    for clip in clips:
        seat = None
        if clip["pose"] != "stand":
            depth = statistics.median(clip["_thickness"]) if clip["_thickness"] else SEAT_GUESS
            p = clip["_pelvis"]
            seat = gltf(Vector((p.x, p.y, p.z - depth)))
        out.append({k: v for k, v in clip.items() if not k.startswith("_")} | {"seat": seat})
        print(f"  {clip['name']}: {clip['pose']}, hand {'free' if clip['hand'] else 'busy'}, "
              f"pelvis {out[-1]['pelvis']}, seat {seat}, {clip['duration']} s"
              + (f" (seat from {len(clip['_thickness'])} bodies)" if clip["_thickness"] else ""))
    return out


# ---------------------------------------------------------------------
# Stand-in poses, made from Idle
# ---------------------------------------------------------------------

def turn_bone(arm, name, rotation, at=None):
    """Set a bone's world turn to `rotation` (a 3x3), its head left where it
    is (or put `at`)."""
    pb = arm.pose.bones[name]
    head = at if at is not None else pb.matrix.to_translation()
    pb.matrix = Matrix.Translation(head) @ rotation.to_4x4()
    bpy.context.view_layer.update()


def rest_turn(arm, name):
    return arm.data.bones[name].matrix_local.to_3x3()


def held(arm, idle, name, override):
    """A copy of Idle in which the bones in `override` hold still, as
    `override(arm)` poses them on Idle's first frame."""
    action = idle.copy()
    action.name = name
    assign(arm, idle)
    lo, hi = frames(idle)
    bpy.context.scene.frame_set(lo)
    bpy.context.view_layer.update()
    # posed by hand from here, with no action to pose it back
    first = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    assign(arm, None)
    for pb in arm.pose.bones:
        pb.matrix_basis = first[pb.name]
    bpy.context.view_layer.update()
    bones = override(arm)
    held_keys = {}
    for bone in bones:
        loc, rot, _ = arm.pose.bones[bone].matrix_basis.decompose()
        held_keys[bone] = (loc if bone == HIPS else None, rot)
    bag = channelbag(action)
    for fc in [fc for fc in bag.fcurves if any(fc.data_path == f'pose.bones["{b}"].{p}'
                                                for b in bones for p in ("location", "rotation_quaternion", "scale"))]:
        bag.fcurves.remove(fc)
    write_keys(arm, action, {b: [k, k] for b, k in held_keys.items()}, lo)
    # write_keys keys frames lo and lo + 1: stretch the second to the end
    for fc in bag.fcurves:
        if any(fc.data_path.startswith(f'pose.bones["{b}"]') for b in bones):
            fc.keyframe_points[1].co.x = hi
            fc.update()
    assign(arm, None)
    rest_pose(arm)
    return action


def standin_poses(arm, idle):
    """A sitting and a lying stand-in, so the app can be tried with people
    on seats and loungers before there are Mixamo clips."""
    def rx(deg):
        return Matrix.Rotation(math.radians(deg), 3, "X")

    def rz(deg):
        return Matrix.Rotation(math.radians(deg), 3, "Z")

    def sit(a):
        hips = a.pose.bones[HIPS].matrix.to_translation()
        turn_bone(a, HIPS, rx(-8) @ rest_turn(a, HIPS), Vector((hips.x, hips.y, STANDIN_SIT_PELVIS)))
        for side, out in (("Left", 6), ("Right", -6)):
            # thighs forward, shins down, feet flat, a little apart
            turn_bone(a, f"{PREFIX}{side}UpLeg", rz(out) @ rx(-90) @ rest_turn(a, f"{PREFIX}{side}UpLeg"))
            turn_bone(a, f"{PREFIX}{side}Leg", rz(out) @ rx(-8) @ rest_turn(a, f"{PREFIX}{side}Leg"))
            turn_bone(a, f"{PREFIX}{side}Foot", rz(out) @ rest_turn(a, f"{PREFIX}{side}Foot"))
            # hands on the thighs
            for bone, aim in ((f"{PREFIX}{side}Arm", Vector((0.12 if side == "Left" else -0.12, -0.3, -1))),
                              (f"{PREFIX}{side}ForeArm", Vector((-0.1 if side == "Left" else 0.1, -1, -0.35)))):
                pb = a.pose.bones[bone]
                now = (pb.tail - pb.head).normalized()
                turn = now.rotation_difference(aim.normalized()).to_matrix()
                turn_bone(a, bone, turn @ pb.matrix.to_3x3())
        return [HIPS] + [f"{PREFIX}{s}{b}" for s in ("Left", "Right")
                         for b in ("UpLeg", "Leg", "Foot", "Arm", "ForeArm")]

    def lie(a):
        # on the back, the head to -Y (glTF +Z), the back raised a little
        # as on a lounger, the legs flat and straight
        hips = a.pose.bones[HIPS].matrix.to_translation()
        flat = Matrix.Rotation(math.pi, 3, "Y") @ rx(90)
        turn_bone(a, HIPS, rx(-12) @ flat @ rest_turn(a, HIPS), Vector((hips.x, hips.y, STANDIN_LIE_PELVIS)))
        still = [f"{PREFIX}{b}" for b in ("Spine", "Spine1", "Spine2", "Neck", "Head")]
        still += [f"{PREFIX}{s}{b}" for s in ("Left", "Right") for b in ("Leg", "Foot", "ToeBase")]
        for bone in still:
            a.pose.bones[bone].matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        for side in ("Left", "Right"):
            turn_bone(a, f"{PREFIX}{side}UpLeg", flat @ rest_turn(a, f"{PREFIX}{side}UpLeg"))
        return [HIPS, f"{PREFIX}LeftUpLeg", f"{PREFIX}RightUpLeg"] + still

    return [held(arm, idle, "Sitting (stand-in)", sit), held(arm, idle, "Lying (stand-in)", lie)]


# ---------------------------------------------------------------------

def clip_files(src):
    folder = os.path.join(src, "animations")
    if not os.path.isdir(folder):
        return []
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".fbx"))


def character_files(src):
    folder = os.path.join(src, "characters")
    if not os.path.isdir(folder):
        return []
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".fbx"))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="import_people.py")
    parser.add_argument("--src", default=os.path.join(REPO, "assets", "people"))
    parser.add_argument("--out", required=True)
    parser.add_argument("--standin", action="store_true")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    if args.standin:
        bodies = [(os.path.join(AVATARS, "avatar_male.glb"), "standin-male", "Alex (stand-in)"),
                  (os.path.join(AVATARS, "avatar_female.glb"), "standin-female", "Sam (stand-in)")]
        clips_name = "clips.standin.glb"
        meta_name = "people.standin.json"
    else:
        stems = [(p, os.path.splitext(os.path.basename(p))[0]) for p in character_files(args.src)]
        bodies = [(p, slug(stem), label(stem)) for p, stem in stems]
        clips_name = "clips.glb"
        meta_name = "people.json"
        if not bodies or not clip_files(args.src):
            raise SystemExit(f"Need characters/*.fbx and animations/*.fbx in {args.src} "
                             f"({len(bodies)} characters, {len(clip_files(args.src))} clips)")
    ids = [b[1] for b in bodies]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"Two characters' file names make the same id: {ids}")

    # The clips first, all on one skeleton ...
    print("> clips")
    fresh()
    if args.standin:
        master, _ = load(os.path.join(AVATARS, "avatar_male.glb"))
        for o in [o for o in bpy.data.objects if o.type == "MESH"]:
            bpy.data.objects.remove(o, do_unlink=True)
        rename_bones(master)
        idle = bpy.data.actions["Idle"]
        for action in [a for a in bpy.data.actions if a is not idle]:
            bpy.data.actions.remove(action)
        for track in list(master.animation_data.nla_tracks):
            master.animation_data.nla_tracks.remove(track)
        assign(master, None)
        bone_curves_only(idle)
        take_in(master, [], master.matrix_world.copy(), [idle])
        master.name = "Armature"
        rest_pose(master)
        chain = clip_size(master, idle)[1]
        assign(master, None)
        rest_pose(master)
        actions = [idle, *standin_poses(master, idle)]
    else:
        master, actions, chain = import_clips(clip_files(args.src))
    rest_pose(master)
    clips = measure_clips(master, actions)
    clips_hips = clips_size(master, chain, clips)
    for action in actions:
        stack(master, action)
    rest_pose(master)
    export(os.path.join(args.out, clips_name), [master], animations=True)
    print(f"  {len(actions)} clips on one skeleton of {len(master.data.bones)} bones, "
          f"its pelvis {clips_hips:.3f} m up standing")

    # ... then each character, measuring the sitting and lying clips' seats on it.
    print("> characters")
    characters = []
    for path, ident, name in bodies:
        meta, arm, meshes = character(path, ident, name, args.out)
        characters.append(meta)
        seat_on(arm, meta["hips"], meshes, clips, clips_hips)

    meta = {
        "standin": args.standin,
        "characters": characters,
        "clips": {"file": clips_name, "hips": round(clips_hips, 3), "fps": FPS, "list": finish_clips(clips)},
    }
    with open(os.path.join(args.out, meta_name), "w") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"  wrote {meta_name}: {len(characters)} characters, {len(clips)} clips")


if __name__ == "__main__":
    main()

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
    sits down first keeps only its settled part (settle), a lying clip
    is turned to lie with its head to +Z (head_forward), and a sitting
    one that sits facing some other way, to face +Z (face_forward).
  - people.json: what the app needs to place them — each character's
    height, hips and sex, how long its thighs and shins are (leg_bones),
    how each sitting clip sits on it (seat_on) and where its eyes and
    its mouth are on its head (eye_line: sunglasses are worn at the one,
    a bottle is drunk from at the other); each clip's pose,
    where its pelvis and
    seat are, where a sitting clip's feet are — and how far back under
    it its feet and its knees ever come, and how far out before it its
    feet (legs_through: a sofa's base is in the way of feet tucked back,
    a coffee table of feet stretched out) — and how far out a lying one's
    hands, which hand can hold a glass all through it (measured:
    hand_now, holding_hand), whom it is for if its name says
    ("... Female"), and whether it is one still pose.

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

With --avatar-clips it makes the visitor's own figure's clips beyond the
five its avatar files carry — swimming, treading water, climbing out of
the pool (frontend/Experience/World/Player/Swim.js) — from
avatar/*.fbx (FBX Binary, Without Skin, 30 fps, In Place): one skeleton,
every clip on it, as the people's are, and what each is played as
(avatar_clips: avatar-clips.glb, avatar-clips.json).

In Blender, which is Z-up, a person faces -Y; glTF's (x, y, z) is
Blender's (x, z, -y).

    npm run people                               (this, then the packing)
    npm run people -- --avatar-clips             (the visitor's clips only)
    blender --background --python import_people.py -- --src <dir> --out <dir> [--standin | --avatar-clips]
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
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
AVATARS = os.path.join(REPO, "assets", "avatars")

FPS = 30
HIPS = "mixamorig:Hips"
PREFIX = "mixamorig:"

# What each clip is, by its name (the file's, "Sitting Talking"). For the
# pose and for the hands, the first row whose pattern matches and gives
# one decides; edit freely. pose: "stand" (the default), "sit" or "lie";
# hands: False for a clip neither of whose hands holds anything whatever
# they measure (a lying clip's, a clapping one's). Any other clip's are
# measured (holding_hand).
CLASSIFY = [
    # pattern                                           pose     hands
    (r"\bsit|sitting",                                  "sit",   None),
    (r"\blay|laying|lying|\blie\b|sleep|sunbath|tann",  "lie",   False),
    (r"clap|cheer|wav(e|ing)|point|applau|phone|text|shrug|bow|stretch|"
     r"arms? crossed|hands? on hips|thumbs? up|danc",
                                                        None,    False),
]

# Which hand can hold a glass all through a clip is measured on the clip
# itself (hand_now, hands_through): a hand can when, over every frame, a
# glass in its fist never points more than TILT_MOST degrees off upright
# and its fingers never open below CURL_LEAST degrees of curl. Of two
# that can, the right, unless the left keeps the glass HAND_NEAR degrees
# more upright. The app stands a held drink upright anyway; this is how
# far it has to cheat, and the planner (shared/people.js) picks by it.
#
# No Mixamo clip but the drinking ones was made holding anything: an arm
# hanging at the side holds a glass level (70-90 degrees), so only the
# stillest hands pass, and a hand that gestures or opens does not.
TILT_MOST = 80             # degrees
CURL_LEAST = 40            # degrees
HAND_NEAR = 5              # degrees

# A clip's holding hand set outright, by name: "right", "left" or False.
# The drinking clips are measured as failing — the hand that drinks tips
# its glass past level to do it — and are what a drink is for: Mixamo's
# "Drinking" drinks with the left hand (its fingers round a glass all
# through), "Sitting Drinking" with the right.
HANDS = {
    "Drinking": "left",
    "Sitting Drinking": "right",
}
# The stand-ins' clips hold in the right hand, as they always have.
STANDIN_HANDS = {"Idle": "right", "Sitting (stand-in)": "right"}

# Whether each character is a woman or a man, by id: a clip made for one
# ("Laying Propped Female", "Sitting Reclined Male") is not given to the
# other. A character not listed is neither, and gets no such clip.
SEXES = {
    "sophie": "f", "shannon": "f", "megan": "f", "kate": "f", "elizabeth": "f", "martha": "f",
    "lewis": "m", "remy": "m", "bryce": "m", "brian": "m", "josh": "m", "leonard": "m",
    "standin-female": "f", "standin-male": "m",
}

# The bones whose skin is what a body sits or lies on (the buttocks, the
# backs of the thighs, the lower back), and how far round the pelvis to
# look for it.
SEAT_GROUPS = ("mixamorig:Hips", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg", "mixamorig:Spine")
SEAT_REACH = 0.25          # m, across, from the pelvis
SEAT_GUESS = 0.10          # m: the pelvis above the seat, when no body measures it
# The bones whose skin is a body's feet (its shoes): their lowest point
# is its soles. A foot whose ankle is within FOOT_DOWN of the lower one's
# is on the floor too (the other is crossed over a knee).
FOOT_GROUPS = ("mixamorig:LeftFoot", "mixamorig:RightFoot", "mixamorig:LeftToeBase", "mixamorig:RightToeBase")
FOOT_DOWN = 0.08           # m
FINGERS = ("Index", "Middle", "Ring", "Pinky")

# Where a character's eyes are (eye_line). Its eye bones, the meshes of
# its eyes or of its eyelashes say how high; a body with none of them
# (one mesh, eyes and all), the profile of its face: the hollow of the
# nose's bridge, which is EYES_UNDER_BRIDGE above the eyes on the
# characters that have both (0.3-1.4 cm on eleven of Mixamo's). How far
# forward is the front of the face where a pair of glasses' lenses hang:
# LENS_ACROSS either side of the nose, LENS_HIGH above and below the eyes.
EYE_MESHES = r"eye"
LASH_MESHES = r"lash"
HAIR_MESHES = r"hair"
HEAD_GROUPS = ("mixamorig:Head", "mixamorig:Neck")
EYES_UNDER_BRIDGE = 0.007  # m
# The mouth is this far under the eyes, near enough on anyone; how far
# forward its lips are is read off the profile there, MOUTH_HIGH either way.
MOUTH_UNDER_EYES = 0.068   # m
MOUTH_HIGH = 0.01          # m
PROFILE_ACROSS = 0.008     # m: the midline's strip, either side
LENS_ACROSS = (0.014, 0.06)
LENS_HIGH = 0.021          # m
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
# A sitting clip whose knees point further than this from straight ahead
# on its first frame is turned to face ahead (face_forward).
FACING_OFF = math.radians(20)

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


def leg_bones(arm, posed=False):
    """How long the thigh and the shin are — hip joint to knee, knee to
    ankle — in metres, averaged over both legs: [thigh, shin]. A clip
    turns each bone as it says whatever the body, so where a sitting
    body's knees and feet come is by these, not by its height."""
    bones = arm.pose.bones if posed else arm.data.bones

    def at(b):
        return b.head if posed else b.head_local
    thighs, shins = [], []
    for side in ("Left", "Right"):
        hip, knee, foot = (bones.get(f"{PREFIX}{side}{b}") for b in ("UpLeg", "Leg", "Foot"))
        if not (hip and knee and foot):
            return None
        thighs.append((at(knee) - at(hip)).length)
        shins.append((at(foot) - at(knee)).length)
    return [round(sum(thighs) / 2, 3), round(sum(shins) / 2, 3)]


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


def eye_line(arm, meshes):
    """Where a character's eyes are, at rest, from its head's joint: the
    point midway between them, as high as they are, as far forward as the
    front of the face round them — its brows, its lashes, its cheeks:
    where the lenses of a pair of glasses hang. As glTF has it, [x, up,
    forward], in metres; None for a body it can't be found on (no eye
    bones, no eyes or lashes of their own, no hollow in its profile).
    And with it where its mouth is — its lips, on its midline,
    MOUTH_UNDER_EYES below its eyes, as far forward as its profile comes
    there — likewise, or None: (eyes, mouth).

    How high, by the first of: its eye bones (Mixamo gives a few rigs
    them); the meshes of its eyes; those of its eyelashes (most have
    them); the hollow of its nose's bridge on its profile, less
    EYES_UNDER_BRIDGE."""
    head = arm.data.bones.get(PREFIX + "Head")
    if head is None:
        return None, None
    joint = head.head_local

    def named(pattern, without=None):
        return [o for o in meshes if re.search(pattern, o.name, re.I)
                and not (without and re.search(without, o.name, re.I))]

    def box(objects):
        points = [o.matrix_world @ v.co - joint for o in objects for v in o.data.vertices]
        if not points:
            return None
        return [(min(p[i] for p in points), max(p[i] for p in points)) for i in range(3)]

    # the face's skin, hair apart: how far forward it comes down the
    # midline (its profile) and either side of the nose, by height
    profile, beside = {}, {}
    for o in meshes:
        if re.search(HAIR_MESHES, o.name, re.I):
            continue
        groups = {g.index for g in o.vertex_groups if g.name in HEAD_GROUPS}
        for v in o.data.vertices:
            top = max(v.groups, key=lambda g: g.weight, default=None)
            if top is None or top.group not in groups:
                continue
            p = o.matrix_world @ v.co - joint
            if -p.y < 0.02:
                continue
            if abs(p.x) < PROFILE_ACROSS:
                key = round(p.z / 0.004)
                profile[key] = max(profile.get(key, 0.0), -p.y)
            if LENS_ACROSS[0] < abs(p.x) < LENS_ACROSS[1]:
                beside.setdefault(round(p.z, 3), []).append(-p.y)

    across, up, said = 0.0, None, None
    bones = [arm.data.bones.get(f"{PREFIX}{side}Eye") for side in ("Left", "Right")]
    eyes, lashes = box(named(EYE_MESHES, LASH_MESHES)), box(named(LASH_MESHES))
    if all(bones):
        middle = (bones[0].head_local + bones[1].head_local) / 2 - joint
        across, up, said = middle.x, middle.z, "its eye bones"
    elif eyes or lashes:
        found = eyes or lashes
        across, up = (found[0][0] + found[0][1]) / 2, (found[2][0] + found[2][1]) / 2
        said = "its eyes" if eyes else "its eyelashes"
    else:
        # up the profile from the tip of the nose — the furthest forward
        # of the face's lower half — to where it stops falling back
        keys = sorted(k for k in profile if 0.02 <= k * 0.004 <= 0.16)
        if keys:
            tip = max((k for k in keys if k * 0.004 <= 0.10), key=lambda k: profile[k], default=None)
            above = [k for k in keys if tip is not None and tip < k <= tip + 20]
            hollow = None
            for i, k in enumerate(above):
                rest = above[i + 1:i + 6]
                if rest and all(profile[j] >= profile[k] - 0.0005 for j in rest) and profile[tip] - profile[k] > 0.008:
                    hollow = k
                    break
            if hollow is not None:
                up, said = hollow * 0.004 - EYES_UNDER_BRIDGE, "the bridge of its nose"
    if up is None:
        return None, None
    fronts = [f for z, row in beside.items() if abs(z - up) <= LENS_HIGH for f in row]
    for found in (eyes, lashes):
        if found:
            fronts.append(-found[1][0])
    if not fronts:
        return None, None
    eye = [round(across, 3), round(up, 3), round(max(fronts), 3)]
    lips = [f for k, f in profile.items() if abs(k * 0.004 - (up - MOUTH_UNDER_EYES)) <= MOUTH_HIGH]
    mouth = [round(across, 3), round(up - MOUTH_UNDER_EYES, 3), round(max(lips), 3)] if lips else None
    print(f"  its eyes, by {said}: {eye[1] * 100:.1f} cm over its head's joint, its face {eye[2] * 100:.1f} cm forward there"
          + (f"; its lips {mouth[2] * 100:.1f} cm forward, {mouth[1] * 100:.1f} cm over the joint" if mouth else "; no lips found"))
    return eye, mouth


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
    eyes, mouth = eye_line(arm, meshes)
    meta = {
        "id": ident,
        "name": name,
        "file": f"{ident}.glb",
        "height": round(hi.z - lo.z, 3),
        "hips": round(size, 3),
        "sex": SEXES.get(ident),
        "legs": leg_bones(arm),
        "eyes": eyes,
        "mouth": mouth,
        "source": os.path.basename(path),
    }
    if meta["eyes"] is None:
        print(f"  {ident}: its eyes could not be found — it will not be given sunglasses")
    left = arm.data.bones.get(PREFIX + "LeftHand")
    if left and left.head_local.x <= 0:
        print(f"  WARNING {ident}: its left hand is not on its left — facing check failed")
    export(os.path.join(out, meta["file"]), [arm, *meshes], animations=False)
    sex = {"f": "a woman", "m": "a man"}.get(meta["sex"], "not in SEXES: neither a woman nor a man")
    print(f"  {ident}: {meta['height']:.2f} m tall, hips {meta['hips']:.3f} m standing "
          f"({arm.data.bones[HIPS].head_local.z:.3f} at rest), "
          f"{len(arm.data.bones)} bones, {len(meshes)} meshes, {sex}")
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
    """A clip's pose, and whether its hands may hold anything, by its name."""
    pose = next((p for pattern, p, _ in CLASSIFY if p and re.search(pattern, name, re.I)), "stand")
    hand = next((h for pattern, _, h in CLASSIFY if h is not None and re.search(pattern, name, re.I)), None)
    if hand is None:
        hand = pose != "lie"
    return pose, hand


def clip_sex(name):
    """Whom a clip is for, if its name says ("... Female", "... Male"):
    "f", "m" or None."""
    if re.search(r"\bfemale\b", name, re.I):
        return "f"
    if re.search(r"\bmale\b", name, re.I):
        return "m"
    return None


def degrees_between(a, b):
    if a.length < 1e-9 or b.length < 1e-9:
        return 0.0
    return math.degrees(a.angle(b))


def hand_now(arm, side):
    """One hand ("Right" or "Left") as posed now: how far off upright a
    glass held in its fist would point, and how far its fingers are
    curled, both in degrees — or None for a skeleton without fingers.

    A glass in the fist stands along the knuckles, from the little
    finger's to the first finger's, square to the line from the wrist to
    the middle finger's — as World/People.js holds one: upright when the
    thumb is up, level when the arm hangs at the side. A finger's curl
    is the turns of its three joints, from the back of the hand to its
    tip, summed; a hand's, the mean of its four fingers' (about 13 held
    flat, 45-60 hanging loose, 110 round a glass, 220 a fist)."""
    pose = arm.pose.bones

    def at(name):
        bone = pose.get(f"{PREFIX}{side}{name}")
        return None if bone is None else bone.head.copy()
    wrist, middle, first, little = at("Hand"), at("HandMiddle1"), at("HandIndex1"), at("HandPinky1")
    if any(p is None for p in (wrist, middle, first, little)):
        return None
    along = (middle - wrist).normalized()
    across = first - little
    across -= along * across.dot(along)
    curls = []
    for finger in FINGERS:
        joints = [wrist] + [at(f"Hand{finger}{i}") for i in (1, 2, 3)]
        if any(p is None for p in joints):
            continue
        tip = at(f"Hand{finger}4")
        joints.append(tip if tip is not None else pose[f"{PREFIX}{side}Hand{finger}3"].tail.copy())
        spans = [b - a for a, b in zip(joints, joints[1:])]
        curls.append(sum(degrees_between(a, b) for a, b in zip(spans, spans[1:])))
    if not curls:
        return None
    return degrees_between(across, Vector((0, 0, 1))), sum(curls) / len(curls)


def hands_through(arm, action):
    """Each hand over every frame of a clip: `tilt`, the furthest off
    upright a glass in its fist ever points, and `curl`, the least its
    fingers are ever curled, in degrees — {"right": {...}, "left": {...}},
    or None for a skeleton without fingers."""
    assign(arm, action)
    lo, hi = frames(action)
    seen = {"right": [], "left": []}
    for f in range(lo, hi + 1):
        bpy.context.scene.frame_set(f)
        for side in seen:
            now = hand_now(arm, side.title())
            if now is None:
                return None
            seen[side].append(now)
    return {side: {"tilt": round(max(t for t, _ in rows), 1), "curl": round(min(c for _, c in rows), 1)}
            for side, rows in seen.items()}


def holding_hand(name, free, hands, overrides=HANDS):
    """Which hand can hold a glass all through a clip: "right", "left" or
    False. By the overrides, else by what its hands measure (TILT_MOST,
    CURL_LEAST, HAND_NEAR) unless its name says neither is free; the
    right, for a skeleton without fingers to measure."""
    if name in overrides:
        return overrides[name]
    if not free:
        return False
    if hands is None:
        return "right"
    able = [side for side in ("right", "left")
            if hands[side]["tilt"] <= TILT_MOST and hands[side]["curl"] >= CURL_LEAST]
    if len(able) == 2:
        return "left" if hands["left"]["tilt"] < hands["right"]["tilt"] - HAND_NEAR else "right"
    return able[0] if able else False


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
    turn_about_root(arm, action, turn)
    print(f"  {action.name}: turned {math.degrees(turn):.0f}° to lie head to +Z")


def face_forward(arm, action):
    """Turn a sitting clip about the root so it faces +Z (glTF) as the
    others do — its knees straight ahead of its pelvis on its first
    frame — when it is more than FACING_OFF from it: a person's rotation
    is the way their seat faces, whatever the clip. (Mixamo's "Sitting
    Drinking" walks to its chair and turns round to sit, facing back the
    way it came; "Sitting Reclining Female" sits facing +X.)"""
    if classify(action.name)[0] != "sit":
        return
    assign(arm, action)
    bpy.context.scene.frame_set(frames(action)[0])
    bpy.context.view_layer.update()
    pose = arm.pose.bones
    knees = [pose.get(f"{PREFIX}{side}Leg") for side in ("Left", "Right")]
    if not all(knees):
        return
    ahead = (knees[0].head + knees[1].head) / 2 - pose[HIPS].head
    if ahead.xy.length < 0.15:      # not sitting after all: the knees are under the pelvis
        return
    turn = -math.pi / 2 - math.atan2(ahead.y, ahead.x)
    turn = math.atan2(math.sin(turn), math.cos(turn))
    if abs(turn) < FACING_OFF:
        return
    turn_about_root(arm, action, turn)
    print(f"  {action.name}: turned {math.degrees(turn):.0f}° to sit facing +Z")


def turn_about_root(arm, action, turn):
    """Turn a whole clip `turn` radians about the upright through the
    root: its Hips re-keyed, every frame it keeps."""
    lo, hi = frames(action)
    assign(arm, action)
    pose = arm.pose.bones
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


def import_clips(paths, people=True):
    """Every clip as an action of one armature — the first standing clip's
    skeleton, whose feet are surely on the floor in its first frame — and
    how high that skeleton's pelvis stands.

    `people` False, for the visitor's own clips (avatar_clips): none is a
    person's pose to be settled or turned — "Stand To Sit" is a sitting
    clip by its name, and trimmed to its settled part it was half a second
    of sitting — and none surely stands in its first frame (a stroke lies
    along the water), so a skeleton's size is taken at rest, T-posed on
    its feet."""
    paths = sorted(paths, key=lambda p: classify(os.path.basename(p))[0] != "stand")
    master, actions, size, chain = None, [], None, None

    def size_of(arm, action):
        if people:
            return clip_size(arm, action)
        rest = leg_chain(arm)
        return standing_hips(rest, ankles(arm)), rest
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
        if people:
            settle(arm, action)
            head_forward(arm, action)
            face_forward(arm, action)
        if master is None:
            master = arm
            master.name = "Armature"
            size, chain = size_of(master, action)
        elif not same_skeleton(master, arm):
            action = retarget(arm, action, master, name, size / size_of(arm, action)[0])
        if arm is not master:
            source = arm.animation_data.action
            arm.animation_data_clear()
            bpy.data.objects.remove(arm, do_unlink=True)
            # glTF's exporter takes every action that fits the skeleton
            if source is not action:
                bpy.data.actions.remove(source)
        actions.append(action)
    return master, actions, chain


def feet_down(arm):
    """Where the feet that are down are, as posed now: the middle of the
    ankles within FOOT_DOWN of the lower one's height, and that height."""
    feet = [arm.pose.bones[f"{PREFIX}{side}Foot"].head.copy() for side in ("Left", "Right")]
    low = min(p.z for p in feet)
    down = [p for p in feet if p.z <= low + FOOT_DOWN]
    return sum(down, Vector()) / len(down)


def reach(arm):
    """How far out a lying body's hands lie, as posed now: the further of
    its wrists from the line through its pelvis, across it, in metres. A
    lounger narrower than twice that leaves its hands on the air."""
    hips = arm.pose.bones[HIPS].head
    wrists = [arm.pose.bones.get(f"{PREFIX}{side}Hand") for side in ("Left", "Right")]
    return max((abs(w.head.x - hips.x) for w in wrists if w), default=0.0)


def legs_through(arm, action):
    """Each leg over every frame of a clip: where its ankle and its knee
    are, as (forward, up) from the pelvis's place on the clip's first
    frame — forward as the body faces, up from the root — in metres:
    [[(ankle, knee), (ankle, knee)], ...], the left leg's then the
    right's, a frame a row."""
    assign(arm, action)
    lo, hi = frames(action)
    pose = arm.pose.bones
    bpy.context.scene.frame_set(lo)
    bpy.context.view_layer.update()
    pelvis = pose[HIPS].head.copy()
    rows = []
    for f in range(lo, hi + 1):
        bpy.context.scene.frame_set(f)
        row = []
        for side in ("Left", "Right"):
            ankle, knee = pose[f"{PREFIX}{side}Foot"].head, pose[f"{PREFIX}{side}Leg"].head
            row.append(((pelvis.y - ankle.y, ankle.z), (pelvis.y - knee.y, knee.z)))
        rows.append(row)
    return rows


def legs_back(rows, seat):
    """How far back a sitting clip's legs ever come (legs_through's rows),
    forward of its seat's point — `tuck`, its rearmost ankle, and `knee`,
    its rearmost knee — and how far out, `far`, its foremost ankle, over
    every frame: of the legs whose feet are down, that is. An ankle at
    the height of the seat (`seat`, from the root) or over it is a leg
    crossed over the other, in no one's way. (None, None, None) with no
    leg down at all."""
    ankles, knees = [], []
    for row in rows:
        for (ankle, height), (knee, _) in row:
            if height < seat - 0.05:
                ankles.append(ankle)
                knees.append(knee)
    if not ankles:
        return None, None, None
    return round(min(ankles), 3), round(min(knees), 3), round(max(ankles), 3)


def measure_clips(master, actions, overrides=HANDS):
    """Each clip, at its first frame: where the pelvis, the head and the
    feet are from the root, how far out a lying clip's hands lie, and
    every bone's turn in its parent's frame (to pose bodies by); and over
    all its frames, what its hands do (hands_through) and so which can
    hold a glass (holding_hand), and where a sitting clip's legs go
    (legs_through)."""
    ad = master.animation_data
    for track in ad.nla_tracks:
        track.mute = True
    clips = []
    for action in actions:
        pose, free = classify(action.name)
        hands = hands_through(master, action)
        legs = legs_through(master, action) if pose == "sit" else None
        lo, hi = frames(action)
        bpy.context.scene.frame_set(lo)
        bpy.context.view_layer.update()
        hips = master.pose.bones[HIPS].head.copy()
        head = master.pose.bones.get(PREFIX + "Head")
        posed = local_pose(master)
        clip = {
            "name": action.name,
            "pose": pose,
            "hand": holding_hand(action.name, free, hands, overrides),
            "tilt": {side: hands[side]["tilt"] for side in hands} if hands else None,
            "curl": {side: hands[side]["curl"] for side in hands} if hands else None,
            "pelvis": gltf(hips),
            "head": gltf(head.head) if head else None,
            "duration": round((hi - lo) / FPS, 3),
            "_turns": {b: m.to_quaternion() for b, m in posed.items()},
            "_hips": posed[HIPS].to_translation(),
            "_pelvis": hips,
            "_ankle": ankles(master, posed=True),
            "_feet": feet_down(master),
            "_thickness": [],
            "_soles": [],
            "_legs": legs,
        }
        if pose == "lie":
            clip["reach"] = round(reach(master), 3)
        if clip_sex(action.name):
            clip["sex"] = clip_sex(action.name)
        if hi - lo <= 1:
            clip["still"] = True
        clips.append(clip)
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
    skin under it — and, sitting, how high its soles are above the root —
    in the clips' skeleton's size.

    Returns how each sitting clip sits on this body, by the clip's name:
    [seat, knee, tuck, far], in metres — the height of the seat that puts
    its soles on the floor, and how far forward of its seat's point its
    rearmost knee, its rearmost ankle and its foremost ankle come. No two
    bodies rest alike or are built alike, so the same turns of the same
    bones put their knees and feet a few centimetres apart: these are the
    body's own, on the clip's first frame, and what the rest of the clip
    adds on its own skeleton (legs_back)."""
    ratio = body_hips / clips_hips
    rest = {b.name: rest_local(b) for b in body.data.bones}
    sits = {}
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
        if clip["pose"] == "sit":
            soles = evaluated_points(meshes, FOOT_GROUPS)
            if soles:
                clip["_soles"].append((min(p.z for p in soles) - body.matrix_world.translation.z) / ratio)
            if under and soles:
                seat = min(p.z for p in under)
                legs = []
                for side in ("Left", "Right"):
                    ankle = body.matrix_world @ body.pose.bones[f"{PREFIX}{side}Foot"].head
                    knee = body.matrix_world @ body.pose.bones[f"{PREFIX}{side}Leg"].head
                    legs.append(((pelvis.y - ankle.y, ankle.z), (pelvis.y - knee.y, knee.z)))
                here = legs_back([legs], seat)
                # on the clip's own skeleton: its first frame, and all of them
                own_seat = clip["_pelvis"].z - (pelvis.z - seat) / ratio
                first, through = legs_back(clip["_legs"][:1], own_seat), legs_back(clip["_legs"], own_seat)
                if None not in here and None not in first and None not in through:
                    tuck, knee, far = (round(h + (t - f) * ratio, 3) for h, f, t in zip(here, first, through))
                    sits[clip["name"]] = [round(seat - min(p.z for p in soles), 3), knee, tuck, far]
    rest_pose(body)
    return sits


def finish_clips(clips, rest_ankle):
    """The clips as people.json lists them: a sitting or lying clip's seat
    under its pelvis, by the bodies' median, else a guess; a sitting
    clip's feet — where on the floor they rest, at its soles' height from
    the root (the bodies' median; else its ankles', less `rest_ankle`,
    the ankles' height standing), so that seat's height less feet's is
    the height of the seat the clip was made for — and how far forward
    of its seat its rearmost ankle (`tuck`), its rearmost knee (`knee`)
    and its foremost ankle (`far`) are, over all its frames (legs_back)."""
    out = []
    for clip in clips:
        seat = None
        if clip["pose"] != "stand":
            depth = statistics.median(clip["_thickness"]) if clip["_thickness"] else SEAT_GUESS
            p = clip["_pelvis"]
            seat = gltf(Vector((p.x, p.y, p.z - depth)))
        entry = {k: v for k, v in clip.items() if not k.startswith("_")} | {"seat": seat}
        if clip["pose"] == "sit":
            p = clip["_feet"]
            soles = statistics.median(clip["_soles"]) if clip["_soles"] else p.z - rest_ankle
            entry["feet"] = gltf(Vector((p.x, p.y, soles)))
            tuck, knee, far = legs_back(clip["_legs"], seat[1])
            if tuck is not None:
                entry["tuck"], entry["knee"], entry["far"] = tuck, knee, far
        out.append(entry)
        print(f"  {clip['name']}: {clip['pose']}, pelvis {entry['pelvis']}, seat {seat}"
              + (f", feet {entry['feet']} (a seat {seat[1] - entry['feet'][1]:.3f} m high)" if "feet" in entry else "")
              + (f", ankles {entry['tuck']}-{entry['far']} m and knees {entry['knee']} m or more forward of it" if "tuck" in entry else "")
              + (f", hands {clip['reach']} m out" if "reach" in clip else "")
              + (f", {clip['duration']} s" if not clip.get("still") else ", one still pose")
              + (f", for {'women' if clip['sex'] == 'f' else 'men'}" if clip.get("sex") else "")
              + (f" (seat from {len(clip['_thickness'])} bodies)" if clip["_thickness"] else ""))
    # Which hand holds a glass, and what each measures.
    print(f"\n  {'clip':<26} {'pose':<6} {'holds in':<9} {'tilt: right':>11} {'left':>6}   {'curl: right':>11} {'left':>6}")
    for clip in out:
        tilt, curl = clip.get("tilt") or {}, clip.get("curl") or {}
        said = " (set in HANDS)" if clip["name"] in HANDS or clip["name"] in STANDIN_HANDS else ""
        print(f"  {clip['name']:<26} {clip['pose']:<6} {clip['hand'] or 'neither':<9} "
              f"{tilt.get('right', '-'):>11} {tilt.get('left', '-'):>6}   {curl.get('right', '-'):>11} {curl.get('left', '-'):>6}{said}")
    print(f"  (a hand holds when tilt <= {TILT_MOST} and curl >= {CURL_LEAST}, degrees, over every frame)\n")
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


# ---------------------------------------------------------------------
# The visitor's own clips (--avatar-clips)
# ---------------------------------------------------------------------

# What each of the visitor's clips is played as in the app, by its name (the
# file's: "Treading Water") — the first pattern that matches — and so what
# is done with it here. frontend/Experience/World/Player/Swim.js's CLIPS and
# Player.js's sitting down and getting up play them by these names (and look
# them up the same way where this has not said).
#
#   loop    played over and over, where the app holds the body still or
#           swims it along itself (a stroke, treading water): cut to a loop
#           of whole cycles, from where its pose comes back round (find_loop)
#           and before anything that is no stroke — Mixamo's "Swimming To
#           Edge", which has no In Place, swims one stroke and then reaches
#           for the pool's edge and holds on — closed so that its end is its
#           start (close_loop), and with what its Hips travel across the
#           floor over it taken out;
#   climb   played once, its travel kept: the app follows its Hips out of the
#           water (Swim.js), its hands on the pool's edge. Begun where its
#           head is up by its hands (climb_start): Mixamo's "Pulling Up To A
#           Ledge" first hangs at arms' length, its head 0.4 m under its
#           hands — under the water, at a pool's edge 0.13 m over it;
#   move    played once, as it is, its travel kept: sitting down onto a seat
#           and getting up off one, lined up with the seat by the app.
AVATAR_AS = [
    (r"stand(ing)? to sit|sit(ting)? down", "sit-down", "move"),
    (r"sit(ting)? to stand|stand(ing)? up|get(ting)? up", "stand-up", "move"),
    (r"climb|ledge|pull(ing)? up|exit|out of", "climbing", "climb"),
    (r"breast|to edge", "breaststroke", "loop"),
    (r"tread", "treading", "loop"),
    (r"swim|crawl|freestyle", "swimming", "loop"),
]
# A clip whose Hips travel further than this across the floor was not
# downloaded In Place (or had no such choice).
IN_PLACE = 0.15            # m
# A loop is at least LOOP_LEAST long. How near a pose comes back to another
# is the root mean square, over the bones, of the angle between their turns
# (pose_gaps), its end's from its start's and the frame after its end's from
# the frame after its start's (so that it moves on as it did, too): the
# nearest such pair of frames — or, of those within LOOP_SLACK of it, the
# furthest apart (more whole cycles) — bound the loop. Mixamo's own loops
# come back exactly (0°); one closer than LOOP_CLEAN is as good as made so,
# and one further off is closed anyway (close_loop), but said so.
LOOP_LEAST = 0.8           # s
LOOP_SLACK = 1.0           # degrees
LOOP_CLEAN = 3.0           # degrees
# A stroke's hands come no higher over the rest of it than over its first
# LOOP_LEAST (a crawl's arm coming over the water, a breaststroke's reaching
# forward): one come up higher than that by more than REACH_UP — onto the
# pool's edge — ends the stroke, and the loop is cut before it.
REACH_UP = 0.15            # m
# Climbing out is begun where its head is no further than this under its
# hands' mean: at a pool's edge, about at the water.
CLIMB_HEAD = 0.15          # m
# Mixamo's strokes swim with the face in the water and the body along it,
# the back of the neck the highest of the figure: kept under the water
# with what it wears (Swim.js keeps a hood or a collar under), its face is
# too. So a stroke (STROKES) is swum heads-up (head_up): the whole figure
# turned STROKE_PITCH about its head, the legs down, and the neck and the
# head lifted STROKE_LIFT between them, the face out and looking ahead —
# measured on both avatars: the male's hoodie under, his mouth at the
# water and his eyes 5-9 cm over it.
STROKES = ("swimming", "breaststroke")
STROKE_PITCH = 35          # degrees
STROKE_LIFT = 45           # degrees


def avatar_clip_files(src):
    folder = os.path.join(src, "avatar")
    if not os.path.isdir(folder):
        return []
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(".fbx"))


def avatar_as(name):
    """What a clip is played as, and what is done with it here (AVATAR_AS): (None, None) for neither."""
    for pattern, played, handling in AVATAR_AS:
        if re.search(pattern, name, re.I):
            return played, handling
    return None, None


def pose_track(arm, action):
    """`action`, frame by frame from its first, as it poses `arm`: each
    bone's turn in its own rest frame, as a quaternion (w, x, y, z) —
    what its keys say, and what three.js applies — in an array [frames,
    bones, 4]; the Hips' location in theirs ([frames, 3]); and where the
    Hips, the head and the hands are in the armature's frame ([frames, 3]
    each, metres, Z up)."""
    lo, hi = frames(action)
    assign(arm, action)
    bones = list(arm.pose.bones)
    joints = {"hips": HIPS, "head": PREFIX + "Head", "left": PREFIX + "LeftHand", "right": PREFIX + "RightHand"}
    turns, keys, at = [], [], {key: [] for key in joints}
    for f in range(lo, hi + 1):
        bpy.context.scene.frame_set(f)
        turns.append([list(pb.matrix_basis.to_quaternion()) for pb in bones])
        keys.append(list(arm.pose.bones[HIPS].matrix_basis.to_translation()))
        for key, name in joints.items():
            pb = arm.pose.bones.get(name)
            at[key].append(list(pb.head) if pb else [math.nan] * 3)
    track = {"lo": lo, "names": [pb.name for pb in bones], "turns": np.array(turns), "keys": np.array(keys)}
    track.update({key: np.array(points) for key, points in at.items()})
    return track


def pose_gaps(turns, i):
    """How far each frame's pose is from frame i's: the root mean square,
    over the bones, of the angle between their turns, in degrees."""
    dots = np.abs(np.einsum("bk,fbk->fb", turns[i], turns)).clip(0, 1)
    return np.sqrt(np.mean((2 * np.degrees(np.arccos(dots))) ** 2, axis=1))


def find_loop(track):
    """The loop in a clip (`track`, pose_track's) — its first and last
    frames, counted from its first — of the stroke part of it (before a
    hand comes up REACH_UP higher than over its first LOOP_LEAST), at least
    LOOP_LEAST long: where its pose and the next frame's come back nearest
    to an earlier frame's and the frame after it (pose_gaps), or as near as
    LOOP_SLACK to that and further apart. With how far off it came back,
    in degrees. None for a clip shorter than a loop."""
    count = len(track["turns"])
    least = round(LOOP_LEAST * FPS)
    hands = np.maximum(track["left"][:, 2], track["right"][:, 2])
    high = np.nanmax(hands[:least + 1]) + REACH_UP
    over = np.nonzero(hands > high)[0]
    stroke = int(over[0]) if len(over) else count
    if stroke <= least:
        return None
    gaps = np.array([pose_gaps(track["turns"], i) for i in range(stroke)])
    pairs = []
    for s in range(stroke - least):
        for e in range(s + least, stroke):
            # (A clip's last frame, Mixamo's loop's, has no next: its start's own is its next's.)
            after = gaps[s + 1, e + 1] if e + 1 < stroke else gaps[s, e]
            pairs.append(((gaps[s, e] + after) / 2, s, e))
    nearest = min(pair[0] for pair in pairs)
    _, s, e = max((pair for pair in pairs if pair[0] <= nearest + LOOP_SLACK), key=lambda pair: (pair[2] - pair[1], -pair[0]))
    return s, e, float(gaps[s, e]), stroke


def close_loop(track, s, e):
    """Frames s to e of a clip (`track`, pose_track's, counted from its
    first) as a loop, as keys for write_keys: each bone's turn at e brought
    round to the one at s, the difference spread evenly over the loop (an
    eased turn added, from none at s to all of it at e), and the Hips'
    location likewise — their travel over the loop, across the floor and
    up or down, taken out. The loop then ends as it starts, and plays on
    round without a jump; a stroke stays where the app holds the body."""
    turns = track["turns"][s:e + 1]
    keys = track["keys"][s:e + 1]
    n = e - s
    samples = {}
    for b, name in enumerate(track["names"]):
        first = Quaternion(turns[0, b])
        last = Quaternion(turns[n, b])
        if first.dot(last) < 0:
            last.negate()
        off = first @ last.inverted()
        rows = []
        for k in range(n + 1):
            q = Quaternion().slerp(off, k / n) @ Quaternion(turns[k, b])
            place = Vector(keys[k] - (keys[n] - keys[0]) * (k / n)) if name == HIPS else None
            rows.append((place, q))
        samples[name] = rows
    return samples


def head_up(arm, samples, pivot):
    """A stroke's keys (close_loop's) as the visitor swims it, at the
    surface with the face out of the water: the whole figure turned
    STROKE_PITCH about the armature's X axis through `pivot` (its head at
    the loop's start, in the armature's frame) — the head end up, the legs
    down, as someone swims heads-up — and the neck and the head lifted
    STROKE_LIFT between them, each about its own X axis (across the body:
    Mixamo's bones are all rolled so), looking ahead over the water."""
    rest = arm.data.bones[HIPS].matrix_local
    turn = Matrix.Translation(pivot) @ Matrix.Rotation(-math.radians(STROKE_PITCH), 4, "X") @ Matrix.Translation(-pivot)
    rows = []
    for place, q in samples[HIPS]:
        basis = rest.inverted() @ turn @ rest @ (Matrix.Translation(place) @ q.to_matrix().to_4x4())
        loc, rot, _ = basis.decompose()
        rows.append((loc, rot))
    samples[HIPS] = rows
    lift = Quaternion((1, 0, 0), -math.radians(STROKE_LIFT) / 2)
    for name in (PREFIX + "Neck", PREFIX + "Head"):
        if name in samples:
            samples[name] = [(place, q @ lift) for place, q in samples[name]]


def rekey(arm, action, samples, first):
    """A new action of `arm` in `action`'s place, and by its name, keyed
    with `samples` (write_keys') from frame `first`; `action` is removed —
    glTF's exporter would take every action that fits the skeleton."""
    name = action.name
    action.name = f"{name} (as downloaded)"
    made = bpy.data.actions.new(name)
    for rows in samples.values():
        for k in range(1, len(rows)):
            if rows[k - 1][1].dot(rows[k][1]) < 0:
                rows[k] = (rows[k][0], -rows[k][1])
    write_keys(arm, made, samples, first)
    bpy.data.actions.remove(action)
    return made


def climb_start(track):
    """The first frame (counted from the clip's first) where its head is no
    further than CLIMB_HEAD under its hands."""
    hands = (track["left"][:, 2] + track["right"][:, 2]) / 2
    up = np.nonzero(track["head"][:, 2] >= hands - CLIMB_HEAD)[0]
    return int(up[0]) if len(up) else 0


def avatar_clips(src, out):
    """The visitor's own figure's clips beyond its five: Mixamo's swimming
    strokes, treading water, climbing out of the pool, sitting down and
    getting up, downloaded Without Skin into avatar/ (assets/people/avatar/
    by default) — on one skeleton as the people's clips are (import_clips:
    the first clip's, any other's re-keyed onto it), none settled or turned
    as a person's pose is, but each made fit for how the app plays it
    (AVATAR_AS): a loop cut and closed, held in place; a climb begun with
    its head out of the water; a move as it is. And measured: how high
    that skeleton's pelvis stands at rest — the app scales a clip's Hips by
    each avatar's own over it, as it does the people's (Utils/fitClip.js)
    — and for each clip what the app plays it as, its length, which frames
    of the download it keeps, its first frame's head and pelvis over the
    root and its last frame's pelvis (glTF's axes, metres), how far its
    Hips travel across the floor as downloaded, and: for a loop, how much
    of that travel it took out and at what pace the stroke swam it, and how
    far off its pose came back round; for a climb, where its hands hold on
    at its start. Writes avatar-clips.glb and avatar-clips.json, which
    scripts/optimize-people.mjs packs into public/models/people/."""
    paths = avatar_clip_files(src)
    if not paths:
        raise SystemExit(f"No avatar/*.fbx in {src}: download the visitor's clips from Mixamo first "
                         f"(FBX Binary, Without Skin, 30 fps, In Place where it is offered)")
    print("> the visitor's clips")
    fresh()
    master, actions, _ = import_clips(paths, people=False)
    rest_pose(master)
    hips = standing_hips(leg_chain(master), ankles(master))
    listed = []
    for index, action in enumerate(actions):
        name = action.name
        played, handling = avatar_as(name)
        track = pose_track(master, action)
        hips_at = track["hips"]
        travel = float(np.max(np.linalg.norm(hips_at[:, :2] - hips_at[0, :2], axis=1)))
        lo, hi = frames(action)
        entry = {"name": name, "as": played}
        said = []
        if handling == "loop":
            found = find_loop(track)
            if found:
                s, e, seam, stroke = found
                moved = float(np.linalg.norm(hips_at[e, :2] - hips_at[s, :2]))
                samples = close_loop(track, s, e)
                entry.update({"loop": True, "stripped": round(moved, 3), "pace": round(moved / ((e - s) / FPS), 3), "seam": round(seam, 1)})
                said.append(f"looped over frames {lo + s}-{lo + e}" + (f" (of the stroke's {lo}-{lo + stroke - 1})" if stroke < hi - lo + 1 else ""))
                if moved > 0.005:
                    said.append(f"{moved:.2f} m of travel taken out (swum at {entry['pace']:.2f} m/s)")
                if seam > LOOP_CLEAN:
                    said.append(f"its pose came back round only to {seam:.0f}°, the rest made up over the loop")
                if played in STROKES:
                    head_up(master, samples, Vector(track["head"][s].tolist()))
                    said.append(f"swum heads-up ({STROKE_PITCH}° up, the neck and head {STROKE_LIFT}°)")
                action = actions[index] = rekey(master, action, samples, track["lo"] + s)
            else:
                said.append("TOO SHORT to loop: played as it is")
        elif handling == "climb":
            first = climb_start(track)
            if first:
                action.use_frame_range = True
                action.frame_start, action.frame_end = lo + first, hi
                said.append(f"begun at frame {lo + first} of {lo}-{hi}, its head up by its hands")
            grip = Vector(((track["left"][first] + track["right"][first]) / 2).tolist())
            entry["grip"] = gltf(grip)
            said.append(f"its travel kept, its hands at {entry['grip']}")
        elif handling == "move":
            said.append("its travel kept")
        lo, hi = frames(action)
        assign(master, action)
        bpy.context.scene.frame_set(lo)
        bpy.context.view_layer.update()
        head = master.pose.bones.get(PREFIX + "Head")
        entry.update({
            "duration": round((hi - lo) / FPS, 3),
            "frames": [lo, hi],
            "head": gltf(head.head) if head else None,
            "pelvis": gltf(master.pose.bones[HIPS].head),
        })
        bpy.context.scene.frame_set(hi)
        bpy.context.view_layer.update()
        entry["last"] = gltf(master.pose.bones[HIPS].head)
        entry["travel"] = round(travel, 3)
        listed.append(dict(sorted(entry.items(), key=lambda item: list(AVATAR_KEYS).index(item[0]))))
        if not played:
            said.append("NOTHING plays it: name the file after what it is (AVATAR_AS)")
        elif travel > IN_PLACE and handling not in ("loop", "climb", "move"):
            said.append("NOT In Place: download it again with In Place ticked")
        print(f"  {name}: played as {played or '-'}, {entry['duration']} s, its hips travel {travel:.2f} m as downloaded; " + "; ".join(said))
    assign(master, None)
    for action in actions:
        stack(master, action)
    rest_pose(master)
    export(os.path.join(out, "avatar-clips.glb"), [master], animations=True)
    meta = {"file": "avatar-clips.glb", "hips": round(hips, 3), "fps": FPS, "list": listed}
    with open(os.path.join(out, "avatar-clips.json"), "w") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"  {len(actions)} clips on one skeleton of {len(master.data.bones)} bones, its pelvis {hips:.3f} m up standing")


# The order avatar-clips.json lists each clip's fields in.
AVATAR_KEYS = ("name", "as", "duration", "frames", "head", "pelvis", "last", "travel", "loop", "stripped", "pace", "seam", "grip")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="import_people.py")
    parser.add_argument("--src", default=os.path.join(REPO, "assets", "people"))
    parser.add_argument("--out", required=True)
    parser.add_argument("--standin", action="store_true")
    parser.add_argument("--avatar-clips", action="store_true")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    if args.avatar_clips:
        avatar_clips(args.src, args.out)
        return

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
    clips = measure_clips(master, actions, HANDS | STANDIN_HANDS if args.standin else HANDS)
    clips_hips = clips_size(master, chain, clips)
    rest_ankle = ankles(master)
    clips_legs = leg_bones(master)
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
        meta["sits"] = seat_on(arm, meta["hips"], meshes, clips, clips_hips)

    meta = {
        "standin": args.standin,
        "characters": characters,
        "clips": {"file": clips_name, "hips": round(clips_hips, 3), "legs": clips_legs, "fps": FPS,
                  "list": finish_clips(clips, rest_ankle)},
    }
    with open(os.path.join(args.out, meta_name), "w") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")
    print(f"  wrote {meta_name}: {len(characters)} characters, {len(clips)} clips")


if __name__ == "__main__":
    main()

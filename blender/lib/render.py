"""Camera, lighting and preview rendering.

EEVEE only: a hundred interior frames at Cycles quality is not a good use of
the time, and for judging whether a room is built correctly EEVEE is plenty.
"""

import math

import bpy
from mathutils import Vector

from . import geometry as g


def world(strength=1.0, horizon=(0.55, 0.65, 0.78), zenith=(0.30, 0.45, 0.70)):
    """A simple sky gradient, so glazing has something to look at."""
    w = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)

    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*horizon, 1.0)
    ramp.color_ramp.elements[1].color = (*zenith, 1.0)
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[1].position = 0.62
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    tex = nt.nodes.new("ShaderNodeTexCoord")

    nt.links.new(tex.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w


def sun(strength=3.0, angle=(math.radians(52), 0, math.radians(35)), col=None):
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = strength
    data.angle = math.radians(1.5)
    data.color = (1.0, 0.95, 0.88)
    obj = bpy.data.objects.new("sun", data)
    obj.rotation_euler = angle
    g.link(obj, col or bpy.context.scene.collection)
    return obj


def area(name, loc, size=1.0, strength=60.0, col=None, colour=(1.0, 0.92, 0.82),
         rot=(0, 0, 0), shape="SQUARE"):
    """A soft fill — used for the ceiling fittings so rooms aren't lit only
    through their windows."""
    data = bpy.data.lights.new(name, "AREA")
    data.energy = strength
    data.size = size
    data.shape = shape
    data.color = colour
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = rot
    g.link(obj, col or bpy.context.scene.collection)
    return obj


def camera(name, loc, look_at, lens=24.0, col=None):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.clip_start = 0.02
    data.clip_end = 500
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    g.link(obj, col or bpy.context.scene.collection)

    d = Vector(look_at) - Vector(loc)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return obj


def setup(samples=24, resolution=(1280, 800), exposure=0.0):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = resolution
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Base Contrast"
    sc.view_settings.exposure = exposure

    ee = sc.eevee
    for attr, value in [
        ("taa_render_samples", samples),
        ("use_raytracing", True),
        ("use_shadows", True),
        ("use_volumetric_lights", False),
    ]:
        if hasattr(ee, attr):
            setattr(ee, attr, value)
    return sc


def shot(path, cam, samples=24, resolution=(1280, 800)):
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = resolution
    if hasattr(sc.eevee, "taa_render_samples"):
        sc.eevee.taa_render_samples = samples
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return path

"""PBR materials for the house.

One material per finish, shared by every object using it. Everything is
Principled BSDF driven by plain numbers rather than image textures, apart
from the few surfaces that genuinely need a pattern — those get procedural
node graphs, so the .blend has no external texture dependencies of its own.
Imported Poly Haven assets bring their own textures.
"""

import bpy

#: Metres covered by one repeat of a baked pattern.
BAKE_TILE = 2.4

_cache = {}


def _bake_recipe(mat, gen, params, tile):
    """Record how to regenerate this material as a real tiling image.

    The export path cannot carry a node graph, so it rebuilds the pattern with
    lib/bake.py and box-maps it at `tile` metres per repeat.
    """
    import json as _json
    mat["bake_gen"] = gen
    mat["bake_params"] = _json.dumps(params)
    mat["bake_tile"] = float(tile)
    return mat


def _remember(mat, colour):
    """Record a flat stand-in for a procedurally-shaded material.

    glTF can carry a constant baseColorFactor or an image texture and nothing
    else, so a Base Color driven by a Noise/Brick/ColorRamp graph exports as
    plain white. Storing the colour the graph averages to lets the exporter
    substitute it and keep the palette.
    """
    mat["flat_color"] = tuple(colour)
    return mat


def _avg(a, b, w=0.5):
    return tuple(a[i] * (1 - w) + b[i] * w for i in range(3))


def _new(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nt, bsdf


def _set(bsdf, **kw):
    alias = {
        "base": "Base Color",
        "rough": "Roughness",
        "metal": "Metallic",
        "ior": "IOR",
        "trans": "Transmission Weight",
        "coat": "Coat Weight",
        "coat_rough": "Coat Roughness",
        "sheen": "Sheen Weight",
        "emit": "Emission Color",
        "emit_str": "Emission Strength",
        "alpha": "Alpha",
    }
    for k, v in kw.items():
        socket = bsdf.inputs.get(alias.get(k, k))
        if socket is not None:
            socket.default_value = v


def plain(name, color, rough=0.6, metal=0.0, **kw):
    """A flat Principled surface."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*color, 1.0), rough=rough, metal=metal, **kw)
    _cache[name] = _remember(mat, color)
    return mat


def noisy(name, color_a, color_b, scale=12.0, detail=6.0, rough=0.8, metal=0.0, bump=0.0):
    """A surface broken up by a noise mix — plaster, render, concrete, fabric."""
    if name in _cache:
        return _cache[name]
    mat, nt, bsdf = _new(name)

    coord = nt.nodes.new("ShaderNodeTexCoord")
    coord.location = (-800, 0)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.location = (-600, 0)
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.location = (-380, 0)
    ramp.color_ramp.elements[0].color = (*color_a, 1.0)
    ramp.color_ramp.elements[1].color = (*color_b, 1.0)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65

    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    _set(bsdf, rough=rough, metal=metal)

    if bump:
        bump_node = nt.nodes.new("ShaderNodeBump")
        bump_node.location = (0, -300)
        bump_node.inputs["Strength"].default_value = bump
        nt.links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
        nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    if scale >= 60:            # fine, dense fibre — carpet and turf
        _bake_recipe(mat, "carpet", dict(base=list(color_a), fleck=list(color_b)), 1.2)
    else:
        _bake_recipe(mat, "mottle", dict(
            colour_a=list(color_a), colour_b=list(color_b),
            cells=4, strength=1.0), BAKE_TILE)
    _cache[name] = _remember(mat, _avg(color_a, color_b))
    return mat


def planks(name, color_a, color_b, width=0.16, length=1.6, rough=0.35, bump=0.25):
    """Board flooring: brick-node rows scaled to real plank sizes."""
    if name in _cache:
        return _cache[name]
    mat, nt, bsdf = _new(name)

    coord = nt.nodes.new("ShaderNodeTexCoord")
    coord.location = (-1100, 0)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-900, 0)
    mapping.inputs["Scale"].default_value = (1.0 / length, 1.0 / width, 1.0)

    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.location = (-680, 0)
    brick.offset = 0.5           # running bond, so board ends stagger
    brick.offset_frequency = 2
    brick.squash = 1.0
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.001
    brick.inputs["Bias"].default_value = 0.0
    brick.inputs["Brick Width"].default_value = 1.0
    brick.inputs["Row Height"].default_value = 1.0
    brick.inputs["Color1"].default_value = (*color_a, 1.0)
    brick.inputs["Color2"].default_value = (*color_b, 1.0)
    brick.inputs["Mortar"].default_value = (0.05, 0.04, 0.03, 1.0)

    # Grain along the board length.
    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.location = (-680, -320)
    grain.inputs["Scale"].default_value = 40.0
    grain.inputs["Detail"].default_value = 8.0
    grain_map = nt.nodes.new("ShaderNodeMapping")
    grain_map.location = (-880, -320)
    grain_map.inputs["Scale"].default_value = (1.0, 26.0, 1.0)

    mix = nt.nodes.new("ShaderNodeMix")
    mix.location = (-380, 0)
    mix.data_type = "RGBA"
    mix.blend_type = "OVERLAY"
    mix.inputs[0].default_value = 0.18   # Factor (float)
    MIX_A, MIX_B, MIX_RESULT = 6, 7, 2   # the RGBA sockets

    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], grain_map.inputs["Vector"])
    nt.links.new(grain_map.outputs["Vector"], grain.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], mix.inputs[MIX_A])
    nt.links.new(grain.outputs["Color"], mix.inputs[MIX_B])
    nt.links.new(mix.outputs[MIX_RESULT], bsdf.inputs["Base Color"])
    _set(bsdf, rough=rough)

    bump_node = nt.nodes.new("ShaderNodeBump")
    bump_node.location = (0, -300)
    bump_node.inputs["Strength"].default_value = bump
    nt.links.new(brick.outputs["Fac"], bump_node.inputs["Height"])
    nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    # Boards read slightly darker than the mean once the gaps are counted.
    _bake_recipe(mat, "planks", dict(
        base=list(color_a), grain=list(color_b),
        gap=list(_avg(color_b, (0.0, 0.0, 0.0), 0.45)),
        rows=max(2, int(round(BAKE_TILE / width))), stagger=0.37,
    ), BAKE_TILE)
    _cache[name] = _remember(mat, _avg(_avg(color_a, color_b), (0.0, 0.0, 0.0), 0.12))
    return mat


def tiles(name, color, grout, size=0.3, rough=0.15, bump=0.4):
    """Square tiling with a grout line."""
    if name in _cache:
        return _cache[name]
    mat, nt, bsdf = _new(name)

    coord = nt.nodes.new("ShaderNodeTexCoord")
    coord.location = (-900, 0)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-700, 0)
    mapping.inputs["Scale"].default_value = (1.0 / size, 1.0 / size, 1.0)

    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.location = (-480, 0)
    brick.offset = 0.0           # a straight grid, not running bond
    brick.squash = 1.0
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.012
    brick.inputs["Mortar Smooth"].default_value = 0.1
    brick.inputs["Bias"].default_value = 0.0
    brick.inputs["Brick Width"].default_value = 1.0
    brick.inputs["Row Height"].default_value = 1.0
    brick.inputs["Color1"].default_value = (*color, 1.0)
    brick.inputs["Color2"].default_value = (*color, 1.0)
    brick.inputs["Mortar"].default_value = (*grout, 1.0)

    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    _set(bsdf, rough=rough)

    bump_node = nt.nodes.new("ShaderNodeBump")
    bump_node.location = (0, -300)
    bump_node.inputs["Strength"].default_value = bump
    bump_node.inputs["Distance"].default_value = 0.004
    nt.links.new(brick.outputs["Fac"], bump_node.inputs["Height"])
    nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    # Grout occupies a small but visible share of a tiled surface.
    _bake_recipe(mat, "tiles", dict(
        base=list(color), grout=list(grout),
        cols=max(1, int(round(BAKE_TILE / size))),
        rows=max(1, int(round(BAKE_TILE / size))), variation=0.06,
    ), BAKE_TILE)
    _cache[name] = _remember(mat, _avg(color, grout, 0.18))
    return mat


def glass(name="glass", tint=(0.94, 0.96, 0.97)):
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*tint, 1.0), rough=0.02, metal=0.0, ior=1.45, trans=1.0)
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False
    _cache[name] = _remember(mat, tint)
    return mat


def emissive(name, color, strength):
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*color, 1.0), emit=(*color, 1.0), emit_str=strength, rough=0.5)
    _cache[name] = _remember(mat, color)
    return mat


# ---------------------------------------------------------------------
# The palette the house is specified in
# ---------------------------------------------------------------------

def _roof(mat):
    return _bake_recipe(mat, "rooftiles", dict(
        base=[0.225, 0.082, 0.048], shade=[0.140, 0.048, 0.026], rows=6), 1.8)


def _grass(mat):
    return _bake_recipe(mat, "grass", dict(
        base=[0.16, 0.26, 0.10], blade=[0.24, 0.38, 0.15], dark=[0.10, 0.18, 0.06]), 3.0)


def library():
    """Every named finish, built once and returned as a dict."""
    return {
        # Walls and ceilings
        "wall_white": noisy("wall_white", (0.90, 0.89, 0.87), (0.86, 0.85, 0.83), scale=6, rough=0.92, bump=0.06),
        "wall_warm": noisy("wall_warm", (0.88, 0.85, 0.79), (0.84, 0.81, 0.75), scale=6, rough=0.92, bump=0.06),
        "wall_sage": noisy("wall_sage", (0.395, 0.445, 0.375), (0.360, 0.410, 0.340), scale=6, rough=0.92, bump=0.06),
        "wall_clay": noisy("wall_clay", (0.485, 0.345, 0.275), (0.445, 0.310, 0.245), scale=6, rough=0.92, bump=0.06),
        "wall_charcoal": noisy("wall_charcoal", (0.075, 0.080, 0.088), (0.060, 0.065, 0.072), scale=6, rough=0.9, bump=0.06),
        "ceiling": plain("ceiling", (0.94, 0.94, 0.93), rough=0.95),
        "render_ext": noisy("render_ext", (0.82, 0.80, 0.76), (0.76, 0.74, 0.70), scale=14, rough=0.95, bump=0.35),

        # Floors
        "oak": planks("oak", (0.205, 0.112, 0.048), (0.155, 0.082, 0.034), width=0.17, length=1.9),
        "walnut": planks("walnut", (0.085, 0.046, 0.026), (0.062, 0.032, 0.017), width=0.16, length=1.7),
        "tile_stone": tiles("tile_stone", (0.315, 0.305, 0.290), (0.205, 0.198, 0.185), size=0.6, rough=0.25),
        "tile_white": tiles("tile_white", (0.86, 0.86, 0.84), (0.68, 0.68, 0.66), size=0.3, rough=0.12),
        "tile_slate": tiles("tile_slate", (0.062, 0.068, 0.074), (0.036, 0.040, 0.045), size=0.45, rough=0.3),
        "carpet_grey": noisy("carpet_grey", (0.165, 0.165, 0.160), (0.135, 0.135, 0.130), scale=90, detail=10, rough=1.0, bump=0.5),
        "carpet_beige": noisy("carpet_beige", (0.315, 0.275, 0.215), (0.275, 0.238, 0.185), scale=90, detail=10, rough=1.0, bump=0.5),
        "concrete": noisy("concrete", (0.44, 0.44, 0.43), (0.38, 0.38, 0.37), scale=8, rough=0.55, bump=0.15),

        # Joinery and trim
        "trim_charcoal": plain("trim_charcoal", (0.16, 0.17, 0.18), rough=0.45),
        "trim_white": plain("trim_white", (0.93, 0.93, 0.92), rough=0.35, coat=0.3, coat_rough=0.2),
        "door_leaf": plain("door_leaf", (0.90, 0.90, 0.89), rough=0.4, coat=0.25),
        "cab_sage": plain("cab_sage", (0.215, 0.255, 0.205), rough=0.4, coat=0.35, coat_rough=0.25),
        "cab_navy": plain("cab_navy", (0.052, 0.072, 0.115), rough=0.4, coat=0.35, coat_rough=0.25),
        "cab_white": plain("cab_white", (0.90, 0.90, 0.89), rough=0.38, coat=0.35, coat_rough=0.22),
        "cab_oak": plain("cab_oak", (0.245, 0.155, 0.075), rough=0.5),
        "worktop": noisy("worktop", (0.90, 0.89, 0.87), (0.78, 0.77, 0.75), scale=3.5, detail=10, rough=0.12, bump=0.02),
        "worktop_dark": noisy("worktop_dark", (0.20, 0.20, 0.21), (0.14, 0.14, 0.15), scale=3.5, detail=10, rough=0.14),

        # Metals
        "chrome": plain("chrome", (0.90, 0.91, 0.92), rough=0.08, metal=1.0),
        "brass": plain("brass", (0.72, 0.55, 0.26), rough=0.22, metal=1.0),
        "black_metal": plain("black_metal", (0.05, 0.05, 0.06), rough=0.32, metal=1.0),
        "steel": plain("steel", (0.56, 0.57, 0.58), rough=0.30, metal=1.0),

        # Soft furnishing and misc
        "fabric_grey": noisy("fabric_grey", (0.195, 0.195, 0.188), (0.160, 0.160, 0.155), scale=140, detail=8, rough=0.95, bump=0.3),
        "fabric_cream": noisy("fabric_cream", (0.545, 0.500, 0.425), (0.485, 0.445, 0.375), scale=140, detail=8, rough=0.95, bump=0.3),
        "linen_white": noisy("linen_white", (0.92, 0.91, 0.88), (0.86, 0.85, 0.82), scale=160, detail=8, rough=0.9, bump=0.25),
        "porcelain": plain("porcelain", (0.95, 0.95, 0.94), rough=0.09, coat=0.6, coat_rough=0.05),
        "glass": glass(),
        "mirror": plain("mirror", (0.96, 0.96, 0.96), rough=0.02, metal=1.0),
        "roof_tile": _roof(noisy("roof_tile", (0.225, 0.082, 0.048), (0.160, 0.055, 0.030), scale=30, rough=0.8, bump=0.5)),
        "grass": _grass(noisy("grass", (0.20, 0.32, 0.12), (0.14, 0.24, 0.08), scale=60, detail=10, rough=1.0, bump=0.4)),
        "paving": tiles("paving", (0.58, 0.57, 0.55), (0.46, 0.45, 0.43), size=0.9, rough=0.6, bump=0.3),
        "tarmac": noisy("tarmac", (0.10, 0.10, 0.11), (0.07, 0.07, 0.08), scale=90, detail=10, rough=0.9, bump=0.25),
    }

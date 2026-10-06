"""PBR materials for the house.

One material per finish, shared by every object using it. Everything is
Principled BSDF driven by plain numbers rather than image textures, apart
from the few surfaces that genuinely need a pattern — those get procedural
node graphs, so the .blend has no external texture dependencies of its own.
Nothing in the house is imported: every object is built by these scripts.
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


def srgb(hexstr):
    """A '#rrggbb' as it should look: what veneer, speckled and noisy take."""
    h = hexstr.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def linear(hexstr):
    """A '#rrggbb' as plain() takes it: linear, so it reaches the app looking so."""
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb(hexstr))


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


def speckled(name, base, chips, rough=0.3, tile=0.9, density=0.035, coat=0.0):
    """Terrazzo: a flat colour in Blender, baked on export as chips of stone."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*base, 1.0), rough=rough, coat=coat, coat_rough=0.1)
    _bake_recipe(mat, "terrazzo", dict(base=list(base), chips=[list(c) for c in chips], density=density), tile)
    _cache[name] = _remember(mat, base)
    return mat


def veneer(name, color_a, color_b, rough=0.5, tile=1.2):
    """Wood veneer: flat in Blender, baked on export as straight grain."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*_avg(color_a, color_b), 1.0), rough=rough)
    _bake_recipe(mat, "grain", dict(base=list(color_a), dark=list(color_b)), tile)
    _cache[name] = _remember(mat, _avg(color_a, color_b))
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


def tiles(name, color, grout, size=0.3, rough=0.15, bump=0.4, height=None, span=BAKE_TILE,
          grout_px=None):
    """Tiling with a grout line: square, or `size` wide by `height` tall.

    `span` is the metres one baked image covers. The image is always 512 px,
    so a smaller span gives a finer grout line; `grout_px` is that line's
    width on each side of a tile, in pixels.
    """
    if name in _cache:
        return _cache[name]
    height = height or size
    mat, nt, bsdf = _new(name)

    coord = nt.nodes.new("ShaderNodeTexCoord")
    coord.location = (-900, 0)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-700, 0)
    mapping.inputs["Scale"].default_value = (1.0 / size, 1.0 / height, 1.0)

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
    params = dict(base=list(color), grout=list(grout),
                  cols=max(1, int(round(span / size))),
                  rows=max(1, int(round(span / height))), variation=0.06)
    if grout_px is not None:
        params["grout_px"] = grout_px
    _bake_recipe(mat, "tiles", params, span)
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


def sheer(name, color, alpha=0.8, rough=0.9, weave=None, tile=0.5):
    """A thin fabric that lets light through: blended, seen from both sides.
    `weave`, a darker thread colour: baked on export as plain-woven linen
    with slubs across it, `color` and `weave` then given as they should
    look (as veneer's are), not linear."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*color, 1.0), rough=rough, alpha=alpha)
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False
    if weave is not None:
        _bake_recipe(mat, "linen", dict(base=list(color), dark=list(weave)), tile)
    _cache[name] = _remember(mat, color)
    return mat


def emissive(name, color, strength):
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*color, 1.0), emit=(*color, 1.0), emit_str=strength, rough=0.5)
    _cache[name] = _remember(mat, color)
    return mat


def twill(name, color_a, color_b, rough=0.95, tile=0.3):
    """A twill-woven cloth (a wrapped door, a wall panel): flat in Blender,
    baked on export as fine diagonal ribs with slubs, a 5 mm repeat at the
    default tile."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*_avg(color_a, color_b), 1.0), rough=rough)
    _bake_recipe(mat, "twill", dict(base=list(color_a), dark=list(color_b)), tile)
    _cache[name] = _remember(mat, _avg(color_a, color_b))
    return mat


def heather(name, base, flecks, rough=1.0, tile=0.3, density=0.5, width=1, mottle=0.06):
    """Heathered wool or felt: flat in Blender, baked on export as a mottled
    ground strewn with short fibres of lighter and darker wool, 1-3 mm at
    the default tile."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    _set(bsdf, base=(*base, 1.0), rough=rough)
    _bake_recipe(mat, "heather", dict(base=list(base), flecks=[list(c) for c in flecks], density=density, width=width,
                                      mottle=mottle), tile)
    _cache[name] = _remember(mat, base)
    return mat


def nubbly(name, base, dark, rough=0.95, tile=0.4, cells=96, contrast=1.0):
    """Bouclé or a fine basket weave: flat in Blender, baked on export as
    soft nubs of yarn a few millimetres across with darker gaps and a faint
    warped basket under them — cloth, not a grid of tiles. Its mean is
    mostly `base`, `dark` showing in the gaps."""
    if name in _cache:
        return _cache[name]
    mat, _, bsdf = _new(name)
    flat = _avg(base, dark, 0.18)
    _set(bsdf, base=(*flat, 1.0), rough=rough)
    _bake_recipe(mat, "nubbly", dict(base=list(base), dark=list(dark), cells=cells, contrast=contrast), tile)
    _cache[name] = _remember(mat, flat)
    return mat


def _two_sided(mat):
    """Seen from both sides: a single sheet of cloth."""
    mat.use_backface_culling = False
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
        # Showers: 30 x 60 cm glazed wall tiles with a 5 mm grout line, a
        # slate-effect stone tray, and clear seals on the glass.
        "tile_shower": tiles("tile_shower", (0.60, 0.59, 0.56), (0.76, 0.75, 0.72), size=0.3,
                             height=0.6, span=1.2, grout_px=1, rough=0.18, bump=0.2),
        "stone_slate": plain("stone_slate", (0.070, 0.073, 0.077), rough=0.6),
        "seal": plain("seal", (0.62, 0.65, 0.66), rough=0.35),
        "bottle_white": plain("bottle_white", (0.86, 0.85, 0.82), rough=0.3),
        "bottle_sage": plain("bottle_sage", (0.26, 0.34, 0.28), rough=0.25),
        # Loose furniture and decor
        "fabric_sage": plain("fabric_sage", (0.20, 0.25, 0.19), rough=0.95),
        "fabric_rust": plain("fabric_rust", (0.36, 0.14, 0.07), rough=0.95),
        "leather_tan": plain("leather_tan", (0.30, 0.15, 0.06), rough=0.55),
        "wood_walnut": plain("wood_walnut", (0.085, 0.046, 0.026), rough=0.5),
        "foliage": plain("foliage", (0.06, 0.16, 0.05), rough=0.8),
        "terracotta": plain("terracotta", (0.42, 0.17, 0.08), rough=0.85),
        "soil": plain("soil", (0.05, 0.035, 0.025), rough=1.0),
        "ceramic_blue": plain("ceramic_blue", (0.10, 0.20, 0.36), rough=0.2, coat=0.5),
        "screen": plain("screen", (0.01, 0.01, 0.012), rough=0.15),
        "art_a": plain("art_a", (0.55, 0.32, 0.18), rough=0.8),
        "art_b": plain("art_b", (0.16, 0.30, 0.42), rough=0.8),
        "book_red": plain("book_red", (0.30, 0.05, 0.04), rough=0.7),
        "book_green": plain("book_green", (0.06, 0.18, 0.10), rough=0.7),
        "book_blue": plain("book_blue", (0.05, 0.08, 0.22), rough=0.7),
        "shade": plain("shade", (0.85, 0.80, 0.70), rough=0.9),
        # Ladonia Residence (lib/ladonia.py): its renders' oak, lacquers,
        # terrazzo, linens and garden colours. A baked pattern's colours
        # (veneer, speckled, noisy) reach the app as sRGB, a plain one's as
        # linear: so the former are given as they should look.
        # Light oak with a vertical grain, #d9b589 in the renders.
        "oak_veneer": veneer("oak_veneer", (0.88, 0.75, 0.57), (0.79, 0.64, 0.46)),
        "wood_stump": veneer("wood_stump", srgb("#ad6834"), srgb("#93522a"), tile=0.6),
        "teak": veneer("teak", (0.58, 0.41, 0.27), (0.46, 0.31, 0.19), rough=0.6, tile=0.8),
        "lacquer_ochre": plain("lacquer_ochre", linear("#c9a238"), rough=0.45),
        "lacquer_sage": plain("lacquer_sage", linear("#a8ac96"), rough=0.6),
        "lacquer_cream": plain("lacquer_cream", linear("#f1ebe1"), rough=0.5),
        # Pale cream terrazzo, fine sparse grey and ochre chips.
        "terrazzo_top": speckled("terrazzo_top", srgb("#ede2cf"),
                                 [srgb("#a8a49c"), srgb("#c49a6a"), srgb("#f7f1e6"), srgb("#8a847c"), srgb("#d0b48c")],
                                 rough=0.3, tile=0.35, density=0.03),
        # Pale beige quartzite, #d8cdb8.
        "stone_top": speckled("stone_top", srgb("#d8cdb8"),
                              [srgb("#c9bca4"), srgb("#e6ddcc"), srgb("#b7aa92"), srgb("#cfc3ad")], rough=0.3, tile=0.8,
                              density=0.12),
        # The kitchens' small parts: a recessed champagne plinth, the
        # handleless channels and joints (dark, so a 3 mm gap reads), the
        # taps' gunmetal and brushed brass, black glass hobs and ovens.
        "plinth_champagne": plain("plinth_champagne", linear("#b9a380"), rough=0.35, metal=0.85),
        "kitchen_gap": plain("kitchen_gap", (0.035, 0.031, 0.027), rough=0.7),
        # A hob's printed zones and controls: grey on its black glass, named
        # so the app layers them in front of the glass (FurnitureLibrary /hob/).
        "hob_ring": plain("hob_ring", linear("#5a5a5a"), rough=0.5),
        "gunmetal": plain("gunmetal", (0.045, 0.038, 0.032), rough=0.32, metal=1.0),
        "brass_brushed": plain("brass_brushed", linear("#b8a07a"), rough=0.3, metal=1.0),
        "bronze_dark": plain("bronze_dark", (0.075, 0.052, 0.034), rough=0.38, metal=1.0),
        "glass_black": plain("glass_black", (0.008, 0.008, 0.009), rough=0.06, coat=1.0, coat_rough=0.03),
        "sink_dark": plain("sink_dark", (0.03, 0.03, 0.032), rough=0.4, metal=0.4),
        "oven_white": plain("oven_white", (0.86, 0.86, 0.84), rough=0.3),
        # An induction hob's black glass, its reflections soft (render 20);
        # the sage kitchens' brushed champagne mixer; the shadow behind the
        # sage panel's recessed grooves (named so the app layers it behind).
        "hob_glass": plain("hob_glass", (0.01, 0.01, 0.011), rough=0.25, coat=0.5, coat_rough=0.2),
        "champagne": plain("champagne", linear("#c9bfa8"), rough=0.35, metal=1.0),
        "lacquer_sage_shadow": plain("lacquer_sage_shadow", linear("#737862"), rough=0.7),
        # Sofas: ivory and cream boucle (a nubbly fleck at real size),
        # oatmeal slip-cover linen, terracotta linen, bottle-green velvet.
        "boucle_ivory": speckled("boucle_ivory", srgb("#e3d5c0"),
                                 [srgb("#f1e8da"), srgb("#cbbba3"), srgb("#d8c8b0"), srgb("#ece2d2")], rough=0.95,
                                 tile=0.35, density=0.55),
        "boucle_cream": speckled("boucle_cream", srgb("#e8dcc8"), [srgb("#f6efe3"), srgb("#cdbfa8")], rough=0.95, tile=0.3,
                                 density=0.5),
        "boucle_oat": speckled("boucle_oat", srgb("#dacfc0"), [srgb("#ece4d8"), srgb("#bfb2a0"), srgb("#cfc3b2")], rough=0.95,
                               tile=0.3, density=0.5),
        "linen_ecru": noisy("linen_ecru", srgb("#ddd2c0"), srgb("#c8baa3"), scale=140, detail=8, rough=0.95, bump=0.3),
        "linen_terracotta": noisy("linen_terracotta", srgb("#b8602e"), srgb("#a6552a"), scale=140, detail=8, rough=0.95),
        "velvet_bottle": plain("velvet_bottle", linear("#2c3427"), rough=0.8),
        # Dining: A's pale oak table, B's Cover-style chairs and microcement table.
        "oak_pale": veneer("oak_pale", srgb("#e8c78c"), srgb("#d6b175")),
        "oak_chair": veneer("oak_chair", (0.80, 0.62, 0.44), (0.72, 0.54, 0.37), tile=0.6),
        "microcement": noisy("microcement", srgb("#ece4d6"), srgb("#e2d8c7"), scale=8, rough=0.6, bump=0.05),
        # Lighting: matte black track and shades, opal glass, lit LED diffusers.
        "black_metal_matte": plain("black_metal_matte", (0.025, 0.025, 0.027), rough=0.55, metal=0.5),
        "opal": emissive("opal", (0.95, 0.92, 0.86), 0.6),
        "led_white": emissive("led_white", (1.0, 0.95, 0.86), 2.5),
        # The wall shelf over B's cabinet (render 19): pale yellow oak, near maple.
        "oak_maple": veneer("oak_maple", srgb("#e6cd9a"), srgb("#d5b882"), tile=0.8),
        # The teak drum's top (render 19): end grain, its rings laid in as two tones.
        "wood_endgrain": plain("wood_endgrain", linear("#b07040"), rough=0.5),
        "wood_endgrain_ring": plain("wood_endgrain_ring", linear("#94562c"), rough=0.55),
        # TV walls: A's sand lacquer panel, B's rift-cut oak block, glass screens.
        "lacquer_sand": plain("lacquer_sand", linear("#d8c3a2"), rough=0.5),
        "oak_rift": veneer("oak_rift", srgb("#b88a5e"), srgb("#9c7048"), tile=0.9),
        "wood_dark": veneer("wood_dark", srgb("#4a3020"), srgb("#3a2518"), tile=0.6),
        # Matte black screens, their reflections soft (renders 17, 20).
        "tv_glass": plain("tv_glass", (0.01, 0.01, 0.01), rough=0.3, coat=0.3, coat_rough=0.15),
        # Bedroom (render 21).
        "lacquer_ivory": plain("lacquer_ivory", linear("#efe9df"), rough=0.5),
        "linen_duvet": noisy("linen_duvet", srgb("#e2cfb0"), srgb("#d8c4a3"), scale=160, detail=8, rough=0.95, bump=0.25),
        # The runner: a deep olive green (render 21), not khaki; its sage reverse.
        "linen_olive": noisy("linen_olive", srgb("#545b3d"), srgb("#4a5136"), scale=160, detail=8, rough=0.9),
        "linen_sage_lining": noisy("linen_sage_lining", srgb("#787d5d"), srgb("#6e7354"), scale=160, detail=8, rough=0.85),
        "velvet_olive": plain("velvet_olive", linear("#2f3527"), rough=0.8),
        "linen_olive_dark": noisy("linen_olive_dark", srgb("#3e4532"), srgb("#464d39"), scale=160, detail=8, rough=0.85),
        "linen_sand": noisy("linen_sand", srgb("#d2b896"), srgb("#c7ab88"), scale=160, detail=8, rough=0.95),
        "charcoal": plain("charcoal", linear("#4a4a4a"), rough=0.8),
        # Heathered grey-green boiled-wool felt (render 21): a mid ground
        # strewn with 1-3 mm fibres of lighter and darker wool; B's and C's a
        # touch greener.
        "felt_fleck": heather("felt_fleck", srgb("#a8aa94"), [srgb("#cdcebb"), srgb("#7c7f6e"), srgb("#959b84"), srgb("#b8baa5")],
                              tile=0.3, density=0.6, width=2, mottle=0.08),
        "felt_sage": heather("felt_sage", srgb("#a1a98e"), [srgb("#c6ccb5"), srgb("#76806b"), srgb("#8e9a80"), srgb("#b1b89f")],
                             tile=0.3, density=0.6, width=2, mottle=0.08),
        "walnut_veneer": veneer("walnut_veneer", srgb("#6a3c20"), srgb("#542c15"), tile=0.5),
        "walnut_top": veneer("walnut_top", srgb("#86552e"), srgb("#734623"), tile=0.5),
        # Fine loop pile, warm taupe-camel, a shade darker than the oak floor.
        "rug_taupe": noisy("rug_taupe", srgb("#917255"), srgb("#76593f"), scale=90, detail=10, rough=1.0, bump=0.5),
        # The white pillows' three fine stitch lines; the bedside light's opal
        # tube, ivory by day; the bedrooms' heavy caramel linen, opaque, its
        # slub running down it.
        "thread_olive": plain("thread_olive", linear("#4d4f3c"), rough=0.8),
        "led_opal": emissive("led_opal", linear("#f2e9d8"), 0.5),
        "curtain_caramel": _two_sided(veneer("curtain_caramel", srgb("#d3a77b"), srgb("#c29469"), rough=0.95, tile=0.5)),
        # The bed's platform: a creamy ivory lacquer, a shade warmer than
        # the duvet, under the white mattress (render 21's head corner).
        "bed_base": plain("bed_base", linear("#d8c6a8"), rough=0.55),
        # Living-room accessories.
        "art_yellow": plain("art_yellow", linear("#e2a83e"), rough=0.8),
        "art_ground": noisy("art_ground", srgb("#e9b44c"), srgb("#d99a3c"), scale=6, rough=0.8),
        "art_orange": plain("art_orange", linear("#e88a3a"), rough=0.8),
        "leaf_dark": plain("leaf_dark", linear("#2e4a25"), rough=0.6),
        "leaf_mid": plain("leaf_mid", linear("#4a6b30"), rough=0.6),
        "leaf_alocasia": plain("leaf_alocasia", linear("#2f5a26"), rough=0.4),
        "leaf_stem": plain("leaf_stem", linear("#6f8a4a"), rough=0.6),
        "book_ink": plain("book_ink", linear("#23262b"), rough=0.7),
        "stone_greygreen": noisy("stone_greygreen", srgb("#7f877b"), srgb("#6c7468"), scale=20, rough=0.6),
        # The table lamp's base (render 19): grey granite, dark and pale crystals in a mid-grey ground.
        "granite_grey": speckled("granite_grey", srgb("#716d67"),
                                 [srgb("#46433f"), srgb("#57544f"), srgb("#8c877f"), srgb("#a39e94"), srgb("#7d7973")], rough=0.45,
                                 tile=0.2, density=0.35),
        "linen_shade": noisy("linen_shade", srgb("#ece3d2"), srgb("#e2d7c3"), scale=160, detail=8, rough=0.95),
        "plaster": plain("plaster", linear("#e9e3d8"), rough=0.85),
        "glass_grey": plain("glass_grey", (0.18, 0.18, 0.19), rough=0.1, coat=0.8, coat_rough=0.05),
        # A's sofa: oatmeal bouclé, soft nubs over a faint basket (render 17), its cream cushions.
        "weave_oat": nubbly("weave_oat", srgb("#dccab0"), srgb("#bfa98a"), tile=0.42),
        "weave_cream": nubbly("weave_cream", srgb("#ece2d0"), srgb("#d3c6b0"), tile=0.36),
        "weave_beige": tiles("weave_beige", srgb("#dbc8ac"), srgb("#c6b092"), size=0.005, span=0.3, grout_px=1, rough=0.9,
                             bump=0.0),
        # Warm mid oak for the long sideboards (render 18).
        "oak_mid": veneer("oak_mid", srgb("#b17d4e"), srgb("#9a6a40"), tile=1.0),
        "pillow_white": noisy("pillow_white", srgb("#efe8dc"), srgb("#e8dfd0"), scale=160, detail=8, rough=0.9),
        "led_warm": emissive("led_warm", (1.0, 0.86, 0.66), 2.0),
        "cushion_offwhite": plain("cushion_offwhite", linear("#e3d9c8"), rough=0.8),
        "cushion_mustard": plain("cushion_mustard", linear("#b8954f"), rough=0.8),
        "white_matte": plain("white_matte", linear("#e6e1d6"), rough=0.5),
        "glass_bottle": plain("glass_bottle", (0.012, 0.03, 0.015), rough=0.08, coat=1.0, coat_rough=0.02),
        "planter_bronze": plain("planter_bronze", linear("#2b261d"), rough=0.5, metal=0.3),
        "soil_rim": plain("soil_rim", linear("#6f5646"), rough=1.0),
        "bark_pale": plain("bark_pale", linear("#a6a797"), rough=0.8),
        "leaf_lilac": plain("leaf_lilac", linear("#4d6447"), rough=0.7),
        "lilac_flower": noisy("lilac_flower", srgb("#9a73a3"), srgb("#b493bb"), scale=40, rough=0.85),
        "lilac_deep": noisy("lilac_deep", srgb("#86608f"), srgb("#a07ba8"), scale=40, rough=0.85),
        # Crockery and pots on the shelves.
        "ceramic_grey": plain("ceramic_grey", linear("#8a8278"), rough=0.55),
        "clay_brown": plain("clay_brown", linear("#4a3326"), rough=0.7),
        "porcelain_matte": plain("porcelain_matte", linear("#ece6dc"), rough=0.45),
        "ceramic_pattern": speckled("ceramic_pattern", srgb("#d9d2c6"), [srgb("#7a6a5a"), srgb("#a3876a")], rough=0.5,
                                    tile=0.12, density=0.25),
        "linen_beige": noisy("linen_beige", (0.82, 0.75, 0.64), (0.76, 0.69, 0.58), scale=140, detail=8, rough=0.95, bump=0.3),
        "linen_cream": noisy("linen_cream", (0.91, 0.87, 0.80), (0.86, 0.82, 0.75), scale=160, detail=8, rough=0.9, bump=0.25),
        "linen_panel": twill("linen_panel", srgb("#d0bd9f"), srgb("#b8a385")),
        "upholstery_beige": noisy("upholstery_beige", (0.84, 0.78, 0.68), (0.78, 0.72, 0.62), scale=140, detail=8, rough=0.95),
        "fabric_olive": plain("fabric_olive", (0.055, 0.07, 0.035), rough=0.95),
        "fabric_terracotta": plain("fabric_terracotta", (0.55, 0.13, 0.035), rough=0.95),
        # Ribbed olive felt: the veneer's straight grain at 2-3 cm reads as its ribs.
        "felt_olive": noisy("felt_olive", srgb("#6f7042"), srgb("#5d5e36"), scale=120, detail=10, rough=1.0, bump=0.2),
        "felt_grey": noisy("felt_grey", (0.57, 0.58, 0.52), (0.49, 0.50, 0.44), scale=160, detail=8, rough=1.0),
        "pleat_white": plain("pleat_white", linear("#efebe3"), rough=0.9),
        "rattan_black": veneer("rattan_black", srgb("#2a2826"), srgb("#0e0d0c"), rough=0.7, tile=0.35),
        # The same black cane, plain: for strands too fine to carry its grain (the woven pendant's band).
        "rattan_weave": plain("rattan_weave", linear("#1c1b19"), rough=0.7),
        # Sheer linen: greyer khaki (#9a8a70), mostly opaque, its slubs woven in
        # so the folds read as cloth (render 19); caramel linen (#c08a55).
        "curtain_linen": sheer("curtain_linen", srgb("#9a8a70"), alpha=0.88, weave=srgb("#7f705a"), tile=0.5),
        "curtain_ochre": sheer("curtain_ochre", linear("#cfa476"), alpha=0.9),
        "rug_rust": noisy("rug_rust", srgb("#7a3b2a"), srgb("#8a4a36"), scale=90, detail=10, rough=1.0, bump=0.5),
        "rug_sage": noisy("rug_sage", srgb("#8c8f6e"), srgb("#9a9c7c"), scale=90, detail=10, rough=1.0, bump=0.5),
        "ceramic_white": plain("ceramic_white", (0.80, 0.78, 0.72), rough=0.4),
        "ceramic_dark": plain("ceramic_dark", (0.10, 0.08, 0.07), rough=0.5),
        "outdoor_sage": plain("outdoor_sage", linear("#8a9478"), rough=0.5),
        "outdoor_green": plain("outdoor_green", linear("#3e4236"), rough=0.8),
        "outdoor_pedestal": plain("outdoor_pedestal", linear("#8a9478"), rough=0.55),
        "outdoor_orange": plain("outdoor_orange", linear("#c58c5f"), rough=0.45),
        "cushion_tan": noisy("cushion_tan", srgb("#c29e7b"), srgb("#b8936f"), scale=140, detail=8, rough=0.95),
        "canvas_linen": noisy("canvas_linen", srgb("#d4d0bc"), srgb("#c9c4ae"), scale=140, detail=8, rough=0.95),
        "canvas_mustard": noisy("canvas_mustard", srgb("#b8983e"), srgb("#ab8b36"), scale=140, detail=8, rough=0.95),
        "canvas_tan": noisy("canvas_tan", srgb("#c4a47c"), srgb("#b8966d"), scale=140, detail=8, rough=0.95),
        "marble_light": speckled("marble_light", srgb("#ece8e2"), [srgb("#d6d1ca"), srgb("#c8c3bc")], rough=0.25, tile=0.5,
                                 density=0.05),
        "stone_cream": noisy("stone_cream", srgb("#e6dccb"), srgb("#dcd0bc"), scale=8, rough=0.6, bump=0.05),
        "render_white": plain("render_white", linear("#efece6"), rough=0.85),
        "planter_brown": plain("planter_brown", linear("#3b2e26"), rough=0.6),
        "bark_grey": plain("bark_grey", linear("#7d7468"), rough=0.9),
        "wisteria_lilac": plain("wisteria_lilac", linear("#a77fc4"), rough=0.7),
        "wisteria_deep": plain("wisteria_deep", linear("#8a5aa8"), rough=0.7),
        "canvas_cream": noisy("canvas_cream", (0.91, 0.87, 0.79), (0.86, 0.82, 0.74), scale=140, detail=8, rough=0.95),
        "canvas_ochre": plain("canvas_ochre", (0.62, 0.36, 0.10), rough=0.9),
        "frame_anthracite": plain("frame_anthracite", (0.035, 0.037, 0.04), rough=0.45, metal=0.6),
        "concrete_light": noisy("concrete_light", (0.87, 0.84, 0.78), (0.81, 0.78, 0.72), scale=8, rough=0.7, bump=0.1),
        "wpc_grey": plain("wpc_grey", (0.18, 0.17, 0.16), rough=0.7),
        "acrylic_white": plain("acrylic_white", (0.86, 0.87, 0.88), rough=0.15),
        "water": plain("water", (0.03, 0.22, 0.26), rough=0.03, ior=1.33, coat=1.0, coat_rough=0.0),
        # Walk-in showers: grey large-format tiles, 60 x 120 cm with a hairline grout.
        "tile_large_grey": tiles("tile_large_grey", (0.50, 0.495, 0.48), (0.58, 0.575, 0.56), size=0.6, height=1.2, span=2.4,
                                 grout_px=1, rough=0.3, bump=0.15),
        # Render 12: C's bottle-green garden sofas on dark frames, a black ceramic kamado.
        "canvas_bottle": noisy("canvas_bottle", srgb("#33514a"), srgb("#2c483f"), scale=140, detail=8, rough=0.95),
        "frame_bottle": plain("frame_bottle", linear("#18231f"), rough=0.5, metal=0.4),
        "kamado_black": plain("kamado_black", (0.012, 0.012, 0.013), rough=0.35, coat=0.4, coat_rough=0.2),
        "olive_bark": plain("olive_bark", (0.18, 0.15, 0.11), rough=0.9),
        "olive_leaf": noisy("olive_leaf", (0.36, 0.42, 0.28), (0.47, 0.51, 0.37), scale=40, detail=6, rough=0.85),
        "paper": plain("paper", (0.85, 0.84, 0.80), rough=0.8),
        # The car
        "car_paint": plain("car_paint", (0.55, 0.20, 0.02), rough=0.25, coat=0.8, coat_rough=0.05),
        "rubber": plain("rubber", (0.02, 0.02, 0.02), rough=0.9),
        "lamp_front": emissive("lamp_front", (0.95, 0.93, 0.85), 2.0),
        "lamp_rear": emissive("lamp_rear", (0.70, 0.03, 0.02), 1.5),
        "glass": glass(),
        "mirror": plain("mirror", (0.96, 0.96, 0.96), rough=0.02, metal=1.0),
        "roof_tile": _roof(noisy("roof_tile", (0.225, 0.082, 0.048), (0.160, 0.055, 0.030), scale=30, rough=0.8, bump=0.5)),
        "grass": _grass(noisy("grass", (0.20, 0.32, 0.12), (0.14, 0.24, 0.08), scale=60, detail=10, rough=1.0, bump=0.4)),
        "paving": tiles("paving", (0.58, 0.57, 0.55), (0.46, 0.45, 0.43), size=0.9, rough=0.6, bump=0.3),
        "tarmac": noisy("tarmac", (0.10, 0.10, 0.11), (0.07, 0.07, 0.08), scale=90, detail=10, rough=0.9, bump=0.25),
    }

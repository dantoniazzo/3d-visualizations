"""A kit of parts for the buildings the app generates from a scene spec:
door leaves and their ironmongery, architraves, skirting, window frames,
glazing bars and cills, and stair treads, newels, balusters and rails.

The app builds walls, openings and flights itself, so a door can be slid
along a wall or a stair re-pitched at will; what it cannot do well is model.
Each part here is modelled once, at a typical size, and the app stretches it
to fit. It stretches a part only across the zones that part declares, and
those are all prismatic along the axis concerned: the flat field of a door
panel, the plain shaft of a baluster, the run of a moulding. Everything
outside a zone keeps its modelled size whatever size the part is stretched
to: the mitre on an architrave, the mouldings round a door panel, the round
corners of a cill, the beads on a turned baluster.

Axes, as the app sees them after glTF's Y-up conversion: X across, Y up, and
Z out of the wall towards the viewer. Z is Blender's -Y, so a part that faces
the room faces -Y here.

Each builder returns (object, zones, meta):
  - zones: {"x": [(lo, hi), ...], "y": ..., "z": ...} in Blender world
    coordinates, on Blender's axes. export_kit.py converts them to the app's
    axes, measured from the part's bounding box.
  - meta: numbers the app needs about the part, such as how thick a tread's
    board is under its nosing.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import geometry as g


# ---------------------------------------------------------------------
# Mesh helpers
# ---------------------------------------------------------------------

def _object(name, bm, col):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    g.link(obj, col)
    return obj


def _loft(loops, closed=False, cap_start=None, cap_end=None, smooth=()):
    """Bands of quads through a series of loops of equal length.

    `closed` joins the last loop back to the first: a frame swept round a
    rectangle. A cap is a hub point to fan the end loop to, or True for a
    single n-gon. `smooth` lists the bands (by index) to shade smooth.
    """
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in loop] for loop in loops]
    n = len(rings[0])
    pairs = list(zip(rings, rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
    for band, (a, b) in enumerate(pairs):
        for j in range(n):
            k = (j + 1) % n
            face = bm.faces.new((a[j], a[k], b[k], b[j]))
            face.smooth = band in smooth
    for ring, cap in ((rings[0], cap_start), (rings[-1], cap_end)):
        if cap is None:
            continue
        if cap is True:
            bm.faces.new(ring)
        else:
            hub = bm.verts.new(cap)
            for j in range(n):
                bm.faces.new((ring[j], ring[(j + 1) % n], hub))
    return bm


def _prism(profile, length, place, smooth=(), caps=True):
    """A closed 2D profile swept `length` along its third axis.

    `place(a, b, s)` puts profile point (a, b) at distance s along the sweep
    into Blender space. `smooth` lists the profile segments (segment i runs
    from point i to point i + 1) to shade smooth — the curves of a moulding,
    not its flats.
    """
    bm = bmesh.new()
    n = len(profile)
    a = [bm.verts.new(place(u, v, 0.0)) for u, v in profile]
    b = [bm.verts.new(place(u, v, length)) for u, v in profile]
    for i in range(n):
        j = (i + 1) % n
        face = bm.faces.new((a[i], a[j], b[j], b[i]))
        face.smooth = i in smooth
    if caps:
        bm.faces.new(a)
        bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def _lathe(profile, segments, cap_start=False, cap_end=False):
    """A profile of (radius, z) points, running up Z, turned about Blender Z
    and shaded smooth. The end caps, if asked for, are flat fans."""
    loops = [[(r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z)
              for k in range(segments)] for r, z in profile]
    z0, z1 = profile[0][1], profile[-1][1]
    bm = _loft(loops, cap_start=(0, 0, z0) if cap_start else None,
               cap_end=(0, 0, z1) if cap_end else None, smooth=range(len(profile)))

    def outwards(face):
        c = face.calc_center_median()
        if len(face.verts) == 3:      # a cap: down at the start, up at the end
            return Vector((0, 0, -1 if abs(c.z - z0) < abs(c.z - z1) else 1))
        return Vector((c.x, c.y, 0))

    for face in bm.faces:
        face.normal_update()
        if face.normal.dot(outwards(face)) < 0:
            face.normal_flip()
    return bm


def _orient(bm, towards):
    """Point every face of an open surface out along `towards(centre)` — a
    fixed direction for a panel, the radial direction for a turning."""
    for face in bm.faces:
        face.normal_update()
        want = towards(face.calc_center_median())
        if face.normal.dot(want) < 0:
            face.normal_flip()


def _arc(cx, cy, r, start, end, steps):
    """Points on a circular arc, both ends included, angles in degrees."""
    return [(cx + r * math.cos(math.radians(start + (end - start) * i / steps)),
             cy + r * math.sin(math.radians(start + (end - start) * i / steps)))
            for i in range(steps + 1)]


def _ogee(p0, p1, steps):
    """An S-curve from p0 to p1, flat where it leaves each end. Points are
    (along, out): `along` moves evenly, `out` eases in and out."""
    out = []
    for i in range(steps + 1):
        t = i / steps
        s = t * t * (3 - 2 * t)
        out.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * s))
    return out


def _segments(profile, curves):
    """Indices of the profile segments that lie on any of `curves`, each a
    run of consecutive points already in the profile."""
    index = {p: i for i, p in enumerate(profile)}
    out = set()
    for curve in curves:
        for p, q in zip(curve, curve[1:]):
            if p in index and q in index:
                out.add(index[p])
    return out


def _chamfered_square(half, c, z):
    """A square loop with its corners chamfered by c, eight points, running
    anticlockwise seen from above."""
    return [(half, -half + c, z), (half, half - c, z), (half - c, half, z), (-half + c, half, z),
            (-half, half - c, z), (-half, -half + c, z), (-half + c, -half, z), (half - c, -half, z)]


# ---------------------------------------------------------------------
# Doors
# ---------------------------------------------------------------------

LEAF_W, LEAF_H, LEAF_T = 0.826, 2.02, 0.040
STILE, TOP_RAIL, BOTTOM_RAIL, MUNTIN = 0.115, 0.115, 0.20, 0.10
# The lock rail carries the handle, so it is kept at handle height whatever
# the height of the door: only the upper panels grow.
LOCK_RAIL = (0.95, 1.15)
# A raised-and-fielded panel, as (inset from the frame, depth below its
# face): the sticking moulding on the frame's edge, down to the panel's flat
# margin, then the bevel rising to the field. It starts 1.5 mm down, where
# the chamfer on the framing's edge ends, so the two meet without a slit.
PANEL = [(0.000, 0.0015), (0.004, 0.003), (0.007, 0.0055), (0.008, 0.010), (0.020, 0.010),
         (0.055, 0.004)]
FIELD = 0.004


def _panel(x0, x1, z0, z1, t):
    """Both faces of one panel, filling a hole in the leaf's framing."""
    out = []
    for side in (-1, 1):
        loops = []
        for inset, depth in PANEL:
            y = side * (t / 2 - depth)
            loops.append([(x0 + inset, y, z0 + inset), (x1 - inset, y, z0 + inset),
                          (x1 - inset, y, z1 - inset), (x0 + inset, y, z1 - inset)])
        hub = ((x0 + x1) / 2, side * (t / 2 - FIELD), (z0 + z1) / 2)
        bm = _loft(loops, cap_end=hub)
        _orient(bm, lambda c, s=side: Vector((0, s, 0)))
        out.append(bm)
    return out


def door_leaf(col):
    """A four-panel leaf: stiles, three rails and a muntin, with raised and
    fielded panels on both faces. Symmetric, so it hangs either hand."""
    w, h, t = LEAF_W, LEAF_H, LEAF_T
    hw = w / 2
    inner = w - 2 * STILE

    def member(sx, sz, x, z):
        return g.box("leaf", (sx, t, sz), loc=(x, 0, z), col=col, bevel=0.0015, segments=1)

    parts = [member(STILE, h, -hw + STILE / 2, h / 2), member(STILE, h, hw - STILE / 2, h / 2)]
    for z0, z1 in ((0, BOTTOM_RAIL), LOCK_RAIL, (h - TOP_RAIL, h)):
        parts.append(member(inner, z1 - z0, 0, (z0 + z1) / 2))
    for z0, z1 in ((BOTTOM_RAIL, LOCK_RAIL[0]), (LOCK_RAIL[1], h - TOP_RAIL)):
        parts.append(member(MUNTIN, z1 - z0, 0, (z0 + z1) / 2))
        for x0, x1 in ((-hw + STILE, -MUNTIN / 2), (MUNTIN / 2, hw - STILE)):
            parts += [_object("panel", bm, col) for bm in _panel(x0, x1, z0, z1, t)]

    obj = g.join(parts, "door_leaf", col)
    margin = PANEL[-1][0]
    zones = {
        # The fields of the panels, across and up — the upper pair only.
        "x": [(-hw + STILE + margin, -MUNTIN / 2 - margin), (MUNTIN / 2 + margin, hw - STILE - margin)],
        "z": [(LOCK_RAIL[1] + margin, h - TOP_RAIL - margin)],
    }
    return obj, zones, {}


def door_handle(col):
    """A lever on a round rose. Its origin is the spindle, on the face of the
    leaf; it stands out towards the viewer and the lever points to -X."""
    reach = 0.056           # face of the leaf to the lever's centreline
    # +90 degrees about X carries Blender +Z onto -Y: out of the door, into the room.
    tip_forward = Matrix.Rotation(math.pi / 2, 3, "X")
    parts = []

    # Turned about Blender Z, then tipped forward so Z runs out of the door.
    rose = [(0.026, 0.0), (0.026, 0.0035), (0.0245, 0.0065), (0.021, 0.0085), (0.014, 0.0095)]
    neck = [(0.0105, 0.0090), (0.0090, 0.014), (0.0085, 0.030), (0.0090, 0.042),
            (0.0098, reach - 0.004), (0.0098, reach)]
    for profile, caps in ((rose, (True, True)), (neck, (False, False))):
        bm = _lathe(profile, 14, *caps)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=tip_forward, verts=bm.verts)
        parts.append(_object("rose", bm, col))

    path = g.catmull_rom([(0.0, -reach, 0.0), (-0.030, -reach - 0.002, 0.0),
                          (-0.075, -reach - 0.002, -0.002), (-0.118, -reach + 0.006, -0.003)], steps=4)
    parts.append(g.sweep("lever", path, 0.0088, sides=10, col=col))
    parts.append(g.sphere("elbow", 0.0098, loc=(0.0, -reach, 0.0), col=col, subdivisions=1))
    parts.append(g.sphere("tip", 0.0088, loc=path[-1], col=col, subdivisions=1))
    return g.join(parts, "door_handle", col), {}, {"reach": reach}


def door_pull(col):
    """A flush pull for sliding and pocket leaves: a rounded plate with a
    shallow dish, standing only 6 mm proud so the leaf can still slide
    into its pocket. Origin at its centre, on the face of the leaf."""
    w, h, r = 0.036, 0.150, 0.017
    rows = [(0.0, 0.0), (0.0010, -0.0050), (0.0025, -0.0062), (0.0060, -0.0062), (0.0090, -0.0020)]
    loops = [[(x, y, z) for x, z in g.rounded_rect(w - 2 * i, h - 2 * i, r - i, segments=4)]
             for i, y in rows]
    bm = _loft(loops, cap_end=(0, rows[-1][1], 0), smooth=range(len(rows)))
    _orient(bm, lambda c: Vector((0, -1, 0)))
    return _object("door_pull", bm, col), {}, {}


def door_hinge(col):
    """The knuckle of a butt hinge — all that shows of one on a hung door —
    with its pin's finials. Centred on its pin, which runs up Blender Z."""
    profile = [(0.0015, -0.058), (0.0040, -0.052), (0.0055, -0.050), (0.0065, -0.048),
               (0.0065, 0.048), (0.0055, 0.050), (0.0040, 0.052), (0.0015, 0.058)]
    return _object("door_hinge", _lathe(profile, 8, True, True), col), {}, {}


def door_stop(col):
    """The stop bead planted on a door lining, 1 m of it, running up Blender
    Z and standing 12 mm out of the lining towards +X."""
    profile = [(0.000, -0.015), (0.0100, -0.015), (0.0115, -0.0143), (0.0120, -0.0130),
               (0.0120, 0.0130), (0.0115, 0.0143), (0.0100, 0.015), (0.000, 0.015)]
    bm = _prism(profile, 1.0, lambda a, b, s: (a, b, s), smooth={1, 2, 4, 5})
    return _object("door_stop", bm, col), {"z": [(0.0, 1.0)]}, {}


# ---------------------------------------------------------------------
# Skirting and architraves
# ---------------------------------------------------------------------

# Skirting, as (height, projection): a square face with an ogee and a small
# rounded top — 120 x 18 mm.
_SKIRT_OGEE = _ogee((0.090, 0.0165), (0.114, 0.0070), 7)
SKIRTING = ([(0.0, 0.0), (0.0, 0.017), (0.001, 0.018), (0.086, 0.018), (0.088, 0.0165)] + _SKIRT_OGEE
            + [(0.117, 0.0066), (0.1195, 0.0055), (0.120, 0.0040), (0.120, 0.0)])

# Architrave, as (distance from the opening's edge, projection): thin where
# it meets the lining, rising through an ogee to a thick outer edge, which is
# what the skirting dies into — 70 x 20.5 mm.
ARCH_W = 0.070
_ARCH_OGEE = _ogee((0.014, 0.0102), (0.046, 0.0200), 7)
ARCHITRAVE = ([(0.0, 0.0), (0.0, 0.0085), (0.0015, 0.0100), (0.012, 0.0100)] + _ARCH_OGEE
              + [(0.060, 0.0205), (0.064, 0.0203), (0.067, 0.0193), (0.069, 0.0175),
                 (ARCH_W, 0.0150), (ARCH_W, 0.0)])


def skirting(col):
    """1 m of skirting along X, its face towards the room."""
    bm = _prism(SKIRTING, 1.0, lambda v, d, s: (s, -d, v), smooth=_segments(SKIRTING, [_SKIRT_OGEE]))
    return _object("skirting", bm, col), {"x": [(0.0, 1.0)]}, {}


def architrave_leg(col):
    """The left-hand leg of a door casing: its edge on the opening at +X,
    standing 2 m to the head of the opening, then mitred up to meet the
    head. The app mirrors it for the right-hand leg."""
    height = 2.0
    smooth = _segments(ARCHITRAVE, [_ARCH_OGEE])
    bm = bmesh.new()
    foot = [bm.verts.new((ARCH_W / 2 - u, -d, 0.0)) for u, d in ARCHITRAVE]
    head = [bm.verts.new((ARCH_W / 2 - u, -d, height + u)) for u, d in ARCHITRAVE]
    n = len(ARCHITRAVE)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((foot[i], foot[j], head[j], head[i])).smooth = i in smooth
    bm.faces.new(foot)
    bm.faces.new(head)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object("architrave_leg", bm, col), {"z": [(0.0, height)]}, {}


def architrave_head(col):
    """The head of a door casing over a 0.9 m opening, its lower edge on the
    opening, mitred at both ends to meet the legs."""
    half = 0.45
    smooth = _segments(ARCHITRAVE, [_ARCH_OGEE])
    bm = bmesh.new()
    left = [bm.verts.new((-(half + u), -d, u)) for u, d in ARCHITRAVE]
    right = [bm.verts.new((half + u, -d, u)) for u, d in ARCHITRAVE]
    n = len(ARCHITRAVE)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i])).smooth = i in smooth
    bm.faces.new(left)
    bm.faces.new(right)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object("architrave_head", bm, col), {"x": [(-half, half)]}, {}


# ---------------------------------------------------------------------
# Windows
# ---------------------------------------------------------------------

WIN_W, WIN_H, WIN_D = 1.2, 1.4, 0.07
# Frame and sash in one section, as (inset from the outside of the frame,
# depth): the frame's face, a shadow gap, the sash's face set 4 mm back, and
# an ovolo down to the glass. The section is symmetric front to back.
_OVOLO = [(0.068, -0.031)] + [(0.068 + 0.012 * math.cos(math.radians(a)), -0.019 + 0.012 * math.sin(math.radians(a)))
                              for a in (-60, -30, 0)]
_FRAME_FRONT = ([(0.000, -0.035), (0.040, -0.035), (0.041, -0.029), (0.043, -0.029), (0.044, -0.031)]
                + _OVOLO + [(0.081, -0.010)])
FRAME = _FRAME_FRONT + [(u, -y) for u, y in reversed(_FRAME_FRONT)]
GLASS_LINE = 0.081      # inset of the frame's innermost face, where the glass sits
SASH_FACE = 0.068       # inset of the sash's face, where the glazing bars meet it

# A glazing bar, as (across, depth): the same ovolo as the sash either side
# of a flat, so bars and sash read as one piece of joinery.
_BAR_ARCS = [_arc(-0.004, -0.019, 0.012, 180, 270, 3), _arc(0.004, -0.019, 0.012, 270, 360, 3)]
_BAR_FRONT = [(-0.017, -0.010)] + _BAR_ARCS[0] + _BAR_ARCS[1] + [(0.017, -0.010)]
GLAZING_BAR = _BAR_FRONT + [(x, -y) for x, y in reversed(_BAR_FRONT)]


def window_frame(col):
    """Frame and sash as one moulded ring, mitred at the corners because it
    is swept round the opening. Centred on its opening."""
    loops = []
    for u, y in FRAME:
        x0, x1 = -WIN_W / 2 + u, WIN_W / 2 - u
        z0, z1 = -WIN_H / 2 + u, WIN_H / 2 - u
        loops.append([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)])
    bm = _loft(loops, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    reach = GLASS_LINE + 0.009
    zones = {
        "x": [(-WIN_W / 2 + reach, WIN_W / 2 - reach)],
        "z": [(-WIN_H / 2 + reach, WIN_H / 2 - reach)],
        # A deeper wall gets a deeper frame; both faces keep their mouldings.
        "y": [(-0.005, 0.005)],
    }
    return _object("window_frame", bm, col), zones, {"glass_line": GLASS_LINE, "sash_face": SASH_FACE}


def glazing_bar(col):
    """1 m of glazing bar, standing up Blender Z. The app turns it on its
    side for a transom."""
    smooth = _segments(GLAZING_BAR, _BAR_ARCS + [[(x, -y) for x, y in reversed(a)] for a in _BAR_ARCS])
    bm = _prism(GLAZING_BAR, 1.0, lambda a, b, s: (a, b, s - 0.5), smooth=smooth)
    return _object("glazing_bar", bm, col), {"z": [(-0.5, 0.5)], "y": [(-0.005, 0.005)]}, {}


def window_cill(col):
    """A cill board under a window, proud of both faces of the wall, with
    rounded horns and a rounded top edge. 1.34 m by 0.40 m by 35 mm."""
    w, d, r = 1.34, 0.40, 0.015
    top = 0.035
    rows = [(0.004, 0.0), (0.0012, 0.0012), (0.0, 0.004), (0.0, top - 0.010)]
    rows += [(0.010 - 0.010 * math.cos(math.radians(a)), top - 0.010 + 0.010 * math.sin(math.radians(a)))
             for a in (22.5, 45, 67.5, 90)]
    loops = [[(x, y, z) for x, y in g.rounded_rect(w - 2 * i, d - 2 * i, r - i, segments=4)]
             for i, z in rows]
    bm = _loft(loops, cap_start=(0, 0, 0), cap_end=(0, 0, top), smooth=range(len(rows)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    zones = {"x": [(-w / 2 + 0.02, w / 2 - 0.02)], "y": [(-d / 2 + 0.02, d / 2 - 0.02)]}
    return _object("window_cill", bm, col), zones, {}


# ---------------------------------------------------------------------
# Stairs and balustrades
# ---------------------------------------------------------------------

TREAD_BOARD = 0.032     # thickness of a tread
NOSING = 0.025          # how far a tread's nosing stands over the riser below
_BULLNOSE = _arc(0.009, 0.016, 0.016, 90, -90, 6)
_COVE = _arc(0.009, -0.009, 0.009, 90, 180, 3)
TREAD = [(-0.25, 0.0), (-0.25, TREAD_BOARD)] + _BULLNOSE + _COVE[1:] + [(0.0, 0.0)]


def stair_tread(col):
    """A 1 m wide tread with a bullnosed nosing and a scotia tucked under it.
    The riser face is Blender y = 0, the nosing towards +Y — down the
    flight, which is the app's -Z."""
    smooth = _segments(TREAD, [_BULLNOSE, _BULLNOSE[-1:] + _COVE[1:]])
    bm = _prism(TREAD, 1.0, lambda y, z, s: (s - 0.5, y, z), smooth=smooth)
    zones = {"x": [(-0.5, 0.5)], "y": [(-0.24, -0.01)]}
    return _object("stair_tread", bm, col), zones, {"board": TREAD_BOARD, "nosing": NOSING}


def newel(col):
    """A 90 mm newel post with stop-chamfered arrises, a moulded base and
    a pyramid cap. 1.2 m tall; the chamfered shaft is what stretches."""
    half = 0.045
    parts = [
        g.box("base", (0.096, 0.096, 0.10), loc=(0, 0, 0.05), col=col, bevel=0.003, segments=2),
        g.box("plinth", (0.104, 0.104, 0.022), loc=(0, 0, 0.111), col=col, bevel=0.007, segments=2),
        g.box("collar", (0.100, 0.100, 0.030), loc=(0, 0, 1.045), col=col, bevel=0.005, segments=2),
    ]
    # The shaft: square where it leaves the base and meets the collar, and
    # chamfered in between, the chamfers running out in a short stop.
    shaft = [_chamfered_square(half, 0.0005, 0.12), _chamfered_square(half, 0.008, 0.15),
             _chamfered_square(half, 0.008, 1.00), _chamfered_square(half, 0.0005, 1.03)]
    bm = _loft(shaft)
    _orient(bm, lambda c: Vector((c.x, c.y, 0)))
    parts.append(_object("shaft", bm, col))

    # The cap: a moulded square with a low pyramid on it.
    cap = [(0.047, 1.060), (0.058, 1.065), (0.060, 1.072), (0.060, 1.085), (0.057, 1.092), (0.050, 1.095)]
    bm = _loft([_chamfered_square(s, 0.0005, z) for s, z in cap], cap_end=(0, 0, 1.135))
    _orient(bm, lambda c: Vector((c.x, c.y, 0.2 if c.z > 1.09 else 0)))
    parts.append(_object("cap", bm, col))

    obj = g.join(parts, "newel", col)
    return obj, {"z": [(0.16, 0.99)]}, {}


# A turned baluster, as (radius, height) from the top of its square foot to
# the bottom of its square head: a vase and a ring below, a ring and bead
# above, and a plain shaft between that takes up the length.
BALUSTER_TURNING = [
    (0.0140, 0.120), (0.0160, 0.128), (0.0160, 0.138), (0.0110, 0.150), (0.0140, 0.180),
    (0.0148, 0.205), (0.0130, 0.240), (0.0090, 0.275), (0.0120, 0.290), (0.0120, 0.302),
    (0.0090, 0.315), (0.0090, 0.610), (0.0120, 0.628), (0.0120, 0.640), (0.0100, 0.652),
    (0.0150, 0.675), (0.0150, 0.690), (0.0140, 0.700),
]


def baluster(col):
    """A turned baluster, 0.8 m, with square ends 32 mm across to house
    into the rails above and below. A landing takes a hundred or more, so
    the turning is kept lean: eight sides, shaded smooth."""
    parts = []
    for z0, z1 in ((0.0, 0.12), (0.70, 0.80)):
        bm = _loft([_chamfered_square(0.016, 0.002, z0), _chamfered_square(0.016, 0.002, z1)],
                   cap_start=True, cap_end=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        parts.append(_object("pin", bm, col))
    parts.append(_object("turning", _lathe(BALUSTER_TURNING, 8), col))
    return g.join(parts, "baluster", col), {"z": [(0.325, 0.605)]}, {}


# A moulded handrail, as (across, height): a rounded top with a finger grip
# either side, and a groove underneath that the baluster heads sit in.
_RAIL_TOP = _arc(0.0, 0.037, 1.0, 0, 180, 10)
_RAIL_TOP = [(0.032 * x, 0.037 + 0.021 * (y - 0.037)) for x, y in _RAIL_TOP]
_RAIL_GRIP = [(0.032, 0.022), (0.0295, 0.027), (0.0285, 0.031), (0.030, 0.035)]
HANDRAIL = ([(-0.028, 0.0), (-0.017, 0.0), (-0.017, 0.008), (0.017, 0.008), (0.017, 0.0),
             (0.028, 0.0), (0.032, 0.004)] + _RAIL_GRIP + _RAIL_TOP
            + [(-x, y) for x, y in reversed(_RAIL_GRIP)] + [(-0.032, 0.004)])


def handrail(col):
    """1 m of handrail along X."""
    smooth = _segments(HANDRAIL, [_RAIL_TOP, _RAIL_GRIP, [(-x, y) for x, y in reversed(_RAIL_GRIP)]])
    bm = _prism(HANDRAIL, 1.0, lambda y, z, s: (s, y, z), smooth=smooth)
    return _object("handrail", bm, col), {"x": [(0.0, 1.0)]}, {"plough": 0.008}


BASE_RAIL = [(-0.032, 0.0), (0.032, 0.0), (0.032, 0.030), (0.029, 0.036), (0.022, 0.040),
             (-0.022, 0.040), (-0.029, 0.036), (-0.032, 0.030)]


def base_rail(col):
    """1 m of the rail balusters stand on: on the floor round a landing,
    and capping the string up a flight."""
    bm = _prism(BASE_RAIL, 1.0, lambda y, z, s: (s, y, z))
    return _object("base_rail", bm, col), {"x": [(0.0, 1.0)]}, {}


#: Every part, in the order they are exported.
PARTS = {
    "door_leaf": door_leaf,
    "door_handle": door_handle,
    "door_pull": door_pull,
    "door_hinge": door_hinge,
    "door_stop": door_stop,
    "skirting": skirting,
    "architrave_leg": architrave_leg,
    "architrave_head": architrave_head,
    "window_frame": window_frame,
    "glazing_bar": glazing_bar,
    "window_cill": window_cill,
    "stair_tread": stair_tread,
    "newel": newel,
    "baluster": baluster,
    "handrail": handrail,
    "base_rail": base_rail,
}

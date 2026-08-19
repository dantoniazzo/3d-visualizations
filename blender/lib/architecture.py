"""The building shell: walls, openings, floors, ceilings, stairs, roof, trim.

A wall is split into solid panels around its openings rather than boolean-cut,
so every panel stays a box, the reveals come out square, and the mesh stays
light enough that a whole house is a few seconds of scripting.

Plan convention: X and Y are the floor plan, Z is up. A wall is given by its
two plan endpoints and is built in its own frame (local X along its length,
local Y through its thickness, local Z up) before being placed.
"""

import math

import bpy
from mathutils import Vector

from . import geometry as g


#: Filled during build_wall: one record per door, in Blender plan coords.
DOOR_REGISTRY = []


class Opening:
    """A hole in a wall, and whatever fills it."""

    def __init__(self, kind, offset, width, height, sill=0.0, **kw):
        self.kind = kind          # door | doorway | window | arch | opening
        self.offset = offset      # metres along the wall to the hole's centre
        self.width = width
        self.height = height
        self.sill = sill
        self.opts = kw


def door(offset, width=0.86, height=2.04, **kw):
    return Opening("door", offset, width, height, 0.0, **kw)


def doorway(offset, width=1.1, height=2.10, **kw):
    return Opening("doorway", offset, width, height, 0.0, **kw)


def window(offset, width=1.4, height=1.45, sill=0.9, **kw):
    return Opening("window", offset, width, height, sill, **kw)


def french(offset, width=1.8, height=2.15, **kw):
    """Full-height glazed doors onto the garden."""
    kw.setdefault("panes_x", 4)
    return Opening("window", offset, width, height, 0.0, **kw)


class Wall:
    def __init__(self, start, end, height=2.7, thickness=0.1, base=0.0,
                 openings=None, mat_a=None, mat_b=None, skirt_a=True,
                 skirt_b=True, external=False):
        self.start = Vector(start)
        self.end = Vector(end)
        self.height = height
        self.thickness = thickness
        self.base = base
        self.openings = sorted(openings or [], key=lambda o: o.offset)
        self.mat_a = mat_a          # +Y side in the wall's own frame
        self.mat_b = mat_b or mat_a  # -Y side
        self.skirt_a = skirt_a
        self.skirt_b = skirt_b
        self.external = external

    @property
    def length(self):
        return (self.end - self.start).length

    @property
    def angle(self):
        d = self.end - self.start
        return math.atan2(d.y, d.x)


def build_wall(wall, col, mats, trim_mat=None):
    """Return the joined wall object, and a list of the loose parts (doors,
    glazing) that should stay separate so they can be opened or reflected."""
    parts = []
    extras = []
    L = wall.length

    # Record every door for the in-app rebuild. World centre of the opening
    # comes from the wall's own line, so it survives any later refactor of
    # how walls are placed.
    theta = wall.angle
    for o in wall.openings:
        if o.kind == "door":
            DOOR_REGISTRY.append(dict(
                x=wall.start.x + math.cos(theta) * o.offset,
                y=wall.start.y + math.sin(theta) * o.offset,
                yaw=math.degrees(theta),
                width=o.width, height=o.height,
                thickness=wall.thickness, base=wall.base,
                leaf=o.opts.get("leaf", "door_leaf"),
                handle=o.opts.get("handle", "brass"),
                swing=o.opts.get("swing", 0),
            ))
    t = wall.thickness
    h = wall.height
    trim_mat = trim_mat or mats["trim_white"]

    # --- solid panels between the holes --------------------------------
    def panel(x0, x1, z0, z1):
        if x1 - x0 < 1e-4 or z1 - z0 < 1e-4:
            return
        p = g.box(
            "panel", (x1 - x0, t, z1 - z0),
            loc=((x0 + x1) / 2, 0, (z0 + z1) / 2), col=col,
            mat=mats["render_ext"] if wall.external else (wall.mat_a or mats["wall_white"]),
        )
        parts.append(p)

    cursor = 0.0
    for o in wall.openings:
        x0 = o.offset - o.width / 2
        x1 = o.offset + o.width / 2
        top = o.sill + o.height
        panel(cursor, x0, 0, h)
        if o.sill > 1e-4:
            panel(x0, x1, 0, o.sill)
        if top < h - 1e-4:
            panel(x0, x1, top, h)
        cursor = x1
    panel(cursor, L, 0, h)

    # --- the second face, so two rooms can be different colours --------
    # A thin skin on each side rather than a second wall: it keeps the
    # opening reveals reading as one solid wall.
    if wall.mat_b and wall.mat_b is not wall.mat_a and not wall.external:
        skin = 0.004
        cursor = 0.0

        def skin_panel(x0, x1, z0, z1):
            if x1 - x0 < 1e-4 or z1 - z0 < 1e-4:
                return
            parts.append(g.box(
                "skin", (x1 - x0, skin, z1 - z0),
                loc=((x0 + x1) / 2, -(t / 2 + skin / 2) + 0.0005, (z0 + z1) / 2),
                col=col, mat=wall.mat_b,
            ))

        for o in wall.openings:
            x0, x1 = o.offset - o.width / 2, o.offset + o.width / 2
            top = o.sill + o.height
            skin_panel(cursor, x0, 0, h)
            if o.sill > 1e-4:
                skin_panel(x0, x1, 0, o.sill)
            if top < h - 1e-4:
                skin_panel(x0, x1, top, h)
            cursor = x1
        skin_panel(cursor, L, 0, h)

    # --- skirting, broken at every hole that reaches the floor ---------
    runs = []
    cursor = 0.0
    for o in wall.openings:
        if o.sill < 1e-4:
            runs.append((cursor, o.offset - o.width / 2))
            cursor = o.offset + o.width / 2
    runs.append((cursor, L))

    if not wall.external:
        for x0, x1 in runs:
            if x1 - x0 < 0.05:
                continue
            if wall.skirt_a:
                parts.append(g.bar("skirt", g.SKIRTING, x1 - x0,
                                   loc=(x0, t / 2, 0), col=col, mat=trim_mat))
            if wall.skirt_b:
                parts.append(g.bar("skirt", [(-y, z) for y, z in g.SKIRTING], x1 - x0,
                                   loc=(x0, -t / 2, 0), col=col, mat=trim_mat))

    # --- what fills each hole -------------------------------------------
    for o in wall.openings:
        if o.kind in ("door", "doorway"):
            parts += _casing(o, wall, col, trim_mat)
            if o.kind == "door":
                extras.append(_door_leaf(o, wall, col, mats))
        elif o.kind == "window":
            made, glazing = _window(o, wall, col, mats, trim_mat)
            parts += made
            extras.append(glazing)

    obj = g.join(parts, "wall", col)
    g.bevel_object(obj, 0.0015, 2)

    # Place the assembled wall on its plan line. Doors and glazing were built
    # in the same local frame and carry their own offsets within it, so they
    # ride along as children rather than being repositioned — overwriting
    # their transforms here would collapse every one of them onto the corner.
    obj.rotation_euler = (0, 0, wall.angle)
    obj.location = (wall.start.x, wall.start.y, wall.base)
    extras = [e for e in extras if e is not None]
    for e in extras:
        e.parent = obj
    return obj, extras


def _casing(o, wall, col, trim):
    """Lining and architrave around a door or doorway."""
    t = wall.thickness
    w, h = o.width, o.height
    x = o.offset
    out = []

    # Lining boards on the reveal faces.
    out.append(g.box("lining", (0.02, t, h), loc=(x - w / 2 + 0.01, 0, h / 2), col=col, mat=trim))
    out.append(g.box("lining", (0.02, t, h), loc=(x + w / 2 - 0.01, 0, h / 2), col=col, mat=trim))
    out.append(g.box("lining", (w, t, 0.02), loc=(x, 0, h - 0.01), col=col, mat=trim))

    # Architrave, mitred round both faces.
    for side in (1, -1):
        y = side * (t / 2)
        prof = g.ARCHITRAVE if side > 0 else [(-a, b) for a, b in g.ARCHITRAVE]
        # Verticals: the bar sweeps +X, so stand it up by rotating about Y.
        for sx in (-1, 1):
            out.append(g.bar("arch", prof, h + 0.07, loc=(x + sx * (w / 2 + 0.005), y, 0),
                             rot=(0, -math.pi / 2, 0), col=col, mat=trim))
        out.append(g.bar("arch", prof, w + 0.09,
                         loc=(x - w / 2 - 0.045, y, h + 0.005), col=col, mat=trim))
    return out


def _door_leaf(o, wall, col, mats):
    """A panelled leaf on its hinge side, plus handle. Kept as its own object
    so it can be swung open."""
    w, h = o.width - 0.006, o.height - 0.008
    leaf_mat = mats[o.opts.get("leaf", "door_leaf")]
    parts = [g.box("leaf", (w, 0.042, h), loc=(w / 2, 0, h / 2), col=col, mat=leaf_mat)]

    # Two recessed panels — what stops a door reading as a plank.
    for i, (z0, z1) in enumerate([(0.14, 0.44), (0.52, 0.94)]):
        parts.append(g.box(
            f"panel{i}", (w - 0.22, 0.006, (z1 - z0) * h),
            loc=(w / 2, 0.022, (z0 + (z1 - z0) / 2) * h), col=col, mat=leaf_mat, bevel=0.004,
        ))

    handle_mat = mats[o.opts.get("handle", "brass")]
    hx = w - 0.06
    parts.append(g.cylinder("rose", 0.028, 0.012, loc=(hx, 0.024, 1.05),
                            rot=(math.pi / 2, 0, 0), col=col, mat=handle_mat))
    parts.append(g.cylinder("lever", 0.011, 0.10, loc=(hx - 0.045, 0.036, 1.05),
                            rot=(0, math.pi / 2, 0), col=col, mat=handle_mat))
    parts.append(g.cylinder("rose", 0.028, 0.012, loc=(hx, -0.024, 1.05),
                            rot=(math.pi / 2, 0, 0), col=col, mat=handle_mat))
    parts.append(g.cylinder("lever", 0.011, 0.10, loc=(hx - 0.045, -0.036, 1.05),
                            rot=(0, math.pi / 2, 0), col=col, mat=handle_mat))

    leaf = g.join(parts, "door", col)
    g.bevel_object(leaf, 0.002, 2)

    # The leaf mesh already runs 0..w from its hinge edge, so the swing is a
    # rotation about the holder and the holder sits on the jamb. Keeping the
    # hinge in a parent means the door can be opened later without touching
    # the geometry.
    holder = bpy.data.objects.new("door_holder", None)
    g.link(holder, col)
    holder.empty_display_size = 0.1
    holder.location = (o.offset - o.width / 2 + 0.003, 0, 0)
    holder.rotation_euler = (0, 0, math.radians(o.opts.get("swing", 0.0)))
    leaf.parent = holder
    holder["is_door"] = True
    return holder


def _window(o, wall, col, mats, trim):
    """Frame, glazing bars, cill and reveal lining."""
    t = wall.thickness
    w, h, s = o.width, o.height, o.sill
    x = o.offset
    out = []
    frame_d = min(0.07, t * 0.7)

    # Reveal lining all round.
    out.append(g.box("rev", (0.016, t, h), loc=(x - w / 2 + 0.008, 0, s + h / 2), col=col, mat=trim))
    out.append(g.box("rev", (0.016, t, h), loc=(x + w / 2 - 0.008, 0, s + h / 2), col=col, mat=trim))
    out.append(g.box("rev", (w, t, 0.016), loc=(x, 0, s + h - 0.008), col=col, mat=trim))

    # Outer frame.
    for sx in (-1, 1):
        out.append(g.box("fr", (0.05, frame_d, h), loc=(x + sx * (w / 2 - 0.025), 0, s + h / 2),
                         col=col, mat=trim))
    out.append(g.box("fr", (w, frame_d, 0.05), loc=(x, 0, s + h - 0.025), col=col, mat=trim))
    out.append(g.box("fr", (w, frame_d, 0.055), loc=(x, 0, s + 0.028), col=col, mat=trim))

    # Glazing bars.
    panes_x = o.opts.get("panes_x", 2)
    panes_z = o.opts.get("panes_z", 2)
    for i in range(1, panes_x):
        out.append(g.box("bar", (0.03, frame_d * 0.8, h - 0.1),
                         loc=(x - w / 2 + i * w / panes_x, 0, s + h / 2), col=col, mat=trim))
    for i in range(1, panes_z):
        out.append(g.box("bar", (w - 0.1, frame_d * 0.8, 0.03),
                         loc=(x, 0, s + i * h / panes_z), col=col, mat=trim))

    # Cill, inside and out.
    if s > 0.2:
        out.append(g.bar("cill", g.CILL, w + 0.14, loc=(x - w / 2 - 0.07, t / 2 - 0.005, s - 0.032),
                         col=col, mat=trim))
        out.append(g.bar("cill", [(-a, b) for a, b in g.CILL], w + 0.16,
                         loc=(x - w / 2 - 0.08, -t / 2 + 0.005, s - 0.038), col=col, mat=trim))

    glazing = g.box("glazing", (w - 0.09, 0.008, h - 0.09), loc=(x, 0, s + h / 2),
                    col=col, mat=mats["glass"])
    return out, glazing


# ---------------------------------------------------------------------
# Slabs
# ---------------------------------------------------------------------

def slab(name, points, z, thickness, col, mat_top, mat_bottom=None, holes=None):
    """A floor plate from a plan polygon, with optional stairwell holes."""
    top = g.polygon(name, points, loc=(0, 0, z), col=col, mat=mat_top)
    g.solidify(top, thickness, offset=-1.0)
    if holes:
        for i, hole in enumerate(holes):
            cutter = g.polygon(f"{name}_cut{i}", hole, loc=(0, 0, z - thickness - 0.05), col=col)
            g.solidify(cutter, thickness + 0.2, offset=1.0)
            m = top.modifiers.new(f"hole{i}", "BOOLEAN")
            m.operation = "DIFFERENCE"
            m.object = cutter
            m.solver = "EXACT"
            cutter.hide_render = True
            cutter.hide_viewport = True
    if mat_bottom is not None:
        top.data.materials.append(mat_bottom)
    return top


def ceiling(name, points, z, col, mat, cornice_mat=None, walls=None):
    """A ceiling plane, optionally with a cornice run round the given walls."""
    obj = g.polygon(name, points, loc=(0, 0, z), col=col, mat=mat, flip=True)
    made = [obj]
    if cornice_mat and walls:
        for a, b in walls:
            a, b = Vector(a), Vector(b)
            d = b - a
            made.append(g.bar(
                "cornice", [(-y, -zz) for y, zz in g.CORNICE], d.length,
                loc=(a.x, a.y, z), rot=(0, 0, math.atan2(d.y, d.x)),
                col=col, mat=cornice_mat,
            ))
    return made


# ---------------------------------------------------------------------
# Stairs
# ---------------------------------------------------------------------

def build_stair(x0, x1, y0, y1, base, top, steps, col, mats,
                balustrade="east", tread_mat="oak", trim="trim_white"):
    """A straight flight climbing +Y, with closed strings and a balustrade.

    `balustrade` is which side gets the newels, spindles and handrail:
    "east", "west", "both" or None. The other side is taken to be a wall.
    """
    width = x1 - x0
    run = y1 - y0
    rise = (top - base) / steps
    going = run / steps
    tm = mats[tread_mat]
    tr = mats[trim]
    parts = []

    for i in range(steps):
        y = y0 + i * going
        z = base + i * rise
        # Tread, with a nosing projecting over the riser below.
        parts.append(g.box("tread", (width, going + 0.025, 0.042),
                           loc=(x0 + width / 2, y + going / 2 - 0.0125, z + rise - 0.021),
                           col=col, mat=tm, bevel=0.004))
        # Riser.
        parts.append(g.box("riser", (width, 0.018, rise - 0.042),
                           loc=(x0 + width / 2, y + 0.009, z + (rise - 0.042) / 2),
                           col=col, mat=tr))

    # Closed strings either side, following the pitch.
    pitch = math.atan2(top - base, run)
    slope_len = math.hypot(run, top - base)
    for sx in (x0 - 0.025, x1 + 0.025):
        # Dropped so the raked string's top corner stays under the landing
        # slab rather than spearing up through the floor above.
        s = g.box("string", (0.05, slope_len, 0.30),
                  loc=(sx, y0 + run / 2, base + (top - base) / 2 - 0.15),
                  col=col, mat=tr)
        s.rotation_euler = (pitch, 0, 0)
        parts.append(s)

    # Solid skirt under the flight, so it does not read as a floating ladder.
    parts.append(g.prism("under", [(y0, base), (y1, base), (y1, top - 0.30)],
                         width, loc=(x0, 0, 0), rot=(math.pi / 2, 0, math.pi / 2),
                         col=col, mat=tr))

    flight = g.join(parts, "flight", col)
    g.bevel_object(flight, 0.002, 2)

    rails = []
    sides = {"east": [x1], "west": [x0], "both": [x0, x1]}.get(balustrade, [])
    for sx in sides:
        rails += _balustrade(sx, y0, y1, base, top, steps, col, mats, trim)
    rail = g.join(rails, "balustrade", col) if rails else None
    if rail:
        g.bevel_object(rail, 0.0015, 2)
    return flight, rail


def _balustrade(x, y0, y1, base, top, steps, col, mats, trim):
    """Newels, spindles and a raked handrail up one side of a flight."""
    tr = mats[trim]
    parts = []
    run = y1 - y0
    rise = (top - base) / steps
    going = run / steps
    pitch = math.atan2(top - base, run)
    H = 0.95                                   # handrail height above nosing

    for ny, nz in ((y0, base), (y1, top)):
        parts.append(g.box("newel", (0.09, 0.09, H + 0.30),
                           loc=(x, ny, nz + (H + 0.30) / 2 - 0.15), col=col, mat=tr, bevel=0.006))

    # Two spindles per tread is the usual spacing.
    for i in range(steps):
        for f in (0.28, 0.72):
            y = y0 + (i + f) * going
            z = base + (i + f) * rise
            h = H - 0.04
            parts.append(g.box("spindle", (0.032, 0.032, h),
                               loc=(x, y, z + h / 2), col=col, mat=tr))

    length = math.hypot(run, top - base)
    rail = g.bar("handrail",
                 [(-0.032, 0.0), (0.032, 0.0), (0.032, 0.045), (0.020, 0.062), (-0.020, 0.062), (-0.032, 0.045)],
                 length, loc=(x, y0, base + H), rot=(0, 0, math.pi / 2), col=col, mat=tr)
    rail.rotation_euler = (0, -pitch, math.pi / 2)
    parts.append(rail)
    return parts


def landing_rail(points, z, col, mats, trim="trim_white", height=0.95):
    """A level balustrade round the open side of a stairwell."""
    tr = mats[trim]
    parts = []
    for a, b in zip(points[:-1], points[1:]):
        a, b = Vector(a), Vector(b)
        d = b - a
        n = d.length
        ang = math.atan2(d.y, d.x)
        parts.append(g.box("newel", (0.09, 0.09, height + 0.05),
                           loc=(a.x, a.y, z + (height + 0.05) / 2), col=col, mat=tr, bevel=0.006))
        count = max(2, int(n / 0.115))
        for i in range(1, count):
            t = i / count
            p = a + d * t
            parts.append(g.box("spindle", (0.032, 0.032, height - 0.04),
                               loc=(p.x, p.y, z + (height - 0.04) / 2), col=col, mat=tr))
        parts.append(g.bar("handrail",
                           [(-0.032, 0.0), (0.032, 0.0), (0.032, 0.045), (0.020, 0.062),
                            (-0.020, 0.062), (-0.032, 0.045)],
                           n, loc=(a.x, a.y, z + height), rot=(0, 0, ang), col=col, mat=tr))
    last = Vector(points[-1])
    parts.append(g.box("newel", (0.09, 0.09, height + 0.05),
                       loc=(last.x, last.y, z + (height + 0.05) / 2), col=col, mat=tr, bevel=0.006))
    obj = g.join(parts, "landing_rail", col)
    g.bevel_object(obj, 0.0015, 2)
    return obj


# ---------------------------------------------------------------------
# Roof
# ---------------------------------------------------------------------

def gable_roof(x0, x1, y0, y1, eaves, ridge, col, mats, overhang=0.5,
               thickness=0.24, ridge_axis="x", rooflights=None):
    """Two slopes on a ridge, closed by triangular gable walls, with fascia
    and soffit at the eaves and optional rooflights cut into the pitches."""
    parts = []
    cover = mats["roof_tile"]
    trim = mats["trim_white"]

    along_x = ridge_axis == "x"
    span_half = (y1 - y0) / 2 if along_x else (x1 - x0) / 2
    length = (x1 - x0) if along_x else (y1 - y0)
    cy = (y0 + y1) / 2
    cx = (x0 + x1) / 2
    pitch = math.atan2(ridge - eaves, span_half)
    reach = span_half + overhang
    slope_len = reach / math.cos(pitch)

    slabs = []
    for sign in (-1, 1):
        mid = sign * reach / 2
        h = ridge - (reach / 2) * math.tan(pitch)
        if along_x:
            s = g.box("pitch", (length + overhang * 2, slope_len, thickness),
                      loc=(cx, cy + mid, h), col=col, mat=cover)
            s.rotation_euler = (-sign * pitch, 0, 0)
        else:
            s = g.box("pitch", (slope_len, length + overhang * 2, thickness),
                      loc=(cx + mid, cy, h), col=col, mat=cover)
            s.rotation_euler = (0, sign * pitch, 0)
        slabs.append(s)

    # Gable walls close the two ENDS OF THE RIDGE, not the eaves: a ridge
    # running along X is gabled at x0 and x1, and its triangles span Y.
    if along_x:
        tri = [(y0, eaves), (y1, eaves), (cy, ridge)]
        ends, rot = (x0, x1), (math.pi / 2, 0, math.pi / 2)
    else:
        tri = [(x0, eaves), (x1, eaves), (cx, ridge)]
        ends, rot = (y0, y1), (math.pi / 2, 0, 0)

    for end in ends:
        gw = g.prism("gable", tri, 0.30, col=col, mat=mats["render_ext"])
        gw.rotation_euler = rot
        inset = 0.15 if end == ends[0] else -0.15
        gw.location = (end + inset, 0, 0) if along_x else (0, end + inset, 0)
        parts.append(gw)

    # Fascia and soffit at both eaves.
    for sign in (-1, 1):
        if along_x:
            ey = cy + sign * reach
            ez = eaves - overhang * math.tan(pitch)
            parts.append(g.box("fascia", (length + overhang * 2, 0.032, 0.22),
                               loc=(cx, ey, ez - 0.11), col=col, mat=trim))
            parts.append(g.box("soffit", (length + overhang * 2, overhang, 0.020),
                               loc=(cx, ey - sign * overhang / 2, ez - 0.22), col=col, mat=trim))
        else:
            ex = cx + sign * reach
            ez = eaves - overhang * math.tan(pitch)
            parts.append(g.box("fascia", (0.032, length + overhang * 2, 0.22),
                               loc=(ex, cy, ez - 0.11), col=col, mat=trim))
            parts.append(g.box("soffit", (overhang, length + overhang * 2, 0.020),
                               loc=(ex - sign * overhang / 2, cy, ez - 0.22), col=col, mat=trim))

    # Ridge capping, running the length of the ridge.
    cap = (length + overhang * 2, 0.20, 0.10) if along_x else (0.20, length + overhang * 2, 0.10)
    parts.append(g.box("ridge", cap, loc=(cx, cy, ridge + 0.06), col=col,
                       mat=cover, bevel=0.02))

    glazing = []
    cutters = []
    for rl in rooflights or []:
        made, glass, cutter = _rooflight(rl, slabs, cx, cy, eaves, ridge, span_half,
                                         pitch, along_x, col, mats)
        parts += made
        glazing.append(glass)
        cutters.append(cutter)

    # Resolve the cuts into real geometry before merging the pitches.
    for s in slabs:
        g.apply_modifiers(s)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)

    roof = g.join(slabs + parts, "roof", col)
    return roof, glazing


def _rooflight(rl, slabs, cx, cy, eaves, ridge, span_half, pitch, along_x, col, mats):
    """Cut a hole through the pitch and set a framed light into it."""
    pos, width, height, side = rl["at"], rl["w"], rl["h"], rl.get("side", 1)
    d = rl["from_ridge"]
    z = ridge - (d / span_half) * (ridge - eaves)

    if along_x:
        loc = (pos, cy + side * d, z)
        rot = (-side * pitch, 0, 0)
    else:
        loc = (cx + side * d, pos, z)
        rot = (0, side * pitch, 0)

    # Deep enough to pass through the pitch, short enough not to reach the
    # opposite one across the ridge.
    cutter = g.box("rl_cut", (width, height, 0.9), loc=loc, rot=rot, col=col)
    for s in slabs:
        m = s.modifiers.new("rooflight", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = cutter
        m.solver = "EXACT"
    frame = []
    t = mats["black_metal"]
    for dx, dy, sx, sy in [(0, (height + 0.09) / 2, width + 0.18, 0.09),
                           (0, -(height + 0.09) / 2, width + 0.18, 0.09),
                           ((width + 0.09) / 2, 0, 0.09, height), (-(width + 0.09) / 2, 0, 0.09, height)]:
        f = g.box("rl_frame", (sx, sy, 0.34), loc=(dx, dy, 0), col=col, mat=t)
        f.parent = cutter
        frame.append(f)
    glass = g.box("rl_glass", (width - 0.02, height - 0.02, 0.02), loc=loc, rot=rot,
                  col=col, mat=mats["glass"])

    # Bake the frame parts into world space around the cutter's transform.
    placed = []
    for f in frame:
        f.parent = None
        f.matrix_basis = g.world_matrix(cutter) @ f.matrix_basis
        placed.append(f)
    return placed, glass, cutter

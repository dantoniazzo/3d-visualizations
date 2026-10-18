# sweep.py: every opening part of a piece swept from shut to open, against the parts of its own piece that stay put —
# the offline sweep ../furnishing.md asks a builder for, before a piece is exported or placed (../furniture-data.md;
# ../../visitor-interactions/opening-parts.md). It builds each piece from blender/export_furniture.py's PIECES as
# `npm run furniture` would, before join_piece, and samples each part's faces every 2 cm through `--steps` poses shut to open
# (a hinge about its marker's axis: z, or the marker's x where it says `axis`; a slide along its x), against every part
# that stays put, each as its own box as it was built (PLANES=1: a box-like part of 40 faces or fewer by its own planes,
# so a board cut by a wall or a slant is not its box round it).
#   PLANES=1 <blender> --background --python <skill>/models/sweep.py -- [--tol 0.002] [--steps 18] <piece-id> ...
# Prints `CLASH <id> <type> <label> at <pivot> <mm> mm at t <share> point <x, y, z> in <part>` for each part that passes
# more than --tol into another, `SWEPT <id> parts <n> static <n> clashes <n>` a piece, and `TOTAL clashes N`.
# Coordinates are Blender's (x, y = the app's −z, z up). An id `uback-<scheme>` sweeps a U kitchen's back leg alone in
# its own frame (Ladonia's ladonia.py: _corner_scheme, _base_units). Ladonia's 33 storage pieces took 23 s; it found the
# U's fridge door in the back leg's worktop (8.9 mm), the vanity's drawer through its counter (3.4 mm) and the fridge's
# bins in its shelves, and with every part swung the wrong way it caught 12 of 12. The repo is four folders above this
# file (or REPO=<dir>); it writes nothing.
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO = os.environ.get("REPO") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "blender"))
args = sys.argv[sys.argv.index("--") + 1:]


def opt(name, default):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


tol = float(opt("--tol", "0.002"))
steps = int(opt("--steps", "18"))
src = open(os.path.join(REPO, "blender", "export_furniture.py")).read()
assert "\nmain()\n" in src, "export_furniture.py no longer ends in main(): change how sweep.py loads it"
src = src.replace("\nmain()\n", "\n")
ns = {"__file__": os.path.join(REPO, "blender", "export_furniture.py"), "__name__": "sweep"}
exec(compile(src, "export_furniture.py", "exec"), ns)
g, PIECES, fresh, m = ns["g"], ns["PIECES"], ns["fresh"], ns["m"]
total = 0
for pid in args:
    fresh()
    mats = m.library()
    col = g.collection("piece")
    LD = ns["LD"]
    if pid.startswith("uback-") and hasattr(LD, "_corner_scheme"):
        # The U's back leg alone, in its own frame (before it is turned onto the slant).
        s_ = LD._corner_scheme(pid.split("-")[1])
        ox = -0.0999
        objs = LD._base_units(col, mats, s_, [("door", -1.2, ox - 0.3), ("oven", ox - 0.3, ox + 0.3), ("drawers", ox + 0.3, 1.2)])
    else:
        entry = next((p for p in PIECES if p[0] == pid), None)
        if entry is None:
            print(f"NO PIECE {pid} in export_furniture.py's PIECES")
            continue
        objs = [o for o in entry[3](col, mats) if o is not None]
    markers = [o for o in objs if o.type == "EMPTY" and "opens" in o]
    static = [o for o in objs if o.type == "MESH" and o.get("unit") is None]
    boxes = []
    for o in static:
        lo, hi = g.bounds(o)
        boxes.append(([lo.x, lo.y, lo.z], [hi.x, hi.y, hi.z], o.name))
    PLANES = {}
    if os.environ.get("PLANES"):
        for o in static:
            if len(o.data.polygons) > 40:
                continue                    # not a box: a bowl, a trap, a tap
            w_ = g.world_matrix(o)
            nrm, ds = [], []
            for poly in o.data.polygons:
                n_ = (w_.to_3x3() @ poly.normal).normalized()
                c_ = w_ @ poly.center
                nrm.append([n_.x, n_.y, n_.z])
                ds.append(n_.dot(c_))
            PLANES[o.name] = (np.array(nrm), np.array(ds))
    LO = np.array([b[0] for b in boxes])
    HI = np.array([b[1] for b in boxes])
    clashes = 0
    for mk in markers:
        opens = mk["opens"].to_dict()
        mw = g.world_matrix(mk)
        pivot = mw.to_translation()
        leaf = [o for o in objs if o.type == "MESH" and o.get("unit") == mk["unit"]]
        pts = []
        for o in leaf:
            w = g.world_matrix(o)
            for poly in o.data.polygons:
                vs = [w @ o.data.vertices[i].co for i in poly.vertices]
                for a in range(1, len(vs) - 1):
                    A, B, C = vs[0], vs[a], vs[a + 1]
                    n = max(1, int(max((B - A).length, (C - A).length) / 0.02))
                    for i in range(n + 1):
                        for j in range(n + 1 - i):
                            pts.append(A + (B - A) * (i / n) + (C - A) * (j / n))
        P = np.unique(np.round(np.array([[*q, 1.0] for q in pts]), 4), axis=0)
        worst = None
        for k in range(steps + 1):
            t = k / steps
            if opens["type"] == "slide":
                d = (mw.to_3x3() @ Vector((1, 0, 0))).normalized()
                M = Matrix.Translation(d * opens["distance"] * t)
            else:
                axis = (mw.to_3x3() @ Vector((1, 0, 0))).normalized() if mk.get("axis") else Vector((0, 0, 1))
                M = Matrix.Translation(pivot) @ Matrix.Rotation(opens["angle"] * t, 4, axis) @ Matrix.Translation(-pivot)
            W = (P @ np.array(M).T)[:, :3]
            near = np.all((LO < W.max(axis=0) + 0.01) & (HI > W.min(axis=0) - 0.01), axis=1)
            if not near.any():
                continue
            lo, hi, idx = LO[near], HI[near], np.nonzero(near)[0]
            dd = np.minimum(W[:, None, :] - lo[None], hi[None] - W[:, None, :]).min(axis=2)
            if PLANES:
                # A box-like part (convex: a board, a block, one cut by a wall) by its own faces, not its box round it.
                for jj in range(len(idx)):
                    planes = PLANES.get(boxes[idx[jj]][2])
                    if planes is None:
                        continue
                    N, D = planes
                    dd[:, jj] = np.minimum(dd[:, jj], (D[None, :] - W @ N.T).min(axis=1))
            i, j = np.unravel_index(np.argmax(dd), dd.shape)
            if dd[i, j] > tol and (worst is None or dd[i, j] > worst[0]):
                worst = (float(dd[i, j]), t, tuple(round(float(v), 3) for v in W[i]), boxes[idx[j]][2])
        name = f"{opens['type']} {opens.get('label', '-')} at {tuple(round(v, 3) for v in pivot)}"
        if worst:
            clashes += 1
            print(f"CLASH {pid} {name:46s} {worst[0] * 1000:6.1f} mm at t {worst[1]:.2f} point {worst[2]} in {worst[3]}")
    total += clashes
    print(f"SWEPT {pid:28s} parts {len(markers):3d} static {len(static):4d} clashes {clashes}")
print(f"TOTAL clashes {total}")

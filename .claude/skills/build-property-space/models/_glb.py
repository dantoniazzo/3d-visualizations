# Shared by the measurement scripts in this folder; runs inside Blender, never
# on its own. Finds a GLB, imports it, and splits it into parts.
#
# A *part* is one connected piece of surface after coincident vertices are
# welded (glTF splits vertices at UV seams and hard edges): a pillow, a
# cushion, a leg, a door front. Parts are numbered in a fixed order (objects
# by name, then faces in order), so `#12` printed by one script names the
# same part in every other script run on the same GLB.
#
# Coordinates are Blender's after the glTF import, in metres: x is the app's
# x, y is the app's -z (Blender +Y is glTF -Z), z is up (the app's y). A
# catalogue piece modelled with its front to +Y faces north (-z) in the app
# at rotation 0, so for those pieces -Y is the back (glTF +Z).
#
# Every script takes the same first arguments after Blender's `--`:
#   <glb>            a path to a .glb, or a catalogue id (ld-bed)
#   --glb-dir DIR    look ids up as DIR/<id>.glb (a Blender copy's glb/)
#   --mat a,b*       only parts with one of these materials (shell globs)
#   --part 3,7       only these part numbers
#   --box x0,x1,y0,y1,z0,z1   only parts whose centre is inside
# Without --glb-dir an id is looked up in the repo's catalogue. The repo is
# four folders above this one, or $REPO.
import argparse
import contextlib
import fnmatch
import json
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("REPO") or os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
WELD = 2e-5


def parser(doc):
    """An argument parser with the shared arguments; add your own, then parse()."""
    caller = sys._getframe(1).f_globals.get("__file__") or "script"
    p = argparse.ArgumentParser(prog=os.path.basename(caller), description=doc)
    p.add_argument("glb", help="a .glb path, or a catalogue id")
    p.add_argument("--glb-dir", help="look ids up as DIR/<id>.glb instead of in the repo's catalogue")
    p.add_argument("--mat", help="only parts with one of these materials (comma list, shell globs)")
    p.add_argument("--part", help="only these part numbers (comma list)")
    p.add_argument("--box", help="only parts whose centre is in x0,x1,y0,y1,z0,z1")
    return p


def parse(p, signed=()):
    """Parse what follows Blender's `--`. `--box` and the options named in
    `signed` take values that may start with a dash (`--box -1,0,...`,
    `--back -y`), which argparse would read as an option: they are joined to
    them first (`--box=-1,0,...`)."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    joined = {"--box", *signed}
    out, i = [], 0
    while i < len(argv):
        if argv[i] in joined and i + 1 < len(argv):
            out.append(f"{argv[i]}={argv[i + 1]}")
            i += 2
        else:
            out.append(argv[i])
            i += 1
    return p.parse_args(out)


def resolve(ref, glb_dir=None):
    """A .glb path as given, or a catalogue id's GLB."""
    if ref.endswith(".glb") or os.path.isfile(ref):
        path = os.path.abspath(ref)
    elif glb_dir:
        path = os.path.join(glb_dir, ref + ".glb")
    else:
        path = os.path.join(REPO, "public", "models", "furniture", ref + ".glb")
        try:
            with open(os.path.join(REPO, "public", "models", "furniture", "catalog.json")) as f:
                item = next((i for i in json.load(f)["items"] if i["id"] == ref), None)
            if item:
                path = os.path.join(REPO, "public", item["url"].lstrip("/"))
        except (OSError, ValueError, KeyError):
            pass
    if not os.path.isfile(path):
        sys.exit(f"no GLB at {path}")
    return path


@contextlib.contextmanager
def quiet():
    """Silence Blender's own stdout (importer and render chatter)."""
    sys.stdout.flush()
    saved = os.dup(1)
    null = os.open(os.devnull, os.O_WRONLY)
    os.dup2(null, 1)
    os.close(null)
    try:
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved, 1)
        os.close(saved)


def clear():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.lights, bpy.data.cameras):
        for x in list(coll):
            coll.remove(x)


def import_glb(path):
    """Import into an empty scene; returns the mesh objects, by name."""
    clear()
    with quiet():
        bpy.ops.import_scene.gltf(filepath=path)
    return sorted((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: o.name)


def mat_name(m):
    return re.sub(r"\.\d{3}$", "", m.name) if m else "-"


class Part:
    """One welded, connected piece of surface, in world coordinates."""

    def __init__(self, index, obj, verts, faces, face_mats, face_src, closed):
        self.index = index
        self.obj = obj                  # source object's name
        self.verts = verts              # [Vector]
        self.faces = faces              # [[vertex index]]
        self.face_mats = face_mats      # material name per face
        self.face_src = face_src        # source polygon index per face
        self.closed = closed            # every edge has exactly two faces
        P = np.array([tuple(v) for v in verts])
        self.lo = Vector(P.min(0))
        self.hi = Vector(P.max(0))
        self.c = Vector(P.mean(0))
        self.size = self.hi - self.lo
        self._tris = None
        self._bvh = None
        areas = {}
        for m, a in zip(face_mats, self._face_areas()):
            areas[m] = areas.get(m, 0.0) + a
        self.area = sum(areas.values())
        self.mats = sorted(areas, key=lambda m: -areas[m])   # dominant first

    def _face_areas(self):
        out = []
        for f in self.faces:
            a = self.verts[f[0]]
            out.append(sum(((self.verts[f[k]] - a).cross(self.verts[f[k + 1]] - a)).length / 2
                           for k in range(1, len(f) - 1)))
        return out

    @property
    def mat(self):
        return self.mats[0]

    @property
    def tris(self):
        """(T, 3, 3) array of triangles (fan-split faces)."""
        if self._tris is None:
            t = [(self.verts[f[0]], self.verts[f[k]], self.verts[f[k + 1]])
                 for f in self.faces for k in range(1, len(f) - 1)]
            self._tris = np.array([[tuple(v) for v in tri] for tri in t]).reshape(-1, 3, 3)
        return self._tris

    @property
    def bvh(self):
        if self._bvh is None:
            self._bvh = BVHTree.FromPolygons(self.verts, self.faces)
        return self._bvh

    def label(self):
        m = "/".join(self.mats[:3]) + ("/…" if len(self.mats) > 3 else "")
        return (f"#{self.index} {m} c=({self.c.x:+.3f},{self.c.y:+.3f},{self.c.z:+.3f}) "
                f"{self.size.x * 100:.0f}x{self.size.y * 100:.0f}x{self.size.z * 100:.0f} cm")


class Model:
    def __init__(self, path):
        self.path = path
        self.objects = import_glb(path)
        self.parts = []
        for o in self.objects:
            self._split(o)
        P = [p for p in self.parts]
        self.lo = Vector([min(p.lo[k] for p in P) for k in range(3)]) if P else Vector()
        self.hi = Vector([max(p.hi[k] for p in P) for k in range(3)]) if P else Vector()

    def _split(self, o):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        src = bm.faces.layers.int.new("src")
        for f in bm.faces:
            f[src] = f.index
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=WELD)
        bm.faces.ensure_lookup_table()
        mats = [mat_name(m) for m in o.data.materials] or ["-"]
        seen = set()
        for f0 in bm.faces:
            if f0.index in seen:
                continue
            stack, comp = [f0], []
            seen.add(f0.index)
            while stack:
                f = stack.pop()
                comp.append(f)
                for e in f.edges:
                    for g in e.link_faces:
                        if g.index not in seen:
                            seen.add(g.index)
                            stack.append(g)
            comp.sort(key=lambda f: f.index)
            vs = sorted({v for f in comp for v in f.verts}, key=lambda v: v.index)
            idx = {v: i for i, v in enumerate(vs)}
            closed = all(len(e.link_faces) == 2 for f in comp for e in f.edges)
            self.parts.append(Part(
                len(self.parts), o.name, [v.co.copy() for v in vs],
                [[idx[v] for v in f.verts] for f in comp],
                [mats[f.material_index] if f.material_index < len(mats) else "-" for f in comp],
                [f[src] for f in comp], closed))
        bm.free()

    def select(self, args):
        """The parts the shared filters (--mat, --part, --box) let through."""
        out = self.parts
        if getattr(args, "mat", None):
            pats = [s.strip() for s in args.mat.split(",") if s.strip()]
            out = [p for p in out if any(fnmatch.fnmatchcase(m, q) for m in p.mats for q in pats)]
        if getattr(args, "part", None):
            want = {int(s) for s in args.part.split(",") if s.strip()}
            out = [p for p in out if p.index in want]
        if getattr(args, "box", None):
            b = [float(s) for s in args.box.split(",")]
            out = [p for p in out if b[0] <= p.c.x <= b[1] and b[2] <= p.c.y <= b[3] and b[4] <= p.c.z <= b[5]]
        return out

    def header(self, tool):
        print(f"{tool} {os.path.relpath(self.path, REPO) if self.path.startswith(REPO) else self.path}: "
              f"{len(self.parts)} parts, bounds x {self.lo.x:+.3f}..{self.hi.x:+.3f} "
              f"y {self.lo.y:+.3f}..{self.hi.y:+.3f} z {self.lo.z:.3f}..{self.hi.z:.3f}")


def surface_axes(tris):
    """Area-weighted principal axes of a surface: (centre, eigenvalues
    ascending, eigenvectors as columns). Column 0 is the thin axis of a
    plate-like part, column 2 its long axis. None for a surface of no area."""
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2
    A = area.sum()
    if A <= 0:
        return None
    s = a + b + c
    mean = (area[:, None] * s).sum(0) / (3 * A)
    # Exact second moment of each triangle about the origin: A/12 (sum v v^T + s s^T).
    M = np.einsum("t,tij->ij", area,
                  np.einsum("ti,tj->tij", a, a) + np.einsum("ti,tj->tij", b, b)
                  + np.einsum("ti,tj->tij", c, c) + np.einsum("ti,tj->tij", s, s)) / 12
    cov = M / A - np.outer(mean, mean)
    w, V = np.linalg.eigh(cov)
    return mean, w, V


def extents(verts, axes):
    """(min, max) of the vertices projected on each of the axes (columns)."""
    P = np.array([tuple(v) for v in verts]) @ axes
    return P.min(0), P.max(0)


def inside(bvh, p):
    """Is p inside a closed surface? Ray parity along two skewed rays, which
    must agree."""
    for d in (Vector((0.0007, 0.0013, 1)).normalized(), Vector((1, 0.0013, 0.0007)).normalized()):
        n, o = 0, p.copy()
        for _ in range(64):
            hit = bvh.ray_cast(o, d)
            if hit[0] is None:
                break
            n += 1
            o = hit[0] + d * 1e-5
        if n % 2 == 0:
            return False
    return True


def verdict(level, text):
    """The script's last line: VERDICT OK|WARN|FAIL: text."""
    print(f"VERDICT {level}: {text}")

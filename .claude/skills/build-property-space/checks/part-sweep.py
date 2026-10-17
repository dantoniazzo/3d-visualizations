"""part-sweep.py: every opening part of every placed piece in a scene swept shut to open, against the other pieces
(their catalogue boxes, as placed) and the walls (solid, their openings included), with how far in each part already
was shut (a placement's own overlap) — the scene-wide counterpart of models/sweep.py (app-notes.md, Furniture: opening
parts). The app does the same at run time (Openable.plan stops a part at what is in its way); on Ladonia its hits were
exactly the app's 32 stops (22 kitchen clashes + 10). A placement builder who does not run the app sweeps with this.
    python3 <skill>/checks/part-sweep.py <scene.json> [<glb-dir>] [<fallback-glb-dir>] [--steps 18] [--tol 0.005] [--only prefix,...]
Parts come from the GLBs: each node with extras.opens (as join_piece writes them: the hinge at the node's translation,
in the piece's frame, unrotated), its surface sampled every 2 cm. A GLB is looked for in <glb-dir> (a Blender copy's
glb/, say) then <fallback-glb-dir> (default the repo's public/models/furniture, whose catalog.json gives the sizes).
--only keeps the pieces whose catalogue id starts with one of the prefixes. Prints `CLASH <placement> <catalogue id>
<part> <label> <mm> mm at t <share> (shut <mm>) into <what>` and `PARTS <n> CLASHES <n>`. Ladonia: 5 min 15 s for all
its parts. Read-only; the repo is four folders above this file (or REPO=<dir>)."""
import json, math, os, struct, sys
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
def opt(name, default):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
steps = int(opt("--steps", "18")); tol = float(opt("--tol", "0.005")); only = [p for p in opt("--only", "").split(",") if p]
REPO = os.environ.get("REPO") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
if not args:
    sys.exit(__doc__)
scene_path = args[0]
fallback = args[2] if len(args) > 2 else os.path.join(REPO, "public", "models", "furniture")
glb_dir = args[1] if len(args) > 1 else fallback
with open(scene_path) as f:
    scene = json.load(f)
scene = scene.get("scene", scene)
cat = {i["id"]: i for i in json.load(open(os.path.join(fallback, "catalog.json")))["items"]}

def glb(id_):
    """The GLB's JSON, with its binary chunk as "_bin"."""
    for d in (glb_dir, fallback):
        p = os.path.join(d, id_ + ".glb")
        if os.path.exists(p):
            b = open(p, "rb").read()
            n = struct.unpack("<I", b[12:16])[0]
            g = json.loads(b[20:20 + n])
            off = 20 + n
            m = struct.unpack("<I", b[off:off + 4])[0]
            g["_bin"] = b[off + 8:off + 8 + m]
            return g
    return None


def read(g, index, comps):
    a = g["accessors"][index]
    v = g["bufferViews"][a["bufferView"]]
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    kind = {5126: ("f", 4), 5123: ("H", 2), 5125: ("I", 4), 5121: ("B", 1)}[a["componentType"]]
    stride = v.get("byteStride", kind[1] * comps)
    dt = np.dtype("<" + kind[0])
    if stride == kind[1] * comps:
        return np.frombuffer(g["_bin"], dtype=dt, count=a["count"] * comps, offset=start).reshape(-1, comps).astype(float)
    out = np.empty((a["count"], comps))
    for i in range(a["count"]):
        out[i] = struct.unpack_from("<" + kind[0] * comps, g["_bin"], start + i * stride)
    return out


def surface_points(g, mesh, step=0.02):
    """Points over a mesh's triangles, about every `step` metres."""
    pts = []
    for pr in g["meshes"][mesh]["primitives"]:
        P = read(g, pr["attributes"]["POSITION"], 3)
        I = read(g, pr["indices"], 1).astype(int).ravel() if "indices" in pr else np.arange(len(P))
        for t in range(0, len(I), 3):
            A, B, C = P[I[t]], P[I[t + 1]], P[I[t + 2]]
            n = max(1, int(max(np.linalg.norm(B - A), np.linalg.norm(C - A)) / step))
            for i in range(n + 1):
                for j in range(n + 1 - i):
                    pts.append(A + (B - A) * (i / n) + (C - A) * (j / n))
    return np.unique(np.round(np.array(pts), 4), axis=0)

def parts_of(id_):
    g = glb(id_)
    if not g: return []
    out = []
    for n in g["nodes"]:
        o = (n.get("extras") or {}).get("opens")
        if not o or n.get("mesh") is None: continue
        lo, hi = np.array([1e9] * 3), np.array([-1e9] * 3)
        for pr in g["meshes"][n["mesh"]]["primitives"]:
            a = g["accessors"][pr["attributes"]["POSITION"]]
            lo = np.minimum(lo, a["min"]); hi = np.maximum(hi, a["max"])
        out.append({"name": n["name"], "opens": o, "at": np.array(n.get("translation", [0, 0, 0])), "lo": lo, "hi": hi,
                    "pts": surface_points(g, n["mesh"])})
    return out

def roty(deg):
    t = math.radians(deg); c, s = math.cos(t), math.sin(t)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

def face_points(lo, hi, n=5):
    xs, ys, zs = (np.linspace(lo[k], hi[k], n) for k in range(3))
    pts = []
    for X in (lo[0], hi[0]):
        for y in ys:
            for z in zs: pts.append((X, y, z))
    for Y in (lo[1], hi[1]):
        for x in xs:
            for z in zs: pts.append((x, Y, z))
    for Z in (lo[2], hi[2]):
        for x in xs:
            for y in ys: pts.append((x, y, Z))
    return np.array(pts)

# Obstacles: (name, centre, axes R (3x3, columns = local axes in world), half sizes)
obstacles = []
for f in scene["furniture"]:
    c = cat.get(f["catalog_id"])
    if not c: continue
    w, h, d = [v * f.get("scale", 1) for v in c["size"]]
    if h < 0.035: continue
    R = roty(f.get("rotation", 0) + c.get("yaw", 0))
    p = np.array(f["position"], float)
    obstacles.append((f["id"] + " " + f["catalog_id"], p + R @ np.array([0, h / 2, 0]), R, np.array([w / 2, h / 2, d / 2]), f["id"]))
for wl in scene["walls"]:
    (x0, z0), (x1, z1) = wl["start"], wl["end"]
    L = math.hypot(x1 - x0, z1 - z0)
    if L < 1e-6: continue
    u = np.array([(x1 - x0) / L, 0, (z1 - z0) / L]); v = np.array([-u[2], 0, u[0]])
    R = np.stack([u, np.array([0, 1, 0]), v], axis=1)
    centre = np.array([(x0 + x1) / 2, wl["base_height"] + wl["height"] / 2, (z0 + z1) / 2])
    obstacles.append(("wall " + wl["id"], centre, R, np.array([L / 2, wl["height"] / 2, wl["thickness"] / 2]), None))

def inside(pts, ob):
    _, c, R, half, _ = ob
    local = (pts - c) @ R
    pen = (half[None, :] - np.abs(local)).min(axis=1)
    return pen

count = clashes = 0
for f in scene["furniture"]:
    if only and not any(f["catalog_id"].startswith(p) for p in only): continue
    parts = parts_of(f["catalog_id"])
    if not parts: continue
    R = roty(f.get("rotation", 0) + cat[f["catalog_id"]].get("yaw", 0)); P = np.array(f["position"], float)
    for part in parts:
        count += 1
        o = part["opens"]; pts0 = part["pts"]
        worst = None
        # Only what is within its reach: the piece's position, the hinge and
        # the part's size round it.
        reach = np.linalg.norm(np.abs(pts0).max(axis=0)) + np.linalg.norm(part["at"]) + 0.6
        near = [ob for ob in obstacles if ob[4] != f["id"] and np.linalg.norm(ob[1] - P) < reach + np.linalg.norm(ob[3])]
        for k in range(steps + 1):
            t = k / steps
            if o["type"] == "slide":
                local = pts0 + part["at"] + np.array(o["direction"]) * o["distance"] * t
            else:
                ax = np.array(o.get("axis", [0, 1, 0]), float); ax /= np.linalg.norm(ax)
                a = o["angle"] * t; K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
                Rot = np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K
                local = pts0 @ Rot.T + part["at"]
            world = local @ R.T + P
            for ob in near:
                pen = inside(world, ob).max()
                if pen > tol and (worst is None or pen > worst[0]):
                    worst = (pen, t, ob[0])
        if worst:
            clashes += 1
            # How far in it was shut (a placement's own overlap), against the same obstacle.
            ob = next(b for b in obstacles if b[0] == worst[2])
            shut = inside((pts0 + part["at"]) @ R.T + P, ob).max()
            print(f"CLASH {f['id']:7s} {f['catalog_id']:24s} {part['name'].split('.')[-1]:8s} {o.get('label','-'):18s} {worst[0]*1000:7.1f} mm at t {worst[1]:.2f} (shut {max(shut, 0)*1000:5.1f}) into {worst[2]}")
print(f"PARTS {count} CLASHES {clashes}")

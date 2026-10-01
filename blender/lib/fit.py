"""Fitting a cage to a reference surface — the retopology step of car
modelling: the modeller lays an even quad cage following the car's lines,
then shrinkwraps it onto the scanned or reference surface so each vertex
sits on it, without disturbing the cage's flow.

Here each vertex moves only along its normal (so the rows and columns stay
where the layout put them), onto the first surface a ray finds within
`reach` either side. Where the reference has no skin — an opening, a panel
gap, the far side of a wheel arch — or the hit disagrees with its
neighbours', the vertex keeps no hit of its own and its offset is filled
in from the vertices round it, so the cage spans the hole smoothly.
"""
import math
import statistics

from mathutils import Vector


def vertex_normals(verts, faces, centre=(2450.0, 0.0, 700.0)):
    """Outward vertex normals of a quad mesh of design points, each face's
    Newell normal turned to face away from the car's middle."""
    normals = [Vector() for _ in verts]
    for f in faces:
        pts = [Vector(verts[k]) for k in f]
        n = Vector()
        for a, b in zip(pts, pts[1:] + pts[:1]):
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
        mid = sum(pts, Vector()) / len(pts)
        if n.dot(mid - Vector(centre)) < 0:
            n = -n
        for k in f:
            normals[k] += n
    return [n.normalized() if n.length > 1e-9 else Vector((0, 0, 1)) for n in normals]


def neighbours(n_verts, faces):
    ring = [set() for _ in range(n_verts)]
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            ring[a].add(b)
            ring[b].add(a)
    return ring


def fit(builder, reference, reach=90.0, agree=10.0, keep=(), passes=400, smooth=("Glass",), smoothing=8):
    """Move builder's vertices onto the reference along their normals.

    `keep` are vertex indices left where they are (offset 0, as fixed
    points of the fill). Where the reference's surface is of a material
    named in `smooth` (its glass: thin, doubled, apt to ripple) the offsets
    are smoothed `smoothing` times among themselves. Returns (moved, filled,
    rms offset) for reporting."""
    verts, faces = builder.verts, builder.faces
    normals = vertex_normals(verts, faces)
    ring = neighbours(len(verts), faces)
    offset = [None] * len(verts)
    glassy = set()
    for k, (p, n) in enumerate(zip(verts, normals)):
        if k in keep:
            offset[k] = 0.0
            continue
        if abs(p[1]) < 1e-6:
            n = Vector((n.x, 0.0, n.z)).normalized()
            normals[k] = n
        start = Vector(p) + n * reach
        hit = reference.ray(start, -n, 2 * reach)
        # the surface must face the way the cage does, not be the inside of something
        if hit and abs(hit[1].dot(n)) > 0.25:
            offset[k] = reach - hit[2]
            if any(s in hit[3] for s in smooth):
                glassy.add(k)

    # Outliers: a hit far from what its neighbours found is a hole's floor.
    for _ in range(2):
        rejected = []
        for k, d in enumerate(offset):
            if d is None or k in keep:
                continue
            near = set(ring[k])
            for j in list(near):
                near |= ring[j]
            near.discard(k)
            others = [offset[j] for j in near if offset[j] is not None]
            if len(others) >= 4 and abs(d - statistics.median(others)) > agree:
                rejected.append(k)
        for k in rejected:
            offset[k] = None

    # The holes filled: each missing offset the mean of its neighbours', until settled.
    missing = [k for k, d in enumerate(offset) if d is None]
    value = [d if d is not None else 0.0 for d in offset]
    for _ in range(passes):
        for k in missing:
            ns = ring[k]
            if ns:
                value[k] = sum(value[j] for j in ns) / len(ns)

    for _ in range(smoothing):
        nxt = list(value)
        for k in glassy:
            ns = ring[k]
            if ns:
                nxt[k] = 0.5 * value[k] + 0.5 * sum(value[j] for j in ns) / len(ns)
        value = nxt

    for k, (p, n) in enumerate(zip(verts, normals)):
        q = Vector(p) + n * value[k]
        if abs(p[1]) < 1e-6:
            q.y = 0.0
        verts[k] = (q.x, q.y, q.z)
    hits = [d for d in offset if d is not None]
    rms = math.sqrt(sum(d * d for d in hits) / max(1, len(hits)))
    return len(hits), len(missing), rms

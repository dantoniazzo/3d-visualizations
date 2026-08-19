"""Poly Haven CC0 asset downloading and import.

Poly Haven's public API needs no key or login; it does ask for a real
User-Agent, which is set below. Downloads are cached under blender/cache so a
rebuild is offline and repeatable.

The catalogue is strong on loose furniture, decor and plants and has nothing
usable for modern beds, bathroom sanitaryware or kitchen appliances — those are
scripted in joinery.py instead.
"""

import json
import os
import shutil
import urllib.request
import zipfile

import bpy

from . import geometry as g

API = "https://api.polyhaven.com"
UA = "wrenfield-house-build/1.0 (Blender procedural interior)"
CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache")


def _get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read() if binary else json.loads(r.read())


def files(slug):
    path = os.path.join(CACHE, f"{slug}.files.json")
    if os.path.exists(path):
        return json.load(open(path))
    data = _get(f"{API}/files/{slug}")
    os.makedirs(CACHE, exist_ok=True)
    json.dump(data, open(path, "w"))
    return data


def fetch(slug, res="1k"):
    """Download a model's .blend and its textures. Returns the .blend path."""
    root = os.path.join(CACHE, slug)
    blend = os.path.join(root, f"{slug}.blend")
    if os.path.exists(blend):
        return blend

    meta = files(slug)
    if "blend" not in meta:
        return None
    options = meta["blend"]
    pick = res if res in options else sorted(options)[0]
    entry = options[pick]["blend"]

    os.makedirs(root, exist_ok=True)
    with open(blend, "wb") as f:
        f.write(_get(entry["url"], binary=True))

    # Textures are listed as includes with paths relative to the .blend.
    for rel, info in entry.get("include", {}).items():
        dest = os.path.join(root, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if not os.path.exists(dest):
            with open(dest, "wb") as f:
                f.write(_get(info["url"], binary=True))
    return blend


_imported = {}


def load(slug, res="1k", col=None):
    """Append a model once and return a master object. Later calls to `place`
    make linked copies, so twenty chairs cost one mesh."""
    if slug in _imported:
        return _imported[slug]

    blend = fetch(slug, res)
    if not blend or not os.path.exists(blend):
        print(f"ASSET MISSING {slug}")
        return None

    before = set(bpy.data.objects)
    with bpy.data.libraries.load(blend, link=False) as (src, dst):
        dst.objects = [n for n in src.objects]

    new = [o for o in bpy.data.objects if o not in before] + \
          [o for o in bpy.data.objects if o.name not in {b.name for b in before}]
    new = list({o.name: o for o in new}.values())
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        print(f"ASSET EMPTY {slug}")
        return None

    hidden = g.collection("_assets")
    for o in new:
        if o.name not in {x.name for x in hidden.objects}:
            try:
                g.link(o, hidden)
            except Exception:
                pass

    master = g.join(meshes, f"asset_{slug}", hidden) if len(meshes) > 1 else meshes[0]
    master.name = f"asset_{slug}"
    _imported[slug] = master
    return master


def place(slug, loc, rot_z=0.0, col=None, scale=None, height=None,
          sit_on=None, res="1k", name=None):
    """Drop a linked copy of an asset into the scene."""
    master = load(slug, res)
    if master is None:
        return None
    dup = g.instance(master, loc, rot=(0, 0, rot_z), col=col,
                     name=name or f"{slug}")
    if scale:
        dup.scale = (scale, scale, scale) if not hasattr(scale, "__len__") else scale
    if height:
        g.fit_to(dup, target_height=height)
    if sit_on is not None:
        lo, _ = g.bounds(dup)
        dup.location.z += sit_on - lo.z
    return dup


def hide_masters():
    """Keep the import originals out of the render."""
    col = bpy.data.collections.get("_assets")
    if not col:
        return
    for o in col.objects:
        o.hide_render = True
        o.hide_viewport = True

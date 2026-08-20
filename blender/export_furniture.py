"""Export a starter furniture catalogue as individual GLBs.

The app ships an empty catalogue, so the placement picker and the editor have
nothing to work with out of the box. These come from the same parametric
joinery the house is built from — no downloads, no licence question — each one
built at the origin, centred on its footprint and standing on y = 0, which is
what the placer expects.

    blender --background --python export_furniture.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy

from lib import geometry as g, joinery as j, materials as m
from export_app import bake_tiling_textures, build_box_uvs   # noqa: E402

OUT = os.path.join(REPO, "public", "models", "furniture")


def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras, bpy.data.collections,
                 bpy.data.images):
        for item in list(coll):
            coll.remove(item, do_unlink=True)
    # materials.py memoises by name; those handles now point at datablocks
    # that no longer exist, so the next library() call would hand back
    # dangling references.
    m._cache.clear()


#: id, label, category, builder(collection, materials) -> list of parts
PIECES = [
    ("bed-double", "Double bed", "bedroom",
     lambda c, mats: j.bed(c, mats, 0, 0, 1.55, 2.05)),
    ("bed-single", "Single bed", "bedroom",
     lambda c, mats: j.bed(c, mats, 0, 0, 1.00, 2.00)),
    ("nightstand", "Nightstand", "bedroom",
     lambda c, mats: j.nightstand(c, mats, 0, 0)),
    ("wardrobe", "Wardrobe", "bedroom",
     lambda c, mats: j.wardrobe(c, mats, -0.6, 0.6, 0, -1)),
    ("desk", "Desk", "tables",
     lambda c, mats: j.desk(c, mats, 0, 0)),
    ("shelving", "Shelving unit", "storage",
     lambda c, mats: j.shelving(c, mats, -0.6, 0.6, 0)),
    ("sideboard", "Low sideboard", "storage",
     lambda c, mats: j.shelving(c, mats, -0.8, 0.8, 0, h=0.6, d=0.42, shelves=1)),
    ("vanity", "Basin vanity", "bathroom",
     lambda c, mats: j.vanity(c, mats, 0, 0, w=1.0, d=0.48)),
    ("wc", "WC", "bathroom",
     lambda c, mats: j.wc(c, mats, 0, 0)),
    ("bath", "Bath", "bathroom",
     lambda c, mats: j.bath(c, mats, 0, 0)),
    ("shower", "Shower enclosure", "bathroom",
     lambda c, mats: j.shower(c, mats, -0.5, -0.5, 0.5, 0.5)),
    ("towel-rail", "Heated towel rail", "bathroom",
     lambda c, mats: j.towel_rail(c, mats, 0, 0)),
    ("fridge", "Fridge freezer", "kitchen",
     lambda c, mats: j.fridge(c, mats, 0, 0)),
    ("washing-machine", "Washing machine", "kitchen",
     lambda c, mats: j.washer(c, mats, 0, 0)),
    ("microwave", "Microwave", "kitchen",
     lambda c, mats: j.microwave(c, mats, 0, 0, 0)),
    ("kitchen-run", "Kitchen run, 2.4 m", "kitchen",
     lambda c, mats: j.base_run(c, mats, -1.2, 1.2, 0, -1,
                                modules=[("drawers", 0.6), ("sink", 0.9), ("door", 0.9)])),
    ("kitchen-island", "Kitchen island", "kitchen",
     lambda c, mats: j.island(c, mats, 0, 0, 1.8, 0.9)),
    ("rug", "Rug", "decor",
     lambda c, mats: j.rug(c, mats, 0, 0, 2.4, 1.7)),
]

CATEGORIES = [
    {"id": "seating", "label": "Seating"},
    {"id": "tables", "label": "Tables & desks"},
    {"id": "storage", "label": "Storage"},
    {"id": "bedroom", "label": "Bedroom"},
    {"id": "kitchen", "label": "Kitchen"},
    {"id": "bathroom", "label": "Bathroom"},
    {"id": "lighting", "label": "Lighting"},
    {"id": "decor", "label": "Decor & plants"},
]


def main():
    os.makedirs(OUT, exist_ok=True)
    items = []

    for piece_id, label, category, build in PIECES:
        fresh()
        mats = m.library()
        col = g.collection("piece")

        obj = g.join(build(col, mats), piece_id, col)
        if obj is None:
            print(f"SKIP {piece_id}")
            continue

        # Centre on the footprint and stand it on the floor, so a placement
        # position means "put it here" rather than "put its origin here".
        lo, hi = g.bounds(obj)
        for v in obj.data.vertices:
            v.co.x -= (lo.x + hi.x) / 2
            v.co.y -= (lo.y + hi.y) / 2
            v.co.z -= lo.z
        obj.data.update()

        bake_tiling_textures()

        bpy.ops.export_scene.gltf(
            filepath=os.path.join(OUT, f"{piece_id}.glb"),
            export_format="GLB",
            use_visible=True,
            export_apply=True,
            export_cameras=False,
            export_lights=False,
            export_yup=True,
            export_image_format="WEBP",
            export_image_quality=60,
        )

        size = [round(hi.x - lo.x, 2), round(hi.z - lo.z, 2), round(hi.y - lo.y, 2)]
        kb = os.path.getsize(os.path.join(OUT, f"{piece_id}.glb")) / 1024
        print(f"  {kb:6.0f} KB  {piece_id:18s} {size}")

        items.append({
            "id": piece_id,
            "name": label,
            "category": category,
            "url": f"/models/furniture/{piece_id}.glb",
            "scale": 1,
            "yaw": 0,
            # Reported x, y, z with y up, matching the app's axes.
            "size": size,
            "anchor": "floor",
            "credit": "Built procedurally by blender/export_furniture.py",
            "enabled": True,
        })

    catalog = {
        "$comment": "Generated by blender/export_furniture.py — `npm run furniture`. "
                    "Add your own .glb files here and append entries in the same shape.",
        "categories": CATEGORIES,
        "items": items,
    }
    with open(os.path.join(OUT, "catalog.json"), "w") as f:
        json.dump(catalog, f, indent=4)
    print(f"CATALOG {len(items)} items")


main()

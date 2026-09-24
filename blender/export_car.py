"""Export the drivable car as two GLBs: the body and one wheel.

Built from primitives to the dimensions the app's Car.js drives with, which
is what matters for collision: a 4.5 m saloon, 1.72 m across the body, wheels
0.33 m in radius on a 0.86 m half-track, the front axle 1.55 m ahead of the
body's origin and the rear 1.35 m behind it.

Frames, as the app sees them after glTF's Y-up conversion:
  - body: origin at ride height, 0.45 m above the ground; +Z forward.
  - wheel: centred on its hub, axle along X, the hub cap on the +X face
    (the app turns the left-hand wheels round so every cap faces out).

In Blender, which is Z-up, that makes forward -Y and the ground z = -0.45.

    blender --background --python export_car.py
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import bpy

from lib import geometry as g, materials as m

OUT = os.path.join(REPO, "public", "models")

RIDE_HEIGHT = 0.45
WHEEL_RADIUS = 0.33
WHEEL_WIDTH = 0.24
GROUND = -RIDE_HEIGHT


def fresh():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
                 bpy.data.lights, bpy.data.cameras, bpy.data.collections,
                 bpy.data.images):
        for item in list(coll):
            coll.remove(item, do_unlink=True)
    m._cache.clear()


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_visible=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    print(f"  {os.path.getsize(path) / 1024:6.0f} KB  {os.path.basename(path)}")


def body(col, mats):
    """Lower body, cabin, glazing, bumpers, lamps and mirrors."""
    paint, glass, trim = mats["car_paint"], mats["glass"], mats["trim_charcoal"]
    front, rear = -2.30, 2.20          # Blender -Y is forward
    length = rear - front
    mid = (front + rear) / 2
    w = 1.72
    sill, belt = GROUND + 0.20, 0.30   # underside 0.20 off the road, waistline

    parts = [
        # Lower body, from the sills to the waistline.
        g.box("body", (w, length, belt - sill), loc=(0, mid, (sill + belt) / 2), col=col,
              mat=paint, bevel=0.04),
        # Wheel-arch flares, so the tyres sit under the bodywork.
        g.box("arches_f", (w + 0.16, 1.00, 0.30), loc=(0, -1.55, 0.10), col=col, mat=paint,
              bevel=0.05),
        g.box("arches_r", (w + 0.16, 1.00, 0.30), loc=(0, 1.35, 0.10), col=col, mat=paint,
              bevel=0.05),
        # Cabin, set back from the bonnet.
        g.box("cabin", (w - 0.18, 2.10, 0.56), loc=(0, 0.45, belt + 0.28), col=col, mat=paint,
              bevel=0.06),
        # Screens, raked like a real windscreen and rear window.
        g.box("windscreen", (w - 0.26, 0.02, 0.62), loc=(0, -0.66, belt + 0.26),
              rot=(0.95, 0, 0), col=col, mat=glass),
        g.box("backlight", (w - 0.26, 0.02, 0.58), loc=(0, 1.56, belt + 0.26),
              rot=(-0.95, 0, 0), col=col, mat=glass),
        # Bumpers.
        g.box("bumper_f", (w + 0.04, 0.12, 0.18), loc=(0, front - 0.02, sill + 0.10), col=col,
              mat=trim, bevel=0.03),
        g.box("bumper_r", (w + 0.04, 0.12, 0.18), loc=(0, rear + 0.02, sill + 0.10), col=col,
              mat=trim, bevel=0.03),
        g.box("grille", (0.80, 0.02, 0.12), loc=(0, front - 0.005, belt - 0.12), col=col, mat=trim),
    ]
    # Side windows, one each side.
    for s in (-1, 1):
        parts.append(g.box("side_glass", (0.02, 1.80, 0.34),
                           loc=(s * (w - 0.18) / 2, 0.45, belt + 0.30), col=col, mat=glass))
        parts.append(g.box("mirror", (0.16, 0.10, 0.09),
                           loc=(s * (w / 2 + 0.06), -0.55, belt + 0.08), col=col, mat=trim))
        # Lamps.
        parts.append(g.box("headlamp", (0.36, 0.03, 0.10),
                           loc=(s * 0.62, front - 0.004, belt - 0.08), col=col,
                           mat=mats["lamp_front"]))
        parts.append(g.box("taillamp", (0.34, 0.03, 0.10),
                           loc=(s * 0.62, rear + 0.004, belt - 0.08), col=col,
                           mat=mats["lamp_rear"]))
    return parts


def wheel(col, mats):
    """A tyre with a hub cap on +X and five wheel nuts."""
    axis = (0, math.pi / 2, 0)
    parts = [
        g.cylinder("tyre", WHEEL_RADIUS, WHEEL_WIDTH, rot=axis, col=col, mat=mats["rubber"],
                   segments=28),
        g.cylinder("rim", WHEEL_RADIUS * 0.62, WHEEL_WIDTH + 0.01, rot=axis, col=col,
                   mat=mats["steel"], segments=24),
        g.cylinder("cap", WHEEL_RADIUS * 0.22, 0.03, loc=(WHEEL_WIDTH / 2 + 0.01, 0, 0), rot=axis,
                   col=col, mat=mats["chrome"], segments=16),
    ]
    for i in range(5):
        a = i * 2 * math.pi / 5
        parts.append(g.cylinder("nut", 0.014, 0.02,
                                loc=(WHEEL_WIDTH / 2 + 0.008, math.cos(a) * 0.12, math.sin(a) * 0.12),
                                rot=axis, col=col, mat=mats["chrome"], segments=8))
    return parts


def main():
    os.makedirs(OUT, exist_ok=True)

    fresh()
    mats = m.library()
    col = g.collection("car")
    g.join(body(col, mats), "Chassis", col)
    export(os.path.join(OUT, "car-chassis.glb"))

    fresh()
    mats = m.library()
    col = g.collection("wheel")
    g.join(wheel(col, mats), "wheel", col)
    export(os.path.join(OUT, "car-wheel.glb"))


main()

"""Light the interiors and render a check shot of every room.

    blender --background out/wrenfield_house.blend --python render_shots.py -- [names...]
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy

from lib import geometry as g, render as r, plan as P

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
G, F1, F2 = P.G, P.F1, P.F2

# Ceiling fittings: (x, y, floor level, ceiling height, size, power)
LIGHTS = [
    (3.10, 3.10, G, P.H_G, 2.2, 57), (3.10, 8.60, G, P.H_G, 1.8, 44),
    (7.80, 2.80, G, P.H_G, 1.4, 33), (8.30, 8.20, G, P.H_G, 2.4, 66),
    (12.60, 8.60, G, P.H_G, 2.0, 53), (13.50, 3.00, G, P.H_G, 1.8, 42),
    (10.55, 1.40, G, P.H_G, 0.9, 15),  (10.55, 4.00, G, P.H_G, 0.9, 18),
    (3.10, 8.20, F1, P.H_F1, 2.2, 55), (3.10, 1.70, F1, P.H_F1, 1.8, 42),
    (1.80, 4.50, F1, P.H_F1, 1.1, 24), (4.60, 4.50, F1, P.H_F1, 1.1, 22),
    (7.80, 5.50, F1, P.H_F1, 1.8, 44), (12.60, 2.20, F1, P.H_F1, 2.0, 48),
    (14.50, 1.30, F1, P.H_F1, 1.0, 21), (12.60, 5.40, F1, P.H_F1, 2.0, 48),
    (12.60, 8.60, F1, P.H_F1, 2.2, 55),
    (8.00, 6.40, F2, P.H_F2, 2.2, 51), (10.80, 3.20, F2, P.H_F2, 1.6, 37),
    (4.80, 3.20, F2, P.H_F2, 1.0, 21),
]

SHOTS = {
    "kitchen":  ((6.60, 6.20, G + 1.62), (13.2, 9.6, G + 1.15), 22),
    "island":   ((12.20, 9.60, G + 1.60), (7.4, 7.6, G + 1.05), 26),
    "living":   ((5.55, 6.05, G + 1.60), (1.2, 1.4, G + 1.00), 22),
    "study":    ((5.55, 6.75, G + 1.60), (1.2, 10.3, G + 1.05), 22),
    "snug":     ((11.85, 5.30, G + 1.58), (15.3, 0.8, G + 1.00), 24),
    "hall":     ((9.35, 5.35, G + 1.65), (6.6, 0.8, G + 1.10), 22),
    "utility":  ((9.95, 5.40, G + 1.55), (10.9, 2.6, G + 1.00), 20),
    "bed1":     ((5.60, 10.35, F1 + 1.55), (1.4, 6.4, F1 + 0.95), 22),
    "bed2":     ((5.60, 0.60, F1 + 1.55), (1.2, 2.9, F1 + 0.95), 22),
    "bed3":     ((9.95, 3.95, F1 + 1.55), (14.6, 0.7, F1 + 0.95), 24),
    "bed4":     ((9.95, 6.95, F1 + 1.55), (15.2, 10.3, F1 + 0.95), 24),
    "bath":     ((9.95, 6.35, F1 + 1.58), (15.2, 4.6, F1 + 1.00), 22),
    "ensuite1": ((3.10, 5.65, F1 + 1.58), (0.6, 3.5, F1 + 1.00), 20),
    "landing":  ((7.80, 10.35, F1 + 1.62), (7.9, 1.0, F1 + 1.10), 22),
    "loft":     ((4.00, 8.75, F2 + 1.55), (11.8, 3.2, F2 + 0.95), 22),
    "ext_front": ((-11, -17, 8.5), (8, 5, 4.0), 34),
    "ext_rear":  ((25, 23, 10.0), (8, 5, 4.0), 34),
}


def main():
    r.setup(samples=48)
    sc = bpy.context.scene
    if hasattr(sc.eevee, "shadow_pool_size"):
        sc.eevee.shadow_pool_size = "512"
    lights = g.collection("shot_lights")
    for x, y, base, h, size, power in LIGHTS:
        r.area(f"lamp_{x}_{y}_{base}", (x, y, base + h - 0.12), size=size,
               strength=power, col=lights, colour=(1.0, 0.93, 0.84))

    wanted = ARGS or list(SHOTS)
    for name in wanted:
        loc, look, lens = SHOTS[name]
        cam = r.camera(f"cam_{name}", loc, look, lens=lens, col=lights)
        exterior = name.startswith("ext_")
        bpy.context.scene.view_settings.exposure = 0.0 if exterior else 0.15
        r.shot(os.path.join(HERE, "out", f"{name}.png"), cam,
               samples=48, resolution=(1100, 700))
        print("SHOT", name)


main()

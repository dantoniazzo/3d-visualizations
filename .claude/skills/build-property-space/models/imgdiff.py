# imgdiff.py: pairs of PNGs compared pixel by pixel — a shut piece rendered before and after a rework (openview.py with
# --open 0 --flat 1), or any two frames of the same camera (models/README.md).
#   <blender> --background --python <skill>/models/imgdiff.py -- <diff-dir> <a.png> <b.png> [<a.png> <b.png> ...]
# Prints `DIFF <b> >2: <share>% >8: <share>% >24: <share>% max <levels>` for each pair (levels of 255), and writes
# <diff-dir>/diff-<b>, the difference amplified eight times in red. Ladonia's 2026-10-16 rework read ≤ 0.5 % over 2
# levels, on the joints alone, for a piece whose look had not changed.
import os
import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:]
out = args.pop(0)
os.makedirs(out, exist_ok=True)
for a, b in zip(args[::2], args[1::2]):
    ia, ib = bpy.data.images.load(a), bpy.data.images.load(b)
    pa = np.array(ia.pixels[:], dtype=np.float32).reshape(ia.size[1], ia.size[0], 4)[:, :, :3]
    pb = np.array(ib.pixels[:], dtype=np.float32).reshape(ib.size[1], ib.size[0], 4)[:, :, :3]
    d = np.abs(pa - pb).max(axis=2) * 255
    shares = [float((d > t).mean() * 100) for t in (2, 8, 24)]
    print(f"DIFF {os.path.basename(b):48s} >2: {shares[0]:6.3f}%  >8: {shares[1]:6.3f}%  >24: {shares[2]:6.3f}%  max {d.max():5.1f}")
    amp = np.clip(d / 255 * 8, 0, 1)
    img = bpy.data.images.new("d", ia.size[0], ia.size[1])
    px = np.ones((ia.size[1], ia.size[0], 4), dtype=np.float32)
    px[:, :, 0] = amp
    px[:, :, 1] = amp * 0.2
    px[:, :, 2] = amp * 0.2
    img.pixels = px.ravel()
    img.filepath_raw = os.path.join(out, "diff-" + os.path.basename(b))
    img.file_format = "PNG"
    img.save()

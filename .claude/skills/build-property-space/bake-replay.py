# Replay the bake's lightmap unwrap and atlas packing on a checkpoint, in a
# few minutes instead of the twenty-odd before them in a real bake.
#
# Checkpoints (blender/bake_public.py, through scripts/bake-public.mjs):
#   BAKE_CHECKPOINT_UNWRAP=<scratch>/preunwrap.blend BAKE_STOP=1   before the unwrap; stop there
#   BAKE_CHECKPOINT=<scratch>/prepack.blend                       after it, before the packing
#   e.g. BAKE_CHECKPOINT_UNWRAP=… BAKE_STOP=1 PUBLISH_DIR=<scratch>/pub \
#        node scripts/bake-public.mjs <id> --samples 16 --size 1024
#   (the bake's folder, settings.json with it, is deleted when it stops: copy
#   <scratch>/pub/<id>/<version>/bake-*/settings.json aside while it runs)
#
# Replay:
#   /Applications/Blender.app/Contents/MacOS/Blender <checkpoint.blend> --background \
#       --python <skill>/bake-replay.py -- <size> [--margin <texels at 4096>] [--settings <settings.json>]
#
# From prepack.blend it runs pack_zones; from preunwrap.blend (with
# --settings) unwrap and then pack_zones — bake_public.py as it is now, so an
# edit to it is tried at once. It prints the bake's own lines: the unwrap's
# stretch ("N% of the surface within 20% of even texel density"; healthy:
# over 90), "no lightmap area" pieces, margins, islands, "zone short of
# texels" for any room packed under half the usual density, "atlas … filled;
# zones' texels per metre within …%", and the house's texel size. Healthy:
# no short zones, zones within ~50% of each other, a few cm per texel at
# 4096 (Ladonia 5.6, Wrenfield 5.4).
import json
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def option(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


size = int(ARGS[0]) if ARGS and not ARGS[0].startswith("--") else 1024
src = open(os.path.join(REPO, "blender", "bake_public.py")).read()
src = src[: src.rindex("\nmain()")]
g = {"__name__": "bake_replay", "__file__": os.path.join(REPO, "blender", "bake_public.py")}
sys.argv = [sys.argv[0]]  # bake_public parses its own arguments in main() only
exec(compile(src, "bake_public.py", "exec"), g)

g["MARGIN"] = max(1, round(int(option("--margin", g["MARGIN_4K"])) * size / 4096))
LM = g["LIGHTMAP_UV"]
lightmapped = [o for o in bpy.data.objects if o.type == "MESH" and o.get("lighting") == "lightmap" and "zone" in o]
unwrapped = [o for o in lightmapped if LM in o.data.uv_layers]
t = time.time()
if unwrapped:
    print(f"{len(unwrapped)} unwrapped lightmapped objects; packing at {size}, margin {g['MARGIN']} texels")
    g["pack_zones"](unwrapped, size)
    objects = unwrapped
elif lightmapped:
    if not option("--settings"):
        sys.exit("A checkpoint from before the unwrap: give --settings <the bake's settings.json>.")
    settings = json.load(open(option("--settings")))
    print(f"{len(lightmapped)} lightmapped objects; unwrapping and packing at {size}, margin {g['MARGIN']} texels")
    for obj in lightmapped:
        obj["_density"] = g["density"](obj, settings)
    g["unwrap"](lightmapped, settings, size)
    objects = lightmapped
else:
    sys.exit("No lightmapped objects here: is this a BAKE_CHECKPOINT or BAKE_CHECKPOINT_UNWRAP file?")
print(f"done in {time.time() - t:.0f} s; house texel {g['texel_size'](objects, size) * 100:.1f} cm")

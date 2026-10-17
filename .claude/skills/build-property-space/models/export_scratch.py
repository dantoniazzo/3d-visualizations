# export_scratch.py: the repo's blender/export_furniture.py run with its output sent to a scratch folder, so pieces can
# be iterated on (exported, swept, rendered, compared) without touching public/ and without a Blender copy
# (models/README.md; ../copy-merge.sh's blender-copy is the way when the code itself is being changed in parallel).
#   cp <repo>/public/models/furniture/catalog.json <out>/      (once: the export reads and rewrites the catalogue there)
#   B2_OUT=<out> <blender> --background --python <skill>/models/export_scratch.py -- <id-prefix> ...
# Writes <out>/<id>.glb for each piece whose id starts with a prefix, and <out>/catalog.json with their entries; read
# them with openview.py, imgdiff.py, _hands.mjs (by path) or the measuring tools' --glb-dir <out>. It refuses to run
# without B2_OUT. The repo is four folders above this file (or REPO=<dir>).
import os
import sys

REPO = os.environ.get("REPO") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
out = os.environ.get("B2_OUT")
if not out:
    sys.exit("B2_OUT=<a scratch folder holding a copy of catalog.json> first: this never writes public/")
if os.path.abspath(out).startswith(os.path.join(REPO, "public")):
    sys.exit("B2_OUT is inside the repo's public/: give it a scratch folder")
path = os.path.join(REPO, "blender", "export_furniture.py")
src = open(path).read()
line = 'OUT = os.path.join(REPO, "public", "models", "furniture")'
assert line in src, "export_furniture.py's OUT line has changed: change export_scratch.py to match"
src = src.replace(line, 'OUT = os.environ["B2_OUT"]')
exec(compile(src, path, "exec"), {"__file__": path, "__name__": "__main__"})

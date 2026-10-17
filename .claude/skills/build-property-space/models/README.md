# Model QA: looking at and measuring catalogue GLBs

Tools for checking a Blender piece before it is placed: SKILL.md §4 asks for proof from the
orthographic side view and a measurement, not by eye. They were written in the 2026-10-03/04
round, when the user's complaints were pillows falling forward, a flat plane through the white bed
pillows and pillows that didn't look natural, and they are generic: any GLB, any material names.
Ladonia's pieces and numbers below are examples.

| Tool | What it does |
| --- | --- |
| `views.py` | renders pieces from four views (front, orthographic side, top, back; also left, plan) |
| `sheet.mjs` | puts each piece's views on one labelled sheet |
| `pair.mjs` | a listing render above our frame of the same view, one image per reference |
| `parts.py` | lists a GLB's parts: number, materials, closed/open, centre, size |
| `lean.py` | which way each upright soft part leans, and by how much |
| `profile.py` | thickness across a part at mid-height and up it at mid-width |
| `facets.py` | share of vertex positions with split normals (hard edges) per part |
| `contacts.py` | what each part touches, passes into (how deep) or floats beside |
| `flatbase.py` | flat faces at a part's lowest point (a flat-clamped base) |
| `coplanar.py` | coplanar overlapping faces of different parts or materials (z-fighting) |
| `sweep.py` | every opening part of a piece swept shut to open against its own static parts (built from `export_furniture.py`'s PIECES) |
| `openview.py` | GLBs rendered with their opening parts posed open (or shut), `FIX=1` the water and steam anchors drawn |
| `imgdiff.py` | two renders of the same camera compared pixel by pixel, an amplified difference written |
| `export_scratch.py` | `export_furniture.py` run with its output in a scratch folder (`B2_OUT`), never `public/` |

`thumbs.py` (one folder up) is the quick single view for browsing the catalogue; these are for
review. `../copy-merge.sh` makes the Blender copies whose `glb/` these read with `--glb-dir`
(below).

## Running them

Blender isn't on PATH on this Mac. From the repo root, with `K=.claude/skills/build-property-space/models`:

    B=/Applications/Blender.app/Contents/MacOS/Blender
    $B --background --python $K/lean.py -- ld-bed
    $B --background --python $K/contacts.py -- ld-bed --mat 'pillow_*,linen_sand,linen_olive_dark'

Each measurement script takes, after Blender's `--`:

- `<glb>`: a catalogue id (looked up in `public/models/furniture/catalog.json`) or a path to a
  `.glb`. `--glb-dir DIR` looks ids up as `DIR/<id>.glb` instead: a Blender copy's `glb/`.
- Filters: `--mat a,b*` (parts with one of these materials; shell globs, quote them), `--part
  3,7` (part numbers), `--box x0,x1,y0,y1,z0,z1` (parts whose centre is inside). Run `parts.py`
  first to see the numbers and material names.
- Its own options (`--help` lists them; the header comment of each file says what it measures,
  how, and what a good result looks like).

A *part* is one connected piece of surface after coincident vertices are welded (a pillow, a leg,
a door front); numbers are stable for a given GLB. Coordinates are Blender's after the glTF
import, in metres: x = the app's x, y = the app's −z, z = up. A piece modelled with its front to
+Y (every `loose.py` and `ladonia.py` piece) has its back at −Y, which is glTF +Z.

Each prints plain rows and ends with one line, `VERDICT OK|WARN|FAIL: ...`. `facets.py`,
`contacts.py` and `flatbase.py` judge by the filter: with one you are naming parts that should
pass (soft parts), so a fault in them is a FAIL; without one the run is an overview, and what
joinery does by design (hard edges, overlaps, flat bases) is a WARN at most. `lean.py` FAILs on
any part leaning forward and `coplanar.py` on any fighting patch, filtered or not; `profile.py`
never FAILs (a flange can be meant). `views.py`, `sheet.mjs` and `pair.mjs` end with a verdict
too (OK, or WARN when something was missing). The repo is
found four folders up; set `REPO=` to use another checkout. Nothing here writes to the repo.

## What they say on good pieces (2026-10-04, the repo's current GLBs)

Run on `ld-bed`, `ld-sofa-corner-l`, `ld-out-lounge` and `ld-kitchen-ochre-l`; all 28 runs take
about 16 s. `$ lean.py ld-bed` below is short for `$B --background --python $K/lean.py -- ld-bed`,
`...` marks cut output, and `SOFT='pillow_*,linen_sand,linen_olive_dark'` (the bed's pillows).

**parts.py** — `parts.py -- ld-bed` lists 11 parts: plinth, base, mattress
(`linen_white`), duvet (open: one sheet), runner, two dark Euro shams, two white pillows (with
their `thread_olive` stitch faces), two sand cushions. The sofa has 19 parts (all closed), the
lounge chair 22 (its slats and frame are open shells), the L kitchen 46.

**lean.py** — the top of every soft part toward the back.

    $ lean.py ld-bed
      #5 linen_olive_dark ... tilt  30.3 deg top->(+0.02,-1.00) back  plate 69x50x19
      #7 pillow_white/thread_olive ... tilt  25.3 deg top->(+0.02,-1.00) back  plate 78x51x23
      #9 linen_sand ... tilt  23.9 deg top->(+0.04,-1.00) back  plate 58x41x18
    VERDICT OK: 6 lean back (23.9-30.4 deg), 0 sideways, 0 forward, 0 upright; 4 lying, ...
    $ lean.py ld-sofa-corner-l --back auto
      back cushions 12.3-13.4 deg (the return's toward -x), throw pillows 22.9-23.2 deg,
      the corner pillows toward the corner (-0.71,-0.71)
    VERDICT OK: 9 lean back (12.3-23.2 deg), 0 sideways, 0 forward, 4 upright; 6 lying, ...
    $ lean.py ld-out-lounge
      #20 cushion_offwhite ... tilt  16.6 deg top->(+0.05,-1.00) back
    VERDICT OK: 1 lean back (16.6-16.6 deg), 0 sideways, 0 forward, 16 upright; ...
    $ lean.py ld-kitchen-ochre-l
    VERDICT OK: 0 lean back, 0 sideways, 0 forward, 22 upright; 10 lying, 14 small or not plates

Without `--back auto` the sofa's two return cushions read "sideways" (WARN): they lean toward −X,
as they should; `lean.py ld-sofa-corner-l --box -1.2,-0.8,-0.6,1.2,0,1 --back -x` checks them
alone (`2 lean back (12.3-12.8 deg)`, OK). The lounge chair's back cushion before the 2026-10-04 fix read `tilt 23.0 deg
top->(-0.05,+1.00) forward` and `VERDICT FAIL`.

**profile.py** — pillows thin steadily to the seam.

    $ profile.py ld-bed --mat "$SOFT"
      #7 pillow_white/thread_olive
        across  78.3 cm:  0.0  5.6  9.1 11.9 15.9 17.9 18.1 18.6 19.5 20.8 20.3 21.3 19.5 ... 5.3  0.0
               max 21.3 cm  half 0.84  rim 0.4 cm  dent 0.6 cm
        -> lens: thins steadily to the seam
      #9 linen_sand ... half 0.75  rim 0.8 cm -> lens
      #5 linen_olive_dark ... half 0.67  rim 4.6 cm -> across: thin rim 4.6 cm; up: thin rim 4.0 cm
    VERDICT WARN: 2 of 6 parts flat, rimmed or dented: #5 #6

The WARN is the dark Euro shams' 4–5 cm flange, which the listing's have; the white pillows and
cushions are lenses. The round-1 white pillow read `rim 4.2 cm` (a flange plate through its
middle, the user's "flat plane"). Sofa throw pillows (`--mat 'weave_*,velvet_*'`): half
0.79–0.82, rim 0.2–0.4 cm, `VERDICT OK: 4 part(s) thin steadily to the seam` (the round-1 ones
read half 0.93–0.97, flat slabs, WARN). The lounge's back cushion is a crowned box (half 0.92), OK. A kitchen's
panels are slabs (half 1.00, WARN): run it on soft parts.

**facets.py** — cloth smooth everywhere.

    $ facets.py ld-bed --mat "$SOFT,linen_duvet,linen_olive"
      #7 pillow_white/thread_olive ... positions   1968  split      0    0.0 %
    VERDICT OK: 8 parts smooth (under 1 % split)

The sofa and the lounge chair: every part 0.0 %, OK. The kitchen without a filter: `VERDICT WARN:
40 of 46 parts faceted` — its boxes are split at every corner by design. The round-1 bed pillows
read 25–50 % (`VERDICT FAIL` with the filter): the patchwork of flat rectangles.

**contacts.py** — pillows touch, never pass through each other.

    $ contacts.py ld-bed --mat "$SOFT"
      #7 pillow_white/thread_olive ...  closed
          #2 linen_white ...        gap   0.0 mm  in   43/1968  depth   0.8 mm
          #5 linen_olive_dark ...   gap   0.6 mm  in    0/1968  depth   0.0 mm  (selected)
          #9 linen_sand ...         gap   1.3 mm  in    0/1968  depth   0.0 mm  (selected)
    VERDICT OK: 6 parts; deepest pair within the selection 0 mm (allowed 10); nothing floating
    $ contacts.py ld-sofa-corner-l --mat 'weave_*,velvet_*'
      each pillow 28-42 mm into its seat cushion (resting on it), 5 mm into the pillow beside it
    VERDICT OK: 4 parts; deepest pair within the selection 5 mm (allowed 10); nothing floating
    $ contacts.py ld-out-lounge --mat 'cushion_*'
      #21 cushion_mustard ... #20 cushion_offwhite  gap 0.0 mm  in 52/296  depth 61.0 mm  (selected) <- too deep
    VERDICT FAIL: 2 pair(s) within the selection deeper than 10 mm; deepest #21 cushion_mustard into #20 cushion_offwhite 61 mm
    $ contacts.py ld-kitchen-ochre-l
    VERDICT OK: 240 neighbour pairs, none deeper than 10 mm, nothing floating

The lounge chair's FAIL is real and not fixed (2026-10-04): its mustard lumbar pillow sits 61 mm
inside the back cushion (the side view shows the overlap). Unfiltered, `ld-bed` WARNs that its runner
(`linen_olive`) floats 10 mm above the duvet. The round-1 bed pillows read 70–100 mm deep.

**flatbase.py** — a small, rounded contact patch.

    $ flatbase.py ld-bed --mat "$SOFT"
      #7 pillow_white/thread_olive ... z 0.502  flat   55 faces    114 cm2  patch  60.8 x  2.8 cm of  78.2 x 26.7
      #6 linen_olive_dark ...          z 0.497  flat    0 faces      0 cm2  ...  (+238 cm2 buried)
    VERDICT OK: no flat base deeper than 5 cm

Patches 2.8–4.7 cm deep; the left sham's flat underside is sunk 8 mm into the mattress
(buried, never seen). The sofa pillows have none, the lounge cushions 2–3.5 cm. The round-1 bed
pillows: patches 61–72 × 9–14 cm at one height, `VERDICT FAIL`. The kitchen unfiltered WARNs on
its carcasses and worktop, flat by design.

**coplanar.py** — nothing flickers.

    $ coplanar.py ld-kitchen-ochre-l
    VERDICT OK: 0 fighting, 0 at an end, 0 same-material, 0 hidden, 0 sliver, 0 layered patch(es)

The same on the bed, the sofa and the lounge chair. What a finding looks like, on
`ld-kitchen-ochre-a1` (in the scene, 2026-10-04, not fixed):

    fights   #26 terrazzo_top / #43 lacquer_cream  facing +Y  1801.8 cm2  x -1.456..-1.244 y -0.303..-0.303 z 1.040..1.460  seen 100 %
    end      #26 terrazzo_top / #43 lacquer_cream  facing -X    72.0 cm2  x -1.500..-1.500 ...
    hidden: back / hidden: enclosed / layered  ... (listed, not judged)
    VERDICT FAIL: 1 fighting, 1 at an end, 0 same-material, 6 hidden, 0 sliver, 6 layered patch(es)

The terrazzo splashback runs on behind the open shelf column, in the plane of the column's cream
back panel. `ld-kitchen-ochre-42` (not in the scene) has the same fault; the niches' bronze frames
lie in their carcass's planes too but are sandwiched between units (seen 6–25 %: enclosed).

## Looking: views.py, sheet.mjs, pair.mjs

    $B --background --python $K/views.py -- <scratch>/views ld-bed ld-sofa-corner-l ld-out-lounge ld-kitchen-ochre-l
    node $K/sheet.mjs <scratch>/views <scratch>/sheets

`views.py <out-dir> [--size 640] [--glb-dir DIR] [--views front,side,top,back] <id|path> ...`
writes `<out>/<id>/<view>.png` (four pieces at 480 px: about 4 s). Views: `front` (perspective
from the front, on the piece's −X side, above), `side` (orthographic from +X: the piece's front is
on the right of the image, so a pillow leaning back has its top displaced to the left), `left`
(orthographic from −X, front on the left: an L's other end), `top`, `plan` (orthographic straight
down, front at the bottom), `back`. Colours read lighter there than in the app (SKILL.md §4).
`sheet.mjs <views-dir> <sheets-dir> [id ...]` writes `<sheets-dir>/<id>.jpg`, two views a row.

    node $K/pair.mjs <scratch>/ladonia/gallery <scratch>/frames fin2- <scratch>/pairs 17 21   # Ladonia's

`pair.mjs <gallery-dir> <frames-dir> <prefix> <out-dir> <key> ... [--width 960]` writes
`pair-<prefix><key>.jpg`: the listing's `<key>.jpg` above our `<prefix><key>.jpg` (the sink's
frames from `__renderSet`), each cropped to 16:9. It is for your own eye; critics get blind pairs
from `prep_review.mjs`.

## With Blender copies (SKILL.md §11 step 3)

    CM=.claude/skills/build-property-space/copy-merge.sh
    $CM blender-copy <scratch> beds          # <scratch>/beds/blender, its OUT -> <scratch>/beds/glb
    (cd <scratch>/beds/blender && $B --background --python export_furniture.py -- ld-bed)
    $B --background --python $K/views.py -- <scratch>/beds/views --glb-dir <scratch>/beds/glb ld-bed
    $B --background --python $K/lean.py -- ld-bed --glb-dir <scratch>/beds/glb
    DRY=1 $CM merge-blender <scratch> beds sofas    # into a copy of blender/ first, to read
    $CM merge-blender <scratch> beds sofas
    npm run furniture -- ld-                 # once, after the merge

The copy's export reads the repo's catalogue and writes its own `glb/` (with a `catalog.json`
of its own), so measuring a copy's piece never touches `public/`. `copy-merge.sh` has the rest:
generator copies (`gen-copy`, `merge-gen`), `diff` for a builder resuming after a break, and how
a stale base is refused.

## Opening parts: sweep.py, openview.py, imgdiff.py, export_scratch.py (2026-10-17)

SKILL.md §4 asks for every part that opens (a door, a drawer, a flap, a fridge's door, a shower's
glass) to be swept against its own piece and against the scene before a piece is placed. These do
the piece's side; `../checks/part-sweep.py` the scene's, and `../checks/_hands.mjs` lists each
part's hand and swing from the GLB.

    PLANES=1 $B --background --python $K/sweep.py -- [--tol 0.002] [--steps 18] <piece-id> ...

builds each piece from `export_furniture.py`'s PIECES before `join_piece` and samples each part's
faces every 2 cm through 18 poses, shut to open, against every part that stays put (PLANES=1: a
box-like part of 40 faces or fewer by its own planes, not the box round it). It prints `CLASH <id>
<type> <label> at <pivot> <mm> mm at t <share> point <x, y, z> in <part>`, a `SWEPT` line a piece and
`TOTAL clashes N`. Ladonia's 33 storage pieces took 23 s; it found the U kitchen's fridge door in the
back leg's worktop (8.9 mm), the vanity's drawer through its counter (3.4 mm) and the fridge's bins in
its shelves, and with every part swung the wrong way it caught 12 of 12. `vanity-small` and
`ld-vanity-double-145` on 2026-10-17: 0 clashes. An id `uback-<scheme>` sweeps a U kitchen's back
leg alone (Ladonia's `ladonia.py`).

    $B --background --python $K/openview.py -- <out> [--open 1] [--views front,left,right,top,low,back] [--size 900] [--flat 1] [--only part,...] <glb> ...
    $B --background --python $K/imgdiff.py -- <diff-dir> <a.png> <b.png> ...

`openview.py` writes `<out>/<id>-<view>-<tag>.png` (tag `open`, or `shut` with `--open 0`):
the parts posed by their own `extras.opens` (hinge angle and axis, or slide direction and
distance), to read each hand, swing and interior. `--flat 1` replaces each base-colour texture with
its mean colour, so two exports whose atlases differ compare by shape alone; `FIX=1` draws a
fixture's water (blue), control (red) and steam (cyan, its screens green) as boxes. `imgdiff.py`
gives each pair's share of pixels over 2, 8 and 24 levels and writes the difference amplified: a
rework that changed nothing of a piece's shut look read at most 0.5 % over 2 levels, on joints.

    cp public/models/furniture/catalog.json <scratch>/exp/
    B2_OUT=<scratch>/exp $B --background --python $K/export_scratch.py -- <id-prefix> ...

`export_scratch.py` runs the repo's own exporter with its `OUT` sent to `B2_OUT` (it refuses to run
without one, or with one inside `public/`): the GLBs and their catalogue entries land there, for
the tools above (`--glb-dir`, or a path) without a Blender copy. Use a copy (`copy-merge.sh
blender-copy`) when the exporter's code itself is being changed.


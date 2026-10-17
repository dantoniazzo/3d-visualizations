# Agent briefs

The briefs that worked, as templates for the Workflow scripts of a round
(SKILL.md §11): (a)–(g) are from Ladonia's interiors round (2026-10-03/04),
where agents work in copies; (h)–(p), under "Work on the app's own code",
are from the performance stages and the usability waves (2026-10-10/17),
where agents work at once in the one checkout. Each agent's prompt is the
shared context block (or the design file), its role's template, and a
remit you write fresh. Values in parentheses tagged "Ladonia" are that
project's, not rules.

Placeholders: `<repo>` the repo root; `<skill>` =
`<repo>/.claude/skills/build-property-space`; `<scratch>` the session's
scratchpad; `<project>` the listing's download folder
(`<scratch>/<project>/gallery/<n>.jpg`, `plans/`); `<space>` the
generator folder (`scripts/spaces/<space>/`); `<id>` the scene id;
`<prefix>` the project's catalogue prefix (Ladonia: `ld-`); `<frames>`
the file-name prefix given to `__renderSet` or `__plans` (Ladonia:
`fin2-`, `plan-fin-`); `<round>` a scratch folder per round; `<job>` a
scratch folder per job of app work, its lanes' dists, servers' folders,
tools and reports under it (2026-10-16/17: `ux`); `<name>` an
agent's copy; `<base>` the pristine copy `copy-merge.sh` keeps;
`<blender>` = `/Applications/Blender.app/Contents/MacOS/Blender`.

## Writing a brief

- **Give the decisions already made**, under "Decided for you (don't
  re-litigate)": the piece's kind, id, size, wall, facing and hand. An
  agent handed an open question re-argues the audits, and two agents
  answer it differently.
- **Say where audits disagree and who decides.** Either you, after cropping
  the plan yourself (Ladonia's C beds: an auditor read 1.85 m; the crop
  showed 1.4–1.5 with the nightstands outside the bed's outline), or the
  agent, after its own crop ("where A0 and B0 disagree about the shared
  plan, look at it and choose"). Never "follow the latest finding".
- **Small squares either side of a bed's head are nightstands, not the
  bed.** Say so to every auditor and placer.
- **Name every new piece exactly**: id, [w, h, d] facing north at rotation
  0, anchor and hang height, and which X end the sink, columns, chaise or
  glass are at. Give it to the modeller as the spec, and to the placer as
  a list made from the merged catalogue (new and changed sizes), with the
  modellers' notes (Ladonia: a bed's width includes the duvet, so drawers
  are spaced from `BED_BASE`).
- **Keep file regions disjoint.** Each agent gets functions, or
  banner-to-banner ranges of a shared file, plus anchor lines for new
  functions, registrations and materials. A shared helper has one owner;
  the others write private variants or add a parameter that defaults to
  today's behaviour.
- **List what's declined and why.** Reviewers skip it unless they think the
  reason is wrong, and say why.
- **Repeat in the brief the conventions agents got wrong**, not only in
  the skill: the X-rotation sign, facing at rotation 0, side A and swing
  names, heights in a building's own frame, the floating vanities' lift,
  Door.js's 93.6° full open.
- **Done means measured**: the exporter's printed sizes, triangle counts,
  `models/` readings before and after, checker summaries before and after,
  a diff file. Give each role a JSON schema; write the results to
  `<scratch>/<round>-results.txt` as `===== <key>` sections with finding
  ids `[<key>-<n>]`, which the next round's briefs cite.
- **Who may write what.** Read-only roles write under `<scratch>/<round>/`
  only. Builders write only in their copy and never run npm, seed or touch
  the user's server. You merge, rebuild the catalogue once, and reseed.
- **Give reviewers suspected checker artefacts to verify**, not to act
  on. Ladonia's example: the window showers' "stair blockers" were the
  pieces' bounding boxes.
- Keep a wave under 10 agents. A usage limit can kill a whole wave: keep
  the copies and relaunch with the RESUMING preamble (g).
- **Coordinate by small files, not by waiting on agents.** A lane that
  others depend on writes what they need to
  `<scratch>/<job>/reports/<topic>.md` as soon as it exists, and again
  whenever it changes. Wave B had two: `F-publish.md` (the scratch
  publish's version id, how to open it, when its bake ended) and
  `P-steps.md` (where the steps' source is, which scene copies were
  patched, how to check them in a tab). Every agent also saves its own
  report to `<scratch>/<job>/reports/<label>.md` as it goes, so one cut
  off by a limit still leaves its findings. You copy them to
  `~/.claude/projects/<project>/<session>/snapshots/reports/`: the
  scratch folder does not survive a restart (SKILL.md §0).
- **A verifier measures its own way** (p). The fixer's tools carry the
  fixer's rule: a sweep that took the whole chair as the seat's own hid a
  torso 0.22 m into a backrest. Give the verifier the skill's instruments,
  or let it write its own, and have it use the fixer's only to reproduce
  their numbers.
- **Plan for an agent that returns nothing.** Each step of a script falls
  back to a stub that says so (`|| dead('<what>')`: "nothing of it can be
  assumed built"), so the next agent is not told it was done.

## Shared context block

```text
Project: <name> — <buildings; which share a plan; the scheme of each>. Scene <id>; generator <repo>/scripts/spaces/<space>/ (kit.js = Building, walls, doors; <design>.js per building design; furnish.js = every piece's placement; index.js = site, gardens, landscape). Each building is written in its own frame: x east, z south, origin at its outer north-west corner; placed at <offsets and levels> (Ladonia: A [0, 0], B [0, 24.2], C [2.5, -21] and 1 m lower; storeys A/B 3.0, C 3.2).
Catalogue: <repo>/public/models/furniture/catalog.json, sizes [w, h, d] facing north (-z) at rotation 0. FACE = { N: 0, W: 90, S: 180, E: -90 }: "W" turns the front west and the piece's +X north; "E" turns +X south; "S" turns +X west.
Plans: <scratch>/<project>/plans/<file>.png; origin = the pixel of the building's outer NW corner, and px/m, per file: <table> (Ladonia: f0_A_i_B (160.7, 115.5) 28.3; f1_A_i_B (90.5, 88.5) 40.6; f0_C (159.5, 270) 29.75; f1_C (50, 24) 50.4). Gridded crops in a building's frame: node <skill>/gridcrop.mjs <plan.png> <out.jpg> <px/m> <origin-px-x> <origin-px-y> <x0> <z0> <x1> <z1> [zoom].
Our plan cuts (__plans, 1.5 m above each floor, image top = north): <scratch>/frames/<frames><KEY>.jpg, N px square (1400 as shipped); building-local x = cx + (px - N/2)/N*span - ox, z = cz + (py - N/2)/N*span - oz, with (cx, cz, span) per key from the views file's `at` table.
Listing renders: <scratch>/<project>/gallery/<n>.jpg — <n: what it shows> (Ladonia: 17/18 A's ochre living, dining and kitchen; 19/20 B's sage living and kitchen; 21 the bedroom; 22 a garden terrace).
```

## (a) Read-only auditor, per floor or per topic

One per floor (Ladonia: A0, B0, AB1, AB2, C0, C1) and one per topic
(bedroom, living, models). Schema: `{ origin, findings: [{ where, kind:
misplaced | wrong-piece | missing | extra | model-defect | material |
layout, severity: high | medium | low, blueprint, current, fix, new }] }`.
Write each auditor's result to `<scratch>/<round>/audit/<key>.txt`: an
`ORIGIN:` line, then `[<key>-<n>] (severity/kind) where` with `BLUEPRINT /
CURRENT / FIX / NEW` lines.

```text
You are auditing the furnished interiors of <project> (scene <id>) in <repo> against the developer's plans and renders. The user asked: "<their words>".
READ-ONLY: do not edit any file in the repo; scratch files only under <scratch>/<round>/audit-<key>/.
Read first: <skill>/SKILL.md §2, §3, §4, §8 and <skill>/reference.md (the Building frame, furnish.js helpers, FACE, facing conventions).
<shared context block>
Find each plan's origin and scale yourself: the pixel of the building's outer north-west corner, and px/m, confirmed against two or three walls whose positions you read from the generator (runs of dark pixels along a row or column give a wall line to the pixel). Give both, and how you checked them, in `origin`. Then crop every room with gridcrop.mjs at zoom 4-9 and LOOK at each crop at full size; read sizes off the grid.
Small squares either side of a bed's head are nightstands, not part of the bed: measure the bed between them.
Any fix must keep: the walker (a 0.7 m capsule) 0.7 m ways to every door and piece, door zones clear, 0.6 m before a WC, 0.7 before a basin or shower, 0.8 before a wardrobe, 0.6 beside a bed where the room allows; nothing across glazing that the plan doesn't put there; pieces placed from wall faces (centreline ± thickness/2).
YOUR TASK (<key>): audit <floor or topic> against <plan file(s)>, our cut <cut>, and renders <n...>. Go room by room through every symbol the plan draws: beds (head wall, nightstands), wardrobes (hatched rectangles), sofas (straight; chaise, and on which arm; corner, with backs on two walls), tables (round or rectangular, chair count, orientation), kitchens (straight, L or U; where the sink and hob are drawn), bathroom fittings, TV units, terrace furniture. List every difference in building-local metres, with the generator line you would change and the exact replacement call(s) using the existing helpers, or a new catalogue piece (id, w x h x d, shape and look). Say when the plan is ambiguous.
```

Topic auditors get, in place of the room-by-room task: compare our frame
`<scratch>/frames/<frames><n>.jpg` with the listing's `<n>.jpg`
exhaustively, render the pieces (`models/views.py`), read their builders,
and give each gap as a builder change, with sizes and hexes measured from
the render, or as a placement change. The models auditor gets every
interior piece in four views plus the `models/` measurements, and is
asked for: cushions leaning forward, flat plates, parts through parts,
floating parts, inverted normals, coplanar faces, boxy shapes where the
render is soft, proportions against the catalogue size, materials. If it
tries its fixes in a scratch copy and proves them, it hands back a
verified patch (Ladonia's pillows-lean-back patch).

## (b) Model builder in its own Blender copy

Make the copy with `copy-merge.sh blender-copy <scratch> <name>`. Schema:
`{ pieces: [{ id, size, tris, note }], files_changed, touched, issues,
summary }`.

```text
You are building Blender furniture for <project>, a walkable 3D real-estate space. Every piece must look like the listing's renders and fit the plans.
WORKSPACE (yours alone; <n> other agents work in sibling folders at the same time):
- Your copy of the Blender scripts: <scratch>/<name>/blender (lib/<project>.py = the project's builders, lib/materials.py, lib/bake.py = baked textures, lib/geometry.py = helpers, lib/joinery.py = generic built-ins, export_furniture.py = the PIECES list). It equals the repo's current state<, which already includes ...>.
- Edit only files inside <scratch>/<name>/. Never edit the repo or other agents' folders, and don't run npm.
- Build: cd <scratch>/<name> && <blender> --background --python <scratch>/<name>/blender/export_furniture.py -- <ids> 2>&1 | grep -E "KB|SKIP|Error|Traceback|File |line ". GLBs land in <scratch>/<name>/glb, with the size printed as [x, height, depth]. Each argument is a prefix (ld-bed also rebuilds ld-bed-sage and every other ld-bed-* piece), and a piece not yet in the catalogue is always built, so pass the full ids of the pieces you changed, never a bare <prefix>.
- Look: four-view sheets of your GLBs (front 3/4, orthographic side, top-front, back 3/4) with <skill>/models/views.py pointed at your glb/ folder and <skill>/models/sheet.mjs (commands in <skill>/models/README.md); Read every sheet and iterate until the piece is right. For a close-up, copy views.py into your folder and move the camera.
- Measure: <skill>/models/{lean,profile,facets,contacts,flatbase,coplanar}.py on your GLBs, before and after each fix.
- References: <scratch>/<project>/gallery/<n>.jpg (<n: what it shows>); audit findings <scratch>/<round>/audit/<key>.txt; reference and plan crops in <scratch>/<round>/audit-<key>/.
CONVENTIONS
- Metres, Z up. A piece's front faces Blender +Y ("facing north" at rotation 0 in the app); its back is at -Y. Sitting on a sofa you face +Y with +X on your right; standing at a kitchen you face -Y with +X on your left.
- In Blender's XYZ Euler, a POSITIVE rotation about X tips a part's top toward -Y (the back). Pillows and cushions resting against a back need a positive X rotation. Confirm it in the orthographic side view.
- The exporter centres each piece on its footprint and stands it on z = 0; a floating piece is lifted by its placement. The app collides with a piece's mesh when it has at most 12000 triangles, else with its box (a registration's {"collision": "mesh"|"box"} forces either); a piece with parts that open collides as its body without them (only that counts against the 12000) plus a box per part where it stands shut, but for a shower's door (a way in), which bars the way itself while shut (<skill>/checks/_modes.mjs <id> gives a piece's mode). Keep stray parts inside the intended footprint.
- Every door and drawer opens (since 2026-10-16; _fixed is gone): each is its own part (geometry.hinged / sliding, origin on its hinge, never turned inside the piece), labelled for the prompt (label="door", "drawer", "fridge", "freezer", "wardrobe", "closet", "washing machine", "dryer", "detergent drawer", "shower door", "microwave"), each its own draw call. Carcasses behind them hollow, white inside, edges in the carcass colour. Doors swing a right angle about their face's outer corner (a door with a pull: _pull_swing short of it), away from walls and tall units, pairs from the middle; dishwashers, ovens, blind corners, fillers and hob flaps stay shut. Sweep every part shut to open against the piece's static parts and the scene's placements and walls. Never move a television's glass (npm run screens -- --check).
- Keep each piece under ~25k triangles. No two coplanar overlapping faces of different parts: offset them by >= 1 mm or merge them. Parts that meet overlap 1-2 mm.
MERGE DISCIPLINE: your copy is merged into the repo with git merge-file against the base afterwards. Keep changes local: don't reformat, reorder or rename existing code; change existing functions only where your remit says; add new functions only at the location given, registrations only at the given anchors in PIECES, new materials only at the given anchor in materials.library(). New optional parameters on existing functions default to today's behaviour, so other pieces don't change. Leave your export_furniture.py's OUT line and catalogue-path line alone (they point at your folder and the repo's catalogue).
DONE MEANS: every piece in your remit is registered, builds without errors, and has been looked at and measured: every pillow and cushion leans back (side view and lean.py), rests on its support and passes through nothing (contacts.py), and cloth is smooth (facets.py); proportions and colours compared with the render. Every part that opens is labelled (a scan of your GLBs: no node with `opens` and no label), swept shut to open against its own piece with 0 clashes (PLANES=1 <blender> --background --python <skill>/models/sweep.py -- <ids>), and seen open (models/openview.py --open 1: the hinge side, the swing's sign, the inside). A piece already placed keeps its printed size (its catalogue entry must not change) and its shut look (openview.py --open 0 --flat 1 before and after, models/imgdiff.py: joints only). Name every piece with a television you exported: the lead runs npm run screens -- --check after the merge (it reads the repo's GLBs only), which must find its glass where it was. Report: pieces (id, printed size, triangles, one-line note), files changed, functions and anchors touched, measurements before and after, anything you couldn't do.
YOUR REMIT:
```

The remit names the pieces and where they go. Ladonia's corner sofa:

```text
sofa_corner(col, mats, w, ret, depth, style): a corner sofa with backs on two walls and NO chaise; slim 0.15 track arms close both free ends. At rotation 0 it faces +Y: the run along X with its back on the -Y edge; the return at the -X end, running forward to the +Y edge with its back along the -X edge. Seat ~0.45, back ~0.78. Loose back cushions lean back against both backs; scatter pillows in the corner (_case_pillow, leaning back). Materials as ld-sofa (render 19) or ld-sofa-boucle (17/18). Ids: ld-sofa-corner-l (linen, w 2.36, ret 2.30, seat depth 0.96), ld-sofa-boucle-corner-l, ld-sofa-corner-s-l (2.27, 2.26, 0.90), ld-sofa-boucle-corner-s-l.
Where: sofa_corner() immediately after sofa(); registrations right after the ld-sofa-boucle-chaise-l entry; new materials only right after the "led_white" line. Not yours: curtain-ochre / curtain-caramel registrations (the bedroom agent's).
```

## (c) Placement builder in its own generator copy

Make the copy with `copy-merge.sh gen-copy <scratch> <name> <space>`
(`public/` linked to the repo's). Give each agent a building or a floor
group. Schema: `{ applied, declined, structural, deviations,
checks_before, checks_after, user_edits_replaced, summary }`.

```text
You are furnishing <project> (<buildings>) in a walkable 3D real-estate app so that every piece matches the developer's plans exactly and the rooms look like the listing's renders. Where the plan can't be followed (a door too narrow to walk through, a room tighter than its furniture), deviate as little as possible and say so.
WORKSPACE (yours alone; <n> other agents work in sibling copies at the same time):
- Your generator copy: <scratch>/gen-<name>/scripts/spaces/<space>/ (kit.js, <design>.js, furnish.js, index.js). <scratch>/gen-<name>/public links to the repo's public/, so the catalogue furnish.js reads for sizes is the real, freshly rebuilt one.
- Edit only your copy, and only the regions your remit names (keep each edit local; don't reformat, reorder or rename). Never touch the repo, scenes/*.json or the user's server on port 3000. Don't seed and don't run npm.
- Read <skill>/SKILL.md §3, §4 and §8, <skill>/reference.md (helpers, door swings and sides, numbers that worked) and <skill>/checks/README.md.
- Import check after every edit: node -e "import('<scratch>/gen-<name>/scripts/spaces/<space>/index.js').then(() => console.log('ok'))"
- Checkers on your copy (flags in checks/README.md; for a new project, your own copies of them): furniture-check.mjs <tags> --live --gen=<copy>, furniture-check-c.mjs --src <copy>, stairs-check.mjs --gen-dir <copy>. Run them before you start (baseline) and after. Add no blockers or majors; explain any that remain and whether the plan forces them.
- Doors: work out every hinge from the generator's emitted wall (start, end, side A), as kit.js does, never from the swing name: `outside` flips a wall and turns _left/_right round. For every door you touch, dump it with checks/doors-dump.mjs, say where its leaf parks, and sweep it to full open (93.6°, not 90°) with checks/door-swing.mjs.
- Plans: <scratch>/<project>/plans/; origins and scales: <table, or the audit files' ORIGIN lines>; crops with gridcrop.mjs. LOOK at your own crop of every room you touch. The audits are good but not infallible (one read C's nightstands as part of the beds).
- The audits: <scratch>/<round>/audit/<key>.txt, each finding BLUEPRINT / CURRENT / FIX / NEW. The FIX lines were computed against the old catalogue: recompute them with the new sizes below.
THE NEW AND CHANGED PIECES (id: [w, h, d] facing north at rotation 0; anchor; hang height; which end is which): <list from the merged catalogue against the old one>
NOTES FROM THE MODELLERS: <e.g. a bed's width includes the duvet overhang; nightstands hang at y + 0.28; floating vanities stand at y + 0.34; which X end the glass, columns or sink are at>
HELPERS (furnish.js as it is now): <the signatures you'll need: put, against, kitchen, hang, dining (tuck), roundSet, bedSet (every bed goes through it), mirrored>.
RULES: the walker is a 0.70 m capsule, so every route needs 0.75 m; doors at least 0.9 m (kit widens narrower ones where the wall has room); hinged doors open into the room they serve, never across a corridor or hall; small WCs' doors open outwards; bed sides >= 0.6 where the plan allows; 0.7-0.8 m before wardrobes, kitchens, WCs and showers; nothing tall in front of glazing unless the plan or the renders put it there; partitions end at the centreline of the wall they meet; room polygons on a level never overlap (update them after a wall change); nothing in a furniture part's swing — a chair's back further from a cupboard's or an under-counter fridge's front than its door is wide, nightstands beside a wardrobe's doors and not before them, a ceiling track further from cupboards to the ceiling than their doors are wide, vanity drawers clear of the WC beside them (the app stops a part where it meets something, but the user sees a door that will not open); never scale a piece with parts (every opening piece in Ladonia and Wrenfield is at scale 1, and a part's slide was in its parent's units: s × its distance in the editor, its distance in a public view). Sweep your placements' parts offline on the spec your copy makes (write your copy's index.js export to <scratch>/gen-<name>/spec.json with a node one-liner; then Blender's python3 <skill>/checks/part-sweep.py <scratch>/gen-<name>/spec.json, which takes a bare spec or a scene record) and report each CLASH. Heights in furnish.js are in the building's own frame (<Ladonia: A/B first floor 3.0, roof 6.0; C's first floor 3.2, though C stands 1 m lower on the site>).
KEEP the user's own edits (carried into the generator, marked "as the user ..." in comments) unless the plan replaces that piece outright; list each one you replaced.
DONE MEANS: every finding in your remit applied, or declined with the reason; every piece in your rooms checked against your own gridded crop; the checkers no worse than the baseline; the generator imports. Then write your diff: cd <scratch> && diff -u <base>/scripts/spaces/<space> gen-<name>/scripts/spaces/<space> > <scratch>/gen-<name>.diff (exit 1 is normal). Report: findings applied and declined (by id), structural changes, deviations from the plan and why, checker summaries before and after, user edits replaced.
YOUR REMIT:
```

The remit: the floors, the finding ids, the decisions, and the regions.
Ladonia's AB-ground remit, shortened:

```text
Buildings A and B, ground floor (A1/B1 middle, A2/B2 north wing, A3/B3 south wing) and the ground-floor gardens' furniture. Findings: A0.txt (all), B0.txt (all), living.txt's placement findings, bedroom.txt's ground-floor rooms. Where A0 and B0 disagree about the shared plan, look at the plan yourself and choose.
Decided for you: A3/B3 kitchen = ld-kitchen-<scheme>-l (2.49 x 2.20; long leg along its back, sink 1.57 from its -X end; short leg at -X, hob 0.65 from its free end), facing N against the south wall, the short leg on the twin room's wall. A3/B3 sofa = the corner sofa "-s-l" where the plan draws it. Every bed through bedSet. Optional: the north-wing bathroom extension, only if the walk still works.
Regions you may edit: ab.js ground() only; furnish.js furnishAB() from its start down to (not including) the "// --- The upper north flat" line, plus its "--- The ground-floor terraces" and "if (pool)" blocks. Not index.js: describe any garden change it needs in your report.
```

## (d) Floor reviewer

One per floor group, none of whom built it. Schema: `{ findings: [{
severity, where, blueprint, current, fix, measured }], verified_ok,
summary }`.

```text
You are an independent, skeptical reviewer of <floor group> of <project>. The furniture was just re-placed to match the developer's plans and new pieces were modelled. Find what still doesn't match, with measurements. Read-only: don't edit any file in the repo; scratch files only under <scratch>/<round>/.
<shared context block>
Ours: the generator (every piece's id, position and facing), the catalogue's sizes, the seeded scene <repo>/scenes/<id>.json, and the cuts <list>. What was asked: <scratch>/<round>/audit/<key>.txt; what the builders applied, declined and why: <scratch>/<builders' results>.
Method: for every room, draw the generator's walls, door leaves with their arcs, and the furniture's catalogue footprints over the gridded plan crop at the same metres (a short node script; the cut is a cross-check). Compare piece by piece: present; the right kind (corner sofa, chaise or straight; L, U or straight kitchen; single or double bed; round or rectangular table; chair count); within ~0.15 m; facing the right way; the right hand (which end the sink, hob, tall units, chaise or shower glass are at); and pieces the plan doesn't draw. Doors: position; hinge jamb from the emitted wall (checks/doors-dump.mjs), never from the swing name; swing as drawn; each leaf swept to Door.js's full open, 93.6°, against furniture and the other leaves (checks/door-swing.mjs); and whether a leaf left open cuts a room or lobby off from its stair or exit in the real flat (the app's walker passes through a leaf once it is 0.3 open, so no checker sees this).
Declared deviations: don't re-raise these unless you think the reason is wrong, and then say why: <list with reasons>.
Report only real mismatches, most important first, each with its measurement and a concrete fix (the file and line, and the new numbers). List what you verified as matching in verified_ok.
```

## (e) Model and render reviewer

Schema as (d), or `{ severity, where, what, fix, evidence }`.

```text
You are an independent, skeptical reviewer of the furniture models and materials of <project>, comparing our in-app frames with the listing's renders. The user's complaints this round: "<their words>". Read-only: don't edit the repo; scratch files under <scratch>/<round>/.
1. Pairs: <scratch>/pairs/pair-<frames><n>.jpg (models/pair.mjs: the listing's render above our frame from the matching camera; <n: what it shows>). Full-size frames: <scratch>/frames/<frames><n>.jpg; the listing's: <scratch>/<project>/gallery/<n>.jpg. Keep camera and lighting differences apart from model, material and placement issues.
2. Sheets: render every interior piece placed in the space from the repo's catalogue (public/models/furniture) with <skill>/models/views.py and models/sheet.mjs (front 3/4, orthographic side, top-front, back 3/4). Start with every bed, every sofa and every other piece with cushions, lounge and garden chairs included. In the side view, every pillow and cushion should lean back, rest on its support, have no flat plate or slab through it, and have nothing poking through it.
3. Measure what you suspect with <skill>/models/*.py (commands and good readings in models/README.md): lean.py (which way each soft part's top points), profile.py (thickness across a part: thinning steadily to the seam, no plateau), facets.py (the share of split normals; ~0 on cloth), contacts.py (one part's vertices inside another, and how deep), flatbase.py (flat faces where a part sits), coplanar.py (coplanar overlapping faces).
The builders are in <repo>/blender/lib/<project>.py, materials in materials.py. Report concrete, verified defects, most important first: the piece, what is wrong, why it's wrong against the listing, the measurement, the builder function and the fix. List what you verified as fine.
```

## (f) Final integrity reviewer

Run beside a final visual reviewer, (e), and the final floor reviewers,
(d). Schema: `{ findings: [{ severity, where, what, fix, evidence }],
verified_ok, summary }`.

```text
You are a final code-and-data integrity reviewer for <project> in <repo>. Read-only: don't edit any file in the repo; scratch files only under <scratch>/final/. Report only real, verified problems with evidence, most important first, and list what you verified as fine. Check:
1. <repo>/scripts/spaces/<space>/index.js imports, and its output, run through server/scene/validate.js's validateScene as scripts/seed-scenes.js does, equals scenes/<id>.json with 0 validation notes. Report any diff.
2. Every furniture catalog_id in the scene is in public/models/furniture/catalog.json, with its GLB in public/ and dist/; dist/'s catalogue equals public/'s.
3. No two room polygons on the same level overlap (a 2 cm raster), and every room and wall finish exists in shared/catalog.js.
4. blender/export_furniture.py's PIECES ids are unique, and every registered <prefix> id is in the catalogue.
5. Scope (git status and diff): list files changed outside <the expected set>. .claude/launch.json must be restored (a test-server entry with a scratch path must not be committed). Other spaces' scenes must be unmodified (<their mtimes>). Shared changes (catalogue finishes, texture generators) must be opt-in, so other spaces render as before.
6. Run every checker (furniture, stairs, entrance, z-fighting) and summarise the results; explain every blocker. Verify these suspected artefacts against the GLB geometry: <list> (Ladonia: the window walk-in showers' "stair" blockers came from their 2.74 m bounding-box top).
```

## (g) The RESUMING preamble

When a usage limit kills agents mid-task, keep their copies (never
re-copy over partial work). Relaunch only the jobs that returned nothing:
filter the job list, and use the `type: "result"` lines of the
workflow's `journal.jsonl` to see which finished. Put this before the
unchanged brief:

```text
RESUMING: an earlier run of this exact task was cut off by a usage limit<, after about N minutes>. Your copy (<scratch>/<name>) already holds that run's partial work: edits in <blender/ | scripts/spaces/<space>/>, outputs in <glb/, views/, sheets/>, maybe scratch scripts. First diff it against the base (<skill>/copy-merge.sh diff <scratch> <name>, adding <space> for a generator copy; it hides the export redirect lines) to see what's done, and look at the sheets and notes already there. Then continue and finish the remit below. Don't redo good work, but do re-check it. Work efficiently: build only the ids you need, and keep renders at 360 px unless you are checking a detail.
```

## Fix rounds

A fix round reuses (b) and (c) in fresh copies, with this in place of
the audit lines:

```text
An independent reviewer verified the defects below with measurements; their findings, with evidence, are in <scratch>/<round>-results.txt (section "===== <key>"). Apply <ids>. Recheck each against the plan (a gridded crop) or the GLB (a measurement) before applying, and prove each fix with a measurement before and after. Not yours (declined by me; leave alone): <ids>.
```

## Work on the app's own code: survey, lanes, review, integrate, verify

How the performance stages (2026-10-10/15: stand-ins, the baked view, the
live room, the bake) and the usability waves (2026-10-16/17: stage 1,
waves A–C, five clips passes) were built. The harness keeps their
scripts at `~/.claude/projects/<project>/<session>/workflows/scripts/`
(`perf-stage-*.js`, `editor-speed-and-live-sight-*.js`, `ux-*.js`,
`usability-features-survey-*.js`); the briefs and every report are in
that session's `snapshots/reports/`. Servers, outDirs, the merged dist
and the tabs are SKILL.md §0 ("Several lanes at once"); the timing
method is `app-notes.md`, Measuring.

Before any agent starts, write one design file,
`<scratch>/<job>/DESIGN-<wave>.md` (copied to the snapshots), and open
every brief with "read it first, completely". It holds the user's words
and answers verbatim; the standing rules (below); who owns which files;
the contracts between the lanes, as exact interfaces (an object's fields,
an event's name and payload and who settles on it, a GLB node's extras,
where a thing draws); then one part per lane, with the decisions already
made and what to verify, where and against what. A later wave's file
names the earlier ones ("Standing rules: DESIGN-stage1.md, contracts
DESIGN-waveA.md") and says only what is new.

Give each role a schema; let the script pass each agent's result, word
for word, to the next (`${JSON.stringify(report)}`).

### (h) Code survey reader

One per feature area, read-only, before any plan (2026-10-16: eight).
Schema: `{ area, current_state, key_files: [{ path, lines, role }],
facts, proposed_approach, per_view_behaviour, effort, risks,
assets_needed: [{ what, sources, licence }], questions_for_user }`.

```text
You are surveying <app> at <repo> (<the folders and what is in each>; <skill>/{SKILL.md,app-notes.md,reference.md} document it in depth). There are three ways to see a space: <the editor, the public view, the view from above, and how each is drawn>.
STRICTLY READ-ONLY: do not edit, create or delete any file in the repo; do not start servers, browsers or builds; never touch anything on port 3000; do not run npm scripts that write. You may read files, grep, and run small node one-liners that only READ (a GLB's JSON chunk: 12-byte header, then the chunk).
The user asked for (verbatim): "<their words>"
Your job is ONE area of that (below). Find out precisely what exists today, what is missing, and the best way to build it in THIS codebase's idiom, so the lead can write an exact plan. Cite file:line for every claim about the code. Be concrete: name functions, data fields, node names, catalogue ids, which rooms and pieces are affected and how many. Say how the feature must behave in each view, on touch screens, and for other visitors. Give its cost against the frame budget (Pace.js in the editor, FrameGuard.js, StandIns.js, HouseMerger.js and the bake in the public view: anything that moves must not be merged or baked). List assets to obtain, with sources and licences (Mixamo is login-gated: the user signs in, Claude downloads). List the questions only the user can answer.
AREA: <the area; the files to study; what to count>
```

### (i) App lane builder

Two or three lanes at once in the one checkout, not in copies; within a
lane, parts run one after another, each given the last one's report.
Schema: `{ files_changed: [{ path, why }], verified, timings,
not_done_or_uncertain, needs_from_other_lanes, docs_text }`. The
standing rules go into every design file, word for word:

```text
Standing rules (from the user; never break):
- Never touch the user's server on port 3000 or any tab on it. Never write into the repo's published/ or scenes/*.json; never run npm run build (the repo's dist/ is what the user's server serves), npm run seed, bake or furniture; never commit, push, publish or deploy. Do not edit .claude/launch.json.
- Build ONLY into your lane's outDir: cd <repo> && npx vite build --outDir <scratch>/<job>/<lane>-dist --emptyOutDir, served by launch config "<job>-<lane>" on :<port>; HEAD's build is "<job>-base" on :<base>. The servers read the user's published versions read-only and their own scene copies. A rebuilt dist needs a reload, not a restart.
- Open your OWN tab (tabs_create, then pass its tabId to every call); never touch another agent's. After each navigation run boot.js from the tools server (it stubs every non-GET fetch, drives a hidden pane's frames, passes the name prompt). Pictures go to the sink. Time only while holding the baton (http://127.0.0.1:3187/take?me=<you>&t=600, give when done).
- Lint stays at 0 errors (<skill>/undef.config.mjs); <the node tests> keep passing.
- Write code like the code round it: why-first block comments in plain British English, its naming and idiom. No TypeScript, no new dependencies.
- The editor's look and the public view's must not change but for the new feature, and nothing that was there may get slower: measure the same spots against the base build.
- Several lanes work AT THE SAME TIME in the same checkout. Edit ONLY the files your lane owns. If the build or lint fails in a file you do not own, the other lane is mid-edit: wait a minute and retry; never fix it. What you need in a file you do not own goes in your report under "needs from the other lane". Docs are not yours: put what they need in docs_text.
Report (save it to <scratch>/<job>/reports/<label>.md as you go): files changed, a line of why each; what you verified and how (numbers, frame names); timings before and after, both builds at the same spots; what is not done or uncertain; needs from the other lanes; the text the docs need (controls, a link's words, app-notes lines).
```

Then the lane's part: a numbered list of what to build, with the
decisions (keys, reaches, defaults), the fixes found on the way, and the
spots to prove it at, in the editor and the public view, on the base
server and the lane's, with the area's tools (`act.js`, `sit.js`,
`water.js`, `pool.js`, …; checks/README.md).

### (j) Reviewers: adversarial code, and in use

Read-only, none of whom built it; one per lane or pair of lanes, beside
one per view in use. Schema: `{ findings: [{ file, line, severity:
blocker | major | minor, summary, failure_scenario, evidence }],
checked_and_fine }`.

```text
You are an adversarial reviewer. Read <DESIGN> (rules and contracts). Review <what>: git diff / git status in <repo> (earlier waves are reviewed; this wave's files per the builders' lists) and every changed region in context. Builders' reports: <their JSON>. Hunt for real defects only: regressions in any view (the editor's look and speed, Pace, the stand-ins, the public baked view, K, from above, touch; walking, stairs, doors, cars, sitting, opening furniture, windows), contracts broken, state that leaks, physics that can trap or eject the visitor, effects drawn or costing while off, anything moving merged or baked, shader cost and first-use hitches. Confirm each finding in code and, where cheap, in your OWN tab on the lane's server (check its dist is newer than the source first). Do NOT edit repo files.
```

The in-use reviewer gets "Do not trust their checks: work in it as its
user does, on the new build with the base beside it, watching the
console", the promise to hold it to ("nothing of what the editor shows
or does has changed, only its speed"), and the spots; it compares
pictures by number.

### (k) Integrator

Alone, and the only writer from then on. Schema: `{ outcomes: [{
summary, outcome, how }], files_changed, verified, publish }`. Its
brief: re-check each finding and fix the real ones, saying why for the
rest; act on every `needs_from_other_lanes`; build one merged dist and
clone it into every lane's (SKILL.md §0); make any scratch publish and
draft bake (n); lint and the node tests; then the docs in their own
style from the builders' `docs_text` (README, app-notes, reference,
SKILL.md's Corrections log, checks/README, THIRD_PARTY). In the
performance stages the fixer of the reviews (`{ summary, fixed,
declined, checks, gaps }`, "confirm it yourself first") and the docs
writer (`docs:reconcile`: `{ summary, changed, unverified }`) were
separate agents; either way works.

### (l) Measurer and end-to-end verifier

Someone who built nothing, read-only, after the fixes.

- **Measurer** (`{ summary, tables, look, slower, wrong, remaining,
  frames, unknowns }`): runs alone (no Blender running: `ps`; the load
  average noted at each sitting), base and new alternated round by round
  under the baton, a first visit kept apart, then several rounds a cell,
  best / median, draw calls and triangles, the GPU's own time beside it
  (`gtime.js`, `pair-time.js`); pictures in grids, base | new, with the
  numeric difference of each pair. A first figure within target is
  measured again by someone else: wave C's K1 reported its second target
  met at every spot (+0.5 ms at most), and K2's four runs did not
  reproduce it — K1's old-version CPU was 0.5–0.9 ms higher than K2's at
  every spot, its new version's the same.
- **End-to-end verifier** (`{ passed, failed: [{ what, detail,
  file_hint }], timings_table, frames_for_user }`): gets the user's
  request word for word and checks every feature in every view — the
  editor's plain light and preview, the public baked view at steps 4 and
  0, K, from above, touch (the mobile preset), both avatar skins — and,
  against the base, that what was not asked to change looks and runs as
  before. It times the pairs under the baton, saves the frames worth
  showing to the sink as `<wave>-<name>.jpg`, and records that it left
  the repo as it found it (`git status`; `md5 -q scenes/*.json` against
  the md5s taken at the start).

### (m) Docs fact-checker

Last, editing documents only. Schema: `{ summary, corrections,
unchecked }`. "Do not trust the writer: earlier fact-checks of this skill
found twelve and fourteen wrong statements." It checks every backticked
identifier, and every `Owner.member`, against the owner's own file;
every constant quoted with a value against the code; every figure
against the report it came from; every link word and key against the
code that reads it. It corrects in place and touches nothing else, and
lists stale code comments it saw without editing them.

### (n) A lane that publishes a scratch version

The exception to the standing rules, for one lane, named in its design
part (wave B's lane F, then its integrator).

```text
PUBLISH: from your own tab on your own test server (:<port>, PUBLISH_DIR=<scratch>/<job>/pub, BAKE=off), never the repo's published/ and never the user's :3000. Read <scratch>/<job>/pub/<id>/manifest.json before and after. Reload the tab after any change to the server's scene copy, and check in it, before publishing, <the new spec fields and meshes> and every piece loaded (<n> of <n>). Only the publish POST and its runtime PUT may go through (boot.js and harness.js stub the rest; use window.__realFetch or the editor's Publish panel in a tab without the stub). Publish with the options of the user's latest version (its manifest's options). Then draft-bake in the background: PUBLISH_DIR=<scratch>/<job>/pub node <repo>/scripts/bake-public.mjs <id> --samples 128 --size 2048 (Ladonia: about an hour). Say when Blender starts and stops: no lane times anything meanwhile. Write <scratch>/<job>/reports/<lane>-publish.md as soon as the publish exists and again when the bake ends: the version id and what it holds and lacks; its counts (triangles before and after, meshes, runtime KB, collision, viewpoints, seconds); the bake's line from its log; how to open it (latest, ?version=<v>, the user's own ?version=<theirs>).
```

### (o) A targeted pass: one fixer, then one verifier

For what a verifier failed, in one workflow (the clips' fixes 1–4).
Before the fixer starts, copy every file it may touch to
`<scratch>/<job>/<pass>-before/`. The fixer's brief lists ONLY the
changes to make, what to keep from the last pass, and that folder to
revert from (`{ files_changed, done, not_done }`); the verifier gets the
fixer's brief and report verbatim, reruns the last verifier's own
instruments on the same seats or spots so the numbers compare, and
checks a revert against the folder byte for byte.

### (p) Verifier of what moves the visitor's figure

Sitting, swimming, climbing out, other visitors' figures (2026-10-17).

```text
You verify <the pass> in <repo>, read-only: write only under <scratch>/<job>/; never touch scenes/, published/ or the user's server on :3000. Test the build in <dist> on <server>; build nothing (say whether the dist is current). Measure with the skill's instruments, whose rules are not the code's (seat-sweep.js, seat-sweep.py, swim-checks.js, others.js and net.py, figure-fade.js; checks/README.md), or with your own; the fixer's tools only to reproduce their numbers. Every check with both skins (window.__pickSkin "male", "female"), a fresh page each, in the editor and the public view, after await P.avatar.wear(experience), w.seats.dress(P.avatar), w.seats.catalogue(). Measure the skin, not the bones, from the frame before the key. Sweep every seat from <skill>/ladonia-seat-starts.json (or the space's own, taken once): limb capsules against everything but the seat's own piece by the sweep's rule, contact over 2.5 cm, seated, sitting down, getting up and the walks; then the seated pose against the chair's own parts above its cushion (__seats.self, read by seat-sweep.py self). Compare seat by seat with <baseline>: the same starts, the same build but the change. Say where a baseline carries state from a run before (a figure still laid back from the pool). Other visitors: an in-page mirror fed every frame, at 50 and at 15 a second, then two real pages through the server. Time with no other tab of that server open, under the baton. Report what passes and what fails, with numbers, and every place the docs over- or understate.
```

### What it found

The reviews raised 3, 9, 11 and 3 findings (stage 1, waves A, B, C);
after the integrators had fixed them, the end-to-end verifiers still
failed 2, 4, 7 and 3 items. The clips took five passes (a build, then four targeted passes), whose
verifiers failed 7, 8, 7, 6 and 3 items, each something its builder or
fixer had passed: a torso in a backrest the sweep's own-piece rule hid,
a baseline carrying the pool's lay-back, a remote swimmer's waterline at
fast stroke changes. Each of those roles found what the one before it
had passed: leave none of them out.

# Agent briefs for a space's rounds

The briefs that worked, as templates for the Workflow scripts of a round
(`review-rounds.md`): (a)–(g) are from Ladonia's interiors round
(2026-10-03/04), where agents work in copies. The briefs for work on the
app's own code, where agents work at once in the one checkout — (h)–(p):
the code survey reader, the lane builder, the reviewers, the integrator,
the measurer and end-to-end verifier, the docs fact-checker, the
scratch-publish lane, the targeted pass and the verifier of what moves the
visitor's figure, from the performance stages and the usability waves
(2026-10-10/17) — are `../app-testing-and-performance/lane-briefs.md`.
Each agent's prompt is the shared context block (or the design file), its
role's template, and a remit you write fresh. Values in parentheses tagged
"Ladonia" are that project's, not rules.

Placeholders: `<repo>` the repo root; `<skill>` =
`<repo>/.claude/skills/build-property-space` (this folder: the method
files, `checks/`, `models/`, `gridcrop.mjs`, `copy-merge.sh`); `<tools>` =
`<repo>/.claude/skills/app-testing-and-performance` (the in-page tools,
`sink.py` and `serve.py`, the views files; `../app-testing-and-performance/lane-briefs.md` calls that
folder its `<skill>`); `<scratch>` the session's
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
- **Coordinate by small files, not by waiting on agents, and let a
  verifier measure its own way**: lessons from the app lanes (wave B), in
  `../app-testing-and-performance/lane-briefs.md`. Copy every report out of
  the scratch folder as it comes: it does not survive a restart
  (`../app-testing-and-performance/sessions.md`, and `test-servers.md`
  there).
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
Read first: <skill>/research-and-plans.md (measuring the plans), <skill>/buildings.md, <skill>/furnishing.md, <skill>/walkable.md, and <skill>/generator.md and <skill>/furnish.md (the Building frame, furnish.js helpers, FACE, facing conventions).
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
- Read <skill>/buildings.md, <skill>/furnishing.md and <skill>/walkable.md, <skill>/furnish.md (helpers), <skill>/generator.md (door swings and sides), <skill>/numbers-that-worked.md and <skill>/checks/README.md.
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


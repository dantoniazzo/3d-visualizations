# Review loop: builders and blind critics

When the user asks for an exact match, work in rounds. The briefs for
every agent of a round are `briefs.md` (a)–(g); rounds of work on the
app's own code (lanes, integrators, verifiers) are
`../app-testing-and-performance/parallel-lanes.md`.

1. Render every reference view (`__renderSet`) and the plan cuts
   (`__plans`) from the project's views file (`verifying.md`), and make
   blind pairs (`prep_review.mjs`).
2. One fresh critic agent per part (each building's exterior, each interior
   scheme, the bedroom, the terrace, each building's blueprint fidelity), as
   a Workflow with a JSON schema, under 10 agents a wave (if a wave's output
   won't parse, read the `type: "result"` lines of
   `subagents/workflows/<id>/journal.jsonl`; relaunch any critic that died
   at a usage limit). Brief: the part, the X/Y pairs without saying which
   is ours, the camera only roughly matched (separate framing from model),
   the 16 px label bar not part of the scene. Ask for the target's id, a 0–10 score and a top-10 list of
   gaps tagged `[LIGHTING-RENDER] [ARCHITECTURE] [MATERIAL-COLOUR]
   [FURNITURE-ASSET] [ACCESSORY] [PLANTING] [LANDSCAPE]`, `[CAMERA]` last,
   each with measured hexes, sizes, counts and a fix. Scores of 2–5 are
   normal; the ranked gaps are what matter. Critics never edit files.
3. For a big correction against the plans and renders, run the round the
   way Ladonia's interiors round ran. Brief every agent from `briefs.md`.
   1. **Audit**, read-only: one auditor per floor and one per topic
      (bedrooms, living, models). Each makes its own gridded plan crops and
      writes findings with ids (`A0-3`) to `<scratch>/<round>/audit/`. An
      auditor may also write a re-runnable checker (now in `checks/`) or a
      verified patch; apply patches yourself, one at a time (below).
   2. **Decide** what the audits leave open. Where two disagree, crop the
      plan yourself. Fix each new piece's id, size and hand.
   3. **Build in copies**, made with `copy-merge.sh blender-copy` and
      `gen-copy`; the checkers' `--gen`/`--src` flags check a generator
      copy. Blender builders go first, then placement builders, given the
      new pieces' sizes. Use builders only where work is independent, and
      give each its own regions and anchor lines so the merges are clean.
      The renderer and app code stay with you.
   4. **Merge** with `copy-merge.sh merge-blender` and `merge-gen`. Then
      run `npm run furniture -- <prefix>` once (only it writes the real
      catalogue) and `npm run build`. Back up, diff against the scene and
      reseed (`scene-safety.md`).
   5. **Walk and look**: the checkers and `__walk.doors()` (`walkable.md`),
      the references rendered and paired with the listing
      (`models/pair.mjs`), and the plan cuts (`__plans`).
   6. **Independent review** by agents who didn't build: one per floor
      (the generated footprints over gridded plan crops) and one on the
      models (pairs, sheets, `models/` measurements). Tell them the
      declared deviations.
   7. **Fix round** on what they verified, in fresh copies under a new
      scratch folder (`copy-merge.sh` refuses a base the merge has made
      stale). Merge, reseed and walk again.
   8. **Final review**: visual, floors and integrity (`briefs.md` (f)).
      Integrity means the generator's output through validateScene equals
      the scene file with 0 notes, catalogue ids and GLBs exist, rooms
      don't overlap, finishes exist, nothing is changed out of scope, and
      checker artefacts are verified. Fix what it finds yourself and
      re-run every check.

   Ladonia's interiors round had 9 auditors (187 findings), 5 Blender and
   3 placement builders, 6 reviewers, 5 fixers and 4 final reviewers. Each
   review found real defects the round before had passed.
4. Between critic rounds, fix the largest gap each critic names first,
   re-render, and brief fresh critics. Finish with two integration
   critics: one visual against the brief, and one on code and data, like
   the final integrity reviewer (`briefs.md` (f)).

**Agents' patches can silently undo earlier edits** (one written against an
older `kit.js` removed the door widening; 57 narrow doors came back). Back
up the scripts, apply one patch at a time with `git apply --check`, diff
key files against the backup, and re-run every check after each.

**When agents die at a usage limit**, keep their copies, and relaunch only
the dead ones with the RESUMING preamble (`briefs.md` (g)) before their
unchanged brief; how to find what each got done from the workflow's
journal: `../app-testing-and-performance/parallel-lanes.md`.

**After renderer or generator changes**, review the code you changed with
an adversarial review workflow (one reviewer per area, one skeptic per
finding; Ladonia's walkability round confirmed 5 real bugs):
`../app-testing-and-performance/parallel-lanes.md`. What the people work
taught about anything built by agents (real data before building; the
fixer's check is not acceptance; the checker chooses as well as fails;
fixes after the last check are unchecked) is there too.

What the rounds found (Ladonia):

- Renders beat plans where they disagree (the roofs read as gravel and
  planters with a dining set under each pergola; the plans add jacuzzis).
- A critic's "it's not there" can mean "it's covered": the pool's water was
  under its own terrace's paving. Look at the scene before modelling.
- Resolve critic conflicts (sun side, frame colour, pergola colour) by
  cropping the references side by side yourself, not by following the
  latest critic.
- Check neighbouring plots for overlap: B's north hedge, lawn and terrace
  ran through A's south terrace until B moved 2.2 m south.
- A checker's blocker can be its own bounding box. Ladonia's L and U
  kitchens and corner sofas were checked as rectangles, and a window
  shower's 2.74 m box top was read as reaching under a flight. Verify
  against the GLB before moving furniture, then teach the checker the
  shape (`checks/README.md`).

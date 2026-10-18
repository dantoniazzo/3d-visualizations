# Agent briefs for work on the app's own code

The briefs that worked, as templates for the Workflow scripts of a job on
the app's own code: (h)–(p), from the performance stages and the
usability waves (2026-10-10/17), where agents work at once in the one
checkout. (a)–(g), from Ladonia's interiors round (2026-10-03/04), where
agents work in copies — the read-only auditor, the model builder, the
placement builder, the reviewers and the RESUMING preamble — are
`../build-property-space/briefs.md`, with the rest of the lessons on
writing a brief. Each agent's prompt is the shared context block (or the
design file), its role's template, and a remit you write fresh. Values in
parentheses tagged "Ladonia" are that project's, not rules. How the roles
fit together, and what each found, is `parallel-lanes.md`.

Placeholders: `<repo>` the repo root; `<skill>` the skill a template
names, here `<repo>/.claude/skills/app-testing-and-performance` (where the
in-page tools, `undef.config.mjs` and Ladonia's seat starts are); other
skills' files are named by their own folder
(`<repo>/.claude/skills/<name>/`); `<scratch>` the session's scratchpad;
`<id>` the scene id; `<job>` a scratch folder per job of app work, its
lanes' dists, servers' folders, tools and reports under it (2026-10-16/17:
`ux`); `<lane>` a lane's name within it; `<project>` and `<session>` the
harness's folders under `~/.claude/projects/`; `<blender>` =
`/Applications/Blender.app/Contents/MacOS/Blender`. The space-building
placeholders (`<space>`, `<prefix>`, `<frames>`, `<round>`, `<name>`,
`<base>`) are `../build-property-space/briefs.md`'s.

## Writing a brief: lessons from the app lanes

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
  scratch folder does not survive a restart (`sessions.md`;
  `test-servers.md`, After a break).
- **A verifier measures its own way** (p). The fixer's tools carry the
  fixer's rule: a sweep that took the whole chair as the seat's own hid a
  torso 0.22 m into a backrest. Give the verifier the skill's instruments,
  or let it write its own, and have it use the fixer's only to reproduce
  their numbers.
- The rest — give the decisions already made, say where audits disagree
  and who decides, keep file regions disjoint, list what is declined,
  repeat the conventions agents got wrong, done means measured, who may
  write what, keep a wave under 10 agents, plan for an agent that returns
  nothing — is `../build-property-space/briefs.md`, Writing a brief.

## Work on the app's own code: survey, lanes, review, integrate, verify

How the performance stages (2026-10-10/15: stand-ins, the baked view, the
live room, the bake) and the usability waves (2026-10-16/17: stage 1,
waves A–C, five clips passes) were built. The harness keeps their
scripts at `~/.claude/projects/<project>/<session>/workflows/scripts/`
(`perf-stage-*.js`, `editor-speed-and-live-sight-*.js`, `ux-*.js`,
`usability-features-survey-*.js`); the briefs and every report are in
that session's `snapshots/reports/`. Servers, outDirs, the merged dist
and the tabs are `test-servers.md` ("Several lanes at once"); the timing
method is `measuring.md`.

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
You are surveying <app> at <repo> (<the folders and what is in each>; <repo>/CLAUDE.md and the skills it indexes (<repo>/.claude/skills/*/SKILL.md and their topic files) document it in depth). There are three ways to see a space: <the editor, the public view, the view from above, and how each is drawn>.
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
Report (save it to <scratch>/<job>/reports/<label>.md as you go): files changed, a line of why each; what you verified and how (numbers, frame names); timings before and after, both builds at the same spots; what is not done or uncertain; needs from the other lanes; the text the docs need (controls, a link's words, lines for the skills' topic files).
```

Then the lane's part: a numbered list of what to build, with the
decisions (keys, reaches, defaults), the fixes found on the way, and the
spots to prove it at, in the editor and the public view, on the base
server and the lane's, with the area's tools (`act.js`, `sit.js`,
`water.js`, `pool.js`, …; `tools.md`).

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
clone it into every lane's (`test-servers.md`); make any scratch publish and
draft bake (n); lint and the node tests; then the docs in their own
style from the builders' `docs_text` (README; the owning skills'
SKILL.md, topic files and history.md — what were app-notes, reference
and SKILL.md's Corrections log; the checks/README files; THIRD_PARTY).
In the
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
part (wave B's lane F, then its integrator): the PUBLISH brief — its own
server, `PUBLISH_DIR`, `BAKE=off`, a draft bake, the publish report — is
`../publish-and-bake/scratch-publish.md`. It leans on this skill's
`boot.js` and `harness.js` stubs (only the publish POST and its runtime
PUT go through) and on `window.__realFetch` (`browser-pane.md`, Stub
every non-GET fetch).

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
You verify <the pass> in <repo>, read-only: write only under <scratch>/<job>/; never touch scenes/, published/ or the user's server on :3000. Test the build in <dist> on <server>; build nothing (say whether the dist is current). Measure with the skill's instruments, whose rules are not the code's (seat-sweep.js, seat-sweep.py, swim-checks.js, others.js and net.py, figure-fade.js; <skill>/tools.md), or with your own; the fixer's tools only to reproduce their numbers. Every check with both skins (window.__pickSkin "male", "female"), a fresh page each, in the editor and the public view, after await P.avatar.wear(experience), w.seats.dress(P.avatar), w.seats.catalogue(). Measure the skin, not the bones, from the frame before the key. Sweep every seat from <skill>/ladonia-seat-starts.json (or the space's own, taken once): limb capsules against everything but the seat's own piece by the sweep's rule, contact over 2.5 cm, seated, sitting down, getting up and the walks; then the seated pose against the chair's own parts above its cushion (__seats.self, read by seat-sweep.py self). Compare seat by seat with <baseline>: the same starts, the same build but the change. Say where a baseline carries state from a run before (a figure still laid back from the pool). Other visitors: an in-page mirror fed every frame, at 50 and at 15 a second, then two real pages through the server. Time with no other tab of that server open, under the baton. Report what passes and what fails, with numbers, and every place the docs over- or understate.
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

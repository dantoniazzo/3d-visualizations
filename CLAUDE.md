# Working in this repo

A three.js property walkthrough: the editor and its walkthrough at
`/?scene=<id>`, a published public view at `/view/<id>`, spaces generated
from real-estate listings (`scripts/spaces/<project>/`), furniture modelled
in Blender and public views baked there. The method is in seven project
skills (Skills, below; skill paths here are under `.claude/skills/`), which
refer here for what holds for all of them.

The worked example is Ladonia Residence in Kosinožići: generator
`scripts/spaces/ladonia/`, scene id `kosinozici-villas` (older than the
folder name). Anything tagged "Ladonia", or named after its buildings A, B
and C, is that project's value, not a rule.

## The user's standing terms

- **Realism first, and the frame rate as high as possible.** Performance is
  the user's choice (the quality slider); since 2026-10-10, the highest frame
  rate that keeps the most realism (the editor under a plain working light
  until the look is asked for, a published view drawn from its bake by
  default); since 2026-10-16, in their words, "I want the frame rate both in
  the editor and in the public view to be as high as possible": a new feature
  must not slow down what was there, and must cost as little as possible when
  used. Measure that against HEAD at the same spots, both ways round
  (`app-testing-and-performance/`: SKILL.md, Performance; `measuring.md`).
- **Build a listing exactly** — structure, scenery and interiors — so a buyer
  has the feel of the real property. Where the plans can't be followed (a
  door too narrow to walk through), deviate as little as possible and say so.
- **Licences.** Bought-in assets (textures, skies, plants and vases, cars, the
  people's characters and animation clips) may come from any source whose
  licence the user accepts (prefer CC0 or MIT where there is a choice), each
  listed with source and licence in `assets/THIRD_PARTY.md` (cars, avatars and
  people in the README too) for the user to review. Furniture is modelled in
  Blender, not downloaded.
- **A source behind an account** (Mixamo's Adobe login): the user signs in, in
  the browser pane, then you download what they agreed to (`space-people/`:
  SKILL.md, `mixamo.md`). Files a licence lets be used but not passed on
  (Mixamo's) stay git-ignored in `assets/`; whether what is built from them is
  committed is the user's decision: ask (this repository is public). For
  Mixamo they chose to keep the converted files out of git too: never stage
  Mixamo's raw or converted files.
- **Their server.** Never restart or touch the user's server on port 3000,
  never act on a tab of it, never `preview_start` its `walkthrough` entry in
  `.claude/launch.json`. Test on a server of your own over scratch copies
  (`app-testing-and-performance/test-servers.md`).
- **Their `dist/`.** Never build into the `dist/` their server serves while
  work is in progress: test builds go into scratch outDirs, and `dist/` is
  built only at delivery, or left to the user and said so (`test-servers.md`).
- **Their scenes.** Never touch `scenes/wrenfield-house.json`. Back up any
  other scene to the session's `snapshots/scene-backups/` before writing it,
  and `cmp` before every later write. Never undo the user's edits, even ones
  that look accidental: keep them, name them in the report. Never reseed
  their scene for a field: patch that one field with a tool that backs up
  first, and write their file only while their server on 3000 is not running
  (never stop it yourself) (`build-property-space/scene-safety.md`).
- **Their `published/`.** Never write it: a test server may read it, but
  publish and bake into a scratch `PUBLISH_DIR` (`publish-and-bake/`:
  SKILL.md, `scratch-publish.md`). Publish theirs only when the user asks,
  and then from a server of your own, never :3000.
- Never deploy, spend or contact anyone; commit, push, open PRs or merge
  only when asked (Git, below).
- **Big work goes as a plan first** (doable? steps, alternatives, questions),
  then step by step, quick wins first, with measured before/after numbers.
  "Do it" after a proposal means build it, not publish the plan. The plan
  that worked for new app features (a read-only survey first, the user's
  answers word for word into the design file every agent reads, each stage's
  "Still short" split five ways): `app-testing-and-performance/parallel-lanes.md`.
- A request with a time limit: track it with `date`, report before it ends.
- **Keep the skills up to date as you learn.** Whenever the user says
  something is wrong, or you find something worth doing differently, add a
  dated entry naming the project to the `history.md` of the skill it concerns
  (newest first: what the user said, what was changed, where, what is still
  short), and fold its lesson into that skill's method (its SKILL.md or the
  topic file holding it). Each skill is the single source of truth for its
  own method: edit it, don't append duplicates; keep a fact in one place,
  pointed to from the others. A tool worth keeping goes into its skill's
  folder, the same session (Sessions, below).

## What a visitor can do in a space

As the user answered on 2026-10-16, standing until they say otherwise:
- Each visitor has their own state: no sharing of doors, lights, taps, the
  TV or the cars.
- No sound.
- Every kitchen front opens but the dishwasher's and the ovens'.
- Sitting, but no lying down. Swimming, but no diving. Both by Mixamo clips,
  downloaded through their own sign-in (`space-people/SKILL.md`).
- A television plays a real video loop: public domain or CC, about 3 MB,
  fetched when it is first switched on.
- From above, the car's keys are the car's.
- Edit mode gets only the colliders' wireframes.

The defaults they accepted with these, and their own words:
`visitor-interactions/history.md`.

## Sessions

The scratch folder (/private/tmp) is wiped on a restart: keep reports, tools,
tree tarballs and scene backups under
`~/.claude/projects/<project>/<session>/snapshots/`. After any break (a
restart, a limit, a night) take the scene backups and their md5s again, run
`git log -3` and `git status` (the user may have committed), and check
`.claude/launch.json`. In full: `app-testing-and-performance/sessions.md`.

## End every report with the user's steps

Every report that changed a scene, the app or the server ends with them:
- `npm run build` if frontend or `public/` changed and the repo's `dist/`
  was left as it was;
- reload every open app tab before editing (an old tab autosaves its old
  scene over the fix, and keeps the old build);
- restart `npm start` if server code changed;
- re-publish and bake to see it in `/view/<id>`;
- and name any backup of the user's scene and the command that restores it,
  the user's own edits found and kept, and what is left uncommitted.

## Shell and tools on this Mac

- No `timeout`; foreground `sleep` is blocked: wait in a background command
  (`until grep -qE 'Baked in|Traceback' log; do sleep 2; done`) or Monitor;
  a `pgrep -f` waiter matches itself. Long Blender jobs: `run_in_background`
  (foreground is cut at 600 s).
- sharp in scratch scripts: `createRequire("<repo>/")("sharp")`; it applies
  `extract` before `composite`, so composite into a buffer and crop in a
  second pass. Don't name scratch files after stdlib modules (`bisect.py`).
- Scripted edits: assert each anchor occurs exactly once; no broad regexes.
  Import the generator with node before seeding, to catch module errors.
- No ffmpeg: cut and encode video in Blender's sequencer
  (`visitor-interactions/encode-video.py`; `sitting-and-tv.md`, Televisions).

## Git

- Commit, push, open PRs and merge only when asked. End commit messages with
  the Co-Authored-By line the session's attribution note gives (and PR
  descriptions with its line).
- Stage only the feature's files when other work is uncommitted, never the
  temporary test entries in `.claude/launch.json` (all but `walkthrough`:
  `house-test`, `house-new`, `ux-base`, `ux-s` …). Restore it at clean-up
  from `git show HEAD:.claude/launch.json` (or the commit before, if the user
  committed a test entry: Sessions, above), never from a snapshot's tarball,
  which may hold the test entries (`tree-waveC.tgz` does).
- Leave the user's own scene edits out of commits unless asked, and say they
  are uncommitted; never stage Mixamo's files (`.gitignore`, standing terms).
- `gh` is installed and logged in. When a PR has merged, `git fetch`, confirm
  its commit is on main, and branch fresh from main for the next; delete a
  branch (locally and on origin) only when the user says so. If a PR merged
  before a late push, open a new one.
- Check a split of commits builds on its own in a scratch `git worktree`.

## Skills

Seven (each a SKILL.md, topic files, a dated `history.md`: the user's words,
"Still short" gaps not to repeat). In full, Read before, and where the old
build-property-space parts went (older notes cite them): `.claude/skills/README.md`.
- **build-property-space** — a space from a listing, or correcting one (read its history every time).
- **space-people** — the scene's people, the Mixamo flow, `npm run people`, the visitor's clips.
- **publish-and-bake** — publishing a public view and baking it in Blender, safely.
- **baked-view-lighting** — how `/view/<id>` is lit and drawn from its bake.
- **walkthrough-editor** — the editor and the world's code: spec, collision, frames, lights, doors.
- **visitor-interactions** — what a visitor can do: E, keys, Q, driving, sitting, water, swimming.
- **app-testing-and-performance** — test servers, the pane, in-page tools, timing, speed, lanes.

### Read together, for the common jobs

- **A new space**: build-property-space ("Starting a new space", its history
  first); app-testing-and-performance before the first test tab; space-people
  where the user wants people; visitor-interactions for what each feature
  needs of the space (windows, fronts, anchors, seats and screens, a pool's
  steps, a switch per room, a car); publish-and-bake to publish and bake it.
- **Correcting a space** (geometry, furniture, finishes, landscape):
  build-property-space; walkthrough-editor if the world's code draws it wrong.
- **A lighting bug in the public view**: baked-view-lighting (its method, its
  Still short); publish-and-bake if the bake itself is wrong;
  app-testing-and-performance for the server, scratch publish and timing.
- **A new interaction**: visitor-interactions ("Method: adding a kind of thing
  to act on"); walkthrough-editor (rays, collision, frames on demand);
  build-property-space for the piece's GLB side (`furniture-data.md`,
  `blender-builders.md`); space-people for a clip; app-testing-and-performance
  (`speed-architecture.md`, `measuring.md`, `parallel-lanes.md` for a big
  job); publish-and-bake for what the feature needs published.
- **Publishing**: publish-and-bake, then baked-view-lighting to check every mode;
  a server of your own: `app-testing-and-performance/test-servers.md`.
- **Performance work**: app-testing-and-performance, with the code's own skill
  (walkthrough-editor: the editor; baked-view-lighting: the public view).

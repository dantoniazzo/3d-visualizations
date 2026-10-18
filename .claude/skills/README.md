# Skills index and where the old build-property-space parts went

The seven project skills in full, what to read before what, and where each
part of the one skill they were split from now is. Moved from the repo's
`CLAUDE.md` (`../../CLAUDE.md`, always loaded) on 2026-10-18; it keeps the
standing terms, the session rules in short, the shell, git, a one-line
index of the skills and the skills to read together for the common jobs.

## The skills

Seven, in `.claude/skills/`. Each has a SKILL.md (when to use it, its
rules, its method, its pitfalls, its files and tools), topic files with
the detail, and a `history.md` of its dated entries (read it for the
user's words and the "Still short" lists, gaps not to repeat). Paths
from here on are under `.claude/skills/`; each SKILL.md also carries its
own "read X before Y" lines.

- **build-property-space** — a new space from a listing, or correcting
  one: research and the plans, the buildings, the furniture (and what
  each piece carries for the app), the landscape, the look, walking it,
  z-fighting, review rounds, the checkers and model tools. Its
  `history.md` is the space corrections log: read it every time.
- **space-people** — the scene's people (standing, sitting, lying), the
  Mixamo flow (the user signs in, Claude downloads), `npm run people`, and
  the visitor's own clips fitted to the avatars.
- **publish-and-bake** — publishing a public view and baking it in
  Blender, safely: options, the manifest, culling and viewpoints, scratch
  publishes and draft bakes, checking a bake, publishing for the user.
- **baked-view-lighting** — how `/view/<id>` is lit and drawn from its
  bake: modes and quality steps, the resolved lightmap and switches, the
  light meter, the live room (K), the frame-rate guard, the bird's-eye
  view, tone, AO and colour.
- **walkthrough-editor** — the editor and the world's code: the spec and
  validator, the plain light and view scope, stand-ins, rays and the
  collision trees, the colliders view (C), frames on demand, lights and
  fittings, doors, finishes.
- **visitor-interactions** — what a visitor can do: the E picker and its
  providers, the keys and prompts, Q, driving (from above too), sitting
  and the TVs, opening furniture and windows, water and steam, swimming
  and the pool.
- **app-testing-and-performance** — scratch test servers, the browser
  pane, the in-page tools, frame timing (the paired tabs), the speed
  architecture and its rules, and big app jobs as lanes of agents. Read
  it before testing or timing anything in a browser.

Which to read together for the common jobs (a new space, correcting one,
a lighting bug in the public view, a new interaction, publishing,
performance work): the repo's `CLAUDE.md`, Read together.

## Read before

- The first seed and test session:
  `walkthrough-editor/spec-and-validator.md`,
  `editor-plain-light-and-scope.md` and `frames-on-demand.md`;
  `app-testing-and-performance/test-servers.md`, `browser-pane.md` and
  `browser-testing.md`.
- Writing or changing a space's scripts: `build-property-space/`
  `generator.md`, `spec-fields.md`, `furnish.md`, `site.md`,
  `landscape.md`, `numbers-that-worked.md`.
- Placing people: `space-people/people-data.md`, `planner.md`.
- Opening a test tab with anything in its link:
  `app-testing-and-performance/test-tabs.md` (it indexes the editor's and
  the public view's words).
- Adding a ray, or anything that moves by itself:
  `walkthrough-editor/rays-and-collision.md`.
- Adding anything that collides outside the trees:
  `walkthrough-editor/colliders-view.md`.
- Modelling a piece whose fronts open (the parts: labels, axes, how far
  each opens, the light inside a piece, ways in):
  `build-property-space/furniture-catalogue.md`, `furniture-data.md`;
  `visitor-interactions/opening-parts.md`; the room doors
  `walkthrough-editor/doors.md`.
- Choosing a space's windows: `visitor-interactions/windows.md`.
- Adding something to sit on, turn on or open, a key or a touch button:
  `visitor-interactions/picker-and-keys.md`; a shader of its own, and
  making its programs before they are wanted:
  `visitor-interactions/water.md`.
- Adding anything that moves under a group held still, or a light that
  comes and goes: `app-testing-and-performance/speed-architecture.md`
  (What a public view runs every frame) and
  `baked-view-lighting/merged-house.md`.
- Timing anything or comparing two builds:
  `app-testing-and-performance/measuring.md`.
- Publishing, baking: publish-and-bake. Lighting a view:
  baked-view-lighting (a space's own light: `build-property-space/light-and-look.md`).
  Cars: `build-property-space/assets.md`, `visitor-interactions/driving.md`.
  Blender: `build-property-space/blender.md` (a bake's side:
  `publish-and-bake/baking.md`).

## Older names

Until 2026-10-18 all of this was one skill, build-property-space, with a
SKILL.md (§0–§13 and a Corrections log), `app-notes.md`, `reference.md`,
`briefs.md` and `checks/README.md`. Older notes and history entries cite
them; here is where each part now is.

- A tool "in this folder" in an older note means build-property-space's
  folder. The in-page kit, the sink, the tools server, the baton,
  `pair.py`, `net.py`, `seat-sweep.py`, `undef.config.mjs` and Ladonia's
  spots, views, seat starts and boxes are now in
  app-testing-and-performance (`tools.md`); `checks/`, `models/`,
  `copy-merge.sh`, `gridcrop.mjs`, `prep_review.mjs` and `thumbs.py`
  stayed; `checks/people-plans.mjs`, `mixamo.js` and `mixamo-fetch.sh`
  went to space-people; `count-views.mjs` and `bake-replay.py` to
  publish-and-bake; `encode-video.py` and `patch-pool-steps.mjs` to
  visitor-interactions.
- Every frame time in the skills is one Mac's (an Apple M4 Pro) unless it
  says otherwise; how they were taken:
  `app-testing-and-performance/measuring.md`.

The old SKILL.md:
- "Starting a new space" → `build-property-space/SKILL.md`.
- §0 Session hygiene → `app-testing-and-performance/test-servers.md`
  (scratch builds, servers, lanes, after a break), its SKILL.md (before
  saying a change is done, clean-up) and `node-tests.md`;
  `build-property-space/scene-safety.md` (backups, patching the user's
  scene, seeding) and `review-rounds.md` (patches that undo edits);
  `app-testing-and-performance/sessions.md` (the scratch folder,
  snapshots) and the repo's `CLAUDE.md` (the user's steps).
- §1, §2 → `build-property-space/research-and-plans.md`; §3 →
  `buildings.md`; §4 → `furnishing.md`; §5 → `landscape.md`; §6 →
  `assets.md`; §7 → `light-and-look.md` (the published view's light:
  `baked-view-lighting/SKILL.md`); §8 → `walkable.md`; §9 →
  `z-fighting.md`; §10 → `verifying.md` (the in-page tools:
  `app-testing-and-performance/in-page-tools.md`).
- §4b People → `space-people/SKILL.md`.
- §10b Bake, and check the bake → `publish-and-bake/SKILL.md`.
- §11 Review loop → `build-property-space/review-rounds.md` (a space's
  rounds), `app-testing-and-performance/parallel-lanes.md` (the app's).
- §12 Performance → `app-testing-and-performance/speed-architecture.md`
  and its SKILL.md; the public view's part `baked-view-lighting/SKILL.md`.
- §13 Pitfalls → each skill's SKILL.md, Pitfalls (app-testing-and-performance:
  its "The rules that matter here", "Before saying an app change is
  done" and "Performance").
- The Corrections log → each skill's `history.md` (the spaces' own:
  `build-property-space/history.md`).

The old `app-notes.md`, by section (before 2026-10-12 "Publishing, the
public view and baking" meant the sections from "Publishing" to
"Measuring", seven as they then stood, now split between
publish-and-bake and baked-view-lighting, Measuring in
app-testing-and-performance):
- The spec, the validator and the editor →
  `walkthrough-editor/spec-and-validator.md` (its three.js items
  `three-pitfalls.md`).
- The editor's plain light and view scope →
  `walkthrough-editor/editor-plain-light-and-scope.md`, its stand-ins
  `stand-ins.md`; their speed `app-testing-and-performance/speed-architecture.md`,
  an editor test tab `browser-testing.md`.
- Rays and the collision trees → `walkthrough-editor/rays-and-collision.md`.
- The colliders drawn (C) → `walkthrough-editor/colliders-view.md`.
- When the editor draws → `walkthrough-editor/frames-on-demand.md`.
- Lights and fittings → `walkthrough-editor/lights-and-fittings.md`; a
  baked view's switches `baked-view-lighting/switches.md`; lamps in the
  catalogue `build-property-space/furniture-catalogue.md`.
- People → `space-people/scene-people.md`, `avatar-clips.md`.
- Furniture: the catalogue → `build-property-space/furniture-catalogue.md`.
- Doors → `walkthrough-editor/doors.md` (room doors),
  `visitor-interactions/opening-parts.md` (furniture's parts).
- Windows that open → `visitor-interactions/windows.md`.
- What the visitor acts on → `visitor-interactions/picker-and-keys.md`.
- Sitting and the televisions → `visitor-interactions/sitting-and-tv.md`
  (the clips `space-people/avatar-clips.md`).
- Running water and steam → `visitor-interactions/water.md`.
- Swimming and the pool's steps → `visitor-interactions/swimming.md` (the
  clips `space-people/avatar-clips.md`).
- The pool's water → `visitor-interactions/pool-water.md`.
- Finishes → `build-property-space/finishes.md`.
- Publishing and the public view → `publish-and-bake/publishing.md`.
- What a visitor is given → `baked-view-lighting/lighting-modes.md`,
  `frame-guard.md`.
- The bird's-eye view → `baked-view-lighting/birds-eye.md`; driving from
  above `visitor-interactions/driving.md`; its viewpoints at publish
  `publish-and-bake/culling-and-viewpoints.md`.
- How a baked view is drawn → `baked-view-lighting/resolved-lightmap.md`,
  `merged-house.md`, `baked-drawing.md`; what runs every frame
  `app-testing-and-performance/speed-architecture.md`.
- Exposure in a baked view → `baked-view-lighting/light-meter.md`.
- Live room light → `baked-view-lighting/live-room.md`,
  `live-room-bake-light.md`, `live-room-measured.md`.
- Baking → `publish-and-bake/baking.md`, `bake-light-files.md`,
  `bake-time.md`.
- Measuring → `app-testing-and-performance/measuring.md` (two bakes
  compared: `publish-and-bake/baking.md`).
- Tone, AO and colour → `baked-view-lighting/tone-ao-colour.md`.
- Cars → `build-property-space/assets.md`, `visitor-interactions/driving.md`.
- Blender → `build-property-space/blender.md`, `furniture-data.md`.
- The browser pane → `app-testing-and-performance/browser-pane.md`; the
  Mixamo sign-in `space-people/mixamo.md`.
- In-page audits → `app-testing-and-performance/in-page-tools.md`,
  `build-property-space/in-page-audits.md`.
- Shell and tools, Git → the repo's `CLAUDE.md`.

The rest: `reference.md` → `build-property-space/reference.md` (where
each part now is: the generator's, the people's and the view's lists);
`briefs.md` (a)–(g) → `build-property-space/briefs.md`, (h)–(p) →
`app-testing-and-performance/lane-briefs.md` ((n) also
`publish-and-bake/scratch-publish.md`); `checks/README.md` →
`build-property-space/checks/README.md` (`people-plans.mjs`:
`space-people/checks/README.md`; every tool by group:
`app-testing-and-performance/tools.md`).

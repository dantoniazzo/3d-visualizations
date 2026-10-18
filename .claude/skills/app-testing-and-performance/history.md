# History: testing and measuring the app

Newest first. Each: what happened, what it changed in the method, and
where the method now carries it. The figures to quote are in the topic
files; superseded ones are kept here. The long entries of the work these
lessons came from are in the other skills' histories, named below.

- **2026-10-18** — The skill split. The test and measuring kit — every
  in-page tool, the sink and the tools server, the baton, `pair.py`,
  `net.py`, `seat-sweep.py`, `undef.config.mjs`, Ladonia's spots, views,
  seat starts and boxes — moved from `build-property-space`'s folder to
  this one; the tools' headers name the new path. A tool "in this folder"
  in a note written before this day means `build-property-space`'s.
  `checks/` and `models/` stayed with `build-property-space`;
  `people-plans.mjs`, `mixamo.js` and `mixamo-fetch.sh` went to
  `space-people`, `count-views.mjs` and `bake-replay.py` to
  `publish-and-bake`, `encode-video.py` and `patch-pool-steps.mjs` to
  `visitor-interactions` (`tools.md`).

- **2026-10-17** — The usability work's final check (verifyC) and its
  clips passes.
  - The node tests as they stand (`node-tests.md`): bake-batches 40
    made-up sites; capsule-through 9; collider-view 32; collision-tree
    77; frame-guard 27; interact 51; light-regions 55 atlases, 0 differ;
    openables 46; screens 19; seats 39; shut 31; standins 19; water 44;
    windows 30. Superseded the same day: `test-seats.mjs` 35 after the
    second clips pass (a seat's own piece; the way on foot only to its
    own place on a sofa), 39 after the third; `test-collision-tree.mjs`
    77 after the second (`meets`, `meetsAny`, `anyIn`), 80 after the
    third (`depthOf`), 77 again after the fourth, which took `depthOf`
    out with the least-contact ways of sitting.
  - The kit was brought into the skill's folder: the usability work's
    104 scratch files had been in no snapshot (`measuring.md`, The kits
    were scratch until 2026-10-17). Rule since: a tool worth keeping goes
    into this folder the session it is written.
  - The new version's cost over the user's 12 Oct one, quoted from the
    final check alone (`speed-architecture.md`, Measured): A1 living
    +0.35 ms, both ways round. Superseded by it, each by its tab set-up:
    +0.1 (a first measurement that did not reproduce), +0.8 to +1.15
    (lane K's three runs), 0.0 / +0.45 (the integration's two). Wave C's
    K1 reported its second target met at every spot (+0.5 ms at most);
    K2's four runs did not reproduce it (K1's old-version CPU 0.5–0.9 ms
    higher at every spot). Hence "both ways round, by another agent, with
    the GPU timer beside it" (SKILL.md; `measuring.md`).
  - A `preview_start` after a `preview_stop` navigated another tab of the
    pane to the server, twice, the same tab: leave tabs that are not
    yours alone (`test-servers.md`; `browser-pane.md`).
  - The scratch tools of 2026-10-16/17 passed `yaw` to `Player.placeAt`
    and `teleport` in radians (`Math.PI`, 3.14°), hidden because they set
    the camera's angles after (`in-page-tools.md`).
  - `act.js`'s `run()` takes A1's bedroom switch from 50°, by its
    wardrobe's side: from square on, E opened the wardrobe
    (`in-page-tools.md`).

- **2026-10-16/17** — The usability request (one request in five stages:
  stage 1, waves A–C, five clips passes), and the speed won back in
  wave C: `../visitor-interactions/history.md` (2026-10-16/17, and its
  "speed" entry). The approvals pattern at its top is
  `parallel-lanes.md`; the architecture it left — the editor's pieces
  drawn whole, the stand-ins' hold and `drawnScene`, ShutBatcher, the
  Scene held still, ProbeLight at rest, the fridge's light lent round,
  the 12 October version 0.15–0.53 ms faster on this build — is
  `speed-architecture.md`. What each role found (reviews 3, 9, 11 and 3
  findings; verifiers failing 2, 4, 7 and 3 items; the clips' five
  passes 7, 8, 7, 6 and 3) is `lane-briefs.md`, What it found.
  - Node tests that day: `test-interact.mjs` 44 of 44 at first, 51 of 51
    after the waves; since wave B, each mutation-checked:
    `test-openables.mjs` 44, `test-seats.mjs` 33, `test-shut.mjs` 22,
    `test-water.mjs` 44, `test-capsule-through.mjs` 9,
    `test-windows.mjs` 30, `test-screens.mjs` 19; since wave C,
    `test-openables.mjs` 46, `test-shut.mjs` 31, and
    `test-standins.mjs` 19, new. `test-collider-view.mjs` 32 of 32. All
    fourteen passed at the integration of wave C, as did the four of
    before.
  - Measuring moved to 2048 × 1536 in the pane, cells of four rounds of
    three runs of 15 frames, the GPU timer and draws over the whole frame
    (`measuring.md`). One tab measured alone drifted 16.1 → 20.2 ms in a
    minute; the live room's "lasting 0.8 ms" was that drift.

- **2026-10-13/14** — The editor's second sitting and the live room drawn
  unbaked (the work of `../walkthrough-editor/history.md` and
  `../baked-view-lighting/history.md`, 2026-10-13). Every figure the build
  before against the new one in one sitting.
  - The node tests passed again after the editor's and the live room's
    work: bake-batches (40 made-up sites), light-regions (55 atlases,
    none differing), frame-guard (27 of 27), and the new
    `test-collision-tree.mjs`, 64 of 64.
  - The measurer after the fixer found what the fix cost: Wrenfield's
    walk indoors 5 ms a frame slower (a collision tree cut from a wider
    box); taken out the same day, the walk mended on the 14th. The
    realistic preview's "0.3–2.4 ms slower" turned on which tab held which build (`measuring.md`, Two
    tabs, taken in turns). Loads compared: the build before read 4.3–4.5
    s in the first sitting and 6.5–6.7 in the second — compare within a
    sitting only (`speed-architecture.md`).

- **2026-10-13** — A restart of the machine emptied the scratch folder:
  the baton's server, the kit that poses, pins and times, the turn-taking
  runner and the short timers survive only in that session's
  `snapshots/perf-tools.tgz` and `perf-tools-2.tgz` (`measuring.md`).
  `experience.update()` by hand stopped starting a loop of its own (until
  then each call did, and never stopped: 40 calls hung the tab), and the
  editor began drawing on demand: tools that count frames need the pace
  "always" (`browser-testing.md`).

- **2026-10-12** — Performance of the editor and the public view (the
  work of 2026-10-10 to 12): five stages of builders, measurers and
  reviewers, every change timed against the committed code in a frozen
  copy (`../baked-view-lighting/history.md`, 2026-10-12; the editor's
  plain light, `../walkthrough-editor/history.md`). The paired-tab method
  and the baton date from it (`measuring.md`). `test-bake-batches.mjs`,
  `test-light-regions.mjs` and `test-frame-guard.mjs` first passed (40
  made-up sites; 55 atlases, none differing; 27 of 27). As the editor
  opened, the garden was not made, so the people's audit had no hedge,
  planter grass or tree, and zfight.js no car, far ground or
  neighbourhood: tools now ask for the scope (`browser-testing.md`).

- **2026-10-11** — A stub that answered every non-GET swallowed a
  publish: after four minutes of walking, "Couldn't publish: Cannot read
  properties of undefined (reading 'view')"; harness.js now lets
  `/publish`, `/versions/<v>/runtime` and `/bake` through. A frame-taker
  rerun as it was wrote over one grid of a review's frames: change the
  names an earlier agent's tool saves under (`browser-pane.md`).

- **2026-10-10** — A profile's raw rounds, posted from a harnessed tab
  to a server of ours, got the stub's `{}` and never left the page: keep
  `window.__realFetch`, or post through the sink. A warning from a load's
  first frames ("Texture marked for update but no image data found", the
  terrain's normal map) was seen in the pane's console and never by a
  hook put in after the load: start on the scene list and drive the
  frames from the first (`browser-pane.md`).

- **2026-10-06** — The user committed everything, the temporary
  `launch.json` test entry included: after any break run `git log -3` and
  `git status`, and restore `launch.json` from the commit before
  (`test-servers.md`, After a break; `sessions.md`).

- **2026-10-05** — A call to a function that no longer existed passed
  `node --check` and the build, and stopped every view lit live: the
  `no-undef` lint (`undef.config.mjs`) is run before any app change is
  called done. A `SendMessage` to a subagent still working resumed a
  second copy of it: a duplicate publish, a reload mid-publish and a bake
  neither copy remembered starting (`parallel-lanes.md`).
- **Undated** — An unstubbed test autosaved a coffee table into the
  user's scene: stub every non-GET fetch before driving the editor, over
  a test server's copy of the scenes (`browser-pane.md`).

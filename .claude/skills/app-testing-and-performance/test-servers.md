# Scratch builds and test servers

Where work in progress is built, and the servers a test tab is opened on,
so that nothing a test does reaches the user's own server, scenes or
published versions. The standing rule is the repo's `CLAUDE.md` (never
touch the user's server on port 3000 or a tab of it, never
`preview_start` its `walkthrough` entry, never build into its `dist/`
while work is in progress, never write the repo's `published/`); this is
how to keep it. Backing up a scene before a write, and never undoing the
user's edits, are `../build-property-space/scene-safety.md`; publishing
and baking into a scratch `PUBLISH_DIR` are `../publish-and-bake/SKILL.md`
and `../publish-and-bake/scratch-publish.md`.

## The user's server serves `dist/`

- **The user's own server, on port 3000, serves the repo's `dist/`**, and
  they use the app while you work: a build into `dist/` is what their
  tabs load next, finished or not. So work in progress is built into the
  scratch folder — from the repo's root, `npx vite build --outDir
  <scratch>/dist-work --emptyOutDir` (the folder as an absolute path: Vite
  takes a relative one from `frontend/`) — and the repo's `dist/` is built
  once, at the end, when the work is finished and checked (`npm run
  build`), or left to the user and said so: until then their server shows
  none of it. Wherever these skills say `npm run build` for something to be
  looked at in a test tab, it means that scratch build.
  - Never run two builds into one outDir. Lanes building at once each
    build into their own (`<scratch>/<job>/<lane>-dist`) from the one
    checkout. Vite reads the tree as it stands, so a build may catch
    another lane mid-edit: if it fails in a file you do not own, wait a
    minute and build again.
  - After integration, clone one merged build into every lane's dist, so
    that every server serves the same tree: `npx vite build --outDir
    <scratch>/<job>/merged-dist --emptyOutDir`, then for each lane `rm -rf
    <lane>-dist && cp -c -R merged-dist <lane>-dist` (APFS clones).
  - Before trusting a served build, show it is current. Either no file
    under `frontend`, `shared`, `public`, `scripts` or `server` is newer
    than its `index.html` (`find … -newer`), or a fresh build into another
    folder comes out byte-identical.

## A test server of your own

- Test on a server of your own, started in a folder of its own: the
  server takes `dist`, `scenes` and `published` from its working directory,
  and `SCENES_DIR` and `PUBLISH_DIR` move the last two (server/index.js,
  server/store/drivers/fsStore.js, server/publish/store.js). So make
  `<scratch>/srv` with `dist` a link to `<scratch>/dist-work` and `scenes`
  a copy of the repo's, back up `.claude/launch.json` and add
  `{ "name": "house-test", "runtimeExecutable": "sh", "runtimeArgs":
  ["-c", "cd <scratch>/srv && PORT=3108 PUBLISH_DIR=<scratch>/published
  BAKE=off SCENES_DIR=<scratch>/srv/scenes exec node
  <repo>/server/index.js"], "port": 3108 }`; start it with `preview_start`.
  Nothing a test tab does then reaches the user's scenes. A seed (`npm
  run seed -- <id>`, from the repo) writes the repo's `scenes/`: copy the
  seeded file into the server's folder and reload the tab — the server
  reads a scene's file at each request. A second entry with `PUBLISH_DIR`
  at the repo's `published/` shows the user's own versions — to look at
  only, never to publish from or bake against. To compare with the app as
  the user has it, copy `dist/` to `<scratch>/dist-before` before
  anything is built and serve it the same way on another port (SKILL.md,
  "Measure in pairs, never by eye"; `measuring.md`).
  Start this skill's sink and tools server by their paths, in the
  background: `python3 <repo>/.claude/skills/app-testing-and-performance/sink.py
  <scratch>/frames` and `python3 <…>/serve.py <scratch>/frames 3187`
  (run_in_background). Open
  `http://localhost:3108/?scene=<id>`, pass the name prompt and front the
  tab (`browser-pane.md`), then load helpers with
  `await eval(await (await fetch("http://127.0.0.1:3199/harness.js")).text())`
  — the harness first, in every editor tab: it stops a save, which over a
  copy of the scenes is the second guard and over the repo's own the only
  one — likewise your views file and `walk.js`. Or, first after every
  navigation, `boot.js` from the tools server
  (`await eval(await (await fetch("http://127.0.0.1:3187/boot.js?" +
  Date.now())).text()); await window.__dvBoot`), which stubs the saves in
  any tab, passes the prompt, drives a hidden tab's frames and loads the
  harness in an editor tab (SKILL.md, "The tools server and a test tab's
  start"). That tab opens under the
  editor's plain light with the houses alone drawn, by stand-ins, and at
  rest draws nothing: for what a visitor will see, `?preview=1` in the
  link or `await __K.realistic()` (`browser-testing.md`); for a helper of
  your own, `in-page-tools.md`. A
  server serves the build it was started over: build again after any
  frontend or `public/` change, and restart the test server after a
  catalogue, finish or validator change (it runs the repo's `server/` and
  `shared/` as they stood when it started).

## Several lanes at once

- **Several lanes at once** (2026-10-16/17): a test server per lane, named
  `<job>-<lane>`, each on its own port — `ux-base` 3130, `ux-p` 3131,
  `ux-c` 3133, `ux-s` 3134, `ux-w` 3135, `ux-b` 3136 — over
  `<scratch>/<job>/<lane>-srv/`, with `dist` a link to the lane's own
  `<lane>-dist` and `scenes` its own copy, `BAKE=off`.
  - The base server serves HEAD, built once before the first edit
    (`base-dist`; `HEAD-at-start.txt` names the commit). It reads the
    user's `published/` read-only, and is the "before" of every
    comparison.
  - Lanes that need a public view's new code paths share one scratch
    `PUBLISH_DIR` (`pub-w`): a copy of the user's latest version, which
    `?version=<v>` still reaches after newer publishes there.
  - At most five preview servers run at once: stop those a wave no longer
    needs (`preview_stop`).
  - Only the lead edits `.claude/launch.json`; agents are told not to.
    Its `walkthrough` entry is the user's own server on 3000: never
    `preview_start` it.
  - A rebuilt dist needs only a reload. Restart a server (`preview_stop`,
    then `preview_start`) only after a change to the `server/` or `shared/`
    code it runs. A restart may navigate some other tab of the pane to it
    (twice on 2026-10-17): leave tabs that are not yours alone.
  - Agents open tabs of their own (`tabs_create`, then every call with
    its `tabId`), never another's, and close them at the end.

## After a break

- After a usage-limit break or reconnect: `preview_list`, `lsof` the test
  servers' ports (3108, or the lanes'), the sink's 3199 and the tools
  server's 3187, restart what died (the sink only when you next need frames,
  `run_in_background` with the longest timeout, 7200000 ms), re-check the
  scene file against the backup (`../build-property-space/scene-safety.md`),
  redo the tab setup before trusting a frame, relaunch any critic that
  failed, and resume stopped bakes (delete a stopped bake's half-written
  `bake-<stamp>/` folder; `.bake-lock` clears itself once its pid is dead:
  `../publish-and-bake/SKILL.md`). A workflow's agents may all die mid-task
  at a limit (two whole rounds did during the people work): keep their
  copies, diff each against its base to see what it got done, read each
  dead agent's transcript for what it had already found (the workflow's
  journal: `sessions.md`, on the scratch folder), and
  relaunch only the dead ones with the RESUMING preamble
  (`../build-property-space/briefs.md`, (g); `parallel-lanes.md`)
  before their unchanged brief.
- The scratch folder does not survive a restart of the machine: what to
  keep only there, and where the copies go (the workflow's journal, the
  session's `snapshots/`), is `sessions.md`. After any break —
  a restart, a limit, a night — take the scene backups and their md5s
  again before the next write and run `git log -3` and `git status`
  (`../build-property-space/scene-safety.md`).
- Agents' patches can silently undo earlier edits (57 narrow doors came
  back): `../build-property-space/review-rounds.md`.

## Other spaces, and the committed code

- **Other spaces**: check them against the committed code, not by eye — run
  HEAD in a scratch worktree (`git worktree add --detach`, `node_modules`
  symlinked, its own server on another port, the same publish folder) and
  compare the same view. That is how Wrenfield's black published lawn was
  found. Frame times are compared the same way: the committed build — or
  a copy of the build the user's server still has (above) — against yours, a
  tab each, taking turns under a baton (`measuring.md`).

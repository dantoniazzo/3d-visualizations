# Scene safety: backups, patching the user's scene, seeding one space

The user keeps editing their scenes in their own tab while you work, and
their server saves too. CLAUDE.md's standing term holds the rule in one
line: never touch `scenes/wrenfield-house.json`; back up any other scene
before writing it, and never undo the user's edits. This file is how.
Test servers, scratch builds and the user's server on port 3000 are
`../app-testing-and-performance/test-servers.md`.

- Back up `scenes/*.json` before each write after the first seed (a new
  space has none before), somewhere a restart keeps:
  `~/.claude/projects/<project>/<session>/snapshots/scene-backups/`, not
  the scratchpad (it is under /private/tmp and does not survive a restart:
  `../app-testing-and-performance/test-servers.md`). `cmp` before every
  later write: the user keeps editing in their own tab and their server
  saves too (Ladonia, overnight: a counter scaled to 0.8, a sofa nudged, a
  terrace sofa turned round; on 2026-10-17, hours after the pool steps'
  patch, five dining chairs moved or turned and a sixth scaled to 0.88).
  Give any tool that writes a scene that folder: the default of
  `../visitor-interactions/patch-pool-steps.mjs --backup`, `backups/`
  beside the tool, is in the repo and not git-ignored. Before writing the
  user's own file:
  - their server on 3000 not running (`lsof -nP -iTCP:3000
    -sTCP:LISTEN`; never stop it yourself);
  - the file's md5 the one you last saw;
  - a dry run first;
  - the restore command in the report.

  Before any reseed, diff the generator's validated output against the
  scene; carry the user's edits into the generator, or patch only your
  own entries with node (next). A reseed's spec has no `people`: copy them
  out of the scene first and write them back after
  (`../space-people/SKILL.md`; `people` survives a seed and an editor save
  only because the validator keeps it). Never delete user edits that look
  accidental (a coffee table on the lawn) — name them in the report.
- **Patching the user's scene.** When the generator comes to emit a field
  that a reseed would bring in at the cost of every edit (a pool's
  `steps`), never edit the file by hand. Write a tool on the pattern of
  `../visitor-interactions/patch-pool-steps.mjs`. It:
  - refuses a file that does not read back byte for byte as the server
    writes it (`JSON.stringify(…, null, 2)`);
  - copies the file first (`--backup <dir>`);
  - writes through a temporary file and a rename, and refuses if the file
    changed on disk while it ran;
  - reads the result back and shows that the one field is all that
    differs;
  - with `--dry-run`, prints the size before and after and writes
    nothing.

  Try it first on the lanes' copies of the scene, each byte-identical to
  the user's before the patch. Reload every editor tab on the scene before
  the real run, or its next save writes the old field back. Check the
  field in a reloaded tab before publishing from it. Run it on the user's
  file at delivery, and name the backup in the report.
- `npm run seed -- <id>`, never bare `npm run seed` (it rewrites every
  space). Import the generator with node first to catch module errors.
  Read the seed's printed notes every time ("walls[256].openings[1]:
  overlapped the previous opening, dropped") and its room/wall/door
  counts; never `git checkout` a scene file (every one can carry
  uncommitted work — the user's own edits, and since 2026-10-09 Ladonia's
  people). A new spec field is dropped on seed and on every editor save
  until the validator keeps it: `../walkthrough-editor/spec-and-validator.md`
  has the seeding rules and what to do after adding a field (restart the
  test server; tell the user to restart theirs).
- **After any break** — a restart, a limit, a night — take the scene
  backups and their md5s again before the next write, and re-check the
  scene file against the backup: the user may have edited it, or
  committed, meanwhile. What else to restart and re-check after a break:
  `../app-testing-and-performance/test-servers.md`.
- **The user's own edits on record** (keep them; a reseed would lose them
  unless they are carried into the generator):
  - overnight before 2026-10-03: C's counter scaled to 0.8, C1's sofa
    nudged, a terrace sofa turned round;
  - saved 2026-10-17 13:54Z, after the pool steps' patch, in their editor:
    five dining chairs moved or turned (a-f011, a-f116, b-f117, b-f119,
    b-f120) and b-f011 scaled to 0.88. The seat sweep's starts and boxes
    (`../app-testing-and-performance/ladonia-seat-starts.json`,
    `ladonia-w-boxes.json`) were taken before these edits: take them again
    before the next sweep (`walkable.md`, item 8).

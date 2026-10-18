# Sessions: the scratch folder, snapshots, breaks

Moved from the repo's `CLAUDE.md` on 2026-10-18; its summary stays there
(Sessions). What keeps a session's work across a restart of the machine,
what to take again after a break, and where the checks before "done" and
the clean-up are.

- The scratch folder is under /private/tmp and does not survive a restart
  of the machine (2026-10-09: backups, frames and reports gone mid-task).
  Keep nothing only there that cannot be made again:
  - downloads go straight into `assets/`;
  - agents return their reports as their final text, which the workflow's
    journal keeps:
    `~/.claude/projects/<project>/<session>/subagents/workflows/<wf>/journal.jsonl`
    has a `{"type":"result","agentId":…,"result":…}` line for each agent
    that finished (its label is on its `started` line), and
    `agent-<agentId>.jsonl` beside it is the agent's whole transcript.
    Write the reports out again from there;
  - a vetted plan or patch goes into the report's text, entry by entry,
    not only into a scratch file;
  - a tool worth keeping goes into its skill's folder the same session,
    with a header in the style of the others (the usability work's
    hundred-odd scratch tools were in no snapshot until they were brought
    into the skill on 2026-10-17);
  - and keep a copy as you go in
    `~/.claude/projects/<project>/<session>/snapshots/`, which is what
    saved the work across the restart of 2026-10-13:
    - `reports/`: the design files every agent reads, the surveys, each
      agent's report, each workflow's result JSON;
    - `tree-<stage>.tgz` after each stage: the changed and new files
      (`git ls-files -m -o --exclude-standard | tar czf …`);
    - the job's measuring tools as a tarball;
    - `scene-backups/` (`../build-property-space/scene-safety.md`);
    - `assets/`: downloads not in git (the TV's clip and its encoding,
      copies of the Mixamo files);
    - `frames/<stage>/`: the pictures shown to the user;
    - before editing a skill, a tarball of it.

    The harness keeps each Workflow's script
    (`<session>/workflows/scripts/<name>-<wf>.js`) and its run
    (`<session>/workflows/<wf>.json`, with its `result`) beside the
    journals.
- After any break — a restart, a limit, a night — take the scene backups
  and their md5s again before the next write, and run `git log -3` and
  `git status`: the user may have committed meanwhile (2026-10-06:
  everything, the temporary launch.json entry included). The
  `.claude/launch.json` to restore is then `git show <the commit
  before>:.claude/launch.json`, and taking the test entry out at clean-up
  leaves an uncommitted change: say so. What else to restart and re-check
  (servers, the sink, tabs, critics, stopped bakes, dead agents):
  `test-servers.md`, After a break; the RESUMING preamble for a dead agent:
  `../build-property-space/briefs.md`, (g).
- Before saying a change to the app is done (the no-undef lint, the node
  tests, `__act.run()` against the base server's) and the clean-up after
  testing (servers, the sink, `launch.json`, tabs, stored keys, the
  viewport): `SKILL.md`.

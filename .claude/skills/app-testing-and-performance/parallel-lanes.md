# Big app jobs: the plan, the lanes, the reviewers and the verifiers

How big work on the app's own code was planned with the user and built by
agents (the performance stages of 2026-10-10/15, the usability request of
2026-10-16/17), and what each role found that the one before it had
passed. The briefs themselves are `lane-briefs.md`; the servers, outDirs
and tabs the lanes use are `test-servers.md` (Several lanes at once); the
worked example, one request in five stages, is
`../visitor-interactions/history.md` (2026-10-16/17). Rounds of builders
and blind critics on a space (placements and models in copies) are
`../build-property-space/review-rounds.md`. The repo's `CLAUDE.md` says
that big work goes as a plan first; this is that plan's shape.

## The approvals pattern: the plan that worked for new app features

For new features in the app, the plan that worked (2026-10-16):
- First, a read-only survey: one reader per area, whose file:line facts
  the plan and every brief then cite.
- Then the plan:
  - what each new key does;
  - the defaults the user may accept wholesale;
  - the stages, quick wins first;
  - only the questions the survey could not answer. That time there were
    four: the Mixamo sign-in, the TV's content, steering from above, and
    which kitchen fronts open.
- Their answers go word for word into the design file every agent reads.
- Each stage ends with a report whose "Still short" is split into:
  - the user's to decide;
  - found and left;
  - not yet done;
  - unseen (a phone, a visible tab, two visitors);
  - left for the user (a build, a reload, a publish and bake, a commit).

## Survey, lanes, review, measure: what the app work added

What the app work added (2026-10-10/17: the performance work, the live
room and the usability request), for the app's own code built by
agents:

- **Survey before the plan.** One read-only reader per feature area
  (`lane-briefs.md` (h)). Their
  file:line facts are what the plan and every brief then cite (the
  session's `snapshots/reports/survey-<area>.json`).
- **Lanes in one checkout, each owning its files** (`lane-briefs.md` (i)), not copies: app code
  does not merge the way placements do, and two lanes in one file is a
  conflict nobody sees until the build. Write the contracts between lanes
  into every brief word for word. What a lane needs of another goes in its
  report, never into the other lane's files. Two or three lanes a wave,
  then a reviewer per lane or two, one integrator or fixer, and one
  verifier: still under 10 agents.
- **Each lane builds into a scratch outDir of its own** and tests on a
  server of its own beside HEAD's build (`test-servers.md`), one tab timing at a time, by
  the baton.
- **After the builders**: a code reviewer and an in-use reviewer, then a
  fixer, then a measurer who built nothing (`lane-briefs.md` (j)–(m)). On 2026-10-13 the measurer
  after the fixer found what the fix cost: Wrenfield's walk indoors 5 ms a
  frame slower. In wave C a first timing within target did not reproduce
  for two others. Run every comparison both ways round, by another agent,
  with the GPU timer beside it (`measuring.md`).
- **A fix pass can make things worse.** The third clips pass:
  - sat 67–71 chairs a run sideways into their own backs and shells;
  - sent a clock that left others' figures still one frame and doubled
    the next;
  - took least-contact walks that went deeper at more seats than they
    helped.

  The next verifier, rerunning the last verifier's sweep, showed all
  three, and the fourth pass took them out, from the copies kept before
  the third (`<scratch>/<job>/<pass>-before/`: `lane-briefs.md` (o)). So keep the files a pass
  will touch as they were before it, give its verifier the last
  verifier's instruments, and revert what measures worse rather than
  mending forward.
- **A verifier's instrument can be wrong too.** The public view's female
  "before" counts came from a sweep whose figure still lay back from the
  pool. Take the figure's state from the page before each case, and
  strike from the docs any numbers made that way.
- **Last, a docs fact-check against the code**: every identifier, every
  `Owner.member` pair and every quoted constant checked in its owner's
  file, and every figure traced to a report.


## What the people work added, for anything built by agents

The people of 2026-10-09 (`../space-people/SKILL.md` has the same four
lessons with its own examples):

- A build checked on stand-ins proves the plumbing and little else. Six
  builders made the people and checked them on the app's two avatars
  with made-up poses, and each reported its part working. The first load
  of the real characters and clips, in the review, broke the drinks
  (tipped past 45° for half of every clip or more), the sitting (feet up
  to 5 cm under the floor) and the lying (backs 15–25 cm off the
  lounger). Get the real data in before anyone builds on it.
- The fixer's own check is not the acceptance check. After each fix
  round a checker who had built nothing, and measured the thing itself,
  found what the fixer had passed: "0 hits" from rays along the shin
  bones, with calves 1–2 cm inside the sofas. Give every fix round a
  fresh, independent checker; this took three rounds, and the last still
  left a list.
- Have the checker choose as well as fail: Ladonia's audited twelve
  seeds, picked one and tested the hand edits that cleared it.
- What you fix after the last independent check is unchecked: run the
  check's own tool on it again, or say so in the report. Ladonia's lead
  made four small fixes after the checker's audit and said so; the audit
  tool, run on the saved scene a day later, cleared them — and showed
  what the user had since moved (they keep editing:
  `../build-property-space/scene-safety.md`): one of two
  people nudged in the editor now has an arm in the grass the checker
  had moved him out of.


## Review the code you changed

- **Review the code you changed**: after renderer or generator changes, an
  adversarial review workflow (one reviewer per area, one skeptic per
  finding). Ladonia's walkability round: 5 real bugs confirmed (layering
  lost in the baked view, BEHIND sinking decals, glass draw order, gaps
  round the new low walls).


## Running the agents

- Don't `SendMessage` a subagent that is still working: the message can
  resume a second copy of it from its transcript, and the two then edit the
  same files and drive the same tab (2026-10-05: a duplicate publish, a
  reload mid-publish and a bake neither copy remembered starting).
- Each agent opens tabs of its own and passes their `tabId` to every
  call; only the lead edits `.claude/launch.json`; at most five preview
  servers run at once (`test-servers.md`, Several lanes at once;
  `browser-pane.md`, Tabs, with several agents in one pane).
- Coordinate by small files, not by waiting on agents, and have every
  agent save its report as it goes (`lane-briefs.md`, Writing a brief).
- A workflow's agents may all die at a usage limit: keep their copies,
  read each dead agent's transcript, and relaunch only the dead ones with
  the RESUMING preamble (`test-servers.md`, After a break;
  `../build-property-space/briefs.md`, (g)).
- Agents' patches can silently undo earlier edits: apply one patch at a
  time with `git apply --check`, diff key files against a backup, re-run
  every check after each (`../build-property-space/review-rounds.md`).

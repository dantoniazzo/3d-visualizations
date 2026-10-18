# History: people and the visitor's clips

The dated entries of this skill, newest first: what the user said, what was
done, what was measured, and what was left. The lessons are already in
`SKILL.md` and the topic files; take from here what the user cares about,
their own edits (keep them), and the "Still short" lists, which are gaps
not to repeat. When the user says something about the people or the
figure's clips is wrong, or you find something worth doing differently,
add a dated entry naming the project here and put the lesson into the
method (`../../../CLAUDE.md` has the rule).

- **2026-10-16/17** — Ladonia; the visitor's own clips, for the usability
  request (sitting, swimming). The whole entry is visitor-interactions'
  (`../visitor-interactions/history.md`: "Q, driving from above, the
  picker, sitting, the televisions", "the app side of parts, windows,
  running water and steam, the pool and swimming", "mended by reviews and
  verifiers", "Still short"); what it did to this skill's part:
  - The user's answers: sitting, but no lying down; swimming, but no
    diving; both by Mixamo clips through their own sign-in. They signed in
    after wave B, on the evening of the 16th, and the six clips were
    downloaded (3.5 MB; `SKILL.md` step 2, `mixamo.md`); on the 17th they
    were wired in, then four passes more, one lane each.
  - Sitting: the people's Sitting Idle fitted to both avatars
    (`Utils/fitClip.js`, `Avatar.fit`); low seats sat on as a person would
    (`Seats.wayOf`: reclined on the outdoor lounge chairs, knees opened on
    the low sofa and the poufs); sitting down and getting up by Stand To
    Sit and Sit To Stand where the way is clear, else on foot; from afar a
    0.3 s dithered fade out and in, every fade ending in the very
    materials worn before (`avatar-clips.md`).
  - Swimming: `AVATAR_AS` in `blender/import_people.py`; the stroke cut to
    a loop where its pose comes back round (the breaststroke's reach for
    the edge left out), its travel taken out and swum heads-up; the climb
    keeps its travel (`avatar-clips.md`).
  - The clips passes found, and mended: a change of clip during a fade
    popped (bones 0.25–0.55 m); a turn jolted the swimmer's head 7–10 cm;
    the climb's first frame snapped 0.25–0.46 m; the feet went 0.07–0.24 m
    into the pool's floor; a page's first fade, Space the next frame, left
    the figure at 0.991 opacity for good (the lessons: `SKILL.md`, Fitting
    clips to the visitor's avatars).
  - Still short on the figure (as of 2026-10-17): Sitting Idle hangs the
    feet 3–5 cm on 0.49 m chairs; on the 37 cm lounge the toes go 4 cm
    under the floor for a moment as the figure sits and gets up; the
    female figure reclines with the male's clip (the women's is
    `LEFT_OUT`); the breaststroke swum heads-up is steeper in the water
    than a real one (the female's at 65°); the sleeves of a stroke's arms
    come over the water; a remote page sees the fade from afar as a cut,
    a receiving tab whose messages bunch sees a remote swimmer's eyes
    0.46–0.66 m under at stroke changes, and a remote climb runs about 40
    frames ahead and stands still 21–22. The Mixamo downloads and the
    converted `avatar-clips` files stay out of git (`.gitignore`).

- **2026-10-05/09** — The user: "add animated Mixamo characters randomly
  around the properties either standing with a drink in their hands
  talking on the terrace, lying beside the pool tanning, sitting on the
  sofa etc."; asked with options, they chose Mixamo downloads, placements
  generated once, saved and editable, shown in published views behind a
  People toggle, Ladonia only. Offered a list to download by hand, they
  answered: "Can't you download mixamo yourself, I will just login through
  the browser you open?" → the method (`SKILL.md`; their choices stand in
  its step 1), all of it new: 12 characters and 17 clips fetched in their
  session; the conversion, the props, the seat
  measuring, the planner, the runtime and the editor and publish support
  built by six agents on stand-in avatars, reviewed by a seventh, then
  mended against the real set in three rounds (`SKILL.md`, What building
  the people with agents taught; `../app-testing-and-performance/parallel-lanes.md`). Ladonia has 12
  people — seed 12 of the planner as it then stood, four of them edited
  by the checker; the plan was written exactly as audited (the scene's
  diff: `people` alone): a pair
  with drinks by B's pool, three on its loungers, one on a roof lounger,
  three seated (a roof lounge chair, a terrace sofa, an indoor sofa), a
  group of three on C5's roof. **Still short:** the list in `scene-people.md`,
  Still short — chiefly lying legs that hover over the cushion, heads
  off the headrest on some bodies, street clothes on the loungers; the
  last four fixes had no independent audit before the plan was written
  (the audit tool cleared them the next day); the converted characters
  (14 files, 13.8 MB, in `public/models/people/`): asked, the user chose
  to keep them out of git — the repository is public — so `.gitignore`
  holds them, a clone draws the stand-ins, and a deploy needs
  `npm run people` or the files copied in.
  **The user's own edits since** (the scene was saved again 2026-10-10
  00:39, 45 minutes after the report — theirs, in the editor; carry them
  into any re-plan, never undo them): brian (person-9) moved 0.2 m to
  x 10.94 and remy (person-11) 0.1 m to z −19.123 on C5's roof, and a
  terrace chair, `b-f201`, moved 1.7 m and turned. `people-audit.js` on
  the scene as they left it finds brian's arm 1.8 cm in a planter's
  grass (clear at the checker's x 11.14) — told to the user, not
  changed.

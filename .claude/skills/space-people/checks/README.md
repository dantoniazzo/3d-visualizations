# Static checks for a space's people

The node checker of this skill. The other static checks of a built space
(furniture, stairs, doors, entrances, z-fighting, C's grade) are
`../../build-property-space/checks/README.md`; the in-page audit by skin is
`people-audit.js` in `../../app-testing-and-performance/`. Run from the
repo: `node .claude/skills/space-people/checks/people-plans.mjs <scene-id>`.
The script finds the repo four folders above itself (or `REPO=<dir>`), so
it must stay in this `checks/` folder.

## people-plans.mjs: the people planner over many seeds

It plans a space's people (`planPeople` of `shared/people.js`, called as `npm run people:place`
calls it) once for each seed against the seeded scene, the catalogue, `seats.json` and the people
index as built (`public/models/people/index.json`, else the stand-in's), and holds every plan to
the planner's own rules:

- the same plan twice; ids `person-1`… in order; no two on one seat or lounger; no character twice
  until all are used, and none twice in a group;
- standing: on an outdoor floor, `MARGIN` from its edge and from the nearest obstacle (the widest
  margin the site's own `clearOf` passes, by bisection), a group's members `SPACING` apart, no clip
  twice in a group and a drink in every group; any two people `APART` (less `FORWARD_MOST` where
  one of them sits);
- clips: of the pose; none made for the other sex; none of `LEFT_OUT`; a drink only in a hand the
  index says holds (`hand`), and a drinking clip always with the bottle; lying, only a towel,
  sunglasses or an open book, the sunglasses only on a character whose `eyes` the index has;
- seats: on the seat's point (`FORWARD_MOST` forward at most) and facing as it does; feet within
  `FEET_MOST` over and `UNDER_MOST` under the floor (the index's `sits` for that character and
  clip, else the clip scaled by the hips); knees `LEG_CLEAR` and, on a base not open, ankles
  `HEEL_CLEAR` before the front edge; feet short of what stands before the seat; a clip sat back in
  only on a deep soft seat out of doors; a lier on its lounger's point and along it, and no clip
  that sits up of itself on a raised back;
- the order (the first standing group, those lying by a pool, those sitting out of doors, then in,
  the rest) and who the first 4 and the first 8 drawn are (a phone's `people.most`);
- the validator: `sanitizePeople` and `validateScene` keep the plan as it is, and the same a second
  time.

Then it sweeps counts of 0 to 40, the stand-in index and no index at all, three characters' eyes
taken out of the index (none of them may get sunglasses), and `planOne`, the editor's Add, near
people of each pose of seed 3's plan. Last it reads the scene's saved `people` by the same rules,
as notes only: a vetted plan carries hand edits, and the editor may put anyone anywhere.

Run `node .../people-plans.mjs <scene-id>` (the id is required). Flags: `--seeds <n>` (seeds 1 to n,
default 20), `--seed <n>` (that seed alone, its plan listed, the sweeps and the saved plan skipped).
Read the statistics for what a pass still lets through: `standing: nearest obstacle … m`, `sitting:
feet … cm off the floor`, `the first 4 drawn`, and the `clips:` and `seats:` counts (a clip or a kind
of seat never used means a rule too tight or a measurement off). Then look for `No problems.` or
`N PROBLEMS:`, one line a seed and person. It exits 1 on any problem and 2 when it could not run (no
such scene, no `seats.json`, a constant gone), and takes 2.4 s for Ladonia. The limits are read from
the `const` lines of `shared/people.js` itself (the `rules` line prints them), so a change there is
followed, and a constant renamed or removed stops the run with its name. Run it after any change to
`shared/people.js`, to `seats.json` (`npm run seats`), to the index (`npm run people`) or to a
space's furniture, before placing people.

It says nothing of how a plan looks, a clip's arm through a chair's rail or a head off a headrest:
that is `people-audit.js` (`../../app-testing-and-performance/people-audit.js`: in the page, by skin). Ladonia on 2026-10-10: 20
seeds of 12 people (98 standing, 71 sitting, 71 lying), no problems; nearest obstacle 0.40 m,
sitters' feet 0.2 cm off the floor on average and 1.5 at worst; the saved 12 are off none of the
rules. Against a copy of the planner with three rules taken out (the bottle, `LEFT_OUT`, the
standing margin) it listed all three kinds and exited 1. Ladonia-specific: nothing; the scene is the
argument, and the catalogue, `seats.json` and the index are the repo's.

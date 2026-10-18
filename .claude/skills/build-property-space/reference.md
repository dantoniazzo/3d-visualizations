# Reference: where each part now is

The old single reference ("the generator, the spec, the landscape, the
people and the view") was split by topic on 2026-10-18. This skill keeps
the generator's side; read these before writing or changing a space's
scripts:

- `generator.md` — the generator's files, and kit.js's `Building`: its
  frame, placing it on the site, ids, methods, the opening helpers, door
  swings (which jamb `_left` and `_right` hinge at) and the door widening.
- `spec-fields.md` — the spec fields that matter, as `server/scene/validate.js`
  keeps them: rooms, walls, openings (a slim window's `opens`), roofs,
  stairs, floor openings, the other fields, and the heading conventions.
- `furnish.md` — furnish.js's helpers and facing (`FACE`, `SOUTHWARD`, the
  corner shower's hands, `put`, `against`, `kitchen`, `hang`, `dining`,
  `roundSet`, `mirrored`, `bedSet`, `HEADBOARD`, `BED_BASE`, `LOOK`, the
  garden helpers).
- `site.md` — index.js: how Ladonia's site is assembled (placement, street,
  spec assembly, gardens, steps, retaining walls, hedges, pads, holes,
  shrubs, lights, spawns, sky).
- `landscape.md` — the landscape's method and its schema as the builders
  read it.
- `numbers-that-worked.md` — storeys, walls, partitions, doors and
  corridors, the stairs table, site levels, pergolas, clearances, sizes
  the user accepted, furnishing gaps.
- `blender-builders.md` — the `ld-` pieces' Blender builders.

The rest went to the skills that own it:

- The people's data (spec entries, `seats.json`, the people index, the
  planner's constants, the npm scripts): `../space-people/people-data.md`
  and `../space-people/planner.md`. `screens.json`:
  `../visitor-interactions/sitting-and-tv.md`.
- The view's lists — a link's words, the keys a browser keeps, the
  walkthrough's keys, the slider's steps, what a test tab can ask the
  page: `../app-testing-and-performance/test-tabs.md` (the index of where
  each part went), `../walkthrough-editor/links-and-handles.md` and
  `../baked-view-lighting/links-and-handles.md` (read before opening a test
  tab with anything in its link); the publish options, the bake's options
  and the manifest's lighting fields: `../publish-and-bake/publish-options.md`,
  `bake-options.md` and `manifest.md` there.
- The pool's water, steps and swimming depths:
  `../visitor-interactions/swimming.md`, Pools as data (`landscape.md` keeps a
  summary of the `steps` field).

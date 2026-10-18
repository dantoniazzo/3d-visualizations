# The spec, the validator and the editor

What the server keeps of a scene, how a space is seeded, and the editor's
own rules for flights, its camera, room polygons and its collections.
Moved from app-notes.md, "The spec, the validator and the editor" (its
three.js items are three-pitfalls.md). Every field the validator keeps,
and what each means, is ../build-property-space/spec-fields.md: update it
whenever the validator changes. The seeding and backup rules below are
standing rules of the repo's and stand in ../../../CLAUDE.md too.

- `server/scene/validate.js` rebuilds rooms, walls, openings, stairs, floor
  openings, doors, vehicles, furniture, people and spawns field by field: a
  new field or top-level key is silently dropped on seed and on every editor
  save until it is added (as `closetSpec`, `RAIL_SIDES` and `people`
  were). Garden settings must exist
  in `shared/garden.js`'s `GARDEN`. The landscape is kept as given, within
  `sanitizeLandscape`'s limits (shared/landscape.js). After adding a field,
  check it survives `npm run seed -- <id>` and an editor save, and restart
  the test server; the user's own server keeps dropping it until they
  restart it too.
- Read the seed's printed notes every time ("walls[256].openings[1]:
  overlapped the previous opening, dropped") and its room/wall/door counts.
- `npm run seed` without an id rewrites every seeded space: always
  `npm run seed -- <id>`. Back up every `scenes/*.json` before any seed —
  where a restart keeps it, the session's `snapshots/scene-backups/`
  (../../../CLAUDE.md; this note once said the scratchpad, which a restart
  wipes) — and if a bare seed happens, copy the others back from that
  backup. Never `git checkout` a scene file: every one can carry
  uncommitted work — the user's own edits, and since 2026-10-09 Ladonia's
  people.
- The editor: flights rest only on floors (`gravity: "floor"`); its fit
  check must stop at a flight's cupboard ceiling; a flight through an
  opening keeps its head when resized. If the user reports "can't change X,
  it would hit Y", reproduce it in a test editor with saves stubbed first.
  Aim its camera with `editor.view.lookFrom(pos, target)` then
  `editor.view.update()`; it resets the camera on every draw otherwise.
- Room polygons on one level must never overlap: the floors z-fight as
  black stripes and the editor files fittings under the wrong room.
- The editor's collections (Editor/Collections.js) file a piece by the
  room under its bottom: a lamp hung over a terrace or a roof deck is the
  deck's, Outside (as is the furniture on it); a lamp hung from a ceiling
  is filed by its bottom's storey, which can be the storey above's level
  index when storeys of two buildings interleave (Ladonia's A tracks at
  2.55 m read as C's first floor, 2.2) — known, not fixed.

## Elsewhere

- Adding a field to what a space's generator emits, and reading the seed's
  printed notes as a space is built: ../build-property-space/SKILL.md and
  spec-fields.md there.
- `people` survives a seed and a save only because the validator keeps it:
  ../space-people/SKILL.md. A reseed's spec has no `people`: copy them out
  of the scene first and write them back after.
- A slim window's `opens` (the validator keeps two keys), the editor's
  *Opening* property, StructureBuilder's slim branch and the invisible
  "Window" pane in the static tree: ../visitor-interactions/windows.md;
  the space's side (which windows open, `OPENS_FROM_SILL`):
  ../build-property-space/buildings.md.
- A person in the editor (`PersonEditable`): ../space-people/scene-people.md.
- Patching a field into the user's scene without a reseed
  (`patch-pool-steps.mjs`'s pattern), backing up and `cmp` before every
  write, never writing their file while their server on 3000 runs:
  ../../../CLAUDE.md.

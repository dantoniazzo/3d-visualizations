# People at run time: the slider's caps and what `World/People.js` offers

The people's column of the slider's steps, and the calls the editor and the checks make. The rest of each step (resolution, shadows, the live room, water) is `../baked-view-lighting/quality-steps.md`; the phone rules that follow from these caps are `SKILL.md`, People's cost and the phone rules.

## `QUALITY.people` per slider step (`frontend/Experience/Utils/device.js`)

| step | `most` | `every` | `near` (m) | `farEvery` | `still` (m) |
|---|---|---|---|---|---|
| 0 Fastest (the slider's lowest; a software renderer's default) | 4 | 2 | 8 | 4 | 30 |
| 1 Fast (a phone's or tablet's default) | 8 | 1 | 10 | 3 | 45 |
| 2 Balanced | 16 | 1 | 12 | 3 | 60 |
| 3 High | 32 | 1 | 15 | 2 | 90 |
| 4 Maximum realism | all | 1 | 15 | 2 | 120 |

At most `most` are drawn; each is animated every `every` frames within `near` of the camera, every `farEvery` beyond, and held still beyond `still` or out of sight.

## `World/People.js`: what the editor and the checks call

- `world.people` exists in the editor and in a public view. `ready` is a promise; it emits `"ready"` after a rebuild and `"change"` (with the id) when one person is added, removed or changed.
- `rebuild(spec?)`: everyone again from `spec.people`. `add(entry)`, `remove(id)`.
- `update(entry | { id, ...fields })`: moved or turned, the person is placed again in the same group; a changed character, pose, clip, prop or seed builds a new one.
- `readBack(id)`: after the group itself was moved or turned (a gizmo drag), writes the entry's `position` and `rotation` from it.
- `get(id)` (the record), `list` (the records built, in the spec's order), `count` (as many as the spec has), `objectFor(id)` (its group), `personOf(object)` (the id of the person a ray's hit is part of).
- `show(on)`: all of them and their collision boxes, the "people" scenery. `setFilter(fn | null)`: only those `fn(entry)` is true for. Hide through these, never `group.visible`, which People overwrites.
- `index()`: a promise of the index as the app reads it (`characters`, `clips`, `props`). `tick(delta, hold)` is the world's per-frame call (`hold`: a frame of an editor at rest, drawn only to look, in which nobody's clip moves on); `update` is the editor's.
- A person's group is `person:<id>` with `userData { kind: "person", id, label }`, under the root `people`. A record carries `entry`, `group`, `model`, `meshes`, `character`, `clipEntry`, `info` (measured at the clip's start: seat, soles, back, head), `sphere` (culling) and `collisionBox`.

- A cap by quality step must not hold in the editor's edit mode, or what is
  being placed can be neither seen nor picked: edit mode draws all
  (`../walkthrough-editor/SKILL.md`).
- `tick` is the frame's call and `update` the editor's because a class with
  two methods of one name keeps the later one, silently: People's
  per-frame `update(delta)` once replaced the editor's `update(person)`, and
  the `no-undef` lint does not see it (`../app-testing-and-performance/SKILL.md`).

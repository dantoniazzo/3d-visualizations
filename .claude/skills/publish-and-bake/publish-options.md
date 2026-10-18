# Publish options

What a version is published with: the Publish panel's options, as
`shared/publishOptions.js` defines them and a version's
`manifest.options` keeps them. As the code stood on 2026-10-12
(`shared/publishOptions.js`, `scripts/bake-public.mjs`,
`blender/bake_public.py`). The `lighting` and `quality` options are read
by the view: how each mode and step is drawn is
[../baked-view-lighting/lighting-modes.md](../baked-view-lighting/lighting-modes.md).
Publish for the user with the options of their latest version, read from
its manifest ([SKILL.md](SKILL.md)).

### Publish options (`shared/publishOptions.js`; a version's `manifest.options`)

| option | values (default first) | what |
|---|---|---|
| `cull` | `true`, `false` | Faces no visitor can see removed, the rest turned to draw single-sided. |
| `merge` | `true`, `false` | One mesh a material and floor. |
| `compress` | `true`, `false` | Draco. The bake compresses its view by it too. |
| `glass` | `true`, `false` | Plain see-through glass (never set it off: no refractive glass anywhere, [../build-property-space/light-and-look.md](../build-property-space/light-and-look.md)). |
| `bake` | `final`, `draft`, `off` | The bake the Publish panel starts after the publish: 512 samples at 4096, 128 at 2048, or none — lit live, as in the editor. A bake from the terminal rewrites it (`final` from 256 samples up). |
| `quality` | `auto`, `low`, `high` | The step for everyone who has not chosen: the device's own, 1 or 3 — under the device's ceiling. |
| `lighting` | `auto`, `static` (`phones`: retired, read as `auto`) | Once baked: `auto` is "baked" at steps 2–4 and "static" at 0–1; `static` is "static" on every device, and its bake is made for that alone. |
| `scenery`, `sceneryKnown` | lists of ids (`shared/scenery.js`) | The pieces the version has, and the pieces there were to choose from when it was published. |

The one preset, "Lit live — as in the editor" (`PUBLISH_PRESETS`): everything on, `bake: "off"`, `quality: "auto"`, all the scenery. `/view/<id>` opens the latest version published, baked or not.

- The browser remembers the panel's options: `publish-options`
  (`localStorage`, the Publish panel's options as JSON, written by a
  publish). Remove what a test set
  ([../app-testing-and-performance/test-tabs.md](../app-testing-and-performance/test-tabs.md)).
- A list stored as "the pieces kept" (the publish options a browser
  remembers, a manifest's) leaves out every piece added later: store the
  pieces known beside it (`sceneryKnown`). Before it did, options a
  browser remembered from before there were people came back with People
  unticked, and a publish silently dropped everyone
  ([../space-people/scene-people.md](../space-people/scene-people.md)).
- The `phones` value of `lighting` is what `auto` gives now: kept for old
  versions, no longer offered (`retired` in `shared/publishOptions.js`).
- A test server started with `BAKE=off` publishes with the bake off
  whatever `bake` says; a draft from the terminal then marks
  `options.bake` "draft" ([publishing.md](publishing.md)).

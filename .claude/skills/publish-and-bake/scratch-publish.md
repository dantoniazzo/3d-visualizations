# A lane that publishes a scratch version (brief (n))

The brief for the one lane of a big app job that publishes and
draft-bakes into a scratch folder. It is role (n) of the lane briefs,
whose list ([../app-testing-and-performance/lane-briefs.md](../app-testing-and-performance/lane-briefs.md))
points here; how lanes, integrators and verifiers are run is
[../app-testing-and-performance/parallel-lanes.md](../app-testing-and-performance/parallel-lanes.md).
It leans on the testing skill's page tools:
[boot.js](../app-testing-and-performance/boot.js) and
[harness.js](../app-testing-and-performance/harness.js) stub every
non-GET request but `/publish`, `/versions/<v>/runtime` and `/bake`, and
keep the page's real fetch as `window.__realFetch`. The test server it
publishes from is set up as
[../app-testing-and-performance/test-servers.md](../app-testing-and-performance/test-servers.md)
says, with its own `PUBLISH_DIR` and `BAKE=off`.

## (n) A lane that publishes a scratch version

The exception to the standing rules, for one lane, named in its design
part (wave B's lane F, then its integrator).

```text
PUBLISH: from your own tab on your own test server (:<port>, PUBLISH_DIR=<scratch>/<job>/pub, BAKE=off), never the repo's published/ and never the user's :3000. Read <scratch>/<job>/pub/<id>/manifest.json before and after. Reload the tab after any change to the server's scene copy, and check in it, before publishing, <the new spec fields and meshes> and every piece loaded (<n> of <n>). Only the publish POST and its runtime PUT may go through (boot.js and harness.js stub the rest; use window.__realFetch or the editor's Publish panel in a tab without the stub). Publish with the options of the user's latest version (its manifest's options). Then draft-bake in the background: PUBLISH_DIR=<scratch>/<job>/pub node <repo>/scripts/bake-public.mjs <id> --samples 128 --size 2048 (Ladonia: about an hour). Say when Blender starts and stops: no lane times anything meanwhile. Write <scratch>/<job>/reports/<lane>-publish.md as soon as the publish exists and again when the bake ends: the version id and what it holds and lacks; its counts (triangles before and after, meshes, runtime KB, collision, viewpoints, seconds); the bake's line from its log; how to open it (latest, ?version=<v>, the user's own ?version=<theirs>).
```

What wave B's lane F and its integrator checked before and after such a
publish, with the counts they got, is [publishing.md](publishing.md)
("How the scratch publishes were made and checked").

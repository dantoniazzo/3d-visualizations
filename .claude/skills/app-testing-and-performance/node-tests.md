# The node test suite

Fourteen tests in `scripts/test-*.mjs`, about a minute together. Run them
all before saying a change to the app is done (SKILL.md):

    for t in scripts/test-*.mjs; do node "$t" | tail -1; done

A test that covered behaviour since taken out is changed with it, and the
report says so. Since wave B (2026-10-16) each new test is
mutation-checked: a rule broken on purpose must fail it. The counts below
are the last full run's (2026-10-17); the earlier counts, and when each
grew, are `history.md`. Each skill's SKILL.md names the tests that hold
its subsystem; the owner is given with each.

## The tests, what each holds, and its count

- `node scripts/test-bake-batches.mjs` — the bake's passes: 40 made-up
  sites, by the rules. `../publish-and-bake/`.
- `node scripts/test-light-regions.mjs` (needs `python3`) — the rooms'
  texels as the bake and the view each work them out; it holds the view's
  and the bake's idea of each room's texels together: 55 atlases, 0
  differ. `../publish-and-bake/`.
- `node scripts/test-frame-guard.mjs` — the frame-rate guard's decisions
  (`shared/frameGuard.js`): 27 of 27. `../baked-view-lighting/`.
- `node scripts/test-collision-tree.mjs` — the collision trees
  (`World/Collision.js`): `buildOctree`'s split against the committed
  one, a `TreeKeeper`'s tree after edits against a tree built from
  scratch, and the tree walked against while another is built a slice a
  frame; since the second clips pass (2026-10-17) `meets`, `meetsAny`
  answering as `meets` does of each capsule, and `anyIn`: 77.
  `../walkthrough-editor/`.
- `node scripts/test-interact.mjs` — `shared/interact.js` (what is aimed
  at against a transcription of Player's rules before it over 8,000
  seeded looks, the keys, their scopes, every touch icon's CSS) and
  `World/Whereabouts.js` over published Ladonia (`PUBLISH_DIR`, else the
  repo's `published/`; skipped with a note where there is none): 51 of
  51. `../visitor-interactions/`.
- `node scripts/test-collider-view.mjs` — the colliders' gather (each
  triangle exactly once from a `buildOctree` tree, a mended keeper's, the
  meanwhile union and a stale one, whole or in a region), their kinds (a
  pool's steps drawn as stairs) and their shapes: 32 of 32.
  `../walkthrough-editor/`.
- `node scripts/test-openables.mjs` — a part's plan against its
  neighbours, its own piece left out, met while shut ignored, the way-in
  rule, the cache; since wave C a fridge's light out of the scene until
  one of its kind is lit, in once its shaders are built, out four seconds
  after, and `warm`: 46. `../visitor-interactions/`.
- `node scripts/test-seats.mjs` — knees opened on a turned, scaled
  armature; another visitor's way of sitting by its name; a seat's own
  piece (its label within its footprint, not the next chair's nor the
  table's) and, for the way on foot, only its own place on a sofa; which
  seats turn (a dining chair and a pouf, not a sofa's place, an armchair
  or a lounge chair sat back in), `poseFor`'s sides and `back`, a sofa's
  place never turned, and a chair's own piece turned to a side (the seat
  and what is under it — since the fourth clips pass not its back — and
  not an arm): 39. `../visitor-interactions/`.
- `node scripts/test-shut.mjs` — the public view's merging, lifting and
  lighting of shut parts; one mesh a look on every floor and
  `showFloors`; sashes hidden at their group; what shut doors enclose,
  and its mark for a room shown live: 31. `../baked-view-lighting/`.
- `node scripts/test-water.mjs` — the water's arithmetic, Ladonia's 70
  fixtures in both views, aim, standing in a shower, light, floors,
  counts, steam's turns: 44. `../visitor-interactions/`.
- `node scripts/test-capsule-through.mjs` — a head held under a
  one-sided ceiling, walking unchanged: 9. `../walkthrough-editor/`.
- `node scripts/test-windows.mjs` — the windows that open: 30.
  `../visitor-interactions/`.
- `node scripts/test-screens.mjs` — the televisions: 19.
  `../visitor-interactions/`.
- `node scripts/test-standins.mjs` — the editor's stand-ins holding
  units still: every world matrix as three's full walk makes it, the
  scene handed to three drawing exactly what the scene would, through
  moving, opening, a mesh or a light coming in, a hidden wall, a swapped
  child, letting go, `?still=0`: 19. `../walkthrough-editor/`.

All fourteen passed at the integration of wave C (2026-10-16), and again
at the counts above on 2026-10-17.

## By skill

- `../publish-and-bake/`: test-bake-batches, test-light-regions.
- `../baked-view-lighting/`: test-frame-guard, test-shut.
- `../walkthrough-editor/`: test-collision-tree, test-collider-view,
  test-standins, test-capsule-through.
- `../visitor-interactions/`: test-interact, test-openables, test-seats,
  test-water, test-windows, test-screens.

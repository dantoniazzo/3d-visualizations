# Walkthrough editor: history

The dated entries of the editor and the walkthrough's world, newest first:
what the user asked, what was done and what was left short, and the
measurements later work replaced. Moved from build-property-space's
Corrections log and app-notes.md. The lessons are already in SKILL.md and
the topic files; read this when a date, a figure's provenance or a "Still
short" matters, and add a dated entry when the user says something about
the editor is wrong or a lesson is worth keeping.

## When each part of this skill was written

- 2026-10-05: lights switched live (lights-and-fittings.md).
- 2026-10-12: the editor's plain light and view scope (the entry of that
  date in ../baked-view-lighting/history.md).
- 2026-10-13: "Rays and the collision trees", "When the editor draws" and
  the editor's stand-ins (which then stood in the plain light's section of
  app-notes.md).
- 2026-10-16: "The colliders drawn" (C); wave B drew the editor's pieces
  whose fronts open whole (their stand-ins), and wave C made the stand-ins
  hold still what they draw.

## Entries

- **2026-10-16/17** — Ladonia (`kosinozici-villas`); the usability work,
  one request in five stages: the colliders as wireframes, Q, driving from
  above, opening furniture and windows, sitting and the TV, water and
  steam, the pool and swimming. The entry is
  ../visitor-interactions/history.md; for this skill:
  - *The colliders as wireframes* (**C**, **Shift C** seen through
    everything; `Experience/Colliders.js`, `World/ColliderView.js`;
    colliders-view.md): hidden it costs nothing (its code is not even
    downloaded); shown +0.5–1.5 ms a frame, seen through +0.5–2.9 (step 4,
    2048 × 1536); in a public view only with `?debug` or `?colliders`, the
    whole house, 92,799 triangles.
  - *A piece with parts collides as its body and a shut box a part*
    (`SceneBuilder.collisionOf`, wave A): the editor's tree is what a
    publish collides, 971,018 triangles each.
  - *The jump-out bug* (`Collision.capsuleIntersect`'s `from`,
    `headroom`; rays-and-collision.md): running and jumping at 24 of 32
    upstairs sill windows threw the visitor up through the wall and out.
    Now none, and walking, stairs, doors and cars are bit for bit as
    before.
  - *Speed*: the editor draws a piece with parts whole (A1's kitchen 1,138
    → 910 draws), holds still what its stand-ins draw and leaves it out of
    three's pass (1.6–1.9 ms a frame: at or under HEAD at A1's kitchen and
    living room, the upper U kitchen and in edit mode) — stand-ins.md.
  - Mended by the reviews, among the rest: the editor's header toggle
    squeezed the floor picker at 1280 px (stage 1; colliders-view.md).
  - Two of wave B's faults became pitfalls here (SKILL.md): the water was
    drawn for the frame before's camera (`World.afterCamera`), and the
    orbit camera's boom shrank for good over the pool (OrbitControls
    limited, not moved after).
  - *Still short, this skill's*: the editor's colliders region is gathered
    again in one go, 8–12 ms every 5 m walked; in a public view under
    post-processing a collider shows through what collides with nothing
    over it (a pergola's slats, a car's body), and a piece's part boxes
    are drawn in its mesh colour; the third-person boom ignores door
    leaves and passes through people.
  - `node scripts/test-collision-tree.mjs` read 64 of 64 on 2026-10-14 and
    77 on 2026-10-17 (the counts of every test:
    ../app-testing-and-performance/node-tests.md).

- **2026-10-13 (worked from the evening of 2026-10-12 to the 14th)** — Two
  requests. The first, the user's on seeing K light a room's lamps live
  over its bake, is ../baked-view-lighting/history.md (*K draws rooms
  unbaked*). The second, on the performance work's list of what was left
  in the editor: "Do the edit mode suggestions that were left to do". →
  For each, builders, a
  measurer, reviews and a fixer; every figure this M4 Pro's, its pane
  hidden, the build before against the new one in one sitting
  (../app-testing-and-performance/SKILL.md, measuring in pairs).
  - *The editor* (stand-ins.md, rays-and-collision.md,
    frames-on-demand.md): it draws the house as one mesh a material and the
    furniture as instances (`World/StandIns.js`), answers every ray from
    an index (`Utils/rays.js`), mends its collision trees after an edit
    (`Collision.js`'s `TreeKeeper`), draws a frame only when something has
    changed (`Pace.js`) and outlines a selection without drawing the scene
    again (`Editor/SelectionOutline.js`). Ladonia, before → after: the
    whole property 24.3 ms a frame → 10.9 (41 → 92 a second; 9,541 → 1,438
    draw calls), one villa 20.0 → 10.3, one room 6.0 → 5.9; walking —
    renderer, world and camera — the living room 20.0 → 8.7, the pool 36.9
    → 12.1, the street 35.8 → 11.3; a piece selected over a villa 33.9 →
    11.8; a drag's pointer move 101 ms → 2.8; leaving edit mode 2.4–3.0 s
    → 26–32 ms; an idle edit view, drawing all the time → 19 frames in 10
    s; load to a furnished, walkable scene 6.5–6.7 s → 2.2–4.1. Nothing
    the editor does changed: the saved scene byte for byte, a publish's
    files and stats equal, the pictures under the plain light equal to
    rounding.
  - *What the reviews found, mended on the 14th.* The editor: a piece
    carried beyond all the others (or its undo) had the furniture's whole
    tree built again, and half a second of walking against the pieces as
    they had stood — the tree was given room round it (a mend, 10 ms:
    taken out again the same day, below), and one still being built was
    finished in the frame the visitor first moves; a publish whose
    realistic light fails would have been taken
    with four fifths of the meshes off the layer a merge takes; sources
    only reordered left the old tree; seen from high over the property,
    which of two surfaces a millimetre apart showed was chance (the edit
    view's near plane now goes out with its distance). K: a room walked
    into from out of doors was 76 levels too bright — not the lamp the
    review named, but a dash of twelve texels of the sun in a pane across
    the garden, in the room's probe — and then 13–19 too dark (its probe
    taken through its own windows as seen from outside); the upper half
    of a flight of stairs was the bake's until the bathroom under it was
    opened; the façade above and below every window was drawn live. Two
    findings were not real: the editor has no view from above to come
    apart in, and the outline's edges and blur were made at half size
    already.
  - *How it was worked*: built into the scratch folder and tested on
    servers of their own over a copy of the scenes, the user's server and
    the repo's `dist/` untouched throughout — now the rule of
    ../app-testing-and-performance/test-servers.md; `zfight.js` taught to
    pass over the stand-ins (../app-testing-and-performance/in-page-tools.md). The lesson of the last
    step: the measurer who came after the fixer found what the fix cost.
  - **Still short**:
    - *Slower than before, found by the final measurement — the first
      mended on the 14th, the second not.* Walking indoors in Wrenfield's
      editor: the room given to the furniture's collision tree had left
      it two levels deep, its largest leaf 17,989 triangles, the
      visitor's collision step 10.9 ms a frame where it cost none (a
      whole walking frame 15.3 ms for 9.8), and the editor's walk ending
      elsewhere than before wherever the visitor touches furniture
      (inside a sofa 30 cm). The room is gone: the furniture's tree is
      cut from its own box again and is the build before's in Ladonia,
      Wrenfield and Ashgrove through thirteen edits each (box, cells,
      every leaf's triangles in order), the walk equal to the digit
      (villa A's 30 doors, seven routes, 44 drops onto and beside
      furniture: 703 coordinates), the collision step 0.004–0.012 ms on
      Wrenfield. An edit that changes the furniture's box (the outermost
      piece moved, one put beyond the rest) has Ladonia's tree built
      again a slice a frame — Tab back in 19–35 ms, half a second of
      frames of 11–17 ms (one of 36–42), walked meanwhile against the
      tree as it was with the changed pieces put right in it. The
      realistic preview: 0.3–2.4 ms a frame more inside `render()`, same
      draw calls — looked for on the 14th and not mended: the same calls
      to the GPU's driver in both builds (43,076 and 43,105 a frame),
      nothing of the editor's running in the frame; what is slower is
      three's own walk of the same scene when it comes cold (its one
      `updateMatrixWorld` a frame 1.5–1.8 ms for 1.35–1.45; the same call
      in a loop 0.64–0.67 for 0.63–0.64), and how much slower turns with
      the tab a build is read in (../app-testing-and-performance/SKILL.md,
      measuring).
    - *The user's to decide*: in edit mode at rest the people and the
      pool's water stand still (they move while frames are drawn for any
      other reason, and while a person is selected) — before, they always
      moved; the heartbeat still draws two frames a second at rest.
    - *K*: what was left of the live room is ../baked-view-lighting/history.md.
    - *The editor, left*: 1,438 draw calls of what is one of a kind,
      see-through or moving (door leaves, glass, 365 single furniture
      meshes); a view of one room gains nothing (6.0 → 5.9 ms), a room in
      focus is slower (3.7 → 4.2) and X-ray gains little; Wrenfield's
      first frame after leaving edit mode with furniture moved is 61–80 ms
      long, and the longest frame of a load is longer than it was
      (Ladonia 51–64 ms → 130–167) though the load is shorter; the
      furniture's tree is still built in one go at load (0.35–0.9 s);
      the first frame after a rest is 7–10 ms longer (the GPU's; hidden
      pane only); a lower resolution while moving was measured and not
      built (0.2–1.5 ms); an imported-model building is not merged, and
      was not tried; `rays.js` leans on `Mesh._computeIntersections`, a
      three r163 method outside its documentation — look at it on an
      upgrade.
    - *Unseen*: a visible tab at the display's rate, another GPU or
      browser, a phone. Edits were synthetic events and the editor's own
      functions, not a hand; Ashgrove got pictures and a sanity run only.
    - *Left for the user*: `npm run build` and a reload of every open
      tab — until then their server has none of this; Wrenfield's bake of
      2026-10-01 baked again, for its doorways' reveals beside a live
      room; villa C's first-floor hall has a wall's end baked black (the
      bake's zoning, K or no K).
  - *Earlier figures for leaving edit mode* (2026-10-13, two sittings;
    `editor.leave()` alone) — since replaced by those of 2026-10-14 in
    rays-and-collision.md, "What it bought":
    Ladonia after one piece moved 2,363 ms → 12–21; ten 2,391 → 25–77
    (24 sources, 42 thousand triangles: the mend itself 16–35); a piece
    added 2,408 → 11–19; a door slid along its wall 2,892 → 12–18; 39
    drags (54 sources, 91 thousand triangles: a slice a frame) 2,405 → 38,
    then 36 frames of up to 35 ms. Wrenfield: 139–380 → 2–45.
    Of Ladonia's 12 ms after one move the keeper's own work is 2–4: the
    rest is leaving edit mode.

- **2026-10-12** — Performance of the editor and the public view, Ladonia
  and Wrenfield (the work of 2026-10-10 to 12); the entry is
  ../baked-view-lighting/history.md. For this skill: the editor opens
  under a plain light with the houses alone (`World/PlainLight.js`,
  `World/Scope.js`; editor-plain-light-and-scope.md): Ladonia's edit mode
  45–48 → 18–22 ms a frame, Wrenfield 14–15 → 5. The five stages were
  timed against a frozen copy (../app-testing-and-performance/history.md).
  Left short there: what the preview makes — the sun's 8192 shadow map,
  the garden — stays allocated under the plain light until the page
  reloads.

- **2026-10-05** — The user: lights switchable in the editor (walkthrough
  and edit mode), and a publish "with the first 4 optimizations but nothing
  else … everything look like during the edit mode, only without the edit
  capabilities, and be able to turn the lights on and off"; then "save the
  baking you did into skill, then continue with this". → Live switching
  (LiveSwitches, LampPool, RoomGlow, LiveBulbs; HUD panel, editor bulb, L,
  Ctrl/⌘-click, day/night in edit mode) and the preset "Lit live — as in
  the editor"; Ladonia's 11 lamp pieces given light extras; the publish
  follow-ups (night publishes keep their shadow casters, casters simplified
  on the server, the baked terrain painted, the bake reading the new
  snapshot). Three verification rounds of agents found 38, then 21, then a
  handful of faults, all fixed but those listed below; the ones worth
  remembering: point lights under track heads burned ceilings white (all
  pool lights now shine down); unshadowed lights through walls (masked by
  room, with open-plan groups); lamps filed under the flat upstairs (a
  lamp's room holds its middle); the baked terrain's own shader overran 16
  texture units; published views let a visitor switch a light upstairs
  through the ceiling (two-sided sight); duplicate switch names across
  villas (`distinguish`); a woven shade lost a fifth of its strands in a
  publish. And one of mine: moving a helper between files left RoomGlow
  calling a function that no longer existed — `node --check` and the build
  passed, every view lit live threw (run `undef.config.mjs`).
  **Still short:** a wall light's tube still blooms a headboard seen from
  a metre (17 k saturated pixels at q4; a third of its power now, not
  re-measured); window reveals finished in the façade's render
  (`render_khaki`) take the outdoor share of the sky, so at night they read
  darker than the wall beside them; a light seen through a window can be
  Ctrl/⌘-clicked in edit mode but not pointed at in a walkthrough (glass
  stops sight there); Ashgrove's kitchen switch sits by the back door (the
  'hub' rule, unchanged, and baked so); in edit mode the lights panel's
  floor names ("Level +2.2 m") are not the floor menu's; grass blades, a
  car dressed later and other visitors' avatars are not masked by room;
  ceiling-hung lamps filed by the storey under their bottom
  (spec-and-validator.md, the collections);
  night rooms lit live read a little brighter than the same rooms by day
  with their lights on (exposure 1.1 vs 0.85) — a judgement for the user.
  Elsewhere for this entry: the preset "Lit live — as in the editor" and
  the publish follow-ups (night publishes keep their shadow casters,
  casters simplified on the server, the baked terrain painted, the bake
  reading the new snapshot) are ../publish-and-bake/history.md; the
  RoomGlow lesson is why `undef.config.mjs` exists
  (../app-testing-and-performance/); two-sided sight, window reveals in
  `render_khaki` and the night/day exposure are
  ../baked-view-lighting/SKILL.md's.

# Make it walkable

How a space is walked, pressed and sat in before it is called done. How
the app collides (the capsule, the trees, `SceneBuilder.collisionOf`) is
`../walkthrough-editor/rays-and-collision.md`; what each key does is
`../visitor-interactions/SKILL.md`; the in-page tools named here are in
`../app-testing-and-performance/` (loaded through the sink after `boot.js`:
`../app-testing-and-performance/in-page-tools.md`).

The walking character is a capsule 0.7 m wide and 1.9 m tall. It climbs
invisible ramp colliders with no step-up (treads don't collide); furniture
collides as its mesh up to `SceneBuilder.MESH_COLLISION_BUDGET` (12000
triangles) and as its box when it has more — a piece with parts that
open as its body without them and a box for each part, shut, a shower's
door barring the way itself until opened (`checks/_modes.mjs` says which;
the catalogue's `collision` overrides; `furniture-catalogue.md`).
Ladonia's beds, 14–24k with their pillows, collide as boxes, which works
because the headboard is its own piece. Rugs (under 3.5 cm) don't
collide; a shut door is an oriented box, an open one (0.3 open or more)
nothing. Floors are zero-thickness sheets in the static octree.

- **Walk it, don't eyeball it.** After every seed and every furnishing
  change:
  1. `checks/` in node: `furniture-check.mjs` (A/B: reach from the
     entrance, door zones, clearances, covered windows), `furniture-check-c.mjs`
     (C), `stairs-check.mjs` (every flight and named route; exit 1 on
     blockers), `entrance-check.mjs` (the street flights), `c-grade.mjs`.
     As shipped these audit Ladonia — on a new space they can look like a
     pass while checking nothing of yours: use your own copies
     (`checks/README.md`) and see your building ids in their output. They
     collide a piece as `SceneBuilder.collisionOf` does (since
     2026-10-17), so an ACCESS at a walk-in shower behind its shut glass
     door (Ladonia's c-f071) is a note, not a fault.
  2. `walk.js` (`../app-testing-and-performance/walk.js`) in the page:
     `__walk.doors()` — every door both ways from free standing spots (only
     a door opening straight onto a flight should report `noSpot`) — and
     `__walk.to()` along each route from the street to every roof. Ladonia:
     84 of 85 doors (C's service slot has no standing room behind its door)
     and every route pass. It walks the collision as it stands, and first
     finishes a tree an edit left being built a slice a frame
     (`sceneBuilder.settleCollision()`:
     `../walkthrough-editor/rays-and-collision.md`).
  3. Sweep every hinged leaf from shut to full open against the furniture
     and the other leaves (`checks/door-swing.mjs --mesh`). Door.js opens
     a leaf to 0.52π (93.6°), not 90°. Ladonia's first review measured at
     90° and passed leaves that, fully open, stood up to 3.4 cm inside a
     washer, a WC and wardrobes. It also missed two leaves that crossed.
     They were re-hung, narrowed with `fit` or moved 2–3 cm. In the page,
     audit a leaf through its arc (`in-page-audits.md` has the stepping
     trick) and confirm bounding-box hits with rays before acting on them.
  4. Check every door's hand against the plan from the generator's
     emitted wall (start, end, side A) and the hinge point it gives
     (`checks/doors-dump.mjs`), never from the swing name: a wall flipped
     by `outside` turns `_left` and `_right` round, and a review found
     eight Ladonia doors hinged on the wrong jamb that way (the table:
     `generator.md`, Swing).
  5. Check where each leaf stands when left open. Doors stay open until
     toggled, and an open leaf doesn't collide (`Door.getBlockers` is
     empty past 0.3 open). The walker passes through it and no checker
     sees it, but in the real flat a leaf parked across the only way from
     a lobby to a stair is a wall. Ladonia's C first-floor front doors,
     hung as drawn, left 0.21 m beside the open leaf. The north flat's now
     opens onto the landing (declared). The south flat's stays as drawn,
     because on the landing it would cross the common stair's side exit.
  6. **Look at what collides, and press what can be pressed.** **C**
     (Shift C to see through everything; in a public view, `?debug`)
     draws every collider in its kind's colour (the colliders view:
     `../walkthrough-editor/colliders-view.md`). Walk the rooms with it on after
     each furnishing pass, looking for:
     - a piece colliding as its box where its mesh was meant;
     - a stairwell's blocker missing;
     - a leaf or a shower's door barring a way.

     Then run `act.js`'s spots (`../app-testing-and-performance/act.js`;
     what it drives: `../visitor-interactions/SKILL.md`) for the space's
     own doors, drawers, a switch on each floor and the car (E, F, Q), in
     the editor and a public view, against the base build. What a new space
     needs for them:
     - **Q**: a switch in every indoor room (Fittings gives each its
       ceiling light). In a public view only lamps in the bake switch:
       Ladonia's terrace lamps are not, so Q there has nothing.
     - **E with nothing aimed at** opens the nearest door whose foot (its
       wall's base) is at most 0.85 m under the visitor's feet and not
       above their head (`doorOnFloor`, `DOOR_BELOW` 2.4 m under the eye):
       hang each door in a wall that starts on its own floor.
     - **Driving from above** needs a car and a terrain or ground plane
       (`shared/drive.js` `driveBounds`). Without them the view keeps to
       the floor's rooms ± 1.5 m (`BirdView.withinReach`), and a car driven
       off that leaves the frame. Publish after it, so that
       `driveViewpoints` samples the view from out there
       (`../publish-and-bake/publishing.md`).
  7. **The furniture's parts and the windows** (`openables.js`, after
     act.js):
     - list every part that stops short and what stopped it
       (`__openables.stops()`);
     - press E on one part of each catalogue kind and label, and on every
       part after a furnishing change (`everyE()`);
     - `walkIn` at an L or U kitchen's parts, `freeSpots` between its arms,
       and `sameTriangles()`: the editor's tree must be what a publish
       collides;
     - every sash's plan (turn or tilt, and what is in its way) and E on
       each (`sashes()`).

     On a new space each stop and each tilt is a placement to move, unless
     the plans put it there (`furnishing.md`, step 5). Ladonia: 32 stops
     and 18 tilts; 74 of 74 kinds and 475 of 475 parts open and shut with
     E; 59 of 59 sashes; 6 and 23 free spots in its L and U; 971,018
     triangles each way.
  8. **Use it as a visitor does**, with both avatars
     (`.avatar-option[data-avatar="male"]`, then `"female"`, a fresh page
     each; `window.__pickSkin` with boot.js), in the editor and the public
     view. First `await P.avatar.wear(experience)`, `await
     w.seats.dress(P.avatar)` and `await w.seats.catalogue()`
     (`__sit.ready()` does all three), or the first E only queues the
     sit. Then:
     - sit at a seat of each kind and get up (`sit.js`): a dining chair at
       its table, a sofa's middle place behind its coffee table, a pouf,
       an outdoor lounge chair, a chaise's deep end; from above too;
     - switch every television, and sit before one (`tv.js`);
     - swim into each wall of every pool, up its steps, and out at each
       side (`pool.js`, `swim-checks.js`);
     - open every kind of part (`openables.js`) and run every tap
       (`water.js`).

     Sweep every seat for limbs more than 2.5 cm into anything but the
     seat's own piece (`seat-sweep.js`, `seat-sweep.py`). Take the starts
     (`makeStarts`) and, for a public view, the editor's boxes
     (`takeBoxes`) once, and use them for every build compared; take them
     again after the furniture moves (Ladonia's
     `ladonia-seat-starts.json` and `ladonia-w-boxes.json` predate the
     user's edits of 2026-10-17: `scene-safety.md`). Read the
     result against Ladonia's: 214 seats a run; the seated pose meets
     something at 124–149 of them (every tucked-in dining chair:
     accepted); the walks meet something at 85–111
     (`../visitor-interactions/sitting-and-tv.md`).
  9. **Run and jump at every upstairs window with a sill** (`jump.js`,
     `__jump.all()`; `../walkthrough-editor/SKILL.md`), in the editor and a
     public view. No run may end outside the building or a floor up, and
     no frame may rise more than climbing onto furniture does (Ladonia
     0.53 m). three's capsule resolve pushes a head that crosses a
     one-sided ceiling up through the slab, and shoves it out over a sill.
     Player holds it under (`from`, `headroom`:
     `../walkthrough-editor/rays-and-collision.md`). Before that fix
     Ladonia let the visitor out at 24 of its 32 such windows.
- **Spawns on free floor** (`__walk.free`); move them after any furniture
  change. A spawn camera inside a TV or wardrobe gives a one-colour frame
  and a false "too dark". Give each building a ground-level spawn just
  inside its front door labelled "<Building> — entrance": the furniture
  checker floods its reach from spawns whose label says "entrance".
- **Placement audit** after every furnishing pass: pieces poking into
  walls; pieces floating more than ~3 cm over their floor (pictures,
  mirrors, TVs excepted); pieces in no room (stray on the lawn); pieces
  meant against a wall standing 0.05–0.8 m off it (how, in the page:
  `in-page-audits.md`, Placement).
- What the walk found in Ladonia, and the fix: 70 plan doors under 0.9 m
  (widened); a corridor 0.63 m (the core moved 0.3 m); bathrooms whose WC,
  basin and shower left no floor (made deeper, re-laid in a row, a hand
  basin); a dining table 0.57 m from a door wall; a stair under a door's
  2.74 m head; flights rubbing their walls (0.95 → 0.9 m wide); bathrooms
  open under the stairs (low walls).

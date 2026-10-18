# Doors

How the world swings and slides a room's door leaves, and how a leaf meets
the walker. Moved from app-notes.md, "Doors" (its first two items: the
furniture's parts that follow them there — what a published part moves in,
`World/Openables.js`, what a part may open into — are
../visitor-interactions/opening-parts.md).

- A hinged leaf opens to 0.52π (93.6°), eased, about the jamb its swing
  names (`Door.update`). A sliding or pocket leaf slides its width less
  4 cm towards that jamb, and stands 6 cm out on side A. Which jamb and
  which side each swing name means: ../build-property-space/generator.md
  (kit.js, Swing).
- Leaves are never in the collision octrees (`isTransient`).
  - While a door's `open` is under 0.3 (`BLOCKING_THRESHOLD`; about 48° of
    swing, since the swing is eased), each leaf is an oriented box (its
    width less 1 cm, its height less 2 cm, 4 cm thick).
    `SceneBuilder.resolveDoorCollisions` pushes the walker out of it every
    frame (`Door.resolveCapsule`, an upright cylinder against the box in
    the box's frame).
  - Past that, a leaf collides with nothing. The walker passes through it,
    and it passes through furniture.

  So a leaf that sweeps into furniture is a fault you see, not one that
  blocks the way. Audit it fully open (../build-property-space/in-page-audits.md, Door
  swing, t = 1), not at 90°.
  At 93.6° the tip of a 0.9 m leaf ends about 6 cm back past the line of
  the hinge jamb (0.9 · sin 3.6°). A piece against the wall beside that
  jamb must stand that much clear of it, plus 2 cm for half the leaf's
  thickness, or the open leaf cuts into it. Ladonia's final review re-hung
  or moved several doors for this.

## Elsewhere

- Which jamb and side each swing name means — side A, `*_left` towards the
  wall's emitted start and `*_right` towards its end, the table by wall and
  side, and "check a door from the emitted wall and the hinge point, never
  from its swing name": ../build-property-space/generator.md (kit.js,
  Swing). Door widening is there too.
- Checking a space's doors: `../build-property-space/checks/doors-dump.mjs`
  (every hinged door with its emitted wall, side A, hinge point and where
  the leaf parks) and `checks/door-swing.mjs` (each leaf swept to Door.js's
  full open against the furniture and the other leaves); in a page, the
  door-swing audit at t = 1 (93.6°), which reads `Door.update` and
  `isMoving` and meets the real meshes on layer 12 behind the stand-ins:
  ../build-property-space/in-page-audits.md.
- A space's own doors (../build-property-space/buildings.md), and a
  joinery door with something proud of its face — a pull, a handle —
  swung by atan(nearest point along the door / its height) at most
  (`_pull_swing`), not 90° about the face's outer corner, which carries it
  back past the hinge line: a space builder's pitfall
  (../build-property-space/SKILL.md).
- A leaf drawn as itself in the editor, never merged (stand-ins.md); a
  leaf's hinge working out its own world matrix under a held unit
  (`Door.update`); a leaf in the colliders view while it blocks
  (`Door.getBlockers()`, colliders-view.md).
- E on a door, `doorOnFloor` and `DOOR_BELOW`: ../visitor-interactions/picker-and-keys.md.

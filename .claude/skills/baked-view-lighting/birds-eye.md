# The bird's-eye view, as drawn (B)

How the view from above is drawn and exposed in a public view: from the
bake with nothing live (`World.lightFromAbove`, `Realism.holdShadows`),
its floors as storeys (`shared/storeys.js` `planStoreys`), the indoor
gain (`SceneBuilder.setIndoorGain`, `LightMeter.above`), the garden by
floor (`Flora.showUpTo`), and whatever is drawn outside `builder.root`.
The editor has no view from above.

- Driving from above (2026-10-16) is the visitor's side:
  [../visitor-interactions/driving.md](../visitor-interactions/driving.md)
  — getting in keeps the view, and no shadow pass is drawn from above
  while driving, as here. The camera's framing at the wheel (`LEAD`,
  `keepInFrame`, `VEHICLE_CAMERA`) is in
  [../visitor-interactions/picker-and-keys.md](../visitor-interactions/picker-and-keys.md),
  From above at the wheel;
  `birdView`'s handles (`floors`, `levels`, `out`, `roaming`)
  [../visitor-interactions/page-handles.md](../visitor-interactions/page-handles.md).
- The views a publish samples from above for the snapshot's culling
  (`Publish/viewpoints.js` `driveViewpoints`) are
  [../publish-and-bake/publishing.md](../publish-and-bake/publishing.md).
- The live room (K) is suspended from above (`roomLight.hold`):
  [live-room.md](live-room.md).
- For whoever adds a module of its own to a public view (the water, a
  TV's picture): the rule under "Anything drawn outside `builder.root`"
  below is theirs too ([../visitor-interactions/SKILL.md](../visitor-interactions/SKILL.md),
  [../walkthrough-editor/SKILL.md](../walkthrough-editor/SKILL.md)).

- **The bird's-eye view is drawn from the bake with nothing live**
  (`World.lightFromAbove`, called by `BirdView` as it opens and
  shuts): no shadow pass while it is open in any mode (`Realism.holdShadows`
  sets the sun's `shadow.autoUpdate` off and, unless the map is to be kept,
  its `shadow.matrix` to one that puts every point outside the frustum —
  lit, unsampled, no shader rebuilt; a redraw on leaving puts it back); no
  shadow-only casters for hidden floors; "baked": `sunShade.sunShadowOn` 0;
  `?lighting=live`: the full lightmap in (`World.lightHouse`), the house's
  direct light off (`LIVE_DIRECT`, a uniform in `bakedAmbient`), the lamps
  at 0 and no switch lit live (`LiveLamps.hold`), the sun's whole-house map
  kept as last drawn for what moves; unbaked: the sun unshadowed and no
  lamp given to any fitting (`LampPool.where().above`), RoomGlow as ever.
  Test it with `renderer.shadowMap.render` wrapped to count passes, over
  frames in which a door swings.
  - Its floors are **storeys** (`shared/storeys.js` `planStoreys`): a room
    is on the storey above the highest room indoors it stands over (1.8 m
    or more below it); each published level takes the storey of most of
    its indoor rooms; never lower than a level under it. Ladonia's nine
    levels give Ground floor (levels 0–4), First floor (5, 6), Roof terrace
    (7, 8); one house's are as before. `birdView.floors[i]` has `level`
    (the storey's index — what `setLevel`, `birdView.level` and
    `levelAt(y)` speak in), `levels` (the published level indices),
    `box` (all its rooms, for following), `middle` (its houses', for a
    floor picked from the list), `indoors`. A mesh's `userData.level` is
    still a published level index: `birdView.shows(level, kind, shown)`
    maps it. The lights panels (`Switches`, `LiveSwitches`) list by the
    same storeys: `switches.floorName(level)`.
  - By day the floor shown is exposed as its rooms would be while the
    outside keeps its own exposure: `SceneBuilder.setIndoorGain` (set each
    frame by `Realism.updateBaked` from `LightMeter.above`: the area-weighted
    log-average of the probes' *daylight* in the floor's rooms that daylight
    reaches — no lamp's light in it, the rooms without daylight left out
    (switches.md, the day-time lights) — brought to `PROBE_KEY`,
    ×1–32; ×12 without probes) multiplies the baked light of every surface
    lit as a room with a ceiling — lightmapped and vertex-lit materials
    built `|in` (`INDOOR_LIFT`) — easing off between 0.5 and 1.0 of a
    sunlit white wall so nothing burns out; ceilings are left out (only
    their tops show from above, baked with the roof off); what the probes
    light is brought up with it (`indoorGainIn`). The adaptation is 1 from
    above. Ladonia at step 4, "baked": gain 17.4, 17.9 and 24.4 by floor
    (read in the page 2026-10-12; 18.5, 18.3 and 25.2 while the rooms
    without daylight still counted); the view over A's ground floor 97 mean
    level — 88 before those rooms started the day lit, 58 before there was
    a gain (the unbaked view's, 102) — no pixel at white. Works without a
    site sky too (Wrenfield: gain 16.7 and 18.2, and for the attic, both of
    whose rooms are without daylight, 1 with their lamps on as a day opens
    and 32 with them off; its ground floor 134 mean level, 87 before there
    was a gain). Door
    leaves and the furniture's doors are brought up with their rooms
    (`ProbeLight`, or `tintDoors` where the probes do not light them).
  - The garden goes by floor (`Flora.showUpTo`): shrubs with an
    `elevation`, the planters' grasses and the roof LED strips are hidden
    under the floor they are on; what stands on the terrain is always the
    lowest floor's.
  - **Anything drawn outside `builder.root` hides itself from above.**
    `showFloor` walks the merged house, the loose meshes under the root,
    the shut parts (`shutBatcher.showFloors`), the people and the garden
    (`showUpTo`), and calls `screens.showFloor(test)`. A group of a
    module's own (the water, a TV's picture) is none of those, and stays
    drawn over the floor shown unless it is hidden by
    `birdView.floorAt(x, y, z) <= shown`: Screens does this when called,
    Water on the world's `"bird"` (`usable`). Use `floorAt`, not
    `levelAt`: out on a car's ground everything is the ground floor's,
    however high the hill.
- Ladonia from above at step 4 (the final measurement: the committed code
  → this, median ms a frame): by day 26.3 / 33.1 / 37.8 → 10.5 / 11.5 /
  13.8 (ground / first / roof), at night 48.9 / 59.7 / 65.1 → 11.2 / 12.2
  / 14.8; with something moving at night 91–110 → 10.6–14.7. Wrenfield
  8.0–12.3 → 3.6–4.4.
- As it was, and still is: a room with no daylight and its light off is
  black from above (a gain cannot add light the bake has none of); the gain
  is one a floor, not a room's — a glazed living room and a one-window
  bedroom get the same lift; in "static" it is a fixed ×12 (no probes are
  loaded there); the garden's lights are not filtered by floor but for the
  roof's LED strips; lit live over a bake from above, the four lamps stay
  in three's light state at intensity 0 (taken out, every lit shader would
  be built again).

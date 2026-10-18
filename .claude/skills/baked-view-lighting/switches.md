# Switches in a baked view: the rooms daylight does not reach, and the first frame's switches

By day the rooms daylight does not reach start lit, and a baked view's
first light waits only for the switches seen from where the visitor
starts (`shared/daylight.js` `darkRooms(spec)`, `World/Switches.js`
`startsOn`, `prepare`, `seen`, `bringIn`; Realism's
`LightMeter.roomDaylight` and `above`). Moved from the old app-notes'
"Lights and fittings". The rest of that section — lights switched live
(`LiveSwitches`, `LampPool`, `RoomGlow`, `LiveBulbs`, the room probe,
two-sided sight, "A light that is off is out of the scene",
`prepareLights`) — is
[../walkthrough-editor/lights-and-fittings.md](../walkthrough-editor/lights-and-fittings.md):
the editor's realistic preview, a version published "Lit live — as in
the editor" and `?live` are lit that way, while a baked view switches
through `World/Switches.js`, its layers resolved into one lightmap
([resolved-lightmap.md](resolved-lightmap.md)). Q, a room's lights at
once (`inRoom`, `setMany`), is
[../visitor-interactions/picker-and-keys.md](../visitor-interactions/picker-and-keys.md).

The rule is read from the spec — windows, glazed doors, open doorways,
`openPairs` — so a new space's dark rooms follow from its plan, and are
listed before a bake ([../publish-and-bake/SKILL.md](../publish-and-bake/SKILL.md),
before baking: `darkRooms(spec)`, Ladonia 20, Wrenfield 4; each room's
daylight read from the probes when the draft is looked at).

- **By day the rooms daylight does not reach start with their ceiling
  light on** (`shared/daylight.js` `darkRooms(spec)`; `Switches.startsOn`,
  `LiveSwitches.startsOn`). Windowless rooms (bathrooms, closets) bake
  black by day — their lamps are switches — and with every light off, as a
  day used to start, they were black to walk into and black patches from
  above. A room is dark where none of its walls has a window, a glazed door
  or an open doorway to the outdoors, it is not one space with a room that
  has (`openPairs`), and it does not look into one through a doorway or
  glass. Ladonia 20 rooms (nine bathrooms, four guest WCs, four utility
  rooms, two lobbies, C's first-floor landing), Wrenfield 4 (utility,
  dressing, loft, loft shower room), Ashgrove 2. Told from the spec, not
  the bake: the probes are measured with every door open, three to a WC
  (Ladonia's WCs read 0.02, as its bedrooms do; the rooms picked read
  0.0001–0.025, the garden 0.26–0.40), and a view drawn "static" or
  unbaked has none.
  - In a view lit live only while `daylight` is on (`World.daylit`): a
    public view, the editor's realistic preview; not its plain light, nor
    while a publish holds the scene, which takes the fittings' glass unlit
    as it always did. LiveSwitches' `states` hold only what was turned by
    hand (`Map<id, boolean>`): the rest follow `startsOn`.
  - From above, the floor's gain goes by its rooms' *daylight alone*
    (`LightMeter.roomDaylight`: the variant's own probes' light, no
    switch's in it) and leaves the rooms without daylight out
    (`LightMeter.above`): Ladonia ×17.4, ×17.9, ×24.4 by floor and
    Wrenfield's first floor ×18.2, lamps on or off; only a floor of nothing
    but rooms without daylight goes by its lamps (Wrenfield's attic: ×32
    off, ×1 on). The lit rooms do not burn out (no pixel at white at steps
    4 and 1).
  - A lamp's light still reaches the rooms its door opens onto (Wrenfield's
    landing takes the loft's through the stairwell; one first-floor window
    seen from the street is 0.035% of a frame brighter). A frame of a
    default day visit was otherwise the same to the pixel as before
    (Ladonia living room, pool; Wrenfield living room, garden).
  - Rooms the rule leaves unlit although the bake has them dim: those whose
    windows have blinds down (Ladonia's twin bedrooms read 0.003–0.006
    with a window), two bathrooms with a window, C's stair lobbies and its
    halls open to their living rooms, two entry closets (0.003–0.02). They
    have daylight on paper, start unlit and are left to the meter.
  - What it costs (2026-10-12): nothing where such a room is out of sight.
    A baked view's first light is drawn as soon as its lightmap is here:
    it waits only for the switches whose light is seen from where the
    visitor starts (`Switches.prepare`'s `from`, `Switches.seen`: one that
    reaches a room they are in or look into, or any room with daylight —
    Wrenfield's loft, for the landing's window from the street) and not
    for the sun's mask, which is set when it has loaded; the others'
    layers are asked for once that frame is drawn, the nearest rooms'
    first, and drawn as they land (`Switches.bringIn`). Ladonia's default
    day visit, localhost, seven loads a build in one sitting on a busy
    machine: 92–95 files asked for by the first lit frame where the build
    before asked for 178–180, and that frame 3.55–3.78 s after navigation
    where it was at 4.08–4.42 (the world built at 2.95–3.23 s in both);
    the frame after it at 3.97–4.25 s — the garden's trees are built in
    between — and the twenty rooms' light in at 4.16–4.46 s. Not measured
    over a network. The start view is the same to the pixel with and
    without the switches that come later (Ladonia from its street, from
    inside a windowless bathroom and from the hall outside it; Wrenfield
    from its loft and its landing; from Wrenfield's front path 17 of
    921,600 pixels by up to 5 levels). In a view lit live — unbaked, the
    editor's preview — the pool's lights are in the scene's light only
    while such a room's lamp is in sight ("A light that is off",
    ../walkthrough-editor/lights-and-fittings.md).
    What that gives up: by day, from the hall outside a lit bathroom's
    shut door, the strip of threshold under the door is no longer lit by
    the lamp behind it (44,763 of 3.7 million pixels of a frame looking
    down at the foot of the door, the most 54 levels; no other frame
    differs, day or night).

# The planner (`shared/people.js`)

Where `planPeople` puts people and why; the data it reads (`seats.json`, the index, the entries it writes) is `people-data.md`, and `checks/people-plans.mjs` holds its plans to these rules over many seeds (`checks/README.md`), reading its limits from the `const` lines of `shared/people.js` itself, so a renamed constant stops it.

`planPeople(spec, catalog, seats, { seed = 1, count, characters, clips, props })` returns the entries; `planOne(spec, catalog, seats, { pose, near, facing, seed, characters, clips, props })` returns one more for the editor's Add, or `null` with nothing within 12 m.

**How many and where**
- `defaultCount`: 4, plus one per 25 m² of terrace and deck, plus one per lounger by the water, up to 12. Ladonia gets 12.
- Lying: about a quarter, and no more than there are loungers by water: those within 3.5 m of a pool (`NEAR_POOL`) first, then within 4.5 m of a hot tub (`NEAR_TUB`). With none by water, two at most on any.
- Standing: one group of two or three for every six people. A group stands only in a room whose floor finish is of kind `ground`, not gravel, asphalt, grass or the like (`SOFT_GROUND`, so not on `roof_gravel`), whose name is not a way through (`PASSING`: parking, road, path, steps, entrance, hall…) and which is at least 4 m². A room named terrace, deck, roof, pool, garden… (`GATHERING`) is twice as likely. Name a new space's rooms accordingly (build-property-space names them: `../build-property-space/SKILL.md`). The first group stands within 12 m (`BY_THE_POOL`) of those lying by the pool, on their level, and has someone drinking.
- Sitting: the rest — outdoor sofas and lounge chairs first, one or two on indoor sofas (a room named living, lounge… twice as likely), then terrace chairs, then indoor chairs. Seats 0.3–0.62 m high and 0.2–0.78 m deep (`SEAT_HEIGHT`, `SEAT_DEPTH`); no stools. A seat no character and clip fit is left empty, and whoever was to sit there stands.

**Clearances and spacing**

| constant | value | what |
|---|---|---|
| `MARGIN` | 0.4 m | Someone standing is this clear of every obstacle and of the edge of the room. |
| `SPACING` | 0.9–1.3 m | A standing group's members apart, facing its middle ± 12°. |
| `APART` | 0.8 m | Two people not of one group. |
| `DOORWAY` | 0.6 m | Kept clear either side of a door, a doorway or glazing to the floor (and `MARGIN` more). |
| `COPING` | 0.3 m | Round a pool's box no one stands: its raised coping. |
| `GRASSES` | out 0.25, up 1.0 m | How far a planter's grasses are taken to reach past its box and above it. Ladonia's reach further (`scene-people.md`, Still short). |
| `FLAT` | 0.035 m | A piece flatter than this (a rug) is walked on. |
| `LEFT_OUT` | "Sitting Reclining Female" | Clips no one is planned with. The editor can still give them. |
| `BOTTLE` | `"beer"` | What anyone whose clip drinks holds. |

Obstacles (`siteOf(spec, catalog)`, which gives `roomAt`, `blockedBy`, `clearOf`): the spec's walls, furniture as its catalogue box, stairs and the holes they rise through; the landscape's walls, planters with their grasses, hedges, railings, pergola posts and screens, trees and pools with their coping. Furniture is a box here too: the inside of an L-shaped sofa counts as taken.

**Sitting fit**

| constant | value | what |
|---|---|---|
| `FEET_NEAR`, `FEET_MOST` | 0.02, 0.04 m | The feet's distance from the floor on that seat: within the first no one can tell, within the second it passes. |
| `UNDER_MOST` | 0.025 m | Feet under the floor count for more: this much under is as far off as `FEET_MOST` hanging. |
| `GIVE` | 0.03 m | A sofa's or a lounge chair's cushion gives this much under someone whose feet would hang. |
| `LEG_CLEAR`, `HEEL_CLEAR` | 0.04, 0.06 m | Knees this far past the seat's front edge; on a base not `open`, ankles too. |
| `FORWARD_MOST`, `FORWARD_BACK` | 0.15, 0.08 m | How far forward of the seat's point someone may sit for that; the second for a clip sat back in. `SEAT_UNDER` 0.12 m of seat stays under them. |
| `FOOT`, `LEG_SPACE`, `KNEE_HIGH` | 0.2, 1.2, 0.62 m | The foremost ankle and a foot more come short of whatever stands before the seat lower than the knees, looked for out to 1.2 m. |
| `ROOMY` | 0.4 m | A shallower seat has a cushion propped on it: sat on only when nothing better is free. |
| `RECLINED`, `RECLINE_DEPTH`, `SITS_BACK` | 0.2, 0.5 m, 0.3 | A clip sat back in goes only on a soft seat out of doors whose `room` is at least 0.5 m, three times in ten, and never two alike. seats.json has a `room` only where a loose pillow lies on the seat, so a lounge chair without one is never sat back in, however deep it is: by the people, or by the visitor (`World/Seats.js`'s `reclines`, which asks for a LOUNGE piece besides: `../visitor-interactions/sitting-and-tv.md`, `avatar-clips.md`). |

**Lying, drinks and the rest**
- `SITS_UP` 0.45 m, `RAISED` 5°: a lying clip that sits up of itself is not for a lounger whose back is raised. Those lying take the lying clips in turn, so the loungers by a pool are not all one pose.
- `LYING_PROPS`: a towel (weight 5), sunglasses (2, only on a character whose `eyes` the index has), an open book (1.5), or nothing (1.5).
- A drink goes only to a clip whose `hand` holds; the steadier the hand (`TILT_MOST` 80°) the likelier. A standing group has one with a drink, one talking, one listening; a talker or listener whose clip has a hand holds one six times in ten. Indoors the drinks are coffee, wine or a tumbler; out of doors wine, a flute, a tumbler or a beer.
- No character twice until all are used; none twice in a group; no two of a group play one clip.
- `MAX_PEOPLE` 200.

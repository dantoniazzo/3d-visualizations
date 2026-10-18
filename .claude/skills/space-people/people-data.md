# People's data: the files, the scripts, the spec's entries, the seats and the index

The method is `SKILL.md`; how the app draws, lights and edits them, and what is still short, is `scene-people.md`. This is the data, as the code stood on 2026-10-10 (the visitor's own clips since 2026-10-16). The planner's rules and constants are `planner.md`; the slider's caps and what `World/People.js` offers, `people-runtime.md`.

**Files**
- `shared/people.js`: the planner (`planPeople`, `planOne`), `seatsOf`, `siteOf`, `sanitizePeople`. Pure: node and the page alike, seeded.
- `scripts/place-people.mjs`: `npm run people:place`.
- `scripts/measure-seats.mjs`: `npm run seats`, which writes `public/models/furniture/seats.json`.
- `blender/import_people.py`, then `scripts/optimize-people.mjs`: `npm run people`, which writes `public/models/people/`.
- `blender/lib/props.py` and `blender/export_props.py`: `npm run props`, which writes `public/models/people/props.glb`.
- `frontend/Experience/World/People.js`: the runtime. Its class comment is the contract.
- `assets/people/characters/*.fbx` and `assets/people/animations/*.fbx`: the Mixamo downloads, git-ignored (`assets/people/**/*.fbx`); `assets/people/avatar/*.fbx`, the visitor's own clips — swimming, treading water, climbing out, sitting down, getting up (`npm run people -- --avatar-clips`, below).

## The npm scripts

| command | what it does |
|---|---|
| `npm run props` | Builds what the people hold, wear or lay down (Blender) into `props.glb`. Run it before `npm run people` when a prop is new, so the index lists it. |
| `npm run people` | Converts every download (Blender, about 50 s for 12 characters and 17 clips) and packs it: `<id>.glb` a character (0.5–1.4 MB), `clips.glb` (0.9 MB), `index.json`. With nothing downloaded it makes the stand-ins instead. |
| `npm run people -- --avatar-clips` | The visitor's own clips alone (since 2026-10-16): every `assets/people/avatar/*.fbx` → `public/models/people/avatar-clips.glb` and `avatar-clips.json` (`{ file, hips, fps, list: [{ name, as, duration, frames, head, pelvis, last, travel, loop?, stripped?, pace?, seam?, grip? }] }`), both git-ignored. Each file is played as the first of `AVATAR_AS` (`blender/import_people.py`) its name matches: "sit-down", "stand-up", "climbing", "breaststroke", "treading" or "swimming". The packer says what it did with each and warns of a name the app plays nothing as. A plain `npm run people` makes them too whenever such files are there. What is done to each clip (a loop, the climb, a move) and why: `avatar-clips.md`. |
| `npm run people -- --standin` | The stand-ins from the app's own two avatars, whatever is downloaded: `index.standin.json`, `standin-*.glb`, `clips.standin.glb`. |
| `npm run people -- --src <dir> --out <dir>` | Another set, somewhere else. A trial run goes to a scratch `--out`: a run into `public/` replaces the stand-ins for every tab at the next `npm run build`. `--keep` keeps Blender's unpacked output. |
| `npm run seats` | Measures every piece one can sit or lie on (32 in the catalogue) into `seats.json`. `-- <id prefix> …` measures only those and merges them in; `-- --png <dir>` also draws a top view of each with its seats. Run it again after `npm run furniture` changes a sofa, a chair or a lounger (the visitor sits on the same seats: `../visitor-interactions/sitting-and-tv.md`). |
| `npm run screens` | Measures every television's glass into `screens.json` (`../visitor-interactions/sitting-and-tv.md`, Televisions). `-- --check` proves a re-export left it where it was. |
| `npm run people:place -- <scene-id> [--seed n] [--count n]` | Plans the people and **writes the scene**, as an editor save does (validated, through `writeScene`). Seed 1 and `defaultCount` if not given. |
| `… --dry-run` | Plans and prints; writes nothing. |
| `… --out <file.json>` | The plan to a file, `{ scene, seed, people }`; the scene is not written. |
| `… --png <file.png>` | Also a picture from above, a panel a floor: standing red, sitting blue, lying orange, each with a tick the way it faces, groups ringed. It stops no write: without `--dry-run` or `--out` the scene is still written. |

- After `props`, `people` or `seats` has written into `public/`, build: a server serves the `dist` of the folder it runs in — the scratch build for a test server, the repo's `dist/` (`npm run build`) for the user's own (`../app-testing-and-performance/SKILL.md`; never build into the user's `dist/` while work is in progress: `../../../CLAUDE.md`).
- `people:place` prints the plan in the spec's order: who, clip, what is held and in which hand, where; for a sitter, the feet off the floor (+ hanging, − under it), how far the seat gives and how far forward they sit, and a solid base; then who the first 4 and the first 8 drawn are. It stops if the validator would change the plan.
- A plan is the same for the same seed only while the scene, `seats.json`, `index.json` and `shared/people.js` are the same. Ladonia's seed 12 gives another first group since the planner's last fixes (`COPING`, `GRASSES`, `LEFT_OUT`). Keep a vetted plan as a file, not as its seed.
- To write an edited plan file — the list `__people.patch` returns, or `--out`'s `{ people }` — run from the repo (the scene diff is then `people` alone, the record's `updated_at` aside):

```
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { validateScene } from './server/scene/validate.js';
import { readScene, writeScene } from './server/store/sceneStore.js';
const [id, file] = process.argv.slice(1);
const plan = JSON.parse(readFileSync(file, 'utf8'));
const people = Array.isArray(plan) ? plan : plan.people;
if (!Array.isArray(people)) throw new Error('no list of people in ' + file);
const record = await readScene(id);
const { scene, notes } = validateScene({ ...record.scene, people });
if (JSON.stringify(scene.people) !== JSON.stringify(people)) throw new Error('the validator changed the plan: ' + notes.join('; '));
await writeScene({ id, scene, brief: record.brief, notes });
console.log('wrote', scene.people.length, 'people into', id);
" <scene-id> <plan.json>
```

  `SCENES_DIR=<dir>` in front makes the store read and write another folder: try it on a copy of `scenes/` first. The check on the list is not a nicety: a spec whose `people` is not a list comes out of the validator with no `people` at all, and is written so.

## `spec.people`: one entry a person

`{ id, character, pose, clip, position, rotation, seat, prop, group, seed }`

| field | value |
|---|---|
| `id` | `"person-<n>"`, numbered in the plan's order. |
| `character` | A character's id from the index. One the index lacks is stood in for by one it has. |
| `pose` | `"stand"`, `"sit"` or `"lie"`. |
| `clip` | A clip's name, played whoever it was made for; or `null` for the pose's own (the first of that pose in the index not made for the other sex, one with a hand free if they hold something). |
| `position` | `[x, y, z]` in site coordinates. Standing: the feet, y the floor's. Sitting: the seat's surface under the pelvis — the seat's `at`, less up to `GIVE` on a soft seat, up to `FORWARD_MOST` forward of it. Lying: the lounger's surface under the pelvis (`lie.at`). |
| `rotation` | Degrees, as a piece of furniture's: 0 faces north (−z), 90 west, −90 east, 180 south; lying, the way the head points. Kept in (−180, 180]. A Mixamo rig faces +z, so the runtime turns it `rotation + 180°`. |
| `seat` | `{ furniture: <placement id>, index: <its seat's number in seats.json; 0 lying> }`, or `null`. |
| `prop` | Held (`wine-red`, `wine-white`, `flute`, `tumbler`, `beer`, `coffee`, `book`), worn (`sunglasses`), laid by them (`towel`, `book-open`), or `null`. |
| `group` | `"group-<n>"` for a standing group or two seated together, else `null`. |
| `seed` | An integer: where in its clip the person starts, and its speed (0.92–1.08×). |

- **The list's order is the priority.** A device that draws only some (`QUALITY.people.most`) takes the first whole groups that fit; a person alone is a group of one. The planner returns: the standing group nearest those lying by the pool, those lying by the pool, those sitting out of doors, those sitting indoors, the other standing groups, those lying elsewhere.
- **The validator** (`server/scene/validate.js` → `sanitizePeople`) keeps `people` only when the spec has a list: an empty list stays empty, a spec without the key gets none. It keeps the first 200 (`MAX_PEOPLE`); drops an entry without three finite position numbers or without a character; makes a missing or unknown pose `"stand"` and a taken id unique, each with a note; wraps `rotation`; lets go, with a note, of a seat on a piece the spec no longer has; keeps `clip`, `prop` and `group` as a string of 80 characters at most or `null`.
- `npm run seed -- <id>` rebuilds the spec without `people` (copy them out first and back after: `SKILL.md` step 10, `../build-property-space/scene-safety.md`). Furniture ids are sequence numbers (`b-f228`): after a reseed that added or removed a piece, a saved entry's `seat.furniture` can name another piece.

## `public/models/furniture/seats.json`

One entry a catalogue id, in the piece's own frame: facing north (−z), metres at the placement's scale 1, before its rotation. The `"$comment"` key is not a piece.

```
"<catalog id>": { kind: "sofa" | "chair" | "stool" | "lounger" | "bench",
                  seats: [{ at: [x, z], height, depth, facing, base: "solid" | "open", room? }],
                  lie: { at: [x, z], height, head: [x, z], length, width, incline } | null }
```

| field | meaning |
|---|---|
| `seats[].at` | Where a seated person's buttocks rest: 0.15 m out from the foot of the back (`SIT_BACK`), or the middle of a shallower seat. |
| `height` | The seat's surface above the piece's base. A loose pillow lying on the seat is not the seat. |
| `depth` | From the back's foot to the front edge: what is left to sit on before a loose pillow. |
| `room` | Only where a loose pillow lies on the seat: the front edge to the back proper, behind the pillow. |
| `facing` | The way a sitter faces, in degrees as a `rotation`. A corner sofa's return seats face −90. |
| `base` | `"solid"`: a box or plinth down to the floor, so feet can't be tucked back under it. `"open"`: a seat on legs. |
| `lie.at` | The point under a lying person's pelvis: 0.1 m footwards of where the raised back begins, or 0.9 m from the head end of a flat one. |
| `lie.head` | The middle of the head end. `seatsOf` turns `at → head` into the person's `rotation`. |
| `lie.length`, `lie.width` | The lying surface end to end, and the cushion's width under the pelvis. |
| `lie.incline` | The raised back's angle off the flat, in degrees. 5 or less is taken for flat. |

- How it is measured: a 2 cm height field of the model as the app shows it; one seat per ~0.6 m of a run; a chaise's deep end (over 0.78 m) is one seat; a back is what stands within 0.12 m of the piece's top and 0.15 m over the seat, so an arm is not one; a seat with more than a quarter of the 0.3 m before its front edge taken by the piece itself (the corner of a corner sofa) is no seat.
- `seatsOf(placement, seats)` puts a placed piece's seats on the site: each `at` as `[x, y, z]` with y = the placement's y + `height` × scale, `facing` turned by the placement's rotation.
- Ladonia's pieces: `ld-lounger` lies at 0.39, 1.94 long, 0.64 wide, inclined 35°; `ld-out-lounge` sits at 0.371, 0.40 deep before its pillow (`room` 0.54), open; `ld-out-sofa` 0.40, solid; the indoor `ld-sofa-*` 0.45–0.47, solid; dining and garden chairs 0.45–0.49, open; bar stools 0.76–0.77 (the planner seats no one on a stool).
- The visitors sit on the same seats (`World/Seats.js`): every seat of a piece placed but a lounger's, of `SEAT_HEIGHT` 0.3–0.62 m (no bar stool) — Ladonia 219, 11 deep ends (`../visitor-interactions/sitting-and-tv.md`).

## `public/models/people/index.json`

Every path is under `/models/`. The app loads `index.json`, else `index.standin.json`, else its own two avatars playing Idle.

**`characters[]`**: `{ id, name, file, height, hips, legs, sex, eyes, mouth, sits }`

| field | meaning | used by |
|---|---|---|
| `id`, `name`, `file` | `"remy"`, `"Remy"`, `"people/remy.glb"`. The id is the FBX file's name. | both |
| `height` | Metres, standing (Ladonia's twelve: 1.75–1.89). | — |
| `hips` | How high the pelvis stands (0.93–1.05). A clip's Hips track, seat and feet are scaled by `character.hips / clips.hips`. | both |
| `legs` | `[thigh, shin]` in metres. | planner (where `sits` lacks the clip) |
| `sex` | `"f"`, `"m"`, or `null` for an id `SEXES` in `import_people.py` doesn't list: add every new character there. | both: a clip made for one sex is not given to the other |
| `eyes` | `[x, up, forward]` from the head's joint, at rest: where a pair of glasses' lenses hang. `null` if not found. | runtime wears sunglasses there; the planner gives none without it |
| `mouth` | The lips, likewise. | runtime tips a drink at it |
| `sits` | `{ "<clip>": [seat, knee, tuck, far] }`: how each sitting clip sits on this very body, in metres — the seat height that puts its soles on the floor, and its rearmost knee, rearmost ankle and foremost ankle forward of its seat. | planner, in place of the clip's own scaled |

**`clips`**: `{ file: "people/clips.glb", hips, legs, list: [...] }`. `hips` (0.962) and `legs` ([0.411, 0.377]) are the clips' own skeleton's. Pass the whole object to the planner (`clips: index.clips`), not only its list, or nothing is scaled to the character.

Each of `list[]`: `{ name, pose, hand, tilt, curl, pelvis, seat, head, duration, feet?, tuck?, knee?, far?, reach?, sex?, still? }`

| field | meaning | used by |
|---|---|---|
| `name` | The FBX file's name. | — |
| `pose` | `"stand"`, `"sit"` or `"lie"`, read from the name (`CLASSIFY` in `import_people.py`: "sit…" sits; "lay…", "lying", "sleep", "sunbath", "tann" lie and hold nothing; anything else stands, and one named for clapping, waving, pointing, a phone or dancing holds nothing). | both |
| `hand` | `"right"`, `"left"` or `false`: the hand that can hold a glass all through the clip. Measured (`tilt` ≤ 80° and `curl` ≥ 40° over every frame), but set outright for the drinking clips (`HANDS`), which fail the measure by drinking. | planner gives a drink only where it is not `false`; runtime holds in that hand whatever the prop's `grip` says |
| `tilt`, `curl` | Per hand, degrees: the furthest off upright a glass in its fist ever points, and the least its fingers are ever curled. | planner prefers the steadier hand; runtime keeps a glass in the thumb's crook where `curl` < 45 |
| `pelvis`, `seat`, `head` | At the first frame, from the root, Y up, facing +Z: the Hips; the point under the pelvis that rests on the seat (`null` standing); the head. | runtime places by `seat`; `head` says which way a lying clip lies, whether a sitting one is sat back in (0.2 m behind its seat) and whether a lying one sits up of itself (0.45 m over it) |
| `duration` | Seconds. | — |
| `feet` | Sitting: where the feet rest, at the soles' height. `seat[1] − feet[1]` is the seat height the clip was made for. | planner |
| `knee`, `tuck`, `far` | Sitting: how far forward of the seat the rearmost knee, the rearmost ankle and the foremost ankle ever are. | planner: knees before the front edge, ankles before a solid base, feet short of a coffee table |
| `reach` | Lying: how far from the midline the hands lie. | planner; the runtime brings arms in from the pose itself |
| `sex` | `"f"` or `"m"` for a clip whose name says Female or Male. | both |
| `still` | `true` for a clip of one frame. | runtime makes it breathe |

Ladonia's 17 clips (`hand`; for a sitting clip the seat height it was made for; Mixamo's own tile name where the file was renamed, as recorded while downloading and not checked again):

| clip | pose | hand | notes |
|---|---|---|---|
| Agreeing | stand | — | 1.8 s |
| Drinking ("Male Drinking") | stand | left, set | drinks from a bottle, the hand lifted over the mouth; carries the body 1–2 cm over its root |
| Happy Idle | stand | right | tilt 64.5° |
| Laughing | stand | — | |
| Standing Idle ("Weight Shift Idle") | stand | right | tilt 71.4° |
| Talking ("General Conversation") | stand | right | tilt 76.9°; the hand opens as it gestures |
| Talking Funny | stand | — | opens and splays the hands |
| Talking Question | stand | — | |
| Sitting Drinking | sit | right, set | 0.342; the download walks 2.7 m and sits down first (trimmed to its seated 11 s) and faced backwards (turned) |
| Sitting Idle ("Sitting With Breathing Idle") | sit | right | 0.396; feet flat before the seat (`tuck` 0.41): fits a solid base |
| Sitting Laughing | sit | left | 0.413; tucks a foot back (`tuck` 0.20): seldom on a solid base |
| Sitting Talking | sit | — | 0.438; a foot stretched out (`far` 0.61); 45 s |
| Sitting Reclined Male | sit | — | 0.381; still; sat back, hands behind the head; men only |
| Sitting Reclining Female | sit | — | 0.351; still; women only; in `LEFT_OUT` |
| Laying Hands Behind Head ("Male Laying Pose: On Back, Legs Crossed, Hands Behind Head") | lie | — | still; `reach` 0.24 |
| Laying Idle ("Laying On Back Idle") | lie | — | `reach` 0.46: the arms lie out past a 0.64 m lounger and are brought in |
| Laying Propped Female | lie | — | still; women only; sits up of itself (head 0.64 m over its seat): never on a raised back |

**`props`**: `{ file: "people/props.glb", list: [{ id, node, grip }] }`. `node` is the name three's loader gives the GLB's `prop:<id>` node (`propwine-red`: it drops the colon). `grip` is `"right"`, or `null` for a prop that is worn or laid down. Each node's origin is its grip point, and its extras carry `{ prop: { id, grip, size, at, off } }`: `at` the share of its height the grip is up, `off` how far the grip is from the middle of its footprint.

| id | what | size x, y, z (m) | grip |
|---|---|---|---|
| `wine-red` | Bordeaux glass | 0.095, 0.226, 0.095 | the stem, 0.21 of its height up |
| `wine-white` | white wine glass | 0.081, 0.206, 0.081 | the stem, 0.23 |
| `flute` | champagne flute | 0.069, 0.236, 0.069 | the stem, 0.23 |
| `tumbler` | Negroni on ice with an orange wheel | 0.110, 0.113, 0.085 | the body, 0.27; 13 mm off centre (the wheel, not a handle) |
| `beer` | brown longneck | 0.062, 0.231, 0.062 | the body, 0.33 |
| `coffee` | cappuccino | 0.115, 0.066, 0.092 | through the handle, 0.56; 42 mm off centre |
| `book` | closed paperback | 0.129, 0.198, 0.025 | the spine |
| `towel` | folded beach towel | 0.46, 0.051, 0.32 | none: laid past the feet of someone lying |
| `book-open` | paperback open face down | 0.251, 0.044, 0.198 | none: laid likewise |
| `sunglasses` | sunglasses | 0.143, 0.047, 0.146 | none: worn, the origin under the bridge |

Each is under 1,500 triangles (`BUDGET` in `blender/export_props.py`, which says when one is over). Glass is see-through by opacity, never transmission (`../build-property-space/SKILL.md`, Light and look). A new prop is a builder and a row in `PROPS` (`blender/lib/props.py`: id, name, hand or `None`, builder).

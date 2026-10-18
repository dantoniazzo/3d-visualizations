# What a bake's time goes on

Why a bake takes as long as it does, what was done about it, and what was
tried and does not hold (`blender/bake_public.py`, `blender/lib/batches.py`,
`scripts/bake-public.mjs`, `server/publish/bake.js`). The short of it: a
bake's time is the number of times the scene is handed to Cycles, which the
log's last line counts — `[bake] the scene was handed to Cycles N times`
(Wrenfield 148, Ladonia 423 on the code since 2026-10-12). Far more than
its passes means something is baked an object at a time again.

The developer's `BAKE_…` switches named here are listed, with the rest of
the bake's words, in [bake-options.md](bake-options.md): keep the two
lists consistent. Times by space and setting are in
[baking.md](baking.md), "Times". `node scripts/test-bake-batches.mjs` holds
the bake's passes (40 made-up sites, by the rules): run it after touching
`door_batches` or the rooms' graph.

- **What a bake's time goes on is handing the scene to Cycles.** Every
  `bpy.ops.object.bake` is a new Cycles session *for each object baked*: the
  whole scene exported and its BVH built again (Wrenfield 0.6–0.7 s, Ladonia
  about 3.5 s by arithmetic — its 16-sample draft took 1 h 55 min). The
  lightmap passes bake one joined copy (`as_one`), but the thin faces' light
  was baked on **a probe object a room**, every pass: 20 hand-overs a pass
  on Wrenfield, 94 on Ladonia — with the switches' two vertex passes a room
  each, 254 of a Wrenfield bake's 352 hand-overs and 1,168 of Ladonia's
  1,542 (the "about 147 Cycles calls" of the bake matrix counted calls, not
  objects). The log's last line now counts them: `[bake] the scene was
  handed to Cycles N times`. What was done, each held against the same bake
  as it was (a scratch comparer of that day, `cmp.mjs`, gone with the
  scratch folder: every lightmap file, switch
  layer, door crop, vertex attribute and the probes' file of two bakes):
  - **The probes of a pass are baked as one object** (`probes_as_one`,
    bake_vertices): one hand-over a vertex pass. A vertex's samples go by
    its index in the object baked, so the thin faces' light has *other
    grain* and is otherwise the same: against the reference, each vertex's
    light differs by 2.0% (median; 12.9% at the 95th percentile) and all of
    it by ×1.0000 — what the same bake with another seed differs by
    (`BAKE_SEED=1`: 2.1%, 13.0%).
  - **Doors in parts of the site that no opening joins are shut in one
    pass** (`blender/lib/batches.py`, `door_batches`; `settings.openings`,
    `roomLinks`' `joined` in `shared/roomGraph.js`: the rooms a door, a
    doorway, a stairwell or no wall joins — `settings.links`, what a
    switch is baked into — and those that only share light, through an
    arch, a hatch or a window between two rooms; none of the three
    spaces has one of those joining two parts today): a flat and the flat
    next door, two buildings. Ladonia's 84 doors, in 14 such parts: 12
    passes.
    A single house is one part — a door a pass, as before. *Within* a part
    it was tried and does not hold (`BAKE_PASSES=rooms`: doors whose rooms
    do not touch; Wrenfield's 17 in 9 passes): 31 of the 32 rooms' crops
    changed by less than another seed changes them (0.28 of a level on
    average for the seed's 6.4), but the front door, shut in the same pass
    as the loft bathroom's, took a twentieth off the loft — windowless, it
    has its daylight up the stairs from the landing over the hall, two
    openings off (its share 1.00 → 0.955).
  - **Switches stay one to a pass.** Lighting several whose light falls
    in no room in common, and taking the pass apart by room, was built
    and measured (`BAKE_PASSES=rooms`: Wrenfield's 22 switches in 14
    passes, 88 s saved) and **changes their light beyond its grain** — a
    switch alone in its pass came out the same to ×1.0000; lit with
    others: the two ensuites and the loft's shower room, in the kitchen
    lamp's pass, lost 7% of their light and a tenth of what they bounce;
    Bedroom 2's thin faces 18% (the study's lamp is a metre under its
    skirting); the desk lamp's layer in the room next door gained 59%
    from the bedroom lamp three openings away. Cause: every lamp lit is
    one more for Cycles to choose between at each bounce (its light tree
    knows no walls: a lamp the other side of a floor is "near"), a room's
    own lamp is then picked less often and counted for more each time,
    and the bounced light is clamped (`sample_clamp_indirect`) — more of
    it lost the oftener the wrong lamp is picked (shown by baking those
    four switches again with no clamp, `BAKE_ONLY=<ids> BAKE_CLAMP=0`,
    apart and together: the three small rooms then keep ×0.993–0.996 of
    their light lit together, for ×0.924–0.931 with the clamp; their
    thin faces ×1.00 for ×0.92); and light gets round a house into rooms
    a switch is not baked into. What would lift it —
    each surface lit by its own switch's lamps alone (light linking) —
    is by object, and an object baked is a hand-over; light groups cannot
    be baked. `BAKE_PASSES=parts|rooms|loose` still lights them together,
    to try again: never for a bake to keep. `lamp_sight` (a lamp's
    straight line into a room not its own, by rays at a lattice of each
    room's air) is that experiment's: on Ladonia five lamps see into
    another villa's room.
  - **`spread` works on the ring it is filling**, not the whole atlas
    eight times a round: 2 s for 15 at 4096², the same to the bit
    (two scratch tests of that day, `spread_test.py` and `spread_real.py`,
    gone with the scratch folder, held it against the
    old one, kept as `spread_whole`, on made-up and on a real bake's
    masks). It runs after every pass and on every room's crop.
  - **The ceilings' tops are denoised in their own squares of the atlas**
    (`denoise_tiles`, `TILE` 64 with 32 texels round each, laid side by
    side in one small picture): 35 squares, 0.9% of Wrenfield's atlas,
    for the whole of it three times a variant — 77 s → 13. The tops
    differ from before by 0.6 of a level on average (a seed: 0.9–1.5).
    **And with them a level here and there in the rest of the file**:
    the tops, lit with the roof off, are among the lightmap's brightest
    texels, its scale is their 99.7th percentile, and it moved in its
    fifth digit (1.61328 → 1.61319) — every code is then worked out
    against another scale, a few in a thousand fall the other side of a
    half, and the lossy WebP spreads each over its block: 12% of the
    day's texels differ by one level from the reference (0.19 on
    average) where two runs of one bake differ in 2.5–4.3%; at night,
    whose scale is its floor, 2.3% for 0.7–0.9%. The light they hold is
    the same. (Found by baking the day alone with each thing put back:
    `BAKE_APART=tops` gives the reference's scale.) Their three guide
    bakes are left: the masks of one cannot be had from another's
    exactly, and they are 5 s.
  - Not bit for bit, whatever is done: two runs of one code and seed
    differ in 2.5–4.3% of a day lightmap's texels by a level (0.04–0.06
    on average; GPU arithmetic, then the WebP), 6% of a switch's layer,
    and the per-room files in a fifth (a room's brightest texel sets its
    curve); 5–14% of the thin faces' vertices in their last digits.
    Compare bakes by what a seed changes: `BAKE_SEED=1` on the same copy
    (a day's texels 1.1 levels on average, a switch's own room 1.3, a
    thin face's vertex 2% of its light, a door's leaf 8%).
  - **Wrenfield, 512 samples at 4096: 2,197 s → 1,664** (the same code
    before and after, a quiet machine; by stage: guides and masks 55 → 29,
    day 326 → 187, doors 511 → 430, night 232 → 107, switches 1,022 →
    859), hand-overs 352 → 148; the Publish panel's draft, 128 samples
    at 2048, 622 s → 418 (its progress bar's steps are fitted to the two:
    `server/publish/bake.js` `STEPS`, each with the part of it that no
    setting shortens). Ladonia by arithmetic from its settings
    (`--dry`) and its rooms' graph: 1,542 → 423 hand-overs (1,168 → 193
    of probe objects, 374 → 230 lightmap passes: its 84 doors in 12) —
    at some 3.5 s each 65 min, 8 more of the 144 passes' own set-up
    (4–5 s a pass at 4096² on Wrenfield, half of it not the scene's),
    and 5 from `spread` and the tops: about 1 h 20 min of its 3 h 22 min,
    so about two hours. Baked since: the user's own final of 2026-10-12
    (512 at 4096, of this code by its manifest — `margin`, each
    variant's `rooms`, the night's `garden`) took 1 h 52 min by its
    folder's stamp and its `bakedAt` ([baking.md](baking.md), "Times"). Wave B's three
    drafts on the code of 2026-10-16 (128 samples at 2048, Ladonia with
    its opening furniture, to a scratch folder) each logged "the scene was
    handed to Cycles 423 times: 230 for lightmap passes, 193 for the
    vertices' and the probes' light", and took 3,640, 4,065 and 3,878 s;
    the unwrap 8.2–8.3 s, the atlas 30% filled, house texels 10.3 cm. The code as it ended — the
    doorway cuts and the layers' own copies on top of this — baked
    Wrenfield in 1,719 s with the same 148 hand-overs, a figure that is
    not clean (a browser drew on the same GPU for its first ten minutes);
    the committed code's own bake of those settings took 2,093 s. And the
    user's final of 2026-10-17 — Ladonia with its 475 opening parts and 59
    sashes, version 20261017T173248Z, 512 samples at 4096 — took 6,940 s
    (1 h 56 min; [SKILL.md](SKILL.md), step 5).
  - Developer's switches, none for a bake to keep: `BAKE_APART=switches,
    doors,probes,tops,fill` bakes each as before, to hold the two
    together; `BAKE_SEED`; `BAKE_KEEP=masks` (mask-written/-covered/
    -tops.npy beside the bake); `BAKE_CUT=switches` (no switch baked, the
    same atlas — `--no-switches` leaves the bulbs unparted and lays out
    another); `--stage passes` on bake_public.py (the passes the doors
    would go in, nothing baked: 13 s on Ladonia's snapshot); `--dry
    <file>` on bake-public.mjs (the settings alone: no bake's lock taken,
    no bake folder made under the version, Blender not looked for — it
    used to do all three before stopping).

# The bake's options

The words of `npm run bake` and `scripts/bake-public.mjs`, the
environment a bake reads, and the developer's `BAKE_…` switches. As the
code stood on 2026-10-12 (`scripts/bake-public.mjs`,
`blender/bake_public.py`), with the switches added since. Why each
developer's switch exists, and what it showed, is
[bake-time.md](bake-time.md) and [baking.md](baking.md): keep this list
and theirs consistent.

**`PUBLISH_DIR`: a bake rewrites the version there in place.** Never let
it resolve to the repo's `published/` unless the user asked for their
own bake — CLAUDE.md's rule never to write the repo's `published/`
applies to every bake. Print it (`server/publish/store.js`) and stop if
it is not the folder meant.

`npm run bake -- <id> […]` is `node scripts/bake-public.mjs`, which the Publish panel runs too.

| word | what |
|---|---|
| `--samples <n>` | Cycles samples (512). |
| `--size <n>` | The lightmap's side (4096); phones get a 2048 copy. |
| `--version <v>` | That version, not the latest published. |
| `--margin <n>` | Empty texels round every island, as at 4096 (8; the packer narrows them itself when the islands would not fit). What a bake ended with is `lighting.margin`. |
| `--static` | Only what a fully static view reads, whatever the version says. A version whose `lighting` option is `static` is baked so without it. |
| `--full` | Everything, for such a version too. |
| `--variants day,night` | A developer's: only those. A bake without a day opens unlit by day. |
| `--no-switches`, `--no-doors` | A developer's: no switch's light, no doors baked shut. |
| `--dry <file>` | A developer's: the settings written to `<file>`, nothing baked, no lock taken. |
| `--debug` | Also keeps the raw and denoised lightmaps (EXR), and a stopped bake's folder. |

- Environment: `PUBLISH_DIR` (where versions live: `published/` in the repo unless set — the bake **rewrites the version there in place** and removes that version's earlier `bake-*` folders), `BLENDER` (its path, if not found), and on the server `BAKE=off` (the panel offers no bake).
- A developer's, none for a bake to keep (`blender/bake_public.py`'s own comments say what each does): `BAKE_CUT=zones,edges,covered,lids,sun,vertices,switches` (parts left out), `BAKE_BOX=x0,z0,x1,z1` (only that part of the site), `BAKE_APART=switches,doors,probes,tops,fill` (each done as before 2026-10-12, to hold the two together), `BAKE_PASSES=parts|rooms|loose` (switches lit several to a pass: it changes their light), `BAKE_SEED=<n>`, `BAKE_ONLY=<switch ids>`, `BAKE_CLAMP=<n>`, `BAKE_KEEP=masks`, `BAKE_ROOM_QUALITY` and `BAKE_ROOM_CHROMA_QUALITY` (80 and 90), `BAKE_CHECKPOINT_UNWRAP=<file.blend>` with `BAKE_STOP=1`, `BAKE_CHECKPOINT=<file.blend>` ([bake-replay.py](bake-replay.py), this folder).
- With them: `BAKE_CUT` and `BAKE_BOX` go with `--variants night
  --no-switches --no-doors` to try one thing on a big site in minutes
  ([baking.md](baking.md)); `--stage passes` on `blender/bake_public.py`
  itself gives the passes the doors would go in, nothing baked (13 s on
  Ladonia's snapshot: [bake-time.md](bake-time.md)). The script passes
  Blender `--python-exit-code 1`, so a Python error stops the bake.
- The Publish panel's bake goes by the version's options (`bake`: final
  512 at 4096, draft 128 at 2048; `lighting: "static"` passes `--static`):
  [publish-options.md](publish-options.md). Its progress bar's steps are
  `server/publish/bake.js` `STEPS`.

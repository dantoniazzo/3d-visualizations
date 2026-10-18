# Mixamo: the user signs in, Claude downloads

Mixamo (mixamo.com, Adobe's) is where the people's characters and clips and
the visitor's own clips come from. It needs an Adobe account. The standing
rule is in `../../../CLAUDE.md` and the user's memory ("User signs in,
Claude downloads"): open the site in the browser pane, the user signs in
there themselves; never type into or click in a sign-in form, never create
an account, never sign out; ask before downloading, with the source, the
count and the sizes, and wait for a yes. The licence: Mixamo's characters
and animations may be used in a project, not passed on as files, so the
downloads stay git-ignored in `assets/people/`, and whether what is built
from them is committed is the user's to say (they chose to keep the
converted files out of git too).

These notes are how it went in the pane (2026-10-06 for the people's set,
2026-10-16 for the visitor's). The pane's other quirks — a pane never shown,
both skins, the name prompt, tabs shared with other agents — are
`../app-testing-and-performance/browser-pane.md`, which points here for
clicking by script and catching a download's link; the sink a page cannot
reach from an https site is `../app-testing-and-performance/sink.py`. The
tools are in this folder: `mixamo.js` (pasted into `javascript_tool`) and
`mixamo-fetch.sh` (the watcher, run in the background).

- **Sign-ins.** The pane keeps sign-ins. For a site that needs the user's
  account (Mixamo's Adobe login): open it, ask the user to sign in there
  themselves, and wait. Never type into or click in a sign-in form, never
  create an account, and never sign out. Whatever else the site asks —
  terms, a consent banner, an upgrade — is the user's to answer (decline
  non-essential cookies). Then work in their session, on what they asked
  for only.
- **Click by script.** A click by coordinate lands on the wrong element in
  a `resize_window`-emulated viewport (on Mixamo it selected the wrong
  character). Find the element by its text and call `element.click()`.
  Set a React `<select>` through `HTMLSelectElement.prototype`'s own
  `value` setter, then dispatch a bubbling `change`. Read back what is
  now selected before the next step.
- **Downloads.** Ask before downloading: state the source, how many files
  and their sizes once, and wait for a yes. The pane saves no downloads.
  Where a site's export ends in a link, catch the link in the page (wrap
  its `fetch` and `XMLHttpRequest`), return it from `javascript_tool`, and
  fetch it with `curl` into the project. The page of an https site could
  not reach the sink on 127.0.0.1 at all (mixamo.com, 2026-10-06): paste
  a helper's text into `javascript_tool` instead of fetching it, and
  bring each link back as the tool's result, to a file that a background
  watcher curls.
- **Mixamo** (as driven on 2026-10-06; `mixamo.js` in this folder does
  it, and its header says which of its parts ran that day):
  - Each export ends in a presigned S3 link that lives 300 s, in the JSON
    of `GET /api/v1/characters/<id>/monitor`: `{ status: "completed",
    job_result: "https://…" }`. Write each at once to
    `<links-dir>/<kind>__<name>.url` (kind `characters` or `animations`;
    the folder in the scratch folder, since a link is the whole of the
    authorisation). `mixamo-fetch.sh <links-dir> <repo>/assets/people`,
    run in the background, curls each within two seconds into
    `assets/people/<kind>/<name>.fbx` and logs it in `fetch.log`.
  - A character: its tile, "Use this character", Download with the
    dialog's selects at Format `fbx7_2019` (FBX Binary) and Pose
    `t-pose`; named `<id>` (`remy`). Each is 28–59 MB.
  - A clip: search, click its tile, wait until the page reads "<clip> on
    <character>", then Download with Format `fbx7_2019`, Skin `false`
    (Without Skin), Frames per Second `30`, Keyframe Reduction `0`; named
    as the app is to call it (`Sitting Talking`). Each is 0.3–3.8 MB. It
    exports on the skeleton of the character selected at the time. A
    tile's text is its name and its description run together: pick by
    the whole text, since names repeat (three "Drinking"s).
  - **The visitor's clips** (2026-10-16; `SKILL.md` step 2, `avatar-clips.md`
    for the pipeline): six, 3.5 MB, on whatever character the page had (Mixamo's
    default, Ch31_nonPBR — the pipeline keeps only the turns and the
    hips' path, so the character does not matter). Each tile by its whole
    text, after the search: "swim" — `SwimmingDescription: Swimming
    Underwater` and `Swimming To EdgeDescription: Swimming Breastroke To
    Edge Of Pool` (Mixamo's spelling); "tread" — `Treading
    WaterDescription: Floating`; "ledge" — `ClimbingDescription: Pulling
    Up To A Ledge` ("climbing" lists a dozen tiles called Climbing,
    "climb out" none); "stand to sit" — `Stand To SitDescription:
    Standing To Sitting Transition`; "sit to stand" — `Sit To
    StandDescription: Sitting To Standing`. "crawl", "freestyle" and
    "breaststroke" find no other stroke.
  - *In Place* is a checkbox in the clip's own panel, beside *Mirror*, not
    one of the Download dialog's selects, so `download` never sets it:
    tick it first (`mixamo.js`'s `inPlace()`, 2.5 s for the preview to
    redo; on the day a hand-written `window.__inPlace`). Of the six only
    "Swimming Underwater" had one. Tick it on a loop alone (a stroke,
    treading water): the climb and the two transitions keep their travel,
    which the app follows (`AVATAR_AS`'s `climb` and `move`).
  - On the day the watcher knew only `characters` and `animations`, so
    each link went to `<links-dir>/animations__<what it is played as>.url`
    (`Breaststroke`, not "Swimming To Edge"), fetched into a scratch
    folder, and the six were copied into `assets/people/avatar/` once each
    began `Kaydara FBX Binary`. `mixamo-fetch.sh` now takes the kind
    `avatar` (`avatar__<name>.url` → `assets/people/avatar/<name>.fbx`).
    Never into `assets/people/animations/`: `npm run people` would take
    them for the people's clips (`CLASSIFY` makes "Stand To Sit" a sitting
    pose, "Swimming" a standing one). Like the people's, they stay out of
    git (`.gitignore`: `assets/people/**/*.fbx`). A copy was kept outside
    the repo and the scratch folder:
    `~/.claude/projects/-Users-antonido-Code-per-3d-visualizations/b21f0e85-4473-429a-a7ab-8e09ce77cd35/snapshots/assets/mixamo-avatar/`.

The dialog values and the clip lists, in short (the rest above and in
`SKILL.md` step 2): characters as FBX Binary (`fbx7_2019`), T-pose, with
skin, 28–59 MB each (Ladonia's 12 were 617 MB); clips as FBX Binary, Without
Skin, 30 fps, Keyframe Reduction 0, all on one character, each file named as
the app is to call it, 0.3–3.8 MB each (Ladonia's 17 were 15 MB); the
visitor's six, 3.5 MB, *In Place* on a loop alone.

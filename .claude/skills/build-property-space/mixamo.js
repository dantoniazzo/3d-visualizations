// In-page, for https://www.mixamo.com in the browser pane: export characters
// and animation clips through the site's own Download dialog, and catch the
// link each export ends in. Then use window.__mixamo.
//
// BEFORE ANY OF IT:
//   - Mixamo needs an Adobe account. Open mixamo.com in the pane and ask the
//     user to sign in THEMSELVES. Never touch the sign-in form, never type
//     credentials, never sign out, and change nothing of the account.
//   - Confirm the download list with the user once, before the first export:
//     the source (mixamo.com), how many characters and clips, and the size
//     (a character FBX is 28–59 MB, Ladonia's 12 were 617 MB; a clip without
//     skin 0.3–3.8 MB, its 17 were 15 MB).
//   - The licence: Mixamo's characters and animations may be used in a
//     project, not passed on as files. The raw FBX stay in assets/people/,
//     which is git-ignored; whether the converted GLBs may sit in a public
//     repo is the user's call — say so (assets/THIRD_PARTY.md, People).
//
// Load it by pasting this file's text into javascript_tool: the page cannot
// reach the local sink (blocked from https://www.mixamo.com, 2026-10-06), so
// it can neither fetch helpers from it nor post to it. Paste it again after a
// reload. The pane saves no downloads either: each export ends in a
// presigned S3 link that lives 300 s, in the JSON of
// GET /api/v1/characters/<id>/monitor ({ status: "completed", job_result:
// "https://…" }) — the hook below records it, you return it from
// javascript_tool, write it to <links-dir>/<kind>__<name>.url, and
// mixamo-fetch.sh (this folder) curls it into assets/people/<kind>/.
//
// Click by script only: by coordinate, in a resize_window-emulated viewport,
// clicks landed on the wrong tile and picked the wrong character.
//
//   __mixamo.list(type, query, page)   the tiles' texts. type "Character":
//       96 a page, page 2 holds the rest; a tile's text is the character's
//       name. type "Motion": an animation search; a tile's text is
//       "<Name>Description: <description>" — pick by that whole text, since
//       names repeat (three "Drinking"s).
//   __mixamo.pickCharacter(name)       → "ok" | "no tile" | "timeout": the tile
//       clicked, "Use this character", and the editor's header naming it.
//   __mixamo.pickAnimation(query, tileText)   → "ok" | "no tile" | "timeout":
//       searched, the tile clicked, then waited until the tile is selected AND
//       the page reads "<name> on <character>" (the preview has retargeted),
//       and 4 s more. The clip exports on the current character's skeleton:
//       pick one character first and take every clip on it — the pipeline
//       (blender/import_people.py) fits them to the others.
//   __mixamo.download(options)         → { chosen, url }: the Download dialog
//       opened, its selects set, Download clicked, the link waited for (60 s).
//       Each of `options`' values is given to whichever select has it as an
//       option value (the keys only name them):
//         a character   __mixamo.CHARACTER  { format: "fbx7_2019" (FBX Binary), pose: "t-pose" }
//         a clip        __mixamo.CLIP       { format: "fbx7_2019", skin: "false" (Without Skin),
//                                             fps: "30" (24|30|60), reduction: "0" (0|1|2) }
//       `chosen` is what the selects ended at: check it.
//   __mixamo.batch(list)               starts a job in the page and returns at
//       once (a javascript_tool call stops at 45 s). Each item:
//         { kind: "characters", name: "<file name>", tile: "<character's name>" }
//         { kind: "animations", name: "<file name>", query: "<search>", tile: "<the tile's whole text>" }
//       Poll every 30 s or so:
//   __mixamo.take()                    → { state, done, of, failed, ready:
//       [{ file: "<kind>__<name>", url, age }] } — the links ready since the
//       last take, each to be written to <links-dir>/<file>.url at once (a
//       link older than 300 s is dead: the item is to be exported again).
//   __mixamo.results                   every link the hook has seen: { t, url, type }.
//
// The hook, pickCharacter, pickAnimation and download are the code that
// fetched Ladonia's 12 characters and 17 clips on 2026-10-06. list()'s
// paging, pickCharacter looking on page 2, batch() and take() were written
// for this file and have NOT run against the site: it cannot be tested
// without the user's session. The selectors (.product, .product-character,
// .product-selected, .modal-dialog, the buttons' texts) are the site's of
// that day; if one finds nothing, read the page (read_page / find) and fix
// the selector here.
//
// Ladonia's set (everyday clothes, chosen by thumbnail; no swimwear exists):
// characters lewis sophie shannon megan kate elizabeth martha remy bryce brian
// josh leonard; clips, as file name (tile, where it differs): Agreeing,
// Drinking ("Male Drinking"), Happy Idle, Laughing, Standing Idle ("Weight
// Shift Idle"), Talking ("General Conversation"), Talking Funny, Talking
// Question; Sitting Idle ("Sitting With Breathing Idle"), Sitting Talking,
// Sitting Laughing, Sitting Drinking, Sitting Reclined Male, Sitting
// Reclining Female; Laying Hands Behind Head ("Male Laying Pose: On Back,
// Legs Crossed, Hands Behind Head"), Laying Idle ("Laying On Back Idle"),
// Laying Propped Female. A clip's file name is its name in the app.
(() => {
    const M = (window.__mixamo ??= {});
    M.results ??= [];
    // Each export's link, as the page's own polling of /monitor receives it.
    if (!window.__mixamoHooked) {
        window.__mixamoHooked = true;
        const note = (j) => {
            if (j?.status === "completed" && j.job_result) M.results.push({ t: Date.now(), url: j.job_result, type: j.job_type });
        };
        const realFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await realFetch(...args);
            try {
                if (/\/monitor/.test(String(args[0]?.url ?? args[0]))) response.clone().json().then(note).catch(() => {});
            } catch {
                // Not ours to break.
            }
            return response;
        };
        const open = XMLHttpRequest.prototype.open;
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__url = url;
            return open.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function (...args) {
            if (/\/monitor/.test(String(this.__url))) {
                this.addEventListener("load", () => {
                    try {
                        note(JSON.parse(this.responseText));
                    } catch {
                        // Not JSON yet.
                    }
                });
            }
            return send.apply(this, args);
        };
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const norm = (text) => text.trim().replace(/\s+/g, " ");
    const all = (selector, root = document) => [...root.querySelectorAll(selector)];

    M.CHARACTER = { format: "fbx7_2019", pose: "t-pose" };
    M.CLIP = { format: "fbx7_2019", skin: "false", fps: "30", reduction: "0" };

    M.list = async (type = "Motion", query = "", page = 1) => {
        const characters = /^char/i.test(type);
        location.hash = `#/?limit=96&page=${page}${query ? `&query=${encodeURIComponent(query)}` : ""}&type=${characters ? "Character" : "Motion%2CMotionPack"}`;
        await sleep(3500);
        return all(characters ? ".product-character" : ".product")
            .map((tile) => tile.textContent.trim())
            .filter(Boolean);
    };

    M.pickCharacter = async (name) => {
        let tile = null;
        for (const page of [1, 2, 3]) {
            const names = await M.list("Character", "", page);
            tile = all(".product-character").find((t) => t.textContent.trim() === name);
            if (tile || !names.length) break;
        }
        if (!tile) return "no tile";
        tile.click();
        await sleep(1500);
        all("button")
            .find((b) => /use this character/i.test(b.textContent))
            ?.click();
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            if (all("h2, .editor-header").some((el) => el.textContent.trim() === name)) return "ok";
        }
        return "timeout";
    };

    M.pickAnimation = async (query, tileText) => {
        await M.list("Motion", query);
        const tile = all(".product").find((t) => norm(t.textContent) === tileText);
        if (!tile) return "no tile";
        tile.click();
        const name = tileText.split("Description:")[0].toLowerCase();
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const selected = all(".product-selected").map((el) => norm(el.textContent));
            if (selected.includes(tileText) && document.body.innerText.toLowerCase().includes(`${name} on `)) {
                await sleep(4000);
                return "ok";
            }
        }
        return "timeout";
    };

    M.download = async (options = {}) => {
        const before = M.results.length;
        all("button")
            .find((b) => b.textContent.trim().toUpperCase() === "DOWNLOAD")
            ?.click();
        await sleep(1200);
        const modal = document.querySelector(".modal-dialog");
        if (!modal) return "no modal";
        // React's selects: set through the element's own setter, then say so.
        const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        for (const select of all("select", modal)) {
            for (const value of Object.values(options)) {
                if (![...select.options].some((o) => o.value === value)) continue;
                setValue.call(select, value);
                select.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
        await sleep(300);
        const chosen = all("select", modal).map((select) => select.value);
        const button = all("button", modal).find((b) => b.textContent.trim() === "Download");
        if (!button) return { chosen, url: null, error: "no Download button in the dialog" };
        button.click();
        for (let i = 0; i < 120; i++) {
            await sleep(500);
            if (M.results.length > before) return { chosen, url: M.results.at(-1).url };
        }
        return { chosen, url: null };
    };

    M.job = { state: "idle", done: 0, of: 0, failed: [] };
    M.ready = [];
    M.batch = (list) => {
        if (M.job.state === "running") return "a batch is running: poll __mixamo.take()";
        M.job = { state: "running", done: 0, of: list.length, failed: [], at: null };
        (async () => {
            for (const item of list) {
                M.job.at = `${item.kind}/${item.name}`;
                try {
                    const picked = item.kind === "characters" ? await M.pickCharacter(item.tile ?? item.name) : await M.pickAnimation(item.query ?? item.name, item.tile);
                    if (picked !== "ok") throw new Error(`pick: ${picked}`);
                    const got = await M.download(item.options ?? (item.kind === "characters" ? M.CHARACTER : M.CLIP));
                    if (!got?.url) throw new Error(`download: ${typeof got === "string" ? got : `no link (selects ${got.chosen})`}`);
                    M.ready.push({ file: `${item.kind}__${item.name}`, url: got.url, t: Date.now(), chosen: got.chosen });
                } catch (error) {
                    M.job.failed.push({ item: `${item.kind}/${item.name}`, why: String(error?.message ?? error) });
                }
                M.job.done++;
            }
            M.job.state = "done";
            M.job.at = null;
        })();
        return `started: ${list.length} to export`;
    };
    M.take = () => ({
        state: M.job.state,
        at: M.job.at,
        done: M.job.done,
        of: M.job.of,
        failed: M.job.failed,
        ready: M.ready.splice(0).map(({ file, url, t, chosen }) => ({ file, url, age: Math.round((Date.now() - t) / 1000), chosen })),
    });
    return "mixamo ready";
})();

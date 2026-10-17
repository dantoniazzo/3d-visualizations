// coldsplit.js: what each frame spends in three's shadow pass, in the post-processing's render and in the world's
// update, and how many programs each of them built — how the 35–43 ms frame after a fridge's light came in was traced
// to the shadow maps' programs being built in it (app-notes.md, Measuring). In-page, after cold.js and boot.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/coldsplit.js?" + Date.now())).text())
//   __coldsplit.on(); …do what brings the light in, frames running…; __coldsplit.off(); __coldsplit.rows
// window.__coldsplit:
//   on() / off()   the wrappers in and out
//   rows           one row a frame: { all, world, shadow, post (ms), "#all", "#world", "#shadow", "#post" (programs built) }
//   worst(n)       the n slowest rows
(() => {
    if (window.__coldsplit) return "already";
    const e = window.experience;
    const R = e.renderer;
    const r = R.renderer;
    const rows = [];
    let row = null;
    const wrap = (owner, key, name) => {
        const f = owner[key];
        owner[key] = function (...a) {
            if (!row) return f.apply(this, a);
            const t0 = performance.now();
            const p0 = r.info.programs?.length ?? 0;
            try {
                return f.apply(this, a);
            } finally {
                row[name] = (row[name] ?? 0) + performance.now() - t0;
                row["#" + name] = (row["#" + name] ?? 0) + (r.info.programs?.length ?? 0) - p0;
            }
        };
        return () => (owner[key] = f);
    };
    const undo = [];
    window.__coldsplit = {
        rows,
        on() {
            if (undo.length) return "already on";
            undo.push(wrap(r.shadowMap, "render", "shadow"));
            if (R.post) undo.push(wrap(R.post, "render", "post"));
            undo.push(wrap(e.world, "update", "world"));
            const update = e.update;
            e.update = function (...a) {
                row = {};
                const t0 = performance.now();
                const p0 = r.info.programs?.length ?? 0;
                try {
                    return update.apply(this, a);
                } finally {
                    row.all = performance.now() - t0;
                    row["#all"] = (r.info.programs?.length ?? 0) - p0;
                    for (const k of Object.keys(row)) if (typeof row[k] === "number" && !k.startsWith("#")) row[k] = +row[k].toFixed(1);
                    rows.push(row);
                    row = null;
                }
            };
            undo.push(() => (e.update = update));
            return "on";
        },
        off() {
            for (const f of undo.splice(0).reverse()) f();
            return "off";
        },
        worst: (n = 5) => [...rows].sort((a, b) => b.all - a.all).slice(0, n),
    };
    return "coldsplit ready";
})();

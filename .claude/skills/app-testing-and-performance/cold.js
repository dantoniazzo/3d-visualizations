// cold.js: a first visit's shaders, timed in a profile that has built them all before (measuring.md, A first
// visit's shader cache in a warm profile). The browser keeps compiled programs, and the GPU its pipelines, keyed by the
// source as translated; so every shader source is salted here with a function named for this load and called from
// main (a comment is not enough: the translator drops it before the cache key is made). Every program is then compiled,
// linked and made at its first draw, as on a first visit. Every frame the app draws from then on is timed, with a 1 px
// read back (its GPU work in it).
// Right after a navigation, BEFORE boot.js (the app must not have drawn yet; boot then drives its frames):
//   await eval(await (await fetch("http://127.0.0.1:3199/cold.js?" + Date.now())).text())    → "cold <salt id>"
//   window.__cold.noWarmAll = true   // optional, set at once: the fridge lights' shaders not built ahead at load
//                                    // (Openables.warmAll made a no-op), to see what building them ahead saves
// window.__cold:
//   mark(name)             a moment to report from (performance.now())
//   report(from, ms)       the frames from mark `from` for `ms`: span, frames, median, p95, worst (ms), frames over 50
//                          and 100 ms, the time in those, frames while a fridge light's shaders were being built ahead,
//                          programs built in them, and the programs there are
//   frames                 every frame: [start, ms, programs built in it, building a light ahead]
// With coldsplit.js after boot.js, a frame's time and programs split between the shadow pass, the post-processing and
// the rest.
(() => {
    if (window.__cold) return "already";
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const salt = `void coldSalt_${id}() {}\n`;
    for (const Context of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
        if (!Context) continue;
        const source = Context.prototype.shaderSource;
        Context.prototype.shaderSource = function (shader, text) {
            const main = /void\s+main\s*\(\s*(void)?\s*\)\s*\{/.exec(text);
            if (!main) return source.call(this, shader, text);
            const salted = text.slice(0, main.index) + salt + main[0] + ` coldSalt_${id}();` + text.slice(main.index + main[0].length);
            return source.call(this, shader, salted);
        };
    }
    const cold = (window.__cold = { id, salt, noWarmAll: false, patched: false, hooked: false, frames: [], marks: {} });
    const px = new Uint8Array(4);
    const poll = setInterval(() => {
        const e = window.experience;
        if (!e?.update || cold.hooked) return;
        cold.hooked = true;
        const update = e.update;
        e.update = function (...a) {
            const r = e.renderer?.renderer;
            const o = e.world?.sceneBuilder?.openables;
            if (o && !cold.patched) {
                cold.patched = true;
                if (cold.noWarmAll) o.warmAll = () => Promise.resolve();
            }
            const t0 = performance.now();
            const p0 = r?.info.programs?.length ?? 0;
            const out = update.apply(this, a);
            if (r) {
                const gl = r.getContext();
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            }
            const spot = o?.admitted?.spot;
            cold.frames.push([t0, performance.now() - t0, (r?.info.programs?.length ?? 0) - p0, Boolean(spot?.warming || spot?.coming)]);
            return out;
        };
        clearInterval(poll);
    }, 2);
    cold.mark = (name) => (cold.marks[name] = performance.now());
    cold.report = (from, ms = 1e9) => {
        const start = cold.marks[from] ?? 0;
        const frames = cold.frames.filter((f) => f[0] >= start && f[0] < start + ms);
        if (!frames.length) return { frames: 0 };
        const times = frames.map((f) => f[1]).sort((a, b) => a - b);
        const sum = (list) => Math.round(list.reduce((a, b) => a + b, 0));
        return {
            span: Math.round(frames[frames.length - 1][0] - frames[0][0]),
            frames: frames.length,
            median: +times[times.length >> 1].toFixed(1),
            p95: +times[Math.floor(times.length * 0.95)].toFixed(1),
            worst: +times[times.length - 1].toFixed(1),
            over50: frames.filter((f) => f[1] > 50).length,
            over100: frames.filter((f) => f[1] > 100).length,
            inLong: sum(frames.filter((f) => f[1] > 50).map((f) => f[1])),
            whileWarming: frames.filter((f) => f[3]).length,
            built: frames.reduce((n, f) => n + f[2], 0),
            programs: window.experience.renderer.renderer.info.programs?.length ?? null,
        };
    };
    return "cold " + id;
})();

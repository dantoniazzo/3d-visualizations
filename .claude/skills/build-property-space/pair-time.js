// pair-time.js: frames timed in turns by two or three tabs — one per build or version — through the tools server's
// baton (serve.py), so the machine's drift and load fall on each alike (app-notes.md, Measuring). Load in each tab after
// boot.js, then gtime.js (for the GPU's own time; optional) and the project's spots (ladonia-spots.js has Ladonia's):
//   await eval(await (await fetch("http://127.0.0.1:3199/pair-time.js?" + Date.now())).text())
// window.__pair:
//   dpr2()                  the page drawn at a device pixel ratio of 2 whatever the pane's screen (the 2048 × 1536 of
//                           the 2026-10-16 tables, at a 1024 × 768 window): the same pixels in every tab
//   step(n)                 n frames of the world at 1/60 s (world.update, camera.update, afterCamera), nothing drawn
//   others(show)            other visitors' figures and name tags shown or hidden; how many there are
//   pose(eye, target, fov)  the free camera put there
//   frame(n, rounds, { update })   timed: "render" = Renderer.render + a 1 px read back (which waits for the GPU),
//                           "cpu" = Renderer.render alone, "full" = with world.update + camera + afterCamera first
//                           (update true); each the median of `rounds` medians of n frames, ms
//   draws()                 how many draws one frame makes in all its renders (three's info.render.calls holds only the
//                           last render's: post-processing's final pass at steps 2–4)
//   await run({ me, next, rounds, spots, n, k, gpu })   the turns: each round take the baton as `me` (from the tools
//                           server), then for each spot (`{ name, setup(), after() }`; setup may return { update: true }
//                           to time world.update too) others hidden, 6 frames drawn, frame(n, k), the GPU median of
//                           `gpu` frames (gtime.js, if loaded and the timer query is there), draws(); then give the baton
//                           to `next`. Rows { round, spot, render, cpu, full, gpu, draws, canvas, load } in __pair.results,
//                           __pair.done when finished, __pair.error if it stopped. A tab timing alone: give?to=<me> first.
//   await save(name)        the rows posted to the sink as <name>.json, for pair.py
//   summary()               per spot: the medians over the rounds
//   await ab(on, off, { rounds, n, gpu, update, settle })   a change's cost in one tab at the pose as it stands: on() and
//                           off() set the page each way, alternating; medians each way and the difference
// Begin with every tab booted and idle; one tab gives the baton to the first (`/give?to=a`), then each runs
// run({ me: "a", next: "b" }) / run({ me: "b", next: "a" }) at once. Pair the rows with `python3 <skill>/pair.py`.
// Time every comparison both ways round (a first, then b first), and note `load` with every cell.
(() => {
    if (window.__pair) return "already";
    const e = window.experience;
    const w = e.world;
    const R = e.renderer;
    const gl = R.renderer.getContext();
    const px = new Uint8Array(4);
    const real = window.__realFetch ?? window.fetch.bind(window);
    const TOOLS = "http://127.0.0.1:3187/";
    const SINK = "http://127.0.0.1:3199/";
    const med = (a) => {
        const s = [...a].filter((x) => x !== null && x !== undefined).sort((x, y) => x - y);
        return s.length ? Math.round(s[Math.floor(s.length / 2)] * 100) / 100 : null;
    };
    function dpr2() {
        Object.defineProperty(window, "devicePixelRatio", { get: () => 2, configurable: true });
        e.sizes.handleSizes?.();
        e.onResize?.();
        return [R.renderer.domElement.width, R.renderer.domElement.height];
    }
    function step(n = 1) {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
        }
    }
    function others(show = false) {
        let n = 0;
        for (const o of Object.values(w.player.otherPlayers ?? {})) {
            if (o.model?.avatar) o.model.avatar.visible = show;
            if (o.model?.nametag) o.model.nametag.visible = show;
            n++;
        }
        return n;
    }
    function pose(eye, target, fov = 50) {
        const cam = e.camera.activeCamera;
        cam.position.set(...eye);
        cam.lookAt(...target);
        cam.fov = fov;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
    }
    function frame(n = 15, rounds = 5, { update = true } = {}) {
        const full = [];
        const render = [];
        const cpu = [];
        for (let k = 0; k < rounds; k++) {
            for (let i = 0; i < 3; i++) {
                if (update) step(1);
                R.render();
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            }
            const a = [];
            const b = [];
            const c = [];
            for (let i = 0; i < n; i++) {
                const t0 = performance.now();
                if (update) step(1);
                const t1 = performance.now();
                R.render();
                const t2 = performance.now();
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                const t3 = performance.now();
                a.push(t3 - t0);
                b.push(t3 - t1);
                c.push(t2 - t1);
            }
            full.push(med(a));
            render.push(med(b));
            cpu.push(med(c));
        }
        return { full: update ? med(full) : null, render: med(render), cpu: med(cpu), rounds: render, canvas: [R.renderer.domElement.width, R.renderer.domElement.height], step: R.quality?.step ?? null };
    }
    function draws() {
        const three = R.renderer;
        const rbd = three.renderBufferDirect;
        let count = 0;
        three.renderBufferDirect = function (...a) {
            count++;
            return rbd.apply(this, a);
        };
        try {
            R.render();
        } finally {
            three.renderBufferDirect = rbd;
        }
        return count;
    }
    const results = [];
    async function run({ me, next, rounds = 4, spots, n = 15, k = 3, gpu = 9 }) {
        results.length = 0;
        P.done = false;
        P.error = null;
        try {
            for (let r = 0; r < rounds; r++) {
                const taken = await (await real(`${TOOLS}take?me=${encodeURIComponent(me)}&t=900`)).json();
                if (taken.holder !== me) throw new Error(`no baton: ${JSON.stringify(taken)}`);
                for (const spot of spots) {
                    const how = (await spot.setup()) ?? {};
                    others(false);
                    for (let i = 0; i < 6; i++) R.render();
                    const t = frame(n, k, { update: Boolean(how.update) });
                    let g = null;
                    if (gpu && window.__gtime?.available) g = med(await window.__gtime.frames(gpu));
                    results.push({ round: r, spot: spot.name, ...t, gpu: g, draws: draws(), load: taken.load });
                    await spot.after?.();
                }
                await real(`${TOOLS}give?to=${encodeURIComponent(next)}`);
            }
        } catch (error) {
            P.error = String(error.stack ?? error);
            await real(`${TOOLS}give?to=${encodeURIComponent(next)}`);
        }
        P.done = true;
        return results;
    }
    async function save(name) {
        return (await real(`${SINK}${name}.json`, { method: "POST", body: JSON.stringify(results) })).status;
    }
    function summary() {
        const by = {};
        for (const x of results) {
            const s = (by[x.spot] ??= { full: [], render: [], cpu: [], gpu: [], draws: [] });
            for (const key of Object.keys(s)) s[key].push(x[key]);
        }
        return Object.fromEntries(
            Object.entries(by).map(([k, v]) => [k, `render ${med(v.render)} (best ${Math.min(...v.render)}) full ${med(v.full)} cpu ${med(v.cpu)} gpu ${med(v.gpu)} draws ${med(v.draws)} [render ${v.render.join(" ")}]`])
        );
    }
    async function ab(on, off, { rounds = 4, n = 15, gpu = 9, update = false, settle = 6 } = {}) {
        const a = { render: [], cpu: [], full: [], gpu: [] };
        const b = { render: [], cpu: [], full: [], gpu: [] };
        for (let r = 0; r < rounds; r++) {
            // (Alternating which goes first, so a drift within a round falls on both.)
            for (const [set, into] of r % 2 ? [[off, b], [on, a]] : [[on, a], [off, b]]) {
                await set();
                for (let i = 0; i < settle; i++) R.render();
                const t = frame(n, 3, { update });
                into.render.push(t.render);
                into.cpu.push(t.cpu);
                into.full.push(t.full);
                if (gpu && window.__gtime?.available) into.gpu.push(med(await window.__gtime.frames(gpu)));
            }
        }
        await off();
        const sum = (x) => ({ render: med(x.render), cpu: med(x.cpu), full: med(x.full), gpu: med(x.gpu) });
        const A = sum(a);
        const B = sum(b);
        const delta = Object.fromEntries(Object.keys(A).map((key) => [key, A[key] !== null && B[key] !== null ? Math.round((A[key] - B[key]) * 100) / 100 : null]));
        return { on: A, off: B, delta };
    }
    const P = (window.__pair = { dpr2, step, others, pose, frame, draws, run, save, summary, ab, results, med, done: false, error: null });
    return "pair-time ready";
})();

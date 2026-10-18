// light-in.js: a part with a light behind it (a fridge's door) opened as a visitor first opens it, every frame timed with
// a 1 px read back until its light has been in a second — which frame the light came in, how long the frames round it
// took, the programs built in them, and the shadow maps' (depth) programs with it in — and then opened again once its
// light has gone out (speed-architecture.md, What runs every frame; measuring.md). The wave C fix
// (the light's shaders built ahead at load, Openables.warmAll, and its shadow programs with them) was judged by this:
// before it, the frame after a fridge's light came in took 35–43 ms. In-page, through the sink after boot.js and act.js,
// in a public view (or an editor tab with the realistic preview on), by day; with cold.js before boot.js for a first
// visit's shader cache:
//   await eval(await (await fetch("http://127.0.0.1:3199/light-in.js?" + Date.now())).text())
// window.__lightIn:
//   parts()                       the parts whose piece has a light inside (Openables.lights): "<piece>/<node>", the kind
//   await first({ part, stand, aim, settle })   `part` a node name (default: the first such part); stood at `stand` and
//                                 aimed at `aim` (default: a spot found round the part from which the crosshair is on
//                                 it, as Openables.warm needs), `settle` ms driven, then opened (setOpen, as E does):
//                                 { target, programs, depth, lightInAtFrame, aroundIn (ms, +Np where programs were
//                                 built), worstAfterIn, worstBeforeIn, frames, intensity }
//   await again(n, { part, wait })   opened n more times, each once its light has gone out (wait), its first frames:
//                                 [{ inAt, first, worst, built, median }]
// It shuts the part after each opening. Ladonia's A1 fridge: part "ld-kitchen-ochre-a1door1", stand [5.6, 0, 7.9], aim
// [5.6, 1.053, 9.198].
(() => {
    if (window.__lightIn) return "already";
    const e = window.experience;
    const w = e.world;
    const r = e.renderer.renderer;
    const gl = r.getContext();
    const px = new Uint8Array(4);
    const o = w.sceneBuilder.openables;
    const lit = () => new Map(o.lights.map((entry) => [entry.piece, entry]));
    function parts() {
        const by = lit();
        return o.parts.filter((p) => by.has(p.piece)).map((p) => ({ name: `${p.piece}/${p.node.name}`, node: p.node.name, label: p.label, kind: by.get(p.piece).aim ? "spot" : "point" }));
    }
    const partOf = (name) => {
        const by = lit();
        return name ? o.parts.find((p) => p.node.name === name || `${p.piece}/${p.node.name}` === name) : o.parts.find((p) => by.has(p.piece));
    };
    const lampOf = (part) => o.pool[lit().get(part.piece)?.aim ? "spot" : "point"];
    const admissionOf = (part) => o.admitted[lit().get(part.piece)?.aim ? "spot" : "point"];
    /** A spot round the part from which the crosshair is on it (everyE's search). */
    function reach(part) {
        const A = window.__act;
        const d = A.drawers().find((x) => x.part === part);
        if (!d) return null;
        const y = w.sceneBuilder.furniture.get(part.piece)?.placement.position[1] ?? 0;
        for (let rad = 0.45; rad <= 1.9; rad += 0.2) {
            for (let a = 0; a < 360; a += 20) {
                const x = d.at[0] + rad * Math.cos((a * Math.PI) / 180);
                const z = d.at[2] + rad * Math.sin((a * Math.PI) / 180);
                const st = A.stand([x, y, z]);
                if (st.moved > 0.25 || Math.abs(st.feet[1] - y) > 0.3) continue;
                const g = A.aim(d.at);
                if (g.target?.id === d.name) return { stand: [x, y, z], aim: d.at };
            }
        }
        return null;
    }
    function timed(lamp) {
        const frames = [];
        const update = e.update;
        const state = { inAt: -1, frames };
        e.update = function (...a) {
            // (The light comes in between frames, as its shaders are found built: this frame is the first with it in.)
            if (lamp?.visible && state.inAt < 0) state.inAt = frames.length;
            const t0 = performance.now();
            const p0 = r.info.programs.length;
            const out = update.apply(this, a);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            frames.push([performance.now() - t0, r.info.programs.length - p0]);
            return out;
        };
        state.undo = () => (e.update = update);
        return state;
    }
    async function first({ part = null, stand = null, aim = null, settle = 4000 } = {}) {
        const p = partOf(part);
        if (!p) return { error: "no part with a light inside its piece" };
        const spot = admissionOf(p);
        let where = stand && aim ? { stand, aim } : null;
        await window.__drive(15000, () => spot.warmed > 0 && !spot.warming && !spot.coming);
        const atLoad = r.info.programs.length;
        if (where) {
            window.__act.stand(where.stand);
            window.__act.aim(where.aim);
        } else where = reach(p);
        if (!where) return { error: `no spot found from which the crosshair is on ${p.piece}/${p.node.name}: give stand and aim` };
        await window.__drive(settle, () => false);
        await window.__drive(15000, () => !spot.warming && !spot.coming);
        await window.__drive(1000);
        const target = w.player.target?.kind ?? null;
        const before = r.info.programs.length;
        const depthKeys = () => r.info.programs.filter((q) => /^(depth|distance),/.test(q.cacheKey)).length;
        const depthBefore = depthKeys();
        const lamp = lampOf(p);
        const t = timed(lamp);
        try {
            p.setOpen(true);
            await window.__drive(6000, () => t.inAt >= 0 && t.frames.length > t.inAt + 60);
        } finally {
            t.undo();
        }
        const frames = t.frames.map(([ms, n]) => [+ms.toFixed(1), n]);
        const late = t.inAt < 0 ? frames : frames.slice(t.inAt);
        p.setOpen(false);
        await window.__drive(300);
        return {
            part: `${p.piece}/${p.node.name}`,
            stand: where.stand,
            target,
            programs: { atLoad, before, after: r.info.programs.length, builtInFrames: frames.reduce((n, f) => n + f[1], 0) },
            depth: { before: depthBefore, after: depthKeys() },
            lightInAtFrame: t.inAt,
            aroundIn: frames.slice(Math.max(0, t.inAt - 2), t.inAt + 6).map((f) => f[0] + (f[1] ? `+${f[1]}p` : "")).join(" "),
            worstAfterIn: late.length ? Math.max(...late.map((f) => f[0])) : null,
            worstBeforeIn: t.inAt > 0 ? Math.max(...frames.slice(0, t.inAt).map((f) => f[0])) : null,
            frames: frames.length,
            intensity: lamp ? +lamp.intensity.toFixed(3) : null,
        };
    }
    async function again(n = 5, { part = null, wait = true } = {}) {
        const p = partOf(part);
        if (!p) return { error: "no part with a light inside its piece" };
        const lamp = lampOf(p);
        const runs = [];
        for (let k = 0; k < n; k++) {
            if (wait) await window.__drive(7000, () => !lamp?.visible);
            await window.__drive(800);
            const t = timed(lamp);
            try {
                p.setOpen(true);
                await window.__drive(3000, () => t.inAt >= 0 && t.frames.length > t.inAt + 30);
            } finally {
                t.undo();
            }
            const ms = t.frames.map((f) => f[0]);
            runs.push({ inAt: t.inAt, first: ms.length ? +ms[0].toFixed(1) : null, worst: ms.length ? +Math.max(...ms).toFixed(1) : null, built: t.frames.reduce((s, f) => s + f[1], 0), median: ms.length ? +[...ms].sort((a, b) => a - b)[ms.length >> 1].toFixed(1) : null });
            p.setOpen(false);
        }
        return runs;
    }
    window.__lightIn = { parts, first, again };
    return `light-in ready (${parts().length} part(s) with a light)`;
})();

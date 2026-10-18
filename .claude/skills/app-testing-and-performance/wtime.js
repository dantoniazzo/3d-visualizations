// wtime.js (2026-10-16): what the water costs a frame. Load through the sink once the visitor is in (an editor tab after harness.js, or a public view), after act.js and water.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/wtime.js?" + Date.now())).text())
// window.__wtime:
//   frames(n)                   render() + a 1 px read back, n times: each frame's ms
//   compare(label, on, off, { rounds, n })  rounds of n frames with `on()` then `off()` applied before each half,
//                               alternating, the same camera: medians and best of each, and the difference; each side's
//                               `draws` is how many draws one frame makes in all its renders, counted at renderBufferDirect (three's
//                               info.render.calls holds only the last render of a frame: post-processing's final pass
//                               at steps 2–4)
//   draws()                     that count, for the page as it is now
//   update(n)                   ms a call of world.water.update(1/60) as it is now (n calls)
(() => {
    const e = window.experience;
    const R = e.renderer;
    const gl = R.renderer.getContext();
    const px = new Uint8Array(4);
    const median = (a) => {
        const s = [...a].sort((x, y) => x - y);
        return s.length ? s[Math.floor(s.length / 2)] : null;
    };
    function frames(n = 9) {
        const out = [];
        R.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (let i = 0; i < n; i++) {
            const t0 = performance.now();
            R.render();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            out.push(performance.now() - t0);
        }
        return out;
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
    function compare(label, on, off, { rounds = 5, n = 9 } = {}) {
        const a = [];
        const b = [];
        for (let r = 0; r < rounds; r++) {
            on();
            a.push(...frames(n));
            off();
            b.push(...frames(n));
        }
        const r2 = (x) => Math.round(x * 100) / 100;
        const ma = median(a);
        const mb = median(b);
        on();
        const drawsOn = draws();
        off();
        const drawsOff = draws();
        return { label, on: { median: r2(ma), best: r2(Math.min(...a)), draws: drawsOn }, off: { median: r2(mb), best: r2(Math.min(...b)), draws: drawsOff }, delta: r2(ma - mb), deltaBest: r2(Math.min(...a) - Math.min(...b)), canvas: [R.renderer.domElement.width, R.renderer.domElement.height], step: R.quality?.step };
    }
    function update(n = 200) {
        const W = e.world.water;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) W.update(1 / 60);
        return Math.round(((performance.now() - t0) / n) * 1000) / 1000;
    }
    window.__wtime = { frames, compare, update, draws };
    return "wtime ready";
})();

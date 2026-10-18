// gtime.js (2026-10-16): a frame's GPU time, from the timer query (EXT_disjoint_timer_query_webgl2), as
// against wtime.js's render() and a pixel read back (which carries the CPU's submission and the sync too). Load
// through the sink once the visitor is in (an editor tab after harness.js, or a public view):
//   await eval(await (await fetch("http://127.0.0.1:3199/gtime.js?" + Date.now())).text())
// window.__gtime:
//   await frames(n)                n frames rendered, each between a begin and an end of a TIME_ELAPSED query: ms each
//   await compare(label, on, off, { rounds, n })   as __wtime.compare, by GPU time: medians and bests, and the difference
(() => {
    const e = window.experience;
    const R = e.renderer;
    const gl = R.renderer.getContext();
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    const px = new Uint8Array(4);
    const median = (a) => {
        const s = [...a].sort((x, y) => x - y);
        return s.length ? s[Math.floor(s.length / 2)] : null;
    };
    /** A turn of the event loop (a hidden pane's timers are throttled; a message is not): query results wait for one. */
    const turn = () => new Promise((res) => {
        const c = new MessageChannel();
        c.port1.onmessage = res;
        c.port2.postMessage(0);
    });
    async function frames(n = 9) {
        if (!ext) return null;
        R.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const queries = [];
        for (let i = 0; i < n; i++) {
            const q = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            R.render();
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            queries.push(q);
            // (Each frame done before the next is begun: queued behind the last, a query counts its wait too.)
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const out = [];
        for (const q of queries) {
            // (Never in the task that asked: WebGL's rule.)
            for (let k = 0; k < 400 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await turn();
            const ok = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT);
            if (ok) out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q);
        }
        return out;
    }
    async function compare(label, on, off, { rounds = 6, n = 9 } = {}) {
        const a = [];
        const b = [];
        for (let r = 0; r < rounds; r++) {
            on();
            a.push(...(await frames(n)));
            off();
            b.push(...(await frames(n)));
        }
        const r2 = (x) => Math.round(x * 100) / 100;
        const ma = median(a);
        const mb = median(b);
        return { label, on: { median: r2(ma), best: r2(Math.min(...a)) }, off: { median: r2(mb), best: r2(Math.min(...b)) }, delta: r2(ma - mb), deltaBest: r2(Math.min(...a) - Math.min(...b)), canvas: [R.renderer.domElement.width, R.renderer.domElement.height], step: R.quality?.step, samples: [a.length, b.length] };
    }
    window.__gtime = { frames, compare, available: Boolean(ext) };
    return "gtime " + (ext ? "ready" : "unavailable");
})();

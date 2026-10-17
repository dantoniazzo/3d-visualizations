// fast.js: short timers for a tab the browser throttles (app-notes.md, The browser pane; Measuring). A hidden pane's
// timers fire once a second, and once a minute after five minutes hidden, so every setTimeout(…, 50) the app or a tool
// waits on takes a second or a minute. Here a setTimeout of up to 250 ms is kept by this page and run from the event loop:
// at once when it is due within 4 ms, else after a ~20 ms wait on the tools server (serve.py, 127.0.0.1:3187:
// take?me=__sleep&t=0.02 — a request is not throttled). Longer timers, intervals and everything else stay the
// browser's. Like drive.js for frames, it changes how long a wait takes, not what is drawn. serve.py must be running
// (without it each wait is a refused request: still short, but noisy in the console).
// boot.js loads it; by hand, once per page, before what it should speed up:
//   await eval(await (await fetch("http://127.0.0.1:3187/fast.js")).text())   → "fast timers" | "already"
// window.__fastTimers is true once it is in. A page reload takes it out.
(() => {
    if (window.__fastTimers) return "already";
    window.__fastTimers = true;
    const S = "http://127.0.0.1:3187/";
    const real = (window.__realFetch ??= window.fetch.bind(window));
    const realSet = window.setTimeout.bind(window);
    const realClear = window.clearTimeout.bind(window);
    const pending = new Map();
    let seq = 2e9;
    let pumping = false;
    const ch = new MessageChannel();
    const pump = async () => {
        for (;;) {
            const now = performance.now();
            for (const [id, t] of [...pending]) {
                if (t.due > now) continue;
                pending.delete(id);
                try {
                    t.fn(...t.args);
                } catch (error) {
                    console.error(error);
                }
            }
            if (!pending.size) {
                pumping = false;
                return;
            }
            let next = Infinity;
            for (const t of pending.values()) next = Math.min(next, t.due);
            if (next - performance.now() <= 4) {
                await new Promise((res) => {
                    ch.port1.onmessage = res;
                    ch.port2.postMessage(0);
                });
            } else await real(S + "take?me=__sleep&t=0.02").then(() => {}, () => {});
        }
    };
    window.setTimeout = (fn, ms = 0, ...args) => {
        if (typeof fn !== "function" || ms > 250) return realSet(fn, ms, ...args);
        const id = ++seq;
        pending.set(id, { fn, args, due: performance.now() + (Number(ms) || 0) });
        if (!pumping) {
            pumping = true;
            pump();
        }
        return id;
    };
    window.clearTimeout = (id) => {
        if (!pending.delete(id)) realClear(id);
    };
    return "fast timers";
})();

// boot.js: a test tab made ready to measure, right after each navigation and before anything else (app-notes.md, The
// browser pane; Measuring). It needs the sink (sink.py, 3199) and the tools server (serve.py, 3187) running:
//   await eval(await (await fetch("http://127.0.0.1:3187/boot.js?" + Date.now())).text()); await window.__dvBoot; window.__dvBooted
// What it does, in order:
//   - keeps the page's own fetch as window.__realFetch, and stubs every other non-GET fetch (answered {} 200) but those to
//     the tools' servers (127.0.0.1:3187 and :3199): a save never reaches the scene. Unlike harness.js it stubs a
//     publish, its runtime file and a bake too — set window.__bootPublish = true before loading it to let /publish,
//     /runtime and /bake through (a test server's PUBLISH_DIR only: never the repo's published/);
//   - keeps every console warning and error, uncaught error and unhandled rejection in window.__log (300 chars each);
//   - loads fast.js (short timers) and drive.js, and drives the frames (__driveOn): a hidden pane's tab runs;
//   - gives the app its first frame by hand if the one it asked for went to the browser before drive.js came in
//     (Experience.request asks for one frame at a time: a frame called by hand drops the one asked before it);
//   - waits for the world and the preloader's resources, passes the name prompt ("dv") and clicks an avatar: the one
//     named by window.__pickSkin ("male" | "female", set before loading this), else the first;
//   - in an editor tab (not /view/…) loads harness.js (window.__K) and sets the pace to "always" (an editor at rest
//     draws nothing: app-notes.md, When the editor draws), and waits for World.relit;
//   - where the post-processing is wanted (Renderer.postWanted: a public view, an editor's realistic preview; not an
//     editor under its plain light), waits up to 4 s for its chunk (`postWait`, in 50 ms steps).
// window.__dvBooted is what it came to:
//   { ready, how, kicked, postWait, ms, skin, roomLight, url, lighting, baked, step, post, canvas, size, stored, log }
// `how`: "already" (the visitor was in), "prompt" (the name prompt passed and the avatar clicked) or "forced": the
// walkthrough had not started 4 s after the click, so the preloader was taken off by hand, body.walkthrough-active set
// and camera.pointerLockEnabled faked. Forced happened in 57 of the 145 loads of 2026-10-16/17: the visitor is then
// whatever avatar the app had made, so read world.player.player.avatarSkin before trusting the skin.
// The 2026-10-16 version wrapped experience.update to drop a second call within one turn; dropping the frame the
// browser had been asked for left experience.queued set and stalled the loop in a long session. The app has kept one
// loop itself since 2026-10-13, so the wrapper is gone. In a tab booted by that version:
//   delete experience.update; experience.queued = 0; experience.update()
(() => {
    if (window.__dvBoot) return "already";
    const SINK = "http://127.0.0.1:3199/";
    const TOOLS = "http://127.0.0.1:3187/";
    const real = (window.__realFetch ??= window.fetch.bind(window));
    const t00 = performance.now();
    const tick = () => new Promise((res) => {
        const c = new MessageChannel();
        c.port1.onmessage = res;
        c.port2.postMessage(0);
    });
    window.__dvBoot = (async () => {
        try {
            performance.setResourceTimingBufferSize(8000);
        } catch {
            // Not everywhere.
        }
        if (!window.__stubbed) {
            window.__stubbed = true;
            const through = /127\.0\.0\.1:31(87|99)/;
            const publish = /\/(publish|runtime|bake)(\/|\?|$)/;
            window.fetch = (url, opts = {}) => {
                const m = (opts.method || "GET").toUpperCase();
                const u = String(url?.url ?? url);
                if (m !== "GET" && !through.test(u) && !(window.__bootPublish && publish.test(u))) return Promise.resolve(new Response("{}", { status: 200 }));
                return real(url, opts);
            };
        }
        window.__log ??= [];
        if (!window.__logHooked) {
            window.__logHooked = true;
            for (const k of ["error", "warn"]) {
                const o = console[k].bind(console);
                console[k] = (...a) => {
                    window.__log.push(k + ": " + a.map((x) => x?.message ?? String(x)).join(" ").slice(0, 300));
                    o(...a);
                };
            }
            window.addEventListener("error", (ev) => window.__log.push("uncaught: " + ev.message));
            window.addEventListener("unhandledrejection", (ev) => window.__log.push("rejection: " + (ev.reason?.message ?? ev.reason)));
        }
        if (!window.__fastTimers) await eval(await (await real(TOOLS + "fast.js?" + Date.now())).text());
        if (!window.__drive) await eval(await (await real(SINK + "drive.js?" + Date.now())).text());
        __driveOn();
        // The first frame: the app's own if it is queued now, else one called by hand.
        let kicked = false;
        {
            const t0 = performance.now();
            while (!window.experience?.update && performance.now() - t0 < 30000) await tick();
            const ex = window.experience;
            if (ex?.update) {
                const asked = ex.asked ?? 0;
                await __drive(1600, () => (ex.asked ?? 0) > asked);
                if ((ex.asked ?? 0) === asked) {
                    kicked = true;
                    ex.update();
                }
            }
        }
        const pub = /^\/view\//.test(location.pathname);
        const harness = pub ? null : eval(await (await real(SINK + "harness.js?" + Date.now())).text());
        if (!pub) window.experience.pace?.set?.("always");
        const ready = () => window.experience?.world?.sceneBuilder && window.experience.world.player && (!pub || window.experience.world.birdView);
        const inside = () => document.body.classList.contains("walkthrough-active");
        await __drive(90000, () => ready() && (inside() || document.querySelector("#name-input")));
        let how = "already";
        if (ready() && !inside()) {
            how = "prompt";
            await __drive(20000, () => document.querySelector("#name-input") && window.experience.preloader?.resourcesReady !== false);
            const input = document.querySelector("#name-input");
            if (input) {
                input.value = "dv";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                document.querySelector("#name-input-button")?.click();
                await __drive(1200);
                const skin = window.__pickSkin;
                (document.querySelector(skin ? `.avatar-option[data-avatar="${skin}"]` : ".avatar-option") ?? document.querySelector(".avatar-option"))?.click();
                await __drive(4000, inside);
            }
            if (!inside()) {
                how = "forced";
                document.querySelector(".preloader")?.remove();
                document.body.classList.add("walkthrough-active");
                window.experience.camera.pointerLockEnabled = true;
                await __drive(500);
            }
        }
        window.dispatchEvent(new Event("resize"));
        await __drive(300);
        if (harness) {
            await __drive(20000, () => window.__K);
            await harness;
        }
        const e = window.experience;
        const w = e.world;
        const R = e.renderer;
        window.__lost = 0;
        R.renderer.domElement.addEventListener("webglcontextlost", () => window.__lost++);
        if (w.relit) {
            let done = false;
            Promise.resolve(w.relit).then(() => (done = true), () => (done = true));
            await __drive(30000, () => done);
        }
        await __drive(2500);
        let postWait = 0;
        // (Under the editor's plain light the post-processing is asked for but not made until the light goes
        // (Renderer.setPlain: plainExposure not null): nothing to wait for, as on a build that never asks
        // (postWanted null). Only a build before postWanted has the sky stand in for it. Until 2026-10-17 every editor
        // boot waited the whole 4 s here.)
        const wanted = "postWanted" in R ? Boolean(R.postWanted) && (R.plainExposure ?? null) === null : Boolean(w.sky);
        for (; postWait < 80 && R.quality?.post && wanted && !R.post; postWait++) {
            await new Promise((res) => setTimeout(res, 50));
            await __drive(120);
        }
        await __drive(1500);
        const r = R.renderer;
        let stored = [];
        try {
            stored = Object.keys(localStorage);
        } catch {
            stored = null;
        }
        return {
            ready: Boolean(ready()),
            how,
            kicked,
            postWait,
            ms: Math.round(performance.now() - t00),
            skin: w.player?.player?.avatarSkin ?? null,
            roomLight: w.roomLight ? w.roomLight.status().state : null,
            url: location.pathname + location.search,
            lighting: w.lighting ?? null,
            baked: w.sceneBuilder?.baked ?? null,
            step: R.quality?.step,
            post: Boolean(R.post),
            canvas: [r.domElement.width, r.domElement.height],
            size: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
            stored,
            log: window.__log.slice(0, 10),
        };
    })().then(
        (x) => (window.__dvBooted = x),
        (err) => (window.__dvBooted = { error: String(err.stack || err) })
    );
    return "booting";
})();

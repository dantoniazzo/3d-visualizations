// Paste into the page (javascript_tool) once the space has loaded; then use
// window.__K. Renders camera views to JPEGs through the frame sink
// (sink.py on 127.0.0.1:3199). The app must be a test server's — saves are
// stubbed so nothing writes the scene file.
//
// An editor tab (`/?scene=<id>`) opens under the editor's plain light with
// the houses alone drawn (World/PlainLight.js, World/Scope.js): no sun, no
// shadows, no lamps, no post-processing, and no garden, cars, far ground
// or sky. A frame that judges light, or shows any of those, needs
// `await __K.realistic()` first — __K.render does it itself — or the link's
// `?preview=1`; `__K.scope("all")` shows the surroundings under the plain
// light. shot() and time() draw and time the tab as it is lit now: say
// which. A public view (`/view/<id>`) is always lit as it is.
//
// An editor tab draws a frame only when something has changed (app-notes.md,
// When the editor draws): shot(), time() and render() draw by hand and are
// not touched by it; whatever waits on the app's own frames needs
// `experience.pace.set("always")` first.
//
// Under the plain light the editor draws the house and the furniture by
// stand-ins (World/StandIns.js: merged and instanced copies under the
// scene's "stand-ins" group): shot() and time() draw those, and time()'s
// draw calls are theirs. The real meshes stay in the scene, `visible`, on
// layer 12, which no camera draws. So a tool of yours that walks the scene
// passes over `userData.standIn`; a Raycaster of yours needs
// `layers.enable(12)`; and after hiding or re-dressing a mesh by hand inside
// a wall or a piece, `experience.world.standIns.hear()` before the next
// shot — it is otherwise in the picture for up to 16 frames more
// (app-notes.md, The editor's plain light and view scope).
//
// The stub answers every non-GET itself (`{}`, 200) but those to the sink
// and a publish's: a tool of yours that POSTs anywhere else — a results
// server on another port — must take `window.fetch` before this is loaded,
// or post through the sink.
(async () => {
    for (let i = 0; i < 160; i++) {
        const w = window.experience?.world;
        if (w?.sceneBuilder && w.player) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    const real = window.fetch.bind(window);
    window.fetch = (url, opts = {}) => {
        const m = (opts.method || "GET").toUpperCase();
        // Saves stubbed (the scene is the user's); publishing, its runtime file and a bake go through.
        if (m !== "GET" && !/127\.0\.0\.1:3199/.test(String(url)) && !/\/(publish|runtime|bake)(\/|\?|$)/.test(String(url))) return Promise.resolve(new Response("{}", { status: 200 }));
        return real(url, opts);
    };
    const e = window.experience, w = e.world, r = e.renderer.renderer, cam = e.camera.activeCamera;
    const K = (window.__K = {
        e, w, r, cam,
        /**
         * An editor tab's walkthrough lit as a visitor will see it — the realistic preview (World.setPreview): the sun and its
         * shadows, the lamps, the lit rooms, the post-processing, and with it everything shown — for this page only (nothing
         * kept in the browser), once what it first makes is there: the post-processing's chunk, the garden's trees. `false`:
         * back to the plain light. Edit mode is always plain; a public view is always as it is. Returns what is drawn now.
         */
        async realistic(on = true) {
            if (!e.publicView && w.setPreview) {
                await w.setPreview(on, { remember: false });
                const R = e.renderer;
                if (on && !w.plain && R.postWanted && R.quality?.post && !R.post) await R.usePost(true, R.postWanted);
                if (on) await Promise.race([Promise.resolve(w.vegetation?.treeSet?.ready).catch(() => {}), new Promise((res) => setTimeout(res, 20000))]);
            }
            return { plain: Boolean(w.plain), scope: w.scope?.current ?? "all", post: Boolean(e.renderer.post), garden: w.vegetation?.planted ?? null };
        },
        /** An editor tab's scope under the plain light — "house" (as it opens), "exterior" or "all" (World/Scope.js) — for this page only. */
        scope(value = "all") {
            w.scope?.set(value, { remember: false });
            return w.scope?.current ?? "all";
        },
        /** Put the camera at p looking at t, with a vertical fov. */
        pose(p, t, fov = 40) { cam.position.set(...p); cam.lookAt(...t); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); },
        /** The frame as drawn now, scaled to `width`, labelled. */
        shot(label, width = 800) {
            r.shadowMap.needsUpdate = true;
            w.vegetation?.update?.(0.016);
            e.renderer.render();
            const cv = document.createElement("canvas");
            cv.width = width;
            cv.height = Math.round((width * r.domElement.height) / r.domElement.width);
            const g = cv.getContext("2d");
            g.drawImage(r.domElement, 0, 0, cv.width, cv.height);
            g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, 0, cv.width, 16);
            g.fillStyle = "#fff"; g.font = "11px sans-serif"; g.fillText(label, 5, 12);
            return cv;
        },
        /** Canvases tiled `cols` across into one JPEG, written by the sink as `name`. */
        async save(name, canvases, cols = 2) {
            const cw = canvases[0].width, ch = canvases[0].height;
            const cv = document.createElement("canvas");
            cv.width = cw * Math.min(cols, canvases.length);
            cv.height = ch * Math.ceil(canvases.length / cols);
            const g = cv.getContext("2d");
            canvases.forEach((x, i) => g.drawImage(x, (i % cols) * cw, Math.floor(i / cols) * ch));
            const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.88));
            return (await fetch("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
        },
        /** Views by name: [position, target, fov]. Add the references' camera positions here. */
        views: {},
        async render(name, keys, { night = false, width = 800, cols = 2 } = {}) {
            // Reference frames are judged for their light: in an editor tab, the realistic preview first.
            await K.realistic();
            if (night) await w.setLighting?.("night");
            const shots = [];
            for (const k of keys) { const [p, t, f] = K.views[k]; K.pose(p, t, f); shots.push(K.shot(k + (night ? " (night)" : ""), width)); }
            if (night) await w.setLighting?.("day");
            return K.save(name, shots, cols);
        },
        /** Milliseconds a frame at the current view, and draw calls and triangles without post. */
        time(n = 6) {
            const gl = r.getContext(), px = new Uint8Array(4);
            const post = e.renderer.post; e.renderer.post = null; r.render(e.scene, cam);
            const calls = r.info.render.calls, tris = r.info.render.triangles; e.renderer.post = post;
            e.renderer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) { e.renderer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
            return { ms: +((performance.now() - t0) / n).toFixed(1), calls, tris };
        },
    });
    return "ready";
})();

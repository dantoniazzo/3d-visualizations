// Paste into the page (javascript_tool) once the space has loaded; then use
// window.__K. Renders camera views to JPEGs through the frame sink
// (sink.py on 127.0.0.1:3199). The app must be a test server's — saves are
// stubbed so nothing writes the scene file.
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

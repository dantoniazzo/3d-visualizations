// tv.js: the televisions driven headlessly (../visitor-interactions/sitting-and-tv.md, Televisions). Load it through
// the sink after act.js and sit.js, in an editor tab (after harness.js) or a public view:
//   await eval(await (await fetch("http://127.0.0.1:3199/tv.js")).text())
// then window.__tv:
//   list()                    every set: id, piece, centre, on, level, visible
//   freeze(t)                 the video held at t seconds (seeked, paused, the screens' play() a no-op) — for pictures to compare
//   unfreeze()                played again as Screens decides
//   frames(ts)                the video's own frame's mean luma (sRGB 0–255) at each time, drawn into a 2D canvas; it
//                             leaves the video frozen (unfreeze() after). freeze and frames need the video, which is made
//                             the first time a set is switched on: before that they answer "no video"
//   measure(id, { shot })     a frame rendered now; the set's picture on the screen: its mean luma, its 99th percentile,
//                             the share of its pixels at 250+; the wall round it (a ring 15–40 % of its size outside) likewise
//   shot(name)                a frame rendered now, posted to the sink
//   off()                     every set switched off
(() => {
    if (window.__tv) return "already";
    const e = window.experience, w = e.world;
    const S = () => w.screens;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    let held = null;
    function list() {
        return S().list.map((s) => ({ id: s.id, piece: s.placement.catalog_id, centre: s.centre.toArray().map(r3), on: s.on, level: r3(s.level), visible: Boolean(s.mesh?.visible) }));
    }
    async function freeze(t) {
        const screens = S();
        const video = screens.video;
        if (!video) return "no video";
        if (!held) {
            held = screens.play;
            screens.play = () => {};
        }
        video.pause();
        if (Math.abs(video.currentTime - t) > 0.01) {
            await new Promise((res) => {
                video.addEventListener("seeked", res, { once: true });
                video.currentTime = t;
                setTimeout(res, 3000);
            });
        }
        screens.texture.needsUpdate = true;
        return { t: video.currentTime, ready: video.readyState };
    }
    function unfreeze() {
        if (held) S().play = held;
        held = null;
        return "ok";
    }
    async function frames(ts) {
        const video = S().video;
        // (The one <video> is made the first time any set is switched on: Screens.js.)
        if (!video) return "no video: switch a set on first (E at it, or w.screens.toggle(set, true))";
        const c = document.createElement("canvas");
        c.width = 160;
        c.height = 90;
        const g = c.getContext("2d", { willReadFrequently: true });
        const out = [];
        for (const t of ts) {
            await freeze(t);
            g.drawImage(video, 0, 0, 160, 90);
            const d = g.getImageData(0, 0, 160, 90).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            out.push([t, Math.round(sum / (d.length / 4))]);
        }
        return out;
    }
    function render() {
        e.renderer.render();
        const cv = e.renderer.renderer.domElement;
        const c = document.createElement("canvas");
        c.width = cv.width;
        c.height = cv.height;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(cv, 0, 0);
        return { c, g, cv };
    }
    function stats(g, w, h, inside) {
        const lumas = [];
        const step = Math.max(1, Math.round(Math.sqrt((w * h) / 40000)));
        const d = g.getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                if (!inside(x, y)) continue;
                const i = (y * w + x) * 4;
                lumas.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            }
        }
        if (!lumas.length) return null;
        lumas.sort((a, b) => a - b);
        const mean = lumas.reduce((a, b) => a + b, 0) / lumas.length;
        return { n: lumas.length, mean: Math.round(mean), p50: Math.round(lumas[lumas.length >> 1]), p99: Math.round(lumas[Math.floor(lumas.length * 0.99)]), at250: r3(lumas.filter((v) => v >= 250).length / lumas.length) };
    }
    async function measure(id, { shot = null } = {}) {
        const s = S().byId.get(id);
        const cam = e.camera.activeCamera;
        const { c, g, cv } = render();
        const W = cv.width, H = cv.height;
        // The picture's corners on the screen, and a ring round them.
        const corner = (u, v) => {
            const p = s.mesh.position.clone();
            const m = s.mesh.matrix;
            p.set(u, v, 0).applyMatrix4(m).project(cam);
            return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
        };
        const quad = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
        const inQuad = (q, x, y) => {
            let sign = 0;
            for (let i = 0; i < 4; i++) {
                const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
                const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
                if (cross === 0) continue;
                const sg = Math.sign(cross);
                if (sign && sg !== sign) return false;
                sign = sg;
            }
            return true;
        };
        const scaled = (k) => {
            const cx = quad.reduce((a, p) => a + p[0], 0) / 4, cy = quad.reduce((a, p) => a + p[1], 0) / 4;
            return quad.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
        };
        const inner = scaled(0.92), outer = scaled(1.4), ringIn = scaled(1.15);
        const picture = stats(g, W, H, (x, y) => inQuad(inner, x, y));
        const wall = stats(g, W, H, (x, y) => inQuad(outer, x, y) && !inQuad(ringIn, x, y));
        const frame = stats(g, W, H, () => true);
        let posted = null;
        if (shot) {
            const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
            posted = (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + shot, { method: "POST", body: blob })).status;
        }
        return { picture, wall, frame, exposure: r3(e.renderer.renderer.toneMappingExposure), quad: quad.map((p) => p.map(Math.round)), posted, t: r3(S().video?.currentTime ?? -1) };
    }
    async function shot(name) {
        const { c } = render();
        const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
        return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
    }
    function off() {
        for (const s of S().list) if (s.on) S().toggle(s, false);
        return list().filter((s) => s.on).length;
    }
    window.__tv = { list, freeze, unfreeze, frames, measure, shot, off };
    return "tv ready";
})();

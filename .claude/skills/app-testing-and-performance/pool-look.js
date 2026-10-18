// pool-look.js: a pool's water as drawn, from fixed poses, as sheets to the sink, and what it costs
// (../visitor-interactions/pool-water.md; ../visitor-interactions/swimming.md). In-page, through the sink after boot.js
// (and pool.js for the figure's sheets), in an editor tab with the realistic preview on (harness.js's __K.realistic) or
// a public view:
//   await eval(await (await fetch("http://127.0.0.1:3199/pool-look.js?" + Date.now())).text())
// window.__poolLook:
//   water(i)                    the i-th pool's live surface mesh ("pool-water", in SceneBuilder.landscapeLive) and its
//                               depth pass ("pool-water-depth"): { surface, under }
//   poses(i)                    poses round the i-th pool, from its box and steps: deck (from the side, at the steps),
//                               along (from the far end), above, low (grazing), steps (close), bird (bird's-eye height);
//                               each [label, eye, target, fov]
//   LADONIA                     the same six as fixed for Ladonia's B pool on 2026-10-16 (box [14.2, 34.6, 17, 42.6])
//   step(n)                     world.update + camera.update + afterCamera at 1/60, n times (ripples and caustics move)
//   pose(eye, target, fov)      the active camera put there
//   await sheet(name, poses, cols, width)   each pose drawn (Renderer.render) and labelled; one sheet to the sink
//   await swimSheet(name, label, views, cols)   the visitor's figure as the camera sees it round its head: views
//                               [label, forward, side, up, look] in the figure's frame
//   hide(on)                    the surface (and its depth pass under it) hidden or shown
//   time(k, n)                  Renderer.render + a 1 px read back, k rounds of n frames: the median ms (hide(true) and
//                               time again for what the water costs)
(() => {
    if (window.__poolLook) return "already";
    const e = window.experience;
    const w = e.world;
    const R = e.renderer;
    const r = R.renderer;
    const r2 = (v) => Math.round(v * 100) / 100;
    const pools = () => w.player.swimmer?.pools ?? [];
    function water(i = 0) {
        const live = w.sceneBuilder.landscapeLive;
        const surfaces = [];
        live?.traverse((n) => {
            if (n.name === "pool-water") surfaces.push(n);
        });
        const surface = surfaces[i] ?? null;
        return { surface, under: surface?.children.find((c) => c.name === "pool-water-depth") ?? null };
    }
    function poses(i = 0) {
        const p = pools()[i];
        if (!p) return {};
        const [x0, z0, x1, z1] = p.box;
        const L = p.level;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        // The steps' end (Swim.js's poolSteps: `out`, the way out over them; z1 when the pool has none), the far end,
        // and across: a point is `t` of the way from the far end to the steps' end, `across` m to one side of the middle.
        const [ox, oz] = w.player.swimmer.stepsOf?.get(p)?.out ?? [0, 1];
        const near = [cx + (ox * (x1 - x0)) / 2, cz + (oz * (z1 - z0)) / 2];
        const far = [cx - (ox * (x1 - x0)) / 2, cz - (oz * (z1 - z0)) / 2];
        const half = ox ? (z1 - z0) / 2 : (x1 - x0) / 2;
        const side = [oz, ox];
        const at = (t, across, y) => [r2(far[0] + (near[0] - far[0]) * t + side[0] * across), r2(L + y), r2(far[1] + (near[1] - far[1]) * t + side[1] * across)];
        // (Ladonia's B pool gives LADONIA's poses back to a centimetre or two.)
        return {
            deck: ["deck -> steps", at(0.425, half + 1.4, 1.71), at(0.86, 0, -0.74), 60],
            along: ["far end -> along the pool", at(-0.175, 0, 1.76), at(0.74, 0, -0.84), 60],
            above: ["from above", at(1.175, half + 3.5, 9.06), at(0.5, 0, -0.44), 60],
            low: ["low, grazing", at(0.05, 1.2, 0.51), at(0.8, -0.2, -0.94), 60],
            steps: ["the steps close up", at(0.625, -0.4, 1.26), at(0.96, 0, -0.84), 60],
            bird: ["bird's-eye height", at(-0.51, 0, 22.06), at(0.5, 0, -0.44), 55],
        };
    }
    const LADONIA = {
        deck: ["deck -> steps", [18.4, 1.65, 38.0], [15.6, -0.8, 41.5], 60],
        along: ["north end -> along the pool", [15.6, 1.7, 33.2], [15.6, -0.9, 40.5], 60],
        above: ["from above", [20.5, 9, 44], [15.6, -0.5, 38.6], 60],
        low: ["low, grazing", [16.8, 0.45, 35.0], [15.4, -1.0, 41.0], 60],
        steps: ["the steps close up", [15.2, 1.2, 39.6], [15.6, -0.9, 42.3], 60],
        bird: ["bird's-eye height", [15.6, 22, 30.5], [15.6, -0.5, 38.6], 55],
    };
    function step(n = 1) {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
        }
    }
    function pose(eye, target, fov = 60) {
        const cam = e.camera.activeCamera;
        cam.position.set(...eye);
        cam.lookAt(...target);
        cam.fov = fov;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
    }
    function grab(label, width = 900) {
        R.render();
        const cv = document.createElement("canvas");
        cv.width = width;
        cv.height = Math.round((width * r.domElement.height) / r.domElement.width);
        const g = cv.getContext("2d");
        g.drawImage(r.domElement, 0, 0, cv.width, cv.height);
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(0, 0, cv.width, 16);
        g.fillStyle = "#fff";
        g.font = "11px sans-serif";
        g.fillText(label, 5, 12);
        return cv;
    }
    async function save(name, canvases, cols = 2) {
        const cw = canvases[0].width;
        const ch = canvases[0].height;
        const cv = document.createElement("canvas");
        cv.width = cw * Math.min(cols, canvases.length);
        cv.height = ch * Math.ceil(canvases.length / cols);
        const g = cv.getContext("2d");
        canvases.forEach((x, i) => g.drawImage(x, (i % cols) * cw, Math.floor(i / cols) * ch));
        const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.88));
        return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
    }
    async function sheet(name, list = Object.values(poses()), cols = 2, width = 900) {
        const shots = [];
        for (const [label, eye, target, fov] of list) {
            pose(eye, target, fov ?? 60);
            shots.push(grab(`${label}  eye ${eye.map(r2)}`, width));
        }
        return save(name, shots, cols);
    }
    async function swimSheet(name, label, views, cols = 2) {
        const P = w.player;
        const shots = [];
        for (const [lab, fwd, side, up, look = -0.05] of views) {
            const H = P.player.collider.end;
            const yaw = P.avatar.avatar.rotation.y;
            const f = [Math.sin(yaw), Math.cos(yaw)];
            pose([H.x + f[0] * fwd + f[1] * side, H.y + up, H.z + f[1] * fwd - f[0] * side], [H.x, H.y + look, H.z]);
            shots.push(grab(`${label}: ${lab} (${P.player.animation})`, 700));
        }
        return save(name, shots, cols);
    }
    function hide(on, i = 0) {
        const { surface } = water(i);
        if (surface) surface.visible = !on;
        return Boolean(surface);
    }
    function time(k = 5, n = 9) {
        const gl = r.getContext();
        const px = new Uint8Array(4);
        const out = [];
        for (let j = 0; j < k; j++) {
            R.render();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const t0 = performance.now();
            for (let i = 0; i < n; i++) {
                R.render();
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            }
            out.push((performance.now() - t0) / n);
        }
        out.sort((a, b) => a - b);
        return +out[Math.floor(out.length / 2)].toFixed(2);
    }
    window.__poolLook = { water, poses, LADONIA, step, pose, grab, save, sheet, swimSheet, hide, time };
    return `pool-look ready (${pools().length} pool(s), surface ${Boolean(water().surface)})`;
})();

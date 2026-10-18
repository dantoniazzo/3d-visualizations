// birdcar.js: driving from the bird's-eye view, driven headlessly (../visitor-interactions/driving.md;
// ../visitor-interactions/picker-and-keys.md). In-page, through the sink after boot.js (or drive.js), in a public view
// (/view/<id>) or an editor tab:
//   await eval(await (await fetch("http://127.0.0.1:3199/birdcar.js?" + Date.now())).text())
// An editor tab opens with the scope "house" (World/Scope.js), where no car is offered: F does nothing there. Set
// `__K.scope("all")` (or "exterior") first. A car driven stays where it was left: stand by it again from cars().
// window.__bc — each part reports null for what a build lacks, so the same calls run on a base build and a new one:
//   info()                 the view from above, the visitor, the car driven (or the first), its lamps, the camera, the HUD
//   cars()                 every car: id, model, where, heading, its lamps' mode
//   stand([x, y, z])       the capsule stood there (feet), out of any seat or pool, settled 20 frames
//   key(code, down)        a keydown / keyup on document, as the keyboard sends it (code and key)
//   tap(code, frames)      key down and up, then `frames` frames stepped
//   step(frames, dt)       world.update + camera.update + afterCamera, `dt` (1/60) a frame: no time of the page's own
//   drive(plan, every)     [{ keys: ["KeyW"], frames: 120 }, …]: each held for its frames, stepped; a sample every 30
//   route(points, opts)    a driver steering for [x, z] points in turn by the keys (W, A/D off line by 4°+, Space to
//                          slow): where each was reached, samples, and with { timed: true } each frame timed with its render
//   screenOf([x, y, z])    where a world point is on the screen (client px, and depth)
//   click(x, y, type)      a press and release that does not move (pointerType mouse | touch) on the canvas: what was told
//   hover(x, y)            a mouse passing over the canvas: what the pick label says then, and the cursor
//   drag(dx, dy, steps)    a one-finger / mouse drag on the canvas
//   await shadows(fn)      how many shadow-map draws ran while fn ran (0 from above: the sun's map is held there)
//   await shot(name)       a frame rendered now: its mean level; saved to the sink as `name` if given (canvas only: vshot.js
//                          for the HUD over it)
//   await frames(ms)       the page's own frames for ms (__drive): real time passes
//   behind({ at })         the scripted drive behind a car, as on the build before: stood by it (Ladonia's BMW 'car' at
//                          [23.5, -1, 14.5] by default), F, V (nothing at the wheel), backed out, a turn, ahead, braked, F
//                          out; every number to the millimetre. JSON.stringify(__bc.behind()) on two builds is compared
//                          byte for byte
//   time(n, opts) / timeDrive(frames, keys)   renders timed (render + 1 px read back): best, median, p95, frames over 16.7
//   told                   every "vehicle", "bird", "interact", "prompt" and "bird-hover" told since loading
(() => {
    if (window.__bc) return "already";
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const sb = w.sceneBuilder;
    const cam = e.camera;
    const V = cam.perspectiveCamera.position.constructor;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const deg = (a) => Math.round(((a * 180) / Math.PI) * 10) / 10;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const $ = (id) => document.getElementById(id);
    const told = [];
    for (const name of ["vehicle", "bird", "interact", "prompt", "bird-hover"]) {
        w.on(name, (x) => told.push([name, name === "vehicle" ? { driving: x.driving, car: x.car?.spec?.id } : name === "prompt" ? x && x.label : name === "bird-hover" ? x && { kind: x.kind ?? null, label: x.label } : x]));
    }

    function lamps(car) {
        const L = car?.lights;
        if (!L) return null;
        const lens = (L.parts ?? []).filter((p) => p.mesh.visible).length;
        return { mode: L.mode, held: L.held ? L.held.mode ?? "null" : null, beam: L.beam ? (L.beam.isSpotLight ? "spot" : "pool") : null, beamVisible: Boolean(L.beam?.visible), lensLit: lens, state: { ...L.state } };
    }

    function info() {
        const b = w.birdView;
        const car = P.inVehicle ? P.currentCar : null;
        const c = pl.collider;
        const cp = cam.perspectiveCamera.position;
        return {
            bird: b ? { active: b.active, level: b.level, follow: b.follow, theta: deg(wrap(b.theta)), phi: deg(b.phi), radius: r3(b.radius), target: b.target.toArray().map(r3), sinceDrag: b.sinceDrag === undefined ? null : r3(b.sinceDrag) } : null,
            player: { inVehicle: P.inVehicle, car: P.currentCar?.spec.id ?? null, feet: [r3(c.start.x), r3(c.start.y - c.radius), r3(c.start.z)], avatarVisible: P.avatar?.avatar.visible ?? null, remote: Boolean(P.remote), animation: pl.animation },
            car: car ? { at: car.group.position.toArray().map(r3), heading: deg(wrap(car.heading)), speed: r3(car.speed), controls: { ...car.controls }, wantTheta: deg(wrap(car.heading + Math.PI)) } : null,
            lamps: lamps(car ?? sb.cars?.[0]),
            camera: { at: [r3(cp.x), r3(cp.y), r3(cp.z)], vehicleMode: Boolean(cam.vehicleMode), controlsEnabled: cam.controls ? cam.controls.enabled : null, scheme: cam.scheme, mode: cam.mode, distanceToCar: car ? r3(cp.distanceTo(car.group.position)) : null },
            hud: {
                viewToggle: $("view-toggle-label")?.textContent,
                birdToggle: $("bird-toggle")?.classList.contains("is-active"),
                prompt: !$("action-prompt")?.hidden ? `${$("action-key").textContent} ${$("action-label").textContent}` : null,
                touch: !$("touch-action")?.hidden ? $("touch-action-label").textContent : null,
                notice: !$("view-notice")?.hidden ? $("view-notice").textContent : null,
                pick: !$("pick-label")?.hidden ? $("pick-label").textContent : null,
                cursor: e.canvas.style.cursor,
                bodyBird: document.body.classList.contains("bird-view"),
            },
        };
    }

    function cars() {
        return (sb.cars ?? []).map((car) => ({ id: car.spec.id, model: car.model?.meta?.name ?? null, at: car.group.position.toArray().map(r3), heading: deg(wrap(car.heading)), visible: car.group.visible, lamps: lamps(car) }));
    }

    function step(frames = 1, dt = 1 / 60) {
        for (let i = 0; i < frames; i++) {
            e.time.delta = dt;
            w.update();
            cam.update();
            w.afterCamera?.();
        }
    }

    function stand([x, y, z]) {
        // (Up off any seat and out of any pool first, as Player.placeAt does: a capsule put out of the water by hand keeps
        // the float's lay-back on the figure otherwise.)
        if (P.seated) P.stand?.({ now: true });
        P.rising = null;
        P.swimmer?.reset();
        sb.settleCollision?.();
        pl.collider.start.set(x, y + 0.36, z);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
        P.actions = {};
        e.time.delta = 1 / 60;
        const remote = P.remote;
        P.remote = () => 0;
        for (let i = 0; i < 20; i++) P.updateColliderMovement();
        P.remote = remote;
        step(2);
        return info();
    }

    const keyOf = (code) => (code.startsWith("Key") ? code.slice(3).toLowerCase() : code === "Space" ? " " : code);
    function key(code, down = true) {
        document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: keyOf(code), bubbles: true, cancelable: true }));
    }
    function tap(code, frames = 2) {
        key(code, true);
        key(code, false);
        step(frames);
        return info();
    }

    /** Hold keys for frames, sampling every `every` frames. */
    function drive(plan, every = 30) {
        const samples = [];
        for (const { keys = [], frames = 60 } of plan) {
            for (const code of keys) key(code, true);
            for (let i = 0; i < frames; i++) {
                step(1);
                if (i % every === every - 1) {
                    const now = info();
                    samples.push({ keys: keys.join("+"), car: now.car && { at: now.car.at, speed: now.car.speed, heading: now.car.heading, wantTheta: now.car.wantTheta }, bird: now.bird && now.bird.active ? { theta: now.bird.theta, target: now.bird.target, level: now.bird.level } : null, cam: now.camera.at });
                }
            }
            for (const code of keys) key(code, false);
        }
        return samples;
    }

    /**
     * A driver steering for points in turn, by the keys (W, and A or D when off line by more than 4°), each until
     * within `tol` m or `frames` run out: a sample each `every` frames and where each point was reached.
     */
    function route(points, { frames = 1200, tol = 2.5, every = 60, slow = 8, timed = false } = {}) {
        const samples = [];
        const times = [];
        const gl = e.renderer.renderer.getContext();
        const px = new Uint8Array(4);
        const reached = [];
        let held = new Set();
        const hold = (codes) => {
            for (const code of held) if (!codes.has(code)) key(code, false);
            for (const code of codes) if (!held.has(code)) key(code, true);
            held = codes;
        };
        let n = 0;
        for (const [px, pz] of points) {
            let ok = false;
            for (let i = 0; i < frames; i++, n++) {
                const car = P.currentCar;
                if (!car) break;
                const dx = px - car.group.position.x;
                const dz = pz - car.group.position.z;
                if (Math.hypot(dx, dz) < tol) {
                    ok = true;
                    break;
                }
                const off = wrap(Math.atan2(dx, dz) - car.heading);
                const codes = new Set();
                if (Math.abs(car.speed) < slow || Math.abs(off) < 0.5) codes.add("KeyW");
                else codes.add("Space");
                if (off > 0.07) codes.add("KeyA");
                else if (off < -0.07) codes.add("KeyD");
                hold(codes);
                const t0 = performance.now();
                step(1);
                if (timed) {
                    e.renderer.render();
                    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                    times.push(performance.now() - t0);
                }
                if (n % every === 0) {
                    const b = w.birdView;
                    samples.push({ at: car.group.position.toArray().map((v) => Math.round(v * 10) / 10), speed: r3(car.speed), heading: deg(wrap(car.heading)), theta: b?.active ? deg(wrap(b.theta)) : null, behind: b?.active ? deg(wrap(b.theta - car.heading - Math.PI)) : null, target: b?.active ? b.target.toArray().map((v) => Math.round(v * 10) / 10) : null, level: b?.level });
                }
            }
            reached.push({ point: [px, pz], ok, frame: n });
        }
        hold(new Set());
        step(1);
        if (!timed) return { reached, samples };
        const kept = times.slice(5).sort((a, b) => a - b);
        const at = (q) => Math.round(kept[Math.min(kept.length - 1, Math.floor(q * kept.length))] * 100) / 100;
        const slowest = times.map((t, i) => [i, Math.round(t * 10) / 10]).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return { reached, samples, times: { n: kept.length, best: at(0), median: at(0.5), p95: at(0.95), over16: kept.filter((t) => t > 16.7).length, slowest } };
    }

    function screenOf([x, y, z]) {
        cam.perspectiveCamera.updateMatrixWorld();
        const p = new V(x, y, z).project(cam.perspectiveCamera);
        const rect = e.canvas.getBoundingClientRect();
        return [Math.round(rect.left + ((p.x + 1) / 2) * rect.width), Math.round(rect.top + ((1 - p.y) / 2) * rect.height), r3(p.z)];
    }

    function pointer(type, target, x, y, pointerType = "mouse", id = 1, buttons = 1) {
        target.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType, bubbles: true, cancelable: true, isPrimary: true, buttons }));
    }
    function click(x, y, pointerType = "mouse") {
        const before = told.length;
        pointer("pointerdown", e.canvas, x, y, pointerType);
        pointer("pointerup", e.canvas, x, y, pointerType, 1, 0);
        step(2);
        return { told: told.slice(before), after: info() };
    }
    function hover(x, y) {
        pointer("pointermove", e.canvas, x, y, "mouse", 1, 0);
        return { pick: !$("pick-label").hidden ? $("pick-label").textContent : null, cursor: e.canvas.style.cursor };
    }
    function drag(dx, dy, steps = 10, pointerType = "mouse") {
        const rect = e.canvas.getBoundingClientRect();
        let x = rect.left + rect.width * 0.3;
        let y = rect.top + rect.height * 0.5;
        pointer("pointerdown", e.canvas, x, y, pointerType);
        for (let i = 0; i < steps; i++) {
            x += dx / steps;
            y += dy / steps;
            pointer("pointermove", e.canvas, x, y, pointerType);
        }
        pointer("pointerup", e.canvas, x, y, pointerType, 1, 0);
        return info();
    }

    async function shadows(fn) {
        const sm = e.renderer.renderer.shadowMap;
        const real = sm.render;
        let n = 0;
        sm.render = function (lights, ...a) {
            // (Only the passes that draw: three skips the map when nothing asks for it, and each light that does not.)
            if (sm.enabled && (sm.autoUpdate || sm.needsUpdate)) n += (lights ?? []).filter((l) => l.castShadow !== false && (l.shadow?.autoUpdate || l.shadow?.needsUpdate)).length;
            return real.call(this, lights, ...a);
        };
        try {
            await fn();
        } finally {
            sm.render = real;
        }
        return n;
    }

    async function frames(ms) {
        return __drive(ms);
    }

    async function shot(name) {
        const cv = e.renderer.renderer.domElement;
        e.renderer.render();
        const small = document.createElement("canvas");
        small.width = 256;
        small.height = 192;
        const g = small.getContext("2d");
        g.drawImage(cv, 0, 0, 256, 192);
        const d = g.getImageData(0, 0, 256, 192).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        let status = null;
        if (name) {
            const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.85));
            status = (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
        }
        return { mean: Math.round((sum / (d.length / 4)) * 10) / 10, status };
    }

    /**
     * The drive behind the car, as on the build before: stood by 'car', F, V (nothing, at the wheel), backed out, a
     * turn, ahead, braked, F out. Every number rounded to the millimetre, for two builds to be compared.
     */
    function behind({ at = [23.5, -1, 14.5] } = {}) {
        const out = {};
        stand(at);
        step(5);
        out.prompt = info().hud.prompt;
        const start = told.length;
        tap("KeyF", 3);
        const i1 = info();
        out.in = { player: i1.player, camera: i1.camera, prompt: i1.hud.prompt, toggle: i1.hud.viewToggle, bird: i1.bird?.active ?? null };
        tap("KeyV", 2);
        out.afterV = { mode: cam.mode, bird: Boolean(w.birdView?.active), camera: info().camera.at };
        out.samples = drive([{ keys: ["KeyS"], frames: 100 }, { keys: ["Space"], frames: 40 }, { keys: ["KeyW", "KeyA"], frames: 60 }, { keys: ["KeyW"], frames: 90 }, { keys: ["Space"], frames: 60 }], 25).map((x) => [x.keys, x.car.at, x.car.speed, x.car.heading, x.cam]);
        tap("KeyF", 3);
        const i2 = info();
        out.out = { player: i2.player, camera: i2.camera, prompt: i2.hud.prompt, toggle: i2.hud.viewToggle, bird: i2.bird?.active ?? null, angles: cam.angles && { h: r3(cam.angles.horizontal), v: r3(cam.angles.vertical) } };
        out.told = told.slice(start).filter((t) => t[0] !== "interact");
        return out;
    }

    /** The render timed (render() and one pixel read back, which waits for the GPU): `n` frames after `warm`, ms. */
    function time(n = 9, { warm = 3, run = false, rounds = 1 } = {}) {
        const gl = e.renderer.renderer.getContext();
        const px = new Uint8Array(4);
        const once = () => {
            if (run) step(1);
            e.renderer.render();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        };
        const all = [];
        for (let k = 0; k < rounds; k++) {
            for (let i = 0; i < warm; i++) once();
            for (let i = 0; i < n; i++) {
                const t0 = performance.now();
                once();
                all.push(performance.now() - t0);
            }
        }
        all.sort((a, b) => a - b);
        const at = (q) => Math.round(all[Math.min(all.length - 1, Math.floor(q * all.length))] * 100) / 100;
        return { n: all.length, best: at(0), median: at(0.5), p95: at(0.95), over16: all.filter((t) => t > 16.7).length };
    }

    /** `frames` frames with `keys` held, each timed with its render, as time() does. */
    function timeDrive(frames, keys) {
        const gl = e.renderer.renderer.getContext();
        const px = new Uint8Array(4);
        const all = [];
        for (const code of keys) key(code, true);
        for (let i = 0; i < frames; i++) {
            const t0 = performance.now();
            step(1);
            e.renderer.render();
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            if (i >= 5) all.push(performance.now() - t0);
        }
        for (const code of keys) key(code, false);
        all.sort((a, b) => a - b);
        const at = (q) => Math.round(all[Math.min(all.length - 1, Math.floor(q * all.length))] * 100) / 100;
        return { n: all.length, best: at(0), median: at(0.5), p95: at(0.95), over16: all.filter((t) => t > 16.7).length };
    }

    window.__bc = { time, timeDrive, behind, info, cars, stand, key, tap, step, drive, route, screenOf, click, hover, drag, shadows, shot, frames, told };
    return "birdcar ready";
})();

// pool.js: a pool driven headlessly — wading in down its steps, swimming, treading water, climbing out
// (../visitor-interactions/swimming.md). In-page, through the sink after boot.js (and act.js), in an editor tab or a
// public view:
//   await eval(await (await fetch("http://127.0.0.1:3199/pool.js?" + Date.now())).text())
// window.__pool:
//   pool(i)                     the site's pools as Swim.js has them (box [x0, z0, x1, z1], level, depth, steps): the i-th
//   at(u, v, y, i)              a point by shares of a pool's box: u across x (0 = x0, 1 = x1), v along z; y default the
//                               water's level − 0.2 (afloat). Ladonia's B pool: box [14.2, 34.6, 17, 42.6], steps on z1
//   stand([x, y, z], yawDeg)    placed there by Player.teleport (placeAt: up off any seat, out of any water at once),
//                               facing yawDeg (0 = +z), 20 frames settled: st()
//   step(n)                     world.update + camera.update + afterCamera at 1/60, n times
//   hold(actions, frames)       P.actions set ({ forward, backward, left, right, run }), frames stepped, released, 5 more
//   space(frames)               Space pressed (setMovementKey) and released after a frame (a jump, or climbing out where
//                               the edge offers it), frames stepped
//   look(h, v)                  the view's angles (radians; pointer-lock scheme), a frame stepped
//   st()                        the water's state (out, dry-in-pool, wading, afloat, climb), depth, pace, the capsule
//                               (feet, head, at), velocity, on the floor, the clip asked and played, the figure's root,
//                               the prompt and the last "interact" events told, the camera, underwater (and the page's tint)
//   await shot(name, width)     a picture with the HUD over it (vshot.js, loaded if need be), to the sink
//   run(list)                   [[label, fn], …]: each fn run, its result or st() after it
//   said                        what the page told: the prompt, interact events, underwater
// pool-look.js has the water's look from fixed poses; clips.js the figure against the water; swim-trace.js and
// swim-checks.js the frame-by-frame measures.
(() => {
    if (window.__pool) return "already";
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const cam = e.camera;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const v3 = (v) => [r3(v.x), r3(v.y), r3(v.z)];
    const said = { prompt: null, interact: [], underwater: null };
    w.on("prompt", (p) => (said.prompt = p ? `${p.key} ${p.label} / ${p.touch?.label}:${p.touch?.icon}` : null));
    w.on("interact", (d) => said.interact.push(`${d.kind}:${d.id}:${d.state}`));
    cam.on?.("underwater", (u) => (said.underwater = u));
    const pool = (i = 0) => P.swimmer.pools[i] ?? null;
    function at(u = 0.5, v = 0.5, y = null, i = 0) {
        const p = pool(i);
        if (!p) return null;
        const [x0, z0, x1, z1] = p.box;
        return [r3(x0 + (x1 - x0) * u), r3(y ?? p.level - 0.2), r3(z0 + (z1 - z0) * v)];
    }
    function step(n = 1) {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            cam.update();
            w.afterCamera?.();
        }
    }
    function stand(position, yaw = 0, settle = 20) {
        // (A spawn's yaw is in degrees: Player.placeAt.)
        P.teleport({ position, yaw });
        P.actions = {};
        step(settle);
        return st();
    }
    function hold(actions, frames = 30, after = 5) {
        P.actions = { ...actions };
        step(frames);
        P.actions = {};
        step(after);
        return st();
    }
    function space(frames = 30) {
        P.setMovementKey("Space", true);
        step(1);
        P.setMovementKey("Space", false);
        step(frames);
        return st();
    }
    function look(h, v = 0.18) {
        if (cam.angles) {
            cam.angles.horizontal = h;
            cam.angles.vertical = v;
        }
        step(1);
    }
    function st() {
        const s = P.swimmer;
        const b = pl.collider;
        const a = P.avatar?.avatar;
        return {
            mode: s.climb ? "climb" : s.afloat ? "afloat" : s.wading ? "wading" : s.pool ? "dry-in-pool" : "out",
            depth: r3(s.depth),
            pace: r3(s.pace),
            feet: r3(b.start.y - b.radius),
            segment: r3(b.end.y - b.start.y),
            head: r3(b.end.y),
            at: [r3(b.end.x), r3(b.end.z)],
            v: v3(pl.velocity),
            onFloor: pl.onFloor,
            anim: pl.animation,
            clip: P.avatar?.animation.actions.current?.getClip().name ?? null,
            root: a ? r3(a.position.y) : null,
            leaning: Boolean(s.leaning),
            prompt: said.prompt,
            interact: said.interact.slice(-3),
            camera: v3(cam.perspectiveCamera.position),
            view: cam.mode,
            underwater: Boolean(cam.underwater),
            tint: document.body.classList.contains("underwater"),
        };
    }
    async function shot(name, width = 1280) {
        if (!window.__vshot) await eval(await (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/vshot.js?" + Date.now())).text());
        return window.__vshot(name, { width });
    }
    function run(list) {
        const out = [];
        for (const [label, fn] of list) {
            const r = fn();
            out.push([label, r ?? st()]);
        }
        return out;
    }
    window.__pool = { pool, at, stand, step, hold, space, look, st, shot, run, said };
    return P.swimmer?.pools?.length ? `pool ready (${P.swimmer.pools.length} pool(s))` : "pool ready (no pool on this site)";
})();

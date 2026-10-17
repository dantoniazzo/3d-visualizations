// sit.js: sitting driven headlessly (app-notes.md, Sitting). Load it through the sink after act.js, in an editor tab (after
// harness.js) or a public view:
//   await eval(await (await fetch("http://127.0.0.1:3199/sit.js")).text())
// then window.__sit:
//   seats({ furniture, catalog, near: [x,z], within })   the seats there are (World/Seats.js), with whether each is usable
//   before(id, out = 1.0)       stood `out` m in front of a seat's front edge, facing it: { feet }
//   aim(id)                     the crosshair turned onto the seat's point: the look and prompt (act.js's aim)
//   press(frames)               E, then frames stepped: what was told
//   step(frames)                world.update + camera.update at 1/60
//   state()                     seated? (the seat, t, mode, from, point, head, eye, and how it sat: plan — "clip" or
//                               "walk" — the part playing, the side sat on, afar, a prelude's fade), rising (and by what:
//                               "clip", "walk", "fade"), the figure's opacity, avatar root, capsule, camera pivot/mode,
//                               prompt, animation
//   await ready()               the figure's clips fitted (Avatar.wear), the seats' clips dressed and their catalogue
//                               read — do this first in a driven tab (below)
//   view(turn, pitch, dist)     the camera turned round the seated head (third person), for a picture: turn in degrees from the seat's front
//   shot(name)                  a frame rendered now, posted to the sink
// In a driven tab, first `await __sit.ready()` (or `await P.avatar.wear(experience); await w.seats.dress(P.avatar);
// await w.seats.catalogue()`): else the first E only queues the sit — Player.sit answers "sitting" and calls itself
// again once those promises settle, which a synchronous press()/step() never lets happen.
(() => {
    if (window.__sit) return "already";
    const e = window.experience, w = e.world, P = w.player, cam = e.camera;
    const V = cam.perspectiveCamera.position.constructor;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const byId = (id) => w.seats.list.find((s) => s.id === id);
    function seats({ furniture = null, catalog = null, near = null, within = 3 } = {}) {
        const placements = new Map((w.sceneBuilder.spec.furniture || []).map((f) => [f.id, f]));
        return w.seats.list
            .filter((s) => (!furniture || s.furniture === furniture) && (!catalog || placements.get(s.furniture)?.catalog_id === catalog) && (!near || Math.hypot(s.at.x - near[0], s.at.z - near[1]) <= within))
            .map((s) => ({ id: s.id, catalog: placements.get(s.furniture)?.catalog_id, kind: s.kind, at: s.at.toArray().map(r3), facing: s.facing, depth: r3(s.depth), height: r3(s.height), base: s.base, deep: s.deep, usable: w.seats.usable(s) }));
    }
    function step(frames = 1) {
        for (let i = 0; i < frames; i++) {
            e.time.delta = 1 / 60;
            w.update();
            cam.update();
            w.afterCamera?.();
        }
    }
    function before(id, out = 1.0) {
        const s = byId(id);
        const edge = s.depth - Math.min(0.15, s.depth / 2);
        const x = s.at.x + s.face[0] * (edge + out), z = s.at.z + s.face[1] * (edge + out);
        const stood = __act.stand([x, s.floor, z]);
        return stood;
    }
    function aim(id) {
        const s = byId(id);
        return __act.aim([s.at.x, s.at.y + 0.12, s.at.z]);
    }
    function press(frames = 30) {
        return __act.press("E", frames);
    }
    function state() {
        const st = P.seated;
        const a = P.avatar.avatar;
        const c = P.player.collider;
        const pivot = cam.scheme === "pointerLock" ? cam.target : cam.controls.target;
        return {
            seated: st
                ? {
                      seat: st.seat.id,
                      t: r3(st.t),
                      mode: st.mode,
                      from: st.from.toArray().map(r3),
                      point: st.pose.point.toArray().map(r3),
                      head: st.pose.head.toArray().map(r3),
                      eye: st.pose.eye.toArray().map(r3),
                      plan: st.plan?.by ?? null,
                      part: st.part ?? null,
                      side: st.pose.side ?? 0,
                      afar: Boolean(st.afar),
                      prelude: Boolean(st.prelude),
                  }
                : null,
            rising: Boolean(P.rising),
            risingBy: P.rising ? P.rising.plan?.by ?? "none" : null,
            opacity: P.avatar.opacity ?? null,
            animation: P.player.animation,
            current: P.avatar.animation.actions.current?.getClip().name,
            root: a.position.toArray().map(r3), yaw: r3((Math.atan2(2 * (a.quaternion.w * a.quaternion.y), 1 - 2 * a.quaternion.y * a.quaternion.y) * 180) / Math.PI),
            visible: a.visible,
            capsule: [c.start.x, c.start.y - c.radius, c.start.z].map(r3),
            pivot: pivot.toArray().map(r3), mode: cam.mode, camera: cam.perspectiveCamera.position.toArray().map(r3),
            prompt: !document.getElementById("action-prompt")?.hidden ? `${document.getElementById("action-key").textContent} ${document.getElementById("action-label").textContent}` : null,
            touch: !document.getElementById("touch-action")?.hidden ? `${document.getElementById("touch-action-label").textContent}/${document.getElementById("touch-action-icon").dataset.icon}` : null,
            busy: w.interactables.busy(),
        };
    }
    function view(turn = 35, pitch = 0.12, dist = null) {
        const st = P.seated;
        const facing = st ? st.seat.facing : 0;
        if (cam.scheme === "pointerLock") {
            cam.angles.horizontal = ((facing + 180 + turn) * Math.PI) / 180;
            cam.angles.vertical = pitch;
            if (dist) cam.THIRD_DISTANCE = dist;
            cam.update();
        }
        cam.perspectiveCamera.updateMatrixWorld();
    }
    async function shot(name) {
        const cv = e.renderer.renderer.domElement;
        e.renderer.render();
        if (!name) return null;
        const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.88));
        return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
    }
    async function ready() {
        await Promise.all([P.avatar.wear(e), w.seats.dress(P.avatar), w.seats.catalogue()]);
        return { worn: Boolean(P.avatar.worn), seats: w.seats.list.length };
    }
    window.__sit = { seats, before, aim, press, step, state, view, shot, byId, ready };
    return "sit ready";
})();

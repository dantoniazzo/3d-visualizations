// lights.js: the room-lights key (Q) and which room the visitor is in, driven headlessly (app-notes.md, What the visitor
// acts on: Q and which room the visitor is in). In-page, through the sink after boot.js, in an editor tab (/?scene=<id>)
// or a public view (/view/<id>):
//   await eval(await (await fetch("http://127.0.0.1:3199/lights.js?" + Date.now())).text())
// window.__lights — on a build without the chip or Q, info() says so and the rest still runs:
//   info()                    what the HUD and the player say now: the room, the readout, the chip, the touch button, the
//                             toast, the room's switches, the lights panel, in a car, from above
//   stand([x, y, z], frames)  the capsule stood there (feet), out of any seat or pool, settled, and the room readout run
//                             (P.updateRoomReadout) `frames` times
//   q({ frames, code, repeat })   Q pressed as the keyboard presses it (a keydown and keyup on document), frames
//                             stepped: what was told ("room-lights", "room", how many "switches")
//   walk(from, to, { y, maxSteps, tol })   walked from one point to another frame by frame (updateColliderMovement +
//                             updateRoomReadout): the frames where the room or the chip changed, and how many times each
//                             did — a threshold that blinks shows as many changes for one crossing
//   await night() / day()     the time of day set (World.setLighting) and its switches ready
//   whereNow()                Whereabouts' answer, the room it follows and RoomLight's where() (a public view drawn
//                             baked), against SceneBuilder.roomAt, at the feet
//   await shot(name)          a frame drawn now: its mean luminance on a 256 × 192 copy; to the sink as `name` if given
//   look(yaw, pitch)          the camera turned about the head (pointer-lock scheme)
//   step(frames)              world.update + camera.update + afterCamera at 1/60
(() => {
    if (window.__lights) return "already";
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const sb = w.sceneBuilder;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const $ = (id) => document.getElementById(id);

    function info() {
        const chip = $("room-lights");
        const touch = $("touch-room-lights");
        const said = $("room-lights-said");
        // (The base build has no P.room: the readout's id.)
        const room = P.room ?? (P.currentRoomId ? sb.spec.rooms.find((r) => r.id === P.currentRoomId) : null) ?? null;
        const items = room && w.switches?.inRoom ? w.switches.inRoom(room.id) : [];
        const c = pl.collider;
        return {
            feet: [r3(c.end.x), r3(c.start.y - c.radius), r3(c.end.z)],
            room: room?.id ?? null,
            readout: $("room-readout")?.classList.contains("visible") ? $("room-readout").textContent : "",
            chip: chip ? { shown: !chip.hidden && getComputedStyle(chip).display !== "none", label: $("room-lights-label").textContent, lit: chip.classList.contains("is-lit"), pressed: chip.getAttribute("aria-pressed") } : "none in this build",
            touch: touch ? { shown: !touch.hidden && getComputedStyle(touch).display !== "none", label: $("touch-room-lights-label").textContent, lit: touch.classList.contains("is-lit") } : null,
            said: said && !said.hidden ? said.textContent : null,
            switches: items.map((item) => ({ id: item.id, on: w.switches.isOn(item.id) })),
            panelLit: $("lights-toggle")?.classList.contains("is-lit") ?? null,
            inVehicle: P.inVehicle,
            bird: Boolean(w.birdView?.active),
        };
    }

    function step(frames = 1) {
        e.time.delta = 1 / 60;
        for (let i = 0; i < frames; i++) {
            w.update();
            e.camera.update();
            w.afterCamera?.();
        }
    }

    function stand([x, y, z], frames = 3) {
        // (Up off any seat and out of any pool, as Player.placeAt does.)
        if (P.seated) P.stand?.({ now: true });
        P.rising = null;
        P.swimmer?.reset();
        sb.settleCollision?.();
        pl.collider.start.set(x, y + 0.36, z);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
        P.actions = {};
        const remote = P.remote;
        P.remote = () => 0;
        e.time.delta = 1 / 60;
        for (let i = 0; i < 20; i++) P.updateColliderMovement();
        P.remote = remote;
        for (let i = 0; i < frames; i++) P.updateRoomReadout?.();
        return info();
    }

    function q({ frames = 2, code = "KeyQ", repeat = false } = {}) {
        const told = [];
        const keep = (name, map) => {
            const fn = (x) => told.push([name, map(x)]);
            w.on(name, fn);
            return () => w.off(name, fn);
        };
        const off = [
            keep("room-lights", (x) => ({ room: x.room?.id ?? null, on: x.on, count: x.count })),
            keep("room", (x) => x?.id ?? null),
        ];
        let changes = 0;
        const count = () => changes++;
        w.on("switches", count);
        const before = info();
        try {
            document.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.replace("Key", "").toLowerCase(), repeat, bubbles: true }));
            document.dispatchEvent(new KeyboardEvent("keyup", { code, key: code.replace("Key", "").toLowerCase(), bubbles: true }));
            step(frames);
        } finally {
            off.forEach((f) => f());
            w.off("switches", count);
        }
        return { before: { room: before.room, switches: before.switches }, told, switchesEvents: changes, after: info() };
    }

    function walk(from, to, { y = null, maxSteps = 900, tol = 0.15 } = {}) {
        stand(from, 1);
        let theta = 0;
        const remote = P.remote;
        P.remote = () => theta;
        P.actions = { forward: true };
        e.time.delta = 1 / 60;
        const frames = [];
        let rooms = 0;
        let chips = 0;
        let last = null;
        for (let s = 0; s < maxSteps; s++) {
            const c = pl.collider.start;
            const dx = to[0] - c.x;
            const dz = to[2] - c.z;
            if (Math.hypot(dx, dz) < tol && (y == null || Math.abs(c.y - 0.35 - y) < 0.4)) break;
            theta = Math.atan2(-dx, -dz);
            P.updateColliderMovement();
            P.updateRoomReadout();
            const now = info();
            const shown = typeof now.chip === "object" ? now.chip.shown : null;
            if (last) {
                if (now.room !== last.room) rooms++;
                if (shown !== last.shown) chips++;
            }
            last = { room: now.room, shown };
            frames.push([now.feet, now.room, shown]);
        }
        P.actions = {};
        P.remote = remote;
        pl.velocity.set(0, 0, 0);
        // The frames where something changed, and the first and last.
        const told = frames.filter((f, i) => i === 0 || i === frames.length - 1 || f[1] !== frames[i - 1][1] || f[2] !== frames[i - 1][2]);
        return { steps: frames.length, roomChanges: rooms, chipChanges: chips, told, at: info() };
    }

    async function setLighting(variant) {
        let done = false;
        Promise.resolve(w.setLighting(variant)).then(() => (done = true), () => (done = true));
        await window.__drive(30000, () => done);
        step(3);
        return w.lighting;
    }

    function whereNow() {
        const c = pl.collider;
        const [x, y, z] = [c.end.x, c.start.y - c.radius, c.end.z];
        return {
            feet: [r3(x), r3(y), r3(z)],
            roomAt: sb.roomAt(x, y, z)?.id ?? null,
            whereabouts: w.whereabouts ? w.whereabouts.locate(x, y, z) : "none in this build",
            followed: w.whereabouts?.room ?? null,
            roomLight: w.roomLight?.supported ? w.roomLight.where() : null,
        };
    }

    /** A frame drawn now: its mean luminance (0–255, on a 256 × 192 copy), and saved to the sink as `name` if given. */
    async function shot(name) {
        const cv = e.renderer.renderer.domElement;
        e.renderer.realism?.settle?.();
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

    /** The camera turned to a yaw and pitch (pointer-lock scheme) about the head. */
    function look(yaw, pitch = -0.1) {
        const c = e.camera;
        const head = pl.collider.end;
        if (c.scheme === "pointerLock") {
            c.angles.horizontal = yaw;
            c.angles.vertical = pitch;
            c.target.copy(head);
            c.update();
        }
        c.perspectiveCamera.updateMatrixWorld();
        return [c.scheme, c.mode];
    }

    window.__shot = shot;
    window.__look = look;
    window.__lights = { shot, look, info, step, stand, q, walk, night: () => setLighting("night"), day: () => setLighting("day"), whereNow };
    return "lights ready";
})();

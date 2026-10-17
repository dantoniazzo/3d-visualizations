// jump.js (2026-10-16): the jump-out-of-the-window check. Load through the sink once the visitor is in (an editor tab after harness.js, or a public view):
//   await eval(await (await fetch("http://127.0.0.1:3199/jump.js?" + Date.now())).text())
// window.__jump:
//   windows({ floor: 2, sill: 0.3 })   every window with a sill on a floor this high or more, from the spec: its wall,
//                                      its middle, the way in (where a floor is), its sill and head heights
//   run(win, { along, jumpEvery, seconds, running, heading, onTop, record })  stood in from it (the first of 0.7, 1.0,
//                                      1.3, 1.6, 2.0 m where the capsule stands free; onTop: on whatever is there, a
//                                      counter under the sill), walked (running: run) straight at it, Space every
//                                      `jumpEvery` s: whether the capsule got out (beyond the wall's outer face, or
//                                      fell a floor), its highest rise, the largest single-frame rise, and the frame;
//                                      record: the capsule's path too, a point a frame
//   all(opts)                          run() at every window, at `alongs` points across each (shares of its half
//                                      width, [0]): { windows, runs, noSpot, escaped, ids, worstRise, rows }
//   place(x, y, z), step()             the capsule put there; one frame of the walk as Player.update has it
// (There is no trace(): the capsule's hits of the frame that rose most are not kept. run(win, { record: true }) and
// riseAt give the frame.)
(() => {
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const sb = w.sceneBuilder;
    const spec = sb.spec;
    const V = e.camera.perspectiveCamera.position.constructor;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const R = e.camera.perspectiveCamera.constructor; // unused; keeps the shape of the other tools

    function inside(x, z, polygon) {
        let hit = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, zi] = polygon[i];
            const [xj, zj] = polygon[j];
            if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
        }
        return hit;
    }

    function windows({ floor = 2, sill = 0.3 } = {}) {
        const out = [];
        for (const wall of spec.walls || []) {
            if ((wall.base_height ?? 0) < floor) continue;
            const [ax, az] = wall.start;
            const [bx, bz] = wall.end;
            const length = Math.hypot(bx - ax, bz - az);
            const ux = (bx - ax) / length;
            const uz = (bz - az) / length;
            for (const opening of wall.openings || []) {
                if (opening.type !== "window" || (opening.sill ?? 0) < sill) continue;
                // (Clipped to the wall: a window may be laid past its end, round a corner.)
                const from = Math.max(0, opening.offset);
                const to = Math.min(length, opening.offset + opening.width);
                if (to - from < 0.5) continue;
                const mid = (from + to) / 2;
                const cx = ax + ux * mid;
                const cz = az + uz * mid;
                // The way in: the side a room of that floor is on.
                let inward = null;
                for (const s of [1, -1]) {
                    const nx = -uz * s;
                    const nz = ux * s;
                    const px = cx + nx * 0.8;
                    const pz = cz + nz * 0.8;
                    if ((spec.rooms || []).some((room) => Math.abs((room.elevation ?? 0) - wall.base_height) < 0.2 && room.polygon && inside(px, pz, room.polygon))) { inward = [nx, nz]; break; }
                }
                if (!inward) continue;
                out.push({ id: `${opening.id}`, wall: wall.id, floor: wall.base_height, centre: [cx, cz], along: [ux, uz], width: to - from, inward, thickness: wall.thickness, sill: wall.base_height + opening.sill, head: wall.base_height + opening.sill + opening.height });
            }
        }
        return out;
    }

    function place(x, y, z) {
        sb.settleCollision?.();
        pl.collider.start.set(x, y + 0.36, z);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
    }

    /** A frame of the walk as Player.update has it: the move, then the clip it picks (a jump's lighter gravity is the clip's). */
    function step() {
        P.updateColliderMovement();
        pl.animation = !pl.onFloor && pl.velocity.y > 0.5 ? "jumping" : P.isMoving() ? (P.actions.run ? "running" : "walking") : "idle";
    }

    /** Whether the capsule stands free at (x, floor, z): stood there 20 frames, it hardly moves. */
    function free(x, y, z, onTop = false) {
        place(x, y, z);
        P.actions = {};
        P.remote = () => 0;
        e.time.delta = 1 / 60;
        for (let i = 0; i < 20; i++) step();
        P.remote = null;
        const c = pl.collider.start;
        // (Pushed off a chair's leg onto the floor beside it is free enough; onto a worktop, or through the floor, is not.)
        if (onTop) return Math.hypot(c.x - x, c.z - z) < 0.5 && c.y - 0.35 > y - 0.05 && c.y - 0.35 < y + 1.2 ? [c.x, c.y - 0.35, c.z] : null;
        return Math.hypot(c.x - x, c.z - z) < 0.5 && Math.abs(c.y - 0.35 - y) < 0.1 ? [c.x, y, c.z] : null;
    }

    function run(win, { onTop = false, along = 0, jumpEvery = 0.5, seconds = 4, running = true, heading = null, record = false } = {}) {
        const [ix, iz] = win.inward;
        // From the first spot in from the window where the capsule stands free (not in a counter under it).
        let back = null;
        let spot = null;
        for (const d of [0.7, 1.0, 1.3, 1.6, 2.0]) {
            spot = free(win.centre[0] + win.along[0] * along + ix * d, win.floor, win.centre[1] + win.along[1] * along + iz * d, onTop);
            if (spot) { back = d; break; }
        }
        if (!spot) return { id: win.id, along, noSpot: true, out: false, rise: 0 };
        const [x, y, z] = spot;
        place(x, y, z);
        // Facing the window: forward is (-sin h, -cos h); the window is at -inward.
        const theta = heading ?? Math.atan2(ix, iz);
        P.remote = () => theta;
        P.actions = { forward: true, run: running };
        e.time.delta = 1 / 60;
        const frames = Math.round(seconds * 60);
        const every = Math.max(1, Math.round(jumpEvery * 60));
        let top = -Infinity;
        let rise = 0;
        let riseAt = -1;
        let out = false;
        let outAt = -1;
        const path = [];
        for (let f = 0; f < frames; f++) {
            if (f % every === 0) { P.setMovementKey("Space", false); P.setMovementKey("Space", true); }
            const y0 = pl.collider.start.y;
            step();
            const c = pl.collider.start;
            const dy = c.y - y0;
            if (dy > rise) { rise = dy; riseAt = f; }
            top = Math.max(top, c.y - 0.35 - win.floor);
            if (record) path.push([r3(c.x), r3(c.y), r3(c.z)]);
            // Beyond the wall's outer face, or a floor down.
            const across = (c.x - win.centre[0]) * -ix + (c.z - win.centre[1]) * -iz;
            if (!out && (across > win.thickness / 2 + 0.05 || c.y - 0.35 < win.floor - 1)) { out = true; outAt = f; }
        }
        P.setMovementKey("Space", false);
        P.actions = {};
        P.remote = null;
        const c = pl.collider.start;
        const res = { id: win.id, along, back, on: r3(spot[1] - win.floor), out, outAt, top: r3(top), rise: r3(rise), riseAt, end: [r3(c.x), r3(c.y - 0.35), r3(c.z)] };
        if (record) res.path = path;
        return res;
    }

    function all({ floor = 2, sill = 0.3, alongs = [0], ...opts } = {}) {
        const list = windows({ floor, sill });
        const rows = [];
        for (const win of list) for (const along of alongs) rows.push(run(win, { along: along * win.width / 2, ...opts }));
        const escaped = rows.filter((r) => r.out);
        return { windows: list.length, runs: rows.length, noSpot: rows.filter((r) => r.noSpot).length, escaped: escaped.length, ids: escaped.map((r) => `${r.id}@${r3(r.along)}`), worstRise: Math.max(...rows.map((r) => r.rise)), rows };
    }

    window.__jump = { windows, run, all, place, step };
    return "jump ready";
})();

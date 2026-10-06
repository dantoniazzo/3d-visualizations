// Paste into the walkthrough page (javascript_tool) once the space has
// loaded (`/?scene=<id>`), then use window.__walk. It drives the real
// player physics — the capsule, the static octree with the furniture in it,
// the doors — without rendering, so a whole building is walked in seconds.
//
//   __walk.doors({ match: /^[abc]-/ })  every door both ways → problems only
//   __walk.to(start, [p1, p2, …])        a route: [x, y|null, z] points, a y
//                                        to reach at that point (a floor)
//   __walk.free([x, y, z])               can the capsule stand there?
//
// A door "fails" only if the capsule can't get from a free standing spot on
// one side to one on the other. `noSpot` means no free spot within 1.3 m of
// it on that side (a door straight onto a flight's steps, a WC too small to
// stand in): look at it.
(() => {
    const e = window.experience;
    const P = e.world.player;
    const pl = P.player;
    const sb = e.world.sceneBuilder;
    const V = e.camera.perspectiveCamera.position.constructor;
    const Q = e.camera.perspectiveCamera.quaternion.constructor;
    const r2 = (v) => Math.round(v * 100) / 100;

    const place = ([x, y, z], lift) => {
        pl.collider.start.set(x, y + lift, z);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
    };

    /** Stand the capsule at p for 20 frames: free if it hardly moved. */
    function free(p) {
        place(p, 0.36);
        P.actions = {};
        P.remote = () => 0;
        e.time.delta = 1 / 60;
        for (let i = 0; i < 20; i++) P.updateColliderMovement();
        P.remote = null;
        const c = pl.collider.start;
        return Math.hypot(c.x - p[0], c.z - p[2]) < 0.04 && Math.abs(c.y - 0.35 - p[1]) < 0.3;
    }

    /** Walk from `start` through each target in turn; stuck after 150 frames without getting nearer. */
    function to(start, targets, { maxSteps = 6000, tol = 0.25 } = {}) {
        place(start, 0.4);
        let theta = 0;
        P.remote = () => theta;
        P.actions = { forward: true };
        e.time.delta = 1 / 60;
        let k = 0;
        let best = Infinity;
        let since = 0;
        let steps = 0;
        while (k < targets.length && steps < maxSteps) {
            const t = targets[k];
            const c = pl.collider.start;
            const dx = t[0] - c.x;
            const dz = t[2] - c.z;
            const d = Math.hypot(dx, dz);
            if (d < tol && (t[1] == null || Math.abs(c.y - 0.35 - t[1]) < 0.4)) {
                k++;
                best = Infinity;
                since = 0;
                continue;
            }
            // Facing (−sin θ, −cos θ) is forward.
            theta = Math.atan2(-dx, -dz);
            P.updateColliderMovement();
            steps++;
            if (d < best - 0.01) {
                best = d;
                since = 0;
            } else if (++since > 150) break;
        }
        P.actions = {};
        P.remote = null;
        pl.velocity.set(0, 0, 0);
        const c = pl.collider.start;
        return { ok: k >= targets.length, leg: k, at: [r2(c.x), r2(c.y - 0.35), r2(c.z)], steps };
    }

    /** Every door (ids matching `match`) opened, then walked both ways. */
    function doors({ match = /./ } = {}) {
        for (const d of sb.doors) {
            d.setOpen(true);
            d.open = 1;
            d.target = 1;
        }
        const problems = [];
        let count = 0;
        for (const d of sb.doors) {
            const id = d.spec?.id;
            if (!id || !match.test(id)) continue;
            count++;
            const g = d.group;
            const c = g.getWorldPosition(new V());
            const n = new V(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new Q()));
            n.y = 0;
            n.normalize();
            const along = new V(-n.z, 0, n.x);
            const at = (s, dist, off = 0) => [c.x + s * n.x * dist + along.x * off, c.y, c.z + s * n.z * dist + along.z * off];
            const pick = (s) => {
                for (const dist of [0.45, 0.6, 0.8, 1.0, 1.3]) for (const off of [0, 0.15, -0.15, 0.3, -0.3]) if (free(at(s, dist, off))) return at(s, dist, off);
                return null;
            };
            const A = pick(1);
            const B = pick(-1);
            if (!A || !B) {
                problems.push({ id, noSpot: !A ? "A" : "B", at: [r2(c.x), r2(c.y), r2(c.z)] });
                continue;
            }
            const ab = to(A, [at(1, 0.2), at(-1, 0.2), B], { maxSteps: 1500 });
            const ba = to(B, [at(-1, 0.2), at(1, 0.2), A], { maxSteps: 1500 });
            if (!ab.ok || !ba.ok) problems.push({ id, ab: ab.ok || ab, ba: ba.ok || ba });
        }
        return { doors: count, problems };
    }

    window.__walk = { free, to, doors };
    return "walk ready";
})();

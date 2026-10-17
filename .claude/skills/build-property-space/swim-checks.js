// swim-checks.js: the swimming measures of the clips passes of 2026-10-17, frame by frame (app-notes.md, Swimming and
// the pool's steps). In-page, through the sink after boot.js, act.js, pool.js, clips.js and swim-trace.js, in an editor
// tab or a public view of a site with a pool. Start points come from the first pool's box as on Ladonia's B pool (its
// steps on the z1 side, the far end z0 eight metres off): for a pool laid out otherwise, pass `start` / `from` / `at`.
//   await eval(await (await fetch("http://127.0.0.1:3199/swim-checks.js?" + Date.now())).text())
// window.__swim:
//   track(n, { each, walls, floor, wear, label, av, every, keep })   n frames: the blocked flag's flips (and those within
//              15 frames: flicker), clip changes, the clips' weights (their sum off 1, the largest change in a frame),
//              bone pops in the root's frame, root and head jumps in the world, the head against the capsule, the lowest
//              skin over the pool's floor, eyes and clothes over the water, skin past the pool's walls (stone)
//   brief(r)   a track's numbers alone
//   wall({ wall, angle, fast, start, swimFrames })   swum into a wall (x0 | x1 | z0) at `angle` deg off its normal, held,
//              let go, stopped and started at the wall, the push swept round 0 → 90 → 0 deg, swum off: per phase
//   corner({ fast })   into the x1/z0 corner at 45 deg, held, let go
//   taps({ seed, mode, frames, at })   W tapped ("tap"), strokes switched ("stroke") or both ("mixed") every few frames
//              mid-pool, turning at the ends: frame by frame (rows in window.__swimRows)
//   fullChanges()   each change of clip once, uninterrupted: tread → swim → fast → swim → tread (what taps are judged by)
//   alone()    each clip steady by itself (treading, swimming, breaststroke): its own bones' moves in a frame
//   turn({ frames, fast, sign })   swimming on while the view turns 90 deg in `frames`, straight before and after
//   climb({ side, from, yawOff, swimIn, fast, rest, onOffer, cope })   Space at the edge (x1 or z0): to the edge, the
//              reach, the clip, standing up — per phase the clips, head and root speeds and jumps, skin in the stone
//              (the coping `cope` m wide), the soles against what is under them standing, the eyes reaching, the hands
//              over the coping; the frames after. It starts afloat 1 m off the edge: with neither `swimIn` (frames swum
//              in first, then `rest`) nor `onOffer` (swum in, Space the first frame the climb is offered) Space is
//              pressed there, nothing is offered and the phases are all "out"
//   rayDown(origin)   the height of what is under a point ([x, y, z] or a Vector3; the collision trees, 1.2 m down at
//              most), or null
//   weights(av), lowest(av), bone(name)
(() => {
    if (window.__swim) return "already";
    const e = window.experience, w = e.world, cam = e.camera;
    const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(3));
    const P = () => w.player;
    const step = (n = 1) => { for (let i = 0; i < n; i++) { e.time.delta = 1 / 60; w.update(); cam.update(); w.afterCamera?.(); } };
    const V3 = () => new (P().player.collider.end.constructor)();
    const bone = (n, out = V3(), av = P().avatar) => { const b = av.avatar.getObjectByName(av.rig.boneNames.get(n)); return b ? b.getWorldPosition(out) : null; };
    const pool = () => P().swimmer.pools[0];
    const steps = () => P().swimmer.stepsOf.get(pool());
    // The pool's box and water level, for the start points (laid out as on Ladonia's B pool: its steps on the z1 side).
    const B = () => { const p = pool(), [x0, z0, x1, z1] = p.box; return { x0, z0, x1, z1, cx: (x0 + x1) / 2, L: p.level, y: p.level - 0.14 }; };
    const deg = (rad) => (rad * 180) / Math.PI;
    const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const heading = (dx, dz) => Math.atan2(-dx, -dz);
    const BONES = ["Hips", "Spine2", "Head", "LeftHand", "RightHand", "LeftForeArm", "RightForeArm", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"];
    function names(av = P().avatar) { const a = av.animation.actions, m = new Map(); for (const k in a) if (k !== "current") m.set(a[k], k); return m; }
    function weights(av = P().avatar) { const m = names(av), out = {}; for (const [act, wt] of av.animation.weights) out[m.get(act) ?? "?"] = wt; return out; }
    function skin(av, fn, every = 3) {
        av.avatar.updateMatrixWorld(true);
        const v = V3();
        av.avatar.traverse((m) => {
            if (!m.isSkinnedMesh || !m.visible) return;
            const n = m.geometry.attributes.position.count;
            for (let j = 0; j < n; j += every) { m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld); fn(v, m.name); }
        });
    }
    function lowest(av = P().avatar) { let all = 9, shoes = 9, part = null; skin(av, (v, name) => { if (v.y < all) { all = v.y; part = name; } if (/Footwear/.test(name) && v.y < shoes) shoes = v.y; }, 2); return { all, shoes, part }; }
    function pastWalls(av = P().avatar) {
        const pl = pool(), [x0, z0, x1, z1] = pl.box, top = steps().top;
        let stone = -9, sp = null;
        skin(av, (v, name) => { if (v.y >= top) return; const d = Math.max(x0 - v.x, v.x - x1, z0 - v.z, v.z - z1); if (d > stone) { stone = d; sp = name; } }, 3);
        return { stone, sp };
    }
    function bonesInRoot(av = P().avatar) {
        const root = av.avatar.position, inv = av.avatar.quaternion.clone().invert(), out = {};
        for (const b of BONES) { const p = bone(b, V3(), av); if (p) out[b] = p.sub(root).applyQuaternion(inv); }
        return out;
    }
    // ---- the frame tracker --------------------------------------------------------------------------------------
    function track(n, { each = null, walls = true, floor = true, wear = true, label = "", av = null, every = 2, keep = false } = {}) {
        const p = P(), A = av ?? p.avatar, pl = pool(), FLOOR = pl.level - pl.depth;
        const r = { label, n, flips: 0, flicker: 0, clipChanges: 0, clipFlicker: 0, clips: [], blockedFrames: 0, wsum: 0, dW: [0], pop: [0], rootDy: [0], rootJump: [0], headJump: [0], headCapD: [0], headCap: [0], low: [9], lowShoes: [9], eyes: [9, -9], body: [-9], stone: [-9], notAfloat: 0 };
        let pb = null, pr = null, ph = null, pw = null, phc = null, lastFlip = -99, lastClip = -99, blocked = p.swimmer.blocked, clip = av ? null : p.player.animation;
        for (let i = 0; i < n; i++) {
            if (each) each(i);
            step(1);
            A.avatar.updateMatrixWorld(true);
            const c = av ? A.animation.actions.current : p.player.animation;
            if (!av && p.swimmer.blocked !== blocked) { r.flips++; if (i - lastFlip < 15) r.flicker++; lastFlip = i; blocked = p.swimmer.blocked; }
            if (c !== clip) { r.clipChanges++; if (i - lastClip < 15) r.clipFlicker++; lastClip = i; clip = c; const nm = av ? names(A).get(c) : c; if (r.clips[r.clips.length - 1] !== nm) r.clips.push(nm); }
            if (!av && p.swimmer.blocked) r.blockedFrames++;
            if (!av && !p.swimmer.afloat) r.notAfloat++;
            const W = weights(A); let s = 0; for (const k in W) s += W[k];
            r.wsum = Math.max(r.wsum, Math.abs(s - 1));
            if (pw) for (const k of new Set([...Object.keys(W), ...Object.keys(pw)])) { const d = Math.abs((W[k] ?? 0) - (pw[k] ?? 0)); if (d > r.dW[0]) r.dW = [r3(d), k, i]; }
            pw = W;
            const bs = bonesInRoot(A);
            let fp = 0, fb = null;
            if (pb) for (const b in bs) { if (!pb[b]) continue; const d = bs[b].distanceTo(pb[b]); if (d > fp) { fp = d; fb = b; } if (d > r.pop[0]) r.pop = [r3(d), b, i, av ? names(A).get(c) : c]; }
            pb = bs;
            if (keep) { (r.rows ??= []).push([i, av ? names(A).get(c) : c, r3(fp), fb, Object.entries(W).map(([k, v]) => k.slice(0, 5) + ":" + v.toFixed(2)).join(" "), r3(A.avatar.quaternion.angleTo(A.avatar.quaternion.clone().set(0, A.avatar.quaternion.y, 0, A.avatar.quaternion.w).normalize()) * 57.3)]); }
            const root = A.avatar.position.clone(), head = bone("Head", V3(), A);
            if (pr) { const dy = Math.abs(root.y - pr.y); if (dy > r.rootDy[0]) r.rootDy = [r3(dy), i]; const d = root.distanceTo(pr); if (d > r.rootJump[0]) r.rootJump = [r3(d), i]; }
            if (ph) { const d = head.distanceTo(ph); if (d > r.headJump[0]) r.headJump = [r3(d), i, av ? names(A).get(c) : c]; }
            if (!av) {
                const ce = p.player.collider.end;
                const hc = Math.hypot(head.x - ce.x, head.z - ce.z);
                if (hc > r.headCap[0]) r.headCap = [r3(hc), i];
                const hv = V3().set(head.x - ce.x, 0, head.z - ce.z);
                if (phc) { const d = hv.distanceTo(phc); if (d > r.headCapD[0]) r.headCapD = [r3(d), i]; }
                phc = hv;
            }
            pr = root; ph = head;
            const afloat = av ? true : Boolean(p.swimmer.afloat);
            if (i % every === 0 && afloat) {
                if (floor) { const lo = lowest(A); if (lo.all - FLOOR < r.low[0]) r.low = [r3(lo.all - FLOOR), lo.part, i, av ? names(A).get(c) : c]; if (lo.shoes - FLOOR < r.lowShoes[0]) r.lowShoes = [r3(lo.shoes - FLOOR), i]; }
                if (wear) { const f = __trace.wear(A, root.constructor, pl.level); if (f.eyes !== null) { r.eyes = [Math.min(r.eyes[0], r3(f.eyes)), Math.max(r.eyes[1], r3(f.eyes))]; } if (f.body > r.body[0]) r.body = [r3(f.body), i]; }
                if (walls) { const s2 = pastWalls(A); if (s2.stone > r.stone[0]) r.stone = [r3(s2.stone), s2.sp, i]; }
            }
        }
        r.wsum = r3(r.wsum);
        r.clips = r.clips.join(">");
        return r;
    }
    const brief = (r) => ({ label: r.label, clips: r.clips, flips: r.flips, flicker: r.flicker, clipChanges: r.clipChanges, clipFlicker: r.clipFlicker, blk: r.blockedFrames, pop: r.pop, rootDy: r.rootDy, rootJump: r.rootJump, headJump: r.headJump, headCap: r.headCap, headCapD: r.headCapD, dW: r.dW, wsum: r.wsum, low: r.low, lowShoes: r.lowShoes, eyes: r.eyes, body: r.body, stone: r.stone, notAfloat: r.notAfloat });
    // ---- walls ---------------------------------------------------------------------------------------------------
    function wall({ wall = "z0", angle = 0, fast = false, start = null, swimFrames = 320 } = {}) {
        const p = P(), [x0, z0, x1, z1] = pool().box;
        const out = { x0: [-1, 0], x1: [1, 0], z0: [0, -1], z1: [0, 1] }[wall];
        const a = (angle * Math.PI) / 180;
        const dx = out[0] * Math.cos(a) - out[1] * Math.sin(a), dz = out[1] * Math.cos(a) + out[0] * Math.sin(a);
        // Starts afloat, the way in staying inside the pool, and the slide along the wall (at 45-60 deg) away from the steps.
        const steep = Math.abs(angle) >= 45;
        const b = B();
        const zs = dz > 0.05 ? (steep ? b.z0 + 0.4 : b.z0 + 1.3) : dz < -0.05 ? (steep ? b.z0 + 5.7 : b.z0 + 5.0) : b.z0 + 3.0;
        const zx = Math.abs(dx) < 0.05 ? b.z0 + 3.8 : b.z0 + Math.min(3.8, Math.max(1.2, 1.9 / Math.abs(Math.tan(a))));
        const at = start ?? { z0: [dx > 0.05 ? b.cx - 0.9 : dx < -0.05 ? b.cx + 0.9 : b.cx, zx], x1: [b.x1 - 2.1, zs], x0: [b.x0 + 2.1, zs] }[wall];
        p.teleport({ position: [at[0], b.y, at[1]], yaw: deg(Math.atan2(dx, dz)) }); p.actions = {}; step(140);
        const h = heading(dx, dz);
        cam.angles.horizontal = h; cam.angles.vertical = 0.2;
        const run = fast ? { forward: true, run: true } : { forward: true };
        const ph = [];
        p.actions = { ...run }; ph.push(track(swimFrames, { label: "swim in + come to rest" }));
        p.actions = { ...run }; ph.push(track(90, { label: "held into it" }));
        p.actions = {}; ph.push(track(60, { label: "let go" }));
        ph.push(track(160, { label: "stop-start at the wall (10/10..)", each: (i) => { p.actions = Math.floor(i / [10, 10, 6, 6, 4, 4, 15, 15, 20, 20, 25, 25][Math.min(11, Math.floor(i / 13))]) % 2 === 0 ? { ...run } : {}; } }));
        // The push swept round from straight in to along the wall and back, held all the while.
        p.actions = { ...run };
        ph.push(track(120, { label: "push swept 0->90->0 deg", each: (i) => { const k = i < 60 ? i / 60 : (120 - i) / 60; cam.angles.horizontal = h + (k * Math.PI) / 2; } }));
        p.actions = { ...run }; ph.push(track(60, { label: "swim off (away)", each: (i) => { if (i === 0) cam.angles.horizontal = h + Math.PI; } }));
        p.actions = {};
        const sum = { flips: 0, flicker: 0, clipFlicker: 0, pop: 0, rootDy: 0, headJump: 0, stone: -9, startAfloat: ph[0].notAfloat === 0, outOfWater: ph.slice(0, 5).reduce((n, r) => n + r.notAfloat, 0) };
        for (const r of ph) { sum.flips += r.flips; sum.flicker += r.flicker; if (!/stop-start/.test(r.label)) sum.clipFlicker += r.clipFlicker; sum.pop = Math.max(sum.pop, r.pop[0]); sum.rootDy = Math.max(sum.rootDy, r.rootDy[0]); sum.headJump = Math.max(sum.headJump, r.headJump[0]); sum.stone = Math.max(sum.stone, r.stone[0]); }
        return { wall, angle, fast, sum, phases: ph.map(brief) };
    }
    function corner({ fast = false } = {}) {
        const p = P();
        const bx = B();
        p.teleport({ position: [bx.x1 - 1.8, bx.y, bx.z0 + 1.8], yaw: 135 }); p.actions = {}; step(140);
        cam.angles.horizontal = heading(Math.SQRT1_2, -Math.SQRT1_2); cam.angles.vertical = 0.2;
        p.actions = fast ? { forward: true, run: true } : { forward: true };
        const a = track(300, { label: "into the x1/z0 corner, held" });
        p.actions = {}; const b = track(60, { label: "let go" });
        return [brief(a), brief(b)];
    }
    // ---- taps and switches ----------------------------------------------------------------------------------------
    function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
    function taps({ seed = 1, mode = "tap", frames = 360, at = null } = {}) {
        const p = P(), b = B();
        at ??= [b.cx, b.z0 + 4.8];
        p.teleport({ position: [at[0], b.y, at[1]], yaw: 180 }); p.actions = {}; step(150);
        cam.angles.horizontal = 0; cam.angles.vertical = 0.2;
        const R = rng(seed);
        let left = 0, on = false, fast = false, dir = -1;
        const each = () => {
            const z = p.player.collider.end.z;
            if (dir < 0 && z < b.z0 + 1.8) { dir = 1; cam.angles.horizontal = Math.PI; }
            else if (dir > 0 && z > b.z0 + 5.4) { dir = -1; cam.angles.horizontal = 0; }
            if (left-- > 0) return;
            if (mode === "tap") { on = !on; left = on ? 4 + Math.floor(R() * 8) : 3 + Math.floor(R() * 4); p.actions = on ? { forward: true } : {}; }
            else if (mode === "stroke") { fast = !fast; left = 3 + Math.floor(R() * 10); p.actions = { forward: true, run: fast }; }
            else { const k = Math.floor(R() * 3); left = 2 + Math.floor(R() * 9); p.actions = k === 0 ? {} : k === 1 ? { forward: true } : { forward: true, run: true }; }
        };
        const r = track(frames, { label: `${mode} seed ${seed}`, each, walls: false, keep: true });
        p.actions = {};
        window.__swimRows = r.rows;
        return brief(r);
    }
    // The same measures on a single, uninterrupted change: the fade's own rate, to judge the taps by.
    function fullChanges() {
        const p = P(), b = B();
        p.teleport({ position: [b.cx, b.y, b.z0 + 4.8], yaw: 180 }); p.actions = {}; step(150);
        cam.angles.horizontal = 0; cam.angles.vertical = 0.2;
        const out = [];
        p.actions = { forward: true }; out.push(brief(track(60, { label: "tread -> swim", walls: false })));
        p.actions = { forward: true, run: true }; out.push(brief(track(50, { label: "swim -> fast", walls: false })));
        p.actions = { forward: true }; out.push(brief(track(50, { label: "fast -> swim", walls: false })));
        p.actions = {}; out.push(brief(track(60, { label: "swim -> tread", walls: false })));
        return out;
    }
    // Steady, each clip alone: how far its bones go in a frame of its own (what a change is judged against).
    function alone() {
        const p = P(), out = [], b = B();
        for (const [label, actions] of [["treading", {}], ["swimming", { forward: true }], ["breaststroke", { forward: true, run: true }]]) {
            p.teleport({ position: [b.cx, b.y, b.z0 + 5.0], yaw: 180 }); p.actions = {}; step(150);
            cam.angles.horizontal = 0; cam.angles.vertical = 0.2;
            p.actions = { ...actions }; step(40);
            let dir = -1;
            out.push(brief(track(120, { label, walls: false, each: () => { const z = p.player.collider.end.z; if (dir < 0 && z < b.z0 + 1.8) { dir = 1; cam.angles.horizontal = Math.PI; } else if (dir > 0 && z > b.z0 + 5.4) { dir = -1; cam.angles.horizontal = 0; } } })));
        }
        p.actions = {};
        return out;
    }
    // ---- turning --------------------------------------------------------------------------------------------------
    function turn({ frames = 30, fast = false, sign = 1 } = {}) {
        const p = P(), b = B();
        p.teleport({ position: [b.cx - 0.4, b.y, b.z0 + 5.0], yaw: 180 }); p.actions = {}; step(150);
        cam.angles.horizontal = 0; cam.angles.vertical = 0.2;
        p.actions = fast ? { forward: true, run: true } : { forward: true };
        const straight = track(60, { label: "straight", walls: false, floor: false, wear: false });
        const h0 = cam.angles.horizontal;
        const t = track(frames, { label: `turn 90 in ${frames}`, walls: false, floor: false, wear: false, each: (i) => { cam.angles.horizontal = h0 + (sign * (Math.PI / 2) * (i + 1)) / frames; } });
        const after = track(50, { label: "straight after", walls: false, floor: false, wear: false });
        p.actions = {};
        return [brief(straight), brief(t), brief(after)];
    }
    // ---- climbing out ---------------------------------------------------------------------------------------------
    function climb({ side = "x1", from = null, yawOff = 0, swimIn = 0, fast = false, rest = 30, onOffer = false, cope = 0.28 } = {}) {
        const p = P(), [x0, z0, x1, z1] = pool().box, top = steps().top, bx = B();
        const COPE = cope;
        const S = { x1: { at: [bx.x1 - 1.0, bx.z0 + 2.9], out: [1, 0], face: x1 }, z0: { at: [bx.cx, bx.z0 + 1.2], out: [0, -1], face: z0 } }[side];
        const st = from ?? S.at;
        p.teleport({ position: [st[0], bx.y, st[1]], yaw: deg(Math.atan2(S.out[0], S.out[1]) + yawOff) }); p.actions = {}; step(150);
        cam.angles.horizontal = heading(S.out[0], S.out[1]) - yawOff; cam.angles.vertical = 0.2; step(3);
        // Swum in first (into the wall, as a visitor would), then let go for `rest` frames.
        if (swimIn) { p.actions = fast ? { forward: true, run: true } : { forward: true }; step(swimIn); p.actions = {}; step(rest); }
        // ...or swum in and Space pressed the first frame the climb is offered, the keys let go then.
        let offeredAfter = null;
        if (onOffer) { p.actions = fast ? { forward: true, run: true } : { forward: true }; for (let k = 0; k < 400 && !p.swimmer.offer(); k++) { step(1); offeredAfter = k; } p.actions = {}; }
        const prompt = window.__pool?.said?.prompt ?? null;
        const n0 = window.__pool?.said?.interact?.length ?? 0;
        const beyond = (v) => S.out[0] ? (v.x - S.face) * S.out[0] : (v.z - S.face) * S.out[1];
        const startGap = S.face - (S.out[0] ? p.player.collider.end.x * S.out[0] : p.player.collider.end.z * S.out[1]) * 1;
        p.setMovementKey("Space", true); step(1); p.setMovementKey("Space", false);
        const sw = p.swimmer;
        const phase = () => sw.toEdge ? "toEdge" : sw.climb ? (sw.climb.plan ? (sw.climb.reached < 1 ? "reach" : sw.climb.standing !== null ? "stand" : "clip") : "lift") : "out";
        const r = { side, offeredAfter, blockedAtSpace: p.swimmer.blocked, gapAtSpace: r3(S.out[0] ? S.face - p.player.collider.end.x : p.player.collider.end.z - S.face), prompt, planned: Boolean(sw.toEdge?.plan || sw.climb?.plan), phases: {}, clipsByPhase: {}, headSpeed: {}, rootSpeed: {}, headJump: {}, stone: {}, sole: [9], soleAt: null, endJumps: [], frames: 0, eyesReach: [9], handsOver: [] };
        let prevRoot = p.avatar.avatar.position.clone(), prevHead = bone("Head"), lastPh = phase();
        const firstHead = prevHead.clone();
        let endAt = null;
        for (let i = 1; i < 420; i++) {
            const phNow = phase();
            step(1);
            const ph = phase() === "out" ? phNow : phase();
            r.frames = i;
            r.phases[ph] = (r.phases[ph] ?? 0) + 1;
            const c = p.player.animation;
            (r.clipsByPhase[ph] ??= new Set()).add(c);
            const root = p.avatar.avatar.position.clone(), head = bone("Head");
            const hs = head.distanceTo(prevHead) * 60, rs = root.distanceTo(prevRoot) * 60;
            if (hs > (r.headSpeed[ph]?.[0] ?? 0)) r.headSpeed[ph] = [r3(hs), i];
            if (rs > (r.rootSpeed[ph]?.[0] ?? 0)) r.rootSpeed[ph] = [r3(rs), i];
            const hj = head.distanceTo(prevHead); if (hj > (r.headJump[ph]?.[0] ?? 0)) r.headJump[ph] = [r3(hj), i];
            prevRoot = root; prevHead = head;
            if (ph === "reach" || ph === "toEdge") { const f = __trace.wear(p.avatar, root.constructor, pool().level); if (f.eyes !== null && f.eyes < r.eyesReach[0]) r.eyesReach = [r3(f.eyes), i, ph]; }
            if (ph === "reach") { for (const n of ["LeftHandMiddle1", "RightHandMiddle1", "LeftHand", "RightHand"]) { const b = bone(n); if (b && beyond(b) > 0) r.handsOver.push(r3(b.y - top)); } }
            if (ph === "clip" || ph === "stand" || ph === "reach") {
                const solid = (v) => { const b = beyond(v); if (b <= 0) return 0; if (b < COPE) return v.y < top ? Math.min(b, top - v.y) : 0; return v.y < 0.01 ? 0.01 - v.y : 0; };
                let s = 0, part = null; skin(p.avatar, (v, name) => { const d = solid(v); if (d > s) { s = d; part = name; } }, 3);
                if (s > (r.stone[ph]?.[0] ?? -1)) r.stone[ph] = [r3(s), part, i];
            }
            if (ph === "stand") {
                // The lowest sole against what is under it (a ray straight down at that point).
                let lo = 9, at = null; skin(p.avatar, (v, name) => { if (/Footwear/.test(name) && v.y < lo) { lo = v.y; at = v.clone(); } }, 2);
                const o = V3().set(at.x, top + 0.6, at.z);
                const hit = rayDown(o);
                const under = hit ?? null;
                const d = under === null ? null : lo - under;
                if (d !== null && d < r.sole[0]) r.sole = [r3(d), i, r3(under)];
            }
            if (lastPh !== "out" && phase() === "out") endAt = i;
            lastPh = phase();
            if (endAt) break;
        }
        // The frames after: walking as the capsule has it.
        let pr = p.avatar.avatar.position.clone(), phd = bone("Head");
        for (let k = 0; k < 8; k++) { step(1); const root = p.avatar.avatar.position.clone(), head = bone("Head"); r.endJumps.push([r3(root.distanceTo(pr)), r3(head.distanceTo(phd))]); pr = root; phd = head; }
        for (const k in r.clipsByPhase) r.clipsByPhase[k] = [...r.clipsByPhase[k]].join(",");
        const ho = r.handsOver.sort((a, b) => a - b); r.handsOver = ho.length ? { n: ho.length, min: ho[0], median: ho[Math.floor(ho.length / 2)] } : null;
        const b = p.player.collider.start;
        r.end = { feet: [r3(b.x), r3(b.y - p.player.collider.radius), r3(b.z)], said: (window.__pool?.said?.interact ?? []).slice(n0), clip: p.player.animation };
        r.headTravelToClip = r3(Math.hypot(firstHead.x - (p.avatar.avatar.position.x), firstHead.z - p.avatar.avatar.position.z));
        return r;
    }
    // A THREE.Ray, by the constructor of one the page already has (window.__RayCtor, set below from a Raycaster's ray).
    function rayDown(origin) {
        const Ray = window.__RayCtor;
        if (!Ray) return null;
        // (A Vector3 or [x, y, z].)
        const o = Array.isArray(origin) ? V3().set(...origin) : origin;
        const ray = new Ray(o.clone(), V3().set(0, -1, 0));
        const hit = w.collision.rayIntersect(ray, { far: 1.2 });
        return hit && hit.distance <= 1.2 ? o.y - hit.distance : null;
    }
    // A THREE.Ray's constructor, from a Raycaster the page already has (rayDown needs one).
    if (!window.__RayCtor) {
        const ray = P().player.raycaster?.ray;
        if (ray?.origin && ray.direction) window.__RayCtor = ray.constructor;
    }
    window.__swim = { step, track, brief, wall, corner, taps, fullChanges, alone, turn, climb, rayDown, weights, lowest, bone };
    return `swim-checks ready (${P().swimmer?.pools?.length ?? 0} pool(s))`;
})();

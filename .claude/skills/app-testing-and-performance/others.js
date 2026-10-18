// others.js: what other visitors see of the visitor — its figure as a remote one, played by Player.updateOtherPlayers
// from what the server relays (position, quaternion, animation, avatarSkin; nothing else)
// (../visitor-interactions/swimming.md, Others; ../visitor-interactions/sitting-and-tv.md, Others). In-page, through
// the sink after boot.js, act.js, sit.js, pool.js and swim-trace.js (and seat-sweep.js for its starts), in an editor
// tab or a public view of a site with a pool:
//   await eval(await (await fetch("http://127.0.0.1:3199/others.js?" + Date.now())).text())
// window.__others:
//   await mirror({ scenario, hz, gap, skin, seed, frames, seat, aside, warm, trace })   a figure made in this page with the
//            visitor's skin (or `skin`) and fed the visitor's own root, turn and clip after each of its frames — every frame
//            (hz null), at `hz` messages a second of the page's clock, or with gaps (`gap: [every, long]`: no message for
//            `long` frames every `every`, as messages that come bunched) — `aside` m to the side; played as anyone is.
//            Measured against the sender as it was when the message it plays was sent (same skin: same pose):
//            apart — the worst bone apart in the root's frame (and per clip); dW — the clips' weights apart; eyes (and
//            frames under) against the water, the sender's own; pop — the largest bone move in a frame of the remote
//            (the sender's too); still — frames a bone did not move at all (a remote frozen, then jumping).
//            scenario: "stroke" (strokes switched every 3–6 frames, mid-pool), "mixed" (tread / swim / fast at random),
//            "climb" (swum to the x1 wall, Space), "sit" (sat on `seat` from its sweep start, held, then up)
//   await send({ seconds, mode, seed, flick, warm, aside })   in one of two real pages on the same test server: the visitor
//            swims as in mirror's stroke or mixed and the page emits what it emits (position, quaternion, animation,
//            avatarSkin: Player.updatePlayerSocket) at 50 a second in real time; each frame's row [t, x, y, z, eyes, clip]
//            with the exact root sent, in window.__othersSent → { frames, emits, id (this page's socket id), eyesMin, under }
//   await recv({ seconds, from, stand })   in the other page, at the same time: each frame the remote `from` (the sender's
//            socket id) is seen swimming, [t, x, y, z, eyes, clip, pose move, fresh (a new position), messages so far] in
//            window.__othersRecv → { frames, seen, still, newMsgFrames, eyes, under, move, anims, msgs }
//   Post both rows to the sink (__others.save("send.json", __othersSent) / save("recv.json", __othersRecv)) and match
//   them with `python3 <repo>/.claude/skills/app-testing-and-performance/net.py send.json recv.json`. A hidden
//   receiving tab gets about 15 messages a second, bunched, and stalls for 0.3–2.7 s: say so with any figure from one.
//   await save(name, data)   to the sink
// Start points are taken from the first pool's box as on Ladonia's B pool (steps on its z1 side).
(() => {
    if (window.__others) return "already";
    const e = window.experience;
    const w = e.world;
    const cam = e.camera;
    const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(3));
    const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(4));
    const P = () => w.player;
    const real = window.__realFetch ?? window.fetch.bind(window);
    const save = (name, data) => real("http://127.0.0.1:3199/" + name, { method: "POST", body: JSON.stringify(data) });
    const step = (n = 1) => {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            cam.update();
            w.afterCamera?.();
        }
    };
    const V3 = () => new (P().player.collider.end.constructor)();
    const BONES = ["Hips", "Spine2", "Head", "LeftHand", "RightHand", "LeftForeArm", "RightForeArm", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"];
    const node = (n, av) => av.avatar.getObjectByName(av.rig.boneNames.get(n));
    function inRoot(av) {
        av.avatar.updateMatrixWorld(true);
        const root = av.avatar.position;
        const inv = av.avatar.quaternion.clone().invert();
        const out = {};
        for (const b of BONES) {
            const n = node(b, av);
            if (n) out[b] = n.getWorldPosition(V3()).sub(root).applyQuaternion(inv);
        }
        return out;
    }
    function names(av) {
        const a = av.animation.actions;
        const m = new Map();
        for (const k in a) if (k !== "current") m.set(a[k], k);
        return m;
    }
    function weights(av) {
        const m = names(av);
        const out = {};
        for (const [act, wt] of av.animation.weights) out[m.get(act) ?? "?"] = wt;
        return out;
    }
    const pool = () => P().swimmer.pools[0];
    const B = () => {
        const p = pool();
        const [x0, z0, x1, z1] = p.box;
        return { x0, z0, x1, z1, cx: (x0 + x1) / 2, y: p.level - 0.14 };
    };
    const eyesOf = (av) => {
        if (!pool() || !window.__trace) return null;
        av.avatar.updateMatrixWorld(true);
        return window.__trace.wear(av, V3().constructor, pool().level).eyes;
    };
    function rng(seed) {
        let s = seed >>> 0;
        return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    }
    /** The sender swimming up and down the middle of the pool, its keys changed every `flick` frames. */
    function swimmer(mode, seed, flick = [3, 6]) {
        const p = P();
        const b = B();
        p.teleport({ position: [b.cx - 0.6, b.y, b.z0 + 4.8], yaw: 180 });
        p.actions = {};
        step(150);
        cam.angles.horizontal = 0;
        cam.angles.vertical = 0.2;
        const R = rng(seed);
        let left = 0;
        let fast = false;
        let on = false;
        let dir = -1;
        return () => {
            const z = p.player.collider.end.z;
            if (dir < 0 && z < b.z0 + 1.8) {
                dir = 1;
                cam.angles.horizontal = Math.PI;
            } else if (dir > 0 && z > b.z0 + 5.4) {
                dir = -1;
                cam.angles.horizontal = 0;
            }
            if (left-- > 0) return;
            left = flick[0] + Math.floor(R() * (flick[1] - flick[0] + 1));
            if (mode === "stroke") {
                fast = !fast;
                p.actions = { forward: true, run: fast };
            } else if (mode === "tap") {
                on = !on;
                p.actions = on ? { forward: true } : {};
            } else {
                const k = Math.floor(R() * 3);
                p.actions = k === 0 ? {} : k === 1 ? { forward: true } : { forward: true, run: true };
            }
        };
    }
    async function mirror({ scenario = "stroke", hz = null, gap = null, skin = null, seed = 3, frames = 360, seat = null, aside = [0.9, 0], trace = false, warm = 60 } = {}) {
        const p = P();
        const sw = p.swimmer;
        const Avatar = p.avatar.constructor;
        const skinName = skin ?? p.player.avatarSkin;
        if (w.birdView?.active) {
            w.toggleBirdView();
            step(5);
        }
        const model = new Avatar(e.resources.items[skinName], e.scene, "Mirror", "mirror-others");
        await model.wear(e);
        await w.seats?.dress(model);
        const entry = { id: "mirror-others", name: "Mirror", avatarSkin: skinName, model, animation: "idle", position: null, quaternion: null };
        p.otherPlayers["mirror-others"] = entry;
        const r = { scenario, hz, gap, skin: skinName, frames: 0, msgs: 0, apart: [0], apartBy: {}, eyes: [9], eyesUnder: 0, senderEyes: [9], dW: [0], clips: new Set(), meanApart: 0, trace: [], pop: [0], senderPop: [0], still: 0 };
        let sumApart = 0;
        let n = 0;
        let prevBones = null;
        let prevSender = null;
        try {
            let tick = () => {};
            let done = () => false;
            if (scenario === "stroke" || scenario === "mixed" || scenario === "tap") {
                tick = swimmer(scenario, seed);
            } else if (scenario === "climb") {
                const b = B();
                p.teleport({ position: [b.cx, b.y, b.z0 + 2.9], yaw: 90 });
                p.actions = {};
                step(150);
                cam.angles.horizontal = Math.atan2(-1, 0);
                cam.angles.vertical = 0.2;
                step(3);
                p.actions = { forward: true };
                for (let k = 0; k < 400 && !sw.blocked; k++) step(1);
                step(20);
                if (!sw.offer()) return { ...r, error: "the climb was not offered at the wall" };
                let last = null;
                let outAt = null;
                tick = (i) => {
                    if (i === 0) p.setMovementKey("Space", true);
                    if (i === 1) {
                        p.setMovementKey("Space", false);
                        p.actions = {};
                    }
                    if (outAt === null && !sw.climb && !sw.afloat && i > 2) outAt = i;
                    last = i;
                };
                done = () => outAt !== null && last - outAt > 40;
            } else if (scenario === "sit") {
                const s = w.seats.list.find((q) => q.id === seat);
                if (!s) return { ...r, error: `no seat ${seat}` };
                await Promise.all([p.avatar.wear(e), w.seats.dress(p.avatar), w.seats.catalogue()]);
                const st = window.__seats?.starts?.[seat] ?? window.__seats?.startFor(s);
                if (st) window.__act.stand([st[0], s.floor, st[1]]);
                else window.__sit.before(seat);
                step(30);
                let phase = 0;
                let until = 0;
                tick = (i) => {
                    if (i === 0) {
                        p.sit(s);
                        phase = 1;
                        r.plan = p.seated?.plan?.by ?? null;
                    }
                    if (phase === 1 && p.seated && p.seated.t >= 1) {
                        phase = 2;
                        until = i + 40;
                    }
                    if (phase === 2 && i >= until) {
                        p.getUp();
                        phase = 3;
                    }
                    if (phase === 3 && !p.rising && !p.seated) {
                        phase = 4;
                        until = i + 40;
                    }
                };
                done = () => phase === 4 && r.frames >= until;
            } else return { ...r, error: `scenario ${scenario}: stroke | mixed | tap | climb | sit` };
            const sent = [];
            let nextAt = 0;
            let clock = 0;
            // (Fed for a while first, as a remote seen for some time is.)
            for (let i = 0; i < warm; i++) {
                step(1);
                const a = p.avatar.avatar;
                entry.position = { x: a.position.x + aside[0], y: a.position.y, z: a.position.z + aside[1] };
                entry.quaternion = { x: a.quaternion.x, y: a.quaternion.y, z: a.quaternion.z, w: a.quaternion.w };
                entry.animation = p.player.animation;
            }
            for (let i = 0; i < frames; i++) {
                tick(i);
                step(1);
                clock += 1 / 60;
                r.frames = i + 1;
                // (The remote has just played the message sent after the frame before: against the sender then.)
                if (entry.position && sent.length) {
                    const ref = sent[sent.length - 1];
                    const bs = inRoot(model);
                    if (prevBones) {
                        for (const b in bs) {
                            if (!prevBones[b]) continue;
                            const d = bs[b].distanceTo(prevBones[b]);
                            if (d > r.pop[0]) r.pop = [r3(d), b, i, entry.animation];
                            if (d < 1e-6 && b === "Hips") r.still++;
                        }
                    }
                    prevBones = bs;
                    const sb = inRoot(p.avatar);
                    if (prevSender) {
                        for (const b in sb) {
                            if (!prevSender[b]) continue;
                            const d = sb[b].distanceTo(prevSender[b]);
                            if (d > r.senderPop[0]) r.senderPop = [r3(d), b, i, p.player.animation];
                        }
                    }
                    prevSender = sb;
                    let worst = 0;
                    let which = null;
                    for (const b in bs) {
                        if (!ref.bones[b]) continue;
                        const d = bs[b].distanceTo(ref.bones[b]);
                        if (d > worst) {
                            worst = d;
                            which = b;
                        }
                    }
                    sumApart += worst;
                    n++;
                    const W = weights(model);
                    if (trace) r.trace.push([i, r3(worst), which, entry.animation, ref.anim, Object.entries(W).map(([k, v]) => k.slice(0, 4) + r3(v)).join(" "), Object.entries(ref.w).map(([k, v]) => k.slice(0, 4) + r3(v)).join(" ")]);
                    if (worst > r.apart[0]) r.apart = [r3(worst), which, i, entry.animation, ref.anim];
                    r.apartBy[entry.animation] = Math.max(r.apartBy[entry.animation] ?? 0, r3(worst));
                    for (const key of new Set([...Object.keys(W), ...Object.keys(ref.w)])) {
                        const d = Math.abs((W[key] ?? 0) - (ref.w[key] ?? 0));
                        if (d > r.dW[0]) r.dW = [r3(d), key, i];
                    }
                    if (scenario !== "sit") {
                        const fe = eyesOf(model);
                        if (fe !== null && model.avatar.position.y < pool().level - 0.04) {
                            if (fe < r.eyes[0]) r.eyes = [r3(fe), i, entry.animation];
                            if (fe < 0) r.eyesUnder++;
                        }
                    }
                }
                const send = (gap ? i % gap[0] >= gap[1] : true) && (hz === null || clock + 1e-9 >= nextAt);
                const a = p.avatar.avatar;
                if (send) {
                    if (hz !== null) nextAt = Math.max(nextAt + 1 / hz, clock - 1 / hz);
                    entry.position = { x: a.position.x + aside[0], y: a.position.y, z: a.position.z + aside[1] };
                    entry.quaternion = { x: a.quaternion.x, y: a.quaternion.y, z: a.quaternion.z, w: a.quaternion.w };
                    entry.animation = p.player.animation;
                    sent.push({ bones: inRoot(p.avatar), w: weights(p.avatar), anim: p.player.animation });
                    r.msgs++;
                    if (sent.length > 4) sent.shift();
                }
                r.clips.add(p.player.animation);
                if (scenario !== "sit" && pool() && a.position.y < pool().level - 0.04) {
                    const se = eyesOf(p.avatar);
                    if (se !== null && se < r.senderEyes[0]) r.senderEyes = [r3(se), i];
                }
                if (done()) break;
            }
        } finally {
            p.actions = {};
            model.dispose();
            delete p.otherPlayers["mirror-others"];
        }
        r.meanApart = r3(sumApart / Math.max(1, n));
        r.clips = [...r.clips].join(",");
        if (!trace) delete r.trace;
        return r;
    }

    // ---- two real pages over the server --------------------------------------------------------------------------------
    const tick = () => new Promise((res) => {
        const c = new MessageChannel();
        c.port1.onmessage = res;
        c.port2.postMessage(0);
    });
    async function paced(seconds, fn) {
        const t0 = performance.now();
        let frame = 0;
        while (performance.now() - t0 < seconds * 1000) {
            await tick();
            if (performance.now() - t0 < frame * (1000 / 60)) continue;
            frame++;
            fn(frame, performance.now() - t0);
        }
        return frame;
    }
    const POSE = ["Hips", "Spine2", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"];
    function poseOf(av) {
        av.avatar.updateMatrixWorld(true);
        const root = av.avatar.position;
        const inv = av.avatar.quaternion.clone().invert();
        const out = {};
        for (const b of POSE) {
            const n = node(b, av);
            if (n) out[b] = n.getWorldPosition(V3()).sub(root).applyQuaternion(inv);
        }
        return out;
    }
    const poseDiff = (a, b) => {
        let m = 0;
        for (const k in a) if (b[k]) m = Math.max(m, a[k].distanceTo(b[k]));
        return m;
    };
    async function send({ seconds = 14, mode = "stroke", seed = 5, flick = [3, 6], warm = 3 } = {}) {
        const p = P();
        if (w.birdView?.active) {
            w.toggleBirdView();
            step(5);
        }
        const drive = swimmer(mode, seed, flick);
        const rows = (window.__othersSent = []);
        let nextEmit = 0;
        let emits = 0;
        const emit = () => {
            const now = performance.now();
            if (now < nextEmit) return;
            nextEmit = now + 20;
            emits++;
            e.socket.emit("updatePlayer", { position: p.avatar.avatar.position, quaternion: p.avatar.avatar.quaternion, animation: p.player.animation, avatarSkin: p.player.avatarSkin });
        };
        await paced(warm, () => {
            step(1);
            emit();
        });
        const frames = await paced(seconds, () => {
            drive();
            step(1);
            emit();
            const a = p.avatar.avatar.position;
            rows.push([Date.now(), a.x, a.y, a.z, r3(eyesOf(p.avatar)), p.player.animation]);
        });
        p.actions = {};
        await paced(1.5, () => {
            step(1);
            emit();
        });
        const ey = rows.map((x) => x[4]).filter((x) => x !== null);
        return { frames, emits, id: e.socket?.id ?? null, eyesMin: ey.length ? Math.min(...ey) : null, under: ey.filter((x) => x < 0).length, changes: rows.filter((x, i) => i && x[5] !== rows[i - 1][5]).length };
    }
    async function recv({ seconds = 16, from, stand = null } = {}) {
        const p = P();
        if (stand) window.__act.stand(stand);
        if (w.birdView?.active) {
            w.toggleBirdView();
            step(5);
        }
        const rows = (window.__othersRecv = []);
        const r = { frames: 0, seen: 0, still: 0, newMsgFrames: 0, eyes: [9], under: 0, move: [9, 0], anims: new Set(), msgs: 0, first: null };
        const onData = () => r.msgs++;
        e.socket.on("playerData", onData);
        let pp = null;
        let lastPos = null;
        r.frames = await paced(seconds, () => {
            step(1);
            const entry = p.otherPlayers[from];
            if (!entry?.model || !entry.position) {
                pp = null;
                return;
            }
            if (!["swimming", "breaststroke", "treading"].includes(entry.animation)) {
                pp = null;
                return;
            }
            r.seen++;
            r.first ??= r.frames;
            const pos = entry.position;
            const key = pos.x + "," + pos.y + "," + pos.z;
            const fresh = key !== lastPos;
            lastPos = key;
            if (fresh) r.newMsgFrames++;
            const pz = poseOf(entry.model);
            let d = null;
            if (pp) {
                d = poseDiff(pz, pp);
                if (d < 1e-6) r.still++;
                r.move[0] = Math.min(r.move[0], d);
                r.move[1] = Math.max(r.move[1], d);
            }
            pp = pz;
            r.anims.add(entry.animation);
            const f = eyesOf(entry.model);
            if (f !== null) {
                if (f < r.eyes[0]) r.eyes = [r3(f), r.seen, entry.animation];
                if (f < 0) r.under++;
            }
            rows.push([Date.now(), pos.x, pos.y, pos.z, r3(f), entry.animation, r4(d), fresh ? 1 : 0, r.msgs]);
        });
        e.socket.off("playerData", onData);
        r.anims = [...r.anims].join(",");
        r.move = r.move.map(r3);
        return r;
    }
    window.__others = { mirror, send, recv, save, weights, inRoot, poseOf, poseDiff, step };
    return "others ready";
})();

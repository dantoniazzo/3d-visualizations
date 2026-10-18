// clips.js: the visitor's own clips measured — the figure against the water as it swims and treads, and sitting down
// and getting up (../visitor-interactions/swimming.md;
// ../visitor-interactions/sitting-and-tv.md; ../space-people/avatar-clips.md). In-page, through the sink after boot.js,
// act.js, sit.js and pool.js, in an editor tab or a public view of a site with a pool:
//   await eval(await (await fetch("http://127.0.0.1:3199/clips.js?" + Date.now())).text())
// window.__clips:
//   probe(name, pitchDeg, liftDeg, K)   the figure posed by one clip through its loop (K samples), laid back pitchDeg about
//                       its head and its neck lifted liftDeg (the live figure, put back after): where the water would
//                       have to be to keep all it wears under, and where its mouth, eyes and crown come over that water
//   figure()            the figure now, over the first pool's water (m): clothes (the highest point of what it wears),
//                       body (what it wears off the arms: Swim.js's rule, a swimmer's arms come over the water), top
//                       (Outfit_Top), mouth, eyes, crown
//   range(n, actions, { at, yaw, settle })   n frames swimming (or treading: actions {}) from `at` (default a fifth of the
//                       way along the pool from its far end, afloat), facing yaw (deg, default toward the steps): the
//                       extremes of figure() over them, the clip asked and played, the figure leaning
//   steady(actions, n, { at })   afloat near the steps' end (seven tenths of the way), settled 150 frames, looking along the
//                       pool, `actions` held 60 frames, then range(): where it ends, how fast
//   await sitTrace(id, out)   sit down on a seat and get up again, frame by frame (stood `out` m before it, or beside it
//                       where that is not free): the hips' largest step in a frame and where, the toes' lowest under the
//                       seat's floor and where, the hips over the seat's point seated
//   await ready()       the figure's clips fitted (Avatar.wear), the seats' clips dressed and their catalogue read — what
//                       the first E otherwise only queues the sit behind
//   skin(which)         "male" | "female": the figure made again with that skin (as Player does when the server says which)
//   step(n)             world.update + camera.update + afterCamera at 1/60
(() => {
    if (window.__clips) return "already";
    const e = window.experience;
    const w = e.world;
    const r3 = (x) => +x.toFixed(3);
    const P = () => w.player;
    const pool = () => P().swimmer.pools[0] ?? null;
    function along(t, y = null) {
        // A point `t` of the way from the pool's far end to its steps' end, in its middle (y: afloat, the water − 0.2).
        const p = pool();
        if (!p) return null;
        const [x0, z0, x1, z1] = p.box;
        const [ox, oz] = P().swimmer.stepsOf?.get(p)?.out ?? [0, 1];
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const near = [cx + (ox * (x1 - x0)) / 2, cz + (oz * (z1 - z0)) / 2];
        const far = [cx - (ox * (x1 - x0)) / 2, cz - (oz * (z1 - z0)) / 2];
        return [far[0] + (near[0] - far[0]) * t, y ?? p.level - 0.2, far[1] + (near[1] - far[1]) * t];
    }
    function towardSteps() {
        const p = pool();
        const [ox, oz] = P().swimmer.stepsOf?.get(p)?.out ?? [0, 1];
        return (Math.atan2(ox, oz) * 180) / Math.PI;
    }
    function parts(root) {
        const meshes = {};
        root.traverse((m) => {
            if (!m.isSkinnedMesh) return;
            const k = (m.name.match(/Outfit_Top|Outfit_Bottom|Footwear|Teeth|Head|EyeLeft|EyeRight|Hair/) || [])[0];
            if (k) meshes[k] = m;
        });
        return meshes;
    }
    function heights(root, meshes, V) {
        const v = new V();
        const maxY = (m) => {
            if (!m) return -99;
            let t = -99;
            const n = m.geometry.attributes.position.count;
            for (let j = 0; j < n; j += 2) {
                m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
                if (v.y > t) t = v.y;
            }
            return t;
        };
        const meanY = (m) => {
            if (!m) return null;
            let s = 0;
            const n = m.geometry.attributes.position.count;
            for (let j = 0; j < n; j++) {
                m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
                s += v.y;
            }
            return s / n;
        };
        const eyes = meshes.EyeLeft && meshes.EyeRight ? (meanY(meshes.EyeLeft) + meanY(meshes.EyeRight)) / 2 : null;
        return { clothes: Math.max(maxY(meshes.Outfit_Top), maxY(meshes.Outfit_Bottom), maxY(meshes.Footwear)), top: maxY(meshes.Outfit_Top), mouth: meanY(meshes.Teeth), eyes, crown: maxY(meshes.Head) };
    }
    function probe(name, pitchDeg = 0, liftDeg = 0, K = 24) {
        const av = P().avatar;
        const root = av.avatar;
        const V = root.position.constructor;
        const Q = root.quaternion.constructor;
        const mixer = av.animation.mixer;
        const act = av.animation.actions[name];
        if (!act) return `${name}: no such clip on this figure (${Object.keys(av.animation.actions).join(", ")})`;
        mixer.stopAllAction();
        act.reset().play();
        act.setEffectiveWeight(1);
        mixer.update(0);
        const bone = (n) => root.getObjectByName(av.rig.boneNames.get(n));
        const node = bone("Hips").parent;
        const neck = bone("Neck");
        const headB = bone("Head");
        const up = { p: node.position.clone(), q: node.quaternion.clone() };
        const savedPos = root.position.clone();
        const savedQ = root.quaternion.clone();
        root.position.set(0, 0, 0);
        root.quaternion.set(0, 0, 0, 1);
        root.updateMatrixWorld(true);
        const pivot = headB.getWorldPosition(new V()).divideScalar(root.scale.y);
        const q = new Q().setFromAxisAngle(new V(1, 0, 0), (-pitchDeg * Math.PI) / 180);
        node.quaternion.copy(q).multiply(up.q);
        node.position.copy(up.p).sub(pivot).applyQuaternion(q).add(pivot);
        const lift = new Q().setFromAxisAngle(new V(1, 0, 0), ((-liftDeg / 2) * Math.PI) / 180);
        const meshes = parts(root);
        const rows = [];
        for (let i = 0; i < K; i++) {
            act.time = (act.getClip().duration * i) / K;
            mixer.update(0);
            if (liftDeg) {
                neck.quaternion.multiply(lift);
                headB.quaternion.multiply(lift);
            }
            root.updateMatrixWorld(true);
            rows.push(heights(root, meshes, V));
        }
        node.position.copy(up.p);
        node.quaternion.copy(up.q);
        root.position.copy(savedPos);
        root.quaternion.copy(savedQ);
        mixer.stopAllAction();
        av.animation.actions.current = null;
        av.animation.play("idle");
        const water = Math.max(...rows.map((r) => r.clothes)) + 0.012;
        const rng = (k) => [Math.min(...rows.map((r) => r[k] - water)), Math.max(...rows.map((r) => r[k] - water))].map((x) => +x.toFixed(2)).join("..");
        return `${name} pitch ${pitchDeg} lift ${liftDeg}: water ${water.toFixed(2)} over the root; mouth ${rng("mouth")} eyes ${rng("eyes")} crown ${rng("crown")}`;
    }
    const ARMS = /(Left|Right)(Arm|ForeArm|Hand)/;
    function bodyTop(root, V) {
        const v = new V();
        let top = -99;
        root.traverse((m) => {
            if (!m.isSkinnedMesh || !/Outfit/.test(m.name)) return;
            const si = m.geometry.attributes.skinIndex;
            const sw = m.geometry.attributes.skinWeight;
            const arm = m.skeleton.bones.map((b) => ARMS.test(b.name));
            for (let j = 0; j < si.count; j += 2) {
                let wgt = 0;
                for (let k = 0; k < 4; k++) if (arm[si.getComponent(j, k)]) wgt += sw.getComponent(j, k);
                if (wgt >= 0.5) continue;
                m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
                if (v.y > top) top = v.y;
            }
        });
        return top;
    }
    function figure() {
        const root = P().avatar.avatar;
        root.updateMatrixWorld(true);
        const level = pool()?.level ?? 0;
        const V = root.position.constructor;
        const h = heights(root, parts(root), V);
        const of = (x) => (x === null ? null : r3(x - level));
        return { clothes: of(h.clothes), body: of(bodyTop(root, V)), top: of(h.top), mouth: of(h.mouth), eyes: of(h.eyes), crown: of(h.crown) };
    }
    function step(n = 1) {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
        }
    }
    function range(n = 150, actions = { forward: true }, { at = undefined, yaw = null, settle = 60 } = {}) {
        const p = P();
        const from = at === undefined ? along(0.2) : at;
        if (from) {
            p.teleport({ position: from, yaw: yaw ?? towardSteps() });
            p.actions = {};
            step(settle);
        }
        p.actions = { ...actions };
        const f0 = figure();
        const lo = { ...f0 };
        const hi = { ...f0 };
        for (let i = 0; i < n; i++) {
            step(1);
            const f = figure();
            for (const k in f) {
                if (f[k] === null) continue;
                lo[k] = Math.min(lo[k], f[k]);
                hi[k] = Math.max(hi[k], f[k]);
            }
        }
        const out = { clip: p.player.animation, played: p.avatar.animation.actions.current?.getClip().name, leaning: Boolean(p.swimmer.leaning) };
        for (const k in lo) out[k] = `${lo[k]}..${hi[k]}`;
        return out;
    }
    function steady(actions = {}, n = 150, { at = null } = {}) {
        const p = P();
        const cam = e.camera;
        const from = at ?? along(0.7);
        // (Facing the far end, away from the steps: a spawn's yaw is in degrees, and the view follows the camera.)
        const yaw = towardSteps() + 180;
        p.teleport({ position: from, yaw });
        p.actions = {};
        step(150);
        if (cam.angles) {
            cam.angles.horizontal = (yaw * Math.PI) / 180 + Math.PI;
            cam.angles.vertical = 0.2;
        }
        p.actions = { ...actions };
        step(60);
        const r = range(n, actions, { at: null });
        const c = p.player.collider.end;
        r.end = [r3(c.x), r3(c.z)];
        r.v = r3(Math.hypot(p.player.velocity.x, p.player.velocity.z));
        return r;
    }
    async function ready() {
        const p = P();
        await Promise.all([p.avatar.wear(e), w.seats?.dress(p.avatar), w.seats?.catalogue()]);
        return { worn: Boolean(p.avatar.worn), sitting: Boolean(p.avatar.has?.("sitting")) };
    }
    async function sitTrace(id, out = 0.7) {
        const p = P();
        const av = () => p.avatar;
        await ready();
        if (p.seated) p.stand({ now: true });
        p.rising = null;
        const seat = w.seats.list.find((s) => s.id === id);
        if (!seat) return { id, error: "no such seat" };
        const [fx, fz] = seat.face;
        // (Stood where the capsule fits on the seat's floor: before it, else before and aside, else beside it.)
        const spots = [[out, 0], [0.5, 0.8], [0.5, -0.8], [0, 0.9], [0, -0.9]].map(([a, b]) => [seat.at.x + fx * (seat.depth / 2 + a) - fz * b, seat.at.z + fz * (seat.depth / 2 + a) + fx * b]);
        const free = spots.find(([x, z]) => w.seats.freeAt(x, z, seat.floor, p.player.collider.radius, p.player.height)) ?? spots[0];
        window.__act.stand([free[0], seat.floor, free[1]]);
        step(60);
        const bone = (n) => av().avatar.getObjectByName(av().rig.boneNames.get(n));
        const V = av().avatar.position.constructor;
        const h = new V();
        const l = new V();
        const r = new V();
        const trace = (frames, part) => {
            let prev = null;
            let most = 0;
            let mostAt = null;
            let low = 9;
            let lowAt = null;
            for (let i = 0; i < frames; i++) {
                step(1);
                av().avatar.updateMatrixWorld(true);
                bone("Hips").getWorldPosition(h);
                if (prev) {
                    const j = h.distanceTo(prev);
                    if (j > most) {
                        most = j;
                        mostAt = [i, part()];
                    }
                }
                prev = h.clone();
                const toes = Math.min(bone("LeftToeBase").getWorldPosition(l).y, bone("RightToeBase").getWorldPosition(r).y) - seat.floor;
                if (toes < low) {
                    low = toes;
                    lowAt = [i, part()];
                }
            }
            return { step: r3(most), stepAt: mostAt, toes: r3(low), toesAt: lowAt };
        };
        p.sit(seat);
        if (!p.seated) return { id, error: "not seated (the sit was only queued, or refused)" };
        const sitBy = p.seated.plan?.by ?? null;
        const total = (p.seated.plan?.total ?? 0.35) + (p.seated.prelude?.time ?? 0) + 0.6;
        const sat = trace(Math.round(total * 60), () => p.seated?.part ?? "glide");
        av().avatar.updateMatrixWorld(true);
        const hips = r3(bone("Hips").getWorldPosition(h).y - seat.at.y);
        p.getUp();
        const riseBy = p.rising?.plan?.by ?? null;
        const rose = trace(140, () => (p.rising ? (p.rising.settling ? "settle" : p.rising.plan?.by ?? "glide") : "done"));
        return { id, kind: seat.kind, height: seat.height, sitBy, riseBy, clip: p.player.animation, sat, hipsOverSeatPoint: hips, rose };
    }
    function skin(which) {
        const p = P();
        const items = e.resources.items;
        if (!items[which]) return `no avatar "${which}" (${Object.keys(items).filter((k) => /male/.test(k)).join(", ")})`;
        const Avatar = p.avatar.constructor;
        const at = p.avatar.avatar.position.clone();
        const q = p.avatar.avatar.quaternion.clone();
        p.avatar.dispose();
        p.avatar = new Avatar(items[which], e.scene);
        p.avatar.avatar.position.copy(at);
        p.avatar.avatar.quaternion.copy(q);
        p.player.avatarSkin = which;
        return which;
    }
    window.__clips = { probe, figure, range, steady, sitTrace, ready, skin, step, along };
    return "clips ready";
})();

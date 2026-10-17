// swim-trace.js: the visitor's figure traced frame by frame while it swims, treads water, climbs out, sits and gets up
// — the pops, the facing, the waterline and the limbs through faces that the clips passes of 2026-10-17 were judged by
// (app-notes.md, Swimming and the pool's steps). In-page, through the sink after boot.js, act.js, pool.js and clips.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/swim-trace.js?" + Date.now())).text())
// window.__trace:
//   trace(frames, { label, every, through, each, keepSeries })   `frames` frames stepped at 1/60 (each(i) before each,
//              to steer: P.actions, the view's angles); returns a summary and keeps it:
//              clips   [frame, "asked/played"] at each change of clip; modes [frame, mode] at each change (out, wading,
//                      pool-shallow, afloat, climb, climb-stand, seated, rising)
//              popTop  the four largest one-frame moves of a bone in the root's own frame (the root's move and turn left
//                      out — a pop), [bone, m, frame, clip, its move in the world]
//              facing  the largest angle between the figure's forward and its velocity while moving afloat or wading
//              water   every `every` frames afloat or climbing, over the water (m): body (what it wears off the arms),
//                      top (with the arms), eyes (range), mouth, crown, toes, knees, hands (afloat)
//              through every bone that a straight line from the hips crosses a collision face to reach (hands, feet, toes,
//                      knees, head): how far past, the frame, the clip
//              camUnder frames the camera was under the water; hidden frames the figure was hidden; start, end, capsule
//   segments() every summary so far; reset() forgets them; rows() a row a frame: [i, mode, clip, root]
//   wear(av, V, level)   what clips.js's figure() reads, of any figure (av: a visitor's or another's Avatar)
//   step()     one frame
(() => {
    if (window.__trace) return "already";
    const e = window.experience, w = e.world;
    const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(3));
    const P = () => w.player;
    const BONES = ["Hips", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg", "LeftForeArm", "RightForeArm"];
    const THROUGH = ["Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg"];
    const ARMS = /(Left|Right)(Arm|ForeArm|Hand)/;
    let rows = [], segs = [];
    function step() {
        e.time.delta = 1 / 60;
        w.update();
        e.camera.update();
        w.afterCamera?.();
    }
    function boneWorld(av, name, out) {
        const b = av.avatar.getObjectByName(av.rig.boneNames.get(name));
        return b ? b.getWorldPosition(out) : null;
    }
    function wear(av, V, level) {
        const v = new V();
        let body = -99, top = -99;
        let eyes = 0, en = 0, mouth = 0, mn = 0, crown = -99;
        av.avatar.traverse((m) => {
            if (!m.isSkinnedMesh) return;
            const n = m.geometry.attributes.position.count;
            if (/Outfit/.test(m.name)) {
                const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
                const arm = m.skeleton.bones.map((b) => ARMS.test(b.name));
                for (let j = 0; j < n; j += 2) {
                    m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld);
                    if (v.y > top) top = v.y;
                    let wgt = 0;
                    for (let k = 0; k < 4; k++) if (arm[si.getComponent(j, k)]) wgt += sw.getComponent(j, k);
                    if (wgt < 0.5 && v.y > body) body = v.y;
                }
            } else if (/Eye/.test(m.name)) {
                for (let j = 0; j < n; j += 4) { eyes += m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld).y; en++; }
            } else if (/Teeth/.test(m.name)) {
                for (let j = 0; j < n; j += 4) { mouth += m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld).y; mn++; }
            } else if (/Head/.test(m.name)) {
                for (let j = 0; j < n; j += 3) { const y = m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld).y; if (y > crown) crown = y; }
            }
        });
        return { body: body - level, top: top - level, eyes: en ? eyes / en - level : null, mouth: mn ? mouth / mn - level : null, crown: crown - level };
    }
    function yawOf(q) {
        return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    }
    function trace(frames = 60, { label = "", every = 3, through = true, each = null, keepSeries = false } = {}) {
        const pl = P(), av = pl.avatar, V = av.avatar.position.constructor;
        const level = pl.swimmer.pools[0]?.level ?? 0;
        const prev = {}, prevW = {}, rootPrev = new V(); const series = { Head: [], LeftToeBase: [], RightHand: [] };
        const tmp = new V(), hips = new V(), dir = new V();
        let havePrev = false;
        const s = {
            label, frames, clips: [], modes: [], pop: {}, facing: { max: 0, at: null }, water: null, through: [], camUnder: 0,
            hidden: 0, start: null, end: null, popTop: [],
        };
        const water = { body: -99, top: -99, eyesLo: 99, eyesHi: -99, mouthLo: 99, crownLo: 99, toes: -99, knees: -99, hands: -99, n: 0, bodyAt: null, eyesAt: null, toesAt: null };
        let lastClip = null, lastMode = null;
        for (let i = 0; i < frames; i++) {
            if (each) each(i);
            step();
            av.avatar.updateMatrixWorld(true);
            const sw = pl.swimmer;
            const mode = sw.climb ? (sw.climb.standing !== null ? "climb-stand" : "climb") : sw.afloat ? "afloat" : sw.wading ? "wading" : sw.pool ? "pool-shallow" : pl.seated ? "seated" : pl.rising ? "rising" : "out";
            const clip = av.animation.actions.current?.getClip().name ?? null;
            const anim = pl.player.animation;
            const tag = `${anim}/${clip}`;
            if (tag !== lastClip) { s.clips.push([i, tag]); lastClip = tag; }
            if (mode !== lastMode) { s.modes.push([i, mode]); lastMode = mode; }
            const root = av.avatar.position;
            if (i === 0) s.start = [r3(root.x), r3(root.y), r3(root.z)];
            // Pops: each bone's move this frame in the root's own frame (the root's move and turn left out), metres.
            const inv = av.avatar.quaternion.clone().invert();
            for (const b of BONES) {
                const w0 = boneWorld(av, b, new V());
                if (!w0) continue;
                const p = w0.clone().sub(root).applyQuaternion(inv);
                if (havePrev && prev[b]) {
                    const d = p.distanceTo(prev[b]);
                    const dAbs = havePrev && prevW[b] ? w0.distanceTo(prevW[b]) : 0;
                    if (!s.pop[b] || d > s.pop[b][0]) s.pop[b] = [r3(d), i, tag, r3(dAbs)];
                    if (b === "Head" || b === "LeftToeBase" || b === "RightHand") series[b].push(r3(d));
                }
                prev[b] = p;
                prevW[b] = w0;
            }
            rootPrev.copy(root);
            havePrev = true;
            // Facing afloat or wading, moving: the figure's forward against its velocity.
            const v = pl.player.velocity;
            const sp = Math.hypot(v.x, v.z);
            if ((mode === "afloat" || mode === "wading") && sp > 0.3) {
                const yaw = yawOf(av.avatar.quaternion);
                const fx = Math.sin(yaw), fz = Math.cos(yaw);
                const err = (Math.acos(Math.max(-1, Math.min(1, (fx * v.x + fz * v.z) / sp))) * 180) / Math.PI;
                if (err > s.facing.max) s.facing = { max: r3(err), at: i, tag, speed: r3(sp) };
            }
            if (e.camera.underwater) s.camUnder++;
            if (!av.avatar.visible) s.hidden++;
            if (i % every === 0 && (mode === "afloat" || mode.startsWith("climb") || mode === "wading")) {
                const f = wear(av, V, level);
                water.n++;
                if (keepSeries) { (series.eyes ??= []).push([i, r3(f.eyes), r3(f.crown), r3(f.body), r3(root.y), Boolean(pl.swimmer.leaning)]); }
                if (f.body > water.body) { water.body = f.body; water.bodyAt = [i, tag, mode]; }
                if (f.top > water.top) water.top = f.top;
                if (mode === "afloat") {
                    if (f.eyes !== null && f.eyes < water.eyesLo) { water.eyesLo = f.eyes; water.eyesAt = [i, tag]; }
                    if (f.eyes !== null) water.eyesHi = Math.max(water.eyesHi, f.eyes);
                    if (f.mouth !== null) water.mouthLo = Math.min(water.mouthLo, f.mouth);
                    water.crownLo = Math.min(water.crownLo, f.crown);
                    for (const b of ["LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"]) {
                        const y = boneWorld(av, b, tmp).y - level;
                        if (y > water.toes) { water.toes = y; water.toesAt = [i, tag, b]; }
                    }
                    for (const b of ["LeftLeg", "RightLeg"]) water.knees = Math.max(water.knees, boneWorld(av, b, tmp).y - level);
                    for (const b of ["LeftHand", "RightHand"]) water.hands = Math.max(water.hands, boneWorld(av, b, tmp).y - level);
                }
            }
            if (through && window.__Ray && i % 2 === 0) {
                boneWorld(av, "Hips", hips);
                for (const b of THROUGH) {
                    const p = boneWorld(av, b, new V());
                    const dist = p.distanceTo(hips);
                    if (dist < 0.05) continue;
                    dir.copy(p).sub(hips).normalize();
                    const R = window.__Ray;
                    R.origin.copy(hips);
                    R.direction.copy(dir);
                    const hit = w.collision.rayIntersect(R, { twoSided: true, far: dist });
                    if (hit && hit.distance < dist - 0.02) {
                        const past = dist - hit.distance;
                        const prevSame = s.through.find((t) => t.bone === b && t.tag === tag);
                        if (!prevSame) s.through.push({ bone: b, i, tag, mode, past: r3(past), at: [r3(p.x), r3(p.y), r3(p.z)], n: 1 });
                        else { prevSame.n++; if (past > prevSame.past) { prevSame.past = r3(past); prevSame.i = i; prevSame.at = [r3(p.x), r3(p.y), r3(p.z)]; } }
                    }
                }
            }
            rows.push({ i, mode, tag, root: [r3(root.x), r3(root.y), r3(root.z)] });
        }
        const root = av.avatar.position;
        s.end = [r3(root.x), r3(root.y), r3(root.z)];
        if (water.n) {
            s.water = {
                n: water.n, bodyMax: r3(water.body), bodyAt: water.bodyAt, topMax: r3(water.top),
                eyes: water.eyesLo < 99 ? `${r3(water.eyesLo)}..${r3(water.eyesHi)}` : null, eyesAt: water.eyesAt,
                mouthLo: water.mouthLo < 99 ? r3(water.mouthLo) : null, crownLo: water.crownLo < 99 ? r3(water.crownLo) : null,
                toesMax: water.toes > -99 ? r3(water.toes) : null, toesAt: water.toesAt, kneesMax: water.knees > -99 ? r3(water.knees) : null, handsMax: water.hands > -99 ? r3(water.hands) : null,
            };
        }
        s.popTop = Object.entries(s.pop).sort((a, b) => b[1][0] - a[1][0]).slice(0, 4).map(([b, v]) => [b, ...v]);
        delete s.pop;
        if (keepSeries) s.series = series;
        s.capsule = [r3(pl.player.collider.end.x), r3(pl.player.collider.start.y - pl.player.collider.radius), r3(pl.player.collider.end.z)];
        s.prompt = window.__pool?.said?.prompt ?? null;
        segs.push(s);
        return s;
    }
    // A three Ray, borrowed from the app's own module through an existing one (the swim's down ray isn't exported):
    // a Raycaster's ray is a THREE.Ray.
    if (!window.__Ray) {
        let RayCtor = null;
        const find = (o) => { if (!RayCtor && o && o.ray && o.ray.origin && o.ray.direction && typeof o.ray.intersectBox === "function") RayCtor = o.ray.constructor; };
        find(w.player.player.raycaster); find(e.raycaster); find(w.sceneBuilder?.raycaster);
        if (!RayCtor) { for (const k of Object.keys(w.player)) find(w.player[k]); }
        window.__Ray = RayCtor ? new RayCtor() : null;
    }
    window.__trace = { trace, segments: () => segs, reset: () => { rows = []; segs = []; }, rows: () => rows, wear, step };
    return `swim-trace ready (ray ${Boolean(window.__Ray)})`;
})();

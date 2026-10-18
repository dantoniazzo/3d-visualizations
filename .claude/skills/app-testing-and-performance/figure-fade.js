// figure-fade.js: sitting down from afar and getting up during the fade — the figure dissolved out where it was and in
// where it walks on from (Player.sitPose's prelude; `fade` plans) — and whether it ends wearing exactly what it wore
// (../visitor-interactions/sitting-and-tv.md: from afar, from above). In-page, through the sink after boot.js and
// act.js, in an editor tab (Player.sit) or a public view (BirdView.sitOn, from above):
//   await eval(await (await fetch("http://127.0.0.1:3199/figure-fade.js?" + Date.now())).text())
// window.__fade:
//   snap(av)              every mesh of a figure (the visitor's by default): the very material objects it wears, and
//                         its castShadow
//   check(snap, av)       against a snap: meshes wearing the same objects, dithered or alphaHash materials worn, the
//                         lowest opacity worn, the figure's own `opacity` and `faded`, castShadow changed — right at the
//                         end of any fade: every mesh the same, none dithered, opacity 1, no shadow changed
//   opacityNow(av)        the lowest opacity any shown mesh of a figure wears
//   fade({ id, from, at, key, click, frames, settle, base })   stood at `from` ([x, z] on the seat's floor), sat on
//                         seat `id` from afar (click: from above by BirdView.sitOn where the view has it, else
//                         Player.sit), got up `at` frames in — by a real Space keydown on the document (key) or getUp()
//                         — then frame by frame until whole and settled: the root's largest move while seen (opacity
//                         over 0.02) and at full opacity, cuts (a move over 5 cm while unseen) and their opacity, the
//                         plan it rose by, and the end: opacity, materials (check), the spot free, the figure on the
//                         capsule, how far from the start and the seat. at null: sat whole, then up. click (the
//                         default) turns the view from above on where the page has one and leaves it on (B, or
//                         __bc.tap("KeyB"), to walk again)
//   startNear(seat, d, salt)   a free start `d` m from a seat on its floor, stood on; or null
//   await fades(name, { ids, ds, ats, key, click, keepTrace })   fade() over seats × distances × frames to get up at
//                         (ids: one seat of each piece kind, 10 at most); posted to the sink as `name`; the summary:
//                         how each sat (prelude, walked), rose (upBy), the worst moves seen, cuts not at 0 opacity, the
//                         ends not whole, not free or still seated
//   await ready()         the clips fitted and the seats dressed, so that the first sit is not only queued
(() => {
    if (window.__fade) return "already";
    const e = window.experience, w = e.world;
    const P = () => w.player;
    const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(3));
    const r4 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(4));
    const step = (n = 1) => {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
        }
    };
    const real = window.__realFetch ?? fetch;
    const save = (name, data) => real("http://127.0.0.1:3199/" + name, { method: "POST", body: JSON.stringify(data) });
    async function ready() {
        const p = P();
        await Promise.all([p.avatar.wear(e), w.seats.dress(p.avatar), w.seats.catalogue()]);
        return Boolean(p.avatar.worn);
    }

    // ---- the figure's materials ----------------------------------------------------------------------------------------
    function meshesOf(av = P().avatar) { const out = []; av.avatar.traverse((m) => { if (m.isMesh && m.material) out.push(m); }); return out; }
    function snap(av = P().avatar) { return meshesOf(av).map((m) => ({ m, list: [m.material].flat().slice(), shadow: m.castShadow })); }
    function check(s, av = P().avatar) {
        const r = { meshes: s.length, same: 0, changed: [], dithered: 0, alphaHash: 0, opacityMin: 1, shadowChanged: 0, figureOpacity: av.opacity ?? null, faded: Boolean(av.faded) };
        for (const { m, list, shadow } of s) {
            const now = [m.material].flat();
            if (now.length === list.length && now.every((x, i) => x === list[i])) r.same++;
            else r.changed.push(m.name);
            for (const x of now) { if (x?.userData?.dithered) r.dithered++; if (x?.alphaHash) r.alphaHash++; r.opacityMin = Math.min(r.opacityMin, x?.opacity ?? 1); }
            if (m.castShadow !== shadow) r.shadowChanged++;
        }
        r.opacityMin = r4(r.opacityMin);
        return r;
    }
    function opacityNow(av = P().avatar) { let o = 1; for (const m of meshesOf(av)) if (m.visible) for (const x of [m.material].flat()) o = Math.min(o, x?.opacity ?? 1); return o; }
    function space() {
        const ev = new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true, cancelable: true });
        document.dispatchEvent(ev);
    }
    function spaceUp() { document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true, cancelable: true })); }

    // ---- sat on from afar, got up during the fade ------------------------------------------------------------------------
    function fade({ id, from, at = null, key = true, click = true, frames = 900, settle = 90, base = null } = {}) {
        const p = P(), seats = w.seats, s = seats.list.find((q) => q.id === id);
        if (!s) return { id, error: "no seat" };
        if (p.seated) p.stand({ now: true });
        p.rising = null;
        p.swimmer.reset();
        __act.stand([from[0], s.floor, from[1]]);
        step(30);
        const b = w.birdView;
        if (click && b && !b.active) { b.activate(); step(30); }
        const start = p.player.collider.start.clone();
        const before = base ?? snap();
        const r = { id, piece: s.piece?.catalog_id ?? null, from: [r3(start.x), r3(start.z)], dist: r3(Math.hypot(start.x - s.at.x, start.z - s.at.z)), at, key, via: null };
        if (click && b?.active) { b.sitOn(s); r.via = "BirdView.sitOn"; } else { p.sit(s); r.via = "Player.sit"; }
        const seated = p.seated;
        if (!seated) return { ...r, error: "not seated" };
        r.prelude = Boolean(seated.prelude); r.free = seated.prelude ? seated.prelude.free : null;
        if (!seated.prelude) r.walked = true;
        const av = p.avatar, A = av.avatar;
        let pr = A.position.clone();
        const trace = [];
        r.seen = [0]; r.full = [0]; r.cuts = []; r.upBy = null; r.fadeFrames = null; r.gotUp = false;
        let k = 0, upAt = null;
        for (; k < frames; k++) {
            if (at !== null && k === at && p.seated) {
                const was = Boolean(p.seated);
                r.atTime = r3(p.seated.time); r.atOpacity = r4(av.opacity);
                if (key) { space(); r.how = p.seated ? "getUp (key did not)" : "Space key"; if (p.seated) p.getUp(); } else { p.getUp(); r.how = "getUp"; }
                r.gotUp = was && !p.seated;
                r.upBy = p.rising?.plan?.by ?? (p.rising ? "?" : "now");
                r.back = p.rising?.plan?.back ?? null;
                upAt = k;
            }
            step(1);
            if (k === at && key) spaceUp();
            const root = A.position.clone(), o = opacityNow(av), fo = av.opacity ?? null;
            const d = Math.hypot(root.x - pr.x, root.z - pr.z);
            trace.push([k, r3(d), r4(o), r4(fo), r3(root.x), r3(root.z), p.seated ? "s" : p.rising ? "r:" + (p.rising.plan?.by ?? "") : "-"]);
            if (o > 0.02 && d > r.seen[0]) r.seen = [r3(d), k, r4(o)];
            if (o >= 0.999 && d > r.full[0]) r.full = [r3(d), k, r4(o)];
            if (d > 0.05 && o <= 0.02) r.cuts.push([r3(d), k, r4(o)]);
            pr = root;
            if (upAt !== null && !p.seated && !p.rising) { r.fadeFrames = k - upAt; break; }
            if (at === null && p.seated && p.seated.time >= p.seated.plan.total + (p.seated.prelude?.time ?? 0) + 0.2) break;
        }
        r.frames = k;
        if (at === null) {
            // Not got up during the fade: sat, then up (as afar() does).
            r.sat = { opacity: r4(opacityNow(av)), mats: check(before) };
            p.getUp();
            for (let j = 0; j < frames && p.rising; j++) {
                step(1);
                const root = A.position.clone(), o = opacityNow(av), d = Math.hypot(root.x - pr.x, root.z - pr.z);
                if (o > 0.02 && d > r.seen[0]) r.seen = [r3(d), "up" + j, r4(o)];
                if (o >= 0.999 && d > r.full[0]) r.full = [r3(d), "up" + j, r4(o)];
                pr = root;
            }
        }
        // Settled, frames running (the probes re-dress what changed).
        let moved = [0];
        for (let j = 0; j < settle; j++) { step(1); const root = A.position.clone(), d = Math.hypot(root.x - pr.x, root.z - pr.z); if (d > moved[0]) moved = [r3(d), j]; pr = root; }
        const c = p.player.collider.start;
        r.end = {
            seated: Boolean(p.seated), rising: Boolean(p.rising), opacity: r4(opacityNow(av)), mats: check(before),
            at: [r3(c.x), r3(c.z)], free: Boolean(seats.freeAt(c.x, c.z, s.floor, 0.35, 1.2)),
            figureToCapsule: r3(Math.hypot(A.position.x - c.x, A.position.z - c.z)), rootOverFloor: r3(A.position.y - s.floor),
            fromStart: r3(Math.hypot(c.x - start.x, c.z - start.z)), fromSeat: r3(Math.hypot(c.x - s.at.x, c.z - s.at.z)),
            settleMove: moved, visible: A.visible, anim: p.player.animation,
        };
        r.trace = trace;
        return r;
    }
    function startNear(s, d, salt = 0) {
        const seats = w.seats, p = P();
        for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI * 2) / 16 + ((s.id.length + salt) % 3) * 0.2;
            const x = s.at.x + Math.cos(a) * d, z = s.at.z + Math.sin(a) * d;
            if (seats.freeAt(x, z, s.floor, 0.35, 1.2)) { __act.stand([x, s.floor, z]); step(5); const c = p.player.collider.start; if (Math.hypot(c.x - x, c.z - z) < 0.3 && Math.abs(c.y - p.player.collider.radius - s.floor) < 0.15) return [x, z]; }
        }
        return null;
    }
    /** One seat of each piece's catalogue id, up to `n`: a spread of kinds to fade on. */
    function sample(n = 10) {
        const seen = new Set();
        const out = [];
        for (const s of w.seats.list) {
            const k = s.piece?.catalog_id ?? s.kind;
            if (seen.has(k) || w.seats.usable?.(s) === false) continue;
            seen.add(k);
            out.push(s.id);
            if (out.length >= n) break;
        }
        return out;
    }
    async function fades(name, { ids = null, ds = [4.5, 6, 9], ats = [1, 4, 9, 14, 18, 20, 24, 30, 34], key = true, click = true, keepTrace = false } = {}) {
        ids ??= sample();
        await ready();
        const out = [];
        const base = snap();
        for (const id of ids) {
            const s = w.seats.list.find((q) => q.id === id);
            if (!s) { out.push({ id, error: "no seat" }); continue; }
            for (const d of ds) {
                const st = startNear(s, d);
                if (!st) { out.push({ id, d, error: "no start" }); continue; }
                for (const at of ats) {
                    const r = fade({ id, from: st, at, key, click, base });
                    if (!keepTrace) { r.traceLen = r.trace?.length; delete r.trace; }
                    out.push({ d, ...r });
                }
            }
        }
        const p = P();
        if (p.seated) p.stand({ now: true });
        p.rising = null;
        if (name) await save(name, out);
        const ok = out.filter((r) => !r.error);
        const faded = ok.filter((r) => r.upBy === "fade");
        const mx = (f, rs = ok) => { const v = rs.map(f).filter(Number.isFinite); return v.length ? Math.max(...v) : null; };
        return {
            runs: out.length, ok: ok.length, errors: out.filter((r) => r.error).map((r) => `${r.id}@${r.d}:${r.error}${r.at !== undefined ? "@" + r.at : ""}`).slice(0, 10),
            prelude: ok.filter((r) => r.prelude).length, walked: ok.filter((r) => r.walked).length, upBy: ok.reduce((m, r) => ((m[r.upBy] = (m[r.upBy] ?? 0) + 1), m), {}),
            back: faded.filter((r) => r.back).length, keyWorked: ok.filter((r) => r.how === "Space key").length,
            seenMax: mx((r) => r.seen[0]), fullMax: mx((r) => r.full[0]), fullMaxFaded: mx((r) => r.full[0], faded),
            cuts: ok.reduce((n, r) => n + r.cuts.length, 0), cutsNotZero: ok.flatMap((r) => r.cuts.filter((c) => c[2] !== 0).map((c) => `${r.id}@${r.d}/${r.at}:${c}`)).slice(0, 8),
            fadeFramesMax: mx((r) => r.fadeFrames, faded), endOpacity: [...new Set(ok.map((r) => r.end.opacity))], endSameAll: ok.every((r) => r.end.mats.same === r.end.mats.meshes),
            endDithered: mx((r) => r.end.mats.dithered), endAlpha: mx((r) => r.end.mats.alphaHash), shadowChanged: mx((r) => r.end.mats.shadowChanged),
            endFree: ok.filter((r) => !r.end.free).map((r) => `${r.id}@${r.d}/${r.at}`), figToCap: mx((r) => r.end.figureToCapsule), settleMove: mx((r) => r.end.settleMove[0]),
            stillSeated: ok.filter((r) => r.end.seated || r.end.rising).length, backAtStart: ok.filter((r) => r.end.fromStart < 0.5).length,
            fromSeat: [Math.min(...ok.map((r) => r.end.fromSeat)), mx((r) => r.end.fromSeat)],
        };
    }

    window.__fade = { snap, check, opacityNow, meshesOf, space, spaceUp, fade, fades, startNear, sample, ready, save, step };
    return "figure-fade ready";
})();

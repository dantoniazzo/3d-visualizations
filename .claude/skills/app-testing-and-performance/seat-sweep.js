// seat-sweep.js: every seat a visitor can walk to, sat on and got up from, frame by frame, its limbs measured against
// everything but the seat's own piece — the acceptance test of every clips pass of 2026-10-17
// (../visitor-interactions/sitting-and-tv.md, Testing). Run it before and after any change to World/Seats.js, Player's
// sitting plans or the visitor's clips, both skins (boot.js's window.__pickSkin) in both views (an editor tab and a
// public view of the same scene), and compare the files with seat-sweep.py. In-page, through the sink after boot.js,
// act.js and sit.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/seat-sweep.js?" + Date.now())).text())
//   await __seats.ready(); await __seats.loadBoxes("ladonia-w-boxes.json"); await __seats.loadStarts("ladonia-seat-starts.json")
//   await __seats.sweep("sweep-editor-female.json")       (Ladonia's 214 seats: a few minutes; posted to the sink)
// window.__seats:
//   await ready()          the figure's clips fitted (Avatar.wear), the seats' clips dressed, their catalogue read: else
//                          the first sit only queues itself behind those promises and a synchronous sweep never sits
//   takeBoxes(name)        IN AN EDITOR TAB: every piece's box in the world and its label ({ id: { label, min, max } }),
//                          kept and (with a name) posted to the sink — the boxes the public view's own-piece rule needs
//   await loadBoxes(file) / setBoxes(boxes)   the boxes, from this folder through the sink (Ladonia's:
//                          ladonia-w-boxes.json, 171 pieces) or given
//   makeStarts(name)       a free start for every usable seat (0.75 m before its front edge, else Seats.spotBeside),
//                          kept and (with a name) posted to the sink: take it once and use the same file for every build
//                          compared. Returns how many
//   await loadStarts(file) / starts   the starts (Ladonia's: ladonia-seat-starts.json, 214 seats → [x, z]). Ladonia's
//                          scene of 2026-10-17 (the editor, and a version published from it) has 219 seats, 216 usable:
//                          a-f116#0, a-f189#0/#2 and b-f192#0/#2 have no start in the file, so a sweep with it leaves
//                          them out (makeStarts covers them).
//                          Returns how many
//   ownOf(seat)            the sweep's own rule for a seat's own piece, independent of Seats.own (which ownCheck tests):
//                          whatever lies under the seat's floor + 6 cm (the floor, a rug); in the editor, any triangle
//                          whose source is the piece; in a public view, whose triangles carry no source, a triangle
//                          labelled as the piece is with its three corners inside the piece's editor box ± 3 cm
//   limbsMeet(except, depth)   the 16 limb capsules (radii: hips–chest 0.12, chest–neck 0.10, neck–head 0.05, head
//                          0.09; upper arm 0.045, forearm 0.04, hand 0.03; thigh 0.07, shin 0.05, foot 0.04) against
//                          every collision tree, the triangles `except(tri)` is true of left out (ownOf(seat) makes
//                          one; null leaves none out): the deepest contact over `depth` (2.5 cm)
//   seat(id, { from, sitFrames, riseFrames, depth })   one seat: stood at `from`, Player.sit, frames to seated, getUp,
//                          frames to stood; per phase (walk, turn, sitdown-foot / sitdown-clip, settle, seated;
//                          standup-foot / standup-clip, settle, walk, turn) the root's and the hips' speeds, contacts
//                          deeper than `depth` (how many frames, the worst: depth, limb, what), the largest one-frame
//                          moves, walking sideways (more than 45° off the way the figure faces), the plans (sitBy,
//                          riseBy, routes, totals), the end spot and whether it is free, the figure on the capsule
//   await sweep(name, { ids, from, to })   seat() over every seat with a start (or `ids`), with the side sat on and the
//                          plans' times (planMs); posted to the sink as `name` → { n, errors, side, s }
//   decide(id, from)       the plans alone (sit by / rise by, where) and how long each took to make, stood at `from`
//                          ([x, z]; default the seat's start, as seat() takes it)
//   ownCheck(id)           the triangles round a seat Seats.own calls its own, against the piece's box: outside it,
//                          missed, from another piece
//   await self(ids)        seated: the limbs inside the seat's own piece above its cushion (its back, its arms, a shell's
//                          sides) — what ownOf leaves out of the sweep; with the sweep's other contacts too
//   step(n), bone(name)
(() => {
    if (window.__seats) return "already";
    const e = window.experience;
    const w = e.world;
    const cam = e.camera;
    const sb = w.sceneBuilder;
    const real = window.__realFetch ?? window.fetch.bind(window);
    const SINK = "http://127.0.0.1:3199/";
    const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(1));
    const r3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? x : +x.toFixed(3));
    const P = () => w.player;
    const step = (n = 1) => {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            cam.update();
            w.afterCamera?.();
        }
    };
    const V3 = () => new (P().player.collider.end.constructor)();
    const bone = (n, out = V3(), av = P().avatar) => {
        const b = av.avatar.getObjectByName(av.rig.boneNames.get(n));
        return b ? b.getWorldPosition(out) : null;
    };
    const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const seatOf = (id) => w.seats.list.find((q) => q.id === id);
    const post = (name, data) => real(SINK + name, { method: "POST", body: JSON.stringify(data) });
    const TREES = ["static", "dynamic", "people", "outdoor"];

    async function ready() {
        const p = P();
        await Promise.all([p.avatar.wear(e), w.seats.dress(p.avatar), w.seats.catalogue()]);
        return { seats: w.seats.list.length, worn: Boolean(p.avatar.worn), skin: p.player.avatarSkin };
    }

    // ---- the pieces' boxes, and the own-piece rule ---------------------------------------------------------------------
    let BOXES = null;
    function setBoxes(b) {
        BOXES = b;
        return Object.keys(b).length;
    }
    function takeBoxes(name = null) {
        if (e.publicView) return "takeBoxes is for an editor tab (a public view's pieces are merged into the house)";
        const out = {};
        const corner = V3();
        for (const [id, { group }] of sb.furniture) {
            group.updateMatrixWorld(true);
            const min = [Infinity, Infinity, Infinity];
            const max = [-Infinity, -Infinity, -Infinity];
            group.traverse((m) => {
                if (!m.isMesh || !m.geometry || m.userData?.standIn || m.userData?.helper) return;
                if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
                const b = m.geometry.boundingBox;
                for (const x of [b.min.x, b.max.x]) {
                    for (const y of [b.min.y, b.max.y]) {
                        for (const z of [b.min.z, b.max.z]) {
                            corner.set(x, y, z).applyMatrix4(m.matrixWorld);
                            for (let k = 0; k < 3; k++) {
                                min[k] = Math.min(min[k], corner.getComponent(k));
                                max[k] = Math.max(max[k], corner.getComponent(k));
                            }
                        }
                    }
                }
            });
            if (min[0] === Infinity) continue;
            out[id] = { label: group.userData.label, min: min.map(r3), max: max.map(r3) };
        }
        setBoxes(out);
        if (name) post(name, out);
        return Object.keys(out).length;
    }
    async function loadBoxes(file = "ladonia-w-boxes.json") {
        return setBoxes(await (await real(SINK + file + "?" + Date.now())).json());
    }
    function ownOf(seat) {
        const id = seat.furniture;
        const floor = seat.floor + 0.06;
        const box = BOXES?.[id];
        const label = box?.label;
        const g = 0.03;
        const inBox = (v) => box && v.x >= box.min[0] - g && v.x <= box.max[0] + g && v.y >= box.min[1] - g && v.y <= box.max[1] + g && v.z >= box.min[2] - g && v.z <= box.max[2] + g;
        return (t) => {
            if (t.a.y < floor && t.b.y < floor && t.c.y < floor) return true;
            const k = t.source?.key?.userData?.id;
            if (k !== undefined) return k === id;
            return label !== undefined && t.label === label && inBox(t.a) && inBox(t.b) && inBox(t.c);
        };
    }
    const LIMBS = [
        ["Hips", "Spine2", 0.12],
        ["Spine2", "Neck", 0.1],
        ["Neck", "Head", 0.05],
        ["Head", "HeadTop_End", 0.09],
        ...["Left", "Right"].flatMap((sd) => [
            [`${sd}Arm`, `${sd}ForeArm`, 0.045],
            [`${sd}ForeArm`, `${sd}Hand`, 0.04],
            [`${sd}Hand`, `${sd}HandMiddle4`, 0.03],
            [`${sd}UpLeg`, `${sd}Leg`, 0.07],
            [`${sd}Leg`, `${sd}Foot`, 0.05],
            [`${sd}Foot`, `${sd}Toe_End`, 0.04],
        ]),
    ];
    function limbsMeet(except, depth = 0.025, keep = null) {
        const C = w.collision;
        const Cap = P().player.collider.constructor;
        let worst = null;
        for (const [a, b, rad] of LIMBS) {
            const pa = bone(a);
            const pb = bone(b);
            if (!pa || !pb) continue;
            const cap = new Cap(pa, pb, rad);
            for (const k of TREES) {
                if (!C[k]) continue;
                const tris = [];
                C[k].getCapsuleTriangles(cap, tris);
                for (const t of tris) {
                    if (keep ? !keep(t) : except?.(t)) continue;
                    const h = C[k].triangleCapsuleIntersect(cap, t);
                    if (h && h.depth > depth && (!worst || h.depth > worst.depth)) worst = { depth: r3(h.depth), limb: `${a}-${b}`, what: t.label ?? t.source?.key?.userData?.label ?? k };
                }
            }
        }
        return worst;
    }

    // ---- starts -------------------------------------------------------------------------------------------------------
    let STARTS = null;
    function startFor(s) {
        const seats = w.seats;
        const [fx, fz] = s.face;
        const edge = s.depth - Math.min(0.15, s.depth / 2);
        const ahead = [s.at.x + fx * (edge + 0.75), s.at.z + fz * (edge + 0.75)];
        if (seats.freeAt(ahead[0], ahead[1], s.floor, 0.35, 1.2)) return ahead;
        const b = seats.spotBeside(s, 0.35, 1.2);
        return b ? [b.x, b.z] : ahead;
    }
    function makeStarts(name = null) {
        const out = {};
        for (const s of w.seats.list) if (w.seats.usable?.(s) !== false) out[s.id] = startFor(s).map(r3);
        STARTS = out;
        if (name) post(name, out);
        return Object.keys(out).length;
    }
    async function loadStarts(file = "ladonia-seat-starts.json") {
        STARTS = await (await real(SINK + file + "?" + Date.now())).json();
        return Object.keys(STARTS).length;
    }

    // ---- one seat -----------------------------------------------------------------------------------------------------
    function phaseOfSeated(p) {
        const s = p.seated;
        if (!s) return "none";
        const plan = s.plan;
        if (!plan) return "glide";
        if (s.time < plan.approach) return plan.route ? (s.part === "walking" ? "walk" : "turn") : "turn";
        if (plan.by === "walk") return s.time < plan.approach + plan.down ? "sitdown-foot" : "seated";
        return s.part === "settle" ? (s.time < plan.total ? "settle" : "seated") : "sitdown-clip";
    }
    function phaseOfRising(p) {
        const r = p.rising;
        if (!r) return "done";
        const plan = r.plan;
        if (!plan) return "noplan";
        if (plan.by === "walk") return r.time < plan.up ? "standup-foot" : r.part === "walking" ? "walk" : "turn";
        if (plan.by === "fade") return "fade";
        return r.settling ? "settle" : "standup-clip";
    }
    function seat(id, { from = null, sitFrames = null, riseFrames = null, depth = 0.025 } = {}) {
        const p = P();
        const seats = w.seats;
        const s = seatOf(id);
        if (!s) return { id, error: "no seat" };
        if (p.seated) p.stand({ now: true });
        p.rising = null;
        const start = from ?? STARTS?.[id] ?? startFor(s);
        window.__act.stand([start[0], s.floor, start[1]]);
        step(30);
        const except = ownOf(s);
        const fromAt = p.player.collider.start.clone();
        const res = { id, kind: s.kind, piece: s.piece?.catalog_id ?? null, start: start.map(r3) };
        const trace = (n, phaseFn, done) => {
            const r = { frames: 0, speed: {}, hips: {}, sideways: [0], jump: [0], hipsJump: [0], hits: {}, first: null };
            let prevR = p.avatar.avatar.position.clone();
            let prevH = bone("Hips");
            for (let i = 0; i < n; i++) {
                const ph0 = phaseFn();
                step(1);
                r.frames = i + 1;
                const now = phaseFn();
                const ph = now === "seated" || now === "done" ? ph0 : now;
                const av = p.avatar.avatar;
                av.updateMatrixWorld(true);
                const root = av.position.clone();
                const hips = bone("Hips");
                const dx = root.x - prevR.x;
                const dz = root.z - prevR.z;
                const d = Math.hypot(dx, dz);
                const sp = d * 60;
                if (sp > (r.speed[ph]?.[0] ?? 0)) r.speed[ph] = [r3(sp), i];
                const hd = Math.hypot(hips.x - prevH.x, hips.z - prevH.z);
                if (hd * 60 > (r.hips[ph]?.[0] ?? 0)) r.hips[ph] = [r3(hd * 60), i];
                if (d > r.jump[0]) r.jump = [r3(d), i, ph];
                const hj = hips.distanceTo(prevH);
                if (hj > r.hipsJump[0]) r.hipsJump = [r3(hj), i, ph];
                if (sp > 0.4) {
                    const ang = Math.abs(((Math.atan2(dx, dz) - yawOf(av.quaternion) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 57.3;
                    if (ang > r.sideways[0]) r.sideways = [r3(ang), i, ph, r3(sp)];
                }
                prevR = root;
                prevH = hips;
                const m = limbsMeet(except, depth);
                if (m) {
                    const h = (r.hits[ph] ??= { n: 0, worst: null });
                    h.n++;
                    if (!h.worst || m.depth > h.worst.depth) h.worst = { ...m, i };
                }
                if (done && done()) break;
            }
            return r;
        };
        const ok = p.sit(s);
        const plan = p.seated?.plan;
        res.sitBy = plan?.by ?? null;
        res.sitRoute = plan?.route?.steps ? plan.route.steps.map((q) => q.kind[0]).join("") : null;
        res.sitTotal = r3(plan?.total);
        res.side = p.seated?.pose?.side ?? null;
        res.sit = trace(sitFrames ?? Math.round(((plan?.total ?? 0.5) + (p.seated?.prelude?.time ?? 0) + 0.3) * 60), () => phaseOfSeated(p));
        res.seatedOk = Boolean(p.seated) && ok;
        p.getUp();
        const rp = p.rising?.plan ?? null;
        res.riseBy = rp?.by ?? null;
        res.riseRoute = rp?.route?.steps ? rp.route.steps.map((q) => q.kind[0]).join("") : null;
        res.riseTotal = r3(rp ? (rp.by === "walk" || rp.by === "fade" ? rp.total : rp.clip + rp.settle) : null);
        res.rise = trace(riseFrames ?? Math.round(((res.riseTotal ?? 0.5) + 0.4) * 60), () => phaseOfRising(p), () => !p.rising);
        const c = p.player.collider.start;
        res.end = [r3(c.x), r3(c.z)];
        res.endFromStart = r3(Math.hypot(c.x - fromAt.x, c.z - fromAt.z));
        res.endFree = Boolean(seats.freeAt(c.x, c.z, s.floor, 0.35, 1.2));
        res.figureToCapsule = r3(Math.hypot(p.avatar.avatar.position.x - c.x, p.avatar.avatar.position.z - c.z));
        res.anim = p.player.animation;
        return res;
    }

    // ---- the sweep ----------------------------------------------------------------------------------------------------
    async function sweep(name = null, { ids = null, from = 0, to = Infinity } = {}) {
        await ready();
        const p = P();
        const sit = p.sit;
        const getUp = p.getUp;
        const own = (key) => Object.prototype.hasOwnProperty.call(p, key);
        const had = { sit: own("sit"), getUp: own("getUp") };
        let sitMs = null;
        let upMs = null;
        // (Timed by wrapping this page's instance; put back at the end.)
        p.sit = function (seat) {
            const t0 = performance.now();
            const ok = sit.call(p, seat);
            sitMs = performance.now() - t0;
            return ok;
        };
        p.getUp = function (...a) {
            const t0 = performance.now();
            const x = getUp.apply(p, a);
            upMs = performance.now() - t0;
            return x;
        };
        const list = (ids ?? (STARTS ? Object.keys(STARTS) : w.seats.list.map((s) => s.id))).slice(from, to);
        const out = [];
        const t0 = performance.now();
        try {
            for (const id of list) {
                try {
                    sitMs = upMs = null;
                    const r = seat(id);
                    r.planMs = [r1(sitMs), r1(upMs)];
                    out.push(r);
                } catch (err) {
                    out.push({ id, error: String(err?.stack ?? err).slice(0, 400) });
                }
            }
        } finally {
            if (had.sit) p.sit = sit;
            else delete p.sit;
            if (had.getUp) p.getUp = getUp;
            else delete p.getUp;
        }
        if (p.seated) p.stand({ now: true });
        p.rising = null;
        window.__seatsLast = out;
        if (name) await post(name, out);
        return { n: out.length, errors: out.filter((r) => r.error).length, side: out.filter((r) => r.side).length, notSeated: out.filter((r) => !r.error && !r.seatedOk).length, s: Math.round((performance.now() - t0) / 1000) };
    }
    function decide(id, from = null) {
        const p = P();
        const s = seatOf(id);
        if (!s) return { id, error: "no seat" };
        if (p.seated) p.stand({ now: true });
        p.rising = null;
        // (From [x, z]; by default the seat's start, as seat() takes it.)
        const at = from ?? STARTS?.[id] ?? startFor(s);
        window.__act.stand([at[0], s.floor, at[1]]);
        step(2);
        const t0 = performance.now();
        p.sit(s);
        const t1 = performance.now();
        const plan = p.seated?.plan;
        const sit = plan ? { by: plan.by, at: plan.at ? [r3(plan.at.x), r3(plan.at.z)] : null, route: plan.route?.points?.length ?? plan.route?.steps?.length ?? null } : null;
        // Sat at once (the plan's end), then up.
        if (p.seated) {
            p.seated.time = 99;
            step(2);
        }
        const t2 = performance.now();
        p.getUp();
        const t3 = performance.now();
        const rp = p.rising?.plan;
        const rise = rp ? { by: rp.by, spot: rp.spot ? [r3(rp.spot.x), r3(rp.spot.z)] : null } : null;
        if (p.rising) {
            p.rising.time = 99;
            step(2);
        }
        p.rising = null;
        return { id, sit, rise, planMs: [r3(t1 - t0), r3(t3 - t2)] };
    }
    function ownCheck(id) {
        const s = seatOf(id);
        const box = BOXES?.[s?.furniture];
        if (!s || !box) return { id, error: s ? "no box for its piece (loadBoxes / takeBoxes first)" : "no seat" };
        const own = w.seats.own(s);
        const C = w.collision;
        const Cap = P().player.collider.constructor;
        const cx = (box.min[0] + box.max[0]) / 2;
        const cz = (box.min[2] + box.max[2]) / 2;
        const rad = Math.hypot(box.max[0] - box.min[0], box.max[2] - box.min[2]) / 2 + 0.6;
        const cap = new Cap(V3().set(cx, s.floor - 0.2, cz), V3().set(cx, box.max[1] + 0.6, cz), rad);
        const floor = s.floor + 0.06;
        const g = 0.03;
        const inBox = (v) => v.x >= box.min[0] - g && v.x <= box.max[0] + g && v.y >= box.min[1] - g && v.y <= box.max[1] + g && v.z >= box.min[2] - g && v.z <= box.max[2] + g;
        let ownN = 0;
        let outside = 0;
        let missed = 0;
        let other = 0;
        const outsideLabels = {};
        const sameSrc = { yes: 0, no: 0 };
        for (const k of TREES) {
            if (!C[k]) continue;
            const tris = [];
            C[k].getCapsuleTriangles(cap, tris);
            for (const t of tris) {
                if (t.a.y < floor && t.b.y < floor && t.c.y < floor) continue;
                const label = t.label ?? t.source?.key?.userData?.label;
                const src = t.source?.key?.userData?.id;
                const inside = inBox(t.a) && inBox(t.b) && inBox(t.c);
                if (own(t)) {
                    ownN++;
                    if (src !== undefined) {
                        if (src === s.furniture) sameSrc.yes++;
                        else {
                            sameSrc.no++;
                            outsideLabels[src + ":" + label] = (outsideLabels[src + ":" + label] ?? 0) + 1;
                        }
                    }
                    if (!inside) {
                        outside++;
                        outsideLabels[label] = (outsideLabels[label] ?? 0) + 1;
                    }
                } else if (inside && label === box.label && (src === undefined || src === s.furniture)) missed++;
                else other++;
            }
        }
        return { id, piece: s.furniture, ownN, outside, missed, other, sameSrc, outsideLabels };
    }
    async function self(ids = null) {
        await ready();
        const p = P();
        const out = [];
        for (const id of ids ?? Object.keys(STARTS ?? {})) {
            const s = seatOf(id);
            if (!s) continue;
            if (p.seated) p.stand({ now: true });
            p.rising = null;
            const f = STARTS?.[id] ?? startFor(s);
            window.__act.stand([f[0], s.floor, f[1]]);
            step(10);
            p.sit(s);
            if (!p.seated) {
                out.push({ id, error: "not seated" });
                continue;
            }
            // (Stepped through: a seated.time pushed on leaves the figure standing as the fade has it.)
            const total = p.seated.plan.total + (p.seated.prelude?.time ?? 0);
            step(Math.round(total * 60) + 40);
            const own = ownOf(s);
            const cushion = s.at.y + 0.05;
            const worst = limbsMeet(null, 0, (t) => own(t) && !(t.a.y < cushion && t.b.y < cushion && t.c.y < cushion));
            const hips = bone("Hips");
            out.push({ id, side: p.seated.pose.side ?? 0, piece: s.piece?.catalog_id, worst, hips: r3(hips.y - s.at.y), anim: p.player.animation, other: limbsMeet(ownOf(s)) });
            p.stand({ now: true });
            p.rising = null;
        }
        return out;
    }
    window.__seats = {
        ready,
        setBoxes,
        takeBoxes,
        loadBoxes,
        makeStarts,
        loadStarts,
        get starts() {
            return STARTS;
        },
        get boxes() {
            return BOXES;
        },
        ownOf,
        limbsMeet,
        startFor,
        seat,
        sweep,
        decide,
        ownCheck,
        self,
        step,
        bone,
        LIMBS,
    };
    return `seat-sweep ready (${w.seats?.list?.length ?? 0} seats)`;
})();

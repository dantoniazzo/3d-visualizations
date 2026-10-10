// In-page: the people round a space (World/People.js), audited BY SKIN — each
// person posed through their clip as the app finishes them (bent to a
// lounger, arms brought in, the drink stood upright), and their skinned
// vertices measured against the real meshes round them. Bones alone miss
// what shows: rays down the shin bones passed calves 1–2 cm inside sofas.
//
// Load in the editor's page of a TEST server (`/?scene=<id>`, not a public
// view: that builds only whom its quality step draws, and batches the shell),
// after harness.js, through the sink:
//   await eval(await (await fetch("http://127.0.0.1:3199/people-audit.js")).text())
// It needs no frames, so it runs with the pane hidden; only lineup() and
// shots() draw, and they need a canvas of a size (a tab never shown has one
// of 2 × 2, and saves blurs: app-notes.md, The browser pane). Nothing is
// saved: harness.js stubs the saves, and load() and patch() change the page's
// spec alone — reload the tab to be rid of them.
//
//   __people.audit({ phases = 6, ids, save })   → { summary, rows }
//       Each person at `phases` points of their clip (a still pose, which
//       breathes: breathed in, breathed out and between).
//       A javascript_tool call stops at 45 s and the page carries on: start
//       a whole plan without awaiting it and poll `__people.run`
//       ({ state, done, total }); the result stays in `__people.last`.
//       `save: "<name>.json"` also writes it through the sink. Ladonia's 12
//       people at 6 phases: 1 s (its own triangle grid; three's raycast took 44).
//       summary: { people, built, flagged, flags: { <id>: [what is out of
//       tolerance, in words] }, text }. A row, lengths in cm unless marked,
//       [least, most] over the phases:
//         id, character, pose, clip, prop, group, seat ("<piece>#<n>")
//         drawn     { character, clip, prop } as the app drew them, where that
//                   is not what the spec says (a drinking clip is given the
//                   bottle whatever its prop; a hand that holds nothing is
//                   given nothing; a clip the index lacks is replaced)
//         contact   stand: sole (the lower sole over what is under it), on
//                   sit:   soles { L, R }, on; seat (the deepest skin under the
//                          pelvis over the seat's own mesh, loose pillows left
//                          out); plane (the lowest 1 % of it over seats.json's
//                          height); back (the gap behind the back's skin);
//                          lift, give (what People.js and the planner let them
//                          up or down); legsIn { "<shin|foot>": [cm behind the
//                          piece's front, points, mesh] }
//                   lie:   hips, back, head, calves, heels, hands { L, R }
//                          (the deepest skin of each over the lounger, − in
//                          it); wrists { L, R, half } (from the lounger's
//                          midline, and half its cushion's width); bend
//         hits      [{ limb, into, cm, points, bone }] — skin inside furniture, walls,
//                   rails, a hedge's core, planters' grasses: a ray down each limb's bone both
//                   ways (`bone`: the bone itself passes through) and one from
//                   the bone's line out to each of ~110 points of its skin.
//                   Left out: floors and rugs (the soles say), and resting in
//                   their own seat within OWN_SEAT.
//         drink     { prop, bottle, hand, tiltAway (the most it leans with the
//                   hand AWAY cm or more from the mouth), tiltSip (nearer),
//                   lips (the least gap from the prop to the lips), inFace
//                   (the most it is under the head's skin, by ray against the
//                   head's own triangles), sipAt (seconds into the clip) }
//         facing    degrees off the middle of their group-mates (standing)
//         mates     metres to each; nearest: [metres, id] of anyone at all
//         obstacle  [metres, mesh]: the nearest thing to their upright, by 24
//                   level rays at four heights (standing)
//   __people.TOL                  the tolerances, below; change one and audit again
//   __people.load(plan)           a plan's people (an array, or { people }) put in
//                                 world.spec.people in memory and built; load(null)
//                                 puts back the ones the page loaded with
//   __people.patch({ "<id>": { clip, prop, position, rotation, character … } })
//                                 hand edits through People.update, as the editor
//                                 makes them; returns the people as they now are
//                                 (what a vetted plan is written from)
//   __people.lineup({ name, at, cols, clip })
//                                 every character of the index standing in rows,
//                                 one frame through the sink — by default 4 m
//                                 over the site's roofs, against the sky (nothing
//                                 in the way anywhere; `at: [x, y, z]` for a floor)
//                                 — then the plan back: are they all there,
//                                 opaque, matt, haired, of a size
//   __people.shots(prefix, { ids, sip, per, cols, width })
//                                 a close frame of each person from the first
//                                 angle with a clear view, six to a sheet:
//                                 <prefix>-1.jpg …; `sip: true`: only those with
//                                 a drink, each at the moment it is nearest
//                                 their mouth, close on the head
//   __people.look(id, opts)       only the camera (then __K.shot / __K.save)
//
// Not seen by it: lawn and meadow grass and a hedge's leaves (walked on and
// brushed past; planters' and beds' grasses and trees ARE — a blade crossed
// an arm on Ladonia), the sway of anything in the wind, cloth against cloth,
// and whatever a frame shows that a number does not. Read the frames too.
//
// Project-specific: nothing by id. Seats and loungers are whatever
// seats.json has for the pieces people's `seat` names. What is the app's
// rather than a rule: the mesh names it reads (`floor:<room>` under `shell`,
// the planting under `flora`), Mixamo's bone names, and the cloth materials
// a loose pillow is told by (PILLOW). The tolerances are the ones the
// independent checker of Ladonia's people passed and failed by (2026-10-09).
// Ladonia's saved 12 on 2026-10-10: six flagged — four lying heels 3.8–8.3 cm
// over the cushion and a lounge chair's loose pillow 7.3 cm into a back
// (app-notes.md, People, "Still short": flagged every time until fixed), a
// planter's grass 1.8 cm into a standing arm, and a hand under a head 5.2 cm
// into the cushion with the breath in (its bone's own line).
(async () => {
    const K = window.__K;
    if (!K) throw new Error("people-audit.js: load harness.js first");
    const { e, w } = K;
    const sb = w.sceneBuilder;
    const P = w.people;
    if (!P) throw new Error("people-audit.js: this world has no people (World/People.js)");
    await Promise.race([sb.furnitureReady, new Promise((r) => setTimeout(r, 30000))]);
    await Promise.race([P.ready, new Promise((r) => setTimeout(r, 30000))]);
    await P.seats();
    const preloader = document.querySelector(".preloader");
    if (preloader) preloader.style.display = "none";

    // ------------------------------------------------------------------ tolerances
    const TOL = {
        /** The lower sole over what it stands on, cm [under, over]: People.js lifts a sitter 1.5 cm at most (LIFT_MOST) and leaves the rest in the floor; passed −0.9…+0.8. */
        SOLE: [-2, 2],
        /** Sitting: the deepest skin under the pelvis over the seat's mesh, cm. A soft seat gives 3 (the planner's GIVE): −3.5 passed on a sofa; +0.9 was the most over one. */
        SEAT: [-4, 1.5],
        /** Lying: the deepest skin of the hips, the back and the head over the lounger, cm. A head within ±3 rests on it (People.js's HEAD_OFF); a back −3.1 passed. */
        REST: [-3.5, 3],
        /** Lying: the heels' deepest skin over the lounger, cm. */
        HEELS: [-3, 3],
        /** Skin this far inside anything, cm, is a hit; less is a touch. A bone's own line through something always is. */
        LIMB_IN: 1.0,
        /** Resting in one's own seat is not a hit: thighs and torso this far into a sofa's cushion sitting, anything this far into a lounger lying — a hand laid on it (armsFor) presses further — cm. Never a loose pillow. */
        OWN_SEAT: { sit: 5.0, lie: 3.0, hand: 4.0 },
        /** A drink's hand is away from the mouth this far off, cm; nearer, it is at the sip. */
        AWAY: 35,
        /** Away, a drink leans no more than People.js's UPRIGHT, degrees; at the sip a glass or a cup no more than SIP_GLASS, a bottle SIP. Half a degree's grace. */
        UPRIGHT: 16.5,
        SIP_GLASS: 65.5,
        SIP: 130.5,
        /** A drink this far under the head's skin, cm, is in the face (a bottle at the lips passed 0–1.6; 3.7 and more failed). */
        IN_FACE: 2.0,
        /** A clip of drinking brings its drink this near the lips, cm (the bottle stopped 0.3–1.7 short). */
        SIP_GAP: 4.0,
        /** Standing, off the middle of one's group-mates, degrees: the planner turns each up to 12 off it; 18 passed after a hand edit. */
        FACING: 25,
        /** The nearest thing to someone standing, m from their upright: the planner's MARGIN (0.4) less rounding; 0.47 was the least. */
        CLEAR: 0.38,
        /** Any two people nearer than this, m, stand or sit in each other. */
        APART: 0.55,
        /** Lying, a wrist this far past the cushion's edge, cm, hangs off the lounger (hands under the head apart). */
        WRIST_OUT: 0,
    };
    /** A loose pillow: a mesh of a piece covering under half its footprint, of one of these materials (this catalogue's cloth names). */
    const PILLOW = /cushion|fabric|canvas|linen|weave|velvet|boucle|wool|cotton/i;
    /** Planting that is no obstacle, by its mesh's name (World/Vegetation.js's). */
    const GROUND_COVER = /^(lawn|meadow|hedges|tree-far)/;
    /** A mesh of more triangles than this, all its instances counted, is left out. */
    const MOST = 400000;
    /** A piece no taller than this is a rug: walked on (shared/people.js's FLAT). */
    const FLAT = 0.035;
    const DRINKING = /drink|sip/i;

    const V3 = e.camera.activeCamera.position.constructor;
    const Raycaster = e.camera.cameraRay.constructor;
    const canon = (name) => String(name ?? "").replace(/^.*mixamorig\d*[:_]?/i, "");
    const cm = (v) => (v == null || !Number.isFinite(v) ? null : +(v * 100).toFixed(1));
    const deg = (r) => (r * 180) / Math.PI;
    const range = (list) => {
        const finite = list.filter((v) => v != null && Number.isFinite(v));
        return finite.length ? [Math.min(...finite), Math.max(...finite)] : null;
    };
    const quantile = (list, q) => {
        if (!list.length) return null;
        const s = [...list].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor(s.length * q))];
    };
    const yieldNow = () =>
        new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = resolve;
            channel.port2.postMessage(0);
        });

    // ------------------------------------------------------------------ what is round them
    /** Every mesh drawn of the space: { o, b (its box in the world), tris, piece (the furniture it is of), label, pillow, floor }. */
    let targets = [];
    function rescan() {
        sb.root.updateMatrixWorld(true);
        const pieceOf = new Map();
        for (const [id, f] of sb.furniture) f.group.traverse((o) => pieceOf.set(o, id));
        const catalogOf = new Map((w.spec.furniture ?? []).map((f) => [f.id, f.catalog_id]));
        const shown = (o) => {
            for (let n = o; n; n = n.parent) if (n.visible === false) return false;
            const material = [].concat(o.material)[0];
            return !(material && (material.visible === false || material.colorWrite === false));
        };
        targets = [];
        const add = (o, tag) => {
            if (!o.isMesh || o.isSkinnedMesh || o.isBatchedMesh || !shown(o)) return;
            const g = o.geometry;
            const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
            if (!tris || tris > MOST) return;
            let box;
            if (o.isInstancedMesh) {
                o.computeBoundingBox();
                box = o.boundingBox.clone().applyMatrix4(o.matrixWorld);
            } else {
                if (!g.boundingBox) g.computeBoundingBox();
                box = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
            }
            const piece = pieceOf.get(o) ?? null;
            const names = [];
            for (let n = o; n && n !== sb.root; n = n.parent) if (n.name) names.unshift(n.name);
            const label = tag ?? (piece ? `${piece}(${catalogOf.get(piece)})${o.name.replace(/^.*(_\d+)$/, "$1")}` : names.slice(0, 3).join("/"));
            targets.push({ o, b: box, tris, piece, label, pillow: false, floor: !piece && names.some((n) => /^floor:/.test(n)) });
        };
        sb.root.traverse((o) => add(o, null));
        // Per piece: a rug is floor; a small cloth mesh on a larger piece is a loose pillow.
        const byPiece = new Map();
        for (const t of targets) if (t.piece) byPiece.set(t.piece, [...(byPiece.get(t.piece) ?? []), t]);
        for (const list of byPiece.values()) {
            const x0 = Math.min(...list.map((t) => t.b.min.x));
            const x1 = Math.max(...list.map((t) => t.b.max.x));
            const z0 = Math.min(...list.map((t) => t.b.min.z));
            const z1 = Math.max(...list.map((t) => t.b.max.z));
            const tall = Math.max(...list.map((t) => t.b.max.y)) - Math.min(...list.map((t) => t.b.min.y));
            for (const t of list) {
                if (tall < FLAT) t.floor = true;
                const area = (t.b.max.x - t.b.min.x) * (t.b.max.z - t.b.min.z);
                const material = [].concat(t.o.material)[0]?.name ?? "";
                if (list.length > 1 && area < 0.5 * (x1 - x0) * (z1 - z0) && PILLOW.test(material)) {
                    t.pillow = true;
                    t.label += "~pillow";
                }
            }
        }
        // Of the planting: a hedge's solid core, and whatever stands up in clumps — planters' and beds' grasses, trees — but not
        // what is walked on or brushed past (lawn, meadow, a hedge's leaves).
        const flora = e.scene.getObjectByName("flora");
        flora?.updateMatrixWorld(true);
        flora?.traverse((o) => {
            if (o.name === "hedge-cores") add(o, "hedge");
            else if (o.isInstancedMesh && !GROUND_COVER.test(o.name)) add(o, `flora/${o.name}`);
        });
        return targets.length;
    }
    const nearOf = (c, r) => targets.filter((t) => t.b.min.x < c.x + r && t.b.max.x > c.x - r && t.b.min.y < c.y + r && t.b.max.y > c.y - r && t.b.min.z < c.z + r && t.b.max.z > c.z - r);
    const piecesOf = (id) => targets.filter((t) => t.piece === id);
    /**
     * A mesh's triangles in the world, in a grid of cells: an audit casts some
     * 3,000 short rays a phase at whatever a person sits on, and three's own
     * raycast tries every triangle for each (a corner sofa's 11,000: 18 s a
     * sitter; this way under one). Sided as three's is: a material's front
     * faces only, both for a double-sided one, the winding turned for a
     * mirrored mesh; an instanced mesh's instances all in one. Built when a
     * ray first comes near, kept until the mesh moves.
     */
    const soups = new WeakMap();
    function soupOf(t) {
        const o = t.o;
        const key = o.matrixWorld.elements.join();
        let soup = soups.get(o);
        if (soup?.key === key) return soup;
        const g = o.geometry;
        const position = g.attributes.position;
        const index = g.index;
        const each = Math.floor((index ? index.count : position.count) / 3);
        const instances = o.isInstancedMesh ? o.count : 1;
        const n = each * instances;
        const flat = new Float32Array(n * 9);
        // 0 the front only, 1 both, 2 the back only (three's FrontSide 0, BackSide 1, DoubleSide 2).
        const sideOf = (material) => (material?.side === 2 ? 1 : material?.side === 1 ? 2 : 0);
        const sides = new Uint8Array(n).fill(sideOf([].concat(o.material)[0]));
        if (Array.isArray(o.material)) for (const group of g.groups) sides.fill(sideOf(o.material[group.materialIndex]), Math.floor(group.start / 3), Math.min(each, Math.floor((group.start + group.count) / 3)));
        const matrix = o.matrixWorld.clone();
        const v = new V3();
        for (let instance = 0; instance < instances; instance++) {
            if (o.isInstancedMesh) {
                o.getMatrixAt(instance, matrix);
                matrix.premultiply(o.matrixWorld);
                sides.copyWithin(instance * each, 0, each);
            }
            const mirrored = matrix.determinant() < 0;
            for (let i = 0; i < each; i++) {
                const f = (instance * each + i) * 9;
                for (let k = 0; k < 3; k++) {
                    const corner = i * 3 + (mirrored && k ? 3 - k : k);
                    v.fromBufferAttribute(position, index ? index.getX(corner) : corner).applyMatrix4(matrix);
                    flat[f + k * 3] = v.x;
                    flat[f + k * 3 + 1] = v.y;
                    flat[f + k * 3 + 2] = v.z;
                }
            }
        }
        // Cells of 8 cm, doubled until there are no more than four a triangle.
        const { min, max } = t.b;
        let cell = 0.08;
        const count = (axis) => Math.max(1, Math.ceil((max[axis] - min[axis]) / cell));
        while (count("x") * count("y") * count("z") > Math.max(64, 4 * n)) cell *= 2;
        const [nx, ny, nz] = [count("x"), count("y"), count("z")];
        const cells = new Array(nx * ny * nz);
        const at = (value, low, most) => Math.max(0, Math.min(most - 1, Math.floor((value - low) / cell)));
        for (let i = 0; i < n; i++) {
            const f = i * 9;
            const x0 = at(Math.min(flat[f], flat[f + 3], flat[f + 6]), min.x, nx);
            const x1 = at(Math.max(flat[f], flat[f + 3], flat[f + 6]), min.x, nx);
            const y0 = at(Math.min(flat[f + 1], flat[f + 4], flat[f + 7]), min.y, ny);
            const y1 = at(Math.max(flat[f + 1], flat[f + 4], flat[f + 7]), min.y, ny);
            const z0 = at(Math.min(flat[f + 2], flat[f + 5], flat[f + 8]), min.z, nz);
            const z1 = at(Math.max(flat[f + 2], flat[f + 5], flat[f + 8]), min.z, nz);
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) (cells[(x * ny + y) * nz + z] ??= []).push(i);
        }
        soup = { key, flat, sides, cells, cell, nx, ny, nz, at };
        soups.set(o, soup);
        return soup;
    }
    /** The first hit of the segment a → b on `list`: { distance, point, ny (how level the face is: |its normal's y|), t (its target) }; null if none. */
    function cast(a, b, list) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dy, dz);
        if (length < 1e-6) return null;
        const [ux, uy, uz] = [dx / length, dy / length, dz / length];
        const [lx, hx, ly, hy, lz, hz] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y), Math.min(a.z, b.z), Math.max(a.z, b.z)];
        let best = length;
        let hit = null;
        for (const t of list) {
            const { min, max } = t.b;
            if (min.x > hx || max.x < lx || min.y > hy || max.y < ly || min.z > hz || max.z < lz) continue;
            const { flat, sides, cells, nx, ny, nz, at } = soupOf(t);
            const [x0, x1, y0, y1, z0, z1] = [at(lx, min.x, nx), at(hx, min.x, nx), at(ly, min.y, ny), at(hy, min.y, ny), at(lz, min.z, nz), at(hz, min.z, nz)];
            for (let x = x0; x <= x1; x++) {
                for (let y = y0; y <= y1; y++) {
                    for (let z = z0; z <= z1; z++) {
                        const inside = cells[(x * ny + y) * nz + z];
                        if (!inside) continue;
                        for (const i of inside) {
                            // Möller–Trumbore; det > 0 is the front.
                            const f = i * 9;
                            const e1x = flat[f + 3] - flat[f];
                            const e1y = flat[f + 4] - flat[f + 1];
                            const e1z = flat[f + 5] - flat[f + 2];
                            const e2x = flat[f + 6] - flat[f];
                            const e2y = flat[f + 7] - flat[f + 1];
                            const e2z = flat[f + 8] - flat[f + 2];
                            const px = uy * e2z - uz * e2y;
                            const py = uz * e2x - ux * e2z;
                            const pz = ux * e2y - uy * e2x;
                            const det = e1x * px + e1y * py + e1z * pz;
                            if (sides[i] === 0 ? det < 1e-12 : sides[i] === 2 ? det > -1e-12 : det > -1e-12 && det < 1e-12) continue;
                            const inv = 1 / det;
                            const tx = a.x - flat[f];
                            const ty = a.y - flat[f + 1];
                            const tz = a.z - flat[f + 2];
                            const u = (tx * px + ty * py + tz * pz) * inv;
                            if (u < 0 || u > 1) continue;
                            const qx = ty * e1z - tz * e1y;
                            const qy = tz * e1x - tx * e1z;
                            const qz = tx * e1y - ty * e1x;
                            const s = (ux * qx + uy * qy + uz * qz) * inv;
                            if (s < 0 || u + s > 1) continue;
                            const distance = (e2x * qx + e2y * qy + e2z * qz) * inv;
                            if (distance < 0 || distance > best) continue;
                            best = distance;
                            const [mx, my, mz] = [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
                            hit = { t, ny: Math.abs(my) / (Math.hypot(mx, my, mz) || 1) };
                        }
                    }
                }
            }
        }
        if (!hit) return null;
        hit.distance = best;
        hit.point = new V3(a.x + ux * best, a.y + uy * best, a.z + uz * best);
        return hit;
    }

    // ------------------------------------------------------------------ a person, posed
    const boneNode = (p, name) => {
        const own = p.character.boneNames.get(name);
        return own ? p.model.getObjectByName(own) : null;
    };
    const bone = (p, name) => boneNode(p, name)?.getWorldPosition(new V3()) ?? null;
    const seatPiece = (p) => p.entry.seat?.furniture ?? null;
    const facingOf = (p) => new V3(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));
    const picks = new Map();
    /** Where the skin weighted mostly to bones matching `re` is now, in the world: [x, y, z, …], no more than `most` points, evenly taken. */
    function skin(p, re, most = 400) {
        p.group.updateMatrixWorld(true);
        const key = `${p.character.id}|${re.source}|${most}`;
        let pick = picks.get(key);
        if (!pick) {
            const all = [];
            p.meshes.forEach((mesh, at) => {
                const { skinIndex, skinWeight } = mesh.geometry.attributes;
                if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
                const wanted = mesh.skeleton.bones.map((b) => re.test(canon(b.name)));
                if (!wanted.includes(true)) return;
                for (let i = 0; i < skinIndex.count; i++) {
                    let weight = 0;
                    for (let k = 0; k < 4; k++) if (wanted[skinIndex.getComponent(i, k)]) weight += skinWeight.getComponent(i, k);
                    if (weight > 0.6) all.push(at, i);
                }
            });
            const step = Math.max(1, Math.ceil(all.length / 2 / most));
            pick = [];
            for (let i = 0; i < all.length; i += 2 * step) pick.push(all[i], all[i + 1]);
            picks.set(key, pick);
        }
        const out = new Float32Array((pick.length / 2) * 3);
        const v = new V3();
        for (let i = 0, j = 0; i < pick.length; i += 2) {
            const mesh = p.meshes[pick[i]];
            mesh.getVertexPosition(pick[i + 1], v).applyMatrix4(mesh.matrixWorld);
            out[j++] = v.x;
            out[j++] = v.y;
            out[j++] = v.z;
        }
        return out;
    }
    /**
     * A person's clip at time t, finished as the app finishes it: by People.tick
     * with the camera on them and the person shown, however the quality step
     * or a filter has them. False if the tick did not pose them.
     */
    function poseAt(p, t) {
        const camera = e.camera.activeCamera;
        const c = p.sphere.center;
        camera.position.set(c.x + 2.2, c.y + 1.0, c.z + 2.2);
        camera.lookAt(c.x, c.y, c.z);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        const shown = [P.root.visible, p.group.visible];
        P.root.visible = true;
        p.group.visible = true;
        if (p.action) p.action.time = t;
        // With no clip there is nothing to pose.
        let posed = !p.action;
        for (let i = 0; i < 10 && !posed; i++) {
            p.pending = 1e-9;
            P.tick(0);
            posed = p.pending === 0;
        }
        [P.root.visible, p.group.visible] = shown;
        p.group.updateMatrixWorld(true);
        return posed;
    }
    /** `n` points through a person's clip, in seconds; the one it is at, for a still pose. */
    function times(p, n) {
        const duration = p.clip?.duration ?? 0;
        if (!(duration > 0.1) || p.clipEntry?.still) return [p.action?.time ?? 0];
        return Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * duration);
    }
    /** Everyone drawn posed again where their clip is (after the camera has moved, before a frame). */
    function refresh() {
        for (const p of P.people.values()) p.pending = 1e-9;
        P.tick(0);
    }
    const keptCamera = () => {
        const camera = e.camera.activeCamera;
        const kept = [camera.position.clone(), camera.quaternion.clone(), camera.fov];
        return () => {
            camera.position.copy(kept[0]);
            camera.quaternion.copy(kept[1]);
            camera.fov = kept[2];
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld(true);
        };
    };

    // ------------------------------------------------------------------ measures
    const LIMBS = [
        ["L upper arm", "LeftArm", "LeftForeArm", /^LeftArm$/],
        ["L forearm", "LeftForeArm", "LeftHand", /^LeftForeArm$/],
        ["L hand", "LeftHand", "LeftHandMiddle3", /^LeftHand/],
        ["R upper arm", "RightArm", "RightForeArm", /^RightArm$/],
        ["R forearm", "RightForeArm", "RightHand", /^RightForeArm$/],
        ["R hand", "RightHand", "RightHandMiddle3", /^RightHand/],
        ["L thigh", "LeftUpLeg", "LeftLeg", /^LeftUpLeg$/],
        ["L shin", "LeftLeg", "LeftFoot", /^LeftLeg$/],
        ["L foot", "LeftFoot", "LeftToeBase", /^Left(Foot|ToeBase|Toe_End)$/],
        ["R thigh", "RightUpLeg", "RightLeg", /^RightUpLeg$/],
        ["R shin", "RightLeg", "RightFoot", /^RightLeg$/],
        ["R foot", "RightFoot", "RightToeBase", /^Right(Foot|ToeBase|Toe_End)$/],
        ["torso", "Hips", "Spine2", /^(Hips|Spine|Spine1|Spine2)$/],
        ["head", "Neck", "HeadTop_End", /^(Neck|Head)$/],
    ];
    /**
     * How far each limb's skin is inside what is round it, as posed now:
     * { "<limb> > <label>": { m, points, bone, t } } — a ray down the limb's
     * bone both ways, and one from the bone's line out to each of ~`most`
     * points of its skin. Floors and rugs are left out: the soles measure those.
     */
    function limbs(p, most = 110) {
        const list = nearOf(p.sphere.center, p.sphere.radius + 0.2).filter((t) => !t.floor);
        const out = {};
        const note = (limb, t, depth, boneHit) => {
            const row = (out[`${limb} > ${t.label}`] ??= { limb, t, m: 0, points: 0, bone: false });
            row.m = Math.max(row.m, depth);
            row.points++;
            if (boneHit) row.bone = true;
        };
        const q = new V3();
        const v = new V3();
        for (const [limb, from, to, re] of LIMBS) {
            const A = bone(p, from);
            const B = bone(p, to) ?? bone(p, to.replace("Middle3", "Middle1"));
            if (!A || !B) continue;
            const length = A.distanceTo(B);
            // The bone's own line through something: the lesser of what lies past the hit, either way along it.
            const there = cast(A, B, list);
            const back = cast(B, A, list);
            if (there && back) note(limb, there.t, Math.min(length - there.distance, length - back.distance), true);
            else if (there) note(limb, there.t, length - there.distance, true);
            else if (back) note(limb, back.t, length - back.distance, true);
            const points = skin(p, re, most);
            const along = B.clone().sub(A);
            const squared = along.lengthSq() || 1;
            for (let i = 0; i < points.length; i += 3) {
                v.set(points[i], points[i + 1], points[i + 2]);
                const s = Math.max(0, Math.min(1, v.clone().sub(A).dot(along) / squared));
                q.copy(A).addScaledVector(along, s);
                const hit = cast(q, v, list);
                if (hit) note(limb, hit.t, q.distanceTo(v) - hit.distance, false);
            }
        }
        return out;
    }
    /** Each foot's lowest skin, and what is under it: the first thing a ray down from the ankle meets, the piece sat on left out. */
    function feet(p) {
        const list = nearOf(p.sphere.center, p.sphere.radius + 0.6).filter((t) => !t.piece || t.piece !== seatPiece(p));
        const out = {};
        for (const side of ["Left", "Right"]) {
            const points = skin(p, new RegExp(`^${side}(Foot|ToeBase|Toe_End)$`), 500);
            let low = Infinity;
            let x = 0;
            let z = 0;
            for (let i = 0; i < points.length; i += 3) {
                if (points[i + 1] < low) {
                    low = points[i + 1];
                    x = points[i];
                    z = points[i + 2];
                }
            }
            const ankle = bone(p, `${side}Foot`);
            const hit = Number.isFinite(low) ? cast(new V3(x, Math.max(ankle?.y ?? low + 0.1, low + 0.08), z), new V3(x, low - 0.6, z), list) : null;
            out[side] = { gap: hit ? low - hit.point.y : null, on: hit ? hit.t.label : null };
        }
        return out;
    }
    /**
     * The skin matching `re` over the meshes of `list`, by a ray down through
     * each point: { n, off (the share with nothing under it), min, p5, med }
     * in metres, − under the surface (across it, where it slopes).
     */
    function gaps(p, re, list, { most = 300, filter = null, up = 0.4, down = 0.6 } = {}) {
        const points = skin(p, re, most);
        const over = [];
        let off = 0;
        let n = 0;
        const a = new V3();
        const b = new V3();
        for (let i = 0; i < points.length; i += 3) {
            if (filter && !filter(points[i], points[i + 1], points[i + 2])) continue;
            n++;
            a.set(points[i], points[i + 1] + up, points[i + 2]);
            b.set(points[i], points[i + 1] - down, points[i + 2]);
            const hit = cast(a, b, list);
            if (!hit) {
                off++;
                continue;
            }
            over.push((points[i + 1] - hit.point.y) * hit.ny);
        }
        return { n, off: n ? off / n : null, min: quantile(over, 0), p5: quantile(over, 0.05), med: quantile(over, 0.5) };
    }
    /** Sitting: how far the skin of the shins and feet is behind the front of the piece sat on, by level rays in from before them. */
    function legsIn(p) {
        const own = piecesOf(seatPiece(p));
        const forward = facingOf(p);
        const out = {};
        const a = new V3();
        const b = new V3();
        for (const [name, re] of [["L shin", /^LeftLeg$/], ["R shin", /^RightLeg$/], ["L foot", /^Left(Foot|ToeBase|Toe_End)$/], ["R foot", /^Right(Foot|ToeBase|Toe_End)$/]]) {
            const points = skin(p, re, 400);
            let deep = 0;
            let n = 0;
            let into = null;
            for (let i = 0; i < points.length; i += 3) {
                b.set(points[i], points[i + 1], points[i + 2]);
                a.copy(b).addScaledVector(forward, 0.6);
                const hit = cast(a, b, own);
                if (!hit) continue;
                const d = 0.6 - hit.distance;
                if (d > 0.003) n++;
                if (d > deep) {
                    deep = d;
                    into = hit.t.label;
                }
            }
            out[name] = { m: deep, points: n, into };
        }
        return out;
    }
    const placementOf = (p) => (w.spec.furniture ?? []).find((f) => f.id === seatPiece(p)) ?? null;

    function standing(p, all) {
        const f = feet(p);
        const soles = [f.Left.gap, f.Right.gap].filter((v) => v != null);
        const mates = all.filter((o) => o !== p && o.entry.group && o.entry.group === p.entry.group);
        const [x, y, z] = p.entry.position;
        let facing = null;
        if (mates.length) {
            const mx = mates.reduce((sum, o) => sum + o.entry.position[0], 0) / mates.length;
            const mz = mates.reduce((sum, o) => sum + o.entry.position[2], 0) / mates.length;
            facing = deg(Math.acos(Math.max(-1, Math.min(1, new V3(mx - x, 0, mz - z).normalize().dot(facingOf(p))))));
        }
        // The nearest thing to their upright: level rays at four heights.
        const list = nearOf(new V3(x, y + 0.9, z), 1.6).filter((t) => !t.floor);
        let clear = Infinity;
        let what = null;
        const a = new V3();
        const b = new V3();
        for (const height of [0.25, 0.6, 1.0, 1.4]) {
            for (let k = 0; k < 24; k++) {
                const turn = (k / 24) * Math.PI * 2;
                a.set(x, y + height, z);
                b.set(x + Math.sin(turn) * 1.3, y + height, z + Math.cos(turn) * 1.3);
                const hit = cast(a, b, list);
                if (hit && hit.distance < clear) {
                    clear = hit.distance;
                    what = hit.t.label;
                }
            }
        }
        return { sole: soles.length ? Math.min(...soles) : null, on: f.Left.on ?? f.Right.on, facing, clear: Number.isFinite(clear) ? clear : null, what };
    }
    function sitting(p) {
        const own = piecesOf(seatPiece(p)).filter((t) => !t.pillow);
        const pelvis = bone(p, "Hips");
        const f = feet(p);
        const placement = placementOf(p);
        const seat = P.seatData?.[placement?.catalog_id]?.seats?.[p.entry.seat?.index];
        const plane = seat ? placement.position[1] + seat.height * (placement.scale ?? 1) : null;
        const underPelvis = (x, y, z) => Math.hypot(x - pelvis.x, z - pelvis.z) < 0.2 && y < pelvis.y;
        const under = skin(p, /^(Hips|LeftUpLeg|RightUpLeg)$/, 900);
        const heights = [];
        for (let i = 0; i < under.length; i += 3) if (underPelvis(under[i], under[i + 1], under[i + 2])) heights.push(under[i + 1]);
        // The gap behind the back's skin, the way they face.
        const forward = facingOf(p);
        const points = skin(p, /^(Spine1|Spine2)$/, 300);
        const behind = [];
        const a = new V3();
        const b = new V3();
        for (let i = 0; i < points.length; i += 3) {
            a.set(points[i], points[i + 1], points[i + 2]).addScaledVector(forward, 0.3);
            b.set(points[i], points[i + 1], points[i + 2]).addScaledVector(forward, -0.6);
            const hit = cast(a, b, own);
            if (hit) behind.push(hit.distance - 0.3);
        }
        return {
            L: f.Left.gap,
            R: f.Right.gap,
            lower: [f.Left.gap, f.Right.gap].some((v) => v != null) ? Math.min(...[f.Left.gap, f.Right.gap].filter((v) => v != null)) : null,
            on: f.Left.on ?? f.Right.on,
            seat: gaps(p, /^(Hips|LeftUpLeg|RightUpLeg)$/, own, { most: 900, filter: underPelvis, up: 0.25, down: 0.5 }).min,
            plane: plane == null || !heights.length ? null : quantile(heights, 0.01) - plane,
            back: quantile(behind, 0),
            legs: legsIn(p),
            kind: P.seatData?.[placement?.catalog_id]?.kind ?? null,
            base: seat?.base ?? null,
            give: plane == null ? null : plane - p.entry.position[1],
        };
    }
    function lying(p) {
        const own = piecesOf(seatPiece(p));
        const pelvis = bone(p, "Hips");
        const G = (re, options) => gaps(p, re, own, options).min;
        // From the lounger's midline: across the way seats.json's lying point looks to its head.
        const placement = placementOf(p);
        const lie = P.seatData?.[placement?.catalog_id]?.lie;
        let wrists = null;
        if (lie) {
            const turn = ((placement.rotation ?? 0) * Math.PI) / 180;
            const lx = lie.head[0] - lie.at[0];
            const lz = lie.head[1] - lie.at[1];
            const along = new V3(lx * Math.cos(turn) + lz * Math.sin(turn), 0, -lx * Math.sin(turn) + lz * Math.cos(turn)).normalize();
            const across = new V3(along.z, 0, -along.x);
            const out = (name) => {
                const at = bone(p, name);
                return at ? Math.abs((at.x - p.entry.position[0]) * across.x + (at.z - p.entry.position[2]) * across.z) : null;
            };
            wrists = { L: out("LeftHand"), R: out("RightHand"), half: Number.isFinite(lie.width) ? (lie.width * (placement.scale ?? 1)) / 2 : null };
        }
        return {
            hips: G(/^(Hips|LeftUpLeg|RightUpLeg)$/, { most: 700, filter: (x, y, z) => Math.hypot(x - pelvis.x, z - pelvis.z) < 0.22 }),
            back: G(/^(Spine1|Spine2|LeftShoulder|RightShoulder)$/, { most: 500 }),
            head: G(/^(Head)$/, { most: 600 }),
            calves: G(/^(LeftLeg|RightLeg)$/),
            heels: G(/^(LeftFoot|RightFoot)$/),
            handL: G(/^LeftHand/),
            handR: G(/^RightHand/),
            wrists,
        };
    }

    // ------------------------------------------------------------------ drinks
    const headCache = new Map();
    /** The triangles of a person's head (all three corners weighted to Head or Neck), as posed now, in the world. */
    function headMesh(p) {
        p.group.updateMatrixWorld(true);
        let cached = headCache.get(p.character.id);
        if (!cached) {
            cached = [];
            p.meshes.forEach((mesh, at) => {
                const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
                if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
                const wanted = mesh.skeleton.bones.map((b) => /^(Head|Neck)$/.test(canon(b.name)));
                if (!wanted.includes(true)) return;
                const on = new Uint8Array(position.count);
                for (let i = 0; i < position.count; i++) {
                    let weight = 0;
                    for (let k = 0; k < 4; k++) if (wanted[skinIndex.getComponent(i, k)]) weight += skinWeight.getComponent(i, k);
                    on[i] = weight > 0.5 ? 1 : 0;
                }
                const index = mesh.geometry.index;
                const n = index ? index.count : position.count;
                const corners = [];
                for (let i = 0; i + 2 < n; i += 3) {
                    const [a, b, c] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
                    if (on[a] && on[b] && on[c]) corners.push(a, b, c);
                }
                if (corners.length) cached.push({ at, corners });
            });
            headCache.set(p.character.id, cached);
        }
        const parts = [];
        const v = new V3();
        for (const { at, corners } of cached) {
            const mesh = p.meshes[at];
            const memo = new Map();
            const flat = new Float32Array(corners.length * 3);
            for (let i = 0; i < corners.length; i++) {
                let q = memo.get(corners[i]);
                if (!q) {
                    mesh.getVertexPosition(corners[i], v).applyMatrix4(mesh.matrixWorld);
                    q = [v.x, v.y, v.z];
                    memo.set(corners[i], q);
                }
                flat.set(q, i * 3);
            }
            parts.push(flat);
        }
        const joint = bone(p, "Head");
        const top = bone(p, "HeadTop_End") ?? joint.clone().add(new V3(0, 0.18, 0));
        return { parts, centre: joint.clone().lerp(top, 0.45) };
    }
    /** How far under the head's skin a point is, in metres (0 outside): from the head's middle out through it, the furthest skin beyond it. */
    function inHead(head, q) {
        const c = head.centre;
        let dx = q.x - c.x;
        let dy = q.y - c.y;
        let dz = q.z - c.z;
        const r = Math.hypot(dx, dy, dz);
        if (r > 0.22 || r < 1e-5) return 0;
        dx /= r;
        dy /= r;
        dz /= r;
        let best = -1;
        for (const flat of head.parts) {
            // Möller–Trumbore, the furthest crossing past the point.
            for (let i = 0; i < flat.length; i += 9) {
                const ax = flat[i];
                const ay = flat[i + 1];
                const az = flat[i + 2];
                const e1x = flat[i + 3] - ax;
                const e1y = flat[i + 4] - ay;
                const e1z = flat[i + 5] - az;
                const e2x = flat[i + 6] - ax;
                const e2y = flat[i + 7] - ay;
                const e2z = flat[i + 8] - az;
                const px = dy * e2z - dz * e2y;
                const py = dz * e2x - dx * e2z;
                const pz = dx * e2y - dy * e2x;
                const det = e1x * px + e1y * py + e1z * pz;
                if (det > -1e-12 && det < 1e-12) continue;
                const inv = 1 / det;
                const tx = c.x - ax;
                const ty = c.y - ay;
                const tz = c.z - az;
                const u = (tx * px + ty * py + tz * pz) * inv;
                if (u < 0 || u > 1) continue;
                const qx = ty * e1z - tz * e1y;
                const qy = tz * e1x - tx * e1z;
                const qz = tx * e1y - ty * e1x;
                const s = (dx * qx + dy * qy + dz * qz) * inv;
                if (s < 0 || u + s > 1) continue;
                const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
                if (t > r + 0.0005 && t <= r + 0.25 && t > best) best = t;
            }
        }
        return best > 0 ? best - r : 0;
    }
    function propPoints(object, most = 250) {
        const out = [];
        const v = new V3();
        object.updateWorldMatrix(true, true);
        object.traverse((o) => {
            if (!o.isMesh) return;
            const position = o.geometry.attributes.position;
            const step = Math.max(1, Math.ceil(position.count / most));
            for (let i = 0; i < position.count; i += step) out.push(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld).clone());
        });
        return out;
    }
    /** A held drink through its clip, `n` points of it: how it leans, away from the mouth and at it, how near the lips it comes, how far into the face. */
    function drink(p, n = 24) {
        if (!p.held) return null;
        const head = boneNode(p, "Head");
        const rows = [];
        for (const t of times(p, n)) {
            poseAt(p, t);
            const up = new V3(0, 1, 0).transformDirection(p.held.holder.matrixWorld);
            const tilt = deg(Math.acos(Math.max(-1, Math.min(1, up.y))));
            const grip = p.held.holder.getWorldPosition(new V3());
            const mouth = p.held.mouth && head ? head.localToWorld(p.held.mouth.clone()) : null;
            const joint = bone(p, "Head");
            const points = propPoints(p.held.holder);
            const shell = joint && points.some((q) => q.distanceTo(joint) < 0.3) ? headMesh(p) : null;
            let deep = 0;
            let lips = Infinity;
            for (const q of points) {
                if (mouth) lips = Math.min(lips, q.distanceTo(mouth));
                if (shell) deep = Math.max(deep, inHead(shell, q));
            }
            rows.push({ t, tilt, away: mouth ? grip.distanceTo(mouth) : Infinity, lips, deep });
        }
        const far = rows.filter((r) => r.away * 100 > TOL.AWAY);
        const near = rows.filter((r) => r.away * 100 <= TOL.AWAY);
        const most = (list, key) => (list.length ? Math.max(...list.map((r) => r[key])) : null);
        const sip = rows.reduce((a, r) => (r.away < a.away ? r : a), rows[0]);
        return {
            prop: p.prop?.name?.replace(/^held:/, "") ?? p.entry.prop,
            bottle: p.held.bottle,
            hand: p.clipEntry?.hand ?? null,
            tiltAway: far.length ? +most(far, "tilt").toFixed(1) : null,
            tiltSip: near.length ? +most(near, "tilt").toFixed(1) : null,
            lips: cm(Math.min(...rows.map((r) => r.lips))),
            inFace: cm(most(rows, "deep")),
            sipAt: +sip.t.toFixed(2),
        };
    }

    // ------------------------------------------------------------------ the audit
    const span = (list) => {
        const r = range(list);
        return r ? [cm(r[0]), cm(r[1])] : null;
    };
    function auditOne(p, all, phases) {
        const entry = p.entry;
        const row = { id: entry.id, character: entry.character, pose: entry.pose, clip: entry.clip ?? null, prop: entry.prop ?? null, group: entry.group ?? null, seat: entry.seat ? `${entry.seat.furniture}#${entry.seat.index}` : null };
        const flags = [];
        // As the app drew them, where that is not what the spec says.
        const drawnProp = p.prop?.name?.replace(/^(held|worn|laid):/, "") ?? null;
        const drawn = {};
        if (p.character.id !== entry.character) drawn.character = p.character.id;
        if ((p.clipEntry?.name ?? null) !== (entry.clip ?? null) && entry.clip) drawn.clip = p.clipEntry?.name ?? null;
        if (drawnProp !== (entry.prop ?? null)) drawn.prop = drawnProp;
        if (Object.keys(drawn).length) row.drawn = drawn;
        if ("character" in drawn) flags.push(`character ${entry.character} is not in the index: drawn as ${drawn.character}`);
        if ("clip" in drawn) flags.push(`clip "${entry.clip}" is not in the index: plays ${drawn.clip ?? "nothing"}`);
        if ("prop" in drawn) {
            if (drawn.prop === null) flags.push(`prop ${entry.prop} is not drawn (${p.clipEntry?.hand === false ? `${p.clipEntry.name} has no hand to hold it` : "nothing to hold, wear or lay it by"})`);
            else flags.push(`prop ${entry.prop} is drawn as ${drawn.prop}${DRINKING.test(p.clipEntry?.name ?? "") ? `: ${p.clipEntry.name} drinks from a bottle` : ""}`);
        }

        const start = p.action?.time ?? 0;
        // A still pose breathes (People.js's breathe turns the chest, and hands under a head with it): measured breathed in, breathed out
        // and between, not wherever its breath happens to be — a hand read 0 or 5 cm into a cushion from one run to the next.
        const breathStart = p.breath?.time;
        const breaths = p.breath ? [0.25, 0.75, 0].map((share) => share / p.breath.pace) : [null];
        const hits = {};
        const per = [];
        let posed = true;
        for (const t of times(p, phases)) {
            for (const breath of breaths) {
                if (breath !== null) p.breath.time = breath;
                posed = poseAt(p, t) && posed;
                for (const [key, hit] of Object.entries(limbs(p))) {
                    const kept = (hits[key] ??= { ...hit, m: 0, points: 0 });
                    kept.m = Math.max(kept.m, hit.m);
                    kept.points = Math.max(kept.points, hit.points);
                    kept.bone = kept.bone || hit.bone;
                }
                per.push(entry.pose === "sit" ? sitting(p) : entry.pose === "lie" ? lying(p) : standing(p, all));
            }
        }
        if (p.breath) p.breath.time = breathStart;
        if (!posed) flags.push("not posed by People.tick (hidden, or out of the quality step's reach): measured as it stood");

        // Hits: all but resting in their own seat.
        const own = seatPiece(p);
        row.hits = Object.values(hits)
            .filter((hit) => {
                const depth = hit.m * 100;
                if (hit.t.piece && hit.t.piece === own && !hit.bone && !hit.t.pillow) {
                    if (entry.pose === "sit" && (/thigh/.test(hit.limb) || hit.limb === "torso") && depth <= TOL.OWN_SEAT.sit) return false;
                    if (entry.pose === "lie" && depth <= (/hand/.test(hit.limb) ? TOL.OWN_SEAT.hand : TOL.OWN_SEAT.lie)) return false;
                }
                return hit.bone || depth >= TOL.LIMB_IN;
            })
            .sort((a, b) => b.m - a.m)
            .map((hit) => ({ limb: hit.limb, into: own && hit.t.piece === own ? hit.t.label.replace(own, "own seat ") : hit.t.label, cm: cm(hit.m), points: hit.points, bone: hit.bone }));
        for (const hit of row.hits) flags.push(`${hit.limb} ${hit.cm} cm into ${hit.into}${hit.bone ? " (the bone itself)" : ""}`);

        const outside = (value, [low, high]) => value != null && (value < low || value > high);
        if (entry.pose === "stand") {
            const sole = span(per.map((x) => x.sole));
            const clear = Math.min(...per.map((x) => x.clear ?? Infinity));
            row.contact = { sole, on: per[0].on };
            row.facing = per[0].facing == null ? null : Math.round(per[0].facing);
            row.obstacle = Number.isFinite(clear) ? [+clear.toFixed(2), per.reduce((a, x) => ((x.clear ?? Infinity) < (a.clear ?? Infinity) ? x : a), per[0]).what] : null;
            if (!sole) flags.push("nothing under the feet");
            else if (sole[0] < TOL.SOLE[0]) flags.push(`a sole ${-sole[0]} cm into ${per[0].on ?? "the floor"}`);
            else if (sole[1] > TOL.SOLE[1]) flags.push(`both soles ${sole[1]} cm over the floor`);
            if (row.facing != null && row.facing > TOL.FACING) flags.push(`faces ${row.facing}° off the group`);
            if (row.obstacle && row.obstacle[0] < TOL.CLEAR) flags.push(`${row.obstacle[0]} m from ${row.obstacle[1]}`);
        } else if (entry.pose === "sit") {
            const legs = {};
            for (const name of Object.keys(per[0].legs)) {
                const worst = per.reduce((a, x) => (x.legs[name].m > a.m ? x.legs[name] : a), per[0].legs[name]);
                if (worst.m > 0.003) legs[name] = [cm(worst.m), Math.max(...per.map((x) => x.legs[name].points)), worst.into];
            }
            const soles = { L: span(per.map((x) => x.L)), R: span(per.map((x) => x.R)) };
            row.contact = { soles, on: per[0].on, seat: span(per.map((x) => x.seat)), plane: span(per.map((x) => x.plane)), back: span(per.map((x) => x.back)), lift: cm(p.lift), give: cm(per[0].give), kind: per[0].kind, base: per[0].base, legsIn: legs };
            const lower = span(per.map((x) => x.lower));
            if (!lower) flags.push("nothing under the feet");
            else if (lower[0] < TOL.SOLE[0]) flags.push(`a sole ${-lower[0]} cm into ${per[0].on ?? "the floor"}`);
            else if (lower[1] > TOL.SOLE[1]) flags.push(`feet hang: the lower sole ${lower[1]} cm over the floor`);
            const seat = row.contact.seat;
            if (!seat) flags.push("no seat under the pelvis");
            else if (seat[0] < TOL.SEAT[0]) flags.push(`sunk ${-seat[0]} cm into the seat`);
            else if (seat[1] > TOL.SEAT[1]) flags.push(`sits ${seat[1]} cm over the seat`);
            for (const [name, [depth, points, into]] of Object.entries(legs)) if (depth >= TOL.LIMB_IN) flags.push(`${name} ${depth} cm behind the front of ${into} (${points} points of its skin)`);
        } else {
            const part = (key) => span(per.map((x) => x[key]));
            const wrists = per[0].wrists ? { L: cm(Math.max(...per.map((x) => x.wrists.L ?? 0))), R: cm(Math.max(...per.map((x) => x.wrists.R ?? 0))), half: cm(per[0].wrists.half) } : null;
            row.contact = { hips: part("hips"), back: part("back"), head: part("head"), calves: part("calves"), heels: part("heels"), hands: { L: part("handL"), R: part("handR") }, wrists, bend: p.bend ? { lean: +deg(p.bend.lean).toFixed(1), nod: +deg(p.bend.nod).toFixed(1) } : null, arms: p.arms ? p.arms.length : 0, handsUnder: p.info?.handsUnder ?? false };
            for (const [name, key, tolerance] of [["hips", "hips", TOL.REST], ["back", "back", TOL.REST], ["head", "head", TOL.REST], ["heels", "heels", TOL.HEELS]]) {
                const got = row.contact[key];
                if (!got) flags.push(`${name}: nothing of the lounger under them`);
                else if (got[0] < tolerance[0]) flags.push(`${name} ${-got[0]} cm into the lounger`);
                else if (got[0] > tolerance[1]) flags.push(`${name} ${got[0]} cm over the lounger`);
            }
            if (wrists?.half != null && !row.contact.handsUnder) {
                for (const side of ["L", "R"]) if (wrists[side] - wrists.half > TOL.WRIST_OUT) flags.push(`${side} wrist ${wrists[side]} cm from the midline of a cushion ${wrists.half} cm to its edge`);
            }
        }

        if (p.held) {
            const d = (row.drink = drink(p));
            const what = d.bottle ? "bottle" : "glass";
            if (d.tiltAway != null && d.tiltAway > TOL.UPRIGHT) flags.push(`${d.prop} leans ${d.tiltAway}° with the hand away from the mouth`);
            if (d.tiltSip != null && d.tiltSip > (d.bottle ? TOL.SIP : TOL.SIP_GLASS)) flags.push(`${d.prop} (a ${what}) tipped ${d.tiltSip}° at the mouth`);
            if (d.inFace > TOL.IN_FACE) flags.push(`${d.prop} ${d.inFace} cm into the face`);
            if (DRINKING.test(p.clipEntry?.name ?? "") && d.lips != null && d.lips > TOL.SIP_GAP) flags.push(`${p.clipEntry.name}: ${d.prop} comes no nearer the lips than ${d.lips} cm`);
        }
        // Back where their clip was.
        poseAt(p, start);
        row.flags = flags;
        return row;
    }

    const state = (window.__people ??= {});
    state.run = { state: "idle", done: 0, total: 0 };
    async function audit({ phases = 6, ids = null, save = null } = {}) {
        if (state.run.state === "running") throw new Error("an audit is running: poll __people.run");
        const entries = (w.spec.people ?? []).filter((entry) => !ids || ids.includes(entry.id));
        state.run = { state: "running", done: 0, total: entries.length, started: performance.now() };
        const restore = keptCamera();
        try {
            await P.ready;
            rescan();
            const all = [...P.people.values()];
            const rows = [];
            for (const entry of entries) {
                const p = P.get(entry.id);
                rows.push(p ? auditOne(p, all, phases) : { id: entry.id, character: entry.character, pose: entry.pose, missing: true, flags: ["not built (a public view builds only whom its quality step draws; else see the console)"] });
                state.run.done++;
                await yieldNow();
            }
            // Anyone at all too near: by their spots, on one level.
            const spots = (w.spec.people ?? []).filter((o) => Array.isArray(o.position));
            for (const row of rows) {
                const me = spots.find((o) => o.id === row.id);
                if (!me) continue;
                const mates = [];
                let nearest = [Infinity, null];
                for (const other of spots) {
                    if (other === me) continue;
                    const d = Math.hypot(other.position[0] - me.position[0], other.position[1] - me.position[1], other.position[2] - me.position[2]);
                    if (d < nearest[0]) nearest = [d, other.id];
                    if (me.group && other.group === me.group) mates.push(+d.toFixed(2));
                }
                if (mates.length) row.mates = mates;
                row.nearest = nearest[1] ? [+nearest[0].toFixed(2), nearest[1]] : null;
                if (row.nearest && row.nearest[0] < TOL.APART) row.flags.push(`${row.nearest[0]} m from ${row.nearest[1]}`);
            }
            const flagged = rows.filter((row) => row.flags.length);
            const summary = {
                people: entries.length,
                built: rows.filter((row) => !row.missing).length,
                phases,
                flagged: flagged.length,
                flags: Object.fromEntries(flagged.map((row) => [row.id, row.flags])),
                seconds: +((performance.now() - state.run.started) / 1000).toFixed(1),
            };
            summary.text = flagged.length
                ? flagged.map((row) => `${row.id} ${row.character} ${row.pose}${row.clip ? ` "${row.clip}"` : ""}${row.seat ? ` on ${row.seat}` : ""}:\n  ${row.flags.join("\n  ")}`).join("\n")
                : `all ${summary.built} within tolerance`;
            const result = { summary, rows };
            state.last = result;
            if (save) summary.saved = (await fetch(`http://127.0.0.1:3199/${save}`, { method: "POST", body: JSON.stringify(result) })).status;
            state.run = { ...state.run, state: "done" };
            return result;
        } catch (error) {
            state.run = { ...state.run, state: "error", error: String(error?.stack ?? error) };
            throw error;
        } finally {
            restore();
        }
    }

    // ------------------------------------------------------------------ plans in memory
    const loaded = JSON.parse(JSON.stringify(w.spec.people ?? []));
    async function load(plan = null) {
        const list = plan === null ? loaded : Array.isArray(plan) ? plan : plan.people;
        if (!Array.isArray(list)) throw new Error("load(plan): an array of people, { people }, or null for the page's own");
        w.spec.people = JSON.parse(JSON.stringify(list));
        await P.rebuild(w.spec);
        const restore = keptCamera();
        for (const p of P.people.values()) poseAt(p, p.action?.time ?? 0);
        restore();
        return { asked: list.length, built: P.people.size };
    }
    async function patch(changes) {
        for (const [id, change] of Object.entries(changes)) if (!(await P.update({ id, ...change }))) throw new Error(`patch: no ${id}, or it would not build`);
        return JSON.parse(JSON.stringify(w.spec.people));
    }

    // ------------------------------------------------------------------ frames
    /** The camera the app draws with now (the editor's, in edit mode), at `eye` looking at `target`. */
    function aim(eye, target, fov) {
        const camera = e.camera.activeCamera;
        camera.position.copy(eye);
        camera.lookAt(target);
        camera.fov = fov;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
    }
    /** The camera on a person from the first of `angles` (degrees round from their front, + to their left) with a line to their middle and their head clear of the space and of the others; returns the angle. */
    function look(id, { d, h, t, fov = 35, a = 30, angles = null, force = false, face = false } = {}) {
        const p = P.get(id);
        if (!p) throw new Error(`look: no ${id}`);
        // From `d` metres, `h` over their floor, at a point `t` over it: the whole of them, by their pose.
        const whole = { stand: [3.3, 1.4, 0.95], sit: [2.6, 1.25, 0.8], lie: [2.8, 1.5, 0.6] }[p.entry.pose] ?? [2.6, 1.25, 0.8];
        d ??= whole[0];
        h ??= whole[1];
        t ??= whole[2];
        const [x, y, z] = p.entry.position;
        // Their floor: their own spot standing; under their seat sitting or lying.
        const floor = p.entry.pose === "stand" ? y : (placementOf(p)?.position[1] ?? y - 0.4);
        const joint = bone(p, "Head");
        // `face`: level with their head and on it, whatever their pose.
        const target = face && joint ? joint.clone() : new V3(x, floor + t, z);
        if (face && joint) h = joint.y - floor + 0.05;
        const head = joint ?? target;
        const list = nearOf(target, d + 0.5);
        // Someone else in the way: their middle within 0.45 m of the line of sight.
        const others = [...P.people.values()].filter((o) => o !== p && o.group.visible).map((o) => o.sphere.center);
        const crowded = (eye, to) => {
            const line = to.clone().sub(eye);
            const squared = line.lengthSq() || 1;
            return others.some((c) => eye.clone().addScaledVector(line, Math.max(0, Math.min(1, c.clone().sub(eye).dot(line) / squared))).distanceTo(c) < 0.45);
        };
        // Leaves in the way: three's own raycast on all the planting (a tree's crown, a hedge's leaves; 6 ms a ray on Ladonia).
        const flora = e.scene.getObjectByName("flora");
        const caster = new Raycaster();
        const leafy = (eye, to) => {
            if (!flora) return false;
            const line = to.clone().sub(eye);
            caster.far = line.length();
            caster.set(eye, line.normalize());
            return caster.intersectObject(flora, true).length > 0;
        };
        let pick = null;
        let used = null;
        for (const angle of angles ?? [a, a + 30, a - 30, a + 60, a - 60, a + 90, a - 90, a + 130, a - 130, a + 180]) {
            const r = (((p.entry.rotation ?? 0) + angle) * Math.PI) / 180;
            const eye = new V3(x - Math.sin(r) * d, floor + h, z - Math.cos(r) * d);
            if (!pick) [pick, used] = [eye, angle];
            if (force) break;
            if (!cast(eye, target, list) && !cast(eye, head, list) && !crowded(eye, target) && !crowded(eye, head) && !leafy(eye, head)) {
                [pick, used] = [eye, angle];
                break;
            }
        }
        aim(pick, target, fov);
        return used;
    }
    /** When in its clip a person's drink is nearest their mouth, in seconds. */
    function sipTime(p, n = 24) {
        const head = boneNode(p, "Head");
        if (!p.held?.mouth || !head) return p.action?.time ?? 0;
        let best = [Infinity, 0];
        for (const t of times(p, n)) {
            poseAt(p, t);
            const away = p.held.holder.getWorldPosition(new V3()).distanceTo(head.localToWorld(p.held.mouth.clone()));
            if (away < best[0]) best = [away, t];
        }
        return best[1];
    }
    async function shots(prefix = "people", { ids = null, sip = false, per = 6, cols = 3, width = 640 } = {}) {
        rescan();
        const restore = keptCamera();
        const people = (w.spec.people ?? []).map((entry) => P.get(entry.id)).filter((p) => p && (!ids || ids.includes(p.id)) && (!sip || p.held));
        const files = [];
        try {
            for (let at = 0; at < people.length; at += per) {
                const tiles = [];
                for (const p of people.slice(at, at + per)) {
                    const start = p.action?.time ?? 0;
                    const when = sip ? sipTime(p) : start;
                    // Close on the head at the sip; else the whole of them.
                    if (sip) poseAt(p, when);
                    // The sip from the side its hand is not on: the lips in profile, the drink beyond them.
                    const angle = sip ? look(p.id, { d: 1.3, fov: 30, a: p.clipEntry?.hand === "left" ? -60 : 60, face: true }) : look(p.id);
                    const back = keptCamera();
                    poseAt(p, when);
                    back();
                    refresh();
                    tiles.push(K.shot(`${p.id} ${p.entry.character} | ${p.entry.clip ?? p.entry.pose}${p.entry.prop ? ` + ${p.entry.prop}` : ""}${sip ? ` at ${when.toFixed(2)} s` : ""} @${angle}°`, width));
                    if (sip) poseAt(p, start);
                    await yieldNow();
                }
                const name = `${prefix}-${files.length + 1}.jpg`;
                files.push([name, await K.save(name, tiles, cols)]);
            }
        } finally {
            restore();
        }
        return files;
    }
    async function lineup({ name = "people-lineup.jpg", at = null, cols = 6, gap = 0.7, clip = null, width = 1600 } = {}) {
        const index = await P.index();
        const kept = JSON.parse(JSON.stringify(w.spec.people ?? []));
        const restore = keptCamera();
        // Over the roofs, against the sky, unless told a floor.
        const corners = (w.spec.rooms ?? []).flatMap((room) => room.polygon);
        const xs = corners.map((q) => q[0]);
        const zs = corners.map((q) => q[1]);
        const top = Math.max(0, ...(w.spec.rooms ?? []).map((room) => (room.elevation ?? 0) + (room.height ?? 2.7)));
        const [cx, cy, cz] = at ?? [(Math.min(...xs) + Math.max(...xs)) / 2 || 0, top + 4, (Math.min(...zs) + Math.max(...zs)) / 2 || 0];
        const rows = [];
        for (let i = 0; i < index.characters.length; i += cols) rows.push(index.characters.slice(i, i + cols));
        // Each row facing north, 30 m from the next (out of its frame); the camera north of it looking south, so its first is on the left.
        const people = rows.flatMap((row, r) =>
            row.map((character, i) => ({ id: `lineup-${r * cols + i + 1}`, character: character.id, pose: "stand", clip, position: [cx + r * 30 - (i - (row.length - 1) / 2) * gap, cy, cz], rotation: 0, seat: null, prop: null, group: null, seed: 1 }))
        );
        try {
            const { built } = await load(people);
            const aspect = K.r.domElement.width / K.r.domElement.height;
            const fov = 30;
            const half = Math.tan((fov * Math.PI) / 360);
            const tiles = [];
            for (const [r, row] of rows.entries()) {
                const d = Math.max((((row.length - 1) * gap) / 2 + 0.55) / (half * aspect), 1.15 / half);
                aim(new V3(cx + r * 30, cy + 1.0, cz - d), new V3(cx + r * 30, cy + 0.95, cz), fov);
                refresh();
                tiles.push(K.shot(row.map((character) => character.id).join("  |  "), width));
                await yieldNow();
            }
            return { characters: index.characters.length, built, file: name, status: await K.save(name, tiles, 1) };
        } finally {
            await load(kept);
            restore();
        }
    }

    Object.assign(state, { TOL, audit, load, patch, lineup, shots, look, refresh, rescan, kit: { targets: () => targets, nearOf, cast, skin, bone, poseAt, times, limbs, feet, gaps, legsIn, drink, headMesh, inHead, sipTime } });
    return `people-audit ready: ${rescan()} meshes round ${P.people.size} people built of ${P.count}`;
})();

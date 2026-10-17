// openables.js: the furniture's doors and drawers as the visitor meets them (app-notes.md, Furniture: the catalogue, its
// height and its collision; In-page audits). Load it through the sink after act.js, in an editor tab (/?scene=<id>, after
// harness.js) or a public view:
//   await eval(await (await fetch("http://127.0.0.1:3199/openables.js")).text())
// window.__openables — pieces, walkIn, sameTriangles, freeSpots and place read the editor's furniture
// (sceneBuilder.furniture, dynamicKeeper): an editor tab's alone (in a public view pieces() is empty and the others say
// so); free, stops, everyE and sashes run in either:
//   pieces()                 every piece with parts that open: its collision mode, its parts' boxes, labels
//   walkIn(id, { part, open })  for each part of a piece (or one): stood 1.1 m out in front of it, walked straight at a
//                            point 0.3 m behind its middle, the part open (or shut); how near its shut front the feet came
//   sameTriangles()          the editor's furniture tree (its keeper's entries) against what a publish collides
//                            (dynamicCollisionRoots, as Runtime.js walks it): the same triangles, counted and hashed
//   fold(tree)               a number for a tree: its cells, boxes and triangles in order
//   free([x, y, z])          whether the capsule stands at those feet for 20 frames, hardly moved (walk.js's free)
//   freeSpots(id, { step, margin, outside })  the spots on a grid over a piece's footprint where it stands free: an L or
//                            U kitchen's floor between its arms (Ladonia 2026-10-16, step 0.25: a-f069 6, a-f152 23)
//   place("column" | "l", [x, y, z], rotation), removeTest(), placed   a hand-made fridge column or L kitchen, never saved
//   stops({ fresh })         every part's plan (Openable.plan: how far it opens before what is in its way), what stopped it
//                            (planned.met), its whole swing or slide, and the ms each took; only those under 0.999 listed
//                            (Ladonia 2026-10-16: 32 of 475 parts, 316 ms cold)
//   everyE({ filter, all })  one part of each catalogue kind and label (or every part, or those whose name —
//                            "<piece>/<node>" — matches `filter`, a RegExp or a string): stood round it (0.45–1.9 m, 20° steps) until the crosshair is on it, E, frames: the
//                            prompt, the touch label and icon, open, its reach, the "interact" state told; E again: shut.
//                            `bad` lists those with no spot found, not fully open or not shut (Ladonia: 74/74 kinds,
//                            475/475 all)
//   sashes({ from, to })     every window that turns or tilts (sceneBuilder.windows): its plan (turn or tilt, and what
//                            met it), opened and shut through the window provider's act as E does it, and whether it left
//                            the shut batcher (its frame drawn by itself) while open and went back in, hidden again where
//                            its window's glass is merged, shut
(() => {
    if (window.__openables) return "already";
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const sb = w.sceneBuilder;
    const V = e.camera.perspectiveCamera.position.constructor;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const skipDynamic = (o) => Boolean(o.userData?.kind === "door" || o.userData?.doorLeaf || o.userData?.helper || o.userData?.decor || o.userData?.opens !== undefined || o.name === "missing-model");

    function pieces() {
        const rows = [];
        for (const [id, { placement, group }] of sb.furniture) {
            let n = 0;
            group.traverse((o) => { if (o.userData?.opens) n++; });
            if (!n) continue;
            const met = sb.collisionOf(placement, group);
            rows.push({ id, catalog: placement.catalog_id, label: group.userData.label, parts: n, mode: met?.mode ?? null, boxes: met?.parts?.length ?? 0, labels: [...new Set(sb.openables.parts.filter((p) => p.piece === id).map((p) => p.label))] });
        }
        return rows;
    }

    /** A part shut, worked out here (so on any build): its frame in the world at its rest, and its box in that frame. */
    function shutOf(p) {
        const node = p.node;
        node.parent.updateWorldMatrix(true, true);
        const M = node.matrixWorld.constructor;
        const matrix = new M().compose(p.restPosition, p.restQuaternion, node.scale).premultiply(node.parent.matrixWorld);
        const B = new (sb.collisionOf(sb.furniture.get(p.piece).placement, sb.furniture.get(p.piece).group).box.constructor)();
        const one = B.clone();
        const visit = (o, within) => {
            if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); B.union(one.copy(o.geometry.boundingBox).applyMatrix4(within)); }
            for (const c of o.children) visit(c, new M().multiplyMatrices(within, c.matrix));
        };
        visit(node, new M());
        return { node, matrix, box: B };
    }

    /** A part's shut front: its box's middle in the world, and the way out of its piece across the floor. */
    function frontOf(group, shut) {
        const c = shut.box.getCenter(new V()).applyMatrix4(shut.matrix);
        const middle = new (shut.box.constructor)().setFromObject(group).getCenter(new V());
        // The part's thin axis, in the world, pointed away from the piece's middle: the way its face looks.
        const size = shut.box.getSize(new V());
        const axis = size.x <= size.y && size.x <= size.z ? new V(1, 0, 0) : size.z <= size.y ? new V(0, 0, 1) : new V(0, 1, 0);
        const m = shut.matrix.elements;
        const p = sb.openables.of(shut.node);
        // A drawer looks the way it slides; a door, along its thinnest side.
        const normal = p?.kind === "drawer"
            ? p.direction.clone().transformDirection(shut.node.parent.matrixWorld)
            : axis.x ? new V(m[0], m[1], m[2]) : axis.z ? new V(m[8], m[9], m[10]) : new V(m[4], m[5], m[6]);
        const slide = p?.kind === "drawer";
        normal.y = 0;
        normal.normalize();
        // A door's face looks the way the door swings out: where its middle goes as it opens a little (an L-shaped
        // kitchen's middle is in front of its doors, so "away from the piece's middle" is not it).
        if (!slide && p) {
            const was = [p.open, p.target];
            p.open = p.target = 0.3;
            p.place();
            shut.node.updateMatrixWorld(true);
            const moved = new (shut.box.constructor)().setFromObject(shut.node).getCenter(new V()).sub(c);
            [p.open, p.target] = was;
            p.place();
            shut.node.updateMatrixWorld(true);
            if (normal.dot(moved) < 0) normal.negate();
        } else if (!slide && normal.dot(new V().subVectors(c, middle)) < 0) normal.negate();
        // The front face: the box's middle out by half its depth along the normal (a drawer's box, front to back, is the
        // drawer's depth along its slide).
        const along = new V(Math.abs(normal.dot(new V(m[0], m[1], m[2]).normalize())), Math.abs(normal.dot(new V(m[4], m[5], m[6]).normalize())), Math.abs(normal.dot(new V(m[8], m[9], m[10]).normalize())));
        const half = (along.x * size.x + along.y * size.y + along.z * size.z) / 2;
        return { centre: c, normal, face: c.clone().addScaledVector(normal, half) };
    }

    const editorOnly = (id) => ({ error: `no piece ${id} in sceneBuilder.furniture: an editor tab's (a public view has none — its furniture is in its runtime)` });

    function walkIn(id, { part = null, open = true, frames = 240 } = {}) {
        if (!sb.furniture.get(id)) return editorOnly(id);
        const { placement, group } = sb.furniture.get(id);
        for (const q of sb.openables.parts) if (q.piece === id) { q.open = q.target = 0; q.place(); }
        group.updateMatrixWorld(true);
        const shuts = sb.openables.parts.filter((q) => q.piece === id).map(shutOf);
        const floorY = group.getWorldPosition(new V()).y;
        const out = [];
        for (const shut of shuts) {
            const p = sb.openables.of(shut.node);
            if (part !== null && p !== sb.openables.parts[part] && shut.node.name !== part) continue;
            const { centre, normal, face } = frontOf(group, shut);
            // Everything of the piece shut, and this part open (or not).
            for (const q of sb.openables.parts) if (q.piece === id) { q.open = q.target = 0; q.place(); }
            if (open && p) { p.open = p.target = 1; p.place(); }
            group.updateMatrixWorld(true);
            sb.settleCollision?.();
            const start = face.clone().addScaledVector(normal, 1.1);
            const goal = centre.clone().addScaledVector(normal, -0.3);
            pl.collider.start.set(start.x, floorY + 0.4, start.z);
            pl.collider.end.copy(pl.collider.start);
            pl.collider.end.y += pl.height;
            pl.velocity.set(0, 0, 0);
            const theta = Math.atan2(-(goal.x - start.x), -(goal.z - start.z));
            P.remote = () => theta;
            P.actions = { forward: true };
            e.time.delta = 1 / 60;
            let nearest = Infinity;
            let clear = Infinity;
            const inverse = shut.matrix.clone().invert();
            const q = new V();
            for (let i = 0; i < frames; i++) {
                P.updateColliderMovement();
                const c = pl.collider.start;
                // How far in front of the shut face the capsule's axis is (negative: past it, into the piece).
                nearest = Math.min(nearest, (c.x - face.x) * normal.x + (c.z - face.z) * normal.z);
                // How far the capsule's skin is from the part's shut box (negative: in it), at the box's middle height.
                const y = Math.min(Math.max(centre.y, pl.collider.start.y), pl.collider.end.y);
                q.set(c.x, y, c.z).applyMatrix4(inverse);
                const inside = q.clone().clamp(shut.box.min, shut.box.max);
                clear = Math.min(clear, inside.applyMatrix4(shut.matrix).distanceTo(new V(c.x, y, c.z)) - pl.collider.radius);
            }
            P.actions = {};
            P.remote = null;
            pl.velocity.set(0, 0, 0);
            const c = pl.collider.start;
            out.push({ part: `${p?.piece}/${shut.node.name}`, label: p?.label, kind: p?.kind, open: p ? r3(p.open) : null, face: [r3(face.x), r3(face.y), r3(face.z)], normal: [r3(normal.x), r3(normal.z)], nearest: r3(nearest), clear: r3(clear), at: [r3(c.x), r3(c.y - 0.35), r3(c.z)] });
            if (p) { p.open = p.target = 0; p.place(); }
            group.updateMatrixWorld(true);
        }
        return out;
    }

    /** The triangles under roots as Runtime.js's addCollision takes them (skipDynamic), each as rounded corners. */
    function triangleKeys(roots) {
        const keys = [];
        const a = new V();
        const visit = (o) => {
            if (!o || skipDynamic(o)) return;
            if (o.isMesh && o.geometry?.attributes.position) {
                const pos = o.geometry.attributes.position;
                const idx = o.geometry.index;
                const n = idx ? idx.count : pos.count;
                for (let i = 0; i < n; i += 3) {
                    const t = [];
                    for (let k = 0; k < 3; k++) { a.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); t.push(`${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`); }
                    keys.push(t.join(";"));
                }
            }
            for (const c of o.children) visit(c);
        };
        for (const root of roots) { root?.updateWorldMatrix(true, true); visit(root); }
        return keys;
    }
    const hash = (list) => {
        let h = 2166136261 >>> 0;
        for (const s of [...list].sort()) for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
        return h;
    };

    function sameTriangles() {
        sb.settleCollision?.();
        const keeper = sb.dynamicKeeper;
        if (!keeper) return { error: "no sceneBuilder.dynamicKeeper: an editor tab's (a public view collides with its runtime's own trees)" };
        const kept = [];
        let boxes = 0;
        for (const entry of keeper.entries.values()) {
            if (entry.stamp) boxes++;
            for (const t of entry.triangles) kept.push([t.a, t.b, t.c].map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`).join(";"));
        }
        const { roots, proxies } = sb.dynamicCollisionRoots();
        const published = triangleKeys(roots);
        const out = { kept: kept.length, published: published.length, boxSources: boxes, proxies: proxies.children.length, same: hash(kept) === hash(published) };
        for (const proxy of proxies.children) proxy.geometry.dispose();
        return out;
    }

    function fold(tree) {
        let h = 0;
        let cells = 0, triangles = 0;
        const add = (x) => { h = (h * 31 + Math.round(x * 1e5)) % 2147483647; };
        const visit = (node) => {
            cells++;
            if (node.box) for (const v of [node.box.min, node.box.max]) { add(v.x); add(v.y); add(v.z); }
            for (const t of node.triangles) { triangles++; for (const p of [t.a, t.b, t.c]) { add(p.x); add(p.y); add(p.z); } }
            for (const s of node.subTrees) visit(s);
        };
        visit(tree);
        return { h, cells, triangles };
    }

    /** Can the capsule stand at p (feet) for 20 frames, hardly moved? (walk.js's free) */
    function free([x, y, z]) {
        pl.collider.start.set(x, y + 0.36, z);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
        P.actions = {};
        P.remote = () => 0;
        e.time.delta = 1 / 60;
        for (let i = 0; i < 20; i++) P.updateColliderMovement();
        P.remote = null;
        const c = pl.collider.start;
        return Math.hypot(c.x - x, c.z - z) < 0.04 && Math.abs(c.y - 0.35 - y) < 0.3;
    }

    /** Every piece's box in the world, all of its parts shut (made once a page). */
    let feet = null;
    function footprints() {
        if (feet) return feet;
        feet = [];
        for (const { group } of sb.furniture.values()) {
            const box = new (sb.collisionOf(sb.furniture.values().next().value.placement, sb.furniture.values().next().value.group).box.constructor)().setFromObject(group);
            if (!box.isEmpty()) feet.push(box);
        }
        return feet;
    }

    /** The spots on a grid over a piece's footprint and `margin` round it (its floor's level) where the capsule stands free;
     *  `outside`: only those off every piece's footprint (a capsule wholly inside a closed box touches none of its triangles
     *  and stands "free" there, so spots inside a piece met as its box do not compare with one met as its mesh). */
    function freeSpots(id, { step = 0.1, margin = 0.6, outside = false } = {}) {
        sb.settleCollision?.();
        if (!sb.furniture.get(id)) return editorOnly(id);
        const { group } = sb.furniture.get(id);
        for (const q of sb.openables.parts) if (q.piece === id) { q.open = q.target = 0; q.place(); }
        group.updateMatrixWorld(true);
        const box = new (sb.collisionOf(sb.furniture.get(id).placement, group).box.constructor)().setFromObject(group);
        const y = group.getWorldPosition(new V()).y;
        const spots = [];
        for (let x = box.min.x - margin; x <= box.max.x + margin + 1e-9; x += step) {
            for (let z = box.min.z - margin; z <= box.max.z + margin + 1e-9; z += step) {
                if (outside && footprints().some((f) => y > f.min.y - 0.3 && y < f.max.y && x > f.min.x && x < f.max.x && z > f.min.z && z < f.max.z)) continue;
                if (free([x, y, z])) spots.push(`${x.toFixed(2)},${z.toFixed(2)}`);
            }
        }
        return spots;
    }

    window.__openables = { pieces, walkIn, sameTriangles, fold, frontOf, free, freeSpots };
    return "openables ready";
})();

// ---- Hand-made pieces: a fridge column and an L-shaped kitchen, built here and placed as the
// editor places a model's pieces (FurnitureLibrary.registerLocal + SceneBuilder.addFurniture). Never saved: placed
// with record false, and taken away again by __openables.removeTest().
(() => {
    const e = window.experience;
    const sb = e.world.sceneBuilder;
    const ph = sb.furnitureLibrary.missingPlaceholder([1, 1, 1]);
    const Box = ph.geometry.constructor;
    const Mesh = ph.constructor;
    const Std = ph.material.constructor;
    const Group = sb.root.constructor;
    ph.geometry.dispose();
    const wood = new Std({ color: 0xd8d2c4, roughness: 0.6 });
    wood.name = "w1-carcass";
    const front = new Std({ color: 0x6f7f5a, roughness: 0.5 });
    front.name = "w1-front";
    const white = new Std({ color: 0xf4f4f2, roughness: 0.4 });
    white.name = "w1-liner";
    // Clear glass, as a shower's door's is (kindOf: transparent, roughness <= 0.1).
    const glass = new Std({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25 });
    glass.name = "w1-glass";

    const panel = (size, at, material = wood) => {
        const mesh = new Mesh(new Box(...size), material);
        mesh.position.set(...at);
        return mesh;
    };
    const part = (opens, at, slab, name) => {
        const node = new Group();
        node.name = name;
        node.position.set(...at);
        node.userData.opens = opens;
        for (const mesh of slab) node.add(mesh);
        return node;
    };
    /** A hollow carcass `w` × `h` × `d`, its back at z 0, open at its front (+z), standing from y0, x from x0. */
    const carcass = (group, x0, w, y0, h, d, t = 0.018, inside = wood) => {
        group.add(panel([w, t, d], [x0 + w / 2, y0 + t / 2, d / 2]));
        group.add(panel([w, t, d], [x0 + w / 2, y0 + h - t / 2, d / 2]));
        group.add(panel([t, h, d], [x0 + t / 2, y0 + h / 2, d / 2]));
        group.add(panel([t, h, d], [x0 + w - t / 2, y0 + h / 2, d / 2]));
        group.add(panel([w, h, t], [x0 + w / 2, y0 + h / 2, t / 2], inside));
    };

    /** A fridge column: fridge above (a light inside), freezer below, a lift-up flap over the top, a drawer at its foot, a glass door at its side. */
    function column() {
        const model = new Group();
        model.name = "w1-column";
        const w = 0.6, d = 0.58;
        carcass(model, 0, w, 0, 2.1, d, 0.018, white);
        model.add(panel([w - 0.036, 0.018, d - 0.02], [w / 2, 0.75, d / 2], white));
        model.add(panel([w - 0.036, 0.018, d - 0.02], [w / 2, 1.8, d / 2], white));
        // The fridge's door hangs on its right edge (x = w), its slab to its left, and swings out: a positive angle about up.
        model.add(part({ type: "hinge", angle: 1.75, label: "fridge" }, [w, 0.77, d], [panel([w - 0.004, 1.02, 0.02], [-w / 2, 0.51, 0.01], front), panel([0.02, 0.3, 0.03], [-w + 0.05, 0.4, 0.035], front)], "w1-column.door1"));
        model.add(part({ type: "hinge", angle: 1.75, label: "freezer" }, [w, 0.12, d], [panel([w - 0.004, 0.62, 0.02], [-w / 2, 0.31, 0.01], front)], "w1-column.door2"));
        // The flap over the top hangs on its upper edge (axis +x through it) and lifts out and up.
        model.add(part({ type: "hinge", angle: -1.3, axis: [1, 0, 0] }, [0, 2.09, d], [panel([w - 0.004, 0.27, 0.02], [w / 2, -0.135, 0.01], front)], "w1-column.door3"));
        // A shallow drawer in the plinth.
        model.add(part({ type: "slide", distance: 0.3, direction: [0, 0, 1], label: "detergent drawer" }, [0, 0.0, d], [panel([w - 0.004, 0.1, 0.02], [w / 2, 0.06, 0.01], front), panel([w - 0.06, 0.08, 0.4], [w / 2, 0.06, -0.2], white)], "w1-column.drawer1"));
        // The light inside the fridge, shining down and out.
        const light = new Group();
        light.name = "w1-column.light";
        light.position.set(w / 2, 1.7, d / 2);
        light.userData.fixture = { light: { power: 3, reach: 1.8, aim: [0, -1, 0.3] } };
        model.add(light);
        // A glass door on its side, as a shower's is: hinged at the back, swinging out.
        model.add(panel([0.02, 2.0, 0.02], [w + 0.4, 1.0, 0.01]));
        model.add(part({ type: "hinge", angle: 1.6, label: "shower door" }, [w + 0.4, 0.02, 0.02], [panel([0.008, 1.9, 0.7], [0, 0.95, 0.35], glass)], "w1-column.door4"));
        // Centred on its footprint, its lowest point on y 0 (as the exporter puts a piece).
        model.position.set(-w / 2 - 0.2, 0, -d / 2);
        const source = new Group();
        source.add(model);
        return source;
    }

    /** An L-shaped kitchen: three hollow units along its back, three along its left side turned to face +x. */
    function lKitchen() {
        const model = new Group();
        model.name = "w1-l";
        const unit = (parent, x0, i, door) => {
            const w = 0.6, h = 0.86, d = 0.58;
            const g = new Group();
            carcass(g, x0, w, 0, h, d);
            g.add(panel([w - 0.036, 0.018, d - 0.02], [x0 + w / 2, h / 2, d / 2]));
            const opens = door ? { type: "hinge", angle: -1.75 } : { type: "slide", distance: 0.45, direction: [0, 0, 1] };
            g.add(part(opens, [x0, 0.02, d], [panel([w - 0.004, h - 0.04, 0.019], [w / 2, (h - 0.04) / 2, 0.0095], front), panel([0.02, 0.2, 0.03], [w - 0.06, h / 2, 0.034], front)], `w1-l.${door ? "door" : "drawer"}${i}`));
            // The worktop.
            g.add(panel([w, 0.03, d + 0.02], [x0 + w / 2, h + 0.015, (d + 0.02) / 2], front));
            parent.add(g);
        };
        for (let i = 0; i < 3; i++) unit(model, 0.6 + i * 0.6, i, i !== 1);
        for (let i = 0; i < 3; i++) {
            const arm = new Group();
            arm.rotation.y = Math.PI / 2;
            arm.position.set(0, 0, 0.6);
            unit(arm, -0.6 - i * 0.6, 3 + i, true);
            model.add(arm);
        }
        model.position.set(-1.2, 0, -1.2);
        const source = new Group();
        source.add(model);
        return source;
    }

    const placed = [];
    async function place(kind, position, rotation = 0) {
        // (A public view has no furniture group to add to: SceneBuilder.addFurniture throws there.)
        if (!sb.furnitureGroup) return { error: "no sceneBuilder.furnitureGroup: an editor tab's (a public view's furniture is in its runtime)" };
        const id = `test:w1-${kind}`;
        if (!sb.furnitureLibrary.getItem(id)) sb.furnitureLibrary.registerLocal(id, { name: kind === "column" ? "W1 test column" : "W1 test L kitchen", source: kind === "column" ? column() : lKitchen() });
        const placement = { id: `w1-${kind}-${placed.length}`, catalog_id: id, position, rotation, scale: 1 };
        const entry = sb.addFurniture(placement, { record: false });
        await entry.group.userData.ready;
        await new Promise((r) => setTimeout(r, 0));
        sb.refreshCollision();
        e.world.emit("scene-edited");
        placed.push(placement.id);
        return placement.id;
    }
    function removeTest() {
        for (const id of placed.splice(0)) sb.removeFurniture(id);
        sb.refreshCollision();
        e.world.emit("scene-edited");
    }
    Object.assign(window.__openables, { place, removeTest, placed });
})();

// ---- Audits of every part and every window: what stops each, E on one of each kind, every sash ---------------------
(() => {
    const e = window.experience;
    const w = e.world;
    const sb = w.sceneBuilder;
    const P = w.player;
    const deg = (r) => Math.round((r * 1800) / Math.PI) / 10;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const step = (n = 1) => {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
            // (Drawn too: the shut batcher follows the parts before each render.)
            e.renderer.render();
        }
    };
    function stops({ fresh = true } = {}) {
        const rows = [];
        let total = 0;
        let most = 0;
        for (const p of sb.openables.parts) {
            if (fresh) p.planned = null;
            const t0 = performance.now();
            const reach = p.plan();
            const ms = performance.now() - t0;
            total += ms;
            most = Math.max(most, ms);
            rows.push({ piece: p.piece, name: p.node.name, label: p.label, type: p.opens.type, reach: r3(reach), met: p.planned?.met ?? null, ms: Math.round(ms * 100) / 100, whole: p.opens.type === "slide" ? r3(p.opens.distance) : deg(p.opens.angle) });
        }
        const stopped = rows.filter((r) => r.reach < 0.999);
        return { parts: rows.length, stopped: stopped.length, total: Math.round(total), most: Math.round(most * 100) / 100, rows: stopped };
    }
    function everyE({ filter = null, all = false } = {}) {
        const A = window.__act;
        if (!A) return "act.js first";
        const place = new Map(sb.spec.furniture.map((f) => [f.id, f]));
        const seen = new Set();
        const pick = [];
        // (A RegExp, or a string made one.)
        if (typeof filter === "string") filter = new RegExp(filter);
        for (const d of A.drawers()) {
            const piece = d.name.split("/")[0];
            const cat = place.get(piece)?.catalog_id;
            const k = cat + "|" + d.part.label;
            if (filter && !filter.test(d.name)) continue;
            if (!all && seen.has(k)) continue;
            seen.add(k);
            pick.push([d, cat]);
        }
        const rows = [];
        for (const [d, cat] of pick) {
            const row = { name: d.name, cat, label: d.part.label };
            const y = place.get(d.name.split("/")[0])?.position?.[1] ?? 0;
            const room = sb.roomAt(d.at[0], y + 0.3, d.at[2]) ?? sb.roomAt(d.at[0], y - 0.3, d.at[2]);
            const floor = room?.elevation ?? y;
            let ok = false;
            for (let r = 0.45; r <= 1.9 && !ok; r += 0.2) {
                for (let a = 0; a < 360 && !ok; a += 20) {
                    const x = d.at[0] + r * Math.cos((a * Math.PI) / 180);
                    const z = d.at[2] + r * Math.sin((a * Math.PI) / 180);
                    const st = A.stand([x, floor, z]);
                    if (st.moved > 0.25 || Math.abs(st.feet[1] - floor) > 0.3) continue;
                    for (const dy of [0, 0.04, -0.04]) {
                        if (ok) break;
                        const g = A.aim([d.at[0], d.at[1] + dy, d.at[2]]);
                        if (g.target?.id !== d.name) continue;
                        ok = true;
                        row.prompt = g.prompt?.label;
                        row.touch = `${g.prompt?.touch?.label}/${g.prompt?.touch?.icon}`;
                        const p1 = A.press("E", 100);
                        row.open = +d.part.open.toFixed(2);
                        row.reach = +(d.part.published ?? d.part.reach ?? 1).toFixed(2);
                        const g2 = A.aim([d.at[0], d.at[1] + dy, d.at[2]]);
                        row.prompt2 = g2.prompt?.label;
                        const p2 = g2.target?.id === d.name ? A.press("E", 120) : null;
                        if (!p2) {
                            d.part.target = 0;
                            step(120);
                        }
                        row.shut = +d.part.open.toFixed(3);
                        row.told = [p1, p2].map((p) => p?.told.find((t) => t[0] === "interact")?.[1]?.state ?? null).join(",");
                    }
                }
            }
            if (!ok) row.noSpot = true;
            rows.push(row);
        }
        const bad = rows.filter((r) => r.noSpot || r.open !== 1 || r.shut !== 0 || !/^open/.test(r.told));
        return { n: rows.length, ok: rows.length - bad.length, bad, rows, prompts: [...new Set(rows.map((r) => r.prompt))] };
    }
    function sashes({ from = 0, to = Infinity } = {}) {
        const provider = w.interactables?.providers?.find((p) => p.name === "window");
        if (!provider) return "no window provider in this build";
        const B = sb.shutBatcher;
        const rows = [];
        for (const sash of (sb.windows ?? []).slice(from, to)) {
            const glass = B?.windowOf?.get(sash);
            const way = sash.plan(w.collision);
            const before = { shown: sash.group.visible, in: B?.sashEntry?.get(sash)?.in };
            const opened = provider.act({ ref: sash, id: sash.id }, P);
            step(90);
            const open = { state: opened.state, open: +sash.open.toFixed(2), shown: sash.group.visible, in: B?.sashEntry?.get(sash)?.in };
            provider.act({ ref: sash, id: sash.id }, P);
            step(120);
            const shut = { open: sash.open, shown: sash.group.visible, in: B?.sashEntry?.get(sash)?.in, merged: glass?.merged ?? null };
            const ok = open.open === 1 && open.shown && !open.in && shut.open === 0 && (B ? Boolean(shut.in) : true) && shut.shown === !(glass && shut.merged) && before.shown === shut.shown;
            rows.push({ id: sash.id, ok, way, met: sash.planned?.met ?? null, opened: opened.state, before, open, shut });
        }
        const bad = rows.filter((r) => !r.ok);
        return { n: rows.length, ok: rows.length - bad.length, turned: rows.filter((r) => r.opened === "open").length, tilted: rows.filter((r) => r.opened === "tilted").length, hiddenShut: rows.filter((r) => !r.shut.shown).length, bad: bad.slice(0, 8) };
    }
    Object.assign(window.__openables, { stops, everyE, sashes });
    return "openables ready";
})();

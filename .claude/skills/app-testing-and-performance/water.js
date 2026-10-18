// water.js (2026-10-16): the taps and showers driven headlessly. Load through the sink once the visitor is in (an editor tab after harness.js, or a public view), after act.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/water.js?" + Date.now())).text())
// window.__water:
//   list(filter)                 controls: { id, kind, at, floor, catalog } (filter: a RegExp source over "<id> <catalog>")
//   front(id, back)              a point on the floor `back` m in front of a control (away from its spout's far side)
//   go(id, { back, aimAt })      stand in front of a control, aim at it, look: { stood, look, prompt, target }
//   inside(showerPiece)          stand in the middle of a shower's enclosure, looking at its back wall, look
//   press(frames)                E, then frames stepped
//   step(seconds)                world stepped at 1/60 s for that long
//   status()                     world.water.status()
//   shot(name, { width, label }) the frame drawn now to the sink
//   pose(p, t, fov)              the camera put at p looking at t (free camera, for pictures)
//   view(id, { back, side, up, inside, fov, at })   the camera put to look at a fixture (a tap from beside its spout,
//                                a shower from out in front or from inside), kept in its room
//   away()                       the visitor put at the space's first spawn, out of every shower's drops
//   on(ids, value)               those controls' water on (or off), as E would; door(piece, open) a shower's door
//   setup({ ids, doors, seconds })   on, doors open, stepped, the visitor away: status()
//   sweep({ filter, standing })  every control (or those matching `filter`, a RegExp source over "<id> <catalog>"): E at
//                                it, on and drawn, E again, off and settled: { n, ok, bad, rows }
//   await sheet(name, ids, { width, cols, label })   each fixture running, from view(), tiled to the sink
//   await inject()               a version published before the models had water anchors: the anchors put in from the
//                                GLBs, then the water looked for again (nothing published)
(() => {
    const e = window.experience;
    const w = e.world;
    const W = w.water;
    const P = w.player;
    const pl = P.player;
    const V = e.camera.perspectiveCamera.position.constructor;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const placementOf = (id) => (w.sceneBuilder.spec.furniture || []).find((f) => f.id === id);
    function list(filter = null) {
        const out = [];
        for (const c of W.controls.values()) {
            W.place(c);
            const p = placementOf(c.piece);
            const entry = { id: c.id, kind: c.kind, at: c.at.toArray().map(r3), floor: p?.position?.[1] ?? null, catalog: p?.catalog_id ?? null };
            if (!filter || new RegExp(filter).test(c.id + " " + entry.catalog)) out.push(entry);
        }
        return out;
    }
    function front(id, back = 0.6) {
        const c = W.controls.get(id);
        W.place(c);
        const o = c.outlets[0];
        W.place(o);
        // Out from the tap body past its spout, across the floor; a shower's valve: out from the wall it is on.
        const d = new V(o.at.x - c.at.x, 0, o.at.z - c.at.z);
        if (c.kind === "shower" || d.length() < 0.02) {
            // The way the valve faces: towards the enclosure's middle (or the head over it).
            const en = [...W.enclosures.values()].find((x) => x.piece === c.piece);
            if (en) W.place(en);
            const mid = en ? en.at : o.at;
            d.set(mid.x - c.at.x, 0, mid.z - c.at.z);
        }
        d.normalize();
        const floor = placementOf(c.piece)?.position?.[1] ?? 0;
        const from = c.kind === "shower" ? c.at : o.at;
        return [from.x + d.x * back, floor, from.z + d.z * back];
    }
    function go(id, { back = 0.6, aimAt = null } = {}) {
        const feet = front(id, back);
        const stood = window.__act.stand(feet);
        const c = W.controls.get(id);
        const at = aimAt ?? c.at.toArray();
        return { stood, ...window.__act.aim(at) };
    }
    function inside(piece) {
        const en = [...W.enclosures.values()].find((x) => x.piece === piece);
        W.place(en);
        const floor = placementOf(piece)?.position?.[1] ?? 0;
        const stood = window.__act.stand([en.at.x, floor, en.at.z]);
        const c = en.control;
        const look = window.__act.aim(c ? c.at.toArray() : [en.at.x, floor + 1, en.at.z + 1]);
        return { stood, ...look };
    }
    function step(seconds = 1) {
        e.time.delta = 1 / 60;
        const n = Math.round(seconds * 60);
        for (let i = 0; i < n; i++) {
            w.update();
            e.camera.update();
            // (The water is stepped after the camera: World.afterCamera.)
            w.afterCamera?.();
        }
        return n;
    }
    function press(frames = 30) {
        return window.__act.press("E", frames);
    }
    function pose(p, t, fov = 50) {
        const cam = e.camera.activeCamera;
        cam.position.set(...p);
        cam.lookAt(...t);
        cam.fov = fov;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
    }
    async function shot(name, { width = 1280, label = "", avatar = false } = {}) {
        w.vegetation?.update?.(0.016);
        const figure = P.avatar?.avatar;
        const was = figure?.visible;
        if (figure && !avatar) figure.visible = false;
        e.renderer.render();
        if (figure) figure.visible = was;
        const src = e.renderer.renderer.domElement;
        const cv = document.createElement("canvas");
        cv.width = width;
        cv.height = Math.round((width * src.height) / src.width);
        const g = cv.getContext("2d");
        g.drawImage(src, 0, 0, cv.width, cv.height);
        if (label) {
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(0, 0, cv.width, 18);
            g.fillStyle = "#fff";
            g.font = "12px sans-serif";
            g.fillText(label, 6, 13);
        }
        const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.9));
        return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
    }
    /**
     * The camera put to look at a fixture: a tap from in front of and a little to the side of its spout; a
     * shower from `back` m in front of its enclosure (out from its valve), or from inside it (`inside`).
     * Then the water's own update with no time passing, so that what depends on the eye follows it.
     */
    function view(id, { back = null, side = 0.2, up = null, inside = false, fov = 50, at = null } = {}) {
        const c = W.controls.get(id);
        W.place(c);
        const o = c.outlets[0];
        W.place(o);
        const Vc = o.at.constructor;
        const floor = placementOf(c.piece)?.position?.[1] ?? 0;
        let eye;
        let target;
        if (c.kind === "tap") {
            const out = o.at.clone().sub(c.at).setY(0).normalize();
            const across = new Vc(-out.z, 0, out.x);
            eye = o.at.clone().addScaledVector(out, back ?? 0.45).addScaledVector(across, side);
            eye.y += up ?? 0.22;
            target = o.at.clone();
            target.y -= o.fall * 0.6;
        } else {
            const en = [...W.enclosures.values()].find((x) => x.piece === c.piece);
            const mid = en ? (W.place(en), en.at.clone()) : o.at.clone().setY(floor + 1);
            const out = mid.clone().sub(c.at).setY(0).normalize();
            const across = new Vc(-out.z, 0, out.x);
            if (inside) {
                eye = mid.clone().addScaledVector(out, 0.15).addScaledVector(across, side);
                eye.y = floor + (up ?? 1.62);
                target = c.at.clone();
                target.y = floor + 1.3;
            } else {
                eye = mid.clone().addScaledVector(out, back ?? 1.7).addScaledVector(across, side);
                eye.y = floor + (up ?? 1.6);
                target = mid.clone().setY(floor + 1.05);
            }
        }
        if (at) target.set(...at);
        // Kept in the room the fixture is in: a step back from a shower in a narrow bathroom is through its wall.
        const room = w.sceneBuilder.roomAt(target.x, floor + 0.5, target.z);
        if (room) {
            const xs = room.polygon.map((p) => p[0]);
            const zs = room.polygon.map((p) => p[1]);
            eye.x = Math.min(Math.max(eye.x, Math.min(...xs) + 0.15), Math.max(...xs) - 0.15);
            eye.z = Math.min(Math.max(eye.z, Math.min(...zs) + 0.15), Math.max(...zs) - 0.15);
        }
        pose(eye.toArray(), target.toArray(), fov);
        W.update(0);
        return { eye: eye.toArray().map(r3), target: target.toArray().map(r3) };
    }
    /** The visitor stood out of the way (where the space starts), so that no shower's drops end on them. */
    function away() {
        const spawn = w.spec.spawns?.[0];
        if (spawn) P.teleport(spawn);
        step(0.1);
    }
    /** These controls' water turned on (or `on` false: off), as E would. */
    function on(ids, value = true) {
        return ids.map((id) => W.toggle(W.controls.get(id), value));
    }
    /** A piece's shower door opened or shut at once (its part's own easing, stepped). */
    function door(piece, open = true) {
        const part = w.sceneBuilder.openables.parts.find((p) => p.piece === piece && /shower door/.test(p.label));
        if (!part) return null;
        part.target = open ? 1 : 0;
        part.limit = 1;
        step(1.2);
        return part.open;
    }
    /** Boot-to-scene: everything in `ids` on, the doors of `doors` open, `seconds` stepped, the visitor out of the way. */
    function setup({ ids = [], doors = [], seconds = 16 } = {}) {
        on(ids);
        for (const piece of doors) door(piece, true);
        step(seconds);
        away();
        return W.status();
    }
    /**
     * Every control in turn (or those matching `filter`): stood in front of (showers: their door opened, then
     * stood in), aimed at, E, half a second stepped — what the prompt said, whether its water runs and is drawn —
     * then E again and two seconds stepped: whether it went off and settled. A shower stood in is pressed with
     * its valve aimed at; with `standing`, with the crosshair on the enclosure's middle instead (the fallback).
     */
    function sweep({ filter = null, standing = false } = {}) {
        const rows = [];
        for (const c of W.controls.values()) {
            if (filter && !new RegExp(filter).test(c.id + " " + (placementOf(c.piece)?.catalog_id ?? ""))) continue;
            const row = { id: c.id, kind: c.kind, catalog: placementOf(c.piece)?.catalog_id };
            try {
                const en = [...W.enclosures.values()].find((x) => x.piece === c.piece);
                if (en) door(c.piece, true);
                let g;
                if (en && standing) {
                    W.place(en);
                    const floor = placementOf(c.piece)?.position?.[1] ?? 0;
                    window.__act.stand([en.at.x, floor, en.at.z]);
                    g = window.__act.aim([en.at.x, floor + 0.3, en.at.z + 0.01]);
                } else if (en) {
                    g = inside(c.piece);
                } else {
                    g = go(c.id, { back: 0.55 });
                }
                row.prompt = g.prompt?.label ?? null;
                row.target = g.target?.id === c.id ? "control" : g.target?.kind ?? null;
                const p1 = press(30);
                row.on = c.outlets.every((o) => o.on);
                step(0.5);
                row.shown = c.outlets.map((o) => o.shown);
                row.drawn = c.outlets.map((o) => Object.values(o.meshes ?? {}).some((m) => m.visible));
                row.light = c.outlets[0].light.value.toArray().map((n) => +n.toFixed(3));
                // Off again: aimed again where it was.
                if (en && standing) window.__act.look();
                const p2 = press(30);
                step(2.5);
                row.off = c.outlets.every((o) => !o.on);
                row.settled = c.outlets.every((o) => !W.active.has(o));
                row.told = [p1, p2].map((p) => p.told.find((t) => t[0] === "interact")?.[1]?.state ?? null);
                if (en) door(c.piece, false);
            } catch (error) {
                row.error = String(error.stack ?? error).slice(0, 300);
            }
            rows.push(row);
        }
        const bad = rows.filter((r) => r.error || !r.on || !r.off || r.told.join() !== "on,off" || !/^Turn on the (tap|shower)$/.test(r.prompt ?? ""));
        return { n: rows.length, ok: rows.length - bad.length, bad, rows };
    }
    /** Pictures of each fixture running, tiled `cols` across into one sheet saved as `name`. */
    async function sheet(name, ids, { width = 480, cols = 4, label = "" } = {}) {
        const tiles = [];
        for (const id of ids) {
            view(id, id.includes("rain") ? {} : {});
            const figure = P.avatar?.avatar;
            const was = figure?.visible;
            if (figure) figure.visible = false;
            e.renderer.render();
            if (figure) figure.visible = was;
            const src = e.renderer.renderer.domElement;
            const cv = document.createElement("canvas");
            cv.width = width;
            cv.height = Math.round((width * src.height) / src.width);
            const g = cv.getContext("2d");
            g.drawImage(src, 0, 0, cv.width, cv.height);
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(0, 0, cv.width, 16);
            g.fillStyle = "#fff";
            g.font = "11px sans-serif";
            g.fillText(`${label} ${id} (${placementOf(W.controls.get(id).piece)?.catalog_id})`, 4, 12);
            tiles.push(cv);
        }
        const cw = tiles[0].width;
        const ch = tiles[0].height;
        const out = document.createElement("canvas");
        out.width = cw * Math.min(cols, tiles.length);
        out.height = ch * Math.ceil(tiles.length / cols);
        const g = out.getContext("2d");
        tiles.forEach((t, i) => g.drawImage(t, (i % cols) * cw, Math.floor(i / cols) * ch));
        const blob = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.85));
        return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
    }
    /**
     * A public view of a version published before the furniture's models had anchors: the anchors put in its
     * runtime's "openable" group as Publish/Runtime.js would have, from the models themselves (each wet piece's
     * GLB, read for its nodes' extras), placed as the published spec places the pieces; then the water looked
     * for again. For testing the baked view's light, K's live room and the view from above on the user's baked
     * version — nothing is published.
     */
    async function inject() {
        const sb = w.sceneBuilder;
        const G = sb.root.constructor;
        let group = sb.openableGroup;
        if (!group) {
            group = new G();
            group.name = "openable";
            sb.root.add(group);
            sb.openableGroup = group;
        }
        const catalog = await (await fetch("/models/furniture/catalog.json")).json();
        const items = new Map((catalog.items ?? catalog).map((item) => [item.id, item]));
        const anchors = new Map();
        let added = 0;
        for (const placement of sb.spec.furniture) {
            if (!/vanity|shower|ld-kitchen|ld-counter|ld-out-kitchen|ld-out-island/.test(placement.catalog_id)) continue;
            if (!anchors.has(placement.catalog_id)) {
                const bytes = await (await fetch(`/models/furniture/${placement.catalog_id}.glb`)).arrayBuffer();
                const view = new DataView(bytes);
                const length = view.getUint32(12, true);
                const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)));
                anchors.set(placement.catalog_id, (json.nodes ?? []).filter((n) => n.extras?.fixture && (n.extras.fixture.water || n.extras.fixture.control || n.extras.fixture.steam)));
            }
            const item = items.get(placement.catalog_id);
            const piece = new G();
            piece.position.fromArray(placement.position);
            piece.rotation.y = (placement.rotation ?? 0) * Math.PI / 180;
            piece.scale.setScalar((placement.scale ?? 1) * (item?.scale ?? 1));
            const model = new G();
            model.rotation.y = (item?.yaw ?? 0) * Math.PI / 180;
            piece.add(model);
            piece.updateMatrixWorld(true);
            for (const node of anchors.get(placement.catalog_id)) {
                const local = new G();
                local.position.fromArray(node.translation ?? [0, 0, 0]);
                model.add(local);
                local.updateMatrixWorld(true);
                const holder = new G();
                holder.name = String(node.name).replace(/[[\]./:]/g, "");
                holder.applyMatrix4(local.matrixWorld);
                holder.userData = { piece: placement.id, label: item?.name ?? placement.catalog_id, fixture: node.extras.fixture, injected: true };
                group.add(holder);
                added++;
            }
        }
        group.updateMatrixWorld(true);
        W.refresh();
        return { added, fixtures: W.status().fixtures };
    }
    window.__water = { view, away, on, door, setup, sweep, sheet, inject, list, front, go, inside, press, step, status: () => W.status(), shot, pose, W };
    return "water ready";
})();

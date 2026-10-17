// steam.js (2026-10-16): a shower's steam and mist over time, as sheets of pictures. Load through the sink, after
// act.js and water.js (an editor tab after harness.js, or a public view):
//   await eval(await (await fetch("http://127.0.0.1:3199/steam.js?" + Date.now())).text())
// window.__steam:
//   series(name, id, { on: [s…], off: [s…], views: [opts…], width, cols, label, door })
//        the shower `id` (a control id) turned on, pictures taken at each of `on`'s times (seconds since it was
//        turned on), then turned off, pictures at each of `off`'s (seconds since); each time from every view in
//        `views` (__water.view's options) — tiled into one sheet saved as `name`.
//   strip(name, id, { at, off, every, n, view })   how it moves: pictures `every` s apart at one time
//   timings({ rounds, n, only })   what the water costs a frame at lane H's poses (water shown vs hidden)
//   reset()   everything off and settled (heat, mist 0)
//   tile(label, width, { figures })   the frame drawn now as a canvas, labelled (figures hidden unless asked)
//   hideSome([...])   the water's meshes whose names end so hidden for a picture ("steam", "haze", "spill", "mist")
(() => {
    const e = window.experience;
    const w = e.world;
    const W = w.water;
    const X = window.__water;
    function tile(label, width = 480, { figures = false } = {}) {
        w.vegetation?.update?.(0.016);
        // (Neither the visitor's own figure nor the people round the property in the way of the picture, unless asked.)
        const hidden = figures ? [] : [w.player.avatar?.avatar, w.people?.root].filter((o) => o && o.visible);
        if (!figures) e.scene.traverse((o) => o.isSkinnedMesh && o.visible && hidden.push(o));
        for (const o of hidden) o.visible = false;
        e.renderer.render();
        for (const o of hidden) o.visible = true;
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
        g.fillText(label, 4, 12);
        return cv;
    }
    async function save(name, tiles, cols) {
        const cw = tiles[0].width;
        const ch = tiles[0].height;
        const out = document.createElement("canvas");
        out.width = cw * Math.min(cols, tiles.length);
        out.height = ch * Math.ceil(tiles.length / cols);
        const g = out.getContext("2d");
        tiles.forEach((t, i) => g.drawImage(t, (i % cols) * cw, Math.floor(i / cols) * ch));
        const blob = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.88));
        return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status;
    }
    function reset() {
        for (const c of W.controls.values()) if (W.isOn(c)) W.toggle(c, false);
        for (let i = 0; i < 40 && W.active.size; i++) {
            for (const en of W.enclosures.values()) {
                en.heat = 0;
                en.mist = 0;
                en.running = 0;
            }
            X.step(0.5);
        }
        return W.active.size;
    }
    /** The water's meshes whose names end in one of `hide` ("steam", "haze", "spill", "mist", "rain"…) hidden for a picture. */
    function hideSome(hide) {
        for (const m of W.group.children) if (hide.some((h) => m.name.endsWith(":" + h))) m.visible = false;
    }
    function shots(tiles, id, label, views, width, hide) {
        for (const [k, v] of views.entries()) {
            X.view(id, v);
            hideSome(hide);
            tiles.push(tile(`${label} ${v.name ?? k}`, width));
        }
    }
    async function series(name, id, { on = [2, 6, 15, 30], off = [10, 30, 60], views = [{}], width = 480, cols = null, label = "", door = null, hide = [] } = {}) {
        reset();
        const c = W.controls.get(id);
        if (door !== null) X.door(c.piece, door);
        X.away();
        W.toggle(c, true);
        const tiles = [];
        let t = 0;
        for (const s of on) {
            X.step(s - t);
            t = s;
            const en = c.outlets[0].enclosure;
            shots(tiles, id, `${label} on ${s}s heat ${en?.heat.toFixed(2)} mist ${en?.mist.toFixed(2)}`, views, width, hide);
        }
        W.toggle(c, false);
        t = 0;
        for (const s of off) {
            X.step(s - t);
            t = s;
            const en = c.outlets[0].enclosure;
            shots(tiles, id, `${label} off ${s}s heat ${en?.heat.toFixed(2)} mist ${en?.mist.toFixed(2)}`, views, width, hide);
        }
        const status = await save(name, tiles, cols ?? Math.max(views.length, 1) * (views.length === 1 ? 4 : 1));
        return { status, tiles: tiles.length };
    }
    /**
     * How it moves: the shower `id` run hot for `at` seconds (or with `off`, run to full steam and then off that
     * long), then `n` pictures `every` seconds apart from one view — a strip, saved as `name`.
     */
    async function strip(name, id, { at = 15, off = null, every = 0.4, n = 4, view = {}, width = 640, cols = 2, label = "", door = null, hide = [] } = {}) {
        reset();
        const c = W.controls.get(id);
        if (door !== null) X.door(c.piece, door);
        X.away();
        W.toggle(c, true);
        X.step(at);
        if (off !== null) {
            W.toggle(c, false);
            X.step(off);
        }
        const tiles = [];
        for (let i = 0; i < n; i++) {
            if (i) X.step(every);
            X.view(id, view);
            hideSome(hide);
            tiles.push(tile(`${label} +${(i * every).toFixed(1)}s`, width));
        }
        return { status: await save(name, tiles, cols), tiles: tiles.length };
    }
    /**
     * What the water costs a frame at the poses lane H is held to (__wtime.compare: render() and a pixel read back,
     * water shown against hidden, `rounds` alternating rounds of `n` frames, medians and bests): standing in walk-in
     * a-f125 at full steam (first person); the same walk-in from its bathroom; corner shower a-f032 from outside,
     * its door shut, full steam and its glass misted; A1's kitchen sink running; everything off (the water's group
     * in the scene against taken out); all 70 running, from inside the walk-in. And world.water.update's own time.
     */
    async function timings({ rounds = 8, n = 9, only = null, gpu = false } = {}) {
        // Wall time (render() and a pixel read back: __wtime) or the GPU's own (the timer query: __gtime).
        const T = gpu ? window.__gtime : window.__wtime;
        const rows = [];
        const shown = (on) => () => (W.group.visible = on);
        const want = (name) => !only || only.includes(name);
        const firstPerson = () => {
            if (e.camera.mode !== "first") w.player.toggleView();
        };
        firstPerson();
        const walkIn = W.controls.get("a-f125:control_rain");
        const corner = W.controls.get("a-f032:control_rain");
        const sink = W.controls.get("a-f001:control_sink");
        const valve = walkIn.at.toArray();
        if (want("inside") || want("outside")) {
            reset();
            X.inside("a-f125");
            W.toggle(walkIn, true);
            X.step(20);
            window.__act.aim(valve);
            X.step(0.05);
            if (want("inside")) rows.push({ ...(await T.compare("inside walk-in a-f125, full steam", shown(true), shown(false), { rounds, n })), update: window.__wtime.update(100) });
            if (want("outside")) {
                X.away();
                X.view("a-f125:control_rain", {});
                rows.push(await T.compare("outside walk-in a-f125, full steam", shown(true), shown(false), { rounds, n }));
            }
        }
        if (want("corner")) {
            reset();
            X.door(corner.piece, false);
            X.away();
            W.toggle(corner, true);
            X.step(30);
            X.view("a-f032:control_rain", {});
            rows.push(await T.compare("outside corner a-f032, door shut, full steam, glass misted", shown(true), shown(false), { rounds, n }));
        }
        if (want("kitchen")) {
            reset();
            X.away();
            W.toggle(sink, true);
            X.step(2);
            X.view("a-f001:control_sink", {});
            rows.push(await T.compare("A1 kitchen sink a-f001 running", shown(true), shown(false), { rounds, n }));
        }
        if (want("off")) {
            reset();
            X.inside("a-f125");
            window.__act.aim(valve);
            X.step(0.5);
            const scene = W.group.parent;
            rows.push({ ...(await T.compare("everything off: the water's group in the scene vs taken out", () => scene.add(W.group), () => scene.remove(W.group), { rounds, n })), update: window.__wtime.update(200) });
            scene.add(W.group);
        }
        if (want("all")) {
            reset();
            for (const c of W.controls.values()) W.toggle(c, true);
            X.inside("a-f125");
            X.step(20);
            window.__act.aim(valve);
            X.step(0.05);
            const drawn = [...W.group.children].filter((m) => m.visible).length;
            rows.push({ ...(await T.compare(`all 70 running, from inside walk-in a-f125 (${drawn} meshes drawn)`, shown(true), shown(false), { rounds, n })), update: window.__wtime.update(100) });
        }
        reset();
        return rows.map((r) => ({ label: r.label, delta: r.delta, deltaBest: r.deltaBest, on: r.on.median, off: r.off.median, canvas: r.canvas.join("x"), step: r.step, update: r.update ?? null }));
    }
    window.__steam = { series, strip, reset, tile, save, hideSome, timings };
    return "steam ready";
})();

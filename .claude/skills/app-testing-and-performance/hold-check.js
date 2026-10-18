// hold-check.js: whether the editor's stand-ins, holding its units still (World/StandIns.js: hold, drawnScene), still
// draw the frame three would draw (../walkthrough-editor/editor-plain-light-and-scope.md; speed-architecture.md,
// holdStill). Run it after anything that moves under a held unit: a piece's part opened, a door, a sash, a piece moved
// by its position alone or by the editor, something hidden, a room in focus, the realistic preview and back, the
// colliders. In-page, in an editor tab after boot.js (pace "always"):
//   await eval(await (await fetch("http://127.0.0.1:3199/hold-check.js?" + Date.now())).text())
// window.__hold:
//   audit({ tol, render, root })   every object's world matrix against what three's own full walk would make of it now
//                       (its parent's × its own, composed from position, turn and scale where it composes its own):
//                       { checked, bad, worst, list: [path, error, matrixAutoUpdate, matrixWorldAutoUpdate] (first 20) }
//   same(label)         the frame drawn held, against the same frame with nothing held (StandIns.letGo, `?still=0`'s
//                       way), then held again: { label, held, away, bad (audit), badList, px (pixels more than 2 levels
//                       apart), worst (levels) } — right is bad 0 and px 0
//   grab()              the frame drawn now, read back whole: { w, h, px }
//   cmp(a, b, t)        how many pixels differ by more than t (default 8) and more than 2 levels, the share, the worst
//   await save(name, a, b)   a frame to the sink as a JPEG; with b, dimmed, the pixels more than 2 apart in red
//   stillOn() / stillOff()   hold, or let go and stop holding (StandIns.holds)
(() => {
    if (window.__hold) return "already";
    const e = window.experience;
    const w = e.world;
    const R = e.renderer;
    const si = w.standIns;
    const M = e.scene.matrixWorld.constructor;
    const draw = (n = 2) => {
        for (let i = 0; i < n; i++) R.render();
    };
    const path = (o) => {
        const p = [];
        for (let n = o; n && p.length < 7; n = n.parent) p.push(n.name || n.type);
        return p.join(" < ");
    };
    function audit({ tol = 1e-5, render = true, root = e.scene } = {}) {
        if (render) R.render();
        const stack = [];
        const local = new M();
        let checked = 0;
        let worst = 0;
        let bad = 0;
        const list = [];
        const walk = (o, parentWorld, depth) => {
            const expected = (stack[depth] ??= new M());
            if (o.matrixAutoUpdate) local.compose(o.position, o.quaternion, o.scale);
            else local.copy(o.matrix);
            if (parentWorld) expected.multiplyMatrices(parentWorld, local);
            else expected.copy(local);
            const a = expected.elements;
            const b = o.matrixWorld.elements;
            let err = 0;
            for (let i = 0; i < 16; i++) err = Math.max(err, Math.abs(a[i] - b[i]));
            checked++;
            if (err > tol) {
                bad++;
                if (list.length < 20) list.push([path(o), +err.toFixed(5), o.matrixAutoUpdate, o.matrixWorldAutoUpdate]);
                worst = Math.max(worst, err);
            }
            for (const c of o.children) walk(c, expected, depth + 1);
        };
        walk(root, root.parent ? root.parent.matrixWorld : null, 0);
        return { checked, bad, worst: +worst.toFixed(5), list };
    }
    function grab() {
        const r = R.renderer;
        const gl = r.getContext();
        R.render();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const px = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { w: width, h: height, px };
    }
    function cmp(a, b, t = 8) {
        let n = 0;
        let n2 = 0;
        let worst = 0;
        for (let i = 0; i < a.px.length; i += 4) {
            const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2]));
            if (d > worst) worst = d;
            if (d > t) n++;
            if (d > 2) n2++;
        }
        return { over: n, over2: n2, share: +((n / (a.w * a.h)) * 100).toFixed(4), worst };
    }
    async function save(name, frame, diffWith = null, t = 2) {
        const { w: width, h: height, px } = frame;
        const c = new OffscreenCanvas(width, height);
        const g = c.getContext("2d");
        const img = g.createImageData(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // (Read back bottom row first.)
                const s = ((height - 1 - y) * width + x) * 4;
                const d = (y * width + x) * 4;
                let r = px[s];
                let gg = px[s + 1];
                let b = px[s + 2];
                if (diffWith) {
                    const q = diffWith.px;
                    const dd = Math.max(Math.abs(px[s] - q[s]), Math.abs(px[s + 1] - q[s + 1]), Math.abs(px[s + 2] - q[s + 2]));
                    r *= 0.35;
                    gg *= 0.35;
                    b *= 0.35;
                    if (dd > t) {
                        r = 255;
                        gg = 0;
                        b = 0;
                    }
                }
                img.data[d] = r;
                img.data[d + 1] = gg;
                img.data[d + 2] = b;
                img.data[d + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
        await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob });
        return name;
    }
    const stillOn = () => {
        if (!si) return;
        si.holds = true;
        R.render();
    };
    const stillOff = () => {
        if (!si) return;
        si.holds = false;
        si.letGo();
        R.render();
    };
    function same(label) {
        if (!si) return { label, error: "no stand-ins in this page (a public view): audit() alone applies" };
        draw(2);
        const held = Boolean(si.holding && si.drawn);
        const checked = audit({ render: true });
        const A = grab();
        const holds = si.holds;
        stillOff();
        draw(2);
        const B = grab();
        if (holds) stillOn();
        draw(2);
        const c = cmp(A, B);
        return { label, held, away: [...si.units.values()].filter((u) => u.away).length, bad: checked.bad, badList: checked.list.slice(0, 3), px: c.over2, worst: c.worst };
    }
    window.__hold = { audit, same, grab, cmp, save, stillOn, stillOff };
    return si ? "hold-check ready" : "hold-check ready (no stand-ins in this page: a public view)";
})();

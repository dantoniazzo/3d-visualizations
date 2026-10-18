// hud.js: the top row of the HUD measured — the room readout and the room-lights chip beside it
// (../visitor-interactions/picker-and-keys.md: Q and which room the visitor is in). In-page, through the sink after
// boot.js, in an editor tab or a public view, at the window size to judge (resize_window first: a phone's 375 × 812, a
// tablet's):
//   await eval(await (await fetch("http://127.0.0.1:3199/hud.js?" + Date.now())).text())
// window.__hud:
//   room(id)    the visitor stood in a room (its box's middle, else a point found inside it), out of any seat or pool,
//               40 frames stepped: the readout follows; { at, name, readout }
//   measure()   the row: each shown item's box, the readout's text, title and lines, whether it is cut short, the chip's
//               box and its margin to the window's right edge, the row's margins, whether the page scrolls sideways,
//               and the readout's look (font, padding, colours, border, radius, height)
//   step(n)     world.update + camera.update + afterCamera at 1/60
// A picture of it needs vshot.js (the canvas alone has no HUD).
(() => {
    if (window.__hud) return "already";
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const sb = w.sceneBuilder;
    const r1 = (v) => Math.round(v * 10) / 10;
    function step(frames = 1) {
        for (let i = 0; i < frames; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
        }
    }
    function room(id) {
        const room = sb.spec.rooms.find((r) => r.id === id);
        if (!room) return { error: `no room ${id}` };
        const xs = room.polygon.map((p) => p[0]);
        const zs = room.polygon.map((p) => p[1]);
        // The middle of its box, or the first grid point inside it.
        let at = null;
        const inside = (x, z) => {
            let c = false;
            for (let i = 0, j = room.polygon.length - 1; i < room.polygon.length; j = i++) {
                const [xi, zi] = room.polygon[i];
                const [xj, zj] = room.polygon[j];
                if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
            }
            return c;
        };
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
        if (inside(cx, cz)) at = [cx, cz];
        for (let k = 0; !at && k < 400; k++) {
            const x = Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs));
            const z = Math.min(...zs) + Math.random() * (Math.max(...zs) - Math.min(...zs));
            if (inside(x, z)) at = [x, z];
        }
        if (!at) return { error: `no point found inside ${id}` };
        if (P.seated) P.stand?.({ now: true });
        P.rising = null;
        P.swimmer?.reset();
        sb.settleCollision?.();
        pl.collider.start.set(at[0], room.elevation + 0.36, at[1]);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
        P.actions = {};
        step(40);
        return { at, name: room.name, readout: document.getElementById("room-readout").textContent };
    }
    function box(el) {
        if (!el) return null;
        const style = getComputedStyle(el);
        if (el.hidden || style.display === "none") return null;
        const r = el.getBoundingClientRect();
        if (!r.width) return null;
        return [r1(r.left), r1(r.top), r1(r.width), r1(r.height)];
    }
    function measure() {
        const row = document.querySelector(".hud-top-left");
        const readout = document.getElementById("room-readout");
        const chip = document.getElementById("room-lights");
        const s = getComputedStyle(readout);
        const lineHeight = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
        const inner = readout.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
        const items = [...row.children].map((el) => [el.id || el.className.split(" ")[0], box(el)]).filter(([, b]) => b);
        const chipBox = chip.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        return {
            window: [innerWidth, innerHeight],
            text: readout.textContent,
            title: readout.getAttribute("title"),
            lines: Math.round(inner / lineHeight),
            cut: readout.scrollWidth > readout.clientWidth + 0.5,
            readout: box(readout),
            chip: box(chip) ? { box: box(chip), rightMargin: r1(innerWidth - chipBox.right), label: getComputedStyle(document.getElementById("room-lights-label")).display } : null,
            row: { left: r1(rowBox.left), right: r1(rowBox.right), rightMargin: r1(innerWidth - rowBox.right), height: r1(rowBox.height) },
            items,
            overflow: document.documentElement.scrollWidth > innerWidth,
            look: { font: s.font, padding: s.padding, color: s.color, background: s.backgroundColor, border: s.border, radius: s.borderRadius, height: readout.offsetHeight },
        };
    }
    window.__hud = { room, measure, step };
    return "hud ready";
})();

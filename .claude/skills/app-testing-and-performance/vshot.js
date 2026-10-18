// vshot.js: a picture of the page as the visitor sees it — the frame drawn now with the page's own HUD over it (the
// prompt, the room readout and chip, the touch buttons, a toast) — saved to the sink. harness.js's and the other tools'
// shots are the canvas alone. The DOM is drawn by the browser itself: the body (without its canvas, scripts, iframes
// and videos) and every stylesheet's rules, in an SVG foreignObject over the canvas. In-page, through the sink, in an
// editor tab or a public view:
//   await eval(await (await fetch("http://127.0.0.1:3199/vshot.js?" + Date.now())).text())
//   await __vshot("name.jpg", { width: 1024, quality: 0.88 })   → { dom, loaded, status, size, bytes }
// `dom` false: the HUD could not be drawn (a cross-origin image or font in it) and the picture is the canvas alone.
// Images in the HUD that are not inlined may come out blank. width null: the window's own size.
(() => {
    window.__vshot = async (name, { width = null, quality = 0.88 } = {}) => {
        const e = window.experience;
        const W = window.innerWidth;
        const H = window.innerHeight;
        const scale = width ? width / W : 1;
        const out = document.createElement("canvas");
        out.width = Math.round(W * scale);
        out.height = Math.round(H * scale);
        const g = out.getContext("2d");
        // The frame, read in the same task as its render (preserveDrawingBuffer is false).
        e.renderer.render();
        g.drawImage(e.renderer.renderer.domElement, 0, 0, out.width, out.height);
        // The DOM over it: every stylesheet's rules, and the body without its canvas and scripts.
        let css = "";
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) css += rule.cssText + "\n";
            } catch {}
        }
        const body = document.body.cloneNode(true);
        body.querySelectorAll("canvas, script, iframe, video").forEach((n) => n.remove());
        const html = document.documentElement.cloneNode(false);
        const head = document.createElement("head");
        const style = document.createElement("style");
        style.textContent = css + "\nhtml, body { background: transparent !important; }";
        head.appendChild(style);
        html.appendChild(head);
        html.appendChild(body);
        html.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
        const xhtml = new XMLSerializer().serializeToString(html);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xhtml}</foreignObject></svg>`;
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        const img = new Image();
        const loaded = await new Promise((res) => {
            img.onload = () => res(true);
            img.onerror = () => res(false);
            img.src = url;
            setTimeout(() => res(false), 8000);
        });
        let dom = false;
        if (loaded) {
            try {
                g.drawImage(img, 0, 0, out.width, out.height);
                dom = true;
            } catch {}
        }
        let blob = null;
        try {
            blob = await new Promise((res) => out.toBlob(res, "image/jpeg", quality));
        } catch (error) {
            return { dom, error: String(error) };
        }
        const status = name ? (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + name, { method: "POST", body: blob })).status : null;
        return { dom, loaded, status, size: [out.width, out.height], bytes: blob?.size ?? 0 };
    };
    return "vshot ready";
})();

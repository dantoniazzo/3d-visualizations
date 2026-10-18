// glass-race.js: the glass-door race made to happen on purpose, the regression test of Sky.js's withoutGlaze
// (../baked-view-lighting/baked-drawing.md, the glass-door race). A door's leaves are dressed by the probes
// (ProbeLight.dress: a copy of each lit material) the first time they are lit; if the sky had glazed the windows by
// then (Sky.setGlassView: dark from outside by day), the copy once took that look for the whole visit. It showed in about
// 1 load in 4, so reloading cannot check it: here the windows are glazed as from outside, the leaves' dressing undone and
// done again (as on a page whose probes came after the sky's first glazing), then the windows glazed as from inside,
// and each glass look the glazed leaves wear is counted. In-page, in a public view drawn baked, after boot.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/glass-race.js?" + Date.now())).text()); await __glassRace()
// → { before, glazedDark, dressedWhileGlazed, indoorsAfter, glassDark }: each a map "opacity #colour [probe-lit]" → how
// many glass_solar materials of the door leaves wear it. Right: one look throughout, the leaves' own (Ladonia's 20 glazed
// leaves at "0.62 #6a7f8a", either way round); before the fix they came out "0.78 #4b545a" or "0.12 #eef2f2".
// __glassRace(false) glazes as from inside first. It changes the page's dressing: reload after.
(() => {
    if (window.__glassRace) return "already";
    const e = window.experience;
    const w = e.world;
    const looks = () => {
        const out = {};
        for (const door of w.sceneBuilder.doors) {
            for (const { leaf } of door.leaves ?? []) {
                leaf.traverse((mesh) => {
                    if (!mesh.isMesh) return;
                    for (const m of [].concat(mesh.material)) {
                        if (!/^glass_solar/.test(m?.name ?? "")) continue;
                        const k = `${m.opacity.toFixed(2)} #${m.color.getHexString()}${m.userData.probeLit ? " probe-lit" : ""}`;
                        out[k] = (out[k] ?? 0) + 1;
                    }
                });
            }
        }
        return out;
    };
    window.__glassRace = async (outside = true) => {
        const probes = w.probes;
        const sky = w.sky;
        if (!probes || !sky) return { error: "no probes or no sky in this page (a public view drawn baked has both)" };
        const before = looks();
        // The windows as seen from outside (or inside) by day...
        sky.setGlassView(outside);
        const glazedDark = sky.glassDark;
        // ...and the leaves dressed afresh, as they are the first time the probes light them.
        const leaves = new Set();
        for (const door of w.sceneBuilder.doors) for (const { leaf } of door.leaves ?? []) leaves.add(leaf);
        for (const [mesh, material] of probes.undressed) {
            let leaf = null;
            for (let n = mesh; n && !leaf; n = n.parent) if (leaves.has(n)) leaf = n;
            if (!leaf) continue;
            mesh.material = material;
            probes.dressed.delete(mesh);
        }
        for (const leaf of leaves) probes.tracked.delete(leaf);
        probes.held = null;
        probes.update(1 / 60);
        const dressedWhileGlazed = looks();
        // ...then the camera indoors: the windows clear. What do the leaves wear now?
        sky.setGlassView(!outside);
        await window.__drive?.(300);
        return { before, glazedDark, dressedWhileGlazed, indoorsAfter: looks(), glassDark: sky.glassDark };
    };
    return "glass-race ready";
})();

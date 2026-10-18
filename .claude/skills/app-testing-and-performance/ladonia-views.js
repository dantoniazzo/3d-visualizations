// Ladonia Residence's reference-matched cameras (gallery renders 10–22 of
// konekt-nekretnine.hr project 253) and plan cuts. Load after harness.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/ladonia-views.js")).text());
// then `await __renderSet("r2-")` writes r2-<ref>.jpg for each reference,
// `await __plans("p2-")` the plan cuts 1.5 m above each floor of A/B and C.
// In an editor tab __renderSet turns the realistic preview on first
// (harness.js's __K.realistic: the editor opens under its plain light with
// the houses alone drawn, and a reference is matched for its light, its
// trees and its sky). __plans draws the tab as it is lit: under the plain
// light a cut is evenly lit, which is what a plan cut is read for. Each
// draws at its own size (1920 × 1080, 1600 × 1600) and fov, and gives the
// page its own size and fov back after (Experience.onResize). __renderSet
// leaves the realistic preview on: `await __K.realistic(false)` for the
// plain light again.
(() => {
    const K = window.__K;
    const { e, r } = K;
    const w = e.world;
    window.__POSES = {
        "10": [[36.5, 1.7, 23.4], [9.5, 3.4, 6.5], 42],
        "11": [[24, 3.0, 45.5], [9.5, 2.2, 34.5], 46],
        "12": [[30, 11, -2], [9, 2, -14], 45],
        "13": [[-8.0, 0.7, -4.75], [3.5, 2.6, -9.5], 48],
        "14": [[-1.5, 0.55, -35.5], [5.5, 2.0, -19.5], 42],
        "15": [[34, 16, 54.2], [10, 2, 32.2], 45],
        "16": [[27, 16, 24], [7, 1.5, 7.5], 50],
        "17": [[7.9, 1.35, 7.1], [2.2, 1.25, 10.1], 74],
        "18": [[5.9, 1.25, 6.8], [1.3, 1.25, 8.75], 70],
        "19": [[9.9, 1.45, 28.1], [13.6, 1.12, 25.0], 50],
        "20": [[12.45, 1.47, 25.45], [10.0, 1.47, 28.65], 75],
        "21": [[5.9, 1.15, 3.9], [3.38, 1.1, 2.3], 62],
        "22": [[11.4, 1.45, -3.0], [13.0, 1.25, -0.05], 56],
    };
    const size = (width, height) => {
        r.setSize(width, height, false);
        K.cam.aspect = width / height;
        K.cam.updateProjectionMatrix();
    };
    window.__renderSet = async (prefix, keys = Object.keys(window.__POSES), width = 1600) => {
        await K.realistic?.();
        const fov = K.cam.fov;
        size(1920, 1080);
        const out = {};
        for (const k of keys) {
            const night = k === "16";
            if (night) await w.setLighting?.("night");
            K.pose(...window.__POSES[k]);
            out[k] = await K.save(`${prefix}${k}.jpg`, [K.shot("", width)], 1);
            if (night) await w.setLighting?.("day");
        }
        // (The page's own size, aspect and fov back: left at 1920 × 1080 and the last pose's fov, every later frame of
        // the tab was drawn at them.)
        K.cam.fov = fov;
        e.onResize?.();
        return out;
    };
    const Plane = w.environment.sun.shadow._frustum.planes[0].constructor;
    const V3 = K.cam.position.constructor;
    const plan = async (name, cx, cz, floorY, span) => {
        r.clippingPlanes = [new Plane(new V3(0, -1, 0), floorY + 1.5)];
        const dome = w.sky?.dome?.visible;
        if (w.sky?.dome) w.sky.dome.visible = false;
        const fog = e.scene.fog;
        e.scene.fog = null;
        const h = 120;
        K.cam.up.set(0, 0, -1);
        K.cam.position.set(cx, floorY + h, cz);
        K.cam.lookAt(cx, floorY, cz);
        K.cam.fov = (2 * Math.atan(span / 2 / h) * 180) / Math.PI;
        const far0 = K.cam.far;
        K.cam.far = 400;
        K.cam.updateProjectionMatrix();
        K.cam.updateMatrixWorld();
        r.shadowMap.needsUpdate = true;
        e.renderer.render();
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1400;
        cv.getContext("2d").drawImage(r.domElement, 0, 0, 1400, 1400);
        const status = await K.save(name, [cv], 1);
        r.clippingPlanes = [];
        if (w.sky?.dome) w.sky.dome.visible = dome;
        e.scene.fog = fog;
        K.cam.up.set(0, 1, 0);
        K.cam.far = far0;
        K.cam.updateProjectionMatrix();
        return status;
    };
    window.__plans = async (prefix, which = ["AB0", "AB1", "AB2", "C0", "C1", "C2"]) => {
        const fov = K.cam.fov;
        size(1600, 1600);
        const at = { AB0: [7.5, 8.3, 0, 22], AB1: [7.5, 8.3, 3.0, 22], AB2: [7.5, 8.3, 6.0, 22], B0: [7.5, 32.5, 0, 22], B1: [7.5, 32.5, 3.0, 22], B2: [7.5, 32.5, 6.0, 22], C0: [8.7, -14.25, -1.0, 19], C1: [8.7, -14.25, 2.2, 19], C2: [8.7, -14.25, 5.4, 19] };
        const out = [];
        for (const k of which) out.push(await plan(`${prefix}${k}.jpg`, ...at[k]));
        // (The cut's narrow fov too, else the walk goes on through a 10° lens.)
        K.cam.fov = fov;
        e.onResize?.();
        return out;
    };
    return "views ready";
})();

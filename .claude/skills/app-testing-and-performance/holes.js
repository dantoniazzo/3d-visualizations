// holes.js: what a published view's bird's-eye camera would show of the faces its publish culled
// (../publish-and-bake/culling-and-viewpoints.md; ../visitor-interactions/driving.md). The runtime file carries every
// culled face that casts a shadow (Snapshot.js's shadow casters, the "shadow-casters" group, simplified to 1.5 cm by
// the server). Here they are drawn after the view's own depth, pushed `margin` (5 cm) back along the view ray,
// single-sided ones from the front only (as the editor draws them), two-sided ones from either side, and only those on
// the floors the view shows (BirdView.shows). Every pixel of them that passes the depth test is a face the editor shows
// there and the published view does not: a hole. It is a lower bound: a culled face that casts no shadow (glass,
// alpha-tested leaves) is not carried. Run it after any change to the publish's viewpoints or culling
// (Publish/viewpoints.js, driveViewpoints). In-page, in a public view (/view/<id>), after boot.js:
//   await eval(await (await fetch("http://127.0.0.1:3199/holes.js?" + Date.now())).text())
// window.__holes:
//   look(view)       view = { target: [x, y, z], theta (deg), pitch (deg), radius, level } (or a publish's sample
//                    { position, target, fov }) → { px, casters (the most-seen culled meshes), spots (by the metre) }
//   sweep(targets, { pitches, azimuths, radii, level, minPx })   every combination → { views, holed, px, ms, worst, spots };
//                    pitches and radii are lists (deg, m: [30, 45, 60, 89], [6, 14, 24]), azimuths a COUNT round each
//                    target (8: every 45°) — a list there runs no view at all
//   await shot(view, name, { dot, crop })   the view drawn by the page's own renderer, its holes in magenta over it, to
//                    the sink (with crop, a crop round them too)
//   seenBy(views, { fov, level })   which spots a set of views sees: a publish's samples
//                    (../publish-and-bake/count-views.mjs --dump writes a version's drive samples) — what the
//                    publish itself would have seen of them
//   casters, triangles, margin, camera
// Loading answers { casters, ShaderMaterial, Mesh } (or why it cannot run). The test shows each view's floors on the page
// itself (BirdView.showFloor); every call puts the page's own back when it ends (before 2026-10-17 a walking view was
// left with its upper floors, ceilings and roofs hidden).
// Ladonia, 2026-10-16: 96 views a target; 132 of 864 views with any hole, 1,139 px in all, before the drive samples.
(() => {
    if (window.__holes) return "already";
    const e = window.experience;
    const w = e.world;
    const bv = w.birdView;
    // (An editor tab has no view from above and no runtime: say so rather than throw.)
    if (!bv) return "no bird's-eye view: a public view (/view/<id>) of a published version only";
    const sb = w.sceneBuilder;
    const R = e.renderer.renderer;
    const proto = (o) => Object.getPrototypeOf(o).constructor;
    const Scene = proto(e.scene);
    // (A render target's class, from one the page has: the post-processing's, else a shadow map's.)
    let RT = e.renderer.post?.composer?.renderTarget1 ? proto(e.renderer.post.composer.renderTarget1) : null;
    if (!RT) e.scene.traverse((n) => { if (!RT && n.isLight && n.shadow?.map) RT = proto(n.shadow.map); });
    if (!RT) return "no render target to borrow (no post-processing, no shadow map drawn yet): draw a frame first";
    let ShaderMaterial = null;
    let Mesh = null;
    let Color = null;
    e.scene.traverse((n) => {
        if (!Mesh && n.isMesh) Mesh = proto(n);
        if (!Color && n.material?.color?.isColor) Color = proto(n.material.color);
        if (!ShaderMaterial && n.material?.isShaderMaterial && !n.material.isRawShaderMaterial) ShaderMaterial = proto(n.material);
    });
    const W = 512;
    const H = 384;
    const FloatType = 1015;
    const target = new RT(W, H, { depthBuffer: true, type: FloatType });
    const pixels = new Float32Array(W * H * 4);
    const camera = e.camera.perspectiveCamera.clone();
    const V = camera.position.constructor;
    camera.fov = bv.limits.fov;
    camera.aspect = W / H;
    camera.near = 0.1;
    camera.far = 400;
    camera.updateProjectionMatrix();

    const group = sb.runtime?.scene.getObjectByName("shadow-casters");
    if (!group) return "no runtime shadow casters: a public view of a published version only";
    group.updateMatrixWorld(true);
    const casters = group.children.filter((n) => n.isMesh);
    const margin = { value: 0.05 };
    const holeScene = new Scene();
    const meshes = casters.map((c, i) => {
        const material = new ShaderMaterial({
            uniforms: { margin, id: { value: i + 1 } },
            vertexShader: `
                uniform float margin;
                varying vec3 vWorld;
                void main() {
                    vec4 world = modelMatrix * vec4(position, 1.0);
                    vWorld = world.xyz;
                    vec4 mv = viewMatrix * world;
                    mv.xyz += normalize(mv.xyz) * margin;
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform float id;
                varying vec3 vWorld;
                void main() { gl_FragColor = vec4(vWorld, id); }`,
            side: c.userData.twoSided ? 2 : 0,
            depthTest: true,
            depthWrite: false,
        });
        material.toneMapped = false;
        const mesh = new Mesh(c.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(c.matrixWorld);
        mesh.matrixWorld.copy(c.matrixWorld);
        mesh.frustumCulled = false;
        mesh.userData = { level: c.userData.level ?? 0, kind: c.userData.kind ?? null, name: c.userData.name ?? c.name, twoSided: Boolean(c.userData.twoSided) };
        holeScene.add(mesh);
        return mesh;
    });

    function place(view) {
        const fov = view.fov ?? bv.limits.fov;
        if (camera.fov !== fov) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
        if (view.position) {
            // A publish's sample: from a point, looking at its target.
            camera.position.fromArray(view.position);
            camera.lookAt(new V().fromArray(view.target));
            camera.updateMatrixWorld(true);
            return;
        }
        const phi = ((90 - view.pitch) * Math.PI) / 180;
        const theta = (view.theta * Math.PI) / 180;
        const [tx, ty, tz] = view.target;
        const s = Math.sin(phi);
        camera.position.set(tx + s * Math.sin(theta) * view.radius, ty + Math.cos(phi) * view.radius, tz + s * Math.cos(theta) * view.radius);
        camera.rotation.set(phi - Math.PI / 2, theta, 0, "YXZ");
        camera.updateMatrixWorld(true);
    }

    let shownLevel = null;
    let pageLevel = null;
    function show(level) {
        if (shownLevel === level) return;
        if (shownLevel === null) pageLevel = bv.level;
        shownLevel = level;
        bv.level = level;
        bv.showFloor(level);
        for (const mesh of meshes) mesh.visible = bv.shows(mesh.userData.level, mesh.userData.kind, level);
    }
    /**
     * The page's floors as they were: every floor in the walking view, the view from above's own level when it is on.
     * Each call puts them back when it ends — else a walking view is left with its upper floors, ceilings and roofs
     * hidden (BirdView.showFloor), and whatever is timed or pictured next in the tab is not the page.
     */
    function putBack() {
        if (shownLevel === null) return;
        shownLevel = null;
        bv.level = pageLevel;
        bv.showFloor(bv.active ? bv.level : null);
    }

    function look(view, options) {
        try {
            return measure(view, options);
        } finally {
            putBack();
        }
    }

    function measure(view, { keep = false, all = false } = {}) {
        show(view.level ?? 0);
        place(view);
        const saved = { target: R.getRenderTarget(), autoClear: R.autoClear, alpha: R.getClearAlpha() };
        const color = R.getClearColor(new Color());
        for (const c of casters) c.geometry.setDrawRange(0, Infinity);
        R.setRenderTarget(target);
        R.setClearColor(0x000000, 0);
        R.autoClear = false;
        R.clear(true, true, true);
        R.render(e.scene, camera);
        R.clear(true, false, false);
        R.render(holeScene, camera);
        R.readRenderTargetPixels(target, 0, 0, W, H, pixels);
        R.setRenderTarget(saved.target);
        R.autoClear = saved.autoClear;
        R.setClearColor(color, saved.alpha);
        let px = 0;
        const by = new Map();
        const spots = new Map();
        for (let i = 0; i < W * H; i++) {
            const id = Math.round(pixels[i * 4 + 3]);
            if (id <= 0) continue;
            px++;
            by.set(id, (by.get(id) ?? 0) + 1);
            const key = [0, 1, 2].map((k) => Math.round(pixels[i * 4 + k])).join(",");
            spots.set(key, (spots.get(key) ?? 0) + 1);
        }
        const out = {
            px,
            casters: [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => [meshes[id - 1].userData.name, n]),
            spots: [...spots].sort((a, b) => b[1] - a[1]).slice(0, 8),
        };
        if (keep) out.mask = pixels.slice();
        if (all) out.allSpots = spots;
        return out;
    }

    function sweep(targets, options) {
        try {
            return sweepAll(targets, options);
        } finally {
            putBack();
        }
    }

    function sweepAll(targets, { pitches = [30, 45, 60, 89], azimuths = 8, radii = [6, 14, 24], level = 0, minPx = 1 } = {}) {
        const t0 = performance.now();
        let views = 0;
        let holed = 0;
        let total = 0;
        const worst = [];
        const spots = new Map();
        for (const t of targets) {
            for (const pitch of pitches) {
                for (let a = 0; a < azimuths; a++) {
                    for (const radius of radii) {
                        const view = { target: t, theta: (a * 360) / azimuths, pitch, radius, level };
                        const r = measure(view, { all: true });
                        views++;
                        if (r.px >= minPx) {
                            holed++;
                            total += r.px;
                            worst.push([r.px, view, r.casters.slice(0, 3)]);
                            for (const [key, n] of r.allSpots) spots.set(key, (spots.get(key) ?? 0) + n);
                        }
                    }
                }
            }
        }
        worst.sort((a, b) => b[0] - a[0]);
        return { views, holed, px: total, ms: Math.round(performance.now() - t0), worst: worst.slice(0, 12), spots: [...spots].sort((a, b) => b[1] - a[1]).slice(0, 20), allSpots: spots };
    }

    /**
     * The view drawn by the page's own renderer, from the same camera, its holes in magenta over it (each hole pixel of
     * the 512×384 test a `dot`-wide square, so a sliver shows); with `crop`, also a crop round them, `crop`× enlarged.
     */
    async function shot(view, name, options) {
        try {
            return await shotOf(view, name, options);
        } finally {
            putBack();
        }
    }

    async function shotOf(view, name, { dot = 2, crop = 0 } = {}) {
        // (The page drawn with the floors the test showed: put back once it is drawn, by shot.)
        const r = measure(view, { keep: true });
        const real = e.camera.perspectiveCamera;
        const saved = { pos: real.position.clone(), quat: real.quaternion.clone(), fov: real.fov, aspect: real.aspect };
        real.position.copy(camera.position);
        real.quaternion.copy(camera.quaternion);
        real.fov = camera.fov;
        real.updateProjectionMatrix();
        real.updateMatrixWorld(true);
        e.renderer.render();
        const cv = R.domElement;
        const full = document.createElement("canvas");
        full.width = cv.width;
        full.height = cv.height;
        const g = full.getContext("2d");
        g.drawImage(cv, 0, 0);
        const s = full.height / H;
        const ox = (full.width - W * s) / 2;
        let box = null;
        g.fillStyle = "rgba(255,0,255,0.9)";
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (r.mask[(y * W + x) * 4 + 3] <= 0) continue;
                const px = ox + x * s;
                const py = full.height - (y + 1) * s;
                g.fillRect(px - (dot - 1) * s / 2, py - (dot - 1) * s / 2, s * dot, s * dot);
                box = box ? [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)] : [px, py, px, py];
            }
        }
        Object.assign(real, { fov: saved.fov, aspect: saved.aspect });
        real.position.copy(saved.pos);
        real.quaternion.copy(saved.quat);
        real.updateProjectionMatrix();
        delete r.mask;
        const send = async (canvas, file) => {
            const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.88));
            return (await (window.__realFetch ?? fetch)("http://127.0.0.1:3199/" + file, { method: "POST", body: blob })).status;
        };
        if (name) {
            const out = document.createElement("canvas");
            out.width = 1024;
            out.height = Math.round((1024 * full.height) / full.width);
            out.getContext("2d").drawImage(full, 0, 0, out.width, out.height);
            r.status = await send(out, name);
            if (crop && box) {
                const cw = 1024 / crop;
                const ch = 768 / crop;
                const cx = THREEclamp((box[0] + box[2]) / 2 - cw / 2, 0, full.width - cw);
                const cy = THREEclamp((box[1] + box[3]) / 2 - ch / 2, 0, full.height - ch);
                const zoom = document.createElement("canvas");
                zoom.width = 1024;
                zoom.height = 768;
                const z = zoom.getContext("2d");
                z.imageSmoothingEnabled = false;
                z.drawImage(full, cx, cy, cw, ch, 0, 0, 1024, 768);
                r.crop = { at: [Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch)], status: await send(zoom, name.replace(/\.jpg$/, "-crop.jpg")) };
            }
        }
        r.box = box && box.map(Math.round);
        return r;
    }
    const THREEclamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /**
     * The culled faces a set of views sees (a publish's samples, `{ position, target }`, fov 63 as Snapshot.js's IdPass
     * draws them), by the metre: which of `spots` (keys "x,y,z" from look/sweep) any of them sees.
     */
    function seenBy(views, { fov = bv.limits.fov + 8, level = 0 } = {}) {
        const seen = new Map();
        const t0 = performance.now();
        try {
            for (const v of views) {
                const r = measure({ position: v.position, target: v.target, fov, level }, { all: true });
                for (const [key, n] of r.allSpots) seen.set(key, (seen.get(key) ?? 0) + n);
            }
        } finally {
            putBack();
        }
        return { views: views.length, spots: seen, ms: Math.round(performance.now() - t0) };
    }

    window.__holes = { look, sweep, shot, seenBy, casters: meshes.length, triangles: casters.reduce((s, c) => s + c.geometry.index.count / 3, 0), margin, camera };
    return { casters: meshes.length, ShaderMaterial: Boolean(ShaderMaterial), Mesh: Boolean(Mesh) };
})();

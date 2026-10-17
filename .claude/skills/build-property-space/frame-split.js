// frame-split.js: where a frame's time goes, split by subsystem — what the wave C speed work was found and judged by
// (app-notes.md, Measuring; How a baked view is drawn: what runs every frame). In-page, after boot.js (a public view, or
// an editor tab with its pace "always"):
//   await eval(await (await fetch("http://127.0.0.1:3199/frame-split.js?" + Date.now())).text())
// window.__frame:
//   census()              the scene graph: objects, visible, meshes, lights (by kind, visible, shadow), custom
//                         onBeforeRender, transparent two-sided materials drawn in two passes, matrixAutoUpdate /
//                         matrixWorldAutoUpdate, the programs built
//   split(n, { update })  n frames (world.update + camera + afterCamera + Renderer.render + a 1 px read back), each part
//                         timed: world.update by subsystem ("w.*", wrapped where the world has it), the app's render steps
//                         ("r.*"), three's ("t.*": the matrix walk of the scene, the shadow map, project + sort, the
//                         draws), and per frame the counts ("#…": draws, three's renders, opaque and transparent items).
//                         Means over the frames, ms (performance.now is coarsened to 0.1 ms in this page: a mean of many
//                         frames is not). A subsystem a build lacks is left out, so the same call runs on two builds.
//   deep(n)               world.update's insides (the player's steps, the interaction providers' aim and near, the
//                         probes, the shut batcher, the openables, lamps, people, screens, water, the bird's-eye view):
//                         means over n frames, µs, largest first
//   churn(n)              materials whose version (needsUpdate) moved over n frames, by name: what recompiles or
//                         re-uploads every frame
//   glcount(n)            WebGL calls per frame, by name
//   lights()              every light: kind, shown, intensity, castShadow, layers, path
//   subtrees(depth, min)  per subtree `depth` levels under the scene: objects visited by three's render walk (visible),
//                         drawn, and walked by its matrix walk (and how many compose their own matrix)
//   under(name, depth)    the same under the first object of that name, keyed by names with numbers stripped
//   walked(depth, min)    what the matrix walk visits each render, by subtree: composing (matrixAutoUpdate) or forced
//   drawsBy(n, key, filter)   draws per frame by key(object, material) (default: material name, side, transparent)
//   drawTime(n, key)      each draw's CPU time (program, uniforms, the call), µs a frame, summed by key: the top 30
//   step(n, render)       n frames stepped at 1/60 s, drawn too unless render is false
// The wrappers come off at the end of every call (install()/uninstall() by hand for a longer look).
(() => {
    const e = window.experience;
    const w = e.world;
    const R = e.renderer;
    const three = R.renderer;
    const gl = three.getContext();
    const px = new Uint8Array(4);
    const med = (a) => {
        const s = [...a].sort((x, y) => x - y);
        return s.length ? Math.round(s[Math.floor(s.length / 2)] * 1000) / 1000 : null;
    };
    const Object3D = Object.getPrototypeOf(Object.getPrototypeOf(e.scene));
    const noop = Object3D.onBeforeRender;
    function path(o) {
        const p = [];
        for (let n = o; n && p.length < 6; n = n.parent) p.push(n.name || n.type);
        return p.join("<");
    }
    function census() {
        const out = { objects: 0, visible: 0, meshes: 0, visibleMeshes: 0, autoMatrix: 0, autoWorld: 0, skippedWorld: 0, obr: {}, lights: {}, twoPass: {}, onBeforeCompile: 0, layers0: 0 };
        const walk = (o, shown, walked) => {
            out.objects++;
            if (o.matrixAutoUpdate) out.autoMatrix++;
            if (walked && o.matrixWorldAutoUpdate) out.autoWorld++;
            if (!o.matrixWorldAutoUpdate) out.skippedWorld++;
            shown = shown && o.visible;
            if (shown) out.visible++;
            if (o.isMesh || o.isLine || o.isPoints || o.isSprite) {
                out.meshes++;
                if (shown) {
                    out.visibleMeshes++;
                    if (o.layers.test(e.camera.activeCamera.layers)) out.layers0++;
                    if (o.onBeforeRender !== noop) {
                        const k = (o.name || o.type).replace(/[0-9]+/g, "#").slice(0, 40);
                        out.obr[k] = (out.obr[k] ?? 0) + 1;
                    }
                    for (const m of [].concat(o.material ?? [])) {
                        if (m?.transparent && m.side === 2 && !m.forceSinglePass) {
                            const k = (m.name || m.type).slice(0, 40);
                            out.twoPass[k] = (out.twoPass[k] ?? 0) + 1;
                        }
                        if (m?.onBeforeCompile && m.onBeforeCompile.toString() !== "function(){}" && !/^\(\)\s*=>\s*\{\s*\}$/.test(m.onBeforeCompile.toString())) out.onBeforeCompile++;
                    }
                }
            }
            if (o.isLight) {
                const k = `${o.type}${shown ? "" : " (hidden)"}${o.castShadow ? " shadow" : ""}`;
                out.lights[k] = (out.lights[k] ?? 0) + 1;
            }
            for (const c of o.children) walk(c, shown, walked && o.matrixWorldAutoUpdate);
        };
        walk(e.scene, true, true);
        out.programs = three.info.programs?.length;
        return out;
    }
    function lights() {
        const out = [];
        e.scene.traverse((o) => {
            if (!o.isLight) return;
            let shown = true;
            for (let n = o; n; n = n.parent) shown = shown && n.visible;
            out.push({ type: o.type, name: o.name, shown, intensity: +o.intensity.toFixed(3), shadow: o.castShadow, layers: o.layers.mask, path: path(o) });
        });
        return out;
    }
    function churn(n = 10) {
        const mats = new Map();
        e.scene.traverse((o) => {
            for (const m of [].concat(o.material ?? [])) if (m) mats.set(m, m.version);
        });
        step(n);
        const moved = {};
        for (const [m, v] of mats) {
            if (m.version !== v) {
                const k = `${m.name || m.type}`;
                moved[k] = (moved[k] ?? 0) + (m.version - v);
            }
        }
        return { materials: mats.size, moved };
    }
    function step(n = 1, render = true) {
        for (let i = 0; i < n; i++) {
            e.time.delta = 1 / 60;
            w.update();
            e.camera.update();
            w.afterCamera?.();
            if (render) R.render();
        }
    }
    // ---- the split -------------------------------------------------------------------------------------------
    const T = (window.__frameT ??= { cur: null });
    function add(name, ms) {
        if (!T.cur) return;
        T.cur[name] = (T.cur[name] ?? 0) + ms;
    }
    function count(name, k = 1) {
        if (!T.cur) return;
        T.cur["#" + name] = (T.cur["#" + name] ?? 0) + k;
    }
    const wrapped = [];
    function wrap(obj, key, name, { own = false } = {}) {
        if (!obj || typeof obj[key] !== "function") return;
        const orig = obj[key];
        const had = Object.prototype.hasOwnProperty.call(obj, key);
        let depth = 0;
        obj[key] = function (...a) {
            if (depth > 0) return orig.apply(this, a);
            depth++;
            const t0 = performance.now();
            try {
                return orig.apply(this, a);
            } finally {
                depth--;
                add(name, performance.now() - t0);
                if (own) count(name);
            }
        };
        wrapped.push(() => {
            if (had) obj[key] = orig;
            else delete obj[key];
        });
    }
    function install() {
        if (wrapped.length) return;
        const sb = w.sceneBuilder;
        // world.update by subsystem
        wrap(sb, "updateDoors", "w.doors");
        wrap(sb, "stepCollision", "w.stepCollision");
        wrap(w.player, "update", "w.player");
        wrap(w.player, "updateLookTarget", "w.player.look");
        wrap(w.player, "updatePrompt", "w.player.prompt");
        wrap(w.whereabouts, "update", "w.whereabouts");
        wrap(w.screens, "update", "w.screens");
        wrap(w.vegetation, "update", "w.vegetation");
        wrap(w.scope, "update", "w.scope");
        wrap(w.lamps, "update", "w.lamps");
        wrap(w.roomLight, "update", "w.roomLight");
        wrap(w.roomGlow, "update", "w.roomGlow");
        wrap(w.lampPool, "update", "w.lampPool");
        wrap(sb, "updateSunShade", "w.sunShade");
        wrap(w.probes, "update", "w.probes");
        wrap(w.people, "tick", "w.people");
        wrap(w, "emit", "w.emit");
        wrap(w, "update", "world.update");
        wrap(w, "afterCamera", "world.afterCamera");
        wrap(e.camera, "update", "camera.update");
        wrap(e.guard, "frame", "guard.frame");
        // the app's render
        wrap(R, "render", "R.render");
        wrap(w.standIns, "update", "r.standIns");
        wrap(sb, "drawLight", "r.drawLight");
        wrap(w.roomLight, "draw", "r.roomLight.draw");
        wrap(R.realism, "update", "r.realism");
        wrap(R.post, "render", "r.post");
        wrap(e.colliders, "draw", "r.colliders");
        // three's
        const sm = three.shadowMap;
        wrap(sm, "render", "t.shadowMap");
        let rdepth = 0;
        const render = three.render;
        three.render = function (scene, camera) {
            const t0 = performance.now();
            rdepth++;
            T.inRender = { t0, scene, mw: 0 };
            try {
                return render.call(this, scene, camera);
            } finally {
                rdepth--;
                const ms = performance.now() - t0;
                add("t.render", ms);
                count("t.render");
                const name = scene === e.scene ? "main" : scene.name || "other";
                add("t.render:" + name, ms);
                count("t.render:" + name);
            }
        };
        wrapped.push(() => (three.render = render));
        const rbd = three.renderBufferDirect;
        three.renderBufferDirect = function (...a) {
            const t0 = performance.now();
            try {
                return rbd.apply(this, a);
            } finally {
                add("t.draws", performance.now() - t0);
                count("t.draws");
            }
        };
        wrapped.push(() => (three.renderBufferDirect = rbd));
        // the matrix walk, at its top only
        const umw = Object3D.updateMatrixWorld;
        let mdepth = 0;
        Object3D.updateMatrixWorld = function (force) {
            if (mdepth > 0) return umw.call(this, force);
            mdepth++;
            const t0 = performance.now();
            try {
                return umw.call(this, force);
            } finally {
                mdepth--;
                add(this === e.scene ? "t.matrixWalk(scene)" : "t.matrixWalk(other)", performance.now() - t0);
                if (this === e.scene) count("t.matrixWalk(scene)");
            }
        };
        wrapped.push(() => (Object3D.updateMatrixWorld = umw));
        // the render lists: projectObject (traversal, culling) ends in finish + sort
        const lists = three.renderLists;
        const get = lists.get;
        lists.get = function (scene, depth) {
            const list = get.call(this, scene, depth);
            if (!list.__frameSplit) {
                list.__frame = true;
                const sort = list.sort;
                list.sort = function (...a) {
                    if (T.inRender) {
                        add("t.project(" + (T.inRender.scene === e.scene ? "main" : "other") + ")", performance.now() - T.inRender.t0);
                    }
                    const t0 = performance.now();
                    const r = sort.apply(this, a);
                    add("t.sort", performance.now() - t0);
                    count("t.opaque", this.opaque.length);
                    count("t.transparent", this.transparent.length);
                    return r;
                };
            }
            return list;
        };
        wrapped.push(() => (lists.get = get));
    }
    function uninstall() {
        while (wrapped.length) wrapped.pop()();
    }
    function split(n = 30, { update = true } = {}) {
        install();
        const frames = [];
        try {
            for (let i = 0; i < 5; i++) step(1);
            for (let i = 0; i < n; i++) {
                T.cur = {};
                const t0 = performance.now();
                if (update) {
                    e.time.delta = 1 / 60;
                    const a = performance.now();
                    w.update();
                    const b = performance.now();
                    e.camera.update();
                    w.afterCamera?.();
                    T.cur["=update+camera"] = performance.now() - a;
                    T.cur["=world.update"] = b - a;
                }
                const t1 = performance.now();
                R.render();
                const t2 = performance.now();
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                const t3 = performance.now();
                T.cur["=render cpu"] = t2 - t1;
                T.cur["=readback"] = t3 - t2;
                T.cur["=frame"] = t3 - t0;
                T.cur["#calls"] = three.info.render.calls;
                frames.push(T.cur);
                T.cur = null;
                T.inRender = null;
            }
        } finally {
            uninstall();
        }
        // (Means: performance.now() is coarsened to 0.1 ms in this page.)
        const keys = [...new Set(frames.flatMap((f) => Object.keys(f)))].sort();
        const out = {};
        for (const k of keys) out[k] = Math.round((frames.reduce((s, f) => s + (f[k] ?? 0), 0) / frames.length) * 1000) / 1000;
        return out;
    }
    function glcount(n = 5) {
        const counts = {};
        const orig = {};
        for (const k in gl) {
            if (typeof gl[k] !== "function") continue;
            orig[k] = gl[k];
            gl[k] = function (...a) {
                counts[k] = (counts[k] ?? 0) + 1;
                return orig[k].apply(gl, a);
            };
        }
        try {
            step(n);
        } finally {
            for (const k in orig) delete gl[k];
        }
        const out = {};
        for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) out[k] = Math.round(v / n);
        return out;
    }
    window.__frame = { census, lights, churn, split, glcount, step, install, uninstall, med };
    return "frame-split ready";
})();
// subtrees(depth): per subtree at `depth` under the scene (by path of names), the objects visited by three's render
// walk (visible), drawn (visible meshes on the camera's layer), and walked by the matrix walk.
(() => {
    const e = window.experience;
    window.__frame.subtrees = (depth = 2, min = 20) => {
        const out = {};
        const cam = e.camera.activeCamera;
        const walk = (o, keyPath, shown, walked, d) => {
            const key = d <= depth ? (d === 0 ? "scene" : keyPath + "/" + (o.name || o.type)) : keyPath;
            shown = shown && o.visible;
            const row = (out[key] ??= { all: 0, visible: 0, drawn: 0, walked: 0, auto: 0 });
            row.all++;
            if (shown) row.visible++;
            if (shown && (o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.layers.test(cam.layers)) row.drawn++;
            walked = walked && o.matrixWorldAutoUpdate;
            if (walked) row.walked++;
            if (walked && o.matrixAutoUpdate) row.auto++;
            for (const c of o.children) walk(c, key, shown, walked, d + 1);
        };
        walk(e.scene, "", true, true, 0);
        return Object.fromEntries(Object.entries(out).filter(([, r]) => r.all >= min).sort((a, b) => b[1].visible - a[1].visible));
    };
    return "subtrees ready";
})();
// under(name, depth): like subtrees, under the first object called `name`, keyed by names `depth` levels down, numbers
// stripped so like things add up.
(() => {
    const e = window.experience;
    window.__frame.under = (name, depth = 1, min = 1) => {
        const root = e.scene.getObjectByName(name);
        if (!root) return null;
        let shownRoot = true;
        for (let n = root; n; n = n.parent) shownRoot = shownRoot && n.visible;
        const cam = e.camera.activeCamera;
        const out = {};
        const walk = (o, key, shown, d) => {
            const k = d === 0 ? "." : d <= depth ? key + "/" + (o.name || o.type).replace(/[0-9]+/g, "#").replace(/[a-z]-f#/g, "f") + (o.isMesh ? "[m]" : "") : key;
            shown = shown && o.visible;
            const row = (out[k] ??= { all: 0, visible: 0, drawn: 0, auto: 0 });
            row.all++;
            if (shown) row.visible++;
            if (shown && o.isMesh && o.layers.test(cam.layers)) row.drawn++;
            if (o.matrixAutoUpdate) row.auto++;
            for (const c of o.children) walk(c, k, shown, d + 1);
        };
        walk(root, "", shownRoot, 0);
        return Object.fromEntries(Object.entries(out).filter(([, r]) => r.all >= min).sort((a, b) => b[1].visible - a[1].visible));
    };
    return "under ready";
})();
// drawsBy(n, key): the draws of n frames' renders by what is drawn, keyed by key(object, material) (default: the
// material's name, its side, and whether the material is transparent), per frame.
(() => {
    const e = window.experience;
    const three = e.renderer.renderer;
    window.__frame.drawsBy = (n = 3, key = null, filter = null) => {
        const counts = {};
        const rbd = three.renderBufferDirect;
        const k = key ?? ((o, m) => `${m.name || m.type}|side${m.side}|${m.transparent ? "T" : "O"}`);
        three.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            if (!filter || filter(object, material)) {
                const name = k(object, material, scene);
                counts[name] = (counts[name] ?? 0) + 1;
            }
            return rbd.call(this, camera, scene, geometry, material, object, group);
        };
        try {
            for (let i = 0; i < n; i++) e.renderer.render();
        } finally {
            three.renderBufferDirect = rbd;
        }
        return Object.fromEntries(Object.entries(counts).map(([a, b]) => [a, b / n]).sort((a, b) => b[1] - a[1]));
    };
    return "drawsBy ready";
})();
// deep(n): world.update's insides, each wrapped where it is called from (own methods, providers): medians over n frames,
// µs. Wraps by instance property, so prototype methods called through `this` are caught.
(() => {
    const e = window.experience;
    const w = e.world;
    window.__frame.deep = (n = 30) => {
        const sb = w.sceneBuilder;
        const P = w.player;
        const acc = {};
        const undo = [];
        const wrap = (obj, key, name) => {
            if (!obj || typeof obj[key] !== "function") return;
            const orig = obj[key];
            const own = Object.prototype.hasOwnProperty.call(obj, key);
            obj[key] = function (...a) {
                const t0 = performance.now();
                try {
                    return orig.apply(this, a);
                } finally {
                    acc[name] = (acc[name] ?? 0) + (performance.now() - t0);
                }
            };
            undo.push(() => (own ? (obj[key] = orig) : delete obj[key]));
        };
        for (const k of ["updateColliderMovement", "updateAvatarPosition", "updateAvatarRotation", "updateAvatarAnimation", "updateAvatarFacing", "updateOtherPlayers", "updateLookTarget", "updatePrompt", "updateRoomReadout"]) wrap(P, k, "player." + k);
        wrap(w.interactables, "aim", "inter.aim");
        wrap(w.interactables, "offer", "inter.offer");
        wrap(w.interactables, "prompt", "inter.prompt");
        for (const p of w.interactables?.providers ?? []) {
            wrap(p, "aim", "aim:" + p.name);
            wrap(p, "near", "near:" + p.name);
        }
        wrap(w.collision, "rayIntersect", "collision.rayIntersect");
        wrap(w.whereabouts, "follow", "whereabouts.follow");
        wrap(w.probes, "compose", "probes.compose");
        wrap(w.probes, "roots", "probes.roots");
        wrap(w.probes, "dress", "probes.dress");
        wrap(w.probes, "stillDressed", "probes.stillDressed");
        wrap(w.probes, "sample", "probes.sample");
        wrap(w.probes, "leafLight", "probes.leafLight");
        wrap(sb.shutBatcher, "lightPart", "shut.lightPart");
        wrap(sb.openables, "update", "openables.update");
        wrap(sb, "updateDoorLight", "sb.updateDoorLight");
        wrap(w.lamps, "update", "lamps.update");
        wrap(w.people, "tick", "people.tick");
        wrap(w.screens, "update", "screens.update");
        wrap(w.water, "update", "water.update");
        wrap(w.birdView, "onTick", "bird.onTick");
        const frames = [];
        try {
            for (let i = 0; i < 5; i++) window.__frame.step(1, false);
            for (let i = 0; i < n; i++) {
                for (const k in acc) acc[k] = 0;
                const t0 = performance.now();
                e.time.delta = 1 / 60;
                w.update();
                e.camera.update();
                w.afterCamera?.();
                acc["=update"] = performance.now() - t0;
                frames.push({ ...acc });
            }
        } finally {
            while (undo.length) undo.pop()();
        }
        // (Means, not medians: performance.now() is coarsened to 0.1 ms here, and a mean of many frames is not.)
        const keys = [...new Set(frames.flatMap((f) => Object.keys(f)))];
        const out = {};
        for (const k of keys) out[k] = Math.round((frames.reduce((s, f) => s + (f[k] ?? 0), 0) / frames.length) * 1000);
        return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
    };
    return "deep ready";
})();
// walked(depth): what three's matrix walk visits each render, by subtree (names `depth` levels down), split into the
// nodes that compose their matrix every time (matrixAutoUpdate) and those forced under one that does.
(() => {
    const e = window.experience;
    window.__frame.walked = (depth = 3, min = 10) => {
        const out = {};
        const walk = (o, key, d, force) => {
            const k = d === 0 ? "scene" : d <= depth ? key + "/" + (o.name || o.type).replace(/[0-9]+/g, "#") : key;
            const row = (out[k] ??= { walked: 0, auto: 0, forced: 0 });
            row.walked++;
            if (o.matrixAutoUpdate) row.auto++;
            const f = force || o.matrixAutoUpdate || o.matrixWorldNeedsUpdate;
            if (f) row.forced++;
            for (const c of o.children) if (c.matrixWorldAutoUpdate || f) walk(c, k, d + 1, f);
        };
        walk(e.scene, "", 0, false);
        return Object.fromEntries(Object.entries(out).filter(([, r]) => r.walked >= min).sort((a, b) => b[1].auto - a[1].auto));
    };
    return "walked ready";
})();
// drawTime(n, key): CPU time of each draw (renderBufferDirect: the program set, uniforms uploaded, the call made), µs a
// frame, summed by key(object, material), over n frames.
(() => {
    const e = window.experience;
    const three = e.renderer.renderer;
    window.__frame.drawTime = (n = 20, key = null) => {
        const sums = {};
        const counts = {};
        const rbd = three.renderBufferDirect;
        const k = key ?? ((o, m) => `${m.name || m.type}${o.parent?.name === "shut" ? " (shut)" : ""}`);
        three.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            const t0 = performance.now();
            try {
                return rbd.call(this, camera, scene, geometry, material, object, group);
            } finally {
                const name = k(object, material);
                sums[name] = (sums[name] ?? 0) + (performance.now() - t0);
                counts[name] = (counts[name] ?? 0) + 1;
            }
        };
        try {
            for (let i = 0; i < n; i++) e.renderer.render();
        } finally {
            three.renderBufferDirect = rbd;
        }
        return Object.fromEntries(Object.entries(sums).map(([a, b]) => [a, `${Math.round((b / n) * 1000)}µs/${counts[a] / n}`]).sort((a, b) => parseInt(b[1]) - parseInt(a[1])).slice(0, 30));
    };
    // (The file's last word is what loading it answers.)
    return "frame-split ready";
})();

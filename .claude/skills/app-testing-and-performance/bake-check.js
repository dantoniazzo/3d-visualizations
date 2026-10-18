// In-page checks of a baked public view (/view/<id>), once it has loaded,
// after harness.js and the project's views file (for its __POSES):
//   await eval(await (await fetch("http://127.0.0.1:3199/bake-check.js")).text());
//   await __bakeCheck({ poses: ["17", "19", "21"] })
//
// Mended 2026-10-12. It used to draw `material.lightMap.image` to a canvas,
// which is no longer a picture: where the house's light is resolved into
// one lightmap (World/LightResolver.js) it is a render target's texture,
// and elsewhere (?lightmap=rooms) the decoded picture is given back once
// the GPU has it (Utils/bakedTexture.js). It now reads the bake's own
// lightmap from its file, and what the view draws from the resolver's
// target; what it cannot read it says in `cannot`, and goes on.
//
// Returns:
//   sun    the drawn sun's direction, the bake's, the site sky's, and the
//          angles between them in degrees — all ~0 when the bake was lit by
//          the site's own sky (shared/sky.js); a bake lit by a preset is
//          tens of degrees off (Ladonia's first: 83°)
//   black  each room's part of each lightmapped mesh whose lightmap is all
//          but black (≥ 80 % of samples under 6/255), minus names matching
//          `skip` — read from THE BAKE'S OWN FILE (`file`: the variant's
//          one-scale lightmap at full size, no switch on, every door open),
//          as `<material>@<room>`. Expected: windowless rooms by day,
//          cabinet gaps, bed bases. Not expected: a lit room's walls, floor
//          or furniture — but at a draft's size small pieces (a headboard,
//          pillows) come out black from bleeding alone; judge those in the
//          final
//   drawn  the same scan of WHAT THE VIEW DRAWS NOW — the resolved lightmap
//          (the variant's light, the doors as they stand, every switch that
//          is on; `switchesOn`, `pending`) — so a windowless room whose
//          light starts on by day is not black here. Null, with a line in
//          `cannot`, where the light is not resolved into one lightmap
//   zones  each room's mean light from the bake's probes, darkest first —
//          the time of day's own light, no lamp's in it, every door open
//          (Ladonia: open-plan living rooms 0.03–0.045, one-window bedrooms
//          0.012–0.016, the open air 0.26; the rooms no daylight reaches are
//          the lowest, not 0: Ladonia's twenty 0.00001–0.011). Null in a
//          view drawn fully static, which loads no probes
//   meter  per pose: the room, the light meter's exposure (×1 outside, up
//          to ×32), how it read it ("picture": the frame, with
//          post-processing; "probes" without; "none" fully baked) and how
//          many frames were drawn before the reading came (the meter reads
//          the frame it is asked about a frame or two on); `exposure` null
//          if none came in 120 frames
//   cannot what could not be read, and why — empty when all of it was
(() => {
    const K = window.__K;
    const e = K?.e ?? window.experience;
    const world = e.world;
    const tick = () =>
        new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = resolve;
            channel.port2.postMessage(0);
        });
    const deg = (a, b) => {
        const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        return +((Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI).toFixed(1);
    };
    const unit = (v) => {
        const l = Math.hypot(...v) || 1;
        return v.map((c) => +(c / l).toFixed(4));
    };
    // shared/sky.js's sunDirection, here so it can be checked against.
    const skySun = (sky) => {
        if (!sky?.current?.sun) return null;
        const s = sky.current.sun;
        const t = ((sky.names?.turn ?? 0) * Math.PI) / 180;
        let way = [s.x * Math.cos(t) + s.z * Math.sin(t), s.y, -s.x * Math.sin(t) + s.z * Math.cos(t)];
        const elevation = sky.names?.elevation;
        if (Number.isFinite(elevation)) {
            const el = (elevation * Math.PI) / 180;
            const level = Math.hypot(way[0], way[2]) || 1;
            way = [(way[0] * Math.cos(el)) / level, Math.sin(el), (way[2] * Math.cos(el)) / level];
        }
        return unit(way);
    };

    window.__bakeCheck = async ({ poses = [], skip = /bath|wc|closet|utility|shower|laundry|store/, limit = 40 } = {}) => {
        const out = { cannot: [] };
        const lighting = e.published?.lighting;
        const builder = world.sceneBuilder;
        const variant = world.lighting ?? "day";
        out.version = e.published?.version;
        out.samples = lighting?.samples ?? null;
        out.mode = world.lightingMode;
        out.lighting = variant;
        if (!lighting?.variants?.[variant]) {
            out.cannot.push(`everything: this version has no baked "${variant}" (lighting.variants) — an unbaked version, or the wrong ?version=`);
            return out;
        }

        // The sun.
        const sun = world.environment.sun;
        const drawn = unit(sun.position.clone().sub(sun.target.position).toArray());
        const baked = lighting?.variants?.day?.sun?.position ? unit(lighting.variants.day.sun.position) : null;
        const sky = skySun(world.sky);
        out.sun = {
            drawn,
            baked,
            sky,
            drawnVsBaked: baked ? deg(drawn, baked) : null,
            bakedVsSky: baked && sky ? deg(baked, sky) : null,
        };

        // Lightmaps that are black: each room's part of each lightmapped mesh, by its lightmap UVs.
        const parts = [];
        e.scene.traverse((node) => {
            if (!node.isMesh) return;
            const material = [].concat(node.material)[0];
            const uv = node.geometry?.attributes?.uv1;
            if (!uv || !(node.userData.lighting === "lightmap" || material?.lightMap)) return;
            // (Merged across rooms — World/HouseMerger.js — a mesh has a range a room; else it is all one room's.)
            const ranges = node.userData.ranges ?? [{ zone: node.userData.zone ?? null, vertexStart: 0, vertexCount: uv.count }];
            for (const range of ranges) {
                if (!(range.vertexCount > 0)) continue;
                parts.push({ name: `${node.name.split("@")[0].replace(/#\d+$/, "")}@${range.zone ?? "no room"}`, uv, from: range.vertexStart, count: range.vertexCount });
            }
        });
        /** `level(x, y)`: a texel's brightness, 0–255, row 0 at v = 0. */
        const scan = (width, height, level) => {
            const black = [];
            for (const part of parts) {
                const step = Math.max(1, Math.floor(part.count / 200));
                let sum = 0;
                let n = 0;
                let dark = 0;
                for (let i = part.from; i < part.from + part.count; i += step) {
                    const x = Math.min(width - 1, Math.max(0, Math.floor(part.uv.getX(i) * width)));
                    const y = Math.min(height - 1, Math.max(0, Math.floor(part.uv.getY(i) * height)));
                    const value = level(x, y);
                    sum += value;
                    n++;
                    if (value < 6) dark++;
                }
                if (n && dark / n >= 0.8 && !skip.test(part.name) && !/^(terrain|roof)/.test(part.name)) black.push({ name: part.name, mean: +(sum / n).toFixed(1) });
            }
            const byMaterial = {};
            for (const row of black) {
                const material = row.name.split("@")[0];
                byMaterial[material] = (byMaterial[material] ?? 0) + 1;
            }
            return { scanned: parts.length, count: black.length, byMaterial, parts: black.slice(0, limit).map((row) => `${row.name} ${row.mean}`) };
        };

        // The bake's own lightmap, from its file: its brightness, as it was written (one scale for the whole of it).
        const url = lighting.variants[variant].lightmap;
        out.black = null;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`${response.status} for ${url}`);
            const bitmap = await createImageBitmap(await response.blob());
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.drawImage(bitmap, 0, 0);
            bitmap.close?.();
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            out.black = { file: url.split("/").slice(-2).join("/"), size: canvas.width, ...scan(canvas.width, canvas.height, (x, y) => data[(y * canvas.width + x) * 4]) };
        } catch (error) {
            out.cannot.push(`black: the bake's lightmap file could not be read (${error?.message ?? error})`);
        }

        // What the view draws: the house's light as it is now, resolved into one lightmap (two bytes a texel: R, G).
        const resolver = builder.resolver;
        const target = resolver?.targets?.luma;
        out.drawn = null;
        if (target) {
            try {
                const three = e.renderer.renderer;
                const gl = three.getContext();
                const side = target.width;
                const data = new Uint8Array(side * side * 4);
                const before = three.getRenderTarget();
                three.setRenderTarget(target);
                gl.readPixels(0, 0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, data);
                three.setRenderTarget(before);
                const failed = gl.getError();
                if (failed !== gl.NO_ERROR) throw new Error(`readPixels said ${failed}`);
                const weights = builder.switchWeights || [];
                out.drawn = {
                    size: side,
                    // (Kept in the variant's own scale by day; at night in the lamps', where the same 6/255 is another light.)
                    scale: +resolver.scale.toFixed(3),
                    variantScale: +(resolver.base?.scale ?? NaN).toFixed(3),
                    pending: resolver.pending,
                    switchesOn: weights.filter((weight) => weight > 0).length,
                    ...scan(side, side, (x, y) => (data[(y * side + x) * 4] * 256 + data[(y * side + x) * 4 + 1]) / 257),
                };
                if (resolver.pending) out.cannot.push(`drawn: ${resolver.pending} rooms of the resolved lightmap were still to be drawn when it was read — draw a few frames and run this again`);
            } catch (error) {
                out.cannot.push(`drawn: the resolved lightmap could not be read back (${error?.message ?? error})`);
            }
        } else {
            out.cannot.push(
                "drawn: the house's light is not resolved into one lightmap in this view (?lightmap=rooms, lit live, or a device that cannot) — each room's material adds its switches and doors as it draws, and there is nothing to read back; `black` is the bake's file alone"
            );
        }

        // Each room's light, from the probes: the time of day's own, no lamp's in it.
        const probes = world.probes;
        out.zones = null;
        if (probes) {
            const light = probes.variants?.[variant];
            if (!light) {
                probes.compose();
                out.cannot.push("zones: the probes' light for the time of day alone is not kept apart in this build — what is given has the lamps that are on in it");
            }
            const values = light ?? probes.light;
            const sums = new Float64Array(probes.zoneIds.length);
            const counts = new Uint32Array(probes.zoneIds.length);
            for (let i = 0; i < probes.count; i++) {
                const zone = probes.zoneOf[i];
                if (zone === 255) continue;
                let sum = 0;
                for (let f = 0; f < 6; f++) sum += 0.2126 * values[i * 18 + f * 3] + 0.7152 * values[i * 18 + f * 3 + 1] + 0.0722 * values[i * 18 + f * 3 + 2];
                sums[zone] += sum / 6;
                counts[zone]++;
            }
            out.zones = probes.zoneIds
                .map((id, z) => [id, counts[z] ? +(sums[z] / counts[z]).toPrecision(3) : null])
                .filter(([, mean]) => mean !== null)
                .sort((a, b) => a[1] - b[1])
                .map(([id, mean]) => `${id} ${mean}`);
        } else {
            out.cannot.push(
                world.lightingMode === "static"
                    ? "zones: a view drawn fully static loads no light probes — open it as a computer is given it (?lighting=baked, slider at 2 or more)"
                    : "zones: the light probes are not here (still loading, or the bake has none)"
            );
        }

        // The meter, per pose: frames drawn until it has read the one it was asked about.
        const realism = e.renderer.realism;
        if (poses.length && !(K && window.__POSES)) out.cannot.push("meter: needs harness.js (window.__K) and the project's views file (window.__POSES) loaded first");
        if (poses.length && K && window.__POSES) {
            out.meter = {};
            for (const key of poses) {
                if (!window.__POSES[key]) {
                    out.meter[key] = "no such pose";
                    continue;
                }
                K.pose(...window.__POSES[key]);
                const meter = () => realism.meter;
                const pictured = () => Boolean(e.renderer.post?.frame || (e.renderer.postWanted && e.renderer.quality?.post));
                let room = null;
                let exposure = null;
                let frames = 0;
                for (; frames < 120; frames++) {
                    world.vegetation?.update?.(0.016);
                    e.renderer.render();
                    room = realism.roomOf(K.cam);
                    if (!room || !meter()) break;
                    // (Read from the frame, the reading comes through the GPU a frame or two on.)
                    if (!pictured() || meter().fresh) {
                        exposure = meter().exposure(K.cam, room);
                        if (exposure !== null) break;
                    }
                    await tick();
                    if (frames % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 20));
                }
                if (!room) exposure = 1;
                const method = !room ? null : pictured() ? "picture" : probes ? "probes" : "none";
                out.meter[key] = { room: room?.id ?? "outside", exposure: exposure === null ? null : +exposure.toFixed(2), method, frames };
                if (room && exposure === null) out.cannot.push(`meter: no reading came for pose ${key} in ${frames} frames (${method})`);
            }
        }
        return out;
    };
})();

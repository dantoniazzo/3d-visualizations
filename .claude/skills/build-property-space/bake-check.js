// In-page checks of a baked public view (/view/<id>), once it has loaded,
// after harness.js and the project's views file (for its __POSES):
//   await eval(await (await fetch("http://127.0.0.1:3199/bake-check.js")).text());
//   await __bakeCheck({ poses: ["17", "19", "21"] })
//
// Returns:
//   sun    the drawn sun's direction, the bake's, the site sky's, and the
//          angles between them in degrees — all ~0 when the bake was lit by
//          the site's own sky (shared/sky.js); a bake lit by a preset is
//          tens of degrees off (Ladonia's first: 83°)
//   black  lightmapped meshes whose lightmap is all but black (≥ 80 % of
//          samples under 6/255), by material, minus names matching `skip`.
//          Expected: windowless rooms by day, cabinet gaps, bed bases. Not
//          expected: a lit room's walls, floor or furniture — but at a draft's
//          size small pieces (a headboard, pillows) come out black from
//          bleeding alone; judge those in the final
//   zones  each room's mean light from the bake's probes, darkest first
//          (Ladonia: open-plan living rooms 0.03–0.045, one-window bedrooms
//          0.012–0.016, the open air 0.26; 0 is a room no daylight reaches)
//   meter  per pose: the room, the light meter's exposure (×1 outside, up
//          to ×32) and how it read it ("picture" with post-processing,
//          "probes" without, "none" fully baked)
(() => {
    const K = window.__K;
    const e = K?.e ?? window.experience;
    const world = e.world;
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
        const out = {};
        const lighting = e.published?.lighting;
        out.version = e.published?.version;
        out.samples = lighting?.samples ?? null;
        out.mode = world.lightingMode;

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

        // Lightmaps that are black.
        const images = new Map();
        const pixels = (image) => {
            if (!images.has(image)) {
                const canvas = document.createElement("canvas");
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                context.drawImage(image, 0, 0);
                images.set(image, { w: canvas.width, h: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data });
            }
            return images.get(image);
        };
        const black = [];
        let scanned = 0;
        e.scene.traverse((node) => {
            if (!node.isMesh) return;
            const material = [].concat(node.material)[0];
            const uv = node.geometry?.attributes?.uv1;
            if (!material?.lightMap?.image || !uv) return;
            scanned++;
            const map = pixels(material.lightMap.image);
            const step = Math.max(1, Math.floor(uv.count / 200));
            let sum = 0;
            let n = 0;
            let dark = 0;
            for (let i = 0; i < uv.count; i += step) {
                const x = Math.min(map.w - 1, Math.max(0, Math.floor(uv.getX(i) * map.w)));
                const y = Math.min(map.h - 1, Math.max(0, Math.floor(uv.getY(i) * map.h)));
                const value = map.data[(y * map.w + x) * 4];
                sum += value;
                n++;
                if (value < 6) dark++;
            }
            if (dark / n >= 0.8 && !skip.test(node.name) && !/^(terrain|roof)/.test(node.name)) {
                black.push({ name: node.name, mean: +(sum / n).toFixed(1) });
            }
        });
        const byMaterial = {};
        for (const row of black) {
            const material = row.name.split("@")[0].replace(/#\d+$/, "");
            byMaterial[material] = (byMaterial[material] ?? 0) + 1;
        }
        out.black = { scanned, count: black.length, byMaterial, meshes: black.slice(0, limit).map((r) => `${r.name} ${r.mean}`) };

        // Each room's light, from the probes.
        const probes = world.probes;
        if (probes) {
            probes.compose();
            const sums = new Float64Array(probes.zoneIds.length);
            const counts = new Uint32Array(probes.zoneIds.length);
            for (let i = 0; i < probes.count; i++) {
                const zone = probes.zoneOf[i];
                if (zone === 255) continue;
                let light = 0;
                for (let f = 0; f < 6; f++) light += 0.2126 * probes.light[i * 18 + f * 3] + 0.7152 * probes.light[i * 18 + f * 3 + 1] + 0.0722 * probes.light[i * 18 + f * 3 + 2];
                sums[zone] += light / 6;
                counts[zone]++;
            }
            out.zones = probes.zoneIds
                .map((id, z) => [id, counts[z] ? +(sums[z] / counts[z]).toFixed(4) : null])
                .filter(([, light]) => light !== null)
                .sort((a, b) => a[1] - b[1])
                .map(([id, light]) => `${id} ${light}`);
        }

        // The meter, per pose.
        const realism = e.renderer.realism;
        if (poses.length && K && window.__POSES) {
            out.meter = {};
            for (const key of poses) {
                K.pose(...window.__POSES[key]);
                K.shot("", 160);
                const room = realism.roomOf(K.cam);
                const exposure = room && realism.meter ? realism.meter.exposure(K.cam, room) : 1;
                out.meter[key] = { room: room?.id ?? "outside", exposure: +exposure.toFixed(2), method: room ? realism.meter?.method : null };
            }
        }
        return out;
    };
})();

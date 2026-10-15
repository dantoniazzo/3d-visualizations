/**
 * Each room's own part of a baked lightmap is worked out twice: by the
 * public view, which draws the house's light room by room
 * (shared/lightRegions.js), and by the bake, which writes each room's part
 * with a curve of its own (blender/lib/lightzones.py). A texel the two
 * give to different rooms is opened out with the wrong room's curve. This
 * holds one against the other — over every published bake's rooms there
 * is (published/, or PUBLISH_DIR), and over made-up atlases cut up as the
 * bake cuts one — at a lightmap's size and its smaller copies'.
 *
 *     node scripts/test-light-regions.mjs
 *
 * Needs python3 (any: the Python is plain).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { lightRegions } from "../shared/lightRegions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = join(ROOT, "blender", "lib", "lightzones.py");
const published = process.env.PUBLISH_DIR || join(ROOT, "published");

/** An atlas cut into `count` rectangles with `gap` of it between them, as blender/bake_public.py's zone_rects cuts one. */
function cutUp(count, gap, random) {
    const need = Object.fromEntries(Array.from({ length: count }, (_, k) => [k === 0 ? "outside" : `room-${k}`, k === 0 ? 0.4 : 0.02 + random() * 0.1]));
    const order = Object.keys(need).sort((a, b) => need[b] - need[a]);
    const rects = {};
    const cut = (zones, x, y, w, h) => {
        if (zones.length === 1) {
            rects[zones[0]] = [x + gap / 2, y + gap / 2, Math.max(w - gap, 1e-6), Math.max(h - gap, 1e-6)].map((c) => +c.toFixed(6));
            return;
        }
        const total = zones.reduce((sum, z) => sum + need[z], 0);
        let running = 0;
        let split = 1;
        for (let i = 1; i < zones.length; i++) {
            if (Math.abs(running + need[zones[i - 1]] - total / 2) > Math.abs(running - total / 2) && i > 1) break;
            running += need[zones[i - 1]];
            split = i;
        }
        const share = zones.slice(0, split).reduce((sum, z) => sum + need[z], 0) / total;
        if (w >= h) {
            cut(zones.slice(0, split), x, y, w * share, h);
            cut(zones.slice(split), x + w * share, y, w * (1 - share), h);
        } else {
            cut(zones.slice(0, split), x, y, w, h * share);
            cut(zones.slice(split), x, y + h * share, w, h * (1 - share));
        }
    };
    cut(order, 0, 0, 1, 1);
    return rects;
}

const cases = [];
if (existsSync(published)) {
    for (const scene of readdirSync(published)) {
        const sceneDir = join(published, scene);
        if (!existsSync(join(sceneDir, "manifest.json"))) continue;
        for (const version of readdirSync(sceneDir)) {
            const file = join(sceneDir, version, "manifest.json");
            if (!existsSync(file)) continue;
            const lighting = JSON.parse(readFileSync(file, "utf8")).lighting;
            if (lighting?.zones && lighting.size) cases.push({ name: `${scene} ${version}`, zones: lighting.zones, size: lighting.size });
        }
    }
}
let seed = 12345;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const [count, texels, size] of [[3, 8, 4096], [24, 8, 4096], [94, 4, 4096], [94, 3, 4096], [40, 2, 2048], [12, 8, 1024], [60, 6, 4096], [5, 1, 1024]]) {
    cases.push({ name: `made up: ${count} rooms, ${texels} texels apart at ${size}`, zones: cutUp(count, texels / size, random), size });
}

let failed = 0;
let compared = 0;
for (const { name, zones, size } of cases) {
    for (let at = size; at >= Math.min(size, 1024); at /= 2) {
        const ours = lightRegions(zones, at);
        const theirs = JSON.parse(execFileSync("python3", [PY], { input: JSON.stringify({ zones, size: at }), maxBuffer: 64 * 1024 * 1024 }).toString());
        compared++;
        if (ours === null || theirs === null) {
            if ((ours === null) !== (theirs === null)) {
                failed++;
                console.error(`${name} at ${at}: one finds the rooms too close and the other does not (view: ${ours === null}, bake: ${theirs === null})`);
            }
            continue;
        }
        let off = 0;
        for (const [zone, part] of ours) {
            const other = theirs[zone];
            if (!other || part.luma.some((c, k) => c !== other.luma[k]) || part.chroma.some((c, k) => c !== other.chroma[k])) off++;
        }
        if (off || ours.size !== Object.keys(theirs).length) {
            failed++;
            console.error(`${name} at ${at}: ${off} of ${ours.size} rooms' parts differ`);
        }
    }
}
console.log(`${compared} atlases compared, ${failed} differ`);
process.exit(failed ? 1 : 0);

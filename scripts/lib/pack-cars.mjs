/**
 * The cars the editor offers, made ready for the web after
 * blender/import_cars.py has split them: each car's body and wheels packed
 * (scripts/lib/pack-glb.mjs, textures no larger than 2048 px), its picture
 * turned to WebP, and one index of them all — public/models/cars/index.json
 * — which the editor's car picker lists and the app loads cars by.
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { packGlb } from "./pack-glb.mjs";

export async function packCars(root, only = []) {
    const catalog = JSON.parse(readFileSync(join(root, "assets", "cars", "cars.json"), "utf8"));
    const out = join(root, "public", "models", "cars");
    const cars = [];
    for (const entry of catalog.cars) {
        const dir = join(out, entry.id);
        const metaPath = join(dir, "car.json");
        if (!existsSync(metaPath)) {
            console.warn(`  ${entry.id}: not built (no ${metaPath}) — left out of the index`);
            continue;
        }
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        if (!only.length || only.includes(entry.id)) {
            for (const name of ["body.glb", "wheels.glb"]) {
                console.log(`  packed ${entry.id}/${name}: ${await packGlb(join(dir, name), { maxTexture: 2048 })}`);
            }
            const png = join(dir, "thumb.png");
            if (existsSync(png)) {
                await sharp(png).webp({ quality: 82 }).toFile(join(dir, "thumb.webp"));
                unlinkSync(png);
            }
        }
        const url = (name) => `/models/cars/${entry.id}/${name}`;
        cars.push({
            ...meta,
            files: { body: url("body.glb"), wheels: url("wheels.glb"), thumb: url("thumb.webp") },
            // what choosing it downloads
            bytes: statSync(join(dir, "body.glb")).size + statSync(join(dir, "wheels.glb")).size,
        });
    }
    const index = { default: catalog.default, cars };
    writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
    console.log(`  index: ${cars.length} cars`);
    return index;
}

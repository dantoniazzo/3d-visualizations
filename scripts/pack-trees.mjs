/**
 * The Kosinožići space's trees, ready for the web:
 *
 *   npm run trees -- <folder>     the GLBs scripts/trees/ saved there (one
 *                                 a species, scripts/trees/species.js), into
 *                                 public/models/vegetation/, packed — their
 *                                 UVs kept, the app's textures need them
 *   npm run trees -- --textures   ez-tree's own bark and leaf textures, out
 *                                 of its package, into public/textures/trees/
 *
 * ez-tree is not one of the app's dependencies (it wants a newer three):
 * its package is fetched with `npm pack` for its textures, which it carries
 * inline.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { packGlb } from "./lib/pack-glb.mjs";
import { SPECIES } from "./trees/species.js";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);

if (args.includes("--textures")) {
    const work = mkdtempSync(join(tmpdir(), "ez-tree-"));
    execFileSync("npm", ["pack", "@dgreenheck/ez-tree@1.1.0", "--pack-destination", work], { stdio: "ignore" });
    execFileSync("tar", ["xzf", join(work, "dgreenheck-ez-tree-1.1.0.tgz"), "-C", work]);
    const source = readFileSync(join(work, "package", "build", "ez-tree.es.js"), "utf8");
    // Inline, in the order its textures.js imports them: four barks' ao,
    // colour, normal and roughness, then four leaves.
    const images = [...source.matchAll(/"data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)"/g)].map((m) => Buffer.from(m[1], "base64"));
    const out = join(ROOT, "public", "textures", "trees");
    mkdirSync(out, { recursive: true });
    const [ao, colour, normal, rough] = images.slice(4, 8);
    await sharp(colour).resize(1024, 1024).webp({ quality: 82 }).toFile(join(out, "bark-oak-color.webp"));
    await sharp(normal).resize(1024, 1024).webp({ quality: 90 }).toFile(join(out, "bark-oak-normal.webp"));
    const a = await sharp(ao).resize(512, 512).greyscale().raw().toBuffer();
    const r = await sharp(rough).resize(512, 512).greyscale().raw().toBuffer();
    const arm = Buffer.alloc(512 * 512 * 3);
    for (let i = 0; i < 512 * 512; i++) {
        arm[i * 3] = a[i];
        arm[i * 3 + 1] = r[i];
    }
    await sharp(arm, { raw: { width: 512, height: 512, channels: 3 } }).webp({ quality: 85 }).toFile(join(out, "bark-oak-arm.webp"));
    for (const [k, name] of ["ash", "aspen", "oak", "pine"].entries()) {
        await sharp(images[16 + k]).resize(512, 512).webp({ quality: 88, alphaQuality: 100 }).toFile(join(out, `leaves-${name}.webp`));
    }
    rmSync(work, { recursive: true, force: true });
    console.log(`Wrote ${out}`);
} else {
    const from = args.find((arg) => !arg.startsWith("--"));
    if (!from) {
        console.error("Usage: npm run trees -- <folder with the GLBs> | --textures");
        process.exit(1);
    }
    const out = join(ROOT, "public", "models", "vegetation");
    mkdirSync(out, { recursive: true });
    for (const { name } of SPECIES) {
        const file = join(from, `${name}.glb`);
        if (!existsSync(file)) {
            console.warn(`  ${name}: not in ${from}, kept as it was`);
            continue;
        }
        copyFileSync(file, join(out, `${name}.glb`));
        console.log(`  ${name}: ${await packGlb(join(out, `${name}.glb`), { keepAttributes: true })}`);
    }
}

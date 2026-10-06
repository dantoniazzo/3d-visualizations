/**
 * Downloads the bought-in assets the Kosinožići space is drawn with — PBR
 * textures and skies from Poly Haven, and grass from ambientCG (all CC0) —
 * and makes them ready for the
 * web in public/: each texture's colour, normal and packed AO/roughness/
 * metalness maps as WebP no larger than the size listed, each sky's HDR for
 * the light (1k) and its tone-mapped picture, cropped to the sky above the
 * horizon, for the background. Sources and licences: assets/THIRD_PARTY.md.
 *
 *   npm run site-assets            (skips what is already there)
 *   npm run site-assets -- --force
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const FORCE = process.argv.includes("--force");
const UA = { "User-Agent": "Mozilla/5.0 (space-walkthrough asset fetch)" };

/** id → [the size its maps are kept at, what it is for]. */
export const TEXTURES = {
    beige_wall_001: [1024, "the villas' render"],
    castle_wall_slates: [1024, "dry-stone walls"],
    rust_coarse_01: [512, "corten planters"],
    rectangular_paving: [1024, "terrace paving"],
    asphalt_02: [1024, "road and parking"],
    concrete_pavement: [1024, "pavement"],
    wooden_planks: [1024, "decking and pergola slats"],
    aerial_grass_rock: [1024, "the hillside"],
    forest_leaves_02: [1024, "forest floor"],
    gravel_floor_02: [512, "verges"],
    rounded_square_tiled_wall: [512, "pool mosaic"],
    concrete_floor_01: [512, "steps and copings"],
    granite_tile_04: [1024, "pale stone terraces (Ladonia)"],
    rustic_stone_wall_02: [1024, "ledgestone cladding (Ladonia)"],
};

/** ambientCG id → [size, what it is for]: greener grass than Poly Haven's. */
export const AMBIENTCG = {
    Grass001: [1024, "lawns"],
    Grass004: [1024, "meadows"],
};

/** id → what it is for. */
export const SKIES = {
    kloofendal_48d_partly_cloudy_puresky: "day",
    qwantani_dusk_2_puresky: "dusk and night",
};

async function api(path) {
    const response = await fetch(`https://api.polyhaven.com/${path}`, { headers: UA });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
}

async function download(url) {
    const response = await fetch(url, { headers: UA });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

async function textures() {
    for (const [id, [size]] of Object.entries(TEXTURES)) {
        const dir = join(ROOT, "public", "textures", "pbr", id);
        if (!FORCE && existsSync(join(dir, "arm.webp"))) continue;
        mkdirSync(dir, { recursive: true });
        const files = await api(`files/${id}`);
        const resolution = size > 1024 ? "4k" : "2k";
        for (const [key, name, quality] of [["Diffuse", "diff", 82], ["nor_gl", "nor", 90], ["arm", "arm", 85]]) {
            const source = await download(files[key][resolution].jpg.url);
            await sharp(source).resize(size, size).webp({ quality }).toFile(join(dir, `${name}.webp`));
        }
        console.log(`  ${id}`);
    }
}

async function skies() {
    const dir = join(ROOT, "public", "textures", "sky");
    mkdirSync(dir, { recursive: true });
    for (const id of Object.keys(SKIES)) {
        if (!FORCE && existsSync(join(dir, `${id}.webp`))) continue;
        const files = await api(`files/${id}`);
        writeFileSync(join(dir, `${id}_1k.hdr`), await download(files.hdri["1k"].hdr.url));
        // The background: the tone-mapped picture's sky, from the zenith to
        // a little under the horizon, which the ground hides.
        const picture = sharp(await download(files.tonemapped.url));
        const { width, height } = await picture.metadata();
        await picture
            .extract({ left: 0, top: 0, width, height: Math.round(height * 0.56) })
            .resize(4096, Math.round(2048 * 0.56))
            .webp({ quality: 80 })
            .toFile(join(dir, `${id}.webp`));
        console.log(`  ${id}`);
    }
}

/**
 * ambientCG's: a zip of each map, unpacked, its colour, its normal (GL)
 * and its ambient occlusion and roughness packed as Poly Haven packs them.
 */
async function ambientcg() {
    for (const [id, [size]] of Object.entries(AMBIENTCG)) {
        const dir = join(ROOT, "public", "textures", "pbr", `acg_${id.toLowerCase()}`);
        if (!FORCE && existsSync(join(dir, "arm.webp"))) continue;
        mkdirSync(dir, { recursive: true });
        const work = mkdtempSync(join(tmpdir(), "acg-"));
        writeFileSync(join(work, "maps.zip"), await download(`https://ambientcg.com/get?file=${id}_2K-JPG.zip`));
        execFileSync("unzip", ["-q", "-o", join(work, "maps.zip"), "-d", work]);
        const file = (suffix) => join(work, readdirSync(work).find((name) => name.endsWith(`_${suffix}.jpg`)));
        await sharp(file("Color")).resize(size, size).webp({ quality: 82 }).toFile(join(dir, "diff.webp"));
        await sharp(file("NormalGL")).resize(size, size).webp({ quality: 90 }).toFile(join(dir, "nor.webp"));
        const ao = await sharp(file("AmbientOcclusion")).resize(size, size).greyscale().raw().toBuffer();
        const rough = await sharp(file("Roughness")).resize(size, size).greyscale().raw().toBuffer();
        const arm = Buffer.alloc(size * size * 3);
        for (let i = 0; i < size * size; i++) {
            arm[i * 3] = ao[i];
            arm[i * 3 + 1] = rough[i];
        }
        await sharp(arm, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 85 }).toFile(join(dir, "arm.webp"));
        rmSync(work, { recursive: true, force: true });
        console.log(`  ${id}`);
    }
}

await textures();
await ambientcg();
await skies();
console.log("Done.");

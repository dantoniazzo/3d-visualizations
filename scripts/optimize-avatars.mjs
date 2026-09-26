/**
 * Shrink the avatars without changing how they look or move — seen, as
 * they are, a few metres off.
 *
 * The source characters (assets/avatars/) keyframe every bone on every
 * frame of every clip, which is four fifths of their 9 MB, though most
 * bones hardly move. Resampling drops each key that sits on the straight
 * line between its neighbours; meshopt then packs what is left, rotations
 * and normals with its own filters, the mesh with it. A coarser tolerance
 * saves little more and shows: a slow idle drifts by degrees. The "Waving" clip, which nothing plays, is left out, and so
 * are the face's morph targets (a mouth that opens and smiles), which
 * nothing drives.
 *
 * The textures are sized for the screen they end up on: an avatar is a few
 * hundred pixels tall at most, so no texture needs to be more than 512
 * square, nor a normal map — fine detail on a shoe or a hoodie's weave —
 * more than 256. All are WebP.
 *
 * The results go to public/models/, where the app loads them.
 *
 *   npm run avatars
 */
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets", "avatars");
const OUT = join(ROOT, "public", "models");

/** Clips no avatar plays. Clips are matched by position, so only the last may go. */
const UNUSED_CLIPS = new Set(["Waving"]);
/** How far a resampled key may be from the curve it stands for. */
const TOLERANCE = 0.0001;
const TEXTURE_SIZE = 512;
const NORMAL_SIZE = 256;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
});

/** On disk, and as sent — the server gzips it. */
const size = async (path) => {
    const bytes = (await stat(path)).size;
    const sent = gzipSync(readFileSync(path)).length;
    return `${(bytes / 1024).toFixed(0)} KB (${(sent / 1024).toFixed(0)} KB sent)`;
};

for (const file of (await readdir(SOURCE)).filter((f) => f.endsWith(".glb"))) {
    const input = join(SOURCE, file);
    const output = join(OUT, basename(file));
    const document = await io.read(input);
    const root = document.getRoot();

    for (const animation of root.listAnimations()) {
        if (UNUSED_CLIPS.has(animation.getName())) animation.dispose();
    }
    for (const mesh of root.listMeshes()) {
        mesh.setWeights([]);
        for (const prim of mesh.listPrimitives()) {
            for (const target of prim.listTargets()) target.dispose();
        }
    }

    // Decoded on read; written back with meshopt instead.
    for (const extension of root.listExtensionsUsed()) {
        if (extension.extensionName === "KHR_draco_mesh_compression") extension.dispose();
    }

    await document.transform(
        resample({ tolerance: TOLERANCE }),
        prune(),
        dedup(),
        textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^normalTexture$/, resize: [NORMAL_SIZE, NORMAL_SIZE], quality: 85 }),
        textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^(?!normalTexture$)/, resize: [TEXTURE_SIZE, TEXTURE_SIZE], quality: 85 }),
        meshopt({ encoder: MeshoptEncoder, level: "high" })
    );
    await io.write(output, document);
    console.log(`  ${file}: ${await size(input)} -> ${await size(output)}`);
}

/**
 * Pack a GLB for the web, in place, without changing how it looks: shared
 * accessors and materials merged, anything unused dropped, the meshes
 * compressed with meshopt — which the app's loader decodes
 * (frontend/Experience/Utils/Loaders.js).
 */
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

/** @returns {Promise<string>} its size before and after, as sent (gzipped) */
export async function packGlb(path) {
    await MeshoptEncoder.ready;
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        "meshopt.encoder": MeshoptEncoder,
        "meshopt.decoder": MeshoptDecoder,
    });
    const sent = () => gzipSync(readFileSync(path)).length;
    const before = sent();
    const document = await io.read(path);
    await document.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    await io.write(path, document);
    const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
    return `${kb(before)} -> ${kb(sent())} sent (${kb(statSync(path).size)} on disk)`;
}

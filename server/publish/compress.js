/**
 * What the public view downloads: a snapshot's geometry Draco-compressed,
 * and without the spec, which it fetches on its own. Positions keep 16 bits
 * over the whole house — under a millimetre — so neighbouring surfaces in
 * different meshes still meet. Custom attributes — the baked vertex light,
 * _DAY and _NIGHT — are kept at 12 bits over their range.
 *
 * Without `draco` (a version published with compression off, to compare)
 * the geometry is left as it is, and only the spec is taken out.
 *
 * glTF-Transform is a development dependency: publishing runs on the
 * machine the space is edited on.
 */
export async function compressView(glb, { draco: useDraco = true } = {}) {
    const [{ NodeIO }, { KHRONOS_EXTENSIONS }, { dedup, draco, prune }, draco3d] = await Promise.all([
        import("@gltf-transform/core"),
        import("@gltf-transform/extensions"),
        import("@gltf-transform/functions"),
        import("draco3dgltf").then((module) => module.default),
    ]);
    const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({
        "draco3d.encoder": await draco3d.createEncoderModule(),
        "draco3d.decoder": await draco3d.createDecoderModule(),
    });
    const document = await io.readBinary(new Uint8Array(glb.buffer, glb.byteOffset, glb.length));
    for (const scene of document.getRoot().listScenes()) {
        const { spec, ...rest } = scene.getExtras();
        scene.setExtras(rest);
    }
    await document.transform(
        dedup(),
        // The file's own materials have no textures, but the live ones the
        // public view swaps in do: their UVs have to stay.
        prune({ keepAttributes: true }),
        ...(useDraco ? [draco({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8 })] : [])
    );
    return Buffer.from(await io.writeBinary(document));
}

/** How far a simplified collision mesh may stray from the one it stands for. */
const COLLISION_TOLERANCE = 0.015;

/**
 * A version's runtime file (frontend/Experience/Publish/Runtime.js): what
 * the public view would otherwise build the whole house for — what to
 * collide with, the real materials, the glass. Its collision meshes are
 * simplified to within a centimetre and a half — a sofa's curves are
 * thousands of triangles the visitor's capsule, a third of a metre wide,
 * cannot feel — and everything Draco-compressed with the view.
 */
export async function compressRuntime(glb, { draco: useDraco = true } = {}) {
    const [{ NodeIO }, { KHRONOS_EXTENSIONS }, { dedup, draco, prune, simplifyPrimitive, weldPrimitive }, { MeshoptSimplifier }, draco3d] =
        await Promise.all([
            import("@gltf-transform/core"),
            import("@gltf-transform/extensions"),
            import("@gltf-transform/functions"),
            import("meshoptimizer"),
            import("draco3dgltf").then((module) => module.default),
        ]);
    await MeshoptSimplifier.ready;
    const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({
        "draco3d.encoder": await draco3d.createEncoderModule(),
        "draco3d.decoder": await draco3d.createDecoderModule(),
    });
    const document = await io.readBinary(new Uint8Array(glb.buffer, glb.byteOffset, glb.length));

    let before = 0;
    let after = 0;
    for (const node of document.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh || !node.getExtras()?.collision) continue;
        for (const prim of mesh.listPrimitives()) {
            const position = prim.getAttribute("POSITION");
            if (!position) continue;
            before += triangles(prim);
            weldPrimitive(prim);
            const min = position.getMin([]);
            const max = position.getMax([]);
            const radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
            if (radius > COLLISION_TOLERANCE) {
                simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error: COLLISION_TOLERANCE / radius });
            }
            after += triangles(prim);
        }
    }

    await document.transform(
        dedup(),
        prune(),
        ...(useDraco ? [draco({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8 })] : [])
    );
    return { glb: Buffer.from(await io.writeBinary(document)), collision: { before, after } };
}

function triangles(prim) {
    const indices = prim.getIndices();
    return (indices ? indices.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
}

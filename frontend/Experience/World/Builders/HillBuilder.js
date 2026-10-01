import * as THREE from "three";

import { hillHeight } from "../../../../shared/vegetation.js";

/** The ground under the hills is a grid this many metres a square. */
const STEP = 1.0;

/**
 * The small hills behind the house (shared/vegetation.js's planHills), as
 * the house's own ground: a grid over the band they fill, each point at
 * the hills' height there, in the fields' grass — hill_grass, the ground
 * past the plot's rough_grass under another name, so the hills rise out of
 * it as one and the bake can give them coarser texels — mapped in world
 * metres as the floors are. Drawn, published, baked and walked on.
 *
 * @param {object} hills  planHills's
 * @param {MaterialLibrary} materials
 * @returns {THREE.Mesh}
 */
export function buildHills(hills, materials, finish = "hill_grass") {
    const columns = Math.ceil((hills.right - hills.left) / STEP);
    const rows = Math.ceil((hills.near - hills.far) / STEP);
    const tile = materials.tileSize(finish);
    const positions = [];
    const uvs = [];
    for (let row = 0; row <= rows; row++) {
        const v = hills.far + (row / rows) * (hills.near - hills.far);
        for (let column = 0; column <= columns; column++) {
            const u = hills.left + (column / columns) * (hills.right - hills.left);
            const x = hills.across[0] * u + hills.dir[0] * v;
            const z = hills.across[1] * u + hills.dir[1] * v;
            positions.push(x, hillHeight(hills, x, z), z);
            // As a slab's: (x, -z) in metres, over the tile (StructureBuilder).
            uvs.push(x / tile, -z / tile);
        }
    }
    const indices = [];
    const width = columns + 1;
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const a = row * width + column;
            const b = a + 1;
            const c = a + width;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    // Facing up, whichever way `across` runs.
    geometry.computeVertexNormals();
    if (geometry.getAttribute("normal").getY(0) < 0) {
        for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, materials.getSurface(finish, "ground"));
    mesh.name = "hills";
    // Published whole: walked round, the backs of the hills are seen too
    // (Publish/Snapshot.js).
    mesh.userData = { label: "Hills", keepWhole: true };
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
}

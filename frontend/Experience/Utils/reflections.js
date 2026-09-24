import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import Experience from "../Experience.js";

/**
 * Something for shiny surfaces to reflect.
 *
 * Without an environment map a metal has nothing to mirror, so chrome, steel
 * and mirrors render close to black whatever the lights do. A neutral studio
 * room, prefiltered once, gives them believable reflections.
 *
 * It is attached per material rather than as `scene.environment`: that would
 * also light every painted wall and fabric with the studio's ambient, and
 * wash out a scene whose lighting is tuned without it. Only metals and clear
 * glass get it, which reflect it and are otherwise lit as before.
 */

/** How strongly each kind of surface reflects the room. */
const INTENSITY = { metal: 1.0, glass: 0.7 };

let texture = null;

/** The prefiltered environment map, built on first use and then shared. */
export function environmentMap() {
    if (texture) return texture;
    const renderer = new Experience().renderer.renderer;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    texture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return texture;
}

/** "metal", "glass", or null for a surface that should not reflect. */
function kindOf(material) {
    if (!material?.isMeshStandardMaterial) return null;
    // A fully rough "metal" is glTF's stand-in for a mesh with no material,
    // and a metalness map means an asset authored for its own lighting
    // (the avatars): neither is a polished surface.
    if (material.metalness >= 0.5 && material.roughness < 0.6 && !material.metalnessMap) {
        return "metal";
    }
    if ((material.transmission ?? 0) > 0) return "glass";
    if (material.transparent && material.roughness <= 0.1) return "glass";
    return null;
}

/** Give a material the environment map if it is a metal or clear glass. */
export function applyReflection(material) {
    const kind = kindOf(material);
    if (!kind) return material;
    const map = environmentMap();
    if (material.envMap !== map) {
        material.envMap = map;
        material.envMapIntensity = INTENSITY[kind];
        material.needsUpdate = true;
    }
    return material;
}

/** Give every reflective material under `root` the environment map. */
export function applyReflections(root) {
    root.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) applyReflection(material);
    });
}

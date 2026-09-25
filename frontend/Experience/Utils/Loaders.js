import * as THREE from "three";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export default class Loaders {
    constructor() {
        this.loaders = {};
        this.setLoaders();
    }

    setLoaders() {
        this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader();
        this.loaders.textureLoader = new THREE.TextureLoader();

        this.loaders.gltfLoader = new GLTFLoader();
        this.loaders.dracoLoader = new DRACOLoader();
        this.loaders.dracoLoader.setDecoderPath("/draco/");
        this.loaders.gltfLoader.setDRACOLoader(this.loaders.dracoLoader);
        // The avatars are meshopt-compressed (scripts/optimize-avatars.mjs):
        // it packs animation as well as meshes, and decodes fast on a phone.
        this.loaders.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
}

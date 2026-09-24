import * as THREE from "three";

import Experience from "./Experience.js";

export default class Renderer {
    constructor() {
        this.experience = new Experience();
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;
        this.camera = this.experience.camera;

        this.setRenderer();
    }

    setRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "high-performance",
        });

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
    }

    setExposure(value) {
        this.renderer.toneMappingExposure = value;
    }

    onResize() {
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        this.experience.world?.editor?.onResize(this.sizes);
    }

    update() {
        const camera = this.camera.activeCamera;
        // The editor draws its own frame: selection outline and gizmo on top —
        // in edit mode, and in the walkthrough while something is selected.
        const editor = this.experience.world?.editor;
        if (editor?.draws && editor.render(this.renderer, this.scene, camera)) return;
        this.renderer.render(this.scene, camera);
    }
}

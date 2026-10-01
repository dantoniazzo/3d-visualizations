import * as THREE from "three";

import Experience from "./Experience.js";
import Stats from "./Utils/Stats.js";
import { LOW_POWER } from "./Utils/device.js";
import { installFilmic } from "./Utils/filmic.js";

export default class Renderer {
    constructor() {
        this.experience = new Experience();
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;
        this.camera = this.experience.camera;

        this.setRenderer();
        if (Stats.enabled()) {
            this.stats = new Stats(this.renderer, this.sizes, () => this.experience.published, () => this.experience.world?.readyIn);
        }
    }

    setRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "high-performance",
        });

        // Three's ACES Filmic, as Fluffy Tree draws its garden, or Blender's
        // Filmic view transform, as Blender shows the same light
        // (Utils/filmic.js): the garden's colour setting (setToneMapping).
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        installFilmic();
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.exposure = 1;
        this.exposureScale = 1;
        this.renderer.toneMappingExposure = 1;

        this.renderer.shadowMap.enabled = true;
        // Soft filtering takes several times the shadow samples per pixel.
        this.renderer.shadowMap.type = LOW_POWER ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
    }

    /** The light's exposure — the preset's, or the bake's. */
    setExposure(value) {
        this.exposure = value;
        this.renderer.toneMappingExposure = this.exposure * this.exposureScale;
    }

    /**
     * The garden's colour settings: which tone mapping — "aces" or
     * "filmic" — and how much more or less exposed than the light's own.
     * Every material follows at its next draw.
     */
    setToneMapping(name, scale = 1) {
        this.renderer.toneMapping = name === "filmic" ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
        this.exposureScale = scale;
        this.setExposure(this.exposure);
    }

    onResize() {
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        this.experience.world?.editor?.onResize(this.sizes);
    }

    update() {
        this.stats?.begin();
        this.render();
        this.stats?.end();
    }

    render() {
        const camera = this.camera.activeCamera;
        // The editor draws its own frame: selection outline and gizmo on top —
        // in edit mode, and in the walkthrough while something is selected.
        const editor = this.experience.world?.editor;
        if (editor?.draws && editor.render(this.renderer, this.scene, camera)) return;
        this.renderer.render(this.scene, camera);
    }
}

import * as THREE from "three";

import Experience from "./Experience.js";
import Stats from "./Utils/Stats.js";
import { QUALITY, guardContextLoss, onQualityChange } from "./Utils/device.js";
import { installFilmic } from "./Utils/filmic.js";
import { installSoftShadows } from "./Utils/softShadows.js";
import Realism from "./Realism.js";

/** How many times each material's shader has been built again after failing to link (Renderer.relinkFailed). */
const RELINKS = new WeakMap();
/** The programs whose every material has had its tries: no longer looked for. */
const GIVEN_UP = new WeakSet();

/** A material given a program key it has not had, so three builds its shader again. */
function relink(material, tries) {
    const base = material.customProgramCacheKey;
    material.customProgramCacheKey = function () {
        return `${base.call(this)}|relink${tries}`;
    };
    material.needsUpdate = true;
}

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
        // The Performance ↔ Quality slider (Utils/device.js), applied live.
        this.realism = new Realism(this.experience);
        this.quality = QUALITY;
        this.bloom = { on: false, strength: 0.7 };
        this.stopQuality = onQualityChange((quality, previous) => this.applyQuality(quality, previous));
        this.frames = 0;
    }

    setRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "high-performance",
        });
        // A step too heavy for this GPU: start lower on the next visit.
        guardContextLoss(this.canvas);

        // Three's ACES Filmic, as Fluffy Tree draws its garden, or Blender's
        // Filmic view transform, as Blender shows the same light
        // (Utils/filmic.js): the garden's colour setting (setToneMapping).
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        installFilmic();
        installSoftShadows();
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.exposure = 1;
        this.exposureScale = 1;
        this.adaptation = 1;
        this.renderer.toneMappingExposure = 1;

        this.renderer.shadowMap.enabled = true;
        // Soft filtering takes several times the shadow samples per pixel.
        this.renderer.shadowMap.type = shadowType(QUALITY);

        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
    }

    /** The light's exposure — the preset's, or the bake's. */
    setExposure(value) {
        this.exposure = value;
        this.renderer.toneMappingExposure = this.exposure * this.exposureScale * this.adaptation;
    }

    /**
     * The eye's (or the camera's) adaptation on top of the light's own
     * exposure: brighter in a room by day, as an interior is photographed
     * (Realism.js); 1 everywhere else.
     */
    setAdaptation(value) {
        if (value === this.adaptation) return;
        this.adaptation = value;
        this.setExposure(this.exposure);
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

    /**
     * Draw through post-processing (PostProcessing.js) — ambient occlusion,
     * bloom at night, the grade — or, given false, straight to the screen
     * again. Asked for by a view lit live under its own sky; made only at
     * the slider's steps that draw through it (QUALITY.post), and made or
     * dropped as the slider moves (applyQuality).
     */
    async usePost(on = true, options = {}) {
        this.postWanted = on ? options : null;
        if (!on || !this.quality.post) {
            this.post?.dispose();
            this.post = null;
            return null;
        }
        // A chunk of its own, downloaded only for a view drawn through it.
        const { default: PostProcessing } = await import("./PostProcessing.js");
        if (!this.postWanted || !this.quality.post) return null;
        if (!this.post) {
            this.post = new PostProcessing(this.renderer, this.scene, this.camera.activeCamera, {
                width: this.sizes.width,
                height: this.sizes.height,
                pixelRatio: this.sizes.pixelRatio,
                ...this.postWanted,
            });
            this.post.setBloom(this.bloom.on, this.bloom.strength);
        }
        return this.post;
    }

    /** Bloom at night, kept for whenever the post-processing is made again. */
    setBloom(on, strength = this.bloom.strength) {
        this.bloom = { on, strength };
        this.post?.setBloom(on, strength);
    }

    /**
     * The slider has moved (Utils/device.js's setQualityStep): everything
     * that can follow at once does — the pixels drawn, the shadows' size and
     * filter, the post-processing, the textures' filtering, the trees' and
     * grass's reach and density, the realism (Realism.js). What was chosen
     * as the page was built (a published view's lighting, the lightmaps'
     * size, the Fluffy Tree garden's density) waits for a reload.
     */
    applyQuality(quality, previous = this.quality) {
        this.quality = quality;
        // Pixels.
        this.sizes.handleSizes();
        this.onResize();
        // Shadows: a new filter is a new shader for whatever is shadowed.
        const type = shadowType(quality);
        if (this.renderer.shadowMap.type !== type) {
            this.renderer.shadowMap.type = type;
            this.scene.traverse((node) => {
                for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) material.needsUpdate = true;
            });
        }
        const world = this.experience.world;
        // The site's own fit, at the step's size, where it is not fitted to the view.
        if (!quality.shadow.fit || !world?.sky) world?.environment?.fitShadows?.();
        // Post-processing, made or dropped.
        if (this.postWanted && quality.post && !this.post) this.usePost(true, this.postWanted);
        else if (!quality.post && this.post) {
            this.post.dispose();
            this.post = null;
        }
        this.post?.applyQuality(quality);
        if (quality.anisotropy !== previous?.anisotropy) this.applyAnisotropy(quality.anisotropy);
        this.realism.applyQuality(quality);
        world?.vegetation?.applyQuality?.(quality);
        this.renderer.shadowMap.needsUpdate = true;
    }

    /**
     * Every texture in the scene filtered at the step's anisotropy — set on
     * the texture for when it is uploaded again, and on the one the GPU
     * already has, without uploading it again.
     */
    applyAnisotropy(level) {
        const gl = this.renderer.getContext();
        const extension = gl.getExtension("EXT_texture_filter_anisotropic");
        const max = this.renderer.capabilities.getMaxAnisotropy();
        const wanted = Math.min(level, max);
        const done = new Set();
        const SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "bumpMap", "emissiveMap", "alphaMap"];
        this.scene.traverse((node) => {
            for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
                for (const slot of SLOTS) {
                    const texture = material[slot];
                    if (!texture || done.has(texture) || texture.isRenderTargetTexture) continue;
                    done.add(texture);
                    // Mipmapped textures only: anisotropy samples their mips.
                    if (texture.minFilter !== THREE.LinearMipmapLinearFilter && texture.minFilter !== THREE.LinearMipMapLinearFilter) continue;
                    texture.anisotropy = wanted;
                    const handle = this.renderer.properties.get(texture).__webglTexture;
                    if (!handle || !extension) continue;
                    gl.bindTexture(gl.TEXTURE_2D, handle);
                    gl.texParameterf(gl.TEXTURE_2D, extension.TEXTURE_MAX_ANISOTROPY_EXT, wanted);
                    this.renderer.properties.get(texture).__currentAnisotropy = wanted;
                }
            }
        });
        gl.bindTexture(gl.TEXTURE_2D, null);
        // three's own record of what is bound is now stale.
        this.renderer.state.reset();
    }

    onResize() {
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        this.post?.setSize(this.sizes.width, this.sizes.height, this.sizes.pixelRatio);
        this.experience.world?.editor?.onResize(this.sizes);
    }

    update() {
        this.stats?.begin();
        this.render();
        this.stats?.end();
        if (++this.frames % 60 === 0) this.relinkFailed();
    }

    /**
     * A shader that failed to link, built again — now and then the GPU's
     * driver fails one that is fine (Chrome's Metal translator on a Mac,
     * one load in several: "no matching function for call to 'ANGLE_sc2d'"),
     * and three would draw with it, broken, for as long as the page is
     * open. Each material drawn by it is given a program key of its own, so
     * the next frame builds it afresh, whoever else still holds the broken
     * one; twice at most a material, and then what it draws is hidden
     * rather than drawn broken every frame.
     */
    relinkFailed() {
        const failed = this.renderer.info.programs?.filter((program) => program.diagnostics && !program.diagnostics.runnable && !GIVEN_UP.has(program));
        if (!failed?.length) return;
        const properties = this.renderer.properties;
        const retried = new Set();
        const handled = new Set();
        this.scene.traverse((node) => {
            for (const material of [].concat(node.material ?? [])) {
                const program = material && properties.get(material).currentProgram;
                if (!program || !failed.includes(program)) continue;
                const tries = RELINKS.get(material) ?? 0;
                if (handled.has(material)) {
                    if (tries > 2) node.visible = false;
                    continue;
                }
                handled.add(material);
                RELINKS.set(material, tries + 1);
                if (tries >= 2) {
                    node.visible = false;
                    continue;
                }
                retried.add(program);
                console.warn(`Building the shader of ${material.name || material.type} again: it failed to link.`);
                relink(material, tries + 1);
            }
        });
        for (const program of failed) if (!retried.has(program)) GIVEN_UP.add(program);
    }

    render() {
        const camera = this.camera.activeCamera;
        // The editor draws its own frame: selection outline and gizmo on top —
        // in edit mode, and in the walkthrough while something is selected.
        const editor = this.experience.world?.editor;
        if (editor?.draws) {
            // Its frames draw the shadows every time, as they come.
            this.realism.releaseShadows();
            if (editor.render(this.renderer, this.scene, camera)) return;
        }
        this.realism.update(camera);
        if (this.post) this.post.render(camera);
        else this.renderer.render(this.scene, camera);
    }
}

/** The step's shadow filter: three's plain PCF, or its soft one (which the sun's PCSS rides on). */
function shadowType(quality) {
    return quality.shadow.filter === "pcf" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
}

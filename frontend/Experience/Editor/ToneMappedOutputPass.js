import * as THREE from "three";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * three's output pass — which tone-maps the editor's frame whenever it is
 * composited, for the selection outline — knows only three's own tone
 * mappings, and draws with none for any other. The renderer's is Blender's
 * Filmic, a custom one (Utils/filmic.js); this pass draws with that too, so
 * selecting something does not change how the scene looks.
 */
export default class ToneMappedOutputPass extends OutputPass {
    constructor() {
        super();
        const branch = "#ifdef LINEAR_TONE_MAPPING";
        if (!this.material.fragmentShader.includes(branch)) throw new Error("three's output shader has changed");
        this.material.fragmentShader = this.material.fragmentShader.replace(
            branch,
            "#if defined( CUSTOM_TONE_MAPPING )\n\t\t\t\tgl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );\n\t\t\t#elif defined( LINEAR_TONE_MAPPING )"
        );
    }

    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
        const stale = this._toneMapping !== renderer.toneMapping || this._outputColorSpace !== renderer.outputColorSpace;
        if (stale && renderer.toneMapping === THREE.CustomToneMapping) {
            // The defines the base class would set, and ours; marked current
            // so it keeps them.
            this._outputColorSpace = renderer.outputColorSpace;
            this._toneMapping = renderer.toneMapping;
            this.material.defines = { CUSTOM_TONE_MAPPING: "" };
            if (THREE.ColorManagement.getTransfer(this._outputColorSpace) === THREE.SRGBTransfer) {
                this.material.defines.SRGB_TRANSFER = "";
            }
            this.material.needsUpdate = true;
        }
        super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    }
}

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { N8AOPass } from "n8ao";

import { QUALITY } from "./Utils/device.js";

/**
 * The view drawn through a few passes rather than straight to the screen,
 * for a site lit live under its own sky (World/Sky.js):
 *
 *   - N8AO's ambient occlusion (github.com/N8python/n8ao, ISC): where
 *     surfaces meet and things stand on the ground, the sky's light is
 *     shaded off, from the depth buffer alone — so a leaf's cut-out shape
 *     shades, not its card. Its scene is drawn multisampled.
 *   - Bloom at night: lamps and lit windows glow.
 *   - Then tone mapping and the screen's colour space, as the renderer
 *     would have drawn them (OutputPass).
 *   - Then the grade (GradeShader): the developer's renders' look — a warm
 *     white balance, the shadows lifted a little, the colours a touch
 *     softer, the corners a shade darker.
 *
 * How much of each the slider's step asks for (Utils/device.js's
 * QUALITY_STEPS) is applied live (applyQuality).
 *
 * The editor's own frame (selection outlines, the gizmo) is drawn without.
 */
export default class PostProcessing {
    constructor(renderer, scene, camera, { width, height, pixelRatio, halfRes = true }) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.composer = new EffectComposer(renderer);
        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(width, height);

        this.ao = new N8AOPass(scene, camera, width * pixelRatio, height * pixelRatio);
        this.ao.beautyRenderTarget.samples = 4;
        Object.assign(this.ao.configuration, {
            aoRadius: 1.6,
            distanceFalloff: 0.9,
            intensity: 2.2,
            // At half the resolution, upsampled by depth: as good, at half the cost.
            aoSamples: 12,
            denoiseSamples: 6,
            denoiseRadius: 8,
            halfRes,
            screenSpaceRadius: false,
            // Linear out: OutputPass does the screen's colour space, once.
            gammaCorrection: false,
        });
        this.composer.addPass(this.ao);

        this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.5, 0.95);
        this.bloom.enabled = false;
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.grade = new ShaderPass(GradeShader);
        this.grade.enabled = false;
        this.composer.addPass(this.grade);

        this.night = false;
        this.applyQuality(QUALITY);
    }

    /** Bloom on (night) or off. */
    setBloom(on, strength = 0.55) {
        this.bloomWanted = on;
        this.bloomStrength = strength;
        this.bloom.enabled = on && this.quality?.post !== false;
        this.bloom.strength = strength;
        this.night = on;
        this.setGrade();
    }

    /** The step's ambient occlusion, multisampling and grade. */
    applyQuality(quality) {
        this.quality = quality;
        const ao = quality.ao ?? { samples: 8, denoise: 4, halfRes: true };
        const config = this.ao.configuration;
        if (config.aoSamples !== ao.samples) config.aoSamples = ao.samples;
        if (config.denoiseSamples !== ao.denoise) config.denoiseSamples = ao.denoise;
        if (config.halfRes !== ao.halfRes) config.halfRes = ao.halfRes;
        // Drawn at full resolution, the occlusion reaches in closer: the
        // contact shade under a sofa or a chair's legs, as well as a room's corners.
        config.denoiseRadius = ao.halfRes ? 8 : 6;
        const samples = quality.msaa ?? 4;
        if (this.ao.beautyRenderTarget.samples !== samples) {
            this.ao.beautyRenderTarget.samples = samples;
            // Made again, multisampled as asked, when next drawn to.
            this.ao.beautyRenderTarget.dispose();
        }
        this.setGrade();
    }

    /** The grade, by day or at night. */
    setGrade() {
        this.grade.enabled = Boolean(this.quality?.grade);
        const u = this.grade.uniforms;
        const look = this.night ? GRADE.night : GRADE.day;
        u.balance.value.set(...look.balance);
        u.saturation.value = look.saturation;
        u.contrast.value = look.contrast;
        u.lift.value = look.lift;
        u.vignette.value = look.vignette;
    }

    setSize(width, height, pixelRatio) {
        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(width, height);
        this.ao.setSize(width * pixelRatio, height * pixelRatio);
    }

    render(camera) {
        if (camera !== this.camera && camera.isPerspectiveCamera === this.camera.isPerspectiveCamera) {
            this.camera = camera;
            this.ao.camera = camera;
        } else if (camera !== this.camera) {
            // An orthographic view (the editor's): straight to the screen.
            this.renderer.render(this.scene, camera);
            return;
        }
        // Graded, the picture is tone mapped as a camera's would be (AgX:
        // highlights rolled off to white, colours not pushed to neon) and
        // the grade gives back its contrast — unless the garden asks for
        // Blender's Filmic, which is kept as asked.
        const asked = this.renderer.toneMapping;
        const swap = this.grade.enabled && asked === THREE.ACESFilmicToneMapping;
        if (swap) this.renderer.toneMapping = THREE.AgXToneMapping;
        this.composer.render();
        if (swap) this.renderer.toneMapping = asked;
    }

    dispose() {
        this.composer.dispose();
        this.ao.dispose?.();
        this.bloom.dispose();
        this.grade.material.dispose();
    }
}

/**
 * The renders' grade, on the picture as the screen shows it, after AgX
 * (render): warm and bright, its contrast and colour given back where AgX
 * leaves them soft, as an architectural visualisation is finished; at
 * night warmer still, with the dark kept dark.
 */
const GRADE = {
    day: { balance: [1.025, 1.0, 0.955], saturation: 1.03, contrast: 1.14, lift: 0.005, vignette: 0.22 },
    // The dusk's light cool, so that the windows' and the lamps' warmth stands out against it.
    night: { balance: [0.93, 0.99, 1.12], saturation: 1.05, contrast: 1.16, lift: 0.0, vignette: 0.3 },
};

const GradeShader = {
    name: "GradeShader",
    uniforms: {
        tDiffuse: { value: null },
        balance: { value: new THREE.Vector3(1, 1, 1) },
        saturation: { value: 1 },
        contrast: { value: 1 },
        lift: { value: 0 },
        vignette: { value: 0 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec3 balance;
        uniform float saturation;
        uniform float contrast;
        uniform float lift;
        uniform float vignette;
        varying vec2 vUv;
        void main() {
            vec4 texel = texture2D( tDiffuse, vUv );
            vec3 c = texel.rgb * balance;
            float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
            c = mix( vec3( l ), c, saturation );
            // A gentle S round the middle grey, and the blacks lifted.
            c = clamp( ( c - 0.5 ) * contrast + 0.5, 0.0, 1.0 );
            c = c + lift * ( 1.0 - c ) * ( 1.0 - c );
            vec2 d = vUv - 0.5;
            c *= 1.0 - vignette * smoothstep( 0.15, 0.75, dot( d, d ) * 2.0 );
            // Dithered, against banding in the sky and on plain walls.
            float noise = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            c += ( noise - 0.5 ) / 255.0;
            gl_FragColor = vec4( c, texel.a );
        }
    `,
};

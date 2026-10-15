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
 * N8AO draws the scene a second and a third time for what is seen through
 * — glass, the pool — so that the occlusion behind it does not darken it.
 * Those two passes are drawn here instead (drawTransparency): each with
 * only what it is for, and nothing else of the frame drawn again for them.
 *
 * The scene as it was last drawn, before any of this — its light, not yet
 * exposed — is kept for the eye's light meter to read (Realism.js):
 * `frame`.
 *
 * The editor's own frame (selection outlines, the gizmo) is drawn without.
 */
export default class PostProcessing {
    constructor(renderer, scene, camera, { width, height, pixelRatio, scale = 1, halfRes = true }) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.composer = new EffectComposer(renderer);
        // Its two buffers are only ever drawn to whole, by a pass: no depth to keep.
        this.composer.renderTarget1.depthBuffer = false;
        this.composer.renderTarget2.depthBuffer = false;
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
        // What is seen through, drawn here rather than by the library (drawTransparency).
        this.ao.renderTransparency = (renderer) => this.drawTransparency(renderer);
        this.transparent = { hidden: [], passes: [[], []], targets: [null, null], drawn: [true, true] };
        this.composer.addPass(this.ao);

        this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.5, 0.95);
        this.bloom.enabled = false;
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

        this.grade = new ShaderPass(GradeShader);
        this.grade.enabled = false;
        this.composer.addPass(this.grade);

        this.night = false;
        /** How many frames it has drawn: which one `frame` is. */
        this.frames = 0;
        this.sizeBloom(width, height, pixelRatio, scale);
        this.applyQuality(QUALITY);
    }

    /**
     * The bloom's own pictures, at the size they have at the step's own
     * pixel ratio — whatever share of it is drawn (`scale`: a public view's
     * frame-rate guard draws fewer pixels when the view runs slowly,
     * FrameGuard.js). Its blur is so many pixels wide, of its own pictures:
     * sized with the frame, the glow round every lamp spread wider each time
     * the guard took a rung — a living room at night a twelfth brighter at
     * 0.6 of the resolution, and hazy. A third of a frame's pixels in all.
     */
    sizeBloom(width, height, pixelRatio, scale = 1) {
        if (scale === 1) return;
        this.bloom.setSize((width * pixelRatio) / scale, (height * pixelRatio) / scale);
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
            // Made again, multisampled as asked, when next drawn to — and empty until then: no `frame` to read.
            this.ao.beautyRenderTarget.dispose();
            this.frames = 0;
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

    /** The scene as the last frame drew it, in the light's own units, before the occlusion, the tone mapping and the grade — or null before the first, and before the first at a new size. */
    get frame() {
        return this.frames ? this.ao.beautyRenderTarget.texture : null;
    }

    /**
     * N8AO's two pictures of what is seen through, which tell it where to
     * leave its occlusion off: what is see-through without writing depth
     * (glass, a lamp's lens), then what is see-through and does (the
     * pool). As the library draws them, but for three things.
     *
     * It hides whatever is not for a pass by `visible = was && transparent
     * && …`, which for a mesh of several materials — a material array has
     * no `transparent` — is `undefined`, and three leaves out only what is
     * exactly `false`: every wall of a house lit live was drawn again into
     * the second picture (5,000 draw calls of Ladonia's from the garden),
     * to no effect, since what is solid leaves the occlusion as it is. A
     * mesh of several materials is drawn there only if one of them is
     * see-through and writes depth — what the library's rule comes to for
     * the pixels it changes.
     *
     * Each picture is a whole `renderer.render` of the scene, which would
     * work out every matrix again and draw the sun's shadow map again — a
     * second and a third time a frame, at a step that draws it every frame,
     * and with only the glass to cast: both are as the frame's own drawing
     * left them, and are kept.
     *
     * And a picture with nothing in it is cleared once, not drawn.
     */
    drawTransparency(renderer) {
        const ao = this.ao;
        const scene = this.scene;
        const { hidden, passes, drawn } = this.transparent;
        const [open, solid] = passes;
        hidden.length = open.length = solid.length = 0;
        const sort = (object) => {
            if (object.visible === false) return;
            const material = object.material;
            if (material) {
                const opaque = Boolean(object.userData.treatAsOpaque);
                if (Array.isArray(material)) {
                    if (!opaque && material.some((part) => part.transparent && part.depthWrite)) solid.push(object);
                } else if (material.transparent && !opaque) {
                    (material.depthWrite ? solid : open).push(object);
                }
                if (object.userData.cannotReceiveAO && !open.includes(object)) open.push(object);
                hidden.push(object);
                object.visible = false;
            }
            for (const child of object.children) sort(child);
        };
        sort(scene);

        const background = scene.background;
        const clearAlpha = renderer.getClearAlpha();
        renderer.getClearColor(_clear);
        const autoClearDepth = renderer.autoClearDepth;
        const shadows = renderer.shadowMap.autoUpdate;
        const matrices = scene.matrixWorldAutoUpdate;
        scene.background = null;
        scene.matrixWorldAutoUpdate = false;
        renderer.autoClearDepth = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setClearColor(0x000000, 0);
        ao.depthCopyPass.material.uniforms.depthTexture.value = ao.beautyRenderTarget.depthTexture;
        const targets = [ao.transparencyRenderTargetDWFalse, ao.transparencyRenderTargetDWTrue];
        for (let k = 0; k < 2; k++) {
            const any = passes[k].length > 0;
            // (A picture the library has just made is not yet cleared.)
            if (this.transparent.targets[k] !== targets[k]) drawn[k] = true;
            this.transparent.targets[k] = targets[k];
            // Nothing in it now, and nothing left in it from before: as it is.
            if (!any && !drawn[k]) continue;
            renderer.setRenderTarget(targets[k]);
            renderer.clear(true, true, true);
            drawn[k] = any;
            if (!any) continue;
            for (const object of passes[k]) object.visible = true;
            ao.depthCopyPass.render(renderer);
            renderer.render(scene, ao.camera);
            for (const object of passes[k]) object.visible = false;
        }
        for (const object of hidden) object.visible = true;
        renderer.setClearColor(_clear, clearAlpha);
        scene.background = background;
        scene.matrixWorldAutoUpdate = matrices;
        renderer.autoClearDepth = autoClearDepth;
        renderer.shadowMap.autoUpdate = shadows;
    }

    /** @param {number} [scale]  how much of the step's own pixel ratio `pixelRatio` is (sizeBloom) */
    setSize(width, height, pixelRatio, scale = 1) {
        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(width, height);
        this.sizeBloom(width, height, pixelRatio, scale);
        this.ao.setSize(width * pixelRatio, height * pixelRatio);
        // The pictures of what is seen through are new, and empty.
        this.transparent.drawn = [true, true];
        // And so is the scene's own, until it is next drawn: no `frame` to read.
        this.frames = 0;
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
        this.frames++;
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
const _clear = new THREE.Color();

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

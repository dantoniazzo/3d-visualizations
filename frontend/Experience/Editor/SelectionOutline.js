import * as THREE from "three";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * The outline round what is selected: amber where it is seen, dim where
 * something stands in front of it — three's OutlinePass to look at, without
 * what made that cost a frame of its own.
 *
 * OutlinePass draws the whole scene a second time, for its depth, to tell
 * the seen parts of the selection from the hidden; hides and shows every
 * mesh of the scene twice to draw the selection alone; and runs its six
 * full-screen passes over the whole picture, wherever the selection is. On
 * Ladonia that was 4 to 13 ms a frame for a chair (4 to 9 once the editor's
 * stand-ins drew the scene).
 *
 * Here the scene is not drawn again. The frame is drawn straight to the
 * screen (Editor.render), and the screen's depth cannot be read — but it can
 * be drawn against. So, within the rectangle of the screen the selection
 * covers and nowhere else:
 *
 *   1. what is on the screen there is kept (copied to a texture);
 *   2. the selection's own meshes are drawn there twice, onto the screen:
 *      once whatever is in front (its whole shape), once against the
 *      frame's own depth (the part of it that is seen) — as the two halves
 *      of OutlinePass's mask, red and green;
 *   3. that mask is copied out, and three's own edge and blur shaders
 *      (taken from OutlinePass itself) make the outline of it, off screen,
 *      each over the rectangle only;
 *   4. the picture is put back as it was, to the pixel, and the outline
 *      added onto it by three's overlay shader.
 *
 * It costs the selection's own triangles twice and a few passes over its
 * rectangle: 1.0 to 1.6 ms on the same Mac whatever the scene holds and
 * however much of the screen the selection covers — most of it the three
 * times the screen's own picture is left and come back to (two copies, one
 * trip off screen for the edges).
 *
 * What differs from OutlinePass to look at:
 *
 *   - "seen" is what the frame itself shows in front, so what is seen
 *     through glass or an X-rayed wall — which write no depth — is outlined
 *     as seen, in amber; OutlinePass called it hidden, whatever was in front;
 *   - the mask is drawn on the screen's own antialiased samples, so the
 *     outline's inner edge is as smooth as the picture's edges are, where
 *     OutlinePass's stepped by the pixel;
 *   - its second, wider blur is not drawn: the app draws no glow
 *     (`edgeGlow` 0), which multiplied it by nothing;
 *   - where the gizmo's own antialiased edges, drawn after, cross the
 *     scene's inside the rectangle, a few dozen pixels differ by up to 14
 *     levels from a frame with no outline: the picture is put back as one
 *     colour a pixel, not sample by sample. With no gizmo it is put back to
 *     the byte.
 *
 * Nothing may be drawn over the scene's depth between the frame's own draw
 * and this, and the screen must be what is being drawn to.
 */

/** How far round the selection's rectangle on the screen the passes reach, in pixels: the outline is a few wide, and each pass reads a little beyond what it writes. */
const MARGIN = 24;
/** How far round a rigged figure's bones its skin is taken to reach, in metres. */
const SKIN = 0.35;
const NONE = [];

const _matrix = new THREE.Matrix4();
const _corner = new THREE.Vector4();
const _point = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector2();
const _scissor = new THREE.Vector4();
const _clear = new THREE.Color();

export default class SelectionOutline {
    constructor() {
        /** Added to the screen as they are, as display colours, each multiplied by `edgeStrength`. */
        this.visibleEdgeColor = new THREE.Color(1, 1, 1);
        this.hiddenEdgeColor = new THREE.Color(0.1, 0.04, 0.02);
        this.edgeStrength = 3;
        this.edgeThickness = 1;

        // three's own shaders, from OutlinePass itself: how the outline looks is theirs.
        const three = OutlinePass.prototype;
        this.edge = three.getEdgeDetectionMaterial();
        this.blur = three.getSeperableBlurMaterial(4);
        this.overlay = three.getOverlayMaterial();
        /** A picture as it is, to the byte: what was on the screen put back, the mask at half its size. */
        this.copy = new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: null } },
            vertexShader: "varying vec2 vUv;\nvoid main() {\n\tvUv = uv;\n\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}",
            fragmentShader: "uniform sampler2D tDiffuse;\nvarying vec2 vUv;\nvoid main() {\n\tgl_FragColor = texture2D( tDiffuse, vUv );\n}",
            blending: THREE.NoBlending,
            depthTest: false,
            depthWrite: false,
        });
        this.quad = new FullScreenQuad(null);

        // The selection's shape, whatever stands in front of it: red out of a white picture.
        this.shape = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false, ...MULTIPLY });
        // ...and what of it the frame shows: green out of it, where it is as near as what the frame drew there (a
        // hair nearer: the same triangles, drawn by another shader, do not always come to the same depth).
        this.seen = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, ...MULTIPLY });
        /** The selection's meshes, drawn by themselves: a scene that holds them for a draw without being their parent. */
        this.list = new THREE.Scene();
        this.list.matrixWorldAutoUpdate = false;

        this.width = 0;
        this.height = 0;
        this.saved = null;
        this.mask = null;
        const options = { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false };
        this.half = new THREE.WebGLRenderTarget(1, 1, options);
        this.edges = new THREE.WebGLRenderTarget(1, 1, options);
        this.blurred = new THREE.WebGLRenderTarget(1, 1, options);
        for (const target of [this.half, this.edges, this.blurred]) target.scissorTest = true;
        /** The last frame's: the rectangle drawn over, in the picture's pixels, and how many meshes (for measuring). */
        this.last = null;
    }

    /** The pictures it keeps, at the size of the picture drawn (the canvas's own pixels). */
    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.saved?.dispose();
        this.mask?.dispose();
        this.saved = new THREE.FramebufferTexture(width, height);
        this.mask = new THREE.FramebufferTexture(width, height);
        // (Read at half size, each pixel of it from four of the mask's.)
        this.mask.magFilter = this.mask.minFilter = THREE.LinearFilter;
        const w = Math.round(width / 2);
        const h = Math.round(height / 2);
        for (const target of [this.half, this.edges, this.blurred]) target.setSize(w, h);
        this.edge.uniforms.texSize.value.set(w, h);
        this.blur.uniforms.texSize.value.set(w, h);
    }

    /**
     * The outline of `objects`, added to the frame just drawn to the screen
     * with `camera` — after the scene, before anything is drawn over its
     * depth.
     *
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Camera} camera  the frame's
     * @param {THREE.Object3D[]} objects  what is selected: each shown, with whatever of it is
     * @returns {boolean} whether there was anything of it on the screen
     */
    render(renderer, camera, objects) {
        const meshes = gather(objects);
        if (!meshes.length) return false;
        renderer.getDrawingBufferSize(_size);
        if (_size.x !== this.width || _size.y !== this.height) this.setSize(_size.x, _size.y);
        const width = this.width;
        const height = this.height;
        const rect = bounds(meshes, camera, width, height);
        this.last = rect && { rect, meshes: meshes.length };
        if (!rect) return false;

        const ratio = renderer.getPixelRatio();
        const kept = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear, alpha: renderer.getClearAlpha(), test: renderer.getScissorTest(), shadows: renderer.shadowMap.autoUpdate };
        renderer.getClearColor(_clear);
        renderer.getScissor(_scissor);
        renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(null);
        // (The renderer takes the screen's scissor in CSS pixels, and rounds it to the picture's — to the nearest here,
        // down when it binds the screen again: a quarter of a pixel over lands on ours either way.)
        const onScreen = ([x0, y0, x1, y1]) => renderer.setScissor((x0 + 0.25) / ratio, (y0 + 0.25) / ratio, (x1 - x0 + 0.25) / ratio, (y1 - y0 + 0.25) / ratio);
        const quad = this.quad;
        const list = this.list;
        try {
            // 1. What is on the screen there, kept.
            this.grab(renderer, this.saved, rect);

            // 2. The selection, drawn on the screen itself: all of it, then what of it the frame's own depth lets through.
            onScreen(rect);
            renderer.setScissorTest(true);
            renderer.setClearColor(0xffffff, 1);
            renderer.clear(true, false, false);
            list.children = meshes;
            list.overrideMaterial = this.shape;
            renderer.render(list, camera);
            list.overrideMaterial = this.seen;
            renderer.render(list, camera);
            list.children = NONE;
            this.grab(renderer, this.mask, rect);

            // 3. The mask at half size, its edges, the edges blurred across and down — each a little inside the one
            // it reads, so that none reads what an earlier frame left round another selection.
            const w = this.half.width;
            const h = this.half.height;
            const halved = [rect[0] === 0 ? 0 : Math.ceil(rect[0] / 2), rect[1] === 0 ? 0 : Math.ceil(rect[1] / 2), rect[2] === width ? w : Math.floor(rect[2] / 2), rect[3] === height ? h : Math.floor(rect[3] / 2)];
            const edged = inset(halved, 1, w, h);
            const across = inset(edged, 1, w, h);
            const down = inset(across, 1, w, h);
            const inner = inset(down, 1, w, h);
            const over = [inner[0] === 0 ? 0 : inner[0] * 2, inner[1] === 0 ? 0 : inner[1] * 2, inner[2] === w ? width : inner[2] * 2, inner[3] === h ? height : inner[3] * 2];
            // (Not in a sliver at the picture's edge: nothing of an outline in it.)
            const room = over[2] > over[0] && over[3] > over[1];
            const pass = (target, area, material) => {
                target.scissor.set(area[0], area[1], area[2] - area[0], area[3] - area[1]);
                renderer.setRenderTarget(target);
                quad.material = material;
                quad.render(renderer);
            };
            if (room) {
                this.copy.uniforms.tDiffuse.value = this.mask;
                pass(this.half, halved, this.copy);

                this.edge.uniforms.maskTexture.value = this.half.texture;
                this.edge.uniforms.visibleEdgeColor.value = this.visibleEdgeColor;
                this.edge.uniforms.hiddenEdgeColor.value = this.hiddenEdgeColor;
                pass(this.edges, edged, this.edge);

                this.blur.uniforms.kernelRadius.value = this.edgeThickness;
                this.blur.uniforms.colorTexture.value = this.edges.texture;
                this.blur.uniforms.direction.value = OutlinePass.BlurDirectionX;
                pass(this.blurred, across, this.blur);
                this.blur.uniforms.colorTexture.value = this.blurred.texture;
                this.blur.uniforms.direction.value = OutlinePass.BlurDirectionY;
                pass(this.edges, down, this.blur);
            }

            // 4. Back on the screen, once: the picture as it was...
            renderer.setRenderTarget(null);
            onScreen(rect);
            renderer.setScissorTest(true);
            quad.material = this.copy;
            this.copy.uniforms.tDiffuse.value = this.saved;
            quad.render(renderer);
            // ...and the edges added to it, outside the selection's own shape.
            if (room) {
                const uniforms = this.overlay.uniforms;
                uniforms.maskTexture.value = this.mask;
                uniforms.edgeTexture1.value = this.edges.texture;
                // (Its wider glow, of which the app draws none: any picture, times nothing.)
                uniforms.edgeTexture2.value = this.edges.texture;
                uniforms.edgeStrength.value = this.edgeStrength;
                uniforms.edgeGlow.value = 0;
                uniforms.usePatternTexture.value = false;
                onScreen(over);
                quad.material = this.overlay;
                quad.render(renderer);
            }
        } finally {
            list.children = NONE;
            list.overrideMaterial = null;
            renderer.setRenderTarget(kept.target);
            renderer.setScissor(_scissor);
            renderer.setScissorTest(kept.test);
            renderer.setClearColor(_clear, kept.alpha);
            renderer.autoClear = kept.autoClear;
            renderer.shadowMap.autoUpdate = kept.shadows;
        }
        return true;
    }

    /** A rectangle of the screen as it is now, into the same place of a picture of the screen's size. */
    grab(renderer, texture, [x0, y0, x1, y1]) {
        const gl = renderer.getContext();
        const properties = renderer.properties.get(texture);
        if (!properties.__webglTexture) renderer.initTexture(texture);
        renderer.state.bindTexture(gl.TEXTURE_2D, properties.__webglTexture, gl.TEXTURE0);
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x0, y0, x1 - x0, y1 - y0);
        renderer.state.unbindTexture();
    }

    dispose() {
        this.saved?.dispose();
        this.mask?.dispose();
        for (const target of [this.half, this.edges, this.blurred]) target.dispose();
        for (const material of [this.edge, this.blur, this.overlay, this.copy, this.shape, this.seen]) material.dispose();
        this.quad.dispose();
    }
}

/** A colour multiplied into what is there: red or green taken out of the mask, the rest left. */
const MULTIPLY = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor };

/**
 * The meshes of what is selected that are drawn — each shown, all the way
 * down from its object — as three is to draw them: the topmost of each
 * branch (it goes on into a mesh's own children itself).
 */
function gather(objects) {
    const meshes = [];
    const visit = (node) => {
        if (!node.visible) return;
        if (node.isMesh) return meshes.push(node);
        const children = node.children;
        for (let i = 0; i < children.length; i++) visit(children[i]);
    };
    for (const object of objects) visit(object);
    return meshes;
}

/**
 * The rectangle of the picture the meshes are within, MARGIN beyond them,
 * as [x0, y0, x1, y1] in its pixels from the bottom left — the whole of it
 * when any reaches behind the camera; null when none of them is on it.
 */
function bounds(meshes, camera, width, height) {
    _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let whole = false;
    const visit = (mesh) => {
        if (whole || !mesh.visible) return;
        const children = mesh.children;
        for (let i = 0; i < children.length; i++) visit(children[i]);
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry;
        if (!geometry || mesh.isInstancedMesh || mesh.isBatchedMesh) return (whole = true);
        let local = null;
        if (mesh.isSkinnedMesh && mesh.skeleton) {
            // A rigged figure is where its bones are, not where it was modelled.
            _box.makeEmpty();
            for (const bone of mesh.skeleton.bones) _box.expandByPoint(_point.setFromMatrixPosition(bone.matrixWorld));
            _box.expandByScalar(SKIN);
        } else {
            if (geometry.boundingBox === null) geometry.computeBoundingBox();
            _box.copy(geometry.boundingBox);
            local = mesh.matrixWorld;
        }
        if (_box.isEmpty()) return;
        const { min, max } = _box;
        for (let i = 0; i < 8; i++) {
            _corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z, 1);
            if (local) _corner.applyMatrix4(local);
            _corner.applyMatrix4(_matrix);
            if (_corner.w <= 1e-6) return (whole = true);
            const x = _corner.x / _corner.w;
            const y = _corner.y / _corner.w;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    };
    for (const mesh of meshes) visit(mesh);
    if (whole) return [0, 0, width, height];
    if (x0 > x1) return null;
    const rect = [
        Math.max(0, Math.floor((x0 * 0.5 + 0.5) * width) - MARGIN),
        Math.max(0, Math.floor((y0 * 0.5 + 0.5) * height) - MARGIN),
        Math.min(width, Math.ceil((x1 * 0.5 + 0.5) * width) + MARGIN),
        Math.min(height, Math.ceil((y1 * 0.5 + 0.5) * height) + MARGIN),
    ];
    return rect[2] > rect[0] && rect[3] > rect[1] ? rect : null;
}

/** A rectangle `by` pixels smaller on each side that is not an edge of the picture itself (`width` by `height`). */
function inset([x0, y0, x1, y1], by, width, height) {
    return [x0 === 0 ? 0 : x0 + by, y0 === 0 ? 0 : y0 + by, x1 === width ? width : x1 - by, y1 === height ? height : y1 - by];
}

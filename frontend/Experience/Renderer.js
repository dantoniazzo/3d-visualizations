import * as THREE from "three";

import Experience from "./Experience.js";
import Stats from "./Utils/Stats.js";
import { QUALITY, guardContextLoss, onQualityChange } from "./Utils/device.js";
import { installFilmic } from "./Utils/filmic.js";
import { installSoftShadows } from "./Utils/softShadows.js";
import Realism from "./Realism.js";

/** How many lit things have their shaders set going at once, ahead of a light (Renderer.prepareLights), and for how many milliseconds of a frame at a time. */
const PREPARE_BATCH = 12;
const PREPARE_SLICE = 4;
/** The layer that picks out what is drawn ahead of a light (Renderer.drawAhead): no camera of the app's looks at it. */
const AHEAD_LAYER = 31;
/** How long a light waits for its shaders, in milliseconds, before it comes on anyway. */
const PREPARE_PATIENCE = 8000;
/** How many of the scene's lightings what was built ahead is remembered for (Renderer.builtFor) before it is all forgotten. */
const PREPARED_MOST = 32;
/** How many frames the shadow pass is waited for, to see what it draws with (Renderer.shadowDraws). */
const SHADOW_WAIT = 8;
/** Where what was built ahead for a lighting keeps the shadow maps' programs built for it, by their keys (Renderer.shadowTwins). */
const SHADOWS_BUILT = {};

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
            this.stats = new Stats(this.renderer, this.sizes, () => this.experience.published, () => this.experience.world?.readyIn, () => this.experience.colliders?.stats());
        }
        // The Performance ↔ Quality slider (Utils/device.js), applied live.
        this.realism = new Realism(this.experience);
        this.quality = QUALITY;
        this.bloom = { on: false, strength: 0.7 };
        this.stopQuality = onQualityChange((quality, previous) => this.applyQuality(quality, previous));
        this.frames = 0;
        /** What has been built ahead of a light, by how the scene was lit (builtFor). */
        this.prepared = new Map();
        /** The programs drawn ahead, one at a time (drawAhead's `paced`), and what waits for the next frame (nextFrame). */
        this.drawnAhead = new WeakSet();
        this.afterFrame = [];
    }

    setRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "high-performance",
        });
        // A step too heavy for this GPU: start lower on the next visit — a public view at its lightest.
        guardContextLoss(this.canvas, { publicView: this.experience.publicView, chosen: () => this.experience.guard?.chosen });

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
        /** The editor's plain light's one exposure, while it is on (setPlain). */
        this.plainExposure = null;
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
        this.renderer.toneMappingExposure = this.plainExposure ?? this.exposure * this.exposureScale * this.adaptation;
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
     * The editor's plain light (World/PlainLight.js), on — at its one
     * exposure, whatever the light, the garden's setting and the eye would
     * have, which are kept for when it goes — or, given null, off. Under it
     * every frame is drawn straight to the screen (render): nothing of the
     * realism, no post-processing — which, asked for meanwhile, is made only
     * once it is off.
     */
    setPlain(exposure) {
        this.plainExposure = exposure;
        this.setExposure(this.exposure);
        if (exposure === null && this.postWanted && this.quality.post && !this.post) this.usePost(true, this.postWanted);
    }

    /**
     * Draw through post-processing (PostProcessing.js) — ambient occlusion,
     * bloom at night, the grade — or, given false, straight to the screen
     * again. Asked for by a view lit live under its own sky; made only at
     * the slider's steps that draw through it (QUALITY.post), and made or
     * dropped as the slider moves (applyQuality); not made under the
     * editor's plain light, which draws without it (setPlain).
     */
    async usePost(on = true, options = {}) {
        this.postWanted = on ? options : null;
        if (!on || !this.quality.post) {
            this.post?.dispose();
            this.post = null;
            return null;
        }
        if (this.plainExposure !== null) return this.post ?? null;
        // A chunk of its own, downloaded only for a view drawn through it.
        const { default: PostProcessing } = await import("./PostProcessing.js");
        if (!this.postWanted || !this.quality.post) return null;
        if (this.plainExposure !== null) return this.post ?? null;
        if (!this.post) {
            this.post = new PostProcessing(this.renderer, this.scene, this.camera.activeCamera, {
                width: this.sizes.width,
                height: this.sizes.height,
                pixelRatio: this.sizes.pixelRatio,
                scale: this.sizes.scale,
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
        // Other lights, other shadows, another picture to draw into: what was built ahead of a light was built for the last step's.
        this.prepared.clear();
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

    /**
     * Lights that are about to come into the scene's light — a car's beam
     * switched on, the lamps' pool as its first lamp is lit — after being
     * kept out of it, hidden (a light at nothing costs every lit pixel what
     * a lit one does, so a light that is off is not there at all). three
     * builds each lit material's shader for the lights there are: the
     * first frame with one more would stop to build every one of them
     * again. So they are built ahead, a few at a time between frames —
     * the lights let in only for as long as each batch takes to set going,
     * never for a frame — and the lights are the caller's to show once
     * this resolves: every shader is then found, not built. A state the
     * scene has been in before costs nothing to come back to: three keeps
     * each material's programs, and what was built ahead for it is
     * remembered (builtFor) — the lamps' pool coming back, a car's beam
     * switched on again, wait for nothing.
     *
     * Not under the editor's plain light, where the lights are on no layer
     * (PlainLight.keepOut): shown, they are still not in the scene's light,
     * and there is nothing to build.
     *
     * It does not make the work less, only spreads it: the first time a
     * browser builds these shaders (it keeps them for the next visit) the
     * GPU takes its seconds all the same, and the view hitches while it
     * does — a Ladonia street's 65 programs: one frame of 6.7 s unprepared;
     * prepared, 3.5 s of frames of which the worst took under half a
     * second, and 0.36 s for the first with the light in.
     *
     * One at a time, in the order asked: each on top of what the one
     * before it let in.
     *
     * `paced`: for a light the visitor need not wait for — one in a fridge,
     * built ahead as its door is aimed at (World/Openables.js's warm), and
     * lit a moment late if it is opened before — set going three shaders at
     * a time, and, where the browser had to build them, each drawn ahead in
     * a frame of its own (build): the frames go on at their pace while it
     * does. Unpaced, a dozen at a time and a dozen drawn ahead together:
     * sooner done, and the frame that waits for those dozen pipelines took
     * 0.44 s of the first look at Ladonia's A1 fridge.
     *
     * @param {THREE.Light[]} lights  hidden now, to be shown by the caller when this resolves
     * @param {object} [options]
     * @param {boolean} [options.paced]
     * @returns {Promise<void>}
     */
    prepareLights(lights, { paced = false } = {}) {
        const before = this.preparing ?? Promise.resolve();
        this.preparing = before.then(() => this.buildFor(lights, { paced })).catch((error) => console.warn("Shaders could not be built ahead for a light", error));
        return this.preparing;
    }

    /** The lit materials' shaders for the scene with `lights` in it (prepareLights), a few milliseconds' worth at a time — or `paced`. */
    async buildFor(lights, { paced = false } = {}) {
        if (this.plainExposure !== null) return;
        // What the next shadow pass draws with, for the shadow maps' own shaders (shadowTwins): a few frames' wait — the
        // first time for this lighting, or once three has made a shadow map's program more since, not otherwise: a
        // fridge's light opened after it was built ahead comes in as soon as before.
        const known = this.builtFor(lights, this.camera.activeCamera).get(SHADOWS_BUILT);
        const draws = known?.depths === depthPrograms(this.renderer) ? null : await this.shadowDraws();
        if (this.plainExposure !== null) return;
        const camera = this.camera.activeCamera;
        // What takes light, and is drawn — and has not been built for this
        // lighting already, with the materials it has now: nothing else is
        // built again for a light.
        const built = this.builtFor(lights, camera);
        const shadows = draws ? this.shadowTwins(built, draws) : new Map();
        const lit = new Map();
        const gather = (object) => {
            if (object.visible === false) return;
            const material = object.material;
            if (material && [].concat(material).some(takesLight)) {
                const mark = materialsMark(object);
                if (built.get(object) !== mark) lit.set(object, mark);
            }
            for (const child of object.children) gather(child);
        };
        gather(this.scene);
        // ...and what nothing draws now but will the moment it moves: a public view's shut doors and drawers, drawn
        // merged (World/ShutBatcher.js's `unseen`, one mesh of theirs a program), shown for their turn alone.
        const batcher = this.experience.world?.sceneBuilder?.shutBatcher;
        for (const mesh of batcher?.unseen ?? []) {
            if (![].concat(mesh.material).some(takesLight)) continue;
            const mark = materialsMark(mesh);
            if (built.get(mesh) !== mark) lit.set(mesh, mark);
        }
        if (lit.size || shadows.size) {
            await this.build([...lit.keys()], lights, camera, batcher?.unseen?.length ? (some, on) => batcher.around(some, on) : null, paced ? 3 : PREPARE_BATCH, paced, [], [...shadows.values()]);
        }
        for (const [object, mark] of lit) built.set(object, mark);
        if (!draws) return;
        // (By the keys the pass drew with, and how many shadow maps' programs three had once these were built.)
        const twinned = built.get(SHADOWS_BUILT) ?? { keys: new Set(), depths: -1 };
        for (const key of shadows.keys()) twinned.keys.add(key);
        twinned.depths = depthPrograms(this.renderer);
        built.set(SHADOWS_BUILT, twinned);
    }

    /**
     * The shadow maps' own shaders for the scene with the lights coming in
     * (buildFor). three draws what casts into a shadow map with a depth
     * material of its own (WebGLShadowMap's getDepthMaterial) — one for
     * nearly everything, a copy for each material cut out by its texture —
     * whose program, though it reads no light, it keys by how many lights of
     * each kind there are, as every program; and it draws the shadow maps
     * before it takes the frame's lights, with those of the frame before.
     * Its one depth material draws what is rigged (the people, the visitors)
     * and what is instanced (the plants) between the rest, and builds its
     * program again at each change of kind — seventeen times a pass at A1's
     * kitchen — so the second frame with a light more built six programs
     * in the frame, by day: Ladonia's A1 fridge's first opening, a frame of
     * 35–45 ms where its lit materials' were all built ahead (0.7 s with
     * the six new to the GPU as well).
     *
     * So the next shadow pass of the scene is watched (shadowDraws): every
     * program a depth material drew with in it, once, as a copy of that
     * material as three had set it for the thing it drew then, and that
     * thing. Each pair not built for this lighting yet (`built`'s
     * SHADOWS_BUILT, by the program's key as it was drawn) is a stand-in to
     * build with the lights in (build's `shadows`): the same program's key
     * but for the lights, which three then finds — its programs are shared
     * by key — when its own material changes kind in a pass with them in.
     * From above none is drawn (Realism.holdShadows), and none is watched.
     *
     * @param {WeakMap} built  what has been built ahead for this lighting (builtFor)
     * @param {Map<string, { object: THREE.Object3D, material: THREE.Material }>} draws  what the pass drew with (shadowDraws)
     * @returns {Map<string, object>}  by the program's key, a stand-in for the thing, drawn with the copy
     */
    shadowTwins(built, draws) {
        const twins = new Map();
        const twinned = built.get(SHADOWS_BUILT);
        for (const [key, { object, material }] of draws) {
            if (twinned?.keys.has(key)) continue;
            // What three reads of the thing it draws to key a program — what kind it is, rigged or instanced, and its
            // geometry — taken onto a plain object of its own, the copy its material: not an object made from the thing
            // itself, which would make the thing a prototype, and so another kind of object to the draw loop
            // (.claude/skills/walkthrough-editor/stand-ins.md; the rule, never give a scene object a property of its
            // own: .claude/skills/app-testing-and-performance/speed-architecture.md).
            twins.set(key, {
                isMesh: object.isMesh === true,
                isLine: object.isLine === true,
                isPoints: object.isPoints === true,
                isSkinnedMesh: object.isSkinnedMesh === true,
                isInstancedMesh: object.isInstancedMesh === true,
                isBatchedMesh: object.isBatchedMesh === true,
                instanceColor: object.instanceColor ?? null,
                morphTexture: object.morphTexture ?? null,
                geometry: object.geometry,
                material,
            });
        }
        return twins;
    }

    /**
     * What the scene's next shadow pass draws with (shadowTwins): each
     * program a depth material of three's drew with in it, by its key, once,
     * with a copy of the material as it was for that draw and what it drew.
     * The sun's map is drawn again in the next frame for it, and up to
     * SHADOW_WAIT frames are waited for a pass — none in a tab that draws
     * no frames. Null where none was seen: none to wait for, or none came.
     *
     * @returns {Promise<Map<string, { object: THREE.Object3D, material: THREE.Material }>|null>}
     */
    async shadowDraws() {
        const renderer = this.renderer;
        const draws = new Map();
        // (None to wait for: no shadow maps, none held from above, or no light of the scene's that casts — at night.)
        if (!renderer.shadowMap.enabled || this.realism?.heldShadows) return null;
        const scene = this.scene;
        const seen = this.camera.activeCamera.layers;
        const casting = [];
        scene.traverseVisible((object) => {
            if (object.isLight && object.castShadow && object.intensity > 0 && object.layers.test(seen)) casting.push(object);
        });
        if (!casting.length) return null;
        const shadowMap = renderer.shadowMap;
        const properties = renderer.properties;
        const render = shadowMap.render;
        const draw = renderer.renderBufferDirect;
        let passing = false;
        let passed = false;
        // (The scene's own pass alone: a room shown live draws its lamps' maps through a scene of its own, and lights of its own.)
        shadowMap.render = function (lights, of, camera) {
            passing = of === scene;
            try {
                return render.call(this, lights, of, camera);
            } finally {
                passing = false;
            }
        };
        renderer.renderBufferDirect = function (camera, of, geometry, material, object, group) {
            const result = draw.call(this, camera, of, geometry, material, object, group);
            if (passing && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial)) {
                passed = true;
                const program = properties.get(material).currentProgram;
                if (program && !draws.has(program.cacheKey)) draws.set(program.cacheKey, { object, material: material.clone() });
            }
            return result;
        };
        // A pass of the sun's map in the next frame, of the same as it drew the last time: a view drawn from its bake draws
        // it again only as something moves, or now and then (World/LiveLamps.js). Not a lamp's: six maps, and a lamp's
        // shadow is drawn while it shines anyway.
        for (const light of casting) if (!light.isPointLight) light.shadow.needsUpdate = true;
        if (!shadowMap.autoUpdate) shadowMap.needsUpdate = true;
        try {
            for (let frame = 0; frame < SHADOW_WAIT && !passed; frame++) if (!(await this.nextFrame())) break;
        } finally {
            shadowMap.render = render;
            renderer.renderBufferDirect = draw;
        }
        return passed ? draws : null;
    }

    /**
     * What has been built ahead for the scene lit as it would be with
     * `lights` in it (buildFor): each thing drawn then, by the materials it
     * had (materialsMark). three builds a lit material's shader by how many
     * lights of each kind there are, with a shadow or without — whichever
     * lights they are — by where it is drawn (through post-processing or to
     * the screen), by how shadows are filtered, and by the fog and the
     * surroundings the scene gives every material: a lighting the scene has
     * been built for is known again by those.
     *
     * @returns {WeakMap<THREE.Object3D, string>}
     */
    builtFor(lights, camera) {
        const scene = this.scene;
        const counts = new Map();
        const count = (light) => {
            const kind = `${light.type}${light.castShadow ? "+shadow" : ""}${light.map ? "+map" : ""}`;
            counts.set(kind, (counts.get(kind) ?? 0) + 1);
        };
        scene.traverseVisible((object) => {
            if (object.isLight && object.layers.test(camera.layers) && !lights.includes(object)) count(object);
        });
        lights.forEach(count);
        const key = [
            [...counts].sort().join(";"),
            this.post ? "post" : "screen",
            this.renderer.shadowMap.type,
            this.renderer.toneMapping,
            scene.fog?.isFogExp2 ? "fog2" : scene.fog ? "fog" : "",
            scene.environment?.uuid ?? "",
        ].join("|");
        if (!this.prepared.has(key)) {
            if (this.prepared.size >= PREPARED_MOST) this.prepared.clear();
            this.prepared.set(key, new WeakMap());
        }
        return this.prepared.get(key);
    }

    /**
     * The shaders of `lit` — what takes light — built for the scene with
     * `lights` in it (buildFor).
     *
     * `around`, for what is to be built as it is not drawn yet — a room
     * about to be drawn as a version that was not baked draws it
     * (World/LiveRoom.js): called with each batch and true before it is
     * built or drawn ahead, and with false after, to put on what it is to
     * be built with and take it off again before a frame is drawn. `batch`:
     * how many at a time — a dozen new shaders set going in one turn took
     * 30 to 60 ms of it, a stutter of its own; a room's are set going three
     * at a time. `paced`: where the programs had to be waited for — ones
     * this browser has not built before — each thing is drawn ahead by
     * itself, and no more than one program is drawn with for the first
     * time between two frames (drawAhead).
     *
     * `camera` says which lights they are built for, by its layers — the
     * scene's own, or those of a pass of its own (that room's); `without`,
     * lights that shine now and will not: left out for the length of each
     * batch, as `lights` are let in.
     *
     * `shadows`: stand-ins drawn with copies of the shadow maps' depth
     * materials (shadowTwins), built first, all at once — a few — with the
     * lights in, as three's shadow pass builds them: into a picture, not the
     * screen (what three keys a program's colour and tone by), and in an
     * empty scene of their own (`shadowScene`: no fog, no surroundings, as
     * the pass draws in none) with the scene's lights. Not drawn ahead: what
     * one draws is the program it had for the lights before, word for word,
     * and the browser has its pipeline already.
     */
    async build(lit, lights, camera, around = null, batch = PREPARE_BATCH, paced = false, without = [], shadows = []) {
        const renderer = this.renderer;
        const properties = renderer.properties;
        const programs = new Set();
        if (shadows.length) {
            const shown = lights.map((light) => light.visible);
            const shone = without.map((light) => light.visible);
            for (const light of lights) light.visible = true;
            for (const light of without) light.visible = false;
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(this.aheadThrough()[0]);
            // (three takes the lights from what it is handed as well as from the scene it builds for: the scene's, here.)
            this.shadowScene ??= new THREE.Scene();
            const handed = { traverseVisible: (visit) => this.scene.traverseVisible(visit), traverse: (visit) => shadows.forEach(visit) };
            try {
                for (const material of renderer.compile(handed, camera, this.shadowScene)) {
                    const program = properties.get(material).currentProgram;
                    if (program) programs.add(program);
                }
            } finally {
                renderer.setRenderTarget(previous);
                lights.forEach((light, k) => (light.visible = shown[k]));
                without.forEach((light, k) => (light.visible = shone[k]));
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        let next = 0;
        while (next < lit.length) {
            const shown = lights.map((light) => light.visible);
            const shone = without.map((light) => light.visible);
            for (const light of lights) light.visible = true;
            for (const light of without) light.visible = false;
            // Built as they will be drawn: through post-processing, into its own (linear, unexposed) picture.
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(this.post?.ao.beautyRenderTarget ?? null);
            const until = performance.now() + PREPARE_SLICE;
            try {
                while (next < lit.length && performance.now() < until) {
                    const some = lit.slice(next, (next += batch));
                    // three's `compile` takes the lights from the scene and the materials from what it is given.
                    const few = { traverseVisible() {}, traverse: (visit) => some.forEach(visit) };
                    around?.(some, true);
                    try {
                        for (const material of renderer.compile(few, camera, this.scene)) {
                            // (Its program for these lights, while it still has it: the next frame gives it back the one for the lights there are.)
                            const program = properties.get(material).currentProgram;
                            if (program) programs.add(program);
                            // ...and every other it has: one material drawn by a rigged mesh and by a plain one is two
                            // programs, and the one not waited for here was waited for at its first draw — 80 ms of a turn.
                            for (const other of properties.get(material).programs?.values() ?? []) programs.add(other);
                        }
                    } finally {
                        around?.(some, false);
                    }
                }
            } finally {
                renderer.setRenderTarget(previous);
                lights.forEach((light, k) => (light.visible = shown[k]));
                without.forEach((light, k) => (light.visible = shone[k]));
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        // ...until the GPU has linked them all: asked of one before that, three waits for it.
        const patience = performance.now() + PREPARE_PATIENCE;
        const waiting = new Set(programs);
        let waited = false;
        while (performance.now() < patience) {
            for (const program of waiting) if (program.isReady() !== false) waiting.delete(program);
            if (!waiting.size) break;
            waited = true;
            await new Promise((resolve) => setTimeout(resolve, 16));
        }
        // ...and each has been asked what three asks a program the first
        // time it draws with it — its uniforms, its attributes, its log —
        // which is several milliseconds apiece, and a second in all for
        // whatever first came into sight together.
        const ready = [...programs].filter((program) => !waiting.has(program));
        for (let k = 0; k < ready.length; ) {
            const until = performance.now() + PREPARE_SLICE;
            while (k < ready.length && performance.now() < until) ready[k++].getUniforms();
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        // ...and each has drawn once: the GPU makes what it draws a
        // program with only when it first does (on a Mac, most of the wait:
        // two of the seven seconds a street's worth took unprepared were
        // still to come at the first frame). So what is in sight is drawn
        // with the lights in, a batch at a time, into a few pixels of the
        // kind the view is drawn into.
        // (Paced only where the build had to be waited for: programs the browser has built before are linked as
        // soon as they are asked for, and draw at once.)
        if (this.post) await this.drawAhead(lit, lights, around, paced && waited ? 1 : batch, paced && waited, camera, without);
        // Straight to the screen there is no such picture: what is paced is drawn in the view's own frames (drawOnScreen).
        else if (paced) await this.drawOnScreen(lit, lights, around, camera, without);
        return { programs: programs.size, waited };
    }

    /**
     * That (drawAhead), where the view is drawn straight to the screen (no
     * post-processing): there is no picture off screen of the screen's own
     * kind, and a GPU makes a program's pipeline for the kind of picture it
     * draws into. So each thing is drawn once into the screen itself, in a
     * frame of the view, after its picture — through a scissor of one pixel
     * in a corner, which lets nothing of it show — one thing a frame, and
     * one whose programs have all drawn before not at all. In a tab that
     * draws no frames it waits (two seconds, then leaves the rest to their
     * first frame).
     */
    async drawOnScreen(lit, lights, around = null, sees = null, without = []) {
        const renderer = this.renderer;
        const properties = renderer.properties;
        const scene = this.scene;
        const eye = (this.aheadEye ??= new THREE.PerspectiveCamera());
        let missed = 0;
        for (let next = 0; next < lit.length && missed < 8; ) {
            const object = lit[next];
            // (What it will draw with — its program for these lights, which compile left as its current one.)
            around?.([object], true);
            const fresh = [].concat(object.material).some((material) => {
                const program = material && properties.get(material).currentProgram;
                return program && !this.drawnAhead.has(program);
            });
            around?.([object], false);
            if (!fresh) {
                next++;
                continue;
            }
            if (!(await this.nextFrame())) {
                missed++;
                continue;
            }
            missed = 0;
            next++;
            const camera = this.camera.activeCamera;
            if (this.post || !camera.isPerspectiveCamera) return;
            eye.copy(camera, false);
            eye.layers.set(AHEAD_LAYER);
            const seen = (sees ?? camera).layers;
            const shining = [];
            scene.traverseVisible((light) => {
                if (light.isLight && light.layers.test(seen) && !lights.includes(light) && !without.includes(light)) shining.push(light);
            });
            for (const light of lights) if (light.layers.test(seen)) shining.push(light);
            const shown = lights.map((light) => light.visible);
            const shone = without.map((light) => light.visible);
            for (const light of lights) light.visible = true;
            for (const light of without) light.visible = false;
            for (const light of shining) light.layers.enable(AHEAD_LAYER);
            const kept = { target: renderer.getRenderTarget(), clear: renderer.autoClear, background: scene.background, matrices: scene.matrixWorldAutoUpdate, shadows: renderer.shadowMap.autoUpdate, due: renderer.shadowMap.needsUpdate, scissor: renderer.getScissor(new THREE.Vector4()), test: renderer.getScissorTest() };
            scene.background = null;
            scene.matrixWorldAutoUpdate = false;
            renderer.shadowMap.autoUpdate = false;
            renderer.shadowMap.needsUpdate = false;
            renderer.autoClear = false;
            renderer.setRenderTarget(null);
            renderer.setScissor(0, 0, 1, 1);
            renderer.setScissorTest(true);
            object.layers.enable(AHEAD_LAYER);
            around?.([object], true);
            try {
                renderer.render(scene, eye);
                for (const material of [].concat(object.material)) {
                    const program = material && properties.get(material).currentProgram;
                    if (program) this.drawnAhead.add(program);
                }
            } finally {
                around?.([object], false);
                object.layers.disable(AHEAD_LAYER);
                renderer.setScissor(kept.scissor);
                renderer.setScissorTest(kept.test);
                renderer.setRenderTarget(kept.target);
                renderer.autoClear = kept.clear;
                renderer.shadowMap.autoUpdate = kept.shadows;
                renderer.shadowMap.needsUpdate = kept.due;
                scene.matrixWorldAutoUpdate = kept.matrices;
                scene.background = kept.background;
                for (const light of shining) light.layers.disable(AHEAD_LAYER);
                lights.forEach((light, k) => (light.visible = shown[k]));
                without.forEach((light, k) => (light.visible = shone[k]));
            }
        }
    }

    /**
     * What takes light (`lit`), drawn once with `lights` in the scene's
     * light, out of sight (buildFor): into a picture of a few pixels, made
     * as the post-processing's own is — the same formats, the same
     * multisampling — a batch at a time, picked out by a layer of its own,
     * which the lights that shine are put on too. Nothing else is drawn
     * for it: no shadow map, no sky, no matrix worked out again.
     *
     * `paced` (with `size` 1): one thing a draw, and after a draw by a
     * program that had not drawn before, nothing more until the view's next
     * frame has been drawn.
     *
     * `sees`: the camera whose layers say which lights shine on them (build)
     * — the view's own, unless they are drawn in a pass of their own.
     */
    async drawAhead(lit, lights, around = null, size = PREPARE_BATCH, paced = false, sees = null, without = []) {
        const renderer = this.renderer;
        const properties = renderer.properties;
        const scene = this.scene;
        const beauty = this.post.ao.beautyRenderTarget;
        if (this.ahead?.samples !== beauty.samples) {
            this.ahead?.dispose();
            this.ahead = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, samples: beauty.samples });
            this.ahead.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
        }
        const eye = (this.aheadEye ??= new THREE.PerspectiveCamera());
        // (Paced, what is seen through: the two pictures it is still to be drawn into, one a frame.)
        let through = null;
        for (let next = 0; next < lit.length || through; ) {
            const camera = this.camera.activeCamera;
            if (!this.post || !camera.isPerspectiveCamera) return;
            eye.copy(camera, false);
            eye.layers.set(AHEAD_LAYER);
            const seen = (sees ?? camera).layers;
            // The lights that shine now, and those to come — which the camera is to see —, on the layer drawn.
            const shining = [];
            scene.traverseVisible((object) => {
                if (object.isLight && object.layers.test(seen) && !lights.includes(object) && !without.includes(object)) shining.push(object);
            });
            for (const light of lights) if (light.layers.test(seen)) shining.push(light);
            const shown = lights.map((light) => light.visible);
            const shone = without.map((light) => light.visible);
            for (const light of lights) light.visible = true;
            for (const light of without) light.visible = false;
            for (const light of shining) light.layers.enable(AHEAD_LAYER);
            const previous = renderer.getRenderTarget();
            const background = scene.background;
            const matrices = scene.matrixWorldAutoUpdate;
            const shadows = renderer.shadowMap.autoUpdate;
            const due = renderer.shadowMap.needsUpdate;
            scene.background = null;
            scene.matrixWorldAutoUpdate = false;
            renderer.shadowMap.autoUpdate = false;
            renderer.shadowMap.needsUpdate = false;
            renderer.setRenderTarget(this.ahead);
            const until = performance.now() + PREPARE_SLICE;
            let first = false;
            try {
                do {
                    const waiting = through;
                    const batch = waiting ? waiting.batch : lit.slice(next, (next += size));
                    for (const object of batch) object.layers.enable(AHEAD_LAYER);
                    around?.(batch, true);
                    try {
                        if (waiting) {
                            // One of the two pictures of what is seen through, in a frame of its own: a pipeline of its own.
                            renderer.setRenderTarget(waiting.targets.shift());
                            renderer.render(scene, eye);
                            renderer.setRenderTarget(this.ahead);
                            if (!waiting.targets.length) through = null;
                            first = true;
                            continue;
                        }
                        renderer.render(scene, eye);
                        // (Paced, one thing at a time: whether what it was drawn by had drawn before.)
                        let fresh = false;
                        for (const material of paced ? batch.flatMap((object) => [].concat(object.material)) : []) {
                            const program = material && properties.get(material).currentProgram;
                            if (!program || this.drawnAhead.has(program)) continue;
                            this.drawnAhead.add(program);
                            fresh = true;
                        }
                        if (fresh) first = true;
                        // What is seen through is drawn twice more a frame, into the two pictures that tell the ambient
                        // occlusion where to leave off (PostProcessing.drawTransparency) — pictures of another kind, and
                        // a pipeline for each: a room's three kinds of glass were 84 ms of the frame that first showed it.
                        // Paced, and drawn by a program new to the GPU: each of the two in a frame of its own after this
                        // one — all three at once were the frames of 0.22–0.24 s of a first switch-on.
                        if (sees && batch.some((object) => [].concat(object.material).some((material) => material?.transparent))) {
                            if (fresh) through = { batch, targets: [...this.aheadThrough()] };
                            else {
                                for (const target of this.aheadThrough()) {
                                    renderer.setRenderTarget(target);
                                    renderer.render(scene, eye);
                                }
                                renderer.setRenderTarget(this.ahead);
                            }
                        }
                    } finally {
                        around?.(batch, false);
                        for (const object of batch) object.layers.disable(AHEAD_LAYER);
                    }
                } while (!first && next < lit.length && performance.now() < until);
            } finally {
                renderer.setRenderTarget(previous);
                renderer.shadowMap.autoUpdate = shadows;
                renderer.shadowMap.needsUpdate = due;
                scene.matrixWorldAutoUpdate = matrices;
                scene.background = background;
                for (const light of shining) light.layers.disable(AHEAD_LAYER);
                lights.forEach((light, k) => (light.visible = shown[k]));
                without.forEach((light, k) => (light.visible = shone[k]));
            }
            // Paced, and a program just drawn with for the first time: nothing more until the next frame of the view
            // has been drawn. A GPU makes a program's pipeline as it first draws with it — tens of milliseconds of its
            // own, which whatever is handed to it next waits for — and four set going within one slice were all
            // waited for by the frame that came next (154 ms, and 72 the one after). One a frame, each frame waits
            // for one.
            if (first) await this.nextFrame();
            else await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    /** Two pictures of a few pixels of the kinds the post-processing draws what is seen through into (drawAhead). */
    aheadThrough() {
        if (!this.aheadGlass) {
            const options = { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, format: THREE.RGBAFormat };
            const open = new THREE.WebGLRenderTarget(4, 4, options);
            const solid = new THREE.WebGLRenderTarget(4, 4, options);
            solid.depthTexture = new THREE.DepthTexture(4, 4, THREE.UnsignedIntType);
            this.aheadGlass = [open, solid];
        }
        return this.aheadGlass;
    }

    /**
     * Once the next frame has been drawn (render) — or a quarter of a second
     * on, in a tab that draws none. Resolves to whether a frame was: then it
     * is still that frame's turn, its picture not yet shown.
     */
    nextFrame() {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), 250);
            this.afterFrame.push(() => {
                clearTimeout(timer);
                resolve(true);
            });
        });
    }

    onResize() {
        this.renderer.setSize(this.sizes.width, this.sizes.height);
        this.renderer.setPixelRatio(this.sizes.pixelRatio);
        this.post?.setSize(this.sizes.width, this.sizes.height, this.sizes.pixelRatio, this.sizes.scale);
        this.experience.world?.editor?.onResize(this.sizes);
    }

    update() {
        this.stats?.begin();
        this.render();
        this.stats?.end();
        // (Every sixty frames — or two seconds, in the editor, which draws only when something changes: Pace.js.)
        const due = ++this.frames % 60 === 0;
        if (due || (this.experience.pace && performance.now() - (this.relinkedAt ?? 0) > 2000)) {
            this.relinkedAt = performance.now();
            this.relinkFailed();
        }
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
        const world = this.experience.world;
        // The editor's plain light (World/PlainLight.js), from over this camera's shoulder.
        const plain = this.plainExposure !== null;
        if (plain) world?.plainLight?.update(camera);
        // The editor draws its own frame: selection outline and gizmo on top —
        // in edit mode, and in the walkthrough while something is selected.
        const editor = world?.editor;
        if (editor?.draws) {
            // Its frames draw the shadows every time, as they come.
            this.realism.releaseShadows();
            if (editor.render(this.renderer, this.scene, camera)) return;
        }
        // What the editor draws in place of the house and the furniture, as the scene is now (World/StandIns.js; the
        // editor's own frames ask for it themselves, once a move from the walkthrough has followed the look).
        world?.standIns?.update(camera);
        // A baked view's light resolved into one lightmap: what has changed of it (a switch, a door), drawn again first.
        world?.sceneBuilder?.drawLight?.();
        // ...and, a room of it drawn live at its visitor's wish, what that room's own call needs first (World/LiveRoom.js).
        world?.roomLight?.draw();
        // Under the plain light, straight to the screen: none of the realism (Realism.update returns at once).
        this.realism.update(camera);
        if (this.post && !plain) this.post.render(camera);
        // (The scene but for what the stand-ins draw entirely, while they hold the editor's units still: StandIns.drawnScene.)
        else this.renderer.render(world?.standIns?.drawnScene() ?? this.scene, camera);
        // The colliders over it, when shown (Colliders.js): behind what the scene's depth hides where it was drawn straight
        // to the screen — the post-processing's picture has none.
        this.experience.colliders?.draw(this.renderer, camera, { depth: !(this.post && !plain) });
        // (Whatever waited for a frame to be drawn: nextFrame.)
        if (this.afterFrame.length) for (const drawn of this.afterFrame.splice(0)) drawn();
    }
}

/** How many programs three has for drawing shadow maps (Renderer.buildFor): its depth materials', by the start of their keys. */
function depthPrograms(renderer) {
    let count = 0;
    for (const program of renderer.info.programs ?? []) if (program.cacheKey.startsWith("depth,") || program.cacheKey.startsWith("distance,")) count++;
    return count;
}

/** What an object is drawn with, as it is now: its materials, and how many times each has been changed (Renderer.builtFor). */
function materialsMark(object) {
    return [].concat(object.material).map((material) => `${material.id}.${material.version}`).join();
}

/** Whether three builds a material's shader for the lights there are (its own `materialNeedsLights`). */
function takesLight(material) {
    return Boolean(
        material &&
            (material.isMeshLambertMaterial ||
                material.isMeshToonMaterial ||
                material.isMeshPhongMaterial ||
                material.isMeshStandardMaterial ||
                material.isShadowMaterial ||
                (material.isShaderMaterial && material.lights === true))
    );
}

/** The step's shadow filter: three's plain PCF, or its soft one (which the sun's PCSS rides on). */
function shadowType(quality) {
    return quality.shadow.filter === "pcf" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
}

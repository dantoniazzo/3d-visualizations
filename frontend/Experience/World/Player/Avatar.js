import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import Nametag from "./Nametag.js";
import { canonical, fitClip, rigOf } from "../../Utils/fitClip.js";

/**
 * What the app calls each of the avatars' own clips, by the name the GLB
 * gives it (Ready Player Me's, as Mixamo names them): the names Player plays
 * and sends to everyone else. A clip not listed goes by its own name in
 * lower case — a "Sitting" added to the files is "sitting".
 */
const CLIP_NAMES = { Dancing: "dancing", Idle: "idle", Jump: "jumping", Running: "running", Walking: "walking" };

/** How long one clip fades into the next, in seconds, unless asked otherwise (play). */
const FADE = 0.2;

/**
 * What a figure without a clip plays in its place, in turn (play): the
 * visitor's own clips beyond its five (VISITOR_CLIPS) come from a file a
 * clone of the repository has not got, and without them a visitor swims as
 * a wader — a stroke as walking, treading water as standing, climbing out
 * as a jump — and sits down and gets up on foot, sitting fading in and out
 * where it stands at the seat (Player.walkPlan, walkOffPlan): another
 * visitor seen doing either stands, or sits on.
 */
const STAND_INS = {
    breaststroke: ["swimming", "walking"],
    swimming: ["breaststroke", "walking"],
    treading: ["idle"],
    climbing: ["jumping"],
    "sit-down": ["idle"],
    "stand-up": ["sitting", "idle"],
};

/**
 * The visitor's own clips beyond the five its avatar files carry, by what
 * each is played (and sent to everyone else) as, each found in the file
 * of them by its name — a Mixamo download's file name, "Treading Water" —
 * where the file does not say (its `as`): the first that matches. Made by
 * `npm run people` (blender/import_people.py --avatar-clips, whose
 * AVATAR_AS says the same in the same order, and scripts/optimize-people.mjs)
 * into public/models/people/avatar-clips.glb and avatar-clips.json, one
 * skeleton's, and fitted to each avatar the first time it needs one
 * (wear). `sit-down` and `stand-up` onto a seat and off it (Player.js);
 * `climbing` out of the pool, `breaststroke` and `swimming` its strokes,
 * `treading` water (Player/Swim.js).
 */
export const VISITOR_CLIPS = {
    "sit-down": /stand(ing)? to sit|sit(ting)? down/i,
    "stand-up": /sit(ting)? to stand|stand(ing)? up|get(ting)? up/i,
    climbing: /climb|ledge|pull(ing)? up|exit|out of/i,
    breaststroke: /breast|to edge/i,
    treading: /tread/i,
    swimming: /swim|crawl|freestyle/i,
};
/**
 * Of those, the ones played once through and held at their end, not round
 * and round — a climb out, sitting down, getting up — each this much faster
 * than it was made (its time scale), on every page: Mixamo's take 2.2-3 s,
 * which held the visitor up.
 */
export const ONCE = { climbing: 1.15, "sit-down": 1.3, "stand-up": 1.45 };

/**
 * How a figure sits (sitting), as World/People.js measures a seated person:
 * what it sits on is the lowest of its own skin under its pelvis — all but
 * the lowest SEAT_LOWEST of it, a fold or two — within SEAT_REACH of the
 * pelvis across the floor, of the points weighted to SEAT_BONES; its soles,
 * the lowest of its skin weighted to FOOT_BONES.
 */
const SEAT_BONES = /^(Hips|LeftUpLeg|RightUpLeg|Spine)$/;
const FOOT_BONES = /^(Left|Right)(Foot|ToeBase|Toe_End)$/;
const SEAT_REACH = 0.22;
const SEAT_LOWEST = 0.01;
/** Where the eyes are from the head's bone, where the figure has no eye bones: up and forward, in metres. */
const EYES = [0.08, 0.11];

/**
 * Clips fitted to each avatar's file, and how it sits in each: by the
 * file's loaded GLTF (one for the visitor's own figure and every other
 * visitor's of that skin), then by name.
 */
const FITTED = new WeakMap();
const SEATED = new WeakMap();
/** Each clip's hips track and an interpolant of it (hipsAt), by the clip; and its bones' places at a moment (bonesAt), and all through it (bonesAlong). */
const HIPS_TRACKS = new WeakMap();
const BONES_AT = new WeakMap();
const BONES_ALONG = new WeakMap();
/** Each figure given the visitor's clips as they are being fitted (wear). */
const WEARING = new WeakMap();
/** What each dithered copy of a material a figure fades in (setOpacity) stands in for: the material it wears whole. */
const UNDITHERED = new WeakMap();
/** The pipeline's file of the visitor's clips and its list, once a page (visitorClips): null where there is none. */
let visitorFile = null;

const _v = new THREE.Vector3();

/**
 * A skinned character with a crossfading animation mixer.
 *
 * The source GLB is cloned per player via SkeletonUtils so everyone shares
 * one download but gets an independent skeleton and mixer.
 */
export default class Avatar {
    /**
     * @param {object} source  Loaded GLTF for this avatar skin.
     * @param {THREE.Scene} scene
     * @param {string} [name]  Shown on the nametag; omitted for the local player.
     * @param {string} [id]    Socket id, present only for remote players.
     */
    constructor(source, scene, name = "Guest", id) {
        this.scene = scene;
        this.id = id;
        this.source = source;

        this.nametag = new Nametag().createNametag(18, 170, name);

        this.avatar = SkeletonUtils.clone(source.scene);
        this.avatar.userData.id = id;
        /** Whether the visitor's own clips have been looked for and fitted to it, whether or not there were any (wear). */
        this.worn = false;
        /**
         * How much of it is drawn (setOpacity: 1, whole); while it is less
         * than whole, what each of its meshes wore whole and whether it cast
         * a shadow (null otherwise); and the dithered copy it wore last for
         * each material it has faded in — none until it first fades — and
         * those of them made here.
         */
        this.opacity = 1;
        this.faded = null;
        this.dithers = null;
        this.made = null;
        this.meshList = null;
        this.avatar.animations = source.animations.map((clip) => clip.clone());
        // Its skeleton as made, for clips of another skeleton's to be fitted to it (fit).
        this.rig = rigOf(this.avatar);

        this.setAvatar();
    }

    setAvatar() {
        this.speedAdjustment = 1;
        this.avatar.scale.set(0.99, 0.99, 0.99);

        this.avatar.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                // In the shade indoors — and, where the lamps are lit live,
                // not lit through the wall by the lamp next door.
                child.receiveShadow = true;
                child.frustumCulled = false;
            }
        });

        this.setAnimation();
        this.scene.add(this.avatar);

        // Only remote players get a floating label; you don't need your own.
        if (this.id) this.scene.add(this.nametag);
    }

    setAnimation() {
        this.animation = {};
        this.animation.mixer = new THREE.AnimationMixer(this.avatar);
        // (Of nothing, not an object: a name that comes over the network as it was sent — "toString" — is no clip.)
        this.animation.actions = Object.create(null);
        /**
         * How much of the figure's pose each clip playing makes now, by its
         * action — together always 1 — and the fade under way (blend): the
         * clip played last coming up to 1 and every other going down to 0,
         * all from what each made of the pose when it began.
         */
        this.animation.weights = new Map();
        this.animation.fading = null;

        // By name, not by their order in the file: a clip added to it, or one
        // taken out, would otherwise have every clip after it play as another.
        this.addClips(this.avatar.animations);

        this.animation.actions.current = this.animation.actions.idle;
        this.animation.actions.current?.play();
        if (this.animation.actions.current) this.animation.weights.set(this.animation.actions.current, 1);

        /**
         * How fast every clip plays besides its own pace: slower wading
         * (Player/Swim.js's stride), and 1 otherwise.
         */
        this.animation.stride = 1;

        /**
         * Play a clip by name, every clip showing now fading into it over
         * `fade` seconds — from as much of the pose as each makes this frame.
         * three's crossFadeFrom faded the one played last out from all of the
         * pose, whatever it made of it: played again in the middle of a fade
         * — a swimmer stopped and set off again within a fifth of a second,
         * the stroke and treading water flicking from one to the other
         * against a wall — the pose went back to it in one frame, and with
         * it the way it floats (Player/Swim.js): its bones 0.25-0.55 m, its
         * root up to 0.58 m. A clip still fading out, played again, goes on
         * from where it is, not from its start.
         */
        this.animation.play = (name, fade = FADE) => {
            // A clip this avatar has not got — asked for by a newer visitor's
            // page, say, or not yet fitted — is its stand-in (STAND_INS), or
            // stood still in, rather than the last one played going on.
            const known = this.playable(name);
            const newAction = this.animation.actions[known];
            const oldAction = this.animation.actions.current;

            if (!newAction || oldAction === newAction) return;

            this.speedAdjustment = known === "jumping" ? 1.5 : 1.0;

            const weights = this.animation.weights;
            const showing = newAction.isScheduled() ? (weights.get(newAction) ?? 0) : 0;
            if (showing <= 0) {
                newAction.reset();
                newAction.play();
                weights.set(newAction, 0);
            }
            const from = new Map();
            for (const [action, weight] of weights) if (action !== newAction) from.set(action, weight);
            // (As long as a whole fade would take for what is left of it: the pose changes as fast whatever it is faded from.)
            this.animation.fading = { from, to: newAction, start: showing, t: 0, length: Math.max(0, fade) * (1 - showing) };
            this.animation.actions.current = newAction;
            if (!(this.animation.fading.length > 0)) this.blend(0);
        };

        this.animation.update = (delta) => {
            const time = delta * this.speedAdjustment * this.animation.stride;
            this.blend(time);
            this.animation.mixer.update(time);
        };
    }

    /**
     * The fade under way (animation.play) `time` seconds on, in the mixer's
     * time, as three's own fades were: each clip's share of the pose set
     * for the mixer to pose the figure by; those faded out, stopped.
     */
    blend(time) {
        const { weights, fading } = this.animation;
        if (fading) {
            fading.t = fading.length > 0 ? Math.min(1, fading.t + time / fading.length) : 1;
            // (Linearly, as three's were: what sits and stands the figure moves its root in step — Player.js.)
            for (const [action, weight] of fading.from) weights.set(action, weight * (1 - fading.t));
            weights.set(fading.to, fading.start + (1 - fading.start) * fading.t);
            if (fading.t >= 1) {
                for (const action of fading.from.keys()) {
                    action.stop();
                    weights.delete(action);
                }
                this.animation.fading = null;
            }
        }
        for (const [action, weight] of weights) action.setEffectiveWeight(weight);
    }

    /** How much of the figure's pose the clip it plays as `name` (or what plays in its place: playable) makes now: 0 to 1. */
    weightOf(name) {
        const action = this.animation.actions[this.playable(name)];
        return action ? (this.animation.weights.get(action) ?? 0) : 0;
    }

    /** The clip `play(name)` plays: that one, if it has it; else its first stand-in it has; else idle. */
    playable(name) {
        const actions = this.animation.actions;
        if (name !== "current" && actions[name]) return name;
        for (const stand of STAND_INS[name] ?? []) if (actions[stand]) return stand;
        return "idle";
    }

    /**
     * Clips to play by name besides the avatar's own — fitted to it from
     * another set (a sitting or a swimming clip), or the avatar's own as it
     * is made. Each is played as `animation.play(name)` asks for it, and sent
     * to everyone else by that name; one of a name it already has takes that
     * one's place.
     *
     * @param {THREE.AnimationClip[]|Object<string, THREE.AnimationClip>} clips
     *        a list, each by its own name (CLIP_NAMES); or the names to play
     *        them by, each with its clip
     */
    addClips(clips) {
        const entries = Array.isArray(clips) ? clips.map((clip) => [CLIP_NAMES[clip.name] ?? clip.name.toLowerCase(), clip]) : Object.entries(clips);
        const { actions, mixer } = this.animation;
        for (const [name, clip] of entries) {
            if (!clip || name === "current") continue;
            const old = actions[name] ?? null;
            if (old?.getClip() === clip) continue;
            const action = mixer.clipAction(clip);
            // (Played once, held at its end until something else is played: a climb out, sitting down, getting up.)
            if (Object.hasOwn(ONCE, name)) {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.timeScale = ONCE[name];
            }
            actions[name] = action;
            if (!old) continue;
            // Playing now, or still fading out: the new one in its place, where the old one was in it, and as much of the pose.
            const weights = this.animation.weights;
            if (weights.has(old)) {
                action.reset().play();
                action.time = old.time;
                weights.set(action, weights.get(old));
                weights.delete(old);
                action.setEffectiveWeight(weights.get(action));
                const fading = this.animation.fading;
                if (fading?.to === old) fading.to = action;
                if (fading?.from.has(old)) {
                    fading.from.set(action, fading.from.get(old));
                    fading.from.delete(old);
                }
            }
            if (actions.current === old) actions.current = action;
            old.stop();
            // (Unless it plays under another name too.)
            if (!Object.values(actions).includes(old)) mixer.uncacheAction(old.getClip());
        }
    }

    /**
     * The figure drawn `opacity` (0 to 1) of the way there — dithered (three's
     * alphaHash), so that it needs no sorting against the water or the glass
     * behind it — to fade out where it stands and in where it is put (Player.
     * js: a seat sat on from afar, where the figure was put across the room
     * in a frame). While it is less than whole, each of its meshes wears a
     * dithered copy (ditheredOf) of what it wore whole — or of what it is
     * given meanwhile: the probes' light dresses a figure in copies of what
     * it wears (World/ProbeLight.js), and of a dithered copy those are
     * dithered too; a room shown live, in its own (World/LiveRoom.js) — and
     * casts no shadow while it is more gone than there. Whole (1), each mesh
     * wears again exactly what it wore whole, and casts its shadow as it did:
     * kept dithered for good, and the probes' copy of a copy made the frame
     * the visitor got up left at 0.991 of the way there for the rest of the
     * visit, the figure was never again quite what it was. And, whole, any
     * dithered copy given back to it since (a room shown live gives back what
     * it took, which may have been taken while it faded) is put back as what
     * it stands in for: asked each frame it is not fading (Player.update).
     */
    setOpacity(opacity) {
        if (opacity >= 1) {
            this.whole();
            return;
        }
        this.faded ??= { worn: new Map(), shadows: new Map() };
        this.dithers ??= new WeakMap();
        this.made ??= new Set();
        const { worn, shadows } = this.faded;
        this.opacity = Math.max(0, opacity);
        for (const mesh of this.meshes()) {
            if (!shadows.has(mesh)) shadows.set(mesh, mesh.castShadow);
            mesh.castShadow = shadows.get(mesh) && this.opacity > 0.5;
            const list = [mesh.material].flat();
            const was = worn.get(mesh) ?? [];
            let swapped = false;
            for (let i = 0; i < list.length; i++) {
                // What it wears whole, kept — given since, the newest — and a dithered copy of it worn meanwhile.
                if (!list[i].userData.dithered) {
                    was[i] = list[i];
                    list[i] = this.ditheredOf(list[i]);
                    swapped = true;
                }
                // (A copy of the copy, the probes' own: standing in for the same.)
                if (!UNDITHERED.has(list[i]) && was[i]) UNDITHERED.set(list[i], was[i]);
                list[i].opacity = (was[i]?.opacity ?? 1) * this.opacity;
            }
            worn.set(mesh, was);
            if (swapped) mesh.material = Array.isArray(mesh.material) ? list : list[0];
        }
    }

    /**
     * The figure whole again (setOpacity's 1): each mesh in what it wore
     * whole, the dithered copy it wore last kept for the next fade — of the
     * probes' material, the probes' own copy, which they leave as it is, not
     * dressing the figure afresh each time — and casting its shadow as it
     * did. Not fading, any dithered copy it wears put back as what it stands
     * in for.
     */
    whole() {
        const faded = this.faded;
        this.opacity = 1;
        if (!faded) {
            if (!this.dithers) return;
            for (const mesh of this.meshes()) {
                const material = mesh.material;
                if (Array.isArray(material) ? !material.some((each) => each?.userData.dithered) : !material?.userData.dithered) continue;
                const back = [material].flat().map((each) => (each?.userData.dithered ? (UNDITHERED.get(each) ?? each) : each));
                mesh.material = Array.isArray(material) ? back : back[0];
            }
            return;
        }
        this.faded = null;
        for (const [mesh, was] of faded.worn) {
            const list = [mesh.material].flat();
            if (!list.some((material) => material?.userData.dithered)) continue;
            const back = list.map((material, i) => {
                if (!material?.userData.dithered) return material;
                const own = was[i] ?? UNDITHERED.get(material) ?? material;
                if (own !== material) this.dithers.set(own, material);
                return own;
            });
            mesh.material = Array.isArray(mesh.material) ? back : back[0];
        }
        for (const [mesh, shadow] of faded.shadows) mesh.castShadow = shadow;
    }

    /**
     * A dithered copy of a material the figure wears (setOpacity): the one it
     * wore last for it, or a new one — lit as the material is, its shader's
     * additions taken with it (the probes' light: World/ProbeLight.js's
     * lightByProbes, which a copy has not of its own until the probes dress
     * the figure again).
     */
    ditheredOf(material) {
        let copy = this.dithers.get(material);
        if (!copy) {
            copy = material.clone();
            copy.alphaHash = true;
            copy.userData.dithered = true;
            copy.onBeforeCompile = material.onBeforeCompile;
            copy.customProgramCacheKey = material.customProgramCacheKey;
            this.dithers.set(material, copy);
            this.made.add(copy);
        }
        UNDITHERED.set(copy, material);
        return copy;
    }

    /** Its meshes, once (setOpacity). */
    meshes() {
        if (!this.meshList) {
            this.meshList = [];
            this.avatar.traverse((mesh) => {
                if (mesh.isMesh && mesh.material) this.meshList.push(mesh);
            });
        }
        return this.meshList;
    }

    /** Whether it has a clip of that name to play (its own, or one fitted to it). */
    has(name) {
        return name !== "current" && Boolean(this.animation.actions[name]);
    }

    /**
     * A clip of another skeleton's — the people's shared file's (World/
     * People.js) — fitted to this figure (Utils/fitClip.js: its rotations,
     * its hips' movement scaled from the clips' skeleton's hips, `hips`
     * metres high, to this one's, and carried into whatever this one's hips
     * hang from) and played as `name`, as addClips plays its own. Fitted
     * once for each avatar's file: every visitor of that skin plays the one
     * clip.
     *
     * @param {string} name  what it is played as ("sitting")
     * @param {THREE.AnimationClip} clip
     * @param {number|null} hips  how high the clips' skeleton's hips are at rest, in metres
     * @returns {THREE.AnimationClip}  the clip fitted
     */
    fit(name, clip, hips) {
        let fitted = FITTED.get(this.source);
        if (!fitted) FITTED.set(this.source, (fitted = new Map()));
        if (fitted.get(name)?.from !== clip) {
            const ratio = this.rig.hips && hips ? this.rig.hips / hips : null;
            fitted.set(name, { from: clip, clip: fitClip(clip, this.rig, null, ratio, { into: this.rig.parent }).fitted });
            SEATED.get(this.source)?.delete(name);
        }
        const own = fitted.get(name).clip;
        this.addClips({ [name]: own });
        return own;
    }

    /**
     * How this figure sits playing `name`, a sitting clip fitted to it
     * (fit), measured once for each avatar's file at the clip's start on a
     * copy of it, at its root, facing +z as a rig does, at its own scale —
     * as World/People.js measures each seated person on their own body:
     *
     *   seat   the point it sits on: under its pelvis, as low as the lowest
     *          of its own skin there
     *   soles  how high the lowest of its soles is
     *   knee   how far forward of the seat its rearmost knee is; `tuck` its
     *          rearmost ankle, `far` its foremost (shared/people.js's sitter)
     *   head   its head's bone, where a camera behind it turns round
     *   eye    between its eyes, where it looks from
     *
     * All in metres, in its root's frame. Null for a clip it has not got.
     */
    sitting(name) {
        let seated = SEATED.get(this.source);
        if (!seated) SEATED.set(this.source, (seated = new Map()));
        if (seated.has(name)) return seated.get(name);
        const clip = FITTED.get(this.source)?.get(name)?.clip;
        if (!clip) return null;

        const copy = SkeletonUtils.clone(this.source.scene);
        copy.scale.copy(this.avatar.scale);
        const mixer = new THREE.AnimationMixer(copy);
        mixer.clipAction(clip).play();
        mixer.update(0);
        copy.updateMatrixWorld(true);

        const at = (bone) => {
            const node = this.rig.boneNames.has(bone) ? copy.getObjectByName(this.rig.boneNames.get(bone)) : null;
            return node ? node.getWorldPosition(new THREE.Vector3()) : null;
        };
        const pelvis = at("Hips") ?? new THREE.Vector3(0, 0.54, 0);
        const head = at("Head") ?? pelvis.clone().add(new THREE.Vector3(0, 0.7, 0.06));
        const eyes = [at("LeftEye"), at("RightEye")].filter(Boolean);
        const eye = eyes.length ? eyes.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(eyes.length) : head.clone().add(new THREE.Vector3(0, EYES[0], EYES[1]));

        // Its skin, posed: what it sits on, and its soles.
        const under = [];
        let soles = Infinity;
        copy.traverse((mesh) => {
            const { skinIndex, skinWeight } = mesh.geometry?.attributes ?? {};
            if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
            const names = mesh.skeleton.bones.map((bone) => canonical(bone.name));
            for (let i = 0; i < skinIndex.count; i++) {
                let seat = 0;
                let foot = 0;
                for (let k = 0; k < 4; k++) {
                    const bone = names[skinIndex.getComponent(i, k)];
                    if (SEAT_BONES.test(bone)) seat += skinWeight.getComponent(i, k);
                    else if (FOOT_BONES.test(bone)) foot += skinWeight.getComponent(i, k);
                }
                if (seat <= 0.6 && foot <= 0.6) continue;
                mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
                if (foot > 0.6) soles = Math.min(soles, _v.y);
                else if (_v.y <= pelvis.y && Math.hypot(_v.x - pelvis.x, _v.z - pelvis.z) <= SEAT_REACH) under.push(_v.y);
            }
        });
        under.sort((a, b) => a - b);
        const seat = new THREE.Vector3(pelvis.x, under.length > 20 ? under[Math.floor(under.length * SEAT_LOWEST)] : pelvis.y - 0.14, pelvis.z);

        const forward = (bone) => {
            const point = at(bone);
            return point ? point.z - seat.z : null;
        };
        const knees = [forward("LeftLeg"), forward("RightLeg")].filter(Number.isFinite);
        const ankles = [forward("LeftFoot"), forward("RightFoot")].filter(Number.isFinite);
        const info = {
            seat,
            soles: Number.isFinite(soles) ? soles : null,
            knee: knees.length ? Math.min(...knees) : null,
            tuck: ankles.length ? Math.min(...ankles) : null,
            far: ankles.length ? Math.max(...ankles) : null,
            head,
            eye,
        };
        mixer.stopAllAction();
        mixer.uncacheRoot(copy);
        copy.traverse((node) => node.isSkinnedMesh && node.skeleton.dispose());
        seated.set(name, info);
        return info;
    }

    /**
     * Where this figure's hips are `time` seconds into the clip it plays as
     * `name` (or what plays in its place: playable), in its root's frame
     * and at its own scale, in metres — read from the clip's own hips track,
     * carried out of whatever the hips hang from (rigOf's `parent`: the male
     * avatar's turned, centimetre Armature): so cheap it is read every frame
     * of a climb out of the pool (Player/Swim.js) and of sitting down
     * (Player.js), whose clips move the hips across the floor. Null for a
     * clip it has not got, or one that does not move its hips.
     *
     * @param {string} name
     * @param {number} time  seconds, held within the clip
     * @param {THREE.Vector3} [target]
     */
    hipsAt(name, time, target = new THREE.Vector3()) {
        const clip = this.animation.actions[this.playable(name)]?.getClip();
        if (!clip) return null;
        let hips = HIPS_TRACKS.get(clip);
        if (hips === undefined) {
            const bone = this.rig.boneNames.get("Hips");
            const track = clip.tracks.find((item) => item.name === `${bone}.position`) ?? null;
            HIPS_TRACKS.set(clip, (hips = track && { at: track.createInterpolant() }));
        }
        if (!hips) return null;
        target.fromArray(hips.at.evaluate(THREE.MathUtils.clamp(time, 0, clip.duration)));
        if (this.rig.parent) target.applyMatrix4(this.rig.parent.matrix);
        return target.multiply(this.avatar.scale);
    }

    /**
     * Where `bones` (their names without a prefix: "LeftHand") are `time`
     * seconds into the clip it plays as `name`, in its root's frame and at
     * its own scale — measured once for each clip, moment and bone, on a
     * copy of the figure, as sitting measures how it sits: where a climb out
     * of the pool holds the edge (Player/Swim.js). A bone it has not got is
     * left out; null for a clip it has not got.
     *
     * @returns {Object<string, THREE.Vector3>|null}
     */
    bonesAt(name, time, bones) {
        const clip = this.animation.actions[this.playable(name)]?.getClip();
        if (!clip) return null;
        let byMoment = BONES_AT.get(clip);
        if (!byMoment) BONES_AT.set(clip, (byMoment = new Map()));
        const key = `${time}:${bones.join(",")}`;
        if (byMoment.has(key)) return byMoment.get(key);
        const copy = SkeletonUtils.clone(this.source.scene);
        copy.scale.copy(this.avatar.scale);
        const mixer = new THREE.AnimationMixer(copy);
        // (Held at its end, not round to its start again, at its length.)
        const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        mixer.setTime(THREE.MathUtils.clamp(time, 0, clip.duration));
        copy.updateMatrixWorld(true);
        const found = {};
        for (const bone of bones) {
            const node = this.rig.boneNames.has(bone) ? copy.getObjectByName(this.rig.boneNames.get(bone)) : null;
            if (node) found[bone] = node.getWorldPosition(new THREE.Vector3());
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(copy);
        copy.traverse((node) => node.isSkinnedMesh && node.skeleton.dispose());
        byMoment.set(key, found);
        return found;
    }

    /**
     * Where `bones` are at `count` moments evenly through the clip it plays
     * as `name` — its start and its end among them — in its root's frame
     * and at its own scale, as bonesAt has them; but all measured on the one
     * copy of the figure, once for each clip: how a climb out of the pool is
     * fitted to the pool's edge (Player/Swim.js), and the body that sitting
     * down and getting up is looked over for room by (Player.js). Null for a
     * clip it has not got.
     *
     * @returns {{ time: number, bones: Object<string, THREE.Vector3> }[]|null}
     */
    bonesAlong(name, bones, count) {
        const clip = this.animation.actions[this.playable(name)]?.getClip();
        if (!clip) return null;
        let byKey = BONES_ALONG.get(clip);
        if (!byKey) BONES_ALONG.set(clip, (byKey = new Map()));
        const key = `${count}:${bones.join(",")}`;
        if (byKey.has(key)) return byKey.get(key);
        const copy = SkeletonUtils.clone(this.source.scene);
        copy.scale.copy(this.avatar.scale);
        const mixer = new THREE.AnimationMixer(copy);
        const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        const nodes = bones.map((bone) => [bone, this.rig.boneNames.has(bone) ? copy.getObjectByName(this.rig.boneNames.get(bone)) : null]);
        const along = [];
        for (let i = 0; i < count; i++) {
            const time = (clip.duration * i) / Math.max(1, count - 1);
            mixer.setTime(time);
            copy.updateMatrixWorld(true);
            const found = {};
            for (const [bone, node] of nodes) if (node) found[bone] = node.getWorldPosition(new THREE.Vector3());
            along.push({ time, bones: found });
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(copy);
        copy.traverse((node) => node.isSkinnedMesh && node.skeleton.dispose());
        byKey.set(key, along);
        return along;
    }

    /**
     * This figure given the visitor's own clips beyond its five (VISITOR_CLIPS:
     * swimming, treading water, climbing out, sitting down, getting up), each
     * fitted to it (fit) — once each figure: the visitor's own the first
     * time it swims or sits, another visitor's the first time theirs is seen
     * doing one. Resolves to whether it has any: none where the file is not
     * there (a clone without the downloads), and the stand-ins play.
     *
     * @param {Experience} experience  whose loader fetches the file
     * @returns {Promise<boolean>}
     */
    wear(experience) {
        let worn = WEARING.get(this);
        if (!worn) {
            worn = visitorClips(experience).then((found) => {
                this.worn = true;
                if (!found) return false;
                for (const [name, { clip, hips }] of found) this.fit(name, clip, hips);
                return found.size > 0;
            });
            WEARING.set(this, worn);
        }
        return worn;
    }

    dispose() {
        this.setOpacity(1);
        for (const copy of this.made ?? []) copy.dispose();
        this.nametag.material.map?.dispose();
        this.nametag.material.dispose();
        this.scene.remove(this.nametag);

        this.avatar.traverse((child) => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else {
                    child.material?.dispose();
                }
            }
        });

        this.animation.mixer.stopAllAction();
        this.scene.remove(this.avatar);
    }
}

/**
 * The visitor's own clips (VISITOR_CLIPS), loaded once a page from the
 * pipeline's avatar-clips.json and the file it names, with how high its
 * skeleton's hips stand: a Map of what each is played as to `{ clip, hips,
 * entry }` (entry: the json's own, its `grip`, `duration`…), or null where
 * there is no such file — which is not an error: the stand-ins play.
 *
 * @param {Experience} experience
 * @returns {Promise<Map<string, object>|null>}
 */
export function visitorClips(experience) {
    visitorFile ??= (async () => {
        const response = await fetch("/models/people/avatar-clips.json").catch(() => null);
        if (!response?.ok) return null;
        const index = await response.json().catch(() => null);
        if (!index?.file || !Array.isArray(index.list)) return null;
        const url = new URL(`/models/${index.file}`, window.location.href).href;
        const gltf = await experience.resources.loaders.gltfLoader.loadAsync(url);
        const found = new Map();
        for (const entry of index.list) {
            const name = entry.as ?? Object.keys(VISITOR_CLIPS).find((key) => VISITOR_CLIPS[key].test(entry.name));
            const clip = gltf.animations?.find((item) => item.name === entry.name);
            if (name && clip && !found.has(name)) found.set(name, { clip, hips: index.hips ?? null, entry });
        }
        return found;
    })().catch((error) => {
        console.warn("The visitor's own clips did not load: the stand-ins play", error);
        return null;
    });
    return visitorFile;
}

import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * A clip made on one skeleton, played by another: the people's one file of
 * clips (public/models/people/clips.glb, Mixamo's, on its own skeleton) on
 * each of the people's characters (World/People.js), and its sitting clip
 * on the visitor's own figure, the two avatars (Player/Avatar.js).
 *
 * All of them are Mixamo's skeleton — the same bones, by the same names
 * (but for a prefix: `canonical`), each bone's own frame the same way
 * round, so a bone's rotation in the clip is the rotation it is given. What
 * is not the same is each skeleton's size — so of the clip's movement only
 * the hips' is kept, scaled from the clip's skeleton's hips to the
 * figure's, and every other bone keeps its own length — and, on one figure,
 * where the skeleton stands in the file: avatar_male.glb's bones hang from
 * an "Armature" turned +90° about x and scaled 0.01 (an FBX's centimetres,
 * z up), and its own clips turn its hips −90° back and move them in
 * centimetres. A clip whose hips are moved and turned in a skeleton's own
 * frame, y up, in metres (the people's), played there as it is, laid that
 * figure on his back a metre off the floor. So the hips' keys are carried
 * into the frame of whatever their bone hangs from (`rigOf`'s `parent`):
 * turned and moved back by it — on avatar_female.glb and the people's
 * characters, whose skeletons stand in their files unturned, that changes
 * nothing.
 */

/** A bone's name without its rig's prefix: `mixamorigHips`, `mixamorig:Hips` and `Hips` are all `Hips`. */
export function canonical(name) {
    return String(name ?? "").replace(/^.*mixamorig\d*[:_]?/i, "");
}

/**
 * A figure's skeleton, as a clip is fitted to it, from its scene as made
 * (at rest, before anything has played on it): its bones' names by their
 * names without a prefix (`boneNames`, and `boneSet` of them), how far its
 * hips are from what they hang from (`hipsLength`, in that's own units) and
 * how high over its root, in metres (`hips`), and what they hang from as it
 * stands in the root (`parent`: `{ quaternion, matrix }`), or null where
 * that is the root's own frame, unturned and unscaled.
 *
 * @param {THREE.Object3D} root
 */
export function rigOf(root) {
    root.updateMatrixWorld(true);
    const boneNames = new Map();
    root.traverse((node) => {
        if (node.isMesh) return;
        const name = canonical(node.name);
        if (name && !boneNames.has(name) && (node.isBone || /^mixamorig/i.test(node.name))) boneNames.set(name, node.name);
    });
    // (A rig whose bones were not made Bones: its skinned meshes' skeletons say what they are.)
    root.traverse((node) => {
        if (!node.isSkinnedMesh) return;
        for (const bone of node.skeleton.bones) {
            const name = canonical(bone.name);
            if (!boneNames.has(name)) boneNames.set(name, bone.name);
        }
    });
    const hips = boneNames.has("Hips") ? root.getObjectByName(boneNames.get("Hips")) : null;
    const inRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    let parent = null;
    let height = null;
    if (hips) {
        height = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(inRoot, hips.matrixWorld)).y;
        if (hips.parent && hips.parent !== root) {
            const matrix = new THREE.Matrix4().multiplyMatrices(inRoot, hips.parent.matrixWorld);
            if (!matrix.equals(IDENTITY)) {
                const quaternion = new THREE.Quaternion();
                matrix.decompose(new THREE.Vector3(), quaternion, new THREE.Vector3());
                parent = { quaternion, matrix };
            }
        }
    }
    return {
        boneNames,
        boneSet: new Set(boneNames.values()),
        hipsLength: hips ? hips.position.length() : null,
        hips: height,
        parent,
    };
}

const IDENTITY = new THREE.Matrix4();

/**
 * A clip of the shared file as it plays on `character` (World/People.js's
 * character, or rigOf's answer): its tracks named for the character's
 * bones; only rotations, and the hips' movement, kept — each character's
 * bones keep their own lengths — and the hips' movement scaled from the
 * height of the clips' skeleton's hips at rest (`standHips`) to the
 * character's own — or by `ratio`, the index's character.hips /
 * clips.hips, when it has them. Given `into` (rigOf's `parent`: what the
 * character's hips hang from, as it stands in its root), the hips' keys —
 * made in the clips' skeleton's root frame — are carried into that one's.
 *
 * @returns {{ fitted: THREE.AnimationClip, scale: number }}
 */
export function fitClip(clip, character, standHips, ratio = null, { into = null } = {}) {
    const scale = ratio ?? (standHips && character.hipsLength ? character.hipsLength / standHips : 1);
    const back = into ? { quaternion: into.quaternion.clone().invert(), matrix: into.matrix.clone().invert() } : null;
    const tracks = [];
    for (const track of clip.tracks) {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
        const bone = canonical(nodeName);
        const name = character.boneNames.get(bone);
        if (!name) continue;
        const hips = bone === "Hips";
        if (propertyName === "position" && !hips) continue;
        if (propertyName === "scale") continue;
        const copy = track.clone();
        copy.name = `${name}.${propertyName}`;
        if (hips && propertyName === "position" && scale !== 1) {
            for (let i = 0; i < copy.values.length; i++) copy.values[i] *= scale;
        }
        if (hips && back) carry(copy, propertyName, back);
        tracks.push(copy);
    }
    return { fitted: new THREE.AnimationClip(clip.name, clip.duration, tracks), scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

/** A hips track's keys carried from the root's frame into what the hips hang from (`back`: its inverse). */
function carry(track, propertyName, back) {
    const values = track.values;
    if (propertyName === "quaternion") {
        for (let i = 0; i < values.length; i += 4) {
            _q.fromArray(values, i).premultiply(back.quaternion).toArray(values, i);
        }
    } else if (propertyName === "position") {
        for (let i = 0; i < values.length; i += 3) {
            _p.fromArray(values, i).applyMatrix4(back.matrix).toArray(values, i);
        }
    }
}

// ---------------------------------------------------------------------
// A sitting clip's legs, stretched for a lower seat
// ---------------------------------------------------------------------

/**
 * Where a clip puts a figure's legs at its start, measured on a copy of
 * the figure posed by it (as Player/Avatar.js's sitting measures how it
 * sits), for openKnees: each side's knee and ankle, in the root's frame;
 * how low its foot is (`low`: the lowest of its own skin weighted to that
 * foot — a heel, where the leg is stretched out; the toes, where it is
 * tucked back under the seat); and the axis the knee
 * opens about — across the leg, square to the thigh and the shin — in the
 * root's frame (`axis`) and in the thigh's (`local`, the frame the shin's
 * rotation is said in). Null for a side the figure has no thigh, shin or
 * foot on.
 *
 * @param {THREE.Object3D} root  the figure's scene, as made
 * @param {THREE.AnimationClip} clip  a clip fitted to it (fitClip)
 * @param {object} rig  its rigOf
 * @param {THREE.Vector3} [scale]  its root's scale where it is drawn
 * @returns {{ left: object|null, right: object|null }}
 */
export function legsAt(root, clip, rig, scale = null) {
    const copy = SkeletonUtils.clone(root);
    if (scale) copy.scale.copy(scale);
    const mixer = new THREE.AnimationMixer(copy);
    mixer.clipAction(clip).play();
    mixer.update(0);
    copy.updateMatrixWorld(true);
    const bone = (name) => (rig.boneNames.has(name) ? copy.getObjectByName(rig.boneNames.get(name)) : null);
    // Each foot's lowest, on the figure's skin as it is posed.
    const lowest = { Left: Infinity, Right: Infinity };
    copy.traverse((mesh) => {
        const { skinIndex, skinWeight } = mesh.geometry?.attributes ?? {};
        if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
        const feet = mesh.skeleton.bones.map((node) => FOOT.exec(canonical(node.name))?.[1] ?? null);
        for (let i = 0; i < skinIndex.count; i++) {
            const weights = { Left: 0, Right: 0 };
            for (let k = 0; k < 4; k++) {
                const foot = feet[skinIndex.getComponent(i, k)];
                if (foot) weights[foot] += skinWeight.getComponent(i, k);
            }
            const foot = weights.Left > 0.6 ? "Left" : weights.Right > 0.6 ? "Right" : null;
            if (foot) lowest[foot] = Math.min(lowest[foot], mesh.getVertexPosition(i, _p).applyMatrix4(mesh.matrixWorld).y);
        }
    });
    const side = (prefix) => {
        const [thigh, shin, foot] = [bone(`${prefix}UpLeg`), bone(`${prefix}Leg`), bone(`${prefix}Foot`)];
        if (!thigh || !shin || !foot) return null;
        const hip = thigh.getWorldPosition(new THREE.Vector3());
        const knee = shin.getWorldPosition(new THREE.Vector3());
        const ankle = foot.getWorldPosition(new THREE.Vector3());
        const toes = bone(`${prefix}ToeBase`)?.getWorldPosition(new THREE.Vector3());
        // (A figure with no skin there: the lower of its ankle and its toes.)
        const low = Number.isFinite(lowest[prefix]) ? lowest[prefix] : Math.min(ankle.y, toes?.y ?? Infinity);
        // Turning the shin about this towards the thigh's line opens the knee.
        const axis = new THREE.Vector3().subVectors(ankle, knee).cross(new THREE.Vector3().subVectors(knee, hip)).normalize();
        const local = axis.clone().applyQuaternion(thigh.getWorldQuaternion(new THREE.Quaternion()).invert());
        return { knee, ankle, low, axis, local };
    };
    const legs = { left: side("Left"), right: side("Right") };
    mixer.stopAllAction();
    mixer.uncacheRoot(copy);
    copy.traverse((node) => node.isSkinnedMesh && node.skeleton.dispose());
    return legs;
}

/**
 * How far up a leg's foot comes with its knee opened `angle` radians
 * (legsAt's side): the ankle turned about the knee — the foot, kept as it
 * was (openKnees), with it.
 */
export function footRise({ knee, ankle, axis }, angle) {
    const shin = new THREE.Vector3().subVectors(ankle, knee);
    return shin.clone().applyAxisAngle(axis, angle).sub(shin).y;
}

/**
 * How far to open a leg's knee (legsAt's side) for its foot to come `need`
 * metres up (footRise): the least turn either way that does — a shin
 * hanging before the seat opens, out towards the thigh's line; one tucked
 * back under it closes, further under — `most` radians at most; or, where
 * none does, the turn that brings it up furthest (none, if every turn
 * lowers it).
 */
export function kneeFor(leg, need, most) {
    if (!leg || need <= 0) return 0;
    const STEPS = 64;
    let best = 0;
    let bestRise = 0;
    for (let i = 1; i <= STEPS; i++) {
        for (const sign of [1, -1]) {
            const angle = (sign * most * i) / STEPS;
            const rise = footRise(leg, angle);
            if (rise >= need) {
                // Between this turn and the last, halved: the least that does.
                let lo = (sign * most * (i - 1)) / STEPS;
                let hi = angle;
                for (let k = 0; k < 16; k++) {
                    const middle = (lo + hi) / 2;
                    if (footRise(leg, middle) >= need) hi = middle;
                    else lo = middle;
                }
                return hi;
            }
            if (rise > bestRise) {
                best = angle;
                bestRise = rise;
            }
        }
    }
    return best;
}

/**
 * A copy of a clip with its knees opened — `angles.left` and `.right`
 * radians, each towards the thigh's line: the shins turned out, as
 * someone on a lower seat puts their feet further forward (or, less than
 * 0, a shin tucked under the seat turned further under) — and each foot
 * turned back by as much, so that its sole lies as it did: on a seat lower
 * than the clip was made for, its feet came down through the floor. `legs`
 * (legsAt's) say about what, in each thigh's frame; the rest of the clip
 * is as it was. Bones' own frames are the same way round on every Mixamo
 * skeleton (above), so a clip of the shared file opened by legs measured
 * on a figure is opened as it plays on that figure.
 *
 * @param {THREE.AnimationClip} clip
 * @param {{ left: object|null, right: object|null }} legs
 * @param {{ left: number, right: number }} angles
 * @param {string} [name]
 */
export function openKnees(clip, legs, angles, name = clip.name) {
    const byBone = new Map();
    for (const track of clip.tracks) {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
        if (propertyName === "quaternion") byBone.set(canonical(nodeName), track);
    }
    const tracks = clip.tracks.map((track) => track.clone());
    const replace = (old, made) => (tracks[clip.tracks.indexOf(old)] = made);
    for (const [prefix, leg, angle] of [["Left", legs.left, angles.left], ["Right", legs.right, angles.right]]) {
        const shin = byBone.get(`${prefix}Leg`);
        if (!leg || !shin || !angle) continue;
        const turn = new THREE.Quaternion().setFromAxisAngle(leg.local, angle);
        const back = turn.clone().invert();
        // The shin, turned in the thigh's frame.
        const opened = shin.clone();
        for (let i = 0; i < opened.values.length; i += 4) _q.fromArray(opened.values, i).premultiply(turn).toArray(opened.values, i);
        replace(shin, opened);
        // The foot, turned back as much where it is, at each of its keys: Q_shin⁻¹ · turn⁻¹ · Q_shin · Q_foot.
        const foot = byBone.get(`${prefix}Foot`);
        if (!foot) continue;
        const at = shin.createInterpolant();
        const kept = foot.clone();
        for (let k = 0; k < kept.times.length; k++) {
            const q = _shin.fromArray(at.evaluate(kept.times[k]));
            _r.copy(q).invert().multiply(back).multiply(q);
            _q.fromArray(kept.values, k * 4).premultiply(_r).toArray(kept.values, k * 4);
        }
        replace(foot, kept);
    }
    return new THREE.AnimationClip(name, clip.duration, tracks);
}

/** The bones a foot's skin is weighted to, by side (as Player/Avatar.js's FOOT_BONES). */
const FOOT = /^(Left|Right)(Foot|ToeBase|Toe_End)$/;
const _shin = new THREE.Quaternion();
const _r = new THREE.Quaternion();

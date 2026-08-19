import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import Nametag from "./Nametag.js";

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

        this.nametag = new Nametag().createNametag(18, 170, name);

        this.avatar = SkeletonUtils.clone(source.scene);
        this.avatar.userData.id = id;
        this.avatar.animations = source.animations.map((clip) => clip.clone());

        this.setAvatar();
    }

    setAvatar() {
        this.speedAdjustment = 1;
        this.avatar.scale.set(0.99, 0.99, 0.99);

        this.avatar.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
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
        this.animation.actions = {};

        // Clip order in the source GLBs.
        const clips = ["dancing", "idle", "jumping", "running", "walking", "waving"];
        clips.forEach((name, index) => {
            const clip = this.avatar.animations[index];
            if (clip) {
                this.animation.actions[name] = this.animation.mixer.clipAction(clip);
            }
        });

        this.animation.actions.current = this.animation.actions.idle;
        this.animation.actions.current?.play();

        this.animation.play = (name) => {
            const newAction = this.animation.actions[name];
            const oldAction = this.animation.actions.current;

            if (!newAction || oldAction === newAction) return;

            this.speedAdjustment = name === "jumping" ? 1.5 : 1.0;

            newAction.reset();
            newAction.play();
            if (oldAction) newAction.crossFadeFrom(oldAction, 0.2, false);

            this.animation.actions.current = newAction;
        };

        this.animation.update = (delta) => {
            this.animation.mixer.update(delta * this.speedAdjustment);
        };
    }

    dispose() {
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

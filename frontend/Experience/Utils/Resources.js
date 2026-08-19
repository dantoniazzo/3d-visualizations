import { EventEmitter } from "events";
import * as THREE from "three";

import Loaders from "./Loaders.js";

export default class Resources extends EventEmitter {
    constructor(assets) {
        super();

        this.items = {};
        this.assets = assets;
        this.loaders = new Loaders().loaders;

        this.startLoading();
    }

    startLoading() {
        this.loaded = 0;
        this.queue = this.assets.length;

        if (this.queue === 0) {
            // Nothing to fetch — still emit so the preloader can move on.
            queueMicrotask(() => this.emit("ready"));
            return;
        }

        for (const asset of this.assets) {
            if (asset.type === "glbModel") {
                this.loaders.gltfLoader.load(
                    asset.path,
                    (file) => this.singleAssetLoaded(asset, file),
                    undefined,
                    (error) => this.assetFailed(asset, error)
                );
            } else if (asset.type === "imageTexture") {
                this.loaders.textureLoader.load(
                    asset.path,
                    (file) => this.singleAssetLoaded(asset, file),
                    undefined,
                    (error) => this.assetFailed(asset, error)
                );
            } else if (asset.type === "cubeTexture") {
                this.loaders.cubeTextureLoader.load(
                    asset.path,
                    (file) => this.singleAssetLoaded(asset, file),
                    undefined,
                    (error) => this.assetFailed(asset, error)
                );
            } else if (asset.type === "videoTexture") {
                const video = document.createElement("video");
                video.src = asset.path;
                video.muted = true;
                video.playsInline = true;
                video.autoplay = true;
                video.loop = true;
                video.play();

                const texture = new THREE.VideoTexture(video);
                texture.flipY = false;
                texture.minFilter = THREE.NearestFilter;
                texture.magFilter = THREE.NearestFilter;
                texture.generateMipmaps = false;
                texture.colorSpace = THREE.SRGBColorSpace;

                this.singleAssetLoaded(asset, texture);
            }
        }
    }

    singleAssetLoaded(asset, file) {
        this.items[asset.name] = file;
        this.loaded++;
        this.emit("loading", this.loaded, this.queue);

        if (this.loaded === this.queue) {
            this.emit("ready");
        }
    }

    assetFailed(asset, error) {
        console.error(`Failed to load ${asset.path}`, error);
        // Count it anyway so a single missing file can't wedge the preloader.
        this.singleAssetLoaded(asset, null);
    }
}

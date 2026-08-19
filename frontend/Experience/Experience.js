import * as THREE from "three";

import Sizes from "./Utils/Sizes.js";
import Time from "./Utils/Time.js";
import Resources from "./Utils/Resources.js";
import assets from "./Utils/assets.js";

import Camera from "./Camera.js";
import Renderer from "./Renderer.js";
import Preloader from "./Preloader.js";

import World from "./World/World.js";

export default class Experience {
    static instance;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import("socket.io-client").Socket} socket  Presence namespace.
     * @param {object} sceneSpec  Validated scene spec to build the world from.
     */
    constructor(canvas, socket, sceneSpec) {
        if (Experience.instance) {
            return Experience.instance;
        }
        Experience.instance = this;

        this.canvas = canvas;
        this.socket = socket;
        this.sceneSpec = sceneSpec;

        this.sizes = new Sizes();
        this.time = new Time();

        this.setScene();
        this.setCamera();
        this.setRenderer();
        this.setResources();
        this.setPreloader();
        this.setWorld();

        this.sizes.on("resize", () => this.onResize());

        this.update();
    }

    setScene() {
        this.scene = new THREE.Scene();
    }

    setCamera() {
        this.camera = new Camera();
    }

    setRenderer() {
        this.renderer = new Renderer();
    }

    setResources() {
        // An imported scene's GLB is queued alongside the avatars so the
        // preloader's progress bar covers the whole download, not just the
        // characters. Procedural scenes add nothing here.
        // Model URLs are stored relative (`/models/x.glb`) so a spec never
        // carries a hostname. VITE_MODEL_BASE points them at a CDN in
        // deployments, where the GLBs are uploaded rather than committed.
        const base = (import.meta.env?.VITE_MODEL_BASE || "").replace(/\/+$/, "");
        const extra = [];
        // The car is only downloaded by scenes that place one.
        if (this.sceneSpec.vehicles?.length) {
            extra.push(
                { name: "carChassis", type: "glbModel", path: base + "/models/chassis-draco.glb" },
                { name: "carWheel", type: "glbModel", path: base + "/models/wheel-draco.glb" }
            );
        }

        const sceneAssets = this.sceneSpec.model
            ? [
                  {
                      name: "sceneModel",
                      type: "glbModel",
                      path: base + this.sceneSpec.model.url,
                  },
              ]
            : [];

        this.resources = new Resources([...assets, ...sceneAssets, ...extra]);
    }

    setPreloader() {
        this.preloader = new Preloader();
    }

    setWorld() {
        this.world = new World();
    }

    onResize() {
        this.camera.onResize();
        this.renderer.onResize();
    }

    update() {
        if (this.preloader) this.preloader.update();

        // World before camera: under pointer lock the camera places itself
        // from the player's position, so moving the player first keeps the
        // two in lockstep instead of a frame apart.
        if (this.world) this.world.update();
        if (this.camera) this.camera.update();
        if (this.renderer) this.renderer.update();
        if (this.time) this.time.update();

        window.requestAnimationFrame(() => this.update());
    }
}

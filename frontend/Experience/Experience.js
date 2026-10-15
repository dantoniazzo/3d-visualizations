import * as THREE from "three";

import Sizes from "./Utils/Sizes.js";
import Time from "./Utils/Time.js";
import Resources from "./Utils/Resources.js";
import { chromaURL, guardOptions, lightingMode, lightmapURL, roomLightmap, roomLightmapsLikely } from "./Utils/device.js";
import { hiddenScenery } from "./Utils/viewerChoices.js";
import assets from "./Utils/assets.js";

import Camera from "./Camera.js";
import Renderer from "./Renderer.js";
import Preloader from "./Preloader.js";
import FrameGuard from "./FrameGuard.js";
import Pace from "./Pace.js";

import World from "./World/World.js";
import CarModels from "./World/Vehicle/CarModels.js";
import { DEFAULT_CAR } from "../../shared/cars.js";

export default class Experience {
    static instance;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {import("socket.io-client").Socket} socket  Presence namespace.
     * @param {object} sceneSpec  Validated scene spec to build the world from.
     * @param {object} [options]
     * @param {boolean} [options.publicView]  a shared link: walk round and
     *        talk, nothing that edits or saves — and drawn as cheaply as it can be
     * @param {object} [options.published]  the published version it opens:
     *        `view` is the URL of its snapshot
     */
    constructor(canvas, socket, sceneSpec, { publicView = false, published = null } = {}) {
        if (Experience.instance) {
            return Experience.instance;
        }
        Experience.instance = this;

        this.canvas = canvas;
        this.socket = socket;
        this.sceneSpec = sceneSpec;
        this.publicView = publicView;
        this.published = published;
        // In a public view, the scenery its visitor has hidden (World/Scenery.js).
        this.hiddenScenery = publicView ? hiddenScenery() : new Set();

        this.sizes = new Sizes();
        this.time = new Time();
        // The editor draws a frame only when something may have changed (Pace.js); a public view, every frame.
        this.pace = publicView ? null : new Pace(this);

        this.setScene();
        this.setCamera();
        this.setRenderer();
        this.setResources();
        this.setPreloader();
        this.setWorld();
        this.setGuard();

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
        // The kit of parts generated buildings are dressed with — door
        // leaves, casings, window frames, balusters — from
        // blender/export_kit.py. Without it they are drawn in plain boxes.
        const extra = [{ name: "kit", type: "glbModel", path: base + "/models/kit.glb" }];
        // Cars are only loaded by scenes that place them — the ones they
        // place, with the index of all of them; any other is downloaded when
        // the editor picks it (World/Vehicle/CarModels.js) — and not while a
        // visitor has hidden the car.
        if (this.sceneSpec.vehicles?.length && !this.hiddenScenery.has("car")) {
            extra.push(...CarModels.assets(this.sceneSpec.vehicles.map((v) => v.model || DEFAULT_CAR), base));
        }

        // A published version with a runtime file builds none of the house,
        // so an imported model — drawn by the snapshot — is not needed.
        const runtime = this.published?.runtime;
        const sceneAssets = this.sceneSpec.model && !runtime
            ? [
                  {
                      name: "sceneModel",
                      type: "glbModel",
                      path: base + this.sceneSpec.model.url,
                  },
              ]
            : [];

        // A published public view draws its static scene from the snapshot,
        // lit — once baked — by its day lightmap to start with.
        if (this.published?.view) extra.push({ name: "publishedView", type: "glbModel", path: this.published.view });
        if (runtime) extra.push({ name: "publishedRuntime", type: "glbModel", path: runtime });
        const day = this.published?.lighting?.variants?.day;
        // (The one with each room's part held its own way, where the bake wrote one and the view will most likely
        // resolve the house's light: World.drawLighting takes whichever it then needs.)
        const rooms = day && roomLightmapsLikely(this.published.lighting) ? roomLightmap(day) : null;
        if (rooms) {
            extra.push({ name: "lightmap:day:rooms", type: "bakedTexture", path: lightmapURL(rooms) });
            extra.push({ name: "lightmap:day:rooms:chroma", type: "bakedTexture", path: chromaURL(rooms) });
        } else if (day) {
            extra.push({ name: "lightmap:day", type: "bakedTexture", path: lightmapURL(day) });
            if (chromaURL(day)) extra.push({ name: "lightmap:day:chroma", type: "bakedTexture", path: chromaURL(day) });
        }
        // Lit live, the house takes all but the sun's straight light from a
        // lightmap of its own; the grass still takes all of it from the other.
        if (day && lightingMode(this.published.lighting) === "live") {
            extra.push({ name: "lightmap:day:indirect", type: "bakedTexture", path: lightmapURL(day.indirect) });
            if (chromaURL(day.indirect)) {
                extra.push({ name: "lightmap:day:indirect:chroma", type: "bakedTexture", path: chromaURL(day.indirect) });
            }
        }

        this.resources = new Resources([...assets, ...sceneAssets, ...extra]);
        this.carModels = new CarModels(this.resources, base);
    }

    setPreloader() {
        this.preloader = new Preloader();
    }

    setWorld() {
        this.world = new World();
    }

    /**
     * A public view watches its own frame rate, and makes itself lighter
     * when it runs slowly (FrameGuard.js). Not the editor, whose plain light
     * has nothing to take; `?guard=off` in the link leaves it out.
     */
    setGuard() {
        const options = guardOptions();
        this.guard = this.publicView && !options.off ? new FrameGuard(this, options) : null;
        this.guard?.bind(this.world);
    }

    onResize() {
        this.camera.onResize();
        this.renderer.onResize();
    }

    /**
     * Something happened that the next frame should show. The editor draws
     * only then (Pace.js); in a public view, which draws every frame, this
     * does nothing. Free to call from anywhere, as often as anything likes.
     *
     * @param {string} [why]  for measuring
     * @param {number} [ms]  how long frames go on after it, if not a moment
     */
    wake(why, ms) {
        this.pace?.wake(why, ms);
    }

    /** A frame asked of the browser — one at a time, whoever asks, however often. */
    request() {
        if (this.queued) return;
        const asked = (this.queued = this.asked = (this.asked ?? 0) + 1);
        window.requestAnimationFrame((next) => {
            // (Not one that a frame drawn by hand has overtaken: update.)
            if (this.queued !== asked) return;
            this.update(next);
        });
    }

    /**
     * A frame: the world, the camera and the picture, and the next one asked
     * for. The browser's, each time it offers one — or called by hand (a
     * test in a tab the browser gives no frames): a frame already asked for
     * is then dropped for the one asked after this, so there is never more
     * than one loop.
     *
     * @param {number} [time]  when the frame began (requestAnimationFrame's)
     */
    update(time) {
        this.queued = 0;
        // The editor at rest: not this turn (Pace.js) — it asks for the next itself.
        const pace = this.pace;
        if (pace && !pace.begin(performance.now())) return;

        // How long the last frame took, judged (a public view's guard).
        if (this.guard) this.guard.frame(time ?? performance.now());
        if (this.preloader) this.preloader.update();

        // World before camera: under pointer lock the camera places itself
        // from the player's position, so moving the player first keeps the
        // two in lockstep instead of a frame apart.
        if (this.world) this.world.update();
        if (this.camera) this.camera.update();
        // Publishing borrows the renderer for a while (Publish/Snapshot.js).
        if (this.renderer && !this.suspended) this.renderer.update();
        if (this.time) this.time.update();

        // The next: at once in a public view; in the editor, when there is something to draw (Pace.end).
        if (pace) pace.end();
        else this.request();
    }
}

import * as THREE from "three";

import Experience from "../../Experience.js";
import { buildOctree } from "../Collision.js";
import { Trees } from "./trees.js";
import { buildHedges } from "./hedges.js";
import { bedGrasses, lawnSward, meadowSward, planterGrasses } from "./grass.js";
import { GardenLights } from "./lights.js";
import { shared } from "./shaders.js";
import { QUALITY } from "../../Utils/device.js";
import { distanceOutside, scatter, terrainHeight } from "../../../../shared/landscape.js";
import { lightPoolWater, updatePoolWater } from "../Builders/LandscapeBuilder.js";

const _visitor = new THREE.Vector3();

/**
 * A site's living landscape (shared/landscape.js), drawn live — the wind
 * moves it — in the walkthrough, the editor and the public view alike:
 *
 *   - its trees and shrubs: the garden's olives where the spec puts them,
 *     the woods and the scrub scattered over their regions (scatter),
 *     each a species grown with ez-tree, near whole, further light, far an
 *     impostor (trees.js);
 *   - its photinia hedges (hedges.js);
 *   - its lawns, meadows and the roof planters' grasses (grass.js);
 *   - its garden lights and the pool's glow at night (lights.js), the
 *     houses' own room lights on with them, and the water's ripple and the
 *     sun's caustics in it (Builders/LandscapeBuilder.js, updatePoolWater).
 *
 * Everything stands on the terrain (terrainHeight). The trunks near the
 * houses are walked into. It takes the place of the Fluffy Tree garden
 * (World/Vegetation) for a site with a landscape, and answers what the
 * world and the scenery ask of that: show, setLight, update, its trees.
 *
 * The editor, whose view may leave the surroundings out (World/Scope.js),
 * can have it made later (`planted: false`, then `plant`): until then only
 * where its trees stand is known, and their trunks walked into — the
 * species' models, the impostors' atlases, the hedges and every blade of
 * grass wait for the first time they are shown. Hidden (setShown), nothing
 * of it is drawn, sorted by distance or moved by the wind.
 */
export default class Flora {
    /**
     * @param {World} world
     * @param {object} [options]
     * @param {boolean} [options.planted]  made at once (the default), or when `plant` is first called
     */
    constructor(world, { planted = true } = {}) {
        this.world = world;
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;
        this.spec = world.spec.landscape;
        this.hills = null;
        this.group = new THREE.Group();
        this.group.name = "flora";
        this.scene.add(this.group);

        const terrain = this.spec.terrain || { base: 0 };
        this.height = (x, z) => terrainHeight(terrain, x, z);
        this.keepOut = this.makeKeepOut();

        // Where every tree and shrub stands, and the trunks to walk into:
        // these whether or not anything of the garden is drawn.
        this.trees = this.planTrees();
        this.bushes = [];
        this.buildTrunks();
        this.planted = false;
        this.variant = "day";
        if (planted) this.plant();
        else this.setLight("day");
    }

    /** The garden made — once, the first time it is to be drawn. */
    plant() {
        if (this.planted) return;
        this.planted = true;
        const world = this.world;
        const terrain = this.spec.terrain || { base: 0 };

        // --- trees and shrubs --------------------------------------------
        const loader = this.experience.resources.loaders.gltfLoader;
        this.treeSet = new Trees(this.group, this.trees, loader, this.experience.renderer.renderer);
        this.treeSet.ready.then(() => {
            if (this.disposed) return;
            this.treeSet.place(this.camera.activeCamera, true);
            // Planted late, in the editor, the species come after the time
            // of day was last set and after the rooms' glow went into the
            // shaders (World/RoomGlow.js): both again, for them.
            if (this.experience.publicView) return;
            this.treeSet.setLight(this.night && !world.plain ? 0.12 : 1);
            world.roomGlow?.applyTo(this.group);
        });

        // --- hedges ------------------------------------------------------
        const leafTexture = new THREE.TextureLoader().load("/textures/trees/leaves-aspen.webp");
        leafTexture.colorSpace = THREE.SRGBColorSpace;
        this.leafTexture = leafTexture;
        this.hedges = buildHedges(this.spec.hedges || [], leafTexture);
        this.group.add(this.hedges.group);

        // --- grass -------------------------------------------------------
        const lawns = (this.spec.lawns || []).map((lawn) => lawn.polygon);
        this.lawn = lawnSward(lawns, this.height, (x, z) => this.inHedge(x, z));
        this.meadow = meadowSward(
            (this.spec.meadow || []).map((m) => m.polygon),
            this.height,
            this.keepOut,
            { centre: terrain.detail?.centre ?? [0, 0], radius: 150 }
        );
        this.planters = planterGrasses(this.spec.planters || []);
        this.beds = bedGrasses(this.spec.grassBeds || [], this.height);
        this.group.add(this.lawn.group, this.meadow.group, this.planters.mesh, this.beds.mesh);
        this.bladeChunks = this.lawn.chunks;
        this.tuftChunks = this.meadow.chunks;

        // --- the evening -------------------------------------------------
        this.lights = new GardenLights(this.spec.lights || [], this.spec.pools || [], this.spec.planters || [], this.roofParapets());
        this.group.add(this.lights.group);
        world.plainLight?.keepOut(this.lights.group);
        this.setLight(this.variant);
    }

    /**
     * Drawn, or not (World/Scope.js): hidden, nothing of it is updated
     * either (update); shown again, its trees and grass are sorted afresh
     * for wherever the camera now is.
     */
    setShown(shown) {
        const was = this.group.visible;
        this.group.visible = shown;
        if (shown && !was && this.planted) this.applyQuality();
    }

    /**
     * Where nothing is scattered: on or near any room, wall or roof's
     * footprint (rooms grown two metres), the pools, the hedges.
     */
    makeKeepOut() {
        const spec = this.world.spec;
        const boxes = [];
        const grow = (points, by) => {
            const xs = points.map((p) => p[0]);
            const zs = points.map((p) => p[1]);
            return [Math.min(...xs) - by, Math.min(...zs) - by, Math.max(...xs) + by, Math.max(...zs) + by];
        };
        for (const room of spec.rooms || []) boxes.push(grow(room.polygon, 0.6));
        for (const wall of spec.walls || []) boxes.push(grow([wall.start, wall.end], 0.8));
        for (const pool of this.spec.pools || []) boxes.push(grow([pool.deck?.slice(0, 2) ?? pool.box.slice(0, 2), pool.deck?.slice(2) ?? pool.box.slice(2)], 0.3));
        for (const wall of this.spec.walls || []) boxes.push(grow(wall.path, 0.6));
        for (const lawn of this.spec.lawns || []) boxes.push(grow(lawn.polygon, 0.2));
        return (x, z) => boxes.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
    }

    /** Whether (x, z) is under a hedge, where no lawn grows. */
    inHedge(x, z) {
        return (this.spec.hedges || []).some((hedge) => {
            for (let i = 0; i < hedge.path.length - 1; i++) {
                const [a, b] = [hedge.path[i], hedge.path[i + 1]];
                const strip = [
                    [Math.min(a[0], b[0]) - hedge.width / 2, Math.min(a[1], b[1]) - hedge.width / 2],
                    [Math.max(a[0], b[0]) + hedge.width / 2, Math.min(a[1], b[1]) - hedge.width / 2],
                    [Math.max(a[0], b[0]) + hedge.width / 2, Math.max(a[1], b[1]) + hedge.width / 2],
                    [Math.min(a[0], b[0]) - hedge.width / 2, Math.max(a[1], b[1]) + hedge.width / 2],
                ];
                if (distanceOutside(strip, x, z) === 0) return true;
            }
            return false;
        });
    }

    /** Every tree and shrub: those placed, and those scattered over the woods and the scrub. */
    planTrees() {
        const out = [];
        for (const tree of this.spec.trees || []) {
            const [x, z] = tree.position;
            // `elevation`: standing above the ground — a shrub in a roof planter.
            const raised = Number.isFinite(tree.elevation);
            const y = raised ? tree.elevation : this.height(x, z) - 0.05;
            out.push({ species: tree.species, x, z, y, scale: tree.scale ?? 1, yaw: tree.yaw ?? 0, placed: true, raised });
        }
        const regions = [...(this.spec.forest || []).map((r) => ({ ...r, kind: "forest" })), ...(this.spec.shrubs || []).map((r) => ({ ...r, kind: "shrub" }))];
        regions.forEach((region, k) => {
            const scale = region.kind === "forest" ? region.scale ?? [0.8, 1.25] : region.scale ?? [0.7, 1.3];
            for (const tree of scatter({ ...region, scale }, 1000 + k * 37, this.keepOut)) {
                out.push({ ...tree, y: this.height(tree.x, tree.z) - 0.1 });
            }
        });
        return out;
    }

    /** The trunks of the trees near the houses, to walk into. */
    buildTrunks() {
        const trunks = new THREE.Group();
        for (const tree of this.trees) {
            if (Math.hypot(tree.x, tree.z) > 70 || tree.species.startsWith("bush")) continue;
            const radius = (tree.species.startsWith("olive") ? 0.16 : 0.22) * tree.scale;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 2.4, 8));
            trunk.position.set(tree.x, tree.y + 1.2, tree.z);
            trunks.add(trunk);
        }
        if (trunks.children.length) this.world.collision.setOutdoor(buildOctree([trunks]));
        for (const trunk of trunks.children) trunk.geometry.dispose();
    }

    /**
     * The roof terraces' parapets — low walls under a coping, a storey
     * or more up — each with the way its inner face looks: the side over
     * the rooms below it, where the terrace is.
     */
    roofParapets() {
        const spec = this.world.spec;
        const rooms = spec.rooms || [];
        const inside = (x, z, base) =>
            rooms.some((room) => room.elevation < base && room.elevation >= base - 3.6 && pointIn(x, z, room.polygon));
        const out = [];
        for (const wall of spec.walls || []) {
            if (!/^coping_(grey|dark)$/.test(wall.reveal) || !(wall.height <= 0.8) || !(wall.base_height >= 2.5)) continue;
            const [ax, az] = wall.start;
            const [bx, bz] = wall.end;
            const length = Math.hypot(bx - ax, bz - az);
            if (length < 0.4) continue;
            const nx = -(bz - az) / length;
            const nz = (bx - ax) / length;
            const mx = (ax + bx) / 2;
            const mz = (az + bz) / 2;
            const probe = wall.thickness / 2 + 0.5;
            const left = inside(mx + nx * probe, mz + nz * probe, wall.base_height);
            const right = inside(mx - nx * probe, mz - nz * probe, wall.base_height);
            if (left === right) continue;
            out.push({ start: wall.start, end: wall.end, base: wall.base_height, height: wall.height, thickness: wall.thickness, side: left ? 1 : -1 });
        }
        return out;
    }

    /** What a visitor has hidden (World/Scenery.js): the trees and bushes, the grass. */
    show({ trees = true, grass = true } = {}) {
        for (const tree of this.trees) tree.hidden = !trees && !tree.placed;
        if (!this.planted) return;
        this.treeSet.place(this.camera.activeCamera, true);
        this.lawn.group.visible = grass;
        this.meadow.group.visible = grass;
    }

    /**
     * What grows above a floor seen from above goes with what the view
     * takes away (World/BirdView.js): the roof terraces' planters — their
     * grasses, their shrubs, the light strips under their copings — which
     * otherwise hang in the air over the floor below. `shows` says whether
     * something growing at a height is on a floor that shows; `null`,
     * everything again. The ground's own — the lawns, the meadow, the
     * hedges, the trees, however high up a hill — is the lowest floor's,
     * under every one shown.
     *
     * @param {((y: number) => boolean)|null} shows
     */
    showUpTo(shows) {
        for (const tree of this.trees) tree.above = Boolean(shows) && Boolean(tree.raised) && !shows(tree.y);
        if (!this.planted) return;
        this.treeSet.place(this.camera.activeCamera, true);
        this.planters.showUpTo(shows);
        this.lights.showUpTo(shows);
    }

    /** The slider's step (Utils/device.js): the trees' and the grass's reach and density, and how many garden lights shine, at once. */
    applyQuality(quality = QUALITY) {
        if (!this.planted) return;
        this.lights.setBudget(quality.garden);
        const camera = this.camera.activeCamera;
        this.treeSet.place(camera, true);
        this.lawn.place(camera);
        this.meadow.place(camera);
    }

    settingsChanged() {}
    useGroundLight() {}

    /**
     * Day, or night: the garden lights, the houses' room lights, the far
     * trees' light. Under the editor's plain light (World/PlainLight.js) the
     * night shows only in the garden lights' own glass: they light nothing
     * (PlainLight keeps them out), and nothing dims or glows for it.
     */
    setLight(variant) {
        const night = variant === "night";
        this.variant = variant;
        this.night = night;
        this.lights?.set(night, this.visitor());
        // The rooms' own lights cast no shadows: lit, they would light the
        // walls' outsides too. The rooms glow instead (Sky.glowIndoors).
        const fixtures = this.world.sceneBuilder?.lights;
        if (fixtures) fixtures.visible = false;
        const dark = night && !this.world.plain;
        this.world.sky?.glowIndoors(dark);
        this.treeSet?.setLight(dark ? 0.12 : 1);
        lightPoolWater(this.world.sceneBuilder?.landscapeLive, dark);
    }

    /**
     * Where the visitor is, for the garden's lights to gather round: on
     * foot or in a car; from above, what the view is over; in the editor,
     * what its view looks at.
     */
    visitor() {
        const world = this.world;
        if (world.birdView?.active) return _visitor.copy(world.birdView.target);
        const editor = world.editor;
        if (editor?.active && editor.view?.target) return _visitor.copy(editor.view.target);
        const player = world.player;
        if (player?.inVehicle && player.currentCar) return _visitor.copy(player.currentCar.group.position);
        if (player?.player?.collider) return _visitor.copy(player.player.collider.start);
        return _visitor.copy(this.camera.activeCamera.position);
    }

    update(delta) {
        // The pool's ripple and its caustics, whatever else of the site is drawn.
        updatePoolWater(this.world.sceneBuilder?.landscapeLive, delta, { sun: this.world.environment?.sun, plain: this.world.plain });
        // Not made yet, or left out of the view (setShown): no wind, nothing sorted.
        if (!this.planted || !this.group.visible) return;
        shared.uTime.value += delta;
        const camera = this.camera.activeCamera;
        const sun = this.world.environment?.sun;
        if (sun) {
            shared.uSunView.value.copy(sun.position).sub(sun.target.position).normalize().transformDirection(camera.matrixWorldInverse);
            // (None of it under the editor's plain light, which has no sun.)
            shared.uSunColour.value.copy(sun.color).multiplyScalar(sun.visible && !this.world.plain ? sun.intensity * 0.35 : 0);
        }
        this.treeSet.place(camera);
        // The few garden lights there are, to the lamps nearest the visitor.
        this.lights.update(delta, this.visitor());
        this.placeTimer = (this.placeTimer ?? 0) - delta;
        if (this.placeTimer <= 0) {
            this.placeTimer = 0.25;
            this.lawn.place(camera);
            this.meadow.place(camera);
        }
    }

    dispose() {
        this.disposed = true;
        this.scene.remove(this.group);
        if (!this.planted) return;
        this.treeSet.dispose();
        this.hedges.dispose();
        this.lawn.dispose();
        this.meadow.dispose();
        this.planters.dispose();
        this.beds.dispose();
        this.lights.dispose();
        this.leafTexture.dispose();
    }
}

/** Whether (x, z) is inside a polygon of [x, z] points. */
function pointIn(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

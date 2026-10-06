import * as THREE from "three";

import Experience from "../../Experience.js";
import { buildOctree } from "../Collision.js";
import { Trees } from "./trees.js";
import { buildHedges } from "./hedges.js";
import { bedGrasses, lawnSward, meadowSward, planterGrasses } from "./grass.js";
import { GardenLights } from "./lights.js";
import { shared } from "./shaders.js";
import { distanceOutside, scatter, terrainHeight } from "../../../../shared/landscape.js";

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
 *     houses' own room lights on with them, and the water's ripple.
 *
 * Everything stands on the terrain (terrainHeight). The trunks near the
 * houses are walked into. It takes the place of the Fluffy Tree garden
 * (World/Vegetation) for a site with a landscape, and answers what the
 * world and the scenery ask of that: show, setLight, update, its trees.
 */
export default class Flora {
    constructor(world) {
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

        // --- trees and shrubs --------------------------------------------
        this.trees = this.planTrees();
        this.bushes = [];
        const loader = this.experience.resources.loaders.gltfLoader;
        this.treeSet = new Trees(this.group, this.trees, loader, this.experience.renderer.renderer);
        this.treeSet.ready.then(() => this.treeSet.place(this.camera.activeCamera, true));
        this.buildTrunks();

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
        this.setLight("day");
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
            const y = Number.isFinite(tree.elevation) ? tree.elevation : this.height(x, z) - 0.05;
            out.push({ species: tree.species, x, z, y, scale: tree.scale ?? 1, yaw: tree.yaw ?? 0, placed: true });
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
        this.treeSet.place(this.camera.activeCamera, true);
        this.lawn.group.visible = grass;
        this.meadow.group.visible = grass;
    }

    /** The slider's step (Utils/device.js): the trees' and the grass's reach and density, at once. */
    applyQuality() {
        const camera = this.camera.activeCamera;
        this.treeSet.place(camera, true);
        this.lawn.place(camera);
        this.meadow.place(camera);
    }

    settingsChanged() {}
    useGroundLight() {}

    /** Day, or night: the garden lights, the houses' room lights, the far trees' light. */
    setLight(variant) {
        const night = variant === "night";
        this.night = night;
        this.lights.set(night);
        // The rooms' own lights cast no shadows: lit, they would light the
        // walls' outsides too. The rooms glow instead (Sky.glowIndoors).
        const fixtures = this.world.sceneBuilder?.lights;
        if (fixtures) fixtures.visible = false;
        this.world.sky?.glowIndoors(night);
        this.treeSet.setLight(night ? 0.12 : 1);
        const water = this.world.sceneBuilder?.landscapeLive?.getObjectByName("pool-water");
        if (water) {
            water.material.emissive.set(night ? "#1fa9c4" : "#000000");
            water.material.emissiveIntensity = night ? 1.4 : 0;
        }
    }

    update(delta) {
        shared.uTime.value += delta;
        const camera = this.camera.activeCamera;
        const sun = this.world.environment?.sun;
        if (sun) {
            shared.uSunView.value.copy(sun.position).sub(sun.target.position).normalize().transformDirection(camera.matrixWorldInverse);
            shared.uSunColour.value.copy(sun.color).multiplyScalar(sun.visible ? sun.intensity * 0.35 : 0);
        }
        this.treeSet.place(camera);
        this.placeTimer = (this.placeTimer ?? 0) - delta;
        if (this.placeTimer <= 0) {
            this.placeTimer = 0.25;
            this.lawn.place(camera);
            this.meadow.place(camera);
        }
        const water = this.world.sceneBuilder?.landscapeLive?.getObjectByName("pool-water");
        if (water?.material.userData.time) water.material.userData.time.value += delta;
    }

    dispose() {
        this.treeSet.dispose();
        this.hedges.dispose();
        this.lawn.dispose();
        this.meadow.dispose();
        this.planters.dispose();
        this.beds.dispose();
        this.lights.dispose();
        this.leafTexture.dispose();
        this.scene.remove(this.group);
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

import * as THREE from "three";

import { FINISHES } from "../../../shared/catalog.js";
import { driveBounds } from "../../../shared/drive.js";
import { terrainHeight } from "../../../shared/landscape.js";
import { planStoreys } from "../../../shared/storeys.js";

/**
 * Where a visitor's camera can be, sampled densely enough that every
 * surface they could ever see is seen from at least one sample.
 *
 * The public-view snapshot renders what is visible from each of these and
 * throws away what never is, so the samples have to cover every way of
 * looking round the house:
 *
 *   - walking: every room at three heights — low, at the eye, and up where
 *     the third-person camera rides — under its ceiling; along each flight
 *     of stairs; and outside, on a coarser grid — gardens and drives are
 *     big, and what can be seen from them is the outside of the house —
 *     up to where the car's chase camera sits, above the ground there: a
 *     garden or drive at its own level — at each one's where two overlap,
 *     a parking slot under a terrace — a site's terrain at its height
 *     (shared/landscape.js), the street a metre below the garden included;
 *     and on a roof terrace, over the rooms under it.
 *   - the bird's-eye view of each floor: an orbit around targets across
 *     the floor, at the distances and angles that view allows (BIRD_VIEW),
 *     with everything above the floor taken away; and of the ground floor
 *     from wherever past it a car can take that view (driveViewpoints).
 *
 * A sample inside a wall or a sofa would see the insides of things nobody
 * else can, so each walking sample is tested against the collision tree
 * first.
 */

/** What the bird's-eye view of a floor lets the camera do. */
export const BIRD_VIEW = {
    fov: 55,
    distances: [7, 13, 22],
    minDistance: 6,
    maxDistance: 24,
    /** Degrees above the horizontal. */
    pitches: [35, 55, 75, 88],
    minPitch: 30,
    azimuths: 8,
};

/**
 * The rings of targets round the ground floor a car can take the bird's-eye
 * view out to: the first this far out from its box — half the furthest the
 * camera stands from its target — and spaced along it twice as far; each
 * ring then twice as far out as the last, and twice as sparse.
 */
const DRIVE_RING = BIRD_VIEW.maxDistance / 2;

const ROOM_SPACING = 0.7;
const WALL_CLEARANCE = 0.25;
const OUTSIDE_SPACING = 3;
const OUTSIDE_MARGIN = 8;
const EYE_HEIGHTS = [0.9, 1.6, 2.3];
const OUTSIDE_HEIGHTS = [1.6, 3.2];
const PROBE_RADIUS = 0.12;

const _sphere = new THREE.Sphere();

function insidePolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

function distanceToEdges(x, z, polygon) {
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, az] = polygon[j];
        const [bx, bz] = polygon[i];
        const dx = bx - ax;
        const dz = bz - az;
        const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
}

function bounds(polygons) {
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const polygon of polygons) {
        for (const [x, z] of polygon) {
            box.minX = Math.min(box.minX, x);
            box.maxX = Math.max(box.maxX, x);
            box.minZ = Math.min(box.minZ, z);
            box.maxZ = Math.max(box.maxZ, z);
        }
    }
    return box;
}

const outdoor = (room) => FINISHES[room.floor_finish]?.kind === "ground";

/** Grid points inside a polygon, clear of its edges; its middle if none fit. */
function gridIn(polygon, spacing, clearance, jitter) {
    const box = bounds([polygon]);
    const points = [];
    for (let x = box.minX + spacing / 2; x < box.maxX; x += spacing) {
        for (let z = box.minZ + spacing / 2; z < box.maxZ; z += spacing) {
            const px = x + (jitter ? (jitter() - 0.5) * spacing : 0);
            const pz = z + (jitter ? (jitter() - 0.5) * spacing : 0);
            if (insidePolygon(px, pz, polygon) && distanceToEdges(px, pz, polygon) >= clearance) points.push([px, pz]);
        }
    }
    if (!points.length) {
        const cx = (box.minX + box.maxX) / 2;
        const cz = (box.minZ + box.maxZ) / 2;
        if (insidePolygon(cx, cz, polygon)) points.push([cx, cz]);
    }
    return points;
}

/**
 * Walking samples, as world positions.
 *
 * @param {object} spec  the scene spec
 * @param {object} collision  the world's Collision, to reject samples inside things
 * @param {object} [options]
 * @param {() => number} [options.jitter]  random source for a validation set
 * @param {number} [options.density]  1 for the full set; lower thins it out
 * @returns {THREE.Vector3[]}
 */
export function walkViewpoints(spec, collision, { jitter = null, density = 1 } = {}) {
    const points = [];
    const spacing = ROOM_SPACING / Math.sqrt(density);

    for (const room of spec.rooms) {
        // Gardens, drives and roads are covered by the outside grid below.
        if (outdoor(room)) continue;
        const heights = EYE_HEIGHTS.filter((h) => h < room.height - 0.12);
        if (!heights.length) heights.push(Math.max(0.3, room.height / 2));
        for (const [x, z] of gridIn(room.polygon, spacing, WALL_CLEARANCE, jitter)) {
            for (const h of heights) {
                points.push(new THREE.Vector3(x, room.elevation + h + (jitter ? (jitter() - 0.5) * 0.3 : 0), z));
            }
        }
    }

    // Up and down every flight, at the eye and where the camera rides.
    for (const stair of spec.stairs || []) {
        const rise = stair.top_height - stair.base_height;
        const yaw = THREE.MathUtils.degToRad(stair.yaw ?? 0);
        const steps = Math.max(3, Math.round(stair.run / (0.5 / Math.sqrt(density))));
        for (let i = 0; i <= steps; i++) {
            const t = (i + (jitter ? jitter() : 0.5)) / (steps + 1);
            const local = new THREE.Vector3(0, 0, t * stair.run).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
            for (const h of [1.6, 2.3]) {
                points.push(new THREE.Vector3(stair.start[0] + local.x, stair.base_height + t * rise + h, stair.start[1] + local.z));
            }
        }
    }

    // Round the outside, wherever there is ground to stand or drive on.
    const indoor = spec.rooms.filter((room) => !outdoor(room));
    const ground = groundHeights(spec);
    const box = bounds(spec.rooms.map((room) => room.polygon));
    const outsideSpacing = OUTSIDE_SPACING / Math.sqrt(density);
    for (let x = box.minX - OUTSIDE_MARGIN; x <= box.maxX + OUTSIDE_MARGIN; x += outsideSpacing) {
        for (let z = box.minZ - OUTSIDE_MARGIN; z <= box.maxZ + OUTSIDE_MARGIN; z += outsideSpacing) {
            const px = x + (jitter ? (jitter() - 0.5) * outsideSpacing : 0);
            const pz = z + (jitter ? (jitter() - 0.5) * outsideSpacing : 0);
            // Not in a room of a house — but over one, on its roof terrace, yes.
            const under = indoor.filter((room) => insidePolygon(px, pz, room.polygon));
            for (const y of ground(px, pz)) {
                for (const h of OUTSIDE_HEIGHTS) {
                    const at = y + h;
                    if (under.some((room) => at > room.elevation - 0.05 && at < room.elevation + (room.height ?? 3) + 0.05)) continue;
                    points.push(new THREE.Vector3(px, at, pz));
                }
            }
        }
    }

    return points.filter((point) => clear(point, collision));
}

/** Headroom over the ground for a visitor to stand under an outdoor floor above it. */
const STAND_UNDER = 2.4;

/**
 * The heights a visitor outside stands at, lowest first: on a garden,
 * drive or road — an outdoor room — its level, and every one's where they
 * overlap (Ladonia's parking slot under the roof terrace above it); the
 * ground under them too — a site's own terrain's height, or the plot's, 0
 * — where there is room to stand under the lowest; elsewhere the ground.
 */
function groundHeights(spec) {
    const yards = spec.rooms.filter(outdoor);
    const terrain = spec.landscape?.terrain ?? null;
    return (x, z) => {
        const base = terrain ? terrainHeight(terrain, x, z) : 0;
        const levels = [];
        for (const room of yards) {
            const y = room.elevation ?? 0;
            if (insidePolygon(x, z, room.polygon) && !levels.some((level) => Math.abs(level - y) < 0.05)) levels.push(y);
        }
        if (!levels.length || Math.min(...levels) - base >= STAND_UNDER) levels.push(base);
        return levels.sort((a, b) => a - b);
    };
}

/** Whether a sample sits in open air rather than inside something solid. */
function clear(point, collision) {
    _sphere.set(point, PROBE_RADIUS);
    for (const tree of [collision.static, collision.dynamic]) {
        if (tree?.subTrees?.length || tree?.triangles?.length) {
            if (tree.sphereIntersect(_sphere)) return false;
        }
    }
    return true;
}

/**
 * Bird's-eye samples for every floor: an orbit around a grid of targets
 * across the floor's footprint.
 *
 * @param {object} spec
 * @param {number[]} levels  floor heights, lowest first
 * @param {object} [options]
 * @param {() => number} [options.jitter]  random source for a validation set
 * @returns {{ level: number, position: THREE.Vector3, target: THREE.Vector3, ceilingFrom?: number }[]}
 *          `ceilingFrom`: the lowest level whose ceilings are taken away too (a storey's), where not `level`'s alone
 */
export function birdViewpoints(spec, levels, { jitter = null } = {}) {
    const views = [];
    levels.forEach((elevation, level) => {
        const rooms = spec.rooms.filter((room) => Math.abs(room.elevation - elevation) < 0.3);
        if (!rooms.length) return;
        const box = bounds(rooms.map((room) => room.polygon));
        const targets = [];
        for (const [fx, fz] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
            targets.push(
                new THREE.Vector3(
                    box.minX + (box.maxX - box.minX) * (jitter ? jitter() : fx),
                    elevation + 1,
                    box.minZ + (box.maxZ - box.minZ) * (jitter ? jitter() : fz)
                )
            );
        }
        for (const target of targets) {
            for (const distance of BIRD_VIEW.distances) {
                for (const pitch of BIRD_VIEW.pitches) {
                    for (let a = 0; a < BIRD_VIEW.azimuths; a++) {
                        const d = jitter ? THREE.MathUtils.lerp(BIRD_VIEW.minDistance, BIRD_VIEW.maxDistance, jitter()) : distance;
                        const p = THREE.MathUtils.degToRad(jitter ? THREE.MathUtils.lerp(BIRD_VIEW.minPitch, 89, jitter()) : pitch);
                        const az = ((a + (jitter ? jitter() : 0)) / BIRD_VIEW.azimuths) * Math.PI * 2;
                        const position = new THREE.Vector3(
                            Math.cos(p) * Math.sin(az),
                            Math.sin(p),
                            Math.cos(p) * Math.cos(az)
                        )
                            .multiplyScalar(d)
                            .add(target);
                        views.push({ level, position, target });
                    }
                }
            }
        }
    });
    views.push(...driveViewpoints(spec, levels, jitter));
    return views;
}

/**
 * Bird's-eye samples of the ground floor from where a car takes the view
 * past its rooms (World/BirdView.js follows a car driven from above over
 * its ground, to the ground's edge: shared/drive.js), which no floor's own
 * samples look from. The targets stand on rings round the ground floor's
 * box, DRIVE_RING out and then each twice as far out and twice as sparse,
 * as far as the ground goes, at the ground's height; each is orbited as a
 * floor's targets are, but only the views with the houses in frame are
 * kept — nothing else out there is ever thrown away (the terrain, the
 * landscape and the neighbourhood are kept whole: Snapshot.js), and a
 * frame of nothing but grass would cost its render for nothing. Drawn as
 * the view shows the ground floor: every level of it, none of its ceilings.
 *
 * None where a car has no ground past the rooms.
 */
function driveViewpoints(spec, levels, jitter) {
    const ground = driveBounds(spec);
    if (!ground || !spec.rooms?.length) return [];
    const storey = planStoreys(spec.rooms, levels).list[0];
    if (!storey?.rooms.length) return [];
    const floor = bounds(storey.rooms.map((room) => room.polygon));
    const terrain = spec.landscape?.terrain ?? null;
    const heightAt = (x, z) => (terrain ? terrainHeight(terrain, x, z) : storey.elevation);

    // What is in frame is tested against the houses — every floor's rooms indoors, the height of them all — and
    // the ground round them a visitor walks (OUTSIDE_MARGIN): what of it is not kept whole, the furniture on the
    // terraces, the fence round the plot. (A garden, a drive or a road is a slab whose top every sample sees.)
    const houses = spec.rooms.filter((room) => !outdoor(room));
    const all = bounds((houses.length ? houses : spec.rooms).map((room) => room.polygon));
    const low = Math.min(...spec.rooms.map((room) => room.elevation ?? 0));
    const high = Math.max(...spec.rooms.map((room) => (room.elevation ?? 0) + (room.height ?? 3)));
    const rooms = new THREE.Box3(
        new THREE.Vector3(all.minX - OUTSIDE_MARGIN, low, all.minZ - OUTSIDE_MARGIN),
        new THREE.Vector3(all.maxX + OUTSIDE_MARGIN, high, all.maxZ + OUTSIDE_MARGIN)
    );
    // As Snapshot.js's IdPass draws it: a little wider than the view.
    const camera = new THREE.PerspectiveCamera(BIRD_VIEW.fov + 8, 4 / 3, 0.1, 400);
    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4();
    const inFrame = (position, target) => {
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        return frustum.setFromProjectionMatrix(matrix).intersectsBox(rooms);
    };

    const level = storey.levels[storey.levels.length - 1];
    const ceilingFrom = storey.levels[0];
    const views = [];
    for (let ring = 0; ; ring++) {
        const out = DRIVE_RING * (2 ** (ring + 1) - 1);
        const spacing = DRIVE_RING * 2 ** (ring + 1);
        const minX = floor.minX - out;
        const maxX = floor.maxX + out;
        const minZ = floor.minZ - out;
        const maxZ = floor.maxZ + out;
        // Past the ground on every side: no ring further out has any of it.
        if (minX <= ground.minX && maxX >= ground.maxX && minZ <= ground.minZ && maxZ >= ground.maxZ) break;
        const w = maxX - minX;
        const d = maxZ - minZ;
        const perimeter = 2 * (w + d);
        const count = Math.ceil(perimeter / spacing);
        for (let i = 0; i < count; i++) {
            // Round the ring from its corner, evenly.
            let s = ((i + (jitter ? jitter() : 0.5)) / count) * perimeter;
            let x;
            let z;
            if (s < w) [x, z] = [minX + s, minZ];
            else if ((s -= w) < d) [x, z] = [maxX, minZ + s];
            else if ((s -= d) < w) [x, z] = [maxX - s, maxZ];
            else [x, z] = [minX, maxZ - (s - w)];
            if (x < ground.minX || x > ground.maxX || z < ground.minZ || z > ground.maxZ) continue;
            const target = new THREE.Vector3(x, heightAt(x, z) + 1, z);
            for (const distance of BIRD_VIEW.distances) {
                for (const pitch of BIRD_VIEW.pitches) {
                    for (let a = 0; a < BIRD_VIEW.azimuths; a++) {
                        const dd = jitter ? THREE.MathUtils.lerp(BIRD_VIEW.minDistance, BIRD_VIEW.maxDistance, jitter()) : distance;
                        const p = THREE.MathUtils.degToRad(jitter ? THREE.MathUtils.lerp(BIRD_VIEW.minPitch, 89, jitter()) : pitch);
                        const az = ((a + (jitter ? jitter() : 0)) / BIRD_VIEW.azimuths) * Math.PI * 2;
                        const position = new THREE.Vector3(Math.cos(p) * Math.sin(az), Math.sin(p), Math.cos(p) * Math.cos(az)).multiplyScalar(dd).add(target);
                        if (inFrame(position, target)) views.push({ level, ceilingFrom, position, target });
                    }
                }
            }
        }
    }
    return views;
}

/** A small, repeatable random source, so a publish can be reproduced. */
export function seeded(seed = 1) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

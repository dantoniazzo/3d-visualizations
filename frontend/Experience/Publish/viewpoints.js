import * as THREE from "three";

import { FINISHES } from "../../../shared/catalog.js";

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
 *     up to where the car's chase camera sits.
 *   - the bird's-eye view of each floor: an orbit around targets across
 *     the floor, at the distances and angles that view allows (BIRD_VIEW),
 *     with everything above the floor taken away.
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
    const box = bounds(spec.rooms.map((room) => room.polygon));
    const outsideSpacing = OUTSIDE_SPACING / Math.sqrt(density);
    for (let x = box.minX - OUTSIDE_MARGIN; x <= box.maxX + OUTSIDE_MARGIN; x += outsideSpacing) {
        for (let z = box.minZ - OUTSIDE_MARGIN; z <= box.maxZ + OUTSIDE_MARGIN; z += outsideSpacing) {
            const px = x + (jitter ? (jitter() - 0.5) * outsideSpacing : 0);
            const pz = z + (jitter ? (jitter() - 0.5) * outsideSpacing : 0);
            if (indoor.some((room) => insidePolygon(px, pz, room.polygon))) continue;
            for (const h of OUTSIDE_HEIGHTS) points.push(new THREE.Vector3(px, h, pz));
        }
    }

    return points.filter((point) => clear(point, collision));
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
 * @returns {{ level: number, position: THREE.Vector3, target: THREE.Vector3 }[]}
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

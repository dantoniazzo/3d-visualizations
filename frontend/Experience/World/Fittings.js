import * as THREE from "three";

import { FINISHES } from "../../../shared/catalog.js";
import { pointInPolygon } from "../Utils/geometry.js";

/**
 * A space's light fittings, and the switches they are on, as a house is
 * wired: a ceiling light in every indoor room, on a switch on the wall by
 * the room's door; and every lamp — a piece of furniture whose model marks
 * its bulb (blender/lib/furnish.py, _lamp) — on a switch of its own.
 *
 * Where each ceiling light hangs and each wall switch goes is worked out
 * here from the spec (ceilingFitting, wallSwitch), the same for the scene
 * that draws them (SceneBuilder.buildFittings) as for the list gathered
 * when a space is published (Publish/Snapshot.js) into the published
 * spec's `lights`: the bake lights them switch by switch, and the public
 * view lets a visitor turn each switch on and off — from a list, by
 * pointing at the light or its switch, or by clicking it from above.
 */

/** A ceiling light's watts (as the bake has them) a square metre of floor. */
const CEILING_WATTS = 9;
/** ...never less than this. */
const CEILING_MIN_WATTS = 40;
/** A warm bulb. */
const CEILING_COLOR = "#ffd6a3";

/**
 * The two kinds of ceiling light: an opal globe on a cord, and an opal
 * dome flat to the ceiling for a small room, a low one, or a wet one.
 * `drop` is how far below the ceiling the light is, at the middle of the
 * glass; `radius`, the glass's, which the bake keeps out of the light's
 * way and the public view lights up; `size`, the light's own, as baked.
 */
export const CEILING_STYLES = {
    pendant: { drop: 0.42, radius: 0.13, size: 0.08, canopy: 0.06, cord: 0.004 },
    flush: { drop: 0.045, radius: 0.17, size: 0.03, depth: 0.09 },
};
/** The glass of every ceiling light. */
export const GLASS = "opal_glass";
/** Rooms smaller than this, or lower, get a flush light. */
const PENDANT_MIN_AREA = 10;
const PENDANT_MIN_HEIGHT = 2.5;

/** A light switch's plate, square, and how far it stands off the wall. */
export const SWITCH_PLATE = { size: 0.086, depth: 0.009, rocker: [0.028, 0.05, 0.006] };
/** Its middle's height over the floor. */
const SWITCH_HEIGHT = 1.1;
/** How far from the side of a doorway its middle is. */
const SWITCH_BESIDE = 0.16;
/** How near a wall's end, or another opening, a switch may come. */
const SWITCH_CLEAR = 0.16;
/** How far past a flight's top step a room's switch is looked for... */
const STAIR_BEYOND = 0.45;
/** ...on a wall no further from there than this. */
const STAIR_REACH = 2.0;

/**
 * @param {SceneBuilder} builder  a built scene, furniture placed
 * @returns {object[]} `{ id, switch, kind, room, label, position, power,
 *          color, glow, radius, size, targets }`: `glow` is the material
 *          of its glass or bulb, `radius` that's size and `size` the
 *          light's own, as baked; `targets`, boxes round the light and its
 *          wall switch — `{ part: "light" | "switch", box: [x0, y0, z0,
 *          x1, y1, z1] }` — for a visitor to point at
 */
export function gatherLights(builder) {
    const spec = builder.spec;
    const rooms = new Map(spec.rooms.map((room) => [room.id, room]));
    const lights = [];

    const roomAt = (x, y, z) => builder.roomAt(x, y, z);
    for (const room of spec.rooms) {
        const fitting = ceilingFitting(room);
        if (!fitting) continue;
        const style = CEILING_STYLES[fitting.style];
        const [x, y, z] = fitting.position;
        // Where a visitor can point at it: the glass, and the cord up to the ceiling.
        const targets = [{ part: "light", box: [x - style.radius, y - style.radius, z - style.radius, x + style.radius, fitting.ceiling, z + style.radius] }];
        const plate = wallSwitch(room, spec, roomAt);
        if (plate) targets.push({ part: "switch", box: plateBox(plate) });
        lights.push({
            id: `ceiling:${room.id}`,
            switch: `ceiling:${room.id}`,
            kind: "ceiling",
            style: fitting.style,
            room: room.id,
            label: `${room.name || room.id} light`,
            position: fitting.position.map(round),
            power: round(Math.max(CEILING_MIN_WATTS, polygonArea(room.polygon) * CEILING_WATTS)),
            color: CEILING_COLOR,
            glow: GLASS,
            radius: style.radius,
            size: style.size,
            ...(plate && { wallSwitch: { position: plate.position.map(round), yaw: round(plate.yaw) } }),
            targets: targets.map(({ part, box }) => ({ part, box: box.map(round) })),
        });
    }

    const lamps = [];
    const bulb = new THREE.Vector3();
    for (const { placement, group } of builder.furniture.values()) {
        group.updateMatrixWorld(true);
        group.traverse((node) => {
            const light = node.userData?.light;
            if (!light?.at) return;
            // Blender's (x, y, z), in the node's own coordinates, is glTF's (x, z, -y).
            const [x, y, z] = light.at;
            bulb.set(x, z, -y).applyMatrix4(node.matrixWorld);
            const room = builder.roomAt(bulb.x, bulb.y, bulb.z);
            // Where a visitor can point at it: the whole lamp, a little over.
            const box = new THREE.Box3().setFromObject(group).expandByScalar(0.03);
            lamps.push({
                id: `lamp:${placement.id}`,
                switch: `lamp:${placement.id}`,
                kind: "lamp",
                room: room?.id ?? null,
                fixture: placement.id,
                position: bulb.toArray().map(round),
                power: light.power ?? 30,
                color: light.color ?? "#ffcf99",
                // Its bulb, which the bake keeps out of the light's way.
                glow: light.glow ?? "linen_white",
                radius: light.radius ?? 0.022,
                size: 0.02,
                targets: [{ part: "light", box: [...box.min.toArray(), ...box.max.toArray()].map(round) }],
            });
        });
    }
    // "Bedroom lamp", or "Bedroom lamp 1" and "2" where a room has more.
    const counts = new Map();
    for (const lamp of lamps) counts.set(lamp.room, (counts.get(lamp.room) ?? 0) + 1);
    const seen = new Map();
    for (const lamp of lamps) {
        const n = (seen.get(lamp.room) ?? 0) + 1;
        seen.set(lamp.room, n);
        const name = rooms.get(lamp.room)?.name ?? "Room";
        lamp.label = counts.get(lamp.room) > 1 ? `${name} lamp ${n}` : `${name} lamp`;
        lights.push(lamp);
    }
    return lights;
}

/**
 * A room's ceiling light — which kind, where its light is, and the height
 * of the ceiling it hangs from — or null for a room out of doors.
 */
export function ceilingFitting(room) {
    if (FINISHES[room.floor_finish]?.kind === "ground") return null;
    const area = polygonArea(room.polygon);
    const finish = FINISHES[room.floor_finish];
    // Tiled bathrooms, and a garage's concrete, have a light that keeps out the damp.
    const wet = /^ceramic/.test(room.floor_finish) || finish?.generator === "concrete";
    const style = area < PENDANT_MIN_AREA || room.height < PENDANT_MIN_HEIGHT || wet ? "flush" : "pendant";
    const [x, z] = insidePoint(room.polygon);
    const ceiling = room.elevation + room.height;
    return { room: room.id, style, ceiling, position: [x, ceiling - CEILING_STYLES[style].drop, z] };
}

/**
 * Where a room's light switch goes: where you come in, at the height of a
 * hand. A room a flight of stairs comes up into — a landing, a loft — is
 * come into up the stairs: its switch is on the wall nearest the top step.
 * Any other is come into by a door, and its switch is beside the door, on
 * the side it opens from, not behind it. The door you come in by is the
 * one from wherever has the most doors of its own (the hall or the
 * landing); for the hall itself, which is that, the front door. Null for
 * a room with nowhere to put one.
 *
 * @param {object} room
 * @param {object} spec
 * @param {(x, y, z) => object|null} roomAt  which room a point is in
 * @returns {{ position: number[], yaw: number, wall: string }|null}
 */
export function wallSwitch(room, spec, roomAt) {
    for (const stair of spec.stairs || []) {
        const yaw = THREE.MathUtils.degToRad(stair.yaw ?? 0);
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        // A step onto the floor past the top of the flight.
        const x = stair.start[0] + fx * (stair.run + STAIR_BEYOND);
        const z = stair.start[1] + fz * (stair.run + STAIR_BEYOND);
        if (roomAt(x, stair.top_height + 1.0, z)?.id !== room.id) continue;
        const plate = nearestWall(room, spec, roomAt, x, z);
        if (plate) return plate;
    }

    const doorways = [];
    const counts = new Map();
    for (const wall of spec.walls || []) {
        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (length < 1e-6) continue;
        const dx = (x2 - x1) / length;
        const dz = (z2 - z1) / length;
        const reach = wall.thickness / 2 + 0.3;
        for (const opening of wall.openings || []) {
            if (opening.type !== "door" && opening.type !== "doorway") continue;
            const x = x1 + dx * opening.offset;
            const z = z1 + dz * opening.offset;
            const y = wall.base_height + 1.0;
            // The wall's two faces: its +Z, as StructureBuilder turns it, and its -Z.
            const plus = roomAt(x - dz * reach, y, z + dx * reach);
            const minus = roomAt(x + dz * reach, y, z - dx * reach);
            for (const side of [plus, minus]) if (side) counts.set(side.id, (counts.get(side.id) ?? 0) + 1);
            if (plus?.id === room.id) doorways.push({ wall, opening, face: 1, other: minus, length, dx, dz });
            else if (minus?.id === room.id) doorways.push({ wall, opening, face: -1, other: plus, length, dx, dz });
        }
    }
    if (!doorways.length) return null;
    const outdoors = (other) => !other || FINISHES[other.floor_finish]?.kind === "ground";
    const hub = (counts.get(room.id) ?? 0) >= 3;
    const score = ({ other }) => (outdoors(other) ? (hub ? 100 : -1) : counts.get(other.id) ?? 0);
    doorways.sort((a, b) => score(b) - score(a));

    for (const { wall, opening, face, length } of doorways) {
        // A hinged door's hinges are at its `swing`'s end; the switch goes at the other.
        const hinge = opening.type === "door" && opening.door?.type !== "double" ? (opening.door?.swing?.endsWith("left") ? -1 : 1) : 0;
        const sides = hinge ? [-hinge, hinge] : [1, -1];
        for (const side of sides) {
            const along = opening.offset + side * (opening.width / 2 + SWITCH_BESIDE);
            if (clearOnWall(wall, along, length, room.elevation + SWITCH_HEIGHT)) return onWall(wall, along, face, room);
        }
    }
    return null;
}

/**
 * A switch on the wall of `room` nearest a point in it — as near the point
 * as the wall has space for — or null.
 */
function nearestWall(room, spec, roomAt, x, z) {
    const faces = [];
    for (const wall of spec.walls || []) {
        if (Math.abs(wall.base_height - room.elevation) > 0.3) continue;
        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (length < 1e-6) continue;
        const dx = (x2 - x1) / length;
        const dz = (z2 - z1) / length;
        const t = THREE.MathUtils.clamp((x - x1) * dx + (z - z1) * dz, 0, length);
        // Which face the point is in front of: its +Z, along (-dz, dx), or its -Z.
        const face = Math.sign(-dz * (x - x1) + dx * (z - z1)) || 1;
        const distance = Math.hypot(x1 + dx * t - x, z1 + dz * t - z);
        faces.push({ wall, length, dx, dz, t, face, distance });
    }
    faces.sort((a, b) => a.distance - b.distance);
    for (const { wall, length, dx, dz, t, face, distance } of faces) {
        if (distance > STAIR_REACH) break;
        // The point's own room, on that face.
        const reach = wall.thickness / 2 + 0.3;
        const [x1, z1] = wall.start;
        const px = x1 + dx * t - dz * reach * face;
        const pz = z1 + dz * t + dx * reach * face;
        if (roomAt(px, room.elevation + 1.0, pz)?.id !== room.id) continue;
        for (const shift of [0, 0.25, -0.25, 0.5, -0.5]) {
            if (clearOnWall(wall, t + shift, length, room.elevation + SWITCH_HEIGHT)) return onWall(wall, t + shift, face, room);
        }
    }
    return null;
}

/** A switch `along` a wall from its start, on its `face` (+1 its +Z, -1 its -Z), in `room`. */
function onWall(wall, along, face, room) {
    const [x1, z1] = wall.start;
    const [x2, z2] = wall.end;
    const length = Math.hypot(x2 - x1, z2 - z1);
    const dx = (x2 - x1) / length;
    const dz = (z2 - z1) / length;
    const out = wall.thickness / 2 + SWITCH_PLATE.depth / 2;
    // The wall's +Z face looks along (-dz, dx), as StructureBuilder turns it.
    const position = [x1 + dx * along - dz * out * face, room.elevation + SWITCH_HEIGHT, z1 + dz * along + dx * out * face];
    const yaw = Math.atan2(dx, dz) - Math.PI / 2 + (face > 0 ? 0 : Math.PI);
    return { position, yaw, wall: wall.id };
}

/** Whether a switch fits on a wall at `along`, clear of its ends and its other openings. */
function clearOnWall(wall, along, length, height) {
    const half = SWITCH_PLATE.size / 2;
    if (along - half < SWITCH_CLEAR || along + half > length - SWITCH_CLEAR) return false;
    const bottom = height - half;
    const top = bottom + SWITCH_PLATE.size;
    for (const opening of wall.openings || []) {
        const start = opening.offset - opening.width / 2 - SWITCH_CLEAR / 2;
        const end = opening.offset + opening.width / 2 + SWITCH_CLEAR / 2;
        if (along + half <= start || along - half >= end) continue;
        const sill = wall.base_height + (opening.sill ?? 0);
        if (top <= sill || bottom >= sill + (opening.height ?? wall.height)) continue;
        return false;
    }
    return true;
}

/** A switch plate's box, for pointing at: the plate, and a hand's depth in front of it. */
function plateBox({ position: [x, y, z], yaw }) {
    const half = SWITCH_PLATE.size / 2 + 0.02;
    // Its face looks along (sin yaw, cos yaw).
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const ax = Math.abs(nz) * half + Math.abs(nx) * 0.05;
    const az = Math.abs(nx) * half + Math.abs(nz) * 0.05;
    return [x - ax + nx * 0.03, y - half, z - az + nz * 0.03, x + ax + nx * 0.03, y + half, z + az + nz * 0.03];
}

/**
 * A room's middle, for its ceiling light: the centre of its outline, or —
 * for an L-shaped room whose centre falls outside it — the point inside it
 * nearest that centre.
 */
function insidePoint(polygon) {
    const n = polygon.length;
    const cx = polygon.reduce((s, [x]) => s + x, 0) / n;
    const cz = polygon.reduce((s, [, z]) => s + z, 0) / n;
    if (pointInPolygon(cx, cz, polygon)) return [cx, cz];
    const xs = polygon.map(([x]) => x);
    const zs = polygon.map(([, z]) => z);
    let best = null;
    let distance = Infinity;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) {
        for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.1) {
            const d = Math.hypot(x - cx, z - cz);
            if (d < distance && pointInPolygon(x, z, polygon)) {
                distance = d;
                best = [x, z];
            }
        }
    }
    return best ?? [cx, cz];
}

function polygonArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
    }
    return Math.abs(area) / 2;
}

function round(value) {
    return Math.round(value * 1000) / 1000;
}

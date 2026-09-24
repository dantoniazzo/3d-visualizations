import * as THREE from "three";

import { FINISHES } from "../../../shared/catalog.js";
import { pointInPolygon, polygonCentroid } from "../Utils/geometry.js";

/**
 * The property sorted into collections, the way Blender's outliner sorts a
 * scene: each floor, each room on it, then the site outside and the roof.
 *
 * Everything in the scene — each slab, wall, roof and imported mesh, and
 * each editable piece — gets a membership: which floor(s) it is on, which
 * room(s) it belongs to, and what kind of thing it is. The editor then
 * decides what to show from two pieces of state:
 *
 *   focus   one floor or one room to work on alone; everything else hides
 *           (and the ceiling over it, so it can be seen into from above);
 *   hidden  collections switched off with their eye in the outliner.
 *
 * Membership of the building is derived, not authored. A generated shell
 * says where its rooms and walls are, so a wall belongs to the rooms whose
 * edges run along it. An imported model only has named nodes, so each node
 * is placed by its bounds: flat ones are floors or ceilings depending on
 * whether they sit at a storey's level, the rest belong to whichever rooms
 * they touch.
 */

const LEVEL_NAMES = ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor"];
const _box = new THREE.Box3();

export default class Collections {
    constructor(builder) {
        this.builder = builder;
        this.wallRoomCache = new Map();
    }

    get spec() {
        return this.builder.spec;
    }

    // ------------------------------------------------------------------
    // Floors and rooms
    // ------------------------------------------------------------------

    isOutdoor(room) {
        return FINISHES[room.floor_finish]?.kind === "ground";
    }

    /** Indoor storeys, lowest first, with their rooms. */
    floors() {
        return this.builder.levels().map((elevation, index) => ({
            id: `level:${index}`,
            index,
            elevation,
            name: LEVEL_NAMES[index] || `Level ${index}`,
            rooms: this.spec.rooms.filter(
                (room) => !this.isOutdoor(room) && Math.abs(room.elevation - elevation) < 0.05
            ),
        }));
    }

    outdoorRooms() {
        return this.spec.rooms.filter((room) => this.isOutdoor(room));
    }

    /** The storey a height stands on: the highest level at or below it. */
    levelOf(y) {
        const levels = this.builder.levels();
        let index = 0;
        for (let i = 0; i < levels.length; i++) if (levels[i] <= y + 0.35) index = i;
        return index;
    }

    /** The room a point on a storey is in — indoor rooms first. */
    roomAt(x, y, z) {
        const level = this.levelOf(y);
        const elevation = this.builder.levels()[level] ?? 0;
        const inside = (room) => pointInPolygon(x, z, room.polygon);
        const indoor = this.spec.rooms.find(
            (room) => !this.isOutdoor(room) && Math.abs(room.elevation - elevation) < 0.05 && inside(room)
        );
        if (indoor) return indoor;
        if (level === 0) return this.outdoorRooms().find(inside) || null;
        return null;
    }

    roomName(id) {
        return this.spec.rooms.find((room) => room.id === id)?.name || id;
    }

    /**
     * The rooms either side of a generated wall: those with an edge running
     * along it, half a wall's thickness away.
     */
    wallRooms(wall) {
        if (this.wallRoomCache.has(wall.id)) return this.wallRoomCache.get(wall.id);

        const [x1, z1] = wall.start;
        const length = Math.hypot(wall.end[0] - x1, wall.end[1] - z1);
        const t = [(wall.end[0] - x1) / length, (wall.end[1] - z1) / length];
        const n = [-t[1], t[0]];
        const reach = wall.thickness / 2 + 0.12;
        const rooms = [];

        for (const room of this.spec.rooms) {
            if (Math.abs(room.elevation - wall.base_height) > 0.35) continue;
            const polygon = room.polygon;
            for (let i = 0; i < polygon.length; i++) {
                const p = polygon[i];
                const q = polygon[(i + 1) % polygon.length];
                const dp = (p[0] - x1) * n[0] + (p[1] - z1) * n[1];
                const dq = (q[0] - x1) * n[0] + (q[1] - z1) * n[1];
                if (Math.abs(dp) > reach || Math.abs(dq) > reach || Math.abs(dp - dq) > 0.03) continue;
                const sp = (p[0] - x1) * t[0] + (p[1] - z1) * t[1];
                const sq = (q[0] - x1) * t[0] + (q[1] - z1) * t[1];
                const overlap = Math.min(Math.max(sp, sq), length) - Math.max(Math.min(sp, sq), 0);
                if (overlap > 0.15) {
                    rooms.push(room.id);
                    break;
                }
            }
        }
        this.wallRoomCache.set(wall.id, rooms);
        return rooms;
    }

    /** Rooms on a storey whose outline a box in plan overlaps. */
    roomsTouching(box, level, grow = 0) {
        const elevation = this.builder.levels()[level] ?? 0;
        return this.spec.rooms
            .filter((room) => !this.isOutdoor(room) && Math.abs(room.elevation - elevation) < 0.05)
            .filter((room) => {
                const xs = room.polygon.map((p) => p[0]);
                const zs = room.polygon.map((p) => p[1]);
                return (
                    Math.min(...xs) - grow < box.max.x &&
                    Math.max(...xs) + grow > box.min.x &&
                    Math.min(...zs) - grow < box.max.z &&
                    Math.max(...zs) + grow > box.min.z
                );
            })
            .map((room) => room.id);
    }

    // ------------------------------------------------------------------
    // Membership
    // ------------------------------------------------------------------

    /**
     * Every piece of the building with what it belongs to:
     * `{ object, kind, levels, rooms, outside }`, kind being floor,
     * ceiling, wall, roof, door or ground.
     */
    buildingParts() {
        const b = this.builder;
        const parts = [];

        if (b.groundPlane) parts.push({ object: b.groundPlane, kind: "ground", outside: true });

        if (!b.isModelScene) {
            for (const room of this.spec.rooms) {
                const group = b.roomGroups.get(room.id);
                if (!group) continue;
                const outdoor = this.isOutdoor(room);
                const level = this.levelOf(room.elevation);
                for (const mesh of group.children) {
                    const ceiling = mesh.name.startsWith("ceiling:");
                    parts.push({
                        object: mesh,
                        kind: outdoor ? "ground" : ceiling ? "ceiling" : "floor",
                        levels: [level],
                        rooms: [room.id],
                        outside: outdoor,
                    });
                }
            }
            for (const wall of this.spec.walls) {
                const entry = b.wallGroups.get(wall.id);
                if (!entry) continue;
                const rooms = this.wallRooms(wall);
                parts.push({
                    object: entry.group,
                    kind: "wall",
                    levels: [this.levelOf(wall.base_height)],
                    rooms,
                    // A garden wall or fence meets no room.
                    outside: rooms.length > 0 && rooms.every((id) => this.isOutdoor(this.spec.rooms.find((r) => r.id === id))),
                });
            }
            for (const group of b.roofGroups || []) parts.push({ object: group, kind: "roof" });
            // A stairwell's rails stand on the floor it is cut through.
            for (const hole of this.spec.floor_openings || []) {
                const group = b.railGroups?.get(hole.id);
                if (!group) continue;
                const room = this.roomAt(hole.position[0], hole.elevation + 0.05, hole.position[1]);
                parts.push({ object: group, kind: "rail", levels: [this.levelOf(hole.elevation)], rooms: room ? [room.id] : [] });
            }
        } else if (b.model) {
            for (const node of b.model.children) parts.push(this.modelPart(node));
        }

        for (const anchor of b.doorAnchors?.children || []) {
            const level = this.levelOf(anchor.position.y);
            _box.setFromCenterAndSize(anchor.position, new THREE.Vector3(1.2, 2, 1.2));
            parts.push({ object: anchor, kind: "door", levels: [level], rooms: this.roomsTouching(_box, level) });
        }
        return parts;
    }

    /** Where a node of an imported model belongs, worked out once from its bounds. */
    modelPart(node) {
        if (node.userData.collection) return { object: node, ...node.userData.collection };

        const box = new THREE.Box3().setFromObject(node);
        const levels = this.builder.levels();
        // Flat: a slab, however thick, is thin for its size.
        const size = box.getSize(new THREE.Vector3());
        const flat = size.y < Math.min(0.5, 0.2 * Math.min(size.x, size.z));
        const centre = box.getCenter(new THREE.Vector3());
        let info;

        if (/^roof/i.test(node.name) || (!flat && levels.length && box.min.y > levels[levels.length - 1] + 1.2)) {
            info = { kind: "roof" };
        } else if (flat) {
            // A ceiling sits a slab's depth under the floor above, where its
            // bounds alone would pass for that floor — which way it faces
            // tells them apart.
            const facingDown = facing(node) < -0.3;
            const level = facingDown ? -1 : levels.findIndex((e) => box.max.y > e - 0.35 && box.max.y < e + 0.2);
            const onFloor = level !== -1;
            const index = onFloor ? level : this.levelOf(box.min.y - 0.5);
            // Lawns, drives and the like are mostly outside every room, even
            // when the house stands in the middle of them.
            let inside = 0;
            let samples = 0;
            for (let i = 0; i <= 6; i++) {
                for (let j = 0; j <= 6; j++) {
                    const x = box.min.x + ((box.max.x - box.min.x) * i) / 6;
                    const z = box.min.z + ((box.max.z - box.min.z) * j) / 6;
                    samples++;
                    if (this.spec.rooms.some((room) => !this.isOutdoor(room) && pointInPolygon(x, z, room.polygon))) inside++;
                }
            }
            const insideRoom = inside / samples > 0.3;
            if (onFloor && index === 0 && !insideRoom) {
                info = { kind: "ground", outside: true };
            } else {
                // A floor node belongs to the rooms it lies under; a whole-storey
                // slab lies under all of them.
                const elevation = levels[index] ?? 0;
                const rooms = this.spec.rooms
                    .filter((room) => !this.isOutdoor(room) && Math.abs(room.elevation - elevation) < 0.05)
                    .filter((room) => {
                        const [cx, cz] = polygonCentroid(room.polygon);
                        const within = cx > box.min.x && cx < box.max.x && cz > box.min.z && cz < box.max.z;
                        return within || pointInPolygon(centre.x, centre.z, room.polygon);
                    })
                    .map((room) => room.id);
                info = { kind: onFloor ? "floor" : "ceiling", levels: [index], rooms };
            }
        } else {
            const level = this.levelOf(box.min.y);
            const rooms = this.roomsTouching(box, level, 0.2);
            info = rooms.length || level > 0
                ? { kind: "wall", levels: [level], rooms }
                : { kind: "wall", outside: true };
        }

        node.userData.collection = info;
        return { object: node, ...info };
    }

    /** Where an editable piece belongs. */
    membership(editable) {
        if (editable.type === "opening") {
            const level = this.levelOf(editable.wall.base_height);
            return { levels: [level], rooms: this.wallRooms(editable.wall) };
        }

        const pose = editable.getPose();
        if (editable.type === "hole") {
            const level = this.levelOf(editable.hole.elevation);
            const room = this.roomAt(pose.position.x, editable.hole.elevation + 0.05, pose.position.z);
            return { levels: [level], rooms: room ? [room.id] : [] };
        }

        const footprint = editable.footprint();
        const x = footprint ? footprint.cx : pose.position.x;
        const z = footprint ? footprint.cz : pose.position.z;
        const bottom = editable.bottom();

        if (editable.type === "stair") {
            // A flight is on both the storey it leaves and the one it reaches:
            // working on the upper floor, it shows coming up through its opening.
            const base = this.levelOf(editable.spec.base_height);
            const top = this.levelOf(editable.spec.top_height);
            const rooms = new Set();
            for (const y of [editable.spec.base_height, editable.spec.top_height]) {
                const room = this.roomAt(x, y + 0.05, z);
                if (room) rooms.add(room.id);
            }
            return { levels: base === top ? [base] : [base, top], rooms: [...rooms] };
        }

        const room = this.roomAt(x, bottom + 0.05, z);
        if (room && this.isOutdoor(room)) return { outside: true, rooms: [room.id] };
        const level = this.levelOf(bottom);
        if (!room && level === 0) return { outside: true, rooms: [] };
        return { levels: [level], rooms: room ? [room.id] : [] };
    }

    // ------------------------------------------------------------------
    // Visibility
    // ------------------------------------------------------------------

    /**
     * Whether something with this membership is shown, given the focus
     * (`{ type: "level", level } | { type: "room", room } | { type: "outside" }`
     * or null) and the set of collections switched off.
     */
    shows(member, focus, hidden) {
        if (member.kind === "roof") return !focus && !hidden.has("roof");

        if (member.outside) {
            if (hidden.has("outside")) return false;
            return !focus || focus.type === "outside" || (focus.type === "room" && Boolean(member.rooms?.includes(focus.room)));
        }

        const levels = member.levels || [];
        if (levels.length && levels.every((l) => hidden.has(`level:${l}`))) return false;
        const rooms = member.rooms || [];
        if (rooms.length && rooms.every((r) => hidden.has(`room:${r}`))) return false;

        if (!focus) return true;
        // Working inside a floor or a room means looking down into it.
        if (member.kind === "ceiling") return false;
        if (focus.type === "level") return levels.includes(focus.level);
        if (focus.type === "room") return rooms.includes(focus.room);
        return false;
    }

    /** A box around a focus, for framing the view on it. */
    focusBox(focus) {
        const box = new THREE.Box3();
        const add = (room) => {
            for (const [x, z] of room.polygon) {
                box.expandByPoint(new THREE.Vector3(x, room.elevation, z));
                box.expandByPoint(new THREE.Vector3(x, room.elevation + Math.min(room.height, 2.6), z));
            }
        };
        if (focus?.type === "level") {
            const floor = this.floors()[focus.level];
            floor?.rooms.forEach(add);
        } else if (focus?.type === "room") {
            const room = this.spec.rooms.find((r) => r.id === focus.room);
            if (room) add(room);
        } else if (focus?.type === "outside") {
            this.outdoorRooms().forEach(add);
        }
        return box;
    }

    /**
     * The plan box a room focus is cut to: the room's outline grown by a
     * wall's thickness, so the walls around it show whole and the parts of
     * long walls running on past it do not.
     */
    clipBox(focus) {
        if (focus?.type !== "room") return null;
        const room = this.spec.rooms.find((r) => r.id === focus.room);
        if (!room) return null;
        const xs = room.polygon.map((p) => p[0]);
        const zs = room.polygon.map((p) => p[1]);
        const grow = 0.34;
        return {
            x0: Math.min(...xs) - grow,
            x1: Math.max(...xs) + grow,
            z0: Math.min(...zs) - grow,
            z1: Math.max(...zs) + grow,
        };
    }

    /** "level:0" / "room:g-hall" / "outside" -> a focus, and back. */
    static parse(key) {
        if (!key) return null;
        if (key === "outside") return { type: "outside" };
        const [type, value] = key.split(/:(.*)/s);
        if (type === "level") return { type: "level", level: Number(value) };
        if (type === "room") return { type: "room", room: value };
        return null;
    }

    static key(focus) {
        if (!focus) return "";
        if (focus.type === "outside") return "outside";
        return focus.type === "level" ? `level:${focus.level}` : `room:${focus.room}`;
    }

    describe(focus) {
        if (!focus) return "Whole property";
        if (focus.type === "outside") return "Outside";
        if (focus.type === "level") return this.floors()[focus.level]?.name || "Floor";
        const room = this.spec.rooms.find((r) => r.id === focus.room);
        if (!room) return "Room";
        if (this.isOutdoor(room)) return `Outside › ${room.name}`;
        return `${this.floors()[this.levelOf(room.elevation)]?.name} › ${room.name}`;
    }
}

/**
 * Which way a flat node's faces point, on balance, from 1 (all up: a floor)
 * to -1 (all down: a ceiling). A closed slab faces both ways and comes out
 * near 0. Area-weighted over a sample of triangles.
 */
function facing(node) {
    let total = 0;
    let magnitude = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    node.updateWorldMatrix(true, true);
    node.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
        const position = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        const count = index ? index.count / 3 : position.count / 3;
        const step = Math.max(1, Math.floor(count / 200));
        for (let t = 0; t < count; t += step) {
            const i = t * 3;
            a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
            b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
            c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
            // y of the (unnormalised) face normal is twice its signed plan area.
            const y = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
            total += y;
            magnitude += Math.abs(y);
        }
    });
    return magnitude > 0 ? total / magnitude : 0;
}

export { LEVEL_NAMES };

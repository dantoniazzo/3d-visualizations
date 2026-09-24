import * as THREE from "three";

import Door from "../Door.js";
import KitLibrary, { boxUVs, mergeParts, mirror } from "./KitLibrary.js";
import { FINISHES } from "../../../../shared/catalog.js";
import { ensureCCW, isConvex, subtractConvex } from "../../Utils/geometry.js";

/**
 * Builds the shell: floors, ceilings, walls with real holes punched for
 * doors, windows and archways, roofs, stairs, and the doors themselves.
 *
 * Two things distinguish this from a plain mesh dump:
 *
 * 1. Every visible surface is registered with a stable id and a finish, so
 *    the texture picker can point at it and swap the finish later.
 * 2. Openings are made by splitting a wall into solid panels around them
 *    rather than by boolean subtraction — no CSG, and every panel stays a
 *    box, which keeps the collision octree cheap.
 *
 * The joinery that dresses it — skirting, door casings, glazing bars and
 * cills, balustrades and landing rails — is merged into one mesh per wall,
 * flight or stairwell and marked `decor`: drawn, but left out of the
 * collision octree and the editor's fit test, so a sofa still goes flush
 * against a wall. Rails get an invisible panel of their own that does
 * collide, so nobody walks through them into a stairwell.
 *
 * That joinery, the window frames and the door leaves come from the Blender
 * kit of parts (KitLibrary) when it has loaded, stretched to each opening
 * and flight; without it, from boxes of the same size.
 */

/** Handrail height, above a floor or a flight's pitch line. */
const RAIL_HEIGHT = 0.95;
/** A flight's handrail, to its top, above the treads' nosings. */
const RAIL_ABOVE_NOSING = 0.9;
/** How far a newel runs on above the handrail it carries. */
const NEWEL_OVER_RAIL = 0.12;

const SKIRT_H = 0.12;
const SKIRT_D = 0.018;
const CASE_W = 0.07;
const CASE_D = 0.022;

/** A flight's strings: thickness, depth square to the pitch, and how far
 *  their top edge stands above the nosings. */
const STRING_T = 0.035;
const STRING_DEPTH = 0.25;
const STRING_ABOVE = 0.065;

/** A box, already moved to where it goes, ready to be merged. */
function boxAt(w, h, d, x, y, z) {
    return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** BoxGeometry lays its UVs out in this face order. */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

export default class StructureBuilder {
    /** How far a stair's collision ramp runs on past the bottom step. */
    static STAIR_LEAD_IN = 0.6;

    constructor(materials, kit = new KitLibrary(null)) {
        this.materials = materials;
        this.kit = kit;
        this.disposables = new Set();
        this.doubleSidedCache = new Map();
    }

    track(geometry) {
        this.disposables.add(geometry);
        return geometry;
    }

    /**
     * Free everything a previously built group owns. The editor rebuilds
     * rooms, walls and stairs as they are moved, so their geometry has to
     * leave the tracked set rather than pile up for the life of the page.
     */
    release(group) {
        group?.traverse((child) => {
            if (!child.isMesh || !child.geometry) return;
            if (this.disposables.delete(child.geometry)) child.geometry.dispose();
        });
    }

    /**
     * Scale one face's UVs so its finish tiles at real-world size. Each
     * BoxGeometry face owns four consecutive UVs.
     */
    tileFace(geometry, face, widthM, heightM, finishId) {
        const tile = this.materials.tileSize(finishId);
        const uv = geometry.attributes.uv;
        const start = face * 4;

        for (let i = start; i < start + 4; i++) {
            uv.setXY(i, (uv.getX(i) * widthM) / tile, (uv.getY(i) * heightM) / tile);
        }
        uv.needsUpdate = true;
    }

    /** Merge a set of boxes and kit parts into one decorative mesh. */
    mergedDecor(geometries, material, name, tag = {}) {
        const merged = this.track(mergeParts(geometries));
        for (const geometry of geometries) geometry.dispose();
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { ...tag, decor: true };
        return mesh;
    }

    /** An invisible panel the octree and the fit test treat as solid. */
    blocker(w, h, d, label) {
        const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)));
        mesh.visible = false;
        mesh.name = "blocker";
        mesh.userData = { label };
        return mesh;
    }

    // ------------------------------------------------------------------
    // Rooms
    // ------------------------------------------------------------------

    /** A copy of a surface material that also renders from behind. */
    doubleSided(finishId, kind) {
        const key = `${finishId}|${kind}`;
        if (this.doubleSidedCache.has(key)) return this.doubleSidedCache.get(key);

        const material = this.materials.getSurface(finishId, kind).clone();
        material.side = THREE.DoubleSide;
        this.doubleSidedCache.set(key, material);
        return material;
    }

    /**
     * A flat slab over a room polygon with holes cut through it, in shape
     * space (x, -z) exactly as THREE.ShapeGeometry would lay it out, so the
     * caller's -90° turn about X and world-UV tiling both still apply.
     *
     * The polygon is triangulated and every triangle has each hole clipped
     * out of it. Holes may therefore run past the room's outline — a
     * stairwell opening straddling two rooms cuts each of them cleanly —
     * which earcut's own hole support cannot do. Only a concave hole, which
     * the clipper cannot take, falls back to ShapeGeometry.
     */
    slabGeometry(polygon, holes) {
        const toShape = (points) => ensureCCW(points.map(([x, z]) => [x, -z]));
        const outline = toShape(polygon);
        const cutters = holes.map(toShape);

        if (cutters.some((hole) => !isConvex(hole))) {
            const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
            for (const hole of cutters) {
                shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
            }
            return new THREE.ShapeGeometry(shape);
        }

        const contour = outline.map(([x, y]) => new THREE.Vector2(x, y));
        const faces = THREE.ShapeUtils.triangulateShape(contour, []);

        let pieces = faces.map((face) => ensureCCW(face.map((i) => outline[i])));
        for (const hole of cutters) {
            pieces = pieces.flatMap((piece) => subtractConvex(piece, hole));
        }

        const positions = [];
        const uvs = [];
        for (const piece of pieces) {
            for (let i = 1; i < piece.length - 1; i++) {
                for (const [x, y] of [piece[0], piece[i], piece[i + 1]]) {
                    positions.push(x, y, 0);
                    uvs.push(x, y);
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        return geometry;
    }

    /**
     * Floor slab and optional ceiling for one room polygon.
     *
     * `holes.floor` and `holes.ceiling` are the floor openings that cut each
     * slab, as plan polygons: a stairwell opening at a storey's level cuts
     * the floor of the room it arrives in and the ceiling of the room below.
     * Legacy `room.voids` still cut both, as they always did.
     *
     * @returns {{group: THREE.Group, surfaces: Array}}
     */
    buildRoom(room, holes = {}) {
        const group = new THREE.Group();
        group.name = `room:${room.id}`;
        group.userData = { kind: "room", id: room.id, name: room.name };

        const surfaces = [];

        // Slabs are built in shape space (x, -z) then laid flat by rotating
        // -90° about X, which maps shape-Y to world -Z. Negating Z up front
        // means the slab lands on the polygon with its normal pointing up —
        // which the collision octree relies on to tell a floor from a ceiling.
        const voids = room.voids || [];
        const floorHoles = [...voids, ...(holes.floor || [])];
        const ceilingHoles = [...voids, ...(holes.ceiling || [])];

        // Outdoor slabs — yards, drives, roads — are floors like any other,
        // and it is the finish that says so.
        const floorKind = FINISHES[room.floor_finish]?.kind === "ground" ? "ground" : "floor";

        // UVs are emitted in metres, so tiling is a simple divide.
        const floorGeometry = this.track(this.slabGeometry(room.polygon, floorHoles));
        this.materials.applyWorldTiling(floorGeometry, room.floor_finish);

        // An upper storey's floor is the storey below's ceiling, so slabs are
        // drawn from both sides.
        const floor = new THREE.Mesh(
            floorGeometry,
            this.doubleSided(room.floor_finish, floorKind)
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = room.elevation;
        floor.receiveShadow = true;
        floor.name = `floor:${room.id}`;
        floor.userData = {
            kind: "surface",
            surfaceId: `floor:${room.id}`,
            surfaceKind: floorKind,
            label: `${room.name} floor`,
            finish: room.floor_finish,
        };
        group.add(floor);
        surfaces.push({
            id: floor.userData.surfaceId,
            kind: floorKind,
            meshes: [floor],
            room: room.id,
            label: `${room.name} floor`,
            finish: room.floor_finish,
        });

        if (room.ceiling_finish !== "none") {
            const ceilingGeometry = this.track(this.slabGeometry(room.polygon, ceilingHoles));
            this.materials.applyWorldTiling(ceilingGeometry, room.ceiling_finish);

            const ceiling = new THREE.Mesh(
                ceilingGeometry,
                this.doubleSided(room.ceiling_finish, "ceiling")
            );
            ceiling.rotation.x = -Math.PI / 2;
            ceiling.position.y = room.elevation + room.height;
            ceiling.receiveShadow = true;
            ceiling.name = `ceiling:${room.id}`;
            ceiling.userData = {
                kind: "surface",
                surfaceId: `ceiling:${room.id}`,
                surfaceKind: "ceiling",
                label: `${room.name} ceiling`,
                finish: room.ceiling_finish,
            };
            group.add(ceiling);
            surfaces.push({
                id: ceiling.userData.surfaceId,
                kind: "ceiling",
                meshes: [ceiling],
                room: room.id,
                label: `${room.name} ceiling`,
                finish: room.ceiling_finish,
            });
        }

        return { group, surfaces };
    }

    // ------------------------------------------------------------------
    // Walls
    // ------------------------------------------------------------------

    /**
     * One wall, split into solid panels around its openings, with a door
     * built into every `door` opening.
     *
     * A wall has two faces: side A is +Z in the wall's local frame (the left
     * of the start→end direction), side B is -Z. Each can carry its own
     * finish, which is why the panels use a six-material BoxGeometry rather
     * than a single material.
     *
     * @returns {{group, surfaces, doors}}
     */
    buildWall(wall) {
        const group = new THREE.Group();
        group.name = `wall:${wall.id}`;
        group.userData = { kind: "wall", id: wall.id };

        const [x1, z1] = wall.start;
        const [x2, z2] = wall.end;
        const length = Math.hypot(x2 - x1, z2 - z1);
        const angle = Math.atan2(x2 - x1, z2 - z1);

        // Work in the wall's own frame: X along its length, Y up, Z through
        // its thickness. The group transform puts it back into the world.
        group.position.set((x1 + x2) / 2, wall.base_height, (z1 + z2) / 2);
        group.rotation.y = angle - Math.PI / 2;

        const finishA = wall.finish;
        const finishB = wall.finish_back || wall.finish;

        const faceA = this.materials.getSurface(finishA, "wall");
        const faceB = this.materials.getSurface(finishB, "wall");
        const reveal = this.materials.getTrim(wall.reveal || "trim_white");

        const panelsA = [];
        const panelsB = [];
        const half = length / 2;

        const addPanel = (from, to, bottom, top) => {
            const w = to - from;
            const h = top - bottom;
            if (w <= 0.001 || h <= 0.001) return;

            const geometry = this.track(new THREE.BoxGeometry(w, h, wall.thickness));
            this.tileFace(geometry, FACE.pz, w, h, finishA);
            this.tileFace(geometry, FACE.nz, w, h, finishB);

            // Face order: +X, -X, +Y, -Y, +Z (side A), -Z (side B).
            const panel = new THREE.Mesh(geometry, [
                reveal,
                reveal,
                reveal,
                reveal,
                faceA,
                faceB,
            ]);
            panel.position.set(from + w / 2 - half, bottom + h / 2, 0);
            panel.castShadow = true;
            panel.receiveShadow = true;

            panel.userData = {
                kind: "surface",
                wallId: wall.id,
                surfaceId: `wall:${wall.id}`,
                surfaceKind: "wall",
                // Which material slot each side occupies, so the picker can
                // retexture one face without touching the other.
                faceSlots: { a: 4, b: 5 },
                label: "Wall",
                finish: finishA,
                finishBack: finishB,
            };

            group.add(panel);
            panelsA.push(panel);
            panelsB.push(panel);
        };

        const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
        const doors = [];
        let cursor = 0;

        for (const opening of openings) {
            const start = opening.offset - opening.width / 2;
            const end = opening.offset + opening.width / 2;
            const top = opening.sill + opening.height;

            addPanel(cursor, start, 0, wall.height);

            if (opening.sill > 0.001) {
                addPanel(start, end, 0, opening.sill);
            }

            // Everything built for an opening says which one it is, so the
            // editor can pick a window by its glass or a doorway by its sill.
            const openingTag = { kind: "opening", wallId: wall.id, openingId: opening.id };

            if (opening.type === "arch") {
                this.addArchHead(group, opening, wall, half, [reveal, reveal, reveal, reveal, faceA, faceB], openingTag);
            } else if (top < wall.height - 0.001) {
                addPanel(start, end, top, wall.height);
            }

            if (opening.sill <= 0.001) {
                this.addThreshold(group, opening, wall, half, reveal, openingTag);
            }

            if (opening.type === "door") {
                const door = new Door(opening, wall, opening.offset - half, this.materials, this.kit);
                // Deliberately NOT parented yet. The wall goes into the
                // static collision octree, and a leaf baked in there at its
                // closed position would block the doorway forever. The
                // caller attaches doors once the octree is built; from then
                // on they collide through Door.resolveCapsule instead.
                door.wallGroup = group;
                doors.push(door);
            } else if (opening.type === "window") {
                this.addWindow(group, opening, wall, half, openingTag);
            }

            cursor = end;
        }

        addPanel(cursor, length, 0, wall.height);

        if (wall.trims) group.add(this.buildTrims(wall, openings, length));

        const surfaces = [
            {
                id: `wall:${wall.id}:a`,
                kind: "wall",
                meshes: panelsA,
                slot: 4,
                label: "Wall",
                finish: finishA,
            },
            {
                id: `wall:${wall.id}:b`,
                kind: "wall",
                meshes: panelsB,
                slot: 5,
                label: "Wall",
                finish: finishB,
            },
        ];

        return { group, surfaces, doors };
    }

    /**
     * Skirting along the foot of a wall, stopping at every opening that
     * reaches the floor, and casings round its doors and doorways — on side
     * A, side B or both (`wall.trims`). Casings stand a little prouder than
     * the skirting, so it dies into them as it does on a real wall.
     */
    buildTrims(wall, openings, length) {
        const half = length / 2;
        const t = wall.thickness / 2;
        const cased = (o) => o.type === "door" || o.type === "doorway" || o.type === "arch";
        const sides = wall.trims === "both" ? [1, -1] : wall.trims === "a" ? [1] : [-1];
        // A moulded architrave is thinnest right at its outer edge, so the
        // skirting runs on a few millimetres to where it is fully thick.
        const into = this.kit.has("architrave_leg") ? 0.005 : 0.001;

        // Where the skirting stops: each floor-level opening, and the casing
        // either side of it.
        const gaps = openings
            .filter((o) => o.sill <= 0.001)
            .map((o) => {
                const margin = cased(o) ? CASE_W - into : 0;
                return [o.offset - o.width / 2 - margin, o.offset + o.width / 2 + margin];
            });

        const parts = [];
        for (const side of sides) {
            let cursor = 0;
            for (const [from, to] of [...gaps, [length, length]]) {
                if (from - cursor > 0.01) parts.push(this.skirting(from - cursor, (cursor + from) / 2 - half, side, t));
                cursor = Math.max(cursor, to);
            }
            for (const o of openings) {
                if (cased(o)) parts.push(...this.casing(o, o.offset - half, side, t, wall.height));
            }
        }

        return this.mergedDecor(parts, this.materials.getTrim(wall.reveal || "trim_white"), `trims:${wall.id}`);
    }

    /** A run of skirting centred on x, on one face of a wall (side ±1). */
    skirting(run, x, side, t) {
        if (!this.kit.has("skirting")) {
            return boxAt(run, SKIRT_H, SKIRT_D, x, SKIRT_H / 2, side * (t + SKIRT_D / 2 - 0.001));
        }
        const size = this.kit.size("skirting");
        const geometry = this.kit.fit("skirting", run, null, null);
        if (side < 0) mirror(geometry, "z");
        return geometry.translate(x, size.y / 2, side * (t + size.z / 2 - 0.001));
    }

    /**
     * The casing round one opening centred on x, on one face of a wall: two
     * legs and a head, mitred where they meet. Cut off by a low ceiling, the
     * legs run straight up into it and there is no head.
     */
    casing(o, x, side, t, wallHeight) {
        const head = o.sill + o.height;
        const top = Math.min(head + CASE_W, wallHeight);
        const kit = this.kit;

        if (kit.has("architrave_leg") && kit.has("architrave_head") && top > head + CASE_W - 0.001) {
            const z = side * (t + kit.size("architrave_leg").z / 2 - 0.001);
            const out = [];
            for (const edge of [-1, 1]) {
                const leg = kit.fit("architrave_leg", null, top, null);
                // Modelled as the left leg, with its edge on the opening at +X.
                if (edge > 0) mirror(leg, "x");
                if (side < 0) mirror(leg, "z");
                out.push(leg.translate(x + edge * (o.width / 2 + CASE_W / 2), top / 2, z));
            }
            const lintel = kit.fit("architrave_head", o.width + CASE_W * 2, null, null);
            if (side < 0) mirror(lintel, "z");
            out.push(lintel.translate(x, head + CASE_W / 2, z));
            return out;
        }

        const z = side * (t + CASE_D / 2 - 0.001);
        const out = [];
        for (const edge of [-1, 1]) {
            out.push(boxAt(CASE_W, top, CASE_D, x + edge * (o.width / 2 + CASE_W / 2), top / 2, z));
        }
        if (top > head + 0.01) {
            out.push(boxAt(o.width + 0.002, top - head, CASE_D, x, (head + top) / 2, z));
        }
        return out;
    }

    /** Semicircular head for an arched opening, built from slats. */
    addArchHead(group, opening, wall, half, materials, tag) {
        const SLATS = 14;
        const radius = opening.width / 2;
        const springLine = opening.sill + opening.height - radius;
        const slatWidth = opening.width / SLATS;

        for (let i = 0; i < SLATS; i++) {
            const t = (i + 0.5) / SLATS;
            const dx = (t - 0.5) * opening.width;
            const curveTop = springLine + Math.sqrt(Math.max(0, radius * radius - dx * dx));
            if (curveTop >= wall.height - 0.001) continue;

            const geometry = this.track(
                new THREE.BoxGeometry(slatWidth + 0.002, wall.height - curveTop, wall.thickness)
            );
            const slat = new THREE.Mesh(geometry, materials);
            slat.position.set(
                opening.offset + dx - half,
                curveTop + (wall.height - curveTop) / 2,
                0
            );
            slat.castShadow = true;
            slat.userData = { ...tag };
            group.add(slat);
        }
    }

    /**
     * A strip of floor under an opening that reaches the ground.
     *
     * Room polygons stop at the inner faces of their walls, so the wall's own
     * thickness is a gap in the floor — invisible under a solid panel, but a
     * slot straight through to whatever is below in every doorway. The strip
     * sits a millimetre low and overlaps both slabs, so it fills the gap
     * without z-fighting the floors it meets.
     */
    addThreshold(group, opening, wall, half, material, tag) {
        const overlap = 0.03;
        const geometry = this.track(
            new THREE.BoxGeometry(opening.width, 0.06, wall.thickness + overlap * 2)
        );

        const threshold = new THREE.Mesh(geometry, material);
        threshold.position.set(opening.offset - half, -0.031, 0);
        threshold.receiveShadow = true;
        threshold.userData = { ...tag };
        group.add(threshold);
    }

    /**
     * Glass, frame, glazing bars and cill for a window opening. From the
     * kit, the frame is a moulded frame-and-sash ring no deeper than a real
     * one, set in the middle of the reveal; without it, four boxes most of
     * the wall's depth.
     */
    addWindow(group, opening, wall, half, tag) {
        const frameMaterial = this.materials.getTrim(opening.frame || "trim_white");
        const x = opening.offset - half;
        const y = opening.sill + opening.height / 2;

        const glass = new THREE.Mesh(
            this.track(new THREE.BoxGeometry(opening.width - 0.08, opening.height - 0.08, 0.015)),
            this.materials.getTrim("glass", "glass")
        );
        glass.position.set(x, y, 0);
        glass.userData = { ...tag };
        group.add(glass);

        const kit = this.kit;
        const [across, up] = opening.panes || [1, 1];
        const parts = [];

        if (kit.has("window_frame") && kit.has("glazing_bar")) {
            const depth = THREE.MathUtils.clamp(wall.thickness * 0.7, 0.05, 0.1);
            const frame = new THREE.Mesh(
                this.track(kit.fit("window_frame", opening.width, opening.height, depth)),
                frameMaterial
            );
            frame.position.set(x, y, 0);
            frame.castShadow = true;
            frame.receiveShadow = true;
            frame.userData = { ...tag };
            group.add(frame);

            // Bars divide the glass into equal panes and run on to the
            // sash's face, which they are moulded to match; a deeper frame
            // makes them deeper by as much.
            const { glass_line: glassLine = 0.081, sash_face: sashFace = 0.068 } = kit.meta("window_frame");
            const barDepth = kit.size("glazing_bar").z + depth - kit.size("window_frame").z;
            const glassW = opening.width - glassLine * 2;
            const glassH = opening.height - glassLine * 2;
            for (let i = 1; i < across; i++) {
                parts.push(
                    kit
                        .fit("glazing_bar", null, opening.height - sashFace * 2, barDepth)
                        .translate(x - glassW / 2 + (i * glassW) / across, y, 0)
                );
            }
            for (let j = 1; j < up; j++) {
                parts.push(
                    kit
                        .fit("glazing_bar", null, opening.width - sashFace * 2, barDepth)
                        .rotateZ(Math.PI / 2)
                        .translate(x, y - glassH / 2 + (j * glassH) / up, 0)
                );
            }
        } else {
            const frame = new THREE.Group();
            const bars = [
                [opening.width, 0.07, 0, opening.height / 2 - 0.035],
                [opening.width, 0.07, 0, -opening.height / 2 + 0.035],
                [0.07, opening.height, -opening.width / 2 + 0.035, 0],
                [0.07, opening.height, opening.width / 2 - 0.035, 0],
            ];
            for (const [w, h, dx, dy] of bars) {
                const bar = new THREE.Mesh(
                    this.track(new THREE.BoxGeometry(w, h, wall.thickness * 0.7)),
                    frameMaterial
                );
                bar.position.set(dx, dy, 0);
                bar.castShadow = true;
                bar.userData = { ...tag };
                frame.add(bar);
            }
            frame.position.set(x, y, 0);
            group.add(frame);

            const innerW = opening.width - 0.14;
            const innerH = opening.height - 0.14;
            for (let i = 1; i < across; i++) {
                parts.push(boxAt(0.03, innerH, 0.035, x - innerW / 2 + (i * innerW) / across, y, 0));
            }
            for (let j = 1; j < up; j++) {
                parts.push(boxAt(innerW, 0.03, 0.035, x, y - innerH / 2 + (j * innerH) / up, 0));
            }
        }

        // A cill board under it standing proud of both faces. Its top sits a
        // few millimetres above the wall under the window, so the two never
        // share a face.
        if (opening.cill && opening.sill > 0.05) {
            const height = kit.has("window_cill") ? kit.size("window_cill").y : 0.035;
            parts.push(
                kit
                    .fit("window_cill", opening.width + 0.14, height, wall.thickness + 0.1)
                    .translate(x, opening.sill + 0.004 - height / 2, 0)
            );
        }
        if (parts.length) group.add(this.mergedDecor(parts, frameMaterial, "glazing-bars", tag));
    }

    // ------------------------------------------------------------------
    // Roofs
    // ------------------------------------------------------------------

    /**
     * A roof over the bounding box of its footprint.
     *
     * `gable` is two slabs leaning against a ridge line, closed at the ends
     * by triangular gable walls; `flat` is one slab. Both overhang the
     * footprint at the eaves, which is what stops a roof reading as a lid.
     *
     * Roofs are part of the shell and therefore collide — an attic has to
     * have something over it.
     *
     * @returns {{group: THREE.Group, surfaces: Array}}
     */
    buildRoof(roof) {
        const group = new THREE.Group();
        group.name = `roof:${roof.id}`;
        group.userData = { kind: "roof", id: roof.id };

        const xs = roof.footprint.map((p) => p[0]);
        const zs = roof.footprint.map((p) => p[1]);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        const z0 = Math.min(...zs);
        const z1 = Math.max(...zs);
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;

        const covering = this.materials.getSurface(roof.finish, "roof");
        const soffit = this.materials.getTrim(roof.soffit || "trim_white");
        const thickness = roof.thickness ?? 0.18;
        const overhang = roof.overhang ?? 0.4;
        const slabs = [];

        // Face order is +X, -X, +Y, -Y, +Z, -Z: only the top wears the
        // covering, the cut edges and the underside are soffit board.
        const slabMaterials = [soffit, soffit, covering, soffit, soffit, soffit];

        const addSlab = (width, depth, position, rotation) => {
            const geometry = this.track(new THREE.BoxGeometry(width, thickness, depth));
            this.tileFace(geometry, FACE.py, width, depth, roof.finish);

            const slab = new THREE.Mesh(geometry, slabMaterials.slice());
            slab.position.copy(position);
            if (rotation) slab.rotation.copy(rotation);
            slab.castShadow = true;
            slab.receiveShadow = true;
            slab.userData = {
                kind: "surface",
                surfaceId: `roof:${roof.id}`,
                surfaceKind: "roof",
                faceSlots: { top: FACE.py },
                label: "Roof",
                finish: roof.finish,
            };
            group.add(slab);
            slabs.push(slab);
        };

        if (roof.type === "flat") {
            addSlab(
                x1 - x0 + overhang * 2,
                z1 - z0 + overhang * 2,
                new THREE.Vector3(cx, roof.base_height + thickness / 2, cz)
            );
        } else {
            // The ridge runs along `ridge_axis`; the slopes fall away from it
            // along the other one.
            const alongZ = roof.ridge_axis !== "x";
            const spanHalf = (alongZ ? x1 - x0 : z1 - z0) / 2;
            const depth = alongZ ? z1 - z0 : x1 - x0;
            const rise = roof.ridge_height - roof.base_height;
            const pitch = Math.atan2(rise, spanHalf);
            const run = spanHalf + overhang;
            const slopeLength = run / Math.cos(pitch);

            for (const sign of [-1, 1]) {
                // Midpoint of the slope, measured out from the ridge.
                const offset = (sign * run) / 2;
                const height = roof.ridge_height - (run / 2) * Math.tan(pitch);
                const rotation = new THREE.Euler();

                if (alongZ) rotation.z = -sign * pitch;
                else rotation.x = sign * pitch;

                addSlab(
                    alongZ ? slopeLength : depth,
                    alongZ ? depth : slopeLength,
                    new THREE.Vector3(
                        alongZ ? cx + offset : cx,
                        height,
                        alongZ ? cz : cz + offset
                    ),
                    rotation
                );
            }
        }

        const surfaces = [
            {
                id: `roof:${roof.id}`,
                kind: "roof",
                meshes: slabs,
                slot: FACE.py,
                label: "Roof",
                finish: roof.finish,
            },
        ];

        if (roof.type === "gable") {
            surfaces.push(this.addGableEnds(group, roof, { x0, x1, z0, z1, cx, cz }));
        }

        return { group, surfaces };
    }

    /** The triangular walls that close a gable roof at each end. */
    addGableEnds(group, roof, { x0, x1, z0, z1, cx, cz }) {
        const alongZ = roof.ridge_axis !== "x";
        const from = alongZ ? x0 : z0;
        const to = alongZ ? x1 : z1;
        const apex = alongZ ? cx : cz;

        const shape = new THREE.Shape([
            new THREE.Vector2(from, roof.base_height),
            new THREE.Vector2(to, roof.base_height),
            new THREE.Vector2(apex, roof.ridge_height),
        ]);

        const finishId = roof.gable_finish || "plaster";
        const meshes = [];

        for (const end of alongZ ? [z0, z1] : [x0, x1]) {
            const geometry = this.track(new THREE.ShapeGeometry(shape));
            this.materials.applyWorldTiling(geometry, finishId);

            const gable = new THREE.Mesh(geometry, this.doubleSided(finishId, "wall"));
            if (alongZ) {
                gable.position.set(0, 0, end);
            } else {
                // Drawn in XY with its width along shape-X, so an end wall on
                // the X axis turns a quarter turn to lay that width along Z.
                gable.position.set(end, 0, 0);
                gable.rotation.y = -Math.PI / 2;
            }
            gable.castShadow = true;
            gable.receiveShadow = true;
            gable.userData = {
                kind: "surface",
                surfaceId: `roof:${roof.id}:gable`,
                surfaceKind: "wall",
                label: "Gable wall",
                finish: finishId,
            };
            group.add(gable);
            meshes.push(gable);
        }

        return {
            id: `roof:${roof.id}:gable`,
            kind: "wall",
            meshes,
            label: "Gable wall",
            finish: finishId,
        };
    }

    // ------------------------------------------------------------------
    // Stairs
    // ------------------------------------------------------------------

    /**
     * A straight flight, plus the collider that makes it walkable.
     *
     * The capsule physics has no step-up assist, so discrete treads would
     * stop a visitor dead at the first riser. The treads are therefore
     * cosmetic and collision comes from an invisible ramp laid through the
     * nosings — the octree resolves a slope perfectly well, and the half-rise
     * offset keeps a walker within a centimetre or two of the tread they
     * appear to be standing on.
     *
     * @returns {{group, collider, surfaces}}
     */
    buildStairs(stair) {
        const group = new THREE.Group();
        group.name = `stairs:${stair.id}`;
        group.userData = { kind: "stairs", id: stair.id };

        // Local frame: X across the width, Z up the run, Y up. The group
        // transform turns it to face the climb direction.
        group.position.set(stair.start[0], stair.base_height, stair.start[1]);
        group.rotation.y = THREE.MathUtils.degToRad(stair.yaw ?? 0);

        const rise = stair.top_height - stair.base_height;
        const steps = stair.steps;
        const going = stair.run / steps;
        const stepRise = rise / steps;

        const tread = this.materials.getSurface(stair.finish, "floor");
        const riser = this.materials.getTrim(stair.riser || "trim_white");
        const moulded = this.kit.has("stair_tread");
        const treads = moulded ? this.addTreads(group, stair, tread, riser) : [];

        // Without the kit, each step is one box, solid to the ground, so the
        // flight reads as a closed string rather than a floating ladder.
        if (!moulded) {
            for (let i = 0; i < steps; i++) {
                const top = (i + 1) * stepRise;
                const geometry = this.track(new THREE.BoxGeometry(stair.width, top, going));
                this.tileFace(geometry, FACE.py, stair.width, going, stair.finish);

                const step = new THREE.Mesh(geometry, [riser, riser, tread, riser, riser, riser]);
                step.position.set(0, top / 2, i * going + going / 2);
                step.castShadow = true;
                step.receiveShadow = true;
                step.userData = {
                    kind: "surface",
                    surfaceId: `stairs:${stair.id}`,
                    surfaceKind: "floor",
                    label: "Stair treads",
                    finish: stair.finish,
                };
                group.add(step);
                treads.push(step);
            }
        }

        // --- the ramp the player actually walks on ------------------------
        const collider = new THREE.Group();
        collider.name = `stairs-collider:${stair.id}`;
        collider.position.copy(group.position);
        collider.rotation.copy(group.rotation);

        const pitch = Math.atan2(rise, stair.run);

        // --- the balustrade, on the open side or sides ---------------------
        // Climbing, left is local +X. Newels at the foot and the head,
        // two spindles a tread, and a handrail raked to the pitch; plus a
        // panel along it that collides, since spindles are too thin for the
        // octree to be much use as a guard.
        const sides = { left: [1], right: [-1], both: [1, -1] }[stair.balustrade] || [];
        const turned = ["newel", "baluster", "handrail", "base_rail"].every((name) => this.kit.has(name));
        if (moulded && turned) {
            // Strings go up both sides whether or not either is open.
            group.add(this.mergedDecor(this.flightJoinery(stair, sides), riser, "balustrade"));
            for (const side of sides) collider.add(this.flightGuard(stair, side * (stair.width / 2 - 0.032)));
        } else if (sides.length) {
            const H = RAIL_HEIGHT;
            const slope = Math.hypot(stair.run, rise);
            const boxes = [];
            for (const side of sides) {
                const x = side * (stair.width / 2 - 0.045);
                boxes.push(boxAt(0.09, H + 0.15, 0.09, x, (H + 0.15) / 2, 0.045));
                boxes.push(boxAt(0.09, H + 0.3, 0.09, x, rise + H / 2, stair.run - 0.045));
                for (let i = 0; i < steps; i++) {
                    for (const f of [0.28, 0.72]) {
                        const z = (i + f) * going;
                        const bottom = (i + 1) * stepRise;
                        const top = (z / stair.run) * rise + H - 0.03;
                        if (top - bottom > 0.05) boxes.push(boxAt(0.032, top - bottom, 0.032, x, (bottom + top) / 2, z));
                    }
                }
                boxes.push(new THREE.BoxGeometry(0.064, 0.06, slope).rotateX(-pitch).translate(x, rise / 2 + H, stair.run / 2));
                collider.add(this.flightGuard(stair, x));
            }
            group.add(this.mergedDecor(boxes, riser, "balustrade"));
        }
        const slabDepth = 0.3;

        // The nosing line sits half a rise above the step corners, which puts
        // it through the middle of every tread. That leaves it half a rise
        // proud of the floor at the foot, so the flight is extended backwards
        // until the line has dropped below the slab: the capsule then meets a
        // slope rather than a lip, and walks on without a hop.
        const lead = StructureBuilder.STAIR_LEAD_IN;
        const back = lead * Math.cos(pitch);
        const slopeLength = Math.hypot(stair.run, rise) + lead;

        // Midpoint of the extended run, and the nosing height there.
        const midZ = (stair.run - back) / 2;
        const midY = (rise / stair.run) * midZ + stepRise / 2;

        const ramp = new THREE.Mesh(new THREE.BoxGeometry(stair.width, slabDepth, slopeLength));
        ramp.rotation.x = -pitch;
        // Sink the slab half its thickness along the slope normal so its top
        // face, not its centre, lies on the nosing line.
        ramp.position.set(
            0,
            midY - (slabDepth / 2) * Math.cos(pitch),
            midZ + (slabDepth / 2) * Math.sin(pitch)
        );
        collider.add(ramp);

        const surfaces = [
            {
                id: `stairs:${stair.id}`,
                kind: "floor",
                meshes: treads,
                // Moulded treads are one mesh of their own; boxes carry
                // the tread finish on their top face only.
                ...(moulded ? {} : { slot: FACE.py }),
                label: "Stair treads",
                finish: stair.finish,
            },
        ];

        return { group, collider, surfaces };
    }

    /**
     * Treads from the kit, each with a bullnosed nosing over the riser
     * below, on steps solid down to the flight's foot. The treads are one
     * mesh, textured in metres like the floors, so the finish picker swaps
     * them together.
     *
     * @returns {THREE.Mesh[]} the tread mesh, for the finish picker
     */
    addTreads(group, stair, treadMaterial, riserMaterial) {
        const going = stair.run / stair.steps;
        const stepRise = (stair.top_height - stair.base_height) / stair.steps;
        const { board = 0.032, nosing = 0.025 } = this.kit.meta("stair_tread");
        const height = this.kit.size("stair_tread").y;

        const parts = [];
        for (let i = 0; i < stair.steps; i++) {
            const top = (i + 1) * stepRise;
            const step = new THREE.Mesh(this.track(new THREE.BoxGeometry(stair.width, top - board, going)), riserMaterial);
            step.position.set(0, (top - board) / 2, i * going + going / 2);
            step.castShadow = true;
            step.receiveShadow = true;
            group.add(step);

            parts.push(
                this.kit
                    .fit("stair_tread", stair.width, null, going + nosing)
                    .translate(0, top - height / 2, i * going + (going - nosing) / 2)
            );
        }

        const geometry = this.track(boxUVs(mergeParts(parts), this.materials.tileSize(stair.finish)));
        for (const part of parts) part.dispose();
        const treads = new THREE.Mesh(geometry, treadMaterial);
        treads.name = "treads";
        treads.castShadow = true;
        treads.receiveShadow = true;
        treads.userData = {
            kind: "surface",
            surfaceId: `stairs:${stair.id}`,
            surfaceKind: "floor",
            label: "Stair treads",
            finish: stair.finish,
        };
        group.add(treads);
        return [treads];
    }

    /**
     * A flight's joinery from the kit: a closed string up each side, and on
     * each open side (`sides`, ±1 for local ±X) a capping on the string,
     * turned balusters two to a tread, a moulded handrail 0.9 m over the
     * nosings, and a newel at the foot and the head.
     */
    flightJoinery(stair, sides) {
        const kit = this.kit;
        const rise = stair.top_height - stair.base_height;
        const { run, width } = stair;
        const going = run / stair.steps;
        const stepRise = rise / stair.steps;
        const slope = rise / run;
        const pitch = Math.atan2(rise, run);
        const cos = Math.cos(pitch);
        // Through the treads' nosings.
        const pitchLine = (z) => stepRise + z * slope;

        // The strings stand a little proud of the flight, so the ends of the
        // treads and steps die into them rather than sharing their face.
        const parts = [];
        for (const side of [1, -1]) parts.push(this.stringGeometry(stair, side * (width / 2 - STRING_T / 2 + 0.005)));

        const rail = kit.size("handrail");
        const capping = kit.size("base_rail");
        const pin = kit.size("baluster").x / 2;
        const plough = kit.meta("handrail").plough ?? 0.008;
        // Where the parts' centre lines run, above the pitch line.
        const railLift = RAIL_ABOVE_NOSING - rail.y / 2 / cos;
        const cappingLift = STRING_ABOVE + capping.y / 2 / cos;

        // A length of moulding from the kit, laid up the pitch from z0 to z1.
        const raked = (name, z0, z1, lift, x) =>
            kit
                .fit(name, (z1 - z0) / cos, null, null)
                .rotateY(-Math.PI / 2)
                .rotateX(-pitch)
                .translate(x, pitchLine((z0 + z1) / 2) + lift, (z0 + z1) / 2);

        const foot = -0.025;
        const head = run - 0.045;
        for (const side of sides) {
            // The balustrade stands over the string, flush with the flight's edge.
            const x = side * (width / 2 - 0.032);
            parts.push(raked("handrail", foot, head, railLift, x));
            parts.push(raked("base_rail", foot, head, cappingLift, x));

            // Balusters, housed into the capping below and the handrail's
            // groove above; square-ended, so each runs on far enough for its
            // corners to stay buried on the rake.
            const bottom = STRING_ABOVE + capping.y / cos - pin * slope;
            const top = railLift - rail.y / 2 / cos + plough + pin * slope;
            for (let i = 0; i < stair.steps; i++) {
                for (const f of [0.28, 0.72]) {
                    const z = (i + f) * going;
                    if (z < foot + 0.06 || z > head - 0.06) continue;
                    parts.push(kit.fit("baluster", null, top - bottom, null).translate(x, pitchLine(z) + (bottom + top) / 2, z));
                }
            }

            // Newels: from the floor at the foot, and at the head from
            // under the landing to clear both this rail and the landing's.
            const footTop = pitchLine(foot) + RAIL_ABOVE_NOSING + NEWEL_OVER_RAIL;
            parts.push(kit.fit("newel", null, footTop, null).translate(x, footTop / 2, foot));
            const headTop = Math.max(pitchLine(head) + RAIL_ABOVE_NOSING, rise + RAIL_HEIGHT) + NEWEL_OVER_RAIL;
            const headBottom = rise - 0.15;
            parts.push(kit.fit("newel", null, headTop - headBottom, null).translate(x, (headTop + headBottom) / 2, head));
        }
        return parts;
    }

    /** The invisible panel up an open side of a flight that stops a fall. */
    flightGuard(stair, x) {
        const rise = stair.top_height - stair.base_height;
        const pitch = Math.atan2(rise, stair.run);
        const guard = this.blocker(0.06, RAIL_HEIGHT, Math.hypot(stair.run, rise), "Balustrade");
        guard.rotation.x = -pitch;
        guard.position.set(x, rise / 2 + RAIL_HEIGHT / 2, stair.run / 2);
        return guard;
    }

    /**
     * A closed string: the board each side of a flight that its treads and
     * risers are housed into. It follows the pitch a little above the
     * nosings, is cut level on the floor at the foot, and at the head runs
     * level with a landing's skirting before dropping into the floor.
     */
    stringGeometry(stair, x) {
        const rise = stair.top_height - stair.base_height;
        const { run } = stair;
        const stepRise = rise / stair.steps;
        const slope = rise / run;
        const top = (z) => stepRise + z * slope + STRING_ABOVE;
        const drop = STRING_DEPTH / Math.cos(Math.atan2(rise, run));

        const foot = -0.045;
        const level = rise + SKIRT_H;
        const levelFrom = (level - stepRise - STRING_ABOVE) / slope;
        const floorAt = (drop - stepRise - STRING_ABOVE) / slope;

        // The outline in the flight's side view, as (z, y).
        const outline = [[foot, top(foot)]];
        if (levelFrom < run) outline.push([levelFrom, level], [run, level]);
        else outline.push([run, top(run)]);
        outline.push([run, top(run) - drop]);
        if (floorAt > foot) outline.push([floorAt, 0], [foot, 0]);
        else outline.push([foot, top(foot) - drop]);

        const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y))), {
            depth: STRING_T - 0.006,
            bevelEnabled: true,
            bevelThickness: 0.003,
            bevelSize: 0.003,
            bevelSegments: 2,
            curveSegments: 1,
        });
        // Extruded along its own Z; turn that onto the flight's X.
        return geometry.rotateY(-Math.PI / 2).translate(x + STRING_T / 2 - 0.003, 0, 0);
    }

    // ------------------------------------------------------------------
    // Landing rails
    // ------------------------------------------------------------------

    /**
     * Rails round the open sides of a floor opening — `hole.rails`, a list
     * of "x-", "x+", "z-" and "z+" in the opening's own frame — standing on
     * the floor it is cut through, 5 cm back from its edge. Newels at the
     * corners, spindles between, a handrail on top, and an invisible panel
     * along each side for the collision.
     *
     * @returns {THREE.Group|null}
     */
    buildRails(hole) {
        if (!hole.rails?.length) return null;

        const group = new THREE.Group();
        group.name = `rails:${hole.id}`;
        group.userData = { kind: "rail", holeId: hole.id };
        group.position.set(hole.position[0], hole.elevation, hole.position[1]);
        group.rotation.y = THREE.MathUtils.degToRad(hole.yaw || 0);

        const H = RAIL_HEIGHT;
        const hw = hole.width / 2 + 0.05;
        const hd = hole.depth / 2 + 0.05;
        const ends = {
            "x-": [[-hw, -hd], [-hw, hd]],
            "x+": [[hw, -hd], [hw, hd]],
            "z-": [[-hw, -hd], [hw, -hd]],
            "z+": [[-hw, hd], [hw, hd]],
        };

        const kit = ["newel", "baluster", "handrail", "base_rail"].every((name) => this.kit.has(name)) ? this.kit : null;
        const rail = kit?.size("handrail");
        const base = kit?.size("base_rail");
        const plough = kit?.meta("handrail").plough ?? 0.008;
        // A length of moulding from the kit, laid level along a side.
        const level = (name, length, alongX, x, y, z) => {
            const geometry = kit.fit(name, length, null, null);
            if (!alongX) geometry.rotateY(Math.PI / 2);
            return geometry.translate(x, y, z);
        };

        const parts = [];
        const newels = new Set();
        for (const side of hole.rails) {
            const [[x0, z0], [x1, z1]] = ends[side];
            const length = Math.hypot(x1 - x0, z1 - z0);
            const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
            const mx = (x0 + x1) / 2;
            const mz = (z0 + z1) / 2;

            // A corner shared by two sides gets one newel, not two.
            for (const [x, z] of [[x0, z0], [x1, z1]]) {
                const key = `${x.toFixed(3)},${z.toFixed(3)}`;
                if (newels.has(key)) continue;
                newels.add(key);
                const height = kit ? H + 0.02 + NEWEL_OVER_RAIL : H + 0.05;
                parts.push(kit ? kit.fit("newel", null, height, null).translate(x, height / 2, z) : boxAt(0.09, height, 0.09, x, height / 2, z));
            }

            // Balusters between, on a base rail on the floor and housed into
            // the handrail's groove; boxes without the kit.
            const railBottom = H + 0.02 - (rail?.y ?? 0.06);
            const bottom = kit ? base.y - 0.004 : 0;
            const top = kit ? railBottom + plough - 0.002 : H - 0.04;
            const count = Math.max(2, Math.round(length / 0.115));
            for (let i = 1; i < count; i++) {
                const t = i / count;
                const x = x0 + (x1 - x0) * t;
                const z = z0 + (z1 - z0) * t;
                parts.push(
                    kit
                        ? kit.fit("baluster", null, top - bottom, null).translate(x, (bottom + top) / 2, z)
                        : boxAt(0.032, top - bottom, 0.032, x, (bottom + top) / 2, z)
                );
            }
            if (kit) {
                parts.push(level("handrail", length, alongX, mx, railBottom + rail.y / 2, mz));
                parts.push(level("base_rail", length, alongX, mx, base.y / 2, mz));
            } else {
                parts.push(boxAt(alongX ? length : 0.064, 0.06, alongX ? 0.064 : length, mx, H - 0.01, mz));
            }

            const guard = this.blocker(alongX ? length : 0.06, H, alongX ? 0.06 : length, "Stair rail");
            guard.position.set(mx, H / 2, mz);
            group.add(guard);
        }

        group.add(this.mergedDecor(parts, this.materials.getTrim("trim_white"), "landing-rail"));
        return group;
    }

    // ------------------------------------------------------------------
    // Ground
    // ------------------------------------------------------------------

    buildGround(spec) {
        const geometry = this.track(new THREE.PlaneGeometry(spec.size, spec.size));
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(spec.color),
            roughness: spec.roughness ?? 1,
            metalness: 0,
        });
        this.disposables.add({ dispose: () => material.dispose() });

        const ground = new THREE.Mesh(geometry, material);
        ground.rotation.x = -Math.PI / 2;
        // Well clear of any site slabs laid on top of it at y = 0, which at
        // a couple of centimetres would z-fight across a 200 m plane.
        ground.position.y = -0.15;
        ground.receiveShadow = true;
        ground.name = "ground";
        return ground;
    }

    dispose() {
        for (const item of this.disposables) item.dispose();
        this.disposables.clear();
        for (const material of this.doubleSidedCache.values()) material.dispose();
        this.doubleSidedCache.clear();
    }
}

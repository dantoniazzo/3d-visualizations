import * as THREE from "three";

import Door from "../Door.js";
import { FINISHES } from "../../../../shared/catalog.js";

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
 */

/** BoxGeometry lays its UVs out in this face order. */
const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

/** Heading in radians for a stair's climb direction. */
const HEADINGS = { north: 0, south: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };

export default class StructureBuilder {
    /** How far a stair's collision ramp runs on past the bottom step. */
    static STAIR_LEAD_IN = 0.6;

    constructor(materials) {
        this.materials = materials;
        this.disposables = [];
    }

    track(geometry) {
        this.disposables.push(geometry);
        return geometry;
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

    // ------------------------------------------------------------------
    // Rooms
    // ------------------------------------------------------------------

    /** A copy of a surface material that also renders from behind. */
    doubleSided(finishId, kind) {
        const material = this.materials.getSurface(finishId, kind).clone();
        material.side = THREE.DoubleSide;
        this.disposables.push({ dispose: () => material.dispose() });
        return material;
    }

    /**
     * Floor slab and optional ceiling for one room polygon.
     *
     * `room.voids` are holes cut through both slabs — a stairwell needs the
     * floor open on the storey it rises into and the ceiling open on the
     * storey it rises from, and one hole per room serves whichever of those
     * the room happens to be.
     *
     * @returns {{group: THREE.Group, surfaces: Array}}
     */
    buildRoom(room) {
        const group = new THREE.Group();
        group.name = `room:${room.id}`;
        group.userData = { kind: "room", id: room.id, name: room.name };

        const surfaces = [];

        // ShapeGeometry is built in XY then laid flat by rotating -90° about
        // X, which maps shape-Y to world -Z. Negating Z up front means the
        // slab lands on the polygon with its normal pointing up — which the
        // collision octree relies on to tell a floor from a ceiling.
        const points = room.polygon.map(([x, z]) => new THREE.Vector2(x, -z));
        const shape = new THREE.Shape(points);

        for (const hole of room.voids || []) {
            shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
        }

        // Outdoor slabs — yards, drives, roads — are floors like any other,
        // and it is the finish that says so.
        const floorKind = FINISHES[room.floor_finish]?.kind === "ground" ? "ground" : "floor";

        // ShapeGeometry emits UVs in metres, so tiling is a simple divide.
        const floorGeometry = this.track(new THREE.ShapeGeometry(shape));
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
            const ceilingGeometry = this.track(new THREE.ShapeGeometry(shape));
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

            if (opening.type === "arch") {
                this.addArchHead(group, opening, wall, half, [reveal, reveal, reveal, reveal, faceA, faceB]);
            } else if (top < wall.height - 0.001) {
                addPanel(start, end, top, wall.height);
            }

            if (opening.sill <= 0.001) {
                this.addThreshold(group, opening, wall, half, reveal);
            }

            if (opening.type === "door") {
                const door = new Door(opening, wall, opening.offset - half, this.materials);
                // Deliberately NOT parented yet. The wall goes into the
                // static collision octree, and a leaf baked in there at its
                // closed position would block the doorway forever. The
                // caller attaches doors once the octree is built; from then
                // on they collide through Door.resolveCapsule instead.
                door.wallGroup = group;
                doors.push(door);
            } else if (opening.type === "window") {
                this.addWindow(group, opening, wall, half);
            }

            cursor = end;
        }

        addPanel(cursor, length, 0, wall.height);

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

    /** Semicircular head for an arched opening, built from slats. */
    addArchHead(group, opening, wall, half, materials) {
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
    addThreshold(group, opening, wall, half, material) {
        const overlap = 0.03;
        const geometry = this.track(
            new THREE.BoxGeometry(opening.width, 0.06, wall.thickness + overlap * 2)
        );

        const threshold = new THREE.Mesh(geometry, material);
        threshold.position.set(opening.offset - half, -0.031, 0);
        threshold.receiveShadow = true;
        group.add(threshold);
    }

    /** Glazing and frame inside a window opening. */
    addWindow(group, opening, wall, half) {
        const frameMaterial = this.materials.getTrim(opening.frame || "trim_white");

        const glass = new THREE.Mesh(
            this.track(new THREE.BoxGeometry(opening.width - 0.08, opening.height - 0.08, 0.015)),
            this.materials.getTrim("glass", "glass")
        );
        glass.position.set(opening.offset - half, opening.sill + opening.height / 2, 0);
        group.add(glass);

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
            frame.add(bar);
        }
        frame.position.set(opening.offset - half, opening.sill + opening.height / 2, 0);
        group.add(frame);
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
        const heading = HEADINGS[stair.direction] ?? 0;
        group.position.set(stair.start[0], stair.base_height, stair.start[1]);
        group.rotation.y = heading;

        const rise = stair.top_height - stair.base_height;
        const steps = stair.steps;
        const going = stair.run / steps;
        const stepRise = rise / steps;

        const tread = this.materials.getSurface(stair.finish, "floor");
        const riser = this.materials.getTrim(stair.riser || "trim_white");
        const treads = [];

        for (let i = 0; i < steps; i++) {
            // Each step is solid to the ground, so the flight reads as a
            // closed string rather than a floating ladder.
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

        // --- the ramp the player actually walks on ------------------------
        const collider = new THREE.Group();
        collider.name = `stairs-collider:${stair.id}`;
        collider.position.copy(group.position);
        collider.rotation.copy(group.rotation);

        const pitch = Math.atan2(rise, stair.run);
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
                slot: FACE.py,
                label: "Stair treads",
                finish: stair.finish,
            },
        ];

        return { group, collider, surfaces };
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
        this.disposables.push({ dispose: () => material.dispose() });

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
        this.disposables.length = 0;
    }
}

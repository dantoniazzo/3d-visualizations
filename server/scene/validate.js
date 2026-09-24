import {
    FINISHES,
    DEFAULT_FINISH,
    TRIM_MATERIALS,
    ENVIRONMENT_PRESETS,
    OPENING_TYPES,
    DOOR_TYPES,
    DOOR_SWINGS,
    GROUND_TYPES,
    ROOF_TYPES,
    STAIR_DIRECTIONS,
} from "../../shared/catalog.js";

/**
 * Every scene that reaches the builders passes through here: hand-authored
 * JSON, the seed script, and each save from the in-app editor. Array
 * lengths, sane dimensions, unique ids and openings that actually fit are
 * all checked, and the repairs are returned so the caller can surface them.
 *
 * It also migrates older specs forward. Stairwells used to be drawn as
 * `voids` on room polygons; they are now `floor_openings`, which the editor
 * can move, resize and tie to the flight they serve.
 */

const OPENING_SET = new Set(OPENING_TYPES);
const SWING_SET = new Set(DOOR_SWINGS);
const DIRECTION_SET = new Set(STAIR_DIRECTIONS);
const TRIM_SIDES = new Set(["a", "b", "both"]);
const BALUSTRADE_SIDES = new Set(["left", "right", "both"]);
const RAIL_SIDES = new Set(["x-", "x+", "z-", "z+"]);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Stair headings the older specs used, as a yaw in degrees. */
const DIRECTION_YAW = { north: 0, south: 180, east: 90, west: -90 };

function num(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function vec(value, length, fallback) {
    const out = [];
    for (let i = 0; i < length; i++) {
        out.push(num(Array.isArray(value) ? value[i] : undefined, fallback[i]));
    }
    return out;
}

/**
 * @param {string|string[]} kind  a surface kind, or the kinds that are
 *   acceptable here — a room floor takes indoor `floor` finishes or outdoor
 *   `ground` ones, and which it is decides whether the slab is a room or a
 *   yard. The first entry is the fallback's kind.
 */
function finish(value, kind, notes, where) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    if (kinds.includes(FINISHES[value]?.kind)) return value;
    if (value === "none" && kinds.includes("ceiling")) return "none";

    const fallback = DEFAULT_FINISH[kinds[0]];
    if (value !== undefined) {
        notes.push(`${where}: "${value}" is not a ${kinds.join(" or ")} finish, using ${fallback}.`);
    }
    return fallback;
}

/** An ordered, non-degenerate list of [x, z] points. */
function polygon(value) {
    return (Array.isArray(value) ? value : [])
        .map((p) => vec(p, 2, [0, 0]))
        .filter((p) => p.every(Number.isFinite));
}

function trim(value, fallback) {
    return TRIM_MATERIALS[value] ? value : fallback;
}

function uniqueId(candidate, prefix, used, index) {
    let id =
        typeof candidate === "string" && candidate.trim()
            ? candidate.trim().replace(/\s+/g, "-")
            : `${prefix}-${index}`;
    if (used.has(id)) {
        let n = 2;
        while (used.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
    }
    used.add(id);
    return id;
}

export function validateScene(raw) {
    const notes = [];
    if (!raw || typeof raw !== "object") {
        throw new Error("Scene spec is not an object.");
    }

    const scene = {
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled property",
        summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    };

    // --- environment -----------------------------------------------------
    const env = raw.environment || {};
    const preset = ENVIRONMENT_PRESETS[env.preset] ? env.preset : "interior_day";
    if (env.preset && preset !== env.preset) {
        notes.push(`environment: unknown preset "${env.preset}", using interior_day.`);
    }
    const ground = GROUND_TYPES[env.ground] ? env.ground : "none";
    scene.environment = {
        preset,
        ground,
        ground_size: ground === "none" ? 0 : clamp(num(env.ground_size, 60), 10, 500),
    };

    // --- imported model (authored scenes only) ---------------------------
    if (raw.model && typeof raw.model === "object") {
        const url = typeof raw.model.url === "string" ? raw.model.url.trim() : "";

        if (!/^\/[\w\-./]+\.(glb|gltf)$/i.test(url) || url.includes("..")) {
            notes.push(`model: rejected url "${url}", ignoring the imported model.`);
        } else {
            scene.model = {
                url,
                scale: clamp(num(raw.model.scale, 1), 0.00001, 10000),
                offset: vec(raw.model.offset, 3, [0, 0, 0]),
                rotation: num(raw.model.rotation, 0),
                roomsAreMetadata: true,
                collision: ["mesh", "box", "none", "auto"].includes(raw.model.collision)
                    ? raw.model.collision
                    : "auto",
                // Node-name prefixes kept out of the collision octree. Used
                // for geometry the spec collides another way — stair treads,
                // whose ramps come from `stairs` instead.
                collision_exclude: (Array.isArray(raw.model.collision_exclude)
                    ? raw.model.collision_exclude
                    : []
                ).filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim()),
                // Node-name prefixes that make up the fixed building. When
                // present, every other top-level node in the model is lifted
                // out as a movable piece; when absent the whole model is fixed.
                fixed_nodes: (Array.isArray(raw.model.fixed_nodes) ? raw.model.fixed_nodes : [])
                    .filter((n) => typeof n === "string" && n.trim())
                    .map((n) => n.trim()),
                // Set once those pieces have been written into `furniture`, so
                // one the editor deleted stays deleted.
                parts_extracted: raw.model.parts_extracted === true,
            };
            // "furnishings": the model brings only furniture, every node of
            // which becomes a movable piece; the building is the spec's own
            // rooms, walls and roofs, built — and editable — like any other.
            if (raw.model.role === "furnishings") scene.model.role = "furnishings";

            const override = raw.model.material;
            if (override && typeof override === "object") {
                scene.model.material = {
                    color: /^#[0-9a-f]{6}$/i.test(override.color) ? override.color : "#d9d5cf",
                    roughness: clamp(num(override.roughness, 0.82), 0, 1),
                    metalness: clamp(num(override.metalness, 0), 0, 1),
                };
            }
        }
    }

    // --- rooms -----------------------------------------------------------
    const roomIds = new Set();
    scene.rooms = (Array.isArray(raw.rooms) ? raw.rooms : []).flatMap((r, i) => {
        const outline = polygon(r?.polygon);

        if (outline.length < 3) {
            notes.push(`rooms[${i}]: polygon had ${outline.length} points, dropped the room.`);
            return [];
        }

        const voids = (Array.isArray(r?.voids) ? r.voids : []).flatMap((v, j) => {
            const hole = polygon(v);
            if (hole.length < 3) {
                notes.push(`rooms[${i}].voids[${j}]: fewer than 3 points, dropped.`);
                return [];
            }
            return [hole];
        });

        const floorFinish = finish(
            r.floor_finish,
            ["floor", "ground"],
            notes,
            `rooms[${i}].floor`
        );

        return [
            {
                id: uniqueId(r.id, "room", roomIds, i),
                name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : `Room ${i + 1}`,
                polygon: outline,
                voids,
                floor_finish: floorFinish,
                ceiling_finish:
                    FINISHES[floorFinish].kind === "ground"
                        ? "none"
                        : finish(r.ceiling_finish, "ceiling", notes, `rooms[${i}].ceiling`),
                // Outdoor slabs are flat ground: they carry no ceiling and no
                // storey height, so the usual 1.9 m minimum does not apply.
                height:
                    FINISHES[floorFinish].kind === "ground"
                        ? clamp(num(r.height, 0.05), 0.01, 20)
                        : clamp(num(r.height, 2.5), 1.9, 20),
                elevation: clamp(num(r.elevation, 0), -20, 60),
            },
        ];
    });

    // --- walls -----------------------------------------------------------
    const wallIds = new Set();
    const openingIds = new Set();

    scene.walls = (Array.isArray(raw.walls) ? raw.walls : []).flatMap((w, i) => {
        const start = vec(w?.start, 2, [0, 0]);
        const end = vec(w?.end, 2, [0, 0]);
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);

        if (length < 0.05) {
            notes.push(`walls[${i}]: zero-length wall dropped.`);
            return [];
        }

        const height = clamp(num(w.height, 2.5), 0.3, 20);
        const wallFinish = finish(w.finish, "wall", notes, `walls[${i}]`);

        // Openings are placed in order and must not overlap each other or
        // run off the end of the wall.
        const sorted = (Array.isArray(w.openings) ? w.openings : [])
            .map((o) => ({ ...o, offset: num(o?.offset, length / 2) }))
            .sort((a, b) => a.offset - b.offset);

        let previousEnd = 0;
        const openings = sorted.flatMap((o, j) => {
            const type = OPENING_SET.has(o?.type) ? o.type : "doorway";
            const oHeight = clamp(num(o?.height, 2.05), 0.2, height);
            const sill = clamp(num(o?.sill, type === "window" ? 0.9 : 0), 0, Math.max(0, height - oHeight));
            const width = clamp(num(o?.width, 0.85), 0.2, length);

            const offset = clamp(o.offset, width / 2, length - width / 2);
            const from = offset - width / 2;

            if (from < previousEnd - 1e-6) {
                notes.push(`walls[${i}].openings[${j}]: overlapped the previous opening, dropped.`);
                return [];
            }
            if (offset + width / 2 > length + 1e-6) {
                notes.push(`walls[${i}].openings[${j}]: did not fit on the wall, dropped.`);
                return [];
            }
            previousEnd = offset + width / 2;

            const entry = {
                id: uniqueId(o?.id, `opening-${i}`, openingIds, j),
                type,
                offset,
                width,
                height: oHeight,
                sill,
            };

            if (type === "door") {
                const doorType = DOOR_TYPES[o?.door?.type] ? o.door.type : "hinged";
                const swing = SWING_SET.has(o?.door?.swing) ? o.door.swing : "inward_right";
                entry.door = {
                    type: doorType,
                    swing,
                    leaf: trim(o?.door?.leaf, "trim_white"),
                    frame: trim(o?.door?.frame, "trim_white"),
                    handle: trim(o?.door?.handle, "metal_brass"),
                };
            }
            if (type === "window") {
                entry.frame = trim(o?.frame, "trim_white");
                // Glazing bars dividing it into panes across and up, and a
                // cill board under it inside and out.
                if (Array.isArray(o?.panes)) {
                    entry.panes = [0, 1].map((k) => Math.round(clamp(num(o.panes[k], 1), 1, 8)));
                }
                if (o?.cill === true) entry.cill = true;
            }

            return [entry];
        });

        return [
            {
                id: uniqueId(w.id, "wall", wallIds, i),
                start,
                end,
                height,
                thickness: clamp(num(w.thickness, 0.12), 0.02, 2),
                finish: wallFinish,
                finish_back: w.finish_back
                    ? finish(w.finish_back, "wall", notes, `walls[${i}].back`)
                    : wallFinish,
                reveal: trim(w.reveal, "trim_white"),
                base_height: clamp(num(w.base_height, 0), -20, 60),
                openings,
                // Skirting, and casings round its doors: on side A, side B or
                // both, in the reveal's trim.
                ...(TRIM_SIDES.has(w.trims) ? { trims: w.trims } : {}),
            },
        ];
    });

    // --- roofs -----------------------------------------------------------
    const roofIds = new Set();
    scene.roofs = (Array.isArray(raw.roofs) ? raw.roofs : []).flatMap((r, i) => {
        const footprint = polygon(r?.footprint);
        if (footprint.length < 3) {
            notes.push(`roofs[${i}]: footprint had ${footprint.length} points, dropped.`);
            return [];
        }

        const type = ROOF_TYPES[r?.type] ? r.type : "gable";
        const base = clamp(num(r?.base_height, 2.6), -20, 80);

        return [
            {
                id: uniqueId(r?.id, "roof", roofIds, i),
                type,
                footprint,
                base_height: base,
                // A ridge below its own eaves would build inside out.
                ridge_height: Math.max(base + 0.2, clamp(num(r?.ridge_height, base + 2), -20, 90)),
                ridge_axis: r?.ridge_axis === "x" ? "x" : "z",
                finish: finish(r?.finish, "roof", notes, `roofs[${i}]`),
                gable_finish: finish(r?.gable_finish, "wall", notes, `roofs[${i}].gable`),
                overhang: clamp(num(r?.overhang, 0.4), 0, 3),
                thickness: clamp(num(r?.thickness, 0.18), 0.02, 1),
                soffit: trim(r?.soffit, "trim_white"),
            },
        ];
    });

    // --- stairs ----------------------------------------------------------
    const stairIds = new Set();
    scene.stairs = (Array.isArray(raw.stairs) ? raw.stairs : []).flatMap((s, i) => {
        const base = clamp(num(s?.base_height, 0), -20, 60);
        const top = clamp(num(s?.top_height, base + 2.8), -20, 60);

        if (top - base < 0.2) {
            notes.push(`stairs[${i}]: rises less than 0.2 m, dropped.`);
            return [];
        }

        const run = clamp(num(s?.run, (top - base) * 1.5), 0.4, 40);
        // Roughly 0.19 m per rise is a comfortable domestic stair; the clamp
        // keeps a bad step count from producing a ladder or a ramp.
        const steps = Math.round(clamp(num(s?.steps, (top - base) / 0.19), 2, 60));

        const direction = DIRECTION_SET.has(s?.direction) ? s.direction : "north";

        return [
            {
                id: uniqueId(s?.id, "stair", stairIds, i),
                start: vec(s?.start, 2, [0, 0]),
                direction,
                // Free heading in degrees; the editor turns flights to any
                // angle. `direction` is kept for older readers.
                yaw: num(s?.yaw, DIRECTION_YAW[direction]),
                width: clamp(num(s?.width, 1.05), 0.6, 6),
                base_height: base,
                top_height: top,
                run,
                steps,
                finish: finish(s?.finish, "floor", notes, `stairs[${i}]`),
                riser: trim(s?.riser, "trim_white"),
                // One of an imported model's own flights: it draws the treads,
                // the spec only makes them walkable.
                ...(s?.model === true ? { model: true } : {}),
                // Which side, climbing, has newels, spindles and a handrail.
                ...(BALUSTRADE_SIDES.has(s?.balustrade) ? { balustrade: s.balustrade } : {}),
            },
        ];
    });

    // --- floor openings --------------------------------------------------
    // Rectangular holes through every slab at `elevation`: the floors of
    // the rooms standing there and the ceilings of the rooms below.
    const openingIdsFloor = new Set();
    const stairIdSet = new Set(scene.stairs.map((st) => st.id));
    scene.floor_openings = (Array.isArray(raw.floor_openings) ? raw.floor_openings : []).flatMap(
        (o, i) => {
            const entry = {
                id: uniqueId(o?.id, "hole", openingIdsFloor, i),
                position: vec(o?.position, 2, [0, 0]),
                elevation: clamp(num(o?.elevation, 2.6), -20, 60),
                width: clamp(num(o?.width, 1.2), 0.2, 30),
                depth: clamp(num(o?.depth, 2), 0.2, 30),
                yaw: num(o?.yaw, 0),
            };
            if (typeof o?.stair_id === "string" && stairIdSet.has(o.stair_id)) {
                entry.stair_id = o.stair_id;
            }
            // Sides guarded by a landing rail, in the opening's own frame.
            const rails = (Array.isArray(o?.rails) ? o.rails : []).filter((side) => RAIL_SIDES.has(side));
            if (rails.length) entry.rails = [...new Set(rails)];
            return [entry];
        }
    );

    if (!scene.model || scene.model.role === "furnishings") migrateStairVoids(scene, openingIdsFloor, notes);

    // --- standalone doors (authored, for imported-model scenes) ----------
    // A model brings its walls as baked mesh, so its doors cannot ride on
    // wall specs; these place a working Door directly at a plan position.
    const freeDoorIds = new Set();
    scene.doors = (Array.isArray(raw.doors) ? raw.doors : []).flatMap((d, i) => {
        const width = clamp(num(d?.width, 0.85), 0.3, 3);
        const height = clamp(num(d?.height, 2.04), 0.5, 4);
        return [
            {
                id: uniqueId(d?.id, "door", freeDoorIds, i),
                position: vec(d?.position, 2, [0, 0]),
                elevation: clamp(num(d?.elevation, 0), -20, 60),
                yaw: num(d?.yaw, 0),
                width,
                height,
                thickness: clamp(num(d?.thickness, 0.1), 0.02, 2),
                door: {
                    type: DOOR_TYPES[d?.door?.type] ? d.door.type : "hinged",
                    swing: SWING_SET.has(d?.door?.swing) ? d.door.swing : "inward_right",
                    leaf: trim(d?.door?.leaf, "trim_white"),
                    frame: trim(d?.door?.frame, "trim_white"),
                    handle: trim(d?.door?.handle, "metal_brass"),
                    // "none" when the model's mesh already carries the casing.
                    lining: d?.door?.lining === "none" ? "none" : "full",
                },
            },
        ];
    });

    // --- vehicles (authored) ---------------------------------------------
    const vehicleIds = new Set();
    scene.vehicles = (Array.isArray(raw.vehicles) ? raw.vehicles : []).flatMap((v, i) => [
        {
            id: uniqueId(v?.id, "car", vehicleIds, i),
            position: vec(v?.position, 2, [0, 0]),
            elevation: clamp(num(v?.elevation, 0), -20, 60),
            yaw: num(v?.yaw, 0),
        },
    ]);

    // --- furniture placements (authored / user-placed) -------------------
    const furnitureIds = new Set();
    scene.furniture = (Array.isArray(raw.furniture) ? raw.furniture : []).flatMap((f, i) => {
        const catalogId = typeof f?.catalog_id === "string" ? f.catalog_id.trim() : "";
        if (!catalogId) {
            notes.push(`furniture[${i}]: missing catalog_id, dropped.`);
            return [];
        }
        return [
            {
                id: uniqueId(f?.id, "item", furnitureIds, i),
                catalog_id: catalogId,
                position: vec(f?.position, 3, [0, 0, 0]).map((n) => clamp(n, -1000, 1000)),
                rotation: num(f?.rotation, 0),
                scale: clamp(num(f?.scale, 1), 0.05, 20),
            },
        ];
    });

    // --- per-surface finish overrides ------------------------------------
    // Written by the in-world texture picker; keyed by surface id.
    scene.finishes = {};
    const overrides = raw.finishes && typeof raw.finishes === "object" ? raw.finishes : {};
    for (const [surfaceId, value] of Object.entries(overrides)) {
        if (typeof value !== "string" || !FINISHES[value]) {
            notes.push(`finishes["${surfaceId}"]: unknown finish "${value}", ignored.`);
            continue;
        }
        scene.finishes[surfaceId] = value;
    }

    // --- spawns ----------------------------------------------------------
    scene.spawns = (Array.isArray(raw.spawns) ? raw.spawns : [])
        .map((s, i) => ({
            position: vec(s?.position, 3, [0, 0, 0]),
            yaw: num(s?.yaw, 0),
            label: typeof s?.label === "string" && s.label.trim() ? s.label.trim() : `Entry ${i + 1}`,
        }))
        .filter((s) => s.position.every(Number.isFinite));

    if (scene.spawns.length === 0) {
        const first = scene.rooms[0];
        const centre = first
            ? first.polygon
                  .reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
                  .map((n) => n / first.polygon.length)
            : [0, 0];
        scene.spawns = [
            {
                position: [centre[0], first ? first.elevation : 0, centre[1]],
                yaw: 0,
                label: "Centre",
            },
        ];
        notes.push("spawns: none supplied, placed one in the middle of the first room.");
    }

    if (!scene.model && scene.rooms.length === 0 && scene.walls.length === 0) {
        throw new Error("Scene spec is empty — no rooms or walls survived validation.");
    }

    return { scene, notes };
}

// ---------------------------------------------------------------------
// Migration: room voids -> floor openings
// ---------------------------------------------------------------------

/** World-space corners of a flight's plan footprint. */
export function stairFootprint(stair) {
    const yaw = (stair.yaw * Math.PI) / 180;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const half = stair.width / 2;
    return [
        [-half, 0],
        [half, 0],
        [half, stair.run],
        [-half, stair.run],
    ].map(([x, z]) => [
        stair.start[0] + x * cos + z * sin,
        stair.start[1] - x * sin + z * cos,
    ]);
}

function bounds(points) {
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

function overlapArea(a, b) {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const d = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return w > 0 && d > 0 ? w * d : 0;
}

/**
 * A stairwell used to be a `void` repeated on the room below (for its
 * ceiling) and the room above (for its floor). Each one that sits over a
 * flight becomes a single floor opening at the flight's head, linked to it,
 * so moving the stair carries its opening along. Voids that serve no flight
 * are left as they were.
 */
function migrateStairVoids(scene, usedIds, notes) {
    let migrated = 0;

    for (const stair of scene.stairs) {
        const footprint = bounds(stairFootprint(stair));

        for (const room of scene.rooms) {
            room.voids = room.voids.filter((hole) => {
                const box = bounds(hole);
                const area = (box.x1 - box.x0) * (box.z1 - box.z0);
                if (area <= 0 || overlapArea(box, footprint) < area * 0.5) return true;

                const existing = scene.floor_openings.find(
                    (o) =>
                        Math.abs(o.elevation - stair.top_height) < 0.02 &&
                        Math.abs(o.position[0] - (box.x0 + box.x1) / 2) < 0.3 &&
                        Math.abs(o.position[1] - (box.z0 + box.z1) / 2) < 0.3
                );
                if (!existing) {
                    scene.floor_openings.push({
                        id: uniqueId(`hole-${stair.id}`, "hole", usedIds, scene.floor_openings.length),
                        position: [(box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2],
                        elevation: stair.top_height,
                        width: box.x1 - box.x0,
                        depth: box.z1 - box.z0,
                        yaw: 0,
                        stair_id: stair.id,
                    });
                    migrated++;
                }
                return false;
            });
        }
    }

    if (migrated) {
        notes.push(`floor_openings: migrated ${migrated} stairwell void(s) from room polygons.`);
    }
}

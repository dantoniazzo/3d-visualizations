import * as THREE from "three";

import { GROUND_DROP, hillHeight } from "../../../../shared/vegetation.js";
import { STREET } from "../../../../shared/neighbourhood.js";

/**
 * The neighbourhood round the plot (shared/neighbourhood.js's plan), as the
 * house's own ground and walls are: drawn, published, baked, walked on and
 * driven on.
 *
 *   - The streets: asphalt, gravel each side sloping down to the ground,
 *     and a dashed line down the middle — the plot's own road's too; the
 *     junction a square of asphalt, gravel round its corners.
 *   - Each neighbour's house, only its outside: walls, a gable roof with
 *     eaves, windows of dark glass in white frames with sills, a door, a
 *     chimney, and a path down its front garden to the street.
 *
 * Each material's pieces are one mesh. All of it is published whole
 * (Publish/Snapshot.js's keepWhole) — it is seen from the roads, which none
 * of the publish's viewpoints stand on — and baked as scenery, coarse
 * (blender/bake_public.py's density).
 *
 * @param {object} plan  planNeighbourhood's
 * @param {MaterialLibrary} materials
 * @returns {THREE.Group}
 */
export function buildNeighbourhood(plan, materials) {
    const parts = new Parts(materials);
    const groundAt = (x, z) => (plan.hills ? hillHeight(plan.hills, x, z) : -GROUND_DROP);
    for (const piece of plan.pieces) street(parts, piece.points, plan.width, groundAt);
    junction(parts, plan);
    markings(parts, [...plan.pieces.map((piece) => piece.points), plan.frontRoad.map(([x, z]) => [x, z, 0])]);
    for (const house of plan.houses) houseOf(parts, house);

    const group = parts.build();
    group.name = "neighbourhood";
    // What it is, for the publish and the bake (SceneBuilder.staticOptions).
    group.userData = { kind: "scenery", label: "Neighbourhood" };
    return group;
}

/**
 * Collision only: a wall round the world, a little inside where it fades
 * into the dark, that no one walks or drives through into it.
 */
export function buildWorldEdge(plan) {
    const geometry = new THREE.CylinderGeometry(plan.radius - 8, plan.radius - 8, 80, 64, 1, true);
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(plan.centre[0], 20, plan.centre[1]);
    mesh.updateMatrixWorld(true);
    mesh.name = "world-edge";
    mesh.userData = { label: "Edge of the world" };
    return mesh;
}

// ---------------------------------------------------------------------
// Streets
// ---------------------------------------------------------------------

/** Lift of the paint over the asphalt, and of the asphalt's gravel edge under it. */
const PAINT = 0.012;
const EDGE = 0.01;

/**
 * A street along `points` ([x, z, y]): asphalt `width` wide at its
 * heights, and gravel each side from just under its edge down to a
 * centimetre over the ground (`groundAt`).
 */
function street(parts, points, width, groundAt) {
    const half = width / 2;
    const out = half + STREET.gravel;
    const rows = points.map((point, i) => {
        const [x, z, y] = point;
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(points.length - 1, i + 1)];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        // To its left, as it runs.
        const nx = -(b[1] - a[1]) / length;
        const nz = (b[0] - a[0]) / length;
        const at = (d, h) => [x + nx * d, h, z + nz * d];
        return {
            asphalt: [at(half, y), at(-half, y)],
            left: [at(out, groundAt(x + nx * out, z + nz * out) + EDGE), at(half, y - EDGE)],
            right: [at(-half, y - EDGE), at(-out, groundAt(x - nx * out, z - nz * out) + EDGE)],
        };
    });
    parts.strip("street_tarmac", rows.map((row) => row.asphalt));
    parts.strip("street_gravel", rows.map((row) => row.left));
    parts.strip("street_gravel", rows.map((row) => row.right));
}

/** The junction: a square of asphalt where the streets cross, and gravel round its four corners. */
function junction(parts, plan) {
    const { frame, junction: j } = plan;
    const half = j.size / 2;
    const out = half + STREET.gravel;
    const at = (u, v, y) => {
        const [x, z] = frame.at(j.u + u, j.v + v);
        return [x, y, z];
    };
    parts.quad("street_tarmac", [at(-half, -half, 0), at(half, -half, 0), at(half, half, 0), at(-half, half, 0)], { world: true, up: true });
    const low = -GROUND_DROP + EDGE;
    for (const su of [-1, 1]) {
        for (const sv of [-1, 1]) {
            parts.quad(
                "street_gravel",
                [at(su * half, sv * half, -EDGE), at(su * out, sv * half, low), at(su * out, sv * out, low), at(su * half, sv * out, low)],
                { world: true, up: true }
            );
        }
    }
}

/**
 * A dashed line down the middle of each road: three metres of paint, three
 * of none — each line stopping short of its ends, so where two roads'
 * lines meet no dash lies over another (the bake would take each for
 * covered, and black).
 */
function markings(parts, lines) {
    const dash = 3;
    const gap = 3;
    const half = 0.06;
    for (const points of lines.map((line) => trimmed(line, 1.5))) {
        let travelled = 0;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (!span) continue;
            const tx = (b[0] - a[0]) / span;
            const tz = (b[1] - a[1]) / span;
            for (let t = 0; t < span; ) {
                const phase = (travelled + t) % (dash + gap);
                if (phase >= dash) {
                    t += dash + gap - phase;
                    continue;
                }
                const end = Math.min(span, t + dash - phase);
                const y0 = a[2] + ((b[2] - a[2]) * t) / span + PAINT;
                const y1 = a[2] + ((b[2] - a[2]) * end) / span + PAINT;
                const p0 = [a[0] + tx * t, a[1] + tz * t];
                const p1 = [a[0] + tx * end, a[1] + tz * end];
                parts.quad(
                    "road_paint",
                    [
                        [p0[0] - tz * half, y0, p0[1] + tx * half],
                        [p0[0] + tz * half, y0, p0[1] - tx * half],
                        [p1[0] + tz * half, y1, p1[1] - tx * half],
                        [p1[0] - tz * half, y1, p1[1] + tx * half],
                    ],
                    { up: true, trim: true }
                );
                t = end;
            }
            travelled += span;
        }
    }
}

/** A polyline ([x, z, y]) shortened by `by` metres at each end; empty if that leaves nothing. */
function trimmed(points, by) {
    const cut = (line) => {
        let left = by;
        for (let i = 1; i < line.length; i++) {
            const [ax, az, ay] = line[i - 1];
            const [bx, bz, by_] = line[i];
            const span = Math.hypot(bx - ax, bz - az);
            if (span > left) {
                const t = left / span;
                return [[ax + (bx - ax) * t, az + (bz - az) * t, ay + (by_ - ay) * t], ...line.slice(i)];
            }
            left -= span;
        }
        return [];
    };
    const head = cut(points);
    return head.length > 1 ? cut([...head].reverse()).reverse() : [];
}

// ---------------------------------------------------------------------
// Houses
// ---------------------------------------------------------------------

/**
 * A neighbour's house, built in its own frame — its front +z, its width
 * along x, its walls from just under the ground — then set where the
 * plan has it, turned to face its street.
 */
function houseOf(parts, house) {
    const { width: w, depth: d, height: h, pitch } = house;
    const hw = w / 2;
    const hd = d / 2;
    const base = -GROUND_DROP - 0.05;
    const ridge = h + hd * Math.tan(pitch);
    const matrix = new THREE.Matrix4().makeRotationY(house.yaw).setPosition(house.x, -GROUND_DROP, house.z);
    const place = (points) => points.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(matrix).toArray());
    const wall = (points, uvs) => parts.quad(house.wall, place(points), { uvs, kind: "wall" });

    // Walls, each mapped in metres along it and up.
    wall([[-hw, base, hd], [hw, base, hd], [hw, h, hd], [-hw, h, hd]], [[0, base], [w, base], [w, h], [0, h]]);
    wall([[hw, base, -hd], [-hw, base, -hd], [-hw, h, -hd], [hw, h, -hd]], [[0, base], [w, base], [w, h], [0, h]]);
    wall([[hw, base, hd], [hw, base, -hd], [hw, h, -hd], [hw, h, hd]], [[0, base], [d, base], [d, h], [0, h]]);
    wall([[-hw, base, -hd], [-hw, base, hd], [-hw, h, hd], [-hw, h, -hd]], [[0, base], [d, base], [d, h], [0, h]]);
    // The gables.
    parts.triangle(house.wall, place([[hw, h, hd], [hw, h, -hd], [hw, ridge, 0]]), [[0, h], [d, h], [hd, ridge]]);
    parts.triangle(house.wall, place([[-hw, h, -hd], [-hw, h, hd], [-hw, ridge, 0]]), [[0, h], [d, h], [hd, ridge]]);

    // The roof: two slopes from the eaves, which overhang, to the ridge;
    // their undersides white; the gable ends' verges a little out too.
    const eave = 0.45;
    const verge = 0.3;
    const drop = eave * Math.tan(pitch);
    const slope = Math.hypot(hd + eave, ridge - (h - drop));
    for (const s of [1, -1]) {
        const top = place([
            [-hw - verge, h - drop, s * (hd + eave)],
            [hw + verge, h - drop, s * (hd + eave)],
            [hw + verge, ridge, 0],
            [-hw - verge, ridge, 0],
        ]);
        parts.quad(house.roof, s > 0 ? top : [top[1], top[0], top[3], top[2]], { uvs: [[0, 0], [w + verge * 2, 0], [w + verge * 2, slope], [0, slope]], kind: "roof" });
        const under = place([
            [hw + verge, h - drop - 0.12, s * (hd + eave)],
            [-hw - verge, h - drop - 0.12, s * (hd + eave)],
            [-hw - verge, ridge - 0.12, 0],
            [hw + verge, ridge - 0.12, 0],
        ]);
        parts.quad("trim_white", s > 0 ? under : [under[1], under[0], under[3], under[2]], { trim: true });
        // Its edge, the fascia.
        const fascia = place([
            [-hw - verge, h - drop - 0.12, s * (hd + eave)],
            [hw + verge, h - drop - 0.12, s * (hd + eave)],
            [hw + verge, h - drop, s * (hd + eave)],
            [-hw - verge, h - drop, s * (hd + eave)],
        ]);
        parts.quad("trim_white", s > 0 ? fascia : [fascia[1], fascia[0], fascia[3], fascia[2]], { trim: true });
    }

    // A chimney through the back slope, near one gable.
    if (house.chimney) {
        const cx = (house.seed % 2 ? 1 : -1) * (hw - 1.3);
        const cz = -hd * 0.45;
        const foot = h + (hd - Math.abs(cz)) * Math.tan(pitch) - 0.3;
        box(parts, "exposed_brick", place, [cx, foot, cz], [0.75, ridge + 0.9 - foot, 0.6]);
    }

    // Windows and the door: on the front, a row each floor with the door
    // in the middle of the ground floor's; the back, the same without it;
    // one each floor on each gable end.
    const columns = w > 11 ? [-w / 3, 0, w / 3] : [-w / 4, w / 4];
    const floors = [0.95, 3.75];
    for (const [k, sill] of floors.entries()) {
        for (const x of columns) {
            if (k === 0 && Math.abs(x) < 0.01) continue;
            windowOf(parts, place, [x, sill, hd], [1, 0, 0], k ? 1.2 : 1.4);
            windowOf(parts, place, [-x, sill, -hd], [-1, 0, 0], k ? 1.2 : 1.4);
        }
        windowOf(parts, place, [hw, sill, 0], [0, 0, -1], 1.1);
        windowOf(parts, place, [-hw, sill, 0], [0, 0, 1], 1.1);
    }
    door(parts, place, house.door, 0, hd);

    // Its path, down the front garden to the street's gravel.
    const [from, to] = house.path;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
    const nx = (-(to[1] - from[1]) / length) * 0.65;
    const nz = ((to[0] - from[0]) / length) * 0.65;
    const y = -GROUND_DROP + 0.02;
    parts.quad("paving_slab", [[from[0] + nx, y, from[1] + nz], [from[0] - nx, y, from[1] - nz], [to[0] - nx, y, to[1] - nz], [to[0] + nx, y, to[1] + nz]], { world: true, up: true });
}

/**
 * A window in the wall at `at` ([x, sill, z], its middle's foot, in the
 * house's frame), its face along `along`: dark glass a little proud of the
 * wall, a white frame round it, and a sill under it.
 */
function windowOf(parts, place, [x, sill, z], along, height, width = 1.2) {
    const [ax, , az] = along;
    // Out of the wall: the along direction (to the right, seen from
    // outside) turned a quarter back towards whoever is looking.
    const ox = -az;
    const oz = ax;
    const p = (s, y, out) => [x + ax * s + ox * out, y, z + az * s + oz * out];
    const hw = width / 2;
    const top = sill + height;
    parts.quad("window_dark", place([p(-hw, sill, 0.02), p(hw, sill, 0.02), p(hw, top, 0.02), p(-hw, top, 0.02)]), { trim: true });
    const f = 0.08;
    const frame = [
        [p(-hw - f, top, 0.04), p(hw + f, top, 0.04), p(hw + f, top + f, 0.04), p(-hw - f, top + f, 0.04)],
        [p(-hw - f, sill - f, 0.04), p(hw + f, sill - f, 0.04), p(hw + f, sill, 0.04), p(-hw - f, sill, 0.04)],
        [p(-hw - f, sill, 0.04), p(-hw, sill, 0.04), p(-hw, top, 0.04), p(-hw - f, top, 0.04)],
        [p(hw, sill, 0.04), p(hw + f, sill, 0.04), p(hw + f, top, 0.04), p(hw, top, 0.04)],
        // The glazing bar down the middle.
        [p(-0.025, sill, 0.035), p(0.025, sill, 0.035), p(0.025, top, 0.035), p(-0.025, top, 0.035)],
    ];
    for (const quad of frame) parts.quad("trim_white", place(quad), { trim: true });
    // The sill: its top, and its front.
    const s = 0.13;
    parts.quad("trim_white", place([p(-hw - 0.12, sill - f, s), p(hw + 0.12, sill - f, s), p(hw + 0.12, sill - f, 0), p(-hw - 0.12, sill - f, 0)]), { trim: true });
    parts.quad("trim_white", place([p(-hw - 0.12, sill - f - 0.06, s), p(hw + 0.12, sill - f - 0.06, s), p(hw + 0.12, sill - f, s), p(-hw - 0.12, sill - f, s)]), { trim: true });
}

/** The front door, a white frame round it, and a step. */
function door(parts, place, finish, x, z) {
    const hw = 0.5;
    const top = 2.15;
    const foot = -GROUND_DROP + 0.12;
    parts.quad(finish, place([[x - hw, foot, z + 0.02], [x + hw, foot, z + 0.02], [x + hw, top, z + 0.02], [x - hw, top, z + 0.02]]), { trim: true });
    const f = 0.1;
    for (const quad of [
        [[x - hw - f, foot, z + 0.05], [x - hw, foot, z + 0.05], [x - hw, top, z + 0.05], [x - hw - f, top, z + 0.05]],
        [[x + hw, foot, z + 0.05], [x + hw + f, foot, z + 0.05], [x + hw + f, top, z + 0.05], [x + hw, top, z + 0.05]],
        [[x - hw - f, top, z + 0.05], [x + hw + f, top, z + 0.05], [x + hw + f, top + f, z + 0.05], [x - hw - f, top + f, z + 0.05]],
    ]) {
        parts.quad("trim_white", place(quad), { trim: true });
    }
    box(parts, "paving_slab", place, [x, -GROUND_DROP, z + 0.4], [1.6, 0.12, 0.8]);
}

/** A box, its foot's middle at `at`, `size` [x, y, z], in the house's frame: its four sides and its top. */
function box(parts, finish, place, [x, y, z], [sx, sy, sz]) {
    const a = sx / 2;
    const c = sz / 2;
    const top = y + sy;
    const kind = finish.startsWith("trim_") ? { trim: true } : { kind: "wall" };
    const side = (points, span) => parts.quad(finish, place(points), { ...kind, uvs: [[0, y], [span, y], [span, top], [0, top]] });
    side([[x - a, y, z + c], [x + a, y, z + c], [x + a, top, z + c], [x - a, top, z + c]], sx);
    side([[x + a, y, z - c], [x - a, y, z - c], [x - a, top, z - c], [x + a, top, z - c]], sx);
    side([[x + a, y, z + c], [x + a, y, z - c], [x + a, top, z - c], [x + a, top, z + c]], sz);
    side([[x - a, y, z - c], [x - a, y, z + c], [x - a, top, z + c], [x - a, top, z - c]], sz);
    parts.quad(finish, place([[x - a, top, z + c], [x + a, top, z + c], [x + a, top, z - c], [x - a, top, z - c]]), { ...kind, world: !kind.trim, uvs: kind.trim ? undefined : [[0, 0], [sx, 0], [sx, sz], [0, sz]] });
}

// ---------------------------------------------------------------------
// Geometry, gathered by material
// ---------------------------------------------------------------------

/**
 * The pieces made so far, by material: quads, triangles and strips, each
 * with normals of its own and its texture mapped in metres — along a wall
 * and up it, or over the ground in world x and -z, as the floors are —
 * then each material's made one mesh.
 */
class Parts {
    constructor(materials) {
        this.materials = materials;
        this.byMaterial = new Map();
    }

    entry(name) {
        if (!this.byMaterial.has(name)) this.byMaterial.set(name, { positions: [], normals: [], uvs: [], indices: [] });
        return this.byMaterial.get(name);
    }

    material(name, { trim = false, kind = "ground" } = {}) {
        return trim || name.startsWith("trim_") || name === "window_dark" || name === "road_paint"
            ? this.materials.getTrim(name)
            : this.materials.getSurface(name, kind);
    }

    /**
     * A flat polygon of three or four corners, counter-clockwise seen from
     * its front. `uvs` in metres (divided by the finish's tile here); or,
     * `world`, mapped over the ground; `up`, turned to face up whichever
     * way its corners run.
     */
    polygon(name, points, { uvs = null, world = false, up = false, trim = false, kind = "ground" } = {}) {
        const entry = this.entry(name);
        if (!entry.options) entry.options = { trim, kind };
        const a = new THREE.Vector3(...points[0]);
        const normal = new THREE.Vector3()
            .subVectors(new THREE.Vector3(...points[1]), a)
            .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), a))
            .normalize();
        let corners = points;
        let maps = uvs;
        if (up && normal.y < 0) {
            corners = [...points].reverse();
            maps = uvs && [...uvs].reverse();
            normal.negate();
        }
        const tile = trim || name.startsWith("trim_") || name === "window_dark" || name === "road_paint" ? 1 : this.materials.tileSize(name);
        const first = entry.positions.length / 3;
        corners.forEach((point, i) => {
            entry.positions.push(...point);
            entry.normals.push(normal.x, normal.y, normal.z);
            if (world || !maps) entry.uvs.push(point[0] / tile, -point[2] / tile);
            else entry.uvs.push(maps[i][0] / tile, maps[i][1] / tile);
        });
        for (let i = 1; i < corners.length - 1; i++) entry.indices.push(first, first + i, first + i + 1);
    }

    quad(name, points, options) {
        this.polygon(name, points, options);
    }

    triangle(name, points, uvs) {
        this.polygon(name, points, { uvs, kind: "wall" });
    }

    /**
     * A strip between pairs of points along a road ([left, right] at each
     * step), mapped over the ground, facing up.
     */
    strip(name, rows) {
        for (let i = 1; i < rows.length; i++) {
            const [a, b] = rows[i - 1];
            const [c, d] = rows[i];
            this.polygon(name, [a, b, d, c], { world: true, up: true });
        }
    }

    build() {
        const group = new THREE.Group();
        for (const [name, entry] of this.byMaterial) {
            if (!entry.indices.length) continue;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(entry.positions, 3));
            geometry.setAttribute("normal", new THREE.Float32BufferAttribute(entry.normals, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(entry.uvs, 2));
            geometry.setIndex(entry.indices);
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, this.material(name, entry.options));
            mesh.name = `neighbourhood:${name}`;
            // Published whole, front out: seen from the roads (Publish/Snapshot.js).
            mesh.userData = { keepWhole: true, label: /street|road/.test(name) ? "Road" : name === "paving_slab" ? "Path" : "Neighbour's house" };
            mesh.receiveShadow = true;
            mesh.castShadow = !/street|road|paving/.test(name);
            group.add(mesh);
        }
        return group;
    }
}

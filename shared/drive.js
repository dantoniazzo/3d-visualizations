/**
 * Where a scene's cars can go: the ground past its rooms, as a box on the
 * plan — so the bird's-eye view can follow a car driven from above all the
 * way (frontend/Experience/World/BirdView.js), and a publish can look from
 * there (frontend/Experience/Publish/viewpoints.js), the two from the same
 * spec alike.
 *
 * A car goes wherever there is ground under it (Vehicle/Car.js), and stops
 * where it ends:
 *
 *   - a site's own terrain (shared/landscape.js): a square `size` across
 *     round its `centre` — Ladonia's 640 m, with nothing round its edge;
 *   - the ground round the plot (SceneBuilder.buildGround): a square
 *     `ground_size` across round the origin, or wider, out past the
 *     neighbourhood's world on every side;
 *   - and inside the wall round the neighbourhood's world, where it has one
 *     (shared/neighbourhood.js; NeighbourhoodBuilder.buildWorldEdge): a
 *     circle `radius` − 8 m round its middle.
 *
 * Null where a car has no ground but the rooms' own — a scene with no car,
 * an imported model's, one with neither terrain nor ground — or nowhere to
 * go but them.
 */
import { planNeighbourhood } from "./neighbourhood.js";

/** How far inside its world's radius the wall round it stands (NeighbourhoodBuilder.buildWorldEdge). */
const EDGE_INSET = 8;

/**
 * @param {object} spec  the scene spec
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number }|null}
 */
export function driveBounds(spec) {
    if (!spec?.vehicles?.length) return null;
    if (spec.model && spec.model.role !== "furnishings") return null;
    const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const add = (cx, cz, half) => {
        box.minX = Math.min(box.minX, cx - half);
        box.maxX = Math.max(box.maxX, cx + half);
        box.minZ = Math.min(box.minZ, cz - half);
        box.maxZ = Math.max(box.maxZ, cz + half);
    };

    const terrain = spec.landscape?.terrain;
    if (terrain) {
        const [cx, cz] = terrain.centre ?? [0, 0];
        add(cx, cz, (terrain.size ?? 400) / 2);
    }
    const plan = planNeighbourhood(spec);
    const { ground = "none", ground_size: size = 0 } = spec.environment || {};
    if (ground !== "none" && size > 0) {
        // As SceneBuilder.buildGround lays it.
        const reach = plan ? 2 * (Math.max(Math.abs(plan.centre[0]), Math.abs(plan.centre[1])) + plan.radius + 40) : 0;
        add(0, 0, Math.max(size, reach) / 2);
    }
    if (box.minX > box.maxX) return null;

    if (plan) {
        const [cx, cz] = plan.centre;
        const r = plan.radius - EDGE_INSET;
        box.minX = Math.max(box.minX, cx - r);
        box.maxX = Math.min(box.maxX, cx + r);
        box.minZ = Math.max(box.minZ, cz - r);
        box.maxZ = Math.min(box.maxZ, cz + r);
    }
    return box.minX < box.maxX && box.minZ < box.maxZ ? box : null;
}

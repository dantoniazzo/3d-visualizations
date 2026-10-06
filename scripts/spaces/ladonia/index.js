/**
 * Ladonia Residence, Kosinožići — the first three of the project's eight
 * buildings, as the developer's listing shows them (konekt-nekretnine.hr
 * project 253; .claude/skills/build-property-space): buildings A and B,
 * one design, B with the pool in front, and building C, banded in corten;
 * along a village street with parking in front of each behind a dry-stone
 * wall and photinia, the oak woods behind.
 *
 * Site frame: x east (the street), z south; the gardens at 0, the street a
 * metre below. Each building is written in its own frame (ab.js, c.js) and
 * laid down here; its furnishings are furnish.js's.
 */
import { buildingAB } from "./ab.js";
import { buildingC } from "./c.js";
import { furnishAB, furnishC } from "./furnish.js";

/** Where each building's own origin (its north-west corner) lands. */
const A_AT = [0, 0];
const B_AT = [0, 24.2];
const C_AT = [2.5, -21];
/** The street: the retaining wall's face, the parking, the pavement, the road. */
const WALL_X = 20.2;
const PARKING = [WALL_X, 25.2];
const PAVEMENT = [25.2, 27.2];
const ROAD = [27.3, 34.3];
const STREET = -1.0;
const ROAD_Y = -1.1;
/** C stands at the street's level beside its lane (renders 12–14); A and B a metre up behind the wall. */
const C_Y = STREET;
/** The plots, north to south, and the line between C's and A's: a retaining wall a metre high. */
const PLOT_Z = [-25.5, 44.7];
const AC_Z = -4.2;
/** The lane off the street past C's north end (renders 12, 14): its two edges. */
const LANE_Z = [-33.4, -27.4];

const round = (n) => Math.round(n * 1000) / 1000;
const rect = (x0, z0, x1, z1) => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
];
const at = ([ox, oz], points) => points.map(([x, z]) => [round(ox + x), round(oz + z)]);
const box = ([ox, oz], [x0, z0, x1, z1]) => [round(ox + x0), round(oz + z0), round(ox + x1), round(oz + z1)];

const buildings = [
    buildingAB("a", A_AT, { furnish: (b) => furnishAB(b, { scheme: "ochre" }) }),
    buildingAB("b", B_AT, { furnish: (b) => furnishAB(b, { scheme: "sage", pool: true }) }),
    buildingC("c", [...C_AT, C_Y], { furnish: furnishC }),
];

// ---------------------------------------------------------------------
// Outside each building: its gardens, terraces, pergolas, the path to its
// steps, and the pool in front of B.
// ---------------------------------------------------------------------

function gardensAB(o, { pool = false } = {}) {
    const out = { rooms: [], pergolas: [], lawns: [], hedges: [], trees: [], pools: [], walls: [], lights: [], beds: [], railings: [], planters: [] };
    const paving = (id, name, poly) => out.rooms.push({ id, name, polygon: at(o, poly), voids: [], floor_finish: "stone_paving", ceiling_finish: "none", height: 0.05, elevation: 0.01 });
    const tag = o === A_AT ? "a" : "b";
    // Terraces under the pergolas: A2's north of the north wing and round
    // its street end, A3's south of the south wing and round its end,
    // A1's behind the middle.
    paving(`${tag}-t-a2`, "A2 — terrace", [[9.3, -3.0], [16.3, -3.0], [16.3, 4.4], [14.875, 4.4], [13.905, 0], [9.3, 0]]);
    paving(`${tag}-t-a3`, "A3 — terrace", [[-2.5, 16.65], [9.9, 16.65], [10.92, 9.85], [12.1, 9.85], [12.1, 20.15], [-2.5, 20.15]]);
    paving(`${tag}-t-a1`, "A1 — terrace", rect(-3.9, 5.2, 1.15, 9.63));
    // The recess under the landing, and the path in from the street.
    paving(`${tag}-recess`, "Entrance", [[9.575, 5.2], [14.85, 5.2], [14.85, 6.45], [16.0, 6.45], [16.0, 9.63], [10.75, 9.63], [9.575, 9.63]]);
    // To the head of the steps (WALL_X + 0.02 − their 1.8 m run), not on over them.
    paving(`${tag}-path`, "Path", rect(16.0, 6.45, WALL_X - 1.78, 8.6));
    // Bioclimatic pergolas: anthracite frames, oak-look louvres part open.
    const pergola = (id, [x0, z0, x1, z1], against) => out.pergolas.push({ id: `${tag}-${id}`, box: box(o, [x0, z0, x1, z1]), base: 0, height: 2.75, slats: "x", against, frame: "alu_anthracite", louvres: "timber" });
    pergola("pg-a2n", [9.3, -3.0, 16.3, 0], ["z1"]);
    pergola("pg-a2e", [14.75, 0, 16.3, 4.4], ["x0", "z0"]);
    // The south wing's: one long pergola, past its west corner on its posts.
    pergola("pg-a3s", [-2.5, 16.65, 9.75, 20.15], ["z0"]);
    // ...and on round its street face, over the terrace's east strip (render 10).
    pergola("pg-a3e", [10.75, 9.85, 13.3, 16.65], ["x0"]);
    pergola("pg-a1", [-3.9, 5.2, 1.15, 9.63], ["x1"]);
    // On the roof terraces, over each dining table and on to the stone box
    // over the outdoor kitchen, as the plans draw them: timber lattice on the
    // outer end and down the terrace side (renders 15, 16), the bay by the
    // box open, its frame fixed to the box and to the screened part (no
    // posts of its own: `against` both ends).
    const roofPergola = (id, [x0, z0, x1, z1], screens, against) => out.pergolas.push({ id: `${tag}-${id}`, box: box(o, [x0, z0, x1, z1]), base: 6.0, height: 2.45, slats: "z", ...(against ? { against } : { posts: "all" }), screens, frame: "alu_anthracite", louvres: "timber" });
    roofPergola("pg-roof-n", [1.18, 1.18, 4.42, 3.1], ["z-", "x+"]);
    roofPergola("pg-roof-n-bay", [1.18, 3.1, 4.42, 4.83], [], ["z0", "z1"]);
    roofPergola("pg-roof-s", [1.18, 11.6, 4.42, 15.4], ["z+", "x+"]);
    roofPergola("pg-roof-s-bay", [1.18, 9.74, 4.42, 11.6], [], ["z0", "z1"]);
    // Glass balustrades: up the outside stair, along the landing, round the loggia.
    const rail = (id, points, height = 1.0) => out.railings.push({ id: `${tag}-${id}`, points: points.map(([x, z, y]) => [round(o[0] + x), round(o[1] + z), y]), height });
    rail("rail-stair", [[14.85, 6.43, 0.0], [9.9, 6.43, 3.0]]);
    // Its channel 2 cm under the landing's paving, not in its plane.
    rail("rail-landing", [[9.88, 6.43, 2.98], [9.88, 9.6, 2.98]], 1.02);
    // Corten planters of grasses ringing each roof deck, half a metre wide,
    // white gravel between them and the parapet, as the plans draw them
    // (renders 15, 16); each piece 1 cm short of the next.
    const planter = (id, points, width = 0.9) => out.planters.push({ id: `${tag}-${id}`, path: points.map(([x, z]) => [round(o[0] + x), round(o[1] + z)]), base: 6.0, height: 0.55, width });
    planter("pl-n", [[1.43, 0.9], [12.52, 0.9]], 0.5);
    planter("pl-ne", [[13.03, 0.9], [13.03, 3.98]], 0.5);
    planter("pl-nse", [[9.91, 3.98], [12.52, 3.98]], 0.5);
    planter("pl-nsw", [[9.4, 3.98], [9.4, 4.57]], 0.5);
    planter("pl-s", [[1.43, 15.78], [4.18, 15.78]], 0.5);
    planter("pl-sw", [[4.69, 13.92], [4.69, 15.78]], 0.5);
    planter("pl-se", [[5.2, 13.92], [8.91, 13.92]], 0.5);
    planter("pl-sn", [[9.42, 10.14], [9.42, 13.92]], 0.5);
    // Lawns: A1's garden behind, A2's and A3's beside their terraces —
    // B's from A's south hedge, its plot's north edge.
    const N = o === B_AT ? -3.25 : -3.4;
    out.lawns.push({ polygon: at(o, rect(-6.0, N, -0.05, 5.2)) });
    out.lawns.push({ polygon: at(o, rect(-6.0, 9.63, -0.05, 16.6)) });
    out.lawns.push({ polygon: at(o, rect(-6.0, 16.6, -2.55, 20.2)) });
    out.lawns.push({ polygon: at(o, rect(-0.05, N, 9.3, -0.05)) });
    if (!pool) {
        out.lawns.push({ polygon: at(o, rect(16.3, N, 19.0, 5.2)) });
        out.lawns.push({ polygon: at(o, rect(12.1, 9.63, 19.0, 20.2)) });
    } else {
        out.lawns.push({ polygon: at(o, rect(16.3, N, 19.0, 5.2)) });
        // The pool in front of the south wing, its timber deck on the
        // house side, an outdoor kitchen at its north end.
        out.pools.push({ id: `${tag}-pool`, box: box(o, [14.2, 10.4, 17.0, 18.4]), level: -0.06, depth: 1.4, deck: box(o, [12.4, 9.85, 14.2, 19.4]) });
        // On its parking side a pale stone terrace for the outdoor kitchen.
        // Round the pool on three sides, not over it.
        paving(`${tag}-t-pool`, "Pool terrace", [[14.2, 9.85], [19.4, 9.85], [19.4, 19.4], [14.2, 19.4], [14.2, 18.4], [17.0, 18.4], [17.0, 10.4], [14.2, 10.4]]);
    }
    // Photinia: round each garden and along the path, green, red at its tips.
    const hedge = (id, points, h = 1.15) => out.hedges.push({ id: `${tag}-${id}`, path: at(o, points), base: 0, height: h, width: 0.7, red: 0.4 });
    // Photinia between the house's terrace and the pool deck.
    if (pool) hedge("h-pool", [[12.3, 10.1], [12.3, 16.5]]);
    hedge("h-rear", [[-6.4, -3.6], [-6.4, 20.6]]);
    // B's plot meets A's at A's south hedge: no second hedge across A3's terrace.
    if (o !== B_AT) hedge("h-n", [[-6.4, -3.6], [19.0, -3.6]]);
    hedge("h-s", [[-6.4, 20.6], [19.0, 20.6]]);
    hedge("h-path-n", [[16.0, 5.9], [18.2, 5.9]], 1.0);
    hedge("h-path-s", [[16.0, 9.2], [18.2, 9.2]], 1.0);
    // Ornamental grasses in the beds along the front.
    out.beds.push({ polygon: at(o, rect(16.4, 0.4, 19.4, 5.6)) });
    if (!pool) out.beds.push({ polygon: at(o, rect(12.4, 9.8, 19.4, 13.0)) });
    // Olives.
    const olive = (species, x, z, scale, yaw) => out.trees.push({ species, position: at(o, [[x, z]])[0], scale, yaw });
    olive("olive_1", -3.2, 1.2, 1.1, 30);
    olive("olive_3", -3.6, 14.5, 1.0, 140);
    olive("olive_2", 5.0, -2.0, 0.95, 250);
    // (No tree before the south wing's street face: render 10 shows it clear.)
    // Uplights under the olives, downlights under the pergolas.
    for (const tree of out.trees) out.lights.push({ type: "uplight", position: [tree.position[0] + 0.55, 0.05, tree.position[1] + 0.45], target: [tree.position[0], 2.2, tree.position[1]] });
    for (const [x, z] of [[12.5, -1.5], [7.5, 18.0], [-1.4, 7.4]]) out.lights.push({ type: "downlight", position: [...at(o, [[x, z]])[0].slice(0, 1), 2.6, at(o, [[x, z]])[0][1]] });
    // The outside stair's step lights, on every other step.
    for (let k = 2; k < 16; k += 2) out.lights.push({ type: "step", position: [round(o[0] + 14.85 - ((k - 0.5) * 4.95) / 16), round((k * 3.0) / 16 + 0.12), round(o[1] + 6.4)] });
    return out;
}

function gardensC(o) {
    const out = { rooms: [], pergolas: [], lawns: [], hedges: [], trees: [], lights: [], beds: [], planters: [] };
    // On the roof (render 12): a pergola over each flat's terrace, from the
    // box's stone to the recess's parapet, lattice only on the sides that
    // face each other, screening the two flats; and corten planters of
    // grasses along the parapet.
    out.pergolas.push({ id: "c-pg-roof-n", box: box(o, [6.95, 1.5, 10.65, 5.7]), base: C_Y + 6.4, height: 2.45, slats: "z", posts: "all", screens: ["z+"], frame: "alu_anthracite", louvres: "timber" });
    out.pergolas.push({ id: "c-pg-roof-s", box: box(o, [6.95, 7.8, 10.65, 12.0]), base: C_Y + 6.4, height: 2.45, slats: "z", posts: "all", screens: ["z-"], frame: "alu_anthracite", louvres: "timber" });
    // Corten planters a metre wide along the parapet, full of grasses.
    // Raised so their grasses and shrubs show over the tall corten parapet.
    const planter = (id, points, width = 1.05) => out.planters.push({ id: `c-${id}`, path: points.map(([x, z]) => [round(o[0] + x), round(o[1] + z)]), base: C_Y + 6.4, height: 1.05, width });
    planter("pl-n", [[0.9, 0.9], [7.2, 0.9]]);
    planter("pl-wn", [[0.9, 1.96], [0.9, 3.4]]);
    planter("pl-ws", [[0.9, 10.1], [0.9, 11.53]]);
    // Unbroken along the south parapet from the corner (renders 12, 13).
    planter("pl-s", [[0.9, 12.6], [11.5, 12.6]]);
    planter("pl-en", [[11.5, 1.45], [11.5, 3.4]]);
    planter("pl-es", [[11.5, 10.1], [11.5, 11.54]]);
    // Between the two flats' terraces, from the box to the recess's parapet:
    // the shrubs that rise between the pergolas in render 12.
    planter("pl-mid", [[7.45, 6.78], [10.125, 6.78]]);
    const paving = (id, name, poly) => out.rooms.push({ id, name, polygon: at(o, poly), voids: [], floor_finish: "stone_paving", ceiling_finish: "none", height: 0.05, elevation: round(C_Y + 0.01) });
    paving("c-t-c2", "C2 — terrace", [[-3.3, -1.3], [4.1, -1.3], [4.1, 0], [0, 0], [0, 2.4], [-3.3, 2.4]]);
    paving("c-t-c3", "C3 — terrace", [[-3.3, 11.1], [0, 11.1], [0, 13.5], [4.1, 13.5], [4.1, 14.8], [-3.3, 14.8]]);
    paving("c-t-c1", "C1 — terrace", rect(-3.3, 4.25, 0.05, 9.25));
    // The paving runs on along the whole garden façade between them.
    paving("c-t-wn", "Garden walk", rect(-2.2, 2.4, 0.05, 4.25));
    paving("c-t-ws", "Garden walk", rect(-2.2, 9.25, 0.05, 11.1));
    // On out to the parking, level with it: no wall, no steps.
    paving("c-path", "Path", rect(12.4, 4.4, WALL_X - o[0], 6.4));
    // The garden stops short of the retaining wall up to A's (AC_Z).
    const S = round(AC_Z - o[1] - 0.5);
    out.lawns.push({ polygon: at(o, rect(-5.5, -4.0, -3.35, S)) });
    out.lawns.push({ polygon: at(o, rect(-3.35, -4.0, 12.6, -1.35)) });
    out.lawns.push({ polygon: at(o, rect(-3.35, 14.85, 12.6, S)) });
    out.lawns.push({ polygon: at(o, rect(4.15, -1.35, 12.6, -0.05)) });
    out.lawns.push({ polygon: at(o, rect(4.15, 13.55, 12.6, 14.85)) });
    out.beds.push({ polygon: at(o, rect(12.6, -3.6, WALL_X - 0.5 - o[0], 4.1)) });
    out.beds.push({ polygon: at(o, rect(12.6, 9.6, WALL_X - 0.5 - o[0], S)) });
    const hedge = (id, points, h = 1.15) => out.hedges.push({ id: `c-${id}`, path: at(o, points), base: C_Y, height: h, width: 0.7, red: 0.4 });
    // Inside the low wall by the lane (rw-end), not astride it.
    hedge("h-rear", [[-5.9, -3.95], [-5.9, S - 0.2]]);
    hedge("h-n", [[-5.9, -3.95], [WALL_X - 0.8 - o[0], -3.95]]);
    // No hedge along the south: the retaining wall up to A's, A's photinia along its top.
    hedge("h-c1-n", [[-5.4, 3.6], [-3.4, 3.6]], 1.0);
    hedge("h-c1-s", [[-5.4, 9.9], [-3.4, 9.9]], 1.0);
    const olive = (species, x, z, scale, yaw) => out.trees.push({ species, position: at(o, [[x, z]])[0], scale, yaw });
    olive("olive_2", -4.4, 6.7, 1.05, 60);
    olive("olive_1", 14.6, -1.6, 0.95, 160);
    olive("olive_3", 14.4, 12.6, 1.0, 300);
    for (const tree of out.trees) out.lights.push({ type: "uplight", position: [tree.position[0] + 0.55, round(C_Y + 0.05), tree.position[1] + 0.45], target: [tree.position[0], round(C_Y + 2.2), tree.position[1]] });
    return out;
}

const gardens = [gardensAB(A_AT), gardensAB(B_AT, { pool: true }), gardensC(C_AT)];
const all = (key) => gardens.flatMap((g) => g[key] ?? []);

/** Round shrubs, about a metre across, among each roof planter's grasses every metre and a half. */
function planterShrubs(planters) {
    const out = [];
    let k = 0;
    for (const planter of planters) {
        for (let i = 0; i < planter.path.length - 1; i++) {
            const [a, b] = [planter.path[i], planter.path[i + 1]];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const count = Math.max(1, Math.round(length / 1.6));
            for (let j = 0; j < count; j++) {
                const t = (j + 0.5) / count;
                k += 1;
                out.push({ species: k % 3 ? "bush_1" : "bush_3", position: [round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)], scale: round(0.5 + (k % 4) * 0.06), yaw: (k * 67) % 360, elevation: round(planter.base + planter.height - 0.06) });
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------
// The street.
// ---------------------------------------------------------------------

/** Steps up from the parking to A's and B's paths, cut through the wall; C's path is level with the parking. */
const STEPS = [A_AT[1] + 7.5, B_AT[1] + 7.5];

function street() {
    const rooms = [];
    const slab = (id, name, polygon, finish, elevation) => rooms.push({ id, name, polygon, voids: [], floor_finish: finish, ceiling_finish: "none", height: 0.05, elevation });
    // A and B park on asphalt, C on pale concrete pavers (render 12).
    slab("parking", "Parking", rect(PARKING[0], -7.6, PARKING[1], PLOT_Z[1]), "asphalt", STREET);
    slab("parking-c", "Parking", rect(PARKING[0], PLOT_Z[0], PARKING[1], -7.6), "concrete_pavers", STREET);
    slab("pavement", "Pavement", rect(PAVEMENT[0], LANE_Z[1], PAVEMENT[1], 160), "concrete_pavers", STREET);
    slab("pavement-n", "Pavement", rect(PAVEMENT[0], -160, PAVEMENT[1], LANE_Z[0]), "concrete_pavers", STREET);
    slab("road", "Road", rect(ROAD[0], -160, ROAD[1], 160), "asphalt", ROAD_Y);
    // The lane west off the street along C's north end, a few metres past its hedge.
    slab("lane", "Lane", rect(-63, LANE_Z[0], ROAD[0], LANE_Z[1]), "asphalt", ROAD_Y);
    return rooms;
}

const stepFlights = STEPS.map((z, k) => ({
    id: `steps-${k}`,
    start: [round(WALL_X + 0.02), round(z)],
    direction: "west",
    yaw: -90,
    width: 2.58,
    base_height: STREET,
    top_height: 0,
    run: 1.8,
    steps: 6,
    finish: "concrete_steps",
    riser: "concrete_grey",
    // Solid down to the street between the dry-stone cheeks.
}));

function retainingWalls() {
    const walls = [];
    // In front of A and B, from the wall up to C's plot; each run's ends
    // inside the steps' cheeks (not over the steps), the cheeks a little
    // proud of it so their tops do not fight.
    let from = AC_Z;
    for (const z of STEPS.slice().sort((a, b) => a - b)) {
        walls.push({ id: `rw-${walls.length}`, path: [[WALL_X - 0.22, from], [WALL_X - 0.22, z - 1.55]], base: STREET - 0.05, top: 0.02, thickness: 0.45, finish: "dry_stone", coping: false });
        from = z + 1.55;
        for (const side of [-1, 1]) {
            walls.push({ id: `rw-cheek-${walls.length}`, path: [[WALL_X, z + side * 1.5], [WALL_X - 2.6, z + side * 1.5]], base: STREET - 0.05, top: 0.05, thickness: 0.4, finish: "dry_stone", coping: false });
        }
    }
    walls.push({ id: `rw-${walls.length}`, path: [[WALL_X - 0.22, from], [WALL_X - 0.22, PLOT_Z[1] - 0.05]], base: STREET - 0.05, top: 0.02, thickness: 0.45, finish: "dry_stone", coping: false });
    // B's south end, stepping down to the street; it runs on past the back
    // wall's outer face and stands taller than it, so the two never share a face.
    walls.push({ id: `rw-end-${PLOT_Z[1]}`, path: [[WALL_X, PLOT_Z[1]], [-8.55, PLOT_Z[1]]], base: STREET - 0.05, top: 0.45, thickness: 0.45, finish: "dry_stone", slope: [0.25, 0.55] });
    // Between C's plot, at the street's level, and A's, a metre up: a
    // retaining wall right across, a little proud of A's garden.
    walls.push({ id: "rw-ac", path: [[WALL_X, AC_Z], [-8.55, AC_Z]], base: C_Y - 0.4, top: 0.55, thickness: 0.55, finish: "dry_stone", slope: [0.25, 0.55] });
    // C's north end by the lane: a low garden wall at its level, butting into its back wall.
    walls.push({ id: `rw-end-${PLOT_Z[0]}`, path: [[WALL_X, PLOT_Z[0]], [-8.45, PLOT_Z[0]]], base: ROAD_Y - 0.1, top: C_Y + 0.35, thickness: 0.45, finish: "dry_stone" });
    // The low wall round the plots' backs: C's at its level; A's and B's
    // founded as deep, the ground behind A's north end falling to C's.
    walls.push({ id: "rw-back-c", path: [[-8.5, AC_Z], [-8.5, PLOT_Z[0] + 0.05]], base: C_Y - 0.4, top: C_Y + 0.45, thickness: 0.45, finish: "dry_stone" });
    walls.push({ id: "rw-back", path: [[-8.5, AC_Z], [-8.5, PLOT_Z[1] - 0.05]], base: C_Y - 0.4, top: 0.45, thickness: 0.45, finish: "dry_stone" });
    // The render wall screening B's pool from the street at its south-east corner.
    // A3's terrace screened from the street by a rendered wall (render 10).
    walls.push({ id: "a3-screen", path: [[A_AT[0] + 13.9, A_AT[1] + 12.6], [A_AT[0] + 13.9, A_AT[1] + 18.8]], base: -0.05, top: 2.35, thickness: 0.25, finish: "render_sand", coping: false });
    walls.push({ id: "pool-screen", path: [[B_AT[0] + 19.6, B_AT[1] + 16.9], [B_AT[0] + 19.6, B_AT[1] + 19.6], [B_AT[0] + 17.2, B_AT[1] + 19.6]], base: -0.05, top: 1.8, thickness: 0.25, finish: "render_sand", coping: false });
    return walls;
}

/** The hedge along the top of the retaining wall, broken for the steps. */
function frontHedges() {
    const hedges = [];
    const fh = (a, b, base) => hedges.push({ id: `fh-${hedges.length}`, path: [[WALL_X - 0.6, a], [WALL_X - 0.6, b]], base, height: 0.7, width: 0.8, red: 0 });
    // Along C's front, at its level, broken for its path.
    const path = C_AT[1] + 5.4;
    fh(PLOT_Z[0] + 0.4, path - 1.8, C_Y);
    fh(path + 1.8, AC_Z - 0.6, C_Y);
    // Along the top of the wall in front of A and B, broken for the steps.
    let from = AC_Z + 0.55;
    for (const z of STEPS.slice().sort((a, b) => a - b)) {
        fh(from, z - 1.8, 0);
        from = z + 1.8;
    }
    fh(from, PLOT_Z[1] - 0.4, 0);
    return hedges;
}

function markings() {
    const lines = [];
    const mid = (ROAD[0] + ROAD[1]) / 2;
    lines.push({ from: [mid, -160], to: [mid, 160], width: 0.12, dash: [3, 6], base: ROAD_Y });
    lines.push({ from: [ROAD[0] + 0.25, -160], to: [ROAD[0] + 0.25, 160], width: 0.15, base: ROAD_Y });
    lines.push({ from: [ROAD[1] - 0.25, -160], to: [ROAD[1] - 0.25, 160], width: 0.15, base: ROAD_Y });
    // The lane's: a dashed middle, its edges.
    const laneMid = (LANE_Z[0] + LANE_Z[1]) / 2;
    lines.push({ from: [-63, laneMid], to: [ROAD[0] - 0.4, laneMid], width: 0.12, dash: [3, 6], base: ROAD_Y });
    for (const z of [LANE_Z[0] + 0.25, LANE_Z[1] - 0.25]) lines.push({ from: [-63, z], to: [ROAD[0] - 0.4, z], width: 0.15, base: ROAD_Y });
    for (let z = PLOT_Z[0]; z < PLOT_Z[1] - 0.3; z += 2.6) {
        if (STEPS.some((s) => Math.abs(z - s) < 1.9) || z < -7.6) continue;
        lines.push({ from: [PARKING[0] + 0.3, round(z)], to: [PARKING[1] - 0.15, round(z)], width: 0.12, base: STREET });
    }
    return lines;
}

// Nothing scattered on the plots or the street.
const PLOTS = [-9.2, PLOT_Z[0] - 1, ROAD[1] + 2, PLOT_Z[1] + 1];

const landscape = {
    // Turned so the sun comes from the east-south-east (about 105°), low
    // (36°): the street and south faces lit, as most exterior renders have it.
    sky: { day: "kloofendal_48d_partly_cloudy_puresky", dusk: "qwantani_dusk_2_puresky", turn: 19, elevation: 36 },
    terrain: {
        size: 640,
        centre: [0, 8],
        base: -1.6,
        detail: { centre: [6, 8], half: 70, step: 1, outer: 6 },
        slopes: [
            // Rising gently behind the plots, into the woods.
            { origin: [-10, 0], dir: [-1, 0], rise: 0.06, max: 12, ease: 15 },
            // Falling away beyond the road.
            { origin: [37, 0], dir: [1, 0], rise: -0.04, max: 5, ease: 20 },
        ],
        hills: [
            { at: [-180, -120], radius: 90, height: 18 },
            { at: [-220, 140], radius: 100, height: 14 },
            { at: [140, -220], radius: 110, height: 10 },
        ],
        noise: { amplitude: 0.9, scale: 30, seed: 11 },
        holes: [...STEPS.map((z) => rect(round(WALL_X - 1.78), round(z - 1.3), round(WALL_X + 0.3), round(z + 1.3))), ...all("pools").map((p) => rect(p.box[0] - 0.01, p.box[1] - 0.01, p.box[2] + 0.01, p.box[3] + 0.01))],
        pads: [
            // The plots, flat at their gardens' level, eased into the ground
            // round them: A's and B's behind the wall, C's at the street's level.
            { polygon: rect(-8.7, AC_Z, WALL_X - 0.02, PLOT_Z[1]), height: -0.03, margin: 8 },
            { polygon: rect(-8.7, PLOT_Z[0], WALL_X - 0.02, AC_Z), height: C_Y - 0.03, margin: 8 },
            { polygon: rect(WALL_X - 0.02, -165, PAVEMENT[1] + 0.05, 165), height: STREET - 0.05, margin: 0 },
            { polygon: rect(ROAD[0] - 0.1, -300, ROAD[1] + 0.2, 300), height: ROAD_Y - 0.05, margin: 0 },
            { polygon: rect(-63.2, LANE_Z[0] - 0.2, ROAD[0], LANE_Z[1] + 0.2), height: ROAD_Y - 0.05, margin: 6 },
            { polygon: rect(ROAD[1] + 0.2, -300, ROAD[1] + 2.0, 300), height: ROAD_Y - 0.08, margin: 8 },
            // Both again, hard and last, so neither eases into the other (or
            // the lane into C's): the step between them is rw-ac's.
            { polygon: rect(-8.7, AC_Z, WALL_X - 0.02, PLOT_Z[1]), height: -0.03, margin: 0 },
            { polygon: rect(-8.7, PLOT_Z[0], WALL_X - 0.02, AC_Z), height: C_Y - 0.03, margin: 0 },
        ],
        paint: [
            { ground: "gravel", polygon: rect(ROAD[1], -300, ROAD[1] + 1.4, 300), margin: 0.6 },
            { ground: "lawn", polygon: rect(-8.6, PLOT_Z[0], WALL_X - 0.4, PLOT_Z[1]), margin: 1.2 },
            { ground: "forest", polygon: [[-400, -400], [-24, -400], [-24, 400], [-400, 400]], margin: 12, noise: 0.8, strength: 0.65 },
            { ground: "hillside", polygon: [[-500, -500], [-160, -500], [-160, 500], [-500, 500]], margin: 60, noise: 0.6 },
        ],
    },
    walls: retainingWalls(),
    hedges: [...frontHedges(), ...all("hedges")],
    pergolas: all("pergolas"),
    planters: all("planters"),
    railings: all("railings"),
    pools: all("pools"),
    lawns: all("lawns"),
    // The kerb stops either side of the lane's mouth.
    kerbs: [
        { path: [[ROAD[0] - 0.05, -160], [ROAD[0] - 0.05, LANE_Z[0]]], base: ROAD_Y, height: 0.12, width: 0.15 },
        { path: [[ROAD[0] - 0.05, LANE_Z[1]], [ROAD[0] - 0.05, 160]], base: ROAD_Y, height: 0.12, width: 0.15 },
    ],
    markings: markings(),
    trees: [
        ...all("trees"),
        ...planterShrubs(all("planters")),
        // Oaks along the street and in the fields across it, as the drone
        // photographs of the plot show.
        { species: "oak_2", position: [38, -40], scale: 1.1, yaw: 10 },
        { species: "oak_3", position: [41, -6], scale: 1.0, yaw: 120 },
        { species: "oak_1", position: [39, 31], scale: 1.05, yaw: 220 },
        { species: "ash_1", position: [44, 58], scale: 1.0, yaw: 60 },
        { species: "oak_4", position: [-12, -30], scale: 1.0, yaw: 300 },
        { species: "oak_4", position: [-12, 47], scale: 1.1, yaw: 40 },
    ],
    forest: [
        // The oak woods behind the plots, and either side.
        { polygon: [[-320, -320], [-14, -320], [-14, 320], [-320, 320]], spacing: 7.0, species: { oak_1: 4, oak_2: 4, oak_3: 2, ash_1: 3, oak_4: 2 }, clearings: 0.12 },
        { polygon: [[-14, -320], [ROAD[0] - 2, -320], [ROAD[0] - 2, -34], [-14, -34]], spacing: 8.5, species: { oak_1: 3, oak_2: 3, ash_1: 2, oak_4: 2 }, clearings: 0.25 },
        { polygon: [[-14, 52], [ROAD[0] - 2, 52], [ROAD[0] - 2, 320], [-14, 320]], spacing: 8.5, species: { oak_1: 3, oak_2: 3, ash_1: 2, oak_4: 2 }, clearings: 0.25 },
        { polygon: [[48, -320], [320, -320], [320, 320], [48, 320]], spacing: 10, species: { oak_1: 2, oak_2: 2, oak_4: 2, ash_1: 1 }, clearings: 0.4 },
    ],
    shrubs: [
        { polygon: [[ROAD[1] + 3, -200], [48, -200], [48, 200], [ROAD[1] + 3, 200]], spacing: 6, species: { bush_1: 2, bush_3: 2 }, clearings: 0.45 },
        { polygon: [[-14, -34], [ROAD[0] - 2, -34], [ROAD[0] - 2, -27], [-14, -27]], spacing: 3.5, species: { bush_1: 2, bush_3: 1 }, clearings: 0.3 },
        { polygon: [[-14, 44], [ROAD[0] - 2, 44], [ROAD[0] - 2, 52], [-14, 52]], spacing: 3.5, species: { bush_1: 2, bush_3: 1 }, clearings: 0.3 },
    ],
    meadow: [
        { polygon: [[ROAD[1] + 1.5, -200], [200, -200], [200, 200], [ROAD[1] + 1.5, 200]], density: 1 },
        { polygon: [[-14, -60], [ROAD[0] - 1, -60], [ROAD[0] - 1, PLOTS[1]], [-14, PLOTS[1]]], density: 1 },
        { polygon: [[-14, PLOTS[3]], [ROAD[0] - 1, PLOTS[3]], [ROAD[0] - 1, 80], [-14, 80]], density: 1 },
        { polygon: [[-40, -60], [-9.3, -60], [-9.3, 80], [-40, 80]], density: 0.8 },
    ],
    // Ornamental grasses in the front beds.
    grassBeds: all("beds"),
    lights: all("lights"),
};

const rooms = [...buildings.flatMap((b) => b.out.rooms), ...gardens.flatMap((g) => g.rooms), ...street()];

export const ladonia = {
    name: "Ladonia Residence, Kosinožići",
    summary:
        "Ladonia Residence, a few minutes from Poreč: the first three of eight buildings, five flats in each, every one furnished. Buildings A and B — two wings in khaki render under a stone-clad box on the roof, louvred pergolas over the ground-floor gardens, an outside stair up to the first-floor flats, whose own stairs climb into the box and out onto roof terraces with a jacuzzi, an outdoor kitchen and planters of grasses; B with a pool in front. Building C — banded in corten over sand render, a stone-clad recess through both floors on each side. Parking on the street behind dry-stone walls and photinia, the oak woods behind.",
    environment: { preset: "exterior_mediterranean", ground: "none", ground_size: 0 },
    garden: {
        hills: { enabled: false },
        tufts: { enabled: false },
        trees: { enabled: false },
        blades: { enabled: false },
        neighbourhood: { enabled: false },
    },
    landscape,
    rooms,
    walls: buildings.flatMap((b) => b.out.walls),
    roofs: buildings.flatMap((b) => b.out.roofs),
    stairs: [...buildings.flatMap((b) => b.out.stairs), ...stepFlights],
    floor_openings: buildings.flatMap((b) => b.out.floor_openings),
    doors: [],
    vehicles: [
        { id: "car", model: "bmw-x6-m", position: [22.7, A_AT[1] + 3.6], elevation: STREET, yaw: -90 },
        { id: "car-2", model: "chery-jaecoo-j7", position: [22.7, B_AT[1] + 13.2], elevation: STREET, yaw: -90 },
        { id: "car-3", model: "chery-jaecoo-j7", position: [22.7, C_AT[1] + 1.2], elevation: STREET, yaw: -90 },
    ],
    furniture: buildings.flatMap((b) => b.out.furniture),
    finishes: {},
    spawns: [
        { position: [30.8, ROAD_Y, A_AT[1] + 8], yaw: 90, label: "The street" },
        { position: [17.5, 0, A_AT[1] + 7.5], yaw: 90, label: "Building A — entrance" },
        { position: [17.5, 0, B_AT[1] + 7.5], yaw: 90, label: "Building B — entrance" },
        { position: [17.5, C_Y, C_AT[1] + 5.4], yaw: 90, label: "Building C — entrance" },
        { position: [A_AT[0] + 4.8, 0, A_AT[1] + 8.5], yaw: 90, label: "A1 — living room" },
        { position: [A_AT[0] + 12.0, 0, A_AT[1] + 3.75], yaw: 90, label: "A2 — living room" },
        { position: [A_AT[0] + 8.0, 0, A_AT[1] + 13.55], yaw: 90, label: "A3 — living room" },
        { position: [A_AT[0] + 10.4, 3.0, A_AT[1] + 3.6], yaw: 90, label: "Upper north flat — living room" },
        { position: [A_AT[0] + 7.45, 3.0, A_AT[1] + 12.2], yaw: 90, label: "Upper south flat — living room" },
        { position: [A_AT[0] + 7.9, 6.0, A_AT[1] + 2.6], yaw: 90, label: "A — north roof terrace" },
        { position: [A_AT[0] + 3.0, 6.0, A_AT[1] + 11.1], yaw: 180, label: "A — south roof terrace" },
        { position: [B_AT[0] + 17.75, 0, B_AT[1] + 16.5], yaw: 90, label: "Building B — pool" },
        { position: [C_AT[0] + 4.7, C_Y, C_AT[1] + 5.0], yaw: 90, label: "C1 — living room" },
        { position: [C_AT[0] + 3.88, C_Y + 3.2, C_AT[1] + 3.38], yaw: 90, label: "C5 — living room" },
        { position: [C_AT[0] + 9.5, C_Y + 6.4, C_AT[1] + 5.2], yaw: 90, label: "C — roof terrace" },
    ],
};

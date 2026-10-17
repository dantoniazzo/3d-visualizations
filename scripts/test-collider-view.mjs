/**
 * What the colliders' debug view (frontend/Experience/World/ColliderView.js)
 * gathers from the collision trees, on made-up furniture:
 * `node scripts/test-collider-view.mjs`. Exits 1 if any of these does not
 * hold:
 *
 *   1. `uniqueTriangles` gives every triangle of a tree exactly once —
 *      one `buildOctree` made, a keeper's after edits mended into it in
 *      place, the union a keeper hands out while it builds another a slice
 *      a frame (`meanwhile`, whose root has no box), and the tree as it was
 *      left while one is built (`stale`) — and, asked for a box, at least
 *      every triangle that meets the box, each once.
 *   2. The view's own gathering draws each of those triangles exactly once:
 *      from a keeper's list of sources (`gatherEntries`) and from a tree
 *      (`gatherTree`), the same set either way, the whole of it or within a
 *      region — every triangle whose box meets the region, from the list;
 *      every one that meets the region, from the tree.
 *   3. Each is drawn as what it is: a piece met as its box, a flight's ramp,
 *      a piece as its mesh, an invisible blocker inside a wall, by its
 *      keeper's entry; a published view's by its label — its boxes found as
 *      boxes, twelve triangles to eight corners.
 *   4. A box's and a capsule's triangles, and a tree's, have the long edge
 *      of a half rectangle left out, and only that.
 */
import * as THREE from "three";
import { TreeKeeper, buildOctree, uniqueTriangles } from "../frontend/Experience/World/Collision.js";
import { KINDS, TriangleSink, boxedLabels, entryKind, gatherEntries, gatherTree, labelKind } from "../frontend/Experience/World/ColliderView.js";

let seed = 20261016;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const results = [];
let failed = 0;
const say = (name, problem, note = "") => {
    results.push({ name, problem, note });
    if (problem) failed++;
};
const KIND = Object.fromEntries(KINDS.map((kind, index) => [kind.id, index]));

const corners = (t) => `${t.a.x},${t.a.y},${t.a.z};${t.b.x},${t.b.y},${t.b.z};${t.c.x},${t.c.y},${t.c.z}`;
/** A sink's triangles as the same strings (its floats are 32-bit: the tree's corners rounded to them). */
const f = (x) => Math.fround(x);
const rounded = (t) => `${f(t.a.x)},${f(t.a.y)},${f(t.a.z)};${f(t.b.x)},${f(t.b.y)},${f(t.b.z)};${f(t.c.x)},${f(t.c.y)},${f(t.c.z)}`;
function drawn(sink) {
    const out = [];
    const p = sink.positions;
    for (let o = 0; o < sink.count * 9; o += 9) out.push(`${p[o]},${p[o + 1]},${p[o + 2]};${p[o + 3]},${p[o + 4]},${p[o + 5]};${p[o + 6]},${p[o + 7]},${p[o + 8]}`);
    return out;
}
/** Where two lists of triangles, as strings, are not the same set with each once — or null. */
function sameSet(mine, theirs, what) {
    const seen = new Set();
    for (const key of mine) {
        if (seen.has(key)) return `${what}: a triangle twice`;
        seen.add(key);
    }
    if (mine.length !== theirs.length) return `${what}: ${mine.length} triangles against ${theirs.length}`;
    for (const key of theirs) if (!seen.has(key)) return `${what}: a triangle missing`;
    return null;
}

function piece(label) {
    const group = new THREE.Group();
    const parts = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < parts; i++) {
        const kind = rnd();
        const geometry =
            kind < 0.4
                ? new THREE.BoxGeometry(0.4 + rnd(), 0.4 + rnd(), 0.4 + rnd())
                : kind < 0.7
                  ? new THREE.SphereGeometry(0.3 + rnd() * 0.4, 10, 8)
                  : kind < 0.85
                    ? new THREE.PlaneGeometry(3, 3, 3, 3).rotateX(-Math.PI / 2)
                    : new THREE.CylinderGeometry(0.2, 0.3, 1, 12).toNonIndexed();
        const mesh = new THREE.Mesh(geometry);
        mesh.position.set(rnd() - 0.5, rnd(), rnd() - 0.5);
        mesh.rotation.y = rnd() * 6;
        if (label) mesh.userData.label = label;
        group.add(mesh);
    }
    group.position.set(rnd() * 16, rnd() < 0.3 ? 3 : 0, rnd() * 24);
    group.rotation.y = rnd() < 0.4 ? 0 : rnd() * 6;
    group.updateMatrixWorld(true);
    return group;
}

/** Every triangle of these meshes, in the world, as buildOctree would take them. */
function meshTriangles(roots) {
    const out = [];
    for (const root of roots) {
        root.updateMatrixWorld(true);
        root.traverse((mesh) => {
            if (!mesh.isMesh) return;
            const position = mesh.geometry.attributes.position;
            const index = mesh.geometry.index;
            const n = index ? index.count : position.count;
            for (let i = 0; i < n; i += 3) {
                const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
                out.push(new THREE.Triangle(a, b, c));
            }
        });
    }
    return out;
}

const regionOf = (x0, x1, y0, y1, z0, z1) => ({ x0, x1, y0, y1, z0, z1 });
const boxOf = (r) => new THREE.Box3(new THREE.Vector3(r.x0, r.y0, r.z0), new THREE.Vector3(r.x1, r.y1, r.z1));
const meetsBox = (t, r) => {
    const xs = [t.a.x, t.b.x, t.c.x], ys = [t.a.y, t.b.y, t.c.y], zs = [t.a.z, t.b.z, t.c.z];
    return Math.max(...xs) >= r.x0 && Math.min(...xs) <= r.x1 && Math.max(...ys) >= r.y0 && Math.min(...ys) <= r.y1 && Math.max(...zs) >= r.z0 && Math.min(...zs) <= r.z1;
};

/** A tree's triangles, as `uniqueTriangles` and as the view gathers them from it, against what they should be. */
function checkTree(name, tree, expected, { keeper = null } = {}) {
    const unique = uniqueTriangles(tree);
    say(`${name}: uniqueTriangles, each once`, sameSet(unique.map(corners), expected.map(corners), "uniqueTriangles"), `${unique.length} triangles`);
    const sink = new TriangleSink();
    sink.begin();
    gatherTree(tree, "dynamic", null, sink, {});
    say(`${name}: gathered from the tree, each once`, sameSet(drawn(sink), expected.map(rounded), "gatherTree"));
    if (keeper) {
        const listed = new TriangleSink();
        listed.begin();
        gatherEntries(keeper, "dynamic", null, listed);
        say(`${name}: gathered from the keeper's list, each once`, sameSet(drawn(listed), expected.map(rounded), "gatherEntries"));
    }

    // Within a region: from the tree, at least every triangle that meets it, and none whose box misses it; from the list, exactly those whose box meets it.
    const region = regionOf(4, 11, -0.5, 2.5, 6, 15);
    const box = boxOf(region);
    const inBox = uniqueTriangles(tree, box);
    const seen = new Set(inBox);
    let problem = inBox.length !== seen.size ? "uniqueTriangles with a box: a triangle twice" : null;
    const touching = expected.filter((t) => box.intersectsTriangle(t));
    const keyed = new Set(inBox.map(corners));
    if (!problem) for (const t of touching) if (!keyed.has(corners(t))) problem = "uniqueTriangles with a box: a triangle that meets it missing";
    const regional = new TriangleSink();
    regional.begin();
    gatherTree(tree, "dynamic", region, regional, {});
    const fromTree = drawn(regional);
    if (!problem && new Set(fromTree).size !== fromTree.length) problem = "gatherTree in a region: a triangle twice";
    const allowed = new Set(expected.filter((t) => meetsBox(t, region)).map(rounded));
    if (!problem) for (const key of fromTree) if (!allowed.has(key)) problem = "gatherTree in a region: one whose box misses it";
    const drawnKeys = new Set(fromTree);
    if (!problem) for (const t of touching) if (!drawnKeys.has(rounded(t))) problem = "gatherTree in a region: one that meets it missing";
    if (!problem && keeper) {
        const listed = new TriangleSink();
        listed.begin();
        gatherEntries(keeper, "dynamic", region, listed);
        problem = sameSet(drawn(listed), [...allowed], "gatherEntries in a region");
    }
    say(`${name}: within a region`, problem, `${touching.length} meet it, ${allowed.size} by their boxes, ${fromTree.length} gathered from the tree`);
}

// ---- 1 and 2: a tree made whole, and a keeper's mended ------------------------------------

{
    const pieces = [];
    for (let i = 0; i < 220; i++) pieces.push(piece());
    const tree = buildOctree(pieces);
    const expected = meshTriangles(pieces);
    checkTree("buildOctree", tree, expected);
    const ats = new Set(uniqueTriangles(tree).map((t) => t.at));
    say("buildOctree: every triangle's place in the build met once", ats.size === expected.length && Math.max(...ats) === expected.length - 1 ? null : `${ats.size} places for ${expected.length}`);

    const keeper = new TreeKeeper();
    const sources = () => pieces.map((group) => ({ key: group, root: group }));
    keeper.update(sources());
    let mended = 0;
    for (let round = 0; round < 12; round++) {
        // One in the middle moved a little (the box round them all stays), now and then one added or taken away.
        const group = pick(pieces.slice(20, 200));
        group.position.x += rnd() * 0.6 - 0.3;
        group.position.z += rnd() * 0.6 - 0.3;
        group.updateMatrixWorld(true);
        if (round % 4 === 1) pieces.splice(100, 0, (() => { const p = piece(); p.position.set(8, 0, 12); p.updateMatrixWorld(true); return p; })());
        if (round % 4 === 3) pieces.splice(60, 1);
        keeper.update(sources());
        if (keeper.last.how === "mended") mended++;
    }
    say("the keeper mended its tree in place", mended >= 6 ? null : `only ${mended} of 12 edits mended`, `${mended} of 12 mended`);
    checkTree("a keeper's tree after twelve edits", keeper.tree, meshTriangles(pieces), { keeper });
}

// ---- 1 and 2: while a big tree is built a slice a frame --------------------------------------

{
    const geometry = new THREE.SphereGeometry(0.5, 40, 30);
    const pieces = [];
    for (let i = 0; i < 90; i++) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(geometry));
        group.position.set(rnd() * 30 - 15, rnd() * 3, rnd() * 30 - 15);
        group.updateMatrixWorld(true);
        pieces.push(group);
    }
    const sources = () => pieces.map((group) => ({ key: group, root: group }));
    const place = (group, x, y, z) => {
        group.position.set(x, y, z);
        group.updateMatrixWorld(true);
    };
    const keeper = new TreeKeeper();
    keeper.update(sources());
    place(pieces[0], 40, 0, 0);
    place(pieces[7], pieces[7].position.x + 1, 0, pieces[7].position.z);
    keeper.update(sources(), { slice: true });
    say("a tree being built a slice a frame, the union handed out meanwhile", keeper.job && !keeper.job.stale && !keeper.tree.box ? null : "not the meanwhile union", `${keeper.last.how} (${keeper.last.why})`);
    checkTree("meanwhile", keeper.tree, meshTriangles(pieces), { keeper });
    while (keeper.job) keeper.step(4);
    checkTree("the slices done", keeper.tree, meshTriangles(pieces), { keeper });

    const before = meshTriangles(pieces);
    for (let i = 10; i < 50; i++) place(pieces[i], pieces[i].position.x, pieces[i].position.y, pieces[i].position.z + 1);
    keeper.update(sources(), { slice: true });
    say("forty moved at once: the tree left as it was (stale)", keeper.job?.stale ? null : "not stale");
    // What is walked is the tree as it was: that is what is drawn, its triangles' sources gone or not.
    checkTree("stale", keeper.tree, before);
    const sink = new TriangleSink();
    sink.begin();
    gatherTree(keeper.tree, "dynamic", null, sink, {});
    say("stale: each drawn as its entry says, gone or not", sink.counts[KIND.mesh] === before.length ? null : `${sink.counts[KIND.mesh]} drawn as meshes of ${before.length}`);
    keeper.update(sources());
}

// ---- 3: what each is drawn as ---------------------------------------------------------------

{
    const colliders = new THREE.Group();
    colliders.name = "colliders";
    const flight = new THREE.Group();
    flight.name = "stairs-collider:s1";
    flight.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 4)));
    colliders.add(flight);
    const chair = piece();
    const boxed = piece();
    const builder = { colliders, worldEdge: new THREE.Group(), staticColliders: new THREE.Group() };
    const sources = [
        { key: flight, root: flight },
        {
            key: boxed,
            stamp: [1, 2, 3],
            label: "Wardrobe",
            mesh: () => {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.6));
                mesh.updateMatrixWorld(true);
                return mesh;
            },
        },
        { key: chair, root: chair },
    ];
    const keeper = new TreeKeeper();
    keeper.update(sources);
    const sink = new TriangleSink();
    sink.begin();
    gatherEntries(keeper, "dynamic", null, sink, builder);
    const chairCount = meshTriangles([chair]).length;
    const kinds = sink.counts;
    say(
        "a flight's ramp, a piece as its box, a piece as its mesh",
        kinds[KIND.stairs] === 12 && kinds[KIND.box] === 12 && kinds[KIND.mesh] === chairCount ? null : `stairs ${kinds[KIND.stairs]}, box ${kinds[KIND.box]}, mesh ${kinds[KIND.mesh]} of ${chairCount}`
    );

    // A wall with a stairwell's rail in it: the rail's triangles, and only they, drawn as a blocker.
    const wall = new THREE.Group();
    const face = new THREE.Mesh(new THREE.BoxGeometry(4, 2.7, 0.2));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.06));
    rail.name = "blocker";
    rail.position.set(0, 3.5, 1);
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 2, 2));
    wall.add(face, rail, trim);
    wall.updateMatrixWorld(true);
    const edge = new THREE.Group();
    edge.add(new THREE.Mesh(new THREE.CylinderGeometry(50, 50, 80, 16, 1, true)));
    edge.updateMatrixWorld(true);
    const buildingKeeper = new TreeKeeper();
    buildingKeeper.update([{ key: edge, root: edge }, { key: wall, root: wall }]);
    const entry = buildingKeeper.entries.get(wall);
    const known = entryKind(entry, "static", { ...builder, worldEdge: edge });
    const building = new TriangleSink();
    building.begin();
    gatherEntries(buildingKeeper, "static", null, building, { ...builder, worldEdge: edge });
    say(
        "a wall's blocker drawn as a blocker, the rest of it as the building; the world's edge as a blocker",
        known.runs?.length === 3 && building.counts[KIND.blocker] === 12 + 32 && building.counts[KIND.static] === 12 + 8 ? null : `runs ${JSON.stringify(known.runs)}, blocker ${building.counts[KIND.blocker]}, static ${building.counts[KIND.static]}`
    );
    // The same from the tree, by each triangle's entry and place in it.
    const fromTree = new TriangleSink();
    fromTree.begin();
    gatherTree(buildingKeeper.tree, "static", null, fromTree, { builder: { ...builder, worldEdge: edge } });
    say("and the same gathered from its tree", fromTree.counts[KIND.blocker] === 44 && fromTree.counts[KIND.static] === 20 ? null : `blocker ${fromTree.counts[KIND.blocker]}, static ${fromTree.counts[KIND.static]}`);

    // A published view's: labels only. Two boxes of one label are a piece met as its box; a sphere is a mesh.
    const labelled = (geometry, label, x) => {
        const mesh = new THREE.Mesh(geometry);
        mesh.position.x = x;
        mesh.userData.label = label;
        mesh.updateMatrixWorld(true);
        return mesh;
    };
    const runtime = buildOctree([
        labelled(new THREE.BoxGeometry(1, 1, 1), "Chest", 0),
        labelled(new THREE.BoxGeometry(1, 2, 1).rotateY(0.4), "Chest", 3),
        labelled(new THREE.SphereGeometry(0.5, 8, 6), "Lamp", 6),
        labelled(new THREE.BoxGeometry(0.06, 1, 3), "Balustrade", 9),
        labelled(new THREE.BoxGeometry(1, 0.3, 3), "Stair treads — Concrete", 12),
        // Two boxes sharing a corner: fifteen corners for two, not taken for boxes; nor a box cut in two along its length.
        labelled(new THREE.BoxGeometry(1, 1, 1), "Bench", 15),
        labelled(new THREE.BoxGeometry(1, 1, 1).translate(1, 1, 1), "Bench", 15),
        labelled(new THREE.BoxGeometry(2, 1, 1, 2, 1, 1), "Shelf", 18),
    ]);
    const all = uniqueTriangles(runtime);
    const boxes = boxedLabels(all);
    say("a published view's boxes found by their corners", boxes.has("Chest") && !boxes.has("Lamp") && !boxes.has("Bench") && !boxes.has("Shelf") ? null : `boxed: ${[...boxes].join(", ")}`);
    const kindsByLabel = Object.fromEntries(["Chest", "Lamp", "Balustrade", "Stair treads — Concrete", "Bench"].map((label) => [label, KINDS[labelKind(label, "dynamic", boxes)].id]));
    say(
        "and each label drawn as what it is",
        kindsByLabel.Chest === "box" && kindsByLabel.Lamp === "mesh" && kindsByLabel.Balustrade === "stairs" && kindsByLabel["Stair treads — Concrete"] === "stairs" && kindsByLabel.Bench === "mesh" &&
            KINDS[labelKind("Stair rail", "static", null)].id === "blocker" && KINDS[labelKind("Edge of the world", "static", null)].id === "blocker" && KINDS[labelKind("Window", "static", null)].id === "blocker" && KINDS[labelKind("Wall — Warm white", "static", null)].id === "static" &&
            KINDS[labelKind("Pool steps", "static", null)].id === "stairs"
            ? null
            : JSON.stringify(kindsByLabel),
        JSON.stringify(kindsByLabel)
    );
}

// ---- 4: which edges are drawn ---------------------------------------------------------------

{
    const sink = new TriangleSink();
    sink.begin();
    const hidden = () => sink.kinds[(sink.count - 1) * 3] >> 5;
    sink.put(0, 0, 0, 2, 0, 0, 0, 1, 0, 0, -1);
    const right = hidden();
    sink.put(0, 0, 0, 2, 0, 0, 1, 1.7320508, 0, 0, -1);
    const equilateral = hidden();
    sink.put(2, 0, 0, 0, 1, 0, 0, 0, 0, 0, -1);
    const turned = hidden();
    say("a right triangle's long edge left out, and no edge of one with no square corner", right === 1 && equilateral === 0 && turned === 3 ? null : `right ${right}, equilateral ${equilateral}, turned ${turned}`);

    sink.begin();
    sink.box(new THREE.Vector3(1, 2, 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, 0)), new THREE.Vector3(0.5, 1, 0.02), KIND.door);
    let boxHidden = 0;
    for (let i = 0; i < sink.count; i++) if (sink.kinds[i * 3] >> 5) boxHidden++;
    say("a box: twelve triangles, each with its side's diagonal left out", sink.count === 12 && boxHidden === 12 && sink.counts[KIND.door] === 12 ? null : `${sink.count} triangles, ${boxHidden} with an edge left out`);

    sink.begin();
    sink.capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1.55, 0), 0.35, KIND.player);
    // Ten rings, nine bands of twelve quads, less a triangle each at either tip.
    say("a capsule: its quads' diagonals left out, a triangle at each tip", sink.count === 9 * 12 * 2 - 24 ? null : `${sink.count} triangles`, `${sink.count} triangles`);
    let far = 0;
    for (let i = 0; i < sink.count * 3; i++) {
        const x = sink.positions[i * 3], y = sink.positions[i * 3 + 1], z = sink.positions[i * 3 + 2];
        const along = Math.min(Math.max(y, 0.35), 1.55);
        if (Math.abs(Math.hypot(x, y - along, z) - 0.35) > 1e-5) far++;
    }
    say("and every corner of it on the capsule", far ? `${far} corners off it` : null);
}

for (const { name, problem, note } of results) {
    console.log(`${problem ? "FAIL" : "ok  "} ${name}${note ? `\n       ${note}` : ""}`);
    if (problem) console.log(`       NOT EXPECTED: ${problem}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

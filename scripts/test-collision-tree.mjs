/**
 * The collision trees (frontend/Experience/World/Collision.js) on made-up
 * furniture: `node scripts/test-collision-tree.mjs`. Exits 1 if any of
 * these does not hold:
 *
 *   1. `buildOctree` cuts the tree the committed code cut: three's own
 *      Box3.intersectsTriangle asked of every triangle and every cell, with
 *      the app's rule for when a cell is divided — the same box, the same
 *      cells, each with the same triangles in the same order (the order is
 *      what a capsule is pushed out by: the walk).
 *   2. A `TreeKeeper`'s tree after an edit — a piece moved among the
 *      others, moved beyond them all and back, added, taken away, the last
 *      one taken and a first one put, the order changed, many at once — is
 *      that same tree, mended where the box round all the pieces stayed as
 *      it was and built again where it did not.
 *   3. While a big tree is built again a slice a frame, the tree handed
 *      out meanwhile holds every piece where it stands now and nothing
 *      where one stood: the same triangles, and a ball anywhere touches
 *      something in it exactly when it does in the tree built from scratch.
 *      When the slices are done it is that tree.
 */
import * as THREE from "three";
import { Octree } from "three/examples/jsm/math/Octree.js";
import { TreeKeeper, buildOctree } from "../frontend/Experience/World/Collision.js";

let seed = 20261014;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const results = [];
let failed = 0;
const say = (name, problem, note = "") => {
    results.push({ name, problem, note });
    if (problem) failed++;
};

/** The split as committed before the keeper (git b15adca, World/Collision.js), over three's Octree. */
class Committed extends Octree {
    split(level) {
        if (!this.box) return this;
        const parentCount = this.triangles.length;
        const half = new THREE.Vector3().copy(this.box.max).sub(this.box.min).multiplyScalar(0.5);
        const subTrees = [];
        for (let x = 0; x < 2; x++) {
            for (let y = 0; y < 2; y++) {
                for (let z = 0; z < 2; z++) {
                    const box = new THREE.Box3();
                    box.min.copy(this.box.min).add(new THREE.Vector3(x, y, z).multiply(half));
                    box.max.copy(box.min).add(half);
                    subTrees.push(new Committed(box));
                }
            }
        }
        let triangle;
        while ((triangle = this.triangles.pop())) {
            for (const sub of subTrees) if (sub.box.intersectsTriangle(triangle)) sub.triangles.push(triangle);
        }
        const small = Math.min(half.x, half.y, half.z) < 0.25;
        for (const sub of subTrees) {
            const count = sub.triangles.length;
            if (count > 8 && level < 16 && !small && count < parentCount) sub.split(level + 1);
            if (count !== 0) this.subTrees.push(sub);
        }
        return this;
    }
}

function committedTree(roots, skip) {
    const tree = new Committed();
    let count = 0;
    const visit = (object) => {
        if (skip(object)) return;
        if (object.isMesh) {
            const position = object.geometry.attributes.position;
            const index = object.geometry.index;
            const n = index ? index.count : position.count;
            for (let i = 0; i < n; i += 3) {
                const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(object.matrixWorld));
                tree.addTriangle(new THREE.Triangle(a, b, c));
                count++;
            }
        }
        for (const child of object.children) visit(child);
    };
    for (const root of roots) visit(root);
    return count ? tree.build() : tree;
}

const corners = (t) => `${t.a.x},${t.a.y},${t.a.z};${t.b.x},${t.b.y},${t.b.z};${t.c.x},${t.c.y},${t.c.z}`;

/** Where two trees first differ — box, triangles in order, cells — or null. */
function differ(a, b, path = "root") {
    if (Boolean(a.box) !== Boolean(b.box)) return `${path}: one has no box`;
    if (a.box && !(a.box.min.equals(b.box.min) && a.box.max.equals(b.box.max))) return `${path}: another box`;
    if (a.triangles.length !== b.triangles.length) return `${path}: ${a.triangles.length} against ${b.triangles.length} triangles`;
    for (let i = 0; i < a.triangles.length; i++) if (corners(a.triangles[i]) !== corners(b.triangles[i])) return `${path}: triangle ${i} is another`;
    if (a.subTrees.length !== b.subTrees.length) return `${path}: ${a.subTrees.length} against ${b.subTrees.length} cells`;
    for (let i = 0; i < a.subTrees.length; i++) {
        const why = differ(a.subTrees[i], b.subTrees[i], `${path}/${i}`);
        if (why) return why;
    }
    return null;
}

function shape(tree) {
    const out = { cells: 0, leaves: 0, depth: 0, largest: 0 };
    const visit = (node, depth) => {
        out.cells++;
        if (depth > out.depth) out.depth = depth;
        if (node.triangles.length) {
            out.leaves++;
            if (node.triangles.length > out.largest) out.largest = node.triangles.length;
        }
        for (const sub of node.subTrees) visit(sub, depth + 1);
    };
    visit(tree, 0);
    return out;
}

// ---- 1 and 2: a house of small pieces ---------------------------------------

const skip = (object) => Boolean(object.userData.helper);

function piece() {
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
        group.add(mesh);
    }
    group.position.set(rnd() * 16, rnd() < 0.3 ? 3 : 0, rnd() * 24);
    group.rotation.y = rnd() < 0.4 ? 0 : rnd() * 6;
    group.updateMatrixWorld(true);
    return group;
}

{
    let pieces = [];
    for (let i = 0; i < 260; i++) pieces.push(piece());
    const keeper = new TreeKeeper(skip);
    const sources = () => pieces.map((group) => ({ key: group, root: group }));
    const place = (group, x, y, z) => {
        group.position.set(x, y, z);
        group.updateMatrixWorld(true);
    };
    /** One that is not the outermost any way: moved a little, the box round them all stays. */
    const inner = () => {
        const box = new THREE.Box3();
        for (const group of pieces) box.expandByObject(group);
        for (;;) {
            const group = pick(pieces);
            const own = new THREE.Box3().setFromObject(group);
            if (own.min.x > box.min.x + 3 && own.max.x < box.max.x - 3 && own.min.z > box.min.z + 3 && own.max.z < box.max.z - 3 && own.min.y > box.min.y + 0.01 && own.max.y < box.max.y - 0.5) return group;
        }
    };
    const check = (name, expected) => {
        const tree = keeper.update(sources());
        const did = `${keeper.last.how}${keeper.last.why ? ` (${keeper.last.why})` : ""}`;
        const problem =
            differ(tree, buildOctree(pieces, skip)) ?? differ(tree, committedTree(pieces, skip)) ?? (expected && !did.startsWith(expected) ? `${did}, where ${expected} was expected` : null);
        const { cells, leaves, depth, largest } = shape(tree);
        say(name, problem, `${did}: ${keeper.last.triangles} of ${keeper.last.total} triangles changed; ${cells} cells, ${leaves} leaves, ${depth} levels, largest ${largest}`);
    };

    check("as built", "built");
    const moved = inner();
    const from = moved.position.clone();
    place(moved, from.x + 1.3, from.y, from.z - 0.7);
    check("a piece moved among the others", "mended");
    place(moved, from.x, from.y, from.z);
    check("and put back (undo)", "mended");
    place(moved, 60, 0, -45);
    check("a piece carried beyond all the others", "built (bounds)");
    place(moved, from.x, from.y, from.z);
    check("and put back (undo)", "built (bounds)");
    const added = piece();
    place(added, 8, 0, 12);
    pieces.push(added);
    check("a piece added among the others", "mended");
    pieces.pop();
    check("and taken away (undo)", "mended");
    const far = piece();
    place(far, -40, 0, 70);
    pieces.push(far);
    check("a piece added beyond the others", "built (bounds)");
    pieces.pop();
    check("and taken away (undo)", "built (bounds)");
    for (let round = 0; round < 40; round++) {
        const kind = round % 8;
        if (kind === 0) {
            const group = pick(pieces);
            place(group, group.position.x + rnd() * 4 - 2, group.position.y, group.position.z + rnd() * 4 - 2);
        } else if (kind === 1) {
            for (let i = 0; i < 6; i++) {
                const group = pick(pieces);
                group.rotation.y += rnd() * 3;
                place(group, group.position.x, rnd() < 0.5 ? 0 : 3, group.position.z);
            }
        } else if (kind === 2) {
            pieces.splice(Math.floor(rnd() * pieces.length), 3);
        } else if (kind === 3) {
            for (let i = 0; i < 4; i++) pieces.splice(Math.floor(rnd() * pieces.length), 0, piece());
        } else if (kind === 4) {
            const group = pick(pieces);
            group.scale.setScalar(0.5 + rnd() * 2);
            group.updateMatrixWorld(true);
        } else if (kind === 5) {
            const position = pick(pieces).children[0].geometry.attributes.position;
            for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) * 1.3);
            position.needsUpdate = true;
        } else if (kind === 6) {
            const mesh = pick(pieces).children[0];
            mesh.userData.helper = !mesh.userData.helper;
        } else {
            const group = pick(pieces);
            group.remove(group.children[0]);
            group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
            group.updateMatrixWorld(true);
        }
        check(`edit ${round + 1} of 40 at random (kind ${kind})`, null);
    }
    for (let i = 0; i < 120; i++) {
        const group = pick(pieces);
        place(group, group.position.x + 1, group.position.y, group.position.z);
    }
    check("120 pieces moved at once", "built");
    pieces.reverse();
    check("the order of the pieces turned round", "built (order)");
    const kept = pieces;
    pieces = [];
    check("every piece taken away", "built (empty)");
    pieces = [kept[0]];
    check("a first piece put", "built (empty)");
    pieces = kept;
    check("and the rest", "built");
}

// ---- 3: a tree big enough to be built a slice a frame -----------------------

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
    const was = [];

    /** The tree handed out while another is built: every triangle of the pieces as they stand, none other, and found wherever a ball is put. */
    const meanwhile = (name, expectStale) => {
        const tree = keeper.tree;
        const scratch = buildOctree(pieces);
        const mine = new Set();
        const theirs = new Set();
        const gatherInto = (set) => function visit(node) {
            for (const triangle of node.triangles) set.add(corners(triangle));
            for (const sub of node.subTrees) visit(sub);
        };
        gatherInto(mine)(tree);
        gatherInto(theirs)(scratch);
        let problem = null;
        if (!keeper.job) problem = "no tree is being built";
        else if (keeper.job.stale !== expectStale) problem = `stale is ${keeper.job.stale}`;
        else if (!expectStale) {
            if (mine.size !== theirs.size) problem = `${mine.size} triangles against ${theirs.size}`;
            else for (const key of theirs) if (!mine.has(key)) problem = "a triangle is missing";
            let wrong = 0;
            const sphere = new THREE.Sphere(new THREE.Vector3(), 0.3);
            const spots = [...pieces.map((group) => group.position), ...was];
            for (let i = 0; i < 6000 && !problem; i++) {
                sphere.center.copy(spots[i % spots.length]).add(new THREE.Vector3(rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8));
                if (Boolean(tree.sphereIntersect(sphere)) !== Boolean(scratch.sphereIntersect(sphere))) wrong++;
            }
            if (wrong) problem = `${wrong} of 6000 balls touch in one tree and not the other`;
        }
        say(name, problem, `${keeper.last.how} (${keeper.last.why}), ${keeper.last.triangles} of ${keeper.last.total} triangles changed, ${keeper.last.ms.toFixed(1)} ms`);
    };
    const done = (name) => {
        let steps = 0;
        while (keeper.job) {
            keeper.step(2);
            steps++;
        }
        say(name, differ(keeper.tree, buildOctree(pieces)) ?? differ(keeper.tree, committedTree(pieces, () => false)), `${steps} slices of 2 ms`);
    };
    const carry = (group, x, y, z) => {
        was.push(group.position.clone());
        place(group, x, y, z);
    };

    carry(pieces[0], 40, 0, 0);
    keeper.update(sources(), { slice: true });
    meanwhile("meanwhile: a piece carried beyond all the others", false);
    keeper.step(2);
    carry(pieces[5], pieces[5].position.x, pieces[5].position.y + 1, pieces[5].position.z);
    carry(pieces[0], 44, 0, 3);
    was.push(pieces[9].position.clone());
    pieces.splice(9, 1);
    keeper.update(sources(), { slice: true });
    meanwhile("meanwhile: three more edits while it is built (one moved, the far one again, one taken away)", false);
    done("when the slices are done");
    carry(pieces[0], 2, 0, 2);
    keeper.update(sources(), { slice: true });
    meanwhile("meanwhile: the far piece brought back", false);
    done("when the slices are done");
    for (let i = 60; i < 70; i++) carry(pieces[i], pieces[i].position.x + 1, pieces[i].position.y, pieces[i].position.z);
    carry(pieces[0], -40, 0, 9);
    keeper.update(sources(), { slice: true });
    meanwhile("meanwhile: ten pieces moved and one carried out again", false);
    done("when the slices are done");
    const before = keeper.tree;
    for (let i = 10; i < 50; i++) place(pieces[i], pieces[i].position.x, pieces[i].position.y, pieces[i].position.z + 1);
    keeper.update(sources(), { slice: true });
    meanwhile("forty pieces moved at once: left as it was, and said to be", true);
    say("the tree as it was is the one handed out", keeper.tree === before ? null : "another tree was handed out");
    keeper.update(sources());
    say("an update that waits finishes it", keeper.job ? "still being built" : differ(keeper.tree, buildOctree(pieces)), `${keeper.last.how} (${keeper.last.why})`);
}

for (const { name, problem, note } of results) {
    console.log(`${problem ? "FAIL" : "ok  "} ${name}${note ? `\n       ${note}` : ""}`);
    if (problem) console.log(`       NOT EXPECTED: ${problem}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

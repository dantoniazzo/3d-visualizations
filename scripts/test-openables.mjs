/**
 * The furniture's doors and drawers (frontend/Experience/World/Openables.js)
 * on made-up pieces: `node scripts/test-openables.mjs`. Exits 1 if any of
 * these does not hold:
 *
 *   1. A door about the up axis and a drawer move exactly as they did before
 *      `opens.axis` (the committed place(), transcribed); a door about any
 *      other axis turns about it in its parent's frame; a model's axis that
 *      is no direction is the up axis; `label` names a part, and its kind
 *      does without one.
 *   2. A part as a public view has it — standing in the world, its motion
 *      turned by the `turn` its runtime file gives (Publish/Runtime.js,
 *      SceneBuilder.buildFromRuntime) — is where the editor's is at every
 *      share of open, for a door, a flap and a drawer of a piece turned
 *      every way and of one whose model is turned in it; and a version
 *      published before `turn` keeps its drawers' and doors' old motion.
 *   3. A light inside a piece follows its fridge's doors where the piece
 *      has any, and every door of a piece that has none. The light lent to
 *      them is out of the scene's light (hidden) while nothing of its kind
 *      is lit, comes in as one is — at once, or once what builds its shaders
 *      ahead (`prepare`) is done, if one is still lit by then — and goes
 *      out LINGER (4) seconds after the last goes out; built ahead while a
 *      part of its piece is aimed at (warm), once for the shaders there are.
 *   4. What a piece with doors collides as (shutParts, shutBox, shutProxy,
 *      as SceneBuilder.collisionOf, dynamicCollisionRoots and
 *      dynamicCollisionSources use them): each part's box where it is shut
 *      however it stands; the piece's box shut; a TreeKeeper's tree over
 *      the sources the same as buildOctree's over the roots, before and
 *      after a door is opened and a piece moved; and, walked against, an
 *      L-shaped kitchen's inside corner clear (its whole box walled it off),
 *      its open cupboard not walked into, its open door walked through.
 *   5. The prompt says what the model calls a part, the touch button has a
 *      drawer's or a door's icon, and busy() names a part on the move.
 *   6. A way in — a shower's glass door — has no box with the others
 *      (shutParts' `wayIn`), but bars the way as a room's door's leaf does
 *      (getBlockers, Door.resolveCapsule) while shut and until it is open
 *      0.3, and not once it is; a cupboard's door never does.
 *   7. A part opens as far as nothing is in its way (Openable.plan,
 *      clearance): a door stops where its corner meets a chair's back, a
 *      drawer where its front meets a WC, to a hundredth of a degree or a
 *      tenth of a millimetre of where they meet worked out by hand; what is
 *      its own piece's, or what it meets already shut, is not in its way;
 *      a pull at a door's free edge does not swing round its hinge into
 *      the wall beside it; stopped short, it moves no less quickly, a way
 *      in bars the way by how far it has really swung, and a part caught on
 *      its way shut opens again as far as before; the plan is kept until a
 *      tree changes; and with nothing in the way it moves bit for bit as
 *      before.
 */
import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";

import Openables, { Openable, isWayIn, shutBox, shutParts, shutProxy, triangleMeetsBox } from "../frontend/Experience/World/Openables.js";
import Door from "../frontend/Experience/World/Door.js";
import { TreeKeeper, buildOctree, isTransient } from "../frontend/Experience/World/Collision.js";
import Interactables from "../frontend/Experience/World/Interactables.js";

const results = [];
let failed = 0;
const say = (name, problem, note = "") => {
    results.push({ name, problem, note });
    if (problem) failed++;
};
const EPS = 1e-9;
const near = (a, b, eps = EPS) => Math.abs(a - b) <= eps;
const matricesDiffer = (a, b, eps = 1e-9) => {
    for (let i = 0; i < 16; i++) if (!near(a.elements[i], b.elements[i], eps)) return `element ${i}: ${a.elements[i]} against ${b.elements[i]}`;
    return null;
};
const SHARES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

/** The committed Openable.place (git 5876694), for a part's quaternion and position at a share of open. */
function committedPlace(opens, restPosition, restQuaternion, open) {
    const eased = 1 - Math.pow(1 - open, 2);
    const position = restPosition.clone();
    const quaternion = restQuaternion.clone();
    if (opens.type === "slide") position.addScaledVector(new THREE.Vector3(...(opens.direction ?? [0, 0, 1])), eased * opens.distance);
    else quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), eased * opens.angle));
    return { position, quaternion };
}

/** A part's node, as join_piece makes one: its origin on its hinge, a slab hung from it. */
function partNode(opens, { at = [0, 0, 0], size = [0.6, 0.7, 0.02], offset = [0.3, 0.35, 0.01], name = "door1" } = {}) {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...at);
    node.userData.opens = opens;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(...size));
    slab.position.set(...offset);
    node.add(slab);
    return node;
}

/** Share `t` of open, set and placed at once. */
function setShare(part, t) {
    part.open = t;
    part.target = t;
    part.place();
    part.node.updateMatrixWorld(true);
}

// ---- 1: motion ---------------------------------------------------------------

{
    const cases = [
        { opens: { type: "hinge", angle: 1.6326 }, why: "a door, no axis" },
        { opens: { type: "hinge", angle: -1.8326 }, why: "a door the other way" },
        { opens: { type: "slide", distance: 0.4125, direction: [0, 0, 1] }, why: "a drawer" },
        { opens: { type: "slide", distance: 0.3, direction: [0, 0, -1] }, why: "a vanity's drawer" },
        { opens: { type: "slide", distance: 0.24 }, why: "a drawer with no direction" },
    ];
    for (const { opens, why } of cases) {
        const node = partNode(opens, { at: [0.12, 0.3, -0.27] });
        node.quaternion.setFromEuler(new THREE.Euler(0, 0.4, 0));
        const restPosition = node.position.clone();
        const restQuaternion = node.quaternion.clone();
        const part = new Openable(node, "p");
        let problem = null;
        for (const t of SHARES) {
            setShare(part, t);
            const old = committedPlace(opens, restPosition, restQuaternion, t);
            if (!node.position.equals(old.position) || !node.quaternion.equals(old.quaternion)) problem ??= `at ${t}: [${node.position.toArray()}] ${node.quaternion.toArray()} against [${old.position.toArray()}] ${old.quaternion.toArray()}`;
        }
        say(`as before: ${why}`, problem, "position and quaternion bit for bit at 7 shares");
    }

    // A flap about its bottom edge (the parent's X), dropping forward (+Z) by 80°: its top edge comes down and out.
    {
        const node = partNode({ type: "hinge", angle: THREE.MathUtils.degToRad(80), axis: [1, 0, 0] }, { size: [0.6, 0.5, 0.02], offset: [0, 0.25, 0.01] });
        const parent = new THREE.Group();
        parent.add(node);
        const part = new Openable(node, "p");
        setShare(part, 1);
        const top = new THREE.Vector3(0, 0.5, 0).applyMatrix4(node.matrixWorld);
        const expected = new THREE.Vector3(0, 0.5 * Math.cos(THREE.MathUtils.degToRad(80)), 0.5 * Math.sin(THREE.MathUtils.degToRad(80)));
        say("a flap turns about its own axis", top.distanceTo(expected) < 1e-9 ? null : `top edge at [${top.toArray()}], expected [${expected.toArray()}]`, `top edge to [${expected.toArray().map((n) => n.toFixed(3))}]`);
    }
    // An axis in the parent's frame, a parent turned: the same motion as about the turned axis in the world.
    {
        const parent = new THREE.Group();
        parent.rotation.y = 0.9;
        const node = partNode({ type: "hinge", angle: -1.2, axis: [0, 0, 2] });
        parent.add(node);
        const part = new Openable(node, "p");
        setShare(part, 0.6);
        const eased = 1 - Math.pow(1 - 0.6, 2);
        const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), eased * -1.2);
        say("an axis is its parent's, and need not be a unit", node.quaternion.angleTo(expected) < 1e-9 ? null : `off by ${node.quaternion.angleTo(expected)} rad`, "[0, 0, 2] taken as [0, 0, 1]");
    }
    {
        const bad = [[0, 0, 0], "x", [1, 2], [NaN, 1, 0], null];
        const problems = bad.filter((axis) => !new Openable(partNode({ type: "hinge", angle: 1, axis }), "p").axis.equals(new THREE.Vector3(0, 1, 0)));
        say("an axis that is no direction is the up axis", problems.length ? `${JSON.stringify(problems)} not up` : null, `${bad.length} kinds`);
    }
    {
        const words = [
            [{ type: "hinge", angle: 1 }, "door", "door"],
            [{ type: "slide", distance: 0.2 }, "drawer", "drawer"],
            [{ type: "hinge", angle: 1, label: "fridge" }, "fridge", "door"],
            [{ type: "slide", distance: 0.15, label: "detergent drawer" }, "detergent drawer", "drawer"],
            [{ type: "hinge", angle: 1.7, label: " washing machine " }, "washing machine", "door"],
            [{ type: "hinge", angle: 1, label: "  " }, "door", "door"],
            [{ type: "hinge", angle: 1, label: 7 }, "door", "door"],
        ];
        const wrong = words.filter(([opens, label, kind]) => {
            const part = new Openable(partNode(opens), "p");
            return part.label !== label || part.kind !== kind;
        });
        say("a part's label and kind", wrong.length ? JSON.stringify(wrong) : null, `${words.length} parts`);
    }
}

// ---- 2: as a public view has them --------------------------------------------

/** A placed piece: the furniture group, the model in it (turned by the catalogue's yaw), a part in that. */
function placedPiece(opens, { yaw = 0, turn = 0.7, at = [3.2, 0, -5.1], scale = 1, partAt = [0.21, 0.4, 0.29] } = {}) {
    const group = new THREE.Group();
    group.userData = { kind: "furniture", id: "f1", label: "Test unit" };
    group.position.set(...at);
    group.rotation.y = turn;
    group.scale.setScalar(scale);
    const model = new THREE.Group();
    model.rotation.y = yaw;
    group.add(model);
    const node = partNode(opens, { at: partAt });
    model.add(node);
    const carcass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.58));
    carcass.position.set(0, 0.4, 0);
    model.add(carcass);
    group.updateMatrixWorld(true);
    return { group, node };
}

/** As Publish/Runtime.js writes a part: shut, in the world; and as the view loads it, with `turn` or without (a version before it). */
function published(node, part, { withTurn = true } = {}) {
    const holder = new THREE.Group();
    const local = new THREE.Matrix4().compose(part.restPosition, part.restQuaternion, node.scale);
    holder.applyMatrix4(node.parent.matrixWorld.clone().multiply(local));
    const turn = node.parent.getWorldQuaternion(new THREE.Quaternion()).toArray();
    holder.userData = { piece: "f1", label: "Test unit", opens: node.userData.opens, ...(withTurn && { turn }) };
    for (const mesh of node.children) holder.add(mesh.clone());
    const view = new THREE.Group();
    view.name = "openable";
    view.add(holder);
    view.updateMatrixWorld(true);
    const openables = new Openables();
    openables.add(view);
    const copy = openables.of(holder);
    // (SceneBuilder.buildFromRuntime, as it stands.)
    if (holder.userData.turn) copy.turnFrame(new THREE.Quaternion().fromArray(holder.userData.turn));
    else if (copy.opens.type === "slide") copy.direction.applyQuaternion(holder.quaternion);
    return { holder, copy };
}

{
    const kinds = [
        ["a door", { type: "hinge", angle: -1.8326 }],
        ["a flap", { type: "hinge", angle: 1.4, axis: [1, 0, 0] }],
        ["a tilted hinge", { type: "hinge", angle: 0.9, axis: [0.3, 0.2, 0.9] }],
        ["a drawer", { type: "slide", distance: 0.41, direction: [0, 0, 1] }],
        ["a sideways drawer", { type: "slide", distance: 0.15, direction: [1, 0, 0] }],
    ];
    const poses = [
        { turn: 0, yaw: 0 },
        { turn: Math.PI / 2, yaw: 0 },
        { turn: -2.31, yaw: 0 },
        { turn: 0.7, yaw: Math.PI / 2 },
        { turn: 3.0, yaw: -1.1 },
    ];
    for (const [name, opens] of kinds) {
        let worst = 0;
        let problem = null;
        for (const pose of poses) {
            const { group, node } = placedPiece(opens, pose);
            const openables = new Openables();
            openables.add(group);
            const part = openables.of(node);
            const { holder, copy } = published(node, part);
            for (const t of SHARES) {
                setShare(part, t);
                setShare(copy, t);
                for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(holder.matrixWorld.elements[i] - node.matrixWorld.elements[i]));
                const why = matricesDiffer(holder.matrixWorld, node.matrixWorld, 1e-9);
                if (why) problem ??= `turn ${pose.turn}, yaw ${pose.yaw}, at ${t}: ${why}`;
            }
        }
        say(`published, where the editor has it: ${name}`, problem, `${poses.length} poses × ${SHARES.length} shares, worst ${worst.toExponential(1)}`);
    }

    // A version published before `turn`: its drawers turned with the holder, its doors about the up axis — as before.
    for (const [name, opens] of [kinds[0], kinds[3]]) {
        let problem = null;
        for (const pose of poses.filter((p) => p.yaw === 0)) {
            const { group, node } = placedPiece(opens, pose);
            const openables = new Openables();
            openables.add(group);
            const part = openables.of(node);
            const { holder, copy } = published(node, part, { withTurn: false });
            for (const t of SHARES) {
                setShare(part, t);
                setShare(copy, t);
                const why = matricesDiffer(holder.matrixWorld, node.matrixWorld, 1e-9);
                if (why) problem ??= `turn ${pose.turn} at ${t}: ${why}`;
            }
        }
        say(`a version published before 'turn': ${name} as before`, problem, "the piece only turned, as join_piece leaves a part");
    }
}

// ---- 3: a light inside a piece -----------------------------------------------

{
    const kitchen = new THREE.Group();
    kitchen.userData.id = "kitchen";
    const fridge = partNode({ type: "hinge", angle: -1.7, label: "fridge" }, { name: "door1" });
    const freezer = partNode({ type: "hinge", angle: -1.7, label: "freezer" }, { name: "door2" });
    const cupboard = partNode({ type: "hinge", angle: 1.7 }, { name: "door3" });
    const light = new THREE.Object3D();
    light.userData.fixture = { light: { power: 3, reach: 1.8, aim: [0, -1, 0] } };
    kitchen.add(fridge, freezer, cupboard, light);
    const lone = new THREE.Group();
    lone.userData.id = "fridge";
    const left = partNode({ type: "hinge", angle: 1.8 }, { name: "door1" });
    const right = partNode({ type: "hinge", angle: -1.8 }, { name: "door2" });
    const inside = new THREE.Object3D();
    inside.userData.fixture = { light: { power: 3 } };
    lone.add(left, right, inside);
    const openables = new Openables();
    openables.add(kitchen);
    openables.add(lone);
    const lit = (piece) => openables.lightOf(piece);
    const steps = (what) => {
        what.toggle();
        for (let i = 0; i < 60; i++) openables.update(1 / 60);
    };
    const seen = [];
    steps(openables.of(freezer));
    seen.push(["freezer open", lit("kitchen")]);
    steps(openables.of(cupboard));
    seen.push(["and a cupboard", lit("kitchen")]);
    steps(openables.of(fridge));
    seen.push(["and the fridge", lit("kitchen")]);
    steps(openables.of(fridge));
    seen.push(["the fridge shut again", lit("kitchen")]);
    steps(openables.of(right));
    seen.push(["a lone fridge's right door", lit("fridge")]);
    const full = 3 / (4 * Math.PI);
    const want = [0, 0, full, 0, full];
    const wrong = seen.filter(([, value], i) => !near(value, want[i], 1e-12));
    say("a light follows its fridge's doors, or any of a piece without", wrong.length ? JSON.stringify(wrong) : null, seen.map(([what, value]) => `${what}: ${value.toFixed(3)}`).join("; "));

    // One light of each kind, lent round (Openables' pool): however many fridges, the scene's lights are as many — so no
    // lit material is made again as one opens, and a frame costs what one fridge's light did.
    const second = new THREE.Group();
    second.userData.id = "kitchen-2";
    const door2 = partNode({ type: "hinge", angle: -1.7, label: "fridge" }, { name: "door1" });
    const light2 = new THREE.Object3D();
    light2.position.set(3, 1.2, 0);
    light2.userData.fixture = { light: { power: 3, reach: 1.8, aim: [0, -1, 0] } };
    second.add(door2, light2);
    const scene = new THREE.Scene();
    scene.add(kitchen, lone, second);
    openables.add(second);
    const lamps = () => {
        const found = [];
        scene.traverse((node) => node.isLight && found.push(node));
        return found;
    };
    const before = lamps().length;
    steps(openables.of(fridge));
    const firstAt = openables.pool.spot.getWorldPosition(new THREE.Vector3()).toArray();
    steps(openables.of(door2));
    const spot = openables.pool.spot;
    const lent = [spot.userData.lent?.piece, spot.getWorldPosition(new THREE.Vector3()).toArray(), spot.intensity];
    steps(openables.of(door2));
    const back = spot.userData.lent?.piece;
    steps(openables.of(fridge));
    const kinds = lamps().map((light) => light.type).sort();
    const problem =
        before !== 2 || lamps().length !== 2 || kinds.join() !== "PointLight,SpotLight"
            ? `${before} lights before, ${lamps().length} after (${kinds})`
            : lent[0] !== "kitchen-2" || !near(lent[1][0], 3, 1e-9) || !near(lent[2], full, 1e-12)
              ? `the second fridge opened: lent to ${lent[0]} at ${lent[1]}, ${lent[2]}`
              : back !== "kitchen" || !near(firstAt[0], 0, 1e-9)
                ? `shut again: lent to ${back}; first at ${firstAt}`
                : !near(spot.intensity, 0, 1e-12)
                  ? `all shut, the spot is at ${spot.intensity}`
                  : null;
    say("one light of each kind, lent to the fridge opened last", problem, `${lamps().length} lights for 3 pieces; the second fridge opened: lent to it at x ${lent[1][0]}, back to the first as it shuts and the first is open`);
    openables.remove(second);
    openables.remove(kitchen);
    say("a piece taken away takes its parts and lights", openables.parts.length === 2 && openables.lights.length === 1 && !openables.of(fridge) && !openables.pool.spot && openables.pool.point ? null : `${openables.parts.length} parts, ${openables.lights.length} lights left, spot ${Boolean(openables.pool.spot)}, point ${Boolean(openables.pool.point)}`);
}

{
    // In and out of the scene's light: with nothing to build ahead (node), at once; out LINGER seconds after the last.
    const piece = () => {
        const group = new THREE.Group();
        group.userData.id = "kitchen";
        const door = partNode({ type: "hinge", angle: -1.7, label: "fridge" }, { name: "door1" });
        const light = new THREE.Object3D();
        light.userData.fixture = { light: { power: 3, reach: 1.8, aim: [0, -1, 0] } };
        group.add(door, light);
        return { group, door };
    };
    const run = (openables, seconds) => {
        for (let t = 0; t < seconds; t += 1 / 60) openables.update(1 / 60);
    };
    {
        const { group, door } = piece();
        const openables = new Openables();
        openables.add(group);
        const spot = openables.pool.spot;
        const out = !spot.visible;
        openables.of(door).toggle();
        run(openables, 0.1);
        const lit = spot.visible && spot.intensity > 0;
        openables.of(door).toggle();
        run(openables, 1);
        const lingering = spot.visible && spot.intensity === 0;
        run(openables, 3.5);
        const gone = !spot.visible;
        say("the light lent round: out while all is shut, in as a fridge opens, out four seconds after it shuts", out && lit && lingering && gone ? null : `out ${out} lit ${lit} lingering ${lingering} gone ${gone}`);
    }
    {
        // With shaders to build ahead: in once they are, and not if the door has shut meanwhile; built ahead when aimed at.
        const { group, door } = piece();
        const asked = [];
        const prepare = (lights) => new Promise((resolve) => asked.push({ lights, resolve }));
        const openables = new Openables({ prepare });
        openables.add(group);
        const spot = openables.pool.spot;
        const part = openables.of(door);
        part.toggle();
        run(openables, 0.1);
        const waits = !spot.visible && asked.length === 1 && asked[0].lights[0] === spot;
        asked[0]?.resolve();
        await Promise.resolve();
        await Promise.resolve();
        const comes = spot.visible;
        part.toggle();
        run(openables, 5);
        // Opened and shut again before its shaders were built: it stays out.
        part.toggle();
        run(openables, 0.1);
        part.toggle();
        run(openables, 1);
        asked[1]?.resolve();
        await Promise.resolve();
        await Promise.resolve();
        const stays = !spot.visible && asked.length === 2;
        // Built for the shaders there are already as it came in: aimed at again, nothing more to build.
        openables.warm(part);
        const built = asked.length === 2;
        // A fresh view's fridge aimed at: built ahead, once for the shaders there are, and left out.
        const other = piece();
        const fresh = new Openables({ prepare });
        fresh.add(other.group);
        const aimed = fresh.of(other.door);
        fresh.warm(aimed);
        fresh.warm(aimed);
        const warming = asked.length === 3 && asked[2].lights[0] === fresh.pool.spot;
        asked[2]?.resolve();
        await Promise.resolve();
        await Promise.resolve();
        fresh.warm(aimed);
        const once = asked.length === 3 && !fresh.pool.spot.visible;
        say("built ahead: in once its shaders are, not if shut meanwhile; aimed at, built ahead once and left out", waits && comes && stays && built && warming && once ? null : `waits ${waits} comes ${comes} stays ${stays} built ${built} warming ${warming} once ${once} (${asked.length} asked)`);
    }
}

// ---- 4: what collides --------------------------------------------------------

/** A panel of a carcass: a box `size` with its middle at `at`. */
function panel(size, at) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
    mesh.position.set(...at);
    return mesh;
}

/**
 * A base unit, hollow, open at its front (+Z), `w` wide, its back at z 0:
 * the carcass's five panels, a shelf, and a door hung on its left edge (or
 * a drawer), as Ladonia's kitchens are to be.
 */
function unit(w, x0, { door = true, label = null, d = 0.58, h = 0.86, t = 0.018 } = {}) {
    const group = new THREE.Group();
    group.add(panel([w, t, d], [x0 + w / 2, t / 2, d / 2]));
    group.add(panel([w, t, d], [x0 + w / 2, h - t / 2, d / 2]));
    group.add(panel([t, h, d], [x0 + t / 2, h / 2, d / 2]));
    group.add(panel([t, h, d], [x0 + w - t / 2, h / 2, d / 2]));
    group.add(panel([w, h, t], [x0 + w / 2, h / 2, t / 2]));
    group.add(panel([w - 2 * t, t, d - t], [x0 + w / 2, h / 2, d / 2]));
    const opens = door ? { type: "hinge", angle: -1.75, ...(label && { label }) } : { type: "slide", distance: 0.45, direction: [0, 0, 1] };
    const front = partNode(opens, { at: [x0, 0.02, d], size: [w - 0.004, h - 0.04, 0.019], offset: [w / 2, (h - 0.04) / 2, 0.0095], name: door ? "door" : "drawer" });
    front.add(panel([0.02, 0.2, 0.03], [w - 0.06, h / 2, 0.034]));
    return { group, front };
}

/** An L-shaped kitchen: three units along its back (x), three along its side (turned to face +X), each a hollow cupboard. */
function lKitchen() {
    const piece = new THREE.Group();
    piece.userData = { kind: "furniture", id: "k1", label: "Kitchen" };
    const model = new THREE.Group();
    piece.add(model);
    for (let i = 0; i < 3; i++) {
        const { group, front } = unit(0.6, 0.6 + i * 0.6, { door: i !== 1 });
        group.add(front);
        model.add(group);
    }
    for (let i = 0; i < 3; i++) {
        const { group, front } = unit(0.6, -0.6 - (i + 1) * 0.6 + 0.6, { label: i === 2 ? "fridge" : null });
        group.add(front);
        // Turned to face +X, standing along x 0 … 0.58, from z 0.6 out.
        const arm = new THREE.Group();
        arm.rotation.y = Math.PI / 2;
        arm.position.set(0, 0, 0.6);
        arm.add(group);
        model.add(arm);
    }
    piece.position.set(4, 0, 2);
    piece.rotation.y = 0.35;
    piece.updateMatrixWorld(true);
    return piece;
}

const skipDynamic = (object) => isTransient(object) || object.name === "missing-model";

/** The sources, as SceneBuilder.dynamicCollisionSources makes them for pieces met as their mesh: the parts' boxes, then the pieces. */
function sourcesOf(pieces, openables) {
    const boxes = [];
    const meshes = [];
    for (const group of pieces) {
        meshes.push({ key: group, root: group });
        for (const part of shutParts(group, openables)) {
            boxes.push({
                key: part.node,
                label: group.userData.label,
                stamp: [...part.matrix.elements, ...part.box.min.toArray(), ...part.box.max.toArray()],
                mesh: () => {
                    const holder = new THREE.Group();
                    holder.add(shutProxy(part, group.userData.label));
                    holder.updateWorldMatrix(true, true);
                    return holder.children[0];
                },
            });
        }
    }
    return [...boxes, ...meshes];
}

/** The roots, as SceneBuilder.dynamicCollisionRoots makes them (and Publish/Runtime.js collides): the parts' boxes in a group, then the pieces. */
function rootsOf(pieces, openables) {
    const proxies = new THREE.Group();
    for (const group of pieces) for (const part of shutParts(group, openables)) proxies.add(shutProxy(part, group.userData.label));
    return [proxies, ...pieces];
}

const corners = (t) => `${t.a.x},${t.a.y},${t.a.z};${t.b.x},${t.b.y},${t.b.z};${t.c.x},${t.c.y},${t.c.z}`;
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

{
    const kitchen = lKitchen();
    const openables = new Openables();
    openables.add(kitchen);
    const parts = shutParts(kitchen, openables);

    // Each part's box where it is shut, however it stands: its world corners shut, against the proxy's.
    const cornersOf = (box, matrix) => {
        const out = [];
        for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 4 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 1 ? box.max.z : box.min.z).applyMatrix4(matrix));
        return out;
    };
    const shutCorners = parts.map(({ box, matrix }) => cornersOf(box, matrix));
    const shutBoxBefore = shutBox(kitchen, parts);
    for (const part of openables.parts) setShare(part, part.kind === "drawer" ? 1 : 0.8);
    kitchen.updateMatrixWorld(true);
    const after = shutParts(kitchen, openables);
    let worst = 0;
    after.forEach(({ box, matrix }, i) => cornersOf(box, matrix).forEach((p, k) => (worst = Math.max(worst, p.distanceTo(shutCorners[i][k])))));
    say("each part's box stands where it is shut, open or not", parts.length === 6 && worst < 1e-9 ? null : `${parts.length} parts, worst ${worst}`, `${parts.length} parts, opened 0.8 and drawn out; worst corner ${worst.toExponential(1)} m`);
    const box = shutBox(kitchen, after);
    say("the piece's box is its box shut, open or not", box.min.distanceTo(shutBoxBefore.min) < 1e-9 && box.max.distanceTo(shutBoxBefore.max) < 1e-9 ? null : `[${box.min.toArray()}] [${box.max.toArray()}] against [${shutBoxBefore.min.toArray()}] [${shutBoxBefore.max.toArray()}]`);
    // The proxy's eight corners (its geometry's, where it stands) are the shut box's.
    let proxyWorst = 0;
    after.forEach((shut, i) => {
        const proxy = shutProxy(shut, "Kitchen");
        proxy.updateMatrixWorld(true);
        const position = proxy.geometry.attributes.position;
        for (let k = 0; k < position.count; k++) {
            const p = new THREE.Vector3().fromBufferAttribute(position, k).applyMatrix4(proxy.matrixWorld);
            proxyWorst = Math.max(proxyWorst, Math.min(...shutCorners[i].map((c) => c.distanceTo(p))));
        }
        if (proxy.userData.label !== "Kitchen") proxyWorst = Infinity;
    });
    say("a part's proxy is its shut box, named as its piece", proxyWorst < 1e-6 ? null : `a corner ${proxyWorst} m off`, `worst ${proxyWorst.toExponential(1)} m`);

    // The keeper's tree over the sources against buildOctree's over the roots (the runtime file's): the same tree.
    const pieces = [kitchen, lKitchen()];
    pieces[1].position.set(-3, 0, 6);
    pieces[1].updateMatrixWorld(true);
    openables.add(pieces[1]);
    const keeper = new TreeKeeper(skipDynamic);
    const check = (name) => {
        const tree = keeper.update(sourcesOf(pieces, openables));
        const roots = rootsOf(pieces, openables);
        const problem = differ(tree, buildOctree(roots, skipDynamic));
        say(`the keeper's tree is the runtime's: ${name}`, problem, `${keeper.last.how}${keeper.last.why ? ` (${keeper.last.why})` : ""}, ${keeper.total} triangles`);
        return keeper.total;
    };
    for (const part of openables.parts) setShare(part, 0);
    const first = check("as loaded");
    setShare(openables.parts[0], 1);
    check("a door opened");
    say("a door opened changes nothing in the tree", keeper.last.how === "same" ? null : keeper.last.how);
    pieces[1].position.x += 0.4;
    pieces[1].updateMatrixWorld(true);
    check("a piece moved");
    // 2 pieces: 6 parts' 12 triangles, and their carcasses' 6 panels × 6 units × 12 + 6 handles × 12 kept with their doors.
    const expected = 2 * (6 * 12 + 6 * 6 * 12);
    say("what is in it: carcasses, and a box a part", first === expected ? null : `${first} triangles, ${expected} expected`, `${expected} triangles`);
}

// The L-kitchen walked against: the inside corner, an open cupboard, an open door.
{
    const kitchen = lKitchen();
    kitchen.position.set(0, 0, 0);
    kitchen.rotation.y = 0;
    kitchen.updateMatrixWorld(true);
    const openables = new Openables();
    openables.add(kitchen);
    const tree = buildOctree(rootsOf([kitchen], openables), skipDynamic);
    const whole = (() => {
        const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        const box = shutBox(kitchen, shutParts(kitchen, openables));
        box.getSize(proxy.scale);
        box.getCenter(proxy.position);
        proxy.updateMatrixWorld(true);
        return buildOctree([proxy]);
    })();
    // The capsule as Player's: 0.35 round, its ends 1.2 apart, its feet on the floor.
    const capsule = (x, z) => new Capsule(new THREE.Vector3(x, 0.36, z), new THREE.Vector3(x, 1.56, z), 0.35);
    // In the corner the arms make, 0.4 m clear of each front: x 0.58 + 0.02 front + 0.4, z 0.58 + 0.02 + 0.4.
    const corner = capsule(1.0, 1.0);
    const free = tree.capsuleIntersect(corner);
    const walled = whole.capsuleIntersect(corner);
    say("an L kitchen's inside corner is clear", !free && walled ? null : `against its mesh and parts: ${free ? `met, ${free.depth.toFixed(3)} deep` : "clear"}; against its whole box: ${walled ? "met" : "clear (the test is wrong)"}`, `its whole box met it ${walled ? walled.depth.toFixed(2) : "?"} m deep`);
    // An open cupboard (the first unit's door swung open): stood in its mouth, the capsule is met by the shut door's box.
    const door = openables.parts.find((part) => part.kind === "door");
    setShare(door, 1);
    kitchen.updateMatrixWorld(true);
    const mouth = capsule(0.9, 0.58 + 0.2);
    const met = tree.capsuleIntersect(mouth);
    say("an open cupboard is not walked into", met && met.normal.z > 0.9 ? null : met ? `pushed along [${met.normal.toArray()}]` : "not met", met ? `pushed out ${met.depth.toFixed(3)} m along +Z` : "");
    // An open door itself, swung out into the room, is walked through (it is in no tree), as a room's open door is:
    // the back run's last unit's, stood in 1.05 m out from the back, clear of every front by the capsule's radius.
    const last = openables.parts.filter((part) => part.kind === "door")[1];
    setShare(last, 1);
    kitchen.updateMatrixWorld(true);
    const swung = new THREE.Box3().setFromObject(last.node);
    const through = capsule((swung.min.x + swung.max.x) / 2, 1.05);
    const reach = new THREE.Box3(new THREE.Vector3(through.start.x - 0.35, 0, 1.05 - 0.35), new THREE.Vector3(through.start.x + 0.35, 2, 1.05 + 0.35));
    const metDoor = tree.capsuleIntersect(through);
    say("its open door is walked through", !metDoor && reach.intersectsBox(swung) ? null : metDoor ? `met ${metDoor.depth.toFixed(3)} deep` : "the capsule is not where the door is (the test is wrong)", `the door's box [${swung.min.toArray().map((n) => n.toFixed(2))}] … [${swung.max.toArray().map((n) => n.toFixed(2))}]`);
}

// ---- 5: the prompt -----------------------------------------------------------

{
    const piece = new THREE.Group();
    piece.userData = { kind: "furniture", id: "w1", label: "Washing machine" };
    const porthole = partNode({ type: "hinge", angle: 1.75, label: "washing machine" }, { name: "door1" });
    const tray = partNode({ type: "slide", distance: 0.15, label: "detergent drawer" }, { name: "drawer1" });
    const plain = partNode({ type: "hinge", angle: 1.6 }, { name: "door2" });
    piece.add(porthole, tray, plain);
    const openables = new Openables();
    openables.add(piece);
    const world = { sceneBuilder: { openables }, on() {}, off() {}, emit() {} };
    const interactables = new Interactables(world);
    const provider = interactables.providers.find((p) => p.name === "openable");
    const said = [];
    for (const node of [porthole, tray, plain]) {
        const [candidate] = provider.aim(null, { hit: { object: node.children[0], distance: 1.2 } });
        candidate.provider = provider;
        const before = interactables.prompt(candidate);
        interactables.act(candidate, null);
        const moving = interactables.busy();
        const after = interactables.prompt(candidate);
        said.push([before.label, before.touch.label, before.touch.icon, after.label, candidate.label, moving]);
        for (let i = 0; i < 60; i++) openables.update(1 / 60);
    }
    const want = [
        ["Open washing machine", "Open", "door", "Close washing machine", "Washing machine", "door"],
        ["Open detergent drawer", "Open", "drawer", "Close detergent drawer", "Washing machine", "drawer"],
        ["Open door", "Open", "door", "Close door", "Washing machine", "door"],
    ];
    const wrong = said.filter((row, i) => JSON.stringify(row) !== JSON.stringify(want[i]));
    say("the prompt names the part; the touch button its kind", wrong.length ? JSON.stringify(wrong) : null, said.map((row) => row[0]).join(" · "));
    say("nothing on the move, busy() is null", interactables.busy() === null ? null : interactables.busy());
    interactables.dispose();
}

// ---- 6: a way in ---------------------------------------------------------------

{
    // A corner shower: its tray and a fixed pane, and a glass door hung on its clamps, turned on the floor.
    const shower = new THREE.Group();
    shower.userData = { kind: "furniture", id: "shower", label: "Shower" };
    shower.add(panel([0.9, 0.04, 0.9], [0, 0.02, 0]));
    shower.add(panel([0.9, 2, 0.008], [0, 1, -0.45]));
    const door = partNode({ type: "hinge", angle: 1.48, label: "Shower door" }, { at: [-0.45, 0.06, 0.45], size: [0.6, 1.9, 0.012], offset: [0.3, 0.95, 0], name: "door1" });
    const cupboard = partNode({ type: "hinge", angle: 1.57, label: "door" }, { at: [0.6, 0, 0.45], name: "door2" });
    shower.add(door, cupboard);
    shower.position.set(-2, 0.3, 5);
    shower.rotation.y = -0.6;
    shower.updateMatrixWorld(true);
    const openables = new Openables();
    openables.add(shower);
    const glass = openables.of(door);
    const front = openables.of(cupboard);
    const parts = shutParts(shower, openables);
    const shut = parts.find((part) => part.node === door);
    const [blocker] = glass.getBlockers();
    // Its blocker is its box where it is shut: each of the shut box's eight corners one of the blocker's.
    const cornersOf = (box, matrix) => Array.from({ length: 8 }, (_, i) => new THREE.Vector3(i & 4 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 1 ? box.max.z : box.min.z).applyMatrix4(matrix));
    let worst = Infinity;
    if (blocker && shut) {
        const theirs = cornersOf(new THREE.Box3(blocker.half.clone().negate(), blocker.half.clone()), new THREE.Matrix4().compose(blocker.centre, blocker.quaternion, new THREE.Vector3(1, 1, 1)));
        worst = Math.max(...cornersOf(shut.box, shut.matrix).map((corner) => Math.min(...theirs.map((other) => other.distanceTo(corner)))));
    }
    // A capsule walked at it, shut, is pushed out; opened 0.3, it is not.
    const walker = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.35);
    const at = shut ? new THREE.Vector3(0, 0, 0).applyMatrix4(shut.matrix) : new THREE.Vector3();
    const toward = (share) => {
        setShare(glass, share);
        walker.start.copy(at).add(new THREE.Vector3(0.3, 0.4, 0).applyQuaternion(shower.quaternion));
        walker.end.copy(walker.start).y += 1.2;
        return glass.getBlockers().some((b) => Door.resolveCapsule(walker, b));
    };
    const pushed = [toward(0), toward(0.2), toward(0.3), toward(1)];
    setShare(glass, 0);
    const problem =
        !isWayIn(door) || isWayIn(cupboard) || !glass.wayIn || front.wayIn || openables.waysIn.length !== 1
            ? "which part is a way in"
            : !shut?.wayIn || parts.find((part) => part.node === cupboard)?.wayIn
              ? "shutParts' wayIn"
              : front.getBlockers().length
                ? "a cupboard's door bars the way"
                : !(worst < 1e-6)
                  ? `its blocker is not its shut box: ${worst}`
                  : JSON.stringify(pushed) !== JSON.stringify([true, true, false, false])
                    ? `walked at it shut, 0.2, 0.3 and open: pushed out ${JSON.stringify(pushed)}`
                    : null;
    say("a shower's glass door bars the way shut, and is walked through open", problem, `blocker = its shut box (worst ${worst.toExponential(1)} m); pushed out at 0 and 0.2 open, not at 0.3 or 1`);
    openables.remove(shower);
    say("a way in taken away with its piece", openables.waysIn.length === 0 ? null : `${openables.waysIn.length} left`);
}

// ---- 7: what is in the way -------------------------------------------------------

{
    /** A collision as World/Collision.js keeps it, for Openable.plan: its trees and how often each was set. */
    const collisionOf = (...obstacles) => {
        const group = new THREE.Group();
        for (const obstacle of obstacles) group.add(obstacle);
        return { static: buildOctree([group]), dynamic: buildOctree([]), outdoor: null, revision: { static: 1, dynamic: 1, outdoor: 1 } };
    };
    /** A part on its own, in a piece of its own, opened against `collision`. */
    const partIn = (opens, collision, shape = {}, own = null, extra = []) => {
        const piece = new THREE.Group();
        const node = partNode(opens, shape);
        for (const mesh of extra) node.add(mesh);
        piece.add(node);
        piece.updateMatrixWorld(true);
        const openables = new Openables();
        openables.room = { collision, own: () => own };
        openables.add(piece, "piece");
        return { part: openables.of(node), openables, node };
    };
    const degrees = (r) => THREE.MathUtils.radToDeg(r);

    // A door 0.6 wide swinging +90° about up, its free edge going to −z; a chair's back 0.3 m in front of it, across
    // x 0.3–0.8. Its slab, TOUCH (4 mm) smaller all round, x 0.004–0.596, z 0.004–0.016: its corner meets the back when
    // −0.596 sin θ + 0.004 cos θ = −0.3.
    {
        const back = panel([0.5, 1, 0.04], [0.55, 0.5, -0.32]);
        const { part } = partIn({ type: "hinge", angle: Math.PI / 2 }, collisionOf(back));
        part.toggle();
        let theta = 0;
        for (let lo = 0, hi = Math.PI / 2, i = 0; i < 60; i++) {
            theta = (lo + hi) / 2;
            if (-0.596 * Math.sin(theta) + 0.004 * Math.cos(theta) > -0.3) lo = theta;
            else hi = theta;
        }
        const got = part.reach * (Math.PI / 2);
        say("a door stops where its corner meets a chair's back", Math.abs(degrees(got - theta)) < 0.01 ? null : `${degrees(got).toFixed(3)}° against ${degrees(theta).toFixed(3)}°`, `${degrees(got).toFixed(3)}° of 90° (by hand ${degrees(theta).toFixed(3)}°), met "${part.planned.met === null ? "nothing" : "a triangle"}"`);
        // Opened all the way, it is where the reach puts it: eased to 1 of it.
        for (let i = 0; i < 120; i++) part.update(1 / 60);
        const angle = 2 * Math.atan2(new THREE.Vector3(part.node.quaternion.x, part.node.quaternion.y, part.node.quaternion.z).length(), part.node.quaternion.w);
        say("open, it stands at its reach", Math.abs(angle - got) < 1e-9 ? null : `${degrees(angle)}° against ${degrees(got)}°`, `${degrees(angle).toFixed(3)}°`);
    }

    // A drawer, its front at z 0.01, sliding 0.3 m along +z; a WC's side at z 0.2. Its box's front, 4 mm in, meets it
    // slid 0.2 − 0.006.
    {
        const wc = panel([1, 1, 0.1], [0, 0.4, 0.25]);
        const { part } = partIn({ type: "slide", distance: 0.3, direction: [0, 0, 1] }, collisionOf(wc), { size: [0.4, 0.15, 0.4], offset: [0, 0.075, -0.19] });
        part.toggle();
        const want = (0.2 - 0.006) / 0.3;
        say("a drawer stops where its front meets a WC", Math.abs(part.reach - want) * 0.3 < 1e-4 ? null : `slid ${(part.reach * 0.3).toFixed(5)} m against ${(want * 0.3).toFixed(5)} m`, `${(part.reach * 0.3).toFixed(4)} m of 0.3 m`);
    }

    // The same chair, its piece's own (as SceneBuilder.ownTriangles says): no longer in its way.
    {
        const back = panel([0.5, 1, 0.04], [0.55, 0.5, -0.32]);
        const { part } = partIn({ type: "hinge", angle: Math.PI / 2 }, collisionOf(back), {}, () => true);
        part.toggle();
        say("what is its own piece's is not in its way", part.reach === 1 ? null : `reach ${part.reach}`);
    }

    // A wall it is put 2 mm into, shut, and stays in as it turns (a plane through its hinge's line): not in its way.
    {
        const wall = panel([2, 2, 0.002], [0, 1, 0.012]);
        const { part } = partIn({ type: "hinge", angle: 0.4 }, collisionOf(wall));
        part.toggle();
        say("what it meets already shut is not in its way", part.reach === 1 ? null : `reach ${part.reach}`);
    }

    // A wardrobe's door: its slab, and a pull 4 cm proud at its free edge (−z, the way it swings). The wall the
    // wardrobe stands against runs 3 mm past its hinge. The box round slab and pull is 4 cm deep at the hinge too, and
    // turned 5°, that edge is in the wall; the slab and the pull, each a box of its own, are not.
    {
        const wall = panel([0.02, 2.5, 2], [-0.013, 1, 0]);
        const pull = panel([0.08, 0.3, 0.04], [0.54, 1, -0.02]);
        const { part } = partIn({ type: "hinge", angle: THREE.MathUtils.degToRad(84) }, collisionOf(wall), { size: [0.6, 2, 0.02], offset: [0.3, 1, 0.01] }, null, [pull]);
        part.toggle();
        say("a pull at a door's free edge does not swing into the wall by its hinge", part.reach === 1 ? null : `reach ${part.reach} (${degrees(part.reach * part.opens.angle).toFixed(1)}°)`);
    }

    // Stopped at 0.4 of its swing: it sets off as quickly as a door swinging all the way, and gets there sooner.
    {
        const back = panel([0.5, 1, 0.04], [0.55, 0.5, -0.32]);
        const short = partIn({ type: "hinge", angle: Math.PI / 2 }, collisionOf(back)).part;
        const free = partIn({ type: "hinge", angle: Math.PI / 2 }, collisionOf()).part;
        short.toggle();
        free.toggle();
        short.update(1 / 60);
        free.update(1 / 60);
        const angle = (part) => 2 * Math.atan2(new THREE.Vector3(part.node.quaternion.x, part.node.quaternion.y, part.node.quaternion.z).length(), part.node.quaternion.w);
        const first = [angle(short), angle(free)];
        let frames = 1;
        while (short.isMoving && frames < 200) {
            short.update(1 / 60);
            frames++;
        }
        const ratio = first[0] / first[1];
        say("stopped short, it sets off as quickly and settles sooner", ratio > 0.95 && ratio < 1.05 && frames < 27 * short.reach + 2 ? null : `first frame ${degrees(first[0]).toFixed(2)}° against ${degrees(first[1]).toFixed(2)}°, settled in ${frames} frames`, `first frame ${degrees(first[0]).toFixed(2)}° (free ${degrees(first[1]).toFixed(2)}°); settled in ${frames} frames, not 28`);
    }

    // A shower's door stopped at 0.25 of its swing still bars the way, all the way open: it has not swung 0.3 of it.
    {
        const back = panel([0.5, 2, 0.04], [0.5, 1, -0.17]);
        const { part } = partIn({ type: "hinge", angle: Math.PI / 2, label: "shower door" }, collisionOf(back), { size: [0.6, 1.9, 0.012], offset: [0.3, 0.95, 0.006] });
        part.toggle();
        for (let i = 0; i < 60; i++) part.update(1 / 60);
        say("a way in stopped short bars the way by how far it has swung", part.reach < 0.3 && part.open === 1 && part.getBlockers().length === 1 ? null : `reach ${part.reach}, open ${part.open}, ${part.getBlockers().length} blockers`, `reach ${part.reach.toFixed(3)}, open 1: barred`);
    }

    // From shut it is planned again only once the trees have changed; caught on its way shut and opened again, it goes
    // as far as it was going, whatever has changed meanwhile.
    {
        const back = panel([0.5, 1, 0.04], [0.55, 0.5, -0.32]);
        const collision = collisionOf(back);
        const { part } = partIn({ type: "hinge", angle: Math.PI / 2 }, collision);
        const settle = () => {
            for (let i = 0; i < 60; i++) part.update(1 / 60);
        };
        part.toggle();
        settle();
        const reach = part.reach;
        // The chair taken away, but no tree said to have changed: the plan kept.
        collision.static = buildOctree([]);
        part.reset();
        part.toggle();
        const kept = part.reach;
        settle();
        // Now said: shut part way, then opened again — as far as it was going.
        collision.revision.static++;
        part.toggle();
        for (let i = 0; i < 5; i++) part.update(1 / 60);
        part.toggle();
        const again = part.reach;
        // ...and from shut, the whole way.
        part.reset();
        part.toggle();
        const fresh = part.reach;
        say(
            "planned again only when a tree changes; caught on its way shut it opens as far again",
            kept === reach && again === reach && fresh === 1 ? null : `${reach}: kept ${kept}, caught ${again}, trees changed ${fresh}`,
            `${reach.toFixed(3)}; the chair gone unsaid ${kept.toFixed(3)}; caught ${again.toFixed(3)}; then 1`
        );
    }

    // The test of a triangle against a box, against points sampled over the triangle (meets where any is inside, beyond
    // a grazing tolerance either way).
    {
        let random = 7;
        const next = () => ((random = (random * 16807) % 2147483647) / 2147483647) * 2 - 1;
        let wrong = 0;
        let met = 0;
        for (let n = 0; n < 4000; n++) {
            const v = Float64Array.from({ length: 9 }, () => next() * 1.5);
            const h = [0.2 + Math.abs(next()) * 0.6, 0.2 + Math.abs(next()) * 0.6, 0.02 + Math.abs(next()) * 0.3];
            const exact = triangleMeetsBox(v, ...h);
            // Sampled: inside a box a hair smaller means it meets; never inside one a hair bigger means it does not.
            let inSmall = false;
            let inBig = false;
            for (let i = 0; i <= 60 && !inSmall; i++) {
                for (let j = 0; j <= 60 - i; j++) {
                    const a = i / 60;
                    const b = j / 60;
                    const p = [0, 1, 2].map((k) => v[k] * (1 - a - b) + v[3 + k] * a + v[6 + k] * b);
                    const inside = (grow) => p.every((x, k) => Math.abs(x) <= h[k] + grow);
                    if (inside(-0.02)) inSmall = true;
                    if (inside(0.02)) inBig = true;
                }
            }
            if (exact) met++;
            if ((inSmall && !exact) || (exact && !inBig)) wrong++;
        }
        say("a triangle meets a box as points sampled over it say", wrong ? `${wrong} of 4000 disagree` : null, `4000 random triangles, ${met} meeting`);
    }
}

for (const { name, problem, note } of results) console.log(`${problem ? "FAIL" : "ok  "}  ${name}${problem ? ` — ${problem}` : note ? ` — ${note}` : ""}`);
console.log(`\n${results.length - failed} of ${results.length} as expected`);
process.exit(failed ? 1 : 0);

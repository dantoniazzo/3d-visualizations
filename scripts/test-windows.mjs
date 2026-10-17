/**
 * The windows that open (frontend/Experience/World/Sash.js), built as
 * StructureBuilder builds them into a wall: `node scripts/test-windows.mjs`.
 * Exits 1 if any of these does not hold:
 *
 *   1. Which windows open: a slim window with a sill of 0.3 m or more turns
 *      in, floor-to-head glazing and a kit-framed window stay fixed, and a
 *      window's `opens` says otherwise (type, hinge) — what the validator
 *      keeps of it, and only that. Each pane hangs on the jamb nearer its
 *      end of the window, a single one and the middle of three from its
 *      left.
 *   2. What the wall holds: a sash a pane in place of the glass, each a
 *      leaf to everything that leaves a door's leaf alone (hingeSide on its
 *      group, doorLeaf on its meshes: no collision tree has it), and an
 *      invisible pane that collides in the outer half of the frame, outside
 *      the sashes; the fixed frame and the blind the same, triangle for
 *      triangle, as the window's when it stays fixed — the snapshot, and so
 *      the bake, are unchanged; a window that stays fixed as it was.
 *   3. How a sash moves: turned 90° into the room about its hinge jamb, or
 *      tilted 10° into it about its bottom rail, eased as a door's leaf is;
 *      shut again the way it opened; reset at once.
 *   4. What is in its way (sweep, blocked, plan): in its own wall alone
 *      nothing — the wall's panels, its sill, its head, the window's own
 *      pane — so it turns; a tap a centimetre across anywhere it would
 *      sweep, within its reach, its height and its 90°, and it tilts; the
 *      same tap past its reach, below its bottom rail, behind its hinge's
 *      line or outside the window, and it turns. Worked out again only as
 *      the trees change.
 *   5. Aimed at: from the room's side, through its opening; from outside,
 *      or past 2 m, not. A low window made to open bars the way itself while
 *      shut, tilted or barely turned, and not once turned.
 *   6. A public view hangs a version's sashes as the version says (the
 *      runtime file's `sashes`), whatever the rule says now.
 *   7. The prompt says Open, Tilt or Close window, the touch button the
 *      window's icon; acting tells the state; busy() names a window on the
 *      move.
 */
import * as THREE from "three";

import StructureBuilder from "../frontend/Experience/World/Builders/StructureBuilder.js";
import KitLibrary from "../frontend/Experience/World/Builders/KitLibrary.js";
import WindowSash, { OPENS_FROM_SILL, SASH_DEPTH, TILT, TURN, paneHinge, windowOpens } from "../frontend/Experience/World/Sash.js";
import Collision, { buildOctree, isTransient } from "../frontend/Experience/World/Collision.js";
import Interactables from "../frontend/Experience/World/Interactables.js";
import { validateScene } from "../server/scene/validate.js";

const results = [];
let failed = 0;
const say = (name, problem, note = "") => {
    results.push({ name, problem, note });
    if (problem) failed++;
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// A library of materials as StructureBuilder asks for them: glass see-through.
const made = new Map();
const material = (name) => {
    if (!made.has(name)) made.set(name, Object.assign(new THREE.MeshStandardMaterial({ transparent: /glass/.test(name) }), { name }));
    return made.get(name);
};
const materials = { getTrim: material, getSurface: material, getTrimBehind: material, getTrimFront: material, tileSize: () => 1 };
const structure = new StructureBuilder(materials, new KitLibrary(null));

/** A wall along X, 5 m, 0.35 thick, side A (+Z) outside, with the openings given. */
function wallWith(openings, { thickness = 0.35 } = {}) {
    return { id: "w", start: [0, 0], end: [5, 0], height: 2.7, thickness, finish: "plaster", base_height: 0, openings };
}
const slim = (extra = {}) => ({ id: "o", type: "window", offset: 2.5, width: 2, height: 1.5, sill: 0.9, style: "slim", panes: [2, 1], frame: "frame_bronze", blind: 0.4, ...extra });

/** A wall built and in the world, its matrices up to date. */
function build(wall) {
    const built = structure.buildWall(wall);
    const scene = new THREE.Scene();
    scene.add(built.group);
    scene.updateMatrixWorld(true);
    return built;
}

// ---------------------------------------------------------------------
// 1. Which windows open
// ---------------------------------------------------------------------
{
    const cases = [
        [slim(), { type: "turn", hinge: null }],
        [slim({ sill: OPENS_FROM_SILL }), { type: "turn", hinge: null }],
        [slim({ sill: 0.29 }), null],
        [slim({ sill: 0.02 }), null],
        [slim({ sill: 0.02, opens: { type: "turn" } }), { type: "turn", hinge: null }],
        [slim({ opens: { type: "tilt", hinge: "right" } }), { type: "tilt", hinge: "right" }],
        [slim({ opens: { type: "fixed" } }), null],
        [slim({ opens: { type: "sideways", hinge: "up" } }), { type: "turn", hinge: null }],
        [{ ...slim(), style: undefined }, null],
        [{ ...slim({ opens: { type: "turn" } }), style: undefined }, null],
        [{ id: "d", type: "door", style: "slim", sill: 0 }, null],
    ];
    const wrong = cases.filter(([opening, want]) => JSON.stringify(windowOpens(opening)) !== JSON.stringify(want)).map(([opening]) => JSON.stringify({ sill: opening.sill, style: opening.style, opens: opening.opens }));
    say("a slim window with a sill of 0.3 m or more turns in; glazing and kit frames stay fixed; `opens` says otherwise", wrong.length ? wrong.join(" ") : null);

    const hinges = [1, 2, 3, 4].map((across) => Array.from({ length: across }, (_, i) => paneHinge(i, across)));
    const want = [[-1], [-1, 1], [-1, -1, 1], [-1, -1, 1, 1]];
    say(
        "each pane hangs on the jamb nearer its end of the window; one alone and the middle one from its left",
        JSON.stringify(hinges) === JSON.stringify(want) ? null : JSON.stringify(hinges)
    );
    say("`hinge` hangs every pane on that jamb", paneHinge(1, 2, "left") === -1 && paneHinge(0, 3, "right") === 1 ? null : "not so");

    const { scene } = validateScene({
        rooms: [{ id: "r", polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], floor_finish: "oak_honey" }],
        walls: [
            {
                id: "w",
                start: [0, 0],
                end: [5, 0],
                height: 2.7,
                openings: [
                    { id: "a", type: "window", offset: 1, width: 1, height: 1, sill: 0.9, style: "slim", opens: { type: "tilt", hinge: "right", extra: 1 } },
                    { id: "b", type: "window", offset: 2.5, width: 1, height: 1, sill: 0.9, style: "slim", opens: { type: "open", hinge: "middle" } },
                    { id: "c", type: "window", offset: 4, width: 1, height: 1, sill: 0.9, style: "slim", opens: { hinge: "left" } },
                ],
            },
        ],
    });
    const kept = scene.walls[0].openings.map((opening) => opening.opens ?? null);
    say(
        "the validator keeps a window's `opens` — a known type and hinge — and nothing else of it",
        JSON.stringify(kept) === JSON.stringify([{ type: "tilt", hinge: "right" }, null, { hinge: "left" }]) ? null : JSON.stringify(kept)
    );
}

// ---------------------------------------------------------------------
// 2. What the wall holds
// ---------------------------------------------------------------------
const opened = build(wallWith([slim()]));
const fixed = build(wallWith([slim({ opens: { type: "fixed" } })]));
{
    const { group, windows } = opened;
    const flags = windows.every((sash) => sash.group.userData.hingeSide === sash.hingeSide && sash.group.userData.sash === sash);
    let leaves = 0;
    let others = 0;
    for (const sash of windows) sash.group.traverse((node) => (node.isMesh ? (node.userData.doorLeaf === true ? leaves++ : others++) : null));
    say("a sash a pane, its group a hinge's and its meshes leaves", windows.length === 2 && flags && leaves === 4 && others === 0 ? null : `${windows.length} sashes, ${leaves} leaves, ${others} other meshes`);

    const tags = windows.every((sash) => sash.leaf.children.every((mesh) => mesh.userData.kind === "opening" && mesh.userData.openingId === "o" && mesh.userData.wallId === "w"));
    say("each mesh of a sash is its window's to pick", tags ? null : "untagged");

    const glass = group.children.filter((node) => node.isMesh && node.material?.transparent);
    say("no sheet of glass across the window: its panes are the sashes'", glass.length === 0 ? null : `${glass.length} panes in the wall`);

    // What collides: the wall's tree over it.
    const tree = buildOctree([group], isTransient);
    const blocker = group.children.find((node) => node.name === "blocker");
    const box = new THREE.Box3().setFromObject(blocker);
    const inner = windows[0].inner;
    const sashOuter = inner + SASH_DEPTH;
    const frameOuter = 0.35 / 2 - 0.05;
    say(
        "an invisible pane across the opening, in the outer half of the frame, outside the sashes",
        blocker && !blocker.visible && blocker.userData.label === "Window" && near(box.min.z, sashOuter, 1e-6) && near(box.max.z, frameOuter, 1e-6) && near(box.max.x - box.min.x, 2) && near(box.min.y, 0.9) && near(box.max.y, 2.4)
            ? null
            : JSON.stringify(box),
        `z ${box.min.z.toFixed(3)}…${box.max.z.toFixed(3)}, the sashes' outer face ${sashOuter.toFixed(3)}`
    );
    let sashTriangles = 0;
    for (const sash of windows) sash.group.traverse((node) => (node.isMesh ? (sashTriangles += node.geometry.index.count / 3) : null));
    const all = counted(buildOctree([group]));
    const kept = counted(tree);
    // Every triangle of the blocker is in the tree: 12, its box's.
    const ofBlocker = counted(buildOctree([blocker]));
    say(
        "no collision tree has a sash; the pane across the opening is in it",
        all - kept === sashTriangles + decorTriangles(group) && ofBlocker === 12 && kept >= ofBlocker ? null : `${all} all, ${kept} kept, ${sashTriangles} sashes'`,
        `${sashTriangles} triangles of sashes left out`
    );

    const frameOf = (built, name) => built.group.children.find((node) => node.name === name)?.geometry.attributes.position.array;
    const sameFrame = ["window-frame", "blind"].every((name) => {
        const a = frameOf(opened, name);
        const b = frameOf(fixed, name);
        return a && b && a.length === b.length && a.every((value, i) => value === b[i]);
    });
    const order = (built) => built.group.children.filter((node) => node.isMesh && node.visible && !node.material?.transparent && node.name !== "blocker").map((node) => node.name || node.type);
    say(
        "the fixed frame, its mullion and the blind as the fixed window's, in the same order among the wall's meshes: its snapshot, and its bake, unchanged",
        sameFrame && JSON.stringify(order(opened)) === JSON.stringify(order(fixed)) ? null : `${sameFrame} ${order(opened)} | ${order(fixed)}`
    );

    const stays = fixed.windows.length === 0 && fixed.group.children.filter((node) => node.isMesh && node.material?.transparent).length === 1 && !fixed.group.children.some((node) => node.name === "blocker");
    const glazing = build(wallWith([slim({ sill: 0.02, height: 2.4 })]));
    const kit = build(wallWith([{ ...slim(), style: undefined }]));
    say(
        "a window that stays fixed, glazing and a kit-framed one, have their one sheet of glass and nothing else",
        stays && glazing.windows.length === 0 && kit.windows.length === 0 && !glazing.group.children.some((node) => node.name === "blocker") ? null : "not so"
    );

    // Each sash fills the hole its frame and mullion leave it.
    const [left, right] = windows;
    const s = 0.055;
    say(
        "each sash in the hole its frame and the mullion leave, 3 mm clear all round",
        near(left.width, 1 - s - s * 0.45 - 0.006, 1e-9) && near(right.width, left.width, 1e-9) && near(left.height, 1.5 - 2 * s - 0.006, 1e-9) && left.hingeSide === -1 && right.hingeSide === 1
            ? null
            : `${left.width} ${right.width} ${left.height}`
    );
}

/** How many triangles a tree holds, each once. */
function counted(octree) {
    const seen = new Set();
    const visit = (node) => {
        for (const triangle of node.triangles) seen.add(triangle);
        for (const sub of node.subTrees) visit(sub);
    };
    visit(octree);
    return seen.size;
}

/** The triangles of a wall's decoration — its frame and blind, which no tree has either. */
function decorTriangles(group) {
    let n = 0;
    group.traverse((node) => {
        if (node.isMesh && node.userData.decor) n += node.geometry.index.count / 3;
    });
    return n;
}

// ---------------------------------------------------------------------
// 3. How a sash moves
// ---------------------------------------------------------------------
{
    const [sash] = build(wallWith([slim()])).windows;
    const free = () => new THREE.Vector3(-sash.hingeSide * sash.width, 0, 0);
    const corner = new THREE.Vector3();
    // The leaf's stile away from the hinge, at the sash's middle height, on its face to the room.
    const freeEdge = () => sash.turn.localToWorld(corner.copy(free())).clone();
    const top = () => sash.tilt.localToWorld(new THREE.Vector3(0, sash.height, 0)).clone();
    const shutEdge = freeEdge();
    const shutTop = top();
    const steps = [];
    sash.toggle();
    let frames = 0;
    while (sash.update(1 / 60) && frames < 600) {
        frames++;
        sash.group.updateMatrixWorld(true);
        const eased = 1 - Math.pow(1 - sash.open, 2);
        steps.push(near(sash.turn.rotation.y, -sash.hingeSide * eased * TURN, 1e-12));
    }
    sash.group.updateMatrixWorld(true);
    const edge = freeEdge();
    const swung = edge.clone().sub(sash.turn.getWorldPosition(new THREE.Vector3()));
    say(
        "turned 90° about its hinge jamb into the room (−Z, side B), eased as a door's leaf",
        sash.state === "open" && steps.every(Boolean) && near(swung.x, 0, 1e-9) && near(swung.z, -sash.width, 1e-9) && near(sash.tilt.rotation.x, 0) && frames === 30
            ? null
            : `${sash.state} ${steps.filter((ok) => !ok).length} off, free edge ${swung.toArray()} after ${frames} frames`,
        `free edge from z ${shutEdge.z.toFixed(3)} to ${edge.z.toFixed(3)} in ${frames} frames`
    );
    sash.toggle();
    while (sash.update(1 / 60));
    sash.group.updateMatrixWorld(true);
    say("shut again the way it opened", sash.state === "shut" && near(sash.turn.rotation.y, 0, 1e-12) && freeEdge().distanceTo(shutEdge) < 1e-9 ? null : `${sash.turn.rotation.y}`);

    sash.type = "tilt";
    sash.toggle();
    while (sash.update(1 / 60));
    sash.group.updateMatrixWorld(true);
    const leant = top();
    say(
        "tilted 10° about its bottom rail, its top into the room",
        sash.state === "tilted" && near(leant.z - shutTop.z, -sash.height * Math.sin(TILT), 1e-9) && near(sash.turn.rotation.y, 0)
            ? null
            : `${sash.state} ${leant.z - shutTop.z}`,
        `top ${((shutTop.z - leant.z) * 100).toFixed(1)} cm in`
    );
    // Caught on its way shut, opened again: the same way, not a jump to the other.
    sash.toggle();
    sash.update(0.1);
    sash.type = "turn";
    sash.toggle();
    say("caught on its way shut, it opens again the way it was going", sash.mode === "tilt" && sash.state === "tilted" ? null : `${sash.mode}`);
    sash.reset();
    sash.group.updateMatrixWorld(true);
    say("reset: shut at once", sash.open === 0 && sash.target === 0 && sash.mode === null && near(sash.tilt.rotation.x, 0) && top().distanceTo(shutTop) < 1e-9 ? null : "not shut");
}

// ---------------------------------------------------------------------
// 4. What is in its way
// ---------------------------------------------------------------------
{
    const { group, windows } = build(wallWith([slim({ panes: [1, 1] })]));
    const [sash] = windows;
    const wallTree = buildOctree([group], isTransient);
    const collision = new Collision();
    collision.setStatic(wallTree);
    say("in its own wall, with nothing in the room, it turns", sash.plan(collision) === "turn" && sash.blocked("tilt", [wallTree]) === null ? null : `${sash.planned.met}`);

    // A tap: a box a centimetre across and 30 cm tall, its foot where asked — in the sash's turn frame (X from the
    // hinge along the shut sash, Y up from its middle, Z into the room).
    const region = sash.sweep("turn");
    const tapAt = (u, y, v, { tall = 0.3, across = 0.01 } = {}) => {
        const tap = new THREE.Mesh(new THREE.BoxGeometry(across, tall, across));
        tap.position.set(u, y + tall / 2, v).applyMatrix4(region.matrix);
        tap.updateMatrixWorld(true);
        return tap;
    };
    const planWith = (tap) => {
        const trial = new Collision();
        trial.setStatic(wallTree);
        trial.setDynamic(buildOctree([tap]));
        sash.planned = null;
        return sash.plan(trial);
    };
    const W = sash.width;
    const H = sash.height;
    const turnsFor = [
        ["half-way out, at its middle height", [W / 2, -0.1, W / 2], "tilt"],
        ["just inside its reach, beside its free edge", [Math.cos(0.3) * (W + 0.005), -0.1, Math.sin(0.3) * (W + 0.005)], "tilt"],
        ["just past its reach", [Math.cos(0.3) * (W + 0.03), -0.1, Math.sin(0.3) * (W + 0.03)], "turn"],
        ["where it comes to, turned in", [0.012, -0.1, W * 0.6], "tilt"],
        ["3 cm behind its hinge's line, where its handle comes to", [-0.03, 0, W - 0.03], "tilt"],
        ["6 cm behind its hinge's line, clear of it and its handle", [-0.065, -0.1, W * 0.6], "turn"],
        ["standing under its bottom rail (a worktop's tap)", [W / 2, -H / 2 - 0.3 - 0.02, 0.3], "turn"],
        ["a millimetre under its bottom rail (a bed's box under a window)", [W / 2, -H / 2 - 0.3 - 0.001, 0.3], "turn"],
        ["a tall tap reaching above its bottom rail", [W / 2, -H / 2 - 0.3 + 0.02, 0.3], "tilt"],
        ["over its top rail", [W / 2, H / 2 + 0.015, 0.3], "turn"],
        ["outside the window", [W / 2, -0.1, -0.4], "turn"],
    ];
    const wrong = [];
    for (const [where, [u, y, v], want] of turnsFor) {
        const got = planWith(tapAt(u, y, v));
        if (got !== want) wrong.push(`${where}: ${got}`);
    }
    say("a tap in its way, and it tilts; out of it, and it turns", wrong.length ? wrong.join("; ") : null, `${turnsFor.length} places`);

    // Worked out once for the trees as they stand.
    const tap = tapAt(W / 2, -0.1, W / 2);
    const trial = new Collision();
    trial.setStatic(wallTree);
    trial.setDynamic(buildOctree([tap]));
    sash.planned = null;
    const first = sash.plan(trial);
    const planned = sash.planned;
    sash.plan(trial);
    const kept = sash.planned === planned;
    trial.setDynamic(buildOctree([]));
    const after = sash.plan(trial);
    say("worked out again only as a tree changes", first === "tilt" && kept && after === "turn" ? null : `${first} ${kept} ${after}`);

    // Tilting takes next to no room: the same tap in front of the window does not stop it.
    const low = tapAt(W / 2, -H / 2 + 0.2, 0.2);
    say("tilting is clear of a tap 20 cm out that stops a turn", planWith(low) === "tilt" && sash.blocked("tilt", [wallTree, buildOctree([low])]) === null ? null : "tilt blocked");
    const tiltType = build(wallWith([slim({ panes: [1, 1], opens: { type: "tilt" } })])).windows[0];
    say("a sash that only tilts tilts, whatever is in its way", tiltType.plan(collision) === "tilt" && tiltType.plan(null) === "tilt" ? null : "not so");
}

// ---------------------------------------------------------------------
// 5. Aimed at; a low window's own blocking
// ---------------------------------------------------------------------
{
    const { windows } = build(wallWith([slim()]));
    const [sash] = windows;
    const middle = sash.leaf.getWorldPosition(new THREE.Vector3());
    const rayFrom = (z, length = null) => {
        const origin = new THREE.Vector3(middle.x, middle.y - 0.2, z);
        return new THREE.Ray(origin, middle.clone().sub(origin).normalize());
    };
    const fromInside = sash.through(rayFrom(-1.5), 2);
    const fromOutside = sash.through(rayFrom(1.5), 2);
    const away = rayFrom(1.5);
    away.direction.negate();
    const lookingAway = sash.through(away, 2);
    const tooFar = sash.through(rayFrom(-2.5), 2);
    const glassAt = middle.distanceTo(rayFrom(-1.5).origin);
    say(
        "aimed at from the room's side through its opening, at its glass's plane; not from outside, looking in or away, nor from past 2 m",
        fromInside !== null && near(fromInside, glassAt, 1e-9) && fromOutside === null && lookingAway === null && tooFar === null && sash.inside(rayFrom(-1.5).origin) && !sash.inside(rayFrom(1.5).origin)
            ? null
            : `${fromInside} ${glassAt} ${fromOutside} ${lookingAway} ${tooFar}`
    );
    const beside = new THREE.Ray(new THREE.Vector3(middle.x + 1.2, middle.y, -1), new THREE.Vector3(0, 0, 1));
    say("a ray past the pane's edge is not on it", sash.through(beside, 2) === null ? null : "met");

    const high = windows.every((each) => each.getBlockers().length === 0);
    const lowWall = build(wallWith([slim({ sill: 0.02, height: 2.4, opens: { type: "turn" } })]));
    const [door] = lowWall.windows;
    const shut = door.getBlockers().length;
    door.mode = "turn";
    door.target = 1;
    const blocking = [0.1, 0.29, 0.3, 1].map((share) => {
        door.open = share;
        door.place();
        return door.getBlockers().length;
    });
    door.reset();
    door.mode = "tilt";
    door.open = door.target = 1;
    door.place();
    const tilted = door.getBlockers().length;
    say(
        "a low window made to open bars the way while shut, tilted or barely turned; once turned not; a sill window never itself",
        high && shut === 1 && JSON.stringify(blocking) === "[1,1,0,0]" && tilted === 1 && !lowWall.group.children.some((node) => node.name === "blocker") ? null : `${high} ${shut} ${blocking} ${tilted}`
    );
}

// ---------------------------------------------------------------------
// 6. A public view hangs them as published
// ---------------------------------------------------------------------
{
    const opening = slim({ panes: [3, 1], opens: { type: "fixed" } });
    const wall = wallWith([opening]);
    const tag = { kind: "opening", wallId: "w", openingId: "o" };
    const hung = structure.windowSashes(opening, wall, 2.5, tag, { type: "tilt", hinges: [1, 1, -1] });
    const asNow = structure.windowSashes(opening, wall, 2.5, tag);
    const editor = build(wallWith([slim({ panes: [3, 1] })])).windows;
    const again = structure.windowSashes(slim({ panes: [3, 1] }), wall, 2.5, tag, { type: editor[0].type, hinges: editor.map((sash) => sash.hingeSide) });
    const same = again.every((sash, i) => sash.width === editor[i].width && sash.group.position.equals(editor[i].group.position) && sash.turn.position.equals(editor[i].turn.position));
    say(
        "a published version's sashes hang as it says — its type, each pane's hinge — where the editor's do",
        hung.length === 3 && hung.every((sash) => sash.type === "tilt") && JSON.stringify(hung.map((sash) => sash.hingeSide)) === "[1,1,-1]" && asNow.length === 0 && same ? null : "not so"
    );
}

// ---------------------------------------------------------------------
// 6b. Its glass in a view drawn from its bake
// ---------------------------------------------------------------------
{
    const [sash] = build(wallWith([slim({ panes: [1, 1] })])).windows;
    const pane = sash.leaf.children.find((mesh) => mesh.material.transparent);
    const wall = pane.material;
    const room = new THREE.MeshPhysicalMaterial({ transparent: true });
    sash.glazeInRoom(() => room);
    const seen = [];
    const at = (mode, open) => {
        sash.mode = mode;
        sash.open = sash.target = open;
        sash.place();
        return pane.material === room ? "room" : pane.material === wall ? "wall" : "other";
    };
    seen.push(at("turn", 0), at("turn", 0.1), at("turn", 0.2), at("turn", 1), at("tilt", 1));
    // A room drawn live has it: left as that room has it, and as it should be once given back.
    at("turn", 1);
    pane.userData.roomLive = true;
    const theirs = new THREE.MeshBasicMaterial();
    pane.material = theirs;
    sash.reset();
    const kept = pane.material === theirs;
    delete pane.userData.roomLive;
    pane.material = room;
    sash.update(1 / 60);
    seen.push(kept ? "kept" : "taken", pane.material === wall ? "wall" : "room");
    say(
        "drawn from the bake, a sash's glass is the fixed panes' in its wall, and glass in a room's once turned in past 25°; a room drawn live keeps it",
        JSON.stringify(seen) === JSON.stringify(["wall", "wall", "room", "room", "wall", "kept", "wall"]) ? null : JSON.stringify(seen)
    );
}

// ---------------------------------------------------------------------
// 7. The prompt
// ---------------------------------------------------------------------
{
    const { group, windows } = build(wallWith([slim({ panes: [1, 1] })]));
    const [sash] = windows;
    const collision = new Collision();
    collision.setStatic(buildOctree([group], isTransient));
    const told = [];
    const world = { sceneBuilder: { windows, openables: { of: () => null, busy: () => null } }, collision, on() {}, off() {}, emit: (name, data) => told.push([name, data.state]) };
    const interactables = new Interactables(world);
    const provider = interactables.providers.find((entry) => entry.name === "window");
    const middle = sash.leaf.getWorldPosition(new THREE.Vector3());
    const head = new THREE.Vector3(middle.x, middle.y - 0.1, -1.4);
    const ray = new THREE.Ray(head.clone(), middle.clone().sub(head).normalize());
    // Met by the look ray on its glass, and through its opening.
    const [onGlass] = provider.aim(ray, { hit: { object: sash.leaf.children[1], distance: 1.3 }, sight: 1.3, far: 4, head });
    const [onHole] = provider.aim(ray, { hit: null, sight: 4, far: 4, head });
    onGlass.provider = provider;
    const said = [interactables.prompt(onGlass)];
    const state = interactables.act(onGlass, null);
    const moving = interactables.busy();
    said.push(interactables.prompt(onGlass));
    while (sash.update(1 / 60));
    const quiet = interactables.busy();
    interactables.act(onGlass, null);
    while (sash.update(1 / 60));
    // A tap in its way: tilt.
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02));
    tap.position.copy(sash.turn.localToWorld(new THREE.Vector3(-sash.hingeSide * sash.width * 0.6, -0.2, -0.4)));
    tap.updateMatrixWorld(true);
    collision.setDynamic(buildOctree([tap]));
    said.push(interactables.prompt(onGlass));
    const tilted = interactables.act(onGlass, null);
    const want = [
        { label: "Open window", key: "E", touch: { label: "Open", icon: "window" } },
        { label: "Close window", key: "E", touch: { label: "Close", icon: "window" } },
        { label: "Tilt window", key: "E", touch: { label: "Tilt", icon: "window" } },
    ];
    say(
        "the prompt says Open, Tilt or Close window, its button the window's icon",
        JSON.stringify(said) === JSON.stringify(want) && onHole?.ref === sash && onGlass.ref === sash && onGlass.kind === "window" ? null : JSON.stringify(said)
    );
    say(
        "acting tells the state; busy() names a window on the move",
        state?.state === "open" && tilted?.state === "tilted" && moving === "window" && quiet === null && told[0][0] === "window" ? null : JSON.stringify({ state, tilted, moving, quiet, told })
    );
    const outside = new THREE.Vector3(middle.x, middle.y, 1.4);
    const fromOutside = provider.aim(new THREE.Ray(outside, middle.clone().sub(outside).normalize()), { hit: { object: sash.leaf.children[1], distance: 1.3 }, sight: 1.3, far: 4, head: outside });
    say("not aimed at from outside", fromOutside === null ? null : `${fromOutside.length} candidates`);
    interactables.dispose();
}

for (const { name, problem, note } of results) console.log(`${problem ? "FAIL" : "ok  "}  ${name}${problem ? ` — ${problem}` : note ? ` — ${note}` : ""}`);
console.log(`\n${results.length - failed} of ${results.length} as expected`);
process.exit(failed ? 1 : 0);

// (WindowSash is used through the builder; imported so that a change of its export is caught here too.)
void WindowSash;

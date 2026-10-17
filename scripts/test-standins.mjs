/**
 * The editor's stand-ins holding what they draw still, and keeping it out of
 * three's way (frontend/Experience/World/StandIns.js's hold and drawnScene),
 * on a made-up house: `node scripts/test-standins.mjs`. Exits 1 if any of
 * these does not hold:
 *
 *   1. Drawn, the scene, the groups the units hang in and the stand-ins' own
 *      group work their frames out no more, every unit is passed over by
 *      three's walk — and every object's world matrix is what three's full
 *      walk would make of it.
 *   2. What three is handed draws exactly what the scene does: the same
 *      meshes shown on the camera's layer, and the same lights — without the
 *      units drawn entirely by the stand-ins (a merged wall, instanced
 *      pieces, a piece drawn whole), with those that draw something of their
 *      own (a door's leaf, glass), and without a cheap walk changing a
 *      single world matrix.
 *   3. A piece moved by its position alone, a part of one opened, a mesh come
 *      into a piece and a light hung in one are where they now are after the
 *      next frame; the piece opened is handed to three while it is open, and
 *      left out again once shut to the last digit.
 *   4. A wall hidden is handed to three (which then passes it over); a
 *      group's children changed with their number the same are sorted again.
 *   5. Let go (the realistic preview, a publish), everything works out its
 *      own frame again, is walked as built and nothing stands in for the
 *      scene; `?still=0` holds nothing from the start.
 */
import * as THREE from "three";

// (The module reads the link and what the page has at load: enough of a page for that.)
globalThis.window ??= globalThis;
globalThis.location ??= new URL("http://localhost/?scene=test");
globalThis.document ??= { createElement: () => ({ getContext: () => null, style: {} }), body: { classList: { add() {}, remove() {}, contains: () => false } }, addEventListener() {}, querySelector: () => null, documentElement: { style: {} } };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener ??= () => {};
globalThis.requestAnimationFrame ??= () => 0;

const { default: Experience } = await import("../frontend/Experience/Experience.js");
const { default: StandIns } = await import("../frontend/Experience/World/StandIns.js");

const results = [];
let failed = 0;
const check = (name, what, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    results.push({ name, what, got, want, ok });
};

/** A made-up house: two walls (one with a door's leaf), three pieces alike, one with glass, one whose door opens. */
function house() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 200);
    camera.position.set(0, 6, 24);
    camera.lookAt(0, 0, 0);
    scene.add(camera);
    const root = new THREE.Group();
    root.name = "property";
    const shell = new THREE.Group();
    shell.name = "shell";
    const furniture = new THREE.Group();
    furniture.name = "furniture";
    root.add(shell, furniture);
    scene.add(root, new THREE.AmbientLight(0xffffff, 0.5));
    const render = new THREE.MeshStandardMaterial({ name: "render" });
    const box = (w, h, d, material = render) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

    const wall = (name, x) => {
        const group = new THREE.Group();
        group.name = `wall:${name}`;
        group.position.set(x, 0, -4);
        const panel = box(4, 3, 0.2);
        panel.position.y = 1.5;
        group.add(panel);
        shell.add(group);
        return group;
    };
    const plain = wall("a", -3);
    const doored = wall("b", 3);
    // A door's leaf on its hinge, as Door.js hangs one: left to draw itself.
    const hinge = new THREE.Group();
    hinge.userData.hingeSide = 1;
    hinge.position.set(0.5, 0, 0.2);
    const leaf = box(0.9, 2, 0.04, new THREE.MeshStandardMaterial({ name: "leaf" }));
    leaf.userData.doorLeaf = true;
    leaf.position.set(-0.45, 1, 0);
    hinge.add(leaf);
    doored.add(hinge);

    const oak = new THREE.MeshStandardMaterial({ name: "oak" });
    const seat = new THREE.BoxGeometry(1, 0.5, 1);
    const piece = (id, x, extra = null) => {
        const group = new THREE.Group();
        group.name = `furniture:${id}`;
        group.position.set(x, 0, 0);
        const model = new THREE.Group();
        model.name = "Scene";
        const body = new THREE.Mesh(seat, oak);
        body.position.y = 0.25;
        model.add(body);
        extra?.(model);
        group.add(model);
        furniture.add(group);
        return group;
    };
    const chairs = [piece("c1", -6), piece("c2", -4), piece("c3", -2)];
    const glazed = piece("g", 0, (model) => {
        const pane = box(0.8, 0.8, 0.02, new THREE.MeshStandardMaterial({ name: "glass", transparent: true, opacity: 0.3 }));
        pane.position.y = 1;
        model.add(pane);
    });
    let part = null;
    const cupboard = piece("k", 4, (model) => {
        part = new THREE.Group();
        part.name = "door1";
        part.userData.opens = { type: "hinge", angle: Math.PI / 2 };
        part.position.set(0.5, 0, 0.5);
        const front = box(1, 0.5, 0.02, new THREE.MeshStandardMaterial({ name: "front" }));
        front.position.set(-0.5, 0.25, 0);
        part.add(front);
        model.add(part);
    });
    scene.updateMatrixWorld(true);

    const furnitureMap = new Map([...chairs, glazed, cupboard].map((group) => [group.name.slice(10), { group }]));
    const builder = {
        isModelScene: false,
        wallGroups: new Map([["a", { group: plain }], ["b", { group: doored }]]),
        roomGroups: new Map(),
        roofGroups: [],
        railGroups: new Map(),
        lightFittings: null,
        stairs: new Map(),
        furniture: furnitureMap,
        openables: { byNode: new Map() },
    };
    const world = { sceneBuilder: builder, plain: true, editor: null, on() {}, removeListener() {} };
    Experience.instance = { scene };
    const standIns = new StandIns(world);
    return { scene, camera, root, shell, furniture, plain, doored, hinge, chairs, glazed, cupboard, part, builder, standIns };
}

/** How far any object's world matrix is from what three's full walk would make of it now (its parent's × its own). */
function drift(scene) {
    const local = new THREE.Matrix4();
    let worst = 0;
    const walk = (object, parentWorld) => {
        const expected = new THREE.Matrix4();
        if (object.matrixAutoUpdate) local.compose(object.position, object.quaternion, object.scale);
        else local.copy(object.matrix);
        if (parentWorld) expected.multiplyMatrices(parentWorld, local);
        else expected.copy(local);
        for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(expected.elements[i] - object.matrixWorld.elements[i]));
        for (const child of object.children) walk(child, expected);
    };
    walk(scene, null);
    return Math.round(worst * 1e6) / 1e6;
}

/** What three would draw of `scene` (its own projectObject's way): the meshes and lights shown and on the camera's layers, by name. */
function drawn(scene, camera) {
    const out = [];
    const project = (object) => {
        if (object.visible === false) return;
        if (object.layers.test(camera.layers) && (object.isMesh || object.isLight)) out.push(object.name || object.material?.name || object.type);
        for (const child of object.children) project(child);
    };
    project(scene);
    return out.sort();
}

const frame = (h) => {
    h.standIns.update(h.camera);
    const handed = h.standIns.drawnScene();
    return handed;
};
const units = (h) => [...h.standIns.units.values()];
const names = (proxy) => proxy.children.map((child) => child.name || child.type);

// 1–2. Held, and handed to three without what the stand-ins draw entirely.
{
    const h = house();
    const handed = frame(h);
    frame(h);
    const s = h.standIns;
    check("held", "the scene, the property, its shell and its furniture work out their frames no more; so does the stand-ins' group", [h.scene, h.root, h.shell, h.furniture, s.group].map((o) => o.matrixAutoUpdate), [false, false, false, false, false]);
    check("passed over", "every unit is passed over by three's walk, the stand-ins' group too", [units(h).every((u) => u.root.matrixWorldAutoUpdate === false), s.group.matrixWorldAutoUpdate], [true, false]);
    check("frames right", "every world matrix is what three's full walk makes of it", drift(h.scene), 0);
    const away = Object.fromEntries(units(h).map((u) => [u.root.name, u.away]));
    check("away", "a merged wall, three pieces alike and the piece drawn whole are left to the stand-ins; the wall with a door and the piece with glass are not", away, { "wall:a": true, "wall:b": false, "furniture:c1": true, "furniture:c2": true, "furniture:c3": true, "furniture:g": false, "furniture:k": true });
    const proxy = handed;
    const shellProxy = proxy.children.find((c) => c.name === "property")?.children.find((c) => c.name === "shell");
    const furnitureProxy = proxy.children.find((c) => c.name === "property")?.children.find((c) => c.name === "furniture");
    check("handed", "three is handed the shell without the merged wall and the furniture without the pieces the stand-ins draw", [names(shellProxy), names(furnitureProxy)], [["wall:b"], ["furniture:g"]]);
    check("same drawn", "what three would draw of what it is handed is what it would draw of the scene", drawn(proxy, h.camera), drawn(h.scene, h.camera));
    const before = h.scene.children.map((c) => c.matrixWorld.elements.join());
    s.drawnScene();
    check("cheap walk", "handing it again walks the scene, held, and changes no world matrix", h.scene.children.map((c) => c.matrixWorld.elements.join()), before);
    check("its own", "the scene's stand-in is the scene to three in all but its children: fog, background, layers; it walks no matrices itself", [proxy.isScene, proxy.layers === h.scene.layers, proxy.matrixWorldAutoUpdate, proxy !== h.scene], [true, true, false, true]);
}

// 3. Moved, opened, come into, lit.
{
    const h = house();
    frame(h);
    frame(h);
    const [chair] = h.chairs;
    chair.position.x += 0.5;
    frame(h);
    check("moved", "a piece moved by its position alone is where it now is after the next frame", drift(h.scene), 0);
    h.part.rotation.y = 1;
    let handed = frame(h);
    const k = units(h).find((u) => u.root === h.cupboard);
    check("opened", "a part opened is where it now is, and its piece is handed to three while it is open", [drift(h.scene), k.away, names(handed.children[1].children[1]).includes("furniture:k")], [0, false, true]);
    check("same open", "what three would draw of it is still what it would draw of the scene", drawn(handed, h.camera), drawn(h.scene, h.camera));
    h.part.rotation.y = 0;
    handed = frame(h);
    frame(h);
    check("shut", "shut to the last digit, it is left to the stand-ins again", [k.away, names(handed.children[1].children[1]).includes("furniture:k")], [true, false]);
    const extra = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ name: "new" }));
    extra.position.set(0, 1, 0);
    h.chairs[1].add(extra);
    handed = frame(h);
    check("come into", "a mesh come into a piece is placed, and its piece handed to three until the stand-ins draw it", [drift(h.scene), drawn(handed, h.camera).includes("new")], [0, true]);
    const holder = new THREE.Object3D();
    holder.position.set(0.1, 0.9, 0);
    h.chairs[0].add(holder);
    frame(h);
    check("empty come into", "so is an empty holder come into one (no mesh in it for the stand-ins to place)", drift(h.scene), 0);
    const lamp = new THREE.PointLight(0xffffff, 1);
    lamp.name = "lamp";
    h.chairs[2].children[0].add(lamp);
    lamp.updateMatrixWorld(true);
    for (let i = 0; i < 5; i++) handed = frame(h);
    check("lit", "a light hung deep in a piece (as Openables.lend hangs one, its frame worked out) is handed to three once the piece is looked through again", [drift(h.scene), drawn(handed, h.camera).includes("lamp")], [0, true]);
}

// 4. Hidden; changed in place.
{
    const h = house();
    frame(h);
    h.plain.visible = false;
    let handed = frame(h);
    check("hidden", "a hidden wall is handed to three, which passes it over: nothing of it drawn", [names(handed.children[1].children[0]).includes("wall:a"), drawn(handed, h.camera)], [true, drawn(h.scene, h.camera)]);
    h.plain.visible = true;
    frame(h);
    const stray = new THREE.Group();
    stray.name = "stray";
    stray.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "stray-mesh" })));
    const outer = h.root.children.indexOf(h.furniture);
    const parked = new THREE.Group();
    parked.name = "parked";
    h.root.add(parked);
    frame(h);
    h.root.remove(parked);
    h.root.add(stray);
    stray.updateMatrixWorld(true);
    handed = frame(h);
    check("swapped", "a group's child swapped for another, their number the same, is sorted again", [names(handed.children[1]).includes("stray"), names(handed.children[1]).includes("parked"), drawn(handed, h.camera).includes("stray-mesh"), outer >= 0], [true, false, true, true]);
}

// 5. Let go; never held.
{
    const h = house();
    frame(h);
    h.plain.position.x += 1;
    h.standIns.setActive(false);
    check("let go", "everything works out its own frame and is walked as built again; nothing stands in for the scene", [[h.scene, h.root, h.shell, h.furniture, h.standIns.group].map((o) => o.matrixAutoUpdate), units(h).every((u) => u.root.matrixWorldAutoUpdate), h.standIns.drawnScene(), drift(h.scene)], [[true, true, true, true, true], true, null, 0]);
    const g = house();
    g.standIns.holds = false;
    frame(g);
    check("still=0", "told not to hold, nothing is held and the scene itself is drawn", [[g.scene, g.root].map((o) => o.matrixAutoUpdate), units(g).every((u) => u.root.matrixWorldAutoUpdate), g.standIns.drawnScene()], [[true, true], true, null]);
}

for (const r of results) {
    console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}: ${r.what}`);
    if (!r.ok) console.log(`       got ${JSON.stringify(r.got)}\n      want ${JSON.stringify(r.want)}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected`);
process.exit(failed ? 1 : 0);

/**
 * A public view's shut doors, drawers and sashes drawn a mesh a material
 * (frontend/Experience/World/ShutBatcher.js), on made-up parts:
 * `node scripts/test-shut.mjs`. Exits 1 if any of these does not hold:
 *
 *   1. Parts whose materials look alike are one mesh, on whatever floor;
 *      another look, how a part is lit, another mesh — and each mesh holds
 *      every triangle of its parts where it stands in the world.
 *   2. Lit as the scene lights anything, every shut part is drawn by its
 *      material's mesh at once: its index the parts', theirs on REAL_LAYER,
 *      a part merged whole hidden at its node, and held still and passed
 *      over by three's matrix walk. The floors shown from above (showFloors)
 *      are the only ones in each mesh's index, and with none said, all.
 *   3. A part opened is lifted out — its triangles out of the index, its
 *      meshes drawn, its node shown and moving — and once shut again, to
 *      the last digit (Openable.update), back in.
 *   4. One a room shown live draws (`userData.roomLive`) is lifted out; given
 *      back with the layers it was taken with while it stood open, it is
 *      drawn by itself still.
 *   5. Lit by the probes, a part waits for its light; given it, its row
 *      holds its six ways, its sun and its reflections' share, the material
 *      is made from what it wears undressed, and it goes in. Tinted, its
 *      row holds its tint, and the material is its tinted one glowing by
 *      its row.
 *   6. Turned off, nothing is merged and everything is as it was.
 *   7. A window's panes are one mesh while its sashes are shut, about their
 *      middle; a sash opened, the panes again. A sash with its frame merged
 *      and its pane in its window's mesh is hidden at its group; shown as
 *      soon as either is not.
 *   9. What shut parts hide (enclose: a fridge's glass shelves) is on no
 *      layer while every one of them is shut, drawn the moment one opens,
 *      left to a room shown live while it draws it — marked shut in
 *      (`userData.shutIn`) as its doors stand, for that room's stand-in —
 *      and as it was once let go or turned off.
 *   8. A row's texels are where the shaders look for them, in a texture of
 *      several columns too.
 */
import * as THREE from "three";

import Openables from "../frontend/Experience/World/Openables.js";
import ShutBatcher, { tintByPart } from "../frontend/Experience/World/ShutBatcher.js";
import { REAL_LAYER } from "../frontend/Experience/Utils/layers.js";

const results = [];
let failed = 0;
const say = (name, problem, note = "") => {
    results.push({ name, problem, note });
    if (problem) failed++;
};
const REAL = 1 << REAL_LAYER;

/** A part's holder, as a published runtime file has one: standing in the world, its meshes under it. */
function holder({ at = [0, 0, 0], level = 0, materials, opens = { type: "hinge", angle: Math.PI / 2 }, name = "door" }) {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...at);
    node.userData = { opens, piece: name };
    materials.forEach((material, i) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.02).translate(0.3, 0.35, 0.01 + i * 0.02), material);
        mesh.userData = { level };
        node.add(mesh);
    });
    return node;
}

const lacquer = () => new THREE.MeshStandardMaterial({ name: "lacquer", color: 0xc08040, roughness: 0.4 });
const steel = () => new THREE.MeshStandardMaterial({ name: "steel", color: 0x999999, metalness: 1 });
const glass = () => new THREE.MeshPhysicalMaterial({ name: "glass", transparent: true, opacity: 0.2 });
const look = (material) => `${material.type}|${material.name}|${material.color.getHex()}|${material.transparent}`;

/** A kitchen's and a wardrobe's parts on two floors, and a shower's door with its glass. */
function scene() {
    const root = new THREE.Group();
    const group = new THREE.Group();
    root.add(group);
    const nodes = [
        holder({ at: [0, 0, 0], materials: [lacquer(), steel()], name: "a" }),
        holder({ at: [1, 0, 0], materials: [lacquer(), steel()], name: "b" }),
        holder({ at: [0, 3, 0], level: 1, materials: [lacquer()], name: "c" }),
        holder({ at: [2, 0, 0], materials: [steel(), glass()], name: "shower" }),
    ];
    for (const node of nodes) group.add(node);
    root.updateMatrixWorld(true);
    const openables = new Openables();
    openables.add(group);
    return { root, group, nodes, openables };
}

const meshesOf = (node) => node.children.filter((child) => child.isMesh);
const drawn = (batcher) => batcher.buckets.reduce((sum, bucket) => sum + bucket.geometry.drawRange.count, 0);
const indexCount = (meshes) => meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count, 0);

/** Every triangle of `meshes` in the world, rounded, as a sorted list: to compare with what a bucket draws. */
function trianglesOf(meshes) {
    const out = [];
    const v = new THREE.Vector3();
    for (const mesh of meshes) {
        const { index, attributes } = mesh.geometry;
        for (let i = 0; i < index.count; i++) out.push(v.fromBufferAttribute(attributes.position, index.getX(i)).applyMatrix4(mesh.matrixWorld).toArray().map((n) => n.toFixed(5)).join(","));
    }
    return out.sort();
}
function bucketTriangles(bucket) {
    const out = [];
    const { index, attributes } = bucket.geometry;
    const v = new THREE.Vector3();
    for (let i = 0; i < bucket.geometry.drawRange.count; i++) out.push(v.fromBufferAttribute(attributes.position, index.array[i]).toArray().map((n) => n.toFixed(5)).join(","));
    return out.sort();
}

// ---- 1, 2: buckets, and everything shut in at once -----------------------------------------

{
    const { root, nodes, openables } = scene();
    const batcher = new ShutBatcher({ parts: openables.parts, light: "plain", look, levelOf: (mesh) => mesh.userData.level ?? 0, parent: root, enabled: true });
    // a and b: lacquer and steel on floor 0; c: lacquer on floor 1; the shower: steel on floor 0, its glass left alone.
    const keys = batcher.buckets.map((bucket) => bucket.source.name).sort();
    say("one mesh a look, of every floor", keys.join() === "lacquer,steel" ? null : keys.join(), keys.join());
    const shower = batcher.byNode.get(nodes[3]);
    say("a part with glass is merged but for its glass, and not hidden as a whole", shower && shower.meshes.length === 1 && !shower.whole && batcher.byNode.get(nodes[0]).whole ? null : `shower ${shower?.meshes.length} whole ${shower?.whole}`);

    batcher.update();
    const opaque = nodes.flatMap((node) => meshesOf(node).filter((mesh) => !mesh.material.transparent));
    let problem = drawn(batcher) === indexCount(opaque) ? null : `${drawn(batcher)} indices drawn of ${indexCount(opaque)}`;
    for (const bucket of batcher.buckets) {
        const parts = opaque.filter((mesh) => look(mesh.material) === look(bucket.source));
        const want = trianglesOf(parts);
        const have = bucketTriangles(bucket);
        if (want.join("|") !== have.join("|")) problem ??= `${bucket.source.name}: ${have.length} corners against ${want.length}`;
        if (bucket.mesh.layers.mask !== 1) problem ??= `${bucket.mesh.name} on layers ${bucket.mesh.layers.mask}`;
    }
    say("every shut part drawn by its material's mesh, every triangle where it stands", problem, `${drawn(batcher) / 3} triangles in ${batcher.buckets.length} meshes`);

    // From above, the ground floor shown: c (floor 1) out of the lacquer's index, and back with every floor shown.
    batcher.showFloors((level) => level <= 0);
    const lacquer = batcher.buckets.find((bucket) => bucket.source.name === "lacquer");
    const ground = trianglesOf(opaque.filter((mesh) => mesh.material.name === "lacquer" && (mesh.userData.level ?? 0) <= 0)).join("|") === bucketTriangles(lacquer).join("|");
    batcher.showFloors(null);
    const every = drawn(batcher) === indexCount(opaque);
    say("from above, the floors shown alone in each mesh's index; all again after", ground && every ? null : `ground ${ground} every ${every}`);

    const held = nodes.slice(0, 3).every((node) => !node.visible && !node.matrixAutoUpdate && !node.matrixWorldAutoUpdate && meshesOf(node).every((mesh) => mesh.layers.mask === REAL));
    const glassShown = meshesOf(nodes[3]).find((mesh) => mesh.material.transparent).layers.mask === 1 && nodes[3].visible;
    say("its meshes off the cameras' layer, merged whole hidden, held still and passed over; glass still drawn", held && glassShown ? null : `held ${held} glass ${glassShown}`);

    // ---- 3: opened, lifted out; shut, back in --------------------------------------------
    const part = openables.byNode.get(nodes[0]);
    const before = drawn(batcher);
    part.setOpen(true);
    part.update(1 / 60);
    batcher.update();
    const own = indexCount(meshesOf(nodes[0]));
    const lifted = drawn(batcher) === before - own && nodes[0].visible && nodes[0].matrixAutoUpdate && nodes[0].matrixWorldAutoUpdate && meshesOf(nodes[0]).every((mesh) => mesh.layers.mask === 1);
    const others = trianglesOf(opaque.filter((mesh) => mesh.parent !== nodes[0])).join("|") === batcher.buckets.flatMap(bucketTriangles).sort().join("|");
    say("opened, lifted out: its triangles out, drawn itself, shown and moving", lifted && others ? null : `drawn ${drawn(batcher)} of ${before} less ${own}; others ${others}`);
    let frames = 0;
    while (part.update(1 / 60) && frames < 600) frames++;
    part.setOpen(false);
    while (part.update(1 / 60) && frames < 1200) frames++;
    batcher.update();
    const back = drawn(batcher) === before && !nodes[0].visible && !nodes[0].matrixAutoUpdate && nodes[0].quaternion.equals(part.restQuaternion);
    say("shut again, to its rest pose to the last digit, and back in", back ? null : `drawn ${drawn(batcher)} of ${before}; quaternion ${nodes[0].quaternion.toArray()} against ${part.restQuaternion.toArray()}`);

    // A step that would leave a part a hair from where it is going lands it there (Openable.update): 27 steps of 2.2 a
    // second that come to 0.9995 left it at that for good, and on its way back shut at a hair from it.
    const step = 0.9995 / 27 / 2.2;
    part.setOpen(true);
    while (part.update(step));
    const opened = part.open;
    part.setOpen(false);
    while (part.update(step));
    say("however the steps fall, open is open and shut is exactly shut", opened === 1 && part.open === 0 && nodes[0].quaternion.equals(part.restQuaternion) ? null : `open ${opened}, then ${part.open}`);

    // Shut while its frame was last worked out open (the scene's walk passes it over once it is in): brought up to date.
    part.setOpen(true);
    while (part.update(1 / 60));
    batcher.update();
    root.updateMatrixWorld();
    const restWorld = nodes[0].parent.matrixWorld.clone().multiply(new THREE.Matrix4().compose(part.restPosition, part.restQuaternion, nodes[0].scale));
    part.setOpen(false);
    while (part.update(1 / 60));
    batcher.update();
    root.updateMatrixWorld();
    const apart = nodes[0].matrixWorld.elements.reduce((most, n, i) => Math.max(most, Math.abs(n - restWorld.elements[i])), 0);
    say("gone in, its world matrix where it is shut, though the scene's walk passes it over", apart < 1e-12 ? null : `${apart} off`);

    // ---- 4: a room shown live -------------------------------------------------------------
    const mesh = meshesOf(nodes[1])[0];
    mesh.userData.roomLive = true;
    batcher.update();
    const live = !batcher.byNode.get(nodes[1]).in && mesh.layers.mask === 1 && nodes[1].visible;
    const second = openables.byNode.get(nodes[1]);
    second.setOpen(true);
    second.update(1 / 60);
    // Given back while it stands open, with the layers it was taken with (LiveRoom.giveBack).
    mesh.layers.mask = REAL;
    delete mesh.userData.roomLive;
    batcher.update();
    say("drawn by a room shown live: lifted out; given back open: drawn by itself still", live && mesh.layers.mask === 1 && !batcher.byNode.get(nodes[1]).in ? null : `live ${live} mask ${mesh.layers.mask}`);
    second.reset();
    batcher.update();

    // ---- 6: turned off ----------------------------------------------------------------------
    batcher.setEnabled(false);
    const off = drawn(batcher) === 0 && batcher.buckets.every((bucket) => bucket.mesh.layers.mask === 0) && nodes.every((node) => node.visible && node.matrixAutoUpdate && meshesOf(node).every((mesh) => mesh.layers.mask === 1));
    batcher.setEnabled(true);
    say("turned off, every part drawn by itself as before, the merged meshes drawing nothing", off && drawn(batcher) === indexCount(opaque) ? null : `off ${off}`);
    batcher.dispose();
    say("let go, everything as it was", nodes.every((node) => node.visible && node.matrixAutoUpdate && node.matrixWorldAutoUpdate && meshesOf(node).every((mesh) => mesh.layers.mask === 1)) && !root.children.includes(batcher.group) ? null : "left changed");
}

// ---- 5: lit by the probes, or tinted ----------------------------------------------------------

{
    const { root, nodes, openables } = scene();
    const made = [];
    const probes = {
        undressed: new Map(),
        batchMaterial(material, light) {
            const clone = material.clone();
            clone.userData.madeFrom = material.name;
            made.push({ material, light });
            return clone;
        },
    };
    const batcher = new ShutBatcher({ parts: openables.parts, light: "probe", look, levelOf: (mesh) => mesh.userData.level ?? 0, parent: root, enabled: true });
    batcher.update();
    say("lit by the probes, nothing goes in before its light is known", drawn(batcher) === 0 && batcher.buckets.every((bucket) => bucket.mesh.layers.mask === 0) ? null : `drawn ${drawn(batcher)}`);

    const part = openables.byNode.get(nodes[1]);
    // As ProbeLight.dress has it: each mesh in a copy of its own, what it wore before kept (`undressed`).
    const undressed = meshesOf(nodes[1]).map((mesh) => {
        probes.undressed.set(mesh, mesh.material);
        const before = mesh.material;
        mesh.material = before.clone();
        mesh.material.userData.probeLit = true;
        return before;
    });
    const cube = Array.from({ length: 6 }, (_, f) => new THREE.Vector3(f + 0.1, f + 0.2, f + 0.3));
    batcher.lightPart(part, { cube, sun: { value: 0.75 }, factor: 0.4 }, probes);
    batcher.update();
    const entry = batcher.byNode.get(nodes[1]);
    const data = batcher.texture.image.data;
    const at = batcher.texel(entry.row);
    let rowProblem = null;
    for (let f = 0; f < 6; f++) for (let c = 0; c < 3; c++) if (Math.abs(data[at + f * 4 + c] - cube[f].getComponent(c)) > 1e-6) rowProblem ??= `way ${f} channel ${c}`;
    if (Math.abs(data[at + 3] - 0.75) > 1e-6 || Math.abs(data[at + 7] - 0.4) > 1e-6) rowProblem ??= `sun ${data[at + 3]} share ${data[at + 7]}`;
    say("its row: the six ways' light, the sun's share, the reflections' share", rowProblem);
    const rows = [...batcher.buckets.filter((bucket) => entry.buckets.includes(bucket))].every((bucket) => {
        const { partRow } = bucket.geometry.attributes;
        return partRow && [...partRow.array].includes(entry.row);
    });
    say(
        "lit, it goes in, its materials made from what it wears undressed, its vertices naming its row",
        entry.in && made.length === 2 && made.every(({ material, light }, i) => material === undressed[i] && light === batcher.uniforms) && rows ? null : `in ${entry.in} made ${made.length} rows ${rows}`
    );
    const other = batcher.byNode.get(nodes[0]);
    batcher.lightPart(openables.byNode.get(nodes[0]), { cube, sun: { value: 1 }, factor: 1 }, probes);
    batcher.update();
    say("the next of the same look takes the material made", other.in && made.length === 2 ? null : `made ${made.length}`);
    batcher.dispose();
}
{
    const { root, nodes, openables } = scene();
    const batcher = new ShutBatcher({ parts: openables.parts, light: "tint", look, levelOf: (mesh) => mesh.userData.level ?? 0, parent: root, enabled: true });
    const part = openables.byNode.get(nodes[2]);
    // As SceneBuilder.tintOpenables tints a part's material.
    const mesh = meshesOf(nodes[2])[0];
    const base = mesh.material.color.clone();
    const tinted = mesh.material.clone();
    tinted.userData.baseColor = base;
    tinted.userData.bakedTint = true;
    tinted.color.copy(base).multiplyScalar(0.25);
    const light = new THREE.Color(0.5, 0.25, 0.125);
    tinted.emissive.copy(base).multiply(light).multiplyScalar(0.85);
    mesh.material = tinted;
    batcher.tintPart(part, light);
    batcher.update();
    const entry = batcher.byNode.get(nodes[2]);
    const at = batcher.texel(entry.row);
    const data = batcher.texture.image.data;
    const material = entry.bucketOf[0].material;
    const glow = base.clone().multiplyScalar(0.85);
    say(
        "tinted: its row its tint, its material its tinted one glowing by its own colour, its row's light multiplied in",
        entry.in && Math.abs(data[at] - 0.5) < 1e-6 && Math.abs(data[at + 1] - 0.25) < 1e-6 && material.color.equals(tinted.color) && material.emissive.equals(glow) && material.customProgramCacheKey().includes("part-tint")
            ? null
            : `in ${entry.in} emissive ${material?.emissive?.toArray()}`
    );
    const shader = { uniforms: {}, vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}", fragmentShader: "#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}" };
    material.onBeforeCompile(shader, null);
    say(
        "the tint's shader reads its row where its vertices are and multiplies it into the glow",
        shader.uniforms.partLight === batcher.uniforms.texture && /readPartTint\(\)/.test(shader.vertexShader) && /totalEmissiveRadiance \*= vPartTint/.test(shader.fragmentShader) ? null : "not patched"
    );
    batcher.dispose();
}
say("tintByPart is exported for the view", typeof tintByPart === "function" ? null : "missing");

// ---- 7: a window's panes --------------------------------------------------------------------

{
    const root = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ name: "frame_bronze", color: 0x443322 });
    const pane = new THREE.MeshPhysicalMaterial({ name: "glass_solar", transparent: true, opacity: 0.3 });
    const sash = (x) => {
        const group = new THREE.Group();
        const turn = new THREE.Group();
        const tilt = new THREE.Group();
        const leaf = new THREE.Group();
        group.position.set(x, 1.4, 0);
        group.add(turn);
        turn.add(tilt);
        tilt.add(leaf);
        leaf.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.05), frame), new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.92, 0.015), pane));
        root.add(group);
        return { wallId: "w1", spec: { id: "o1" }, group, turn, tilt, leaf, open: 0, target: 0 };
    };
    const sashes = [sash(0), sash(0.5)];
    root.updateMatrixWorld(true);
    const batcher = new ShutBatcher({ parts: [], sashes, light: "probe", look, levelOf: () => 0, parent: root, enabled: true });
    batcher.update();
    const glassMesh = batcher.windows[0]?.mesh;
    const panes = sashes.map((s) => s.leaf.children[1]);
    const middle = glassMesh && Math.abs(glassMesh.position.x - 0.25) < 1e-9 && Math.abs(glassMesh.position.y - 1.4) < 1e-9;
    const merged = batcher.windows.length === 1 && glassMesh.layers.mask === 1 && panes.every((p) => p.layers.mask === REAL) && middle && glassMesh.material === pane;
    const frames = batcher.entries.length === 2 && batcher.entries.every((e) => e.in) && sashes.every((s) => !s.turn.matrixWorldAutoUpdate);
    say("shut, a window's panes one mesh about their middle; its sashes' frames merged, lit live at once", merged && frames ? null : `merged ${merged} frames ${frames}`);
    say("nothing left of a shut sash to draw: hidden at its group", sashes.every((s) => !s.group.visible) ? null : `groups ${sashes.map((s) => s.group.visible)}`);
    sashes[1].target = 1;
    sashes[1].open = 0.2;
    batcher.update();
    const apart = glassMesh.layers.mask === 0 && panes.every((p) => p.layers.mask === 1) && !batcher.entries[1].in && batcher.entries[0].in && sashes[1].turn.matrixAutoUpdate;
    say("a sash opening: the panes again, its frame lifted out and moving", apart ? null : "still merged");
    say("...and both sashes shown again, the other's pane drawn by itself", sashes.every((s) => s.group.visible) ? null : `groups ${sashes.map((s) => s.group.visible)}`);
    sashes[1].target = sashes[1].open = 0;
    batcher.update();
    panes[0].userData.roomLive = true;
    batcher.update();
    const live = glassMesh.layers.mask === 0 && panes.every((p) => p.layers.mask === 1);
    delete panes[0].userData.roomLive;
    panes[1].material = pane.clone();
    batcher.update();
    const glazed = glassMesh.layers.mask === 0 && panes.every((p) => p.layers.mask === 1);
    panes[1].material = pane;
    batcher.update();
    say("a pane a room shown live draws, or wearing other glass (turned in, in a room): the panes again; then one mesh", live && glazed && glassMesh.layers.mask === 1 ? null : `live ${live} glazed ${glazed}`);
    // Its frame drawn by a room shown live (its pane not): the frame out of the merged mesh, the window's glass still one —
    // and the sash shown, for its frame; hidden again once given back.
    const frameMesh = sashes[0].leaf.children[0];
    frameMesh.userData.roomLive = true;
    batcher.update();
    const shownForFrame = sashes[0].group.visible && !sashes[1].group.visible && glassMesh.layers.mask === 1;
    delete frameMesh.userData.roomLive;
    batcher.update();
    say("a sash's frame drawn by a room shown live: that sash shown, the window's glass one still; hidden again after", shownForFrame && !sashes[0].group.visible ? null : `shown ${shownForFrame} after ${sashes[0].group.visible}`);
    batcher.dispose();
    say("let go, the sashes shown", sashes.every((s) => s.group.visible) ? null : "still hidden");
}

// ---- 9: what shut parts hide ----------------------------------------------------------------

{
    const { root, nodes, openables } = scene();
    const batcher = new ShutBatcher({ parts: openables.parts, light: "plain", look, levelOf: (mesh) => mesh.userData.level ?? 0, parent: root, enabled: true });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 0.3), glass());
    root.add(shelf);
    const doors = [openables.byNode.get(nodes[0]), openables.byNode.get(nodes[1])];
    batcher.enclose([{ mesh: shelf, parts: doors }]);
    batcher.update();
    const hidden = shelf.layers.mask === 0 && shelf.visible;
    doors[1].setOpen(true);
    doors[1].update(1 / 60);
    batcher.update();
    const opening = shelf.layers.mask === 1;
    while (doors[1].update(1 / 60));
    doors[1].setOpen(false);
    while (doors[1].update(1 / 60));
    batcher.update();
    const shutAgain = shelf.layers.mask === 0;
    say("shut in: on no layer while every door is shut, drawn the moment one opens, and not again once shut", hidden && opening && shutAgain ? null : `hidden ${hidden} opening ${opening} shut again ${shutAgain}`);
    // A room shown live takes it as it is (on no layer), opens a door meanwhile, and gives it back as it took it.
    shelf.userData.roomLive = true;
    doors[0].setOpen(true);
    doors[0].update(1 / 60);
    batcher.update();
    const leftAlone = shelf.layers.mask === 0;
    delete shelf.userData.roomLive;
    batcher.update();
    const afterLive = shelf.layers.mask === 1;
    doors[0].reset();
    batcher.update();
    say("drawn by a room shown live: left as it is; given back with a door open, drawn", leftAlone && afterLive && shelf.layers.mask === 0 ? null : `left ${leftAlone} after ${afterLive}`);
    // ...and while the room draws it, marked shut in as its doors stand (its stand-in there hidden by LiveRoom.follow).
    shelf.userData.roomLive = true;
    batcher.update();
    const markedShut = shelf.userData.shutIn === true && shelf.layers.mask === 0;
    doors[0].setOpen(true);
    doors[0].update(1 / 60);
    batcher.update();
    const markedOpen = shelf.userData.shutIn === false;
    doors[0].reset();
    batcher.update();
    const markedAgain = shelf.userData.shutIn === true;
    delete shelf.userData.roomLive;
    batcher.update();
    const unmarked = !("shutIn" in shelf.userData) && shelf.layers.mask === 0;
    say("drawn by a room shown live: marked shut in while every door is shut, not once one opens, the mark gone once given back", markedShut && markedOpen && markedAgain && unmarked ? null : `shut ${markedShut} open ${markedOpen} again ${markedAgain} unmarked ${unmarked}`);
    batcher.setEnabled(false);
    const off = shelf.layers.mask === 1;
    batcher.setEnabled(true);
    batcher.dispose();
    say("turned off, or let go, drawn as before", off && shelf.layers.mask === 1 ? null : `off ${off} let go ${shelf.layers.mask}`);
}

// ---- 8: where a row is ------------------------------------------------------------------------

{
    // Two columns of two rows (six texels a row): row 3 is the second column's second.
    const at = ShutBatcher.prototype.texel.call({ rows: 2, texture: { image: { width: 12 } } }, 3);
    say("a row's first texel, in a texture of several columns", at === (1 * 12 + 6) * 4 ? null : `${at}`);
}

for (const { name, problem, note } of results) console.log(`${problem ? "FAIL" : "ok  "}  ${name}${problem ? ` — ${problem}` : note ? ` — ${note}` : ""}`);
console.log(`\n${results.length - failed} of ${results.length} as expected`);
process.exit(failed ? 1 : 0);

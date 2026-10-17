/**
 * Running water and steam (frontend/Experience/World/Water.js), in node:
 * `node scripts/test-water.mjs`. Prints each case and exits 1 if any is not
 * what is expected of it.
 *
 * The arithmetic first — how far water falls in a time and how long a fall
 * takes, how far down an opened tap's water has reached and where a shut
 * one's last leaves off, how a hot shower's steam builds and clears and the
 * mist on its glass after it, what stands in an enclosure's box. Then, over
 * Ladonia (scenes/kosinozici-villas.json and the wet pieces' models in
 * public/models/furniture, git-ignored: skipped with a note where they are
 * missing), the fixtures as the editor finds them in each piece's model and
 * as a public view finds them in its runtime file's holders — the same, by
 * the same ids, in the same places —: how many there are and of what, each
 * control with its water and each enclosure with its shower; that a ray from
 * in front of each tap or valve aims at it within its reach, and from behind
 * a wall does not; that standing in each shower is offered that shower, and
 * that anything else aimed at there wins over it; turning water on and off,
 * its head and tail, what Pace is told, and every fixture settled again;
 * a shower's steam built and cleared; the light on the water in each kind
 * of view; which floors' water shows from above; and the prompt's words.
 */
import { existsSync, readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import Water, { HEAT, MIST, COUNTS, NEUTRAL, fallTime, fallen, inBox, reach, warm } from "../frontend/Experience/World/Water.js";
import { REACH, pickTarget } from "../shared/interact.js";

const results = [];
let failed = 0;

function check(name, what, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    results.push({ name, what, got, want, ok });
}

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const read = (relative) => {
    try {
        return JSON.parse(readFileSync(path(relative), "utf8"));
    } catch {
        return null;
    }
};

// ---- the arithmetic -------------------------------------------------------------

{
    const falls = [0.158, 0.455, 1.9765, 2.1165];
    check("fall time", "falling for fallTime(f) from 0.6 or 1.6 m/s covers f, to a micrometre", falls.flatMap((f) => [0.6, 1.6].map((v) => round(fallen(fallTime(f, v), v), 6))), falls.flatMap((f) => [f, f]));
    check("a shower's fall", "2 m from a head's 1.6 m/s: about half a second", round(fallTime(1.9765, 1.6), 2), 0.49);
    const t = fallTime(0.455, 0.6);
    check("opened", "a kitchen tap's water half way down its time is less than half way down its fall (it speeds up), at the bowl by its time", [round(reach(0.455, 0.6, t / 2).head, 3) < 0.5, round(reach(0.455, 0.6, t).head, 9), reach(0.455, 0.6, 0).head], [true, 1, 0]);
    check("shut", "the last of it leaves the spout as it is shut and is down by the fall's time: tail 0, then 1", [reach(0.455, 0.6, 9, 0).tail, round(reach(0.455, 0.6, 9, t).tail, 9), reach(0.455, 0.6, 9).tail], [0, 1, 0]);
    let state = { heat: 0, mist: 0 };
    const run = (on, seconds) => {
        for (let i = 0; i < seconds * 60; i++) state = warm(state, on, 1 / 60);
        return { heat: round(state.heat, 2), mist: round(state.mist, 2) };
    };
    const half = run(true, HEAT.up / 2);
    check("steam builds", `hot water for ${HEAT.up / 2} s: half the steam, the glass behind it`, [half.heat, half.mist < half.heat], [0.5, true]);
    const full = run(true, HEAT.up / 2 + 0.1);
    check("full steam", `after ${HEAT.up} s: all of it; the mist on the glass still coming`, [full.heat, full.mist < 1], [1, true]);
    run(true, MIST.up);
    const off = run(false, HEAT.down / 2);
    check("clearing", `${HEAT.down / 2} s after it stops: half the steam left, more of the mist`, [off.heat, off.mist > off.heat], [0.5, true]);
    const gone = run(false, HEAT.down / 2 + 0.1);
    check("cleared", `${HEAT.down} s after: no steam; the mist clears after it`, [gone.heat, gone.mist > 0], [0, true]);
    run(false, MIST.down);
    check("glass clear", `${MIST.down} s more: the glass clear`, state.mist, 0);
    const half3 = new THREE.Vector3(0.5, 1, 0.4);
    check("in the box", "its middle, a corner, over its top within the slack, beside it, under it", [
        inBox(new THREE.Vector3(0, 0, 0), half3),
        inBox(new THREE.Vector3(0.49, -0.99, -0.39), half3),
        inBox(new THREE.Vector3(0, 1.3, 0), half3, 0.4),
        inBox(new THREE.Vector3(0.51, 0, 0), half3, 0.4),
        inBox(new THREE.Vector3(0, -1.01, 0), half3, 0.4),
    ], [true, true, true, false, false]);
}

// ---- Ladonia ---------------------------------------------------------------------

const scene = read("../scenes/kosinozici-villas.json");
const spec = scene?.scene ?? scene?.spec ?? null;
const furniture = path("../public/models/furniture/");

/** A model's nodes with water, a control or steam: `{ name, at, fixture }`, as three names them (no dot). */
function anchorsOf(id) {
    const file = `${furniture}${id}.glb`;
    if (!existsSync(file)) return null;
    const bytes = readFileSync(file);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
    const out = [];
    for (const node of json.nodes ?? []) {
        const fixture = node.extras?.fixture;
        if (!fixture || !(fixture.water || fixture.control || fixture.steam)) continue;
        out.push({ name: String(node.name ?? "").replace(/[[\]./:]/g, ""), at: node.translation ?? [0, 0, 0], fixture });
    }
    return out;
}

const wet = new Map();
let missing = 0;
for (const placement of spec?.furniture ?? []) {
    if (wet.has(placement.catalog_id)) continue;
    const anchors = anchorsOf(placement.catalog_id);
    if (anchors === null) missing++;
    wet.set(placement.catalog_id, anchors ?? []);
}

if (!spec || missing > 50) {
    console.log("(Ladonia's scene or the furniture's models not found: the fixtures are not checked.)\n");
} else {
    /** The room a point stands in: the nearest floor at or below it (SceneBuilder.roomAt, without its voids). */
    const inside = (x, z, polygon) => {
        let hit = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, zi] = polygon[i];
            const [xj, zj] = polygon[j];
            if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
        }
        return hit;
    };
    const roomAt = (x, y, z) => {
        let best = null;
        for (const room of spec.rooms) {
            const drop = y - room.elevation;
            if (drop < -0.6 || drop > room.height + 0.4 || !inside(x, z, room.polygon)) continue;
            if (!best || Math.abs(drop) < Math.abs(y - best.elevation)) best = room;
        }
        return best;
    };

    // The editor's: each wet piece's group placed as the editor places it (FurnitureLibrary.createInstance), its
    // model in it, the model's anchors in that.
    const root = new THREE.Group();
    const groups = new Map();
    for (const placement of spec.furniture) {
        const anchors = wet.get(placement.catalog_id);
        if (!anchors?.length) continue;
        const group = new THREE.Group();
        group.position.fromArray(placement.position);
        group.rotation.y = THREE.MathUtils.degToRad(placement.rotation ?? 0);
        group.scale.setScalar(placement.scale ?? 1);
        group.userData = { kind: "furniture", id: placement.id };
        const model = new THREE.Group();
        group.add(model);
        for (const anchor of anchors) {
            const node = new THREE.Object3D();
            node.name = anchor.name;
            node.position.fromArray(anchor.at);
            node.userData = { fixture: anchor.fixture };
            model.add(node);
        }
        root.add(group);
        groups.set(placement.id, { placement, group });
    }
    root.updateMatrixWorld(true);
    // A public view's: the same nodes as Publish/Runtime.js copies them, in the world, under one "openable" group.
    const openable = new THREE.Group();
    openable.name = "openable";
    for (const [id, { group }] of groups) {
        group.traverse((node) => {
            if (!node.userData.fixture) return;
            const holder = new THREE.Group();
            holder.name = node.name;
            holder.applyMatrix4(node.matrixWorld);
            holder.userData = { piece: id, label: "piece", fixture: node.userData.fixture };
            openable.add(holder);
        });
    }
    openable.updateMatrixWorld(true);

    /** A world as Water asks it, in the editor (`public` false) or a public view. */
    const worldOf = (publicView) => {
        const world = new EventEmitter();
        world.spec = spec;
        world.plain = !publicView;
        world.player = { seated: false, inVehicle: false };
        world.experience = { publicView };
        world.sceneBuilder = publicView
            ? { spec, runtime: {}, openableGroup: openable, roomAt, openables: { parts: [] } }
            : { spec, furniture: groups, roomAt, openables: { parts: [] } };
        return world;
    };
    const editor = new Water(worldOf(false));
    const view = new Water(worldOf(true));

    const kinds = (water) => {
        const outlets = [...water.outlets.values()];
        return {
            outlets: outlets.length,
            taps: outlets.filter((o) => o.kind === "tap").length,
            rain: outlets.filter((o) => o.kind === "rain").length,
            hot: outlets.filter((o) => o.hot).length,
            controls: water.controls.size,
            showers: water.enclosures.size,
        };
    };
    check("fixtures", "Ladonia's: 51 taps (23 basins, 15 kitchen sinks, 13 outdoor) and 19 showers' heads, 53 hot; 70 controls; 15 indoor showers' enclosures", kinds(editor), { outlets: 70, taps: 51, rain: 19, hot: 53, controls: 70, showers: 15 });
    check("the same in a public view", "found in the runtime file's holders instead of the pieces' models: the same", kinds(view), kinds(editor));
    const positions = (water) => [...water.controls.values()].map((control) => (water.place(control), `${control.id}@${control.at.toArray().map((n) => round(n, 4)).join(",")}`)).sort();
    check("by the same ids, in the same places", "every control's id and place, editor against public view", positions(view), positions(editor));
    check("every control works water", "each has an outlet of its own piece; a shower's valve its head, a tap its spout", [...editor.controls.values()].filter((c) => !c.outlets.length || c.outlets.some((o) => o.piece !== c.piece)).map((c) => c.id), []);
    check("every enclosure its shower", "each of the 15 has one hot head and the valve for it", [...editor.enclosures.values()].filter((e) => e.outlets.length !== 1 || !e.outlets[0].hot || !e.control).map((e) => e.id), []);
    check("ids", "named by what they are in the piece", ["a-f126:control_basin", "a-f126:water_basin", "a-f032:steam", "c-f098:control_basin2"].map((id) => editor.controls.has(id) || editor.outlets.has(id) || editor.enclosures.has(id)), [true, true, true, true]);

    // Aimed at: from 0.6 m out in front of each (out from the tap's body past its spout; out from a valve's wall
    // to the enclosure's middle), at its middle; and from behind it, through what it is fixed to.
    const ray = new THREE.Ray();
    const aimFrom = (control, out) => {
        editor.place(control);
        const outlet = control.outlets[0];
        editor.place(outlet);
        const enclosure = [...editor.enclosures.values()].find((each) => each.piece === control.piece);
        if (enclosure) editor.place(enclosure);
        const towards = (control.kind === "shower" ? enclosure?.at ?? outlet.at : outlet.at).clone().sub(control.at).setY(0).normalize();
        ray.origin.copy(control.at).addScaledVector(towards, out);
        ray.origin.y += 0.25;
        ray.direction.copy(control.at).sub(ray.origin).normalize();
        return editor.aim(ray, { sight: Infinity, far: 4, head: ray.origin });
    };
    let aimed = 0;
    let within = 0;
    for (const control of editor.controls.values()) {
        // (A valve's ray starts in its enclosure: standing there offers the same shower, and is left out here.)
        const found = aimFrom(control, 0.6)?.filter((candidate) => candidate.ref === control && !candidate.standing) ?? [];
        if (found.length === 1) aimed++;
        const target = pickTarget(found, Infinity);
        if (target && target.distance <= REACH[target.kind]) within++;
    }
    check("aimed at", `every tap and valve from 0.6 m in front, within its reach (tap ${REACH.tap}, shower ${REACH.shower})`, [aimed, within], [70, 70]);
    const basin = editor.controls.get("a-f131:control_basin");
    const near = aimFrom(basin, 0.6).find((candidate) => candidate.ref === basin);
    check("a tap", "vanity-small a-f131's: kind, label, under a metre along the ray", [near.kind, near.label, near.distance < 1], ["tap", "Tap", true]);
    check("past its reach", `from 3 m: no tap aimed at (reach ${REACH.tap})`, pickTarget(aimFrom(basin, 3) ?? [], Infinity), null);
    check("behind a wall", "the crosshair's sight ending at a wall 0.2 m in front of the tap: not aimed at", pickTarget(aimFrom(basin, 0.6) ?? [], 0.2), null);

    // Standing in each shower: that shower is offered, at the end of the sight, under anything else there.
    let offered = 0;
    let outside = 0;
    for (const enclosure of editor.enclosures.values()) {
        editor.place(enclosure);
        const head = enclosure.at.clone();
        head.y = enclosure.at.y - enclosure.half.y + 1.6;
        ray.origin.copy(head);
        ray.direction.set(0, 0, 1);
        const found = editor.aim(ray, { sight: 0.5, far: 4, head })?.filter((candidate) => candidate.standing) ?? [];
        if (found.length === 1 && found[0].kind === "shower" && found[0].distance === 0.5) offered++;
        const away = head.clone().add(new THREE.Vector3(enclosure.half.x + enclosure.half.z + 0.6, 0, 0).applyQuaternion(enclosure.turn));
        ray.origin.copy(away);
        // (Outside it, not another's: two walk-ins stand back to back.)
        const own = (candidate) => candidate.standing && candidate.ref.outlets.some((each) => each.enclosure === enclosure);
        if (!(editor.aim(ray, { sight: 0.5, far: 4, head: away }) ?? []).some(own)) outside++;
    }
    check("standing in a shower", "in each of the 15 enclosures that shower is offered, as far as the crosshair sees; a step outside, nothing", [offered, outside], [15, 15]);
    const enclosure = editor.enclosures.get("a-f125:steam");
    const head = enclosure.at.clone().setY(enclosure.at.y - enclosure.half.y + 1.6);
    ray.origin.copy(head);
    ray.direction.set(1, 0, 0);
    const standing = editor.aim(ray, { sight: 1.2, far: 4, head }).filter((candidate) => candidate.standing);
    check("anything else first", "in a walk-in, a door aimed at 1.2 m (where the sight ends) wins over the shower; with nothing else, the shower", [
        pickTarget([...standing, { kind: "door", id: "d", distance: 1.2 }], 1.2)?.kind,
        pickTarget(standing, 1.2)?.kind,
    ], ["door", "shower"]);

    // On and off.
    const provider = editor.provider();
    const tap = editor.controls.get("a-f001:control_sink");
    check("the provider's words", "Turn on the tap / Turn off the shower, the water icon", [
        provider.prompt({ kind: "tap", ref: tap }),
        provider.prompt({ kind: "shower", ref: { outlets: [{ on: true }] } }),
    ], [
        { label: "Turn on the tap", key: "E", touch: { label: "On", icon: "water" } },
        { label: "Turn off the shower", key: "E", touch: { label: "Off", icon: "water" } },
    ]);
    const told = [];
    editor.world.on("water", (event) => told.push(event));
    const done = provider.act({ kind: "tap", id: tap.id, ref: tap });
    const step = (water, seconds) => {
        for (let i = 0; i < Math.round(seconds * 60); i++) water.update(1 / 60);
    };
    const outlet = tap.outlets[0];
    check("turned on", "E: on, told to the world, its water on its way down (Pace: water)", [done, told.at(-1), outlet.on, editor.busy()], [{ kind: "tap", id: tap.id, state: "on" }, { id: tap.id, kind: "tap", on: true }, true, "water"]);
    step(editor, 0.15);
    const falling = outlet.head;
    step(editor, 0.4);
    check("landed", "after 0.15 s part way down; by 0.55 s in the sink, the lever open, the sink wet", [falling > 0.2 && falling < 1, outlet.head, outlet.flow, outlet.wet], [true, 1, 1, 1]);
    check("running, drawn", "its stream, droplets and ripple made and placed at its spout", [Object.keys(outlet.meshes).sort(), outlet.meshes.main.matrix.elements.slice(12, 15).map((n) => round(n, 3))], [["main", "ripple", "splash"], outlet.at.toArray().map((n) => round(n, 3))]);
    provider.act({ kind: "tap", id: tap.id, ref: tap });
    step(editor, 0.15);
    const leaving = outlet.tail;
    step(editor, 3);
    check("turned off", "its last water leaving the spout, then all of it down and the sink drained: settled, nothing moving", [leaving > 0 && leaving < 1, outlet.tail, editor.active.size, editor.busy()], [true, 1, 0, null]);

    const shower = editor.controls.get("a-f125:control_rain");
    editor.toggle(shower);
    step(editor, HEAT.up + 1);
    const walkIn = editor.enclosures.get("a-f125:steam");
    check("a hot shower", `after ${HEAT.up} s: its steam full and drawn (the nearest), the mist coming on its glass, which has a pane`, [walkIn.heat, Boolean(walkIn.steam), walkIn.mist > 0.4, walkIn.panes?.length], [1, true, true, 1]);
    const steam = walkIn.steam.material.uniforms;
    check("its steam's shape", "the enclosure's box, the water's middle inside it, the room round it at least as big, the ceiling over the top", [
        steam.uHalf.value.toArray().map((n) => round(n, 3)),
        Math.abs(steam.uSource.value.x) < steam.uHalf.value.x && Math.abs(steam.uSource.value.y) < steam.uHalf.value.z,
        steam.uRoom.value.x <= -steam.uHalf.value.x && steam.uRoom.value.y >= steam.uHalf.value.x,
        steam.uCeiling.value > steam.uHalf.value.y,
    ], [[1.09, 0.994, 0.5], true, true, true]);
    const [box, spill] = walkIn.haze;
    const body = (mesh) => [mesh.material.uniforms.uBoxMin.value, mesh.material.uniforms.uBoxMax.value].map((v) => v.toArray().map((n) => round(n, 3)));
    const room = roomAt(walkIn.at.x, walkIn.at.y - walkIn.half.y + 0.1, walkIn.at.z);
    check("its body", "drawn in two boxes: the enclosure's own, and the room's over its top — from the top to a centimetre under the ceiling, round the enclosure's plan", [
        walkIn.haze.length,
        walkIn.haze.every((mesh) => mesh.visible),
        body(box),
        body(spill)[0][1],
        round(body(spill)[1][1] + walkIn.at.y, 3),
        // (Within a centimetre of its plan where the room's wall is at the enclosure's side.)
        body(spill)[0][0] <= -1.08 && body(spill)[0][2] <= -0.49 && body(spill)[1][0] >= 1.08 && body(spill)[1][2] >= 0.49,
    ], [2, true, [[-1.09, -0.994, -0.5], [1.09, 0.994, 0.5]], 0.994, round(room.elevation + room.height - 0.01, 3), true]);
    // Every shower's room over its top in the room it stands in: corners and edges in its plan (or no wider
    // than the enclosure, where the enclosure is at the plan's edge) — never through a wall into the next room.
    let kept = 0;
    for (const each of editor.enclosures.values()) {
        editor.place(each);
        if (!each.steam) editor.makeSteam(each);
        each.shaped = null;
        editor.shapeSteam(each);
        const uniforms = each.haze[1].material.uniforms;
        // (Its edges a step in: a wall's line between two of its steps out is not looked for.)
        const [x0, y0, z0] = uniforms.uBoxMin.value.toArray().map((n, k) => (k === 1 ? n : n + 0.06));
        const [x1, , z1] = uniforms.uBoxMax.value.toArray().map((n) => n - 0.06);
        const plan = roomAt(each.at.x, each.at.y - each.half.y + 0.1, each.at.z)?.polygon;
        const spot = new THREE.Vector3();
        let ok = Boolean(plan) && round(y0, 3) === round(each.half.y * each.scale, 3);
        for (let i = 0; i <= 8; i++) {
            for (const [x, z] of [[x0 + ((x1 - x0) * i) / 8, z0], [x0 + ((x1 - x0) * i) / 8, z1], [x0, z0 + ((z1 - z0) * i) / 8], [x1, z0 + ((z1 - z0) * i) / 8]]) {
                spot.set(x, 0, z).applyMatrix4(each.frame);
                const footprint = Math.abs(x) <= each.half.x * each.scale && Math.abs(z) <= each.half.z * each.scale;
                if (!footprint && !inside(spot.x, spot.z, plan)) ok = false;
            }
        }
        if (ok) kept++;
        else if (process.env.DEBUG_SPILL) {
            const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => {
                spot.set(x, 0, z).applyMatrix4(each.frame);
                return [round(spot.x, 2), round(spot.z, 2), inside(spot.x, spot.z, plan)];
            });
            console.log(each.id, JSON.stringify(corners), JSON.stringify(plan), each.at.toArray().map((n) => round(n, 2)));
        }
    }
    check("its room's steam in its room", "for each of the 15, the box over the enclosure's top stays in the room's plan", kept, 15);
    // Seen from inside its box, outside it and from above: which faces it is drawn by, and in what order with the glass.
    const looked = (eye) => {
        editor.stepEnclosure(walkIn, 0, eye, false);
        editor.dressSteam(walkIn);
        return [box.material.side === THREE.BackSide, box.material.depthTest, box.renderOrder, spill.renderOrder, walkIn.steam.renderOrder, walkIn.outlets[0].enclosure.order.water];
    };
    check("seen from in it, beside it, above it", "in it: its far faces, over all, after the glass; beside it: its near faces, depth tested, before the glass, the room's steam first; above: after the glass, the room's steam last", [
        looked(walkIn.at.clone()),
        looked(walkIn.at.clone().add(new THREE.Vector3(0, 0.6, -2).applyQuaternion(walkIn.turn))),
        looked(walkIn.at.clone().add(new THREE.Vector3(0, 6, 0))),
    ], [
        [true, false, 4, 1, 3, 2],
        [false, true, -1, -4, -2, -3],
        [false, true, 3, 4, 2, 1],
    ]);
    editor.toggle(shower);
    step(editor, HEAT.down + MIST.down + 5);
    check("cleared", "turned off: the steam gone, the glass clear, nothing running", [walkIn.heat, walkIn.mist, editor.active.size], [0, 0, 0]);

    const outdoor = editor.controls.get("a-f176:control_rain");
    check("outdoors, cold", "the roof terrace's shower runs cold, and has no enclosure: no steam", [outdoor.kind, outdoor.outlets[0].hot, [...editor.enclosures.values()].some((e) => e.piece === "a-f176")], ["shower", false, false]);

    // Where a tap's light is looked up: out in front of it, where whoever turned it on stands.
    const sink = editor.outlets.get("a-f001:water_sink");
    editor.place(sink);
    editor.place(sink.control);
    const point = editor.lightPoint(sink, new THREE.Vector3());
    const out = point.clone().sub(sink.at).setY(0);
    const away = sink.at.clone().sub(sink.control.at).setY(0).normalize();
    check("a tap's light, in front of it", "A1's sink: half a metre out from its spout, away from the tap's body, a third of the way down its water", [round(out.length(), 3), round(out.normalize().dot(away), 3), round(sink.at.y - point.y, 4)], [0.5, 1, round(sink.fall * 0.3, 4)]);

    // The light on the water, by the kind of view — a little of its tint lost (NEUTRAL): water is not painted.
    const at = new THREE.Vector3(5.2, 1, 5.7);
    const neutral = (rgb) => {
        const grey = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        return rgb.map((c) => round(c + (grey - c) * NEUTRAL));
    };
    const colour = new THREE.Color();
    check("under the plain light", "the editor's: one light, everywhere", editor.lightAt(at, colour).toArray().map((n) => round(n)), [0.8, 0.8, 0.8]);
    const probeWorld = view.world;
    probeWorld.probes = { sample: () => Float32Array.from({ length: 18 }, (_, i) => [0.1, 0.2, 0.3][i % 3] * (i < 3 ? 3 : 0.6)), sunNow: 0 };
    probeWorld.sceneBuilder.indoorGainIn = () => 2;
    // (Six ways: the first three times the others. All round 0.1, 0.2, 0.3; the brightest way 0.3, 0.6, 0.9.)
    check("from the probes", "a baked view's: between all round and the brightest way, brought up as the room is from above (×2 here)", view.lightAt(at, colour).toArray().map((n) => round(n)), neutral([0.4, 0.8, 1.2]));
    delete probeWorld.probes;
    Object.assign(probeWorld.sceneBuilder, { baked: true, lightingInfo: {}, liveLight: false, mixDoorLight: () => ({ d1: [0.3, 0.2, 0.1] }), nearestProbedDoor: () => "d1", indoorGainIn: () => 1 });
    view.lightStale = true;
    view.lightClock = 1;
    check("fully baked", "without probes, the doors' sides not baked apart: the nearest door's, as the furniture's doors are lit, as bright as the probes' would be (×1.6)", view.lightAt(at, colour).toArray().map((n) => round(n)), neutral([0.48, 0.32, 0.16]));
    // The bake's doors' two sides apart: the room's own side of its doors, whichever door is nearest.
    const bath = roomAt(at.x, at.y, at.z).id;
    Object.assign(probeWorld.sceneBuilder, { mixDoorSides: () => ({ d1: [[0.1, 0.1, 0.1], [0.5, 0.4, 0.3]], d2: [[0.3, 0.2, 0.1], [0.9, 0.9, 0.9]] }), doorSideZones: (id) => (id === "d1" ? ["hall", bath] : [bath, "hall"]) });
    view.lightClock = 2;
    check("fully baked, by its room", "its own room's side of each of its doors, their mean (×1.6); out of doors, the open air's as a live view has it, not a door's", [
        view.lightAt(at, colour).toArray().map((n) => round(n)),
        view.lightAt(new THREE.Vector3(30, 0.5, 8), colour).toArray().map((n) => round(n)),
    ], [neutral([0.64, 0.48, 0.32]), [0, 0, 0]]);

    // From above: a floor's water, and none above it.
    probeWorld.birdView = { floorAt: (x, y) => (y >= 2.9 ? 1 : 0) };
    probeWorld.emit("bird", { active: true, level: 0 });
    const upstairs = view.outlets.get("a-f131:water_basin");
    const downstairs = view.outlets.get("a-f001:water_sink");
    view.place(upstairs);
    view.place(downstairs);
    check("from above", "the ground floor shown: its kitchen's water shows, the bathroom's upstairs does not; walking again, both", [view.usable(downstairs), view.usable(upstairs)].concat((probeWorld.emit("bird", { active: false }), [view.usable(downstairs), view.usable(upstairs)])), [true, false, true, true]);

    // The quality step: what is drawn of each.
    view.toggle(view.controls.get("a-f032:control_rain"));
    const counts = { rain: 72, splash: 10, spray: 20, steam: 8, steaming: 1, haze: 3 };
    view.quality = () => ({ water: counts });
    view.readCounts();
    step(view, HEAT.up / 2);
    const corner = view.enclosures.get("a-f032:steam");
    check("the step's counts", "drops, droplets and puffs as the step asks (Utils/device.js's water), as far as each geometry is drawn; the steam's body sampled as often", [view.geometries.rain.drawRange.count, view.geometries.spray.drawRange.count, view.geometries.steam.drawRange.count, view.counts.steaming, corner.haze.map((mesh) => mesh.material.uniforms.uSteps.value)], [72 * 6, 20 * 6, 8 * 6, 1, [3, 3]]);
    view.quality = () => ({ water: { ...COUNTS, rain: 999 } });
    view.readCounts();
    check("more than it was made for", "a step asking for more drops than the geometry holds: made again, as large, given to the shower's rain", [view.geometries.rain.userData.count, view.outlets.get("a-f032:water_rain").meshes.main.geometry === view.geometries.rain], [999, true]);

    // Steam's turns (the step's `steaming`): the nearest hot showers in sight, not the nearest of all — one a few metres
    // behind the eye takes none from one in front of it. Two of a floor's, 7–20 m apart; the eye between them, nearer
    // the one it turns its back on.
    {
        const hot = [...view.enclosures.values()].filter((enclosure) => enclosure.control && enclosure.outlets.some((outlet) => outlet.hot));
        for (const enclosure of hot) view.place(enclosure);
        let pair = null;
        for (const a of hot) for (const b of hot) if (!pair && a !== b && Math.abs(a.at.y - b.at.y) < 0.5 && a.at.distanceTo(b.at) > 7 && a.at.distanceTo(b.at) < 20) pair = [a, b];
        const [behind, ahead] = pair;
        for (const enclosure of pair) if (!view.isOn(enclosure.control)) view.toggle(enclosure.control);
        view.counts.steaming = 1;
        const eye = new THREE.PerspectiveCamera(60, 1.5, 0.05, 200);
        eye.position.copy(behind.at).addScaledVector(ahead.at.clone().sub(behind.at).normalize(), 3.4);
        eye.lookAt(ahead.at);
        view.experience.camera = { activeCamera: eye };
        step(view, HEAT.up);
        const steamed = (enclosure) => Boolean(enclosure.steam?.visible && enclosure.haze?.[0]?.visible);
        const turned = [steamed(behind), steamed(ahead)];
        eye.lookAt(behind.at);
        step(view, 0.1);
        turned.push(steamed(behind), steamed(ahead));
        check("steam's turn", "one shower's steam (steaming 1): the one in sight, though the other is nearer behind the eye; turned round, the other", turned, [false, true, true, false]);
        delete view.experience.camera;
    }

    editor.dispose();
    view.dispose();
    check("let go of", "disposed: nothing left running or drawn", [editor.active.size, view.group.parent, view.geometries], [0, null, null]);
}

// ---- the report -------------------------------------------------------------

for (const { name, what, got, want, ok } of results) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    console.log(`       ${what}`);
    if (!ok) console.log(`       NOT EXPECTED: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}
console.log(`\n${results.length - failed} of ${results.length} as expected.`);
process.exit(failed ? 1 : 0);

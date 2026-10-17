// act.js: the walkthrough's interactions driven headlessly, as walk.js drives its walking (app-notes.md, In-page
// audits; What the visitor acts on). Load it through the sink, once the visitor is in (the name prompt passed,
// body.walkthrough-active) — in an editor tab (/?scene=<id>) after harness.js, which stubs every save, or in a public
// view (/view/<id>):
//   await eval(await (await fetch("http://127.0.0.1:3199/act.js")).text())
// then window.__act:
//   doors({ room })              the doors, each with the rooms either side of it (a room id or name matches)
//   drawers({ catalog })         the furniture's doors and drawers, of pieces of a catalogue id
//   switches({ room, part })     the light targets (a light's box, or its switch's: part "switch")
//   stand([x, y, z])             the capsule stood there (feet), settled 20 frames: where it came to rest. It first gets
//                                the visitor up off any seat (Player.stand({ now: true })) and out of any pool at once
//                                (Swim.reset), as Player.placeAt does: a capsule put
//                                out of the water by hand otherwise keeps the float's lay-back on the figure (Swim.pose
//                                eases it off only over world frames), and a seat sat on next is sat laid back
//   aim([x, y, z])               the camera turned to look from the head at that point; the look and prompt told
//   look()                       the look ray and the prompt run once, every emit kept: { look, prompt, target }
//   press(key, frames)           E (player.interact()), F (in or out, as the key does) or Q (the room's lights), then
//                                `frames` frames stepped: what was told meanwhile
//   spot(name, plan)             stand, aim, look, press, look, press again (to put it back), look. `plan`: { feet,
//                                aimAt, key, frames } and what it is about — door (an id), part (an openable part, as
//                                drawers() lists it), light (a switch id), car (an id) — or, for a kind added later, a
//                                `state()` of its own that says how the thing stands
//   run({ scope, bedroom, lit })  Ladonia's spots (a bedroom door in villa A, a vanity-small's drawer, two ceiling
//                                lights' switches — each from where the crosshair is on it — the BMW 'car' at
//                                [23.5, 12.4]) and the timings of the look ray
//   timeLook()                   ms a call of the look ray and the prompt at the pose as it is (median of 5 × 100)
// Works on the build before the interaction groundwork of 2026-10-16 (updateDoorPrompt, lookedAt*) and after
// (updatePrompt, target), so the same spots can be compared: JSON.stringify(__act.run()) on each, side by side. Ids that
// differ from page to page (an openable part's uuid) are given as "<piece>/<node name>". Nothing is saved, and a spot
// presses twice to put back what it changed — but the second press acts on whatever is offered by then: a door's leaf
// swings out of the crosshair, and E then opens the nearest door on the visitor's floor instead. (Before 2026-10-16
// SceneBuilder.nearestDoor ignored height, and run()'s A2 bedroom door opened a-f-beds-s-o0 upstairs; it now keeps to
// the floor — shared/interact.js's doorOnFloor — and the second press shuts the door.) Read `second.told` before
// trusting `last`.
(() => {
    if (window.__act) return "already";
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const pl = P.player;
    const sb = w.sceneBuilder;
    const V = e.camera.perspectiveCamera.position.constructor;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const canon = (o) =>
        Array.isArray(o) ? o.map(canon) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, canon(o[k])])) : typeof o === "number" ? r3(o) : o;

    /** A stable name for an openable part: its piece and its node. */
    const partName = (part) => `${part.piece}/${part.node.name || "?"}`;
    const byUuid = () => new Map(sb.openables.parts.map((part) => [part.node.uuid, partName(part)]));
    /** Uuids made stable in anything told. */
    const stable = (o) => {
        const names = byUuid();
        return JSON.parse(JSON.stringify(o ?? null), (k, v) => (typeof v === "string" && names.has(v) ? names.get(v) : v));
    };

    /** The middle of what is drawn under a node, in the world: its meshes' bounding spheres' centres, averaged. */
    function middle(node) {
        const sum = new V();
        let n = 0;
        node.updateMatrixWorld(true);
        node.traverse((mesh) => {
            if (!mesh.isMesh || !mesh.geometry) return;
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            sum.add(mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld));
            n++;
        });
        return n ? sum.divideScalar(n) : node.getWorldPosition(new V());
    }

    const roomAt = (x, y, z) => sb.roomAt(x, y, z);

    function doors({ room = null } = {}) {
        const list = [];
        for (const door of sb.doors) {
            const c = door.group.getWorldPosition(new V());
            const n = new V(0, 0, 1).applyQuaternion(door.group.getWorldQuaternion(e.camera.perspectiveCamera.quaternion.clone()));
            n.y = 0;
            n.normalize();
            const sides = [1, -1].map((s) => roomAt(c.x + n.x * s * 0.9, c.y + 0.1, c.z + n.z * s * 0.9));
            const entry = { id: door.spec.id, at: [r3(c.x), r3(c.y), r3(c.z)], normal: [r3(n.x), 0, r3(n.z)], rooms: sides.map((r) => r?.id ?? null), names: sides.map((r) => r?.name ?? null) };
            if (room && !sides.some((r) => r && (r.id === room || r.name === room))) continue;
            list.push(entry);
        }
        return list;
    }

    function drawers({ catalog = null } = {}) {
        const placements = new Map((sb.spec.furniture || []).map((f) => [f.id, f]));
        return sb.openables.parts
            .filter((part) => !catalog || placements.get(part.piece)?.catalog_id === catalog)
            .map((part) => {
                const m = middle(part.node);
                // Out of the piece's front: from its placement's middle to the part's, across the floor. (Not the part's
                // own slide: a hinged door has none, and before 2026-10-16 a public view had it in the piece's frame
                // though the part is in the world's — app-notes.md, Doors.)
                const at = placements.get(part.piece)?.position;
                const out = at ? new V(m.x - at[0], 0, m.z - at[2]).normalize() : part.direction.clone();
                const entry = { name: partName(part), kind: part.kind, at: [r3(m.x), r3(m.y), r3(m.z)], out: [r3(out.x), r3(out.y), r3(out.z)] };
                // (The part itself, for a spot's plan; not to be listed.)
                Object.defineProperty(entry, "part", { value: part, enumerable: false });
                return entry;
            });
    }

    function switches({ room = null, part = null } = {}) {
        if (!sb.lightTargets) return [];
        return sb.lightTargets.children
            .filter((mesh) => (!room || mesh.userData.room === room) && (!part || (part === "switch") === / switch$/.test(mesh.userData.label)))
            .map((mesh) => {
                const p = mesh.geometry.parameters;
                return { id: mesh.userData.lightSwitch, label: mesh.userData.label, room: mesh.userData.room, at: [r3(mesh.position.x), r3(mesh.position.y), r3(mesh.position.z)], size: [r3(p.width), r3(p.height), r3(p.depth)] };
            });
    }

    function stand([x, y, z]) {
        // (Up off any seat at once, as Player.placeAt does: moved by hand, a seated visitor stays seated, and E then acts
        // on what is offered from the seat — a TV in front of it — not on what is aimed at.)
        if (P.seated) P.stand?.({ now: true });
        P.rising = null;
        P.swimmer?.reset();
        sb.settleCollision?.();
        pl.collider.start.set(x, y + 0.36, z);
        pl.collider.end.copy(pl.collider.start);
        pl.collider.end.y += pl.height;
        pl.velocity.set(0, 0, 0);
        P.actions = {};
        const remote = P.remote;
        P.remote = () => 0;
        e.time.delta = 1 / 60;
        for (let i = 0; i < 20; i++) P.updateColliderMovement();
        P.remote = remote;
        const c = pl.collider.start;
        return { feet: [r3(c.x), r3(c.y - 0.35), r3(c.z)], moved: r3(Math.hypot(c.x - x, c.z - z)) };
    }

    function aim(point) {
        const head = pl.collider.end;
        const d = new V(point[0] - head.x, point[1] - head.y, point[2] - head.z).normalize();
        const cam = e.camera;
        if (cam.scheme === "pointerLock") {
            cam.angles.horizontal = Math.atan2(-d.x, -d.z);
            cam.angles.vertical = Math.asin(-d.y);
            cam.target.copy(head);
            cam.update();
        } else {
            cam.controls.target.copy(head);
            cam.perspectiveCamera.position.copy(head).addScaledVector(d, -2);
            cam.perspectiveCamera.lookAt(point[0], point[1], point[2]);
        }
        cam.perspectiveCamera.updateMatrixWorld();
        const along = P.getLookDirection().dot(d);
        return { along: r3(along), ...look() };
    }

    /** What the base build or this one holds as aimed at. */
    function targetOf() {
        if (typeof P.updatePrompt === "function") {
            const t = P.target;
            return t ? { kind: t.kind, id: t.kind === "openable" ? partName(t.ref) : t.id, distance: r3(t.distance) } : null;
        }
        if (P.lookedAtLight) return { kind: "light", id: P.lookedAtLight.id, distance: r3(P.lookedAtLight.distance) };
        if (P.lookedAtOpenable) return { kind: "openable", id: partName(P.lookedAtOpenable) };
        if (P.lookedAtDoor) return { kind: "door", id: P.lookedAtDoor.spec.id };
        return null;
    }

    const prompting = () => (typeof P.updatePrompt === "function" ? P.updatePrompt() : P.updateDoorPrompt());

    function look() {
        const told = { look: [], prompt: [] };
        const onLook = (t) => told.look.push(stable(t));
        const onPrompt = (p) => told.prompt.push(stable(p));
        w.on("look", onLook);
        w.on("prompt", onPrompt);
        P.lookSignature = undefined;
        P.promptedDoorId = undefined;
        P.promptSignature = undefined;
        try {
            P.updateLookTarget();
            prompting();
        } finally {
            w.off("look", onLook);
            w.off("prompt", onPrompt);
        }
        return { look: told.look.at(-1) ?? null, prompt: told.prompt.at(-1) ?? null, target: targetOf() };
    }

    function press(key = "E", frames = 90) {
        const told = [];
        const keep = (name, map) => {
            const fn = (x) => told.push([name, stable(map(x))]);
            w.on(name, fn);
            return () => w.off(name, fn);
        };
        const off = [
            keep("prompt", (p) => p),
            keep("door", ({ door, opened }) => ({ door: door.spec.id, opened })),
            keep("openable", ({ part, opened }) => ({ part: partName(part), opened })),
            keep("interact", (x) => x),
            keep("vehicle", ({ driving, car }) => ({ driving, car: car?.spec?.id })),
            keep("room-lights", ({ room, on, count }) => ({ room: room?.id ?? null, on, count })),
        ];
        const before = targetOf();
        try {
            if (key === "E") P.interact();
            // (F at the wheel as the key does it: leaveVehicle where there is one, which tells "interact" too.)
            else if (key === "F") (P.inVehicle ? (P.leaveVehicle ?? P.exitVehicle).call(P) : P.enterNearestVehicle());
            else if (key === "Q") P.toggleRoomLights?.();
            e.time.delta = 1 / 60;
            for (let i = 0; i < frames; i++) {
                w.update();
                e.camera.update();
                // (What is drawn for where the eye now is: the water — World.afterCamera, 2026-10-16.)
                w.afterCamera?.();
            }
        } finally {
            off.forEach((f) => f());
        }
        return { pressed: key, on: before, told, inVehicle: P.inVehicle };
    }

    /** The state of what a spot is about. */
    function state(plan) {
        if (typeof plan.state === "function") return plan.state();
        if (plan.door) {
            const door = sb.doors.find((d) => d.spec.id === plan.door);
            return { open: r3(door.open), target: door.target };
        }
        if (plan.part) return { open: r3(plan.part.open), target: plan.part.target };
        if (plan.light) return { on: Boolean(w.switches?.isOn(plan.light)) };
        if (plan.car) return { driving: P.inVehicle };
        return null;
    }

    function spot(name, plan) {
        const stood = stand(plan.feet);
        const aimed = aim(plan.aimAt);
        const was = state(plan);
        const first = press(plan.key ?? "E", plan.frames ?? 90);
        const then = { ...look(), state: state(plan) };
        const second = press(plan.key ?? "E", plan.frames ?? 90);
        const last = { ...look(), state: state(plan) };
        return canon({ name, stood, aimed, was, first, then, second, last });
    }

    /** ms a call of the look ray and the prompt, at the pose as it is (median of 5 rounds of 100). */
    function timeLook() {
        const rounds = [];
        for (let r = 0; r < 5; r++) {
            const t0 = performance.now();
            for (let i = 0; i < 100; i++) {
                P.updateLookTarget();
                prompting();
            }
            rounds.push((performance.now() - t0) / 100);
        }
        rounds.sort((a, b) => a - b);
        return r3(rounds[2]);
    }

    function run({ scope = null, bedroom = "a-g-a2-bed", lit = ["a-g-a2-twin", "a-g-a1-bed"] } = {}) {
        if (scope && w.scope) w.scope.set(scope, { remember: false });
        const out = { url: location.pathname + location.search, build: typeof P.updatePrompt === "function" ? "groundwork" : "base", scheme: e.camera.scheme, mode: e.camera.mode, scope: w.scope?.current ?? null, spots: [], timings: {} };

        // A bedroom door of villa A (A2's bedroom's: A1's opens off the hall's corner), stood 1.2 m off on the bedroom's
        // side, aimed 1 m up the leaf.
        const door = doors({ room: bedroom })[0];
        if (door) {
            const s = door.rooms[0] === bedroom ? 1 : -1;
            const feet = [door.at[0] + door.normal[0] * s * 1.2, door.at[1], door.at[2] + door.normal[2] * s * 1.2];
            out.spots.push(spot(`door ${door.id} (${door.names.join(" | ")})`, { feet, aimAt: [door.at[0], door.at[1] + 1.0, door.at[2]], door: door.id }));
            out.timings.door = timeLook();
        }

        // A vanity-small's drawer, the first of villa A's: stood 1 m out in front of it, aimed at its middle.
        const drawer = drawers({ catalog: "vanity-small" }).find((d) => d.name.startsWith("a-")) ?? drawers({ catalog: "vanity-small" })[0];
        if (drawer) {
            const out2 = new V(drawer.out[0], 0, drawer.out[2]).normalize();
            const x = drawer.at[0] + out2.x * 1.0;
            const z = drawer.at[2] + out2.z * 1.0;
            const room = roomAt(x, drawer.at[1], z) ?? roomAt(x, drawer.at[1] - 0.6, z);
            out.spots.push(spot(`drawer ${drawer.name} (${room?.id ?? "?"})`, { feet: [x, room?.elevation ?? 0, z], aimAt: drawer.at, part: drawer.part }));
            out.timings.drawer = timeLook();
        }

        // A ceiling light's switch, stood 0.9 m off the wall on the room's side, square to it: A2's twin bedroom's; and
        // A1's bedroom's. Where something else is aimed at first from there, the pose is turned off the square, 10° at a
        // time either way up to 70°, to the first from which the crosshair is on a light's switch: A1's bedroom's linen
        // wardrobe (a-f025) stands in front of its switch, and from square on the wardrobe's door was 0.42 m nearer
        // along the ray — E opened it (since its doors open, wave A of 2026-10-16) — but from 50° along the wall, by
        // the wardrobe's side, the switch is aimed at.
        for (const room of lit) {
        const plate = switches({ room, part: "switch" })[0];
        if (plate) {
            const thin = plate.size[0] < plate.size[2] ? [1, 0, 0] : [0, 0, 1];
            const sides = [1, -1].map((s) => [plate.at[0] + thin[0] * s * 0.9, plate.at[1], plate.at[2] + thin[2] * s * 0.9]);
            const side = sides.find((p) => roomAt(p[0], p[1] - 1, p[2])?.id === plate.room) ?? sides[0];
            const out1 = [(side[0] - plate.at[0]) / 0.9, (side[2] - plate.at[2]) / 0.9];
            let feet = null;
            for (const degrees of [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60, 70, -70]) {
                const a = (degrees * Math.PI) / 180;
                // (Turned about the plate in plan: out from the wall, and along it.)
                const x = plate.at[0] + (out1[0] * Math.cos(a) - out1[1] * Math.sin(a)) * 0.9;
                const z = plate.at[2] + (out1[1] * Math.cos(a) + out1[0] * Math.sin(a)) * 0.9;
                const room = roomAt(x, plate.at[1] - 1, z);
                if (room?.id !== plate.room) continue;
                stand([x, room.elevation, z]);
                if (aim(plate.at).target?.kind === "light") {
                    feet = [x, room.elevation, z];
                    break;
                }
            }
            if (!feet) feet = [side[0], roomAt(side[0], side[1] - 1, side[2])?.elevation ?? 0, side[2]];
            out.spots.push(spot(`switch ${plate.id} (${plate.label})`, { feet, aimAt: plate.at, light: plate.id }));
            out.timings[`switch ${plate.id}`] = timeLook();
        }
        }

        // The BMW: stood where its driver gets out, F twice. (The editor's view leaves the cars out until all of the site
        // is shown, World/Scope.js: shown for it, and put back.)
        const car = (sb.cars || []).find((c) => c.spec.id === "car");
        const scoped = w.scope?.current;
        if (car && scoped && scoped !== "all") w.scope.set("all", { remember: false });
        if (car) {
            const spotAt = car.exitPoint();
            const c = car.group.position;
            out.spots.push(spot(`car ${car.spec.id} at [${r3(c.x)}, ${r3(c.z)}], ${r3(Math.hypot(spotAt.x - c.x, spotAt.z - c.z))} m off`, { feet: [spotAt.x, spotAt.y, spotAt.z], aimAt: [c.x, c.y + 0.8, c.z], car: car.spec.id, key: "F", frames: 30 }));
            out.timings.car = timeLook();
        }
        if (car && scoped && scoped !== "all") w.scope.set(scoped, { remember: false });
        return out;
    }

    window.__act = { doors, drawers, switches, stand, aim, look, press, spot, run, timeLook, canon };
    return "act ready";
})();

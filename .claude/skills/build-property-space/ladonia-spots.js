// ladonia-spots.js: Ladonia's public-view timing spots, the same in every tab (an old version, a new one, a base build),
// for pair-time.js's run() (app-notes.md, Measuring; the wave B and C tables were taken at these). Make one per
// project: copy it to this folder as <project>-spots.js and change the poses. Load after boot.js, pair-time.js and
// the tools the spots drive — act.js, sit.js, water.js, tv.js and birdcar.js — in a public view (/view/<id>):
//   await eval(await (await fetch("http://127.0.0.1:3199/ladonia-spots.js?" + Date.now())).text())
// window.__spots — [{ name, setup(), after() }]:
//   living        A1's living room, looking at the TV wall (the set a-f002#0's middle). Its feet [7.6, 0, 7.3] are on
//                 the sofa a-f003's chaise in every version (the capsule settles on it, feet 0.445 m up): kept so, as
//                 the tables were taken there
//   pool          the pool deck, looking down the pool to its steps
//   bath-dry      A1's bathroom with every tap off and the steam settled
//   bath-shower   the same, first person, with the corner shower a-f032 running hot (18 s of heat), off again after
//                 (dry where the version has no water)
//   seated-tv     seated on A1's sofa a-f003#2 with the TV on (sat down by E; stood up again after)
//   bird-ground   the bird's-eye view, ground floor shown
//   drive-above   driving the BMW `car` from above along the street, W held
// window.__spot(names)   those spots, in that order (e.g. __pair.run({ me, next, spots: __spot(["living", "pool"]) }))
// window.__settleWater() every tap and shower off and the steam put out (steam.js's reset): how many are still active.
// window.__editorSpots   in an EDITOR tab (/?scene=kosinozici-villas, pace "always", 2560 × 1600 by __pair.dpr2 on a
//                        1280 × 800 window, third person, the plain light): walking in A1's kitchen, A1's living room
//                        and the upper U kitchen, and in edit mode the overview and the roof terrace (nothing
//                        selected). Their setups return { update: false }: the editor's frame is timed as it draws.
//                        The wave C editor tables were taken at these.
(() => {
    const e = window.experience;
    const w = e.world;
    const P = w.player;
    const sb = w.sceneBuilder;
    const step = (n) => window.__pair.step(n);
    const bird = () => w.birdView;
    const W = () => w.water;
    const hasWater = () => Boolean(W()?.controls?.size);
    const birdOff = () => {
        if (bird()?.active) window.__bc.tap("KeyB", 20);
    };
    const standUp = () => {
        if (!P.seated) return;
        window.__bc.key("Space", true);
        step(1);
        window.__bc.key("Space", false);
        step(40);
    };
    function settle() {
        const water = W();
        if (!water?.controls) return 0;
        for (const c of water.controls.values()) if (water.isOn(c)) water.toggle(c, false);
        for (let i = 0; i < 40 && water.active?.size; i++) {
            for (const en of water.enclosures?.values?.() ?? []) {
                en.heat = 0;
                en.mist = 0;
                en.running = 0;
            }
            step(30);
        }
        return water.active?.size ?? 0;
    }
    const bathPose = () => {
        birdOff();
        window.__act.stand([3.7, 0, 5.75]);
        e.camera.setFirstPerson?.();
        window.__act.aim([5.2, 1.1, 5.7]);
    };
    const bathAfter = async () => {
        e.camera.setThirdPerson?.();
        step(2);
    };
    let videoReady = false;
    const SHOWER = "a-f032:control_rain";
    const SOFA = "a-f003#2";
    const list = [
        {
            name: "living",
            setup: async () => {
                birdOff();
                window.__act.stand([7.6, 0, 7.3]);
                window.__act.aim([7.06, 1.3, 9.697]);
                return { update: true };
            },
        },
        {
            name: "pool",
            setup: async () => {
                birdOff();
                window.__act.stand([18.3, 0.07, 37]);
                window.__act.aim([15.6, -0.3, 40.5]);
                return { update: true };
            },
        },
        {
            name: "bath-dry",
            setup: async () => {
                settle();
                bathPose();
                return { update: true };
            },
            after: bathAfter,
        },
        {
            name: "bath-shower",
            setup: async () => {
                if (hasWater()) {
                    settle();
                    if (!W().isOn(W().controls.get(SHOWER))) window.__water.on([SHOWER]);
                    step(18 * 60);
                }
                bathPose();
                return { update: true };
            },
            after: async () => {
                settle();
                await bathAfter();
            },
        },
        {
            name: "seated-tv",
            setup: async () => {
                birdOff();
                if (!P.seated) {
                    // (The first E may only queue the sit behind the avatar's clips and the seats' catalogue: sit.js.)
                    for (let i = 0; i < 2 && !P.seated; i++) {
                        window.__sit.before(SOFA);
                        window.__sit.aim(SOFA);
                        window.__sit.press(40);
                        if (!P.seated) await window.__drive(1200);
                    }
                    if (!w.screens?.list.some((s) => s.on)) window.__sit.press(60);
                }
                if (!videoReady) {
                    await window.__drive(2000);
                    videoReady = true;
                }
                step(40);
                return { update: true };
            },
            after: async () => {
                standUp();
                window.__tv?.off?.();
                step(2);
            },
        },
        {
            name: "bird-ground",
            setup: async () => {
                window.__act.stand([6.0, 0, 8.0]);
                if (!bird().active) window.__bc.tap("KeyB", 30);
                while (bird().level > 0) window.__bc.tap("PageDown", 10);
                step(60);
                return { update: true };
            },
        },
        {
            name: "drive-above",
            setup: async () => {
                const car = sb.cars.find((c) => c.spec.id === "car");
                if (!P.inVehicle) {
                    const ex = car.exitPoint();
                    window.__act.stand([ex.x, ex.y, ex.z]);
                    if (!bird().active) window.__bc.tap("KeyB", 30);
                    window.__bc.tap("KeyF", 30);
                }
                car.group.position.set(29.2, -0.65, -25);
                car.heading = 0;
                car.speed = 9;
                window.__bc.key("KeyW", true);
                step(30);
                return { update: true };
            },
            after: async () => {
                window.__bc.key("KeyW", false);
                const car = sb.cars.find((c) => c.spec.id === "car");
                car.speed = 0;
                step(5);
                if (P.inVehicle) window.__bc.tap("KeyF", 20);
                birdOff();
            },
        },
    ];
    const V = e.camera.perspectiveCamera.position.constructor;
    const R = e.renderer;
    const ed = w.editor;
    const walkAt = (at, look) => async () => {
        if (ed?.active) ed.leave();
        ed?.select?.(null);
        e.camera.setThirdPerson?.();
        window.__act.stand(at);
        window.__act.aim(look);
        for (let i = 0; i < 12; i++) R.render();
        return { update: false };
    };
    const editFrom = (from, target) => async () => {
        if (!ed) return { update: false };
        if (!ed.active) ed.enter();
        ed.select(null);
        ed.view.lookFrom(new V(...from), new V(...target));
        ed.view.update();
        for (let i = 0; i < 12; i++) R.render();
        return { update: false };
    };
    window.__editorSpots = [
        { name: "kitchen", setup: walkAt([4.9, 0, 6.85], [4.1, 1, 9]) },
        { name: "living", setup: walkAt([8.6, 0, 9.1], [7.2, 0.7, 6.6]) },
        { name: "upperU", setup: walkAt([7.3, 3, 11.5], [9.6, 3.7, 11.45]) },
        { name: "overview", setup: editFrom([10, 32, 34], [8, 0, 12]) },
        { name: "terrace", setup: editFrom([6, 9, 13], [6, 0, 7]), after: async () => ed?.active && ed.leave() },
    ];
    const by = Object.fromEntries(list.map((s) => [s.name, s]));
    window.__spots = list;
    window.__spot = (names) => names.map((n) => by[n]).filter(Boolean);
    window.__settleWater = settle;
    return "ladonia spots ready: " + list.map((s) => s.name).join(", ");
})();

import * as THREE from "three";

import Experience from "../../Experience.js";

/**
 * A car's lights, as it is driven: its daytime running lamps and its tail
 * lamps while it is, its headlamps, its brake lamps — the tail lamps
 * brighter — when it brakes and its reversing lamps when it backs — and its
 * headlamps' beam on the road ahead.
 *
 * Each lamp is the model's own: the glass, light guides and reflectors it
 * was made with, lit in their own shapes. Which of a model's parts are
 * which lamp is listed for each model (LAMPS) — a material, at the nose or
 * the tail, at a height — and lit by its colour: a tail lamp's red, a
 * reversing lamp's clear glass. A lit part is a copy of the part's
 * triangles drawn over it, its light added to what is there; at night
 * each lamp has a glow round it as well, as a camera sees a lamp in the
 * dark. A model not listed lights its lamp materials at its nose white and
 * the red ones at its tail.
 *
 * The beam: where the view is lit live (the editor, a public view lit
 * live), a spotlight between the headlamps, which lights the road, the
 * garage door, the house; drawn from the bake, where nothing takes live
 * light, a pool of light on the road ahead, laid with the car (setMode).
 * The spotlight is in the scene's light only while the headlamps are on
 * (showBeam): a parked car's, at nothing, cost every lit pixel as much as
 * one that shone.
 *
 * Driven, the running lamps and tail lamps are on; the headlamps come on
 * by themselves at night and go off by day, and `H` turns them on or off
 * for the drive.
 * Parked, everything is off.
 */

/** Within this far of the nose and of the tail, a part is that end's. */
const REACH = 0.6;

/**
 * Each model's lamps (public/models/cars/<id>), by its parts: the
 * triangles of a material (its name, a pattern) at the `end` of the car
 * they light at — within `y`, its height above the model's origin (ride
 * height), and `x`, how far out from its middle, if given, which also cut
 * it, straight — and how they light (`look`):
 *
 *   "flat"    evenly, all of it: a lamp's glass;
 *   "detail"  as light or dark as its texture: a lamp's light guides and
 *             reflectors behind the glass;
 *   "red"     only where it is red, in its colour or its texture's;
 *   "white"   only where it is white or clear.
 *
 * `from: "emissive"`: by the model's own lit-lamp texture and colour, not
 * its colour's. `level`: against the lamp's other parts, 1.
 *
 * Lamps: "head" the headlamps; "drl" the running lamps — where a model
 * has none apart, its headlamps, dimmed, by day; "tail"; "brake", which
 * light only when it brakes (its tail lamps brighten as well); "reverse".
 */
const LAMPS = {
    "bmw-x6-m": [
        { lamp: "head", material: /^BM_Light_Max1$/, end: "front", y: [0.33, 1], look: "detail" },
        { lamp: "head", material: /LightGlass_Clear/, end: "front", y: [0.33, 1], look: "flat", level: 0.15 },
        { lamp: "tail", material: /LightGlass_Red/, end: "rear", y: [0.45, 1] },
        // A bar of the lens, low in the tail lamps' inner halves, on the tailgate.
        { lamp: "reverse", material: /LightGlass_Red/, end: "rear", x: [0.34, 0.49], y: [0.575, 0.625], look: "flat" },
    ],
    "bmw-m4-widebody": [
        { lamp: "head", material: /LightA_Material/, end: "front", look: "detail" },
        { lamp: "head", material: /glasswindshiled/, end: "front", look: "flat", level: 0.15 },
        { lamp: "tail", material: /^red_glass$/, end: "rear" },
        // The clear strip along the top of the tail lamps' inner halves, on the boot lid.
        { lamp: "reverse", material: /glasswindshiled/, end: "rear", x: [0.26, 0.47], y: [0.29, 0.45], look: "flat" },
        { lamp: "brake", material: /^wmit_red$/, end: "rear", from: "emissive" },
    ],
    "chery-jaecoo-j7": [
        { lamp: "drl", material: /Light_glass/, end: "front", y: [0.33, 1], look: "flat" },
        { lamp: "drl", material: /^OUT_color1$/, end: "front", y: [0.33, 1], from: "emissive", look: "white" },
        { lamp: "head", material: /Light_glass/, end: "front", y: [0.02, 0.33], look: "flat" },
        { lamp: "tail", material: /^OUT_color1$/, end: "rear", y: [-1, 1], from: "emissive" },
        { lamp: "brake", material: /^OUT_color1$/, end: "rear", y: [1, 2] },
        // The clear blocks among the red at the ends of the bar.
        { lamp: "reverse", material: /^OUT_color1$/, end: "rear", x: [0.62, 1], y: [0.3, 1], look: "white" },
    ],
    "ford-f150-raptor": [
        { lamp: "drl", material: /^vehiclelights\.010$/, end: "front", look: "detail" },
        { lamp: "head", material: /^glass\.006$/, end: "front", look: "flat", level: 0.25 },
        { lamp: "tail", material: /lasluces|vehiclelights|deng/, end: "rear" },
        { lamp: "reverse", material: /lasluces|vehiclelights|smallspecmap$/, end: "rear", y: [0.4, 1], look: "white" },
    ],
};

/** A model not in LAMPS: its lamp materials, by name, white at the nose and red at the tail. */
const LAMP = /light|lamp|luce|emit|emis|wmit|red_glass|^red/i;
const GENERIC = [
    { lamp: "head", material: LAMP, end: "front", look: "detail" },
    { lamp: "tail", material: LAMP, end: "rear" },
];

const LOOKS = { flat: 0, detail: 1, red: 2, white: 3 };
const DEFAULT_LOOK = { head: "detail", drl: "detail", tail: "red", brake: "red", reverse: "white" };

const COLOR = {
    head: new THREE.Color("#eef2ff"),
    drl: new THREE.Color("#eef2ff"),
    tail: new THREE.Color("#ff1206"),
    brake: new THREE.Color("#ff1206"),
    reverse: new THREE.Color("#f4f6ff"),
};
/** How bright each lamp's parts are lit, full on, at night and by day. */
const GAIN = {
    head: { night: 1.0, day: 1.2 },
    drl: { night: 1.0, day: 1.5 },
    tail: { night: 1.6, day: 1.8 },
    brake: { night: 1.6, day: 1.8 },
    reverse: { night: 2.0, day: 2.0 },
};
/**
 * How much of what is under a lit part it covers, against adding its light
 * to it: a lit tail lamp is red all through, where a pale lens with red
 * light added would be pink.
 */
const COVER = { head: 0, drl: 0, tail: 0.75, brake: 0.75, reverse: 0.6 };
/** Each lamp's glow at night. */
const HALO = { head: 0.55, drl: 0.3, tail: 0.32, brake: 0.32, reverse: 0.4 };
/** The tail lamps while the car runs, against braking (1). */
const TAIL = 0.25;
/** A model's headlamps by day, standing in for running lamps it has none of. */
const DRL_STANDIN = 0.35;

/** The beam's spotlight, in candela, and how far it carries. */
const BEAM = { intensity: 40, distance: 60, angle: 0.62, penumbra: 0.95, decay: 1.5, reach: 12 };

const layouts = new WeakMap();
const _toCamera = new THREE.Vector3();
const _lamp = new THREE.Vector3();
const _facing = new THREE.Vector3();
let glowTexture = null;
let poolTexture = null;

export default class CarLights {
    /** @param {Car} car */
    constructor(car) {
        this.car = car;
        this.experience = new Experience();
        this.group = new THREE.Group();
        this.group.name = "car-lights";
        car.group.add(this.group);
        /** null: on by night, off by day; or as `H` last set it. */
        this.manual = null;
        this.state = { drive: 0, head: 0, brake: 0, reverse: 0 };
        // In the editor the view is lit live; a public view says which
        // once it is drawn (SceneBuilder.usePublishedView, setMode).
        this.mode = this.experience.publicView ? null : "lit";
    }

    /**
     * How the beam is drawn: "lit", a spotlight — the view's surfaces take
     * live light — or "baked", a pool of light on the road, for a view
     * drawn from the bake, whose surfaces take none.
     */
    setMode(mode) {
        if (this.mode === mode && this.beam) return;
        this.mode = mode;
        this.buildBeam();
        this.apply();
    }

    /** Lamps for the model the car now wears (Car.setModel). */
    attach(model) {
        this.group.traverse((node) => node.material?.dispose());
        this.group.clear();
        this.parts = [];
        this.halos = [];
        this.beam = null;
        if (!model) return;
        this.layout = lampLayout(model);
        for (const part of this.layout.parts) this.parts.push({ ...part, mesh: this.lens(part) });
        for (const halo of this.layout.halos) this.halos.push({ ...halo, sprite: this.glow(halo) });
        this.buildBeam();
        this.apply();
    }

    /** `H`, driving: the headlamps on if they were off, off if on — for the rest of the drive. */
    toggle() {
        this.manual = !this.headlampsOn();
        return this.manual;
    }

    headlampsOn() {
        return this.manual ?? this.experience.world?.lighting === "night";
    }

    /**
     * As the car is driven this frame: braking when it is slowing against
     * the way it is going, reversing when it backs.
     */
    update(controls, speed) {
        if (!this.mode) this.setMode("lit");
        // Day or night changed under it: the lamps follow.
        const night = this.experience.world?.lighting === "night";
        if (night !== this.night) {
            this.night = night;
            this.apply();
        }
        const braking = controls.brake || (controls.backward && speed > 0.5) || (controls.forward && speed < -0.5);
        const reversing = speed < -0.3 || (controls.backward && speed <= 0.5);
        const head = this.headlampsOn() ? 1 : 0;
        this.set({ drive: 1, head, brake: braking ? 1 : 0, reverse: reversing && !braking ? 1 : 0 });
    }

    /** Parked: everything off, and the next drive's headlamps as the time of day has them. */
    off() {
        this.manual = null;
        this.set({ drive: 0, head: 0, brake: 0, reverse: 0 });
    }

    set(state) {
        if (Object.keys(state).every((key) => state[key] === this.state[key])) return;
        this.state = state;
        this.apply();
    }

    /** How lit each lamp is, 0 to 1, as the car is now. */
    levels() {
        const { drive, head, brake, reverse } = this.state;
        const drl = this.layout?.drl;
        return {
            head: head || (drive && !drl ? DRL_STANDIN : 0),
            drl: drive ? (head ? 0.7 : 1) : 0,
            tail: Math.max(drive * TAIL, brake),
            brake,
            reverse,
        };
    }

    apply() {
        const night = this.experience.world?.lighting === "night";
        const levels = this.levels();
        for (const { mesh, lamp, level } of this.parts ?? []) {
            const on = levels[lamp] * level;
            mesh.visible = on > 0;
            mesh.material.uniforms.tint.value.copy(COLOR[lamp]).multiplyScalar(on * GAIN[lamp][night ? "night" : "day"]);
            mesh.material.uniforms.cover.value = COVER[lamp] * Math.min(1, on * 2);
        }
        for (const { sprite, lamp } of this.halos ?? []) {
            // A lamp's glow is the dark's: by day it is lost in the light.
            const on = night ? levels[lamp] : 0;
            sprite.visible = on > 0;
            sprite.userData.opacity = Math.min(1, on * HALO[lamp] * (lamp === "tail" && levels.brake ? 1.6 : 1));
        }
        const head = this.state.head;
        if (this.beam?.isSpotLight) {
            this.beam.intensity = head ? BEAM.intensity * (night ? 1 : 0.15) : 0;
            this.showBeam(head > 0);
        }
        if (this.beam?.isMesh) {
            // By day a beam on the road is lost in the sun.
            this.beam.visible = head > 0 && night;
        }
    }

    /**
     * The beam's spotlight in the scene's light, or out of it (hidden).
     * Coming on, it waits for the shaders of what it lights to be built for
     * one light more (Renderer.prepareLights) — a moment after the lamps'
     * own glass lights, the first time; at once ever after — rather than
     * stop the view while they are.
     */
    showBeam(on) {
        const beam = this.beam;
        if (!on) {
            beam.visible = false;
            return;
        }
        if (beam.visible || this.preparing === beam) return;
        this.preparing = beam;
        this.experience.renderer.prepareLights([beam]).then(() => {
            if (this.preparing !== beam) return;
            this.preparing = null;
            // Still this car's beam, and its headlamps still on.
            if (this.beam === beam) beam.visible = this.state.head > 0;
        });
    }

    /** A part of the model's, lit: its triangles again, its light added over them. */
    lens(part) {
        const material = new THREE.ShaderMaterial({
            name: `lamp-${part.lamp}`,
            uniforms: {
                tint: { value: new THREE.Color(0, 0, 0) },
                cover: { value: 0 },
                base: { value: part.base },
                map: { value: part.texture },
                hasMap: { value: part.texture ? 1 : 0 },
                look: { value: LOOKS[part.look] },
                uvTransform: { value: part.texture ? part.texture.matrix : new THREE.Matrix3() },
                clipLow: { value: part.clip.low },
                clipHigh: { value: part.clip.high },
            },
            vertexShader: LENS_VERTEX,
            fragmentShader: LENS_FRAGMENT,
            // Its light added to what is there, which it covers by `cover`.
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            // Over the part it copies, not fighting it for the same depth.
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -4,
        });
        const mesh = new THREE.Mesh(part.geometry, material);
        mesh.name = `lamp-${part.lamp}`;
        mesh.visible = false;
        mesh.raycast = () => {};
        // After the lamps' glass — which some models make all but black —
        // as a lit lamp shines through it.
        mesh.renderOrder = 1;
        this.group.add(mesh);
        return mesh;
    }

    /** A lamp's glow at night: round its lens, as wide and tall as it is, a little out from it. */
    glow(halo) {
        glowTexture ??= radialTexture();
        const material = new THREE.SpriteMaterial({
            map: glowTexture,
            color: COLOR[halo.lamp],
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0,
            // A lamp's own light, brighter than anything it lights: not
            // toned down as the body round it is.
            toneMapped: false,
            fog: false,
        });
        const sprite = new THREE.Sprite(material);
        const { centre, size, end } = halo;
        sprite.position.set(centre.x, centre.y, centre.z + end * 0.06);
        sprite.scale.set(Math.max(0.3, size.x * 1.8), Math.max(0.24, size.y * 2.2), 1);
        sprite.visible = false;
        sprite.raycast = () => {};
        sprite.renderOrder = 2;
        // Seen only from the end of the car it shines out of: a glow faces
        // the camera whichever way, and from behind a headlamp's would show
        // round the car's sides.
        const facing = new THREE.Vector3(0, 0, end);
        sprite.onBeforeRender = (renderer, scene, camera) => {
            _toCamera.setFromMatrixPosition(camera.matrixWorld).sub(_lamp.setFromMatrixPosition(sprite.matrixWorld)).normalize();
            const ahead = _toCamera.dot(_facing.copy(facing).transformDirection(sprite.matrixWorld));
            material.opacity = (sprite.userData.opacity ?? 0) * THREE.MathUtils.smoothstep(ahead, -0.05, 0.35);
        };
        this.group.add(sprite);
        return sprite;
    }

    /** The beam: a spotlight, or a pool of light on the road, as the view is drawn (setMode). */
    buildBeam() {
        if (this.beam) {
            this.beam.removeFromParent();
            this.beam.target?.removeFromParent();
            this.beam.dispose?.();
            if (this.beam.isMesh) {
                this.beam.geometry.dispose();
                this.beam.material.dispose();
            }
            this.beam = null;
            this.preparing = null;
        }
        if (!this.layout || !this.mode) return;
        const { nose, headY, ground } = this.layout;
        if (this.mode === "lit") {
            const spot = new THREE.SpotLight(COLOR.head, 0, BEAM.distance, BEAM.angle, BEAM.penumbra, BEAM.decay);
            spot.name = "headlamp-beam";
            // Out of the scene's light until the headlamps are on (showBeam).
            spot.visible = false;
            spot.position.set(0, headY, nose);
            // Dipped: down onto the road a dozen metres on.
            spot.target.position.set(0, ground, nose + BEAM.reach);
            this.group.add(spot, spot.target);
            // Under the editor's plain light nothing of it is drawn but the lamps' glass.
            this.experience.world?.plainLight?.keepOut(spot);
            this.beam = spot;
            return;
        }
        poolTexture ??= beamTexture();
        const pool = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 20).rotateX(-Math.PI / 2).translate(0, 0, 10),
            new THREE.MeshBasicMaterial({
                map: poolTexture,
                color: COLOR.head.clone().multiplyScalar(0.55),
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -4,
                toneMapped: false,
            })
        );
        pool.name = "headlamp-pool";
        pool.position.set(0, ground + 0.04, nose + 0.4);
        pool.visible = false;
        pool.raycast = () => {};
        pool.renderOrder = 1;
        this.group.add(pool);
        this.beam = pool;
    }

    dispose() {
        // The lit parts' geometry is the model's, shared by every car that wears it.
        this.group.traverse((node) => node.material?.dispose());
        this.beam?.dispose?.();
        if (this.beam?.isMesh) this.beam.geometry.dispose();
        this.group.removeFromParent();
    }
}

/**
 * A model's lamps, in its own frame (+Z forward, +X its left), worked out
 * once for every car that wears it: each lit part's triangles, with what
 * colours it; each lamp's glow, left and right; where the headlamps are
 * for the beam, and the ground under them.
 *
 * The model's own lamps that glow by themselves — lit in the file, parked
 * or not — are put out: they light as its lamps do.
 */
export function lampLayout(model) {
    if (layouts.has(model.body)) return layouts.get(model.body);
    const [x0, y0, z0] = model.meta.body.min;
    const [x1, y1, z1] = model.meta.body.max;
    const specs = LAMPS[model.meta.id] ?? GENERIC;
    const body = model.body;
    body.updateMatrixWorld(true);
    const inverse = body.matrixWorld.clone().invert();

    const parts = [];
    body.traverse((mesh) => {
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const material = mesh.material;
        for (const spec of specs) {
            if (!spec.material.test(material.name ?? "")) continue;
            const look = spec.look ?? DEFAULT_LOOK[spec.lamp];
            const emissive = spec.from === "emissive";
            const texture = look === "flat" ? null : (emissive ? material.emissiveMap : material.map) ?? null;
            const near = spec.end === "front" ? (z) => z > z1 - REACH : (z) => z < z0 + REACH;
            const [low, high] = spec.y ?? [-Infinity, Infinity];
            const [inner, outer] = spec.x ?? [0, Infinity];
            const keep = (c) => near(c.z) && c.y >= low && c.y <= high && Math.abs(c.x) >= inner && Math.abs(c.x) <= outer;
            // Its own glow, as the file has it (it is put out below).
            const glow = (material.userData.ownEmissive ??= material.emissive?.clone());
            const base = (emissive ? glow : material.color)?.clone() ?? new THREE.Color(1, 1, 1);
            texture?.updateMatrix();
            // Only what of it lights: a red lamp's red, where its texture is.
            const lit = litAt(look, texture, base);
            if (!lit) continue;
            const geometry = extract(mesh, inverse, keep, Boolean(texture), lit);
            if (!geometry) continue;
            const clip = { low: new THREE.Vector2(inner || -1, Math.max(low, -9)), high: new THREE.Vector2(Math.min(outer, 9), Math.min(high, 9)) };
            parts.push({ lamp: spec.lamp, look, level: spec.level ?? 1, end: spec.end === "front" ? 1 : -1, geometry, texture, base, clip });
            // The lamp lights it now.
            material.emissive?.setRGB(0, 0, 0);
        }
    });

    // Each lamp's glow: round each of its lit pieces, left and right — its
    // full parts' (level 1), not the glass's faint light round them.
    const halos = [];
    for (const lamp of ["head", "drl", "tail", "brake", "reverse"]) {
        const all = parts.filter((part) => part.lamp === lamp);
        const full = all.filter((part) => part.level >= 1);
        const own = full.length ? full : all;
        for (const side of [1, -1]) {
            for (const box of pieces(own.map((part) => part.geometry), side)) {
                halos.push({ lamp, end: own[0].end, centre: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) });
            }
        }
    }

    // The beam, from between the headlamps — or where they would be.
    const lamps = halos.filter((halo) => halo.lamp === "head");
    const front = lamps.length ? lamps : halos.filter((halo) => halo.lamp === "drl");
    const headY = front.length ? front.reduce((sum, halo) => sum + halo.centre.y, 0) / front.length : y0 + (y1 - y0) * 0.38;
    const nose = front.length ? Math.max(...front.map((halo) => halo.centre.z + halo.size.z / 2)) : z1 - 0.05;
    const layout = { parts, halos, headY, nose, ground: y0 - 0.12, drl: parts.some((part) => part.lamp === "drl") };
    layouts.set(model.body, layout);
    return layout;
}

/**
 * The triangles of a mesh whose middles `keep` takes, in the model's
 * frame, as a geometry of their own — with their texture coordinates, if
 * `uv` and it has them, and only those `lit` takes at a corner or the
 * middle of, by them. Null if none are.
 */
function extract(mesh, inverse, keep, uv, lit = () => true) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const coords = uv ? geometry.getAttribute("uv") : null;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const toBody = inverse.clone().multiply(mesh.matrixWorld);
    const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const middle = new THREE.Vector3();
    const positions = [];
    const uvs = [];
    for (let i = 0; i + 2 < count; i += 3) {
        const at = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
        middle.set(0, 0, 0);
        for (let k = 0; k < 3; k++) middle.add(corner[k].fromBufferAttribute(position, at[k]).applyMatrix4(toBody));
        if (!keep(middle.divideScalar(3))) continue;
        if (coords) {
            const u = at.map((k) => coords.getX(k));
            const v = at.map((k) => coords.getY(k));
            const mid = [(u[0] + u[1] + u[2]) / 3, (v[0] + v[1] + v[2]) / 3];
            if (!lit(...mid) && ![0, 1, 2].some((k) => lit(u[k], v[k]))) continue;
        }
        for (let k = 0; k < 3; k++) {
            positions.push(corner[k].x, corner[k].y, corner[k].z);
            if (coords) uvs.push(coords.getX(at[k]), coords.getY(at[k]));
        }
    }
    if (!positions.length) return null;
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (coords) out.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    out.computeBoundingSphere();
    return out;
}

/**
 * The pieces a lamp's parts make on one side of the car (+1 its left) —
 * what of them touches, give or take a hand's breadth — each's extent;
 * the largest few. A tail lamp and a lamp low in the bumper are two.
 */
function pieces(geometries, side, cell = 0.15) {
    const cells = new Map();
    const point = new THREE.Vector3();
    for (const geometry of geometries) {
        const position = geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i);
            if (side * point.x <= 0.1) continue;
            const key = `${Math.floor(point.x / cell)},${Math.floor(point.y / cell)},${Math.floor(point.z / cell)}`;
            if (!cells.has(key)) cells.set(key, new THREE.Box3());
            cells.get(key).expandByPoint(point);
        }
    }
    const seen = new Set();
    const boxes = [];
    for (const start of cells.keys()) {
        if (seen.has(start)) continue;
        seen.add(start);
        const box = new THREE.Box3();
        const stack = [start];
        while (stack.length) {
            const key = stack.pop();
            box.union(cells.get(key));
            const [i, j, k] = key.split(",").map(Number);
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    for (let dk = -1; dk <= 1; dk++) {
                        const next = `${i + di},${j + dj},${k + dk}`;
                        if (cells.has(next) && !seen.has(next)) {
                            seen.add(next);
                            stack.push(next);
                        }
                    }
                }
            }
        }
        boxes.push(box);
    }
    const area = (box) => {
        const size = box.getSize(point);
        return Math.max(size.x, 0.05) * Math.max(size.y, 0.05);
    };
    return boxes.sort((a, b) => area(b) - area(a)).slice(0, 3);
}

/**
 * Whether a part lights at a point of its texture, as LENS_FRAGMENT has it
 * (`(u, v) => boolean`) — or, a part without one, whether it lights at
 * all: a function that takes it all, or null.
 */
function litAt(look, texture, base) {
    if (look === "flat" || look === "detail") return () => true;
    const test = look === "red" ? isRed : isWhite;
    const pixels = texture && texels(texture);
    if (!pixels) return test(base.r, base.g, base.b) ? () => true : null;
    const { width, height, data } = pixels;
    const e = texture.matrix.elements;
    return (u, v) => {
        let s = e[0] * u + e[3] * v + e[6];
        let t = e[1] * u + e[4] * v + e[7];
        s -= Math.floor(s);
        t -= Math.floor(t);
        if (texture.flipY) t = 1 - t;
        const k = (Math.min(height - 1, Math.floor(t * height)) * width + Math.min(width - 1, Math.floor(s * width))) * 4;
        return test(linear(data[k]) * base.r, linear(data[k + 1]) * base.g, linear(data[k + 2]) * base.b);
    };
}

/** Red, as the lamp shader takes it (linear colour). */
function isRed(r, g, b) {
    return r > 0.004 && (r - Math.max(g, b)) / r > 0.45;
}

/** White or clear, as the lamp shader takes it (linear colour). */
function isWhite(r, g, b) {
    const high = Math.max(r, g, b);
    const low = Math.min(r, g, b);
    return low > 0.1 && (high - low) / high < 0.3;
}

function linear(byte) {
    return Math.pow(byte / 255, 2.2);
}

/** A texture's pixels, read once, at no more than 512 across; null if they can't be. */
const pixelCache = new WeakMap();
function texels(texture) {
    const image = texture.image;
    if (!image?.width) return null;
    if (pixelCache.has(image)) return pixelCache.get(image);
    let pixels = null;
    try {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);
        pixels = { width, height, data: context.getImageData(0, 0, width, height).data };
    } catch {
        pixels = null;
    }
    pixelCache.set(image, pixels);
    return pixels;
}

const LENS_VERTEX = /* glsl */ `
uniform mat3 uvTransform;
varying vec2 vUv;
varying vec2 vAt;
void main() {
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    vAt = vec2(abs(position.x), position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * A lit part: its lamp's colour, all over (flat), as its texture (detail),
 * or where its colour is red, or white.
 */
const LENS_FRAGMENT = /* glsl */ `
uniform vec3 tint;
uniform float cover;
uniform vec3 base;
uniform sampler2D map;
uniform float hasMap;
uniform int look;
uniform vec2 clipLow;
uniform vec2 clipHigh;
varying vec2 vUv;
varying vec2 vAt;
void main() {
    // Cut straight where its part ends, softly.
    vec2 inside = smoothstep(clipLow - 0.004, clipLow + 0.004, vAt) * (1.0 - smoothstep(clipHigh - 0.004, clipHigh + 0.004, vAt));
    if (inside.x * inside.y <= 0.0) discard;
    vec3 texel = hasMap > 0.5 ? texture2D(map, vUv).rgb : vec3(1.0);
    vec3 colour = texel * base;
    float high = max(colour.r, max(colour.g, colour.b));
    float low = min(colour.r, min(colour.g, colour.b));
    float lit = 1.0;
    if (look == 2) lit = smoothstep(0.45, 0.75, (colour.r - max(colour.g, colour.b)) / max(colour.r, 1e-4)) * smoothstep(0.004, 0.03, colour.r);
    else if (look == 3) lit = (1.0 - smoothstep(0.15, 0.3, (high - low) / max(high, 1e-4))) * smoothstep(0.1, 0.3, low);
    lit *= inside.x * inside.y;
    gl_FragColor = vec4((look == 1 ? tint * texel : tint) * lit, cover * lit);
    #include <colorspace_fragment>
}
`;

/** A soft round glow, white at its heart. */
function radialTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const g = canvas.getContext("2d");
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.7)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

/**
 * Headlamps' light on the road: brightest just ahead of the car, spreading
 * and fading the farther it reaches — two lamps' worth, side by side.
 * Its near edge is the canvas's top (v 1, laid nearest the car), its far
 * its bottom.
 */
function beamTexture() {
    const width = 64;
    const height = 128;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    const image = g.createImageData(width, height);
    for (let j = 0; j < height; j++) {
        // 0 at the car, 1 at the far end.
        const along = j / (height - 1);
        const spread = 0.2 + along * 0.3;
        // Nothing at the bumper, brightest a few metres on, gone at the end.
        const fade = THREE.MathUtils.smoothstep(along, 0, 0.14) * Math.pow(1 - along, 1.8);
        for (let i = 0; i < width; i++) {
            const across = (i / (width - 1)) * 2 - 1;
            // Each lamp's lobe, and the light they make between them.
            const lobe = (centre) => Math.exp(-(((across - centre) / spread) ** 2) * 2.2);
            const lamps = Math.min(1, (lobe(-0.28) + lobe(0.28)) * 0.55) * (1 - THREE.MathUtils.smoothstep(Math.abs(across), 0.8, 1));
            const v = Math.round(255 * Math.min(1, fade * lamps));
            const k = (j * width + i) * 4;
            image.data[k] = image.data[k + 1] = image.data[k + 2] = v;
            image.data[k + 3] = 255;
        }
    }
    g.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

import * as THREE from "three";

import Experience from "../Experience.js";
import { QUALITY, onQualityChange } from "../Utils/device.js";

/**
 * The light fittings that are on, drawn as live lights, in a view lit live
 * — the editor, its walkthrough, a version published without its light
 * baked (World/LiveSwitches.js). A view has far too many fittings to light
 * them all (Ladonia: 93 rooms, each light costing every pixel drawn), so a
 * few lights are made once and handed to the fittings that are on nearest
 * where the visitor is; every other room that is lit glows instead
 * (World/RoomGlow.js).
 *
 * The slider's step says how many (Utils/device.js's `lamps`):
 *
 *   - `shadowed`: spotlights shining down from the fittings, each with a
 *     shadow of its own — a door swinging shut cuts off the hall light —
 *     drawn in one pass (a point light's would take six). They go to the
 *     lights of the visitor's own room first, then to those of the rooms it
 *     opens into, nearest first.
 *   - `unshadowed`: spotlights as well, shining down, without shadows, for
 *     the rest of the visitor's own room — a pendant over the table, a
 *     reading lamp — kept to the room by World/RoomGlow.js.
 *
 * Every one shines down, never up: a light hanging a hand's width under a
 * ceiling, lighting it all round, burns it white, where a fitting's own
 * shade or body hides it — and the room's glow (World/RoomGlow.js) gives the
 * ceiling the light a lamp throws up.
 *
 * The lights are never added or taken away, only moved and dimmed, so no
 * shader is ever built again as switches go on and off or the visitor
 * walks (three builds them for a number of lights); the slider changing
 * the numbers builds them once more. Handed over, a light fades in.
 *
 * While no fitting whose light the visitor can see is on — by day, as a
 * rule — the pool is out of the scene's light altogether (hidden): six
 * lights at nothing cost every lit pixel as much as six that shone, 3 to 8
 * ms of a frame at the top step. As the first such fitting is lit it comes
 * in, all of it at once — after the shaders for the scene with it in have
 * been built ahead (Renderer.prepareLights), which the first time takes a
 * moment and then never again — and once none has been in sight for a
 * while it goes out again. In, or out: two states, each one's shaders
 * built once.
 *
 * In sight (sees): a fitting in the visitor's own room; one in a room that
 * opens into it, through what joins the two as it stands — a doorway, a
 * stairwell, no wall at all, a door with glass in it, a door not shut;
 * and, from out of doors, one in a room whose light gets out — any but a
 * room daylight does not reach (shared/daylight.js: no window, no doorway
 * out), which shows only through a door of its own to the outdoors that
 * stands open. A lit bathroom behind its shut door, or a villa's
 * windowless rooms from its terrace, light nothing that is seen, and by
 * day — when theirs are the only lights on — kept the pool in from the
 * hall beside one and from the pool's edge. Which fittings are handed the
 * lights is as it was: sight only says whether the pool is in.
 *
 * So that it comes in at once when such a door opens, the shaders are
 * built ahead as well while a lit fitting is only near (warm): the first
 * visit's seconds of building are spent before the door is reached, not
 * with the room standing dark behind it.
 *
 * A light's shadow is drawn again only when it is handed to another
 * fitting, or when something near it moves — a door, a drawer, a car,
 * anyone, the visitor too — at most one a frame, each at most ten times a
 * second.
 *
 * Under the editor's plain light (World/PlainLight.js) there is no pool
 * until its realistic preview first draws (World.relight), and then its
 * lights are out of three's light state, unmoved, while the plain light is
 * on.
 *
 * From above (the bird's-eye view of a version lit live, World/BirdView.js)
 * no fitting is given a light, so none is lit and no lamp's shadow is
 * drawn: the lit rooms glow (World/RoomGlow.js), as they do from the garden.
 *
 * Over a bake (`whole`: a room of a view drawn from its bake drawn live in
 * the bake's own light, World/RoomBakeLight.js) the lamps are the bake's
 * own: a switch's lights are lit all together or not at all — the bake
 * holds a switch's light, and what its lamps bounce, as one — each a point
 * light where the bake's lamp hung, shining every way as it did, with a
 * shadow of its own on every side (six maps: what the bake's lamp lit,
 * this lights); and only as many as there are lights with shadows: a
 * switch the pool has none for is drawn from the bake, all of its light,
 * with the bake's own soft shadows. None without a shadow.
 */

/** How far a light's shadow, and so its light, reaches, in metres. */
const SHADOW_REACH = 14;
/** Something moving further than this from a light does not draw its shadow again. */
const MOTION_REACH = 10;
/** How often, in seconds, the lights are handed round again at the latest. */
const REASSIGN = 0.5;
/** How long a light takes to fade in or out, in seconds. */
const FADE = 0.25;
/** A light's shadow is drawn again at most this often, in seconds. */
const SHADOW_EVERY = 0.1;
/** A fitting that is lit keeps its light unless another would light the visitor this many times more. */
const HOLD = 1.5;
/** How long, in seconds, with no fitting to light before the pool goes out of the scene's light. */
const LEAVE_AFTER = 3;
/** A downlight's beam: a recessed one's narrower, anything else's all but the half below it. */
const BEAM = { recessed: { angle: 1.1, penumbra: 0.7 }, other: { angle: 1.48, penumbra: 0.9 } };
/** How far a lamp's light is kept from its room's walls, in metres: a wall light's tube is 2.5 cm off its wall. */
const OFF_WALL = 0.12;
/**
 * A wall light's tube — glass longer than this, by a wall — lights the wall
 * along its length, where a light at one point under it would put a hot
 * patch on what stands below (a headboard): its light comes from the tube
 * itself, further off the wall, and a third of it (the room's glow is the rest).
 */
const TUBE = { radius: 0.1, offWall: 0.25, share: 0.35 };
/** Less movement than this, in metres (or, turned, in a matrix's units), is none: a visitor standing still settles by a few millimetres. */
const STILL = { move: 0.01, turn: 0.002 };
/** Over a bake (`whole`), a lamp's shadow map, per side of its cube: six of them — three times the texels of the step's 1024 a side at 512. */
const POINT_SHADOW_SIZE = 512;
/**
 * Over a bake, how far a lamp's light and its shadow reach, in metres: a point light's shadow lets everything
 * past its far plane through — walls too — so its light ends there, at the inverse square to within 1% at 5 m.
 */
const POINT_REACH = 20;

const _here = new THREE.Vector3();
const _at = new THREE.Vector3();

export default class LampPool {
    /**
     * @param {World} world  drawing a view lit live
     * @param {LiveSwitches} switches  its switches
     * @param {object} [options]  for a room of a view drawn from its bake that is drawn as a view lit live draws it (World/LiveRoom.js):
     * @param {number|number[]} [options.layer]  the layer, or layers, its lights are on — the room's own calls' — in place of the scene's
     * @param {(lights: THREE.Light[]) => Promise} [options.prepare]  what builds the shaders ahead of the pool coming in (enter, warm), in place of Renderer.prepareLights
     * @param {(lights: THREE.Light[]) => Promise} [options.prepareOut]  what builds the shaders for the pool gone out of the light again, before it goes (exit): a room may never have been drawn without it
     * @param {(where: object) => object} [options.where]  where the lights are handed round from, given where the visitor is (where)
     * @param {boolean} [options.warm]  false: nothing built ahead while a lit fitting is only near (warm) — whoever made it builds for both ahead itself
     * @param {(entry: object) => object[]|null} [options.whole]  over a bake: a switch's lights as the bake has them —
     *        each `{ position, power, color, size, index, share }`, the same objects each time — to be lit all together, as
     *        point lights with shadows where they hang; or null where it is not to be lit live (its light is the bake's)
     */
    constructor(world, switches, { layer = null, prepare = null, prepareOut = null, where = null, warm = true, whole = null } = {}) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.renderer = this.experience.renderer;
        this.world = world;
        this.builder = world.sceneBuilder;
        this.switches = switches;
        this.layer = layer;
        this.prepare = prepare ?? ((lights) => this.renderer.prepareLights(lights));
        this.prepareOut = prepareOut;
        this.warms = warm;
        this.whereFrom = where;
        this.whole = whole;
        this.key = null;
        this.timer = 0;
        this.tracked = new Map();
        this.queue = [];
        this.build(this.budgetOf(QUALITY));
        this.onEdited = () => this.redrawAll();
        world.on?.("scene-edited", this.onEdited);
        // The slider: as many lights as its step asks for.
        this.stopQuality = onQualityChange((quality) => this.applyQuality(quality));
    }

    /** Whether every light has faded to where it is going — out of the scene's light, whether none is on its way in. */
    get settled() {
        if (!this.lit) return !this.wanted;
        return this.slots.every((slot) => Math.abs(slot.level - (slot.fitting ? slot.target : 0)) <= 1e-6 * Math.max(1, slot.target));
    }

    /** How many lights the step asks for — over a bake (`whole`), its lights with shadows alone, each a cube of maps. */
    budgetOf(quality) {
        const lamps = quality.lamps ?? { shadowed: 0, unshadowed: 0, size: 512 };
        return this.whole ? { shadowed: lamps.shadowed, unshadowed: 0, size: POINT_SHADOW_SIZE } : lamps;
    }

    /** The lights, as many of each as the step asks for: out of the scene's light until one is wanted (enter). */
    build(budget = { shadowed: 0, unshadowed: 0, size: 512 }) {
        this.budget = { ...budget };
        this.slots = [];
        this.lit = false;
        this.entering = null;
        this.idle = 0;
        /** The fittings whose light the visitor can see (assign), whether one of them has a light (update), and whether any lit fitting is near. */
        this.sighted = new Set();
        this.wanted = false;
        this.near = false;
        for (let k = 0; k < budget.shadowed; k++) {
            // (Over a bake, the bake's lamp: shining every way, falling off as the square of the distance, as far as its shadow reaches.)
            const light = this.whole ? new THREE.PointLight(0xffffff, 0, POINT_REACH, 2) : new THREE.SpotLight(0xffffff, 0, SHADOW_REACH, BEAM.other.angle, BEAM.other.penumbra, 2);
            light.name = `lamp-pool:shadowed:${k}`;
            light.castShadow = true;
            light.shadow.mapSize.set(budget.size, budget.size);
            light.shadow.camera.near = 0.05;
            light.shadow.camera.far = SHADOW_REACH;
            light.shadow.bias = -0.0006;
            light.shadow.normalBias = 0.02;
            light.shadow.autoUpdate = false;
            // (A cube's depth is its distance over its reach: a centimetre or so, as live lamps over a bake have it — LiveLamps.)
            if (this.whole) {
                light.shadow.bias = -0.001;
                light.shadow.camera.far = POINT_REACH;
            }
            this.scene.add(light);
            if (light.target) this.scene.add(light.target);
            this.slots.push({ light, shadowed: true, fitting: null, level: 0, target: 0, cooldown: 0 });
        }
        for (let k = 0; k < budget.unshadowed; k++) {
            const light = new THREE.SpotLight(0xffffff, 0, 6, BEAM.other.angle, BEAM.other.penumbra, 2);
            light.name = `lamp-pool:unshadowed:${k}`;
            this.scene.add(light, light.target);
            this.slots.push({ light, shadowed: false, fitting: null, level: 0, target: 0, cooldown: 0 });
        }
        // Made again by the slider under the editor's plain light: out of three's light state with the rest.
        for (const { light } of this.slots) {
            light.visible = false;
            if (this.layer !== null) [].concat(this.layer).forEach((layer, k) => (k ? light.layers.enable(layer) : light.layers.set(layer)));
            this.world.plainLight?.keepOut(light);
        }
        this.key = null;
    }

    /**
     * The pool into the scene's light, for its first fitting: once the
     * shaders for the scene with it in are built (Renderer.prepareLights) —
     * until then its fittings wait, unlit, their rooms glowing.
     */
    enter() {
        if (this.lit || this.entering) return;
        const slots = this.slots;
        this.entering = this.prepare(slots.map((slot) => slot.light)).then(() => {
            // (The slider has made other lights meanwhile: theirs to bring in.)
            if (this.slots !== slots) return;
            this.entering = null;
            for (const { light } of slots) light.visible = true;
            this.lit = true;
            // Each fades in from nothing, its shadow drawn first.
            for (const slot of slots) {
                slot.level = 0;
                if (slot.shadowed && slot.fitting) this.requestShadow(slot, true);
            }
        });
    }

    /**
     * The shaders for the scene with the pool in it, built ahead while it
     * is out (Renderer.prepareLights, the lights left hidden): a lit
     * fitting is near, out of sight. Once for the lights there are, and
     * again when the view has built shaders since — for what has come
     * into it — which finds the rest built and costs one pass over the
     * scene.
     */
    warm() {
        if (this.lit || this.entering || this.warming || !this.slots.length) return;
        const info = this.renderer.renderer.info;
        if (this.warmed?.slots === this.slots && this.warmed.programs === info.programs?.length) return;
        const slots = this.slots;
        this.warming = this.prepare(slots.map((slot) => slot.light)).then(() => {
            this.warming = null;
            this.warmed = { slots, programs: info.programs?.length };
        });
    }

    /**
     * The pool on its way out of the scene's light: at once (leave), or —
     * where what it lights may never have been drawn without it (a room of
     * a baked view first shown with its lamps lit: World/LiveRoom.js) —
     * once the shaders for that are built.
     */
    exit() {
        if (!this.prepareOut) return this.leave();
        if (this.leaving) return;
        const slots = this.slots;
        this.leaving = this.prepareOut(slots.map((slot) => slot.light)).then(
            () => {
                this.leaving = null;
                if (this.slots === slots && this.lit && !this.wanted) this.leave();
            },
            () => (this.leaving = null)
        );
    }

    /**
     * The lights handed round and lit as they will stand, at once — no
     * fade, each shadow drawn in the next frame: for a room that is shown
     * from one frame to the next (World/LiveRoom.js), where lamps fading in
     * were a room dark for a quarter of a second. `built`: whether what
     * they light has its shaders for the pool in the scene's light — then
     * it is in from now on, lit or not; else it comes in as ever (enter).
     *
     * @returns {boolean} whether a fitting it lights is in sight
     */
    snap(built = false) {
        const where = this.where();
        this.key = `${where.room ?? ""}|${where.above ? "above" : ""}|${this.switches.version}|${this.doorsMark()}`;
        this.timer = REASSIGN;
        this.assign(where);
        const wanted = this.slots.some((slot) => slot.fitting && this.sighted.has(slot.fitting));
        this.wanted = wanted;
        this.idle = 0;
        if (built && !this.lit && !this.entering) {
            for (const { light } of this.slots) light.visible = true;
            this.lit = true;
        }
        if (!this.lit) return wanted;
        for (const slot of this.slots) {
            slot.level = slot.fitting ? slot.target : 0;
            slot.light.intensity = slot.level;
            if (slot.shadowed && slot.fitting) this.requestShadow(slot, true);
        }
        return wanted;
    }

    /**
     * Whether a fitting that is on would be in sight of a visitor standing
     * in `room` (assign): its own, or one whose light reaches it — as its
     * doors stand, or (`anyDoor`) whatever they do.
     */
    wouldLight(room, anyDoor = false) {
        if (!room) return false;
        const weights = this.switches.weights;
        this.doorsById = new Map((this.builder.doors || []).map((door) => [door.spec.id, door]));
        const inside = this.switches.indoor?.has(room);
        return this.switches.entries.some((entry, index) => {
            if (!(weights[index] > 0)) return false;
            return entry.lights.some((fitting) => fitting.room === room || (inside && entry.zones.includes(room) && (anyDoor || this.sees(entry, fitting, room, inside))));
        });
    }

    /** The pool out of the scene's light again: nothing the visitor can see is lit. */
    leave() {
        for (const slot of this.slots) {
            slot.light.visible = false;
            slot.light.intensity = 0;
            slot.level = 0;
        }
        this.lit = false;
    }

    /** The slider has moved: as many lights as its step asks for (shaders are built again once). */
    applyQuality(quality) {
        const next = this.budgetOf(quality);
        if (!next || (next.shadowed === this.budget.shadowed && next.unshadowed === this.budget.unshadowed && next.size === this.budget.size)) return;
        this.removeLights();
        this.build(next);
    }

    /** @param {THREE.Vector3[]} [moved]  where whatever moves has moved since the last frame, if whoever calls has asked already (moved) */
    update(delta, moved = null) {
        this.timer -= delta;
        const where = this.where();
        const key = `${where.room ?? ""}|${where.above ? "above" : ""}|${this.switches.version}|${this.doorsMark()}`;
        if (key !== this.key || this.timer <= 0) {
            this.key = key;
            this.timer = REASSIGN;
            this.assign(where);
        }
        // In the scene's light only while a fitting that has one of its lights can be seen to shine.
        const wanted = this.slots.some((slot) => slot.fitting && this.sighted.has(slot.fitting));
        this.wanted = wanted;
        this.idle = wanted ? 0 : this.idle + delta;
        if (wanted && !this.lit) this.enter();
        else if (!wanted && this.lit && this.idle > LEAVE_AFTER && this.settled) this.exit();
        if (!this.lit) {
            // Out, a lit fitting near: ready to come in the moment it is seen.
            if (!wanted && this.near && this.warms) this.warm();
            return;
        }
        // Fade.
        const step = Math.min(1, delta / FADE);
        for (const slot of this.slots) {
            const goal = slot.fitting ? slot.target : 0;
            const most = Math.max(slot.target, 1e-3) * step;
            slot.level += THREE.MathUtils.clamp(goal - slot.level, -most, most);
            slot.light.intensity = slot.level;
            slot.cooldown -= delta;
        }
        this.redrawShadows(moved ?? this.moved());
    }

    /**
     * Where the visitor is: the room they stand in (or drive through), the
     * editor's camera, or — looking down on a floor — `above`, from where
     * no fitting is lit.
     */
    where() {
        const where = this.whereNow();
        return this.whereFrom ? this.whereFrom(where) : where;
    }

    whereNow() {
        const world = this.world;
        const bird = world.birdView;
        if (bird?.active) return { room: null, point: _here.copy(bird.target), above: true };
        const editor = world.editor;
        if (editor?.active) {
            // What is being worked on: where the view looks (its camera hangs high over it).
            if (editor.view?.target) _here.copy(editor.view.target);
            else _here.copy(this.experience.camera.activeCamera.position);
            const room = this.builder.roomAt(_here.x, _here.y + 0.05, _here.z) ?? this.builder.roomAt(_here.x, _here.y - 1.2, _here.z);
            return { room: room?.id ?? null, point: _here, feet: false };
        }
        const player = world.player;
        if (player?.inVehicle && player.currentCar) _here.copy(player.currentCar.group.position);
        else if (player?.player?.collider) _here.copy(player.player.collider.start);
        else _here.copy(this.experience.camera.activeCamera.position);
        const room = this.builder.roomAt(_here.x, _here.y, _here.z);
        return { room: room?.id ?? null, point: _here, feet: true };
    }

    /**
     * Hand the lights to the fittings that are on nearest the visitor —
     * from above, to none — and note which of them the visitor can see the
     * light of (`sighted`), and whether any that is lit is near (`near`).
     */
    assign({ room, point, feet = true, above = false }) {
        if (this.whole) return this.assignWhole({ room, point, feet, above });
        this.rebind();
        this.sighted = new Set();
        this.near = false;
        if (above) {
            this.fill(this.slots.filter((slot) => slot.shadowed), []);
            this.fill(this.slots.filter((slot) => !slot.shadowed), []);
            return;
        }
        const weights = this.switches.weights;
        this.doorsById = new Map((this.builder.doors || []).map((door) => [door.spec.id, door]));
        // Indoors, the lights whose light comes through to this room; out
        // on a path, a terrace or the lawn, any lit nearby on this storey.
        const inside = room !== null && this.switches.indoor?.has(room);
        const own = [];
        const near = [];
        this.switches.entries.forEach((entry, index) => {
            if (!(weights[index] > 0)) return;
            for (const fitting of entry.lights) {
                const distance = point.distanceTo(_at.set(...fitting.position));
                if (distance < SHADOW_REACH) this.near = true;
                // How much of its light reaches the visitor: the room's main light before a bedside lamp.
                const score = fitting.power / (1 + distance * distance);
                if (room && fitting.room === room) {
                    own.push({ fitting, distance, score });
                    this.sighted.add(fitting);
                } else if (inside ? entry.zones.includes(room) : distance < SHADOW_REACH && within(fitting.position[1] - point.y, feet)) {
                    // (Out of doors, what hangs over the visitor's feet: not
                    // the ceiling light of the room under the deck they stand on.)
                    near.push({ fitting, distance, score });
                    this.near = true;
                    if (this.sees(entry, fitting, room, inside)) this.sighted.add(fitting);
                }
            }
        });
        own.sort((a, b) => b.score - a.score);
        near.sort((a, b) => b.score - a.score);
        const shadowed = this.slots.filter((slot) => slot.shadowed);
        const unshadowed = this.slots.filter((slot) => !slot.shadowed);
        // The visitor's own room first, then what its light comes through.
        const forShadowed = [...own, ...near].slice(0, shadowed.length).map((c) => c.fitting);
        const spotted = this.hold(shadowed, forShadowed, [...own, ...near]);
        // The rest of the room's lights.
        const extras = own
            .map((c) => c.fitting)
            .filter((fitting) => !spotted.includes(fitting))
            .slice(0, unshadowed.length)
            .map((fitting) => ({ fitting, share: 1 }));
        this.fill(shadowed, spotted.map((fitting) => ({ fitting, share: 1 })));
        this.fill(unshadowed, extras);
    }

    /**
     * Over a bake (`whole`): the lights handed to switches, a switch's all
     * together or none of them — the visitor's own room's first, then those
     * whose light they can see from it (sees), the more light a switch
     * throws on the visitor the sooner (a switch lit now counts HOLD times
     * its own, so lights are not handed back and forth as they walk) — as
     * many as there are lights. A switch whose lights do not all find one —
     * a living room's ceiling light and its ten spots on one switch — keeps
     * the bake's light, all of it. Whether one is near, as assign has it.
     */
    assignWhole({ room, point, feet = true, above = false }) {
        this.sighted = new Set();
        this.near = false;
        const slots = this.slots.filter((slot) => slot.shadowed);
        if (above) return this.fill(slots, []);
        const weights = this.switches.weights;
        this.doorsById = new Map((this.builder.doors || []).map((door) => [door.spec.id, door]));
        const inside = room !== null && this.switches.indoor?.has(room);
        const lit = new Set(slots.map((slot) => slot.fitting?.index).filter((index) => index !== undefined));
        const candidates = [];
        this.switches.entries.forEach((entry, index) => {
            if (!(weights[index] > 0)) return;
            let own = false;
            let seen = false;
            let reaches = false;
            let score = 0;
            for (const fitting of entry.lights) {
                const distance = point.distanceTo(_at.set(...fitting.position));
                if (distance < SHADOW_REACH) this.near = true;
                score += fitting.power / (1 + distance * distance);
                if (room && fitting.room === room) {
                    own = seen = reaches = true;
                } else if (inside ? entry.zones.includes(room) : distance < SHADOW_REACH && within(fitting.position[1] - point.y, feet)) {
                    this.near = true;
                    reaches = true;
                    if (this.sees(entry, fitting, room, inside)) seen = true;
                }
            }
            // (Only a switch whose light is seen: one behind a shut door would light nothing in sight live.)
            const lights = reaches && seen ? this.whole(entry) : null;
            if (!lights?.length) return;
            for (const light of lights) this.sighted.add(light);
            candidates.push({ lights, own, score: score * (lit.has(lights[0].index) ? HOLD : 1) });
        });
        candidates.sort((a, b) => Number(b.own) - Number(a.own) || b.score - a.score);
        const wanted = [];
        for (const { lights } of candidates) {
            if (wanted.length + lights.length > slots.length) continue;
            for (const fitting of lights) wanted.push({ fitting, share: 1 });
        }
        this.fill(slots, wanted);
    }

    /**
     * Whether the visitor can see the light of a fitting that is not in
     * their own room: from the room it opens into, through whatever joins
     * the two that lets light by as it stands; from out of doors, unless
     * its room is one daylight does not reach — sealed, but for a door of
     * its own to the outdoors standing open.
     *
     * @param {object} entry  the fitting's switch (LiveSwitches' `entries`)
     * @param {object} fitting
     * @param {string|null} room  where the visitor is
     * @param {boolean} inside  whether that is a room lights reach others from (LiveSwitches' `indoor`)
     */
    sees(entry, fitting, room, inside) {
        const switches = this.switches;
        if (inside) {
            const ways = switches.between?.(entry.room, room) ?? [];
            return !ways.length || ways.some((id) => id === null || this.passes(id));
        }
        if (!switches.dark?.has(fitting.room)) return true;
        return (switches.doorsOut?.get(fitting.room) ?? []).some((id) => this.passes(id));
    }

    /** Whether a door lets light by as it stands: one with glass in it, or one that is not shut (or is on its way open). */
    passes(id) {
        if (this.switches.glazed?.has(id)) return true;
        const door = this.doorsById?.get(id);
        return !door || ajar(door);
    }

    /** The doors that are not shut, as a number that changes when one opens or shuts: what is in sight changes with them. */
    doorsMark() {
        const doors = this.builder.doors || [];
        let mark = 0;
        for (let i = 0; i < doors.length; i++) if (ajar(doors[i])) mark = (mark * 31 + i + 1) | 0;
        return mark;
    }

    /**
     * The fittings to light, keeping each that is already lit unless one
     * not lit would clearly light the visitor more — so lights are not
     * handed back and forth as they walk.
     */
    hold(slots, chosen, ranked) {
        const lit = slots.map((slot) => slot.fitting).filter(Boolean);
        const score = new Map(ranked.map((c) => [c.fitting, c.score]));
        const result = lit.filter((fitting) => score.has(fitting));
        for (const fitting of chosen) {
            if (result.includes(fitting)) continue;
            if (result.length < slots.length) {
                result.push(fitting);
                continue;
            }
            // Full: take the place of the weakest kept one only if clearly brighter.
            let worst = -1;
            for (let i = 0; i < result.length; i++) if (worst < 0 || score.get(result[i]) < score.get(result[worst])) worst = i;
            if (worst >= 0 && score.get(fitting) > score.get(result[worst]) * HOLD) result[worst] = fitting;
        }
        return result.slice(0, slots.length);
    }

    /**
     * Give each fitting (`{ fitting, share }`: its share of its light) a
     * light — one it already has if it has one — and darken the rest.
     */
    fill(slots, wanted) {
        const fittings = wanted.map((w) => w.fitting);
        // Dark ones first: one still fading out goes on fading if it can.
        const free = slots.filter((slot) => !fittings.includes(slot.fitting)).sort((a, b) => a.level - b.level);
        for (const slot of slots) {
            if (fittings.includes(slot.fitting)) continue;
            // (The one it fades out from, for whoever adds up what is lit: World/RoomBakeLight.js.)
            if (slot.fitting) slot.gone = slot.fitting;
            slot.fitting = null;
        }
        for (const { fitting, share } of wanted) {
            const held = slots.find((slot) => slot.fitting === fitting);
            if (held) {
                held.target = this.power(fitting, share);
                continue;
            }
            const slot = free.shift();
            if (!slot) break;
            this.place(slot, fitting, share);
        }
    }

    /**
     * The fittings found again (an edit in the editor gathers them anew):
     * each light keeps its fitting, the same one by its id — moved, if it
     * was — without fading out and in again; one whose fitting is gone fades.
     */
    rebind() {
        const byId = new Map();
        for (const entry of this.switches.entries) for (const fitting of entry.lights) byId.set(fitting.id, fitting);
        for (const slot of this.slots) {
            if (!slot.fitting) continue;
            const next = byId.get(slot.fitting.id);
            if (!next) {
                slot.fitting = null;
            } else if (next !== slot.fitting) {
                const moved = !samePlace(slot.fitting, next);
                slot.fitting = next;
                if (moved) this.aim(slot, next);
            }
        }
    }

    /** A light on a fitting: where it hangs, its colour, its power — W over 4π, as the bake has it — or a share of it. */
    place(slot, fitting, share = 1) {
        slot.fitting = fitting;
        slot.gone = null;
        slot.level = 0;
        slot.target = this.power(fitting, share);
        this.aim(slot, fitting, true);
    }

    /** A light's intensity for a fitting: W over 4π, as the bake has it — a share of it, and half a wall light's tube's. */
    power(fitting, share = 1) {
        if (this.whole) return (fitting.power * share) / (4 * Math.PI);
        return (fitting.power * share * (this.wallTube(fitting) ? TUBE.share : 1)) / (4 * Math.PI);
    }

    /** Whether a fitting is a wall light's tube: a lamp with long glass, by a wall. */
    wallTube(fitting) {
        if (fitting.kind !== "lamp" || !((fitting.radius ?? 0) > TUBE.radius)) return false;
        const [x, , z] = fitting.position;
        const [ox, oz] = this.offWalls(x, z, fitting.room, OFF_WALL);
        return Math.hypot(ox - x, oz - z) > 1e-3;
    }

    /** A light put where its fitting hangs, its colour, its beam; its shadow drawn again (at once for a new fitting). */
    aim(slot, fitting, now = false) {
        const { light } = slot;
        light.color.set(fitting.color);
        if (this.whole) {
            // The bake's lamp, where it hung — its glass and bulbs, which block none of its light there, cast nothing here
            // (World/LiveRoom.js's casters) — its shadow as soft as the lamp is big: its radius, in metres, negative, for
            // the rooms' shaders to filter by (World/RoomBakeLight.js's SOFT_LAMP_GLSL).
            light.position.set(...fitting.position);
            light.shadow.radius = -(fitting.size ?? 0.03);
            if (slot.shadowed) this.requestShadow(slot, now);
            return;
        }
        let [x, y, z] = fitting.position;
        // How far its glass reaches below the light — a lamp's capped: a
        // wall light's diffuser runs the length of its tube, and a light
        // that far below it would sit in whatever stands under it.
        let below = fitting.kind === "lamp" ? Math.min(fitting.radius ?? 0.03, 0.05) : fitting.radius ?? 0.03;
        if (this.wallTube(fitting)) {
            // From the tube itself, well off the wall.
            [x, z] = this.offWalls(x, z, fitting.room, TUBE.offWall);
            below = -0.04;
        } else if (fitting.kind === "lamp") {
            // A lamp's a little way off its room's walls, or the wall by it burns.
            [x, z] = this.offWalls(x, z, fitting.room, OFF_WALL);
        }
        // A little under the glass, shining down.
        light.position.set(x, y - below - 0.02, z);
        light.target.position.set(x, y - 3, z);
        light.target.updateMatrixWorld();
        const beam = fitting.style === "recessed" ? BEAM.recessed : BEAM.other;
        light.angle = beam.angle;
        light.penumbra = beam.penumbra;
        if (slot.shadowed) this.requestShadow(slot, now);
        // As far as the room reaches.
        else light.distance = this.roomReach(fitting.room);
    }

    /** (x, z) moved into its room, if need be, to stand `clear` from every edge of it. */
    offWalls(x, z, roomId, clear = OFF_WALL) {
        const room = this.builder.spec.rooms.find((r) => r.id === roomId);
        if (!room) return [x, z];
        const polygon = room.polygon;
        for (let pass = 0; pass < 2; pass++) {
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const [ax, az] = polygon[j];
                const [bx, bz] = polygon[i];
                const dx = bx - ax;
                const dz = bz - az;
                const length = Math.hypot(dx, dz);
                if (length < 1e-6) continue;
                const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (length * length), 0, 1);
                const px = ax + t * dx;
                const pz = az + t * dz;
                const gap = Math.hypot(x - px, z - pz);
                if (gap >= clear || t <= 0 || t >= 1) continue;
                // Away from the edge, into the room: its inward normal.
                let nx = -dz / length;
                let nz = dx / length;
                const inside = (qx, qz) => pointInside(qx, qz, polygon);
                if (!inside(px + nx * 0.05, pz + nz * 0.05)) [nx, nz] = [-nx, -nz];
                x = px + nx * clear;
                z = pz + nz * clear;
            }
        }
        return [x, z];
    }

    /** About as far as a room's furthest corner from its middle. */
    roomReach(roomId) {
        const room = this.builder.spec.rooms.find((r) => r.id === roomId);
        if (!room) return 4;
        const xs = room.polygon.map((p) => p[0]);
        const zs = room.polygon.map((p) => p[1]);
        return THREE.MathUtils.clamp(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.75, 3, 8);
    }

    requestShadow(slot, now = false) {
        if (now) {
            slot.light.shadow.needsUpdate = true;
            slot.cooldown = SHADOW_EVERY;
            this.flagRenderer();
            return;
        }
        if (!this.queue.includes(slot)) this.queue.push(slot);
    }

    /** Every light's shadow again (an edit in the editor moved something). */
    redrawAll() {
        for (const slot of this.slots) if (slot.shadowed && slot.fitting) this.requestShadow(slot);
        this.key = null;
    }

    /** A light's shadow again where something near it moved: at most one a frame, each at most so often. */
    redrawShadows(moved) {
        if (moved.length) {
            for (const slot of this.slots) {
                if (!slot.shadowed || !slot.fitting) continue;
                if (moved.some((point) => point.distanceTo(slot.light.position) < MOTION_REACH)) this.requestShadow(slot);
            }
        }
        const index = this.queue.findIndex((slot) => slot.cooldown <= 0);
        if (index < 0) return;
        const [slot] = this.queue.splice(index, 1);
        if (slot.fitting) this.requestShadow(slot, true);
    }

    /** Where the slider's step draws shadows only now and then (Realism.js), this frame too. */
    flagRenderer() {
        const shadowMap = this.renderer.renderer.shadowMap;
        if (!shadowMap.autoUpdate) shadowMap.needsUpdate = true;
    }

    /** Where whatever moves has moved since the last frame. */
    moved() {
        const moved = [];
        for (const entry of this.movers()) {
            const { object } = entry;
            object.updateWorldMatrix(true, false);
            const now = object.matrixWorld.elements;
            // Something hidden casts nothing wherever it goes; shown or hidden, it counts.
            if (entry.last && entry.visible === object.visible && (!object.visible || still(entry.last, now))) continue;
            entry.last = now.slice();
            entry.visible = object.visible;
            moved.push(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld));
        }
        return moved;
    }

    /**
     * What moves and casts a shadow: door leaves, furniture's doors and
     * drawers, cars, other people, and the visitor — whose shadow would
     * otherwise stay where it was drawn (hidden, in the first person or in
     * the car, it is tracked still, for its going to count).
     */
    movers() {
        const objects = [];
        const own = this.world.player?.avatar?.avatar;
        if (own) objects.push(own);
        for (const door of this.builder.doors || []) for (const { leaf } of door.leaves) objects.push(leaf);
        for (const part of this.builder.openables?.parts || []) objects.push(part.node);
        for (const car of this.builder.cars || []) objects.push(car.group);
        for (const other of Object.values(this.world.player?.otherPlayers || {})) if (other.model?.avatar) objects.push(other.model.avatar);
        // Over a bake, the people round the property too, as they come, go or walk (not as they breathe: their figure's
        // root stands still) — the lamps' light is the room's own there, and nothing else shades it.
        if (this.whole) for (const person of this.world.people?.list ?? []) objects.push(person.group);
        const seen = new Set(objects);
        for (const object of this.tracked.keys()) if (!seen.has(object)) this.tracked.delete(object);
        return objects.map((object) => {
            if (!this.tracked.has(object)) this.tracked.set(object, { object, last: null, visible: object.visible });
            return this.tracked.get(object);
        });
    }

    removeLights() {
        for (const { light } of this.slots ?? []) {
            this.scene.remove(light);
            if (light.target) this.scene.remove(light.target);
            light.dispose();
        }
        this.slots = [];
        this.queue = [];
    }

    dispose() {
        this.stopQuality?.();
        this.world.off?.("scene-edited", this.onEdited);
        this.removeLights();
    }
}

/** Whether a door is not shut: open at all, or on its way. */
function ajar(door) {
    return door.open > 0.001 || door.target > 0.5;
}

/** Whether a fitting `dy` above (or below) the visitor's feet lights them: over their feet; for the editor's view, within a storey either way. */
function within(dy, feet) {
    return feet ? dy > -0.3 && dy < 4 : Math.abs(dy) < 4;
}

/**
 * Whether a matrix is as it was, give or take a visitor settling where
 * they stand (STILL) — what they drift by adds up, since `last` is kept
 * until it is passed.
 */
function still(last, now) {
    for (let i = 0; i < 16; i++) {
        const limit = i >= 12 && i <= 14 ? STILL.move : STILL.turn;
        if (Math.abs(last[i] - now[i]) > limit) return false;
    }
    return true;
}

/** Whether (x, z) is inside a polygon of [x, z] points. */
function pointInside(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

/** Whether a fitting found again hangs where it did, as it did. */
function samePlace(a, b) {
    return (
        a.position.every((value, i) => Math.abs(value - b.position[i]) < 1e-4) &&
        a.color === b.color &&
        a.power === b.power &&
        a.style === b.style &&
        a.kind === b.kind &&
        a.room === b.room &&
        a.radius === b.radius
    );
}


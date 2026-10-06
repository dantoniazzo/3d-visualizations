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
 * A light's shadow is drawn again only when it is handed to another
 * fitting, or when something near it moves — a door, a drawer, a car,
 * anyone, the visitor too — at most one a frame, each at most ten times a
 * second.
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

const _here = new THREE.Vector3();
const _at = new THREE.Vector3();

export default class LampPool {
    /**
     * @param {World} world  drawing a view lit live
     * @param {LiveSwitches} switches  its switches
     */
    constructor(world, switches) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.renderer = this.experience.renderer;
        this.world = world;
        this.builder = world.sceneBuilder;
        this.switches = switches;
        this.key = null;
        this.timer = 0;
        this.tracked = new Map();
        this.queue = [];
        this.build(QUALITY.lamps);
        this.onEdited = () => this.redrawAll();
        world.on?.("scene-edited", this.onEdited);
        // The slider: as many lights as its step asks for.
        this.stopQuality = onQualityChange((quality) => this.applyQuality(quality));
    }

    /** Whether every light has faded to where it is going. */
    get settled() {
        return this.slots.every((slot) => Math.abs(slot.level - (slot.fitting ? slot.target : 0)) <= 1e-6 * Math.max(1, slot.target));
    }

    /** The lights, as many of each as the step asks for. */
    build(budget = { shadowed: 0, unshadowed: 0, size: 512 }) {
        this.budget = { ...budget };
        this.slots = [];
        for (let k = 0; k < budget.shadowed; k++) {
            const light = new THREE.SpotLight(0xffffff, 0, SHADOW_REACH, BEAM.other.angle, BEAM.other.penumbra, 2);
            light.name = `lamp-pool:shadowed:${k}`;
            light.castShadow = true;
            light.shadow.mapSize.set(budget.size, budget.size);
            light.shadow.camera.near = 0.05;
            light.shadow.camera.far = SHADOW_REACH;
            light.shadow.bias = -0.0006;
            light.shadow.normalBias = 0.02;
            light.shadow.autoUpdate = false;
            this.scene.add(light, light.target);
            this.slots.push({ light, shadowed: true, fitting: null, level: 0, target: 0, cooldown: 0 });
        }
        for (let k = 0; k < budget.unshadowed; k++) {
            const light = new THREE.SpotLight(0xffffff, 0, 6, BEAM.other.angle, BEAM.other.penumbra, 2);
            light.name = `lamp-pool:unshadowed:${k}`;
            this.scene.add(light, light.target);
            this.slots.push({ light, shadowed: false, fitting: null, level: 0, target: 0, cooldown: 0 });
        }
        this.key = null;
    }

    /** The slider has moved: as many lights as its step asks for (shaders are built again once). */
    applyQuality(quality) {
        const next = quality.lamps;
        if (!next || (next.shadowed === this.budget.shadowed && next.unshadowed === this.budget.unshadowed && next.size === this.budget.size)) return;
        this.removeLights();
        this.build(next);
    }

    update(delta) {
        this.timer -= delta;
        const where = this.where();
        const key = `${where.room ?? ""}|${where.level ?? ""}|${this.switches.version}`;
        if (key !== this.key || this.timer <= 0) {
            this.key = key;
            this.timer = REASSIGN;
            this.assign(where);
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
        this.redrawShadows(this.moved());
    }

    /**
     * Where the visitor is: the room they stand in (or drive through), the
     * editor's camera, or — looking down on a floor from above — that floor
     * and the point looked at.
     */
    where() {
        const world = this.world;
        const bird = world.birdView;
        if (bird?.active) return { room: null, level: bird.level, point: _here.copy(bird.target) };
        const editor = world.editor;
        if (editor?.active) {
            // What is being worked on: where the view looks (its camera hangs high over it).
            if (editor.view?.target) _here.copy(editor.view.target);
            else _here.copy(this.experience.camera.activeCamera.position);
            const room = this.builder.roomAt(_here.x, _here.y + 0.05, _here.z) ?? this.builder.roomAt(_here.x, _here.y - 1.2, _here.z);
            return { room: room?.id ?? null, level: null, point: _here, feet: false };
        }
        const player = world.player;
        if (player?.inVehicle && player.currentCar) _here.copy(player.currentCar.group.position);
        else if (player?.player?.collider) _here.copy(player.player.collider.start);
        else _here.copy(this.experience.camera.activeCamera.position);
        const room = this.builder.roomAt(_here.x, _here.y, _here.z);
        return { room: room?.id ?? null, level: null, point: _here, feet: true };
    }

    /** Hand the lights to the fittings that are on nearest the visitor. */
    assign({ room, level, point, feet = true }) {
        this.rebind();
        const weights = this.switches.weights;
        // Indoors, the lights whose light comes through to this room; out
        // on a path, a terrace or the lawn, any lit nearby on this storey.
        const inside = room !== null && this.switches.indoor?.has(room);
        const own = [];
        const near = [];
        this.switches.entries.forEach((entry, index) => {
            if (!(weights[index] > 0)) return;
            const item = this.switches.list[index];
            for (const fitting of entry.lights) {
                const distance = point.distanceTo(_at.set(...fitting.position));
                // How much of its light reaches the visitor: the room's main light before a bedside lamp.
                const score = fitting.power / (1 + distance * distance);
                if (level !== null) {
                    if (item.level === level) near.push({ fitting, distance, score });
                } else if (room && fitting.room === room) {
                    own.push({ fitting, distance, score });
                } else if (inside ? entry.zones.includes(room) : distance < SHADOW_REACH && within(fitting.position[1] - point.y, feet)) {
                    // (Out of doors, what hangs over the visitor's feet: not
                    // the ceiling light of the room under the deck they stand on.)
                    near.push({ fitting, distance, score });
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
        for (const slot of slots) if (!fittings.includes(slot.fitting)) slot.fitting = null;
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
        slot.level = 0;
        slot.target = this.power(fitting, share);
        this.aim(slot, fitting, true);
    }

    /** A light's intensity for a fitting: W over 4π, as the bake has it — a share of it, and half a wall light's tube's. */
    power(fitting, share = 1) {
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


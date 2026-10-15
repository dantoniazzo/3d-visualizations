import * as THREE from "three";

import Experience from "../Experience.js";
import { LAMP_SHADOW_SIZE, LIVE_LAMPS } from "../Utils/device.js";

/**
 * The lamps of a public view lit live (Utils/device.js's lightingMode): the
 * lamps that are on nearest the visitor, drawn as live lights with shadows
 * of their own — a door swinging shut cuts off the hall light, a visitor
 * walking past a lamp throws a shadow — on top of what they bounce, from
 * the bake (SceneBuilder's setLiveSwitches).
 *
 * A few lights (LIVE_LAMPS) are made once and handed from lamp to lamp as
 * the visitor goes from room to room or turns switches on and off, so the
 * scene always has as many lights and shaders never have to be built
 * again. They go to the switches that are on whose light reaches the room
 * the visitor is in, nearest first, a switch at a time: all of its lamps
 * or none. A switch that gets none is drawn from the bake, all of its
 * light, as a view drawn from the bake draws it.
 *
 * Each is as the bake lit it (the switch's `lights`): where it hangs, its
 * colour, and its power in watts, over 4π as a PointLight takes it.
 *
 * A lamp's shadow is drawn again only when it moves to another lamp, or
 * when something near it moves — a door, a person, the car: six renders of
 * everything round it, not every frame. So is the sun's, of the whole house:
 * when something moves or the view has moved on, and otherwise a few times
 * a second, for the trees swaying in the wind. (Moves: by more than a
 * visitor settles where they stand, which drew it every frame.)
 *
 * From above (the bird's-eye view) none of it is live: the lamps are out
 * and no shadow is drawn again until the view is left (hold).
 */

/** How far a lamp's shadow reaches, in metres: past this, nothing is drawn into it. */
const SHADOW_REACH = 16;
/** Something moving further than this from a lamp does not draw its shadow again. */
const MOTION_REACH = 12;
/** How often, in seconds, the lamps are handed round again at the latest. */
const REASSIGN = 0.5;
/** How often, in seconds, the sun's shadow is drawn again when nothing has moved. */
const SUN_REDRAW = 0.1;
/** Less movement than this, in metres (or, turned, in a matrix's units), is none: a visitor standing still settles by less. */
const STILL = { move: 0.01, turn: 0.002 };
/**
 * The sun's shadow is drawn again once the view has moved this far, in
 * metres, whatever else has: a site's own trees (World/Flora) are in it —
 * the bake has none of their shade — whole near the view and lighter
 * further off, so what casts changes as the visitor walks.
 */
const SUN_MOVE = 1;

const _position = new THREE.Vector3();
const _here = new THREE.Vector3();

/** Whether an object is drawn: it and everything it is under — the people's root, hidden as scenery, hides them all. */
function shown(object) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
}

export default class LiveLamps {
    /**
     * @param {World} world  drawing a public view lit live, with its switches
     * @param {object} [options]
     * @param {number} [options.lamps]  how many lamps to light live: none,
     *        drawn from the bake as a computer is given it, where this only
     *        draws the sun's shadow of what moves again as it moves
     * @param {boolean} [options.sway]  whether the sun's shadow has trees in
     *        it, swaying, to draw again now and then as well
     */
    constructor(world, { lamps = LIVE_LAMPS, sway = true } = {}) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.world = world;
        this.builder = world.sceneBuilder;
        this.switches = world.switches ?? null;
        this.entries = this.builder.switches ?? [];
        this.sun = world.environment.sun;
        this.sun.shadow.autoUpdate = false;
        this.sun.shadow.needsUpdate = true;
        this.sunTimer = 0;
        this.sunRedraw = sway ? SUN_REDRAW : Infinity;
        /** Where the view was when the sun's shadow was last drawn. */
        this.sunFrom = new THREE.Vector3(Infinity, 0, 0);

        this.pool = Array.from({ length: lamps }, (_, k) => {
            const light = new THREE.PointLight(0xffffff, 0, 0, 2);
            light.name = `live-lamp:${k}`;
            light.castShadow = true;
            light.shadow.mapSize.set(LAMP_SHADOW_SIZE, LAMP_SHADOW_SIZE);
            light.shadow.camera.near = 0.05;
            light.shadow.camera.far = SHADOW_REACH;
            // As a share of the shadow's reach: a centimetre or so.
            light.shadow.bias = -0.001;
            light.shadow.normalBias = 0.02;
            light.shadow.autoUpdate = false;
            this.scene.add(light);
            return { light, fitting: null };
        });

        this.key = null;
        this.timer = 0;
        this.tracked = null;
        this.held = false;
    }

    /**
     * From above (World.lightFromAbove), nothing live: every lamp out — its
     * switch's light all from the bake again (SceneBuilder.setLiveSwitches)
     * — and no shadow drawn again, the sun's or a lamp's, whatever moves.
     * Let go, the lamps are handed round again at once and the sun's shadow
     * drawn again, as the walkthrough has them.
     */
    hold(held) {
        this.held = Boolean(held);
        if (this.held) {
            for (const slot of this.pool) {
                slot.fitting = null;
                slot.light.intensity = 0;
            }
            if (this.pool.length) this.builder.setLiveSwitches(this.entries.map(() => false));
        } else {
            this.key = null;
            this.timer = 0;
            this.sunTimer = 0;
        }
    }

    update(delta) {
        if (this.held) return;
        this.timer -= delta;
        const where = this.where();
        const key = `${where.zone ?? ""}|${this.builder.switchWeights.join("")}`;
        if (key !== this.key || this.timer <= 0) {
            this.key = key;
            this.timer = REASSIGN;
            this.assign(where);
        }
        const moved = this.moved();
        this.redrawShadows(moved);
        this.sunTimer -= delta;
        const eye = this.experience.camera.activeCamera.position;
        if (moved.length || this.sunTimer <= 0 || !(eye.distanceToSquared(this.sunFrom) < SUN_MOVE * SUN_MOVE)) {
            this.sun.shadow.needsUpdate = true;
            this.sunTimer = this.sunRedraw;
            this.sunFrom.copy(eye);
        }
    }

    /** Where the visitor is: the room they stand in (or drive through). */
    where() {
        const player = this.world.player;
        if (player?.inVehicle && player.currentCar) _here.copy(player.currentCar.group.position);
        else if (player?.player?.collider) _here.copy(player.player.collider.start);
        const room = this.builder.roomAt(_here.x, _here.y, _here.z);
        return { zone: room?.id ?? null, point: _here };
    }

    /** Hand the lights to the lamps that are on nearest the visitor. */
    assign({ zone, point }) {
        const weights = this.builder.switchWeights;
        const candidates = [];
        this.entries.forEach((entry, index) => {
            if (!(weights[index] > 0) || !entry.lights?.length || !entry.indirect) return;
            // Its light does not reach the room the visitor is in.
            if (!zone || !entry.layers?.[zone] || !this.switches) return;
            const distance = Math.min(...entry.lights.map((fitting) => point.distanceTo(_position.set(...fitting.position))));
            candidates.push({ index, entry, distance });
        });
        candidates.sort((a, b) => a.distance - b.distance);

        const live = this.entries.map(() => false);
        const fittings = [];
        for (const { index, entry } of candidates) {
            if (fittings.length + entry.lights.length > this.pool.length) continue;
            live[index] = true;
            fittings.push(...entry.lights);
        }

        this.pool.forEach((slot, k) => {
            const fitting = fittings[k] ?? null;
            if (fitting === slot.fitting) return;
            slot.fitting = fitting;
            const { light } = slot;
            if (fitting) {
                light.position.set(...fitting.position);
                light.color.set(fitting.color);
                light.intensity = fitting.power / (4 * Math.PI);
                light.shadow.needsUpdate = true;
            } else {
                light.intensity = 0;
            }
        });
        this.builder.setLiveSwitches(live);
    }

    /**
     * Draw a lamp's shadow again where something near it has moved since
     * the last frame: the doors' leaves, the people, the cars.
     */
    redrawShadows(moved) {
        if (!moved.length) return;
        for (const { light, fitting } of this.pool) {
            if (!fitting || light.shadow.needsUpdate) continue;
            if (moved.some((point) => point.distanceTo(light.position) < MOTION_REACH)) light.shadow.needsUpdate = true;
        }
    }

    /** Where whatever moves has moved since the last frame. */
    moved() {
        const objects = this.movers();
        const moved = [];
        for (const entry of objects) {
            const { object } = entry;
            object.updateWorldMatrix(true, false);
            const now = object.matrixWorld.elements;
            const visible = shown(object);
            // Something hidden casts nothing wherever it goes; shown or
            // hidden, it counts. And a visitor standing still settles where
            // they stand, a hair every frame — which drew the sun's shadow
            // again every frame, with nothing moving.
            if (entry.last && entry.visible === visible && (!visible || still(entry.last, now))) continue;
            entry.last = now.slice();
            entry.visible = visible;
            moved.push(object.getWorldPosition(new THREE.Vector3()));
        }
        return moved;
    }

    /**
     * What moves and casts a shadow: door leaves, furniture's doors and
     * drawers, the visitors, the people round the property (World/People.js:
     * each as it comes, goes or is hidden — not as it breathes, which would
     * draw every shadow near it again every frame), cars.
     */
    movers() {
        const objects = [];
        for (const door of this.builder.doors || []) for (const { leaf } of door.leaves) objects.push(leaf);
        for (const part of this.builder.openables?.parts || []) objects.push(part.node);
        for (const car of this.builder.cars || []) objects.push(car.group);
        const player = this.world.player;
        if (player?.avatar) objects.push(player.avatar.avatar);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) objects.push(other.model.avatar);
        const people = this.world.people?.list ?? [];
        for (const person of people) objects.push(person.group);
        // Kept from frame to frame, so each knows where it was — and only
        // while it is there: a person built again is a new group.
        this.tracked ??= new Map();
        if (this.tracked.size > objects.length + 64) {
            const now = new Set(objects);
            for (const object of this.tracked.keys()) if (!now.has(object)) this.tracked.delete(object);
        }
        return objects.map((object) => {
            if (!this.tracked.has(object)) this.tracked.set(object, { object, last: null, visible: shown(object) });
            return this.tracked.get(object);
        });
    }

    dispose() {
        for (const { light } of this.pool) {
            this.scene.remove(light);
            light.dispose();
        }
    }
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

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
 * the visitor is in — or, from above, the floor that is shown — nearest
 * first, a switch at a time: all of its lamps or none. A switch that gets
 * none is drawn from the bake, all of its light, as a phone draws it.
 *
 * Each is as the bake lit it (the switch's `lights`): where it hangs, its
 * colour, and its power in watts, over 4π as a PointLight takes it.
 *
 * A lamp's shadow is drawn again only when it moves to another lamp, or
 * when something near it moves — a door, a person, the car: six renders of
 * everything round it, not every frame. So is the sun's, of the whole house:
 * when something moves, and otherwise a few times a second, for the trees
 * swaying in the wind.
 */

/** How far a lamp's shadow reaches, in metres: past this, nothing is drawn into it. */
const SHADOW_REACH = 16;
/** Something moving further than this from a lamp does not draw its shadow again. */
const MOTION_REACH = 12;
/** How often, in seconds, the lamps are handed round again at the latest. */
const REASSIGN = 0.5;
/** How often, in seconds, the sun's shadow is drawn again when nothing has moved. */
const SUN_REDRAW = 0.1;

const _position = new THREE.Vector3();
const _here = new THREE.Vector3();

export default class LiveLamps {
    /**
     * @param {World} world  drawing a public view lit live, with its switches
     * @param {object} [options]
     * @param {number} [options.lamps]  how many lamps to light live: none,
     *        drawn from the bake on a phone, where this only draws the sun's
     *        shadow of what moves again as it moves
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
    }

    update(delta) {
        this.timer -= delta;
        const where = this.where();
        const key = `${where.zone ?? ""}|${where.level ?? ""}|${this.builder.switchWeights.join("")}`;
        if (key !== this.key || this.timer <= 0) {
            this.key = key;
            this.timer = REASSIGN;
            this.assign(where);
        }
        const moved = this.moved();
        this.redrawShadows(moved);
        this.sunTimer -= delta;
        if (moved.length || this.sunTimer <= 0) {
            this.sun.shadow.needsUpdate = true;
            this.sunTimer = this.sunRedraw;
        }
    }

    /**
     * Where the visitor is: the room they stand in (or drive through), or
     * — looking down on a floor from above — that floor, and the point
     * looked at.
     */
    where() {
        const bird = this.world.birdView;
        if (bird?.active) return { zone: null, level: bird.level, point: _here.copy(bird.target) };
        const player = this.world.player;
        if (player?.inVehicle && player.currentCar) _here.copy(player.currentCar.group.position);
        else if (player?.player?.collider) _here.copy(player.player.collider.start);
        const room = this.builder.roomAt(_here.x, _here.y, _here.z);
        return { zone: room?.id ?? null, level: null, point: _here };
    }

    /** Hand the lights to the lamps that are on nearest the visitor. */
    assign({ zone, level, point }) {
        const weights = this.builder.switchWeights;
        const candidates = [];
        this.entries.forEach((entry, index) => {
            if (!(weights[index] > 0) || !entry.lights?.length || !entry.indirect) return;
            if (level !== null) {
                if (this.switches?.list[index]?.level !== level) return;
            } else if (!zone || !entry.layers?.[zone] || !this.switches) {
                // Its light does not reach the room the visitor is in.
                return;
            }
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
            if (entry.last && entry.visible === object.visible && entry.last.every((value, i) => value === now[i])) continue;
            entry.last = now.slice();
            entry.visible = object.visible;
            moved.push(object.getWorldPosition(new THREE.Vector3()));
        }
        return moved;
    }

    /** What moves and casts a shadow: door leaves, furniture's doors and drawers, people, cars. */
    movers() {
        const objects = [];
        for (const door of this.builder.doors || []) for (const { leaf } of door.leaves) objects.push(leaf);
        for (const part of this.builder.openables?.parts || []) objects.push(part.node);
        for (const car of this.builder.cars || []) objects.push(car.group);
        const player = this.world.player;
        if (player?.avatar) objects.push(player.avatar.avatar);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) objects.push(other.model.avatar);
        // Kept from frame to frame, so each knows where it was.
        this.tracked ??= new Map();
        return objects.map((object) => {
            if (!this.tracked.has(object)) this.tracked.set(object, { object, last: null, visible: object.visible });
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

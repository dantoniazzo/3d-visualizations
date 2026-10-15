import * as THREE from "three";

import Experience from "../Experience.js";
import { FINISHES } from "../../../shared/catalog.js";
import { pointInPolygon } from "../../../shared/vegetation.js";
import { edgeDistance, openPairs } from "../../../shared/roomGraph.js";

/**
 * The rooms whose lights are on, glowing — in a view lit live (the editor,
 * its walkthrough, a version published without its light baked): the warm
 * light a room's lamps throw round it and bounce off its walls, on every
 * surface in it — so a lit room reads as lit from the next room, from the
 * garden and from the far end of the street, where no live light reaches
 * (World/LampPool.js lights only the few nearest). Room by room, as the
 * switches are (World/LiveSwitches.js); a room that is off is as it was.
 *
 * Without a material for each room — the house's are one per finish,
 * shared by every room, and merged — each surface finds its room itself, in
 * its shader: a map of the plan holds, for every few centimetres, which
 * rooms (up to four, one above another) are there; a table holds each
 * room's floor and ceiling heights and how lit it is. A surface looks a
 * little way out of its own face — into the room it faces, so a wall's
 * outside finds none — and glows with that room, its colour warmed. Turning
 * a switch changes one number in the table: nothing is built again.
 *
 * The same map keeps the short-reaching live lights that have no shadow of
 * their own (World/LampPool.js's unshadowed lights, the garden's) where they are: a
 * light in a room lights a surface only if the surface is in that room, or
 * in one open to it with no wall between (a hall and the living room it
 * runs into) — not the next room through the wall, the flat upstairs or the
 * terrace outside; a light out of doors lights only what is out of doors.
 *
 * Under the editor's plain light (World/PlainLight.js) none of it is drawn:
 * not at nothing, which would still cost every pixel the lookups, but out of
 * the shaders (setShown) — each material's shader then being the one it had
 * before it was made to glow.
 *
 * With `shares` (a room of a baked view drawn as a view lit live draws it,
 * World/LiveRoom.js — and nowhere else), the same lookup also says, at
 * night (`roomShareNight`), what light that is not its lamps' each room has
 * — the bake's measure of it, red, green and blue (setShares): in a second
 * row of the table, how much of the sky's share its reflections keep; in
 * six more, the light itself from each of the six ways (up, down and each
 * way round, as the bake's light probes hold it). A surface's light that is
 * not a lamp's — the sky's share, the ambient light, the scene's own
 * environment on what has no map of its own (a door's leaf) — is then the
 * room's six ways' light on a surface facing as it does, and its
 * reflections of the sky its room's share of them; but only as far as the
 * room's lamps are off (its glow, row 0: on, all of it, it is lit as the
 * unbaked view lights it — the editor's room, by the user's word). What it
 * takes of a room probe is left whole, the probe being the room's light as
 * it was drawn. By day none of it is in the drawing (the shaders' sums as
 * they were); and the shaders of every other glow are as they were.
 */

/** The map's resolution, in metres. */
const TEXEL = 0.05;
/** How far a surface looks out of its face for its room, in metres. */
const REACH = 0.15;
/** How far each room is grown on the map, so a wall's face finds the room it faces. */
const GROW = 0.06;
/**
 * How far into its outside walls a room is taken to reach where no other
 * room does: a window's reveals, sill and glass are the room's, while the
 * wall's outside face, further out, is not.
 */
const FILL = 0.2;
/** Lamplight, a little under 3000 K. */
const WARM = new THREE.Color("#ffc58a");
/** How strongly a lit room glows, as a share of each surface's own colour: by day, and at night. */
const STRENGTH = { day: 0.16, night: 0.4 };
/** How long a room takes to light up or go dark, in seconds. */
const FADE = 0.25;
/**
 * The lights kept where they hang are those reaching no further than this,
 * in metres: a room's (LampPool's reach a room's size, a cabinet's
 * light), the garden's — not a car's headlamps, whose beam runs out
 * through a garage's doorway and down the drive.
 */
const KEPT_REACH = 12;

export default class RoomGlow {
    /**
     * @param {World} world  drawing a view lit live
     * @param {LiveSwitches} switches  its switches
     * @param {object} [options]
     * @param {THREE.Object3D} [options.root]  what is made to glow, in place of the whole scene: a room of a view drawn from its bake that is drawn as a view lit live draws it (World/LiveRoom.js)
     * @param {boolean} [options.deferred]  its map of the plan not laid out here: whoever makes it steps through `steps(spec)` — a room a step, a sixth of a second in all on a site of ninety rooms — and then calls `finish()`
     * @param {boolean} [options.shares]  each room's share of the light that is not its lamps' too (setShares), in its shaders
     */
    constructor(world, switches, { root = null, deferred = false, shares = false } = {}) {
        this.experience = new Experience();
        this.scene = root ?? this.experience.scene;
        this.world = world;
        this.switches = switches;
        this.sharing = Boolean(shares);
        /** Sharing: the room whose lamps what faces no room is lit as far as (update) — the visitor's own (World/LiveRoom.js). */
        this.outsideRoom = null;
        this.patched = new WeakSet();
        this.skipped = new WeakSet();
        /** Its own hooks: a copy of a material made to glow carries one already. */
        this.hooks = new WeakSet();
        /** Whether the glow is in the shaders (setShown): read by every material's hook as its shader is built. */
        this.shown = { on: true };
        if (deferred) return;
        this.build(world.sceneBuilder.spec);
        this.finish();
    }

    /** Once its map is laid out (build, or every step of `steps`): what its shaders read, and everything in its root made to glow. */
    finish() {
        this.uniforms = {
            roomGlowMap: { value: this.map },
            roomGlowTable: { value: this.table },
            roomGlowArea: { value: this.area },
            roomGlowColour: { value: WARM.clone().multiplyScalar(STRENGTH.day) },
            // (What a surface that faces no room takes, and whether the rooms' own measure is drawn at all — at night: setShares.)
            ...(this.sharing && { roomShareOut: { value: new THREE.Vector3(1, 1, 1) }, roomShareOutGlow: { value: 0 }, roomShareNight: { value: 0 } }),
        };
        this.version = -1;
        this.applyTo(this.scene);
    }

    /** The map of the plan and the table of the rooms. */
    build(spec) {
        const steps = this.steps(spec);
        while (!steps.next().done);
    }

    /** That (build), a room at a time: each `next()` lays one room out on the map; done, the map and the table are there. */
    *steps(spec) {
        this.key = roomsKey(spec);
        const rooms = spec.rooms.filter((room) => room.ceiling_finish !== "none" && FINISHES[room.floor_finish]?.kind !== "ground");
        this.rooms = rooms;
        this.index = new Map(rooms.map((room, i) => [room.id, i]));
        let x0 = Infinity;
        let z0 = Infinity;
        let x1 = -Infinity;
        let z1 = -Infinity;
        for (const room of rooms) {
            for (const [x, z] of room.polygon) {
                x0 = Math.min(x0, x);
                z0 = Math.min(z0, z);
                x1 = Math.max(x1, x);
                z1 = Math.max(z1, z);
            }
        }
        if (!rooms.length) [x0, z0, x1, z1] = [0, 0, 1, 1];
        x0 -= FILL + TEXEL;
        z0 -= FILL + TEXEL;
        x1 += FILL + TEXEL;
        z1 += FILL + TEXEL;
        const width = Math.ceil((x1 - x0) / TEXEL);
        const height = Math.ceil((z1 - z0) / TEXEL);
        const data = new Uint8Array(width * height * 4);
        for (let i = 0; i < rooms.length; i++) {
            const room = rooms[i];
            const id = i + 1;
            const xs = room.polygon.map((p) => p[0]);
            const zs = room.polygon.map((p) => p[1]);
            const c0 = Math.max(0, Math.floor((Math.min(...xs) - GROW - x0) / TEXEL));
            const c1 = Math.min(width - 1, Math.ceil((Math.max(...xs) + GROW - x0) / TEXEL));
            const r0 = Math.max(0, Math.floor((Math.min(...zs) - GROW - z0) / TEXEL));
            const r1 = Math.min(height - 1, Math.ceil((Math.max(...zs) + GROW - z0) / TEXEL));
            for (let r = r0; r <= r1; r++) {
                const z = z0 + (r + 0.5) * TEXEL;
                for (let c = c0; c <= c1; c++) {
                    const x = x0 + (c + 0.5) * TEXEL;
                    if (!pointInPolygon(x, z, room.polygon) && edgeDistance(x, z, room.polygon) > GROW) continue;
                    const at = (r * width + c) * 4;
                    for (let k = 0; k < 4; k++) {
                        if (data[at + k] === 0) {
                            data[at + k] = id;
                            break;
                        }
                    }
                }
            }
            yield;
        }
        // Into the outside walls, where no room on the same storey is yet.
        const storeyOf = (a, b) => a.elevation < b.elevation + b.height + 0.05 && b.elevation < a.elevation + a.height + 0.05;
        for (let i = 0; i < rooms.length; i++) {
            const room = rooms[i];
            const xs = room.polygon.map((p) => p[0]);
            const zs = room.polygon.map((p) => p[1]);
            const c0 = Math.max(0, Math.floor((Math.min(...xs) - FILL - x0) / TEXEL));
            const c1 = Math.min(width - 1, Math.ceil((Math.max(...xs) + FILL - x0) / TEXEL));
            const r0 = Math.max(0, Math.floor((Math.min(...zs) - FILL - z0) / TEXEL));
            const r1 = Math.min(height - 1, Math.ceil((Math.max(...zs) + FILL - z0) / TEXEL));
            for (let r = r0; r <= r1; r++) {
                const z = z0 + (r + 0.5) * TEXEL;
                for (let c = c0; c <= c1; c++) {
                    const at = (r * width + c) * 4;
                    let k = 0;
                    while (k < 4 && data[at + k] !== 0 && !storeyOf(rooms[data[at + k] - 1], room)) k++;
                    if (k === 4 || data[at + k] !== 0) continue;
                    if (edgeDistance(x0 + (c + 0.5) * TEXEL, z, room.polygon) <= FILL) data[at + k] = i + 1;
                }
            }
            yield;
        }
        this.map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
        this.map.magFilter = THREE.NearestFilter;
        this.map.minFilter = THREE.NearestFilter;
        this.map.generateMipmaps = false;
        this.map.needsUpdate = true;
        this.area = new THREE.Vector4(x0, z0, x1 - x0, z1 - z0);

        const cells = Math.max(1, rooms.length);
        // (Sharing, SHARE_ROWS more: each room's share of the sky's reflections, all of it until it is said, and its six
        // ways' light, none — setShares.)
        const rows = this.sharing ? 1 + SHARE_ROWS : 1;
        this.values = new Float32Array(cells * 4 * rows);
        const groups = lightGroups(rooms, spec.walls || []);
        rooms.forEach((room, i) => {
            this.values[i * 4] = room.elevation - 0.05;
            this.values[i * 4 + 1] = room.elevation + room.height + 0.05;
            // Which rooms light each other: those open to one another with no wall between.
            this.values[i * 4 + 3] = groups[i];
            if (this.sharing) this.values.fill(1, (cells + i) * 4, (cells + i) * 4 + 3);
        });
        this.table = new THREE.DataTexture(this.values, cells, rows, THREE.RGBAFormat, THREE.FloatType);
        this.table.magFilter = THREE.NearestFilter;
        this.table.minFilter = THREE.NearestFilter;
        this.table.generateMipmaps = false;
        this.table.needsUpdate = true;
        this.glow = new Float32Array(cells);
        this.target = new Float32Array(cells);
    }

    /** The rooms again, after the editor changed them — only if they did. */
    rebuild(spec) {
        if (roomsKey(spec) === this.key) return;
        this.map.dispose();
        this.table.dispose();
        // Each room as lit as it was, not dark and fading back.
        const before = new Map(this.rooms.map((room, i) => [room.id, this.glow[i]]));
        // (Its rooms' own light, sharing, to be said again for the rooms as they are now.)
        this.shareTarget = null;
        this.build(spec);
        this.rooms.forEach((room, i) => {
            const glow = before.get(room.id) ?? 0;
            this.glow[i] = glow;
            this.values[i * 4 + 2] = glow;
        });
        this.uniforms.roomGlowMap.value = this.map;
        this.uniforms.roomGlowTable.value = this.table;
        this.uniforms.roomGlowArea.value = this.area;
        this.version = -1;
    }

    /**
     * Every lit material in `root` made to glow with its room, once — those
     * added later (the furniture, an edit, the published view's copies) when
     * this is run again.
     */
    applyTo(root) {
        // Out of the shaders: whatever has come meanwhile is found as it goes back in (setShown).
        if (!this.shown.on) return;
        root.traverse((node) => {
            if (!node.isMesh && !node.isInstancedMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material || this.patched.has(material) || this.skipped.has(material)) continue;
                if (this.hooks.has(material.onBeforeCompile)) {
                    this.patched.add(material);
                    continue;
                }
                if (!(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial) || material.userData.noRoomGlow) {
                    this.skipped.add(material);
                    continue;
                }
                this.patch(material);
            }
        });
    }

    patch(material) {
        this.patched.add(material);
        const uniforms = this.uniforms;
        const shown = this.shown;
        const sharing = this.sharing;
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey;
        const own = previous !== THREE.Material.prototype.onBeforeCompile ? previous : null;
        material.onBeforeCompile = function (shader, renderer) {
            own?.call(this, shader, renderer);
            // The uniforms either way: three keeps those of the shader a
            // material built last, whichever of its shaders it then draws with.
            Object.assign(shader.uniforms, uniforms);
            // Whether what it reflects and is lit by is a room probe's (World/LiveRoom.js tags them), as it is drawn —
            // read as its uniforms are sent, at each render call that draws it: the sky's in a probe's own faces, the
            // probe's after.
            if (sharing) {
                const drawn = this;
                shader.uniforms.roomShareProbe = {
                    get value() {
                        return drawn.envMap?.userData?.roomProbe ? 1 : 0;
                    },
                };
            }
            if (shown.on) patchShader(shader, sharing);
        };
        this.hooks.add(material.onBeforeCompile);
        material.customProgramCacheKey = function () {
            // Not shown, the key it had before it was made to glow: the same shader as then, found again.
            if (!shown.on) return previousKey !== THREE.Material.prototype.customProgramCacheKey ? previousKey.call(this) : previous.toString();
            const before = previousKey !== THREE.Material.prototype.customProgramCacheKey ? previousKey.call(this) : own ? own.toString() : "";
            return `${before}|room-glow${sharing ? "-share" : ""}`;
        };
        material.needsUpdate = true;
    }

    /**
     * Each room's light that is not its lamps', as the bake measured it —
     * with `shares` alone (the constructor). `light(room)` (a room of the
     * spec) gives 21 numbers: how much of the sky's reflections it keeps,
     * red, green and blue, 0–1 each; then its light from each of the six
     * ways (+x, -x, +y, -y, +z, -z: what a surface facing that way is lit
     * by, as a lightmap or a light probe holds it), red, green and blue.
     * `out`: how much a surface that faces no room keeps of all of it.
     * `night`: whether any of it is drawn (by day the shaders' sums are as
     * the unbaked view's, all of it). Faded to as a room's glow is (update:
     * a lamp next door turned on, a door swung), or taken `atOnce` — the
     * first time, and from one time of day to the next. Sent to the GPU only
     * when one has changed.
     */
    setShares(light, out = [1, 1, 1], { atOnce = false, night = false } = {}) {
        if (!this.sharing || !this.rooms || !this.uniforms) return;
        this.uniforms.roomShareNight.value = night ? 1 : 0;
        const cells = this.glow.length;
        // (Laid out as the table's rows after the first are, and what faces no room after them.)
        const size = cells * 4 * SHARE_ROWS + 4;
        if (this.shareTarget?.length !== size) {
            this.shareTarget = new Float32Array(size);
            this.shareFrom = new Float32Array(size);
            this.shareAt = 1;
        }
        const target = this.shareTarget;
        let changed = false;
        const put = (at, value, k = 0) => {
            for (let c = 0; c < 3; c++) {
                const v = value?.[k + c] ?? 0;
                if (target[at + c] === v) continue;
                target[at + c] = v;
                changed = true;
            }
        };
        this.rooms.forEach((room, i) => {
            const each = light(room);
            for (let row = 0; row < SHARE_ROWS; row++) put((row * cells + i) * 4, each, row * 3);
        });
        put(cells * 4 * SHARE_ROWS, out);
        if (!changed && !atOnce) return;
        // From where each stands now, over FADE, whatever the change: a lamp next door comes up with its own light.
        const from = this.shareFrom;
        from.set(this.values.subarray(cells * 4, cells * 4 * (1 + SHARE_ROWS)));
        for (let c = 0; c < 3; c++) from[cells * 4 * SHARE_ROWS + c] = this.uniforms.roomShareOut.value.getComponent(c);
        this.shareAt = 0;
        this.easeShares(atOnce ? 1 : 0);
    }

    /** The rooms' light (setShares) `step` of FADE further on from where it stood towards what setShares last asked for. */
    easeShares(step) {
        const target = this.shareTarget;
        if (!target || this.shareAt >= 1) return;
        this.shareAt = Math.min(1, this.shareAt + step);
        const k = this.shareAt;
        const from = this.shareFrom;
        const cells = this.glow.length;
        const end = cells * 4 * SHARE_ROWS;
        let changed = false;
        for (let at = 0; at < end; at++) {
            if ((at & 3) === 3) continue;
            const next = k >= 1 ? target[at] : from[at] + (target[at] - from[at]) * k;
            if (this.values[cells * 4 + at] === next) continue;
            this.values[cells * 4 + at] = next;
            changed = true;
        }
        if (changed) this.table.needsUpdate = true;
        const out = this.uniforms.roomShareOut.value;
        for (let c = 0; c < 3; c++) out.setComponent(c, k >= 1 ? target[end + c] : from[end + c] + (target[end + c] - from[end + c]) * k);
    }

    /** Whether two rooms (ids) light each other as one: open to one another with no wall between (lightGroups). */
    together(a, b) {
        if (a === b) return true;
        const i = this.index?.get(a);
        const j = this.index?.get(b);
        return i !== undefined && j !== undefined && this.values[i * 4 + 3] === this.values[j * 4 + 3];
    }

    /** Each room's share of the sky's reflections as it stands (setShares), by its id: red, green, blue. */
    shares() {
        if (!this.sharing || !this.rooms) return null;
        const cells = this.glow.length;
        return Object.fromEntries(this.rooms.map((room, i) => [room.id, [...this.values.subarray((cells + i) * 4, (cells + i) * 4 + 3)]]));
    }

    /** Each room's six ways' light as it stands (setShares), by its id: +x, -x, +y, -y, +z, -z, red, green and blue each. */
    lights() {
        if (!this.sharing || !this.rooms) return null;
        const cells = this.glow.length;
        return Object.fromEntries(
            this.rooms.map((room, i) => [room.id, Array.from({ length: SHARE_ROWS - 1 }, (_, f) => [...this.values.subarray(((2 + f) * cells + i) * 4, ((2 + f) * cells + i) * 4 + 3)])])
        );
    }

    /**
     * In the shaders, or — under the editor's plain light — out of them:
     * every material made to glow draws with its shader for the one or the
     * other, built the first time and found again after. Shown again, what
     * came meanwhile is made to glow too.
     */
    setShown(on) {
        if (on === this.shown.on) return;
        this.shown.on = on;
        if (on) this.applyTo(this.scene);
        this.scene.traverse((node) => {
            if (!node.isMesh && !node.isInstancedMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (material && (this.patched.has(material) || this.hooks.has(material.onBeforeCompile))) material.needsUpdate = true;
            }
        });
    }

    /** Whether every room has faded to how lit it is. */
    get settled() {
        return this.version === this.switches.version && this.glow.every((glow, i) => glow === this.target[i]);
    }

    update(delta) {
        // Each room as lit as the share of its light that is on: all of it
        // with its ceiling light (and the lamps on that switch), a little
        // with only a bedside lamp.
        if (this.switches.version !== this.version) {
            this.version = this.switches.version;
            const full = new Float32Array(this.target.length);
            this.target.fill(0);
            this.switches.entries.forEach((entry, index) => {
                const on = this.switches.weights[index] > 0;
                for (const fitting of entry.lights) {
                    const i = this.index.get(fitting.room);
                    if (i === undefined) continue;
                    full[i] += fitting.power;
                    if (on) this.target[i] += fitting.power;
                }
            });
            // A space open from one room into the next with no wall between —
            // a hall and the living room it runs into — glows as one.
            const on = new Map();
            const all = new Map();
            for (let i = 0; i < this.target.length; i++) {
                const group = this.values[i * 4 + 3];
                on.set(group, (on.get(group) ?? 0) + this.target[i]);
                all.set(group, (all.get(group) ?? 0) + full[i]);
            }
            for (let i = 0; i < this.target.length; i++) {
                const group = this.values[i * 4 + 3];
                this.target[i] = all.get(group) > 0 ? on.get(group) / all.get(group) : 0;
            }
        }
        const step = Math.min(1, delta / FADE);
        let changed = false;
        for (let i = 0; i < this.glow.length; i++) {
            const next = this.glow[i] + THREE.MathUtils.clamp(this.target[i] - this.glow[i], -step, step);
            if (next !== this.glow[i]) {
                this.glow[i] = next;
                this.values[i * 4 + 2] = next;
                changed = true;
            }
        }
        if (changed) this.table.needsUpdate = true;
        if (this.sharing) {
            this.easeShares(step);
            // What faces no room — a window's frame, the outer part of its reveals — as lit as `outsideRoom`'s lamps have
            // it (the visitor's own room: LiveRoom): all of the unbaked view's light where they are all on (SHARE_GLSL).
            const at = this.index.get(this.outsideRoom);
            this.uniforms.roomShareOutGlow.value = at === undefined ? 0 : this.glow[at];
        }
        const strength = this.world.lighting === "night" ? STRENGTH.night : STRENGTH.day;
        this.uniforms.roomGlowColour.value.copy(WARM).multiplyScalar(strength);
    }

    dispose() {
        this.map.dispose();
        this.table.dispose();
    }
}

/** What the map is drawn from: the rooms' shapes, heights and kinds, and the walls between them. */
function roomsKey(spec) {
    return JSON.stringify([
        spec.rooms.map((room) => [room.id, room.polygon, room.elevation, room.height, room.ceiling_finish, room.floor_finish]),
        (spec.walls || []).map((wall) => [wall.start, wall.end, wall.thickness, wall.base_height, wall.height]),
    ]);
}

/**
 * The rooms that light one another, as groups (1, 2, …, one a room): those
 * open to one another with no wall between (shared/roomGraph.js openPairs).
 */
function lightGroups(rooms, walls) {
    const parent = rooms.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const index = new Map(rooms.map((room, i) => [room, i]));
    for (const [a, b] of openPairs(rooms, walls)) parent[find(index.get(a))] = find(index.get(b));
    return rooms.map((_, i) => find(i) + 1);
}

const VERTEX_AT = "#include <project_vertex>";
const FRAGMENT_AT = "#include <emissivemap_fragment>";
const LIGHTS_AT = "#include <lights_fragment_begin>";
const POINT_LIGHT_AT = "getPointLightInfo( pointLight, geometryPosition, directLight );";
const SPOT_LIGHT_AT = "getSpotLightInfo( spotLight, geometryPosition, directLight );";
const MAPS_AT = "#include <lights_fragment_maps>";

/** How many rows of the table a room's own light takes after the first (setShares): its share of the sky's reflections, and its six ways' light. */
const SHARE_ROWS = 7;

/**
 * At night (`roomShareNight`), its room's light that is not its lamps'
 * (setShares), once the ambient light and the sky's in its map are added
 * up and before they light it — the room it faces (the glow's lookup,
 * roomGlowHere; of two, the more lit) or, facing none, what is out of
 * doors keeps of it:
 *
 *   - as far as the room's lamps are off (its glow, `roomShareGlow`, 0–1),
 *     the light that is not a lamp's — the ambient light, the sky's in its
 *     map, the scene's own environment where it has no map of its own —
 *     is the room's six ways' light on a surface facing as it does (an
 *     "ambient cube", as World/ProbeLight.js lights what moves), and its
 *     reflections of the sky its room's share of them; as far as they are
 *     on, all of it, as the unbaked view has it; facing no room (a
 *     window's frame, the outer part of its reveals), what is out of doors
 *     keeps, as far as the visitor's own room's lamps are off
 *     (`roomShareOutGlow`: the glow of `outsideRoom`);
 *   - what it takes of a room probe (`roomShareProbe`) is left whole: the
 *     probe is the room's light as it was drawn.
 *
 * By day none of it: the sums are the unbaked view's to the bit.
 */
const SHARE_GLSL = /* glsl */ `
	if ( roomShareNight > 0.5 ) {
		bool roomShareProbed = roomShareProbe > 0.5;
		if ( roomShareCell >= 0 ) {
			float lamps = roomShareGlow;
			vec3 roomShare = roomShareHere + ( 1.0 - roomShareHere ) * lamps;
			#if defined( RE_IndirectDiffuse )
				if ( roomShareProbed ) {
					irradiance *= roomShare;
				} else {
					vec3 n = inverseTransformDirection( geometryNormal, viewMatrix );
					vec3 s = n * n;
					vec3 cube = s.x * texelFetch( roomGlowTable, ivec2( roomShareCell, n.x >= 0.0 ? 2 : 3 ), 0 ).rgb
						+ s.y * texelFetch( roomGlowTable, ivec2( roomShareCell, n.y >= 0.0 ? 4 : 5 ), 0 ).rgb
						+ s.z * texelFetch( roomGlowTable, ivec2( roomShareCell, n.z >= 0.0 ? 6 : 7 ), 0 ).rgb;
					irradiance = irradiance * lamps + PI * cube * ( 1.0 - lamps );
					iblIrradiance *= lamps;
				}
			#endif
			#if defined( RE_IndirectSpecular )
				if ( ! roomShareProbed ) {
					radiance *= roomShare;
					clearcoatRadiance *= roomShare;
				}
			#endif
		} else {
			vec3 roomShareOutside = roomShareOut + ( 1.0 - roomShareOut ) * roomShareOutGlow;
			vec3 roomShareLit = roomShareProbed ? vec3( 1.0 ) : roomShareOutside;
			#if defined( RE_IndirectDiffuse )
				irradiance *= roomShareOutside;
				iblIrradiance *= roomShareLit;
			#endif
			#if defined( RE_IndirectSpecular )
				radiance *= roomShareLit;
				clearcoatRadiance *= roomShareLit;
			#endif
		}
	}`;

/**
 * Each room's share as the glow's lookup finds its room (patchGlow): the second row of the table, the more of each
 * colour; and of the rooms it faces the more lit — its lamps' glow first — whose six ways' light it takes (SHARE_GLSL).
 */
const SHARE_HERE = `
            {
                vec3 roomShareRow = texelFetch( roomGlowTable, ivec2( int( roomGlowHere[ k ] + 0.5 ) - 1, 1 ), 0 ).rgb;
                roomShareHere = max( roomShareHere, roomShareRow );
                float roomShareBy = room.z + dot( roomShareRow, vec3( 0.2126, 0.7152, 0.0722 ) );
                if ( roomShareBy > roomShareKey ) {
                    roomShareKey = roomShareBy;
                    roomShareCell = int( roomGlowHere[ k ] + 0.5 ) - 1;
                    roomShareGlow = room.z;
                }
            }`;

/**
 * The glow (patchGlow) — and, `sharing`, each room's share of the light
 * that is not its lamps' (SHARE_GLSL) — in a material's shader.
 */
function patchShader(shader, sharing = false) {
    patchGlow(shader, sharing);
    if (!sharing || shader.fragmentShader.includes("roomShareLit")) return;
    // (Its glow given it by a hook without the shares — a copy of another's material: none here, then.)
    if (!shader.fragmentShader.includes("roomShareHere") || !shader.fragmentShader.includes(MAPS_AT)) {
        console.warn("A room's share of its light not applied: the material's shader has no", shader.fragmentShader.includes(MAPS_AT) ? "share lookup" : MAPS_AT);
        return;
    }
    shader.fragmentShader = `uniform vec3 roomShareOut;\nuniform float roomShareOutGlow;\nuniform float roomShareProbe;\nuniform float roomShareNight;\n${shader.fragmentShader.replace(MAPS_AT, `${MAPS_AT}\n${SHARE_GLSL}`)}`;
}

/**
 * Where it is in the world, handed to the fragment; there, its room's glow
 * on top of its own: the room it faces, by the map and the table.
 */
function patchGlow(shader, sharing = false) {
    // Once only: a copy of a material made to glow keeps its predecessor's hook, and is given one of its own.
    if (shader.fragmentShader.includes("roomGlowAt(")) return;
    if (!shader.vertexShader.includes(VERTEX_AT) || !shader.fragmentShader.includes(FRAGMENT_AT)) return;
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRoomGlowPosition;\nvarying vec3 vRoomGlowNormal;")
        .replace(
            VERTEX_AT,
            `${VERTEX_AT}
    {
        vec4 roomGlowWorld = vec4( transformed, 1.0 );
        vec3 roomGlowNormal = objectNormal;
        #ifdef USE_INSTANCING
            roomGlowWorld = instanceMatrix * roomGlowWorld;
            roomGlowNormal = mat3( instanceMatrix ) * roomGlowNormal;
        #endif
        vRoomGlowPosition = ( modelMatrix * roomGlowWorld ).xyz;
        vRoomGlowNormal = normalize( mat3( modelMatrix ) * roomGlowNormal );
    }`
        );
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            `#include <common>
varying vec3 vRoomGlowPosition;
varying vec3 vRoomGlowNormal;
uniform sampler2D roomGlowMap;
uniform sampler2D roomGlowTable;
uniform vec4 roomGlowArea;
uniform vec3 roomGlowColour;
float roomGlowAt( vec3 point ) {
    vec2 uv = ( point.xz - roomGlowArea.xy ) / roomGlowArea.zw;
    if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 0.0;
    vec4 ids = texture2D( roomGlowMap, uv ) * 255.0;
    float glow = 0.0;
    for ( int k = 0; k < 4; k ++ ) {
        float id = ids[ k ];
        if ( id < 0.5 ) continue;
        vec4 room = texelFetch( roomGlowTable, ivec2( int( id + 0.5 ) - 1, 0 ), 0 );
        if ( point.y >= room.x && point.y <= room.y ) glow = max( glow, room.z );
    }
    return glow;
}
// The rooms the surface being drawn faces (up to four ids, 0 for none),
// where it looks for them, and whether it is in one at all.
vec4 roomGlowHere = vec4( 0.0 );
vec3 roomGlowHerePoint = vec3( 0.0 );
bool roomGlowHereIndoor = false;${sharing ? "\nvec3 roomShareHere = vec3( 0.0 );\nint roomShareCell = - 1;\nfloat roomShareGlow = 0.0;\nfloat roomShareKey = - 1.0;" : ""}
// 1 where a light without a shadow reaches the surface: in the room it
// hangs in or one open to it, or, hanging out of doors, out of doors; 0
// through a wall.
float roomGlowReach( vec3 lightView ) {
    vec3 light = transpose( mat3( viewMatrix ) ) * ( lightView - viewMatrix[ 3 ].xyz );
    vec2 uv = ( light.xz - roomGlowArea.xy ) / roomGlowArea.zw;
    vec4 ids = vec4( 0.0 );
    if ( uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0 ) ids = texture2D( roomGlowMap, uv ) * 255.0;
    bool inRoom = false;
    for ( int k = 0; k < 4; k ++ ) {
        float id = ids[ k ];
        if ( id < 0.5 ) continue;
        vec4 room = texelFetch( roomGlowTable, ivec2( int( id + 0.5 ) - 1, 0 ), 0 );
        if ( light.y < room.x || light.y > room.y ) continue;
        inRoom = true;
        for ( int j = 0; j < 4; j ++ ) {
            float h = roomGlowHere[ j ];
            if ( h < 0.5 ) continue;
            vec4 here = texelFetch( roomGlowTable, ivec2( int( h + 0.5 ) - 1, 0 ), 0 );
            if ( abs( here.w - room.w ) < 0.5 && roomGlowHerePoint.y >= here.x && roomGlowHerePoint.y <= here.y ) return 1.0;
        }
    }
    if ( inRoom ) return 0.0;
    return roomGlowHereIndoor ? 0.0 : 1.0;
}`
        )
        .replace(
            FRAGMENT_AT,
            `${FRAGMENT_AT}
    {
        vec3 roomGlowFacing = normalize( vRoomGlowNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
        roomGlowHerePoint = vRoomGlowPosition + roomGlowFacing * ${REACH.toFixed(2)};
        vec2 roomGlowUv = ( roomGlowHerePoint.xz - roomGlowArea.xy ) / roomGlowArea.zw;
        if ( roomGlowUv.x >= 0.0 && roomGlowUv.y >= 0.0 && roomGlowUv.x <= 1.0 && roomGlowUv.y <= 1.0 ) roomGlowHere = texture2D( roomGlowMap, roomGlowUv ) * 255.0;
        for ( int k = 0; k < 4; k ++ ) {
            if ( roomGlowHere[ k ] < 0.5 ) continue;
            vec4 room = texelFetch( roomGlowTable, ivec2( int( roomGlowHere[ k ] + 0.5 ) - 1, 0 ), 0 );
            ${sharing ? `if ( roomGlowHerePoint.y < room.x || roomGlowHerePoint.y > room.y ) continue;\n            roomGlowHereIndoor = true;${SHARE_HERE}` : "if ( roomGlowHerePoint.y >= room.x && roomGlowHerePoint.y <= room.y ) roomGlowHereIndoor = true;"}
        }
        totalEmissiveRadiance += roomGlowColour * roomGlowAt( roomGlowHerePoint ) * diffuseColor.rgb;
    }`
        );
    // The lights without shadows kept where they are (no shadow stops them at
    // a wall): point lights, and spotlights after those with shadows (three
    // puts those first).
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    if (shader.fragmentShader.includes(LIGHTS_AT) && chunk.includes(POINT_LIGHT_AT) && chunk.includes(SPOT_LIGHT_AT)) {
        shader.fragmentShader = shader.fragmentShader.replace(
            LIGHTS_AT,
            chunk
                .replace(
                    POINT_LIGHT_AT,
                    `${POINT_LIGHT_AT}\n\t\tif ( directLight.visible && pointLight.distance > 0.0 && pointLight.distance <= ${KEPT_REACH.toFixed(1)} ) directLight.color *= roomGlowReach( pointLight.position );`
                )
                .replace(
                    SPOT_LIGHT_AT,
                    `${SPOT_LIGHT_AT}\n\t\t#if ( UNROLLED_LOOP_INDEX >= NUM_SPOT_LIGHT_SHADOWS )\n\t\tif ( directLight.visible && spotLight.distance > 0.0 && spotLight.distance <= ${KEPT_REACH.toFixed(1)} ) directLight.color *= roomGlowReach( spotLight.position );\n\t\t#endif`
                )
        );
    }
}

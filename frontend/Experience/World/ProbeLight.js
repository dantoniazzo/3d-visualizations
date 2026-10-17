import * as THREE from "three";

import { wholeGlass } from "../Utils/reflections.js";
import { withoutGlaze } from "./Sky.js";

/**
 * What moves — the visitors, the people round the property, the car, the
 * furniture's doors and drawers — lit as the house round it is, in a
 * public view lit live (Utils/device.js's lightingMode) — or drawn from
 * the bake, as a computer is given it,
 * where the house casts no shadow: then with the sun on it as far as the
 * probes say it reaches (`sunFromProbes`), and the room doors' leaves too.
 *
 * The house takes its ambient light from the bake (SceneBuilder); what
 * moves has none baked, and a sky's worth of hemisphere light — the same
 * in the cellar as on the lawn — lit it as if it stood outdoors. Instead
 * the bake measures the light through the house at a grid of points
 * (blender/bake_public.py's probe_grid), each point from six ways: the
 * light on a surface facing up, down and each way round, there. Each thing
 * that moves takes the light of the points round it, blended by how near
 * each is, those in the room it is in first — so the living room's light
 * does not come through the wall from the hall — and lights each of its
 * surfaces by the way it faces. On top of that, as on the house, the live
 * sun and the live lamps, with their shadows.
 *
 * Like the house's lightmap, the probes hold all of the light but what is
 * drawn live: the sky's and everything bounced, and each switch that is on
 * — only what its lamps bounce when they are lit live (LiveLamps), all of
 * it when not.
 *
 * Over a view drawn from the bake, what moves in the one room drawn live
 * at its visitor's wish (World/LiveRoom.js) is that room's to light and to
 * draw while it is: left as it is here (`userData.roomLive`: dress), and
 * dressed again when it is given back.
 *
 * A door's leaf hangs in a wall — in no room, and its two faces in two: it
 * takes the light of the room on each side of its wall for the faces that
 * look that way (`leafLight`), so a shut door is lit on the bedroom's side
 * by the bedroom's lamp and dark on the dark hall's. (Asked for where it
 * hangs, as everything else is, it was given the light of the probes in
 * the wall's own thickness, which measure nothing: a black leaf in a lit
 * room, day and night.)
 *
 * Its reflections (a car's paint, its chrome) are of a studio, the same
 * everywhere; they are dimmed as its light is, so a car in the garage or
 * out at night does not shine as it does in the sun.
 */

/** How fast what moves takes on the light where it now is, per second. */
const ADAPT = 8;
/** Reflections at least this share of their daylight strength. */
const LEAST_REFLECTION = 0.02;
/**
 * A furniture's part at rest is left as it is once its light is this near what it is taking on, as a share of the
 * open garden's daylight (update): far under what a pixel shows.
 */
const SETTLED = 1e-4;
/**
 * How far to each side of its wall a door leaf's light is taken, in metres: in the room, clear of the wall's own
 * thickness — the probes there measure nothing, and a leaf that hangs on one of the grid's own planes was given
 * theirs alone.
 */
const LEAF_REACH = 0.5;
/** How far over a person's rig its light is taken, in metres: the middle of its pose, within these. */
const PERSON_LIFT = { least: 0.2, most: 1.0 };

/**
 * Where none of the eight probes round a point measures anything, how many more of the grid's steps each way one is
 * looked for (sample) — and how much further off, in metres, a probe of another room counts than one of its own.
 */
const NEAR = 2;
const OTHER_ROOM = 100;
/** How many frames apart something at rest is asked whether it still wears what it was given (update, stillDressed). */
const DRESSED_EVERY = 8;
/** No switches (compose): one list, so that none is the same none each frame. */
const NONE = Object.freeze([]);

const _position = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _side = new THREE.Vector3();
const _sun = new THREE.Vector3();
const _box = new THREE.Box3();
const LIT = ["isMeshStandardMaterial", "isMeshLambertMaterial", "isMeshPhongMaterial"];

export default class ProbeLight {
    /**
     * @param {World} world  drawing a public view
     * @param {object} description  the bake's `probes` (write_grid)
     * @param {ArrayBuffer} buffer  its file
     * @param {object} [options]
     * @param {boolean} [options.sunFromProbes]  drawn from the bake, where
     *        the house casts no shadow: the sun on what moves as much as the
     *        probes round it say reaches them
     */
    constructor(world, description, buffer, { sunFromProbes = false } = {}) {
        this.world = world;
        this.builder = world.sceneBuilder;
        const [nx, ny, nz] = description.size;
        this.size = description.size;
        this.origin = description.origin;
        this.step = description.step;
        this.count = nx * ny * nz;
        this.zoneIds = description.zoneIds;
        this.outside = description.zoneIds.indexOf("outside");

        const view = new DataView(buffer);
        this.zoneOf = new Uint8Array(buffer, description.zones, this.count);
        this.sunFromProbes = sunFromProbes;
        // Each variant's light, at every point: in a file of layout 2, kept
        // for the points that measure light alone, in order, with how much
        // of the sun reaches each.
        const measured = [];
        for (let index = 0; index < this.count; index++) if (this.zoneOf[index] !== 255) measured.push(index);
        this.variants = {};
        this.sunOf = {};
        for (const [name, entry] of Object.entries(description.variants)) {
            if (description.layout === 2) {
                const kept = halfs(view, entry.light, measured.length * 18);
                const light = new Float32Array(this.count * 18);
                measured.forEach((index, k) => light.set(kept.subarray(k * 18, k * 18 + 18), index * 18));
                this.variants[name] = light;
                const sun = new Float32Array(this.count).fill(1);
                if (entry.sun !== undefined) {
                    const bytes = new Uint8Array(buffer, entry.sun, measured.length);
                    measured.forEach((index, k) => (sun[index] = bytes[k] / 255));
                }
                this.sunOf[name] = sun;
            } else {
                this.variants[name] = halfs(view, entry, this.count * 18);
                this.sunOf[name] = new Float32Array(this.count).fill(1);
            }
        }
        this.switches = description.switches.map(
            (entry) =>
                entry && {
                    indices: uint16s(view, entry.indices, entry.count),
                    full: halfs(view, entry.full, entry.count * 18),
                    // (What its lamps bounce alone: read only where they are lit live over the bake — compose — and, for a
                    // room drawn live in the bake's light (World/RoomBakeLight.js), the first time that asks: indirectOf.)
                    indirect: this.builder.liveLight && entry.indirect !== undefined ? halfs(view, entry.indirect, entry.count * 18) : null,
                    indirectAt: this.builder.roomLiveOK ? entry.indirect : undefined,
                    count: entry.count,
                }
        );
        // (The file, which the rooms' own arrays above are views of and so is kept anyway: for indirectOf.)
        this.view = view;
        this.light = new Float32Array(this.count * 18);
        this.key = null;
        // Daylight's reflections: as bright as the open garden by day.
        this.reference = reference(this.variants.day ?? Object.values(this.variants)[0], this.zoneOf, this.outside);
        /** root -> what lights it: its six ways' light, and its materials */
        this.tracked = new Map();
        /** mesh -> the material it was last given, and what it had before */
        this.dressed = new WeakMap();
        this.undressed = new Map();
    }

    update(delta) {
        this.compose();
        const roots = this.roots();
        const blend = Math.min(1, ADAPT * delta);
        // From above the rooms are brought up, and let down again, at once
        // (SceneBuilder.setIndoorGain): what stands in them with them, not
        // eased after — dark figures in a lit room, then lit ones in the
        // room as it was.
        const indoors = this.builder.indoorGain?.value ?? 1;
        const lifted = indoors !== this.indoorGain;
        this.indoorGain = indoors;
        // The light everything is lit by now, as a count that moves on whenever it changes: what something at rest was
        // last settled in (`rest`, below) — counted, not said, so that saying it costs a frame nothing.
        if (lifted || this.settledFor !== this.key || this.settledSun !== this.sunFromProbes) {
            this.settledFor = this.key;
            this.settledSun = this.sunFromProbes;
            this.epoch = (this.epoch ?? 0) + 1;
        }
        const now = this.epoch;
        this.frames = (this.frames ?? 0) + 1;
        const { list, lifts, parts, entries } = roots;
        for (let i = 0; i < list.length; i++) {
            const root = list[i];
            const entry = entries[i];
            const part = parts[i];
            // Something that has not moved, its light settled in the light there is now, wearing what it was given: as it
            // was, with nothing looked up. A furniture's door or drawer by its own say (Ladonia's 475, shut nearly all of
            // them always: sampled and dressed again every frame they took 3.2 ms a frame of the main thread); anything
            // else — the people round the property, who never leave their spots, the doors' leaves, a parked car, a
            // visitor standing still — by its frame as the last frame drew it, which is what it has moved by: each of
            // those sampled, its rig gone through for its materials and its light eased again every frame, was 0.5 ms
            // of every frame of either version, all of it standing still (2026-10-16). Whether it still wears what it was
            // given is asked of each a frame in DRESSED_EVERY: nothing but a room shown live puts other materials on
            // them, and it gives back what it took (World/LiveRoom.js); asked of all 600 every frame, it was 60 µs.
            const ask = (this.frames + i) % DRESSED_EVERY === 0;
            if (entry.rest === now && (part ? !part.isMoving : sameFrame(entry.frame, root.matrixWorld)) && (!ask || this.stillDressed(entry))) continue;
            entry.rest = null;
            root.getWorldPosition(_position);
            // Which room it is in, looked for again only once it has moved:
            // the people round the property stay where they are.
            if (!entry.at?.equals(_position)) {
                entry.at = (entry.at ?? new THREE.Vector3()).copy(_position);
                entry.room = this.builder.roomAt(_position.x, _position.y, _position.z);
            }
            _position.y += lifts[i];
            const door = this.leaves?.get(root);
            const target = door ? this.leafLight(door, root, _position) : this.sample(_position, entry.room?.id ?? "outside");
            // Nowhere the probes measured (up on a roof deck the grid does
            // not reach): until it is, as the scene lights it, rather than
            // dark — what has had the probes' light keeps the last of it.
            if (!target && entry.fresh) {
                this.rest(entry, root, part, now);
                continue;
            }
            this.dress(root, entry);
            if (!target) {
                this.rest(entry, root, part, now);
                continue;
            }
            const k = entry.fresh || lifted ? 1 : blend;
            entry.fresh = false;
            // (How far it is from what it is taking on, before this frame's step: what is left of that after it, 1 − k of
            // it, says whether it has settled — under SETTLED of the garden's daylight, and of the sun's share.)
            let towards = 0;
            if (this.sunFromProbes) {
                const sun = this.sunNow - entry.sun.value;
                entry.sun.value += sun * k;
                towards = Math.abs(sun) * this.reference;
            }
            // Indoors, brought up from above as the room round it is (SceneBuilder.setIndoorGain) — a leaf's each side already as its own room.
            const gain = door ? 1 : this.builder.indoorGainIn?.(entry.room, brightest(target)) ?? 1;
            let total = 0;
            for (let f = 0; f < 6; f++) {
                const c = entry.cube[f];
                const x = target[f * 3] * gain - c.x;
                const y = target[f * 3 + 1] * gain - c.y;
                const z = target[f * 3 + 2] * gain - c.z;
                c.x += x * k;
                c.y += y * k;
                c.z += z * k;
                towards = Math.max(towards, Math.abs(x), Math.abs(y), Math.abs(z));
                total += 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z;
            }
            if (!part?.isMoving && towards * (1 - k) <= SETTLED * this.reference) this.rest(entry, root, part, now);
            entry.factor = THREE.MathUtils.clamp(total / 6 / this.reference, LEAST_REFLECTION, 1);
            for (const material of entry.materials) {
                if (material.envMap) material.envMapIntensity = material.userData.probeEnvMapIntensity * entry.factor;
            }
            // ...and of a part drawn shut with others (World/ShutBatcher.js), its row of their light.
            if (part) this.builder.shutBatcher?.lightPart(part, entry, this);
        }
    }

    /**
     * Something settled in the light there is now (`now`, update's count):
     * left as it is from the next frame for as long as nothing changes — a
     * part while it does not move, anything else while it stands where the
     * frame it settled in drew it (`frame`).
     */
    rest(entry, root, part, now) {
        if (part?.isMoving) return;
        entry.rest = now;
        if (part) return;
        entry.frame ??= new Float64Array(16);
        entry.frame.set(root.matrixWorld.elements);
    }

    /**
     * What moves, and how far above where it stands its light is taken: the
     * visitor's own avatar and everyone else's, the people round the
     * property (World/People.js) — at the middle of each, standing, sitting
     * or lying, hidden or not, so each keeps the materials it was given —
     * the cars, and the furniture's doors and drawers (Openables.js), which
     * are not baked.
     *
     * Not a window's sashes (World/Sash.js), though they move: a window's
     * fixed frame — a metal — and its fixed panes are drawn live in a view
     * drawn from its bake as everywhere, unbaked, and a sash is drawn as
     * they are, so the window reads as one. Dressed here its pane was clear
     * where the fixed panes beside it are veiled by day (221 against 254 of
     * 255), and a shut window not as it was published before it opened.
     *
     * As lists side by side — `list` the roots, `lifts`, `parts` each one's
     * part (or null), `entries` what lights each — made again only when
     * something has come or gone (same): made every frame, it was a map of
     * five hundred and more, every frame, for the same five hundred.
     */
    roots() {
        if (this.held && this.same(this.held)) return this.held;
        const builder = this.builder;
        const order = new Map();
        const byNode = builder.openables?.byNode;
        for (const part of builder.openables?.parts || []) order.set(part.node, 0);
        // Drawn from the bake, the doors' leaves too, which lit live take
        // their light from probes of their own (SceneBuilder.tintDoors).
        if (this.sunFromProbes) {
            /** leaf -> its door: lit a side at a time (leafLight) */
            this.leaves ??= new Map();
            for (const door of builder.doors || []) {
                for (const { leaf } of door.leaves) {
                    order.set(leaf, 0);
                    this.leaves.set(leaf, door);
                }
            }
        }
        const player = this.world.player;
        if (player?.avatar) order.set(player.avatar.avatar, 1.0);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) order.set(other.model.avatar, 1.0);
        // (Every one built, as countPeople counts them: the people's own map, not their spec's list, which is made anew each time it is asked for.)
        for (const person of this.world.people?.people?.values() ?? []) {
            order.set(person.group, THREE.MathUtils.clamp(person.sphere.center.y - person.group.position.y, PERSON_LIFT.least, PERSON_LIFT.most));
        }
        for (const car of builder.cars || []) order.set(car.group, 0.3);
        for (const root of this.tracked.keys()) if (!order.has(root)) this.tracked.delete(root);
        const held = { list: [], lifts: [], parts: [], entries: [], mark: this.markOf() };
        for (const [root, lift] of order) {
            let entry = this.tracked.get(root);
            if (!entry) {
                entry = { cube: Array.from({ length: 6 }, () => new THREE.Vector3()), sun: { value: 1 }, fresh: true, factor: 1, at: null, room: null, rest: null, frame: null };
                this.tracked.set(root, entry);
            }
            held.list.push(root);
            held.lifts.push(lift);
            held.parts.push(byNode?.get(root) ?? null);
            held.entries.push(entry);
        }
        this.held = held;
        return held;
    }

    /**
     * What roots was made from, said by what it is made of and how many of
     * each there are — the lists themselves, and the visitors' and the
     * people's own objects: told apart by those, without making anything.
     */
    markOf() {
        const builder = this.builder;
        const player = this.world.player;
        return {
            parts: builder.openables?.parts ?? null,
            partCount: builder.openables?.parts?.length ?? 0,
            doors: builder.doors ?? null,
            doorCount: builder.doors?.length ?? 0,
            cars: builder.cars ?? null,
            carCount: builder.cars?.length ?? 0,
            avatar: player?.avatar?.avatar ?? null,
            others: this.countOthers(null),
            people: this.countPeople(null),
        };
    }

    /** Whether what roots was made from is as it was (markOf), the visitors and the people each among those it has. */
    same(held) {
        const mark = held.mark;
        const builder = this.builder;
        if (mark.parts !== (builder.openables?.parts ?? null) || mark.partCount !== (builder.openables?.parts?.length ?? 0)) return false;
        if (mark.doors !== (builder.doors ?? null) || mark.doorCount !== (builder.doors?.length ?? 0)) return false;
        if (mark.cars !== (builder.cars ?? null) || mark.carCount !== (builder.cars?.length ?? 0)) return false;
        if (mark.avatar !== (this.world.player?.avatar?.avatar ?? null)) return false;
        return this.countOthers(this.tracked) === mark.others && this.countPeople(this.tracked) === mark.people;
    }

    /** How many other visitors have a figure — or, given `among`, -1 if one of them is not among it. */
    countOthers(among) {
        const others = this.world.player?.otherPlayers;
        let count = 0;
        for (const id in others) {
            const avatar = others[id].model?.avatar;
            if (!avatar) continue;
            if (among && !among.has(avatar)) return -1;
            count++;
        }
        return count;
    }

    /** How many of the people round the property are built — or, given `among`, -1 if one of them is not among it. */
    countPeople(among) {
        const people = this.world.people?.people;
        if (!people) return 0;
        let count = 0;
        for (const person of people.values()) {
            if (among && !among.has(person.group)) return -1;
            count++;
        }
        return count;
    }

    /**
     * Light each of the lit surfaces under `root` from the probes: each
     * mesh given materials of its own, which take their ambient light from
     * the probes' — and nothing of the scene's own ambient light. Done again
     * for any mesh whose material has changed, as a car's does when it is
     * swapped for another.
     */
    dress(root, entry) {
        entry.materials ??= new Set();
        // (Its meshes, once — what stillDressed looks over: a furniture's part is always made of the same ones.)
        const meshes = entry.meshes ? null : (entry.meshes = []);
        root.traverse((mesh) => {
            if (meshes && mesh.isMesh) meshes.push(mesh);
            // (Drawn, for now, as a view lit live draws it — in a room its visitor has asked to see so: World/LiveRoom.js — its material is that room's to give back.)
            if (!mesh.isMesh || mesh.userData.roomLive || this.dressed.get(mesh) === mesh.material) return;
            const own = (material) => {
                if (!material || !LIT.some((flag) => material[flag])) return material;
                if (entry.materials.has(material)) return material;
                // Clear glass the view keeps to its reflections (SceneBuilder.clearGlassIndoors) — a shower's glass
                // door, a washing machine's porthole — as the room's fixed panes are: lit by the probes on its own
                // white, a copy of it was the milky sheet that is there to keep it from (and lost what kept it so).
                if (wholeGlass(material) !== material) return material;
                // (A door's glass as it is of its own, not as the windows are seen at the moment it is copied: Sky.js's
                // withoutGlaze — the copy is no longer among those glazed, and would keep that look for the visit.)
                const clone = withoutGlaze(material.clone(), material);
                clone.userData.probeLit = true;
                clone.userData.probeEnvMapIntensity = material.userData.envMapIntensity ?? material.envMapIntensity ?? 1;
                lightByProbes(clone, entry.cube, entry.sun);
                entry.materials.add(clone);
                return clone;
            };
            if (!this.undressed.has(mesh)) this.undressed.set(mesh, mesh.material);
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
            this.dressed.set(mesh, mesh.material);
        });
    }

    /**
     * A copy of `material` to draw many of the furniture's parts with at
     * once, shut (World/ShutBatcher.js), as dress gives each of them its
     * own: lit by the probes in place of the scene's ambient light, its
     * reflections — where it has its own — at the strength dress gives them,
     * of which each part's share (update's `factor`) is multiplied in from
     * its row of `light`, as is the rest of its light (lightByPartProbes).
     * Null for what dress leaves as it is.
     *
     * @param {THREE.Material} material  what the parts wear undressed
     * @param {{ texture: { value: THREE.DataTexture }, rows: { value: number } }} light
     */
    batchMaterial(material, light) {
        if (!material || !LIT.some((flag) => material[flag]) || wholeGlass(material) !== material) return null;
        const clone = material.clone();
        clone.userData.probeLit = true;
        clone.userData.probeEnvMapIntensity = material.userData.envMapIntensity ?? material.envMapIntensity ?? 1;
        if (material.envMap) clone.envMapIntensity = clone.userData.probeEnvMapIntensity;
        lightByPartProbes(clone, light, { reflections: Boolean(material.envMap) });
        return clone;
    }

    /**
     * Whether everything under a root dressed (dress) still wears what it
     * was given — or is a room's drawn live for now (World/LiveRoom.js),
     * whose to give back: once given back, it is dressed again.
     */
    stillDressed(entry) {
        const meshes = entry.meshes;
        if (!meshes) return false;
        for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (!mesh.userData.roomLive && this.dressed.get(mesh) !== mesh.material) return false;
        }
        return true;
    }

    /** What moves back as it was, lit by the scene's own ambient light. */
    dispose() {
        for (const [mesh, material] of this.undressed) {
            if (this.dressed.get(mesh) === mesh.material) mesh.material = material;
        }
        for (const entry of this.tracked.values()) for (const material of entry.materials ?? []) material.dispose();
        this.undressed.clear();
        this.tracked.clear();
    }

    /**
     * The probes' light as it is now: the variant's, and each switch that
     * is on — what its lamps bounce when they are lit live, all of it when
     * not — added up once, as they change.
     */
    compose() {
        // (What the house is lit for: with it, a frame or two before the sky, as the time of day changes.)
        const variant = this.world.houseLighting;
        const weights = this.builder.switchWeights || NONE;
        const live = this.builder.switchLive || NONE;
        const doors = this.builder.doorLightVersion ?? 0;
        // (The switches' weights, and which of them are lit live, are each made anew as they change — SceneBuilder's
        // setSwitchLight and setLiveSwitches — so the same lists are the same light: not said again every frame.)
        const from = this.composedFrom;
        if (from && from.variant === variant && from.weights === weights && from.live === live && from.doors === doors) return;
        this.composedFrom = { variant, weights, live, doors };
        const key = `${variant}|${weights.join(",")}|${live.map(Number).join("")}|${doors}`;
        if (key === this.key) return;
        this.key = key;
        const base = this.variants[variant];
        if (!base) return;
        this.light.set(base);
        this.sun = this.sunOf[variant];
        // A room keeps as much of its light as its doors, as they are, let
        // stay (SceneBuilder.zoneStays).
        const stays = this.zoneIds.map((zone) => this.builder.zoneStays?.(zone) ?? 1);
        if (stays.some((share) => share < 0.999)) {
            for (let index = 0; index < this.count; index++) {
                const share = stays[this.zoneOf[index]];
                if (share === undefined || share > 0.999) continue;
                for (let c = index * 18, end = c + 18; c < end; c++) this.light[c] *= share;
            }
        }
        this.switches.forEach((entry, index) => {
            const weight = weights[index] ?? 0;
            if (!entry || !weight) return;
            // Next door through doors alone, as far as they are open.
            const reach = this.zoneIds.map((zone) => this.builder.switchReach?.(index, zone) ?? 1);
            const { indices, full, indirect } = entry;
            const values = (live[index] && indirect) || full;
            for (let j = 0; j < indices.length; j++) {
                const at = indices[j] * 18;
                const from = j * 18;
                const scaled = weight * (reach[this.zoneOf[indices[j]]] ?? 1);
                for (let c = 0; c < 18; c++) this.light[at + c] += values[from + c] * scaled;
            }
        });
    }

    /**
     * The probes' light, as compose adds it up, into `out` — but each
     * switch's in its own share: `weights` (0–1, by switch) how far it is
     * on, `shares` how much of that its lamps are lit live — what they
     * bounce for that much, all of its light for the rest. For a room
     * drawn live in the bake's light (World/RoomBakeLight.js), whose lamps
     * are faded in and out as they are handed round. The view's own
     * (`light`) is left as it is.
     *
     * @param {Float32Array} out  as many numbers as `light`
     * @returns {Float32Array|null} out, or null before the time of day's light is here
     */
    composeShared(out, weights, shares) {
        const base = this.variants[this.world.houseLighting];
        if (!base) return null;
        out.set(base);
        const stays = this.zoneIds.map((zone) => this.builder.zoneStays?.(zone) ?? 1);
        if (stays.some((share) => share < 0.999)) {
            for (let index = 0; index < this.count; index++) {
                const share = stays[this.zoneOf[index]];
                if (share === undefined || share > 0.999) continue;
                for (let c = index * 18, end = c + 18; c < end; c++) out[c] *= share;
            }
        }
        this.switches.forEach((entry, index) => {
            const weight = weights[index] ?? 0;
            if (!entry || !(weight > 0)) return;
            const reach = this.zoneIds.map((zone) => this.builder.switchReach?.(index, zone) ?? 1);
            const { indices, full } = entry;
            const indirect = shares[index] > 0 ? this.indirectOf(entry) : null;
            const live = indirect ? Math.min(shares[index], weight) : 0;
            for (let j = 0; j < indices.length; j++) {
                const at = indices[j] * 18;
                const from = j * 18;
                const k = reach[this.zoneOf[indices[j]]] ?? 1;
                for (let c = 0; c < 18; c++) out[at + c] += (full[from + c] * (weight - live) + (live ? indirect[from + c] * live : 0)) * k;
            }
        });
        return out;
    }

    /**
     * What a switch's lamps bounce at its probes (`indirect`), for a room
     * drawn live in the bake's light: read from the file the first time it
     * is wanted, and kept — a visit that never asks for the rooms drawn so
     * reads none of it (Ladonia: 0.77 MB of numbers). Null where the bake
     * has none.
     */
    indirectOf(entry) {
        if (!entry.indirect && entry.indirectAt !== undefined) entry.indirect = halfs(this.view, entry.indirectAt, entry.count * 18);
        return entry.indirect;
    }

    /**
     * What lights `root` from the probes as update lights it — a door's
     * leaf a side at a time, anything else where it is, `lift` over it —
     * were their light `light` (composeShared's): its six ways, red, green
     * and blue, a copy; or null where nothing round it measures any. `at`:
     * where it is, if not where its root is (a pane by the middle of its
     * glass).
     */
    lightAt(root, lift, light, at = null) {
        const kept = this.light;
        const sun = this.sunNow;
        this.light = light;
        try {
            if (at) _position.copy(at);
            else root.getWorldPosition(_position);
            const room = this.builder.roomAt(_position.x, _position.y, _position.z);
            _position.y += lift;
            // (A leaf is known as one once update has gone over what moves: roots.)
            const door = this.leaves?.get(root);
            const found = door ? this.leafLight(door, root, _position) : this.sample(_position, room?.id ?? "outside");
            return found ? Float32Array.from(found) : null;
        } finally {
            this.light = kept;
            this.sunNow = sun;
        }
    }

    /** How far over its root what moves takes its light (roots): its middle, standing, sitting or lying. */
    liftOf(root) {
        const person = (this.world.people?.list ?? []).find((each) => each.group === root);
        if (person) return THREE.MathUtils.clamp(person.sphere.center.y - person.group.position.y, PERSON_LIFT.least, PERSON_LIFT.most);
        const player = this.world.player;
        if (root === player?.avatar?.avatar || Object.values(player?.otherPlayers || {}).some((other) => other.model?.avatar === root)) return 1.0;
        if ((this.builder.cars || []).some((car) => car.group === root)) return 0.3;
        return 0;
    }

    /**
     * A door leaf's light. Shut, it hangs in its wall and each way it can
     * face takes the light of the room on that side
     * (SceneBuilder.doorSideZones: the wall's +Z, then its -Z; out of doors
     * where there is no room), taken half a metre into it (LEAF_REACH) — so
     * each face of the leaf has its own room's light; the ways along the
     * wall, up and down, which only its edges and the bevels of its panels
     * face, the dimmer of the two (the brighter drew lit lines round the
     * panels of a door seen from a dark room, or from the garden at night).
     * Swung open it stands in the room it opens into, both faces of it:
     * that room's light every way, as far as it has turned out of the
     * wall's own plane — from 60° all of it; a leaf that slides stays in
     * it, and keeps a room a face. Each side is brought up from above as its room is
     * (SceneBuilder.setIndoorGain). The sun on it is as much as reaches
     * the room it stands in, or — shut — the side the sun stands on: the
     * only face it can light looks that way. Null where neither side's
     * probes measure anything.
     */
    leafLight(door, leaf, point) {
        const zones = this.builder.doorSideZones(door.spec.id);
        const frame = door.group.matrixWorld;
        _normal.set(0, 0, 1).transformDirection(frame);
        const sides = (this.leafSides ??= [new Float32Array(18), new Float32Array(18)]);
        const found = [false, false];
        const suns = [1, 1];
        for (let side = 0; side < 2; side++) {
            // (A side whose own room measured nothing is left to the other side's, below: not to a third room's probe.)
            const light = this.sample(_side.copy(point).addScaledVector(_normal, side ? -LEAF_REACH : LEAF_REACH), zones[side] ?? "outside", false);
            if (!light) continue;
            found[side] = true;
            const gain = this.builder.indoorGainIn?.(zones[side], Math.max(...light)) ?? 1;
            for (let c = 0; c < 18; c++) sides[side][c] = light[c] * gain;
            suns[side] = this.sunNow;
        }
        if (!found[0] && !found[1]) return null;
        // (One side unmeasured: the other's, every way.)
        const [first, second] = found[0] && found[1] ? sides : found[0] ? [sides[0], sides[0]] : [sides[1], sides[1]];
        // How far the leaf has turned out of its wall's plane, and into which side its middle has swung.
        const into = _side.setFromMatrixPosition(frame).sub(point).dot(_normal) > 0 ? 1 : 0;
        const swung = Math.min(1, (1 - Math.abs(_side.set(0, 0, 1).transformDirection(leaf.matrixWorld).dot(_normal))) * 2);
        const room = into ? second : first;
        const mixed = (this.leafOut ??= new Float32Array(18));
        for (let f = 0; f < 6; f++) {
            // How far this way looks into the first side (1), or the second (-1): shut, that side's light, and across both the dimmer's.
            const looks = (f & 1 ? -1 : 1) * _normal.getComponent(f >> 1);
            const side = looks > 0 ? first : second;
            const across = 1 - Math.abs(looks);
            for (let c = f * 3, end = c + 3; c < end; c++) {
                const shut = side[c] + (Math.min(first[c], second[c]) - side[c]) * across;
                mixed[c] = shut + (room[c] - shut) * swung;
            }
        }
        const sun = this.world.environment?.sun;
        const sunSide = sun && _sun.subVectors(sun.position, sun.target.position).dot(_normal) < 0 ? 1 : 0;
        const lit = swung > 0.5 ? into : sunSide;
        this.sunNow = found[lit] ? suns[lit] : suns[1 - lit];
        return mixed;
    }

    /**
     * The light at a point, from the eight probes round it, blended by how
     * near each is: those in the room `zone` — the one the point stands in —
     * if any of them are, else any that measure light. Beyond the grid, its
     * edge's. If none of the eight measures anything, the nearest probe
     * within NEAR steps that does — the room's own, or failing that
     * (`others`) any; null without one.
     */
    sample(point, zone, others = true) {
        const [nx, ny, nz] = this.size;
        const cell = [0, 0, 0];
        const t = [0, 0, 0];
        const n = [nx, ny, nz];
        const p = [point.x, point.y, point.z];
        for (let a = 0; a < 3; a++) {
            const f = THREE.MathUtils.clamp((p[a] - this.origin[a]) / this.step[a], 0, n[a] - 1);
            cell[a] = Math.min(Math.floor(f), Math.max(0, n[a] - 2));
            t[a] = n[a] > 1 ? f - cell[a] : 0;
        }
        const own = this.zoneIds.indexOf(zone);
        const out = (this.out ??= new Float32Array(18));
        for (const sameRoom of [true, false]) {
            out.fill(0);
            let total = 0;
            let sun = 0;
            for (let corner = 0; corner < 8; corner++) {
                const dx = corner & 1;
                const dy = (corner >> 1) & 1;
                const dz = (corner >> 2) & 1;
                const ix = Math.min(cell[0] + dx, nx - 1);
                const iy = Math.min(cell[1] + dy, ny - 1);
                const iz = Math.min(cell[2] + dz, nz - 1);
                const index = ix + nx * (iy + ny * iz);
                const at = this.zoneOf[index];
                if (at === 255 || (sameRoom && at !== own)) continue;
                const weight = (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]);
                if (weight <= 0) continue;
                total += weight;
                const from = index * 18;
                for (let c = 0; c < 18; c++) out[c] += this.light[from + c] * weight;
                sun += (this.sun?.[index] ?? 1) * weight;
            }
            if (total > 1e-6) {
                for (let c = 0; c < 18; c++) out[c] /= total;
                this.sunNow = sun / total;
                return out;
            }
        }
        // None of the eight measures anything: a room whose probes saw no light as it was baked (a windowless
        // closet with every lamp off, a loft's far end), a point in a thick wall. The nearest that does, a little
        // further off — its own room's before any other's — rather than no light at all: a chest of drawers there
        // was drawn black in a lit room.
        let best = -1;
        let nearest = Infinity;
        for (let dz = -NEAR; dz <= NEAR + 1; dz++) {
            for (let dy = -NEAR; dy <= NEAR + 1; dy++) {
                for (let dx = -NEAR; dx <= NEAR + 1; dx++) {
                    const ix = cell[0] + dx;
                    const iy = cell[1] + dy;
                    const iz = cell[2] + dz;
                    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
                    const index = ix + nx * (iy + ny * iz);
                    const at = this.zoneOf[index];
                    if (at === 255 || (at !== own && !others)) continue;
                    const far = Math.hypot((dx - t[0]) * this.step[0], (dy - t[1]) * this.step[1], (dz - t[2]) * this.step[2]) + (at === own ? 0 : OTHER_ROOM);
                    if (far < nearest) {
                        nearest = far;
                        best = index;
                    }
                }
            }
        }
        if (best < 0) return null;
        out.set(this.light.subarray(best * 18, best * 18 + 18));
        this.sunNow = this.sun?.[best] ?? 1;
        return out;
    }
}

/** Whether a frame is the one kept of it (ProbeLight.rest), to the last digit; none kept, it is not. */
function sameFrame(kept, matrix) {
    if (!kept) return false;
    const e = matrix.elements;
    for (let i = 0; i < 16; i++) if (kept[i] !== e[i]) return false;
    return true;
}

/** The brightest of a sample's eighteen numbers (sample, leafLight): Math.max of them, without spreading them out to it. */
function brightest(values) {
    let most = -Infinity;
    for (let i = 0; i < values.length; i++) if (values[i] > most) most = values[i];
    return most;
}

/**
 * A lit material that takes its ambient light from the probes' six ways
 * (`cube`, updated as it moves): a surface facing up gets the light the
 * probes measured facing up, one facing sideways and up a blend of the
 * two — and none of the scene's ambient, hemisphere or probe light.
 */
function lightByProbes(material, cube, sun) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.probeCube = { value: cube };
        shader.uniforms.probeSun = sun;
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${PROBE_GLSL}`).replace("#include <lights_fragment_begin>", probeLightsBegin());
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|probe-light`;
    material.needsUpdate = true;
}

/**
 * The same light as lightByProbes gives each thing on its own, for many of
 * them drawn as one mesh (World/ShutBatcher.js: a public view's furniture
 * doors and drawers that are shut, a material and a floor at a time): each
 * thing's light read, where lightByProbes has it in uniforms, from a row of
 * `light.texture` — the row its triangles' vertices say (`partRow`). A row
 * is six texels: the six ways' light (`rgb`), and in the first two's alpha
 * how much of the sun reaches it (`probeSun`) and the share of its
 * reflections' daylight strength it is given (update's `factor`) — by which
 * each thing's material's `envMapIntensity` was set, and is multiplied here.
 *
 * @param {THREE.Material} material  a copy of what the things drawn by it wear undressed
 * @param {{ texture: { value: THREE.DataTexture }, rows: { value: number } }} light
 *        the rows (`rows`: how many in a column of six texels)
 */
export function lightByPartProbes(material, light, { reflections = true } = {}) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.partLight = light.texture;
        shader.uniforms.partRows = light.rows;
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${PART_ROW_VERTEX}`).replace("#include <begin_vertex>", "#include <begin_vertex>\n\treadPartRow();");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>\n${PART_PROBE_GLSL}`)
            .replace("void main() {", "void main() {\n\treadPartLight();")
            .replace("#include <lights_fragment_begin>", probeLightsBegin());
        // Its reflections' strength, as each thing's own material had it set (update, where it has reflections of its own): envMapIntensity times its row's share.
        if (reflections) shader.fragmentShader = shader.fragmentShader.replace("#include <envmap_physical_pars_fragment>", THREE.ShaderChunk.envmap_physical_pars_fragment.replaceAll("envMapIntensity", "( envMapIntensity * probeReflect )"));
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|part-probe-light${reflections ? "|reflect" : ""}`;
    material.needsUpdate = true;
}

/**
 * three's lights_fragment_begin with the probes' light in place of the
 * scene's ambient, hemisphere and probe light, and the sun as much as
 * reaches here (sunFromProbes) — and, where none of it does, not worked
 * out at all: its shadow map is not read, nor its light shaded. Nothing it
 * gave there was ever more than nothing (its colour times none of it), but
 * a soft shadow is many reads of the map a pixel — and 434 of Ladonia's
 * 475 shut doors and drawers, and everyone indoors, take none of the sun.
 */
function probeLightsBegin() {
    const begin = THREE.ShaderChunk.lights_fragment_begin;
    const without = [
        ["vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = probeIrradiance( geometryNormal );"],
        ["irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );", ""],
        ["irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", ""],
    ];
    const sun = begin.match(SUN_LOOP);
    if (without.some(([line]) => !begin.includes(line)) || !sun) console.warn("Probe light not applied: three's shader has changed");
    const code = without.reduce((text, [line, instead]) => text.replace(line, instead), begin);
    // The sun, as much of it as reaches here (sunFromProbes): none, and it is passed over.
    return code.replace(SUN_LOOP, (all, head, body) => `${head}\t\tif ( probeSun > 0.0 ) {\n${body.replace(SUN_INFO, `${SUN_INFO}\n\t\tdirectLight.color *= probeSun;`)}\n\t\t}`);
}

/** In three's lights_fragment_begin, the sun's turn (each directional light's): its light found, its shadow read, its light shaded. */
const SUN_LOOP = /(\t\tdirectionalLight = directionalLights\[ i \];\n)([\s\S]*?RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);)/;
const SUN_INFO = "getDirectionalLightInfo( directionalLight, directLight );";

/**
 * The probes' light on a surface facing `normal` (in view space): the six
 * ways' light, each by the square of how much the surface faces that way
 * (an "ambient cube"), as irradiance — π times what a probe stores, which
 * is as a lightmap stores it.
 */
const PROBE_IRRADIANCE = /* glsl */ `
vec3 probeIrradiance( const in vec3 normal ) {
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec3 s = n * n;
	return PI * (
		s.x * ( n.x >= 0.0 ? probeCube[ 0 ] : probeCube[ 1 ] ) +
		s.y * ( n.y >= 0.0 ? probeCube[ 2 ] : probeCube[ 3 ] ) +
		s.z * ( n.z >= 0.0 ? probeCube[ 4 ] : probeCube[ 5 ] ) );
}
`;

const PROBE_GLSL = /* glsl */ `
uniform vec3 probeCube[ 6 ];
uniform float probeSun;
${PROBE_IRRADIANCE}`;

/**
 * A part's row read where its vertices are drawn (lightByPartProbes), not
 * where each of its pixels is — a kitchen's fronts fill the frame, and six
 * reads a pixel were a third of a millisecond of the GPU's at the highest
 * step — and handed on unchanged (`flat`), twenty numbers in five: the six
 * ways' light, the sun's share and the reflections'.
 */
const PART_ROW_VERTEX = /* glsl */ `
attribute float partRow;
uniform highp sampler2D partLight;
uniform int partRows;
flat varying vec4 vPartA;
flat varying vec4 vPartB;
flat varying vec4 vPartC;
flat varying vec4 vPartD;
flat varying vec4 vPartE;
void readPartRow() {
	int part = int( partRow + 0.5 );
	int column = part / partRows;
	ivec2 at = ivec2( column * 6, part - column * partRows );
	vec4 t0 = texelFetch( partLight, at, 0 );
	vec4 t1 = texelFetch( partLight, at + ivec2( 1, 0 ), 0 );
	vec4 t2 = texelFetch( partLight, at + ivec2( 2, 0 ), 0 );
	vec4 t3 = texelFetch( partLight, at + ivec2( 3, 0 ), 0 );
	vec4 t4 = texelFetch( partLight, at + ivec2( 4, 0 ), 0 );
	vec4 t5 = texelFetch( partLight, at + ivec2( 5, 0 ), 0 );
	vPartA = t0;
	vPartB = t1;
	vPartC = vec4( t2.rgb, t3.r );
	vPartD = vec4( t3.gb, t4.rg );
	vPartE = vec4( t4.b, t5.rgb );
}
`;

/** ...the same light, handed on (PART_ROW_VERTEX), as lightByProbes has it in uniforms: at the start of main, before anything asks for it. */
const PART_PROBE_GLSL = /* glsl */ `
flat varying vec4 vPartA;
flat varying vec4 vPartB;
flat varying vec4 vPartC;
flat varying vec4 vPartD;
flat varying vec4 vPartE;
vec3 probeCube[ 6 ];
float probeSun;
float probeReflect;
void readPartLight() {
	probeCube[ 0 ] = vPartA.rgb;
	probeCube[ 1 ] = vPartB.rgb;
	probeCube[ 2 ] = vPartC.rgb;
	probeCube[ 3 ] = vec3( vPartC.a, vPartD.rg );
	probeCube[ 4 ] = vec3( vPartD.ba, vPartE.r );
	probeCube[ 5 ] = vPartE.gba;
	probeSun = vPartA.a;
	probeReflect = vPartB.a;
}
${PROBE_IRRADIANCE}`;

/** How bright daylight is in the open: the average light at the brightest tenth of the probes outside. */
function reference(light, zoneOf, outside) {
    const levels = [];
    for (let index = 0; index < zoneOf.length; index++) {
        if (zoneOf[index] !== outside) continue;
        let sum = 0;
        for (let f = 0; f < 6; f++) {
            const at = index * 18 + f * 3;
            sum += 0.2126 * light[at] + 0.7152 * light[at + 1] + 0.0722 * light[at + 2];
        }
        levels.push(sum / 6);
    }
    if (!levels.length) return 1;
    levels.sort((a, b) => a - b);
    return Math.max(levels[Math.floor(levels.length * 0.9)], 1e-4);
}

/** `count` little-endian 16-bit unsigned integers from `offset`. */
function uint16s(view, offset, count) {
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++) out[i] = view.getUint16(offset + i * 2, true);
    return out;
}

/** `count` little-endian half floats from `offset`, as floats. */
function halfs(view, offset, count) {
    const table = halfTable();
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = table[view.getUint16(offset + i * 2, true)];
    return out;
}

let table = null;
function halfTable() {
    if (table) return table;
    table = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
        const sign = h & 0x8000 ? -1 : 1;
        const exponent = (h >> 10) & 0x1f;
        const fraction = h & 0x3ff;
        if (exponent === 0) table[h] = sign * 2 ** -14 * (fraction / 1024);
        else if (exponent === 31) table[h] = fraction ? NaN : sign * Infinity;
        else table[h] = sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    }
    return table;
}

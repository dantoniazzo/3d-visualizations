import * as THREE from "three";

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
        for (const [root, entry] of this.tracked) if (!roots.has(root)) this.tracked.delete(root);
        const blend = Math.min(1, ADAPT * delta);
        // From above the rooms are brought up, and let down again, at once
        // (SceneBuilder.setIndoorGain): what stands in them with them, not
        // eased after — dark figures in a lit room, then lit ones in the
        // room as it was.
        const indoors = this.builder.indoorGain?.value ?? 1;
        const lifted = indoors !== this.indoorGain;
        this.indoorGain = indoors;
        for (const [root, lift] of roots) {
            let entry = this.tracked.get(root);
            if (!entry) {
                entry = { cube: Array.from({ length: 6 }, () => new THREE.Vector3()), sun: { value: 1 }, fresh: true, factor: 1, at: null, room: null };
                this.tracked.set(root, entry);
            }
            root.getWorldPosition(_position);
            // Which room it is in, looked for again only once it has moved:
            // the people round the property stay where they are.
            if (!entry.at?.equals(_position)) {
                entry.at = (entry.at ?? new THREE.Vector3()).copy(_position);
                entry.room = this.builder.roomAt(_position.x, _position.y, _position.z);
            }
            _position.y += lift;
            const door = this.leaves?.get(root);
            const target = door ? this.leafLight(door, root, _position) : this.sample(_position, entry.room?.id ?? "outside");
            // Nowhere the probes measured (up on a roof deck the grid does
            // not reach): until it is, as the scene lights it, rather than
            // dark — what has had the probes' light keeps the last of it.
            if (!target && entry.fresh) continue;
            this.dress(root, entry);
            if (!target) continue;
            const k = entry.fresh || lifted ? 1 : blend;
            entry.fresh = false;
            if (this.sunFromProbes) entry.sun.value += (this.sunNow - entry.sun.value) * k;
            // Indoors, brought up from above as the room round it is (SceneBuilder.setIndoorGain) — a leaf's each side already as its own room.
            const gain = door ? 1 : this.builder.indoorGainIn?.(entry.room, Math.max(...target)) ?? 1;
            let total = 0;
            for (let f = 0; f < 6; f++) {
                const c = entry.cube[f];
                c.x += (target[f * 3] * gain - c.x) * k;
                c.y += (target[f * 3 + 1] * gain - c.y) * k;
                c.z += (target[f * 3 + 2] * gain - c.z) * k;
                total += 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z;
            }
            entry.factor = THREE.MathUtils.clamp(total / 6 / this.reference, LEAST_REFLECTION, 1);
            for (const material of entry.materials) {
                if (material.envMap) material.envMapIntensity = material.userData.probeEnvMapIntensity * entry.factor;
            }
        }
    }

    /**
     * What moves, and how far above where it stands its light is taken: the
     * visitor's own avatar and everyone else's, the people round the
     * property (World/People.js) — at the middle of each, standing, sitting
     * or lying, hidden or not, so each keeps the materials it was given —
     * the cars, and the furniture's doors and drawers (Openables.js), which
     * are not baked.
     */
    roots() {
        const roots = new Map();
        for (const part of this.builder.openables?.parts || []) roots.set(part.node, 0);
        // Drawn from the bake, the doors' leaves too, which lit live take
        // their light from probes of their own (SceneBuilder.tintDoors).
        if (this.sunFromProbes) {
            /** leaf -> its door: lit a side at a time (leafLight) */
            this.leaves ??= new Map();
            for (const door of this.builder.doors || []) {
                for (const { leaf } of door.leaves) {
                    roots.set(leaf, 0);
                    this.leaves.set(leaf, door);
                }
            }
        }
        const player = this.world.player;
        if (player?.avatar) roots.set(player.avatar.avatar, 1.0);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) roots.set(other.model.avatar, 1.0);
        for (const person of this.world.people?.list ?? []) {
            roots.set(person.group, THREE.MathUtils.clamp(person.sphere.center.y - person.group.position.y, PERSON_LIFT.least, PERSON_LIFT.most));
        }
        for (const car of this.builder.cars || []) roots.set(car.group, 0.3);
        return roots;
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
        root.traverse((mesh) => {
            // (Drawn, for now, as a view lit live draws it — in a room its visitor has asked to see so: World/LiveRoom.js — its material is that room's to give back.)
            if (!mesh.isMesh || mesh.userData.roomLive || this.dressed.get(mesh) === mesh.material) return;
            const own = (material) => {
                if (!material || !LIT.some((flag) => material[flag])) return material;
                if (entry.materials.has(material)) return material;
                const clone = material.clone();
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
        const weights = this.builder.switchWeights || [];
        const live = this.builder.switchLive || [];
        const key = `${variant}|${weights.join(",")}|${live.map(Number).join("")}|${this.builder.doorLightVersion ?? 0}`;
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
        const begin = THREE.ShaderChunk.lights_fragment_begin;
        const without = [
            ["vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = probeIrradiance( geometryNormal );"],
            ["irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );", ""],
            ["irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", ""],
            // The sun, as much of it as reaches here (sunFromProbes).
            ["getDirectionalLightInfo( directionalLight, directLight );", "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= probeSun;"],
        ];
        if (without.some(([line]) => !begin.includes(line))) console.warn("Probe light not applied: three's shader has changed");
        const own = without.reduce((code, [line, instead]) => code.replace(line, instead), begin);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${PROBE_GLSL}`).replace("#include <lights_fragment_begin>", own);
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|probe-light`;
    material.needsUpdate = true;
}

/**
 * The probes' light on a surface facing `normal` (in view space): the six
 * ways' light, each by the square of how much the surface faces that way
 * (an "ambient cube"), as irradiance — π times what a probe stores, which
 * is as a lightmap stores it.
 */
const PROBE_GLSL = /* glsl */ `
uniform vec3 probeCube[ 6 ];
uniform float probeSun;
vec3 probeIrradiance( const in vec3 normal ) {
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec3 s = n * n;
	return PI * (
		s.x * ( n.x >= 0.0 ? probeCube[ 0 ] : probeCube[ 1 ] ) +
		s.y * ( n.y >= 0.0 ? probeCube[ 2 ] : probeCube[ 3 ] ) +
		s.z * ( n.z >= 0.0 ? probeCube[ 4 ] : probeCube[ 5 ] ) );
}
`;

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

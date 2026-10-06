import { EventEmitter } from "events";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import Experience from "../Experience.js";
import { buildOctree } from "./Collision.js";
import { INDOOR } from "./Sky.js";
import { applyReflection } from "../Utils/reflections.js";
import { QUALITY, onQualityChange } from "../Utils/device.js";

/**
 * The people round a property: standing in twos and threes on a terrace
 * with a drink, sitting on the sofas and the terrace chairs, lying on the
 * loungers by the pool — each one of the characters from Mixamo, playing
 * one of its clips, from the spec's `people` (placed once by
 * shared/people.js's planner, then the editor's to move).
 *
 * What it draws them from is the conversion pipeline's index
 * (scripts/optimize-people.mjs), /models/people/index.json — the
 * characters (`people/<id>.glb`), one file of clips for all of them
 * (`people/clips.glb`) and one of the things they hold or use
 * (`people/props.glb`, blender/export_props.py) — or, before there are any,
 * its stand-in's, index.standin.json, or failing that this file's own
 * (STAND_IN): the visitor's two avatars, playing their own Idle. A path in
 * an index is under /models/, or, written `./` or `../`, beside the index.
 * Each character is downloaded once and cloned per person, with a skeleton
 * of its own (SkeletonUtils) and a mixer playing its clip from a point of
 * its own (its `seed`), at a speed a little its own.
 *
 * A spec person: `{ id, character, pose: "stand"|"sit"|"lie", clip,
 * position, rotation, seat, prop, group, seed }`. `position` is the feet of
 * someone standing, and the point of the seat or lounger under the pelvis of
 * someone sitting or lying; `rotation` (degrees about the upright, as a
 * piece of furniture's: 0 north, toward −z, 90 west) the way they face —
 * lying, the way their head points. (A character faces +z in its own
 * frame: it is turned half round to face north at 0.) A clip of `null` is
 * the pose's own (the first of that pose in the index, one with a hand free
 * if they hold something). A character the index lacks is stood in for by
 * one it has ("male" by "standin-male", any other by one chosen by its
 * id), a clip it lacks by the pose's own.
 *
 * Placed by their pose: standing, the rig's root at the feet; sitting and
 * lying, the clip's seat — where its buttocks rest, from the index, or a
 * little under its pelvis — on the seat's point. A clip from the shared
 * file is fitted to each character: only its rotations and its hips'
 * movement are kept (each character keeps its own bones' lengths), the
 * hips' scaled by the index's character.hips / clips.hips (or, without
 * them, by the two skeletons' hips at rest). Lying on a lounger whose back
 * is raised (seats.json's `incline`), the clip is bent up at the waist to
 * lie along it.
 *
 * What they hold (`prop`, its grip "right" or "left" in the index) is in
 * that hand, its grip point (a prop's origin) where the fingers close —
 * measured from the hand itself, along its fingers and off its palm, the
 * prop upright when the thumb is, a cup's handle toward the palm (GRIPS) —
 * so it suits every character; held only by a clip with a hand free. A
 * prop whose grip is null is worn (sunglasses, on the face) or laid down
 * (a towel, past the feet of someone lying). A drink the index lacks is
 * drawn here — a wine glass, a flute, a pint, a tumbler or a cup, coloured
 * by its name — and anything else it lacks is left out.
 *
 * Lit as the furniture is: out of doors by the whole sky, indoors by its
 * indoor share (World/Sky.js), glowing with their room when its lights are
 * on (World/RoomGlow.js); casting shadows and taking them. Each character's
 * materials are copies, two sets of them — out of doors and in — so neither
 * the visitor's own avatar nor a person through the window is lit as the
 * other is.
 *
 * Drawn and animated within the quality step's `people` (Utils/device.js):
 * at most `most` of them, whole groups at a time; each culled by a fixed
 * sphere round its pose (a skinned mesh's own bounds are its rest pose's);
 * its mixer run every frame near the camera, every few further off, and not
 * at all out of sight or far away. Each is a box in the collision
 * (`collision.people`): the visitor walks round someone standing, and
 * round a seated person's legs.
 *
 * The editor's API:
 *   - `rebuild(spec?)` — everyone again from `spec.people` (the world's
 *     spec by default); returns a promise, as `ready` is.
 *   - `add(entry)` — one more person, added to `spec.people` unless it is
 *     there; resolves to its record.
 *   - `remove(id)` — gone from the scene and from `spec.people`.
 *   - `update(entry)` — a person changed: the spec's entry itself, changed,
 *     or `{ id, ...fields }` to change in it. Moved or turned, placed again
 *     (the same group); anything else (character, pose, clip, prop, seed),
 *     built again (a new group). Resolves to its record.
 *   - `readBack(id)` — after the editor has moved or turned a person's
 *     `group` itself (a gizmo drag), its entry's `position` and `rotation`
 *     from where the group now is; returns the entry.
 *   - `get(id)` (its record: `entry`, `group`, `indoor`, …), `list`,
 *     `objectFor(id)` (its group, to select and drag), `personOf(object)`
 *     (the id of the person an object — a ray's hit — is part of), `count`
 *     (as many as the spec has).
 *   - `show(on)` — all of them, and their boxes (the "people" scenery);
 *     `setFilter(fn)` — only those `fn(entry)` is true for (the editor's
 *     collections), or everyone with `null`.
 * Each person's group is `person:<id>`, its userData
 * `{ kind: "person", id, label }`, all of them under `root` ("people", in
 * the scene). Emits "ready" when a rebuild is done and "change" (with the
 * id) when one person is added, removed or changed by `update`. The world
 * runs it each frame with `tick(delta)`.
 */

/** The pipeline's index, and the stand-in's (scripts' conversion of assets/people). */
const INDEX_URLS = ["/models/people/index.json", "/models/people/index.standin.json"];
/** Where an index's paths are, unless written `./` or `../`. */
const MODELS = "/models/";
/** Where each piece of furniture is sat or lain on (scripts/measure-seats.mjs): a lounger's incline. */
const SEATS_URL = "/models/furniture/seats.json";

/**
 * Before there is any index at all: the visitor's two avatars (Ready
 * Player Me characters on Mixamo's skeleton), each playing its own Idle.
 */
const STAND_IN = {
    characters: [
        { id: "male", name: "Alex", file: "avatar_male.glb", height: 1.83 },
        { id: "female", name: "Sam", file: "avatar_female.glb", height: 1.8 },
    ],
    clips: { file: null, list: [{ name: "Idle", pose: "stand", hand: true, pelvis: [0, 1, 0], seat: null }] },
    props: { file: null, list: [] },
};

/**
 * Where in the hand each thing's grip point goes (a prop's origin is its
 * grip point: blender/export_props.py's, or the drinks drawn here), from
 * the hand's own shape (handFrame): `along` metres down the fingers from
 * the wrist, `out` metres off the line of the hand's bones toward the palm
 * — the palm's thickness and the prop's own radius there. By the
 * pipeline's prop id, or by the kind of a drink drawn here; as `default`,
 * `out` is the palm and its radius (or only the palm, for a handle).
 */
const GRIPS = {
    "wine-red": { along: 0.085, out: 0.026 },
    "wine-white": { along: 0.085, out: 0.026 },
    flute: { along: 0.085, out: 0.025 },
    tumbler: { along: 0.078, out: 0.06 },
    beer: { along: 0.08, out: 0.048 },
    coffee: { along: 0.072, out: 0.022 },
    book: { along: 0.07, out: 0.03 },
    wine: { along: 0.085, out: 0.026 },
    pint: { along: 0.078, out: 0.058 },
    cup: { along: 0.078, out: 0.058 },
    default: { along: 0.08, out: null },
};
/** How far off the palm the skin is, round what it holds, in metres. */
const PALM = 0.018;
/** What is worn rather than held or laid down, by its id; and where on the head, from the head's joint, in metres. */
const WORN = /sunglass|glasses|spectacles|hat\b|cap\b/;
const WEAR = { up: 0.075, forward: 0.1 };
/** How far past someone lying's feet what they brought (a towel) lies, in metres. */
const LAID_PAST_FEET = 0.16;

/** How far under the pelvis's joint the seat is, sitting or lying, without the index saying. */
const PELVIS_ABOVE_SEAT = 0.1;
/** Round each pose's bones: for the sphere it is culled by, and the box it collides as. */
const SPHERE_MARGIN = 0.3;
const BOX_MARGIN = 0.1;
/** The bones a pose's bounds are taken from: all but the fingers' and the eyes'. */
const SMALL_BONES = /(Thumb|Index|Middle|Ring|Pinky|Eye)/;

/** As every step drew them before there were steps for people. */
const DEFAULT_RATES = { most: Infinity, every: 1, near: 15, farEvery: 2, still: 120 };

/** Where each material of a person's came from: its character's, before it was copied. */
const SOURCE_MATERIAL = new WeakMap();

const _frustum = new THREE.Frustum();
const _matrix = new THREE.Matrix4();
const _eye = new THREE.Vector3();
const _v = new THREE.Vector3();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const PROXY_MATERIAL = new THREE.MeshBasicMaterial();

export default class People extends EventEmitter {
    /**
     * @param {World} world  its scene builder made
     * @param {object} [options]
     * @param {boolean} [options.shown]  whether they are drawn (the "people"
     *        scenery): hidden, nothing is downloaded until they are shown
     */
    constructor(world, { shown = true } = {}) {
        super();
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;
        this.world = world;
        this.spec = world.spec;
        this.loader = this.resources.loaders.gltfLoader;

        this.root = new THREE.Group();
        this.root.name = "people";
        this.root.visible = shown;
        this.scene.add(this.root);

        /** id -> person (its record: entry, group, model, mixer, …) */
        this.people = new Map();
        /** url -> Promise<gltf> */
        this.files = new Map();
        /** character id -> Promise<character> */
        this.characters = new Map();
        /** prop key -> Promise<{ object, height, radius }> */
        this.propSources = new Map();
        /** The drinks drawn here: their geometries and materials, by kind and colour. */
        this.drawn = new Map();
        this.filter = null;
        this.generation = 0;
        this.frame = 0;
        this.built = false;
        this.stats = { shown: 0, inView: 0, animated: 0 };

        this.stopQuality = onQualityChange(() => this.refreshVisibility());
        this.ready = shown && this.count ? this.rebuild() : Promise.resolve();
    }

    /** As many as the spec has, drawn or not. */
    get count() {
        return this.spec?.people?.length ?? 0;
    }

    /** Every person built, in the spec's order. */
    get list() {
        return (this.spec?.people ?? []).map((entry) => this.people.get(entry.id)).filter(Boolean);
    }

    get(id) {
        return this.people.get(id) ?? null;
    }

    objectFor(id) {
        return this.people.get(id)?.group ?? null;
    }

    /** The id of the person `object` is part of, or null. */
    personOf(object) {
        for (let node = object; node; node = node.parent) {
            if (node.userData?.kind === "person") return node.userData.id;
            if (node === this.root) break;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // The editor's API
    // ------------------------------------------------------------------

    /** Everyone again, from `spec.people`. */
    rebuild(spec = this.world.spec) {
        this.spec = spec;
        const generation = ++this.generation;
        for (const person of this.people.values()) this.drop(person);
        this.people.clear();
        this.built = true;
        const entries = spec?.people ?? [];
        this.ready = Promise.all(entries.map((entry) => this.build(entry, generation))).then(() => {
            if (generation !== this.generation) return;
            this.changed();
            this.emit("ready", this);
        });
        return this.ready;
    }

    /** One more person; added to the spec's list unless it is there. */
    async add(entry) {
        this.spec.people ??= [];
        if (!this.spec.people.includes(entry)) this.spec.people.push(entry);
        const person = await this.build(entry, this.generation);
        this.changed();
        this.emit("change", entry.id);
        return person;
    }

    /** Gone from the scene and from the spec. */
    remove(id) {
        const list = this.spec?.people ?? [];
        const at = list.findIndex((entry) => entry.id === id);
        if (at >= 0) list.splice(at, 1);
        const person = this.people.get(id);
        if (person) this.drop(person);
        this.people.delete(id);
        this.changed();
        this.emit("change", id);
    }

    /**
     * A person changed: placed again if only moved or turned, built again
     * otherwise.
     *
     * @param {object} change  its spec entry, or `{ id, ...fields }` to change in it
     */
    async update(change) {
        const entry = this.spec?.people?.find((item) => item.id === change.id);
        if (!entry) return null;
        if (change !== entry) Object.assign(entry, change);
        const person = this.people.get(entry.id);
        if (person && person.key === buildKey(entry)) {
            person.entry = entry;
            this.place(person);
            this.useMaterials(person);
            this.changed();
            this.emit("change", entry.id);
            return person;
        }
        if (person) this.drop(person);
        this.people.delete(entry.id);
        const rebuilt = await this.build(entry, this.generation);
        this.changed();
        this.emit("change", entry.id);
        return rebuilt;
    }

    /** A person's entry from where its group now is (moved by the editor), and the entry. */
    readBack(id) {
        const person = this.people.get(id);
        if (!person) return null;
        const { entry, group, info } = person;
        let yaw = group.rotation.y - Math.PI + (entry.pose === "lie" ? info.headYaw : 0);
        const contact = this.contact(person).applyAxisAngle(THREE.Object3D.DEFAULT_UP, group.rotation.y);
        entry.position = group.position.clone().add(contact).toArray().map((v) => round(v, 3));
        // In (−180, 180], as shared/people.js keeps it.
        yaw = round(THREE.MathUtils.radToDeg(yaw), 1);
        yaw -= 360 * Math.floor((yaw + 180) / 360);
        entry.rotation = round(yaw === -180 ? 180 : yaw, 1) + 0;
        this.place(person);
        this.useMaterials(person);
        this.changed();
        return entry;
    }

    /** All of them, or none: the "people" scenery (World/Scenery.js). */
    show(on) {
        this.root.visible = on;
        if (on && !this.built && this.count) this.rebuild();
        this.changed();
    }

    /** Only those `fn(entry)` is true for, or everyone (`null`). */
    setFilter(fn) {
        this.filter = fn;
        this.refreshVisibility();
    }

    // ------------------------------------------------------------------
    // Building a person
    // ------------------------------------------------------------------

    /**
     * A person from its entry: its character cloned, its clip playing, what
     * it holds in its hand, placed. Resolves to its record, or null if a
     * rebuild came first or its character would not load.
     */
    async build(entry, generation) {
        if (!entry?.id) return null;
        const token = {};
        this.pending ??= new Map();
        this.pending.set(entry.id, token);
        const current = () => generation === this.generation && this.pending.get(entry.id) === token;
        let person = null;
        try {
            const index = await this.index();
            const character = await this.characterFor(entry, index);
            if (!character || !current()) return null;
            const clipEntry = clipFor(entry, index);
            if (clipEntry && !character.own.has(clipEntry.name)) await this.library(index);
            const clip = this.animation(character, clipEntry, index);
            // Held only with a hand free; laid down or worn whatever the clip.
            const propEntry = entry.prop ? propFor(entry.prop, index) : null;
            const usable = propEntry && (propEntry.grip === null || clipEntry?.hand !== false);
            const prop = usable ? await this.propSource(propEntry, index) : null;
            if (!current()) return null;

            const { clone: model, skeletons } = cloneCharacter(character.source);
            // Measured and fitted where it stands alone, at the origin, before it is placed.
            const group = new THREE.Group();
            group.name = `person:${entry.id}`;
            group.userData = { kind: "person", id: entry.id, label: character.name };
            group.add(model);
            const meshes = [];
            model.traverse((node) => {
                if (!node.isMesh) return;
                node.castShadow = true;
                node.receiveShadow = true;
                // Culled by a sphere round its pose (fitBounds), not left out.
                node.frustumCulled = true;
                if (!SOURCE_MATERIAL.has(node)) SOURCE_MATERIAL.set(node, node.material);
                meshes.push(node);
            });

            const mixer = new THREE.AnimationMixer(model);
            const action = clip ? mixer.clipAction(clip) : null;
            action?.play();
            mixer.update(0);
            person = {
                id: entry.id,
                entry,
                key: buildKey(entry),
                index: (this.serial = (this.serial ?? 0) + 1),
                character,
                clipEntry,
                clip,
                group,
                model,
                meshes,
                skeletons,
                mixer,
                action,
                pending: 0,
                sphere: new THREE.Sphere(),
                indoor: null,
            };
            // Measured as it is at the clip's start, with nothing round it.
            person.info = this.measure(person);
            fitBounds(person);
            if (prop && propEntry.grip) this.hold(person, prop, propEntry);
            else if (prop) this.lay(person, prop, propEntry);

            // From a point in the clip of its own, at a speed of its own.
            const random = seeded(entry.seed ?? hash(entry.id));
            if (action) {
                action.time = random() * clip.duration;
                action.timeScale = 0.92 + 0.16 * random();
            }
            mixer.update(0);
            person.bend = await this.bendFor(person);
            if (!current()) {
                this.drop(person);
                return null;
            }
            bend(person);

            const before = this.people.get(entry.id);
            if (before) this.drop(before);
            this.people.set(entry.id, person);
            this.root.add(group);
            this.place(person);
            this.useMaterials(person);
            return person;
        } catch (error) {
            console.warn(`Person ${entry.id} could not be built`, error);
            if (person) this.drop(person);
            return null;
        } finally {
            if (this.pending.get(entry.id) === token) this.pending.delete(entry.id);
        }
    }

    /**
     * Where its pose's bones are at the clip's start, relative to its root:
     * its pelvis, the way its head lies (lying), its seat — the point it
     * sits or lies on — and the box round it. Once per character and clip.
     */
    measure(person) {
        const { character, clipEntry, model, group } = person;
        const key = clipEntry?.name ?? "";
        if (character.poses.has(key)) return character.poses.get(key);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const pelvis = new THREE.Vector3();
        let head = null;
        const feet = [];
        model.traverse((node) => {
            if (node.isMesh || !character.boneSet.has(node.name)) return;
            const name = canonical(node.name);
            if (SMALL_BONES.test(name)) return;
            node.getWorldPosition(_v);
            box.expandByPoint(_v);
            if (name === "Hips") pelvis.copy(_v);
            if (name === "Head") head = _v.clone();
            if (name === "LeftFoot" || name === "RightFoot") feet.push(_v.clone());
        });
        if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 1.8, 0.2));
        // Lying, the way its head points from its pelvis, for `rotation` to turn it to.
        let headYaw = 0;
        if (head && Math.hypot(head.x - pelvis.x, head.z - pelvis.z) > 0.3) headYaw = Math.atan2(head.x - pelvis.x, head.z - pelvis.z);
        const scale = character.clipScale.get(key) ?? 1;
        const seat = clipEntry?.seat
            ? new THREE.Vector3(...clipEntry.seat).multiplyScalar(scale)
            : new THREE.Vector3(pelvis.x, pelvis.y - PELVIS_ABOVE_SEAT, pelvis.z);
        const info = { pelvis, headYaw, seat, box, feet: feet.length ? feet.reduce((sum, foot) => sum.add(foot), new THREE.Vector3()).divideScalar(feet.length) : null };
        character.poses.set(key, info);
        return info;
    }

    /**
     * Lying on a lounger with its back raised (seats.json's `incline` for
     * the piece its seat is on): the turn of its spine that sits its back
     * against the lounger's — about the line across its waist, its head
     * going up. Null for anyone else, or for a clip that is not a lying one.
     */
    async bendFor(person) {
        const { entry, clipEntry, character, model } = person;
        if (entry.pose !== "lie" || clipEntry?.pose !== "lie" || !entry.seat?.furniture) return null;
        const placement = this.spec?.furniture?.find((item) => item.id === entry.seat.furniture);
        if (!placement) return null;
        this.seatsPromise ??= fetch(SEATS_URL)
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null);
        const incline = (await this.seatsPromise)?.[placement.catalog_id]?.lie?.incline ?? 0;
        const name = character.boneNames.get("Spine");
        const spine = name ? model.getObjectByName(name) : null;
        if (!incline || !spine) return null;
        // Across the waist, at the clip's start: the head's way, crossed with the upright.
        const h = person.info.headYaw;
        return { spine, axis: new THREE.Vector3(-Math.cos(h), 0, Math.sin(h)), angle: THREE.MathUtils.degToRad(incline), bent: null };
    }

    /** Where on its rig it rests on its spot: its feet standing, its seat sitting or lying. */
    contact(person) {
        return person.entry.pose === "sit" || person.entry.pose === "lie" ? person.info.seat.clone() : new THREE.Vector3();
    }

    /** Put on its spot, facing its way. */
    place(person) {
        const { entry, group, info } = person;
        // A rotation of 0 faces north (−z), as a piece of furniture's front does; the rig faces +z.
        let yaw = THREE.MathUtils.degToRad(entry.rotation ?? 0) + Math.PI;
        if (entry.pose === "lie") yaw -= info.headYaw;
        group.rotation.set(0, yaw, 0);
        const contact = this.contact(person).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        const [x = 0, y = 0, z = 0] = entry.position ?? [];
        group.position.set(x - contact.x, y - contact.y, z - contact.z);
        group.updateMatrixWorld(true);
        person.sphere.copy(person.localSphere).applyMatrix4(group.matrixWorld);
        // Indoors or out, by the room its spot is in (as Sky.classifyFurniture has it).
        const room = this.world.sceneBuilder?.roomAt?.(x, y + 0.05, z);
        person.indoor = Boolean(room && room.ceiling_finish !== "none");
    }

    /** Its character's materials, as lit indoors or out. */
    useMaterials(person) {
        const set = person.indoor ? "indoor" : "outdoor";
        if (person.materials === set) return;
        person.materials = set;
        const copies = person.character.materials[set];
        const copy = (material) => {
            if (!material) return material;
            if (!copies.has(material)) {
                const made = material.clone();
                // Lit as a room's furnishings are, indoors; by the whole sky out of doors.
                made.userData.skyShare = person.indoor ? INDOOR : 1;
                if (person.indoor) made.userData.furnishing = true;
                applyReflection(made);
                copies.set(material, made);
                this.relight = true;
            }
            return copies.get(material);
        };
        for (const mesh of person.meshes) {
            const source = SOURCE_MATERIAL.get(mesh);
            mesh.material = Array.isArray(source) ? source.map(copy) : copy(source);
        }
        // New to the scene, or new materials: lit as everything else is, next frame.
        this.relight = true;
    }

    /** Something held in its hand. */
    hold(person, prop, propEntry) {
        const side = propEntry.grip === "left" ? "Left" : "Right";
        const name = person.character.boneNames.get(`${side}Hand`);
        const hand = name ? person.model.getObjectByName(name) : null;
        if (!hand) return;
        const frame = handFrame(person.character, side);
        if (!frame) return;
        const grip = GRIPS[propEntry.id] ?? GRIPS[prop.kind] ?? GRIPS.default;
        const handle = Math.hypot(...prop.off) > 0.01;
        const out = grip.out ?? PALM + (handle ? 0.004 : prop.radius);
        // The prop upright when the thumb is, its grip on the line round
        // which the fingers close.
        const x = frame.fingers;
        const y = frame.across;
        const z = new THREE.Vector3().crossVectors(x, y);
        const basis = new THREE.Matrix4().makeBasis(x, y, z);
        const at = frame.wrist.clone().addScaledVector(frame.fingers, grip.along).addScaledVector(frame.palm, out);
        const world = basis.setPosition(at);
        const local = frame.inverse.clone().multiply(world);
        const holder = new THREE.Group();
        holder.name = `held:${propEntry.id}`;
        local.decompose(holder.position, holder.quaternion, holder.scale);
        const object = prop.object.clone(true);
        // Held by a handle: the cup turned about its upright so that its
        // body is out past the fingers, off the palm (−z here, +z in a left hand).
        if (handle) object.rotation.y = (side === "Right" ? Math.PI : 0) - Math.atan2(-prop.off[0], -prop.off[1]);
        shadeProp(object);
        holder.add(object);
        hand.add(holder);
        person.prop = holder;
    }

    /**
     * Something not held: worn (sunglasses, a hat — on the head), or laid
     * down beside someone lying (a towel, an open book: across the
     * lounger, past their feet). Left out for anyone else.
     */
    lay(person, prop, propEntry) {
        const { info, character, model, group } = person;
        if (WORN.test(propEntry.id)) {
            const frame = headFrame(character);
            const name = character.boneNames.get("Head");
            const head = name ? model.getObjectByName(name) : null;
            if (!frame || !head) return;
            // Its bridge on the nose, facing the way the face does.
            const z = frame.forward;
            const y = frame.up;
            const x = new THREE.Vector3().crossVectors(y, z);
            const at = frame.joint.clone().addScaledVector(y, WEAR.up).addScaledVector(z, WEAR.forward);
            const local = frame.inverse.clone().multiply(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at));
            const holder = new THREE.Group();
            holder.name = `worn:${propEntry.id}`;
            local.decompose(holder.position, holder.quaternion, holder.scale);
            const object = prop.object.clone(true);
            shadeProp(object);
            holder.add(object);
            head.add(holder);
            person.prop = holder;
            return;
        }
        if (person.entry.pose !== "lie" || !info.feet) return;
        const way = new THREE.Vector3(Math.sin(info.headYaw), 0, Math.cos(info.headYaw));
        const object = prop.object.clone(true);
        // Its base on the lounger, its middle a little past the feet.
        object.position.copy(info.feet).addScaledVector(way, -LAID_PAST_FEET);
        object.position.y = info.seat.y + 0.004 - prop.base;
        object.rotation.y = info.headYaw;
        object.name = `laid:${propEntry.id}`;
        shadeProp(object);
        group.add(object);
        person.prop = object;
    }

    // ------------------------------------------------------------------
    // What they are made of
    // ------------------------------------------------------------------

    /** The index, once: the pipeline's, the stand-in's, or this file's own. */
    index() {
        this.indexPromise ??= (async () => {
            for (const url of INDEX_URLS) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    return normaliseIndex(await response.json(), new URL(url, window.location.href).href);
                } catch {
                    // Not there, or not JSON (a page in its place): the next.
                }
            }
            return normaliseIndex(STAND_IN, new URL(MODELS, window.location.href).href);
        })();
        return this.indexPromise;
    }

    /** A GLB, once, or the one the preloader already has (the avatars). */
    file(url) {
        if (!this.files.has(url)) {
            const asset = this.resources.assets?.find((item) => item.type === "glbModel" && new URL(item.path, window.location.href).href === url);
            const preloaded = asset ? this.resources.items[asset.name] : null;
            const promise = preloaded ? Promise.resolve({ ...preloaded, preloaded: true }) : this.loader.loadAsync(url);
            this.files.set(url, promise);
            promise.catch(() => this.files.delete(url));
        }
        return this.files.get(url);
    }

    /**
     * Its character, loaded: the index's of its id, or one standing in for
     * it chosen by its id — and if that will not load, any that will.
     */
    async characterFor(entry, index) {
        const list = index.characters;
        if (!list.length) return null;
        // Its own, or the stand-in for it ("male" is "standin-male").
        const id = entry.character;
        const named = list.find((item) => item.id === id) ?? (id ? list.find((item) => item.id.endsWith(`-${id}`) || item.id.startsWith(`${id}-`)) : null);
        const first = named ?? list[hash(entry.character ?? entry.id) % list.length];
        const order = [first, ...list.filter((item) => item !== first)];
        for (const description of order) {
            try {
                return await this.character(description);
            } catch (error) {
                console.warn(`Character ${description.id} did not load`, error);
            }
        }
        return null;
    }

    character(description) {
        if (!this.characters.has(description.id)) {
            const promise = this.file(description.url).then((gltf) => makeCharacter(description, gltf));
            this.characters.set(description.id, promise);
            promise.catch(() => this.characters.delete(description.id));
        }
        return this.characters.get(description.id);
    }

    /**
     * Its clip, as it plays on this character: its own of the name if it
     * has one (the stand-ins' Idle), or the shared file's fitted to it.
     */
    animation(character, clipEntry, index) {
        if (!clipEntry) return character.own.values().next().value ?? null;
        const name = clipEntry.name;
        if (character.own.has(name)) return character.own.get(name);
        if (character.fitted.has(name)) return character.fitted.get(name);
        const library = index.clipLibrary;
        const clip = library?.animations?.find((item) => item.name === name) ?? null;
        if (!clip) return character.own.values().next().value ?? null;
        // As the index has it (scripts/optimize-people.mjs): its character's hips over its clips'.
        const ratio = character.hips && index.clips.hips ? character.hips / index.clips.hips : null;
        const { fitted, scale } = fitClip(clip, character, library.standHips, ratio);
        character.fitted.set(name, fitted);
        character.clipScale.set(name, scale);
        return fitted;
    }

    /**
     * The shared file of clips, once — with how high its skeleton's hips
     * are at rest, for each clip's hips' movement to be scaled to a
     * character's (fitClip).
     */
    async library(index) {
        if (!index.clips.url) return null;
        index.libraryPromise ??= this.file(index.clips.url)
            .then((gltf) => {
                const animations = gltf.animations ?? [];
                let standHips = null;
                gltf.scene.traverse((node) => {
                    if (standHips === null && !node.isMesh && canonical(node.name) === "Hips") standHips = node.position.length();
                });
                // Without a skeleton in it: its standing clips' hips at their start.
                if (!standHips) {
                    const heights = [];
                    for (const item of index.clips.list) {
                        if (item.pose !== "stand") continue;
                        const track = animations.find((clip) => clip.name === item.name)?.tracks.find((t) => {
                            const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(t.name);
                            return canonical(nodeName) === "Hips" && propertyName === "position";
                        });
                        if (track) heights.push(Math.hypot(track.values[0], track.values[1], track.values[2]));
                    }
                    heights.sort((a, b) => a - b);
                    standHips = heights.length ? heights[heights.length >> 1] : null;
                }
                return { animations, standHips };
            })
            .catch((error) => {
                console.warn("The people's clips did not load; each plays its own, if it has one", error);
                return null;
            });
        index.clipLibrary = await index.libraryPromise;
        return index.clipLibrary;
    }

    /** What it holds, made once: the pipeline's node, or a drink drawn here. */
    propSource(propEntry, index) {
        const key = propEntry.id;
        if (!this.propSources.has(key)) {
            const promise = (async () => {
                if (index.props.url && propEntry.node) {
                    try {
                        const gltf = await this.file(index.props.url);
                        const node = gltf.scene.getObjectByName(propEntry.node) ?? gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(propEntry.node));
                        if (node) return pipelineProp(node);
                    } catch (error) {
                        console.warn("The people's props did not load; their drinks are drawn instead", error);
                    }
                }
                // A drink, drawn here; anything else the index lacks (a towel, a book), nothing.
                return drinkKind(propEntry.id) ? this.drawnProp(propEntry.id) : null;
            })();
            this.propSources.set(key, promise);
        }
        return this.propSources.get(key);
    }

    /** A drink drawn here, by its name: the glass (or cup), and what is in it. */
    drawnProp(id) {
        const kind = drinkKind(id);
        const colour = drinkColour(id);
        const key = `${kind}|${colour}`;
        if (!this.drawn.has(key)) {
            const shape = DRINKS[kind];
            const glass = new THREE.LatheGeometry(shape.glass.map(([r, y]) => new THREE.Vector2(r, y)), 20);
            const drink = new THREE.LatheGeometry(shape.drink.map(([r, y]) => new THREE.Vector2(r, y)), 20);
            // Clear, reflecting the sky as the rest of the garden does: the
            // studio's reflections (Utils/reflections.js) turned it to milk.
            this.glassMaterial ??= new THREE.MeshStandardMaterial({
                name: "person_glass",
                color: "#ffffff",
                roughness: 0.05,
                metalness: 0,
                transparent: true,
                opacity: 0.18,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            this.cupMaterial ??= new THREE.MeshStandardMaterial({ name: "person_cup", color: "#f3f0ea", roughness: 0.35, side: THREE.DoubleSide });
            const drinkMaterial = shape.opaque
                ? new THREE.MeshStandardMaterial({ name: "person_drink", color: colour, roughness: 0.3 })
                : new THREE.MeshStandardMaterial({ name: "person_drink", color: colour, roughness: 0.2, transparent: true, opacity: 0.88 });
            this.drawn.set(key, { glass, drink, drinkMaterial });
        }
        const { glass, drink, drinkMaterial } = this.drawn.get(key);
        const shape = DRINKS[kind];
        const object = new THREE.Group();
        object.name = `drink:${id}`;
        const liquid = new THREE.Mesh(drink, drinkMaterial);
        liquid.renderOrder = 1;
        const shell = new THREE.Mesh(glass, shape.opaque ? this.cupMaterial : this.glassMaterial);
        shell.renderOrder = 2;
        // Its grip point at its origin, as the pipeline's props have theirs.
        const inner = new THREE.Group();
        inner.position.y = -shape.at * shape.height;
        inner.add(liquid, shell);
        object.add(inner);
        return { object, kind, height: shape.height, radius: shape.radius, off: [0, 0], base: -shape.at * shape.height };
    }

    // ------------------------------------------------------------------
    // Each frame
    // ------------------------------------------------------------------

    /** Something changed: who is drawn, their boxes, their lamps' shadows. */
    changed() {
        this.refreshVisibility();
    }

    /**
     * Who is drawn: within the step's most — whole groups, the same ones
     * every time — and the editor's filter.
     */
    refreshVisibility() {
        const rates = QUALITY.people ?? DEFAULT_RATES;
        const allowed = chosen(this.spec?.people ?? [], rates.most);
        for (const person of this.people.values()) {
            person.group.visible = allowed.has(person.id) && (!this.filter || Boolean(this.filter(person.entry)));
        }
        this.collisionDirty = true;
        this.shadowsDirty = true;
    }

    /**
     * Each frame (World.update): each one in view and near enough animated,
     * as often as the step says. (`update` is the editor's: a person changed.)
     */
    tick(delta) {
        if (this.collisionDirty) this.buildCollision();
        if (!this.people.size) return;
        if (this.relight) this.lightUp();
        if (this.shadowsDirty) {
            this.shadowsDirty = false;
            this.world.lampPool?.redrawAll();
        }
        const rates = QUALITY.people ?? DEFAULT_RATES;
        const camera = this.experience.camera.activeCamera;
        _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_matrix);
        camera.getWorldPosition(_eye);
        this.frame++;
        const stats = { shown: 0, inView: 0, animated: 0 };
        const drawn = this.root.visible;
        for (const person of this.people.values()) {
            person.pending += delta;
            if (!drawn || !person.group.visible || !person.action) continue;
            stats.shown++;
            if (!_frustum.intersectsSphere(person.sphere)) continue;
            stats.inView++;
            const distance = _eye.distanceTo(person.sphere.center);
            if (distance > rates.still) continue;
            const every = distance <= rates.near ? rates.every : rates.farEvery;
            if ((this.frame + person.index) % Math.max(1, every)) continue;
            person.mixer.update(person.pending);
            person.pending = 0;
            if (person.bend) bend(person);
            stats.animated++;
        }
        this.stats = stats;
    }

    /** New materials lit as the rest of the scene is: the sky's share, a room's glow. */
    lightUp() {
        this.relight = false;
        this.world.roomGlow?.applyTo(this.root);
        if (this.world.sky?.current) this.world.sky.applyIndoor();
    }

    /** A box round each person drawn, for the visitor to walk round. */
    buildCollision() {
        this.collisionDirty = false;
        const collision = this.world.collision;
        if (!collision?.setPeople) return;
        const proxies = new THREE.Group();
        if (this.root.visible) {
            for (const person of this.people.values()) {
                if (!person.group.visible) continue;
                const box = person.collisionBox;
                const proxy = new THREE.Mesh(UNIT_BOX, PROXY_MATERIAL);
                box.getCenter(proxy.position);
                proxy.position.applyMatrix4(person.group.matrixWorld);
                proxy.quaternion.copy(person.group.quaternion);
                box.getSize(proxy.scale);
                proxies.add(proxy);
            }
        }
        collision.setPeople(proxies.children.length ? buildOctree([proxies]) : null);
    }

    /** A person's clone, mixer and prop gone; what it shares with the others kept. */
    drop(person) {
        this.root.remove(person.group);
        person.mixer.stopAllAction();
        person.mixer.uncacheRoot(person.model);
        for (const skeleton of person.skeletons) skeleton.dispose();
        this.collisionDirty = true;
        this.shadowsDirty = true;
    }

    /** All of it: the people, their copies of materials, what was downloaded for them. */
    dispose() {
        this.generation++;
        this.stopQuality?.();
        for (const person of this.people.values()) this.drop(person);
        this.people.clear();
        this.scene.remove(this.root);
        this.world.collision?.setPeople?.(null);
        for (const promise of this.characters.values()) {
            promise
                .then((character) => {
                    for (const set of Object.values(character.materials)) for (const material of set.values()) material.dispose();
                })
                .catch(() => {});
        }
        for (const promise of this.files.values()) {
            promise
                .then((gltf) => {
                    // The preloader's (the avatars) are the visitor's too.
                    if (gltf.preloaded) return;
                    gltf.scene.traverse((node) => {
                        if (!node.isMesh) return;
                        node.geometry.dispose();
                        for (const material of [node.material].flat()) material?.dispose();
                    });
                })
                .catch(() => {});
        }
        for (const { glass, drink, drinkMaterial } of this.drawn.values()) {
            glass.dispose();
            drink.dispose();
            drinkMaterial.dispose();
        }
        this.glassMaterial?.dispose();
        this.cupMaterial?.dispose();
    }
}

// ----------------------------------------------------------------------
// The index
// ----------------------------------------------------------------------

/**
 * An index made whole: its paths as URLs (under /models/, or beside the
 * index when written `./` or `../`), its clips each with a pose and a hand.
 */
function normaliseIndex(raw, indexUrl) {
    const resolve = (file) => {
        if (!file) return null;
        const base = /^\.\.?\//.test(file) ? indexUrl : new URL(MODELS, window.location.href).href;
        return new URL(file, base).href;
    };
    const characters = (raw.characters ?? [])
        .filter((item) => item?.id && item.file)
        .map((item) => ({ id: item.id, name: item.name ?? item.id, url: resolve(item.file), height: item.height ?? null, hips: item.hips ?? null }));
    const clips = (raw.clips?.list ?? []).map((clip) => ({
        name: clip.name,
        pose: clip.pose ?? "stand",
        hand: clip.hand !== false,
        pelvis: clip.pelvis ?? null,
        seat: clip.seat ?? null,
    }));
    // A grip of null: laid down or worn, not held.
    const props = (raw.props?.list ?? [])
        .filter((prop) => prop?.id)
        .map((prop) => ({ id: prop.id, node: prop.node ?? prop.id, grip: prop.grip === null ? null : prop.grip === "left" ? "left" : "right" }));
    return {
        characters,
        clips: { url: resolve(raw.clips?.file), hips: raw.clips?.hips ?? null, list: clips },
        props: { url: resolve(raw.props?.file), list: props },
        clipLibrary: null,
    };
}

/** The clip a person plays: its own, or its pose's (one with a hand free, holding something). */
function clipFor(entry, index) {
    const list = index.clips.list;
    const pose = entry.pose ?? "stand";
    return (
        (entry.clip && list.find((clip) => clip.name === entry.clip)) ||
        (entry.prop && list.find((clip) => clip.pose === pose && clip.hand)) ||
        list.find((clip) => clip.pose === pose) ||
        list.find((clip) => clip.pose === "stand") ||
        list[0] ||
        null
    );
}

/** A prop's entry in the index, or one for a drink drawn here. */
function propFor(id, index) {
    return index.props.list.find((prop) => prop.id === id) ?? { id, node: null, grip: WORN.test(id) ? null : "right" };
}

/** What makes a person need building again, rather than only moving. */
function buildKey(entry) {
    return JSON.stringify([entry.character ?? null, entry.pose ?? "stand", entry.clip ?? null, entry.prop ?? null, entry.seed ?? null]);
}

/**
 * Who is drawn of `entries` when only `most` may be: whole groups (a
 * person alone is a group of one), in an order fixed by their names, each
 * that still fits.
 */
function chosen(entries, most) {
    if (!(most < entries.length)) return new Set(entries.map((entry) => entry.id));
    const groups = new Map();
    for (const entry of entries) {
        const key = entry.group ?? `#${entry.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry.id);
    }
    const order = [...groups.entries()].sort(([a], [b]) => hash(a) - hash(b) || (a < b ? -1 : 1));
    const out = new Set();
    for (const [, ids] of order) {
        if (out.size + ids.length > most) continue;
        for (const id of ids) out.add(id);
    }
    return out;
}

// ----------------------------------------------------------------------
// Characters and their clips
// ----------------------------------------------------------------------

/** A bone's name without its rig's prefix: `mixamorigHips`, `mixamorig:Hips` and `Hips` are all `Hips`. */
function canonical(name) {
    return String(name ?? "").replace(/^.*mixamorig\d*[:_]?/i, "");
}

/** A character as a person is made of it: its scene, its bones by name, its clips, its materials' copies. */
function makeCharacter(description, gltf) {
    const source = gltf.scene;
    source.updateMatrixWorld(true);
    const boneNames = new Map();
    source.traverse((node) => {
        if (node.isMesh) return;
        const name = canonical(node.name);
        if (name && !boneNames.has(name) && (node.isBone || /^mixamorig/i.test(node.name))) boneNames.set(name, node.name);
    });
    // A rig whose bones were not made Bones (none at all, as named): its skinned meshes' skeletons say.
    source.traverse((node) => {
        if (!node.isSkinnedMesh) return;
        for (const bone of node.skeleton.bones) {
            const name = canonical(bone.name);
            if (!boneNames.has(name)) boneNames.set(name, bone.name);
        }
    });
    const hips = boneNames.has("Hips") ? source.getObjectByName(boneNames.get("Hips")) : null;
    return {
        id: description.id,
        name: description.name,
        source,
        boneNames,
        boneSet: new Set(boneNames.values()),
        // Its rest pose's hips, as far from its parent as a clip's are.
        hipsLength: hips ? hips.position.length() : null,
        hips: description.hips ?? null,
        own: new Map((gltf.animations ?? []).map((clip) => [clip.name, clip])),
        fitted: new Map(),
        clipScale: new Map(),
        poses: new Map(),
        hands: new Map(),
        materials: { outdoor: new Map(), indoor: new Map() },
    };
}

/**
 * A character's copy of its scene, for one person: SkeletonUtils gives
 * every skinned mesh a skeleton of its own; those that shared one in the
 * character share one again, so it is brought up to date once a frame
 * rather than once a mesh.
 */
function cloneCharacter(source) {
    const clone = SkeletonUtils.clone(source);
    const sources = [];
    const clones = [];
    source.traverse((node) => sources.push(node));
    clone.traverse((node) => clones.push(node));
    const shared = new Map();
    clones.forEach((node, i) => {
        if (!node.isSkinnedMesh) return;
        const key = sources[i].skeleton;
        const first = shared.get(key);
        if (!first) {
            shared.set(key, node.skeleton);
            return;
        }
        node.skeleton.dispose();
        node.bind(first, node.bindMatrix);
    });
    return { clone, skeletons: [...shared.values()] };
}

/**
 * A clip of the shared file as it plays on `character`: its tracks named
 * for the character's bones; only rotations, and the hips' movement, kept
 * — each character's bones keep their own lengths — and the hips'
 * movement scaled from the height of the clips' skeleton's hips at rest
 * (`standHips`) to the character's own — or by `ratio`, the index's
 * character.hips / clips.hips, when it has them.
 */
function fitClip(clip, character, standHips, ratio = null) {
    const scale = ratio ?? (standHips && character.hipsLength ? character.hipsLength / standHips : 1);
    const tracks = [];
    for (const track of clip.tracks) {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
        const bone = canonical(nodeName);
        const name = character.boneNames.get(bone);
        if (!name) continue;
        const hips = bone === "Hips";
        if (propertyName === "position" && !hips) continue;
        if (propertyName === "scale") continue;
        const copy = track.clone();
        copy.name = `${name}.${propertyName}`;
        if (hips && propertyName === "position" && scale !== 1) {
            for (let i = 0; i < copy.values.length; i++) copy.values[i] *= scale;
        }
        tracks.push(copy);
    }
    return { fitted: new THREE.AnimationClip(clip.name, clip.duration, tracks), scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
}

/**
 * The shape of a hand, in its character's own pose (whatever it is: the
 * fingers' roots do not move on the hand): its wrist, the way its fingers
 * run, across it toward the thumb, the way its palm faces — and the bone's
 * world matrix there, inverted, to carry a grip into the bone's own space.
 */
function handFrame(character, side) {
    if (character.hands.has(side)) return character.hands.get(side);
    const bone = (name) => {
        const node = character.boneNames.has(name) ? character.source.getObjectByName(character.boneNames.get(name)) : null;
        return node ? node.getWorldPosition(new THREE.Vector3()) : null;
    };
    const handNode = character.boneNames.has(`${side}Hand`) ? character.source.getObjectByName(character.boneNames.get(`${side}Hand`)) : null;
    let frame = null;
    if (handNode) {
        character.source.updateMatrixWorld(true);
        const wrist = bone(`${side}Hand`);
        const middle = bone(`${side}HandMiddle1`);
        const index = bone(`${side}HandIndex1`);
        const pinky = bone(`${side}HandPinky1`);
        const axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        handNode.matrixWorld.extractBasis(...axes);
        // Without fingers, Mixamo's hand: its Y down the fingers, its Z across toward the thumb.
        const fingers = middle ? middle.clone().sub(wrist).normalize() : axes[1].normalize();
        const across = index && pinky ? index.clone().sub(pinky) : axes[2].clone();
        across.addScaledVector(fingers, -across.dot(fingers)).normalize();
        const palm = side === "Right" ? new THREE.Vector3().crossVectors(across, fingers) : new THREE.Vector3().crossVectors(fingers, across);
        frame = { wrist, fingers, across, palm, inverse: handNode.matrixWorld.clone().invert() };
    }
    character.hands.set(side, frame);
    return frame;
}

/**
 * A prop of the pipeline's (blender/export_props.py): its grip point at its
 * origin, upright; its extras' `off`, how far that is from the middle of
 * its footprint (a cup's handle). Wrapped, so a packed node's own
 * transform is never written; with its height, its radius, and how far
 * its foot is below its origin.
 */
function pipelineProp(node) {
    const inner = node.clone(true);
    const object = new THREE.Group();
    object.name = `prop:${node.name}`;
    object.add(inner);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const off = node.userData?.prop?.off ?? [0, 0];
    return { object, kind: null, height: size.y || 0.15, radius: Math.min(size.x, size.z) / 2 || 0.035, off, base: box.min.y };
}

/** A prop casting and taking shadows, as everything else does. */
function shadeProp(object) {
    object.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
    });
}

/**
 * The shape of a character's head, in its own pose: its joint, its
 * upright (toward the top of its head), the way its face looks (+z, as
 * the character faces) — and the bone's world matrix, inverted, to carry
 * something worn into the bone's own space.
 */
function headFrame(character) {
    if (character.hands.has("head")) return character.hands.get("head");
    const node = (name) => (character.boneNames.has(name) ? character.source.getObjectByName(character.boneNames.get(name)) : null);
    const head = node("Head");
    let frame = null;
    if (head) {
        character.source.updateMatrixWorld(true);
        const joint = head.getWorldPosition(new THREE.Vector3());
        const top = node("HeadTop_End");
        const up = top ? top.getWorldPosition(new THREE.Vector3()).sub(joint).normalize() : new THREE.Vector3(0, 1, 0);
        const forward = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z).normalize();
        frame = { joint, up, forward, inverse: head.matrixWorld.clone().invert() };
    }
    character.hands.set("head", frame);
    return frame;
}

const _turn = new THREE.Quaternion();
const _parent = new THREE.Quaternion();

/**
 * A lying person's spine turned up by its lounger's incline (bendFor):
 * the turn, about its waist's line in its rig's frame, carried into the
 * spine's own frame — through the turns of everything between its rig's
 * root and it — each time the clip has set it. A mixer sets a bone only
 * when its clip's value changes: a spine still as it was bent is left.
 */
function bend(person) {
    const b = person.bend;
    if (!b || (b.bent && b.spine.quaternion.equals(b.bent))) return;
    _parent.identity();
    const chain = [];
    for (let node = b.spine.parent; node && node !== person.group; node = node.parent) chain.push(node);
    for (let i = chain.length - 1; i >= 0; i--) _parent.multiply(chain[i].quaternion);
    _turn.setFromAxisAngle(b.axis, b.angle);
    // spine' = parent⁻¹ · turn · parent · spine
    const local = _parent.clone().invert().multiply(_turn).multiply(_parent);
    b.spine.quaternion.premultiply(local);
    b.bent = b.spine.quaternion.clone();
}

/** The sphere it is culled by and the box it collides as, round its pose, on each of its meshes. */
function fitBounds(person) {
    const { info, meshes } = person;
    const box = info.box;
    const local = new THREE.Sphere();
    box.getBoundingSphere(local);
    local.radius += SPHERE_MARGIN;
    person.localSphere = local;
    // Standing on the ground; sitting and lying, down to their feet.
    person.collisionBox = box.clone().expandByVector(new THREE.Vector3(BOX_MARGIN, BOX_MARGIN, BOX_MARGIN));
    person.collisionBox.min.y = Math.max(person.collisionBox.min.y, person.entry.pose === "stand" ? 0 : box.min.y - 0.05);
    // Each mesh's sphere in its own space (it is drawn, and casts, only if that is in view).
    person.group.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4();
    for (const mesh of meshes) {
        inverse.copy(mesh.matrixWorld).invert();
        mesh.boundingSphere = local.clone().applyMatrix4(inverse);
    }
}

// ----------------------------------------------------------------------
// The drinks drawn here
// ----------------------------------------------------------------------

/** Each kind of glass: its profile and its drink's, as (radius, height) in metres, from its base; `at` the share of its height it is held at. */
const DRINKS = {
    wine: {
        height: 0.19,
        radius: 0.04,
        at: 0.3,
        glass: [[0, 0], [0.034, 0], [0.034, 0.003], [0.005, 0.007], [0.0035, 0.02], [0.0035, 0.08], [0.012, 0.088], [0.03, 0.105], [0.04, 0.13], [0.039, 0.16], [0.033, 0.19]],
        drink: [[0, 0.09], [0.011, 0.09], [0.028, 0.106], [0.036, 0.124], [0, 0.124]],
    },
    flute: {
        height: 0.22,
        radius: 0.025,
        at: 0.28,
        glass: [[0, 0], [0.03, 0], [0.03, 0.003], [0.004, 0.007], [0.003, 0.02], [0.003, 0.09], [0.01, 0.1], [0.022, 0.13], [0.025, 0.18], [0.023, 0.22]],
        drink: [[0, 0.1], [0.008, 0.101], [0.02, 0.13], [0.022, 0.17], [0, 0.17]],
    },
    tumbler: {
        height: 0.1,
        radius: 0.04,
        at: 0.45,
        glass: [[0, 0], [0.036, 0], [0.037, 0.004], [0.04, 0.1]],
        drink: [[0, 0.012], [0.034, 0.012], [0.036, 0.068], [0, 0.068]],
    },
    pint: {
        height: 0.15,
        radius: 0.041,
        at: 0.4,
        glass: [[0, 0], [0.03, 0], [0.031, 0.005], [0.041, 0.15]],
        drink: [[0, 0.01], [0.029, 0.01], [0.038, 0.128], [0, 0.128]],
    },
    cup: {
        height: 0.08,
        radius: 0.042,
        at: 0.5,
        opaque: true,
        glass: [[0, 0], [0.028, 0], [0.03, 0.004], [0.042, 0.08]],
        drink: [[0, 0.06], [0.039, 0.06], [0, 0.0605]],
    },
};

/** The kind of glass a drink's name says, or null for what is not a drink. */
function drinkKind(id) {
    const name = String(id).toLowerCase();
    if (/sunglass|spectacles|towel|book|hat\b|cap\b/.test(name)) return null;
    if (/flute|champagne|prosecco|sparkling/.test(name)) return "flute";
    if (/wine|ros[eé]/.test(name)) return "wine";
    if (/beer|pint|lager/.test(name)) return "pint";
    if (/coffee|tea\b|cup|espresso|cappuccino|latte/.test(name)) return "cup";
    if (/tumbler|glass|drink|cocktail|spritz|aperol|negroni|mojito|margarita|gin|tonic|whisk|rum|brandy|water|juice|lemonade|soda/.test(name)) return "tumbler";
    return null;
}

function drinkColour(id) {
    const name = String(id).toLowerCase();
    if (/red/.test(name)) return "#5b0e1d";
    if (/ros[eé]/.test(name)) return "#e7a19c";
    if (/white|champagne|prosecco|sparkling|flute/.test(name)) return "#eadb93";
    if (/beer|pint|lager/.test(name)) return "#d8962a";
    if (/whisk|rum|brandy/.test(name)) return "#b4651f";
    if (/coffee|espresso|cappuccino|latte/.test(name)) return "#3b2416";
    if (/tea\b/.test(name)) return "#8a4b1c";
    if (/water|gin|tonic/.test(name)) return "#dceff0";
    if (/wine/.test(name)) return "#5b0e1d";
    // A spritz on the terrace.
    return "#f06a1e";
}

// ----------------------------------------------------------------------
// Numbers
// ----------------------------------------------------------------------

/** A string's 32-bit FNV-1a hash. */
function hash(text) {
    let h = 2166136261;
    for (const char of String(text)) {
        h ^= char.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** A repeatable stream of numbers in [0, 1) from a seed (mulberry32). */
function seeded(seed) {
    let a = (Number(seed) | 0) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function round(value, digits) {
    const k = 10 ** digits;
    return Math.round(value * k) / k;
}

import { EventEmitter } from "events";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import Experience from "../Experience.js";
import { buildOctree } from "./Collision.js";
import { INDOOR } from "./Sky.js";
import { applyReflection } from "../Utils/reflections.js";
import { QUALITY, onQualityChange } from "../Utils/device.js";
import { seatsOf } from "../../../shared/people.js";

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
 * of its own (SkeletonUtils) — one for all its meshes, whose bones are the
 * same (sharedSkeletons) — and a mixer playing its clip from a point of
 * its own (its `seed`), at a speed a little its own. Someone whose clip is
 * one still pose (the index's `still`) breathes, so that no one is a statue.
 *
 * A spec person: `{ id, character, pose: "stand"|"sit"|"lie", clip,
 * position, rotation, seat, prop, group, seed }`. `position` is the feet of
 * someone standing, and the point of the seat or lounger under the pelvis of
 * someone sitting or lying; `rotation` (degrees about the upright, as a
 * piece of furniture's: 0 north, toward −z, 90 west) the way they face —
 * lying, the way their head points. (A character faces +z in its own
 * frame: it is turned half round to face north at 0.) A clip of `null` is
 * the pose's own (the first of that pose in the index not made for the
 * other sex, one with a hand free if they hold something); a clip named is
 * played whoever it was made for. A character the index lacks is stood in
 * for by one it has ("male" by "standin-male", any other by one chosen by
 * its id), a clip it lacks by the pose's own.
 *
 * Placed by their pose: standing, the lowest their soles come in their
 * clip on the floor (a rig's root is not always its feet: `measure`);
 * sitting and lying, the clip's seat on the seat's point — under its
 * pelvis as the index has it, as low as the lowest of the character's own
 * skin there, since no two are as thick through the hips. A clip from the shared file is fitted to
 * each character: only its rotations and its hips' movement are kept (each
 * character keeps its own bones' lengths), the hips' scaled by the index's
 * character.hips / clips.hips (or, without them, by the two skeletons'
 * hips at rest). Someone sitting is let down into a sofa, or lifted — a
 * centimetre and a half at most — by what puts their soles on the floor
 * (liftFor). Lying on a lounger whose back is raised (seats.json's
 * `incline`), the clip is bent up at the waist, about the line where the
 * lounger's back starts to rise, until its back rests on the lounger's
 * (bendFor, reclineOf), and its head let back onto it; and arms that lie
 * out past the lounger's cushion (its `width`) are brought in to rest on
 * it beside the body (armsFor).
 *
 * What they hold (`prop`) is in the hand their clip holds with (a clip's
 * `hand` in the index: "right", "left", or false for a clip with no hand
 * to hold anything — and the prop's own `grip` for a clip that does not
 * say which), its grip point (a prop's origin) where the fingers close —
 * measured from the hand itself, along its fingers and off its palm, a
 * cup's handle toward the palm (GRIPS), or in the crook of the thumb of a
 * hand that opens in its clip — so it suits every character. A drink is
 * stood upright every frame, whatever its hand does (upright): no clip
 * but the drinking ones was made holding anything, and an arm hanging at
 * the side would hold a glass level; it tips only at the lips — a bottle
 * as far as the clip lifts it, a glass no further than it would spill
 * (SIP, SIP_GLASS). A prop whose grip is null is worn (sunglasses, before
 * the character's eyes: the index's `eyes`) or laid down (a
 * towel, past the feet of someone lying). A drink the index lacks is
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
 * at most `most` of them — the first of the spec's list, which is in the
 * order of their priority (shared/people.js), whole groups at a time; all
 * of them in the editor's edit mode, where they are placed. A public view
 * builds — and so downloads the characters of — only those its step
 * draws, and the rest if the step rises (buildMissing): a phone that draws
 * four people fetches four characters, not twelve. Each is culled
 * by a fixed sphere round its pose (a skinned mesh's own bounds are its
 * rest pose's);
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
 *     (the same group: lifted for its feet on its new seat, bent to its
 *     new lounger's back or straightened off one); anything else
 *     (character, pose, clip, prop, seed), built again (a new group).
 *     Resolves to its record.
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
/** A prop whose grip is this far from the middle of its footprint, in metres, is held by a handle (a cup's) or an edge (a book's spine); nearer, by its body — a tumbler's slice of orange is not a handle. */
const HANDLE_OFF = 0.03;
/**
 * A hand whose fingers open below this much curl in its clip (the index's
 * `curl`, in degrees: about 13 held flat, 110 round a glass) has no fist to
 * hold a glass in: it is kept in the crook of the thumb instead, this much
 * nearer the wrist and this much further toward the thumb, in metres.
 */
const OPEN_HAND = 45;
const IN_THE_CROOK = { along: -0.022, across: 0.012 };
/**
 * A drink is kept upright whatever its hand does: it leans the way the hand
 * does, but no more than UPRIGHT degrees. It is drunk from when its hand
 * comes within its own reach of the mouth — as far as its rim is over its
 * grip, or SIP_REACH for a short glass — and the first of SIP_NEAR more,
 * in metres: then it is tipped at the mouth, and less and less out to the
 * second of SIP_NEAR, beyond which it is not tipped at all. How far over
 * it is tipped depends on what it is. A clip that drinks lifts the hand
 * over the mouth, to empty a bottle: a bottle (BOTTLES, of the pipeline's
 * props) is tipped as far as that, SIP degrees at most; a glass or a cup,
 * which would pour itself down the drinker's front, no more than
 * SIP_GLASS. And a bottle whose hand comes nearer the mouth than its own
 * neck is long is let down through the hand until its mouth is at the
 * drinker's, LIPS short of it, rather than in their face.
 */
const UPRIGHT = 16;
const SIP = 130;
const SIP_GLASS = 65;
const SIP_REACH = 0.12;
const SIP_NEAR = [0.05, 0.16];
const BOTTLES = /beer|bottle|longneck/i;
/** A clip of drinking (shared/people.js's DRINKING), the drinks held in a hand, and the bottle such a clip is given in their place. */
const DRINKING = /drink|sip/i;
const HELD_DRINK = /wine|flute|tumbler|coffee|cup|glass|beer|bottle/i;
const BOTTLE = "beer";
const LIPS = 0.004;
/** Where the mouth is from the head's joint, in metres, on a character whose own the index lacks (its `mouth`: its lips, measured). */
const MOUTH = { up: 0.025, forward: 0.13 };
/**
 * What is worn rather than held or laid down, by its id. Sunglasses hang
 * from the character's eyes (the index's `eyes`: midway between them, at
 * the front of the face round them): their bridge — a prop's origin, the
 * underside of it — WEAR.up over the line of the eyes, which puts the
 * middle of each lens on it, and their lenses WEAR.forward clear of the
 * brows and lashes. On a character whose eyes the index lacks, WEAR_GUESS
 * from the head's joint, in metres.
 */
const WORN = /sunglass|glasses|spectacles|hat\b|cap\b/;
const WEAR = { up: 0.0075, forward: 0.004 };
const WEAR_GUESS = { up: 0.1, forward: 0.13 };
/** How far past someone lying's feet what they brought (a towel) lies, in metres. */
const LAID_PAST_FEET = 0.16;

/** How far under the pelvis's joint the seat is, sitting or lying, without the index saying. */
const PELVIS_ABOVE_SEAT = 0.1;
/** Round each pose's bones: for the sphere it is culled by, and the box it collides as. */
const SPHERE_MARGIN = 0.3;
const BOX_MARGIN = 0.1;
/** The bones a pose's bounds are taken from: all but the fingers' and the eyes'. */
const SMALL_BONES = /(Thumb|Index|Middle|Ring|Pinky|Eye)/;

/**
 * Lying on a lounger whose back is raised. seats.json's lying point is 0.1 m
 * footwards of where the back has risen HINGE_RISE above the flat
 * (scripts/measure-seats.mjs), so the line the back turns up about — where
 * its slope meets the flat — is that much less than HINGE_PAST toward the
 * head of the lying point.
 */
const HINGE_PAST = 0.1;
const HINGE_RISE = 0.04;
/** The bones whose skin is someone's back, and their head. */
const BACK_BONES = /^(Spine1|Spine2|LeftShoulder|RightShoulder)$/;
const HEAD_BONES = /^(Neck|Head)$/;
/**
 * Of a lying body's back, what rests on the lounger's: its skin from
 * BACK_FROM metres past the hinge and within BACK_ACROSS of its middle —
 * as low as the lowest BACK_LOWEST of it (a shoulder blade may press in).
 */
const BACK_FROM = 0.12;
const BACK_ACROSS = 0.22;
const BACK_LOWEST = 0.03;
/** A head lying this far off the lounger's back, in metres, is let down onto it — its neck turned no more than NECK_MOST degrees — unless its hands are under it: within HANDS_UNDER of its joint. */
const HEAD_OFF = 0.03;
const NECK_MOST = 35;
const HANDS_UNDER = 0.35;

/**
 * Someone lying on a lounger narrower than their arms lie (a clip's arms
 * are flung out on the floor it was made on) has them brought in to rest
 * on its cushion (armsFor): an elbow no nearer its edge than ARM_REST.in,
 * the arm's bone ARM_REST.over above the cushion — an arm's thickness;
 * a wrist HAND_REST.in from the edge and HAND_REST.over above it, and no
 * nearer the body than HAND_REST.clear of the hips; a hand, HAND_REST.long
 * of it, laid down to where its fingers' ends are HAND_REST.tips over
 * what is under them. All in metres. Not a clip whose head is PROPPED
 * over its seat: it is propped up on them.
 */
const ARM_REST = { in: 0.045, over: 0.045 };
const HAND_REST = { in: 0.06, over: 0.035, clear: 0.07, long: 0.16, tips: 0.022 };
const PROPPED = 0.45;

/** The bones whose skin is the feet, shoes and all. */
const FOOT_BONES = /^(Left|Right)(Foot|ToeBase|Toe_End)$/;
/**
 * Someone sitting is let down into their seat until their soles are on the
 * floor — a cushion gives — by no more than FEET_MOST, in metres, counting
 * what the planner has let them down already (shared/people.js's GIVE),
 * and only onto a sofa, whose seat is soft; or lifted off it until they
 * are, but never by more than LIFT_MOST: soles a centimetre in the floor
 * are not seen, someone sitting on the air is.
 */
const FEET_MOST = 0.03;
const LIFT_MOST = 0.015;
/**
 * Someone standing stands on the lowest their soles come in their clip,
 * not on their rig's root: a clip may carry its body a centimetre or two
 * over it (Mixamo's "Drinking" does). Sampled at STAND_SAMPLES points
 * through the clip; a clip that leaves the floor by more than STAND_MOST
 * either way is left on its root.
 */
const STAND_SAMPLES = 12;
const STAND_MOST = 0.06;
/**
 * The bones whose skin is what someone sits or lies on, under the pelvis;
 * how far round it to look, in metres; and the share of that skin taken
 * to be under the surface it rests on, sitting and lying (a fold of
 * cloth, a pocket: the pipeline, which fits each sitting clip to each
 * character by the very lowest of it, is followed more nearly sitting).
 */
const SEAT_BONES = /^(Hips|LeftUpLeg|RightUpLeg|Spine)$/;
const SEAT_REACH = 0.22;
const SEAT_LOWEST = { sit: 0.01, lie: 0.04 };

/**
 * Someone whose clip is one still pose breathes: their chest turned back
 * and forth by BREATH degrees, BREATHS times a second, their neck turned
 * against it so that their head stays where it is.
 */
const BREATH = 1.1;
const BREATHS = 0.25;

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

        // A step up may draw people a public view has not built yet.
        this.stopQuality = onQualityChange(() => {
            this.buildMissing();
            this.refreshVisibility();
        });
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

    /** Everyone again, from `spec.people` — in a public view, everyone its quality step draws (`wanted`). */
    rebuild(spec = this.world.spec) {
        this.spec = spec;
        const generation = ++this.generation;
        for (const person of this.people.values()) this.drop(person);
        this.people.clear();
        this.built = true;
        const wanted = this.wanted();
        const entries = (spec?.people ?? []).filter((entry) => wanted.has(entry.id));
        this.ready = Promise.all(entries.map((entry) => this.build(entry, generation))).then(() => {
            if (generation !== this.generation) return;
            this.changed();
            this.emit("ready", this);
        });
        return this.ready;
    }

    /**
     * Whom to build, by id: in the editor everyone, whose people are its to
     * place and to show all of; in a public view only those the quality
     * step draws (`chosen`) — no character is downloaded for someone a
     * phone will never show.
     */
    wanted() {
        const entries = this.spec?.people ?? [];
        const most = this.experience.publicView ? (QUALITY.people ?? DEFAULT_RATES).most : Infinity;
        return chosen(entries, most);
    }

    /**
     * Those wanted now and not built yet (the quality step has risen in a
     * public view): built, and drawn as each is ready. Nothing before the
     * first rebuild — while the people are hidden, none is downloaded.
     */
    buildMissing() {
        if (!this.built) return;
        const wanted = this.wanted();
        const missing = (this.spec?.people ?? []).filter((entry) => wanted.has(entry.id) && !this.people.has(entry.id) && !this.pending?.has(entry.id));
        if (!missing.length) return;
        const generation = this.generation;
        this.ready = Promise.all([this.ready, ...missing.map((entry) => this.build(entry, generation).then(() => generation === this.generation && this.changed()))]);
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
        // Still being built (added a moment ago): its build gives up when it sees it is no longer awaited.
        this.pending?.delete(id);
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
            // On another lounger, or off one: bent as that one's back is raised, or not at all.
            this.recline(person);
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
        // The way its rig's +z points now, however the group was turned.
        const facing = _v.set(0, 0, 1).applyQuaternion(group.quaternion);
        const turned = Math.atan2(facing.x, facing.z);
        let yaw = turned - Math.PI + (entry.pose === "lie" ? info.headYaw : 0);
        const contact = this.contact(person).applyAxisAngle(THREE.Object3D.DEFAULT_UP, turned);
        // Less what it was lifted for its feet (place): its spot is its seat's.
        contact.y -= person.lift ?? 0;
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
            // A clip that drinks lifts the hand over the mouth, as from a
            // bottle: any drink it is given is the bottle (a glass would be
            // tipped into the face).
            const drinks = clipEntry && DRINKING.test(clipEntry.name) && entry.prop && HELD_DRINK.test(entry.prop) && !BOTTLES.test(entry.prop);
            const propEntry = entry.prop ? propFor(drinks ? BOTTLE : entry.prop, index) : null;
            const usable = propEntry && (propEntry.grip === null || clipEntry?.hand !== false);
            const prop = usable ? await this.propSource(propEntry, index) : null;
            // How high its seat is, and how its lounger's back is raised.
            if (entry.pose === "sit" || entry.pose === "lie") await this.seats();
            if (!current()) return null;

            const { clone: model, skeletons } = cloneCharacter(character.source, character.skeletons);
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
                // What is done to it after its clip has posed it (finish): bent to a lounger's back, breathing, its arms brought in onto the lounger, its drink kept upright.
                bend: null,
                breath: null,
                arms: null,
                held: null,
                // How far it is lifted off its seat for its feet (place).
                lift: 0,
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
            // One still pose: breathing, from a point in a breath of its own.
            if (clip && (clipEntry?.still || clip.duration < 0.1)) person.breath = breathOf(person, random);
            person.bend = this.bendFor(person);
            if (person.bend) bend(person);
            // Its arms, as they lie once its back is laid.
            person.arms = this.armsFor(person);
            finish(person, 0);

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
     * sits or lies on — and the box round it; and from its skin there, the
     * soles of someone sitting (`soles`, their height), the back and the
     * head of someone lying (`back`, `head`: reclineOf's) and how wide
     * they are through the hips (`hips`: armsFor's) — a seat is as high
     * as the lowest of that skin under the pelvis, the character's own,
     * not the index's one for everybody. For someone standing, `floor`: the lowest
     * their soles come over their root, anywhere in the clip (STAND_SAMPLES
     * of it). Once per character and clip.
     */
    measure(person) {
        const { character, clipEntry, model, group } = person;
        const key = clipEntry?.name ?? "";
        if (character.poses.has(key)) return character.poses.get(key);
        group.updateMatrixWorld(true);
        const box = new THREE.Box3();
        const pelvis = new THREE.Vector3();
        const at = new Map();
        const feet = [];
        model.traverse((node) => {
            if (node.isMesh || !character.boneSet.has(node.name)) return;
            const name = canonical(node.name);
            if (SMALL_BONES.test(name)) return;
            node.getWorldPosition(_v);
            box.expandByPoint(_v);
            at.set(name, _v.clone());
            if (name === "Hips") pelvis.copy(_v);
            if (name === "LeftFoot" || name === "RightFoot") feet.push(_v.clone());
        });
        if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 1.8, 0.2));
        // Lying, the way its head points from its pelvis, for `rotation` to turn it to.
        const head = at.get("Head") ?? null;
        let headYaw = 0;
        if (head && Math.hypot(head.x - pelvis.x, head.z - pelvis.z) > 0.3) headYaw = Math.atan2(head.x - pelvis.x, head.z - pelvis.z);
        const scale = character.clipScale.get(key) ?? 1;
        const seat = clipEntry?.seat
            ? new THREE.Vector3(...clipEntry.seat).multiplyScalar(scale)
            : new THREE.Vector3(pelvis.x, pelvis.y - PELVIS_ABOVE_SEAT, pelvis.z);
        const info = {
            pelvis,
            headYaw,
            seat,
            box,
            feet: feet.length ? feet.reduce((sum, foot) => sum.add(foot), new THREE.Vector3()).divideScalar(feet.length) : null,
            soles: null,
            floor: 0,
            back: null,
            head: null,
            neck: null,
            hips: null,
            handsUnder: false,
            reclines: new Map(),
        };
        /** The lowest of its shoes' skin, as it is posed now. */
        const shoes = {};
        const lowestSole = (most) => {
            const skin = skinOf(person, FOOT_BONES, most, shoes);
            let low = Infinity;
            for (let i = 1; i < skin.length; i += 3) low = Math.min(low, skin[i]);
            return low;
        };
        const pose = clipEntry?.pose ?? person.entry.pose ?? "stand";
        // What it sits or lies on: the lowest of its own skin under its pelvis (all but a fold or two), and how wide it is there.
        if (clipEntry?.pose === "sit" || clipEntry?.pose === "lie") {
            const under = skinOf(person, SEAT_BONES);
            const heights = [];
            const widths = [];
            for (let i = 0; i < under.length; i += 3) {
                if (Math.hypot(under[i] - pelvis.x, under[i + 2] - pelvis.z) > SEAT_REACH || under[i + 1] > pelvis.y) continue;
                heights.push(under[i + 1]);
                widths.push(Math.abs((under[i] - pelvis.x) * Math.cos(headYaw) - (under[i + 2] - pelvis.z) * Math.sin(headYaw)));
            }
            if (heights.length > 20) {
                heights.sort((a, b) => a - b);
                widths.sort((a, b) => a - b);
                seat.y = heights[Math.floor(heights.length * SEAT_LOWEST[clipEntry.pose])];
                info.hips = widths[Math.floor(widths.length * 0.98)];
            }
        }
        if (pose === "sit") {
            const low = lowestSole();
            if (Number.isFinite(low)) info.soles = low;
        } else if (pose === "stand" && person.action && person.clip?.duration > 0) {
            // Through the clip and back to its start: the lowest its soles come.
            let low = Infinity;
            for (let i = 0; i < STAND_SAMPLES; i++) {
                person.action.time = (i / STAND_SAMPLES) * person.clip.duration;
                person.mixer.update(0);
                low = Math.min(low, lowestSole(300));
            }
            person.action.time = 0;
            person.mixer.update(0);
            if (Math.abs(low) <= STAND_MOST) info.floor = low;
        }
        if (clipEntry?.pose === "lie") {
            // Its back's skin and its head's, each point as how far toward the head of its seat, how high over it, how far to its side.
            const way = new THREE.Vector3(Math.sin(headYaw), 0, Math.cos(headYaw));
            const across = new THREE.Vector3(Math.cos(headYaw), 0, -Math.sin(headYaw));
            const lying = (points) => {
                for (let i = 0; i < points.length; i += 3) {
                    _v.set(points[i], points[i + 1], points[i + 2]).sub(seat);
                    points[i] = _v.dot(way);
                    points[i + 1] = _v.y;
                    points[i + 2] = _v.dot(across);
                }
                return points;
            };
            info.back = lying(skinOf(person, BACK_BONES));
            info.head = lying(skinOf(person, HEAD_BONES, 1500));
            const neck = at.get("Neck");
            if (neck) info.neck = lying(neck.toArray());
            info.handsUnder = Boolean(head) && ["LeftHand", "RightHand"].some((name) => at.has(name) && at.get(name).distanceTo(head) < HANDS_UNDER);
        }
        character.poses.set(key, info);
        return info;
    }

    /** seats.json, once: where each piece of furniture is sat and lain on (`seatData`, null if it will not load). */
    seats() {
        this.seatsPromise ??= fetch(SEATS_URL)
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
            .then((seats) => (this.seatData = seats));
        return this.seatsPromise;
    }

    /**
     * The lounger someone lies on, as seats.json has the piece their seat
     * is on: `slope`, how its back is raised, in radians (0 for one raised
     * 5° or less, which scripts/measure-seats.mjs takes for flat); `past`,
     * how far toward the head of the lying point the line is that it
     * turns up about (HINGE_PAST); `half`, half its cushion's width, or
     * null where the file doesn't say. Null for anyone not lying, with a
     * lying clip, on a piece of seats.json — and until that has loaded.
     */
    loungerOf(person) {
        const { entry, clipEntry } = person;
        if (entry.pose !== "lie" || clipEntry?.pose !== "lie" || !entry.seat?.furniture) return null;
        const placement = this.spec?.furniture?.find((item) => item.id === entry.seat.furniture);
        const lie = placement ? this.seatData?.[placement.catalog_id]?.lie : null;
        if (!lie) return null;
        const scale = placement.scale ?? 1;
        const slope = lie.incline > 5 ? THREE.MathUtils.degToRad(lie.incline) : 0;
        return {
            slope,
            past: slope ? (HINGE_PAST - HINGE_RISE / Math.tan(slope)) * scale : 0,
            half: Number.isFinite(lie.width) ? (lie.width * scale) / 2 : null,
        };
    }

    /**
     * Lying on a lounger with its back raised (seats.json's `incline` for
     * the piece its seat is on): how its spine is turned up to lay its
     * back along the lounger's — about the hinge, the line across the
     * lounger where its back starts to rise, by as much as rests its back
     * there (reclineOf: less than the incline for a clip that lies with
     * its shoulders raised already) — and its neck let back, if its head
     * would otherwise be held off the lounger. Null for anyone else, for a
     * clip that is not a lying one, and until seats.json has loaded.
     */
    bendFor(person) {
        const { character, model, group, info } = person;
        const lounger = this.loungerOf(person);
        const bone = (name) => (character.boneNames.has(name) ? model.getObjectByName(character.boneNames.get(name)) : null);
        const spine = bone("Spine");
        if (!lounger?.slope || !info.back || !spine) return null;
        const { slope, past } = lounger;
        const { lean, nod } = reclineOf(info, past, slope);
        if (!lean && !nod) return null;
        const h = info.headYaw;
        const neck = nod ? bone("Neck") : null;
        return {
            // Across the lounger, at the clip's start: about it, the head rises.
            axis: new THREE.Vector3(-Math.cos(h), 0, Math.sin(h)),
            hinge: info.seat.clone().add(new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(past)),
            spine: turnable(spine, group),
            lean,
            neck: neck ? turnable(neck, group) : null,
            nod,
        };
    }

    /**
     * Lying on a lounger narrower than its arms lie: how each arm that
     * lies out past the cushion is brought in to rest on it, beside the
     * body — its elbow on the cushion within its edge (on the raised back,
     * mostly), its wrist on it by the hip, its hand laid flat — as three
     * turns in the rig's frame: of the upper arm about the shoulder, of
     * the forearm about the elbow, of the hand about the wrist (ARM_REST,
     * HAND_REST). Read off the pose as it is now — bent to the lounger's
     * back already, its arms as its clip has them — and kept through the
     * clip, which lies all but still. Null with both arms on the lounger
     * as they are, for a clip that lies on its hands or is propped up on
     * them, and wherever seats.json has no width for the piece.
     */
    armsFor(person) {
        const { clipEntry, character, model, group, info } = person;
        const lounger = this.loungerOf(person);
        if (!lounger?.half || info.handsUnder) return null;
        if (clipEntry.head && clipEntry.seat && clipEntry.head[1] - clipEntry.seat[1] > PROPPED) return null;
        const { slope, past, half } = lounger;
        const h = info.headYaw;
        const way = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
        const across = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
        const rise = Math.tan(slope);
        /** How high the lounger is over its flat, `along` metres toward the head of the lying point. */
        const surface = (along) => Math.max(0, along - past) * rise;
        /** A point in the rig's frame as [toward the head, over the flat, to the side] of the lying point, and back. */
        const lying = (point) => {
            _v.copy(point).sub(info.seat);
            return [_v.dot(way), _v.y, _v.dot(across)];
        };
        const rigged = ([along, over, aside]) => info.seat.clone().addScaledVector(way, along).addScaledVector(across, aside).setY(info.seat.y + over);
        const bone = (name) => (character.boneNames.has(name) ? model.getObjectByName(character.boneNames.get(name)) : null);
        const at = (node) => {
            const point = new THREE.Vector3();
            chainPose(chainTo(node, group), point, _other);
            return point;
        };
        /** Where, footwards of `from` and `length` from it, a joint rests `over` the lounger and `aside` of its middle: by halving; null if it cannot. */
        const resting = (from, length, aside, over) => {
            const off = (along) => Math.hypot(from[0] - along, from[1] - surface(along) - over, from[2] - aside) - length;
            let near = from[0];
            let far = from[0] - length;
            if (off(near) > 0 || off(far) < 0) return null;
            for (let i = 0; i < 24; i++) {
                const middle = (near + far) / 2;
                if (off(middle) > 0) far = middle;
                else near = middle;
            }
            return [near, surface(near) + over, aside];
        };
        const arms = [];
        for (const side of ["Left", "Right"]) {
            const upper = bone(`${side}Arm`);
            const fore = bone(`${side}ForeArm`);
            const hand = bone(`${side}Hand`);
            if (!upper || !fore || !hand) continue;
            const shoulder = at(upper);
            const elbow = at(fore);
            const wrist = at(hand);
            const [s, e, w] = [lying(shoulder), lying(elbow), lying(wrist)];
            // On the lounger as it lies: left alone.
            if (Math.abs(e[2]) <= half - ARM_REST.in && Math.abs(w[2]) <= half - HAND_REST.in) continue;
            const out = Math.sign(w[2]) || Math.sign(s[2]) || 1;
            // The elbow: on the cushion within its edge, no nearer the middle than the shoulder it hangs from.
            const elbowAside = out * Math.max(Math.min(Math.abs(e[2]), half - ARM_REST.in), Math.min(Math.abs(s[2]), half - ARM_REST.in));
            const elbowTo = resting(s, shoulder.distanceTo(elbow), elbowAside, ARM_REST.over);
            if (!elbowTo) continue;
            // The wrist: on the cushion within its edge, by the hip but clear of it (which, on someone broad, comes first).
            const wristAside = out * Math.min(Math.abs(w[2]), Math.max(half - HAND_REST.in, (info.hips ?? 0.18) + HAND_REST.clear));
            const wristTo = resting(elbowTo, elbow.distanceTo(wrist), wristAside, HAND_REST.over);
            if (!wristTo) continue;
            const [elbowAt, wristAt] = [rigged(elbowTo), rigged(wristTo)];
            const swing = new THREE.Quaternion().setFromUnitVectors(elbow.clone().sub(shoulder).normalize(), elbowAt.clone().sub(shoulder).normalize());
            const fold = new THREE.Quaternion().setFromUnitVectors(wrist.clone().sub(elbow).applyQuaternion(swing).normalize(), wristAt.clone().sub(elbowAt).normalize());
            // The hand laid on the cushion: pointing the way it points, level, but tipped until its fingers' ends rest on what is under them.
            const finger = bone(`${side}HandMiddle1`);
            let flat = null;
            if (finger) {
                const points = at(finger).sub(wrist).applyQuaternion(swing).applyQuaternion(fold).normalize();
                const level = points.clone().setY(0);
                if (level.lengthSq() > 1e-6) {
                    const tips = wristAt.clone().addScaledVector(level.normalize(), HAND_REST.long);
                    tips.y = info.seat.y + surface(lying(tips)[0]) + HAND_REST.tips;
                    flat = new THREE.Quaternion().setFromUnitVectors(points, tips.sub(wristAt).normalize());
                }
            }
            arms.push({ upper: turnable(upper, group), swing, fore: turnable(fore, group), fold, hand: flat ? turnable(hand, group) : null, flat });
        }
        return arms.length ? arms : null;
    }

    /**
     * Bent as the lounger it lies on now has its back raised, its arms
     * brought in onto it — or neither, off one: at once if seats.json is
     * here, when it is otherwise.
     */
    recline(person) {
        if (person.entry.pose !== "lie" && !person.bend && !person.arms) return;
        if (this.seatData === undefined) {
            this.seats().then(() => {
                if (this.people.get(person.id) === person) this.recline(person);
            });
            return;
        }
        if (person.arms) unarm(person);
        if (person.bend) unbend(person);
        person.bend = this.bendFor(person);
        if (person.bend) bend(person);
        // Its arms, as they lie once its back is laid.
        person.arms = this.armsFor(person);
        if (person.arms) arm(person);
    }

    /** Where on its rig it rests on its spot: under its root, as low as its soles come, standing; its seat sitting or lying. */
    contact(person) {
        return person.entry.pose === "sit" || person.entry.pose === "lie" ? person.info.seat.clone() : new THREE.Vector3(0, person.info.floor ?? 0, 0);
    }

    /**
     * How far someone sitting is lifted off their seat for their soles to
     * be on the floor it stands on rather than under it — LIFT_MOST at
     * most, and what is left of their soles stays in the floor — or, on a
     * sofa, let down into it until their feet reach the floor: FEET_MOST
     * at most, counting what the planner let them down already. Nothing
     * for a seat their clip does not fit at all (a bar stool), nor for
     * anyone not on a seat of seats.json.
     */
    liftFor(person) {
        const { entry, info } = person;
        if (entry.pose !== "sit" || info.soles === null || !entry.seat?.furniture || !this.seatData) return 0;
        const placement = this.spec?.furniture?.find((item) => item.id === entry.seat.furniture);
        const placed = placement ? seatsOf(placement, this.seatData) : null;
        const seat = placed?.seats[entry.seat.index];
        if (!seat) return 0;
        const y = entry.position?.[1] ?? 0;
        // Its soles over the floor (under it, negative), as it would be put.
        const off = y - info.seat.y + info.soles - (seat.at[1] - seat.height);
        if (Math.abs(off) > 0.1) return 0;
        const down = placed.kind === "sofa" ? Math.max(0, FEET_MOST - Math.max(0, seat.at[1] - y)) : 0;
        return THREE.MathUtils.clamp(-off, -down, LIFT_MOST);
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
        person.lift = this.liftFor(person);
        group.position.set(x - contact.x, y - contact.y + person.lift, z - contact.z);
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

    /**
     * Something held in its hand: the one its clip holds with (the index's
     * `hand`), or the prop's own when the clip does not say which. A drink
     * is kept upright from then on (upright), whatever the hand does.
     */
    hold(person, prop, propEntry) {
        const { character, clipEntry, model, group } = person;
        const hold = typeof clipEntry?.hand === "string" ? clipEntry.hand : propEntry.grip;
        const side = hold === "left" ? "Left" : "Right";
        const name = character.boneNames.get(`${side}Hand`);
        const hand = name ? model.getObjectByName(name) : null;
        if (!hand) return;
        const frame = handFrame(character, side);
        if (!frame) return;
        const grip = GRIPS[propEntry.id] ?? GRIPS[prop.kind] ?? GRIPS.default;
        const handle = Math.hypot(...prop.off) > HANDLE_OFF;
        const out = grip.out ?? PALM + (handle ? 0.004 : prop.radius);
        // A hand that opens in this clip has no fist for it: in the crook of its thumb.
        const curl = clipEntry?.curl?.[hold === "left" ? "left" : "right"];
        const open = Number.isFinite(curl) && curl < OPEN_HAND && !handle;
        // The prop upright when the thumb is, its grip on the line round
        // which the fingers close.
        const x = frame.fingers;
        const y = frame.across;
        const z = new THREE.Vector3().crossVectors(x, y);
        const basis = new THREE.Matrix4().makeBasis(x, y, z);
        const at = frame.wrist
            .clone()
            .addScaledVector(frame.fingers, grip.along + (open ? IN_THE_CROOK.along : 0))
            .addScaledVector(frame.across, open ? IN_THE_CROOK.across : 0)
            .addScaledVector(frame.palm, out);
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
        if (!drinkKind(propEntry.id)) return;
        // A drink: where its rim is over its grip, and where the mouth it is drunk with is on the head.
        const face = headFrame(character);
        const head = character.boneNames.has("Head") ? model.getObjectByName(character.boneNames.get("Head")) : null;
        person.held = {
            holder,
            rest: holder.quaternion.clone(),
            at: holder.position.clone(),
            hand: chainTo(hand, group),
            // A bottle of the pipeline's is drunk from as the clip lifts it; a glass (and a drink drawn here) is not tipped so far.
            bottle: prop.kind === null && BOTTLES.test(propEntry.id),
            rim: prop.height + prop.base,
            head: face && head ? chainTo(head, group) : null,
            // Its lips, as the index has them on this character at rest; or where lips mostly are.
            mouth: !face
                ? null
                : (character.mouth
                      ? face.joint.clone().add(new THREE.Vector3(...character.mouth))
                      : face.joint.clone().addScaledVector(face.up, MOUTH.up).addScaledVector(face.forward, MOUTH.forward)
                  ).applyMatrix4(face.inverse),
        };
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
            // Before its eyes, where the index has them: level, looking the way the character does at rest (+z).
            // Without them, on the line of the head, where eyes mostly are.
            const eyes = character.eyes;
            const z = eyes ? new THREE.Vector3(0, 0, 1) : frame.forward;
            const y = eyes ? new THREE.Vector3(0, 1, 0) : frame.up;
            const x = new THREE.Vector3().crossVectors(y, z);
            const at = eyes
                ? frame.joint.clone().add(new THREE.Vector3(eyes[0], eyes[1] + WEAR.up, eyes[2] + WEAR.forward))
                : frame.joint.clone().addScaledVector(y, WEAR_GUESS.up).addScaledVector(z, WEAR_GUESS.forward);
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
     * Who is drawn: in a walkthrough, within the step's most — the first of
     * the spec's list, whole groups at a time — and in the editor's edit
     * mode, where they are placed, all of them; and of those, whoever the
     * filter lets through.
     */
    refreshVisibility() {
        const rates = QUALITY.people ?? DEFAULT_RATES;
        const allowed = chosen(this.spec?.people ?? [], this.world.editor?.active ? Infinity : rates.most);
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
            finish(person, person.pending);
            person.pending = 0;
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
 * index when written `./` or `../`), its characters each with their sex
 * and where their eyes and mouth are if it says, its clips each with a pose, a hand — "right" or "left", the one
 * that can hold something; true for either, which is the right; false for
 * neither — and what else the pipeline measured of it
 * (scripts/optimize-people.mjs), as shared/people.js's planner reads it.
 */
function normaliseIndex(raw, indexUrl) {
    const resolve = (file) => {
        if (!file) return null;
        const base = /^\.\.?\//.test(file) ? indexUrl : new URL(MODELS, window.location.href).href;
        return new URL(file, base).href;
    };
    const sexOf = (item) => (item.sex === "f" || item.sex === "m" ? item.sex : null);
    const point = (value) => (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? value : null);
    const characters = (raw.characters ?? [])
        .filter((item) => item?.id && item.file)
        .map((item) => ({
            id: item.id,
            name: item.name ?? item.id,
            url: resolve(item.file),
            height: item.height ?? null,
            hips: item.hips ?? null,
            legs: item.legs ?? null,
            sits: item.sits ?? null,
            sex: sexOf(item),
            eyes: point(item.eyes),
            mouth: point(item.mouth),
        }));
    const clips = (raw.clips?.list ?? []).map((clip) => ({
        name: clip.name,
        pose: clip.pose ?? "stand",
        hand: clip.hand === "left" || clip.hand === "right" ? clip.hand : clip.hand !== false,
        tilt: clip.tilt ?? null,
        curl: clip.curl ?? null,
        sex: sexOf(clip),
        pelvis: clip.pelvis ?? null,
        seat: clip.seat ?? null,
        head: clip.head ?? null,
        feet: clip.feet ?? null,
        tuck: clip.tuck ?? null,
        knee: clip.knee ?? null,
        far: clip.far ?? null,
        reach: clip.reach ?? null,
        duration: clip.duration ?? null,
        still: clip.still === true,
    }));
    // A grip of null: laid down or worn, not held.
    const props = (raw.props?.list ?? [])
        .filter((prop) => prop?.id)
        .map((prop) => ({ id: prop.id, node: prop.node ?? prop.id, grip: prop.grip === null ? null : prop.grip === "left" ? "left" : "right" }));
    return {
        characters,
        clips: { url: resolve(raw.clips?.file), hips: raw.clips?.hips ?? null, legs: raw.clips?.legs ?? null, list: clips },
        props: { url: resolve(raw.props?.file), list: props },
        clipLibrary: null,
    };
}

/**
 * The clip a person plays: the one its entry names, whoever it was made
 * for; or its pose's own — the first of that pose not made for the other
 * sex, one with a hand free if they hold something.
 */
function clipFor(entry, index) {
    const list = index.clips.list;
    const pose = entry.pose ?? "stand";
    const named = entry.clip ? list.find((clip) => clip.name === entry.clip) : null;
    if (named) return named;
    const sex = index.characters.find((character) => character.id === entry.character)?.sex ?? null;
    const theirs = list.filter((clip) => clip.pose === pose && (!clip.sex || !sex || clip.sex === sex));
    return (
        (entry.prop && theirs.find((clip) => clip.hand)) ||
        theirs[0] ||
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
 * Who is drawn of `entries` when only `most` may be: the first of them, in
 * the spec's order — which is their priority (shared/people.js) — whole
 * groups at a time (a person alone is a group of one), each that still
 * fits.
 */
function chosen(entries, most) {
    if (!(most < entries.length)) return new Set(entries.map((entry) => entry.id));
    // In the order each group's first member comes.
    const groups = new Map();
    for (const entry of entries) {
        const key = entry.group ?? `#${entry.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry.id);
    }
    const out = new Set();
    for (const ids of groups.values()) {
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
        eyes: description.eyes ?? null,
        mouth: description.mouth ?? null,
        own: new Map((gltf.animations ?? []).map((clip) => [clip.name, clip])),
        fitted: new Map(),
        clipScale: new Map(),
        poses: new Map(),
        hands: new Map(),
        skeletons: sharedSkeletons(source),
        materials: { outdoor: new Map(), indoor: new Map() },
    };
}

/**
 * Which of a character's skeletons are one set of bones. Each skinned mesh
 * of a file comes with a skeleton of its own, though all of a character's
 * are the same bones in the same order: they differ only in how each
 * mesh's points were packed, which is in its bones' inverses (boundAlike).
 * Each skeleton → the first of its bones' (`first`, itself if it is that)
 * and what lies between the two (`between`, null for the first).
 */
function sharedSkeletons(source) {
    const firsts = [];
    const out = new Map();
    source.traverse((node) => {
        if (!node.isSkinnedMesh || out.has(node.skeleton)) return;
        for (const first of firsts) {
            const between = boundAlike(first, node.skeleton);
            if (!between) continue;
            out.set(node.skeleton, { first, between });
            return;
        }
        firsts.push(node.skeleton);
        out.set(node.skeleton, { first: node.skeleton, between: null });
    });
    return out;
}

/**
 * Whether skeleton `b` is `a`'s bones again, in the same order, bound the
 * same way but for one matrix before them all — a mesh's points unpacked
 * (b's inverse of each bone is a's, times it). That matrix, or null. A
 * mesh of `b`'s bound to `a` with it as its bind matrix is drawn exactly
 * as it was.
 */
function boundAlike(a, b) {
    const count = a.bones.length;
    if (!count || b.bones.length !== count) return null;
    for (let i = 0; i < count; i++) if (a.bones[i] !== b.bones[i]) return null;
    const between = new THREE.Matrix4().copy(a.boneInverses[0]).invert().multiply(b.boneInverses[0]);
    for (let i = 1; i < count; i++) {
        const made = _matrix.multiplyMatrices(a.boneInverses[i], between).elements;
        const own = b.boneInverses[i].elements;
        for (let k = 0; k < 16; k++) if (Math.abs(made[k] - own[k]) > 1e-4 * (1 + Math.abs(own[k]))) return null;
    }
    return between;
}

/**
 * A character's copy of its scene, for one person: SkeletonUtils gives
 * every skinned mesh a skeleton of its own; here all of them that are one
 * set of bones (`same`: sharedSkeletons) are bound to one again, so that a
 * person's bones are worked out, and sent to the graphics card, once a
 * frame rather than once a mesh.
 */
function cloneCharacter(source, same) {
    const clone = SkeletonUtils.clone(source);
    const sources = [];
    const clones = [];
    source.traverse((node) => sources.push(node));
    clone.traverse((node) => clones.push(node));
    const firstOf = (skeleton) => same.get(skeleton) ?? { first: skeleton, between: null };
    // The first skeleton of each set of bones → this copy's of it.
    const shared = new Map();
    clones.forEach((node, i) => {
        if (!node.isSkinnedMesh) return;
        const own = sources[i].skeleton;
        if (firstOf(own).first === own && !shared.has(own)) shared.set(own, node.skeleton);
    });
    clones.forEach((node, i) => {
        if (!node.isSkinnedMesh) return;
        const { first, between } = firstOf(sources[i].skeleton);
        const skeleton = shared.get(first);
        if (!skeleton || node.skeleton === skeleton) return;
        node.skeleton.dispose();
        node.bind(skeleton, between ? _matrix.multiplyMatrices(between, node.bindMatrix) : node.bindMatrix);
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

// ----------------------------------------------------------------------
// After its clip has posed it
// ----------------------------------------------------------------------

const _turn = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _inverse = new THREE.Quaternion();
const _held = new THREE.Quaternion();
const _other = new THREE.Quaternion();
const _at = new THREE.Vector3();
const _joint = new THREE.Vector3();
const _shift = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rim = new THREE.Vector3();
const _mouth = new THREE.Vector3();
const SIDE_TO_SIDE = new THREE.Vector3(1, 0, 0);

/**
 * What is done to a person each time its mixer has posed it: bent to its
 * lounger's back, breathing if its clip is one still pose, its arms
 * brought in onto its lounger, its drink stood upright. `delta`, the
 * seconds since the last time.
 */
function finish(person, delta) {
    if (person.bend) bend(person);
    if (person.breath) breathe(person, delta);
    if (person.arms) arm(person);
    if (person.held) upright(person);
}

/** The nodes from a person's group down to `node`, the group's child first. */
function chainTo(node, group) {
    const chain = [];
    for (let at = node; at && at !== group; at = at.parent) chain.unshift(at);
    return chain;
}

/**
 * Where the last of `chain` (chainTo) is in its person's group's frame and
 * how it is turned there, from each node's own offset and turn — a bone's
 * matrices are not brought up to date until the frame is drawn. Returns
 * its scale (a rig's nodes are scaled evenly, if at all).
 */
function chainPose(chain, position, quaternion) {
    position.set(0, 0, 0);
    quaternion.identity();
    let scale = 1;
    for (const node of chain) {
        position.add(_v.copy(node.position).multiplyScalar(scale).applyQuaternion(quaternion));
        quaternion.multiply(node.quaternion);
        scale *= node.scale.x;
    }
    return scale;
}

/**
 * A bone that is turned after its clip has posed it: what its clip last
 * made of it (`raw`), what was made of that (`set`), and where it is on
 * its parent (`rest`: a clip moves only the hips). A mixer writes a bone
 * only when its clip's value changes, so a bone found as it was set has
 * not been posed since.
 */
function turnable(bone, group) {
    return { bone, chain: chainTo(bone.parent, group), rest: bone.position.clone(), raw: bone.quaternion.clone(), set: null };
}

/** Whether its clip has posed a bone anew since it was last turned; what it made of it is kept. */
function posedAnew(turn) {
    if (turn.set && turn.bone.quaternion.equals(turn.set)) return false;
    turn.raw.copy(turn.bone.quaternion);
    return true;
}

/** A bone turned to `quaternion`, in its parent's frame. */
function turnTo(turn, quaternion) {
    turn.bone.quaternion.copy(quaternion);
    turn.set = (turn.set ?? new THREE.Quaternion()).copy(quaternion);
}

/** A bone as its clip left it. */
function unturn(turn) {
    if (turn.set && turn.bone.quaternion.equals(turn.set)) turn.bone.quaternion.copy(turn.raw);
    turn.bone.position.copy(turn.rest);
    turn.set = null;
}

/**
 * A lying person's spine turned up to lay its back along its lounger's
 * (bendFor): the turn, about the hinge's line in its rig's frame, carried
 * into the spine's own frame — through the turns of everything between
 * its rig's root and it — and the spine moved as well as turned, by
 * (1 − turn)(hinge − joint), so that it turns about the hinge on the
 * lounger rather than its own joint a hand's breadth above it. Then its
 * neck let back, if it is (`nod`). Each done again only when the clip has
 * posed the bone anew.
 */
function bend(person) {
    const b = person.bend;
    const anew = posedAnew(b.spine);
    if (anew) {
        const { bone, chain, rest, raw } = b.spine;
        const scale = chainPose(chain, _at, _parent);
        _joint.copy(rest).multiplyScalar(scale).applyQuaternion(_parent).add(_at);
        _turn.setFromAxisAngle(b.axis, b.lean);
        _shift.copy(b.hinge).sub(_joint);
        _shift.sub(_v.copy(_shift).applyQuaternion(_turn));
        _inverse.copy(_parent).invert();
        bone.position.copy(rest).add(_shift.applyQuaternion(_inverse).divideScalar(scale));
        // spine' = parent⁻¹ · turn · parent · spine
        turnTo(b.spine, _held.copy(_inverse).multiply(_turn).multiply(_parent).multiply(raw));
    }
    if (b.neck && (posedAnew(b.neck) || anew)) {
        chainPose(b.neck.chain, _at, _parent);
        _turn.setFromAxisAngle(b.axis, b.nod);
        turnTo(b.neck, _held.copy(_parent).invert().multiply(_turn).multiply(_parent).multiply(b.neck.raw));
    }
}

/** A person no longer bent to a lounger's back: its spine and its neck as its clip has them. */
function unbend(person) {
    unturn(person.bend.spine);
    if (person.bend.neck) unturn(person.bend.neck);
    person.bend = null;
}

/** A bone turned by `turn`, a turn in its rig's frame, from what its clip last made of it — whatever is above it turned as it now is. */
function turnBy(bone, turn) {
    posedAnew(bone);
    chainPose(bone.chain, _at, _parent);
    turnTo(bone, _held.copy(_parent).invert().multiply(turn).multiply(_parent).multiply(bone.raw));
}

/**
 * A lying person's arms brought in onto its lounger (armsFor): each upper
 * arm swung about its shoulder, then its forearm folded about its elbow,
 * then its hand laid flat — in that order, each from where the one above
 * it now is. Every time: what is above them (a spine bent, a chest
 * breathing) moves under them.
 */
function arm(person) {
    for (const one of person.arms) {
        turnBy(one.upper, one.swing);
        turnBy(one.fore, one.fold);
        if (one.hand) turnBy(one.hand, one.flat);
    }
}

/** A person's arms as its clip has them. */
function unarm(person) {
    for (const one of person.arms) {
        unturn(one.upper);
        unturn(one.fore);
        if (one.hand) unturn(one.hand);
    }
    person.arms = null;
}

/**
 * How a lying body is laid on a lounger whose back rises at `slope`
 * (radians) from a hinge `past` metres toward the head of its seat —
 * from its skin as its clip lies it on the flat (measure's `back`, `head`):
 *
 *   lean  how far its spine is turned up about the hinge for its back to
 *         rest on the lounger's: the slope, less what the lowest of its
 *         back is raised over the flat already (BACK_LOWEST of it, past
 *         BACK_FROM, within BACK_ACROSS) — a clip that lies with its
 *         shoulders up is turned less, one that sits up further than the
 *         lounger not at all;
 *   nod   how far its neck is then let back for its head to rest too,
 *         when it would be HEAD_OFF or more off the lounger — NECK_MOST
 *         at most, not with its hands under it, and not when its back
 *         is not laid on the lounger's at all.
 *
 * Both in radians, about bend's axis (positive, the head rising).
 */
function reclineOf(info, past, slope) {
    const key = `${past.toFixed(3)}|${slope.toFixed(4)}`;
    if (info.reclines.has(key)) return info.reclines.get(key);
    const lowest = (values) => values.sort((a, b) => a - b)[Math.floor(values.length * BACK_LOWEST)];
    const raised = [];
    for (let i = 0; i < info.back.length; i += 3) {
        const along = info.back[i] - past;
        if (along >= BACK_FROM && Math.abs(info.back[i + 2]) <= BACK_ACROSS) raised.push(Math.atan2(info.back[i + 1], along));
    }
    const short = raised.length ? slope - lowest(raised) : slope;
    const lean = THREE.MathUtils.clamp(short, 0, slope);
    let nod = 0;
    // Its head, only when its back is laid: one sat up further than the lounger's back holds its head up itself.
    if (short >= 0 && info.neck && info.head?.length && !info.handsUnder) {
        // Its head from its neck's joint, its back laid: along the flat and over it.
        const cos = Math.cos(lean);
        const sin = Math.sin(lean);
        const laid = (along, up) => [(along - past) * cos - up * sin, (along - past) * sin + up * cos];
        const neck = laid(info.neck[0], info.neck[1]);
        const points = [];
        for (let i = 0; i < info.head.length; i += 3) {
            if (Math.abs(info.head[i + 2]) > BACK_ACROSS) continue;
            const [along, up] = laid(info.head[i], info.head[i + 1]);
            points.push(along - neck[0], up - neck[1]);
        }
        // How far off the lounger's back the lowest of its head is, its neck turned by `angle`.
        const off = (angle) => {
            const c = Math.cos(angle);
            const s = Math.sin(angle);
            const heights = [];
            for (let i = 0; i < points.length; i += 2) {
                const along = neck[0] + points[i] * c - points[i + 1] * s;
                const up = neck[1] + points[i] * s + points[i + 1] * c;
                heights.push(up * Math.cos(slope) - along * Math.sin(slope));
            }
            return lowest(heights);
        };
        if (points.length && off(0) > HEAD_OFF) {
            // Let back until it is a third of that off, or as far as a neck goes.
            let low = -THREE.MathUtils.degToRad(NECK_MOST);
            let high = 0;
            if (off(low) < HEAD_OFF / 3) {
                for (let i = 0; i < 14; i++) {
                    const middle = (low + high) / 2;
                    if (off(middle) > HEAD_OFF / 3) high = middle;
                    else low = middle;
                }
            }
            nod = low;
        }
    }
    const recline = { lean, nod };
    info.reclines.set(key, recline);
    return recline;
}

/**
 * The breathing of someone whose clip is one still pose: its chest and the
 * top of its spine, turned a little back and forth (breathe) from a point
 * in a breath of its own, at a pace a little its own. Null for a rig
 * without them.
 */
function breathOf(person, random) {
    const { character, model, group } = person;
    const bone = (name) => (character.boneNames.has(name) ? model.getObjectByName(character.boneNames.get(name)) : null);
    const chest = bone("Spine1");
    const top = bone("Spine2");
    if (!chest || !top) return null;
    const pace = BREATHS * (0.85 + 0.3 * random());
    return { chest: turnable(chest, group), top: turnable(top, group), pace, time: random() / pace };
}

/**
 * A breath: the chest turned back about its own side-to-side axis as it
 * fills, and the top of the spine most of the way forward again over it,
 * so that the ribs rise and the head hardly moves.
 */
function breathe(person, delta) {
    const b = person.breath;
    b.time += delta;
    const turn = THREE.MathUtils.degToRad(BREATH) * Math.sin(2 * Math.PI * b.pace * b.time);
    posedAnew(b.chest);
    turnTo(b.chest, _held.copy(b.chest.raw).multiply(_turn.setFromAxisAngle(SIDE_TO_SIDE, -turn)));
    posedAnew(b.top);
    turnTo(b.top, _held.copy(b.top.raw).multiply(_turn.setFromAxisAngle(SIDE_TO_SIDE, 0.7 * turn)));
}

/**
 * A held drink stood upright (hold's `held`): the way its hand alone
 * would hold it, swung — its turn about its own upright kept — until it
 * leans no more than UPRIGHT, the way the hand leans it; or, its hand
 * raised to the mouth, until it is tipped at the mouth (SIP_NEAR) — a
 * bottle as far over as that is, a glass no further than SIP_GLASS. Its
 * grip stays where it is in the hand (its origin is its grip), but for a
 * bottle whose hand is nearer the mouth than its own neck is long: that
 * is let down through the hand, along itself, until its mouth is LIPS
 * short of the drinker's.
 */
function upright(person) {
    const held = person.held;
    const turned = person.group.quaternion;
    // A rig's bones may be scaled: its hand's frame, and its head's, in the rig's own metres.
    const scale = chainPose(held.hand, _at, _parent);
    // As its hand alone would hold it, in the rig's frame and in the world's.
    _other.copy(_parent).multiply(held.rest);
    _held.copy(turned).multiply(_other);
    _up.set(0, 1, 0).applyQuaternion(_held);
    leanWithin(_shift.copy(_up), UPRIGHT);
    let slide = 0;
    if (held.head) {
        // From its grip to the mouth, in the rig's frame.
        _rim.copy(held.at).multiplyScalar(scale).applyQuaternion(_parent).add(_at);
        const headScale = chainPose(held.head, _at, _other);
        _mouth.copy(held.mouth).multiplyScalar(headScale).applyQuaternion(_other).add(_at).sub(_rim);
        const away = _mouth.length();
        const near = 1 - THREE.MathUtils.smoothstep(away - Math.max(held.rim, SIP_REACH), SIP_NEAR[0], SIP_NEAR[1]);
        if (near > 0) {
            _shift.lerp(leanWithin(_mouth.applyQuaternion(turned).normalize(), held.bottle ? SIP : SIP_GLASS), near).normalize();
            // Its mouth past the drinker's: let down through the hand by as much.
            if (held.bottle) slide = near * Math.max(0, held.rim + LIPS - away);
        }
    }
    _held.premultiply(_turn.setFromUnitVectors(_up, _shift));
    // Back into its hand's frame.
    _inverse.copy(turned).multiply(_parent).invert();
    held.holder.quaternion.copy(_inverse).multiply(_held);
    held.holder.position.copy(held.at);
    if (slide > 0) held.holder.position.addScaledVector(_up.set(0, 1, 0).applyQuaternion(held.holder.quaternion), -slide / scale);
}

/** A direction (of length one) brought back toward the upright until it leans no more than `most` degrees, the way it leans. */
function leanWithin(direction, most) {
    const limit = THREE.MathUtils.degToRad(most);
    if (Math.acos(THREE.MathUtils.clamp(direction.y, -1, 1)) <= limit) return direction;
    const level = Math.hypot(direction.x, direction.z);
    const k = level > 1e-6 ? Math.sin(limit) / level : 0;
    return direction.set(level > 1e-6 ? direction.x * k : Math.sin(limit), Math.cos(limit), direction.z * k);
}

/**
 * Where the skin on some of a person's bones is, as it is posed now, in
 * its group's frame (the group at the origin, as it is while it is built):
 * each point of its meshes weighted mostly to bones whose names — without
 * their rig's prefix — match `bones`, as x, y, z one after another; no
 * more than `most` of them, evenly taken. Asked again and again of one
 * person as its pose changes, `memo` (an object, empty at first) keeps
 * which points those are.
 */
function skinOf(person, bones, most = 4000, memo = null) {
    person.group.updateMatrixWorld(true);
    let picked = memo?.picked;
    if (!picked) {
        const all = [];
        for (const mesh of person.meshes) {
            const { skinIndex, skinWeight } = mesh.geometry.attributes;
            if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) continue;
            const wanted = mesh.skeleton.bones.map((bone) => bones.test(canonical(bone.name)));
            if (!wanted.includes(true)) continue;
            for (let i = 0; i < skinIndex.count; i++) {
                let weight = 0;
                for (let k = 0; k < 4; k++) if (wanted[skinIndex.getComponent(i, k)]) weight += skinWeight.getComponent(i, k);
                if (weight > 0.6) all.push(mesh, i);
            }
        }
        const step = Math.max(1, Math.ceil(all.length / 2 / most));
        picked = [];
        for (let i = 0; i < all.length; i += 2 * step) picked.push(all[i], all[i + 1]);
        if (memo) memo.picked = picked;
    }
    const points = [];
    for (let i = 0; i < picked.length; i += 2) {
        const mesh = picked[i];
        mesh.getVertexPosition(picked[i + 1], _v).applyMatrix4(mesh.matrixWorld);
        points.push(_v.x, _v.y, _v.z);
    }
    return points;
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

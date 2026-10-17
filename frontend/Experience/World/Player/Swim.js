import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

import { canonical } from "../../Utils/fitClip.js";
import { ONCE, VISITOR_CLIPS } from "./Avatar.js";
import { poolSteps } from "../../../../shared/landscape.js";

/**
 * In a pool (shared/landscape.js's `pools`): wading, swimming and climbing
 * out, for the visitor's own body (Player.js), and the swimming clips for
 * every figure that swims, the visitor's and everyone else's.
 *
 * By how deep the water is at the feet, from its level:
 *
 *   wading     deeper than WADE: still walking, on the pool's floor or its
 *              steps' ramp, the slower the deeper (`pace`), the stride
 *              slower too (`stride`);
 *   afloat     deeper than SWIM, or fallen in: the capsule's line shortened
 *              to SEGMENT under the head, and held up by the water rather
 *              than pulled down — a damped spring with the head FLOAT over
 *              the surface, which a jump in plunges under and comes back up
 *              from — swimming at SPEED (Shift faster), treading water when
 *              still. Never on the floor, so never jumping: no diving;
 *   standing   swimming over the steps, where a floor is less than FOOTING
 *              under the surface (the steps' ramp, met by a ray down) — or
 *              less than STAND_MOST, where the figure's feet have come onto
 *              a tread (keel) — the body stands on it again and wades out:
 *              both are under SWIM, so the one does not flicker into the
 *              other;
 *   climbing   afloat beside the pool's edge, Space (or the touch button,
 *              "Climb out") lifts the body over the edge onto the coping in
 *              CLIMB seconds, if there is room to stand there.
 *
 * The figure afloat is placed by what shows of it over the water
 * (postureOf): what it wears kept under — Ready Player Me's hoodies stand
 * up round the neck, the male avatar's hood as high behind his head as his
 * mouth is in front, and poked out of the water as a pale wedge — and its
 * eyes over, at every moment of the clip it plays; laid back about its
 * head as far as that takes (setNode), as someone treading water leans
 * back; its head over its root, under the capsule's head, where the camera
 * is. Where both cannot be had, the face wins, by a little. One clip fading
 * into another, the two ways of floating are weighed as the crossfade
 * weighs the clips (floatOf), so the figure goes from one to the other as
 * its pose does. It bobs a little too, the capsule and the camera not, so a
 * visitor treading water is at rest for the editor's frames on demand
 * (Pace.js).
 *
 * All of the figure is kept in the water: inside the pool's walls, however
 * its stroke reaches (clear: a swim into a wall stops where the figure
 * would meet it, and treads water there), and off its steps' treads
 * (keel: lifted as its feet come onto a tread swimming up them, and stood
 * up on it; pushed back off them treading water before them).
 *
 * The clips. Mixamo's swimming strokes, treading water and climbing out
 * (assets/people/avatar/*.fbx, downloaded by whoever runs the app; their
 * licence keeps them out of the repository) are made by `npm run people`
 * (blender/import_people.py --avatar-clips: each stroke cut to a loop, held
 * in place and swum heads-up; the climb begun with the head out of the
 * water) into public/models/people/avatar-clips.glb and avatar-clips.json,
 * and fitted to each avatar the first time a figure swims (Avatar.wear).
 * Without the file, each is played as its stand-in (Avatar.js's
 * STAND_INS), and climbing out is a lift onto the coping. They are played,
 * and sent to everyone else, by the names in CLIPS. Climbing out by the
 * clip, the figure swims to the pool's edge, comes on at swimming pace to
 * where the clip has its hands on it, and the clip carries it out — fitted
 * to the edge as it goes (climbFitOf: its hands kept on the coping, its
 * feet out of the wall) — the capsule, and the camera, following its hips
 * (updateClimb).
 */

/** How deep the water at the feet must be to wade, to swim, and (swimming) how near a floor under the surface is stood on, in metres. */
export const WADE = 0.3;
export const SWIM = 1.2;
export const FOOTING = 1.05;
/** ...or, where the figure's feet have come onto a tread (keel), a floor under the head as deep as this. */
const STAND_MOST = SWIM - 0.02;
/** Afloat: the capsule's line (its end, the head, where the camera turns), and how far that is held over the water. */
const SEGMENT = 0.3;
const FLOAT = 0.12;
/** The spring the water holds the head up by: how stiff, how damped (a plunge comes back up in about a second, overshooting a little). */
const BUOYANCY = 30;
const SETTLE = 9;
/** Swimming: how fast, in metres a second, Shift (or the stick pushed hard) this many times faster; how briskly it starts and glides to a stop. */
const SPEED = 0.85;
const FAST = 1.8;
const GLIDE = 4;
/** Wading: walking pace at the deepest water still waded in, and how much slower the stride plays there. */
const WADE_PACE = 0.5;
const WADE_STRIDE = 0.65;
/** A figure afloat bobs this much, this often (radians a second), drawn only. */
const BOB = 0.016;
const BOB_RATE = 1.7;
/**
 * Where the water comes on a figure afloat (postureOf): what it wears
 * kept DRY under it at the top of a bob, and its eyes EYES_OUT over it at
 * the bottom of one (the mouth about at the water, the nose out); where
 * the two cannot both be had, the eyes as little as FACE_GIVE nearer the
 * water and what it wears over it by the rest.
 */
const DRY = 0.012;
const EYES_OUT = 0.05;
const FACE_GIVE = 0.02;
/** A figure's eyes, by their meshes' names (Ready Player Me's "EyeLeft"); and where the eyes are over the head's bone, for a figure with neither those nor eye bones. */
const EYES = /^eye|eye(left|right)|(left|right)eye/i;
const EYES_OVER_HEAD = 0.08;
/**
 * How far a figure afloat may be laid back about its head (setNode), in
 * turn — the least that keeps what it wears under (to SHOW_GIVE), or of
 * that and the next FLOOR_LEANS the least that keeps its feet off the
 * pool's floor too (postureOf): laid back, its legs come up before it, but
 * further than that treading water stops reading as treading water, its
 * hands up before its face — and how briskly it leans into it and out as it
 * comes into the water and leaves it.
 */
const LEANS = [0, 10, 20, 30, 40, 50].map((degrees) => THREE.MathUtils.degToRad(degrees));
const SHOW_GIVE = 0.002;
const FLOOR_LEANS = 1;
const LEAN_RATE = 5;
/** Its feet, by the bones their points are weighted to: what of it goes deepest (postureOf); and its feet alone, by the leg (feetOf). */
const FOOT_BONES = /^(Left|Right)(Leg|Foot|ToeBase|Toe_End)$/;
const FEET_BONES = /^(Left|Right)(?:Foot|ToeBase|Toe_End)$/;
const LEGS = ["Left", "Right"];
/** Afloat, how far a foot may be lifted off the floor under it by its knee at most, in metres (liftFeet). */
const FEET_LIFT_MOST = 0.4;
/**
 * A figure's own skin, hair, eyes and teeth, by its meshes' or materials'
 * names (Ready Player Me's "Wolf3D_Body", "Wolf3D_Skin", "Wolf3D_Hair"…):
 * what of it may show over the water. The rest is what it wears.
 */
const BARE = /skin|body|head|hair|eye|teeth|tongue|beard/i;
/**
 * The head's bones: what is weighted to them is the head (a pair of
 * glasses), whatever it is; and the arms' — a stroke's arms come forward
 * over the water as a swimmer's do, sleeves and all, and treading water
 * they scull at it.
 */
const HEAD_BONES = /^(Head|HeadTop_End|LeftEye|RightEye|Jaw)$/;
const ARM_BONES = /^(Left|Right)(Arm|ForeArm|Hand)|^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)/;
/**
 * How many times through a clip a figure is looked at (postureOf), and
 * every how many of what it wears' points: a stroke's kick brings the feet
 * up from the bottom of the figure to the top of it, so every part is
 * followed — one point in two is a centimetre or so apart. All of it, for
 * how far it reaches and how deep it goes, every REACH_EVERY; and as one
 * clip fades into another, what it wears and its eyes every FADE_EVERY
 * (fadeLevel).
 */
const LOOKS = 12;
const WORN_EVERY = 2;
const REACH_EVERY = 3;
const FADE_EVERY = 6;
/**
 * Afloat in third person, the camera turns round a point this far over the
 * head, eased in and out at LIFT_RATE (a second or so): from just over the
 * water, behind the head, its boom ran under the loungers at the edge and
 * the people lying on them, whom no ray meets (World/Collision.js).
 */
const LIFT = 0.45;
const LIFT_RATE = 4;
/**
 * The pool's walls (clear): all of the figure — not only the capsule, which
 * is its head's — is kept WALL_CLEAR inside them, however it reaches at any
 * moment of its clip (postureOf's `reach`, REACH_WAYS ways round); turned
 * into one, it is pushed off it at PUSH_RATE at most. A swim into a wall
 * stops where the stroke — or treading water, which the figure settles into
 * there — would meet it: settled into once the way the keys push is
 * BLOCK_STOP into the wall (its cosine), the wall within BLOCK_NEAR of where
 * the stroke meets it; and kept while more than BLOCK_FREE is and the wall
 * within BLOCK_MARGIN — and for BLOCK_HOLD at least, unless the figure turns
 * away from the wall.
 */
const WALL_CLEAR = 0.04;
const PUSH_RATE = 1.5;
const STEPS_PUSH_RATE = 3;
const BLOCK_STOP = 0.8;
const BLOCK_FREE = 0.4;
const BLOCK_NEAR = 0.01;
const BLOCK_MARGIN = 0.1;
const BLOCK_HOLD = 0.5;
const REACH_WAYS = 16;
/**
 * The pool's steps (keel): what of the figure goes deeper than KEEL_FROM
 * under the water, in cells KEEL_CELL across, is kept KEEL_CLEAR over the
 * treads under it — a tread's edge met as a slope STEP_SLOPE steep, so
 * that it is felt before the feet are over it. Swimming on onto the steps,
 * the figure is lifted as its feet come onto a tread, LIFT_MOST at most
 * (the first tread's rise), until it stands on them (stand): eased up at
 * RAISE_RATE — its knees, which keep its feet off whatever is under them
 * (liftFeet), take up the rest meanwhile; lifted at once, it rose 0.23 m in
 * a frame where treading water's legs, laid back, came over the steps'
 * corner — and let down again at SINK_RATE. Otherwise — treading water before the steps, laid back, its
 * legs before it over the treads — it is pushed back off them, as off a
 * wall (clear), at STEPS_PUSH_RATE. (The pool's floor is postureOf's, and
 * fadeLevel's.)
 */
const KEEL_FROM = 0.3;
const KEEL_CELL = 0.12;
const KEEL_CLEAR = 0.03;
const LIFT_MOST = 0.3;
const STEP_SLOPE = 1.5;
const RAISE_RATE = 8;
const SINK_RATE = 6;
/** Climbing out: from this near the edge (between the figure and the pool's side), onto a spot this far beyond it, over this long (without the clip: a lift). */
const CLIMB_REACH = 0.3;
const CLIMB_OUT = 0.55;
const CLIMB_REACH_IN = 0.3;
const CLIMB = 1.1;
/**
 * Climbing out by the clip (played as fast as Avatar.js's ONCE has it): its
 * hands' wrists this far over the coping they hold at its start (the palm
 * and fingers on it). The figure swims to the edge first, its stroke
 * playing, until the stroke meets the wall (TO_EDGE_MOST seconds at most);
 * then comes on from there to where the clip has its hands on the edge, at
 * swimming pace at the most (over CLIMB_REACH_IN at least): the stroke
 * fading into the clip — held at its start — and the figure up to the
 * clip's height over the first GRAB_RISE of the way, on to the edge over
 * the rest from GRAB_ON, its hands up out of the water before they come
 * over the coping; and at its end — the
 * clip ends crouched on the coping — it is stood up into idle where the
 * capsule lands over CLIMB_STAND, its soles no lower than SOLE_CLEAR over
 * what is under them (eased in at SOLE_RATE).
 */
const CLIMB_PACE = ONCE.climbing;
const HAND_OVER = 0.03;
const TO_EDGE_MOST = 2;
const GRAB_RISE = 0.7;
const GRAB_ON = 0.2;
const CLIMB_STAND = 0.7;
const SOLE_CLEAR = 0.01;
const SOLE_RATE = 25;
/**
 * The climb fitted to the pool's edge (climbFitOf), looked at CLIMB_LOOKS
 * times through: its hands let down onto the coping while they are over it
 * — the lowest of their bones as high over it as its wrists are at its
 * start — but none of their bones over it less than FINGERS_OVER over it,
 * nor its toes less than TOE_OVER once they are over it (its ankles
 * ANKLE_OVER, its knees KNEE_OVER); and the figure leant forward
 * about its hands, TILT_MOST at most, as far as keeps its legs FOOT_CLEAR
 * (by bone) behind the wall's face under the coping, as feet set against a
 * wall are.
 */
const CLIMB_LOOKS = 41;
const FINGERS_OVER = 0.015;
const TOE_OVER = 0.03;
const ANKLE_OVER = 0.07;
const KNEE_OVER = 0.07;
const TILT_MOST = THREE.MathUtils.degToRad(30);
const TILT_STEP = THREE.MathUtils.degToRad(0.5);
const FOOT_CLEAR = { Toe_End: 0.04, ToeBase: 0.06, Foot: 0.08, Leg: 0.08 };
const HAND_BONES = ["LeftHand", "RightHand", "LeftHandMiddle1", "RightHandMiddle1", "LeftHandMiddle4", "RightHandMiddle4"];
const LEG_BONES = ["Left", "Right"].flatMap((side) => Object.keys(FOOT_CLEAR).map((part) => [`${side}${part}`, FOOT_CLEAR[part], part]));
const CLIMB_BONES = [...HAND_BONES, ...LEG_BONES.map(([bone]) => bone)];
/** Swimming a stroke (Shift, or the stick pushed hard), its clip played this much faster. */
const STROKE_FAST = 1.35;
/** A landing spot taken by something (a lounger, the screen wall) is looked for this far either way along the edge. */
const CLIMB_ASIDE = [0, 0.35, -0.35, 0.7, -0.7];
/** What the prompt offers afloat is looked at again once the head has moved this far, or this long after (offer). */
const OFFER_MOVED = 0.05;
const OFFER_AGAIN = 0.25;

/**
 * The swimming clips by what they are played as (Avatar.js's VISITOR_CLIPS,
 * which finds each in the clips file by its name): `climbing` out over the
 * edge — `swimming`, a stroke (Mixamo's frog kick) swum heads-up, at
 * swimming pace — `breaststroke`, the other, swum faster (Shift) where it
 * has both — `treading` water, still.
 */
export const CLIPS = Object.fromEntries(["climbing", "breaststroke", "treading", "swimming"].map((name) => [name, VISITOR_CLIPS[name]]));
/** Every name a figure in the water plays (and is sent to others as). */
export const WATER_NAMES = new Set([...Object.keys(CLIPS)]);
/** Those played afloat, each with its way of floating (postureOf). */
const FLOATING = ["treading", "swimming", "breaststroke"];

/** How a figure floats in each clip it plays afloat (postureOf), and how its climb out is fitted to the edge (climbFitOf), by the clip; and the figures whose ways of floating are being worked out ahead (prepare). */
const POSTURES = new WeakMap();
const FITS = new WeakMap();
const PREPARED = new WeakSet();
/** Each laid-back skeleton's node as the figure was made (setNode); and, by figure, the points of it its water is looked at by as it fades from one clip to another (fadeLevel). */
const UPRIGHT = new WeakMap();
const SHAPES = new WeakMap();
/** Other visitors' figures: how they float now, and how far into it (layOther). */
const LEANT = new WeakMap();
/** By figure, its feet's points (feetOf) and its legs' bones (legOf). */
const FEET = new WeakMap();
const LEG_NODES = new WeakMap();
/** Each way round a figure its reach is measured in (postureOf): across it and along it. */
const SINES = Array.from({ length: REACH_WAYS }, (_, k) => Math.sin((k * 2 * Math.PI) / REACH_WAYS));
const COSINES = Array.from({ length: REACH_WAYS }, (_, k) => Math.cos((k * 2 * Math.PI) / REACH_WAYS));
/** The sides of a pool's box, as `[x, z]` the way out over each. */
const SIDES = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
];

const _ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const _test = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.35);
const _from = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hips = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _hipAt = new THREE.Vector3();
const _kneeAt = new THREE.Vector3();
const _footAt = new THREE.Vector3();
const _target = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _t = new THREE.Vector3();
const _bent = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _hipQ = new THREE.Quaternion();
const _kneeQ = new THREE.Quaternion();
const _footQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _across = new THREE.Vector3(1, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _playing = [];
const _meant = new Float32Array(REACH_WAYS);

export default class Swimmer {
    /**
     * @param {Player} player  whose body, keys, camera and avatar it moves
     */
    constructor(player) {
        this.player = player;
        this.experience = player.experience;
        const pools = player.spec?.landscape?.pools;
        /** The pools, with their boxes, levels and floors. */
        this.pools = Array.isArray(pools) ? pools.filter((pool) => Array.isArray(pool?.box) && pool.box.length === 4 && Number.isFinite(pool.level) && Number.isFinite(pool.depth)) : [];
        /** Each pool's steps (shared/landscape.js's poolSteps), by the pool. */
        this.stepsOf = new Map(this.pools.map((pool) => [pool, poolSteps(pool)]));
        /** The pool the feet are in now (any depth), or null. */
        this.pool = null;
        /** How deep the water is at the feet, in metres: 0 out of it. */
        this.depth = 0;
        /** Afloat: `{ pool, t }`; or null. */
        this.afloat = null;
        /** Climbing out: the climb under way; or null. */
        this.climb = null;
        /** What the prompt offers afloat (offer), as it was last worked out, and where and when: `{ x, z, t }`. */
        this.edge = null;
        this.edgeAt = null;
        /** How far over the head the camera turns, now (pivot). */
        this.lifted = 0;
        /** How the figure floats now (floatOf), and how much of that it has taken on: 1 afloat, eased to and from 0 out of the water (pose). */
        this.floating = null;
        this.share = 0;
        /** Whether its skeleton's node is turned from as it was made (setNode). */
        this.leaning = false;
        /** Swimming fast (clip): Shift held, or the stick pushed hard. */
        this.fast = false;
        /** Swimming into a wall its stroke has met (clear): treading water there; and since when, in its time afloat. */
        this.blocked = false;
        this.blockedAt = 0;
        /** How far its feet would go into a tread or the floor under it as it floats — into the steps alone — and how far it is lifted for that, in metres (keel). */
        this.footing = 0;
        this.onSteps = 0;
        this.onFloor = 0;
        this.raised = 0;
        /** Swimming on up the pool's steps (clear): lifted over them, not pushed back off them. */
        this.upSteps = false;
        /** Swimming to the edge to climb out over it by the clip (climbOut): `{ edge, plan, t }`; or null. */
        this.toEdge = null;
        /** How far each foot is lifted off the floor by its knee, afloat (liftFeet). */
        this.feet = { Left: 0, Right: 0 };
    }

    /** Wading: the feet on a floor in water deeper than WADE (and shallower than SWIM). */
    get wading() {
        return !this.afloat && !this.climb && this.depth > WADE;
    }

    /** In the water's hold: afloat, or climbing out of it. */
    get swimming() {
        return Boolean(this.afloat || this.climb);
    }

    /** How fast to walk, wading: 1 at WADE, WADE_PACE at SWIM. */
    get pace() {
        if (!this.wading) return 1;
        return 1 - (1 - WADE_PACE) * THREE.MathUtils.smoothstep(this.depth, WADE, SWIM);
    }

    /**
     * How fast the figure's clip plays: slower wading; afloat, a stroke's
     * stand-in slower (strideOf) and a stroke swum fast faster
     * (STROKE_FAST). Climbing out, as it is (its clip's own pace: Avatar.js's ONCE).
     */
    get stride() {
        if (this.wading) return 1 - (1 - WADE_STRIDE) * THREE.MathUtils.smoothstep(this.depth, WADE, SWIM);
        if (!this.afloat) return 1;
        const name = this.player.player.animation;
        const stride = strideOf(this.player.avatar, name);
        return stride === 1 && this.fast && (name === "breaststroke" || name === "swimming") ? STROKE_FAST : stride;
    }

    /**
     * The point the camera turns round (Player.followBody): the head — or,
     * in the water's hold in third person, LIFT over it, eased.
     *
     * @param {THREE.Vector3} head  the capsule's end
     * @returns {THREE.Vector3}  `head` itself, out of the water
     */
    pivot(head) {
        const wanted = this.swimming && this.player.camera.mode === "third" ? LIFT : 0;
        if (wanted === 0 && this.lifted === 0) return head;
        this.lifted += (wanted - this.lifted) * (1 - Math.exp(-LIFT_RATE * this.experience.time.delta));
        if (wanted === 0 && this.lifted < 0.002) this.lifted = 0;
        return _pivot.copy(head).setY(head.y + this.lifted);
    }

    /** Out of the water at once: placed elsewhere (a spawn, a room, a seat, a car). The body is the caller's to place. */
    reset() {
        this.afloat = null;
        this.climb = null;
        this.toEdge = null;
        this.pool = null;
        this.depth = 0;
        this.edge = this.edgeAt = null;
        this.lifted = 0;
        this.fast = false;
        this.blocked = false;
        this.footing = this.onSteps = this.onFloor = this.raised = 0;
        this.floating = null;
        this.share = 0;
        if (this.leaning && this.player.avatar) setNode(this.player.avatar, 0, 0, 0);
        this.leaning = false;
    }

    /** The pool (x, z) is over, or null. */
    poolAt(x, z) {
        for (const pool of this.pools) {
            const [x0, z0, x1, z1] = pool.box;
            if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return pool;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Each frame
    // ------------------------------------------------------------------

    /**
     * Where the body is in the water, before it moves: into the water's
     * hold, deep enough, or out of it onto a floor. Whether this frame's
     * move is the water's (swim, the climb) — or the walk's, wading or not.
     */
    update() {
        if (!this.pools.length) return false;
        if (this.climb) {
            this.updateClimb();
            return true;
        }
        const body = this.player.player.collider;
        const pool = this.poolAt(body.end.x, body.end.z);
        this.pool = pool;
        if (pool) this.prepare(pool);
        this.depth = pool ? Math.max(0, pool.level - (body.start.y - body.radius)) : 0;
        if (!pool) {
            // (Afloat, the pool's walls hold the body in: out of its box only placed or climbed out.)
            if (this.afloat) this.afloat = null;
            return false;
        }
        if (this.afloat) {
            if (this.stand(pool)) return false;
            this.swim(pool);
            return true;
        }
        if (this.depth > SWIM) {
            this.float(pool);
            this.swim(pool);
            return true;
        }
        return false;
    }

    /** Into the water's hold: the capsule's line shortened under the head, as it was moving (a jump in plunges on). */
    float(pool) {
        const body = this.player.player.collider;
        body.start.copy(body.end);
        body.start.y -= SEGMENT;
        this.afloat = { pool, t: 0 };
        this.edge = this.edgeAt = null;
        this.toEdge = null;
        this.blocked = false;
        this.footing = this.onSteps = this.onFloor = this.raised = 0;
        this.player.player.onFloor = false;
        this.player.jumpOnce = false;
    }

    /**
     * Afloat, over a floor less than FOOTING under the surface — the steps'
     * ramp — or less than STAND_MOST where the figure's feet have come onto a
     * tread (keel), stood on it: the whole capsule again, on that floor, the
     * figure and the camera eased up to it (Player.updateRising).
     */
    stand(pool) {
        const body = this.player.player.collider;
        _ray.origin.set(body.end.x, pool.level + 0.1, body.end.z);
        const hit = this.experience.world.collision.rayIntersect(_ray, { far: STAND_MOST + 0.1 });
        if (!hit) return false;
        const floor = _ray.origin.y - hit.distance;
        const under = pool.level - floor;
        if (under >= (this.onSteps > 0 ? STAND_MOST : FOOTING)) return false;
        const player = this.player;
        player.rising = player.avatar ? { position: player.avatar.avatar.position.clone(), pivot: player.pivot().clone(), t: 0 } : null;
        body.start.set(body.end.x, floor + body.radius + 0.02, body.end.z);
        body.end.copy(body.start);
        body.end.y += player.player.height;
        player.player.velocity.y = 0;
        this.afloat = null;
        this.toEdge = null;
        this.blocked = false;
        this.footing = this.onSteps = this.onFloor = this.raised = 0;
        // (The camera's pivot is eased down to the head by the rising, not by the lift.)
        this.lifted = 0;
        this.depth = Math.max(0, under);
        return true;
    }

    /**
     * A frame afloat: steered as walking is (Player.steer), at swimming
     * pace, gliding to a stop; held up by the water; all of the figure kept
     * off the pool's walls and its steps (clear); never on a floor.
     */
    swim(pool) {
        const player = this.player;
        const state = player.player;
        const body = state.collider;
        const delta = this.experience.time.delta;
        this.afloat.t += delta;
        this.afloat.pool = pool;
        const toEdge = this.toEdge;
        const fast = !toEdge && (player.actions.run || (player.actions.movingJoyStick && player.joystickPace() > 1.7));
        if (toEdge) {
            // Swimming to the edge it is to climb out over (climbOut): straight out at it, as the keys would take it.
            toEdge.t += delta;
            const [ox, oz] = toEdge.edge.ref.out;
            _wish.set(ox, 0, oz).multiplyScalar(delta * SPEED * GLIDE);
            state.velocity.add(_wish);
        } else {
            // (The stick's push is how fast to swim, up to SPEED; pushed hard, FAST. Which way the keys push: clear.)
            const vx = state.velocity.x;
            const vz = state.velocity.z;
            player.steer(delta * SPEED * GLIDE * (fast ? FAST : 1), Math.min(1, player.joystickVector.length() * 1.4));
            _wish.set(state.velocity.x - vx, 0, state.velocity.z - vz);
        }
        const glide = Math.exp(-GLIDE * delta);
        state.velocity.x *= glide;
        state.velocity.z *= glide;
        state.velocity.y += (BUOYANCY * (pool.level + FLOAT - body.end.y) - SETTLE * state.velocity.y) * delta;
        this.clear(pool, fast, _wish, Boolean(toEdge) || player.isMoving());
        const from = body.getCenter(_from);
        body.translate(_v.copy(state.velocity).multiplyScalar(delta));
        player.playerCollisions(from);
        state.onFloor = false;
        player.jumpOnce = false;
        // At the edge — its stroke at the wall, where a swim into it is stopped (clear) — or long enough on the way: out over it.
        if (toEdge && (this.blocked || toEdge.t > TO_EDGE_MOST)) this.beginClimb(toEdge.edge, toEdge.plan);
    }

    /**
     * All of the figure inside the pool's walls, not only the capsule — a
     * stroke reaches 0.4 m and more before the head, and treading water,
     * laid back, its legs a metre before it: as far as it reaches across the
     * water each way at any moment of the clip it plays (postureOf's
     * `reach`, weighed as the clips are: floatOf), turned the way the figure
     * faces, WALL_CLEAR inside each wall of the pool's box — the body pushed
     * off one it has turned into, at PUSH_RATE at most. Swimming, its way
     * into a wall is stopped where its stroke would meet the wall, or
     * treading water would (which it settles into there: `blocked`, clip),
     * so that stopping there does not push it back off. And pushed back off
     * the pool's steps where its feet are over more of them than it is
     * lifted for (keel). Nothing is cast: a pool is its box.
     */
    clear(pool, fast, wish = null, moving = this.player.isMoving()) {
        const player = this.player;
        const figure = player.avatar;
        const shown = this.floating?.reach;
        if (!figure || !shown) {
            this.blocked = false;
            return;
        }
        const body = player.player.collider;
        const velocity = player.player.velocity;
        const delta = this.experience.time.delta;
        // (As far as the stroke it swims reaches, or treading water, whichever reaches further: either may play at the wall.)
        const meant = _meant;
        const stroke = postureOf(figure, this.strokeName(fast), pool.depth)?.reach;
        const tread = postureOf(figure, "treading", pool.depth)?.reach;
        for (let k = 0; k < REACH_WAYS; k++) meant[k] = Math.max(shown[k], stroke?.[k] ?? -Infinity, tread?.[k] ?? -Infinity);
        const yaw = yawOf(figure.avatar.quaternion);
        const [x0, z0, x1, z1] = pool.box;
        const { x, z } = body.end;
        const gaps = [x - x0, x1 - x, z - z0, z1 - z];
        const wishing = wish ? Math.hypot(wish.x, wish.z) : 0;
        let pushX = 0;
        let pushZ = 0;
        let contact = false;
        let pressing = -Infinity;
        for (let i = 0; i < 4; i++) {
            const [nx, nz] = SIDES[i];
            const way = Math.atan2(nx, nz) - yaw;
            const over = Math.max(body.radius, reachAlong(shown, way)) + WALL_CLEAR - gaps[i];
            if (over > 0) {
                pushX -= nx * over;
                pushZ -= nz * over;
            }
            const need = Math.max(body.radius, reachAlong(meant, way)) + WALL_CLEAR;
            const into = velocity.x * nx + velocity.z * nz;
            if (into > 0 && gaps[i] <= need + into * delta) {
                velocity.x -= nx * into;
                velocity.z -= nz * into;
            }
            // At the wall: where its way into it is stopped — once there, a little further out too (BLOCK_MARGIN).
            if (gaps[i] <= need + (this.blocked ? BLOCK_MARGIN : Math.max(0, into) * delta + BLOCK_NEAR)) {
                contact = true;
                if (wishing > 1e-9) pressing = Math.max(pressing, (wish.x * nx + wish.z * nz) / wishing);
            }
        }
        // Its legs over the steps, not swimming on up them: back off them, the way down them (keel).
        const steps = this.stepsOf.get(pool);
        const up = steps ? velocity.x * steps.out[0] + velocity.z * steps.out[1] : 0;
        this.upSteps = Boolean(steps) && moving && up > 0.1;
        if (steps && !this.upSteps && this.onSteps > 0) {
            // (Briskly: the legs swing out before it as it stops, faster than a wall's push would take them back.)
            const [ox, oz] = steps.out;
            const back = Math.min(this.onSteps / STEP_SLOPE + 0.01, STEPS_PUSH_RATE * delta);
            body.translate(_v.set(-ox * back, 0, -oz * back));
            if (up > 0) {
                velocity.x -= ox * up;
                velocity.z -= oz * up;
            }
        }
        const push = Math.hypot(pushX, pushZ);
        if (push > 1e-4) {
            const k = Math.min(1, (PUSH_RATE * delta) / push);
            body.translate(_v.set(pushX * k, 0, pushZ * k));
        }
        // Treading water at the wall (`blocked`) while the keys push it into it — by which way they push, not how the
        // body still moves: stopped against the wall, what is left of its speed is a frame's push, and its way along
        // the wall, so that by its speed it went from the stroke to treading water and back up to six times as it came
        // to rest. Still, as it was; turned away from the wall, at once; but pushed on along it, not for BLOCK_HOLD.
        let blocked = this.blocked;
        if (!contact) blocked = false;
        else if (moving && wishing > 1e-9) blocked = pressing > (this.blocked ? BLOCK_FREE : BLOCK_STOP);
        if (this.blocked && !blocked && contact && pressing > 0 && this.afloat.t - this.blockedAt < BLOCK_HOLD) blocked = true;
        if (blocked !== this.blocked) {
            this.blocked = blocked;
            this.blockedAt = this.afloat.t;
        }
    }

    // ------------------------------------------------------------------
    // Climbing out
    // ------------------------------------------------------------------

    /**
     * Afloat beside the pool's edge — the figure, not only its head, within
     * CLIMB_REACH of it — where climbing out would land: the spot on the
     * coping beyond the nearest side, free to stand in, as something to act
     * on (World/Interactables.js's shape: the prompt's "Climb out" on
     * Space); or null. Asked every frame by the prompt, it looks again (a
     * ray and a capsule's test for each spot along the edge, up to five)
     * only once the head has moved OFFER_MOVED or OFFER_AGAIN after it last
     * looked.
     */
    offer() {
        if (!this.afloat || this.toEdge) {
            this.edge = this.edgeAt = null;
            return null;
        }
        const body = this.player.player.collider;
        const { x, z } = body.end;
        const was = this.edgeAt;
        if (was && Math.hypot(x - was.x, z - was.z) < OFFER_MOVED && this.afloat.t - was.t < OFFER_AGAIN) return this.edge;
        this.edgeAt = { x, z, t: this.afloat.t };
        this.edge = null;
        const pool = this.afloat.pool;
        const [x0, z0, x1, z1] = pool.box;
        // How far the figure reaches across the water each way (clear).
        const reach = this.floating?.reach;
        const yaw = this.player.avatar ? yawOf(this.player.avatar.avatar.quaternion) : 0;
        const short = (gap, out) => gap - Math.max(body.radius, reach ? reachAlong(reach, Math.atan2(out[0], out[1]) - yaw) : 0);
        // The nearest side to the figure, and which way is out over it.
        const sides = [
            { side: "x0", gap: x - x0, out: [-1, 0], at: [x0, z] },
            { side: "x1", gap: x1 - x, out: [1, 0], at: [x1, z] },
            { side: "z0", gap: z - z0, out: [0, -1], at: [x, z0] },
            { side: "z1", gap: z1 - z, out: [0, 1], at: [x, z1] },
        ]
            .map((side) => ({ ...side, short: short(side.gap, side.out) }))
            .sort((a, b) => a.short - b.short);
        const near = sides[0];
        if (near.short > CLIMB_REACH) return null;
        const [ox, oz] = near.out;
        for (const aside of CLIMB_ASIDE) {
            // Along the side, inside the pool's length.
            const along = ox ? THREE.MathUtils.clamp(near.at[1] + aside, z0 + body.radius, z1 - body.radius) : THREE.MathUtils.clamp(near.at[0] + aside, x0 + body.radius, x1 - body.radius);
            const lx = (ox ? near.at[0] : along) + ox * CLIMB_OUT;
            const lz = (oz ? near.at[1] : along) + oz * CLIMB_OUT;
            const landing = this.landing(lx, lz, pool);
            if (!landing) continue;
            // (Where the water's edge is, straight in from the landing: where a climb holds on.)
            const at = [ox ? near.at[0] : along, oz ? near.at[1] : along];
            this.edge = { kind: "pool", id: `${pool.id ?? "pool"}:${near.side}`, ref: { landing, out: near.out, at, pool }, label: "Climb out", provider: CLIMB_OUT_PROVIDER };
            return this.edge;
        }
        return null;
    }

    /** Somewhere to stand at (x, z) beyond the edge: a floor a little over the water, room for the whole capsule. Its feet, or null. */
    landing(x, z, pool) {
        const collision = this.experience.world.collision;
        _ray.origin.set(x, pool.level + 1.5, z);
        const hit = collision.rayIntersect(_ray, { far: 2 });
        if (!hit || hit.distance > 2) return null;
        const floor = _ray.origin.y - hit.distance;
        if (floor < pool.level || floor > pool.level + 0.6) return null;
        const body = this.player.player.collider;
        _test.radius = body.radius;
        _test.start.set(x, floor + body.radius + 0.02, z);
        _test.end.copy(_test.start);
        _test.end.y += this.player.player.height;
        const met = collision.capsuleIntersect(_test);
        if (met && met.depth > 0.02) return null;
        return new THREE.Vector3(x, floor, z);
    }

    /**
     * Out over the edge (`target`, offer's, or the edge offered now). By the
     * climbing clip, where the figure has it (climbPlan): the figure swims
     * on to the edge (`toEdge`, swim), comes on to where the clip has its
     * hands on the coping (beginClimb), the clip is played through, fitted
     * to the edge (climbFitOf), the capsule following its hips up and over onto the
     * landing, and the figure stood up there. Without it, a lift: the body
     * onto the coping in CLIMB seconds, up first and then over, playing the
     * clip's stand-in (a jump). Nothing collides on the way: the way was
     * looked at (landing).
     *
     * @returns {{ kind: string, id: string, state: string }|null}  what it did, for the world ("interact")
     */
    climbOut(target = null) {
        const edge = target ?? this.offer();
        if (!edge || !this.afloat || this.climb || this.toEdge) return null;
        const player = this.player;
        const plan = this.climbPlan(edge);
        player.actions.jump = false;
        player.jumpOnce = false;
        this.edge = this.edgeAt = null;
        // By the clip, swum to the edge first (swim), its stroke playing — not glided there with the clip held still.
        if (plan) this.toEdge = { edge, plan, t: 0 };
        else this.beginClimb(edge, null);
        return { kind: "pool", id: edge.id, state: "climbing" };
    }

    /**
     * The climb out over `edge` begun, by the clip's `plan` (climbPlan) or,
     * without it, by the lift: by the clip, from where the figure has swum
     * to — its stroke at the wall — the last of the way to where the clip has
     * its hands on the coping taken at no more than swimming pace (its head
     * SPEED at its fastest, eased in and out: CLIMB_REACH_IN at least), its
     * stroke, or treading water, fading into the climb meanwhile.
     */
    beginClimb(edge, plan) {
        const player = this.player;
        const body = player.player.collider;
        const landing = edge.ref.landing;
        const avatar = player.avatar?.avatar;
        const from = avatar ? avatar.position.clone() : null;
        const head = plan && from ? headOf(player.avatar, new THREE.Vector3()) : null;
        const far = head ? Math.hypot(plan.head.x - head.x, plan.head.z - head.z) : 0;
        this.climb = {
            t: 0,
            start: body.end.clone(),
            // (Standing on it as walking does, not 2 cm over it to drop onto it once out.)
            end: new THREE.Vector3(landing.x, landing.y + body.radius + player.player.height, landing.z),
            // What it stands on at the end: the paving's top beyond the coping (each foot on what is under it as it stands up: pose).
            floor: landing.y,
            // The figure's root under the head, as it swims, and as it will stand.
            sunk: avatar ? body.end.y - avatar.position.y : 1.56,
            yaw: Math.atan2(edge.ref.out[0], edge.ref.out[1]),
            id: edge.id,
            // (The pool climbed out of: its floor, which the feet are kept off on the way out — pose.)
            pool: edge.ref.pool,
            plan,
            // (By the clip: where the figure swam, how long it takes to come to the edge and how far it has, how far up and over the capsule has come, and standing up at its end.)
            from,
            reach: plan && from ? reachTime(far) : CLIMB_REACH_IN,
            // (How far its eyes were out of the water as it began: kept out so far as it comes on to the edge — pose.)
            eyes: plan && from ? eyesOf(player.avatar) - edge.ref.pool.level : null,
            reached: plan && from ? 0 : 1,
            up: 0,
            over: 0,
            standing: null,
            lifted: null,
        };
        this.afloat = null;
        this.toEdge = null;
        this.blocked = false;
        this.edge = this.edgeAt = null;
        player.player.velocity.set(0, 0, 0);
        player.actions.jump = false;
        player.jumpOnce = false;
    }

    /**
     * How the climbing clip takes the figure out over `edge`, where the
     * figure has the clip: its root, where the clip's hands — the wrists'
     * middle at its start, measured on this figure (Avatar.bonesAt) — hold
     * the coping's top (HAND_OVER over it, found by a ray just beyond the
     * water's edge), facing out; the clip's length; its hips at its start
     * and its end (Avatar.hipsAt), which the capsule's way up and over is
     * measured along; and how it is fitted to the edge as it goes
     * (climbFitOf). Null without the clip. For the visitor's own figure, or
     * another visitor's (`avatar`: fadeOther).
     */
    climbPlan(edge, avatar = this.player.avatar) {
        if (!avatar?.has("climbing")) return null;
        const hands = avatar.bonesAt("climbing", 0, ["LeftHand", "RightHand", "Head"]);
        if (!hands?.LeftHand || !hands?.RightHand) return null;
        const grip = hands.LeftHand.clone().add(hands.RightHand).multiplyScalar(0.5);
        const { out, at, pool, landing } = edge.ref;
        _ray.origin.set(at[0] + out[0] * 0.08, pool.level + 1.5, at[1] + out[1] * 0.08);
        const hit = this.experience.world.collision.rayIntersect(_ray, { far: 2 });
        const top = hit && hit.distance <= 2 ? _ray.origin.y - hit.distance : landing.y;
        const yaw = Math.atan2(out[0], out[1]);
        grip.applyAxisAngle(_up, yaw);
        const duration = avatar.animation.actions.climbing.getClip().duration;
        const from = avatar.hipsAt("climbing", 0);
        const to = avatar.hipsAt("climbing", duration);
        if (!from || !to) return null;
        const root = new THREE.Vector3(at[0] - grip.x, top + HAND_OVER - grip.y, at[1] - grip.z);
        // (Its head there at the clip's start: how far the figure has to come, as it is seen to — not its root, which a swimmer, lying along the water, has a metre further back.)
        const head = hands.Head ? hands.Head.clone().applyAxisAngle(_up, yaw).add(root) : root.clone();
        return { root, head, duration, from, to, fit: climbFitOf(avatar) };
    }

    /** A frame of the climb: the head up out of the water, then over the edge; the whole capsule on the coping at its end. */
    updateClimb() {
        const climb = this.climb;
        if (climb.plan) {
            this.updateClimbByClip();
            return;
        }
        const player = this.player;
        const body = player.player.collider;
        climb.t = Math.min(1, climb.t + this.experience.time.delta / CLIMB);
        const up = smooth(Math.min(1, climb.t / 0.6));
        const over = smooth(Math.max(0, (climb.t - 0.3) / 0.7));
        body.end.set(
            climb.start.x + (climb.end.x - climb.start.x) * over,
            climb.start.y + (climb.end.y - climb.start.y) * up,
            climb.start.z + (climb.end.z - climb.start.z) * over
        );
        body.start.copy(body.end);
        body.start.y -= SEGMENT + (player.player.height - SEGMENT) * climb.t;
        player.player.onFloor = false;
        if (climb.t < 1) return;
        this.climbed();
    }

    /**
     * A frame of the climb by the clip: first the reach to the edge, the
     * clip held at its start; then its time on (at its pace); the capsule
     * as far up from the water to standing on the landing as the clip's
     * hips have come up from their start to their end, and as far over as
     * they have come forward — never back — so the view rises and goes over
     * with the body; at the clip's end, stood up into idle over
     * CLIMB_STAND, the figure from the clip's root to where the capsule
     * stands (placed in step with the fade: pose).
     */
    updateClimbByClip() {
        const climb = this.climb;
        const { plan } = climb;
        const player = this.player;
        const body = player.player.collider;
        const delta = this.experience.time.delta;
        player.player.onFloor = false;
        if (climb.standing !== null) {
            // (Done as idle has faded in — by its weight, which the figure is stood up by, not a clock of its own: a frame
            // apart, the figure was put where the capsule stands 8 cm off where the fade had it.)
            climb.standing += delta;
            const figure = player.avatar;
            if (!figure || figure.weightOf("climbing") <= 0 || climb.standing > CLIMB_STAND + 0.5) this.climbed();
            return;
        }
        if (climb.reached < 1) {
            // (Held at its start while the figure comes on to the edge: the hands on it as it gets there.)
            climb.reached = Math.min(1, climb.reached + delta / climb.reach);
            const action = player.avatar?.animation.actions.climbing;
            if (action) action.time = 0;
            return;
        }
        climb.t = Math.min(plan.duration, climb.t + delta * CLIMB_PACE);
        const hips = player.avatar?.hipsAt("climbing", climb.t, _hips);
        if (hips) {
            climb.up = Math.max(climb.up, THREE.MathUtils.clamp((hips.y - plan.from.y) / (plan.to.y - plan.from.y || 1), 0, 1));
            climb.over = Math.max(climb.over, THREE.MathUtils.clamp((hips.z - plan.from.z) / (plan.to.z - plan.from.z || 1), 0, 1));
        }
        body.end.set(
            climb.start.x + (climb.end.x - climb.start.x) * climb.over,
            climb.start.y + (climb.end.y - climb.start.y) * climb.up,
            climb.start.z + (climb.end.z - climb.start.z) * climb.over
        );
        body.start.copy(body.end);
        body.start.y -= SEGMENT + (player.player.height - SEGMENT) * climb.up;
        if (climb.t < plan.duration) return;
        // Up on the coping, crouched: stood up where the capsule lands, idle fading in as the figure goes there.
        body.end.copy(climb.end);
        body.start.copy(body.end);
        body.start.y -= player.player.height;
        climb.standing = 0;
        player.player.animation = "idle";
        player.avatar?.animation.play("idle", CLIMB_STAND);
    }

    /** Out of the water, the climb done: on the floor, told to the world. */
    climbed() {
        const climb = this.climb;
        const player = this.player;
        this.climb = null;
        this.pool = null;
        this.depth = 0;
        player.player.velocity.set(0, 0, 0);
        player.player.onFloor = true;
        this.experience.world.emit("interact", { kind: "pool", id: climb.id, state: "out" });
    }

    // ------------------------------------------------------------------
    // The figure
    // ------------------------------------------------------------------

    /**
     * The clip the figure plays in the water, or null for the walk's own:
     * afloat, a stroke moving — the frog kick ("swimming", a long calm
     * glide: 1.9 m a kick at SPEED) at swimming pace and the breaststroke,
     * brisker, played faster (stride), swimming fast, where it has both, or
     * the one it has — treading water still, or swum into a wall (clear);
     * climbing out, the climb, and idle as it stands up at its end. The frog
     * kick reads as swimming on both avatars; the breaststroke, whose arms
     * reach over the head, swum as upright as the female avatar's hoodie
     * needs it to be (postureOf), read as waving at an easy pace.
     */
    clip(moving, fast) {
        if (this.climb) return this.climb.standing !== null ? "idle" : "climbing";
        if (!this.afloat) return null;
        // (Swimming to the edge to climb out: the stroke, at swimming pace.)
        if (this.toEdge) {
            this.fast = false;
            return this.strokeName(false);
        }
        this.fast = Boolean(moving && fast && !this.blocked);
        if (!moving || this.blocked) return "treading";
        return this.strokeName(fast);
    }

    /** The stroke swum, fast or not: the breaststroke fast where the figure has it (or has not the frog kick), else the frog kick. */
    strokeName(fast) {
        const avatar = this.player.avatar;
        const has = (name) => Boolean(avatar?.has(name));
        if (fast) return has("breaststroke") || !has("swimming") ? "breaststroke" : "swimming";
        return has("swimming") ? "swimming" : "breaststroke";
    }

    /** How long the figure's clip takes to fade into `name` (Player.updateAvatarAnimation): the climb, over the first GRAB_RISE of the reach to the edge; anything else, as ever. */
    fadeOf(name) {
        return name === "climbing" && this.climb?.plan ? this.climb.reach * GRAB_RISE : undefined;
    }

    /**
     * The figure, each frame once its clips have posed it and it is turned
     * the way it faces (Player.updateAvatarPose; its root put under the
     * capsule's head): afloat, as deep as the clips it plays float (floatOf: what it
     * wears under, its eyes out), laid back as far as they are and its head
     * over its root — eased in and out, as it comes into the water and
     * leaves it — bobbing a little, and lifted over the steps where its feet
     * come onto them (keel); the body's spring-held height, less where it
     * floats, is the water's swell under it, so a plunge takes the figure
     * down with it. Climbing by the clip: gliding from where it swam to
     * where the clip has its hands on the edge as the clip fades in and the
     * way it floated eases out, then fitted to the edge (climbFitOf: let
     * down, and leant forward over its hands), and from there to standing
     * where the capsule lands, in step with idle fading in; climbing without
     * it, eased from swimming to standing on the coping.
     *
     * @param {THREE.Vector3} position  the root, set
     */
    pose(position) {
        const player = this.player;
        const avatar = player.avatar;
        if (!avatar) return;
        const body = player.player.collider;
        const delta = this.experience.time.delta;
        const climb = this.climb;
        if (this.afloat) this.floating = floatOf(avatar, this.floating ?? {}, this.afloat.pool.depth) ?? this.floating;
        // (Climbing by the clip, its feet are still kept off the floor, below: let down at once as it began, they went 0.2 m into it.)
        else if (!climb?.plan && (this.feet.Left || this.feet.Right)) {
            this.feet.Left = this.feet.Right = 0;
            unliftLegs(avatar);
        }
        // How much of how it floats there is to it: all of it afloat; out of the water, easing away — climbing by the clip,
        // as much as the clips it floats by still make of its pose, the climb fading in (Avatar.weightOf).
        const climbing = climb?.plan ? avatar.weightOf("climbing") : 0;
        if (climb?.plan) this.share = Math.min(this.share, 1 - climbing);
        else {
            const wanted = this.afloat && this.floating ? 1 : 0;
            this.share += (wanted - this.share) * (1 - Math.exp(-LEAN_RATE * delta));
            if (wanted === 0 && this.share < 0.002) this.share = 0;
        }
        const float = this.share > 0 ? this.floating : null;
        const share = float ? this.share : 0;
        const fit = climb?.plan?.fit ? climb.plan.fit.at(climb.t) : null;
        // Laid back as it floats, and leant over the edge climbing out: the skeleton's node turned (setNode).
        let angle = 0;
        let up = 0;
        let forward = 0;
        if (float) {
            angle -= share * float.angle;
            up += share * float.up;
            forward += share * float.forward;
        }
        if (fit) {
            // (As much as the climb makes of the pose: coming in as it fades in over the reach, straightened as idle fades in at
            // its end. Leant at once, as the climb began, the figure's hips turned 19 degrees in a frame and its head rose 0.25-0.46 m
            // out of the water.)
            const tilt = fit.tilt * climbing;
            angle += tilt;
            up += fit.pivotY - (fit.pivotY * Math.cos(tilt) - fit.pivotZ * Math.sin(tilt));
            forward += fit.pivotZ - (fit.pivotY * Math.sin(tilt) + fit.pivotZ * Math.cos(tilt));
        }
        const leaning = angle !== 0 || up !== 0 || forward !== 0;
        if (leaning || this.leaning) setNode(avatar, angle, up, forward);
        this.leaning = leaning;
        if (!this.swimming) return;

        if (climb?.plan) {
            const { root } = climb.plan;
            if (climb.standing !== null) {
                // (Its knees as the clips have them again: up on the coping, nothing of them is lifted any more.)
                if (this.feet.Left || this.feet.Right) {
                    this.feet.Left = this.feet.Right = 0;
                    unliftLegs(avatar);
                }
                // From the crouch to standing where the capsule stands, as far as idle has faded in (linearly, as the fade
                // is: the hips go straight up) — but its feet kept on what is under them, the coping or the paving: a
                // crouch and standing weighed half and half is neither, its hips half way up over legs still half bent,
                // and its soles went 17-18 cm into the paving. Kept to the end, all but the last of the fade, where the
                // figure stands as the capsule does.
                const stood = 1 - climbing;
                _w.copy(root);
                _w.y += climb.plan.fit?.at(climb.plan.duration).down ?? 0;
                position.lerpVectors(_w, _v.copy(body.end).setY(body.end.y - 1.56), stood);
                // (What is under that foot: the coping, or the paving beyond it.)
                const low = lowestFoot(avatar, _foot);
                _ray.origin.set(_foot.x, climb.floor + 0.6, _foot.z);
                const under = this.experience.world.collision.rayIntersect(_ray, { far: 1 });
                const floor = under && under.distance <= 1 ? _ray.origin.y - under.distance : climb.floor;
                // (Eased, the soles a frame or two on the paving's 6 cm under the coping's top as the lower foot steps
                // off it: put back up at once, the figure jumped by as much.)
                const sunk = Math.max(0, floor + SOLE_CLEAR - (position.y + low)) * (1 - THREE.MathUtils.smoothstep(stood, 0.85, 1));
                climb.sole = (climb.sole ?? sunk) + (sunk - (climb.sole ?? sunk)) * (1 - Math.exp(-SOLE_RATE * delta));
                position.y += climb.sole;
                return;
            }
            position.copy(root);
            if (fit) position.y += fit.down;
            if (climb.from && climb.reached < 1) {
                // (Up to the clip's height first, as its hands come up out of the water, and on to the edge after: so the
                // hands come over the coping, not into its edge — 8 cm, coming on at both together.)
                const up = smooth(Math.min(1, climb.reached / GRAB_RISE));
                const on = smooth(THREE.MathUtils.clamp((climb.reached - GRAB_ON) / (1 - GRAB_ON), 0, 1));
                const { from } = climb;
                position.set(from.x + (position.x - from.x) * on, from.y + (position.y - from.y) * up, from.z + (position.z - from.z) * on);
                // ...its eyes kept out of the water meanwhile, as far as they were out as it began (EYES_OUT at most): a
                // pose half the one and half the other, laid back half as far, put them 5-7 cm under. Lifted, never let
                // down, and less from GRAB_RISE on, as the clip's own start — its hands on the coping, its eyes as the clip
                // has them there — comes.
                if (climb.eyes !== null) {
                    avatar.avatar.updateMatrixWorld(true);
                    const short = climb.pool.level + Math.min(climb.eyes, EYES_OUT) - eyesOf(avatar);
                    if (short > 0) position.y += short * (1 - THREE.MathUtils.smoothstep(climb.reached, GRAB_RISE, 1));
                }
            }
            // Its feet still off the pool's floor (liftFeet), as afloat, until the climb has taken them up out of the water.
            if (avatar.avatar.visible) liftFeet(avatar, climb.pool, this.stepsOf.get(climb.pool), this.feet, delta);
            else unliftLegs(avatar);
            return;
        }
        if (climb) {
            position.y = body.end.y - (climb.sunk + (1.56 - climb.sunk) * smooth(climb.t));
            return;
        }
        if (!this.afloat || !float) return;
        // (As one clip fades into another, by its own shape this frame: fadeLevel.)
        const level = float.fading ? fadeLevel(avatar, float.level, this.afloat.pool.depth) : float.level;
        const yaw = yawOf(avatar.avatar.quaternion);
        const bob = Math.sin(this.afloat.t * BOB_RATE) * BOB;
        // Over the steps and the floor: lifted as its feet come onto them, let down again — both eased.
        this.keel(this.afloat.pool, float, yaw, bob);
        // (Off the steps by a lift only swimming on up them; otherwise pushed back off them: clear. Never off the floor: postureOf.)
        const lift = this.upSteps ? Math.min(LIFT_MOST, this.onSteps) : 0;
        this.raised += (lift - this.raised) * (1 - Math.exp(-(lift >= this.raised ? RAISE_RATE : SINK_RATE) * delta));
        if (lift === 0 && this.raised < 1e-4) this.raised = 0;
        const sunk = FLOAT + level - bob - this.raised;
        position.y = body.end.y - (1.56 + (sunk - 1.56) * share);
        // (Its head over its root, under the capsule's head: a stroke's came before it.)
        position.x -= Math.sin(yaw) * float.ahead * share;
        position.z -= Math.cos(yaw) * float.ahead * share;
        // Its feet off the floor under them, by its knees (liftFeet) — where it is drawn: not in first person.
        if (avatar.avatar.visible) liftFeet(avatar, this.afloat.pool, this.stepsOf.get(this.afloat.pool), this.feet, delta);
        else unliftLegs(avatar);
    }

    /**
     * How far the figure, floating so (floatOf) at its place under the
     * capsule's head and turned `yaw`, would go into the pool's floor or
     * the treads of its steps (shared/landscape.js's poolSteps: the treads
     * as they are drawn, not the ramp the steps are walked by) — how far it
     * is to be lifted for its deepest parts to clear them by KEEL_CLEAR —
     * in metres, 0 clear of them: `footing`, for either; `onSteps` and
     * `onFloor` for each. A tread's edge is met as a slope (STEP_SLOPE), so the
     * lift comes on before the feet are over it. Its way of floating keeps
     * its feet off the floor where it can (postureOf): this is for the
     * steps, and for a plunge.
     */
    keel(pool, float, yaw, bob) {
        const body = this.player.player.collider;
        const steps = this.stepsOf.get(pool);
        const floor = pool.level - pool.depth;
        // (Where the water is on it, unlifted: FLOAT under the capsule's head, which a plunge takes down; bobbing.)
        const water = body.end.y - FLOAT + bob;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        let onFloor = 0;
        let onSteps = 0;
        for (const keel of float.keels) {
            for (let i = 0; i < keel.length; i += 3) {
                const y = water + keel[i + 2] - KEEL_CLEAR;
                // (Fading from one clip into another, the floor is fadeLevel's: the keels are the two clips', not the pose between them.)
                if (!float.fading) onFloor = Math.max(onFloor, floor - y);
                if (!steps) continue;
                const x = body.end.x + keel[i] * cos + keel[i + 1] * sin;
                const z = body.end.z - keel[i] * sin + keel[i + 1] * cos;
                for (const tread of steps.treads) {
                    const [bx0, bz0, bx1, bz1] = tread.box;
                    const off = Math.hypot(Math.max(bx0 - x, 0, x - bx1), Math.max(bz0 - z, 0, z - bz1));
                    onSteps = Math.max(onSteps, tread.top - off * STEP_SLOPE - y);
                }
            }
        }
        this.onSteps = onSteps;
        this.onFloor = onFloor;
        this.footing = Math.max(onFloor, onSteps);
    }

    /**
     * Another visitor's figure as their page lays theirs (pose), by the clip
     * it is sent to play: afloat, laid back as far as the clips it plays
     * here float on this figure (floatOf) — their page placed it for that —
     * eased out of it otherwise; climbing out by the clip, leant over the
     * edge as its climb is fitted to an edge here (climbFitOf). Each frame,
     * for each of them (Player.updateOtherPlayers).
     */
    layOther(avatar, name) {
        if (!avatar) return;
        const lean = LEANT.get(avatar) ?? { share: 0, float: null, leaning: false };
        LEANT.set(avatar, lean);
        const floating = WATER_NAMES.has(name) && name !== "climbing";
        // (In the pool it is in, as deep as that: postureOf keeps its feet off that pool's floor.)
        const { x, z } = avatar.avatar.position;
        if (floating) lean.float = floatOf(avatar, lean.float ?? {}, this.poolAt(x, z)?.depth) ?? lean.float;
        const wanted = floating && lean.float ? 1 : 0;
        lean.share += (wanted - lean.share) * (1 - Math.exp(-LEAN_RATE * this.experience.time.delta));
        // (Climbing out by the clip, as its own page has it: the way it floated as much as the clips it floats by make of the
        // pose, the climb's lean as much as the climb does — pose.)
        const climbing = name === "climbing" && avatar.has("climbing") ? avatar.weightOf("climbing") : 0;
        if (name === "climbing") lean.share = Math.min(lean.share, 1 - climbing);
        if (wanted === 0 && lean.share < 0.002) lean.share = 0;
        let angle = 0;
        let up = 0;
        let forward = 0;
        if (lean.share > 0 && lean.float) {
            angle -= lean.share * lean.float.angle;
            up += lean.share * lean.float.up;
            forward += lean.share * lean.float.forward;
        }
        const fit = climbing > 0 ? climbFitOf(avatar)?.at(avatar.animation.actions.climbing.time) : null;
        if (fit) {
            const tilt = fit.tilt * climbing;
            angle += tilt;
            up += fit.pivotY - (fit.pivotY * Math.cos(tilt) - fit.pivotZ * Math.sin(tilt));
            forward += fit.pivotZ - (fit.pivotY * Math.sin(tilt) + fit.pivotZ * Math.cos(tilt));
        }
        const leaning = angle !== 0 || up !== 0 || forward !== 0;
        if (leaning || lean.leaning) setNode(avatar, angle, up, forward);
        lean.leaning = leaning;
        // ...and its feet off the floor of the pool it is in here, as the visitor's own are (liftFeet).
        const pool = floating && lean.share > 0 ? this.poolAt(x, z) : null;
        lean.feet ??= { Left: 0, Right: 0 };
        if (pool) liftFeet(avatar, pool, this.stepsOf.get(pool), lean.feet, this.experience.time.delta);
        else if (lean.feet.Left || lean.feet.Right) {
            lean.feet.Left = lean.feet.Right = 0;
            unliftLegs(avatar);
        }
    }

    /**
     * How long another visitor's figure fades from the clip it played, `from`,
     * into `to` (Player.updateOtherPlayers), where their own page fades theirs
     * otherwise than over Avatar.js's FADE — worked out here as it is there,
     * from what this page knows: into the climb by the clip, over the first
     * GRAB_RISE of the time it takes to come on to the edge (reachTime) from
     * where its head is to where the clip has it at the nearest side of the
     * pool it is in (climbPlan), the clip held at its start meanwhile
     * (holdOther); stood up into idle at the climb's end, over CLIMB_STAND.
     * Undefined otherwise (the strokes and treading water fade as ever, at
     * the pace each is played: strideOf).
     */
    fadeOther(avatar, from, to) {
        const lean = LEANT.get(avatar) ?? { share: 0, float: null, leaning: false };
        LEANT.set(avatar, lean);
        lean.hold = 0;
        if (from === "climbing" && to !== "climbing") return CLIMB_STAND;
        if (to !== "climbing" || !avatar?.has("climbing")) return undefined;
        const { x, z } = avatar.avatar.position;
        const pool = this.poolAt(x, z);
        if (!pool) return undefined;
        // (The nearest side, straight out: where their page offered the climb, as far as this one can tell.)
        const [x0, z0, x1, z1] = pool.box;
        const side = [
            { gap: x - x0, out: [-1, 0], at: [x0, z] },
            { gap: x1 - x, out: [1, 0], at: [x1, z] },
            { gap: z - z0, out: [0, -1], at: [x, z0] },
            { gap: z1 - z, out: [0, 1], at: [x, z1] },
        ].sort((a, b) => a.gap - b.gap)[0];
        const plan = this.climbPlan({ ref: { out: side.out, at: side.at, pool, landing: { y: pool.level } } }, avatar);
        if (!plan) return undefined;
        const head = headOf(avatar, _w);
        lean.hold = reachTime(Math.hypot(plan.head.x - head.x, plan.head.z - head.z));
        return lean.hold * GRAB_RISE;
    }

    /**
     * Another visitor's figure climbing out by the clip, its clip held at its
     * start while it comes on to the edge (fadeOther's time), as their own
     * page holds theirs (updateClimbByClip): played on at once, it climbed a
     * second ahead of where their page had it. Before its clips move on, each
     * frame (Player.updateOtherPlayers).
     */
    holdOther(avatar, name) {
        const lean = LEANT.get(avatar);
        if (!lean?.hold || name !== "climbing") return;
        lean.hold = Math.max(0, lean.hold - this.experience.time.delta);
        const action = avatar.animation.actions.climbing;
        if (action) action.time = 0;
    }

    /**
     * The visitor's figure's ways of floating, and its climb's fit to the
     * edge, worked out ahead (postureOf, some 20 ms a clip; climbFitOf), one
     * at a time between frames, from the moment it is over a pool — not each
     * in the frame it is first wanted. Once a figure.
     */
    prepare(pool) {
        const avatar = this.player.avatar;
        if (!avatar || PREPARED.has(avatar)) return;
        PREPARED.add(avatar);
        const later = window.requestIdleCallback ?? ((call) => setTimeout(call, 0));
        avatar.wear(this.experience).then(() => {
            const jobs = [...FLOATING.map((name) => () => postureOf(avatar, name, pool.depth)), () => climbFitOf(avatar)];
            const next = () => {
                const job = jobs.shift();
                if (!job) return;
                job();
                later(next);
            };
            later(next);
        });
    }

    /**
     * How high the water comes over a figure's root, playing `name` afloat
     * now (floatOf, at its clips' times): where another visitor's nametag
     * floats over a swimmer (Player.updateOtherPlayers). Null for a figure
     * not afloat by that clip.
     */
    waterOn(avatar, name) {
        if (!avatar || !WATER_NAMES.has(name) || name === "climbing") return null;
        // (As layOther, just before, has it for this frame.)
        return LEANT.get(avatar)?.float?.level ?? null;
    }

    /** Which way the figure faces climbing out, and swimming to the edge for it: the edge's. Null otherwise. */
    climbYaw() {
        if (this.climb) return this.climb.yaw;
        return this.toEdge ? Math.atan2(this.toEdge.edge.ref.out[0], this.toEdge.edge.ref.out[1]) : null;
    }

    /**
     * A figure — the visitor's own, or another visitor's seen swimming —
     * given the visitor's clips there are (Avatar.wear: fitted to it), once
     * each. Resolves to whether it has any.
     */
    dress(avatar) {
        return avatar ? avatar.wear(this.experience) : Promise.resolve(false);
    }
}

/**
 * How a figure floats playing `name` (or what plays in its place:
 * Avatar.playable), measured once for each clip on a copy of the figure at
 * its root and its own scale, LOOKS times through the clip: at each look,
 * the least the water may come up on it — the top of what it wears, DRY
 * under, at the top of a bob — and the most — its eyes (its eyes' meshes,
 * its eye bones, or EYES_OVER_HEAD over its head's) EYES_OUT out of it at
 * the bottom of one.
 * Its own skin, hair and eyes (BARE), whatever hangs from the head's
 * bones (a pair of glasses) and its arms' sleeves (ARM_BONES) are not what
 * it wears. Of LEANS, the least it is laid back about its head (setNode)
 * for both to be had at every look (what it wears to SHOW_GIVE); or,
 * where none does, the one that comes nearest. And, in a pool `deep`
 * metres deep, of that lean and the next FLOOR_LEANS, the least that keeps
 * its feet (FOOT_BONES) KEEL_CLEAR over the floor at every look as well —
 * as the clips are made, the avatars' shoes go down to 1.45–1.57 m under
 * the water, through a 1.4 m pool's floor at the bottom of a kick: laid
 * back, the legs come up before it — or, where neither does, that lean,
 * its feet let down into the floor, as treading water in Ladonia's pool:
 * laid back as far as that took, it held its hands up before its face, and
 * read as floating, not treading water. The water then stands
 * as high on it as keeps the eyes out at every look, all through the
 * clip — and, at a look where what it wears would show, higher, by as much
 * as FACE_GIVE more of the face, the figure sunk a little with its stroke.
 * And, so laid back, all of it: how far before its root its head is, on
 * the whole (a stroke's head came 0.3–0.8 m before it, as the clips were
 * made, treading water's over it); and, its head put over its root, how far
 * it reaches across the water each way at any look, and how deep its
 * deepest parts go, where.
 *
 *   lean    radians laid back
 *   pivot   the head's height upright at the clip's start, laid back about
 *   at(t)   the water's height over the root t seconds into the clip
 *   ahead   metres its head is before its root
 *   reach   metres it reaches from its root, its head put over it, each of
 *           REACH_WAYS ways round from straight ahead (towards its left)
 *   keel    [x, z, depth] of its parts deeper than KEEL_FROM under the
 *           water, the deepest in each KEEL_CELL across, by its root (its
 *           head put over it), facing +z
 *
 * Null for a clip it has not got, or a figure without a head's bone. Once
 * for each clip and pool's depth (to the centimetre).
 */
function postureOf(avatar, name, deep = Infinity) {
    const clip = avatar.animation.actions[avatar.playable(name)]?.getClip();
    if (!clip) return null;
    let byDepth = POSTURES.get(clip);
    if (!byDepth) POSTURES.set(clip, (byDepth = new Map()));
    const key = Number.isFinite(deep) ? Math.round(deep * 100) : -1;
    if (byDepth.has(key)) return byDepth.get(key);
    const copy = SkeletonUtils.clone(avatar.source.scene);
    copy.scale.copy(avatar.avatar.scale);
    const bone = (named) => (avatar.rig.boneNames.has(named) ? copy.getObjectByName(avatar.rig.boneNames.get(named)) : null);
    const head = bone("Head");
    if (!head) {
        byDepth.set(key, null);
        return null;
    }
    // Its eyes: the middle of its eyes' meshes (Ready Player Me's "EyeLeft", skinned to the head), else of its eye bones (the male avatar has none), else over its head's bone.
    const eyeMeshes = [];
    copy.traverse((mesh) => mesh.isSkinnedMesh && EYES.test(mesh.name) && eyeMeshes.push(mesh));
    const eyeBones = [bone("LeftEye"), bone("RightEye")].filter(Boolean);
    const eyesAt = () => {
        if (eyeMeshes.length) {
            let sum = 0;
            let count = 0;
            for (const mesh of eyeMeshes) {
                for (let i = 0; i < mesh.geometry.attributes.position.count; i += 4, count++) sum += mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld).y;
            }
            return sum / count;
        }
        if (eyeBones.length) return eyeBones.reduce((sum, eye) => sum + eye.getWorldPosition(_w).y, 0) / eyeBones.length;
        return head.getWorldPosition(_w).y + EYES_OVER_HEAD;
    };
    const mixer = new THREE.AnimationMixer(copy);
    mixer.clipAction(clip).play();
    mixer.update(0);
    copy.updateMatrixWorld(true);
    const pivot = head.getWorldPosition(_w).y;
    // What it wears, each mesh's points: none of its bare skin, none weighted to the head or the arms. And its feet's.
    const worn = [];
    const feet = [];
    const meshes = [];
    copy.traverse((mesh) => {
        const { skinIndex, skinWeight } = mesh.geometry?.attributes ?? {};
        if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
        meshes.push(mesh);
        const weighed = (test) => {
            const by = mesh.skeleton.bones.map((node) => test(canonical(node.name)));
            const points = [];
            for (let i = 0; i < skinIndex.count; i += WORN_EVERY) {
                let weight = 0;
                for (let k = 0; k < 4; k++) if (by[skinIndex.getComponent(i, k)]) weight += skinWeight.getComponent(i, k);
                if (weight >= 0.5) points.push(i);
            }
            return points;
        };
        const low = weighed((named) => FOOT_BONES.test(named));
        if (low.length) feet.push({ mesh, points: low });
        if (BARE.test(mesh.name) || [mesh.material].flat().some((material) => BARE.test(material?.name ?? ""))) return;
        const points = weighed((named) => !HEAD_BONES.test(named) && !ARM_BONES.test(named));
        if (points.length) worn.push({ mesh, points });
    });
    const extreme = (entries, pick) => {
        let most = pick === Math.max ? -Infinity : Infinity;
        for (const entry of entries) {
            for (const i of entry.points) most = pick(most, entry.mesh.getVertexPosition(i, _v).applyMatrix4(entry.mesh.matrixWorld).y);
        }
        return most;
    };
    const laid = { avatar: copy, rig: avatar.rig };
    const tried = [];
    let dry = null;
    for (const lean of LEANS) {
        layBack(laid, lean, pivot);
        const least = [];
        const most = [];
        const lowest = [];
        for (let look = 0; look < LOOKS; look++) {
            mixer.setTime((clip.duration * look) / LOOKS);
            copy.updateMatrixWorld(true);
            least.push(extreme(worn, Math.max) + DRY + BOB);
            most.push(eyesAt() - BOB - EYES_OUT);
            lowest.push(extreme(feet, Math.min) - BOB - KEEL_CLEAR);
        }
        // As high as keeps the eyes out all through; higher where what it wears would show, by FACE_GIVE at most.
        const steady = Math.min(...most);
        const levels = least.map((low, k) => Math.min(Math.max(steady, low), most[k] + FACE_GIVE));
        const shows = Math.max(...least.map((low, k) => low - levels[k]));
        // ...and how far its feet would go into the floor so.
        const aground = Math.max(...lowest.map((low, k) => levels[k] - deep - low));
        tried.push({ lean, levels, shows, aground });
        dry ??= shows <= SHOW_GIVE ? tried.length - 1 : null;
        if ((shows <= SHOW_GIVE && aground <= 0) || (dry !== null && tried.length - 1 > dry + FLOOR_LEANS - 1)) break;
    }
    // What it wears under first: the least lean that has it — else the one that comes nearest — or, of the next
    // FLOOR_LEANS on from it, the least that has its feet off the floor too.
    let first = dry;
    if (first === null) {
        first = 0;
        for (let i = 1; i < tried.length; i++) if (tried[i].shows < tried[first].shows - 0.002) first = i;
    }
    const best = tried.slice(first, first + FLOOR_LEANS + 1).find((each) => each.shows <= SHOW_GIVE && each.aground <= 0) ?? tried[first];
    // So laid back, all of it: its head, its reach each way, its deepest parts.
    const { lean, levels } = best;
    layBack(laid, lean, pivot);
    let ahead = 0;
    const reach = new Float32Array(REACH_WAYS).fill(-Infinity);
    const cells = new Map();
    for (let look = 0; look < LOOKS; look++) {
        mixer.setTime((clip.duration * look) / LOOKS);
        copy.updateMatrixWorld(true);
        ahead += head.getWorldPosition(_w).z / LOOKS;
        for (const mesh of meshes) {
            const count = mesh.geometry.attributes.position.count;
            for (let i = 0; i < count; i += REACH_EVERY) {
                mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld);
                for (let k = 0; k < REACH_WAYS; k++) {
                    const along = _v.x * SINES[k] + _v.z * COSINES[k];
                    if (along > reach[k]) reach[k] = along;
                }
                const depth = _v.y - levels[look];
                if (depth > -KEEL_FROM) continue;
                const key = Math.round(_v.x / KEEL_CELL) * 1000 + Math.round(_v.z / KEEL_CELL);
                const cell = cells.get(key);
                if (!cell || depth < cell[2]) cells.set(key, [_v.x, _v.z, depth]);
            }
        }
    }
    // (Its head put over its root.)
    for (let k = 0; k < REACH_WAYS; k++) reach[k] -= ahead * COSINES[k];
    const keel = new Float32Array(cells.size * 3);
    let j = 0;
    for (const [x, z, depth] of cells.values()) {
        keel[j++] = x;
        keel[j++] = z - ahead;
        keel[j++] = depth;
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(copy);
    copy.traverse((node) => node.isSkinnedMesh && node.skeleton.dispose());
    const duration = clip.duration || 1;
    const posture = {
        lean,
        pivot,
        levels,
        ahead,
        reach,
        keel,
        at(time) {
            const u = ((((time % duration) + duration) % duration) / duration) * LOOKS;
            const i = Math.floor(u) % LOOKS;
            return levels[i] + (levels[(i + 1) % LOOKS] - levels[i]) * (u - Math.floor(u));
        },
    };
    byDepth.set(key, posture);
    return posture;
}

/**
 * How a figure floats now (postureOf, for each clip it plays afloat) as
 * one clip fades into another: each clip's way of floating weighed as the
 * crossfade weighs the clip itself — the water's height on it (each at its
 * clip's own moment), how far it is laid back and the turn of its
 * skeleton's node that makes, and how far before its root its head is —
 * so that it goes from the one way to the other as its pose does, not in a
 * frame: switched at once, where one clip's head comes 0.65 m lower than
 * the other's, the figure hopped out of the water or ducked under it for a
 * dozen frames. How far it reaches and how deep it goes, of each clip that
 * shows. Into `into`; null for a figure playing none of them.
 *
 *   level    the water's height over its root
 *   angle    radians laid back; `up` and `forward` the node's move with it
 *   ahead    metres its head is before its root
 *   reach    as postureOf's, the furthest of the clips shown
 *   keels    their keels
 *   fading   whether two of them show (fadeLevel)
 */
function floatOf(avatar, into = {}, deep = Infinity) {
    const actions = avatar.animation.actions;
    _playing.length = 0;
    let total = 0;
    for (const name of FLOATING) {
        const action = actions[avatar.playable(name)];
        if (!action || _playing.some((entry) => entry.action === action)) continue;
        const weight = action.isRunning() ? action.getEffectiveWeight() : 0;
        if (weight < 1e-3) continue;
        const posture = postureOf(avatar, name, deep);
        if (!posture) continue;
        _playing.push({ action, posture, weight });
        total += weight;
    }
    if (!total) return null;
    into.level = into.angle = into.up = into.forward = into.ahead = 0;
    into.fading = _playing.filter(({ weight }) => weight / total > 0.02).length > 1;
    into.reach ??= new Float32Array(REACH_WAYS);
    into.reach.fill(-Infinity);
    into.keels ??= [];
    into.keels.length = 0;
    for (const { action, posture, weight } of _playing) {
        const share = weight / total;
        into.level += share * posture.at(action.time);
        into.angle += share * posture.lean;
        into.up += share * posture.pivot * (1 - Math.cos(posture.lean));
        into.forward += share * posture.pivot * Math.sin(posture.lean);
        into.ahead += share * posture.ahead;
        if (share < 0.05) continue;
        for (let k = 0; k < REACH_WAYS; k++) into.reach[k] = Math.max(into.reach[k], posture.reach[k]);
        into.keels.push(posture.keel);
    }
    return into;
}

/**
 * The water's height over a figure's root as one clip it plays afloat fades
 * into another (floatOf's `fading`). The two ways of floating weighed as the
 * fade weighs the clips keep near it, but a pose half the one clip's and
 * half the other's, laid back half as far as each, is neither's: between
 * treading water, laid well back, and a stroke, upright, what it wears came
 * up to 0.4 m out of the water. So its own shape this frame is looked at,
 * as postureOf looks at each moment of a clip — FADE_EVERY of what it
 * wears' points and of its eyes', its skin as it is posed now — and the
 * water stood on it no lower than keeps what it wears under, nor higher
 * than keeps its eyes out (by FACE_GIVE more of the face at most, where the
 * two cannot both be had), nor its feet KEEL_CLEAR off the floor of a pool
 * `deep` metres deep, where that can be had with what it wears under;
 * between those, as `level`, the weighed one, has it.
 */
function fadeLevel(avatar, level, deep) {
    const shape = shapeOf(avatar);
    if (!shape.worn.length || !shape.eyes.length) return level;
    const root = avatar.avatar;
    root.updateMatrixWorld(true);
    let top = -Infinity;
    for (let j = 0; j < shape.worn.length; j += 2) top = Math.max(top, shape.worn[j].getVertexPosition(shape.worn[j + 1], _v).applyMatrix4(shape.worn[j].matrixWorld).y);
    const eyes = eyesOf(avatar);
    let low = Infinity;
    for (let j = 0; j < shape.feet.length; j += 2) low = Math.min(low, shape.feet[j].getVertexPosition(shape.feet[j + 1], _v).applyMatrix4(shape.feet[j].matrixWorld).y);
    const least = top - root.position.y + DRY + BOB;
    const most = eyes - root.position.y - BOB - EYES_OUT;
    const floored = deep - KEEL_CLEAR + low - root.position.y - BOB;
    const kept = Math.min(Math.max(level, least), most + FACE_GIVE);
    // (Its feet off the floor where what it wears stays under so; what it wears under first.)
    return Math.max(Math.min(kept, floored), Math.min(kept, least));
}

/**
 * A figure's points fadeLevel looks at, once a figure: what it wears (not
 * its bare skin, nor what hangs from its head or its arms), its eyes' and its
 * feet's, every FADE_EVERY of each mesh's — `{ worn, eyes, feet }`, each a
 * run of mesh, index, mesh, index...
 */
function shapeOf(avatar) {
    let shape = SHAPES.get(avatar);
    if (!shape) {
        shape = { worn: [], eyes: [], feet: [] };
        avatar.avatar.traverse((mesh) => {
            const { skinIndex, skinWeight } = mesh.geometry?.attributes ?? {};
            if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
            if (EYES.test(mesh.name)) {
                for (let i = 0; i < skinIndex.count; i += FADE_EVERY) shape.eyes.push(mesh, i);
                return;
            }
            if (BARE.test(mesh.name) || [mesh.material].flat().some((material) => BARE.test(material?.name ?? ""))) return;
            const shown = mesh.skeleton.bones.map((node) => HEAD_BONES.test(canonical(node.name)) || ARM_BONES.test(canonical(node.name)));
            const foot = mesh.skeleton.bones.map((node) => FOOT_BONES.test(canonical(node.name)));
            for (let i = 0; i < skinIndex.count; i += FADE_EVERY) {
                let weight = 0;
                let feet = 0;
                for (let k = 0; k < 4; k++) {
                    if (shown[skinIndex.getComponent(i, k)]) weight += skinWeight.getComponent(i, k);
                    if (foot[skinIndex.getComponent(i, k)]) feet += skinWeight.getComponent(i, k);
                }
                if (weight < 0.5) shape.worn.push(mesh, i);
                if (feet >= 0.5) shape.feet.push(mesh, i);
            }
        });
        SHAPES.set(avatar, shape);
    }
    return shape;
}

/**
 * How high a figure's eyes are in the world, posed and placed as it is now
 * (its matrices up to date): the middle of its eyes' points (shapeOf), or,
 * for a figure without eyes' meshes, EYES_OVER_HEAD over its head's bone.
 */
function eyesOf(avatar) {
    const { eyes } = shapeOf(avatar);
    if (!eyes.length) return headOf(avatar, _w).y + EYES_OVER_HEAD;
    let sum = 0;
    for (let j = 0; j < eyes.length; j += 2) sum += eyes[j].getVertexPosition(eyes[j + 1], _v).applyMatrix4(eyes[j].matrixWorld).y;
    return sum / (eyes.length / 2);
}

/**
 * A figure's feet's points — its skin weighted to a foot's bones (FEET_BONES),
 * every FADE_EVERY — by the leg: `{ Left: [mesh, index, …], Right: […] }`.
 * Once a figure: what keeps its feet off the pool's floor (liftFeet), and
 * on the coping as it stands up out of the pool (lowestFoot).
 */
function feetOf(avatar) {
    let feet = FEET.get(avatar);
    if (feet) return feet;
    feet = { Left: [], Right: [] };
    avatar.avatar.traverse((mesh) => {
        const { skinIndex, skinWeight } = mesh.geometry?.attributes ?? {};
        if (!mesh.isSkinnedMesh || !skinIndex || !skinWeight) return;
        const sides = mesh.skeleton.bones.map((node) => FEET_BONES.exec(canonical(node.name))?.[1] ?? null);
        for (let i = 0; i < skinIndex.count; i += FADE_EVERY) {
            let left = 0;
            let right = 0;
            for (let k = 0; k < 4; k++) {
                const side = sides[skinIndex.getComponent(i, k)];
                if (side === "Left") left += skinWeight.getComponent(i, k);
                else if (side === "Right") right += skinWeight.getComponent(i, k);
            }
            if (left >= 0.5) feet.Left.push(mesh, i);
            else if (right >= 0.5) feet.Right.push(mesh, i);
        }
    });
    FEET.set(avatar, feet);
    return feet;
}

/** How high the lowest of a figure's feet is over its root, posed as it is now, in metres (0 for a figure without feet); and where it is, into `at`. */
function lowestFoot(avatar, at = null) {
    const feet = feetOf(avatar);
    const root = avatar.avatar;
    root.updateMatrixWorld(true);
    let low = Infinity;
    for (const side of LEGS) {
        const points = feet[side];
        for (let j = 0; j < points.length; j += 2) {
            const point = points[j].getVertexPosition(points[j + 1], _v).applyMatrix4(points[j].matrixWorld);
            if (point.y >= low) continue;
            low = point.y;
            at?.copy(point);
        }
    }
    if (!Number.isFinite(low)) {
        at?.copy(root.position);
        return 0;
    }
    return low - root.position.y;
}

/**
 * The floor under (x, z) in a pool: its own, or the top of a tread of its
 * steps (shared/landscape.js's poolSteps, as they are drawn) over it.
 */
function floorUnder(pool, steps, x, z) {
    let floor = pool.level - pool.depth;
    for (const tread of steps?.treads ?? []) {
        const [x0, z0, x1, z1] = tread.box;
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && tread.top > floor) floor = tread.top;
    }
    return floor;
}

/**
 * A figure afloat, its feet kept KEEL_CLEAR off the floor under them (the
 * pool's own, or a tread of its steps: floorUnder) by its knees: each foot,
 * as its clips pose it this frame, lifted straight up as far as its lowest
 * point would go into the floor — FEET_LIFT_MOST at most — its knee bent
 * further and its hip turned to take it there (liftLeg); at once as the foot
 * comes down onto the floor, let down again eased (SINK_RATE). As the clips
 * are made the avatars' shoes go 1.45-1.57 m under the water, and Ladonia's
 * pool is 1.4 m deep: the feet were in its floor at the bottom of every
 * kick, and treading water nearly all the time, by up to 0.24 m. The figure
 * laid further back cleared it, but treading water so, its hands came up
 * before its face and it read as floating; lifted, what it wears came out
 * of the water. Its knees drawn up, it treads water a little crouched, as
 * one does in water not much deeper than one is tall. `lifted`, how far
 * each foot is lifted now (`{ Left, Right }`), is the caller's to keep.
 */
function liftFeet(avatar, pool, steps, lifted, delta) {
    const feet = feetOf(avatar);
    unliftLegs(avatar);
    avatar.avatar.updateMatrixWorld(true);
    for (const side of LEGS) {
        const points = feet[side];
        const short = () => {
            let need = 0;
            for (let j = 0; j < points.length; j += 2) {
                const point = points[j].getVertexPosition(points[j + 1], _v).applyMatrix4(points[j].matrixWorld);
                need = Math.max(need, floorUnder(pool, steps, point.x, point.z) + KEEL_CLEAR - point.y);
            }
            return need;
        };
        const need = Math.min(short(), FEET_LIFT_MOST);
        const was = lifted[side] ?? 0;
        const now = need >= was ? need : was + (need - was) * (1 - Math.exp(-SINK_RATE * delta));
        lifted[side] = now < 1e-4 ? 0 : now;
        if (!lifted[side]) continue;
        liftLeg(avatar, side, lifted[side]);
        // (Once more for what is left, where the knee's hinge, not square to how the leg was bent, fell short: a kick's
        // leg stretched out behind.)
        const left = short();
        if (left > 0.005) liftLeg(avatar, side, Math.min(left, FEET_LIFT_MOST), true);
    }
}

/**
 * One of a figure's legs ("Left", "Right") posed so that its foot is
 * `lift` metres higher, as it is turned in the world: the knee bent further
 * about its hinge — across the figure (its root's own x), square to the
 * thigh, so that a straight leg bends the way a knee does, its foot going
 * back, not one way one frame and the other the next — as far as brings
 * the foot that near the hip, and the hip turned to swing the foot up
 * there. The bones' own turns are set; the clips set them again next frame
 * (or unliftLegs puts them back). `again`: lifted once more this frame.
 */
function liftLeg(avatar, side, lift, again = false) {
    const leg = legOf(avatar, side);
    if (!leg) return;
    const { hip, knee, foot } = leg;
    const at = hip.getWorldPosition(_hipAt);
    const kneeAt = knee.getWorldPosition(_kneeAt);
    const footAt = foot.getWorldPosition(_footAt);
    const thigh = kneeAt.distanceTo(at);
    const shin = footAt.distanceTo(kneeAt);
    if (thigh < 1e-3 || shin < 1e-3) return;
    _target.copy(footAt);
    _target.y += lift;
    const angle = (reach) => Math.acos(THREE.MathUtils.clamp((thigh * thigh + shin * shin - reach * reach) / (2 * thigh * shin), -1, 1));
    const wanted = THREE.MathUtils.clamp(_target.distanceTo(at), Math.abs(thigh - shin) + 1e-3, thigh + shin - 1e-3);
    const bend = angle(footAt.distanceTo(at)) - angle(wanted);
    // The knee's hinge: across the figure, square to the thigh (bent about it the way it turns, the foot goes back).
    _t.subVectors(kneeAt, at).divideScalar(thigh);
    _axis.set(1, 0, 0).applyQuaternion(avatar.avatar.quaternion);
    _axis.addScaledVector(_t, -_axis.dot(_t));
    if (_axis.lengthSq() < 1e-8) return;
    _axis.normalize();
    _bent.setFromAxisAngle(_axis, bend);
    const to = _w.subVectors(footAt, kneeAt).applyQuaternion(_bent).add(kneeAt);
    _swing.setFromUnitVectors(_t.subVectors(to, at).normalize(), _w.subVectors(_target, at).normalize());
    // Into the bones' own turns: the hip swung, the knee bent and swung, the foot as it was in the world.
    const hipTurn = hip.getWorldQuaternion(_hipQ);
    const kneeTurn = knee.getWorldQuaternion(_kneeQ);
    const footTurn = foot.getWorldQuaternion(_footQ);
    hip.parent.getWorldQuaternion(_parentQ);
    hipTurn.premultiply(_swing);
    kneeTurn.premultiply(_bent).premultiply(_swing);
    // (As the clips had them — not as turned here already, lifted `again` — and as turned here: put back next frame
    // where nothing has turned them since, unliftLegs.)
    leg.clip ??= { hip: new THREE.Quaternion(), knee: new THREE.Quaternion(), foot: new THREE.Quaternion() };
    if (!again) {
        leg.clip.hip.copy(hip.quaternion);
        leg.clip.knee.copy(knee.quaternion);
        leg.clip.foot.copy(foot.quaternion);
    }
    hip.quaternion.copy(_parentQ.invert().multiply(hipTurn));
    knee.quaternion.copy(_q.copy(hipTurn).invert().multiply(kneeTurn));
    foot.quaternion.copy(_q.copy(kneeTurn).invert().multiply(footTurn));
    leg.lifted ??= { hip: new THREE.Quaternion(), knee: new THREE.Quaternion(), foot: new THREE.Quaternion() };
    leg.lifted.hip.copy(hip.quaternion);
    leg.lifted.knee.copy(knee.quaternion);
    leg.lifted.foot.copy(foot.quaternion);
    leg.turned = true;
    hip.updateMatrixWorld(true);
}

/**
 * A figure's legs as its clips have them this frame, where liftLeg turned
 * them the frame before: the clips' mixer sets a bone only where its value
 * has changed since it last set it, so that a leg a clip holds still — the
 * stand-ins' standing, treading water without the clips — kept the turn
 * given it and was bent again on top of it, 20 cm higher each frame. Each
 * bone liftLeg turned and nothing has turned since is put back as it was.
 * Called before liftLeg each frame, and once a figure is no longer lifted.
 */
function unliftLegs(avatar) {
    const legs = LEG_NODES.get(avatar);
    if (!legs) return;
    for (const side of LEGS) {
        const leg = legs[side];
        if (!leg?.turned) continue;
        for (const name of ["hip", "knee", "foot"]) {
            const bone = leg[name];
            if (bone.quaternion.equals(leg.lifted[name])) bone.quaternion.copy(leg.clip[name]);
        }
        leg.turned = false;
    }
}

/** A figure's leg's bones — its hip (UpLeg), knee (Leg) and foot — each hung from the one before; null where they are not. Once a figure. */
function legOf(avatar, side) {
    let legs = LEG_NODES.get(avatar);
    if (!legs) {
        legs = {};
        const node = (named) => (avatar.rig.boneNames.has(named) ? avatar.avatar.getObjectByName(avatar.rig.boneNames.get(named)) : null);
        for (const each of LEGS) {
            const hip = node(`${each}UpLeg`);
            const knee = node(`${each}Leg`);
            const foot = node(`${each}Foot`);
            legs[each] = hip?.parent && knee?.parent === hip && foot?.parent === knee ? { hip, knee, foot } : null;
        }
        LEG_NODES.set(avatar, legs);
    }
    return legs[side];
}

/**
 * How a figure's climb out of the pool (its `climbing` clip) is fitted to
 * the pool's edge, worked out once for each clip from CLIMB_LOOKS looks
 * through it (Avatar.bonesAlong), in its root's frame — where climbPlan
 * puts the clip's wrists at its start HAND_OVER over the coping, at the
 * wall's face, which is so where the coping's top and the wall are. As
 * made, and fitted to the avatars, the clip's hands came up off the edge as
 * it pulls itself up, 7–17 cm over the coping, and its feet stood 20–25 cm
 * into the wall under it. So, at each look, how far the figure is let down
 * (`down`): its hands onto the coping while they are over it, the lowest of
 * them as high over it as its wrists were at the start — or raised, where
 * the clip's fingers, curled over the edge, would be in the stone
 * (FINGERS_OVER); but no further than keeps its toes, ankles and knees over
 * the coping once they are over it (TOE_OVER, ANKLE_OVER, KNEE_OVER) — so at
 * its end it crouches on it; and
 * how far it is leant forward about its hands (`tilt`, about `pivotY`,
 * `pivotZ`: the wrists' middle), TILT_MOST at most, for its legs under the
 * coping to keep FOOT_CLEAR behind the wall's face, as feet set against a
 * wall are. Each eased over its neighbours, so the figure is not jolted.
 * `at(t)` reads them t seconds into the clip. Null without the clip.
 */
function climbFitOf(avatar) {
    const clip = avatar.has("climbing") ? avatar.animation.actions.climbing.getClip() : null;
    if (!clip) return null;
    if (FITS.has(clip)) return FITS.get(clip);
    const along = avatar.bonesAlong("climbing", CLIMB_BONES, CLIMB_LOOKS);
    const start = along?.[0]?.bones;
    if (!start?.LeftHand || !start?.RightHand) {
        FITS.set(clip, null);
        return null;
    }
    const wall = (start.LeftHand.z + start.RightHand.z) / 2;
    const top = (start.LeftHand.y + start.RightHand.y) / 2 - HAND_OVER;
    const OVER = { Toe_End: TOE_OVER, ToeBase: TOE_OVER, Foot: ANKLE_OVER, Leg: KNEE_OVER };
    const down = [];
    const pivotY = [];
    const pivotZ = [];
    for (const { bones } of along) {
        // Its hands over the coping: let down onto it (never lifted).
        const hands = HAND_BONES.map((bone) => bones[bone]).filter(Boolean);
        const tips = [bones.LeftHandMiddle4, bones.RightHandMiddle4].filter(Boolean);
        const onIt = !tips.length || Math.max(...tips.map((tip) => tip.z)) > wall + 0.02;
        let let_ = onIt ? Math.min(0, top + HAND_OVER - Math.min(...hands.map((hand) => hand.y))) : 0;
        // ...and not into it: what of the hands is over the coping kept FINGERS_OVER on it (the clip's fingers, curled over the edge, went into the stone).
        for (const hand of hands) if (hand.z > wall - 0.01) let_ = Math.max(let_, top + FINGERS_OVER - hand.y);
        // ...but not its feet or knees once they are up over it into it (those still under it, before the wall, are leant out of it: below).
        for (const [named, , part] of LEG_BONES) {
            const point = bones[named];
            if (point && point.z > wall + 0.02 && point.y > top) let_ = Math.max(let_, top + OVER[part] - point.y);
        }
        down.push(let_);
        pivotY.push((bones.LeftHand.y + bones.RightHand.y) / 2);
        pivotZ.push((bones.LeftHand.z + bones.RightHand.z) / 2);
    }
    const eased = ease(down);
    const tilt = along.map(({ bones }, i) => {
        const py = pivotY[i];
        const pz = pivotZ[i];
        let angle = 0;
        for (; angle < TILT_MOST; angle += TILT_STEP) {
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            let clear = true;
            for (const [named, gap] of LEG_BONES) {
                const point = bones[named];
                if (!point) continue;
                const dy = point.y - py;
                const dz = point.z - pz;
                // Under the coping's top (so tilted, and let down), behind the wall's face.
                if (py + dy * cos - dz * sin + eased[i] > top + 0.02) continue;
                if (pz + dy * sin + dz * cos > wall - gap) {
                    clear = false;
                    break;
                }
            }
            if (clear) break;
        }
        return Math.min(angle, TILT_MOST);
    });
    // (Held as long as the most a neighbour needs, then eased: the legs kept out on the way.)
    const tilted = ease(tilt.map((_, i) => Math.max(...tilt.slice(Math.max(0, i - 1), i + 2))));
    const duration = clip.duration || 1;
    const read = (values, u) => {
        const i = Math.min(values.length - 2, Math.floor(u));
        return values[i] + (values[i + 1] - values[i]) * (u - i);
    };
    const fit = {
        down: eased,
        tilt: tilted,
        pivotY,
        pivotZ,
        at(time) {
            const u = THREE.MathUtils.clamp(time / duration, 0, 1) * (along.length - 1);
            return { down: read(eased, u), tilt: read(tilted, u), pivotY: read(pivotY, u), pivotZ: read(pivotZ, u) };
        },
    };
    FITS.set(clip, fit);
    return fit;
}

/**
 * How long a figure takes to come on to the pool's edge, climbing out by the
 * clip, its head `far` metres across the water from where the clip has it
 * (beginClimb): at swimming pace at the most, on the way to the edge (it is
 * eased in and out, and comes on only after GRAB_ON of the time), and
 * CLIMB_REACH_IN at least. In seconds.
 */
function reachTime(far) {
    return Math.max(CLIMB_REACH_IN, (1.5 * far) / ((1 - GRAB_ON) * SPEED));
}

/** Each of a run of values the mean of it and its two neighbours either side (as many as there are at the ends). */
function ease(values) {
    return values.map((_, i) => {
        const near = values.slice(Math.max(0, i - 2), i + 3);
        return near.reduce((sum, value) => sum + value, 0) / near.length;
    });
}

/** How far a figure reaches (postureOf's `reach`) along `way`, radians round from straight ahead: between the two ways measured either side of it. */
function reachAlong(reach, way) {
    const u = ((((way / (2 * Math.PI)) % 1) + 1) % 1) * REACH_WAYS;
    const i = Math.floor(u) % REACH_WAYS;
    return reach[i] + (reach[(i + 1) % REACH_WAYS] - reach[i]) * (u - Math.floor(u));
}

/** Where a figure's head's bone is in the world, as it was last posed — or, `now`, as it is posed and placed now (into `target`); its root's, where it has none. */
function headOf(avatar, target, now = false) {
    const head = avatar.rig.boneNames.has("Head") ? avatar.avatar.getObjectByName(avatar.rig.boneNames.get("Head")) : null;
    if (now) avatar.avatar.updateMatrixWorld(true);
    return head ? head.getWorldPosition(target) : target.copy(avatar.avatar.position);
}

/** Which way a figure's root is turned, about the up: its quaternion's angle, as Player turns it (a rig faces +z). */
function yawOf(quaternion) {
    return 2 * Math.atan2(quaternion.y, quaternion.w);
}

/**
 * A figure's skeleton's node — what its hips and meshes hang from (an
 * avatar's "Armature") — turned `angle` radians about the root's own x
 * (forward over: laid back is less than 0) and moved `up` and `forward`
 * metres in the root's frame, from as the figure was made. Neither the
 * clips (which move the bones under it) nor Player (which turns the root to
 * face the way it goes) touch that node, and its skinned meshes follow the
 * bones. All 0: the node as the figure was made. Nothing for a figure whose
 * hips hang from its root itself.
 *
 * @param {{ avatar: THREE.Object3D, rig: object }} avatar  an Avatar, or a copy of its scene with its rig
 */
function setNode(avatar, angle, up, forward) {
    const root = avatar.avatar;
    const hips = avatar.rig.boneNames.has("Hips") ? root.getObjectByName(avatar.rig.boneNames.get("Hips")) : null;
    const node = hips?.parent;
    if (!node || node === root || node.parent !== root) return;
    let upright = UPRIGHT.get(node);
    if (!upright) UPRIGHT.set(node, (upright = { position: node.position.clone(), quaternion: node.quaternion.clone() }));
    _q.setFromAxisAngle(_across, angle);
    node.quaternion.copy(_q).multiply(upright.quaternion);
    // (Moved in the root's own units: it is scaled.)
    node.position.copy(upright.position).applyQuaternion(_q).add(_w.set(0, up / root.scale.y, forward / root.scale.z));
}

/**
 * A figure laid back `angle` radians about its head's height over its
 * root (`head`, metres): turned so that the head stays where it was
 * (setNode). As postureOf measures a copy of it.
 */
function layBack(avatar, angle, head = 1.5) {
    setNode(avatar, -angle, head * (1 - Math.cos(angle)), head * Math.sin(angle));
}

/**
 * How fast a figure plays a clip in the water: its stand-in for a stroke
 * (walking, on a figure without the swimming clips) a wader's slower
 * stride; the breaststroke, where the figure has the frog kick too — so
 * that it is only ever swum fast (strokeName) — STROKE_FAST; anything else
 * as it is. The visitor's own (Swimmer.stride, which plays a lone stroke
 * swum fast faster too) and another visitor's seen swimming
 * (Player.updateOtherPlayers): told only the clip's name, theirs played the
 * breaststroke at its own pace, and faded into it and out of it — in the
 * mixer's time — at 0.083 a frame where their own page's went 0.113: its
 * lean no longer matched the height their page sent, and its eyes went 0.3 m
 * under the water as the strokes changed every few frames.
 */
export function strideOf(avatar, name) {
    if (!avatar || !WATER_NAMES.has(name)) return 1;
    if (!avatar.has(name)) return WADE_STRIDE;
    return name === "breaststroke" && avatar.has("swimming") ? STROKE_FAST : 1;
}

/** What the prompt offers beside the edge, afloat: Swimmer.offer's candidates are of it. */
const CLIMB_OUT_PROVIDER = {
    name: "pool",
    prompt: () => ({ label: "Climb out", key: "Space", touch: { label: "Climb out", icon: "pool" } }),
    act: (target, player) => player.swimmer.climbOut(target),
};

/** An ease in and out over 0 to 1. */
function smooth(t) {
    return t * t * (3 - 2 * t);
}

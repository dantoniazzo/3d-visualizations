import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";

import { REACH } from "../../../shared/interact.js";
import { FORWARD_MOST, GIVE, HEEL_CLEAR, LEG_CLEAR, SEAT_DEPTH, SEAT_HEIGHT, SIT_BACK, facingOf, isOutdoor, seatedAt, seatsOf } from "../../../shared/people.js";
import { kneeFor, legsAt, openKnees } from "../Utils/fitClip.js";
import { pointInPolygon } from "../Utils/geometry.js";

/**
 * Where the visitor can sit — every seat of the furniture placed, from the
 * catalogue's seats.json (scripts/measure-seats.mjs) and the spec's
 * placements, as the people round the property are seated (shared/
 * people.js's seatsOf) — and the sitting clip their figure sits by: the
 * people's own (World/People.js's index and shared file of clips), fitted
 * to each avatar (Player/Avatar.js's fit).
 *
 * A seat is not part of the scene to be met by the look ray: in a public
 * view the furniture is only in the collision tree, which says nothing of
 * which piece a triangle is, let alone which seat. So a seat is a point —
 * where a sitter's pelvis rests, a little over the cushion (AIM.over) — and
 * aimed at when the crosshair's ray passes within AIM.across of it, within
 * REACH.seat of the head and no further behind the first solid thing the
 * ray meets than AIM.slack (its own cushion's front edge, aimed at low).
 * Of several, the one the ray passes nearest. The same test, from the
 * camera, is a click or a tap on a seat from above (World/BirdView.js).
 *
 * What is a seat: a chair's, a stool's, a pouf's, each of a sofa's places —
 * a chaise's deep end too, sat on at its front, legs down over its edge, as
 * on a bench (poseFor) — not a lounger, which is lain on (no lying, the
 * user's choice), nor a bed (seats.json has none), nor anything sat on
 * higher or lower than SEAT_HEIGHT (a bar stool: the clip is made for a
 * chair's height, and on one the legs would hang in the air). Not one held:
 * by one of the people sitting there, drawn, nor by another visitor sat
 * within HELD of where one sits on it — nor, in the editor, one whose
 * piece its view leaves out (World/Scope.js).
 *
 * It is a provider of World/Interactables.js's ("seat": E on one aimed at,
 * "Sit"; a touch screen's button with the seat icon), and seated, the one
 * that offers getting up ("Stand up", `of` the seat sat on) when nothing
 * else is offered to someone sitting there (Player.seatedOffer: a
 * provider's `seated(seat, eye)`, a television's in front of it). Sitting
 * itself — the figure placed, the capsule parked, the camera — is
 * Player.js's (sit, stand).
 *
 * The visitor's own: whom else is on a seat is never told (no sync, the
 * user's choice) but by what their figure does — sent, as every figure's
 * clip is, by its name ("sitting"), and fitted on the page of whoever sees
 * it (dress) as it first does.
 *
 * How the figure sits is the seat's, too (wayOf), as the people round the
 * property are given a clip made for their seat's height: upright, by
 * Sitting Idle — made for a seat of about 0.45 m on the avatars — but on a
 * lounge chair out of doors, sat back in it (RECLINED_CLIP); and on a seat
 * lower than its clip is made for — an outdoor lounge chair at 0.37 m, an
 * outdoor sofa at 0.40, a pouf at 0.41, where its soles came 2–7 cm down
 * through the floor — with its knees opened (Utils/fitClip.js's
 * openKnees): the shins turned out, the feet further forward and level on
 * the floor, as someone sits on a low seat. Never lifted off the seat for
 * that: a figure 4 cm over a cushion is seen to float. This is the
 * figure's own clip on this page (played as "sitting", as ever); another
 * visitor's page sits it by its own Sitting Idle, where it is.
 *
 * And which way it sits on it (poseFor's `side`): the way the seat faces;
 * or, on a chair or a stool alone (not one of a sofa's places, nor one sat
 * back in: turns), turned a quarter to either side of it, its knees over
 * the seat's side edge — as people sit at a table they are not eating at,
 * on a chair drawn up under it — where the figure's body turned so meets
 * nothing at all, its own chair's back and shell included (Player.js's
 * seatPose decides).
 */

/** The clip a figure sits by, of the people's shared file — or, with only the stand-ins' (index.standin.json), its first sitting clip. */
const SITTING_CLIP = "Sitting Idle";
/** What it is played as, and sent to everyone else as (any figure playing a clip of a name that starts so is sitting: Pace.js). */
export const SITTING = "sitting";
/** A way of sitting by its name (wayOf's): sat back in or not, and the seat's height in centimetres where its knees were opened for it. */
const WAY_NAME = /^sitting( reclined)?(?: (\d+))?$/;

/**
 * Aimed at: its point this far over the cushion, met within `across` of the
 * crosshair's ray — half the way to the next on a sofa (Ladonia's are
 * 0.6–0.85 m apart), so the crosshair between two is on one of them — and
 * no more than `slack` behind what the ray meets first.
 */
const AIM = { over: 0.12, across: 0.4, slack: 0.3 };
/** Clicked or tapped from above (World/BirdView.js): within this of its point, across the ray. */
const FROM_ABOVE = 0.35;
/** A seat this near where someone else's figure sits on it, across the floor, is theirs (and within this of its floor in height). */
const HELD = 0.3;
const HELD_HEIGHT = 0.6;
/** How far a sitter is lifted, at most, for their soles to reach the floor (World/People.js's LIFT_MOST). */
const LIFT_MOST = 0.015;
/**
 * The clip sat back in, on a lounge chair out of doors, soft and deep
 * (reclines: shared/people.js's rule for the people, RECLINE_DEPTH its
 * depth behind the front edge): hands behind the head, the back against
 * the chair's — "Sitting Reclined Male" of the people's file, on either
 * avatar; the women's, "Sitting Reclining Female", leans on an arm that
 * goes through a chair's rail (shared/people.js's LEFT_OUT).
 */
const RECLINED_CLIP = "Sitting Reclined Male";
const RECLINE_DEPTH = 0.5;
/** Pieces one lounges in (shared/people.js's LOUNGE). */
const LOUNGE = /lounge|daybed|club/i;
/**
 * On a seat lower than its clip is made for by more than LIFT_MOST, the
 * figure's knees are opened (openKnees) until its soles are FEET_OVER over
 * the floor, by KNEES_MOST at most.
 */
const FEET_OVER = 0.004;
const KNEES_MOST = THREE.MathUtils.degToRad(50);
/** Most the people sat back in sit forward of a seat's point (shared/people.js's FORWARD_BACK): their backs are to rest against the seat's. */
const FORWARD_BACK = 0.08;
/** By avatar file (a loaded GLTF): the legs each way of sitting puts at its start (legsAt), and each way's clip opened at the knees (wayOf). */
const LEGS = new WeakMap();
const OPENED = new WeakMap();
/** How far forward of where they sit a sitter's knees come, about (Sitting Idle's, on the avatars and the people: 0.41–0.45 m). */
const KNEE = 0.42;
/** A seat that gives a little under someone whose feet would otherwise hang: a sofa's, a lounge chair's cushion (shared/people.js's `soft`). */
const SOFT = /lounge|daybed|club/i;
/** What each kind of seat is called, from above. */
const NAMES = { sofa: "Sofa", chair: "Chair", stool: "Stool", bench: "Bench" };
/**
 * Sat on turned to a side (poseFor), how far towards the other side the
 * figure may sit back from the seat's middle, for its knees to come no
 * further past the side edge than LEG_CLEAR: so much of half the seat's
 * width, at most — the rest of the seat under the far half of it.
 */
const SIDE_BACK = 0.4;
/**
 * Sat on turned to a side, what of its own piece is its own (own): what is
 * no higher than OWN_OVER over the seat's top — the seat, and what holds it
 * up; not its back, which the figure sits beside, a shell's sides, nor an
 * arm, which its legs would go through.
 */
const OWN_OVER = 0.04;
/** Chairs with arms, by their catalogue id or name — an armchair, a lounge or club chair, a desk chair — sat on only the way they face (turns). */
const ARMS = /arm|lounge|club|desk/i;
/** Where to stand up to, beside a seat sat on from afar (spotBeside): out from its front edge, then to either side of that, then beside the seat. */
const SPOTS = [
    [0.45, 0],
    [0.45, 0.6],
    [0.45, -0.6],
    [-0.1, 0.85],
    [-0.1, -0.85],
    [0.9, 0],
];

/** How far over the feet a seat sat on from above with nothing aimed at is looked for across the floor (inSight), in metres: over a sofa's back, under a doorway's head. */
const SIGHT_OVER = 1.3;

/**
 * Room to sit down on a seat and get up off it (roomFor), to walk to it
 * and away from it (wayClear) and to turn on the spot before it
 * (turnClear): the figure's body, a capsule round each of its limbs (LIMBS:
 * from one bone to the next, so thick), meeting nothing by more than
 * ROOM_GIVE — but the seat's own piece (own: the triangles called as it is
 * within its footprint, OWN_GIVE larger — not the chair beside it, nor the
 * table it is drawn up to) and what is underfoot (lower than UNDERFOOT over
 * the seat's floor: the floor, a rug). A walk is looked at every WAY_STEP:
 * its body as the walking clip swings it, limb by limb, where anything is
 * within SWEEP of it; a turn on the spot every TURN_STEP of it.
 */
const LIMBS = [
    ["Hips", "Spine2", 0.13],
    ["Spine2", "Neck", 0.11],
    ["Neck", "Head", 0.06],
    ["Head", "HeadTop_End", 0.1],
    ...["Left", "Right"].flatMap((side) => [
        [`${side}Arm`, `${side}ForeArm`, 0.05],
        [`${side}ForeArm`, `${side}Hand`, 0.045],
        [`${side}Hand`, `${side}HandMiddle4`, 0.035],
        [`${side}UpLeg`, `${side}Leg`, 0.075],
        [`${side}Leg`, `${side}Foot`, 0.055],
        [`${side}Foot`, `${side}Toe_End`, 0.045],
    ]),
];
/** The bones the body is looked over by (LIMBS'): what Player.js measures its clips at (Avatar.bonesAlong). */
export const LIMB_BONES = [...new Set(LIMBS.flatMap(([a, b]) => [a, b]))];
const ROOM_GIVE = 0.02;
const OWN_GIVE = 0.01;
const OWN_NEAR = 0.35;
const UNDERFOOT = 0.06;
const WAY_STEP = 0.2;
const SWEEP = 0.55;
const SWEEP_TOP = 1.9;
const FIGURE_RADIUS = 0.22;
const FIGURE_TOP = 1.65;
/** A way round what is in the way (wayRound): its grid's spacing and how far round the two ends it goes, in metres; how many of its spots are looked at, at most; its eight ways from one to the next. */
const GRID = 0.2;
const GRID_ROOM = 1.4;
const GRID_MOST = 300;
const STEPS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
];
const TURN_STEP = THREE.MathUtils.degToRad(15);

/** The furniture catalogue, where a public view has no library of it (catalogue). */
const CATALOGUE_URL = "/models/furniture/catalog.json";

const UP = new THREE.Vector3(0, 1, 0);
const _sight = new THREE.Ray();
const _local = new THREE.Ray();
const _blockerBox = new THREE.Box3();
const _inverse = new THREE.Quaternion();
const _met = new THREE.Vector3();
const _point = new THREE.Vector3();
const _to = new THREE.Vector3();
const _front = new THREE.Vector3();
const _capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.35);
const _ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
const _turn = new THREE.Quaternion();
const _near = new THREE.Box3();
const _all = new THREE.Box3();
const _still = new THREE.Quaternion();
const _origin = new THREE.Vector3();
const _corner = new THREE.Vector3();
/** The capsules of a figure's limbs, as many as meetsAll has needed at once. */
const _capsules = [];
const _place = new THREE.Vector3();

export default class Seats {
    /**
     * @param {World} world  its scene builder, its interactables and its people made
     */
    constructor(world) {
        this.world = world;
        /** Every seat there is, as `{ id, furniture, piece, index, kind, label, at, facing, face, depth, height, base, floor, deep, soft, reclines, alone }`. */
        this.list = [];
        this.data = null;
        /** Each figure's sitting clip as it is being fitted (dress). */
        this.dressing = new WeakMap();
        /** The clips a figure sits by, of the people's file, once loaded (clip): `{ clip, hips, reclined }`. */
        this.source = null;
        // seats.json, once — the people's, when they have it already (World/People.js's seats).
        this.ready = (world.people?.seats() ?? fetchSeats()).then((data) => {
            this.data = data ?? null;
            this.refresh();
        });
        this.unregister = world.interactables?.register(this.provider()) ?? null;
    }

    // ------------------------------------------------------------------
    // The seats
    // ------------------------------------------------------------------

    /** The seats of the furniture as it is placed now: after the scene is edited, its furniture come (Interactables' refresh). */
    refresh() {
        this.list = [];
        const spec = this.world.sceneBuilder?.spec ?? this.world.spec;
        if (!this.data || !spec) return;
        for (const placement of spec.furniture ?? []) {
            const placed = seatsOf(placement, this.data);
            if (!placed || placed.kind === "lounger") continue;
            // (A chair or a stool with one seat may be sat on turned to a side: turns.)
            const alone = (placed.kind === "chair" || placed.kind === "stool") && placed.seats.length === 1;
            const soft = placed.kind === "sofa" || SOFT.test(placement.catalog_id);
            // Sat back in: a lounge chair, out of doors, as deep as the people sit back in.
            const lounge = LOUNGE.test(placement.catalog_id) && isOutdoor(roomAt(spec, placement.position));
            for (const seat of placed.seats) {
                if (seat.height < SEAT_HEIGHT[0] || seat.height > SEAT_HEIGHT[1]) continue;
                this.list.push({
                    id: `${seat.furniture}#${seat.index}`,
                    furniture: seat.furniture,
                    // Its piece as placed: the catalogue's piece, where and how turned (own).
                    piece: placement,
                    index: seat.index,
                    kind: placed.kind,
                    label: NAMES[placed.kind] ?? "Seat",
                    at: new THREE.Vector3(...seat.at),
                    facing: seat.facing,
                    face: facingOf(seat.facing),
                    depth: seat.depth,
                    height: seat.height,
                    base: seat.base,
                    floor: seat.at[1] - seat.height,
                    // A chaise's deep end: sat on at its front (poseFor).
                    deep: seat.depth > SEAT_DEPTH[1],
                    soft,
                    reclines: lounge && soft && seat.room >= RECLINE_DEPTH,
                    alone,
                });
            }
        }
    }

    /**
     * The seat a ray points at: the one whose point (AIM.over over its
     * cushion) it passes nearest, within `across` of it and `reach` along it,
     * free (usable) and, if given, `accept`ed. `{ seat, distance }`, the
     * distance along the ray to where it passes it; or null.
     */
    pick(ray, { reach = REACH.seat, across = AIM.across, accept = null } = {}) {
        let best = null;
        let nearest = across;
        let distance = 0;
        for (const seat of this.list) {
            _point.copy(seat.at).y += AIM.over;
            const along = _to.subVectors(_point, ray.origin).dot(ray.direction);
            if (along < 0 || along > reach) continue;
            const miss = _to.addScaledVector(ray.direction, -along).length();
            if (miss >= nearest || !this.usable(seat) || (accept && !accept(seat))) continue;
            best = seat;
            nearest = miss;
            distance = along;
        }
        return best ? { seat: best, distance } : null;
    }

    /** The free seat a click or a tap from above is on (World/BirdView.js): within FROM_ABOVE of the ray, of those `accept`ed (on the floor shown). */
    fromAbove(ray, accept) {
        return this.pick(ray, { reach: Infinity, across: FROM_ABOVE, accept });
    }

    /**
     * The nearest free seat on the floor stood on within `within` of the
     * feet, across it — from above, with nothing aimed at — that nothing
     * solid stands between (inSight): not the sofa through the party wall
     * of the flat next door, a metre off across the plan. Or null.
     */
    nearest(feet, within) {
        const near = [];
        for (const seat of this.list) {
            if (Math.abs(seat.floor - feet.y) > HELD_HEIGHT) continue;
            const distance = Math.hypot(seat.at.x - feet.x, seat.at.z - feet.z);
            if (distance <= within) near.push({ seat, distance });
        }
        near.sort((a, b) => a.distance - b.distance);
        for (const { seat, distance } of near) {
            if (this.usable(seat) && this.inSight(feet, seat, distance)) return seat;
        }
        return null;
    }

    /**
     * Whether a seat can be reached from where the feet stand without going
     * through anything: across the floor at SIGHT_OVER over them — over the
     * seat's own back and arms, the table before it, under a wall's head — a
     * ray meets nothing of the collision trees short of it, nor a door's
     * leaf still shut (which is in none of them: Door.getBlockers). Which
     * room each is in would not do: a living room and its kitchen are two,
     * with no wall between.
     */
    inSight(feet, seat, distance = this.distance(seat, feet)) {
        if (distance < 0.01) return true;
        _sight.origin.set(feet.x, feet.y + SIGHT_OVER, feet.z);
        _sight.direction.set(seat.at.x - feet.x, 0, seat.at.z - feet.z).divideScalar(distance);
        const hit = this.world.collision?.rayIntersect(_sight, { twoSided: true, far: distance });
        if (hit && hit.distance < distance) return false;
        for (const door of this.world.sceneBuilder?.doors ?? []) {
            for (const blocker of door.getBlockers()) if (rayMeetsBlocker(_sight, blocker, distance)) return false;
        }
        return true;
    }

    /** How far a seat is from a point, across the floor. */
    distance(seat, point) {
        return Math.hypot(seat.at.x - point.x, seat.at.z - point.z);
    }

    /** Whether a seat can be sat on now: its piece shown, and nobody else on it. */
    usable(seat) {
        // (Its piece drawn: in the editor, the view's scope may leave it out, World/Scope.js's isShown.)
        for (let node = this.world.sceneBuilder?.furniture?.get(seat.furniture)?.group; node; node = node.parent) {
            if (!node.visible) return false;
        }
        return !this.taken(seat);
    }

    /**
     * Whether someone is on a seat: one of the people (World/People.js),
     * placed on it and drawn now; the visitor, sat on it; or another
     * visitor's figure sitting within HELD of it.
     */
    taken(seat) {
        const world = this.world;
        if (world.player?.seated?.seat === seat) return true;
        const people = world.people;
        if (people?.root.visible) {
            for (const entry of world.spec?.people ?? []) {
                if (entry.pose !== "sit" || entry.seat?.furniture !== seat.furniture || entry.seat.index !== seat.index) continue;
                if (people.get(entry.id)?.group.visible) return true;
            }
        }
        const others = world.player?.otherPlayers ?? {};
        for (const id in others) {
            const { animation, model } = others[id];
            if (typeof animation !== "string" || !animation.startsWith(SITTING) || !model) continue;
            const at = model.avatar.position;
            if (Math.abs(at.y - seat.floor) > HELD_HEIGHT) continue;
            if (this.distance(seat, at) <= HELD || this.distance({ at: this.sittingPoint(seat) }, at) <= HELD) return true;
        }
        return false;
    }

    /** Where on the plan someone sits on a seat, about: its point, or a chaise's deep end's front (poseFor), for a figure's knees KNEE forward of it. */
    sittingPoint(seat) {
        if (!seat.deep) return seat.at;
        const forward = seat.depth - Math.min(SIT_BACK, seat.depth / 2) + LEG_CLEAR - KNEE;
        return _front.set(seat.at.x + seat.face[0] * forward, seat.at.y, seat.at.z + seat.face[1] * forward);
    }

    // ------------------------------------------------------------------
    // Sitting on one
    // ------------------------------------------------------------------

    /**
     * Where a figure sits on a seat, and how: placed as World/People.js
     * places a seated person (its `place`) — turned to face the seat's way
     * (a rig faces +z: half a turn more), the point it sits on (Avatar's
     * `sitting`, for the way it sits there: wayOf) on the seat's point; as
     * far forward of it as its knees need to come past the seat's front
     * edge (and its heels, before a solid base), FORWARD_MOST at most
     * (FORWARD_BACK sat back in it) — but on a chaise's deep end as far as
     * that takes it, which sits it at the front, legs over the edge; let
     * down into a soft seat by what it gives (GIVE at most) where its feet
     * would otherwise hang, or lifted (LIFT_MOST at most) where they would
     * be under the floor (shared/people.js's sitter, People.liftFor) — a
     * seat lower than that has its knees opened instead (wayOf).
     *
     * `side`, turned a quarter to the seat's left (1) or its right (−1) on a
     * seat that turns: on the seat's point — as near its back as it sits
     * facing its way (its hip there, beside the back), as far from the table
     * a chair is drawn up to as it can be — as far back from the side edge
     * it faces — SIDE_BACK of half the piece's width at most — as keeps its
     * knees LEG_CLEAR past that edge (and its heels HEEL_CLEAR, before a
     * solid base), or as far forward of it as they need, FORWARD_MOST at
     * most; and `back` metres further back, towards its back (Player.js's
     * seatPose: away from a table the chair is drawn up to, where sat on its
     * point the figure's arm went into the table's edge).
     *
     * Its root's `position` and `quaternion`, the `point` it sits on, its
     * head and its eye in the world, the `clip` it sits by there — which the
     * figure now plays as SITTING (Player.sit plays it) — its `side`, the way
     * it faces (`face`, [x, z]), and where its front edge is (`edge` metres
     * that way from `origin`): what is out before it, to stand up to (Player.
     * js's standSpot, spotsBeside). Null until its clips are fitted to it,
     * or turned to a side on a seat that does not turn.
     */
    poseFor(seat, avatar, side = 0, { back: off = 0 } = {}) {
        if (side && !this.turns(seat)) return null;
        const way = this.wayOf(seat, avatar);
        if (!way) return null;
        const how = way.how;
        const back = Math.min(SIT_BACK, seat.depth / 2);
        // Its front edge, the way it faces: the seat's own; or, turned to a side, that side's, from the seat's middle.
        const half = side ? this.widthOf(seat) / 2 : 0;
        const edge = side ? half : seat.depth - back;
        const facing = seat.facing + 90 * side;
        const face = side ? facingOf(facing) : seat.face;
        const origin = seat.at.clone();
        if (side && off) origin.addScaledVector(_front.set(seat.face[0], 0, seat.face[1]), -off);
        let forward = 0;
        if (how.knee !== null) {
            const needs = Math.max(edge + LEG_CLEAR - how.knee, seat.base !== "open" && how.tuck !== null ? edge + HEEL_CLEAR - how.tuck : -Infinity);
            forward = side ? THREE.MathUtils.clamp(needs, -SIDE_BACK * half, FORWARD_MOST) : Math.max(0, needs);
            if (!seat.deep && !side) forward = Math.min(forward, way.reclined ? FORWARD_BACK : FORWARD_MOST);
        }
        let give = 0;
        let lift = 0;
        if (how.soles !== null) {
            // How far its soles would hang over the floor, sat on the cushion as it is (under it, less than 0).
            const over = seat.height - (how.seat.y - how.soles);
            give = seat.soft ? Math.min(GIVE, Math.max(0, over)) : 0;
            lift = THREE.MathUtils.clamp(give - over, 0, LIFT_MOST);
        }
        const [x, y, z] = seatedAt({ at: origin.toArray(), facing }, give, forward);
        const yaw = THREE.MathUtils.degToRad(facing) + Math.PI;
        const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        const contact = how.seat.clone().applyQuaternion(quaternion);
        const position = new THREE.Vector3(x - contact.x, y - contact.y + lift, z - contact.z);
        // What it plays as SITTING, on this seat: this figure's alone (addClips), not every figure's of its skin.
        if (way.clip) avatar.addClips({ [SITTING]: way.clip });
        return {
            position,
            quaternion,
            point: new THREE.Vector3(x, y + lift, z),
            head: how.head.clone().applyQuaternion(quaternion).add(position),
            eye: how.eye.clone().applyQuaternion(quaternion).add(position),
            clip: way.name,
            side,
            face,
            origin,
            edge,
        };
    }

    /**
     * Whether a figure may sit on a seat turned to a side (poseFor's
     * `side`): a chair's or a stool's, alone on its piece — not one of a
     * sofa's places, whose next place it would sit across — nor one sat back
     * in, nor a chaise's deep end, nor a chair with arms (ARMS, by what the
     * catalogue calls it: its legs would go over the arm, which a public
     * view's collision has only the top of, if that); and its piece's width
     * known (widthOf).
     */
    turns(seat) {
        if (!seat.alone || seat.reclines || seat.deep || !(this.widthOf(seat) > 0)) return false;
        const item = this.item(seat.piece.catalog_id);
        return !ARMS.test(`${seat.piece.catalog_id} ${item?.name ?? ""}`);
    }

    /** How wide a seat's piece is as placed, across the way it faces, in metres: its catalogue size (item) — 0 until that is here. */
    widthOf(seat) {
        const item = seat.piece ? this.item(seat.piece.catalog_id) : null;
        if (!Array.isArray(item?.size)) return 0;
        return item.size[0] * (seat.piece.scale ?? 1) * (item.scale ?? 1);
    }

    /**
     * The way a figure sits on a seat: `{ name, clip, how, reclined }` — the
     * clip, fitted to it (Avatar's fit) by that name, and how it sits by it
     * (Avatar's sitting). Upright, by SITTING_CLIP (as dress fitted it);
     * sat back in, on a seat that reclines, by RECLINED_CLIP. And where the
     * seat is lower than that clip is made for (its seat over its soles)
     * by more than LIFT_MOST, the same with its knees opened (openKnees),
     * as far as brings its soles FEET_OVER over the floor — worked out from
     * where the clip puts its knees and ankles (legsAt, kneeFor), once for
     * each avatar's file, way of sitting and seat height to the centimetre
     * ("sitting 40", "sitting reclined 37"), and measured on its skin as
     * any way is. Null until the clips are here (dress).
     */
    wayOf(seat, avatar) {
        const source = this.source;
        const reclined = Boolean(seat.reclines && source?.reclined);
        const name = reclined ? `${SITTING} reclined` : SITTING;
        const from = reclined ? source.reclined : source?.clip;
        // (A figure given its clip some other way than dress — none here — sits as it has it.)
        const clip = from ? avatar.fit(name, from, source.hips) : null;
        const how = avatar.sitting(name);
        if (!how) return null;
        const under = how.soles === null ? 0 : how.seat.y - how.soles - seat.height;
        if (under <= LIFT_MOST || !clip) return { name, clip, how, reclined };

        // Its legs, as this way puts them (measured once a file).
        const file = avatar.source;
        if (!LEGS.has(file)) LEGS.set(file, new Map());
        const measured = LEGS.get(file);
        if (!measured.has(name)) measured.set(name, legsAt(file.scene, clip, avatar.rig, avatar.avatar.scale));
        const legs = measured.get(name);
        const height = Math.round(seat.height * 100);
        const lower = `${name} ${height}`;
        if (!OPENED.has(file)) OPENED.set(file, new Map());
        const opened = OPENED.get(file);
        if (!opened.has(lower) && (legs.left || legs.right)) {
            // Each foot up as far as the seat is lower, and FEET_OVER more — the higher of the two by as much less as it is higher.
            const need = how.seat.y - how.soles - height / 100 + FEET_OVER;
            const lowest = Math.min(...[legs.left, legs.right].filter(Boolean).map((leg) => leg.low));
            const angles = {};
            for (const side of ["left", "right"]) angles[side] = kneeFor(legs[side], need - (legs[side] ? legs[side].low - lowest : 0), KNEES_MOST);
            opened.set(lower, openKnees(from, legs, angles, `${from.name} (${height} cm seat)`));
        }
        if (!opened.has(lower)) return { name, clip, how, reclined };
        const low = avatar.fit(lower, opened.get(lower), source.hips);
        return { name: lower, clip: low, how: avatar.sitting(lower) ?? how, reclined };
    }

    /**
     * Somewhere free to stand up to beside a seat, as the capsule's foot
     * (`radius` over the floor): out from its front, else to either side
     * (SPOTS) — where the capsule, `height` tall, meets nothing, over the
     * seat's floor — out the way the figure sits on it (`pose`: poseFor's,
     * turned to a side or not), else the way the seat faces. Null if none is
     * free.
     */
    spotBeside(seat, radius, height, pose = null) {
        return this.spotsBeside(seat, radius, height, 1, pose)[0] ?? null;
    }

    /** Every spot beside a seat free to stand in (spotBeside's), `most` at most, in SPOTS' order. */
    spotsBeside(seat, radius, height, most = Infinity, pose = null) {
        const [fx, fz] = pose?.face ?? seat.face;
        const edge = pose?.edge ?? seat.depth - Math.min(SIT_BACK, seat.depth / 2);
        const origin = pose?.origin ?? seat.at;
        const found = [];
        for (const [out, aside] of SPOTS) {
            // Out the way it faces from its front edge; aside, to its right (−z × the way it faces).
            const along = edge + out;
            const spot = this.freeAt(origin.x + fx * along - fz * aside, origin.z + fz * along + fx * aside, seat.floor, radius, height);
            if (spot) found.push(spot);
            if (found.length >= most) break;
        }
        return found;
    }

    /**
     * Whether the capsule (`radius`, `height` tall) can stand at (x, z) on a
     * floor at `floor`: meeting nothing there, and with that floor under it —
     * not a stairwell or the pool. Its foot (`radius` over the floor) if so,
     * else null: where to get up to beside a seat (spotBeside), or where a
     * figure stands up to by its clip (Player.stand).
     */
    freeAt(x, z, floor, radius, height) {
        const collision = this.world.collision;
        if (!collision) return null;
        _capsule.radius = radius;
        _capsule.start.set(x, floor + radius + 0.02, z);
        _capsule.end.copy(_capsule.start).y += height;
        // (Any triangle it meets by more than a centimetre, the first found: some 0.3 ms, where resolving all it meets took 5-7.)
        if (collision.meets ? collision.meets(_capsule, { depth: 0.01 }) : (collision.capsuleIntersect(_capsule)?.depth ?? 0) > 0.01) return null;
        _ray.origin.set(x, floor + 0.3, z);
        const ground = collision.rayIntersect(_ray, { far: 0.6 });
        if (!ground || ground.distance > 0.6) return null;
        return _capsule.start.clone();
    }

    /**
     * Whether a figure could stand at (x, z) on a seat's floor on its way to
     * the seat or from it (Player.js's ways on foot): its body a capsule
     * FIGURE_RADIUS round from UNDERFOOT over the floor to FIGURE_TOP,
     * meeting nothing but the seat's own piece and what is underfoot (own),
     * and (unless not `ground`) that floor under it — not a stairwell or the pool. Slimmer than the
     * capsule the visitor walks in, which a figure walking between a sofa and
     * its coffee table does not need.
     */
    figureAt(seat, x, z, except = this.own(seat), { ground = true } = {}) {
        const collision = this.world.collision;
        if (!collision?.meets) return false;
        _capsule.radius = FIGURE_RADIUS;
        _capsule.start.set(x, seat.floor + UNDERFOOT + FIGURE_RADIUS, z);
        _capsule.end.set(x, seat.floor + FIGURE_TOP, z);
        if (collision.meets(_capsule, { except, depth: ROOM_GIVE })) return false;
        if (!ground) return true;
        _ray.origin.set(x, seat.floor + 0.3, z);
        const under = collision.rayIntersect(_ray, { far: 0.6 });
        return Boolean(under && under.distance <= 0.6);
    }

    /**
     * Whether a figure posed so — its bones in the world (Avatar's
     * bonesAlong, placed as Player.js plays the clip) at each of a few
     * moments of sitting down on `seat` or getting up off it — meets
     * nothing, its body taken as a capsule round each limb (LIMBS), but the
     * seat's own piece and the floor (own). Where it does — a chair drawn up
     * to a table, the next chair, a pendant over the table — the figure sits
     * down and gets up as it did before it had the clips, walking and
     * gliding (Player.sitPlan, risePlan).
     *
     * @param {object} seat
     * @param {Object<string, THREE.Vector3>[]} poses
     * @param {(triangle: THREE.Triangle) => boolean} [except]  own(seat), if the caller has it
     */
    roomFor(seat, poses, except = this.own(seat)) {
        if (!this.world.collision?.meets) return false;
        return !this.meetsAll(poses.map((bones) => ({ bones })), except, _still, _origin);
    }

    /**
     * Whether a figure walking across the seat's floor from `from` to `to`
     * (its root's place) meets nothing but the seat's own piece and what is
     * underfoot (own): every WAY_STEP along the way, its body — a capsule
     * round each limb, its legs down to its feet on the floor — at each of
     * the moments of its walking clip in `walk` (Avatar's bonesAlong, in its
     * root's frame), turned the way it goes; looked at only where anything
     * at all is within its reach (SWEEP round it, from what is underfoot to
     * SWEEP_TOP: Collision.anyIn). A body from the knees up alone, as it was
     * looked at, walked a figure's feet and shins through a coffee table, a
     * drum side table, a lounge chair's footrest.
     *
     * @param {{ bones: Object<string, THREE.Vector3> }[]} walk
     */
    wayClear(seat, from, to, walk, except = this.own(seat)) {
        const collision = this.world.collision;
        if (!collision?.meets) return false;
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        const steps = Math.max(1, Math.ceil(length / WAY_STEP));
        _turn.setFromAxisAngle(UP, Math.atan2(dx, dz));
        for (let i = 0; i <= steps; i++) {
            _place.set(from.x + (dx * i) / steps, seat.floor, from.z + (dz * i) / steps);
            // (Anything at all within its reach, SWEEP round it from what is underfoot to over its head.)
            _near.min.set(_place.x - SWEEP, seat.floor + UNDERFOOT, _place.z - SWEEP);
            _near.max.set(_place.x + SWEEP, seat.floor + SWEEP_TOP, _place.z + SWEEP);
            if (collision.anyIn && !collision.anyIn(_near, { except })) continue;
            if (this.meetsAll(walk, except, _turn, _place)) return false;
        }
        return true;
    }

    /**
     * A way on foot across a seat's floor from `from` to `to` (the root's
     * places, on the floor) round whatever is in the way, as Player.js walks
     * it to the seat and off it: the shortest found over a grid of spots GRID
     * apart that a figure could stand in (figureAt; where it starts and where
     * it ends whatever they are), looked at GRID_MOST spots at most, within
     * GRID_ROOM of the two; then straightened — from each of its points on to
     * the furthest the walk to is clear for the figure's body as its walking
     * clip swings it (`walk`, wayClear). Its points, `from` and `to` among
     * them; or null where none is found. `most`, so many spots at most
     * (Player.js: a seat sat on from afar, walked to where the way is clear).
     */
    wayRound(seat, from, to, walk, except = this.own(seat), { most = GRID_MOST } = {}) {
        const x0 = Math.min(from.x, to.x) - GRID_ROOM;
        const z0 = Math.min(from.z, to.z) - GRID_ROOM;
        const columns = Math.ceil((Math.max(from.x, to.x) + GRID_ROOM - x0) / GRID) + 1;
        const rows = Math.ceil((Math.max(from.z, to.z) + GRID_ROOM - z0) / GRID) + 1;
        const index = (x, z) => Math.round((x - x0) / GRID) * rows + Math.round((z - z0) / GRID);
        const start = index(from.x, from.z);
        const goal = index(to.x, to.z);
        const placeOf = (cell) => (cell === start ? from : cell === goal ? to : new THREE.Vector3(x0 + Math.floor(cell / rows) * GRID, from.y, z0 + (cell % rows) * GRID));
        const free = new Map();
        const open = (cell) => {
            if (cell === start || cell === goal) return true;
            if (!free.has(cell)) {
                const place = placeOf(cell);
                free.set(cell, this.figureAt(seat, place.x, place.z, except, { ground: false }));
            }
            return free.get(cell);
        };
        const toGoal = (cell) => placeOf(cell).distanceTo(to);
        const cost = new Map([[start, 0]]);
        const came = new Map();
        const frontier = [{ cell: start, rank: toGoal(start) }];
        let looked = 0;
        let found = false;
        while (frontier.length && looked++ < most) {
            let best = 0;
            for (let i = 1; i < frontier.length; i++) if (frontier[i].rank < frontier[best].rank) best = i;
            const { cell } = frontier.splice(best, 1)[0];
            if (cell === goal) {
                found = true;
                break;
            }
            const column = Math.floor(cell / rows);
            const row = cell % rows;
            for (const [dc, dr] of STEPS) {
                const c = column + dc;
                const r = row + dr;
                if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
                const next = c * rows + r;
                // (Not across a corner: both its sides open.)
                if (!open(next) || (dc && dr && (!open((column + dc) * rows + row) || !open(column * rows + row + dr)))) continue;
                const reached = cost.get(cell) + Math.hypot(dc, dr) * GRID;
                if (reached >= (cost.get(next) ?? Infinity)) continue;
                cost.set(next, reached);
                came.set(next, cell);
                frontier.push({ cell: next, rank: reached + toGoal(next) });
            }
        }
        if (!found) return null;
        const path = [goal];
        while (path[0] !== start) path.unshift(came.get(path[0]));
        const points = path.map(placeOf);
        // Straightened: from each point, on to the furthest of the rest the walk to is clear (halving back towards it).
        const way = [points[0]];
        for (let i = 0; i < points.length - 1; ) {
            let j = points.length - 1;
            while (j > i + 1 && !this.wayClear(seat, points[i], points[j], walk, except)) j = i + 1 + Math.floor((j - i - 1) / 2);
            way.push(points[j]);
            i = j;
        }
        // ...and any point left that the walk past it, from the one before to the one after, does not need.
        for (let i = 1; i < way.length - 1; ) {
            if (this.wayClear(seat, way[i - 1], way[i + 1], walk, except)) way.splice(i, 1);
            else i++;
        }
        return way;
    }

    /**
     * Whether a figure standing posed `bones` (in its root's frame) at `at`
     * can turn on the spot there from facing `from` to facing `to` (radians
     * about the up, as a rig faces +z), the shorter way round — its body
     * looked at every TURN_STEP of the turn — meeting nothing but the seat's
     * own piece and what is underfoot (own): turning on the spot before a
     * coffee table, its toes went through it.
     */
    turnClear(seat, at, bones, from, to, except = this.own(seat)) {
        if (!this.world.collision?.meets) return false;
        const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
        const steps = Math.max(1, Math.ceil(Math.abs(turn) / TURN_STEP));
        for (let i = 0; i <= steps; i++) {
            _turn.setFromAxisAngle(UP, from + (turn * i) / steps);
            if (this.meetsAll([{ bones }], except, _turn, at)) return false;
        }
        return true;
    }

    /**
     * Whether a figure's body at any of `moments` (`{ bones }`, its bones in
     * its root's frame) — a capsule round each limb (LIMBS) — turned `turn`
     * and put at `at`, meets anything by more than ROOM_GIVE that `except`
     * does not leave out: all at once (Collision.meetsAny), the triangles
     * round it gathered once.
     */
    meetsAll(moments, except, turn, at) {
        const collision = this.world.collision;
        let used = 0;
        _all.makeEmpty();
        for (const { bones } of moments) {
            for (const [a, b, radius] of LIMBS) {
                if (!bones[a] || !bones[b]) continue;
                const capsule = (_capsules[used++] ??= new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0));
                capsule.radius = radius;
                capsule.start.copy(bones[a]).applyQuaternion(turn).add(at);
                capsule.end.copy(bones[b]).applyQuaternion(turn).add(at);
                _all.expandByPoint(_corner.copy(capsule.start).addScalar(-radius)).expandByPoint(_corner.copy(capsule.start).addScalar(radius));
                _all.expandByPoint(_corner.copy(capsule.end).addScalar(-radius)).expandByPoint(_corner.copy(capsule.end).addScalar(radius));
            }
        }
        if (!collision.meetsAny) {
            for (let i = 0; i < used; i++) if (collision.meets(_capsules[i], { except, depth: ROOM_GIVE })) return true;
            return false;
        }
        return collision.meetsAny(_capsules, _all, { except, depth: ROOM_GIVE, count: used });
    }

    /**
     * Which of the collision's triangles are a seat's own — left out looking
     * for room to sit on it and get up off it (roomFor, wayClear,
     * turnClear): those of its piece, by what the piece is called (each
     * triangle's label, as the crosshair has it; in the editor, its piece's),
     * all three of their corners within the piece's own footprint — its
     * catalogue box as it is placed (`seat.piece`, turned and scaled), OWN_GIVE
     * larger — and whatever is lower than UNDERFOOT over the seat's floor
     * (the floor, a rug). The same in the editor and in a public view, which
     * has nothing else to go by than what each triangle is called: taken
     * from the triangles round the seat's point, its piece was at times
     * another — the dining table a chair is drawn up to, a corner sofa, a
     * curtain — and the next armchair alike was left out as its own. Until
     * the catalogue is here (catalogue: a public view's own fetch), only
     * what is underfoot. `near`, of its piece only the seat's own place — its
     * middle within OWN_NEAR of the seat's point, across the seat (from its
     * back to its front) — for the ways on foot to it and off it (Player.js's
     * ways): what the figure stands in to sit down, not the rest of a sofa,
     * whose other places a walk to this one went over.
     *
     * Sat on turned to a side (`side`: poseFor), of its piece only the seat
     * and what is under it (no higher than OWN_OVER over the seat's top),
     * `near` or not: its back, which the figure sits beside, a shell's sides
     * and an armchair's arm are not its own — the figure turned so is not to
     * go into them (Player.js's seatPose). Counted as its own, the back let
     * a figure sit turned with its torso 0.22 m into an oak chair's backrest
     * and its thighs through a shell chair's sides.
     *
     * @returns {(triangle: THREE.Triangle) => boolean}
     */
    own(seat, { near = false, side = 0 } = {}) {
        const underfoot = seat.floor + UNDERFOOT;
        const placement = seat.piece;
        const item = placement ? this.item(placement.catalog_id) : null;
        const label = item ? item.name || placement.catalog_id : null;
        const size = Array.isArray(item?.size) ? item.size : null;
        const scale = (placement?.scale ?? 1) * (item?.scale ?? 1);
        const [px, py, pz] = placement?.position ?? [0, 0, 0];
        const turn = THREE.MathUtils.degToRad(placement?.rotation ?? 0);
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const halfX = size ? (size[0] * scale) / 2 + OWN_GIVE : 0;
        const halfZ = size ? (size[2] * scale) / 2 + OWN_GIVE : 0;
        const top = size ? py + size[1] * scale + OWN_GIVE : 0;
        const within = (point) => {
            const dx = point.x - px;
            const dz = point.z - pz;
            return Math.abs(dx * cos - dz * sin) <= halfX && Math.abs(dx * sin + dz * cos) <= halfZ && point.y >= py - OWN_GIVE && point.y <= top;
        };
        // (Of it, only the seat's own place, where `near`: the middle of each triangle within OWN_NEAR of it, across it.)
        const { x, z } = seat.at;
        const [fx, fz] = seat.face;
        const close = (triangle) => !near || Math.abs(((triangle.a.x + triangle.b.x + triangle.c.x) / 3 - x) * -fz + ((triangle.a.z + triangle.b.z + triangle.c.z) / 3 - z) * fx) <= OWN_NEAR;
        // (Turned to a side: the seat and what is under it.)
        const seatTop = seat.at.y + OWN_OVER;
        const low = (point) => point.y <= seatTop;
        const part = (triangle) => low(triangle.a) && low(triangle.b) && low(triangle.c);
        return (triangle) => {
            if (triangle.a.y < underfoot && triangle.b.y < underfoot && triangle.c.y < underfoot) return true;
            if (!size || (triangle.label ?? triangle.source?.key?.userData?.label) !== label) return false;
            if (!within(triangle.a) || !within(triangle.b) || !within(triangle.c)) return false;
            return side ? part(triangle) : close(triangle);
        };
    }

    /** A piece of the furniture catalogue by its id, `{ name, size, scale }`: the editor's library's, or the catalogue fetched (catalogue). Null until then. */
    item(id) {
        return this.world.sceneBuilder?.furnitureLibrary?.getItem?.(id) ?? this.pieces?.get(id) ?? null;
    }

    /**
     * The furniture catalogue, for what each seat's piece is called and how
     * big it is (own): the editor's library has it; a public view, which
     * draws the furniture from its published files, fetches the catalogue's
     * file once, the first time a seat is offered (Player.prepareSitting).
     * Resolves to whether it is here.
     */
    catalogue() {
        if (this.world.sceneBuilder?.furnitureLibrary?.catalog?.items?.length) return Promise.resolve(true);
        this.cataloguePromise ??= fetch(CATALOGUE_URL)
            .then((response) => (response.ok ? response.json() : null))
            .then((raw) => {
                this.pieces = new Map((raw?.items ?? []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
                return this.pieces.size > 0;
            })
            .catch(() => {
                this.pieces = new Map();
                return false;
            });
        return this.cataloguePromise;
    }

    /**
     * A figure given its sitting clip (Avatar's fit), once each — the
     * visitor's own before it first sits, another visitor's as theirs is
     * first seen sitting — or, by its name (`name`, as wayOf names it:
     * "sitting reclined", "sitting 40", "sitting reclined 37"), the way
     * another visitor's page sat them, made here for their figure as it was
     * made there: their skin is the same file here, so it comes out the
     * same, and their figure sits at the place they send by it as it does
     * on their page (Player.sit sends that name). Resolves to whether it
     * has it.
     */
    dress(avatar, name = SITTING) {
        if (!avatar) return Promise.resolve(false);
        if (avatar.has(name)) return Promise.resolve(true);
        let byName = this.dressing.get(avatar);
        if (!byName) this.dressing.set(avatar, (byName = new Map()));
        let dressed = byName.get(name);
        if (!dressed) {
            dressed = this.clip().then((found) => {
                if (!found) return false;
                if (!avatar.has(SITTING)) avatar.fit(SITTING, found.clip, found.hips);
                if (name === SITTING) return true;
                const way = WAY_NAME.exec(name);
                if (!way) return false;
                // A seat of that height (where the name gives none, one high enough that the clip sits on it as it is).
                const seat = { reclines: Boolean(way[1]), height: way[2] ? Number(way[2]) / 100 : 1 };
                const made = this.wayOf(seat, avatar);
                if (!made?.clip) return false;
                if (made.name !== name) avatar.addClips({ [name]: made.clip });
                return true;
            });
            byName.set(name, dressed);
        }
        return dressed;
    }

    /**
     * The sitting clip, loaded once: SITTING_CLIP from the people's shared
     * file of clips (World/People.js's index: the pipeline's clips.glb, or
     * else the stand-ins' clips.standin.glb and its first sitting clip) —
     * the file the people round the property are drawn by, downloaded once
     * for both — with how high its skeleton's hips are. Null where there is
     * none: the visitor then has no seat to sit on.
     */
    clip() {
        this.clipPromise ??= (async () => {
            const people = this.world.people;
            const index = people ? await people.index() : null;
            if (!index?.clips?.url) return null;
            const entry = index.clips.list.find((item) => item.name === SITTING_CLIP) ?? index.clips.list.find((item) => item.pose === "sit");
            if (!entry) return null;
            const gltf = await people.file(index.clips.url);
            const clip = gltf.animations?.find((item) => item.name === entry.name);
            if (!clip) return null;
            // ...and, kept for the way a figure sits on each seat (wayOf), the clip sat back in, where the file has it.
            const reclined = gltf.animations.find((item) => item.name === RECLINED_CLIP) ?? null;
            this.source = { clip, hips: index.clips.hips ?? null, reclined };
            return this.source;
        })().catch((error) => {
            console.warn("The sitting clip did not load: nobody can sit", error);
            return null;
        });
        return this.clipPromise;
    }

    // ------------------------------------------------------------------
    // What the visitor acts on (World/Interactables.js)
    // ------------------------------------------------------------------

    /** The seats as one of World/Interactables.js's kinds: "seat". */
    provider() {
        const seats = this;
        const candidate = (seat, distance = null) => {
            const seated = seats.world.player?.seated?.seat === seat;
            return { kind: "seat", id: seat.id, distance, ref: seat, label: seat.label, slack: AIM.slack, seated };
        };
        return {
            name: "seat",
            aim(ray) {
                const player = seats.world.player;
                if (!player || player.seated || player.inVehicle) return null;
                const found = seats.pick(ray);
                if (!found) return null;
                // (Its clips fitted while it is offered — sitting, and sitting down and getting up: Avatar.wear — there, most likely, by the time the key is pressed;
                // and the body they are looked over for room by: Player.prepareSitting.)
                seats.dress(player.avatar);
                player.avatar?.wear(player.experience);
                player.prepareSitting?.();
                return [candidate(found.seat, found.distance)];
            },
            // One seat, picked some other way: clicked from above, the nearest from above, or the one sat on.
            of: (seat) => candidate(seat),
            prompt(target) {
                return target.seated ? { label: "Stand up", key: "E", touch: { label: "Stand", icon: "seat" } } : { label: "Sit", key: "E", touch: { label: "Sit", icon: "seat" } };
            },
            act(target, player) {
                if (target.seated) {
                    player.stand();
                    return { kind: "seat", id: target.id, state: "standing" };
                }
                return { kind: "seat", id: target.id, state: player.sit(target.ref) ? "sitting" : "standing" };
            },
            // Sitting down or getting up: the figure and the camera easing (Player.settling).
            busy: () => (seats.world.player?.settling() ? "seat" : null),
            refresh: () => seats.refresh(),
        };
    }

    dispose() {
        this.unregister?.();
        this.unregister = null;
        this.list = [];
    }
}

/** The room of a spec a point is in (its floor at most 5 cm under it, its ceiling over it), or null: out of doors. */
function roomAt(spec, [x, y, z]) {
    for (const room of spec.rooms ?? []) {
        if (y < room.elevation - 0.05 || y >= room.elevation + room.height) continue;
        if (pointInPolygon(x, z, room.polygon)) return room;
    }
    return null;
}

/** seats.json, where there are no people to have loaded it: null if it will not load. */
function fetchSeats() {
    return fetch("/models/furniture/seats.json")
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}

/**
 * Whether a ray meets a door's leaf (Door.getBlockers' `{ centre,
 * quaternion, half }`, a box turned in the world) within `far` of its
 * origin — or starts in it: the ray taken into the box's own frame.
 */
function rayMeetsBlocker(ray, { centre, quaternion, half }, far) {
    _inverse.copy(quaternion).invert();
    _local.origin.copy(ray.origin).sub(centre).applyQuaternion(_inverse);
    _local.direction.copy(ray.direction).applyQuaternion(_inverse);
    _blockerBox.min.copy(half).negate();
    _blockerBox.max.copy(half);
    if (_blockerBox.containsPoint(_local.origin)) return true;
    const met = _local.intersectBox(_blockerBox, _met);
    return met !== null && met.distanceTo(_local.origin) <= far;
}

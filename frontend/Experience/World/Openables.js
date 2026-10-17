import * as THREE from "three";

import { uniqueTriangles } from "./Collision.js";

/**
 * The doors and drawers of furniture: a wardrobe's doors, a kitchen's
 * cupboards and drawers, a fridge's doors, a nightstand's drawers, a
 * washing machine's porthole, a shower's glass door.
 *
 * A piece's model says which of its parts open, and how, on each part's own
 * node (`userData.opens`, from blender/lib/geometry.py's join_piece):
 *
 *   - `type: "hinge"`: a door swings by `angle` radians when fully open,
 *     about `axis` — a direction in the frame of the part's parent, through
 *     the part's origin, its hinge: the up axis unless the model says
 *     otherwise (a flap that lifts, a door that drops);
 *   - `type: "slide"`: a drawer slides `distance` metres along `direction`;
 *   - `label`: what the prompt calls it — "Open fridge", "Close wardrobe",
 *     "Open detergent drawer" — or, without one, a door or a drawer, by
 *     its type, as it always was.
 *
 * Everything else about the piece stays put, and is merged, published and
 * baked with the house; these parts are left out of all of that and drawn
 * live (SceneBuilder.staticOptions), so the inside of a cupboard is baked
 * as it is seen with its door open, and shut, the door hides it. They are
 * in no collision tree either (Collision.isTransient): the piece is met as
 * the rest of it and a box for each of them where it stands shut
 * (shutParts, SceneBuilder.collisionOf) — but for a way in (`wayIn`: a
 * shower's glass door), which is not in front of a carcass to be kept out
 * of but of somewhere to step into: it bars the way as a room's door's leaf
 * does, shut and until it is open BLOCKS_BELOW (getBlockers,
 * SceneBuilder.resolveDoorCollisions), and is walked through once it is.
 *
 * A part opens as far as nothing stands in its way, as a real door swung
 * into a chair stops at the chair: the furniture is where the space puts
 * it, and two pieces placed near each other — a dining chair before the
 * fridge under a counter, a nightstand before a wardrobe, a ceiling track's
 * spots before the cupboards up to the ceiling, a WC beside a vanity's
 * drawers — leave less room than a part's whole swing or slide. So as it
 * starts to open it is tried, pose by pose, against the collision trees —
 * the building, the furniture as it collides, the garden's trees — but its
 * own piece, and opens as far as it meets nothing (Openable.plan,
 * `reach`): worked out once for the trees as they stand, and again when
 * they change (a piece moved in the editor).
 *
 * A piece can also carry a light inside it (`userData.fixture.light`: a
 * fridge's): lit, as a small light with no shadow and a short reach,
 * shining the way it is aimed, as far as its doors are open — the doors
 * labelled as a fridge's where the piece has any (a kitchen with its fridge
 * in one of its tall units: its cupboards and the freezer below leave the
 * fridge's light off), else any of the piece's.
 *
 * Not a light of its own each, though: one light, of each kind there is
 * (aimed, a spot; not, a point), lent to whichever fridge was opened last
 * of those open (`pool`, update). Every light in the scene is reckoned with
 * by every lit surface drawn, at every pixel, whether it shines or not —
 * three counts the lights that are there, not those that are lit — and
 * Ladonia's fifteen kitchens, a fridge's light each, all shut, drew a frame
 * of its kitchen in 20 ms that took 14 without them (2026-10-16). Nor a
 * light that comes and goes with its fridge: a light more or less is every
 * lit material's shader made again, all of them at once, the first time a
 * fridge is opened. One that stays, lent round, costs what one fridge's
 * did, and nothing is made again.
 *
 * Nor is that one there while every fridge is shut, as they nearly always
 * are: a light at nothing still costs every lit pixel what a lit one does —
 * the one spot lent round cost a frame of A1's living room 0.2 ms from the
 * bake at the highest step, each lit material's lights worked through for
 * a fridge shut in the next room (2026-10-16). So a kind's light is out of
 * the scene's light (hidden) until a light of its kind is to be lit, and
 * comes in as World/LampPool.js's lamps do: once the shaders for the scene
 * with it in have been built ahead (`prepare`, Renderer.prepareLights), a
 * few at a time between frames — the first time in a visit, a moment
 * after the door starts to open, which is spent ahead while a part of its
 * piece is aimed at (warm) — and back out LINGER seconds after the last of
 * its kind has gone out. In, or out: two states, each one's shaders built
 * once, and coming back to either costs nothing to build.
 *
 * Nothing here needs a page: the module is taken into node as it is
 * (scripts/test-openables.mjs), where a light comes in at once.
 */

/** How long a part takes to open or close, as a share of it a second. */
const SPEED = 2.2;
/** The label of the doors a light inside a piece follows, where the piece has any (link). */
const FRIDGE = "fridge";
/**
 * How long a kind's light lent to the lights inside pieces stays in the
 * scene's light after the last of its kind has gone out, in seconds (admit):
 * a fridge shut and opened again, or the next one along, finds it in.
 */
const LINGER = 4;
/** The kinds of light lent to the lights inside pieces (`pool`): aimed, and not. */
const KINDS = ["spot", "point"];
/** The least a part's box is thick, in metres: a pane of glass modelled as a plane is still a box, not a sheet with sides of no area. */
const THINNEST = 0.01;
/** The labels of the parts that are a way in, not a front: walked through once open (wayIn). */
const WAYS_IN = new Set(["shower door"]);
/** A way in bars the way until it is open this far, as a room's door does (Door.js's BLOCKING_THRESHOLD). */
const BLOCKS_BELOW = 0.3;
/**
 * What a part opening may touch and still go on, in metres: its box is
 * taken this much smaller all round (clearance). A neighbour placed hard
 * against its piece, a worktop a few millimetres over a drawer, a wall a
 * wardrobe stands against: touched, not in its way.
 */
const TOUCH = 0.004;
/**
 * How far, at most, the part's farthest corner moves from one pose it is
 * tried at to the next, in metres — thinner than any of it, so nothing it
 * would sweep through is passed over between two — and how many poses at
 * most; and how many times the last pose clear and the first that is not
 * are halved between, for where it stops.
 */
const STEP = 0.005;
const MOST_POSES = 240;
const HALVINGS = 7;
/** How big the cells of a part's frame are, in metres, that its meshes are boxed by, piece by piece, for what is in its way (shapeOf). */
const CELL = 0.1;

/** Whether a part's node is a way in — a shower's glass door — by its model's label (WAYS_IN). */
export function isWayIn(node) {
    const label = node?.userData?.opens?.label;
    return typeof label === "string" && WAYS_IN.has(label.trim().toLowerCase());
}

const _turn = new THREE.Quaternion();
const _rest = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _inverse = new THREE.Matrix4();
const _matrix = new THREE.Matrix4();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _least = new THREE.Vector3(THINNEST, THINNEST, THINNEST);
const _plan = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _basis = new THREE.Matrix4();
/** A triangle at a pose (meetsAt): its corners, nine numbers, in the part's frame, and about one of its boxes' middle. */
const _local = new Float64Array(9);
const _corners = new Float64Array(9);
/** A part's triangle's corners, in its frame (shapeOf). */
const _corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
/** ...and its edges. */
const _edges = new Float64Array(9);

/**
 * A kind's light's way in or out of the scene's light (Openables.admit,
 * warm): `coming`, the shaders for the scene with it in being built ahead
 * of it; `warming`, the same with it left out; `warmed`, how many shaders
 * the view had when they were last built so — built again only if it has
 * more since; `idle`, how long it has been in with nothing of its kind lit,
 * in seconds.
 */
function admission() {
    return { coming: null, warming: null, warmed: -1, idle: 0 };
}

/** Three numbers as a vector, or `fallback` where they are not three finite numbers. */
function vectorOf(value, fallback) {
    const ok = Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));
    return new THREE.Vector3(...(ok ? value : fallback));
}

export class Openable {
    /**
     * @param {THREE.Object3D} node  the part: its origin its hinge, or where it slides from
     * @param {string} piece  which piece it is part of
     */
    constructor(node, piece) {
        this.node = node;
        this.piece = piece;
        this.opens = node.userData.opens;
        /** Which it is, for the touch button's icon: a drawer slides; a door — a cupboard's, a fridge's, a flap — swings. */
        this.kind = this.opens.type === "slide" ? "drawer" : "door";
        const label = typeof this.opens.label === "string" ? this.opens.label.trim() : "";
        /** What the prompt calls it ("Open fridge"): the model's word, or its kind's. */
        this.label = label || this.kind;
        this.restPosition = node.position.clone();
        this.restQuaternion = node.quaternion.clone();
        this.direction = vectorOf(this.opens.direction, [0, 0, 1]);
        const axis = vectorOf(this.opens.axis, [0, 1, 0]);
        /** What a door swings about, in its parent's frame: up, unless the model says otherwise. */
        this.axis = axis.lengthSq() > 1e-12 ? axis.normalize() : axis.set(0, 1, 0);
        /** A way in (a shower's door): it bars the way itself while shut (getBlockers), and has no box in any tree. */
        this.wayIn = isWayIn(node);
        this.open = 0;
        this.target = 0;
        /**
         * How much of its swing or its slide it opens, fully open: all of it,
         * or as far as it goes before it meets something (plan) — `open` is
         * a share of that.
         */
        this.reach = 1;
        /** What is in its way, by how the trees stood when last asked (plan): `{ key, reach, met }`. */
        this.planned = null;
        /**
         * Its reach as a publish worked it out (Publish/Runtime.js, on its
         * holder), which a public view takes as it is: or null, in the
         * editor and a version published before it.
         */
        const published = node.userData.reach;
        this.published = Number.isFinite(published) ? THREE.MathUtils.clamp(published, 0, 1) : null;
        /** The parts it is one of (Openables.add), for what it is opened against: their `room`. */
        this.owner = null;
    }

    toggle() {
        this.setOpen(this.target <= 0.5);
        return this.target > 0.5;
    }

    setOpen(open) {
        // Opened from shut, as far as nothing is in its way; caught on its way shut, as far as it was going.
        if (open && this.target <= 0.5 && this.open < 0.001) this.reach = this.plan();
        this.target = open ? 1 : 0;
    }

    /** Open, or on its way: what toggling it would undo. */
    get isOpening() {
        return this.target > 0.5;
    }

    get isMoving() {
        return Math.abs(this.open - this.target) > 0.001;
    }

    update(delta) {
        if (!this.isMoving) return false;
        // Stopped short by something in its way, it sets off as quickly as it would have, and settles sooner.
        const step = (SPEED * delta) / Math.max(this.reach, 0.05);
        const diff = this.target - this.open;
        this.open += Math.sign(diff) * Math.min(Math.abs(diff), step);
        // Within a thousandth of where it was going, there: exactly. A step that left it a hair from shut left it so for
        // good — 0.2° out on a door, no longer moving — and shut is its rest pose to the last digit, by which the editor's
        // stand-ins and a public view draw it with the rest of its piece (World/StandIns.js, World/ShutBatcher.js).
        if (Math.abs(this.target - this.open) <= 0.001) this.open = this.target;
        this.place();
        return true;
    }

    /** Where it is, eased so it settles rather than stopping dead: against what is in its way, too. */
    place() {
        const eased = 1 - Math.pow(1 - this.open, 2);
        this.pose(eased * this.reach);
    }

    /** Placed at a share of its whole swing or slide. */
    pose(share) {
        if (this.opens.type === "slide") {
            this.node.position.copy(this.restPosition).addScaledVector(this.direction, share * this.opens.distance);
        } else {
            this.node.quaternion.copy(this.restQuaternion).premultiply(_turn.setFromAxisAngle(this.axis, share * this.opens.angle));
        }
    }

    /**
     * The way it moves said in another frame, `turn` from the one it was
     * said in: a published view's part stands in the world, under no piece
     * (Publish/Runtime.js), and its model says its slide and its hinge in
     * its piece's frame.
     *
     * @param {THREE.Quaternion} turn
     */
    turnFrame(turn) {
        this.direction.applyQuaternion(turn);
        this.axis.applyQuaternion(turn).normalize();
        return this;
    }

    /**
     * A way in, still shut enough to bar the way: the box round it where it
     * stands shut, in the world, as Door.getBlockers gives a room door's
     * leaf — `{ centre, quaternion, half }` — for Door.resolveCapsule to
     * push the visitor out of. None once it is open BLOCKS_BELOW — of its
     * whole swing: one stopped short by something in its way may not get
     * that far — nor for a part that is not a way in.
     */
    getBlockers() {
        if (!this.wayIn || this.open * this.reach >= BLOCKS_BELOW || !this.node.parent) return [];
        this.box ??= ownBox(this.node);
        if (this.box.isEmpty()) return [];
        this.node.parent.updateWorldMatrix(true, false);
        _rest.compose(this.restPosition, this.restQuaternion, this.node.scale).premultiply(this.node.parent.matrixWorld);
        const quaternion = new THREE.Quaternion();
        _rest.decompose(_centre, quaternion, _scale);
        const centre = this.box.getCenter(new THREE.Vector3()).applyMatrix4(_rest);
        const half = this.box.getSize(new THREE.Vector3()).max(_least).multiply(_scale.set(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z))).multiplyScalar(0.5);
        return [{ centre, quaternion, half }];
    }

    /** Back as it was modelled, shut, at once. */
    reset() {
        this.open = this.target = 0;
        this.node.position.copy(this.restPosition);
        this.node.quaternion.copy(this.restQuaternion);
    }

    // ------------------------------------------------------------------
    // What is in its way
    // ------------------------------------------------------------------

    /**
     * How much of its swing or slide it can open (`reach`): all of it where
     * nothing in the collision trees is in its way, else as far as it goes
     * before it meets the first thing that is — not its own piece's, which
     * it is made to clear. Worked out once for the trees as they stand
     * (each tree's revision: a piece moved in the editor is a new one), as
     * a window's sash is (Sash.plan). In a public view, as the publish
     * worked it out, where it did. Without its Openables' `room`, all of it.
     */
    plan() {
        if (this.published !== null) return this.published;
        const room = this.owner?.room;
        const collision = room?.collision;
        if (!collision) return 1;
        const revision = collision.revision ?? {};
        const key = `${revision.static}/${revision.dynamic}/${revision.outdoor}`;
        if (this.planned?.key !== key) {
            const { reach, met } = this.clearance([collision.static, collision.dynamic, collision.outdoor], room.own?.(this) ?? null);
            // (What it was, for whoever asks why: a triangle's own label in a public view, its piece's or wall's in the editor's tree.)
            const named = met && (met.label ?? met.source?.label ?? met.source?.key?.userData?.label ?? met.source?.key?.name ?? "something");
            this.planned = { key, reach, met: named || null };
        }
        return this.planned.reach;
    }

    /**
     * How far it can open through `trees` (collision octrees, World/
     * Collision.js) — `{ reach, met }`: the share of its swing or slide,
     * and the first triangle in the way (null where none is).
     *
     * What it is (shapeOf): a box round each piece of it — its leaf, a pull,
     * a handle, a hinge's clamp — a little smaller all round (TOUCH), in its
     * own frame. Not the one box round all of it: a wardrobe door's pull,
     * 4 cm proud at its free edge, made that box 4 cm deep at its hinge too,
     * and turned, it went into the wall the wardrobe stands against. It is
     * put at pose after pose of its opening — so close together that its
     * farthest corner moves no more than STEP from one to the next — and
     * met against the triangles of the trees round all of them, each taken
     * into its own frame at that pose, where its boxes are square to the
     * axes (triangleMeetsBox). Where one first meets it, the last pose clear
     * and that one are halved between, for the pose it stops at. A triangle
     * it meets already shut is not in its way: what it stands against, or
     * in, as placed. Nor is one of its own piece (`own`), which the piece is
     * made to clear: its carcass, its worktop, its other parts' boxes.
     *
     * @param {object[]} trees
     * @param {((triangle: object) => boolean)|null} own  whether a triangle is its piece's
     */
    clearance(trees, own = null) {
        const node = this.node;
        if (!node.parent) return { reach: 1, met: null };
        this.shape ??= shapeOf(node);
        const shape = this.shape;
        if (!shape) return { reach: 1, met: null };
        const slide = this.opens.type === "slide";
        const whole = slide ? this.opens.distance : this.opens.angle;
        if (!Number.isFinite(whole) || whole === 0) return { reach: 1, met: null };

        // A pose, a share of the whole way: what takes a point in the parent's
        // frame, less the part's rest position, into the part's own — its
        // turn, and for a drawer where it has slid to (poseAt).
        node.parent.updateWorldMatrix(true, false);
        const toParent = new THREE.Matrix4().copy(node.parent.matrixWorld).invert();
        const scale = node.scale;
        const restInverse = this.restQuaternion.clone().invert();
        const pose = { m: new Float64Array(9), t: new Float64Array(3) };
        const poseAt = (share) => {
            const turn = slide ? restInverse : _plan.copy(restInverse).multiply(_turn.setFromAxisAngle(this.axis, -share * whole));
            const e = _basis.makeRotationFromQuaternion(turn).elements;
            const sx = 1 / scale.x;
            const sy = 1 / scale.y;
            const sz = 1 / scale.z;
            // Row by row: m = S⁻¹ · R, three's elements being column by column.
            const m = pose.m;
            m[0] = e[0] * sx;
            m[1] = e[4] * sx;
            m[2] = e[8] * sx;
            m[3] = e[1] * sy;
            m[4] = e[5] * sy;
            m[5] = e[9] * sy;
            m[6] = e[2] * sz;
            m[7] = e[6] * sz;
            m[8] = e[10] * sz;
            // A drawer slid `share` of the way: the point taken back by as much before it is turned.
            const d = slide ? share * whole : 0;
            const ox = -this.direction.x * d;
            const oy = -this.direction.y * d;
            const oz = -this.direction.z * d;
            pose.t[0] = m[0] * ox + m[1] * oy + m[2] * oz;
            pose.t[1] = m[3] * ox + m[4] * oy + m[5] * oz;
            pose.t[2] = m[6] * ox + m[7] * oy + m[8] * oz;
            return pose;
        };

        // How many poses: as many as keep its farthest corner within STEP of where it was.
        const box = shape.whole;
        let far = 0;
        for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
                for (const z of [box.min.z, box.max.z]) far = Math.max(far, _v.set(x * scale.x, y * scale.y, z * scale.z).length());
            }
        }
        const travel = Math.abs(whole) * (slide ? this.direction.length() : far);
        const poses = Math.min(MOST_POSES, Math.max(2, Math.ceil(travel / STEP)));

        // The world's box round every pose (and a step more), for the trees' cells to look in.
        const region = new THREE.Box3();
        const world = new THREE.Matrix4();
        for (let k = 0; k <= poses; k++) {
            const share = k / poses;
            _q.copy(this.restQuaternion);
            _p.copy(this.restPosition);
            if (slide) _p.addScaledVector(this.direction, share * whole);
            else _q.premultiply(_turn.setFromAxisAngle(this.axis, share * whole));
            world.compose(_p, _q, scale).premultiply(node.parent.matrixWorld);
            region.union(_box.copy(box).applyMatrix4(world));
        }
        region.expandByScalar(STEP);

        // A door swings within a cylinder round its hinge: as far from the
        // axis as its farthest corner, and along it as far as it reaches.
        // Whatever is wholly beyond either is never met (outOfSwing).
        const cylinder = slide ? null : swingOf(box, this.restQuaternion, scale, this.axis);

        // The triangles round it, as nine numbers each in the parent's frame less the rest position...
        const candidates = [];
        const rest = this.restPosition;
        for (const tree of trees) {
            if (!tree) continue;
            for (const triangle of uniqueTriangles(tree, region)) {
                const { a, b, c } = triangle;
                if (Math.max(a.x, b.x, c.x) < region.min.x || Math.min(a.x, b.x, c.x) > region.max.x) continue;
                if (Math.max(a.y, b.y, c.y) < region.min.y || Math.min(a.y, b.y, c.y) > region.max.y) continue;
                if (Math.max(a.z, b.z, c.z) < region.min.z || Math.min(a.z, b.z, c.z) > region.max.z) continue;
                const points = new Float64Array(9);
                for (const [i, point] of [a, b, c].entries()) {
                    _v.copy(point).applyMatrix4(toParent).sub(rest);
                    points[i * 3] = _v.x;
                    points[i * 3 + 1] = _v.y;
                    points[i * 3 + 2] = _v.z;
                }
                if (cylinder && outOfSwing(points, cylinder)) continue;
                if (own?.(triangle)) continue;
                candidates.push({ triangle, points });
            }
        }
        // ...but those it meets already, shut.
        const shut = poseAt(0);
        const inWay = candidates.filter(({ points }) => !meetsAt(points, shut, shape));
        if (!inWay.length) return { reach: 1, met: null };

        const firstMet = (share) => {
            const at = poseAt(share);
            for (const candidate of inWay) if (meetsAt(candidate.points, at, shape)) return candidate.triangle;
            return null;
        };
        for (let k = 1; k <= poses; k++) {
            const hit = firstMet(k / poses);
            if (!hit) continue;
            // Between the last pose clear and this one, halved: where it stops.
            let clear = (k - 1) / poses;
            let blocked = k / poses;
            let first = hit;
            for (let i = 0; i < HALVINGS; i++) {
                const middle = (clear + blocked) / 2;
                const found = firstMet(middle);
                if (found) {
                    blocked = middle;
                    first = found;
                } else clear = middle;
            }
            return { reach: clear, met: first };
        }
        return { reach: 1, met: null };
    }
}

export default class Openables {
    /**
     * @param {object} [options]
     * @param {object} [options.world]  whose plain light (World/PlainLight.js) a piece's light is kept out of, and
     *        whose renderer builds the shaders ahead of one coming in (Renderer.prepareLights)
     * @param {(lights: THREE.Light[]) => Promise} [options.prepare]  in place of the world's renderer's: what builds
     *        the lit materials' shaders for the scene with `lights` in it, before they are shown (admit)
     */
    constructor({ world = null, prepare = null } = {}) {
        this.world = world;
        const renderer = world?.experience?.renderer;
        /**
         * What builds the shaders ahead of a kind's light coming in — paced, a frame at a time where the browser has to
         * build them (Renderer.prepareLights): nobody waits on a fridge's light as they do on a room's, and the frames
         * go on at their pace meanwhile; without one (node), it comes in at once.
         */
        this.prepare = prepare ?? (renderer?.prepareLights ? (lights) => renderer.prepareLights(lights, { paced: true }) : null);
        /** Each kind's light on its way in or out of the scene's light (admit, warm). */
        this.admitted = { spot: admission(), point: admission() };
        /** every part that opens */
        this.parts = [];
        /** ...of which the ways in (a shower's door: Openable.wayIn), for SceneBuilder.resolveDoorCollisions */
        this.waysIn = [];
        /** each part by its node, for `of` */
        this.byNode = new Map();
        /**
         * The lights inside pieces: `{ fixture, piece, power, color, reach,
         * aim, doors, intensity, since }` — `intensity` how bright it is as
         * its doors stand, `since` when it was last opened (update).
         */
        this.lights = [];
        /** The one light of each kind lent to them: `spot` for those aimed, `point` for the others (pool). */
        this.pool = { spot: null, point: null };
        /** Whether each light's `doors` are worked out for the parts there are now (link). */
        this.linked = false;
        /** Counts the fridges opened, for which was opened last (update). */
        this.clock = 0;
        /**
         * What the parts open against (Openable.plan): `{ collision, own }` —
         * the world's collision trees (World/Collision.js), and `own(part)`,
         * which of their triangles are of the part's own piece, as a test of
         * a triangle (SceneBuilder.ownTriangles). Without it, every part
         * opens all the way, whatever is in its way.
         */
        this.room = null;
    }

    /**
     * Take on a piece's parts that open, and its lights.
     *
     * @param {THREE.Object3D} root  the piece, or a group of parts
     * @param {string} [piece]  which piece they are all part of; by default
     *        each part's own `userData.piece`, or the root's id
     */
    add(root, piece = null) {
        root.traverse((node) => {
            const id = piece ?? node.userData.piece ?? root.userData.id ?? root.uuid;
            if (node.userData?.opens && !this.byNode.has(node)) {
                const part = new Openable(node, id);
                part.owner = this;
                this.parts.push(part);
                if (part.wayIn) this.waysIn.push(part);
                this.byNode.set(node, part);
                this.linked = false;
                node.traverse((mesh) => {
                    // It moves, so its shadow is drawn live, not baked.
                    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
                    // What is under it moves with it, never within it: its frame worked out once, not at each of
                    // the frame's renders — a public view draws the scene three times a frame, and Ladonia's parts
                    // are 843 meshes (World/ShutBatcher.js). Moved with the part, its world matrix still follows.
                    if (mesh !== node) {
                        mesh.updateMatrix();
                        mesh.matrixAutoUpdate = false;
                    }
                });
            }
            const light = node.userData?.fixture?.light;
            if (light && !this.lights.some((entry) => entry.fixture === node)) {
                const aim = Array.isArray(light.aim) ? vectorOf(light.aim, [0, -1, 0]) : null;
                const entry = { fixture: node, piece: id, power: light.power ?? 2, color: light.color ?? "#ffffff", reach: light.reach ?? 1.5, aim, doors: [], intensity: 0, since: 0 };
                this.lights.push(entry);
                // The first of its kind: the kind's light made, and put at it until another is opened.
                const kind = aim ? "spot" : "point";
                if (!this.pool[kind]) this.lend(this.lamp(kind), entry);
                this.linked = false;
            }
        });
    }

    /**
     * The light lent to the lights inside pieces of a kind (pool): shining
     * the way the one it is lent to is aimed — a spot, as a light in a
     * fridge shines down on its shelves and out of its door, not back
     * through its walls — or, for those not aimed, every way. No shadow.
     * Made once, at nothing, and kept — out of the scene's light (hidden)
     * until a light of its kind is lit (admit).
     */
    lamp(kind) {
        const lamp = kind === "spot" ? new THREE.SpotLight("#ffffff", 0, 1.5, Math.PI / 3, 0.7, 2) : new THREE.PointLight("#ffffff", 0, 1.5, 2);
        lamp.visible = false;
        // Under the editor's plain light (World/PlainLight.js) it lights nothing.
        this.world?.plainLight?.keepOut(lamp);
        this.pool[kind] = lamp;
        return lamp;
    }

    /**
     * Its kind's light put where a piece's light is (`entry`), as that one
     * is made: in the frame of the fixture's parent, at the fixture, aimed
     * `aim` from it — or, not aimed, on the fixture itself — its colour and
     * its reach.
     */
    lend(lamp, entry) {
        const node = entry.fixture;
        if (lamp.userData.lent === entry) return;
        lamp.userData.lent = entry;
        lamp.name = `inside:${entry.piece}`;
        lamp.color.set(entry.color);
        lamp.distance = entry.reach;
        if (lamp.isSpotLight) {
            lamp.position.copy(node.position);
            lamp.target.position.copy(node.position).add(entry.aim);
            if (node.parent) node.parent.add(lamp, lamp.target);
        } else {
            lamp.position.set(0, 0, 0);
            node.add(lamp);
        }
        // Where it hangs now, at once: the piece it is lent to may be passed over by three's walk of the scene, held
        // still while the editor's stand-ins draw it (World/StandIns.js's hold), or held still in a public view.
        lamp.updateMatrixWorld(true);
        lamp.target?.updateMatrixWorld(true);
    }

    /** Let go of everything under `root`, as a piece is taken away. */
    remove(root) {
        const under = new Set();
        root.traverse((node) => under.add(node));
        this.parts = this.parts.filter((part) => {
            if (!under.has(part.node)) return true;
            this.byNode.delete(part.node);
            return false;
        });
        this.waysIn = this.waysIn.filter((part) => !under.has(part.node));
        this.lights = this.lights.filter((entry) => !under.has(entry.fixture));
        // A light lent to one of them goes to another of its kind, or, with none left, away.
        for (const kind of KINDS) {
            const lamp = this.pool[kind];
            if (!lamp || !under.has(lamp.userData.lent?.fixture)) continue;
            lamp.userData.lent = null;
            lamp.intensity = 0;
            const next = this.lights.find((entry) => (kind === "spot") === Boolean(entry.aim));
            if (next) {
                this.lend(lamp, next);
                continue;
            }
            lamp.target?.removeFromParent();
            lamp.removeFromParent();
            lamp.dispose();
            this.pool[kind] = null;
            // (A light of its kind made later comes in as this one first did.)
            this.admitted[kind] = admission();
        }
        this.linked = false;
    }

    /** The part `object` is, or is part of — a door's handle is its door's. */
    of(object) {
        for (let node = object; node; node = node.parent) {
            if (node.userData?.opens) return this.byNode.get(node) ?? null;
        }
        return null;
    }

    /**
     * Which doors each light inside a piece follows: those of its piece
     * labelled as a fridge's, where it has any — a kitchen's fridge is one
     * of its tall units, with a freezer under it and cupboards beside it —
     * else every part of its piece (a fridge of its own, as before).
     */
    link() {
        for (const entry of this.lights) {
            const own = this.parts.filter((part) => part.piece === entry.piece);
            const fridge = own.filter((part) => part.label.toLowerCase() === FRIDGE);
            entry.doors = fridge.length ? fridge : own;
        }
        this.linked = true;
    }

    update(delta) {
        let moved = false;
        for (const part of this.parts) moved = part.update(delta) || moved;
        if (moved || this.lightsStale) {
            this.lightsStale = false;
            this.relight();
        }
        // (A kind's light in with nothing of its kind lit: on its way out, LINGER seconds on.)
        for (const kind of KINDS) {
            const lamp = this.pool[kind];
            if (lamp?.visible && !(lamp.intensity > 0)) this.admit(kind, false, delta);
        }
    }

    /** The lights inside pieces as their doors stand now, and each kind's light lent to the one it lights (update). */
    relight() {
        if (!this.linked) this.link();
        // A light inside a piece is on as far as the doors it follows are open.
        for (const entry of this.lights) {
            let open = 0;
            for (const part of entry.doors) open = Math.max(open, part.open);
            const intensity = (entry.power / (4 * Math.PI)) * Math.min(1, open * 3);
            if (intensity > 0 && !(entry.intensity > 0)) entry.since = ++this.clock;
            entry.intensity = intensity;
        }
        // Each kind's light lent to the one of its kind opened last of those lit — or, none lit, out where it is.
        for (const kind of KINDS) {
            const lamp = this.pool[kind];
            if (!lamp) continue;
            let lit = null;
            for (const entry of this.lights) {
                if ((kind === "spot") !== Boolean(entry.aim) || !(entry.intensity > 0)) continue;
                if (!lit || entry.since > lit.since) lit = entry;
            }
            if (lit) this.lend(lamp, lit);
            lamp.intensity = lit ? lit.intensity : 0;
            this.admit(kind, Boolean(lit), 0);
        }
    }

    /**
     * A kind's light into the scene's light, or out of it: in once one of
     * its kind is to be lit — at once where the shaders for the scene with
     * it in are not this module's to build (`prepare`: none, in node), else
     * once they are, its intensity meanwhile its own to follow the doors,
     * shown when they are built if anything of its kind still is lit — and
     * out once nothing of its kind has been lit for LINGER seconds, where
     * the scene's shaders without it are those it had before it came in.
     *
     * @param {"spot"|"point"} kind
     * @param {boolean} wanted  whether a light of its kind is lit now
     * @param {number} delta  seconds since the last frame, for how long it has been in unlit
     */
    admit(kind, wanted, delta) {
        const lamp = this.pool[kind];
        const state = this.admitted[kind];
        if (!lamp) return;
        if (!wanted) {
            if (!lamp.visible) return;
            state.idle += delta;
            if (state.idle >= LINGER) {
                lamp.visible = false;
                state.idle = 0;
            }
            return;
        }
        state.idle = 0;
        if (lamp.visible || state.coming) return;
        if (!this.prepare) {
            lamp.visible = true;
            return;
        }
        state.coming = this.prepare([lamp]).then(() => {
            state.coming = null;
            state.warmed = this.shaders();
            // (Still this kind's light — a piece taken away may have taken it — and still something of its kind to light.)
            if (this.pool[kind] !== lamp || !(lamp.intensity > 0)) return;
            lamp.visible = true;
            // (The editor draws only when something has changed: Pace.js.)
            this.world?.experience?.wake?.("fridge light");
        });
    }

    /** How many shaders the view has built (three's info), for whether what was built ahead may be wanting (warm). */
    shaders() {
        return this.world?.experience?.renderer?.renderer?.info?.programs?.length ?? 0;
    }

    /**
     * The shaders for the scene with the light of a piece's kind in it,
     * built ahead while it is out (`prepare`, the light left hidden): one
     * of the piece's parts is aimed at, about to be opened (World/
     * Interactables.js's openable provider) — so that a fridge lights up as
     * its door swings, not a moment after. Once for the shaders the view
     * has, and again once it has built more (what has come into it since,
     * another time of day), which finds the rest built.
     *
     * @param {Openable} part
     */
    warm(part) {
        if (!this.prepare || !part) return;
        for (const entry of this.lights) if (entry.piece === part.piece) this.warmKind(entry.aim ? "spot" : "point");
    }

    /**
     * That, for every kind of light there is, whatever is aimed at: as a
     * public view has settled after it is first drawn (SceneBuilder's
     * drawLight, after the shut parts' own shaders), so that the GPU's
     * first draw with each — tens of milliseconds a program, ninety of
     * them for Ladonia's spot, which drawn in one turn stopped a frame for
     * 0.36 s — is spent while the visitor is still finding their feet, as
     * it was when the light was always there, not at their first fridge.
     */
    warmAll() {
        if (!this.prepare) return Promise.resolve();
        return Promise.all(KINDS.map((kind) => this.warmKind(kind)));
    }

    /** A kind's light's shaders built ahead (warm, warmAll), unless it is in, on its way, or built for the shaders there are. */
    warmKind(kind) {
        const lamp = this.pool[kind];
        const state = this.admitted[kind];
        if (!lamp || lamp.visible || state.coming) return state.coming ?? null;
        if (state.warming || state.warmed === this.shaders()) return state.warming;
        state.warming = this.prepare([lamp]).then(() => {
            state.warming = null;
            state.warmed = this.shaders();
        });
        return state.warming;
    }

    /** How bright the light inside a piece is now, as its doors stand (0, shut) — lit or not by the light lent round (update). */
    lightOf(piece) {
        return this.lights.find((entry) => entry.piece === piece)?.intensity ?? 0;
    }

    /** The first part still moving: its kind ("door", "drawer"), or null — for the editor's frames on demand (Pace.js). */
    busy() {
        for (const part of this.parts) if (part.isMoving) return part.kind;
        return null;
    }

    /** Every part shut, at once — as it is published. */
    resetAll() {
        for (const part of this.parts) part.reset();
        this.lightsStale = true;
    }
}

// ---------------------------------------------------------------------
// Shut, for collision
// ---------------------------------------------------------------------

/**
 * A piece's parts that open, each where it stands shut: `{ node, part,
 * matrix, box, wayIn }` — `matrix` the part's frame in the world, its piece
 * where it stands now and it at its rest (its Openable's, or as it stands if
 * it has none yet), `box` round everything drawn under it, in that frame;
 * `wayIn`, whether it is a way in (isWayIn), which has no box in a tree.
 *
 * What a piece with such parts collides as (SceneBuilder.collisionOf): its
 * parts are in no tree, since they move, so the piece is met as the rest of
 * it — its carcass, its shelves, its worktop — and each part as a box where
 * it stands shut. Met as its whole box instead, as it was until 2026-10-16,
 * an L- or U-shaped kitchen walled off the floor inside its arms; met as
 * its mesh alone, a visitor walked through an open door into the hollow
 * carcass behind it. A box stays where the door or drawer is shut whether
 * it is open or not: what is behind an open door is still not walked into,
 * and an open door, like a room's door swung open, is walked through.
 *
 * @param {THREE.Object3D} group  a placed piece
 * @param {Openables} [openables]  where its parts' rest poses are kept
 * @returns {{ node: THREE.Object3D, part: Openable|null, matrix: THREE.Matrix4, box: THREE.Box3 }[]}
 */
export function shutParts(group, openables = null) {
    const nodes = [];
    const visit = (node) => {
        if (node !== group && node.userData?.opens) {
            nodes.push(node);
            return;
        }
        for (const child of node.children) visit(child);
    };
    visit(group);
    if (!nodes.length) return nodes;

    group.updateWorldMatrix(true, true);
    const found = [];
    for (const node of nodes) {
        const box = ownBox(node);
        if (box.isEmpty()) continue;
        const part = openables?.byNode.get(node) ?? null;
        const rest = part ? new THREE.Matrix4().compose(part.restPosition, part.restQuaternion, node.scale) : node.matrix.clone();
        const matrix = node.parent ? rest.premultiply(node.parent.matrixWorld) : rest;
        found.push({ node, part, matrix, box, wayIn: isWayIn(node) });
    }
    return found;
}

/**
 * Round a piece as it stands shut, in its own frame — before its position,
 * turn and scale, as SceneBuilder's localBox is: everything drawn under it
 * but its parts that open, and each of those shut (shutParts). A piece that
 * collides as its box is not met as one with a drawer standing open when
 * the box was taken.
 *
 * @param {THREE.Object3D} group  the piece, its world matrices up to date (shutParts brings them so)
 * @param {object[]} parts  its shutParts
 */
export function shutBox(group, parts) {
    _inverse.copy(group.matrixWorld).invert();
    const box = new THREE.Box3();
    const skip = new Set(parts.map(({ node }) => node));
    const visit = (node) => {
        if (skip.has(node) || (node !== group && node.userData?.opens)) return;
        if (node.isMesh && node.geometry && !node.userData?.helper) {
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            box.union(_box.copy(node.geometry.boundingBox).applyMatrix4(_matrix.multiplyMatrices(_inverse, node.matrixWorld)));
        }
        for (const child of node.children) visit(child);
    };
    visit(group);
    for (const { matrix, box: own } of parts) box.union(_box.copy(own).applyMatrix4(_matrix.multiplyMatrices(_inverse, matrix)));
    return box;
}

/**
 * A part's box, shut, as a mesh of its own where it stands in the world —
 * what the tree is made from for it, as SceneBuilder's boxProxy is for a
 * piece met as its box — named as its piece is, so the crosshair of a
 * public view says what it is part of and aims at the part through it
 * (Player.updateLookTarget).
 *
 * @param {{ matrix: THREE.Matrix4, box: THREE.Box3 }} shut  one of shutParts
 * @param {string} [label]  its piece's
 */
export function shutProxy({ matrix, box }, label) {
    box.getSize(_size).max(_least);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(_size.x, _size.y, _size.z));
    box.getCenter(_centre);
    _matrix.makeTranslation(_centre.x, _centre.y, _centre.z).premultiply(matrix);
    _matrix.decompose(proxy.position, proxy.quaternion, proxy.scale);
    if (label !== undefined) proxy.userData.label = label;
    return proxy;
}

/**
 * What is drawn under a part, in its own frame: from its meshes' own
 * matrices down from it, not from the world's, so that the part's pose —
 * open or shut — changes not one digit of it, and a tree's stamp for it
 * stays the same however far it is open (SceneBuilder.dynamicCollisionSources).
 */
function ownBox(node) {
    const box = new THREE.Box3();
    const visit = (object, within) => {
        if (object.isMesh && object.geometry && !object.userData?.helper) {
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            box.union(_box.copy(object.geometry.boundingBox).applyMatrix4(within));
        }
        for (const child of object.children) visit(child, new THREE.Matrix4().multiplyMatrices(within, child.matrix));
    };
    visit(node, new THREE.Matrix4());
    return box;
}

// ---------------------------------------------------------------------
// A triangle against a part's box
// ---------------------------------------------------------------------

/**
 * What a part is to what is in its way (Openable.clearance): a box round
 * each piece of each of its meshes — the triangles of a mesh by the
 * CELL-sized cell of its frame their middles are in — less those inside
 * another, and the box round them all; each `[cx, cy, cz, hx, hy, hz]`,
 * its middle and its half sizes, TOUCH smaller all round (never inside
 * out). In its own frame: from its meshes' own matrices down from it, as
 * ownBox is. Null for a part with nothing drawn.
 *
 * @param {THREE.Object3D} node
 * @returns {{ whole: THREE.Box3, all: Float64Array, pieces: Float64Array }|null}
 */
function shapeOf(node) {
    const whole = new THREE.Box3();
    const cells = new Map();
    let meshes = 0;
    const visit = (object, within) => {
        const position = object.isMesh && !object.userData?.helper ? object.geometry?.attributes.position : null;
        if (position) {
            const index = object.geometry.index;
            const count = index ? index.count : position.count;
            const mesh = meshes++;
            for (let i = 0; i + 2 < count; i += 3) {
                for (let k = 0; k < 3; k++) _corner[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(within);
                _v.copy(_corner[0]).add(_corner[1]).add(_corner[2]).divideScalar(3 * CELL).floor();
                const key = `${mesh}:${_v.x}:${_v.y}:${_v.z}`;
                let cell = cells.get(key);
                if (!cell) cells.set(key, (cell = new THREE.Box3()));
                for (const corner of _corner) {
                    cell.expandByPoint(corner);
                    whole.expandByPoint(corner);
                }
            }
        }
        for (const child of object.children) visit(child, new THREE.Matrix4().multiplyMatrices(within, child.matrix));
    };
    visit(node, new THREE.Matrix4());
    if (whole.isEmpty()) return null;
    // The biggest first, each kept unless one kept already holds it.
    const volume = (box) => box.getSize(_size).x * _size.y * _size.z;
    const kept = [];
    for (const box of [...cells.values()].sort((a, b) => volume(b) - volume(a))) {
        if (!kept.some((big) => _box.copy(big).expandByScalar(0.001).containsBox(box))) kept.push(box);
    }
    const pieces = new Float64Array(kept.length * 6);
    kept.forEach((box, i) => pieces.set(shrunk(box), i * 6));
    return { whole, all: shrunk(whole), pieces };
}

/**
 * The cylinder a door's swing stays in (Openable.clearance): round its
 * hinge's `axis` (in its parent's frame, through its rest position), as far
 * out as its box's farthest corner, and along the axis as far as the box
 * reaches either way — a point turning about the axis keeps both — with a
 * STEP more of each.
 */
function swingOf(box, restQuaternion, scale, axis) {
    let radius = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
                _v.set(x * scale.x, y * scale.y, z * scale.z).applyQuaternion(restQuaternion);
                const along = _v.dot(axis);
                lo = Math.min(lo, along);
                hi = Math.max(hi, along);
                radius = Math.max(radius, _v.addScaledVector(axis, -along).length());
            }
        }
    }
    return { axis, lo: lo - STEP, hi: hi + STEP, radius: radius + STEP };
}

/** Whether a triangle (nine numbers, about the hinge) is wholly outside a door's swing (swingOf): past either end of it, or farther from its axis. */
function outOfSwing(points, { axis, lo, hi, radius }) {
    let below = 0;
    let above = 0;
    for (let i = 0; i < 3; i++) {
        _corner[i].fromArray(points, i * 3);
        const along = _corner[i].dot(axis);
        if (along < lo) below++;
        else if (along > hi) above++;
        // Seen down the axis: the corner on the plane through the hinge square to it.
        _corner[i].addScaledVector(axis, -along);
    }
    if (below === 3 || above === 3) return true;
    // Seen so, the triangle round the axis — the axis inside it — is never wholly beyond reach.
    const [p, q, r] = _corner;
    const side = (u, w) => _a.subVectors(w, u).cross(_b.copy(u).negate()).dot(axis);
    const s0 = side(p, q);
    const s1 = side(q, r);
    const s2 = side(r, p);
    if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return false;
    const reach = radius * radius;
    return segmentFromAxis(p, q) > reach && segmentFromAxis(q, r) > reach && segmentFromAxis(r, p) > reach;
}

/** The square of how far the origin is from the segment u–w. */
function segmentFromAxis(u, w) {
    _a.subVectors(w, u);
    const length = _a.lengthSq();
    const t = length > 0 ? THREE.MathUtils.clamp(-u.dot(_a) / length, 0, 1) : 0;
    return _b.copy(u).addScaledVector(_a, t).lengthSq();
}

/** A box as its middle and its half sizes, TOUCH smaller all round (but never inside out): `[cx, cy, cz, hx, hy, hz]`. */
function shrunk({ min, max }) {
    const half = (lo, hi) => Math.max((hi - lo) / 2 - TOUCH, 0.0005);
    return Float64Array.of((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2, half(min.x, max.x), half(min.y, max.y), half(min.z, max.z));
}

/**
 * Whether a triangle meets a part at a pose (Openable.clearance): its
 * corners (`points`, nine numbers in the parent's frame less the part's
 * rest position) taken into the part's frame at the pose (`pose`: `m`, a
 * 3×3 matrix row by row, and `t`), and met against its shape's boxes there
 * (shapeOf) — the one round all of it first, which most miss.
 */
export function meetsAt(points, { m, t }, { all, pieces }) {
    for (let i = 0; i < 9; i += 3) {
        const x = points[i];
        const y = points[i + 1];
        const z = points[i + 2];
        _local[i] = m[0] * x + m[1] * y + m[2] * z + t[0];
        _local[i + 1] = m[3] * x + m[4] * y + m[5] * z + t[1];
        _local[i + 2] = m[6] * x + m[7] * y + m[8] * z + t[2];
    }
    if (!meetsBox(_local, all, 0)) return false;
    for (let i = 0; i < pieces.length; i += 6) if (meetsBox(_local, pieces, i)) return true;
    return false;
}

/** Whether a triangle in a part's frame meets one of its boxes, `boxes[at…at+5]` (shapeOf's middle and half sizes). */
function meetsBox(local, boxes, at) {
    for (let i = 0; i < 9; i += 3) {
        _corners[i] = local[i] - boxes[at];
        _corners[i + 1] = local[i + 1] - boxes[at + 1];
        _corners[i + 2] = local[i + 2] - boxes[at + 2];
    }
    return triangleMeetsBox(_corners, boxes[at + 3], boxes[at + 4], boxes[at + 5]);
}

/**
 * Whether a triangle (nine numbers) meets a box about the origin, square
 * to the axes, of half sizes `hx`, `hy`, `hz`: Akenine-Möller's test of
 * the axes that could part them — the box's three, the triangle's face,
 * and each of its edges across each of the box's.
 */
export function triangleMeetsBox(v, hx, hy, hz) {
    const x0 = v[0], y0 = v[1], z0 = v[2];
    const x1 = v[3], y1 = v[4], z1 = v[5];
    const x2 = v[6], y2 = v[7], z2 = v[8];
    // The box's own axes.
    if (Math.min(x0, x1, x2) > hx || Math.max(x0, x1, x2) < -hx) return false;
    if (Math.min(y0, y1, y2) > hy || Math.max(y0, y1, y2) < -hy) return false;
    if (Math.min(z0, z1, z2) > hz || Math.max(z0, z1, z2) < -hz) return false;
    // Each edge across each of the box's axes.
    const edges = _edges;
    edges[0] = x1 - x0;
    edges[1] = y1 - y0;
    edges[2] = z1 - z0;
    edges[3] = x2 - x1;
    edges[4] = y2 - y1;
    edges[5] = z2 - z1;
    edges[6] = x0 - x2;
    edges[7] = y0 - y2;
    edges[8] = z0 - z2;
    for (let e = 0; e < 9; e += 3) {
        const ex = edges[e];
        const ey = edges[e + 1];
        const ez = edges[e + 2];
        // Axis x × edge = (0, −ez, ey); y × edge = (ez, 0, −ex); z × edge = (−ey, ex, 0).
        if (parted(0, -ez, ey, v, hy * Math.abs(ez) + hz * Math.abs(ey))) return false;
        if (parted(ez, 0, -ex, v, hx * Math.abs(ez) + hz * Math.abs(ex))) return false;
        if (parted(-ey, ex, 0, v, hx * Math.abs(ey) + hy * Math.abs(ex))) return false;
    }
    // The triangle's face: its normal, the first edge across the third (reversed).
    const nx = edges[1] * -edges[8] - edges[2] * -edges[7];
    const ny = edges[2] * -edges[6] - edges[0] * -edges[8];
    const nz = edges[0] * -edges[7] - edges[1] * -edges[6];
    const d = nx * x0 + ny * y0 + nz * z0;
    return Math.abs(d) <= hx * Math.abs(nx) + hy * Math.abs(ny) + hz * Math.abs(nz);
}

/** Whether the triangle `v`, seen along an axis, lies wholly beyond the box's `radius` along it. */
function parted(ax, ay, az, v, radius) {
    const p0 = ax * v[0] + ay * v[1] + az * v[2];
    const p1 = ax * v[3] + ay * v[4] + az * v[5];
    const p2 = ax * v[6] + ay * v[7] + az * v[8];
    return Math.min(p0, p1, p2) > radius || Math.max(p0, p1, p2) < -radius;
}

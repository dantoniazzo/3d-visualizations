import * as THREE from "three";

import { mergeParts } from "./Builders/KitLibrary.js";
import { uniqueTriangles } from "./Collision.js";

/**
 * A window's sash that opens: the frame round one pane of a slim window,
 * its glass and its handle, hung in the window's fixed frame.
 *
 * WHICH WINDOWS OPEN (windowOpens). A slim window (`style: "slim"`) whose
 * sill is at least OPENS_FROM_SILL above its floor — Ladonia's win(), 45
 * windows of 59 panes — opens, a sash a pane. Floor-to-head glazing
 * (Ladonia's glazing(), sill 0.02) stays fixed, as the scripts that drew it
 * say it is; so does a window in a kit's frame (Wrenfield's, Ashgrove's),
 * which is moulded frame and sash in one ring (blender/lib/kit.py's
 * window_frame) and has no sash to hang. A window's `opens` says otherwise
 * where it is wanted: `{ type: "turn" | "tilt" | "fixed", hinge: "left" |
 * "right" }` (server/scene/validate.js; the editor's window properties).
 * No scene needs the field for the rule above.
 *
 * HOW. A sash turns in, as a casement does, 90° about the jamb nearer its
 * end of the window — a pair from the middle, a single one from its left —
 * or the jamb `hinge` names: `left` towards its wall's start, `right`
 * towards its end, as a door's swing names them
 * (.claude/skills/build-property-space/generator.md, Swing).
 * Where something stands in the way of that — a tap on the worktop under a
 * kitchen's window, a desk's lamp, a wardrobe beside it, whatever the
 * collision trees hold in the quarter of a cylinder its turn sweeps
 * through on the room's side (`sweep`, `blocked`) — it tilts in instead,
 * 10° about its bottom rail, which takes next to no room; and the prompt
 * says which it will be before it is pressed. `type: "tilt"` always tilts.
 * Inside is the side its frame is set back from: a slim window's frame
 * stands towards side A, outside (StructureBuilder.addWindow), so a sash
 * opens to side B as an inward door does.
 *
 * WHAT IT IS TO THE REST OF THE APP. It is built in its wall's frame and
 * hung in its wall's group, as a door's leaf is, and is told apart the same
 * way: its group says `hingeSide`, its meshes `doorLeaf`, so the merging,
 * a publish's snapshot and its glass, the editor's stand-ins and fit test,
 * the rays' index and the collision trees all leave it to draw and move by
 * itself (SceneBuilder.staticOptions, StandIns.scan, Collision.isTransient,
 * rays.js's movesAlone) — and nothing that lists the doors finds it: not
 * the bake's door states, nor the doors' probes, nor the nearest door E
 * opens. It carries its opening's tag, so the editor picks the window by
 * it. A public view hangs it again from its version's spec and runtime
 * file (SceneBuilder.buildFromRuntime), where the publish left its glass
 * out; a version published before windows opened keeps its glass fixed.
 *
 * COLLISION. The window's opening keeps an invisible pane of its own that
 * collides (StructureBuilder.addWindow), shut or open, so nobody climbs or
 * falls out of an open window — jumped at, the walker's head is 1.7 m up.
 * The sash collides with nothing, as a door's leaf swung open does not: a
 * fault you see, not one that bars the way. A sash made to open in a
 * window with a lower sill (its `opens`: a French window) has no pane
 * behind it, and bars the way itself while it is shut, tilted or barely
 * turned (`getBlockers`, Door.resolveCapsule), so once turned it is walked
 * through as a door is.
 *
 * Its state is the visitor's own, as a door's is: shut whenever the space
 * is built or published (`reset`).
 */

/** How high a slim window's sill must stand above its floor, in metres, for it to open with nothing saying so. */
export const OPENS_FROM_SILL = 0.3;
/** How a window can open (`opens.type`). */
export const WINDOW_OPENS = Object.freeze(["turn", "tilt", "fixed"]);
/** Which jamb a turning sash hangs on (`opens.hinge`): towards its wall's start or its end. */
export const WINDOW_HINGES = Object.freeze(["left", "right"]);

/** How far a sash turns in, and tilts in. */
export const TURN = Math.PI / 2;
export const TILT = THREE.MathUtils.degToRad(10);
/** How long a sash takes to open or close, as a share of it a second. */
const SPEED = 2;
/** Below this openness a turning sash of a low window still bars the way, as a door's leaf does. */
const BLOCKING = 0.3;
/** Past this openness (25° turned in, eased) a turning sash stands in the room, and its glass is drawn as glass there is (glazeInRoom). */
const IN_ROOM = 0.15;

/** The sash's sections: how wide each shows, how deep it is, and the gap round it in the frame. */
const FACE = 0.042;
export const SASH_DEPTH = 0.05;
const GAP = 0.003;
/** Its glass, as thick as the fixed pane it takes the place of. */
const GLASS_T = 0.015;

/**
 * What is looked for in a sash's way, in metres: as far again round it —
 * not along its hinge, where it reaches no further than itself (a bed's box
 * under a window stands a millimetre below its bottom rail, and is not in
 * its way); past the plane it opens to, the handle, which stands 3.6 cm
 * proud of its face to the room (on its lock stile, or the top rail of one
 * that only tilts), and so lies that far beyond its hinge's line turned in;
 * and how far into the room a thing must be to count — not the sash's own
 * place in the frame.
 */
const CLEARANCE = 0.01;
const PROUD = 0.04;
const INTO = 0.002;

const NONE = Object.freeze([]);
const _centre = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _inverse = new THREE.Matrix4();

/**
 * Whether a window opens, and how: `{ type: "turn" | "tilt", hinge: "left"
 * | "right" | null }` — `hinge` null where each pane hangs on the jamb
 * nearer its end of the window — or null for one that stays fixed.
 *
 * @param {object} opening  a wall's opening, as validated
 */
export function windowOpens(opening) {
    if (opening?.type !== "window" || opening.style !== "slim") return null;
    const asked = opening.opens?.type;
    const type = WINDOW_OPENS.includes(asked) ? asked : (opening.sill ?? 0) >= OPENS_FROM_SILL ? "turn" : "fixed";
    if (type === "fixed") return null;
    const hinge = WINDOW_HINGES.includes(opening.opens?.hinge) ? opening.opens.hinge : null;
    return { type, hinge };
}

/**
 * Which jamb pane `i` of `across` hangs on: -1 towards its wall's start
 * (`left`), 1 towards its end (`right`) — as asked, or the one nearer its
 * end of the window; the middle one of an odd row, and a pane on its own,
 * from its left.
 */
export function paneHinge(i, across, hinge = null) {
    if (hinge === "left") return -1;
    if (hinge === "right") return 1;
    const middle = (i + 0.5) / across;
    return middle > 0.5 + 1e-9 ? 1 : -1;
}

export default class WindowSash {
    /**
     * @param {object} options
     * @param {object} options.opening  its window, as validated (`spec`, as a door's)
     * @param {string} options.wallId
     * @param {number} options.index  which of the window's panes, across then up
     * @param {{ x0: number, x1: number, y0: number, y1: number }} options.aperture
     *        the hole its frame leaves for it, in its wall's frame
     * @param {number} options.inner  where the frame's face on the room's side is, through the wall (its Z)
     * @param {number} options.hingeSide  -1 hung on the jamb towards its wall's start, 1 towards its end
     * @param {"turn"|"tilt"} options.type
     * @param {THREE.Material} options.frame  its sections' and handle's
     * @param {THREE.Material} options.glass
     * @param {object} [options.tag]  its opening's (`{ kind: "opening", wallId, openingId }`), for the editor's pick
     */
    constructor({ opening, wallId, index, aperture, inner, hingeSide, type, frame, glass, tag = {} }) {
        this.spec = opening;
        this.wallId = wallId;
        this.index = index;
        this.id = `${opening.id}:${index}`;
        this.type = type;
        this.hingeSide = hingeSide;
        /** A window low enough to step through, made to open: it bars the way itself (getBlockers). */
        this.low = (opening.sill ?? 0) < OPENS_FROM_SILL;

        this.width = aperture.x1 - aperture.x0 - GAP * 2;
        this.height = aperture.y1 - aperture.y0 - GAP * 2;
        this.inner = inner;
        this.middle = (aperture.y0 + aperture.y1) / 2;

        // 0 shut, 1 fully open, eased towards `target` — turned or tilted, as `mode` says.
        this.open = 0;
        this.target = 0;
        this.mode = null;
        /** What is in its way, by how the trees stood when last asked (plan). */
        this.planned = null;
        /** Its glass, and how it is drawn in its wall and in the room, where they differ (glazeInRoom). */
        this.glazing = null;

        const { width: w, height: h } = this;
        // Where a door's group stands — at its wall's foot, at the middle of
        // the pane along it — so that what asks a door which rooms are
        // either side of it can ask a sash (SceneBuilder.doorSideZones).
        this.group = new THREE.Group();
        this.group.name = `window:${this.id}`;
        this.group.position.set((aperture.x0 + aperture.x1) / 2, 0, 0);
        this.group.userData = { ...tag, sash: this, hingeSide };
        // Turned about its hinge jamb, tilted about its bottom rail, both on the sash's face to the room.
        this.turn = new THREE.Group();
        this.turn.position.set((hingeSide * w) / 2, this.middle, inner);
        this.tilt = new THREE.Group();
        this.tilt.position.set((-hingeSide * w) / 2, -h / 2, 0);
        /** The sash itself, about its middle: what moves, as a door's leaf. */
        this.leaf = new THREE.Group();
        this.leaf.position.set(0, h / 2, SASH_DEPTH / 2);
        this.group.add(this.turn);
        this.turn.add(this.tilt);
        this.tilt.add(this.leaf);

        this.build(frame, glass, tag);
        // Only `turn` and `tilt` move (place): everything else's frame is worked out once, not at each of the frame's
        // renders (a public view draws the scene three times a frame). Turned or tilted, the leaf's world matrix still follows.
        for (const node of [this.group, this.leaf, ...this.leaf.children]) {
            node.updateMatrix();
            node.matrixAutoUpdate = false;
        }
    }

    /**
     * Four sections round its pane and the handle on its face to the room,
     * one mesh in the frame's material — a draw call a sash, not three — and
     * its glass. A sash that turns has its handle on the stile it opens by,
     * half-way up; one that only tilts, on the middle of its top rail. Its
     * lever hangs down, shut.
     */
    build(frameMaterial, glassMaterial, tag) {
        const { width: w, height: h } = this;
        const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
        const parts = [
            box(FACE, h, SASH_DEPTH, -w / 2 + FACE / 2, 0, 0),
            box(FACE, h, SASH_DEPTH, w / 2 - FACE / 2, 0, 0),
            box(w - FACE * 2, FACE, SASH_DEPTH, 0, h / 2 - FACE / 2, 0),
            box(w - FACE * 2, FACE, SASH_DEPTH, 0, -h / 2 + FACE / 2, 0),
        ];
        const face = -SASH_DEPTH / 2;
        const handle = [
            box(0.026, 0.068, 0.008, 0, 0, face - 0.004),
            box(0.012, 0.012, 0.016, 0, 0.012, face - 0.016),
            box(0.018, 0.11, 0.012, 0, 0.012 - 0.11 / 2 + 0.009, face - 0.03),
        ];
        const tilts = this.type === "tilt";
        for (const part of handle) {
            if (tilts) part.rotateZ(Math.PI / 2).translate(0, h / 2 - FACE / 2, 0);
            else part.translate(-this.hingeSide * (w / 2 - FACE / 2), 0, 0);
            parts.push(part);
        }
        const geometry = mergeParts(parts);
        for (const part of parts) part.dispose();

        const frame = new THREE.Mesh(geometry, frameMaterial);
        frame.name = "sash";
        frame.castShadow = true;
        frame.receiveShadow = true;
        // It moves: nothing static — the trees, the fit test, the merging — may take it for fixed.
        frame.userData = { ...tag, doorLeaf: true };
        this.leaf.add(frame);

        const pane = new THREE.Mesh(new THREE.BoxGeometry(w - FACE * 2 + 0.01, h - FACE * 2 + 0.01, GLASS_T), glassMaterial);
        pane.name = "sash-glass";
        pane.castShadow = false;
        pane.receiveShadow = true;
        pane.userData = { ...tag, doorLeaf: true };
        this.leaf.add(pane);
    }

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    /**
     * Open it, as far as what is in its way lets it — turned, or tilted —
     * or, open, shut it again the way it opened.
     *
     * @param {Collision} [collision]  the trees to look in for what is in its way (plan)
     * @returns {"open"|"tilted"|"shut"}  what it is now on its way to
     */
    toggle(collision = null) {
        if (this.target > 0.5) this.target = 0;
        else {
            // (Caught on its way shut, it opens again the way it was going.)
            if (this.open < 0.001 || !this.mode) this.mode = this.plan(collision);
            this.target = 1;
        }
        return this.state;
    }

    /** Back as built, shut, at once: as a space is published. */
    reset() {
        this.open = this.target = 0;
        this.mode = null;
        this.place();
    }

    /** Where it is going: "open" (turned in), "tilted" or "shut". */
    get state() {
        return this.target > 0.5 ? (this.mode === "tilt" ? "tilted" : "open") : "shut";
    }

    get isOpen() {
        return this.open > 0.5;
    }

    /** Open, or on its way: what toggling it would undo. */
    get isOpening() {
        return this.target > 0.5;
    }

    get isMoving() {
        return Math.abs(this.open - this.target) > 0.001;
    }

    update(delta) {
        if (!this.isMoving) {
            // (Its glass as it stands, each frame: a room drawn live gives back the glass it took as it was then.)
            this.glaze();
            return false;
        }
        const diff = this.target - this.open;
        this.open += Math.sign(diff) * Math.min(Math.abs(diff), SPEED * delta);
        // Within a thousandth of where it was going, there: exactly — shut is as built to the last digit, which the
        // editor's stand-ins and a public view merge it with its wall by (World/StandIns.js, World/ShutBatcher.js).
        if (Math.abs(this.target - this.open) <= 0.001) this.open = this.target;
        this.place();
        return true;
    }

    /** Where it is, eased so it settles rather than stopping dead (as a door's leaf, Door.update). */
    place() {
        const eased = 1 - Math.pow(1 - this.open, 2);
        // Inward is -Z: turned, its free stile goes there; tilted, its top rail.
        this.turn.rotation.y = this.mode === "turn" ? -this.hingeSide * eased * TURN : 0;
        this.tilt.rotation.x = this.mode === "tilt" ? -eased * TILT : 0;
        // Where it is now, worked out as it moves: its wall may be passed over by three's walk of the scene, held still
        // while the editor's stand-ins draw it (World/StandIns.js's hold).
        this.turn.updateMatrixWorld(true);
        this.glaze();
    }

    /**
     * Its glass drawn otherwise once it stands in the room — turned in past
     * IN_ROOM — than in its wall: `inRoom(material)` the material for it
     * there. A view drawn from its bake keeps clear glass that stands in a
     * room to its reflections (SceneBuilder.clearGlassIndoors) and leaves a
     * pane in a wall as it is, which by day is a white veil — its own glass
     * lit by the unshaded sun at the room's exposure. Shut, a sash's pane is
     * the fixed panes' beside it; turned in, it stood in the room as a white
     * sheet (Ladonia, A1's bedroom by day: 255,251,238 at its middle, where
     * kept to its reflections it is 86,78,71, the wall behind it seen through
     * it). Tilted, it is still in its wall.
     */
    glazeInRoom(inRoom) {
        this.glazing = [];
        this.leaf.traverse((mesh) => {
            if (mesh.isMesh && mesh.material?.transparent) this.glazing.push({ mesh, wall: mesh.material, room: inRoom(mesh.material) });
        });
        this.glaze();
    }

    /** Its glass as it stands (glazeInRoom): but not where a room drawn live has it, which gives it back as it took it. */
    glaze() {
        if (!this.glazing) return;
        const inRoom = this.mode === "turn" && this.open > IN_ROOM;
        for (const { mesh, wall, room } of this.glazing) {
            const material = inRoom ? room : wall;
            if (mesh.material !== material && !mesh.userData.roomLive) mesh.material = material;
        }
    }

    // ------------------------------------------------------------------
    // What is in its way
    // ------------------------------------------------------------------

    /**
     * How it opens now: "turn" where nothing in the collision trees — the
     * building's or what stands in it — is in the way of its turning in,
     * else "tilt"; "tilt" always for a sash that only tilts. Worked out once
     * for the trees as they stand (each tree's revision: a piece moved in
     * the editor is a new one), so asking it for each prompt costs nothing.
     *
     * @param {Collision} [collision]  without one, "turn"
     */
    plan(collision = null) {
        if (this.type === "tilt") return "tilt";
        if (!collision) return "turn";
        const key = `${collision.revision?.static}/${collision.revision?.dynamic}`;
        if (this.planned?.key !== key) {
            const met = this.blocked("turn", [collision.static, collision.dynamic]);
            // (What it was, for whoever asks why: a triangle's own label in a public view, its piece's or wall's in the editor's tree.)
            const named = met && (met.label ?? met.source?.key?.userData?.label ?? met.source?.key?.name ?? "something");
            this.planned = { key, mode: met ? "tilt" : "turn", met: named || null };
        }
        return this.planned.mode;
    }

    /**
     * What the sash would sweep through opening `mode`'s way, on the room's
     * side: a frame whose X runs along the shut sash from the line it turns
     * about, Y along that line and Z into the room (`matrix`, into the
     * world, as the sash hangs now), and within it the wedge of a cylinder
     * — Y from `from` to `to`, out to `reach` from the line, from the shut
     * sash's plane round to `angle` and `proud` beyond it — with CLEARANCE
     * to spare round it, and the handle (PROUD).
     */
    sweep(mode) {
        const { width: w, height: h } = this;
        const matrix = new THREE.Matrix4();
        if (mode === "turn") {
            const at = this.turn.position;
            matrix.makeBasis(_a.set(-this.hingeSide, 0, 0), _b.set(0, 1, 0), _c.set(0, 0, -1)).setPosition(at);
            const region = { from: -h / 2, to: h / 2, angle: TURN, proud: PROUD, reach: Math.hypot(w, SASH_DEPTH) + CLEARANCE };
            return { ...region, matrix: matrix.premultiply(this.group.matrixWorld) };
        }
        _centre.copy(this.turn.position).add(this.tilt.position);
        matrix.makeBasis(_a.set(0, 1, 0), _b.set(1, 0, 0), _c.set(0, 0, -1)).setPosition(_centre);
        const region = { from: -w / 2, to: w / 2, angle: TILT, proud: PROUD, reach: Math.hypot(h, SASH_DEPTH) + CLEARANCE };
        return { ...region, matrix: matrix.premultiply(this.group.matrixWorld) };
    }

    /**
     * The first triangle of `trees` in the way of its opening `mode`'s way
     * (sweep), or null. Only the cells of each tree round that space are
     * looked in: a few hundred triangles at most, a fraction of a
     * millisecond.
     *
     * @param {"turn"|"tilt"} mode
     * @param {object[]} trees  collision octrees (World/Collision.js)
     */
    blocked(mode, trees) {
        this.group.updateWorldMatrix(true, false);
        const region = this.sweep(mode);
        const inverse = _inverse.copy(region.matrix).invert();
        const around = sweepBox(region);
        for (const tree of trees) {
            if (!tree) continue;
            for (const triangle of uniqueTriangles(tree, around)) {
                _a.copy(triangle.a).applyMatrix4(inverse);
                _b.copy(triangle.b).applyMatrix4(inverse);
                _c.copy(triangle.c).applyMatrix4(inverse);
                if (sweepMeets(_a, _b, _c, region)) return triangle;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Aimed at
    // ------------------------------------------------------------------

    /**
     * Where it hangs: its group's frame in the world, the inverse of it, and
     * the middle of its pane — kept for as long as the frame is the same,
     * which is always (a wall is built again, not moved), so that the look
     * ray's test of every window's opening (through) costs a comparison of
     * sixteen numbers a sash and not an inverse. The world's matrices are
     * as the last frame drew them, as the look ray's own are.
     */
    frame() {
        const world = this.group.matrixWorld;
        if (this.kept?.matrix.equals(world)) return this.kept;
        const inverse = world.clone().invert();
        const centre = new THREE.Vector3(0, this.middle, this.inner + SASH_DEPTH / 2).applyMatrix4(world);
        this.kept = { matrix: world.clone(), inverse, centre, half: Math.hypot(this.width, this.height) / 2 };
        return this.kept;
    }

    /** Whether `point` is on the room's side of the window, from which it is opened. */
    inside(point) {
        return _origin.copy(point).applyMatrix4(this.frame().inverse).z < this.inner;
    }

    /**
     * How far along `ray` it meets the hole its pane fills — the plane of
     * its glass, shut — from the room's side, or null: an open window is
     * aimed at through its opening as much as by its sash, which turned in
     * stands edge on. Nearer than `reach` only.
     */
    through(ray, reach) {
        const { inverse, centre, half } = this.frame();
        if (centre.distanceToSquared(ray.origin) > (reach + half) ** 2) return null;
        _origin.copy(ray.origin).applyMatrix4(inverse);
        _direction.copy(ray.direction).transformDirection(inverse);
        const plane = this.inner + SASH_DEPTH / 2;
        // Looking out through it (+Z, towards side A) from the room's side of its glass, and no further than `reach`.
        if (_direction.z <= 1e-9) return null;
        const t = (plane - _origin.z) / _direction.z;
        if (t < 0 || t > reach) return null;
        const x = _origin.x + _direction.x * t;
        const y = _origin.y + _direction.y * t - this.middle;
        return Math.abs(x) <= this.width / 2 && Math.abs(y) <= this.height / 2 ? t : null;
    }

    // ------------------------------------------------------------------
    // Collision
    // ------------------------------------------------------------------

    /**
     * What it bars the way with, in the world: nothing, in a window with a
     * pane of its own that collides (all but a low one, made to open); else
     * the sash, while it is shut, tilted, or turned less than BLOCKING — the
     * oriented box Door.resolveCapsule pushes a walker out of.
     */
    getBlockers() {
        if (!this.low || (this.mode === "turn" && this.open >= BLOCKING)) return NONE;
        this.leaf.getWorldPosition(_centre);
        this.leaf.getWorldQuaternion(_quaternion);
        return [{ centre: _centre.clone(), quaternion: _quaternion.clone(), half: new THREE.Vector3(this.width / 2, this.height / 2, SASH_DEPTH / 2) }];
    }

    dispose() {
        this.group.traverse((child) => {
            if (child.isMesh) child.geometry.dispose();
        });
        this.group.removeFromParent();
    }
}

// ---------------------------------------------------------------------
// The space a sash sweeps
// ---------------------------------------------------------------------

/** The world's box round a sweep: what of a tree is looked in. */
function sweepBox({ matrix, from, to, angle, proud, reach }) {
    const box = new THREE.Box3();
    const x0 = Math.min(0, reach * Math.cos(angle)) - proud;
    const z1 = angle >= Math.PI / 2 ? reach : Math.min(reach, reach * Math.sin(angle) + proud);
    for (const x of [x0, reach]) for (const y of [from, to]) for (const z of [0, z1]) box.expandByPoint(_origin.set(x, y, z).applyMatrix4(matrix));
    return box;
}

/**
 * Whether a triangle, given in a sweep's own frame (`sash.sweep`), meets
 * its wedge: Y within [from, to]; Z at least INTO into the room; round the
 * Y axis from the shut sash's plane (X) to `angle`, and up to `proud`
 * beyond the plane it stops in, alongside it; within `reach` of the axis.
 * The triangle is cut to all but the last — each a flat side, so what is
 * left is a flat convex polygon, or nothing — and then the wedge is met if
 * any of what is left is within reach of the axis: the nearest point of
 * one of its edges, as it is seen down the axis (the axis itself is not in
 * it, being INTO short of it). Exact, not sampled: a tap a centimetre thick
 * is found however few degrees it stands in.
 *
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {THREE.Vector3} c
 * @param {{ from: number, to: number, angle: number, proud: number, reach: number }} region
 */
export function sweepMeets(a, b, c, { from, to, angle, proud = 0, reach }) {
    let polygon = [a, b, c];
    polygon = clip(polygon, 0, 1, 0, -from);
    polygon = clip(polygon, 0, -1, 0, to);
    polygon = clip(polygon, 0, 0, 1, -INTO);
    polygon = clip(polygon, Math.sin(angle), 0, -Math.cos(angle), proud);
    // (Beyond that plane only alongside the sash, as its handle is: not behind the axis, where its frame's sill is.)
    polygon = clip(polygon, Math.cos(angle), 0, Math.sin(angle), 0);
    if (!polygon.length) return false;
    const reach2 = reach * reach;
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        if (segmentDistanceSq(p.x, p.z, q.x, q.z) <= reach2) return true;
    }
    return false;
}

/**
 * A convex polygon cut to where `fx·x + fy·y + fz·z + k ≥ 0` (Sutherland and
 * Hodgman's clip against one plane): a new list, the points given left as
 * they are.
 */
function clip(polygon, fx, fy, fz, k) {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const fp = fx * p.x + fy * p.y + fz * p.z + k;
        const fq = fx * q.x + fy * q.y + fz * q.z + k;
        if (fp >= 0) out.push(p);
        if ((fp >= 0) !== (fq >= 0)) out.push(new THREE.Vector3().lerpVectors(p, q, fp / (fp - fq)));
    }
    return out;
}

/** The square of how far the origin is from the segment (x0, z0)–(x1, z1). */
function segmentDistanceSq(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = dx * dx + dz * dz;
    const t = length > 0 ? THREE.MathUtils.clamp(-(x0 * dx + z0 * dz) / length, 0, 1) : 0;
    const x = x0 + dx * t;
    const z = z0 + dz * t;
    return x * x + z * z;
}

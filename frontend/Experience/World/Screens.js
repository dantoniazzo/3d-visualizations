import * as THREE from "three";

import { REACH } from "../../../shared/interact.js";

/**
 * The televisions, and what they show switched on — one picture, the same
 * on every set: a loop of the Earth from the space station (NASA's, public
 * domain: assets/THIRD_PARTY.md), with no sound.
 *
 * Every placed piece with a screen has one: where its glass is, measured
 * from its model (public/models/furniture/screens.json, scripts/measure-
 * screens.mjs), in the piece's own frame, placed as the piece is — so it is
 * the same in the editor and in a public view, which loads no furniture
 * model, and needs nothing republished or baked again. Switched off, a set
 * is its glass, as it always was: nothing is drawn for it. Switched on, its
 * picture is a plane of its own just in front of the glass (PROUD), within
 * the set's black frame (BEZEL), the video's shape fitted inside it.
 *
 * The pictures are not part of the property: one group outside the scene
 * builder's root, a helper — never merged, batched, baked, published or
 * collided with, met by no ray of the scene's indexes, stood in for by no
 * stand-in, not taken away by the bird's-eye view's floors with the house
 * (it has its own say: showFloor). In the editor each follows its piece's
 * group as the piece is moved; in a public view, its placement.
 *
 * How bright: as a set is seen, not as a room is lit. The view is exposed
 * for the room it is in, or the day outside, or a night lit by lamps — two
 * to thirty times over from one to the next, on top of the day's or the
 * night's own (Realism.js), and from above every room is brought up again
 * by its own gain (SceneBuilder.setIndoorGain) — and a set drawn at one
 * brightness would be grey in one and burnt out in the next. So the
 * picture is drawn at whatever the view is exposed at — divided by it, as
 * it is drawn (brighten) — to come out at one level (LEVEL) on the screen
 * in every view: plainly bright beside a room by day, readable at night,
 * and never white. A little less by night, when a lit screen in a dim room
 * is as bright as it needs to be.
 *
 * The video: one `<video>` for all, made the first time a set is switched
 * on and fetched only then (muted, inline, looped — what a phone plays
 * without asking), drawn by one texture. It plays only while a set that is
 * on is in sight — on the floor shown, in the view's frame, within the last
 * OUT_OF_SIGHT — and the walkthrough is the visitor's: paused in edit mode,
 * where the editor stands still, and while the tab is not on show. Where
 * it will not play, a set shows the dark blue of a set with no signal.
 *
 * What it costs: nothing while every set is off — no draw, no video; one
 * draw a set switched on, and the video's frame sent to the GPU as it
 * changes, 30 times a second at 960 × 540 — on a computer less than a
 * frame's own unevenness (Ladonia's A1, public view, step 4: 18.3 ms a
 * frame on, 20.0 off), on a phone more, which is why it plays only while a
 * set is in sight.
 *
 * It is a provider of World/Interactables.js ("tv": E on a set aimed at,
 * within REACH.tv, "Turn on TV"/"Turn off TV", a touch screen's button with
 * the tv icon), and to someone seated (World/Seats.js) the set in front of
 * them (`seated`, Player.seatedOffer: within IN_FRONT, facing them, nothing
 * in between), which E then switches — on, the view turns to it from the
 * seated figure's eyes, in first person (Player.lookFromSeat), and getting
 * up gives back the view they sat in. From above, a click or a tap on a set
 * switches it (World/BirdView.js). The state is the visitor's own: never
 * saved, never sent.
 */

/** What every set shows: fetched the first time one is switched on. */
const VIDEO_URL = "/media/earth-tv.mp4";
/** Where each piece's screen is (scripts/measure-screens.mjs). */
const SCREENS_URL = "/models/furniture/screens.json";
/** The picture's shape, until the video's own is known. */
const ASPECT = 16 / 9;
/** A set's black frame round its picture, each side, in metres. */
const BEZEL = 0.012;
/** How far in front of the glass the picture is drawn: clear of it, from any distance (and polygonOffset). */
const PROUD = 0.003;
/** Switched on or off: how long the picture takes to come up or to go, in seconds. */
const FADE = 0.3;
/**
 * The picture's white before it is tone mapped, whatever the view's
 * exposure (brighten): by day a little over the exposure's own white, so
 * that a set reads as lit beside a sunny room's walls — its clouds and the
 * station's panels white, still with their detail (A1's living room, a
 * bright frame: the picture's brightest hundredth at 193 of 255 on the
 * screen, its middle 102, the wall round it 99; at 1.0 the picture was no
 * brighter than the wall, at 1.6 its whites washed out) — and by night at
 * it: bright beside a dim room, never glaring.
 */
export const LEVEL = { day: 1.3, night: 1.0 };
/** What a set shows where the video will not play: the dark blue of no signal, as linear light at LEVEL (at 0.16 its blue was a lit panel). */
const NO_SIGNAL = new THREE.Color(0.01, 0.016, 0.045);
/**
 * To someone seated, the set in front of them: its picture's middle within
 * `reach` of their eyes, within `across` degrees of the way the seat faces
 * and `rise` up or down, `over` the seat's floor by as much as a set on
 * that floor is (not one upstairs, through a ceiling the collision has no
 * underside of), the set turned to them within `facing` degrees — and
 * nothing solid in between (`clear`: closer to the screen than that, where
 * it stands is the set's own piece).
 */
export const IN_FRONT = { reach: 7, across: 40, rise: 35, over: [0.3, 2.5], facing: 70, clear: 0.1 };
/** Aimed at: no more than this behind what the crosshair meets first, besides how far the piece stands in front of its glass (`recess`). */
const SLACK = 0.05;
/** Clicked or tapped from above: within this of the set's glass, in metres — from straight down a wall-hung set is a few centimetres deep. */
const FROM_ABOVE = 0.08;
/** How deep a set's glass is taken to be, behind its front, for a click from above. */
const GLASS_DEPTH = 0.05;
/** How long a set that is on may be out of the view's frame before the video is paused, in seconds: no stopping and starting as the camera turns. */
const OUT_OF_SIGHT = 1;
/** How long since the browser last said it presented a frame of the video before its clock is gone by instead, in milliseconds (update). */
const UNPRESENTED = 500;
/** How long someone seated's set in front of them is kept before it is looked for again, in milliseconds. */
const KEEP_IN_FRONT = 1000;

const _to = new THREE.Vector3();
const _point = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _size = new THREE.Vector3();
const _ray = new THREE.Ray();
const _box = new THREE.Box3();
const _hit = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _projection = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
/** A set faces north (−z) in its own frame; its picture's plane faces +z: half a turn. */
const HALF_TURN = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);

export default class Screens {
    /**
     * @param {World} world  its scene builder and interactables made (its seats, for someone sat on one)
     */
    constructor(world) {
        this.world = world;
        this.experience = world.experience ?? null;
        /** Every set there is, as `{ id, furniture, index, local, on, level, centre, normal, right, up, half, recess, floor, mesh }`. */
        this.list = [];
        this.byId = new Map();
        this.data = null;
        /** The pictures, in the scene but not the property's: a helper (the class's comment). */
        this.group = new THREE.Group();
        this.group.name = "screens";
        this.group.userData.helper = true;
        this.experience?.scene?.add(this.group);
        /** From above, which floors' sets show (BirdView.showFloor): a test of a set's floor height and place, or null for all. */
        this.floorTest = null;
        /** Bumped as the sets are listed again: what someone seated has in front of them is looked for again. */
        this.revision = 0;
        this.inFrontOf = new Map();
        this.video = null;
        this.texture = null;
        this.geometry = null;
        /** "none" until the video is asked for; then "loading", "playing", "paused" — or "failed". */
        this.state = "none";
        this.ready = fetchScreens().then((data) => {
            if (this.disposed) return;
            this.data = data ?? null;
            this.refresh();
        });
        this.unregister = world.interactables?.register(this.provider()) ?? null;
        // (Paused at once as the tab goes: no frames come while it is hidden, nor any update to pause it from.)
        this.onVisibility = () => this.play(this.wanted());
        if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    }

    // ------------------------------------------------------------------
    // The sets
    // ------------------------------------------------------------------

    /**
     * The sets of the furniture as it is placed now — after the scene is
     * edited, its furniture come (Interactables' refresh) — each keeping
     * whether it was on, as long as its piece is there.
     */
    refresh() {
        const spec = this.world.sceneBuilder?.spec ?? this.world.spec;
        const kept = new Map();
        for (const placement of (this.data && spec?.furniture) || []) {
            const screens = this.data[placement.catalog_id]?.screens;
            if (!Array.isArray(screens)) continue;
            screens.forEach((local, index) => {
                const id = `${placement.id}#${index}`;
                const screen = this.byId.get(id) ?? this.make(id, placement.id, index);
                screen.placement = placement;
                screen.local = local;
                kept.set(id, screen);
            });
        }
        for (const [id, screen] of this.byId) if (!kept.has(id)) this.drop(screen);
        this.byId = kept;
        this.list = [...kept.values()];
        for (const screen of this.list) this.place(screen);
        this.revision++;
        this.inFrontOf.clear();
    }

    make(id, furniture, index) {
        return {
            id,
            furniture,
            index,
            placement: null,
            local: null,
            on: false,
            /** How far up its picture is, 0 to 1 (FADE). */
            level: 0,
            centre: new THREE.Vector3(),
            /** Out of the screen, the way it looks; across it to the right and up it, as one looking at it sees them. */
            normal: new THREE.Vector3(),
            right: new THREE.Vector3(),
            up: new THREE.Vector3(),
            /** Half its glass's width and height, in metres, as placed; and the scale it is placed at. */
            half: [0, 0],
            scale: 1,
            /** How far its piece stands in front of its glass, as placed (screens.json's `recess`). */
            recess: 0,
            /** The height its piece stands at: which floor it is on (BirdView's levelAt, as the piece's own meshes are). */
            floor: 0,
            /** Its picture's frame: centre, turned, unscaled. */
            frame: new THREE.Matrix4(),
            /** Its piece's group's matrix as last placed from (the editor's): moved, placed again. */
            seen: new Float64Array(16).fill(NaN),
            /** When it was last in the view's frame, on and shown (update): what keeps the video playing. */
            seenAt: -Infinity,
            mesh: null,
        };
    }

    drop(screen) {
        if (!screen.mesh) return;
        this.group.remove(screen.mesh);
        screen.mesh.material.dispose();
        screen.mesh = null;
    }

    /**
     * Where a set is now, from where its piece is: in the editor its group's
     * world matrix — its placement's place, turn and scale, and the
     * catalogue's own scale, which the screen's frame already has — and in a
     * public view (no group) its placement. Its picture, placed with it.
     */
    place(screen) {
        const builder = this.world.sceneBuilder;
        const placement = screen.placement;
        const group = builder?.furniture?.get?.(screen.furniture)?.group;
        if (group) {
            group.updateWorldMatrix(true, false);
            screen.seen.set(group.matrixWorld.elements);
            const scale = builder.furnitureLibrary?.getItem?.(placement.catalog_id)?.scale ?? 1;
            _matrix.copy(group.matrixWorld).multiply(_scale.makeScale(1 / scale, 1 / scale, 1 / scale));
        } else {
            const turn = THREE.MathUtils.degToRad(placement.rotation ?? 0);
            const scale = placement.scale ?? 1;
            _matrix.compose(_position.fromArray(placement.position), _quaternion.setFromAxisAngle(UP, turn), _size.set(scale, scale, scale));
        }
        const [x, y, z] = screen.local.at;
        _matrix.multiply(_scale.makeTranslation(x, y, z));
        _matrix.decompose(_position, _quaternion, _size);
        const scale = _size.x;
        _quaternion.multiply(HALF_TURN);
        screen.frame.compose(_position, _quaternion, _size.set(1, 1, 1));
        screen.centre.copy(_position);
        screen.normal.set(0, 0, 1).applyQuaternion(_quaternion);
        screen.right.set(1, 0, 0).applyQuaternion(_quaternion);
        screen.up.set(0, 1, 0).applyQuaternion(_quaternion);
        const [w, h] = screen.local.size;
        screen.half = [(w / 2) * scale, (h / 2) * scale];
        screen.scale = scale;
        screen.recess = (screen.local.recess ?? 0) * scale;
        screen.floor = group ? group.getWorldPosition(_point).y : placement.position[1];
        if (screen.mesh) this.frame(screen);
    }

    /** A set's picture: its plane PROUD of the glass, within its frame, the video's shape. */
    frame(screen) {
        const [w, h] = screen.local.size;
        const video = this.video;
        const aspect = video?.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : ASPECT;
        const across = Math.max(0.01, w - 2 * BEZEL);
        const high = Math.max(0.01, h - 2 * BEZEL);
        const width = Math.min(across, high * aspect) * screen.scale;
        const height = width / aspect;
        const mesh = screen.mesh;
        mesh.matrix.copy(screen.frame).multiply(_matrix.makeTranslation(0, 0, PROUD * screen.scale)).multiply(_scale.makeScale(width, height, 1));
        mesh.matrixWorldNeedsUpdate = true;
    }

    /** Whether a set can be seen and switched now: its piece drawn — in the editor, the view's scope may leave it out (World/Scope.js). */
    usable(screen) {
        for (let node = this.world.sceneBuilder?.furniture?.get?.(screen.furniture)?.group; node; node = node.parent) {
            if (!node.visible) return false;
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Finding one
    // ------------------------------------------------------------------

    /**
     * The set a ray points at from in front of it: the nearest whose glass
     * it meets, within `reach` — `{ screen, distance }` along the ray, or
     * null. Beyond `far` (how far the crosshair sees: 4 m, short of a
     * television's reach) the look ray has not said what stands between;
     * a ray of the collision's says it here.
     */
    pick(ray, { reach = REACH.tv, far = Infinity } = {}) {
        let best = null;
        let nearest = reach;
        for (const screen of this.list) {
            const facing = ray.direction.dot(screen.normal);
            // (Seen from behind, or along its edge: not aimed at.)
            if (facing > -0.05) continue;
            const distance = _to.subVectors(screen.centre, ray.origin).dot(screen.normal) / facing;
            if (distance < 0 || distance > nearest) continue;
            _point.copy(ray.origin).addScaledVector(ray.direction, distance).sub(screen.centre);
            if (Math.abs(_point.dot(screen.right)) > screen.half[0] || Math.abs(_point.dot(screen.up)) > screen.half[1]) continue;
            if (!this.usable(screen)) continue;
            if (distance > far && this.blocked(ray, distance, screen)) continue;
            best = screen;
            nearest = distance;
        }
        return best ? { screen: best, distance: nearest } : null;
    }

    /** Whether something solid stands on a ray before it reaches a set `distance` along it — but its own piece, `recess` and a little in front of the glass. */
    blocked(ray, distance, screen, clear = SLACK) {
        const collision = this.world.collision;
        if (!collision) return false;
        const hit = collision.rayIntersect(ray, { far: distance });
        return Boolean(hit && hit.distance < distance - screen.recess - clear);
    }

    /**
     * The set a click or a tap from above is on (World/BirdView.js): whose
     * glass — FROM_ABOVE round it, GLASS_DEPTH deep — the ray meets first,
     * of those `accept`ed (on the floor shown), from any side. `{ screen,
     * distance }`, or null.
     */
    fromAbove(ray, accept) {
        let best = null;
        let nearest = Infinity;
        for (const screen of this.list) {
            if ((accept && !accept(screen)) || !this.usable(screen)) continue;
            _matrix.copy(screen.frame).invert();
            _ray.copy(ray).applyMatrix4(_matrix);
            _box.min.set(-screen.half[0] - FROM_ABOVE, -screen.half[1] - FROM_ABOVE, -GLASS_DEPTH * screen.scale - FROM_ABOVE);
            _box.max.set(screen.half[0] + FROM_ABOVE, screen.half[1] + FROM_ABOVE, FROM_ABOVE);
            if (!_ray.intersectBox(_box, _hit)) continue;
            const distance = _hit.applyMatrix4(screen.frame).distanceTo(ray.origin);
            if (distance >= nearest) continue;
            best = screen;
            nearest = distance;
        }
        return best ? { screen: best, distance: nearest } : null;
    }

    /**
     * The set in front of someone on a seat (World/Seats.js), their eyes at
     * `eye`: within IN_FRONT of them and the way the seat faces, turned to
     * them, with nothing solid in between — of several, the one nearest
     * straight ahead. Kept a moment (KEEP_IN_FRONT): asked every frame, by
     * the prompt. Null if there is none.
     */
    inFront(seat, eye) {
        const now = performance.now();
        const kept = this.inFrontOf.get(seat.id);
        if (kept && kept.revision === this.revision && now - kept.at < KEEP_IN_FRONT && kept.eye.distanceToSquared(eye) < 1e-6) return kept.screen;
        let best = null;
        let straightest = IN_FRONT.across;
        const [fx, fz] = seat.face;
        for (const screen of this.list) {
            _to.subVectors(screen.centre, eye);
            const distance = _to.length();
            if (distance > IN_FRONT.reach || distance < 0.3) continue;
            const flat = Math.hypot(_to.x, _to.z);
            const across = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp((_to.x * fx + _to.z * fz) / (flat || 1), -1, 1)));
            if (across > straightest) continue;
            if (THREE.MathUtils.radToDeg(Math.atan2(Math.abs(_to.y), flat)) > IN_FRONT.rise) continue;
            const over = screen.centre.y - seat.floor;
            if (over < IN_FRONT.over[0] || over > IN_FRONT.over[1]) continue;
            // Turned to the seat: seen from within `facing` of straight on.
            if (-_to.dot(screen.normal) / distance < Math.cos(THREE.MathUtils.degToRad(IN_FRONT.facing))) continue;
            if (!this.usable(screen)) continue;
            _ray.origin.copy(eye);
            _ray.direction.copy(_to).divideScalar(distance);
            if (this.blocked(_ray, distance, screen, IN_FRONT.clear)) continue;
            best = screen;
            straightest = across;
        }
        this.inFrontOf.set(seat.id, { screen: best, at: now, revision: this.revision, eye: eye.clone() });
        return best;
    }

    // ------------------------------------------------------------------
    // On and off
    // ------------------------------------------------------------------

    /** A set switched on, or off: its picture made the first time, the video fetched the first time any is. Whether it is now on. */
    toggle(screen, on = !screen.on) {
        screen.on = Boolean(on);
        if (screen.on) {
            this.prepare();
            if (!screen.mesh) {
                const material = new THREE.MeshBasicMaterial({ map: this.state === "failed" ? null : this.texture, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
                screen.mesh = new THREE.Mesh(this.geometry, material);
                screen.mesh.name = `screen:${screen.id}`;
                screen.mesh.matrixAutoUpdate = false;
                screen.mesh.userData.helper = true;
                screen.mesh.onBeforeRender = (renderer) => this.brighten(screen, renderer);
                this.group.add(screen.mesh);
                this.frame(screen);
            }
        }
        this.show(screen);
        // (Its fade drawn: the editor draws on demand — Pace.js, through busy.)
        this.experience?.wake?.("tv");
        this.play(this.wanted());
        return screen.on;
    }

    /** The video and its texture, made once: nothing is fetched until a set is first switched on (preload none). */
    prepare() {
        if (this.video) return;
        this.geometry = new THREE.PlaneGeometry(1, 1);
        const video = document.createElement("video");
        // What a phone plays without a tap of its own: muted, inline. (No sound: the user's choice.)
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute("muted", "");
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.loop = true;
        video.preload = "none";
        video.disableRemotePlayback = true;
        video.addEventListener("loadedmetadata", () => {
            // Its own shape, now it is known: every picture fitted to it.
            for (const screen of this.list) if (screen.mesh) this.frame(screen);
        });
        video.addEventListener("loadeddata", () => this.experience?.wake?.("tv"));
        // (Not the one a page let go of: emptied, it says so too — dispose.)
        video.addEventListener("error", () => this.video === video && this.fail(video.error));
        // Each frame as the browser presents it (what VideoTexture sends to the GPU by): kept, to know it does (update).
        this.presentedAt = -Infinity;
        if ("requestVideoFrameCallback" in video) {
            const presented = () => {
                this.presentedAt = performance.now();
                this.video?.requestVideoFrameCallback(presented);
            };
            video.requestVideoFrameCallback(presented);
        }
        video.src = VIDEO_URL;
        this.video = video;
        this.texture = new THREE.VideoTexture(video);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.name = "tv";
        this.state = "paused";
    }

    /** The video will not play: every set that is on shows no signal. */
    fail(error) {
        if (this.state === "failed") return;
        console.warn("The televisions' picture did not load: the sets show no signal", error);
        this.state = "failed";
        for (const screen of this.list) {
            if (!screen.mesh) continue;
            screen.mesh.material.map = null;
            screen.mesh.material.needsUpdate = true;
        }
        this.experience?.wake?.("tv");
    }

    /**
     * Whether the video should be playing: a set on and in sight (update's
     * `seenAt`, within OUT_OF_SIGHT), the walkthrough the visitor's (not edit
     * mode), the tab on show.
     */
    wanted() {
        if (!this.video || this.state === "failed") return false;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
        if (this.world.editor?.active) return false;
        const now = performance.now();
        return this.list.some((screen) => screen.on && screen.mesh?.visible && now - screen.seenAt < OUT_OF_SIGHT * 1000);
    }

    /** The video played or paused. A play asked for while one is under way is that one. */
    play(on) {
        const video = this.video;
        if (!video || this.state === "failed") return;
        if (!on) {
            if (!video.paused) video.pause();
            this.state = "paused";
            return;
        }
        if (!video.paused || this.starting) return;
        this.state = "loading";
        this.starting = video
            .play()
            .then(() => {
                if (this.state === "loading") this.state = "playing";
            })
            .catch((error) => {
                // (Paused again before it began: as asked. Anything else is a video that will not play here.)
                if (error?.name !== "AbortError") this.fail(error);
            })
            .finally(() => {
                this.starting = null;
            });
    }

    /** A set's picture shown or not: on or fading out, on a floor shown from above, its piece drawn. */
    show(screen) {
        if (!screen.mesh) return;
        screen.mesh.visible = (screen.on || screen.level > 0) && this.usable(screen) && (!this.floorTest || this.floorTest(screen.floor, screen.centre.x, screen.centre.z));
    }

    /**
     * From above (World/BirdView.js), the sets on the floors shown — `test`
     * of a set's piece's height and its place, as the view takes a piece's
     * floor — or with null, all of them.
     */
    showFloor(test) {
        this.floorTest = test ?? null;
        for (const screen of this.list) this.show(screen);
    }

    /**
     * Drawn, as bright as its picture is to come out whatever the view is
     * exposed at (the class's comment): its white at LEVEL once tone mapped,
     * times how far up it is — set as it is drawn, at the exposure it is
     * drawn at (Realism.js eases it every frame, and changes it at once
     * after a jump). Without the tone mapping that the exposure goes
     * through, as it is.
     */
    brighten(screen, renderer) {
        const material = screen.mesh.material;
        const exposure = renderer.toneMapping === THREE.NoToneMapping ? 1 : renderer.toneMappingExposure || 1;
        const night = (this.world.houseLighting ?? this.world.lighting) === "night";
        const level = (night ? LEVEL.night : LEVEL.day) * smooth(screen.level) / exposure;
        if (material.map) material.color.setScalar(level);
        else material.color.copy(NO_SIGNAL).multiplyScalar(level);
    }

    /**
     * Each frame (World.update): the sets placed again where their pieces
     * have moved (the editor), each picture coming up once the video has a
     * frame to show — or no signal to — or going; which are in sight; and
     * the video played or paused for it.
     */
    update(delta) {
        if (!this.list.length) return;
        const editor = !this.world.experience?.publicView;
        const builder = this.world.sceneBuilder;
        const camera = this.experience?.camera?.activeCamera;
        if (camera) _frustum.setFromProjectionMatrix(_projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const now = performance.now();
        const video = this.video;
        const picture = this.state === "failed" || (video && video.readyState >= 2);
        for (const screen of this.list) {
            if (editor) {
                const group = builder?.furniture?.get?.(screen.furniture)?.group;
                if (group && !sameMatrix(group.matrixWorld.elements, screen.seen)) this.place(screen);
            }
            if (!screen.mesh) continue;
            const goal = screen.on && picture ? 1 : 0;
            if (screen.level !== goal) screen.level = goal > screen.level ? Math.min(1, screen.level + delta / FADE) : Math.max(0, screen.level - delta / FADE);
            this.show(screen);
            if (screen.mesh.visible && camera) {
                _sphere.set(screen.centre, Math.hypot(...screen.half));
                if (_frustum.intersectsSphere(_sphere)) screen.seenAt = now;
            }
        }
        this.play(this.wanted());
        // The video's frames go to the GPU as the browser presents each (VideoTexture, by requestVideoFrameCallback) — or,
        // where it presents none (a page it is not painting, whose frames something else draws: a test's hidden tab),
        // each time the video's clock has moved on.
        if (video && !video.paused && video.readyState >= 2 && now - this.presentedAt > UNPRESENTED && video.currentTime !== this.frameTime) {
            this.frameTime = video.currentTime;
            this.texture.needsUpdate = true;
        }
    }

    /** What is still coming up or going (Pace.js, through the provider's busy): a set's picture fading — not one playing, which the walkthrough draws at its rest. */
    busy() {
        for (const screen of this.list) if (screen.mesh && screen.level > 0 && screen.level < 1) return "tv";
        return null;
    }

    // ------------------------------------------------------------------
    // What the visitor acts on (World/Interactables.js)
    // ------------------------------------------------------------------

    /** The sets as one of World/Interactables.js's kinds: "tv". */
    provider() {
        const screens = this;
        const candidate = (screen, distance = null, seated = false) => ({
            kind: "tv",
            id: screen.id,
            distance,
            ref: screen,
            label: "TV",
            // (Its piece may stand in front of its glass — a console under a set sunk in a wall — and collide so.)
            slack: screen.recess + SLACK,
            seated,
        });
        return {
            name: "tv",
            aim(ray, look) {
                const player = screens.world.player;
                if (!player || player.seated || player.inVehicle) return null;
                const found = screens.pick(ray, { far: look?.far });
                return found ? [candidate(found.screen, found.distance)] : null;
            },
            // Seated (Player.seatedOffer): the set in front of the seat.
            seated(seat, eye) {
                const screen = screens.inFront(seat, eye);
                return screen ? candidate(screen, null, true) : null;
            },
            // One set, picked some other way: clicked from above.
            of: (screen) => candidate(screen),
            prompt(target) {
                const on = target.ref.on;
                const prompt = { label: on ? "Turn off TV" : "Turn on TV", key: "E", touch: { label: on ? "Off" : "On", icon: "tv" } };
                // Seated, E is the set's: what gets them up besides (Player's UP_KEYS, the stick), said beside it.
                if (target.seated) prompt.also = { key: "Space", label: "Stand up" };
                return prompt;
            },
            act(target, player) {
                const on = screens.toggle(target.ref);
                // Switched on from a seat: watched, from the figure's eyes (got up from, the view sat in comes back).
                if (on && target.seated) player.lookFromSeat?.(target.ref.centre);
                return { kind: "tv", id: target.id, state: on ? "on" : "off" };
            },
            busy: () => screens.busy(),
            refresh: () => screens.refresh(),
        };
    }

    dispose() {
        this.disposed = true;
        this.unregister?.();
        this.unregister = null;
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
        for (const screen of this.list) this.drop(screen);
        this.list = [];
        this.byId.clear();
        this.group.removeFromParent();
        this.geometry?.dispose();
        this.texture?.dispose();
        const video = this.video;
        this.video = null;
        if (video) {
            // Its download and its decoder let go of at once, not when the page is.
            video.pause();
            video.removeAttribute("src");
            video.load();
        }
    }
}

/** An ease in and out over 0 to 1. */
function smooth(t) {
    return t * t * (3 - 2 * t);
}

/** Whether a matrix's numbers are those kept (to a rounding: a group's matrix is made again each frame). */
function sameMatrix(elements, kept) {
    for (let i = 0; i < 16; i++) if (!(Math.abs(elements[i] - kept[i]) < 1e-7)) return false;
    return true;
}

/** screens.json: null if it will not load. */
function fetchScreens() {
    if (typeof fetch === "undefined") return Promise.resolve(null);
    return fetch(SCREENS_URL)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}

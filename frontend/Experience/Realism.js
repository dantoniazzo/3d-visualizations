import * as THREE from "three";

import { QUALITY } from "./Utils/device.js";
import { airyRooms } from "../../shared/daylight.js";
import { openPairs } from "../../shared/roomGraph.js";

/**
 * What the top steps of the Performance ↔ Quality slider (Utils/device.js)
 * add to a site lit live under its own sky (World/Sky.js), before each
 * frame is drawn (Renderer.render):
 *
 *   - SunFit: the sun's shadow map fitted to what the camera sees, out to
 *     the step's reach — and all round it, for what is behind it — rather
 *     than spread over the whole site: the same map, its texels a few
 *     times smaller where they are looked at. Steadied: its middle moves
 *     a whole texel at a time and its size in steps, so that edges don't
 *     crawl as the camera moves. With the step's `pcss`, its penumbrae are
 *     the sun's (Utils/softShadows.js).
 *   - RoomProbe: the light where the camera is, captured from the scene
 *     itself into a cube (a reflection probe) and prefiltered as the sky
 *     is. In a room, its walls, floor, ceiling and furniture take their
 *     light from it rather than from a share of the sky — the sun's
 *     patches on the floor bounced warm round the room, the windows'
 *     daylight, as the renders show it — and its glossy floors and glass
 *     reflect the room. Outside, the glass and the pool reflect the
 *     houses and the trees round them instead of a studio. Captured again
 *     as the camera goes into another room, or a few metres on — a face a
 *     frame while walking, all at once after a jump.
 *
 * A published view drawn from its bake keeps only the eye's adaptation
 * (and the windows as seen from in or out): its light is the bake's, its
 * shadows its own. The editor's plain light (World/PlainLight.js) has none
 * of it: the probe and the sun's shadow map are first made when its
 * realistic preview first draws.
 *
 * From above (the bird's-eye view, World/BirdView.js) no shadow map is
 * drawn again, in any view (holdShadows), and the floor shown of a view
 * drawn from its bake is exposed as its rooms would be (LightMeter.above).
 */
export default class Realism {
    constructor(experience) {
        this.experience = experience;
        this.sunFit = new SunFit();
        this.probe = null;
        /** How a lamplit room is exposed at night (NIGHT). */
        this.night = NIGHT;
    }

    /** The world's sky, when the view is lit live under one — otherwise null. */
    get sky() {
        const world = this.experience.world;
        if (!world?.sky || !world.environment || world.sceneBuilder?.baked) return null;
        return world.sky;
    }

    applyQuality(quality) {
        const world = this.experience.world;
        if (!quality.shadow.fit && this.sunFit.active) {
            this.sunFit.release(world?.environment);
        }
        if ((quality.shadow.every ?? 1) <= 1) this.releaseShadows();
        if (!quality.probe && this.probe) {
            this.probe.dispose();
            this.probe = null;
        }
        this.sunFit.dirty = true;
    }

    /** Before a frame of `camera`. */
    update(camera) {
        const world = this.experience.world;
        // Under the editor's plain light (World/PlainLight.js) none of it is drawn, nor made.
        if (world?.plain) return;
        // From above, the sun's shadow is left as it is (holdShadows), whatever has asked for it since the last frame.
        if (this.heldShadows) this.keepShadowsHeld();
        if (world?.sceneBuilder?.baked) return this.updateBaked(camera);
        const sky = this.sky;
        if (!sky?.current || !camera.isPerspectiveCamera) return;
        const quality = QUALITY;
        const renderer = this.experience.renderer.renderer;
        const room = this.roomOf(camera);
        sky.setGlassView(!room);
        // (From above, the sun's shadow is neither fitted to the view nor drawn again.)
        if (!this.heldShadows) {
            const refit = quality.shadow.fit && this.sunFit.update(world.environment, camera, quality, room, renderer);
            this.cadence(renderer, quality, refit);
        }
        if (quality.probe) {
            this.probe ??= new RoomProbe(this.experience);
            this.probe.update(camera, room, sky);
        }
        // Graded (AgX lifts the dark), the dusk is exposed down a little to stay dusk.
        const night = sky.variant === "night";
        this.adapt(night ? (quality.grade ? NIGHT_EXPOSURE : 1) : room ? INDOOR_EXPOSURE : 1);
    }

    /**
     * A view drawn from its bake: the eye adapting as it goes in and out, as
     * in a view lit live — outside and at night just as that is — and, under
     * a site's own sky, the windows as seen from in or out. In a room by day
     * its light is the bake's, as it is: only what comes in through the
     * windows and is bounced round, a tenth to a hundredth of the day's,
     * and far from even — a glazed living room, a bedroom with one window.
     * So rather than one exposure for every room, the camera meters what it
     * sees, as a photographer does (LightMeter) — under a sky of its own or
     * not: without one a space's rooms were left as dark as the bake has
     * them beside the day outside.
     *
     * From above (the bird's-eye view) the camera is in no room, and is
     * exposed as the outside is — but what it looks into is a floor of
     * rooms with the roof lifted off, their light the same tenth to a
     * hundredth of the day's: near black beside the garden in the sun. No
     * one exposure shows both. So by day the floor shown is exposed as its
     * rooms would be (LightMeter.above) by bringing up the rooms' own
     * light — every baked surface indoors, and what moves there
     * (SceneBuilder.setIndoorGain) — while the outside keeps its own
     * exposure. Under a sky of its own or not.
     *
     * At night the outside keeps the night's exposure, and so does the view
     * from above; but in a room whose own lamps are on the camera meters
     * the lamps' light as it meters the day's (NIGHT): a room lit by its
     * bake's lamps alone, drawn at the exposure that suits the dusk
     * outside, came out a quarter darker than the same room lit live.
     */
    updateBaked(camera) {
        if (!camera.isPerspectiveCamera) return;
        const world = this.experience.world;
        const sky = world.sky?.current ? world.sky : null;
        // (What the house is lit for: a frame or two ahead of the sky, as the time of day changes — World.houseLighting.)
        const night = world.houseLighting === "night";
        const bird = this.experience.camera?.birdView;
        const above = bird?.active && !night ? bird.floors[bird.level] : null;
        const meter = (this.meter ??= new LightMeter(this.experience));
        // Another time of day is another picture, as a jump's is: exposed for at once, not eased to from the last one's
        // exposure — in a room, night came on at the day's seven times for a frame, and day at the night's.
        const turned = this.shown !== undefined && this.shown !== world.houseLighting;
        this.shown = world.houseLighting;
        const room = this.between(camera, this.roomOf(camera));
        // The room its visitor has asked to see drawn as a view lit live draws it (World/LiveRoom.js), while the
        // camera is in it: exposed as that view exposes a room (update) — the editor's brightness, not the meter's.
        // One exposure for as long as such a room is on screen and the camera is indoors — in it, or in the room next
        // door, still the bake's, on its way in or out (the visitor is in the one drawn so, or was a moment ago): the
        // camera crossing a doorway between a room exposed by the meter and one exposed by rule was a jump of five times
        // either way, each way. From out of doors the outside's own, as ever.
        // (Drawn in the bake's own light — World/RoomBakeLight.js — it is metered as the bake is: `metered`.)
        const unbaked = world.roomLight?.drawn ?? null;
        const live = Boolean(room && unbaked && !unbaked.metered);
        const swapped = live !== Boolean(this.wasLive);
        this.wasLive = live;
        // A room shown so under a camera exposed for its bake — several times the unbaked view's exposure, by day —
        // would be white for half a second: the exposure comes down in that frame, as the picture changes. One that
        // comes in from out of doors brings the outside's exposure, which is lower: eased up to the room's, as a view
        // lit live eases it (at once, the picture went up 39 levels in the frame the door was crossed).
        const cut = swapped && live && this.experience.renderer.adaptation > unbaked.adaptation;
        // Where the camera is, before every frame — in a room or not, walking or from above.
        meter.track(camera, turned || (swapped && !live));
        // (Before anything is metered: a room is metered as it is.) From indoors the rooms round the one drawn so,
        // still the bake's, are brought up as far as the bake's own exposure of it would have shown them (`gain`).
        world.sceneBuilder.setIndoorGain(above ? meter.above(above) : live ? unbaked.gain : 1);
        sky?.setGlassView(!room);
        // At night the outside is exposed as it is lit live: the garden, the pool and the street stay night.
        const base = night ? (sky && QUALITY.grade ? NIGHT_EXPOSURE : 1) : 1;
        if (live) return this.adapt(unbaked.adaptation, turned || cut);
        // Out of doors, and from above, that — and at night a house lit live over its bake (asked for in the link, to
        // compare) as it was, and a room open to the air (a loggia: what is seen from it is the garden and the dusk).
        if (!room || (night && (NIGHT.mode === "asis" || world.sceneBuilder.liveLight || this.airy(room)))) return this.adapt(base, turned);
        const exposure = meter.exposure(camera, room, base);
        // Not read yet — a frame or two after walking into a room, or as the light changes —: as it is, until it is.
        // (Its clock kept meanwhile: the exposure is eased to from when the reading comes — left standing, the first
        // step was as long as the wait, most of the way in one frame.)
        if (exposure === null) {
            this.adaptedAt = performance.now();
            return;
        }
        // After a jump: at once, as the jump itself was taken.
        this.adapt(base * exposure, meter.landed);
    }

    /**
     * About what a room of a view drawn from its bake is exposed at, over
     * the outside's exposure, as its light is now (LightMeter.would) — for
     * a room drawn as a view lit live draws it (World/LiveRoom.js), which is
     * exposed otherwise, to bring the rooms next door up by the difference.
     */
    bakedExposure(room) {
        const world = this.experience.world;
        const night = world.houseLighting === "night";
        const sky = world.sky?.current ? world.sky : null;
        const base = night ? (sky && QUALITY.grade ? NIGHT_EXPOSURE : 1) : 1;
        if (night && (NIGHT.mode === "asis" || this.airy(room))) return base;
        const meter = (this.meter ??= new LightMeter(this.experience));
        return base * meter.would(room, base);
    }

    /** Whether a room under a ceiling stands open to the air (shared/daylight.js's airyRooms). */
    airy(room) {
        const spec = this.experience.world.sceneBuilder.spec;
        if (this.airyOf !== spec) {
            this.airyOf = spec;
            this.airyRooms = airyRooms(spec);
        }
        return this.airyRooms.has(room.id);
    }

    /**
     * The room a camera of a view drawn from its bake is exposed for, where
     * it is in none (`room` null) but has not left the one it was in: under
     * a door, in the thickness of its wall, it is on no room's floor — the
     * rooms' floors stop at their walls' faces — and for the few frames of
     * every doorway the exposure eased towards the outside's and back: by
     * day a room metered at thirteen times it dipped to seven on the way
     * into the next, and a lamplit one at night would dip as far as the
     * night's own. There — on no floor at all, with a room under a ceiling
     * within THRESHOLD of it — it is still in the room it was last in (or,
     * that one out of reach, the one it is coming to). Out on a terrace or
     * the street's floor, further from the house than that, or from above,
     * it is out, and stays out until it is next in a room.
     */
    between(camera, room) {
        if (room) return (this.wasIn = room);
        const last = this.wasIn;
        if (!last) return null;
        this.wasIn = null;
        if (this.experience.camera?.birdView?.active) return null;
        const builder = this.experience.world.sceneBuilder;
        const { x, z } = camera.position;
        const y = camera.position.y - 1.2;
        if (builder.roomAt(x, y, z)) return null;
        let found = null;
        for (const [dx, dz] of AROUND) {
            const near = builder.roomAt(x + dx * THRESHOLD, y, z + dz * THRESHOLD);
            if (!near || near.ceiling_finish === "none") continue;
            found ??= near;
            if (near === last) found = last;
        }
        if (found) this.wasIn = last;
        return found;
    }

    /**
     * As a view goes over to its bake (World), whatever the live path took
     * on before it was in — frames drawn while the furniture of a publish
     * without a runtime file loaded — given back: the shadows drawn every
     * frame, the sky's light rather than a probe's, the sun's shadow its
     * own size. Where the sun is, the bake's light then says (setLighting).
     */
    releaseLive() {
        this.releaseShadows();
        this.probe?.dispose();
        this.probe = null;
        if (this.sunFit.active) {
            this.sunFit.release(null);
            const sun = this.experience.world?.environment?.sun;
            if (sun) sun.shadow.radius = 1;
        }
    }

    /**
     * The room the camera is in, indoors only under a ceiling: a terrace's,
     * a path's or the street's slab is a room to the builder, but open to
     * the sky.
     */
    roomOf(camera) {
        const world = this.experience.world;
        const builder = world.sceneBuilder;
        // From the bird's-eye view the camera is high over the floor it
        // shows, in no room — though often where a room of a floor above
        // was, which the view has taken away.
        if (this.experience.camera?.birdView?.active) return null;
        const indoors = (r) => (r && r.ceiling_finish !== "none" ? r : null);
        const room = indoors(builder?.roomAt(camera.position.x, camera.position.y - 1.2, camera.position.z) ?? null);
        if (room) return room;
        // A walking visitor's third-person camera can sit in a wall or a
        // doorway behind them: their own room is the one that counts — in a
        // public view as in the editor. Not while driving, when the feet
        // stay where the car was got into.
        const feet = world.player?.player?.collider?.start;
        if (feet && !world.player?.inVehicle) {
            return indoors(builder?.roomAt(feet.x, feet.y - 0.3, feet.z) ?? null);
        }
        return null;
    }

    /**
     * How often the sun's shadow map is drawn again: every frame at the
     * lower steps, where it is small; at the top steps, whose map is
     * large, every `every` frames — and at once whenever its fit moves.
     * What casts the shadows hardly moves (the trees' shadows don't sway):
     * the people, the car and the doors, at 20–30 a second.
     */
    cadence(renderer, quality, refit) {
        const every = quality.shadow.every ?? 1;
        if (every <= 1) return this.releaseShadows();
        // The sun's map as well as the renderer's: a lamp's shadow drawn
        // again (World/LampPool.js) flags the renderer, and would draw the
        // sun's, the largest, with it.
        const sun = this.experience.world?.environment?.sun;
        if (!this.ownsShadowUpdates) {
            renderer.shadowMap.autoUpdate = false;
            if (sun) sun.shadow.autoUpdate = false;
            this.ownsShadowUpdates = true;
            refit = true;
        }
        this.frame = (this.frame ?? 0) + 1;
        if (refit || this.frame % every === 0) {
            renderer.shadowMap.needsUpdate = true;
            if (sun) sun.shadow.needsUpdate = true;
        }
    }

    /**
     * The shadows drawn every frame again, the sun's with them: at a step
     * that draws them so, as a view goes over to its bake, and while the
     * editor draws its own frames (Renderer), which this does not see.
     */
    releaseShadows() {
        if (!this.ownsShadowUpdates) return;
        this.experience.renderer.renderer.shadowMap.autoUpdate = true;
        const sun = this.experience.world?.environment?.sun;
        // (Held, from above, the sun's stays as it is until it is let go: holdShadows.)
        if (sun && !this.heldShadows) sun.shadow.autoUpdate = true;
        this.ownsShadowUpdates = false;
    }

    /**
     * From above (World.lightFromAbove) no shadow map is drawn again, in
     * any view, until the view is left: not for what moves, not now and
     * then, not as the time of day changes. The sun's is the one that would
     * be — a lamp's is drawn only for a lamp that is lit, and none is
     * (World/LiveLamps.js, World/LampPool.js).
     *
     * Its map then goes stale: a floor's view has taken the roof and the
     * floors over it away, the visitor walks on under it. So unless it is
     * to be kept (`keep`: a bake lit live, whose map of the whole house goes
     * on shading what moves and the garden as it did), it shades nothing
     * meanwhile: every point is put out of its frustum, which three's
     * shadow lookup and the bake's sun shade (SceneBuilder) both take as
     * lit, without a sample — and without a shader built again, as taking
     * the shadow off the light would have every lit material's. Let go, it
     * is drawn again at once, which puts its frustum back.
     */
    holdShadows(held, { keep = false } = {}) {
        const sun = this.experience.world?.environment?.sun;
        if (Boolean(held) === Boolean(this.heldShadows) || !sun) return;
        if (held) {
            // As it is drawn when nothing here says when: every frame, or — its lamps', a bake's — as they ask.
            this.heldShadows = { keep, auto: sun.shadow.autoUpdate || Boolean(this.ownsShadowUpdates) };
            sun.shadow.autoUpdate = false;
            this.keepShadowsHeld();
            return;
        }
        sun.shadow.autoUpdate = this.heldShadows.auto && !this.ownsShadowUpdates;
        this.heldShadows = null;
        sun.shadow.needsUpdate = true;
        this.experience.renderer.renderer.shadowMap.needsUpdate = true;
        this.sunFit.dirty = true;
    }

    /** Before each frame from above: whatever has asked for the sun's shadow meanwhile (a new time of day) left unanswered. */
    keepShadowsHeld() {
        const sun = this.experience.world?.environment?.sun;
        if (!sun) return;
        sun.shadow.needsUpdate = false;
        if (!this.heldShadows.keep) sun.shadow.matrix.copy(NO_SHADOW);
    }

    /**
     * The exposure as the eye takes it: up in a room by day, where there
     * is far less light than out in the sun, eased over half a second or
     * so — at once after a jump, or when told to (`atOnce`).
     */
    adapt(target, atOnce = false) {
        const renderer = this.experience.renderer;
        const now = performance.now();
        const dt = Math.min(0.25, (now - (this.adaptedAt ?? now)) / 1000);
        this.adaptedAt = now;
        const current = renderer.adaptation;
        const jump = this.experience.camera.activeCamera.position.distanceTo(this.lastAt ?? _v.set(Infinity, 0, 0)) > JUMP;
        this.lastAt = (this.lastAt ?? new THREE.Vector3()).copy(this.experience.camera.activeCamera.position);
        const next = jump || atOnce ? target : current + (target - current) * (1 - Math.exp(-dt * 4));
        renderer.setAdaptation(Math.abs(next - target) < 0.002 ? target : next);
    }

    /** Whatever is pending — a probe's faces — drawn now. */
    settle(camera = this.experience.camera.activeCamera) {
        this.update(camera);
        this.probe?.settle();
    }

    /**
     * The windows as a frame of `camera` leaves them (update) — as seen from
     * in or from out — without the frame: for a publish that holds the scene
     * lit as a visitor will see it, but not drawn (World.holdRealistic).
     */
    lookThroughGlass(camera = this.experience.camera.activeCamera) {
        const sky = this.sky;
        if (!sky?.current || !camera.isPerspectiveCamera) return;
        sky.setGlassView(!this.roomOf(camera));
    }

    dispose() {
        this.probe?.dispose();
        this.probe = null;
        this.meter?.dispose();
        this.meter = null;
    }
}

// ---------------------------------------------------------------------
// The sun's shadow, fitted to the view
// ---------------------------------------------------------------------

/**
 * How much brighter a room is exposed by day than the outside: as the
 * renders' interiors are, daylit, white walls not blown out.
 */
export const INDOOR_EXPOSURE = 2.2;
/**
 * In a room of a view drawn from its bake, the exposure that brings what
 * the camera sees to this (LightMeter: the log-average of its light, as
 * the view's exposure takes it): as bright as a room lit live is drawn,
 * and the renders' interiors are — matched in Ladonia's living rooms and
 * bedrooms, which all came to about the same.
 */
const METER_KEY = 0.18;
/** At most this much over the outside's exposure: five stops, for a room with little light. */
const METER_MOST = 32;
/** Metered again at most every this many seconds while the camera moves. */
const METER_EVERY = 0.2;
/** How far the camera goes between two frames, in metres, to have jumped — a teleport, the view from above left — rather than walked. */
const JUMP = 3;
/** How far from a room, in metres, a camera on no room's floor is still in it (Realism.between): half the thickest wall a door stands in, and less than an outside wall is thick. */
const THRESHOLD = 0.2;
/** The ways looked for it: eight, round the camera. */
const AROUND = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);
/** And at dusk, graded: down, so that the lit windows and the lamps carry the picture. */
export const NIGHT_EXPOSURE = 0.85;
/**
 * At night, in a room of a view drawn from its bake whose own lamps are on
 * (LightMeter.lamplit), the camera adapts to the room as it does by day —
 * on top of the night's own exposure, which the outside keeps:
 *
 *   - What is metered is the part of the frame the lamps light: a point
 *     counts by how far its light, as the night's exposure takes it, is
 *     over `floor` (nothing under the first, all of it over the second).
 *     What is under it is the night — a window, a television, a doorway
 *     into a dark room — and is no reason to expose for more: counted as
 *     the day's meter counts dark points, a room looked at towards its
 *     window came up by a stop, and the garden beyond with it.
 *   - The log-average of that part is brought to `key`, at most `most`
 *     times the night's exposure and never under it. (With the part's own
 *     average, not the frame's, this draws a lit room a shade under a
 *     daylit one: Ladonia's, mean level 86 to 100 for the day's 105.)
 *   - ...by as much as that part is of the frame (`share`: none of it
 *     under the first, all of it over the second), so that with nothing
 *     but the night in view — at a window, looking out — the night is
 *     drawn as it is out of doors.
 *   - A room whose lamps are off is never brought up, whatever it shows
 *     of the room next door or of the garden's lights: a dark room stays
 *     dark. Walked out of into one, or as its switch is turned, the
 *     exposure eases as it does by day (Realism.adapt).
 *
 * Only where the view is drawn through post-processing (a site's own sky,
 * the slider's Balanced step and up), where the frame's own light can be
 * read and where the night's grade and exposure are what draw a lamplit
 * room dark. Drawn straight to the screen — the two lowest steps, a space
 * without a sky of its own — a lit room is as bright as that without it
 * (Ladonia's at the Fast step: mean level 76 to 112; Wrenfield's 141 to
 * 196), and is left as it is.
 *
 * `mode`: "meter"; or, to compare (`?night=` in the link), "lift" — every
 * lamplit room by `lift`, whatever it shows — and "asis", nothing.
 */
const NIGHT = { mode: "meter", key: 0.2, most: 2, floor: [0.008, 0.025], share: [0.05, 0.25], lift: 1.4 };
{
    const asked = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("night") : null;
    if (asked === "asis" || asked === "lift" || asked === "meter") NIGHT.mode = asked;
}

/** A shadow matrix that puts every point outside the shadow's frustum: nothing shaded, nothing sampled (Realism.holdShadows). */
const NO_SHADOW = new THREE.Matrix4().set(0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1);

/** The sun's angular radius drawn: a little more than the real 0.27°, for the renders' softer edges. */
const SUN_RADIUS = THREE.MathUtils.degToRad(0.55);
/** Metres all round the camera always in the map: the room behind it, the walls round it. */
const ROUND = 14;

const _corners = Array.from({ length: 16 }, () => new THREE.Vector3());
const _v = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _inverse = new THREE.Matrix4();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _centre = new THREE.Vector3();

export class SunFit {
    constructor() {
        this.active = false;
        this.fit = null;
        this.dirty = true;
    }

    /** Back to the environment's own fit, over the whole site. */
    release(environment) {
        this.active = false;
        this.fit = null;
        if (!environment) return;
        environment.sun.shadow.radius = 1;
        environment.sun.target.position.set(0, 0, 0);
        environment.fitShadows();
        environment.experience.world?.sky?.placeSun?.();
    }

    /**
     * `over`, for a room of a view drawn from its bake that is drawn as a
     * view lit live draws it (World/LiveRoom.js): its sun shades that room
     * alone, so its map is fitted over the room's corners (`corners`) in
     * place of what the camera sees, at the size `mapSize(side)` gives for
     * a square of that side — everything else as here.
     */
    update(environment, camera, quality, room, renderer, over = null) {
        const sun = environment.sun;
        if (!sun.visible || !sun.castShadow) return false;
        // The sun's way, from where the sky put it (Sky.placeSun).
        _dir.copy(sun.position).sub(sun.target.position).normalize();
        if (!Number.isFinite(_dir.x)) return false;
        _up.set(0, 1, 0);
        if (Math.abs(_dir.y) > 0.99) _up.set(0, 0, 1);
        _right.crossVectors(_up, _dir).normalize();
        _up.crossVectors(_dir, _right).normalize();
        // Light space: x right, y up, z towards the sun.
        _basis.makeBasis(_right, _up, _dir);
        _inverse.copy(_basis).invert();

        // What the camera sees out to the reach (less from inside, where
        // walls stop the eye), and the cube round it.
        if (!over) {
            const reach = Math.min(camera.far, quality.shadow.reach * (room ? 0.5 : 1));
            const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
            camera.updateMatrixWorld();
            let k = 0;
            for (const d of [camera.near, reach]) {
                const h = d * tan;
                const w = h * camera.aspect;
                for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) _corners[k++].set(sx * w, sy * h, -d).applyMatrix4(camera.matrixWorld);
            }
            for (let i = 0; i < 8; i++) _corners[k++].set(i & 1 ? ROUND : -ROUND, i & 2 ? ROUND : -ROUND, i & 4 ? ROUND : -ROUND).add(camera.position);
        }
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const corner of over?.corners ?? _corners) {
            _v.copy(corner).applyMatrix4(_inverse);
            x0 = Math.min(x0, _v.x);
            x1 = Math.max(x1, _v.x);
            y0 = Math.min(y0, _v.y);
            y1 = Math.max(y1, _v.y);
        }
        // No further than the site: everything that casts a shadow in it.
        const extent = (this.extent ??= environment.footprintExtent());
        let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < 8; i++) {
            _v.set(i & 1 ? extent : -extent, i & 2 ? 40 : -8, i & 4 ? extent : -extent).applyMatrix4(_inverse);
            s0 = Math.min(s0, _v.x);
            s1 = Math.max(s1, _v.x);
            t0 = Math.min(t0, _v.y);
            t1 = Math.max(t1, _v.y);
            z0 = Math.min(z0, _v.z);
            z1 = Math.max(z1, _v.z);
        }
        x0 = Math.max(x0, s0);
        x1 = Math.min(x1, s1);
        y0 = Math.max(y0, t0);
        y1 = Math.min(y1, t1);
        if (x1 <= x0 || y1 <= y0) return false;

        // Kept while what is needed is inside it and it is not much too big:
        // a fit that moves seldom, so the map is seldom drawn again.
        const wanted = Math.max(x1 - x0, y1 - y0, 8);
        const mapSize = over ? over.mapSize(Math.pow(2, Math.ceil(Math.log2(wanted * 1.12) * 8) / 8)) : quality.shadow.size;
        const kept = this.fit;
        // The same sun within a hair (re-derived from positions this moves, it never matches exactly).
        const sameLight = kept && kept.dir.angleTo(_dir) < 1e-4 && kept.mapSize === mapSize && kept.filter === quality.shadow.filter;
        if (!this.dirty && sameLight && x0 >= kept.cx - kept.size / 2 && x1 <= kept.cx + kept.size / 2 && y0 >= kept.cy - kept.size / 2 && y1 <= kept.cy + kept.size / 2 && kept.size <= wanted * 1.45) {
            return false;
        }
        // A square a little bigger than needed, its size in steps of an
        // eighth of an octave, its middle on a texel.
        const size = Math.pow(2, Math.ceil(Math.log2(wanted * 1.12) * 8) / 8);
        const texel = size / mapSize;
        const cx = Math.round((x0 + x1) / 2 / texel) * texel;
        const cy = Math.round((y0 + y1) / 2 / texel) * texel;
        const depth = z1 - z0 + 20;
        this.fit = { cx, cy, size, mapSize, filter: quality.shadow.filter, dir: _dir.clone() };
        this.dirty = false;
        this.active = true;

        // The light's camera over the square, from beyond the site's highest corner.
        _centre.set(cx, cy, z0 + depth / 2).applyMatrix4(_basis);
        sun.target.position.copy(_centre);
        sun.position.copy(_centre).addScaledVector(_dir, depth / 2 + 10);
        sun.updateMatrixWorld();
        sun.target.updateMatrixWorld();
        const shadow = sun.shadow;
        const cam = shadow.camera;
        cam.left = -size / 2;
        cam.right = size / 2;
        cam.top = size / 2;
        cam.bottom = -size / 2;
        cam.near = 1;
        cam.far = depth + 20;
        cam.updateProjectionMatrix();
        if (shadow.mapSize.x !== mapSize) {
            shadow.mapSize.set(mapSize, mapSize);
            shadow.map?.dispose();
            shadow.map = null;
        }
        // Offsets of a texel or so: no acne, no shadows lifting off their feet.
        const range = cam.far - cam.near;
        shadow.normalBias = texel * 1.4;
        shadow.bias = -(texel * (quality.shadow.filter === "pcss" ? 1.5 : 0.8)) / range;
        shadow.radius = quality.shadow.filter === "pcss" ? -((range * 2 * Math.tan(SUN_RADIUS)) / size) : quality.shadow.filter === "soft" ? 1 : 1.5;
        shadow.needsUpdate = true;
        if (renderer && !renderer.shadowMap.autoUpdate) renderer.shadowMap.needsUpdate = true;
        return true;
    }
}

// ---------------------------------------------------------------------
// The light in the room, captured
// ---------------------------------------------------------------------

/** The cube's side: the sky's own prefiltered size, so either can be swapped in without a new shader. */
export const PROBE_SIZE = 256;

export class RoomProbe {
    /**
     * @param {Experience} experience
     * @param {object} [options]  for a room of a view drawn from its bake that is drawn as a view lit live draws it (World/LiveRoom.js):
     * @param {{ useProbe: Function }} [options.sky]  what takes the probe's light in the world's sky's place
     * @param {(renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void} [options.draw]  how a face is drawn, in place of one render of the scene
     * @param {boolean} [options.paced]  never all six faces in one frame, even its first or after a jump: a face a frame, always (`settle` still draws what is left)
     * @param {THREE.PMREMGenerator} [options.pmrem]  what prefilters it, kept by whoever gives it (its shaders built once a visit, not once a probe)
     */
    constructor(experience, { sky = null, draw = null, paced = false, pmrem = null } = {}) {
        this.experience = experience;
        this.renderer = experience.renderer.renderer;
        this.scene = experience.scene;
        this.sky = sky;
        this.draw = draw;
        this.paced = paced;
        this.cube = new THREE.WebGLCubeRenderTarget(PROBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
        this.camera = new THREE.CubeCamera(0.05, 500, this.cube);
        this.ownPmrem = !pmrem;
        this.pmrem = pmrem ?? new THREE.PMREMGenerator(this.renderer);
        this.output = null;
        this.at = new THREE.Vector3(Infinity, 0, 0);
        this.room = undefined;
        this.face = 6;
        this.variant = null;
        this.applied = null;
    }

    /** Where the probe should be for a camera: in its room, clear of the walls; outside, where it is. */
    place(camera, room, out) {
        out.copy(camera.position);
        if (!room) return out;
        const xs = room.polygon.map((p) => p[0]);
        const zs = room.polygon.map((p) => p[1]);
        const inset = 0.35;
        out.x = THREE.MathUtils.clamp(out.x, Math.min(...xs) + inset, Math.max(...xs) - inset);
        out.z = THREE.MathUtils.clamp(out.z, Math.min(...zs) + inset, Math.max(...zs) - inset);
        out.y = room.elevation + Math.min(1.4, room.height * 0.5);
        return out;
    }

    update(camera, room, sky) {
        const want = this.place(camera, room, _v);
        const variant = sky.variant;
        const moved = want.distanceTo(this.at);
        const far = room ? 2.5 : 10;
        // The sky's materials shared out again (the furniture in, the house merged).
        const rebuilt = sky.version !== this.version;
        // A light switched (World): drawn again a face a frame, as walking.
        const relit = (sky.lightVersion ?? 0) !== this.lightVersion;
        const changed = room !== this.room || variant !== this.variant || moved > far || rebuilt || relit;
        if (changed) {
            // A jump (a teleport, the bird's eye, a new pose): everything now.
            const jump = moved > 6 || this.output === null || variant !== this.variant || rebuilt;
            this.version = sky.version;
            this.lightVersion = sky.lightVersion ?? 0;
            this.at.copy(want);
            this.pendingRoom = room;
            this.variant = variant;
            this.room = room;
            this.face = 0;
            this.camera.position.copy(this.at);
            this.camera.updateMatrixWorld(true);
            if (jump && !this.paced) {
                this.settle();
                return;
            }
        }
        if (this.face < 6) this.drawFace(this.face++);
        if (this.face === 6) this.finish();
    }

    /** Every face still to draw, now. */
    settle() {
        while (this.face < 6) this.drawFace(this.face++);
        if (this.face === 6) this.finish();
    }

    drawFace(index) {
        const renderer = this.renderer;
        const sky = this.sky ?? this.experience.world.sky;
        if (this.camera.coordinateSystem !== renderer.coordinateSystem) {
            this.camera.coordinateSystem = renderer.coordinateSystem;
            this.camera.updateCoordinateSystem();
        }
        const previous = renderer.getRenderTarget();
        const autoUpdate = renderer.shadowMap.autoUpdate;
        // The room lit by the sky's share, as it was before any probe —
        // not by the probe itself, whose light would gather round and round.
        sky.useProbe(null);
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(this.cube, index);
        // Not the running water and its steam (World/Water.js): drawn for the view's own eye — its steam's looks
        // through it from there, and from inside a shower with no depth test — they are no light of the room's, and
        // drawn here they lit and coloured the room's reflections until the probe was next drawn.
        const water = this.experience.world?.water?.group ?? null;
        const watered = water?.visible ?? false;
        if (water) water.visible = false;
        try {
            if (this.draw) this.draw(renderer, this.camera.children[index]);
            else renderer.render(this.scene, this.camera.children[index]);
        } finally {
            if (water) water.visible = watered;
        }
        renderer.setRenderTarget(previous);
        renderer.shadowMap.autoUpdate = autoUpdate;
        if (this.applied) sky.useProbe(this.applied, this.appliedIndoor);
    }

    /** All six faces drawn: prefiltered, and handed to the sky's materials. */
    finish() {
        this.face = 7;
        this.output = this.pmrem.fromCubemap(this.cube.texture, this.output);
        this.applied = this.output.texture;
        // By day: at night a room's light is its own glow (Sky.glowIndoors).
        this.appliedIndoor = Boolean(this.room) && this.variant === "day";
        (this.sky ?? this.experience.world.sky).useProbe(this.applied, this.appliedIndoor);
    }

    dispose() {
        (this.sky ?? this.experience.world?.sky)?.useProbe(null);
        this.cube.dispose();
        this.output?.dispose();
        if (this.ownPmrem) this.pmrem.dispose();
    }
}

// ---------------------------------------------------------------------
// A camera's light meter, in a room of a view drawn from its bake
// ---------------------------------------------------------------------

/** The mean of `light` — eighteen numbers a probe: its light from six ways — over the bake's probes in a room, or null if it has none. */
function meanLight(probes, light, room) {
    const zone = probes.zoneIds.indexOf(room.id);
    if (zone < 0) return null;
    let sum = 0;
    let n = 0;
    for (let index = 0; index < probes.count; index++) {
        if (probes.zoneOf[index] !== zone) continue;
        const at = index * 18;
        let each = 0;
        for (let f = 0; f < 6; f++) each += 0.2126 * light[at + f * 3] + 0.7152 * light[at + f * 3 + 1] + 0.0722 * light[at + f * 3 + 2];
        sum += each / 6;
        n++;
    }
    return n ? sum / n : null;
}

/** What the frame is brought down to for a reading: a few pixels to read back, each the average of TAPS × TAPS points of it. */
const METER_SIZE = [16, 9];
const METER_TAPS = 8;
/**
 * Without post-processing (the slider's lowest steps, phones; a space
 * without a sky of its own at any step), the view is drawn straight to the
 * screen, tone mapped: there is no picture of its light to read. There the
 * room's light is read from the bake's light probes instead (ProbeLight):
 * the room's own, on average, brought to this — under a site's own sky, at
 * the lowest steps, as they were tuned (brighter than the frame's reading
 * gives the steps above).
 */
const PROBE_KEY = 0.55;
/**
 * ...and in a space without a sky of its own, to this: what a reading of
 * the frame comes to for a room's probes, on average (Ladonia's rooms:
 * 0.21 to 0.24 of their probes' light), which draws such a space's rooms
 * as bright as they are lit live (Wrenfield's living room: mean level 91
 * for the live view's 89; at PROBE_KEY, 148). Also what stands in for a
 * reading of the frame for the frame or two after a jump, before one can
 * be had.
 */
const ROOM_KEY = 0.22;
/** Without probes either (fully baked, "static"): this, in every room — under a site's own sky, and without one. */
const METER_FALLBACK = 12;
const METER_FALLBACK_PLAIN = 6;
/**
 * ...but in a room whose own ceiling light is on, this: about what such a
 * room is read at (Ladonia's, ×1.3 to ×1.5; a space without a sky, whose
 * rooms are drawn as they are at night, ×1). At the room's daylight
 * exposure its lamp burns it out — which is what a phone, fully baked, is
 * given when its visitor turns a light on by day.
 */
const METER_FALLBACK_LAMPLIT = 1.4;
const METER_FALLBACK_LAMPLIT_PLAIN = 1;
/**
 * In a space without a sky of its own, at most this much over the
 * outside's exposure, not METER_MOST: its darkest rooms — a hall with no
 * window, a utility room — are read from their probes alone, whatever the
 * camera sees of them, and at five stops a hall whites out the room and
 * the garden seen from it, and the lightmap's own blocks show.
 */
const METER_MOST_PLAIN = 8;

/**
 * What the camera sees, its light averaged as a camera's meter averages it
 * (the log-average, so the sunlit window and the dark corner both count):
 * the exposure (adaptation, on top of the outside's) that brings it to
 * METER_KEY.
 *
 * Read from the frame itself, as it was last drawn: drawn through
 * post-processing, the scene's light is there before any exposure
 * (PostProcessing's `frame`), and is brought down to a few pixels and read
 * back — without waiting for it: asked for in one frame, it is taken a
 * frame or two on, when the GPU has it. Nothing is drawn a second time for
 * it. (It used to be: the whole scene again, small, into a picture of its
 * own, at every reading — 9 to 15 ms of a frame, twice a second while
 * walking.) Read again in another room, after a jump, when the room's
 * light changes — a lamp switched, a door shut, day or night — and, while
 * the camera moves, every METER_EVERY seconds.
 *
 * Walked into, a room is eased to: the last exposure stays for the frame
 * or two the reading takes. Jumped into (the camera JUMP metres from where
 * the frame before had it: a teleport, the view from above left), it is
 * taken at once — for those frames what stands in for the reading (the
 * room's last, if the jump was within it; else about what its probes say,
 * ROOM_KEY), and then the reading itself, at once too.
 *
 * Without post-processing, the room's light from the bake's probes
 * (PROBE_KEY, ROOM_KEY); without those, the same for every room
 * (METER_FALLBACK).
 */
class LightMeter {
    constructor(experience) {
        this.experience = experience;
        this.renderer = experience.renderer.renderer;
        this.seen = new THREE.Matrix4();
        /** Where the camera was the frame before (track), and whether it has jumped from there. */
        this.where = new THREE.Vector3(Infinity, 0, 0);
        this.leapt = false;
        this.at = -Infinity;
        this.room = null;
        this.key = null;
        /** The last reading of the room, under the light as it is: null in another room, or under another light. */
        this.light = null;
        /** How much of the frame that reading counted: all of it by day; at night, the part the lamps light (NIGHT). */
        this.share = 0;
        /** Whether `light` is of the room, the place and the light as they are now. */
        this.fresh = false;
        /** Whether a jump has yet to be answered with a reading of where it landed. */
        this.jumped = false;
        /** Whether the exposure just given is to be taken at once: a jump's. */
        this.landed = false;
        /** Each room's light by the probes, as they are now (`zonesKey`). */
        this.zones = new Map();
        this.zonesKey = null;
        /** Counts what is read: a reading asked for before a jump is another place's by the time it comes. */
        this.serial = 0;
        /** How many frames had been drawn (PostProcessing's `frames`) at the last change of room, place or light — and when the exposure was last asked for. */
        this.since = 0;
        this.told = 0;
        this.pending = null;
        this.reader = null;
    }

    /**
     * Where the camera is, told before every frame — in a room or not,
     * walking or from above: a jump is what the camera does between two
     * frames, however far it is from where a room was last metered. (Told
     * only in a room, walking in at another door than the one last left by
     * was a jump, and the room came up at once instead of being eased to.)
     */
    track(camera, turned = false) {
        // (`turned`: the time of day has changed under it — as much another picture as a jump's.)
        this.leapt = turned || camera.position.distanceTo(this.where) > JUMP;
        this.where.copy(camera.position);
    }

    /**
     * The exposure for the room `room` as `camera` sees it — or null while
     * there is none to give yet: for the frame or two it takes a first
     * reading to come, walked into the room, or jumped into one without
     * probes to say meanwhile.
     *
     * At night (NIGHT) it is on top of the night's own exposure, `base`,
     * and 1 — the night's, as it is — wherever the room's own lamps are
     * off or there is no frame to read.
     */
    exposure(camera, room, base = 1) {
        const now = performance.now() / 1000;
        camera.updateMatrixWorld();
        const key = this.lightKey();
        const jumped = this.leapt;
        this.landed = false;
        const night = this.experience.world.houseLighting === "night";
        const renderer = this.experience.renderer;
        const drawn = renderer.post?.frames ?? 0;
        // Frames drawn without the meter being asked — out of doors, from
        // above —: a jump before them was not into this room.
        const away = drawn > this.told + 1;
        if (away) this.jumped = false;
        // Another room, another place or another light: what was read is not this one's, nor what is on its way.
        const changed = room !== this.room || key !== this.key || jumped;
        if (changed) {
            // (Jumped within the room, under the same light, its last reading stands in for the next.)
            if (room !== this.room || key !== this.key) this.light = null;
            this.room = room;
            this.key = key;
            this.fresh = false;
            this.jumped ||= jumped;
            this.serial++;
        }
        // The frame there is now was drawn before the change — or, the
        // meter not asked meanwhile, of another view (the bird's-eye one,
        // just left, this room metered as before): the next one drawn is
        // the first to read.
        if (changed || away) this.since = drawn;
        this.told = drawn;
        const exposure = renderer.exposure * renderer.exposureScale * base;
        const world = this.experience.world;
        if (!(exposure > 0)) return night ? 1 : world.sky ? METER_FALLBACK : METER_FALLBACK_PLAIN;
        const probes = world.probes;
        const frame = renderer.post?.frame;
        if (!frame && !(renderer.postWanted && QUALITY.post)) {
            this.landed = this.jumped;
            this.jumped = false;
            // Straight to the screen. At night, as it is: a lit room is bright enough so.
            if (night) return 1;
            // By day: the room's own light, from the probes.
            const light = probes ? this.roomLight(probes, room) : null;
            if (!(light > 0)) return this.unmetered(room);
            return THREE.MathUtils.clamp((world.sky ? PROBE_KEY : ROOM_KEY) / (light * exposure), 1, world.sky ? METER_MOST : METER_MOST_PLAIN);
        }
        // Drawn through post-processing (or about to be): the frame's own light.
        this.take();
        // At night only a room's own lamps are a light to adapt to: with them off the night's exposure, as out of doors.
        const lamplit = night ? this.lamplit(room) : 1;
        if (night && !(lamplit > 0 && NIGHT.mode === "meter")) {
            this.landed = this.jumped;
            this.jumped = false;
            return 1 + (NIGHT.lift - 1) * lamplit;
        }
        const moved = !this.seen.equals(camera.matrixWorld);
        // (Made again, as the slider moves, or sized again, the post-processing counts its frames from nothing.)
        if (drawn < this.since) this.since = 0;
        if (frame && drawn > this.since && !this.pending && (!this.fresh || (moved && now - this.at >= METER_EVERY))) {
            this.at = now;
            this.seen.copy(camera.matrixWorld);
            this.ask(frame, night ? exposure : 0);
        }
        const brought = (light, to) => THREE.MathUtils.clamp(to / (light * exposure), 1, METER_MOST);
        // At night: the lit part of the frame to the night's key, by as much as it is of the frame and as the lamps are on.
        const lit = () => {
            if (!(this.light > 0)) return 1;
            const most = THREE.MathUtils.clamp(NIGHT.key / (this.light * exposure), 1, NIGHT.most);
            return 1 + (most - 1) * THREE.MathUtils.smoothstep(this.share, ...NIGHT.share) * lamplit;
        };
        if (this.fresh && (this.light > 0 || night)) {
            this.landed = this.jumped;
            this.jumped = false;
            return night ? lit() : brought(this.light, METER_KEY);
        }
        // Not read yet. Walked into, the last room's exposure until it is.
        if (!this.jumped) return null;
        // After a jump, at once, what stands in for the reading for the
        // frame or two it takes: the room's last, jumped within it — back
        // from above to where it was left, as it was —; else about what the
        // room's probes say; without probes, the last exposure. At night,
        // about what a lamplit room comes to.
        if (night) {
            this.landed = true;
            return this.light > 0 ? lit() : 1 + (NIGHT.lift - 1) * lamplit;
        }
        const stand = this.light > 0 ? brought(this.light, METER_KEY) : null;
        const light = stand === null && probes ? this.roomLight(probes, room) : null;
        if (stand === null && !(light > 0)) return null;
        this.landed = true;
        return stand ?? brought(light, ROOM_KEY);
    }

    /**
     * About what `room` would be given (exposure) as its light is now,
     * without asking for a reading: by the last reading, if it was of this
     * room under this light; else by what stands in for one after a jump —
     * the room's probes (ROOM_KEY; drawn straight to the screen, as there),
     * or what a room is given without them. At night, a lamplit room's.
     */
    would(room, base = 1) {
        const world = this.experience.world;
        const renderer = this.experience.renderer;
        const exposure = renderer.exposure * renderer.exposureScale * base;
        const night = world.houseLighting === "night";
        if (!(exposure > 0)) return night ? 1 : world.sky ? METER_FALLBACK : METER_FALLBACK_PLAIN;
        const read = Boolean(renderer.post?.frame || (renderer.postWanted && QUALITY.post));
        const known = read && room === this.room && this.key === this.lightKey() && this.light > 0;
        if (night) {
            const lamplit = read ? this.lamplit(room) : 0;
            if (!(lamplit > 0) || NIGHT.mode === "asis") return 1;
            if (!known || NIGHT.mode !== "meter") return 1 + (NIGHT.lift - 1) * lamplit;
            const most = THREE.MathUtils.clamp(NIGHT.key / (this.light * exposure), 1, NIGHT.most);
            return 1 + (most - 1) * THREE.MathUtils.smoothstep(this.share, ...NIGHT.share) * lamplit;
        }
        if (known) return THREE.MathUtils.clamp(METER_KEY / (this.light * exposure), 1, METER_MOST);
        const light = world.probes ? this.roomLight(world.probes, room) : null;
        if (!(light > 0)) return this.unmetered(room);
        if (read) return THREE.MathUtils.clamp(ROOM_KEY / (light * exposure), 1, METER_MOST);
        return THREE.MathUtils.clamp((world.sky ? PROBE_KEY : ROOM_KEY) / (light * exposure), 1, world.sky ? METER_MOST : METER_MOST_PLAIN);
    }

    /**
     * How much of a room's own lamps are on, 0 to 1 (NIGHT): the most of
     * its switches — its ceiling light, a lamp of its own — and of those of
     * the rooms open to it with no wall between (shared/roomGraph.js's
     * openPairs: a hall and the living room it runs into are one space, lit
     * as one). Not the lamps next door, whose light a doorway lets in.
     */
    lamplit(room) {
        const world = this.experience.world;
        const switches = world.switches;
        if (!switches?.list?.length) return 0;
        if (!this.together) {
            // Each room's id -> the ids of the rooms it is one space with, itself among them.
            const spec = world.sceneBuilder.spec;
            const indoor = spec.rooms.filter((each) => each.ceiling_finish !== "none");
            this.together = new Map(indoor.map((each) => [each.id, new Set([each.id])]));
            for (const [a, b] of openPairs(indoor, spec.walls || [])) {
                const both = this.together.get(a.id);
                for (const id of this.together.get(b.id)) {
                    both.add(id);
                    this.together.set(id, both);
                }
            }
        }
        const rooms = this.together.get(room.id);
        if (!rooms) return 0;
        const weights = world.sceneBuilder.switchWeights || [];
        let on = 0;
        for (const item of switches.list) if (rooms.has(item.room)) on = Math.max(on, weights[item.index] ?? 0);
        return Math.min(1, on);
    }

    /**
     * The exposure for a room with nothing to read its light from — fully
     * baked, no probes —: the same for every room (METER_FALLBACK), but for
     * one whose own ceiling light is on, by as much as it is on
     * (METER_FALLBACK_LAMPLIT).
     */
    unmetered(room) {
        const world = this.experience.world;
        const [dark, lamplit] = world.sky ? [METER_FALLBACK, METER_FALLBACK_LAMPLIT] : [METER_FALLBACK_PLAIN, METER_FALLBACK_LAMPLIT_PLAIN];
        const weights = world.sceneBuilder.switchWeights || [];
        let on = 0;
        for (const item of world.switches?.list ?? []) {
            if (item.room === room.id && item.kind === "ceiling") on = Math.max(on, weights[item.index] ?? 0);
        }
        return dark + (lamplit - dark) * Math.min(1, on);
    }

    /**
     * A reading of `frame` — the scene's light as last drawn — asked for:
     * brought down to METER_SIZE, each pixel the log-average of the points
     * of the frame under it, and handed to a buffer on the GPU to be read
     * from once it is there (take). One at a time, each in a buffer of its
     * own: one written again while the browser still holds its copy of the
     * last reading — taken or not — has that copy thrown away, and the
     * browser says so in the console every time.
     */
    ask(frame, night = 0) {
        const reader = this.makeReader();
        if (!reader.ready) return;
        const renderer = this.renderer;
        const gl = renderer.getContext();
        const { exposure, exposureScale } = this.experience.renderer;
        reader.material.uniforms.frame.value = frame;
        // Nothing darker than the brightest exposure can lift counts for
        // more than that: a black screen or an unlit gap would otherwise
        // weigh far more than its share.
        reader.material.uniforms.least.value = METER_KEY / (METER_MOST * exposure * exposureScale * 4);
        // At night (`night`: the night's exposure) only what the lamps light counts, by how far it is over the floor (NIGHT); by day, everything.
        reader.material.uniforms.lit.value.set(night > 0 ? NIGHT.floor[0] / night : 0, night > 0 ? NIGHT.floor[1] / night : 0);
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(reader.target);
        renderer.render(reader.mesh, reader.camera);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, reader.pixels.byteLength, gl.STREAM_READ);
        gl.readPixels(0, 0, ...METER_SIZE, gl.RGBA, gl.FLOAT, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        renderer.setRenderTarget(previous);
        this.pending = { sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), buffer, serial: this.serial, night: night > 0 };
        gl.flush();
    }

    /** The reading asked for, if the GPU has it by now: the frame's light, if it is still this room's. */
    take() {
        if (!this.pending) return;
        const gl = this.renderer.getContext();
        const { sync, buffer, serial, night } = this.pending;
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return;
        this.pending = null;
        gl.deleteSync(sync);
        const wanted = status !== gl.WAIT_FAILED && serial === this.serial;
        const { pixels } = this.reader;
        if (wanted) {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        }
        gl.deleteBuffer(buffer);
        if (!wanted) return;
        // Each pixel: the mean of the logs of the points it counted, and the share of its points that it did.
        let sum = 0;
        let n = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            if (!(pixels[i + 1] > 0) || !Number.isFinite(pixels[i])) continue;
            sum += pixels[i] * pixels[i + 1];
            n += pixels[i + 1];
        }
        // A reading that failed keeps the last — by day: at night one with nothing in it is a view of the night alone.
        if (!n && !night) return;
        this.light = n ? Math.exp(sum / n) : 0;
        // How much of the frame was counted: all of it by day, at night the part the lamps light.
        this.share = n / (pixels.length / 4);
        this.fresh = true;
    }

    /** What reads a frame: made once, its shader built ahead of its first use. */
    makeReader() {
        if (this.reader) return this.reader;
        const [width, height] = METER_SIZE;
        const material = new THREE.ShaderMaterial({
            name: "light-meter",
            uniforms: { frame: { value: null }, least: { value: 0 }, lit: { value: new THREE.Vector2() } },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4( position.xy, 0.0, 1.0 );
                }
            `,
            fragmentShader: /* glsl */ `
                uniform sampler2D frame;
                uniform float least;
                uniform vec2 lit;
                varying vec2 vUv;
                void main() {
                    float sum = 0.0;
                    float n = 0.0;
                    for ( int i = 0; i < ${METER_TAPS}; i ++ ) {
                        for ( int j = 0; j < ${METER_TAPS}; j ++ ) {
                            vec2 at = vUv + ( vec2( float( i ), float( j ) ) + 0.5 - ${(METER_TAPS / 2).toFixed(1)} ) / vec2( ${(width * METER_TAPS).toFixed(1)}, ${(height * METER_TAPS).toFixed(1)} );
                            float light = dot( texture2D( frame, at ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
                            // (A point never drawn is not a number, and is left out.)
                            if ( light >= 0.0 ) {
                                // By day every point counts; at night, by how far it is over the floor (lit).
                                float counts = lit.y > 0.0 ? smoothstep( lit.x, lit.y, light ) : 1.0;
                                sum += counts * log( clamp( light, least, 65504.0 ) );
                                n += counts;
                            }
                        }
                    }
                    gl_FragColor = vec4( n > 0.0 ? sum / n : 0.0, n / ${(METER_TAPS * METER_TAPS).toFixed(1)}, 0.0, 1.0 );
                }
            `,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        const reader = {
            material,
            mesh: new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material),
            camera: new THREE.Camera(),
            target: new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false }),
            pixels: new Float32Array(width * height * 4),
            ready: false,
        };
        reader.mesh.frustumCulled = false;
        this.reader = reader;
        // Its shader built without holding a frame up for it — as it is
        // built to draw into its own target — and it reads from then on.
        const renderer = this.renderer;
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(reader.target);
        const built = renderer.compileAsync(reader.mesh, reader.camera);
        renderer.setRenderTarget(previous);
        built.catch(() => {}).then(() => (reader.ready = true));
        return reader;
    }

    /**
     * What the rooms of a floor seen from above (World/BirdView.js's
     * `floors`) would be given, by day, over the outside's exposure — one
     * for the floor: the log-average of its rooms' light, each by its area,
     * nothing darker than the brightest exposure can lift counting for more
     * than that, brought to PROBE_KEY. Read from the bake's light probes,
     * as a room's is without post-processing; without probes (fully baked),
     * what every room is given then. Never metered from the frame: it
     * costs nothing as the view turns and follows the visitor, and holds
     * still while it does.
     *
     * @param {{ level: number, indoors: { room: object, area: number }[] }} floor
     */
    above(floor) {
        const renderer = this.experience.renderer;
        const exposure = renderer.exposure * renderer.exposureScale;
        if (!floor?.indoors.length || !(exposure > 0)) return 1;
        const probes = this.experience.world.probes;
        probes?.compose();
        const key = `${floor.level}|${probes?.key ?? "none"}|${exposure}`;
        if (key === this.aboveKey) return this.aboveGain;
        let gain = METER_FALLBACK;
        if (probes) {
            const least = PROBE_KEY / (METER_MOST * exposure);
            // The rooms daylight reaches say how the floor is exposed: one
            // it does not (shared/daylight.js) is black with its lamp off
            // and lamp-bright with it on — as a day starts —, and counted
            // either way it would pull every other room after it (lit, the
            // ground floor's rooms came out a quarter darker). And they say
            // it by their daylight alone (roomDaylight), whatever lamps are
            // on: a lamp's light reaches the rooms its door or a stairwell
            // opens onto, and a landing lit by the loft's brought its whole
            // floor down a fifth (Wrenfield's first floor: x18.2 with the
            // loft's lamp off, x14.7 with it on). Only a floor of nothing
            // but rooms without daylight goes by them, as their lamps are.
            const dark = this.experience.world.switches?.dark;
            for (const all of [false, true]) {
                let sum = 0;
                let area = 0;
                for (const { room, area: size } of floor.indoors) {
                    if (!all && dark?.has(room.id)) continue;
                    const light = all ? this.roomLight(probes, room) : this.roomDaylight(probes, room);
                    if (!Number.isFinite(light)) continue;
                    sum += Math.log(Math.max(light, least)) * size;
                    area += size;
                }
                if (!(area > 0)) continue;
                gain = THREE.MathUtils.clamp(PROBE_KEY / (Math.exp(sum / area) * exposure), 1, METER_MOST);
                break;
            }
        }
        this.aboveKey = key;
        this.aboveGain = gain;
        return gain;
    }

    /** What the room's light depends on, besides where the camera is. */
    lightKey() {
        const world = this.experience.world;
        const builder = world.sceneBuilder;
        // (Rooms drawn live in the bake's own light — World/RoomBakeLight.js — whose light has moved since they were
        // shown: a switch faded in or out, a lamp handed on, their probe taken again. Read again once it stands.)
        const drawn = world.roomLight?.drawn;
        const live = drawn?.metered && drawn.light ? `|${drawn.light}` : "";
        return `${world.houseLighting}|${builder.lightingInfo?.lightmap ?? ""}|${(builder.switchWeights || []).join(",")}|${builder.doorLightVersion ?? 0}${live}`;
    }

    /** The mean of the light the bake's probes measured in the room (all six ways), as they are now. */
    roomLight(probes, room) {
        if (!room) return null;
        probes.compose();
        // One light's worth kept: every switch's fade and every step of a door's swing is another.
        if (probes.key !== this.zonesKey) {
            this.zones.clear();
            this.zonesKey = probes.key;
        }
        if (this.zones.has(room.id)) return this.zones.get(room.id);
        const value = meanLight(probes, probes.light, room);
        this.zones.set(room.id, value);
        return value;
    }

    /**
     * That, of the time of day's own light alone — the sky's and the sun's
     * and what they bounce, as far as the room's doors let it stay — with
     * no lamp's in it, whichever are on (above).
     */
    roomDaylight(probes, room) {
        const world = this.experience.world;
        const light = probes.variants?.[world.houseLighting];
        if (!room || !light) return this.roomLight(probes, room);
        const key = `${world.houseLighting}|${world.sceneBuilder.doorLightVersion ?? 0}`;
        if (key !== this.daylightKey) {
            this.daylight = new Map();
            this.daylightKey = key;
        }
        if (this.daylight.has(room.id)) return this.daylight.get(room.id);
        const mean = meanLight(probes, light, room);
        const value = mean === null ? null : mean * (world.sceneBuilder.zoneStays?.(room.id) ?? 1);
        this.daylight.set(room.id, value);
        return value;
    }

    dispose() {
        const gl = this.renderer.getContext();
        if (this.pending) {
            gl.deleteSync(this.pending.sync);
            gl.deleteBuffer(this.pending.buffer);
        }
        this.pending = null;
        if (!this.reader) return;
        this.reader.target.dispose();
        this.reader.material.dispose();
        this.reader.mesh.geometry.dispose();
        this.reader = null;
    }
}

import * as THREE from "three";

import { QUALITY } from "./Utils/device.js";

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
 * shadows its own.
 */
export default class Realism {
    constructor(experience) {
        this.experience = experience;
        this.sunFit = new SunFit();
        this.probe = null;
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
        if (world?.sceneBuilder?.baked) return this.updateBaked(camera);
        const sky = this.sky;
        if (!sky?.current || !camera.isPerspectiveCamera) return;
        const quality = QUALITY;
        const renderer = this.experience.renderer.renderer;
        const room = this.roomOf(camera);
        sky.setGlassView(!room);
        const refit = quality.shadow.fit && this.sunFit.update(world.environment, camera, quality, room, renderer);
        this.cadence(renderer, quality, refit);
        if (quality.probe) {
            this.probe ??= new RoomProbe(this.experience);
            this.probe.update(camera, room, sky);
        }
        // Graded (AgX lifts the dark), the dusk is exposed down a little to stay dusk.
        const night = sky.variant === "night";
        this.adapt(night ? (quality.grade ? NIGHT_EXPOSURE : 1) : room ? INDOOR_EXPOSURE : 1);
    }

    /**
     * A view drawn from its bake, under a site's own sky: the windows as
     * seen from in or out, and the eye adapting as it goes in and out, as
     * in a view lit live — outside and at night just as that is. In a room
     * by day its light is the bake's, as it is: only what comes in through
     * the windows and is bounced round, a tenth to a hundredth of the
     * day's, and far from even — a glazed living room, a bedroom with one
     * window. So rather than one exposure for every room, the camera
     * meters what it sees, as a photographer does (LightMeter).
     */
    updateBaked(camera) {
        const sky = this.experience.world.sky;
        if (!sky?.current || !camera.isPerspectiveCamera) return;
        const room = this.roomOf(camera);
        sky.setGlassView(!room);
        if (this.experience.world.lighting === "night") return this.adapt(QUALITY.grade ? NIGHT_EXPOSURE : 1);
        if (!room) return this.adapt(1);
        this.meter ??= new LightMeter(this.experience);
        this.adapt(this.meter.exposure(camera, room));
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
        const indoors = (r) => (r && r.ceiling_finish !== "none" ? r : null);
        const room = indoors(builder?.roomAt(camera.position.x, camera.position.y - 1.2, camera.position.z) ?? null);
        if (room) return room;
        // A walking visitor's third-person camera can sit in a wall or a
        // doorway behind them: their own room is the one that counts — in a
        // public view as in the editor. Not from the bird's-eye view, whose
        // camera is high over the floor it shows, out of every room; nor
        // while driving, when the feet stay where the car was got into.
        const feet = world.player?.player?.collider?.start;
        if (feet && !this.experience.camera?.birdView?.active && !world.player?.inVehicle) {
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
        if (sun) sun.shadow.autoUpdate = true;
        this.ownsShadowUpdates = false;
    }

    /**
     * The exposure as the eye takes it: up in a room by day, where there
     * is far less light than out in the sun, eased over half a second or
     * so — at once after a jump.
     */
    adapt(target) {
        const renderer = this.experience.renderer;
        const now = performance.now();
        const dt = Math.min(0.25, (now - (this.adaptedAt ?? now)) / 1000);
        this.adaptedAt = now;
        const current = renderer.adaptation;
        const jump = this.experience.camera.activeCamera.position.distanceTo(this.lastAt ?? _v.set(Infinity, 0, 0)) > 3;
        this.lastAt = (this.lastAt ?? new THREE.Vector3()).copy(this.experience.camera.activeCamera.position);
        const next = jump ? target : current + (target - current) * (1 - Math.exp(-dt * 4));
        renderer.setAdaptation(Math.abs(next - target) < 0.002 ? target : next);
    }

    /** Whatever is pending — a probe's faces — drawn now. */
    settle(camera = this.experience.camera.activeCamera) {
        this.update(camera);
        this.probe?.settle();
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
const INDOOR_EXPOSURE = 2.2;
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
const METER_EVERY = 0.5;
/** And at dusk, graded: down, so that the lit windows and the lamps carry the picture. */
const NIGHT_EXPOSURE = 0.85;

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

class SunFit {
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

    update(environment, camera, quality, room, renderer) {
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
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const corner of _corners) {
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
        const mapSize = quality.shadow.size;
        const wanted = Math.max(x1 - x0, y1 - y0, 8);
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
const PROBE_SIZE = 256;

class RoomProbe {
    constructor(experience) {
        this.experience = experience;
        this.renderer = experience.renderer.renderer;
        this.scene = experience.scene;
        this.cube = new THREE.WebGLCubeRenderTarget(PROBE_SIZE, { type: THREE.HalfFloatType, generateMipmaps: false });
        this.camera = new THREE.CubeCamera(0.05, 500, this.cube);
        this.pmrem = new THREE.PMREMGenerator(this.renderer);
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
            if (jump) {
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
        const sky = this.experience.world.sky;
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
        renderer.render(this.scene, this.camera.children[index]);
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
        this.experience.world.sky.useProbe(this.applied, this.appliedIndoor);
    }

    dispose() {
        this.experience.world?.sky?.useProbe(null);
        this.cube.dispose();
        this.output?.dispose();
        this.pmrem.dispose();
    }
}

// ---------------------------------------------------------------------
// A camera's light meter, in a room of a view drawn from its bake
// ---------------------------------------------------------------------

/** Its picture's size: enough to average over, a handful of pixels to read back. */
const METER_SIZE = [64, 36];
/**
 * Without post-processing (the slider's lowest steps, phones), the view is
 * drawn straight to the screen, tone mapped — and a picture drawn into a
 * target of its own is not, so every material would be compiled a second
 * time for it, and swapped back and forth at every reading. There the
 * room's light is read from the bake's light probes instead (ProbeLight):
 * the room's own, on average, brought to this.
 */
const PROBE_KEY = 0.55;
/** Without probes either (fully baked, "static"): this, in every room. */
const METER_FALLBACK = 12;

/**
 * What the camera sees, drawn small and unexposed into a half-float target
 * and read back, its light averaged as a camera's meter averages it (the
 * log-average, so the sunlit window and the dark corner both count): the
 * exposure (adaptation, on top of the outside's) that brings it to
 * METER_KEY. Read again at once in another room, after a jump, or when the
 * room's light changes — a lamp switched, a door shut, day or night —
 * and, while the camera moves, at most every METER_EVERY seconds.
 */
class LightMeter {
    constructor(experience) {
        this.experience = experience;
        this.renderer = experience.renderer.renderer;
        this.target = null;
        this.pixels = new Uint16Array(METER_SIZE[0] * METER_SIZE[1] * 4);
        this.seen = new THREE.Matrix4();
        this.where = new THREE.Vector3(Infinity, 0, 0);
        this.at = -Infinity;
        this.room = null;
        this.key = null;
        this.light = null;
        this.zones = new Map();
    }

    /** The exposure for the room `room` as `camera` sees it. */
    exposure(camera, room) {
        const now = performance.now() / 1000;
        camera.updateMatrixWorld();
        const key = this.lightKey();
        const moved = !this.seen.equals(camera.matrixWorld);
        const jumped = camera.position.distanceTo(this.where) > 1.5;
        const due = this.light === null || room !== this.room || key !== this.key || jumped || (moved && now - this.at >= METER_EVERY);
        if (due) {
            this.room = room;
            this.key = key;
            this.at = now;
            this.seen.copy(camera.matrixWorld);
            this.where.copy(camera.position);
            const light = this.measure(camera, room);
            // A reading that failed keeps the last.
            if (Number.isFinite(light) && light > 0) this.light = light;
        }
        const renderer = this.experience.renderer;
        const exposure = renderer.exposure * renderer.exposureScale;
        if (!this.light || !(exposure > 0)) return METER_FALLBACK;
        const brought = this.method === "probes" ? PROBE_KEY : METER_KEY;
        return THREE.MathUtils.clamp(brought / (this.light * exposure), 1, METER_MOST);
    }

    /** What the room's light depends on, besides where the camera is. */
    lightKey() {
        const world = this.experience.world;
        const builder = world.sceneBuilder;
        return `${world.lighting}|${builder.lightingInfo?.lightmap ?? ""}|${(builder.switchWeights || []).join(",")}|${builder.doorLightVersion ?? 0}`;
    }

    /** The light the camera sees (or, without post-processing, its room has), before any exposure. */
    measure(camera, room) {
        if (QUALITY.post) {
            this.method = "picture";
            return this.picture(camera);
        }
        const probes = this.experience.world.probes;
        this.method = probes ? "probes" : "none";
        return probes ? this.roomLight(probes, room) : null;
    }

    /** The log-average of what the camera sees, drawn small. */
    picture(camera) {
        const renderer = this.renderer;
        this.target ??= new THREE.WebGLRenderTarget(...METER_SIZE, { type: THREE.HalfFloatType });
        const previous = renderer.getRenderTarget();
        const autoUpdate = renderer.shadowMap.autoUpdate;
        // The shadows as they are: not drawn again for this.
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(this.target);
        renderer.render(this.experience.scene, camera);
        renderer.setRenderTarget(previous);
        renderer.shadowMap.autoUpdate = autoUpdate;
        // Unread, a pixel is a NaN (0x7e00), and is left out.
        this.pixels.fill(0x7e00);
        renderer.readRenderTargetPixels(this.target, 0, 0, ...METER_SIZE, this.pixels);
        const half = THREE.DataUtils.fromHalfFloat;
        const p = this.pixels;
        // Nothing darker than the brightest exposure can lift counts for
        // more than that: a black screen or an unlit gap would otherwise
        // weigh far more than its share.
        const { exposure, exposureScale } = this.experience.renderer;
        const least = METER_KEY / (METER_MOST * exposure * exposureScale * 4);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < p.length; i += 4) {
            const light = 0.2126 * half(p[i]) + 0.7152 * half(p[i + 1]) + 0.0722 * half(p[i + 2]);
            if (!(light >= 0)) continue;
            sum += Math.log(Math.min(Math.max(light, least), 65504));
            n++;
        }
        return n ? Math.exp(sum / n) : null;
    }

    /** The mean of the light the bake's probes measured in the room (all six ways), as they are now. */
    roomLight(probes, room) {
        if (!room) return null;
        probes.compose();
        const cacheKey = `${room.id}|${probes.key}`;
        if (this.zones.has(cacheKey)) return this.zones.get(cacheKey);
        const zone = probes.zoneIds.indexOf(room.id);
        let sum = 0;
        let n = 0;
        if (zone >= 0) {
            for (let index = 0; index < probes.count; index++) {
                if (probes.zoneOf[index] !== zone) continue;
                const at = index * 18;
                let light = 0;
                for (let f = 0; f < 6; f++) light += 0.2126 * probes.light[at + f * 3] + 0.7152 * probes.light[at + f * 3 + 1] + 0.0722 * probes.light[at + f * 3 + 2];
                sum += light / 6;
                n++;
            }
        }
        const value = n ? sum / n : null;
        this.zones.set(cacheKey, value);
        return value;
    }

    dispose() {
        this.target?.dispose();
        this.target = null;
    }
}

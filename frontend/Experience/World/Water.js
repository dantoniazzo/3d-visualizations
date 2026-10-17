import * as THREE from "three";

import { REACH } from "../../../shared/interact.js";
import {
    GRAVITY,
    HAZE_STEPS,
    MATERIALS,
    boxGeometry,
    floorGeometry,
    hazeMaterial,
    mistMaterial,
    paneGeometry,
    quadCloud,
    rainMaterial,
    releaseNoise,
    rippleMaterial,
    splashMaterial,
    steamMaterial,
    streamGeometry,
    streamMaterial,
    waterNoise,
} from "./waterShaders.js";

/**
 * Running water at every tap and shower, turned on and off by the visitor,
 * and a hot shower's steam.
 *
 * Where the water is comes from the furniture's models: each wet piece
 * carries a few empty nodes, made in Blender beside its fittings
 * (blender/lib/geometry.py's `water`, `control` and `steam`) and kept by the
 * export as node extras (`userData.fixture`), each named
 * `<piece>.water_<group>`, `.control_<group>` or `.steam`:
 *
 *   - `water` at each outlet — a basin's or a sink's spout, a shower's head:
 *     `{ kind: "tap"|"rain", fall, land: [w, d], hot, group, r | size }`,
 *     `fall` how far the water drops to the bowl's or the tray's floor,
 *     `land` the patch it wets there, `r` a spout's or a round head's
 *     radius, `size` a square head's sides;
 *   - `control` at each tap's body or shower's valve: `{ for: [group…],
 *     half: [x, y, z] }`, the box round it that is aimed at, a centimetre
 *     bigger than it;
 *   - `steam` at the middle of each indoor shower's enclosure: `{ half,
 *     screens: [[x0, x1, z0, z1]…] }`, its box, and the plan of each fixed
 *     pane of glass in it, standing the box's height.
 *
 * Every size is said in the piece's own axes, and a node has no turn of its
 * own: its world matrix is its piece's, turned and scaled as placed, so
 * that only where it is matters (a mirrored piece's empties are turned
 * inside out). The water falls down the world's −y.
 *
 * In the editor they come with each piece's model, and move with it; in a
 * public view, which loads no furniture, with the runtime file's "openable"
 * group (Publish/Runtime.js copies every node with `fixture` there, in the
 * world, `userData.piece` its piece) — so a version published before the
 * anchors were made has no water, and one published after has it all.
 *
 * What the visitor does (World/Interactables.js, kinds "tap" and "shower"):
 * E on a tap or a shower's valve, aimed at within REACH.tap or
 * REACH.shower, turns its water on or off — "Turn on the tap", "Turn off
 * the shower", the touch screen's button with the water icon — and so does
 * E standing in a shower's enclosure with nothing else aimed at (a
 * candidate as far along the look ray as it sees, below everything else in
 * priority: a door, a light or the shower's own glass door aimed at is
 * still what E opens). It runs until it is turned off, however far the
 * visitor goes. Every visit starts with everything off; the state is the
 * visitor's own, never saved or sent. From above nothing is aimed at, and
 * what runs goes on running on the floors shown.
 *
 * What is drawn (World/waterShaders.js): from a tap a stream, the
 * droplets it throws up and the wet patch it lands on; from a shower head
 * its drops, their spray off the tray and the tray's wet patch; from an
 * indoor shower that runs hot, steam that builds over HEAT.up seconds —
 * a column of it off the water first, then a layer under the enclosure's
 * top that fills it from there down — spills over the top into the room
 * and clears from the bottom up, gone HEAT.down seconds after the water
 * stops (its body a volume in two boxes, the enclosure's and the room's
 * over it, with puffs that move in it), and the mist it leaves on the
 * panes and on the glass door, which comes after it and clears after it,
 * from the top of the glass down and back up. The taps and the
 * outdoor showers and sinks run cold: no steam. Opened, the water reaches
 * the bowl as falling water would, and shut, the last of it leaves the
 * spout and falls — the drawing's `head` and `tail`, from the time since,
 * not stepped frame by frame.
 *
 * None of it is part of the property: one group outside the scene
 * builder's root, a helper — never merged, batched, baked, published,
 * collided with, met by a ray, stood in for, or taken away by the
 * bird's-eye view's floors with the house: it says itself which floors'
 * water shows (the world's "bird"). Each running fixture is drawn in a few
 * draws of its own, nothing at all while everything is off; steam for the
 * nearest `steaming` hot showers only; how many drops, droplets and puffs,
 * and how many samples a look through the steam takes, by the quality step
 * (Utils/device.js's `water`, through `quality`). The shaders' programs
 * are made before they are drawn with, a few at a time between frames
 * (Renderer.build, as a light's are): once the visitor first comes to water
 * — aims at a tap, stands in a shower — and again whenever what three
 * builds them for has changed since (the scene's fog, the post-processing,
 * the tone mapping, the scene's lights: three keys every shader by how many
 * lights of each kind there are, a ShaderMaterial that takes none
 * included). And whatever is made of a fixture's drawing is drawn only once
 * its own programs are ready (hold): a tap turned on just after a light
 * changed shows its water a frame or two late, never stops one.
 *
 * Lit as the view is (lightAt): one colour for each fixture, the light
 * where it is — in front of a tap, where its visitor stands (lightPoint) —
 * looked up a few times a second (LIGHT_EVERY): the bake's light probes
 * (World/ProbeLight.js), between their light from all round and their
 * brightest way's, brought up from above as their room is; fully baked,
 * the nearest door's probes, as the furniture's doors are
 * (SceneBuilder.tintOpenables); under the editor's plain light, its one
 * light; lit live, the sky's light in a room, the room's lamps, glow and
 * the sun out of doors.
 *
 * In the editor (Pace.js) water near the camera, and water starting or
 * stopping anywhere, asks for every frame through the provider's `busy`;
 * otherwise the walkthrough at rest draws it at its slower rate, and edit
 * mode holds it still. Nothing here needs a page: the module is taken into
 * node as it is (scripts/test-water.mjs).
 */

/** How fast water leaves a spout's aerator, in metres a second. */
const SPOUT_SPEED = 0.6;
/** ...and a shower head's nozzles. */
const NOZZLE_SPEED = 1.6;
/** How long a tap's lever takes to open fully, and to shut, in seconds: the flow eased up and down over it. */
const LEVER = { open: 0.25, shut: 0.18 };
/** How long, in seconds, a shower's steam takes to build while it runs hot, and to clear once it stops. */
export const HEAT = { up: 15, down: 45 };
/** How long the mist on its glass takes to form, after the steam, and to clear, after the steam has. */
export const MIST = { up: 22, down: 70 };
/** How long a bowl or a tray stays wet once the water has stopped landing on it, in seconds. */
const DRAIN = { tap: 1.2, rain: 3.5 };
/** How often the light on what runs is looked up again, in seconds. */
const LIGHT_EVERY = 0.25;
/** How far out in front of a tap its light is looked up, in metres (Water.lightPoint). */
const LIGHT_OUT = 0.5;
/** Water running or steam settling within this of the camera asks the editor for every frame (Pace.js), in metres. */
export const NEAR = 8;
/** Beyond this from the camera, in metres, a fixture's water is not drawn: a tap's stream is a few pixels by then. */
const FAR = { tap: 25, rain: 40 };
/** How far over an enclosure's top a head may be and still stand in it, in metres. */
const OVER_TOP = 0.4;
/** The editor's plain light on water, as on a white wall under it (World/PlainLight.js). */
const PLAIN = 0.8;
/**
 * Lit live, the share of the sky's light a room's surfaces take (World/Sky.js's INDOOR), and what of a live
 * lamp's light, as a lit surface facing it would have it, a stream or a puff of steam takes, from all round.
 */
const SKY_INDOOR = 0.8;
const LAMP_SHARE = 0.35;
/** ...and of the sun's, out of doors: water catches it as glints, not as a wall does. */
const SUN_SHARE = 0.18;
/** A lit room's own glow, lit live (World/RoomGlow.js's STRENGTH and WARM), on what is in it. */
const GLOW = { day: 0.16, night: 0.4, colour: new THREE.Color("#ffc58a") };
/**
 * Fully baked, the doors' light as the probes' would be (lightOf): at
 * Ladonia's 52 indoor fixtures whose rooms' doors have their two sides
 * apart, the probes' light was 1.3 to 3.5 times their own room's side of
 * its doors', 1.64 the middle — the air at a door, a wall's breadth from
 * the room's light, and a plane's light rather than all round's.
 */
const DOOR_LIGHT = 1.6;
/** How much of the light's tint water and steam lose (Water.lightAt): they are not painted. */
export const NEUTRAL = 0.3;
/** A drop's radius thrown up by a tap, and off a shower's tray, in metres. */
const DROPLET = { tap: 0.0016, rain: 0.0022 };
/** The steam's puffs' own opacity, a puff at its thickest: many overlap. */
const STEAM_OPACITY = 0.7;
/** How thick the steam's body gets under the top, its optical depth a metre (World/waterShaders.js's haze)... */
const STEAM_THICK = 0.85;
/**
 * ...in an enclosure of this many cubic metres (a corner shower's cabinet);
 * in a bigger one less, as STEAM_VOLUME / its volume — a walk-in is twice
 * as long and open on a side, and as much steam in it is spread thinner;
 * its dark tiles show it the more (shapeSteam).
 */
const STEAM_VOLUME = 1.6;
/**
 * How thick the column of steam rising off a hot shower's falling water is
 * at its middle, its optical depth a metre: there within a few seconds of
 * the hot water starting, as the layer under the top is not, and as thick
 * in any enclosure.
 */
const STEAM_COLUMN = 0.7;
/** From above, the ceilings gone, steam as much fainter as there is less of it to see through. */
const STEAM_FROM_ABOVE = 0.4;
/** How far out over its enclosure's top a shower's steam may spread into its room, in metres (spillOf)... */
const SPILL = 0.9;
/** ...a step at a time (spillOf). */
const SPILL_STEP = 0.05;
/** How fast the steam's two octaves of noise turn about the water, in radians a second: the coarse one way, the fine the other. */
const SWIRL = [0.17, -0.29];
/** An eye this near a box of steam, outside it, is taken to be in it: its near plane would cut the faces towards it (metres). */
const INSIDE_MARGIN = 0.1;
/** How far inside a room's walls and ceiling the box of steam over an enclosure's top stops, in metres: never in one plane with them. */
const WALL_GAP = 0.01;
/**
 * The order a shower's drawing goes in (renderOrder) with the eye beside
 * its enclosure, in it, and over its top. Its glass is drawn at 0, with the
 * rest of what is seen through: from beside it, all of it before the glass,
 * which is over it, and the room's steam over the top first, the furthest;
 * from in it, all of it after the glass, the room's steam over the top
 * still first; from over the top (the bird's-eye view), after the glass,
 * the room's steam over the top last, the nearest now. The water before
 * the steam that veils it.
 */
const ORDER = Object.freeze({
    outside: Object.freeze({ spill: -4, water: -3, puffs: -2, haze: -1 }),
    inside: Object.freeze({ spill: 1, water: 2, puffs: 3, haze: 4 }),
    above: Object.freeze({ water: 1, puffs: 2, haze: 3, spill: 4 }),
});
/** What the step asks for, where it says nothing (a test's, or a build without it). */
export const COUNTS = Object.freeze({ rain: 160, splash: 18, spray: 40, steam: 12, steaming: 2, haze: 3 });

const _matrix = new THREE.Matrix4();
const _inverse = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _point = new THREE.Vector3();
const _local = new THREE.Vector3();
const _ray = new THREE.Ray();
const _box = new THREE.Box3();
const _hit = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _projection = new THREE.Matrix4();
const _colour = new THREE.Color();
const _colour2 = new THREE.Color();
const _turn = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _buffer = new THREE.Vector2();

/** How far water falls in `t` seconds from a speed of `v0` downwards, in metres. */
export function fallen(t, v0) {
    return t <= 0 ? 0 : v0 * t + 0.5 * GRAVITY * t * t;
}

/** How long water takes to fall `fall` metres from a speed of `v0`, in seconds. */
export function fallTime(fall, v0) {
    return (-v0 + Math.sqrt(v0 * v0 + 2 * GRAVITY * Math.max(0, fall))) / GRAVITY;
}

/**
 * How far down its fall an outlet's water reaches (`head`), and where its
 * last leaves off (`tail`), as shares of the fall, 0 at the outlet and 1
 * where it lands: from when it was opened (`sinceOn` seconds ago) and, if
 * it is shut, when (`sinceOff`, else null).
 */
export function reach(fall, v0, sinceOn, sinceOff = null) {
    const head = fall > 0 ? Math.min(1, fallen(sinceOn, v0) / fall) : 1;
    const tail = sinceOff === null ? 0 : fall > 0 ? Math.min(1, fallen(sinceOff, v0) / fall) : 1;
    return { head, tail };
}

/**
 * A hot shower's steam (0–1) and the mist on its glass a step on: the steam
 * building over HEAT.up while it runs and clearing over HEAT.down after;
 * the mist following it, slower (MIST), never ahead of it on the way up.
 */
export function warm({ heat, mist }, running, delta) {
    heat = running ? Math.min(1, heat + delta / HEAT.up) : Math.max(0, heat - delta / HEAT.down);
    // The glass mists once the air is wet: towards the steam as it stands, after it.
    const goal = smooth(Math.min(1, heat * 1.25));
    mist = goal > mist ? Math.min(goal, mist + delta / MIST.up) : Math.max(goal, mist - delta / MIST.down);
    return { heat, mist };
}

/** Whether a point is in a box from `min` to `max`, or within `margin` of it. */
function inBounds(point, min, max, margin = 0) {
    return point.x >= min.x - margin && point.x <= max.x + margin && point.y >= min.y - margin && point.y <= max.y + margin && point.z >= min.z - margin && point.z <= max.z + margin;
}

/** Whether a point on the ground (x, z) is in a room's plan (its polygon's corners, [x, z]), by the crossings of a line from it. */
function inPlan(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

/** Whether a point, said in a box's own frame, is in it — or over its top by up to `over`. */
export function inBox(local, half, over = 0) {
    return Math.abs(local.x) <= half.x && Math.abs(local.z) <= half.z && local.y >= -half.y && local.y <= half.y + over;
}

/** An ease in and out over 0 to 1. */
function smooth(t) {
    t = Math.min(1, Math.max(0, t));
    return t * t * (3 - 2 * t);
}

/** Three numbers as a vector, or `fallback` where they are not. */
function vector(value, fallback) {
    const ok = Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));
    return new THREE.Vector3(...(ok ? value : fallback));
}

/** Whether a matrix's numbers are those kept (to a rounding: a group's matrix is made again each frame). */
function sameMatrix(elements, kept) {
    for (let i = 0; i < 16; i++) if (!(Math.abs(elements[i] - kept[i]) < 1e-7)) return false;
    return true;
}

/** An anchor's name in its piece: `water_<group>`, `control_<group>[+<group>…]` or `steam`. */
function anchorName(fixture) {
    if (fixture.water) return `water_${fixture.water.group ?? ""}`;
    if (fixture.control) return `control_${[fixture.control.for ?? []].flat().join("+")}`;
    return "steam";
}

/** Whether an anchor has been placed since it was last read (Water.place): its matrix as last read is a number. */
function placed(item) {
    return item.seen[0] === item.seen[0];
}

/**
 * Whether an object is drawn: it and everything it hangs from visible (the editor's scope, World/Scope.js's isShown).
 * An anchor (`userData.fixture`) draws nothing of its own, and says so by what it hangs from: a public view hides its
 * holders, which nothing draws, so that each of the frame's renders passes them over (SceneBuilder.holdStill).
 */
function shown(object) {
    for (let node = object?.userData?.fixture ? object.parent : object; node; node = node.parent) if (!node.visible) return false;
    return true;
}

/** A number from a string, for a fixture's own seed: two of a piece never look alike. */
function seedOf(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return ((h >>> 0) % 10007) / 10007;
}

export default class Water {
    /**
     * @param {World} world  its scene builder and interactables made
     * @param {object} [options]
     * @param {Function} [options.quality]  the quality step's settings now (Utils/device.js's QUALITY): its `water`
     * @param {Function} [options.onQualityChange]  Utils/device.js's, to hear the step change by
     */
    constructor(world, { quality = () => null, onQualityChange = null } = {}) {
        this.world = world;
        this.experience = world.experience ?? null;
        this.quality = quality;
        /** Every outlet, control and enclosure there is, by id (`<piece>:water_<group>`, `:control_<group>`, `:steam`). */
        this.outlets = new Map();
        this.controls = new Map();
        this.enclosures = new Map();
        /** Each piece's floor height, by its id: which floor its water is on, from above. */
        this.floors = new Map();
        /** What is running, or still settling: all that update looks at. */
        this.active = new Set();
        /** The water's own clock, in seconds: what it is drawn at. Still while no time passes (an editor's heartbeat). */
        this.clock = 0;
        /** From above, the floor shown (BirdView): water on floors over it is not drawn. Null walking. */
        this.floorShown = null;
        /** When the light was last looked up, by the clock; and whether it must be now. */
        this.lightClock = -Infinity;
        this.lightStale = true;
        /** Fully baked: the doors' light as last mixed (lightOf), and each point's nearest door, by where it is. */
        this.doorMix = null;
        this.nearestDoors = new Map();
        /** The drawing, outside the builder's root: a helper. */
        this.group = new THREE.Group();
        this.group.name = "water";
        this.group.userData.helper = true;
        this.group.visible = false;
        this.experience?.scene?.add(this.group);
        /** What every material shares: the clock, the noise, how big a pixel is a metre away. */
        this.shared = { uTime: { value: 0 }, uNoise: { value: null }, uNoise3: { value: null }, uPixel: { value: 0.001 }, uSwirl: { value: new THREE.Vector4(1, 0, 1, 0) } };
        this.geometries = null;
        this.counts = { ...COUNTS };
        this.readCounts();
        /** One mesh of each kind, never drawn: what the programs are made ready by, ahead of the first turned on (warm). */
        this.protos = [];
        this.signature = null;
        /** Whether the visitor has come to water since (aim): what the programs are made ready for, once. */
        this.wanted = false;
        /** The protos' programs being made (prepare), or null. */
        this.warming = null;
        /** How many times what lights the scene may have changed (onLight, onBird): a part of what they were made for. */
        this.lightEpoch = 0;
        /** What of the drawing is made and kept from being drawn until its programs are (hold). */
        this.unready = new Set();
        this.models = new WeakMap();
        this.awaited = new WeakSet();
        this.unregister = world.interactables?.register(this.provider()) ?? null;
        this.stopQuality = onQualityChange?.(() => this.readCounts()) ?? null;
        // What changes the light on the water: the time of day, a switch, the view from above, the editor's light.
        this.onLight = () => {
            this.lightEpoch++;
            this.lightStale = true;
            this.doorMix = null;
            this.nearestDoors.clear();
        };
        this.onBird = (bird) => {
            this.floorShown = bird?.active ? bird.level ?? null : null;
            this.lightEpoch++;
            this.lightStale = true;
        };
        this.lightEvents = ["lighting", "switches", "room-lights", "preview", "mode", "scope"];
        for (const name of this.lightEvents) world.on?.(name, this.onLight);
        world.on?.("bird", this.onBird);
        this.refresh();
    }

    // ------------------------------------------------------------------
    // The fixtures
    // ------------------------------------------------------------------

    /**
     * The fixtures of the furniture as it is placed now — the furniture
     * come, the scene edited (Interactables' refresh) — each keeping whether
     * it was running, as long as its piece is there.
     */
    refresh() {
        const builder = this.world.sceneBuilder;
        if (!builder) return;
        const found = [];
        const placements = new Map((builder.spec?.furniture ?? []).map((placement) => [placement.id, placement]));
        if (builder.runtime) {
            // A public view: the runtime file's holders, in the world, each saying its piece.
            for (const holder of builder.openableGroup?.children ?? []) {
                const fixture = holder.userData?.fixture;
                if (fixture && (fixture.water || fixture.control || fixture.steam)) found.push({ node: holder, piece: holder.userData.piece, fixture });
            }
        } else {
            for (const [id, entry] of builder.furniture ?? []) {
                for (const node of this.anchorsOf(entry.group)) found.push({ node, piece: id, fixture: node.userData.fixture });
            }
        }
        const outlets = new Map();
        const controls = new Map();
        const enclosures = new Map();
        for (const { node, piece, fixture } of found) {
            // Named by what it is in its piece — the same in the editor and in a public view, whatever three made of
            // the node's name (its dot dropped): "a-f126:water_basin", "a-f126:control_basin", "a-f032:steam".
            const id = `${piece}:${anchorName(fixture)}`;
            if (fixture.water) outlets.set(id, this.outlet(id, piece, node, fixture.water));
            else if (fixture.control) controls.set(id, this.control(id, piece, node, fixture.control));
            else enclosures.set(id, this.enclosure(id, piece, node, fixture.steam));
        }
        // Gone with its piece: its water stopped, its drawing let go of.
        for (const [id, outlet] of this.outlets) if (!outlets.has(id)) this.dropOutlet(outlet);
        for (const [id, enclosure] of this.enclosures) if (!enclosures.has(id)) this.dropEnclosure(enclosure);
        this.outlets = outlets;
        this.controls = controls;
        this.enclosures = enclosures;
        // Each control the outlets it is for, each enclosure the showers in it: of its own piece.
        const byPiece = new Map();
        for (const outlet of outlets.values()) {
            if (!byPiece.has(outlet.piece)) byPiece.set(outlet.piece, []);
            byPiece.get(outlet.piece).push(outlet);
        }
        for (const outlet of outlets.values()) outlet.control = null;
        for (const control of controls.values()) {
            const own = byPiece.get(control.piece) ?? [];
            control.outlets = own.filter((outlet) => control.groups.includes(outlet.group));
            control.kind = control.outlets.some((outlet) => outlet.kind === "rain") ? "shower" : "tap";
            for (const outlet of control.outlets) outlet.control = control;
        }
        for (const enclosure of enclosures.values()) {
            enclosure.outlets = (byPiece.get(enclosure.piece) ?? []).filter((outlet) => outlet.kind === "rain");
            for (const outlet of enclosure.outlets) outlet.enclosure = enclosure;
            enclosure.control = [...controls.values()].find((control) => control.piece === enclosure.piece && control.kind === "shower") ?? null;
            // Its mist's panes made again when next wanted: its glass door may be another part now.
            this.dropPanes(enclosure);
        }
        this.floors.clear();
        for (const piece of byPiece.keys()) this.floors.set(piece, placements.get(piece)?.position?.[1] ?? null);
        for (const enclosure of enclosures.values()) if (!this.floors.has(enclosure.piece)) this.floors.set(enclosure.piece, placements.get(enclosure.piece)?.position?.[1] ?? null);
        for (const item of this.active) if (!outlets.has(item.id) && !enclosures.has(item.id)) this.active.delete(item);
        this.lightStale = true;
        this.nearestDoors.clear();
    }

    /**
     * The anchors in a piece of the editor's: its model's nodes with water,
     * a control or steam — found once for each model it is given (a piece
     * whose model is still on its way is looked at again when it comes).
     */
    anchorsOf(group) {
        const model = group.children[0] ?? null;
        const kept = this.models.get(group);
        if (kept && kept.model === model && kept.count === group.children.length) return kept.list;
        const list = [];
        group.traverse((node) => {
            const fixture = node.userData?.fixture;
            if (fixture && (fixture.water || fixture.control || fixture.steam)) list.push(node);
        });
        this.models.set(group, { model, count: group.children.length, list });
        // (Its model not here yet: looked for again when it is — all that come together, once.)
        const ready = group.userData?.ready;
        if (!model && ready && !this.awaited.has(group)) {
            this.awaited.add(group);
            Promise.resolve(ready).then(() => {
                if (this.disposed || !group.parent || this.refreshing) return;
                this.refreshing = true;
                queueMicrotask(() => {
                    this.refreshing = false;
                    if (!this.disposed) this.refresh();
                });
            });
        }
        return list;
    }

    /** An outlet, as it was if it was already known: its anchor's props, read again. */
    outlet(id, piece, node, water) {
        const outlet = this.outlets.get(id) ?? {
            id,
            piece,
            node: null,
            on: false,
            /** How far its lever is open (0–1), eased (LEVER). */
            flow: 0,
            /** When it was last opened and shut, by the clock. */
            onAt: -Infinity,
            offAt: -Infinity,
            /** How wet its bowl or tray is (0–1): from when its water lands, to a moment after it stops (DRAIN). */
            wet: 0,
            head: 0,
            tail: 1,
            /** Its anchor's frame in the world, unscaled, and the scale it is placed at; its anchor's matrix as last read. */
            frame: new THREE.Matrix4(),
            at: new THREE.Vector3(),
            turn: new THREE.Quaternion(),
            scale: 1,
            seen: new Float64Array(16).fill(NaN),
            light: { value: new THREE.Color(0, 0, 0) },
            meshes: null,
            enclosure: null,
            seed: seedOf(id),
            shown: false,
        };
        outlet.node = node;
        outlet.kind = water.kind === "rain" ? "rain" : "tap";
        outlet.group = String(water.group ?? "");
        outlet.fall = Math.max(0.02, Number(water.fall) || 0.2);
        outlet.radius = Number(water.r) || 0;
        outlet.size = Array.isArray(water.size) ? water.size.map(Number) : null;
        outlet.land = Array.isArray(water.land) ? water.land.map(Number) : [0.12, 0.12];
        outlet.spread = Math.max(...outlet.land);
        outlet.hot = Boolean(water.hot);
        outlet.speed = outlet.kind === "rain" ? NOZZLE_SPEED : SPOUT_SPEED;
        outlet.seen.fill(NaN);
        return outlet;
    }

    control(id, piece, node, control) {
        const kept = this.controls.get(id);
        return {
            id,
            piece,
            node,
            groups: (Array.isArray(control.for) ? control.for : [control.for]).map(String),
            half: vector(control.half, [0.06, 0.08, 0.06]),
            outlets: kept?.outlets ?? [],
            kind: kept?.kind ?? "tap",
            frame: new THREE.Matrix4(),
            at: new THREE.Vector3(),
            turn: new THREE.Quaternion(),
            scale: 1,
            inverse: new THREE.Matrix4(),
            seen: new Float64Array(16).fill(NaN),
        };
    }

    enclosure(id, piece, node, steam) {
        const enclosure = this.enclosures.get(id) ?? {
            id,
            piece,
            node: null,
            heat: 0,
            mist: 0,
            /** Whether hot water runs in it, eased over a few seconds (the steam's `uRunning`). */
            running: 0,
            frame: new THREE.Matrix4(),
            at: new THREE.Vector3(),
            turn: new THREE.Quaternion(),
            scale: 1,
            seen: new Float64Array(16).fill(NaN),
            inverse: new THREE.Matrix4(),
            light: { value: new THREE.Color(0, 0, 0) },
            /** Its puffs (one mesh), its body (two: its own box, and the room's over its top), its glass's mist. */
            steam: null,
            haze: null,
            panes: null,
            seed: seedOf(id),
            near: Infinity,
            /** How thick its steam's body gets (STEAM_THICK, by its volume: shapeSteam). */
            thick: STEAM_THICK,
            /** The eye in its own frame, unscaled; whether it is in its box; the order its drawing goes in (ORDER). */
            eye: new THREE.Vector3(),
            inside: false,
            order: ORDER.outside,
        };
        enclosure.node = node;
        enclosure.half = vector(steam.half, [0.5, 1, 0.5]);
        enclosure.screens = Array.isArray(steam.screens) ? steam.screens.filter((screen) => Array.isArray(screen) && screen.length === 4) : [];
        enclosure.seen.fill(NaN);
        return enclosure;
    }

    /**
     * Where an anchor is now: its frame in the world, turned and placed as
     * its piece is but unscaled, and the scale apart — from its node's
     * world matrix, which in the editor moves with its piece. True if it
     * moved since last asked.
     */
    place(item) {
        const node = item.node;
        node.updateWorldMatrix(true, false);
        const elements = node.matrixWorld.elements;
        if (sameMatrix(elements, item.seen)) return false;
        item.seen.set(elements);
        item.version = (item.version ?? 0) + 1;
        node.matrixWorld.decompose(_position, _quaternion, _scale);
        item.scale = Math.abs(_scale.x) || 1;
        item.at.copy(_position);
        item.turn.copy(_quaternion);
        item.frame.compose(_position, _quaternion, _scale.set(1, 1, 1));
        if (item.inverse) item.inverse.copy(node.matrixWorld).invert();
        return true;
    }

    /** Whether a piece's water can be seen now: its piece drawn (the editor's scope), on a floor shown from above. */
    usable(item) {
        if (!shown(item.node)) return false;
        if (this.floorShown === null) return true;
        const birdView = this.world.birdView;
        const floor = this.floors.get(item.piece) ?? item.at.y;
        return !birdView || birdView.floorAt(item.at.x, floor, item.at.z) <= this.floorShown;
    }

    // ------------------------------------------------------------------
    // On and off
    // ------------------------------------------------------------------

    /** Whether any of what a control (or an enclosure) works is running. */
    isOn(switchable) {
        return Boolean(switchable?.outlets?.some((outlet) => outlet.on));
    }

    /**
     * A control's water — or a shower's, stood in — turned on or off: all
     * of it the same way, on if none of it was running. Whether it is now on.
     */
    toggle(switchable, on = !this.isOn(switchable)) {
        on = Boolean(on);
        for (const outlet of switchable.outlets ?? []) this.turn(outlet, on);
        this.world.emit?.("water", { id: switchable.id, kind: switchable.kind, on });
        // (Its first frames drawn: the editor draws on demand — Pace.js, through busy.)
        this.experience?.wake?.("water");
        return on;
    }

    /** One outlet opened or shut. */
    turn(outlet, on) {
        if (outlet.on === on) return;
        this.place(outlet);
        const fall = fallTime(outlet.fall * outlet.scale, outlet.speed);
        if (on) {
            // Opened again while its last water is still falling: the stream as it was, whole, rather than
            // a gap that the new water chases down.
            const falling = this.clock - outlet.offAt < fall;
            outlet.onAt = falling ? this.clock - fall : this.clock;
        } else {
            outlet.offAt = this.clock;
        }
        outlet.on = on;
        this.make(outlet);
        if (outlet.enclosure) {
            this.place(outlet.enclosure);
            this.active.add(outlet.enclosure);
        }
        this.active.add(outlet);
        this.group.visible = true;
        // Its light at once, not at the next look round.
        this.lightStale = true;
    }

    // ------------------------------------------------------------------
    // The drawing
    // ------------------------------------------------------------------

    /** What the quality step asks for (Utils/device.js's `water`), and the drawing made to it. */
    readCounts() {
        const asked = this.quality?.()?.water;
        this.counts = { ...COUNTS, ...(asked ?? {}) };
        if (!this.geometries) return;
        const sized = (key, geometry, count) => {
            if (count > geometry.userData.count) {
                // More than it was made for: made again, as large, and given to every mesh that has it.
                const grown = quadCloud(count, geometry.userData.seed);
                grown.userData = { count, seed: geometry.userData.seed };
                for (const mesh of this.meshes()) if (mesh.geometry === geometry) mesh.geometry = grown;
                geometry.dispose();
                geometry = this.geometries[key] = grown;
            }
            geometry.setDrawRange(0, count * 6);
        };
        sized("rain", this.geometries.rain, this.counts.rain);
        sized("splash", this.geometries.splash, this.counts.splash);
        sized("spray", this.geometries.spray, this.counts.spray);
        sized("steam", this.geometries.steam, this.counts.steam);
        this.experience?.wake?.("water");
    }

    /** The geometries every fixture's drawing shares, made once. */
    makeGeometries() {
        if (this.geometries) return this.geometries;
        const cloud = (count, seed) => {
            const geometry = quadCloud(count, seed);
            geometry.userData = { count, seed };
            geometry.setDrawRange(0, count * 6);
            return geometry;
        };
        const noise = waterNoise();
        this.shared.uNoise.value = noise.flat;
        this.shared.uNoise3.value = noise.layered;
        this.geometries = {
            stream: streamGeometry(),
            floor: floorGeometry(),
            pane: paneGeometry(),
            box: boxGeometry(),
            rain: cloud(this.counts.rain, 13),
            splash: cloud(this.counts.splash, 7),
            spray: cloud(this.counts.spray, 19),
            steam: cloud(this.counts.steam, 29),
        };
        return this.geometries;
    }

    /** A mesh of the drawing: placed by Water (its matrix), seen through by nothing, out of the occlusion's passes. */
    mesh(geometry, material, name) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.raycast = () => {};
        mesh.userData.helper = true;
        // Drawn in the scene's own pass alone, not again in N8AO's for what is seen through (PostProcessing.js).
        mesh.userData.treatAsOpaque = true;
        this.group.add(mesh);
        return mesh;
    }

    /** Every mesh of the drawing there is now. */
    *meshes() {
        for (const outlet of this.outlets.values()) if (outlet.meshes) yield* Object.values(outlet.meshes);
        for (const enclosure of this.enclosures.values()) {
            if (enclosure.steam) yield enclosure.steam;
            yield* enclosure.haze ?? [];
            for (const pane of enclosure.panes ?? []) yield pane.mesh;
        }
        yield* this.protos;
    }

    /** An outlet's drawing, made the first time it is opened. */
    make(outlet) {
        if (outlet.meshes) return;
        const geometries = this.makeGeometries();
        const shared = this.shared;
        const light = outlet.light;
        const name = `water:${outlet.id}`;
        if (outlet.kind === "rain") {
            outlet.meshes = {
                main: this.mesh(geometries.rain, rainMaterial(shared, light), `${name}:rain`),
                splash: this.mesh(geometries.spray, splashMaterial(shared, light), `${name}:spray`),
                ripple: this.mesh(geometries.floor, rippleMaterial(shared, light), `${name}:ripple`),
            };
        } else {
            outlet.meshes = {
                main: this.mesh(geometries.stream, streamMaterial(shared, light), `${name}:stream`),
                splash: this.mesh(geometries.splash, splashMaterial(shared, light), `${name}:splash`),
                ripple: this.mesh(geometries.floor, rippleMaterial(shared, light), `${name}:ripple`),
            };
        }
        for (const mesh of Object.values(outlet.meshes)) mesh.material.uniforms.uSeed.value = outlet.seed * 17;
        this.hold(Object.values(outlet.meshes));
    }

    dropOutlet(outlet) {
        outlet.on = false;
        this.active.delete(outlet);
        for (const mesh of Object.values(outlet.meshes ?? {})) {
            this.group.remove(mesh);
            mesh.material.dispose();
        }
        outlet.meshes = null;
    }

    dropEnclosure(enclosure) {
        this.active.delete(enclosure);
        for (const mesh of [enclosure.steam, ...(enclosure.haze ?? [])]) {
            if (!mesh) continue;
            this.group.remove(mesh);
            mesh.material.dispose();
        }
        enclosure.steam = null;
        enclosure.haze = null;
        this.dropPanes(enclosure);
    }

    dropPanes(enclosure) {
        for (const pane of enclosure.panes ?? []) {
            this.group.remove(pane.mesh);
            pane.mesh.material.dispose();
        }
        enclosure.panes = null;
    }

    /**
     * The programs made before they are wanted: one mesh of each kind
     * (`protos`, never drawn, no scale) handed to Renderer.build, which has
     * three build their programs for the scene as it is now, a few at a time
     * between frames, waits for the GPU to link them, and draws each once
     * into a picture of a few pixels (where a GPU makes what it draws a
     * program with) — not in one frame: eight new programs at once were 0.4
     * s of one (a box of steam's from inside it as well as from outside:
     * three builds a program for the faces drawn). Not as the view opens —
     * most visitors never turn a tap — but once the visitor has come to
     * water (aim: a tap or a valve aimed at, a shower stood in), and again
     * after whatever they are built for has changed since: the scene's fog,
     * the post-processing, its tone mapping, and its lights (`lightEpoch`).
     * Kept, hidden, after: three lets go of a program no material uses any
     * more, and the next turned on would make it again.
     */
    warm() {
        if (!this.wanted || this.warming) return;
        this.wanted = false;
        const scene = this.experience?.scene;
        const renderer = this.experience?.renderer;
        if (!scene || !renderer?.renderer) return;
        const fog = scene.fog ? (scene.fog.isFogExp2 ? 2 : 1) : 0;
        const signature = `${fog}|${renderer.post ? 1 : 0}|${renderer.renderer.toneMapping}|${renderer.renderer.outputColorSpace}|${this.lightEpoch}`;
        if (signature === this.signature) return;
        this.signature = signature;
        if (!this.protos.length) {
            const geometries = this.makeGeometries();
            const light = { value: new THREE.Color(0, 0, 0) };
            const geometryOf = { stream: geometries.stream, splash: geometries.splash, ripple: geometries.floor, rain: geometries.rain, steam: geometries.steam, haze: geometries.box, mist: geometries.pane };
            for (const [kind, make] of Object.entries(MATERIALS)) {
                const proto = this.mesh(geometryOf[kind], make(this.shared, light), `water:proto:${kind}`);
                proto.matrix.makeScale(0, 0, 0);
                this.protos.push(proto);
            }
            // A box of steam seen from inside it is drawn by its far faces (dressSteam): a program of its own.
            const inside = this.mesh(geometries.box, hazeMaterial(this.shared, light), "water:proto:haze-inside");
            inside.material.side = THREE.BackSide;
            inside.matrix.makeScale(0, 0, 0);
            this.protos.push(inside);
        }
        const ready = this.prepare(this.protos);
        if (ready) this.warming = ready.finally(() => (this.warming = null));
    }

    /**
     * `meshes`' programs made for the scene as it is now (Renderer.build:
     * a few at a time between frames, each drawn once out of sight), shown
     * for each batch's turn only. A promise, or null where there is no
     * renderer to make them with (a test).
     */
    prepare(meshes) {
        const renderer = this.experience?.renderer;
        const camera = this.experience?.camera?.activeCamera;
        if (!renderer?.build || !renderer.renderer || !camera) return null;
        const group = this.group;
        let was = false;
        const around = (some, on) => {
            if (on) {
                was = group.visible;
                group.visible = true;
            }
            for (const mesh of some) mesh.visible = on;
            if (!on) group.visible = was;
        };
        return renderer.build(meshes, [], camera, around, 3, true).catch((error) => console.warn("The water's shaders could not be built ahead", error));
    }

    /**
     * What has just been made of a fixture's drawing, not drawn until its
     * programs are made (prepare) — for the lights there are now, which
     * may not be those the protos' were made for (warm): drawn at once by
     * three, one built in the frame it is first wanted is a stop of that
     * frame, of 20 to 100 ms a program.
     */
    hold(meshes) {
        const renderer = this.experience?.renderer;
        if (!renderer?.build || !renderer.renderer) return;
        for (const mesh of meshes) {
            mesh.visible = false;
            this.unready.add(mesh);
        }
        // (Set going after the frame that made them, not in it.)
        const release = () => {
            for (const mesh of meshes) this.unready.delete(mesh);
        };
        setTimeout(() => {
            if (this.disposed) return;
            const ready = this.prepare(meshes);
            if (ready) ready.then(release);
            else release();
        }, 0);
    }

    // ------------------------------------------------------------------
    // Each frame
    // ------------------------------------------------------------------

    /**
     * Each frame (World.update): the clock on, each outlet's lever and its
     * water's head and tail, each shower's steam and mist, the light where
     * they are now and then, and what is drawn of them — in the editor,
     * placed again where their pieces have moved. Nothing to do while
     * everything is off and settled.
     */
    update(delta) {
        this.warm();
        if (!this.active.size) {
            this.group.visible = false;
            return;
        }
        this.clock += delta;
        this.shared.uTime.value = this.clock;
        // The steam's two octaves turned about the water, each its own way at its own rate (the haze's uSwirl).
        const coarse = this.clock * SWIRL[0];
        const fine = this.clock * SWIRL[1];
        this.shared.uSwirl.value.set(Math.cos(coarse), Math.sin(coarse), Math.cos(fine), Math.sin(fine));
        const camera = this.experience?.camera?.activeCamera ?? null;
        if (camera) {
            // (Where the camera is this frame: placed since World.update — World.afterCamera — but its matrices not yet worked out.)
            camera.updateMatrixWorld();
            _frustum.setFromProjectionMatrix(_projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            // How big a pixel is a metre from the eye: no drop drawn thinner (the shaders' uPixel).
            const height = this.experience.renderer?.renderer?.getDrawingBufferSize?.(_buffer).y || 1000;
            if (camera.isPerspectiveCamera) this.shared.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
        }
        const eye = camera ? camera.getWorldPosition(_eye) : null;
        const relight = this.lightStale || this.clock - this.lightClock >= LIGHT_EVERY;
        if (relight) {
            this.lightClock = this.clock;
            this.lightStale = false;
        }
        let drawn = false;
        // The showers first, so that their water knows which side of the glass the eye is.
        const steaming = [];
        for (const item of [...this.active]) {
            if (!("heat" in item)) continue;
            if (this.stepEnclosure(item, delta, eye, relight)) {
                if (item.heat > 0.001 && item.usable) steaming.push(item);
            } else {
                this.active.delete(item);
            }
        }
        // Steam for the nearest showers in sight alone (the step's `steaming`): it is what costs, filling the screen. (In
        // sight first: a nearer one behind the eye takes no turn from one in front of it.)
        const inSight = (enclosure) => {
            // (Round it, the room over its top it may spill into.)
            _sphere.center.copy(enclosure.at);
            _sphere.radius = enclosure.half.length() * enclosure.scale + SPILL + 0.5;
            return (!eye || _frustum.intersectsSphere(_sphere)) && enclosure.distance <= FAR.rain;
        };
        const seen = new Set(steaming.filter(inSight));
        steaming.sort((a, b) => (seen.has(a) ? 0 : 1) - (seen.has(b) ? 0 : 1) || a.near - b.near);
        const most = Math.max(0, this.counts.steaming ?? COUNTS.steaming);
        for (const [k, enclosure] of steaming.entries()) {
            const show = k < most && seen.has(enclosure);
            if (show && !enclosure.steam) this.makeSteam(enclosure);
            this.showSteam(enclosure, show);
            if (!show) continue;
            this.dressSteam(enclosure);
            drawn = true;
        }
        for (const item of this.active) {
            if ("heat" in item) {
                if (!steaming.includes(item)) this.showSteam(item, false);
                if (item.panes?.some((pane) => pane.mesh.visible)) drawn = true;
                continue;
            }
            if (this.stepOutlet(item, delta, eye, relight)) drawn ||= item.shown;
            else this.settle(item);
        }
        // (What is made and not yet ready to draw: kept back — hold.)
        for (const mesh of this.unready) mesh.visible = false;
        this.group.visible = drawn;
    }

    /** An outlet's frame: whether it is still running or settling. */
    stepOutlet(outlet, delta, eye, relight) {
        // In the editor its piece may be moved while it runs: it follows. (A public view's never move.)
        if (!this.experience?.publicView || !placed(outlet)) this.place(outlet);
        // Its lever, eased open or shut.
        const goal = outlet.on ? 1 : 0;
        if (outlet.flow !== goal) {
            const rate = outlet.on ? 1 / LEVER.open : 1 / LEVER.shut;
            outlet.flow = goal > outlet.flow ? Math.min(1, outlet.flow + delta * rate) : Math.max(0, outlet.flow - delta * rate);
        }
        const fall = outlet.fall * outlet.scale;
        const { head, tail } = reach(fall, outlet.speed, this.clock - outlet.onAt, outlet.on ? null : this.clock - outlet.offAt);
        outlet.head = head;
        outlet.tail = tail;
        // Wet once its water lands, and for a moment after the last of it has.
        const landing = head >= 1 && tail < 1;
        outlet.wet = landing ? Math.min(1, outlet.wet + delta / 0.25) : Math.max(0, outlet.wet - delta / DRAIN[outlet.kind]);
        const settling = outlet.on || outlet.flow > 0 || tail < 1 || outlet.wet > 0;
        if (!settling) return false;
        const meshes = outlet.meshes;
        outlet.distance = eye ? eye.distanceTo(outlet.at) : 0;
        outlet.usable = this.usable(outlet);
        _sphere.center.copy(outlet.at);
        _sphere.center.y -= fall / 2;
        _sphere.radius = fall / 2 + outlet.spread * outlet.scale + 0.1;
        outlet.shown = outlet.usable && outlet.distance <= FAR[outlet.kind] && (!eye || _frustum.intersectsSphere(_sphere));
        for (const mesh of Object.values(meshes)) {
            mesh.visible = outlet.shown;
            mesh.matrix.copy(outlet.frame);
            mesh.matrixWorldNeedsUpdate = true;
        }
        // Its light kept up whether it is seen or not: seen again, it is not drawn black for a frame. A shower's in
        // an enclosure, its enclosure's (stepped first): its rain, its steam and its glass lit alike.
        if (outlet.enclosure) outlet.light.value.copy(outlet.enclosure.light.value);
        else if (relight) this.lightAt(this.lightPoint(outlet, _point), outlet.light.value, this.floors.get(outlet.piece));
        if (!outlet.shown) return true;
        const scale = outlet.scale;
        const splash = meshes.splash.material.uniforms;
        const ripple = meshes.ripple.material.uniforms;
        const land = outlet.land;
        if (outlet.kind === "tap") {
            const stream = meshes.main.material.uniforms;
            stream.uFall.value = fall;
            stream.uR0.value = Math.max(0.003, (outlet.radius || 0.008) * scale * 0.9);
            stream.uV0.value = outlet.speed;
            stream.uFlow.value = smooth(outlet.flow);
            stream.uHead.value = head;
            stream.uTail.value = tail;
            meshes.main.visible = outlet.shown && head > tail;
            splash.uFloor.value = -fall;
            splash.uArea.value.setScalar(stream.uR0.value * 0.7);
            splash.uSpeed.value = Math.min(1.3, Math.sqrt(2 * GRAVITY * fall) * 0.35) * outlet.flow;
            splash.uSize.value = DROPLET.tap;
            splash.uLanding.value = landing ? outlet.flow : 0;
            ripple.uFloor.value = -fall + 0.0015;
            ripple.uHalf.value.set((land[0] / 2) * scale, (land[1] / 2) * scale);
            ripple.uWet.value = smooth(outlet.wet);
            ripple.uRain.value = 0;
            ripple.uImpact.value = stream.uR0.value * 2.2 * (landing ? outlet.flow : 0);
            // How far the sheet it strikes into runs before it piles up: further the harder it lands.
            ripple.uJump.value = THREE.MathUtils.clamp(0.01 + fall * 0.04, 0.015, 0.032) * smooth(outlet.flow) * scale;
        } else {
            const rain = meshes.main.material.uniforms;
            rain.uFall.value = fall;
            rain.uV0.value = outlet.speed;
            rain.uFallTime.value = fallTime(fall, outlet.speed);
            rain.uRound.value = outlet.size ? 0 : 1;
            if (outlet.size) rain.uHead.value.set(outlet.size[0] * scale, outlet.size[1] * scale);
            else rain.uHead.value.set((outlet.radius || 0.1) * scale * 0.92, 0);
            rain.uSinceOn.value = this.clock - outlet.onAt;
            rain.uSinceOff.value = outlet.on ? -1 : this.clock - outlet.offAt;
            rain.uFlow.value = smooth(outlet.flow * 1.5);
            this.blockFor(outlet, rain.uBlock.value);
            meshes.main.visible = outlet.shown && tail < 1;
            splash.uFloor.value = -fall;
            splash.uArea.value.set((land[0] / 2) * scale, (land[1] / 2) * scale);
            splash.uSpeed.value = 0.85;
            splash.uSize.value = DROPLET.rain;
            splash.uLanding.value = landing ? smooth(outlet.flow * 1.5) : 0;
            ripple.uFloor.value = -fall + 0.002;
            // The water spreads over the tray past where it lands.
            ripple.uHalf.value.set(land[0] * 0.85 * scale, land[1] * 0.85 * scale);
            ripple.uWet.value = smooth(outlet.wet);
            ripple.uRain.value = landing ? 1 : 0.6;
            ripple.uImpact.value = 0;
            // Seen through its enclosure's glass from outside, drawn before the glass; from inside, after it (ORDER).
            const order = outlet.enclosure?.order.water ?? 0;
            for (const mesh of Object.values(meshes)) mesh.renderOrder = order;
        }
        return true;
    }

    /**
     * Where the visitor stands under a shower's head, their head and
     * shoulders, in the head's own frame: the drops end on them (the rain's
     * `uBlock`: x, z, radius, the top of their head; a radius of 0, nobody).
     */
    blockFor(outlet, out) {
        out.set(0, 0, 0, 0);
        const player = this.world.player;
        const body = player?.player?.collider;
        if (!body || player.inVehicle || player.seated) return;
        _local.copy(body.end).sub(outlet.at).applyQuaternion(_turn.copy(outlet.turn).invert());
        const radius = 0.24;
        const fall = outlet.fall * outlet.scale;
        if (Math.hypot(_local.x, _local.z) > fall || _local.y < -fall) return;
        // The top of the head: a little over the capsule's top sphere's middle (Player's radius 0.35, a head's a third of it).
        out.set(_local.x, _local.z, radius, Math.min(-0.02, _local.y + 0.12));
    }

    /** A shower's enclosure's frame: whether its steam or mist is still there. */
    stepEnclosure(enclosure, delta, eye, relight) {
        if (!this.experience?.publicView || !placed(enclosure)) this.place(enclosure);
        const running = enclosure.outlets.some((outlet) => outlet.on && outlet.hot);
        Object.assign(enclosure, warm(enclosure, running, delta));
        enclosure.running = running ? Math.min(1, enclosure.running + delta / 2) : Math.max(0, enclosure.running - delta / 4);
        const anyWater = enclosure.outlets.some((outlet) => this.active.has(outlet));
        if (!running && enclosure.heat <= 0 && enclosure.mist <= 0.001 && !anyWater) {
            this.showSteam(enclosure, false);
            for (const pane of enclosure.panes ?? []) pane.mesh.visible = false;
            enclosure.mist = 0;
            return false;
        }
        enclosure.distance = eye ? eye.distanceTo(enclosure.at) : 0;
        enclosure.near = enclosure.distance;
        enclosure.usable = this.usable(enclosure);
        // Where the eye is in its own frame (unscaled, metres: the steam's uEye), and so which side of its glass it
        // is: in its box (or all but: a near plane's breadth outside it), over its top, or beside it (ORDER).
        if (eye) enclosure.eye.copy(eye).sub(enclosure.at).applyQuaternion(_turn.copy(enclosure.turn).invert());
        _offset.copy(enclosure.half).multiplyScalar(enclosure.scale).addScalar(INSIDE_MARGIN);
        enclosure.inside = Boolean(eye) && inBox(enclosure.eye, _offset);
        const above = Boolean(eye) && enclosure.eye.y > enclosure.half.y * enclosure.scale;
        enclosure.order = enclosure.inside ? ORDER.inside : above ? ORDER.above : ORDER.outside;
        if (relight) this.enclosureLight(enclosure, enclosure.light.value);
        // The mist on its panes and its door, while there is any.
        const misted = enclosure.mist > 0.002 && enclosure.usable && enclosure.distance <= FAR.rain;
        if (misted && !enclosure.panes) this.makePanes(enclosure);
        for (const pane of enclosure.panes ?? []) {
            const visible = misted && (!pane.part || shown(pane.part.node));
            pane.mesh.visible = visible;
            if (!visible) continue;
            pane.mesh.material.uniforms.uMist.value = enclosure.mist;
            // A door's mist goes with its door as it swings.
            if (pane.part) pane.mesh.matrix.multiplyMatrices(pane.part.node.matrixWorld, pane.local);
            else pane.mesh.matrix.multiplyMatrices(enclosure.node.matrixWorld, pane.local);
            pane.mesh.matrixWorldNeedsUpdate = true;
        }
        return true;
    }

    /** An outlet that has stopped and settled: hidden, and nothing more done for it until it is opened again. */
    settle(outlet) {
        this.active.delete(outlet);
        outlet.flow = 0;
        outlet.wet = 0;
        for (const mesh of Object.values(outlet.meshes ?? {})) mesh.visible = false;
        outlet.shown = false;
    }

    /**
     * Where an outlet's light is looked up: a third of the way down its
     * water, and — a tap's — half a metre out from it, where whoever turned
     * it on stands. The bake's probes are a metre apart, and at a sink
     * against a wall, under its cupboards, those round the spout itself are
     * half in the wall and the cupboards' shade (A1's kitchen: a quarter of
     * the light of the room in front of it, and its water near black).
     */
    lightPoint(outlet, out) {
        const fall = outlet.fall * outlet.scale;
        out.copy(outlet.at);
        out.y -= fall * 0.3;
        if (outlet.kind !== "tap" || !outlet.control) return out;
        this.place(outlet.control);
        _offset.subVectors(outlet.at, outlet.control.at).setY(0);
        if (_offset.lengthSq() > 1e-6) out.addScaledVector(_offset.normalize(), LIGHT_OUT * outlet.scale);
        return out;
    }

    /**
     * The light in a shower's enclosure, into `out`: the brighter of the
     * light in it, a little over its middle, and the light just out in front
     * of it — from its valve through its middle and half a metre past its
     * front. The bake's probes in a corner shower's cabinet, a metre apart,
     * are half in its walls (a-f032's: two thirds of the light of the room
     * in front of it), and its steam and its glass's mist, lit by them, were
     * darker than the tiles behind them: a smoke. What they scatter is the
     * light of the room round them as much as of the cabinet.
     */
    enclosureLight(enclosure, out) {
        const floor = this.floors.get(enclosure.piece);
        this.lightAt(_point.copy(enclosure.at).setY(enclosure.at.y + 0.3 * enclosure.scale), out, floor);
        const control = enclosure.control;
        if (!control) return out;
        this.place(control);
        _offset.subVectors(enclosure.at, control.at).setY(0);
        if (_offset.lengthSq() < 1e-6) return out;
        _offset.normalize();
        // Out past its front: as far as its box reaches that way, and half a metre more.
        _local.copy(_offset).applyQuaternion(_turn.copy(enclosure.turn).invert());
        const reach = (Math.abs(_local.x) * enclosure.half.x + Math.abs(_local.z) * enclosure.half.z) * enclosure.scale + LIGHT_OUT;
        _point.copy(enclosure.at).addScaledVector(_offset, reach);
        _point.y = enclosure.at.y + 0.3 * enclosure.scale;
        // (Only in its own room: past a wall is another room's light, or the open air's.)
        const builder = this.world.sceneBuilder;
        const bottom = enclosure.at.y - (enclosure.half.y * enclosure.scale - 0.1);
        const own = builder?.roomAt?.(enclosure.at.x, bottom, enclosure.at.z);
        if (!own || builder.roomAt(_point.x, bottom, _point.z)?.id !== own.id) return out;
        this.lightAt(_point, _colour2, floor);
        const luma = (colour) => 0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b;
        if (luma(_colour2) > luma(out)) out.copy(_colour2);
        return out;
    }

    /** A shower's steam, as it is now, for the eye where it is: drawn this frame (update). */
    dressSteam(enclosure) {
        this.shapeSteam(enclosure);
        const heat = smooth(enclosure.heat);
        const fromAbove = this.floorShown === null ? 1 : STEAM_FROM_ABOVE;
        const order = enclosure.order;
        // Its puffs: the spray's mist, curls off the water, and what is carried over the top.
        const puffs = enclosure.steam.material.uniforms;
        puffs.uHeat.value = heat;
        puffs.uRunning.value = enclosure.running;
        puffs.uOpacity.value = STEAM_OPACITY * fromAbove;
        puffs.uEye.value.copy(enclosure.eye);
        enclosure.steam.renderOrder = order.puffs;
        // Its body, sampled as often as the step asks; as it is now, from the heat (the haze's uLayer, uColumn,
        // uSpread): the layer under the top reaching down as it heats, there once it has begun to; the column off the
        // water while it runs; how far it has spread over the top, and how thick it is there.
        // (At least two: a short look takes two, and GLSL's clamp to fewer is undefined.)
        const steps = THREE.MathUtils.clamp(Math.round(this.counts.haze ?? COUNTS.haze), 2, HAZE_STEPS);
        const edge = 1 - 0.62 * heat;
        const thick = enclosure.thick;
        for (const [k, mesh] of enclosure.haze.entries()) {
            const haze = mesh.material.uniforms;
            haze.uLayer.value.set(edge - 0.3, edge + 0.3, thick * smooth(heat / 0.15));
            haze.uColumn.value = STEAM_COLUMN * enclosure.running * smooth(heat / 0.1);
            haze.uSpread.value.set(0.08 + 0.9 * smooth((heat - 0.2) / 0.8), thick * smooth(heat / 0.3));
            haze.uOpacity.value = fromAbove;
            haze.uSteps.value = steps;
            haze.uEye.value.copy(enclosure.eye);
            // Each box drawn from outside it by its faces towards the eye, behind whatever is in front of it; from
            // inside it by its far faces, over everything — all that can be in front of them is in it too.
            const inside = k === 0 ? enclosure.inside : inBounds(enclosure.eye, haze.uBoxMin.value, haze.uBoxMax.value, INSIDE_MARGIN);
            mesh.material.side = inside ? THREE.BackSide : THREE.FrontSide;
            mesh.material.depthTest = !inside;
            mesh.renderOrder = k === 0 ? order.haze : order.spill;
        }
        for (const mesh of [enclosure.steam, ...enclosure.haze]) {
            mesh.matrix.copy(enclosure.frame);
            mesh.matrixWorldNeedsUpdate = true;
        }
    }

    /** A shower's steam drawn this frame or not: its puffs and its body. */
    showSteam(enclosure, show) {
        if (enclosure.steam) enclosure.steam.visible = show;
        for (const mesh of enclosure.haze ?? []) mesh.visible = show;
    }

    /** A shower's steam, made the first time it is drawn: its puffs, and its body's two boxes (hazeMaterial). */
    makeSteam(enclosure) {
        const geometries = this.makeGeometries();
        const name = `water:${enclosure.id}`;
        enclosure.steam = this.mesh(geometries.steam, steamMaterial(this.shared, enclosure.light), `${name}:steam`);
        enclosure.haze = [this.mesh(geometries.box, hazeMaterial(this.shared, enclosure.light), `${name}:haze`), this.mesh(geometries.box, hazeMaterial(this.shared, enclosure.light), `${name}:spill`)];
        enclosure.shaped = null;
        this.hold([enclosure.steam, ...enclosure.haze]);
    }

    /**
     * Where a shower's steam comes from and may go, in its enclosure's own
     * frame (unscaled, in metres): its box; the middle of the falling water
     * and how wide that is; how far over its top it may spread into its
     * room (spillOf) and the room's ceiling; how thick it gets. Worked out
     * again only when the enclosure has moved.
     */
    shapeSteam(enclosure) {
        if (enclosure.shaped === enclosure.version) return;
        enclosure.shaped = enclosure.version;
        const scale = enclosure.scale;
        const half = new THREE.Vector3().copy(enclosure.half).multiplyScalar(scale);
        const inverse = _turn.copy(enclosure.turn).invert();
        // The water's middle: its showers' heads, over the tray.
        const source = new THREE.Vector4(0, 0, half.x * 0.5, half.z * 0.5);
        const rain = enclosure.outlets[0];
        if (rain) {
            this.place(rain);
            _local.copy(rain.at).sub(enclosure.at).applyQuaternion(inverse);
            const width = rain.size ? Math.max(...rain.size) : (rain.radius || 0.1) * 2;
            const spread = (Math.max(width, ...rain.land) / 2 + 0.06) * scale;
            source.set(_local.x, _local.z, spread, spread);
        }
        // The room it stands in, and its ceiling.
        const builder = this.world.sceneBuilder;
        const room = builder?.roomAt?.(enclosure.at.x, enclosure.at.y - half.y + 0.1, enclosure.at.z) ?? null;
        const ceiling = room ? Math.max(half.y + 0.05, room.elevation + room.height - enclosure.at.y) : half.y + 0.7;
        const [x0, x1, z0, z1] = this.spillOf(enclosure, half, room);
        // As thick in a corner shower's cabinet as it gets; thinner in a walk-in's larger, open space (STEAM_VOLUME).
        const volume = 8 * half.x * half.y * half.z;
        enclosure.thick = STEAM_THICK * THREE.MathUtils.clamp(STEAM_VOLUME / volume, 0.35, 1);
        const puffs = enclosure.steam.material.uniforms;
        puffs.uHalf.value.copy(half);
        puffs.uSource.value.copy(source);
        puffs.uRoom.value.set(x0, x1, z0, z1);
        puffs.uCeiling.value = ceiling;
        for (const [k, mesh] of enclosure.haze.entries()) {
            const haze = mesh.material.uniforms;
            haze.uHalf.value.copy(half);
            haze.uSource.value.copy(source);
            haze.uSpill.value.set(x0, x1, z0, z1);
            haze.uCeiling.value = ceiling;
            // The enclosure's own box; the room's over its top, from the top (where the other ends) to a centimetre
            // under the ceiling and inside the room's walls.
            if (k === 0) {
                haze.uBoxMin.value.copy(half).negate();
                haze.uBoxMax.value.copy(half);
            } else {
                haze.uBoxMin.value.set(x0 + WALL_GAP, half.y, z0 + WALL_GAP);
                haze.uBoxMax.value.set(x1 - WALL_GAP, ceiling - WALL_GAP, z1 - WALL_GAP);
            }
        }
    }

    /**
     * How far over its top a shower's steam may spread into the room, as a
     * box in the enclosure's frame, `[x0, x1, z0, z1]`: its plan and up to
     * SPILL round it, as far as the box stays in the room's plan — never
     * through a wall, where the steam would be seen from the next room (an
     * L-shaped bathroom's bounds take in a corner of the room next to it).
     */
    spillOf(enclosure, half, room) {
        const polygon = room?.polygon;
        if (!polygon?.length) return [-half.x - SPILL, half.x + SPILL, -half.z - SPILL, half.z + SPILL];
        // How far each side has gone out past the enclosure's plan: −x, +x, −z, +z. Each goes out a step at a time,
        // in turn, as long as the edge it would have is all in the room — so that the box's edges sweep all of it.
        const out = [0, 0, 0, 0];
        const inRoom = (x, z) => {
            _point.set(x, 0, z).applyMatrix4(enclosure.frame);
            return inPlan(_point.x, _point.z, polygon);
        };
        // The edge side `k` would have `reach` out: points a tenth of a metre apart across the box as it is now —
        // but for a step's breadth at an end the box has not gone out at, where the enclosure's own side may
        // stand in a wall.
        const clear = (k, reach) => {
            const alongX = k >= 2;
            const lo = alongX ? -half.x - out[0] + (out[0] ? 0 : SPILL_STEP) : -half.z - out[2] + (out[2] ? 0 : SPILL_STEP);
            const hi = alongX ? half.x + out[1] - (out[1] ? 0 : SPILL_STEP) : half.z + out[3] - (out[3] ? 0 : SPILL_STEP);
            const at = (k % 2 ? 1 : -1) * ((alongX ? half.z : half.x) + reach);
            const n = Math.max(2, Math.ceil((hi - lo) / 0.1) + 1);
            for (let i = 0; i < n; i++) {
                const along = lo + ((hi - lo) * i) / (n - 1);
                if (!(alongX ? inRoom(along, at) : inRoom(at, along))) return false;
            }
            return true;
        };
        for (let grew = true; grew; ) {
            grew = false;
            for (let k = 0; k < 4; k++) {
                if (out[k] + SPILL_STEP > SPILL + 1e-6 || !clear(k, out[k] + SPILL_STEP)) continue;
                out[k] += SPILL_STEP;
                grew = true;
            }
        }
        return [-half.x - out[0], half.x + out[1], -half.z - out[2], half.z + out[3]];
    }

    /**
     * The mist's panes of a shower: one on the inside of each fixed pane of
     * glass (the anchor's `screens`, standing its box's height), and one on
     * its glass door's glass — the part of its piece labelled "shower door"
     * (World/Openables.js), its glass's box in the part's own frame — which
     * goes with the door as it swings.
     */
    makePanes(enclosure) {
        const geometries = this.makeGeometries();
        enclosure.panes = [];
        const half = enclosure.half;
        const add = (local, part = null) => {
            const mesh = this.mesh(geometries.pane, mistMaterial(this.shared, enclosure.light), `water:${enclosure.id}:mist`);
            mesh.material.uniforms.uSeed.value = enclosure.seed * 7 + enclosure.panes.length * 1.37;
            mesh.renderOrder = 0;
            enclosure.panes.push({ mesh, local, part });
        };
        for (const [x0, x1, z0, z1] of enclosure.screens) {
            const across = x1 - x0 < z1 - z0;
            // On its inner face, towards the enclosure's middle, a millimetre and a half off the glass.
            const cx = (x0 + x1) / 2;
            const cz = (z0 + z1) / 2;
            const thick = across ? (x1 - x0) / 2 : (z1 - z0) / 2;
            const inward = across ? -Math.sign(cx) || 1 : -Math.sign(cz) || 1;
            _offset.set(across ? cx + inward * (thick + 0.0015) : cx, 0, across ? cz : cz + inward * (thick + 0.0015));
            const width = across ? z1 - z0 : x1 - x0;
            const local = new THREE.Matrix4()
                .makeTranslation(_offset.x, _offset.y, _offset.z)
                .multiply(_matrix.makeRotationY(across ? Math.PI / 2 : 0))
                .multiply(_inverse.makeScale(width, half.y * 2, 1));
            add(local);
        }
        const door = this.doorOf(enclosure);
        if (door) add(door.local, door.part);
        this.hold(enclosure.panes.map((pane) => pane.mesh));
    }

    /**
     * A shower's glass door: its part (Openables) and, in the part's own
     * frame, where on it its glass is — `{ part, local }`, the mist's
     * placing on its inner face — or null where it has none.
     */
    doorOf(enclosure) {
        const parts = this.world.sceneBuilder?.openables?.parts ?? [];
        const part = parts.find((each) => each.piece === enclosure.piece && /shower door/i.test(each.label ?? ""));
        if (!part) return null;
        const node = part.node;
        node.updateWorldMatrix(true, true);
        _inverse.copy(node.matrixWorld).invert();
        let best = null;
        let largest = 0;
        node.traverse((mesh) => {
            if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
            const materials = [mesh.material].flat();
            const glass = materials.some((material) => /glass/i.test(material?.name ?? "") || material?.transparent);
            if (!glass) return;
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox.clone().applyMatrix4(_matrix.multiplyMatrices(_inverse, mesh.matrixWorld));
            const size = box.getSize(_local);
            const area = size.x * size.y + size.y * size.z + size.x * size.z;
            if (area > largest) {
                largest = area;
                best = box;
            }
        });
        if (!best) return null;
        const size = best.getSize(new THREE.Vector3());
        const centre = best.getCenter(new THREE.Vector3());
        // Its thin way across is the glass's normal; the mist on the side the enclosure's middle is.
        const across = size.x < size.z ? "x" : "z";
        _local.copy(enclosure.at).applyMatrix4(_inverse);
        const inward = Math.sign(_local[across] - centre[across]) || 1;
        centre[across] += inward * (size[across] / 2 + 0.0015);
        const local = new THREE.Matrix4()
            .makeTranslation(centre.x, centre.y, centre.z)
            .multiply(_matrix.makeRotationY(across === "x" ? Math.PI / 2 : 0))
            .multiply(_inverse.makeScale(across === "x" ? size.z : size.x, size.y, 1));
        return { part, local };
    }

    // ------------------------------------------------------------------
    // The light
    // ------------------------------------------------------------------

    /**
     * The light on water at `point`, into `out`: the brightness a white
     * surface there takes, from all round, as the view is lit — what the
     * shaders multiply their own whites by. In units of the light the bake's
     * probes hold, so that through the view's exposure it reads as the room
     * round it does.
     */
    lightAt(point, out, floor = null) {
        this.lightOf(point, out, floor);
        // Water and steam are clear: they take the light's colour, but give back less of its tint than a painted
        // wall would — a lamplit bathroom's steam a warm white, not rust.
        const grey = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
        return out.lerp(_colour.setScalar(grey), NEUTRAL);
    }

    /** That, as the view lights it (lightAt); `floor`, the height its piece stands at, if known. */
    lightOf(point, out, floor = null) {
        const world = this.world;
        const builder = world.sceneBuilder;
        // Under the editor's plain light: its one light, the same everywhere.
        if (world.plain) return out.setScalar(PLAIN);
        const room = builder?.roomAt?.(point.x, point.y, point.z) ?? null;
        const indoors = Boolean(room && room.ceiling_finish !== "none");
        // Drawn from the bake, or lit live over it, with its light probes: theirs, from all six ways, brought up
        // from above as the room is.
        const probes = world.probes;
        if (probes) {
            // Its own room's probes (or the open air's) — not another room's through a wall, nor, up on a roof deck
            // the grid does not reach, the nearest the grid has under it; where there are none of its own, out of
            // doors, the open air's light as it is now (openAir), and indoors any near.
            let light = probes.sample(point, room?.id ?? "outside", false);
            let sun = probes.sunNow ?? 1;
            if (!light && !indoors) {
                light = this.openAir(probes);
                sun = 1;
            }
            if (!light && indoors) light = probes.sample(point, room.id);
            if (light) {
                // Between the light from all round (what a puff of steam scatters, what a stream's body is lit
                // by) and the brightest way's (what its glints mirror: the window, the lamp).
                let r = 0;
                let g = 0;
                let b = 0;
                let most = 0;
                let way = 0;
                for (let f = 0; f < 6; f++) {
                    r += light[f * 3];
                    g += light[f * 3 + 1];
                    b += light[f * 3 + 2];
                    const level = light[f * 3] + light[f * 3 + 1] + light[f * 3 + 2];
                    if (level > most) {
                        most = level;
                        way = f;
                    }
                }
                out.setRGB((r / 6 + light[way * 3]) / 2, (g / 6 + light[way * 3 + 1]) / 2, (b / 6 + light[way * 3 + 2]) / 2);
                const gain = builder.indoorGainIn?.(room, Math.max(out.r, out.g, out.b)) ?? 1;
                out.multiplyScalar(gain);
                // Out of doors, the sun as much as reaches here: glints on the water.
                if (!indoors) this.addSun(out, sun);
                return out;
            }
        }
        // Fully baked (no probes: the lower quality steps): the light the bake keeps at the doors. Its own room's
        // side of its own room's doors (SceneBuilder.mixDoorSides), where the bake has the two sides apart — the
        // light of the room it is in, as near its walls as the doors are; else the nearest door's, as the
        // furniture's doors and drawers are lit (SceneBuilder.tintOpenables): a door of its own floor, looked for
        // from a metre over it, not from up at a shower's head. (The nearest door, measured against the probes,
        // was another room's as often as not — a hall's eight times brighter, a bedroom's darker.)
        // Out of doors there, the sky's and the sun's light as a live view has it (liveLightAt), nearer the probes'
        // than any door's.
        if (builder?.baked && builder.lightingInfo && !builder.liveLight && indoors) {
            // (The doors' light mixed once a look round, not once a fixture; each point's nearest door looked for
            // once, until the light changes: a shower's or a tap's place does not, in a public view. Each was a
            // twentieth of a millisecond, and seventy fixtures four times a second a hitch.)
            if (this.doorMix?.clock !== this.lightClock) this.doorMix = { clock: this.lightClock, doors: builder.mixDoorLight?.() ?? {}, rooms: this.roomSides(builder) };
            const own = this.doorMix.rooms.get(room.id);
            if (own) {
                out.setRGB(own[0], own[1], own[2]).multiplyScalar(DOOR_LIGHT);
                const gain = builder.indoorGainIn?.(room, Math.max(out.r, out.g, out.b)) ?? 1;
                return out.multiplyScalar(gain);
            }
            const doors = this.doorMix.doors;
            const from = Number.isFinite(floor) ? _offset.copy(point).setY(floor + 1) : point;
            const key = `${from.x.toFixed(2)},${from.y.toFixed(2)},${from.z.toFixed(2)}`;
            if (!this.nearestDoors.has(key)) this.nearestDoors.set(key, builder.nearestProbedDoor?.(from, doors) ?? null);
            const door = this.nearestDoors.get(key);
            if (door && doors[door]) {
                out.setRGB(...doors[door]).multiplyScalar(DOOR_LIGHT);
                const gain = builder.indoorGainIn?.(room, Math.max(out.r, out.g, out.b)) ?? 1;
                return out.multiplyScalar(gain);
            }
        }
        return this.liveLightAt(point, room, indoors, out);
    }

    /**
     * Each room's light at its doors, fully baked: the mean of its own side
     * of each of its doors (SceneBuilder.mixDoorSides, doorSideZones), by
     * the room's id — none where the bake keeps the doors' two sides
     * together.
     */
    roomSides(builder) {
        const rooms = new Map();
        const sides = builder.mixDoorSides?.() ?? {};
        const sums = new Map();
        for (const [id, two] of Object.entries(sides)) {
            const zones = builder.doorSideZones?.(id) ?? [];
            two.forEach((rgb, side) => {
                const zone = zones[side];
                if (!zone) return;
                const sum = sums.get(zone) ?? [0, 0, 0, 0];
                for (let c = 0; c < 3; c++) sum[c] += rgb[c];
                sum[3]++;
                sums.set(zone, sum);
            });
        }
        for (const [zone, [r, g, b, n]] of sums) if (r + g + b > 0) rooms.set(zone, [r / n, g / n, b / n]);
        return rooms;
    }

    /**
     * The open air's light as the probes have it now, six ways: the mean of
     * the brightest tenth of the probes out of doors (World/ProbeLight.js's
     * `reference`, but of the time of day and the switches as they are,
     * not the day's), for water out of doors where no probe of the grid is
     * near — a roof terrace's shower. Worked out again only as the probes'
     * light changes (their `key`).
     */
    openAir(probes) {
        if (this.air?.key === probes.key) return this.air.light;
        const light = probes.light;
        const zoneOf = probes.zoneOf;
        const levels = [];
        for (let index = 0; index < zoneOf.length; index++) {
            if (zoneOf[index] !== probes.outside) continue;
            let sum = 0;
            for (let c = index * 18, end = c + 18; c < end; c++) sum += light[c];
            levels.push([sum, index]);
        }
        let out = null;
        if (levels.length) {
            levels.sort((a, b) => b[0] - a[0]);
            const top = levels.slice(0, Math.max(1, Math.ceil(levels.length / 10)));
            out = new Float32Array(18);
            for (const [, index] of top) for (let c = 0; c < 18; c++) out[c] += light[index * 18 + c] / top.length;
        }
        this.air = { key: probes.key, light: out };
        return out;
    }

    /**
     * Lit live — the editor's realistic preview, a version published without
     * its light baked —: the sky's light as a room's surfaces take it (or the
     * open sky's out of doors), the scene's own ambient and hemisphere where
     * there is no sky of the site's own, the room's glow if its lights are on,
     * the live lamps near it, and the sun out of doors.
     */
    liveLightAt(point, room, indoors, out) {
        const world = this.world;
        const scene = this.experience?.scene;
        out.setRGB(0, 0, 0);
        const level = world.sky?.current?.indoorLevel;
        if (Array.isArray(level)) {
            // In a room, the sky's light as the room's own surfaces take it — its strength, their share (World/Sky.js's
            // applyIndoor); out of doors, as the scene's environment lights what is out there.
            const strength = indoors ? (world.sky.strength ?? 1) * SKY_INDOOR : scene?.environmentIntensity ?? 1;
            out.setRGB(level[0] * strength, level[1] * strength, level[2] * strength);
        } else {
            const environment = world.environment;
            for (const light of [environment?.ambient, environment?.hemisphere]) {
                if (!light?.visible || !(light.intensity > 0)) continue;
                _colour.copy(light.color);
                if (light.groundColor) _colour.lerp(light.groundColor, 0.5);
                out.add(_colour.multiplyScalar(light.intensity / Math.PI));
            }
        }
        // The room's own lamps on: its glow (World/RoomGlow.js), and the live lights near.
        const switches = world.switches;
        if (room && switches?.inRoom) {
            const lit = switches.inRoom(room.id).some((item) => switches.isOn(item.id));
            if (lit) out.add(_colour.copy(GLOW.colour).multiplyScalar(world.lighting === "night" ? GLOW.night : GLOW.day));
        }
        for (const slot of world.lampPool?.slots ?? []) {
            const light = slot.light;
            if (!light?.visible || !(light.intensity > 0)) continue;
            const distance = light.getWorldPosition(_local).distanceTo(point);
            if (light.distance > 0 && distance > light.distance) continue;
            // Three's own fall-off: the square of the distance, cut off smoothly at its reach.
            let falloff = 1 / Math.max(distance * distance, 0.01);
            if (light.distance > 0) falloff *= Math.pow(Math.max(0, 1 - Math.pow(distance / light.distance, 4)), 2);
            out.add(_colour.copy(light.color).multiplyScalar((light.intensity * falloff * LAMP_SHARE) / Math.PI));
        }
        if (!indoors) this.addSun(out, 1);
        return out;
    }

    /** The sun's share on water out of doors (SUN_SHARE), as much of it as reaches there (`share`, 0–1). */
    addSun(out, share) {
        const sun = this.world.environment?.sun;
        if (!sun?.visible || !(sun.intensity > 0) || !(share > 0)) return out;
        return out.add(_colour.copy(sun.color).multiplyScalar((sun.intensity * share * SUN_SHARE) / Math.PI));
    }

    // ------------------------------------------------------------------
    // What the visitor acts on (World/Interactables.js)
    // ------------------------------------------------------------------

    /**
     * What of the water a ray from the head meets: each tap's or valve's box
     * it goes through (`control`), at the distance it enters it — and,
     * standing in a shower's enclosure, that shower, as far along the ray as
     * it sees (`look.sight`) and below everything else in priority, so that
     * whatever else is aimed at there is what E does. Candidates, or null.
     */
    aim(ray, look) {
        const found = [];
        const most = Math.max(REACH.tap, REACH.shower) + 0.5;
        for (const control of this.controls.values()) {
            if (!control.outlets.length) continue;
            // (Placed once, and again after an edit: the visitor does not aim while pieces are being moved.)
            if (!placed(control)) this.place(control);
            if (control.at.distanceToSquared(ray.origin) > most * most) continue;
            if (!shown(control.node)) continue;
            _ray.copy(ray).applyMatrix4(control.inverse);
            _box.min.copy(control.half).negate();
            _box.max.copy(control.half);
            if (!_ray.intersectBox(_box, _hit)) continue;
            const distance = _hit.applyMatrix4(control.node.matrixWorld).distanceTo(ray.origin);
            found.push(this.candidate(control, distance));
        }
        const head = look?.head;
        if (head) {
            for (const enclosure of this.enclosures.values()) {
                if (!enclosure.outlets.length) continue;
                if (!placed(enclosure)) this.place(enclosure);
                if (enclosure.at.distanceToSquared(head) > 9 || !shown(enclosure.node)) continue;
                if (!inBox(_local.copy(head).applyMatrix4(enclosure.inverse), enclosure.half, OVER_TOP / enclosure.scale)) continue;
                const sight = Number.isFinite(look.sight) ? look.sight : look.far ?? REACH.shower;
                const switchable = enclosure.control ?? { id: enclosure.id, kind: "shower", outlets: enclosure.outlets };
                found.push({ ...this.candidate(switchable, Math.min(sight, look.far ?? sight)), reach: Infinity, priority: -1, standing: true });
            }
        }
        if (!found.length) return null;
        // Come to water: its programs made ready, if they are not for the view as it is now (warm, next frame).
        this.wanted = true;
        return found;
    }

    /** A control (or a shower stood in) as one of World/Interactables.js's candidates. */
    candidate(switchable, distance) {
        const shower = switchable.kind === "shower";
        return { kind: shower ? "shower" : "tap", id: switchable.id, distance, ref: switchable, label: shower ? "Shower" : "Tap" };
    }

    /**
     * What is still moving by itself (Pace.js, through the provider's busy):
     * water starting or stopping anywhere — a lever easing, its head or its
     * tail on the way down — and, in the walkthrough, water running or steam
     * settling within NEAR of the camera. In edit mode the editor holds it
     * still, as it does the pool.
     */
    busy() {
        if (!this.active.size) return null;
        if (this.world.editor?.active) return null;
        const camera = this.experience?.camera?.activeCamera;
        const eye = camera ? camera.getWorldPosition(_eye) : null;
        for (const item of this.active) {
            if ("heat" in item) {
                if (!eye || item.at.distanceTo(eye) <= NEAR) return "water";
                continue;
            }
            const starting = item.on ? item.flow < 1 || item.head < 1 : true;
            if (starting) return "water";
            if (!eye || item.at.distanceTo(eye) <= NEAR) return "water";
        }
        return null;
    }

    /** The water as one of World/Interactables.js's kinds: "tap" and "shower". */
    provider() {
        const water = this;
        return {
            name: "water",
            aim(ray, look) {
                const player = water.world.player;
                if (!player || player.seated || player.inVehicle) return null;
                return water.aim(ray, look);
            },
            prompt(target) {
                const on = water.isOn(target.ref);
                const what = target.kind === "shower" ? "shower" : "tap";
                return { label: `${on ? "Turn off" : "Turn on"} the ${what}`, key: "E", touch: { label: on ? "Off" : "On", icon: "water" } };
            },
            act(target) {
                const on = water.toggle(target.ref);
                return { kind: target.kind, id: target.id, state: on ? "on" : "off" };
            },
            busy: () => water.busy(),
            refresh: () => water.refresh(),
        };
    }

    /** What runs now, for a test or a tool: each outlet that is on or settling, and each shower's steam. */
    status() {
        const outlets = [...this.outlets.values()].filter((outlet) => outlet.on || this.active.has(outlet));
        return {
            outlets: outlets.map((outlet) => ({ id: outlet.id, kind: outlet.kind, on: outlet.on, flow: +outlet.flow.toFixed(3), head: +outlet.head.toFixed(3), tail: +outlet.tail.toFixed(3), wet: +outlet.wet.toFixed(3), shown: outlet.shown, light: outlet.light.value.toArray().map((n) => +n.toFixed(4)) })),
            showers: [...this.enclosures.values()]
                .filter((enclosure) => this.active.has(enclosure))
                .map((enclosure) => ({ id: enclosure.id, heat: +enclosure.heat.toFixed(3), mist: +enclosure.mist.toFixed(3), steam: Boolean(enclosure.steam?.visible), body: Boolean(enclosure.haze?.[0]?.visible), inside: enclosure.inside, light: enclosure.light.value.toArray().map((n) => +n.toFixed(4)) })),
            counts: { ...this.counts },
            fixtures: { outlets: this.outlets.size, controls: this.controls.size, showers: this.enclosures.size },
        };
    }

    dispose() {
        this.disposed = true;
        this.unregister?.();
        this.unregister = null;
        this.stopQuality?.();
        for (const name of this.lightEvents) this.world.off?.(name, this.onLight);
        this.world.off?.("bird", this.onBird);
        for (const mesh of this.meshes()) mesh.material.dispose();
        this.protos = [];
        this.unready.clear();
        for (const outlet of this.outlets.values()) outlet.meshes = null;
        for (const enclosure of this.enclosures.values()) {
            enclosure.steam = null;
            enclosure.haze = null;
            enclosure.panes = null;
        }
        this.active.clear();
        if (this.geometries) {
            for (const geometry of Object.values(this.geometries)) geometry.dispose();
            this.geometries = null;
            releaseNoise();
        }
        this.group.removeFromParent();
    }
}

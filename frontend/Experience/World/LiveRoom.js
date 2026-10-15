import * as THREE from "three";

import Experience from "../Experience.js";
import { LOW_POWER, QUALITY, SHADOW_MAP_SIZE, roomLightmap } from "../Utils/device.js";
import { INDOOR_EXPOSURE, NIGHT_EXPOSURE, PROBE_SIZE, RoomProbe, SunFit } from "../Realism.js";
import { NIGHT as PLAIN_NIGHT, LIVE_NIGHT_SKY } from "./Environment.js";
import { INDOOR, withoutGlow } from "./Sky.js";
import LiveSwitches from "./LiveSwitches.js";
import LampPool from "./LampPool.js";
import RoomGlow from "./RoomGlow.js";
import LiveBulbs from "./LiveBulbs.js";
import RoomBakeLight from "./RoomBakeLight.js";
import { distinguish } from "./Fittings.js";
import { reflectionsOnly, wholeGlass } from "../Utils/reflections.js";
import { SKY_VARIANTS } from "../../../shared/sky.js";
import { edgeDistance } from "../../../shared/roomGraph.js";
import { pointInPolygon } from "../Utils/geometry.js";

/**
 * Rooms of a view drawn from its bake, drawn with the materials they were
 * published with — the editor's: their colour, relief, gloss and
 * reflections — for as long as their visitor asks (World/RoomLight.js,
 * which says which: the group of rooms the visitor is in, and those seen
 * from it through what stands open), in the bake's own light where the
 * bake can give it (World/RoomBakeLight.js, `bake`): the sun through the
 * windows and the lamps nearest the visitor live, with their shadows, and
 * all the rest of their light the bake's — the sky through the windows,
 * every bounce, the soft shade in corners and under the furniture, the
 * lamps not drawn live. Where it cannot (a bake without its light apart),
 * lit as a version that was not baked lights them — the editor's realistic
 * walkthrough: the sun, the sky, the rooms' lamps and the glow a lit room
 * has there, and nothing of the bake on them but, at night, its measure of
 * a dark room's light (measure). Every other room, the garden and the view
 * from above stay the bake's.
 *
 * Several groups of rooms are shown at once (`showing`), each staged and
 * made ready by itself (build, prepare) and let into the picture or taken
 * out of it without touching the others (show, arrange) — under one sun
 * and its one shadow map, fitted over all of them, one pool of lamps and
 * one room probe, as a view lit live has one of each. "The room", below,
 * is all of them together.
 *
 * How, and why so:
 *
 *   - **A pass of its own.** three gathers the lights of a render call by
 *     the layers of the camera it is given, so the room and what lights it
 *     are on a layer of their own (ROOM_LAYER) and are drawn in a call of
 *     their own, into the same picture, just before the scene's own call —
 *     which then clears nothing, and whose depth test sorts the two out;
 *     what is seen through of the scene's comes after, over both, and what
 *     is seen through of the room's own — its windows' panes, a shower's
 *     screen, a glazed leaf — last of all, in a second call of the room's
 *     (GLASS_LAYER): lit by the room's lights and shaded from its sun as
 *     its walls are, where the scene's own call would have lit it by the
 *     baked view's sun, which the house does not shade. (In the bake's
 *     light the rooms' sheer curtains come after that, as the baked view
 *     draws them, in a call of their own: sheerCall.) The two worlds
 *     never light each other: nothing of the baked view is built again for
 *     a light of the room's, nothing in it pays for one, and the baked
 *     view's own sun and its small shadow map of what moves are as they
 *     were. (Lights of the room's put into the scene's own call would have
 *     had every lit thing in the frame — people, cars, trees, glass — built
 *     again for them and lit by them through the walls.) Each of the
 *     room's calls is handed a stand-in for the scene (standIn): three keeps
 *     the lights of a call by the scene it is given, and handed the scene
 *     itself from inside the scene's own render, the room's call and the
 *     scene's shared one record of them — which each then found changed
 *     under it, every frame, and looked every lit material's shader up
 *     again for.
 *   - **Its surfaces.** Each room's triangles lie together in the merged
 *     house (World/HouseMerger.js), and each run of them says which
 *     published material it was made with (SceneBuilder.roomRanges'
 *     `parts`): a mesh a material is made of those runs — the merged mesh's
 *     own vertices, an index of its own — and drawn with the material as an
 *     unbaked view copies it (SceneBuilder.roomMaterial). The room's part
 *     of the baked meshes is left out of their draw meanwhile (cut: each
 *     drawn by an index of its own that holds the rest — one draw a mesh,
 *     however many rooms of it are shown; a mesh that is all the room's,
 *     off every layer). With a room go the parts of the house that are no
 *     room's but stand in the openings of its walls — a window's frame and
 *     reveals, its sill, a door's casing and threshold (frames): the bake
 *     files them under "outside", and beside a room drawn live they were
 *     what was left of the bake in it.
 *   - **Its light is the unbaked view's own code**, pointed at the room —
 *     where it is not the bake's (RoomBakeLight, which keeps of this the
 *     switches, the lamps — the bake's own, a switch's together, with shadows
 *     every way —, the fittings' glass, the room probe for reflections and
 *     the sun's map; its exposure the baked view's meter's):
 *     the switches (LiveSwitches, kept as the baked view's stand), the
 *     lamps handed to the fittings nearest (LampPool, its lights on the
 *     room's layer), the lit rooms' glow (RoomGlow, in the room's materials
 *     alone), the fittings' glass (LiveBulbs), the sky's share and the room
 *     probe's light (Sky.share, Sky.light, Realism's RoomProbe — each face
 *     of it drawn by the two calls) and the sun's shadow map and its
 *     filter (Realism's SunFit — fitted over the rooms shown, where the
 *     unbaked view fits it to all the camera sees: sunBox). The exposure is
 *     the unbaked view's rule too (Realism.updateBaked, `adaptation`). But
 *     at night, where that exposure is the bake's own, the light that is
 *     not the rooms' lamps' — the sky's share, the night's sky — is, as far
 *     as a room's own lamps are off, what the bake measured reaching it
 *     (its probes each of six ways, brought up to what its lightmap holds
 *     where that is more), not the unbaked view's share of the open sky
 *     that knows nothing of walls (measure: each room its own figures, in
 *     RoomGlow's table) — so a room with its lamps off is as dark as its
 *     bake has it, and one with its lamps on is the editor's; by day it is
 *     all the unbaked view's.
 *   - **Its shadows.** The house's meshes cast none in a baked view, and
 *     must not: the baked sun's shadow map is of what moves alone. So the
 *     room's lights have casters of their own, on a layer no camera draws
 *     (CAST_LAYER): a stand-in for each mesh of the house — its vertices,
 *     the runs of it that cast in the editor — and the faces culled from
 *     the snapshot that cast there (the runtime file's "shadow-casters").
 *     Their shadow maps are drawn in the room's own call by three's own
 *     shadow pass, handed a camera that sees that layer and the scene's
 *     own (what moves, the trees) in place of the room's (roomCall), and
 *     only when one is due: a fit moved, a lamp handed on, something
 *     moved (update's `stirred`: a door, a figure, a car by the rooms —
 *     not the baked view's own sun's flag, which is raised at every metre
 *     walked). Which runs cast is the editor's `castShadow`, which the
 *     bake's own file has lost: read once from the version's unbaked
 *     snapshot (its JSON alone). A garden that casts nothing in the baked
 *     view — its shade is in the bake — casts for the room's sun for the
 *     length of its map's drawing (lend).
 *
 *   - **What moves in it** is drawn as the unbaked view draws it there too
 *     (plan, apply): the people round the property, the visitors' figures
 *     and a car in a garage with their own materials in the room's call
 *     (rigged figures on its layer themselves; door leaves, the furniture's
 *     doors and drawers and a car by stand-ins, their own meshes left where
 *     the crosshair finds them), lit by its lights and shading them; what
 *     is seen through likewise, in the room's second call. Whoever walks in
 *     or out is taken up or given back as they go (track).
 *   - **Made ready before it is shown** (prepare): nothing of it exists
 *     until a room is first asked for, and none of it may be made in the
 *     frame that first shows it — the first time that was one frame of
 *     three and a half seconds. So a room is staged: its surfaces built and
 *     kept off every layer, its textures sent one a frame, its shaders
 *     built for the lights it will be drawn under and each drawn once out
 *     of sight (Renderer.build, one new program a frame), its probe taken a
 *     face a frame — and only then shown, in one frame (show): the bake's
 *     drawing of it left out, its own let in, its lamps at their full
 *     strength with their shadows drawn. A room is shown only under lights
 *     its shaders were built for (fresh): another time of day, or another
 *     step of the slider, is staged again first.
 *
 * What it holds while none is shown is let go by `release`.
 */

/** The layer the room's surfaces and lights are on: drawn by its own call alone. */
export const ROOM_LAYER = 20;
/** The layer of what only casts shadows for the room's lights: no camera draws it. */
export const CAST_LAYER = 21;
/** The layer of what is seen through in the room — glass — under the same lights: drawn by a second call of its own, after the scene's. */
export const GLASS_LAYER = 22;

/** How far past the rooms' own corners their sun's shadow map reaches, in metres: the walls round them, and a soft edge's width. */
const SUN_MARGIN = 0.5;
/** How many groups of rooms stay staged — their surfaces built — at most: those shown (RoomLight's `most`, 8), those made ready behind the doors their visitor is near (4), and the last few left — with no room for those, a fifth door neared with eight rooms shown had one of the four still wanted let go, made ready again, and the next let go for it. */
const STAGED_MOST = 16;
/**
 * How far past an opening of a wall — a window, a door, a doorway — what stands in it reaches, in metres: along the
 * wall and up and down (a frame's own width, a casing, a sill's ends), and across it, out of the wall's faces (a
 * casing's thickness, a sill's nose). What is no room's and lies wholly within that of an opening of a room's wall
 * is drawn live with the room (frames): its frame, its reveals, its sill, its threshold. Measured on Ladonia (178
 * openings): of its windows' bronze frames 6,343 triangles of 6,344 lie within 2 cm of the wall's thickness and 6,272
 * within 10 cm of the opening's sides; a door's white casing is 2 cm proud of the wall and 5–10 cm wide. A deck's
 * boards, a terrace's lamp or a grill by a door lie 10–20 cm and more out of the wall, and stay the bake's. `end`:
 * how near the plane of an opening's side a wall's end lies — an older bake (Wrenfield's) has no reveal cut to the
 * opening: the end of the wall beside it, floor to ceiling, is the reveal, and is the opening's too.
 */
const FRAME_REACH = { along: 0.12, across: 0.08, up: 0.12, end: 0.02 };
/** How long a turn of making a room ready may take of a frame, in milliseconds. */
const SLICE = 3;
/** How fast the rooms next door are brought to the brightness the room now shown has them at, per second (expose). */
const GAIN_EASE = 4;
/**
 * In the bake's light, how long, in seconds, the light meter is kept from reading the frame while the rooms' light is on
 * its way somewhere (update: a switch's fade, a lamp handed on, the probe taken again — half a second or so), at most.
 */
const STIR_MOST = 2;
/** The maps a material draws with: sent to the GPU ahead of its first frame (upload). */
const MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "bumpMap", "alphaMap", "lightMap", "envMap"];
/** How far outside a room's edge a pane of glass is still the room's, in metres: a window hangs in its wall. */
const PANE_REACH = 0.35;
/** How far from the rooms shown, in metres, something that moves still shades their sun: a door leaf swung out, someone on the terrace. */
const SUN_REACH = 4;
/** How far from the visitor, in metres, what the view has never drawn is made ready for a room probe to see (surround): further off it is a few texels of a face. */
const SURROUND = 30;
/**
 * How many times the brightest texel round it a texel of a room probe's face may be, over a little (through): a
 * texel far brighter than all eight round it is a point of light narrower than the face can hold, not a room's
 * light. The face is drawn into a multisampled picture, as the view is, and one sample in four at the edge of a
 * triangle can come out as large as the picture holds — one texel of 16376 at the foot of a door, which,
 * prefiltered, lit a bedroom seven levels brighter; so can a pane or a handle in a room next door, still the
 * bake's, under the baked view's sun, which the house does not shade (one of 6152 through a doorway: four levels).
 * A view lit live draws its probe's faces unsampled and has all of it in the sun's shadow: it has neither. What
 * is bright over several texels each way — a lamp's own glass, the sun in a window — is the room's light, and is
 * left. But not a line or a dab of it: so a texel is held, too, to the third brightest of the eight `reach` texels
 * off, each way — the baked view's sun in a pane of the villa across the garden, seen through an open terrace door,
 * was a dash of twelve texels of 11,821, each with one as bright either side: that face's mean 2.08 where the
 * unbaked view's is 0.05, and the living room behind the door 48 levels too bright (a frame's mean 188 for 115)
 * for as long as its visitor stood within 2.5 m of where the probe was taken.
 */
const FACE_SPIKE = { times: 4, over: 1, reach: 4 };

/** A room's share of the light that is not its lamps', all of it: red, green, blue (measure). */
const ALL = [1, 1, 1];
/**
 * Under what share of its lightmap's light a room's probes are taken to have measured nothing of it (measure): villa
 * A's A3 closet, open to its living room, has four probes in its wardrobes' space that read 0 where its lightmap holds
 * the living room's light — warm, from the garden's lamps.
 */
const UNMEASURED = 0.05;
/** How long a room made ready at night waits for the bake's lightmap to be read for it (lightFigures), in milliseconds. */
const MEASURE_WAIT = 5000;

/** Light's brightness, red, green and blue: as the probes' and the lightmaps' are compared (measure). */
function luminance(rgb) {
    return rgb ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] : 0;
}

const _at = new THREE.Vector3();
const _box = new THREE.Box3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _matrix = new THREE.Matrix4();
const none = () => {};

/**
 * A room probe's light, told apart from the sky's (RoomGlow's `roomShareProbe`): what a material takes of it is not
 * taken again by its room's share (measure) — the probe is the room's light as it was drawn with that share.
 */
function probed(texture) {
    texture.userData.roomProbe = true;
    return texture;
}

/** Whether an object is drawn: it and everything it is under. */
function shown(object) {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return true;
}

export default class LiveRoom {
    /**
     * @param {World} world  drawing a public view from its bake
     * @param {object} published  the published version: its spec's lights and floors, and where its files are
     */
    constructor(world, published) {
        this.experience = new Experience();
        this.world = world;
        this.builder = world.sceneBuilder;
        this.renderer = this.experience.renderer;
        this.scene = this.experience.scene;
        this.published = published;
        /** The lights, the casters and what else a room drawn so needs: made when one is first asked for (ready). */
        this.rig = null;
        /** Where the bake can light them, its light under the rooms (World/RoomBakeLight.js) — made with the rig; null, the unbaked view's light. */
        this.bake = null;
        this.making = null;
        /** What is drawn now: `{ zones, gain, adaptation }` (Realism.updateBaked reads it) — null, nothing. */
        this.drawn = null;
        this.room = null;
        /** The rooms staged — their surfaces built, on no layer — by their ids joined: those shown among them (build). */
        this.staged = new Map();
        /** Those shown, by the same: the group of rooms their visitor is in, and those seen from it (show). */
        this.showing = new Map();
        /** What stands in the walls' openings and is no room's — frames, reveals, sills — opening by opening, once found (frames); and what is drawn live of the openings two groups of rooms share, by the opening's id (frameOf). */
        this.openings = null;
        this.shared = new Map();
        /** The one being made ready (prepare). */
        this.job = null;
        /** What has been built for which lights (lightKey) -> the materials, as each was then (markOf). */
        this.built = new Map();
        /** The lights (lightKey) the shadow passes' own shaders have been built for (lamps, primeShadows). */
        this.primed = new Set();
        /** mesh -> how it was drawn before a part of it was left out of its draw — its index, its layers — and the index it is drawn by meanwhile (cut) */
        this.split = new Map();
        /** mesh -> an index of its own to draw what is left of it by, kept from one cut to the next — and from one switching-on to the next: three gives a buffer back only with the geometry it is the index of, so each forgotten at a switching-off (release) left its buffer behind, 122 of them a time in a flat. */
        this.parts = new Map();
        /** What moves in the rooms shown, root by root (track) -> what each of its meshes is drawn as meanwhile (apply). */
        this.roots = new Map();
        /** mesh -> what to give it back (apply): its material, its layers, its stand-in. */
        this.held = new Map();
        /** Those of the roots that walk in and out (track), and those whose shaders are being built before they are taken up. */
        this.roaming = new Set();
        this.adopting = new Set();
        /** Whether what is drawn with the room's materials has changed since they were last lit (relight). */
        this.dirty = false;
        /** A material of what moves, or of a pane -> the room's own copy of it (copyOf); and what a mesh that is drawn by a stand-in draws with meanwhile: nothing. */
        this.copies = new Map();
        this.unseen = new Map();
        /** A see-through material of the room's -> what it is drawn with into the ambient occlusion's pictures of what is seen through (veilOf). */
        this.veils = new Map();
        /** The room's materials as the sky lights them (Sky.share): its own sets, not the scene's. */
        this.sets = { indoorMaterials: new Set(), reflectiveMaterials: new Set(), probe: null };
        /** Where its own call stands in a frame of the view: 0 not drawn, 2 drawn — the scene's own is on top of it, and what is seen through of the room's still to come (after). */
        this.phase = 0;
        /** How many meshes are on the layer of what is seen through now (apply): none, and its second call is not made. */
        this.panes = 0;
        /**
         * In the bake's light, the sheer curtains of the rooms shown (movers' `sheers`): the baked view's own meshes, left
         * out of the scene's call and drawn after the room's second one (sheerCall) — and of those, the ones left out of
         * this frame's (before); the view's own lights, as its call gathers them, each by a stand-in with no children.
         */
        this.sheers = [];
        this.sheered = null;
        this.viewLights = null;
        this.litFor = "";
        this.lightVersion = 0;
        this.probeStale = false;
        /** Whether something by the rooms shown has moved since the sun's shadow map was last drawn (update). */
        this.stirred = false;
        /** variant -> the switches their visitor has turned, and each as it last stood (turnedIn): a space without a sky of its own. */
        this.turned = new Map();
        this.stats = { shadows: 0, calls: 0, shown: 0, staged: 0, meshes: 0, triangles: 0, materials: 0, casters: 0, built: 0, sent: 0, faces: 0 };
        // (Which switches have been turned by hand is asked of a room first shown long after: noted as they are.)
        if (!world.sky && world.switches) {
            this.onSwitched = () => this.turnedIn(world.switches.variant);
            world.switches.on("change", this.onSwitched);
        }
    }

    /**
     * What a room drawn so needs, made once and kept: resolves when it is
     * there (the editor's `castShadow` of each published mesh fetched, the
     * casters made of them).
     *
     * @returns {Promise<object>} the rig
     */
    ready() {
        if (this.rig) return Promise.resolve(this.rig);
        this.making ??= this.castFlags()
            .then((flags) => (this.disposed ? null : this.make(flags)))
            .finally(() => (this.making = null));
        return this.making;
    }

    /**
     * Which of the published meshes cast and take shadows in the editor, by
     * `material|level|kind` — from the version's snapshot as it was culled
     * for a view lit live (`<version>/view.glb`, beside its runtime file),
     * whose nodes say; the bake's own copy of it does not. Its JSON alone
     * is fetched (a glb's first chunk). Empty if it cannot be had: then
     * everything casts but the ceilings.
     */
    async castFlags() {
        const flags = new Map();
        const runtime = this.published.runtime;
        if (!runtime) return flags;
        const url = runtime.replace(/runtime\.glb(?=$|\?)/, "view.glb");
        try {
            const read = async (range) => {
                const response = await fetch(url, { headers: { Range: `bytes=${range}` } });
                if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                return { whole: response.status !== 206, bytes: await response.arrayBuffer() };
            };
            const head = await read("0-19");
            const view = new DataView(head.bytes);
            if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) throw new Error("not a glb");
            const length = view.getUint32(12, true);
            // (A server that sends all of it whatever is asked has sent it already.)
            const body = head.whole ? head.bytes.slice(20, 20 + length) : (await read(`20-${19 + length}`)).bytes;
            const json = JSON.parse(new TextDecoder().decode(body.byteLength > length ? body.slice(20, 20 + length) : body));
            for (const node of json.nodes ?? []) {
                const extras = node.extras;
                if (!extras || extras.material === undefined) continue;
                const key = `${extras.material}|${extras.level ?? 0}|${extras.kind ?? ""}`;
                const had = flags.get(key);
                // (Two meshes of one material, floor and kind that differ: whatever either does.)
                flags.set(key, { cast: Boolean(extras.cast ?? true) || Boolean(had?.cast), receive: Boolean(extras.receive ?? true) || Boolean(had?.receive) });
            }
        } catch (error) {
            console.warn("What casts a shadow in the editor could not be read; everything but the ceilings casts in a room drawn live.", error);
        }
        return flags;
    }

    /** Whether a part of a mesh casts and takes shadows in the editor (castFlags). */
    flagsOf(key, mesh) {
        const kind = mesh.userData.kind ?? "";
        return this.flags.get(`${key}|${mesh.userData.level ?? 0}|${kind}`) ?? { cast: kind !== "ceiling", receive: true };
    }

    /** The rig: the room's group and cameras, its switches, lamps, glow and bulbs, its sun, and what casts for them. */
    async make(flags) {
        this.flags = flags;
        // (Made a part a frame: all of it at once was a fifth of a second between two frames.)
        const took = (this.stats.made = {});
        let since = performance.now();
        const part = async (name) => {
            took[name] = Math.round((performance.now() - since) * 10) / 10;
            await this.renderer.nextFrame();
            since = performance.now();
        };
        const world = this.world;
        const builder = this.builder;
        const scene = this.scene;
        // (Each mesh under them is put where what it stands for is by its `matrix`, in the world's own frame.)
        const group = new THREE.Group();
        group.name = "room-live";
        // ...and of what moves in the room (dress): a stand-in for each of its meshes, where the mesh is each frame.
        const movers = new THREE.Group();
        movers.name = "room-live-movers";
        scene.add(group, movers);

        // The camera its call is drawn through — the view's own, on the room's layer — and the one its lights'
        // shadow maps are drawn for: what casts for them alone, and what casts in the scene (what moves, the trees).
        const eye = new THREE.PerspectiveCamera();
        eye.matrixAutoUpdate = false;
        eye.matrixWorldAutoUpdate = false;
        eye.layers.set(ROOM_LAYER);
        // ...the one its second call is drawn through, of what is seen through in it...
        const glassEye = new THREE.PerspectiveCamera();
        glassEye.matrixAutoUpdate = false;
        glassEye.matrixWorldAutoUpdate = false;
        glassEye.layers.set(GLASS_LAYER);
        const casterEye = new THREE.PerspectiveCamera();
        casterEye.layers.enable(CAST_LAYER);
        // What each of its calls is handed as the scene (standIn): the first clears the picture as the scene would, the second nothing.
        const first = standIn(scene);
        const last = standIn(scene, { background: null });

        // In the bake's own light, where it can be (RoomBakeLight): all of it but the sun's and the lamps drawn live.
        const bake = RoomBakeLight.usable(builder, this.published.lighting) ? new RoomBakeLight(this) : null;
        this.bake = bake;
        // Its switches: the fittings as a version not baked has them, each on or off as the baked view's switch is.
        const baked = world.switches ?? null;
        const listed = (this.published.spec?.lights || []).filter((light) => baked?.byId.has(light.switch));
        const lights = distinguish(listed.map((light) => ({ ...light })));
        // (In the bake's light, as its switches stand — never lit by day where the bake has them off: syncSwitches.)
        const switches = new LiveSwitches(builder.spec, lights, { levels: this.published.levels, dayOn: !world.sky && !bake, daylight: true });
        switches.on("change", () => (this.probeStale = true));
        await part("switches");
        // (Its map of the plan a few rooms a frame: 0.17 s of it on Ladonia, in one go.)
        // (With each room's share of the light that is not its lamps', as its bake measured it: measure.) None in the bake's
        // light: a lit room's light round it is the bake's there.
        let glow = null;
        if (!bake) {
            glow = new RoomGlow(world, switches, { root: group, deferred: true, shares: true });
            const steps = glow.steps(builder.spec);
            for (let until = performance.now() + SLICE; !steps.next().done; ) {
                if (performance.now() < until) continue;
                await this.renderer.nextFrame();
                until = performance.now() + SLICE;
            }
            glow.finish();
        }
        await part("glow");
        // Its lamps come into its call's light, and go out of it, once the shaders of what is shown are built for that
        // (construct) — and are handed round by where the visitor is in the rooms shown, not in the next one, still the
        // bake's, that they have stepped into (the room shown keeps its lamps until the frame the other takes over).
        const pool = new LampPool(world, switches, {
            layer: [ROOM_LAYER, GLASS_LAYER],
            prepare: () => this.lamps(true),
            // (Out again once the rooms shown have their shaders for that: built now, if they were first shown with a lamp lit.)
            prepareOut: () => this.lamps(false),
            warm: false,
            where: (where) => {
                if (!this.drawn || this.drawn.zones.has(where.room)) return (this.whereWas = { ...where, point: where.point.clone() });
                return this.whereWas ?? where;
            },
            // In the bake's light, the bake's own lamps, a switch's all together, with their shadows: RoomBakeLight.lightsOf.
            whole: bake ? (entry) => bake.lightsOf(entry) : null,
        });
        const bulbs = new LiveBulbs(world, switches, { root: group, sky: { adopt: none } });

        // Its sun, as Environment makes the world's; under a site's own sky, fitted to the view as Realism fits that.
        const sun = new THREE.DirectionalLight(0xffffff, 0);
        sun.name = "room-live:sun";
        sun.layers.set(ROOM_LAYER);
        sun.layers.enable(GLASS_LAYER);
        sun.castShadow = true;
        sun.shadow.autoUpdate = false;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 120;
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.02;
        scene.add(sun, sun.target);
        // Without a sky of its own, the preset's two other lights too (none in the bake's light: theirs is in it).
        let ambient = null;
        let hemisphere = null;
        if (!world.sky && !bake) {
            ambient = new THREE.AmbientLight(0xffffff, 0);
            hemisphere = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
            for (const light of [ambient, hemisphere]) {
                light.name = `room-live:${light.type}`;
                light.layers.set(ROOM_LAYER);
                light.layers.enable(GLASS_LAYER);
                scene.add(light);
            }
        }
        const fit = new SunFit();
        const environment = world.environment;
        const fitted = { sun, experience: this.experience, footprintExtent: (options) => environment.footprintExtent(options), fitShadows: none };

        // What prefilters its room probes, its one shader set building from now (kept for the visit: a probe is made anew at every room).
        let pmrem = null;
        if (world.sky) {
            const renderer = this.renderer.renderer;
            pmrem = new THREE.PMREMGenerator(renderer);
            // (Built as they will be drawn — into a picture, not to the screen: three builds a shader for where it draws.)
            const target = renderer.getRenderTarget();
            renderer.setRenderTarget((this.scrap ??= new THREE.WebGLRenderTarget(4, 4)));
            pmrem.compileCubemapShader();
            // ...and its blur's, which it makes with its first probe — in that frame — unless it is made to now (three
            // keeps these to itself: left to the first probe if they are not there).
            if (typeof pmrem._setSize === "function" && typeof pmrem._allocateTargets === "function" && typeof pmrem._compileMaterial === "function") {
                pmrem._setSize(PROBE_SIZE);
                pmrem._allocateTargets().dispose();
                if (pmrem._blurMaterial) pmrem._compileMaterial(pmrem._blurMaterial);
            }
            renderer.setRenderTarget(target);
        }
        await part("lights");
        const casters = this.makeCasters();
        await part("casters");
        this.rig = { group, movers, eye, glassEye, casterEye, first, last, switches, glow, pool, bulbs, sun, ambient, hemisphere, fit, fitted, probe: null, pmrem, casters };
        // (The view was left while it was being made.)
        if (this.disposed) {
            this.disposed = false;
            this.dispose();
            return null;
        }
        return this.rig;
    }

    /**
     * What casts for the room's lights: a stand-in for each mesh of the
     * house — its own vertices; all of its triangles, or an index of the
     * runs of them that cast in the editor (flagsOf) — drawn from the side
     * the unbaked view draws its shadow from, and the faces culled from the
     * snapshot (SceneBuilder.addShadowCasters does the same for a view lit
     * live). Out of sight of every camera but the one the shadow maps are
     * drawn for, and hidden but while they are.
     */
    makeCasters() {
        const builder = this.builder;
        // (In the scene only while a shadow map is drawn — roomCall: seven hundred more things for every render to pass over, else.)
        const casters = new THREE.Group();
        casters.name = "room-live-casters";
        const materials = new Map();
        const drawnFrom = (side, shadowSide) => {
            const id = `${side}|${shadowSide}`;
            if (!materials.has(id)) {
                const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side });
                material.name = "room-live-caster";
                material.shadowSide = shadowSide;
                materials.set(id, material);
            }
            return materials.get(id);
        };
        const add = (geometry, material, source, name) => {
            const proxy = new THREE.Mesh(geometry, material);
            proxy.name = name;
            proxy.matrixAutoUpdate = false;
            proxy.matrix.copy(source.matrixWorld);
            proxy.matrixWorld.copy(source.matrixWorld);
            proxy.layers.set(CAST_LAYER);
            proxy.castShadow = true;
            proxy.raycast = none;
            proxy.userData.source = source;
            casters.add(proxy);
        };
        for (const mesh of builder.batches?.children ?? []) {
            const base = this.baseOf(mesh);
            const from = mesh.geometry;
            if (mesh.userData.shadowCaster || !base || Array.isArray(base) || !from?.attributes.position) continue;
            // (In the bake's light the lamps hang where the bake's did, in their glass, which blocked none of their light there.)
            if (this.bake && mesh.userData.glow) continue;
            const whole = this.whole(mesh);
            const total = whole ? whole.count : from.attributes.position.count;
            const ranges = mesh.userData.ranges ?? [{ parts: [{ key: mesh.userData.material, start: 0, count: total }] }];
            const runs = [];
            let casting = 0;
            for (const range of ranges) {
                for (const part of range.parts) {
                    // (In the bake's light everything casts that cast in the bake — a room's ceiling too, under a terrace
                    // or a roof that casts nothing here: the editor's sun shone through it onto the walls.)
                    if (!this.bake && !this.flagsOf(part.key, mesh).cast) continue;
                    const last = runs[runs.length - 1];
                    if (last && last.start + last.count === part.start) last.count += part.count;
                    else runs.push({ start: part.start, count: part.count });
                    casting += part.count;
                }
            }
            if (!casting || (casting < total && !whole)) continue;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", from.attributes.position);
            geometry.setIndex(casting === total ? whole : indexOf(whole, runs, casting));
            if (!from.boundingSphere) from.computeBoundingSphere();
            geometry.boundingSphere = from.boundingSphere;
            // From the side the unbaked view's copy of its material is drawn, and its shadow from (SceneBuilder's liveCopy).
            const live = builder.liveByKey.get(mesh.userData.material);
            const twoSided = builder.viewCull && live?.side === THREE.DoubleSide;
            add(geometry, drawnFrom(base.side, base.shadowSide ?? (twoSided ? THREE.DoubleSide : null)), mesh, `cast:${mesh.name}`);
        }
        const culled = builder.runtime?.scene.getObjectByName("shadow-casters");
        if (culled) {
            culled.updateMatrixWorld(true);
            for (const node of culled.children) {
                if (!node.isMesh) continue;
                if (!node.geometry.boundingSphere) node.geometry.computeBoundingSphere();
                add(node.geometry, drawnFrom(THREE.FrontSide, node.userData.twoSided ? THREE.DoubleSide : null), node, `cast:${node.name}`);
            }
        }
        this.stats.casters = casters.children.length;
        return casters;
    }

    // ------------------------------------------------------------------
    // What moves in the rooms
    // ------------------------------------------------------------------

    /**
     * What moves in `zones` — or hangs in their walls — and is drawn as a
     * view lit live draws it while they are shown: the doors' leaves, the
     * furniture's doors and drawers, the rooms' own panes of glass (what
     * stays where it is: `fixed`), and whoever and whatever stands in them
     * now — the people round the property, the visitors' figures, a car
     * (`moving`: looked for again as they go, track). And, in the bake's
     * light, what hangs in them that is seen through and is no clear glass
     * — a sheer curtain (`sheers`) —, which stays as the baked view draws it
     * (sheerCall).
     *
     * @returns {{ fixed: THREE.Object3D[], moving: THREE.Object3D[], sheers: THREE.Mesh[] }}
     */
    movers(zones) {
        const builder = this.builder;
        const fixed = [];
        for (const door of builder.doors || []) {
            if (!builder.doorSideZones(door.spec.id).some((zone) => zones.includes(zone))) continue;
            for (const { leaf } of door.leaves) fixed.push(leaf);
        }
        for (const part of builder.openables?.parts || []) if (this.within(part.node, zones)) fixed.push(part.node);
        // The rooms' panes: what is seen through and stands in one of them, or in its walls — but, in the bake's light, what
        // is seen through and is no clear glass (a sheer curtain), which stays the baked view's (sheers, sheerCall).
        const sheers = [];
        const rooms = zones.map((zone) => builder.spec.rooms.find((room) => room.id === zone)).filter(Boolean);
        builder.root.getObjectByName("see-through")?.traverse((mesh) => {
            if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
            if (![].concat(mesh.material).every((material) => material?.transparent && "envMapIntensity" in material)) return;
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).getCenter(_at);
            const near = rooms.some((room) => _at.y > room.elevation - 0.1 && _at.y < room.elevation + room.height + 0.1 && (pointInPolygon(_at.x, _at.z, room.polygon) || edgeDistance(_at.x, _at.z, room.polygon) < PANE_REACH));
            if (!near) return;
            if (this.bake && [].concat(mesh.material).every((material) => !reflectionsOnly(material))) sheers.push(mesh);
            else fixed.push(mesh);
        });
        return { fixed, moving: this.moving().filter((root) => shown(root) && this.within(root, zones)), sheers };
    }

    /** Everything that walks, sits or drives: each person's group, each visitor's figure, each car. */
    moving() {
        const world = this.world;
        const roots = [];
        for (const person of world.people?.list ?? []) roots.push(person.group);
        const player = world.player;
        if (player?.avatar?.avatar) roots.push(player.avatar.avatar);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) roots.push(other.model.avatar);
        for (const car of this.builder.cars || []) roots.push(car.group);
        return roots;
    }

    /** Whether something stands in one of `zones` (a little over its own foot: a figure's is on the floor's own level). */
    within(object, zones) {
        // The visitor's own figure is where the visitor is: in the rooms shown for them, on a threshold too.
        if (object === this.world.player?.avatar?.avatar && !this.world.player.inVehicle) return true;
        object.getWorldPosition(_at);
        return zones.includes(this.builder.roomAt(_at.x, _at.y + 0.1, _at.z)?.id);
    }

    /**
     * How each mesh under `root` is drawn while its room is shown — with
     * the material it has in a view lit live (the one the bake's light
     * probes dressed over, World/ProbeLight.js: a copy of the room's own,
     * copyOf):
     *
     *   - a rigged figure's goes onto the room's layer itself, and the
     *     casters' ("layer"): nothing looks for it with a ray;
     *   - any other is drawn in the room's call by a stand-in — its own
     *     geometry, where it is each frame (follow) — which casts for the
     *     room's lights too ("stand-in"); the mesh itself draws nothing
     *     meanwhile (a material that does not show), and stays where the
     *     crosshair and the camera find it;
     *   - and one that is seen through — a glazed leaf's pane, a window, a
     *     shower's screen, a car's glass — either way on the layer of the
     *     room's second call (`layer`), which is drawn after the scene's:
     *     lit by the room's lights as its walls are, clear as glass is from
     *     indoors and reflecting the room. Glass the baked view keeps to its
     *     reflections alone (SceneBuilder.clearGlassIndoors) is drawn whole
     *     again, as a view lit live has it.
     *
     * Nothing is changed by this: apply does, give back undoes.
     */
    plan(root) {
        const probes = this.world.probes;
        const figure = root.userData?.kind === "person" || this.figures().has(root);
        const entries = [];
        root.traverse((mesh) => {
            if (!mesh.isMesh || !mesh.material) return;
            // (As the room that shows it now has it, where one does: its own is under that.)
            const held = this.held.get(mesh);
            const own = held ? held.own : probes?.undressed.get(mesh) ?? mesh.material;
            const all = [].concat(own);
            // (Without the bake's probes a leaf's own material has been coloured by the doors' light: left as it is.)
            if (all.some((material) => !material || material.userData.bakedTint || material.userData.roomLive)) return;
            // (In the bake's light each thing its own copy, lit by the probes round it — RoomBakeLight — and clear glass,
            // wherever it stands, as the baked view keeps the glass that stands in a room: its reflections alone. The bake
            // lights no glass. Lit by the bake's light on its own white, a shower's screen hid its tiles, and a window's
            // pane in a lamplit room — a tenth opaque, lit by the room's probes — was a milky sheet over the night: B's
            // upper north bedroom 2's pane 137,110,85 where the bake's is 16,13,14.)
            const copies = all.map((material) => (this.bake ? this.bake.material(reflectionsOnly(material) ?? material, "cube", root) : this.copyOf(wholeGlass(material))));
            const material = Array.isArray(own) ? copies : copies[0];
            const kind = figure || mesh.isSkinnedMesh ? "layer" : "stand-in";
            const through = all.some((each) => each.transparent);
            // (What is seen through is drawn once more a frame, for how see-through it is alone: veil.)
            const veil = through ? (Array.isArray(material) ? material.map((each) => this.veilOf(each)) : this.veilOf(material)) : null;
            entries.push({ mesh, own, material, kind, layer: through ? GLASS_LAYER : ROOM_LAYER, veil, root });
        });
        return entries;
    }

    /** The visitors' figures: the visitor's own and everyone else's. */
    figures() {
        const player = this.world.player;
        const figures = new Set();
        if (player?.avatar?.avatar) figures.add(player.avatar.avatar);
        for (const other of Object.values(player?.otherPlayers || {})) if (other.model?.avatar) figures.add(other.model.avatar);
        return figures;
    }

    /** What plan says, done: each mesh drawn as the room draws it, with what to give back kept. */
    apply(root, entries) {
        const rig = this.rig;
        const done = [];
        for (const entry of entries) {
            const { mesh, material, kind, layer } = entry;
            if (this.held.has(mesh)) continue;
            const was = { mesh, own: entry.own, material: mesh.material, mask: mesh.layers.mask, standIn: null, through: layer === GLASS_LAYER, veil: entry.veil };
            mesh.userData.roomLive = true;
            if (was.through) this.panes++;
            if (kind === "layer") {
                mesh.material = material;
                mesh.layers.set(layer);
                mesh.layers.enable(CAST_LAYER);
            } else {
                mesh.material = Array.isArray(material) ? material.map((each) => this.unseenLike(each)) : this.unseenLike(material);
                const standIn = new THREE.Mesh(mesh.geometry, material);
                standIn.name = `live:${mesh.name}`;
                standIn.matrixAutoUpdate = false;
                standIn.layers.set(layer);
                standIn.layers.enable(CAST_LAYER);
                standIn.castShadow = mesh.castShadow;
                standIn.receiveShadow = this.bake ? true : mesh.receiveShadow;
                standIn.frustumCulled = mesh.frustumCulled;
                standIn.renderOrder = mesh.renderOrder;
                standIn.raycast = none;
                standIn.userData = { roomLive: true, source: mesh };
                rig.movers.add(standIn);
                was.standIn = standIn;
            }
            this.held.set(mesh, was);
            done.push(was);
        }
        this.roots.set(root, done);
        this.dirty = true;
    }

    /** A root back as the baked view draws it (apply undone). */
    giveBack(root) {
        for (const was of this.roots.get(root) ?? []) {
            const { mesh } = was;
            mesh.material = was.material;
            mesh.layers.mask = was.mask;
            delete mesh.userData.roomLive;
            if (was.standIn) this.rig.movers.remove(was.standIn);
            if (was.through) this.panes--;
            this.held.delete(mesh);
        }
        this.roots.delete(root);
        this.dirty = true;
    }

    /**
     * Whoever has walked into the rooms shown, or out of them, since the
     * last frame: taken up — once its materials' shaders are built for the
     * room's lights, a few frames on the first time — or given back.
     */
    track() {
        const zones = [...this.drawn.zones];
        // (Someone not drawn — the visitor's own figure, seen through its eyes — is taken up when they are.)
        const now = new Set(this.moving().filter((root) => (this.roots.has(root) || shown(root)) && this.within(root, zones)));
        for (const root of [...this.roots.keys()]) if (this.roaming.has(root) && !now.has(root)) this.giveBack(root);
        for (const root of now) {
            this.roaming.add(root);
            const shown = this.roots.get(root);
            // (One taken up already is looked over again now and then: a figure's model may have come since.)
            if (shown && (this.frame ?? 0) % 30) continue;
            const entries = this.plan(root);
            // (A figure whose meshes have come since — a model that has just loaded — is planned again.)
            if (shown && shown.length >= entries.length) continue;
            if (this.adopting.has(root)) continue;
            const key = this.lightKey(this.rig.pool.lit);
            const todo = this.unbuilt(this.proxies(entries), key);
            if (!todo.length) {
                if (shown) this.giveBack(root);
                this.apply(root, entries);
                continue;
            }
            // Its shaders first, between frames; taken up at a frame after. (One they cannot be built for is left as the bake draws it.)
            this.adopting.add(root);
            this.construct(todo, key, this.rig.pool.lit).then(
                () => this.adopting.delete(root),
                (error) => console.warn("Something in the room drawn live keeps the bake's drawing: its shaders could not be built", error)
            );
        }
    }

    /** The room's own copy of a material of what moves or of a pane, made once: lit by the room's lights, its share of the sky and its probe, not the scene's. */
    copyOf(material) {
        let copy = this.copies.get(material);
        if (!copy) {
            // (Its own glow, not the one the scene's material wears at night: Sky.js's withoutGlow.)
            copy = withoutGlow(material.clone(), material);
            // (A shader of its own, which a copy does not take with it.)
            if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
                copy.onBeforeCompile = material.onBeforeCompile;
                copy.customProgramCacheKey = material.customProgramCacheKey;
            }
            copy.userData.roomLive = true;
            this.copies.set(material, copy);
        }
        return copy;
    }

    /**
     * What a see-through material of the room's is drawn with into the
     * pictures that tell the ambient occlusion where to ease off (veil): as
     * see-through as it is, and nothing else of it — those pictures are read
     * for that alone, and the material itself, lit by every lamp of the
     * room, was a millisecond of each frame in a bathroom with a shower's
     * screen across it.
     */
    veilOf(material) {
        let veil = this.veils.get(material);
        if (!veil) {
            veil = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: material.opacity,
                map: material.map ?? null,
                alphaMap: material.alphaMap ?? null,
                alphaTest: material.alphaTest,
                side: material.side,
                depthWrite: material.depthWrite,
                depthTest: material.depthTest,
                fog: false,
                toneMapped: false,
            });
            veil.name = "room-live-veil";
            veil.userData.roomLive = true;
            this.veils.set(material, veil);
        }
        return veil;
    }

    /** A material that draws nothing, found by a ray from the side `material` is. */
    unseenLike(material) {
        if (!this.unseen.has(material.side)) {
            const unseen = new THREE.MeshBasicMaterial({ visible: false, side: material.side });
            unseen.name = "room-live-unseen";
            this.unseen.set(material.side, unseen);
        }
        return this.unseen.get(material.side);
    }

    /** Each stand-in where what it stands for is now, and shown as that is. */
    follow() {
        for (const standIn of this.rig.movers.children) {
            const source = standIn.userData.source;
            source.updateWorldMatrix(true, false);
            standIn.matrix.copy(source.matrixWorld);
            standIn.matrixWorld.copy(source.matrixWorld);
            standIn.visible = shown(source);
        }
    }

    /** Everything drawn with a material of the room's — its surfaces, the stand-ins of what moves and of the glass, the figures — as something to traverse. */
    lit() {
        const meshes = [...this.surfaces(), ...this.rig.movers.children];
        for (const done of this.roots.values()) for (const was of done) if (!was.standIn) meshes.push(was.mesh);
        return { traverse: (visit) => meshes.forEach(visit) };
    }

    /** The surfaces drawn live now: those of every group of rooms shown, and of the openings they share (frameOf). */
    surfaces() {
        const meshes = [];
        for (const set of this.showing.values()) for (const mesh of set.meshes) meshes.push(mesh);
        for (const frame of this.shared.values()) if (frame.on) for (const mesh of frame.meshes) meshes.push(mesh);
        return meshes;
    }

    /** A staged group's own surfaces, and those of the openings it shares with another (frameOf): what its shaders are built for. */
    meshesOf(set) {
        const meshes = [...set.meshes];
        for (const frame of set.frames ?? []) for (const mesh of frame.meshes) meshes.push(mesh);
        return meshes;
    }

    /** The material a mesh of the baked view is drawn with. */
    baseOf(mesh) {
        return mesh.material;
    }

    /** All of a mesh's index, as the house was merged — where a part of it is left out of its draw now (cut), not the index it is drawn by meanwhile. */
    whole(mesh) {
        return this.split.get(mesh)?.index ?? mesh.geometry.index;
    }

    // ------------------------------------------------------------------
    // A room staged, made ready, shown
    // ------------------------------------------------------------------

    /**
     * These rooms' surfaces as an unbaked view draws them, built and kept
     * on no layer — nothing draws them — until they are shown (show): a
     * mesh a material of each merged mesh's part in them and in the
     * openings of their walls (frames), and which of the bake's own drawing
     * to leave out meanwhile. Kept for the next time (the last few:
     * STAGED_MOST). Null where the rooms have nothing to draw so.
     *
     * @param {string[]} zones  the rooms' ids
     */
    build(zones) {
        const key = zones.join();
        const had = this.staged.get(key);
        if (had) {
            // (Most lately asked for, last to go.)
            this.staged.delete(key);
            this.staged.set(key, had);
            return had;
        }
        const rig = this.rig;
        const builder = this.builder;
        /** `${mesh.id}|${material.id}` -> what is drawn of that mesh with that material */
        const made = new Map();
        /** mesh -> the runs of its index that are these rooms' */
        const out = new Map();
        const take = (mesh, material, part, run, kind = null) => {
            const id = `${mesh.id}|${material.id}`;
            if (!made.has(id)) made.set(id, { mesh, material, key: part, runs: [], count: 0, kind });
            const entry = made.get(id);
            entry.runs.push(run);
            entry.count += run.count;
        };
        const leave = (mesh, run) => {
            if (!out.has(mesh)) out.set(mesh, []);
            out.get(mesh).push({ start: run.start, count: run.count });
        };
        for (const zone of zones) {
            for (const range of builder.roomRanges(zone)) {
                const mesh = range.mesh;
                const base = this.baseOf(mesh);
                // What is seen through stays the scene's own, drawn after both calls.
                if (mesh.userData.shadowCaster || !base || Array.isArray(base) || base.transparent || !this.whole(mesh)) continue;
                // (In the bake's light, lit as the part of the house it is: by the lightmap, its vertices, or neither.)
                const kind = this.bake?.kindOf(mesh, zone) ?? null;
                const materials = range.parts.map((part) => this.surfaceMaterial(part.key, base, kind));
                // (A part the version has no material for: all of the range stays the bake's.)
                if (materials.some((material) => !material)) continue;
                range.parts.forEach((part, k) => take(mesh, materials[k], part.key, part, kind));
                leave(mesh, range);
            }
        }
        if (!made.size) return null;
        // What stands in the openings of these rooms' walls and is no room's — the frames, the reveals, the sills: with
        // them where the opening is theirs alone (a window, a door to the terrace, a door between two of them); an
        // opening shared with another group of rooms has its own (frameOf), shown with whichever of the two is.
        const frames = [];
        for (const opening of this.openingsOf(zones)) {
            if (opening.rooms.some((room) => room !== null && !zones.includes(room))) {
                const frame = this.frameOf(opening);
                if (frame) frames.push(frame);
                continue;
            }
            for (const piece of opening.pieces) {
                const kind = this.bake?.kindOf(piece.mesh, piece.mesh.userData.zone ?? "outside") ?? null;
                const material = this.surfaceMaterial(piece.key, this.baseOf(piece.mesh), kind);
                if (!material) continue;
                for (const run of piece.runs) {
                    take(piece.mesh, material, piece.key, run, kind);
                    leave(piece.mesh, run);
                }
            }
        }

        const group = new THREE.Group();
        group.name = `room-live:${key}`;
        let triangles = 0;
        for (const entry of made.values()) {
            group.add(this.surface(entry));
            triangles += entry.count / 3;
        }
        for (const runs of out.values()) runs.sort((a, b) => a.start - b.start);
        rig.group.add(group);
        // The fittings' glass each its switch's own, and every material made to glow with its room: before any shader of theirs is built.
        rig.bulbs.collect(group);
        rig.glow?.applyTo(group);
        const set = { key, zones: [...zones], group, meshes: [...group.children], out, frames, triangles, on: false, probe: null };
        this.staged.set(key, set);
        this.stats.staged++;
        // The oldest but those shown let go.
        for (const [other, old] of this.staged) {
            if (this.staged.size <= STAGED_MOST) break;
            if (!this.showing.has(other) && old !== set) this.drop(other);
        }
        return set;
    }

    /**
     * The material a part of the house is drawn with in a room drawn live:
     * the published version's own, by its key (SceneBuilder.roomMaterial) —
     * in the bake's light, a copy of it lit as `kind` says
     * (RoomBakeLight.material). Null for a key the version does not have.
     */
    surfaceMaterial(key, baked, kind) {
        const material = this.builder.roomMaterial(key, baked);
        if (!material || !this.bake) return material;
        return this.bake.material(material, kind);
    }

    /**
     * A mesh of the room's own: some runs of a merged mesh's triangles —
     * its own vertices, an index of its own — drawn with the material they
     * were published with, as a view lit live copies it; on no layer until
     * it is shown (arrange).
     *
     * @param {{ mesh: THREE.Mesh, material: THREE.Material, key: string, runs: object[], count: number }} entry
     */
    surface({ mesh: source, material, key, runs, count, kind = null }) {
        const from = source.geometry;
        const whole = this.whole(source);
        const geometry = new THREE.BufferGeometry();
        // The mesh's own vertices, less what the bake wrote on them: its light, its lightmap's coordinates, its tint — but,
        // in the bake's light (RoomBakeLight), the lightmap's coordinates of what is lit by it, and a thin face's light as
        // the rooms drawn live take it.
        for (const [name, attribute] of Object.entries(from.attributes)) {
            if (name === "color" || name === "tint" || (name === "uv1" && kind !== "lightmap") || name.startsWith("_")) continue;
            geometry.setAttribute(name, attribute);
        }
        if (kind === "vertex") geometry.setAttribute("roomBake", this.bake.thinOf(source));
        geometry.setIndex(indexOf(whole, runs, count));
        _box.makeEmpty();
        const position = from.attributes.position;
        for (const run of runs) {
            if (run.vertexCount !== undefined) {
                const end = run.vertexStart + run.vertexCount;
                for (let v = run.vertexStart; v < end; v++) _box.expandByPoint(_at.fromBufferAttribute(position, v));
            } else {
                // (A run of an opening's: by its corners.)
                const end = run.start + run.count;
                for (let i = run.start; i < end; i++) _box.expandByPoint(_at.fromBufferAttribute(position, whole.array[i]));
            }
        }
        geometry.boundingSphere = _box.getBoundingSphere(new THREE.Sphere());
        const flags = this.flagsOf(key, source);
        material.userData.roomLive = true;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `live:${key}`;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(source.matrixWorld);
        mesh.matrixWorld.copy(source.matrixWorld);
        // (On no layer until its rooms are shown.)
        mesh.layers.mask = 0;
        mesh.renderOrder = source.renderOrder;
        // (Its shadow is its stand-in's, among the casters.)
        mesh.castShadow = false;
        // (In the bake's light everything takes the shadows, as everything did in the bake: a light switch's plate,
        // which takes none in the editor, was lit by the sun through the walls of A2's windowless bathroom — 204 levels,
        // a white panel in the dark, where the bake has it at 31.)
        mesh.receiveShadow = this.bake ? true : flags.receive;
        mesh.raycast = none;
        mesh.userData = { roomLive: true, level: source.userData.level ?? 0, kind: source.userData.kind ?? null, ...(source.userData.glow && { glow: source.userData.glow }) };
        return mesh;
    }

    /**
     * What stands in the walls' openings and is no room's, found once for
     * the whole house, a little a frame: the bake files a window's frame,
     * the outer half of its reveals, its sill, a door's casing and its
     * threshold under "outside" — they are in no room — and lights them as
     * the garden is lit; beside a room drawn live they were the one thing
     * left of the bake in it, and at the room's exposure a white frame came
     * out dark green by day and black at night. So each triangle that is no
     * room's and lies wholly within an opening of a wall — as wide as the
     * opening and as deep as the wall, and FRAME_REACH more, or in the
     * plane of one of its sides up the wall's whole height (a wall's end)
     * — is that opening's, and is drawn live with the rooms either side of
     * it (build, frameOf). Nothing else of the outside is: the garden, the
     * terrace and the façade stay the bake's.
     *
     * `this.openings`: each `{ id, rooms: [id|null, id|null], pieces: [{ mesh, key, runs }] }`, and by room.
     */
    async frames(alive) {
        const builder = this.builder;
        const spec = builder.spec;
        const list = [];
        /** A square metre of the plan -> the openings that reach into it */
        const cells = new Map();
        const reach = FRAME_REACH;
        for (const wall of spec.walls || []) {
            const [x1, z1] = wall.start;
            const [x2, z2] = wall.end;
            const length = Math.hypot(x2 - x1, z2 - z1);
            if (!length) continue;
            const dx = (x2 - x1) / length;
            const dz = (z2 - z1) / length;
            const side = wall.thickness / 2 + 0.3;
            for (const opening of wall.openings || []) {
                const x = x1 + dx * opening.offset;
                const z = z1 + dz * opening.offset;
                const y0 = (wall.base_height ?? 0) + (opening.sill ?? 0);
                const height = opening.height ?? 2;
                const y = y0 + Math.min(1, height / 2);
                const rooms = [builder.roomAt(x - dz * side, y, z + dx * side)?.id ?? null, builder.roomAt(x + dz * side, y, z - dx * side)?.id ?? null];
                if (rooms[0] === null && rooms[1] === null) continue;
                const base = wall.base_height ?? 0;
                const entry = { id: opening.id ?? `${wall.id}:${opening.offset}`, rooms, x, z, dx, dz, half: opening.width / 2, along: opening.width / 2 + reach.along, across: wall.thickness / 2 + reach.across, y0: y0 - reach.up, y1: y0 + height + reach.up, wall0: base - reach.end, wall1: base + (wall.height ?? height + (opening.sill ?? 0)) + reach.end, found: new Map(), pieces: [] };
                const radius = Math.hypot(entry.along, entry.across);
                for (let cx = Math.floor(x - radius); cx <= Math.floor(x + radius); cx++) {
                    for (let cz = Math.floor(z - radius); cz <= Math.floor(z + radius); cz++) {
                        const cell = `${cx}|${cz}`;
                        if (!cells.has(cell)) cells.set(cell, []);
                        cells.get(cell).push(entry);
                    }
                }
                list.push(entry);
            }
        }
        // Every triangle that is no room's, against the openings of the square its first corner is in.
        let until = performance.now() + SLICE;
        for (const zone of ["outside", null]) {
            for (const range of builder.roomRanges(zone)) {
                const mesh = range.mesh;
                const base = this.baseOf(mesh);
                const whole = this.whole(mesh);
                if (mesh.userData.shadowCaster || mesh.userData.glow || !base || Array.isArray(base) || base.transparent || !whole) continue;
                const index = whole.array;
                const position = mesh.geometry.attributes.position;
                const matrix = mesh.matrixWorld;
                const plain = matrix.elements.every((value, k) => Math.abs(value - (k % 5 === 0 ? 1 : 0)) < 1e-9);
                const corner = (v) => (plain ? _at.fromBufferAttribute(position, v) : _at.fromBufferAttribute(position, v).applyMatrix4(matrix));
                // 1: within the opening; 2, 4: in the plane of one of its two sides — each its own bit — anywhere up the
                // wall: a wall's end there (an older bake's reveal is the whole end of the wall beside the opening, floor
                // to ceiling). A triangle is the opening's when its three corners share a bit: with one bit for both
                // sides, the panel over an opening and the one under a window — built from side to side, every corner
                // of theirs in one plane or the other — had their faces that are no room's, the façade above and below
                // every window, drawn live.
                const inside = (entry, v) => {
                    const at = corner(v);
                    if (at.y < entry.wall0 || at.y > entry.wall1) return 0;
                    const x = at.x - entry.x;
                    const z = at.z - entry.z;
                    const along = x * entry.dx + z * entry.dz;
                    if (Math.abs(along) > entry.along || Math.abs(z * entry.dx - x * entry.dz) > entry.across) return 0;
                    return (at.y >= entry.y0 && at.y <= entry.y1 ? 1 : 0) | (Math.abs(along - entry.half) <= reach.end ? 2 : 0) | (Math.abs(along + entry.half) <= reach.end ? 4 : 0);
                };
                for (const part of range.parts) {
                    const end = part.start + part.count;
                    for (let i = part.start; i < end; i += 3) {
                        if ((i - part.start) % 3000 === 0 && performance.now() > until) {
                            await this.renderer.nextFrame();
                            if (!alive()) return false;
                            until = performance.now() + SLICE;
                        }
                        const first = corner(index[i]);
                        const near = cells.get(`${Math.floor(first.x)}|${Math.floor(first.z)}`);
                        if (!near) continue;
                        for (const entry of near) {
                            if (!(inside(entry, index[i]) & inside(entry, index[i + 1]) & inside(entry, index[i + 2]))) continue;
                            const id = `${mesh.id}|${part.key}`;
                            if (!entry.found.has(id)) entry.found.set(id, { mesh, key: part.key, runs: [] });
                            const runs = entry.found.get(id).runs;
                            const last = runs[runs.length - 1];
                            if (last && last.start + last.count === i) last.count += 3;
                            else runs.push({ start: i, count: 3 });
                            break;
                        }
                    }
                }
            }
        }
        const byRoom = new Map();
        const kept = [];
        for (const entry of list) {
            if (!entry.found.size) continue;
            const opening = { id: entry.id, rooms: entry.rooms, pieces: [...entry.found.values()] };
            kept.push(opening);
            for (const room of entry.rooms) {
                if (room === null) continue;
                if (!byRoom.has(room)) byRoom.set(room, []);
                byRoom.get(room).push(opening);
            }
        }
        this.openings = { list: kept, byRoom };
        this.stats.openings = kept.length;
        return true;
    }

    /** The openings of these rooms' walls with something of their own to draw (frames), each once. */
    openingsOf(zones) {
        const found = new Set();
        for (const zone of zones) for (const opening of this.openings?.byRoom.get(zone) ?? []) found.add(opening);
        return found;
    }

    /**
     * What is drawn live of an opening two groups of rooms share — a door
     * between a hall and a bedroom: its casing, its threshold — made once
     * and kept: shown while either of the two is (arrange). Null where the
     * version has no material for any of it.
     */
    frameOf(opening) {
        let frame = this.shared.get(opening.id);
        if (frame !== undefined) return frame;
        const made = new Map();
        const out = new Map();
        for (const piece of opening.pieces) {
            const kind = this.bake?.kindOf(piece.mesh, piece.mesh.userData.zone ?? "outside") ?? null;
            const material = this.surfaceMaterial(piece.key, this.baseOf(piece.mesh), kind);
            if (!material) continue;
            const id = `${piece.mesh.id}|${material.id}`;
            if (!made.has(id)) made.set(id, { mesh: piece.mesh, material, key: piece.key, runs: [], count: 0, kind });
            const entry = made.get(id);
            if (!out.has(piece.mesh)) out.set(piece.mesh, []);
            for (const run of piece.runs) {
                entry.runs.push(run);
                entry.count += run.count;
                out.get(piece.mesh).push({ start: run.start, count: run.count });
            }
        }
        frame = null;
        if (made.size) {
            const group = new THREE.Group();
            group.name = `room-live:opening:${opening.id}`;
            for (const entry of made.values()) group.add(this.surface(entry));
            this.rig.group.add(group);
            this.rig.glow?.applyTo(group);
            frame = { id: opening.id, group, meshes: [...group.children], out, on: false };
        }
        this.shared.set(opening.id, frame);
        return frame;
    }

    /** A staged room's own surfaces let go (their vertices are the house's own, and stay; the index of each is its own, and goes). */
    drop(key) {
        const set = this.staged.get(key);
        if (!set || this.showing.has(key)) return;
        this.staged.delete(key);
        this.rig.group.remove(set.group);
        for (const mesh of set.meshes) this.scrapMesh(mesh);
    }

    /** A mesh of the room's own given up: its index is its own, and goes; its vertices are the house's, and stay. */
    scrapMesh(mesh) {
        const geometry = mesh.geometry;
        for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
        geometry.dispose();
    }

    /**
     * What is drawn brought in line with what is shown (`showing`): each
     * staged group's surfaces into the room's call or out of it, the
     * openings two groups share with whichever of them is shown, and the
     * bake's own drawing of all of it left out of the scene's call, or back
     * in it (cut). Nothing else: lights, movers and exposure are show's.
     */
    arrange() {
        const touched = new Set();
        for (const set of this.staged.values()) {
            const on = this.showing.has(set.key);
            if (set.on === on) continue;
            set.on = on;
            for (const mesh of set.meshes) mesh.layers.mask = on ? 1 << ROOM_LAYER : 0;
            for (const mesh of set.out.keys()) touched.add(mesh);
        }
        const wanted = new Set();
        for (const set of this.showing.values()) for (const frame of set.frames) wanted.add(frame);
        for (const frame of this.shared.values()) {
            if (!frame || frame.on === wanted.has(frame)) continue;
            frame.on = !frame.on;
            for (const mesh of frame.meshes) mesh.layers.mask = frame.on ? 1 << ROOM_LAYER : 0;
            for (const mesh of frame.out.keys()) touched.add(mesh);
        }
        for (const mesh of touched) this.cut(mesh);
    }

    /**
     * A mesh of the baked view drawn less what is drawn live of it now —
     * the runs of its triangles that are a shown room's, or a shown
     * opening's — by an index of its own that holds the rest (one draw, as
     * before, however many runs are left out: several rooms of one merged
     * mesh are shown at once, and a frame's triangles lie anywhere in it);
     * a mesh that is all drawn live, off every layer; one with nothing left
     * out, as it was. The index is kept from one cut to the next, and sent
     * again only when what it leaves out has changed.
     */
    cut(mesh) {
        const runs = [];
        for (const set of this.showing.values()) for (const run of set.out.get(mesh) ?? []) runs.push(run);
        for (const frame of this.shared.values()) if (frame?.on) for (const run of frame.out.get(mesh) ?? []) runs.push(run);
        const geometry = mesh.geometry;
        let was = this.split.get(mesh);
        if (!runs.length) {
            if (!was) return;
            geometry.setIndex(was.index);
            geometry.setDrawRange(0, Infinity);
            mesh.layers.mask = was.mask;
            this.split.delete(mesh);
            return;
        }
        if (!was) this.split.set(mesh, (was = { index: geometry.index, mask: mesh.layers.mask }));
        runs.sort((a, b) => a.start - b.start);
        const whole = was.index;
        const total = whole.count;
        let left = 0;
        for (const run of runs) left += run.count;
        if (left >= total) {
            mesh.layers.mask = 0;
            return;
        }
        mesh.layers.mask = was.mask;
        let part = this.parts.get(mesh);
        if (!part) {
            const attribute = new THREE.BufferAttribute(new whole.array.constructor(total), 1);
            attribute.setUsage(THREE.DynamicDrawUsage);
            this.parts.set(mesh, (part = { attribute, mark: "", count: 0 }));
        }
        const mark = runs.map((run) => `${run.start}+${run.count}`).join();
        if (part.mark !== mark) {
            const from = whole.array;
            const array = part.attribute.array;
            let at = 0;
            let next = 0;
            for (const run of runs) {
                if (run.start > next) {
                    array.set(from.subarray(next, run.start), at);
                    at += run.start - next;
                }
                next = Math.max(next, run.start + run.count);
            }
            if (next < total) {
                array.set(from.subarray(next, total), at);
                at += total - next;
            }
            part.mark = mark;
            part.count = at;
            part.attribute.clearUpdateRanges();
            part.attribute.addUpdateRange(0, at);
            part.attribute.needsUpdate = true;
        }
        geometry.setIndex(part.attribute);
        geometry.setDrawRange(0, part.count);
    }

    /** The shaders of everything shown built for its lamps in the call's light, or out of it, before they come in or go out (LampPool's `prepare`). */
    lamps(on) {
        if (!this.drawn || !this.showing.size) return Promise.resolve();
        const key = this.lightKey(on);
        const objects = [];
        // (What the room's own calls draw: its lamps light nothing else.)
        this.lit().traverse((mesh) => (mesh.layers.isEnabled(ROOM_LAYER) || mesh.layers.isEnabled(GLASS_LAYER)) && objects.push(mesh));
        for (const was of this.held.values()) if (was.veil) objects.push(...this.proxies([{ mesh: was.standIn ?? was.mesh, material: was.veil, veiled: true }]));
        // ...and the shadow passes' own, for the lights as they will then be — once for each way they stand.
        return this.construct(this.unbuilt(objects, key), key, on).then(() => {
            if (this.primed.has(key) || !this.drawn) return;
            this.primed.add(key);
            this.primeShadows(on);
        });
    }

    /**
     * What a room is built for: the lights its own call is drawn under —
     * its sun or none (the night), its lamps in the call's light or out of
     * it (LampPool), how many and how shadowed — and how the view is drawn
     * (the shadows' filter, through post-processing or not, the haze).
     * three builds a lit material's shader for exactly these.
     */
    lightKey(lamps) {
        const rig = this.rig;
        const pool = rig.pool.slots;
        const shadowed = pool.filter((slot) => slot.shadowed).length;
        const renderer = this.renderer;
        const fog = this.scene.fog;
        return [
            rig.sun.visible ? "sun" : "",
            rig.ambient ? "sky" : "",
            lamps ? `${shadowed}+${pool.length - shadowed}` : "",
            renderer.renderer.shadowMap.type,
            renderer.post && renderer.plainExposure === null ? "post" : "screen",
            fog?.isFogExp2 ? "fog2" : fog ? "fog" : "",
            this.scene.environment ? "env" : "",
        ].join("|");
    }

    /** A material as it is drawn by `object`, as text: what its shader was built for (built). */
    markOf(material, object) {
        return `${material.id}.${material.version}${object.isSkinnedMesh ? "s" : ""}|${Object.keys(object.geometry?.attributes ?? {}).join()}`;
    }

    /** Those of `objects` with a material whose shader has not been built for `key`'s lights. */
    unbuilt(objects, key) {
        const built = this.built.get(key);
        return objects.filter((object) => [].concat(object.material).some((material) => material && !built?.has(this.markOf(material, object))));
    }

    /**
     * Stand-ins to build shaders with (Renderer.build) for what plan says:
     * each the mesh itself — its geometry, its skeleton, its layers — with
     * the room's material in place of its own. (`around` puts that on the
     * mesh itself for as long as it is drawn ahead.)
     */
    proxies(entries) {
        const proxy = (entry) => Object.create(entry.mesh, { material: { value: entry.material, writable: true }, proxied: { value: entry } });
        // (What is seen through, with what it is drawn with for the ambient occlusion too: veilOf.)
        return entries.flatMap((entry) => (entry.veil ? [proxy(entry), proxy({ mesh: entry.mesh, material: entry.veil, veiled: true })] : [proxy(entry)]));
    }

    /**
     * The shaders of `objects` built for the room's lights — with its lamps
     * in the call's light (`lamps`) or out of it — and each drawn once, out
     * of sight (Renderer.build: a few a turn, one program new to the GPU a
     * frame). Remembered by material (built).
     */
    async construct(objects, key, lamps, eye = this.rig.eye) {
        if (!objects.length) return;
        // (A pane of glass is here twice, once for each of the two materials it is drawn with — plan's `veil`: the second
        // in a turn of its own, since a mesh is drawn ahead with one material at a time.)
        const veiled = objects.filter((object) => object.proxied?.veiled);
        if (veiled.length && veiled.length < objects.length) {
            await this.construct(objects.filter((object) => !object.proxied?.veiled), key, lamps, eye);
            return this.construct(veiled, key, lamps, eye);
        }
        const rig = this.rig;
        // (Through any camera but the room's own — what is seen through, which the scene's call draws — the room's lamps are no part of it.)
        const pool = eye === rig.eye ? rig.pool.slots.map((slot) => slot.light) : [];
        const shown = rig.pool.lit;
        const around = (batch, on) => {
            // (Put back in the order opposite to the one they were put on in: a pane of glass is here twice, once for each of the two materials it is drawn with — plan's `veil`.)
            for (const object of on ? batch : [...batch].reverse()) {
                const entry = object.proxied;
                // Drawn ahead wherever it is — behind the visitor too: left out of the picture, its program's pipeline
                // would be made at the first turn of the head.
                const drawn = entry?.mesh ?? object;
                if (on) {
                    drawn.userData.culled = drawn.frustumCulled;
                    drawn.frustumCulled = false;
                } else if (drawn.userData.culled !== undefined) {
                    drawn.frustumCulled = drawn.userData.culled;
                    delete drawn.userData.culled;
                }
                if (!entry) continue;
                const { mesh } = entry;
                if (on) {
                    entry.kept = { material: mesh.material, hidden: [] };
                    mesh.material = entry.material;
                    // (A figure that is not drawn — the visitor's own, seen through its eyes — is, for this.)
                    for (let node = mesh; node; node = node.parent) {
                        if (node.visible) continue;
                        node.visible = true;
                        entry.kept.hidden.push(node);
                    }
                } else if (entry.kept) {
                    mesh.material = entry.kept.material;
                    for (const node of entry.kept.hidden) node.visible = false;
                    entry.kept = null;
                }
            }
        };
        const marks = objects.map((object) => [].concat(object.material).filter(Boolean).map((material) => this.markOf(material, object)));
        const result = await this.renderer.build(objects, lamps && !shown ? pool : [], eye, around, 3, true, !lamps && shown ? pool : []);
        if (!this.built.has(key)) this.built.set(key, new Set());
        const built = this.built.get(key);
        for (const list of marks) for (const mark of list) built.add(mark);
        this.stats.built += result?.programs ?? 0;
    }

    /**
     * The textures the materials of `objects` draw with, sent to the GPU
     * before their first frame: one a turn, a turn a frame — the room's own
     * relief and gloss maps, which the bake's drawing of it never needed,
     * were seventy of them in its first frame.
     */
    async upload(objects, alive) {
        const renderer = this.renderer.renderer;
        const properties = renderer.properties;
        const seen = new Set();
        for (const object of objects) {
            for (const material of [].concat(object.material)) {
                if (!material) continue;
                for (const name of MAPS) {
                    const texture = material[name];
                    if (!texture?.isTexture || seen.has(texture) || texture.isRenderTargetTexture || texture.isCubeTexture) continue;
                    seen.add(texture);
                    // (One of the bake's own is sent as it loads, its picture closed after: Utils/bakedTexture.js.)
                    if (properties.get(texture).__webglTexture !== undefined || !texture.image || texture.userData?.size) continue;
                    renderer.initTexture(texture);
                    this.stats.sent++;
                    await this.renderer.nextFrame();
                    if (!alive()) return;
                }
            }
        }
    }

    /**
     * These rooms made ready to be shown: staged (build), what moves in
     * them planned, their textures sent, their shaders built for the lights
     * they will be drawn under and drawn once, the sun's shadow map and the
     * room probe drawn — each a little a frame, so that the frame that
     * shows them (show) makes nothing. Resolves to the staged rooms, or to
     * null: nothing there to draw, or another was asked for meanwhile
     * (cancel).
     *
     * A view has one sun's map and one room probe, whichever of its rooms
     * are shown. Where none is shown yet they are drawn here, for the rooms
     * that will be shown first, all together: `beside`, the groups staged
     * already that are to be shown with these — drawn with them in the
     * map and in each face of the probe; `first: false` for those, which
     * are made ready before the one their visitor is in and leave both to
     * it. Beside rooms that are shown, neither: the map is fitted over
     * these too from now (sunZones), and the probe is taken again with
     * them in it once they are shown (show).
     *
     * @param {string[]} zones  the rooms' ids
     * @param {object} room  the one the visitor is in, of the spec's
     * @param {{ beside?: object[], first?: boolean }} [options]
     */
    async prepare(zones, room, { beside = [], first = true } = {}) {
        this.cancel();
        const job = (this.job = { key: zones.join(), ready: false, set: null, at: "rig" });
        const alive = () => this.job === job && !this.disposed;
        try {
            if (!this.rig) await this.ready();
            if (!alive()) return null;
            const rig = this.rig;
            if (this.bake) {
                // In the bake's light: its lightmap ready for the time of day before any shader is built — they read it.
                job.at = "light";
                if (!(await this.bake.ready(this.world.houseLighting ?? "day")) || !alive()) return null;
            } else if ((this.world.houseLighting ?? "day") === "night") {
                // At night, what the bake's lightmap holds in each room in before any is drawn (measure: read once a night) —
                // waited for a few seconds at most: later, it comes in as a lamp next door does.
                job.at = "measure";
                await Promise.race([this.lightFiguresIn("night"), new Promise((resolve) => setTimeout(resolve, MEASURE_WAIT))]);
                if (!alive()) return null;
            }
            // (What stands in the walls' openings, found once for the whole house.)
            job.at = "frames";
            if (!this.openings) {
                // (Once begun it runs to its end, whoever asked and whatever became of them: begun again at every room
                // asked for and let go, it started from nothing each time.)
                this.finding ??= this.frames(() => !this.disposed).finally(() => (this.finding = null));
                if (!(await this.finding) || !alive()) return null;
            }
            const set = this.build(zones);
            if (!set) return null;
            job.set = set;
            // The time of day, as its lights have it: what the shaders are built for.
            this.lightRig();
            this.syncSwitches();
            rig.glow?.update(Infinity);
            // In the bake's light, these rooms' part of its lightmap and their thin faces' light, as they stand — and what
            // stands in their walls' openings, which is no room's ("outside").
            if (this.bake) {
                this.bake.track([...zones, "outside", null]);
                if (!this.drawn) this.bake.snap();
                this.bake.update(0);
                this.bake.flush(true);
            }
            for (let pass = 0; pass < 4; pass++) {
                // (Again if the lights changed as it was built: another time of day, another step of the slider.)
                const { fixed, moving } = this.movers(zones);
                const entries = [...fixed, ...moving].flatMap((root) => this.plan(root));
                // (What is seen through with the rest: the room's second call is drawn under the same lights.)
                const objects = [...this.meshesOf(set), ...this.proxies(entries)];
                // Lit as the unbaked view lights them — the sky's share, the room's glow — before their shaders are built.
                this.shareOut({ traverse: (visit) => objects.forEach(visit) }, { indoorMaterials: new Set(), reflectiveMaterials: new Set(), probe: null });
                // (A finish is one material for the whole house: what the rooms shown now draw with too keeps their probe's light.)
                this.relit();
                rig.glow?.applyTo({ traverse: (visit) => objects.forEach(visit) });
                job.at = "textures";
                await this.upload(objects, alive);
                if (!alive()) return null;
                job.at = "shaders";
                // For its lamps as they will stand — and, where one that is lit may come into sight (a door opened, the
                // next room of the same space), for them in the call's light too: built now, while it is still coming,
                // not in the frames after it is shown.
                const lamps = this.lampsFor(room);
                const states = lamps || !zones.some((zone) => rig.pool.wouldLight(zone, true)) ? [lamps] : [false, true];
                for (const state of states) {
                    const key = this.lightKey(state);
                    await this.construct(this.unbuilt(objects, key), key, state);
                    if (!alive()) return null;
                }
                this.lightRig();
                set.lamps = this.lampsFor(room);
                if (!this.unbuilt(objects, this.lightKey(set.lamps)).length) break;
            }
            if (first) {
                const sets = [set, ...beside.filter((other) => other !== set && this.staged.get(other.key) === other)];
                // (The lamps as the frame that shows these will have them — for the shadows and the probe drawn now,
                // which a lamp of the last rooms shown, still lit where it hung, would be in — and, in the bake's light, the
                // switches' light with them.)
                if (!this.drawn) {
                    this.lampsIn(set);
                    this.bake?.update(0);
                    this.bake?.flush(true);
                }
                job.at = "surroundings";
                await this.surround(alive);
                if (!alive()) return null;
                job.at = "shadows";
                await this.shade(sets, alive);
                if (!alive()) return null;
                job.at = "probe";
                await this.capture(sets, room, alive);
                if (!alive()) return null;
            }
            job.ready = true;
            job.at = "ready";
            return set;
        } finally {
            if (this.job === job && !job.ready) this.job = null;
        }
    }

    /**
     * What the view has not drawn yet (undrawn) made ready as the rooms'
     * own materials are — its textures sent, its shaders built and drawn
     * once, one of each kind — where a room probe is to be taken: the probe
     * looks every way, and what it cannot draw without stopping it leaves
     * out; a living room's, taken at the first look, was ten levels darker
     * than the unbaked view's for the terrace it did not see. No further
     * than SURROUND from the visitor: a figure two villas away is a texel
     * of a face, and stays left out until the view itself has drawn it.
     */
    async surround(alive) {
        const sky = this.world.sky?.current ? this.world.sky : null;
        if (!sky || !QUALITY.probe) return;
        const eye = this.experience.camera.activeCamera.position;
        const near = (object) => {
            const sphere = object.isInstancedMesh ? null : object.geometry?.boundingSphere;
            // (Spread over the site, or not measured: taken as near.)
            if (!sphere) return true;
            return _at.copy(sphere.center).applyMatrix4(object.matrixWorld).distanceTo(eye) < SURROUND + sphere.radius * object.matrixWorld.getMaxScaleOnAxis();
        };
        const kinds = new Map();
        for (const object of this.undrawn()) {
            if (!near(object)) continue;
            const kind = `${[].concat(object.material).map((material) => material?.id).join()}|${object.isSkinnedMesh ? "s" : ""}${object.isInstancedMesh ? "i" : ""}`;
            if (!kinds.has(kind)) kinds.set(kind, object);
        }
        const objects = [...kinds.values()];
        if (!objects.length) return;
        await this.upload(objects, alive);
        if (!alive()) return;
        await this.construct(objects, "scene", false, this.experience.camera.activeCamera);
    }

    /** Whatever is being made ready, dropped (what it has built stays built). */
    cancel() {
        const job = this.job;
        this.job = null;
        if (job?.probe && job.probe !== this.rig?.probe) job.probe.dispose();
    }

    /**
     * Whether the room's lamps will be in its call's light as `room` is
     * first shown: they are now, beside rooms that are shown, or one lit
     * there would be in sight. With no room shown the pool lights nothing,
     * and whether it is in the light is only how the last rooms shown left
     * it — nothing hands the lamps round meanwhile (update): it does not
     * count.
     */
    lampsFor(room) {
        const pool = this.rig.pool;
        return (Boolean(this.drawn) && pool.lit) || pool.wouldLight(room?.id ?? null);
    }

    /**
     * The pool of lamps as rooms shown where none was will have it (show),
     * `set` being their visitor's own: in the call's light if its shaders
     * were built with the lamps in — then handed round from where the
     * visitor is and lit at once — and out of it if not, whatever the last
     * rooms shown left. Left in, with nothing lit in sight: a bathroom's
     * lamp behind its shut door was handed a light and lit at full strength
     * as the living room beside it was first shown — come into from out of
     * doors, with a lamp seen in the flat before — and though no wall lets
     * it through, a window's pane takes no shadow: its glint in the pane,
     * in the room probe, lit the whole room half as bright again (48
     * levels), until its visitor had walked on.
     */
    lampsIn(set) {
        const pool = this.rig.pool;
        if (!set.lamps && pool.lit) pool.leave();
        pool.key = null;
        pool.snap(Boolean(set.lamps));
    }

    /**
     * The sun's shadow map drawn over the rooms about to be shown, before
     * the frame that shows them — the first time, seven hundred stand-ins
     * are given their buffers by it — while no room is shown (one that is
     * has the map, fitted to itself, until the frame the other takes over).
     */
    async shade(sets, alive) {
        const rig = this.rig;
        const camera = this.experience.camera.activeCamera;
        if (this.drawn || !camera?.isPerspectiveCamera) return;
        const lamps = Boolean(sets[0].lamps);
        if (!rig.sun.visible && !lamps) return;
        if (rig.sun.visible) {
            this.fitSun(camera, this.sunBox(sets.flatMap((set) => set.zones)));
            rig.sun.shadow.needsUpdate = true;
        }
        await this.renderer.nextFrame();
        if (!alive() || this.drawn) return;
        this.primeShadows(lamps);
    }

    /**
     * The shadow maps of the room's lights drawn out of sight, under the
     * lights its call will have — its lamps in the call's light (`lamps`)
     * or out of it — so that the shadow passes' own shaders are built for
     * them before a frame of the view needs them. three builds a shadow
     * pass's shader for the lights of the call it is drawn in, as the LAST
     * render of that call left them (it sets a call's lights up after its
     * shadow pass): the map drawn ahead in the first call the room ever
     * made was drawn under no lights at all, and the frame that first
     * showed the room built the three shaders again for its sun — 105 to
     * 110 ms of that frame; and the first lamp to come into the call's
     * light did the same a frame later. So the call is made twice here:
     * once with no map due, which leaves its lights as they will be, and
     * once with every map due — and everything that casts drawn into it,
     * in the map's reach or not (roomCall's `priming`): a kind of caster
     * first met when the map was fitted over the next room was a shader
     * built in that frame (120 ms).
     */
    primeShadows(lamps) {
        const rig = this.rig;
        const camera = this.experience.camera.activeCamera;
        if (!camera?.isPerspectiveCamera) return;
        const lights = rig.pool.slots.map((slot) => slot.light);
        const shone = lights.map((light) => light.visible);
        const casting = [rig.sun, ...lights].filter((light) => light.castShadow && light.shadow);
        const due = casting.map((light) => light.shadow.needsUpdate);
        for (const light of lights) light.visible = Boolean(lamps);
        try {
            for (const light of casting) light.shadow.needsUpdate = false;
            this.aside((renderer) => this.roomCall(renderer, this.sight(camera)));
            for (const light of casting) light.shadow.needsUpdate = light.visible;
            this.priming = true;
            this.aside((renderer) => this.roomCall(renderer, this.sight(camera)));
        } finally {
            this.priming = false;
            lights.forEach((light, k) => (light.visible = shone[k]));
            // (Whatever was due is due still: a lamp's map drawn here was drawn from where it hung then.)
            casting.forEach((light, k) => (light.shadow.needsUpdate = due[k] || light.shadow.needsUpdate));
        }
    }

    /** Something drawn out of sight, into a picture of a few pixels, with everything of the renderer's as it was after. */
    aside(draw) {
        const renderer = this.renderer.renderer;
        this.scrap ??= new THREE.WebGLRenderTarget(4, 4);
        const target = renderer.getRenderTarget();
        renderer.setRenderTarget(this.scrap);
        try {
            // (A call of the room's works no matrix out — standIn: outside a frame of the view they are worked out here.)
            this.scene.updateMatrixWorld();
            draw(renderer);
        } finally {
            renderer.setRenderTarget(target);
        }
    }

    /**
     * The room probe of the rooms about to be shown (Realism's RoomProbe),
     * where none is shown yet — a face a frame, ahead of the frame that
     * shows them: each face drawn with them in the room's call for its
     * length (drawBoth).
     */
    async capture(sets, room, alive) {
        const set = sets[0];
        const sky = this.world.sky?.current ? this.world.sky : null;
        // (Beside rooms that are shown, theirs is the probe — one for the view, as a view lit live has one — and is
        // taken again with these in it once they are shown: show.)
        if (!sky || !QUALITY.probe || this.drawn) return;
        const job = this.job;
        const probe = new RoomProbe(this.experience, { paced: true, pmrem: this.rig.pmrem, sky: { useProbe: (texture, indoor) => (set.probe = texture ? { texture: probed(texture), indoor } : null) }, draw: (renderer, eye) => this.drawBoth(renderer, eye, sets) });
        job.probe = probe;
        // (The doors' leaves and the glass that go with these rooms: drawn as they will be for the length of each face.)
        job.fixed = this.movers(sets.flatMap((each) => each.zones)).fixed;
        set.probe = null;
        for (let frames = 0; frames < 240 && probe.face !== 7; frames++) {
            const camera = this.experience.camera.activeCamera;
            if (camera.isPerspectiveCamera) {
                // What the probe sees of the rooms next door, brought up as the frame will have them — for the length
                // of the face: left raised with no room shown, the next frame lit whoever stands indoors by it.
                const builder = this.builder;
                const gain = builder.indoorGain?.value ?? 1;
                builder.setIndoorGain(this.drawn?.gain ?? this.gainFor(room));
                try {
                    probe.update(camera, room, { variant: sky.variant, version: sky.version, lightVersion: this.lightVersion });
                } finally {
                    builder.setIndoorGain(gain);
                }
                this.stats.faces++;
            }
            await this.renderer.nextFrame();
            if (!alive()) return;
        }
    }

    /**
     * Whether the rooms shown are still drawn under lights their shaders
     * were built for (lightKey): not after the time of day has changed the
     * sun for none, or the slider the lamps or the shadows' filter — then
     * they are made ready again before they are shown again (RoomLight).
     */
    get fresh() {
        if (!this.drawn || !this.showing.size) return true;
        // Another time of day: back to the bake in the frame the house turns (World.houseLighting), with the rooms
        // round it — the sky and the sun follow some frames on, and until they have the room's own would be the
        // day's under the night's exposure.
        const lighting = this.world.houseLighting ?? "day";
        for (const set of this.showing.values()) if (set.shownAt !== lighting) return false;
        this.lightRig();
        const key = this.lightKey(this.rig.pool.lit);
        for (const set of this.showing.values()) {
            if (key === set.shownFor) continue;
            // (Its own surfaces: what moves in it has its shaders built as it is taken up, and with the lamps before they
            // come in or go out — lamps; one caught between the two is built as it is drawn, which is a long frame, where
            // giving the whole room back to its bake for it would be a room gone and come again.)
            if (this.unbuilt(this.meshesOf(set), key).length) return false;
            set.shownFor = key;
        }
        return true;
    }

    /** Whether the time of day is on its way to another — the house lit for the next, the sky and the sun still to follow (World.drawLighting): nothing is made ready until they have. */
    get turning() {
        return this.world.houseLighting !== this.world.lighting;
    }

    /**
     * Whether staged rooms, made ready, would now be shown under lights
     * their shaders were not built for: a switch turned, the lamps come in
     * or the time of day changed while they waited for their visitor. They
     * are then made ready again first (RoomLight) — the few shaders
     * missing — rather than built in the frame that shows them.
     */
    stale(set) {
        const rig = this.rig;
        if (!rig || !set) return true;
        this.lightRig();
        if (this.staged.get(set.key) !== set) return true;
        // (Beside rooms shown, under the lamps as they are; with none shown, as these were made ready for: lampsIn.)
        return this.unbuilt(this.meshesOf(set), this.lightKey(this.drawn ? rig.pool.lit : Boolean(set.lamps))).length > 0;
    }

    /**
     * These staged groups of rooms shown, and no others, from the next
     * frame on (each after prepare): the one their visitor is in, and those
     * seen from it (RoomLight) — their surfaces let into the room's call
     * and the bake's left out of the scene's, what moves in them drawn as
     * they are, the lights as the time of day and the switches stand; and
     * whichever was shown and is not among them given back, in the same
     * frame. A group that was shown already is left exactly as it is: a
     * room added beside it, or taken away, changes nothing of it — so a
     * visitor who walks from one shown room into another sees nothing
     * change at all.
     *
     * Where none was shown before, the lamps come at their full strength
     * at once, their shadows drawn in that frame, and the room's probe is
     * the one taken as it was made ready; a group added to others comes
     * under the lights there are (its lamps are let into the call's light
     * as a view lit live lets them in, LampPool), and the probe is taken
     * again a face a frame with it in.
     *
     * @param {object[]} sets  what prepare resolved to, each still staged
     * @param {object} room  the room the visitor is in, of the spec's
     * @returns {boolean} whether anything is shown
     */
    show(sets, room) {
        const rig = this.rig;
        sets = (Array.isArray(sets) ? sets : [sets]).filter((set) => set && this.staged.get(set.key) === set);
        if (!rig || !sets.length) return false;
        const before = this.drawn;
        const wanted = new Set(sets);
        const added = sets.filter((set) => !this.showing.has(set.key));
        let removed = 0;
        for (const [key, set] of [...this.showing]) {
            if (wanted.has(set)) continue;
            this.showing.delete(key);
            removed++;
        }
        if (this.room !== room) {
            this.room = room;
            if (before && !added.length && !removed) this.expose();
        }
        if (before && !added.length && !removed) return true;
        const lighting = this.world.houseLighting ?? "day";
        for (const set of added) {
            this.showing.set(set.key, set);
            set.shownAt = lighting;
        }
        this.arrange();
        // (In the bake's light the lamps' shadows are of what is drawn live: drawn again with these in or out — lampCasters.)
        if (this.bake && before) rig.pool.redrawAll();
        if (!before) this.aimed = null;
        const zones = new Set();
        for (const set of this.showing.values()) for (const zone of set.zones) zones.add(zone);
        this.drawn = { zones, gain: before?.gain ?? 1, adaptation: before?.adaptation ?? 1, ...(before?.wanted !== undefined && { wanted: before.wanted }), ...(before?.light && { light: before.light }) };
        this.count();
        this.stats.shown += added.length;

        // What moves there, and the rooms' glass, with their own materials too — and what was of a room no longer shown, given back.
        const all = [...zones];
        const { fixed, moving, sheers } = this.movers(all);
        this.sheers = sheers;
        // (The view's own lights, as its call gathers them, looked for again: sheerCall.)
        this.viewLights = null;
        const stay = new Set(fixed);
        for (const root of this.moving()) if ((this.roots.has(root) || shown(root)) && this.within(root, all)) stay.add(root);
        for (const root of [...this.roots.keys()]) if (!stay.has(root)) this.giveBack(root);
        for (const root of [...fixed, ...moving]) if (!this.roots.has(root)) this.apply(root, this.plan(root));
        for (const root of moving) this.roaming.add(root);
        this.follow();
        // Lit as the unbaked view lights them: the fittings' glass by their switches, the lit rooms' glow, the sky's share —
        // or by their bake's light (RoomBakeLight), as it stands, at once where no room was shown.
        this.syncSwitches();
        if (rig.glow) {
            rig.glow.applyTo(this.lit());
            rig.glow.outsideRoom = this.room?.id ?? null;
            rig.glow.update(Infinity);
        }
        if (this.bake) {
            this.bake.track(zones);
            if (!before) {
                this.bake.snap();
                this.lightStood = false;
            }
        }
        this.litFor = "";
        // Its own probe, taken as the first of them was made ready.
        const job = this.job?.ready && added.includes(this.job.set) ? this.job : null;
        if (!before && job?.probe && job.probe !== rig.probe) {
            const next = job.probe;
            const taken = job.set.probe;
            rig.probe?.dispose();
            rig.probe = next;
            next.sky = { useProbe: (texture, indoor) => this.useProbe(texture, indoor) };
            next.draw = (renderer, eye) => this.drawBoth(renderer, eye);
            this.sets.probe = taken;
            job.probe = null;
        } else if (!before) this.sets.probe = null;
        if (job) this.cancel();
        for (const set of added) set.probe = null;
        this.relight();
        // Its lamps: in its call's light if its shaders were built with them in — then at once, at full strength — and out of it if not (lampsIn).
        if (!before) {
            this.lampsIn(sets[0]);
            rig.fit.dirty = true;
            rig.sun.shadow.needsUpdate = true;
        }
        // (In the bake's light, the switches' light as the lamps now stand, drawn before the frame: draw.)
        this.bake?.update(0);
        const key = this.lightKey(rig.pool.lit);
        for (const set of added) set.shownFor = key;
        // The probe was taken before these were shown — the first as it was staged, the others not in it at all: taken
        // again as they now stand, a face a frame, once the lamps and the glow have settled (update).
        this.probeStale = true;
        this.expose(!before);
        this.hook();
        return true;
    }

    /** How much is drawn live now, for whoever asks (stats). */
    count() {
        const meshes = this.surfaces();
        this.stats.groups = this.showing.size;
        this.stats.meshes = meshes.length;
        this.stats.triangles = meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
        this.stats.materials = new Set(meshes.map((mesh) => mesh.material)).size;
    }

    /** The rooms shown back as their bake draws them, and what moves in them (what was staged stays staged). */
    conceal() {
        if (!this.showing.size) return;
        this.showing.clear();
        this.sheers = [];
        this.arrange();
        for (const root of [...this.roots.keys()]) this.giveBack(root);
        this.roaming.clear();
        this.sets.indoorMaterials.clear();
        this.sets.reflectiveMaterials.clear();
        this.count();
    }

    /** The rooms back as their bake draws them: every mesh as it was. */
    hide() {
        if (!this.drawn) return;
        this.drawn = null;
        this.room = null;
        this.aimed = null;
        // (Where its lamps were handed round from: the next room shown starts from where its visitor is then.)
        this.whereWas = null;
        this.unhook();
        this.conceal();
        // How far the baked rooms were brought up for it (expose's `gain`), put back now and not by the next frame's
        // exposure (Realism.updateBaked): what moves in them takes its light before that (World.update: ProbeLight
        // after RoomLight) and was lit by the gain it found — the one frame after the live room is switched off drew a
        // door's leaf several times too bright, and that frame is the one the light meter reads for the room: the
        // baked picture was then exposed a hundredth lower for as long as its visitor stood there.
        this.builder.setIndoorGain(1);
    }

    /**
     * What is held while no room is shown that is worth giving back, once
     * it is switched off: the shadow maps, the room probe and the picture
     * its faces are drawn through, and the rooms staged. The lights, the
     * casters and the materials stay — made again, every shader would be
     * built again — and so do the shaders, and the textures sent for it (a
     * room's own are few — four in a living room — and one of the view's,
     * sent early, cannot be told from one the bake still needs: a baked
     * texture given back is gone, its picture closed once it was sent).
     */
    release() {
        const rig = this.rig;
        this.cancel();
        if (!rig || this.drawn) return;
        for (const light of [rig.sun, ...rig.pool.slots.map((slot) => slot.light)]) {
            light.shadow?.map?.dispose();
            if (light.shadow) light.shadow.map = null;
        }
        rig.pool.leave();
        rig.fit.dirty = true;
        rig.probe?.dispose();
        rig.probe = null;
        this.sets.probe = null;
        for (const key of [...this.staged.keys()]) this.drop(key);
        // ...and what was made of the openings two groups share. (The indices the bake's meshes were drawn by meanwhile
        // are kept — `parts`: let go here, their buffers were never given back, and the next switching-on made them all again.)
        for (const frame of this.shared.values()) {
            if (!frame) continue;
            rig.group.remove(frame.group);
            for (const mesh of frame.meshes) this.scrapMesh(mesh);
        }
        this.shared.clear();
        this.scrap?.dispose();
        this.scrap = null;
        this.faced?.dispose();
        this.faced = null;
        this.boxed = null;
        this.bake?.release();
        this.dropLampCasters();
    }

    /** The graphics gave up: nothing built is built any more. */
    forget() {
        this.built.clear();
        this.primed.clear();
        this.parts.clear();
    }

    /**
     * Each of its switches as the baked view's stands: on or off, by day
     * or at night. But in a space without a sky of its own, whose rooms a
     * view lit live has always drawn with their lights on by day
     * (LiveSwitches' `dayOn`: nothing else lights them there) where its
     * bake, which holds the day's light, starts them off: there a switch
     * its visitor has not turned stands as the view lit live starts it —
     * the editor's picture of the room — and one they have, as they left it.
     */
    syncSwitches() {
        const { switches } = this.rig;
        const baked = this.world.switches;
        const variant = this.world.houseLighting ?? "day";
        if (!switches.states.has(variant)) switches.states.set(variant, new Map());
        const state = switches.states.get(variant);
        const turned = switches.dayOn && baked?.variant === variant ? this.turnedIn(variant) : null;
        let changed = switches.variant !== variant;
        for (const item of switches.list) {
            const on = turned && !turned.has(item.id) ? switches.startsOn(variant, item) : Boolean(baked?.isOn(item.id));
            if (state.get(item.id) !== on) changed = true;
            state.set(item.id, on);
        }
        if (!changed) return;
        switches.variant = variant;
        switches.apply();
    }

    /**
     * The baked view's switches their visitor has turned by hand in a time
     * of day, since it began (syncSwitches): each that does not stand as it
     * started, or has been seen to change. Asked whenever one changes, from
     * the view's first light on.
     *
     * @returns {Set<string>} their ids
     */
    turnedIn(variant) {
        const baked = this.world.switches;
        if (!baked || !variant || baked.variant !== variant) return this.turned.get(variant)?.ids ?? new Set();
        if (!this.turned.has(variant)) this.turned.set(variant, { ids: new Set(), last: new Map(baked.list.map((item) => [item.id, baked.startsOn(variant, item)])) });
        const { ids, last } = this.turned.get(variant);
        for (const item of baked.list) {
            const on = baked.isOn(item.id);
            if (last.get(item.id) !== on) ids.add(item.id);
            last.set(item.id, on);
        }
        return ids;
    }

    /**
     * The time of day, as a view lit live sets it, on the room's own lights
     * — under a site's own sky (Sky.setVariant: the sun's colour, strength
     * and place) or without one (Environment's preset: its sun, its sky's
     * two lights) — whenever it has changed: what its shaders are built
     * for, shown or not.
     */
    lightRig() {
        const world = this.world;
        const rig = this.rig;
        const sky = world.sky?.current ? world.sky : null;
        const variant = sky ? sky.variant : world.houseLighting ?? "day";
        const key = `${variant}|${world.houseLighting}|${QUALITY.shadow.size}`;
        if (key === this.rigFor) return;
        this.rigFor = key;
        const { sun } = rig;
        // In the bake's light, the sun (or the moon) the bake was lit by: its colour, its strength, where it stands.
        const baked = this.bake ? this.published.lighting?.variants?.[world.houseLighting ?? "day"]?.sun : null;
        if (sky) {
            const settings = SKY_VARIANTS[variant] || SKY_VARIANTS.day;
            sun.color.set(settings.sunColour);
            sun.intensity = settings.sun;
            sun.visible = settings.sun > 0;
            sky.placeSun(sun, rig.fit);
            if (baked) {
                sun.color.setRGB(...baked.color);
                sun.intensity = baked.strength;
                sun.visible = baked.strength > 0;
                sun.position.set(...baked.position).normalize().multiplyScalar(sun.position.length());
            }
        } else if (baked) {
            rig.sunFrom = new THREE.Vector3(...baked.position).normalize().multiplyScalar(new THREE.Vector3(...world.environment.preset.sun.position).length());
            this.plainFit = null;
            sun.color.setRGB(...baked.color);
            sun.intensity = baked.strength;
            sun.visible = baked.strength > 0;
        } else {
            const environment = world.environment;
            const night = variant === "night";
            const preset = night ? PLAIN_NIGHT : environment.preset;
            sun.color.set(preset.sun.color);
            sun.intensity = preset.sun.intensity;
            // (Where it shines from; its map is fitted over the rooms shown, as under a sky of its own: fitSun.)
            rig.sunFrom = new THREE.Vector3(...preset.sun.position);
            this.plainFit = null;
            sun.visible = true;
            rig.ambient.color.set(environment.preset.ambient.color);
            rig.ambient.intensity = night ? 0 : environment.preset.ambient.intensity;
            rig.hemisphere.color.set(preset.hemi.sky);
            rig.hemisphere.groundColor.set(preset.hemi.ground);
            rig.hemisphere.intensity = night ? LIVE_NIGHT_SKY : preset.hemi.intensity;
        }
        sun.shadow.needsUpdate = true;
    }

    /**
     * The sun's shadow map fitted over `box` (sunBox) — the rooms shown —
     * and sized for it, under a site's own sky (Realism's SunFit, which
     * fits the unbaked view's there) and without one alike. Without one a
     * view lit live draws one map over the whole footprint, 4096 a side on
     * a large plot (Environment.fitShadows): for a room that was 144 MB
     * where Ladonia's is 1024 a side. So there the map is the same square
     * over the rooms alone, of the texels a side that give it the unbaked
     * view's own texel or finer (sunBox's `mapSize`), looked down from as
     * far off and through the same depth, so that its offsets are the same
     * few centimetres: the same shadows, from a map a sixteenth the size.
     */
    fitSun(camera, box) {
        const rig = this.rig;
        const sun = rig.sun;
        if (this.world.sky?.current) {
            if (QUALITY.shadow.fit) rig.fit.update(rig.fitted, camera, QUALITY, this.renderer.realism.roomOf(camera), null, box);
            return;
        }
        if (!rig.sunFrom || this.plainFit === box.key) return;
        this.plainFit = box.key;
        const far = rig.sunFrom.length();
        _dir.copy(rig.sunFrom).normalize();
        _up.set(0, 1, 0);
        if (Math.abs(_dir.y) > 0.99) _up.set(0, 0, 1);
        _right.crossVectors(_up, _dir).normalize();
        _up.crossVectors(_dir, _right).normalize();
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const corner of box.corners) {
            const x = corner.dot(_right);
            const y = corner.dot(_up);
            const z = corner.dot(_dir);
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            z0 = Math.min(z0, z);
            z1 = Math.max(z1, z);
        }
        // A square a little bigger than the rooms, its middle on a texel.
        const size = Math.max(x1 - x0, y1 - y0, 4) * 1.06;
        const mapSize = box.mapSize(size);
        const texel = size / mapSize;
        const cx = Math.round((x0 + x1) / 2 / texel) * texel;
        const cy = Math.round((y0 + y1) / 2 / texel) * texel;
        sun.target.position.set(0, 0, 0).addScaledVector(_right, cx).addScaledVector(_up, cy).addScaledVector(_dir, (z0 + z1) / 2);
        sun.position.copy(sun.target.position).addScaledVector(_dir, far);
        sun.updateMatrixWorld();
        sun.target.updateMatrixWorld();
        const shadow = sun.shadow;
        shadow.camera.left = shadow.camera.bottom = -size / 2;
        shadow.camera.right = shadow.camera.top = size / 2;
        shadow.camera.updateProjectionMatrix();
        if (shadow.mapSize.x !== mapSize) {
            shadow.mapSize.set(mapSize, mapSize);
            shadow.map?.dispose();
            shadow.map = null;
        }
        // (Its edge as soft as the whole footprint's map has it: so many of these texels as make one of that one's.)
        shadow.radius = Math.max(1, box.texel / texel);
        shadow.needsUpdate = true;
    }

    /**
     * The sky's light shared out among the materials of everything under
     * `root`, as a view lit live shares it (Sky.share: sorted into `into`'s
     * two sets) — or, without a sky of its own, what metals and glass
     * reflect as strongly as the time of day has it (Environment.setVariant).
     */
    shareOut(root, into) {
        const world = this.world;
        const sky = world.sky?.current ? world.sky : null;
        if (sky) {
            sky.share(root, into);
            sky.glaze(into);
            // (In the bake's light, what reflects its own studio as the time of day dims it, for when it is not the
            // probe's: probeOn.)
            if (this.bake) for (const material of into.reflectiveMaterials) material.userData.roomBakeDimmed = material.envMapIntensity;
            return;
        }
        const preset = (world.houseLighting ?? "day") === "night" ? PLAIN_NIGHT : world.environment.preset;
        const reflections = preset.reflections ?? 1;
        root.traverse((mesh) => {
            for (const material of [].concat(mesh.material)) {
                if (!material?.envMap) continue;
                material.userData.envMapIntensity ??= material.envMapIntensity;
                material.envMapIntensity = material.userData.envMapIntensity * reflections;
            }
        });
    }

    /**
     * The rooms shown lit for the time of day (lightRig), the sky's share
     * of light in each of their materials and the room probe's on them
     * (shareOut) — whenever it, or what is drawn with them, has changed;
     * and what the picture is exposed by with it (expose).
     */
    relight() {
        const world = this.world;
        const sky = world.sky?.current ? world.sky : null;
        this.lightRig();
        const key = `${this.rigFor}|${sky?.version ?? ""}`;
        if (key === this.litFor && !this.dirty) return;
        this.litFor = key;
        this.dirty = false;
        this.sets.indoorMaterials.clear();
        this.sets.reflectiveMaterials.clear();
        this.shareOut(this.lit(), this.sets);
        if (sky) {
            this.glazed = sky.glassDark;
            this.probeOn(sky, this.sets.probe?.texture ?? null, this.sets.probe?.indoor ?? false);
        }
        this.rig.glow?.applyTo(this.lit());
        this.expose();
    }

    /**
     * Each room's light that is not its lamps' — the sky's share, or the
     * night's sky without one — as the room's shaders take it
     * (RoomGlow.setShares): at night, what its bake measured reaching it
     * with every lamp off, from each of the six ways, and how much of the
     * sky's reflections it keeps; by day all of the unbaked view's, as
     * before (none of it in the drawing). Its own lamps on, a room is lit
     * as the unbaked view lights it whatever this says, as far as they are
     * on (RoomGlow: its glow).
     *
     * The unbaked view lights every room alike, a share of the open sky
     * that knows nothing of walls (Sky.share: INDOOR of the sky's light;
     * without a sky of its own, the night's hemisphere, LIVE_NIGHT_SKY).
     * By day it is tuned to look like daylight through the windows at its
     * own exposure (INDOOR_EXPOSURE), where the bake's room, holding only
     * what comes through its windows, is metered up several times as far:
     * the two are each exposed to their own light, and the live room is the
     * editor's room, by the user's word. At night the two views are exposed
     * alike — the night's own exposure, the outside's — and the same share
     * of the dusk lit a room with its lamps off a dim blue-grey (a mean
     * level of 73 in villa A1's living room) where the bake, which traces
     * the light, has it near black (2–6). So at night, as far as its own
     * lamps (and those of a room open to it, RoomGlow.together) are off, a
     * room takes the light its bake measured in it:
     *
     *   - its light probes' mean for each of the six ways (Realism's
     *     roomDaylight reads one room's so: World/ProbeLight.js) — the time
     *     of day's own light, no lamp's, as far as its doors as they are let
     *     it stay (zoneStays) — and on a surface the six ways' light as it
     *     faces (an ambient cube, as ProbeLight lights what moves), where
     *     the unbaked view's indoor sky lights a floor less than a wall;
     *   - brought up, colour by colour, to what the bake's lightmap holds
     *     on the room's own surfaces with every switch off (lightFigures),
     *     where that is more: the garden's own lamps' straight light through
     *     a glazed room's windows, which the probes leave out by design
     *     (blender/bake_public.py's garden_lights: the view lights what
     *     moves with its own live garden lamps) and the lightmap holds —
     *     A2's and A3's living rooms warm; nothing is lit twice, the room
     *     taking the larger of two measures of the same light, and no light
     *     of the live room's is the garden's;
     *   - a room the probes measured nothing in (villa B's A3 closet has
     *     none) takes the lightmap's alone, the same every way; one with
     *     neither, none;
     *   - and the light of each switch that is on in another room, at the
     *     room's probes, as far as the doors between are open (switchReach,
     *     as ProbeLight adds it): the spill of a lit room next door, which
     *     no light of the live room's carries past a door — not its own
     *     lamps', nor those of a room open to it, which are drawn live.
     *
     * Its share of the sky's reflections is that light's mean over what the
     * unbaked view gives a room's own surfaces (INDOOR times the sky's
     * strength times its light from all round, Sky.js's `indoorLevel`; or
     * the hemisphere's and the ambient light's), red, green and blue each,
     * never more than all of it. Its lamps, their glow and the sun's or the
     * moon's light through the windows are untouched.
     *
     * In the units of the bake's probes on both sides: a probe stores a
     * surface's light as a lightmap does, irradiance over π, which is what
     * three's environment map gives a surface at its intensity (the six
     * ways' mean drawn by three for the dusk's: 0.271, against 0.269 worked
     * out here), and a hemisphere light's irradiance over π.
     */
    measure() {
        const glow = this.rig?.glow;
        if (!glow) return;
        const world = this.world;
        const builder = this.builder;
        const variant = world.houseLighting ?? "day";
        const night = variant === "night";
        const model = night ? this.modelLight(variant) : null;
        const weights = builder.switchWeights || [];
        const figures = night ? this.lightFigures(variant) : null;
        const key = night ? `${variant}|${model?.join() ?? ""}|${builder.doorLightVersion ?? 0}|${weights.join("")}|${figures ? figures.size : "-"}` : variant;
        if (key === this.measuredFor) return;
        const baked = model ? this.daylight(variant) : null;
        // (Not yet: the sky still turning, the probes still to come — all of it, as before, and asked again next time.)
        if (night && !baked) {
            glow.setShares(() => ALL, ALL, { atOnce: true });
            return;
        }
        // Faded to from one light of the same time of day to the next (a lamp next door, a door, the lightmap's measure
        // come in), as the glow is; at once the first time and from day to night — what is shown then is made ready
        // under them.
        const atOnce = this.measuredFor?.split("|")[0] !== variant;
        this.measuredFor = key;
        if (!night) {
            glow.setShares(() => ALL, ALL, { atOnce });
            return;
        }
        const list = world.switches?.list ?? [];
        const lit = weights.map((weight, index) => (weight > 0 && baked.switches[index] ? index : -1)).filter((index) => index >= 0);
        const light = (zone) => {
            const stays = builder.zoneStays?.(zone) ?? 1;
            const faces = baked.faces.get(zone);
            const mean = baked.means.get(zone);
            const most = figures?.get(zone) ?? null;
            const out = new Array(18).fill(0);
            if (faces && !(most && luminance(mean) < luminance(most) * UNMEASURED)) {
                // (Each colour up to the lightmap's measure, where that is more: the garden's lamps through the glass.)
                const up = [0, 1, 2].map((c) => (most && mean[c] > 0 ? Math.max(1, most[c] / mean[c]) : 1));
                for (let f = 0; f < 6; f++) for (let c = 0; c < 3; c++) out[f * 3 + c] = faces[f * 3 + c] * up[c] * stays;
            } else if (most) {
                for (let f = 0; f < 6; f++) for (let c = 0; c < 3; c++) out[f * 3 + c] = most[c] * stays;
            }
            // ...and what the lamps lit in the other rooms throw into it, through its doors as far as they are open — not its
            // own lamps', nor those of a room open to it, whose light and glow are drawn live.
            const count = baked.counts.get(zone);
            for (const index of lit) {
                const sum = baked.switches[index].get(zone);
                const from = list[index]?.room;
                if (!sum || !from || glow.together(from, zone)) continue;
                const k = (weights[index] * (builder.switchReach?.(index, zone) ?? 1)) / count;
                for (let i = 0; i < 18; i++) out[i] += sum[i] * k;
            }
            return out;
        };
        // How much of the sky's reflections it keeps: its light's mean over the unbaked view's, colour by colour.
        const share = (cube) => [0, 1, 2].map((c) => THREE.MathUtils.clamp((cube[c] + cube[3 + c] + cube[6 + c] + cube[9 + c] + cube[12 + c] + cube[15 + c]) / 6 / model[c], 0, 1));
        glow.setShares(
            (room) => {
                const cube = light(room.id);
                return [...share(cube), ...cube];
            },
            share(light("outside")),
            { atOnce, night: true }
        );
    }

    /**
     * What the unbaked view gives a room's own surfaces at night of the
     * light that is not its lamps' (measure), in the probes' units, red,
     * green and blue: the sky's indoor light times its share — or, without
     * a sky of its own, the room's two lights of the sky. Null where it
     * cannot be said yet.
     */
    modelLight(variant) {
        const world = this.world;
        const sky = world.sky?.current ? world.sky : null;
        let light = null;
        if (sky) {
            const level = sky.current.indoorLevel;
            if (sky.variant !== variant || !Array.isArray(level) || !(sky.strength > 0)) return null;
            light = level.map((value) => sky.strength * INDOOR * value);
        } else {
            const { ambient, hemisphere } = this.rig;
            if (!hemisphere) return null;
            light = ["r", "g", "b"].map((c) => (ambient.intensity * ambient.color[c] + (hemisphere.intensity * (hemisphere.color[c] + hemisphere.groundColor[c])) / 2) / Math.PI);
        }
        return light.every((value) => value > 0) ? light.map((value) => +value.toPrecision(6)) : null;
    }

    /**
     * The light the bake's probes measured in each room (World/ProbeLight.js),
     * red, green and blue: for the time of day, its own light alone, no
     * lamp's — each of the six ways' mean over the room's probes (`faces`:
     * room id -> 18 numbers, +x, -x, +y, -y, +z, -z; or null where it has
     * none) and all six together (`means`: room id -> [r, g, b], as
     * Realism's roomDaylight reads one room) — and each switch's, all of it,
     * each way summed over the room's probes it reaches (`switches`: switch
     * index -> room id -> 18 numbers; `counts`: room id -> its probes). In
     * one pass, once a time of day.
     */
    daylight(variant) {
        const probes = this.world.probes;
        const light = probes?.variants?.[variant];
        if (!light) return null;
        if (this.baked?.variant === variant && this.baked.probes === probes) return this.baked;
        const zones = probes.zoneIds.length;
        const sums = new Float64Array(zones * 18);
        const counts = new Uint32Array(zones);
        for (let index = 0; index < probes.count; index++) {
            const zone = probes.zoneOf[index];
            if (zone >= zones) continue;
            for (let i = 0; i < 18; i++) sums[zone * 18 + i] += light[index * 18 + i];
            counts[zone]++;
        }
        const faces = new Map(probes.zoneIds.map((id, zone) => [id, counts[zone] ? Array.from({ length: 18 }, (_, i) => sums[zone * 18 + i] / counts[zone]) : null]));
        const means = new Map([...faces].map(([id, each]) => [id, each && [0, 1, 2].map((c) => (each[c] + each[3 + c] + each[6 + c] + each[9 + c] + each[12 + c] + each[15 + c]) / 6)]));
        const switches = (probes.switches ?? []).map((entry) => {
            if (!entry?.full) return null;
            const by = new Map();
            for (let j = 0; j < entry.indices.length; j++) {
                const id = probes.zoneIds[probes.zoneOf[entry.indices[j]]];
                if (!id) continue;
                let sum = by.get(id);
                if (!sum) by.set(id, (sum = new Array(18).fill(0)));
                for (let i = 0; i < 18; i++) sum[i] += entry.full[j * 18 + i];
            }
            return by;
        });
        this.baked = { variant, probes, faces, means, switches, counts: new Map(probes.zoneIds.map((id, zone) => [id, counts[zone]])) };
        return this.baked;
    }

    /**
     * What the bake's lightmap for the time of day holds on each room's own
     * surfaces with every switch off, red, green and blue, in the probes'
     * units (readLightmapRooms): room id -> [r, g, b]. Read once a time of
     * day, from the published file — the light the view draws from is the
     * GPU's alone, its picture given back once sent (Utils/bakedTexture.js)
     * — in slices between frames; null until it is in, or where it cannot
     * be read (measure then goes by the probes alone, and a room they
     * measured nothing in is dark).
     */
    lightFigures(variant) {
        this.measured ??= new Map();
        let entry = this.measured.get(variant);
        if (!entry) {
            entry = { done: false, figures: null };
            entry.promise = readLightmapRooms(this.published?.lighting, variant, () => this.renderer.nextFrame())
                .then(
                    (figures) => (entry.figures = figures),
                    (error) => console.warn("The bake's lightmap could not be read for the rooms drawn live", error)
                )
                .finally(() => (entry.done = true));
            this.measured.set(variant, entry);
        }
        return entry.figures;
    }

    /** That (lightFigures), once it is in — or has failed. */
    async lightFiguresIn(variant) {
        this.lightFigures(variant);
        await this.measured.get(variant).promise;
    }

    /** The rooms shown lit by their own probe again, after something else lit materials they share with it: a room staged (prepare), a face of its probe (drawBoth). */
    relit() {
        const sky = this.world.sky?.current ? this.world.sky : null;
        if (sky && this.drawn) this.probeOn(sky, this.sets.probe?.texture ?? null, this.sets.probe?.indoor ?? false);
    }

    /**
     * How the picture is exposed while the camera is in the room, and how
     * far the rooms next door — still the bake's — are brought up for it:
     *
     *   - `adaptation`: what Realism gives the renderer on top of the
     *     light's own exposure, so that the whole comes to what a view lit
     *     live exposes a room by (Realism.update: INDOOR_EXPOSURE by day,
     *     the night's own at night; without a sky of its own, the preset's)
     *     — the editor's brightness, where the baked view's light meter
     *     would have read the frame instead.
     *   - `gain`: the bake's rooms hold the real light through their
     *     windows, a tenth to a hundredth of what a room lit live is given,
     *     and the baked view exposes for that; at the unbaked view's
     *     exposure the next room through a doorway would be near black. So
     *     every baked surface indoors draws its light times what the bake's
     *     own exposure of this room would have been over this one
     *     (SceneBuilder.setIndoorGain, as the view from above uses it): the
     *     next room is about as bright as the baked view shows it from
     *     here. Never under 1, and 1 at night, when the two exposures are
     *     within a stop of each other. The garden through a window is
     *     exposed with the frame, as the unbaked view shows it.
     */
    expose(atOnce = false) {
        if (!this.drawn) return;
        // In the bake's light, the baked view's own light meter's (Realism.updateBaked: `metered`) — it reads the frame,
        // which is the bake's light — and the rooms next door as the bake has them.
        if (this.bake) {
            Object.assign(this.drawn, { metered: true, adaptation: 1, wanted: 1, gain: 1 });
            return;
        }
        const world = this.world;
        const environment = world.environment;
        const night = world.houseLighting === "night";
        let unbaked;
        if (world.sky?.current) unbaked = night ? (QUALITY.grade ? NIGHT_EXPOSURE : 1) : INDOOR_EXPOSURE;
        else unbaked = (night ? PLAIN_NIGHT.exposure : environment.preset.exposure) ?? 1;
        this.drawn.adaptation = unbaked / (environment.bakedExposure || 1);
        // (From one room to the next the rooms round them keep their brightness and ease to the next room's: update.)
        this.drawn.wanted = Math.max(this.gainFor(this.room), this.aimed ? this.gainFor(this.aimed) : 1);
        if (atOnce && !(this.drawn.gain > 1)) this.drawn.gain = this.drawn.wanted;
        if (night) this.drawn.gain = 1;
    }

    /**
     * The room its visitor has just stepped into, still the bake's, a moment
     * before it takes over from the one shown (RoomLight) — or null. The
     * baked rooms are brought up for it from now, not from the frame it is
     * shown in, where it asks for more than the room shown does (never
     * down: a room drawn live is seldom dimmer than its bake brought up as
     * far as the last room had it): a bedroom behind a blind, at the
     * brightness the living room left it (a mean level of 53), came on at
     * 115 in one frame; brought up first, at 95.
     */
    aim(room) {
        if (room === this.aimed) return;
        this.aimed = room;
        this.expose();
    }

    /**
     * How far the baked rooms round `room` are brought up while it is drawn
     * live (expose): what the bake's own exposure of it would have been
     * over the unbaked view's — by day only: at night a baked room's lamps
     * and their glass, brought up at all, cross the bloom's threshold (a
     * loggia seen through the window, twice as bright, glowed over half the
     * frame).
     */
    gainFor(room) {
        const world = this.world;
        const environment = world.environment;
        const night = world.houseLighting === "night";
        if (night || this.bake) return 1;
        let unbaked;
        if (world.sky?.current) unbaked = INDOOR_EXPOSURE;
        else unbaked = environment.preset.exposure ?? 1;
        const adaptation = unbaked / (environment.bakedExposure || 1);
        const baked = room ? this.renderer.realism.bakedExposure(room) : adaptation;
        return Math.max(1, baked / adaptation);
    }

    /**
     * What the sun's shadow map is fitted over (Realism's SunFit, `over`):
     * the rooms shown, and no further — where an unbaked view fits it to
     * all the camera sees, out to the step's reach: a map of the step's
     * full size (8192 a side at the top one, half a gigabyte) holding the
     * whole house, drawn again whenever the view moves on. Over the rooms
     * alone it is a few hundred texels a side — as many as give it the
     * texels of the unbaked view's own fit indoors, or finer — it holds the
     * few things between the rooms and the sun, and it stands still while
     * the visitor walks: drawn again only when something moves. While the
     * next rooms are made ready beside those shown, over both: the faces of
     * their probe are drawn under this map, and a floor outside it is in
     * full sun through its roof.
     */
    sunBox(zones = this.sunZones()) {
        const key = `${zones.join()}|${QUALITY.shadow.size}|${QUALITY.shadow.reach}`;
        if (this.boxed?.key === key) return this.boxed;
        const corners = [];
        for (const zone of zones) {
            const room = this.builder.spec.rooms.find((each) => each.id === zone);
            if (!room) continue;
            const xs = room.polygon.map((point) => point[0]);
            const zs = room.polygon.map((point) => point[1]);
            for (const x of [Math.min(...xs) - SUN_MARGIN, Math.max(...xs) + SUN_MARGIN]) {
                for (const z of [Math.min(...zs) - SUN_MARGIN, Math.max(...zs) + SUN_MARGIN]) {
                    for (const y of [room.elevation - SUN_MARGIN, room.elevation + room.height + SUN_MARGIN]) corners.push(new THREE.Vector3(x, y, z));
                }
            }
        }
        // About a texel of the unbaked view's fit from indoors: half the step's reach, as wide again and more as the
        // view opens, over the step's map — or, without a sky of its own, of the one map it draws over the whole
        // footprint (Environment.fitShadows).
        let texel = (QUALITY.shadow.reach * 1.25) / QUALITY.shadow.size;
        let most = QUALITY.shadow.size;
        if (!this.world.sky?.current) {
            const extent = this.world.environment.footprintExtent();
            most = extent > 50 && !LOW_POWER ? SHADOW_MAP_SIZE * 2 : SHADOW_MAP_SIZE;
            texel = (2 * extent) / most;
        }
        this.boxed = { key, corners, texel, mapSize: (side) => THREE.MathUtils.clamp(Math.pow(2, Math.ceil(Math.log2(side / texel))), 256, most) };
        this.rig.fit.dirty = true;
        return this.boxed;
    }

    /** The rooms the sun's shadow map is fitted over now (sunBox): those shown, and those being made ready beside them. */
    sunZones() {
        const zones = [...this.drawn.zones];
        const staged = this.job?.set;
        if (staged && !this.showing.has(staged.key)) for (const zone of staged.zones) if (!zones.includes(zone)) zones.push(zone);
        return zones;
    }

    /** Whether a point is by the rooms the sun's shadow map is fitted over, where what stands there shades their sun: within SUN_REACH of them. */
    shades(point) {
        const box = this.sunBox();
        if (!box.bounds) {
            box.bounds = new THREE.Box3().setFromPoints(box.corners);
            box.bounds.min.x -= SUN_REACH;
            box.bounds.min.z -= SUN_REACH;
            box.bounds.max.x += SUN_REACH;
            box.bounds.max.z += SUN_REACH;
            box.bounds.max.y += SUN_REACH;
        }
        return box.bounds.containsPoint(point);
    }

    /** The room probe's light on the room's materials (Realism's RoomProbe), or none. */
    useProbe(texture, indoor = false) {
        this.sets.probe = texture ? { texture: probed(texture), indoor } : null;
        if (this.world.sky) this.probeOn(this.world.sky, texture, indoor);
    }

    /**
     * The room probe's light on the rooms' materials (Sky.light: `texture`,
     * or none — the sky's and their own reflections in its place). In the
     * bake's light (RoomBakeLight) what reflects the probe — a metal, a
     * mirror, glass — takes all of it, at night too: the probe is the room
     * as drawn. Sky.share dims what reflects its own studio, or the probe in
     * the studio's place, to a night's share, which a view lit live makes up
     * with a lit room's glow (RoomGlow, not made here): without it a
     * lamplit bathroom's steel washer, chrome and mirror were black at
     * night (the washer 1.7 levels, where the bake has 40 and the editor
     * draws them as bright as the room they reflect).
     */
    probeOn(sky, texture, indoor) {
        sky.light(this.sets, texture, indoor);
        if (!this.bake) return;
        for (const material of this.sets.reflectiveMaterials) {
            const dimmed = material.userData.roomBakeDimmed;
            if (dimmed === undefined) continue;
            material.envMapIntensity = material.envMap?.userData?.roomProbe ? material.userData.ownEnvIntensity ?? dimmed : dimmed;
        }
    }

    /** Each frame, with the world (before draw): its switches as the baked view's are, its lamps and glow faded on, whoever has walked in or out. */
    update(delta) {
        const rig = this.rig;
        if (!rig) return;
        if (!this.drawn) {
            // Not shown, but asked for: its switches and glow kept as they stand, for the frame that shows it.
            this.syncSwitches();
            rig.glow?.update(delta);
            return;
        }
        const before = rig.switches.version;
        this.syncSwitches();
        if (rig.switches.version !== before) this.expose();
        this.track();
        // (What stands in the openings and faces no room — a window's frame, the outer part of its reveals — as lit as
        // the visitor's own room's lamps have it: RoomGlow's outsideRoom.)
        if (rig.glow) {
            rig.glow.outsideRoom = this.room?.id ?? null;
            rig.glow.update(delta);
        }
        // What has moved since the last frame — a door, a drawer, a figure, a car — for the lamps' shadows (LampPool)
        // and, where it is by the rooms shown, the sun's (draw).
        const moved = rig.pool.moved();
        if (moved.some((point) => this.shades(point))) this.stirred = true;
        rig.pool.update(delta, moved);
        // In the bake's light: each switch's as far as it is on and its lamps are lit, the doors as they are; what moves
        // lit by the probes round it.
        if (this.bake) {
            this.bake.update(delta);
            this.bake.light(this.roots.keys(), delta);
            // Its light, once it has stood still, on its way somewhere again — a switch fading, a lamp handed on, the
            // lightmap or the probe still to be drawn as they now are —: the light meter, which reads the frame
            // (`metered`), reads it again once it has got there (Realism's LightMeter.lightKey). Read during a switch's
            // fade, a room whose lamps came on was exposed for their first glimmer — twice the bake's exposure, 155
            // levels for 124 — until the camera moved. Not as the rooms are first shown, which is the bake's light on
            // the bake's reading (re-read, the dark window frames had the rooms 3–6 levels over the bake by day), nor
            // for longer than STIR_MOST at a time: the exposure is never held for good.
            const busy = this.bake.moving || this.probeStale || Boolean(rig.probe && rig.probe.face < 7);
            this.stirFor = busy ? (this.stirFor ?? 0) + delta : 0;
            if (!busy) this.lightStood = true;
            else if (this.lightStood && this.stirFor < STIR_MOST) this.drawn.light = (this.drawn.light ?? 0) + 1;
        }
        // The rooms next door eased to the brightness this room has them at.
        const { wanted = 1, gain } = this.drawn;
        if (gain !== wanted) this.drawn.gain = Math.abs(wanted - gain) < 0.01 ? wanted : gain + (wanted - gain) * Math.min(1, (this.aimed ? GAIN_EASE * 3 : GAIN_EASE) * delta);
        // A switch turned, and its lights faded — or a room let in beside those shown: the room probe captured again, as
        // they are now. Not while something by them is still moving, for half a second at most: a door on its way open
        // has the sun's map and the lamps' drawn again every frame of its swing, and the probe's six faces on top of
        // those were the longest frames of a walk (35–37 ms); a view lit live does not take its probe again for a door.
        // (In the bake's light, once the switches' own light has faded too — RoomBakeLight's `moving`: a switch of the
        // bake's, its lamps not drawn live, leaves the pool as it was, and its room was taken half lit, its floor and
        // its metals reflecting the light just put out.)
        if (this.probeStale && (rig.glow?.settled ?? true) && rig.pool.settled && !this.bake?.moving) {
            this.probeWait = moved.length ? (this.probeWait ?? 0) + delta : Infinity;
            if (this.probeWait >= 0.5) {
                this.probeStale = false;
                this.probeWait = 0;
                this.lightVersion++;
            }
        }
    }

    /**
     * Before a frame of `camera` is drawn (Renderer.render): the light as
     * the time of day stands, the sun's shadow fitted to the view, and the
     * room probe captured where it should be. (The shadow maps that are due
     * are drawn in the room's own call: roomCall.)
     */
    draw(camera) {
        const rig = this.rig;
        if (!rig || !this.drawn || !camera?.isPerspectiveCamera) return;
        const world = this.world;
        const realism = this.renderer.realism;
        this.relight();
        this.follow();
        // (The bake's light under them, as it now is: drawn again where it has changed.)
        this.bake?.flush();
        const sky = world.sky?.current ? world.sky : null;
        // (The windows as the camera sees them now: Sky.setGlassView has the scene's own.)
        if (sky && sky.glassDark !== this.glazed) {
            this.glazed = sky.glassDark;
            sky.glaze(this.sets);
            this.probeOn(sky, this.sets.probe?.texture ?? null, this.sets.probe?.indoor ?? false);
            // ...and the room probe with them: its faces were drawn through the panes as they were. A room come into
            // from the garden had its probe taken as its visitor reached the door — its own windows dark and mirroring
            // the sky, as they are seen from out of doors — and kept it: the daylight through them missing from its
            // light (two faces of the probe a third as bright; the frame 13–19 levels under the unbaked view's) until
            // its visitor had gone 2.5 m further in.
            this.probeStale = true;
        }
        const room = realism.roomOf(camera);
        this.fitSun(camera, this.sunBox());
        // Whatever has moved by the rooms shades their sun anew (update) — the map is fitted over the rooms, not the
        // view, and stands still as the visitor walks.
        if (this.stirred) rig.sun.shadow.needsUpdate = true;
        this.stirred = false;
        // ...and someone by them who moves where they sit or stand — whom that does not see — as often as the
        // unbaked view draws its sun's shadow again (Realism.cadence): every frame, or every few at the top steps.
        this.frame = (this.frame ?? 0) + 1;
        if (rig.sun.visible && this.frame % Math.max(1, QUALITY.shadow.every ?? 1) === 0 && this.animated()) rig.sun.shadow.needsUpdate = true;
        if (sky && QUALITY.probe) {
            // (What the probe sees of the rooms next door, brought up as the frame will have them: Realism sets the same before it.)
            this.builder.setIndoorGain(this.drawn.gain);
            rig.probe ??= new RoomProbe(this.experience, { paced: true, pmrem: rig.pmrem, sky: { useProbe: (texture, indoor) => this.useProbe(texture, indoor) }, draw: (renderer, eye) => this.drawBoth(renderer, eye) });
            // Taken in the rooms shown: a camera that has gone on into the next room, still the bake's — its visitor
            // a step ahead of the hand-over, or a camera behind them — would take it from in there.
            const within = room && this.drawn.zones.has(room.id) ? room : this.room;
            rig.probe.update(camera, within, { variant: sky.variant, version: sky.version, lightVersion: this.lightVersion });
        } else if (rig.probe) {
            rig.probe.dispose();
            rig.probe = null;
        }
    }

    /**
     * A picture as large as a face of the room probe, of the kind the view
     * itself is drawn into (the post-processing's own: its formats, its
     * multisampling) — and what copies it onto the face, less its spikes
     * (FACE_SPIKE). Null where the view is drawn straight to the screen: the
     * face is drawn into directly.
     */
    through(face) {
        const beauty = this.renderer.post?.ao.beautyRenderTarget;
        if (!beauty || !face?.isWebGLCubeRenderTarget) return null;
        if (this.faced?.samples !== beauty.samples || this.faced.width !== face.width) {
            this.faced?.dispose();
            this.faced = new THREE.WebGLRenderTarget(face.width, face.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, samples: beauty.samples });
            this.faced.depthTexture = new THREE.DepthTexture(face.width, face.height, THREE.UnsignedIntType);
        }
        if (!this.copier) {
            const material = new THREE.ShaderMaterial({
                name: "room-live-face",
                uniforms: { map: { value: null }, texel: { value: new THREE.Vector2() }, spike: { value: new THREE.Vector3(FACE_SPIKE.times, FACE_SPIKE.over, FACE_SPIKE.reach) } },
                vertexShader: "varying vec2 vUv;\nvoid main() {\n\tvUv = position.xy * 0.5 + 0.5;\n\tgl_Position = vec4( position.xy, 0.0, 1.0 );\n}",
                fragmentShader: /* glsl */ `
                    uniform sampler2D map;
                    uniform vec2 texel;
                    uniform vec3 spike;
                    varying vec2 vUv;
                    float brightest( vec3 colour ) {
                        return max( colour.r, max( colour.g, colour.b ) );
                    }
                    void main() {
                        vec4 own = texture2D( map, vUv );
                        // No brighter than so many times the brightest of the eight round it, nor than as many times
                        // the third brightest of the eight a few texels off (FACE_SPIKE).
                        float round = 0.0;
                        float first = 0.0;
                        float second = 0.0;
                        float third = 0.0;
                        for ( int x = -1; x <= 1; x ++ ) {
                            for ( int y = -1; y <= 1; y ++ ) {
                                if ( x == 0 && y == 0 ) continue;
                                vec2 way = vec2( float( x ), float( y ) ) * texel;
                                round = max( round, brightest( texture2D( map, vUv + way ).rgb ) );
                                float far = brightest( texture2D( map, vUv + way * spike.z ).rgb );
                                if ( far > first ) { third = second; second = first; first = far; }
                                else if ( far > second ) { third = second; second = far; }
                                else if ( far > third ) third = far;
                            }
                        }
                        float most = min( round, third ) * spike.x + spike.y;
                        gl_FragColor = vec4( own.rgb * min( 1.0, most / max( brightest( own.rgb ), 1e-6 ) ), own.a );
                    }
                `,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
                fog: false,
            });
            const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            quad.frustumCulled = false;
            this.copier = new THREE.Scene();
            this.copier.add(quad);
            this.copier.material = material;
            this.copier.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        }
        return this.faced;
    }

    /**
     * What the view has never drawn — a figure by the pool the visitor has
     * not yet turned to, its shader not built, its textures not sent: left
     * out of a face of the room probe, which looks every way at once, and
     * would stop to build and send all of it in one frame (four shaders and
     * twenty textures in the first face of a living room's: 0.8 s). It is
     * in the next probe taken after the view has drawn it.
     */
    undrawn() {
        const properties = this.renderer.renderer.properties;
        const unseen = [];
        const visit = (object) => {
            if (!object.visible) return;
            if ((object.isMesh || object.isPoints || object.isLine) && object.layers.isEnabled(0)) {
                // (A material that shows nothing is never built, and draws nothing: not waited for.)
                if ([].concat(object.material).some((material) => material && material.visible && properties.get(material).currentProgram === undefined)) unseen.push(object);
            }
            for (const child of object.children) visit(child);
        };
        visit(this.scene);
        return unseen;
    }

    /** Whether anyone drawn in the rooms shown, or by them (shades), is moving where they are: a person whose clip plays, in view (World/People.js animates no other). */
    animated() {
        const people = this.world.people;
        if (!people?.root.visible || !people.stats.animated) return false;
        for (const person of people.list) {
            if (!person.action || !person.group.visible) continue;
            if (this.roots.has(person.group) || this.shades(person.group.getWorldPosition(_at))) return true;
        }
        return false;
    }

    /**
     * One render of the room's own through `camera`, whose layers say which
     * of its two calls it is — its surfaces (ROOM_LAYER) or what is seen
     * through in it (GLASS_LAYER) — handed `as` for the scene (standIn).
     * The shadow maps of its lights that are due are drawn in it, by
     * three's own shadow pass — which takes what casts from the layers of
     * the camera it is handed, so it is handed another: the one that sees
     * the room's casters and the scene's own (what moves, the trees), not
     * the room's surfaces. A light whose map is not due is left as it is.
     */
    roomCall(renderer, camera, as = this.rig.first) {
        const rig = this.rig;
        // (Each room's share of what is not its lamps' light, as the bake measured it now: a door moved, night fell.)
        this.measure();
        const shadowMap = renderer.shadowMap;
        const render = shadowMap.render;
        const kept = { auto: shadowMap.autoUpdate, due: shadowMap.needsUpdate };
        const due = (light) => light.visible && light.castShadow && light.shadow.needsUpdate;
        shadowMap.autoUpdate = false;
        shadowMap.needsUpdate = due(rig.sun) || rig.pool.slots.some((slot) => due(slot.light));
        shadowMap.render = (lights) => {
            if (!shadowMap.needsUpdate) return;
            const info = renderer.info.render;
            const calls = info.calls;
            // In the bake's light the lamps' cubes (six maps each) are drawn of what is drawn live alone (lampCasters): a
            // lamp's light reaches nothing else that it lights, and the whole house six times over was ten milliseconds a
            // lamp, every tenth of a second of a door's swing. The sun's map, of all of it, as ever.
            const lamps = this.bake ? lights.filter((light) => light !== rig.sun) : [];
            const sun = lamps.length ? lights.filter((light) => light === rig.sun) : lights;
            try {
                this.shadowPass(render, sun, rig.casters, true);
                if (lamps.length) {
                    shadowMap.needsUpdate = true;
                    this.shadowPass(render, lamps, this.lampCasters(), false);
                }
            } finally {
                this.stats.calls += info.calls - calls;
                this.stats.shadows++;
            }
        };
        try {
            // What the call looks through: the room's own and its lights, not the whole scene's five thousand things.
            as.children = this.own();
            renderer.render(as, camera);
        } finally {
            shadowMap.render = render;
            shadowMap.autoUpdate = kept.auto;
            shadowMap.needsUpdate = kept.due;
        }
    }

    /**
     * One shadow pass of the room's lights (roomCall), three's own (`render`)
     * — through the scene itself: what casts is all over it, where the call's
     * own stand-in holds the room's alone — with `casters` in the scene for
     * its length; and, `garden`, the garden lent to it (lend).
     */
    shadowPass(render, lights, casters, garden) {
        if (!lights.length) return;
        const rig = this.rig;
        const scene = this.scene;
        const renderer = this.renderer.renderer;
        // (Each stand-in shown as what it stands for is: a floor the view has taken away casts nothing.)
        for (const proxy of casters.children) proxy.visible = proxy.userData.source.visible !== false;
        scene.add(casters);
        const lent = garden ? this.lend() : [];
        // (Drawn ahead for the shaders' sake — primeShadows: every caster of the house and the garden, in the map or
        // not, so that each kind of them has its shader before the map is fitted over a room that has one.)
        const wide = this.priming ? [...casters.children, ...lent] : [];
        // (...and whoever walks or sits about the place: a rigged figure's is a shader of its own.)
        if (this.priming) for (const root of this.moving()) root.traverse((mesh) => mesh.isMesh && mesh.castShadow && wide.push(mesh));
        const culled = wide.map((object) => object.frustumCulled);
        for (const object of wide) object.frustumCulled = false;
        try {
            render.call(renderer.shadowMap, lights, scene, rig.casterEye);
        } finally {
            wide.forEach((object, k) => (object.frustumCulled = culled[k]));
            for (const mesh of lent) mesh.castShadow = false;
            scene.remove(casters);
        }
    }

    /**
     * What casts for the lamps in the bake's light: of each caster of the
     * house (makeCasters), the triangles drawn live now — the rooms shown and
     * what stands in their walls' openings (each group's `out`, each shared
     * opening's) — and the faces the snapshot culled, all of them. Made again
     * when what is shown changes: a lamp lights only what is drawn live (the
     * rest is the bake's, which its lights are no part of), and of a wall
     * between two rooms each side's face is its room's. The vertices are the
     * house's own; each index its own, let go with the next.
     */
    lampCasters() {
        const rig = this.rig;
        const runs = new Map();
        const add = (out) => {
            for (const [mesh, list] of out) {
                if (!runs.has(mesh)) runs.set(mesh, []);
                runs.get(mesh).push(...list);
            }
        };
        for (const set of this.showing.values()) add(set.out);
        for (const frame of this.shared.values()) if (frame?.on) add(frame.out);
        const key = [...runs].map(([mesh, list]) => `${mesh.id}:${list.length}:${list.reduce((sum, run) => sum + run.count, 0)}`).join();
        if (this.lampSet?.key === key) return this.lampSet.group;
        this.dropLampCasters();
        const group = new THREE.Group();
        group.name = "room-live-lamp-casters";
        for (const proxy of rig.casters.children) {
            const source = proxy.userData.source;
            const list = runs.get(source);
            // (The faces the snapshot culled are no room's: all of them, as they are.)
            const culled = !list && source.parent?.name === "shadow-casters";
            if (!list && !culled) continue;
            let geometry = proxy.geometry;
            if (list) {
                list.sort((a, b) => a.start - b.start);
                const count = list.reduce((sum, run) => sum + run.count, 0);
                geometry = new THREE.BufferGeometry();
                geometry.setAttribute("position", source.geometry.attributes.position);
                geometry.setIndex(indexOf(this.whole(source), list, count));
                geometry.boundingSphere = proxy.geometry.boundingSphere;
            }
            const mesh = new THREE.Mesh(geometry, proxy.material);
            mesh.name = `lamp-${proxy.name}`;
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(proxy.matrix);
            mesh.matrixWorld.copy(proxy.matrixWorld);
            mesh.layers.set(CAST_LAYER);
            mesh.castShadow = true;
            mesh.raycast = none;
            mesh.userData = { source, own: Boolean(list) };
            group.add(mesh);
        }
        this.lampSet = { key, group };
        return group;
    }

    /** The lamps' casters let go (lampCasters): their indices are their own, their vertices the house's. */
    dropLampCasters() {
        for (const proxy of this.lampSet?.group.children ?? []) {
            if (!proxy.userData.own) continue;
            proxy.geometry.deleteAttribute("position");
            proxy.geometry.dispose();
        }
        this.lampSet = null;
    }

    /** What a call of the room's draws, and is lit by: its surfaces, the stand-ins of what moves in it, its lights, and the figures on its layers (wherever in the scene they hang) — the children its stand-in for the scene has (standIn). */
    own() {
        const rig = this.rig;
        const own = [rig.group, rig.movers, rig.sun];
        if (rig.ambient) own.push(rig.ambient, rig.hemisphere);
        for (const slot of rig.pool.slots) own.push(slot.light);
        for (const [root, done] of this.roots) if (done.some((was) => !was.standIn) && shown(root.parent ?? root)) own.push(root);
        return own;
    }

    /**
     * The garden's trees and bushes casting for the length of a shadow
     * pass of the room's, where they cast nothing in the view itself — a
     * bake that keeps the sun's share of the light apart has their shade in
     * it (World/Vegetation: `castsShadows`), and the sun through a room's
     * window is theirs to shade as in a view lit live.
     *
     * @returns {THREE.Mesh[]} those made to cast: to be put back
     */
    lend() {
        const garden = this.world.vegetation;
        if (!garden || garden.castsShadows !== false || !this.rig.sun.visible) return [];
        const lent = [];
        for (const mesh of [...(garden.treeMeshes ?? []), garden.bushLeaves]) {
            if (!mesh || mesh.castShadow) continue;
            mesh.castShadow = true;
            lent.push(mesh);
        }
        return lent;
    }

    /** Its own call drawn just before the scene's own, each frame of the view (before, after), for as long as a room is shown. */
    hook() {
        const scene = this.scene;
        if (this.hooked) return;
        this.hooked = { before: scene.onBeforeRender, after: scene.onAfterRender };
        scene.onBeforeRender = (renderer, _scene, camera, target) => this.before(renderer, camera, target);
        scene.onAfterRender = (renderer, _scene, camera) => this.after(renderer, camera);
    }

    unhook() {
        if (!this.hooked) return;
        this.scene.onBeforeRender = this.hooked.before;
        this.scene.onAfterRender = this.hooked.after;
        this.hooked = null;
        // (Given back between its own call and the scene's — a frame that threw: clearing as before.)
        if (this.phase === 2) this.restore();
    }

    /** The room's own camera where `camera` is, seeing what it sees — on the room's layer, or (`eye`) the one of what is seen through in it (its matrices are never worked out from a place of its own). */
    sight(camera, eye = this.rig.eye) {
        eye.near = camera.near;
        eye.far = camera.far;
        eye.fov = camera.fov;
        eye.aspect = camera.aspect;
        eye.projectionMatrix.copy(camera.projectionMatrix);
        eye.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
        eye.matrixWorld.copy(camera.matrixWorld);
        eye.matrixWorldInverse.copy(camera.matrixWorldInverse);
        return eye;
    }

    /**
     * As a render of the scene starts: if it is the view's own frame — its
     * camera, into the picture the view is drawn in — the room's call
     * first, into the same picture; the scene's own then clears nothing.
     */
    before(renderer, camera, target) {
        if (this.phase !== 0 || !this.drawn) return;
        if (camera !== this.experience.camera.activeCamera || !camera.isPerspectiveCamera) return;
        const post = this.renderer.post;
        if (target !== (post && this.renderer.plainExposure === null ? post.ao.beautyRenderTarget : null)) return;
        const scene = this.scene;
        try {
            // (Every matrix is as the scene's own render has just worked it out: a stand-in works none out again.)
            this.roomCall(renderer, this.sight(camera));
        } catch (error) {
            // Not thrown on, into the scene's own render: this frame is the scene's alone, and the room goes back to its bake.
            this.fail(error);
            return;
        }
        this.kept = { clear: renderer.autoClear, background: scene.background };
        renderer.autoClear = false;
        // (A plain colour behind the scene is cleared to whatever is asked: it has been, by the room's call.)
        if (scene.background?.isColor) scene.background = null;
        // (The sheer curtains not in the scene's own call: drawn after the room's glass, sheerCall.)
        if (this.sheers.length) {
            this.sheered = this.sheers.filter((mesh) => mesh.visible);
            for (const mesh of this.sheered) mesh.visible = false;
        }
        this.phase = 2;
    }

    /** As the scene's own render ends: what is seen through of the room's own over it, in a second call, and the sheer curtains over that; then clearing as before. */
    after(renderer, camera) {
        if (this.phase !== 2) return this.veil(renderer, camera);
        try {
            if (this.panes > 0) this.roomCall(renderer, this.sight(camera, this.rig.glassEye), this.rig.last);
            this.sheerCall(renderer, camera);
        } catch (error) {
            this.fail(error);
        } finally {
            this.restore();
        }
    }

    /**
     * The sheer curtains of the rooms shown, in the bake's light: drawn as
     * the baked view draws them — their own material, the view's own lights
     * (its sun, its sky's light, its night's glow: Sky.glowIndoors), at the
     * view's exposure — but after the room's glass, where the scene's own
     * call would have them under it. The bake has no curtain (nothing seen
     * through is in the snapshot it was traced from: StaticBatcher's
     * canMerge), so it has no light of one to give it; drawn live by the
     * room's own lights — a copy lit by the probes round it (RoomBakeLight's
     * "cube") — a sheer curtain took the light of the room in front of it
     * alone, a dark brown sheet by day (A's upper south living room's 79.9
     * levels where the baked view's is 165.4), and kept whatever glow the
     * night had given the scene's material as it was copied: none at night
     * if K was first pressed by day (0.2 for 83.3, lamps off), saturated
     * orange by day if first pressed at night. Left in the scene's call, the
     * room's clear panes behind it (drawn after it) lay over it, 7–12 levels
     * darker over a window. A call of its own, then, handed a stand-in for
     * the scene (standIn) that holds the curtains and the view's own lights
     * (lightsOfView), whose light state is the scene's call's: the same
     * shader. It casts nothing for the room's sun or lamps, as it shades
     * nothing in the bake.
     */
    sheerCall(renderer, camera) {
        const sheered = this.sheered;
        this.sheered = null;
        if (!sheered?.length) return;
        for (const mesh of sheered) mesh.visible = true;
        // (A call is a resolve of the multisampled picture more — 0.7–1.0 ms of a frame at 2560 × 1440 —: none without one in sight.)
        _frustum.setFromProjectionMatrix(_matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        if (!sheered.some((mesh) => _frustum.intersectsObject(mesh))) return;
        const stage = (this.rig.sheerStage ??= standIn(this.scene, { background: null }));
        const shadowMap = renderer.shadowMap;
        const kept = { auto: shadowMap.autoUpdate, due: shadowMap.needsUpdate };
        // (No shadow map drawn again: the scene's call has drawn what was due.)
        shadowMap.autoUpdate = false;
        shadowMap.needsUpdate = false;
        try {
            stage.children = [...this.lightsOfView(), ...sheered];
            renderer.render(stage, camera);
        } finally {
            stage.children = [];
            shadowMap.autoUpdate = kept.auto;
            shadowMap.needsUpdate = kept.due;
        }
    }

    /**
     * The view's own lights as the scene's call gathers them (three takes a
     * light it reaches through shown objects, on a layer its camera sees):
     * each a stand-in with no children of its own — what hangs under one is
     * drawn by the scene's call — looked for once each time rooms are shown
     * (show), those under a hidden object left out at each call.
     */
    lightsOfView() {
        if (!this.viewLights) {
            const lights = [];
            this.scene.traverse((object) => {
                if (object.isLight) lights.push(Object.assign(Object.create(object), { children: [] }));
            });
            this.viewLights = lights;
        }
        return this.viewLights.filter((light) => {
            for (let object = Object.getPrototypeOf(light).parent; object; object = object.parent) if (!object.visible) return false;
            return true;
        });
    }

    /**
     * The room's own glass in the two pictures that tell the ambient
     * occlusion where to ease off behind what is seen through
     * (PostProcessing.drawTransparency): each is a render of the scene
     * through the view's own camera, which does not see the layer the
     * room's glass is on — so it is drawn after each, into the same picture,
     * by a call of the room's, with a material that says how see-through
     * it is and nothing else (veilOf). (Whatever is not for that picture is
     * hidden meanwhile, the room's too.) Without it the occlusion behind a
     * shower's screen was drawn at full strength: the tiles in it three
     * levels darker than a view lit live has them, a quarter of them by
     * more than eight.
     */
    veil(renderer, camera) {
        if (!this.drawn || this.panes <= 0 || camera !== this.experience.camera.activeCamera) return;
        const ao = this.renderer.post?.ao;
        const target = renderer.getRenderTarget();
        if (!ao || !target || (target !== ao.transparencyRenderTargetDWFalse && target !== ao.transparencyRenderTargetDWTrue)) return;
        // Those of the room's that are for this picture (the others are hidden for its length), each drawn with what says how see-through it is (veilOf).
        const drawn = [];
        for (const was of this.held.values()) {
            const object = was.standIn ?? was.mesh;
            if (!was.veil || !object.visible) continue;
            drawn.push([object, object.material]);
            // (As see-through as it is now: a window's pane is made darker or clearer as the camera goes out or in — Sky.glaze.)
            const lit = [].concat(object.material);
            [].concat(was.veil).forEach((veil, k) => (veil.opacity = lit[k]?.opacity ?? veil.opacity));
            object.material = was.veil;
        }
        if (!drawn.length) return;
        const clear = renderer.autoClear;
        renderer.autoClear = false;
        try {
            this.roomCall(renderer, this.sight(camera, this.rig.glassEye), this.rig.last);
        } catch (error) {
            this.fail(error);
        } finally {
            renderer.autoClear = clear;
            for (const [object, material] of drawn) object.material = material;
        }
    }

    /** The renderer and the scene clearing as they did before the room's call (before). */
    restore() {
        this.renderer.renderer.autoClear = this.kept.clear;
        this.scene.background = this.kept.background;
        // (Sheer curtains left out of a frame that threw before they were drawn: shown again.)
        for (const mesh of this.sheered ?? []) mesh.visible = true;
        this.sheered = null;
        this.phase = 0;
    }

    /**
     * A call of the room's threw: said once, and the live room turned off
     * for its visitor (RoomLight.end) once the frame is done — thrown on,
     * it took the scene's own frame with it, and the next, and the next.
     */
    fail(error) {
        if (this.failed) return;
        this.failed = true;
        console.warn("The room could not be drawn live", error);
        queueMicrotask(() => {
            this.failed = false;
            this.world.roomLight?.end("The live room could not be drawn here, and was turned off.");
        });
    }

    /**
     * The room's call and the scene's, one on the other, through any other
     * camera: a face of the room probe. `set`, for rooms staged and not
     * shown yet (capture): drawn with them in the room's call too, for the
     * length of the face.
     */
    drawBoth(renderer, camera, sets = null) {
        // (In the bake's light, what reflects a studio of its own reflects it as far as its light goes, into a face: RoomBakeLight.)
        if (this.bake) this.bake.capturing = true;
        try {
            this.drawFace(renderer, camera, sets);
        } finally {
            if (this.bake) this.bake.capturing = false;
        }
    }

    /** That (drawBoth). */
    drawFace(renderer, camera, sets) {
        const scene = this.scene;
        const mask = camera.layers.mask;
        const clear = renderer.autoClear;
        const background = scene.background;
        const staged = (sets ?? []).filter((set) => !this.showing.has(set.key) && this.staged.get(set.key) === set);
        // (A face of the probe is the room lit by the sky's share, not by a probe: Realism's RoomProbe has taken the shown rooms' off; the staged rooms' too.)
        const sky = this.world.sky?.current ? this.world.sky : null;
        const taken = [];
        if (staged.length) {
            for (const set of staged) this.showing.set(set.key, set);
            this.arrange();
            // What hangs in their walls drawn as it will be with them — a leaf left to the bake's probes, brought up
            // as the bake's rooms are, was an orange lamp in a dim bedroom's probe (seven levels on its far wall).
            for (const root of staged.includes(this.job?.set) ? this.job.fixed ?? [] : []) {
                if (this.roots.has(root)) continue;
                this.apply(root, this.plan(root));
                taken.push(root);
            }
            if (taken.length) this.follow();
            const lit = { indoorMaterials: new Set(), reflectiveMaterials: new Set() };
            if (sky) {
                // (All of it lit by the sky's share and reflecting what it does without a probe — its glass too, which
                // else kept whatever it last reflected: three levels of a living room's light either way.)
                const meshes = staged.flatMap((set) => this.meshesOf(set));
                for (const root of taken) for (const was of this.roots.get(root) ?? []) meshes.push(was.standIn ?? was.mesh);
                sky.share({ traverse: (visit) => meshes.forEach(visit) }, lit);
                sky.glaze(lit);
                sky.light(lit, null);
            }
        }
        const unseen = this.undrawn();
        // Drawn into a picture of the kind the view itself is drawn into, then copied to the probe's face: a GPU
        // makes a program's pipeline for each kind of picture it draws into, and the first face drawn straight into
        // the probe's own made one for every program in sight — 0.6 s.
        const face = { target: renderer.getRenderTarget(), index: renderer.getActiveCubeFace() };
        const through = this.through(face.target);
        try {
            if (through) renderer.setRenderTarget(through);
            // (A call of the room's works no matrix out — standIn: a lamp handed to another fitting since the last frame
            // of the view would light this face from where it hung.)
            scene.updateMatrixWorld();
            camera.layers.set(ROOM_LAYER);
            this.roomCall(renderer, camera);
            camera.layers.mask = mask;
            renderer.autoClear = false;
            if (background?.isColor) scene.background = null;
            // (Off every layer, not hidden: what hangs under it — a leaf's pane of glass — is still drawn.)
            for (const object of unseen) {
                object.userData.masked = object.layers.mask;
                object.layers.mask = 0;
            }
            renderer.render(scene, camera);
            // ...and what is seen through of the room's own, over both.
            if (this.panes > 0) {
                camera.layers.set(GLASS_LAYER);
                this.roomCall(renderer, camera, this.rig.last);
            }
        } finally {
            for (const object of unseen) {
                if (object.userData.masked === undefined) continue;
                object.layers.mask = object.userData.masked;
                delete object.userData.masked;
            }
            camera.layers.mask = mask;
            renderer.autoClear = clear;
            scene.background = background;
            if (through) {
                renderer.setRenderTarget(face.target, face.index);
                this.copier.material.uniforms.map.value = through.texture;
                this.copier.material.uniforms.texel.value.set(1 / through.width, 1 / through.height);
                renderer.render(this.copier, this.copier.camera);
            }
            if (staged.length) {
                for (const root of taken) this.giveBack(root);
                for (const set of staged) this.showing.delete(set.key);
                this.arrange();
                // (What it shares with the rooms shown is lit by their probe again.)
                this.relit();
            }
        }
    }

    dispose() {
        this.disposed = true;
        this.hide();
        if (this.onSwitched) this.world.switches?.off("change", this.onSwitched);
        const rig = this.rig;
        if (!rig) return;
        this.release();
        rig.pmrem?.dispose();
        if (this.copier) {
            this.copier.children[0].geometry.dispose();
            this.copier.material.dispose();
        }
        rig.pool.dispose();
        rig.glow?.dispose();
        rig.bulbs.dispose();
        this.bake?.dispose();
        this.scene.remove(rig.group, rig.movers, rig.sun, rig.sun.target);
        rig.sun.dispose();
        for (const light of [rig.ambient, rig.hemisphere]) {
            if (!light) continue;
            this.scene.remove(light);
            light.dispose();
        }
        for (const proxy of rig.casters.children) {
            // (Its vertices are the house's own, or the runtime file's.)
            if (proxy.geometry === proxy.userData.source.geometry) continue;
            proxy.geometry.deleteAttribute("position");
            // (An index of the runs that cast is its own, and goes with it; all of the mesh's is the mesh's.)
            if (proxy.geometry.index === proxy.userData.source.geometry.index) proxy.geometry.setIndex(null);
            proxy.geometry.dispose();
        }
        this.rig = null;
    }
}

/**
 * A stand-in for the scene to hand three for a call of the room's: the
 * scene itself in everything it reads — its fog, its surroundings, how it
 * is cleared — but another object, so that three keeps the call's lights
 * and its list of what to draw apart from the scene's own (it keeps both by
 * the scene it is handed); with no hooks of its own, no matrix worked out
 * again, and for children only what the call draws (LiveRoom.own, set
 * before each). `own`: what else it has of its own in place of the scene's.
 */
function standIn(scene, own = {}) {
    return Object.assign(Object.create(scene), { onBeforeRender: none, onAfterRender: none, matrixWorldAutoUpdate: false, ...own });
}

/** An index of some runs of another's: `count` indices in all. */
function indexOf(index, runs, count) {
    const from = index.array;
    const array = new from.constructor(count);
    let at = 0;
    for (const run of runs) {
        array.set(from.subarray(run.start, run.start + run.count), at);
        at += run.count;
    }
    return new THREE.BufferAttribute(array, 1);
}

/**
 * What a bake's lightmap for a time of day holds on each room's own
 * surfaces with every switch off, red, green and blue, in the units of its
 * light probes (irradiance over π, as the lightmap is opened out for the
 * house: World/LightResolver.js): room id -> [r, g, b], the mean over the
 * texels of the room's part of the atlas (`lighting.zones`, its rectangle
 * from the foot of the picture) that hold any light — those between its
 * islands hold none. From the phone's copy where there is one (a quarter
 * of the texels; the rooms' means within 1–4% of the full size's on
 * Ladonia), each room's part opened out by its own curve where the bake
 * held it so (`rooms`, device.js roomLightmap), else the one-scale
 * lightmap's (reinhard, colour apart: "ycocg"). The garden's ("outside")
 * is not a room's. Null for a bake without zones, or one held otherwise.
 * Read in slices of SLICE ms, `pause` between them.
 *
 * @param {object} lighting  the published version's `lighting`
 * @param {string} variant
 * @param {() => Promise} pause
 * @returns {Promise<Map<string, number[]>|null>}
 */
async function readLightmapRooms(lighting, variant, pause) {
    const info = lighting?.variants?.[variant];
    if (!info || !lighting.zones || typeof createImageBitmap !== "function") return null;
    const rooms = roomLightmap(info);
    const source = rooms ?? info;
    const lumaURL = source.lightmapPhone ?? source.lightmap;
    const chromaURL = (source.lightmapPhone && source.chromaPhone) || source.chroma;
    if (!lumaURL || !chromaURL) return null;
    if (!rooms && (info.storage !== "ycocg" || info.encoding !== "reinhard" || !(info.scale > 0))) return null;
    const picture = async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
        const { width, height } = bitmap;
        const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        return { context, width, height };
    };
    const [luma, chroma] = await Promise.all([picture(lumaURL), picture(chromaURL)]);
    const fromSRGB = (e) => (e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** 2.4);
    const figures = new Map();
    let until = performance.now() + SLICE;
    for (const [id, rect] of Object.entries(lighting.zones)) {
        if (id === "outside" || !Array.isArray(rect)) continue;
        const curve = rooms ? rooms.zones?.[id] : null;
        if (rooms && !curve) continue;
        if (performance.now() > until) {
            await pause();
            until = performance.now() + SLICE;
        }
        // Its rectangle, from the foot of the picture (the atlas's v), in the picture's rows from the top.
        const x0 = Math.max(0, Math.floor(rect[0] * luma.width));
        const x1 = Math.min(luma.width, Math.ceil((rect[0] + rect[2]) * luma.width));
        const y0 = Math.max(0, Math.floor((1 - rect[1] - rect[3]) * luma.height));
        const y1 = Math.min(luma.height, Math.ceil((1 - rect[1]) * luma.height));
        if (x1 <= x0 || y1 <= y0) continue;
        const sx = chroma.width / luma.width;
        const sy = chroma.height / luma.height;
        const cx0 = Math.floor(x0 * sx);
        const cy0 = Math.floor(y0 * sy);
        const cw = Math.min(chroma.width, Math.floor((x1 - 1) * sx) + 1) - cx0;
        const ch = Math.min(chroma.height, Math.floor((y1 - 1) * sy) + 1) - cy0;
        const lumaTexels = luma.context.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const chromaTexels = chroma.context.getImageData(cx0, cy0, cw, ch).data;
        const [knee, top, stretch] = curve ?? [0, 0, 1];
        const span = curve ? Math.log2(1 + top / knee) : 0;
        const sum = [0, 0, 0];
        let count = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const Y = lumaTexels[((y - y0) * (x1 - x0) + (x - x0)) * 4] / 255;
                if (Y <= 0) continue;
                const at = ((Math.floor(y * sy) - cy0) * cw + (Math.floor(x * sx) - cx0)) * 4;
                const d0 = (chromaTexels[at] / 255 - 128 / 255) / (curve ? stretch : 1);
                const d1 = (chromaTexels[at + 1] / 255 - 128 / 255) / (curve ? stretch : 1);
                const t = Y - d1;
                for (let c = 0; c < 3; c++) {
                    const e = Math.min(1, Math.max(0, c === 0 ? t + d0 : c === 1 ? Y + d1 : t - d0));
                    if (curve) {
                        sum[c] += knee * (2 ** (e * span) - 1);
                    } else {
                        const l = fromSRGB(e);
                        sum[c] += (info.scale * l) / Math.max(1 - l, 1 / 65);
                    }
                }
                count++;
            }
        }
        if (count) figures.set(id, sum.map((value) => value / count));
    }
    return figures;
}

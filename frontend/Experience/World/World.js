import { EventEmitter } from "events";
import * as THREE from "three";

import Experience from "../Experience.js";
import SceneBuilder from "./SceneBuilder.js";
import Environment from "./Environment.js";
import Collision from "./Collision.js";
import Player from "./Player/Player.js";
import Interactables from "./Interactables.js";
import Whereabouts from "./Whereabouts.js";
import BirdView from "./BirdView.js";
import Switches from "./Switches.js";
import LiveLamps from "./LiveLamps.js";
import RoomLight from "./RoomLight.js";
import LiveSwitches from "./LiveSwitches.js";
import LampPool from "./LampPool.js";
import RoomGlow from "./RoomGlow.js";
import LiveBulbs from "./LiveBulbs.js";
import { distinguish, gatherLights, markBulbs } from "./Fittings.js";
import ProbeLight from "./ProbeLight.js";
import Scenery from "./Scenery.js";
import People from "./People.js";
import Seats from "./Seats.js";
import Screens from "./Screens.js";
import Water from "./Water.js";
import Vegetation from "./Vegetation/Vegetation.js";
import Flora from "./Flora/Flora.js";
import Sky from "./Sky.js";
import PlainLight from "./PlainLight.js";
import Scope from "./Scope.js";
import StandIns from "./StandIns.js";
import rays from "../Utils/rays.js";
import { QUALITY, chromaURL, doorStatesURL, lightingMode, lightmapURL, movingShadowsOnly, onQualityChange, roomLightAllowed, roomLightmap, sunMaskURL } from "../Utils/device.js";
import { loadBakedTexture } from "../Utils/bakedTexture.js";
import { groundGradient } from "../../../shared/vegetation.js";
import { hasLandscape } from "../../../shared/landscape.js";

/** Where the editor's realistic preview is kept, on or off, in this browser. */
const PREVIEW_KEY = "editor-preview";

export default class World extends EventEmitter {
    constructor() {
        super();

        this.experience = new Experience();
        this.resources = this.experience.resources;
        this.spec = this.experience.sceneSpec;

        // The editor is drawn under its plain light (World/PlainLight.js)
        // unless its walkthrough's realistic preview is on (setPreview): as
        // this browser last left it, or as the link asks. A public view is
        // always lit as it is.
        this.preview = !this.experience.publicView && previewWanted();
        this.realistic = this.experience.publicView || this.preview;
        this.held = 0;

        // What a ray can meet is indexed (Utils/rays.js), and the index looks
        // each wall and piece over before every ray; after anything that may
        // have changed one from within, it looks through them all.
        /** That index, for a test or a timing: `rays.cast(raycaster, roots)` against `raycaster.intersectObjects(roots, true)`, `rays.stats`. */
        this.rays = rays;
        for (const name of ["scene-edited", "finish-changed", "furniture-ready", "fittings-rebuilt", "scenery-ready", "bird-ready"]) {
            this.on(name, () => rays.touch());
        }
        // How much of the site the editor draws (World/Scope.js): the houses
        // and their yards alone, until asked for more. A public view draws
        // what its version has.
        this.scope = this.experience.publicView ? null : new Scope(this);

        // Stands in for an octree everywhere one was passed before: the
        // player and the car ask it the same questions.
        this.collision = new Collision();
        this.octree = this.collision;
        this.player = null;

        this.resources.on("ready", () => {
            if (this.player) return;
            // The preview as it is now: switched, perhaps, while the space loaded (setPreview).
            this.realistic = this.experience.publicView || this.preview;

            // A published version's runtime file stands in for building the house.
            const runtime = this.experience.publicView ? this.resources.items.publishedRuntime : null;
            this.sceneBuilder = new SceneBuilder(this.spec, { runtime });
            // What the visitor can act on — the doors, the furniture's doors and drawers, the lights, the cars — and
            // with which key, in either view (World/Interactables.js): what the crosshair and the prompt ask.
            this.interactables = new Interactables(this);
            // Which room the visitor is in, one answer for all who ask (World/Whereabouts.js): the room's name on
            // screen, the key that switches its lights (Q) and, over a bake, the room drawn live (RoomLight).
            this.whereabouts = new Whereabouts(this.sceneBuilder);
            this.environment = new Environment(this.spec);
            // The editor's own light, before the sky and the garden are made:
            // on, they are made under it.
            if (!this.experience.publicView) {
                this.plainLight = new PlainLight(this);
                this.plainLight.set(this.plain);
                // What it draws in place of the house and its furniture, in far fewer draws (World/StandIns.js).
                this.standIns = new StandIns(this);
            }
            this.player = new Player();
            // The garden is made now if it is drawn now: the editor's view
            // may leave the surroundings out (World/Scope.js), and makes it
            // when they are first shown.
            const garden = { planted: this.scope?.exterior ?? true };
            if (hasLandscape(this.spec)) {
                // A site of its own: its sky, lit live by day and at night,
                // and its trees, hedges and grasses (World/Flora).
                this.sky = new Sky(this, this.spec.landscape.sky || {});
                this.lighting = "day";
                this.vegetation = new Flora(this, garden);
                this.sky.ready.then(() => this.emit("lighting", "day"));
            } else {
                // The garden: grass on the lawns, trees on the bigger ones.
                this.vegetation = new Vegetation(this, garden);
            }
            this.scope?.apply();

            if (this.experience.publicView) {
                // Nothing will move but the doors, the car and the people, so
                // everything else is drawn merged once the furniture is in —
                // from the published snapshot when there is one. (The people
                // are made after the merge, outside the builder's root, so
                // nothing merged or batched ever holds them.)
                this.sceneBuilder.furnitureReady.then(() => {
                    const published = this.experience.published;
                    const snapshot = this.resources.items.publishedView;
                    const lighting = published?.lighting;
                    if (!snapshot) {
                        // The light fittings, found and their glass marked
                        // before the rest is merged round them.
                        const lights = gatherLights(this.sceneBuilder);
                        markBulbs(this.sceneBuilder, lights);
                        this.sceneBuilder.optimizeForViewing();
                        // What was merged, lit as a room's surfaces are.
                        if (this.sky?.current) this.sky.applyIndoor();
                        this.startLiveLights(lights);
                    } else {
                        // All of its light from the bake — or, asked for in
                        // the link to compare, the sun and the lamps live on
                        // top of the rest of it (Utils/device.js's lightingMode).
                        this.lightingMode = lighting ? lightingMode(lighting) : null;
                        const live = this.lightingMode === "live";
                        // Fully baked: nothing drawn live at all.
                        const still = this.lightingMode === "static";
                        // Drawn from the bake, as a computer is given it: what
                        // moves still shades the sun in the house, and the light
                        // probes light it, when the bake has them.
                        const shade = movingShadowsOnly(lighting);
                        const probes = Boolean(lighting?.probes) && !still;
                        const doors = !still;
                        // What is about to be copied, as it is without a room
                        // probe's light — a copy keeps the probe's map, which
                        // goes when the probe does — and, drawn from the bake,
                        // nothing else the live path took on (Realism.js).
                        this.sky?.useProbe(null);
                        // ...and without the rooms' night glow, which lit live they glow with one by one.
                        if (!lighting) this.sky?.glowIndoors(false);
                        if (lighting) this.experience.renderer.realism.releaseLive();
                        // ...and whether the room its visitor stands in may be drawn live over it, when they ask (World/RoomLight.js).
                        const room = Boolean(lighting) && roomLightAllowed(lighting);
                        this.sceneBuilder.usePublishedView(snapshot, lighting, { ...published.options, live, shade, probes, doors, room });
                        // Lit live, the copies drawn take the sky's light as the
                        // originals did, and the light fittings are switched
                        // live, as in the editor.
                        if (!lighting && this.sky?.current) this.sky.applyIndoor();
                        if (!lighting) {
                            // A version published before its fittings were
                            // listed: found in what was built from its spec.
                            const listed = published?.spec?.lights;
                            // (Named apart, if it was published before they were.)
                            const lights = listed?.length ? distinguish(listed.map((light) => ({ ...light }))) : gatherLights(this.sceneBuilder);
                            if (!listed) markBulbs(this.sceneBuilder, lights);
                            this.startLiveLights(lights);
                        }
                        if (lighting) {
                            // The room lights are in the lightmaps now.
                            if (this.sceneBuilder.lights) this.sceneBuilder.lights.visible = false;
                            this.environment.useBaked(lighting.view, { live: this.sceneBuilder.liveLight, shade, probes, still });
                            // Its light switches, when its fittings were baked apart.
                            if (lighting.switches?.length && lighting.variants) {
                                this.switches = new Switches(this.sceneBuilder, published);
                                this.switches.on("change", () => this.emit("switches", this.switches));
                                // Each light, and its switch on the wall, to point at.
                                const lights = distinguish((published.spec.lights || []).map((light) => ({ ...light }))).filter((light) => this.switches.byId.has(light.switch));
                                this.sceneBuilder.buildLightTargets(lights);
                                // Drawn from the bake: the one room the visitor is in drawn live, when they ask — off until then.
                                if (!this.sceneBuilder.liveLight) this.roomLight = new RoomLight(this, published);
                            }
                            // Lit live: the lamps that are on nearest the
                            // visitor, and when the shadows are drawn again.
                            // Drawn from the bake, only the sun's shadow of what moves.
                            if (this.sceneBuilder.liveLight) this.lamps = new LiveLamps(this);
                            else if (this.sceneBuilder.sunShade) this.lamps = new LiveLamps(this, { lamps: 0, sway: false });
                            // ...and the light probes that light the people and the car.
                            if (probes) this.loadProbes(lighting.probes, { sunFromProbes: !this.sceneBuilder.liveLight });
                            // How much of each room's light stays as its doors shut.
                            if (doors && lighting.doorStates) this.loadDoorStates(lighting.doorStates);
                            this.setLighting("day").then(() => {
                                if (this.switches) this.emit("switches-ready", this.switches);
                            });
                        }
                    }
                    // The people round the property, from the published spec's
                    // list (World/People.js): drawn live over the view, lit
                    // live or baked, never part of what was merged, published
                    // or baked — they move. Fewer on a phone (the quality
                    // step's `people`); none downloaded while this visitor
                    // keeps them hidden (the "people" scenery).
                    this.people = new People(this, { shown: !this.experience.hiddenScenery.has("people") });
                    // Where the visitor can sit (World/Seats.js): the published spec's seats, by the people's clip.
                    this.seats = new Seats(this);
                    // The televisions, to switch on (World/Screens.js): the published spec's, nothing drawn until one is.
                    this.screens = new Screens(this);
                    // The taps and the showers, to turn on (World/Water.js): where the runtime file's holders say they
                    // are — none in a version published before the furniture's models said so — nothing drawn until one runs.
                    this.water = new Water(this, { quality: () => QUALITY, onQualityChange });
                    // The scenery its visitor can hide, as they last left it.
                    this.scenery = new Scenery(this, this.experience.hiddenScenery);
                    this.emit("scenery-ready", this.scenery);
                    // From opening the page, for the ?stats readout.
                    this.readyIn = { ms: performance.now(), built: !runtime };
                    // Each floor from above, once its meshes say which floor they are.
                    this.birdView = new BirdView(this, published?.birdView, published?.levels);
                    this.experience.camera.birdView = this.birdView;
                    this.emit("bird-ready", this.birdView.floors.length);
                });
            } else {
                // The editor is a chunk of its own, so a public view never
                // downloads it.
                import("../Editor/Editor.js").then(({ default: Editor }) => {
                    if (!this.disposed) this.editor = new Editor();
                });
                // Edit mode is always drawn under the plain light; the
                // walkthrough it goes back to, as the preview is.
                this.on("mode", () => this.relight());
                // The people round the property, from the spec's own list
                // (World/People.js): the editor's to move, add and take away.
                this.people = new People(this);
                // Where the visitor can sit (World/Seats.js), as the furniture is placed now.
                this.seats = new Seats(this);
                // The televisions, to switch on in the walkthrough (World/Screens.js), each following its piece.
                this.screens = new Screens(this);
                // The taps and the showers, to turn on in the walkthrough (World/Water.js), as each piece's model
                // says where they are; their water goes with a piece moved while it runs.
                this.water = new Water(this, { quality: () => QUALITY, onQualityChange });
                // Its light fittings switched live, once the furniture — its
                // lamps among it — is in; found again after every edit.
                this.on("furniture-ready", () => {
                    if (this.liveLights) return this.refreshLiveLights();
                    const lights = gatherLights(this.sceneBuilder);
                    markBulbs(this.sceneBuilder, lights);
                    this.startLiveLights(lights);
                });
                // Built again while a door or window is dragged along its
                // wall: their glass lit as its switch is, at every step.
                this.on("fittings-rebuilt", (group) => {
                    if (!this.liveLights) return;
                    markBulbs(this.sceneBuilder, []);
                    this.bulbs.collect(group);
                });
                this.on("scene-edited", () => {
                    // What was built again lit as its switch is at once
                    // (a ceiling light's glass, a lamp's shade); the
                    // fittings found again once the edits pause.
                    if (this.liveLights) {
                        markBulbs(this.sceneBuilder, this.switches.lights);
                        this.bulbs.collect(this.experience.scene);
                    }
                    clearTimeout(this.lightsTimer);
                    this.lightsTimer = setTimeout(() => this.refreshLiveLights(), 400);
                });
            }

            this.player.setInteractionObjects(this.sceneBuilder.getInteractiveObjects());

            // Enough to stop the third-person boom pushing through the
            // structure, without raycasting every teacup.
            this.experience.camera.setCollisionObjects(
                this.sceneBuilder.getCameraObstacles()
            );
            // Without the house built, the walls are only in the collision tree.
            if (runtime) this.experience.camera.setCollisionTree(this.collision);

            this.emit("ready", {
                rooms: this.spec.rooms,
                spawns: this.spec.spawns,
            });
        });
    }

    /** Teleport the visitor to a named spawn point. */
    goToSpawn(index) {
        if (!this.player) return;
        const spawn = this.spec.spawns[index];
        if (spawn) this.player.teleport(spawn);
    }

    /** Drop the visitor into the middle of a room by id. */
    goToRoom(roomId) {
        if (!this.player) return;
        const room = this.spec.rooms.find((r) => r.id === roomId);
        if (!room) return;

        const centre = room.polygon.reduce(
            (acc, [x, z]) => [acc[0] + x, acc[1] + z],
            [0, 0]
        );

        this.player.teleport({
            position: [
                centre[0] / room.polygon.length,
                room.elevation,
                centre[1] / room.polygon.length,
            ],
            yaw: 0,
        });
    }

    /**
     * Day or night, in a public view whose lighting has been baked. The
     * night lightmap is only downloaded the first time it is asked for;
     * so are the lights that come on with it (Switches), and the two
     * change together.
     *
     * One change at a time (inTurn): asked for while another is still
     * loading, it waits for that one.
     *
     * @returns {Promise<boolean>} whether it changed
     */
    setLighting(variant) {
        return this.inTurn(() => this.drawLighting(variant));
    }

    /**
     * The time of day the house is lit for: `lighting` — but in a view
     * drawn from its bake, for the frame or two of a change in which the
     * bake's light is already the next one's while the sky and the sun are
     * still coming (drawLighting), the next one. What a room is exposed
     * for (Realism) and what moves in it is lit by (ProbeLight) go by this:
     * by `lighting`, a lamplit night was drawn for those frames at the
     * day's exposure, seven times too bright, and a day at the night's.
     */
    get houseLighting() {
        return this.houseVariant ?? this.lighting;
    }

    /**
     * One change of the light at a time, in the order asked for: the time
     * of day (setLighting) and the editor's change between its plain light
     * and the realistic preview (relight). Each waits on a sky, lightmaps
     * or switches to load, and two at once each finished half of the
     * other's: a night's lamps under the day's sky and sun, the night asked
     * for lost.
     *
     * @param {Function} change  what to do, once all that was asked before it is done or has failed
     * @returns {Promise} what it returns
     */
    inTurn(change) {
        const before = this.turns ?? Promise.resolve();
        let done;
        this.turns = new Promise((resolve) => (done = resolve));
        return before.then(change).finally(done);
    }

    /** The time of day drawn (setLighting), in its turn. */
    async drawLighting(variant) {
        const info = this.experience.published?.lighting?.variants?.[variant];
        const baked = this.sceneBuilder?.baked;
        if (!baked && this.sky) return this.setSkyLighting(variant);
        if (!baked && this.liveLights) return this.setLiveLighting(variant);
        if (!info || !baked) return false;
        // Lit live, the house takes all of its light but the sun's straight
        // light from the bake: a lightmap of its own, its thin faces' light
        // and its doors' without it.
        const live = this.sceneBuilder.liveLight && info.indirect;
        // Where the house's light is resolved into one lightmap, and the
        // bake wrote the variant's with each room's part held its own way
        // (blender/lib/lightzones.py), that one in the other's place.
        const rooms = this.sceneBuilder.resolver ? roomLightmap(info) : null;
        this.lightmaps ??= new Map();
        if (!this.lightmaps.has(variant)) {
            // Its brightness, and its colour when that is apart from it.
            const load = (name, url) => {
                const preloaded = this.resources.items[name];
                if (preloaded) return Promise.resolve(preloaded);
                return url ? loadBakedTexture(url) : Promise.resolve(null);
            };
            const own = rooms ? ":rooms" : "";
            this.lightmaps.set(
                variant,
                Promise.all([
                    load(`lightmap:${variant}${own}`, lightmapURL(rooms ?? info)),
                    load(`lightmap:${variant}${own}:chroma`, chromaURL(rooms ?? info)),
                    live ? load(`lightmap:${variant}:indirect`, lightmapURL(info.indirect)) : null,
                    live ? load(`lightmap:${variant}:indirect:chroma`, chromaURL(info.indirect)) : null,
                ])
            );
        }
        // Under a site's own sky, its picture and light for the variant
        // too, so that the light, the sky and the sun change together.
        const sky = this.sky?.prepare(variant);
        // Drawn from the bake, the sun's share of the light, for what moves to shade.
        const shade = this.sceneBuilder.sunShade && info.sun?.mask;
        if (shade) {
            this.sunMasks ??= new Map();
            if (!this.sunMasks.has(variant)) {
                // Without it, what moves shades nothing; the light is as baked.
                const mask = loadBakedTexture(sunMaskURL(info.sun)).catch((error) => {
                    console.warn("The sun's mask did not load", error);
                    return null;
                });
                this.sunMasks.set(variant, mask);
            }
        }
        // The view's first light is drawn as soon as its lightmap is here: of the switches, only those whose light
        // is seen from where the visitor starts are waited for (Switches.prepare) — by day the others are the rooms
        // without daylight, all over the house, a hundred small files — and the sun's mask not at all: both kept the
        // first frame back a third of a second and more. The others' light comes once that frame is drawn; the mask
        // when it has loaded, and until then what moves shades nothing.
        const first = !this.houseLight;
        const from = first && this.switches ? this.standing() : null;
        // After that, all of it here before any of it is shown: the lightmap, the sun's mask and the switches go in
        // together, in one frame. (The mask was waited for after the lightmap was in: a first night drew the night's
        // house under the day's switches — dark — for the frames it took to come.)
        const [[texture, chroma, softTexture, softChroma], , , mask] = await Promise.all([
            this.lightmaps.get(variant),
            this.switches?.prepare(variant, from ? { from } : undefined),
            sky,
            shade && !first ? this.sunMasks.get(variant) : null,
        ]);
        // Kept, for the house to go from one to the other as the view from above opens and shuts (lightFromAbove).
        this.houseLight = { info, texture, chroma, softTexture, softChroma, rooms: rooms?.zones ?? null };
        // From here the house is lit for `variant` (houseLighting), a frame or two before the sky and the sun are.
        this.houseVariant = variant;
        this.lightHouse();
        if (mask) this.sceneBuilder.setSunShade(mask, info.sun);
        // (A first light's mask, whenever it comes — unless another time of day has been shown meanwhile, with its own.)
        if (shade && first) {
            this.sunMasks.get(variant).then((late) => {
                if (late && this.houseVariant === variant && !this.disposed) this.sceneBuilder.setSunShade(late, info.sun);
            });
        }
        this.switches?.useVariant(variant);
        // (The switches a first light did not wait for, once a frame has been drawn with it.)
        if (from) this.experience.renderer.nextFrame().then(() => this.switches?.bringIn());
        // Under a site's own sky, the sky first — its picture, its haze, its
        // light on what is drawn live, the bloom — then the bake's light
        // over it (Environment.setVariant): whichever came last would
        // otherwise set the sun and the exposure.
        if (this.sky) {
            try {
                await this.sky.setVariant(variant);
            } catch (error) {
                // Without it, the bake's light and the preset's sky.
                console.warn("The sky did not load", error);
            }
        }
        this.environment.setVariant(variant, live || shade ? info.sun : null);
        // The grass lit by the lawn under it, the trees by the bake's sun and sky.
        this.vegetation?.useGroundLight(this.sceneBuilder, info, texture, chroma);
        this.vegetation?.setLight(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /** Where the visitor stands: the room they are in (null out of every room) and the point, as [x, y, z]. */
    standing() {
        const feet = this.player.player.collider.start;
        return { room: this.sceneBuilder.roomAt(feet.x, feet.y, feet.z)?.id ?? null, point: [feet.x, feet.y, feet.z] };
    }

    /**
     * The lightmap of the time of day shown, on the house. Lit live, the
     * one without the sun's straight light, which the live sun gives it —
     * but from above (lightFromAbove) the one with all of the bake's light,
     * as a view drawn from the bake has it.
     */
    lightHouse() {
        if (!this.houseLight) return;
        const { info, texture, chroma, softTexture, softChroma, rooms } = this.houseLight;
        if (this.sceneBuilder.liveLight && info.indirect && !this.above) {
            this.sceneBuilder.setLightingVariant(softTexture, { ...info, ...info.indirect }, softChroma);
            // The grass still reads all of the ground's light, sun and all.
            this.sceneBuilder.prepareLightmaps(texture, info, chroma);
        } else {
            this.sceneBuilder.setLightingVariant(texture, info, chroma, rooms);
        }
    }

    /**
     * The view from above (World/BirdView.js) is drawn from the bake alone,
     * with nothing live, whatever the walkthrough is lit by — which comes
     * back, as it was, when the view is left:
     *
     *   - no shadow map is drawn again while it is open (Realism.js's
     *     holdShadows), and nothing a floor's view takes away is kept for
     *     its shadow;
     *   - drawn from the bake ("baked"), what moves stops shading the sun in
     *     the house (SceneBuilder.holdSunShade), and a room lit live at its
     *     visitor's wish is the bake's again (RoomLight.hold);
     *   - lit live over a bake (`?lighting=live`), the house draws the
     *     lightmap with all of the bake's light in it and takes none of the
     *     live sun's or lamps' (SceneBuilder.setDirectLight), the lamps go
     *     out and their switches' light is all the bake's (LiveLamps.hold).
     *     The sun goes on lighting what moves and the garden, as it does in
     *     every baked view;
     *   - a version that was not baked has no bake to draw from: its sun is
     *     left unshadowed and its lamps unlit (World/LampPool.js) — flat,
     *     and cheap; its lit rooms still glow (World/RoomGlow.js);
     *   - in any of them, a car's headlamps throw the pool of light painted
     *     on the road that a view drawn from the bake has, never a live
     *     spotlight (CarLights.hold) — driven from above as well.
     */
    lightFromAbove(on) {
        on = Boolean(on);
        if (on === Boolean(this.above)) return;
        this.above = on;
        const builder = this.sceneBuilder;
        const live = Boolean(builder.liveLight);
        // Lit live over a bake, the sun's map — of the whole house, every
        // floor in it, as it was last drawn — goes on shading what moves
        // and the garden; any other shades nothing meanwhile.
        this.experience.renderer.realism.holdShadows(on, { keep: live });
        this.lamps?.hold(on);
        this.roomLight?.hold(on);
        builder.holdSunShade(on);
        for (const car of builder.cars ?? []) car.lights?.hold(on);
        if (live) {
            builder.setDirectLight(!on);
            this.lightHouse();
        }
    }

    /**
     * Day or night under a site's own sky, lit live (World/Sky.js): the
     * sky and the sun, and with them the garden — its lights, the pool's
     * glow, the windows (World/Flora).
     */
    async setSkyLighting(variant) {
        await this.sky.show(variant);
        if (this.liveLights) {
            await this.switches.prepare(variant);
            this.switches.useVariant(variant);
        }
        this.vegetation?.setLight?.(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /**
     * The light fittings of a view lit live — the editor, its walkthrough,
     * a version published without its light baked — switched on and off
     * live (World/LiveSwitches.js): the few nearest that are on as live
     * lights (LampPool), every lit room glowing (RoomGlow), the fittings'
     * glass and bulbs (LiveBulbs). The rooms' old always-on fill lights go;
     * a space that had them (one without a sky of its own) starts with its
     * lights on by day, so it is drawn as before. The switches' state is the
     * visitor's: never part of the scene, never saved.
     *
     * Under the editor's plain light (World/PlainLight.js) the switches are
     * as much a state to set — the panel, the bulb button, a click on a
     * light — and show in the fittings' glass; the live lights and the glow
     * are made when its realistic preview first draws (relight).
     *
     * @param {object[]} lights  the fittings, as Fittings.js's gatherLights gives them
     */
    startLiveLights(lights) {
        if (this.liveLights || this.disposed) return;
        // A public view with nothing to switch keeps its rooms' fill lights.
        if (this.experience.publicView && !lights.length) return;
        const builder = this.sceneBuilder;
        if (builder.lights) builder.lights.visible = false;
        const published = this.experience.published;
        this.liveLights = true;
        this.switches = new LiveSwitches(builder.spec, lights, { levels: published?.levels, dayOn: !this.sky, daylight: this.daylit });
        this.switches.on("change", () => {
            // A room's light probe (Realism.js) is captured again once the
            // lights have faded to how they are now (update).
            this.probeStale = true;
            this.emit("switches", this.switches);
        });
        builder.buildLightTargets(lights);
        // Every room glowing at night, if night came before the switches did:
        // from now on only the rooms whose lights are on.
        this.sky?.glowIndoors(false);
        try {
            if (!this.plain) this.startLamps();
            this.bulbs = new LiveBulbs(this, this.switches);
        } catch (error) {
            this.stopLiveLights(error);
            return;
        }
        // Day or night as the view is now — a space without a sky of its
        // own had none until now, and starts by day.
        this.lighting ??= "day";
        this.switches.useVariant(this.lighting);
        if (!this.sky) this.emit("lighting", this.lighting);
        this.switchesKey = switchesKey(this.switches);
        this.emit("switches-ready", this.switches);
    }

    /** What only a view lit live draws of its switches: every lit room glowing, the few lights nearest. */
    startLamps() {
        this.roomGlow = new RoomGlow(this, this.switches);
        this.lampPool = new LampPool(this, this.switches);
    }

    /** The light switches given up, for the rooms' old fill lights: rather those than none at all. */
    stopLiveLights(error) {
        console.error("The light switches could not start; the rooms keep their fill lights.", error);
        this.lampPool?.dispose();
        this.roomGlow?.dispose();
        this.bulbs?.dispose();
        this.roomGlow = this.lampPool = this.bulbs = null;
        this.switches = null;
        this.liveLights = false;
        if (this.sceneBuilder.lights) this.sceneBuilder.lights.visible = true;
    }

    /**
     * The light fittings again, after an edit: a lamp moved, a door that
     * a switch stands by, a room — the switches keep their state. Under the
     * editor's plain light the rooms' glow and the lamps' shadows wait for
     * the realistic preview (relight).
     */
    refreshLiveLights() {
        if (!this.liveLights || this.disposed) return;
        const builder = this.sceneBuilder;
        const lights = gatherLights(builder);
        markBulbs(builder, lights);
        this.switches.setLights(builder.spec, lights);
        builder.buildLightTargets(lights);
        if (this.plain) {
            this.lampsStale = Boolean(this.roomGlow);
        } else {
            this.roomGlow.rebuild(builder.spec);
            this.roomGlow.applyTo(this.experience.scene);
        }
        this.bulbs.collect(this.experience.scene);
        // (A lamp on another switch now wears that switch's glass: what stands in for it looks again, World/StandIns.js.)
        this.standIns?.hear();
        if (!this.plain) this.lampPool.redrawAll();
        // The lists drawn again only if the switches are not the ones they list.
        const key = switchesKey(this.switches);
        if (key === this.switchesKey) return;
        this.switchesKey = key;
        this.emit("switches-ready", this.switches);
    }

    /**
     * Whether the editor's view is drawn under its plain light
     * (World/PlainLight.js) now: its edit mode always, its walkthrough
     * unless the realistic preview is on. Never a public view.
     */
    get plain() {
        return !this.realistic;
    }

    /**
     * The realistic preview of the editor's walkthrough, on or off: on, the
     * walkthrough is drawn as a visitor will see it lit live — the sun and
     * its shadows, the lamps, the lit rooms' glow, the room probe, the
     * post-processing — and as slowly; off, under the plain light, as edit
     * mode always is. Kept in this browser unless `remember` is false.
     *
     * @returns {Promise} once it is drawn so (relight)
     */
    setPreview(on, { remember = true } = {}) {
        if (this.experience.publicView) return Promise.resolve();
        this.preview = Boolean(on);
        if (remember) rememberPreview(this.preview);
        this.emit("preview", this.preview);
        return this.relight();
    }

    /**
     * The editor's light brought to what it should be now: plain in edit
     * mode, and in the walkthrough unless the realistic preview is on;
     * realistic for as long as a publish holds it so (holdRealistic). Going
     * over to realistic, what only that draws is made if it never was — the
     * lamps' live lights and the rooms' glow here; the sun's shadow map, the
     * room probe and the post-processing by its first frame — and what
     * waited for it catches up.
     *
     * @returns {Promise} once the time of day is drawn as it should be
     */
    relight() {
        if (!this.plainLight) return Promise.resolve();
        if (this.realisticWanted === this.realistic) return this.relit ?? Promise.resolve();
        // To the plain light at once: all it shows is loaded already. To
        // realistic in its turn, after whatever time of day is still on its
        // way (inTurn) — and only once the sky's light for the time of day
        // is in: the dusk's is no more than a picture until a night is
        // first drawn realistically, and the lights swapped before it came
        // were drawn for a few frames under no sky of theirs, every shader
        // built once for that and once more for the night.
        const plain = !this.realisticWanted;
        if (plain) this.switchLight(false);
        this.relit = this.inTurn(async () => {
            if (!plain) {
                // Asked for twice, or taken back meanwhile: nothing to do.
                if (!this.realisticWanted || this.realistic) return;
                if (this.sky) await this.sky.prepare(this.lighting ?? "day");
                if (!this.realisticWanted || this.realistic) return;
                this.switchLight(true);
            }
            // The time of day as it is now drawn — whichever was last asked
            // for, by now. Without a sky of its own, only if it has ever
            // been changed: the preset's day is as built.
            if (this.sky) await this.setSkyLighting(this.lighting ?? "day");
            else if (this.liveLights && this.environment.variant) await this.setLiveLighting(this.lighting);
        }).catch((error) => console.warn("The time of day could not be drawn again", error));
        return this.relit;
    }

    /** Whether the editor's view is to be lit as a visitor will see it now (relight). */
    get realisticWanted() {
        return this.held > 0 || (this.preview && !this.editor?.active);
    }

    /**
     * Whether a view lit live is lit as a visitor sees it, so that a room
     * daylight does not reach starts the day with its light on
     * (World/LiveSwitches.js's setDaylight): a public view always; the
     * editor under its realistic preview — not under its plain light, which
     * lights every room alike, nor while a publish holds the scene realistic
     * (holdRealistic), which takes the fittings' glass as it is: unlit by
     * day, as it always was.
     */
    get daylit() {
        return this.realistic && this.held === 0;
    }

    /** The editor's light swapped, plain for realistic or back (relight): the lights, what is drawn, the lamps and the rooms' glow. */
    switchLight(realistic) {
        this.realistic = realistic;
        this.plainLight.set(!realistic);
        // Lit as a visitor will see it — the preview, a publish — the scene is drawn, and read, as it was built; the
        // stand-ins come back with the plain light's next frame (World/StandIns.js).
        if (realistic) this.standIns?.setActive(false);
        if (this.liveLights) this.switches.setDaylight(this.daylit);
        // What the view's scope leaves out is the plain view's to leave out:
        // lit as a visitor will see it, everything is drawn (World/Scope.js)
        // — the garden made, if it never was, before the rooms' glow goes
        // into the shaders there are.
        this.scope.apply();
        this.emit("scope", this.scope.current);
        if (realistic && this.liveLights) {
            try {
                if (!this.roomGlow) {
                    this.startLamps();
                } else if (this.lampsStale) {
                    // Edited under the plain light: the rooms as they are now, the lamps' shadows again.
                    this.roomGlow.rebuild(this.sceneBuilder.spec);
                    this.lampPool.redrawAll();
                }
                this.lampsStale = false;
            } catch (error) {
                this.stopLiveLights(error);
            }
        }
        this.roomGlow?.setShown(realistic);
    }

    /**
     * The scene lit as a visitor will see it — as the realistic preview
     * draws it — whatever the editor is showing, for a publish to take its
     * snapshot and its materials from (Publish/PublishPanel.js): what it
     * took before the editor had a plain light — and all of it drawn,
     * whatever the view's scope leaves out (World/Scope.js): a snapshot
     * takes only what is. Left as a frame of it leaves things: the windows
     * as the camera sees them, a room's light captured.
     *
     * Held from under the plain light, none of it is drawn meanwhile — the
     * view stands still until it is let go: a publish takes the scene's
     * state, not its frames, and one frame of it would have every shader
     * built again for the sun and the lamps, and the sun's shadow map, the
     * room probe and the post-processing made, all to be kept for nothing.
     *
     * @returns {Promise<Function>} what gives the editor its own light back
     */
    async holdRealistic() {
        const experience = this.experience;
        const undrawn = this.plain && !experience.suspended;
        if (undrawn) experience.suspended = true;
        this.held++;
        if (this.liveLights) this.switches.setDaylight(this.daylit);
        try {
            await this.relight();
            const realism = experience.renderer.realism;
            if (undrawn) realism.lookThroughGlass();
            else realism.settle();
        } catch (error) {
            // Published as it is lit now, rather than not at all.
            console.warn("The realistic light did not come up for the publish", error);
        }
        // Read as it was built whatever became of the light (relight keeps a sky's failure to itself, and the
        // plain light with it): a mesh a stand-in draws is off the layer a snapshot and a merge take (StaticBatcher's
        // canMerge). Nothing is drawn while the scene is held from under the plain light; the stand-ins are back
        // with its next frame.
        this.standIns?.setActive(false);
        let held = true;
        return () => {
            if (!held) return Promise.resolve();
            held = false;
            this.held--;
            if (this.liveLights) this.switches.setDaylight(this.daylit);
            const relit = this.relight();
            // The surroundings as they should be now, were the light left as
            // it is: the garden, which a publish alone does not have made,
            // if the realistic preview came on meanwhile.
            this.scope?.apply();
            if (undrawn) experience.suspended = false;
            return relit;
        };
    }

    /**
     * Day or night in a view lit live without a sky of its own: the
     * preset's day, or the night's sky and moon (Environment), each with its
     * switches as they were left.
     */
    async setLiveLighting(variant) {
        this.environment.setLiveVariant(variant);
        await this.switches.prepare(variant);
        this.switches.useVariant(variant);
        this.vegetation?.setLight?.(variant);
        this.lighting = variant;
        this.emit("lighting", variant);
        return true;
    }

    /**
     * The light probes of a view lit live (World/ProbeLight.js), once
     * their file is here; until then what moves keeps the sky's light.
     */
    async loadProbes(description, options = {}) {
        try {
            const response = await fetch(description.file);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const buffer = await response.arrayBuffer();
            if (!this.disposed) this.probes = new ProbeLight(this, description, buffer, options);
        } catch (error) {
            console.warn("The light probes did not load; the people and the car keep the sky's light.", error);
        }
    }

    /**
     * The doors' atlas (the bake's door states), once it is here: until then,
     * or without it, a shut door dims no room — its light is as baked, with
     * every door open.
     */
    async loadDoorStates(states) {
        try {
            const texture = await loadBakedTexture(doorStatesURL(states));
            if (!this.disposed) this.sceneBuilder.setDoorAtlas(texture);
        } catch (error) {
            console.warn("The doors' light did not load; a shut door dims no room.", error);
        }
    }

    /**
     * The bird's-eye view of a floor, on or off — at the wheel too, where it
     * goes between the camera behind the car and the view from above, and
     * the drive goes on in either (World/BirdView.js).
     */
    toggleBirdView() {
        if (!this.birdView) return false;
        return this.birdView.toggle();
    }

    /**
     * The garden's settings have changed — the editor's Garden panel has put
     * them in the spec — in one of its groups (shared/garden.js): how the
     * view is drawn, where the ground's gradient lies, and the garden, at
     * once; the hills, and whatever else has to be grown again, once the
     * change has `settled`.
     */
    gardenChanged(group, settled = true) {
        if (!this.sceneBuilder) return;
        // (Seen at once, whoever changed it: the editor draws only when something has changed, Pace.js.)
        this.experience.wake("garden");
        if (group === "colour") this.environment?.applyColour();
        if (group === "ground") this.sceneBuilder.materials.textures.setGradient(groundGradient(this.spec));
        if (settled && (group === "hills" || group === "neighbourhood")) {
            this.sceneBuilder.rebuildHills();
            this.environment?.fitShadows();
        }
        if (settled && group === "neighbourhood") {
            this.environment?.applyDome();
            // Its new haze, or none, is the realistic preview's: the plain light draws without one.
            this.plainLight?.keepFogOut(true);
        }
        this.vegetation?.settingsChanged(settled);
        // The hills, the neighbourhood and its dome made again: left out again, if the view's scope leaves them out.
        this.scope?.apply();
    }

    /** Swap a surface's finish and persist it to the spec. */
    setFinish(surfaceId, finishId) {
        const changed = this.sceneBuilder?.setFinish(surfaceId, finishId);
        if (changed) this.emit("finish-changed", { surfaceId, finishId });
        return changed;
    }

    update() {
        const delta = this.experience.time.delta;
        if (this.sceneBuilder) this.sceneBuilder.updateDoors(delta);
        // (What the visitor walks against, if an edit left it to be built again a slice a frame: a slice — or,
        // where the tree they have meanwhile is still of the pieces as they stood before the edit, all of it
        // now if they are on the move: a step taken against those is a step through the sofa.)
        if (this.sceneBuilder) this.sceneBuilder.stepCollision(undefined, { moving: Boolean(this.player?.underWay()) });
        if (this.player) this.player.update();
        // (After the visitor: a set switched on comes up, and plays while it is in sight of the view as it now is.)
        if (this.screens) this.screens.update(delta);
        if (this.vegetation) this.vegetation.update(delta);
        if (this.scope) this.scope.update();
        if (this.lamps) this.lamps.update(delta);
        // (After the doors and the visitor: which room is drawn live follows where they now are.)
        if (this.roomLight) this.roomLight.update(delta);
        // (Neither drawn under the editor's plain light: as they were left, until the preview is back.)
        if (this.roomGlow && !this.plain) this.roomGlow.update(delta);
        if (this.lampPool && !this.plain) this.lampPool.update(delta);
        // A switch turned, and its lights faded: the room probe (Realism.js) captured again, as they are now.
        if (this.probeStale && this.roomGlow?.settled && this.lampPool?.settled) {
            this.probeStale = false;
            if (this.sky) this.sky.lightVersion = (this.sky.lightVersion ?? 0) + 1;
        }
        if (this.sceneBuilder?.sunShade) this.sceneBuilder.updateSunShade(this.environment.sun);
        if (this.probes) this.probes.update(delta);
        if (this.people) this.people.tick(delta, this.experience.pace?.looking);
        if (this.editor) this.editor.update(delta);
        this.emit("tick", delta);
    }

    /**
     * Each frame, once the camera has been placed for it (Experience.update):
     * what is drawn for where the eye is. The water (World/Water.js): its
     * steam seen from inside a shower or from outside it is drawn by other
     * faces, with or without the depth test, and in another order against
     * the glass — worked out for the camera of the frame before, a camera
     * that came in through the glass this frame (the third-person boom, which
     * snaps) drew the steam over the door's handle for that frame. After the
     * doors and the visitor too: a shower's glass door's mist goes with the
     * door, the drops end on the visitor's head where it now is.
     */
    afterCamera() {
        if (this.water) this.water.update(this.experience.time.delta);
    }

    dispose() {
        this.disposed = true;
        this.birdView?.dispose();
        this.lamps?.dispose();
        this.roomLight?.dispose();
        clearTimeout(this.lightsTimer);
        this.lampPool?.dispose();
        this.roomGlow?.dispose();
        this.bulbs?.dispose();
        this.probes?.dispose();
        this.seats?.dispose();
        this.screens?.dispose();
        this.water?.dispose();
        this.people?.dispose();
        this.editor?.dispose();
        this.vegetation?.dispose();
        this.sky?.dispose();
        this.plainLight?.dispose();
        this.standIns?.dispose();
        this.experience.renderer?.realism?.dispose();
        this.interactables?.dispose();
        this.sceneBuilder?.dispose();
        this.environment?.dispose();
        this.player?.dispose();
    }
}

/**
 * Whether the editor's walkthrough starts with its realistic preview on: as
 * the link asks — `?preview=1`, for this page only — or as this browser
 * last left it. Off until asked for.
 */
function previewWanted() {
    const asked = new URL(window.location.href).searchParams.get("preview");
    if (asked !== null) return asked !== "0" && asked !== "false";
    try {
        return localStorage.getItem(PREVIEW_KEY) === "1";
    } catch {
        return false;
    }
}

function rememberPreview(on) {
    try {
        localStorage.setItem(PREVIEW_KEY, on ? "1" : "0");
    } catch {
        // A private window: for this visit only.
    }
}

/** What a list of the switches shows: each one's name and floor. */
function switchesKey(switches) {
    return switches.list.map((item) => `${item.id}|${item.label}|${item.level}`).join("\n");
}

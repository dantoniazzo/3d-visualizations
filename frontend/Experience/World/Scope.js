import * as THREE from "three";

import Experience from "../Experience.js";

/**
 * How much of the site the editor draws: its view's scope, one of three.
 *
 *   house     the houses with their yards, and nothing else — the structure,
 *             the furniture and the fittings, the landscape's hard parts
 *             (the ground near the houses, terraces, garden walls, kerbs,
 *             pergolas, planters, the pool and its water), the fence, the
 *             people. What it starts as: everything that is worked on most,
 *             and the fastest to draw.
 *   exterior  the surroundings on their own: all of the above that is out of
 *             doors, with the garden, the far ground, the neighbourhood, the
 *             sky and the cars — and the houses as their shells: roofs and
 *             outside walls, with nothing inside them.
 *   all       everything, as a visitor will see it.
 *
 * It holds in edit mode and in the walkthrough drawn under the plain light
 * (World/PlainLight.js). The realistic preview shows everything whatever it
 * says — it previews what will be published — and so does a publish, which
 * takes only what is drawn (World.holdRealistic): `current` is then "all".
 *
 * What is left out here is the surroundings, which belong to no collection
 * of the editor's: the garden (World/Flora or World/Vegetation — every tree,
 * hedge and blade of grass, the hills' too, the garden's lights), a site's
 * ground far off, the neighbourhood, the cars, and the sky, in whose place
 * a flat colour is drawn, light by day and dark at night. (The hills behind
 * a plot stay, bare: they are that plot's ground.) Hidden, none of it is
 * drawn or brought up to date each frame; and the garden is not made at all
 * until it is first shown (`plant`) — only where its trunks stand, which is
 * walked into whatever is drawn. A floor or a room worked on alone (the
 * editor's focus) leaves the surroundings out too, whatever the scope —
 * but for the cars, which stand in a room as a piece of furniture does: a
 * garage's car is that garage's, and each is the editor's to show or hide
 * by where it stands, once the scope shows cars at all (`cars`).
 *
 * What of the houses themselves each scope leaves out — the insides, for
 * "exterior" — is the editor's to hide, by its collections
 * (Editor.applyVisibility, Collections.inScope): it hears "scope" from the
 * world whenever what is drawn may have changed.
 *
 * Nothing here changes what is collided with, saved or published.
 */

/** Each scope: its name, what a menu says of it, and a tooltip's line. */
export const SCOPES = {
    house: { label: "House", menu: "the houses and their yards", hint: "the houses and their yards alone — no garden, cars, far ground or sky" },
    exterior: { label: "Exterior", menu: "the surroundings, the houses empty", hint: "the surroundings alone — the garden, the cars and the houses' outsides, nothing indoors" },
    all: { label: "All", menu: "everything", hint: "everything, as a visitor will see it" },
};

/** Where the scope is kept, in this browser. */
const SCOPE_KEY = "editor-scope";
/** What is drawn behind the houses in place of the sky. */
const BACKDROP = { day: "#c9d1d8", night: "#15171c" };

export default class Scope {
    /** @param {World} world  the editor's */
    constructor(world) {
        this.world = world;
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.value = scopeWanted();
        /** What asks for the surroundings whatever else says (need): the Garden panel, which edits them. */
        this.needs = new Set();
        this.backdrops = { day: new THREE.Color(BACKDROP.day), night: new THREE.Color(BACKDROP.night) };
        /** The scene's own background, while a flat colour is drawn in its place (update). */
        this.kept = null;
        this.flat = false;
    }

    /** What is drawn now: the scope chosen, or everything — under the realistic preview, and while a publish holds the scene. */
    get current() {
        return this.world.plain ? this.value : "all";
    }

    /**
     * Whether the surroundings are drawn now: not in "house", nor with a
     * floor or a room worked on alone — unless something that edits them is
     * open (need).
     */
    get exterior() {
        if (!this.world.plain) return true;
        if (this.value === "house") return false;
        return this.needs.size > 0 || !this.focused;
    }

    /** Whether the cars are drawn at all now: not in "house". Which of them, with a floor or a room in focus, is the editor's to say (Collections.shows). */
    get cars() {
        return this.current !== "house";
    }

    /** Whether the editor is working on a floor or a room alone (its focus). */
    get focused() {
        const editor = this.world.editor;
        const focus = editor?.active ? editor.focus : null;
        return Boolean(focus) && focus.type !== "outside";
    }

    /** Whether the houses' insides are drawn now. */
    get interior() {
        return this.current !== "exterior";
    }

    /**
     * One of SCOPES, from now on; kept in this browser unless `remember` is
     * false (a scope the editor chose itself, to show what is being worked on).
     */
    set(value, { remember = true } = {}) {
        if (!SCOPES[value]) return;
        // Chosen — even when it is what the editor already widened the view to: the next visit starts in it.
        if (remember) rememberScope(value);
        if (value === this.value) return;
        this.value = value;
        this.apply();
        this.world.emit("scope", this.current);
    }

    /** Something that edits the surroundings is open (`on`), or shut: they are drawn meanwhile, a room in focus or not. */
    need(what, on) {
        if (on) this.needs.add(what);
        else this.needs.delete(what);
        this.apply();
    }

    /**
     * The surroundings shown or hidden, as they should be now. The garden is
     * made if this is the first it is shown — but not for a publish alone,
     * which takes nothing of it.
     */
    apply() {
        const world = this.world;
        const builder = world.sceneBuilder;
        if (!builder) return;
        const shown = this.exterior;

        const garden = world.vegetation;
        if (garden) {
            if (shown && !garden.planted && !world.held) garden.plant();
            garden.setShown(shown);
        }
        const far = builder.landscape?.getObjectByName("terrain-far");
        for (const part of [far, builder.neighbourhood]) if (part) part.visible = shown;
        // The cars, all of them or none: with a floor or a room in focus,
        // each is shown with the room it stands in (Editor.applyVisibility).
        const cars = this.cars;
        if (builder.vehicleGroup) builder.vehicleGroup.visible = cars;
        // The hills behind a plot are cut out of the ground they rise from:
        // hidden, they would leave a hole in it. Bare, they stay — but for
        // a floor or a room in focus, which hides that ground too.
        if (builder.hills) builder.hills.visible = shown || !this.focused;
        // A car being driven, hidden: got out of first.
        if (!cars && world.player?.inVehicle) world.player.exitVehicle();

        // The sky's picture, or the neighbourhood's dome: on no layer, as
        // the plain light keeps a light out — whoever owns it sets the rest.
        // Not behind a floor or a room worked on alone either, whatever else
        // is shown (need): the ground is left out with all that is not
        // theirs, and they would stand on the dark a dome ends in below the
        // horizon.
        const sky = shown && !this.focused;
        for (const dome of [world.sky?.dome, world.environment?.sky]) {
            if (!dome) continue;
            if (sky) dome.layers.set(0);
            else dome.layers.disableAll();
        }
        this.flat = !sky;
        this.update();
    }

    /**
     * Each frame (World.update): the flat colour behind the houses while
     * the sky is left out, by day or at night — whatever has set the scene's
     * own background meanwhile (the time of day, the garden's settings),
     * which is kept for when the sky is back.
     */
    update() {
        const scene = this.scene;
        const { day, night } = this.backdrops;
        const ours = scene.background === day || scene.background === night;
        if (!this.flat) {
            if (ours) scene.background = this.kept;
            return;
        }
        if (!ours) this.kept = scene.background;
        scene.background = this.world.lighting === "night" ? night : day;
    }
}

/** Whether an object is drawn: visible all the way up — a scope, like a focus, hides whole groups. */
export function isShown(object) {
    for (let node = object; node; node = node.parent) {
        if (!node.visible) return false;
    }
    return true;
}

/**
 * The scope the editor starts in: as the link asks — `?scope=exterior`, for
 * this page only — or as this browser last left it. The houses alone until
 * told otherwise.
 */
function scopeWanted() {
    const asked = new URL(window.location.href).searchParams.get("scope");
    if (SCOPES[asked]) return asked;
    try {
        const kept = localStorage.getItem(SCOPE_KEY);
        return SCOPES[kept] ? kept : "house";
    } catch {
        return "house";
    }
}

function rememberScope(value) {
    try {
        localStorage.setItem(SCOPE_KEY, value);
    } catch {
        // A private window: for this visit only.
    }
}

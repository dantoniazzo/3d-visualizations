import "./index.scss";
import { io } from "socket.io-client";

import Experience from "./Experience/Experience.js";
import elements from "./Experience/Utils/functions/elements.js";
import {
    QUALITY,
    QUALITY_STEP,
    QUALITY_STEPS,
    ROOM_LIGHT_STEP,
    deviceDefaultStep,
    lighterLighting,
    needsReloadFor,
    setLighting,
    setQuality,
    setQualityStep,
    stepCeiling,
} from "./Experience/Utils/device.js";
import { chooseLighting, chosenLighting, lostGraphics } from "./Experience/Utils/viewerChoices.js";
import { finishesFor, FINISHES } from "../shared/catalog.js";
import { publishOptions } from "../shared/publishOptions.js";
import { publishedSpec } from "../shared/neighbourhood.js";

/**
 * App shell.
 *
 * The 3D Experience needs its scene spec at construction time, so this file
 * owns everything that happens before that — listing the saved spaces —
 * then wires up chat, the walkthrough HUD, saving and the sockets once a
 * space is open. Edit mode brings its own interface (Editor/EditorUI);
 * while it is open the walkthrough's keys and panels stand aside.
 */

const dom = elements({
    // Launcher
    launcher: ".launcher",
    sceneList: "#scene-list",
    launcherStatus: "#launcher-status",
    // Preloader
    preloader: ".preloader",
    // HUD
    menuButton: "#menu-button",
    viewToggle: "#view-toggle",
    birdToggle: "#bird-toggle",
    floorPicker: "#floor-picker",
    editorToggle: "#editor-toggle",
    previewToggle: "#preview-toggle",
    viewToggleLabel: "#view-toggle-label",
    lightingToggle: "#lighting-toggle",
    lightingToggleLabel: "#lighting-toggle-label",
    lightsToggle: "#lights-toggle",
    lightsPanel: "#lights-panel",
    lightsList: "#lights-list",
    lightsAllOff: "#lights-all-off",
    lightsAllOn: "#lights-all-on",
    roomLight: "#room-light",
    roomLightToggle: "#room-light-toggle",
    roomLightNote: "#room-light-note",
    roomLightHint: "#room-light-hint",
    lightingSection: "#lighting-section",
    lightingChoices: "#lighting-choices",
    lightingNote: "#lighting-note",
    qualityRange: "#quality-range",
    qualityTicks: ".quality-ticks",
    qualityName: "#quality-name",
    qualityNote: "#quality-note",
    qualityReload: "#quality-reload",
    scenerySection: "#scenery-section",
    sceneryList: "#scenery-list",
    pickLabel: "#pick-label",
    viewNotice: "#view-notice",
    menuPanel: "#menu-panel",
    menuSceneName: "#menu-scene-name",
    menuSceneSummary: "#menu-scene-summary",
    jumpList: "#jump-list",
    leaveButton: "#leave-button",
    roomReadout: "#room-readout",
    inspectLabel: "#inspect-label",
    actionPrompt: "#action-prompt",
    actionKey: "#action-key",
    actionLabel: "#action-label",
    touchAction: "#touch-action",
    touchActionIcon: "#touch-action-icon",
    touchActionLabel: "#touch-action-label",
    finishPicker: "#finish-picker",
    finishTarget: "#finish-target",
    finishGrid: "#finish-grid",
    finishClose: "#finish-close",
    // Chat
    chatContainer: ".chat-container",
    chatInput: "#chat-message-input",
    chatSend: "#chat-message-button",
    chatWrapper: ".message-input-wrapper",
    // Canvas
    canvas: ".experience-canvas",
});

let experience = null;
let chatSocket = null;
let updateSocket = null;
let userName = "";
let currentSceneId = null;
/** Opened from a public link: walk round and talk, nothing that edits or saves. */
let publicView = false;

/** Whatever the crosshair is currently on, from the world's "look" event. */
let lookTarget = null;
/** The door or car in reach, from the world's "prompt" event. */
let worldPrompt = null;
/** The key of the action on offer (E, F or T), for the touch button. */
let actionKey = null;

const editor = () => experience?.world?.editor ?? null;
const editing = () => Boolean(editor()?.active);

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------

async function api(path, options) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.error || `Request failed (${response.status})`);
    }
    return body;
}

// ---------------------------------------------------------------------
// Launcher
// ---------------------------------------------------------------------

async function loadSceneList() {
    try {
        const { scenes } = await api("/api/scenes");

        if (scenes.length === 0) {
            dom.sceneList.innerHTML =
                '<p class="empty">No spaces yet — run <code>npm run seed</code> to write the bundled examples.</p>';
            return;
        }

        dom.sceneList.innerHTML = scenes
            .map(
                (scene) => `
                <button class="scene-card" data-scene="${scene.id}">
                    <span class="scene-card-name">${escapeHtml(scene.name)}</span>
                    <span class="scene-card-summary">${escapeHtml(scene.summary)}</span>
                    <span class="scene-card-meta">
                        ${scene.rooms} room${scene.rooms === 1 ? "" : "s"} ·
                        ${scene.objects} objects
                    </span>
                </button>`
            )
            .join("");
    } catch (error) {
        dom.sceneList.innerHTML = `<p class="empty">Couldn't load saved spaces: ${escapeHtml(
            error.message
        )}</p>`;
    }
}

async function openScene(sceneId, options = {}) {
    dom.launcherStatus.textContent = "Opening…";
    try {
        // A public link opens the latest published version when there is
        // one — frozen as it was published, with its optimised snapshot —
        // and the space as it stands when there is not. `?version=` opens
        // an earlier version, and `?live` none, to compare them.
        const params = new URL(window.location.href).searchParams;
        const version = params.get("version");
        const wantPublished = options.publicView && !params.has("live");
        const published = wantPublished ? await findPublished(sceneId, version) : null;
        if (wantPublished && version && !published) throw new Error(`There is no published version ${version} of this space.`);
        if (published) {
            setQuality(published.options.quality);
            // As the version is published, unless its visitor has chosen otherwise.
            setLighting(published.options.lighting, chosenLighting());
            enterScene(sceneId, published.spec, { ...options, published });
            return;
        }
        const record = await api(`/api/scenes/${sceneId}`);
        enterScene(record.id, record.scene, options);
    } catch (error) {
        dom.launcherStatus.textContent = error.message;
        // Fall back to the library so a bad link isn't a dead end — except
        // on a public link, whose visitors have no business in the library.
        if (!options.publicView) loadSceneList();
    }
}

/**
 * A published version of a space — the latest, or the one asked for — or
 * null if there is none.
 */
async function findPublished(sceneId, version = null) {
    const base = `/published/${encodeURIComponent(sceneId)}`;
    try {
        const response = version
            ? await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/published?version=${encodeURIComponent(version)}`)
            : await fetch(`${base}/manifest.json`, { cache: "no-cache" });
        if (!response.ok) return null;
        const manifest = await response.json();
        // As published: one from before the neighbourhood has none.
        const spec = publishedSpec(await (await fetch(`${base}/${manifest.spec}`)).json());
        // Baked lighting (npm run bake), when there is any: a lightmap for
        // each of day and night — and one without the sun, for a view that
        // draws it live — each light switch's light, room by room, when the
        // fittings were baked apart, and the light probes; every file it
        // names, served from beside the manifest.
        const served = (value) => {
            if (typeof value === "string") return /\.(webp|png|jpe?g|ktx2|bin)$/.test(value) ? `${base}/${value}` : value;
            if (Array.isArray(value)) return value.map(served);
            if (value === null || typeof value !== "object") return value;
            return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, served(inner)]));
        };
        const lighting = manifest.lighting && served(manifest.lighting);
        return {
            spec,
            view: `${base}/${manifest.view}`,
            version: manifest.version,
            options: publishOptions(manifest.options),
            lighting,
            // What the bird's-eye view may do without showing a face the
            // publish threw away, and the floors its meshes are levelled by.
            birdView: manifest.birdView,
            levels: manifest.levels,
            // Collision, materials and glass, so the house need not be built.
            runtime: manifest.runtime && `${base}/${manifest.runtime}`,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------
// Entering a space
// ---------------------------------------------------------------------

function enterScene(sceneId, spec, options = {}) {
    currentSceneId = sceneId;
    publicView = Boolean(options.publicView);
    document.body.classList.toggle("public-view", publicView);

    // Reflected in the URL so a link drops a colleague into the same space.
    // A public link already says where it goes.
    if (!publicView) {
        const url = new URL(window.location.href);
        url.searchParams.set("scene", sceneId);
        window.history.replaceState({}, "", url);
    }

    dom.launcher.style.display = "none";
    dom.preloader.style.display = "flex";

    connectSockets(sceneId);

    experience = new Experience(dom.canvas, updateSocket, spec, { publicView, published: options.published });
    experience.onName = handleName;
    experience.onAvatar = handleAvatar;

    // Handy from the console when checking a layout: inspect the scene graph,
    // teleport, or read the spec that produced what you're looking at.
    window.experience = experience;

    const world = experience.world;
    world.on("ready", () => {
        setupHud(spec);
        setupQuality();
        if (publicView) tellLostGraphics();
    });
    world.on("room", updateRoomReadout);
    world.on("look", onLook);
    world.on("view", updateViewToggle);
    world.on("prompt", onDoorPrompt);
    world.on("finish-changed", () => scheduleSave());
    world.on("scene-edited", () => scheduleSave());
    world.on("save-now", () => scheduleSave(0));
    world.on("leave-space", leaveSpace);
    world.on("mode", onModeChange);
    world.on("publish", () => startPublish());
    world.on("lighting", updateLightingToggle);
    world.on("preview", updatePreviewToggle);
    updatePreviewToggle(world.preview);
    world.on("switches-ready", setupLights);
    world.on("scenery-ready", setupViewOptions);
    world.on("switches", renderLights);
    world.on("bird-hover", showPickLabel);
    world.on("bird-ready", setupFloorPicker);
    world.on("bird", updateBirdView);
    // A public view's own watch on its frame rate (Experience/FrameGuard.js): what it changes, shown and said.
    experience.guard?.on("change", onGuardChange);

    // Desktop looks with the mouse via pointer lock; touch keeps drag-to-orbit.
    if (experience.camera.scheme === "pointerLock") {
        document.body.classList.add("input-pointerlock");
        experience.camera.on("lockchange", (locked) => {
            document.body.classList.toggle("pointer-locked", locked);
        });
    } else {
        document.body.classList.add("input-touch");
    }
}

function connectSockets(sceneId) {
    const base = window.location.origin;
    const options = { query: { scene: sceneId } };

    chatSocket = io(`${base}/chat`, options);
    updateSocket = io(`${base}/update`, options);

    chatSocket.on("recieved-message", (name, message, time) => {
        displayMessage(name, message, time);
    });
}

function handleName(name) {
    userName = name;
    chatSocket.emit("setName", name);
    updateSocket.emit("setName", name);
}

function handleAvatar(avatarId) {
    updateSocket.emit("setAvatar", avatarId);
}

function leaveSpace() {
    const url = new URL(window.location.href);
    url.searchParams.delete("scene");
    window.location.href = url.toString();
}

// ---------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------

function setupHud(spec) {
    dom.menuSceneName.textContent = spec.name;
    dom.menuSceneSummary.textContent = spec.summary;

    const spawnButtons = spec.spawns.map(
        (spawn, index) =>
            `<button class="chip" data-spawn="${index}">${escapeHtml(spawn.label)}</button>`
    );
    const roomButtons = spec.rooms.map(
        (room) => `<button class="chip" data-room="${room.id}">${escapeHtml(room.name)}</button>`
    );

    dom.jumpList.innerHTML = [...spawnButtons, ...roomButtons].join("");
}

function updateRoomReadout(room) {
    dom.roomReadout.textContent = room ? room.name : "";
    dom.roomReadout.classList.toggle("visible", Boolean(room));
}

/** Edit mode takes the screen: the walkthrough's panels close as it opens. */
function onModeChange(mode) {
    if (mode === "edit") {
        toggleMenu(false);
        toggleLights(false);
        if (!dom.finishPicker.hidden) closeFinishPicker({ relock: false });
        if (isChatOpen()) closeChat({ relock: false });
        showAction(null);
        dom.inspectLabel.classList.remove("visible");
    }
}

// ---------------------------------------------------------------------
// Crosshair target, doors and finishes
// ---------------------------------------------------------------------

function onLook(target) {
    lookTarget = target;

    const label = target
        ? target.kind === "surface"
            ? `${target.label} — ${FINISHES[target.finish]?.label ?? target.finish}`
            : target.label
        : "";

    dom.inspectLabel.textContent = label;
    dom.inspectLabel.classList.toggle("visible", Boolean(label));

    refreshAction();

    // Keep an open picker pointed at whatever is now under the crosshair.
    if (!dom.finishPicker.hidden && target?.kind === "surface") {
        renderFinishGrid(target);
    }
}

function onDoorPrompt(prompt) {
    worldPrompt = prompt;
    refreshAction();
}

/**
 * The one action on offer: a door or the car in reach first — whatever the
 * crosshair has moved on to, which an opened door swings away from — and
 * otherwise, in the editor, a new finish for the surface aimed at.
 */
function refreshAction() {
    if (worldPrompt) showAction(worldPrompt.key, worldPrompt.label, worldPrompt.touch);
    else if (lookTarget?.kind === "surface" && !publicView) showAction("T", "Change finish");
    else showAction(null);
}

/** What the touch button says for each action, in a word. */
const TOUCH_ACTIONS = {
    "Open door": { label: "Open", icon: "door" },
    "Close door": { label: "Close", icon: "door" },
    Drive: { label: "Drive", icon: "car" },
    "Get out": { label: "Get out", icon: "car" },
    "Change finish": { label: "Finish", icon: "finish" },
};

/**
 * The action on offer — a door, the car, a light, a finish — as a key hint
 * on a keyboard, and as a button under the right thumb on a touch screen:
 * `touch`'s word and icon, or those TOUCH_ACTIONS has for the label.
 */
function showAction(key, label, touch = TOUCH_ACTIONS[label]) {
    actionKey = key || null;
    if (!key) touch = null;
    dom.touchAction.hidden = !touch;
    if (touch) {
        dom.touchActionLabel.textContent = touch.label;
        dom.touchActionIcon.dataset.icon = touch.icon;
        dom.touchAction.setAttribute("aria-label", label);
    }
    if (!key) {
        dom.actionPrompt.hidden = true;
        return;
    }
    dom.actionKey.textContent = key;
    dom.actionLabel.textContent = label;
    dom.actionPrompt.hidden = false;
}

/** The touch button does what the key would. */
function runAction() {
    const player = experience?.world?.player;
    if (!player || !actionKey) return;
    if (actionKey === "E") player.interact();
    else if (actionKey === "F") player.inVehicle ? player.exitVehicle() : player.enterNearestVehicle();
    else if (actionKey === "T") dom.finishPicker.hidden ? openFinishPicker() : closeFinishPicker();
}

dom.touchAction.addEventListener("click", (event) => {
    event.preventDefault();
    runAction();
});

/** Surface the picker is editing — frozen while the panel is open. */
let pickerSurface = null;

function openFinishPicker() {
    if (publicView || !lookTarget || lookTarget.kind !== "surface") return;

    pickerSurface = lookTarget;
    renderFinishGrid(pickerSurface);
    dom.finishPicker.hidden = false;
    experience?.camera.releaseLock();
}

function closeFinishPicker({ relock = true } = {}) {
    dom.finishPicker.hidden = true;
    pickerSurface = null;
    if (relock) experience?.camera.requestLock();
}

function renderFinishGrid(target) {
    pickerSurface = target;
    dom.finishTarget.textContent = `${target.label} · ${target.surfaceKind}`;

    dom.finishGrid.innerHTML = finishesFor(target.surfaceKind)
        .map(
            (finish) => `
            <button class="finish-swatch${finish.id === target.finish ? " active" : ""}"
                    data-finish="${finish.id}" title="${escapeHtml(finish.label)}">
                <span class="finish-preview" data-preview="${finish.id}"></span>
                <span class="finish-name">${escapeHtml(finish.label)}</span>
            </button>`
        )
        .join("");

    // Paint each swatch from the same texture the world uses: generated, or
    // an image's own.
    const textures = experience?.world.sceneBuilder?.materials?.textures;
    if (!textures) return;

    for (const node of dom.finishGrid.querySelectorAll("[data-preview]")) {
        const image = textures.get(node.dataset.preview)?.image;
        const url = image?.toDataURL ? image.toDataURL() : FINISHES[node.dataset.preview]?.image;
        if (url) {
            node.style.backgroundImage = `url(${url})`;
            node.style.backgroundSize = "cover";
        }
    }
}

// ---------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------

let saveTimer = null;

/**
 * Publish the space's public view: the panel's options, then the snapshot.
 * The snapshot is taken of the space as a visitor sees it, so edit mode —
 * with its cutaways and hidden floors — is left first. The panel and the
 * snapshot code load only now.
 */
async function startPublish() {
    if (publicView || !currentSceneId || !experience) return;
    editor()?.leave();
    experience.camera.releaseLock?.();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const { default: PublishPanel } = await import("./Experience/Publish/PublishPanel.js");
    new PublishPanel(experience, currentSceneId);
}

/** Debounced save of the whole spec — finishes, furniture, stairs, doors. */
function scheduleSave(delay = 900) {
    if (publicView || !currentSceneId || !experience?.world.sceneBuilder) return;

    editor()?.ui.setSaveState("pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        editor()?.ui.setSaveState("saving");
        try {
            await api(`/api/scenes/${currentSceneId}`, {
                method: "PUT",
                body: JSON.stringify({ scene: experience.world.sceneBuilder.spec }),
            });
            editor()?.ui.setSaveState("saved");
        } catch (error) {
            console.warn("Could not save changes:", error.message);
            editor()?.ui.setSaveState("error");
            editor()?.ui.toast(`Couldn't save: ${error.message}`, "error");
        }
    }, delay);
}

// Unsaved edits are worth a prompt before the tab closes.
window.addEventListener("beforeunload", (event) => {
    if (saveTimer && editor()?.ui.dom.save.dataset.state === "pending") {
        event.preventDefault();
        event.returnValue = "";
    }
});

// ---------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------

function getTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
    ).padStart(2, "0")}`;
}

function displayMessage(name, message, time) {
    const div = document.createElement("div");
    div.className = "chat-message";
    div.innerHTML = `<span class="chat-meta">[${escapeHtml(time)}] ${escapeHtml(
        name
    )}:</span> ${escapeHtml(message)}`;

    dom.chatContainer.append(div);
    dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
}

/**
 * Chat and pointer lock are mutually exclusive: a captured cursor can't
 * reach an input, so opening the composer has to hand the pointer back and
 * sending has to take it again.
 */
function isChatOpen() {
    return !dom.chatWrapper.classList.contains("hidden");
}

function openChat() {
    dom.chatWrapper.classList.remove("hidden");
    experience?.camera.releaseLock();
    dom.chatInput.focus();
}

function closeChat({ relock = true } = {}) {
    dom.chatWrapper.classList.add("hidden");
    dom.chatInput.blur();
    if (relock) experience?.camera.requestLock();
}

function sendChat() {
    const message = dom.chatInput.value.trim();

    if (message) {
        displayMessage(userName, message.substring(0, 500), getTime());
        chatSocket.emit("send-message", message.substring(0, 500), getTime());
        dom.chatInput.value = "";
    }

    closeChat();
}

function toggleMenu(force) {
    const show = force === undefined ? dom.menuPanel.hidden : force;
    dom.menuPanel.hidden = !show;
    if (show) toggleLights(false);

    // The panel is only clickable once the cursor is free again.
    if (show) experience?.camera.releaseLock();
}

// ---------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

dom.sceneList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-scene]");
    if (card) openScene(card.dataset.scene);
});

dom.menuButton.addEventListener("click", () => toggleMenu());

/**
 * First / third person, from the HUD.
 *
 * The keyboard has always had `V` for this, but nothing on screen said so —
 * which made a first-person walkthrough, the whole point of the tool, look
 * like it did not exist. The button and the key run through the same path.
 */
dom.viewToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    // From above, the button goes back to walking in the view it names.
    if (experience?.world?.birdView?.active) experience.world.toggleBirdView();
    else experience?.world?.player?.toggleView();
});

/**
 * Each floor from above, in a public view: the button, and a picker for
 * the floor on show while it is on.
 */
function setupFloorPicker(count) {
    dom.birdToggle.hidden = false;
    const birdView = experience.world.birdView;
    dom.floorPicker.innerHTML = birdView.floors
        .map(({ level }) => {
            const name = birdView.floorName(level);
            // Short: "Ground", "First", "Roof"… — or, named by height, the height.
            const short = name.startsWith("Level ") ? name.split(" ")[1] : name.split(" ")[0];
            return `<button data-level="${level}"><span class="floor-long">${name}</span><span class="floor-short">${short}</span></button>`;
        })
        .join("");
    // One floor has nothing to pick between.
    dom.floorPicker.dataset.count = count;
}

function updateBirdView({ active, level }) {
    dom.birdToggle.classList.toggle("is-active", active);
    if (!active) dom.pickLabel.hidden = true;
    dom.floorPicker.hidden = !active || Number(dom.floorPicker.dataset.count) < 2;
    for (const button of dom.floorPicker.querySelectorAll("[data-level]")) {
        button.classList.toggle("is-active", Number(button.dataset.level) === level);
    }
    if (active) {
        dom.viewToggleLabel.textContent = "Walk";
        dom.viewToggle.classList.remove("is-first");
    } else {
        updateViewToggle(experience.camera.mode);
    }
    // The live room has no switch from above (renderRoomLight).
    if (roomLightBound?.supported) renderRoomLight(roomLightBound.status());
}

dom.birdToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    experience?.world?.toggleBirdView();
});

dom.floorPicker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-level]");
    if (button) experience?.world?.birdView?.setLevel(Number(button.dataset.level));
});

dom.editorToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    editor()?.enter();
});

/**
 * The editor's realistic preview (World.setPreview): its walkthrough lit as
 * visitors will see it, or — off, as it starts — plainly, as edit mode is.
 */
function updatePreviewToggle(on) {
    dom.previewToggle.classList.toggle("is-on", Boolean(on));
    dom.previewToggle.setAttribute("aria-pressed", String(Boolean(on)));
}

function togglePreview() {
    const world = experience?.world;
    if (!world || publicView) return;
    world.setPreview(!world.preview);
}

dom.previewToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePreview();
});

/** Day and night, when the published view has both baked — or the view is lit live, under a sky of its own or with its lights switched live. */
function updateLightingToggle(variant) {
    const variants = Object.keys(experience?.published?.lighting?.variants || {});
    dom.lightingToggle.hidden = variants.length < 2 && !experience?.world?.sky && !experience?.world?.liveLights;
    dom.lightingToggleLabel.textContent = variant === "night" ? "Night" : "Day";
    dom.lightingToggle.classList.toggle("is-night", variant === "night");
}

function toggleLighting() {
    const world = experience?.world;
    if (!world?.lighting) return;
    // (The other sky, its light and the lamps coming in take frames of their own, from before the world says it has changed.)
    experience.guard?.settle();
    world.setLighting(world.lighting === "night" ? "day" : "night");
}

dom.lightingToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLighting();
});

/**
 * The light switches — a published view's fittings baked apart
 * (World/Switches.js), or drawn live in the editor and a version lit live
 * (World/LiveSwitches.js): a button, and a panel of them floor by floor.
 * Built again whenever the fittings change (an edit).
 */
function setupLights(switches) {
    // Nothing to switch: no button, no panel.
    dom.lightsToggle.hidden = !switches.list.length;
    if (!switches.list.length) toggleLights(false);
    dom.lightsAllOn.hidden = typeof switches.allOn !== "function";
    const floors = switches.floors;
    dom.lightsList.innerHTML = floors
        .map(({ level, switches: items }) => {
            const rows = items
                .map(
                    (item) => `<button class="light-switch" data-switch="${escapeHtml(item.id)}" aria-pressed="false">
                        <span class="light-switch-label">${escapeHtml(item.label)}</span>
                        <span class="light-switch-toggle" aria-hidden="true"></span>
                    </button>`
                )
                .join("");
            // One floor needs no heading.
            const heading = floors.length > 1 ? `<h5>${escapeHtml(switches.floorName(level))}</h5>` : "";
            return `<div class="hud-panel-section">${heading}<div class="light-switches">${rows}</div></div>`;
        })
        .join("");
    renderLights(switches);
    setupRoomLight();
}

/**
 * The live room (World/RoomLight.js): over a baked view, the room the
 * visitor is in drawn as it really is — its own materials, the sun through
 * its windows, its lamps, real shadows — while they ask for it: a switch at
 * the head of the lights panel, and K. Shown only where the view can do it;
 * where it could but for the visitor's own settings, shown with why not.
 * What it says under the switch, by where it has got to:
 */
const ROOM_LIGHT_NOTES = {
    off: "Draws the room you are in as it really is: its own materials, the sun through its windows, its lamps, real shadows. Everywhere else keeps its fixed (baked) light.",
    step: "Needs the Balanced step or higher: the slider is in the menu (M).",
    above: "The live room waits while you look from above, where everything keeps its fixed light.",
    outdoors: "On. It draws the room you are in: step indoors.",
    coming: "Getting the room ready…",
    lit: "On: this room is drawn live. Everywhere else keeps its fixed light.",
};
/**
 * ...and where the view was opened in a way that leaves it out, though this
 * device could have it: `step`, at one of the slider's two lowest steps —
 * said as it stands now, the slider still there or raised since (what the
 * view is lit by was chosen as it opened: Utils/device.js's needsReloadFor).
 */
const ROOM_LIGHT_WITHHELD = {
    step: () =>
        QUALITY_STEP >= ROOM_LIGHT_STEP
            ? "Reload to have it: the view opened at one of its two fastest steps, with fixed light only."
            : "Not at this step: the view opened at one of its two fastest, with fixed light only. Raise the slider to Balanced (menu, M) and reload.",
    chosen: () => "Not while Lighting is set to Fastest: fixed light only. Pick Auto in the menu (M) to have it.",
};
let roomLightBound = null;

function setupRoomLight() {
    const roomLight = experience?.world?.roomLight ?? null;
    if (roomLight === roomLightBound) return;
    roomLightBound = roomLight;
    dom.roomLight.hidden = !roomLight || !(roomLight.supported || roomLight.withheld);
    if (dom.roomLight.hidden) return;
    roomLight.on("change", renderRoomLight);
    roomLight.on("hint", hintRoomLight);
    roomLight.on("ended", (why) => tellView(why, 12000));
    renderRoomLight(roomLight.status());
}

function renderRoomLight(status) {
    const on = Boolean(status.on);
    // From above there is nothing for it to light: no switch there — only, if it is on, a word that it waits.
    const above = Boolean(experience?.world?.birdView?.active);
    dom.roomLight.hidden = above && !on;
    dom.roomLightToggle.hidden = above;
    dom.roomLightToggle.classList.toggle("is-on", on);
    dom.roomLightToggle.setAttribute("aria-pressed", String(on));
    // Where the view leaves it out, the switch is there to say so, not to press.
    dom.roomLightToggle.disabled = !status.supported || (status.state === "step" && !on);
    dom.roomLightNote.textContent = status.supported ? ROOM_LIGHT_NOTES[status.state] ?? "" : ROOM_LIGHT_WITHHELD[status.withheld]?.() ?? "";
    // In the view itself, where K was pressed with the panel shut: that it is coming, at once; that it is on; that it is off.
    const was = roomLightSaid;
    roomLightSaid = { on, state: status.state };
    if (above || !status.supported) dom.roomLightHint.hidden = true;
    else if (status.state === "coming") sayRoomLight("Getting the live room ready…", 0);
    else if (on && status.state === "lit" && was.state !== "lit") sayRoomLight("Live room on", 2500);
    else if (on && status.state === "outdoors" && !was.on) sayRoomLight("Live room on: step indoors", 4000);
    else if (!on && was.on) sayRoomLight("Live room off", 2000);
    else if (was.state === "coming") dom.roomLightHint.hidden = true;
}

/** A word in the view about the live room, by its key: for `lasts` milliseconds, or (0) until the next. */
let roomLightSaid = { on: false, state: "off" };
function sayRoomLight(text, lasts) {
    dom.roomLightHint.replaceChildren(Object.assign(document.createElement("kbd"), { textContent: "K" }), ` ${text}`);
    dom.roomLightHint.hidden = false;
    clearTimeout(roomLightHintTimer);
    if (lasts) roomLightHintTimer = setTimeout(() => (dom.roomLightHint.hidden = true), lasts);
}

function toggleRoomLight() {
    const roomLight = experience?.world?.roomLight;
    if (!roomLight?.supported) {
        // Left out as the view was opened, though this device could have it: K says what the panel's row says.
        const why = ROOM_LIGHT_WITHHELD[roomLight?.withheld]?.();
        if (why) tellView(`The live room: ${why.charAt(0).toLowerCase()}${why.slice(1)}`, 8000);
        return;
    }
    // From above there is nothing to light: said, not switched on — and, on, switched off with a word (its switch is not on show there).
    if (experience.world.birdView?.active) {
        if (roomLight.wanted) {
            roomLight.toggle();
            tellView("The live room is off.", 5000);
        } else tellView("The live room is for walking through: from above everything keeps its fixed light.", 6000);
        return;
    }
    if (!roomLight.wanted && !roomLight.allowed) {
        tellView("The live room needs the Balanced step or higher: the slider is in the menu (M).", 8000);
        return;
    }
    roomLight.toggle();
}

/** Said once a visit: the key, at the first room it would draw live. */
let roomLightHintTimer = null;
function hintRoomLight() {
    sayRoomLight("See this room live", 9000);
}

/** A line at the top of the view (the notice's own place), gone by itself or at a click. */
let viewNoticeTimer = null;
function tellView(text, lasts = 10000) {
    dom.viewNotice.textContent = text;
    dom.viewNotice.hidden = false;
    clearTimeout(viewNoticeTimer);
    viewNoticeTimer = setTimeout(() => (dom.viewNotice.hidden = true), lasts);
    dom.viewNotice.addEventListener("click", () => (dom.viewNotice.hidden = true), { once: true });
}

dom.roomLightToggle.addEventListener("click", () => toggleRoomLight());

/** Each switch as it is — the list itself is only built once, so it keeps its focus. */
function renderLights(switches) {
    let lit = false;
    for (const button of dom.lightsList.querySelectorAll("[data-switch]")) {
        const on = switches.isOn(button.dataset.switch);
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-pressed", String(on));
        lit ||= on;
    }
    dom.lightsToggle.classList.toggle("is-lit", lit);
    dom.lightsAllOff.disabled = !lit;
    dom.lightsAllOn.disabled = switches.list.every((item) => switches.isOn(item.id));
}

function toggleLights(force) {
    if (dom.lightsToggle.hidden) force = false;
    const show = force === undefined ? dom.lightsPanel.hidden : force;
    dom.lightsPanel.hidden = !show;
    dom.lightsToggle.classList.toggle("is-active", show);
    dom.lightsToggle.setAttribute("aria-expanded", String(show));
    if (show) {
        toggleMenu(false);
        // The panel is only clickable once the cursor is free again.
        experience?.camera.releaseLock();
    }
}

dom.lightsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLights();
});

dom.lightsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-switch]");
    if (button) experience?.world?.switches?.toggle(button.dataset.switch);
});

dom.lightsAllOff.addEventListener("click", () => experience?.world?.switches?.allOff());
dom.lightsAllOn.addEventListener("click", () => experience?.world?.switches?.allOn?.());

// ---------------------------------------------------------------------
// The view's options: lighting and scenery, for a slow phone
// ---------------------------------------------------------------------

/**
 * How a baked view is lit (Utils/device.js's lightingMode), by name. A
 * visitor is offered "auto" — as published — and whatever is lighter than
 * that gives them (lighterLighting), never anything heavier; the whole
 * house lit live is a link's to ask for (`?lighting=live`), and only named.
 */
const LIGHTING_CHOICES = [
    { id: "auto", label: "Auto", note: "as this version is published, for this device" },
    { id: "baked", label: "Balanced", note: "baked light; people, cars and doors still shade the sun" },
    { id: "static", label: "Fastest", note: "baked light alone, nothing live" },
    { id: "live", label: "Live", note: "the sun and the lamps live over the whole house, as the link asks, to compare" },
];

/**
 * The menu's lighting and scenery, once a public view is up: how it is lit
 * — only once baked, and only where there is something lighter to pick
 * than this device is given — and what of the scenery (World/Scenery.js)
 * it has to hide.
 */
function setupViewOptions(scenery) {
    const lighter = experience.published?.lighting?.variants ? lighterLighting() : [];
    if (lighter.length) {
        const choices = LIGHTING_CHOICES.filter((choice) => choice.id === "auto" || lighter.includes(choice.id));
        // While the link itself says how it is lit (`?lighting=`), none of
        // them is what is on: picking any — Auto too — takes it out of the link.
        const linked = ["live", "baked", "static"].includes(new URL(window.location.href).searchParams.get("lighting"));
        const chosen = linked ? null : chosenLighting() ?? "auto";
        dom.lightingChoices.innerHTML = choices
            .map(
                (choice) =>
                    `<button class="chip" data-lighting="${choice.id}" aria-pressed="${choice.id === chosen}">${escapeHtml(choice.label)}</button>`
            )
            .join("");
        const now = LIGHTING_CHOICES.find((choice) => choice.id === experience.world.lightingMode);
        // (Where a room can be lit live, that is not here: said, with where it is.)
        const room = experience.world.roomLight?.supported ? " The room you are in can be drawn live: with the Lights (L), or K." : "";
        dom.lightingNote.textContent = `${now ? `Now ${now.label.toLowerCase()}: ${now.note}. ` : ""}Changing it reloads the view.${room}`;
        dom.lightingSection.hidden = false;
    }
    renderScenery(scenery);
    scenery.on("change", () => renderScenery(scenery));
}

function renderScenery(scenery) {
    const pieces = scenery.pieces;
    dom.scenerySection.hidden = !pieces.length;
    dom.sceneryList.innerHTML = pieces
        .map(
            (piece) => `<button class="light-switch${piece.shown ? " is-on" : ""}" data-scenery="${piece.id}" aria-pressed="${piece.shown}">
                <span class="light-switch-label">${escapeHtml(piece.label)}</span>
                <span class="light-switch-toggle" aria-hidden="true"></span>
            </button>`
        )
        .join("");
}

dom.lightingChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-lighting]");
    if (!button || button.getAttribute("aria-pressed") === "true") return;
    chooseLighting(button.dataset.lighting === "auto" ? null : button.dataset.lighting);
    // A link's own ?lighting= would overrule it.
    const url = new URL(window.location.href);
    url.searchParams.delete("lighting");
    window.location.replace(url);
});

// ---------------------------------------------------------------------
// Performance ↔ Quality (Utils/device.js's QUALITY_STEPS)
// ---------------------------------------------------------------------

/** What each step adds, in a line. */
const QUALITY_NOTES = [
    "Lowest resolution, hard shadows, no ambient occlusion, sparse grass.",
    "As a phone draws it: lighter shadows, no ambient occlusion.",
    "Ambient occlusion, soft shadows fitted to the view, the renders' colour grade.",
    "Full resolution, sharper shadows and occlusion, all the grass and trees.",
    "Sun-soft 8K shadows, the light bounced and reflected in each room, finer occlusion, trees in full further off.",
];

/**
 * The slider, as the view is drawn now; kept on this device for every
 * space. It goes no higher than the device is rated for (Utils/device.js's
 * stepCeiling): a step it cannot keep up with is not there to pick.
 */
function setupQuality() {
    const ceiling = stepCeiling();
    dom.qualityRange.max = String(ceiling);
    // A device with one step has nothing to slide between.
    dom.qualityRange.disabled = ceiling === 0;
    dom.qualityTicks.innerHTML = "<span></span>".repeat(ceiling + 1);
    dom.qualityRange.value = String(QUALITY_STEP);
    renderQuality();
}

function renderQuality() {
    const step = QUALITY_STEP;
    const best = deviceDefaultStep();
    // Brought down by the view itself, because it ran slowly (Experience/FrameGuard.js): said, with what happens next.
    const guard = experience?.guard;
    if (guard?.lowered) {
        dom.qualityName.textContent = `${QUALITY.name} · brought down from ${QUALITY_STEPS[guard.chosen].name}`;
        dom.qualityNote.textContent = `${QUALITY_NOTES[step]} The view was running slowly, so it is drawn lighter for now: it goes back up by itself when there is room, and your next visit opens as you set it. Move the slider to choose for yourself.`;
        dom.qualityReload.hidden = true;
        return;
    }
    // (Why a room cannot be lit live, where that is the step the view opened at: said as the slider stands now.)
    if (roomLightBound && !roomLightBound.supported) renderRoomLight(roomLightBound.status());
    dom.qualityName.textContent = `${QUALITY.name}${step === best ? " · the most this device is given" : ""}`;
    // Across the phone line, what was chosen as the view was built — a
    // published view's lighting and lightmaps, how densely the grass and
    // hedges were grown — waits for a reload.
    const reload = needsReloadFor(step);
    dom.qualityNote.textContent = `${QUALITY_NOTES[step]}${step > best ? " More than this device is expected to keep up with." : ""}${
        reload ? " Applied now, but for the lighting and the planting's density, which need a reload." : " Applied now."
    }`;
    dom.qualityReload.hidden = !reload;
}

dom.qualityRange.addEventListener("input", () => {
    const step = Math.max(0, Math.min(stepCeiling(), Number(dom.qualityRange.value)));
    // The visitor's own choice: the view's guard on its frame rate stands back from it (told first: the step is drawn whole).
    experience?.guard?.chose(step);
    setQualityStep(step);
    // A link's own ?quality= would overrule it next time.
    const url = new URL(window.location.href);
    if (url.searchParams.has("quality")) {
        url.searchParams.delete("quality");
        window.history.replaceState({}, "", url);
    }
    renderQuality();
});

dom.qualityReload.addEventListener("click", () => window.location.reload());

/**
 * The view has made itself lighter, or given something back
 * (Experience/FrameGuard.js). Its resolution goes unsaid — it is hardly
 * seen —, the room's live light says for itself that it was turned off
 * (setupRoomLight's "ended"); a step taken is shown on the slider and said,
 * since the picture changes with it; one given back when there is room is
 * only shown, and one put back because it made nothing faster is said. That
 * nothing it can take helps ("stuck") goes unsaid: the view is as its
 * visitor set it.
 */
function onGuardChange({ act }) {
    if (act.startsWith("step-")) {
        dom.qualityRange.value = String(QUALITY_STEP);
        renderQuality();
    }
    if (act === "step-down") {
        tellView(`The view was running slowly, so it is now drawn at "${QUALITY.name}". It goes back up by itself when there is room; the slider is in the menu (M).`, 9000);
    } else if (act === "step-back") {
        // Taken, and no faster for it: back as it was, said so that the picture changing twice is not a puzzle.
        tellView(`Drawing it lighter did not make this view faster, so it is back at "${QUALITY.name}".`, 9000);
    } else if (act === "floor") {
        // Nothing left to take: said once, with the one thing a visitor can still do.
        // (Where the menu offers it: a view drawn "baked" still has what moves shading the sun, and its light probes.)
        const lighter = experience.world.lightingMode === "baked" && !dom.lightingSection.hidden;
        tellView(
            `This view is heavy for this device, and is now drawn at its lightest.${lighter ? " Lighting: Fastest, in the menu (M), reloads it lighter still." : ""}`,
            12000
        );
    }
}

/**
 * The graphics gave up on the last visit to a public view (Utils/device.js's
 * guardContextLoss), so this one has started at the lowest step, fully
 * baked: said once, in a public view, where it is seen, until it is
 * clicked away or the visitor has been walking a while — the name and the
 * avatar are asked for over it first.
 */
function tellLostGraphics() {
    if (!lostGraphics()) return;
    dom.viewNotice.textContent =
        "This device's graphics gave up last time, so the view has started at its lightest: the fastest step, fully baked. The menu (M) can bring more back.";
    dom.viewNotice.hidden = false;
    const hide = () => {
        dom.viewNotice.hidden = true;
        clearInterval(walking);
    };
    dom.viewNotice.addEventListener("click", hide, { once: true });
    const walking = setInterval(() => {
        if (!document.body.classList.contains("walkthrough-active")) return;
        clearInterval(walking);
        setTimeout(hide, 20000);
    }, 1000);
}

dom.sceneryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scenery]");
    const scenery = experience?.world?.scenery;
    if (button && scenery) {
        // (Loading and making what was hidden takes frames of its own.)
        experience.guard?.settle();
        scenery.set(button.dataset.scenery, button.getAttribute("aria-pressed") !== "true");
    }
});

/** From above, the light under the mouse and what a click will do to it. */
function showPickLabel(hover) {
    const switches = experience?.world?.switches;
    dom.pickLabel.hidden = !hover || !switches;
    if (dom.pickLabel.hidden) return;
    const on = switches.isOn(hover.id);
    dom.pickLabel.innerHTML = `${escapeHtml(hover.label)} <span>${on ? "On" : "Off"} · click to turn ${on ? "off" : "on"}</span>`;
    dom.pickLabel.classList.toggle("is-on", on);
    dom.pickLabel.style.transform = `translate(${Math.round(hover.x + 14)}px, ${Math.round(hover.y + 16)}px)`;
}

function updateViewToggle(mode) {
    const first = mode === "first";
    dom.viewToggleLabel.textContent = first ? "First person" : "Third person";
    dom.viewToggle.classList.toggle("is-first", first);
}

dom.jumpList.addEventListener("click", (event) => {
    const spawn = event.target.closest("[data-spawn]");
    if (spawn) experience?.world.goToSpawn(Number(spawn.dataset.spawn));

    const room = event.target.closest("[data-room]");
    if (room) experience?.world.goToRoom(room.dataset.room);
    // (A first look at somewhere else takes frames of its own.)
    if (spawn || room) experience?.guard?.settle();

    // Teleporting means you want to be looking around, not reading a panel.
    if (spawn || room) {
        toggleMenu(false);
        experience?.camera.requestLock();
    }
});

dom.leaveButton.addEventListener("click", leaveSpace);

dom.chatSend.addEventListener("click", sendChat);

dom.finishGrid.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-finish]");
    if (!swatch || !pickerSurface) return;

    experience?.world.setFinish(pickerSurface.surfaceId, swatch.dataset.finish);
    pickerSurface = { ...pickerSurface, finish: swatch.dataset.finish };
    renderFinishGrid(pickerSurface);
});

dom.finishClose.addEventListener("click", () => closeFinishPicker());

document.addEventListener("keydown", (event) => {
    // Only meaningful once we're actually in a space, and walking it: edit
    // mode handles its own keys.
    if (!experience || editing()) return;

    const typingElsewhere =
        document.activeElement !== dom.chatInput &&
        (document.activeElement?.tagName === "INPUT" ||
            document.activeElement?.tagName === "TEXTAREA");

    if (event.key === "Enter") {
        if (typingElsewhere) return;
        event.preventDefault();
        if (isChatOpen()) sendChat();
        else openChat();
        return;
    }

    if ((event.key === "n" || event.key === "N") && !typingElsewhere && !isChatOpen()) {
        toggleLighting();
        return;
    }

    if ((event.key === "t" || event.key === "T") && !typingElsewhere && !isChatOpen()) {
        if (!dom.finishPicker.hidden) closeFinishPicker();
        else openFinishPicker();
        return;
    }

    if ((event.key === "l" || event.key === "L") && !typingElsewhere && !isChatOpen()) {
        toggleLights();
        return;
    }

    if ((event.key === "p" || event.key === "P") && !event.repeat && !typingElsewhere && !isChatOpen() && !event.ctrlKey && !event.metaKey && !event.altKey) {
        togglePreview();
        return;
    }

    // The live room, over a baked view (K: next to the lights' own L).
    if ((event.key === "k" || event.key === "K") && !event.repeat && !typingElsewhere && !isChatOpen() && !event.ctrlKey && !event.metaKey && !event.altKey) {
        toggleRoomLight();
        return;
    }

    if (event.key === "Escape" && !dom.lightsPanel.hidden) {
        toggleLights(false);
        return;
    }

    if (event.key === "Escape" && !dom.finishPicker.hidden) {
        closeFinishPicker({ relock: false });
        return;
    }

    if (event.key === "Escape" && isChatOpen()) {
        // Escape already dropped pointer lock at the browser level; asking
        // for it straight back is rejected during the browser's cooldown,
        // so leave the cursor free and let the click prompt take over.
        closeChat({ relock: false });
        return;
    }

    if ((event.key === "b" || event.key === "B") && !typingElsewhere && !isChatOpen()) {
        experience.world.toggleBirdView();
        return;
    }

    if ((event.key === "PageUp" || event.key === "PageDown") && experience.world.birdView?.active) {
        event.preventDefault();
        experience.world.birdView.step(event.key === "PageUp" ? 1 : -1);
        return;
    }

    // While the pointer is captured the HUD is unreachable by mouse, so the
    // menu needs a key of its own.
    if ((event.key === "m" || event.key === "M") && !typingElsewhere && !isChatOpen()) {
        toggleMenu();
    }
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

const requestedScene = new URL(window.location.href).searchParams.get("scene");
// A public link — /view/<scene> — is what goes to clients.
const publicScene = window.location.pathname.match(/^\/view\/([^/]+)\/?$/)?.[1];

if (publicScene) {
    openScene(decodeURIComponent(publicScene), { publicView: true });
} else if (requestedScene) {
    openScene(requestedScene);
} else {
    loadSceneList();
}

import "./index.scss";
import { io } from "socket.io-client";

import Experience from "./Experience/Experience.js";
import elements from "./Experience/Utils/functions/elements.js";
import { setQuality } from "./Experience/Utils/device.js";
import { finishesFor, FINISHES } from "../shared/catalog.js";
import { publishOptions } from "../shared/publishOptions.js";

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
    viewToggleLabel: "#view-toggle-label",
    lightingToggle: "#lighting-toggle",
    lightingToggleLabel: "#lighting-toggle-label",
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
        const spec = await (await fetch(`${base}/${manifest.spec}`)).json();
        // Baked lighting (npm run bake), when there is any: a lightmap for
        // each of day and night.
        const lighting = manifest.lighting && {
            ...manifest.lighting,
            variants: Object.fromEntries(
                Object.entries(manifest.lighting.variants).map(([name, variant]) => [
                    name,
                    {
                        ...variant,
                        lightmap: `${base}/${variant.lightmap}`,
                        lightmapPhone: variant.lightmapPhone && `${base}/${variant.lightmapPhone}`,
                    },
                ])
            ),
        };
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
    world.on("ready", () => setupHud(spec));
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
    world.on("bird-ready", setupFloorPicker);
    world.on("bird", updateBirdView);

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
    if (worldPrompt) showAction(worldPrompt.key, worldPrompt.label);
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
 * The action on offer — a door, the car, a finish — as a key hint on a
 * keyboard, and as a button under the right thumb on a touch screen.
 */
function showAction(key, label) {
    actionKey = key || null;
    const touch = key && TOUCH_ACTIONS[label];
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

    // Paint each swatch from the same generated texture the world uses.
    const textures = experience?.world.sceneBuilder?.materials?.textures;
    if (!textures) return;

    for (const node of dom.finishGrid.querySelectorAll("[data-preview]")) {
        const texture = textures.get(node.dataset.preview);
        if (texture?.image) {
            node.style.backgroundImage = `url(${texture.image.toDataURL()})`;
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
            const name = birdView.constructor.floorName(level);
            return `<button data-level="${level}"><span class="floor-long">${name}</span><span class="floor-short">${name.split(" ")[0]}</span></button>`;
        })
        .join("");
    // One floor has nothing to pick between.
    dom.floorPicker.dataset.count = count;
}

function updateBirdView({ active, level }) {
    dom.birdToggle.classList.toggle("is-active", active);
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

/** Day and night, when the published view has both baked. */
function updateLightingToggle(variant) {
    const variants = Object.keys(experience?.published?.lighting?.variants || {});
    dom.lightingToggle.hidden = variants.length < 2;
    dom.lightingToggleLabel.textContent = variant === "night" ? "Night" : "Day";
    dom.lightingToggle.classList.toggle("is-night", variant === "night");
}

function toggleLighting() {
    const world = experience?.world;
    if (!world?.lighting) return;
    world.setLighting(world.lighting === "night" ? "day" : "night");
}

dom.lightingToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLighting();
});

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

import "./index.scss";
import { io } from "socket.io-client";

import Experience from "./Experience/Experience.js";
import elements from "./Experience/Utils/functions/elements.js";
import { finishesFor, FINISHES } from "../shared/catalog.js";

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
    editorToggle: "#editor-toggle",
    viewToggleLabel: "#view-toggle-label",
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

/** Whatever the crosshair is currently on, from the world's "look" event. */
let lookTarget = null;

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

async function openScene(sceneId) {
    dom.launcherStatus.textContent = "Opening…";
    try {
        const record = await api(`/api/scenes/${sceneId}`);
        enterScene(record.id, record.scene);
    } catch (error) {
        dom.launcherStatus.textContent = error.message;
        // Fall back to the library so a bad link isn't a dead end.
        loadSceneList();
    }
}

// ---------------------------------------------------------------------
// Entering a space
// ---------------------------------------------------------------------

function enterScene(sceneId, spec) {
    currentSceneId = sceneId;

    // Reflected in the URL so a link drops a colleague into the same space.
    const url = new URL(window.location.href);
    url.searchParams.set("scene", sceneId);
    window.history.replaceState({}, "", url);

    dom.launcher.style.display = "none";
    dom.preloader.style.display = "flex";

    connectSockets(sceneId);

    experience = new Experience(dom.canvas, updateSocket, spec);
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

    // Desktop looks with the mouse via pointer lock; touch keeps drag-to-orbit.
    if (experience.camera.scheme === "pointerLock") {
        document.body.classList.add("input-pointerlock");
        experience.camera.on("lockchange", (locked) => {
            document.body.classList.toggle("pointer-locked", locked);
        });
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

    // Only surfaces can be retextured; the prompt says so when one is aimed at.
    if (target?.kind === "surface") {
        showAction("T", "Change finish");
    } else if (target?.kind !== "door") {
        showAction(null);
    }

    // Keep an open picker pointed at whatever is now under the crosshair.
    if (!dom.finishPicker.hidden && target?.kind === "surface") {
        renderFinishGrid(target);
    }
}

function onDoorPrompt(prompt) {
    if (prompt) showAction(prompt.key, prompt.label);
    else if (lookTarget?.kind !== "surface") showAction(null);
}

function showAction(key, label) {
    if (!key) {
        dom.actionPrompt.hidden = true;
        return;
    }
    dom.actionKey.textContent = key;
    dom.actionLabel.textContent = label;
    dom.actionPrompt.hidden = false;
}

/** Surface the picker is editing — frozen while the panel is open. */
let pickerSurface = null;

function openFinishPicker() {
    if (!lookTarget || lookTarget.kind !== "surface") return;

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

/** Debounced save of the whole spec — finishes, furniture, stairs, doors. */
function scheduleSave(delay = 900) {
    if (!currentSceneId || !experience?.world.sceneBuilder) return;

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
    experience?.world?.player?.toggleView();
});

dom.editorToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    editor()?.enter();
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

if (requestedScene) {
    openScene(requestedScene);
} else {
    loadSceneList();
}

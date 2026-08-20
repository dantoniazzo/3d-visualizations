import "./index.scss";
import { io } from "socket.io-client";

import Experience from "./Experience/Experience.js";
import elements from "./Experience/Utils/functions/elements.js";
import { finishesFor, FINISHES } from "../shared/catalog.js";

/**
 * App shell.
 *
 * The 3D Experience needs its scene spec at construction time, so this file
 * owns everything that happens before that: listing and generating spaces,
 * then wiring up chat, the HUD and the sockets once a space is chosen.
 */

const dom = elements({
    // Launcher
    launcher: ".launcher",
    sceneList: "#scene-list",
    briefInput: "#brief-input",
    generateButton: "#generate-button",
    generateStatus: "#generate-status",
    // Preloader
    preloader: ".preloader",
    // HUD
    menuButton: "#menu-button",
    viewToggle: "#view-toggle",
    editorToggle: "#editor-toggle",
    editorBar: "#editor-bar",
    editorHint: "#editor-hint",
    viewToggleLabel: "#view-toggle-label",
    menuPanel: "#menu-panel",
    menuSceneName: "#menu-scene-name",
    menuSceneSummary: "#menu-scene-summary",
    jumpList: "#jump-list",
    promptInput: "#prompt-input",
    reviseButton: "#revise-button",
    reviseStatus: "#revise-status",
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
    placementBar: "#placement-bar",
    placementName: "#placement-name",
    furnitureList: "#furniture-list",
    placedList: "#placed-list",
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
/** Catalogue item being placed, if any. */
let placing = null;

/**
 * Editor mode.
 *
 * `editing` is the mode toggle; `grabbed` holds the piece currently being
 * dragged along with the crosshair, plus the transform it had when it was
 * picked up so Escape can put it back.
 */
let editing = false;
let grabbed = null;

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
                '<p class="empty">No spaces yet — describe one above to get started.</p>';
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

async function generateScene() {
    const brief = dom.briefInput.value.trim();
    if (!brief) {
        dom.briefInput.focus();
        return;
    }

    setGenerating(true, "Designing the space — this usually takes 30–90 seconds…");

    try {
        const record = await api("/api/generate", {
            method: "POST",
            body: JSON.stringify({ brief }),
        });
        enterScene(record.id, record.scene);
    } catch (error) {
        setGenerating(false, error.message);
    }
}

function setGenerating(busy, message = "") {
    dom.generateButton.disabled = busy;
    dom.generateButton.textContent = busy ? "Generating…" : "Generate space";
    dom.generateStatus.textContent = message;
    dom.generateStatus.classList.toggle("error", !busy && Boolean(message));
}

async function openScene(sceneId) {
    setGenerating(true, "Opening…");
    try {
        const record = await api(`/api/scenes/${sceneId}`);
        enterScene(record.id, record.scene);
    } catch (error) {
        setGenerating(false, error.message);
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

    experience.world.on("ready", () => setupHud(spec));
    experience.world.on("room", updateRoomReadout);
    experience.world.on("look", onLook);
    experience.world.on("view", updateViewToggle);
    experience.world.on("prompt", onDoorPrompt);
    experience.world.on("tick", () => { if (grabbed) updateGrab(); });
    experience.world.on("catalog", renderFurnitureCatalog);
    experience.world.on("furniture-changed", renderPlacedList);
    experience.world.on("finish-changed", () => scheduleSave());

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

    // In editor mode the crosshair picks furniture rather than surfaces.
    if (editing && !placing) {
        const id = grabbed ? grabbed.id : (target?.kind === "furniture" ? target.id : null);
        experience?.world.sceneBuilder?.highlightFurniture(id);
        if (grabbed) showAction("Click", "Drop");
        else if (id) showAction("Click", "Move · X delete");
        else showAction(null);
        return;
    }

    // Only surfaces can be retextured; the prompt says so when one is aimed at.
    if (!placing && target?.kind === "surface") {
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
    if (placing) return;
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
// Furniture
// ---------------------------------------------------------------------

function renderFurnitureCatalog(catalog) {
    const library = experience?.world.sceneBuilder?.furnitureLibrary;
    if (!library) return;

    const groups = library.itemsByCategory();

    if (groups.size === 0) {
        dom.furnitureList.innerHTML =
            '<p class="hud-note">No models in the catalogue yet.</p>';
        return;
    }

    dom.furnitureList.innerHTML = [...groups]
        .map(
            ([category, items]) => `
            <div class="furniture-group">
                <h6>${escapeHtml(category.label)}</h6>
                <div class="furniture-items">
                    ${items
                        .map(
                            (item) =>
                                `<button class="chip" data-catalog="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`
                        )
                        .join("")}
                </div>
            </div>`
        )
        .join("");
}

function renderPlacedList(furniture = []) {
    if (!furniture.length) {
        dom.placedList.innerHTML = '<p class="hud-note">Nothing placed yet.</p>';
        return;
    }

    const library = experience?.world.sceneBuilder?.furnitureLibrary;
    dom.placedList.innerHTML = furniture
        .map((f) => {
            const name = library?.getItem(f.catalog_id)?.name ?? f.catalog_id;
            return `<div class="placed-row">
                <span>${escapeHtml(name)}</span>
                <button class="icon-button" data-remove="${escapeHtml(f.id)}" title="Remove">×</button>
            </div>`;
        })
        .join("");

    scheduleSave();
}

function setEditing(on) {
    editing = on;
    document.body.classList.toggle("editing", on);
    dom.editorToggle.classList.toggle("is-on", on);
    dom.editorBar.hidden = !on;
    if (!on) {
        if (grabbed) cancelGrab();
        experience?.world.sceneBuilder?.highlightFurniture(null);
    }
    showAction(null);
}

/** Pick up whatever the crosshair is on, so it follows the view. */
function grabFurniture(id) {
    const entry = experience?.world.sceneBuilder?.furniture.get(id);
    if (!entry) return;

    grabbed = {
        id,
        rotation: entry.placement.rotation ?? 0,
        // Kept so Escape can restore the piece exactly where it was.
        original: {
            position: [...entry.placement.position],
            rotation: entry.placement.rotation ?? 0,
        },
    };
    dom.editorHint.textContent = "Click to drop · [ ] rotate · Esc cancel";
}

function dropFurniture() {
    grabbed = null;
    dom.editorHint.textContent = EDITOR_HINT;
}

function cancelGrab() {
    if (!grabbed) return;
    experience?.world.moveFurniture(
        grabbed.id,
        grabbed.original.position,
        grabbed.original.rotation
    );
    dropFurniture();
}

/** Follow the crosshair while a piece is held. */
function updateGrab() {
    if (!grabbed || !experience?.world.player) return;
    const point = experience.world.player.getFloorPointUnderCrosshair();
    experience.world.moveFurniture(
        grabbed.id,
        [point.x, point.y, point.z],
        grabbed.rotation
    );
    experience.world.sceneBuilder?.refreshHighlight();
}

const EDITOR_HINT = "Click a piece to move it · X deletes · M adds";

function startPlacing(catalogId) {
    const library = experience?.world.sceneBuilder?.furnitureLibrary;
    const item = library?.getItem(catalogId);
    if (!item) return;

    placing = { item, rotation: 0 };
    dom.placementName.textContent = item.name;
    dom.placementBar.hidden = false;
    showAction(null);
    toggleMenu(false);
    experience?.camera.requestLock();
}

function cancelPlacing() {
    placing = null;
    dom.placementBar.hidden = true;
}

function commitPlacement() {
    if (!placing || !experience?.world.player) return;

    const point = experience.world.player.getFloorPointUnderCrosshair();
    experience.world.placeFurniture(placing.item.id, point, placing.rotation);
    cancelPlacing();
}

// ---------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------

let saveTimer = null;

/** Debounced save of finishes and furniture back to the stored scene. */
function scheduleSave() {
    if (!currentSceneId || !experience?.world.sceneBuilder) return;

    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await api(`/api/scenes/${currentSceneId}`, {
                method: "PUT",
                body: JSON.stringify({ scene: experience.world.sceneBuilder.spec }),
            });
        } catch (error) {
            console.warn("Could not save changes:", error.message);
        }
    }, 900);
}

async function reviseScene() {
    const instruction = dom.promptInput.value.trim();
    if (!instruction || !currentSceneId) return;

    dom.reviseButton.disabled = true;
    dom.reviseStatus.textContent = "Rebuilding the space…";

    try {
        await api("/api/generate", {
            method: "POST",
            body: JSON.stringify({ id: currentSceneId, instruction }),
        });

        // The world is built once at construction, so the cheapest correct
        // way to show a revision is a reload into the same space.
        dom.reviseStatus.textContent = "Done — reloading…";
        window.location.reload();
    } catch (error) {
        dom.reviseStatus.textContent = error.message;
        dom.reviseButton.disabled = false;
    }
}

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

dom.generateButton.addEventListener("click", generateScene);

dom.sceneList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-scene]");
    if (card) openScene(card.dataset.scene);
});

document.querySelector(".launcher-examples")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-example]");
    if (chip) {
        dom.briefInput.value = chip.dataset.example;
        dom.briefInput.focus();
    }
});

dom.menuButton.addEventListener("click", () => toggleMenu());

/**
 * First / third person, from the HUD.
 *
 * The keyboard has always had `V` for this, but nothing on screen said so —
 * which made a first-person walkthrough, the whole point of the tool, look
 * like it did not exist. The button and the key run through the same path.
 */
dom.editorToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setEditing(!editing);
});

dom.viewToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    experience?.world?.player?.toggleView();
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

dom.reviseButton.addEventListener("click", reviseScene);

dom.leaveButton.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("scene");
    window.location.href = url.toString();
});

dom.chatSend.addEventListener("click", sendChat);

dom.finishGrid.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-finish]");
    if (!swatch || !pickerSurface) return;

    experience?.world.setFinish(pickerSurface.surfaceId, swatch.dataset.finish);
    pickerSurface = { ...pickerSurface, finish: swatch.dataset.finish };
    renderFinishGrid(pickerSurface);
});

dom.finishClose.addEventListener("click", () => closeFinishPicker());

dom.furnitureList.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-catalog]");
    if (chip) startPlacing(chip.dataset.catalog);
});

dom.placedList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (button) experience?.world.removeFurniture(button.dataset.remove);
});

// A click in editor mode picks a piece up, or puts it down again.
// (Registered before the placement handler so the two never both fire.)
dom.canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

    if (editing && !placing) {
        if (grabbed) dropFurniture();
        else if (lookTarget?.kind === "furniture") grabFurniture(lookTarget.id);
        return;
    }

    if (!placing) return;
    event.preventDefault();
    commitPlacement();
});

// Rotate the ghost with the wheel as well as the bracket keys.
dom.canvas.addEventListener(
    "wheel",
    (event) => {
        if (!placing) return;
        event.preventDefault();
        placing.rotation += Math.sign(event.deltaY) * 15;
    },
    { passive: false }
);

document.addEventListener("keydown", (event) => {
    // Only meaningful once we're actually in a space.
    if (!experience) return;

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

    // Editor mode owns its keys, so rotating a held piece cannot also nudge
    // the camera or fire a walkthrough shortcut.
    if (editing && !placing && !isChatOpen() && !typingElsewhere) {
        if (event.key === "Escape") {
            if (grabbed) cancelGrab();
            else setEditing(false);
            return;
        }
        if (grabbed && (event.key === "[" || event.key === "]")) {
            grabbed.rotation += event.key === "[" ? -15 : 15;
            return;
        }
        if ((event.key === "x" || event.key === "X" || event.key === "Delete")) {
            const id = grabbed?.id ?? (lookTarget?.kind === "furniture" ? lookTarget.id : null);
            if (id) {
                if (grabbed) dropFurniture();
                experience?.world.removeFurniture(id);
            }
            return;
        }
    }

    // Placement mode owns its keys until it ends.
    if (placing) {
        if (event.key === "Escape") {
            cancelPlacing();
            return;
        }
        if (event.key === "[") {
            placing.rotation -= 15;
            return;
        }
        if (event.key === "]") {
            placing.rotation += 15;
            return;
        }
    }

    if ((event.key === "g" || event.key === "G") && !typingElsewhere && !isChatOpen()) {
        event.preventDefault();
        setEditing(!editing);
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

/**
 * What a visitor to a public view has chosen in its menu, kept on their
 * device for every space they open: how it is lit (Utils/device.js's
 * lightingMode, or null for as the version is published) and which pieces
 * of scenery they have hidden (World/Scenery.js) — a slow phone is as slow
 * in every space. Without storage — a private window — nothing is kept.
 */
const LIGHTING = "view-lighting";
const SCENERY = "view-scenery";
const LOST = "view-lost-graphics";

/**
 * Only ever lighter than the visitor would be given: "static". A choice
 * kept from when the menu offered more — "live", the whole house lit live,
 * or "baked" on a phone — is as published again.
 *
 * @returns {"static"|null}
 */
export function chosenLighting() {
    return read(LIGHTING) === "static" ? "static" : null;
}

/** @param {"static"|null} mode  null: as published */
export function chooseLighting(mode) {
    write(LIGHTING, mode);
}

/**
 * The graphics gave up drawing on this visit (Utils/device.js's
 * guardContextLoss): kept, for the next to say why it starts as light as
 * it does.
 */
export function noteLostGraphics() {
    write(LOST, "1");
}

/** Whether they gave up on the last visit — asked once: it is forgotten as it is answered. */
export function lostGraphics() {
    const lost = read(LOST) === "1";
    if (lost) write(LOST, null);
    return lost;
}

/** The ids (shared/scenery.js) hidden. */
export function hiddenScenery() {
    try {
        const list = JSON.parse(read(SCENERY) || "[]");
        return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
    } catch {
        return new Set();
    }
}

/** @param {Iterable<string>} hidden */
export function hideScenery(hidden) {
    write(SCENERY, JSON.stringify([...hidden]));
}

function read(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // Kept for this visit only.
    }
}

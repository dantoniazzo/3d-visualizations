/**
 * What a visitor to a public view has chosen in its menu, kept on their
 * device for every space they open: how it is lit (Utils/device.js's
 * lightingMode, or null for as the version is published) and which pieces
 * of scenery they have hidden (World/Scenery.js) — a slow phone is as slow
 * in every space. Without storage — a private window — nothing is kept.
 */
const LIGHTING = "view-lighting";
const SCENERY = "view-scenery";

/** @returns {"live"|"baked"|"static"|null} */
export function chosenLighting() {
    const value = read(LIGHTING);
    return value === "live" || value === "baked" || value === "static" ? value : null;
}

/** @param {"live"|"baked"|"static"|null} mode  null: as published */
export function chooseLighting(mode) {
    write(LIGHTING, mode);
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

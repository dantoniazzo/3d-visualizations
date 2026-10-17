/**
 * What the visitor can act on, and with which key: the decisions behind the
 * walkthrough's crosshair and its prompt (frontend/Experience/World/
 * Interactables.js, Player.js), worked out from distances along the look ray
 * and nothing else — no scene, no page — so they run in node
 * (scripts/test-interact.mjs) exactly as they run in the page.
 *
 * WHAT IS AIMED AT. The crosshair's ray, cast from the head, meets the first
 * solid thing at `sight`. Whatever can be acted on along it — a door's leaf,
 * a cupboard's door or a drawer, a light or its switch, a window, a seat, a
 * television, and later a tap or a shower — is a candidate at its own distance
 * along the ray. One is aimed at if it is within its kind's reach (`REACH`)
 * and not behind the first solid thing by more than its kind's slack
 * (`SLACK`): a light's box stands a little proud of the light and is met
 * first; a piece with doors or drawers collides as its shut box in a public
 * view, a handle's depth in front of them, and its own doors and drawers are
 * aimed at through it. Of those, the nearest along the ray — but within 5 cm
 * (`TIE`) the more particular thing (`PRIORITY`): a light switch on the wall
 * beside a door's frame, a drawer in a cupboard's face. So a light's box met
 * within 5 cm of a door's leaf is the light, as it always was, and a door or
 * drawer met more than 5 cm nearer than a light is the door or the drawer.
 *
 * WHAT IS NEAR. A door need not be aimed at: the key opens the nearest within
 * `REACH.doorNear`, measured across the floor, when nothing else is aimed at —
 * of the doors on the visitor's own floor (`doorOnFloor`), not one upstairs
 * over their head or downstairs under their feet.
 * A car within `REACH.car` of its middle is offered before anything aimed at
 * (it is the more particular thing to be standing beside), on its own key.
 */

/**
 * How far each kind can be acted on from, in metres from the head: aimed at
 * along the crosshair's ray, or — `doorNear`, `car` — stood near, across the
 * floor. The crosshair itself sees 4 m (Player's look ray).
 */
export const REACH = Object.freeze({
    /** A door's leaf aimed at: as far as the crosshair sees. */
    door: 4,
    /** The nearest door, not aimed at: an arm's length and a step. */
    doorNear: 2.2,
    /** A piece of furniture's door or drawer. */
    openable: 2.5,
    /** A light, or its switch on the wall. */
    light: 4,
    /** A car, from its middle: a long car's door is a couple of metres from it. */
    car: 3.4,
    /** A seat's point, a little over its cushion (World/Seats.js). */
    seat: 2.0,
    /** A television's glass, from in front: further than the crosshair sees, by a ray of its own (World/Screens.js). */
    tv: 5,
    /** A window's sash, or the hole of its pane, from the room's side (World/Sash.js). */
    window: 2.0,
    // Kept for what comes next, so that each is said once, here.
    tap: 1.6,
    shower: 2.0,
});

/**
 * How far under the head the foot of a door opened with nothing aimed at may
 * stand (doorOnFloor): the head is 1.55 m over the feet (Player.js's capsule),
 * so 0.85 m under the feet — a step or two down, never the floor below.
 */
export const DOOR_BELOW = 2.4;

/**
 * Whether a door not aimed at is on the floor of a visitor whose head is at
 * `head`: its foot — its threshold, where Door.js hangs its leaf from, at its
 * wall's base — at `foot`, not above the head, nor more than DOOR_BELOW under
 * it (SceneBuilder.nearestDoor). A door upstairs, over a bedroom below it, is
 * not; nor is one downstairs, under it.
 */
export function doorOnFloor(head, foot) {
    const below = head - foot;
    return below >= 0 && below <= DOOR_BELOW;
}

/**
 * How far behind the first solid thing the crosshair meets a candidate may be
 * met and still be the one aimed at, by kind.
 */
export const SLACK = Object.freeze({
    /** A light's box stands a little proud of the light, round its switch plate too. */
    light: 0.05,
    /** A piece with doors or drawers collides as its shut box, a handle's depth in front of them (public view). */
    openable: 0.25,
    /** Anything else: what the ray met first is the thing itself, give or take a rounding. */
    default: 0.05,
});

/** Within this distance along the ray of each other, the more particular of two candidates is aimed at. */
export const TIE = 0.05;

/**
 * Which of two candidates met within `TIE` of each other is aimed at: the
 * higher. A light's switch before the door beside it, a drawer or a window
 * before the wall's door, and anything before what it is fitted in or stands
 * on — a tap before the basin's cupboard, a seat last of all, since sitting
 * is never what someone aiming at a door meant.
 */
export const PRIORITY = Object.freeze({
    light: 5,
    openable: 4,
    window: 4,
    door: 3,
    tap: 2,
    shower: 2,
    tv: 2,
    seat: 1,
    default: 0,
});

/**
 * The candidate aimed at.
 *
 * @param {{ kind: string, distance: number, reach?: number, slack?: number, priority?: number }[]} candidates
 *        what the ray met that can be acted on, each at its distance along
 *        the ray; a candidate's own `reach`, `slack` or `priority` stand in
 *        for its kind's
 * @param {number} [sight]  how far the ray sees: to the first solid thing it meets
 * @returns {object|null}  the one aimed at, or null
 */
export function pickTarget(candidates, sight = Infinity) {
    let best = null;
    for (const candidate of candidates) {
        if (!aimable(candidate, sight)) continue;
        if (!best || candidate.distance < best.distance) best = candidate;
    }
    if (!best) return null;
    // Within a hand's breadth of the nearest, the more particular thing.
    let chosen = best;
    for (const candidate of candidates) {
        if (candidate === best || candidate.distance > best.distance + TIE || !aimable(candidate, sight)) continue;
        const rank = priorityOf(candidate);
        const chosenRank = priorityOf(chosen);
        if (rank > chosenRank || (rank === chosenRank && candidate.distance < chosen.distance)) chosen = candidate;
    }
    return chosen;
}

/** Whether a candidate can be the one aimed at: within its reach, and not behind what the ray met first. */
function aimable(candidate, sight) {
    const reach = candidate.reach ?? REACH[candidate.kind] ?? Infinity;
    const slack = candidate.slack ?? SLACK[candidate.kind] ?? SLACK.default;
    return candidate.distance <= reach && candidate.distance <= sight + slack;
}

function priorityOf(candidate) {
    return candidate.priority ?? PRIORITY[candidate.kind] ?? PRIORITY.default;
}

/**
 * The lights of a room switched with one key: if any of its switches is on,
 * all of them off; otherwise all of them on.
 *
 * @param {{ id: string }[]} items  the room's switches
 * @param {(id: string) => boolean} isOn
 * @returns {{ ids: string[], on: boolean }}  which to set, and to what; no ids, nothing to switch
 */
export function roomLightPlan(items, isOn) {
    const ids = items.map((item) => item.id);
    return { ids, on: !ids.some((id) => isOn(id)) };
}

/**
 * The icons the touch screen's action button draws (frontend/styles/
 * components/hud.scss, `.touch-action-icon[data-icon=…]`), CSS alone.
 */
export const ICONS = Object.freeze(["door", "drawer", "car", "light", "finish", "seat", "tv", "water", "window"]);

/**
 * Where a key does something (`scopes`):
 *   walk    on foot, in the walkthrough
 *   bird    in the view from above (a public view's)
 *   drive   at the wheel
 * and, to narrow those down:
 *   editor  only in the editor's walkthrough
 *   public  only in a public view
 *   debug   only where the colliders can be shown: the editor, or a public
 *           link with `?debug` or `?colliders` (Experience/Colliders.js)
 * Edit mode has keys of its own (Editor/Editor.js) and is not listed.
 */
export const SCOPES = Object.freeze(["walk", "bird", "drive", "editor", "public", "debug"]);

/**
 * Every key of the walkthrough, once: which physical key (`code`, as
 * `KeyboardEvent.code` names it — several, for keys that work together),
 * what its cap says (`key`), what it does (`action`, and `label` in a few
 * words for a hint), where (`scopes`), and the touch screen's icon for it
 * where it has a button (`touch`; E's is whatever is aimed at's). The
 * hints are drawn from it.
 *
 * Player.js reads its keys by `code`, as WASD are — where they are on the
 * keyboard, not what is printed on them; frontend/index.js reads the app's
 * older letter keys by `key`.
 */
export const KEYS = Object.freeze([
    { code: ["KeyW", "KeyA", "KeyS", "KeyD"], key: "WASD", action: "move", label: "move", scopes: ["walk", "bird"] },
    { code: ["KeyW", "KeyA", "KeyS", "KeyD"], key: "WASD", action: "steer", label: "drive and steer", scopes: ["drive"] },
    { code: "ShiftLeft", key: "Shift", action: "run", label: "run", scopes: ["walk", "bird"] },
    { code: "Space", key: "Space", action: "jump", label: "jump", scopes: ["walk", "bird"] },
    { code: "Space", key: "Space", action: "brake", label: "brake", scopes: ["drive"] },
    { code: "KeyE", key: "E", action: "act", label: "open, sit, switch a TV or a tap: what you aim at", scopes: ["walk", "bird"], touch: null },
    { code: "KeyQ", key: "Q", action: "room-lights", label: "lights of the room you are in", scopes: ["walk", "bird"], touch: "light" },
    { code: "KeyC", key: "C", action: "colliders", label: "colliders (Shift+C x-ray)", scopes: ["walk", "bird", "drive", "debug"] },
    { code: "KeyF", key: "F", action: "car", label: "get in or out of a car", scopes: ["walk", "bird", "drive"], touch: "car" },
    { code: "KeyH", key: "H", action: "headlights", label: "headlights", scopes: ["drive"] },
    { code: "KeyB", key: "B", action: "bird", label: "each floor from above, driving too", scopes: ["walk", "bird", "drive", "public"] },
    { code: "KeyV", key: "V", action: "view", label: "first / third person; from above, back down", scopes: ["walk", "bird", "drive"] },
    { code: "KeyO", key: "O", action: "dance", label: "dance", scopes: ["walk", "bird"] },
    { code: "KeyN", key: "N", action: "day-night", label: "day or night", scopes: ["walk", "bird", "drive"] },
    { code: "KeyL", key: "L", action: "lights", label: "the lights panel", scopes: ["walk", "bird", "drive"] },
    { code: "KeyK", key: "K", action: "live-room", label: "the room you are in, live", scopes: ["walk", "public"] },
    { code: "KeyP", key: "P", action: "preview", label: "realistic preview", scopes: ["walk", "drive", "editor"] },
    { code: "KeyT", key: "T", action: "finish", label: "change a finish", scopes: ["walk", "editor"], touch: "finish" },
    { code: "KeyM", key: "M", action: "menu", label: "menu", scopes: ["walk", "bird", "drive"] },
    { code: "Enter", key: "Enter", action: "chat", label: "chat", scopes: ["walk", "bird", "drive"] },
    { code: ["PageUp", "PageDown"], key: "PgUp/PgDn", action: "floor", label: "floor up or down", scopes: ["bird", "public"] },
]);

/**
 * The keys that do something now.
 *
 * @param {object} where
 * @param {"walk"|"bird"|"drive"} where.state  on foot, from above or at the wheel
 * @param {boolean} where.editor  the editor's walkthrough, not a public view
 * @param {boolean} [where.debug]  whether the colliders can be shown
 * @returns {object[]}  KEYS' entries, in its order
 */
export function keysFor({ state, editor, debug = false }) {
    return KEYS.filter(({ scopes }) => {
        if (!scopes.includes(state)) return false;
        if (scopes.includes("editor") && !editor) return false;
        if (scopes.includes("public") && editor) return false;
        if (scopes.includes("debug") && !debug) return false;
        return true;
    });
}

/** KEYS' entry for an action, or null. */
export function keyOf(action) {
    return KEYS.find((entry) => entry.action === action) ?? null;
}

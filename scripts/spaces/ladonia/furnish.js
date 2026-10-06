/**
 * Every flat of Ladonia Residence furnished, and every terrace: placed
 * where the developer's plans draw each bed, sofa, table, kitchen and
 * bathroom fitting, in the style of its renders — A's honey oak and
 * mustard kitchens with an oak table under a felt dome, B's and C's sage
 * kitchens with round white tables, oak chairs and pleated pendants,
 * linen sofas and felt headboards throughout; outside, a round garden
 * table under a woven pendant and orange lounge chairs on each ground
 * terrace, and on each roof a dining table under its pergola, a jacuzzi,
 * loungers under a parasol and an outdoor kitchen against the stone box.
 *
 * The pieces are lib/ladonia.py's (`npm run furniture`), sized from the
 * catalogue: a piece set against a wall is placed by the wall's face and
 * where along it its middle is, and faces away from it.
 */
import { readFileSync } from "node:fs";

import { FACE } from "./kit.js";

const CATALOG = JSON.parse(readFileSync(new URL("../../../public/models/furniture/catalog.json", import.meta.url), "utf8"));
/** Each piece's [width, height, depth] as it stands facing north. */
const SIZE = Object.fromEntries(CATALOG.items.map((item) => [item.id, item.size]));
/** Pieces modelled facing south (joinery.py's -Y front) rather than north. */
const SOUTHWARD = new Set(["wc", "washing-machine", "fridge", "kitchen-run", "nightstand", "wardrobe", "microwave"]);
/** The way a piece faces with its back to a wall on that side. */
const AWAY = { N: "S", S: "N", W: "E", E: "W" };

const round = (n) => Math.round(n * 1000) / 1000;
const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

function size(id) {
    const s = SIZE[id];
    if (!s) throw new Error(`furnish: no catalogue piece "${id}" — run \`npm run furniture\``);
    return s;
}

/** A piece standing at (x, z) on the floor at `y`, facing `face` (N/S/E/W or degrees), at `scale`. */
function put(b, id, x, z, face = "N", y = 0, scale = 1) {
    size(id);
    const deg = (typeof face === "string" ? FACE[face] : face) + (SOUTHWARD.has(id) ? 180 : 0);
    b.put(id, round(x), round(z), wrap(deg), y, scale);
}

/**
 * A piece with its back to a wall: the wall on its `wall` side, its face at
 * `line`, the piece's middle `at` along it.
 */
function against(b, id, wall, line, at, { y = 0, gap = 0, scale = 1 } = {}) {
    const half = (size(id)[2] * scale) / 2 + gap;
    const [x, z] = { N: [at, line + half], S: [at, line - half], W: [line + half, at], E: [line - half, at] }[wall];
    put(b, id, x, z, AWAY[wall], y, scale);
}

/**
 * A fitted kitchen `length` long from `from` along a wall, its tall units
 * at the `tall` end ("lo" or "hi", along the wall). The pieces have them at
 * their own left; facing the other way round, the "-r" one at the right.
 */
function kitchen(b, scheme, length, wall, line, from, { tall = "lo", y = 0 } = {}) {
    const left = { N: "lo", S: "hi", W: "hi", E: "lo" }[AWAY[wall]];
    against(b, `ld-kitchen-${scheme}-${Math.round(length * 10)}${tall === left ? "" : "-r"}`, wall, line, from + length / 2, { y });
}

/** A pendant hanging from a ceiling (or pergola) at `top`. */
function hang(b, id, x, z, top) {
    put(b, id, x, z, "N", round(top - size(id)[1]));
}

/**
 * A table and its chairs: `per` a side along its length (x or z), each
 * pushed `tuck` under the top (the plans draw C's well under).
 */
function dining(b, table, chair, x, z, { along = "x", per = 3, y = 0, pitch = 0.62, tuck = 0.12 } = {}) {
    put(b, table, x, z, along === "x" ? "N" : "W", y);
    const off = size(table)[2] / 2 + size(chair)[2] / 2 - tuck;
    for (let k = 0; k < per; k += 1) {
        const t = (k - (per - 1) / 2) * pitch;
        if (along === "x") {
            put(b, chair, x + t, z - off, "S", y);
            put(b, chair, x + t, z + off, "N", y);
        } else {
            put(b, chair, x - off, z + t, "E", y);
            put(b, chair, x + off, z + t, "W", y);
        }
    }
}

/** A round table and `n` chairs round it, the first at `start` degrees (0: south of it). */
function roundSet(b, table, chair, x, z, { n = 4, start = 45, y = 0 } = {}) {
    put(b, table, x, z, "N", y);
    const r = size(table)[0] / 2 + size(chair)[2] / 2 - 0.12;
    for (let k = 0; k < n; k += 1) {
        const a = start + (k * 360) / n;
        const rad = (a * Math.PI) / 180;
        // A chair at (sin a, cos a) from the middle faces back towards it: a°.
        put(b, chair, x + r * Math.sin(rad), z + r * Math.cos(rad), a, y);
    }
}

/**
 * The same placements mirrored north–south about `axis` (z → 2·axis − z):
 * for building C, whose south flats are its north ones turned about the
 * middle. A handed piece cannot be mirrored by turning it: `hand` swaps it
 * for its other hand (shower-m, chaise right, C's -c2 and low counter -r).
 */
function mirrored(b, axis) {
    const flip = { N: "S", S: "N", E: "E", W: "W" };
    const hand = (id) => ({ shower: "shower-m", "shower-m": "shower" })[id] ?? id.replace(/-chaise-([lr])$/, (_, s) => `-chaise-${s === "l" ? "r" : "l"}`).replace(/^(ld-(?:kitchen-sage-c2|shower-walkin-c2|counter-sage-low-24))(-r)?$/, (_, base, r) => (r ? base : `${base}-r`));
    const m = (z) => round(2 * axis - z);
    return {
        put: (bb, id, x, z, face = "N", y = 0) => put(bb, hand(id), x, m(z), typeof face === "string" ? flip[face] : 180 - face, y),
        against: (bb, id, wall, line, at, opts) => (wall === "N" || wall === "S" ? against(bb, hand(id), flip[wall], m(line), at, opts) : against(bb, hand(id), wall, line, m(at), opts)),
        kitchen: (bb, scheme, length, wall, line, from, { tall = "lo", y = 0 } = {}) =>
            wall === "N" || wall === "S"
                ? kitchen(bb, scheme, length, flip[wall], m(line), from, { tall, y })
                : kitchen(bb, scheme, length, wall, line, m(from + length), { tall: tall === "lo" ? "hi" : "lo", y }),
        hang: (bb, id, x, z, top) => hang(bb, id, x, m(z), top),
        dining: (bb, table, chair, x, z, opts) => dining(bb, table, chair, x, m(z), opts),
        roundSet: (bb, table, chair, x, z, { start = 45, ...opts } = {}) => roundSet(bb, table, chair, x, m(z), { ...opts, start: 180 - start }),
    };
}
const plain = { put, against, kitchen, hang, dining, roundSet };

/** The felt headboard hung over each bed, by its width (render 21: about 1.15 times it). */
const HEADBOARD = {
    "ld-bed": "ld-headboard-210",
    "ld-bed-sage": "ld-headboard-210-sage",
    "ld-bed-sage-160": "ld-headboard-180-sage",
    "ld-bed-sage-140": "ld-headboard-160-sage",
    "ld-bed-single": "ld-headboard-110",
    "ld-bed-single-80": "ld-headboard-90-sage",
};
/** Each bed's base, which the drawers touch: the duvet and throw hang wider. */
const BED_BASE = { "ld-bed": 1.84, "ld-bed-sage": 1.84, "ld-bed-sage-160": 1.64, "ld-bed-sage-140": 1.44, "ld-bed-single": 0.94, "ld-bed-single-80": 0.84 };

/**
 * A bed against a wall as render 21 has it: the felt headboard on the wall
 * (its own piece, 0.55 up, centred at `hb` — on the wall rather than the
 * bed where the room asks), the bed 4 cm off it, a floating walnut drawer
 * either side touching the base (`long`: a metre one on the +z or +x side,
 * the room's), and the reading light over the headboard. Singles get the
 * headboard only; `panel` overrides the headboard (a sage one for B's).
 */
function bedSet(f, b, id, wall, line, at, { y = 0, long = false, hb = at, panel = HEADBOARD[id], stand = "ld-nightstand-60", stands = true, light = true } = {}) {
    f.against(b, panel, wall, line, hb, { y: y + 0.55 });
    f.against(b, id, wall, line, at, { y, gap: 0.04 });
    if (id.includes("single")) return;
    const w = BED_BASE[id] ?? size(id)[0];
    if (stands) {
        for (const side of [-1, 1]) {
            const ns = long && side > 0 ? "ld-nightstand" : stand;
            f.against(b, ns, wall, line, at + side * (w / 2 + 0.01 + size(ns)[0] / 2), { y: y + 0.28 });
        }
    }
    if (light) f.against(b, "ld-wall-light", wall, line, hb, { y: y + 1.165 });
}

/** Each building's look, after its renders. */
const LOOK = {
    ochre: { table: "ld-dining-oak", small: "ld-dining-oak-4", chair: "ld-chair-shell", pendant: "ld-pendant-felt", media: "ld-media-ochre", rug: "ld-rug-sage", bed: "ld-bed", sofa: "ld-sofa-boucle-chaise-l", corner: "ld-sofa-boucle-corner", single: "ld-headboard-110" },
    sage: { table: "ld-dining-oak", small: "ld-table-round", chair: "ld-chair-oak", pendant: "ld-pendant-pleat", media: "ld-media-oak", rug: "ld-rug-round", bed: "ld-bed-sage", sofa: "ld-sofa-chaise-l", corner: "ld-sofa-corner", single: "ld-headboard-110-sage" },
};

/** A small table: an oak four-seater along `along`, or a round one. */
function smallTable(f, b, L, x, z, { along = "x", y = 0 } = {}) {
    if (L.small === "ld-table-round") f.roundSet(b, L.small, L.chair, x, z, { y, start: 0 });
    else f.dining(b, L.small, L.chair, x, z, { along, per: 2, y, pitch: 0.7 });
}

// ---------------------------------------------------------------------
// Buildings A and B
// ---------------------------------------------------------------------

/** Each terrace's garden set: a round table, four chairs, a woven pendant over it. */
function gardenTable(b, x, z, { y = 0, top = null } = {}) {
    roundSet(b, "ld-out-table", "ld-out-chair", x, z, { y, start: 45 });
    if (top != null) hang(b, "ld-pendant-woven", x, z, top);
}
/** Two orange lounge chairs facing `face` either side of a white side table. */
function loungePair(b, x, z, face, { y = 0, along = "x" } = {}) {
    const [dx, dz] = along === "x" ? [0.65, 0] : [0, 0.65];
    put(b, "ld-out-lounge", x - dx, z - dz, face, y);
    put(b, "ld-out-lounge", x + dx, z + dz, face, y);
    put(b, "ld-out-side", x, z, "N", y);
}

export function furnishAB(b, { scheme = "ochre", pool = false } = {}) {
    const L = LOOK[scheme];
    const s = scheme;
    const top = 2.75; // ceilings, a storey less the slab
    const F = 3.0;
    const R = 6.0;

    // --- A1: through the middle, its garden behind --------------------
    // A's is render 18's, as drawn: the oak column at its east end; B's
    // the same order in sage, the hob west and the sink by the column.
    against(b, `ld-kitchen-${s}-a1`, "S", 9.745, 4.4);
    // The TV wall on the plan's line: A's against the kitchen's oak column
    // (render 17), B's centred on the plan's TV.
    against(b, L.media, "S", 9.745, s === "ochre" ? 7.06 : 7.37);
    // The sofa where the plan draws it (x 5.9–8.65), its back on the oak
    // wall's face; the coffee table 0.35–0.4 m before its main seats, so
    // 0.8 m is left past it to the TV wall.
    against(b, L.sofa, "N", 6.33, 7.27);
    put(b, L.rug, 6.8, 8.0, "N");
    // Track spots along the kitchen and the oak wall; the print on the
    // oak, past the dining chairs' backs.
    hang(b, "ld-track-50", 5.4, 8.95, top);
    hang(b, "ld-track-30", 6.4, 6.95, top);
    against(b, "ld-art-dracaena", "N", 6.33, 4.8, { y: 1.0 });
    put(b, "ld-coffee-slat", 6.8, s === "ochre" ? 8.08 : 8.0);
    // The plan's four-seat table along the room (x 2.9–4.6), two chairs a
    // side pushed in as it draws them: 0.46 m behind the chairs on the oak
    // wall's side, 0.8 m before the kitchen.
    const az = s === "ochre" ? 7.545 : 7.555;
    dining(b, "ld-dining-oak-4s", L.chair, 3.74, az, { along: "x", per: 2, pitch: 0.78, tuck: 0.155 });
    hang(b, L.pendant, 3.74, az, top);
    put(b, "ld-table-decor", 3.74, az, "N", 0.75);
    // The oak sideboard under the garden window, between its two glazed
    // doors: the bust and lantern on it, the lamp at its north end.
    against(b, "ld-sideboard-18", "W", 1.5, 7.2);
    put(b, "ld-sideboard-decor", 1.75, 7.2, "E", 0.75);
    put(b, "ld-table-lamp", 1.72, 6.52, "N", 0.75);
    put(b, "ld-coffee-maker", 4.47, 9.45, "N", 0.92);
    // Its bedrooms: one in each wing. (No curtain at the bedroom's west
    // window: anywhere on that wall one stands in the only way round the
    // bed's foot or before the wardrobe.)
    bedSet(plain, b, L.bed, "E", 3.26, 2.15);
    against(b, "ld-wardrobe-15", "S", 4.85, 1.12);
    // Bedroom 2: the plan's bed and its narrow drawers, the wardrobe's side kept the wider.
    bedSet(plain, b, L.bed, "S", 12.94, 1.85, { stand: "ld-nightstand-45" });
    against(b, "ld-wardrobe-21", "E", 4.09, 11.03);
    // Its bathroom, reaching north into the wing as the plan draws it: the
    // basin and the WC on the north wall, the shower in the south-east
    // corner, its glass door to the west, the door hinged at its south jamb.
    put(b, "shower", 5.19, 5.71, 90);
    against(b, "wc", "N", 4.48, 4.28);
    against(b, "vanity-small", "N", 4.48, 3.56, { y: 0.34 });
    // The washing machine beside A1's front door.
    against(b, "washing-machine", "S", 9.745, 8.9);

    // --- A2: the north wing ------------------------------------------
    // The oak volume round the entry wardrobes the wall's whole length,
    // its TV towards the south end (render 20).
    against(b, "ld-tv-volume-30", "W", 9.26, 1.85);
    // B's sheers across its north glazing from the door to the corner
    // (render 19), clear of the door; A's glazing is left bare (render 22).
    if (s === "sage") against(b, "ld-curtain-wide", "N", 0.35, 12.3, { gap: 0.02 });
    // On the slanted east wall: B's low oak cabinet with its lamp (render
    // 19; A's would stand where no one can reach it, behind the table),
    // oak boxes over it, a sheer stacked beside it.
    if (s === "sage") put(b, "ld-cabinet", 13.51, 0.95, 102.4);
    put(b, "ld-shelf-cubes", 13.64, 0.95, 102.4, 1.25);
    if (s === "sage") put(b, "ld-sheer-05", 13.83, 1.72, 102.4);
    hang(b, "ld-track-40", 11.7, 4.05, top);
    // The LED track over the sofa, clear of the oak volume's top.
    hang(b, "ld-track-40-led", 11.75, 1.8, top);
    // The plan's corner sofa facing the TV, its chaise to the south, its
    // back on the plan's line less the room the four chairs behind it
    // need; the plan's round side table before its north seats, close to
    // them so 0.7 m stays past the TV volume (the plan's wardrobe depth) for
    // the way in from the garden door: B's the teak drum (render 19), A's
    // the 0.6 m microcement drum, as the bouclé seat is deeper.
    against(b, L.sofa, "E", s === "ochre" ? 12.455 : 12.39, 1.98);
    put(b, L.rug, 10.9, 1.65, "W");
    if (s === "ochre") put(b, "ld-coffee-round-60", 10.9, 1.6);
    else put(b, "ld-stump", 10.92, 1.6);
    // The plan's round table behind the sofa, four chairs on its diagonals.
    const tx = s === "ochre" ? 13.243 : 13.21;
    roundSet(b, "ld-table-round-90", L.chair, tx, 2.62, { n: 4, start: 45 });
    hang(b, L.pendant, tx, 2.62, top);
    put(b, "ld-vase-zigzag", tx, 2.62, "N", 0.75);
    // The plan's run to the slanted wall: the fridge and pantry by the
    // hall, the sink, the hob, then render 20's oven column (B) or render
    // 18's open shelf column (A) at the end.
    against(b, `ld-kitchen-${s}-a2`, "S", 4.85, 11.925);
    // A2's bedroom (render 21): the bed close to the tall north window,
    // its headboard centred on the wall, the wardrobe in the recess.
    bedSet(plain, b, L.bed, "W", 3.38, 2.15, { long: true, hb: 2.35 });
    against(b, "ld-wardrobe-18", "S", 5.04, 5.855);
    // The curtain drawn open beside the window (render 21), its stack just
    // over the east jamb so the 0.88 m glass stays clear.
    against(b, "ld-curtain-caramel-06", "N", 0.35, 5.06, { gap: 0.02 });
    put(b, "ld-rug-taupe-26", 4.9, 2.15, "W");
    // The twin room: the beds' heads on the west wall, two drawers between them.
    bedSet(plain, b, "ld-bed-single", "W", 6.12, 0.9, { panel: L.single });
    bedSet(plain, b, "ld-bed-single", "W", 6.12, 2.75, { panel: L.single });
    against(b, "ld-nightstand-40", "W", 6.12, 1.585, { y: 0.28 });
    against(b, "ld-nightstand-40", "W", 6.12, 2.065, { y: 0.28 });
    // A2's bathroom, the plan's: its door off the hall, the hand
    // basin and the washer on that wall, the WC on the east wall, the
    // shower in its west corner, its door to the east, past the plan's
    // 0.2 m duct (A1's) on its west.
    put(b, "shower", 6.42, 5.66, -90);
    against(b, "vanity-small", "N", 4.48, 7.36, { y: 0.34 });
    against(b, "washing-machine", "N", 4.48, 8.92);
    against(b, "wc", "E", 9.22, 5.72);

    // --- A3: the south wing ------------------------------------------
    // The plan's corner kitchen: the hob on the twin room's wall, the sink
    // under the high window, the twin room's open door clear of its end.
    against(b, `ld-kitchen-${s}-l`, "S", 16.3, 4.655);
    // The plan's four-seat table along the room, its end at the sink's
    // counter, two chairs a side pushed in: 0.8 m kept before the hob, and
    // the way in from the front door past the sofa.
    dining(b, "ld-dining-oak-4s", L.chair, 5.6, 14.68, { along: "z", per: 2, pitch: 0.8, tuck: 0.155 });
    hang(b, L.pendant, 5.6, 14.68, top);
    // The plan's corner sofa, its backs on the south wall (over the glass,
    // as drawn) and along the west, facing the TV on the bedroom's wall.
    against(b, `${L.corner}-s-l`, "S", 16.3, 8.255);
    against(b, "ld-tv-wall", "N", 13.06, 8.88, { y: 0.95 });
    put(b, L.rug, 8.7, 14.45, "N");
    // The bed's head on the north wall where the plan centres it (the
    // wall lined out to the façade's face), the wardrobe along the
    // bathroom wall from its drawer to the niche's wall: the plan's 2.2 m
    // would have its doors open onto the drawer.
    bedSet(plain, b, L.bed, "N", 9.98, 8.65);
    against(b, "ld-wardrobe-18", "W", 6.3, 11.28);
    // The twin room: the beds' heads on the west wall, one against each
    // long wall, a small wardrobe between their heads.
    bedSet(plain, b, "ld-bed-single", "W", 0.35, 13.61, { panel: L.single });
    bedSet(plain, b, "ld-bed-single", "W", 0.35, 15.75, { panel: L.single });
    against(b, "ld-wardrobe-10", "W", 0.35, 14.68);
    // A3's bathroom, the plan's: the shower in the north-west corner
    // opening south (the mirrored corner shower), the washer in the
    // north-east corner, the basin and the WC on facing walls south of
    // them; the entry wardrobe in its niche, opposite the front door.
    put(b, "shower-m", 4.71, 10.325, 180);
    against(b, "washing-machine", "N", 9.865, 5.875);
    against(b, "vanity-small", "W", 4.21, 11.69, { y: 0.34 });
    against(b, "wc", "E", 6.18, 11.75);
    against(b, "ld-wardrobe-12", "N", 12.3, 6.21);

    // --- The upper north flat -----------------------------------------
    const o = { y: F };
    // Every double here has the plan's 0.45 m drawers either side.
    const n45 = { ...o, stand: "ld-nightstand-45" };
    // Bedroom 1: the bed's head on the west wall where the plan centres it;
    // the wardrobe in the alcove along the south wall, 1.8 m rather than the
    // plan's 2.1 so the door's 0.9 m leaf, opening in, clears its end.
    bedSet(plain, b, L.bed, "W", 0.35, 2.17, n45);
    against(b, "ld-wardrobe-18", "S", 4.85, 1.25, o);
    // Bedroom 2 (the 0.45 m drawers keep off both walls): the wardrobe
    // against the partition, clear of the window.
    bedSet(plain, b, L.bed, "W", 3.34, 1.85, n45);
    against(b, "ld-wardrobe-18", "E", 7.04, 1.25, o);
    // Bedroom 3: the single bed's head on the north wall under the window,
    // along the east wall, a drawer at its west; its wardrobe in the box.
    bedSet(plain, b, "ld-bed-single", "N", 0.35, 8.68, { ...o, panel: L.single });
    against(b, "ld-nightstand-45", "N", 0.35, 7.975, { y: F + 0.28 });
    against(b, "ld-wardrobe-10", "W", 6.5, 2.78, o);
    // The table along the room by the bedroom wall, as the plan sets it;
    // behind its chairs the chaise sofa, its back to them, facing the TV on
    // the slanted wall, the drum table before its seat.
    dining(b, L.table, L.chair, 10.4, 1.89, { along: "z", y: F, pitch: 0.6 });
    hang(b, L.pendant, 10.4, 1.89, F + top);
    against(b, L.sofa.replace(/-l$/, "-r"), "W", 11.45, 2.06, o);
    put(b, L.rug, 12.85, 1.9, "W", F);
    // The boucle seat is 0.12 m deeper: the drum steps east to keep 0.35 m.
    put(b, "ld-stump", s === "ochre" ? 13.25 : 13.15, 1.67, "N", F);
    put(b, "ld-tv-wall", 13.87, 1.6, 102.4, F + 0.95);
    // The kitchen along the south wall from the core's corner, as drawn:
    // its tall units by the hall, the sink, then the hob; a plain counter
    // on under the corner window, ending 8 cm short of the slanted wall so
    // 0.8 m stays before its end.
    // One tall unit against the wall's return (kit-end), as drawn.
    against(b, `ld-kitchen-${s}-40n`, "S", 4.85, 10.21, o);
    against(b, `ld-counter-${s}-plain-22`, "S", 4.85, 13.29, o);
    // Its core, one L-shaped bathroom: the walk-in shower along the west
    // wall, its screen at the south end by the plan's drain; the basin on
    // the north wall; the WC on the east wall; the washers under the head
    // of the stair.
    put(b, "ld-shower-walkin-w", 2.06, 6.29, "E", F);
    against(b, "vanity", "N", 4.53, 3.51, { y: F + 0.34 });
    against(b, "wc", "E", 5.49, 5.75, o);
    // The washers 0.4 m off the party wall, where the plans stand them.
    against(b, "washing-machine", "S", 7.0, 2.96, o);
    against(b, "washing-machine", "S", 7.0, 3.58, o);
    // The guest WC: the WC on the north wall facing the floor before the
    // door, a hand basin on the west wall clear of the WC's front.
    against(b, "wc", "N", 4.53, 6.35, o);
    against(b, "vanity-small", "W", 5.61, 5.41, { y: F + 0.34 });

    // --- The upper south flat -----------------------------------------
    // Bedroom 1: the plan's 3 m wardrobe along the north wall, a shallow
    // one so the plan's 0.74 m stays before the bed's foot (our bed is
    // 0.13 m longer than the plan's): the only way in from the door.
    bedSet(plain, b, L.bed, "S", 13.34, 1.895, n45);
    against(b, "ld-wardrobe-30s", "N", 9.98, 1.89, o);
    // Bedroom 2: the wardrobe along the whole west wall, 0.38 m from the
    // bed's west drawer (the plan's 0.45).
    bedSet(plain, b, L.bed, "S", 16.3, 2.71, n45);
    against(b, "ld-wardrobe-27", "W", 0.35, 14.88, o);
    dining(b, L.table, L.chair, 5.99, 11.7, { y: F, pitch: 0.6 });
    hang(b, L.pendant, 5.99, 11.7, F + top);
    // The U-shaped kitchen in its corner, open to the west (the piece was
    // built for exactly this spot).
    put(b, `ld-kitchen-${s}-u`, 9.34, 11.44, "W", F);
    // The corner sofa, its backs on the south wall and bedroom 2's, the drum
    // table in its corner; the TV facing it on the loggia's solid wall, 0.1 m
    // north of the plan's so the sheer, drawn open, stacks between it and
    // the slider (drawn across, it would close the way out to the loggia).
    against(b, `${L.corner}-l`, "S", 16.3, 5.76, o);
    put(b, L.rug, 6.3, 14.75, "N", F);
    put(b, "ld-stump", 6.38, 14.57, "N", F);
    against(b, "ld-tv-wall", "E", 8.125, 13.75, { y: F + 0.95 });
    against(b, "ld-sheer-05", "E", 8.125, 14.64, { y: F, gap: 0.02 });
    // Its bathroom: the walk-in shower along the west wall, its screen at
    // the north end so the way in is clear of the washers under the head
    // of the stair; a hand basin on the south wall. The flat's WC stays in
    // the guest WC (the plan's deeper core, with the WC and basin on a
    // pre-wall in the bathroom, leaves no floor before a WC in its WC).
    put(b, "ld-shower-walkin-r-w", 2.06, 8.69, "E", F);
    against(b, "washing-machine", "N", 7.97, 2.96, o);
    against(b, "washing-machine", "N", 7.97, 3.58, o);
    against(b, "vanity-small", "S", 9.79, 2.97, { y: F + 0.34 });
    against(b, "wc", "W", 5.46, 9.3, o);

    // --- The roof terraces --------------------------------------------
    // The pendants' canopies 1 cm up into the pergola's beams and louvres:
    // flush, their tops and the beams' undersides would fight.
    const pergola = R + 2.46;
    // North: the table under the pergola, the outdoor kitchen against the
    // box at its south end, its grill by the slider; loungers either side
    // of the parasol on the plan's square, 0.84 m left between their feet
    // and the box to walk along from the slider; the jacuzzi in the deck's
    // east part; the shower by the box's corner. The table 4 cm north of
    // the plan's, so the chairs either side keep 0.46 m behind them, from
    // the lattice and from the kitchen's front, and 7 cm west, so 0.5 m is
    // left past its end to the east lattice.
    dining(b, "ld-out-dining", "ld-out-chair", 2.85, 2.7, { y: R });
    hang(b, "ld-pendant-woven", 2.85, 2.7, pergola);
    against(b, "ld-out-kitchen", "S", 4.83, 2.8, { y: R });
    put(b, "ld-parasol", 6.03, 3.0, "N", R);
    put(b, "ld-lounger", 5.43, 3.0, "N", R);
    put(b, "ld-lounger", 6.63, 3.0, "N", R);
    put(b, "ld-jacuzzi", 10.63, 2.5, "N", R);
    put(b, "ld-out-shower", 8.47, 4.22, "N", R);
    // South, the north terrace's mirror: the kitchen against the box, its
    // grill by the slider; the table under the pergola; the lounge set
    // past the slider, two chairs turned to the round table and the sofa;
    // the jacuzzi east of it; the shower by the box's corner.
    against(b, "ld-out-kitchen-r", "N", 9.74, 2.8, { y: R });
    dining(b, "ld-out-dining", "ld-out-chair", 2.92, 12.85, { y: R });
    hang(b, "ld-pendant-woven", 2.92, 12.85, pergola);
    put(b, "ld-out-lounge", 4.88, 11.39, -135, R);
    put(b, "ld-out-lounge", 6.5, 11.39, 135, R);
    put(b, "ld-out-coffee-round", 5.7, 12.04, "N", R);
    put(b, "ld-out-sofa", 5.7, 13.22, "N", R);
    put(b, "ld-jacuzzi", 8.05, 12.57, "N", R);
    put(b, "ld-out-shower", 8.47, 10.35, "S", R);
    // In the stone box, each utility room's sink on its west wall.
    against(b, "vanity-small", "W", 5.96, 6.6, { y: R + 0.34 });
    against(b, "vanity-small", "W", 5.96, 8.06, { y: R + 0.34 });
    // The plans' shelving along box-mid, west of the door's swing (its
    // leaf, hinged at 7.45, sweeps the rest): open white shelves, their back
    // panel at -z as modelled, so turned to put it on the wall; the south
    // room's a quarter smaller, its door sweeping to within 0.12 m of box-mid.
    put(b, "shelving", 6.58, 7.13, "S", R);
    put(b, "shelving", 6.43, 7.551, "N", R, 0.75);

    // --- The ground-floor terraces, under the pergolas -----------------
    // A2's north terrace (render 22): the lounge pair before its glazing,
    // the dining set past the corner under the pergola; B's (render 15) a
    // garden sofa, a round low table and an armchair there instead.
    if (s === "sage") {
        put(b, "ld-out-sofa", 15.15, -2.45, "S");
        put(b, "ld-out-coffee-round", 15.15, -1.3);
        put(b, "ld-out-chair", 13.9, -1.3, "E");
    } else gardenTable(b, 14.9, -1.15, { top: 2.7 });
    loungePair(b, 12.2, -0.75, "N");
    // Under the east pergola beside the slanted wall, clear of its posts:
    // the white counter with its sink (renders 19 and 22).
    put(b, "ld-out-island-16", 15.82, 2.3, "W");
    // A lilac in a bronze planter on the lawn at the terrace's corner.
    put(b, "ld-lilac-pot", 17.6, -1.5);
    // A3's south terrace: the lounge pair out past the living room's
    // glass, the dining set towards the corner post, the grill at the
    // pergola's far end past the corner.
    gardenTable(b, 1.4, 18.6, { top: 2.7 });
    loungePair(b, 8.7, 18.75, "S");
    put(b, "ld-out-kitchen", -1.7, 17.6, "E");
    put(b, "ld-out-kitchen", pool ? 11.6 : 11.72, 14.6, "W");
    // A1's garden terrace (renders 17, 18): a dining table along the
    // façade under the woven pendant, the outdoor kitchen behind it along
    // the pergola's north edge, clear of its posts, an olive at the far corner.
    dining(b, "ld-out-dining", "ld-out-chair", -1.75, 7.95, { along: "z", per: 2, pitch: 0.9 });
    hang(b, "ld-pendant-woven", -1.75, 7.95, 2.7);
    put(b, "ld-out-kitchen", -2.6, 5.68, "S");
    put(b, "ld-olive-pot", -3.32, 9.1);

    if (pool) {
        // Round the pool: three loungers in a row on the deck between the
        // pergola's posts and the water, the outdoor kitchen on the stone
        // terrace clear of the front hedge, two garden armchairs by a low
        // table east of the water's south half, turned to it (render 15).
        for (const z of [11.6, 13.7, 15.8]) put(b, "ld-lounger", 13.75, z, "N");
        against(b, "ld-out-kitchen-32", "E", 19.15, 13.4);
        put(b, "ld-out-chair", 18.45, 16.9, "W");
        put(b, "ld-out-chair", 18.45, 18.1, "W");
        put(b, "ld-out-side", 18.7, 17.5);
    }
}

// ---------------------------------------------------------------------
// Building C
// ---------------------------------------------------------------------

/**
 * C2, the north end of the ground floor, as plan f0_C draws it; C3 is it
 * mirrored, bar its main bedroom (placed per flat in furnishC).
 */
function endFlat(f, b, L) {
    const top = 2.95;
    // Living: the corner sofa with its back on the inner south wall, its
    // narrow chaise at the west by the corner glass; the teak drum before
    // it, on the round rug of render 19. No TV and no sideboard: the plan
    // has none, the solid end of the garden wall stands behind the chaise.
    f.against(b, "ld-sofa-c25-chaise-l", "S", 3.9, 1.64);
    f.put(b, "ld-stump", 1.75, 2.4);
    f.put(b, L.rug, 1.5, 2.88);
    // Dining: the four-seat table along the room between the sofa and the
    // kitchen, its chairs pushed in till 0.19 m shows, as drawn — 0.37 m
    // west of the plan's, so the way past the kitchen from the front door
    // to the hall is 0.8 m, clear of the front door's swing.
    f.dining(b, "ld-dining-oak-4s", L.chair, 2.9, 1.96, { along: "z", per: 2, pitch: 0.62, tuck: 0.35 });
    f.hang(b, L.pendant, 2.9, 1.96, top);
    // Kitchen: the sage run on the bathroom wall from the façade to the
    // hall, the hob by the window, the oven and fridge columns by the hall
    // (C3's the -r one); spots on a track over the way past it.
    f.against(b, "ld-kitchen-sage-c2", "E", 4.905, 1.75);
    f.put(b, "ld-track-30", 3.9, 1.9, "W", top - 0.19);
    // Bathroom: the walk-in shower across its end, its glass at the east;
    // down the east wall the washer, the floating basin and the WC; the
    // towel rail on the west wall by the door.
    f.against(b, "ld-shower-walkin-c2", "N", 0.35, 5.81, { gap: 0.01 });
    f.against(b, "washing-machine", "E", 6.59, 1.47);
    f.against(b, "vanity-small", "E", 6.59, 2.1, { y: 0.34 });
    f.against(b, "wc", "E", 6.59, 2.72);
    f.against(b, "towel-rail", "W", 5.03, 2.6, { y: 0.3 });
    // Bedroom 2, a twin: two singles with their heads on the façade either
    // side of its window, their headboards clear of it, and a one-door
    // wardrobe against the side wall at each one's foot.
    bedSet(f, b, "ld-bed-single-80", "N", 0.35, 7.215, { hb: 7.165 });
    bedSet(f, b, "ld-bed-single-80", "N", 0.35, 8.855, { hb: 8.9 });
    f.against(b, "ld-wardrobe-06s", "W", 6.71, 2.71);
    f.against(b, "ld-wardrobe-06s", "E", 9.35, 2.71);
}

/**
 * The north flat of the first floor (the listing's C5; c.js's ids say c4),
 * as plan f1_C draws it; the south one (C4) is it mirrored, bar its
 * bedroom 2 and the twin room (placed in furnishC).
 */
function upperEnd(f, b, L) {
    const y = 3.2;
    const o = { y };
    const top = y + 2.95;
    // Living: the corner sofa with its back on the bathroom wall, facing the
    // façade, its chaise at the west; three poufs inside the corner glass;
    // the round drum table before the seat, on a rug; the television hung
    // on the solid wall between the corner glass and the kitchen's window.
    f.against(b, "ld-sofa-chaise-l", "S", 3.87, 2.06, o);
    f.put(b, "ld-rug-sage", 2.4, 2.05, "N", y);
    f.put(b, "ld-coffee-round-60", 2.4, 2.15, "N", y);
    f.put(b, "ld-pouf", 0.57, 1.4, -84, y);
    f.put(b, "ld-pouf", 0.57, 2.11, -94, y);
    f.put(b, "ld-pouf", 0.57, 2.59, -84, y);
    f.against(b, "ld-tv-wall", "N", 0.35, 2.52, { y: y + 0.8 });
    // Kitchen: a low run under the wide window, no back panel, the sink at
    // the west as drawn (the south flat's the -r one).
    f.against(b, "ld-counter-sage-low-24", "N", 0.35, 4.36, o);
    // Dining: the four-seat table between the kitchen and the sofa's end,
    // its chairs tucked well under as drawn: 0.78 m left before the counter
    // and behind the south chairs, 0.77 past the sofa's end.
    f.dining(b, "ld-dining-oak-4", L.chair, 4.85, 2.42, { per: 2, pitch: 0.65, tuck: 0.3, y });
    f.hang(b, L.pendant, 4.85, 2.42, top);
    // Bedroom: the bed's head on the east wall, a small drawer either side;
    // the wardrobe the length of the west wall, the door just past its front.
    bedSet(f, b, "ld-bed-sage-140", "E", 9.46, 1.725, { y, stand: "ld-nightstand-40" });
    f.against(b, "ld-wardrobe-27", "W", 6.08, 1.725, o);
    // Bathroom: the WC and the double basin on the north wall (the shower
    // and washers in its niche under the stair: per flat, in furnishC); the
    // WC as far off the west wall as drawn (0.37 m to its middle).
    f.against(b, "wc", "N", 3.99, 2.67, o);
    f.against(b, "ld-vanity-double-145", "N", 3.99, 3.98, { y: y + 0.4 });
}

export function furnishC(b) {
    const L = LOOK.sage;
    const m = mirrored(b, 6.75);

    // --- C2 and C3, the ends of the ground floor ------------------------
    endFlat(plain, b, L);
    endFlat(m, b, L);
    // Their main bedrooms, which differ: the bed's head on the blind east
    // wall, a small drawer either side; C2's wardrobe on the inner south
    // wall, C3's on the outer south wall beside its window.
    bedSet(plain, b, "ld-bed-sage-140", "E", 12.05, 1.72, { stand: "ld-nightstand-40" });
    against(b, "ld-wardrobe-13s", "S", 3.9, 11.4);
    bedSet(plain, b, "ld-bed-sage-140", "E", 12.05, 11.15, { stand: "ld-nightstand-40" });
    against(b, "ld-wardrobe-13s", "S", 13.15, 11.4);

    // --- C1, the middle -----------------------------------------------
    // Kitchen: the full sage run on the bathroom wall, the fridge column by
    // the hall, the hob by the south wall. It replaces the 2.4 m counter
    // the user shortened to 0.8 in the editor (2026-10-03).
    against(b, "ld-kitchen-sage-c1", "E", 5.82, 7.245);
    put(b, "ld-track-30", 4.85, 7.25, "W", 2.76);
    // The four-seat table along the room before the garden glass, its
    // chairs pushed in as drawn; the way from the garden door to the hall
    // 0.8 m clear north of it, its west chair clear of the door.
    dining(b, "ld-dining-oak-4s", L.chair, 3.76, 5.67, { per: 2, pitch: 0.56, tuck: 0.35 });
    hang(b, L.pendant, 3.76, 5.67, 2.95);
    // The corner sofa behind it, facing south, its chaise at the west by
    // the glass, the drum table before its seat. A 2.15 m one: the plan's
    // 2.5 would leave no way past our kitchen's front to the hob.
    put(b, "ld-sofa-c21-chaise-r", 3.4, 7.6, "S");
    put(b, "ld-stump", 3.9, 8.37);
    put(b, L.rug, 3.6, 8.2);
    // Its bathroom: down the west wall the WC, the floating basin and the
    // washer; the walk-in shower across the south end, its glass by the
    // washer; the towel rail on the east wall where drawn, clear of the
    // door's swing (hinged west, its leaf open along the WC).
    against(b, "wc", "W", 5.94, 5.64);
    against(b, "vanity-small", "W", 5.94, 6.26, { y: 0.34 });
    against(b, "washing-machine", "W", 5.94, 6.88);
    against(b, "ld-shower-walkin-c1", "S", 7.92, 6.75, { gap: 0.01 });
    against(b, "towel-rail", "E", 7.56, 6.02, { y: 0.3 });
    // Its bedroom: the bed's head on the hall wall east of the door, the
    // way in down its west side; a drawer on its east side only (on the
    // west it would stand in the doorway).
    bedSet(plain, b, "ld-bed-sage-140", "N", 5.33, 9.51, { stands: false });
    against(b, "ld-nightstand-40", "N", 5.33, 10.44, { y: 0.28 });

    // --- The first floor: the north flat (the listing's C5) and the south
    // one (C4), mirrored but for their bedroom 2s and the twin room -----
    upperEnd(plain, b, L);
    upperEnd(m, b, L);
    const y = 3.2;
    // Each bathroom's niche under its flat's stair (the wall between them
    // is not on the mirror's axis): the shower past the stair's head, under
    // the window, its tiled sides on the outer and middle walls; the washer
    // and dryer under the flight beside it, their fronts on the bathroom's
    // wall line as drawn.
    put(b, "shower", 2.8, 6.215, "N", y);
    put(b, "washing-machine", 3.605, 5.925, "N", y);
    put(b, "washing-machine", 4.21, 5.925, "N", y);
    put(b, "shower-m", 2.8, 7.345, "S", y);
    put(b, "washing-machine", 3.605, 7.595, "S", y);
    put(b, "washing-machine", 4.21, 7.595, "S", y);
    // The north flat's bedroom 2: the bed's head on the east wall north of
    // its window, a drawer either side; a shallow wardrobe on the south
    // wall, 0.2 m off the east one so it stands clear of the window (our
    // wall is 0.15 m north of the plan's) and its front is reached past
    // the drawer.
    bedSet(plain, b, "ld-bed-sage-140", "E", 12.05, 1.75, { y, stand: "ld-nightstand-40" });
    against(b, "ld-wardrobe-12s", "S", 3.9, 11.25, { y });
    // The south flat's is not its mirror: the bed at the room's north end,
    // its wardrobe on the outer south wall beside the window.
    bedSet(plain, b, "ld-bed-sage-140", "E", 12.05, 11.14, { y, stand: "ld-nightstand-40" });
    against(b, "ld-wardrobe-13s", "S", 13.15, 11.4, { y });
    // The twin room over C1's bedroom: two singles with their heads on the
    // south wall either side of it, the wardrobe on the north wall past the
    // door's swing.
    bedSet(plain, b, "ld-bed-single-80", "S", 7.89, 8.65, { y });
    bedSet(plain, b, "ld-bed-single-80", "S", 7.89, 10.14, { y });
    against(b, "ld-wardrobe-12s", "N", 4.31, 10.04, { y });

    // --- The roof terraces (render 12): the north flat's dining table under
    // its pergola; under the south one, the green garden sofa, its table and
    // two lounge chairs, and the kamado grill against the box's stone.
    const R = 6.4;
    // The pendants' canopies 1 cm up into the pergola's beams and louvres:
    // flush, their tops and the beams' undersides would fight.
    const pergola = R + 2.46;
    dining(b, "ld-out-dining", "ld-out-chair", 8.85, 3.4, { y: R });
    hang(b, "ld-pendant-woven", 8.85, 3.4, pergola);
    put(b, "ld-out-sofa-green", 8.85, 11.5, "N", R);
    put(b, "ld-out-coffee", 8.85, 10.45, "N", R);
    put(b, "ld-out-lounge", 8.2, 9.45, "S", R);
    put(b, "ld-out-lounge", 9.5, 9.45, "S", R);
    hang(b, "ld-pendant-woven", 8.85, 10.45, pergola);
    against(b, "ld-grill-kamado", "W", 6.9, 10.2, { y: R });

    // --- The ground-floor terraces: a garden sofa and a round table ------
    for (const f of [plain, m]) {
        // Facing the terrace's table, as the user turned it (2026-10-03);
        // green, as render 12 shows C's.
        f.put(b, "ld-out-sofa-green", -1.6, -0.75, "S");
        f.put(b, "ld-out-table", -1.6, 1.2);
        f.put(b, "ld-out-chair", -2.285, 1.2, "E");
        f.put(b, "ld-out-chair", -0.915, 1.2, "W");
        f.put(b, "ld-out-lounge", 2.0, -0.75, "N");
        f.put(b, "ld-out-side", 2.65, -0.7);
    }
    against(b, "ld-out-sofa-green", "W", -3.3, 6.75);
    put(b, "ld-out-coffee", -1.85, 6.75, "W");
    put(b, "ld-out-chair", -0.95, 6.15, "W");
    put(b, "ld-out-chair", -0.95, 7.35, "W");
}

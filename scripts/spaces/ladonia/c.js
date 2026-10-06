/**
 * Building C of Ladonia Residence, from its plans ("C - prizemlje", "C - 1.
 * kat"), measured at 29.7 and 50 pixels a metre into its own frame: its
 * north-west corner at the origin, x east (to the street), z south.
 *
 * A block 12.4 × 13.5 m, banded in corten — a band at the first floor and a
 * deeper one round the roof — over sand render, with a deep stone-clad
 * recess in the middle of each long side, open through both floors. Five
 * flats: on the ground floor C2 and C3 across the north and south ends,
 * C1 between them; on the first C4 and C5 across the ends, up an outside
 * stair that rises inside the block, each with a stair of its own up into a
 * stone box on the roof and out onto its terrace.
 */
import { Building, door, doorway, entry, glassDoor, glazing, slider, win } from "./kit.js";

export const C = { storey: 3.2, band: [2.8, 3.65], roof: 6.4, top: 7.65, box: 9.6 };

const EXT = { t: 0.35, finish: "render_ochre", back: "limewash_warm", reveal: "render_peach" };
const STONE = { ...EXT, finish: "stone_cladding", reveal: "stone_trim" };
const BAND = { t: 0.37, finish: "corten_cladding", back: "limewash_warm", reveal: "corten_trim" };

export function buildingC(tag, offset, { furnish } = {}) {
    const b = new Building(tag, offset);
    shell(b);
    ground(b);
    first(b);
    roof(b);
    furnish?.(b);
    return b;
}

/**
 * The outside walls, storey by storey: render below, the corten band at
 * the first floor, render above, the corten band round the roof. `open`
 * lists each run's openings by storey: [ground, first].
 */
function shell(b) {
    const [b0, b1] = C.band;
    // `glass`: where the storeys' walls start and end instead, for a glass
    // corner — run on to where the other face's glass stands, so the two
    // panes meet at a slim post, under bands that still meet square.
    const run = (name, a, c, outside, [g = [], f = []] = [], skin = EXT, top = true, glass = [a, c]) => {
        b.wall(`g-${name}`, ...glass, { ...skin, h: b0, outside, openings: g });
        b.wall(`band-${name}`, a, c, { ...BAND, base: b0, h: b1 - b0, outside });
        b.wall(`f-${name}`, ...glass, { ...skin, base: b1, h: C.roof - b1, outside, openings: f });
        if (top) b.wall(`top-${name}`, a, c, { ...BAND, base: C.roof, h: C.top - C.roof, outside, back: "corten_cladding", reveal: "coping_grey" });
    };
    // Across each recess's mouth, the bands carry on: a beam at the first
    // floor, the parapet round the roof.
    for (const [name, x, out] of [["w", 0.185, -1], ["e", 12.215, 14]]) {
        b.wall(`band-rec-${name}`, [x, 4.075], [x, 9.425], { ...BAND, base: b0, h: b1 - b0, outside: [out, 6.7] });
        b.wall(`top-rec-${name}`, [x, 4.075], [x, 9.425], { ...BAND, base: C.roof, h: C.top - C.roof, outside: [out, 6.7], back: "corten_cladding" });
    }
    // Every opening runs band to band, as the renders show: ground-floor
    // ones from the floor to the band (2.85); first-floor ones from the
    // band's top (3.6) to the roof band (6.4).
    const G = 2.74;
    const F = 2.7;
    const lowBlind = (lo, hi, blind, panes) => win(lo, hi, { h: G, sill: 0.02, blind, ...(panes ? { panes } : {}) });
    // The glass corners: two panes a face, as the plans draw them.
    const corner = (lo, hi, h) => win(lo, hi, { h, sill: 0.02, blind: null, panes: [2, 1] });
    const tallBlind = (lo, hi, blind, panes) => win(lo, hi, { h: F, sill: 0.02, blind, ...(panes ? { panes } : {}) });

    // The long faces: the glass corner, a door, two narrow windows below;
    // the glass corner, a wide two-pane window, two narrow ones above.
    run("n", [0, 0.175], [12.4, 0.175], [6, -1], [
        [corner(0, 1.9, G), entry(3.25, 4.05, { swing: "inward_left", h: G }), lowBlind(7.6, 8.45, 0.3), lowBlind(9.8, 10.65, 0.3)],
        [corner(0, 1.9, F), tallBlind(3.15, 5.35, 0.25, [2, 1]), tallBlind(7.68, 8.48, 0.3), tallBlind(9.85, 10.65, 0.3)],
    ]);
    run("s", [0, 13.325], [12.4, 13.325], [6, 15], [
        [corner(0, 1.9, G), entry(3.25, 4.05, { swing: "inward_right", h: G }), lowBlind(7.6, 8.45, 0.3), lowBlind(9.8, 10.65, 0.3)],
        [corner(0, 1.9, F), tallBlind(3.15, 5.35, 0.25, [2, 1]), tallBlind(7.68, 8.48, 0.3), tallBlind(9.85, 10.65, 0.3)],
    ]);
    // The garden ends: the corner glass wraps on round them, two storeys
    // high, the long faces' panes running out to the corner and these
    // meeting them behind it.
    run("w-n", [0.175, 0.35], [0.175, 4.075], [-1, 2], [[corner(0.175, 2.25, G)], [corner(0.175, 2.25, F)]], EXT, true, [[0.175, 0.175], [0.175, 4.075]]);
    run("w-s", [0.175, 9.425], [0.175, 13.15], [-1, 11], [[corner(11.25, 13.325, G)], [corner(11.25, 13.325, F)]], EXT, true, [[0.175, 9.425], [0.175, 13.325]]);
    // The first floor's bedroom 2s' east windows where plan f1_C has them,
    // clear of the beds' headboards (the south one's cut at our recess wall).
    run("e-n", [12.225, 0.35], [12.225, 4.075], [14, 2], [[], [tallBlind(2.64, 3.51, 0.03)]]);
    run("e-s", [12.225, 9.425], [12.225, 13.15], [14, 11], [[], [tallBlind(9.6, 10.26, 0.03)]]);
    // Into the recesses: the ends' walls facing them...
    run("n-recw", [0.37, 4.075], [2.3, 4.075], [1, 6], [], EXT, false);
    run("n-rece", [10.65, 4.075], [12.03, 4.075], [11.5, 6], [], EXT, false);
    run("s-recw", [0.37, 9.425], [2.3, 9.425], [1, 7], [], EXT, false);
    run("s-rece", [10.65, 9.425], [12.03, 9.425], [11.5, 7], [], EXT, false);
    // ...and the middle's, in stone; upstairs its windows light the
    // bathrooms' shower niches past the stairs' heads, as plan f1_C has them.
    run("m-w", [2.125, 4.25], [2.125, 9.25], [0, 6.7], [
        [glassDoor(4.45, 5.3, { swing: "inward_left", h: G }), glazing(5.38, 9.05, { h: G })],
        [tallBlind(5.72, 6.63, 0.03), tallBlind(6.87, 7.78, 0.03)],
    ], STONE, false);
    // The east recess: the middle's wall, its door; the stair rises inside
    // the block between the twin bedroom and the south flat.
    b.wall("g-m-e", [10.825, 4.25], [10.825, 7.95], { ...STONE, h: C.band[0], outside: [12, 6.7], openings: [entry(4.3, 5.2), win(6.9, 7.7, { h: 1.4, sill: 0.9, blind: 0.5 })] });
    // The stair to the first floor rises inside the block, behind a solid
    // door at the south end of the recess (render 12).
    b.wall("g-slot-e", [10.825, 7.95], [10.825, 9.25], { ...STONE, h: C.band[0], outside: [12, 8.6], openings: [{ ...entry(8.15, 9.05, { h: G }), door: { ...entry(8.15, 9.05).door, type: "sliding" } }] });
    b.wall("band-slot-e", [10.825, 7.95], [10.825, 9.25], { ...BAND, base: C.band[0], h: C.band[1] - C.band[0], outside: [12, 8.6] });
    b.wall("f-slot-e", [10.825, 7.95], [10.825, 9.25], { ...STONE, base: C.band[1], h: C.roof - C.band[1], outside: [12, 8.6] });
    b.wall("band-m-e", [10.825, 4.25], [10.825, 7.95], { ...BAND, base: C.band[0], h: C.band[1] - C.band[0], outside: [12, 6.7] });
    // The twin room's window, by its wardrobe, clear of the beds as drawn.
    b.wall("f-m-e", [10.825, 4.25], [10.825, 7.95], { ...STONE, base: C.band[1], h: C.roof - C.band[1], outside: [12, 6.7], openings: [win(4.88, 5.65, { h: 2.0, sill: 0.2, blind: 0.3 })] });
}

function ground(b) {
    // Partitions to the slab above, not the band's height (the band is
    // the outside walls' only).
    const H = C.storey;
    // Partitions stop 2 cm under the floor above, out of its plane.
    const g = (name, a, c, opts) => b.wall(`g-${name}`, a, c, { h: (opts?.t ?? 0.12) < 0.3 ? H - 0.02 : H, ...opts });
    // The middle flat between the two ends.
    g("party-n", [2.3, 4.2], [10.65, 4.2], { t: 0.2 });
    // Full height where the stair hall beside it is open to the sky.
    g("party-s", [2.3, 9.3], [10.65, 9.3], { t: 0.2, h: H });
    // C2, the north end. Its bedrooms' doors hinged as drawn; the twin
    // room's opens to the hall (the beds' feet are in its swing into the
    // room). The bathroom's opens in as drawn, hinged at its east jamb, its
    // leaf along the WC: 0.8 m (the plan's 0.76), as a 0.9 one's leaf would
    // stand in the WC. (The wall runs east to west, side A north.)
    g("c2-kit", [4.97, 0.35], [4.97, 3.08]);
    g("c2-bath-e", [6.65, 0.35], [6.65, 3.08]);
    g("c2-bed-e", [9.41, 0.35], [9.41, 4.1], { openings: [door(3.16, 4.06, { swing: "inward_right" })] });
    g("c2-s", [4.97, 3.08], [9.41, 3.08], { openings: [door(5.1, 5.9, { swing: "outward_left", fit: true }), door(7.7, 8.45, { swing: "inward_left" })] });
    // C3, the south end: the same, turned about the middle.
    g("c3-kit", [4.97, 10.42], [4.97, 13.15]);
    g("c3-bath-e", [6.65, 10.42], [6.65, 13.15]);
    g("c3-bed-e", [9.41, 9.4], [9.41, 13.15], { openings: [door(9.44, 10.34, { swing: "inward_left" })] });
    g("c3-n", [4.97, 10.42], [9.41, 10.42], { openings: [door(5.1, 5.9, { swing: "inward_left", fit: true }), door(7.7, 8.45, { swing: "outward_left" })] });
    // C1, the middle.
    g("c1-kit", [5.88, 5.27], [5.88, 9.2]);
    // C1's bathroom stops short of the common stair, which passes behind it.
    g("c1-bath-e", [7.62, 5.27], [7.62, 7.98]);
    g("c1-bath-s", [5.88, 7.98], [7.62, 7.98], { h: H });
    // The bathroom's door hinged at its west jamb, as drawn, its leaf open
    // along the WC's side (the wall runs east to west: _right is the west).
    g("c1-hall-s", [5.88, 5.27], [10.65, 5.27], { openings: [door(6.645, 7.545, { swing: "inward_right" }), door(7.72, 8.62, { swing: "inward_right" })] });
    // Under the outside stair, open to the street.
    g("c1-bed-s", [7.62, 7.95], [10.825, 7.95], { h: H });

    // Ceilings a slab below the floor above.
    const r = (name, label, poly, floor) => b.room(`g-${name}`, label, poly, floor, { h: C.storey - 0.25 });
    r("c2-living", "C2 — living, dining & kitchen", [[0.35, 0.35], [4.91, 0.35], [4.91, 4.1], [2.3, 4.1], [2.3, 3.9], [0.35, 3.9]], "terrazzo");
    r("c2-bath", "C2 — bathroom", b.rect(5.03, 0.35, 6.59, 3.02), "bath_tile");
    r("c2-bed2", "C2 — bedroom 2", b.rect(6.71, 0.35, 9.35, 3.02), "oak_honey");
    r("c2-bed", "C2 — bedroom", [[9.47, 0.35], [12.05, 0.35], [12.05, 3.9], [10.65, 3.9], [10.65, 4.1], [9.47, 4.1]], "oak_honey");
    r("c2-hall", "C2 — hall", b.rect(4.91, 3.14, 9.35, 4.1), "terrazzo");
    r("c3-living", "C3 — living, dining & kitchen", [[0.35, 9.6], [2.3, 9.6], [2.3, 9.4], [4.91, 9.4], [4.91, 13.15], [0.35, 13.15]], "terrazzo");
    r("c3-bath", "C3 — bathroom", b.rect(5.03, 10.48, 6.59, 13.15), "bath_tile");
    r("c3-bed2", "C3 — bedroom 2", b.rect(6.71, 10.48, 9.35, 13.15), "oak_honey");
    r("c3-bed", "C3 — bedroom", [[9.47, 9.4], [10.65, 9.4], [10.65, 9.6], [12.05, 9.6], [12.05, 13.15], [9.47, 13.15]], "oak_honey");
    r("c3-hall", "C3 — hall", b.rect(4.91, 9.4, 9.35, 10.36), "terrazzo");
    r("c1-living", "C1 — living, dining & kitchen", b.rect(2.3, 4.3, 5.82, 9.2), "terrazzo");
    r("c1-hall", "C1 — hall", b.rect(5.82, 4.3, 10.65, 5.21), "terrazzo");
    r("c1-bath", "C1 — bathroom", b.rect(5.94, 5.33, 7.56, 7.92), "bath_tile");
    r("c1-bed", "C1 — bedroom", b.rect(7.68, 5.33, 10.65, 7.89), "oak_honey");
    b.room("g-slot", "Stair hall", b.rect(5.94, 8.04, 10.77, 9.2), "stone_paving", { ceiling: "none" });
    // The recesses, open through both floors.
    b.room("g-rec-w", "Recess", b.rect(0.05, 4.25, 1.95, 9.25), "stone_paving", { ceiling: "none" });
    b.room("g-rec-e", "Entrance", b.rect(11.0, 4.25, 12.4, 9.25), "stone_paving", { ceiling: "none" });
}

function first(b) {
    const B = C.storey;
    const H = C.roof - B;
    const f = (name, a, c, opts) => b.wall(`f-${name}`, a, c, { base: B, h: (opts?.t ?? 0.12) < 0.3 ? H - 0.02 : H, ...opts });
    // The north flat (the listing's C5; its ids say c4), and its rooms in
    // the middle. Its bedrooms' doors where and as plan f1_C hangs them:
    // bedroom 1's past the end of its wardrobe, opening in.
    f("c4-liv-e", [6.02, 0.35], [6.02, 3.16]);
    f("c4-bed1-e", [9.52, 0.35], [9.52, 4.25], { openings: [door(3.3, 4.1, { swing: "inward_right" })] });
    f("c4-bed1-s", [6.02, 3.16], [9.52, 3.16], { openings: [door(6.77, 7.67, { swing: "outward_right" })] });
    // Each flat's lobby opens without a door into its living room.
    // The bathrooms take 0.32 m of the living rooms, so a basin, a WC and
    // the way along them to the shower each have their own floor.
    f("c4-mid-n", [5.415, 4.25], [6.58, 4.25], { t: 0.2, openings: [doorway(5.55, 6.45)] });
    f("c4-bath-n", [2.3, 3.93], [5.415, 3.93]);
    // The front doors (these walls run south, side A west: _left hinges at
    // the north jamb, _right at the south). The north flat's opens onto the
    // landing, hinged north, its leaf parked at the landing's dead north
    // end: drawn opening into the lobby, the open leaf would leave 0.21 m
    // before the partition and cut the lobby off from the flat's own stair.
    // The south flat's is as drawn (into its lobby, hinged north): onto the
    // landing it would stand across the common stair's side exit.
    f("c4-mid-e", [6.58, 4.25], [6.58, 6.78], { openings: [door(4.5, 5.35, { swing: "inward_left" })] });
    // The bathroom runs on under the flight's upper half, as drawn: the
    // shower in the niche past its head, the washers under it; its wall
    // there hangs from the slab over them, and a knee wall under the steps
    // closes the space under the flight's foot (style "slab", open beneath).
    f("c4-bath-s", [4.515, 5.66], [5.415, 5.66]);
    f("c4-niche-s", [2.3, 5.66], [3.29, 5.66], { base: B + 2.2, h: H - 2.22 });
    f("c4-niche-w", [3.29, 5.66], [4.515, 5.66], { base: B + 1.6, h: H - 1.62 });
    f("c4-knee", [4.6, 5.66], [4.6, 6.78], { h: 1.2 });
    f("c4-bath-e", [5.415, 3.93], [5.415, 5.66], { openings: [door(4.6, 5.5, { swing: "outward_left" })] });
    // The landing: open from end to end, a front door either side.
    f("landing-n", [6.58, 4.25], [8.08, 4.25]);
    f("twin-n", [8.08, 4.25], [10.65, 4.25], { openings: [door(8.43, 9.18)] });
    f("twin-w", [8.08, 4.25], [8.08, 7.95]);
    f("twin-s", [8.08, 7.95], [10.65, 7.95]);
    f("units", [2.3, 6.78], [6.64, 6.78], { t: 0.2 });
    // The south flat's (the listing's C4; its ids say c5) rooms in the
    // middle, and the south end: the north flat's, mirrored.
    f("c5-mid-e", [6.58, 6.88], [6.58, 9.2], { openings: [door(8.1, 8.85, { swing: "outward_left" })] });
    f("c5-bath-n", [4.515, 7.86], [5.415, 7.86]);
    f("c5-niche-s", [2.3, 7.86], [3.29, 7.86], { base: B + 2.2, h: H - 2.22 });
    f("c5-niche-w", [3.29, 7.86], [4.515, 7.86], { base: B + 1.6, h: H - 1.62 });
    f("c5-knee", [4.6, 6.78], [4.6, 7.86], { h: 1.2 });
    f("c5-bath-e", [5.415, 7.86], [5.415, 9.57], { openings: [door(8.0, 8.9, { swing: "outward_right" })] });
    f("c5-mid-s", [5.415, 9.26], [10.65, 9.26], { t: 0.2, openings: [doorway(5.55, 6.45)] });
    f("c5-bath-s", [2.3, 9.57], [5.415, 9.57]);
    f("c5-liv-e", [6.02, 10.34], [6.02, 13.15]);
    f("c5-bed1-e", [9.52, 9.26], [9.52, 13.15], { openings: [door(9.37, 10.27, { swing: "inward_left" })] });
    f("c5-bed1-n", [6.02, 10.34], [9.52, 10.34], { openings: [door(6.77, 7.67, { swing: "inward_right" })] });

    const r = (name, label, poly, floor) => b.room(`f-${name}`, label, poly, floor, { elevation: B, h: H - 0.25 });
    r("c4-living", "C5 — living, dining & kitchen", [[0.35, 0.35], [5.96, 0.35], [5.96, 3.22], [6.08, 3.22], [6.08, 4.15], [5.475, 4.15], [5.475, 3.87], [0.35, 3.87]], "terrazzo");
    r("c4-bed1", "C5 — bedroom", b.rect(6.08, 0.35, 9.46, 3.1), "oak_honey");
    r("c4-bed", "C5 — bedroom 2", [[9.58, 0.35], [12.05, 0.35], [12.05, 3.9], [10.65, 3.9], [10.65, 4.15], [9.58, 4.15]], "oak_honey");
    r("c4-hall", "C5 — hall", b.rect(6.08, 3.22, 9.46, 4.15), "terrazzo");
    r("c4-bath", "C5 — bathroom", [[2.3, 3.99], [5.355, 3.99], [5.355, 5.6], [4.54, 5.6], [4.54, 6.68], [2.3, 6.68]], "bath_tile");
    r("c4-stair", "C5 — lobby & stair", [[4.66, 5.72], [5.475, 5.72], [5.475, 4.35], [6.52, 4.35], [6.52, 6.68], [4.66, 6.68]], "terrazzo");
    r("c4-twin", "C5 — twin bedroom", b.rect(8.14, 4.31, 10.65, 7.89), "oak_honey");
    r("hall", "First-floor landing", b.rect(6.64, 4.31, 8.02, 9.16), "terrazzo");
    r("c5-stair", "C4 — lobby & stair", [[4.66, 6.88], [6.52, 6.88], [6.52, 9.16], [5.475, 9.16], [5.475, 7.8], [4.66, 7.8]], "terrazzo");
    r("c5-bath", "C4 — bathroom", [[2.3, 6.88], [4.54, 6.88], [4.54, 7.92], [5.355, 7.92], [5.355, 9.51], [2.3, 9.51]], "bath_tile");
    r("c5-living", "C4 — living, dining & kitchen", [[0.35, 9.63], [5.475, 9.63], [5.475, 9.36], [9.46, 9.36], [9.46, 10.28], [6.08, 10.28], [6.08, 13.15], [0.35, 13.15]], "terrazzo");
    r("c5-bed1", "C4 — bedroom", b.rect(6.08, 10.4, 9.46, 13.15), "oak_honey");
    r("c5-bed", "C4 — bedroom 2", [[9.58, 9.4], [10.65, 9.4], [10.65, 9.6], [12.05, 9.6], [12.05, 13.15], [9.58, 13.15]], "oak_honey");
    // The common stair, rising west inside the block from its door in the
    // recess to the landing.
    // Its foot just inside the stair hall's sliding door, its head on the
    // first-floor landing, turned north off it (no rail across the way).
    b.stair("stair-out", [10.75, 8.6], "W", { width: 1.1, base: 0, top: B, run: 3.75, steps: 17, finish: "concrete_steps", riser: "concrete_grey", style: "slab", hole: [7.0, 8.05, 8.02, 9.15] });
    // Each flat's own stair up into the stone box: cast, open beneath, over
    // its bathroom's shower and washers.
    b.stair("stair-n", [6.35, 6.21], "W", { width: 0.9, base: B, top: C.roof, run: 3.9, steps: 17, style: "slab", hole: [3.25, 5.74, 6.4, 6.69, ["z-"]] });
    b.stair("stair-s", [6.35, 7.34], "W", { width: 0.9, base: B, top: C.roof, run: 3.9, steps: 17, style: "slab", hole: [3.25, 6.87, 6.4, 7.8, ["z+"]] });
    // Their heads: the last 0.85 m unrailed, so the climber steps off sideways into the box.
    for (const [name, z0, z1] of [["stair-n-head", 5.74, 6.68], ["stair-s-head", 6.88, 7.8]]) b.out.floor_openings.push({ id: b.id(name), position: b.P(2.825, (z0 + z1) / 2), elevation: b.Y(C.roof), width: 0.85, depth: Math.round((z1 - z0) * 1000) / 1000, yaw: 0 });
}

function roof(b) {
    const R = C.roof;
    const S = { t: 0.3, base: R, h: C.box - R, finish: "stone_cladding", back: "limewash_warm", reveal: "stone_trim" };
    // A long box down the garden side, as the renders show it from the
    // garden and the road: its ends a metre out over each terrace.
    b.wall("box-n", [2.0, 3.2], [6.9, 3.2], { ...S, outside: [4, 2], openings: [slider(3.4, 4.9, { h: 2.4 })] });
    b.wall("box-s", [2.0, 10.3], [6.9, 10.3], { ...S, outside: [4, 11], openings: [slider(3.4, 4.9, { h: 2.4 })] });
    b.wall("box-w", [2.15, 3.35], [2.15, 10.15], { ...S, outside: [1, 6.7], openings: [win(3.6, 4.2, { h: 0.8, sill: 1.4, blind: 0.3 }), win(9.2, 9.8, { h: 0.8, sill: 1.4, blind: 0.3 })] });
    // Its east face: two windows to the north half, a wide glazed door to the south's.
    b.wall("box-e", [6.75, 3.35], [6.75, 10.15], { ...S, outside: [8, 6.7], openings: [win(4.7, 5.5, { h: 1.3, sill: 0.8, blind: 0.03 }), win(5.75, 6.55, { h: 1.3, sill: 0.8, blind: 0.03 }), slider(7.95, 9.85, { h: 2.2 })] });
    b.wall("box-mid", [2.3, 6.78], [6.6, 6.78], { base: R, h: C.box - R, t: 0.15 });
    b.room("r-box-n", "C5 — stair to the roof", b.rect(2.3, 3.35, 6.6, 6.71), "concrete_steps", { elevation: R, h: C.box - R - 0.3 });
    b.room("r-box-s", "C4 — stair to the roof", b.rect(2.3, 6.85, 6.6, 10.15), "concrete_steps", { elevation: R, h: C.box - R - 0.3 });
    // Stone to the top, a thin coping, no overhang.
    b.flatRoof("box-roof", 2.0, 3.05, 6.9, 10.45, C.box, { overhang: 0.03, thickness: 0.08, soffit: "coping_grey" });
    // The terraces: the listing's C5's the north half, C4's the south.
    const t = (name, label, poly, floor) => b.room(`r-${name}`, label, poly, floor, { elevation: R, ceiling: "none" });
    // The recesses stay open to the sky: the terraces stop at their edges,
    // behind a parapet as tall as the corten band's.
    t("c4", "C5 — roof terrace", [[0.36, 0.36], [12.04, 0.36], [12.04, 4.05], [10.83, 4.05], [10.83, 6.78], [6.9, 6.78], [6.9, 3.05], [2.0, 3.05], [2.0, 4.05], [0.36, 4.05]], "hardwood_deck");
    t("c5", "C4 — roof terrace", [[0.36, 9.45], [2.0, 9.45], [2.0, 10.45], [6.9, 10.45], [6.9, 6.78], [10.83, 6.78], [10.83, 9.45], [12.04, 9.45], [12.04, 13.14], [0.36, 13.14]], "hardwood_deck");
    const VP = { ...EXT, t: 0.25, base: R, h: C.top - R };
    b.wall("void-w-n", [0.37, 4.075], [2.0, 4.075], { ...VP, outside: [1, 6] });
    b.wall("void-w-s", [0.37, 9.425], [2.0, 9.425], { ...VP, outside: [1, 7] });
    b.wall("void-e-n", [10.65, 4.075], [12.03, 4.075], { ...VP, outside: [11.5, 6] });
    b.wall("void-e-s", [10.65, 9.425], [12.03, 9.425], { ...VP, outside: [11.5, 7] });
    b.wall("void-e-w", [10.825, 4.2], [10.825, 9.3], { ...VP, outside: [12, 6.7] });
}

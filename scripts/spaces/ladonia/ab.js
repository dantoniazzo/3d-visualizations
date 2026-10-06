/**
 * Buildings A and B of Ladonia Residence — one design, built twice — from
 * the developer's plans (konekt-nekretnine.hr project 253: "A i B -
 * prizemlje", "- 1. kat", "- krovna terasa"), measured off them at 28.2
 * (ground), 40.6 (first floor) and 38.0 (roof) pixels a metre — a double
 * bed is 1.80 × 2.00 m — into the building's own frame: its north-west
 * corner at the origin, x east (to the street), z south.
 *
 * Two wings joined by a narrower middle under a stone box on the roof: the
 * north wing 13.9–15.1 × 5.2 m, its street end slanted; the south wing
 * 10.0–11.0 × 7.0 m, slanted the other way; the middle 1.15 m in from the
 * garden side. Five flats: three on the ground floor — A1 through the
 * middle, its garden behind, a bedroom in each wing; A2 in the north wing
 * and A3 in the south, each entered from its own garden under a louvred
 * pergola — and two on the first, up an outside stair along the north wing
 * to a landing under the stone box, each with a stair of its own up into
 * the box and out onto its roof terrace: a jacuzzi, a dining table under
 * the sky, an outdoor kitchen against the box, planters along the parapet.
 */
import { Building, door, doorway, entry, glassDoor, glazing, slider, win } from "./kit.js";

/** Storey height; the roof terraces at 6.0, the stone box to 9.8. */
export const AB = { storey: 3.0, roof: 6.0, parapet: 0.45, box: 9.8 };

const EXT = { t: 0.35, finish: "render_sand", back: "limewash_warm", reveal: "render_khaki" };
const STONE = { ...EXT, finish: "stone_cladding", reveal: "stone_trim" };
const PARTY = { t: 0.2 };

export function buildingAB(tag, offset, { furnish } = {}) {
    const b = new Building(tag, offset);
    ground(b);
    first(b);
    roof(b);
    furnish?.(b);
    return b;
}

// ---------------------------------------------------------------------
// Ground floor
// ---------------------------------------------------------------------

function ground(b) {
    const H = AB.storey;
    // Partitions stop 2 cm under the floor above, out of its plane.
    const g = (name, a, c, opts) => b.wall(`g-${name}`, a, c, { h: (opts?.t ?? 0.12) < 0.3 ? H - 0.02 : H, ...opts });

    // The outside walls.
    g("n", [0, 0.175], [13.76, 0.175], {
        ...EXT,
        outside: [5, -1],
        openings: [glazing(3.9, 4.78, { h: 2.5 }), win(8.25, 9.1, { blind: 0.5 }), glassDoor(10.05, 10.95, { swing: "inward_right", h: 2.45 }), glazing(11.0, 13.3)],
    });
    // The north wing's street end, slanted, glazed onto the pergola: the
    // glass stops at the kitchen's front, as the plan draws it, so
    // the run's end column stands before solid wall.
    g("e-n", [13.76, 0.175], [14.83, 5.025], { ...STONE, outside: [16, 2.5], openings: [glazing(2.3, 4.15)] });
    g("s-ne", [9.4, 5.025], [14.83, 5.025], { ...EXT, outside: [12, 6] });
    g("s-nw", [0, 5.025], [1.5, 5.025], { ...EXT, outside: [0.5, 6] });
    g("w-n", [0.175, 0.35], [0.175, 4.85], { ...EXT, outside: [-1, 2.5], openings: [win(2.1, 4.35, { blind: 0.3 })] });
    // The middle's garden side: A1's glass wall onto its pergola.
    // A1's garden side: a glazed door from the hall, a wide fixed window
    // over the sideboard, a glazed door from the dining end (renders 17, 18).
    g("w-m", [1.325, 5.2], [1.325, 9.63], { ...EXT, outside: [0, 7.4], openings: [glassDoor(5.45, 6.3, { swing: "outward_left", h: 2.45 }), win(6.38, 8.57, { h: 2.43, sill: 0.02, blind: null, panes: [2, 1] }), glassDoor(8.65, 9.55, { h: 2.45 })] });
    g("n-sw", [0, 9.805], [1.5, 9.805], { ...EXT, outside: [0.5, 9] });
    g("w-s", [0.175, 9.98], [0.175, 16.475], { ...EXT, outside: [-1, 13], openings: [win(10.1, 12.05, { blind: 0.3 })] });
    g("s", [0, 16.475], [9.75, 16.475], {
        ...EXT,
        outside: [5, 18],
        // A3's living glass: the plan's slider, its corner sofa's back
        // against it as drawn, so fixed glass in the same frames; the
        // front door beside it opens onto the same terrace.
        openings: [win(2.16, 3.12, { blind: 0.4 }), win(3.6, 5.3, { h: 1.1, sill: 1.1, blind: 0 }), entry(6.06, 7.0, { swing: "inward_left" }), win(7.85, 9.5, { h: 2.45, sill: 0.02, blind: null, panes: [2, 1] })],
    });
    // The south wing's street end, slanted the other way.
    g("e-s", [10.747, 9.805], [9.749, 16.475], { ...EXT, outside: [12, 13], openings: [win(10.9, 12.6, { blind: 0.55 }), glazing(13.4, 14.5), glazing(15.3, 16.2)] });
    g("n-se", [9.4, 9.805], [10.747, 9.805], { ...EXT, outside: [10, 9] });
    // The middle's street side, in the recess under the landing: A1's door,
    // hinged at its south jamb (the wall runs north, so its start), its leaf
    // opening west along the washer's end, as the plan draws it; 3 cm
    // north, towards the plan's, so the leaf swung wide clears the washer.
    g("e-m", [9.4, 5.2], [9.4, 9.63], { ...EXT, outside: [11, 7.4], openings: [glazing(6.65, 8.0, { h: 2.45 }), entry(8.12, 9.02, { h: 2.45, swing: "inward_left" })] });

    // Inside.
    g("a1-bed-e", [3.32, 0.35], [3.32, 4.42], { finish: "limewash_sand", back: "limewash_sand" });
    g("ne-s", [1.325, 5.1], [2.87, 5.1], { openings: [doorway(1.95, 2.8)] });
    // The two bathrooms reach north into the wing, as the plan draws them:
    // A1's basin and WC on a wall at 4.42, A2's door off the hall, its
    // basin and washer on its own; between them the A2 bedroom's wardrobe
    // recess keeps the line at 5.1. (Each wall that turns a corner runs to
    // the other's outer face, the other stopping at its inner face, so no
    // two faces share a plane.)
    g("a1-bath-n", [2.81, 4.42], [4.91, 4.42]);
    g("bath-jog-w", [4.85, 4.48], [4.85, 5.04]);
    g("ne-s-mid", [4.79, 5.1], [6.92, 5.1]);
    g("bath-jog-e", [6.86, 4.48], [6.86, 5.04]);
    g("a2-bath-n", [6.8, 4.42], [9.4, 4.42], { openings: [door(7.7, 8.55, { swing: "inward_left", fit: true })] }); // 0.85: a 0.9 leaf, fully open, cuts into the washer
    g("a2-bath-e", [9.31, 4.48], [9.31, 5.2], { t: 0.18 });
    // A2's bedroom runs on east under the twin room to its door, which
    // opens into it, hinged at its south jamb (the plan's).
    g("a2-bed-e", [6.06, 0.35], [6.06, 3.36]);
    g("a2-bed-l", [7.5, 3.36], [7.5, 4.42], { openings: [door(3.44, 4.34, { swing: "outward_right" })] });
    // The twin room's door opens into it, hinged at the east jamb, its leaf
    // back against the east wall, not across the hall: 0.875 m, as wide as
    // the second bed's foot and the wall's end leave its leaf.
    g("a2-twin-s", [6.06, 3.36], [9.2, 3.36], { openings: [door(8.25, 9.125, { swing: "outward_left", fit: true })] });
    g("a2-twin-e", [9.2, 0.35], [9.2, 3.36]);
    // The bathrooms' south wall: its bathroom face where the plan has it,
    // so the plan's table and chairs fit before the kitchen.
    g("mid-n", [5.71, 6.27], [9.225, 6.27], { back: "oak_cladding" });
    // A1's bathroom door hinged at its south jamb, its leaf along the south wall.
    g("a1-bath-w", [2.87, 4.48], [2.87, 6.27], { openings: [door(5.28, 6.18, { swing: "inward_right" })] });
    g("a1-bath-s", [2.87, 6.27], [5.71, 6.27], { back: "oak_cladding" });
    g("a1-bath-e", [5.71, 5.1], [5.71, 6.27]);
    g("sw-n", [1.325, 9.805], [9.4, 9.805], { openings: [door(1.99, 2.8)] });
    g("a1-bed2-e", [4.15, 9.805], [4.15, 13.0]);
    // A3's bathroom and bedroom doors open into their rooms, hinged at
    // their west jambs (the plan's); between them the entry wardrobe's
    // niche, opposite the front door.
    g("sw-mid", [0.35, 13.0], [5.6, 13.0], { openings: [door(4.4, 5.3, { swing: "outward_right" })] });
    g("sw-mid-e", [6.82, 13.0], [10.3, 13.0], { openings: [door(7.02, 7.92, { swing: "outward_right" })] }); // its open leaf clear of the wardrobe
    g("a3-bath-e", [6.24, 9.805], [6.24, 12.24]);
    g("a3-cl-n", [5.48, 12.24], [6.94, 12.24]);
    g("a3-cl-w", [5.54, 12.3], [5.54, 12.94]);
    g("a3-cl-e", [6.88, 12.3], [6.88, 12.94]);
    // The A3 bedroom's north face lined out to the façade wall's (9.98),
    // straight as the plan draws it, so the bed's head stands clear.
    g("a3-bed-lin", [6.3, 9.9225], [9.4, 9.9225], { t: 0.115 });
    g("a3-twin-e", [3.35, 13.0], [3.35, 16.3], { openings: [door(13.15, 13.95, { swing: "outward_left", fit: true })] }); // as drawn: hinged north, into the twin room; 0.8 so the leaf clears bed 1

    // Floors.
    // Ceilings a slab below the floor above.
    const r = (name, label, poly, floor) => b.room(`g-${name}`, label, poly, floor, { h: H - 0.25 });
    r("a1-bed", "A1 — bedroom", [[0.35, 0.35], [3.26, 0.35], [3.26, 4.36], [2.81, 4.36], [2.81, 4.85], [0.35, 4.85]], "oak_honey");
    r("a1-hall", "A1 — hall", b.rect(1.5, 5.15, 2.81, 6.33), "terrazzo");
    r("a1-bath", "A1 — bathroom", [[2.93, 4.48], [4.79, 4.48], [4.79, 5.16], [5.65, 5.16], [5.65, 6.21], [2.93, 6.21]], "bath_tile");
    r("a1-living", "A1 — living, dining & kitchen", [[1.5, 6.33], [9.22, 6.33], [9.22, 9.74], [1.5, 9.74]], "terrazzo");
    r("a1-bed2", "A1 — bedroom 2", b.rect(0.35, 9.87, 4.09, 12.94), "oak_honey");
    r("a2-bed", "A2 — bedroom", [[3.38, 0.35], [6.0, 0.35], [6.0, 3.42], [7.44, 3.42], [7.44, 4.36], [6.8, 4.36], [6.8, 5.04], [4.91, 5.04], [4.91, 4.36], [3.38, 4.36]], "oak_honey");
    r("a2-twin", "A2 — twin bedroom", b.rect(6.12, 0.35, 9.14, 3.3), "oak_honey");
    r("a2-living", "A2 — living, dining & kitchen", [[7.56, 3.42], [9.26, 3.42], [9.26, 0.35], [13.76, 0.35], [14.66, 4.85], [9.4, 4.85], [9.4, 4.36], [7.56, 4.36]], "terrazzo");
    r("a2-bath", "A2 — bathroom", [[5.77, 5.16], [6.92, 5.16], [6.92, 4.48], [9.22, 4.48], [9.22, 6.21], [5.77, 6.21]], "bath_tile");
    r("a3-bath", "A3 — bathroom", [[4.21, 9.87], [6.18, 9.87], [6.18, 12.18], [5.48, 12.18], [5.48, 12.94], [4.21, 12.94]], "bath_tile");
    r("a3-bed", "A3 — bedroom", [[6.3, 9.98], [10.58, 9.98], [10.15, 12.94], [6.94, 12.94], [6.94, 12.18], [6.3, 12.18]], "oak_honey");
    r("a3-closet", "A3 — entry closet", b.rect(5.6, 12.3, 6.82, 13.06), "terrazzo");
    r("a3-twin", "A3 — twin bedroom", b.rect(0.35, 13.06, 3.29, 16.3), "oak_honey");
    r("a3-living", "A3 — living, dining & kitchen", [[3.41, 13.06], [10.15, 13.06], [9.75, 16.3], [3.41, 16.3]], "terrazzo");
}

// ---------------------------------------------------------------------
// First floor
// ---------------------------------------------------------------------

function first(b) {
    const B = AB.storey;
    const H = AB.storey;
    const f = (name, a, c, opts) => b.wall(`f-${name}`, a, c, { base: B, h: (opts?.t ?? 0.12) < 0.3 ? H - 0.02 : H, ...opts });

    // The living's two-pane window as the plans draw it, solid wall from it
    // to the street corner.
    f("n", [0, 0.175], [13.76, 0.175], {
        ...EXT,
        outside: [5, -1],
        openings: [win(0.96, 2.91, { blind: 0.3 }), win(4.21, 6.26, { blind: 0.55 }), win(7.82, 9.08, { blind: 0.2 }), win(9.44, 11.8, { blind: 0.35, panes: [2, 1] })],
    });
    // The north wing's street corner: one window wrapping it, two panes a face.
    // Its sill raised to 0.95 on both faces, over the worktop running on under it.
    f("e-n", [13.76, 0.175], [14.83, 5.025], { ...EXT, outside: [16, 2.5], openings: [win(2.75, 5.025, { sill: 0.95, h: 1.45, blind: 0.45, panes: [2, 1] })] });
    // The kitchen window from the hob unit's end, where the plans start it.
    f("s-ne", [8.2, 5.025], [14.83, 5.025], { ...EXT, outside: [12, 6], openings: [win(12.23, 14.83, { sill: 0.95, h: 1.45, blind: 0.45, panes: [2, 1] })] });
    // The plan's return closing the kitchen run's west end: the core's east
    // wall carried on north to the worktop's front, flush with e-m's face.
    f("kit-end", [8.13, 4.22], [8.13, 5.2], { t: 0.21 });
    f("s-nw", [0, 5.025], [1.5, 5.025], { ...EXT, outside: [0.5, 6] });
    f("w-n", [0.175, 0.35], [0.175, 4.85], { ...EXT, outside: [-1, 2.5] });
    f("w-m", [1.325, 5.2], [1.325, 9.63], { ...EXT, outside: [0, 7.4], openings: [win(6.55, 7.35, { h: 1.2, sill: 1.0, blind: null }), win(7.75, 8.55, { h: 1.2, sill: 1.0, blind: null })] });
    f("n-sw", [0, 9.805], [1.5, 9.805], { ...EXT, outside: [0.5, 9] });
    f("w-s", [0.175, 9.98], [0.175, 16.475], { ...EXT, outside: [-1, 13], openings: [win(10.9, 11.5, { h: 1.6, sill: 0.7, blind: 0.4, panes: [1, 1] }), win(12.35, 12.95, { h: 1.6, sill: 0.7, blind: 0.4, panes: [1, 1] })] });
    f("s", [0, 16.475], [8.39, 16.475], { ...EXT, outside: [5, 18], openings: [win(0.91, 2.68, { blind: 0.4 }), win(6.35, 8.05, { blind: 0.3 })] });
    // The loggia: as the plan draws it, solid where the TV hangs and the
    // slider past it; a window over the kitchen's sink, another over its hob.
    f("loggia-w", [8.3, 13.08], [8.3, 16.3], { ...EXT, outside: [9.3, 14.5], openings: [slider(14.85, 16.2)] });
    f("loggia-n", [8.3, 13.08], [10.3, 13.08], { ...EXT, outside: [9.3, 14], openings: [win(8.46, 9.92, { sill: 1.05, h: 1.35, blind: null })] });
    f("e-s", [10.747, 9.805], [10.3, 13.08], { ...EXT, outside: [12, 11.5], openings: [win(11.5, 12.7, { sill: 1.05, h: 1.35, blind: 0.4, panes: [1, 1] })] });
    // The loggia's solid parapet of render, a metre high (not glass).
    f("loggia-par-e", [10.3, 13.08], [9.79, 16.475], { ...EXT, t: 0.25, h: 1.0, outside: [12, 15] });
    f("loggia-par-s", [8.39, 16.475], [9.79, 16.475], { ...EXT, t: 0.25, h: 1.0, outside: [9, 18] });
    f("n-se", [8.2, 9.805], [10.747, 9.805], { ...EXT, outside: [9.5, 9] });
    // The core onto the landing: two tall dark glazed front doors, both
    // hinged at the party wall and opening into their halls, as the plans
    // draw them (the wall runs north: _left is the south jamb).
    f("e-m", [8.2, 5.2], [8.2, 9.63], { ...EXT, outside: [9.5, 7.4], openings: [glassDoor(6.38, 7.28, { swing: "inward_left", h: 2.5 }), glassDoor(7.72, 8.62, { swing: "inward_right", h: 2.5 })] });

    // Inside: the north flat, its core as the plan draws it: an L-shaped
    // bathroom straight off the corridor (no lobby) with a walk-in shower
    // under the west window, the washers under the head of the roof stair
    // and the WC on its east wall; a guest WC off the hall (the plan's
    // closet behind it taken in, so its door can be walked through) behind
    // a pocket door, as the plan's slider; the stair rising west from the
    // hall. The core stands 0.3 m south of the plan's, so the corridor past
    // the bedrooms is a metre clear. Every bedroom door opens into its room,
    // hinged where the plan hinges it.
    f("bed1-e", [3.28, 0.35], [3.28, 4.47], { openings: [door(3.48, 4.38, { swing: "outward_right" })] });
    f("bed1-s", [1.325, 4.95], [2.55, 4.95]);
    // 5 cm north of the plan's, so 0.8 m stays before the kitchen's front.
    f("beds-s", [3.28, 3.35], [9.29, 3.35], { openings: [door(5.48, 6.38, { swing: "outward_left", fit: true }), door(7.23, 8.13, { swing: "outward_right" })] });
    // Bedrooms 2 and 3 split where the plan splits them: bedroom 2's
    // wardrobe against the partition, a box below it holding bedroom 3's.
    f("bed2-e", [7.1, 0.35], [7.1, 2.21]);
    f("box-n", [6.44, 2.21], [7.1, 2.21]);
    f("box-w", [6.44, 2.21], [6.44, 3.35]);
    f("bed3-e", [9.29, 0.35], [9.29, 3.35]);
    f("core-n", [2.49, 4.47], [7.01, 4.47], { openings: [door(4.15, 5.05, { swing: "inward_left" })] });
    f("bath-n-w", [2.55, 4.47], [2.55, 4.95]);
    f("bath-n-e", [3.97, 6.11], [3.97, 6.225]);
    // Under the stair, where it climbs over the bathroom: a low wall the
    // flight's width, its top in the steps' undersides, and full height
    // either side of it.
    f("bath-n-knee", [3.97, 6.225], [3.97, 7.275], { h: 1.65 });
    f("bath-n-end", [3.97, 7.275], [3.97, 7.49]);
    // The bathroom's WC on the partition where the plan has its pre-wall.
    f("lobby-n-s", [3.97, 6.11], [5.55, 6.11]);
    f("gwc-n-w", [5.55, 4.47], [5.55, 6.11]);
    f("gwc-n-s", [5.55, 6.11], [7.01, 6.11]);
    // The guest WC takes in the closet behind it and a strip of the lobby;
    // a pocket door, as the plan's slider, so no leaf swings over the WC.
    f("gwc-n-e", [7.01, 4.47], [7.01, 6.11], { openings: [{ ...door(5.1, 6.0), door: { ...door(5.1, 6.0).door, type: "pocket" } }] });
    f("party", [1.5, 7.49], [8.025, 7.49], PARTY);
    // The south flat's core, shallower: the same parts. Its south wall 4.5 cm
    // further south, towards the plan's (0.2 m thick, centred at 9.88), so
    // the bathroom takes the 2.18 m walk-in shower.
    f("core-s", [1.5, 9.85], [6.95, 9.85], { openings: [door(4.2, 5.1, { swing: "inward_left" })] }); // hinged east as drawn, clear of bedroom 1's open leaf
    f("bath-s-e", [3.97, 8.565], [3.97, 9.85], { openings: [door(8.88, 9.72, { swing: "inward_left", fit: true })] });
    f("bath-s-end", [3.97, 7.49], [3.97, 7.615]);
    f("bath-s-knee", [3.97, 7.615], [3.97, 8.565], { h: 1.65 });
    f("lobby-s-n", [3.97, 8.79], [5.4, 8.79]);
    f("gwc-s-w", [5.4, 8.79], [5.4, 9.85]);
    f("gwc-s-n", [5.4, 8.79], [6.95, 8.79]);
    // A pocket door, as the plan's slider (a hinged leaf swung in over the WC).
    f("gwc-s-e", [6.95, 8.79], [6.95, 9.85], { openings: [{ ...door(8.88, 9.72, { fit: true }), door: { ...door(8.88, 9.72).door, type: "pocket" } }] });
    // Bedroom 1's door where the plan has it, hinged at its north jamb and
    // opening into the living (into the room it would sweep the bed's foot);
    // bedroom 2's in its north wall, opening into it, its east wall solid
    // behind the corner sofa.
    f("sbed1-e", [3.5, 9.85], [3.5, 13.4], { openings: [door(10.8, 11.6, { swing: "inward_left" })] });
    f("sbeds", [0.35, 13.4], [4.52, 13.4], { openings: [door(3.56, 4.46, { swing: "inward_left", fit: true })] });
    f("sbed2-e", [4.52, 13.4], [4.52, 16.3]);

    const r = (name, label, poly, floor) => b.room(`f-${name}`, label, poly, floor, { elevation: B, h: H - 0.25 });
    r("n-bed1", "Upper north flat — bedroom", [[0.35, 0.35], [3.22, 0.35], [3.22, 4.41], [2.49, 4.41], [2.49, 4.89], [0.35, 4.89]], "oak_honey");
    r("n-bed2", "Upper north flat — bedroom 2", [[3.34, 0.35], [7.04, 0.35], [7.04, 2.15], [6.38, 2.15], [6.38, 3.29], [3.34, 3.29]], "oak_honey");
    r("n-bed3", "Upper north flat — bedroom 3", [[7.16, 0.35], [9.23, 0.35], [9.23, 3.29], [6.5, 3.29], [6.5, 2.27], [7.16, 2.27]], "oak_honey");
    r("n-living", "Upper north flat — living, dining & kitchen", [[3.34, 3.41], [9.35, 3.41], [9.35, 0.35], [13.76, 0.35], [14.66, 4.85], [8.235, 4.85], [8.235, 4.22], [8.025, 4.22], [8.025, 5.2], [8.2, 5.2], [8.2, 7.43], [3.97, 7.43], [3.97, 6.17], [7.07, 6.17], [7.07, 4.41], [3.34, 4.41]], "terrazzo");
    r("n-bath", "Upper north flat — bathroom", [[2.61, 4.53], [5.49, 4.53], [5.49, 6.05], [3.91, 6.05], [3.91, 7.43], [1.5, 7.43], [1.5, 5.01], [2.61, 5.01]], "bath_tile");
    r("n-wc", "Upper north flat — guest WC", b.rect(5.61, 4.53, 6.95, 6.05), "bath_tile");
    r("s-hall", "Upper south flat — hall", [[3.97, 7.55], [8.14, 7.55], [8.14, 9.74], [7.01, 9.74], [7.01, 8.73], [3.97, 8.73]], "terrazzo");
    r("s-bath", "Upper south flat — bathroom", b.rect(1.5, 7.55, 3.91, 9.79), "bath_tile");
    r("s-lobby", "Upper south flat — lobby", b.rect(4.03, 8.85, 5.34, 9.79), "terrazzo");
    r("s-wc", "Upper south flat — guest WC", b.rect(5.46, 8.85, 6.89, 9.79), "bath_tile");
    r("s-bed1", "Upper south flat — bedroom", b.rect(0.35, 9.91, 3.44, 13.34), "oak_honey");
    r("s-bed2", "Upper south flat — bedroom 2", b.rect(0.35, 13.46, 4.46, 16.3), "oak_honey");
    // On north round the hall's end to it, so no strip of floor is left out.
    r("s-living", "Upper south flat — living, dining & kitchen", [[3.56, 9.91], [7.01, 9.91], [7.01, 9.74], [8.14, 9.74], [8.14, 9.87], [10.65, 9.87], [10.2, 13.02], [8.24, 13.02], [8.24, 16.3], [4.58, 16.3], [4.58, 13.4], [3.56, 13.4]], "terrazzo");
    // Outside: the landing under the stone box, and the loggia.
    b.room("f-landing", "First-floor landing", b.rect(8.375, 5.2, 9.9, 9.63), "stone_paving", { elevation: B, ceiling: "none" });
    // The loggia: under the roof, its render soffit continuous with the façade's.
    b.room("f-loggia", "Upper south flat — loggia", [[8.39, 13.14], [10.3, 13.14], [9.8, 16.47], [8.39, 16.47]], "stone_paving_floor", { elevation: B, h: H - 0.25, ceiling: "ceiling_soffit" });

    // The outside stair, along the north wing up to the landing.
    b.stair("stair-out", [14.85, 5.83], "W", { width: 1.15, base: 0, top: B, run: 4.95, steps: 16, finish: "concrete_steps", riser: "concrete_grey", style: "slab" });
    // Each flat's own stair up into the stone box.
    // Each flat's own stair, rising west from its hall up into the stone
    // box, cast and open beneath (the washers stand under its head).
    // 15 steps of 0.2 over 0.25 (39°) with a metre's landing at the head;
    // the south one 0.95 wide, so its rail leaves a way to the box's slider.
    b.stair("stair-n", [6.25, 6.75], "W", { width: 1.05, base: B, top: AB.roof, run: 3.75, steps: 15, finish: "concrete_steps", riser: "concrete_grey", style: "slab", hole: [2.5, 6.15, 5.84, 7.35, ["z-"]] });
    b.stair("stair-s", [6.25, 8.09], "W", { width: 0.95, base: B, top: AB.roof, run: 3.75, steps: 15, finish: "concrete_steps", riser: "concrete_grey", style: "slab", hole: [2.5, 7.58, 5.84, 8.59, ["z+"]] });
}

// ---------------------------------------------------------------------
// The roof
// ---------------------------------------------------------------------

function roof(b) {
    const R = AB.roof;
    const P = { t: 0.25, base: R, h: AB.parapet, finish: "render_sand", back: "render_sand", reveal: "coping_dark" };
    const p = (name, a, c, outside) => b.wall(`p-${name}`, a, c, { ...P, outside });
    // Parapets round both wings' roofs.
    p("n", [0, 0.125], [13.83, 0.125], [5, -1]);
    p("e-n", [13.83, 0.125], [14.9, 5.07], [16, 2.5]);
    p("w-n", [0.125, 0.25], [0.125, 5.07], [-1, 2.5]);
    p("s-nw", [0, 5.07], [1.17, 5.07], [0.5, 6]);
    p("s-ne", [9.5, 5.07], [14.9, 5.07], [12, 6]);
    p("n-sw", [0, 9.755], [1.17, 9.755], [0.5, 9]);
    p("n-se", [9.5, 9.755], [10.8, 9.755], [10, 9]);
    p("w-s", [0.125, 9.88], [0.125, 16.525], [-1, 13]);
    p("s", [0, 16.525], [9.85, 16.525], [5, 18]);
    p("e-s", [10.8, 9.755], [9.85, 16.525], [12, 13]);

    // The stone box: each flat's stair arrives in its half, which opens
    // onto its terrace through a glass wall.
    const S = { t: 0.3, base: R, h: AB.box - R, finish: "stone_cladding", back: "limewash_warm", reveal: "stone_trim" };
    b.wall("box-n", [1.17, 4.98], [9.5, 4.98], { ...S, outside: [5, 3], openings: [slider(4.45, 6.0, { h: 2.4 }), glazing(6.05, 7.65, { h: 2.4 })] });
    b.wall("box-s", [1.17, 9.59], [9.5, 9.59], { ...S, outside: [5, 11], openings: [slider(4.45, 6.0, { h: 2.4 }), glazing(6.05, 7.65, { h: 2.4 })] });
    // Its west face unbroken stone, as both roof plans draw it.
    b.wall("box-w", [1.32, 5.13], [1.32, 9.44], { ...S, outside: [0, 7] });
    b.wall("box-e", [9.35, 5.13], [9.35, 9.44], { ...S, outside: [11, 7] });
    b.wall("box-mid", [1.47, 7.36], [8.29, 7.36], { base: R, h: AB.box - R, t: 0.15 });
    // The plans close both halls and utility rooms at x 8.29 with a wall the
    // box's depth; east of it, over the landing, the void they cross out
    // (f1's dashed X: open above), so no floor there.
    b.wall("box-void-w", [8.37, 5.13], [8.37, 9.44], { base: R, h: AB.box - R, t: 0.16 });
    // In each half, the stair's landing and a utility room with a sink.
    // The doors where the plan has them, past the sink on the west wall;
    // hinged at their east jambs and opening in, so the open leaf neither
    // closes the 0.9 m way outside nor stands between the door and the sink.
    b.wall("util-n-n", [5.9, 6.1], [8.29, 6.1], { base: R, h: AB.box - R, openings: [door(6.65, 7.35, { swing: "inward_left" })] });
    b.wall("util-n-w", [5.9, 6.1], [5.9, 7.29], { base: R, h: AB.box - R });
    b.wall("util-s-s", [5.9, 8.45], [8.29, 8.45], { base: R, h: AB.box - R, openings: [door(6.65, 7.35, { swing: "outward_left" })] });
    b.wall("util-s-w", [5.9, 7.43], [5.9, 8.45], { base: R, h: AB.box - R });
    b.room("r-box-n", "Upper north flat — stair to the roof", [[1.47, 5.13], [8.29, 5.13], [8.29, 6.04], [5.84, 6.04], [5.84, 7.29], [1.47, 7.29]], "concrete_steps", { elevation: R, h: AB.box - R - 0.3 });
    b.room("r-util-n", "Upper north flat — utility room", b.rect(5.96, 6.16, 8.29, 7.29), "concrete_steps", { elevation: R, h: AB.box - R - 0.3 });
    b.room("r-box-s", "Upper south flat — stair to the roof", [[1.47, 7.43], [5.84, 7.43], [5.84, 8.51], [8.29, 8.51], [8.29, 9.44], [1.47, 9.44]], "concrete_steps", { elevation: R, h: AB.box - R - 0.3 });
    b.room("r-util-s", "Upper south flat — utility room", b.rect(5.96, 7.43, 8.29, 8.39), "concrete_steps", { elevation: R, h: AB.box - R - 0.3 });
    // Stone to the top under a thin flush coping, as the renders show it.
    b.flatRoof("box-roof", 1.17, 4.83, 9.5, 9.74, AB.box, { overhang: 0.03, thickness: 0.08, soffit: "coping_grey" });

    // The terraces: decks inside the ring of planters the plan draws, white
    // gravel between the planters and the parapet (renders 15, 16).
    const t = (name, label, poly, floor) => b.room(`r-${name}`, label, poly, floor, { elevation: R, ceiling: "none" });
    t("n-deck", "Upper north flat — roof terrace", [[1.17, 1.15], [12.77, 1.15], [12.77, 3.73], [9.15, 3.73], [9.15, 4.83], [1.17, 4.83]], "stone_paving");
    t("n-gravel-n", "Roof", [[0.25, 0.25], [13.83, 0.25], [14.03, 1.15], [0.25, 1.15]], "roof_gravel");
    t("n-gravel-w", "Roof", b.rect(0.25, 1.15, 1.17, 4.95), "roof_gravel");
    t("n-gravel-e", "Roof", [[12.77, 1.15], [14.03, 1.15], [14.84, 4.95], [12.77, 4.95]], "roof_gravel");
    t("n-gravel-s", "Roof", [[9.15, 3.73], [12.77, 3.73], [12.77, 4.95], [9.5, 4.95], [9.5, 4.83], [9.15, 4.83]], "roof_gravel");
    t("s-deck", "Upper south flat — roof terrace", [[1.17, 9.74], [9.17, 9.74], [9.17, 13.67], [4.44, 13.67], [4.44, 15.53], [1.17, 15.53]], "stone_paving");
    t("s-gravel-w", "Roof", b.rect(0.25, 9.88, 1.17, 16.4), "roof_gravel");
    t("s-gravel-s", "Roof", [[1.17, 15.53], [4.44, 15.53], [4.44, 13.67], [9.17, 13.67], [9.17, 9.88], [10.68, 9.88], [9.78, 16.4], [1.17, 16.4]], "roof_gravel");
}

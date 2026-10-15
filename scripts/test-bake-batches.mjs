/**
 * The passes a bake's doors are shut in — and its switches would be lit
 * in, were that asked — (blender/lib/batches.py): held to their own rules
 * over made-up sites. By the rule a bake goes by (`joined`): every door in
 * exactly one pass; no two in a pass from the same part of the site —
 * rooms that openings join, however many lie between; as few passes as
 * the part with the most doors has doors; the same passes every time. And
 * by the looser rule kept for experiments: no two in a pass with a room in
 * common, or with a room of one opening into a room of the other; no pass
 * over its limit.
 *
 *     node scripts/test-bake-batches.mjs
 *
 * Needs python3 (any: the Python is plain).
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = join(ROOT, "blender", "lib", "batches.py");
const passesOf = (asked) => JSON.parse(execFileSync("python3", [PY], { input: JSON.stringify(asked), encoding: "utf8" }));

/** A seeded random number generator (mulberry32). */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Buildings of flats: a hall with rooms off it, some rooms with a room of their own, some flats joined by a stair. */
function site(random, buildings) {
    const links = {};
    const join2 = (a, b) => {
        (links[a] ??= []).push(b);
        (links[b] ??= []).push(a);
    };
    const rooms = [];
    for (let b = 0; b < buildings; b++) {
        let below = null;
        for (let f = 0, flats = 1 + Math.floor(random() * 4); f < flats; f++) {
            const hall = `b${b}-f${f}-hall`;
            links[hall] ??= [];
            rooms.push(hall);
            if (below && random() < 0.5) join2(hall, below);
            below = hall;
            for (let r = 0, count = 2 + Math.floor(random() * 6); r < count; r++) {
                const room = `b${b}-f${f}-r${r}`;
                rooms.push(room);
                join2(hall, room);
                if (random() < 0.3) {
                    rooms.push(`${room}-bath`);
                    join2(room, `${room}-bath`);
                }
            }
        }
    }
    // A switch a room (some rooms two), baked into its room and the rooms off it; a door a link.
    const switches = rooms.flatMap((room) => Array.from({ length: random() < 0.15 ? 2 : 1 }, () => [room, ...links[room]]));
    const doors = Object.entries(links).flatMap(([a, others]) => others.filter((b) => a < b).map((b) => [a, b]));
    return { links, switches, doors };
}

let failures = 0;
const fail = (...words) => {
    failures++;
    console.error("FAIL", ...words);
};
const reach = (zones, links) => new Set(zones.flatMap((zone) => [zone, ...(links[zone] ?? [])]));

function check(name, items, links, most) {
    const passes = passesOf({ items, links, most });
    const again = passesOf({ items, links, most });
    if (JSON.stringify(passes) !== JSON.stringify(again)) fail(name, "not the same passes twice");
    const seen = passes.flat().sort((a, b) => a - b);
    if (seen.length !== items.length || seen.some((index, k) => index !== k)) fail(name, "not every item in exactly one pass");
    for (const pass of passes) {
        if (most && pass.length > most) fail(name, "a pass of", pass.length, "over its limit of", most);
        for (let a = 0; a < pass.length; a++) {
            for (let b = a + 1; b < pass.length; b++) {
                const wide = reach(items[pass[a]], links);
                if (items[pass[b]].some((zone) => wide.has(zone))) fail(name, "items", pass[a], "and", pass[b], "share a pass and a room, or rooms that touch");
            }
        }
    }
    // The items of one room all clash: no fewer passes than the most there are of them.
    const by = {};
    for (const item of items) for (const zone of item) by[zone] = (by[zone] ?? 0) + 1;
    const floor = Math.max(1, ...Object.values(by));
    if (passes.length < floor) fail(name, passes.length, "passes, under the", floor, "it cannot do with fewer than");
    return { passes: passes.length, floor };
}

/** The parts of a site that openings join: each room's part, as one room's name. */
function partsOf(links) {
    const part = {};
    for (const start of Object.keys(links).sort()) {
        if (part[start]) continue;
        part[start] = start;
        const stack = [start];
        while (stack.length) {
            const room = stack.pop();
            for (const other of links[room] ?? []) {
                if (!part[other]) {
                    part[other] = start;
                    stack.push(other);
                }
            }
        }
    }
    return part;
}

/** The rule a bake goes by: only things in different parts of the site share a pass, and no more passes than the fullest part has things. */
function checkJoined(name, items, links) {
    const passes = passesOf({ items, links, joined: true });
    if (JSON.stringify(passes) !== JSON.stringify(passesOf({ items, links, joined: true }))) fail(name, "not the same passes twice");
    const seen = passes.flat().sort((a, b) => a - b);
    if (seen.length !== items.length || seen.some((index, k) => index !== k)) fail(name, "not every item in exactly one pass");
    const part = partsOf(links);
    const partsIn = (item) => new Set(item.map((zone) => part[zone] ?? zone));
    for (const pass of passes) {
        const taken = new Set();
        for (const index of pass) {
            for (const p of partsIn(items[index])) {
                if (taken.has(p)) fail(name, "two items of one part of the site in a pass");
            }
            for (const p of partsIn(items[index])) taken.add(p);
        }
    }
    const count = {};
    for (const item of items) for (const p of partsIn(item)) count[p] = (count[p] ?? 0) + 1;
    const most = Math.max(0, ...Object.values(count));
    if (passes.length !== most) fail(name, passes.length, "passes where the fullest part has", most, "items");
    return passes.length;
}

let houses = 0;
let worst = 0;
for (let seed = 1; seed <= 40; seed++) {
    const random = seeded(seed);
    const { links, switches, doors } = site(random, 1 + Math.floor(random() * 4));
    const a = check(`site ${seed} switches`, switches, links, seed % 3 === 0 ? 4 : undefined);
    const b = check(`site ${seed} doors`, doors, links);
    worst = Math.max(worst, a.passes / a.floor, b.passes / b.floor);
    checkJoined(`site ${seed} doors, by parts`, doors, links);
    checkJoined(`site ${seed} switches, by parts`, switches, links);
    houses++;
}
// Nothing to bake, one thing, and things with no room in common at all.
if (passesOf({ items: [], links: {} }).length !== 0) fail("no items: passes");
if (JSON.stringify(passesOf({ items: [["a"]], links: {} })) !== "[[0]]") fail("one item");
if (JSON.stringify(passesOf({ items: [["a"], ["b"], ["c"]], links: {} })) !== "[[0,1,2]]") fail("three apart: one pass");
if (passesOf({ items: [["a"], ["b"], ["c"]], links: { a: ["b"], b: ["a", "c"], c: ["b"] } }).length !== 2) fail("three in a row: two passes");
if (passesOf({ items: [["a"], ["b"], ["c"]], links: {}, most: 2 }).length !== 2) fail("three apart, two to a pass: two passes");
if (passesOf({ items: [["a"], ["b"], ["c"]], links: { a: ["b"], b: ["a", "c"], c: ["b"] }, joined: true }).length !== 3) fail("three in a row, by parts: three passes");
if (passesOf({ items: [["a", "b"], ["c"], ["d"]], links: { a: ["b"], b: ["a"], c: ["d"], d: ["c"] }, joined: true }).length !== 2) fail("two parts, by parts: two passes");

console.log(`${houses} made-up sites' switches and doors: ${failures ? failures + " FAILURES" : "every pass by the rules"}; by parts as few passes as the fullest part has doors; by rooms at most ${worst.toFixed(2)} times the passes the busiest room alone needs`);
process.exit(failures ? 1 : 0);

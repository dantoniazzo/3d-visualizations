#!/usr/bin/env node
/**
 * The people planner (shared/people.js) over many seeds, in node: every plan
 * it gives for a seeded scene with the people index as built, held against
 * the planner's own rules, and the plan the scene has saved read the same
 * way. It says nothing of how a plan LOOKS — a clip's arm through a rail, a
 * head off a headrest: that is people-audit.js, in the page, by skin.
 *
 *   node people-plans.mjs <scene-id>               # 20 seeds
 *   node people-plans.mjs <scene-id> --seeds 60
 *   node people-plans.mjs <scene-id> --seed 12     # one seed, its plan listed
 *
 * Per seed (`planPeople`, as scripts/place-people.mjs calls it):
 *   - the same plan twice; ids person-1… in order; no two on one seat or lounger;
 *   - the cast: no character twice until all are used, none twice in a group;
 *   - standing: on an outdoor floor, MARGIN from its edge and from the nearest
 *     obstacle (measured by bisecting the site's own clearOf), a group's
 *     members SPACING apart and no two of them playing one clip;
 *   - any two people APART (less FORWARD_MOST when one of them sits);
 *   - clips: of the pose; none made for the other sex; none of LEFT_OUT; a
 *     drink only in a hand that holds (the index's `hand`), a drinking clip
 *     always with the BOTTLE; lying, only what is laid or worn; sunglasses
 *     only where the index has the character's eyes;
 *   - seats: on its seat's point (FORWARD_MOST forward at most) and facing as
 *     it does; feet within FEET_MOST over and UNDER_MOST under the floor (the
 *     index's `sits` for that character and clip, else the clip scaled); knees
 *     LEG_CLEAR and, on a base not open, ankles HEEL_CLEAR before the front
 *     edge; feet short of what stands before the seat; a clip sat back in
 *     only on a deep soft seat out of doors; loungers: on its point, along
 *     it, and no clip that sits up of itself on a raised back;
 *   - the order: the first standing group, those lying by a pool, those
 *     sitting (out of doors, then in), the rest — and who the first 4 and
 *     the first 8 drawn are (Utils/device.js's `people.most`);
 *   - the validator: sanitizePeople and validateScene keep the plan as it
 *     is, and the same a second time.
 * Then other counts (0…40), the lesser indexes (the stand-in's, none),
 * characters whose eyes the index lacks, and planOne — the editor's Add —
 * near people of each pose of seed 3's plan.
 *
 * The limits are read from shared/people.js's own `const` lines, so a change
 * there is followed here; a constant it no longer has stops the run with its
 * name. Nothing is project-specific: the scene, the catalogue, seats.json and
 * the index are the repo's. Exit code 1 when any seed breaks a rule; what the
 * saved plan breaks is listed as notes only (the editor may put anyone
 * anywhere, and a vetted plan carries hand edits).
 *
 * The repo is four directories above this file, or REPO=<dir>.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../../.."));
const load = (path) => import(pathToFileURL(join(REPO, path)).href);
const readJson = (path) => JSON.parse(readFileSync(join(REPO, path), "utf8"));

const args = process.argv.slice(2);
const option = (name) => {
    const at = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
    if (at < 0) return undefined;
    return args[at].includes("=") ? args[at].slice(name.length + 1) : args[at + 1];
};
const sceneId = args.find((a, i) => !a.startsWith("--") && !["--seeds", "--seed"].includes(args[i - 1]));
if (!sceneId || !existsSync(join(REPO, "scenes", `${sceneId}.json`))) {
    console.error(`Usage: node people-plans.mjs <scene-id> [--seeds 20] [--seed n]\n${sceneId ? `No scene scenes/${sceneId}.json in ${REPO}.` : "Give the scene's id."}`);
    process.exit(2);
}
const only = option("--seed") !== undefined ? Number(option("--seed")) : null;
const SEEDS = only !== null ? [only] : Array.from({ length: Math.max(1, Number(option("--seeds") ?? 20)) }, (_, i) => i + 1);

const { planPeople, planOne, seatsOf, siteOf, isOutdoor, sanitizePeople, facingOf, DRINKS } = await load("shared/people.js");
const { validateScene } = await load("server/scene/validate.js");

// The planner's own limits, from its source.
const source = readFileSync(join(REPO, "shared/people.js"), "utf8");
const rule = (name) => {
    const found = new RegExp(`^const ${name} = ([^;]+);`, "m").exec(source);
    if (!found) {
        console.error(`shared/people.js has no "const ${name} = …;" any more: bring this check up to date with the planner.`);
        process.exit(2);
    }
    return Function(`"use strict"; return (${found[1]});`)();
};
const R = Object.fromEntries(
    [
        "MARGIN", "SPACING", "APART", "NEAR_POOL", "SEAT_HEIGHT", "SEAT_DEPTH", "FEET_MOST", "UNDER_MOST", "SIT_BACK", "LEG_CLEAR", "HEEL_CLEAR", "FORWARD_MOST",
        "FORWARD_BACK", "SEAT_UNDER", "FOOT", "LEG_SPACE", "LEGS_APART", "KNEE_HIGH", "GIVE", "RECLINED", "RECLINE_DEPTH", "SITS_UP", "RAISED", "BOTTLE", "LEFT_OUT",
        "BY_THE_POOL", "LYING_PROPS", "DRINKING", "LOUNGE",
    ].map((name) => [name, rule(name)])
);
const LAID = new Set(R.LYING_PROPS.map(([id]) => id));
/** Rounding: a position is kept to the millimetre, a rotation to a tenth of a degree. */
const MM = 0.002;

const record = readJson(`scenes/${sceneId}.json`);
const { scene: spec } = validateScene(record.scene);
const catalog = readJson("public/models/furniture/catalog.json");
if (!existsSync(join(REPO, "public/models/furniture/seats.json"))) {
    console.error("No public/models/furniture/seats.json: run `npm run seats` first.");
    process.exit(2);
}
const seats = readJson("public/models/furniture/seats.json");
const indexFile = ["index.json", "index.standin.json"].map((name) => `public/models/people/${name}`).find((path) => existsSync(join(REPO, path)));
const index = indexFile ? readJson(indexFile) : { characters: [], clips: { list: [] }, props: { list: [] } };
const items = new Map(catalog.items.map((i) => [i.id, i]));
const furniture = new Map(spec.furniture.map((f) => [f.id, f]));
const furnitureIds = new Set(furniture.keys());
const characters = new Map((index.characters ?? []).map((c) => [c.id, c]));
const clips = new Map((index.clips?.list ?? []).map((c) => [c.name, c]));
const propIds = new Set((index.props?.list ?? []).map((p) => p.id));
const site = siteOf(spec, catalog);
const cast = { characters: index.characters, clips: index.clips, props: index.props?.list };
const standingClips = [...clips.values()].filter((c) => c.pose === "stand");
const canHold = (clip) => clip.hand === "right" || clip.hand === "left";
/** With no clips at all the pose's own is played, a drink in its hand. */
const someoneHolds = !standingClips.length || standingClips.some(canHold);
const someoneDrinks = standingClips.some((c) => canHold(c) && R.DRINKING.test(c.name));

console.log(`${sceneId}: ${spec.furniture.length} pieces, ${spec.rooms.length} rooms; cast from ${indexFile ?? "no index (the stand-in avatars)"}: ${characters.size} characters, ${clips.size} clips, ${propIds.size} props`);
console.log(
    `rules (shared/people.js): MARGIN ${R.MARGIN}, SPACING ${R.SPACING.join("–")}, APART ${R.APART}, FEET_MOST ${R.FEET_MOST}, UNDER_MOST ${R.UNDER_MOST}, LEG_CLEAR ${R.LEG_CLEAR}, HEEL_CLEAR ${R.HEEL_CLEAR}, ` +
        `FORWARD_MOST ${R.FORWARD_MOST}, GIVE ${R.GIVE}, BOTTLE ${R.BOTTLE}, LEFT_OUT ${[...R.LEFT_OUT].join(", ") || "none"}`
);

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const sorted = (map) => [...map].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(", ");
const newStats = () => ({
    people: 0, stand: 0, sit: 0, lie: 0, drinks: 0, drinksStanding: 0, leftHanded: 0, sexed: 0, still: 0,
    clearance: Infinity, edge: Infinity, apart: Infinity, mates: [Infinity, 0],
    sitters: 0, feetSum: 0, feetWorst: 0, under: 0, give: 0, forwardCount: 0, forwardMost: 0, knees: Infinity, ankles: Infinity, space: Infinity,
    clips: new Map(), props: new Map(), seatKinds: new Map(), rooms: new Map(), first4: new Map(), first8: new Map(), lyingByPool: new Map(),
});

function edgeDistance(x, z, polygon) {
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, az] = polygon[j];
        const [bx, bz] = polygon[i];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return best;
}
/** The nearest obstacle to someone standing at a point, to the millimetre (up to 2 m): the widest margin the site's clearOf passes. */
function clearance(point) {
    let lo = 0;
    let hi = 2;
    if (site.clearOf(point, { margin: hi })) return hi;
    for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (site.clearOf(point, { margin: mid })) lo = mid;
        else hi = mid;
    }
    return lo;
}
/** Whom a device drawing at most `most` draws (World/People.js's `chosen`): the first whole groups that fit, in the spec's order. */
function drawn(people, most) {
    const units = [];
    for (const p of people) {
        const unit = p.group ? units.find((u) => u.group === p.group) : null;
        if (unit) unit.members.push(p);
        else units.push({ group: p.group, members: [p] });
    }
    const out = [];
    for (const unit of units) if (out.length + unit.members.length <= most) out.push(...unit.members);
    return out;
}
/** As shared/people.js's legSpace: how far before a seat's point the floor is clear for legs. */
function legSpace(seat) {
    const [dx, dz] = facingOf(seat.facing);
    const floor = seat.at[1] - seat.height;
    const way = site.obstacles.filter((o) => o.id !== seat.furniture && o.kind !== "doorway" && !(o.y1 <= floor + 0.08 || o.y0 >= floor + R.KNEE_HIGH) && (o.kind !== "furniture" || o.y1 < floor + R.KNEE_HIGH));
    for (let d = 0.2; d <= R.LEG_SPACE; d += 0.04) for (const o of way) if (o.distance(seat.at[0] + dx * d, seat.at[2] + dz * d) < R.LEGS_APART) return d;
    return Infinity;
}
/** As shared/people.js's waterDistance, for a pool: a point within NEAR_POOL of one on its level is by the pool. */
function byPool([x, y, z]) {
    return (spec.landscape?.pools ?? []).some((w) => Math.abs((w.level ?? 0) - y) <= 1.2 && Math.hypot(Math.max(w.box[0] - x, 0, x - w.box[2]), Math.max(w.box[1] - z, 0, z - w.box[3])) <= R.NEAR_POOL);
}
/** How a sitting clip sits on a character: [seat height it was made for, knee, tuck, far] — the index's own measure of the two, else the clip's scaled by the hips (legs null). */
function sitsOf(character, clip) {
    const own = character.sits?.[clip.name];
    if (Array.isArray(own) && own.length === 4 && own.every(Number.isFinite)) return own;
    if (!Array.isArray(clip.seat) || !Number.isFinite(character.hips) || !Number.isFinite(index.clips?.hips)) return null;
    return [(clip.seat[1] - (clip.feet?.[1] ?? 0)) * (character.hips / index.clips.hips), null, null, null];
}

/**
 * One plan against the rules: what it breaks, as lines. `full`: a whole plan
 * of the default count (the first group's drinker, the order, the first few
 * drawn). `who`: the characters as the planner was given them.
 */
function check(people, stats, { full = true, who = characters, count = null } = {}) {
    const out = [];
    const fail = (what) => out.push(what);

    // The validator keeps it as planned.
    const notes = [];
    const kept = sanitizePeople(people, notes, furnitureIds);
    if (notes.length || JSON.stringify(kept) !== JSON.stringify(people)) fail(`the validator changes it: ${notes.join("; ") || "fields differ"}`);
    if (new Set(people.map((p) => p.id)).size !== people.length) fail("ids repeat");
    if (full) people.forEach((p, i) => p.id === `person-${i + 1}` || fail(`${p.id} is not person-${i + 1}`));
    if (count !== null && people.length > count) fail(`${people.length} people for a count of ${count}`);

    // No two on one seat or lounger.
    const on = new Set();
    for (const p of people) {
        if (!p.seat) {
            if (p.pose !== "stand") fail(`${p.id} ${p.pose}s on no seat`);
            continue;
        }
        const key = `${p.seat.furniture}#${p.pose === "lie" ? "lie" : p.seat.index}`;
        if (on.has(key)) fail(`two on ${key}`);
        on.add(key);
    }

    // No character twice until all are used.
    if (who.size) {
        const uses = new Map();
        for (const p of people) bump(uses, p.character);
        const most = Math.max(...uses.values(), 0);
        const least = people.length >= who.size ? Math.min(...[...who.keys()].map((id) => uses.get(id) ?? 0)) : 0;
        if (people.length <= who.size ? most > 1 : most - least > 1) fail(`characters repeat unevenly: ${[...uses].map(([id, n]) => `${id} ×${n}`).join(", ")}`);
    }

    // Groups: together in the order, two or three, no character or standing clip twice, someone with a drink.
    const groups = new Map();
    people.forEach((p, i) => p.group && groups.set(p.group, [...(groups.get(p.group) ?? []), i]));
    for (const [group, members] of groups) {
        const of = members.map((i) => people[i]);
        if (full && members.at(-1) - members[0] !== members.length - 1) fail(`${group} is not together in the order`);
        if (full && (members.length < 2 || members.length > 3)) fail(`${group} has ${members.length}`);
        if (new Set(of.map((p) => p.character)).size !== of.length) fail(`${group} has a character twice`);
        if (!of.every((p) => p.pose === "stand")) continue;
        if (full && of.every((p) => p.clip) && new Set(of.map((p) => p.clip)).size !== of.length) fail(`${group} plays a clip twice: ${of.map((p) => p.clip).join(", ")}`);
        if (full && someoneHolds && !of.some((p) => p.prop)) fail(`${group} has no drink`);
        for (let a = 0; a < of.length; a++) {
            for (let b = a + 1; b < of.length; b++) {
                const d = Math.hypot(of[a].position[0] - of[b].position[0], of[a].position[2] - of[b].position[2]);
                stats.mates = [Math.min(stats.mates[0], d), Math.max(stats.mates[1], d)];
                if (full && (d < R.SPACING[0] - MM || d > R.SPACING[1] + MM)) fail(`${of[a].id} and ${of[b].id} of ${group} stand ${d.toFixed(2)} m apart (SPACING ${R.SPACING.join("–")})`);
            }
        }
    }

    // The first group has someone drinking; no two sit back alike.
    const firstGroup = people[0]?.pose === "stand" ? people[0].group : null;
    const firstOnes = firstGroup ? people.filter((p) => p.group === firstGroup) : [];
    if (full && someoneDrinks && firstOnes.length && !firstOnes.some((p) => R.DRINKING.test(p.clip ?? ""))) fail("no one drinking in the first group");
    const backs = people.filter((p) => /reclin/i.test(p.clip ?? "")).map((p) => p.clip);
    if (full && new Set(backs).size !== backs.length) fail(`two sit back alike: ${backs.join(", ")}`);

    // The order: the first standing group, those lying by a pool, those sitting out of doors, then in, the other groups, those lying elsewhere.
    if (full) {
        const outdoors = (p) => {
            const piece = furniture.get(p.seat?.furniture);
            return !piece || isOutdoor(site.roomAt(...piece.position));
        };
        const rank = (p) => (p.pose === "stand" ? (p.group === firstGroup ? 0 : 4) : p.pose === "lie" ? (byPool(p.position) ? 1 : 5) : outdoors(p) ? 2 : 3);
        const ranks = people.map(rank);
        if (ranks.some((r, i) => i && r < ranks[i - 1])) fail(`out of order: ${ranks.join("")} (0 the first standing group, 1 lying by a pool, 2 sitting outdoors, 3 indoors, 4 other groups, 5 lying elsewhere)`);
        if (people.some((p) => p.pose === "stand") && people[0].pose !== "stand") fail("does not begin with a standing group");
        const key = (list) => `${list.filter((p) => p.pose === "stand").length} standing, ${list.filter((p) => p.pose === "lie").length} lying, ${list.filter((p) => p.pose === "sit").length} sitting`;
        bump(stats.first4, key(drawn(people, 4)));
        bump(stats.first8, key(drawn(people, 8)));
        const lying = people.filter((p) => p.pose === "lie" && byPool(p.position)).map((p) => p.clip);
        if (lying.length >= 2) bump(stats.lyingByPool, new Set(lying).size === 1 ? "alike" : "mixed");
        const lyingClips = [...clips.values()].filter((c) => c.pose === "lie" && !/propp/i.test(c.name));
        if (lying.length >= 2 && new Set(lying).size === 1 && lyingClips.length >= 2) fail(`the ${lying.length} lying by the pool all play ${lying[0]}`);
    }

    for (const p of people) {
        const character = who.get(p.character) ?? null;
        const clip = p.clip ? clips.get(p.clip) ?? null : null;
        if (who.size && !character) fail(`${p.id}: no character ${p.character} in the index`);
        if (p.clip && !clip) fail(`${p.id}: no clip ${p.clip} in the index`);
        if (p.prop && propIds.size && !propIds.has(p.prop)) fail(`${p.id}: no prop ${p.prop} in the index`);
        stats.people++;
        stats[p.pose]++;
        bump(stats.props, `${p.pose}: ${p.prop ?? "nothing"}`);
        const held = Boolean(p.prop) && DRINKS.includes(p.prop);
        if (p.prop === "sunglasses" && character && !Array.isArray(character.eyes)) fail(`${p.id}: sunglasses on ${p.character}, whose eyes the index lacks`);
        if (p.pose === "lie") {
            if (p.prop && !LAID.has(p.prop)) fail(`${p.id}: lying with ${p.prop}`);
        } else if (p.prop && !held) fail(`${p.id}: ${p.pose}ing with ${p.prop}`);
        if (clip) {
            bump(stats.clips, clip.name);
            if (clip.pose !== p.pose) fail(`${p.id}: a ${clip.pose} clip (${clip.name}) ${p.pose}ing`);
            if (clip.sex && character?.sex && clip.sex !== character.sex) fail(`${p.id}: ${clip.name} played by ${character.id} (${character.sex})`);
            if (R.LEFT_OUT.has(clip.name)) fail(`${p.id}: ${clip.name}, which the planner leaves out`);
            if (clip.sex) stats.sexed++;
            if (clip.still) stats.still++;
            if (p.pose !== "lie") {
                const drinks = R.DRINKING.test(clip.name);
                if (held && !canHold(clip)) fail(`${p.id}: ${p.prop} with ${clip.name}, whose hands hold nothing`);
                if (drinks && canHold(clip) && p.prop !== R.BOTTLE) fail(`${p.id}: ${clip.name} with ${p.prop ?? "nothing"}, not the bottle (${R.BOTTLE})`);
                if (held) {
                    stats.drinks++;
                    if (p.pose === "stand") stats.drinksStanding++;
                    if (clip.hand === "left") stats.leftHanded++;
                }
            }
        }

        const [x, y, z] = p.position;
        if (p.pose === "stand") {
            const room = site.roomAt(x, y, z);
            if (!room) fail(`${p.id} stands on no floor`);
            else {
                if (!isOutdoor(room)) fail(`${p.id} stands indoors in ${room.name}`);
                const edge = edgeDistance(x, z, room.polygon);
                stats.edge = Math.min(stats.edge, edge);
                if (edge < R.MARGIN - MM) fail(`${p.id} is ${edge.toFixed(2)} m from the edge of ${room.name}`);
                bump(stats.rooms, `stand: ${room.name}`);
            }
            const clear = clearance(p.position);
            stats.clearance = Math.min(stats.clearance, clear);
            if (clear < R.MARGIN - MM) fail(`${p.id} is ${clear.toFixed(2)} m from ${site.blockedBy(p.position)}`);
            continue;
        }
        const placement = furniture.get(p.seat?.furniture);
        const placed = placement ? seatsOf(placement, seats) : null;
        if (!placed) {
            if (p.seat) fail(`${p.id}: ${p.seat.furniture} is not a piece of seats.json`);
            continue;
        }
        const item = items.get(placement.catalog_id);
        const room = site.roomAt(...placement.position);
        bump(stats.rooms, `${p.pose}: ${room?.name ?? "outside"}${room && !isOutdoor(room) ? " (indoors)" : ""}`);
        if (p.pose === "lie") {
            if (!placed.lie) {
                fail(`${p.id}: no one lies on ${item?.name ?? placement.catalog_id}`);
                continue;
            }
            const at = placed.lie.at;
            if (Math.hypot(at[0] - x, at[1] - y, at[2] - z) > MM) fail(`${p.id} is not on its lounger's point`);
            if (Math.abs(((placed.lie.rotation - p.rotation + 540) % 360) - 180) > 0.1) fail(`${p.id} does not lie along its lounger`);
            const sitsUp = clip && Array.isArray(clip.head) && Array.isArray(clip.seat) ? clip.head[1] - clip.seat[1] > R.SITS_UP : /propp/i.test(p.clip ?? "");
            if (sitsUp && placed.lie.incline > R.RAISED) fail(`${p.id}: ${p.clip} on a lounger raised ${placed.lie.incline}°`);
            continue;
        }
        const seat = placed.seats[p.seat.index];
        if (!seat) {
            fail(`${p.id}: ${item?.name ?? placement.catalog_id} has no seat #${p.seat.index}`);
            continue;
        }
        bump(stats.seatKinds, `${item?.name ?? placement.catalog_id} (${seat.height.toFixed(2)} m, ${seat.base ?? "base unknown"})`);
        const [fx, fz] = facingOf(seat.facing);
        const forward = (x - seat.at[0]) * fx + (z - seat.at[2]) * fz;
        const aside = Math.abs((x - seat.at[0]) * fz - (z - seat.at[2]) * fx);
        const reclined = clip ? (Array.isArray(clip.seat) && Array.isArray(clip.head) && clip.seat[2] - clip.head[2] > R.RECLINED) || /reclin/i.test(clip.name) : false;
        if (aside > MM || forward < -MM || forward > (reclined ? R.FORWARD_BACK : R.FORWARD_MOST) + MM) fail(`${p.id} is ${forward.toFixed(3)} m forward and ${aside.toFixed(3)} m aside of its seat's point`);
        if (Math.abs(((seat.facing - p.rotation + 540) % 360) - 180) > 0.1) fail(`${p.id} does not face as its seat does`);
        if (forward > MM) {
            stats.forwardCount++;
            stats.forwardMost = Math.max(stats.forwardMost, forward);
        }
        const soft = placed.kind === "sofa" || R.LOUNGE.test(`${placement.catalog_id} ${item?.name ?? ""}`);
        const give = seat.at[1] - y;
        if (give < -0.0006 || give > R.GIVE + 0.0006 || (give > 0.0006 && !soft)) fail(`${p.id}: its seat gives ${give.toFixed(3)} m (${item?.name ?? placement.catalog_id})`);
        if (reclined && !(soft && isOutdoor(room) && seat.room >= R.RECLINE_DEPTH)) fail(`${p.id}: ${clip.name} on ${item?.name ?? placement.catalog_id}, not a deep soft seat out of doors`);
        stats.sitters++;
        if (give > 0.0006) stats.give++;
        const sits = character && clip ? sitsOf(character, clip) : null;
        if (!sits) continue;
        const [made, knee, tuck, far] = sits;
        // Feet off the floor: hanging (+) or under it (−), after the seat has given.
        const off = seat.height - give - made;
        stats.feetSum += Math.abs(off);
        stats.feetWorst = Math.max(stats.feetWorst, Math.abs(off));
        stats.under = Math.max(stats.under, -off);
        if (off > R.FEET_MOST + 0.0006 || off < -R.UNDER_MOST - 0.0006) fail(`${p.id}: feet ${(off * 100).toFixed(1)} cm off the floor (${clip.name} by ${character.id} on ${item?.name ?? placement.catalog_id})`);
        if (knee === null) continue;
        // Its legs before the seat's front edge, and its feet short of what stands before it.
        const edge = seat.depth - Math.min(R.SIT_BACK, seat.depth / 2) - forward;
        stats.knees = Math.min(stats.knees, knee - edge);
        if (knee - edge < R.LEG_CLEAR - 0.0015) fail(`${p.id}: knees ${((knee - edge) * 100).toFixed(1)} cm before the front edge of ${item?.name} #${p.seat.index}, ${clip.name} by ${character.id}`);
        if (seat.base !== "open") {
            stats.ankles = Math.min(stats.ankles, tuck - edge);
            if (tuck - edge < R.HEEL_CLEAR - 0.0015) fail(`${p.id}: ankles ${((tuck - edge) * 100).toFixed(1)} cm before the ${seat.base ?? "unknown"} base of ${item?.name} #${p.seat.index}, ${clip.name} by ${character.id}`);
        }
        if (edge < R.SEAT_UNDER - MM) fail(`${p.id}: only ${edge.toFixed(2)} m of seat under them`);
        const space = legSpace(seat) - forward - far - R.FOOT;
        stats.space = Math.min(stats.space, space);
        if (space < -0.0015) fail(`${p.id}: feet ${(-space * 100).toFixed(1)} cm into what stands before ${item?.name} #${p.seat.index}, ${clip.name}`);
    }

    // No two too close: APART, less FORWARD_MOST where one sits (their seat's point was APART away).
    for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
            const [a, b] = [people[i], people[j]];
            if (Math.abs(a.position[1] - b.position[1]) >= 1) continue;
            const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
            stats.apart = Math.min(stats.apart, d);
            if ((a.group && a.group === b.group) || (a.seat && b.seat)) continue;
            const least = R.APART - (a.seat || b.seat ? R.FORWARD_MOST : 0);
            if (d < least - MM) fail(`${a.id} and ${b.id} are ${d.toFixed(2)} m apart`);
        }
    }
    return out;
}

const num = (v, scale = 1, digits = 2) => (Number.isFinite(v) ? (v * scale).toFixed(digits) : "-");
function report(stats, n) {
    console.log(`  ${stats.people} people over ${n} plan${n === 1 ? "" : "s"}: ${stats.stand} standing, ${stats.sit} sitting, ${stats.lie} lying`);
    console.log(`  clips: ${sorted(stats.clips) || "none"}`);
    console.log(`  props: ${sorted(stats.props)}`);
    console.log(`  drinks: ${stats.drinks} held (${stats.drinksStanding} standing), ${stats.leftHanded} in a left hand; clips made for one sex: ${stats.sexed}; still poses: ${stats.still}`);
    console.log(`  standing: nearest obstacle ${num(stats.clearance)} m, nearest room edge ${num(stats.edge)} m; a group's members ${num(stats.mates[0])}–${num(stats.mates[1])} m apart; any two people at least ${num(stats.apart)} m`);
    if (stats.sitters) {
        console.log(
            `  sitting: feet ${num(stats.feetSum / stats.sitters, 100, 1)} cm off the floor on average, ${num(stats.feetWorst, 100, 1)} at worst (under it ${num(Math.max(0, stats.under), 100, 1)} at most); ${stats.give} of ${stats.sitters} on a seat that gives; ` +
                `${stats.forwardCount} sit forward, ${num(stats.forwardMost, 100, 1)} cm at most; knees at least ${num(stats.knees, 100, 1)} cm before the front edge` +
                (Number.isFinite(stats.ankles) ? `, ankles ${num(stats.ankles, 100, 1)} before a solid base` : "") +
                (Number.isFinite(stats.space) ? `, feet ${num(stats.space, 100, 1)} short of what stands before the seat` : `, nothing within ${R.LEG_SPACE} m before any seat`)
        );
        console.log(`  seats: ${sorted(stats.seatKinds)}`);
    }
    console.log(`  where: ${sorted(stats.rooms)}`);
}

const problems = [];
const failAll = (label, lines) => problems.push(...lines.map((line) => `${label}: ${line}`));

// --- the default plan, seed by seed --------------------------------------------
{
    const stats = newStats();
    const sizes = [];
    for (const seed of SEEDS) {
        const people = planPeople(spec, catalog, seats, { seed, ...cast });
        const found = check(people, stats);
        if (JSON.stringify(people) !== JSON.stringify(planPeople(spec, catalog, seats, { seed, ...cast }))) found.push("not the same plan twice");
        // Into the scene and through the validator, twice.
        const once = validateScene({ ...record.scene, people });
        const twice = validateScene(JSON.parse(JSON.stringify(once.scene)));
        if (JSON.stringify(once.scene.people) !== JSON.stringify(people)) found.push("validateScene changes the people");
        if (JSON.stringify(twice.scene) !== JSON.stringify(once.scene)) found.push("validateScene is not the same a second time");
        const noted = once.notes.filter((note) => /people/.test(note));
        if (noted.length) found.push(`validateScene notes: ${noted.join("; ")}`);
        failAll(`seed ${seed}`, found);
        sizes.push(people.length);
        if (only !== null) {
            for (const p of people) {
                console.log(`  ${p.id.padEnd(10)} ${p.pose.padEnd(5)} ${(p.group ?? "").padEnd(8)} ${p.character.padEnd(10)} ${String(p.clip).padEnd(26)} ${(p.prop ?? "-").padEnd(11)} [${p.position.map((v) => v.toFixed(2)).join(", ")}] ${String(p.rotation).padStart(6)}°${p.seat ? `  ${p.seat.furniture}#${p.seat.index}` : ""}`);
            }
        }
    }
    console.log(`\n${SEEDS.length} seed${SEEDS.length === 1 ? "" : "s"} (${SEEDS[0]}…${SEEDS.at(-1)}), ${sizes.join(",")} people`);
    report(stats, SEEDS.length);
    console.log(`  the first 4 drawn: ${sorted(stats.first4)}`);
    console.log(`  the first 8 drawn: ${sorted(stats.first8)}`);
    if (stats.lyingByPool.size) console.log(`  lying by the pool, two or more: ${sorted(stats.lyingByPool)}`);
}

if (only === null) {
    // --- other counts ----------------------------------------------------------------
    {
        const lines = [];
        for (const count of [0, 1, 2, 3, 4, 6, 8, 16, 24, 40]) {
            const got = [];
            for (const seed of [101, 202, 303, 404, 505]) {
                const people = planPeople(spec, catalog, seats, { seed, count, ...cast });
                failAll(`seed ${seed}, count ${count}`, check(people, newStats(), { full: false, count }));
                got.push(people.length);
            }
            lines.push(`${count}: ${got.join(",")}`);
        }
        console.log(`\nother counts (asked: got, five seeds each) — ${lines.join("; ")}`);
    }

    // --- lesser indexes: the stand-in's, and none -----------------------------------
    {
        const standinFile = "public/models/people/index.standin.json";
        const standin = existsSync(join(REPO, standinFile)) && indexFile !== standinFile ? readJson(standinFile) : null;
        const lesser = [["no index", {}]];
        if (standin) lesser.unshift(["the stand-in index", { characters: standin.characters, clips: standin.clips, props: standin.props?.list }]);
        for (const [label, options] of lesser) {
            let n = 0;
            let wrong = 0;
            const list = options.clips?.list ?? [];
            for (const seed of SEEDS) {
                const people = planPeople(spec, catalog, seats, { seed, ...options });
                if (JSON.stringify(people) !== JSON.stringify(planPeople(spec, catalog, seats, { seed, ...options }))) problems.push(`seed ${seed}, ${label}: not the same plan twice`);
                const notes = [];
                if (JSON.stringify(sanitizePeople(people, notes, furnitureIds)) !== JSON.stringify(people) || notes.length) problems.push(`seed ${seed}, ${label}: the validator changes the plan`);
                for (const p of people) {
                    n++;
                    const clip = list.find((c) => c.name === p.clip);
                    if (p.clip && !clip) problems.push(`seed ${seed}, ${label}: no clip ${p.clip}`);
                    if (clip && clip.pose !== p.pose) wrong++;
                    if (clip && p.prop && p.pose !== "lie" && clip.hand === false) wrong++;
                }
            }
            if (wrong) problems.push(`${label}: ${wrong} against the rules (a clip of another pose, or a drink in a hand that holds nothing)`);
            console.log(`${label}: ${n} people over ${SEEDS.length} seeds, ${wrong} against the rules`);
        }
    }

    // --- a character whose eyes the index lacks gets no sunglasses --------------------
    {
        const sighted = (index.characters ?? []).filter((c) => Array.isArray(c.eyes)).slice(0, 3).map((c) => c.id);
        if (sighted.length && propIds.has("sunglasses")) {
            const blind = index.characters.map((c) => (sighted.includes(c.id) ? { ...c, eyes: null } : c));
            let worn = 0;
            for (const seed of SEEDS) {
                for (const p of planPeople(spec, catalog, seats, { seed, ...cast, characters: blind })) {
                    if (p.prop !== "sunglasses") continue;
                    worn++;
                    if (sighted.includes(p.character)) problems.push(`seed ${seed}: sunglasses on ${p.character}, with no eyes in the index`);
                }
            }
            console.log(`with ${sighted.join(", ")}'s eyes taken out of the index: ${worn} pairs of sunglasses over ${SEEDS.length} seeds, none on them`);
        }
    }

    // --- one more, as the editor adds them: near people of each pose of seed 3's plan ---
    {
        const base = planPeople(spec, catalog, seats, { seed: 3, ...cast });
        const near = ["stand", "sit", "lie"].flatMap((pose) => base.filter((p) => p.pose === pose).slice(0, 2).map((p) => [pose, p.position]));
        const far = [Math.max(...spec.rooms.flatMap((r) => r.polygon.map((q) => q[0]))) + 500, 0, 0];
        near.push(["stand", far]);
        let people = [...base];
        let added = 0;
        let refused = 0;
        const reach = (at, to) => Math.hypot(to[0] - at[0], to[2] - at[2]) + Math.abs(to[1] - at[1]) * 2;
        for (const [pose, at] of near) {
            for (let seed = 1; seed <= 3; seed++) {
                const one = planOne({ ...spec, people }, catalog, seats, { pose, near: at, seed, ...cast });
                if (at === far) {
                    if (one) problems.push("planOne: placed someone 500 m off the site");
                    continue;
                }
                if (!one) {
                    // None is right when every seat or lounger within its 12 m is taken.
                    const free = spec.furniture.flatMap((f) => {
                        const placed = seatsOf(f, seats);
                        if (!placed) return [];
                        if (pose === "lie") return placed.lie && !people.some((q) => q.pose === "lie" && q.seat?.furniture === f.id) ? [placed.lie.at] : [];
                        if (placed.kind === "stool") return [];
                        return placed.seats.filter((s) => s.height <= R.SEAT_HEIGHT[1] && s.depth <= R.SEAT_DEPTH[1] && !people.some((q) => q.pose === "sit" && q.seat?.furniture === f.id && q.seat.index === s.index)).map((s) => s.at);
                    });
                    if (pose === "stand" || free.some((to) => reach(at, to) <= 12)) problems.push(`planOne: no one to ${pose} near ${at.join(", ")}`);
                    else refused++;
                    continue;
                }
                if (JSON.stringify(one) !== JSON.stringify(planOne({ ...spec, people }, catalog, seats, { pose, near: at, seed, ...cast }))) problems.push("planOne: not the same twice");
                if (people.some((p) => p.id === one.id)) problems.push(`planOne: id ${one.id} taken`);
                if (one.pose !== pose) problems.push(`planOne: asked to ${pose}, got ${one.pose}`);
                if (one.seat && people.some((p) => p.seat?.furniture === one.seat.furniture && (pose === "lie" ? p.pose === "lie" : p.pose === "sit" && p.seat.index === one.seat.index))) problems.push(`planOne: seat taken: ${one.seat.furniture}#${one.seat.index}`);
                // The editor's Add takes the nearest free seat whatever its height, and joins a group as it stands: only who plays what is held to the rules.
                const clip = clips.get(one.clip);
                const character = characters.get(one.character);
                if (one.clip && (!clip || clip.pose !== pose)) problems.push(`planOne: ${pose} with ${one.clip}`);
                if (clip?.sex && character?.sex && clip.sex !== character.sex) problems.push(`planOne: ${one.clip} by ${one.character}`);
                if (clip && R.LEFT_OUT.has(clip.name)) problems.push(`planOne: ${clip.name}, which the planner leaves out`);
                if (clip && one.prop && pose !== "lie" && !canHold(clip)) problems.push(`planOne: ${one.prop} with ${one.clip}, whose hands hold nothing`);
                if (clip && pose !== "lie" && canHold(clip) && R.DRINKING.test(clip.name) && one.prop !== R.BOTTLE) problems.push(`planOne: ${one.clip} with ${one.prop}, not the bottle`);
                const notes = [];
                if (JSON.stringify(sanitizePeople([one], notes, furnitureIds)?.[0]) !== JSON.stringify(one)) problems.push(`planOne: the validator changes ${one.id}`);
                people = [...people, one];
                added++;
            }
        }
        const uses = new Map([...characters.keys()].map((id) => [id, 0]));
        for (const p of people) bump(uses, p.character);
        const spread = uses.size ? `each character ${Math.min(...uses.values())}–${Math.max(...uses.values())} times` : "";
        if (uses.size && Math.max(...uses.values()) - Math.min(...uses.values()) > 1) problems.push(`planOne: characters used unevenly: ${[...uses].map(([id, n]) => `${id} ×${n}`).join(", ")}`);
        console.log(`planOne (the editor's Add): ${added} added to seed 3's ${base.length} near its people, ${refused} refused with every seat or lounger in reach taken; ${spread}`);
    }

    // --- the plan the scene has saved: notes, not problems ----------------------------
    if (Array.isArray(spec.people) && spec.people.length) {
        const stats = newStats();
        const notes = check(spec.people, stats);
        console.log(`\nthe scene's saved people (${spec.people.length}), by the same rules — notes only, a vetted plan carries hand edits:`);
        report(stats, 1);
        console.log(notes.length ? `  ${notes.length} off the planner's rules:\n    ${notes.join("\n    ")}` : "  nothing off the planner's rules");
    } else console.log("\nthe scene has no saved people (npm run people:place -- <scene-id> --seed n)");
}

console.log(problems.length ? `\n${problems.length} PROBLEM${problems.length === 1 ? "" : "S"}:\n  ${problems.slice(0, 60).join("\n  ")}${problems.length > 60 ? `\n  … and ${problems.length - 60} more` : ""}` : "\nNo problems.");
process.exit(problems.length ? 1 : 0);

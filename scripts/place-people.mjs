/**
 * Give a space its people: plan them (shared/people.js) and keep them in
 * its spec's `people`, where the editor moves, turns, adds and removes
 * them and World/People.js draws them.
 *
 *   npm run people:place -- <scene-id> [--seed n] [--count n]
 *   npm run people:place -- <scene-id> --dry-run           # plan, print, write nothing
 *   npm run people:place -- <scene-id> --out <file.json>   # the plan to a file instead
 *   npm run people:place -- <scene-id> --png <file.png>    # and a picture of it from above
 *
 * Who they can be — the characters, their clips, what they can hold — is
 * the people index's (public/models/people/index.json, written by the
 * conversion of assets/people), or the stand-in's (index.standin.json),
 * or failing both the visitor's two avatars. Where they can sit or lie is
 * the catalogue's seats.json (`npm run seats`).
 *
 * Without --dry-run or --out it writes the scene, as an editor save does:
 * the people put in its spec, the spec validated, the record written — so
 * reload every open editor tab of the space first, or one autosaves its
 * old spec over them. A seed of the space (`npm run seed -- <id>`)
 * rebuilds its spec without them: place them again after one.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { planPeople, sanitizePeople, seatsOf, siteOf, isOutdoor } from "../shared/people.js";
import { validateScene } from "../server/scene/validate.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const id = args.find((a, i) => !a.startsWith("--") && !["--seed", "--count", "--out", "--png"].includes(args[i - 1]));
if (!id) {
    console.error("Usage: npm run people:place -- <scene-id> [--seed n] [--count n] [--dry-run] [--out file] [--png file]");
    process.exit(1);
}
const seed = Number(option("--seed") ?? 1);
const count = option("--count") !== undefined ? Number(option("--count")) : undefined;
const dryRun = args.includes("--dry-run");
const outFile = option("--out");
const pngFile = option("--png");

const sceneFile = join(ROOT, "scenes", `${id}.json`);
if (!existsSync(sceneFile)) {
    console.error(`No scene ${id} (${sceneFile}).`);
    process.exit(1);
}
const record = readJson(sceneFile);
const { scene: spec } = validateScene(record.scene);
const catalog = readJson(join(ROOT, "public", "models", "furniture", "catalog.json"));
const seatsFile = join(ROOT, "public", "models", "furniture", "seats.json");
if (!existsSync(seatsFile)) {
    console.error("No seats.json: run `npm run seats` first.");
    process.exit(1);
}
const seats = readJson(seatsFile);
const indexFile = ["index.json", "index.standin.json"].map((name) => join(ROOT, "public", "models", "people", name)).find(existsSync);
const index = indexFile ? readJson(indexFile) : null;
console.log(`Cast from ${indexFile ? indexFile.slice(ROOT.length + 1) : "the stand-in avatars (no people index yet)"}`);

const people = planPeople(spec, catalog, seats, {
    seed,
    ...(count !== undefined ? { count } : {}),
    characters: index?.characters,
    clips: index?.clips?.list,
    props: index?.props?.list,
});

// What the plan is, and where.
const site = siteOf(spec, catalog);
const furniture = new Map(spec.furniture.map((f) => [f.id, f]));
const items = new Map(catalog.items.map((item) => [item.id, item]));
const poses = { stand: 0, sit: 0, lie: 0 };
for (const p of people) poses[p.pose] += 1;
console.log(`\n${people.length} people (seed ${seed}): ${poses.stand} standing, ${poses.sit} sitting, ${poses.lie} lying`);
for (const p of people) {
    const room = site.roomAt(p.position[0], p.position[1] - (p.pose === "stand" ? 0 : 0.4), p.position[2]) ?? site.roomAt(p.position[0], p.position[1], p.position[2]);
    const on = p.seat ? `on ${p.seat.furniture} (${items.get(furniture.get(p.seat.furniture)?.catalog_id)?.name ?? "?"}) #${p.seat.index}` : "";
    console.log(
        `  ${p.id.padEnd(10)} ${p.pose.padEnd(5)} ${(p.group ?? "").padEnd(8)} ${p.character.padEnd(10)} ${String(p.clip).padEnd(18)} ${String(p.prop).padEnd(10)} ` +
            `[${p.position.map((v) => v.toFixed(2)).join(", ")}] ${String(p.rotation).padStart(6)}°  ${room?.name ?? "outside"}${room && !isOutdoor(room) ? " (indoors)" : ""} ${on}`
    );
}

// It survives the validator as planned.
const notes = [];
const kept = sanitizePeople(people, notes, new Set(spec.furniture.map((f) => f.id)));
if (notes.length || JSON.stringify(kept) !== JSON.stringify(people)) {
    console.error(`\nThe validator changed the plan:\n  ${notes.join("\n  ")}`);
    process.exit(1);
}

if (pngFile) await drawPlan(resolve(pngFile), spec, catalog, seats, people);

if (outFile) {
    writeFileSync(resolve(outFile), `${JSON.stringify({ scene: id, seed, people }, null, 2)}\n`);
    console.log(`\nWrote the plan to ${outFile}`);
} else if (dryRun) {
    console.log("\nDry run: nothing written.");
} else {
    // As an editor save: into the spec, validated, written.
    const { writeScene } = await import("../server/store/sceneStore.js");
    const latest = readJson(sceneFile);
    const { scene, notes: saved } = validateScene({ ...latest.scene, people });
    await writeScene({ id, scene, brief: latest.brief, notes: saved });
    console.log(`\nWrote ${scene.people.length} people into scenes/${id}.json`);
}

// ---------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------

/**
 * The plan from above, a panel for each floor someone is on (the ground's
 * first): its rooms (out of doors darker), walls, furniture, pools and
 * the seats, and the people as dots — standing red, sitting blue, lying
 * orange — each with a tick the way they face (lying, to their head),
 * a group's ringed.
 */
async function drawPlan(path, spec, catalog, seats, people) {
    const { default: sharp } = await import("sharp");
    const items = new Map(catalog.items.map((item) => [item.id, item]));
    const S = 22; // pixels a metre
    // The site's extent: round its furniture and its people, 4 m over.
    const xs = [...spec.furniture.map((f) => f.position[0]), ...people.map((p) => p.position[0])];
    const zs = [...spec.furniture.map((f) => f.position[2]), ...people.map((p) => p.position[2])];
    const [x0, x1, z0, z1] = [Math.min(...xs) - 4, Math.max(...xs) + 4, Math.min(...zs) - 4, Math.max(...zs) + 4];
    const W = Math.ceil((x1 - x0) * S);
    const H = Math.ceil((z1 - z0) * S);
    const px = (x) => ((x - x0) * S).toFixed(1);
    const pz = (z) => ((z - z0) * S).toFixed(1);
    // A floor: the people within 1.2 m of each other's height.
    const levels = [];
    for (const p of [...people].sort((a, b) => a.position[1] - b.position[1])) {
        const y = p.position[1] - (p.pose === "stand" ? 0 : 0.45);
        if (!levels.some((l) => Math.abs(l - y) < 1.2)) levels.push(y);
    }
    if (!levels.length) levels.push(0);
    const panels = [];
    for (const level of levels) {
        const near = (y) => y > level - 1.25 && y < level + 1.25;
        const svg = [`<rect width="${W}" height="${H}" fill="#f7f5f0"/>`];
        for (const room of spec.rooms.filter((r) => near(r.elevation)).sort((a, b) => a.elevation - b.elevation)) {
            const fill = isOutdoor(room) ? "#d8d2c2" : "#ece6da";
            svg.push(`<polygon points="${room.polygon.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ")}" fill="${fill}" stroke="#b9b2a2" stroke-width="1"/>`);
        }
        for (const pool of spec.landscape?.pools || []) {
            if (!near(pool.level ?? 0)) continue;
            const [a, b, c, d] = pool.box;
            svg.push(`<rect x="${px(a)}" y="${pz(b)}" width="${((c - a) * S).toFixed(1)}" height="${((d - b) * S).toFixed(1)}" fill="#8fc6e8" stroke="#4f8fb8"/>`);
        }
        for (const wall of spec.walls) {
            const base = wall.base_height ?? 0;
            // This floor's walls, not the floor below's running up to it.
            if (!(base > level - 0.8 && base < level + 1.5 && base + wall.height > level + 0.1)) continue;
            svg.push(`<line x1="${px(wall.start[0])}" y1="${pz(wall.start[1])}" x2="${px(wall.end[0])}" y2="${pz(wall.end[1])}" stroke="#555" stroke-width="${Math.max(1.5, (wall.thickness ?? 0.2) * S).toFixed(1)}"/>`);
        }
        for (const thing of [...(spec.landscape?.planters || []), ...(spec.landscape?.hedges || [])]) {
            if (!near(thing.base ?? 0)) continue;
            svg.push(`<polyline points="${thing.path.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ")}" fill="none" stroke="#9a7b4f" stroke-width="${((thing.width ?? 0.5) * S).toFixed(1)}" stroke-opacity="0.6"/>`);
        }
        for (const f of spec.furniture) {
            if (!near(f.position[1])) continue;
            const item = items.get(f.catalog_id);
            const [w, h, d] = item?.size ?? [0.6, 0.6, 0.6];
            const s = (f.scale ?? 1) * (item?.scale ?? 1);
            if (h * s < 0.035 || f.position[1] > level + 1.9) continue;
            // three's rotation.y: an SVG rotation the other way round.
            svg.push(
                `<rect x="${(-(w * s) / 2) * S}" y="${(-(d * s) / 2) * S}" width="${w * s * S}" height="${d * s * S}" fill="${seats[f.catalog_id] ? "#c9d8c0" : "#fff"}" fill-opacity="0.7" stroke="#8a8a8a" stroke-width="0.8" transform="translate(${px(f.position[0])},${pz(f.position[2])}) rotate(${-(f.rotation ?? 0)})"/>`
            );
            const placed = seatsOf(f, seats);
            for (const seat of placed?.seats || []) svg.push(`<circle cx="${px(seat.at[0])}" cy="${pz(seat.at[2])}" r="1.6" fill="#6a8a5a"/>`);
        }
        const groups = new Map();
        for (const p of people) {
            const y = p.position[1] - (p.pose === "stand" ? 0 : 0.45);
            if (Math.abs(y - level) >= 1.2) continue;
            if (p.group) groups.set(p.group, [...(groups.get(p.group) || []), p]);
        }
        for (const members of groups.values()) {
            const cx = members.reduce((a, p) => a + p.position[0], 0) / members.length;
            const cz = members.reduce((a, p) => a + p.position[2], 0) / members.length;
            const r = Math.max(...members.map((p) => Math.hypot(p.position[0] - cx, p.position[2] - cz))) + 0.45;
            svg.push(`<circle cx="${px(cx)}" cy="${pz(cz)}" r="${(r * S).toFixed(1)}" fill="none" stroke="#7a3fa0" stroke-width="1.5" stroke-dasharray="4 3"/>`);
        }
        for (const p of people) {
            const y = p.position[1] - (p.pose === "stand" ? 0 : 0.45);
            if (Math.abs(y - level) >= 1.2) continue;
            const colour = { stand: "#d0312d", sit: "#2f6fd0", lie: "#f08c00" }[p.pose];
            const r = (p.rotation * Math.PI) / 180;
            const [dx, dz] = [-Math.sin(r), -Math.cos(r)];
            const tick = p.pose === "lie" ? 0.9 : 0.45;
            svg.push(`<line x1="${px(p.position[0])}" y1="${pz(p.position[2])}" x2="${px(p.position[0] + dx * tick)}" y2="${pz(p.position[2] + dz * tick)}" stroke="${colour}" stroke-width="2.5"/>`);
            svg.push(`<circle cx="${px(p.position[0])}" cy="${pz(p.position[2])}" r="5" fill="${colour}" stroke="#fff" stroke-width="1.2"/>`);
            svg.push(`<text x="${(Number(px(p.position[0])) + 7).toFixed(1)}" y="${(Number(pz(p.position[2])) - 6).toFixed(1)}" font-family="Helvetica, Arial" font-size="11" fill="#222">${p.id.replace("person-", "")}</text>`);
        }
        svg.push(`<text x="10" y="24" font-family="Helvetica, Arial" font-size="18" fill="#222">Floor at ${level.toFixed(1)} m — north up</text>`);
        const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join("")}</svg>`)).png().toBuffer();
        panels.push(image);
    }
    const gap = 12;
    await sharp({ create: { width: panels.length * (W + gap) - gap, height: H, channels: 3, background: "#ffffff" } })
        .composite(panels.map((input, i) => ({ input, left: i * (W + gap), top: 0 })))
        .png()
        .toFile(path);
    console.log(`\nDrew ${levels.length} floor(s) to ${path}`);
}

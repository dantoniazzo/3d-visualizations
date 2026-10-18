// count-views.mjs: a published version's bird's-eye samples, counted as the publish plans them
// (Publish/viewpoints.js's birdViewpoints, its drive samples — driveViewpoints — included) against its manifest's
// levels and stats: the floors' own samples, the drive ones and their targets, the 1-in-8 check set, and what the drive
// samples add to a publish at the version's own time a bird sample (culling-and-viewpoints.md; publishing.md).
// Read-only. Run from anywhere:
//   node <repo>/.claude/skills/publish-and-bake/count-views.mjs [--dir <publish-dir>] <scene-id> [<scene-id> …]
//                                                               (its manifest's latest version)
//   node <repo>/.claude/skills/publish-and-bake/count-views.mjs [--dir <publish-dir>] --dump <out.json> <scene-id>
// --dir is where the versions are (a test server's PUBLISH_DIR; default <repo>/published, only read). --dump writes that
// version's drive samples and check samples ({ drive, check }: [{ level, ceilingFrom, position, target }]) for
// holes.js's seenBy (../app-testing-and-performance/holes.js). The repo is three folders above this file (or
// REPO=<dir>); it imports the app's own modules.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "../../.."));
const args = process.argv.slice(2);
const take = (flag) => {
    const i = args.indexOf(flag);
    if (i < 0) return null;
    const [, value] = args.splice(i, 2);
    return value;
};
const dir = take("--dir") ?? join(repo, "published");
const dump = take("--dump");
if (!args.length) {
    console.error("usage: count-views.mjs [--dir <publish-dir>] [--dump <out.json>] <scene-id> …");
    process.exit(2);
}
const { birdViewpoints, seeded } = await import(pathToFileURL(join(repo, "frontend/Experience/Publish/viewpoints.js")).href);
const { publishedSpec } = await import(pathToFileURL(join(repo, "shared/neighbourhood.js")).href);

function load(id) {
    const manifest = JSON.parse(readFileSync(join(dir, id, "manifest.json"), "utf8"));
    const spec = publishedSpec(JSON.parse(readFileSync(join(dir, id, manifest.spec), "utf8")));
    return { manifest, spec };
}

if (dump) {
    const { manifest, spec } = load(args[0]);
    const pick = (list) => list.filter((v) => v.ceilingFrom !== undefined).map((v) => ({ level: v.level, ceilingFrom: v.ceilingFrom, position: v.position.toArray(), target: v.target.toArray() }));
    const drive = pick(birdViewpoints(spec, manifest.levels));
    const check = pick(birdViewpoints(spec, manifest.levels, { jitter: seeded(7) }).filter((_, i) => i % 8 === 0));
    writeFileSync(dump, JSON.stringify({ drive, check }));
    console.log(JSON.stringify({ id: args[0], drive: drive.length, check: check.length, out: dump }));
    process.exit(0);
}

for (const id of args) {
    const { manifest, spec } = load(id);
    const t0 = performance.now();
    const all = birdViewpoints(spec, manifest.levels);
    const ms = performance.now() - t0;
    const drive = all.filter((v) => v.ceilingFrom !== undefined);
    const check = birdViewpoints(spec, manifest.levels, { jitter: seeded(7) }).filter((_, i) => i % 8 === 0);
    const checkDrive = check.filter((v) => v.ceilingFrom !== undefined);
    const targets = new Map();
    for (const v of drive) {
        const key = v.target.toArray().map((n) => n.toFixed(1)).join(",");
        targets.set(key, (targets.get(key) ?? 0) + 1);
    }
    const was = manifest.stats?.samples;
    const timing = manifest.stats?.timing;
    const perBird = timing && was?.bird ? (timing.bird / was.bird) * 1000 : null;
    console.log(
        JSON.stringify({
            id,
            levels: manifest.levels.length,
            floorsOwn: all.length - drive.length,
            published: was ?? null,
            drive: drive.length,
            driveTargets: targets.size,
            perTarget: targets.size ? [Math.min(...targets.values()), Math.max(...targets.values())] : null,
            check: check.length,
            checkDrive: checkDrive.length,
            level: drive[0]?.level ?? null,
            ceilingFrom: drive[0]?.ceilingFrom ?? null,
            msPerBirdSample: perBird && +perBird.toFixed(2),
            addedSeconds: perBird && +(((drive.length + checkDrive.length) * perBird) / 1000).toFixed(1),
            publishSeconds: manifest.stats?.seconds ?? null,
            planMs: Math.round(ms),
            targetsSample: [...targets.keys()].slice(0, 6),
        })
    );
}

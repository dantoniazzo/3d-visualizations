#!/usr/bin/env node
/**
 * patch-pool-steps.mjs (2026-10-16): give a seeded scene's pool its steps without seeding it again — a seed
 * rewrites the whole scene from the generator and drops what was edited in it since (the car moved, the people).
 *
 *   node patch-pool-steps.mjs <scene.json> [--pool b-pool] [--steps '{"side":"z1","count":5,"going":0.35}']
 *                             [--backup <dir>] [--dry-run]
 *
 * It changes landscape.pools[<pool>].steps and nothing else:
 *   - refuses unless the file reads back as it is written (JSON.stringify, 2 spaces, as the server saves a scene), so
 *     the rest of the file comes out byte for byte as it was;
 *   - copies the file as it was to <backup> (default: beside this tool, backups/) before writing;
 *   - writes through a temporary file and a rename, and refuses if the file changed on disk while it ran (an editor
 *     tab saving the scene meanwhile: reload any open editor tab first, or its next save overwrites the patch);
 *   - reads the result back and checks that the only difference is that pool's `steps`.
 * Exit 0: patched, or already so. Exit 1: refused (nothing written).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--dry-run"));
if (!file) {
    console.error("usage: node patch-pool-steps.mjs <scene.json> [--pool b-pool] [--steps JSON] [--backup dir] [--dry-run]");
    process.exit(1);
}
const path = resolve(file);
const poolId = flag("--pool", "b-pool");
const steps = JSON.parse(flag("--steps", '{"side":"z1","count":5,"going":0.35}'));
const backupDir = resolve(flag("--backup", join(HERE, "backups")));
const dry = args.includes("--dry-run");

const refuse = (why) => {
    console.error(`REFUSED (${basename(path)}): ${why} — nothing written`);
    process.exit(1);
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!steps || typeof steps !== "object" || !["x0", "x1", "z0", "z1"].includes(steps.side) || !(steps.count >= 1)) refuse(`steps ${JSON.stringify(steps)} are not { side: x0|x1|z0|z1, count >= 1, going? }`);

const before = fs.readFileSync(path);
const beforeSha = sha(before);
const beforeStat = fs.statSync(path);
const text = before.toString("utf8");
let doc;
try {
    doc = JSON.parse(text);
} catch (error) {
    refuse(`not JSON: ${error.message}`);
}
// Written back as it is read: else the rest of the file would change too.
if (JSON.stringify(doc, null, 2) !== text) refuse("the file is not as JSON.stringify(scene, null, 2) writes it; patch it by hand");
const scene = doc.scene && typeof doc.scene === "object" ? doc.scene : doc;
const pools = scene.landscape?.pools;
if (!Array.isArray(pools)) refuse("no landscape.pools");
const index = pools.findIndex((pool) => pool?.id === poolId);
if (index < 0) refuse(`no pool "${poolId}" (there are ${pools.map((p) => p?.id).join(", ") || "none"})`);
if (sameJson(pools[index].steps, steps)) {
    console.log(`already: ${poolId}.steps is ${JSON.stringify(steps)} in ${path}`);
    process.exit(0);
}
const was = pools[index].steps;
pools[index] = { ...pools[index], steps };
const out = JSON.stringify(doc, null, 2);

// Only that pool's steps differ.
const check = JSON.parse(out);
const checkScene = check.scene && typeof check.scene === "object" ? check.scene : check;
const strip = (d) => {
    const copy = structuredClone(d);
    const sc = copy.scene && typeof copy.scene === "object" ? copy.scene : copy;
    delete sc.landscape.pools[index].steps;
    return copy;
};
if (!sameJson(strip(check), strip(JSON.parse(text)))) refuse("the result differs from the file in more than the pool's steps");
if (!sameJson(checkScene.landscape.pools[index].steps, steps)) refuse("the result does not carry the steps");

console.log(`${poolId}.steps: ${JSON.stringify(was ?? null)} -> ${JSON.stringify(steps)}`);
console.log(`  ${path}: ${before.length} -> ${Buffer.byteLength(out)} bytes`);
if (dry) {
    console.log("  dry run: nothing written");
    process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = join(backupDir, `${basename(path, ".json")}.${stamp}.json`);
fs.writeFileSync(backup, before);
if (sha(fs.readFileSync(backup)) !== beforeSha) refuse(`the backup ${backup} does not read back as the file`);
console.log(`  backed up to ${backup}`);

// Not if it changed on disk since it was read (an editor saving the scene meanwhile).
const temp = join(dirname(path), `.${basename(path)}.patch-${process.pid}`);
fs.writeFileSync(temp, out);
const now = fs.readFileSync(path);
const nowStat = fs.statSync(path);
if (sha(now) !== beforeSha || nowStat.mtimeMs !== beforeStat.mtimeMs) {
    fs.unlinkSync(temp);
    refuse("the file changed on disk while this ran (an editor tab saved it?); reload editor tabs and run again");
}
fs.renameSync(temp, path);

const after = fs.readFileSync(path, "utf8");
if (after !== out) {
    console.error(`WRITTEN BUT WRONG: ${path} does not read back as written; restore it: cp '${backup}' '${path}'`);
    process.exit(1);
}
console.log(`  patched; restore with: cp '${backup}' '${path}'`);

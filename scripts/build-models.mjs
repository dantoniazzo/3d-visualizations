/**
 * Regenerate the Blender-authored property and its GLB.
 *
 * The .blend and the exported model are build outputs, not sources: they run
 * to well over a hundred megabytes and are fully determined by the scripts in
 * blender/. This drives Blender headlessly to rebuild both.
 *
 *   npm run models            # build the house, export the GLB
 *   npm run models -- --shell # shell only, skipping the furniture downloads
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLENDER_DIR = join(ROOT, "blender");

// Blender does not put itself on PATH on macOS or Windows, so look where it
// actually installs before giving up.
const CANDIDATES = [
    process.env.BLENDER,
    "blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "/usr/bin/blender",
    "/usr/local/bin/blender",
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
].filter(Boolean);

function findBlender() {
    for (const path of CANDIDATES) {
        try {
            const version = execFileSync(path, ["--version"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            });
            return { path, version: version.split("\n")[0].trim() };
        } catch {
            // Not at this path; try the next.
        }
    }
    return null;
}

const blender = findBlender();
if (!blender) {
    console.error(
        "Blender not found.\n\n" +
            "  The bundled Wrenfield House property is generated from blender/build_house.py,\n" +
            "  so building it needs Blender 4.2 or newer installed:\n\n" +
            "    https://www.blender.org/download/\n\n" +
            "  Then re-run `npm run models`, or point BLENDER at the binary:\n" +
            "    BLENDER=/path/to/blender npm run models\n\n" +
            "  The app runs fine without it — scenes whose model file is missing are\n" +
            "  skipped by `npm run seed`, and the procedural properties are unaffected."
    );
    process.exit(1);
}

console.log(`Using ${blender.version}\n  ${blender.path}\n`);
mkdirSync(join(BLENDER_DIR, "out"), { recursive: true });

const shellOnly = process.argv.includes("--shell");
const furnitureOnly = process.argv.includes("--furniture");
const steps = furnitureOnly
    ? [["export_furniture.py", []]]
    : shellOnly
      ? [["build_house.py", ["--shell-only"]]]
      : [["build_house.py", []], ["export_app.py", []], ["export_furniture.py", []]];

for (const [script, args] of steps) {
    console.log(`> ${script} ${args.join(" ")}`.trim());
    execFileSync(
        blender.path,
        ["--background", "--python", join(BLENDER_DIR, script), ...(args.length ? ["--", ...args] : [])],
        { stdio: "inherit", cwd: BLENDER_DIR }
    );
}

const glb = join(ROOT, "public", "models",
    furnitureOnly ? "furniture/catalog.json" : "wrenfield_house.glb");
console.log(
    existsSync(glb)
        ? "\nDone. Run `npm run seed` to register the property."
        : "\nFinished, but public/models/wrenfield_house.glb is missing — check the log above."
);

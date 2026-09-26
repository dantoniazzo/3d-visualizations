/**
 * Regenerate every model the app uses, from the scripts in blender/.
 *
 * Nothing is downloaded: the house, its furniture, the furniture catalogue,
 * the car and the kit of parts generated buildings are dressed with are all
 * built from primitives, at real-world size, so the collisions in the app
 * match what is drawn. The .blend and the GLBs are build outputs, fully
 * determined by those scripts.
 *
 *   npm run models               # everything below, and the house
 *   npm run models -- --shell    # the house's shell only, unfurnished
 *   npm run furniture            # the catalogue only
 *   npm run models -- --car      # the car only
 *   npm run models -- --kit      # the doors, windows and stairs kit only
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findBlender } from "./lib/blender.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLENDER_DIR = join(ROOT, "blender");

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
const carOnly = process.argv.includes("--car");
const kitOnly = process.argv.includes("--kit");
const steps = furnitureOnly
    ? [["export_furniture.py", []]]
    : carOnly
      ? [["export_car.py", []]]
      : kitOnly
        ? [["export_kit.py", []]]
        : shellOnly
          ? [["build_house.py", ["--shell-only"]]]
          : [
                ["build_house.py", []],
                ["export_app.py", []],
                ["export_furniture.py", []],
                ["export_car.py", []],
                ["export_kit.py", []],
            ];

for (const [script, args] of steps) {
    console.log(`> ${script} ${args.join(" ")}`.trim());
    execFileSync(
        blender.path,
        ["--background", "--python", join(BLENDER_DIR, script), ...(args.length ? ["--", ...args] : [])],
        { stdio: "inherit", cwd: BLENDER_DIR }
    );
}

const glb = join(ROOT, "public", "models",
    furnitureOnly ? "furniture/catalog.json" : carOnly ? "car-chassis.glb" : kitOnly ? "kit.glb" : "wrenfield_furnishings.glb");
console.log(
    existsSync(glb)
        ? "\nDone. Run `npm run seed` to register the property."
        : `\nFinished, but ${glb} is missing — check the log above.`
);

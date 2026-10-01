/**
 * Regenerate every model the app uses, from the scripts in blender/.
 *
 * Nothing is downloaded: the house, its furniture, the furniture catalogue
 * and the kit of parts generated buildings are dressed with are all built
 * from primitives, at real-world size, so the collisions in the app match
 * what is drawn. The cars are the exception: ready-made models downloaded
 * from Sketchfab, kept in assets/cars/, which import_cars.py splits into
 * the parts the app drives. The .blend and the GLBs are build outputs,
 * fully determined by those scripts and sources.
 *
 *   npm run models               # everything below, and the house
 *   npm run models -- --shell    # the house's shell only, unfurnished
 *   npm run furniture            # the catalogue only
 *   npm run models -- --cars     # the cars only (or --cars <id> ...)
 *   npm run models -- --kit      # the doors, windows and stairs kit only
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findBlender } from "./lib/blender.mjs";
import { packCars } from "./lib/pack-cars.mjs";

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
const carOnly = process.argv.includes("--cars") || process.argv.includes("--car");
// `--cars bmw-x6-m ford-f150-raptor`: just those
const carIds = carOnly ? process.argv.slice(process.argv.findIndex((a) => a === "--cars" || a === "--car") + 1).filter((a) => !a.startsWith("--")) : [];
const kitOnly = process.argv.includes("--kit");
const steps = furnitureOnly
    ? [["export_furniture.py", []]]
    : carOnly
      ? [["import_cars.py", carIds]]
      : kitOnly
        ? [["export_kit.py", []]]
        : shellOnly
          ? [["build_house.py", ["--shell-only"]]]
          : [
                ["build_house.py", []],
                ["export_app.py", []],
                ["export_furniture.py", []],
                ["import_cars.py", []],
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

// The cars, packed for the web, and their index.
if (steps.some(([script]) => script === "import_cars.py")) await packCars(ROOT, carIds);

const glb = join(ROOT, "public", "models",
    furnitureOnly ? "furniture/catalog.json" : carOnly ? "cars/index.json" : kitOnly ? "kit.glb" : "wrenfield_furnishings.glb");
console.log(
    existsSync(glb)
        ? "\nDone. Run `npm run seed` to register the property."
        : `\nFinished, but ${glb} is missing — check the log above.`
);

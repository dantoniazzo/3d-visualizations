/**
 * Where Blender is. It does not put itself on PATH on macOS or Windows, so
 * look where it actually installs before giving up. BLENDER overrides.
 */
import { execFileSync } from "node:child_process";

const CANDIDATES = [
    process.env.BLENDER,
    "blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "/usr/bin/blender",
    "/usr/local/bin/blender",
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
].filter(Boolean);

/** @returns {{ path: string, version: string } | null} */
export function findBlender() {
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

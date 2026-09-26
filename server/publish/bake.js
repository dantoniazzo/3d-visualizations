/**
 * Baking a published version's lighting from the editor's Publish panel,
 * rather than with `npm run bake` in a terminal: the same script
 * (scripts/bake-public.mjs), run as a child process, its progress read off
 * what Blender prints.
 *
 * This starts Blender on the machine the server runs on, at a request's
 * say-so — fine on the machine a space is edited on, and nowhere else. So
 * it is only offered to requests from this machine itself, not through a
 * proxy, and only where Blender is installed; BAKE=off turns it off
 * altogether.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BAKE_QUALITY } from "../../shared/publishOptions.js";
import { findBlender } from "../../scripts/lib/blender.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "bake-public.mjs");
const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The steps of a bake as its log shows them: the line that ends each, what
 * to call it meanwhile, and roughly how long it takes on an M-series Mac
 * for a final bake — the lighting passes in proportion to the samples and
 * texels for a draft.
 */
const STEPS = [
    { until: "house texels", label: "Unwrapping the house", seconds: 25 },
    { until: "vertex probes placed", label: "Placing light probes", seconds: 15 },
    { until: "guides baked", label: "Baking surface guides", seconds: 5 },
    { until: "coverage baked", label: "Finding covered texels", seconds: 8 },
    { until: "hidden texels found", label: "Finding texels inside walls", seconds: 17 },
    { until: "seams to stitch", label: "Finding seams", seconds: 3 },
    { until: "day lightmap baked", label: "Baking daylight", seconds: 320, work: true },
    { until: "day vertices baked", label: "Denoising daylight, lighting the ceiling tops", seconds: 85 },
    { until: "wrote day.webp", label: "Stitching seams", seconds: 15 },
    { until: "night lightmap baked", label: "Baking the night", seconds: 320, work: true },
    { until: "night vertices baked", label: "Denoising the night, lighting the ceiling tops", seconds: 85 },
    { until: "wrote night.webp", label: "Stitching seams", seconds: 15 },
    { until: "compressing the view", label: "Exporting", seconds: 20 },
    { until: "Baked in", label: "Compressing", seconds: 15 },
];

let blender;
/** The bake running now, or the last one, for each scene. */
const jobs = new Map();
let running = null;

/** Whether a request may start a bake, and if not, why not. */
export function bakeAvailability(req) {
    if (process.env.BAKE === "off") return { available: false, reason: "Baking is turned off on this server (BAKE=off)." };
    if (!LOCAL.has(req.socket.remoteAddress) || req.headers["x-forwarded-for"]) {
        return { available: false, reason: "Baking can only be started on the machine the server runs on." };
    }
    blender ??= findBlender() ?? false;
    if (!blender) return { available: false, reason: "Blender isn't installed here (or set BLENDER=/path/to/blender)." };
    return { available: true };
}

/**
 * Start baking a version. Only one bake runs at a time.
 *
 * @param {string} sceneId
 * @param {string} version
 * @param {"draft"|"final"} quality
 * @returns {object} the job, as bakeStatus gives it
 */
export function startBake(sceneId, version, quality) {
    if (running) {
        throw Object.assign(new Error(`Already baking ${running.sceneId} (${running.version}). Wait for it to finish.`), {
            status: 409,
        });
    }
    const setting = BAKE_QUALITY[quality];
    if (!setting) throw Object.assign(new Error(`Unknown bake quality: ${quality}`), { status: 400 });
    const { samples, size } = setting;

    const job = {
        sceneId,
        version,
        quality,
        samples,
        size,
        state: "running",
        startedAt: Date.now(),
        step: 0,
        stepStartedAt: Date.now(),
        log: [],
    };
    jobs.set(sceneId, job);
    running = job;

    const child = spawn(process.execPath, [SCRIPT, sceneId, "--version", version, "--samples", String(samples), "--size", String(size)], {
        cwd: ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const read = (stream) => {
        let buffer = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) note(job, line);
        });
    };
    read(child.stdout);
    read(child.stderr);
    child.on("error", (error) => finish(job, error.message));
    child.on("close", (code) => finish(job, code === 0 ? null : lastWords(job) || `The bake stopped (exit ${code}).`));
    return bakeStatus(sceneId);
}

/** The bake running or last run for a scene, or null. */
export function bakeStatus(sceneId) {
    const job = jobs.get(sceneId);
    if (!job) return null;
    const { log, stepStartedAt, step, ...rest } = job;
    const { fraction, label } = progress(job);
    return { ...rest, fraction, label, seconds: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000) };
}

function note(job, line) {
    const text = line.trim();
    if (!text) return;
    // Blender says a great deal; the bake's own lines, and anything that
    // looks like trouble, are what is worth keeping.
    if (/^\[bake\]|^Baked in|error|Error|Traceback|already running|not been published/.test(text)) {
        job.log.push(text);
        if (job.log.length > 40) job.log.shift();
    }
    while (job.step < STEPS.length && text.includes(STEPS[job.step].until)) {
        job.step++;
        job.stepStartedAt = Date.now();
    }
}

function finish(job, error) {
    if (job.state !== "running") return;
    job.state = error ? "failed" : "done";
    job.error = error || undefined;
    job.finishedAt = Date.now();
    if (running === job) running = null;
}

/** What the log said last that reads like an error. */
function lastWords(job) {
    return [...job.log].reverse().find((line) => /error|Error|already running|not been published/.test(line));
}

/** How far through a job is, from the steps done and the time in this one. */
function progress(job) {
    if (job.state === "done") return { fraction: 1, label: "Baked" };
    if (job.state === "failed") return { fraction: 0, label: "Failed" };
    const final = BAKE_QUALITY.final;
    const work = (job.samples / final.samples) * (job.size / final.size) ** 2;
    const length = (step) => step.seconds * (step.work ? work : 1);
    const total = STEPS.reduce((sum, step) => sum + length(step), 0);
    const done = STEPS.slice(0, job.step).reduce((sum, step) => sum + length(step), 0);
    const current = STEPS[job.step];
    const into = current ? Math.min((Date.now() - job.stepStartedAt) / 1000, length(current) * 0.95) : 0;
    return { fraction: Math.min(0.99, (done + into) / total), label: current?.label ?? "Finishing" };
}

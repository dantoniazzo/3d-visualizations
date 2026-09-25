import { versionLabel } from "../../../shared/publishOptions.js";

/**
 * A small performance readout, for comparing builds on the devices that
 * matter. Add `?stats` to any link to show it.
 *
 * Draw calls and triangles are counted over the whole frame — shadow maps
 * and the editor's extra passes included — rather than over the last
 * render() call only, which is all three's own counters keep by default.
 * The frame time is between animation frames, so it shows what the visitor
 * gets, whatever the bottleneck is; the render time is the CPU time spent
 * submitting the frame.
 *
 * In a public view it also says what is being looked at: which published
 * version, and what it was published with — so two tabs being compared
 * say which is which — and how long it took to be ready to walk round, and
 * whether it built the house to get there or had it all in the version's
 * runtime file.
 */
export default class Stats {
    static enabled() {
        return new URL(window.location.href).searchParams.has("stats");
    }

    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {Sizes} sizes
     * @param {() => object|null} [published]  the published version on show, if any
     * @param {() => object|undefined} [ready]  when the world was ready, and how
     */
    constructor(renderer, sizes, published = () => null, ready = () => undefined) {
        this.renderer = renderer;
        this.sizes = sizes;
        this.published = published;
        this.ready = ready;
        renderer.info.autoReset = false;

        this.element = document.createElement("div");
        this.element.className = "perf-stats";
        this.element.style.cssText = [
            "position:fixed",
            "top:calc(env(safe-area-inset-top, 0px) + 8px)",
            "right:8px",
            "z-index:10000",
            "padding:6px 8px",
            "border-radius:6px",
            "background:rgba(0,0,0,0.7)",
            "color:#e8f0e8",
            "font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace",
            "white-space:pre",
            "pointer-events:none",
        ].join(";");
        document.body.appendChild(this.element);

        this.frames = 0;
        this.renderTime = 0;
        this.windowStart = performance.now();
        this.lastFrame = this.windowStart;
        this.worstFrame = 0;
    }

    /** Call before the frame is rendered. */
    begin() {
        const now = performance.now();
        this.worstFrame = Math.max(this.worstFrame, now - this.lastFrame);
        this.lastFrame = now;
        this.renderer.info.reset();
        this.renderStart = now;
    }

    /** Call once the frame has been rendered. */
    end() {
        const now = performance.now();
        this.renderTime += now - this.renderStart;
        this.frames++;
        if (now - this.windowStart >= 500) this.report(now);
    }

    report(now) {
        const elapsed = now - this.windowStart;
        const { render, memory } = this.renderer.info;
        const px = this.renderer.getPixelRatio();
        const lines = [
            `${((this.frames * 1000) / elapsed).toFixed(0).padStart(3)} fps  ${(elapsed / this.frames).toFixed(1)} ms  worst ${this.worstFrame.toFixed(0)} ms`,
            `render ${(this.renderTime / this.frames).toFixed(1)} ms cpu`,
            `calls  ${render.calls}`,
            `tris   ${(render.triangles / 1000).toFixed(0)}k`,
            `geo ${memory.geometries}  tex ${memory.textures}`,
            `dpr ${px.toFixed(2)}  ${Math.round(this.sizes.width * px)}×${Math.round(this.sizes.height * px)}`,
            `loaded ${downloaded()}`,
            ...readyLine(this.ready()),
            ...describe(this.published()),
        ];
        this.element.textContent = lines.join("\n");

        this.frames = 0;
        this.renderTime = 0;
        this.worstFrame = 0;
        this.windowStart = now;
    }

    dispose() {
        this.element.remove();
        this.renderer.info.autoReset = true;
    }
}

/** Which published version is on show, and its options, in two short lines. */
function describe(published) {
    if (!published) return ["live scene"];
    const o = published.options ?? {};
    return [
        `${versionLabel(published.version)}  ${published.lighting ? `baked ${published.lighting.samples}` : "live light"}`,
        [o.cull ? "cull" : "no-cull", o.merge ? "merge" : "no-merge", o.compress ? "draco" : "raw", o.glass ? "glass" : "refract", `q-${o.quality}`].join(" "),
    ];
}

/** How long from opening the page until it could be walked round. */
function readyLine(ready) {
    if (!ready) return [];
    return [`ready ${(ready.ms / 1000).toFixed(1)} s  ${ready.built ? "house built" : "runtime file"}`];
}

/** Bytes fetched over the network so far, as sent (compressed). */
function downloaded() {
    let bytes = 0;
    for (const entry of performance.getEntriesByType("resource")) {
        bytes += entry.transferSize || entry.encodedBodySize || 0;
    }
    for (const entry of performance.getEntriesByType("navigation")) {
        bytes += entry.transferSize || 0;
    }
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

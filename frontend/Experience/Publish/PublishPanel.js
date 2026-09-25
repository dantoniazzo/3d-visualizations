import { buildSnapshot } from "./Snapshot.js";
import { buildRuntime } from "./Runtime.js";
import { PUBLISH_OPTIONS, describeOptions, publishOptions, versionLabel } from "../../../shared/publishOptions.js";

/**
 * Publishing a space's public view, from the editor.
 *
 * First the options (shared/publishOptions.js): which optimisations this
 * version is made with, so each can be switched off and its difference
 * seen. Then the snapshot (Snapshot.js) is built with a progress bar up,
 * sent to the server, and — when asked for — its lighting baked there,
 * with the bake's progress followed here.
 *
 * Every version is kept, and listed underneath with what it was made with
 * and an Open link to it (/view/<id>?version=…), so two can be opened side
 * by side. /view/<id> itself, the link for clients, always opens the latest.
 */

/** The options last published with, as this browser's starting point. */
const REMEMBERED = "publish-options";
const POLL_MS = 2000;

export default class PublishPanel {
    /**
     * @param {Experience} experience
     * @param {string} sceneId
     */
    constructor(experience, sceneId) {
        this.experience = experience;
        this.sceneId = sceneId;
        this.api = `/api/scenes/${encodeURIComponent(sceneId)}`;
        this.link = `${window.location.origin}/view/${encodeURIComponent(sceneId)}`;

        this.root = document.createElement("div");
        this.root.className = "publish-panel";
        this.root.innerHTML = `
            <div class="publish-card" role="dialog" aria-labelledby="publish-title">
                <header class="publish-head">
                    <h3 id="publish-title">Publish the public view</h3>
                    <button class="publish-x" data-close aria-label="Close">×</button>
                </header>

                <section data-step="options">
                    <form class="publish-options" data-form>${PUBLISH_OPTIONS.map(optionField).join("")}</form>
                    <p class="publish-note" data-bake-note hidden></p>
                    <div class="publish-actions">
                        <button class="primary small" data-publish>Publish</button>
                        <button class="ghost small" data-close>Cancel</button>
                    </div>
                </section>

                <section data-step="progress" hidden>
                    <p class="publish-stage" data-stage>Getting ready…</p>
                    <div class="publish-bar"><span data-bar></span></div>
                </section>

                <section data-step="result" hidden>
                    <p class="publish-stage" data-result-title></p>
                    <div class="publish-result" data-result></div>
                    <div class="publish-actions">
                        <button class="primary small" data-open>Open this version</button>
                        <button class="ghost small" data-copy>Copy client link</button>
                        <button class="ghost small" data-again>Publish another</button>
                    </div>
                </section>

                <section class="publish-versions">
                    <h4>Versions</h4>
                    <p class="publish-hint">
                        Each opens in a tab of its own, with <code>?stats</code> on, to compare.
                        Clients' link, <code>/view/${escapeHtml(sceneId)}</code>, always opens the latest.
                    </p>
                    <ol data-versions><li class="publish-empty">Loading…</li></ol>
                </section>
            </div>
        `;
        document.body.append(this.root);

        const $ = (selector) => this.root.querySelector(selector);
        this.dom = {
            form: $("[data-form]"),
            bakeNote: $("[data-bake-note]"),
            stage: $("[data-stage]"),
            bar: $("[data-bar]"),
            resultTitle: $("[data-result-title]"),
            result: $("[data-result]"),
            versions: $("[data-versions]"),
            steps: [...this.root.querySelectorAll("[data-step]")],
        };
        this.dom.form.addEventListener("submit", (event) => event.preventDefault());
        this.root.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => this.close()));
        $("[data-publish]").addEventListener("click", (event) => {
            event.preventDefault();
            this.publish();
        });
        $("[data-again]").addEventListener("click", () => this.show("options"));
        $("[data-open]").addEventListener("click", () => this.openVersion(this.published?.version));
        $("[data-copy]").addEventListener("click", (event) => {
            navigator.clipboard?.writeText(this.link).then(() => {
                event.target.textContent = "Copied";
            });
        });
        this.dom.versions.addEventListener("click", (event) => {
            const bake = event.target.closest("[data-bake-version]");
            if (bake) this.bakeVersion(bake.dataset.bakeVersion, bake.dataset.quality);
            const open = event.target.closest("[data-open-version]");
            if (open) this.openVersion(open.dataset.openVersion);
        });

        this.setOptions(remembered());
        this.show("options");
        this.refresh();
    }

    // -----------------------------------------------------------------
    // Options
    // -----------------------------------------------------------------

    setOptions(options) {
        for (const option of PUBLISH_OPTIONS) {
            const field = this.dom.form.elements[option.id];
            if (option.choices) field.value = options[option.id];
            else field.checked = options[option.id];
        }
    }

    getOptions() {
        const data = new FormData(this.dom.form);
        return publishOptions(
            Object.fromEntries(
                PUBLISH_OPTIONS.map((option) => [option.id, option.choices ? data.get(option.id) : data.has(option.id)])
            )
        );
    }

    /** Baking is offered only where this server can run it. */
    setBakeAvailable({ available, reason }) {
        this.bakeAvailable = available;
        for (const input of this.dom.form.elements.bake) {
            if (input.value !== "off") input.disabled = !available;
        }
        if (!available) this.dom.form.elements.bake.value = "off";
        this.dom.bakeNote.hidden = available;
        this.dom.bakeNote.textContent = available ? "" : `Can't bake from here: ${reason}`;
    }

    // -----------------------------------------------------------------
    // Publishing
    // -----------------------------------------------------------------

    async publish() {
        const options = this.getOptions();
        try {
            localStorage.setItem(REMEMBERED, JSON.stringify(options));
        } catch {
            // Remembering is a convenience.
        }
        this.show("progress");
        this.dom.stage.classList.remove("is-bad");
        try {
            const { glb, stats } = await buildSnapshot(this.experience, {
                onProgress: (fraction, label) => this.progress(fraction, label),
                cull: options.cull,
                merge: options.merge,
            });
            this.progress(1, `Uploading ${(glb.byteLength / 1048576).toFixed(1)} MB…`);
            const response = await fetch(`${this.api}/publish`, {
                method: "POST",
                headers: { "Content-Type": "model/gltf-binary", "X-Publish-Options": JSON.stringify(options) },
                body: glb,
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || `Publishing failed (${response.status})`);
            const runtime = await this.sendRuntime(body);
            this.published = body;
            this.done(body, stats, options, runtime);
            this.refresh();
        } catch (error) {
            console.error("[publish]", error);
            this.dom.stage.textContent = `Couldn't publish: ${error.message}`;
            this.dom.stage.classList.add("is-bad");
            setTimeout(() => this.show("options"), 4000);
        }
    }

    /**
     * The version's runtime file (Runtime.js) — collision, materials, glass
     * — so its public view builds nothing of the house. A version without
     * one still opens; it builds the house as before.
     */
    async sendRuntime(manifest) {
        this.progress(1, "Packing collision and materials…");
        try {
            const { glb, stats } = await buildRuntime(this.experience);
            const response = await fetch(`${this.api}/versions/${encodeURIComponent(manifest.version)}/runtime`, {
                method: "PUT",
                headers: { "Content-Type": "model/gltf-binary" },
                body: glb,
            });
            const updated = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(updated.error || `Sending it failed (${response.status})`);
            Object.assign(manifest, { runtime: updated.runtime, collision: updated.collision, sizes: updated.sizes });
            return stats;
        } catch (error) {
            console.warn("[publish] runtime file", error);
            return { error: error.message };
        }
    }

    progress(fraction, label) {
        this.dom.bar.style.width = `${Math.round(fraction * 100)}%`;
        if (label) this.dom.stage.textContent = label;
    }

    done(manifest, stats, options, runtime = null) {
        const n = (value) => value.toLocaleString();
        const share = (part) => `${Math.round((100 * part) / stats.input)}%`;
        this.dom.resultTitle.textContent = `Published — ${versionLabel(manifest.version)}`;
        const rows = [
            ["Triangles", `${n(stats.input)} → ${n(stats.output)}`],
            ...(options.cull
                ? [
                      ["Hidden faces removed", `${n(stats.removed)} (${share(stats.removed)})`],
                      ["Faces turned round", n(stats.flipped)],
                      ["Two-sided faces split", n(stats.doubled)],
                  ]
                : []),
            ["Meshes", n(stats.meshes)],
            ["Download", `${(manifest.sizes.view / 1048576).toFixed(1)} MB`],
            ...(runtime?.error
                ? [["Runtime file", `not sent (${runtime.error}) — the public view builds the house itself`]]
                : runtime
                  ? [
                        [
                            "Runtime file",
                            `${Math.round(manifest.sizes.runtime / 1024)} KB — collision ${n(manifest.collision.before)} → ${n(manifest.collision.after)} triangles, ${n(runtime.materials)} materials`,
                        ],
                    ]
                  : []),
            ...(options.cull
                ? [
                      ["Viewpoints", `${n(stats.samples.walk)} walking · ${n(stats.samples.bird)} overhead`],
                      [
                          "Check",
                          `${n(stats.samples.check)} more viewpoints; ${n(stats.restored)} ${stats.restored === 1 ? "face" : "faces"} put back`,
                      ],
                  ]
                : []),
            ["Took", `${stats.seconds} s`],
        ];
        this.dom.result.innerHTML = `
            <p class="publish-link">${escapeHtml(this.link)}</p>
            <dl>${rows.map(([term, value]) => `<dt>${term}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
            <p class="publish-note" data-bake-result></p>
        `;
        const note = this.dom.result.querySelector("[data-bake-result]");
        if (manifest.bake?.state === "running") {
            note.textContent = "Baking its lighting now — its progress is below. Until it's done the version is lit live.";
        } else if (manifest.bake?.state === "unavailable") {
            note.textContent = `Not baked: ${manifest.bake.error}`;
        } else {
            note.textContent = "Lit live. Bake it below whenever you like.";
        }
        this.show("result");
    }

    // -----------------------------------------------------------------
    // Versions and bakes
    // -----------------------------------------------------------------

    /** Reload the list of versions, and follow a bake while one runs. */
    async refresh() {
        clearTimeout(this.poll);
        let data;
        try {
            const response = await fetch(`${this.api}/versions`);
            data = await response.json();
            if (!response.ok) throw new Error(data.error || response.statusText);
        } catch (error) {
            this.dom.versions.innerHTML = `<li class="publish-empty"></li>`;
            this.dom.versions.firstChild.textContent = `Couldn't list the versions: ${error.message}`;
            return;
        }
        if (!this.root.isConnected) return;
        this.setBakeAvailable(data.bake);
        this.job = data.bake.job;
        this.renderVersions(data.versions, data.latest);
        // The note on what was just published, once its bake is over.
        const note = this.dom.result.querySelector("[data-bake-result]");
        if (note && this.job?.version === this.published?.version) {
            if (this.job.state === "done") note.textContent = "Baked — open it to see the baked light.";
            if (this.job.state === "failed") note.textContent = `The bake failed: ${this.job.error}`;
        }
        if (this.job?.state === "running") this.poll = setTimeout(() => this.follow(), POLL_MS);
    }

    /** The bake's progress, until it finishes — then the list again. */
    async follow() {
        if (!this.root.isConnected) return;
        try {
            const { job } = await (await fetch(`${this.api}/bake`)).json();
            this.job = job;
            if (job?.state !== "running") return this.refresh();
            this.renderJob();
        } catch {
            // Try again next time.
        }
        this.poll = setTimeout(() => this.follow(), POLL_MS);
    }

    renderVersions(versions, latest) {
        if (!versions.length) {
            this.dom.versions.innerHTML = `<li class="publish-empty">Not published yet.</li>`;
            return;
        }
        const n = (value) => (value ?? 0).toLocaleString();
        const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
        const canBake = this.bakeAvailable && this.job?.state !== "running";
        this.dom.versions.innerHTML = versions
            .map(({ version, options, stats = {}, sizes = {}, lighting, runtime }) => {
                const light = Object.values(sizes.lightmaps || {})[0];
                const rebake = lighting ? "Re-bake" : "Bake";
                return `
                    <li class="publish-version${version === latest ? " is-latest" : ""}" data-version="${escapeHtml(version)}">
                        <div class="publish-version-head">
                            <strong>${escapeHtml(versionLabel(version))}</strong>
                            ${version === latest ? `<span class="publish-tag">latest</span>` : ""}
                            <span class="publish-tag${lighting ? " is-baked" : ""}">${
                                lighting ? `baked · ${lighting.samples} samples` : "lit live"
                            }</span>
                        </div>
                        <div class="publish-version-meta">${escapeHtml(describeOptions(options))}</div>
                        <div class="publish-version-meta">
                            ${n(lighting?.triangles ?? stats.output)} triangles · ${n(lighting?.meshes ?? stats.meshes)} meshes ·
                            ${mb(sizes.view || 0)}${light ? ` + ${mb(light)} lightmap` : ""}${
                                runtime ? ` + ${Math.round((sizes.runtime || 0) / 1024)} KB runtime` : ""
                            }
                        </div>
                        <div class="publish-version-meta">${
                            runtime ? "Opens without building the house" : "No runtime file: opening it builds the house"
                        }</div>
                        <div class="publish-version-job" data-job hidden>
                            <span class="publish-stage" data-job-label></span>
                            <div class="publish-bar"><span data-job-bar></span></div>
                        </div>
                        <div class="publish-version-actions">
                            <button class="ghost small" data-open-version="${escapeHtml(version)}">Open</button>
                            ${
                                canBake
                                    ? `<button class="ghost small" data-bake-version="${escapeHtml(version)}" data-quality="final">${rebake}</button>
                                       <button class="ghost small" data-bake-version="${escapeHtml(version)}" data-quality="draft">${rebake} (draft)</button>`
                                    : ""
                            }
                        </div>
                    </li>
                `;
            })
            .join("");
        this.renderJob();
    }

    /** The running or last bake, on its version's row. */
    renderJob() {
        for (const row of this.dom.versions.querySelectorAll("[data-job]")) row.hidden = true;
        const job = this.job;
        if (!job || job.state === "done") return;
        const row = this.dom.versions.querySelector(`[data-version="${job.version}"] [data-job]`);
        if (!row) return;
        row.hidden = false;
        const label = row.querySelector("[data-job-label]");
        label.classList.toggle("is-bad", job.state === "failed");
        const elapsed = `${Math.floor(job.seconds / 60)}:${String(job.seconds % 60).padStart(2, "0")}`;
        label.textContent =
            job.state === "failed"
                ? `Bake failed: ${job.error}`
                : `${job.label} — ${Math.round(job.fraction * 100)}% · ${elapsed}`;
        row.querySelector("[data-job-bar]").style.width = `${Math.round(job.fraction * 100)}%`;
    }

    async bakeVersion(version, quality) {
        try {
            const response = await fetch(`${this.api}/versions/${encodeURIComponent(version)}/bake`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quality }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || response.statusText);
        } catch (error) {
            window.alert(`Couldn't start the bake: ${error.message}`);
        }
        this.refresh();
    }

    openVersion(version) {
        if (!version) return;
        window.open(`${this.link}?version=${encodeURIComponent(version)}&stats`, "_blank", "noopener");
    }

    show(step) {
        for (const section of this.dom.steps) section.hidden = section.dataset.step !== step;
    }

    close() {
        clearTimeout(this.poll);
        this.root.remove();
    }
}

/** The form field for one option: a checkbox, or a row of choices. */
function optionField(option) {
    if (option.choices) {
        return `
            <fieldset class="publish-choice">
                <legend>${option.label}<small>${option.hint}</small></legend>
                <div class="publish-segments">${option.choices
                    .map(
                        (choice) => `
                            <label>
                                <input type="radio" name="${option.id}" value="${choice.value}">
                                <span>${choice.label}${choice.detail ? `<small>${choice.detail}</small>` : ""}</span>
                            </label>`
                    )
                    .join("")}</div>
            </fieldset>`;
    }
    return `
        <label class="publish-option">
            <input type="checkbox" name="${option.id}">
            <span>${option.label}<small>${option.hint}</small></span>
        </label>`;
}

function remembered() {
    try {
        return publishOptions(JSON.parse(localStorage.getItem(REMEMBERED) || "{}"));
    } catch {
        return publishOptions();
    }
}

function escapeHtml(value) {
    return String(value).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
}

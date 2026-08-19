import gsap from "gsap";

import Experience from "./Experience.js";
import elements from "./Utils/functions/elements.js";
import { AVATARS } from "./Utils/assets.js";

/**
 * The entry sequence: loading bar -> name -> avatar -> walkthrough.
 *
 * Scene selection happens before the Experience is constructed (the world
 * needs its spec up front), so by the time this runs the space is known.
 */
export default class Preloader {
    constructor() {
        this.experience = new Experience();
        this.resources = this.experience.resources;

        this.counter = 0;
        this.amountDone = 0;
        this.resourcesReady = false;

        this.domElements = elements({
            preloader: ".preloader",
            progressBar: ".progress-bar",
            percent: ".preloader-percent",
            loadingStage: ".stage-loading",
            nameStage: ".stage-name",
            avatarStage: ".stage-avatar",
            nameInput: "#name-input",
            nameButton: "#name-input-button",
            avatarGrid: ".avatar-grid",
            sceneTitle: ".preloader-scene-title",
            sceneSummary: ".preloader-scene-summary",
        });

        this.renderSceneDetails();
        this.renderAvatars();

        this.resources.on("loading", (loaded, queue) => {
            this.amountDone = Math.round((loaded / queue) * 100);
        });

        this.resources.on("ready", () => {
            this.resourcesReady = true;
            this.amountDone = 100;
        });

        this.addEventListeners();
    }

    renderSceneDetails() {
        const spec = this.experience.sceneSpec;
        if (this.domElements.sceneTitle) {
            this.domElements.sceneTitle.textContent = spec.name;
        }
        if (this.domElements.sceneSummary) {
            this.domElements.sceneSummary.textContent = spec.summary;
        }
    }

    renderAvatars() {
        if (!this.domElements.avatarGrid) return;

        this.domElements.avatarGrid.innerHTML = AVATARS.map(
            (avatar) => `
                <button class="avatar-option" data-avatar="${avatar.id}">
                    <img src="${avatar.image}" alt="" />
                    <span>${avatar.label}</span>
                </button>`
        ).join("");
    }

    addEventListeners() {
        this.domElements.nameButton?.addEventListener("click", this.onNameSubmit);
        this.domElements.nameInput?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") this.onNameSubmit();
        });

        this.domElements.avatarGrid?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-avatar]");
            if (button) this.onAvatarSelect(button.dataset.avatar);
        });
    }

    onNameSubmit = () => {
        const name = this.domElements.nameInput?.value.trim();
        if (!name) {
            this.domElements.nameInput?.focus();
            return;
        }

        this.experience.onName?.(name);
        this.showStage(this.domElements.nameStage, this.domElements.avatarStage);
    };

    onAvatarSelect = (avatarId) => {
        this.experience.onAvatar?.(avatarId);
        this.finish();
    };

    /** Crossfade between two preloader panels. */
    showStage(from, to) {
        const timeline = gsap.timeline();

        timeline
            .to(from, {
                opacity: 0,
                y: -18,
                duration: 0.5,
                ease: "power3.out",
                onComplete: () => {
                    from.style.display = "none";
                    to.style.display = "flex";
                },
            })
            .fromTo(
                to,
                { opacity: 0, y: 18 },
                { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }
            );
    }

    /** Called once the assets are in and the counter has caught up. */
    onLoaded() {
        if (this.loadedHandled) return;
        this.loadedHandled = true;

        this.showStage(this.domElements.loadingStage, this.domElements.nameStage);
        setTimeout(() => this.domElements.nameInput?.focus(), 700);
    }

    finish() {
        gsap.to(this.domElements.preloader, {
            opacity: 0,
            duration: 1.1,
            ease: "power3.out",
            onComplete: () => {
                this.domElements.preloader?.remove();
                document.body.classList.add("walkthrough-active");

                // Only now may a canvas click grab the pointer — before this
                // the user is still clicking preloader buttons.
                this.experience.camera.pointerLockEnabled = true;
            },
        });
    }

    update() {
        // Ease the displayed percentage toward the real one so the bar never
        // jumps straight to 100 on a warm cache. Driven by elapsed time, not
        // frame count, so a slow device doesn't sit on the loading screen.
        if (this.counter < this.amountDone) {
            const delta = this.experience.time.delta;
            const step = Math.max(45, (this.amountDone - this.counter) * 5) * delta;

            this.counter = Math.min(this.amountDone, this.counter + step);
            const shown = Math.min(100, Math.round(this.counter));

            if (this.domElements.percent) {
                this.domElements.percent.textContent = `${shown}`;
            }
            if (this.domElements.progressBar) {
                this.domElements.progressBar.style.width = `${shown}%`;
            }

            if (shown >= 100 && this.resourcesReady) {
                this.onLoaded();
            }
        }
    }
}

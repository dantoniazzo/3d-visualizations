import { EventEmitter } from "events";

import { MAX_PIXELS, MAX_PIXEL_RATIO } from "./device.js";

/**
 * The size of the viewport the canvas fills.
 *
 * That is the whole window during a walkthrough, but in edit mode the
 * canvas shares the screen with the editor's header, toolbar and sidebar,
 * so the wrapper element is measured rather than the window.
 */
export default class Sizes extends EventEmitter {
    constructor() {
        super();
        this.element = document.querySelector(".experience-wrapper");
        /** How much of the step's own pixel ratio is drawn: all of it, unless a public view's frame-rate guard has taken some (FrameGuard.js). */
        this.scale = 1;
        this.handleSizes();

        const onResize = () => {
            const { width, height } = this;
            this.handleSizes();
            if (width !== this.width || height !== this.height) this.emit("resize");
        };

        window.addEventListener("resize", onResize);
        if (this.element && "ResizeObserver" in window) {
            this.observer = new ResizeObserver(onResize);
            this.observer.observe(this.element);
        }
    }

    handleSizes() {
        this.width = Math.max(1, this.element?.clientWidth || window.innerWidth);
        this.height = Math.max(1, this.element?.clientHeight || window.innerHeight);
        this.aspect = this.width / this.height;
        // As many pixels as the screen has, up to the step's ratio — and no
        // more in all than the step's budget, however big the window: a
        // lower ratio then, rather than four times the pixels on a 5K screen.
        const budget = Math.sqrt(MAX_PIXELS / (this.width * this.height));
        this.pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO, budget) * this.scale;
    }
}

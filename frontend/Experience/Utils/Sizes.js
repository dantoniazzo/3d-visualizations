import { EventEmitter } from "events";

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
        this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    }
}

export default class Time {
    constructor() {
        this.start = Date.now();
        this.current = this.start;
        this.elapsed = 0;
        this.delta = 0.016;
    }

    update() {
        const currentTime = Date.now();
        this.delta = (currentTime - this.current) / 1000;
        this.current = currentTime;
        this.elapsed = (this.current - this.start) / 1000;

        // A tab that was backgrounded returns a huge delta; clamping it stops
        // the player tunnelling through the collision mesh on the first frame.
        if (this.delta > 0.1) {
            this.delta = 0.1;
        }
    }

    /**
     * After a pause in the frames — the editor draws only when something
     * changes (Pace.js): the frame about to be drawn takes `delta` seconds
     * to have passed, not the pause. None, for a frame drawn only to see
     * that nothing has changed: whatever moves by itself stays where it is.
     */
    resume(delta = 1 / 60) {
        this.current = Date.now();
        this.delta = delta;
    }

    getDelta() {
        return this.delta;
    }
}

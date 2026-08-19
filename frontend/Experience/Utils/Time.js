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

    getDelta() {
        return this.delta;
    }
}

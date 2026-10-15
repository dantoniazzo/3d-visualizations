// In-page: frames for a tab the browser is not drawing. With the browser
// pane hidden (or a tab in the background) requestAnimationFrame never
// fires, so the app stands still: nothing loads past its first frame, a
// publish's progress bar stops, a fade never ends. Load this (through the
// sink: await eval(await (await fetch("http://127.0.0.1:3199/drive.js")).text())),
// then:
//   __driveOn()                 queue the app's frames instead of waiting for the browser
//   await __drive(ms, until?)   run them as fast as they come for `ms`, or until until() is true;
//                               returns how many frames ran (yields between frames, so
//                               fetches, workers and timers carry on)
//   __driveOff()                give requestAnimationFrame back (a frame still queued runs once)
// An editor tab at rest asks for no frames (it draws only when something has
// changed: app-notes.md, When the editor draws): __drive then returns its
// turns, not frames. experience.pace.set("always") has it draw every frame,
// as a public view does; set(null) gives it back.
// A javascript_tool call can wait about 40 s: drive in steps of 20–40 s and
// check progress between them. Driven, a publish runs ~2.5x faster than
// waiting on a hidden pane's throttled timers.
(() => {
    if (window.__drive) return;
    const queue = [];
    let original = null;
    window.__driveOn = () => {
        if (original) return;
        original = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) => queue.push(callback);
    };
    window.__driveOff = () => {
        if (!original) return;
        const restore = original;
        window.requestAnimationFrame = restore;
        original = null;
        for (const callback of queue.splice(0)) restore(callback);
    };
    const tick = () => new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(0);
    });
    window.__drive = async (ms, until = null) => {
        const end = performance.now() + ms;
        let frames = 0;
        while (performance.now() < end && !(until && until())) {
            const now = performance.now();
            for (const callback of queue.splice(0)) {
                try {
                    callback(now);
                } catch (error) {
                    console.warn(error);
                }
            }
            frames++;
            await tick();
        }
        return frames;
    };
})();

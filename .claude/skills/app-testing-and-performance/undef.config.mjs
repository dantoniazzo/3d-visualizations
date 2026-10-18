// ESLint's no-undef over the app's code, with node's globals and the
// browser's: `node --check` passes a file that calls a function it no longer
// defines, and the bundle leaves the name free — the page throws at runtime.
// Run after moving code between files (SKILL.md, Files in this skill; tools.md).
const browser = `window document navigator performance requestAnimationFrame cancelAnimationFrame localStorage sessionStorage fetch Response Request Headers URL URLSearchParams MessageChannel Image HTMLElement HTMLCanvasElement HTMLImageElement HTMLInputElement HTMLSelectElement CustomEvent Event KeyboardEvent PointerEvent MouseEvent WheelEvent TouchEvent getComputedStyle matchMedia location history OffscreenCanvas createImageBitmap ImageData ImageBitmap Blob File FileReader Worker WebGL2RenderingContext WebGLRenderingContext ResizeObserver IntersectionObserver MutationObserver DOMParser alert confirm prompt devicePixelRatio innerWidth innerHeight screen AudioContext Audio crypto caches indexedDB visualViewport DOMRect Node Element NodeFilter XMLHttpRequest FormData AbortController requestIdleCallback cancelIdleCallback self Path2D CanvasRenderingContext2D VideoFrame GPUBufferUsage HTMLVideoElement HTMLAnchorElement DragEvent ClipboardEvent FocusEvent InputEvent DataTransfer EventSource WebSocket BroadcastChannel ErrorEvent PromiseRejectionEvent DocumentFragment Text SVGElement CSS FontFace getSelection open close scrollTo scroll focus blur print name status parent top opener frames length origin isSecureContext __APP_VERSION__ io`.split(/\s+/);
const globals = Object.fromEntries([...Object.getOwnPropertyNames(globalThis), ...browser].map((n) => [n, "readonly"]));
export default [
    {
        files: ["**/*.js", "**/*.mjs"],
        languageOptions: { ecmaVersion: "latest", sourceType: "module", globals },
        rules: { "no-undef": "error" },
    },
];

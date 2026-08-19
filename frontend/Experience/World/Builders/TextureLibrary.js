import * as THREE from "three";

import { FINISHES, DEFAULT_FINISH } from "../../../../shared/catalog.js";

/**
 * Generates the finish textures at runtime on a canvas.
 *
 * Shipping tileable parquet / tile / carpet images would be tens of
 * megabytes and a licensing question; drawing them costs a few milliseconds
 * each and makes a new finish a data change in shared/catalog.js.
 *
 * Every generator draws into a square canvas that tiles seamlessly, and the
 * finish's `tile` value says how many metres one repeat covers so the same
 * finish reads at the same scale on any surface.
 */

const SIZE = 512;

/** Deterministic pseudo-random so a finish looks identical every load. */
function makeRandom(seed = 1) {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return ((s >>> 0) % 100000) / 100000;
    };
}

/** Nudge a hex colour's lightness by `amount` (-1..1). */
function shade(hex, amount) {
    const c = new THREE.Color(hex);
    if (amount >= 0) c.lerp(new THREE.Color("#ffffff"), amount);
    else c.lerp(new THREE.Color("#000000"), -amount);
    return `#${c.getHexString()}`;
}

function speckle(ctx, random, count, colors, alpha = 0.06, max = 3) {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = colors[Math.floor(random() * colors.length)];
        ctx.globalAlpha = alpha * (0.5 + random());
        const r = random() * max + 0.4;
        ctx.beginPath();
        ctx.arc(random() * SIZE, random() * SIZE, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------
// Generators — each fills a SIZE x SIZE seamless canvas
// ---------------------------------------------------------------------

const GENERATORS = {
    /** Straight plank flooring / panelling, with staggered end joints. */
    planks(ctx, p, random) {
        const rows = p.rows ?? 6;
        const h = SIZE / rows;

        ctx.fillStyle = p.gap ?? "#000000";
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let row = 0; row < rows; row++) {
            const y = row * h;
            // Stagger end joints row to row so it doesn't read as a grid.
            const offset = ((p.stagger ?? 0.5) * row * SIZE) % SIZE;
            const boards = 2;
            const bw = SIZE / boards;

            for (let b = -1; b <= boards; b++) {
                const x = b * bw + offset;
                const tone = shade(p.base, (random() - 0.5) * 0.05);

                ctx.fillStyle = tone;
                ctx.fillRect(x + 1, y + 1, bw - 2, h - 2);

                // Grain: a few long strokes along the board.
                ctx.strokeStyle = p.grain;
                ctx.globalAlpha = 0.16;
                ctx.lineWidth = 1;
                for (let g = 0; g < 6; g++) {
                    const gy = y + 3 + random() * (h - 6);
                    ctx.beginPath();
                    ctx.moveTo(x + 2, gy);
                    ctx.bezierCurveTo(
                        x + bw * 0.3, gy + (random() - 0.5) * 3,
                        x + bw * 0.7, gy + (random() - 0.5) * 3,
                        x + bw - 2, gy
                    );
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
        }
    },

    /** Herringbone parquet: blocks at ±45°, laid in a repeating V. */
    herringbone(ctx, p, random) {
        ctx.fillStyle = p.gap;
        ctx.fillRect(0, 0, SIZE, SIZE);

        const block = SIZE / 4;
        const w = block;
        const h = block / 2;

        const drawBlock = (cx, cy, angle) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = shade(p.base, (random() - 0.5) * 0.07);
            ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
            ctx.strokeStyle = p.grain;
            ctx.globalAlpha = 0.18;
            for (let g = 0; g < 3; g++) {
                const gy = -h / 2 + 2 + random() * (h - 4);
                ctx.beginPath();
                ctx.moveTo(-w / 2 + 2, gy);
                ctx.lineTo(w / 2 - 2, gy);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        };

        // Two interlocking diagonal families, wrapped so edges match.
        for (let i = -2; i < 6; i++) {
            for (let j = -2; j < 6; j++) {
                const x = i * block;
                const y = j * block;
                drawBlock(x + block * 0.25, y + block * 0.25, Math.PI / 4);
                drawBlock(x + block * 0.75, y + block * 0.75, -Math.PI / 4);
            }
        }
    },

    /** Square/rect tiles with grout lines. */
    tiles(ctx, p, random) {
        const cols = p.cols ?? 3;
        const rows = p.rows ?? 3;

        ctx.fillStyle = p.grout;
        ctx.fillRect(0, 0, SIZE, SIZE);

        const w = SIZE / cols;
        const h = SIZE / rows;
        const grout = Math.max(2, SIZE * 0.006);

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                ctx.fillStyle = shade(p.base, (random() - 0.5) * (p.variation ?? 0.06) * 2);
                ctx.fillRect(c * w + grout, r * h + grout, w - grout * 2, h - grout * 2);
            }
        }

        speckle(ctx, random, 400, [p.grout], 0.03, 1.5);
    },

    /** Veined marble slabs. */
    marble(ctx, p, random) {
        const cols = p.cols ?? 2;
        const rows = p.rows ?? 2;
        const w = SIZE / cols;
        const h = SIZE / rows;
        const grout = Math.max(1.5, SIZE * 0.004);

        ctx.fillStyle = p.grout;
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const x = c * w;
                const y = r * h;

                ctx.save();
                ctx.beginPath();
                ctx.rect(x + grout, y + grout, w - grout * 2, h - grout * 2);
                ctx.clip();

                ctx.fillStyle = p.base;
                ctx.fillRect(x, y, w, h);

                // A few forking veins per slab.
                ctx.strokeStyle = p.vein;
                for (let v = 0; v < 7; v++) {
                    ctx.globalAlpha = 0.18 + random() * 0.3;
                    ctx.lineWidth = 0.6 + random() * 2.2;
                    let px = x + random() * w;
                    let py = y;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    while (py < y + h) {
                        px += (random() - 0.5) * w * 0.35;
                        py += h * 0.12;
                        ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        }
    },

    /** Offset-course brick or subway tile. */
    brick(ctx, p, random) {
        const rows = p.rows ?? 8;
        const h = SIZE / rows;
        const cols = 4;
        const w = SIZE / cols;
        const mortar = Math.max(2, SIZE * 0.005);

        ctx.fillStyle = p.mortar;
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let r = 0; r < rows; r++) {
            const offset = r % 2 === 0 ? 0 : w / 2;
            for (let c = -1; c <= cols; c++) {
                const x = c * w + offset;
                ctx.fillStyle = shade(p.base, (random() - 0.5) * (p.variation ?? 0.1) * 2);
                ctx.fillRect(x + mortar, r * h + mortar, w - mortar * 2, h - mortar * 2);
            }
        }
    },

    /** Flat paint with a barely-there roll texture. */
    paint(ctx, p, random) {
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, SIZE, SIZE);
        speckle(ctx, random, 2200, [shade(p.base, -0.05), shade(p.base, 0.05)], 0.025, 2.2);
    },

    /** Mottled plaster / limewash. */
    plaster(ctx, p, random) {
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let i = 0; i < 90; i++) {
            const x = random() * SIZE;
            const y = random() * SIZE;
            const r = 20 + random() * 90;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, p.mottle);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 0.14;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    /** Dense short fibres. */
    carpet(ctx, p, random) {
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, SIZE, SIZE);

        ctx.lineWidth = 1;
        for (let i = 0; i < 9000; i++) {
            const x = random() * SIZE;
            const y = random() * SIZE;
            ctx.strokeStyle = random() > 0.5 ? p.fleck : shade(p.base, 0.06);
            ctx.globalAlpha = 0.25 + random() * 0.3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (random() - 0.5) * 4, y + (random() - 0.5) * 4);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    },

    /** Poured concrete with pour marks. */
    concrete(ctx, p, random) {
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let i = 0; i < 60; i++) {
            const x = random() * SIZE;
            const y = random() * SIZE;
            const r = 40 + random() * 130;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, p.mottle);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        speckle(ctx, random, 2600, [shade(p.base, -0.18), shade(p.base, 0.12)], 0.16, 1.6);
    },

    /** Mown grass: short blades in a few tones over a flat base. */
    grass(ctx, p, random) {
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Broad patches first, so the lawn is not a uniform green sheet.
        for (let i = 0; i < 40; i++) {
            const x = random() * SIZE;
            const y = random() * SIZE;
            const r = 30 + random() * 110;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, random() > 0.5 ? p.blade : p.dark);
            g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.lineWidth = 1;
        for (let i = 0; i < 7000; i++) {
            const x = random() * SIZE;
            const y = random() * SIZE;
            ctx.strokeStyle = random() > 0.45 ? p.blade : p.dark;
            ctx.globalAlpha = 0.3 + random() * 0.4;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 4);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    },

    /** Loose aggregate — gravel, chippings, tarmac. */
    gravel(ctx, p, random) {
        ctx.fillStyle = p.base;
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let i = 0; i < 5200; i++) {
            const x = random() * SIZE;
            const y = random() * SIZE;
            const r = 0.8 + random() * 3.4;

            ctx.fillStyle = random() > 0.5 ? p.light : p.dark;
            ctx.globalAlpha = 0.25 + random() * 0.45;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * (0.6 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    },

    /** Overlapping curved roof tiles. */
    rooftiles(ctx, p, random) {
        const rows = p.rows ?? 5;
        const h = SIZE / rows;
        const cols = 8;
        const w = SIZE / cols;

        ctx.fillStyle = p.shade;
        ctx.fillRect(0, 0, SIZE, SIZE);

        for (let r = 0; r < rows; r++) {
            const offset = r % 2 === 0 ? 0 : w / 2;
            for (let c = -1; c <= cols; c++) {
                const x = c * w + offset;
                const y = r * h;
                ctx.fillStyle = shade(p.base, (random() - 0.5) * 0.16);
                ctx.beginPath();
                ctx.moveTo(x + 1, y + h);
                ctx.lineTo(x + 1, y + h * 0.45);
                ctx.quadraticCurveTo(x + w / 2, y - h * 0.1, x + w - 1, y + h * 0.45);
                ctx.lineTo(x + w - 1, y + h);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = p.shade;
                ctx.globalAlpha = 0.5;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
    },
};

// ---------------------------------------------------------------------

export default class TextureLibrary {
    constructor() {
        this.cache = new Map();
    }

    /**
     * A THREE texture for a finish, cached across every surface using it.
     * @param {string} id  key in FINISHES
     */
    get(id) {
        const finish = FINISHES[id];
        if (!finish) return null;
        if (this.cache.has(id)) return this.cache.get(id);

        const generate = GENERATORS[finish.generator] || GENERATORS.paint;

        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");

        // Seed from the id so a finish is byte-identical every session.
        const seed = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 7);
        generate(ctx, finish.params, makeRandom(seed));

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.name = id;

        this.cache.set(id, texture);
        return texture;
    }

    /** Metres covered by one repeat of a finish. */
    tileSize(id) {
        return FINISHES[id]?.tile ?? 2;
    }

    /** Fall back to a sane finish when a spec names an unknown one. */
    resolve(id, kind) {
        return FINISHES[id]?.kind === kind ? id : DEFAULT_FINISH[kind] || "paint_white";
    }

    dispose() {
        for (const texture of this.cache.values()) texture.dispose();
        this.cache.clear();
    }
}

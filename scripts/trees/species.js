/**
 * The trees and shrubs the Kosinožići space grows (public/models/vegetation/),
 * as ez-tree (github.com/dgreenheck/ez-tree, MIT) grows them: each a preset,
 * a seed, a height in metres, and changes to the preset's options.
 * World/Flora/trees.js lists how each is coloured and swayed.
 */

/** An olive: a short, gnarled, twisting trunk splitting low into a few limbs, a round crown of narrow leaves. */
function olive(o, tweak = {}) {
    o.bark.type = "oak";
    o.bark.tint = 0xc9c2b8;
    o.bark.textureScale = { x: 1, y: 6 };
    const b = o.branch;
    b.levels = 3;
    b.children = { 0: 5, 1: 4, 2: 4 };
    b.angle = { 1: 38, 2: 48, 3: 42 };
    b.start = { 1: 0.32, 2: 0.15, 3: 0.2 };
    b.length = { 0: 16, 1: 15, 2: 7, 3: 3.5 };
    b.radius = { 0: 2.6, 1: 0.62, 2: 0.6, 3: 0.55 };
    b.gnarliness = { 0: 0.35, 1: 0.3, 2: 0.22, 3: 0.12 };
    b.twist = { 0: 0.5, 1: 0.3, 2: 0.1, 3: 0 };
    b.taper = { 0: 0.55, 1: 0.6, 2: 0.7, 3: 0.75 };
    b.force = { direction: { x: 0, y: 1, z: 0 }, strength: 0.012 };
    b.sections = { 0: 10, 1: 8, 2: 5, 3: 3 };
    b.segments = { 0: 8, 1: 6, 2: 4, 3: 3 };
    Object.assign(o.leaves, { type: "ash", count: 20, size: 2.3, sizeVariance: 0.5, angle: 30, start: 0.05, billboard: "double" }, tweak.leaves || {});
    for (const [key, value] of Object.entries(tweak.branch || {})) Object.assign(b[key], value);
}

/** A fuller crown than the preset's: more, larger leaf cards. */
function fuller(o, { count = 24, size = 3.0, children } = {}) {
    if (count) Object.assign(o.leaves, { count, size, sizeVariance: 0.5 });
    if (children) Object.assign(o.branch.children, children);
}

export const SPECIES = [
    { name: "oak_1", preset: "Oak Medium", seed: 101, height: 11, edit: (o) => fuller(o) },
    { name: "oak_2", preset: "Oak Medium", seed: 202, height: 10, edit: (o) => fuller(o) },
    { name: "oak_3", preset: "Oak Large", seed: 404, height: 13, edit: (o) => fuller(o, { count: 20 }) },
    { name: "oak_4", preset: "Oak Small", seed: 707, height: 7, edit: (o) => fuller(o, { count: 26, size: 3 }) },
    { name: "ash_1", preset: "Ash Medium", seed: 505, height: 12, edit: (o) => fuller(o, { count: 30, size: 3.2 }) },
    { name: "olive_1", preset: "Oak Small", seed: 7002, height: 3.6, edit: (o) => olive(o) },
    { name: "olive_2", preset: "Oak Small", seed: 7004, height: 3.4, edit: (o) => olive(o, { leaves: { count: 24 } }) },
    { name: "olive_3", preset: "Oak Small", seed: 7003, height: 4.2, edit: (o) => olive(o, { branch: { children: { 0: 3 } } }) },
    { name: "bush_1", preset: "Bush 1", seed: 9101, height: 1.6 },
    { name: "bush_3", preset: "Bush 3", seed: 9303, height: 1.8 },
];

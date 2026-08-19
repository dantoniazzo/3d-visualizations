"""Seamless tiling textures, generated with numpy.

These replace the Blender node graphs at export time. A node graph cannot go
into a glTF file — the exporter can only write a constant colour or an image —
so the patterns are regenerated here as real images that tile, and the
geometry is given world-space box UVs scaled to each pattern's period.

Every generator returns a float RGB array of shape (SIZE, SIZE, 3) in linear
space, and every one is seamless by construction: coordinates wrap with the
modulo operator rather than running off the edge.
"""

import numpy as np

SIZE = 512


def _rng(seed_text):
    """Deterministic per-material seed, so a rebuild is byte-identical."""
    return np.random.default_rng(abs(hash(seed_text)) % (2**32))


def _srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _tile_noise(rng, cells, octaves=4, size=SIZE):
    """Value noise that wraps at the tile edge.

    Each octave samples a `cells x cells` grid of random values and bilinearly
    upsamples it, taking the neighbouring cell modulo `cells` — which is what
    makes the right edge continue into the left.
    """
    out = np.zeros((size, size))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        c = max(2, cells * 2 ** o)
        grid = rng.random((c, c))

        t = np.linspace(0, c, size, endpoint=False)
        i0 = np.floor(t).astype(int) % c
        i1 = (i0 + 1) % c
        f = t - np.floor(t)
        f = f * f * (3 - 2 * f)                      # smoothstep

        a = grid[np.ix_(i0, i0)]
        b = grid[np.ix_(i0, i1)]
        c2 = grid[np.ix_(i1, i0)]
        d = grid[np.ix_(i1, i1)]
        fx = f[None, :]
        fy = f[:, None]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) +
                      (c2 * (1 - fx) + d * fx) * fy)
        norm += amp
        amp *= 0.5
    return out / norm


def _fill(colour):
    return np.ones((SIZE, SIZE, 3)) * np.asarray(colour, dtype=np.float64)


# ---------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------

def planks(base, grain, gap, rows=12, stagger=0.5, seed="planks"):
    """Board flooring, `rows` boards across the tile, running horizontally.

    Everything is computed from continuous coordinates taken modulo the tile,
    so the pattern meets itself on all four edges. Slicing by integer row
    instead leaves the last course a different height from the first and puts
    a visible line across every repeat.
    """
    rng = _rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]

    ry = yy / SIZE * rows
    row = np.floor(ry).astype(int)
    ly = ry - row                                   # 0..1 down the board

    # The end-joint stagger has to return to zero after `rows` rows or the
    # tile will not line up with its own copy.
    step = max(1, int(round(stagger * rows)))
    offset = ((row * step) % rows) / rows
    lx = ((xx / SIZE) + offset) % 1.0

    tone = 1.0 + (rng.random(rows) - 0.5) * 0.10
    img = np.ones((SIZE, SIZE, 3)) * np.asarray(base)
    img *= tone[row][..., None]

    g = _tile_noise(rng, 3, 4) * 0.5 + _tile_noise(rng, 26, 2) * 0.5
    img = img * (1 - 0.22 * g[..., None]) + np.asarray(grain) * (0.22 * g[..., None])

    # Long edges between boards, and two end joints per board.
    edge = (ly < 0.030) | (ly > 0.970)
    joint = (np.abs(lx - 0.0) < 0.004) | (np.abs(lx - 0.5) < 0.004) | (lx > 0.996)
    img[edge | joint] = np.asarray(gap)
    return img


def tiles(base, grout, cols=3, rows=3, variation=0.06, grout_px=None, seed="tiles"):
    rng = _rng(seed)
    img = _fill(grout)
    gw = grout_px if grout_px is not None else max(2, int(SIZE * 0.010))

    for c in range(cols):
        for r in range(rows):
            x0 = int(round(c * SIZE / cols)) + gw
            x1 = int(round((c + 1) * SIZE / cols)) - gw
            y0 = int(round(r * SIZE / rows)) + gw
            y1 = int(round((r + 1) * SIZE / rows)) - gw
            if x1 <= x0 or y1 <= y0:
                continue
            tone = 1.0 + (rng.random() - 0.5) * variation * 2
            img[y0:y1, x0:x1] = np.asarray(base) * tone

    speck = _tile_noise(rng, 40, 2)
    return img * (0.96 + 0.08 * speck[..., None])


def mottle(colour_a, colour_b, cells=4, strength=1.0, seed="mottle"):
    """Broad tonal drift — paint, plaster, render, concrete."""
    rng = _rng(seed)
    n = _tile_noise(rng, cells, 5)
    n = (n - n.min()) / max(1e-6, n.max() - n.min())
    n = 0.5 + (n - 0.5) * strength
    a = np.asarray(colour_a)
    b = np.asarray(colour_b)
    return a * (1 - n[..., None]) + b * n[..., None]


def carpet(base, fleck, seed="carpet"):
    rng = _rng(seed)
    fine = _tile_noise(rng, 90, 2)
    broad = _tile_noise(rng, 5, 3)
    n = np.clip(fine * 0.75 + broad * 0.25, 0, 1)
    a = np.asarray(base)
    b = np.asarray(fleck)
    return a * (1 - n[..., None] * 0.55) + b * (n[..., None] * 0.55)


def rooftiles(base, shade, rows=6, seed="rooftiles"):
    """Overlapping pantiles: scalloped courses, offset row to row."""
    rng = _rng(seed)
    cols = 8
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]

    ry = yy / SIZE * rows
    row = np.floor(ry).astype(int)
    ly = ry - row
    # Alternate courses shift half a tile; `rows` must stay even for the
    # offset to return to zero at the wrap.
    offset = (row % 2) * 0.5
    lx = ((xx / SIZE * cols) + offset) % 1.0

    arch = 0.30 * (1 - 4 * (lx - 0.5) ** 2)
    tone = 1.0 + (rng.random(rows * cols) - 0.5) * 0.18
    idx = (row * cols + np.floor(xx / SIZE * cols).astype(int)) % (rows * cols)

    img = np.ones((SIZE, SIZE, 3)) * np.asarray(shade)
    body = ly > arch
    img[body] = (np.asarray(base) * tone[idx][..., None])[body]
    img[body & (ly <= arch + 0.07)] = np.asarray(shade)
    return img


def grass(base, blade, dark, seed="grass"):
    rng = _rng(seed)
    fine = _tile_noise(rng, 70, 2)
    broad = _tile_noise(rng, 6, 4)
    n = np.clip(fine * 0.6 + broad * 0.4, 0, 1)
    out = np.asarray(dark) * (1 - n[..., None]) + np.asarray(blade) * n[..., None]
    return out * 0.6 + np.asarray(base) * 0.4


GENERATORS = {
    "planks": planks,
    "tiles": tiles,
    "mottle": mottle,
    "carpet": carpet,
    "rooftiles": rooftiles,
    "grass": grass,
}


def generate(gen, params, seed):
    fn = GENERATORS.get(gen)
    if fn is None:
        return None
    return np.clip(fn(seed=seed, **params), 0.0, 1.0)


def to_blender_image(name, rgb):
    """Hand a float RGB array to Blender as a packed, non-colour-managed image."""
    import bpy

    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=False, float_buffer=False)
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=2)
    # Blender's pixel buffer runs bottom-up.
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.pack()
    return img

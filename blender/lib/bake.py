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


def terrazzo(base, chips, density=0.035, seed="terrazzo"):
    """Terrazzo: a pale ground strewn with chips of stone, 1–5 px across."""
    rng = _rng(seed)
    img = _fill(base) * (0.97 + 0.06 * _tile_noise(rng, 6, 3))[..., None]
    chips = [np.asarray(c, dtype=np.float64) for c in chips]
    disks = {}
    for r in range(1, 6):
        dy, dx = np.mgrid[-r:r + 1, -r:r + 1]
        keep = dx * dx + dy * dy <= r * r + (rng.random(dx.shape) - 0.5) * r
        disks[r] = (dy[keep], dx[keep])
    count = int(SIZE * SIZE * density / 12)
    radii = np.minimum(5, 1 + rng.geometric(0.55, count))
    ys, xs = rng.integers(0, SIZE, count), rng.integers(0, SIZE, count)
    which = rng.integers(0, len(chips), count)
    for y, x, r, k in zip(ys, xs, radii, which):
        dy, dx = disks[int(r)]
        img[(y + dy) % SIZE, (x + dx) % SIZE] = chips[k] * (0.9 + 0.2 * rng.random())
    return img


def grain(base, dark, stripes=120, seed="grain"):
    """Wood veneer: fine straight grain running up the image."""
    rng = _rng(seed)
    line = _tile_noise(rng, stripes, 2)[0]          # one row: a stripe pattern across
    broad = _tile_noise(rng, 4, 3)
    fine = _tile_noise(rng, 64, 1)
    n = np.clip(0.55 * line[None, :] + 0.25 * broad + 0.2 * fine, 0, 1)
    a, b = np.asarray(base), np.asarray(dark)
    return a * (1 - n[..., None]) + b * n[..., None]


def twill(base, dark, period=8, contrast=2.2, seed="twill"):
    """A woven twill: fine ribs running diagonally across the image, one every
    `period` px (a divisor of SIZE, so it tiles), soft-edged so they do not
    shimmer, the yarn's slubs running along them and a faint broad drift;
    `contrast` pushes the ribs beyond the two colours (about their mean) so
    the weave still reads from across a room."""
    rng = _rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    phase = 2 * np.pi * ((xx + yy) % period) / period
    rib = (0.5 + 0.5 * np.sin(phase)) ** 1.6
    # Slubs: thicker, lighter or darker runs of the weft, long and level.
    slub = _tile_noise(rng, 96, 2)[:, :1] * (0.4 + 0.6 * _tile_noise(rng, 6, 2))
    fine = _tile_noise(rng, 128, 1)
    broad = _tile_noise(rng, 4, 3)
    n = np.clip(0.62 * rib + 0.18 * (slub - 0.5) + 0.12 * (fine - 0.5) + 0.19, 0, 1)
    n = 0.5 + (n - n.mean()) * contrast
    a, b = np.asarray(base), np.asarray(dark)
    img = a * (1 - n[..., None]) + b * n[..., None]
    return img * (0.97 + 0.06 * broad)[..., None]


def nubbly(base, dark, cells=96, contrast=1.0, seed="nubbly"):
    """Bouclé or a fine basket weave: soft round nubs of yarn a few pixels
    across (`cells` to the tile), darker in the gaps between them, a faint
    over-under basket under them, warped so it never lines up into a grid,
    and a faint broad drift — low contrast, as cloth is, and no grout."""
    rng = _rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    nub = 0.6 * _tile_noise(rng, cells, 2) + 0.4 * _tile_noise(rng, cells * 2, 1)
    nub = (nub - nub.min()) / max(1e-6, nub.max() - nub.min())
    nub = nub * nub * (3 - 2 * nub)
    # The basket, 8 px blocks of ribs turning a quarter each block, its
    # lines wandering a few pixels (a wrapping warp, so it still tiles).
    wx = ((_tile_noise(rng, 12, 2) - 0.5) * 16).astype(int)
    wy = ((_tile_noise(rng, 12, 2) - 0.5) * 16).astype(int)
    u, v = (xx + wx) % SIZE, (yy + wy) % SIZE
    across = (u // 8 + v // 8) % 2 == 0
    rib = np.where(across, np.sin(2 * np.pi * v / 4), np.sin(2 * np.pi * u / 4)) * 0.5 + 0.5
    broad = _tile_noise(rng, 5, 3)
    n = 0.7 * nub + 0.08 * rib + 0.22 * broad
    n = np.clip(0.5 + (n - n.mean()) * 2.0 * contrast, 0, 1)
    a, b = np.asarray(base), np.asarray(dark)
    return a * (1 - n[..., None]) + b * n[..., None]


def linen(base, dark, contrast=1.0, seed="linen"):
    """Plain-woven linen: warp and weft threads a few pixels apart, the
    weft's slubs — thicker, lighter or darker runs a few centimetres long —
    lying across it, and a faint broad drift, so a sheet of it reads as
    cloth in its folds rather than as flat colour."""
    rng = _rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    warp = 0.5 + 0.5 * np.sin(2 * np.pi * xx / 4)
    weft = 0.5 + 0.5 * np.sin(2 * np.pi * yy / 4)
    row = rng.random(SIZE) * 2 - 1
    row = np.sign(row) * np.abs(row) ** 2                   # most threads even, some slubbed
    run = _tile_noise(rng, 24, 2)
    slub = row[:, None] * (run - run.min()) / max(1e-6, run.max() - run.min())   # each slub a run, fading in and out
    broad = _tile_noise(rng, 4, 3)
    n = 0.5 + contrast * (0.7 * slub + 0.14 * (warp - 0.5) + 0.12 * (weft - 0.5) + 0.3 * (broad - 0.5))
    n = np.clip(n, 0, 1)
    a, b = np.asarray(base), np.asarray(dark)
    return a * (1 - n[..., None]) + b * n[..., None]


def heather(base, flecks, density=0.5, seed="heather", width=1, mottle=0.06):
    """Heathered wool felt: a mid ground mottled at a few scales (`mottle`,
    the strength of the patches a centimetre or so across) and strewn with
    short fibres of lighter and darker wool, each 2-7 px long and `width` px
    thick, at random angles, so it reads as fleck, not as stone chips or
    noise."""
    rng = _rng(seed)
    broad = _tile_noise(rng, 6, 3)
    mid = _tile_noise(rng, 40, 2)
    img = _fill(base) * (0.93 + 0.10 * broad + 2 * mottle * (mid - 0.5))[..., None]
    flecks = [np.asarray(c, dtype=np.float64) for c in flecks]
    count = int(SIZE * SIZE * density / (5 * width))
    steps = 7
    x0, y0 = rng.random(count) * SIZE, rng.random(count) * SIZE
    ang = rng.random(count) * np.pi
    ln = 2 + rng.random(count) * 5
    which = rng.integers(0, len(flecks), count)
    tone = 0.88 + 0.24 * rng.random(count)
    t = np.linspace(0, 1, steps)[None, :]
    cols = np.repeat(np.stack([flecks[k] for k in which]) * tone[:, None], steps, axis=0)
    for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1)][:max(1, min(4, width * width))]:
        xs = (x0[:, None] + dx + np.cos(ang)[:, None] * ln[:, None] * t).astype(int) % SIZE
        ys = (y0[:, None] + dy + np.sin(ang)[:, None] * ln[:, None] * t).astype(int) % SIZE
        img[ys.ravel(), xs.ravel()] = cols
    # A felted surface: the fibres half-buried, so soften them into the ground.
    soft = (img + np.roll(img, 1, 0) + np.roll(img, 1, 1)) / 3
    return img * 0.6 + soft * 0.4


GENERATORS = {
    "terrazzo": terrazzo,
    "grain": grain,
    "twill": twill,
    "nubbly": nubbly,
    "linen": linen,
    "heather": heather,
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

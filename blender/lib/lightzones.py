"""Each room's own part of the baked lightmap, and its own way of holding
its light in 8 bits (blender/bake_public.py's write_rooms).

A lightmap written with one scale for the whole atlas (encode) is scaled
to the sunlit garden: a room lit through its windows, a tenth to a
hundredth as bright, is left 14 to 20 of the 255 levels — a step of 7 to
9% of its light each — and the lossy WebP then errs by blocks of those
steps, which the view, exposing the room 4 to 32 times, shows as
rectangular patches tinted pink and green. So the lightmap is written a
second time with each room's rectangle of the atlas held its own way
(`room_curve`): its light's logarithm, from next to nothing up to the
brightest texel it has — a step of 2 to 3% of the light everywhere, a
patch of sun and the shade beside it alike — and its colour stretched
(`room_gain`) to use the range a lightmap's faint colour leaves empty.
The public view opens each room's part back out as it draws the house's
light into one lightmap (frontend/Experience/World/LightResolver.js); the
first, one-scale lightmap is still written beside it, for a view that
does not (lit live, a device that cannot, a build from before this).

Which texels are a room's is `regions`: shared/lightRegions.js's
lightRegions over again, texel for texel — scripts/test-light-regions.mjs
holds the two against each other, and runs this file for it:

    python3 blender/lib/lightzones.py < zones.json     ({"zones": …, "size": 4096} → the regions, as JSON)

No bpy here, and numpy only inside what needs it, so that runs anywhere.
"""
import json
import math
import sys

#: How far beyond its rectangle a room's part may reach, in texels of the
#: brightness, and the least share of a texel beside it that counts
#: (shared/lightRegions.js's REACH and SLACK).
REACH = 8
SLACK = 0.01

#: A room's curve turns from straight to logarithmic at its middle light
#: over this: below that, where a step is no longer a share of the light,
#: there is nothing to see.
KNEE = 8
#: How far a room's colour is stretched, the most first: by the largest of
#: these that keeps all but its strongest thousandth inside the 8 bits.
GAINS = (4, 2, 1)
#: The most of the colour's range (±0.5 about its zero) a stretched colour may take.
GAIN_ROOM = 0.45
#: The name the public view knows the curve by.
ENCODING = "log"


def regions(zones, size):
    """Each room's own part of the atlas for a lightmap `size` texels
    square, from its rectangles ([u, v, width, height], v up — as bake.json
    has them, rounded as it rounds them): {zone: {"luma": [x0, y0, x1, y1],
    "chroma": [...]}}, in texels of the brightness and of the colour (half
    the size), rows from the TOP as the files and the view have them. None
    if two rooms lie too close.

    shared/lightRegions.js's lightRegions, line for line: the view draws
    each room's part by it, so a texel given to another room here would be
    opened out with the wrong room's curve."""
    rooms = [(zone, [u * size, (1 - v - h) * size, (u + w) * size, (1 - v) * size]) for zone, (u, v, w, h) in zones.items()]

    def clash(a, b):
        return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]

    def lay(k, side):
        reach = REACH * k
        parts = []
        for _, box in rooms:
            edge = [value * k for value in box]
            need = [
                max(0, math.floor(edge[0] - 0.5 + SLACK)),
                max(0, math.floor(edge[1] - 0.5 + SLACK)),
                min(side, math.floor(edge[2] + 0.5 - SLACK) + 1),
                min(side, math.floor(edge[3] + 0.5 - SLACK) + 1),
            ]
            rect = [max(0, need[0] - reach), max(0, need[1] - reach), min(side, need[2] + reach), min(side, need[3] + reach)]
            parts.append({"edge": edge, "need": need, "rect": rect})
        pairs = []
        for i in range(len(parts)):
            for j in range(i + 1, len(parts)):
                a, b = parts[i]["edge"], parts[j]["edge"]
                apart = [max(b[0] - a[2], a[0] - b[2]), max(b[1] - a[3], a[1] - b[3])]
                axis = 0 if apart[0] >= apart[1] else 1
                if apart[axis] < 0:
                    return None
                if clash(parts[i]["rect"], parts[j]["rect"]):
                    pairs.append((apart[axis], parts[i], parts[j], axis))
        # (Stable, as the view's sort is: pairs as far apart keep their order.)
        pairs.sort(key=lambda pair: pair[0])
        for _, a, b, axis in pairs:
            if not clash(a["rect"], b["rect"]):
                continue
            low, high = (a, b) if a["edge"][axis] <= b["edge"][axis] else (b, a)
            cut = math.floor((low["edge"][axis + 2] + high["edge"][axis]) / 2 - 0.5) + 1
            low["rect"][axis + 2] = min(low["rect"][axis + 2], cut)
            high["rect"][axis] = max(high["rect"][axis], cut)
        return parts

    luma = lay(1, size)
    chroma = lay(0.5, size / 2)
    if luma is None or chroma is None:
        return None
    for part in luma:
        need, rect = part["need"], part["rect"]
        if rect[0] > need[0] or rect[1] > need[1] or rect[2] < need[2] or rect[3] < need[3]:
            return None
    for part in chroma:
        rect = part["rect"]
        if rect[0] >= rect[2] or rect[1] >= rect[3]:
            return None
    return {zone: {"luma": [int(c) for c in l["rect"]], "chroma": [int(c) for c in c_["rect"]]}
            for (zone, _), l, c_ in zip(rooms, luma, chroma)}


def rows(rect, height):
    """A region's rows — counted from the top, as `regions` has them — in
    an array whose first row is the bottom one, as Blender's images are:
    (y0, y1, x0, x1) to slice it by."""
    x0, y0, x1, y1 = rect
    return height - y1, height - y0, x0, x1


def room_curve(light, lit, least=0.0):
    """How a room's light is held: (knee, top). A texel's light L is
    stored as ln(1 + L / knee) / ln(1 + top / knee) — straight up to about
    `knee`, an eighth of the room's middle light, and by its logarithm
    from there to `top`, just over the brightest texel the room's part of
    the atlas has. `light` is that part (h × w × 3), `lit` its texels on a
    surface and not covered. `least`: the knee is never under this — light
    the view never shows as more than black is not worth a share of the
    levels each (nor of the file: a dark room's grain, held by its
    logarithm, is most of what a night's lightmap would weigh). Rounded as
    bake.json keeps them, so the view opens it out by the very numbers it
    was written with."""
    import numpy as np

    top = max(float(light.max()) * 1.02 if light.size else 0.0, 1e-4)
    brightness = light.max(axis=2)[lit]
    brightness = brightness[brightness > 1e-5]
    middle = float(np.median(brightness)) if brightness.size else top
    knee = max(min(middle / KNEE, top / 4), top / 65536, least)
    return float(f"{knee:.6g}"), float(f"{top:.6g}")


def curve(light, knee, top):
    """A room's light as stored (room_curve): 0 to 1."""
    import numpy as np

    return np.clip(np.log1p(np.maximum(light, 0.0) / knee) / math.log1p(top / knee), 0.0, 1.0)


def room_gain(difference):
    """How far a room's colour — the two differences of its stored light,
    about zero — is stretched (GAINS)."""
    import numpy as np

    if not difference.size:
        return GAINS[-1]
    most = float(np.percentile(np.abs(difference), 99.9))
    for gain in GAINS:
        if most * gain <= GAIN_ROOM:
            return gain
    return GAINS[-1]


def encode_rooms(rgb, squeezed, parts, curves, gains=None, lit=None):
    """A lightmap with each room's part held its own way, as the two
    pictures the view loads: its brightness (h × w) and its colour's two
    differences at half the size (h/2 × w/2 × 2, about zero, stretched) —
    before the 8 bits. `rgb` is the light, `squeezed` the same as the
    one-scale lightmap stores it (what is outside every room's part, and
    every room without a curve, stays that); `parts` each room's part at
    this size (regions); `curves` {zone: (knee, top)}. `gains` {zone:
    gain} as an earlier size found them (a phone's copy is stretched as
    the lightmap is), else found here, from the texels `lit`, and returned
    with the two pictures."""
    import numpy as np

    h, w, _ = rgb.shape
    weights = (0.25, 0.5, 0.25)
    luma = squeezed @ np.array(weights, dtype=squeezed.dtype)
    # The colour of a texel is its room's by where the COLOUR's texel lies — a texel of it is four of the brightness,
    # and at a room's edge those are not all the room's own.
    colour = np.stack([squeezed[..., 0] / 2 - squeezed[..., 2] / 2, -squeezed[..., 0] / 4 + squeezed[..., 1] / 2 - squeezed[..., 2] / 4], axis=-1)
    chroma = colour.reshape(h // 2, 2, w // 2, 2, 2).mean(axis=(1, 3))
    found = {}
    for zone, (knee, top) in curves.items():
        part = parts.get(zone)
        if part is None:
            continue
        y0, y1, x0, x1 = rows(part["luma"], h)
        stored = curve(rgb[y0:y1, x0:x1], knee, top)
        luma[y0:y1, x0:x1] = stored @ np.array(weights, dtype=stored.dtype)
        cy0, cy1, cx0, cx1 = rows(part["chroma"], h // 2)
        stored = curve(rgb[2 * cy0:2 * cy1, 2 * cx0:2 * cx1], knee, top)
        own = np.stack([stored[..., 0] / 2 - stored[..., 2] / 2, -stored[..., 0] / 4 + stored[..., 1] / 2 - stored[..., 2] / 4], axis=-1)
        own = own.reshape(cy1 - cy0, 2, cx1 - cx0, 2, 2).mean(axis=(1, 3))
        if gains is not None:
            gain = gains.get(zone, 1)
        else:
            seen = lit[2 * cy0:2 * cy1, 2 * cx0:2 * cx1].reshape(cy1 - cy0, 2, cx1 - cx0, 2).any(axis=(1, 3)) if lit is not None else np.ones(own.shape[:2], dtype=bool)
            gain = room_gain(own[seen])
            found[zone] = gain
        chroma[cy0:cy1, cx0:cx1] = own * gain
    return luma, chroma, (gains if gains is not None else found)


if __name__ == "__main__":
    asked = json.load(sys.stdin)
    json.dump(regions(asked["zones"], asked["size"]), sys.stdout)

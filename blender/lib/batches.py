"""Which of a bake's doors — and, were it asked, which of its switches —
can be baked in one pass (blender/bake_public.py's bake_door_states and
its bake of the switches).

Each room door is baked shut on its own, into the rooms either side of it,
and each switch's light alone, into the rooms it reaches. Every pass hands
the whole scene to Cycles — seconds of a small house, far more of a site
of three — so a pass a door is mostly hand-over. But doors in parts of the
site that no opening joins (`parts`: a flat and the flat next door, two
buildings) dim no room in common, and can be shut in the same pass, the
pass taken apart by room afterwards: each room's texels are those of its
own door shut, as if it had been baked alone. That is the rule (`joined`).

Within a part it does not hold: with `joined` false two things share a
pass whenever no room of one is a room of the other or opens into one
(`links`: doors, doorways, stairwells, rooms with no wall between), and
measured so on one house a front door shut in the pass of the loft
bathroom's door dimmed the loft, two openings off. And switches are not
lit together at all by a bake that is kept — bake_public.py's PASSES says
what that did to their light; `sees` is for that experiment: a lamp with a
straight line to a room of another's, through windows or down a run of
doorways (bake_public.py's lamp_sight).

Plain Python, no bpy: `python3 blender/lib/batches.py < items.json` prints
the passes for {"items": [[zone, …], …], "links": {zone: [zone, …]},
"joined": true}.
"""
import json
import sys


def reach(zones, links):
    """The rooms and every room that opens off one of them."""
    out = set(zones)
    for zone in zones:
        out.update(links.get(zone, ()))
    return out


def parts(links):
    """The parts of a site that openings join, however many rooms lie
    between: each room's part, as the name of one room in it. A flat is
    one part, the flat next door another, a house with a stair all one."""
    part = {}
    for start in sorted(set(links) | {room for others in links.values() for room in others}):
        if start in part:
            continue
        part[start] = start
        stack = [start]
        while stack:
            room = stack.pop()
            for other in links.get(room, ()):
                if other not in part:
                    part[other] = start
                    stack.append(other)
    return part


def clashes(items, links, sees=None, joined=False):
    """For each item (its rooms), the items it cannot share a pass with:
    those with a room of theirs in its rooms or opening into one — or, with
    `joined`, anywhere in the same part of the site (parts)."""
    rooms = [set(item) for item in items]
    if joined:
        part = parts(links)
        wide = [{part.get(room, room) for room in item} for item in items]
        near = wide
    else:
        wide = [reach(item, links) for item in items]
        near = rooms
    clash = [set() for _ in items]
    for a in range(len(items)):
        for b in range(a + 1, len(items)):
            if wide[a] & near[b] or wide[b] & near[a] or (sees is not None and (sees(a, b) or sees(b, a))):
                clash[a].add(b)
                clash[b].add(a)
    return clash


def batches(items, links, sees=None, most=None, joined=False):
    """The items' indices in as few passes as a greedy colouring finds:
    the item with the most passes already closed to it first (then the one
    that clashes with the most, then the first), into the first pass open
    to it with room left (`most` to a pass). The same every time for the
    same input; each pass in the items' order, the passes by their first
    item."""
    clash = clashes(items, links, sees, joined)
    pass_of = {}
    sizes = []
    left = set(range(len(items)))
    while left:
        closed = {i: {pass_of[j] for j in clash[i] if j in pass_of} for i in left}
        i = min(left, key=lambda i: (-len(closed[i]), -len(clash[i]), i))
        k = next((k for k, size in enumerate(sizes) if k not in closed[i] and (most is None or size < most)), len(sizes))
        if k == len(sizes):
            sizes.append(0)
        pass_of[i] = k
        sizes[k] += 1
        left.remove(i)
    passes = [[] for _ in sizes]
    for i in sorted(pass_of):
        passes[pass_of[i]].append(i)
    return sorted(passes, key=lambda members: members[0])


if __name__ == "__main__":
    asked = json.load(sys.stdin)
    json.dump(batches(asked["items"], asked.get("links", {}), most=asked.get("most"), joined=asked.get("joined", False)), sys.stdout)

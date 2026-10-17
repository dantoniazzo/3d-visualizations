# seat-sweep.py: reads seat-sweep.js's files (app-notes.md, Sitting: testing). A seat counts in a column where any frame
# of that part met furniture by more than the sweep's own depth (2.5 cm), the seat's own piece left out by the sweep's
# rule (ownOf). Seats are grouped by their piece's catalogue id (or with --by kind, by the seat's kind).
#   python3 <skill>/seat-sweep.py kinds <sweep.json> [...]              per kind of seat: how many seats meet something
#                                                                     seated, sitting down, standing up, on the walk to
#                                                                     and from, any, deeper than 10 cm, sat sideways
#   python3 <skill>/seat-sweep.py compare <before.json> <after.json> [<before> <after> ...]
#                                                                     the same columns before -> after, the median worst
#                                                                     depth per part, the plans' times, how each sat/rose
#   python3 <skill>/seat-sweep.py per-seat [-v] <before.json> <after.json>   seat by seat: worse (deeper by more than
#                                                                     1 cm, or a contact that was not there), better, the
#                                                                     same, clear in both; -v lists them
#   python3 <skill>/seat-sweep.py detail <sweep.json>                 the phases' speeds (root and hips), the largest
#                                                                     one-frame moves, walking sideways (> 45 deg), the
#                                                                     contacts by phase and plan, end spots not free
#   python3 <skill>/seat-sweep.py self <self.json> [...]              __seats.self's files: limbs inside the seat's own
#                                                                     piece above its cushion, by piece and way sat
# Ladonia, 2026-10-17: 214 seats a run, four runs (editor and public view, each skin) per pass.
import collections, json, statistics, sys

args = sys.argv[1:]
BY = "piece"
if "--by" in args:
    i = args.index("--by")
    BY = args[i + 1]
    del args[i:i + 2]
verbose = "-v" in args
args = [a for a in args if a != "-v"]
if not args:
    sys.exit(__doc__ if __doc__ else "usage: seat-sweep.py kinds|compare|per-seat|detail|self <files>")
cmd, files = args[0], args[1:]
SIT_DOWN = ("sitdown-foot", "sitdown-clip", "settle")
STAND_UP = ("standup-foot", "standup-clip", "settle", "fade")
PARTS = {"seated": ("sit", ("seated",)), "sit down": ("sit", SIT_DOWN), "stand up": ("rise", STAND_UP), "walk/turn to": ("sit", ("walk", "turn")), "walk/turn off": ("rise", ("walk", "turn"))}


def rows(path):
    with open(path) as f:
        return [r for r in json.load(f) if not r.get("excluded") and r.get("sit")]


def by_id(path):
    return {r["id"]: r for r in rows(path)}


def group(r):
    return (r.get("kind") if BY == "kind" else r.get("piece")) or "?"


def has(r, part):
    side, keys = PARTS[part]
    return any(k in r[side]["hits"] for k in keys)


def depth(r, part):
    side, keys = PARTS[part]
    return max((r[side]["hits"][k]["worst"]["depth"] for k in keys if k in r[side]["hits"]), default=0)


def deep(r, d=0.1):
    return any(h["worst"]["depth"] > d for s in ("sit", "rise") for h in r[s]["hits"].values())


def anyhit(r):
    return bool(r["sit"]["hits"]) or bool(r["rise"]["hits"])


def cells(rs):
    return [sum(1 for r in rs if has(r, c)) for c in PARTS] + [sum(1 for r in rs if anyhit(r)), sum(1 for r in rs if deep(r))]


COLS = list(PARTS) + ["any", ">10cm any"]

if cmd == "kinds":
    for p in files:
        d = rows(p)
        g = collections.defaultdict(list)
        for r in d:
            g[group(r)].append(r)
        print(f"\n{p.split('/')[-1]}: {len(d)} seats")
        print(f"  {'kind':28s} {'n':>3s} " + " ".join(f"{c:>13s}" for c in COLS) + "  sideways")
        for k in sorted(g) + ["all"]:
            rs = d if k == "all" else g[k]
            print(f"  {k:28s} {len(rs):3d} " + " ".join(f"{v:13d}" for v in cells(rs)) + f"  {sum(1 for r in rs if r.get('side')):8d}")

elif cmd == "compare":
    for before, after in zip(files[0::2], files[1::2]):
        B, A = by_id(before), by_id(after)
        ids = sorted(set(B) & set(A))
        print(f"\n{before.split('/')[-1]} -> {after.split('/')[-1]}: {len(ids)} seats in both (before {len(B)}, after {len(A)})")
        print(f"  {'kind':28s} {'n':>3s} " + " ".join(f"{c:>14s}" for c in COLS) + "  sideways")
        g = collections.defaultdict(list)
        for i in ids:
            g[group(A[i])].append(i)
        for k in sorted(g) + ["all"]:
            rs = ids if k == "all" else g[k]
            b, a = cells([B[i] for i in rs]), cells([A[i] for i in rs])
            print(f"  {k:28s} {len(rs):3d} " + " ".join(f"{x:>6d} -> {y:<4d}" for x, y in zip(b, a)) + f"  {sum(1 for i in rs if A[i].get('side'))}")
        med = lambda R, c: round(statistics.median([depth(R[i], c) for i in ids if has(R[i], c)]), 3) if any(has(R[i], c) for i in ids) else None
        print("  median worst depth (m) of seats in contact, before/after:", {c: (med(B, c), med(A, c)) for c in PARTS})
        ms = [A[i]["planMs"] for i in ids if A[i].get("planMs")]
        s0 = sorted(x[0] for x in ms if x[0] is not None)
        s1 = sorted(x[1] for x in ms if x[1] is not None)
        if s0 and s1:
            print(f"  plan ms: sit median {s0[len(s0) // 2]} p90 {s0[int(len(s0) * .9)]} max {s0[-1]} | up median {s1[len(s1) // 2]} p90 {s1[int(len(s1) * .9)]} max {s1[-1]}")
        print("  sit by", dict(collections.Counter(A[i].get("sitBy") for i in ids)), "rise by", dict(collections.Counter(A[i].get("riseBy") for i in ids)), "| before", dict(collections.Counter(B[i].get("sitBy") for i in ids)), dict(collections.Counter(B[i].get("riseBy") for i in ids)))
        print("  not seated:", [i for i in ids if not A[i].get("seatedOk")], " end not free:", [i for i in ids if not A[i].get("endFree")])

elif cmd == "per-seat":
    TOL = 0.01

    def worst(r, part):
        side, keys = PARTS[part]
        hs = [r[side]["hits"][k] for k in keys if k in r[side]["hits"]]
        if not hs:
            return (0.0, 0, None)
        h = max(hs, key=lambda x: x["worst"]["depth"])
        return (h["worst"]["depth"], sum(x["n"] for x in hs), h["worst"].get("what"))

    for before, after in zip(files[0::2], files[1::2]):
        B, A = by_id(before), by_id(after)
        ids = sorted(set(B) & set(A))
        print(f"\n{before.split('/')[-1]} -> {after.split('/')[-1]}: {len(ids)} seats")
        for part in PARTS:
            worse, better, same, clear = [], [], 0, 0
            sb = sa = 0.0
            for i in ids:
                (db, nb, wb), (da, na, wa) = worst(B[i], part), worst(A[i], part)
                sb += db
                sa += da
                if db == 0 and da == 0:
                    clear += 1
                elif da > db + TOL:
                    worse.append((round(da - db, 3), i, round(db, 3), round(da, 3), wb, wa, nb, na))
                elif db > da + TOL:
                    better.append((round(db - da, 3), i, round(db, 3), round(da, 3), wb, wa, nb, na))
                else:
                    same += 1
            cb = sum(1 for i in ids if worst(B[i], part)[0] > 0)
            ca = sum(1 for i in ids if worst(A[i], part)[0] > 0)
            print(f"  {part:13s} in contact {cb:3d} -> {ca:3d} | worse {len(worse):3d} better {len(better):3d} same {same:3d} clear both {clear:3d} | summed worst {sb:.2f} -> {sa:.2f} m")
            if verbose and worse:
                print("     worse:", sorted(worse, reverse=True)[:12])
            if verbose and better:
                print("     better:", sorted(better, reverse=True)[:6])
        print("  sideways after:", dict(collections.Counter((A[i].get("piece"), A[i].get("side")) for i in ids if A[i].get("side"))))
        print("  end not free after:", [i for i in ids if not A[i].get("endFree")], "| not seated:", [i for i in ids if not A[i].get("seatedOk")])

elif cmd == "detail":
    d = rows(files[0])
    print(files[0], len(d), "seats; sit/rise by:", dict(collections.Counter((r.get("sitBy"), r.get("riseBy")) for r in d)))
    G = 0.025
    for part in ("sit", "rise"):
        phases = collections.Counter(k for r in d for k in r.get(part, {}).get("speed", {}))
        print(f"\n== {part}: phases seen {dict(phases)}")
        for ph in phases:
            sp = sorted(((r[part]["speed"][ph][0], r["id"]) for r in d if ph in r[part]["speed"]), reverse=True)
            hp = sorted(((r[part]["hips"][ph][0], r["id"]) for r in d if ph in r[part].get("hips", {})), reverse=True)
            print(f"  {ph:14s} root max {sp[0]} p90 {sp[len(sp) // 10][0]} | hips max {hp[0] if hp else None}")
        print("  largest one-frame root moves:", sorted(((r[part]["jump"][0], r["id"], r[part]["jump"][2] if len(r[part]["jump"]) > 2 else None) for r in d), reverse=True)[:5])
        side = sorted(((r[part]["sideways"][0], r["id"], r[part]["sideways"][2] if len(r[part]["sideways"]) > 2 else None) for r in d), reverse=True)
        sd = [x for x in side if x[0] > 45]
        print("  sideways > 45 deg, by phase:", dict(collections.Counter(x[2] for x in sd)), [x for x in sd if x[2] != "settle"][:12])
        print("  largest hips jumps:", sorted(((r[part]["hipsJump"][0], r["id"], r[part]["hipsJump"][2] if len(r[part]["hipsJump"]) > 2 else None) for r in d), reverse=True)[:5])
        for ph in phases:
            for plan in ("clip", "walk", "fade"):
                key = "sitBy" if part == "sit" else "riseBy"
                h = sorted(((r[part]["hits"][ph]["worst"]["depth"], r["id"], r.get("piece"), r[part]["hits"][ph]["worst"]["what"], r[part]["hits"][ph]["worst"]["limb"]) for r in d if r.get(key) == plan and ph in r[part]["hits"] and r[part]["hits"][ph]["worst"]["depth"] > G), reverse=True)
                n = sum(1 for r in d if r.get(key) == plan)
                if h:
                    print(f"  contacts > {G} in {ph} ({plan} plans, {len(h)} of {n}):", h[:6])
    print("\nend spots not free:", [r["id"] for r in d if not r.get("endFree")][:10])
    print("figure off the capsule at the end:", sorted(((r["figureToCapsule"], r["id"]) for r in d), reverse=True)[:5])
    print("not seated:", [r["id"] for r in d if not r.get("seatedOk")])

elif cmd == "self":
    for p in files:
        with open(p) as f:
            d = json.load(f)
        g = collections.defaultdict(list)
        for r in d:
            if not r.get("error"):
                g[(r["piece"], "sideways" if r["side"] else "forward")].append(r)
        print("\n" + p.split("/")[-1])
        for k in sorted(g):
            rs = g[k]
            dep = [(r["worst"] or {}).get("depth", 0) for r in rs]
            limbs = collections.Counter((r["worst"] or {}).get("limb") for r in rs if (r["worst"] or {}).get("depth", 0) > 0.05)
            print(f"  {k[0]:28s} {k[1]:9s} n={len(rs):3d}  >2.5cm {sum(x > 0.025 for x in dep):3d}  >5cm {sum(x > 0.05 for x in dep):3d}  >10cm {sum(x > 0.1 for x in dep):3d}  max {max(dep):.3f}  {dict(limbs)}")
else:
    sys.exit(f"unknown command {cmd}: kinds | compare | per-seat | detail | self")

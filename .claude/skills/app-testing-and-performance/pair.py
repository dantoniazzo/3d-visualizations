# pair.py: two tabs' timing rows paired round by round at each spot (pair-time.js's __pair.save, or any rows of
# { round, spot, render, cpu, full, gpu, draws | calls, load }): each side's medians and the median of the
# round-by-round differences (b - a), on which the machine's drift falls alike (measuring.md).
#   python3 <repo>/.claude/skills/app-testing-and-performance/pair.py <a> <b> [label-a] [label-b] [--dir <frames-dir>]
# <a> and <b> are JSON files, or names looked up as <frames-dir>/<name>.json (default: ./frames, the sink's folder when
# run from the scratch folder). Run each comparison both ways round and read both; `load` is the range of the
# one-minute load average over the paired rounds.
import json, os, statistics as st, sys

args = sys.argv[1:]
folder = "frames"
if "--dir" in args:
    i = args.index("--dir")
    folder = args[i + 1]
    del args[i:i + 2]
if len(args) < 2:
    sys.exit("usage: pair.py <a> <b> [label-a] [label-b] [--dir <frames-dir>]")


def load(name):
    path = name if os.path.isfile(name) else os.path.join(folder, name + ".json")
    with open(path) as f:
        return json.load(f)


a, b = args[0], args[1]
la = args[2] if len(args) > 2 else os.path.basename(a).removesuffix(".json")
lb = args[3] if len(args) > 3 else os.path.basename(b).removesuffix(".json")
A, B = load(a), load(b)
ia = {(r["spot"], r["round"]): r for r in A}


def med(xs):
    xs = [x for x in xs if x is not None]
    return st.median(xs) if xs else None


def f(x):
    return "  -  " if x is None else "%5.2f" % x


def d(x):
    return "  -  " if x is None else "%+.2f" % x


print(f"{'spot':12s} | {'render ' + la:>13s} {'render ' + lb:>13s} {'Δ paired':>8s} | {'full ' + la:>11s} {'full ' + lb:>11s} {'Δ':>6s} | {'cpu':>11s} | {'gpu':>11s} | draws       | rounds Δrender")
for spot in dict.fromkeys(r["spot"] for r in A):
    rows = [(ia[(r["spot"], r["round"])], r) for r in B if r["spot"] == spot and (r["spot"], r["round"]) in ia]
    if not rows:
        continue
    g = lambda k, i: med([x[i].get(k) for x in rows])
    pd = lambda k: med([y[k] - x[k] for x, y in rows if x.get(k) is not None and y.get(k) is not None])
    dr = lambda r: r.get("draws", r.get("calls"))
    diffs = " ".join("%+.1f" % (y["render"] - x["render"]) for x, y in rows)
    loads = [x.get("load") for x, _ in rows if x.get("load") is not None] + [y.get("load") for _, y in rows if y.get("load") is not None]
    span = "%.1f-%.1f" % (min(loads), max(loads)) if loads else "-"
    print(f"{spot:12s} | {f(g('render', 0)):>13s} {f(g('render', 1)):>13s} {d(pd('render')):>8s} | {f(g('full', 0)):>11s} {f(g('full', 1)):>11s} {d(pd('full')):>6s} | {f(g('cpu', 0))}->{f(g('cpu', 1))} | {f(g('gpu', 0))}->{f(g('gpu', 1))} | {dr(rows[0][0])}->{dr(rows[0][1])} | n={len(rows)} [{diffs}] load {span}")

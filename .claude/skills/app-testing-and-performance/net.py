# net.py: what another visitor saw of the visitor, from two real pages on the same test server (others.js's send and
# recv): the receiver's rows [t, x, y, z, eyes, clip, pose move, fresh, messages] matched to the sender's rows
# [t, x, y, z, eyes, clip] by the exact root sent (the server relays it unchanged). It gives the remote's eyes against the
# water and the sender's own, the frames under and how deep, whether the clip agrees with the sender frame it was sent
# from, the delivery (new positions a second, frames between them), the still frames, and the stretches under the
# water (../visitor-interactions/swimming.md, Others).
#   python3 <repo>/.claude/skills/app-testing-and-performance/net.py <send.json> <recv.json>
import json, sys, collections, statistics
if len(sys.argv) < 3:
    sys.exit("usage: net.py <send.json> <recv.json>")
send = json.load(open(sys.argv[1])); recv = json.load(open(sys.argv[2]))
if not recv or not send:
    sys.exit("no rows: was the remote seen swimming (recv's `from` the sender's socket id)?")
key = lambda r: (r[1], r[2], r[3])
idx = {}
for i, s in enumerate(send): idx.setdefault(key(s), i)
m = [(r, idx.get(key(r))) for r in recv]
matched = [(r, send[i]) for r, i in m if i is not None]
sw = [r for r in recv if r[5] in ("swimming", "breaststroke", "treading")]
eyes = [r[4] for r in recv if r[4] is not None]
print(f"recv frames {len(recv)}, matched to a sender frame {len(matched)}; sender frames {len(send)}, clip changes {sum(1 for i in range(1, len(send)) if send[i][5] != send[i-1][5])}")
# (A page without swim-trace.js measures no eyes: its rows carry null, not 0.)
if eyes:
    print(f"remote eyes: min {min(eyes):.3f}, under {sum(e < 0 for e in eyes)} ({100*sum(e < 0 for e in eyes)/len(eyes):.0f}%), under 0.1 m {sum(e < -0.1 for e in eyes)}, under 0.3 m {sum(e < -0.3 for e in eyes)}; median {statistics.median(eyes):.3f}")
else:
    print("remote eyes: none measured (swim-trace.js was not loaded in the receiving page)")
se = [s[4] for s in send if s[4] is not None]
print(f"sender eyes: min {min(se):.3f}, under {sum(e < 0 for e in se)}" if se else "sender eyes: none measured (swim-trace.js was not loaded in the sending page)")
same = sum(1 for r, s in matched if r[5] == s[5])
print(f"same clip name as the sender frame it was sent from: {same} of {len(matched)}")
moves = [r[6] for r in recv if r[6] is not None] or [0.0]
print(f"pose move per frame (root frame): min {min(moves):.4f} median {statistics.median(moves):.3f} max {max(moves):.3f}; still frames (< 1e-6) {sum(x < 1e-6 for x in moves)}")
fresh = [i for i, r in enumerate(recv) if r[7]]
gaps = collections.Counter(min(12, b - a) for a, b in zip(fresh, fresh[1:]))
dur = max(0.001, (recv[-1][0] - recv[0][0]) / 1000)
print(f"new positions {len(fresh)} in {dur:.1f} s ({len(fresh)/dur:.1f}/s); frames between new positions {dict(sorted(gaps.items()))}")
# runs of frames under
runs = []; n = 0
for e in eyes:
    if e < 0: n += 1
    elif n: runs.append(n); n = 0
if n: runs.append(n)
print(f"stretches under the water: {len(runs)}, longest {max(runs) if runs else 0} frames, median {statistics.median(runs) if runs else 0}")

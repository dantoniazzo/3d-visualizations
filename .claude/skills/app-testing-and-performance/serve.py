# serve.py: the tools server, with the baton that tabs timing in turns pass between them (measuring.md).
# Start it beside the sink (sink.py, 3199), in the background:
#   python3 <repo>/.claude/skills/app-testing-and-performance/serve.py <out-dir> [port]   (port 3187 as the tools use it)
# Like the sink it serves this folder's files by name (GET /<file>), so a page can load any helper from either, and it
# saves a POST's body as <out-dir>/<name>. Post through window.__realFetch (boot.js keeps it): harness.js and boot.js
# stub a page's other POSTs.
#
# The baton, so that only one tab times at a time and the machine's load falls on both alike:
#   GET /take?me=<tab>&t=<s>     waits until the baton has been GIVEN to <tab> (or to "abort"), or t seconds pass
#                                (default 25), then answers {"holder", "load"}. It does not seize it: check that holder
#                                is you before timing. A tab timing alone gives it to itself first.
#   GET /give?to=<tab>           hands it on (there is no `me`: give?me=… answers 400 and says so). to=abort releases
#                                every waiting take and ready.
#   GET /ready?label=&me=&n=&t=  a rendezvous: waits until n tabs (default 2) have said ready under that label.
#   GET /prog?who=&msg=          a tab's or an agent's progress, kept with the time ("done:<label>", "error:…").
#   GET /status                  {"holder", "prog", "load" (1, 5, 15 min), "now"}.
#   GET /wait?who=a,b&label=&t=  waits until each of `who` has said "done:<label>" (or "error:…"), then status.
#   GET /take?me=__sleep&t=0.02  a ~20 ms wait for a page whose own timers are throttled (fast.js uses it).
# `load` is the one-minute load average: keep it with every timing taken.
import http.server, os, sys, threading, time, json, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) < 2:
    sys.exit("usage: serve.py <out-dir> [port]")
OUT = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 3187
os.makedirs(OUT, exist_ok=True)
cv = threading.Condition()
S = {"holder": "", "prog": {}, "ready": {}, "saved": {}}


class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def say(self, text, code=200, kind="text/plain"):
        data = text.encode() if isinstance(text, str) else text
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_POST(self):
        name = os.path.basename(self.path.split("?")[0].strip("/")) or "data.json"
        n = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(n)
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        with cv:
            S["saved"][name] = time.time()
            cv.notify_all()
        self.say("ok")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        p = u.path.strip("/")
        if p == "take":
            if "me" not in q:
                return self.say("take needs ?me=<tab>", 400)
            end = time.time() + float(q.get("t", 25))
            with cv:
                while S["holder"] not in (q["me"], "abort") and time.time() < end:
                    cv.wait(max(0.01, min(0.05, end - time.time())))
                return self.say(json.dumps({"holder": S["holder"], "load": os.getloadavg()[0]}), kind="application/json")
        if p == "give":
            if "to" not in q:
                return self.say("give takes ?to=<tab> (whoever gets the baton next), not ?me=", 400)
            with cv:
                S["holder"] = q["to"]
                cv.notify_all()
            return self.say(q["to"])
        if p == "ready":
            if "label" not in q or "me" not in q:
                return self.say("ready needs ?label=&me=", 400)
            end = time.time() + float(q.get("t", 25))
            with cv:
                S["ready"].setdefault(q["label"], set()).add(q["me"])
                cv.notify_all()
                while len(S["ready"][q["label"]]) < int(q.get("n", 2)) and S["holder"] != "abort" and time.time() < end:
                    cv.wait(max(0.05, end - time.time()))
                return self.say(json.dumps({"n": len(S["ready"][q["label"]]), "holder": S["holder"]}), kind="application/json")
        if p == "prog":
            with cv:
                S["prog"][q.get("who", "?")] = [q.get("msg", ""), time.strftime("%H:%M:%S")]
                cv.notify_all()
            return self.say("ok")
        if p in ("status", "wait"):
            if p == "wait":
                end = time.time() + float(q.get("t", 100))
                want = [w for w in q.get("who", "").split(",") if w]
                label = q.get("label", "")
                with cv:
                    while not all(S["prog"].get(w, [""])[0] == "done:" + label or S["prog"].get(w, [""])[0].startswith("error:") for w in want) and time.time() < end:
                        cv.wait(max(0.05, end - time.time()))
            with cv:
                return self.say(json.dumps({"holder": S["holder"], "prog": S["prog"], "load": os.getloadavg(), "now": time.strftime("%H:%M:%S")}), kind="application/json")
        path = os.path.join(ROOT, os.path.basename(p))
        if not p or not os.path.isfile(path):
            return self.say("no such file in " + ROOT, 404)
        kind = "application/json" if path.endswith(".json") else "text/javascript"
        with open(path, "rb") as f:
            self.say(f.read(), kind=kind)

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()

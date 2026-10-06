import http.server, os, sys
OUT = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        name = self.path.strip("/") or "frame.jpg"
        name = name.replace("..", "")
        dest = os.path.join(OUT, name)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            self.send_response(411); self.cors(); self.end_headers(); return
        data = self.rfile.read(n)
        open(dest, "wb").write(data)
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b"ok")
    def do_GET(self):
        # The harness and other helpers, from this folder, for a page to load.
        name = os.path.basename(self.path.split("?")[0]) or "harness.js"
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
        if not os.path.isfile(path):
            self.send_response(404); self.cors(); self.end_headers(); return
        self.send_response(200); self.cors()
        self.send_header("Content-Type", "text/javascript"); self.end_headers()
        self.wfile.write(open(path, "rb").read())
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", 3199), H).serve_forever()

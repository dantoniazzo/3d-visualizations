import "dotenv/config";

import path from "path";
import http from "http";
import express from "express";
import cors from "cors";
import compression from "compression";
import { Server } from "socket.io";

import { PORT } from "./config.js";
import { scenesRouter } from "./api/scenes.js";
import { publishRouter } from "./api/publish.js";
import { PUBLISH_DIR } from "./publish/store.js";
import { storageBackend } from "./store/sceneStore.js";
import { registerChat } from "./sockets/chat.js";
import { registerPresence } from "./sockets/presence.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: "*" },
});

app.use(cors());
// JavaScript, JSON and uncompressed model data shrink to a third or less —
// the difference between a phone waiting and not.
app.use(compression());
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        // Worth surfacing: a deployment that meant to use object storage but
        // is silently on the container's own disk will lose every scene on
        // the next restart, and this is the cheapest way to notice.
        storage: storageBackend,
    });
});

app.use("/api/scenes", publishRouter);
app.use("/api/scenes", scenesRouter);

app.use((error, _req, res, _next) => {
    console.error("[api]", error);
    res.status(500).json({ error: error.message || "Internal error." });
});

// Static build. In development Vite serves the frontend and proxies
// /api and /socket.io here, so this only matters for `npm start`.
// Published public views. A version never changes once written; the
// manifest naming the latest does, so it is always revalidated.
app.use(
    "/published",
    express.static(PUBLISH_DIR, {
        setHeaders: (res, file) => {
            res.setHeader(
                "Cache-Control",
                file.endsWith("manifest.json") ? "no-cache" : "public, max-age=31536000, immutable"
            );
        },
    }),
    // Anything not there is a 404, not the app's page.
    (_req, res) => res.status(404).end()
);

const dist = path.join(process.cwd(), "dist");
// Built scripts and styles carry a content hash in their names, so a
// browser may keep them for good; everything else is revalidated.
app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
app.use(express.static(dist));
app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
});

registerChat(io);
registerPresence(io);

server.listen(PORT, () => {
    console.log(`Walkthrough server listening on http://localhost:${PORT}`);
});

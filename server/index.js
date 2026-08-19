import "dotenv/config";

import path from "path";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

import { PORT } from "./config.js";
import { scenesRouter } from "./api/scenes.js";
import { generateRouter } from "./api/generate.js";
import { hasCredentials, credentialSource } from "./ai/credentials.js";
import { registerChat } from "./sockets/chat.js";
import { registerPresence } from "./sockets/presence.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: "*" },
});

app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ai: hasCredentials(), auth: credentialSource() });
});

app.use("/api/scenes", scenesRouter);
app.use("/api/generate", generateRouter);

app.use((error, _req, res, _next) => {
    console.error("[api]", error);
    res.status(500).json({ error: error.message || "Internal error." });
});

// Static build. In development Vite serves the frontend and proxies
// /api and /socket.io here, so this only matters for `npm start`.
const dist = path.join(process.cwd(), "dist");
app.use(express.static(dist));
app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
});

registerChat(io);
registerPresence(io);

server.listen(PORT, () => {
    console.log(`Walkthrough server listening on http://localhost:${PORT}`);
});

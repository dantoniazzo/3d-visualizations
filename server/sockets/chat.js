/**
 * Text chat, scoped per scene so each client walkthrough is its own room.
 */
export function registerChat(io) {
    const namespace = io.of("/chat");

    namespace.on("connection", (socket) => {
        const sceneId =
            typeof socket.handshake.query.scene === "string" &&
            socket.handshake.query.scene.trim()
                ? socket.handshake.query.scene.trim()
                : "default";

        socket.data.sceneId = sceneId;
        socket.data.name = "";
        socket.join(sceneId);

        socket.on("setName", (name) => {
            if (typeof name === "string") {
                socket.data.name = name.substring(0, 25);
            }
        });

        socket.on("send-message", (message, time) => {
            if (typeof message !== "string" || !message.trim()) return;
            socket
                .to(sceneId)
                .emit(
                    "recieved-message",
                    socket.data.name,
                    message.substring(0, 500),
                    typeof time === "string" ? time.substring(0, 5) : ""
                );
        });
    });
}

import { PRESENCE_TICK_MS } from "../config.js";

/**
 * Player presence, scoped per scene.
 *
 * Each client joins the socket.io room named after the scene it is walking
 * through, so a wedding walkthrough and an apartment walkthrough running on
 * the same server never see each other's avatars.
 *
 * Wire format matches the original PSU-VR one (flat position_x/quaternion_x
 * fields) so the client-side interpolation is unchanged.
 */
export function registerPresence(io) {
    const namespace = io.of("/update");

    /** sceneId -> Set<socket> */
    const scenes = new Map();

    function roomOf(sceneId) {
        if (!scenes.has(sceneId)) scenes.set(sceneId, new Set());
        return scenes.get(sceneId);
    }

    namespace.on("connection", (socket) => {
        const sceneId =
            typeof socket.handshake.query.scene === "string" &&
            socket.handshake.query.scene.trim()
                ? socket.handshake.query.scene.trim()
                : "default";

        socket.data.sceneId = sceneId;
        socket.data.userData = {
            position: { x: 0, y: -500, z: -500 },
            quaternion: { x: 0, y: 0, z: 0, w: 1 },
            animation: "idle",
            name: "",
            avatarSkin: "",
        };

        socket.join(sceneId);
        roomOf(sceneId).add(socket);

        socket.on("setID", () => {
            socket.emit("setID", socket.id);
        });

        socket.on("setName", (name) => {
            if (typeof name === "string") {
                socket.data.userData.name = name.substring(0, 25);
            }
        });

        socket.on("setAvatar", (avatarSkin) => {
            if (typeof avatarSkin !== "string") return;
            socket.data.userData.avatarSkin = avatarSkin;
            // Echoed to the whole room: the sender uses it to build its own
            // avatar, everyone else learns which model to clone.
            namespace.to(sceneId).emit("setAvatarSkin", avatarSkin, socket.id);
        });

        socket.on("updatePlayer", (player) => {
            if (!player?.position || !player?.quaternion) return;
            const data = socket.data.userData;

            data.position.x = player.position.x;
            data.position.y = player.position.y;
            data.position.z = player.position.z;

            // three.js Quaternion serialises as an array over socket.io.
            data.quaternion.x = player.quaternion[0];
            data.quaternion.y = player.quaternion[1];
            data.quaternion.z = player.quaternion[2];
            data.quaternion.w = player.quaternion[3];

            data.animation = player.animation;
            data.avatarSkin = player.avatarSkin;
        });

        socket.on("disconnect", () => {
            roomOf(sceneId).delete(socket);
            if (roomOf(sceneId).size === 0) scenes.delete(sceneId);
            namespace.to(sceneId).emit("removePlayer", socket.id);
        });
    });

    // One tick for the whole server rather than one per connected socket:
    // same cadence and payload as before, without the quadratic fan-out.
    const timer = setInterval(() => {
        for (const [sceneId, sockets] of scenes) {
            const playerData = [];

            for (const socket of sockets) {
                const data = socket.data.userData;
                if (data.name === "" || data.avatarSkin === "") continue;

                playerData.push({
                    id: socket.id,
                    name: data.name,
                    position_x: data.position.x,
                    position_y: data.position.y,
                    position_z: data.position.z,
                    quaternion_x: data.quaternion.x,
                    quaternion_y: data.quaternion.y,
                    quaternion_z: data.quaternion.z,
                    quaternion_w: data.quaternion.w,
                    animation: data.animation,
                    avatarSkin: data.avatarSkin,
                });
            }

            if (playerData.length > 0) {
                namespace.to(sceneId).emit("playerData", playerData);
            }
        }
    }, PRESENCE_TICK_MS);

    timer.unref?.();
    return () => clearInterval(timer);
}

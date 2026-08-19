import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";
import nipplejs from "nipplejs";

import Experience from "../../Experience.js";
import elements from "../../Utils/functions/elements.js";
import Avatar from "./Avatar.js";

/**
 * The visitor: capsule physics against the octree, WASD/joystick movement,
 * a third-person avatar, and the network sync for everyone else's.
 *
 * Movement constants are carried over unchanged from the original
 * walkthrough so the feel is identical.
 */
export default class Player {
    constructor() {
        this.experience = new Experience();
        this.time = this.experience.time;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;
        this.octree = this.experience.world.octree;
        this.resources = this.experience.resources;
        this.socket = this.experience.socket;
        this.spec = this.experience.sceneSpec;

        this.domElements = elements({
            joystickArea: ".joystick-area",
            messageInput: "#chat-message-input",
            promptInput: "#prompt-input",
        });

        this.listeners = [];
        this.otherPlayers = {};

        this.initPlayer();
        this.initControls();
        this.setPlayerSocket();
        this.setJoyStick();
        this.addEventListeners();
    }

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    initPlayer() {
        this.player = {};
        this.player.body = this.camera.perspectiveCamera;
        this.player.animation = "idle";

        this.jumpOnce = false;
        this.player.onFloor = false;
        this.player.gravity = 60;

        this.player.height = 1.2;
        this.player.speedMultiplier = 0.35;
        this.player.directionOffset = 0;

        this.player.raycaster = new THREE.Raycaster();
        this.player.raycaster.far = 4;
        this.player.interactionObjects = [];

        this.upVector = new THREE.Vector3(0, 1, 0);
        this.targetRotation = new THREE.Quaternion();
        this.player.velocity = new THREE.Vector3();
        this.player.direction = new THREE.Vector3();

        this.player.collider = new Capsule(
            new THREE.Vector3(),
            new THREE.Vector3(),
            0.35
        );

        this.spawn = this.spec.spawns[0];
        this.placeAt(this.spawn);

        this.socket.emit("setID");
    }

    initControls() {
        this.actions = {};
        this.joystickVector = new THREE.Vector3();
    }

    setJoyStick() {
        if (!this.domElements.joystickArea) return;

        this.joystick = nipplejs.create({
            zone: this.domElements.joystickArea,
            mode: "dynamic",
        });

        this.joystick.on("move", (_event, data) => {
            this.actions.movingJoyStick = true;
            this.joystickVector.z = -data.vector.y;
            this.joystickVector.x = data.vector.x;
        });

        this.joystick.on("end", () => {
            this.actions.movingJoyStick = false;
        });
    }

    // ------------------------------------------------------------------
    // Networking
    // ------------------------------------------------------------------

    setPlayerSocket() {
        this.socket.on("setID", () => {});

        this.socket.on("setAvatarSkin", (avatarSkin, id) => {
            if (this.avatar || id !== this.socket.id) return;
            const source = this.resources.items[avatarSkin];
            if (!source) return;

            this.player.avatarSkin = avatarSkin;
            this.avatar = new Avatar(source, this.scene);
            this.updatePlayerSocket();
        });

        this.socket.on("playerData", (playerData) => {
            for (const player of playerData) {
                if (player.id === this.socket.id) continue;
                if (!player.name || !player.avatarSkin) continue;

                if (!this.otherPlayers[player.id]) {
                    const source = this.resources.items[player.avatarSkin];
                    if (!source) continue;

                    player.model = new Avatar(
                        source,
                        this.scene,
                        player.name.substring(0, 25),
                        player.id
                    );
                    this.otherPlayers[player.id] = player;
                }

                const entry = this.otherPlayers[player.id];
                entry.position = {
                    x: player.position_x,
                    y: player.position_y,
                    z: player.position_z,
                };
                entry.quaternion = {
                    x: player.quaternion_x,
                    y: player.quaternion_y,
                    z: player.quaternion_z,
                    w: player.quaternion_w,
                };
                entry.animation = player.animation;
            }
        });

        this.socket.on("removePlayer", (id) => {
            const entry = this.otherPlayers[id];
            if (!entry) return;

            entry.model.dispose();
            delete this.otherPlayers[id];
        });
    }

    updatePlayerSocket() {
        clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => {
            if (!this.avatar) return;
            this.socket.emit("updatePlayer", {
                position: this.avatar.avatar.position,
                quaternion: this.avatar.avatar.quaternion,
                animation: this.player.animation,
                avatarSkin: this.player.avatarSkin,
            });
        }, 20);
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------

    /** True while the user is typing, so movement keys go to the input. */
    isTyping() {
        const active = document.activeElement;
        return (
            active === this.domElements.messageInput ||
            active === this.domElements.promptInput ||
            active?.tagName === "INPUT" ||
            active?.tagName === "TEXTAREA"
        );
    }

    onKeyDown = (event) => {
        if (this.isTyping()) return;

        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                this.actions.forward = true;
                break;
            case "KeyS":
            case "ArrowDown":
                this.actions.backward = true;
                break;
            case "KeyA":
            case "ArrowLeft":
                this.actions.left = true;
                break;
            case "KeyD":
            case "ArrowRight":
                this.actions.right = true;
                break;
            case "ShiftLeft":
                this.actions.run = true;
                break;
            case "KeyO":
                this.player.animation = "dancing";
                return;
            case "KeyV":
                this.toggleView();
                return;
            case "KeyE":
                this.interact();
                return;
            case "Space":
                if (!this.actions.jump && this.player.onFloor) {
                    this.actions.jump = true;
                    this.jumpOnce = true;
                }
                return;
            default:
                return;
        }
    };

    onKeyUp = (event) => {
        switch (event.code) {
            case "KeyW":
            case "ArrowUp":
                this.actions.forward = false;
                break;
            case "KeyS":
            case "ArrowDown":
                this.actions.backward = false;
                break;
            case "KeyA":
            case "ArrowLeft":
                this.actions.left = false;
                break;
            case "KeyD":
            case "ArrowRight":
                this.actions.right = false;
                break;
            case "ShiftLeft":
                this.actions.run = false;
                break;
            case "Space":
                this.actions.jump = false;
                break;
            default:
                break;
        }
    };

    addEventListeners() {
        document.addEventListener("keydown", this.onKeyDown);
        document.addEventListener("keyup", this.onKeyUp);
        this.listeners.push(
            () => document.removeEventListener("keydown", this.onKeyDown),
            () => document.removeEventListener("keyup", this.onKeyUp)
        );
    }

    // ------------------------------------------------------------------
    // Movement
    // ------------------------------------------------------------------

    placeAt(spawn) {
        // Stand the capsule slightly above the floor so the first collision
        // resolve settles it rather than starting embedded.
        const position = new THREE.Vector3(
            spawn.position[0],
            spawn.position[1] + 0.4,
            spawn.position[2]
        );

        this.player.collider.start.copy(position);
        this.player.collider.end.copy(position);
        this.player.collider.end.y += this.player.height;

        this.player.velocity.set(0, 0, 0);

        const yaw = THREE.MathUtils.degToRad(spawn.yaw ?? 0);

        if (this.camera.scheme === "pointerLock") {
            // The camera looks along -offset, so a heading of 0 (facing +Z)
            // means the boom sits at +Z behind the head — hence the half turn.
            this.camera.angles.horizontal = yaw + Math.PI;
            this.camera.target.copy(this.player.collider.end);
        } else {
            // Orbit: place the camera behind the heading, close enough that a
            // spawn just inside a doorway doesn't start the view outdoors.
            const back = new THREE.Vector3(
                Math.sin(yaw),
                0,
                Math.cos(yaw)
            ).multiplyScalar(-2);

            this.camera.controls.target.copy(this.player.collider.end);
            this.player.body.position.copy(this.player.collider.end).add(back);
            this.player.body.position.y += 0.6;
            this.camera.controls.update();
        }
    }

    teleport(spawn) {
        this.placeAt(spawn);
    }

    playerCollisions() {
        // Doors first, walls second: the octree is the static truth, so it
        // gets the final say if a door pushes us into one.
        this.experience.world.sceneBuilder?.resolveDoorCollisions(this.player.collider);

        const result = this.octree.capsuleIntersect(this.player.collider);
        this.player.onFloor = false;

        if (result) {
            this.player.onFloor = result.normal.y > 0;
            this.player.collider.translate(result.normal.multiplyScalar(result.depth));
        }
    }

    /**
     * Under pointer lock the movement basis comes from the look angle rather
     * than the camera's matrix: it's exact, and it doesn't care that the
     * camera is updated after the player each frame.
     */
    getForwardVector() {
        if (this.camera.scheme === "pointerLock") {
            const theta = this.camera.angles.horizontal;
            return this.player.direction.set(-Math.sin(theta), 0, -Math.cos(theta));
        }

        this.camera.perspectiveCamera.getWorldDirection(this.player.direction);
        this.player.direction.y = 0;
        this.player.direction.normalize();
        return this.player.direction;
    }

    getSideVector() {
        if (this.camera.scheme === "pointerLock") {
            const theta = this.camera.angles.horizontal;
            return this.player.direction.set(Math.cos(theta), 0, -Math.sin(theta));
        }

        this.camera.perspectiveCamera.getWorldDirection(this.player.direction);
        this.player.direction.y = 0;
        this.player.direction.normalize();
        this.player.direction.cross(this.camera.perspectiveCamera.up);
        return this.player.direction;
    }

    getJoyStickDirectionalVector() {
        const vector = new THREE.Vector3().copy(this.joystickVector);
        vector.applyQuaternion(this.camera.perspectiveCamera.quaternion);
        vector.y = 0;
        vector.multiplyScalar(1.5);
        return vector;
    }

    updateColliderMovement() {
        const speed =
            (this.player.onFloor ? 1.75 : 0.1) *
            this.player.gravity *
            this.player.speedMultiplier;

        let speedDelta = this.time.delta * speed;
        if (this.actions.run) speedDelta *= 2.5;

        if (this.actions.movingJoyStick) {
            this.player.velocity.add(this.getJoyStickDirectionalVector());
        }
        if (this.actions.forward) {
            this.player.velocity.add(this.getForwardVector().multiplyScalar(speedDelta));
        }
        if (this.actions.backward) {
            this.player.velocity.add(this.getForwardVector().multiplyScalar(-speedDelta));
        }
        if (this.actions.left) {
            this.player.velocity.add(this.getSideVector().multiplyScalar(-speedDelta));
        }
        if (this.actions.right) {
            this.player.velocity.add(this.getSideVector().multiplyScalar(speedDelta));
        }

        if (this.player.onFloor) {
            if (this.actions.jump && this.jumpOnce) {
                this.player.velocity.y = 12;
            }
            this.jumpOnce = false;
        }

        let damping = Math.exp(-15 * this.time.delta) - 1;

        if (!this.player.onFloor) {
            // Lighter gravity on the way up makes the jump arc feel less floaty.
            const gravityScale = this.player.animation === "jumping" ? 0.7 : 1;
            this.player.velocity.y -= this.player.gravity * gravityScale * this.time.delta;
            damping *= 0.1;
        }

        this.player.velocity.addScaledVector(this.player.velocity, damping);

        const deltaPosition = this.player.velocity
            .clone()
            .multiplyScalar(this.time.delta);

        this.player.collider.translate(deltaPosition);
        this.playerCollisions();

        if (this.camera.scheme === "pointerLock") {
            // The camera places itself from this pivot in its own update.
            this.camera.target.copy(this.player.collider.end);
        } else {
            // Orbit: drag the pivot along, preserving the camera's offset.
            this.player.body.position.sub(this.camera.controls.target);
            this.camera.controls.target.copy(this.player.collider.end);
            this.player.body.position.add(this.player.collider.end);
        }

        this.player.body.updateMatrixWorld();

        if (this.player.body.position.y < -30) {
            this.placeAt(this.spawn);
        }
    }

    // ------------------------------------------------------------------
    // Avatar
    // ------------------------------------------------------------------

    isMoving() {
        return Boolean(
            this.actions.forward ||
                this.actions.backward ||
                this.actions.left ||
                this.actions.right ||
                this.actions.movingJoyStick
        );
    }

    updateAvatarPosition() {
        this.avatar.avatar.position.copy(this.player.collider.end);
        this.avatar.avatar.position.y -= 1.56;

        // Hide your own avatar in first person — otherwise the camera sits
        // inside its head.
        this.avatar.avatar.visible = this.camera.mode !== "first";

        this.avatar.animation.update(this.time.delta);
    }

    updateAvatarRotation() {
        const { forward, backward, left, right } = this.actions;

        // Which way the body faces relative to the camera, from the WASD
        // combination currently held.
        let offset = this.player.directionOffset;

        if (forward && !backward) {
            offset = left && !right ? Math.PI + Math.PI / 4 : right && !left ? Math.PI - Math.PI / 4 : Math.PI;
        } else if (backward && !forward) {
            offset = left && !right ? -Math.PI / 4 : right && !left ? Math.PI / 4 : 0;
        } else if (left && !right) {
            offset = -Math.PI / 2;
        } else if (right && !left) {
            offset = Math.PI / 2;
        } else if (this.actions.movingJoyStick) {
            offset = Math.atan2(this.joystickVector.x, this.joystickVector.z) + Math.PI;
        }

        this.player.directionOffset = offset;
    }

    updateAvatarAnimation() {
        let next;

        if (!this.player.onFloor && this.player.velocity.y > 0.5) {
            next = "jumping";
        } else if (this.isMoving()) {
            next = this.actions.run ? "running" : "walking";
        } else if (this.player.animation === "dancing") {
            next = "dancing";
        } else {
            next = "idle";
        }

        this.player.animation = next;
        this.avatar.animation.play(next);
    }

    updateAvatarFacing() {
        if (this.player.animation === "idle" || this.player.animation === "dancing") {
            return;
        }

        // Camera yaw, taken from the look angles under pointer lock. Deriving
        // it from camera-minus-avatar breaks in first person, where the two
        // positions coincide and the atan2 collapses to zero.
        this.targetRotation.setFromAxisAngle(
            this.upVector,
            this.camera.getYaw() + this.player.directionOffset
        );
        this.avatar.avatar.quaternion.rotateTowards(this.targetRotation, 0.15);
    }

    updateOtherPlayers() {
        for (const id in this.otherPlayers) {
            const entry = this.otherPlayers[id];
            if (!entry.position) continue;

            entry.model.avatar.position.set(
                entry.position.x,
                entry.position.y,
                entry.position.z
            );
            entry.model.avatar.quaternion.set(
                entry.quaternion.x,
                entry.quaternion.y,
                entry.quaternion.z,
                entry.quaternion.w
            );

            entry.model.animation.play(entry.animation);
            entry.model.animation.update(this.time.delta);

            entry.model.nametag.position.set(
                entry.position.x,
                entry.position.y + 2.05,
                entry.position.z
            );
        }
    }

    // ------------------------------------------------------------------
    // Inspection
    // ------------------------------------------------------------------

    setInteractionObjects(objects) {
        this.player.interactionObjects = objects;
    }

    /**
     * Swap between first and third person, and announce it.
     *
     * The HUD mirrors the mode, and the toggle is reachable from both the `V`
     * key and an on-screen button, so whichever is used the other stays in
     * step.
     */
    toggleView() {
        const mode = this.camera.toggleView();
        this.experience.world.emit("view", mode);
        return mode;
    }

    /**
     * Action key. Operates whichever door is being looked at, falling back
     * to the nearest one within reach — so you can open a door you are
     * standing beside without having to aim at it.
     */
    interact() {
        const builder = this.experience.world.sceneBuilder;
        if (!builder) return;

        const door = this.lookedAtDoor || builder.nearestDoor(this.player.collider.end);
        if (!door) return;

        const opened = door.toggle();
        this.experience.world.emit("door", { door, opened });
    }

    /** Door close enough to operate, for the on-screen prompt. */
    updateDoorPrompt() {
        const builder = this.experience.world.sceneBuilder;
        if (!builder) return;

        const door = this.lookedAtDoor || builder.nearestDoor(this.player.collider.end);
        const id = door?.spec.id ?? null;

        if (id !== this.promptedDoorId) {
            this.promptedDoorId = id;
            this.experience.world.emit(
                "prompt",
                door ? { label: door.isOpen ? "Close door" : "Open door", key: "E" } : null
            );
        }
    }

    getLookDirection() {
        return new THREE.Vector3(0, 0, -1).applyQuaternion(
            this.camera.perspectiveCamera.quaternion
        );
    }

    /**
     * What the crosshair is pointing at.
     *
     * Resolves the first hit into one of: a named surface (retextureable),
     * a door, a piece of furniture, or an imported mesh — and publishes it
     * so the HUD and the texture picker can act on it.
     */
    updateLookTarget() {
        if (this.player.interactionObjects.length === 0) return;

        const builder = this.experience.world.sceneBuilder;

        // Cast from the head, not the camera — in third person the camera is
        // metres behind and would inspect whatever is nearest to it instead.
        this.player.raycaster.ray.origin.copy(this.player.collider.end);
        this.player.raycaster.ray.direction.copy(this.getLookDirection());

        const intersects = this.player.raycaster.intersectObjects(
            this.player.interactionObjects,
            true
        );

        let target = null;
        this.lookedAtDoor = null;

        if (intersects.length > 0) {
            const hit = intersects[0];

            // A door anywhere up the parent chain wins: you aim at the leaf.
            let node = hit.object;
            while (node && node.userData?.kind !== "door") node = node.parent;

            if (node?.userData?.door) {
                this.lookedAtDoor = node.userData.door;
                target = {
                    kind: "door",
                    label: node.userData.door.isOpen ? "Open door" : "Closed door",
                    id: node.userData.id,
                };
            } else {
                const resolved = builder?.resolveSurfaceHit(hit);
                if (resolved?.surface) {
                    target = {
                        kind: "surface",
                        surfaceId: resolved.surface.id,
                        surfaceKind: resolved.surface.kind,
                        finish: resolved.surface.finish,
                        label: resolved.surface.label || resolved.surface.kind,
                        point: hit.point.toArray(),
                    };
                } else {
                    // Furniture or an imported mesh.
                    let owner = hit.object;
                    while (owner && !owner.userData?.label) owner = owner.parent;
                    if (owner?.userData?.label) {
                        target = {
                            kind: owner.userData.kind || "object",
                            id: owner.userData.id,
                            label: owner.userData.label,
                        };
                    }
                }
            }
        }

        const signature = target ? `${target.kind}:${target.surfaceId ?? target.id}` : null;
        if (signature !== this.lookSignature) {
            this.lookSignature = signature;
            this.experience.world.emit("look", target);
        }
    }

    /** Floor point under the crosshair, for placing furniture. */
    getFloorPointUnderCrosshair(maxDistance = 8) {
        const ray = new THREE.Raycaster();
        ray.far = maxDistance;
        ray.ray.origin.copy(this.player.collider.end);
        ray.ray.direction.copy(this.getLookDirection());

        const hits = ray.intersectObjects(this.player.interactionObjects, true);
        for (const hit of hits) {
            // Near-horizontal, upward-facing surface = something to stand on.
            const normal = hit.face?.normal;
            if (!normal) continue;
            const world = normal.clone().transformDirection(hit.object.matrixWorld);
            if (world.y > 0.7) return hit.point.clone();
        }

        // Nothing underfoot in view: drop it a couple of metres ahead.
        const forward = this.getLookDirection().setY(0).normalize();
        return this.player.collider.end
            .clone()
            .addScaledVector(forward, 2)
            .setY(this.player.collider.start.y - this.player.collider.radius);
    }

    updateRoomReadout() {
        const builder = this.experience.world.sceneBuilder;
        if (!builder) return;

        // Measured at the feet, not the head: which storey you are on is a
        // question about what you are standing on.
        const room = builder.roomAt(
            this.player.collider.end.x,
            this.player.collider.start.y - this.player.collider.radius,
            this.player.collider.end.z
        );

        const id = room?.id ?? null;
        if (id !== this.currentRoomId) {
            this.currentRoomId = id;
            this.experience.world.emit("room", room);
        }
    }

    // ------------------------------------------------------------------

    update() {
        if (!this.avatar) return;

        this.updateColliderMovement();
        this.updateAvatarPosition();
        this.updateAvatarRotation();
        this.updateAvatarAnimation();
        this.updateAvatarFacing();
        this.updateOtherPlayers();
        this.updateLookTarget();
        this.updateDoorPrompt();
        this.updateRoomReadout();
    }

    dispose() {
        clearInterval(this.syncTimer);
        this.listeners.forEach((remove) => remove());
        this.joystick?.destroy();

        for (const id in this.otherPlayers) {
            this.otherPlayers[id].model.dispose();
        }
        this.avatar?.dispose();
    }
}

import * as THREE from "three";
import { Capsule } from "three/examples/jsm/math/Capsule.js";
import nipplejs from "nipplejs";

import Experience from "../../Experience.js";
import elements from "../../Utils/functions/elements.js";
import Avatar, { ONCE, VISITOR_CLIPS } from "./Avatar.js";
import Swimmer, { WATER_NAMES, strideOf } from "./Swim.js";
import { isShown } from "../Scope.js";
import { seeReal } from "../../Utils/layers.js";
import rays from "../../Utils/rays.js";
import { SLACK, roomLightPlan } from "../../../../shared/interact.js";
import { LIMB_BONES, SITTING } from "../Seats.js";
import { wrapAngle } from "../../Camera.js";

const _joystick = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _feet = new THREE.Vector3();
const _door = new THREE.Vector3();
const _from = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Sitting down and getting up (sit, stand). By the clips for it (Mixamo's
 * "Stand To Sit" and "Sit To Stand", played as `sit-down` and `stand-up`:
 * sitPlan, risePlan) where there is room for them — the body at ROOM_LOOKS
 * moments of each clip meeting nothing but the seat's own piece (World/
 * Seats.js's roomFor), the walk there (wayClear: its legs down to its feet)
 * and the turn on the spot where the clip starts (turnClear) too. Sitting
 * down: the figure goes to where the clip starts — stood before the seat,
 * its back to it — walking there facing the way it goes (further than
 * WALK_OVER: no step aside), then turning on the spot to its back to the
 * seat at TURN_RATE (standing still STOP_BEFORE at least: a stride faded
 * into sitting down put a foot through the floor) — or, there already,
 * turning on the spot; plays
 * the clip, its hips coming down onto the seat; and fades into the seat's
 * own sitting clip over its last SIT_SETTLE. Getting up: it fades from
 * sitting into the clip over RISE_FADE, plays it, and fades into standing
 * (or walking) where it stands up to over RISE_SETTLE — or, where the
 * capsule cannot stand there (the seat's front is in it), as little further
 * on the way it faces as it can (RISE_ON at most), stepped to at STEP_PACE.
 *
 * Without the clips, or the room for them — a chair drawn up to a table —
 * on foot (walkPlan, walkOffPlan): sitting down, the figure walks to where
 * it stands at the seat (standSpot: before it, its feet where they are sat,
 * or where it sits) and turns there, and sits down where it stands, sitting
 * fading in as its hips go down onto the seat over SIT_BLEND or longer;
 * getting up, it stands up where it sits, as it sat down, then turns to
 * where it stood before it sat and walks there — or, the way there blocked,
 * to the nearest spot free to stand in (ring) with a clear way to it; none,
 * round what is in the way (World/Seats.js's wayRound), or straight there.
 * Turned to a side on the seat (seatPose: where only that meets nothing),
 * all of it from that side. Every walk, by the clips or not, faces the way
 * it goes, turned to it on the spot first, and is no faster than
 * APPROACH_PACE at its fastest (eased in and out, APPROACH_LEAST at
 * least): until 2026-10-17 the figure glided between the seat and where
 * the visitor stood — up to 2.3 m — in 0.35 s, at up to 11-14 m/s, often
 * sideways, through the table.
 */
const SIT_BLEND = 0.35;
const APPROACH_PACE = 1.6;
const APPROACH_LEAST = 0.3;
const WALK_OVER = 0.05;
const STOP_BEFORE = 0.25;
const TURN_RATE = 9;
const SIT_SETTLE = 0.4;
const RISE_FADE = 0.25;
const RISE_SETTLE = 0.3;
const RISE_ON = 0.4;
const STEP_PACE = 0.8;
const ROOM_LOOKS = 8;
/** Seated, the sitting clip looked over at so many moments of it for room (seatingClear). */
const SEATED_LOOKS = 4;
/**
 * Sat on turned to a side (seatPose), how far back from the seat's point the
 * figure is tried sitting, in metres, the nearest first — away from the
 * table a chair is drawn up to: sat on its point, the arm on the table's
 * side went into the table's edge.
 */
const SIDE_BACKS = [0, 0.03, 0.06, 0.09];
/** The figure's walking clip looked at so many times through, for the legs' way across the floor (World/Seats.js's wayClear). */
const WALK_LOOKS = 11;
/** Getting up on foot, a way back to where the visitor stood that is not before the seat: going back through it, or within this of straight back (its cosine), it is not taken from where it sits. */
const NOT_BACK = -0.2;
/**
 * Getting up on foot, its way to where the visitor stood blocked
 * (walkOffPlan): how far round where it stands up the spots the capsule
 * could stand in instead are looked at, in metres (ring, every eighth of a
 * turn), and how many of them, the nearest first, at most.
 */
const AROUND = [0.6, 1, 1.4, 1.8];
/** ...and, sat on from afar with none free so near, so far. */
const AROUND_FAR = [2.2, 2.6, 3, 3.5];
const VIA_TRIES = 16;
/** Standing at a seat on foot where it sits (standSpot), how much further back it may stand, for room, in metres; and how fast its hips go across the floor at most, standing up or sitting down — before the seat, and back from it — in metres a second (sitTime). */
const STAND_BACK = 0.3;
/** On foot, a way turning by less than this is walked on round the corner (routeOf), facing the way between over CORNER of it, in radians and metres. */
const TURN_WALKING = THREE.MathUtils.degToRad(50);
const CORNER = 0.3;
const STAND_PACE = 0.6;
const STAND_BACK_PACE = 0.35;
/** Seated, these get the visitor up: the walking keys, which walk off at once, and Space. */
const UP_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
/** ...and the stick pushed this far. */
const STICK_UP = 0.2;
/** From above, E with nothing aimed at sits on the nearest free seat within this of the feet — unless a door is nearer. */
const SEAT_NEAR = 1.2;
/**
 * Sat on from further off than this, across the floor (a click from above),
 * the visitor gets up beside the seat, not back where they were (walkOffPlan);
 * and the figure goes there walking, where the way there is clear and no
 * longer than WALK_FROM_AFAR (AFAR_GRID_MOST of the grid's spots looked at for
 * a way round: Seats.wayRound) — else it fades out where it stands and in
 * beside the seat, over DISSOLVE each, and walks the last of the way.
 */
const SAT_FROM_AFAR = 2.5;
const WALK_FROM_AFAR = 6;
const AFAR_GRID_MOST = 900;
const DISSOLVE = 0.3;
/** How long the view takes to turn to what a seated visitor is to look at (lookFromSeat), in seconds. */
const LOOK_TURN = 0.6;
/** Sitting down in first person, how far down the view looks once turned the way the seat faces, in radians: a few degrees. */
const SIT_PITCH = 0.1;
/** A touch screen's camera this near the head is first person's, collapsed onto the eye (orbitOut), in metres. */
const ORBIT_COLLAPSED = 0.1;

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
        });

        this.listeners = [];
        this.otherPlayers = {};
        // Off while the editor has the scene: the keys belong to it then.
        this.enabled = true;

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

        this.inVehicle = false;
        this.currentCar = null;
        // On a seat (sit), and getting up off one (stand): null otherwise.
        this.seated = null;
        this.rising = null;
        this.jumpOnce = false;
        this.player.onFloor = false;
        this.player.gravity = 60;

        this.player.height = 1.2;
        this.player.speedMultiplier = 0.35;
        this.player.directionOffset = 0;

        // (The crosshair meets the editor's scene as it is built, whichever of it stand-ins draw: World/StandIns.js.)
        this.player.raycaster = seeReal(new THREE.Raycaster());
        this.player.raycaster.far = 4;
        this.player.interactionObjects = [];
        // What the crosshair is on, of all there is to act on (World/Interactables.js), or null.
        this.target = null;
        // The room the visitor is in (updateRoomReadout), or null.
        this.room = null;

        this.upVector = new THREE.Vector3(0, 1, 0);
        this.targetRotation = new THREE.Quaternion();
        this.player.velocity = new THREE.Vector3();
        this.player.direction = new THREE.Vector3();

        this.player.collider = new Capsule(
            new THREE.Vector3(),
            new THREE.Vector3(),
            0.35
        );
        // In a pool: wading, swimming, climbing out (Swim.js).
        this.swimmer = new Swimmer(this);

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

        // In the camera's terms: screen-up on the stick is -Z, straight
        // ahead; the vector's length is how far it is pushed, 0 to 1.
        this.joystick.on("move", (_event, data) => {
            this.actions.movingJoyStick = true;
            const push = Math.min(1, data.force ?? 1);
            this.joystickVector.set(data.vector.x * push, 0, -data.vector.y * push);
        });

        this.joystick.on("end", () => {
            this.actions.movingJoyStick = false;
            this.joystickVector.set(0, 0, 0);
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
            this.experience.wake("avatar");
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
                    this.experience.wake("visitor");
                }

                const entry = this.otherPlayers[player.id];
                // (Sent many times a second whether anyone moved or not: the editor, which draws only when something has
                // changed, is told when one has — Pace.js. Not for the last digits: someone standing still is pressed to
                // the floor and lifted off it again at every frame of theirs. Against where they were when last told of,
                // so that a drift too slow to count in one message still adds up to a move.)
                const told = entry.told;
                const far = (a, b) => Math.abs(a - b) > 1e-4;
                if (
                    !told ||
                    far(told[0], player.position_x) ||
                    far(told[1], player.position_y) ||
                    far(told[2], player.position_z) ||
                    far(told[3], player.quaternion_x) ||
                    far(told[4], player.quaternion_y) ||
                    far(told[5], player.quaternion_z) ||
                    far(told[6], player.quaternion_w) ||
                    told[7] !== player.animation
                ) {
                    entry.told = [player.position_x, player.position_y, player.position_z, player.quaternion_x, player.quaternion_y, player.quaternion_z, player.quaternion_w, player.animation];
                    this.experience.wake("visitor");
                }
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
                // (As it came over the network, unchecked by the server: a clip's name, or else none — idle. Read as a
                // string every frame by what sits them and by who is at rest: updateOtherPlayers, World/Seats.js's
                // taken, Pace.js.)
                entry.animation = typeof player.animation === "string" ? player.animation : "idle";
            }
        });

        this.socket.on("removePlayer", (id) => {
            const entry = this.otherPlayers[id];
            if (!entry) return;

            entry.model.dispose();
            delete this.otherPlayers[id];
            this.experience.wake("visitor");
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
            active?.tagName === "INPUT" ||
            active?.tagName === "TEXTAREA"
        );
    }

    /**
     * Hand the controls to the editor, or take them back. Held keys are
     * dropped either way, so nobody walks off on a W that was pressed as
     * the mode changed.
     */
    setEnabled(enabled) {
        if (!enabled && this.inVehicle) this.exitVehicle();
        // (Up off a seat at once: edit mode moves the furniture it is on. Getting up, up already: the figure where the body is.)
        if (!enabled) {
            this.stand({ now: true });
            if (this.rising && this.avatar) {
                this.rising = null;
                this.avatar.avatar.position.copy(this.player.collider.end);
                this.avatar.avatar.position.y -= 1.56;
            }
        }
        this.enabled = enabled;
        this.actions = {};
        this.player.velocity.set(0, 0, 0);
        this.target = null;
        this.lookSignature = undefined;
        this.promptSignature = undefined;
    }

    /**
     * Walk from edit mode. Its camera is not behind the body, so it hands
     * over its heading instead — a function returning it, in the same terms
     * as the walkthrough's look angle: W walks the way that camera looks, A
     * and D strafe across it, and the body turns to face the way it goes.
     * Null gives walking back to the walkthrough's own camera.
     */
    setRemote(heading) {
        this.remote = heading || null;
        this.actions = {};
        this.player.velocity.x = 0;
        this.player.velocity.z = 0;
    }

    /**
     * Walking, running and jumping keys, and nothing else — edit mode owns
     * the rest of the keyboard. Returns whether the key was one of them.
     */
    setMovementKey(code, down) {
        switch (code) {
            case "KeyW":
            case "ArrowUp":
                this.actions.forward = down;
                return true;
            case "KeyS":
            case "ArrowDown":
                this.actions.backward = down;
                return true;
            case "KeyA":
            case "ArrowLeft":
                this.actions.left = down;
                return true;
            case "KeyD":
            case "ArrowRight":
                this.actions.right = down;
                return true;
            case "ShiftLeft":
                this.actions.run = down;
                return true;
            case "Space":
                // Afloat, Space climbs out where the pool's edge is near: no
                // jumping in water too deep to stand in (Swim.js).
                if (this.swimmer.swimming) {
                    if (down && !this.actions.jump) this.climbOut();
                    this.actions.jump = down;
                    return true;
                }
                if (!down) {
                    this.actions.jump = false;
                } else if (!this.actions.jump && this.player.onFloor) {
                    this.actions.jump = true;
                    this.jumpOnce = true;
                }
                return true;
            default:
                return false;
        }
    }

    onKeyDown = (event) => {
        if (this.isTyping() || !this.enabled) return;

        // Seated, the walking keys get the visitor up — and walk off at once —
        // and Space only gets them up: no jumping off a sofa. No dancing on it.
        if (this.seated) {
            if (UP_KEYS.has(event.code)) {
                this.getUp();
                if (event.code === "Space") return;
            } else if (event.code === "KeyO") {
                return;
            }
        }

        // While driving, the movement keys steer the car instead of the body.
        if (this.inVehicle) {
            if (event.code === "KeyF") {
                this.leaveVehicle();
                return;
            }
            // The headlamps on or off for the drive (CarLights.js).
            if (event.code === "KeyH") {
                this.currentCar.lights?.toggle();
                return;
            }
            // From above, V goes back behind the car, as on foot it goes back
            // to walking (toggleView); behind it there is no first person.
            if (event.code === "KeyV") {
                if (this.camera.birdView?.active) this.experience.world.toggleBirdView();
                return;
            }
            const c = this.currentCar.controls;
            switch (event.code) {
                case "KeyW": case "ArrowUp": c.forward = true; return;
                case "KeyS": case "ArrowDown": c.backward = true; return;
                case "KeyA": case "ArrowLeft": c.left = true; return;
                case "KeyD": case "ArrowRight": c.right = true; return;
                case "Space": c.brake = true; event.preventDefault(); return;
                default: return;
            }
        }

        if (this.setMovementKey(event.code, true)) return;

        switch (event.code) {
            case "KeyO":
                this.player.animation = "dancing";
                return;
            case "KeyV":
                this.toggleView();
                return;
            case "KeyE":
                this.interact();
                return;
            case "KeyQ":
                // (Not held down repeating, and not with Ctrl, ⌘ or Alt: those are the browser's and the system's.)
                if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) this.toggleRoomLights();
                return;
            case "KeyF":
                this.enterNearestVehicle();
                return;
            default:
                return;
        }
    };

    onKeyUp = (event) => {
        if (this.inVehicle) {
            const c = this.currentCar.controls;
            switch (event.code) {
                case "KeyW": case "ArrowUp": c.forward = false; return;
                case "KeyS": case "ArrowDown": c.backward = false; return;
                case "KeyA": case "ArrowLeft": c.left = false; return;
                case "KeyD": case "ArrowRight": c.right = false; return;
                case "Space": c.brake = false; return;
                default: return;
            }
        }

        this.setMovementKey(event.code, false);
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
        // (Up off a seat first, at once: from a seat to a spawn, or a room picked from the menu. Out of any water.)
        this.stand({ now: true });
        this.rising = null;
        this.swimmer.reset();

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

    /**
     * The capsule pushed clear of whatever it has moved into: doors, then
     * the trees. `from`, where its middle was before this frame's move: a
     * room's ceiling, whose face in the trees faces only up, is met by the
     * head as a ceiling rather than lifted through onto the floor above
     * (World/Collision.js) — jumping from a bed, or from a window's sill out
     * over the garden.
     *
     * @param {THREE.Vector3} [from]
     */
    playerCollisions(from = null) {
        // Doors first, walls second: the octree is the static truth, so it
        // gets the final say if a door pushes us into one.
        this.experience.world.sceneBuilder?.resolveDoorCollisions(this.player.collider);

        const result = this.octree.capsuleIntersect(this.player.collider, { from });
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
    /** The heading movement is relative to: edit mode's, or the look angle. */
    heading() {
        if (this.remote) return this.remote();
        return this.camera.scheme === "pointerLock" ? this.camera.angles.horizontal : null;
    }

    getForwardVector() {
        const theta = this.heading();
        if (theta !== null) {
            return this.player.direction.set(-Math.sin(theta), 0, -Math.cos(theta));
        }

        this.camera.perspectiveCamera.getWorldDirection(this.player.direction);
        this.player.direction.y = 0;
        this.player.direction.normalize();
        return this.player.direction;
    }

    getSideVector() {
        const theta = this.heading();
        if (theta !== null) {
            return this.player.direction.set(Math.cos(theta), 0, -Math.sin(theta));
        }

        this.camera.perspectiveCamera.getWorldDirection(this.player.direction);
        this.player.direction.y = 0;
        this.player.direction.normalize();
        this.player.direction.cross(this.camera.perspectiveCamera.up);
        return this.player.direction;
    }

    /** Where the joystick points, on the ground, as a unit vector. */
    getJoyStickDirectionalVector() {
        const ahead = -this.joystickVector.z;
        const across = this.joystickVector.x;
        // Taken from the heading rather than the camera's full rotation, so
        // looking down at the floor doesn't slow the walk to a crawl.
        const vector = _joystick.copy(this.getForwardVector()).multiplyScalar(ahead);
        vector.addScaledVector(this.getSideVector(), across);
        return vector.lengthSq() > 1e-8 ? vector.normalize() : vector;
    }

    /**
     * How fast the stick asks to go, as a multiple of walking pace: a light
     * push walks, pushed all the way it runs.
     */
    joystickPace() {
        return THREE.MathUtils.clamp(this.joystickVector.length() * 2.8, 0.5, 2.5);
    }

    updateColliderMovement() {
        // In the water's hold — afloat, or climbing out — the water moves the body (Swim.js).
        if (this.swimmer.update()) {
            this.followBody();
            return;
        }

        const speed =
            (this.player.onFloor ? 1.75 : 0.1) *
            this.player.gravity *
            this.player.speedMultiplier;

        let speedDelta = this.time.delta * speed;
        if (this.actions.run) speedDelta *= 2.5;
        // Wading, the slower the deeper.
        if (this.swimmer.wading) speedDelta *= this.swimmer.pace;

        this.steer(speedDelta);

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

        const from = this.player.collider.getCenter(_from);
        this.player.collider.translate(deltaPosition);
        this.playerCollisions(from);

        this.followBody();
    }

    /**
     * The keys and the stick, this frame, as a push on the body's velocity:
     * `speedDelta` for a key held, and the stick's direction by `joystick`
     * times that — walking, how fast it asks to go (joystickPace); afloat,
     * Swim.js's own.
     */
    steer(speedDelta, joystick = this.joystickPace()) {
        if (this.actions.movingJoyStick) {
            // Per second, like the keys — not per frame, which left a phone
            // drawing 30 frames a second walking at half the speed.
            this.player.velocity.addScaledVector(this.getJoyStickDirectionalVector(), speedDelta * joystick);
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
    }

    /**
     * The camera's pivot after the body, wherever it went this frame — the
     * head, or over a swimmer's (Swim.js's pivot) — and back to the spawn
     * from a fall off the world.
     */
    followBody() {
        const pivot = this.swimmer.pivot(this.player.collider.end);
        if (this.camera.scheme === "pointerLock") {
            // The camera places itself from this pivot in its own update.
            this.camera.target.copy(pivot);
        } else {
            // Orbit: drag the pivot along, preserving the camera's offset.
            this.player.body.position.sub(this.camera.controls.target);
            this.camera.controls.target.copy(pivot);
            this.player.body.position.add(pivot);
        }

        this.player.body.updateMatrixWorld();

        if (this.player.body.position.y < -30) {
            this.placeAt(this.spawn);
        }
    }

    /**
     * Space afloat beside the pool's edge, or the touch button's "Climb out":
     * out of the water onto the coping (Swim.js), told to the world as
     * anything done is ("interact"). Null where there is no edge in reach.
     */
    climbOut() {
        const done = this.swimmer.climbOut();
        if (done) this.experience.world.emit("interact", done);
        return done;
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

    /**
     * Whether the visitor is being moved at all this frame — walking,
     * coasting to a stop, jumping, falling or driving — and so must meet
     * whatever is in the way as it stands now (World.update: a collision
     * tree an edit left half built, with the one walked against meanwhile
     * still of the pieces as they stood, is finished first). Standing still
     * they meet nothing new. By the body's speed, not `onFloor`: standing, it is
     * pressed to the floor and lifted off it again every frame, a frame of
     * gravity at most.
     */
    underWay() {
        if (!this.avatar || (!this.enabled && !this.remote)) return false;
        if (this.inVehicle || this.isMoving() || this.actions.jump) return true;
        const { x, y, z } = this.player.velocity;
        return x * x + z * z > 0.01 || Math.abs(y) > 2.5;
    }

    updateAvatarPosition() {
        this.avatar.avatar.position.copy(this.player.collider.end);
        this.avatar.avatar.position.y -= 1.56;

        // Hide your own avatar in first person — otherwise the camera sits
        // inside its head. Edit mode decides for itself.
        if (!this.remote) this.avatar.avatar.visible = this.camera.mode !== "first";
    }

    /**
     * The figure's clips moved on, and then — afloat, or climbing out — the
     * figure as deep as it floats, laid back, or where the climb has it
     * (Swim.js): last of all, once it is turned the way it faces this frame
     * (updateAvatarFacing) and plays this frame's clip (updateAvatarAnimation),
     * so that as one clip fades into the next it floats as the fade weighs
     * them this frame. Placed before it was turned, a swimmer's root — under
     * the capsule's head, its head over it, a stroke's head coming before it
     * — was set by the turn of the frame before: through a turn its head was
     * 7-10 cm off the capsule's, and back on it in a frame as the turn ended.
     */
    updateAvatarPose() {
        this.avatar.animation.update(this.time.delta);
        this.swimmer.pose(this.avatar.avatar.position);
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
        } else if (this.actions.movingJoyStick && this.joystickVector.lengthSq() > 1e-6) {
            // The way the stick points, in the camera's terms: straight up
            // is -Z, which is the half turn the keys use for forward.
            offset = Math.atan2(this.joystickVector.x, this.joystickVector.z);
        }

        this.player.directionOffset = offset;
    }

    updateAvatarAnimation() {
        let next;
        const running = () => this.actions.run || (this.actions.movingJoyStick && this.joystickPace() > 1.7);
        // In the water's hold, its clips (Swim.js) — the swimming clips fitted the first time, their stand-ins till then.
        const water = this.swimmer.swimming ? this.swimmer.clip(this.isMoving(), running()) : null;
        if (water) this.swimmer.dress(this.avatar);

        if (water) {
            next = water;
        } else if (!this.player.onFloor && this.player.velocity.y > 0.5) {
            next = "jumping";
        } else if (this.isMoving()) {
            next = running() ? "running" : "walking";
        } else if (this.player.animation === "dancing") {
            next = "dancing";
        } else {
            next = "idle";
        }

        this.player.animation = next;
        // (Climbing out, faded in as the figure comes on to the edge: Swim.js.)
        this.avatar.animation.play(next, water ? this.swimmer.fadeOf(next) : undefined);
        // Wading, the stride slows with the water; a stroke's stand-in plays slower too.
        this.avatar.animation.stride = this.swimmer.stride;
    }

    updateAvatarFacing() {
        // Climbing out, to the edge it climbs over.
        const climbing = this.swimmer.climbYaw();
        if (climbing !== null) {
            this.targetRotation.setFromAxisAngle(this.upVector, climbing);
            this.avatar.avatar.quaternion.rotateTowards(this.targetRotation, 9 * this.time.delta);
            return;
        }
        if (this.player.animation === "idle" || this.player.animation === "dancing" || this.player.animation === "treading") {
            return;
        }

        // Camera yaw, taken from the look angles under pointer lock. Deriving
        // it from camera-minus-avatar breaks in first person, where the two
        // positions coincide and the atan2 collapses to zero.
        this.targetRotation.setFromAxisAngle(
            this.upVector,
            (this.remote ? this.remote() : this.camera.getYaw()) + this.player.directionOffset
        );
        // About half a turn in a third of a second, whatever the frame rate.
        this.avatar.avatar.quaternion.rotateTowards(this.targetRotation, 9 * this.time.delta);
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

            // Sitting, as their own page sat them: the sitting clip fitted to that figure here, the first time
            // (World/Seats.js) — standing until it is. Swimming, sitting down and getting up likewise (Avatar.wear):
            // their stand-ins until then.
            const sitting = typeof entry.animation === "string" && entry.animation.startsWith(SITTING);
            if (sitting && !entry.model.has(entry.animation)) this.experience.world.seats?.dress(entry.model, entry.animation);
            // (Sitting down, the sitting clip fitted meanwhile: not stood up for a moment between the two.)
            else if (entry.animation === "sit-down" && !entry.model.has(SITTING)) this.experience.world.seats?.dress(entry.model);
            const swimming = WATER_NAMES.has(entry.animation);
            if (Object.hasOwn(VISITOR_CLIPS, entry.animation) && !entry.model.has(entry.animation)) entry.model.wear(this.experience);
            // Played by this page's frames, each frame — faded as their own page fades theirs where that is not over
            // Avatar.js's FADE (Swim.js's fadeOther: climbing out; otherFade: sitting down and getting up), and at its pace
            // there (strideOf).
            let fade;
            if (entry.animation !== entry.played) {
                fade = this.swimmer.fadeOther(entry.model, entry.played, entry.animation) ?? otherFade(entry.played, entry.animation);
                entry.played = entry.animation;
            }
            entry.model.animation.play(entry.animation, fade);
            entry.model.animation.stride = strideOf(entry.model, entry.animation);
            this.swimmer.holdOther(entry.model, entry.animation);
            entry.model.animation.update(this.time.delta);
            // Laid back swimming as a stand-in, as their own page lays theirs (Swim.js): its hood under the water.
            this.swimmer.layOther(entry.model, entry.animation);

            // (Over a swimmer, over the water; climbing out by the clip, over its hips as they come up.)
            const climbing = entry.animation === "climbing" && entry.model.has("climbing");
            const over = sitting
                ? 1.55
                : climbing
                  ? (entry.model.hipsAt("climbing", entry.model.animation.actions.climbing.time)?.y ?? 1.5) + 1.1
                  : swimming
                    ? (this.swimmer.waterOn(entry.model, entry.animation) ?? 1.5) + 0.45
                    : 2.05;
            entry.model.nametag.position.set(entry.position.x, entry.position.y + over, entry.position.z);
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
        // From above, V goes back to walking.
        if (this.camera.birdView?.active) {
            this.experience.world.toggleBirdView();
            return this.camera.mode;
        }
        const mode = this.camera.toggleView();
        // (Seated, their own choice: the view they get up into.)
        if (this.seated) this.seated.mode = mode;
        this.experience.world.emit("view", mode);
        return mode;
    }

    /**
     * Action key. Acts on whatever the crosshair is on (updateLookTarget) —
     * turns a light on or off, opens or shuts a door, a cupboard's door or a
     * drawer — and with nothing aimed at, on the nearest door within reach,
     * so a door stood beside opens without having to be aimed at.
     */
    interact() {
        const interactables = this.experience.world.interactables;
        // (Afloat, nothing is in reach but the pool's edge, which is Space's.)
        if (!interactables || this.swimmer.swimming) return null;
        // Seated, nothing is aimed at: what is offered there (a television in front of the seat), or getting up.
        const target = this.seated ? this.seatedOffer() : this.target ?? this.unaimed(interactables.nearby(this.player.collider.end));
        return target ? this.act(target) : null;
    }

    /**
     * With nothing aimed at, what the action key acts on: the nearest door
     * within reach, as it always was — but from above, where there is no
     * crosshair, a free seat within SEAT_NEAR of the feet (World/Seats.js),
     * if no door is nearer.
     *
     * @param {object|null} door  the nearest door, as Interactables.nearby gives it
     */
    unaimed(door) {
        const world = this.experience.world;
        if (!this.camera.birdView?.active || !world.seats || this.inVehicle) return door;
        const body = this.player.collider;
        const feet = _feet.copy(body.start);
        feet.y -= body.radius;
        const seat = world.seats.nearest(feet, SEAT_NEAR);
        if (!seat) return door;
        if (door) {
            const at = door.ref.group.getWorldPosition(_door);
            if (Math.hypot(at.x - feet.x, at.z - feet.z) <= world.seats.distance(seat, feet)) return door;
        }
        return world.interactables.of("seat", seat) ?? door;
    }

    /**
     * Do what `target` offers (World/Interactables.js), and tell the world
     * what came of it: "interact", `{ kind, id, state }` — besides what the
     * thing itself tells ("door", "openable", "vehicle", "switches") — so
     * that the editor draws it (Pace.js) and a public view's frame-rate guard
     * does not take the moment for slowness (FrameGuard.js).
     */
    act(target) {
        const done = this.experience.world.interactables.act(target, this);
        if (done) this.experience.world.emit("interact", done);
        return done;
    }

    /**
     * Driving on a touch screen: the stick is the pedals and the wheel —
     * up to accelerate, down to brake and reverse, sideways to steer.
     */
    steerWithJoystick() {
        const controls = this.currentCar.controls;
        const ahead = -this.joystickVector.z;
        const across = this.joystickVector.x;
        const moving = this.actions.movingJoyStick;
        controls.forward = moving && ahead > 0.3;
        controls.backward = moving && ahead < -0.3;
        controls.left = moving && across < -0.3;
        controls.right = moving && across > 0.3;
    }

    /** `F` on foot: get into whichever car is within reach. */
    enterNearestVehicle() {
        const car = this.experience.world.interactables?.nearest("car", this.player.collider.end);
        if (car) this.act(car);
    }

    /** `F` at the wheel: get out — told to the world ("interact", parked) as getting in is. */
    leaveVehicle() {
        const car = this.experience.world.interactables?.driving(this.currentCar);
        if (car) this.act(car);
        else this.exitVehicle();
    }

    /**
     * Get in. Ported from the sibling `game` project, minus its multiplayer
     * authority handling — there is one car per scene here and no contest
     * over who is driving it.
     */
    enterVehicle(car) {
        if (this.inVehicle || !car) return;
        // (Off a seat first, at once: a car clicked from above, or F beside one.)
        this.stand({ now: true });
        this.rising = null;
        this.swimmer.reset();
        this.inVehicle = true;
        this.currentCar = car;

        // Hide the walking avatar and stop it drifting on held keys — and
        // standing, not caught mid-stride, for everyone else, who see it
        // where it got in (the car's drive is not sent to them).
        if (this.avatar) this.avatar.avatar.visible = false;
        this.actions = {};
        this.player.velocity.set(0, 0, 0);
        this.player.animation = "idle";

        // Driving has a camera of its own, round the car. Got into from
        // above, the view from above stays and follows the car instead
        // (World/BirdView.js), the camera round it waiting until it is left.
        this.camera.enterVehicleMode(car);
        this.experience.world.emit("vehicle", { driving: true, car });
    }

    exitVehicle() {
        if (!this.inVehicle || !this.currentCar) return;
        const car = this.currentCar;

        // Release anything still held, or the car drives off without you;
        // and its lamps off, parked.
        car.controls = { forward: false, backward: false, left: false, right: false, brake: false };
        car.lights?.off();

        const spot = car.exitPoint();
        this.player.collider.start.copy(spot);
        this.player.collider.start.y += this.player.collider.radius;
        this.player.collider.end.copy(this.player.collider.start);
        this.player.collider.end.y += this.player.height;
        this.player.velocity.set(0, 0, 0);

        if (this.avatar) this.avatar.avatar.visible = this.camera.mode !== "first";

        this.inVehicle = false;
        this.currentCar = null;
        // (From above, the view stays and follows the visitor on foot, beside
        // the car; the walking camera below is where it starts from once it
        // is left — World/BirdView.js's deactivate places it again then.)
        this.camera.exitVehicleMode();
        if (this.camera.scheme === "pointerLock") {
            this.camera.target.copy(this.player.collider.end);
        } else {
            // Orbit round the body again, from where the chase camera was:
            // the controls pull it in to their own distance.
            this.camera.controls.target.copy(this.player.collider.end);
        }
        this.experience.world.emit("vehicle", { driving: false, car });
    }

    // ------------------------------------------------------------------
    // Sitting
    // ------------------------------------------------------------------

    /**
     * Sit on a seat (World/Seats.js): E on one aimed at, a click or a tap on
     * one from above, or E from above beside one. The figure sits on it
     * facing its way, or turned to a side (seatPose); goes onto it on foot —
     * by its clips where there is room for them (sitPlan), else walking to
     * where it stands at the seat and sitting down there (walkPlan) —
     * placed, sat, as the people round the property are (Seats.poseFor); the
     * capsule is parked under it — no walking, no falling, nothing walked into:
     * the seat's point is inside the piece's own collision — where the
     * bird's-eye view, the room's name, the live room and the garden's grass
     * look for the visitor; the camera turns round the seated head, or in
     * first person looks from its eyes the way the figure faces. Where to get
     * up to is kept: where the visitor stood, free. Sat on from afar (`afar`:
     * further than SAT_FROM_AFAR across the floor, or on another floor), the
     * figure walks there where its way is clear and short (WALK_FROM_AFAR);
     * else it fades out where it stands and in beside the seat (`prelude`,
     * DISSOLVE each: Seats.spotBeside, out the way it is to sit; none free,
     * where it stands at the seat) and walks the last of the way — put there
     * in a frame, it was seen to jump 3.8-4.6 m across a room — and it gets
     * up to the nearest spot free beside it (walkOffPlan), never back across
     * the room.
     *
     * Before the figure's sitting clip is here (a first sit from above,
     * where nobody is drawn sitting) — or its sitting down and getting up,
     * where there are any (Avatar.wear), or a public view's catalogue of
     * the furniture (Seats.catalogue) — it sits as soon as they are, unless
     * the visitor has moved meanwhile.
     *
     * @returns {boolean}  whether it sat down (or will, once its clip is here)
     */
    sit(seat) {
        const world = this.experience.world;
        const seats = world.seats;
        if (!seat || !seats || !this.avatar || this.inVehicle || !this.enabled) return false;
        if (this.seated?.seat === seat) return true;
        // (Its sitting clip, and its sitting down and getting up — where there are any: Avatar.wear — fitted first; the pieces' sizes known.)
        if (!this.avatar.has(SITTING) || !this.avatar.worn || !seats.item(seat.piece?.catalog_id)) {
            const asked = this.player.collider.start.clone();
            Promise.all([seats.dress(this.avatar), this.avatar.wear(this.experience), seats.catalogue()]).then(([dressed]) => {
                if (dressed && !this.seated && !this.inVehicle && this.player.collider.start.distanceTo(asked) < 0.05) this.sit(seat);
            });
            return true;
        }
        // (From another seat — clicked from above — straight across to this one, getting up to where it was got up to. Still
        // fading back from one sat on from afar: at once where it was to come to, whole.)
        const avatar = this.avatar.avatar;
        if (this.rising?.plan?.by === "fade") {
            avatar.position.copy(this.rising.plan.after.position);
            avatar.quaternion.copy(this.rising.plan.after.quaternion);
            this.avatar.setOpacity(1);
            this.rising = null;
        }
        const start = { position: avatar.position.clone(), quaternion: avatar.quaternion.clone() };
        this.stand({ now: true });

        const body = this.player.collider;
        const stood = body.start.clone();
        // Which way it sits on it: as the seat faces, or turned to a side (seatPose).
        const pose = this.seatPose(seat, stood);
        if (!pose) return false;
        const across = Math.abs(stood.y - body.radius - seat.floor) > 0.6;
        const afar = across || Math.hypot(stood.x - seat.at.x, stood.z - seat.at.z) > SAT_FROM_AFAR;
        // Sat on from afar (a click from above): got up from to the nearest spot free beside it (walkOffPlan), not
        // walked back across the room — this one, at once (stand's `now`), or where the visitor was, if none is.
        const beside = afar ? seats.spotBeside(seat, body.radius, this.player.height, pose) : null;
        const from = beside ?? stood;
        let plan = null;
        let prelude = null;
        if (afar && !across) {
            // Walked there at a walking pace where the way is short (WALK_FROM_AFAR) and clear.
            const walked = this.sitPlan(seat, pose, start) ?? this.walkPlan(seat, pose, start, { most: AFAR_GRID_MOST });
            if (walked.clear && lengthOf(walked.route) <= WALK_FROM_AFAR) plan = walked;
        }
        if (afar && !plan) {
            // ...else faded out where it stands and in beside the seat (DISSOLVE each), and walked on from there; nowhere
            // beside it free, where it stands at the seat to sit down. Never seen to jump: put there across a room in a
            // frame, it was (3.8-4.6 m).
            prelude = { position: start.position.clone(), quaternion: start.quaternion.clone(), stood: stood.clone(), time: 2 * DISSOLVE, done: false, free: Boolean(beside) };
            if (beside) {
                start.position.set(beside.x, seat.floor + this.rootOver(), beside.z);
                start.quaternion.setFromAxisAngle(this.upVector, Math.atan2(pose.point.x - beside.x, pose.point.z - beside.z));
            } else {
                start.position.copy(this.standSpot(seat, pose, seats.own(seat, { side: pose.side })).at);
                start.quaternion.copy(pose.quaternion);
            }
        }
        plan ??= this.sitPlan(seat, pose, start) ?? this.walkPlan(seat, pose, start);
        this.seated = {
            seat,
            pose,
            from,
            afar,
            // Faded out where it was and in where it walks on from (sitPose), before the plan.
            prelude,
            // The view to get up into: as it is now, or as the visitor sets it while seated (toggleView).
            mode: this.camera.mode,
            // ...and on a touch screen how far out the camera was from the head (stand: first person collapses it).
            distance: this.camera.scheme === "orbit" ? this.player.body.position.distanceTo(this.camera.controls.target) : null,
            t: 0,
            start,
            pivot: this.pivot().clone(),
            look: null,
            // How it sits down (sitPlan or walkPlan): its time in seconds, and which part of it is playing.
            plan,
            time: 0,
            part: null,
        };
        this.rising = null;
        // (Out of the water, if sat down from it: a lounger clicked from above.)
        this.swimmer.reset();
        body.start.set(pose.point.x, seat.floor + body.radius, pose.point.z);
        body.end.copy(body.start);
        body.end.y += this.player.height;
        this.player.velocity.set(0, 0, 0);
        this.actions = {};
        this.jumpOnce = false;
        // Played here as SITTING, the way this seat is sat on (poseFor installed it), once the figure is there; told to the
        // others by that way's own name ("sitting reclined 37"), so that their pages sit this figure the same way
        // (Seats.dress).
        // Nothing aimed at from a seat: only what it offers (seatedOffer).
        this.target = null;
        if (this.lookSignature !== null) {
            this.lookSignature = null;
            world.emit("look", null);
        }
        // In first person, turned the way the figure faces as they sit, looking a little down, as one sits.
        if (this.camera.mode === "first" && !this.camera.birdView?.active) this.easeLook(_offset.set(pose.face[0], 0, pose.face[1]), SIT_BLEND, { pitch: SIT_PITCH });
        return true;
    }

    /** How far under the floor the figure's root is, standing on it: as the capsule's head over its foot has it (updateAvatarPosition). */
    rootOver() {
        return this.player.collider.radius + this.player.height - 1.56;
    }

    /**
     * Which way the figure sits on a seat (Seats.poseFor): the way the seat
     * faces — as it always did — unless sitting so meets anything but the
     * seat's own piece (seatingClear) and, on a seat that may be sat on
     * turned to a side (Seats.turns: a chair or a stool), turned a quarter to
     * a side meets nothing at all: its own chair's back and a shell's sides
     * included (Seats.own's `side`), seated and sitting down and getting up
     * — tried on the seat's point and then a little further from the table
     * (SIDE_BACKS); of two such sides, the one facing more towards `from`,
     * where the visitor stands. People sit so at a table whose chair is drawn
     * up under it. Where no side meets nothing, the way the seat faces — at
     * a table its chair is drawn up under, the figure's hands and thighs at
     * the table's edge. (Turned to whichever way met least, its own chair's
     * back counted as its own, the figure sat with its torso up to 0.22 m
     * into an oak chair's backrest — 0.39 m in the editor's full meshes —
     * and its thighs through a shell chair's sides.) Null until its clips
     * are fitted to it.
     */
    seatPose(seat, from) {
        const seats = this.experience.world.seats;
        const facing = seats.poseFor(seat, this.avatar);
        if (!facing || !seats.turns(seat) || this.seatingClear(seat, facing)) return facing;
        // (Its sitting clip as the way taken has it: the same for every way of one seat — poseFor sets it again.)
        let best = null;
        for (const side of [1, -1]) {
            for (const back of SIDE_BACKS) {
                const pose = seats.poseFor(seat, this.avatar, side, { back });
                if (!pose) break;
                if (!this.seatingClear(seat, pose)) continue;
                const toward = (from.x - pose.origin.x) * pose.face[0] + (from.z - pose.origin.z) * pose.face[1];
                if (!best || toward > best.toward) best = { pose, toward };
                break;
            }
        }
        return best?.pose ?? facing;
    }

    /**
     * Whether the figure sitting on a seat posed so (`pose`: Seats.poseFor's,
     * facing the seat's way or turned to a side) meets nothing but the seat's
     * own piece (Seats.own, for that side: turned, the seat and what is under
     * it alone) — its body, a capsule round each limb (Seats.roomFor) —
     * seated (its sitting clip at SEATED_LOOKS moments of it), and sitting
     * down and getting up: on foot (where it stands at the seat, standSpot,
     * and between that and sitting: footPoses), or else, facing the seat's
     * way, by the clips both (sitByClip, riseByClip). Turned to a side, on
     * foot whatever the clips do: they are taken only where they meet
     * nothing too (sitPlan, risePlan), and the figure goes on foot otherwise.
     */
    seatingClear(seat, pose) {
        const seats = this.experience.world.seats;
        const except = seats.own(seat, { side: pose.side });
        const along = this.avatar.bonesAlong(SITTING, LIMB_BONES, SEATED_LOOKS);
        if (!along || !seats.roomFor(seat, along.map(({ bones }) => placed(bones, pose.quaternion, pose.position)), except)) return false;
        if (seats.roomFor(seat, this.footPoses(seat, pose, except), except)) return true;
        if (pose.side) return false;
        const down = this.sitByClip(seat, pose);
        const up = down && this.riseByClip(seat, pose);
        return Boolean(up && seats.roomFor(seat, down.poses, except) && seats.roomFor(seat, up.poses, except));
    }

    /**
     * The figure's body sitting down on foot, or getting up so (walkPlan,
     * walkOffPlan), at a few moments: standing where it stands at the seat
     * (standSpot), and between that and sitting (each bone's place a third
     * and two thirds of the way, as the fade between the two has it near
     * enough). In the world.
     */
    footPoses(seat, pose, except) {
        const avatar = this.avatar;
        const idle = avatar.bonesAt("idle", 0, LIMB_BONES);
        const sat = avatar.bonesAt(SITTING, 0, LIMB_BONES);
        if (!idle || !sat) return [];
        const standing = placed(idle, pose.quaternion, this.standSpot(seat, pose, except).at);
        const sitting = placed(sat, pose.quaternion, pose.position);
        const poses = [standing];
        for (const k of [1 / 3, 2 / 3]) {
            const between = {};
            for (const name in standing) if (sitting[name]) between[name] = standing[name].clone().lerp(sitting[name], k);
            poses.push(between);
        }
        return poses;
    }

    /**
     * Sitting down on a seat by the `sit-down` clip (sitPlan), posed so
     * (`pose`): where the clip's root stands — before the seat, turned as
     * the sitter is, so far out that the clip's hips at its end (Avatar.
     * hipsAt) come down where the seat's sitting clip has them at its start
     * — on the seat's floor; how high that root is at the clip's end (on a
     * seat higher or lower than the clip's chair the hips are let down or up
     * onto it, over the clip's second half: sitPose); the clip's length; and
     * the body at each of ROOM_LOOKS moments of it but the last (sat, it is
     * the seat's), in the world. Null without the clip, or for a figure whose
     * clips do not move its hips.
     */
    sitByClip(seat, pose) {
        const avatar = this.avatar;
        if (!avatar.has("sit-down")) return null;
        const length = avatar.animation.actions["sit-down"].getClip().duration;
        const sitting = avatar.hipsAt(SITTING, 0);
        const end = avatar.hipsAt("sit-down", length);
        if (!sitting || !end) return null;
        const offset = sitting.sub(end).applyQuaternion(pose.quaternion);
        const at = new THREE.Vector3(pose.position.x + offset.x, seat.floor, pose.position.z + offset.z);
        const endY = pose.position.y + offset.y;
        const along = avatar.bonesAlong("sit-down", LIMB_BONES, ROOM_LOOKS);
        if (!along) return null;
        const poses = along.slice(0, -1).map(({ time, bones }) => placed(bones, pose.quaternion, _feet.set(at.x, at.y + (endY - at.y) * smooth(THREE.MathUtils.clamp((time / length - 0.5) / 0.5, 0, 1)), at.z)));
        return { at, endY, length, poses };
    }

    /**
     * Getting up off a seat by the `stand-up` clip (risePlan), sat so
     * (`pose`): the clip's root, where its hips at its start are where the
     * seat's sitting clip has them (let down to the floor over the clip's
     * first half as the body comes up off the seat: updateRising); where it
     * stands at the clip's end, its hips over its feet (`stood`, on the
     * floor); the clip's length; and the body at each of ROOM_LOOKS moments
     * of it but the first (seated, it is the seat's), in the world. Null
     * without the clip.
     */
    riseByClip(seat, pose) {
        const avatar = this.avatar;
        if (!avatar.has("stand-up") || !avatar.has(SITTING)) return null;
        const length = avatar.animation.actions["stand-up"].getClip().duration;
        const sitting = avatar.hipsAt(SITTING, 0);
        const start = avatar.hipsAt("stand-up", 0);
        const end = avatar.hipsAt("stand-up", length);
        if (!sitting || !start || !end) return null;
        const turn = pose.quaternion;
        const root = pose.position.clone().add(sitting.sub(start).applyQuaternion(turn));
        const stood = end.setY(0).applyQuaternion(turn).add(root).setY(seat.floor);
        const along = avatar.bonesAlong("stand-up", LIMB_BONES, ROOM_LOOKS);
        if (!along) return null;
        const poses = along.slice(1).map(({ time, bones }) => placed(bones, turn, _feet.set(root.x, root.y + (seat.floor - root.y) * smooth(THREE.MathUtils.clamp(time / length / 0.5, 0, 1)), root.z)));
        return { root, stood, length, poses };
    }

    /**
     * How the figure sits down on a seat by its `sit-down` clip, where it has
     * it (Avatar.wear), from where it stands (`start`, its root's place and
     * turn) into the seat's `pose` (Seats.poseFor, facing the seat's way or
     * turned to a side): to where the clip's root stands (sitByClip), on
     * foot (route: walked, then turned on the spot), the clip's own length
     * at its pace, and the whole. Null without the clip, for a figure whose
     * clips do not move its hips, or where there is no room for it — the
     * figure sitting down from there, the walk there (its legs and feet as
     * they swing) or the turn on the spot there meets anything but the
     * seat's own piece (Seats.roomFor, wayClear, turnClear: a chair drawn up
     * to a table, a coffee table before a sofa): the figure then sits down
     * on foot (walkPlan).
     */
    sitPlan(seat, pose, start) {
        const seats = this.experience.world.seats;
        const clip = this.sitByClip(seat, pose);
        if (!clip || !seats.roomFor(seat, clip.poses, seats.own(seat, { side: pose.side }))) return null;
        const { at, endY } = clip;
        const far = Math.hypot(start.position.x - at.x, start.position.z - at.z);
        const walk = far > WALK_OVER;
        const travel = Math.atan2(at.x - start.position.x, at.z - start.position.z);
        // ...and for the way there, and the turn on the spot there (from the way it walked, or the way it stood).
        // (Of the seat's own piece, only what is round the seat: Seats.own's `near`.)
        const near = seats.own(seat, { near: true, side: pose.side });
        if (walk && !seats.wayClear(seat, start.position, at, this.walkingLegs(), near)) return null;
        const idle = this.avatar.bonesAt("idle", 0, LIMB_BONES);
        if (!idle || !seats.turnClear(seat, at, idle, walk ? travel : yawOf(start.quaternion), yawOf(pose.quaternion), near)) return null;
        // Walked there facing the way it goes, then turned to its back to the seat; or, there already, turned on the spot.
        const route = walk ? routeOf([start.position, at], start.quaternion, pose.quaternion) : null;
        const approach = route ? route.time : Math.max(APPROACH_LEAST, start.quaternion.angleTo(pose.quaternion) / TURN_RATE, (1.5 * far) / APPROACH_PACE);
        const length = clip.length / ONCE["sit-down"];
        return { by: "clip", at, endY, route, approach, clip: length, total: approach + length, clear: true };
    }

    /**
     * How the figure sits down on a seat without the clip, or the room for
     * it: on foot from where it stands (`start`) to where it stands at the
     * seat (standSpot), turned there to the way it is to sit (the seat's, or
     * turned to a side), and sat down where it stands, its root going down
     * onto the seat as sitting fades in (sitTime). The way there (ways):
     * straight there where its body, as it walks, meets nothing but the
     * seat's own piece, and the turn at its end too; else round what is in
     * the way (Seats.wayRound, `most` of its grid's spots looked at at most);
     * none found, straight there all the same — `clear`, whether the way
     * taken is not that.
     */
    walkPlan(seat, pose, start, { most } = {}) {
        const ways = this.ways(seat, pose);
        const at = ways.stood.at;
        const straight = ways.clear(start.position, at) && ways.turns(at, start.position, null);
        const round = straight ? null : this.experience.world.seats.wayRound(seat, start.position, at, ways.legs, ways.except, { most });
        const route = routeOf(round ?? [start.position, at], start.quaternion, pose.quaternion);
        const down = this.sitTime(ways.stood, pose);
        return { by: "walk", at, route, approach: route.time, down, total: route.time + down, clear: straight || Boolean(round) };
    }

    /**
     * What the ways on foot to a seat and from it are looked over by (walkPlan,
     * walkOffPlan): where the figure stands at the seat (`stood`, standSpot's),
     * what of the seat's own piece is round the seat (Seats.own, `near`, for
     * the side it sits to), the figure's walking and standing body
     * (walkingLegs; idle at its start), and, each answer kept for the plan,
     * whether a walk from one place to another is clear (`clear`, Seats.
     * wayClear) and whether a turn on the spot at a place — from the way it
     * came there from `from` (or, null, the way it sits) to the way it
     * goes on to `to` (or the way it sits) — is (`turns`, Seats.turnClear).
     */
    ways(seat, pose) {
        const seats = this.experience.world.seats;
        const stood = this.standSpot(seat, pose, seats.own(seat, { side: pose.side }));
        // (Of the seat's own piece, what is round the seat itself: a way along a sofa is not walked over its other places.)
        const except = seats.own(seat, { near: true, side: pose.side });
        const legs = this.walkingLegs();
        const idle = this.avatar.bonesAt("idle", 0, LIMB_BONES);
        const faces = yawOf(pose.quaternion);
        const known = new Map();
        const key = (...points) => points.map((point) => (point ? `${point.x.toFixed(3)},${point.z.toFixed(3)}` : "-")).join(">");
        const remember = (name, test) => {
            if (!known.has(name)) known.set(name, test());
            return known.get(name);
        };
        const way = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
        return {
            seat,
            pose,
            stood,
            except,
            legs,
            clear: (a, b) => Math.hypot(b.x - a.x, b.z - a.z) < 0.05 || remember(`w${key(a, b)}`, () => seats.wayClear(seat, a, b, legs, except)),
            turns: (at, from, to) => !idle || remember(`t${key(at, from, to)}`, () => seats.turnClear(seat, at, idle, from ? way(from, at) : faces, to ? way(at, to) : faces, except)),
        };
    }

    /**
     * Where the figure stands at a seat, on foot (walkPlan, walkOffPlan): its
     * root on the seat's floor, facing the way it sits (`pose`: the seat's
     * way, or turned to a side). Before the seat — its feet where they are
     * sat, its hips come forward over them — where its body has room to
     * stand there (Seats.roomFor); else where it sits, its hips straight over
     * where they are sat, or as little further back as gives it room
     * (STAND_BACK at most, a chair pushed back as one stands up): at a chair
     * drawn up to a table its feet are under the table, and stood straight
     * up its knees were in the table's top. Where none has, where it sits.
     * `{ at, before }`.
     */
    standSpot(seat, pose, except) {
        const avatar = this.avatar;
        const seats = this.experience.world.seats;
        const turn = pose.quaternion;
        const y = seat.floor + this.rootOver();
        const sat = avatar.bonesAt(SITTING, 0, ["Hips", "LeftFoot", "RightFoot"]);
        const idle = avatar.bonesAt("idle", 0, LIMB_BONES);
        const middle = (bones) => (bones?.LeftFoot && bones?.RightFoot ? bones.LeftFoot.clone().add(bones.RightFoot).multiplyScalar(0.5) : null);
        const satFeet = middle(sat);
        const idleFeet = middle(idle);
        const room = (at) => idle && seats.roomFor(seat, [placed(idle, turn, at)], except);
        if (satFeet && idleFeet) {
            const before = satFeet.applyQuaternion(turn).add(pose.position).sub(idleFeet.applyQuaternion(turn)).setY(y);
            if (room(before)) return { at: before, before: true };
        }
        const at = pose.position.clone();
        if (sat?.Hips && idle?.Hips) at.add(sat.Hips.clone().sub(idle.Hips).applyQuaternion(turn));
        at.setY(y);
        for (let back = 0; back <= STAND_BACK + 1e-6; back += 0.05) {
            const spot = new THREE.Vector3(at.x - pose.face[0] * back, y, at.z - pose.face[1] * back);
            if (room(spot)) return { at: spot, before: false };
        }
        return { at, before: false };
    }

    /**
     * How long sitting down from where the figure stands at a seat
     * (standSpot's `stood`), or standing up there, takes on foot: SIT_BLEND,
     * or as long as keeps its hips — over its root as it stands, over the
     * seat sat (the root's place, posed so: `pose`) — to STAND_PACE across
     * the floor, and to STAND_BACK_PACE where it stands back from the seat.
     */
    sitTime(stood, pose) {
        const sat = this.avatar.bonesAt(SITTING, 0, ["Hips"])?.Hips;
        const hips = sat ? sat.clone().applyQuaternion(pose.quaternion).add(pose.position) : pose.position;
        const across = Math.hypot(hips.x - stood.at.x, hips.z - stood.at.z);
        return Math.max(SIT_BLEND, across / (stood.before ? STAND_PACE : STAND_BACK_PACE));
    }

    /**
     * Spots round `centre` at a seat — AROUND far (or `around`), every eighth of a turn —
     * a figure could stand in (Seats.figureAt), or, `capsule`, the capsule
     * could too (Seats.freeAt: the end of a way off the seat, where the
     * capsule is put), each as the root's place on the seat's floor. Where
     * the figure stands in the seat, not before it, none back through the
     * seat (NOT_BACK: behind the way it sits).
     */
    ring(seat, stood, centre, { except, pose }, { capsule = false, around = AROUND } = {}) {
        const seats = this.experience.world.seats;
        const body = this.player.collider;
        const y = seat.floor + this.rootOver();
        const [fx, fz] = pose.face;
        const spots = [];
        for (const out of around) {
            for (let k = 0; k < 8; k++) {
                const x = centre.x + Math.sin((k * Math.PI) / 4) * out;
                const z = centre.z + Math.cos((k * Math.PI) / 4) * out;
                const length = Math.hypot(x - stood.at.x, z - stood.at.z) || 1;
                if (!stood.before && ((x - stood.at.x) * fx + (z - stood.at.z) * fz) / length <= NOT_BACK) continue;
                if (capsule ? seats.freeAt(x, z, seat.floor, body.radius, this.player.height) : seats.figureAt(seat, x, z, except)) spots.push(new THREE.Vector3(x, y, z));
            }
        }
        return spots;
    }

    /** The figure's body at WALK_LOOKS moments of its walking clip, in its root's frame (Avatar.bonesAlong): how its way across the floor is looked over (Seats.wayClear). */
    walkingLegs() {
        return this.avatar.bonesAlong("walking", LIMB_BONES, WALK_LOOKS)?.slice(0, -1) ?? [];
    }

    /**
     * The body sitting down and getting up are looked over for room by
     * (sitPlan, risePlan, walkPlan, seatPose: Avatar.bonesAlong, some 10 ms a
     * clip on a copy of the figure) measured ahead, between frames — and a
     * public view's catalogue of the furniture fetched (Seats.catalogue):
     * once a seat is offered, not in the frame E is pressed. Once a figure.
     */
    prepareSitting() {
        const avatar = this.avatar;
        if (!avatar || this.sittingPrepared === avatar) return;
        this.sittingPrepared = avatar;
        this.experience.world.seats?.catalogue();
        const later = window.requestIdleCallback ?? ((call) => setTimeout(call, 0));
        avatar.wear(this.experience).then(() => {
            later(() => avatar.bonesAlong("sit-down", LIMB_BONES, ROOM_LOOKS));
            later(() => avatar.bonesAlong("stand-up", LIMB_BONES, ROOM_LOOKS));
            later(() => avatar.bonesAlong("walking", LIMB_BONES, WALK_LOOKS));
            later(() => avatar.bonesAt("idle", 0, LIMB_BONES));
        });
    }

    /**
     * How the figure gets up off its seat by its `stand-up` clip, where it
     * has it (riseByClip): where the capsule stands up to (`spot`) — where
     * the clip stands it, or as little further on the way it faces as it can
     * stand (Seats.freeAt: at the clip's end the seat's own front is in a
     * capsule of the visitor's girth, which no walk could stand in), RISE_ON
     * at most, stepped to at STEP_PACE as standing fades in; and the clip's
     * length at its pace. Null without the clip, or where there is no room
     * for it — no spot, or the body getting up meets anything but the seat's
     * own piece (Seats.roomFor: a table, the pendant over it): the figure
     * then gets up on foot (walkOffPlan).
     */
    risePlan(seated) {
        const seats = this.experience.world.seats;
        if (!seats) return null;
        const { seat, pose } = seated;
        const clip = this.riseByClip(seat, pose);
        if (!clip) return null;
        const { root, stood } = clip;
        let spot = null;
        for (let on = 0; on <= RISE_ON + 1e-6 && !spot; on += 0.05) spot = seats.freeAt(stood.x + pose.face[0] * on, stood.z + pose.face[1] * on, seat.floor, this.player.collider.radius, this.player.height);
        if (!spot || !seats.roomFor(seat, clip.poses, seats.own(seat, { side: pose.side }))) return null;
        const away = Math.hypot(spot.x - stood.x, spot.z - stood.z);
        return { by: "clip", root, stood, spot, floor: seat.floor, clip: clip.length / ONCE["stand-up"], settle: Math.max(RISE_SETTLE, away / STEP_PACE), walk: false };
    }

    /**
     * How the figure gets up off its seat without the clip, or the room for
     * it: it stands up where it sits (standSpot), standing fading in as its
     * root goes there from the seat's (sitTime); turns there to where the
     * visitor stood before sitting and walks there — or, its way there
     * blocked (ways: its body as it walks meets anything but the seat's own
     * piece, or the turn there does), or sat on from afar (`afar`: not back
     * across the room), to the nearest spot round it the capsule can stand in
     * that has a clear way to it. Where none has: round what is in the way
     * (Seats.wayRound) to where the visitor stood — or, from afar, to the
     * nearest of those spots — or else straight there all the same; where
     * the capsule stands (`spot`, its foot).
     */
    walkOffPlan(seated) {
        const { seat, pose, from, afar } = seated;
        const ways = this.ways(seat, pose);
        const { stood } = ways;
        const at = stood.at;
        const off = (spot) => ways.turns(at, null, spot) && ways.clear(at, spot);
        const back = new THREE.Vector3(from.x, at.y, from.z);
        let points = !afar && off(back) ? [at, back] : null;
        if (!points) {
            // (From afar, with none of those, further round: not back across the room while anywhere nearer is free.)
            let round = this.ring(seat, stood, at, ways, { capsule: true });
            if (afar && !round.length) round = this.ring(seat, stood, at, ways, { capsule: true, around: AROUND_FAR });
            const near = round.sort((a, b) => a.distanceTo(at) - b.distanceTo(at)).slice(0, VIA_TRIES);
            const end = near.find(off);
            const to = afar && near.length ? near[0] : back;
            points = end ? [at, end] : (this.experience.world.seats.wayRound(seat, at, to, ways.legs, ways.except) ?? [at, to]);
        }
        const to = points[points.length - 1];
        const up = this.sitTime(stood, pose);
        const route = routeOf(points, pose.quaternion, null);
        const spot = new THREE.Vector3(to.x, seat.floor + this.player.collider.radius, to.z);
        return { by: "walk", at, up, route, spot, total: up + route.time };
    }

    /**
     * Get up: the capsule put where the figure stands up to — by the
     * `stand-up` clip, where the figure has it and there is room for it
     * (risePlan), else on foot (walkOffPlan) — and waiting there until the
     * figure has (updateRising): the walking keys pressed meanwhile walk off
     * then; the camera from the seated head to the capsule's, and the view
     * the visitor sat in (or chose while seated) back. Before the figure has
     * come to a seat sat on from afar — fading out where it stood or in where
     * it walks on from — whole again where it is seen, or where it stood
     * (fadeBack). `now`, at once, the capsule where the visitor stood before
     * sitting (or, before the figure has come, where it is seen, if free) and
     * the figure in it, whole: going into edit mode, to a spawn or a room,
     * into a car.
     */
    stand({ now = false } = {}) {
        const seated = this.seated;
        if (!seated) return;
        this.seated = null;
        const body = this.player.collider;
        const back = seated.prelude && seated.time < seated.prelude.time ? this.fadeBack(seated) : null;
        const plan = now ? null : (back ?? this.risePlan(seated) ?? this.walkOffPlan(seated));
        body.start.copy(back?.spot ?? plan?.spot ?? seated.from);
        body.end.copy(body.start);
        body.end.y += this.player.height;
        this.player.velocity.set(0, 0, 0);
        this.player.animation = plan?.by === "clip" ? "stand-up" : "idle";
        if (plan?.by === "clip") this.avatar.animation.play("stand-up", RISE_FADE);
        // (Fading back, it stands as it stood meanwhile: idle.)
        else if (plan?.by !== "fade") this.avatar.animation.play("idle", now ? undefined : plan.up);
        if (this.camera.mode !== seated.mode) {
            if (seated.mode === "first") this.camera.setFirstPerson();
            else this.camera.setThirdPerson();
            this.experience.world.emit("view", seated.mode);
        }
        if (seated.mode === "third") this.orbitOut(seated.distance);
        this.rising = now ? null : { position: this.avatar.avatar.position.clone(), quaternion: this.avatar.avatar.quaternion.clone(), pivot: this.pivot().clone(), t: 0, plan, time: 0, settling: false, part: null };
        // At once, the figure where it stands up to, whole: edit mode, which comes next, does not move it.
        if (now) {
            this.avatar.setOpacity(1);
            this.avatar.avatar.position.copy(body.end);
            this.avatar.avatar.position.y -= 1.56;
            if (back) this.avatar.avatar.quaternion.copy(back.after.quaternion);
        }
    }

    /**
     * Getting up before the figure has come to a seat sat on from afar
     * (stand), while it fades out where it stood or in where it is put to
     * walk on from (sitPose's prelude): whole again where it is seen — faded
     * back in where it stood, or on in where it was put, where the capsule
     * can stand there (Seats.spotBeside's spot) — or, put where none can
     * (where it stands at the seat to sit down, in its chair), faded out
     * there and in again where it stood; from as far as it had come, at
     * DISSOLVE's pace. Got up whole at once where it was put, in a chair at
     * a table, the figure was pushed out 0.65 m and then 0.12 m more, seen
     * whole. `{ by: "fade", spot, back, out, total, opacity, seen, after }`:
     * the capsule's foot; whether it is put back where it stood; how long it
     * fades out first, and all of it, near enough (it is done once it is
     * whole: updateRising); how far it is drawn now; where it is seen fading
     * out (its root's place and turn), and where fading in.
     */
    fadeBack(seated) {
        const { prelude, start, seat } = seated;
        const avatar = this.avatar.avatar;
        const opacity = this.avatar.opacity;
        // (Seen where it walks on from, past the first half: sitPose.)
        const put = seated.time >= DISSOLVE;
        const stays = !put || prelude.free;
        const seen = { position: avatar.position.clone(), quaternion: avatar.quaternion.clone() };
        const after = stays ? seen : { position: prelude.position.clone(), quaternion: prelude.quaternion.clone() };
        const spot = put && prelude.free ? new THREE.Vector3(start.position.x, seat.floor + this.player.collider.radius, start.position.z) : prelude.stood.clone();
        const out = stays ? 0 : opacity * DISSOLVE;
        return { by: "fade", spot, back: !stays, out, total: out + (1 - (stays ? opacity : 0)) * DISSOLVE + this.time.delta, opacity, seen, after };
    }

    /** Whether the figure is fading out or in (sitPose's prelude, fadeBack): drawn see-through on purpose — else always whole (update). */
    fading() {
        return Boolean((this.seated?.prelude && !this.seated.prelude.done) || this.rising?.plan?.by === "fade");
    }

    /** Seated, up off the seat — told to the world as anything done is (Player.act: "interact", standing). */
    getUp() {
        const target = this.experience.world.interactables?.of("seat", this.seated?.seat);
        if (target) this.act(target);
        else this.stand();
    }

    /**
     * What is offered to someone seated, on E: whatever a kind of thing to
     * act on offers to someone on that seat — a provider's `seated(seat,
     * eye, player)` (World/Interactables.js), a television in front of it,
     * say — or else getting up (World/Seats.js's, `of` the seat sat on).
     */
    seatedOffer() {
        const interactables = this.experience.world.interactables;
        const seated = this.seated;
        if (!interactables || !seated) return null;
        for (const provider of interactables.providers) {
            const candidate = provider.seated?.(seated.seat, seated.pose.eye, this);
            if (!candidate) continue;
            candidate.provider = provider;
            return candidate;
        }
        return interactables.of("seat", seated.seat);
    }

    /** Whether sitting down or getting up is still under way — the figure, the camera or the view turning (Pace.js, through World/Seats.js's busy). */
    settling() {
        return Boolean((this.seated && (this.seated.t < 1 || this.seated.look)) || this.rising);
    }

    /**
     * Seated, turn the view to look at a point from the figure's eyes, in
     * first person — a television switched on in front of the seat (World/
     * Screens.js) — easing round over LOOK_TURN. The view the visitor sat in
     * comes back as they get up (stand). From above, nothing: that view is
     * never taken away from them.
     */
    lookFromSeat(point) {
        const seated = this.seated;
        if (!seated || this.camera.birdView?.active) return;
        if (this.camera.mode !== "first") {
            this.camera.setFirstPerson();
            this.experience.world.emit("view", "first");
        }
        this.easeLook(_offset.subVectors(point, seated.pose.eye), LOOK_TURN);
    }

    /**
     * Seated, the view eased round to look along `direction` over `seconds`
     * (updateSeated) — or round it, `pitch` radians down.
     */
    easeLook(direction, seconds, { pitch = null } = {}) {
        if (!this.seated) return;
        const d = _offset.copy(direction).normalize();
        const from = this.lookAngles();
        const to = { h: Math.atan2(-d.x, -d.z), v: pitch ?? Math.asin(THREE.MathUtils.clamp(-d.y, -1, 1)) };
        this.seated.look = { from, to, t: 0, time: seconds };
    }

    /**
     * Which way the camera looks round the point it turns round, as the
     * look angles under pointer lock are (Camera.js): `h` round, `v` up —
     * the camera on the far side of the point from where it looks.
     */
    lookAngles() {
        if (this.camera.scheme === "pointerLock") return { h: this.camera.angles.horizontal, v: this.camera.angles.vertical };
        const offset = _offset.subVectors(this.player.body.position, this.camera.controls.target);
        const length = offset.length() || 1;
        return { h: Math.atan2(offset.x, offset.z), v: Math.asin(THREE.MathUtils.clamp(offset.y / length, -1, 1)) };
    }

    /** The camera turned so (lookAngles), about the point it turns round, as far from it as it is. */
    setLookAngles(h, v) {
        const camera = this.camera;
        if (camera.scheme === "pointerLock") {
            const first = camera.mode === "first";
            camera.angles.horizontal = h;
            camera.angles.vertical = THREE.MathUtils.clamp(v, first ? camera.FIRST_MIN_VERTICAL : camera.THIRD_MIN_VERTICAL, first ? camera.FIRST_MAX_VERTICAL : camera.THIRD_MAX_VERTICAL);
            return;
        }
        const target = camera.controls.target;
        const length = Math.max(this.player.body.position.distanceTo(target), 0.001);
        this.player.body.position.copy(target).add(_offset.set(Math.sin(h) * Math.cos(v), Math.sin(v), Math.cos(h) * Math.cos(v)).multiplyScalar(length));
        this.player.body.updateMatrixWorld();
    }

    /** Where the camera turns round now: the look angles' pivot (pointer lock), or the orbit controls' target. */
    pivot() {
        return this.camera.scheme === "pointerLock" ? this.camera.target : this.camera.controls.target;
    }

    /**
     * The camera's pivot moved to `point`, the camera with it — as walking
     * moves it (updateColliderMovement). Not from above, nor from edit mode:
     * those views have cameras of their own.
     */
    pivotTo(point) {
        if (this.camera.birdView?.active || this.remote) return;
        if (this.camera.scheme === "pointerLock") {
            this.camera.target.copy(point);
            return;
        }
        this.player.body.position.sub(this.camera.controls.target);
        this.camera.controls.target.copy(point);
        this.player.body.position.add(point);
        this.player.body.updateMatrixWorld();
    }

    /**
     * On a touch screen, the camera back out from the head to `distance`
     * (or the third person's own, THIRD_DISTANCE) where first person left it
     * collapsed onto the eye: got up into third person after a television
     * turned the view to first (lookFromSeat), the orbit controls' least
     * distance alone left it 5 cm from the head, in the figure's skull. Still
     * looking the way it looked. A camera the visitor has drawn in or out
     * themselves, further than that, is left where it is.
     */
    orbitOut(distance) {
        if (this.camera.scheme !== "orbit" || this.camera.birdView?.active) return;
        const target = this.camera.controls.target;
        const body = this.player.body;
        const offset = _offset.subVectors(body.position, target);
        if (offset.length() > ORBIT_COLLAPSED) return;
        // (So close, which way it is from the head is the way it looks, backwards.)
        if (offset.lengthSq() < 1e-10) offset.set(0, 0, 1).applyQuaternion(body.quaternion);
        const out = distance > ORBIT_COLLAPSED ? distance : this.camera.THIRD_DISTANCE;
        body.position.copy(target).addScaledVector(offset.normalize(), Math.min(out, this.camera.THIRD_DISTANCE));
        body.updateMatrixWorld();
    }

    /**
     * Seated, each frame: the figure on its way onto the seat (or on it),
     * its clip played (sitPose); the camera turning round the seated head —
     * in first person at its eyes — eased there from where it was; the view
     * turning to what it is to look at (lookFromSeat).
     */
    updateSeated() {
        const seated = this.seated;
        const delta = this.time.delta;
        const avatar = this.avatar.avatar;
        seated.time += delta;
        seated.t = Math.min(1, seated.time / (seated.plan.total + (seated.prelude?.time ?? 0)));
        const k = smooth(seated.t);
        this.sitPose(seated);
        // (Its own in first person is hidden — the camera would be in its head; from above the view decides.)
        if (!this.remote) avatar.visible = this.camera.mode !== "first";
        this.avatar.animation.update(delta);
        this.pivotTo(_pivot.lerpVectors(seated.pivot, this.camera.mode === "first" ? seated.pose.eye : seated.pose.head, k));
        const look = seated.look;
        if (look) {
            look.t = Math.min(1, look.t + delta / look.time);
            const turned = smooth(look.t);
            this.setLookAngles(look.from.h + wrapAngle(look.to.h - look.from.h) * turned, look.from.v + (look.to.v - look.from.v) * turned);
            if (look.t >= 1) seated.look = null;
        }
    }

    /**
     * Sitting down (sitPlan, walkPlan), the figure this frame: on its way to
     * where it sits down from (routeOf: turned on the spot the way it is to
     * go, walked there facing it, turned there on the spot to its back to
     * the seat) — or, there already, turning on the spot. Then by the clip, its
     * root on the floor there and let down (or up) to the seat's height over
     * its second half, so its hips come down onto the seat; and over its
     * last SIT_SETTLE, the seat's own sitting clip fading in as the root
     * goes, in step (linearly, as the fade weighs the two), to the seat's —
     * the hips staying on the seat as the one clip gives way to the other.
     * On foot, sitting fading in as the root goes from where it stands to the
     * seat's, in step. What the figure plays is told to everyone else as it
     * changes.
     */
    sitPose(seated) {
        const { plan, pose, start, prelude } = seated;
        const figure = this.avatar;
        const avatar = figure.avatar;
        let time = seated.time;
        if (prelude) {
            if (time < prelude.time) {
                // Sat on from afar: faded out where it stood, and in where it walks on from (DISSOLVE each), standing still.
                const out = time < DISSOLVE;
                avatar.position.copy(out ? prelude.position : start.position);
                avatar.quaternion.copy(out ? prelude.quaternion : start.quaternion);
                figure.setOpacity(out ? 1 - smooth(time / DISSOLVE) : smooth((time - DISSOLVE) / DISSOLVE));
                this.playPart(seated, "idle");
                return;
            }
            if (!prelude.done) {
                prelude.done = true;
                figure.setOpacity(1);
            }
            time -= prelude.time;
        }
        if (time < plan.approach) {
            if (plan.route) this.playPart(seated, followRoute(plan.route, time, avatar.position, avatar.quaternion));
            else {
                // (There already, within WALK_OVER: turned on the spot.)
                const k = smooth(time / plan.approach);
                avatar.position.lerpVectors(start.position, plan.at, k);
                avatar.quaternion.slerpQuaternions(start.quaternion, pose.quaternion, k);
                this.playPart(seated, "idle");
            }
            return;
        }
        const into = time - plan.approach;
        avatar.quaternion.copy(pose.quaternion);
        if (plan.by === "walk") {
            if (seated.part !== "settle") {
                seated.part = "settle";
                this.player.animation = pose.clip ?? SITTING;
                figure.animation.play(SITTING, plan.down);
            }
            avatar.position.lerpVectors(plan.at, pose.position, Math.min(1, into / plan.down));
            return;
        }
        if (seated.part !== "sit-down" && seated.part !== "settle") {
            seated.part = "sit-down";
            this.player.animation = "sit-down";
            figure.animation.play("sit-down");
        }
        const lower = smooth(THREE.MathUtils.clamp((into / plan.clip - 0.5) / 0.5, 0, 1));
        avatar.position.set(plan.at.x, plan.at.y + (plan.endY - plan.at.y) * lower, plan.at.z);
        const settle = into - (plan.clip - SIT_SETTLE);
        if (settle < 0) return;
        if (seated.part !== "settle") {
            seated.part = "settle";
            this.player.animation = pose.clip ?? SITTING;
            figure.animation.play(SITTING, SIT_SETTLE);
        }
        avatar.position.lerp(pose.position, Math.min(1, settle / SIT_SETTLE));
    }

    /** The figure on foot playing `part` (walking or idle), told to everyone else, as it changes: `state` (seated, rising) keeps which. */
    playPart(state, part) {
        if (state.part === part) return;
        state.part = part;
        this.player.animation = part;
        this.avatar.animation.play(part);
    }

    /**
     * Getting up. By the clip (risePlan): the capsule waits where it was put
     * while the figure stands up — fading from sitting into the clip over
     * RISE_FADE, its root going (linearly, as the fade weighs the two) from
     * the seat's to the clip's, whose hips are where the sitting clip's
     * were, let down to the floor over the clip's first half — and at its
     * end fades into standing, or walking where a walking key is held, over
     * RISE_SETTLE, the root going to where the capsule stands — a step
     * forward, the way it faces, at STEP_PACE, where that is a little on from
     * where it stood up; the camera from the seated head to the capsule's
     * all the while. On foot (walkOffPlan): the capsule waits where the
     * figure walks to, while it stands up where it sits — standing fading in
     * as its root goes there from the seat's, in step — turns, and walks
     * there (routeOf); the camera from the seated head to the figure's, then
     * with it. Out of the water onto the pool's steps (Swim.js), no plan:
     * each frame after the capsule has moved (it walks from the first frame),
     * the figure and the camera's pivot eased from where they were to where
     * the capsule has them now.
     */
    updateRising() {
        const rising = this.rising;
        const plan = rising.plan;
        const avatar = this.avatar.avatar;
        const delta = this.time.delta;
        if (!plan) {
            rising.t = Math.min(1, rising.t + delta / SIT_BLEND);
            const k = smooth(rising.t);
            avatar.position.lerpVectors(rising.position, avatar.position, k);
            this.pivotTo(_pivot.lerpVectors(rising.pivot, this.player.collider.end, k));
            if (rising.t >= 1) this.rising = null;
            return;
        }
        rising.time += delta;
        rising.t = Math.min(1, rising.time / (plan.by === "clip" ? plan.clip + plan.settle : plan.total));
        const body = this.player.collider;
        if (plan.by === "fade") {
            // Got up before it came to a seat from afar (fadeBack): faded out where it is seen, if it is to be put back where
            // it stood, and in there — drawn there first not at all — or on in where it is; standing still, the capsule
            // waiting where it is to be.
            const out = rising.time < plan.out;
            if (!out && plan.back) rising.backAt ??= rising.time;
            const opacity = out ? plan.opacity - rising.time / DISSOLVE : plan.back ? (rising.time - rising.backAt) / DISSOLVE : plan.opacity + rising.time / DISSOLVE;
            const where = out ? plan.seen : plan.after;
            avatar.position.copy(where.position);
            avatar.quaternion.copy(where.quaternion);
            if (!this.remote) avatar.visible = this.camera.mode !== "first";
            this.avatar.animation.update(delta);
            this.pivotTo(_pivot.lerpVectors(rising.pivot, body.end, smooth(rising.t)));
            if (!out && opacity >= 1) {
                this.avatar.setOpacity(1);
                this.rising = null;
                this.jumpOnce = false;
                return;
            }
            this.avatar.setOpacity(THREE.MathUtils.clamp(opacity, 0, 1));
            return;
        }
        if (plan.by === "walk") {
            if (rising.time < plan.up) {
                avatar.position.lerpVectors(rising.position, plan.at, rising.time / plan.up);
                avatar.quaternion.copy(rising.quaternion);
                rising.part ??= "idle";
            } else this.playPart(rising, followRoute(plan.route, rising.time - plan.up, avatar.position, avatar.quaternion));
            if (!this.remote) avatar.visible = this.camera.mode !== "first";
            this.avatar.animation.update(delta);
            // (The capsule's head over the figure's root, as walking has it.)
            this.pivotTo(_pivot.lerpVectors(rising.pivot, _offset.copy(avatar.position).setY(avatar.position.y + 1.56), smooth(Math.min(1, rising.time / plan.up))));
            if (rising.t >= 1) {
                this.rising = null;
                this.jumpOnce = false;
            }
            return;
        }
        const up = smooth(THREE.MathUtils.clamp(rising.time / plan.clip / 0.5, 0, 1));
        avatar.position.set(plan.root.x, plan.root.y + (plan.floor - plan.root.y) * up, plan.root.z);
        // (From where the figure was: on the seat, or still sitting down onto it.)
        if (rising.time < RISE_FADE) avatar.position.lerpVectors(rising.position, avatar.position, rising.time / RISE_FADE);
        const settle = rising.time - plan.clip;
        if (settle >= 0) {
            if (!rising.settling) {
                rising.settling = true;
                const next = plan.walk || this.isMoving() ? "walking" : "idle";
                this.player.animation = next;
                // (Faded over as long as the root takes to get there: the two, weighed alike, keep the hips going straight.)
                this.avatar.animation.play(next, plan.settle);
            }
            // (Not turned on the way: the clip's hips are half a metre before its root, and turning the root swung them aside.)
            avatar.position.lerp(_feet.copy(body.end).setY(body.end.y - 1.56), Math.min(1, settle / plan.settle));
        }
        if (!this.remote) avatar.visible = this.camera.mode !== "first";
        this.avatar.animation.update(delta);
        this.pivotTo(_pivot.lerpVectors(rising.pivot, body.end, smooth(rising.t)));
        if (rising.t >= 1) {
            this.rising = null;
            this.jumpOnce = false;
        }
    }

    /**
     * What the on-screen prompt offers, and on which key: at the wheel,
     * getting out; a car in reach, driving it — the more particular thing to
     * be standing beside, on a key of its own, so whatever is aimed at is
     * still on E; then whatever the crosshair is on; then the nearest door
     * (World/Interactables.js's offer). Told to the world ("prompt") only as
     * it changes — keyed on what it says, so it turns from Open to Close the
     * moment a door is opened, not once it has swung.
     */
    updatePrompt() {
        const interactables = this.experience.world.interactables;
        if (!interactables) return;

        let offer;
        if (this.inVehicle) offer = interactables.driving(this.currentCar);
        else if (this.seated) offer = this.seatedOffer();
        // Afloat, the pool's edge where it is near enough to climb out over (Swim.js); climbing, nothing.
        else if (this.swimmer.swimming) offer = this.swimmer.climb ? null : this.swimmer.offer();
        else {
            offer = interactables.offer(this.target, this.player.collider.end);
            // (Nothing aimed at — from above, never: a seat there may be nearer than the nearest door.)
            if (!this.target && offer?.kind !== "car") offer = this.unaimed(offer);
        }
        const prompt = interactables.prompt(offer);
        // (All of what it says: what another key does there too — seated before a television, Space gets up, and
        // standing, aimed at the same set, it does not.)
        const also = prompt?.also ? `${prompt.also.key}:${prompt.also.label}` : "";
        const signature = prompt ? `${offer.kind}:${offer.id}:${prompt.key}:${prompt.label}|${also}|${prompt.touch?.label ?? ""}:${prompt.touch?.icon ?? ""}` : null;
        if (signature === this.promptSignature) return;
        this.promptSignature = signature;
        this.experience.world.emit("prompt", prompt);
    }

    getLookDirection() {
        return new THREE.Vector3(0, 0, -1).applyQuaternion(
            this.camera.perspectiveCamera.quaternion
        );
    }

    /**
     * What the crosshair is pointing at.
     *
     * How far it sees is found here, as it always was: in the editor, the
     * first of the scene's meshes the look ray meets (the real ones, under the
     * stand-ins, and only what the view's scope shows); in a public view the
     * house is only in the collision tree, which has the last word. What is
     * along it to act on — a door, a cupboard's door or a drawer, a light, and
     * whatever else World/Interactables.js has been given — is then that
     * module's to say (`this.target`), from what was met and its own tests.
     * Anything else met first is described for the inspect label: a named
     * surface (retextureable), a piece of furniture, an imported mesh. Either
     * is published ("look") so the HUD and the texture picker can act on it.
     */
    updateLookTarget() {
        if (this.player.interactionObjects.length === 0) return;

        // Looking down on a floor, there is no crosshair to aim with.
        if (this.camera.birdView?.active) {
            this.target = null;
            if (this.lookSignature !== null) {
                this.lookSignature = null;
                this.experience.world.emit("look", null);
            }
            return;
        }

        const builder = this.experience.world.sceneBuilder;
        const ray = this.player.raycaster.ray;
        const far = this.player.raycaster.far;

        // Cast from the head, not the camera — in third person the camera is
        // metres behind and would inspect whatever is nearest to it instead.
        ray.origin.copy(this.player.collider.end);
        ray.direction.copy(this.getLookDirection());

        // (three's own answer, from the scene's index: Utils/rays.js.)
        const intersects = rays.cast(this.player.raycaster, this.player.interactionObjects);
        // What the editor's view leaves out (World/Scope.js) is not there to be looked at.
        if (this.experience.world.scope && this.experience.world.scope.current !== "all") {
            while (intersects.length && !isShown(intersects[0].object)) intersects.shift();
        }

        let target = null;
        // How far the crosshair sees: to whatever solid it meets first.
        let sight = intersects.length ? intersects[0].distance : Infinity;

        // Built from a published runtime file, the house is only in the
        // collision tree, each triangle saying what it is part of.
        if (builder?.runtime) {
            const collision = this.experience.world.collision;
            // (No further than the crosshair reaches: every use of either below is of a hit within it.)
            const hit = collision.rayIntersect(ray, { far });
            // Its floors have tops and no undersides: seen from below, sight
            // stops at the floor above all the same.
            const seen = collision.rayIntersect(ray, { twoSided: true, far });
            if (seen && seen.distance <= far) sight = Math.min(sight, seen.distance);
            // A piece with doors or drawers collides as its box, shut, which
            // stands a handle's depth proud of them: its own doors and
            // drawers are aimed at through it — nothing else's.
            const first = intersects[0];
            const part = first && builder.openables.of(first.object);
            const through = part && hit && hit.triangle.label === part.node.userData.label && first.distance - hit.distance < SLACK.openable;
            const nearer = hit && !through && hit.distance <= far && (!intersects.length || hit.distance < intersects[0].distance);
            if (nearer) {
                intersects.length = 0;
                if (hit.triangle.label) target = { kind: "object", id: hit.triangle.label, label: hit.triangle.label };
            } else if (intersects.length && intersects[0].distance > sight + (part ? SLACK.openable : SLACK.default)) {
                // What the look ray met lies behind what the crosshair sees — a floor above, from below, which the
                // tree has only as its top: a door or a sofa upstairs, through the ceiling. Not seen, it is neither
                // acted on (shared/interact.js: nothing behind the sight is aimed at) nor named, as a bare ceiling
                // is not. (A piece's own doors and drawers behind its box are within the slack, as they are aimed.)
                intersects.length = 0;
            }
        }

        // What there is to act on along it: the first thing met, if it is a
        // door's leaf or a drawer; a light, or its switch, met by a ray of its
        // own — a light's box within 5 cm of a door is the light.
        const hit = intersects[0] ?? null;
        this.target = this.experience.world.interactables?.aim(ray, { hit, sight, far, head: this.player.collider.end }) ?? null;
        if (this.target) target = { kind: this.target.kind, id: this.target.id, label: this.target.label };
        else if (hit) target = this.describe(hit);

        const signature = target ? `${target.kind}:${target.surfaceId ?? target.id}` : null;
        if (signature !== this.lookSignature) {
            this.lookSignature = signature;
            this.experience.world.emit("look", target);
        }
    }

    /** What the crosshair has met that is not there to act on, for the inspect label: a named surface, else what it is part of. */
    describe(hit) {
        const resolved = this.experience.world.sceneBuilder?.resolveSurfaceHit(hit);
        if (resolved?.surface) {
            return {
                kind: "surface",
                surfaceId: resolved.surface.id,
                surfaceKind: resolved.surface.kind,
                finish: resolved.surface.finish,
                label: resolved.surface.label || resolved.surface.kind,
                point: hit.point.toArray(),
            };
        }
        // Furniture or an imported mesh.
        let owner = hit.object;
        while (owner && !owner.userData?.label) owner = owner.parent;
        if (!owner?.userData?.label) return null;
        return { kind: owner.userData.kind || "object", id: owner.userData.id, label: owner.userData.label };
    }

    /**
     * The room the visitor is in, told to the world ("room") as it changes:
     * the room's name on screen, and the room whose lights Q switches. Found
     * at the feet — which storey you are on is a question about what you
     * are standing on — by World/Whereabouts.js, as the room drawn live is:
     * half-way up a flight of stairs, the room at its nearer end, not the
     * bathroom it passes over; on a threshold, the room just left until the
     * next is entered. At the wheel, none: a car is in no room, and the
     * lights it has are its own.
     */
    updateRoomReadout() {
        const world = this.experience.world;
        const builder = world.sceneBuilder;
        const whereabouts = world.whereabouts;
        if (!builder || !whereabouts) return;

        let id = null;
        if (this.inVehicle) whereabouts.forget();
        else {
            const body = this.player.collider;
            id = whereabouts.follow(body.end.x, body.start.y - body.radius, body.end.z, this.time.delta);
        }
        if (id === this.currentRoomId) return;
        this.currentRoomId = id;
        this.room = id ? builder.spec.rooms.find((room) => room.id === id) ?? null : null;
        world.emit("room", this.room);
    }

    /**
     * The room the visitor is in, and its light switches (World/Switches.js,
     * LiveSwitches.js): what Q switches, and what the HUD's chip and touch
     * button show. Out of doors, at the wheel, or in a room with no switch:
     * none.
     *
     * @returns {{ room: object|null, items: object[] }}
     */
    roomLights() {
        const switches = this.experience.world.switches;
        const room = this.inVehicle ? null : this.room ?? null;
        return { room, items: room && switches?.inRoom ? switches.inRoom(room.id) : [] };
    }

    /**
     * Q: the lights of the room the visitor is in, all of them at once — if
     * any of its switches is on, all off; otherwise all on (shared/
     * interact.js's roomLightPlan) — wherever they stand in it, without
     * aiming at a light; from above, the room the avatar is in. The world is
     * told ("room-lights", `{ room, on, count }`), with a count of 0 where
     * there was nothing to switch: out of doors, or in a room without a
     * switch. Aiming at one light and E still switches that one alone.
     *
     * @returns {{ room: object, on: boolean, count: number }|null}  what was switched, or null
     */
    toggleRoomLights() {
        const world = this.experience.world;
        const { room, items } = this.roomLights();
        if (!items.length) {
            world.emit("room-lights", { room, on: null, count: 0 });
            return null;
        }
        const switches = world.switches;
        const plan = roomLightPlan(items, (id) => switches.isOn(id));
        // (A baked view's are shown switched at once, and lit as their lightmaps come: Switches.setMany.)
        switches.setMany(plan.ids, plan.on);
        const done = { room, on: plan.on, count: plan.ids.length };
        world.emit("room-lights", done);
        return done;
    }

    // ------------------------------------------------------------------

    update() {
        if (!this.avatar) return;
        // (Whole unless fading out or in on purpose: anything else that took it from a seat or from getting up meanwhile —
        // a spawn, a car, edit mode — or gave it back see-through leaves it so.)
        if (!this.fading()) this.avatar.setOpacity(1);

        if (!this.enabled && !this.remote) {
            // Paused, not frozen: the body stands where it was (or treads
            // water) and everyone else keeps moving.
            const rest = this.swimmer.swimming ? "treading" : "idle";
            this.player.animation = rest;
            this.avatar.animation.play(rest);
            this.avatar.animation.update(this.time.delta);
            this.updateOtherPlayers();
            return;
        }

        if (this.inVehicle) {
            if (this.camera.scheme === "orbit") this.steerWithJoystick();
            this.currentCar.update(this.time.delta);
            // Keep the body with the car so stepping out lands beside it.
            this.player.collider.start.copy(this.currentCar.group.position);
            this.player.collider.end.copy(this.currentCar.group.position);
            this.player.collider.end.y += this.player.height;
            this.updateOtherPlayers();
            // "Get out", in place of "Drive"; and in no room.
            if (this.enabled) {
                this.updatePrompt();
                this.updateRoomReadout();
            }
            return;
        }

        // Seated, the stick pushed gets the visitor up — and walking off on it.
        if (this.seated && this.actions.movingJoyStick && this.joystickVector.lengthSq() > STICK_UP * STICK_UP) this.getUp();
        if (this.seated) {
            this.updateSeated();
            this.updateOtherPlayers();
            if (!this.enabled) return;
            this.updatePrompt();
            this.updateRoomReadout();
            return;
        }

        // Getting up by the clip: the body waits where it stands up to until the figure has (updateRising).
        if (this.rising?.plan) {
            this.updateRising();
            this.updateOtherPlayers();
            if (!this.enabled) return;
            this.updatePrompt();
            this.updateRoomReadout();
            return;
        }

        this.updateColliderMovement();
        this.updateAvatarPosition();
        if (this.rising) this.updateRising();
        this.updateAvatarRotation();
        this.updateAvatarAnimation();
        this.updateAvatarFacing();
        this.updateAvatarPose();
        this.updateOtherPlayers();
        // Prompts and readouts are the walkthrough's; edit mode hides them.
        if (!this.enabled) return;
        this.updateLookTarget();
        this.updatePrompt();
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

/** An ease in and out over 0 to 1. */
function smooth(t) {
    return t * t * (3 - 2 * t);
}

/**
 * How long another visitor's figure fades from one clip into the next
 * sitting down or getting up, as their own page fades theirs (sitPose,
 * stand, updateRising) — as near as the clips' names tell: into sitting
 * from the clip over SIT_SETTLE, on foot over SIT_BLEND (theirs at least
 * that); into getting up by the clip over RISE_FADE, and out of it over
 * RISE_SETTLE; up on foot over SIT_BLEND. Undefined otherwise: Avatar.js's
 * own FADE.
 */
function otherFade(from, to) {
    if (typeof from !== "string") return undefined;
    if (to.startsWith(SITTING)) return from === "sit-down" ? SIT_SETTLE : SIT_BLEND;
    if (to === "stand-up") return RISE_FADE;
    if (from === "stand-up") return RISE_SETTLE;
    return from.startsWith(SITTING) ? SIT_BLEND : undefined;
}

/** Which way a quaternion turns a figure about the up, as Player turns it (a rig faces +z), in radians. */
function yawOf(quaternion) {
    return 2 * Math.atan2(quaternion.y, quaternion.w);
}

/**
 * A way on foot for the figure (sitting down and getting up: sitPlan,
 * walkPlan, walkOffPlan): its root from the first of `points` through each
 * to the last. Where the way turns by less than TURN_WALKING it is walked
 * on round the corner, turning as it goes (facing the way between the two
 * over CORNER of the way); where by more, the figure stops and turns on the
 * spot at TURN_RATE. Each stretch walked facing the way it goes, at no more
 * than APPROACH_PACE at its fastest (eased in and out, APPROACH_LEAST at
 * least), turned to it on the spot first; and, if `end` (a quaternion),
 * turned there to it on the spot, having stood still STOP_BEFORE at least.
 * Its steps, each `{ kind: "turn"|"walk", start, time, … }`, and how long
 * it all takes.
 */
function routeOf(points, start, end) {
    const ways = [];
    for (let i = 1; i < points.length; i++) {
        const from = points[i - 1];
        const to = points[i];
        const length = Math.hypot(to.x - from.x, to.z - from.z);
        if (length >= 0.02) ways.push({ from, to, length, yaw: Math.atan2(to.x - from.x, to.z - from.z) });
    }
    // Stretches walked without stopping: the ways between sharp turns.
    const stretches = [];
    for (const way of ways) {
        const last = stretches[stretches.length - 1];
        const previous = last?.ways[last.ways.length - 1];
        if (previous && Math.abs(Math.atan2(Math.sin(way.yaw - previous.yaw), Math.cos(way.yaw - previous.yaw))) < TURN_WALKING) last.ways.push(way);
        else stretches.push({ ways: [way] });
    }
    const steps = [];
    const turned = start.clone();
    let time = 0;
    for (const stretch of stretches) {
        const first = stretch.ways[0];
        const travel = new THREE.Quaternion().setFromAxisAngle(_up, first.yaw);
        const turning = turned.angleTo(travel) / TURN_RATE;
        if (turning > 1e-3) {
            steps.push({ kind: "turn", at: first.from, from: turned.clone(), to: travel, start: time, time: turning });
            time += turning;
        }
        let along = 0;
        stretch.ways.forEach((way, i) => {
            way.along = along;
            way.turn = new THREE.Quaternion().setFromAxisAngle(_up, way.yaw);
            // (Round the corner at its end over CORNER, or less where either way is shorter: one corner's turn not into the next's.)
            const next = stretch.ways[i + 1];
            way.corner = next ? Math.min(CORNER, way.length, next.length) : 0;
            along += way.length;
        });
        const walking = Math.max(APPROACH_LEAST, (1.5 * along) / APPROACH_PACE);
        steps.push({ kind: "walk", ways: stretch.ways, length: along, start: time, time: walking });
        time += walking;
        turned.copy(stretch.ways[stretch.ways.length - 1].turn);
    }
    const last = points[points.length - 1];
    if (end) {
        const turning = Math.max(stretches.length ? STOP_BEFORE : 0, turned.angleTo(end) / TURN_RATE);
        if (turning > 1e-3) {
            steps.push({ kind: "turn", at: last, from: turned.clone(), to: end.clone(), start: time, time: turning });
            time += turning;
        }
    }
    return { steps, time, end: last, turn: end ?? turned.clone() };
}

/** How far a route (routeOf) walks, in metres: 0 for none. */
function lengthOf(route) {
    return route ? route.steps.reduce((sum, step) => sum + (step.kind === "walk" ? step.length : 0), 0) : 0;
}

/** The figure `time` seconds along a route (routeOf): its root's place and turn set, and what it plays there — walking, or idle. */
function followRoute(route, time, position, quaternion) {
    for (const step of route.steps) {
        if (time >= step.start + step.time) continue;
        const k = smooth(THREE.MathUtils.clamp((time - step.start) / step.time, 0, 1));
        if (step.kind === "walk") {
            // How far along the stretch, which way of it, and the turn round its corners as it goes.
            const along = k * step.length;
            let i = 0;
            while (i < step.ways.length - 1 && along > step.ways[i + 1].along) i++;
            const way = step.ways[i];
            position.lerpVectors(way.from, way.to, THREE.MathUtils.clamp((along - way.along) / way.length, 0, 1));
            quaternion.copy(way.turn);
            const next = step.ways[i + 1];
            const previous = step.ways[i - 1];
            if (next && along > next.along - way.corner / 2) quaternion.slerpQuaternions(way.turn, next.turn, smooth(0.5 - (next.along - along) / way.corner));
            else if (previous && along < way.along + previous.corner / 2) quaternion.slerpQuaternions(previous.turn, way.turn, smooth(0.5 + (along - way.along) / previous.corner));
            return "walking";
        }
        position.copy(step.at);
        quaternion.slerpQuaternions(step.from, step.to, k);
        return "idle";
    }
    position.copy(route.end);
    quaternion.copy(route.turn);
    return "idle";
}

/** A figure's bones as Avatar.bonesAlong has them, in its root's frame, placed in the world: its root at `at`, turned `turn`. Each a new vector. */
function placed(bones, turn, at) {
    const out = {};
    for (const name in bones) out[name] = bones[name].clone().applyQuaternion(turn).add(at);
    return out;
}

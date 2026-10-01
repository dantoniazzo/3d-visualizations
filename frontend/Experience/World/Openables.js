import * as THREE from "three";

/**
 * The doors and drawers of furniture: a wardrobe's doors, a kitchen's
 * cupboards and drawers, the fridge's doors, a nightstand's drawers.
 *
 * A piece's model says which of its parts open, and how, on each part's own
 * node (`userData.opens`, from blender/lib/geometry.py's join_piece): a door
 * swings about the up axis through its origin, its hinge, by `angle`
 * radians when fully open; a drawer slides `distance` metres along
 * `direction`. Everything else about the piece stays put, and is merged,
 * published and baked with the house; these parts are left out of all of
 * that and drawn live (SceneBuilder.staticOptions), so the inside of a
 * cupboard is baked as it is seen with its door open, and shut, the door
 * hides it.
 *
 * A piece can also carry a light inside it (`userData.fixture.light`: the
 * fridge's): lit, as a small light with no shadow and a short reach,
 * shining the way it is aimed, as far as any of the piece's doors are open.
 */

/** How long a part takes to open or close, as a share of it a second. */
const SPEED = 2.2;
const _up = new THREE.Vector3(0, 1, 0);
const _turn = new THREE.Quaternion();

export class Openable {
    /**
     * @param {THREE.Object3D} node  the part: its origin its hinge, or where it slides from
     * @param {string} piece  which piece it is part of
     */
    constructor(node, piece) {
        this.node = node;
        this.piece = piece;
        this.opens = node.userData.opens;
        this.kind = this.opens.type === "slide" ? "drawer" : "door";
        this.restPosition = node.position.clone();
        this.restQuaternion = node.quaternion.clone();
        this.direction = new THREE.Vector3(...(this.opens.direction ?? [0, 0, 1]));
        this.open = 0;
        this.target = 0;
    }

    toggle() {
        this.target = this.target > 0.5 ? 0 : 1;
        return this.target > 0.5;
    }

    setOpen(open) {
        this.target = open ? 1 : 0;
    }

    /** Open, or on its way: what toggling it would undo. */
    get isOpening() {
        return this.target > 0.5;
    }

    get isMoving() {
        return Math.abs(this.open - this.target) > 0.001;
    }

    update(delta) {
        if (!this.isMoving) return false;
        const step = SPEED * delta;
        const diff = this.target - this.open;
        this.open += Math.sign(diff) * Math.min(Math.abs(diff), step);
        this.place();
        return true;
    }

    /** Where it is, eased so it settles rather than stopping dead. */
    place() {
        const eased = 1 - Math.pow(1 - this.open, 2);
        if (this.opens.type === "slide") {
            this.node.position.copy(this.restPosition).addScaledVector(this.direction, eased * this.opens.distance);
        } else {
            this.node.quaternion.copy(this.restQuaternion).premultiply(_turn.setFromAxisAngle(_up, eased * this.opens.angle));
        }
    }

    /** Back as it was modelled, shut, at once. */
    reset() {
        this.open = this.target = 0;
        this.node.position.copy(this.restPosition);
        this.node.quaternion.copy(this.restQuaternion);
    }
}

export default class Openables {
    constructor() {
        /** every part that opens */
        this.parts = [];
        /** { light, fixture, piece } */
        this.lights = [];
    }

    /**
     * Take on a piece's parts that open, and its lights.
     *
     * @param {THREE.Object3D} root  the piece, or a group of parts
     * @param {string} [piece]  which piece they are all part of; by default
     *        each part's own `userData.piece`, or the root's id
     */
    add(root, piece = null) {
        root.traverse((node) => {
            const id = piece ?? node.userData.piece ?? root.userData.id ?? root.uuid;
            if (node.userData?.opens && !this.parts.some((part) => part.node === node)) {
                this.parts.push(new Openable(node, id));
                // It moves, so its shadow is drawn live, not baked.
                node.traverse((mesh) => {
                    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
                });
            }
            const light = node.userData?.fixture?.light;
            if (light && !this.lights.some((entry) => entry.fixture === node)) {
                this.lights.push({ light: this.lamp(node, light, id), fixture: node, piece: id, power: light.power ?? 2 });
            }
        });
    }

    /**
     * The light inside a piece: shining the way it is aimed (`aim`, in the
     * frame of the node's parent), as a light in a fridge shines down on its
     * shelves and out of its door, not back through its walls — or, not
     * aimed, every way. No shadow; as far as `reach`.
     */
    lamp(node, light, id) {
        const color = light.color ?? "#ffffff";
        const reach = light.reach ?? 1.5;
        let lamp;
        if (light.aim) {
            lamp = new THREE.SpotLight(color, 0, reach, Math.PI / 3, 0.7, 2);
            lamp.position.copy(node.position);
            lamp.target.position.copy(node.position).add(new THREE.Vector3(...light.aim));
            node.parent.add(lamp, lamp.target);
        } else {
            lamp = new THREE.PointLight(color, 0, reach, 2);
            node.add(lamp);
        }
        lamp.name = `inside:${id}`;
        return lamp;
    }

    /** Let go of everything under `root`, as a piece is taken away. */
    remove(root) {
        const under = new Set();
        root.traverse((node) => under.add(node));
        this.parts = this.parts.filter((part) => !under.has(part.node));
        this.lights = this.lights.filter((entry) => {
            if (!under.has(entry.fixture)) return true;
            entry.light.target?.removeFromParent();
            entry.light.removeFromParent();
            entry.light.dispose();
            return false;
        });
    }

    /** The part `object` is, or is part of — a door's handle is its door's. */
    of(object) {
        for (let node = object; node; node = node.parent) {
            if (node.userData?.opens) return this.parts.find((part) => part.node === node) ?? null;
        }
        return null;
    }

    update(delta) {
        let moved = false;
        for (const part of this.parts) moved = part.update(delta) || moved;
        if (!moved && !this.lightsStale) return;
        this.lightsStale = false;
        // A light inside a piece is on as far as any of its doors is open.
        for (const entry of this.lights) {
            let open = 0;
            for (const part of this.parts) if (part.piece === entry.piece) open = Math.max(open, part.open);
            entry.light.intensity = (entry.power / (4 * Math.PI)) * Math.min(1, open * 3);
        }
    }

    /** Every part shut, at once — as it is published. */
    resetAll() {
        for (const part of this.parts) part.reset();
        this.lightsStale = true;
    }
}

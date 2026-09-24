import * as THREE from "three";

/**
 * Blender's axes, in three.js space.
 *
 * The editor speaks Blender: Z is up, Y runs away from the viewer in the
 * front view, and X/Y/Z are red/green/blue. The scene underneath is three's
 * Y-up world, so every axis a user names goes through this table. glTF
 * export from Blender makes the same swap, which is why a model's front
 * faces the same way in both programs.
 */
export const AXES = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 0, -1),
    z: new THREE.Vector3(0, 1, 0),
};

export const AXIS_COLORS = {
    x: 0xff3352,
    y: 0x8bdc00,
    z: 0x2890ff,
};

export const AXIS_CSS = {
    x: "#ff3352",
    y: "#8bdc00",
    z: "#2890ff",
};

/** The two axes spanning the plane that has `normal` as its normal. */
export const PLANE_AXES = {
    x: ["y", "z"],
    y: ["x", "z"],
    z: ["x", "y"],
};

/** three.js position -> Blender [X, Y, Z]. */
export function toBlender(v) {
    return [v.x, -v.z, v.y];
}

/** Blender [X, Y, Z] -> three.js position. */
export function fromBlender([x, y, z], target = new THREE.Vector3()) {
    return target.set(x, z, -y);
}

/** A world axis turned into a frame (identity for Global). */
export function axisIn(frame, axis, target = new THREE.Vector3()) {
    return target.copy(AXES[axis]).applyQuaternion(frame);
}

export const yawQuaternion = (yaw, target = new THREE.Quaternion()) =>
    target.setFromAxisAngle(AXES.z, yaw);

export const DEG = Math.PI / 180;

/** Round away float noise before a number reaches the spec or the UI. */
export const round = (n, places = 4) => {
    const f = 10 ** places;
    return Math.round(n * f) / f;
};

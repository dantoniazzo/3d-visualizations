import * as THREE from "three";

import { boxUVs, mergeParts } from "./KitLibrary.js";

/**
 * The fence round the plot (shared/vegetation.js's planFence), as the
 * house's own: drawn, published, baked and walked into like a wall.
 *
 *   - boards, beside and behind the house: posts, and between each two a
 *     panel of upright boards on a gravel board, capped, with its rails on
 *     the garden's side;
 *   - pickets, in front: pointed white pickets on two rails, between
 *     capped posts.
 *
 * Every part of each kind is merged into one mesh: two for the whole fence.
 */

/** Board fence: posts at most this far apart, and its parts' sizes, in metres. */
const BOARDS = { bay: 1.83, post: 0.1, board: 0.022, gravel: 0.15, rail: [0.045, 0.075] };
/** Picket fence: the same. */
const PICKETS = { bay: 2.4, post: 0.075, picket: [0.07, 0.02], gap: 0.065, rail: [0.03, 0.06] };

/**
 * @param {object[]} runs  planFence's
 * @param {MaterialLibrary} materials
 * @returns {THREE.Group}
 */
export function buildFence(runs, materials) {
    const group = new THREE.Group();
    group.name = "fence";
    group.userData = { kind: "fence", label: "Fence" };
    const timber = [];
    const paint = [];
    for (const run of runs) {
        if (run.style === "picket") picketRun(run, paint);
        else boardRun(run, timber);
    }
    const tile = materials.tileSize("fence_timber");
    if (timber.length) {
        const mesh = new THREE.Mesh(uprightBoards(boxUVs(mergeParts(timber), tile)), materials.getSurface("fence_timber", "fence"));
        mesh.userData = { label: "Fence" };
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
    }
    if (paint.length) {
        const mesh = new THREE.Mesh(mergeParts(paint), materials.getTrim("fence_paint"));
        mesh.userData = { label: "Picket fence" };
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
    }
    group.updateMatrixWorld(true);
    return group;
}

/**
 * Along a run: its posts, at most `bay` apart and the same spacing all
 * along it, the run set `inset` into the garden; and what goes between
 * each two.
 */
function alongRun(run, bay, inset, postParts, bayParts) {
    const [sx, sz] = run.start;
    const [ex, ez] = run.end;
    const length = Math.hypot(ex - sx, ez - sz);
    const bays = Math.max(1, Math.ceil(length / bay));
    const step = length / bays;
    // Along the run, and across it into the garden.
    const along = new THREE.Vector3((ex - sx) / length, 0, (ez - sz) / length);
    const inward = new THREE.Vector3(run.inward[0], 0, run.inward[1]);
    const yaw = Math.atan2(along.x, along.z) - Math.PI / 2;
    // In the garden's side of the edge, clear of what is beyond it.
    const origin = new THREE.Vector3(sx, run.y, sz).addScaledVector(inward, inset);
    const place = (geometry, u, v = 0) => {
        geometry.rotateY(yaw);
        const at = origin.clone().addScaledVector(along, u).addScaledVector(inward, v);
        return geometry.translate(at.x, at.y, at.z);
    };
    for (let k = 0; k <= bays; k++) postParts(place, k * step);
    for (let k = 0; k < bays; k++) bayParts(place, k * step, step);
}

function boardRun(run, out) {
    const { height } = run;
    const { post, board, gravel, rail } = BOARDS;
    alongRun(
        run,
        BOARDS.bay,
        post,
        (place, u) => {
            out.push(place(new THREE.BoxGeometry(post, height + 0.05, post).translate(0, (height + 0.05) / 2, 0), u));
            out.push(place(new THREE.BoxGeometry(post + 0.03, 0.03, post + 0.03).translate(0, height + 0.065, 0), u));
        },
        (place, u, step) => {
            const width = step - post;
            const middle = u + step / 2;
            out.push(place(new THREE.BoxGeometry(width, gravel, 0.03).translate(0, gravel / 2, 0), middle));
            out.push(place(new THREE.BoxGeometry(width, height - gravel - 0.04, board).translate(0, (height + gravel - 0.04) / 2, 0), middle));
            out.push(place(new THREE.BoxGeometry(width, 0.035, 0.05).translate(0, height - 0.0175, 0), middle));
            for (const y of [0.4, height - 0.4]) {
                out.push(place(new THREE.BoxGeometry(width, rail[1], rail[0]).translate(0, y, 0), middle, (board + rail[0]) / 2));
            }
        }
    );
}

function picketRun(run, out) {
    const { height } = run;
    const { post, picket, gap, rail } = PICKETS;
    const shape = picketShape(picket[0], height - 0.06);
    alongRun(
        run,
        PICKETS.bay,
        post,
        (place, u) => {
            out.push(place(new THREE.BoxGeometry(post, height + 0.05, post).translate(0, (height + 0.05) / 2, 0), u));
            out.push(place(new THREE.ConeGeometry(post * 0.75, 0.06, 4).rotateY(Math.PI / 4).translate(0, height + 0.08, 0), u));
        },
        (place, u, step) => {
            const width = step - post;
            const middle = u + step / 2;
            for (const y of [0.25, height - 0.3]) {
                out.push(place(new THREE.BoxGeometry(width, rail[1], rail[0]).translate(0, y, 0), middle, (picket[1] + rail[0]) / 2));
            }
            const count = Math.max(1, Math.floor((width + gap) / (picket[0] + gap)));
            const spacing = width / count;
            for (let k = 0; k < count; k++) {
                const geometry = new THREE.ExtrudeGeometry(shape, { depth: picket[1], bevelEnabled: false }).translate(0, 0.04, -picket[1] / 2);
                out.push(place(geometry, u + post / 2 + spacing * (k + 0.5)));
            }
        }
    );
}

/** A picket's outline: a board with a pointed top. */
function picketShape(width, height) {
    const half = width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(half, height - half);
    shape.lineTo(0, height);
    shape.lineTo(-half, height - half);
    shape.lineTo(-half, 0);
    return shape;
}

/** The board texture's planks run across it: turned upright, they are a fence's boards. */
function uprightBoards(geometry) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    uv.needsUpdate = true;
    return geometry;
}

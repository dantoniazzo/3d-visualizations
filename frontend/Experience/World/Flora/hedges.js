import * as THREE from "three";

import { plantShader } from "./shaders.js";
import { mulberry32 } from "../../../../shared/vegetation.js";
import { LOW_POWER } from "../../Utils/device.js";

/**
 * Photinia 'Red Robin' hedges (shared/landscape.js's `hedges`): clipped
 * boxes of leaves, their new growth red at the top and the outer edges,
 * dark green deeper in. Each a dark core with leaf sprays all over its
 * faces — a spray a card, its photograph's shape and shading (ez-tree's
 * aspen spray) in the colour of where it grows — standing out from the
 * face, tilted every way, drawn as one instanced mesh for every hedge.
 */

/** Sprays a square metre of a hedge's faces. */
const DENSITY = LOW_POWER ? 60 : 125;
const GREEN = ["#263f1d", "#2f4a22", "#3a5a2a", "#466a30"];
const RED = ["#7e2219", "#962c1e", "#a83b26", "#6f281d", "#b4502f"];
/** A green hedge's (cherry laurel, `red: 0`) new growth: a fresher green. */
const FRESH = ["#4d7a2a", "#5a8a30", "#43702a", "#62923a"];

export function buildHedges(hedges, leafTexture) {
    const random = mulberry32(4242);
    const sprays = [];
    const cores = [];
    for (const hedge of hedges) {
        for (let i = 0; i < hedge.path.length - 1; i++) {
            const [a, b] = [hedge.path[i], hedge.path[i + 1]];
            segment(hedge, a, b, random, sprays, cores);
        }
    }

    // One spray: a card a metre square, its middle at the origin, facing +Z.
    const card = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ map: leafTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
    material.name = "hedge-leaves";
    plantShader(material, { height: 1.2, strength: 0.0006, through: 0.4, key: "hedge" });
    // The spray's photograph is of autumn leaves: its shading, not its colour.
    const base = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
        base(shader);
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>",
            `#ifdef USE_MAP
    vec4 texel = texture2D( map, vMapUv );
    float shade = dot( texel.rgb, vec3( 0.3, 0.55, 0.15 ) );
    diffuseColor.rgb *= 0.45 + 1.1 * shade;
    diffuseColor.a *= texel.a;
#endif`
        );
    };
    const mesh = new THREE.InstancedMesh(card, material, sprays.length);
    mesh.name = "hedges";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    sprays.forEach((spray, k) => {
        matrix.compose(spray.position, spray.quaternion, spray.scale);
        mesh.setMatrixAt(k, matrix);
        mesh.setColorAt(k, colour.copy(spray.colour));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTexture, alphaTest: 0.4, side: THREE.DoubleSide });

    // The cores: dark and leafy, so no gap shows the sky through a hedge.
    const coreMaterial = new THREE.MeshStandardMaterial({ color: "#1f3317", roughness: 0.9, metalness: 0 });
    coreMaterial.name = "hedge-core";
    const coreGeometry = mergeBoxes(cores);
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.name = "hedge-cores";
    core.castShadow = true;
    core.receiveShadow = true;

    const group = new THREE.Group();
    group.name = "hedges";
    group.add(core, mesh);
    return { group, count: sprays.length, dispose: () => [card, coreGeometry, material, coreMaterial, mesh.customDepthMaterial].forEach((x) => x.dispose()) };
}

/** A hedge's straight run: its core, and sprays over its top, its two sides and its ends. */
function segment(hedge, [ax, az], [bx, bz], random, sprays, cores) {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.05) return;
    const along = new THREE.Vector3((bx - ax) / length, 0, (bz - az) / length);
    const across = new THREE.Vector3(-along.z, 0, along.x);
    const up = new THREE.Vector3(0, 1, 0);
    const w = hedge.width;
    const h = hedge.height;
    const base = hedge.base ?? 0;
    const middle = new THREE.Vector3((ax + bx) / 2, base, (az + bz) / 2);
    cores.push({ middle: middle.clone().setY(base + (h - 0.12) / 2), along, length: length + w - 0.16, width: w - 0.16, height: h - 0.12 });

    const faces = [
        { normal: up, area: length * w, at: (u, v) => middle.clone().addScaledVector(along, (u - 0.5) * (length + w * 0.6)).addScaledVector(across, (v - 0.5) * w).setY(base + h) },
        { normal: across, area: length * h, at: (u, v) => middle.clone().addScaledVector(along, (u - 0.5) * (length + w * 0.6)).addScaledVector(across, w / 2).setY(base + v * h) },
        { normal: across.clone().negate(), area: length * h, at: (u, v) => middle.clone().addScaledVector(along, (u - 0.5) * (length + w * 0.6)).addScaledVector(across, -w / 2).setY(base + v * h) },
        { normal: along, area: w * h, at: (u, v) => middle.clone().addScaledVector(along, length / 2 + w * 0.3).addScaledVector(across, (u - 0.5) * w).setY(base + v * h) },
        { normal: along.clone().negate(), area: w * h, at: (u, v) => middle.clone().addScaledVector(along, -length / 2 - w * 0.3).addScaledVector(across, (u - 0.5) * w).setY(base + v * h) },
    ];
    const z = new THREE.Vector3(0, 0, 1);
    for (const face of faces) {
        const count = Math.round(face.area * DENSITY);
        for (let k = 0; k < count; k++) {
            const u = random();
            const v = face.normal === up ? random() : Math.pow(random(), 0.7);
            const position = face.at(u, v);
            // Rounded a little at the top's edges.
            if (face.normal !== up && v > 0.88) position.y -= (v - 0.88) * 0.25;
            position.addScaledVector(face.normal, (random() - 0.35) * 0.12);
            const facing = face.normal.clone().addScaledVector(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5), 1.4).normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(z, facing);
            quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(z, random() * Math.PI * 2));
            const size = 0.14 + random() * 0.12;
            // Red at the top, and the more so towards it on the sides.
            const height = (position.y - base) / h;
            const red = face.normal === up ? 0.75 + random() * 0.25 : Math.max(0, (height - 0.45) / 0.55) * (0.5 + random() * 0.6) + (random() < 0.08 ? 0.5 : 0);
            // `red` 0 is a green hedge: its new growth fresh green, not red.
            const share = hedge.red ?? 1;
            const tips = share > 0 ? RED : FRESH;
            // A spray is new growth or old, not between: red over green
            // where it is new, so the hedge reads red-tipped, not brown.
            const mix = share > 0 ? (random() < red * share * 1.25 ? 0.8 + random() * 0.2 : random() * 0.08) : Math.min(1, red * 0.7);
            const colour = new THREE.Color(GREEN[Math.floor(random() * GREEN.length)]).lerp(new THREE.Color(tips[Math.floor(random() * tips.length)]), mix);
            colour.offsetHSL((random() - 0.5) * 0.02, 0, (random() - 0.5) * 0.06);
            sprays.push({ position, quaternion, scale: new THREE.Vector3(size, size, size), colour });
        }
    }
}

function mergeBoxes(cores) {
    const positions = [];
    const normals = [];
    for (const core of cores) {
        const box = new THREE.BoxGeometry(core.length, core.height, core.width).toNonIndexed();
        box.rotateY(-Math.atan2(core.along.z, core.along.x));
        box.translate(core.middle.x, core.middle.y, core.middle.z);
        positions.push(...box.attributes.position.array);
        normals.push(...box.attributes.normal.array);
        box.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
}

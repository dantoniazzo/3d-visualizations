import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The Blender kit of parts (blender/lib/kit.py, exported as
 * /models/kit.glb): door leaves, handles, hinges and stops, skirting and
 * architraves, window frames, glazing bars and cills, stair treads, newels,
 * balusters and rails.
 *
 * The structure builder still decides where everything goes — openings
 * move and flights re-pitch, so it has to — and asks the kit for a part at
 * the size it needs. A part is stretched only across the zones its model
 * declares for each axis (the field of a door panel, the run of a
 * moulding, the plain shaft of a baluster). Everything else keeps its
 * modelled size, so a taller door gets longer upper panels rather than
 * taller mouldings, and an architrave's mitre stays a true mitre.
 *
 * Without the kit — not built, or not reachable — every call answers with
 * a plain box of the requested size, which is what the builders drew before
 * there was one; `has()` lets them keep their own fallbacks where a box is
 * not a good enough stand-in.
 */

const AXES = ["x", "y", "z"];
const EPSILON = 1e-5;

export default class KitLibrary {
    /** @param {object|null} gltf  the loaded kit, or null if it failed to load */
    constructor(gltf) {
        /** name -> { geometry, box, stretch, meta } */
        this.parts = new Map();
        if (!gltf?.scene) return;

        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((node) => {
            if (!node.isMesh) return;
            let meta = {};
            try {
                meta = JSON.parse(node.userData?.kit || "{}");
            } catch {
                // A part with unreadable extras still works; it just stretches evenly.
            }
            const geometry = plain(node.geometry).applyMatrix4(node.matrixWorld);
            geometry.computeBoundingBox();
            const { stretch = {}, ...rest } = meta;
            this.parts.set(node.name, { geometry, box: geometry.boundingBox.clone(), stretch, meta: rest });
        });
    }

    has(name) {
        return this.parts.has(name);
    }

    /** A part's modelled size, as a Vector3, or null. */
    size(name) {
        return this.parts.get(name)?.box.getSize(new THREE.Vector3()) ?? null;
    }

    /** Figures the part carries about itself — a tread's board thickness, say. */
    meta(name) {
        return this.parts.get(name)?.meta ?? {};
    }

    /**
     * A part exactly as modelled, in its own frame. For fittings placed by
     * their origin rather than their bounds: a handle by its spindle.
     */
    part(name) {
        return this.parts.get(name)?.geometry.clone() ?? null;
    }

    /**
     * A part stretched to w × h × d and centred on the origin, just as a
     * BoxGeometry of that size would be, so it drops in where one was.
     * A null size keeps that axis as modelled. A part missing from the kit
     * comes back as that box.
     */
    fit(name, w, h, d) {
        const part = this.parts.get(name);
        if (!part) return new THREE.BoxGeometry(w ?? 0.05, h ?? 0.05, d ?? 0.05);

        const geometry = part.geometry.clone();
        const targets = [w, h, d];
        const maps = AXES.map((axis, i) =>
            axisMap(part.box.min.getComponent(i), part.box.max.getComponent(i), targets[i], part.stretch[axis])
        );

        const position = geometry.attributes.position.array;
        const normal = geometry.attributes.normal.array;
        const n = [0, 0, 0];
        for (let v = 0; v < position.length; v += 3) {
            for (let i = 0; i < 3; i++) {
                const [value, factor] = maps[i](position[v + i]);
                position[v + i] = value;
                // A face stretched along an axis turns away from it.
                n[i] = normal[v + i] / factor;
            }
            const length = Math.hypot(n[0], n[1], n[2]) || 1;
            normal[v] = n[0] / length;
            normal[v + 1] = n[1] / length;
            normal[v + 2] = n[2] / length;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.normal.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    dispose() {
        for (const part of this.parts.values()) part.geometry.dispose();
        this.parts.clear();
    }
}

/**
 * How one axis of a part maps from its modelled extent [min, max] onto a
 * target size centred on 0. Returns u -> [mapped u, stretch factor there].
 *
 * The growth is shared among the zones in proportion to their length, so
 * every zone stretches by the same factor and everything between keeps its
 * size. A part with no zones on an axis, or asked to shrink past what its
 * fixed parts need, scales evenly instead.
 */
function axisMap(min, max, target, zones) {
    const size = max - min;
    const centre = (min + max) / 2;
    if (target === null || target === undefined || size < EPSILON) {
        return (u) => [u - centre, 1];
    }

    const spans = (zones || []).map(([a, b]) => [min + a, min + b]).filter(([a, b]) => b - a > EPSILON);
    const stretchable = spans.reduce((sum, [a, b]) => sum + b - a, 0);
    const grown = stretchable + target - size;
    if (!stretchable || grown < stretchable * 0.05) {
        const k = target / size;
        return (u) => [(u - centre) * k, k];
    }

    const k = grown / stretchable;
    return (u) => {
        let shift = 0;
        let factor = 1;
        for (const [a, b] of spans) {
            if (u >= b) {
                shift += (b - a) * (k - 1);
            } else if (u > a) {
                shift += (u - a) * (k - 1);
                if (u > a + EPSILON && u < b - EPSILON) factor = k;
            }
        }
        return [u + shift - min - target / 2, factor];
    };
}

/**
 * A copy with only the attributes the builders use, as plain Float32
 * arrays, and an index — glTF may interleave or leave either out.
 */
function plain(source) {
    const geometry = new THREE.BufferGeometry();
    const copy = (attribute, itemSize) => {
        const array = new Float32Array(attribute.count * itemSize);
        for (let i = 0; i < attribute.count; i++) {
            for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = attribute.getComponent(i, c);
        }
        return new THREE.BufferAttribute(array, itemSize);
    };

    const position = source.attributes.position;
    geometry.setAttribute("position", copy(position, 3));
    if (source.attributes.normal) geometry.setAttribute("normal", copy(source.attributes.normal, 3));
    geometry.setAttribute(
        "uv",
        source.attributes.uv ? copy(source.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(position.count * 2), 2)
    );
    geometry.setIndex(source.index ? Array.from(source.index.array) : [...Array(position.count).keys()]);
    if (!source.attributes.normal) geometry.computeVertexNormals();
    return geometry;
}

/**
 * Mirror a geometry across one of its own axes, in place, keeping its
 * faces facing out: a left-hand casing leg into a right-hand one, or a
 * part made for one face of a wall onto the other.
 */
export function mirror(geometry, axis) {
    const i = AXES.indexOf(axis);
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    for (let v = 0; v < position.count; v++) {
        position.array[v * 3 + i] *= -1;
        if (normal) normal.array[v * 3 + i] *= -1;
    }
    position.needsUpdate = true;
    if (normal) normal.needsUpdate = true;

    // A reflection turns every triangle inside out; swap two corners back.
    if (geometry.index) {
        const index = geometry.index.array;
        for (let t = 0; t < index.length; t += 3) {
            const b = index[t + 1];
            index[t + 1] = index[t + 2];
            index[t + 2] = b;
        }
        geometry.index.needsUpdate = true;
    } else {
        for (const attribute of Object.values(geometry.attributes)) {
            const size = attribute.itemSize;
            const array = attribute.array;
            for (let t = 0; t < attribute.count; t += 3) {
                for (let c = 0; c < size; c++) {
                    const b = array[(t + 1) * size + c];
                    array[(t + 1) * size + c] = array[(t + 2) * size + c];
                    array[(t + 2) * size + c] = b;
                }
            }
            attribute.needsUpdate = true;
        }
    }
    geometry.computeBoundingBox();
    return geometry;
}

/**
 * Merge boxes, kit parts and extrusions into one geometry. They differ in
 * which attributes they carry and whether they are indexed, which
 * mergeGeometries will not reconcile on its own.
 */
export function mergeParts(geometries) {
    const indexed = geometries.every((geometry) => geometry.index);
    const prepared = geometries.map((geometry) => {
        const out = indexed ? geometry : geometry.index ? geometry.toNonIndexed() : geometry;
        for (const name of Object.keys(out.attributes)) {
            if (name !== "position" && name !== "normal" && name !== "uv") out.deleteAttribute(name);
        }
        if (!out.attributes.normal) out.computeVertexNormals();
        if (!out.attributes.uv) {
            out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
        }
        return out;
    });
    const merged = mergeGeometries(prepared, false);
    for (const geometry of prepared) if (!geometries.includes(geometry)) geometry.dispose();
    return merged;
}

/**
 * Lay a surface finish's texture over a geometry in metres, projected
 * along whichever axis each vertex faces most: treads, whose floor finish
 * has to tile at the same scale as the floors around them.
 */
export function boxUVs(geometry, tileSize) {
    const position = geometry.attributes.position.array;
    const normal = geometry.attributes.normal.array;
    const uv = geometry.attributes.uv.array;
    for (let v = 0, t = 0; v < position.length; v += 3, t += 2) {
        const nx = Math.abs(normal[v]);
        const ny = Math.abs(normal[v + 1]);
        const nz = Math.abs(normal[v + 2]);
        const [u, w] =
            ny >= nx && ny >= nz
                ? [position[v], -position[v + 2]]
                : nx >= nz
                  ? [position[v + 2], position[v + 1]]
                  : [position[v], position[v + 1]];
        uv[t] = u / tileSize;
        uv[t + 1] = w / tileSize;
    }
    geometry.attributes.uv.needsUpdate = true;
    return geometry;
}

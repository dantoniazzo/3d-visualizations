import * as THREE from "three";

import TextureLibrary from "./TextureLibrary.js";
import { applyReflection } from "../../Utils/reflections.js";
import { FINISHES, TRIM_MATERIALS, DEFAULT_FINISH } from "../../../../shared/catalog.js";

/** How shiny each generator's output should read. */
const ROUGHNESS = {
    planks: 0.62,
    herringbone: 0.6,
    tiles: 0.32,
    marble: 0.22,
    brick: 0.92,
    plaster: 0.94,
    paint: 0.88,
    carpet: 0.98,
    concrete: 0.45,
    rooftiles: 0.8,
    grass: 0.98,
    gravel: 0.95,
};

/**
 * Materials for the shell.
 *
 * One material — and one GPU texture — per finish, shared by every surface
 * using it. Tiling is baked into each surface's UVs by `applyTiling` rather
 * than set on the texture, because `texture.repeat` is per-texture: varying
 * it would force a separate texture upload for every wall in the building.
 */
export default class MaterialLibrary {
    constructor() {
        this.textures = new TextureLibrary();
        this.surfaces = new Map();
        this.trims = new Map();
    }

    /**
     * @param {string} id    a key in FINISHES
     * @param {string} kind  floor | wall | ceiling | roof, used for fallback
     */
    getSurface(id, kind = "wall") {
        const resolved = FINISHES[id] ? id : DEFAULT_FINISH[kind] || "paint_white";
        if (this.surfaces.has(resolved)) return this.surfaces.get(resolved);

        const finish = FINISHES[resolved];
        const material = new THREE.MeshStandardMaterial({
            map: this.textures.get(resolved),
            roughness: ROUGHNESS[finish.generator] ?? 0.8,
            metalness: 0,
        });
        material.name = resolved;

        this.surfaces.set(resolved, material);
        return material;
    }

    getTrim(name, fallback = "trim_white") {
        const key = TRIM_MATERIALS[name] ? name : fallback;
        if (this.trims.has(key)) return this.trims.get(key);

        const spec = TRIM_MATERIALS[key];
        const common = {
            color: new THREE.Color(spec.color),
            roughness: spec.roughness,
            metalness: spec.metalness,
        };

        const material = spec.transparent
            ? new THREE.MeshPhysicalMaterial({
                  ...common,
                  transparent: true,
                  opacity: spec.opacity,
                  transmission: 0.85,
                  thickness: 0.02,
                  ior: 1.5,
                  side: THREE.DoubleSide,
              })
            : new THREE.MeshStandardMaterial(common);

        material.name = key;
        applyReflection(material);
        this.trims.set(key, material);
        return material;
    }

    /** Metres covered by one repeat of a finish. */
    tileSize(id) {
        return this.textures.tileSize(id);
    }

    /**
     * Scale a geometry's UVs so the finish tiles at real-world size.
     *
     * The geometry must not be shared — call this on a per-surface clone.
     * `su`/`sv` are the surface's extents in metres along U and V.
     */
    applyTiling(geometry, finishId, su, sv) {
        const tile = this.tileSize(finishId);
        const uv = geometry.attributes.uv;
        if (!uv) return geometry;

        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
        }
        uv.needsUpdate = true;
        return geometry;
    }

    /**
     * Floors come from ShapeGeometry, whose UVs are already the polygon's
     * metre coordinates — so they only need dividing by the tile size.
     */
    applyWorldTiling(geometry, finishId) {
        const tile = this.tileSize(finishId);
        const uv = geometry.attributes.uv;
        if (!uv) return geometry;

        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
        }
        uv.needsUpdate = true;
        return geometry;
    }

    dispose() {
        for (const material of this.surfaces.values()) material.dispose();
        for (const material of this.trims.values()) material.dispose();
        this.surfaces.clear();
        this.trims.clear();
        this.textures.dispose();
    }
}

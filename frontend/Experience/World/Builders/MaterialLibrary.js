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
/**
 * Which of two surfaces in one plane is drawn: a depth offset in front
 * (FRONT) or behind (BEHIND), so they do not flicker against each other
 * (z-fighting) — the walls' tops under a floor, a window's frame in its
 * reveal, a wall's end in its neighbour's face. Floors keep no offset of
 * their own, so a rug 1 cm over one stays in front of it.
 */
export const FRONT = [-1, -2];
export const BEHIND = [1, 2];
export function layer(material, [factor, units]) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = factor;
    material.polygonOffsetUnits = units;
}

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
            roughness: finish.roughness ?? ROUGHNESS[finish.generator] ?? 0.8,
            metalness: 0,
        });
        material.name = resolved;
        // A photographed finish: its relief, and its own roughness and
        // occlusion from the packed map, its colour tinted as listed.
        if (finish.color) material.color.set(finish.color);
        // Or a multiplier, in linear light, that may brighten as well as tint:
        // a photographed surface darker than the real one.
        if (finish.tint) material.color.setRGB(...finish.tint);
        const normal = this.textures.getData(resolved, "normal");
        if (normal) {
            material.normalMap = normal;
            material.normalScale.setScalar(finish.relief ?? 1);
        }
        const arm = this.textures.getData(resolved, "arm");
        if (arm) {
            material.aoMap = arm;
            material.roughnessMap = arm;
            material.roughness = finish.roughness ?? 1;
            if (finish.metal) {
                material.metalnessMap = arm;
                material.metalness = 1;
            }
        }

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
            ...(spec.glow && { emissive: new THREE.Color(spec.glow), emissiveIntensity: 0.8 }),
        };

        const material = spec.transparent
            ? new THREE.MeshPhysicalMaterial({
                  ...common,
                  transparent: true,
                  opacity: spec.opacity,
                  // Plain see-through, not refracting: a refractive pane in
                  // view redraws every opaque thing and darkens the frame.
                  transmission: spec.transmission ?? 0,
                  thickness: 0.02,
                  ior: 1.5,
                  side: THREE.DoubleSide,
              })
            : new THREE.MeshStandardMaterial(common);

        material.name = key;
        applyReflection(material);
        // Frames and glass in front of the reveals they sit flush in. A trim
        // laid on a surface (skirting, road paint, a switch plate) is drawn
        // as it stands; a wall's own ends, top and reveals take
        // getTrimBehind.
        if (/^(frame_|glass)/.test(key)) layer(material, FRONT);
        this.trims.set(key, material);
        return material;
    }

    /** The trim, layered `side` (FRONT or BEHIND): its own copy, unless it already is. */
    layeredTrim(name, fallback, side, tag) {
        const base = this.getTrim(name, fallback);
        if (base.polygonOffset && base.polygonOffsetFactor === side[0]) return base;
        const key = `${base.name}|${tag}`;
        if (!this.trims.has(key)) {
            const material = base.clone();
            layer(material, side);
            this.trims.set(key, material);
        }
        return this.trims.get(key);
    }

    /**
     * A trim drawn in front of the faces it stands proud of: a door's lining,
     * a few millimetres off the wall's faces either side and just inside its
     * reveals, which would otherwise show through it.
     */
    getTrimFront(name, fallback = "trim_white") {
        return this.layeredTrim(name, fallback, FRONT, "front");
    }

    /**
     * A trim drawn behind the faces it meets in their plane: a wall's ends,
     * top and reveals against a corner's neighbouring wall or the floor over
     * it, a stair's risers and a roof's soffit against the walls by them.
     */
    getTrimBehind(name, fallback = "trim_white") {
        return this.layeredTrim(name, fallback, BEHIND, "behind");
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

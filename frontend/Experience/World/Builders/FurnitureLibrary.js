import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Furniture as imported models rather than generated geometry.
 *
 * The catalogue is a plain JSON manifest served from
 * /models/furniture/catalog.json: drop a .glb into that folder, add an
 * entry, and it appears in the placement picker. Models are fetched lazily
 * the first time a piece is used and then cloned per instance, so ten
 * identical chairs cost one download.
 */
export default class FurnitureLibrary {
    constructor() {
        this.catalog = { categories: [], items: [] };
        this.sources = new Map(); // catalog id -> loaded GLTF scene
        this.pending = new Map(); // catalog id -> in-flight promise

        this.loader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath("/draco/");
        this.loader.setDRACOLoader(draco);
        this.draco = draco;
    }

    async loadCatalog(url = "/models/furniture/catalog.json") {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`catalog ${response.status}`);

            const raw = await response.json();
            this.catalog = {
                categories: raw.categories ?? [],
                // `enabled: false` entries are templates/placeholders.
                items: (raw.items ?? []).filter((i) => i.enabled !== false && i.id && i.url),
            };
        } catch (error) {
            console.warn("Furniture catalogue unavailable:", error.message);
            this.catalog = { categories: [], items: [] };
        }
        return this.catalog;
    }

    getItem(catalogId) {
        return this.catalog.items.find((i) => i.id === catalogId) || null;
    }

    itemsByCategory() {
        const groups = new Map();
        for (const category of this.catalog.categories) {
            const items = this.catalog.items.filter((i) => i.category === category.id);
            if (items.length) groups.set(category, items);
        }
        // Anything with an unlisted category still needs somewhere to live.
        const orphans = this.catalog.items.filter(
            (i) => !this.catalog.categories.some((c) => c.id === i.category)
        );
        if (orphans.length) groups.set({ id: "other", label: "Other" }, orphans);
        return groups;
    }

    /** Load (once) and return the source scene for a catalogue entry. */
    async load(catalogId) {
        if (this.sources.has(catalogId)) return this.sources.get(catalogId);
        if (this.pending.has(catalogId)) return this.pending.get(catalogId);

        const item = this.getItem(catalogId);
        if (!item) return null;

        const promise = new Promise((resolve) => {
            this.loader.load(
                item.url,
                (gltf) => {
                    this.sources.set(catalogId, gltf.scene);
                    this.pending.delete(catalogId);
                    resolve(gltf.scene);
                },
                undefined,
                (error) => {
                    console.error(`Failed to load ${item.url}`, error);
                    this.pending.delete(catalogId);
                    resolve(null);
                }
            );
        });

        this.pending.set(catalogId, promise);
        return promise;
    }

    /**
     * Build a placed instance from a scene-spec entry.
     * Returns a group immediately; the model is swapped in when it arrives,
     * so a slow download never blocks the walkthrough.
     *
     * @param {object} placement { id, catalog_id, position, rotation, scale }
     */
    createInstance(placement) {
        const item = this.getItem(placement.catalog_id);

        const group = new THREE.Group();
        group.name = `furniture:${placement.id}`;
        group.position.set(...placement.position);
        group.rotation.y = THREE.MathUtils.degToRad(placement.rotation);

        group.userData = {
            kind: "furniture",
            id: placement.id,
            catalogId: placement.catalog_id,
            label: item?.name || placement.catalog_id,
            size: item?.size ?? [0.6, 0.6, 0.6],
        };

        if (!item) {
            group.add(this.missingPlaceholder());
            return group;
        }

        const scale = (placement.scale ?? 1) * (item.scale ?? 1);
        group.scale.setScalar(scale);

        this.load(placement.catalog_id).then((source) => {
            if (!source) {
                group.add(this.missingPlaceholder());
                return;
            }
            const model = source.clone(true);
            model.rotation.y = THREE.MathUtils.degToRad(item.yaw ?? 0);
            model.traverse((child) => {
                if (!child.isMesh) return;
                child.castShadow = true;
                child.receiveShadow = true;
            });
            group.add(model);
        });

        return group;
    }

    /** A wireframe box standing in for a model that failed to load. */
    missingPlaceholder(size = [0.6, 0.6, 0.6]) {
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(...size),
            new THREE.MeshStandardMaterial({
                color: "#c0392b",
                wireframe: true,
            })
        );
        box.position.y = size[1] / 2;
        box.name = "missing-model";
        return box;
    }

    dispose() {
        this.draco.dispose();
        this.sources.clear();
        this.pending.clear();
    }
}

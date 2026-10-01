import { DEFAULT_CAR } from "../../../../shared/cars.js";

/**
 * The cars a vehicle can be, and their models, loaded once each.
 *
 * `public/models/cars/index.json` lists them (built by `npm run models --
 * --cars` from the models in assets/cars/): each car's name, its credits,
 * where its wheels are and how big, its body's extent, and its two files —
 * the body and the wheels. A scene's own cars come with it, through the
 * preloader (Experience.setResources); any other is downloaded when it is
 * first asked for, with its progress reported as it comes.
 */
export default class CarModels {
    /**
     * @param {import("../../Utils/Resources.js").default} resources
     * @param {string} base where the models are served from (VITE_MODEL_BASE)
     */
    constructor(resources, base = "") {
        this.resources = resources;
        this.loader = resources.loaders.gltfLoader;
        this.base = base;
        this.models = new Map();      // id -> { meta, body, wheels }
        this.loading = new Map();     // id -> { promise, listeners }
        this.index = null;
    }

    static indexPath(base = "") {
        return `${base}/models/cars/index.json`;
    }

    /** The index a scene's preload asks for, and each of its cars' files. */
    static assets(ids, base = "") {
        const assets = [{ name: "carIndex", type: "json", path: CarModels.indexPath(base) }];
        for (const id of new Set(ids)) {
            assets.push(
                { name: `car:${id}:body`, type: "glbModel", path: `${base}/models/cars/${id}/body.glb` },
                { name: `car:${id}:wheels`, type: "glbModel", path: `${base}/models/cars/${id}/wheels.glb` }
            );
        }
        return assets;
    }

    /** A file of the cars' where the app is served it from. */
    url(path) {
        return this.base + path;
    }

    /** Every car on offer: `{ default, cars: [...] }`. */
    list() {
        if (!this.index) {
            const preloaded = this.resources.items.carIndex;
            this.index = preloaded
                ? Promise.resolve(preloaded)
                : fetch(CarModels.indexPath(this.base)).then((response) => {
                      if (!response.ok) throw new Error(`The list of cars didn't load (${response.status})`);
                      return response.json();
                  });
            // a failed fetch can be tried again
            this.index.catch(() => (this.index = null));
        }
        return this.index;
    }

    /** A car's model if it is here already — preloaded or loaded before — or null. */
    get(id = DEFAULT_CAR) {
        if (this.models.has(id)) return this.models.get(id);
        const items = this.resources.items;
        const meta = items.carIndex?.cars?.find((car) => car.id === id);
        const body = items[`car:${id}:body`];
        const wheels = items[`car:${id}:wheels`];
        if (!meta || !body || !wheels) return null;
        const model = { meta, body: body.scene, wheels: wheels.scene };
        this.models.set(id, model);
        return model;
    }

    /**
     * A car's model, downloaded if it has to be. `onProgress(fraction)` hears
     * how far the download has got, 0 to 1 — and 1 once it is parsed.
     */
    load(id = DEFAULT_CAR, onProgress) {
        const ready = this.get(id);
        if (ready) {
            onProgress?.(1);
            return Promise.resolve(ready);
        }
        let entry = this.loading.get(id);
        if (!entry) {
            entry = { listeners: new Set() };
            entry.promise = this.download(id, (fraction) => {
                for (const listener of entry.listeners) listener(fraction);
            }).finally(() => this.loading.delete(id));
            this.loading.set(id, entry);
        }
        if (onProgress) entry.listeners.add(onProgress);
        return entry.promise;
    }

    async download(id, report) {
        const index = await this.list();
        const meta = index.cars.find((car) => car.id === id);
        if (!meta) throw new Error(`There is no car "${id}"`);
        // Both files at once; progress over their total. A server that
        // compresses them sends no length, so the index's sizes stand in.
        const files = [meta.files.body, meta.files.wheels];
        const loaded = files.map(() => 0);
        const totals = files.map(() => meta.bytes / files.length);
        const progress = () => report(Math.min(0.99, loaded.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0)));
        const [body, wheels] = await Promise.all(
            files.map((file, k) =>
                this.loader.loadAsync(this.base + file, (event) => {
                    if (event.lengthComputable && event.total) totals[k] = event.total;
                    loaded[k] = event.loaded;
                    progress();
                })
            )
        );
        const model = { meta, body: body.scene, wheels: wheels.scene };
        this.models.set(id, model);
        report(1);
        return model;
    }
}

/** "Ddiaz Design · CC BY-NC-SA 4.0" — who made a car's model, and its licence. */
export function creditLine(meta) {
    const bare = (text) => (text || "").replace(/\s*\(.*\)\s*$/, "").trim();
    const author = bare(meta?.credit?.author);
    const license = bare(meta?.credit?.license).replace(/^CC-(.+)-(\d+(?:\.\d+)?)$/, "CC $1 $2");
    return [author, license].filter(Boolean).join(" · ");
}

/** "2.4 MB" */
export function megabytes(bytes) {
    return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}

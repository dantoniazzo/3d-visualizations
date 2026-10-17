import * as THREE from "three";

import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { attributesFor, extract } from "./StaticBatcher.js";
import { REAL_LAYER } from "../Utils/layers.js";

/**
 * A public view's furniture doors and drawers, and its windows' sashes,
 * drawn while they are shut as a few meshes — one a material — not a mesh
 * each.
 *
 * Everything else of the house is merged when the view is built (World/
 * HouseMerger.js), but what moves is drawn live, a mesh at a time: and
 * Ladonia's kitchens, wardrobes, nightstands, vanities and washers have 475
 * parts that open, 843 meshes, beside its windows' 59 sashes. In a version
 * published before they opened they were part of the merged house; drawn
 * one by one they took a frame of A1's kitchen, from the bake at the
 * highest step, from about 1,060 draws to 1,500. So a part that is shut —
 * as nearly all of them are, nearly always — is drawn by its material's
 * mesh, and taken out of it (lifted) while it moves, stands
 * open, or is drawn by a room shown live (World/LiveRoom.js:
 * `userData.roomLive`), and put back once it is shut again, to the last
 * digit (Openable.update, WindowSash.update). The real meshes stay where
 * they are, with their materials: a mesh drawn by its material's is only put
 * on REAL_LAYER, which no camera draws and every ray of the app looks at
 * (Utils/layers.js) — the crosshair still aims at a drawer — and a part
 * merged whole is hidden at its node, and what moves of it held still and
 * passed over by three's walk of the scene's matrices, which a view drawn
 * from its bake makes three times a frame (SceneBuilder.holdStill): two
 * thousand objects more than the version before cost that much even shut.
 *
 * What a part is lit by is its own: drawn from the bake, the light probes
 * round it (World/ProbeLight.js) or, without them, the doors' probes' light
 * (SceneBuilder.tintOpenables); lit live, the scene's lights, as anything
 * is. So the parts of one mesh cannot share their light as they share
 * their material: each part's is a row of a small float texture (`light`),
 * which its vertices name (`partRow`) and its mesh's shader reads where its
 * own material had uniforms (ProbeLight's lightByPartProbes, or tintByPart
 * below) — and a part is drawn by its material's mesh only once its row has
 * been given its light (`lit`). A sash is lit live in every view (World/
 * Sash.js), as the window's fixed frame is: its frame is merged as it is.
 * Glass is not merged — three sorts what is seen through mesh by mesh — but
 * for a window's own panes, one mesh again while its sashes are shut
 * (glazeWindows).
 *
 * Merged as HouseMerger merges: by what a material looks like (`look`,
 * SceneBuilder's lookOf — a publish gives each part its own copy of its
 * finish), in the world's frame, every triangle of each part together
 * (`ranges`), so that lifting one out writes its mesh's index and nothing
 * else. Not by floor as well, as they were at first: Ladonia's 21 looks on
 * five floors were 68 meshes, each of them in view from anywhere — a
 * floor's mesh is as wide as its villas — and 57 of the 1,158 draws of a
 * frame of A1's living room. Each part's floor (`userData.level`) is kept
 * with its triangles instead, and the bird's-eye view, which shows and
 * hides what is drawn by floor, has the floors above the one it shows left
 * out of each mesh's index (showFloors).
 *
 * `?shut=0` in the link leaves all of it out, for comparing; `setEnabled`
 * does the same from the console. Nothing here needs a page.
 */

/** How long a slice of the work of keying the parts' own shaders (oneEach) runs before the frame gets its turn, in milliseconds (Renderer.js's PREPARE_SLICE). */
const PREPARE_SLICE = 4;
/** How many rows of six texels a column of the light's texture holds at most: a texture no taller than any device draws. */
const MOST_ROWS = 2048;
/** A mesh's layers while it is drawn by its material's: off layer 0, which every camera draws, and on REAL_LAYER, which every ray of the app looks at. */
const REAL_MASK = 1 << REAL_LAYER;

export default class ShutBatcher {
    /**
     * @param {object} options
     * @param {object[]} options.parts  the furniture's parts that open (Openables.parts)
     * @param {object[]} [options.sashes]  the windows' sashes (WindowSash)
     * @param {"probe"|"tint"|"plain"} options.light  how the parts are lit: by the light probes, by
     *        the doors' probes' tint, or as the scene lights anything (a view lit live, or unbaked)
     * @param {(material: THREE.Material) => string} options.look  what a material looks like (SceneBuilder's lookOf)
     * @param {(mesh: THREE.Mesh) => number} options.levelOf  the floor a mesh is on, as the bird's-eye view takes it
     * @param {THREE.Object3D} options.parent  where its meshes hang (the builder's root, which the bird's-eye view
     *        shows and hides by floor — not the rays', the collision's or a live room's lists)
     * @param {boolean} [options.enabled]  `?shut=0` in the link: false
     */
    constructor({ parts, sashes = [], light, look, levelOf, parent, enabled = shutWanted() }) {
        this.light = light;
        this.enabled = enabled;
        // (Not a helper, which the bird's-eye view passes over: it shows and hides a window's merged glass by its floor, and
        // has the rest drawn by the floors it shows: showFloors.)
        this.group = new THREE.Group();
        this.group.name = "shut";
        parent.add(this.group);
        /**
         * Each part or sash with meshes merged: `{ part, sash, node, row, meshes, whole, moves, buckets, bucketOf, shut,
         * live, lit, in, stale }` — `row` its row of the light (-1 for a sash), `whole` whether every mesh under it is
         * merged, `moves` its nodes that move (held still while it is in), `bucketOf` each mesh's bucket.
         */
        this.entries = [];
        /** Each part's entry, by its node (lightPart, tintPart). */
        this.byNode = new Map();
        /** The merged meshes, a material each (a look, and how it is lit and cast). */
        this.buckets = [];
        this.dirty = new Set();
        /** What it has done, for measuring. */
        this.done = { lifted: 0, indexes: 0, uploads: 0, ms: 0 };
        /** Each merged mesh's entry (around). */
        this.entryOf = new Map();
        /**
         * One of the parts' and sashes' own meshes for each program they are drawn by lifted out — none drawn while they
         * are merged — whose shaders are made ahead (prepareOwn; Renderer.buildFor, for a light coming in). Null until made.
         */
        this.unseen = null;
        this.preparing = null;
        /** Whether its making ahead has been set going (SceneBuilder.drawLight). */
        this.ownScheduled = false;
        /** What shut parts hide from every side, drawn only while one of them is open (enclose). */
        this.enclosed = [];

        const started = typeof performance === "undefined" ? 0 : performance.now();
        const rows = [];
        const add = (owner, node, row) => {
            const meshes = [];
            let all = 0;
            node.updateWorldMatrix(true, true);
            node.traverse((mesh) => {
                if (mesh.isMesh) all++;
                if (mergeable(mesh)) meshes.push(mesh);
            });
            if (!meshes.length) return;
            // `whole`: every mesh of it merged (a part with no glass), so that it is hidden as a whole while it is in (place).
            const entry = { part: owner.part ?? null, sash: owner.sash ?? null, node, row, meshes, whole: meshes.length === all, moves: owner.moves, buckets: [], bucketOf: [], shut: true, live: false, lit: false, in: false, stale: true };
            this.entries.push(entry);
            for (const mesh of meshes) this.entryOf.set(mesh, entry);
            if (entry.part) this.byNode.set(node, entry);
            return entry;
        };
        // (What of each moves: a part's node; a sash's turn and tilt.)
        for (const part of parts) {
            const entry = add({ part, moves: [part.node] }, part.node, rows.length);
            if (entry) rows.push(entry);
        }
        for (const sash of sashes) add({ sash, moves: [sash.turn, sash.tilt] }, sash.leaf, -1);

        /** Each part's light, a row of six texels (lightByPartProbes), for parts lit by the probes or tinted. */
        const count = Math.max(1, rows.length);
        const columns = Math.ceil(count / MOST_ROWS);
        this.rows = Math.ceil(count / columns);
        const texture = new THREE.DataTexture(new Float32Array(columns * 6 * this.rows * 4), columns * 6, this.rows, THREE.RGBAFormat, THREE.FloatType);
        texture.minFilter = texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        this.texture = texture;
        this.uniforms = { texture: { value: texture }, rows: { value: this.rows } };
        this.textureDirty = false;

        /** Which floors are drawn (showFloors): null, all of them; else whether a floor is, by its level. */
        this.floorShown = null;
        // Into buckets: a material's look, how it casts and takes shadows, how a part's light reaches it, and what its vertices carry.
        const byKey = new Map();
        for (const entry of this.entries) {
            for (const mesh of entry.meshes) {
                const material = mesh.material;
                const lit = entry.part ? this.lightOf(material) : "plain";
                const names = attributesFor(material, mesh.geometry);
                const key = [look(material), mesh.castShadow, mesh.receiveShadow, lit, names.join()].join("|");
                let bucket = byKey.get(key);
                if (!bucket) {
                    bucket = { key, lit, names, source: material, material: lit === "plain" ? material : null, cast: mesh.castShadow, receive: mesh.receiveShadow, pieces: [], ranges: [], mesh: null, whole: null, tinted: null };
                    byKey.set(key, bucket);
                    this.buckets.push(bucket);
                }
                bucket.pieces.push({ entry, mesh, level: levelOf(mesh) });
                if (!entry.buckets.includes(bucket)) entry.buckets.push(bucket);
                entry.bucketOf.push(bucket);
            }
        }
        for (const bucket of this.buckets) {
            this.join(bucket);
            this.make(bucket);
        }
        // A sash is lit live, as the scene lights anything: ready to be drawn by its material's mesh at once. So is a part, lit so.
        for (const entry of this.entries) entry.lit = entry.bucketOf.every((bucket) => bucket.lit === "plain");
        this.glazeWindows(sashes, levelOf);
        /** Each sash's entry, and the window whose glass is one mesh while it and the others are shut (update). */
        this.sashEntry = new Map();
        for (const entry of this.entries) if (entry.sash) this.sashEntry.set(entry.sash, entry);
        this.windowOf = new Map();
        for (const glass of this.windows) for (const sash of glass.sashes) this.windowOf.set(sash, glass);
        this.done.ms = (typeof performance === "undefined" ? 0 : performance.now()) - started;
    }

    /**
     * The glass of each window of two panes or more, as one mesh while all
     * its sashes are shut (`windows`: update): a window's glass was one
     * mesh before its panes were sashes that open, and three draws each
     * piece of glass four times a frame in a view drawn from its bake —
     * from both sides, in two of its renders — and works its shader out
     * again each time. Glass is otherwise left unmerged, as three sorts it
     * back to front mesh by mesh (World/HouseMerger.js): this is the
     * window's own glass in its own plane, about the middle of its panes,
     * where three sorted the one mesh it had.
     *
     * A window of one pane too: its mesh is the pane as it stands, sorted
     * where the pane is, a draw for a draw — but then nothing of its sash
     * is left to draw while it is shut, and the sash is hidden at its group
     * (update), not gone through node by node to its pane at each of the
     * frame's renders: Ladonia's 31 such sashes were 186 objects of every
     * render's walk of the scene.
     */
    glazeWindows(sashes, levelOf) {
        /** `{ sashes, panes, material, mesh, merged, stale }` */
        this.windows = [];
        const byWindow = new Map();
        for (const sash of sashes) {
            const key = `${sash.wallId}|${sash.spec?.id}`;
            if (!byWindow.has(key)) byWindow.set(key, []);
            byWindow.get(key).push(sash);
        }
        for (const list of byWindow.values()) {
            const panes = [];
            for (const sash of list) sash.leaf.traverse((mesh) => mesh.isMesh && !Array.isArray(mesh.material) && mesh.material?.transparent && panes.push(mesh));
            const material = panes[0]?.material;
            if (!panes.length || panes.some((pane) => pane.material !== material || pane.renderOrder !== panes[0].renderOrder)) continue;
            const middle = new THREE.Vector3();
            for (const pane of panes) middle.add(new THREE.Vector3().setFromMatrixPosition(pane.matrixWorld));
            middle.divideScalar(panes.length);
            const about = new THREE.Matrix4().makeTranslation(-middle.x, -middle.y, -middle.z);
            const names = attributesFor(material, panes[0].geometry);
            const parts = [];
            for (const pane of panes) {
                const geometry = pane.geometry;
                const copy = extract(geometry, 0, geometry.index ? geometry.index.count : geometry.attributes.position.count, about.clone().multiply(pane.matrixWorld), names);
                if (copy) parts.push(copy);
            }
            if (parts.length !== panes.length) continue;
            const geometry = mergeGeometries(parts, false);
            for (const part of parts) part.dispose();
            if (!geometry) continue;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `shut:${material.name || "glass"}:${list[0].spec?.id ?? "window"}`;
            mesh.position.copy(middle);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            mesh.castShadow = panes[0].castShadow;
            mesh.receiveShadow = panes[0].receiveShadow;
            mesh.renderOrder = panes[0].renderOrder;
            mesh.userData = { level: levelOf(panes[0]), shut: true };
            mesh.layers.mask = 0;
            this.group.add(mesh);
            this.windows.push({ sashes: list, panes, material, mesh, merged: false, stale: true });
        }
    }

    /**
     * How a part's material is lit, merged: by its probes' light, by the
     * doors' probes' tint, or — anything lit no way of its own (a view lit
     * live or unbaked; a material the probes do not dress, which shows its
     * own colour whatever lights it) — as it is.
     */
    lightOf(material) {
        if (this.light === "probe") return LIT.some((flag) => material[flag]) ? "probe" : "plain";
        if (this.light === "tint") return material.emissive ? "tint" : "plain";
        return "plain";
    }

    /**
     * A bucket's meshes in a row, in the world's frame, as one geometry —
     * and where each part's triangles are in its index (`ranges`) — drawn
     * by one mesh, which no part is in until it is put in (index).
     */
    join(bucket) {
        const names = bucket.names;
        const parts = [];
        for (const { entry, mesh, level } of bucket.pieces) {
            const geometry = mesh.geometry;
            const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
            const copy = extract(geometry, 0, count, mesh.matrixWorld, names);
            if (copy) parts.push({ entry, level, geometry: copy });
        }
        let vertices = 0;
        let indices = 0;
        for (const { geometry } of parts) {
            vertices += geometry.attributes.position.count;
            indices += geometry.index.count;
        }
        const geometry = new THREE.BufferGeometry();
        for (const name of names) {
            const size = parts[0]?.geometry.attributes[name].itemSize ?? 3;
            const array = new Float32Array(vertices * size);
            let at = 0;
            for (const part of parts) {
                array.set(part.geometry.attributes[name].array, at);
                at += part.geometry.attributes.position.count * size;
            }
            geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
        }
        // Which row of the light each vertex's part is lit by (lightByPartProbes, tintByPart).
        if (bucket.lit !== "plain") {
            const rows = new Float32Array(vertices);
            let at = 0;
            for (const part of parts) {
                rows.fill(part.entry.row, at, at + part.geometry.attributes.position.count);
                at += part.geometry.attributes.position.count;
            }
            geometry.setAttribute("partRow", new THREE.BufferAttribute(rows, 1));
        }
        const whole = new Uint32Array(indices);
        let v = 0;
        let i = 0;
        for (const part of parts) {
            const from = part.geometry.index.array;
            for (let k = 0; k < from.length; k++) whole[i + k] = from[k] + v;
            const last = bucket.ranges[bucket.ranges.length - 1];
            if (last && last.entry === part.entry && last.level === part.level && last.start + last.count === i) last.count += from.length;
            else bucket.ranges.push({ entry: part.entry, level: part.level, start: i, count: from.length });
            v += part.geometry.attributes.position.count;
            i += from.length;
            part.geometry.dispose();
        }
        bucket.whole = whole;
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.setDrawRange(0, 0);
        geometry.computeBoundingSphere();
        bucket.geometry = geometry;
        bucket.pieces = null;
    }

    /**
     * What parts that open hide from every side while they are shut — a
     * fridge's glass shelves behind its doors (SceneBuilder.enclosedGlass):
     * `[{ mesh, parts }]`, drawn by no camera while every one of its parts
     * is shut, and as it was the moment one starts to open. On no layer,
     * not hidden: the bird's-eye view shows and hides what is drawn live by
     * its floor (`visible`), and keeps what it found. A mesh a room shown
     * live draws (`roomLive`, World/LiveRoom.js) is that room's, which gives
     * it back with the layers it took: its stand-in there is drawn by the
     * room's own call whatever the mesh's layers say, so the mesh is marked
     * instead (`userData.shutIn`), and the room's stand-in is shown only
     * while it is not (LiveRoom.follow) — else the room shown live drew the
     * shelves behind the shut door again, the hairline with them.
     */
    enclose(list) {
        for (const { mesh } of this.enclosed) {
            mesh.layers.mask = 1;
            delete mesh.userData.shutIn;
        }
        this.enclosed = list.map(({ mesh, parts }) => ({ mesh, parts, hidden: false, live: false, stale: true }));
    }

    /**
     * Before each frame is drawn (SceneBuilder.drawLight): each part and
     * sash in its material's mesh, or lifted out of it — as it is now: shut or
     * not, drawn by a room shown live or not, given its light or not — and
     * the meshes whose parts have come or gone indexed again.
     */
    update() {
        const entries = this.entries;
        for (let e = 0; e < entries.length; e++) {
            const entry = entries[e];
            const shut = entry.part ? entry.part.open === 0 && entry.part.target === 0 : entry.sash.open === 0 && entry.sash.target === 0;
            let live = false;
            const meshes = entry.meshes;
            for (let m = 0; m < meshes.length; m++) {
                if (meshes[m].userData.roomLive) {
                    live = true;
                    break;
                }
            }
            if (shut === entry.shut && live === entry.live && !entry.stale) continue;
            entry.shut = shut;
            entry.live = live;
            entry.stale = false;
            this.place(entry);
        }
        if (this.dirty.size) {
            for (const bucket of this.dirty) this.index(bucket);
            this.dirty.clear();
        }
        // A tinted part's reflections are the sky's to set as the time of day changes (Sky.share: none, but a metal's), on
        // each part's own material, which a mesh's material made before cannot follow: taken from one of them.
        for (const bucket of this.buckets) {
            const from = bucket.tinted?.material;
            if (!from?.userData?.bakedTint) continue;
            const to = bucket.material;
            if (to.envMap !== from.envMap) to.envMap = from.envMap;
            if (to.envMapIntensity !== from.envMapIntensity) to.envMapIntensity = from.envMapIntensity;
        }
        // A window's glass one mesh while every sash of it is shut, wears its glass in its wall, and is no room's drawn live.
        for (const glass of this.windows) {
            let merged = this.enabled;
            for (const sash of glass.sashes) if (sash.open !== 0 || sash.target !== 0) merged = false;
            for (const pane of glass.panes) if (pane.material !== glass.material || pane.userData.roomLive) merged = false;
            if (merged === glass.merged && !glass.stale) continue;
            glass.merged = merged;
            glass.stale = false;
            // (Set again however it went, as place does: a room drawn live gives a pane back with the layers it took.)
            for (const pane of glass.panes) pane.layers.mask = merged ? REAL_MASK : 1;
            glass.mesh.layers.mask = merged ? 1 : 0;
            // A sash whose frame is in its material's mesh and whose pane is in its window's has nothing left to draw of its
            // own: hidden at its group, so that each of the frame's renders passes over it there, not node by node to the
            // pane at the end. Ladonia's two- and three-pane windows have 28 such sashes, six objects each.
            for (const sash of glass.sashes) {
                const hide = merged && Boolean(this.sashEntry.get(sash)?.in);
                if (sash.group.visible === hide) sash.group.visible = !hide;
            }
        }
        for (const inside of this.enclosed) {
            const live = Boolean(inside.mesh.userData.roomLive);
            let shut = this.enabled;
            for (const part of inside.parts) if (part.open !== 0 || part.target !== 0) shut = false;
            if (shut === inside.hidden && live === inside.live && !inside.stale) continue;
            inside.live = live;
            inside.stale = false;
            inside.hidden = shut;
            // (Drawn by a room shown live: its stand-in there hidden while shut, by the mark; its layers the room's to give back.)
            if (live) {
                inside.mesh.userData.shutIn = shut;
                continue;
            }
            delete inside.mesh.userData.shutIn;
            inside.mesh.layers.mask = shut ? 0 : 1;
        }
        if (this.textureDirty) {
            this.texture.needsUpdate = true;
            this.textureDirty = false;
            this.done.uploads++;
        }
    }

    /**
     * A part or a sash in its material's mesh, or drawn by itself. Its meshes'
     * layers are set again each time anything about it changes, whichever
     * way it goes: a room shown live gives a mesh back with the layers it
     * took it with (LiveRoom.giveBack), which a part opened meanwhile has no
     * more.
     */
    place(entry) {
        const wanted = this.enabled && entry.shut && !entry.live && entry.lit;
        for (const mesh of entry.meshes) {
            const mask = wanted ? REAL_MASK : 1;
            if (mesh.layers.mask !== mask) mesh.layers.mask = mask;
        }
        // A part merged whole is hidden as a whole besides: each of the frame's three renders of the scene passes it over
        // at its node, not mesh by mesh (rays do not ask what is shown: the crosshair still aims at it).
        if (entry.whole && entry.node.visible === wanted) entry.node.visible = !wanted;
        // ...and, in, what moves of it held still, and passed over: neither its frame worked out again nor it and what is
        // under it so much as visited at each of the frame's renders (SceneBuilder.holdStill) — its world matrix brought up to
        // date as it goes in, where it is shut. Lifted out, it moves again, and three takes its frame from where it is.
        for (const node of entry.moves) {
            if (node.matrixAutoUpdate !== wanted) continue;
            node.matrixAutoUpdate = node.matrixWorldAutoUpdate = !wanted;
            if (!wanted) continue;
            node.updateMatrix();
            node.updateWorldMatrix(false, true);
        }
        if (wanted === entry.in) return;
        // (A sash going in or out: its window's to look at again — whether the sash is left anything to draw, update.)
        if (entry.sash) {
            const glass = this.windowOf?.get(entry.sash);
            if (glass) glass.stale = true;
        }
        entry.in = wanted;
        if (!wanted) this.done.lifted++;
        for (const bucket of entry.buckets) this.dirty.add(bucket);
    }

    /**
     * The floors drawn (World/BirdView.js's showFloor): `shown(level)`
     * whether the parts on a floor are, or null for every floor — each
     * mesh's index written again with those alone, as a part going in or
     * coming out writes it.
     *
     * @param {((level: number) => boolean)|null} shown
     */
    showFloors(shown) {
        this.floorShown = shown;
        for (const bucket of this.buckets) this.dirty.add(bucket);
        this.update();
    }

    /** A mesh's index again: the triangles of the parts in it now, on the floors drawn (showFloors). */
    index(bucket) {
        const index = bucket.geometry.index;
        const array = index.array;
        const whole = bucket.whole;
        const shown = this.floorShown;
        let n = 0;
        for (const { entry, level, start, count } of bucket.ranges) {
            if (!entry.in || (shown && !shown(level))) continue;
            array.set(whole.subarray(start, start + count), n);
            n += count;
        }
        bucket.geometry.setDrawRange(0, n);
        index.needsUpdate = true;
        const mesh = bucket.mesh;
        // Drawn, with nothing in it, it would still be a draw: on no layer at all then — whether it is shown is the bird's-eye view's (`visible`).
        mesh.layers.mask = n ? 1 : 0;
        if (n && mesh.material !== bucket.material) mesh.material = bucket.material;
        this.done.indexes++;
    }

    /**
     * A look's mesh, made with the rest — on no layer until a part is put
     * in it, and wearing its material only once that is made, when the
     * parts' light is known (lightPart, tintPart). Of every floor, it is
     * not one the bird's-eye view shows and hides by its floor as it does
     * what is drawn live (`floors`: World/BirdView.js's looseMeshes passes
     * it over); its index has the floors shown (showFloors).
     */
    make(bucket) {
        const mesh = new THREE.Mesh(bucket.geometry, bucket.material ?? bucket.source);
        mesh.name = `shut:${bucket.source.name || bucket.source.type}`;
        mesh.userData = { shut: true, floors: true };
        mesh.castShadow = bucket.cast;
        mesh.receiveShadow = bucket.receive;
        mesh.matrixAutoUpdate = false;
        mesh.layers.mask = 0;
        this.group.add(mesh);
        bucket.mesh = mesh;
    }

    /**
     * A part's light from the probes, as ProbeLight.update has just given
     * it (`entry`: its six ways' `cube`, its `sun` and its reflections'
     * `factor`): its row of the light, and — the first time a part of a
     * mesh is lit — that mesh's material, made as `probes` dresses each
     * part (ProbeLight.batchMaterial) from what it wears undressed.
     */
    lightPart(part, { cube, sun, factor }, probes) {
        const entry = this.byNode.get(part.node);
        if (!entry || entry.row < 0) return;
        const data = this.texture.image.data;
        const at = this.texel(entry.row);
        for (let f = 0; f < 6; f++) {
            data[at + f * 4] = cube[f].x;
            data[at + f * 4 + 1] = cube[f].y;
            data[at + f * 4 + 2] = cube[f].z;
        }
        data[at + 3] = sun.value;
        data[at + 7] = factor;
        this.textureDirty = true;
        if (entry.lit) return;
        entry.meshes.forEach((mesh, m) => {
            const bucket = entry.bucketOf[m];
            if (bucket.material) return;
            bucket.material = probes.batchMaterial(probes.undressed.get(mesh) ?? mesh.material, this.uniforms);
        });
        entry.lit = entry.bucketOf.every((bucket) => bucket.material);
        entry.stale = true;
    }

    /**
     * A part's light as the doors' probes give it, drawn from the bake
     * without the probes (SceneBuilder.tintOpenables: `light`, its colour):
     * its row of the light, and — the first time a part of a mesh is tinted
     * — that mesh's material, a copy of the part's as tinted (`mesh`'s now)
     * whose glow is its row's (tintByPart).
     */
    tintPart(part, light) {
        const entry = this.byNode.get(part.node);
        if (!entry || entry.row < 0) return;
        const data = this.texture.image.data;
        const at = this.texel(entry.row);
        data[at] = light.r;
        data[at + 1] = light.g;
        data[at + 2] = light.b;
        this.textureDirty = true;
        if (entry.lit) return;
        entry.meshes.forEach((mesh, m) => {
            const bucket = entry.bucketOf[m];
            if (bucket.material || bucket.lit !== "tint") return;
            const tinted = mesh.material;
            if (!tinted?.userData?.bakedTint) return;
            const material = tinted.clone();
            // Its glow the part's light times its own colour: the colour here, the light its row's.
            material.emissive.copy(tinted.userData.baseColor).multiplyScalar(0.85);
            tintByPart(material, this.uniforms);
            bucket.material = material;
            // (What it reflects, and how strongly, kept as the sky keeps the tinted parts' — Sky.share: update.)
            bucket.tinted = mesh;
        });
        entry.lit = entry.bucketOf.every((bucket) => bucket.material);
        entry.stale = true;
    }

    /** Where a row's first texel's first number is, in the texture's data. */
    texel(row) {
        const column = Math.floor(row / this.rows);
        const y = row - column * this.rows;
        return (y * this.texture.image.width + column * 6) * 4;
    }

    /** Whether every part and sash has its light, and so wears what it is drawn by lifted out (prepareOwn). */
    allLit() {
        return this.entries.every((entry) => entry.lit);
    }

    /**
     * The shaders of what the parts and sashes are drawn by lifted out —
     * their own materials, which nothing draws while they are merged — made
     * ahead, a few at a time between frames (Renderer.build, `renderer`),
     * once every part has its light (a part's material is dressed as it is
     * lit). Before they were merged, three made them as their room first came
     * into sight; merged, the first of a material drawn nowhere else to be
     * opened made its program in the frame it began to move (the A3
     * kitchen's: three, a frame of 102 ms). One mesh a program (`unseen`):
     * meshes drawn by one program for one lighting are drawn by one for any
     * other, the lights being the same for all — so a light coming in later
     * makes theirs again by these (Renderer.buildFor), and so does a change
     * of the day's (SceneBuilder: `again`, these alone).
     */
    prepareOwn(renderer, camera, again = false) {
        if (this.preparing || !renderer?.renderer || !camera) return this.preparing;
        if (again && !this.unseen) return null;
        const run = async () => {
            if (!again) this.unseen = await this.oneEach(renderer, camera);
            if (!this.unseen.length || !this.entries.length) return;
            await renderer.build(this.unseen, [], camera, (some, on) => this.around(some, on), 1, true);
        };
        this.preparing = run()
            .catch((error) => console.warn("The doors' and drawers' own shaders could not be built ahead", error))
            .finally(() => (this.preparing = null));
        return this.preparing;
    }

    /** One of the merged meshes for each program they are drawn by, as three keys them now — a few dozen at a time between frames. */
    async oneEach(renderer, camera) {
        const gl = renderer.renderer;
        const properties = gl.properties;
        const meshes = this.entries.flatMap((entry) => entry.meshes);
        const programs = new Set();
        const unseen = [];
        for (let next = 0; next < meshes.length; ) {
            // (Keyed as they are drawn: through post-processing, into its own picture — as Renderer.build does.)
            const previous = gl.getRenderTarget();
            gl.setRenderTarget(renderer.post?.ao.beautyRenderTarget ?? null);
            const until = performance.now() + PREPARE_SLICE;
            try {
                while (next < meshes.length && performance.now() < until) {
                    const some = meshes.slice(next, (next += 24));
                    // three's `compile` takes the lights from the scene and the materials from what it is given.
                    gl.compile({ traverseVisible() {}, traverse: (visit) => some.forEach(visit) }, camera, renderer.scene);
                    for (const mesh of some) {
                        const program = properties.get(mesh.material).currentProgram;
                        if (!program || programs.has(program)) continue;
                        programs.add(program);
                        unseen.push(mesh);
                    }
                }
            } finally {
                gl.setRenderTarget(previous);
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return unseen;
    }

    /**
     * Some of the merged meshes shown for their turn to be drawn ahead
     * (Renderer.build's `around`, `on`), and as they were after: a part
     * merged whole is hidden at its node, and one out of the view would be
     * passed over by the camera's frustum.
     */
    around(some, on) {
        for (const mesh of some) {
            const entry = this.entryOf.get(mesh);
            if (!entry) continue;
            if (on) {
                mesh.userData.shutAhead = { node: entry.node.visible, group: entry.sash?.group.visible, culled: mesh.frustumCulled };
                entry.node.visible = true;
                if (entry.sash) entry.sash.group.visible = true;
                mesh.frustumCulled = false;
            } else if (mesh.userData.shutAhead) {
                entry.node.visible = mesh.userData.shutAhead.node;
                if (entry.sash) entry.sash.group.visible = mesh.userData.shutAhead.group;
                mesh.frustumCulled = mesh.userData.shutAhead.culled;
                delete mesh.userData.shutAhead;
            }
        }
    }

    /** With every shut part and sash in its material's mesh, or none (for comparing): each drawn as itself. */
    setEnabled(on) {
        this.enabled = Boolean(on);
        for (const entry of this.entries) entry.stale = true;
        for (const glass of this.windows) glass.stale = true;
        for (const inside of this.enclosed) inside.stale = true;
        this.update();
    }

    /** What there is, for measuring. */
    stats() {
        let inside = 0;
        let meshes = 0;
        for (const entry of this.entries) {
            if (!entry.in) continue;
            inside++;
            meshes += entry.meshes.length;
        }
        return {
            enabled: this.enabled,
            light: this.light,
            parts: this.entries.filter((entry) => entry.part).length,
            sashes: this.entries.filter((entry) => entry.sash).length,
            in: inside,
            meshes,
            buckets: this.buckets.length,
            drawn: this.buckets.filter((bucket) => bucket.mesh && bucket.geometry.drawRange.count > 0).length,
            windows: this.windows.length,
            glazed: this.windows.filter((glass) => glass.merged).length,
            ...this.done,
        };
    }

    dispose() {
        for (const entry of this.entries) {
            for (const mesh of entry.meshes) mesh.layers.mask = 1;
            for (const node of entry.moves) node.matrixAutoUpdate = node.matrixWorldAutoUpdate = true;
            if (entry.whole) entry.node.visible = true;
            if (entry.sash) entry.sash.group.visible = true;
        }
        for (const bucket of this.buckets) {
            bucket.geometry?.dispose();
            if (bucket.material && bucket.material !== bucket.source) bucket.material.dispose();
        }
        for (const glass of this.windows) {
            for (const pane of glass.panes) pane.layers.mask = 1;
            glass.mesh.geometry.dispose();
        }
        for (const { mesh, live } of this.enclosed) {
            if (!live) mesh.layers.mask = 1;
            delete mesh.userData.shutIn;
        }
        this.enclosed = [];
        this.texture.dispose();
        this.group.removeFromParent();
        this.entryOf.clear();
        this.unseen = null;
        this.entries = [];
        this.buckets = [];
        this.windows = [];
    }
}

const LIT = ["isMeshStandardMaterial", "isMeshLambertMaterial", "isMeshPhongMaterial"];

/**
 * Whether a part's mesh can be drawn by its material's: a plain mesh of one
 * material, which three neither sorts (see-through) nor draws a way of its
 * own (skinned, morphed, instanced, a draw range, a render order).
 */
function mergeable(mesh) {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.userData?.helper) return false;
    const material = mesh.material;
    if (!material || Array.isArray(material) || material.transparent || material.transmission > 0 || material.visible === false || material.wireframe) return false;
    const geometry = mesh.geometry;
    if (!geometry?.attributes.position || !geometry.attributes.normal || Object.keys(geometry.morphAttributes).length) return false;
    if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
    return mesh.renderOrder === 0 && mesh.frustumCulled;
}

/**
 * A tinted part's material (SceneBuilder.tintOpenables) for many parts
 * drawn as one mesh: its glow — its own colour times its light from the
 * doors' probes — times the light its row has (`partRow`; the first texel's
 * colour), where each part's own material had it multiplied in already.
 */
export function tintByPart(material, light) {
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.partLight = light.texture;
        shader.uniforms.partRows = light.rows;
        shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${PART_TINT_VERTEX}`).replace("#include <begin_vertex>", "#include <begin_vertex>\n\treadPartTint();");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nflat varying vec3 vPartTint;")
            .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vPartTint;");
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|part-tint`;
    material.needsUpdate = true;
}

/** Its row's light, read where its vertices are drawn and handed on unchanged (as ProbeLight's PART_ROW_VERTEX). */
const PART_TINT_VERTEX = /* glsl */ `
attribute float partRow;
uniform highp sampler2D partLight;
uniform int partRows;
flat varying vec3 vPartTint;
void readPartTint() {
	int part = int( partRow + 0.5 );
	int column = part / partRows;
	vPartTint = texelFetch( partLight, ivec2( column * 6, part - column * partRows ), 0 ).rgb;
}
`;

/** Whether the link asks for the parts drawn one by one (`?shut=0`). */
function shutWanted() {
    if (typeof window === "undefined") return true;
    const asked = new URL(window.location.href).searchParams.get("shut");
    return asked === null || (asked !== "0" && asked !== "false" && asked !== "off");
}

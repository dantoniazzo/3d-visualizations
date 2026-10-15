// Z-fighting finder. Load in a page of the app (the walkthrough keeps each
// wall, slab and piece its own mesh, so the walkthrough names them best):
//   await eval(await (await fetch("http://127.0.0.1:3199/zfight.js")).text());
//   const found = window.__zfight({ minArea: 0.004 });
// In an editor tab it first sets the view's scope to All for the page: the
// editor opens with the houses alone drawn (World/Scope.js), the cars, a
// site's far ground and the neighbourhood hidden, and a hidden mesh is not
// tested. (Light does not matter to it: the plain light will do.)
// Under that plain light the editor draws the house and the furniture by
// stand-ins (World/StandIns.js: merged and instanced copies under the
// scene's "stand-ins" group), the real meshes still `visible` on a layer no
// camera draws. This reads the real meshes, as before, and passes the
// stand-ins over: left in, every surface is found fighting its own copy
// (Wrenfield, 2026-10-14: 552 of 615 clusters, 4,948 m²).
// Every visible mesh's triangles (trees, grass, hedges, the sky left out)
// are hashed by their plane — facing the same way, within `gap` metres —
// and pairs from different surfaces (another mesh, or another material)
// whose overlap within the plane is over `minArea` m² are clipped and
// gathered into clusters by place and material pair: where two surfaces
// draw to the same depth and flicker against each other.
(() => {
    const SKIP = /sky-dome|flora|hedge|grass|blade|tuft|tree|leaves|bark|lawn-shells|shadow|helper/i;
    const v = (x, y, z) => ({ x, y, z });
    const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
    const cross = (a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const len = (a) => Math.hypot(a.x, a.y, a.z);

    /** The polygon of `subject` (2D points) inside convex `clip`, both counter-clockwise. */
    function clipPolygon(subject, clip) {
        let out = subject;
        for (let i = 0; i < clip.length && out.length; i++) {
            const a = clip[i];
            const b = clip[(i + 1) % clip.length];
            const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9;
            const cut = (p, q) => {
                const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
                const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
                const t = d1 / (d1 - d2);
                return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
            };
            const input = out;
            out = [];
            for (let j = 0; j < input.length; j++) {
                const p = input[j];
                const q = input[(j + 1) % input.length];
                if (inside(q)) {
                    if (!inside(p)) out.push(cut(p, q));
                    out.push(q);
                } else if (inside(p)) out.push(cut(p, q));
            }
        }
        return out;
    }
    const area2 = (poly) => {
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
            const [x1, y1] = poly[i];
            const [x2, y2] = poly[(i + 1) % poly.length];
            s += x1 * y2 - x2 * y1;
        }
        return s / 2;
    };
    const ccw = (poly) => (area2(poly) < 0 ? poly.slice().reverse() : poly);

    window.__zfight = ({ minArea = 0.004, gap = 0.004, root = window.experience.scene, skip = SKIP, limit = 400, sameLook = true } = {}) => {
        // Everything shown, whatever the editor's scope leaves out (World/Scope.js); a public view has no scope.
        window.experience.world?.scope?.set("all", { remember: false });
        const tris = [];
        const p = [v(0, 0, 0), v(0, 0, 0), v(0, 0, 0)];
        let meshIndex = 0;
        root.updateMatrixWorld(true);
        root.traverse((node) => {
            if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh) return;
            // The editor's stand-ins are copies of what is tested already (World/StandIns.js marks each).
            if (node.userData?.standIn) return;
            for (let q = node; q; q = q.parent) if (!q.visible) return;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            const names = materials.map((m) => m?.name || "");
            if (skip.test(node.name) || names.some((n) => skip.test(n))) return;
            if (materials.every((m) => m && (m.opacity === 0 || m.visible === false || m.colorWrite === false))) return;
            const geometry = node.geometry;
            const position = geometry.attributes.position;
            if (!position) return;
            const index = geometry.index;
            const count = index ? index.count : position.count;
            const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
            const e = node.matrixWorld.elements;
            const world = (i, out) => {
                const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
                out.x = e[0] * x + e[4] * y + e[8] * z + e[12];
                out.y = e[1] * x + e[5] * y + e[9] * z + e[13];
                out.z = e[2] * x + e[6] * y + e[10] * z + e[14];
            };
            const id = meshIndex++;
            const label = `${node.name || node.type}${node.userData?.id ? ` #${node.userData.id}` : ""}`;
            for (const group of groups) {
                const material = materials[group.materialIndex ?? 0];
                if (!material || material.visible === false) continue;
                const side = material.side;
                for (let t = group.start; t < group.start + group.count; t += 3) {
                    for (let k = 0; k < 3; k++) world(index ? index.getX(t + k) : t + k, p[k]);
                    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
                    const twice = len(n);
                    if (twice < 2e-4) continue;
                    n.x /= twice; n.y /= twice; n.z /= twice;
                    tris.push({
                        mesh: id, label, material: material.name || material.type, side,
                        // A depth offset decides between two surfaces that have different ones.
                        offset: material.polygonOffset ? `${material.polygonOffsetFactor},${material.polygonOffsetUnits}` : "0,0",
                        textured: Boolean(material.map || material.normalMap),
                        n: v(n.x, n.y, n.z), d: dot(n, p[0]),
                        a: v(p[0].x, p[0].y, p[0].z), b: v(p[1].x, p[1].y, p[1].z), c: v(p[2].x, p[2].y, p[2].z),
                    });
                }
            }
        });

        // Buckets by direction and plane; within a bucket a 1 m grid in the plane.
        const qn = (n) => `${Math.round(n.x * 40)},${Math.round(n.y * 40)},${Math.round(n.z * 40)}`;
        const buckets = new Map();
        for (const t of tris) {
            const key = `${qn(t.n)}|${Math.round(t.d / gap)}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(t);
        }
        const clusters = new Map();
        let pairs = 0;
        const axes = (n) => {
            const helper = Math.abs(n.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
            const u = cross(helper, n);
            const lu = len(u);
            u.x /= lu; u.y /= lu; u.z /= lu;
            return [u, cross(n, u)];
        };
        for (const [key, list] of buckets) {
            const [dirKey, planeKey] = key.split("|");
            // Neighbouring plane bins too, so a pair either side of a bin edge is found.
            const near = [list, ...[-1, 1].map((o) => buckets.get(`${dirKey}|${Number(planeKey) + o}`) ?? [])];
            const [u, w] = axes(list[0].n);
            const to2 = (t) => ccw([t.a, t.b, t.c].map((q) => [dot(q, u), dot(q, w)]));
            const grid = new Map();
            const cellsOf = (poly) => {
                const xs = poly.map((q) => q[0]);
                const ys = poly.map((q) => q[1]);
                const out = [];
                for (let x = Math.floor(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x++)
                    for (let y = Math.floor(Math.min(...ys)); y <= Math.floor(Math.max(...ys)); y++) out.push(`${x},${y}`);
                return out;
            };
            for (const t of near[1].concat(near[2])) {
                t._p = t._p ?? to2(t);
            }
            for (const t of list) {
                t._p = t._p ?? to2(t);
                for (const cell of cellsOf(t._p)) {
                    if (!grid.has(cell)) grid.set(cell, []);
                    grid.get(cell).push(t);
                }
            }
            const others = near[1].concat(near[2]);
            // Each pair is met from both sides (and from both of two plane
            // bins): the areas are halved at the end.
            const consider = (t, o) => {
                if (t === o) return;
                if (t.mesh === o.mesh && t.material === o.material) return;
                // The same plain colour either way draws the same (a textured one,
                // mapped per panel, still shimmers); an offset that differs settles it.
                if (sameLook && t.material === o.material && !t.textured) return;
                if (t.offset !== o.offset) return;
                if (Math.abs(t.d - o.d) > gap) return;
                const overlap = clipPolygon(t._p, o._p);
                if (overlap.length < 3) return;
                const area = Math.abs(area2(overlap));
                if (area < 1e-5) return;
                pairs++;
                const [m1, m2] = [t, o].sort((x, y) => (x.label + x.material < y.label + y.material ? -1 : 1));
                // The same place whichever of the two is met first.
                const cx = (t.a.x + t.b.x + t.c.x + o.a.x + o.b.x + o.c.x) / 6;
                const cy = (t.a.y + t.b.y + t.c.y + o.a.y + o.b.y + o.c.y) / 6;
                const cz = (t.a.z + t.b.z + t.c.z + o.a.z + o.b.z + o.c.z) / 6;
                const ckey = `${m1.label}|${m1.material}|${m2.label}|${m2.material}|${Math.round(cx / 2)},${Math.round(cy / 2)},${Math.round(cz / 2)}`;
                const c = clusters.get(ckey) ?? { a: `${m1.label} [${m1.material}]`, b: `${m2.label} [${m2.material}]`, area: 0, min: v(Infinity, Infinity, Infinity), max: v(-Infinity, -Infinity, -Infinity), normal: [t.n.x, t.n.y, t.n.z].map((x) => +x.toFixed(2)), gap: 0 };
                c.area += area;
                c.gap = Math.max(c.gap, Math.abs(t.d - o.d));
                for (const q of [t.a, t.b, t.c]) {
                    c.min.x = Math.min(c.min.x, q.x); c.min.y = Math.min(c.min.y, q.y); c.min.z = Math.min(c.min.z, q.z);
                    c.max.x = Math.max(c.max.x, q.x); c.max.y = Math.max(c.max.y, q.y); c.max.z = Math.max(c.max.z, q.z);
                }
                clusters.set(ckey, c);
            };
            for (const t of list) {
                const candidates = new Set();
                for (const cell of cellsOf(t._p)) for (const o of grid.get(cell) ?? []) candidates.add(o);
                for (const o of candidates) consider(t, o);
            }
            // Against the neighbouring plane bins (a pair straddling a bin edge).
            if (others.length) {
                const ogrid = new Map();
                for (const o of others) for (const cell of cellsOf(o._p)) {
                    if (!ogrid.has(cell)) ogrid.set(cell, []);
                    ogrid.get(cell).push(o);
                }
                for (const t of list) {
                    const candidates = new Set();
                    for (const cell of cellsOf(t._p)) for (const o of ogrid.get(cell) ?? []) candidates.add(o);
                    for (const o of candidates) consider(t, o);
                }
            }
        }
        const out = [...clusters.values()]
            .map((c) => ({ ...c, area: +(c.area / 2).toFixed(4), min: [c.min.x, c.min.y, c.min.z].map((x) => +x.toFixed(2)), max: [c.max.x, c.max.y, c.max.z].map((x) => +x.toFixed(2)), gap: +c.gap.toFixed(4) }))
            .filter((c) => c.area >= minArea)
            .sort((a, b) => b.area - a.area);
        for (const t of tris) delete t._p;
        return { triangles: tris.length, pairs, clusters: out.length, list: out.slice(0, limit) };
    };
    return "zfight ready";
})();

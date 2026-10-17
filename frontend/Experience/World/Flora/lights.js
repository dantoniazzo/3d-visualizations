import * as THREE from "three";

import { LOW_POWER, QUALITY } from "../../Utils/device.js";

/**
 * The garden's lights for the evening (shared/landscape.js's `lights`):
 * uplights in the ground under the olives, washing their trunks and
 * crowns warm; downlights under the pergolas; little step lights up the
 * outside stairs; and the pool lit from under the water. Each a small
 * fitting that glows, and — the uplights, the downlights and the pool —
 * a light of its own. Off by day.
 *
 * Of those lights only a few shine at once: the ones nearest the visitor,
 * as many as the slider's step allows (Utils/device.js's `garden`: so many
 * spotlights, so many point lights). Every lit pixel of everything drawn
 * live is worked out for each light there is, near it or not — a garden's
 * sixteen cost a view lit live 25 ms of every frame at night, and one
 * drawn from its bake 4 to 6, on the trees, the cars and the glass alone
 * — and none reaches further than 9 m. The rest are their glowing
 * fittings, and are handed a light as the visitor comes near: the one
 * given up fades out, the one taken on fades in. Those not shining are
 * out of three's light state altogether (hidden), and there are always as
 * many in it — so no shader is ever built again as the visitor walks.
 */
const WARM = "#ffcf94";
/** How long a garden light takes to fade out, and the next to fade in, in seconds. */
const FADE = 0.35;
/** How often, in seconds, the lights are handed round again. */
const REASSIGN = 0.25;
/** A light that is shining keeps shining unless another is this many metres nearer the visitor. */
const HOLD = 1.5;

const _at = new THREE.Vector3();

export class GardenLights {
    constructor(lights, pools, planters = [], parapets = []) {
        this.group = new THREE.Group();
        this.group.name = "garden-lights";
        this.group.visible = false;
        this.lamps = [];
        const glow = new THREE.MeshStandardMaterial({ color: "#2b2b2b", emissive: WARM, emissiveIntensity: 0, roughness: 0.4 });
        glow.name = "garden-light";
        this.glow = glow;
        const fittings = [];
        for (const light of lights) {
            const [x, y, z] = light.position;
            if (light.type === "uplight") {
                const spot = new THREE.SpotLight(WARM, 0, 9, 0.55, 0.85, 1.6);
                spot.position.set(x, y + 0.08, z);
                spot.target.position.set(...light.target);
                this.group.add(spot, spot.target);
                this.lamps.push({ light: spot, intensity: 26, kind: "spots" });
                fittings.push(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12).translate(x, y + 0.015, z));
            } else if (light.type === "downlight") {
                const point = new THREE.PointLight(WARM, 0, 7, 1.7);
                point.position.set(x, y - 0.2, z);
                this.group.add(point);
                this.lamps.push({ light: point, intensity: 7, kind: "points" });
                fittings.push(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12).translate(x, y - 0.12, z));
            } else if (light.type === "step") {
                fittings.push(new THREE.BoxGeometry(0.12, 0.04, 0.02).translate(x, y, z));
            }
        }
        // LED strips under the planters' copings on the roof terraces, as
        // the developer's dusk render has them: a line of light along each
        // long side, just under the top, glowing (bloom) onto the gravel.
        const strips = [];
        /** The lowest any of them runs at: the floor they go with, seen from above (showUpTo). */
        this.stripsFrom = Infinity;
        for (const planter of planters) {
            const y = planter.base + planter.height - 0.035;
            this.stripsFrom = Math.min(this.stripsFrom, planter.base);
            for (let i = 0; i < planter.path.length - 1; i++) {
                const [a, b] = [planter.path[i], planter.path[i + 1]];
                const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
                if (length < 0.3) continue;
                const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
                const nx = -Math.sin(angle);
                const nz = Math.cos(angle);
                for (const side of [-1, 1]) {
                    const out = (planter.width / 2 + 0.012) * side;
                    const strip = new THREE.BoxGeometry(length, 0.012, 0.012);
                    strip.rotateY(-angle);
                    strip.translate((a[0] + b[0]) / 2 + nx * out, y, (a[1] + b[1]) / 2 + nz * out);
                    strips.push(strip);
                }
            }
        }
        // ...and along the inner face of the roof terraces' parapets, under
        // their copings, washing the terrace floor.
        for (const wall of parapets) {
            const [a, b] = [wall.start, wall.end];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const nx = -Math.sin(angle) * wall.side;
            const nz = Math.cos(angle) * wall.side;
            const out = wall.thickness / 2 + 0.012;
            const strip = new THREE.BoxGeometry(Math.max(0.1, length - wall.thickness), 0.012, 0.012);
            strip.rotateY(-angle);
            strip.translate((a[0] + b[0]) / 2 + nx * out, wall.base + wall.height - 0.06, (a[1] + b[1]) / 2 + nz * out);
            strips.push(strip);
            this.stripsFrom = Math.min(this.stripsFrom, wall.base);
        }
        if (strips.length) {
            const led = new THREE.MeshBasicMaterial({ color: "#ffd9a6", toneMapped: true });
            led.name = "led-strip";
            this.led = led;
            const mesh = new THREE.Mesh(mergeAll(strips), led);
            mesh.name = "planter-led-strips";
            this.strips = mesh;
            this.group.add(mesh);
        }
        if (fittings.length) {
            const geometry = mergeAll(fittings);
            const mesh = new THREE.Mesh(geometry, glow);
            mesh.name = "garden-light-fittings";
            this.fittings = mesh;
            this.group.add(mesh);
        }
        // The pools, lit from under the water.
        for (const pool of pools) {
            const [x0, z0, x1, z1] = pool.box;
            const light = new THREE.PointLight("#5fe3ff", 0, 9, 1.5);
            light.position.set((x0 + x1) / 2, pool.level - 0.5, (z0 + z1) / 2);
            this.group.add(light);
            this.lamps.push({ light, intensity: 18, kind: "points" });
        }
        if (LOW_POWER) for (const lamp of this.lamps) lamp.intensity *= 0.8;
        // None shines until it is handed one of the few lights there are (hand).
        for (const lamp of this.lamps) lamp.light.visible = false;
        this.on = false;
        this.timer = 0;
        this.setBudget(QUALITY.garden);
    }

    /**
     * How many of the lights shine at once, of each kind (the slider's
     * step): its places, each for one light at a time. Changed, the shaders
     * are built again once, for the new number.
     */
    setBudget(budget = { spots: 2, points: 2 }) {
        if (this.budget?.spots === budget.spots && this.budget?.points === budget.points) return;
        this.budget = { spots: budget.spots, points: budget.points };
        for (const lamp of this.lamps) {
            lamp.light.visible = false;
            lamp.light.intensity = 0;
        }
        /** Each place: the lamp shining from it, the one to follow, and how far the fade is. */
        this.places = [];
        for (const kind of ["spots", "points"]) {
            const most = Math.min(budget[kind], this.lamps.filter((lamp) => lamp.kind === kind).length);
            for (let k = 0; k < most; k++) this.places.push({ kind, lamp: null, next: null, level: 0 });
        }
        this.timer = 0;
        this.where = null;
    }

    /**
     * The lights handed to the lamps nearest `point` — where the visitor
     * is — and faded: before each frame, at night.
     *
     * @param {number} delta  seconds since the last
     * @param {THREE.Vector3} point
     */
    update(delta, point) {
        if (!this.on) return;
        this.timer -= delta;
        if (this.timer <= 0) {
            this.timer = REASSIGN;
            this.hand(point);
        }
        const step = delta / FADE;
        for (const place of this.places) {
            if (place.next !== place.lamp) {
                // The one it has out first, then the next in its place — one for one, at nothing.
                place.level = Math.max(0, place.level - step);
                if (place.level > 0 && place.lamp) {
                    place.lamp.light.intensity = place.lamp.intensity * place.level;
                    continue;
                }
                if (place.lamp) {
                    place.lamp.light.visible = false;
                    place.lamp.light.intensity = 0;
                }
                place.lamp = place.next;
                place.level = 0;
                if (place.lamp) place.lamp.light.visible = true;
            }
            if (!place.lamp) continue;
            place.level = Math.min(1, place.level + step);
            place.lamp.light.intensity = place.lamp.intensity * place.level;
        }
    }

    /** Which lamps are to shine: of each kind, the nearest to `point` — each place keeping its own unless another is clearly nearer. */
    hand(point, atOnce = false) {
        this.where = (this.where ?? new THREE.Vector3()).copy(point);
        for (const kind of ["spots", "points"]) {
            const places = this.places.filter((place) => place.kind === kind);
            if (!places.length) continue;
            const ranked = this.lamps
                .filter((lamp) => lamp.kind === kind)
                .map((lamp) => ({ lamp, distance: lamp.light.getWorldPosition(_at).distanceTo(point) }))
                .sort((a, b) => a.distance - b.distance);
            const distance = new Map(ranked.map((entry) => [entry.lamp, entry.distance]));
            // Those shining (or about to) stay; each of the nearest not among them takes the place of the farthest that is, if clearly nearer.
            const kept = places.map((place) => place.next);
            for (const { lamp, distance: near } of ranked.slice(0, places.length)) {
                if (kept.includes(lamp)) continue;
                let far = kept.indexOf(null);
                if (far < 0) {
                    far = 0;
                    for (let k = 1; k < kept.length; k++) if (distance.get(kept[k]) > distance.get(kept[far])) far = k;
                    if (!(distance.get(kept[far]) > near + HOLD)) continue;
                }
                kept[far] = lamp;
            }
            // A lamp still shining from a place — on its way out, when the
            // visitor comes straight back — stays that place's: given to
            // another, the one would put it out just as the other lit it,
            // and it would be held, dark, with one light fewer in the scene.
            places.forEach((place, k) => {
                const at = place.lamp ? kept.indexOf(place.lamp) : -1;
                if (at >= 0 && at !== k) [kept[k], kept[at]] = [kept[at], kept[k]];
            });
            places.forEach((place, k) => (place.next = kept[k]));
        }
        if (!atOnce) return;
        for (const place of this.places) {
            if (place.lamp && place.lamp !== place.next) {
                place.lamp.light.visible = false;
                place.lamp.light.intensity = 0;
            }
            place.lamp = place.next;
            place.level = place.lamp ? 1 : 0;
            if (!place.lamp) continue;
            place.lamp.light.visible = true;
            place.lamp.light.intensity = place.lamp.intensity;
        }
    }

    /**
     * The roof terraces' light strips only with a floor a view from above
     * shows them on (Flora.showUpTo): `shows` says whether what is at a
     * height is on one; `null`, as ever.
     */
    showUpTo(shows) {
        if (this.strips) this.strips.visible = !shows || shows(this.stripsFrom);
    }

    /**
     * On at night, off by day. Coming on, the lights are where the visitor
     * is (`point`) at once — nothing fades in with the dusk. Going off,
     * every one is put out and handed back, not only hidden with the group:
     * left shining in it, the few that shone at night stayed lit by day
     * (Ladonia, after night and back: five) to anything that asks a light
     * rather than its parents — three leaves a hidden group's lights out
     * of a frame, so nothing was lit by them, but they were counted as
     * shining.
     */
    set(on, point = this.where) {
        this.on = on;
        this.group.visible = on;
        this.glow.emissiveIntensity = on ? 6 : 0;
        // Bright enough to bloom; drawn only at night (the group).
        // A warm glow along the edge, not a bright white line.
        this.led?.color.set("#ffb873").multiplyScalar(on ? 1.7 : 0);
        if (on) {
            this.hand(point ?? _at.set(0, 0, 0), true);
            return;
        }
        for (const place of this.places) {
            place.lamp = place.next = null;
            place.level = 0;
        }
        for (const lamp of this.lamps) {
            lamp.light.visible = false;
            lamp.light.intensity = 0;
        }
    }

    dispose() {
        this.fittings?.geometry.dispose();
        this.strips?.geometry.dispose();
        this.led?.dispose();
        this.glow.dispose();
        for (const { light } of this.lamps) light.dispose();
    }
}

function mergeAll(geometries) {
    const positions = [];
    const normals = [];
    for (const g of geometries) {
        const flat = g.index ? g.toNonIndexed() : g;
        positions.push(...flat.attributes.position.array);
        normals.push(...flat.attributes.normal.array);
        g.dispose();
        if (flat !== g) flat.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
}

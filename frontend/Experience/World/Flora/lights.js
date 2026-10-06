import * as THREE from "three";

import { LOW_POWER } from "../../Utils/device.js";

/**
 * The garden's lights for the evening (shared/landscape.js's `lights`):
 * uplights in the ground under the olives, washing their trunks and
 * crowns warm; downlights under the pergolas; little step lights up the
 * outside stairs; and the pool lit from under the water. Each a small
 * fitting that glows, and — the uplights, the downlights and the pool —
 * a light of its own. Off by day.
 */
const WARM = "#ffcf94";

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
                this.lamps.push({ light: spot, intensity: 26 });
                fittings.push(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12).translate(x, y + 0.015, z));
            } else if (light.type === "downlight") {
                const point = new THREE.PointLight(WARM, 0, 7, 1.7);
                point.position.set(x, y - 0.2, z);
                this.group.add(point);
                this.lamps.push({ light: point, intensity: 7 });
                fittings.push(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12).translate(x, y - 0.12, z));
            } else if (light.type === "step") {
                fittings.push(new THREE.BoxGeometry(0.12, 0.04, 0.02).translate(x, y, z));
            }
        }
        // LED strips under the planters' copings on the roof terraces, as
        // the developer's dusk render has them: a line of light along each
        // long side, just under the top, glowing (bloom) onto the gravel.
        const strips = [];
        for (const planter of planters) {
            const y = planter.base + planter.height - 0.035;
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
            this.lamps.push({ light, intensity: 18 });
        }
        if (LOW_POWER) for (const lamp of this.lamps) lamp.intensity *= 0.8;
    }

    /** On at night, off by day. */
    set(on) {
        this.group.visible = on;
        this.glow.emissiveIntensity = on ? 6 : 0;
        // Bright enough to bloom; drawn only at night (the group).
        // A warm glow along the edge, not a bright white line.
        this.led?.color.set("#ffb873").multiplyScalar(on ? 1.7 : 0);
        for (const { light, intensity } of this.lamps) light.intensity = on ? intensity : 0;
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
